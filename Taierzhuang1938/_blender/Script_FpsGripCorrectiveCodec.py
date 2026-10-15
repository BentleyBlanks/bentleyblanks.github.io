"""glTF helpers for append-only FPS corrective baking; no Blender dependency."""
import copy, hashlib, json, struct
import numpy as np

CORRECTIVE_CONTRACTS = {
    'Grip_Zb26LeftCompression': {'weapon': 'Zb26', 'side': 'l', 'maximumPoseDeltaMm': 3.5},
    'Grip_DadaoLeftContact': {'weapon': 'Dadao', 'side': 'l', 'maximumPoseDeltaMm': 3.0},
    'Grip_DadaoRightContact': {'weapon': 'Dadao', 'side': 'r', 'maximumPoseDeltaMm': 3.0},
    'Grip_GrenadeBundleLeftSupport': {'weapon': 'GrenadeBundle', 'side': 'l', 'maximumPoseDeltaMm': 3.7},
    'Grip_GrenadeBundleRightContact': {'weapon': 'GrenadeBundle', 'side': 'r', 'maximumPoseDeltaMm': 0.5},
}
FROZEN_BASIS_SHA256 = '15b1587cfbe4ee0522d15e71baf32eec5a5a99102fb62eed46b99ab1ed32ae01'


def ReadGlb(path):
    raw = path.read_bytes()
    assert len(raw) >= 28 and struct.unpack_from('<III', raw) == (0x46546C67, 2, len(raw))
    length, kind = struct.unpack_from('<II', raw, 12)
    assert kind == 0x4E4F534A and length % 4 == 0
    binLength, binKind = struct.unpack_from('<II', raw, 20 + length)
    assert binKind == 0x004E4942 and 28 + length + binLength == len(raw)
    document = json.loads(raw[20:20 + length])
    assert len(document['buffers']) == 1 and 'uri' not in document['buffers'][0]
    assert document['buffers'][0]['byteLength'] <= binLength
    return document, bytearray(raw[28 + length:]), raw


def WriteGlb(path, document, binary):
    binary = bytearray(binary)
    binary += b'\0' * (-len(binary) % 4)
    document['buffers'][0]['byteLength'] = len(binary)
    payload = json.dumps(document, separators=(',', ':'), ensure_ascii=False).encode()
    payload += b' ' * (-len(payload) % 4)
    path.write_bytes(struct.pack('<III', 0x46546C67, 2, 28 + len(payload) + len(binary)) + struct.pack('<II', len(payload), 0x4E4F534A) + payload + struct.pack('<II', len(binary), 0x004E4942) + binary)


def Accessor(document, binary, index):
    a = document['accessors'][index]
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
    dtype = {5121: 'u1', 5123: '<u2', 5125: '<u4', 5126: '<f4'}[a['componentType']]
    size = np.dtype(dtype).itemsize
    values = np.zeros((a['count'], width), dtype=dtype)
    if 'bufferView' in a:
        view = document['bufferViews'][a['bufferView']]
        begin = view.get('byteOffset', 0) + a.get('byteOffset', 0)
        values[:] = np.ndarray(values.shape, dtype=dtype, buffer=binary, offset=begin, strides=(view.get('byteStride', width * size), size))
    if 'sparse' in a:
        sparse = a['sparse']
        indices = sparse['indices']; view = document['bufferViews'][indices['bufferView']]
        itype = {5121: 'u1', 5123: '<u2', 5125: '<u4'}[indices['componentType']]
        ids = np.frombuffer(binary, dtype=itype, count=sparse['count'], offset=view.get('byteOffset', 0) + indices.get('byteOffset', 0))
        replacement = sparse['values']; view = document['bufferViews'][replacement['bufferView']]
        rows = np.frombuffer(binary, dtype=dtype, count=sparse['count'] * width, offset=view.get('byteOffset', 0) + replacement.get('byteOffset', 0)).reshape(-1, width)
        values[ids] = rows
    if a.get('normalized'):
        values = values.astype(np.float64) / np.iinfo(dtype).max
    return values


