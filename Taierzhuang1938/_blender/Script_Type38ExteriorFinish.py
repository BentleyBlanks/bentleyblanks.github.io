"""Bake the photographic exterior finish into the approved Blender mesh's authored UVs."""
import hashlib
import io
import json
import struct
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def ReadGlb(raw):
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


def Noise(rng, size, grid):
    cells = rng.integers(0, 256, (grid[1], grid[0]), dtype=np.uint8)
    return (np.asarray(Image.fromarray(cells).resize(size, Image.Resampling.BICUBIC), dtype=np.float32) - 128) / 96


def ProjectArtwork(doc, views, primitive, size, stamp, bounds, coordinates):
    def Attribute(index, channels):
        accessor = doc['accessors'][index]
        return np.frombuffer(views[accessor['bufferView']], dtype={5123: '<u2', 5125: '<u4', 5126: '<f4'}[accessor['componentType']]).reshape(-1, channels)

    points = Attribute(primitive['attributes']['POSITION'], 3)
    coords = Attribute(primitive['attributes']['TEXCOORD_0'], 2) * np.asarray(size) - .5
    faces = Attribute(primitive['indices'], 3)
    ink = np.asarray(stamp, dtype=np.float32) / 255
    output = np.zeros(size[::-1], dtype=np.float32)
    for face in faces:
        vertices = points[face]
        if np.any(vertices.max(axis=0) < bounds[0]) or np.any(vertices.min(axis=0) > bounds[1]):
            continue
        triangle = coords[face]
        edges = (triangle[1:] - triangle[0]).T
        if abs(np.linalg.det(edges)) < .001:
            continue
        left, top = np.maximum(np.floor(triangle.min(axis=0)).astype(int), 0)
        right, bottom = np.minimum(np.ceil(triangle.max(axis=0)).astype(int), np.asarray(size) - 1)
        rows, cols = np.mgrid[top:bottom+1, left:right+1]
        weights = np.linalg.inv(edges) @ (np.stack((cols, rows)).reshape(2, -1) - triangle[0, :, None])
        surface = vertices[0, :, None] + (vertices[1:] - vertices[0]).T @ weights
        horizontal, vertical = coordinates(*surface)
        inside = ((weights.min(axis=0) >= -.001) & (weights.sum(axis=0) <= 1.001)
                  & np.all(surface >= np.array(bounds[0])[:, None], axis=0) & np.all(surface <= np.array(bounds[1])[:, None], axis=0)
                  & (vertical >= 0) & (vertical < 1) & (horizontal >= 0) & (horizontal < 1))
        selected = ink[(vertical[inside] * ink.shape[0]).astype(int), (horizontal[inside] * ink.shape[1]).astype(int)]
        output[rows.flat[inside], cols.flat[inside]] = selected
    assert np.count_nonzero(output > .35) > 80
    return output


def PaintStockNumber(doc, views, primitive, size):
    strokes = [[(5, 8), (8, 5), (14, 4), (18, 6), (18, 10), (12, 15), (17, 16), (20, 20), (19, 25), (14, 28), (8, 27), (5, 24)],
               [(38, 15), (34, 12), (33, 8), (36, 5), (42, 4), (46, 7), (45, 11), (40, 15), (35, 18), (33, 23), (36, 27), (42, 28), (46, 25), (46, 21), (43, 18), (38, 15)],
               [(62, 5), (78, 5), (73, 13), (69, 21), (68, 28)]]
    stamp = Image.new('L', (328, 128))
    drawing = ImageDraw.Draw(stamp)
    for path in strokes:
        drawing.line([(4 * col, 4 * row) for col, row in path], fill=255, width=14, joint='curve')
    def Coordinates(side, height, length):
        along = (-.015 - height) / .043
        return along, (length - (.226 - .006 * along)) / .012
    return ProjectArtwork(doc, views, primitive, size, stamp.filter(ImageFilter.GaussianBlur(2.5)),
                          ([.010, -.070, .213], [.022, -.010, .243]), Coordinates)


