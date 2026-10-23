"""Reopen the saved source, then import the actual GLB and sweep its real hinges.
Run on this task's BlenderMCP instance, with the saved source freshly opened.
Evidence is external and never committed. No source file is overwritten.
"""
import bpy,json,pathlib,math,re,hashlib
from mathutils import Vector,Quaternion
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri
sourceRoot=pathlib.Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4')
repoRoot=pathlib.Path(globals().get('__file__','Taierzhuang1938/_blender/Script_NakajimaKi4Audit.py')).resolve().parents[2]
output=sourceRoot/'Evidence'
assert pathlib.Path(bpy.data.filepath).resolve()==(sourceRoot/'Scene_NakajimaKi4.blend').resolve(), 'Open the saved source first'
assert bpy.context.scene.get('BlenderMcpTask')=='NakajimaKi4'
assert bpy.context.scene.unit_settings.scale_length==1
source=bpy.data.objects.get('NakajimaKi4');assert source
sourcePivots=[o for o in source.children_recursive if o.name.startswith('Pivot_')]
assert len(sourcePivots)==8 and all(p.children for p in sourcePivots)
packed=[i for i in bpy.data.images if i.packed_file]
assert len(packed)==24, 'All authored PBR images must be packed in editable source'
sourceInfo={'file':bpy.data.filepath,'packedImages':len(packed),'objects':len(source.children_recursive),'meshes':sum(o.type=='MESH' for o in source.children_recursive),'curves':sum(o.type=='CURVE' for o in source.children_recursive),'pivots':[o.name for o in sourcePivots],'reopened':True}
before=set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(repoRoot/'Taierzhuang1938/Model/NakajimaKi4/Model_NakajimaKi4.glb'))
new=set(bpy.data.objects)-before
def BaseName(o):return re.sub(r'\.\d{3}$','',o.name)
gameRoot=next(o for o in new if BaseName(o)=='NakajimaKi4')
nodes={BaseName(o):o for o in new};pivots={n:o for n,o in nodes.items() if n.startswith('Pivot_')}
assert len(pivots)==8
bpy.context.view_layer.update()
points=[o.matrix_world@v.co for o in new if o.type=='MESH' for v in o.data.vertices]
minimum=[min(v[i] for v in points) for i in range(3)];maximum=[max(v[i] for v in points) for i in range(3)]
dimensions=[maximum[i]-minimum[i] for i in range(3)]
assert abs(dimensions[0]-12)<.002
assert abs(dimensions[1]-8.25)<.05
assert abs(dimensions[2]-3.31)<.04
propPos=pivots['Pivot_Propeller'].matrix_world.translation
rudderPos=pivots['Pivot_Rudder'].matrix_world.translation
assert propPos.y>rudderPos.y+7, 'Reimported mesh nose must point Blender +Y / glTF -Z'
def HasPivotAncestor(obj):
    parent=obj.parent
    while parent:
        if parent in pivots.values():return True
        parent=parent.parent
    return False
static=[o for o in new if o.type=='MESH' and not HasPivotAncestor(o)]
def Tree(objects):
    vv=[];ff=[]
    for obj in objects:
        offset=len(vv);vv.extend(obj.matrix_world@v.co for v in obj.data.vertices)
        ff.extend(tuple(offset+i for i in p.vertices) for p in obj.data.polygons)
    assert all(len(f)==3 for f in ff), 'Audit the actual triangulated GLB'
    return {'bvh':BVHTree.FromPolygons(vv,ff,epsilon=0),'vertices':vv,'faces':ff}
def TrianglePenetrates(a,b):
    eps=.0000002
    na=(a[1]-a[0]).cross(a[2]-a[0]);nb=(b[1]-b[0]).cross(b[2]-b[0])
    if na.length<eps*eps or nb.length<eps*eps:return False
    na.normalize();nb.normalize()
    da=[(p-b[0]).dot(nb) for p in a];db=[(p-a[0]).dot(na) for p in b]
    if min(da)>eps or max(da)<-eps or min(db)>eps or max(db)<-eps:return False
    if max(abs(d) for d in da)<eps and max(abs(d) for d in db)<eps:
        # Coplanar triangles: require positive projected overlap, not a shared edge.
        for tri in [a,b]:
            for i in range(3):
                axis=na.cross(tri[(i+1)%3]-tri[i]);axis.normalize()
                pa=[p.dot(axis) for p in a];pb=[p.dot(axis) for p in b]
                if min(max(pa),max(pb))-max(min(pa),min(pb))<=eps:return False
        return True
    for edges,tri in [(a,b),(b,a)]:
        for i in range(3):
            start=edges[i];delta=edges[(i+1)%3]-start
            if delta.length_squared<eps*eps:continue
            hit=intersect_ray_tri(tri[0],tri[1],tri[2],delta,start,True)
            if hit is None:continue
            t=(hit-start).dot(delta)/delta.length_squared
            if eps<t<1-eps:return True
    return False
