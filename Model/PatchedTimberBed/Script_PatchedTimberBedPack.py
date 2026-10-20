"""Package a static Blender GLB without changing its vertex attributes.

Requires Python, NumPy and Pillow with WebP support. BS_FootCloth receives the
archived BS WebP bytes; every other embedded PNG is encoded as same-size lossless
WebP. Only index triangles below the fixed world-space area gate are removed.
"""

import argparse
import copy
import hashlib
import io
import json
import struct
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image, features


def Hash(data):
    return hashlib.sha256(data).hexdigest()


def ReadGlb(raw):
    if len(raw) < 28 or struct.unpack_from('<III', raw) != (0x46546C67, 2, len(raw)):
        raise ValueError('Expected a complete GLB 2.0 file')
    chunks = []
    offset = 12
    while offset < len(raw):
        length, kind = struct.unpack_from('<II', raw, offset)
        end = offset + 8 + length
        if length % 4 or end > len(raw):
            raise ValueError('Invalid GLB chunk length')
        chunks.append((kind, raw[offset + 8:end]))
        offset = end
    if [item[0] for item in chunks] != [0x4E4F534A, 0x004E4942]:
        raise ValueError('Expected exactly one JSON chunk and one BIN chunk')
    doc = json.loads(chunks[0][1])
    buffers = doc.get('buffers', [])
    if len(buffers) != 1 or 'uri' in buffers[0]:
        raise ValueError('Expected one embedded GLB buffer')
    if buffers[0]['byteLength'] > len(chunks[1][1]):
        raise ValueError('The embedded buffer is truncated')
    binary = chunks[1][1][:buffers[0]['byteLength']]
    views = []
    for view in doc.get('bufferViews', []):
        start = view.get('byteOffset', 0)
        end = start + view['byteLength']
        if view.get('buffer', 0) != 0 or start < 0 or end > len(binary):
            raise ValueError('Invalid embedded bufferView')
        if 'EXT_meshopt_compression' in view.get('extensions', {}):
            raise ValueError('Package the uncompressed Blender export before mesh compression')
        views.append(binary[start:end])
    return doc, views


def DecodeAccessor(doc, views, accessorIndex):
    accessor = doc['accessors'][accessorIndex]
    componentCount = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4,
                      'MAT2': 4, 'MAT3': 9, 'MAT4': 16}[accessor['type']]
    dtype = np.dtype({5120: 'i1', 5121: 'u1', 5122: '<i2', 5123: '<u2',
                      5125: '<u4', 5126: '<f4'}[accessor['componentType']])
    count = accessor['count']
    if 'bufferView' in accessor:
        view = doc['bufferViews'][accessor['bufferView']]
        stride = view.get('byteStride', componentCount * dtype.itemsize)
        result = np.ndarray((count, componentCount), dtype=dtype,
                            buffer=views[accessor['bufferView']],
                            offset=accessor.get('byteOffset', 0),
                            strides=(stride, dtype.itemsize)).copy()
    else:
        result = np.zeros((count, componentCount), dtype=dtype)
    if 'sparse' in accessor:
        sparse = accessor['sparse']
        indexInfo = sparse['indices']
        indexDtype = np.dtype({5121: 'u1', 5123: '<u2', 5125: '<u4'}[indexInfo['componentType']])
        indices = np.frombuffer(views[indexInfo['bufferView']], dtype=indexDtype,
                                count=sparse['count'], offset=indexInfo.get('byteOffset', 0))
        valueInfo = sparse['values']
        values = np.frombuffer(views[valueInfo['bufferView']], dtype=dtype,
                               count=sparse['count'] * componentCount,
                               offset=valueInfo.get('byteOffset', 0)).reshape(-1, componentCount)
        result[indices] = values
    return result


def Positions(doc, views, accessorIndex):
    accessor = doc['accessors'][accessorIndex]
    values = DecodeAccessor(doc, views, accessorIndex)
    result = values.astype(np.float64)
    if accessor.get('normalized') and np.issubdtype(values.dtype, np.integer):
        limits = np.iinfo(values.dtype)
        result /= limits.max
        if limits.min < 0:
            result = np.maximum(result, -1)
    if result.shape[1] != 3 or not np.isfinite(result).all():
        raise ValueError('POSITION must contain finite VEC3 coordinates')
    return result