def PaintMakerLettering(doc, views, primitive, size):
    stamp = Image.new('L', (128, 520))
    drawing = ImageDraw.Draw(stamp)
    for contour in [[(38, 39), (32, 32), (26, 36), (26, 46)], [(26, 45), (19, 38), (14, 43), (15, 57)],
                    [(15, 55), (9, 48), (7, 54), (9, 67)], [(9, 66), (4, 70), (6, 81), (12, 87)],
                    [(8, 81), (8, 95), (15, 99), (21, 95)], [(16, 98), (18, 108), (27, 112), (34, 108)],
                    [(28, 111), (31, 121), (40, 123), (47, 117)], [(91, 45), (99, 38), (104, 45), (102, 54)],
                    [(104, 53), (112, 46), (116, 55), (113, 66)], [(114, 64), (122, 59), (122, 70), (118, 79)],
                    [(118, 78), (123, 84), (119, 93), (111, 96)], [(112, 94), (112, 103), (102, 109), (93, 106)]]:
        drawing.line(contour, fill=178, width=3, joint='curve')
    strokes = [[(23, 16), (101, 16)], [(30, 47), (94, 47)], [(15, 80), (111, 80)],
               [(47, 112), (51, 120), (49, 145), (42, 162), (28, 177), (12, 186)],
               [(83, 111), (78, 120), (79, 139), (85, 161), (98, 178), (113, 188)],
               [(14, 232), (110, 232)], [(73, 207), (74, 233), (80, 255), (90, 277), (103, 295), (114, 299), (114, 287)],
               [(93, 207), (104, 219)], [(19, 258), (62, 258)], [(42, 258), (42, 289)], [(13, 294), (68, 283)]]
    for path in strokes:
        drawing.line([(col, row + 192) for col, row in path], fill=245, width=6, joint='curve')
    return ProjectArtwork(doc, views, primitive, size, stamp.filter(ImageFilter.GaussianBlur(.8)),
                          ([-.009, .049, -.271], [.009, .060, -.225]),
                          lambda side, height, length: (.5 + side / .011, (length + .269) / .040))


def PaintCrestAbrasion(doc, views, primitive, size):
    vertical, horizontal = np.mgrid[-1:1:192j, -1:1:192j]
    rng = np.random.default_rng(193801)
    drag = Noise(rng, (192, 192), (57, 9))
    grain = Noise(rng, (192, 192), (95, 39))
    outline = np.clip((1 - horizontal ** 2 - vertical ** 2 + .18 * drag) * 3.1, 0, 1)
    scratches = np.clip(.46 + .42 * drag + .18 * grain, 0, 1) * outline
    stamp = Image.fromarray(np.uint8(scratches * 255))
    return ProjectArtwork(doc, views, primitive, size, stamp, ([-.008, .049, -.276], [.008, .060, -.256]),
                          lambda side, height, length: (.5 + side / .008, (length + .272) / .015))


def PaintRearMedallion(doc, views, primitive, size):
    vertical, horizontal = np.mgrid[-1:1:256j, -1:1:256j]
    radius = np.hypot(horizontal, vertical)
    angle = np.arctan2(vertical, horizontal)
    rings = radius * 14
    radial = np.cos(2 * np.pi * rings)
    lateral = np.cos(46 * angle + np.pi * np.floor(rings + .5))
    stipple = np.maximum(0, .52 * radial + .48 * lateral)
    field = np.clip((radius - .26) * 35, 0, 1) * np.clip((.95 - radius) * 32, 0, 1)
    relief = field * (.19 + .74 * stipple) + .82 * np.exp(-((radius - .235) / .021) ** 2)
    stamp = Image.fromarray(np.uint8(np.clip(relief, 0, 1) * 255))
    return ProjectArtwork(doc, views, primitive, size, stamp, ([-.015, .027, -.0518], [.015, .058, -.047]),
                          lambda side, height, length: (.5 + side / .028, .5 - (height - .0423) / .028))


