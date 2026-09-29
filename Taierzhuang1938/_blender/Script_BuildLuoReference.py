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

def PhotoMaterial(view,skin=False,category='uniform'):
    name='Material_Luo'+view+('Skin' if skin else category.title())
    m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;l=m.node_tree.links
    bs=n.get('Principled BSDF'); tex=n.new('ShaderNodeTexImage');tex.image=images[view];tex.extension='EXTEND'
    if skin:l.new(tex.outputs['Color'],bs.inputs['Base Color'])
    else:
        colors={'uniform':(.145,.157,.169),'canvas':(.19,.17,.135),'wrap':(.30,.274,.233),'shoe':(.038,.038,.035),'sheath':(.054,.055,.051),'flask':(.22,.221,.195)}
        color=colors[category]
        wear=n.new('ShaderNodeTexNoise');wear.inputs['Scale'].default_value=65;wear.inputs['Detail'].default_value=4;wear.inputs['Roughness'].default_value=.76
        ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.2;ramp.color_ramp.elements[0].color=(*(v*.5 for v in color),1)
        ramp.color_ramp.elements[1].position=.8;ramp.color_ramp.elements[1].color=(*(v*1.55 for v in color),1)
        l.new(wear.outputs['Fac'],ramp.inputs[0])
        att=n.new('ShaderNodeVertexColor');att.layer_name='ReferenceBlend'
        mix=n.new('ShaderNodeMixRGB');l.new(att.outputs['Color'],mix.inputs[0]);l.new(ramp.outputs['Color'],mix.inputs[1]);l.new(tex.outputs['Color'],mix.inputs[2]);l.new(mix.outputs['Color'],bs.inputs['Base Color'])
    bs.inputs['Roughness'].default_value=.67 if skin else .93
    if skin:bs.inputs['Subsurface Weight'].default_value=.045
    noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=680 if skin else 260
    noise.inputs['Detail'].default_value=2.0
    bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.10 if skin else .22;bump.inputs['Distance'].default_value=.00022 if skin else .0007
    l.new(noise.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs['Normal'],bs.inputs['Normal'])
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
    bs=n.get('Principled BSDF');l.new(neck.outputs[0],bs.inputs['Base Color']);bs.inputs['Roughness'].default_value=.69;bs.inputs['Subsurface Weight'].default_value=.045
    return m

def SetRelaxed():
    for p in rig.pose.bones:p.matrix_basis.identity()
    for side,sign in [('L',1),('R',-1)]:
        p=rig.pose.bones['Bip001 '+side+' UpperArm'];axis=p.bone.matrix_local.to_3x3().inverted()@Vector((0,1,0))
        p.rotation_mode='QUATERNION';p.rotation_quaternion=Quaternion(axis,math.radians(sign*77))
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
        for li,loop in enumerate(obj.data.loops):
            p=Vector(points[loop.vertex_index]);uv.data[li].uv=ProjectUv(p,'Front',kind);sideUv.data[li].uv=ProjectUv(p,'Side',kind);backUv.data[li].uv=ProjectUv(p,'Back',kind)
            sw=Smooth(.045,.088,abs(p.x));bw=Smooth(.012,.055,p.y)
            sa.data[li].color=(sw,sw,sw,1);ba.data[li].color=(bw,bw,bw,1)
            nf=(1-Smooth(1.60,1.65,p.z))*Smooth(-.063,-.025,p.y)
            fringe.data[li].color=(nf,nf,nf,1)
        for poly in obj.data.polygons:poly.material_index=0
        return
    obj.data.materials.clear()
    category='uniform'
    for key,cat in [('Puttee','wrap'),('Shoe','shoe'),('Ammo','canvas'),('Haversack','canvas'),('Scabbard','sheath'),('Canteen','flask')]:
        if key in obj.name:category=cat
    for v in ['Front','Side','Back']:obj.data.materials.append(photoSkin[v] if kind=='head' else photo[(v,category)])
    uv=obj.data.uv_layers.new(name='UV_Reference') if not obj.data.uv_layers else obj.data.uv_layers.active
    attr=obj.data.color_attributes.get('ReferenceBlend') or obj.data.color_attributes.new(name='ReferenceBlend',type='FLOAT_COLOR',domain='CORNER')
    normals=[v.normal.copy() for v in obj.data.vertices]
    for poly in obj.data.polygons:
        pp=[Vector(points[i]) for i in poly.vertices];normal=(pp[1]-pp[0]).cross(pp[2]-pp[0]).normalized()
        center=sum(pp,Vector())/len(pp)
        view=force or ('Front' if (center.y<.005 if kind=='head' else normal.y<0) else 'Back')
        if kind=='head' and abs(center.x)>.073 and center.y>-.05:view='Side'
        if kind=='head' and center.z<1.615 and abs(center.x)>.049:view='Side'
        poly.material_index=['Front','Side','Back'].index(view)
        for li in poly.loop_indices:
            vi=obj.data.loops[li].vertex_index;p=Vector(points[vi]);uv.data[li].uv=ProjectUv(p,view,kind,obj.name)
            blend=1. if force or kind=='head' else Smooth(.45,.88,abs(normals[vi].y))
            if force in ['Front','Back'] and any(tag in obj.name for tag in ['AmmoPouch','Haversack','Canteen','Scabbard','BlanketRoll']):
                blend=Smooth(.15,.80,abs(normals[vi].y))
            if 'Sleeve' in obj.name:blend*=1-Smooth(1.405,1.46,p.z)
            if any(t in obj.name for t in ['CapCrown','CapBand']):blend*=1-Smooth(1.77,1.797,p.z)
            attr.data[li].color=(blend,blend,blend,1)

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

