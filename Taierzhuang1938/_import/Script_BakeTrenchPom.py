"""Pack generated soil colour/height into the existing terrain-array contract.

The height source is an authored imagegen estimate, not measured displacement.
Normal and AO are derived from that SAME height field. No extra GPU sampler.
Run with Python, Pillow and numpy; source PNGs stay beside the runtime textures.
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

root = Path(__file__).resolve().parents[1] / 'Texture'
size = 1024
tileM, reliefM = 1.5, .05

def Read(name):
    return np.asarray(Image.open(root / name).convert('RGB').resize((size, size), Image.Resampling.LANCZOS), dtype=np.float32) / 255

def WeldEdges(data):
    data = data.copy()
    # Identical positions/blend for colour and height; wrap boundaries match.
    for axis in (0, 1):
        for i in range(32):
            a, b = [slice(None)] * 3, [slice(None)] * 3
            a[axis], b[axis] = i, size - 1 - i
            a, b = tuple(a), tuple(b)
            first, last = data[a].copy(), data[b].copy()
            t = .5 * (1 - i / 32) ** 2
            data[a], data[b] = first * (1-t) + last*t, last*(1-t) + first*t
    return data

base = WeldEdges(Read('Texture_TrenchPomSource.png'))
rawHeight = WeldEdges(Read('Texture_TrenchPomHeightSource.png'))[:, :, 0]
low, high = np.quantile(rawHeight, [.01, .99])
height = np.clip((rawHeight-low)/(high-low), 0, 1)*.84+.08
rawImage = Image.fromarray(np.round(height*255).astype(np.uint8))
# Sand grains must not become centimetre-high spikes. Keep the large eroded
# relief, while retaining only a small amplitude of the finest source detail.
broad = np.asarray(rawImage.filter(ImageFilter.GaussianBlur(3.0)), dtype=np.float32)/255
height = broad+(height-broad)*.15
heightImage = Image.fromarray(np.round(height*255).astype(np.uint8))
height = np.asarray(heightImage, dtype=np.float32)/255
Image.fromarray(np.round(base*255).astype(np.uint8)).save(root/'Texture_TrenchPomBase.webp', quality=95)

small = np.asarray(heightImage.resize((512, 512), Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(.6)), dtype=np.float32)/255
dx = (np.roll(small,-1,1)-np.roll(small,1,1))*.5*512*reliefM/tileM
dy = (np.roll(small,-1,0)-np.roll(small,1,0))*.5*512*reliefM/tileM
normal = np.stack([-dx,-dy,np.ones_like(dx)],axis=-1)
normal /= np.sqrt(np.sum(normal*normal,axis=-1,keepdims=True))
Image.fromarray(np.round((normal*.5+.5)*255).astype(np.uint8)).save(root/'Texture_TrenchPomNormal.webp', lossless=True)

occlusion = np.zeros_like(height)
for radius in (5, 16):
    for ox, oy in ((1,0),(-1,0),(0,1),(0,-1)):
        neighbour = np.roll(height,(oy*radius,ox*radius),(0,1))
        occlusion += np.clip((neighbour-height-.012)*reliefM/(radius*tileM/size),0,1)
ao = np.clip(1-occlusion*.095,.35,1)
rough = .88+.10*(1-height)
packed = np.stack([ao,rough,height],axis=-1)
Image.fromarray(np.round(packed*255).astype(np.uint8)).save(root/'Texture_TrenchPomOrh.webp', lossless=True)
print('Trench POM: 1024 colour/height/AO, 512 normal, welded wrap, %.2fm tile / %.2fm relief' % (tileM, reliefM))
