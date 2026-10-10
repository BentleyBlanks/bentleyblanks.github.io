"""Rebuild the Ki-30 geometry-only optimization with Blender 4.3+.

blender -b -t 4 --python Script_OptimizeKi30.py -- \
  --source Source/Model_MitsubishiKi30.glb --output Candidates/Model_MitsubishiKi30.glb \
  --blend Blend/Optimized_MitsubishiKi30.blend --report Reports/Optimization.json

Source GLB is retained separately. Source node hierarchy/transforms, materials,
textures, sampler configuration and embedded image bytes are copied unchanged.
Only main airframe and exterior canopy geometry are reduced. No merge-by-distance,
material replacement, texture resampling, UV unwrap or global smoothing is used.
The glass and propeller primitives keep their original accessor bytes.
The retained original GLB is required by SHA-256; an optimized output is never
accepted as input. All three output paths must be distinct from both sources.
"""
import argparse, copy, hashlib, json, math, os, struct, sys
import bpy
import numpy as np
from mathutils import Vector


SOURCE_SHA256 = 'd052ce0b07ac2bec17da7fd106c22425afa074efd157d39d6c706483b46821c5'
SOURCE_BASE_COMMIT = '5e26010efb701b8f17ce07a64c1a1f0d9a2dab68'
SOURCE_REPOSITORY_PATH = 'Taierzhuang1938/Model/Model_MitsubishiKi30.glb'


def ParseArgs():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True)
    parser.add_argument('--source-blend')
    parser.add_argument('--output', required=True)
    parser.add_argument('--blend', required=True)
    parser.add_argument('--report', required=True)
    parser.add_argument('--main-ratio', type=float, default=.32)
    parser.add_argument('--canopy-ratio', type=float, default=.4)
    return parser.parse_args(sys.argv[sys.argv.index('--') + 1:])


def ValidatePaths(args):
    """Reject aliases before creating directories or changing Blender state."""
    def SameFile(left, right):
        if os.path.normcase(os.path.realpath(left)) == os.path.normcase(os.path.realpath(right)):
            return True
        return os.path.exists(left) and os.path.exists(right) and os.path.samefile(left, right)

    inputs = [('source', args.source)]
    if args.source_blend:
        inputs.append(('source-blend', args.source_blend))
    outputs = [('output', args.output), ('blend', args.blend), ('report', args.report)]
    for index, (name, path) in enumerate(outputs):
        if os.path.isdir(path):
            raise ValueError(f'--{name} must be a file path, not a directory: {path}')
        for otherName, otherPath in inputs + outputs[:index]:
            if SameFile(path, otherPath):
                raise ValueError(f'--{name} aliases --{otherName}; use distinct files to preserve sources: {path}')


def ReadGlb(path):
    data = open(path, 'rb').read()
    magic, version, total = struct.unpack_from('<III', data)
    assert magic == 0x46546C67 and version == 2 and total == len(data)
    jsonSize, jsonType = struct.unpack_from('<II', data, 12)
    assert jsonType == 0x4E4F534A
    document = json.loads(data[20:20 + jsonSize])
    binSize, binType = struct.unpack_from('<II', data, 20 + jsonSize)
    assert binType == 0x004E4942
    return document, data[28 + jsonSize:28 + jsonSize + binSize], data


def WriteGlb(path, document, binary):
    document['buffers'] = [{'byteLength': len(binary)}]
    jsonBytes = json.dumps(document, ensure_ascii=False, separators=(',', ':')).encode()
    jsonBytes += b' ' * ((-len(jsonBytes)) % 4)
    binary += b'\0' * ((-len(binary)) % 4)
    size = 12 + 8 + len(jsonBytes) + 8 + len(binary)
    with open(path, 'wb') as output:
        output.write(struct.pack('<III', 0x46546C67, 2, size))
        output.write(struct.pack('<II', len(jsonBytes), 0x4E4F534A)); output.write(jsonBytes)
        output.write(struct.pack('<II', len(binary), 0x004E4942)); output.write(binary)


def Bounds(mesh):
    return [[min(v.co[axis] for v in mesh.vertices) for axis in range(3)],
            [max(v.co[axis] for v in mesh.vertices) for axis in range(3)]]


