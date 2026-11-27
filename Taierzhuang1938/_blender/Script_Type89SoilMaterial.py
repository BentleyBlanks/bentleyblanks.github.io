"""Shared Type89 soil texture placement."""
from hashlib import sha256
import json
from pathlib import Path

import numpy as np


PROFILE_FILE = Path(__file__).resolve().parent.parent/'Model'/'Type89MediumTank'/'Data_SoilMaterialProfile.json'
PROFILE_TEXT = PROFILE_FILE.read_text(encoding='utf-8')
PROFILE = json.loads(PROFILE_TEXT)
TILE = PROFILE['clodTilePixels']
PAD = PROFILE['tilePaddingPixels']
BODY_SIZE = 4096
ROOT = 'Model_Type89MediumTank'
CLOD_UV = 'Type89SoilUV'
NAMES = ('Base','Normal','Orm')


def Choice(name):
    return sha256(name.encode()).digest()[0]%4


def RelocateUv(uv,rectangle,mudTile):
    """Move the sampled layers by a uniform, positive affine UV transform."""
    original = np.asarray(uv)
    extent = mudTile['dimensionsPixels']
    half = mudTile['halfSizePixels']
    normalized = (original*extent-np.asarray(mudTile['offsetPixels']))/(2*half)+.5
    assert np.min(normalized)>-.001 and np.max(normalized)<1.001
    target = np.asarray(rectangle[:2],np.float32)+PAD+normalized*(TILE-2*PAD)
    return target/BODY_SIZE
