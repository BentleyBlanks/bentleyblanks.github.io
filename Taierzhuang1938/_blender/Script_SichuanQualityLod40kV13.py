"""Reduce an imported complete Quality runtime copy to <=40k triangles.

BuildQualityLod40k operates on the already baked runtime hierarchy, retaining
its five parts, mesh objects, materials and UV layers. It never opens/saves
files, rebakes textures, creates proxy strips, or changes object transforms.
Original imported mesh datablocks are retained for reruns and correspondence.
The final tangent normal transfer is deliberately owned by the orchestrator.
Explicit separate micro-wear objects may retain a spatial subset of their
actual native fibre components; principal weaving/cords never use that policy.
"""
import array
import copy
import hashlib
import math
from pathlib import Path
import runpy

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


generator = 'SichuanQualityLod40kV13'
partNames = ('Pack_Bundle', 'Pack_Binding', 'Pack_Jacket', 'Pack_StrawMat', 'Pack_Sandals')
defaultBudgets = {'Pack_Bundle': 9500, 'Pack_Binding': 5000, 'Pack_Jacket': 3000,
                  'Pack_StrawMat': 18000, 'Pack_Sandals': 4500}


def Name(obj):
    return obj.get('QualityOriginalName', obj.get('SourceOriginalName',
                   obj.get('QualityExportOriginalName', obj.name.split('.')[0])))


def TagQualityRoles(root):
    """Tag an imported high or low copy before canonical names are restored."""
    if root is None or Name(root) != 'Pack_Root':
        raise RuntimeError('The imported quality root has lost its original identity')
    root['QualityOriginalName'] = 'Pack_Root'
    parts = {}
    for role in partNames:
        found = [child for child in root.children if Name(child) == role]
        if len(found) != 1:
            raise RuntimeError('Exactly one direct independent part is required: ' + role)
        parts[role] = found[0]
        for obj in (found[0], *found[0].children_recursive):
            original = Name(obj)
            obj['QualityOriginalName'] = original
            obj['QualityPartRole'] = role
    return parts


def Triangles(mesh):
    return sum(len(face.vertices)-2 for face in mesh.polygons)


def UvHashes(mesh):
    result = {}
    for layer in mesh.uv_layers:
        values = array.array('f', [0.0])*(len(layer.data)*2)
        layer.data.foreach_get('uv', values)
        result[layer.name] = hashlib.sha256(values.tobytes()).hexdigest()
    return result


def MeshHash(mesh):
    digest = hashlib.sha256()
    values = array.array('f', [0.0])*(len(mesh.vertices)*3)
    mesh.vertices.foreach_get('co', values)
    digest.update(values.tobytes())
    for face in mesh.polygons:
        digest.update(array.array('i', [len(face.vertices), *face.vertices]).tobytes())
    for name, value in UvHashes(mesh).items():
        digest.update(name.encode('utf-8'))
        digest.update(value.encode('ascii'))
    return digest.hexdigest()


def EffectiveBudgets(requested, limit, reserve):
    available = min(sum(requested.values()), limit)-reserve
    if available <= 0:
        raise ValueError('The reserved triangle margin consumes the entire limit')
    scale = available/sum(requested.values())
    exact = {name: requested[name]*scale for name in partNames}
    result = {name: int(exact[name]) for name in partNames}
    for name in sorted(partNames, key=lambda name: (-(exact[name]-result[name]), partNames.index(name)))[:available-sum(result.values())]:
        result[name] += 1
    return result


def ObjectPolicy(obj, sourceTriangles, keepCaps):
    name = Name(obj)
    if keepCaps and name == 'Pack_QualityMatEndCapsV12':
        return sourceTriangles, 0.0, True
    if 'ClothKnotButton' in name:
        minimum, importance = 192, 1.8
    elif 'HandStitch' in name or 'RepairThread' in name:
        minimum, importance = 128, 1.1
    elif 'RepairPatch' in name:
        minimum, importance = 192, 1.35
    elif 'WearV9_' in name or 'Fray' in name:
        minimum, importance = 32, .22
    elif 'InterlacedMatGrass' in name:
        minimum, importance = 2048, 1.8
    elif 'TrueRolledGrassSheet' in name:
        minimum, importance = 384, .3
    elif 'MatCottonRetainers' in name:
        minimum, importance = 256, .85
    elif 'BraidedWeave' in name:
        minimum, importance = 768, 1.6
    elif 'Foundation' in name:
        minimum, importance = 192, .65
    elif 'ThinSandalHangingTwine' in name:
        minimum, importance = 128, 1.1
    elif 'JacketTuckLip' in name:
        minimum, importance = 128, .85
    else:
        minimum, importance = 128, 1.0
    return min(sourceTriangles, minimum), sourceTriangles**.8*importance, False