def Body():
    rings=[(0,0,.847,.181,.106),(0,0,.87,.182,.108),(0,0,.91,.177,.11),(0,0,.97,.171,.108),(0,0,1.04,.162,.10),(0,0,1.10,.159,.095),(0,0,1.135,.153,.092),(0,0,1.18,.160,.101),(0,0,1.24,.171,.109),(0,0,1.31,.178,.114),(0,0,1.38,.182,.11),(0,0,1.43,.185,.105),(0,.012,1.476,.178,.078),(0,.014,1.514,.058,.064)]
    Loft('Mesh_LuoTunic',rings,64,TorsoWeights,wrinkle=.0017)
    for side,sign in [('L',1),('R',-1)]:
        armRings=[]
        for i in range(25):
            z=.91+i*(1.465-.91)/24;t=(z-.91)/.568
            x=sign*(.229-.035*t);rx=.043+.009*t
            if z>1.43:rx*=1-(z-1.43)*8;x-=sign*(z-1.43)*.25
            armRings.append((x,.027,z,rx,.055+.008*t))
        armRings.extend([(sign*.170,.027,1.476,.020,.028),(sign*.15,.027,1.490,.006,.008)])
        Loft('Mesh_LuoSleeve'+side,armRings,40,lambda p,s=side:ArmWeights(p,s),wrinkle=.0028)
        legs=[(.365,.052,.055),(.39,.071,.073),(.425,.085,.09),(.48,.085,.087),(.54,.088,.084),(.62,.088,.093),(.71,.09,.10),(.80,.093,.101),(.87,.091,.099),(.925,.089,.092),(.975,.084,.079)]
        Loft('Mesh_LuoTrousers'+side,[(sign*(.101 if z<.8 else .091),.012,z,rx*.87,ry) for z,rx,ry in legs],48,lambda p,s=side:LegWeights(p,s),wrinkle=.0035)
        # Cloth puttees: tapered underlying wrap plus a real overlapping spiral.
        Loft('Mesh_LuoPuttee'+side,[(sign*(.097+.016*(z-.12)/.25),.023,z,.043+(z-.12)*.032,.049+(z-.12)*.025) for z in [.115,.15,.19,.23,.27,.31,.35,.382]],40,{'Bip001 '+side+' Calf':1},wrinkle=.0012)
        path=[]
        for j in range(240):
            t=j/239;ang=t*2*math.pi*9;z=.12+t*.261
            path.append((sign*(.097+.016*t)+(.044+.008*t)*math.cos(ang),.023+(.051+.008*t)*math.sin(ang),z))
        Tube('Mesh_LuoPutteeHem'+side,path,.0011,thread,{'Bip001 '+side+' Calf':1},6)
        shoe=Loft('Mesh_LuoClothShoe'+side,[(sign*.102,-.044,.007,.055,.115),(sign*.102,-.044,.017,.055,.115),(sign*.102,-.044,.035,.055,.111),(sign*.102,-.036,.065,.047,.097),(sign*.102,.012,.091,.042,.059),(sign*.102,.019,.119,.038,.048)],48,{'Bip001 '+side+' Foot':1},wrinkle=.0006)
        sole=[]
        for i in range(65):
            t=i*math.pi/32;sole.append((sign*.102+.0555*math.cos(t),-.044+.1155*math.sin(t),.017))
        Tube('Mesh_LuoShoeSoleSeam'+side,sole,.0015,thread,{'Bip001 '+side+' Foot':1},6)
    # Open pointed collar, centre placket and actual buttons.
    for sign in [-1,1]:
        Panel('Mesh_LuoCollar'+str(sign),[(sign*.003,-.069,1.521),(sign*.048,-.058,1.565),(sign*.089,-.076,1.511),(sign*.053,-.113,1.472)],-.002,TorsoWeights,force='Front')
    Strap('Mesh_LuoFrontPlacket',[(0,-.111,.856),(0,-.116,.98),(0,-.100,1.10),(0,-.104,1.20),(0,-.119,1.32),(0,-.115,1.43),(0,-.073,1.511)],.014,None,TorsoWeights,'Front')
    for z in [1.474,1.387,1.301,1.212,1.042,.941]:
        Ellipsoid('Mesh_LuoButton'+str(z),(0,-(.121 if z>1.26 else .113),z),(.006,.003,.006),button,TorsoWeights)
    # Belt has a rectangular buckle and a real tongue.
    Loft('Mesh_LuoBelt',[(0,0,1.105,.163,.101),(0,0,1.135,.163,.101)],64,{'Bip001 Spine':1},leather,0)
    Tube('Mesh_LuoBeltBuckle',[(-.020,-.11,1.104),(.020,-.11,1.104),(.020,-.11,1.142),(-.020,-.11,1.142),(-.020,-.11,1.104)],.0024,steel,{'Bip001 Spine':1},8)
    Tube('Mesh_LuoBeltPin',[(0,-.113,1.104),(0,-.113,1.137)],.0011,steel,{'Bip001 Spine':1},6)

