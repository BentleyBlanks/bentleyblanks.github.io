"""Verify exposed pectoral crossings on the delivered bare-donkey GLB.

Run through Script_BlenderMcp.mjs --batch, or from the rebuild driver.
This preserves the current scene and never uses fur to hide body crossings.
"""
import bpy,json,hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri,barycentric_transform
def Crossings(positions,triangles,region='Pectoral',allowContact=None):
 points=[Vector(p) for p in positions];tree=BVHTree.FromPolygons(points,triangles,all_triangles=True);keys={};ids=[]
 for p in points:
  key=tuple(round(float(v),7) for v in p)
  if key not in keys:keys[key]=len(keys)
  ids.append(keys[key])
 def Region(p):
  if region=='LowerBody':return abs(p.x)<.30 and -.65<p.y<1.08 and .095<p.z<1.10
  if region=='Hind':return abs(p.x)<.28 and -.65<p.y<.45 and .105<p.z<1.05
  return abs(p.x)<.20 and .54<p.y<.99 and .59<p.z<.98
 def Cross(a,b):
  for p,q in zip(a,a[1:]+a[:1]):
   d=q-p;hit=intersect_ray_tri(*b,d,p,True)
   if hit is None:continue
   t=(hit-p).dot(d)/max(1e-15,d.length_squared)
   if not 1e-4<t<1-1e-4:continue
   bary=barycentric_transform(hit,*b,Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1)))
   if min(bary)>1e-4:return hit
  return None
 examples=[];count=0;unique={};pairs=[];permittedContacts=[]
 for i,j in tree.overlap(tree):
  if i>=j:continue
  a,b=triangles[i],triangles[j]
  if len({ids[k] for k in a}&{ids[k] for k in b})>=2:continue
  pa=[points[k] for k in a];pb=[points[k] for k in b]
  if not any(Region(p) for p in pa+pb):continue
  hit=Cross(pa,pb) or Cross(pb,pa)
  if hit is not None and Region(hit):
   if allowContact is not None and allowContact(i,j,hit):
    permittedContacts.append({'triangles':[i,j],'point':list(hit)});continue
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
 return {'crossings':count,'permittedAttachmentContacts':len(permittedContacts),'attachmentExamples':permittedContacts[:4],'uniqueIntersectionPoints':len(unique),'potentiallyVisibleUniqueCrossings':len(visible),'visibilityToleranceM':depthTolerance,'visibilityScope':'opaque body depth in 14 axial/quarter directions; fur occlusion ignored','visibleExamples':visible[:8],'pairs':pairs,'examples':examples}

def SurfaceComponents(body,triangles):
    keys={};ids=[]
    for v in body.data.vertices:
        key=tuple(round(float(x),7) for x in v.co)
        if key not in keys:keys[key]=len(keys)
        ids.append(keys[key])
    parents=list(range(len(triangles)))
    def Find(i):
        while parents[i]!=i:parents[i]=parents[parents[i]];i=parents[i]
        return i
    edges={}
    for i,tri in enumerate(triangles):
        for a,b in zip(tri,tri[1:]+tri[:1]):
            key=tuple(sorted((ids[a],ids[b])))
            if key in edges:parents[Find(i)]=Find(edges[key])
            else:edges[key]=i
    labels=[Find(i) for i in range(len(triangles))];parts={}
    for i,label in enumerate(labels):parts.setdefault(label,[]).append(i)
    largest=max(parts,key=lambda label:len(parts[label]));tails=set();feathers={}
    for label,faces in parts.items():
        if label==largest:continue
        vertices={i for face in faces for i in triangles[face]}
        masses=[sum(g.weight for g in body.data.vertices[i].groups if body.vertex_groups[g.group].name.startswith('DonkeyTail')) for i in vertices]
        if masses and min(masses)>.95:tails.add(label)
        if len(faces)<=8:
            footNames={body.vertex_groups[g.group].name for i in vertices for g in body.data.vertices[i].groups if body.vertex_groups[g.group].name.endswith('HoofPivot')}
            for foot in footNames:
                weights=[sum(g.weight for g in body.data.vertices[i].groups if body.vertex_groups[g.group].name==foot) for i in vertices]
                points=[body.data.vertices[i].co for i in vertices];diameter=max(((a-b).length for a in points for b in points),default=0)
                if min(weights,default=0)>.85 and diameter<.025:feathers[label]=foot
    return labels,largest,tails,feathers,sorted((len(faces) for faces in parts.values()),reverse=True)


