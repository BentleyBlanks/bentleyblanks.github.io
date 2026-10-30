"""Actual saved-source/reimport, attachment and retained movement checks."""
import bpy,hashlib,importlib.util,json,numpy as np
from pathlib import Path
from mathutils import Matrix,Vector
from mathutils.bvhtree import BVHTree
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=base/'CasingLugV98';m=json.loads((root/'Acceptance/Data_CasingLugIdentityV98.json').read_text());assert not bpy.data.filepath
assert hashlib.sha256(Path(m['sourceBlend']).read_bytes()).hexdigest()==m['sourceBlendSha256'];bpy.ops.wm.open_mainfile(filepath=m['sourceBlend']);assert bpy.context.scene.get('BlenderMcpTask')=='Type94Tankette'
obj=bpy.data.objects[m['supportingMesh']];lug=bpy.data.objects[m['newMesh']]
points=[obj.matrix_world@v.co for v in obj.data.vertices];oldFaces=[list(f.vertices)for f in obj.data.polygons]
layout=json.loads(Path(m['layoutFile']).read_text());face=Vector(layout['visibleFaceCentreWorldM']);tree=BVHTree.FromPolygons(points,oldFaces);hit=tree.ray_cast(face,Vector((1,0,0)),.1);assert hit[0]is not None
back=max((lug.matrix_world@v.co).x for v in lug.data.vertices);overlap=back-hit[0].x;assert overlap>.0039
asset=bpy.data.objects['Type94Tankette'];bpy.ops.object.select_all(action='DESELECT')
for obj in [asset,*asset.children_recursive]:obj.select_set(True)
spec=importlib.util.spec_from_file_location('Casing98Reexport',repo/'Taierzhuang1938/_blender/Script_Type94Export.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);reexport=root/'Exports/Model_Type94TanketteHighShapeV98SourceReexport.glb';module.ExportGltf(reexport)
assert hashlib.sha256(Path(m['sourceBlend']).read_bytes()).hexdigest()==m['sourceBlendSha256'];bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;scene['BlenderMcpTask']='Type94Tankette';bpy.ops.import_scene.gltf(filepath=m['sourceGlb']);bpy.context.view_layer.update()
asset=bpy.data.objects['Type94Tankette'];objects=[asset,*asset.children_recursive];assert len(objects)==296 and sum(o.type=='MESH'for o in objects)==240
spec=importlib.util.spec_from_file_location('Casing98Motion',repo/'Taierzhuang1938/_blender/Script_VerifyType94Sweep.py');sweep=importlib.util.module_from_spec(spec);spec.loader.exec_module(sweep)
driver=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_BodyTrialV64.json').read_text())['driver'];envelope=dict(xRangeM=[driver['centerXM']-driver['widthM']/2-.10,driver['centerXM']+driver['widthM']/2+.10],forwardRangeM=[driver['topForwardM']-.283-.10,driver['bottomForwardM']+.10],minimumHeightM=driver['bottomZM']-.015)
path=json.loads((base/'DetailV64/Acceptance/Data_MechanismShapeV64FrontDetailTrial.json').read_text())['path'];motion=sweep.VerifyScene(scene,path,{'DriverRoof':dict(gunElevationDegrees=12,basis='Retained modeled interlock')},cabinEnvelope=envelope);(root/'Acceptance/Data_CasingVehicleMotionV98.json').write_text(json.dumps(motion,indent=2)+'\n');assert motion['passed']
meshes={o for o in objects if o.type=='MESH'};gate=bpy.data.objects['TowLatchFront'];moving=set(gate.children_recursive)
def Tree(parts):
    vertices=[];faces=[]
    for part in parts:
        if part.type!='MESH':continue
        offset=len(vertices);vertices.extend(part.matrix_world@v.co for v in part.data.vertices);faces.extend([[offset+i for i in f.vertices]for f in part.data.polygons])
    return BVHTree.FromPolygons(vertices,faces)
fixed=Tree(meshes-moving);rest=gate.matrix_basis.copy();rows=[]
for degrees in np.linspace(0,55,56):
    gate.matrix_basis=rest@Matrix.Rotation(float(np.deg2rad(degrees)),4,'X');bpy.context.view_layer.update();rows.append(dict(degrees=float(degrees),trianglePairs=len(Tree(moving).overlap(fixed))))
gate.matrix_basis=rest;bpy.context.view_layer.update();assert all(r['trianglePairs']==0 for r in rows)
report=dict(passed=True,sourceBlendSha256=m['sourceBlendSha256'],sha256=m['sha256'],sourceReexportSha256=hashlib.sha256(reexport.read_bytes()).hexdigest(),sourceReadOnly=True,actualGlbImported=True,meshOwners=240,poseNodes=296,actualCentreRootOverlapM=overlap,rootDepthInferred=True,vehicleMotionChecks=len(motion['checks']),gateSweepRows=rows,gateContactExclusionM=0,wholeReferenceAccepted=False)
(root/'Acceptance/Data_CasingNativeV98.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items()if k!='gateSweepRows'}),flush=True)
