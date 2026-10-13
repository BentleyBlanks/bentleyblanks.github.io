"""Encode the generated HUD overlay as WebP; preserve geometry and every alpha pixel.

Usage: python Taierzhuang1938/_import/Script_ImportHudBlood.py <source.png> [output.webp]
"""
from pathlib import Path
from PIL import Image
import hashlib
import json
import sys

sourcePath = Path(sys.argv[1])
outputPath = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parents[1] / 'Texture/Hud/Texture_HudPeripheralBlood.webp'
sourceBytes = sourcePath.read_bytes()
image = Image.open(sourcePath)
if image.mode != 'RGBA' or max(image.size) > 2048:
    raise ValueError('HUD blood requires a true RGBA source no larger than 2048 pixels.')
width, height = image.size
alpha = image.getchannel('A')
# A broad 60% by 60% aiming region; this also contains the production browser test's
# protected sight region. Tiny alpha quantization is preserved, never painted out.
centerMaxAlpha = alpha.crop((round(width*.2),round(height*.2),round(width*.8),round(height*.8))).getextrema()[1]
edgeMaxAlpha = alpha.getextrema()[1]
# Match IncomingFireBrowserTest's transparent-center tolerance (at most 2/255 alpha).
if centerMaxAlpha > 2 or edgeMaxAlpha < 100:
    raise ValueError(f'Overlay must preserve the transparent aiming area and visible edges: {centerMaxAlpha}/{edgeMaxAlpha}')
image.save(outputPath,format='WEBP',quality=78,method=6,exact=True)
encodedAlpha = Image.open(outputPath).convert('RGBA').getchannel('A')
if encodedAlpha.tobytes() != alpha.tobytes():
    raise ValueError('The WebP encoder changed source alpha.')
print(json.dumps({'file':outputPath.name,'width':width,'height':height,'bytes':outputPath.stat().st_size,
    'centerMaxAlpha':centerMaxAlpha,'edgeMaxAlpha':edgeMaxAlpha,'transparentRatio':alpha.histogram()[0]/(width*height),
    'alphaPreserved':True,'sourceSha256':hashlib.sha256(sourceBytes).hexdigest()}))
