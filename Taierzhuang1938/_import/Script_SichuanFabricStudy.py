"""Turn the imagegen fabric swatches into calibrated albedo/micro-normal inputs."""
import argparse,json,hashlib
from pathlib import Path
import numpy as np
from PIL import Image,ImageFilter
from Script_BakePbrTexture import GaussianPeriodic,SrgbToLinear,LinearToSrgb


def BuildCottonWear(folder,role):
    """Pigment and sweat attenuation only; never copy photographed folds."""
    rng=np.random.default_rng({'Front':1938,'Back':1939,'End':1940}[role])
    size=1024;yy,xx=np.mgrid[:size,:size];u=(xx+.5)/size;v=1-(yy+.5)/size
    noise=GaussianPeriodic(rng.random((size,size)),16)
    noise=(noise-noise.mean())/max(float(noise.std()),1e-6)
    ratio=np.ones((size,size,3))*(.99+np.clip(noise,-2,2)[...,None]*.012)
    bottom=np.clip((.18+.018*noise-v)/.18,0,1)**1.8
    for channel,strength in enumerate((.17,.22,.28)):ratio[...,channel]*=1-bottom*strength
    sweat=np.exp(-(((u-.52)/.23)**2+((v-(.68 if role=='Back' else .76))/.20)**2))
    sweat*=.20 if role=='Back' else .07
    for channel,strength in enumerate((.70,.85,1.0)):ratio[...,channel]*=1-sweat*strength
    width=.13 if role=='End' else .38;height=.30
    for index in range(32 if role=='End' else 45):
        cx=rng.uniform(.025,.975);cy=rng.beta(1.3,2.0)*.92+.02
        radius=rng.uniform(.00065,.0026);sx=radius/width;sy=radius/height*rng.uniform(.65,1.4)
        distance=((u-cx)/sx)**2+((v-cy)/sy)**2
        mask=np.exp(-distance*.9)*rng.uniform(.26,.65)
        for channel,strength in enumerate((.65,.77,.88)):ratio[...,channel]*=1-mask*strength
    # Broad earth smudges have soft irregular boundaries, unlike creases.
    for cx,cy,sx,sy in ((.12,.12,.075,.08),(.88,.18,.07,.11),(.70,.43,.045,.07)):
        smudge=np.exp(-(((u-cx)/sx)**2+((v-cy)/sy)**2))*np.clip(.8+.17*noise,.1,1.2)
        for channel,strength in enumerate((.12,.17,.23)):ratio[...,channel]*=1-smudge*strength
    Image.fromarray(np.rint(np.clip(ratio,.28,1.04)*.5*255).clip(0,255).astype(np.uint8)).save(folder/f'Texture_CottonWear{role}.png')


def Main():
    parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,required=True);parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args();args.out.mkdir(parents=True,exist_ok=True)
    image=Image.open(args.source).convert('RGB');w,h=image.size
    regions={'Cotton':(0,0,w//2,h//2),'Binding':(w//2,0,w,h//2),'Patch':(0,h//2,w//2,h),'Indigo':(w//2,h//2,w,h)}
    targets={'Cotton':[183,176,161],'Binding':[116,116,113],'Patch':[157,145,128],'Indigo':[81,83,99]}
    if 'V06' in args.source.name:targets.update({'Cotton':[180,170,151],'Indigo':[61,72,94]})
    for role,box in regions.items():
        linear=SrgbToLinear(np.asarray(image.crop(box),dtype=np.float64)/255)
        luma=linear.mean(axis=-1)
        linear*=((luma.mean()/np.maximum(GaussianPeriodic(luma,32),.002))**.40)[...,None]
        linear*=SrgbToLinear(np.array(targets[role])/255)/np.maximum(np.median(linear,axis=(0,1)),.002)
        Image.fromarray(np.rint(LinearToSrgb(np.clip(linear,0,1))*255).clip(0,255).astype(np.uint8)).save(args.out/f'Texture_Fabric{role}Base.png')
        fine=GaussianPeriodic(luma,.55)-GaussianPeriodic(luma,2.0)
        yarn=GaussianPeriodic(luma,1.8)-GaussianPeriodic(luma,6)
        height=.000055*fine/max(float(fine.std()),1e-6)+.000065*yarn/max(float(yarn.std()),1e-6)
        gx=np.gradient(height,axis=1)/(.12/height.shape[1]);gy=np.gradient(height,axis=0)/(.12/height.shape[0])
        normal=np.stack((-gx,gy,np.ones_like(gx)),axis=-1);normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
        Image.fromarray(np.rint((normal*.5+.5)*255).clip(0,255).astype(np.uint8)).save(args.out/f'Texture_Fabric{role}Normal.png')
    isV6='V06' in args.source.name
    if isV6:
        for role in ('Front','Back','End'):BuildCottonWear(args.out,role)
        reference=Image.open(args.out.parent/'Image_SichuanBlanketPackThreeViewV02.png').convert('L').crop((755,194,948,695))
        unbound=np.asarray(reference,dtype=np.float64).copy()
        for top,bottom in ((329,391),(513,576)):
            lo=top-194;hi=bottom-194
            for row in range(lo,hi+1):
                amount=(row-lo)/max(1,hi-lo)
                unbound[row]=unbound[lo-1]*(1-amount)+unbound[hi+1]*amount
        reference=Image.fromarray(np.rint(unbound).clip(0,255).astype(np.uint8))
        fine=np.asarray(reference.filter(ImageFilter.GaussianBlur(2.0)),dtype=np.float64)
        broad=np.asarray(reference.filter(ImageFilter.GaussianBlur(9.0)),dtype=np.float64)
        relief=np.tanh((fine-broad)/14.0)
        Image.fromarray(np.rint((relief*.5+.5)*255).astype(np.uint8)).save(args.out/'Texture_EndWrinkleHeight.png')
    else:
        old=args.out.parent/'MaterialAtlasV03'
        for role,name in (('Front','Texture_ReferenceCottonBase.png'),('Back','Texture_ReferenceCottonBackBase.png')):
            data=SrgbToLinear(np.asarray(Image.open(old/name).convert('RGB'),dtype=np.float64)/255)
            data=GaussianPeriodic(data,9)
            ratio=np.clip(data/np.maximum(np.median(data,axis=(0,1)),.002),.50,1.08)
            Image.fromarray(np.rint(ratio*.5*255).clip(0,255).astype(np.uint8)).save(args.out/f'Texture_CottonWear{role}.png')
    record={'provider':'Built-in imagegen','source':str(args.source),'sourceSha256':hashlib.sha256(args.source.read_bytes()).hexdigest(),'sourceNominalSwatchM':[.12,.12],'effectiveTileM':[.08,.08],'regions':regions,'targetSrgb':targets,'normalReliefM':[.000055,.000065],'wear':'Separate low-frequency reference wear ratio; no side-fold photograph is projected into albedo'}
    if isV6:record['wear']='Independent deterministic earth pigment, bottom-edge grime and sweat; no reference crease lighting enters any albedo'
    if isV6:record['endRelief']={'referenceCrop':[755,194,948,695],'method':'Approximate geometric micro-relief from 2px minus 9px grayscale bands; geometry only, never albedo','heightRangeM':[-.0008,.0008]}
    (args.out/'Data_FabricStudy.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')


if __name__=='__main__':Main()
