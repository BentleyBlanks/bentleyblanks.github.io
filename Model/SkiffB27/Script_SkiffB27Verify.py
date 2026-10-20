"""Independently inspect Skiff B27 GLB contracts and solid fastener support.

Requires Python 3, NumPy and Pillow; does not import Blender or the asset builder.
Support means a metal/wood triangle intersection or a metal vertex strictly
inside a closed wooden component. A small surface distance is never support.
The optional penetration-volume measurement is deterministic quadrature, not
an exact constructive-solid-geometry volume; the JSON explicitly records this.
"""
import argparse
from collections import Counter
import hashlib
import io
import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image


componentTypes = {5120: 'i1', 5121: 'u1', 5122: '<i2', 5123: '<u2', 5125: '<u4', 5126: '<f4'}
typeWidths = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT2': 4, 'MAT3': 9, 'MAT4': 16}
geometryEpsilon = 1e-9


def ReadGlb(path):
    raw = Path(path).read_bytes()
    if len(raw) < 20:
        raise ValueError('Truncated GLB')
    magic, version, length = struct.unpack_from('<III', raw)
    if magic != 0x46546C67 or version != 2 or length != len(raw):
        raise ValueError('Invalid GLB header')
    offset, document, binary = 12, None, None
    while offset < length:
        count, kind = struct.unpack_from('<II', raw, offset)
        if offset + 8 + count > length:
            raise ValueError('Truncated GLB chunk')
        data = raw[offset + 8:offset + 8 + count]
        if kind == 0x4E4F534A:
            document = json.loads(data)
        elif kind == 0x004E4942:
            binary = data
        offset += count + 8
    if document is None or binary is None or offset != length:
        raise ValueError('GLB requires JSON and embedded binary chunks')
    if any('uri' in item for item in document.get('buffers', [])):
        raise ValueError('External buffer is outside the standalone-GLB contract')
    return document, binary


def Accessor(document, binary, index):
    definition = document['accessors'][index]
    if 'sparse' in definition or 'bufferView' not in definition:
        raise ValueError('Unexpected sparse/accessor-without-bufferView')
    view = document['bufferViews'][definition['bufferView']]
    dtype = np.dtype(componentTypes[definition['componentType']])
    columns = typeWidths[definition['type']]
    stride = view.get('byteStride', columns * dtype.itemsize)
    offset = view.get('byteOffset', 0) + definition.get('byteOffset', 0)
    result = np.ndarray((definition['count'], columns), dtype=dtype,
                        buffer=binary, offset=offset,
                        strides=(stride, dtype.itemsize)).copy()
    if not np.isfinite(result).all():
        raise ValueError('Nonfinite accessor')
    return result


def NodeMatrix(node):
    if 'matrix' in node:
        return np.asarray(node['matrix'], dtype=float).reshape((4, 4), order='F')
    x, y, z, w = node.get('rotation', [0, 0, 0, 1])
    result = np.eye(4)
    result[:3, :3] = np.array([
        [1 - 2 * (y*y + z*z), 2 * (x*y - z*w), 2 * (x*z + y*w)],
        [2 * (x*y + z*w), 1 - 2 * (x*x + z*z), 2 * (y*z - x*w)],
        [2 * (x*z - y*w), 2 * (y*z + x*w), 1 - 2 * (x*x + y*y)]
    ]) @ np.diag(node.get('scale', [1, 1, 1]))
    result[:3, 3] = node.get('translation', [0, 0, 0])
    return result


def DecodeGeometry(document, binary):
    primitives = []

    def Visit(nodeIndex, parent, ancestors):
        if nodeIndex in ancestors:
            raise ValueError('Cyclic scene graph')
        node = document['nodes'][nodeIndex]
        transform = parent @ NodeMatrix(node)
        if 'mesh' in node:
            meshIndex = node['mesh']
            for primitiveIndex, primitive in enumerate(document['meshes'][meshIndex]['primitives']):
                if primitive.get('mode', 4) != 4:
                    raise ValueError('Only TRIANGLES primitives are allowed')
                attributes = {key: Accessor(document, binary, value)
                              for key, value in primitive['attributes'].items()}
                points = attributes['POSITION'].astype(float)
                points = (transform @ np.column_stack([points, np.ones(len(points))]).T).T[:, :3]
                indices = Accessor(document, binary, primitive['indices']).reshape(-1, 3)
                if indices.min() < 0 or indices.max() >= len(points):
                    raise ValueError('Triangle index outside POSITION accessor')
                materialIndex = primitive['material']
                primitives.append({'node': nodeIndex, 'mesh': meshIndex, 'primitive': primitiveIndex,
                                   'material': materialIndex, 'materialName': document['materials'][materialIndex].get('name', ''),
                                   'attributes': attributes, 'indices': indices, 'points': points,
                                   'attributeFormats': {key: {field: document['accessors'][value].get(field, False if field == 'normalized' else None)
                                                              for field in ('componentType', 'type', 'normalized')}
                                                        for key, value in primitive['attributes'].items()},
                                   'triangles': points[indices], 'transform': transform})
        for child in node.get('children', []):
            Visit(child, transform, ancestors + [nodeIndex])

    for nodeIndex in document['scenes'][document.get('scene', 0)]['nodes']:
        Visit(nodeIndex, np.eye(4), [])
    return primitives


def TriangleCross(triangles):
    return np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])


