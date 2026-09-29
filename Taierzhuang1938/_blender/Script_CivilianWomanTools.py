"""Shared-rig authoring utilities adapted from the Luo reference workflow.
Frozen for this civilian asset, to avoid coupling to ongoing Luo revisions.
"""

import bpy, bmesh, math, json

from mathutils import Vector, Matrix, Quaternion

def Smooth(a,b,x):
    t=max(0.,min(1.,(x-a)/(b-a))); return t*t*(3-2*t)

def Mix(a,b,t):return a*(1-t)+b*t

def BasicMaterial(name,color,rough=.85,metal=0):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
    return m

def SetRelaxed():
    for p in rig.pose.bones:p.matrix_basis.identity()
    for side,sign in [('L',1),('R',-1)]:
        p=rig.pose.bones['Bip001 '+side+' UpperArm'];axis=p.bone.matrix_local.to_3x3().inverted()@Vector((0,1,0))
        p.rotation_mode='QUATERNION';p.rotation_quaternion=Quaternion(axis,math.radians(sign*73))

    for side,sign in [('L',1),('R',-1)]:
        for finger in range(1,5):
            for suffix,angle in [('',10),('1',16),('2',10)]:
                b=rig.pose.bones['Bip001 '+side+' Finger'+str(finger)+suffix]
                axis=b.bone.matrix_local.to_3x3().inverted()@Vector((0,0,1));b.rotation_mode='QUATERNION';b.rotation_quaternion=Quaternion(axis,math.radians(-sign*angle))
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
    if z<.99:
        side='L' if p[0]>0 else 'R';leg=.88*(1-Smooth(.855,.99,z))*Smooth(.012,.073,abs(p[0]))
        return {'Bip001 Pelvis':1-leg,'Bip001 '+side+' Thigh':leg}
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
    arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');arm.name='Rig_CivilianWomanReference';arm.animation_data_clear()
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

def SetupStudio():
    scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
    scene.render.engine='CYCLES';scene.cycles.samples=24
    scene.cycles.use_denoising=True
    scene.cycles.device='CPU'
    scene.render.resolution_x=900;scene.render.resolution_y=1600;scene.render.resolution_percentage=75
    scene.world.color=(.35,.35,.35)
    scene.view_settings.view_transform='AgX'
    for name,loc,power,size in [('Key',(-3,-4,5),450,5),('Fill',(3,-2,3),240,4),('Rim',(0,4,4),350,4)]:
        data=bpy.data.lights.new('Light_'+name,'AREA');data.energy=power;data.shape='DISK';data.size=size
        obj=bpy.data.objects.new('Light_'+name,data);scene.collection.objects.link(obj);obj.location=loc;obj.rotation_euler=(Vector((0,0,1))-obj.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new('Camera_CivilianWomanReview');cam=bpy.data.objects.new('Camera_CivilianWomanReview',data);scene.collection.objects.link(cam);scene.camera=cam;data.type='ORTHO';data.ortho_scale=1.96
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
    note=bpy.data.texts.get('Data_CivilianWomanReadme') or bpy.data.texts.new('Data_CivilianWomanReadme');note.clear()
    note.write('Civilian woman 08 / shared Tengxian skeleton\nBody53: existing TengxianHumanoidV1 bind.\nFace13: jaw, upper/lower lips, corners, brows, eyelids, eyeballs.\nAnimation_CivilianWomanFacialReview: timeline markers select facial review poses.\nModel_CivilianWomanReference.blend keeps all individual components editable.\nModel_CivilianWomanReferenceBaked.blend has three PBR materials for the exported GLB.\n')

def Surface(name,points,faces,weights,material,thickness=0,subdivision=0):
    ob=Mesh(name,points,faces,weights,material)
    if subdivision:
        mod=ob.modifiers.new('TailoredSubdivision','SUBSURF');mod.levels=subdivision;mod.render_levels=subdivision
    if thickness:
        mod=ob.modifiers.new('FabricThickness','SOLIDIFY');mod.thickness=thickness;mod.offset=0
    return ob

def PathResample(points,steps=8):
    result=[]
    for i in range(len(points)-1):
        for j in range(steps):result.append(Vector(points[i]).lerp(Vector(points[i+1]),j/steps))
    result.append(Vector(points[-1]));return result

def StitchPath(name,path,weights,material=None,spacing=.006,radius=.00042):
    points=[Vector(p) for p in path];verts=[];faces=[]
    for a,b in zip(points,points[1:]):
        delta=b-a;length=delta.length
        for j in range(max(1,int(length/spacing))):
            start=a+delta*((j+.12)/max(1,int(length/spacing)));end=a+delta*((j+.64)/max(1,int(length/spacing)))
            axis=delta.normalized();u=axis.cross(Vector((0,1,0)))
            if u.length<.01:u=axis.cross(Vector((1,0,0)))
            u.normalize();v=axis.cross(u);base=len(verts)
            for p in [start,end]:
                for k in range(4):verts.append(p+radius*(u*math.cos(k*math.pi/2)+v*math.sin(k*math.pi/2)))
            for k in range(4):faces.append((base+k,base+(k+1)%4,base+4+(k+1)%4,base+4+k))
    return Mesh(name,verts,faces,weights,material or thread)

def BindRelaxed(ob,weights):
    names={}
    for vertex in ob.data.vertices:
        p=vertex.co.copy();w=weights(p);total=sum(w.values());w={n:v/total for n,v in w.items() if v>1e-6}
        for n,v in w.items():
            if n not in names:names[n]=ob.vertex_groups.new(name=n)
            names[n].add([vertex.index],v,'REPLACE')
        vertex.co=BlendMatrix(w).inverted()@p
    ob.parent=rig;mod=ob.modifiers.new('SharedNraSkin','ARMATURE');mod.object=rig
