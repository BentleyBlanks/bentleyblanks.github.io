"""Luo Maocai reference model, authored through the task's BlenderMCP instance.

Body binding is copied from the adopted NRA05 facial skin, never regenerated.
Reference photographs remain unmodified. UVs are calibrated in the relaxed pose;
mesh vertices are returned to the shared T bind using inverse linear blend skinning.
Run with LUO_CONFIG={'repo': <checkout>, 'output': <private Blender directory>}.
"""
import bpy, bmesh, json, math, hashlib, shutil
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion

cfg=globals().get('LUO_CONFIG',{})
repo=Path(cfg.get('repo',Path(__file__).resolve().parents[2]))
source=Path(cfg.get('references',r'C:/Users/Bentl/OneDrive/Sync/饮河/FPS/角色/罗班长'))
out=Path(cfg.get('output',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/LuoReference_20260929'))
out.mkdir(parents=True,exist_ok=True)
review=out/'Review'; review.mkdir(exist_ok=True)
asset=repo/'Taierzhuang1938/Model/Character'
SCALE=807.0
GROUND=1498.0

def Clear():
    assert not bpy.data.filepath or str(out).replace('\\','/') in bpy.data.filepath.replace('\\','/'), 'Refuse to clear another task scene'
    for obj in list(bpy.data.objects): bpy.data.objects.remove(obj,do_unlink=True)
    for act in list(bpy.data.actions): bpy.data.actions.remove(act)
    for mats in [bpy.data.materials,bpy.data.meshes,bpy.data.armatures]:
        for item in list(mats):mats.remove(item)
    for image in list(bpy.data.images):
        if image.type not in ['RENDER_RESULT','COMPOSITING']:bpy.data.images.remove(image)

def Smooth(a,b,x):
    t=max(0.,min(1.,(x-a)/(b-a))); return t*t*(3-2*t)

def Mix(a,b,t):return a*(1-t)+b*t

def BasicMaterial(name,color,rough=.85,metal=0):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
    return m

def HeadMaterial():
    m=bpy.data.materials.new('Material_LuoHeadComposite');m.use_nodes=True;n=m.node_tree.nodes;l=m.node_tree.links
    tex={}
    for view,uvName in [('Front','UV_Reference'),('Side','UV_Side'),('Back','UV_Back')]:
        coord=n.new('ShaderNodeUVMap');coord.uv_map=uvName
        node=n.new('ShaderNodeTexImage');node.image=images[view];node.extension='EXTEND';l.new(coord.outputs[0],node.inputs['Vector']);tex[view]=node.outputs['Color']
    side=n.new('ShaderNodeVertexColor');side.layer_name='ReferenceSide'
    back=n.new('ShaderNodeVertexColor');back.layer_name='ReferenceBack'
    a=n.new('ShaderNodeMixRGB');l.new(side.outputs['Color'],a.inputs[0]);l.new(tex['Front'],a.inputs[1]);l.new(tex['Side'],a.inputs[2])
    b=n.new('ShaderNodeMixRGB');l.new(back.outputs['Color'],b.inputs[0]);l.new(a.outputs[0],b.inputs[1]);l.new(tex['Back'],b.inputs[2])
    # The reference is photographed against a white studio background. Reject
    # near-white projected fringe pixels on the hidden nape, rather than baking
    # a white band into otherwise natural skin.
    bw=n.new('ShaderNodeRGBToBW');l.new(b.outputs[0],bw.inputs[0])
    mask=n.new('ShaderNodeMapRange');mask.inputs['From Min'].default_value=.55;mask.inputs['From Max'].default_value=.70;l.new(bw.outputs[0],mask.inputs['Value'])
    clean=n.new('ShaderNodeMixRGB');l.new(mask.outputs[0],clean.inputs[0]);l.new(b.outputs[0],clean.inputs[1]);clean.inputs[2].default_value=(.34,.245,.18,1)
    # The shared rig's neck differs from the photographed silhouette. Its lower
    # surface needs continuous skin, not projected collar/background pixels.
    fringe=n.new('ShaderNodeVertexColor');fringe.layer_name='NeckFringe'
    noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=90;noise.inputs['Detail'].default_value=2
    skin=n.new('ShaderNodeMixRGB');l.new(noise.outputs['Fac'],skin.inputs[0]);skin.inputs[1].default_value=(.24,.142,.086,1);skin.inputs[2].default_value=(.37,.235,.155,1)
    neck=n.new('ShaderNodeMixRGB');l.new(fringe.outputs['Color'],neck.inputs[0]);l.new(clean.outputs[0],neck.inputs[1]);l.new(skin.outputs[0],neck.inputs[2])
    foreheadMask=n.new('ShaderNodeVertexColor');foreheadMask.layer_name='ForeheadFringe'
    forehead=n.new('ShaderNodeMixRGB');l.new(foreheadMask.outputs['Color'],forehead.inputs[0]);l.new(neck.outputs[0],forehead.inputs[1]);l.new(skin.outputs[0],forehead.inputs[2])
    # Original turnaround hat pixels must never remain printed on the scalp.
    hairline=n.new('ShaderNodeVertexColor');hairline.layer_name='ScalpHair'
    hairNoise=n.new('ShaderNodeTexNoise');hairNoise.inputs['Scale'].default_value=720;hairNoise.inputs['Detail'].default_value=2
    hairColor=n.new('ShaderNodeMixRGB');l.new(hairNoise.outputs['Fac'],hairColor.inputs[0]);hairColor.inputs[1].default_value=(.012,.009,.006,1);hairColor.inputs[2].default_value=(.040,.028,.017,1)
    hair=n.new('ShaderNodeMixRGB');l.new(hairline.outputs['Color'],hair.inputs[0]);l.new(forehead.outputs[0],hair.inputs[1]);l.new(hairColor.outputs[0],hair.inputs[2])
    bs=n.get('Principled BSDF');l.new(hair.outputs[0],bs.inputs['Base Color']);bs.inputs['Roughness'].default_value=.69;bs.inputs['Subsurface Weight'].default_value=.045
    return m

def SetRelaxed():
    for p in rig.pose.bones:p.matrix_basis.identity()
    for side,sign in [('L',1),('R',-1)]:
        p=rig.pose.bones['Bip001 '+side+' UpperArm'];axis=p.bone.matrix_local.to_3x3().inverted()@Vector((0,1,0))
        p.rotation_mode='QUATERNION';p.rotation_quaternion=Quaternion(axis,math.radians(sign*77))
    restFingers={}
    for side,sign in [('L',1),('R',-1)]:
        for finger in range(5):
            for joint,suffix in enumerate(['','1','2']):
                p=rig.pose.bones.get('Bip001 '+side+' Finger'+str(finger)+suffix)
                if not p:continue
                direction=Vector((0,sign,0)) if finger else Vector((0,0,sign))
                axis=p.bone.matrix_local.to_3x3().inverted()@direction
                angle=([.16,.28,.17][joint] if finger else [.13,.12,.08][joint])
                p.rotation_mode='QUATERNION';p.rotation_quaternion=Quaternion(axis,angle);restFingers[p.name]=list(p.rotation_quaternion)
    rig['LuoRestFingerRotations']=json.dumps(restFingers)
    bpy.context.view_layer.update()

def SkinMatrices():return {p.name:p.matrix@p.bone.matrix_local.inverted() for p in rig.pose.bones}

def BlendMatrix(weights):
    m=Matrix(((0,0,0,0),)*4)
    for name,w in weights.items():
        b=skinMatrices[name]
        for row in range(4):
            for col in range(4):m[row][col]+=b[row][col]*w
    return m

def TorsoWeights(p):
    z=p[2]
    keys=[(.92,'Bip001 Pelvis'),(1.065,'Bip001 Spine'),(1.22,'Bip001 Spine1'),(1.40,'Bip001 Spine2'),(1.55,'Bip001 Neck')]
    if z<=keys[0][0]:return {keys[0][1]:1}
    for (a,na),(b,nb) in zip(keys,keys[1:]):
        if z<=b:
            t=Smooth(a,b,z);return {na:1-t,nb:t}
    return {keys[-1][1]:1}

def ArmWeights(p,side):
    z=p[2];up='Bip001 '+side+' UpperArm';lo='Bip001 '+side+' Forearm'
    t=Smooth(1.19,1.30,z)
    return {up:t,lo:1-t}

def LegWeights(p,side):
    z=p[2];thigh='Bip001 '+side+' Thigh';calf='Bip001 '+side+' Calf'
    if z>.91:
        t=Smooth(.91,1.01,z);return {thigh:1-t,'Bip001 Pelvis':t}
    t=Smooth(.47,.60,z);return {thigh:t,calf:1-t}

def ProjectUv(p,view,kind='body',label=''):
    x,y,z=p
    # Clamp projection to visible cloth in the supplied photographs. Adjacent body
    # parts and studio background are occluders, not usable albedo for hidden faces.
    if 'Puttee' in label:
        sign=1 if x>0 else -1;x=sign*(.082+(abs(x)-.10)*.70)
    elif 'ClothShoe' in label:
        sign=1 if x>0 else -1;x=sign*((.081 if sign>0 else .10)+(abs(x)-.10)*.88)
    elif 'Cap' in label:
        z=min(z,1.796)
        x=max(-.059,min(.059,x)) if z>1.785 else max(-.075,min(.075,x))
    py=GROUND-z*SCALE
    if view=='Front':px=380+x*SCALE
    elif view=='Back':px=284-x*SCALE
    else:px=340+y*SCALE
    if kind=='head':
        if view=='Front':
            px=382+max(-.084,min(.084,x))*820
            py=GROUND-(z+.006*math.exp(-((z-1.68)/.09)**2))*SCALE
        elif view=='Side':px=335+y*700;py=GROUND-(z+.006)*SCALE
        if z<1.65:
            if view=='Back':px=284-max(-.035,min(.035,x))*SCALE
            if view=='Side':px=335+min(-.03,y)*700
    return (px/images[view].size[0],1-py/1536)

def AssignPhoto(obj,points,kind='body',force=None):
    if kind=='head':
        obj.data.materials.clear();obj.data.materials.append(headMaterial)
        uv=obj.data.uv_layers.active;uv.name='UV_Reference'
        sideUv=obj.data.uv_layers.new(name='UV_Side');backUv=obj.data.uv_layers.new(name='UV_Back')
        sa=obj.data.color_attributes.new(name='ReferenceSide',type='FLOAT_COLOR',domain='CORNER')
        ba=obj.data.color_attributes.new(name='ReferenceBack',type='FLOAT_COLOR',domain='CORNER')
        fringe=obj.data.color_attributes.new(name='NeckFringe',type='FLOAT_COLOR',domain='CORNER')
        hair=obj.data.color_attributes.new(name='ScalpHair',type='FLOAT_COLOR',domain='CORNER')
        forehead=obj.data.color_attributes.new(name='ForeheadFringe',type='FLOAT_COLOR',domain='CORNER')
        for li,loop in enumerate(obj.data.loops):
            p=Vector(points[loop.vertex_index]);uv.data[li].uv=ProjectUv(p,'Front',kind);sideUv.data[li].uv=ProjectUv(p,'Side',kind);backUv.data[li].uv=ProjectUv(p,'Back',kind)
            sw=Smooth(.045,.088,abs(p.x));bw=Smooth(.012,.055,p.y)
            sa.data[li].color=(sw,sw,sw,1);ba.data[li].color=(bw,bw,bw,1)
            nf=max((1-Smooth(1.635,1.67,p.z))*Smooth(-.087,-.055,p.y),Smooth(1.55,1.59,p.z)*(1-Smooth(1.635,1.66,p.z))*Smooth(.047,.065,abs(p.x))*Smooth(-.13,-.085,p.y))
            nf=max(nf,(1-Smooth(1.65,1.69,p.z))*Smooth(-.06,.025,p.y))
            fringe.data[li].color=(nf,nf,nf,1)
            ff=Smooth(1.704,1.717,p.z)*(1-Smooth(-.065,-.015,p.y));forehead.data[li].color=(ff,ff,ff,1)
            line=1.670+.055*(1-Smooth(-.10,-.01,p.y))
            ear=Smooth(.080,.089,abs(p.x))*math.exp(-((p.y-.018)/.035)**2)*(1-Smooth(1.709,1.728,p.z))
            hf=Smooth(line-.003,line+.007,p.z)*(1-ear)
            hair.data[li].color=(hf,hf,hf,1)
        for poly in obj.data.polygons:poly.material_index=0
        return
    raise RuntimeError('Clothing and equipment require an explicit independent material')


def Mesh(name,points,faces,weights=None,material=None,kind='body',force=None):
    me=bpy.data.meshes.new(name);me.from_pydata(points,[],faces);me.update()
    obj=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(obj)
    if material:me.materials.append(material)
    else:AssignPhoto(obj,points,kind,force)
    for poly in me.polygons:poly.use_smooth=True
    if weights:
        perVertex=[weights(Vector(p)) if callable(weights) else weights for p in points]
        groups={n:obj.vertex_groups.new(name=n) for n in set(n for w in perVertex for n in w)}
        for i,w in enumerate(perVertex):
            w={n:v for n,v in w.items() if v>1e-6};total=sum(w.values());w={n:v/total for n,v in w.items()}
            for n,v in w.items():groups[n].add([i],v,'REPLACE')
            me.vertices[i].co=BlendMatrix(w).inverted()@Vector(points[i])
        mod=obj.modifiers.new('SharedNraSkin','ARMATURE');mod.object=rig;obj.parent=rig
    if any(tag in name for tag in ['Tunic','Sleeve','Trousers','ClothShoe','CapCrown']):
        mod=obj.modifiers.new('TailoredSurface','SUBSURF');mod.levels=1;mod.render_levels=1
    return obj

def Loft(name,rings,segments=48,weights=None,material=None,wrinkle=.002,force=None):
    # rings: x/y/z centre, x radius, depth radius. Ordered bottom -> top.
    points=[];faces=[]
    for j,(x,y,z,rx,ry) in enumerate(rings):
        for i in range(segments):
            t=2*math.pi*i/segments
            wobble=wrinkle*(math.sin(t*7+j*.9)+.45*math.sin(t*13-j*.67))
            points.append((x+(rx+wobble)*math.cos(t),y+(ry+wobble)*math.sin(t),z+wrinkle*.32*math.sin(11*t+j)))
    for j in range(len(rings)-1):
        for i in range(segments):
            a=j*segments+i;b=j*segments+(i+1)%segments;c=(j+1)*segments+(i+1)%segments;d=(j+1)*segments+i
            faces.append((a,b,c,d))
    faces.extend([tuple(reversed(range(segments))),tuple((len(rings)-1)*segments+i for i in range(segments))])
    return Mesh(name,points,faces,weights,material,force=force)

def Tube(name,points,radius,material,weights,segments=8):
    verts=[];faces=[]
    for j,p in enumerate(points):
        p=Vector(p);direction=Vector(points[min(j+1,len(points)-1)])-Vector(points[max(j-1,0)])
        direction.normalize();axis=direction.cross(Vector((0,0,1)))
        if axis.length<.01:axis=direction.cross(Vector((0,1,0)))
        axis.normalize();other=direction.cross(axis).normalized()
        for i in range(segments):verts.append(p+radius*(axis*math.cos(i*2*math.pi/segments)+other*math.sin(i*2*math.pi/segments)))
    for j in range(len(points)-1):
        for i in range(segments):faces.append((j*segments+i,j*segments+(i+1)%segments,(j+1)*segments+(i+1)%segments,(j+1)*segments+i))
    return Mesh(name,verts,faces,weights,material)

def Panel(name,boundary,depth,weights,material=None,force=None):
    # front/back fabric panel with bevel/subdivision, genuine volume.
    pts=[Vector(p) for p in boundary];center=sum(pts,Vector())/len(pts)
    points=pts+[center+Vector((0,depth,0))]
    faces=[(i,(i+1)%len(pts),len(pts)) for i in range(len(pts))]
    ob=Mesh(name,points,faces,weights,material,force=force)
    sol=ob.modifiers.new('ClothThickness','SOLIDIFY');sol.thickness=.0016
    return ob

def Strap(name,path,width,material,weights,force=None):
    verts=[];faces=[]
    for j,p in enumerate(path):
        a=Vector(path[min(j+1,len(path)-1)])-Vector(path[max(j-1,0)])
        tangent=a.cross(Vector((0,1,0))).normalized()*width*.5
        verts.extend([Vector(p)-tangent,Vector(p)+tangent])
    for j in range(len(path)-1):faces.append((2*j,2*j+1,2*j+3,2*j+2))
    ob=Mesh(name,verts,faces,weights,material,force=force);mod=ob.modifiers.new('StrapThickness','SOLIDIFY');mod.thickness=.003
    return ob

def Ellipsoid(name,center,size,material,weights,force=None):
    rings=[]
    for j in range(1,24):
        t=-math.pi/2+math.pi*j/24
        rings.append((center[0],center[1],center[2]+size[2]*math.sin(t),max(.0003,size[0]*math.cos(t)),max(.0003,size[1]*math.cos(t))))
    return Loft(name,rings,40,weights,material,0,force)

def ImportSource():
    bpy.ops.import_scene.gltf(filepath=str(asset/'Model_TengxianNra05.glb'))
    mats={m.name:m for m in bpy.data.materials}
    for m in mats.values():m.use_fake_user=True
    for obj in list(bpy.data.objects):bpy.data.objects.remove(obj,do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=str(asset/'Model_TengxianNra05Facial.glb'))
    arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');arm.name='Rig_LuoReference';arm.animation_data_clear()
    for action in list(bpy.data.actions):
        if action.users==0:bpy.data.actions.remove(action)
    for obj in list(bpy.context.scene.objects):
        if obj.type!='MESH':continue
        if not obj.vertex_groups:bpy.data.objects.remove(obj,do_unlink=True);continue
        for slot in obj.material_slots:
            key=slot.material.name.removesuffix('.001')
            if key in mats:slot.material=mats[key]
        bpy.context.view_layer.objects.active=obj;bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.separate(type='MATERIAL');bpy.ops.object.mode_set(mode='OBJECT')
    return arm

def SourceSkin():
    for obj in list(bpy.context.scene.objects):
        if obj.type!='MESH':continue
        material=obj.data.materials[0].name if obj.data.materials else ''
        if material in ['Material #1721585337','Material #1721585500'] or not obj.vertex_groups:
            bpy.data.objects.remove(obj,do_unlink=True);continue
        if material=='Material #26':
            obj.name='Mesh_LuoHead'
            # Preserve loops around the eyes and lips, narrow the upper cheeks slightly.
            for v in obj.data.vertices:
                p=obj.matrix_world@v.co
                factor=1-.055*math.exp(-((p.z-1.642)/.050)**2)
                p.x*=factor
                p.z-=.019*Smooth(1.74,1.805,p.z)*Smooth(-.085,.02,p.y)
                v.co=obj.matrix_world.inverted()@p
            points=[obj.matrix_world@v.co for v in obj.data.vertices]
            AssignPhoto(obj,points,'head')
            # glTF splits vertices at UV seams; subdivision must operate on a welded
            # surface, otherwise it shrinks disconnected faces into holes.
            bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000015);bm.to_mesh(obj.data);bm.free()
            mod=obj.modifiers.new('FaceSurface','SUBSURF');mod.levels=2;mod.render_levels=2
        elif material=='John_All Body':
            obj.name='Mesh_LuoHands'
            bm=bmesh.new();bm.from_mesh(obj.data)
            bmesh.ops.delete(bm,geom=[v for v in bm.verts if abs((obj.matrix_world@v.co).x)<.675],context='VERTS')
            bm.to_mesh(obj.data);bm.free()
            # The reference sleeve overlaps the wrist; hands are moved 5 cm along the arm.
            for v in obj.data.vertices:
                p=obj.matrix_world@v.co;p.x+=.045*(1 if p.x>0 else -1);p.y-=.041;v.co=obj.matrix_world.inverted()@p
            for poly in obj.data.polygons:poly.use_smooth=True
            m=obj.data.materials[0];bs=m.node_tree.nodes.get('Principled BSDF')
            if bs and bs.inputs['Base Color'].is_linked:
                link=bs.inputs['Base Color'].links[0];socket=link.from_socket;m.node_tree.links.remove(link)
                hs=m.node_tree.nodes.new('ShaderNodeHueSaturation');hs.inputs['Saturation'].default_value=.65;hs.inputs['Value'].default_value=1.03
                m.node_tree.links.new(socket,hs.inputs['Color']);m.node_tree.links.new(hs.outputs['Color'],bs.inputs['Base Color'])
        elif material=='Material_FacialOral':obj.name='Mesh_LuoOral'
        else:obj.name='Mesh_LuoEyes'

def SetupStudio():
    scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
    scene.render.engine='CYCLES';scene.cycles.samples=32
    scene.cycles.use_denoising=True
    try:
        prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
        for d in prefs.devices:d.use=d.type!='CPU'
        scene.cycles.device='GPU'
    except Exception:pass
    scene.render.resolution_x=900;scene.render.resolution_y=1600;scene.render.resolution_percentage=75
    scene.world.color=(.35,.35,.35)
    scene.view_settings.view_transform='AgX'
    for name,loc,power,size in [('Key',(-3,-4,5),450,5),('Fill',(3,-2,3),240,4),('Rim',(0,4,4),350,4)]:
        data=bpy.data.lights.new('Light_'+name,'AREA');data.energy=power;data.shape='DISK';data.size=size
        obj=bpy.data.objects.new('Light_'+name,data);scene.collection.objects.link(obj);obj.location=loc;obj.rotation_euler=(Vector((0,0,1))-obj.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new('Camera_LuoReview');cam=bpy.data.objects.new('Camera_LuoReview',data);scene.collection.objects.link(cam);scene.camera=cam;data.type='ORTHO';data.ortho_scale=1.96
    floor=BasicMaterial('Material_StudioFloor',(.20,.215,.23),.9)
    Mesh('Stage_Floor',[(-200,-200,-.008),(200,-200,-.008),(200,200,-.008),(-200,200,-.008)],[(0,1,2,3)],material=floor)
    return cam

def Render(view='Front',close=False):
    scene=bpy.context.scene;cam=scene.camera;target=Vector((0,0,1.655 if close else .91))
    pos={'Front':(0,-5,target.z),'Back':(0,5,target.z),'Side':(5,0,target.z),'ThreeQuarter':(-3,-5,target.z)}[view]
    cam.location=pos;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=.39 if close else 1.96
    scene.render.resolution_x=900;scene.render.resolution_y=900 if close else 1600
    scene.render.filepath=str(review/('Preview_'+view+('Face' if close else '')+'.png'));bpy.ops.render.render(write_still=True)

def PrepareEditor():
    body=rig.data.collections.get('Body53') or rig.data.collections.new('Body53')
    face=rig.data.collections.get('Face13') or rig.data.collections.new('Face13')
    for bone in rig.data.bones:(face if bone.name.startswith('Face_') else body).assign(bone)
    rig.show_in_front=False
    bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                space=area.spaces.active;space.region_3d.view_location=(0,0,.92);space.region_3d.view_distance=3.05
                space.region_3d.view_rotation=Quaternion((.7071068,.7071068,0,0));space.region_3d.view_perspective='ORTHO';space.shading.type='MATERIAL'
    note=bpy.data.texts.get('Data_LuoReadme') or bpy.data.texts.new('Data_LuoReadme');note.clear()
    note.write('Luo Maocai / shared NRA skeleton\nBody53: existing TengxianHumanoidV1 bind.\nFace13: jaw, upper/lower lips, corners, brows, eyelids, eyeballs.\nAnimation_LuoFacialReview: timeline markers select facial review poses.\nModel_LuoReference.blend keeps all individual components editable.\nModel_LuoReferenceBaked.blend has three PBR materials for the exported GLB.\n')

tailoringScript=Path(__file__).with_name('Script_LuoTailoring.py')
exec(compile(tailoringScript.read_text(encoding='utf8'),str(tailoringScript),'exec'),globals())
Clear();rig=ImportSource()
bodyBind={b.name:[list(row) for row in b.matrix_local] for b in rig.data.bones if not b.name.startswith('Face_')}
SetRelaxed();skinMatrices=SkinMatrices()
images={v:bpy.data.images.load(str(source/('Image_'+v+'View.png')),check_existing=True) for v in ['Front','Side','Back']}
for im in images.values():im.pack()

headMaterial=HeadMaterial()
thread=BasicMaterial('Material_LuoThread',(.18,.165,.135))
rope=BasicMaterial('Material_LuoHemp',(.25,.21,.155))
canvas=BasicMaterial('Material_LuoCanvas',(.17,.155,.125))
blanket=BasicMaterial('Material_LuoBlanket',(.13,.14,.145))
leather=BasicMaterial('Material_LuoWornLeather',(.052,.049,.041),.77)
steel=BasicMaterial('Material_LuoOxidizedMetal',(.20,.19,.17),.62,.50)
flask=BasicMaterial('Material_LuoCanteen',(.19,.20,.19),.82,.12)
button=BasicMaterial('Material_LuoButtons',(.055,.061,.060),.73)
SourceSkin();TailoredMaterials();Body();Equipment();Cap();Tailoring();SetupStudio();SetRelaxed()
rig['SkeletonContract']='TengxianHumanoidV1';rig['SourceModel']='Model_TengxianNra05Facial.glb'
rig['SourceBodyBind']=json.dumps(bodyBind)
rig['ReferenceCharacter']='Luo Maocai';rig['ReferencePose']='Relaxed; shared T bind retained'
bpy.context.scene['BlenderMcpTask']='LuoReferenceModel'
PrepareEditor()
bpy.ops.wm.save_as_mainfile(filepath=str(out/'Model_LuoReference.blend'))
if cfg.get('renderBuild',True):Render('Front')
print('Luo build complete',len([o for o in bpy.context.scene.objects if o.type=='MESH']),str(out/'Model_LuoReference.blend'))