def PaintBandInlay(doc, views, primitive, size):
    stamp = Image.new('L', (600, 96))
    drawing = ImageDraw.Draw(stamp)
    drawing.line([(12, 47), (93, 48), (306, 52), (430, 49), (596, 41)], fill=255, width=49, joint='curve')
    drawing.ellipse((0, 23, 26, 72), fill=255)
    return ProjectArtwork(doc, views, primitive, size, stamp.filter(ImageFilter.GaussianBlur(2)),
                          ([.008, .018, -.677], [.022, .034, -.597]),
                          lambda side, height, length: ((length + .676) / .079, (.0329 - height) / .0088))


def PaintTimberMarks(doc, views, primitive, size):
    stamp = Image.new('L', (560, 118))
    drawing = ImageDraw.Draw(stamp)
    strokes = [[(38, 89), (47, 52), (62, 20)], [(78, 102), (87, 45), (104, 13)], [(67, 103), (90, 107)],
               [(94, 35), (115, 50), (145, 58), (173, 58)], [(97, 72), (124, 43), (147, 32)],
               [(176, 17), (165, 67), (162, 92)], [(204, 17), (191, 91)], [(179, 25), (220, 31)],
               [(170, 51), (220, 55)], [(139, 86), (216, 90)], [(285, 29), (280, 69), (327, 97), (334, 62)],
               [(285, 27), (313, 24)], [(343, 12), (338, 42), (354, 42)], [(364, 26), (358, 59), (350, 73)],
               [(349, 29), (367, 42)], [(381, 30), (406, 36), (451, 43)], [(373, 68), (405, 53), (450, 53)],
               [(436, 29), (429, 82)], [(447, 24), (456, 39), (453, 69), (475, 86)], [(452, 35), (481, 32)],
               [(521, 32), (526, 52), (530, 88)]]
    for index, path in enumerate(strokes):
        drawing.line(path, fill=180 + index % 4 * 20, width=3 + index % 3, joint='curve')
    return ProjectArtwork(doc, views, primitive, size, stamp.filter(ImageFilter.GaussianBlur(.85)),
                          ([-.008, .045, -.567], [.009, .056, -.421]),
                          lambda side, height, length: ((length + .566) / .144, .50 + side / .015))


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
            inlay = None
            carving = None
            value = color.mean(axis=2, keepdims=True)
            broad = np.asarray(image.filter(ImageFilter.GaussianBlur(7)), dtype=np.float32)
            graded = .75 * color + .25 * value - .66 * local - .55 * (soften - broad)
            brightFibre = np.maximum(0, graded[:, :, 0:1] - 84) * .24
            graded = graded * np.array([1.12, .90, .75]) + np.array([.5, 1.0, .8]) - 1.4 * brightFibre
            rough = 85 + 9 * cloud + 4 * patina + 3 * stroke
            coat = material['extensions']['KHR_materials_clearcoat']
            coat['clearcoatFactor'] = .70
            surfaceSlot = coat['clearcoatTexture']
            assert surfaceSlot['index'] == coat['clearcoatRoughnessTexture']['index']
            surface = np.array(Load(surfaceSlot))
            amount = coverage[:, :, 0]
            rubbing = np.clip(.5 + .26 * cloud + .1 * stroke, 0, 1)
            surface[:, :, 0] = np.rint(amount * (125 + 63 * rubbing))
            surface[:, :, 1] = np.rint(surface[:, :, 1] * (1 - amount) + (85 - 23 * rubbing + 3 * patina) * amount)
            if name == 'T38_460G_WoodGroove_VisualCandidate':
                primitive = doc['meshes'][node['mesh']]['primitives'][0]
                ink = PaintStockNumber(doc, views, primitive, image.size)
                density = np.clip(.70 + .12 * patina + .09 * stroke, .36, .91) * ink
                graded *= 1 - .72 * density[:, :, None]
                surface[:, :, 0] = np.rint(surface[:, :, 0] * (1 - .49 * density))
                rough += 15 * density
                inlay = PaintBandInlay(doc, views, primitive, image.size) * amount
                wornSteel = np.array([54, 53, 52]) + (5 * stroke + 2 * patina + 8 * wear)[:, :, None]
                graded += inlay[:, :, None] * (wornSteel - graded)
                orm[:, :, 2] = np.rint(orm[:, :, 2] * (1 - inlay) + 227 * inlay)
                rough += (106 + 8 * patina - rough) * inlay
                surface[:, :, 0] = np.rint(surface[:, :, 0] * (1 - inlay))
            else:
                primitive = doc['meshes'][node['mesh']]['primitives'][0]
                carving = PaintTimberMarks(doc, views, primitive, image.size)
                graded *= 1 - .66 * carving[:, :, None]
                rough += 25 * carving
                surface[:, :, 0] = np.rint(surface[:, :, 0] * (1 - .83 * carving))
            Store(surfaceSlot, surface)
        else:
            value = color.mean(axis=2, keepdims=True)
            graded = .61 * color + .39 * value - .2 * local
            if name == 'Exterior_MiddleBand57':
                graded = .60 * graded + np.array([77, 76, 74])
            elif name == 'Exterior_ButtCap04':
                graded = .92 * graded + np.array([15, 14.2, 13.3])
            elif bright:
                graded = .88 * graded + np.array([14, 14, 13])
            else:
                graded = .84 * graded + np.array([6.5, 6.2, 6.3])
            graded += (1.6 * cloud + 1.5 * stroke + 4.5 * wear)[:, :, None]
            rough = (81 if bright else 115) + 11 * cloud + 7 * patina + 7 * stroke - 12 * wear
            if name == 'Exterior_MiddleBand57':
                rough = 111 + 7 * cloud + 5 * patina + 3 * stroke - 7 * wear
            if name in ('Exterior_FoldedFrame12', 'SightDetailV3_ShallowVisibleEdgeFacets_ART_ONLY'):
                surface = np.asarray(image.filter(ImageFilter.GaussianBlur(3)), dtype=np.float32)
                detail = np.clip((color - surface).mean(axis=2), -10, 10)
                graded = .94 * graded + np.array([27, 26, 25]) + 2.8 * detail[:, :, None]
            if name in ('SightDetail335_CentralVisibleBacking_ART_ASSUMED_DEPTH', 'SightDetailV3_DecorativeConvexRoundSurface'):
                graded = .74 * graded + np.array([62, 56, 46])
                rough -= 13
            if name == 'T38_430L_VisibleUpperShoulderCoordination':
                primitive = doc['meshes'][node['mesh']]['primitives'][0]
                letters = PaintMakerLettering(doc, views, primitive, image.size)
                abrasion = PaintCrestAbrasion(doc, views, primitive, image.size)
                graded = .76 * graded + np.array([27, 26, 24]) + (33 * abrasion - 26 * letters)[:, :, None]
                rough += 23 * letters - 29 * abrasion
            if name == 'T38_440D2_IndependentVisibleRecess':
                relief = PaintRearMedallion(doc, views, doc['meshes'][node['mesh']]['primitives'][0], image.size)
                graded = .61 * graded + np.array([60, 58, 55]) + 35 * relief[:, :, None]
                rough = 116 + 9 * patina - 33 * relief
                slot = material['normalTexture']
                normal = np.asarray(Load(slot), dtype=np.float32) / 127.5 - 1
                vertical, horizontal = np.gradient(relief)
                normal[:, :, 0] -= .92 * horizontal
                normal[:, :, 1] += .92 * vertical
                normal /= np.maximum(1e-5, np.linalg.norm(normal, axis=2, keepdims=True))
                Store(slot, (normal + 1) * 127.5)
        Store(pbr['baseColorTexture'], color + (graded - color) * coverage)
        roughness = orm[:, :, 1].astype(np.float32)
        revised = .26 * roughness + .74 * np.clip(rough, 55, 179)
        orm[:, :, 1] = np.rint(roughness + (revised - roughness) * coverage[:, :, 0]).astype(np.uint8)
        Store(pbr['metallicRoughnessTexture'], orm)
        if wood and 'normalTexture' in material:
            slot = material['normalTexture']
            normal = np.asarray(Load(slot), dtype=np.float32) / 127.5 - 1
            normal[:, :, :2] *= (1 - .38 * coverage)
            relief = (soften[:, :, 0] * .16 + local[:, :, 0] * .18) * coverage[:, :, 0]
            vertical, horizontal = np.gradient(relief)
            normal[:, :, 0] -= np.clip(horizontal * .021, -.11, .11)
            normal[:, :, 1] += np.clip(vertical * .021, -.11, .11)
            if inlay is not None:
                vertical, horizontal = np.gradient(inlay)
                normal[:, :, 0] -= .51 * horizontal
                normal[:, :, 1] += .51 * vertical
            if carving is not None:
                vertical, horizontal = np.gradient(carving)
                normal[:, :, 0] += .91 * horizontal
                normal[:, :, 1] -= .91 * vertical
            normal /= np.maximum(1e-5, np.linalg.norm(normal, axis=2, keepdims=True))
            Store(slot, (normal + 1) * 127.5)
        valid = coverage[:, :, 0] > .9
        stats[name] = [round(float(np.percentile(orm[:, :, 1][valid], percentile)), 1) for percentile in [10, 50, 90]]
    return stats


