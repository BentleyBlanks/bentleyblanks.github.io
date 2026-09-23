"""Build the 1938 rural two-wheel evacuation cart and ox/horse draft models.

Execute in the task's BlenderMCP instance. Set scene['OxCartProject'] to the
absolute Taierzhuang1938 directory before execution. The editable .blend is
saved outside the Pages repository; these exports are deterministic rebuilds.
Blender +Y becomes glTF -Z, the game's agreed forward direction.
"""
import bpy
import math
from pathlib import Path
from mathutils import Vector

project = Path(bpy.context.scene.get('OxCartProject', Path(__file__).resolve().parents[1]))
model_dir = project / 'Model' / 'OxCart'
model_dir.mkdir(parents=True, exist_ok=True)
private_dir = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/OxCart')
private_dir.mkdir(parents=True, exist_ok=True)

for previous in list(bpy.data.objects): bpy.data.objects.remove(previous, do_unlink=True)
for collection in list(bpy.data.collections):
    if collection.name != 'Collection': bpy.data.collections.remove(collection)
scene = bpy.context.scene
scene.render.fps = 30
scene.frame_start = 1
scene.frame_end = 31

def Material(name, color, metal=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = .86 if not metal else .68
    shader.inputs['Metallic'].default_value = metal
    return mat

wood = Material('WeatheredElm', (.31, .23, .15))
edge = Material('WornWoodEdges', (.43, .32, .21))
dark_wood = Material('AxleWood', (.22, .16, .11))
iron = Material('BlackenedIron', (.16, .17, .16), .55)
rope = Material('HempRope', (.53, .45, .29))
leather = Material('WornLeather', (.19, .12, .08))
ox_coat = Material('OxBrownCoat', (.35, .22, .14))
ox_light = Material('OxMuzzle', (.43, .31, .24))
horse_coat = Material('HorseBayCoat', (.36, .18, .11))
horse_dark = Material('HorseMane', (.09, .07, .06))
hoof = Material('HornAndHoof', (.19, .17, .14))
horn = Material('OxHorn', (.68, .62, .49))
eye = Material('DarkEye', (.025, .019, .016))

def InCollection(obj, col):
    for old in list(obj.users_collection): old.objects.unlink(obj)
    col.objects.link(obj)
    return obj

def Empty(name, position, col, parent=None):
    obj = bpy.data.objects.new(name, None)
    col.objects.link(obj)
    obj.location = position
    if parent:
        bpy.context.view_layer.update()
        obj.parent = parent
        obj.matrix_parent_inverse = parent.matrix_world.inverted()
    return obj

def Finish(obj, name, mat, col, parent=None, bevel=0):
    obj.name = name
    InCollection(obj, col)
    if mat: obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new('SoftJoinery', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 1
        modifier.affect = 'EDGES'
        modifier2 = obj.modifiers.new('WeightedNormals', 'WEIGHTED_NORMAL')
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse = parent.matrix_world.inverted()
    return obj

def Cube(name, center, size, mat, col, parent=None, bevel=.015):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return Finish(obj, name, mat, col, parent, bevel)

def Ellipsoid(name, center, scale, mat, col, parent=None, segments=12, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=center)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return Finish(obj, name, mat, col, parent)

def Cylinder(name, center, radius, depth, mat, col, parent=None, vertices=12, axis='Z'):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=center)
    obj = bpy.context.object
    if axis == 'X': obj.rotation_euler[1] = math.pi / 2
    if axis == 'Y': obj.rotation_euler[0] = math.pi / 2
    return Finish(obj, name, mat, col, parent, .005)

def Beam(name, start, end, width, depth, mat, col, parent=None):
    a, b = Vector(start), Vector(end)
    obj = Cube(name, (a+b)/2, (width, depth, (b-a).length), mat, col, parent, .008)
    obj.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
    return obj

def Curve(name, points, radius, mat, col, parent=None):
    data = bpy.data.curves.new(name, 'CURVE')
    data.dimensions = '3D'
    data.bevel_depth = radius
    data.bevel_resolution = 1
    spline = data.splines.new('POLY')
    spline.points.add(len(points)-1)
    for p, point in zip(spline.points, points): p.co = (*point, 1)
    obj = bpy.data.objects.new(name, data)
    col.objects.link(obj)
    data.materials.append(mat)
    if parent:
        bpy.context.view_layer.update()
        obj.parent = parent
        obj.matrix_parent_inverse = parent.matrix_world.inverted()
    return obj

cart_col = bpy.data.collections.new('Cart'); scene.collection.children.link(cart_col)
cart_root = Empty('CartRoot', (0,0,0), cart_col)
deck = Empty('CartDeck', (0,0,0), cart_col, cart_root)
# The deck is 2.3 x 3.5 m, top 1.12 m: two 0.6 m stretchers and a seated escort.
for index in range(10):
    x = -1.035 + index*.23
    Cube(f'DeckPlank{index:02}', (x,0,1.045), (.218,3.5,.13), edge if index%3==0 else wood, cart_col, deck, .012)
for x in (-.98,.98):
    Beam(f'LongitudinalBeam{x}', (x,-1.72,.89), (x,1.74,.89), .13,.13,dark_wood,cart_col,deck)
for y in (-1.55,-.4,.72,1.58):
    Cube(f'CrossMember{y}',(0,y,.86),(2.33,.13,.16),dark_wood,cart_col,deck)
for x in (-1.1,1.1):
    for y in (-1.58,1.58):
        Cube(f'CornerPost{x}_{y}',(x,y,1.29),(.10,.11,.48),edge,cart_col,deck)
    for z in (1.31,1.5):
        Cube(f'SideRail{x}_{z}',(x,0,z),(.075,3.35,.075),wood,cart_col,deck)
for y in (-1.68,1.68):
    Cube(f'EndRail{y}',(0,y,1.31),(2.1,.08,.12),edge,cart_col,deck)
for x in (-.52,.52):
    Beam(f'DraftShaft{x}',(x,1.12,.82),(x,4.82,.99),.105,.105,edge,cart_col,deck)
    for y in (1.73,3.2):
        Curve(f'ShaftBinding{x}_{y}',[(x-.07,y,.84),(x-.07,y,.98),(x+.07,y,1.04),(x+.07,y,.85)],.017,rope,cart_col,deck)
for x in (-.45,.45):
    Cube(f'FrontIronStrap{x}',(x,1.8,.97),(.085,.28,.025),iron,cart_col,deck,.004)
axle = Cylinder('TimberAxle',(0,-.18,.72),.11,2.83,dark_wood,cart_col,deck,12,'X')
wheel_pivots = []
for side in (-1,1):
    x=side*1.32
    pivot=Empty('WheelLeft' if side<0 else 'WheelRight',(x,-.18,.72),cart_col,cart_root)
    wheel_pivots.append(pivot)
    # Spoked 1.44 m wheels with an iron rim. Wheel axle is X.
    Cylinder(f'WheelHub{side}',(x,-.18,.72),.15,.17,dark_wood,cart_col,pivot,12,'X')
    for step in range(12):
        angle=2*math.pi*step/12
        dy,dz=math.sin(angle),math.cos(angle)
        Beam(f'Spoke{side}_{step}',(x,-.18,.72),(x,-.18+dy*.64,.72+dz*.64),.06,.09,edge,cart_col,pivot)
    for radius, bevel, material in ((.68,.077,edge),(.718,.038,iron)):
        bpy.ops.mesh.primitive_torus_add(major_segments=32,minor_segments=6,location=(x,-.18,.72),
            rotation=(0,math.pi/2,0),major_radius=radius,minor_radius=bevel)
        Finish(bpy.context.object,f'WheelRim{side}_{radius}',material,cart_col,pivot)
    Cylinder(f'IronAxleCap{side}',(x+side*.1,-.18,.72),.088,.024,iron,cart_col,pivot,10,'X')

def BuildAnimal(kind):
    is_ox = kind == 'Ox'
    col = bpy.data.collections.new(kind); scene.collection.children.link(col)
    root = Empty(kind+'Root',(0,0,0),col)
    body = Empty(kind+'BodyPivot',(0,4.15,1.25 if is_ox else 1.45),col,root)
    coat = ox_coat if is_ox else horse_coat
    Ellipsoid(kind+'Torso',(0,4.15,1.28 if is_ox else 1.45),
              (.56,.97,.58) if is_ox else (.43,.91,.48),coat,col,body)
    Ellipsoid(kind+'Chest',(0,4.75,1.32 if is_ox else 1.43),
              (.54,.45,.54) if is_ox else (.43,.38,.46),coat,col,body)
    Ellipsoid(kind+'Haunch',(0,3.46,1.29 if is_ox else 1.46),
              (.55,.44,.48) if is_ox else (.44,.4,.4),coat,col,body)
    if is_ox:
        Ellipsoid('OxDewlap',(0,4.65,.9),(.26,.32,.29),ox_light,col,body)
    else:
        Curve('HorseMane',[(0,4.86,1.91),(0,5.12,1.84),(0,5.32,1.63)],.09,horse_dark,col,body)
    head_pivot=Empty(kind+'HeadPivot',(0,4.82,1.61 if is_ox else 1.77),col,root)
    neck_end=(0,5.14,1.6 if is_ox else 1.84)
    Ellipsoid(kind+'Neck',neck_end,(.32,.43,.4),coat,col,head_pivot)
    Ellipsoid(kind+'Skull',(0,5.42,1.62 if is_ox else 1.82),
              (.31,.38,.30) if is_ox else (.22,.42,.31),coat,col,head_pivot)
    Ellipsoid(kind+'Muzzle',(0,5.72,1.43 if is_ox else 1.55),
              (.30,.24,.19) if is_ox else (.22,.26,.16),ox_light if is_ox else horse_dark,col,head_pivot)
    for side in (-1,1):
        Ellipsoid(kind+f'Ear{side}',(side*(.30 if is_ox else .20),5.31,1.84 if is_ox else 2.03),
                  (.19,.11,.075),coat,col,head_pivot)
        Ellipsoid(kind+f'Eye{side}',(side*(.292 if is_ox else .215),5.52,1.69 if is_ox else 1.88),
                  (.031,.024,.029),eye,col,head_pivot,8,6)
        if is_ox:
            Curve(f'OxHorn{side}',[(side*.27,5.27,1.84),(side*.44,5.25,1.91),(side*.58,5.26,2.04)],.064,horn,col,head_pivot)
        else:
            Beam(f'HorseEarTip{side}',(side*.15,5.28,1.99),(side*.22,5.41,2.16),.07,.07,horse_dark,col,head_pivot)
        # Four articulated legs, with each upper leg pivot at the shoulder/hip.
    leg_pivots=[]
    for side in (-1,1):
        for front in (True,False):
            x=side*(.33 if is_ox else .28)
            y=4.72 if front else 3.48
            upper_z=1.19 if is_ox else 1.42
            joint=.58 if is_ox else .68
            name=f'{kind}{"Front" if front else "Rear"}{"Left" if side<0 else "Right"}'
            pivot=Empty(name+'Pivot',(x,y,upper_z),col,root)
            Ellipsoid(name+'Upper',(x,y,(upper_z+joint)/2),(.16,.19,(upper_z-joint)/2+.07),coat,col,pivot)
            knee=Empty(name+'KneePivot',(x,y,joint),col,pivot)
            Beam(name+'Lower',(x,y,joint),(x,y-.025,.18),.12,.14,coat,col,knee)
            Ellipsoid(name+'Hoof',(x,y+.075,.105),(.16,.23,.10),hoof,col,knee,10,6)
            leg_pivots.append((pivot,knee,side,front))
    tail=Empty(kind+'TailPivot',(0,3.32,1.55 if is_ox else 1.78),col,root)
    Curve(kind+'Tail',[(0,3.33,1.5),(0,3.13,1.17),(0,3.10,.96)],.035,coat if is_ox else horse_dark,col,tail)
    # Rope halter, collar and cross-yoke sit at the actual shaft height.
    for z in (1.72 if is_ox else 1.9,):
        Curve(kind+'NoseBand',[(-.26,5.64,1.48),(-.29,5.72,1.41),(0,5.78,1.32),(.29,5.72,1.41),(.26,5.64,1.48)],.018,rope,col,head_pivot)
    for side in (-1,1):
        Curve(kind+f'CheekRope{side}',[(side*.24,5.7,1.47),(side*.28,5.44,1.7),(side*.36,4.85,1.38)],.016,rope,col,root)
        Curve(kind+f'ShaftTrace{side}',[(side*.53,4.67,1.11),(side*.53,4.4,.99),(side*.52,3.43,.89)],.018,leather,col,root)
    Curve(kind+'ShoulderHarness',[(-.51,4.62,1.50),(0,4.58,1.81 if is_ox else 1.98),(.51,4.62,1.50)],.055,leather,col,root)
    Beam(kind+'Yoke',(-.77,4.82,1.84 if is_ox else 1.9),(.77,4.82,1.84 if is_ox else 1.9),.10,.12,edge,col,root)
    # One metre per gait cycle: paired support legs alternate, slight torso and head motion.
    animated=[body,head_pivot,tail,*[entry[0] for entry in leg_pivots],*[entry[1] for entry in leg_pivots]]
    for obj in animated:
        obj.animation_data_create()
    # Blender's shared action cannot animate multiple objects with one slot in newer versions;
    # per-object actions are collected by the glTF exporter into one NLA track named Walk.
    for obj in animated:
        obj.animation_data.action = None
        act=bpy.data.actions.new(kind+'Walk_'+obj.name)
        obj.animation_data.action=act
        for frame in (1,8,16,24,31):
            phase=2*math.pi*(frame-1)/30
            if obj == body:
                obj.location.z=(1.25 if is_ox else 1.45)+.025*math.cos(2*phase)
            elif obj == head_pivot:
                obj.rotation_euler[0]=.055*math.sin(phase-.4)
            elif obj == tail:
                obj.rotation_euler[1]=.11*math.sin(phase)
            else:
                entry=next(e for e in leg_pivots if e[0] == obj or e[1] == obj)
                _,knee,side,front=entry
                offset=(0 if front else math.pi)+(0 if side<0 else math.pi)
                if obj == knee:
                    obj.rotation_euler[0]=.22*max(0,math.sin(phase+offset))
                else:
                    obj.rotation_euler[0]=.25*math.sin(phase+offset)
            obj.keyframe_insert(data_path='location' if obj==body else 'rotation_euler',frame=frame)
        track=obj.animation_data.nla_tracks.new();track.name=kind+'Walk'
        strip=track.strips.new(kind+'Walk',1,act)
        strip.action_frame_start=1;strip.action_frame_end=31
        obj.animation_data.action=None
    return col

ox_col=BuildAnimal('Ox')
horse_col=BuildAnimal('Horse')

def Consolidate(col):
    """Keep moving pivots, but batch the many planks and spoke pieces by material."""
    for obj in list(col.objects):
        if obj.type not in ('MESH','CURVE'): continue
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True); bpy.context.view_layer.objects.active=obj
        if obj.type=='CURVE': bpy.ops.object.convert(target='MESH')
    for obj in list(col.objects):
        if obj.type!='MESH': continue
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True); bpy.context.view_layer.objects.active=obj
        for modifier in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
    groups={}
    for obj in list(col.objects):
        if obj.type!='MESH': continue
        name=obj.name
        if name.startswith('DeckPlank'): group='DeckSurface'
        elif name.startswith(('DraftShaft','ShaftBinding','FrontIronStrap')): group='Shaft'
        elif name.startswith(('SideRail','CornerPost','EndRail')): group='Rail'
        elif name.startswith('Spoke'): group='Spokes'
        elif name.startswith('WheelRim'): group='Rim'
        elif name.startswith(('WheelHub','IronAxleCap')): group='Hub'
        elif name.startswith(('LongitudinalBeam','CrossMember','TimberAxle')): group='Frame'
        elif 'Leg' in name or 'Front' in name or 'Rear' in name: group='Leg'
        elif any(piece in name for piece in ('Torso','Chest','Haunch','Dewlap','Mane')): group='Body'
        elif any(piece in name for piece in ('Neck','Skull','Muzzle','Ear','Eye','Horn')): group='Head'
        else: group='Harness'
        material=obj.data.materials[0].name if obj.data.materials else 'None'
        groups.setdefault((obj.parent,group,material),[]).append(obj)
    for (parent,group,material),objects in groups.items():
        if len(objects)==1:
            objects[0].name=f'{col.name}{group}{material}'
            continue
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects: obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        bpy.ops.object.join()
        objects[0].name=f'{col.name}{group}{material}'

for collection in (cart_col,ox_col,horse_col): Consolidate(collection)

def Export(col, filename):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in col.objects: obj.select_set(True)
    bpy.context.view_layer.objects.active=next(o for o in col.objects if o.type=='MESH')
    bpy.ops.export_scene.gltf(filepath=str(model_dir/filename),export_format='GLB',
        use_selection=True,export_apply=False,export_animations=True,
        export_animation_mode='NLA_TRACKS',export_force_sampling=True,
        export_frame_range=False,export_materials='EXPORT')

Export(cart_col,'Model_WoodenEvacCart.glb')
Export(ox_col,'Model_WorkingOx.glb')
Export(horse_col,'Model_WorkingHorse.glb')
scene.frame_set(1)
for col in (cart_col,horse_col): col.hide_viewport=True
for obj in ox_col.objects:
    if obj.type=='EMPTY': obj.hide_set(False)
bpy.ops.wm.save_as_mainfile(filepath=str(private_dir/'Scene_OxCart.blend'))
print('Ox cart exports:',[(p.name,p.stat().st_size) for p in model_dir.glob('*.glb')])
