"""Lossy WebP delivery copies of user-approved artwork; no re-lettering or repaint."""
from pathlib import Path
import argparse,json
from PIL import Image
parser=argparse.ArgumentParser()
parser.add_argument("--source",required=True,type=Path)
args=parser.parse_args()
game=Path(__file__).resolve().parents[1]
for filename,asset in [("Reference_1.png","CommandRoomLetter"),("Reference_2.png","CommandRoomMap")]:
    with Image.open(args.source/filename) as image:
        image.convert("RGB").save(game/"Texture"/("Texture_"+asset+"Image.webp"),quality=93,method=6)
        print(json.dumps({"asset":asset,"size":image.size}))
