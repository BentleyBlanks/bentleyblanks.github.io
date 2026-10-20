"""Prepare the V10 imagegen cotton albedo and band-limited old-yarn relief.

The albedo is resized without repainting. Very fine pepper and broad
stain gradients are filtered out of the relief; millimetre-scale broken yarn
and compressed nap remain. The map is an OpenGL tangent normal at 1024.
"""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def Main():
    output = Path(__file__).resolve().parents[1]/'Model/SichuanBlanketPack'
    source = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/SichuanBlanketPack/Source/MaterialAtlasV10/Image_SichuanSoftOldCottonV10.png')
    with Image.open(source) as image:
        base = image.convert('RGB').resize((1024,1024), Image.Resampling.LANCZOS)
        base.save(output/'Texture_SichuanSoftOldCottonV10Base.png')
        gray = base.convert('L')
        fine = np.asarray(gray.filter(ImageFilter.GaussianBlur(1.0)), dtype=np.float32)/255
        broad = np.asarray(gray.filter(ImageFilter.GaussianBlur(8.0)), dtype=np.float32)/255
    height = fine-broad
    slopeY, slopeX = np.gradient(height)
    normal = np.stack((-slopeX*8.0, slopeY*8.0, np.ones_like(slopeX)), axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    path = output/'Texture_SichuanCottonReliefV10Normal.png'
    Image.fromarray(np.rint(np.clip(normal*.5+.5, 0, 1)*255).astype(np.uint8)).save(path)
    with Image.open(path) as check:
        check.load()
        assert check.size == (1024, 1024)
    report = {'source': source.name, 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
              'normal': path.name, 'normalSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
              'normalConvention': 'OpenGL +Y', 'resolution': [1024, 1024],
              'gaussianBandPx': [1.0, 8.0], 'gradientScale': 8.0,
              'albedoPreparation': 'RGB/Lanczos 1024 only; retain generated cotton exactly',
              'base': 'Texture_SichuanSoftOldCottonV10Base.png',
              'baseSha256': hashlib.sha256((output/'Texture_SichuanSoftOldCottonV10Base.png').read_bytes()).hexdigest(),
              'generationSource': 'Built-in imagegen edit of V09 cotton using approved V02 reference',
              'gameBakeComplete': False}
    (output/'Data_SichuanCottonReliefV10.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print('V10_RELIEF_PREPARED', json.dumps(report))


if __name__ == '__main__':
    Main()
