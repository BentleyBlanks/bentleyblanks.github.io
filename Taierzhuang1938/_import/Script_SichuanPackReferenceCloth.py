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
    reference.crop((583,589,644,651)).save(args.out/'Texture_ReferencePatchBase.png')
    record={'source':str(args.reference),'sourceProvider':'approved built-in imagegen reference','frontPixels':box,'backPixels':backBox,'accessoriesMasked':True,'deLightSigmaPixels':48,'deLightStrength':.65,'physicalCottonExtentM':[.38,.30],'microReliefMeters':[.00008,.00045],'referenceUnmodified':True}
    (args.out/'Data_ReferenceCottonStudy.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')


if __name__=='__main__':Main()
