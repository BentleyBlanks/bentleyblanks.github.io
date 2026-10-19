"""Bake cotton stress creases into the author's tangent-space normal atlas.

Only a physical normal data map is changed. The imagegen albedo is retained.
The front's 38x30 cm UV projection supplies metre-calibrated derivatives.
"""
from pathlib import Path
import io
import hashlib
import json
import numpy as np
from PIL import Image


def BakeRelief(projectPath):
    modelPath=Path(projectPath)/'Model/SichuanBlanketPack'
    imagePath=modelPath/'Texture_SichuanBlanketPackNormal.webp'
    from Script_BakePbrTexture import HeightFromLuma,NormalFromHeight,SrgbToLinear
    albedo=np.asarray(Image.open(modelPath/'Texture_SichuanBlanketPackBase.webp').convert('RGB'),dtype=np.float64)/255
    microHeight=HeightFromLuma(SrgbToLinear(albedo),1024,fineWeight=.9)
    normal=NormalFromHeight(microHeight,.00035,.76,.65,'gl')
    normal[...,2]=np.maximum(normal[...,2],.05)
    slope=normal[...,:2]/normal[...,2:3]
    slope[:512,:512]*=2.5
    slope[:512,512:]*=10.0
    slope[512:,:512]*=3.0
    slope[512:,512:]*=2.5
    row,col=np.mgrid[:512,:512]
    x=(col/1024-.02)/.46*.38-.19
    z=(.48-row/1024)/.46*.30-.15
    height=np.zeros_like(x,dtype=np.float64)
    creases=[
        (-.19,.126,-.114,.088,.0015,.005,.004),
        (-.18,.091,-.11,.067,.0013,.004,-.003),
        (-.178,.012,-.116,.031,.0012,.004,.004),
        (-.188,-.117,-.111,-.086,.0018,.005,-.005),
        (-.169,-.143,-.116,-.105,.0012,.004,.003),
        (-.070,.137,-.025,.082,.0011,.005,.004),
        (-.068,.071,-.031,.055,.0012,.004,-.003),
        (-.067,.026,.027,.011,.0013,.006,.005),
        (-.027,-.061,.043,-.044,.0014,.005,-.004),
        (.016,-.137,.074,-.092,.0015,.005,.004),
        (.179,.021,.114,.037,.0014,.005,-.003),
        (.181,-.111,.116,-.084,.0018,.005,.003),
        (.183,-.028,.120,-.041,.0010,.004,-.005),
    ]
    for ax,az,bx,bz,amplitude,width,bend in creases:
        dx,dz=bx-ax,bz-az;length=np.hypot(dx,dz)
        t=((x-ax)*dx+(z-az)*dz)/(length*length)
        cross=(-(x-ax)*dz+(z-az)*dx)/length
        distance=cross-bend*np.sin(np.clip(t,0,1)*np.pi)
        fade=np.sin(np.clip(t,0,1)*np.pi)**.8
        ridge=np.exp(-(distance/width)**2)-.38*np.exp(-((distance-width*1.5)/(width*1.2))**2)
        height+=amplitude*ridge*fade
    edgeFade=np.minimum.reduce([np.clip(col/16,0,1),np.clip((511-col)/16,0,1),np.clip(row/16,0,1),np.clip((511-row)/16,0,1)])
    height*=edgeFade
    gradRow,gradCol=np.gradient(height)
    slope[:512,:512,0]-=gradCol/(.38/(.46*1024))
    slope[:512,:512,1]+=gradRow/(.30/(.46*1024))
    baked=np.dstack((slope,np.ones((1024,1024))))
    baked/=np.linalg.norm(baked,axis=-1,keepdims=True)
    encoded=np.rint((baked*.5+.5)*255).clip(0,255).astype(np.uint8)
    finalBytes=None;angularError=None
    for quality in (94,96,98,100):
        buffer=io.BytesIO()
        Image.fromarray(encoded,'RGB').save(buffer,format='WEBP',quality=quality,method=6,use_sharp_yuv=True)
        payload=buffer.getvalue()
        decoded=np.asarray(Image.open(io.BytesIO(payload)).convert('RGB'),dtype=np.float64)/127.5-1
        decoded/=np.maximum(np.linalg.norm(decoded,axis=-1,keepdims=True),1e-9)
        angles=np.degrees(np.arccos(np.clip(np.sum(decoded*baked,axis=-1),-1,1)))
        angularError={'meanDegrees':float(angles.mean()),'p99Degrees':float(np.percentile(angles,99))}
        if angularError['p99Degrees']<1.75:
            finalBytes=payload;break
    if finalBytes is None:
        buffer=io.BytesIO();Image.fromarray(encoded,'RGB').save(buffer,format='WEBP',lossless=True,method=6);finalBytes=buffer.getvalue();quality='lossless'
    imagePath.write_bytes(finalBytes)
    recordPath=Path(projectPath)/'_import/SichuanBlanketPack/Data_SichuanBlanketPackTextureBake.json'
    record=json.loads(recordPath.read_text(encoding='utf-8'))
    payload=imagePath.read_bytes()
    for entry in record['outputs']:
        if entry['channel']=='Normal':
            entry['sha256']=hashlib.sha256(payload).hexdigest();entry['bytes']=len(payload)
    record['baseGenerator']=record['generator'];record['generator']='Script_SichuanBlanketPackTextureBake.py@2'
    record['surfaceRelief']={'generator':'Script_SichuanPackReliefBake.py@2','normalConvention':'gl','physicalClothExtentM':[.38,.30],'creaseCount':len(creases),'maximumCreaseHeightM':float(np.max(np.abs(height))),'sourceAlbedoChanged':False,'encoding':'WebP','quality':quality,'angularError':angularError}
    recordPath.write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Tangent relief baked:',len(creases),'cotton creases;',len(payload),'normal bytes')


if __name__=='__main__':BakeRelief(Path(__file__).resolve().parent.parent)
