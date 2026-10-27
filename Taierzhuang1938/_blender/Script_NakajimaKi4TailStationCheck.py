"""Read-only reopened V41 source and actual GLB tail-motion audit.

Run with the saved author open through Script_BlenderMcp. Never save the
transient imported scene over that author.
"""
import ast, hashlib, json, math, os, pathlib, re, array, struct
import bpy
from mathutils import Vector, Quaternion
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri

repo = pathlib.Path(globals().get('__file__', 'Taierzhuang1938/_blender/Script_NakajimaKi4TailStationCheck.py')).resolve().parents[2]
asset = pathlib.Path(os.environ.get('KI4_ASSET_ROOT', str(repo / 'tmp/NakajimaKi4/ReferenceV41_TailStation')))
record = json.loads((asset / 'Evidence/Data_TailStationAuthor.json').read_text(encoding='utf8'))
source = pathlib.Path(bpy.data.filepath)
assert source.resolve() == pathlib.Path(record['sourcePath']).resolve()
assert hashlib.sha256(source.read_bytes()).hexdigest() == record['sourceSha256']
root = bpy.data.objects['NakajimaKi4']
assert root['version'] == '20261027ReferenceV41TailStationGray'
assert not root['referenceFidelityPassed'] and not bpy.context.scene.get('Ki4TailStationMutationInProgress')

module = ast.parse((repo / 'Taierzhuang1938/_blender/Script_NakajimaKi4MainGearUpdate.py').read_text(encoding='utf8'))
function = next(n for n in module.body if isinstance(n, ast.FunctionDef) and n.name == 'MeshFingerprint')
exec(compile(ast.Module(body=[function], type_ignores=[]), 'MeshFingerprint', 'exec'), globals())
meshes = [o for o in root.children_recursive if o.type == 'MESH']
assert len(meshes) == 928
actual = {o.name: MeshFingerprint(o) for o in meshes}
expected = {**record['unchangedSourceMeshes'], **record['changedSourceMeshes']}
assert len(expected) == 928 and actual == expected
images = {i.name: hashlib.sha256(i.packed_file.data).hexdigest() for i in bpy.data.images if i.packed_file}
assert len(images) == 40 and images == record['originalPackedImagesUnchanged']

def BoundsAndCount(objects, evaluate):
    low = Vector((math.inf, math.inf, math.inf)); high = -low; total = 0
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in objects:
        evaluated = obj.evaluated_get(depsgraph) if evaluate else obj
        mesh = evaluated.to_mesh() if evaluate else obj.data
        mesh.calc_loop_triangles(); total += len(mesh.loop_triangles)
        for vertex in mesh.vertices:
            point = obj.matrix_world @ vertex.co
            for axis in range(3):
                low[axis] = min(low[axis], point[axis]); high[axis] = max(high[axis], point[axis])
        if evaluate: evaluated.to_mesh_clear()
    dimensions = high - low
    assert abs(dimensions.x - 12) < .002 and abs(dimensions.y - 8.25) < .05 and abs(dimensions.z - 3.31) < .04
    return total, list(dimensions)

raw, _ = BoundsAndCount(meshes, False)
evaluated, dimensions = BoundsAndCount(meshes, True)
assert raw == 348908 and evaluated == 351020
sourcePivots = {o.name: o for o in root.children_recursive if o.name.startswith('Pivot_')}
assert len(sourcePivots) == 10
for side in ['Left', 'Right']:
    point = sourcePivots['Pivot_Elevator' + side].matrix_world.translation
    assert abs(point.y + 3.665) < 2e-6 and abs(point.z - 1.8200000524520874) < 2e-6
braces = []
for row in record['braceConnections']:
    obj = bpy.data.objects[row['name']]; z = [v.co.z for v in obj.data.vertices]; caps = []
    for value in [min(z), max(z)]:
        points = [obj.matrix_world @ v.co for v in obj.data.vertices if abs(v.co.z - value) < 1e-6]
        caps.append(sum(points, Vector()) / len(points))
    lower, upper = sorted(caps, key=lambda point: point.z)
    error = max((lower - Vector(row['lowerBodyBlenderM'])).length, (upper - Vector(row['upperTailBlenderM'])).length)
    assert error < 2e-6
    braces.append({'name': obj.name, 'endpointErrorM': error})

