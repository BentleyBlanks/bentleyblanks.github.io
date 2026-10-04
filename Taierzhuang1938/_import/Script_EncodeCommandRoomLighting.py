"""Encode Blender's irradiance atlas for external glTF UV1 use, without repainting."""
from pathlib import Path
import argparse, json
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('--source',required=True,type=Path);args=p.parse_args()
game=Path(__file__).resolve().parents[1]
target=game/'Texture'/'Texture_CommandRoomLightingImage.webp'
with Image.open(args.source) as image:
    assert image.size==(2048,2048)
    rgb=image.convert('RGB')
    # This is lighting data, amplified by 32 at runtime. Lossy WebP's chroma
    # subsampling creates visible green/magenta blocks in the dark irradiance.
    rgb.save(target,lossless=True,method=6)
    with Image.open(target) as decoded:
        assert decoded.convert('RGB').tobytes()==rgb.tobytes(), 'Irradiance must round-trip without chroma loss'
print(json.dumps({'path':str(target),'bytes':target.stat().st_size,'size':[2048,2048],'encoding':'sRGB(linear diffuse irradiance / 32)'}))
