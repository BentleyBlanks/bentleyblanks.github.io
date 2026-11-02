"""Build the camera-space authoring scene for the HanYang reload clip.

Open a copy of HanYang173RIdle_20261025/Animation_HanYang173RIdle.blend as
HanYangReload_20261102/Animation_HanYangReload.blend (with Data_Capture.json from
Script_HanYangReloadCapture.mjs beside it), then run once through BlenderMCP with
HANYANG_PROJECT_ROOT set. Blender world becomes the game camera space (camera at the
origin looking +Y, 55 deg vertical, 16:9): VM_Space carries camera^-1 * arms root
(including the non-uniform FOV depth compression), Ctl_* empties replicate the
viewmodel nodes the clip drives (weaponMount > wallPivot > reloadPivot > swingPivot >
gun > bolt pivot > bolt / cocking piece, packet props), the 173R game model hangs
under them, and the game's own arm mesh is bound to the rig. See
Script_HanYangReloadAuthor.py for the clip itself.
"""
import os
PROJECT=globals().get('HANYANG_PROJECT_ROOT') or os.environ['HANYANG_PROJECT_ROOT']
FOLDER=globals().get('HANYANG_RELOAD_FOLDER') or os.environ.get('HANYANG_RELOAD_FOLDER') or r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/HanYang173R/HanYangReload_20261102'
import bpy,json,math
from mathutils import Matrix,Vector,Quaternion
cap=json.load(open(FOLDER+'/Data_Capture.json'))
sc=bpy.context.scene
read=lambda v:Matrix([v[i::4] for i in range(4)])
convert=Matrix.Rotation(math.pi/2,4,'X')
def TRS(p,q,s=(1,1,1)):
    return Matrix.Translation(Vector(p))@Quaternion((q[3],q[0],q[1],q[2])).to_matrix().to_4x4()@Matrix.Diagonal((*s,1))
sc.frame_set(1)
rig=bpy.data.objects['Rig_FpsArmsNraSkeletal01']
# freeze Idle frame-1 pose as plain basis, detach all animation
idleBasis={b.name:b.matrix_basis.copy() for b in rig.pose.bones}
for o in list(sc.objects):
    if o.animation_data: o.animation_data.action=None
for b in rig.pose.bones: b.matrix_basis=idleBasis[b.name]
bpy.context.view_layer.update()
def new_empty(name,parent=None,basis=Matrix(),size=.02):
    o=bpy.data.objects.get(name) or bpy.data.objects.new(name,None)
    if o.name not in sc.collection.objects: sc.collection.objects.link(o)
    o.empty_display_size=size; o.parent=parent; o.matrix_parent_inverse=Matrix(); o.matrix_basis=basis
    o.rotation_mode='QUATERNION'
    return o
vm=new_empty('VM_Space')
ctlRoot=new_empty('Ctl_root',vm,convert)
ch=cap['info']['chain'][0]
R0=TRS(ch['p'],ch['q'],ch['s'])
recoil=new_empty('Ctl_recoil',ctlRoot,R0.inverted())
c=cap['idle']['controls']
wm=new_empty('Ctl_weaponMount',recoil,TRS(c['weaponMount']['p'],c['weaponMount']['q']))
wall=new_empty('Ctl_wallPivot',wm)
rp=new_empty('Ctl_reloadPivot',wall,size=.05)
sw=new_empty('Ctl_swingPivot',rp)
gun=new_empty('Ctl_gunRoot',sw)
bp=new_empty('Ctl_boltPivot',gun,Matrix.Translation((0,0.04194,-0.1468)))
bolt=new_empty('Ctl_part_bolt',bp)
pk=new_empty('Ctl_packetProp',rp,size=.01)
used=new_empty('Ctl_usedPacketProp',rp,size=.01)
bpy.context.view_layer.update()
# reparent meshes keeping world
def keep(o,parent):
    w=o.matrix_world.copy(); o.parent=parent; o.matrix_parent_inverse=Matrix(); o.matrix_world=w
for n in ['Model_HanYang_HanYang_body_wood','Model_HanYang_HanYang_body_steel','Model_HanYang_VmIronSight_RearLeft','Model_HanYang_VmIronSight_RearRight','Model_HanYang_VmIronSight_RearBase','Model_HanYang_weapon','Model_HanYang_weapon.001','Model_HanYang_weapon.002']:
    keep(bpy.data.objects[n],gun)
