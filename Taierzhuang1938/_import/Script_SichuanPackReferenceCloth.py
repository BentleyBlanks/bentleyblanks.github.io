"""Extract a de-lit cotton material study from the approved imagegen view.

The source reference remains untouched. Straps, garment, patch and overlapping
shoes are masked out before building a material albedo and physical micro-normal.
This is a material study for the Blender surface bake, not a concept lightmap.
"""
import argparse
from pathlib import Path
import json
import numpy as np
from PIL import Image
from Script_BakePbrTexture import GaussianPeriodic,SrgbToLinear,LinearToSrgb


def Main():
    parser=argparse.ArgumentParser();parser.add_argument('--reference',type=Path,required=True);parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args();args.out.mkdir(parents=True,exist_ok=True)
    reference=Image.open(args.reference).convert('RGB')
    if reference.size!=(1774,887):raise ValueError('Reference calibration expects the approved original 1774x887 view')
    box=(77,194,680,695);image=np.asarray(reference.crop(box),dtype=np.float64)/255
    h,w=image.shape[:2];yy,xx=np.mgrid[:h,:w];px=xx+box[0];py=yy+box[1]
    mask=((px>=197)&(px<=247))|((px>=491)&(px<=540))|((py>=333)&(py<=388))|((py>=516)&(py<=572))
    mask|=(px<126)&(py>302)&(py<630)
    mask|=(px>528)&(py<344)
    mask|=(px>550)&(py>570)
    mask=GaussianPeriodic(mask.astype(float),3.0).clip(0,1)[...,None]
    swatch=np.asarray(reference.crop((248,394,484,508)),dtype=np.float64)/255
    tiled=swatch[yy%swatch.shape[0],xx%swatch.shape[1]]
    filled=image*(1-mask)+tiled*mask
    linear=SrgbToLinear(filled);luma=linear.mean(axis=-1)
    illumination=GaussianPeriodic(luma,48)
    albedo=np.clip(linear*(luma.mean()/np.maximum(illumination,1e-4))[...,None]**.65*1.15,0,1)
    encoded=np.rint(LinearToSrgb(albedo)*255).astype(np.uint8)
    Image.fromarray(encoded).resize((1024,1024),Image.Resampling.LANCZOS).save(args.out/'Texture_ReferenceCottonBase.png')
    backBox=(1147,194,1731,695);back=np.asarray(reference.crop(backBox),dtype=np.float64)/255
    bh,bw=back.shape[:2];by,bx=np.mgrid[:bh,:bw];bpx=bx+backBox[0];bpy=by+backBox[1]
    backMask=((bpx>=1263)&(bpx<=1340))|((bpx>=1540)&(bpx<=1620))|((bpy>=335)&(bpy<=394))|((bpy>=517)&(bpy<=571))
    backMask|=(bpx>1690)&(bpy>302)&(bpy<630)
    backMask=GaussianPeriodic(backMask.astype(float),3).clip(0,1)[...,None]
    backSwatch=np.asarray(reference.crop((1350,398,1530,513)),dtype=np.float64)/255
    backFill=backSwatch[by%backSwatch.shape[0],bx%backSwatch.shape[1]]
    backLinear=SrgbToLinear(back*(1-backMask)+backFill*backMask);backLuma=backLinear.mean(axis=-1)
    backAlbedo=np.clip(backLinear*(backLuma.mean()/np.maximum(GaussianPeriodic(backLuma,48),1e-4))[...,None]**.65*1.15,0,1)
    backEncoded=np.rint(LinearToSrgb(backAlbedo)*255).astype(np.uint8)[:,::-1]
    Image.fromarray(backEncoded).resize((1024,1024),Image.Resampling.LANCZOS).save(args.out/'Texture_ReferenceCottonBackBase.png')
    fine=GaussianPeriodic(luma,.7)-GaussianPeriodic(luma,2.5)
    broad=GaussianPeriodic(luma,2.0)-GaussianPeriodic(luma,13)
    fine/=max(float(fine.std()),1e-6);broad/=max(float(broad.std()),1e-6)
    height=.00008*fine+.00045*broad
    gx=np.gradient(height,axis=1)/(.38/w);gy=np.gradient(height,axis=0)/(.30/h)
    normal=np.stack((-gx,gy,np.ones_like(gx)),axis=-1);normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
    channels=[np.asarray(Image.fromarray(normal[...,c].astype(np.float32),'F').resize((1024,1024),Image.Resampling.LANCZOS)) for c in range(3)]
    normal=np.stack(channels,axis=-1);normal/=np.maximum(np.linalg.norm(normal,axis=-1,keepdims=True),1e-6)
    Image.fromarray(np.clip((normal*.5+.5)*255,0,255).astype(np.uint8)).save(args.out/'Texture_ReferenceCottonNormal.png')
    sideBox=(755,194,948,695)
    sideLinear=SrgbToLinear(np.asarray(reference.crop(sideBox),dtype=np.float64)/255)
    sh,sw=sideLinear.shape[:2]
    # Reconstruct cotton underneath the two reference binding passes, while
    # preserving the exposed vertical crease positions between them.
    for top,bottom in ((329,391),(513,576)):
        lo=max(0,top-sideBox[1]);hi=min(sh-1,bottom-sideBox[1])
        for row in range(lo,hi+1):
            amount=(row-lo)/max(1,hi-lo)
            sideLinear[row]=sideLinear[max(0,lo-1)]*(1-amount)+sideLinear[min(sh-1,hi+1)]*amount
    sideLuma=sideLinear.mean(axis=-1)
    sideAlbedo=np.clip(sideLinear*(sideLuma.mean()/np.maximum(GaussianPeriodic(sideLuma,32),1e-4))[...,None]**.65*1.15,0,1)
    Image.fromarray(np.rint(LinearToSrgb(sideAlbedo)*255).clip(0,255).astype(np.uint8)).resize((512,1024),Image.Resampling.LANCZOS).save(args.out/'Texture_ReferenceCottonSideBase.png')
    sideFine=GaussianPeriodic(sideLuma,.6)-GaussianPeriodic(sideLuma,2)
    sideFold=GaussianPeriodic(sideLuma,2)-GaussianPeriodic(sideLuma,10)
    sideHeight=.00010*sideFine/max(float(sideFine.std()),1e-6)+.0012*sideFold/max(float(sideFold.std()),1e-6)
    sx=np.gradient(sideHeight,axis=1)/(.13/sw);sy=np.gradient(sideHeight,axis=0)/(.30/sh)
    sn=np.stack((-sx,sy,np.ones_like(sx)),axis=-1);sn/=np.maximum(np.linalg.norm(sn,axis=-1,keepdims=True),1e-6)
    Image.fromarray(np.rint((sn*.5+.5)*255).clip(0,255).astype(np.uint8)).resize((512,1024),Image.Resampling.LANCZOS).save(args.out/'Texture_ReferenceCottonSideNormal.png')
    patchImage=reference.crop((583,589,644,651));patchImage.save(args.out/'Texture_ReferencePatchBase.png')
    patchLuma=SrgbToLinear(np.asarray(patchImage,dtype=np.float64)/255).mean(axis=-1)
    patchHeight=GaussianPeriodic(patchLuma,.5)-GaussianPeriodic(patchLuma,2)
    patchHeight*=.00006/max(float(patchHeight.std()),1e-6)
    px=np.gradient(patchHeight,axis=1)/(.044/patchHeight.shape[1]);py=np.gradient(patchHeight,axis=0)/(.05/patchHeight.shape[0])
    pn=np.stack((-px,py,np.ones_like(px)),axis=-1);pn/=np.linalg.norm(pn,axis=-1,keepdims=True)
    Image.fromarray(np.rint((pn*.5+.5)*255).clip(0,255).astype(np.uint8)).save(args.out/'Texture_ReferencePatchNormal.png')
    blueRegion=np.asarray(reference.crop((500,190,680,340)),dtype=np.float64)
    blueMask=(blueRegion[...,2]>blueRegion[...,0]+8)&(blueRegion[...,2]>blueRegion[...,1]+3)&(blueRegion[...,0]<110)&(blueRegion[...,2]<140)
    indigoTarget=np.median(blueRegion[blueMask],axis=0)/255
    indigoStudy=Image.open(args.out/'Texture_SichuanBlanketPackBase.webp').convert('RGB').crop((532,532,1004,1004))
    indigoLinear=SrgbToLinear(np.asarray(indigoStudy,dtype=np.float64)/255)
    indigoDetail=np.clip(indigoLinear/np.maximum(GaussianPeriodic(indigoLinear,16),.002),.45,1.65)
    indigoAlbedo=SrgbToLinear(indigoTarget)*1.70*(0.68+0.32*indigoDetail)
    Image.fromarray(np.rint(LinearToSrgb(np.clip(indigoAlbedo,0,1))*255).clip(0,255).astype(np.uint8)).save(args.out/'Texture_ReferenceIndigoBase.png')
    record={'source':str(args.reference),'sourceProvider':'approved built-in imagegen reference','frontPixels':box,'backPixels':backBox,'sidePixels':sideBox,'accessoriesMasked':True,'deLightSigmaPixels':48,'deLightStrength':.65,'physicalCottonExtentM':[.38,.30],'microReliefMeters':[.00008,.00045],'sideReliefMeters':[.00010,.0012],'referenceUnmodified':True}
    record['indigo']={'referenceRegion':[500,190,680,340],'maskedBlueMedianSrgb':np.rint(indigoTarget*255).astype(int).tolist(),'linearAlbedoExposureCompensation':1.70,'tileRepeat':[12,6],'tileExtentM':[1.24/12,.56/6],'process':'Imagegen blue-cloth weave, low-frequency normalization and approved-reference pigment calibration'}
    (args.out/'Data_ReferenceCottonStudy.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')


if __name__=='__main__':Main()