def VerifyCurrentDonkey(region='Pectoral'):
    scene=bpy.context.scene
    project=Path(scene['DonkeyCartProject']) if scene.get('DonkeyCartProject') else Path(__file__).resolve().parents[1]
    base=Path(scene['DonkeySourceRoot']) if scene.get('DonkeySourceRoot') else Path(json.loads((project/'Model/Donkey/Data_Donkey.json').read_text(encoding='utf-8'))['editableSource']).parent
    asset=project/'Model/Donkey/Model_Donkey.glb';before=set(bpy.data.objects);oldFrame=scene.frame_current
    bpy.ops.import_scene.gltf(filepath=str(asset));imported=set(bpy.data.objects)-before
    rig=next(o for o in imported if o.type=='ARMATURE');body=next(o for o in imported if o.type=='MESH' and o.name.startswith('DonkeyRuntime'))
    rig.data.pose_position='POSE';rig.animation_data.action=None;rig.animation_data.use_nla=True
    for track in rig.animation_data.nla_tracks:track.mute=True
    body.data.calc_loop_triangles();triangles=[list(t.vertices) for t in body.data.loop_triangles];poses=[]
    componentProof=None;allowContact=None
    if region in ['Hind','LowerBody']:
        labels,main,tails,feathers,sizes=SurfaceComponents(body,triangles)
        if not sizes or sizes[0]<20000:raise RuntimeError('Continuous body component was not identified')
        def AnatomicalAttachment(i,j,p):
            a,b=labels[i],labels[j]
            if a==b:return False
            if ((a==main and b in tails) or (b==main and a in tails)) and abs(p.x)<.035 and -.20<p.y<-.05 and .88<p.z<1.04:return True
            if a in feathers and b in feathers:return feathers[a]==feathers[b]
            if a==main and b in feathers:face,foot=i,feathers[b]
            elif b==main and a in feathers:face,foot=j,feathers[a]
            else:return False
            mass=sum(sum(g.weight for g in body.data.vertices[v].groups if body.vertex_groups[g.group].name==foot) for v in triangles[face])/3
            return mass>.70
        allowContact=AnatomicalAttachment
        componentProof={'bodyTriangles':sizes[0],'componentTriangleCounts':sizes,'tailComponents':len(tails),'footFeatherComponents':len(feathers),'permittedContact':'separate tail stem within its documented root box, and closed fetlock fur tufts against their own hoof-weighted skin/tufts; all same-surface crossings and all other component contacts remain strict','tailRootBoundsM':{'absX':.035,'y':[-.20,-.05],'z':[.88,1.04]}}
    def Check():
        bpy.context.view_layer.update();evaluated=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh()
        points=[]
        for vertex in mesh.vertices:
            p=evaluated.matrix_world@vertex.co;points.append((p.x,p.y+.215,p.z))
        result=Crossings(points,triangles,region,allowContact);evaluated.to_mesh_clear();return result
    try:
        rig.data.pose_position='REST';rest=Check();rig.data.pose_position='POSE'
        for mode,count in [('Walk',144),('Idle',36)]:
            strip=next(t.strips[0] for t in rig.animation_data.nla_tracks if 'Donkey'+mode in t.name);rig.animation_data.action=strip.action
            if strip.action_slot:rig.animation_data.action_slot=strip.action_slot
            for index in range(count+1):
                phase=index/count;frame=strip.action_frame_start+(strip.action_frame_end-strip.action_frame_start)*phase
                scene.frame_set(int(frame),subframe=frame-int(frame));result=Check()
                poses.append({'mode':mode,'phase':phase,'crossings':result['crossings'],'permittedAttachmentContacts':result['permittedAttachmentContacts'],'potentiallyVisibleUniqueCrossings':result['potentiallyVisibleUniqueCrossings'],'visibleExamples':result['visibleExamples']})
        visible=max(p['potentiallyVisibleUniqueCrossings'] for p in poses)
        report={'assetSha256':hashlib.sha256(asset.read_bytes()).hexdigest(),'region':region,'walkSamples':145,'idleSamples':37,'visibilityDirections':14,'visibilityToleranceM':.00025,'furOcclusionIgnored':True,'restCrossings':rest['crossings'],'maximumVisibleCrossings':visible,'poses':poses,'pass':rest['crossings']==0 and visible==0}
        if componentProof is not None:
            report['componentProof']=componentProof;report['restTailAttachmentContacts']=rest['permittedAttachmentContacts']
        output={'Pectoral':'Data_PectoralMotionIntegrity.json','Hind':'Data_HindMotionIntegrity.json','LowerBody':'Data_LowerBodyMotionIntegrity.json'}[region]
        (base/'Review'/output).write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({k:v for k,v in report.items() if k!='poses'}))
        if not report['pass']:raise RuntimeError('Delivered donkey has exposed '+region.lower()+' crossings')
        return report
    finally:
        for obj in imported:bpy.data.objects.remove(obj,do_unlink=True)
        scene.frame_set(oldFrame);bpy.context.view_layer.update()

if __name__=='__main__' or globals().get('DonkeyAssetName')=='Donkey':
    VerifyCurrentDonkey()
    if bpy.context.scene.get('DonkeyReferenceFitRevision') in ['20261025ReferenceV32','20261025ReferenceV33','20261026ReferenceV35','20261026ReferenceV36']:VerifyCurrentDonkey('Hind')
    if bpy.context.scene.get('DonkeyReferenceFitRevision') in ['20261025ReferenceV33','20261026ReferenceV35','20261026ReferenceV36']:VerifyCurrentDonkey('LowerBody')
