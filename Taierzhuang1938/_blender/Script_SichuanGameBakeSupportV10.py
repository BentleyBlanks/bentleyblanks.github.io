"""Author real, temporary base surfaces beneath the retained high detail.

These are bake sources, never game meshes or painted image repairs.  Every
support triangle uses an original source material, and each UV corner is
sampled barycentrically from an actual evaluated high triangle.  Original
source data, shaders, images and coordinate anchors remain untouched.
"""
import array
import collections
import math

import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


generator = 'SichuanGameBakeSupportV10'


def Part(low, root):
    owner = low
    while owner.parent is not None and owner.parent != root:
        owner = owner.parent
    if owner.parent != root or not owner.name.startswith('Pack_'):
        raise RuntimeError('Support target has no canonical game part: ' + low.name)
    return owner.name


def Snapshot(source, depsgraph):
    evaluated = source.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=depsgraph)
    try:
        mesh.calc_loop_triangles()
        if not mesh.loop_triangles:
            raise RuntimeError('Empty original high source: ' + source.name)
        layers = {}
        for layer in mesh.uv_layers:
            values = array.array('f', [0]) * (len(layer.data) * 2)
            layer.data.foreach_get('uv', values)
            layers[layer.name] = values
        active = next((layer.name for layer in mesh.uv_layers if layer.active_render),
                      mesh.uv_layers.active.name if mesh.uv_layers.active else None)
        if active is None:
            raise RuntimeError('Original high source lacks UV coordinates: ' + source.name)
        world = evaluated.matrix_world.copy()
        points = [world @ vertex.co for vertex in mesh.vertices]
        triangles = [tuple(triangle.vertices) for triangle in mesh.loop_triangles]
        loops = [tuple(triangle.loops) for triangle in mesh.loop_triangles]
        # Depsgraph material IDs are transient. Only original IDs can be
        # assigned to a retained source mesh and survive graph rebuild/save.
        materials = [material.original if material is not None else None
                     for material in mesh.materials]
        materialIndices = [mesh.polygons[triangle.polygon_index].material_index
                           for triangle in mesh.loop_triangles]
        if not materials or any(index >= len(materials) or materials[index] is None
                                for index in materialIndices):
            raise RuntimeError('Original high source has an unassigned material: ' + source.name)
        return {'name': source.name, 'points': points, 'triangles': triangles,
                'loops': loops, 'uv': layers, 'activeUV': active,
                'materials': materials, 'materialIndices': materialIndices,
                'tree': BVHTree.FromPolygons(points, triangles, all_triangles=True)}
    finally:
        evaluated.to_mesh_clear()


def Nearest(point, normal, caches, depth):
    """Prefer the nearest nearby original surface in the target hemisphere."""
    records = []
    for cache in caches:
        position, faceNormal, triangle, distance = cache['tree'].find_nearest(point)
        if position is not None:
            records.append((float(distance), cache, position, faceNormal, triangle))
    if not records:
        raise RuntimeError('Could not locate an actual high source surface')
    closest = min(records, key=lambda record: record[0])
    if closest[3].dot(normal) > .05:
        return closest, True
    matching = [record for record in records if record[3].dot(normal) > .05]
    best = min(matching, key=lambda record: record[0]) if matching else None
    # Thin solidified cloth often has its opposite-facing side a fraction of
    # a millimetre closer.  Search the actual local triangles, rather than
    # copying that back side's atlas coordinates or inventing a UV projection.
    maximum = max(.03, depth * 4)
    radius = min(maximum, (best[0] + 1e-6) if best else max(.001, closest[0] + .001))
    while True:
        found = []
        for cache in caches:
            for position, faceNormal, triangle, distance in cache['tree'].find_nearest_range(point, radius):
                if faceNormal.dot(normal) > .05:
                    found.append((float(distance), cache, position, faceNormal, triangle))
        if found:
            best = min(found + ([best] if best else []), key=lambda record: record[0])
            return best, True
        if best is not None:
            return best, True
        if radius >= maximum:
            return closest, False
        radius = min(maximum, radius * 2)


def SampleUv(record, layerName):
    distance, cache, position, normal, index = record
    indices = cache['triangles'][index]
    a, b, c = (cache['points'][vertex] for vertex in indices)
    ab, ac, ap = b - a, c - a, position - a
    aa, bb, cc = ab.dot(ab), ab.dot(ac), ac.dot(ac)
    denominator = aa * cc - bb * bb
    if abs(denominator) < 1e-24:
        raise RuntimeError('Degenerate actual high UV sampling triangle: ' + cache['name'])
    second = (cc * ap.dot(ab) - bb * ap.dot(ac)) / denominator
    third = (aa * ap.dot(ac) - bb * ap.dot(ab)) / denominator
    weights = [max(0.0, min(1.0, value)) for value in (1 - second - third, second, third)]
    total = sum(weights)
    weights = [value / total for value in weights]
    data = cache['uv'].get(layerName, cache['uv'][cache['activeUV']])
    return tuple(sum(weight * data[loop * 2 + axis]
                     for weight, loop in zip(weights, cache['loops'][index]))
                 for axis in (0, 1))


def MaterialAt(record):
    cache, index = record[1], record[4]
    return cache['materials'][cache['materialIndices'][index]]


