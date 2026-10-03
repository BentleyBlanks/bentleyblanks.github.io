"""Encode Blender's irradiance atlas for external glTF UV1 use, without repainting."""
from pathlib import Path
import argparse, json
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('--source',required=True,type=Path);args=p.parse_args()
game=Path(__file__).resolve().parents[1]
target=game/'Texture'/'Texture_CommandRoomLightingImage.webp'
with Image.open(args.source) as image:
    assert image.size==(2048,2048)
    image.convert('RGB').save(target,quality=95,method=6)
print(json.dumps({'path':str(target),'bytes':target.stat().st_size,'size':[2048,2048],'encoding':'sRGB(linear diffuse irradiance / 32)'}))
