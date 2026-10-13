"""Encode the approved blank dossier cutout, preserving real alpha and artwork."""
from pathlib import Path
import argparse, hashlib, json
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('--source', required=True, type=Path)
args = parser.parse_args()
game = Path(__file__).resolve().parents[1]
target = game / 'Texture/Menu/Texture_AboutDossierImage.webp'
with Image.open(args.source) as source:
    image = source.convert('RGBA')
    assert image.getchannel('A').getextrema()[0] == 0, 'Dossier needs transparent edges'
    image.thumbnail((1408, 1152), Image.Resampling.LANCZOS)
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, quality=88, method=6)
    size = list(image.size)
record = {'generator': 'Script_EncodeAboutDossier.py', 'date': '2026-10-13',
    'source': {'path': str(args.source), 'sha256': hashlib.sha256(args.source.read_bytes()).hexdigest()},
    'outputs': [{'file': target.name, 'width': size[0], 'height': size[1],
                 'bytes': target.stat().st_size, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}],
    'encoding': 'sRGB WebP quality 88, preserved alpha; no text baked into art'}
(game / '_import/TextureBakes/Texture_AboutDossier.json').write_text(json.dumps(record, indent=2), encoding='utf-8')
print(json.dumps(record))
