"""Prepare the independent imagegen V8 fibre atlas and technical PBR maps."""
from pathlib import Path
import argparse,json,hashlib
import numpy as np
from PIL import Image,ImageFilter

parser=argparse.ArgumentParser();parser.add_argument('--source',required=True);parser.add_argument('--output',required=True)
args=parser.parse_args();source=Path(args.source);output=Path(args.output);output.mkdir(parents=True,exist_ok=True)
image=Image.open(source).convert('RGB').resize((1024,1024),Image.Resampling.LANCZOS)
normal=np.zeros((1024,1024,3),dtype=np.uint8);rough=np.zeros((1024,1024),dtype=np.uint8)
regions={'Cotton':(0,0,512,512),'Binding':(512,0,1024,512),'Indigo':(0,512,512,1024),'Straw':(512,512,1024,1024)}
for role,box in regions.items():
    crop=image.crop(box)
    # Keep fibre albedo, remove broad baked illumination/stain tiling. Broad
    # shared dust and mud are applied once in 3D rather than repeated per tile.
    values=np.asarray(crop,dtype=np.float32)/255
    low=np.asarray(crop.filter(ImageFilter.GaussianBlur(18)),dtype=np.float32)/255
    mean=values.mean(axis=(0,1),keepdims=True)
    values=np.clip((values-low)*.88+low*.22+mean*.78,0,1)
    crop=Image.fromarray((values*255).astype(np.uint8));image.paste(crop,box[:2]);gray=crop.convert('L')
    high=np.asarray(gray,dtype=np.float32)/255-np.asarray(gray.filter(ImageFilter.GaussianBlur(4)),dtype=np.float32)/255
    dy,dx=np.gradient(high);n=np.stack((-dx*2.0,dy*2.0,np.ones_like(dx)),axis=-1);n/=np.linalg.norm(n,axis=-1,keepdims=True)
    x0,y0,x1,y1=box;normal[y0:y1,x0:x1]=np.clip((n*.5+.5)*255,0,255).astype(np.uint8)
    base=.90 if role=='Straw' else .95
    rough[y0:y1,x0:x1]=np.clip((base+high*.15)*255,0,255).astype(np.uint8)
Image.fromarray(normal).save(output/'Texture_SichuanWornFibersV08Normal.png')
Image.fromarray(rough).save(output/'Texture_SichuanWornFibersV08Roughness.png')
image.save(output/'Texture_SichuanWornFibersV08Base.png')
data={'generator':'Built-in image_gen__imagegen','source':str(source),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'resolution':[1024,1024],'regionsImagePixels':regions,'purpose':'Shared-age homespun cotton, tape, indigo and grass fibres; geometry supplies the actual straw weave','technicalMaps':'Normal from high-frequency fibre luminance; matte roughness, no metallic component','gameBakeComplete':False}
(output/'Data_SichuanWornFibersV08.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
print('V8_PBR_PREPARED',str(output))
