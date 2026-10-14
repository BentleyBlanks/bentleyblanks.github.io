"""Tailor the existing FPS sleeve in Blender, preserving the glTF skin contract.

Only the cloth POSITION/NORMAL accessors are rewritten. Bone transforms,
inverse binds, finger vertices, weights, UVs and embedded images stay byte exact.
Set FPS_PROJECT_ROOT to this checkout's Taierzhuang1938 directory.
"""
import bpy,bmesh,json,struct,hashlib,math
import numpy as np
from pathlib import Path
from mathutils import Vector,Matrix,Quaternion
from mathutils.bvhtree import BVHTree

root=Path(FPS_PROJECT_ROOT)
folder=Path(bpy.data.filepath).parent
assert folder.name=='FpsHandRealism_20261015'
assert bpy.context.scene.get('BlenderMcpTask')=='FpsHandRealism_20261015'
output=root/'Model/Model_FpsHanYangHands.glb'
baseline=folder/'Model_FpsHandsBeforeTailoring.glb'
if not baseline.exists():baseline.write_bytes(output.read_bytes())
raw=baseline.read_bytes();jsonLength=struct.unpack_from('<I',raw,12)[0]
assert hashlib.sha256(raw).hexdigest()=='201385ad575a48ab0e003bdd77fcde2ba76d9f94a070e48d8dfe6233722f3d63', 'Restore the untouched pre-tailoring source; never tailor an already tailored export.'
doc=json.loads(raw[20:20+jsonLength]);binStart=20+jsonLength+8;binary=bytearray(raw[binStart:])
normalize=lambda n:''.join(c for c in n.lower() if c.isalnum())
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
rig.data.pose_position='REST';bpy.context.view_layer.update()
find=lambda suffix:next(b for b in rig.data.bones if normalize(b.name).endswith(suffix))
cloth=next(o for o in bpy.context.scene.objects if o.type=='MESH' and any(m.name=='Material #1721585337' for m in o.data.materials))
skin=next(o for o in bpy.context.scene.objects if o.type=='MESH' and any(m.name=='Material_HanYangSkin' for m in o.data.materials))
materialIndex=next(i for i,m in enumerate(doc['materials']) if m['name']=='Material #1721585337')
meshIndex,primitive=next((i,p) for i,m in enumerate(doc['meshes']) for p in m['primitives'] if p.get('material')==materialIndex)
nodeIndex=next(i for i,n in enumerate(doc['nodes']) if n.get('mesh')==meshIndex)
parents={child:i for i,n in enumerate(doc['nodes']) for child in n.get('children',[])}
def NodeWorld(i):
 n=doc['nodes'][i]
 if 'matrix' in n:m=Matrix([n['matrix'][j::4] for j in range(4)])
 else:
  q=n.get('rotation',[0,0,0,1]);m=Matrix.LocRotScale(Vector(n.get('translation',[0,0,0])),Quaternion((q[3],*q[:3])),Vector(n.get('scale',[1,1,1])))
 return NodeWorld(parents[i])@m if i in parents else m
convert=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
def Accessor(index):
 a=doc['accessors'][index];view=doc['bufferViews'][a['bufferView']]
 assert a['componentType']==5126 and a['type']=='VEC3'
 start=view.get('byteOffset',0)+a.get('byteOffset',0);stride=view.get('byteStride',12)
 return a,start,stride,[Vector(struct.unpack_from('<3f',binary,start+i*stride)) for i in range(a['count'])]
positionAccessor,positionOffset,positionStride,positions=Accessor(primitive['attributes']['POSITION'])
normalAccessor,normalOffset,normalStride,normals=Accessor(primitive['attributes']['NORMAL'])
assert len(positions)==len(cloth.data.vertices)
# glTF skinned positions may already be in the joint bind space. Do not apply
# the visible mesh node a second time; verify the imported correspondence.
candidates=[convert,convert@NodeWorld(nodeIndex)]
errors=[max((candidate@p-cloth.matrix_world@cloth.data.vertices[i].co).length for i,p in enumerate(positions)) for candidate in candidates]
meshWorld=candidates[min(range(len(errors)),key=errors.__getitem__)];inverse=meshWorld.inverted();mappingError=min(errors)
if not cloth.data.shape_keys:
 assert mappingError<1e-5, f'glTF/Blender vertex correspondence changed: {mappingError}'
 cloth.shape_key_add(name='Basis')