def NodeMatrix(node):
    if 'matrix' in node:
        return np.asarray(node['matrix'], dtype=np.float64).reshape(4, 4, order='F')
    x, y, z, w = node.get('rotation', [0, 0, 0, 1])
    norm = np.linalg.norm([x, y, z, w])
    if norm == 0:
        raise ValueError('A node has a zero-length quaternion')
    x, y, z, w = np.asarray([x, y, z, w]) / norm
    matrix = np.eye(4, dtype=np.float64)
    matrix[:3, :3] = [[1 - 2 * (y*y + z*z), 2 * (x*y - z*w), 2 * (x*z + y*w)],
                     [2 * (x*y + z*w), 1 - 2 * (x*x + z*z), 2 * (y*z - x*w)],
                     [2 * (x*z - y*w), 2 * (y*z + x*w), 1 - 2 * (x*x + y*y)]]
    matrix[:3, :3] *= np.asarray(node.get('scale', [1, 1, 1]))[None, :]
    matrix[:3, 3] = node.get('translation', [0, 0, 0])
    return matrix


def MeshInstances(doc):
    nodes = doc.get('nodes', [])
    instances = {}

    def Visit(nodeIndex, parentMatrix, ancestors, sceneIndex):
        if nodeIndex in ancestors:
            raise ValueError('The node graph contains a cycle')
        node = nodes[nodeIndex]
        if 'skin' in node:
            raise ValueError('This packer accepts static, unskinned meshes')
        matrix = parentMatrix @ NodeMatrix(node)
        if not np.isfinite(matrix).all() or not np.allclose(matrix[3], [0, 0, 0, 1]):
            raise ValueError('Expected a finite affine node transform')
        if 'mesh' in node:
            instances.setdefault(node['mesh'], []).append((sceneIndex, nodeIndex, matrix))
        for child in node.get('children', []):
            Visit(child, matrix, ancestors | {nodeIndex}, sceneIndex)

    scenes = doc.get('scenes', [])
    if scenes:
        for sceneIndex, scene in enumerate(scenes):
            for nodeIndex in scene.get('nodes', []):
                Visit(nodeIndex, np.eye(4), set(), sceneIndex)
    else:
        children = {child for node in nodes for child in node.get('children', [])}
        for nodeIndex in range(len(nodes)):
            if nodeIndex not in children:
                Visit(nodeIndex, np.eye(4), set(), None)
    return instances


def AttributeHashes(doc, views):
    return [[{name: Hash(DecodeAccessor(doc, views, index).tobytes())
              for name, index in primitive['attributes'].items()}
             for primitive in mesh['primitives']] for mesh in doc.get('meshes', [])]