def Equipment():
    for sign in [-1,1]:
        x=sign*.096
        Loft('Mesh_LuoAmmoPouch'+str(sign),[(x,-.137,1.116,.038,.017),(x,-.148,1.132,.053,.027),(x,-.148,1.17,.055,.030),(x,-.147,1.22,.057,.029),(x,-.144,1.273,.047,.023)],48,TorsoWeights,wrinkle=.0021,force='Front')
        Panel('Mesh_LuoAmmoFlap'+str(sign),[(x-.050,-.171,1.276),(x+.049,-.171,1.275),(x+.042,-.186,1.238),(x+.006,-.184,1.217),(x-.041,-.180,1.239)],-.003,TorsoWeights,force='Front')
        Ellipsoid('Mesh_LuoPouchStud'+str(sign),(x,-.186,1.227),(.004,.0025,.005),button,TorsoWeights)
        Strap('Mesh_LuoAmmoSling'+str(sign),[(x,-.167,1.268),(sign*.113,-.121,1.36),(sign*.12,-.080,1.46),(sign*.106,.0,1.503),(sign*.106,.091,1.46),(sign*.08,.125,1.30)],.013,canvas,{'Bip001 Spine2':1})
    # Flattened cloth haversack: uneven lower contour and tied neck.
    Loft('Mesh_LuoHaversack',[(0,.15,1.005,.097,.026),(0,.161,1.024,.153,.045),(0,.170,1.10,.166,.06),(0,.173,1.18,.148,.064),(0,.174,1.24,.123,.053),(0,.17,1.298,.071,.030)],64,{'Bip001 Spine1':.4,'Bip001 Spine2':.6},wrinkle=.005,force='Back')
    # Roll is horizontal, using an axis-aligned ring mesh rather than a painted cylinder.
    verts=[];faces=[];segments=48
    for j in range(25):
        x=-.157+j*.314/24
        for i in range(segments):
            a=2*math.pi*i/segments;r=.043+.003*math.sin(i*.8+j*.7)
            verts.append((x,.175+r*math.cos(a),1.372+r*math.sin(a)))
    for j in range(24):
        for i in range(segments):faces.append((j*segments+i,j*segments+(i+1)%segments,(j+1)*segments+(i+1)%segments,(j+1)*segments+i))
    Mesh('Mesh_LuoBlanketRoll',verts,faces,{'Bip001 Spine2':1},force='Back')
    for sign in [-1,1]:
        path=[]
        for j in range(150):
            t=j/149;ang=t*math.pi*2*3.8;r=.003+.038*t
            path.append((sign*.158,.175+r*math.cos(ang),1.372+r*math.sin(ang)))
        Tube('Mesh_LuoBlanketSpiral'+str(sign),path,.004,blanket,{'Bip001 Spine2':1},6)
        path=[(sign*.11,.175+.049*math.cos(i*math.pi/24),1.372+.049*math.sin(i*math.pi/24)) for i in range(49)]
        Tube('Mesh_LuoBlanketTie'+str(sign),path,.0021,rope,{'Bip001 Spine2':1},6)
        Strap('Mesh_LuoPackSling'+str(sign),[(sign*.10,.228,1.10),(sign*.11,.20,1.32),(sign*.11,.105,1.465),(sign*.107,.025,1.50)],.018,canvas,{'Bip001 Spine2':1})
    # Crossed cinch ropes and tied ends.
    for i,(a,b) in enumerate([((-.05,.236,1.29),(.045,.238,1.42)),((.05,.236,1.29),(-.045,.238,1.42)),((0,.237,1.365),(-.037,.231,1.245)),((.01,.237,1.368),(.039,.230,1.25))]):Tube('Mesh_LuoPackTie'+str(i),[a,b],.0023,rope,{'Bip001 Spine2':1})
    # Canteen at his back-right (left on rear photograph), neck and rope net.
    center=Vector((.107,.241,1.072));size=(.072,.042,.089)
    Ellipsoid('Mesh_LuoCanteen',center,size,None,{'Bip001 Spine1':1},force='Back')
    Loft('Mesh_LuoCanteenNeck',[(.105,.24,1.153,.016,.014),(.105,.24,1.182,.012,.012)],24,{'Bip001 Spine1':1},steel,0)
    Loft('Mesh_LuoCanteenCap',[(.105,.24,1.174,.015,.014),(.105,.24,1.185,.015,.014)],24,{'Bip001 Spine1':1},flask,0)
    for j in range(8):
        a=j*math.pi/4;path=[]
        for i in range(37):
            t=-1.44+2.88*i/36;path.append(center+Vector((.074*math.cos(t)*math.cos(a),.044*math.cos(t)*math.sin(a),.091*math.sin(t))))
        Tube('Mesh_LuoCanteenNetMeridian'+str(j),path,.0015,rope,{'Bip001 Spine1':1},6)
    for j,z in enumerate([-.060,-.017,.032,.067]):
        rr=math.sqrt(1-(z/.091)**2);path=[]
        for i in range(49):
            a=i*math.pi/24;path.append(center+Vector((.074*rr*math.cos(a),.044*rr*math.sin(a),z+.005*math.sin(8*a))))
        Tube('Mesh_LuoCanteenNetCross'+str(j),path,.0015,rope,{'Bip001 Spine1':1},6)
    Tube('Mesh_LuoCanteenHanger',[(.14,.20,1.31),(.12,.25,1.24),(.106,.258,1.182)],.003,rope,{'Bip001 Spine1':.4,'Bip001 Spine2':.6},8)
    # Back scabbard with ring pommel, wrapped grip and transverse guard.
    top=Vector((.13,.284,1.431));tip=Vector((-.258,.263,.688));axis=(tip-top).normalized();across=Vector((axis.z,0,-axis.x)).normalized()
    verts=[];faces=[]
    for j in range(23):
        t=j/22;c=top.lerp(tip,t);w=.037*(1-.25*t)*(1 if t<.93 else max(.16,math.cos((t-.93)/.07*math.pi/2)))
        for i in range(12):
            a=i*math.pi/6;verts.append(c+across*(w*math.cos(a))+Vector((0,.016*math.sin(a),0)))
    for j in range(22):
        for i in range(12):faces.append((j*12+i,j*12+(i+1)%12,(j+1)*12+(i+1)%12,(j+1)*12+i))
    Mesh('Mesh_LuoDadaoScabbard',verts,faces,{'Bip001 Spine2':1},force='Back')
    gripEnd=top-axis*.187
    Tube('Mesh_LuoDadaoGrip',[top,gripEnd],.018,leather,{'Bip001 Spine2':1},16)
    Tube('Mesh_LuoDadaoGuard',[top+across*.065,top-across*.065],.005,steel,{'Bip001 Spine2':1},10)
    path=[]
    for i in range(180):
        t=i/179;c=top.lerp(gripEnd,t);ang=t*2*math.pi*10
        path.append(c+across*.019*math.cos(ang)+Vector((0,.019*math.sin(ang),0)))
    Tube('Mesh_LuoDadaoGripBinding',path,.0013,thread,{'Bip001 Spine2':1},6)
    c=gripEnd-axis*.02;path=[c+across*.019*math.cos(i*math.pi/24)+axis*.019*math.sin(i*math.pi/24) for i in range(49)]
    Tube('Mesh_LuoDadaoPommelRing',path,.0031,steel,{'Bip001 Spine2':1},8)
    for j in range(4):
        c=top.lerp(tip,.20+j*.10);path=[c+across*.039*math.cos(i*math.pi/16)+Vector((0,.019*math.sin(i*math.pi/16),0)) for i in range(33)]
        Tube('Mesh_LuoScabbardLashing'+str(j),path,.0018,rope,{'Bip001 Spine2':1},6)