def NormalizeName(name):
    return ''.join(c for c in name.lower() if c.isalnum())


def NormalizeWeights(weights):
    weights = np.asarray(weights, dtype=np.float64).copy()
    sums = np.abs(weights).sum(1)
    weights[sums > 0] /= sums[sums > 0, None]
    weights[sums == 0] = (1, 0, 0, 0)
    return weights.astype('<f4').astype(np.float64)


def Primitive(document, binary, meshIndex, primitiveIndex=0):
    node = next(n for n in document['nodes'] if n.get('mesh') == meshIndex and 'skin' in n)
    skin = document['skins'][node['skin']]
    p = document['meshes'][meshIndex]['primitives'][primitiveIndex]
    return {'attributes': {name: Accessor(document, binary, index) for name, index in p['attributes'].items()},
            'jointNames': [NormalizeName(document['nodes'][j]['name']) for j in skin['joints']],
            'primitive': p, 'meshIndex': meshIndex, 'primitiveIndex': primitiveIndex}


def SkinPrimitive(document, binary):
    matches = [(mi, pi) for mi, mesh in enumerate(document['meshes']) for pi, p in enumerate(mesh['primitives'])
               if document['materials'][p['material']]['name'] == 'Material_HanYangScanSkin']
    assert len(matches) == 1, ('Expected one current skin primitive', matches)
    return Primitive(document, binary, *matches[0])


def JointWeights(primitive, names):
    attrs = primitive['attributes']
    weights = NormalizeWeights(attrs['WEIGHTS_0'])
    indices = attrs['JOINTS_0'].astype(int)
    mapping = np.asarray([names.index(name) for name in primitive['jointNames']])
    result = np.zeros((len(weights), len(names)), dtype=np.float64)
    for k in range(4):
        result[np.arange(len(weights)), mapping[indices[:, k]]] += weights[:, k]
    return result


def MatchVertices(runtime, exported):
    a, b = runtime['attributes'], exported['attributes']
    required = ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']
    assert all(name in a and name in b for name in required), 'Export all base vertex attributes'
    assert '_FPS_SOURCE_VERTEX' in b, 'Missing original Blender vertex ID attribute'
    sourceIds = np.rint(b['_FPS_SOURCE_VERTEX'][:, 0]).astype(int)
    wa = JointWeights(runtime, runtime['jointNames'])
    wb = JointWeights(exported, runtime['jointNames'])
    cells = {}
    cell = 1e-5
    for i, p in enumerate(b['POSITION']):
        cells.setdefault(tuple(np.floor(p / cell).astype(int)), []).append(i)
    offsets = [(x, y, z) for x in [-1, 0, 1] for y in [-1, 0, 1] for z in [-1, 0, 1]]
    matches, sourceMatches, missing = [], [], []
    maximumPositionError = 0
    for i, point in enumerate(a['POSITION']):
        center = np.floor(point / cell).astype(int)
        ids = [j for offset in offsets for j in cells.get(tuple(center + offset), [])]
        ids = np.asarray(ids, dtype=int)
        if len(ids):
            p = np.max(np.abs(b['POSITION'][ids] - point), axis=1)
            uv = np.max(np.abs(b['TEXCOORD_0'][ids] - a['TEXCOORD_0'][i]), axis=1)
            normal = np.max(np.abs(b['NORMAL'][ids] - a['NORMAL'][i]), axis=1)
            weight = np.max(np.abs(wb[ids] - wa[i]), axis=1)
            keep = (p < 3e-6) & (uv < 3e-6) & (normal < 3e-4) & (weight < 5e-5)
            chosen = ids[keep]
        else:
            chosen = []
        if not len(chosen):
            missing.append({'index': i, 'position': point.tolist(), 'spatialCandidates': len(ids)})
            matches.append([]); sourceMatches.append([])
            continue
        matches.append(chosen.tolist())
        sourceMatches.append(sorted(set(sourceIds[chosen].tolist())))
        maximumPositionError = max(maximumPositionError, float(np.abs(b['POSITION'][chosen] - point).max()))
    assert not missing, f'{len(missing)} runtime vertices have no exact source attributes; first: {missing[:3]}'
    return {'runtimeToExport': matches, 'runtimeToSource': sourceMatches, 'sourceIds': sourceIds,
            'maximumBasePositionError': maximumPositionError}


