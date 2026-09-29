"""Author review poses and audit Luo's real skin deformation in BlenderMCP.

Uses the facial TRS from the shared NRA05 rig, including its jaw orientation.
This creates one local review action, not a replacement game animation library.
"""
import bpy, json, struct, math
from pathlib import Path
from mathutils import Matrix, Vector, Quaternion
cfg=globals().get('LUO_CONFIG',{})
repo=Path(cfg.get('repo',Path(__file__).resolve().parents[2]))
out=Path(cfg.get('output',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/LuoReference_20260929'))
rig=bpy.data.objects['Rig_LuoReference']
raw=(repo/'Taierzhuang1938/Model/Character/Model_TengxianNra05Facial.glb').read_bytes()
size=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+size]);facial=doc['extras']['facialRig']
nodeByName={n.get('name'):i for i,n in enumerate(doc['nodes'])}
parents={c:i for i,n in enumerate(doc['nodes']) for c in n.get('children',[])}
convert=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))

def Trs(n):
    if 'matrix' in n:return Matrix([n['matrix'][i::4] for i in range(4)])
    q=n.get('rotation',[0,0,0,1]);return Matrix.LocRotScale(Vector(n.get('translation',[0,0,0])),Quaternion((q[3],*q[:3])),Vector(n.get('scale',[1,1,1])))

def World(i,pose=None):
    n=doc['nodes'][i];m=Trs((pose or {}).get(n.get('name'),n))
    return World(parents[i],pose)@m if i in parents else m

def Relaxed():
    for b in rig.pose.bones:b.matrix_basis.identity()
    for side,sign in [('L',1),('R',-1)]:
        b=rig.pose.bones['Bip001 '+side+' UpperArm'];axis=b.bone.matrix_local.to_3x3().inverted()@Vector((0,1,0));b.rotation_mode='QUATERNION';b.rotation_quaternion=Quaternion(axis,math.radians(sign*77))
    for name,q in json.loads(rig.get('LuoRestFingerRotations','{}')).items():
        b=rig.pose.bones[name];b.rotation_mode='QUATERNION';b.rotation_quaternion=Quaternion(q)
    bpy.context.view_layer.update()

def SetFace(name):
    pose=facial['poses'][name]
    for b in rig.pose.bones:
        if not b.name.startswith('Face_'):continue
        i=nodeByName[b.name]
        b.matrix=convert@World(i,pose)@World(i).inverted()@convert.inverted()@b.bone.matrix_local
        bpy.context.view_layer.update()

def Vertices(obj):
    dg=bpy.context.evaluated_depsgraph_get();ev=obj.evaluated_get(dg);me=ev.to_mesh()
    pts=[ev.matrix_world@v.co for v in me.vertices];ev.to_mesh_clear();return pts

def RenderPose(name):
    scene=bpy.context.scene;cam=scene.camera;cam.location=(0,-5,1.665);target=Vector((0,0,1.665))
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=.37
    scene.render.resolution_x=900;scene.render.resolution_y=900;scene.render.resolution_percentage=100
    scene.render.filepath=str(out/'Review'/('Preview_Face'+name+'.png'));bpy.ops.render.render(write_still=True)

assert str(out).replace('\\','/') in bpy.data.filepath.replace('\\','/'),bpy.data.filepath
rig.animation_data_clear();Relaxed();SetFace('Rest')
sourceBones=json.loads(rig['SourceBodyBind'])
bodyErrors={b.name:max(abs(b.matrix_local[i][j]-sourceBones[b.name][i][j]) for i in range(4) for j in range(4)) for b in rig.data.bones if not b.name.startswith('Face_')}
head=bpy.data.objects['Mesh_LuoHead'];rest=Vertices(head)
report={'skeleton':'TengxianHumanoidV1','bodyBoneCount':len(bodyErrors),'faceBoneCount':len(facial['bones']),'maximumBodyBindMatrixError':max(bodyErrors.values()),'weights':{},'faceDeformation':{},'poseFrames':{}}
projectionLeaks=[]
for obj in bpy.context.scene.objects:
    if obj.type!='MESH' or not obj.name.startswith('Mesh_Luo') or obj.name in ['Mesh_LuoHead','Mesh_LuoHands','Mesh_LuoEyes','Mesh_LuoOral']:continue
    for material in obj.data.materials:
        if not material or not material.use_nodes:continue
        for node in material.node_tree.nodes:
            if node.type=='TEX_IMAGE' and node.image and node.image.name in ['Image_FrontView.png','Image_SideView.png','Image_BackView.png']:
                projectionLeaks.append([obj.name,material.name,node.image.name])
