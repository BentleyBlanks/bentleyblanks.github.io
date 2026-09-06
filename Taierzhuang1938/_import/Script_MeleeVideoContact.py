"""Melee-specific rigid prop contact hook for MotionBakeV2's recovered body pose.

Executed inside the baker. Gesture and elbow planes come from GVHMR; this hook
only fits the production weapon and original hands to a common rigid grip.
"""
import base64,struct
from mathutils import Euler
project=Path(__file__).resolve().parents[1]
weapon=motion['weapon']
for obj in rifleParts:
 obj.hide_render=True;obj.hide_set(True)

def ImportMeleeProp(asset,name,parent=None):
 document=json.loads((project/'Model'/(asset+'.tzm.json')).read_text(encoding='utf-8'))
 carrier=bpy.data.objects.new(name,None);scene.collection.objects.link(carrier)
 if parent:carrier.parent=parent
 matrices=[]
 def Decode(value,code):
  raw=base64.b64decode(value);return struct.unpack('<'+code*(len(raw)//struct.calcsize(code)),raw)
 for node in document['nodes']:
  matrix=Matrix.Translation(Vector(node['t']))@Euler(node['r'],'YXZ').to_matrix().to_4x4()
  if node['parent']>=0:matrix=matrices[node['parent']]@matrix
  matrices.append(matrix)
  for idx in node.get('meshes',[]):
   block=document['meshes'][idx];q=Decode(block['pos'],'H');uv=Decode(block['uv'],'H');indices=Decode(block['idx'],'I' if block['idxBits']==32 else 'H')
   vertices=[matrix@Vector([block['posMin'][j]+q[i*3+j]*block['posScale'][j] for j in range(3)]) for i in range(block['count'])]
   mesh=bpy.data.meshes.new(name+str(idx));mesh.from_pydata(vertices,[],[indices[i:i+3] for i in range(0,len(indices),3)]);mesh.update()
   layer=mesh.uv_layers.new(name='UVMap')
   for loop in mesh.loops:layer.data[loop.index].uv=[block['uvMin'][j]+uv[loop.vertex_index*2+j]*block['uvScale'][j] for j in range(2)]
   obj=bpy.data.objects.new(mesh.name,mesh);scene.collection.objects.link(obj);obj.parent=carrier
   if block['material']=='dadao':
    scope={};exec(compile((project/'_blender/Script_MeleeWeaponMaterials.py').read_text(encoding='utf-8'),'MeleeMaterials','exec'),scope)
    material=scope['MeleeDadaoMaterial'](project)
   else:
    material=bpy.data.materials.get('Material_'+faction+block['material'])
    if not material:
     material=bpy.data.materials.new('Material_MeleeVideo'+block['material']);material.use_nodes=True
     shader=material.node_tree.nodes['Principled BSDF'];shader.inputs['Base Color'].default_value=(.24,.12,.06,1) if block['material']=='wood' else (.28,.3,.32,1);shader.inputs['Roughness'].default_value=.65
   mesh.materials.append(material)
   for polygon in mesh.polygons:polygon.use_smooth=True
 return carrier,document

rifle,document=ImportMeleeProp('Dadao' if weapon=='Dadao' else 'HanYang' if faction=='Nra' else 'Type38','Model_'+faction+'MeleeVideo'+weapon)
if weapon=='Bayonet':
 blade,bladeDoc=ImportMeleeProp('BayonetHanYang' if faction=='Nra' else 'BayonetType38','Model_'+faction+'MeleeVideoBlade',rifle)
 muzzle=next(n['t'] for n in document['nodes'] if n['name']=='muzzle');socket=next(n['t'] for n in bladeDoc['nodes'] if n['name']=='socket');blade.location=Vector(muzzle)-Vector(socket)
rifle.rotation_mode='QUATERNION';rifleParts=[rifle]+list(rifle.children_recursive)
rightGrip=Vector((0,0,.03)) if weapon=='Dadao' else Vector((.020,-.045,.055))*scale
leftGrip=Vector((0,0,.155)) if weapon=='Dadao' else Vector((0,-.022,-.16))*scale

def SetRifle(matrix):
 rifle.matrix_world=matrix

def Props(index,positions,rotations):
 # Both palms constrain one rigid handle. Its shorter grip spacing corrects
 # monocular wrist depth disagreement while preserving their recovered midpoint.
 # Rifle roll additionally follows the torso/stock plane, not the wrist line alone.
 forward=(positions['R Hand']-positions['L Hand']) if weapon=='Dadao' else (positions['L Hand']-positions['R Hand'])
 forward.normalize()
 up=(positions['Neck']-positions['Pelvis']).normalized()
 z=-forward;x=up.cross(z).normalized();y=z.cross(x).normalized();rotation=Matrix((x,y,z)).transposed()
 if weapon=='Bayonet':rotation=Matrix(motion['propRotations'][index])
 matrix=rotation.to_4x4()
 direction=rotation@Vector((0,.35,-.9367));normal=rotation@Vector((-1,0,0))
 # A constant wrist-to-palm anatomical offset; source motion is not generated here.
 matrix.translation=(positions['R Hand']+positions['L Hand'])*.5+direction*(.065*scale)-rotation@((rightGrip+leftGrip)*.5)
 # Project the shared rigid prop into both original arm reach spheres. This
 # keeps high overhead source poses from demanding longer original limbs.
 leftDirection=rotation@Vector((0,.35,-.9367) if weapon=='Dadao' else (1,0,0))
 leftNormal=rotation@Vector((1,0,0) if weapon=='Dadao' else (0,1,0))
 for iteration in range(12):
  for side,grip,d,n in [('R',rightGrip,direction,normal),('L',leftGrip,leftDirection,leftNormal)]:
   target=matrix@grip-d*(.065*scale)-n*(.015*scale)
   shoulder=positions[side+' UpperArm'];delta=target-shoulder
   reach=(heads[N(side+' Forearm')]-heads[N(side+' UpperArm')]).length+(heads[N(side+' Hand')]-heads[N(side+' Forearm')]).length-.004
   if delta.length>reach:matrix.translation-=delta.normalized()*(delta.length-reach)
 SetRifle(matrix)
 errors=[Hand('R',matrix@rightGrip,direction,normal,positions,rotations)]
 errors.append(Hand('L',matrix@leftGrip,leftDirection,leftNormal,positions,rotations))
 return max(errors)