keep(bpy.data.objects['Model_HanYang_VmBolt_HanYang_HanYang_body_steel'],bolt)
keep(rig,vm)
# check gun alignment
g=convert.inverted()@gun.matrix_world
print('gunRoot vs cap', (g.translation-read(c['gunRoot']['root']).translation).length)
pw=bpy.data.objects['Preview_HanYang_weapon'].matrix_world
print('preview vs ctl', (pw.translation-gun.matrix_world.translation).length, pw.to_quaternion().rotation_difference(gun.matrix_world.to_quaternion()).angle)
# hide unused previews
for o in sc.objects:
    if o.name.startswith('Preview_') or o.name in('Icosphere',) or o.name.startswith('Model_HanYang_clip') or o.name.startswith('Model_HanYang_rounds') or o.name.startswith('Model_HanYang_magazine') or o.name.startswith('Model_HanYang_Model_Gongxian') or o.name.startswith('Model_HanYang_Bayonet'):
        if o.type=='MESH' and o.parent and o.parent.name.startswith('Preview_'): o.hide_viewport=o.hide_render=True
        if o.type=='EMPTY' or o.name=='Icosphere': o.hide_viewport=o.hide_render=True
# packet mesh in three coords (child of packetProp), from _BuildClipProp
import bmesh
def box_mesh(name,boxes,parent,mat=None):
    me=bpy.data.meshes.new(name);bm=bmesh.new()
    for (sx,sy,sz,cx,cy,cz) in boxes:
        r=bmesh.ops.create_cube(bm,size=1)
        for v in r['verts']: v.co=Vector((v.co.x*sx+cx,v.co.y*sy+cy,v.co.z*sz+cz))
    bm.to_mesh(me);bm.free()
    o=bpy.data.objects.get(name)
    if o: bpy.data.objects.remove(o)
    o=bpy.data.objects.new(name,me);sc.collection.objects.link(o);o.parent=parent;o.matrix_parent_inverse=Matrix()
    if mat: o.data.materials.append(mat)
    return o
def mat(name,col,metal=0,rough=.5):
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*col,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    m.diffuse_color=(*col,1);return m
steel=mat('Mat_PacketSteel',(.08,.08,.085),1,.45);brass=mat('Mat_Brass',(.55,.42,.18),1,.35)
w=0.0007;boxes=[]
for side in(-1,1):
    for y in(0.001,0.055): boxes.append((w,0.006,0.027,side*0.0068,y,0.017))
    for z in(0.0055,0.0295): boxes.append((w,0.048,0.0035,side*0.0068,0.028,z))
    boxes.append((0.0035,w,0.023,side*0.0051,0.0575,0.017))
boxes+= [(0.0136,0.006,w,0,0.001,0.031),(0.0136,0.006,w,0,0.055,0.031)]
for prop,tag in((pk,''),(used,'Used')):
    box_mesh('Mesh_Packet'+tag,boxes,prop,steel)
    rr=new_empty('Ctl_'+('packetRounds' if not tag else 'usedPacketRounds'),prop,size=.005)
    me=bpy.data.meshes.new('Mesh_Rounds'+tag);bm=bmesh.new()
    for i in range(5):
        r=bmesh.ops.create_cone(bm,cap_ends=True,segments=10,radius1=0.0058,radius2=0.0045,depth=0.057)
        for v in r['verts']: v.co=Vector((v.co.x,v.co.y,v.co.z))+Vector((0,i*0.0121,0))
        r=bmesh.ops.create_cone(bm,cap_ends=True,segments=10,radius1=0.004,radius2=0.002,depth=0.023)
        for v in r['verts']: v.co=Vector((v.co.x,v.co.y,v.co.z))+Vector((0,i*0.0121,-0.0285-0.0115))
    bm.to_mesh(me);bm.free()
    o=bpy.data.objects.get('Mesh_Rounds'+tag)
    if o: bpy.data.objects.remove(o)
    o=bpy.data.objects.new('Mesh_Rounds'+tag,me);sc.collection.objects.link(o);o.parent=rr;o.matrix_parent_inverse=Matrix();o.data.materials.append(brass)