def AssertBasisRetained(document, binary, basisDocument, basisBinary, meshIndex):
    """Only this mesh's corrective descriptors and appended data may differ."""
    assert bytes(binary[:len(basisBinary)]) == bytes(basisBinary), 'Frozen Basis binary prefix changed'
    normalized = copy.deepcopy(document)
    normalized['accessors'] = normalized['accessors'][:len(basisDocument['accessors'])]
    normalized['bufferViews'] = normalized['bufferViews'][:len(basisDocument['bufferViews'])]
    normalized['buffers'] = copy.deepcopy(basisDocument['buffers'])
    mesh, baseMesh = normalized['meshes'][meshIndex], basisDocument['meshes'][meshIndex]
    for key in ['weights']:
        if key in baseMesh:
            mesh[key] = copy.deepcopy(baseMesh[key])
        else:
            mesh.pop(key, None)
    if 'targetNames' in mesh.get('extras', {}):
        if 'targetNames' in baseMesh.get('extras', {}):
            mesh['extras']['targetNames'] = copy.deepcopy(baseMesh['extras']['targetNames'])
        else:
            mesh['extras'].pop('targetNames')
        if not mesh['extras'] and 'extras' not in baseMesh:
            mesh.pop('extras')
    for part, basePart in zip(mesh['primitives'], baseMesh['primitives']):
        if 'targets' in basePart:
            part['targets'] = copy.deepcopy(basePart['targets'])
        else:
            part.pop('targets', None)
    for node, baseNode in zip(normalized['nodes'], basisDocument['nodes']):
        if node.get('mesh') == meshIndex and 'weights' in node:
            if 'weights' in baseNode:
                node['weights'] = copy.deepcopy(baseNode['weights'])
            else:
                node.pop('weights')
    assert normalized == basisDocument, 'Frozen Basis descriptors changed outside corrective contract'


