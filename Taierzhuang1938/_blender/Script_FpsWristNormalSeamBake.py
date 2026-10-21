"""Fade the wrist bridge band out of the scanned FPS skin normal map, as an appended image.

The scanned HanYang hand is joined to the NRA forearm by one ring of "bridge"
triangles (684, 342 per side) between the last forearm ring and the first scanned
hand ring; the forearm taper's end plane lies inside that ring. In the shared
4096^2 Texture_UnifiedSkinNormal those bridge texels hold a baked ramp of the
high-poly wrist cut: about 1 deg at the forearm edge rising to 20-27 deg at the
hand edge, then the hand skin starts at ~1-2 deg. That jump at the first hand
ring reads as a thin line around the wrist once the geometric ridge is gone.

This layer leaves every existing byte of both hand GLBs in place. It decodes the
embedded (lossy) WebP exactly as Chromium does (libwebp), sets every bridge texel
to the forearm's flat value, keeps the first `holdMm` of hand skin flat (the
baked ramp leaks up to ~1.5 mm past the ring), fades the original hand texels back
in over `fadeMm` (smoothstep on the distance from the ring), and lets gutter
texels follow whichever island reaches them first, up to `gutterPx` (mipmaps).
Every other texel is copied unchanged. The result is stored as a lossless WebP
appended to the end of the BIN chunk, with one new bufferView, one new image and
texture 2 (the skin normal) repointed to it. The old image stays
in place, unreferenced, so the reviewed byte prefixes of earlier layers hold.

CPython only (numpy + Pillow with libwebp); Blender's Python has no WebP codec.
The recipe keeps the exact JSON text edits and the appended byte range, so
--undo (and Script_FpsWristNormalSeamTest.mjs) restore the previous assets byte
for byte.

Bake (writes both GLBs and Model/Data_FpsWristNormalSeam.json):
  python Taierzhuang1938/_blender/Script_FpsWristNormalSeamBake.py --bake
Undo (writes the pre-seam bytes into the given folder):
  python Taierzhuang1938/_blender/Script_FpsWristNormalSeamBake.py --undo --output <dir>
"""
import argparse
import hashlib
import io
import json
import struct
import sys
from pathlib import Path

import numpy as np
import PIL
from PIL import Image, features

RECIPE = 'Model/Data_FpsWristNormalSeam.json'
TAPER = 'Model/Data_FpsForearmTaper.json'
SKIN_MATERIAL = 'Material_HanYangScanSkin'
IMAGE_NAME = 'Texture_UnifiedSkinNormal_WristSeamFade'
# Previous reviewed outputs: the forearm taper of both hand GLBs.
ASSETS = (
    {'asset': 'Model/Model_FpsHanYangHands.glb',
     'before': 'ec950c2430a1da77054da32fd6b813aff3a89d43be5db15090d7933887e69e30'},
    {'asset': 'Model/Model_FpsHanYangHandsRepaired.glb',
     'before': '49cf82dcc38a9f4f15cd06930093ceaa5a1d7e6680d32ea994966f543d2c3f84'},
)
PARAMETERS = {
    'flatRgb': [128, 127, 255],   # the forearm's flat texel (95% of forearm texels next to the bridge)
    'holdMm': 0.5,                # hand skin kept flat past the first hand ring
    'fadeMm': 4.0,                # smoothstep back to the original hand texels
    'gutterPx': 32,               # uncovered texels follow the island that reaches them first, up to this many texels
    'radiusMm': 90.0,             # wrist skin only (distance from the forearm-to-hand bone axis)
    'bridgeWindowMm': 12.0,       # bridge triangles: every vertex within this distance of the taper end plane
    'textureSize': 4096,
}


def Sha(data):
    return hashlib.sha256(data).hexdigest()


def SplitGlb(raw):
    assert len(raw) >= 28 and struct.unpack_from('<III', raw) == (0x46546C67, 2, len(raw))
    length, kind = struct.unpack_from('<II', raw, 12)
    assert kind == 0x4E4F534A
    binLength, binKind = struct.unpack_from('<II', raw, 20 + length)
    assert binKind == 0x004E4942 and 28 + length + binLength == len(raw)
    return length, binLength