glb = asset / 'Model_NakajimaKi4HighGray.glb'
assert hashlib.sha256(glb.read_bytes()).hexdigest() == record['grayExportSha256']
beforeImport = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(glb))
imported = set(bpy.data.objects) - beforeImport
nodes = {re.sub(r'\.\d{3}$', '', o.name): o for o in imported}
assert nodes['NakajimaKi4']['version'] == root['version']
importMeshes = [o for o in imported if o.type == 'MESH']
importTriangles, importDimensions = BoundsAndCount(importMeshes, False)
assert len(importMeshes) == 928 and importTriangles == 351020
assert max(abs(a-b) for a,b in zip(dimensions, importDimensions)) < 2e-5
controls = {name: nodes[name] for name in sourcePivots}
axisRows = []
for name, pivot in controls.items():
    sourcePivot = sourcePivots[name]
    axis = Vector((0,0,1)) if name in ['Pivot_Rudder', 'Pivot_ObserverYaw'] else Vector((0,1,0)) if name == 'Pivot_Propeller' else Vector((1,0,0))
    distance = (sourcePivot.matrix_world.translation - pivot.matrix_world.translation).length
    axisError = ((sourcePivot.matrix_world.to_3x3() @ axis).normalized() - (pivot.matrix_world.to_3x3() @ axis).normalized()).length
    assert distance < 3e-6 and axisError < 2e-6, (name, distance, axisError)
    axisRows.append({'name': name, 'originDifferenceM': distance, 'unitAxisDifference': axisError})

audit = ast.parse((repo / 'Taierzhuang1938/_blender/Script_NakajimaKi4Audit.py').read_text(encoding='utf8'))
for name in ['Tree', 'TrianglePenetrates', 'Intersections']:
    function = next(n for n in audit.body if isinstance(n, ast.FunctionDef) and n.name == name)
    exec(compile(ast.Module(body=[function], type_ignores=[]), 'CollisionHelpers', 'exec'), globals())
rudder = controls['Pivot_Rudder']
elevators = [controls['Pivot_Elevator' + side] for side in ['Left','Right']]
movingR = [o for o in rudder.children_recursive if o.type == 'MESH']
movingE = [o for pivot in elevators for o in pivot.children_recursive if o.type == 'MESH']
fixedTail = [nodes[name] for name in ['Tailplane_Left','Tailplane_Right','TailplaneBrace_Left','TailplaneBrace_Right','Fuselage_Monocoque','VerticalFin']]
tailStatic = Tree(fixedTail)
snapshots = {o: (o.rotation_mode, o.rotation_quaternion.copy(), o.rotation_euler.copy()) for o in [rudder] + elevators}
restR = rudder.matrix_basis.to_quaternion(); restE = [o.matrix_basis.to_quaternion() for o in elevators]
for obj in [rudder] + elevators: obj.rotation_mode = 'QUATERNION'
checks = []
for rudderAngle in [-25,0,25]:
    for elevatorAngle in [-25,0,25]:
        rudder.rotation_quaternion = restR @ Quaternion(Vector((0,0,1)), math.radians(rudderAngle))
        for pivot, rest in zip(elevators, restE):
            pivot.rotation_quaternion = rest @ Quaternion(Vector((1,0,0)), math.radians(elevatorAngle))
        bpy.context.view_layer.update()
        rudderTree = Tree(movingR); elevatorTree = Tree(movingE)
        rE, rCandidates = Intersections(rudderTree, elevatorTree)
        eS, eCandidates = Intersections(elevatorTree, tailStatic)
        checks.append({'rudderDegrees':rudderAngle, 'elevatorDegrees':elevatorAngle, 'rudderElevatorIntersections':rE, 'elevatorFixedBodyTailIntersections':eS, 'bvhCandidates':rCandidates+eCandidates})
for obj, (mode, quaternion, euler) in snapshots.items():
    obj.rotation_mode = mode; obj.rotation_quaternion = quaternion; obj.rotation_euler = euler
bpy.context.view_layer.update()
assert not any(row['rudderElevatorIntersections'] or row['elevatorFixedBodyTailIntersections'] for row in checks), checks
assert actual == {o.name: MeshFingerprint(o) for o in meshes}, 'Transient audit changed author objects'
assert hashlib.sha256(source.read_bytes()).hexdigest() == record['sourceSha256']
result = {'state':'SavedV41SourceAndActualGlbReimportTailChecksPassed_WholeReferenceAndPbrPending', 'sourcePath':str(source), 'sourceSha256':record['sourceSha256'], 'grayExportSha256':record['grayExportSha256'], 'authorNeverSavedDuringAudit':True, 'sourceMeshes':928, 'allSourceFingerprintsPassed':True, 'unchangedSourceMeshes':922, 'changedSourceMeshes':6, 'packedOriginalImages':40, 'rawTriangles':raw, 'evaluatedTriangles':evaluated, 'actualGlbTriangles':importTriangles, 'sourceEvaluatedDimensionsBlenderM':dimensions, 'actualGlbDimensionsBlenderM':importDimensions, 'elevatorAxisBlenderM':record['newElevatorAxisBlenderM'], 'braceConnections':braces, 'tenActualReimportPivotAxes':axisRows, 'actualGlbNineCombinedTailClearanceChecks':checks, 'wholeReferenceFidelityPassed':False, 'scope':'Reopened exact saved author and imported exact exported GLB. All source meshes and packed inputs retained; ten pivot origins/axes and nine tail-specific combined clearance poses checked. Does not approve full80 motion, tail installation height/incidence, whole photographic match, revised PBR/AO or180k game derivative.'}
for directory in [asset/'Evidence', source.parent/'Evidence']:
    (directory/'Data_TailStationReopenedCheck.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps(result), flush=True)
