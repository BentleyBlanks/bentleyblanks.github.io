"""Turn the imagegen fabric swatches into calibrated albedo/micro-normal inputs."""
import argparse,json,hashlib
from pathlib import Path
import numpy as np
from PIL import Image
from Script_BakePbrTexture import GaussianPeriodic,SrgbToLinear,LinearToSrgb


def Main():
    parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,required=True);parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args();args.out.mkdir(parents=True,exist_ok=True)
    image=Image.open(args.source).convert('RGB');w,h=image.size
    regions={'Cotton':(0,0,w//2,h//2),'Binding':(w//2,0,w,h//2),'Patch':(0,h//2,w//2,h),'Indigo':(w//2,h//2,w,h)}
    targets={'Cotton':[183,176,161],'Binding':[116,116,113],'Patch':[157,145,128],'Indigo':[81,83,99]}
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
    old=args.out.parent/'MaterialAtlasV03'
    for role,name in (('Front','Texture_ReferenceCottonBase.png'),('Back','Texture_ReferenceCottonBackBase.png')):
        data=SrgbToLinear(np.asarray(Image.open(old/name).convert('RGB'),dtype=np.float64)/255)
        data=GaussianPeriodic(data,9)
        ratio=np.clip(data/np.maximum(np.median(data,axis=(0,1)),.002),.50,1.08)
        Image.fromarray(np.rint(ratio*.5*255).clip(0,255).astype(np.uint8)).save(args.out/f'Texture_CottonWear{role}.png')
    record={'provider':'Built-in imagegen','source':str(args.source),'sourceSha256':hashlib.sha256(args.source.read_bytes()).hexdigest(),'sourceNominalSwatchM':[.12,.12],'effectiveTileM':[.08,.08],'regions':regions,'targetSrgb':targets,'normalReliefM':[.000055,.000065],'wear':'Separate low-frequency reference wear ratio; no side-fold photograph is projected into albedo'}
    (args.out/'Data_FabricStudy.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')


if __name__=='__main__':Main()
