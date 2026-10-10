"""Resize the generated root cutout and pad transparent RGB for clean mipmaps."""
from pathlib import Path
import argparse, hashlib, json
import numpy as np
from PIL import Image

project=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source',type=Path,required=True)
parser.add_argument('--output',type=Path,default=project/'Texture/Texture_TrenchRootMat.webp')
args=parser.parse_args();source=args.source;out=args.output
image=Image.open(source).convert('RGBA').resize((1024,1024),Image.Resampling.LANCZOS)
pixels=np.array(image);alpha=pixels[:,:,3].copy();rgb=pixels[:,:,:3].astype(np.float32)
known=alpha>16
rgb[~known]=np.median(rgb[alpha>128],axis=0)
# Propagate local strand colours into transparent texels without altering alpha.
# Fully empty distant texels retain the neutral strand median rather than black.
for _ in range(16):
    total=np.zeros_like(rgb);count=np.zeros(known.shape,dtype=np.float32)
    for dy,dx in [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(-1,1),(1,-1),(1,1)]:
        mask=np.roll(known,(dy,dx),(0,1))
        if dy<0:mask[dy:,:]=False
        if dy>0:mask[:dy,:]=False
        if dx<0:mask[:,dx:]=False
        if dx>0:mask[:,:dx]=False
        total+=np.roll(rgb,(dy,dx),(0,1))*mask[:,:,None];count+=mask
    fill=(~known)&(count>0)
    rgb[fill]=total[fill]/count[fill,None];known|=fill
pixels[:,:,:3]=np.clip(rgb+.5,0,255).astype(np.uint8)
out.parent.mkdir(parents=True,exist_ok=True)
Image.fromarray(pixels).save(out,quality=95,method=6,exact=True)
decoded=np.array(Image.open(out).convert('RGBA'))
assert np.array_equal(alpha,decoded[:,:,3]),'WebP must retain the resized alpha exactly'
print(json.dumps({'source':str(source),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
    'output':str(out),'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'bytes':out.stat().st_size,
    'size':[1024,1024],'alphaPreserved':True,'coverageAt030':float((alpha>=77).mean())}))