def Components(triangles):
    # Flat normals and UV seams duplicate GLB vertices; weld only coordinates.
    points, inverse = np.unique(np.round(triangles.reshape(-1, 3), 6), axis=0, return_inverse=True)
    faces = inverse.reshape(-1, 3)
    parents = np.arange(len(points))

    def Find(index):
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = int(parents[index])
        return index

    for face in faces:
        parent = Find(int(face[0]))
        for index in face[1:]:
            parents[Find(int(index))] = parent
    groups = {}
    for faceIndex, face in enumerate(faces):
        groups.setdefault(Find(int(face[0])), []).append(faceIndex)
    result = []
    for faceIndices in sorted(groups.values(), key=lambda indices: indices[0]):
        selected = faces[faceIndices]
        vertexIds = np.unique(selected)
        edges = np.sort(np.concatenate([selected[:, [0, 1]], selected[:, [1, 2]], selected[:, [2, 0]]]), axis=1)
        _, edgeCounts = np.unique(edges, axis=0, return_counts=True)
        part = triangles[faceIndices]
        vertices = np.unique(part.reshape(-1, 3), axis=0)
        center = (vertices.min(axis=0) + vertices.max(axis=0)) / 2
        relative = part - center
        signedVolumes = np.einsum('ij,ij->i', relative[:, 0], np.cross(relative[:, 1], relative[:, 2])) / 6
        result.append({'id': len(result), 'faceIndices': np.asarray(faceIndices), 'triangles': part,
                       'vertices': vertices, 'boundsMin': vertices.min(axis=0), 'boundsMax': vertices.max(axis=0),
                       'center': center, 'closed': bool(np.all(edgeCounts == 2)),
                       'boundaryEdges': int(np.count_nonzero(edgeCounts == 1)),
                       'nonmanifoldEdges': int(np.count_nonzero(edgeCounts > 2)),
                       'volumeM3': abs(float(signedVolumes.sum())), 'weldedVertices': len(vertexIds)})
    return result


def SegmentTriangleHits(starts, ends, triangles):
    """Return (segment id, triangle id, world point) for finite edge/face cuts."""
    if not len(starts) or not len(triangles):
        return np.empty((0, 2), dtype=int), np.empty((0, 3))
    direction = ends - starts
    edge1 = triangles[:, 1] - triangles[:, 0]
    edge2 = triangles[:, 2] - triangles[:, 0]
    cross = np.cross(direction[:, None, :], edge2[None, :, :])
    determinant = np.einsum('tij,ij->ti', cross, edge1)
    # The determinant has units m^3; scale the parallel test with both areas.
    scale = np.linalg.norm(direction, axis=1)[:, None] * np.linalg.norm(np.cross(edge1, edge2), axis=1)[None, :]
    usable = np.abs(determinant) > np.maximum(scale * 1e-10, 1e-20)
    inverse = np.divide(1., determinant, out=np.zeros_like(determinant), where=usable)
    offset = starts[:, None, :] - triangles[None, :, 0, :]
    u = np.einsum('tij,tij->ti', offset, cross) * inverse
    secondCross = np.cross(offset, edge1[None, :, :])
    v = np.einsum('ti,tji->tj', direction, secondCross) * inverse
    distance = np.einsum('ij,tij->ti', edge2, secondCross) * inverse
    hit = usable & (u >= -1e-8) & (v >= -1e-8) & (u + v <= 1 + 1e-8) & (distance >= -1e-8) & (distance <= 1 + 1e-8)
    pairs = np.argwhere(hit)
    return pairs, starts[pairs[:, 0]] + direction[pairs[:, 0]] * distance[hit, None]


def CoplanarOverlap(first, second):
    """Closed 2-D triangle overlap, after checking a shared 3-D plane."""
    normal = np.cross(first[1] - first[0], first[2] - first[0])
    length = np.linalg.norm(normal)
    if length < 1e-16 or np.max(np.abs((second - first[0]) @ normal)) > geometryEpsilon * length:
        return False
    otherNormal = np.cross(second[1] - second[0], second[2] - second[0])
    if np.linalg.norm(np.cross(normal, otherNormal)) > 1e-8 * length * np.linalg.norm(otherNormal):
        return False
    drop = int(np.argmax(np.abs(normal)))
    first = np.delete(first, drop, axis=1)
    second = np.delete(second, drop, axis=1)
    # A separating axis from either convex polygon proves separation.
    for triangle in (first, second):
        for index in range(3):
            edge = triangle[(index + 1) % 3] - triangle[index]
            axis = np.array([-edge[1], edge[0]])
            projection1, projection2 = first @ axis, second @ axis
            if projection1.max() < projection2.min() - geometryEpsilon * np.linalg.norm(axis) or projection2.max() < projection1.min() - geometryEpsilon * np.linalg.norm(axis):
                return False
    return True


