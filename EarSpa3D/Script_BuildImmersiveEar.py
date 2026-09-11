"""BlenderMCP 建模源。由 MCP 分别调用 BuildEar / BuildTools / BuildWax / Export。
Blender 1 单位 = 1 mm；转换 (x, y, depth) -> (x, -depth, y)，GLB 导出后恢复游戏 Y-up。
"""
import bpy, math, json, random
import bmesh
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
BLEND = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/EarSpa3D/ImmersiveEar/Model_ImmersiveEar.blend')

def V(p):
    return Vector((p[0], -p[2], p[1]))

def Mat(name, color, roughness=.48, metallic=0, coat=.1):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Coat Weight'].default_value = coat
    return m

def Mesh(name, vertices, faces, material):
    data = bpy.data.meshes.new(name)
    data.from_pydata([V(v) for v in vertices], [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    for p in data.polygons: p.use_smooth = True
    return obj

def Apply(obj, mod):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)

def Ellipsoid(name, center, scale, material, segments=48, rings=32):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=V(center))
    o = bpy.context.object; o.name = name
    o.scale = (scale[0], scale[2], scale[1]); o.data.materials.append(material)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for p in o.data.polygons: p.use_smooth = True
    return o

def Tube(name, points, radius, material, cyclic=False):
    bpy.ops.object.select_all(action='DESELECT')
    curve = bpy.data.curves.new(name, 'CURVE'); curve.dimensions = '3D'
    curve.resolution_u = 14; curve.bevel_depth = radius; curve.bevel_resolution = 4
    spline = curve.splines.new('BEZIER'); spline.bezier_points.add(len(points)-1)
    for bp, p in zip(spline.bezier_points, points):
        bp.co = V(p); bp.handle_left_type = bp.handle_right_type = 'AUTO'
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve); bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True); bpy.ops.object.convert(target='MESH'); obj.select_set(False)
    return obj

def SeatRidge(ear, name, points, radius, material):
    seated=[]
    for p in points:
        hit,co,normal,index=ear.ray_cast(V((p[0],p[1],-25)), V((0,0,1)))
        depth=-co.y-radius*.4 if hit else p[2]
        seated.append((p[0],p[1],depth))
    return Tube(name,seated,radius,material)