def SourcePositionsAndTransforms(document, binary):
    transforms = {}
    def Matrix(node):
        if 'matrix' in node: return np.array(node['matrix']).reshape(4, 4).T
        x, y, z, w = node.get('rotation', [0, 0, 0, 1])
        matrix = np.eye(4)
        matrix[:3, :3] = [[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)], [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]]
        matrix[:3, :3] *= node.get('scale', [1, 1, 1])
        matrix[:3, 3] = node.get('translation', [0, 0, 0])
        return matrix
    def Visit(index, parent):
        node = document['nodes'][index]
        matrix = parent @ Matrix(node)
        if 'mesh' in node: transforms[node['mesh']] = matrix
        for child in node.get('children', []): Visit(child, matrix)
    for node in document['scenes'][document.get('scene', 0)]['nodes']: Visit(node, np.eye(4))
    result = {}
    for index, mesh in enumerate(document['meshes']):
        accessor = document['accessors'][mesh['primitives'][0]['attributes']['POSITION']]
        view = document['bufferViews'][accessor['bufferView']]
        positions = np.ndarray((accessor['count'], 3), dtype='<f4', buffer=binary, offset=view.get('byteOffset', 0)+accessor.get('byteOffset', 0), strides=(view.get('byteStride', 12), 4)).copy()
        result[mesh['name']] = (positions, transforms[index])
    return result


def ReduceObject(obj, ratio, sourcePositions, worldMatrix):
    sourceBounds = Bounds(obj.data)
    # Zero group weights freeze original boundary extrema; unlike weld, the
    # original UV/hard-normal splits remain disconnected and cannot be crossed.
    protected = [v.index for v in obj.data.vertices if any(
        abs(v.co[axis] - sourceBounds[side][axis]) < 1e-6
        for axis in range(3) for side in range(2))]
    group = obj.vertex_groups.new(name='ProtectedSourceExtrema')
    group.add(protected, 1.0, 'REPLACE')
    sourceWorld = (worldMatrix @ np.c_[sourcePositions, np.ones(len(sourcePositions))].T).T[:, :3]
    sourceWorldMin, sourceWorldMax = sourceWorld.min(0), sourceWorld.max(0)
    worldExtrema = set(int(sourceWorld[:, axis].argmin()) for axis in range(3)) | set(int(sourceWorld[:, axis].argmax()) for axis in range(3))
    group.add(list(worldExtrema), 1.0, 'REPLACE')
    before = len(obj.data.polygons)
    modifier = obj.modifiers.new(name='GeometryOnlyCollapse', type='DECIMATE')
    modifier.decimate_type = 'COLLAPSE'
    modifier.ratio = ratio
    modifier.use_collapse_triangulate = True
    modifier.vertex_group = group.name
    modifier.invert_vertex_group = True
    modifier.vertex_group_factor = 1.0
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    # QEM may overshoot a source AABB a fraction of a millimeter. Clamp only
    # those overshoots, without rescaling the model or moving preserved extrema.
    clamped = 0
    maximumClamp = 0.0
    for vertex in obj.data.vertices:
        old = vertex.co.copy()
        for axis in range(3):
            vertex.co[axis] = min(sourceBounds[1][axis], max(sourceBounds[0][axis], vertex.co[axis]))
        displacement = (old - vertex.co).length
        if displacement:
            clamped += 1
            maximumClamp = max(maximumClamp, displacement)
    # Source rotations include tiny authored non-axis-aligned terms. Preserve
    # exact whole-aircraft world AABB too, by returning airframe overshoot to a nearest
    # original surface vertex. No scale, transform or source extent is changed.
    worldSnapped = 0
    maximumWorldSnap = 0.0
    for vertex in obj.data.vertices:
        position = np.array((vertex.co.x, vertex.co.z, -vertex.co.y))
        world = (worldMatrix @ np.r_[position, 1])[:3]
        if obj.name == 'Circle_Material_0' and (np.any(world < sourceWorldMin) or np.any(world > sourceWorldMax)):
            nearest = sourcePositions[np.sum((sourcePositions - position) ** 2, axis=1).argmin()]
            delta = float(np.linalg.norm(nearest-position))
            vertex.co = (float(nearest[0]), -float(nearest[2]), float(nearest[1]))
            worldSnapped += 1
            maximumWorldSnap = max(maximumWorldSnap, delta)
    obj.data.update()
    candidateBounds = Bounds(obj.data)
    assert sourceBounds == candidateBounds, (obj.name, sourceBounds, candidateBounds)
    return {'name': obj.name, 'ratio': ratio, 'sourceTriangles': before,
            'candidateTriangles': len(obj.data.polygons), 'protectedVertices': len(protected),
            'clampedVertices': clamped, 'maximumClampSourceUnits': maximumClamp,
            'worldBoundSnappedVertices': worldSnapped, 'maximumWorldBoundSnapSourceUnits': maximumWorldSnap,
            'localBoundsExact': True, 'sourceBoundsBlenderLocal': sourceBounds,
            'candidateBoundsBlenderLocal': candidateBounds,
            'hasCustomNormals': obj.data.has_custom_normals,
            'smoothPolygons': sum(p.use_smooth for p in obj.data.polygons)}


