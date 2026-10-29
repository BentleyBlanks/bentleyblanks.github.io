"""Fill the empty texels outside the UV islands of every 173R PBR image.

Dots' baked PNGs leave everything outside the UV islands at 0 (BaseColor black,
ORM roughness 0 / metallic 0, Normal 0). Blender renders the base level and does
not show it; a game samples mipmaps, where those zeros average into the island
edges: the steel turns into black, glossy dielectric seams and smudges, worst at
grazing angles. This rewrites only the empty texels, by pull-push filling from the
island texels; island texels keep their exact values and bit depth.

Coverage comes from the part's ORM red channel, which the delivery fixes at 1
inside the bake (not baked AO) and leaves 0 outside.

usage: python Script_HanYang173RDilateTextures.py <in.glb> <out.glb> [report.json]
"""
import hashlib
import json
import struct
import sys

import cv2
import numpy as np


def ReadGlb(path):
    data = open(path, 'rb').read()
    assert struct.unpack_from('<I', data, 0)[0] == 0x46546C67
    json_len = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20 + json_len])
    bin_len = struct.unpack_from('<I', data, 20 + json_len)[0]
    bin_start = 28 + json_len
    return doc, data[bin_start:bin_start + bin_len]


def WriteGlb(path, doc, chunks):
    # chunks: list of bytes per bufferView, in bufferView order
    out = bytearray()
    for view, payload in zip(doc['bufferViews'], chunks):
        out += b'\0' * ((-len(out)) % 4)
        view['byteOffset'] = len(out)
        view['byteLength'] = len(payload)
        out += payload
    out += b'\0' * ((-len(out)) % 4)
    doc['buffers'][0]['byteLength'] = len(out)
    text = json.dumps(doc, separators=(',', ':')).encode()
    text += b' ' * ((-len(text)) % 4)
    total = 12 + 8 + len(text) + 8 + len(out)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(text), 0x4E4F534A)); f.write(text)
        f.write(struct.pack('<II', len(out), 0x004E4942)); f.write(out)


def PullPush(image, valid):
    """Fill invalid texels from a coverage-weighted pyramid; valid texels unchanged."""
    work = image.astype(np.float32)
    if work.ndim == 2:
        work = work[..., None]
    weight = valid.astype(np.float32)
    levels = []
    color, w = work * weight[..., None], weight
    while min(w.shape) > 1:
        levels.append((color, w))
        h2, w2 = max(1, w.shape[0] // 2), max(1, w.shape[1] // 2)
        color = cv2.resize(color, (w2, h2), interpolation=cv2.INTER_AREA)
        if color.ndim == 2:
            color = color[..., None]
        w = cv2.resize(w, (w2, h2), interpolation=cv2.INTER_AREA)
    filled = color / np.maximum(w, 1e-8)[..., None]
    for color, w in reversed(levels):
        up = cv2.resize(filled, (w.shape[1], w.shape[0]), interpolation=cv2.INTER_LINEAR)
        if up.ndim == 2:
            up = up[..., None]
        level = color / np.maximum(w, 1e-8)[..., None]
        a = np.clip(w, 0, 1)[..., None]
        filled = level * a + up * (1 - a)
    result = np.where(valid[..., None], work, filled)
    if image.ndim == 2:
        result = result[..., 0]
    info = np.iinfo(image.dtype)
    return np.clip(np.rint(result), info.min, info.max).astype(image.dtype)


def main():
    src, dst = sys.argv[1], sys.argv[2]
    report_path = sys.argv[3] if len(sys.argv) > 3 else None
    doc, binary = ReadGlb(src)
    views = [bytes(binary[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]) for v in doc['bufferViews']]
    image_view = {i: img['bufferView'] for i, img in enumerate(doc['images'])}
    texture_image = {t_index: t['source'] for t_index, t in enumerate(doc['textures'])}

    def Decode(image_index):
        raw = np.frombuffer(views[image_view[image_index]], np.uint8)
        return cv2.imdecode(raw, cv2.IMREAD_UNCHANGED)

    report = []
    done = set()
    for material in doc['materials']:
        pbr = material.get('pbrMetallicRoughness', {})
        orm_index = texture_image[pbr['metallicRoughnessTexture']['index']]
        orm = Decode(orm_index)
        # cv2 is BGR: ORM red is the last channel. Bake coverage is R = 1.
        scale = np.iinfo(orm.dtype).max
        valid = orm[..., 2] > scale // 2
        coverage = float(valid.mean())
        for slot, texture in (('baseColor', pbr.get('baseColorTexture')), ('orm', pbr.get('metallicRoughnessTexture')),
                              ('normal', material.get('normalTexture'))):
            if texture is None:
                continue
            image_index = texture_image[texture['index']]
            if image_index in done:
                continue
            done.add(image_index)
            image = Decode(image_index)
            mask = valid
            if mask.shape != image.shape[:2]:
                mask = cv2.resize(valid.astype(np.uint8), (image.shape[1], image.shape[0]), interpolation=cv2.INTER_NEAREST) > 0
            filled = PullPush(image, mask)
            assert np.array_equal(filled[mask], image[mask]), 'island texels must stay byte-exact'
            ok, encoded = cv2.imencode('.png', filled, [cv2.IMWRITE_PNG_COMPRESSION, 9])
            assert ok
            before = views[image_view[image_index]]
            views[image_view[image_index]] = encoded.tobytes()
            report.append({'name': doc['images'][image_index].get('name'), 'material': material.get('name'), 'slot': slot,
                           'size': [int(image.shape[1]), int(image.shape[0])], 'bitDepth': int(image.dtype.itemsize * 8),
                           'islandCoverage': round(coverage, 4),
                           'sourceSha256': hashlib.sha256(before).hexdigest(),
                           'sha256': hashlib.sha256(views[image_view[image_index]]).hexdigest()})
    assert len(done) == len(doc['images']), 'every image must belong to a material slot'
    WriteGlb(dst, doc, views)
    if report_path:
        json.dump(report, open(report_path, 'w'), indent=1)
    print(f'filled {len(done)} images -> {dst}')


if __name__ == '__main__':
    main()
