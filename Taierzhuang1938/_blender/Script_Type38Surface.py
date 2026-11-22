"""Bake scanned surface layers into the existing game UVs without altering any mesh."""
import argparse
import hashlib
import io
import json
import subprocess
import urllib.request
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, gaussian_filter

from Script_Type38ExteriorFinish import FrameEngraving, ReadGlb, WriteGlb


SAMPLES = {
    'grain': ('wood_table_001', 'diff', '4k', '5da68c7ebe8732f029ecbd602cb0d86d2a271e32539df953a0f10efa052b9516'),
    'pores': ('wood_table_001', 'disp', '4k', '64948be76b2384e79459f0d5ac6fd88912c64e71377e3ade2ec7b18480f532f0'),
    'woodGloss': ('wood_table_001', 'rough', '4k', '1349d61fee3ccc6f6b4bfe5f49ebf4803c1d88bd4ba2c6e2fd3a40da84a459af'),
    'steel': ('metal_plate_02', 'rough', '2k', '7abccc92dfebe4c6fd21b57b4de659a3b8be7747434af39306fcff2059927734'),
}


def ReadSamples(cache):
    cache.mkdir(exist_ok=True, parents=True)
    layers = {}
    for key, (asset, channel, resolution, digest) in SAMPLES.items():
        leaf = f'{asset}_{channel}_{resolution}.jpg'
        path = cache / leaf
        if not path.is_file():
            url = f'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/{resolution}/{asset}/{leaf}'
            raw = urllib.request.urlopen(url, timeout=120).read()
            if hashlib.sha256(raw).hexdigest() != digest:
                raise ValueError(f'Unexpected source at {url}')
            path.write_bytes(raw)
        if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise ValueError(f'Invalid source: {path}')
        bitmap = np.array(Image.open(path).convert('L'))
        layers[key] = bitmap[155:775, 190:690] if key == 'steel' else bitmap
    return layers


def Attribute(doc, views, index, width):
    field = doc['accessors'][index]
    return np.frombuffer(views[field['bufferView']], dtype={5123: '<u2', 5125: '<u4', 5126: '<f4'}[field['componentType']]).reshape(-1, width)


def SurfaceAtlas(doc, views, primitive, size):
    attrs = primitive['attributes']
    points = Attribute(doc, views, attrs['POSITION'], 3)
    uv = Attribute(doc, views, attrs['TEXCOORD_0'], 2) * size - .5
    smooth = Attribute(doc, views, attrs['NORMAL'], 3)
    faces = Attribute(doc, views, primitive['indices'], 3).astype(np.int32)
    unique, weld = np.unique(np.round(points, 6), axis=0, return_inverse=True)
    accum = np.zeros((len(unique), 3), np.float32)
    cross = np.cross(points[faces[:, 1]] - points[faces[:, 0]], points[faces[:, 2]] - points[faces[:, 0]])
    cross /= np.maximum(1e-12, np.linalg.norm(cross, axis=1, keepdims=True))
    for corner in range(3):
        np.add.at(accum, weld[faces[:, corner]], cross)
    accum /= np.maximum(1e-8, np.linalg.norm(accum, axis=1, keepdims=True))
    bend = np.linalg.norm(cross[:, None] - accum[weld[faces]], axis=2)
    field = np.zeros((size[1], size[0], 7), np.float32)
    valid = np.zeros(field.shape[:2], bool)
    for faceIndex, face in enumerate(faces):
        triangle = uv[face]
        edges = triangle[1:] - triangle[0]
        determinant = edges[0, 0] * edges[1, 1] - edges[1, 0] * edges[0, 1]
        if abs(determinant) < .0001:
            continue
        left, top = np.maximum(np.ceil(triangle.min(axis=0)).astype(int), 0)
        right, bottom = np.minimum(np.floor(triangle.max(axis=0)).astype(int), np.asarray(size) - 1)
        if left > right or top > bottom:
            continue
        cols = np.arange(left, right + 1)[None, :] - triangle[0, 0]
        rows = np.arange(top, bottom + 1)[:, None] - triangle[0, 1]
        weightB = (cols * edges[1, 1] - rows * edges[1, 0]) / determinant
        weightC = (rows * edges[0, 0] - cols * edges[0, 1]) / determinant
        hit = (weightB >= -1e-6) & (weightC >= -1e-6) & (weightB + weightC <= 1.000001)
        if not hit.any():
            continue
        row, col = np.nonzero(hit)
        values = np.column_stack((points[face], smooth[face], bend[faceIndex]))
        field[top + row, left + col] = values[0] + weightB[hit, None] * (values[1]-values[0]) + weightC[hit, None] * (values[2]-values[0])
        valid[top + row, left + col] = True
    assert valid.any()
    distance, near = distance_transform_edt(~valid, return_indices=True)
    pad = (~valid) & (distance <= 18)
    field[pad] = field[near[0, pad], near[1, pad]]
    return field, valid | pad, valid


