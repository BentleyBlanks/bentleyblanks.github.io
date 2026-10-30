"""Verify continuous root, real window, saved-source parity and actual motion."""
import bpy,bmesh,hashlib,importlib.util,json,math,numpy as np
from pathlib import Path
from mathutils import Matrix,Vector
from mathutils.bvhtree import BVHTree
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=base/'TowShoulderV95'
m=json.loads((root/'Acceptance/Data_TowShoulderIdentityV95.json').read_text());layout=json.loads(Path(m['layoutFile']).read_text());assert not bpy.data.filepath
assert hashlib.sha256(Path(m['sourceBlend']).read_bytes()).hexdigest()==m['sourceBlendSha256']
bpy.ops.wm.open_mainfile(filepath=m['sourceBlend']);asset=bpy.data.objects['Type94Tankette'];fixedMesh=bpy.data.objects['Geometry_TowHookFrontFixed_Paint']
for file in [repo/'Taierzhuang1938/_blender/Script_Type94TowShoulderV95.py',Path(m['layoutFile'])]:assert bpy.data.texts[file.name].as_string()==file.read_text()
group=fixedMesh.vertex_groups['Tow_HookRootContinuousV95'].index;source=fixedMesh.data
used=sorted(v.index for v in source.vertices if any(g.group==group and g.weight>.5 for g in v.groups));mapping={v:i for i,v in enumerate(used)}
points=[source.vertices[i].co.copy()for i in used];faces=[[mapping[i]for i in f.vertices]for f in source.polygons if all(i in mapping for i in f.vertices)]
body=bpy.data.meshes.new('Audit_ContinuousHookV95');body.from_pydata(points,[],faces);body.update();body.calc_loop_triangles()
bm=bmesh.new();bm.from_mesh(body);nonmanifold=sum(not edge.is_manifold for edge in bm.edges);euler=len(bm.verts)-len(bm.edges)+len(bm.faces);volume=bm.calc_volume(signed=True)
unseen=set(bm.verts);components=0
while unseen:
    components+=1;pending=[unseen.pop()]
    while pending:
        vertex=pending.pop()
        for edge in vertex.link_edges:
            other=edge.other_vert(vertex)
            if other in unseen:unseen.remove(other);pending.append(other)
