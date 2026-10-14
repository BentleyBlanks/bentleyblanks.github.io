"""Balance the source hand volume without changing the skin/skeleton contract.

Set FPS_PROJECT_ROOT. FPS_HAND_EXPORT=False keeps the candidate in Blender.
The invertible volume field undoes the old asymmetric left-hand expansion and
reapplies the right-hand factors. Joint positions and bone lengths never change.
"""
import bpy,json,struct,hashlib,re
import numpy as np
from pathlib import Path
from mathutils import Vector,Matrix

root=Path(FPS_PROJECT_ROOT)
sculptScene=bpy.data.scenes.get('Scene_FpsHandAnatomySculpt')
if sculptScene is not None:bpy.context.window.scene=sculptScene
folder=Path(bpy.data.filepath).parent
assert folder.name=='FpsHandAnatomy_20261015'
assert bpy.context.scene.get('BlenderMcpTask')=='FpsHandAnatomy_20261015'
baseline=folder/'Model_FpsHandsBeforeAnatomy.glb'
raw=baseline.read_bytes()
assert hashlib.sha256(raw).hexdigest()=='6df171a4ceee91d06023f8c53ab95b33ec13e9085d1cf82644fd4853e23e701b'
jsonLength=struct.unpack_from('<I',raw,12)[0]
doc=json.loads(raw[20:20+jsonLength]);binStart=28+jsonLength
binary=bytearray(raw[binStart:])
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
skin=next(o for o in bpy.context.scene.objects if o.type=='MESH' and any(m.name=='Material_HanYangSkin' for m in o.data.materials))
rig.data.pose_position='REST';bpy.context.view_layer.update()
normalize=lambda name:''.join(c for c in name.lower() if c.isalnum())
find=lambda suffix:next(b for b in rig.data.bones if normalize(b.name).endswith(suffix))
wrist=rig.matrix_world@find('lhand').head_local
forward=(rig.matrix_world@find('lfinger2').head_local-wrist).normalized()
across=(rig.matrix_world@find('lfinger1').head_local-rig.matrix_world@find('lfinger4').head_local).normalized()
normal=forward.cross(across).normalized();across=normal.cross(forward).normalized()
outer=lambda v:np.outer(np.asarray(v),np.asarray(v))
identity=np.eye(3)
fields={}
for group in skin.vertex_groups:
 name=normalize(group.name)
 if not re.search(r'l(?:finger|hand|forearm|upperarm)',name):continue
 bone=next(b for b in rig.data.bones if b.name==group.name)
 start=rig.matrix_world@bone.head_local
 if 'finger' in name:
  child=next(iter(bone.children),None)
  end=rig.matrix_world@child.head_local if child else start+(start-rig.matrix_world@bone.parent.head_local)
  axis=(end-start).normalized();projection=identity-outer(axis)
  old,new=(1.42,1.15) if 'finger0' in name else (1.48,1.12)
  oldMatrix=projection*(old-1);newMatrix=projection*(new-1)
 elif name.endswith(('forearm','upperarm')):
  child=next(b for b in bone.children if normalize(b.name).endswith('hand' if name.endswith('forearm') else 'forearm'))
  axis=(rig.matrix_world@child.head_local-start).normalized();projection=identity-outer(axis)
  oldMatrix=projection*.55;newMatrix=projection*.35
 else:
  oldMatrix=outer(normal)*.60+outer(across)*.15
  newMatrix=outer(normal)*.30
 fields[group.index]=(oldMatrix,newMatrix,np.asarray(start))

if not skin.data.shape_keys:skin.shape_key_add(name='Basis')
basis=skin.data.shape_keys.key_blocks['Basis']
shape=skin.data.shape_keys.key_blocks.get('FpsBalancedHandVolume') or skin.shape_key_add(name='FpsBalancedHandVolume')
shape.value=1
inverse=skin.matrix_world.inverted()
original=[];balanced=[];moved=[];normalMatrices=[]
for vertex in skin.data.vertices:
 point=skin.matrix_world@basis.data[vertex.index].co
 oldA=identity.copy();newA=identity.copy();oldB=np.zeros(3);newB=np.zeros(3)
 for assignment in vertex.groups:
  if assignment.group not in fields:continue
  oldMatrix,newMatrix,origin=fields[assignment.group];weight=assignment.weight
  oldA+=oldMatrix*weight;newA+=newMatrix*weight
  oldB-=oldMatrix@origin*weight;newB-=newMatrix@origin*weight
 sourcePoint=np.linalg.solve(oldA,np.asarray(point)-oldB)
 target=Vector(newA@sourcePoint+newB)
 normalMatrices.append(np.linalg.inv(newA@np.linalg.inv(oldA)).T)
 shape.data[vertex.index].co=inverse@target
 original.append(point);balanced.append(target);moved.append((target-point).length)