shape=cloth.data.shape_keys.key_blocks.get('FpsTailoredSleeves') or cloth.shape_key_add(name='FpsTailoredSleeves')
shape.value=1
skinVertices=[skin.matrix_world@v.co for v in skin.data.vertices]
bvh=BVHTree.FromPolygons(skinVertices,[tuple(p.vertices) for p in skin.data.polygons])
frames={}
for side in ['r','l']:
 wrist=rig.matrix_world@find(side+'hand').head_local;elbow=rig.matrix_world@find(side+'forearm').head_local
 frames[side]=(wrist,(wrist-elbow).normalized())
# Locate the real distal fabric boundary. A subtle rolled lip follows its
# irregular opening instead of painting a circular stripe across the wrist.
bm=bmesh.new();bm.from_mesh(cloth.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0001)
pending={edge for edge in bm.edges if edge.is_boundary};boundaries=[]
while pending:
 edges={pending.pop()};verts=set(next(iter(edges)).verts)
 while True:
  adjacent={edge for vertex in verts for edge in vertex.link_edges if edge in pending}
  if not adjacent:break
  pending-=adjacent;edges|=adjacent;verts|={vertex for edge in adjacent for vertex in edge.verts}
 boundaries.append([(cloth.matrix_world@edge.verts[0].co,cloth.matrix_world@edge.verts[1].co) for edge in edges])
hem={}
for side,(wrist,axis) in frames.items():
 candidates=[]
 for edges in boundaries:
  axial=[((a+b)*.5-wrist).dot(axis) for a,b in edges]
  if min(axial)>-.15 and max(axial)<.03:candidates.append((sum(axial)/len(axial),edges))
 assert candidates,side
 hem[side]=max(candidates,key=lambda pair:pair[0])[1]
bm.free()
def HemDistance(point,side):
 def Distance(a,b):
  edge=b-a;t=min(1,max(0,(point-a).dot(edge)/max(edge.length_squared,1e-12)))
  return (point-(a+edge*t)).length
 return min(Distance(a,b) for a,b in hem[side])
def Smooth(a,b,value):
 t=min(1,max(0,(value-a)/(b-a)));return t*t*(3-2*t)
edited=[];stats={side:{'edited':0,'beforeRadius':[],'afterRadius':[],'cuffBefore':-1e9,'cuffAfter':-1e9} for side in ['r','l']}
for i,p in enumerate(positions):
 world=meshWorld@p;v=cloth.data.vertices[i]
 weights={side:sum(g.weight for g in v.groups if normalize(cloth.vertex_groups[g.group].name).endswith((side+'forearm',side+'hand'))) for side in ['r','l']}
 side=max(weights,key=weights.get)
 if weights[side]<.5:edited.append(p.copy());continue
 wrist,axis=frames[side];axial=(world-wrist).dot(axis);radial=world-wrist-axis*axial;radius=radial.length
 if axial<-.31 or radius<1e-6:edited.append(p.copy());continue
 weight=Smooth(-.30,-.075,axial)
 retreat=(.050 if side=='r' else .020)*Smooth(-.23,-.025,axial)
 newAxial=axial-retreat;direction=radial/radius
 newRadius=radius*(1-.28*weight)
 # Keep the tailored fabric outside the actual forearm, including its hem.
 hit,normal,face,distance=bvh.ray_cast(wrist+axis*newAxial,direction,.18)
 if hit is not None:newRadius=max(newRadius,distance+.004)
 newRadius+=.0035*math.exp(-.5*(HemDistance(world,side)/.008)**2)
 target=wrist+axis*newAxial+direction*newRadius
 newPoint=inverse@target;edited.append(newPoint)
 shape.data[i].co=cloth.matrix_world.inverted()@target
 s=stats[side];s['edited']+=1;s['cuffBefore']=max(s['cuffBefore'],axial);s['cuffAfter']=max(s['cuffAfter'],newAxial)
 if axial>-.10:s['beforeRadius'].append(radius);s['afterRadius'].append(newRadius)