def TriangleIntersections(metal, wood):
    """Triangle intersection from all edges both ways, including coplanar cuts."""
    metalLow, metalHigh = metal.min(axis=1), metal.max(axis=1)
    woodLow, woodHigh = wood.min(axis=1), wood.max(axis=1)
    candidatePairs = np.argwhere(np.all((metalHigh[:, None, :] >= woodLow[None, :, :] - geometryEpsilon) &
                                        (woodHigh[None, :, :] >= metalLow[:, None, :] - geometryEpsilon), axis=2))
    intersections = []
    points = []
    # Restrict each triangle to AABB-overlapping counterparts, rather than
    # comparing every edge against the whole boat.
    for metalIndex in np.unique(candidatePairs[:, 0]) if len(candidatePairs) else []:
        woodIds = candidatePairs[candidatePairs[:, 0] == metalIndex, 1]
        first, candidates = metal[metalIndex], wood[woodIds]
        pair1, point1 = SegmentTriangleHits(first, first[[1, 2, 0]], candidates)
        pair2, point2 = SegmentTriangleHits(candidates.reshape(-1, 3), candidates[:, [1, 2, 0]].reshape(-1, 3), first[None])
        hitIds = set(pair1[:, 1].tolist()) | set((pair2[:, 0] // 3).tolist())
        for localIndex in range(len(candidates)):
            if localIndex not in hitIds and CoplanarOverlap(first, candidates[localIndex]):
                hitIds.add(localIndex)
        intersections.extend((int(metalIndex), int(woodIds[index])) for index in sorted(hitIds))
        if len(point1):
            points.extend(point1.tolist())
        if len(point2):
            points.extend(point2.tolist())
    return intersections, points


def InsideSolid(points, triangles):
    """Parity in three oblique directions; duplicate edge crossings collapse.

    Called only for closed connected components. Strict majority avoids a
    single ray through an exceptional vertex; disagreement is also reported.
    Chunking bounds memory use independently of the number of wood triangles.
    """
    directions = np.array([[1., .371390676, .217184397], [.18374513, 1., .41973821], [.32783911, .16180339, 1.]])
    directions /= np.linalg.norm(directions, axis=1)[:, None]
    votes = np.zeros((len(points), len(directions)), dtype=bool)
    edge1, edge2 = triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0]
    for directionIndex, direction in enumerate(directions):
        cross = np.cross(np.broadcast_to(direction, edge2.shape), edge2)
        determinant = np.einsum('ij,ij->i', edge1, cross)
        usable = np.abs(determinant) > np.maximum(np.linalg.norm(np.cross(edge1, edge2), axis=1) * 1e-11, 1e-20)
        inverse = np.divide(1., determinant, out=np.zeros_like(determinant), where=usable)
        for start in range(0, len(points), 64):
            batch = points[start:start + 64]
            offset = batch[:, None, :] - triangles[None, :, 0, :]
            u = np.einsum('kij,ij->ki', offset, cross) * inverse
            secondCross = np.cross(offset, edge1[None, :, :])
            v = np.einsum('kij,j->ki', secondCross, direction) * inverse
            distance = np.einsum('kij,ij->ki', secondCross, edge2) * inverse
            hit = usable[None, :] & (u >= -1e-9) & (v >= -1e-9) & (u + v <= 1 + 1e-9) & (distance > geometryEpsilon)
            for localIndex in range(len(batch)):
                crossings = np.sort(distance[localIndex, hit[localIndex]])
                uniqueCount = 0 if not len(crossings) else 1 + int(np.count_nonzero(np.diff(crossings) > geometryEpsilon))
                votes[start + localIndex, directionIndex] = uniqueCount % 2 == 1
    return votes.sum(axis=1) >= 2, int(np.count_nonzero(votes.any(axis=1) != votes.all(axis=1)))


def PenetrationVolume(metal, woodenParts):
    """Deterministic, volume-weighted tetrahedron quadrature (128 samples/tet)."""
    if not metal['closed'] or not woodenParts:
        return {'estimateM3': None, 'reason': 'Metal is not closed or there is no closed supporting wood solid'}
    center, triangles = metal['vertices'].mean(axis=0), metal['triangles']
    relative = triangles - center
    signed = np.einsum('ij,ij->i', relative[:, 0], np.cross(relative[:, 1], relative[:, 2])) / 6
    # A fan around an interior center is a partition only for a star-shaped
    # component. These nail caps are convex; certify their half-space property.
    crosses = TriangleCross(triangles)
    centerSides = np.einsum('ij,ij->i', crosses, center - triangles[:, 0])
    vertexSides = np.einsum('kij,ij->ki', metal['vertices'][:, None, :] - triangles[None, :, 0, :], crosses)
    signs = np.where(centerSides >= 0, 1., -1.)
    if np.any(vertexSides * signs[None, :] < -np.maximum(np.linalg.norm(crosses, axis=1) * 1e-8, 1e-18)[None, :]):
        return {'estimateM3': None, 'reason': 'Metal component is not certified convex; no invalid tetrahedral volume asserted'}
    # Radical-inverse sequences are deterministic and do not consume RNG state.
    def RadicalInverse(index, base):
        fraction, value = 1. / base, 0.
        while index:
            value += (index % base) * fraction
            index //= base
            fraction /= base
        return value
    samplesPerTetrahedron = 128
    uniform = np.array([[RadicalInverse(index, base) for base in (2, 3, 5)]
                        for index in range(1, samplesPerTetrahedron + 1)])
    ordered = np.sort(uniform, axis=1)
    weights = np.column_stack([ordered[:, 0], ordered[:, 1] - ordered[:, 0], ordered[:, 2] - ordered[:, 1], 1 - ordered[:, 2]])
    tetrahedra = np.concatenate([np.repeat(center[None, None, :], len(triangles), axis=0), triangles], axis=1)
    samples = np.einsum('sj,tjk->tsk', weights, tetrahedra).reshape(-1, 3)
    insideAny = np.zeros(len(samples), dtype=bool)
    disagreements = 0
    perPart = []
    absoluteVolumes = np.abs(signed)
    for wood in woodenParts:
        candidate = np.all((samples >= wood['boundsMin'] - geometryEpsilon) & (samples <= wood['boundsMax'] + geometryEpsilon), axis=1)
        inside = np.zeros(len(samples), dtype=bool)
        if candidate.any():
            inside[candidate], count = InsideSolid(samples[candidate], wood['triangles'])
            disagreements += count
        insideAny |= inside
        estimate = float(np.sum(absoluteVolumes * inside.reshape(-1, samplesPerTetrahedron).mean(axis=1)))
        perPart.append({'woodComponent': wood['id'], 'estimateM3': estimate})
    estimatedVolume = float(np.sum(absoluteVolumes * insideAny.reshape(-1, samplesPerTetrahedron).mean(axis=1)))
    return {'estimateM3': estimatedVolume, 'metalVolumeM3': float(absoluteVolumes.sum()),
            'fractionEstimate': estimatedVolume / float(absoluteVolumes.sum()) if absoluteVolumes.sum() else 0,
            'samples': len(samples), 'samplesPerTetrahedron': samplesPerTetrahedron,
            'method': 'Convex metal centroid tetrahedra; 128 deterministic uniform-volume radical-inverse barycentric samples per tetrahedron; union of closed wood parity solids. Estimate only, no certified volume error bound.',
            'rayVoteDisagreements': disagreements, 'perWoodComponent': perPart}


def AuditSupport(primitives, measureVolume=True):
    metal = np.concatenate([item['triangles'] for item in primitives if 'Iron' in item['materialName']])
    wood = np.concatenate([item['triangles'] for item in primitives if 'Iron' not in item['materialName']])
    metalParts, woodParts = Components(metal), Components(wood)
    woodLow = np.array([part['boundsMin'] for part in woodParts])
    woodHigh = np.array([part['boundsMax'] for part in woodParts])
    components = []
    for part in metalParts:
        candidates = np.flatnonzero(np.all((woodHigh >= part['boundsMin'] - geometryEpsilon) &
                                            (woodLow <= part['boundsMax'] + geometryEpsilon), axis=1))
        supporting = []
        for woodId in candidates:
            woodenPart = woodParts[int(woodId)]
            # AABB culling may reject triangles for intersection, but containment
            # always casts against the complete closed component.
            tris = woodenPart['triangles']
            triCandidate = np.all((tris.max(axis=1) >= part['boundsMin'] - geometryEpsilon) &
                                  (tris.min(axis=1) <= part['boundsMax'] + geometryEpsilon), axis=1)
            pairs, hitPoints = TriangleIntersections(part['triangles'], tris[triCandidate])
            inside, disagreement = np.zeros(len(part['vertices']), dtype=bool), 0
            if woodenPart['closed']:
                inside, disagreement = InsideSolid(part['vertices'], tris)
            woodVerticesInsideMetal = 0
            if not pairs and not inside.any() and part['closed']:
                woodCandidate = np.all((woodenPart['vertices'] >= part['boundsMin'] - geometryEpsilon) &
                                        (woodenPart['vertices'] <= part['boundsMax'] + geometryEpsilon), axis=1)
                if woodCandidate.any():
                    reverseInside, reverseDisagreement = InsideSolid(woodenPart['vertices'][woodCandidate], part['triangles'])
                    woodVerticesInsideMetal = int(reverseInside.sum())
                    disagreement += reverseDisagreement
            if pairs or inside.any() or woodVerticesInsideMetal:
                supporting.append({'woodComponent': int(woodId), 'woodClosed': woodenPart['closed'],
                                   'intersectingTrianglePairs': len(pairs),
                                   'metalVerticesInside': int(inside.sum()),
                                   'woodVerticesInsideMetal': woodVerticesInsideMetal,
                                   'rayVoteDisagreements': disagreement,
                                   'intersectionPoints': np.unique(np.round(hitPoints, 9), axis=0).tolist()[:8] if hitPoints else []})
        closedSupporting = [woodParts[item['woodComponent']] for item in supporting if item['woodClosed']]
        volume = PenetrationVolume(part, closedSupporting) if measureVolume else {'estimateM3': None, 'reason': 'Disabled by --skip-volume'}
        components.append({'id': part['id'], 'firstTriangle': int(part['faceIndices'][0]),
                           'center': part['center'].tolist(), 'boundsMin': part['boundsMin'].tolist(),
                           'boundsMax': part['boundsMax'].tolist(), 'triangles': len(part['triangles']),
                           'weldedVertices': part['weldedVertices'], 'metalClosed': part['closed'],
                           'supported': bool(supporting), 'supportingWoodComponents': len(supporting),
                           'supports': supporting, 'penetrationVolume': volume})
    return {'method': 'Coordinate-welded connected components (1e-6 m quantization); exact finite edge/triangle intersections in both directions plus coplanar convex overlap; 3-direction parity containment only in closed components, in either containment direction. No distance-based support classification.',
            'intersectionToleranceM': geometryEpsilon, 'metalComponents': len(metalParts),
            'woodComponents': len(woodParts), 'closedWoodComponents': sum(part['closed'] for part in woodParts),
            'unsupportedComponents': [item['id'] for item in components if not item['supported']],
            'woodTopology': [{'id': part['id'], 'triangles': len(part['triangles']), 'closed': part['closed'],
                              'boundaryEdges': part['boundaryEdges'], 'nonmanifoldEdges': part['nonmanifoldEdges'],
                              'volumeM3': part['volumeM3']} for part in woodParts],
            'components': components}


def ImageAudit(document, binary):
    images = []
    for index, image in enumerate(document.get('images', [])):
        if 'uri' in image or 'bufferView' not in image:
            raise ValueError('Texture image must be embedded')
        view = document['bufferViews'][image['bufferView']]
        offset = view.get('byteOffset', 0)
        encoded = binary[offset:offset + view['byteLength']]
        with Image.open(io.BytesIO(encoded)) as decoded:
            size, mode = list(decoded.size), decoded.mode
        images.append({'index': index, 'name': image.get('name'), 'size': size,
                       'mode': mode, 'mimeType': image.get('mimeType'), 'bytes': len(encoded),
                       'sha256': hashlib.sha256(encoded).hexdigest()})
    return images


def TextureSource(document, textureIndex):
    texture = document['textures'][textureIndex]
    return texture.get('source', texture.get('extensions', {}).get('EXT_texture_webp', {}).get('source'))


def CompareProvenance(primitives, baselinePrimitives, provenance, Check):
    """Verify record splitting/material regrouping against every original face.

    The manifest grants no blanket attribute exemption: listed end-grain
    triangles may use the dedicated material and new planar-UV tangents. Keel
    records require an explicit original-record list and are checked against
    the specified deformation Jacobian. All other provenance is exact.
    """
    baselineMap = {(item['mesh'], item['primitive']): item for item in baselinePrimitives}
    currentMap = {(item['mesh'], item['primitive']): item for item in primitives}
    expectedTriangles = Counter((item['mesh'], item['primitive'], triangleIndex)
                                for item in baselinePrimitives for triangleIndex in range(len(item['indices'])))
    manifestPrimitives = provenance.get('primitives', [])
    manifestMap = {(item.get('mesh'), item.get('primitive')): item for item in manifestPrimitives}
    manifestValid = (len(manifestPrimitives) == len(manifestMap) == len(currentMap)
                     and set(manifestMap) == set(currentMap))
    Check('provenancePrimitiveCoverage', manifestValid)
    policy = provenance.get('policy', {})
    endgrainList = policy.get('endgrainTriangles')
    validTriples = lambda entries: (isinstance(entries, list) and all(isinstance(entry, list) and len(entry) == 3
                                     and all(type(value) is int and value >= 0 for value in entry) for entry in entries))
    policyValid = validTriples(endgrainList)
    Check('explicitEndgrainTrianglePolicy', policyValid)
    if not manifestValid or not policyValid:
        return {'mode': 'provenance', 'attributeChanges': [], 'policy': policy}
    endgrain = set(map(tuple, endgrainList))
    endgrainValid = (len(endgrain) == len(endgrainList) and endgrain <= set(expectedTriangles)
                     and all(baselineMap[item[:2]]['material'] in (1, 2, 3) for item in endgrain))
    Check('endgrainPolicySourcesValid', endgrainValid, endgrainTriangles=len(endgrain))
    keel = policy.get('keel')
    keelRecordsList = policy.get('keelSourceRecords', [])
    keelValid = validTriples(keelRecordsList)
    keelRecords = set(map(tuple, keelRecordsList)) if keelValid else set()
    keelValid = keelValid and len(keelRecords) == len(keelRecordsList)
    keelValid = keelValid and all(item[:2] in baselineMap and item[2] < len(baselineMap[item[:2]]['points'])
                                  and baselineMap[item[:2]]['material'] in (1, 2, 3) for item in keelRecords)
    if keel is not None:
        stations = np.asarray(keel.get('stations', []), dtype=float)
        factors = np.asarray(keel.get('factors', []), dtype=float)
        keelValid = (keelValid and bool(keelRecords) and stations.ndim == factors.ndim == 1
                     and len(stations) == len(factors) and len(stations) >= 2
                     and np.isfinite(stations).all() and np.isfinite(factors).all()
                     and np.all(np.diff(stations) > 0) and np.all(factors > 0))
    else:
        keelValid = keelValid and not keelRecords
    Check('explicitKeelSourceRecordsAndDeformationPolicy', keelValid, sourceRecords=len(keelRecords),
          formula="x_new=x*f(z); segment=clip(searchsorted(stations,z,side='right')-1,0,n-2); slope=(factors[segment+1]-factors[segment])/(stations[segment+1]-stations[segment]); J00=f(z), J02=x*slope; n_new=normalize(inv(J).T*n); t_new=normalize(J*t-n_new*dot(n_new,J*t)); tangent w unchanged",
          attributeAbsoluteTolerance=2e-6, positionAbsoluteToleranceM=2e-6)
    if not keelValid:
        keelRecords = set()
    actualTriangles = Counter()
    changes = []
    for key, current in currentMap.items():
        entry = manifestMap[key]
        prefix = f'provenance_mesh{key[0]}_primitive{key[1]}_'
        records, triangles = entry.get('records'), entry.get('triangles')
        valid = (validTriples(records) and validTriples(triangles)
                 and len(records) == len(current['points']) and len(triangles) == len(current['indices']))
        if valid:
            valid = all(tuple(item[:2]) in baselineMap and item[2] < len(baselineMap[tuple(item[:2])]['points']) for item in records)
            valid = valid and all(tuple(item[:2]) in baselineMap and item[2] < len(baselineMap[tuple(item[:2])]['indices']) for item in triangles)
        Check(prefix + 'mappingShapeAndRanges', valid)
        if not valid:
            continue
        records = np.asarray(records, dtype=np.int64)
        triangles = np.asarray(triangles, dtype=np.int64)
        keelMask = np.array([tuple(item) in keelRecords for item in records])
        actualTriangles.update(map(tuple, triangles.tolist()))
        usedRecords = np.unique(current['indices'])
        Check(prefix + 'noUnusedRecords', len(usedRecords) == len(records), unusedRecords=len(records) - len(usedRecords))
        endgrainFaces = np.array([tuple(item) in endgrain for item in triangles])
        endgrainRecords = np.zeros(len(records), dtype=bool)
        otherRecords = np.zeros(len(records), dtype=bool)
        endgrainRecords[np.unique(current['indices'][endgrainFaces])] = True
        otherRecords[np.unique(current['indices'][~endgrainFaces])] = True
        cornersValid, materialValid = True, True
        expectedPoints = np.empty_like(current['triangles'])
        for sourceKey in sorted(set(map(tuple, triangles[:, :2].tolist()))):
            mask = np.all(triangles[:, :2] == sourceKey, axis=1)
            source = baselineMap[sourceKey]
            oldFaces = source['indices'][triangles[mask, 2]]
            mappedCorners = records[current['indices'][mask]]
            sourceMatches = np.all(mappedCorners[:, :, :2] == np.asarray(sourceKey)[None, None, :])
            oldRecordIds = mappedCorners[:, :, 2]
            cyclicMatch = np.zeros(len(oldFaces), dtype=bool)
            for shift in range(3):
                cyclicMatch |= np.all(oldRecordIds == np.roll(oldFaces, shift, axis=1), axis=1)
            cornersValid = cornersValid and sourceMatches and bool(cyclicMatch.all())
            expectedMaterial = np.where(endgrainFaces[mask], 3, 2 if source['material'] == 3 else source['material'])
            materialValid = materialValid and bool(np.all(expectedMaterial == current['material']))
            # Reorder original geometric corners to match permitted cyclic shifts.
            expectedPoints[mask] = source['triangles'][triangles[mask, 2]]
            targetFaces = np.flatnonzero(mask)
            for shift in range(3):
                matching = np.all(oldRecordIds == np.roll(oldFaces, shift, axis=1), axis=1)
                expectedPoints[targetFaces[matching]] = source['points'][np.roll(oldFaces[matching], shift, axis=1)]
        Check(prefix + 'originalCornersAndWinding', cornersValid)
        Check(prefix + 'authorizedMaterialAssignment', materialValid,
              material=current['material'], endgrainTriangles=int(endgrainFaces.sum()))
        mappedAttributes = {semantic: np.empty_like(values) for semantic, values in current['attributes'].items()}
        formatsValid, semanticsValid = True, True
        for sourceKey in sorted(set(map(tuple, records[:, :2].tolist()))):
            mask = np.all(records[:, :2] == sourceKey, axis=1)
            source = baselineMap[sourceKey]
            semanticsValid = semanticsValid and set(source['attributes']) == set(current['attributes'])
            for semantic in current['attributes']:
                if semantic not in source['attributes'] or source['attributes'][semantic].shape[1:] != current['attributes'][semantic].shape[1:]:
                    semanticsValid = False
                    continue
                formatsValid = formatsValid and source['attributeFormats'][semantic] == current['attributeFormats'][semantic]
                mappedAttributes[semantic][mask] = source['attributes'][semantic][records[mask, 2]]
        Check(prefix + 'attributeSemantics', semanticsValid)
        Check(prefix + 'attributeFormats', formatsValid)
        if not semanticsValid:
            continue
        attributeChanges = {}
        declared = entry.get('changedTangentRecords', [])
        declaredValid = (isinstance(declared, list) and all(type(index) is int and 0 <= index < len(records) for index in declared)
                         and len(declared) == len(set(declared)))
        Check(prefix + 'tangentDeclarationValid', declaredValid)
        allowed = np.zeros(len(records), dtype=bool)
        if declaredValid:
            allowed[declared] = True
        Check(prefix + 'tangentExemptionsOnlyEndgrainOrKeel', np.all(~allowed | ((endgrainRecords & ~otherRecords) | keelMask)))
        declaredNormals = entry.get('changedNormalRecords', [])
        declaredNormalsValid = (isinstance(declaredNormals, list) and all(type(index) is int and 0 <= index < len(records) for index in declaredNormals)
                                and len(declaredNormals) == len(set(declaredNormals)))
        Check(prefix + 'normalDeclarationValid', declaredNormalsValid)
        allowedNormals = np.zeros(len(records), dtype=bool)
        if declaredNormalsValid:
            allowedNormals[declaredNormals] = True
        Check(prefix + 'normalExemptionsOnlyKeel', np.all(~allowedNormals | keelMask))
        for semantic, values in current['attributes'].items():
            original = mappedAttributes[semantic]
            changed = np.any(values != original, axis=1)
            attributeChanges[semantic] = {'changedRecords': int(changed.sum()), 'exactlyPreserved': not bool(changed.any()),
                                          'maximumAbsoluteDelta': float(np.max(np.abs(values.astype(float) - original.astype(float))))}
            if semantic == 'COLOR_0':
                Check(prefix + semantic + 'ExactlyPreservedPerRecord', not changed.any())
            if semantic == 'NORMAL':
                Check(prefix + 'NORMALExactlyPreservedOutsideAuthorizedKeel', np.all(~changed | (allowedNormals & keelMask)),
                      changedRecords=int(changed.sum()), authorizedRecords=int(allowedNormals.sum()))
            if semantic == 'TANGENT':
                Check(prefix + 'TANGENTOnlyAuthorizedEndgrainOrKeelRecords', np.all(~changed | (allowed & ((endgrainRecords & ~otherRecords) | keelMask))),
                      changedRecords=int(changed.sum()), authorizedRecords=int(allowed.sum()))
                changedValues = values[changed].astype(float)
                if len(changedValues):
                    normals = current['attributes']['NORMAL'][changed].astype(float)
                    validFrames = (np.allclose(np.linalg.norm(changedValues[:, :3], axis=1), 1, atol=2e-4)
                                   and np.allclose(np.abs(changedValues[:, 3]), 1, atol=1e-6)
                                   and np.allclose(np.einsum('ij,ij->i', normals, changedValues[:, :3]), 0, atol=2e-4))
                    Check(prefix + 'newTangentFramesValid', validFrames)
        if keelMask.any():
            originalPosition = mappedAttributes['POSITION'][keelMask].astype(float)
            originalNormal = mappedAttributes['NORMAL'][keelMask].astype(float)
            originalTangent = mappedAttributes['TANGENT'][keelMask].astype(float)
            factor = np.interp(originalPosition[:, 2], stations, factors)
            segment = np.clip(np.searchsorted(stations, originalPosition[:, 2], side='right') - 1, 0, len(stations) - 2)
            gradient = (factors[segment + 1] - factors[segment]) / (stations[segment + 1] - stations[segment])
            shear = originalPosition[:, 0] * gradient
            expectedNormal = originalNormal.copy()
            expectedNormal[:, 0] /= factor
            expectedNormal[:, 2] -= shear * originalNormal[:, 0] / factor
            expectedNormal /= np.linalg.norm(expectedNormal, axis=1)[:, None]
            expectedTangent = originalTangent.copy()
            expectedTangent[:, 0] = factor * originalTangent[:, 0] + shear * originalTangent[:, 2]
            expectedTangent[:, :3] -= expectedNormal * np.einsum('ij,ij->i', expectedNormal, expectedTangent[:, :3])[:, None]
            expectedTangent[:, :3] /= np.linalg.norm(expectedTangent[:, :3], axis=1)[:, None]
            expectedPosition = originalPosition.copy()
            expectedPosition[:, 0] *= factor
            for semantic, expected in [('POSITION', expectedPosition), ('NORMAL', expectedNormal), ('TANGENT', expectedTangent)]:
                values = current['attributes'][semantic][keelMask].astype(float)
                delta = float(np.max(np.abs(values - expected)))
                Check(prefix + f'keel{semantic}MatchesDeformation', np.allclose(values, expected, atol=2e-6, rtol=0),
                      records=int(keelMask.sum()), maximumAbsoluteError=delta, absoluteTolerance=2e-6)
            Check(prefix + 'keelTangentHandednessExactlyPreserved', np.array_equal(current['attributes']['TANGENT'][keelMask, 3], mappedAttributes['TANGENT'][keelMask, 3]))
        cross, originalCross = TriangleCross(current['triangles']), TriangleCross(expectedPoints)
        nearZero, originalNearZero = np.linalg.norm(cross, axis=1) < 1e-12, np.linalg.norm(originalCross, axis=1) < 1e-12
        reversedFaces = int(np.count_nonzero((np.einsum('ij,ij->i', cross, originalCross) < 0) & ~nearZero & ~originalNearZero))
        newlyDegenerate = int(np.count_nonzero(nearZero & ~originalNearZero))
        Check(prefix + 'noReversedFaces', reversedFaces == 0, reversedFaces=reversedFaces)
        Check(prefix + 'noNewNearZeroAreaFaces', newlyDegenerate == 0, newNearZeroAreaFaces=newlyDegenerate,
              currentNearZeroAreaFaces=int(nearZero.sum()), baselineNearZeroAreaFaces=int(originalNearZero.sum()), doubledAreaThresholdM2=1e-12)
        changes.append({'mesh': key[0], 'primitive': key[1], 'material': current['materialName'],
                        'records': len(records), 'triangles': len(triangles), 'endgrainTriangles': int(endgrainFaces.sum()),
                        'attributes': attributeChanges, 'uvRecipe': entry.get('uvRecipe', policy.get('uvRecipes'))})
    missing, extra = expectedTriangles - actualTriangles, actualTriangles - expectedTriangles
    Check('everyOriginalTriangleExactlyOnce', not missing and not extra,
          originalTriangles=sum(expectedTriangles.values()), finalMappedTriangles=sum(actualTriangles.values()),
          missingTriangles=sum(missing.values()), duplicateOrUnknownTriangles=sum(extra.values()),
          firstMissing=list(missing)[:8], firstDuplicateOrUnknown=list(extra)[:8])
    return {'mode': 'provenance', 'attributeChanges': changes, 'policy': policy}


def CompareAsset(document, binary, primitives, baselineDocument, baselineBinary, baselinePrimitives, provenance=None):
    checks = []

    def Check(name, passed, **details):
        checks.append({'name': name, 'passed': bool(passed), **details})

    Check('triangleBudget', sum(len(item['indices']) for item in primitives) == 49944,
          triangles=sum(len(item['indices']) for item in primitives), expected=49944)
    Check('primitiveBudget', len(primitives) == 4, primitives=len(primitives), expected=4)
    Check('materialCount', len(document.get('materials', [])) == 4)
    Check('materialsExactlyPreserved', document.get('materials') == baselineDocument.get('materials'))
    Check('nodesExactlyPreserved', document.get('nodes') == baselineDocument.get('nodes'))
    Check('scenesExactlyPreserved', document.get('scenes') == baselineDocument.get('scenes') and document.get('scene', 0) == baselineDocument.get('scene', 0))
    images = ImageAudit(document, binary)
    Check('embeddedPbrImageCount', len(images) == 9, count=len(images))
    pbrRoles = []
    for materialIndex, material in enumerate(document['materials']):
        if 'Iron' in material.get('name', ''):
            continue
        pbr = material.get('pbrMetallicRoughness', {})
        for role, definition, expected in [('baseColor', pbr.get('baseColorTexture'), [1024, 1024]),
                                            ('normal', material.get('normalTexture'), [512, 512]),
                                            ('orm', pbr.get('metallicRoughnessTexture'), [512, 512])]:
            source = TextureSource(document, definition['index']) if definition else None
            passed = source is not None and images[source]['size'] == expected
            Check(f'material{materialIndex}_{role}Size', passed, image=source, expected=expected)
            pbrRoles.append({'material': materialIndex, 'role': role, 'image': source})
        Check(f'material{materialIndex}_aoUsesOrm', material.get('occlusionTexture', {}).get('index') == pbr.get('metallicRoughnessTexture', {}).get('index'))
    points = np.concatenate([item['points'] for item in primitives])
    baselinePoints = np.concatenate([item['points'] for item in baselinePrimitives])
    low, high = points.min(axis=0), points.max(axis=0)
    baselineLow, baselineHigh = baselinePoints.min(axis=0), baselinePoints.max(axis=0)
    Check('dimensionsPreserved', np.allclose(high - low, baselineHigh - baselineLow, atol=2e-6, rtol=0),
          dimensionsMeters=(high - low).tolist(), baselineDimensionsMeters=(baselineHigh - baselineLow).tolist())
    Check('authoredDimensions', np.allclose(high - low, [1.5283, 1.1006, 4.6], atol=8e-5, rtol=0))
    changes = []
    provenanceResult = None
    if provenance is not None:
        provenanceResult = CompareProvenance(primitives, baselinePrimitives, provenance, Check)
        changes = provenanceResult['attributeChanges']
        baselineImages = ImageAudit(baselineDocument, baselineBinary)
        for materialIndex in (1, 2):
            material, originalMaterial = document['materials'][materialIndex], baselineDocument['materials'][materialIndex]
            for role, definition, originalDefinition in [
                ('baseColor', material['pbrMetallicRoughness']['baseColorTexture'], originalMaterial['pbrMetallicRoughness']['baseColorTexture']),
                ('normal', material['normalTexture'], originalMaterial['normalTexture']),
                ('orm', material['pbrMetallicRoughness']['metallicRoughnessTexture'], originalMaterial['pbrMetallicRoughness']['metallicRoughnessTexture'])]:
                source, originalSource = TextureSource(document, definition['index']), TextureSource(baselineDocument, originalDefinition['index'])
                Check(f'material{materialIndex}_{role}OriginalImageExactlyPreserved', images[source]['sha256'] == baselineImages[originalSource]['sha256'], image=source)
        Check('textureTexelBudgetPreserved', sum(np.prod(item['size']) for item in images) == sum(np.prod(item['size']) for item in baselineImages))
        replacementSources = sorted({item['image'] for item in pbrRoles if item['material'] == 3})
        replacementBytes = sum(images[index]['bytes'] for index in replacementSources)
        policy = provenance.get('policy', {})
        if 'maxReplacementImageBytes' in policy:
            Check('replacementImageCompressedByteBudget', type(policy['maxReplacementImageBytes']) is int and replacementBytes <= policy['maxReplacementImageBytes'],
                  bytes=replacementBytes, limit=policy['maxReplacementImageBytes'])
        provenanceResult['replacementImages'] = replacementSources
        provenanceResult['replacementImageBytes'] = replacementBytes
    Check('primitiveCorrespondence', len(primitives) == len(baselinePrimitives))
    for index, (current, baseline) in enumerate(zip(primitives, baselinePrimitives)) if provenance is None else []:
        prefix = f'primitive{index}_'
        Check(prefix + 'materialPreserved', current['material'] == baseline['material'])
        Check(prefix + 'indicesExactlyPreserved', np.array_equal(current['indices'], baseline['indices']))
        Check(prefix + 'attributesPreserved', set(current['attributes']) == set(baseline['attributes']))
        attributeChanges = {}
        for semantic in sorted(set(current['attributes']) & set(baseline['attributes'])):
            currentArray, baselineArray = current['attributes'][semantic], baseline['attributes'][semantic]
            sameShape = currentArray.shape == baselineArray.shape
            equal = sameShape and np.array_equal(currentArray, baselineArray)
            changed = int(np.count_nonzero(np.any(currentArray != baselineArray, axis=1))) if sameShape else None
            attributeChanges[semantic] = {'exactlyPreserved': bool(equal), 'changedVertices': changed,
                                          'maximumAbsoluteDelta': float(np.max(np.abs(currentArray.astype(float) - baselineArray.astype(float)))) if sameShape else None}
            if semantic in ('NORMAL', 'TANGENT', 'COLOR_0'):
                Check(prefix + semantic + 'ExactlyPreserved', equal)
        if current['triangles'].shape == baseline['triangles'].shape:
            cross, baselineCross = TriangleCross(current['triangles']), TriangleCross(baseline['triangles'])
            nearZero = np.linalg.norm(cross, axis=1) < 1e-12
            baselineNearZero = np.linalg.norm(baselineCross, axis=1) < 1e-12
            reversedFaces = int(np.count_nonzero((np.einsum('ij,ij->i', cross, baselineCross) < 0) & ~nearZero & ~baselineNearZero))
            newlyDegenerate = int(np.count_nonzero(nearZero & ~baselineNearZero))
            Check(prefix + 'noReversedFaces', reversedFaces == 0, reversedFaces=reversedFaces)
            Check(prefix + 'noNewNearZeroAreaFaces', newlyDegenerate == 0, newNearZeroAreaFaces=newlyDegenerate,
                  currentNearZeroAreaFaces=int(nearZero.sum()), baselineNearZeroAreaFaces=int(baselineNearZero.sum()), doubledAreaThresholdM2=1e-12)
        changes.append({'primitive': index, 'material': current['materialName'], 'attributes': attributeChanges})
    return {'checks': checks, 'attributeChanges': changes, 'embeddedImages': images, 'pbrRoles': pbrRoles,
            'provenance': provenanceResult,
            'boundsMin': low.tolist(), 'boundsMax': high.tolist(), 'dimensionsMeters': (high - low).tolist(),
            'baselineBoundsMin': baselineLow.tolist(), 'baselineBoundsMax': baselineHigh.tolist()}


def Main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', default=str(Path(__file__).resolve().with_name('Model_SkiffB27.glb')))
    parser.add_argument('--baseline', required=True, help='Read-only original B27/Model_B27.glb')
    parser.add_argument('--report', required=True, help='Local JSON report destination')
    parser.add_argument('--provenance', help='Explicit record/triangle origins and endgrain-only material/tangent authorization')
    parser.add_argument('--skip-volume', action='store_true', help='Skip volume estimates; support tests still run in full')
    args = parser.parse_args()
    modelPath, baselinePath, reportPath = Path(args.model), Path(args.baseline), Path(args.report)
    document, binary = ReadGlb(modelPath)
    baselineDocument, baselineBinary = ReadGlb(baselinePath)
    primitives = DecodeGeometry(document, binary)
    baselinePrimitives = DecodeGeometry(baselineDocument, baselineBinary)
    provenance = json.loads(Path(args.provenance).read_text(encoding='utf-8-sig')) if args.provenance else None
    report = {'asset': str(modelPath.resolve()), 'baseline': str(baselinePath.resolve()),
              'sha256': hashlib.sha256(modelPath.read_bytes()).hexdigest(),
              'baselineSha256': hashlib.sha256(baselinePath.read_bytes()).hexdigest(),
              'independentDecoder': True, 'contracts': CompareAsset(document, binary, primitives, baselineDocument, baselineBinary, baselinePrimitives, provenance)}
    if provenance is not None and 'maxGlbBytes' in provenance.get('policy', {}):
        limit = provenance['policy']['maxGlbBytes']
        report['contracts']['checks'].append({'name': 'glbCompressedByteBudget', 'passed': type(limit) is int and modelPath.stat().st_size <= limit,
                                               'bytes': modelPath.stat().st_size, 'limit': limit})
    report['support'] = AuditSupport(primitives, not args.skip_volume)
    checks = report['contracts']['checks']
    checks.append({'name': 'all201MetalComponentsSupported', 'passed': report['support']['metalComponents'] == 201 and not report['support']['unsupportedComponents'],
                   'metalComponents': report['support']['metalComponents'], 'unsupportedComponents': report['support']['unsupportedComponents']})
    report['result'] = 'PASS' if all(item['passed'] for item in checks) else 'FAIL'
    reportPath.parent.mkdir(parents=True, exist_ok=True)
    reportPath.write_text(json.dumps(report, indent=2, allow_nan=False), encoding='utf-8')
    print(json.dumps({'result': report['result'], 'report': str(reportPath.resolve()),
                      'failedChecks': [item for item in checks if not item['passed']],
                      'metalComponents': report['support']['metalComponents'], 'woodComponents': report['support']['woodComponents'],
                      'unsupportedComponents': report['support']['unsupportedComponents']}, indent=2))
    return 0 if report['result'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(Main())