bm.free()
triangles=[tuple(t.vertices)for t in body.loop_triangles];tree=BVHTree.FromPolygons(points,triangles,all_triangles=True)
intersections=[(a,b)for a,b in tree.overlap(tree)if a<b and not set(triangles[a]).intersection(triangles[b])]
quality=dict(passed=components==1 and nonmanifold==0 and euler==2 and volume>1e-7 and not intersections,connectedComponents=components,nonmanifoldEdges=nonmanifold,euler=euler,signedVolumeM3=volume,nonAdjacentTriangleIntersections=len(intersections),scope='Actual saved root/base union is one closed genus-zero surface with positive volume and no nonadjacent triangle intersection')
(root/'Acceptance/Data_TowRootQualityV95.json').write_text(json.dumps(quality,indent=2)+'\n');assert quality['passed']
bpy.data.meshes.remove(body)
for obj in [asset,*asset.children_recursive]:obj.select_set(True)
spec=importlib.util.spec_from_file_location('Tow95Reexport',repo/'Taierzhuang1938/_blender/Script_Type94Export.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
reexport=root/'Exports/Model_Type94TanketteHighShapeV95SourceReexport.glb';module.ExportGltf(reexport)
assert hashlib.sha256(Path(m['sourceBlend']).read_bytes()).hexdigest()==m['sourceBlendSha256']
bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;scene['BlenderMcpTask']='Type94Tankette';bpy.ops.import_scene.gltf(filepath=m['sourceGlb']);bpy.context.view_layer.update()
asset=bpy.data.objects['Type94Tankette'];objects=[asset,*asset.children_recursive];meshes=[o for o in objects if o.type=='MESH'];assert len(objects)==295 and len(meshes)==239
gate=bpy.data.objects['TowLatchFront'];fixed=bpy.data.objects['TowHookFrontFixed'];moving=set(gate.children_recursive)
def Tree(parts):
    vertices=[];faces=[]
    for obj in parts:
        if obj.type!='MESH':continue
        offset=len(vertices);vertices.extend(obj.matrix_world@v.co for v in obj.data.vertices);faces.extend([[offset+i for i in f.vertices]for f in obj.data.polygons])
    return BVHTree.FromPolygons(vertices,faces)
gateTree=Tree(moving);axis=gate.matrix_world.to_3x3()@Vector((0,-1,0));windowRows=[]
for name,x,expectedOpen in [('WindowCentre',0,True),('WindowLeftBar',-.011,False),('WindowRightBar',.011,False)]:
    point=gate.matrix_world@Vector((x,.20,layout['windowCentreZM']));hit=gateTree.ray_cast(point,axis,.4)
    windowRows.append(dict(name=name,actualOpen=hit[0]is None,expectedOpen=expectedOpen,passed=(hit[0]is None)==expectedOpen))
assert all(r['passed']for r in windowRows)
throat=fixed.matrix_world@Vector((-.2,.050,-.083));hit=Tree([*fixed.children_recursive,*gate.children_recursive]).ray_cast(throat,fixed.matrix_world.to_3x3()@Vector((1,0,0)),.4);assert hit[0]is None
fixedTree=Tree(set(meshes)-moving);rest=gate.matrix_basis.copy();pin=gate.matrix_world.translation.copy();fixedMatrix=np.asarray(fixed.matrix_world).copy();rows=[]
for degrees in np.linspace(0,55,56):
    gate.matrix_basis=rest@Matrix.Rotation(math.radians(float(degrees)),4,'X');bpy.context.view_layer.update();overlap=Tree(moving).overlap(fixedTree)
    rows.append(dict(degrees=float(degrees),trianglePairs=len(overlap),pinDriftM=(gate.matrix_world.translation-pin).length,fixedWorldMatrixDrift=float(abs(np.asarray(fixed.matrix_world)-fixedMatrix).max())))
gate.matrix_basis=rest;bpy.context.view_layer.update();clearance=dict(passed=all(r['trianglePairs']==0 and r['pinDriftM']<1e-8 and r['fixedWorldMatrixDrift']==0 for r in rows),samples=rows,contactExclusionM=0)
(root/'Acceptance/Data_TowGateSweepV95.json').write_text(json.dumps(clearance,indent=2)+'\n');assert clearance['passed']
spec=importlib.util.spec_from_file_location('Tow95Motion',repo/'Taierzhuang1938/_blender/Script_VerifyType94Sweep.py');sweep=importlib.util.module_from_spec(spec);spec.loader.exec_module(sweep)
driver=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_BodyTrialV64.json').read_text())['driver']
envelope=dict(xRangeM=[driver['centerXM']-driver['widthM']/2-.10,driver['centerXM']+driver['widthM']/2+.10],forwardRangeM=[driver['topForwardM']-.283-.10,driver['bottomForwardM']+.10],minimumHeightM=driver['bottomZM']-.015)
path=json.loads((base/'DetailV64/Acceptance/Data_MechanismShapeV64FrontDetailTrial.json').read_text())['path']
motion=sweep.VerifyScene(scene,path,{'DriverRoof':dict(gunElevationDegrees=12,basis='Retained modeled interlock')},cabinEnvelope=envelope)
(root/'Acceptance/Data_TowVehicleMotionV95.json').write_text(json.dumps(motion,indent=2)+'\n');assert motion['passed']
report=dict(passed=True,sourceBlendSha256=m['sourceBlendSha256'],sha256=m['sha256'],sourceReexportSha256=hashlib.sha256(reexport.read_bytes()).hexdigest(),sourceReadOnly=True,actualGlbImported=True,sourceAuthoringTextsExact=True,meshOwners=239,poseNodes=295,rootQuality=quality,actualWindowRays=windowRows,actualHookThroatOpen=True,gateSweepSamples=56,gateContactExclusionM=0,vehicleMotionChecks=len(motion['checks']),wholeReferenceAccepted=False)
(root/'Acceptance/Data_TowNativeV95.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