def Allocate(rows, budget):
    result = {row['object']: row['minimum'] for row in rows}
    remaining = budget-sum(result.values())
    if remaining < 0:
        raise RuntimeError('Part budget cannot preserve its required complete objects/caps')
    while remaining:
        eligible = [row for row in rows if not row['protected'] and result[row['object']] < row['sourceTriangles']]
        if not eligible:
            break
        weight = sum(row['weight'] for row in eligible)
        shares = []
        spent = 0
        for row in eligible:
            exact = remaining*row['weight']/weight
            count = min(row['sourceTriangles']-result[row['object']], int(exact))
            result[row['object']] += count
            spent += count
            shares.append((exact-int(exact), row['object']))
        remaining -= spent
        if remaining and spent == 0:
            for _, name in sorted(shares, key=lambda item: (-item[0], item[1])):
                if remaining == 0:
                    break
                result[name] += 1
                remaining -= 1
    return result


def IsMicroFibre(obj):
    # Only the separately authored wear objects can lose whole fibre
    # instances. Native mat weaving, rims, laces and hanging cords never
    # enter this selection policy.
    name = Name(obj)
    return name.startswith('WearV9_') and any(word in name for word in (
        'BrokenTapeSelvedge', 'TurnedCottonEdge', 'SparseBlanketEdgeFray',
        'AbradedSandalGrass', 'RetainerCottonFray'))