def AppendMorph(document, binary, meshIndex, primitiveIndex, name, targets, basisDocument=None, basisBinary=None):
    assert name in CORRECTIVE_CONTRACTS, 'Corrective name is not in the task whitelist'
    assert set(targets) == {'POSITION', 'NORMAL', 'TANGENT'}, 'Bake all three morph channels'
    assert (basisDocument is None) == (basisBinary is None)
    if basisDocument is not None:
        AssertBasisRetained(document, binary, basisDocument, basisBinary, meshIndex)
    before = copy.deepcopy(document)
    prefix = bytes(binary)
    mesh = document['meshes'][meshIndex]
    assert len(mesh['primitives']) == 1 and primitiveIndex == 0, 'Multiple primitive meshes need equal morph counts'
    primitive = mesh['primitives'][primitiveIndex]
    names = mesh.setdefault('extras', {}).setdefault('targetNames', [])
    oldCount = len(primitive.get('targets', []))
    assert len(names) == oldCount and len(set(names)) == oldCount, 'Unknown pre-existing morph names'
    assert all(n in CORRECTIVE_CONTRACTS for n in names), 'Unreviewed pre-existing corrective'
    assert len(mesh.get('weights', [0] * oldCount)) == oldCount and not any(mesh.get('weights', [])), 'Review asset morphs must default to zero'
    for node in document['nodes']:
        if node.get('mesh') == meshIndex and 'weights' in node:
            assert len(node['weights']) == oldCount and not any(node['weights']), 'Review instance morphs must default to zero'
    targetIndex = names.index(name) if name in names else len(names)
    if targetIndex == len(names):
        names.append(name)
        primitive.setdefault('targets', []).append({})
    target = {}
    for semantic in ['POSITION', 'NORMAL', 'TANGENT']:
        values = targets[semantic]
        values = np.asarray(values, dtype='<f4')
        assert values.shape == (document['accessors'][primitive['attributes']['POSITION']]['count'], 3)
        assert np.isfinite(values).all(), 'Morph contains a non-finite value'
        binary += b'\0' * (-len(binary) % 4)
        viewIndex = len(document['bufferViews'])
        payload = values.tobytes()
        document['bufferViews'].append({'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(payload), 'target': 34962})
        binary += payload
        accessorIndex = len(document['accessors'])
        document['accessors'].append({'bufferView': viewIndex, 'byteOffset': 0, 'componentType': 5126,
                                      'count': len(values), 'type': 'VEC3', 'min': values.min(0).tolist(), 'max': values.max(0).tolist()})
        target[semantic] = accessorIndex
    primitive['targets'][targetIndex] = target
    mesh['weights'] = list(mesh.get('weights', [0] * oldCount))
    mesh['weights'] += [0] * (len(names) - len(mesh['weights']))
    mesh['weights'][targetIndex] = 0
    for node in document['nodes']:
        if node.get('mesh') == meshIndex and 'weights' in node:
            node['weights'] += [0] * (len(names) - len(node['weights']))
            node['weights'][targetIndex] = 0
    document['buffers'][0]['byteLength'] = len(binary)
    assert bytes(binary[:len(prefix)]) == prefix, 'Original GLB binary bytes changed'
    for key in ['materials', 'textures', 'images', 'samplers', 'skins', 'animations']:
        assert document.get(key) == before.get(key), key + ' changed'
    assert document['accessors'][:len(before['accessors'])] == before['accessors']
    assert document['bufferViews'][:len(before['bufferViews'])] == before['bufferViews']
    for mi, oldMesh in enumerate(before['meshes']):
        for pi, oldPart in enumerate(oldMesh['primitives']):
            newPart = document['meshes'][mi]['primitives'][pi]
            for key in ['attributes', 'indices', 'material', 'mode']:
                assert newPart.get(key) == oldPart.get(key), 'Basis primitive contract changed'
    # A prior review may be the append base. Its other morph pointers and payloads
    # stay byte exact, including when the same named key is deliberately rebaked.
    for i, oldTarget in enumerate(before['meshes'][meshIndex]['primitives'][primitiveIndex].get('targets', [])):
        if i != targetIndex:
            assert primitive['targets'][i] == oldTarget, 'A previously reviewed morph changed'
    protected = copy.deepcopy(document)
    protected['accessors'] = protected['accessors'][:len(before['accessors'])]
    protected['bufferViews'] = protected['bufferViews'][:len(before['bufferViews'])]
    protected['buffers'] = copy.deepcopy(before['buffers'])
    protected['meshes'][meshIndex] = copy.deepcopy(before['meshes'][meshIndex])
    for node, oldNode in zip(protected['nodes'], before['nodes']):
        if node.get('mesh') == meshIndex and 'weights' in node:
            node['weights'] = copy.deepcopy(oldNode['weights'])
    assert protected == before, 'Append modified unrelated GLB descriptors'
    if basisDocument is not None:
        AssertBasisRetained(document, binary, basisDocument, basisBinary, meshIndex)
    originalPrefix = bytes(basisBinary) if basisBinary is not None else prefix
    return {'targetIndex': targetIndex, 'originalBinarySha256': hashlib.sha256(originalPrefix).hexdigest(),
            'originalBinaryBytes': len(originalPrefix), 'appendBaseBinarySha256': hashlib.sha256(prefix).hexdigest(),
            'appendBaseBinaryBytes': len(prefix), 'priorMorphsByteExact': True,
            'basisAndTexturesByteExact': True, 'defaultWeight': 0}