def Cap():
    head={'Bip001 Head':1}
    Loft('Mesh_LuoCapCrown',[(0,.006,1.718,.082,.096),(0,.006,1.744,.087,.097),(0,.008,1.767,.087,.092),(0,.008,1.787,.073,.080),(0,.008,1.802,.05,.055),(0,.008,1.814,.003,.007)],64,head,wrinkle=.0014)
    Loft('Mesh_LuoCapBand',[(0,.006,1.726,.083,.097),(0,.006,1.747,.087,.098)],64,head,wrinkle=.0004)
    verts=[];faces=[]
    for j in range(5):
        t=j/4
        for i in range(41):
            a=-1.12+2.24*i/40
            verts.append((math.sin(a)*(.083+.016*t),.006-math.cos(a)*(.098+.047*t),1.737-.014*t-.008*math.sin(a)**2))
    for j in range(4):
        for i in range(40):faces.append((j*41+i,j*41+i+1,(j+1)*41+i+1,(j+1)*41+i))
    ob=Mesh('Mesh_LuoCapBrim',verts,faces,head,force='Front');sol=ob.modifiers.new('BrimThickness','SOLIDIFY');sol.thickness=.003
    Ellipsoid('Mesh_LuoCapBadge',(0,-.093,1.788),(.0125,.002,.0125),None,head,force='Front')
    for z,rx,ry in [(1.746,.088,.099),(1.727,.084,.098)]:
        path=[(rx*math.sin(i*math.pi/32),.006-ry*math.cos(i*math.pi/32),z) for i in range(65)]
        Tube('Mesh_LuoCapSeam'+str(z),path,.0008,thread,head,6)

