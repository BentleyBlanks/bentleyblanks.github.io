"""Compare a fresh Type 94 geometry recipe replay with the canonical high source.

A separate batch may open the owned canonical file read-only. Authored polygon
loops are compared at 1 um with winding retained. When tessellation differs,
float64 surface samples retain a 10 um fallback bound. Texture replay is outside
this check; the report explicitly preserves that distinction.
"""
import bpy,json,numpy as np,os,hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
root=Path(os.environ.get('TYPE94_SOURCE_ROOT',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette'))
replay=Path(os.environ.get('TYPE94_REPLAY_ROOT',str(root/'Acceptance/RecipeReplay')))/'Acceptance'
canonical=root/'Scene_Type94TanketteHighPbrStudy.blend'
if not bpy.data.filepath:bpy.ops.wm.open_mainfile(filepath=str(canonical))
assert Path(bpy.data.filepath)==canonical and bpy.context.scene.get('BlenderMcpTask')=='Type94Tankette'
expected=json.loads((replay/'Data_ReplayGeometry.json').read_text(encoding='utf-8'));assert expected['asset']=='Type94Tankette'
arrays=np.load(replay/'Data_ReplayGeometry.npz')
rows=[];missing=[];seen=set()
def SameSurface(a,ta,b,tb):
 if a.shape==b.shape and np.array_equal(a,b) and np.array_equal(ta,tb):return True
 merged=np.vstack((np.rint(a/1e-6).astype(np.int64),np.rint(b/1e-6).astype(np.int64)))
 _,indices=np.unique(merged,axis=0,return_inverse=True)
 aa=np.sort(indices[:len(a)][ta],axis=1);bb=np.sort(indices[len(a):][tb],axis=1)
 return aa.shape==bb.shape and np.array_equal(aa[np.lexsort(aa.T[::-1])],bb[np.lexsort(bb.T[::-1])])
def SameAuthoredPolygons(a,fa,b,fb):
 combined=np.vstack((np.rint(a/1e-6).astype(np.int64),np.rint(b/1e-6).astype(np.int64)));_,index=np.unique(combined,axis=0,return_inverse=True)
 def Signature(faces,ids):
  keys=[]
  for face in faces:
   values=tuple(int(v) for v in ids[face]);small=min(values);keys.append(min(values[i:]+values[:i] for i,v in enumerate(values) if v==small))
  return sorted(keys)
 return Signature(fa,index[:len(a)])==Signature(fb,index[len(a):])
def Distances(p,a,b,c):
 p=np.asarray(p,dtype=np.float64);a=np.asarray(a,dtype=np.float64);b=np.asarray(b,dtype=np.float64);c=np.asarray(c,dtype=np.float64)
 n=np.cross(b-a,c-a);n2=np.einsum('ij,ij->i',n,n);safe=np.maximum(n2,1e-30);signed=np.einsum('ij,ij->i',p-a,n);q=p-n*(signed/safe)[:,None]
 inside=np.ones(len(p),dtype=bool);segment=[]
 for start,end in [(a,b),(b,c),(c,a)]:
  edge=end-start;inside&=np.einsum('ij,ij->i',np.cross(edge,q-start),n)>=-1e-10*safe
  t=np.clip(np.einsum('ij,ij->i',p-start,edge)/np.maximum(np.einsum('ij,ij->i',edge,edge),1e-30),0,1);delta=p-(start+edge*t[:,None]);segment.append(np.einsum('ij,ij->i',delta,delta))
 return np.sqrt(np.maximum(0,np.where(inside&(n2>1e-30),signed*signed/safe,np.minimum.reduce(segment))))
def Compare(points,triangles,otherPoints,otherTriangles):
 points=points.astype(np.float64);otherPoints=otherPoints.astype(np.float64)
 tree=BVHTree.FromPolygons([Vector(p) for p in otherPoints],otherTriangles.tolist(),all_triangles=True)
 samples=np.vstack((points,points[triangles].mean(axis=1)));hits=[tree.find_nearest(Vector(p)) for p in samples];ids=np.array([hit[2] if hit[2] is not None else 0 for hit in hits]);tri=otherPoints[otherTriangles[ids]]
 distances=Distances(samples,tri[:,0],tri[:,1],tri[:,2])
 for index in np.flatnonzero(distances>.00001):
  candidates=tree.find_nearest_range(Vector(samples[index]),float(distances[index]+.0001));faceIds=[hit[2] for hit in candidates if hit[2] is not None]
  if faceIds:
   corners=otherPoints[otherTriangles[faceIds]];p=np.repeat(samples[index][None,:],len(faceIds),axis=0);distances[index]=min(distances[index],float(Distances(p,corners[:,0],corners[:,1],corners[:,2]).min()))
 return float(distances.max(initial=0))
for record in expected['records']:
 obj=bpy.data.objects.get(record['name'])
 if not obj or obj.type!='MESH':missing.append(record['name']);continue
 seen.add(obj.name);mesh=obj.data;mesh.calc_loop_triangles();points=np.array([tuple(obj.matrix_world@v.co) for v in mesh.vertices],dtype=np.float32);triangles=np.array([tuple(t.vertices) for t in mesh.loop_triangles],dtype=np.int32);index=record['index'];otherPoints=arrays['v'+str(index)];otherTriangles=arrays['t'+str(index)]
 offsets=arrays['o'+str(index)];flat=arrays['p'+str(index)];replayFaces=[flat[offsets[i]:offsets[i+1]] for i in range(len(offsets)-1)];authorMatch=SameAuthoredPolygons(points,[list(p.vertices) for p in mesh.polygons],otherPoints,replayFaces);identical=SameSurface(points,triangles,otherPoints,otherTriangles);forward=0.0 if identical else Compare(points,triangles,otherPoints,otherTriangles);reverse=0.0 if identical else Compare(otherPoints,otherTriangles,points,triangles)
 rows.append({'name':obj.name,'canonicalTriangles':len(triangles),'replayTriangles':len(otherTriangles),'maxCanonicalToReplayM':forward,'maxReplayToCanonicalM':reverse,'authoredPolygonsMatchAt1Um':bool(authorMatch),'passed':(authorMatch or max(forward,reverse)<=.00001) and len(triangles)==len(otherTriangles)})
extra=[o.name for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in seen]
report={'scope':'Fresh geometry recipe plus mechanism correction; texture replay is separate','passed':not missing and not extra and all(row['passed'] for row in rows),'missing':missing,'extra':extra,'records':rows,'thresholdM':.00001,'method':'Oriented authored polygon equality at 1 um; independently report tessellation surface differences with float64 distances and BVH candidate search','replayDirectory':str(replay),'canonicalSource':bpy.data.filepath}
report['canonicalBlendSha256']=hashlib.sha256(canonical.read_bytes()).hexdigest();report['canonicalHighGlbSha256']=hashlib.sha256((root/'Exports/Model_Type94TanketteHighPbrStudy.glb').read_bytes()).hexdigest();p=root/'Acceptance/Data_RecipeGeometryAudit.json';p.write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps({'passed':report['passed'],'missing':missing,'extra':extra,'failed':[row for row in rows if not row['passed']][:12]},indent=2))

if not report['passed']:raise RuntimeError('Fresh recipe geometry differs from the canonical high source')
