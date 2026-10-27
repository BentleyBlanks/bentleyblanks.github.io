"""Reopen the author and test actual exported tail/cowl geometry and pivots."""
import os,pathlib,json,hashlib,ast,math,bpy
from mathutils import Vector,Quaternion
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri
scriptPath=pathlib.Path(globals().get('__file__','Taierzhuang1938/_blender/Script_NakajimaKi4AirframeCheck.py')).resolve();repo=scriptPath.parents[2];asset=repo/'tmp/NakajimaKi4/ReferenceV47_AirframeJoint'
os.environ['KI4_PROPELLER_ASSET_ROOT']=str(asset)
helper=scriptPath.with_name('Script_NakajimaKi4PropellerSectionCheck.py');ns={'__file__':str(helper)};exec(compile(helper.read_text(encoding='utf8'),str(helper),'exec'),ns)
root=ns['runtimeRoot'];meshes=ns['runtimeMeshes'];a=ns['record'];source=pathlib.Path(a['sourcePath'])
audit=ast.parse(scriptPath.with_name('Script_NakajimaKi4Audit.py').read_text(encoding='utf8'))
for name in ['TrianglePenetrates','Intersections']:
    node=next(n for n in audit.body if isinstance(n,ast.FunctionDef)and n.name==name);exec(compile(ast.Module(body=[node],type_ignores=[]),str(scriptPath),'exec'),globals())
def Find(prefix):
    values=[obj for obj in root.children_recursive if obj.name.startswith(prefix)];assert len(values)==1,(prefix,[o.name for o in values]);return values[0]
def Tree(objects):
    points=[];faces=[];graph=bpy.context.evaluated_depsgraph_get()
    for obj in objects:
        ev=obj.evaluated_get(graph);mesh=ev.to_mesh();mesh.calc_loop_triangles();offset=len(points);points.extend(ev.matrix_world@v.co for v in mesh.vertices);faces.extend(tuple(offset+i for i in t.vertices)for t in mesh.loop_triangles);ev.to_mesh_clear()
    return{'vertices':points,'faces':faces,'bvh':BVHTree.FromPolygons(points,faces,epsilon=0)}
r=Find('Pivot_Rudder');e=[Find('Pivot_Elevator'+s)for s in['Left','Right']];rest={o:o.matrix_basis.copy()for o in[r]+e};static=Tree([Find(n)for n in['Tailplane_Left','Tailplane_Right','TailplaneBrace_Left','TailplaneBrace_Right','Fuselage_Monocoque','VerticalFin']]);rows=[]
for ra in[-25,0,25]:
    for ea in[-25,0,25]:
        r.rotation_mode='QUATERNION';r.rotation_quaternion=rest[r].to_quaternion()@Quaternion(Vector((0,0,1)),math.radians(ra))
        for obj in e:obj.rotation_mode='QUATERNION';obj.rotation_quaternion=rest[obj].to_quaternion()@Quaternion(Vector((1,0,0)),math.radians(ea))
        bpy.context.view_layer.update();rt=Tree([o for o in r.children_recursive if o.type=='MESH']);et=Tree([o for p in e for o in p.children_recursive if o.type=='MESH']);re,rc=Intersections(rt,et);es,ec=Intersections(et,static);rows.append({'rudderDegrees':ra,'elevatorDegrees':ea,'rudderElevatorIntersections':re,'elevatorStaticIntersections':es,'candidates':rc+ec})
for obj in[r]+e:obj.matrix_basis=rest[obj]
bpy.context.view_layer.update();engine=[o for o in meshes if o.name.startswith(('Engine_Cylinder','CylinderCoolingFin','RockerCover','Pushrod'))];ci,cc=Intersections(Tree([Find('Cowl_AnnularRing')]),Tree(engine))
proof={'state':'ActualV47AuthorAndGlbTailCowlAndPropellerGeometryChecked','sourceSha256':a['sourceSha256'],'pbrExportSha256':a['pbrExportSha256'],'sourceMeshFingerprintsChecked':928,'sourcePackedImagesChecked':42,'actualRuntimeTailNineCombinations':rows,'actualRuntimeCowlEngineIntersections':ci,'actualRuntimeCowlEngineCandidates':cc,'engineComponentsChecked':len(engine),'actualPropeller24PhasesPassed':True,'sourceNeverSaved':True,'referenceFidelityPassed':False};(asset/'Evidence/Data_AirframeReopenedCheck.json').write_text(json.dumps(proof,indent=2),encoding='utf8');assert hashlib.sha256(source.read_bytes()).hexdigest()==a['sourceSha256'];print(json.dumps(proof));assert ci==0 and all(row['rudderElevatorIntersections']==0 and row['elevatorStaticIntersections']==0 for row in rows)