def SerializeMesh(mesh):
    mesh.calc_loop_triangles()
    assert mesh.uv_layers.active is not None
    uvData = mesh.uv_layers.active.data
    normals = mesh.corner_normals
    unique, positions, normalValues, uvs, indices = {}, [], [], [], []
    for triangle in mesh.loop_triangles:
        for loopIndex in triangle.loops:
            loop = mesh.loops[loopIndex]
            position = mesh.vertices[loop.vertex_index].co
            normal = normals[loopIndex].vector
            uv = uvData[loopIndex].uv
            # Inverse of Blender glTF import axis and UV conversion.
            p = (position.x, position.z, -position.y)
            n = (normal.x, normal.z, -normal.y)
            t = (uv.x, 1.0 - uv.y)
            key = struct.pack('<8f', *(p + n + t))
            if key not in unique:
                unique[key] = len(positions)
                positions.append(p); normalValues.append(n); uvs.append(t)
            indices.append(unique[key])
    return positions, normalValues, uvs, indices


def Main():
    args = ParseArgs()
    ValidatePaths(args)
    source, sourceBinary, sourceFile = ReadGlb(args.source)
    sourceSha256 = hashlib.sha256(sourceFile).hexdigest()
    if sourceSha256 != SOURCE_SHA256:
        raise ValueError(f'Expected retained original Ki30 SHA-256 {SOURCE_SHA256}, got {sourceSha256}. Never use a previous optimized output as input.')
    sourceBlendSha256 = None
    if args.source_blend:
        with open(args.source_blend, 'rb') as sourceBlendFile:
            sourceBlendSha256 = hashlib.sha256(sourceBlendFile.read()).hexdigest()
    for path in (args.output, args.blend, args.report):
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if args.source_blend:
        bpy.ops.wm.open_mainfile(filepath=args.source_blend)
    else:
        bpy.ops.import_scene.gltf(filepath=os.path.abspath(args.source))
    ratios = {'Circle_Material_0': args.main_ratio, 'Circle.004_Material_0': args.canopy_ratio}
    operations = []
    sourceGeometry = SourcePositionsAndTransforms(source, sourceBinary)
    for name, (sourcePositions, _) in sourceGeometry.items():
        obj = bpy.data.objects[name]
        importedPositions = np.array([(v.co.x, v.co.z, -v.co.y) for v in obj.data.vertices], dtype=np.float32)
        if not np.array_equal(importedPositions, sourcePositions):
            raise ValueError('Source blend geometry differs from retained GLB: ' + name)
    for name, ratio in ratios.items():
        operations.append(ReduceObject(bpy.data.objects[name], ratio, *sourceGeometry[name]))
    # Save editable Blender scene with source materials and packed image data.
    bpy.ops.file.pack_all()
    # Keep writes restricted to the three explicitly validated outputs.
    # A Blender .blend1 backup must never alias a separately retained source.
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.blend))
    result = copy.deepcopy(source)
    result['accessors'] = []
    result['bufferViews'] = []
    outputBinary = bytearray()

    def AddView(payload, target=None):
        outputBinary.extend(b'\0' * ((-len(outputBinary)) % 4))
        index = len(result['bufferViews'])
        view = {'buffer': 0, 'byteOffset': len(outputBinary), 'byteLength': len(payload)}
        if target is not None: view['target'] = target
        result['bufferViews'].append(view); outputBinary.extend(payload)
        return index

    def CopyAccessor(index):
        accessor = copy.deepcopy(source['accessors'][index])
        sourceView = source['bufferViews'][accessor['bufferView']]
        offset = sourceView.get('byteOffset', 0)
        viewIndex = AddView(sourceBinary[offset:offset + sourceView['byteLength']], sourceView.get('target'))
        if 'byteStride' in sourceView: result['bufferViews'][viewIndex]['byteStride'] = sourceView['byteStride']
        accessor['bufferView'] = viewIndex
        newIndex = len(result['accessors']); result['accessors'].append(accessor)
        return newIndex

    def AddAttribute(values, count, components, kind, componentType, target, bounds=False):
        flat = [value for row in values for value in row] if components > 1 else values
        element = {5126: 'f', 5123: 'H', 5125: 'I'}[componentType]
        viewIndex = AddView(struct.pack('<' + str(len(flat)) + element, *flat), target)
        accessor = {'bufferView': viewIndex, 'componentType': componentType, 'count': count, 'type': kind}
        if bounds:
            accessor['min'] = [min(row[axis] for row in values) for axis in range(components)]
            accessor['max'] = [max(row[axis] for row in values) for axis in range(components)]
        index = len(result['accessors']); result['accessors'].append(accessor)
        return index

    meshStats = []
    for meshIndex, sourceMesh in enumerate(source['meshes']):
        name = sourceMesh['name']
        primitive = result['meshes'][meshIndex]['primitives'][0]
        if name in ratios:
            positions, normals, uvs, indices = SerializeMesh(bpy.data.objects[name].data)
            primitive['attributes'] = {
                'POSITION': AddAttribute(positions, len(positions), 3, 'VEC3', 5126, 34962, True),
                'NORMAL': AddAttribute(normals, len(normals), 3, 'VEC3', 5126, 34962),
                'TEXCOORD_0': AddAttribute(uvs, len(uvs), 2, 'VEC2', 5126, 34962),
            }
            primitive['indices'] = AddAttribute(indices, len(indices), 1, 'SCALAR', 5123 if len(positions) < 65536 else 5125, 34963)
            meshStats.append({'name': name, 'triangles': len(indices) // 3, 'vertices': len(positions), 'geometry': 'decimated'})
        else:
            primitive['attributes'] = {key: CopyAccessor(value) for key, value in primitive['attributes'].items()}
            primitive['indices'] = CopyAccessor(primitive['indices'])
            meshStats.append({'name': name, 'triangles': result['accessors'][primitive['indices']]['count'] // 3,
                              'vertices': result['accessors'][primitive['attributes']['POSITION']]['count'],
                              'geometry': 'source_accessor_bytes_unchanged'})
    imageStats = []
    for index, sourceImage in enumerate(source['images']):
        sourceView = source['bufferViews'][sourceImage['bufferView']]
        offset = sourceView.get('byteOffset', 0)
        payload = sourceBinary[offset:offset + sourceView['byteLength']]
        result['images'][index]['bufferView'] = AddView(payload)
        imageStats.append({'name': sourceImage.get('name'), 'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()})
    WriteGlb(args.output, result, outputBinary)
    report = {'source': os.path.abspath(args.source), 'sourceSha256': sourceSha256,
              'sourceProvenance': {'requiredSha256': SOURCE_SHA256, 'baseCommit': SOURCE_BASE_COMMIT,
                                   'repositoryPath': SOURCE_REPOSITORY_PATH, 'kind': 'retained original high-poly GLB'},
              'sourceBlend': os.path.abspath(args.source_blend) if args.source_blend else None,
              'sourceBlendSha256': sourceBlendSha256,
              'output': os.path.abspath(args.output), 'outputSha256': hashlib.sha256(open(args.output, 'rb').read()).hexdigest(),
              'blenderVersion': bpy.app.version_string, 'operations': operations,
              'meshStats': meshStats, 'triangles': sum(m['triangles'] for m in meshStats),
              'vertices': sum(m['vertices'] for m in meshStats), 'images': imageStats,
              'sourceBytes': len(sourceFile), 'candidateBytes': os.path.getsize(args.output),
              'preservedJsonKeys': [key for key in ['nodes','scenes','scene','materials','textures','samplers','extensionsUsed','extensionsRequired'] if source[key] == result[key]],
              'sourceNoseDir': [0,1], 'runtimeWingspanMUnchanged': 14.55,
              'uvPolicy': 'Keep original UV layer and interpolate only collapsed vertices; no unwrap or texture edit.',
              'normalPolicy': 'Keep source custom normals and smooth/flat topology; no all-smooth operation.',
              'validation': 'Numeric results only; compare actual source/candidate renders before selecting.'}
    with open(args.report, 'w') as output: json.dump(report, output, indent=2)
    print(json.dumps(report, indent=2))


if __name__ == '__main__': Main()