skin.data.update();bpy.context.view_layer.update()

convert=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
primitives=[p for mesh in doc['meshes'] for p in mesh['primitives'] if doc['materials'][p['material']]['name'] in ['Material_HanYangSkin','Material_HanYangWrist']]
def Accessor(index):
 a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
 width={'SCALAR':1,'VEC3':3}[a['type']];fmt={5123:'H',5125:'I',5126:'f'}[a['componentType']]
 size=struct.calcsize(fmt)*width;start=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',size)
 return a,start,stride,[struct.unpack_from('<'+fmt*width,binary,start+i*stride) for i in range(a['count'])]

positions=[];normals=[];parts=[]
for primitive in primitives:
 p,po,ps,pv=Accessor(primitive['attributes']['POSITION']);n,no,ns,nv=Accessor(primitive['attributes']['NORMAL'])
 offset=len(positions)
 positions.extend(pv);normals.extend(nv)
 parts.append((p,po,ps,n,no,ns,offset))
assert len(positions)==len(original)
mappingError=max((convert@Vector(p)-q).length for p,q in zip(positions,original))
assert mappingError<1e-5,mappingError
newPositions=np.asarray([list(convert.inverted()@p) for p in balanced],dtype=np.float64)
newNormals=np.empty_like(newPositions)
# Preserve the authored smooth surface while transforming its normals with the
# same local volume field. Raw triangle normals expose the source UV splits.
for i,n in enumerate(normals):
 world=np.asarray(convert.to_3x3()@Vector(n))
 transformed=normalMatrices[i]@world;transformed/=np.linalg.norm(transformed)
 newNormals[i]=np.asarray(convert.to_3x3().inverted()@Vector(transformed))
# Imported split vertices need shared surface normals. Clearing custom normals
# alone makes UV seams look like scars; preview the exact normals being baked.
normalToLocal=skin.matrix_world.to_3x3().transposed()@convert.to_3x3()
previewNormals=[(normalToLocal@Vector(newNormals[i] if moved[i]>1e-8 else normals[i])).normalized() for i in range(len(normals))]
skin.data.normals_split_custom_set_from_vertices(previewNormals)
allowed=np.zeros(len(binary),dtype=bool)
for p,po,ps,n,no,ns,offset in parts:
 for i in range(p['count']):
  if moved[offset+i]<1e-8:continue
  struct.pack_into('<3f',binary,po+i*ps,*newPositions[offset+i])
  struct.pack_into('<3f',binary,no+i*ns,*newNormals[offset+i])
  allowed[po+i*ps:po+i*ps+12]=True;allowed[no+i*ns:no+i*ns+12]=True
 p['min']=newPositions[offset:offset+p['count']].min(axis=0).tolist()
 p['max']=newPositions[offset:offset+p['count']].max(axis=0).tolist()
assert np.all(np.frombuffer(raw[binStart:],dtype=np.uint8)[~allowed]==np.frombuffer(binary,dtype=np.uint8)[~allowed])
report={'changedVertices':sum(x>1e-8 for x in moved),'maxDisplacementM':max(moved),'mappingErrorM':mappingError,'source':str(baseline),'shape':shape.name,'exported':bool(globals().get('FPS_HAND_EXPORT',False))}
if report['exported']:
 payload=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();payload+=b' '*((-len(payload))%4)
 output=root/'Model/Model_FpsHanYangHands.glb'
 output.write_bytes(struct.pack('<III',0x46546c67,2,28+len(payload)+len(binary))+struct.pack('<II',len(payload),0x4e4f534a)+payload+struct.pack('<II',len(binary),0x004e4942)+binary)
 report['sha256']=hashlib.sha256(output.read_bytes()).hexdigest()
(folder/'Data_FpsHandAnatomy.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
text=bpy.data.texts.get('Script_FpsHandAnatomy.py') or bpy.data.texts.new('Script_FpsHandAnatomy.py')
text.clear();text.write((root/'_blender/Script_FpsHandAnatomy.py').read_text(encoding='utf-8'))
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath,compress=True)
print(json.dumps(report))
