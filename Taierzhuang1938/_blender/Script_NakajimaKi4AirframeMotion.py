"""80 actual high-GLB samples: 62 single pivots and 18 coupled states.

Run after AirframeCheck imports the hash-bound GLB. These finite samples do
not replace the game-derivative sweep or prove every continuous angle.
"""
import bpy,pathlib,json,hashlib,ast,re,math
from mathutils import Vector,Quaternion
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri
scriptPath=pathlib.Path(globals().get('__file__','Taierzhuang1938/_blender/Script_NakajimaKi4AirframeMotion.py')).resolve();repo=scriptPath.parents[2];asset=repo/'tmp/NakajimaKi4/ReferenceV47_AirframeJoint';a=json.loads((asset/'Evidence/Data_WholeAirframeAuthor.json').read_text(encoding='utf8'));prior=json.loads((asset/'Evidence/Data_AirframeReopenedCheck.json').read_text(encoding='utf8'));assert prior['pbrExportSha256']==a['pbrExportSha256'];assert hashlib.sha256(pathlib.Path(a['pbrExportPath']).read_bytes()).hexdigest()==a['pbrExportSha256']
roots=[obj for obj in bpy.data.objects if obj.type=='EMPTY'and obj.get('version')==a['version']and obj.name!='NakajimaKi4'];assert len(roots)==1;root=roots[0];new=list(root.children_recursive)+[root]
def BaseName(obj):
    base,separator,suffix=obj.name.rpartition('.')
    return base if separator and len(suffix)==3 and suffix.isdecimal() else obj.name

def HasPivotAncestor(obj):
    node=obj.parent
    while node:
        if BaseName(node).startswith('Pivot_'):return True
        node=node.parent
    return False
def Tree(objects):
    points=[];faces=[]
    for obj in objects:
        obj.data.calc_loop_triangles();offset=len(points);points.extend(obj.matrix_world@v.co for v in obj.data.vertices);faces.extend(tuple(offset+i for i in t.vertices)for t in obj.data.loop_triangles)
    return{'vertices':points,'faces':faces,'bvh':BVHTree.FromPolygons(points,faces,epsilon=0)}
tree=ast.parse(scriptPath.with_name('Script_NakajimaKi4Audit.py').read_text(encoding='utf8'))
for name in['TrianglePenetrates','Intersections']:
    node=next(n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name==name);exec(compile(ast.Module(body=[node],type_ignores=[]),str(scriptPath),'exec'),globals())
pivots={BaseName(obj):obj for obj in new if BaseName(obj).startswith('Pivot_')};assert len(pivots)==10
static=Tree([obj for obj in new if obj.type=='MESH'and not HasPivotAncestor(obj)]);motion=[];snapshots={obj:(obj.rotation_mode,obj.matrix_basis.copy())for obj in pivots.values()}
for name,obj in sorted(pivots.items()):
    obj.rotation_mode='QUATERNION';rest=obj.rotation_quaternion.copy();center=obj.matrix_world.translation.copy();children=[o for o in obj.children_recursive if o.type=='MESH'];initial=[o.matrix_world@v.co for o in children for v in o.data.vertices];radii=[(p-center).length for p in initial]
    axis=Vector((0,0,1))if name in['Pivot_ObserverYaw','Pivot_Rudder']else Vector((-1,0,0))if name=='Pivot_ObserverGunElevation'else Vector((0,1,0))if name=='Pivot_Propeller'else Vector((1,0,0))
    angles=[-15,-7.5,0,7.5,15]if name=='Pivot_ObserverYaw'else[-10,-5,0,5,10]if name=='Pivot_ObserverGunElevation'else range(0,361,45)if any(x in name for x in['Wheel','Propeller'])else[-18,-9,0,9,18]if'Aileron'in name else[-25,-12.5,0,12.5,25]
    for angle in angles:
        obj.rotation_quaternion=rest@Quaternion(axis,math.radians(angle));bpy.context.view_layer.update();actual=[o.matrix_world@v.co for o in children for v in o.data.vertices];drift=max(abs((p-center).length-r)for p,r in zip(actual,radii));pivotDrift=(obj.matrix_world.translation-center).length
        obstacle=Tree([o for o in new if o.type=='MESH'and o not in set(children)])if name=='Pivot_ObserverGunElevation'else static
        count,candidates=Intersections(Tree(children),obstacle)if'Wheel'not in name else(None,None)
        motion.append({'pivot':name,'angleDegrees':angle,'radialDriftM':drift,'pivotDriftM':pivotDrift,'staticTriangleIntersections':count,'candidates':candidates});assert drift<1e-5 and pivotDrift<1e-6
    obj.rotation_quaternion=rest;bpy.context.view_layer.update()