def SculptEar():
    parts=[o for o in bpy.data.objects if o.name.startswith(('Model_OuterEar','Model_Antihelix','Model_Tragus','Model_Antitragus','Model_Lobule'))]
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:o.select_set(True)
    bpy.context.view_layer.objects.active=bpy.data.objects['Model_OuterEar']
    bpy.ops.object.join();ear=bpy.context.object
    remesh=ear.modifiers.new('SculptUnion','REMESH');remesh.mode='VOXEL';remesh.voxel_size=.3;remesh.use_smooth_shade=True;remesh.use_remove_disconnected=False
    Apply(ear,remesh)
    smooth=ear.modifiers.new('SculptRelax','SMOOTH');smooth.factor=.55;smooth.iterations=3;Apply(ear,smooth)
    dec=ear.modifiers.new('MobileRetopology','DECIMATE');dec.ratio=min(1,35000/max(1,len(ear.data.polygons)));Apply(ear,dec)
    bm=bmesh.new();bm.from_mesh(ear.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(ear.data);bm.free();ear.data.validate();ear.data.update()
    print('SCULPTED_EAR',len(ear.data.vertices),len(ear.data.polygons))

def BuildEar():
    skin = Mat('Material_PeachSkin', (.81,.43,.34), .5, coat=.15)
    inner = Mat('Material_PinkCanal', (.84,.39,.36), .46, coat=.23)
    ridge = Mat('Material_SkinRidge', (.9,.56,.42), .52)
    # 带真实耳洞的环状网格：耳甲腔凹陷 → 耳轮隆起 → 有厚度的外缘。
    verts, faces = [], []
    rows, cols = 32, 128
    for i in range(rows+1):
        r = i/rows
        for j in range(cols):
            a = j/cols*math.tau
            outer = (-3.8 + 16*math.cos(a)*(1+.1*math.sin(a)), 3.5+28*math.sin(a))
            hole = (4.45*math.cos(a), 3.7*math.sin(a))
            t = r**.8
            x = hole[0]*(1-t) + outer[0]*t
            y = hole[1]*(1-t) + outer[1]*t
            z = -1.2*r - 5.1*math.exp(-((r-.87)/.145)**2) - .7*r*math.sin(a)
            verts.append((x,y,z))
            if i < rows:
                n=i*cols+j; k=i*cols+(j+1)%cols
                faces.append((n,k,k+cols,n+cols))
    pinna=Mesh('Model_OuterEar',verts,faces,skin)
    solid=pinna.modifiers.new('EarThickness','SOLIDIFY');solid.thickness=1.2;Apply(pinna,solid)
    bevel=pinna.modifiers.new('SoftRim','BEVEL');bevel.width=.32;bevel.segments=3;Apply(pinna,bevel)
    # 耳舟、对耳轮的 Y 形走向与耳屏，保留可辨认的采耳空间。
    SeatRidge(pinna,'Model_AntihelixStem',[(-6,-13,-2.3),(-10,-5,-3.2),(-11,3,-3.5),(-9,12,-4.1),(-10,20,-4.0)],1.1,ridge)
    SeatRidge(pinna,'Model_AntihelixBranch',[(-9,10,-4.0),(-4,15,-3.4),(1,19,-3.6)],.82,ridge)
    Ellipsoid('Model_Tragus',(4.3,-1.0,-2.8),(1.7,3.0,2.1),skin)
    Ellipsoid('Model_Antitragus',(-4,-8,-2.7),(2.5,1.65,1.65),skin)
    Ellipsoid('Model_Lobule',(-3.5,-22.5,-1.3),(7.8,5.7,2.8),skin)
    Ellipsoid('Model_Temple',(43,6,53),(62,86,57),skin,64,48)
    pillow=Mat('Material_MintLinen',(.54,.77,.67),.96)
    Ellipsoid('Model_Pillow',(-10,0,92),(86,99,27),pillow,48,32)
    # 管腔用游戏 canal API 的采样重建，Solidify 向外长，避免增厚挤占工作空间。
    profile=json.loads((ROOT/'Data_CanalProfile.json').read_text())
    verts,faces=[],[]
    for i,frame in enumerate(profile):
        for j,rad in enumerate(frame['radii']):
            a=j/64*math.tau
            p=[frame['center'][k]+rad*(frame['up'][k]*math.cos(a)+frame['right'][k]*math.sin(a)) for k in range(3)]
            verts.append(p)
            if i<len(profile)-1:
                n=i*64+j;k=i*64+(j+1)%64
                faces.append((n,n+64,k+64,k))
    canal=Mesh('Model_Canal',verts,faces,inner)
    solid=canal.modifiers.new('CanalThickness','SOLIDIFY');solid.thickness=.7;solid.offset=-1;Apply(canal,solid)
    # 深处用柔粉鼓膜收住，不留黑洞。
    end=profile[86];center=end['center']
    drum=Mat('Material_PearlMembrane',(.78,.6,.57),.4,coat=.3)
    Ellipsoid('Model_Eardrum',(center[0],center[1],center[2]+.5),(3.7,3.4,.25),drum)
    print('EAR_BUILT', len(verts), 'canal vertices')

def BuildTools():
    bamboo=Mat('Material_Bamboo',(.66,.46,.22),.48)
    steel=Mat('Material_SoftSteel',(.65,.75,.77),.2,.62,.3)
    silicone=Mat('Material_MintGrip',(.33,.68,.53),.64)
    # 尖端在原点，柄沿 +Y（Three 坐标）延伸；游戏以尖端为轴跟随真实触点。
    Tube('Model_ScoopShaft',[(0,.6,0),(0,3,0),(.08,10,.1),(.12,20,.25)],.10,bamboo)
    verts,faces=[],[]
    for i in range(17):
        r=i/16
        for j in range(48):
            a=j/48*math.tau
            verts.append((math.cos(a)*r*.42, math.sin(a)*r*.62, .10*r*r))
            if i<16:
                n=i*48+j;k=i*48+(j+1)%48;faces.append((n,k,k+48,n+48))
    head=Mesh('Model_ScoopHead',verts,faces,bamboo)
    solid=head.modifiers.new('SpoonThickness','SOLIDIFY');solid.thickness=.08;Apply(head,solid)
    for side in [-1,1]:
        Tube('Model_ForcepsJawLeft' if side<0 else 'Model_ForcepsJawRight',[(side*.08,0,0),(side*.22,2,0),(side*.38,6,0),(side*.16,17,0)],.065,steel)
    Tube('Model_ForcepsGrip',[(0,16.5,0),(0,19.5,0)],.19,silicone)
    glass=Mat('Material_DropperGlass',(.52,.8,.87),.12,coat=.75)
    Tube('Model_DropperPipette',[(0,0,0),(0,2.5,0),(0,5,0)],.17,glass)
    Ellipsoid('Model_DropperBulb',(0,7.3,0),(.65,2.4,.65),silicone,24,16)
    print('TOOLS_BUILT')

def BuildWax():
    rng=random.Random(20260911)
    for name,col,scale,rough in [('Dry',(.79,.57,.22),(.85,1.05,.18),.54),('Wet',(.75,.34,.055),(.72,.89,.42),.22),('Firm',(.63,.28,.065),(.88,.95,.36),.4)]:
        mat=Mat('Material_Wax'+name,col,rough,coat=.8 if name=='Wet' else .2)
        o=Ellipsoid('Model_Wax'+name,(0,0,0),scale,mat,48,28)
        for v in o.data.vertices:
            x,z,y=v.co; a=math.atan2(y,x)
            wobble=1+.09*math.sin(a*3+.4)+.035*math.cos(a*7+1.2)
            v.co.x*=wobble;v.co.z*=wobble
            if name=='Dry':v.co.y+=.026*math.sin(x*8)*math.cos(y*5)
        o.data.update()
    print('WAX_BUILT')

def BuildTray():
    ceramic=Mat('Material_CeramicTray',(.76,.91,.84),.28,coat=.45)
    verts,faces=[],[]
    profile=[(0,0),(.5,0),(.82,.04),(.96,.25),(1,.38),(1.03,.31),(.99,-.18),(.82,-.25),(0,-.25)]
    for radius,y in profile:
        for j in range(80):
            a=j/80*math.tau
            verts.append((math.cos(a)*radius*5.3,y,math.sin(a)*radius*3.2))
    for i in range(len(profile)-1):
        for j in range(80):
            k=i*80+j;n=i*80+(j+1)%80
            faces.append((k,n,n+80,k+80))
    Mesh('Model_Tray',verts,faces,ceramic)

def Export():
    BLEND.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    target=ROOT/'Models';target.mkdir(exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(target/'Model_ImmersiveEar.glb'),export_format='GLB',use_selection=False,export_apply=True,export_yup=True,export_cameras=False,export_lights=False)
    print('EXPORTED',str(target/'Model_ImmersiveEar.glb'))