def Intersections(a,b):
    candidates=a['bvh'].overlap(b['bvh']);count=0
    for i,j in candidates:
        aa=[a['vertices'][k] for k in a['faces'][i]];bb=[b['vertices'][k] for k in b['faces'][j]]
        if TrianglePenetrates(aa,bb):count+=1
    return count,len(candidates)
staticTree=Tree(static)
motion=[]
for name,p in sorted(pivots.items()):
    p.rotation_mode='QUATERNION';rest=p.rotation_quaternion.copy();center=p.matrix_world.translation.copy()
    meshChildren=[o for o in p.children_recursive if o.type=='MESH'];assert meshChildren
    axis=Vector((1,0,0)) if any(w in name for w in ['Aileron','Elevator','Wheel']) else Vector((0,0,1)) if 'Rudder' in name else Vector((0,1,0))
    initial=[o.matrix_world@v.co for o in meshChildren for v in o.data.vertices]
    radii=[(v-center).length for v in initial]
    angles=range(0,361,45) if any(w in name for w in ['Wheel','Propeller']) else [-18,-9,0,9,18] if 'Aileron' in name else [-25,-12.5,0,12.5,25]
    for angle in angles:
        p.rotation_quaternion=rest@Quaternion(axis,math.radians(angle));bpy.context.view_layer.update()
        actual=[o.matrix_world@v.co for o in meshChildren for v in o.data.vertices]
        drift=max(abs((v-center).length-r) for v,r in zip(actual,radii))
        pivotDrift=(p.matrix_world.translation-center).length
        assert drift<.00001 and pivotDrift<.000001, name+' must be rigid about its real hinge'
        collisions,candidates=Intersections(Tree(meshChildren),staticTree) if 'Wheel' not in name else (None,None)
        motion.append({'pivot':name,'angleDegrees':angle,'maxRadialDriftM':drift,'pivotDriftM':pivotDrift,'staticTriangleIntersections':collisions,'staticBvhCandidates':candidates})
    p.rotation_quaternion=rest;bpy.context.view_layer.update()
report={'source':sourceInfo,'sourceSha256':hashlib.sha256((sourceRoot/'Scene_NakajimaKi4.blend').read_bytes()).hexdigest(),'runtimeSha256':hashlib.sha256((repoRoot/'Taierzhuang1938/Model/NakajimaKi4/Model_NakajimaKi4.glb').read_bytes()).hexdigest(),'actualGlbReimport':True,'gameMeshes':sum(o.type=='MESH' for o in new),'dimensionsBlenderXyzM':dimensions,'boundsBlenderXyzM':[minimum,maximum],'propellerCenterBlenderM':list(propPos),'rudderCenterBlenderM':list(rudderPos),'motion':motion,'wheelRadiusM':pivots['Pivot_WheelLeft'].get('rollingRadiusM')}
combined=[]
rudder=pivots['Pivot_Rudder'];rudderRest=rudder.rotation_quaternion.copy()
elevators=[pivots['Pivot_ElevatorLeft'],pivots['Pivot_ElevatorRight']];elevatorRest=[p.rotation_quaternion.copy() for p in elevators]
for rudderAngle in [-25,0,25]:
    for elevatorAngle in [-25,0,25]:
        rudder.rotation_quaternion=rudderRest@Quaternion(Vector((0,0,1)),math.radians(rudderAngle))
        for p,q in zip(elevators,elevatorRest):p.rotation_quaternion=q@Quaternion(Vector((1,0,0)),math.radians(elevatorAngle))
        bpy.context.view_layer.update()
        count,candidates=Intersections(Tree([o for o in rudder.children_recursive if o.type=='MESH']),Tree([o for p in elevators for o in p.children_recursive if o.type=='MESH']))
        combined.append({'rudderDegrees':rudderAngle,'elevatorDegrees':elevatorAngle,'triangleIntersections':count,'bvhCandidates':candidates})
rudder.rotation_quaternion=rudderRest
for p,q in zip(elevators,elevatorRest):p.rotation_quaternion=q
bpy.context.view_layer.update();report['combinedControlPoses']=combined
(output/'Data_ReopenAndMotionAudit.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps({'source':sourceInfo,'gameMeshes':report['gameMeshes'],'dimensionsM':dimensions,'motionPoses':len(motion),'intersections':[(r['pivot'],r['angleDegrees'],r['staticTriangleIntersections']) for r in motion if r['staticTriangleIntersections']]}))
assert not any(r['staticTriangleIntersections'] for r in motion), 'A rotating component intersects fixed geometry'
assert not any(r['triangleIntersections'] for r in combined), 'Rudder and elevator intersect in combined extreme poses'