# camera space
camRoot=read(cap['idle']['camRoot'])
vm.matrix_world=convert@camRoot@convert.inverted()
bpy.context.view_layer.update()
cam=bpy.data.objects.get('Camera_Player')
if not cam:
    cd=bpy.data.cameras.new('Camera_Player');cam=bpy.data.objects.new('Camera_Player',cd);sc.collection.objects.link(cam)
cam.parent=None;cam.matrix_world=Matrix.Rotation(math.pi/2,4,'X')
cam.data.sensor_fit='VERTICAL';cam.data.angle_y=math.radians(cap['info']['fov']);cam.data.clip_start=0.01;cam.data.clip_end=100
sc.camera=cam;sc.render.resolution_x=1280;sc.render.resolution_y=720;sc.render.fps=60
print('vm scale',vm.matrix_world.to_scale())

# ---- 173R game model under the control chain ----
def ctl(n):return bpy.data.objects['Ctl_'+n]
BOLT=['HandledCylinder','HandleRoot','HandleNeck','HandleSphere']
COCK=['RearCockingExterior','RearOuterCover_RoundedSideReturn','RearSmallCover','RearSmallPin','RearTab','RearTopExternalLever']
for o in list(sc.objects):
    if o.name.startswith('Model_HanYang_') and o.parent and o.parent.name in('Ctl_gunRoot','Ctl_part_bolt'): bpy.data.objects.remove(o)
before=set(bpy.data.objects.keys())
bpy.ops.import_scene.gltf(filepath=PROJECT+'/Model/HanYang173R/Model_HanYang173R.glb')
new=[bpy.data.objects[n] for n in set(bpy.data.objects.keys())-before]
bpy.context.view_layer.update()
gun=ctl('gunRoot');bp=bpy.data.objects['Ctl_boltPivot']
ck=bpy.data.objects.get('Ctl_part_cockingPiece') or bpy.data.objects.new('Ctl_part_cockingPiece',None)
if ck.name not in sc.collection.objects: sc.collection.objects.link(ck)
ck.parent=bp;ck.matrix_parent_inverse=Matrix();ck.matrix_basis=Matrix();ck.rotation_mode='QUATERNION';ck.empty_display_size=.01
piv=Matrix.Translation((0,0.04194,-0.1468))
meshes=[o for o in new if o.type=='MESH']
for o in meshes:
    W=o.matrix_world.copy()
    base=o.name.split('.')[0]
    if base in BOLT: par,basis=ctl('part_bolt'),piv.inverted()@convert.inverted()@W
    elif base in COCK: par,basis=ck,piv.inverted()@convert.inverted()@W
    else: par,basis=gun,convert.inverted()@W
    o.parent=par;o.matrix_parent_inverse=Matrix();o.matrix_basis=basis
    o.name='Gun173R_'+base
for o in new:
    if o.type!='MESH': bpy.data.objects.remove(o)
print('imported',len(meshes),[o.name for o in meshes if o.parent and o.parent.name!='Ctl_gunRoot'])

# The game's HanYang arms (Model_FpsHanYangHandsRepaired) replace the older preview mesh;
# their rest skeleton matches this rig within 1 mm and the vertex groups use the same names.
before=set(bpy.data.objects.keys())
bpy.ops.import_scene.gltf(filepath=PROJECT+'/Model/Model_FpsHanYangHandsRepaired.glb')
new=[bpy.data.objects[n] for n in set(bpy.data.objects.keys())-before]
old=bpy.data.objects['Mesh_FpsArmsNraSkeletal01'];old.hide_viewport=old.hide_render=True
names={'Mesh_FpsArmsNraSkeletal01':'Mesh_GameHands','Mesh_HanYangNailPlates':'Mesh_GameNails'}
for m in [o for o in new if o.type=='MESH' and o.parent and o.parent.type=='ARMATURE']:
    m.parent=rig;m.matrix_parent_inverse=Matrix();m.matrix_basis=Matrix()
    for md in m.modifiers:
        if md.type=='ARMATURE':md.object=rig
    m.name=names.get(m.name.split('.')[0],'Mesh_GameSleeve')
for o in new:
    if o.name in bpy.data.objects and not o.name.startswith('Mesh_Game'):bpy.data.objects.remove(o)
bpy.ops.wm.save_mainfile()
print('scene ready')
