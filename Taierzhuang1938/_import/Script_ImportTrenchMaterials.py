"""Rebuild the CC0 natural stone and scanned mud materials; run with Python + Pillow.
Source: https://polyhaven.com/a/rock_boulder_dry
Authors: Dimitrios Savva (photography), Rico Cilliers (processing).
Mud: https://polyhaven.com/a/brown_mud_02 by Rob Tuytel (CC0).
"""
import io, json, urllib.request
from pathlib import Path
from PIL import Image

project = Path(__file__).resolve().parents[1]
def Download(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'TrenchAssetBuilder/1.0'})
    return urllib.request.urlopen(request, timeout=90)
metadata = json.load(Download('https://api.polyhaven.com/files/rock_boulder_dry'))
for kind, channel in [('Base', 'Diffuse'), ('Normal', 'nor_gl'), ('Orm', 'arm')]:
    url = metadata[channel]['1k']['png']['url']
    with Download(url) as response:
        image = Image.open(io.BytesIO(response.read())).convert('RGB')
    size = 1024 if kind == 'Base' else 512
    image.resize((size, size), Image.Resampling.LANCZOS).save(
        project / 'Texture' / ('Texture_TrenchStone' + kind + '.webp'), quality=90 if kind == 'Base' else 96)

# Scanned mud: retain the captured normal and roughness; do not infer either from diffuse.
metadata = json.load(Download('https://api.polyhaven.com/files/brown_mud_02'))
maps = {}
for kind, channel in [('Base', 'Diffuse'), ('Normal', 'nor_gl'), ('Orm', 'arm'), ('Height', 'Displacement')]:
    with Download(metadata[channel]['1k']['png']['url']) as response:
        maps[kind] = Image.open(io.BytesIO(response.read())).convert('RGB')
for kind in ['Base', 'Normal']:
    size = 1024 if kind == 'Base' else 512
    maps[kind].resize((size, size), Image.Resampling.LANCZOS).save(
        project / 'Texture' / ('Texture_TrenchMud' + kind + '.webp'), quality=90 if kind == 'Base' else 96)
ao, rough, _ = maps['Orm'].resize((512, 512), Image.Resampling.LANCZOS).split()
height = maps['Height'].resize((512, 512), Image.Resampling.LANCZOS).getchannel('R')
Image.merge('RGB', (ao, rough, height)).save(project / 'Texture' / 'Texture_TrenchMudOrh.webp', quality=96)
