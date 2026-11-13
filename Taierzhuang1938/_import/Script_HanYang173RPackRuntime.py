"""Pack browser-runtime normals to 8-bit and losslessly compress embedded images.

The original 16-bit bakes remain in the external source revision. Browser image
decoding and the GPU publication path consume 8-bit normal channels. The shared
WebP packer verifies exact decoded pixels and retains every baked dimension.
"""
import hashlib
import json
import struct
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

source, output, reportPath = map(Path, sys.argv[1:4])
raw = source.read_bytes()
jsonLength = struct.unpack_from('<I', raw, 12)[0]
doc = json.loads(raw[20:20 + jsonLength])
binary = raw[28 + jsonLength:]
normalImages = {doc['textures'][material['normalTexture']['index']]['source']
    for material in doc['materials'] if 'normalTexture' in material}
replacements = {}
convertedNormalCount = 0
for index in sorted(normalImages):
    image = doc['images'][index]
    view = doc['bufferViews'][image['bufferView']]
    encoded = binary[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
    pixels = cv2.imdecode(np.frombuffer(encoded, dtype=np.uint8), cv2.IMREAD_UNCHANGED)
    assert pixels is not None
    if pixels.dtype != np.uint16:
        continue
    packed = ((pixels.astype(np.uint32) + 128) // 257).astype(np.uint8)
    success, result = cv2.imencode('.png', packed, [cv2.IMWRITE_PNG_COMPRESSION, 6])
    assert success
    replacements[image['bufferView']] = result.tobytes()
    convertedNormalCount += 1

payload = bytearray()
for index, view in enumerate(doc['bufferViews']):
    start = view.get('byteOffset', 0)
    content = replacements.get(index, binary[start:start + view['byteLength']])
    view['byteOffset'] = len(payload)
    view['byteLength'] = len(content)
    payload.extend(content)
    payload.extend(bytes((-len(payload)) % 4))
doc['buffers'][0]['byteLength'] = len(payload)
jsonData = json.dumps(doc, separators=(',', ':')).encode()
jsonData += b' ' * ((-len(jsonData)) % 4)
result = struct.pack('<4sII', b'glTF', 2, 28 + len(jsonData) + len(payload))
result += struct.pack('<II', len(jsonData), 0x4E4F534A) + jsonData
result += struct.pack('<II', len(payload), 0x004E4942) + payload
output.write_bytes(result)
# Reuse the repository's pixel-verified, same-resolution lossless packaging.
# It preserves scene and geometry bytes and emits the standard WebP extension.
compressor = Path(__file__).with_name('Script_CompressEmbeddedTextures.mjs')
compressionScript = """
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {CompressEmbeddedTextures} = await import(pathToFileURL(process.argv[2]).href);
const file = process.argv[1];
await fs.writeFile(file, await CompressEmbeddedTextures(await fs.readFile(file)));
"""
subprocess.run(['node', '--input-type=module', '-e', compressionScript, str(output.resolve()), str(compressor.resolve())], check=True)
result = output.read_bytes()
jsonLength = struct.unpack_from('<I', result, 12)[0]
packedDoc = json.loads(result[20:20 + jsonLength])
packedBinary = result[28 + jsonLength:]
report = json.loads(reportPath.read_text(encoding='utf8'))
report['gameSha256'] = hashlib.sha256(result).hexdigest()
imageHashes = {}
for image in packedDoc['images']:
    view = packedDoc['bufferViews'][image['bufferView']]
    start = view.get('byteOffset', 0)
    imageHashes[image['name']] = hashlib.sha256(packedBinary[start:start + view['byteLength']]).hexdigest()
for image in report['texturePayloads']:
    image['sha256'] = imageHashes[image['name']]
report['runtimeNormalPacking'] = {'sourceBits': 16, 'runtimeBits': 8,
    'images': convertedNormalCount, 'resolution': 'baked dimensions retained'}
report['runtimeLosslessPacking'] = 'Pixel-verified same-resolution WebP where smaller, using Script_CompressEmbeddedTextures.mjs'
reportPath.write_text(json.dumps(report, indent=2) + '\n', encoding='utf8')
print(json.dumps({'sourceBytes': len(raw), 'runtimeBytes': len(result), 'normalImages': convertedNormalCount}))