def ViewReferences(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if key == 'bufferView':
                yield value
            else:
                yield from ViewReferences(item)
    elif isinstance(value, list):
        for item in value:
            yield from ViewReferences(item)


def FilterTriangles(doc, views):
    instances = MeshInstances(doc)
    accessorUses = Counter()
    viewUses = Counter(item['bufferView'] for item in ViewReferences(doc))
    imageViews = {image.get('bufferView') for image in doc.get('images', [])}
    for mesh in doc.get('meshes', []):
        for primitive in mesh['primitives']:
            accessorUses.update(primitive['attributes'].values())
            if 'indices' in primitive:
                accessorUses[primitive['indices']] += 1
    for skin in doc.get('skins', []):
        if 'inverseBindMatrices' in skin:
            accessorUses[skin['inverseBindMatrices']] += 1
    for animation in doc.get('animations', []):
        for sampler in animation.get('samplers', []):
            accessorUses.update([sampler['input'], sampler['output']])
    rows = []
    for meshIndex, mesh in enumerate(doc.get('meshes', [])):
        placements = instances.get(meshIndex, [(None, None, np.eye(4))])
        for primitiveIndex, primitive in enumerate(mesh['primitives']):
            if primitive.get('mode', 4) != 4 or primitive.get('targets'):
                raise ValueError('Expected static TRIANGLES primitives without morph targets')
            if 'KHR_draco_mesh_compression' in primitive.get('extensions', {}):
                raise ValueError('Package the uncompressed Blender export before Draco')
            positions = Positions(doc, views, primitive['attributes']['POSITION'])
            accessorIndex = primitive.get('indices')
            if accessorIndex is None:
                indices = np.arange(len(positions), dtype=np.uint32)
            else:
                accessor = doc['accessors'][accessorIndex]
                if accessor['componentType'] not in (5121, 5123, 5125) or accessor['type'] != 'SCALAR':
                    raise ValueError('Triangle indices must be unsigned integer SCALAR values')
                indices = DecodeAccessor(doc, views, accessorIndex).reshape(-1)
            if len(indices) % 3 or len(indices) == 0 or indices.max() >= len(positions):
                raise ValueError('Invalid triangle index count or vertex index')
            faces = indices.reshape(-1, 3)
            remove = np.zeros(len(faces), dtype=bool)
            instanceRows = []
            for sceneIndex, nodeIndex, matrix in placements:
                world = positions @ matrix[:3, :3].T + matrix[:3, 3]
                triangle = world[faces]
                cross = np.linalg.norm(np.cross(triangle[:, 1] - triangle[:, 0],
                                               triangle[:, 2] - triangle[:, 0]), axis=1)
                invalid = cross < 1e-12
                remove |= invalid
                instanceRows.append({'scene': sceneIndex, 'node': nodeIndex,
                                     'belowThreshold': int(invalid.sum()),
                                     'minimumCross': float(cross.min())})
            filtered = faces[~remove].reshape(-1)
            if not len(filtered):
                raise ValueError(f'Mesh {meshIndex} primitive {primitiveIndex} contains no valid triangles')
            if remove.any():
                if accessorIndex is None:
                    accessor = {'componentType': 5125, 'type': 'SCALAR'}
                    canReplace = False
                else:
                    accessor = doc['accessors'][accessorIndex]
                    viewIndex = accessor.get('bufferView')
                    canReplace = (viewIndex is not None and accessorUses[accessorIndex] == 1
                                  and viewUses[viewIndex] == 1 and viewIndex not in imageViews
                                  and not accessor.get('byteOffset') and 'sparse' not in accessor
                                  and 'byteStride' not in doc['bufferViews'][viewIndex])
                payload = filtered.astype({5121: 'u1', 5123: '<u2', 5125: '<u4'}[accessor['componentType']]).tobytes()
                if canReplace:
                    views[viewIndex] = payload
                else:
                    accessor = copy.deepcopy(accessor)
                    accessor.pop('sparse', None)
                    accessor.pop('byteOffset', None)
                    viewIndex = len(views)
                    views.append(payload)
                    doc['bufferViews'].append({'buffer': 0, 'byteLength': len(payload), 'target': 34963})
                    accessor['bufferView'] = viewIndex
                    primitive['indices'] = len(doc['accessors'])
                    doc['accessors'].append(accessor)
                accessor.update({'count': len(filtered), 'min': [int(filtered.min())],
                                 'max': [int(filtered.max())]})
            rows.append({'mesh': meshIndex, 'meshName': mesh.get('name'), 'primitive': primitiveIndex,
                         'material': primitive.get('material'), 'inputTriangles': len(faces),
                         'removedTriangles': int(remove.sum()), 'outputTriangles': len(filtered) // 3,
                         'removedTriangleIndices': np.flatnonzero(remove).tolist(),
                         'outputIndexSha256': Hash(filtered.tobytes()), 'instances': instanceRows})
    return rows


def ImageInfo(data):
    with Image.open(io.BytesIO(data)) as image:
        image.load()
        return {'dimensions': list(image.size), 'rgbaSha256': Hash(image.convert('RGBA').tobytes())}


def TextureImage(texture):
    return texture.get('extensions', {}).get('EXT_texture_webp', {}).get('source', texture.get('source'))


def TextureInfos(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if key.lower().endswith('texture') and isinstance(item, dict) and 'index' in item:
                yield item
            else:
                yield from TextureInfos(item)
    elif isinstance(value, list):
        for item in value:
            yield from TextureInfos(item)


def PackImages(doc, views, bsDir):
    materials = [material for material in doc.get('materials', []) if material.get('name') == 'BS_FootCloth']
    if len(materials) != 1:
        raise ValueError('Expected exactly one material named BS_FootCloth')
    material = materials[0]
    roleInfos = {'BaseColor': material.get('pbrMetallicRoughness', {}).get('baseColorTexture'),
                 'Normal': material.get('normalTexture')}
    if any(info is None for info in roleInfos.values()):
        raise ValueError('BS_FootCloth must have BaseColor and Normal texture slots')
    textureUses = Counter(info['index'] for info in TextureInfos(doc.get('materials', [])))
    imageUses = Counter(TextureImage(texture) for texture in doc.get('textures', []))
    replacements = {}
    roles = []
    for role, info in roleInfos.items():
        textureIndex = info['index']
        texture = doc['textures'][textureIndex]
        imageIndex = TextureImage(texture)
        if imageIndex is None:
            raise ValueError(f'BS {role} has no supported image source')
        if textureUses[textureIndex] > 1 or imageUses[imageIndex] > 1 or imageIndex in replacements:
            texture = copy.deepcopy(texture)
            imageIndex = len(doc['images'])
            doc['images'].append(copy.deepcopy(doc['images'][TextureImage(texture)]))
            texture.pop('source', None)
            texture.setdefault('extensions', {})['EXT_texture_webp'] = {'source': imageIndex}
            info['index'] = len(doc['textures'])
            doc['textures'].append(texture)
        file = bsDir / f'BS_{role}.webp'
        payload = file.read_bytes()
        if payload[:4] != b'RIFF' or payload[8:12] != b'WEBP':
            raise ValueError(f'Expected WebP input: {file}')
        replacements[imageIndex] = (payload, role)
        roles.append({'role': role, 'image': imageIndex, 'sourceFile': str(file.resolve()),
                      'sha256': Hash(payload), 'bytes': len(payload)})
    rows = []
    converted = set()
    for imageIndex, image in enumerate(doc.get('images', [])):
        if 'uri' in image or 'bufferView' not in image:
            raise ValueError('All source images must be embedded bufferViews')
        source = views[image['bufferView']]
        sourceInfo = ImageInfo(source)
        payload = source
        method = 'unchanged'
        if imageIndex in replacements:
            payload, role = replacements[imageIndex]
            method = f'archived_BS_{role}_exact_bytes'
            if ImageInfo(payload)['dimensions'] != sourceInfo['dimensions']:
                raise ValueError(f'BS {role} dimensions differ from the exported texture')
            image['name'] = f'BS_{role}'
        elif image.get('mimeType') == 'image/png' or source.startswith(b'\x89PNG\r\n\x1a\n'):
            with Image.open(io.BytesIO(source)) as decoded:
                decoded.load()
                output = io.BytesIO()
                decoded.convert('RGBA').save(output, format='WEBP', lossless=True, method=6, exact=True)
                payload = output.getvalue()
            if ImageInfo(payload) != sourceInfo:
                raise ValueError(f'PNG to WebP pixel preservation failed for image {imageIndex}')
            method = 'same_resolution_lossless_webp'
        if method != 'unchanged':
            image['bufferView'] = len(views)
            image['mimeType'] = 'image/webp'
            views.append(payload)
            doc['bufferViews'].append({'buffer': 0, 'byteLength': len(payload)})
            converted.add(imageIndex)
        rows.append({'image': imageIndex, 'name': image.get('name'), 'method': method,
                     'inputBytes': len(source), 'outputBytes': len(payload),
                     'inputSha256': Hash(source), 'outputSha256': Hash(payload),
                     'inputRgbaSha256': sourceInfo['rgbaSha256'], **ImageInfo(payload)})
    for texture in doc.get('textures', []):
        imageIndex = TextureImage(texture)
        if imageIndex in converted or (imageIndex is not None and doc['images'][imageIndex].get('mimeType') == 'image/webp'):
            texture.setdefault('extensions', {})['EXT_texture_webp'] = {'source': imageIndex}
            if texture.get('source') == imageIndex or (texture.get('source') in converted):
                texture.pop('source', None)
    if any('EXT_texture_webp' in texture.get('extensions', {}) for texture in doc.get('textures', [])):
        for key in ['extensionsUsed', 'extensionsRequired']:
            doc[key] = sorted(set(doc.get(key, []) + ['EXT_texture_webp']))
    return rows, roles


def EncodeGlb(doc, views):
    references = list(ViewReferences(doc))
    used = sorted({item['bufferView'] for item in references})
    mapping = {old: new for new, old in enumerate(used)}
    binary = bytearray()
    packedViews = []
    for index in used:
        binary.extend(b'\0' * (-len(binary) % 4))
        view = copy.deepcopy(doc['bufferViews'][index])
        view.update({'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(views[index])})
        packedViews.append(view)
        binary.extend(views[index])
    for item in references:
        item['bufferView'] = mapping[item['bufferView']]
    doc['bufferViews'] = packedViews
    doc['buffers'][0]['byteLength'] = len(binary)
    binary.extend(b'\0' * (-len(binary) % 4))
    encoded = json.dumps(doc, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode('utf-8')
    encoded += b' ' * (-len(encoded) % 4)
    return (struct.pack('<III', 0x46546C67, 2, 28 + len(encoded) + len(binary))
            + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
            + struct.pack('<II', len(binary), 0x004E4942) + binary)


def Pack(inputFile, outputFile, bsDir, receiptFile):
    if inputFile.resolve() == outputFile.resolve():
        raise ValueError('Use a separate output path; the Blender export remains a reproducible input')
    if not features.check('webp'):
        raise RuntimeError('Pillow must include WebP support')
    source = inputFile.read_bytes()
    doc, views = ReadGlb(source)
    beforeAttributes = AttributeHashes(doc, views)
    beforeSamplers = copy.deepcopy(doc.get('samplers', []))
    beforeNodes = copy.deepcopy(doc.get('nodes', []))
    beforeScenes = copy.deepcopy(doc.get('scenes', []))
    beforeTextureInfos = copy.deepcopy(list(TextureInfos(doc.get('materials', []))))
    primitives = FilterTriangles(doc, views)
    images, roles = PackImages(doc, views, bsDir)
    output = EncodeGlb(doc, views)
    checkedDoc, checkedViews = ReadGlb(output)
    if AttributeHashes(checkedDoc, checkedViews) != beforeAttributes:
        raise ValueError('A vertex attribute changed during packaging')
    if (checkedDoc.get('samplers', []) != beforeSamplers or checkedDoc.get('nodes', []) != beforeNodes
            or checkedDoc.get('scenes', []) != beforeScenes):
        raise ValueError('Samplers or scene transforms changed during packaging')
    afterTextureInfos = list(TextureInfos(checkedDoc.get('materials', [])))
    if [{key: value for key, value in info.items() if key != 'index'} for info in beforeTextureInfos] != [
            {key: value for key, value in info.items() if key != 'index'} for info in afterTextureInfos]:
        raise ValueError('A material texture coordinate or transform changed during packaging')
    for row in images:
        payload = checkedViews[checkedDoc['images'][row['image']]['bufferView']]
        if Hash(payload) != row['outputSha256'] or ImageInfo(payload)['rgbaSha256'] != row['rgbaSha256']:
            raise ValueError('An embedded image changed during serialization')
    verified = FilterTriangles(checkedDoc, checkedViews)
    if any(row['removedTriangles'] for row in verified):
        raise ValueError('The packed GLB still contains triangles below the world-space gate')
    for expected, actual in zip(primitives, verified):
        if expected['outputIndexSha256'] != actual['outputIndexSha256']:
            raise ValueError('Triangle indices changed beyond the recorded filtering')
    instanceDraws = sum(len(row['instances']) for row in primitives)
    receipt = {'method': 'BS exact WebP bytes; other PNG same-size lossless WebP; float64 world-space index filtering',
               'areaGate': {'crossMagnitudeThreshold': 1e-12, 'units': 'square_metres_twice_triangle_area',
                            'comparison': 'strictly_less', 'instances': 'union_of_all_scene_node_default_transforms'},
               'input': {'file': str(inputFile.resolve()), 'bytes': len(source), 'sha256': Hash(source)},
               'output': {'file': str(outputFile.resolve()), 'bytes': len(output), 'sha256': Hash(output)},
               'totals': {'inputTriangles': sum(row['inputTriangles'] for row in primitives),
                          'removedTriangles': sum(row['removedTriangles'] for row in primitives),
                          'outputTriangles': sum(row['outputTriangles'] for row in primitives),
                          'drawPrimitives': len(primitives), 'sceneInstanceDraws': instanceDraws,
                          'meshObjects': len(doc.get('meshes', [])),
                          'usedMaterials': len({row['material'] for row in primitives if row['material'] is not None}),
                          'embeddedImageBytes': sum(row['outputBytes'] for row in images)},
               'preserved': {'vertexAttributeBytes': True, 'samplers': True, 'nodeAndSceneTransforms': True,
                             'textureCoordinatesAndTransforms': True, 'indicesExceptRecordedFaces': True},
               'attributeHashes': beforeAttributes, 'bsImages': roles, 'images': images, 'primitives': primitives,
               'scriptSha256': Hash(Path(__file__).read_bytes())}
    outputFile.parent.mkdir(parents=True, exist_ok=True)
    outputFile.write_bytes(output)
    if Hash(outputFile.read_bytes()) != receipt['output']['sha256']:
        raise IOError('The saved GLB did not match the verified bytes')
    receiptFile.parent.mkdir(parents=True, exist_ok=True)
    receiptFile.write_text(json.dumps(receipt, indent=2, ensure_ascii=False, allow_nan=False) + '\n', encoding='utf-8')
    return receipt


def Main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path, help='Uncompressed, embedded Blender GLB')
    parser.add_argument('output', type=Path, help='Complete game GLB')
    parser.add_argument('--bs-dir', required=True, type=Path, help='Directory containing BS_BaseColor.webp and BS_Normal.webp')
    parser.add_argument('--receipt', required=True, type=Path, help='Output JSON receipt')
    args = parser.parse_args()
    receipt = Pack(args.input, args.output, args.bs_dir, args.receipt)
    print(json.dumps({'output': receipt['output'], 'totals': receipt['totals']}, indent=2))


if __name__ == '__main__':
    Main()