def Tailoring():
    for side,sign in [('L',1),('R',-1)]:
        # Actual knee patches and irregular hand stitching, matching the front sheet.
        center=sign*.105;verts=[];faces=[]
        for row in range(17):
            z=.443+row*.15/16
            for col in range(13):
                x=center-.040+col*.080/12;y=.012-.088*math.sqrt(max(.12,1-((x-sign*.101)/.077)**2))-.002
                verts.append((x,y,z))
        for row in range(16):
            for col in range(12):a=row*13+col;faces.append((a,a+1,a+14,a+13))
        Mesh('Mesh_LuoKneePatch'+side,verts,faces,lambda p,s=side:LegWeights(p,s),force='Front')
        seam=[verts[i] for i in [*range(13),*[r*13+12 for r in range(1,17)],*range(219,207,-1),*[r*13 for r in range(15,-1,-1)]]]
        Tube('Mesh_LuoKneeStitch'+side,seam,.00065,thread,lambda p,s=side:LegWeights(p,s),5)
        # Outer elbow patch, with its own side reference projection.
        verts=[];faces=[]
        for row in range(17):
            z=1.080+row*.140/16;t=(z-.91)/.568;cx=.229-.035*t;rx=.043+.009*t
            for col in range(13):
                y=-.008+col*.073/12;x=sign*(cx+rx*math.sqrt(max(.12,1-((y-.027)/(.055+.008*t))**2))+.003)
                verts.append((x,y,z))
        for row in range(16):
            for col in range(12):a=row*13+col;faces.append((a,a+1,a+14,a+13))
        Mesh('Mesh_LuoElbowPatch'+side,verts,faces,lambda p,s=side:ArmWeights(p,s),force='Side')
        boundary=[verts[i] for i in [*range(13),*[r*13+12 for r in range(1,17)],*range(219,207,-1),*[r*13 for r in range(15,-1,-1)]]]
        Tube('Mesh_LuoElbowPatchStitch'+side,boundary,.0008,thread,lambda p,s=side:ArmWeights(p,s),5)
        # Pocket panels conform to the tunic rather than floating across its surface.
        for key,z,width,height in [('Chest',1.366,.066,.040),('Hip',.977,.065,.076)]:
            cx=sign*.113
            pts=[]
            for dx,dz in [(-1,-1),(-1,1),(1,1),(1,-1)]:
                x=cx+dx*width/2;zz=z+dz*height/2;y=-.112*math.sqrt(max(.1,1-(x/.18)**2))-.004
                pts.append((x,y,zz))
            Panel('Mesh_Luo'+key+'Pocket'+side,pts,-.002,TorsoWeights,force='Front')
        # Small torn fibres at cuffs. Combined into one mesh per cuff.
        verts=[];faces=[]
        for j in range(46):
            a=2*math.pi*j/46;c=Vector((sign*.229+.043*math.cos(a),.027+.055*math.sin(a),.91))
            delta=Vector((.0007*math.cos(a),.0007*math.sin(a),0));start=len(verts)
            verts.extend([c-delta,c+delta,c+Vector((.0005*math.sin(j),0,-.003-.002*(1+math.sin(j*4))))]);faces.append((start,start+1,start+2))
        Mesh('Mesh_LuoCuffFray'+side,verts,faces,lambda p,s=side:ArmWeights(p,s),thread)

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

