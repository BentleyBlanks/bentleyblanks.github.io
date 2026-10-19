"""Prepare calibrated straw albedo and micro-relief from imagegen source V04."""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image
from Script_BakePbrTexture import GaussianPeriodic, SrgbToLinear, LinearToSrgb


def Main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--source',type=Path,required=True)
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args();args.out.mkdir(parents=True,exist_ok=True)
    image=Image.open(args.source).convert('RGB');w,h=image.size
    regions={'Sole':(0,0,w//2,h//2),'End':(w//2,0,w,h//2),
             'Weave':(0,h//2,w//2,h),'Cord':(w//2,h//2,w,h)}
    sizes={'Sole':(.056,.100),'End':(.074,.074),'Weave':(.0505,.110),'Cord':(.012,.100)}
    for role,box in regions.items():
        linear=SrgbToLinear(np.asarray(image.crop(box),dtype=np.float64)/255)
        luma=linear.mean(axis=-1)
        albedo=linear*(luma.mean()/np.maximum(GaussianPeriodic(luma,36),.002))[...,None]**.45
        encoded=np.rint(LinearToSrgb(np.clip(albedo,0,1))*255).clip(0,255).astype(np.uint8)
        Image.fromarray(encoded).save(args.out/f'Texture_Straw{role}Base.png')
        fine=GaussianPeriodic(luma,.7)-GaussianPeriodic(luma,2.5)
        broad=GaussianPeriodic(luma,2)-GaussianPeriodic(luma,16)
        height=.00006*fine/max(float(fine.std()),1e-5)
        height+=(.00030 if role=='End' else .00055)*broad/max(float(broad.std()),1e-5)
        sx,sy=sizes[role]
        gx=np.gradient(height,axis=1)/(sx/height.shape[1])
        gy=np.gradient(height,axis=0)/(sy/height.shape[0])
        normal=np.stack((-gx,gy,np.ones_like(gx)),axis=-1)
        normal/=np.maximum(np.linalg.norm(normal,axis=-1,keepdims=True),1e-6)
        Image.fromarray(np.rint((normal*.5+.5)*255).clip(0,255).astype(np.uint8)).save(args.out/f'Texture_Straw{role}Normal.png')
    record={'provider':'Built-in image_gen__imagegen','source':str(args.source),
            'sourceSha256':hashlib.sha256(args.source.read_bytes()).hexdigest(),
            'regions':regions,'physicalExtentsM':sizes,'deLightStrength':.45,
            'destination':'Reprojected into the shared 1024 GameUV atlas'}
    (args.out/'Data_StrawStudy.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')


if __name__=='__main__':Main()
