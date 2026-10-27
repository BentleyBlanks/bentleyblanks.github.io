"""Carry the actual baked PNG R bytes into the diagnostic GLB without rounding.

Blender's float-image ORM repack differed by one byte in 1998 AO pixels.
Keep the source PNG as the reference. Only this AO R plane changes; all
geometry, existing binary storage, G/B/alpha and other material data stay exact.
Run after PropellerSectionUpdate and before final export/native verification.
"""
import argparse, copy, hashlib, io, json, pathlib, shutil, struct
import numpy as np
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('--asset-root', default='tmp/NakajimaKi4/ReferenceV46_FullBladeOutline')
args = parser.parse_args()
asset = pathlib.Path(args.asset_root).resolve()
recordPath = asset / 'Evidence/Data_PropellerSectionAuthor.json'
record = json.loads(recordPath.read_text(encoding='utf8'))
assert 'pbrAoPixelComposition' not in record, 'Already composed; inspect the current receipt before repeating a mutation'
source = pathlib.Path(record['sourcePath'])
target = pathlib.Path(record['pbrExportPath'])
Hash = lambda payload: hashlib.sha256(payload).hexdigest()
assert Hash(source.read_bytes()) == record['sourceSha256']
payload = target.read_bytes()
assert Hash(payload) == record['pbrExportSha256']
jsonSize = struct.unpack_from('<I', payload, 12)[0]
g = json.loads(payload[20:20 + jsonSize])
binary = bytearray(payload[28 + jsonSize:])
originalBinary = bytes(binary)
material = next(m for m in g['materials'] if m['name'] == 'Material_Ki4PropellerMachinedAluminum')
textureIndex = material['occlusionTexture']['index']
imageIndex = g['textures'][textureIndex]['source']
assert material['occlusionTexture']['texCoord'] == 1
assert g['textures'][material['pbrMetallicRoughness']['metallicRoughnessTexture']['index']]['source'] == imageIndex
consumers = []
for candidate in g['materials']:
    slots = {key: value for key, value in candidate.items() if key.endswith('Texture')}
    slots.update(candidate.get('pbrMetallicRoughness', {}))
    for key, value in slots.items():
        if isinstance(value, dict) and 'index' in value and g['textures'][value['index']]['source'] == imageIndex:
            consumers.append([candidate['name'], key])
assert consumers and all(name == material['name'] and key in ['occlusionTexture', 'metallicRoughnessTexture']
                         for name, key in consumers)
image = g['images'][imageIndex]
view = g['bufferViews'][image['bufferView']]
oldPng = originalBinary[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
pixels = np.array(Image.open(io.BytesIO(oldPng)).convert('RGBA'))
aoPath = source.parent / 'Textures/Texture_Ki4PropellerGeometryAo.png'
assert Hash(aoPath.read_bytes()) == record['newImageSha256']
ao = np.array(Image.open(aoPath).convert('RGBA'))[:, :, 0]
assert pixels.shape[:2] == ao.shape
difference = pixels[:, :, 0].astype(int) - ao.astype(int)
assert np.max(abs(difference)) <= 1
updated = pixels.copy()
updated[:, :, 0] = ao
assert np.array_equal(updated[:, :, 1:], pixels[:, :, 1:])
buffer = io.BytesIO()
Image.fromarray(updated, 'RGBA').save(buffer, format='PNG')
newPng = buffer.getvalue()
assert np.array_equal(np.array(Image.open(io.BytesIO(newPng))), updated)
before = copy.deepcopy(g)
binary.extend(b'\0' * (-len(binary) % 4))
offset = len(binary)
binary.extend(newPng)
image['bufferView'] = len(g['bufferViews'])
g['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(newPng)})
g['buffers'][0]['byteLength'] = len(binary)
assert bytes(binary[:len(originalBinary)]) == originalBinary
for key in ['accessors', 'meshes', 'nodes', 'materials', 'textures', 'samplers', 'scenes']:
    assert g.get(key) == before.get(key)
encoded = json.dumps(g, ensure_ascii=False, separators=(',', ':')).encode('utf8')
encoded += b' ' * (-len(encoded) % 4)
binary.extend(b'\0' * (-len(binary) % 4))
result = (struct.pack('<III', 0x46546c67, 2, 28 + len(encoded) + len(binary))
          + struct.pack('<II', len(encoded), 0x4e4f534a) + encoded
          + struct.pack('<II', len(binary), 0x004e4942) + binary)
archive = source.parent / 'Exports/Model_NakajimaKi4HighPbrBeforeAoCompose.glb'
assert not archive.exists()
archive.write_bytes(payload)
target.write_bytes(result)
proof = {'state': 'ActualSourceAoPngBytesCarriedExactlyIntoGlb',
         'sourceSha256': record['sourceSha256'], 'inputExportSha256': Hash(payload),
         'exportSha256': Hash(result), 'sourceAoPngSha256': Hash(aoPath.read_bytes()),
         'oldCombinedPngSha256': Hash(oldPng), 'newCombinedPngSha256': Hash(newPng),
         'oldAoMaximumByteDifference': int(abs(difference).max()),
         'changedAoPixels': int(np.count_nonzero(difference)),
         'allOriginalBinaryPrefixBytesRetained': True,
         'allAccessorMeshNodeMaterialTextureAndSamplerJsonUnchanged': True,
         'roughnessMetallicAlphaPixelPlanesUnchanged': True,
         'sourceAoRPlaneDecodedPixelExact': True}
record['pbrExportSha256BeforeAoCompose'] = record['pbrExportSha256']
record['pbrExportSha256'] = proof['exportSha256']
record['pbrAoPixelComposition'] = proof
for path in [recordPath, source.parent / 'Evidence/Data_PropellerSectionAuthor.json']:
    path.write_text(json.dumps(record, indent=2), encoding='utf8')
wholeRecordPath=asset/'Evidence/Data_WholeAirframeAuthor.json'
if wholeRecordPath.exists():
    wholeRecord=json.loads(wholeRecordPath.read_text(encoding='utf8'))
    assert wholeRecord['version']==record['version'] and wholeRecord['sourceSha256']==record['sourceSha256']
    for path in [wholeRecordPath,source.parent/'Evidence/Data_WholeAirframeAuthor.json']:
        path.write_text(json.dumps(record,indent=2),encoding='utf8')
for path in [asset / 'Evidence/Data_PropellerAoComposition.json',
             source.parent / 'Evidence/Data_PropellerAoComposition.json']:
    path.write_text(json.dumps(proof, indent=2), encoding='utf8')
shutil.copy2(pathlib.Path(__file__), source.parent / 'Scripts' / pathlib.Path(__file__).name)
shutil.copy2(target, source.parent / 'Exports/Model_NakajimaKi4HighPbrDiagnostic.glb')
assert Hash(source.read_bytes()) == record['sourceSha256']
print(json.dumps(proof))
