"""Preserve the verified V42 accessors across a material-only re-export.

The exporter can move a UV by one float ULP and a quantized Mikk tangent by
one 0.0001 step after reopening. Restore the original values exactly instead
of widening the material-only identity check. Archive the raw export first.
"""
import hashlib, json, pathlib, shutil, struct
import numpy as np

scriptPath = pathlib.Path(__file__).resolve()
repo = scriptPath.parents[2]
asset = repo / 'tmp/NakajimaKi4/ReferenceV42_ThreePhotoShape'
recordPath = asset / 'Evidence/Data_RubberReflectanceAuthor.json'
record = json.loads(recordPath.read_text(encoding='utf8'))
source = pathlib.Path(record['sourcePath'])
assert hashlib.sha256(source.read_bytes()).hexdigest() == record['sourceSha256']
baseline = asset / 'Model_NakajimaKi4HighPbrDiagnostic.glb'
target = pathlib.Path(record['exportPath'])

def Load(path):
    data = path.read_bytes()
    size = struct.unpack_from('<I', data, 12)[0]
    return data, json.loads(data[20:20 + size]), bytearray(data[28 + size:]), 28 + size

oldData, old, oldBinary, _ = Load(baseline)
data, current, binary, binaryStart = Load(target)
assert hashlib.sha256(data).hexdigest() == record['exportSha256']
diagnostic = json.loads((asset / 'Evidence/Data_PbrDiagnosticExport.json').read_text(encoding='utf8'))
assert diagnostic['sourceSha256'] == record['inputSourceSha256']
assert diagnostic['exportSha256'] == hashlib.sha256(oldData).hexdigest()

def Values(document, payload, index):
    accessor = document['accessors'][index]
    view = document['bufferViews'][accessor['bufferView']]
    types = {5121: 'u1', 5123: '<u2', 5125: '<u4', 5126: '<f4'}
    counts = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
    kind = types[accessor['componentType']]
    count = counts[accessor['type']]
    size = np.dtype(kind).itemsize
    return np.ndarray((accessor['count'], count), dtype=kind, buffer=payload,
                      offset=view.get('byteOffset', 0) + accessor.get('byteOffset', 0),
                      strides=(view.get('byteStride', count * size), size))

oldMeshes = {mesh['name']: mesh for mesh in old['meshes']}
meshes = {mesh['name']: mesh for mesh in current['meshes']}
assert set(oldMeshes) == set(meshes) and len(meshes) == 928
restored = []
restoredIndices = []
for name, mesh in meshes.items():
    original = oldMeshes[name]
    assert len(mesh['primitives']) == len(original['primitives'])
    for before, after in zip(original['primitives'], mesh['primitives']):
        assert set(before['attributes']) == set(after['attributes'])
        oldIndices = Values(old, oldBinary, before['indices'])
        newIndices = Values(current, binary, after['indices'])
        changedIndices = not np.array_equal(oldIndices, newIndices)
        if changedIndices:
            assert name == 'Cube.002' and np.count_nonzero(oldIndices != newIndices) == 2
            # Only the two coincident vertices whose tangent falls either side
            # of the exporter's 0.0001 quantization boundary were interchanged.
            mask = oldIndices != newIndices
            for attribute, index in before['attributes'].items():
                values = Values(old, oldBinary, index)
                aa = values[oldIndices[mask]]
                bb = values[newIndices[mask]]
                assert np.array_equal(aa, bb) if attribute != 'TANGENT' else np.max(abs(aa - bb)) <= .000101
        for attribute, index in after['attributes'].items():
            a = Values(old, oldBinary, before['attributes'][attribute])
            b = Values(current, binary, index)
            assert a.shape == b.shape
            if np.array_equal(a, b):
                continue
            maximum = float(np.max(abs(a - b)))
            assert attribute in ['TEXCOORD_0', 'TANGENT'], (name, attribute)
            assert maximum <= (6e-8 if attribute == 'TEXCOORD_0' else .000101), (name, attribute, maximum)
            restored.append({'mesh': name, 'attribute': attribute, 'maximumExporterDifference': maximum,
                             'changedComponents': int(np.count_nonzero(a != b))})
            b[:] = a
            assert np.array_equal(a, b)
        if changedIndices:
            restoredIndices.append({'mesh': name, 'changedComponents': 2,
                                    'reason': 'Coincident equal-position/normal/UV vertices separated only by one tangent quantization step'})
            newIndices[:] = oldIndices
            assert np.array_equal(oldIndices, newIndices)
assert len(restored) == 6, 'Inspect a new exporter result before changing this known-difference list'
archive = source.parent / 'Exports/Model_NakajimaKi4HighPbrRubberSourceRaw.glb'
assert not archive.exists()
archive.parent.mkdir(exist_ok=True)
archive.write_bytes(data)
corrected = data[:binaryStart] + bytes(binary)
assert len(corrected) == len(data)
target.write_bytes(corrected)
record['rawExportPath'] = str(archive)
record['rawExportSha256'] = record['exportSha256']
record['exportSha256'] = hashlib.sha256(corrected).hexdigest()
record['exportAccessorRestoration'] = restored
record['exportIndexRestoration'] = restoredIndices
record['exportAccessorScope'] = 'Original V42 UV/tangent values restored exactly after six exporter float/quantization differences; positions/normals/indices already identical. Source unchanged.'
for path in [recordPath, source.parent / 'Evidence/Data_RubberReflectanceAuthor.json']:
    path.write_text(json.dumps(record, indent=2), encoding='utf8')
shutil.copy2(scriptPath, source.parent / 'Scripts' / scriptPath.name)
result = {'state': 'MaterialOnlyExportOriginalAccessorIdentityRestored',
          'rawSha256': record['rawExportSha256'], 'exportSha256': record['exportSha256'],
          'restored': restored, 'restoredIndices': restoredIndices}
(asset / 'Evidence/Data_RubberExportAccessorRestoration.json').write_text(json.dumps(result, indent=2), encoding='utf8')
print(json.dumps(result))
