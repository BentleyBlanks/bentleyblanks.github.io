"""Verify exposed pectoral crossings on the delivered bare-donkey GLB.

Run through Script_BlenderMcp.mjs --batch, or from the rebuild driver.
This preserves the current scene and never uses fur to hide body crossings.
"""
import bpy,json,hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri,barycentric_transform
def Crossings(positions,triangles):
 points=[Vector(p) for p in positions];tree=BVHTree.FromPolygons(points,triangles,all_triangles=True);keys={};ids=[]
 for p in points:
  key=tuple(round(float(v),7) for v in p)
  if key not in keys:keys[key]=len(keys)
  ids.append(keys[key])
 def Region(p):return abs(p.x)<.20 and .54<p.y<.99 and .59<p.z<.98
 def Cross(a,b):
  for p,q in zip(a,a[1:]+a[:1]):
   d=q-p;hit=intersect_ray_tri(*b,d,p,True)
   if hit is None:continue
   t=(hit-p).dot(d)/max(1e-15,d.length_squared)
   if not 1e-4<t<1-1e-4:continue
   bary=barycentric_transform(hit,*b,Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1)))
   if min(bary)>1e-4:return hit
  return None
 examples=[];count=0;unique={};pairs=[]
 for i,j in tree.overlap(tree):
  if i>=j:continue
  a,b=triangles[i],triangles[j]
  if len({ids[k] for k in a}&{ids[k] for k in b})>=2:continue
  pa=[points[k] for k in a];pb=[points[k] for k in b]
  if not any(Region(p) for p in pa+pb):continue
  hit=Cross(pa,pb) or Cross(pb,pa)
  if hit is not None and Region(hit):
   count+=1
   pairs.append({'triangles':[i,j],'point':list(hit)})
   unique.setdefault(tuple(round(float(v),6) for v in hit),hit)
   if len(examples)<6:examples.append(list(hit))
 directions=[Vector(d).normalized() for d in [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1),(1,1,.25),(-1,1,.25),(1,-1,.25),(-1,-1,.25),(1,1,1),(-1,1,1),(1,-1,1),(-1,-1,1)]]
 visible=[];depthTolerance=.00025
 for point in unique.values():
  views=[]
  for view,direction in enumerate(directions):
   first,_,_,distance=tree.ray_cast(point+direction*4,-direction,4.01)
   if first is None or distance>=4-depthTolerance:views.append(view)
  if views:visible.append({'point':list(point),'views':views})
 return {'crossings':count,'uniqueIntersectionPoints':len(unique),'potentiallyVisibleUniqueCrossings':len(visible),'visibilityToleranceM':depthTolerance,'visibilityScope':'opaque body depth in 14 axial/quarter directions; fur occlusion ignored','visibleExamples':visible[:8],'pairs':pairs,'examples':examples}


def VerifyCurrentDonkey():
    scene=bpy.context.scene
    project=Path(scene['DonkeyCartProject']) if scene.get('DonkeyCartProject') else Path(__file__).resolve().parents[1]
    base=Path(scene['DonkeySourceRoot']) if scene.get('DonkeySourceRoot') else Path(json.loads((project/'Model/Donkey/Data_Donkey.json').read_text(encoding='utf-8'))['editableSource']).parent
    asset=project/'Model/Donkey/Model_Donkey.glb';before=set(bpy.data.objects);oldFrame=scene.frame_current
    bpy.ops.import_scene.gltf(filepath=str(asset));imported=set(bpy.data.objects)-before
    rig=next(o for o in imported if o.type=='ARMATURE');body=next(o for o in imported if o.type=='MESH' and o.name.startswith('DonkeyRuntime'))
    rig.data.pose_position='POSE';rig.animation_data.action=None;rig.animation_data.use_nla=True
    for track in rig.animation_data.nla_tracks:track.mute=True
    body.data.calc_loop_triangles();triangles=[list(t.vertices) for t in body.data.loop_triangles];poses=[]
    def Check():
        bpy.context.view_layer.update();evaluated=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh()
        points=[]
        for vertex in mesh.vertices:
            p=evaluated.matrix_world@vertex.co;points.append((p.x,p.y+.215,p.z))
        result=Crossings(points,triangles);evaluated.to_mesh_clear();return result
    try:
        rig.data.pose_position='REST';rest=Check();rig.data.pose_position='POSE'
        for mode,count in [('Walk',144),('Idle',36)]:
            strip=next(t.strips[0] for t in rig.animation_data.nla_tracks if 'Donkey'+mode in t.name);rig.animation_data.action=strip.action
            if strip.action_slot:rig.animation_data.action_slot=strip.action_slot
            for index in range(count+1):
                phase=index/count;frame=strip.action_frame_start+(strip.action_frame_end-strip.action_frame_start)*phase
                scene.frame_set(int(frame),subframe=frame-int(frame));result=Check()
                poses.append({'mode':mode,'phase':phase,'crossings':result['crossings'],'potentiallyVisibleUniqueCrossings':result['potentiallyVisibleUniqueCrossings'],'visibleExamples':result['visibleExamples']})
        visible=max(p['potentiallyVisibleUniqueCrossings'] for p in poses)
        report={'assetSha256':hashlib.sha256(asset.read_bytes()).hexdigest(),'walkSamples':145,'idleSamples':37,'visibilityDirections':14,'visibilityToleranceM':.00025,'furOcclusionIgnored':True,'restCrossings':rest['crossings'],'maximumVisibleCrossings':visible,'poses':poses,'pass':rest['crossings']==0 and visible==0}
        (base/'Review/Data_PectoralMotionIntegrity.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({k:v for k,v in report.items() if k!='poses'}))
        if not report['pass']:raise RuntimeError('Delivered donkey has exposed pectoral crossings')
        return report
    finally:
        for obj in imported:bpy.data.objects.remove(obj,do_unlink=True)
        scene.frame_set(oldFrame);bpy.context.view_layer.update()

if __name__=='__main__' or globals().get('DonkeyAssetName')=='Donkey':
    VerifyCurrentDonkey()