def Sample(layer, horizontal, vertical, reflect=False):
    height, width = layer.shape
    if reflect:
        horizontal = 1 - np.abs(np.mod(horizontal, 2) - 1)
        vertical = 1 - np.abs(np.mod(vertical, 2) - 1)
    return cv2.remap(layer, (horizontal % 1 * (width-1)).astype('f'), (vertical % 1 * (height-1)).astype('f'),
                     cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT).astype('f')


def Tint(dark, light, factor):
    return np.array(dark, dtype='f') + factor[:, :, None] * (np.array(light, dtype='f') - dark)


def Blend(first, second, mask):
    return first + (second - first) * mask[:, :, None]


def Build(cache):
    repo = Path(__file__).resolve().parents[2]
    folder = repo / 'Taierzhuang1938/Model/Type38_511'
    def Original(file):
        return subprocess.check_output(['git', '-C', str(repo), 'show', f'8fd3c955:Taierzhuang1938/Model/Type38_511/{file}'])
    doc, views, baseline = ReadGlb(Original('Model_Type38_511.glb'))
    assert baseline == '285f3258e5bf03d56f1aff6e9390a985e1640a98282e009a6ee30d9a27dda3bb'
    source = ReadSamples(cache)
    stats = {}
    def Slot(slot):
        return doc['images'][doc['textures'][slot['index']]['source']]['bufferView']
    def Load(slot):
        return np.array(Image.open(io.BytesIO(views[Slot(slot)])))
    def Store(slot, array):
        stream = io.BytesIO()
        Image.fromarray(np.uint8(np.clip(np.rint(array), 0, 255))).save(stream, 'PNG', compress_level=6)
        views[Slot(slot)] = stream.getvalue()
    for node in doc['nodes']:
        if 'mesh' not in node:
            continue
        part = node['extras']['SourceObject']
        primitive = doc['meshes'][node['mesh']]['primitives'][0]
        material = doc['materials'][primitive['material']]
        pbr = material['pbrMetallicRoughness']
        if 'baseColorTexture' not in pbr:
            continue
        baseSlot, ormSlot = pbr['baseColorTexture'], pbr['metallicRoughnessTexture']
        orm = Load(ormSlot).astype('f')
        height, width = orm.shape[:2]
        field, padded, valid = SurfaceAtlas(doc, views, primitive, (width, height))
        side, up, length, normalSide, normalUp, normalLength, bend = np.moveaxis(field, 2, 0)
        angle = .4 * np.sin(11.3 * length) + .15 * np.sin(31 * length)
        wood = 'Wood' in part
        transverse = (up * .92 + side * .42 + length * .023 + .0018 * np.sin(16 * length))
        along = length + side * .19
        band = part == 'Exterior_MiddleBand57'
        bare = band or part in ('Exterior_HandleOval08', 'T38_435F2_VisualBackingRearEnd', 'T38_440D2_IndependentVisibleRecess', 'SightDetail335_CentralVisibleBacking_ART_ASSUMED_DEPTH', 'SightDetailV3_DecorativeConvexRoundSurface', 'Exterior_FoldedFrame12', 'SightDetailV3_ShallowVisibleEdgeFacets_ART_ONLY')
        weights = np.stack([normalSide,normalUp,normalLength]) ** 4
        weights /= np.maximum(weights.sum(axis=0), .0001)
        def SteelPatch(scale, bias):
            result = np.zeros_like(length)
            for weight, horizontal, vertical in zip(weights, [length,length,side], [up,side,up], strict=True):
                result += weight * Sample(source['steel'], horizontal * scale + bias, vertical * scale * 1.17 + bias * .7, True)
            return np.clip((result - 155) / 66, -1.5, 1.5)
        stain = SteelPatch(8.7, .43)
        grainSteel = SteelPatch(42, .16)
        edge = np.clip((bend - .025) * 2.7, 0, 1)
        edge *= np.clip(.40 + .36 * grainSteel + .23 * stain, .04, 1)
        rubbed = np.clip(.33 + .36 * stain + .16 * grainSteel + .50 * edge, 0, 1)
        if wood:
            separate = part == 'Wood_UpperFittedCrown05'
            across = (.13 if separate else .73) + transverse * 1.10 + side * side * 16 + .0035 * np.sin(8.4 * length)
            down = (.63 if separate else .34) - along * 1.44
            rgbScan = Sample(source['grain'], across, down)
            poreScan = Sample(source['pores'], across, down)
            glossScan = Sample(source['woodGloss'], across, down)
            fibre = np.clip((rgbScan - 15) / 49, 0, 1.3)
            pore = np.clip((132 - poreScan) / 51, -.7, 1.15)
            handling = np.exp(-((length-.025) / .115) ** 2) + .65 * np.exp(-((length+.5) / .16) ** 2)
            handling *= np.clip(.56 + .27 * normalSide ** 2 + .23 * stain, 0, 1)
            amber = np.clip(.27 + .47 * fibre + .055 * stain + .05 * angle, .06, .94)
            color = Tint([58,29,19] if separate else [57,30,20], [152,85,43] if separate else [149,89,49], amber)
            breach = np.clip((.74 * edge + .30 * stain + .22 * grainSteel - .49) * 2.0, 0, .90)
            color = Blend(color, Tint([88,56,35], [155,111,70], fibre), breach * .85)
            rough = 105 + .39*(glossScan-60) + 10*pore + 11*stain - 25*handling + breach*47
            coat = material['extensions']['KHR_materials_clearcoat']
            coat['clearcoatFactor'] = .81
            varnish = Load(coat['clearcoatTexture'])
            varnish[:, :, 0] = np.where(padded, np.clip(145 + 31*handling - 24*pore - 106*breach, 0, 220), 0)
            varnish[:, :, 1] = np.where(padded, np.clip(81 + .57*(glossScan-60) + 15*pore + 10*stain - 18*handling + 43*breach, 36, 143), 0)
            metal = np.zeros_like(rough)
            if not separate:
                inlay = np.clip((orm[:, :, 2]-26)/196, 0, 1)
                color = Blend(color, Tint([83,82,78],[134,131,122],rubbed), inlay)
                metal = inlay * 250
                varnish[:, :, 0] = np.rint(varnish[:, :, 0]*(1-inlay))
                rough += inlay * (111 + grainSteel*11 - rough)
            Store(coat['clearcoatTexture'], varnish)
            relief = (poreScan-132) * .0042 + (rgbScan-36) * .0016
        else:
            if bare:
                dark, light = ([108,108,104],[173,173,166]) if band else ([118,120,119],[193,194,187])
                if part.startswith('Exterior_Folded') or part.startswith('SightDetail'):
                    dark, light = [81,80,73],[146,144,131]
            else:
                dark, light = [40,44,47],[69,74,78]
            oxidation = np.clip((.33*grainSteel - .49*stain - .21)*1.25, 0, .70)
            color = Tint(dark, light, .19 + .68*rubbed + .10*grainSteel)
            color = Blend(color, np.array([142,145,145], dtype='f'), edge*(.23 if bare else .81))
            color = Blend(color, np.array([64,54,44], dtype='f'), oxidation*(.31 if bare else .54))
            fine = Sample(source['steel'], along*33 + .12, (up*.83 + side*.53)*162 + .63, True)
            brush = np.clip((fine - 159)/77, -1, 1)
            rough = (104 if bare else 131) - (42 if bare else 44)*rubbed + 18*oxidation + 10*grainSteel + 8*brush - 22*edge
            metal = 251 - oxidation*(36 if bare else 71)
            relief = .065*grainSteel + .055*brush
            if part == 'Exterior_FoldedFrame12':
                marks = FrameEngraving(Image.fromarray(Load(material['normalTexture'])))
                color = Blend(color, np.array([39,39,38], dtype='f'), marks*.84)
                rough += 25*marks
        if 'normalTexture' in material:
            normalSlot = material['normalTexture']
            normals = Load(normalSlot).astype('f') / 127.5 - 1
            if wood or part == 'T38_430L_VisibleUpperShoulderCoordination':
                normals[:, :, :2] = 0
                normals[:, :, 2] = 1
            gradientV, gradientU = np.gradient(gaussian_filter(relief, .55))
            direction = np.dstack((-gradientU, gradientV)) * (.86 if wood else .69)
            normals[:, :, :2] += np.clip(direction, -.33 if wood else -.18, .33 if wood else .18)
            normals /= np.maximum(1e-7, np.linalg.norm(normals, axis=2, keepdims=True))
            Store(normalSlot, np.where(padded[:, :, None], (normals+1)*127.5, [128,128,255]))
        orm[:, :, 1] = np.where(padded, np.clip(rough, 39, 196), 0)
        orm[:, :, 2] = np.where(padded, np.clip(metal, 0, 255), 0)
        Store(baseSlot, np.where(padded[:, :, None], color, 0))
        Store(ormSlot, orm)
        stats[part] = np.percentile(orm[:, :, 1][valid], [10, 50, 90]).round(1).tolist()
        print(part, stats[part], flush=True)
    doc['asset']['extras']['version'] = 'Type38_ScannedSurface01'
    digest = WriteGlb(folder/'Model_Type38_511.glb', doc, views)
    manifest = json.loads(Original('Data_Type38_511.json'))
    manifest.update(version=3, runtimeSha256=digest, generator='_blender/Script_Type38Surface.py',
                    finishRoughnessP10P50P90=stats, surfaceSources={key: value[3] for key,value in SAMPLES.items()},
                    markings=['scale graduations and numerals only'])
    for record, image in zip(manifest['imagePayloads'], doc['images'], strict=True):
        chunk = views[image['bufferView']]
        record.update(bytes=len(chunk), sha256=hashlib.sha256(chunk).hexdigest())
    for name, record in [('Data_Type38_511.json', manifest), ('Data_Type38NpcLod.json', {**json.loads(Original('Data_Type38NpcLod.json')), 'sourceSha256':digest})]:
        (folder/name).write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print('Finished:', digest, flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--cache', type=Path, default=Path(__file__).resolve().parents[2]/'tmp/Type38SurfaceSources')
    Build(parser.parse_args().cache)