cloth.data.update()
# Recompute only this cloth's normals from its unchanged topology. Share smooth
# normals across split UV vertices when their original surface normals agree.
vertices=np.asarray([list(v) for v in edited],dtype=np.float64);accum=np.zeros_like(vertices)
indices=doc['accessors'][primitive['indices']];view=doc['bufferViews'][indices['bufferView']]
fmt={5123:'H',5125:'I'}[indices['componentType']];size=struct.calcsize(fmt)
start=view.get('byteOffset',0)+indices.get('byteOffset',0)
triangles=np.asarray(struct.unpack_from('<'+fmt*indices['count'],binary,start),dtype=np.int64).reshape(-1,3)
faceNormals=np.cross(vertices[triangles[:,1]]-vertices[triangles[:,0]],vertices[triangles[:,2]]-vertices[triangles[:,0]])
for column in range(3):np.add.at(accum,triangles[:,column],faceNormals)
groups={}
for i,(p,n) in enumerate(zip(positions,normals)):
 key=tuple(round(float(x),5) for x in p)+tuple(round(float(x),2) for x in n)
 groups.setdefault(key,[]).append(i)
for values in groups.values():
 total=accum[values].sum(axis=0)
 for i in values:accum[i]=total
length=np.linalg.norm(accum,axis=1);assert np.all(length>1e-9)
newNormals=accum/length[:,None]
for i,p in enumerate(edited):struct.pack_into('<3f',binary,positionOffset+i*positionStride,*p)
for i,n in enumerate(newNormals):struct.pack_into('<3f',binary,normalOffset+i*normalStride,*n)
# Fail before writing if anything outside the two cloth accessors changed.
# In particular, the authored finger rotations depend on unchanged bind axes.
allowed=np.zeros(len(binary),dtype=bool)
for offset,stride in [(positionOffset,positionStride),(normalOffset,normalStride)]:
 for i in range(len(positions)):allowed[offset+i*stride:offset+i*stride+12]=True
oldBytes=np.frombuffer(raw[binStart:],dtype=np.uint8);newBytes=np.frombuffer(binary,dtype=np.uint8)
assert np.all(oldBytes[~allowed]==newBytes[~allowed])
positionAccessor['min']=vertices.min(axis=0).tolist();positionAccessor['max']=vertices.max(axis=0).tolist()
payload=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();payload+=b' '*((-len(payload))%4)
output.write_bytes(struct.pack('<III',0x46546c67,2,28+len(payload)+len(binary))+struct.pack('<II',len(payload),0x4e4f534a)+payload+struct.pack('<II',len(binary),0x004e4942)+binary)
for side,s in stats.items():
 for field in ['beforeRadius','afterRadius']:s[field+'95M']=float(np.quantile(s.pop(field),.95))
report={'asset':str(output),'source':str(baseline),'mappingErrorM':mappingError,'clothVertices':len(positions),'clothTriangles':len(triangles),'changedVertices':sum(s['edited'] for s in stats.values()),'sides':stats,'boneAndFingerContract':'Original glTF document, joints, skin, non-cloth accessors and images preserved','sha256':hashlib.sha256(output.read_bytes()).hexdigest()}
(folder/'Data_FpsSleeveTailoring.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
script=bpy.data.texts.get('Script_FpsSleeveTailoring.py') or bpy.data.texts.new('Script_FpsSleeveTailoring.py');script.clear();script.write((root/'_blender/Script_FpsSleeveTailoring.py').read_text(encoding='utf-8'))
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath,compress=True)
print(json.dumps(report))
