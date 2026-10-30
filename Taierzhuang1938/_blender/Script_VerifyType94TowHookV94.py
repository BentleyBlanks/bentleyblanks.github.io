"""Saved-source/reimport and full-surface gate sweep on the real V94 GLB."""
import bpy,hashlib,importlib.util,json,math,numpy as np
from pathlib import Path
from mathutils import Matrix,Vector
from mathutils.bvhtree import BVHTree
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=base/'TowHookV94'
m=json.loads((root/'Acceptance/Data_TowHookIdentityV94.json').read_text());assert not bpy.data.filepath
assert hashlib.sha256(Path(m['sourceBlend']).read_bytes()).hexdigest()==m['sourceBlendSha256']
bpy.ops.wm.open_mainfile(filepath=m['sourceBlend']);asset=bpy.data.objects['Type94Tankette']
assert 'TowShackleFront'not in bpy.data.objects and 'Geometry_TowShackleFront_Paint'not in bpy.data.objects
assert bpy.data.objects['TowLatchFront'].get('RestIsPhotographicPose')
groups={name:list(bpy.data.objects[name].vertex_groups.keys())for name in m['newMeshes']}
assert 'Tow_HookForgedCore'in groups['Geometry_TowHookFrontFixed_Paint'] and 'Tow_GatePlate'in groups['Geometry_TowLatchFront_Paint']
for obj in [asset,*asset.children_recursive]:obj.select_set(True)
spec=importlib.util.spec_from_file_location('Tow94Reexport',repo/'Taierzhuang1938/_blender/Script_Type94Export.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
reexport=root/'Exports/Model_Type94TanketteHighShapeV94SourceReexport.glb';module.ExportGltf(reexport)
assert hashlib.sha256(Path(m['sourceBlend']).read_bytes()).hexdigest()==m['sourceBlendSha256']
bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;scene['BlenderMcpTask']='Type94Tankette'
bpy.ops.import_scene.gltf(filepath=m['sourceGlb']);bpy.context.view_layer.update()
asset=bpy.data.objects['Type94Tankette'];objects=[asset,*asset.children_recursive];meshes=[o for o in objects if o.type=='MESH']
assert len(objects)==295 and len(meshes)==239
gate=bpy.data.objects['TowLatchFront'];fixed=bpy.data.objects['TowHookFrontFixed'];moving=set(gate.children_recursive)
def Tree(parts):
    vertices=[];faces=[]
    for obj in parts:
        if obj.type!='MESH':continue
        offset=len(vertices);vertices.extend(obj.matrix_world@v.co for v in obj.data.vertices)
        faces.extend([[offset+i for i in face.vertices]for face in obj.data.polygons])
    return BVHTree.FromPolygons(vertices,faces)
fixedTree=Tree(set(meshes)-moving);rest=gate.matrix_basis.copy();fixedMatrix=np.asarray(fixed.matrix_world).copy();pin=gate.matrix_world.translation.copy();rows=[]
for degrees in np.linspace(0,gate['DemoTravelDegrees'],56):
    gate.matrix_basis=rest@Matrix.Rotation(math.radians(float(degrees)),4,'X');bpy.context.view_layer.update()
    overlap=Tree(moving).overlap(fixedTree)
    rows.append(dict(degrees=float(degrees),trianglePairs=len(overlap),fixedWorldMatrixDrift=float(abs(np.asarray(fixed.matrix_world)-fixedMatrix).max()),pinDriftM=(gate.matrix_world.translation-pin).length))
gate.matrix_basis=rest;bpy.context.view_layer.update()
clearance=dict(passed=all(r['trianglePairs']==0 and r['fixedWorldMatrixDrift']==0 and r['pinDriftM']<1e-8 for r in rows),samples=rows,contactExclusionM=0,scope='Full gate against all fixed vehicle triangles, including pin/spring/hook and seals; no bearing or local-contact exemption')
(root/'Acceptance/Data_TowGateSweepV94.json').write_text(json.dumps(clearance,indent=2)+'\n')
assert clearance['passed']
throat=fixed.matrix_world@Vector((-.2,.050,-.083));direction=fixed.matrix_world.to_3x3()@Vector((1,0,0));hit=Tree([*fixed.children_recursive,*gate.children_recursive]).ray_cast(throat,direction,.4)
assert hit[0]is None,'The actual hook throat should be open'
file=repo/'Taierzhuang1938/_blender/Script_VerifyType94Sweep.py';spec=importlib.util.spec_from_file_location('Tow94Motion',file);sweep=importlib.util.module_from_spec(spec);spec.loader.exec_module(sweep)
driver=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_BodyTrialV64.json').read_text())['driver']
envelope=dict(xRangeM=[driver['centerXM']-driver['widthM']/2-.10,driver['centerXM']+driver['widthM']/2+.10],forwardRangeM=[driver['topForwardM']-.283-.10,driver['bottomForwardM']+.10],minimumHeightM=driver['bottomZM']-.015)
path=json.loads((base/'DetailV64/Acceptance/Data_MechanismShapeV64FrontDetailTrial.json').read_text())['path']
motion=sweep.VerifyScene(scene,path,{'DriverRoof':dict(gunElevationDegrees=12,basis='Retained modeled interlock; unchanged cabin')},cabinEnvelope=envelope)
(root/'Acceptance/Data_TowVehicleMotionV94.json').write_text(json.dumps(motion,indent=2)+'\n');assert motion['passed']
report=dict(passed=True,sourceReopened=True,sourceReadOnly=True,sourceBlendSha256=m['sourceBlendSha256'],sha256=m['sha256'],sourceReexportSha256=hashlib.sha256(reexport.read_bytes()).hexdigest(),meshOwners=239,poseNodes=295,sourceSubpartGroups=groups,gateSweepSamples=len(rows),gateContactExclusionM=0,actualHookThroatOpen=True,retainedVehicleMotionChecks=len(motion['checks']),legacyWrongShackleSweepRetired=True,newGateSweepReplacesIt=True,wholeReferenceAccepted=False)
(root/'Acceptance/Data_TowNativeV94.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
