"""Encode the Imagegen distant vista; no repainting or compositing."""
from pathlib import Path
import argparse, hashlib, json
from PIL import Image

parser=argparse.ArgumentParser();parser.add_argument('--source',required=True,type=Path)
args=parser.parse_args();game=Path(__file__).resolve().parents[1]
target=game/'Texture/Texture_CommandRoomFarmlandImage.webp'
with Image.open(args.source) as image:
    image.convert('RGB').save(target,quality=82,method=6)
    size=list(image.size)
record={'generator':'Script_EncodeCommandRoomFarmland.py','date':'2026-10-09',
    'source':{'path':str(args.source),'sha256':hashlib.sha256(args.source.read_bytes()).hexdigest()},
    'outputs':[{'file':target.name,'width':size[0],'height':size[1],'bytes':target.stat().st_size,
              'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}],
    'encoding':'sRGB WebP quality 82; source pixels unchanged except codec quantization'}
(game/'_import/TextureBakes/Texture_CommandRoomFarmland.json').write_text(json.dumps(record,indent=2),encoding='utf-8')
print(json.dumps(record))