class Glb:
    def __init__(self, raw):
        self.raw = bytes(raw)
        self.jsonLength, self.binLength = SplitGlb(self.raw)
        self.text = self.raw[20:20 + self.jsonLength].decode('utf-8')
        self.doc = json.loads(self.text)
        self.base = 28 + self.jsonLength
        matches = [(mi, pi) for mi, mesh in enumerate(self.doc['meshes']) for pi, p in enumerate(mesh['primitives'])
                   if self.doc['materials'][p['material']]['name'] == SKIN_MATERIAL]
        assert len(matches) == 1, matches
        self.meshIndex, self.primitiveIndex = matches[0]
        self.primitive = self.doc['meshes'][self.meshIndex]['primitives'][self.primitiveIndex]

    def Read(self, index):
        a = self.doc['accessors'][index]
        width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        size = {5121: 1, 5123: 2, 5125: 4, 5126: 4}[a['componentType']]
        dtype = {5121: 'u1', 5123: '<u2', 5125: '<u4', 5126: '<f4'}[a['componentType']]
        view = self.doc['bufferViews'][a['bufferView']]
        assert view.get('buffer', 0) == 0 and 'sparse' not in a and not a.get('normalized')
        return np.ndarray((a['count'], width), dtype=dtype, buffer=self.raw, offset=self.base + view.get('byteOffset', 0) + a.get('byteOffset', 0),
                          strides=(view.get('byteStride', width * size), size)).copy()

    def NormalTexture(self):
        index = self.doc['materials'][self.primitive['material']]['normalTexture']['index']
        source = self.doc['textures'][index]['extensions']['EXT_texture_webp']['source']
        return index, source

    def ImageBytes(self, source):
        view = self.doc['bufferViews'][self.doc['images'][source]['bufferView']]
        begin = self.base + view.get('byteOffset', 0)
        return self.raw[begin:begin + view['byteLength']]


def Decode(data):
    image = Image.open(io.BytesIO(data))
    assert image.mode == 'RGB', image.mode
    return np.asarray(image.convert('RGB')).copy()


def WristField(glb, taper):
    """Per-vertex distance (m) past the first scanned hand ring on the tilted wrist axis, and the bridge triangles.

    Written as explicit element-wise float64 arithmetic (no BLAS) so the Node gate can recompute it bit for bit.
    """
    P = glb.Read(glb.primitive['attributes']['POSITION']).astype(np.float64)
    triangles = glb.Read(glb.primitive['indices']).reshape(-1, 3).astype(np.int64)
    t = np.full(len(P), np.nan)
    radius = np.full(len(P), np.nan)
    side = np.where(P[:, 0] > 0, 'l', 'r')
    for s, data in taper['sides'].items():
        frame, plane = data['frame'], data['endPlane']
        w, ax, u, v = (np.asarray(frame[k], dtype=np.float64) for k in ('wrist', 'axis', 'thumbSide', 'quarterTurn'))
        m = side == s
        d = [P[m, k] - w[k] for k in range(3)]
        along = d[0] * ax[0] + d[1] * ax[1] + d[2] * ax[2]
        r = [d[k] - along * ax[k] for k in range(3)]
        ru = r[0] * u[0] + r[1] * u[1] + r[2] * u[2]
        rv = r[0] * v[0] + r[1] * v[1] + r[2] * v[2]
        t[m] = along - plane['tiltThumbSide'] * ru - plane['tiltQuarterTurn'] * rv - plane['alongOffsetMm'] / 1000
        radius[m] = np.sqrt(r[0] * r[0] + r[1] * r[1] + r[2] * r[2])
    window, reach = PARAMETERS['bridgeWindowMm'] / 1000, PARAMETERS['radiusMm'] / 1000
    tt = t[triangles]
    sameSide = (side[triangles] == side[triangles[:, :1]]).all(1)
    bridge = np.where(sameSide & (np.abs(tt) < window).all(1) & (radius[triangles] < reach).all(1) & (tt.min(1) < 0) & (tt.max(1) > 0))[0]
    h = np.full(len(P), np.inf)
    ring = {}
    for s in ('l', 'r'):
        mine = bridge[side[triangles[bridge, 0]] == s]
        corners = triangles[mine].ravel()
        ringVertices = np.unique(corners[t[corners] > 0])
        forearmVertices = np.unique(corners[t[corners] < 0])
        ringT = float(t[ringVertices].max())
        m = (side == s) & (radius < reach)
        h[m] = t[m] - ringT
        ring[s] = {'bridgeTriangles': int(len(mine)), 'ringVertices': int(len(ringVertices)), 'forearmEdgeVertices': int(len(forearmVertices)),
                   'ringTMm': [round(float(t[ringVertices].min()) * 1000, 4), round(ringT * 1000, 4)],
                   'forearmEdgeTMm': [round(float(t[forearmVertices].min()) * 1000, 4), round(float(t[forearmVertices].max()) * 1000, 4)]}
    return {'P': P, 'triangles': triangles, 't': t, 'h': h, 'side': side, 'bridge': bridge, 'ring': ring}


