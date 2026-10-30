"""Reopen, re-export and import the actual local ear trial; retain motion gates."""
import bpy, hashlib, importlib.util, json, numpy as np
from pathlib import Path
from mathutils import Quaternion, Vector
from mathutils.bvhtree import BVHTree

repo = Path(__file__).resolve().parents[2]
base = Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette')
root = base/'FrontCornerV79'
m = json.loads((root/'Acceptance/Data_FrontCornerIdentityV79.json').read_text())
assert not bpy.data.filepath
source = Path(m['sourceBlend'])
assert hashlib.sha256(source.read_bytes()).hexdigest() == m['sourceBlendSha256']
bpy.ops.wm.open_mainfile(filepath=str(source))
obj = bpy.data.objects[m['newOwner']]
assert obj.parent.name == 'FinalDriveHousingRight'
assert obj['ProfileAndDimensionsInferred'] and obj['ParentAttachmentInferred']
assert sum(o.type == 'MESH' for o in bpy.data.objects['Type94Tankette'].children_recursive) == 238
file = repo/'Taierzhuang1938/_blender/Script_Type94Export.py'
spec = importlib.util.spec_from_file_location('Corner79Reexport', file)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
bpy.ops.object.select_all(action='DESELECT')
asset = bpy.data.objects['Type94Tankette']
for part in [asset, *asset.children_recursive]:
    part.select_set(True)
reexport = root/'Exports/Model_Type94TanketteHighShapeV79SourceReexport.glb'
module.ExportGltf(reexport)
assert hashlib.sha256(source.read_bytes()).hexdigest() == m['sourceBlendSha256']
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene['BlenderMcpTask'] = 'Type94Tankette'
assert hashlib.sha256(Path(m['sourceGlb']).read_bytes()).hexdigest() == m['sha256']
bpy.ops.import_scene.gltf(filepath=m['sourceGlb'])
bpy.context.view_layer.update()
asset = bpy.data.objects['Type94Tankette']
objects = [asset, *asset.children_recursive]
assert len(objects) == 293
assert sum(o.type == 'MESH' for o in objects) == 238
points, faces, owners = [], [], []
for part in objects:
    if part.type != 'MESH':
        continue
    offset = len(points)
    points.extend(part.matrix_world@v.co for v in part.data.vertices)
    for face in part.data.polygons:
        faces.append([offset+i for i in face.vertices])
        owners.append(part.name)
tree = BVHTree.FromPolygons(points, faces, all_triangles=True)
c = json.loads((base/'ReferenceV60/Inputs/Data_GeneratorEnvelopeAuditV52.json').read_text())['cameras']['2017']
eye = Vector(-np.asarray(c['rotationCameraFromBlender']).T@np.asarray(c['translationCameraFromBlender'])+[0, 0, m['groundCompensationM']])
target = Vector(m['crownWorldM'])
delta = target-eye
hit = tree.ray_cast(eye, delta.normalized(), delta.length+.002)
gap = delta.length-hit[3] if hit[2] is not None else None
assert hit[2] is not None and owners[hit[2]] == m['newOwner'] and abs(gap) < .00015
ear = bpy.data.objects[m['newOwner']]
before = np.asarray(ear.matrix_world).copy()
driveChecks = []
for name in ['Wheel_Left_Drive', 'Wheel_Right_Drive']:
    wheel = bpy.data.objects[name]
    previousMode, previousRotation = wheel.rotation_mode, wheel.rotation_quaternion.copy()
    wheel.rotation_mode = 'QUATERNION'
    wheel.rotation_quaternion = previousRotation@Quaternion((1, 0, 0), .47)
    bpy.context.view_layer.update()
    drift = float(np.max(abs(np.asarray(ear.matrix_world)-before)))
    driveChecks.append(dict(wheel=name, earWorldMatrixDrift=drift, passed=drift < 1e-8))
    wheel.rotation_quaternion = previousRotation
    wheel.rotation_mode = previousMode
    bpy.context.view_layer.update()
assert all(r['passed'] for r in driveChecks)
file = repo/'Taierzhuang1938/_blender/Script_VerifyType94Sweep.py'
spec = importlib.util.spec_from_file_location('Corner79Motion', file)
motionModule = importlib.util.module_from_spec(spec)
spec.loader.exec_module(motionModule)
driver = json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_BodyTrialV64.json').read_text())['driver']
envelope = dict(xRangeM=[driver['centerXM']-driver['widthM']/2-.10, driver['centerXM']+driver['widthM']/2+.10], forwardRangeM=[driver['topForwardM']-.283-.10, driver['bottomForwardM']+.10], minimumHeightM=driver['bottomZM']-.015)
path = json.loads((base/'DetailV64/Acceptance/Data_MechanismShapeV64FrontDetailTrial.json').read_text())['path']
motion = motionModule.VerifyScene(scene, path, {'DriverRoof': dict(gunElevationDegrees=12, basis='Retained inferred interlock; far front corner trial retested')}, cabinEnvelope=envelope)
(root/'Acceptance/Data_FrontCornerMotionV79.json').write_text(json.dumps(motion, indent=2)+'\n')
assert motion['passed']
report = dict(passed=True, sourceReopened=True, actualGlbImported=True, meshOwners=238, poseNodes=293, crownFirstOwner=owners[hit[2]], crownTargetGapM=gap, driveChecks=driveChecks, motionChecks=len(motion['checks']), sourceReexport=str(reexport), sourceReexportSha256=hashlib.sha256(reexport.read_bytes()).hexdigest(), sourceReadOnly=True, sourceBlendSha256=m['sourceBlendSha256'], sha256=m['sha256'], primaryCrownIsTraining=True, secondaryReferenceAccepted=False, wholeReferenceAccepted=False)
(root/'Acceptance/Data_FrontCornerNativeV79.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report), flush=True)
