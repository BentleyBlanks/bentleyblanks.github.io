"""Assemble the Blender geometry and bake the exterior finish into the authored UVs (Pillow, NumPy)."""
import copy
import hashlib
import io
import json
import struct
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def ReadGlb(path):
    raw = path.read_bytes()
    size = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20 + size])
    data = memoryview(raw)[28 + size:]
    views = [data[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']] for view in doc['bufferViews']]
    return doc, views, hashlib.sha256(raw).hexdigest()


def WriteGlb(path, doc, views):
    data = bytearray()
    for view, chunk in zip(doc['bufferViews'], views, strict=True):
        data.extend(b'\0' * (-len(data) % 4))
        view.update(byteOffset=len(data), byteLength=len(chunk))
        data.extend(chunk)
    doc['buffers'][0]['byteLength'] = len(data)
    data.extend(b'\0' * (-len(data) % 4))
    meta = json.dumps(doc, separators=(',', ':')).encode()
    meta += b' ' * (-len(meta) % 4)
    path.write_bytes(struct.pack('<4sIIII', b'glTF', 2, len(meta) + len(data) + 28, len(meta), 0x4e4f534a)
                     + meta + struct.pack('<II', len(data), 0x004e4942) + data)
    return hashlib.sha256(path.read_bytes()).hexdigest()


def AssembleGeometry(doc, views, geometry, newViews):
    def Array(index):
        accessor = geometry['accessors'][index]
        view = geometry['bufferViews'][accessor['bufferView']]
        dtype = np.dtype({5123: '<u2', 5125: '<u4', 5126: '<f4'}[accessor['componentType']])
        width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[accessor['type']]
        return np.ndarray((accessor['count'], width), dtype=dtype, buffer=newViews[accessor['bufferView']],
                          offset=accessor.get('byteOffset', 0), strides=(view.get('byteStride', width * dtype.itemsize), dtype.itemsize))

    def Replace(index, array):
        accessor = geometry['accessors'][index]
        view = geometry['bufferViews'][accessor['bufferView']]
        accessor.pop('byteOffset', None)
        view.pop('byteStride', None)
        array = np.ascontiguousarray(array)
        accessor.update(count=len(array), min=array.min(axis=0).tolist(), max=array.max(axis=0).tolist())
        newViews[accessor['bufferView']] = array.tobytes()

    originals = {node['extras']['SourceObject']: node for node in doc['nodes'] if 'mesh' in node}
    changed = {}
    for node in geometry['nodes']:
        if 'mesh' not in node:
            continue
        name = node['extras']['SourceObject']
        target = originals[name]
        assert all(node.get(key) == target.get(key) for key in ('matrix', 'translation', 'rotation', 'scale'))
        original = doc['meshes'][target['mesh']]['primitives'][0]
        prepared = geometry['meshes'][node['mesh']]['primitives'][0]
        assert original['attributes'].keys() == prepared['attributes'].keys()
        positions = Array(prepared['attributes']['POSITION'])
        faces = Array(prepared['indices']).reshape(-1, 3)
        cross = np.cross(positions[faces[:, 1]] - positions[faces[:, 0]], positions[faces[:, 2]] - positions[faces[:, 0]])
        valid = np.linalg.norm(cross, axis=1) > 1e-12
        offset = np.asarray(node.get('translation', [0, 0, 0]), dtype=np.float64)
        runtime = (positions.astype(np.float64) + offset).astype(np.float32).astype(np.float64)
        runtime = (runtime + [0, -.005, -.027]).astype(np.float32).astype(np.float64)
        evaluated = np.cross(runtime[faces[:, 1]] - runtime[faces[:, 0]], runtime[faces[:, 2]] - runtime[faces[:, 0]])
        valid &= np.linalg.norm(evaluated, axis=1) > 1e-12
        if not valid.all():
            Replace(prepared['indices'], faces[valid].reshape(-1, 1))
        normals = Array(prepared['attributes']['NORMAL'])
        tangentIndex = prepared['attributes']['TANGENT']
        tangents = Array(tangentIndex).copy()
        directions = tangents[:, :3]
        directions -= normals * np.sum(normals * directions, axis=1, keepdims=True)
        missing = np.linalg.norm(directions, axis=1) < .01
        for normal, vertex in zip(normals[missing], np.flatnonzero(missing)):
            directions[vertex] = np.cross(normal, np.eye(3)[np.argmin(np.abs(normal))])
        directions /= np.linalg.norm(directions, axis=1, keepdims=True)
        tangents[:, 3] = np.where(tangents[:, 3] < 0, -1, 1)
        Replace(tangentIndex, tangents)
        delta = (geometry['accessors'][prepared['indices']]['count'] - doc['accessors'][original['indices']]['count']) // 3
        changed[name] = delta
        for oldId, newId in [(original['indices'], prepared['indices']), *[(value, prepared['attributes'][key]) for key, value in original['attributes'].items()]]:
            oldView = doc['accessors'][oldId]['bufferView']
            attribute = copy.deepcopy(geometry['accessors'][newId])
            newView = attribute['bufferView']
            views[oldView] = newViews[newView]
            doc['bufferViews'][oldView] = copy.deepcopy(geometry['bufferViews'][newView])
            attribute['bufferView'] = oldView
            doc['accessors'][oldId] = attribute
    return changed


def Noise(rng, size, grid):
    cells = rng.integers(0, 256, (grid[1], grid[0]), dtype=np.uint8)
    return (np.asarray(Image.fromarray(cells).resize(size, Image.Resampling.BICUBIC), dtype=np.float32) - 128) / 96


def Refinish(doc, views):
    def ImageInfo(slot):
        return doc['images'][doc['textures'][slot['index']]['source']]

    def Load(slot):
        return Image.open(io.BytesIO(views[ImageInfo(slot)['bufferView']])).convert('RGB')

    def Store(slot, rgb):
        output = io.BytesIO()
        Image.fromarray(np.clip(np.rint(rgb), 0, 255).astype(np.uint8)).save(output, 'PNG', compress_level=6)
        views[ImageInfo(slot)['bufferView']] = output.getvalue()

    stats = {}
    for node in doc['nodes']:
        if 'mesh' not in node:
            continue
        name = node['extras']['SourceObject']
        index = doc['meshes'][node['mesh']]['primitives'][0]['material']
        material = doc['materials'][index]
        pbr = material['pbrMetallicRoughness']
        if 'baseColorTexture' not in pbr:
            pbr['roughnessFactor'] = .46
            continue
        image = Load(pbr['baseColorTexture'])
        color = np.asarray(image, dtype=np.float32)
        orm = np.array(Load(pbr['metallicRoughnessTexture']))
        wood = name in ('Wood_UpperFittedCrown05', 'T38_460G_WoodGroove_VisualCandidate')
        bright = name in ('Exterior_HandleOval08', 'T38_435F2_VisualBackingRearEnd')
        coverage = orm[:, :, 0:1].astype(np.float32) / 255
        rng = np.random.default_rng(3800 + index)
        cloud = Noise(rng, image.size, (23, 19))
        patina = Noise(rng, image.size, (74, 66))
        stroke = Noise(rng, image.size, (max(16, image.width // 4), max(12, image.height // 27)))
        wear = np.maximum(0, patina + .48 * cloud - .85)
        soften = np.asarray(image.filter(ImageFilter.GaussianBlur(2 if wood else 1.1)), dtype=np.float32)
        local = color - soften
        if wood:
            value = color.mean(axis=2, keepdims=True)
            broad = np.asarray(image.filter(ImageFilter.GaussianBlur(7)), dtype=np.float32)
            graded = .75 * color + .25 * value - .48 * local - .37 * (soften - broad)
            brightFibre = np.maximum(0, graded[:, :, 0:1] - 84) * .24
            graded = graded * np.array([1.04, .98, .86]) + np.array([2, 1.6, .6]) - brightFibre
            rough = 85 + 12 * cloud + 6 * patina + 5 * stroke
            material['extensions']['KHR_materials_clearcoat']['clearcoatFactor'] = .65
        else:
            value = color.mean(axis=2, keepdims=True)
            graded = .61 * color + .39 * value - .2 * local
            if name in ('Exterior_MiddleBand57', 'Exterior_ButtCap04'):
                graded = .92 * graded + np.array([15, 14.2, 13.3])
            elif bright:
                graded = .88 * graded + np.array([14, 14, 13])
            else:
                graded = .84 * graded + np.array([6.5, 6.2, 6.3])
            graded += (1.6 * cloud + 1.5 * stroke + 4.5 * wear)[:, :, None]
            rough = (81 if bright else 115) + 11 * cloud + 7 * patina + 7 * stroke - 12 * wear
        Store(pbr['baseColorTexture'], color + (graded - color) * coverage)
        roughness = orm[:, :, 1].astype(np.float32)
        revised = .26 * roughness + .74 * np.clip(rough, 55, 179)
        orm[:, :, 1] = np.rint(roughness + (revised - roughness) * coverage[:, :, 0]).astype(np.uint8)
        Store(pbr['metallicRoughnessTexture'], orm)
        if wood and 'normalTexture' in material:
            slot = material['normalTexture']
            normal = np.asarray(Load(slot), dtype=np.float32) / 127.5 - 1
            relief = (soften[:, :, 0] * .16 + local[:, :, 0] * .18) * coverage[:, :, 0]
            vertical, horizontal = np.gradient(relief)
            normal[:, :, 0] -= np.clip(horizontal * .021, -.11, .11)
            normal[:, :, 1] += np.clip(vertical * .021, -.11, .11)
            normal /= np.maximum(1e-5, np.linalg.norm(normal, axis=2, keepdims=True))
            Store(slot, (normal + 1) * 127.5)
        valid = coverage[:, :, 0] > .9
        stats[name] = [round(float(np.percentile(orm[:, :, 1][valid], percentile)), 1) for percentile in [10, 50, 90]]
    return stats


def Build():
    repo = Path(__file__).resolve().parents[2]
    work = repo / 'tmp/Type38Review'
    out = repo / 'Taierzhuang1938/Model/Type38_511'
    if sys.argv[1:] == ['--stage']:
        work.mkdir(parents=True, exist_ok=True)
        for source, target in [('Model_Type38_511.glb', 'Before.glb'), ('Data_Type38_511.json', 'Before.json')]:
            spec = f'33062973:Taierzhuang1938/Model/Type38_511/{source}'
            (work / target).write_bytes(subprocess.check_output(['git', '-C', str(repo), 'show', spec]))
        return
    doc, views, baseline = ReadGlb(work / 'Before.glb')
    assert baseline == '77768c563db9fe7a3db3b0fd937279b4b6d05eb058cc441cafb3bcda0e668ad5'
    geometry, draft, _ = ReadGlb(work / 'ExteriorGeometry.glb')
    changes = AssembleGeometry(doc, views, geometry, draft)
    finish = Refinish(doc, views)
    triangles = 69586 + sum(changes.values())
    assert triangles <= 80000
    doc['asset']['extras'].update(runtimeTriangles=triangles, version='Type38_Exterior20261122', originalImagePayloadsPreserved=False)
    digest = WriteGlb(out / 'Model_Type38_511.glb', doc, views)
    manifest = json.loads((work / 'Before.json').read_text(encoding='utf8'))
    manifest.update(version=2, runtimeSha256=digest, triangles=triangles, generator='_blender/Script_Type38Exterior.py + _blender/Script_Type38ExteriorFinish.py',
                    exteriorBaselineSha256=baseline, exteriorTriangleDeltas=changes, finishRoughnessP10P50P90=finish,
                    historicalReferences=['https://www.awm.gov.au/collection/C142149', 'https://www.awm.gov.au/collection/C138903',
                                          'https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle.JPG',
                                          'https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(front_stock_detail).JPG',
                                          'https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_rear_sight_(top_view).JPG',
                                          'https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_action.JPG'])
    for record, image in zip(manifest['imagePayloads'], doc['images'], strict=True):
        chunk = views[image['bufferView']]
        record.update(bytes=len(chunk), sha256=hashlib.sha256(chunk).hexdigest())
    (out / 'Data_Type38_511.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    lodPath = out / 'Data_Type38NpcLod.json'
    lod = json.loads(lodPath.read_text(encoding='utf8'))
    assert lod['part'] not in changes and lod['before'] == 5760 and lod['after'] == 1152
    lod.update(sourceSha256=digest, fpsTriangles=triangles, npcTriangles=triangles - lod['before'] + lod['after'])
    lodPath.write_text(json.dumps(lod, indent=2) + '\n', encoding='utf8')
    print(digest, triangles, changes)


if __name__ == '__main__':
    Build()