def Smooth(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


def Rasterize(uv, triangles, faces, size, values=None):
    """Pixel-centre coverage. Returns (covered mask, per-pixel min of the interpolated `values`)."""
    covered = np.zeros((size, size), bool)
    field = np.full((size, size), np.inf) if values is not None else None
    for f in faces:
        a, b, c = triangles[f]
        x0, y0, x1, y1 = uv[a, 0], uv[a, 1], uv[b, 0], uv[b, 1]
        x2, y2 = uv[c, 0], uv[c, 1]
        det = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if det == 0:
            continue
        lo_x = max(int(np.floor(min(x0, x1, x2))), 0)
        hi_x = min(int(np.ceil(max(x0, x1, x2))), size - 1)
        lo_y = max(int(np.floor(min(y0, y1, y2))), 0)
        hi_y = min(int(np.ceil(max(y0, y1, y2))), size - 1)
        px = np.arange(lo_x, hi_x + 1, dtype=np.float64)[None, :] + 0.5
        py = np.arange(lo_y, hi_y + 1, dtype=np.float64)[:, None] + 0.5
        l0 = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / det
        l1 = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / det
        l2 = 1.0 - l0 - l1
        inside = (l0 >= 0) & (l1 >= 0) & (l2 >= 0)
        if not inside.any():
            continue
        covered[lo_y:hi_y + 1, lo_x:hi_x + 1] |= inside
        if values is not None:
            value = l0 * values[a] + l1 * values[b] + l2 * values[c]
            block = field[lo_y:hi_y + 1, lo_x:hi_x + 1]
            np.minimum(block, np.where(inside, value, np.inf), out=block)
    return covered, field


def Bleed(seed, steps):
    """Grow assigned texels (finite) into unassigned ones (inf), one 8-neighbour ring per step, synchronously.

    A texel takes the minimum value among its neighbours assigned in earlier steps, so every gutter texel follows
    the island that reaches it first (Chebyshev distance), ties going to the flatter weight. Exact and order-free.
    """
    field = seed.copy()
    height, width = field.shape
    for _ in range(steps):
        reach = np.full_like(field, np.inf)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy == 0 and dx == 0:
                    continue
                ys, yd = (slice(0, height - dy), slice(dy, height)) if dy >= 0 else (slice(-dy, height), slice(0, height + dy))
                xs, xd = (slice(0, width - dx), slice(dx, width)) if dx >= 0 else (slice(-dx, width), slice(0, width + dx))
                np.minimum(reach[yd, xd], field[ys, xs], out=reach[yd, xd])
        grow = np.isinf(field) & np.isfinite(reach)
        if not grow.any():
            break
        field[grow] = reach[grow]
    return field


def Tilt(rgb):
    n = rgb.astype(np.float64) / 255 * 2 - 1
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return np.degrees(np.arccos(np.clip(n[..., 2], -1, 1)))


def Fix(original, glb, field):
    size = PARAMETERS['textureSize']
    assert original.shape == (size, size, 3)
    uv = glb.Read(glb.primitive['attributes']['TEXCOORD_0']).astype(np.float64) * size
    triangles, h = field['triangles'], field['h']
    reach = (PARAMETERS['holdMm'] + PARAMETERS['fadeMm']) / 1000
    hh = h[triangles]
    hand = np.where(np.isfinite(hh).all(1) & (field['t'][triangles] > 0).all(1) & (hh.min(1) < reach))[0]
    zone = np.union1d(field['bridge'], hand)
    # Weight per vertex is not linear; interpolate the distance and map it per pixel.
    covered, dist = Rasterize(uv, triangles, zone, size, np.where(np.isfinite(h), h, 1.0))
    weight = np.ones((size, size))
    weight[covered] = Smooth((dist[covered] - PARAMETERS['holdMm'] / 1000) / (PARAMETERS['fadeMm'] / 1000))
    # Texels used by any other skin triangle keep their bytes (UV islands must not overlap the edited zone).
    near = np.where(covered)
    pad = 2 * PARAMETERS['gutterPx'] + 2  # every island that can compete for a gutter texel lies inside the box
    y0, y1 = max(near[0].min() - pad, 0), min(near[0].max() + pad + 1, size)
    x0, x1 = max(near[1].min() - pad, 0), min(near[1].max() + pad + 1, size)
    box = uv[triangles]
    candidates = np.where((box[:, :, 0].max(1) >= x0) & (box[:, :, 0].min(1) <= x1) & (box[:, :, 1].max(1) >= y0) & (box[:, :, 1].min(1) <= y1))[0]
    others = np.setdiff1d(candidates, zone)
    otherCovered, _ = Rasterize(uv, triangles, others, size)
    shared = covered & otherCovered & (weight < 1)
    # Only the shared edge with the forearm ring may touch other triangles; those texels are flat already.
    sharedChanged = shared & (np.abs(original.astype(int) - PARAMETERS['flatRgb']).max(2) > 2)
    assert sharedChanged.sum() < 64, int(sharedChanged.sum())
    anyCovered = covered | otherCovered
    seed = np.where(anyCovered, weight, np.inf)[y0:y1, x0:x1]
    grown = Bleed(seed, PARAMETERS['gutterPx'])
    gutter = np.zeros((size, size), bool)
    gutter[y0:y1, x0:x1] = np.isinf(seed) & (grown < 1)
    inBox = gutter[y0:y1, x0:x1]
    weight[y0:y1, x0:x1][inBox] = grown[inBox]
    edit = weight < 1
    flat = np.asarray(PARAMETERS['flatRgb'], dtype=np.float64)
    fixed = original.copy()
    w = weight[edit][:, None]
    fixed[edit] = np.floor((1.0 - w) * flat + w * original[edit].astype(np.float64) + 0.5).astype(np.uint8)
    # Report: where the bands were and what is left.
    bridgeMask, _ = Rasterize(uv, triangles, field['bridge'], size)
    stats = {}
    for name, image in (('before', original), ('after', fixed)):
        tilt = Tilt(image)
        jumps = np.maximum(np.abs(np.diff(tilt, axis=0))[:, :-1], np.abs(np.diff(tilt, axis=1))[:-1, :])
        inner = (covered & ~bridgeMask)[:-1, :-1] | bridgeMask[:-1, :-1]
        stats[name] = {'bridgeTiltP90Deg': round(float(np.percentile(tilt[bridgeMask], 90)), 3),
                       'bridgeTiltMaxDeg': round(float(tilt[bridgeMask].max()), 3),
                       'zoneNeighbourJumpP999Deg': round(float(np.percentile(jumps[inner], 99.9)), 3),
                       'zoneNeighbourJumpMaxDeg': round(float(jumps[inner].max()), 3)}
    counts = {'zoneTriangles': int(len(zone)), 'bridgeTriangles': int(len(field['bridge'])), 'handFadeTriangles': int(len(hand)),
              'editedTexels': int(edit.sum()), 'changedTexels': int((fixed != original).any(2).sum()),
              'bridgeTexels': int(bridgeMask.sum()), 'gutterTexels': int(gutter.sum()),
              'sharedEdgeTexels': int(shared.sum())}
    return fixed, {'counts': counts, 'stats': stats, 'box': [int(x0), int(y0), int(x1), int(y1)]}


def Encode(rgb):
    out = io.BytesIO()
    Image.fromarray(rgb, 'RGB').save(out, 'WEBP', lossless=True, quality=50, method=4, exact=True)
    data = out.getvalue()
    assert data[12:16] == b'VP8L', data[12:16]
    assert np.array_equal(Decode(data), rgb), 'lossless WebP round trip'
    return data


def ArrayEnd(text, key):
    """Byte offset of the ']' that closes the array value of the (unique) top-level `key`."""
    assert text.count(key) == 1, key
    at = text.index(key)
    _, end = json.JSONDecoder().raw_decode(text, at + len(key))
    assert text[end - 1] == ']'
    return len(text[:end - 1].encode('utf-8'))


def Splice(data, edits, forward=True):
    """Apply recorded byte edits (offsets refer to the previous JSON text) forward, or reverse them."""
    pieces, cursor, shift = [], 0, 0
    for e in sorted(edits, key=lambda e: e['at']):
        old, new = (e['before'], e['after']) if forward else (e['after'], e['before'])
        old, new = old.encode('ascii'), new.encode('ascii')
        at = e['at'] + (0 if forward else shift)
        assert data[at:at + len(old)] == old, e
        pieces += [data[cursor:at], new]
        cursor = at + len(old)
        shift += len(e['after']) - len(e['before'])
    return b''.join(pieces + [data[cursor:]])


def Pack(jsonText, binBytes, jsonChunkLength=None):
    jsonBytes = jsonText + b' ' * ((jsonChunkLength - len(jsonText)) if jsonChunkLength is not None else (-len(jsonText) % 4))
    return (struct.pack('<III', 0x46546C67, 2, 28 + len(jsonBytes) + len(binBytes)) + struct.pack('<II', len(jsonBytes), 0x4E4F534A) + jsonBytes
            + struct.pack('<II', len(binBytes), 0x004E4942) + binBytes)


def Apply(glb, image, textureIndex):
    """Append the image to BIN, add a bufferView and an image, repoint the normal texture. Byte edits are recorded."""
    doc = glb.doc
    data = glb.raw[20:20 + glb.jsonLength].rstrip(b' ')
    text = data.decode('utf-8')
    oldSource = doc['textures'][textureIndex]['extensions']['EXT_texture_webp']['source']
    viewIndex, imageIndex = len(doc['bufferViews']), len(doc['images'])
    offset = glb.binLength
    assert offset % 4 == 0 and doc['buffers'] == [{'byteLength': glb.binLength}]
    padded = image + b'\0' * (-len(image) % 4)
    newLength = glb.binLength + len(padded)
    assert sum(1 for t in doc['textures'] if t['extensions']['EXT_texture_webp']['source'] == oldSource) == 1
    sourceKey = '"EXT_texture_webp":{"source":%d}' % oldSource
    bufferKey = '"buffers":[{"byteLength":%d}]' % glb.binLength
    edits = [
        {'at': ArrayEnd(text, '"bufferViews":'), 'before': '', 'after': ',{"buffer":0,"byteLength":%d,"byteOffset":%d}' % (len(image), offset)},
        {'at': ArrayEnd(text, '"images":'), 'before': '', 'after': ',{"bufferView":%d,"mimeType":"image/webp","name":"%s"}' % (viewIndex, IMAGE_NAME)},
        {'at': data.index(sourceKey.encode()), 'before': sourceKey, 'after': '"EXT_texture_webp":{"source":%d}' % imageIndex},
        {'at': data.index(bufferKey.encode()), 'before': bufferKey, 'after': '"buffers":[{"byteLength":%d}]' % newLength},
    ]
    for e in edits:
        assert not e['before'] or data.count(e['before'].encode()) == 1, e
    edits.sort(key=lambda e: e['at'])
    after = Splice(data, edits)
    expected = json.loads(data)
    expected['bufferViews'].append({'buffer': 0, 'byteLength': len(image), 'byteOffset': offset})
    expected['images'].append({'bufferView': viewIndex, 'mimeType': 'image/webp', 'name': IMAGE_NAME})
    expected['textures'][textureIndex]['extensions']['EXT_texture_webp']['source'] = imageIndex
    expected['buffers'][0]['byteLength'] = newLength
    assert json.loads(after) == expected, 'byte edits are exactly the four structural edits'
    assert Splice(after, edits, forward=False) == data
    out = Pack(after, glb.raw[glb.base:] + padded)
    return out, edits, {'bufferView': viewIndex, 'image': imageIndex, 'byteOffset': offset, 'byteLength': len(image), 'binPadding': len(padded) - len(image)}


def Undo(raw, recipe, spec):
    row = next(r for r in recipe['assets'] if r['asset'] == spec['asset'])
    assert Sha(raw) == row['after']['sha256'], 'exact reviewed wrist-seam asset'
    glb = Glb(raw)
    before = Splice(glb.raw[20:20 + glb.jsonLength].rstrip(b' '), row['jsonEdits'], forward=False)
    keep = row['before']['binChunkLength']
    appended, size = glb.raw[glb.base + keep:], recipe['texture']['after']['bytes']
    assert Sha(appended[:size]) == recipe['texture']['after']['sha256'] and appended[size:] == b'\0' * (len(appended) - size)
    out = Pack(before, glb.raw[glb.base:glb.base + keep], row['before']['jsonChunkLength'])
    assert Sha(out) == row['before']['sha256'], 'undo restores every previous byte'
    return out


def Source(project, spec):
    raw = (project / spec['asset']).read_bytes()
    if Sha(raw) == spec['before']:
        return raw
    recipePath = project / RECIPE
    if recipePath.exists():
        recipe = json.loads(recipePath.read_text(encoding='utf-8'))
        row = next((r for r in recipe['assets'] if r['asset'] == spec['asset']), None)
        if row and Sha(raw) == row['after']['sha256']:
            return Undo(raw, recipe, spec)
    raise SystemExit(f'{spec["asset"]}: neither the reviewed pre-seam asset nor the reviewed wrist-seam asset')


def Bake(project, sources):
    taper = json.loads((project / TAPER).read_text(encoding='utf-8'))
    glbs = [Glb(raw) for raw in sources]
    production = glbs[0]
    textureIndex, source = production.NormalTexture()
    imageBytes = production.ImageBytes(source)
    for g in glbs[1:]:
        assert g.NormalTexture() == (textureIndex, source) and g.ImageBytes(source) == imageBytes, 'both GLBs share the skin normal map'
        for key in ('TEXCOORD_0',):
            assert np.array_equal(g.Read(g.primitive['attributes'][key]), production.Read(production.primitive['attributes'][key]))
        assert np.array_equal(g.Read(g.primitive['indices']), production.Read(production.primitive['indices']))
    original = Decode(imageBytes)
    field = WristField(production, taper)
    fixed, report = Fix(original, production, field)
    encoded = Encode(fixed)
    assets, outputs = [], []
    for spec, g in zip(ASSETS, glbs):
        out, edits, placement = Apply(g, encoded, textureIndex)
        after = Glb(out)
        assert after.raw[after.base:after.base + g.binLength] == g.raw[g.base:], 'previous BIN bytes kept in place'
        assert Undo(out, {'assets': [{'asset': spec['asset'], 'jsonEdits': edits, 'before': {'sha256': Sha(g.raw), 'jsonChunkLength': g.jsonLength, 'binChunkLength': g.binLength}, 'after': {'sha256': Sha(out)}}], 'texture': {'after': {'bytes': len(encoded), 'sha256': Sha(encoded)}}}, spec) == g.raw
        assets.append({'asset': spec['asset'],
                       'before': {'sha256': Sha(g.raw), 'bytes': len(g.raw), 'jsonChunkLength': g.jsonLength, 'binChunkLength': g.binLength},
                       'after': {'sha256': Sha(out), 'bytes': len(out), 'jsonChunkLength': after.jsonLength, 'binChunkLength': after.binLength},
                       'placement': placement, 'jsonEdits': edits})
        outputs.append(out)
    flat = PARAMETERS['flatRgb']
    recipe = {
        'version': 1,
        'baker': '_blender/Script_FpsWristNormalSeamBake.py',
        'test': 'Script_FpsWristNormalSeamTest.mjs',
        'previousLayer': TAPER,
        'method': ('Bridge triangles = skin triangles within bridgeWindowMm of the forearm taper end plane (sides.*.frame/endPlane of the '
                   'previous layer) with vertices on both sides of it. Per vertex h = tilted-axis distance past the first hand ring '
                   '(max end-plane coordinate of the bridge ring vertices, per side); per pixel h is interpolated with pixel-centre '
                   'barycentrics (minimum over covering triangles). Weight w = smoothstep((h - holdMm) / fadeMm) on bridge and hand '
                   'triangles with h < holdMm + fadeMm; uncovered texels in the edited box are filled by gutterPx synchronous '
                   '8-neighbour growth steps from every covered skin texel (weight 1 outside the zone), each taking the minimum of '
                   'neighbours assigned in earlier steps. Edited texel = floor((1 - w) * flatRgb + w * original + 0.5) per channel; all other texels are the '
                   'libwebp decode of the original image, byte for byte.'),
        'mesh': {'material': SKIN_MATERIAL, 'meshIndex': production.meshIndex, 'primitiveIndex': production.primitiveIndex,
                 'fieldAsset': ASSETS[0]['asset']},
        'unchanged': 'Every previous byte stays in place: the old image remains in the BIN unreferenced; geometry, UVs, weights, morphs, '
                     'materials and every other texture are untouched. Only texture %d (the skin normal map) points at the new image.' % textureIndex,
        'parameters': PARAMETERS,
        'texture': {'index': textureIndex,
                    'before': {'image': source, 'name': production.doc['images'][source]['name'], 'sha256': Sha(imageBytes), 'bytes': len(imageBytes),
                               'chunk': imageBytes[12:16].decode(), 'decodedRgbSha256': Sha(original.tobytes())},
                    'after': {'name': IMAGE_NAME, 'sha256': Sha(encoded), 'bytes': len(encoded), 'chunk': 'VP8L',
                              'decodedRgbSha256': Sha(fixed.tobytes())},
                    'size': [int(original.shape[1]), int(original.shape[0])]},
        'sides': field['ring'],
        'editBox': report['box'],
        'counts': report['counts'],
        'stats': report['stats'],
        'flatTiltDeg': round(float(Tilt(np.asarray([flat], dtype=np.uint8))[0]), 4),
        'assets': assets,
        'runtime': {'python': sys.version.split()[0], 'numpy': np.__version__, 'pillow': PIL.__version__, 'libwebp': features.version('webp')},
    }
    return recipe, outputs


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--project', default=str(Path(__file__).resolve().parents[1]))
    parser.add_argument('--bake', action='store_true')
    parser.add_argument('--undo', action='store_true')
    parser.add_argument('--output', help='folder for --undo output, or an alternative bake output folder')
    parser.add_argument('--preview', help='also write before/after PNG crops of the edited box here')
    args = parser.parse_args(argv)
    project = Path(args.project).resolve()
    if args.undo:
        recipe = json.loads((project / RECIPE).read_text(encoding='utf-8'))
        out = Path(args.output)
        out.mkdir(parents=True, exist_ok=True)
        for spec in ASSETS:
            restored = Undo((project / spec['asset']).read_bytes(), recipe, spec)
            (out / Path(spec['asset']).name).write_bytes(restored)
            print('restored', spec['asset'], Sha(restored))
        return
    assert args.bake, 'pass --bake or --undo'
    sources = [Source(project, spec) for spec in ASSETS]
    recipe, outputs = Bake(project, sources)
    target = Path(args.output).resolve() if args.output else project
    for spec, out in zip(ASSETS, outputs):
        path = target / spec['asset']
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(out)
    recipePath = target / RECIPE
    recipePath.parent.mkdir(parents=True, exist_ok=True)
    recipePath.write_text(json.dumps(recipe, indent=1) + '\n', encoding='utf-8', newline='\n')
    if args.preview:
        preview = Path(args.preview)
        preview.mkdir(parents=True, exist_ok=True)
        x0, y0, x1, y1 = recipe['editBox']
        for name, raw in (('before', sources[0]), ('after', outputs[0])):
            g = Glb(raw)
            rgb = Decode(g.ImageBytes(g.NormalTexture()[1]))
            Image.fromarray(rgb).save(preview / f'Normal_{name}.png')
    print(json.dumps({k: recipe[k] for k in ('sides', 'counts', 'stats', 'editBox')} | {'assets': [{k: r[k]['sha256'] if k in ('before', 'after') else r[k] for k in ('asset', 'before', 'after')} for r in recipe['assets']]}, indent=1))


if __name__ == '__main__':
    main(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else None)
