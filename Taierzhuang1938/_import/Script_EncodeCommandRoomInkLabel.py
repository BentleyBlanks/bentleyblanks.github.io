"""Encode the approved Imagegen bottle-label image for the game, without repainting."""
from pathlib import Path
from PIL import Image
import argparse
p=argparse.ArgumentParser();p.add_argument('--source',required=True,type=Path);args=p.parse_args()
out=Path(__file__).resolve().parents[1]/'Texture/Texture_CommandRoomInkLabelImage.webp'
with Image.open(args.source) as im:
    im.convert('RGB').resize((512,336),Image.Resampling.LANCZOS).save(out,quality=91,method=6)
print(out)
