"""Measure V47 source tail combinations and cowl/engine geometry, read-only."""
import bpy, pathlib, json, hashlib, ast, math
from mathutils import Vector, Quaternion
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri
scriptPath=pathlib.Path(globals().get('__file__','Taierzhuang1938/_blender/Script_NakajimaKi4AirframeClearance.py')).resolve();repo=scriptPath.parents[2]
asset=repo/'tmp/NakajimaKi4/ReferenceV47_AirframeJoint';a=json.loads((asset/'Evidence/Data_WholeAirframeAuthor.json').read_text(encoding='utf8'));source=pathlib.Path(a['sourcePath'])
assert hashlib.sha256(source.read_bytes()).hexdigest()==a['sourceSha256'];bpy.ops.wm.open_mainfile(filepath=str(source))
tree=ast.parse(scriptPath.with_name('Script_NakajimaKi4Audit.py').read_text(encoding='utf8'))
for name in ['TrianglePenetrates','Intersections']:
    node=next(n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name==name);exec(compile(ast.Module(body=[node],type_ignores=[]),str(scriptPath),'exec'),globals())
def Tree(objects):
    points=[];faces=[];graph=bpy.context.evaluated_depsgraph_get()
    for obj in objects:
        evaluated=obj.evaluated_get(graph);mesh=evaluated.to_mesh();mesh.calc_loop_triangles();offset=len(points);points.extend(evaluated.matrix_world@v.co for v in mesh.vertices);faces.extend(tuple(offset+i for i in t.vertices)for t in mesh.loop_triangles);evaluated.to_mesh_clear()
    return{'vertices':points,'faces':faces,'bvh':BVHTree.FromPolygons(points,faces,epsilon=0)}
root=bpy.data.objects['NakajimaKi4'];objects=list(root.children_recursive);r=bpy.data.objects['Pivot_Rudder'];e=[bpy.data.objects['Pivot_Elevator'+s]for s in['Left','Right']];rest={o:o.matrix_basis.copy()for o in[r]+e};modes={o:o.rotation_mode for o in[r]+e};static=Tree([bpy.data.objects[n]for n in['Tailplane_Left','Tailplane_Right','TailplaneBrace_Left','TailplaneBrace_Right','Fuselage_Monocoque','VerticalFin']]);rows=[]
for ra in[-25,0,25]:
    for ea in[-25,0,25]:
        r.rotation_mode='QUATERNION';r.rotation_quaternion=rest[r].to_quaternion()@Quaternion(Vector((0,0,1)),math.radians(ra))
        for o in e:o.rotation_mode='QUATERNION';o.rotation_quaternion=rest[o].to_quaternion()@Quaternion(Vector((1,0,0)),math.radians(ea))
        bpy.context.view_layer.update();rt=Tree([o for o in r.children_recursive if o.type=='MESH']);et=Tree([o for p in e for o in p.children_recursive if o.type=='MESH']);re,rc=Intersections(rt,et);es,ec=Intersections(et,static);rows.append({'rudderDegrees':ra,'elevatorDegrees':ea,'rudderElevatorIntersections':re,'elevatorStaticIntersections':es,'candidates':rc+ec})
for o in[r]+e:o.rotation_mode=modes[o];o.matrix_basis=rest[o]
bpy.context.view_layer.update();engine=[o for o in objects if o.type=='MESH'and o.name.startswith(('Engine_Cylinder','CylinderCoolingFin','RockerCover','Pushrod'))];cowl=Tree([bpy.data.objects['Cowl_AnnularRing']]);engineTree=Tree(engine);ci,cc=Intersections(cowl,engineTree)
record={'state':'ActualV47SourceClearanceMeasured','sourceSha256':a['sourceSha256'],'tailNineCombinations':rows,'cowlEngineIntersections':ci,'cowlEngineCandidates':cc,'engineComponents':len(engine),'sourceNeverSaved':True};(asset/'Evidence/Data_AirframeSourceClearance.json').write_text(json.dumps(record,indent=2),encoding='utf8');assert hashlib.sha256(source.read_bytes()).hexdigest()==a['sourceSha256'];print(json.dumps(record));assert ci==0 and all(row['rudderElevatorIntersections']==0 and row['elevatorStaticIntersections']==0 for row in rows)
