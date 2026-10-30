"""Independent byte/pixel/UV/pose checks for the isolated V77 wear candidate."""
import hashlib, importlib.util, io, json, os, struct
from pathlib import Path
import numpy as np
from PIL import Image

root = Path(os.environ.get('TYPE94_WEAR_ROOT', r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette/SurfaceV77'))
preparation = json.loads((root / 'Acceptance/Data_WearPreparationV77.json').read_text())
bake = json.loads((root / 'Acceptance/Data_WearBakeV77.json').read_text())
checks = []


def Check(value, label):
    checks.append(dict(passed=bool(value), check=label))


def Read(file):
    raw = Path(file).read_bytes()
    length = struct.unpack_from('<I', raw, 12)[0]
    data = json.loads(raw[20:20 + length])
    binary = raw[28 + length:]

    def Accessor(index):
        item = data['accessors'][index]
        view = data['bufferViews'][item['bufferView']]
        dtype = np.dtype({5126: '<f4', 5125: '<u4', 5123: '<u2', 5121: 'u1'}[item['componentType']])
        count = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[item['type']]
        return np.ndarray((item['count'], count), dtype=dtype, buffer=binary, offset=view.get('byteOffset', 0) + item.get('byteOffset', 0), strides=(view.get('byteStride', dtype.itemsize * count), dtype.itemsize)).copy()

    parents = {child: node['name'] for node in data['nodes'] for child in node.get('children', [])}
    nodes, meshes = {}, {}
    for index, node in enumerate(data['nodes']):
        nodes[node['name']] = dict(parent=parents.get(index), pose={k: node.get(k) for k in ['matrix', 'translation', 'rotation', 'scale']}, properties=node.get('extras', {}))
        if 'mesh' in node:
            rows = []
            for primitive in data['meshes'][node['mesh']]['primitives']:
                material = data['materials'][primitive['material']]
                rows.append(dict(material=material['name'], normalMapped='normalTexture' in material, indices=Accessor(primitive['indices']), attributes={k: Accessor(v) for k, v in primitive['attributes'].items()}))
            meshes[node['name']] = rows

    def Pixels(texture):
        image = data['images'][data['textures'][texture['index']]['source']]
        view = data['bufferViews'][image['bufferView']]
        start = view.get('byteOffset', 0)
        return np.asarray(Image.open(io.BytesIO(binary[start:start + view['byteLength']])).convert('RGB'))

    maps = {}
    for material in data['materials']:
        if not material['name'].startswith('Material_Type94') or 'normalTexture' not in material:
            continue
        role = material['name'].removeprefix('Material_Type94')
        pbr = material['pbrMetallicRoughness']
        for channel, texture in [('Base', pbr['baseColorTexture']), ('Orm', pbr['metallicRoughnessTexture']), ('Normal', material['normalTexture'])]:
            maps[role + channel] = Pixels(texture)
        Check(np.array_equal(Pixels(material['occlusionTexture'])[:, :, 0], maps[role + 'Orm'][:, :, 0]), role + ' AO and ORM share actual AO pixels in ' + Path(file).name)
    return dict(nodes=nodes, meshes=meshes, maps=maps, data=data, sha256=hashlib.sha256(raw).hexdigest())


baseline = Read(preparation['reference']['sourceGlb'])
candidate = Read(root / 'Exports/Model_Type94TanketteHighSurfaceV77Preview.glb')
reopened = Read(root / 'Exports/Model_Type94TanketteHighSurfaceV77Reopen.glb')
sourceReport = json.loads((root / 'Acceptance/Data_SourceReopenV77.json').read_text())
quantum = 10. ** (-sourceReport['exporterTangentRoundingDigits'])
Check(quantum <= .0001, 'Installed exporter preserves at least four tangent decimal places')
tangentStats = []
spec = importlib.util.spec_from_file_location('Wear77SurfaceProof', Path(__file__).with_name('Script_VerifyType94GeometryReplay.py'))
proof = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proof)


def Arrays(parts, attributes):
    sites, faces, offset = [], [], 0
    for part in parts:
        values = np.concatenate([part['attributes'][key] for key in attributes], axis=1)
        sites.append(values)
        faces.append(part['indices'].reshape(-1, 3) + offset)
        offset += len(values)
    return np.vstack(sites), np.vstack(faces)


for label, actual in [('V68ToV77', candidate), ('V77SourceReexport', reopened)]:
    reference = baseline if label == 'V68ToV77' else candidate
    Check(actual['nodes'] == reference['nodes'] and len(actual['nodes']) == 292, label + ' exact 292 rigid poses, hierarchy and controls')
    Check(actual['meshes'].keys() == reference['meshes'].keys() and len(actual['meshes']) == 237, label + ' all 237 mesh owners')
    for name, parts in reference['meshes'].items():
        target = actual['meshes'][name]
        paint = any(p['material'] == 'Material_Type94Paint' for p in parts)
        normalMapped = any(p['normalMapped'] for p in parts)
        attributes = ['POSITION', 'NORMAL'] if label == 'V68ToV77' and paint else sorted(k for k in parts[0]['attributes'] if label != 'V77SourceReexport' or not normalMapped or k != 'TANGENT')
        a, fa = Arrays(parts, attributes)
        b, fb = Arrays(target, attributes)
        _, ids = np.unique(np.vstack((a, b)), axis=0, return_inverse=True)
        i, j = ids[:len(a)], ids[len(a):]
        exact = np.array_equal(np.unique(i), np.unique(j)) and np.array_equal(proof.CanonicalFaces(fa, i), proof.CanonicalFaces(fb, j))
        Check(exact, label + ' exact oriented corner attributes ' + ','.join(attributes) + ': ' + name)
        if label == 'V77SourceReexport' and exact and normalMapped and 'TANGENT' in parts[0]['attributes']:
            def CanonicalTangents(rows, faces, codes):
                f = codes[faces]
                rotation = (np.argmin(f, axis=1)[:, None] + [0, 1, 2]) % 3
                f = np.take_along_axis(f, rotation, axis=1)
                values = np.vstack([p['attributes']['TANGENT'] for p in rows])[faces]
                values = np.take_along_axis(values, rotation[:, :, None], axis=1)
                order = np.lexsort((f[:, 2], f[:, 1], f[:, 0]))
                return values[order].astype(np.float64)
            x, y = CanonicalTangents(parts, fa, i), CanonicalTangents(target, fb, j)
            delta = abs(x[:, :, :3] - y[:, :, :3])
            lengthX = np.linalg.norm(x[:, :, :3], axis=2)
            lengthY = np.linalg.norm(y[:, :, :3], axis=2)
            cosine = np.sum(x[:, :, :3] * y[:, :, :3], axis=2) / np.maximum(lengthX * lengthY, 1e-15)
            maximumAngle = float(np.degrees(np.arccos(np.clip(cosine, -1, 1))).max())
            # This is the installed exporter's declared component precision,
            # plus one float32 representation epsilon, not a geometry gate.
            precisionGate = float(quantum + float(np.finfo(np.float32).eps))
            tangentPassed = np.max(delta) <= precisionGate and np.array_equal(x[:, :, 3], y[:, :, 3]) and max(np.max(abs(lengthX - 1)), np.max(abs(lengthY - 1))) <= np.sqrt(3) * precisionGate
            Check(tangentPassed, name + ' source tangent directions within measured exporter precision; handedness exact')
            tangentStats.append(dict(name=name, changedCorners=int(np.count_nonzero(np.any(delta > 0, axis=2))), maxComponentDifference=float(delta.max()), maximumAngleDegrees=maximumAngle, componentGate=precisionGate))
    if label == 'V77SourceReexport':
        for key, pixels in reference['maps'].items():
            Check(np.array_equal(pixels, actual['maps'][key]), 'Actual reopened source reexports exact ' + key + ' pixels')
for key, pixels in candidate['maps'].items():
    if key in bake['outputs']:
        file = Path(bake['outputs'][key]['file'])
    elif key == 'PaintNormal':
        file = root / 'Textures/HighSurfaceV77Preview/Texture_Type94PaintNormalWear77.png'
    else:
        file = Path(preparation['inputs'][key]['file'])
        Check(np.array_equal(pixels, baseline['maps'][key]), key + ' unchanged from V68')
    Check(np.array_equal(pixels, np.asarray(Image.open(file).convert('RGB'))), key + ' runtime pixels equal authored master')
Check(np.array_equal(np.asarray(Image.open(root / 'Textures/HighSurfaceV77Preview/Texture_Type94PaintOrmInput.png'))[:, :, 0], candidate['maps']['PaintOrm'][:, :, 0]), 'Reprojected paint AO preserved exactly by wear layer')
Check(not np.array_equal(baseline['maps']['PaintOrm'][:, :, 1:], candidate['maps']['PaintOrm'][:, :, 1:]), 'Wear changes actual roughness and metallic maps')
triangleCount = sum(len(p['indices']) // 3 for rows in candidate['meshes'].values() for p in rows)
Check(triangleCount == 624036, 'Exact 624036 triangles retained')
report = dict(passed=all(c['passed'] for c in checks), checks=checks, tangentSourceReexport=tangentStats, exporterTangentRoundingDigits=sourceReport['exporterTangentRoundingDigits'], sha256=candidate['sha256'], triangleCount=triangleCount, sourceReexportVerified=True, scope='Exact geometry/normal/UV corner surfaces, unchanged292poses, all12decoded runtime maps; source tangents checked at installed exporter precision with exact handedness. This is not whole-reference acceptance.')
(root / 'Acceptance/Data_WearVerificationV77.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(dict(passed=report['passed'], checks=len(checks), failed=[c for c in checks if not c['passed']])))
assert report['passed']