combined=[];r=pivots['Pivot_Rudder'];es=[pivots['Pivot_Elevator'+s]for s in['Left','Right']];rr=r.rotation_quaternion.copy();er=[p.rotation_quaternion.copy()for p in es]
for ra in[-25,0,25]:
    for ea in[-25,0,25]:
        r.rotation_quaternion=rr@Quaternion(Vector((0,0,1)),math.radians(ra))
        for p,q in zip(es,er):p.rotation_quaternion=q@Quaternion(Vector((1,0,0)),math.radians(ea))
        bpy.context.view_layer.update();count,candidates=Intersections(Tree([o for o in r.children_recursive if o.type=='MESH']),Tree([o for p in es for o in p.children_recursive if o.type=='MESH']));combined.append({'rudderDegrees':ra,'elevatorDegrees':ea,'triangleIntersections':count,'candidates':candidates})
r.rotation_quaternion=rr
for p,q in zip(es,er):p.rotation_quaternion=q
bpy.context.view_layer.update();observer=[];yaw=pivots['Pivot_ObserverYaw'];gun=pivots['Pivot_ObserverGunElevation'];yr=yaw.rotation_quaternion.copy();gr=gun.rotation_quaternion.copy()
for ya in[-15,0,15]:
    for ga in[-10,0,10]:
        yaw.rotation_quaternion=yr@Quaternion(Vector((0,0,1)),math.radians(ya));gun.rotation_quaternion=gr@Quaternion(Vector((-1,0,0)),math.radians(ga));bpy.context.view_layer.update();ym=[o for o in yaw.children_recursive if o.type=='MESH'];gm=[o for o in gun.children_recursive if o.type=='MESH'];one,_=Intersections(Tree(ym),static);two,_=Intersections(Tree(gm),Tree([o for o in new if o.type=='MESH'and o not in set(gm)]));observer.append({'yawDegrees':ya,'elevationDegrees':ga,'staticTriangleIntersections':one,'gunObstacleTriangleIntersections':two})
for obj,(mode,matrix)in snapshots.items():obj.rotation_mode=mode;obj.matrix_basis=matrix
bpy.context.view_layer.update();assert len(motion)+len(combined)+len(observer)==80
proof={'state':'ActualV47HighGlb80MotionSamplesMeasured','sourceSha256':a['sourceSha256'],'pbrExportSha256':a['pbrExportSha256'],'singlePivotSamples':motion,'coupledTailSamples':combined,'coupledObserverSamples':observer,'totalSamples':80,'wheelStaticContactIntersectionsIntentionallyNotTested':True,'scope':'Actual high artifact finite samples using the existing strict triangle predicate; game derivative, service apertures and continuous motion still require final checks.'};(asset/'Evidence/Data_HighMotion80.json').write_text(json.dumps(proof,indent=2),encoding='utf8');failed=[x for x in motion if x['staticTriangleIntersections']]+[x for x in combined if x['triangleIntersections']]+[x for x in observer if x['staticTriangleIntersections']or x['gunObstacleTriangleIntersections']];print(json.dumps({'total':80,'failed':failed}));assert not failed