def MicroComponents(mesh, matrix):
    """Real fibre components; coincident UV-seam copies join logically only."""
    parent = list(range(len(mesh.vertices)))
    def Find(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index
    coincident = {}
    for vertex in mesh.vertices:
        key = tuple(vertex.co)
        other = coincident.setdefault(key, vertex.index)
        if other != vertex.index:
            parent[Find(vertex.index)] = Find(other)
    for face in mesh.polygons:
        anchor = Find(face.vertices[0])
        for index in face.vertices[1:]:
            other = Find(index)
            if other != anchor:
                parent[other] = anchor
    groups = {}
    for face in mesh.polygons:
        key = Find(face.vertices[0])
        group = groups.setdefault(key, {'faces': [], 'vertices': set(), 'triangles': 0,
                                        'areaM2': 0.0, 'weightedCenter': Vector()})
        group['faces'].append(face.index)
        group['vertices'].update(face.vertices)
        group['triangles'] += len(face.vertices)-2
        points = [matrix @ mesh.vertices[index].co for index in face.vertices]
        for index in range(1, len(points)-1):
            area = .5*(points[index]-points[0]).cross(points[index+1]-points[0]).length
            group['areaM2'] += area
            group['weightedCenter'] += (points[0]+points[index]+points[index+1])*(area/3)
    result = sorted(groups.values(), key=lambda group: group['faces'][0])
    for index, group in enumerate(result):
        if group['areaM2'] <= 0:
            raise RuntimeError('An original micro-fibre component has no actual surface area')
        group['component'] = index
        group['center'] = group['weightedCenter']/group['areaM2']
        points = [matrix @ mesh.vertices[vertex].co for vertex in group['vertices']]
        group['bounds'] = [[min(point[axis] for point in points), max(point[axis] for point in points)] for axis in range(3)]
    return result


def SelectMicroComponents(components, count):
    """Largest real fibre first, then area-weighted farthest-point coverage."""
    ordered = sorted(range(len(components)), key=lambda index: (-components[index]['areaM2'], index))
    selected = [ordered[0]]
    maximumArea = components[selected[0]]['areaM2']
    remaining = set(ordered[1:])
    while remaining and len(selected) < count:
        def Score(index):
            distance = min((components[index]['center']-components[other]['center']).length_squared for other in selected)
            return (distance*math.sqrt(components[index]['areaM2']/maximumArea),
                    components[index]['areaM2'], -index)
        index = max(remaining, key=Score)
        selected.append(index)
        remaining.remove(index)
    return sorted(selected)


def BoundsFromComponents(components):
    return [[min(group['bounds'][axis][0] for group in components),
             max(group['bounds'][axis][1] for group in components)] for axis in range(3)]


def KeepNativeMicroSubset(obj, source, components, selected):
    keepFaces = {index for chosen in selected for index in components[chosen]['faces']}
    previous = obj.data
    replacement = source.copy()
    replacement.name = 'Geometry_Lod40kV13_MicroSubset_' + Name(obj)
    replacement.use_fake_user = False
    replacement['Lod40kGenerator'] = generator
    bm = bmesh.new()
    try:
        bm.from_mesh(replacement)
        bm.faces.ensure_lookup_table()
        bm.faces.index_update()
        remove = [face for face in bm.faces if face.index not in keepFaces]
        if remove:
            bmesh.ops.delete(bm, geom=remove, context='FACES_ONLY')
        loose = [vertex for vertex in bm.verts if not vertex.link_faces]
        if loose:
            bmesh.ops.delete(bm, geom=loose, context='VERTS')
        bm.to_mesh(replacement)
    finally:
        bm.free()
    replacement.update()
    obj.data = replacement
    if previous != source and previous.get('Lod40kGenerator') == generator and previous.users == 0:
        bpy.data.meshes.remove(previous)
    if not replacement.polygons:
        raise RuntimeError('A micro-fibre subset must preserve a real nonempty mesh object')


class QemBudgetError(RuntimeError):
    def __init__(self, name, trials):
        super().__init__('Decimate reached a topology floor above its budget: ' + name)
        self.trials = trials


def ReduceMicroFibres(obj, source, target):
    if not IsMicroFibre(obj):
        raise RuntimeError('Whole-component selection is restricted to explicit micro-wear objects')
    components = MicroComponents(source, obj.matrix_world)
    if not components:
        raise RuntimeError('The original micro-wear object has no real fibre components')
    originalBounds = BoundsFromComponents(components)
    originalArea = sum(group['areaM2'] for group in components)
    # A short closed original fibre generally needs fewer than 24 triangles.
    # This conservative first subset avoids asking QEM to destroy dozens of
    # disconnected instances merely to reach a tiny global object ratio.
    keepCount = len(components) if Triangles(source) <= target else min(len(components), max(1, target//24))
    attempts = []
    for attempt in range(5):
        selected = SelectMicroComponents(components, keepCount)
        KeepNativeMicroSubset(obj, source, components, selected)
        nativeSubset = obj.data.copy()
        try:
            try:
                reduction = ReduceObject(obj, target, maxTrials=4)
            except QemBudgetError as failure:
                attempts.append({'keptComponents': keepCount, 'qemTrials': failure.trials, 'accepted': False})
                if keepCount == 1:
                    raise
                floor = max(1, failure.trials[-1]['actualTriangles'])
                keepCount = max(1, min(keepCount-1, int(keepCount*target/floor*.8)))
                continue
            retained = [components[index] for index in selected]
            bounds = BoundsFromComponents(retained)
            retainedArea = sum(group['areaM2'] for group in retained)
            actual = MicroComponents(obj.data, obj.matrix_world)
            finalBounds = BoundsFromComponents(actual)
            retainedDistance = DistanceAudit(nativeSubset, obj.data, obj.matrix_world, 128)
            attempts.append({'keptComponents': keepCount, 'qemTrials': reduction['trials'], 'accepted': True})
            reduction['nativeMicroSubset'] = {
                'policy': 'Largest-area native fibre then area-weighted farthest-point distribution; no new geometry',
                'originalComponents': len(components), 'retainedComponents': len(selected),
                'discardedComponents': len(components)-len(selected),
                'retainedSourceComponentIds': selected,
                'originalAreaM2': originalArea, 'retainedNativeAreaM2': retainedArea,
                'discardedNativeAreaM2': originalArea-retainedArea,
                'retainedNativeAreaFraction': retainedArea/originalArea,
                'finalReducedAreaM2': sum(group['areaM2'] for group in actual),
                'originalWorldBoundsM': originalBounds, 'retainedNativeWorldBoundsM': bounds,
                'finalWorldBoundsM': finalBounds,
                'maximumNativeSubsetBoundsChangeM': max(abs(a-b) for old, new in zip(originalBounds, bounds) for a, b in zip(old, new)),
                'maximumFinalBoundsChangeM': max(abs(a-b) for old, new in zip(originalBounds, finalBounds) for a, b in zip(old, new)),
                'retainedNativeSubsetDistance': retainedDistance,
                'selectionAttempts': attempts, 'meshObjectRetained': True,
                'uvLayersRetainedWithoutUnwrap': True,
                'sourceToFinalDistanceIncludesIntentionallyDiscardedFibreInstances': True}
            return reduction
        finally:
            if nativeSubset.users == 0:
                bpy.data.meshes.remove(nativeSubset)
    raise RuntimeError('The bounded native micro-fibre subset could not reach its object allocation')


def AuditUvAndGeometry(mesh):
    mesh.calc_loop_triangles()
    raw = {}
    for layer in mesh.uv_layers:
        values = array.array('f', [0.0])*(len(layer.data)*2)
        layer.data.foreach_get('uv', values)
        raw[layer.name] = values
    report = {'triangles': len(mesh.loop_triangles), 'zeroAreaGeometryTriangles': 0,
              'nonfiniteVertices': 0, 'uvLayers': {name: {'zeroAreaTriangles': 0, 'nonfiniteTriangles': 0,
                                                         'outsideUnitTriangles': 0,
                                                         'uvBounds': [[float('inf'), float('inf')],
                                                                      [float('-inf'), float('-inf')]],
                                                         'minimumTriangleArea': float('inf')}
                                                  for name in raw}}
    report['nonfiniteVertices'] = sum(not all(math.isfinite(value) for value in vertex.co) for vertex in mesh.vertices)
    for triangle in mesh.loop_triangles:
        a, b, c = (mesh.vertices[index].co for index in triangle.vertices)
        if .5*(b-a).cross(c-a).length <= 1e-16:
            report['zeroAreaGeometryTriangles'] += 1
        for name, values in raw.items():
            points = [(values[index*2], values[index*2+1]) for index in triangle.loops]
            row = report['uvLayers'][name]
            if not all(math.isfinite(value) for point in points for value in point):
                row['nonfiniteTriangles'] += 1
                continue
            for point in points:
                for axis in (0, 1):
                    row['uvBounds'][0][axis] = min(row['uvBounds'][0][axis], point[axis])
                    row['uvBounds'][1][axis] = max(row['uvBounds'][1][axis], point[axis])
            if any(value < -1e-6 or value > 1+1e-6 for point in points for value in point):
                row['outsideUnitTriangles'] += 1
            a, b, c = points
            area = .5*abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))
            row['minimumTriangleArea'] = min(row['minimumTriangleArea'], area)
            if area <= 1e-15:
                row['zeroAreaTriangles'] += 1
    report['passed'] = bool(raw) and report['zeroAreaGeometryTriangles'] == 0 and report['nonfiniteVertices'] == 0 and all(
        row['zeroAreaTriangles'] == 0 and row['nonfiniteTriangles'] == 0 and row['outsideUnitTriangles'] == 0
        for row in report['uvLayers'].values())
    report['internalUvOverlapProvenAbsent'] = False
    report['overlapDiagnostic'] = 'Not inferred from UV retention or nonzero area; inspect actual mapped rendering and normal-transfer correspondence'
    return report


def TopologyValidationFacts(mesh):
    counts = {}
    repeated = 0
    for face in mesh.polygons:
        key = tuple(sorted(face.vertices))
        counts[key] = counts.get(key, 0)+1
        repeated += len(key) != len(set(key))
    return {'vertices': len(mesh.vertices), 'polygons': len(mesh.polygons), 'triangles': Triangles(mesh),
            'duplicatePolygonSets': sum(count > 1 for count in counts.values()),
            'duplicateExtraPolygons': sum(count-1 for count in counts.values()),
            'polygonsWithRepeatedVertexIndices': repeated}


def ValidateLodMeshForExport(obj):
    """Run the actual exporter's topology cleanup before tangent transfer."""
    isManagedLow = obj.get('Lod40kGenerator') == generator
    if not isManagedLow:
        raise RuntimeError('Validate only the independent generated LOD mesh, never the high source: ' + obj.name)
    before = TopologyValidationFacts(obj.data)
    changed = bool(obj.data.validate(verbose=False, clean_customdata=False))
    after = TopologyValidationFacts(obj.data)
    if after['triangles'] <= 0:
        raise RuntimeError('Export prevalidation removed a complete native-derived object: ' + obj.name)
    return {'method': 'Blender Mesh.validate(verbose=False, clean_customdata=False), before Normal transfer',
            'changed': changed, 'before': before, 'after': after,
            'removedTriangles': before['triangles']-after['triangles'],
            'source': 'Blender 5.2 io_scene_gltf2/blender/exp/nodes.py __gather_mesh validates blender_object.data before gathering primitives',
            'normalTransferMustUsePostValidationGeometry': True}


def RefreshExportValidatedLod(lowRoot, reductionReport, normalReport=None, distanceSamples=512):
    """Refresh actual post-export-validation inventory without rebaking/saving.

    The caller archives the prior report, writes this returned current report,
    and transfers only changed low tangent bases using the frozen high World
    images. No high mesh, material, map, parent or transform is touched here.
    """
    if lowRoot is None or Name(lowRoot) != 'Pack_Root':
        raise RuntimeError('Pass the actual current generated low root')
    report = copy.deepcopy(reductionReport)
    meshes = {Name(obj): obj for obj in (lowRoot, *lowRoot.children_recursive) if obj.type == 'MESH'}
    if len(meshes) != len(report['objects']):
        raise RuntimeError('Post-validation refresh must retain every actual low mesh object')
    before = {'totalTriangles': report['totalTriangles'], 'partTriangles': dict(report['partTriangles']),
              'objects': {row['sourceName']: row['actualTriangles'] for row in report['objects']}}
    report.setdefault('preExportValidationInventory', before)
    meshEvidence = None
    oldNormals = {}
    if normalReport is not None:
        repository = Path(bpy.context.scene['SichuanPackRepository'])
        meshEvidence = runpy.run_path(str(repository/'Taierzhuang1938/_blender/Script_SichuanQualityNormalTransferV13.py'))['MeshEvidence']
        oldNormals = {(row['part'], row['originalName']): row for row in normalReport['objects'] if row['kind'] == 'Low'}
    changedParts, changes, validations = set(), [], []
    for row in report['objects']:
        obj = meshes.get(row['sourceName'])
        if obj is None or obj.get('QualityPartRole') != row['part']:
            raise RuntimeError('A current generated mesh lost its part/source identity')
        previousTriangles = row['actualTriangles']
        row.setdefault('objectBeforeCanonicalRename', row['object'])
        row['object'] = obj.name
        validation = ValidateLodMeshForExport(obj)
        row['exportValidationRefresh'] = validation
        validations.append({'object': obj.name, **validation})
        row['actualTriangles'] = Triangles(obj.data)
        row['auditBeforeExporterValidation'] = row.get('auditBeforeExporterValidation', row['audit'])
        row['audit'] = AuditUvAndGeometry(obj.data)
        baseline = bpy.data.meshes.get(row['sourceMesh'])
        if baseline is None or MeshHash(baseline) != row['sourceMeshSha256']:
            raise RuntimeError('The retained full-quality source mesh is unavailable or changed')
        row['distance'] = DistanceAudit(baseline, obj.data, obj.matrix_world, max(16, int(distanceSamples)))
        if meshEvidence is not None:
            old = oldNormals.get((row['part'], row['sourceName']))
            if old is None:
                raise RuntimeError('The prior complete Normal report lacks an actual low mesh')
            current = meshEvidence(obj.data)
            different = [key for key in current if current[key] != old['after'].get(key)]
            row['normalEvidenceAfterExportValidation'] = current
            row['priorNormalBasisChanged'] = bool(different)
            row['normalEvidenceChangedFields'] = different
            if different:
                changedParts.add(row['part'])
                changes.append({'object': obj.name, 'originalName': row['sourceName'], 'part': row['part'],
                                'beforeTriangles': old['after']['triangles'], 'afterTriangles': current['triangles'],
                                'changedFields': different, 'previousNormalEvidence': old['after'],
                                'currentLowEvidence': current})
        elif previousTriangles != row['actualTriangles'] or validation['changed']:
            changedParts.add(row['part'])
    actual = {part: sum(row['actualTriangles'] for row in report['objects'] if row['part'] == part) for part in partNames}
    total = sum(actual.values())
    if not 0 < total <= report['triangleLimit'] or any(actual[part] > report['effectivePartBudgets'][part] for part in partNames):
        raise RuntimeError('The actual cleaned low geometry exceeds its agreed budget')
    report['partTriangles'], report['totalTriangles'] = actual, total
    report['root'], report['lowRootName'], report['lowRoot'] = lowRoot.name, lowRoot.name, lowRoot.name
    report['partRoots'] = {child.get('QualityPartRole'): child.name for child in lowRoot.children if child.get('QualityPartRole') in partNames}
    report['readyForNormalTransfer'] = all(row['audit']['passed'] for row in report['objects'])
    report['needsNormalRefreshParts'] = [part for part in partNames if part in changedParts]
    report['normalRefreshReasons'] = changes
    report['exportValidation'] = {'appliedBeforeSubsequentNormalTransfer': True,
                                  'previousTotalTriangles': before['totalTriangles'], 'actualTotalTriangles': total,
                                  'removedTrianglesSincePreviousInventory': before['totalTriangles']-total,
                                  'objects': validations,
                                  'cause': 'Official Blender glTF node gather calls Mesh.validate on source meshes; strict actual export count equality remains required'}
    report['highGeometryAndMaterialsUnchangedByRefresh'] = True
    return report


def DistanceAudit(source, reduced, matrix, samples):
    sourcePoints = [matrix @ vertex.co for vertex in source.vertices]
    lowPoints = [matrix @ vertex.co for vertex in reduced.vertices]
    sourceTree = BVHTree.FromPolygons(sourcePoints, [tuple(face.vertices) for face in source.polygons], all_triangles=False)
    lowTree = BVHTree.FromPolygons(lowPoints, [tuple(face.vertices) for face in reduced.polygons], all_triangles=False)
    def Measure(points, tree):
        count = min(len(points), samples)
        indices = [round(index*(len(points)-1)/max(1, count-1)) for index in range(count)]
        values = []
        for index in indices:
            nearest = tree.find_nearest(points[index])
            if nearest[0] is None:
                raise RuntimeError('A reduced native object no longer has a valid comparison surface')
            values.append(float(nearest[3]))
        values.sort()
        return {'samples': count, 'maximumM': max(values), 'p95M': values[min(len(values)-1, int(len(values)*.95))],
                'meanM': sum(values)/len(values)}
    oldBounds = [[min(point[axis] for point in sourcePoints), max(point[axis] for point in sourcePoints)] for axis in range(3)]
    newBounds = [[min(point[axis] for point in lowPoints), max(point[axis] for point in lowPoints)] for axis in range(3)]
    return {'sourceToReduced': Measure(sourcePoints, lowTree), 'reducedToSource': Measure(lowPoints, sourceTree),
            'sourceWorldBoundsM': oldBounds, 'reducedWorldBoundsM': newBounds,
            'maximumBoundsChangeM': max(abs(a-b) for old, new in zip(oldBounds, newBounds) for a, b in zip(old, new)),
            'metric': 'Deterministic native-vertex samples to nearest actual triangle surface in metres',
            'limitation': 'Nearest-surface gaps can match an adjacent woven strand; actual visual comparison remains required'}


def ReduceObject(obj, target, maxTrials=8):
    original = Triangles(obj.data)
    if original <= target:
        return {'method': 'Native copy retained without decimation', 'trials': [], 'ratio': 1.0}
    if obj.modifiers:
        raise RuntimeError('Use the imported baked runtime copy without other modifiers: ' + obj.name)
    modifier = obj.modifiers.new('QualityLod40kV13_Collapse', 'DECIMATE')
    modifier.decimate_type = 'COLLAPSE'
    modifier.use_collapse_triangulate = True
    ratio = max(.000001, (target-2)/original)
    trials = []
    for attempt in range(maxTrials):
        modifier.ratio = ratio
        bpy.context.view_layer.update()
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh()
        try:
            count = Triangles(mesh)
        finally:
            evaluated.to_mesh_clear()
        trials.append({'ratio': ratio, 'actualTriangles': count})
        if 0 < count <= target:
            break
        ratio = min(1.0, ratio*1.5+.001) if count == 0 else ratio*max(.2, min(.98, (target-2)/count))
    else:
        obj.modifiers.remove(modifier)
        raise QemBudgetError(obj.name, trials)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    with bpy.context.temp_override(object=obj,active_object=obj,selected_objects=[obj],selected_editable_objects=[obj]):
        status = bpy.ops.object.modifier_apply(modifier=modifier.name)
    if 'FINISHED' not in status or not 0 < Triangles(obj.data) <= target:
        raise RuntimeError('The applied decimation lost an object or exceeded its budget: ' + obj.name)
    return {'method': 'Native imported geometry QEM collapse; loop UV interpolation, no unwrap or proxy construction',
            'trials': trials, 'ratio': ratio,
            'uvDelimitGuarantee': 'No planar-delimit guarantee is claimed for Collapse mode; actual final UVs are audited'}


def BuildQualityLod40k(importedRoot, perPartBudgets=None, *, triangleLimit=40000,
                       reserveTriangles=500, keepCaps=True, preserveBack=True, distanceSamples=512):
    if importedRoot is None or Name(importedRoot) != 'Pack_Root':
        raise RuntimeError('Pass the independent root imported from the complete Quality runtime GLB')
    requested = {name: int((perPartBudgets or defaultBudgets)[name]) for name in partNames}
    if min(requested.values()) <= 0 or triangleLimit > 40000 or triangleLimit <= 0 or reserveTriangles < 0:
        raise ValueError('Use positive five-part budgets and an all-parts limit no larger than 40000 triangles')
    budgets = EffectiveBudgets(requested, triangleLimit, reserveTriangles)
    parts = TagQualityRoles(importedRoot)
    allObjects = [importedRoot, *importedRoot.children_recursive]
    transforms = {obj.name: obj.matrix_world.copy() for obj in allObjects}
    parentNames = {obj.name: obj.parent.name if obj.parent else None for obj in allObjects}
    selected, active = [obj for obj in bpy.context.view_layer.objects if obj.select_get()], bpy.context.view_layer.objects.active
    rows, protectedCaps = [], []
    for name in partNames:
        for obj in (parts[name], *parts[name].children_recursive):
            if obj.type != 'MESH':
                continue
            baselineName = obj.get('Lod40kOriginalMeshV13', '')
            baseline = bpy.data.meshes.get(baselineName) if baselineName else obj.data
            if baseline is None or Triangles(baseline) <= 0:
                raise RuntimeError('A complete native runtime object is missing its preserved mesh: ' + obj.name)
            baseline.use_fake_user = True
            minimum, weight, protected = ObjectPolicy(obj, Triangles(baseline), keepCaps)
            row = {'object': obj.name, 'sourceName': Name(obj), 'part': name,
                   'sourceMesh': baseline.name, 'sourceTriangles': Triangles(baseline),
                   'sourceMeshSha256': MeshHash(baseline), 'sourceUvHashes': UvHashes(baseline),
                   'minimum': minimum, 'weight': weight, 'protected': protected,
                   'materialsBefore': [slot.material.name if slot.material else None for slot in obj.material_slots]}
            rows.append(row)
            if protected:
                protectedCaps.append(obj.name)
    if keepCaps and len(protectedCaps) != 1:
        raise RuntimeError('The complete runtime must retain its one two-plane V12 cap object')
    if {obj.name for obj in allObjects if obj.type == 'MESH'} != {row['object'] for row in rows}:
        raise RuntimeError('A runtime mesh is outside the five independently controlled parts')
    targets = {}
    for name in partNames:
        targets.update(Allocate([row for row in rows if row['part'] == name], budgets[name]))
    try:
        for row in rows:
            obj = bpy.data.objects[row['object']]
            baseline = bpy.data.meshes[row['sourceMesh']]
            prior = obj.data if obj.data.get('Lod40kGenerator') == generator else None
            obj.data = baseline.copy()
            obj.data.name = 'Geometry_Lod40kV13_' + row['sourceName']
            obj.data.use_fake_user = False
            obj.data['Lod40kGenerator'] = generator
            obj['Lod40kOriginalMeshV13'] = baseline.name
            obj['Lod40kGenerator'] = generator
            if prior is not None and prior.users == 0:
                bpy.data.meshes.remove(prior)
            hidden, disabled = obj.hide_get(), obj.hide_viewport
            obj.hide_viewport = False
            obj.hide_set(False)
            try:
                row['targetTriangles'] = targets[obj.name]
                row['microFibreComponentSelectionAllowed'] = IsMicroFibre(obj)
                row['reduction'] = (ReduceMicroFibres(obj, baseline, targets[obj.name])
                                    if row['microFibreComponentSelectionAllowed'] else ReduceObject(obj, targets[obj.name]))
                row['backPlane'] = {'enabled': False, 'snappedVertices': 0, 'maximumMoveM': 0.0}
                if preserveBack and row['part'] == 'Pack_Bundle' and row['sourceName'] == 'Pack_Bundle':
                    intoRoot = importedRoot.matrix_world.inverted_safe() @ obj.matrix_world
                    inverse = intoRoot.inverted_safe()
                    originalBack = sum(abs((intoRoot @ vertex.co).y) < 1e-7 for vertex in baseline.vertices)
                    moved, maximum = 0, 0.0
                    if originalBack:
                        for vertex in obj.data.vertices:
                            point = intoRoot @ vertex.co
                            if abs(point.y) < .0005:
                                maximum = max(maximum, abs(point.y))
                                point.y = 0
                                vertex.co = inverse @ point
                                moved += 1
                    obj.data.update()
                    row['backPlane'] = {'enabled': bool(originalBack), 'sourceFlatBackVertices': originalBack,
                                        'snappedVertices': moved, 'maximumMoveM': maximum,
                                        'plane': 'Root-local Blender Y=0; GLTF export_yup=True restores body-facing Z=0'}
                row['exportValidation'] = ValidateLodMeshForExport(obj)
                row['actualTriangles'] = Triangles(obj.data)
                row['audit'] = AuditUvAndGeometry(obj.data)
                row['distance'] = DistanceAudit(baseline, obj.data, obj.matrix_world, max(16, int(distanceSamples)))
                row['materialsAfter'] = [slot.material.name if slot.material else None for slot in obj.material_slots]
                if row['materialsAfter'] != row['materialsBefore'] or set(UvHashes(obj.data)) != set(row['sourceUvHashes']):
                    raise RuntimeError('Reduction changed the existing runtime material slots or UV-layer names')
                if MeshHash(baseline) != row['sourceMeshSha256']:
                    raise RuntimeError('The preserved full-quality runtime mesh changed')
                if row['protected'] and MeshHash(obj.data) != row['sourceMeshSha256']:
                    raise RuntimeError('The protected planar cap geometry/UVs changed')
            finally:
                obj.hide_viewport = disabled
                obj.hide_set(hidden)
    finally:
        bpy.ops.object.select_all(action='DESELECT')
        for obj in selected:
            if obj.name in bpy.context.view_layer.objects and not obj.hide_get():
                obj.select_set(True)
        if active is not None and active.name in bpy.context.view_layer.objects:
            bpy.context.view_layer.objects.active = active
    for obj in allObjects:
        if any(abs(obj.matrix_world[row][column]-transforms[obj.name][row][column]) > 1e-8
               for row in range(4) for column in range(4)) or (obj.parent.name if obj.parent else None) != parentNames[obj.name]:
            raise RuntimeError('LOD generation changed a protected root/object transform or parent: ' + obj.name)
    actual = {name: sum(row['actualTriangles'] for row in rows if row['part'] == name) for name in partNames}
    total = sum(actual.values())
    if total > triangleLimit or any(actual[name] > budgets[name] for name in partNames):
        raise RuntimeError('Actual all-optional LOD geometry exceeds its explicit triangle limit')
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1.0
    return {'generator': generator, 'root': importedRoot.name, 'lowRootName': importedRoot.name,
            'operatesInPlace': True, 'partRoots': {role: obj.name for role, obj in parts.items()},
            'partRoleProperty': 'QualityPartRole', 'originalNameProperty': 'QualityOriginalName',
            'requestedPartBudgets': requested,
            'effectivePartBudgets': budgets, 'partTriangles': actual, 'totalTriangles': total,
            'triangleLimit': triangleLimit, 'reservedTriangles': reserveTriangles,
            'sourceTriangles': sum(row['sourceTriangles'] for row in rows), 'meshObjects': len(rows),
            'objects': rows, 'allFivePartsRetained': True, 'allMeshObjectsRetained': True,
            'protectedCaps': protectedCaps, 'runtimeMaterialsAndImagesUnchanged': True,
            'sourceRuntimeMeshDataRetained': True, 'uvReunwrapPerformed': False, 'proxyGeometryCreated': False,
            'rootPivotTransformsAndParentsUnchanged': True,
            'axisContract': 'Native Blender coordinates after GLTF import; export_yup=True, no manual corrective rotation',
            'jacketRemainsIndependentlyHideableAndMovable': True,
            'readyForNormalTransfer': all(row['audit']['passed'] for row in rows),
            'normalTransferRequired': 'Orchestrator transfers saved high world normals into this low tangent basis on the retained UV; Base/ORM images remain unchanged',
            'visualVerificationRequired': True}


PrepareQualityLod40k = BuildQualityLod40k
