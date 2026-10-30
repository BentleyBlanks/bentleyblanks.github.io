"""Actual current low import: whole vehicle, gate and real shoulder aperture."""
import bpy,hashlib,importlib.util,json,math,os,numpy as np
from pathlib import Path
from mathutils import Matrix,Vector
from mathutils.bvhtree import BVHTree
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=Path(os.environ.get('TYPE94_GAME_ROOT',str(base/'GameWearV103')));acc=root/'Acceptance';geometryOnly=os.environ.get('TYPE94_GEOMETRY_ONLY')=='1';m=json.loads((acc/('Data_GameGeometryV103.json'if geometryOnly else'Data_GamePbrV103.json')).read_text());assert not bpy.data.filepath
assert hashlib.sha256(Path(m['sourceGlb']).read_bytes()).hexdigest()==m['sha256'];bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;scene['BlenderMcpTask']='Type94Tankette';bpy.ops.import_scene.gltf(filepath=m['sourceGlb']);bpy.context.view_layer.update();asset=bpy.data.objects['Type94Tankette'];objects=[asset,*asset.children_recursive];meshes={o for o in objects if o.type=='MESH'};assert len(objects)==296 and len(meshes)==240
driver=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_BodyTrialV64.json').read_text())['driver'];envelope=dict(xRangeM=[driver['centerXM']-driver['widthM']/2-.10,driver['centerXM']+driver['widthM']/2+.10],forwardRangeM=[driver['topForwardM']-.283-.10,driver['bottomForwardM']+.10],minimumHeightM=driver['bottomZM']-.015);path=json.loads((base/'DetailV64/Acceptance/Data_MechanismShapeV64FrontDetailTrial.json').read_text())['path']
spec=importlib.util.spec_from_file_location('Game100ActualMotion',repo/'Taierzhuang1938/_blender/Script_VerifyType94Sweep.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);motion=module.VerifyScene(scene,path,{'DriverRoof':dict(gunElevationDegrees=12,basis='Retained modeled interlock')},cabinEnvelope=envelope)
def Tree(parts):
    vertices=[];faces=[];owners=[]
    for obj in parts:
        if obj.type!='MESH':continue
        offset=len(vertices);vertices.extend(obj.matrix_world@v.co for v in obj.data.vertices)
        for face in obj.data.polygons:faces.append([offset+i for i in face.vertices]);owners.append(obj.name)
    return BVHTree.FromPolygons(vertices,faces),owners
gate=bpy.data.objects['TowLatchFront'];moving=set(gate.children_recursive);fixed,owners=Tree(meshes-moving);rest=gate.matrix_basis.copy();rows=[]
for degrees in np.linspace(0,55,56):
    gate.matrix_basis=rest@Matrix.Rotation(float(np.deg2rad(degrees)),4,'X');bpy.context.view_layer.update();tree,_=Tree(moving);pairs=tree.overlap(fixed);rows.append(dict(degrees=float(degrees),pairs=len(pairs),fixedOwners=sorted({owners[i]for i,j in pairs})))
gate.matrix_basis=rest;bpy.context.view_layer.update();tree,_=Tree(moving);rays=[]
for name,x,expected in [('Window',0,True),('LeftBar',-.011,False),('RightBar',.011,False)]:
    origin=gate.matrix_world@Vector((x,.2,-.0145));direction=gate.matrix_world.to_3x3()@Vector((0,-1,0));hit=tree.ray_cast(origin,direction,.4);rays.append(dict(name=name,actualOpen=hit[0]is None,expectedOpen=expected,passed=(hit[0]is None)==expected))
report=dict(passed=motion['passed']and all(r['pairs']==0 for r in rows)and all(r['passed']for r in rays),sha256=m['sha256'],vehicle=motion,gateSweep=rows,gateContactExclusionM=0,windowRays=rays,actualMeshOwners=len(meshes),actualPoseNodes=len(objects),geometryOnly=geometryOnly,wholeReferenceAccepted=False)
(acc/('Data_GameMotionGeometryV103.json'if geometryOnly else'Data_ActualGameMotionV103.json')).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(passed=report['passed'],failedVehicle=[r for r in motion['checks']if not r['passed']],failedGate=[r for r in rows if r['pairs']],windowRays=rays)),flush=True);assert report['passed']