Clear();rig=ImportSource()
bodyBind={b.name:[list(row) for row in b.matrix_local] for b in rig.data.bones if not b.name.startswith('Face_')}
SetRelaxed();skinMatrices=SkinMatrices()
images={v:bpy.data.images.load(str(source/('Image_'+v+'View.png')),check_existing=True) for v in ['Front','Side','Back']}
for im in images.values():im.pack()
photo={(v,c):PhotoMaterial(v,False,c) for v in images for c in ['uniform','canvas','wrap','shoe','sheath','flask']};photoSkin={v:PhotoMaterial(v,True) for v in images}
headMaterial=HeadMaterial()
thread=BasicMaterial('Material_LuoThread',(.18,.165,.135))
rope=BasicMaterial('Material_LuoHemp',(.25,.21,.155))
canvas=BasicMaterial('Material_LuoCanvas',(.17,.155,.125))
blanket=BasicMaterial('Material_LuoBlanket',(.13,.14,.145))
leather=BasicMaterial('Material_LuoWornLeather',(.052,.049,.041),.77)
steel=BasicMaterial('Material_LuoOxidizedMetal',(.20,.19,.17),.62,.50)
flask=BasicMaterial('Material_LuoCanteen',(.19,.20,.19),.82,.12)
button=BasicMaterial('Material_LuoButtons',(.055,.061,.060),.73)
SourceSkin();Body();Equipment();Cap();Tailoring();SetupStudio();SetRelaxed()
rig['SkeletonContract']='TengxianHumanoidV1';rig['SourceModel']='Model_TengxianNra05Facial.glb'
rig['SourceBodyBind']=json.dumps(bodyBind)
rig['ReferenceCharacter']='Luo Maocai';rig['ReferencePose']='Relaxed; shared T bind retained'
bpy.context.scene['BlenderMcpTask']='LuoReferenceModel'
PrepareEditor()
bpy.ops.wm.save_as_mainfile(filepath=str(out/'Model_LuoReference.blend'))
Render('Front')
print('Luo build complete',len([o for o in bpy.context.scene.objects if o.type=='MESH']),str(out/'Model_LuoReference.blend'))