def Build():
    repo = Path(__file__).resolve().parents[2]
    out = repo / 'Taierzhuang1938/Model/Type38_511'
    def Original(revision, filename):
        spec = f'{revision}:Taierzhuang1938/Model/Type38_511/{filename}'
        return subprocess.check_output(['git', '-C', str(repo), 'show', spec])
    if sys.argv[1:]:
        raise SystemExit('Run without arguments; both verified source stages are loaded from Git.')
    colors, originalViews, baseline = ReadGlb(Original('33062973', 'Model_Type38_511.glb'))
    assert baseline == '77768c563db9fe7a3db3b0fd937279b4b6d05eb058cc441cafb3bcda0e668ad5'
    doc, views, accepted = ReadGlb(Original('0ad1f3a0', 'Model_Type38_511.glb'))
    assert accepted == '7d81e41a53b953297c0a5b35c48e15b7ba8fe00d87200ac16a4c5a640388c7c3'
    assert colors['textures'] == doc['textures'] and colors['images'] == doc['images']
    for image in doc['images']:
        index = image['bufferView']
        views[index] = originalViews[index]
    doc['materials'] = colors['materials']
    manifest = json.loads(Original('0ad1f3a0', 'Data_Type38_511.json'))
    changes = manifest['exteriorTriangleDeltas']
    finish = Refinish(doc, views)
    triangles = sum(doc['accessors'][primitive['indices']]['count'] // 3 for mesh in doc['meshes'] for primitive in mesh['primitives'])
    assert triangles == manifest['triangles'] <= 80000
    doc['asset']['extras'].update(runtimeTriangles=triangles, version='Type38_PhotoFinish20261122', originalImagePayloadsPreserved=False)
    digest = WriteGlb(out / 'Model_Type38_511.glb', doc, views)
    manifest.update(version=2, runtimeSha256=digest, triangles=triangles, generator='_blender/Script_Type38Exterior.py + _blender/Script_Type38ExteriorFinish.py',
                    exteriorBaselineSha256=baseline, exteriorTriangleDeltas=changes, finishRoughnessP10P50P90=finish,
                    historicalReferences=['https://www.awm.gov.au/collection/C142149', 'https://www.awm.gov.au/collection/C138903',
                                          'https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle.JPG',
                                          'https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(front_stock_detail).JPG',
                                          'https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_rear_sight_(top_view).JPG',
                                          'https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_action.JPG',
                                          'https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_action_inscriptions.JPG',
                                          'https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_inscriptions.JPG',
                                          'https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(rear_view).JPG',
                                          'https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_rear_sight_detail.JPG',
                                          'https://commons.wikimedia.org/wiki/File:Inscriptions_on_a_Japanese_Arisaka_Type_38_rifle.JPG'])
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