assert not projectionLeaks,projectionLeaks
report['appearanceAudit']={'dressedReferenceProjectionLeaks':projectionLeaks,'textileAtlas':'Texture_LuoTextileAtlas.png'}
tunic=bpy.data.objects['Mesh_LuoTunic'];groupNames={g.index:g.name for g in tunic.vertex_groups}
skin={p.name:p.matrix@p.bone.matrix_local.inverted() for p in rig.pose.bones}
sleeveTorso=[]
for v in tunic.data.vertices:
    p=sum((skin[groupNames[g.group]]@v.co*g.weight for g in v.groups),Vector())
    if .92<p.z<1.30 and abs(p.x)>.205:
        sleeveTorso.append(sum(g.weight for g in v.groups if any(tag in groupNames[g.group] for tag in ['Pelvis','Spine','Neck'])))
assert sleeveTorso and max(sleeveTorso)<1e-5,('Lower sleeves attached to torso',max(sleeveTorso,default=-1))
report['appearanceAudit']['lowerSleeveVertices']=len(sleeveTorso)
report['appearanceAudit']['maximumLowerSleeveTorsoInfluence']=max(sleeveTorso)
for obj in bpy.context.scene.objects:
    if obj.type!='MESH' or not obj.name.startswith('Mesh_Luo'):continue
    valid={g.index:g.name for g in obj.vertex_groups if g.name in rig.data.bones}
    totals=[sum(g.weight for g in v.groups if g.group in valid) for v in obj.data.vertices]
    report['weights'][obj.name]={'vertices':len(totals),'unweighted':sum(t<.999 for t in totals),'maximumNormalizationError':max((abs(t-1) for t in totals),default=0)}
report['faceInfluences']={name:sum(1 for o in bpy.context.scene.objects if o.type=='MESH' and o.vertex_groups.get(name) for v in o.data.vertices for g in v.groups if g.group==o.vertex_groups[name].index and g.weight>1e-5) for name in facial['bones']}
assert max(bodyErrors.values())<1e-6,bodyErrors
assert report['bodyBoneCount']==53,report['bodyBoneCount']
assert all(v['unweighted']==0 and v['maximumNormalizationError']<1e-5 for v in report['weights'].values()),report['weights']
assert all(report['faceInfluences'].values()),report['faceInfluences']
bpy.context.scene.timeline_markers.clear()
action=bpy.data.actions.new('Animation_LuoFacialReview');rig.animation_data_create();rig.animation_data.action=action
for index,name in enumerate(facial['poses']):
    rig.animation_data.action=None
    frame=1+index*10;bpy.context.scene.frame_set(frame)
    Relaxed();SetFace(name);report['poseFrames'][name]=frame
    pts=Vertices(head);delta=[(p-q).length for p,q in zip(pts,rest)]
    report['faceDeformation'][name]={'movedVertices':sum(d>.00001 for d in delta),'maximumTravelMetres':max(delta)}
    rig.animation_data.action=action
    for b in rig.pose.bones:
        b.rotation_mode='QUATERNION';b.keyframe_insert('location',frame=frame);b.keyframe_insert('rotation_quaternion',frame=frame);b.keyframe_insert('scale',frame=frame)
    marker=bpy.context.scene.timeline_markers.new(name,frame=frame)
    if name in cfg.get('render',['Rest','Open','Blink','Shout','Grit']):RenderPose(name)
for pose in ['Open','Wide','Round','Blink','BrowUp','Shout','Grit']:
    assert report['faceDeformation'][pose]['movedVertices']>10,report['faceDeformation'][pose]
bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=max(report['poseFrames'].values());bpy.context.scene.frame_set(1)
Relaxed();SetFace('Rest');rig['FacialPoseFrames']=json.dumps(report['poseFrames'])
(out/'Data_LuoBindingAudit.json').write_text(json.dumps(report,indent=2),encoding='utf8')
bpy.ops.wm.save_as_mainfile(filepath=str(out/'Model_LuoReference.blend'))
print(json.dumps({k:v for k,v in report.items() if k!='weights'},indent=2))