def AddGameBakeSupports(root, sourceResolver, depthM=.002):
    """Create support high meshes and return a JSON-safe provenance report.

    ``sourceResolver(low)`` must return the real, unexploded high sources for
    that low object.  Previously generated supports are excluded on reruns.
    Call before preparing direction-separated projection proxies.
    """
    if root is None or root.name != 'Pack_Root' or not callable(sourceResolver):
        raise RuntimeError('Pass the actual Pack_Root and its high-source resolver')
    if not math.isfinite(depthM) or not 0 < depthM <= .01:
        raise RuntimeError('Support depth must be a positive physical distance <= 10 mm')
    lowMeshes = [obj for obj in root.children_recursive
                 if obj.type == 'MESH' and not obj.name.startswith('High_')]
    groups = collections.defaultdict(list)
    resolved = {}
    for low in lowMeshes:
        sources = list(dict.fromkeys(source for source in sourceResolver(low)
                                     if source.type == 'MESH'
                                     and not source.get('SupportForLow')
                                     and source.get('GameBakeSupportGenerator') != generator))
        if not sources or any(source in lowMeshes for source in sources):
            raise RuntimeError('Support requires original high meshes: ' + low.name)
        resolved[low] = sources
        groups[Part(low, root)].append(low)
    names = {low.name for low in lowMeshes}
    for obj in list(bpy.data.objects):
        if obj.get('GameBakeSupportGenerator') == generator and obj.get('SupportForLow') in names:
            mesh = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if mesh.users == 0:
                bpy.data.meshes.remove(mesh)
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    reports = []
    # Release full evaluated/BVH snapshots between parts, rather than holding
    # the whole detailed pack plus all UV arrays in memory simultaneously.
    for part, targets in groups.items():
        highParent = bpy.data.objects.get('High_' + part)
        if highParent is None:
            raise RuntimeError('Missing original high part: High_' + part)
        unique = list(dict.fromkeys(source for low in targets for source in resolved[low]))
        snapshots = {source: Snapshot(source, depsgraph) for source in unique}
        for low in targets:
            caches = [snapshots[source] for source in resolved[low]]
            layerNames = sorted({'sourceUV'} | {name for cache in caches for name in cache['uv']})
            low.data.calc_loop_triangles()
            positions, faces, corners, materialIndices = [], [], [], []
            materials, materialMap = [], {}
            distances, unmatched, mixedMaterials = [], 0, 0
            samplesBySource, facesByMaterial = collections.Counter(), collections.Counter()
            for triangle in low.data.loop_triangles:
                world = [low.matrix_world @ low.data.vertices[index].co for index in triangle.vertices]
                normal = (world[1] - world[0]).cross(world[2] - world[0])
                if normal.length < 1e-14:
                    raise RuntimeError('Degenerate game support target: ' + low.name)
                normal.normalize()
                center = sum(world, Vector()) / 3
                centerRecord, matched = Nearest(center, normal, caches, depthM)
                material = MaterialAt(centerRecord)
                if material not in materialMap:
                    materialMap[material] = len(materials)
                    materials.append(material)
                materialIndices.append(materialMap[material])
                facesByMaterial[material.name] += 1
                start = len(positions)
                positions.extend(tuple(point - normal * depthM) for point in world)
                faces.append((start, start + 1, start + 2))
                for point in world:
                    record, matched = Nearest(point, normal, caches, depthM)
                    distances.append(record[0])
                    unmatched += not matched
                    mixedMaterials += MaterialAt(record) != material
                    samplesBySource[record[1]['name']] += 1
                    corners.append({name: SampleUv(record, record[1]['activeUV'] if name == 'sourceUV' else name)
                                    for name in layerNames})
            name = 'High_GameBakeSupport_' + low.name
            mesh = bpy.data.meshes.new(name + 'Geometry')
            mesh.from_pydata(positions, [], faces)
            mesh.update()
            for material in materials:
                mesh.materials.append(material)
            for polygon, materialIndex in zip(mesh.polygons, materialIndices):
                polygon.material_index = materialIndex
                polygon.use_smooth = False
            for layerName in layerNames:
                layer = mesh.uv_layers.new(name=layerName)
                for loop in mesh.loops:
                    layer.data[loop.index].uv = corners[loop.vertex_index][layerName]
            mesh.uv_layers.active = mesh.uv_layers['sourceUV']
            mesh.uv_layers['sourceUV'].active_render = True
            support = bpy.data.objects.new(name, mesh)
            bpy.context.scene.collection.objects.link(support)
            support.parent = highParent
            support.matrix_world = Matrix.Identity(4)
            support['GameBakeSupportGenerator'] = generator
            support['SupportForLow'] = low.name
            support['OriginalSourceNames'] = ','.join(source.name for source in resolved[low])
            support['SupportMethod'] = 'Physical underlay; actual high BVH nearest triangles and barycentric UV'
            support['SupportDepthM'] = depthM
            support['originalSourceNames'] = support['OriginalSourceNames']
            support['method'] = support['SupportMethod']
            support['depthM'] = depthM
            support['BakeOnly'] = True
            support.hide_render = True
            support.hide_set(True)
            low['SupportHighObject'] = support.name
            reports.append({'target': low.name, 'support': support.name, 'part': part,
                            'triangles': len(faces), 'unsharedVertices': len(positions),
                            'depthM': depthM, 'originalSources': [source.name for source in resolved[low]],
                            'materials': dict(facesByMaterial), 'uvSampleSources': dict(samplesBySource),
                            'uvLayers': layerNames, 'activeSourceUv': 'sourceUV',
                            'nearestHighDistanceMaxM': max(distances, default=0),
                            'nearestHighDistanceMeanM': sum(distances) / max(len(distances), 1),
                            'normalMatchFallbackCorners': unmatched,
                            'cornerMaterialDiffersFromFaceCentroid': mixedMaterials})
        del snapshots
    return {'generator': generator, 'depthM': depthM, 'supports': reports,
            'supportTriangles': sum(report['triangles'] for report in reports),
            'originalSourcesModified': False, 'originalMaterialsModified': False,
            'originalCoordinateAnchorsMoved': False, 'imagesReadOrModified': False,
            'method': 'Physical base surfaces below high detail; no pixel replacement'}
