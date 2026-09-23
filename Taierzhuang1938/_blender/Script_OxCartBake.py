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

project = Path(bpy.context.scene['OxCartProject']) if 'OxCartProject' in bpy.context.scene else Path(__file__).resolve().parents[1]
model_dir = project / 'Model' / 'OxCart'
model_dir.mkdir(parents=True, exist_ok=True)
private_dir = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/OxCart')
private_dir.mkdir(parents=True, exist_ok=True)

for previous in list(bpy.data.objects): bpy.data.objects.remove(previous, do_unlink=True)
for collection in list(bpy.data.collections):
    if collection.name != 'Collection': bpy.data.collections.remove(collection)
bpy.ops.outliner.orphans_purge(do_recursive=True)
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
    obj = bpy.context.view_layer.objects.active
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return Finish(obj, name, mat, col, parent, bevel)

def Ellipsoid(name, center, scale, mat, col, parent=None, segments=12, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=center)
    obj = bpy.context.view_layer.objects.active
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for polygon in obj.data.polygons: polygon.use_smooth = True
    return Finish(obj, name, mat, col, parent)

def LoftY(name, stations, mat, col, parent=None, sides=18):
    """Continuous rib and shoulder silhouette from measured cross sections."""
    vertices = []
    faces = []
    for y, half_width, center_z, half_height in stations:
        for step in range(sides):
            angle = 2 * math.pi * step / sides
            vertices.append((half_width * math.cos(angle), y,
                             center_z + half_height * math.sin(angle)))
    for station in range(len(stations) - 1):
        for step in range(sides):
            next_step = (step + 1) % sides
            faces.append((station*sides+step, (station+1)*sides+step,
                          (station+1)*sides+next_step, station*sides+next_step))
    faces.extend((tuple(reversed(range(sides))),
                  tuple((len(stations)-1)*sides+step for step in range(sides))))
    mesh = bpy.data.meshes.new(name+'Mesh')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    for polygon in mesh.polygons: polygon.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    col.objects.link(obj)
    return Finish(obj, name, mat, col, parent)

def SmoothStations(stations, steps=3):
    """Round a measured silhouette without losing its shoulder and hip landmarks."""
    result = []
    for index in range(len(stations)-1):
        previous = stations[max(0,index-1)]
        current = stations[index]
        following = stations[index+1]
        next_station = stations[min(len(stations)-1,index+2)]
        for step in range(steps):
            t = step / steps
            values = []
            for a,b,c,d in zip(previous,current,following,next_station):
                values.append(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t
                                  +(-a+3*b-3*c+d)*t*t*t))
            result.append(tuple(values))
    result.append(stations[-1])
    return result

def LoftZ(name, stations, mat, col, parent=None, sides=14):
    """An organic limb shaped by height, center, and two cross-section radii."""
    vertices = []
    faces = []
    for z, center_x, center_y, radius_x, radius_y in stations:
        for step in range(sides):
            angle = 2*math.pi*step/sides
            vertices.append((center_x+radius_x*math.cos(angle),
                             center_y+radius_y*math.sin(angle),z))
    for station in range(len(stations)-1):
        for step in range(sides):
            next_step = (step+1)%sides
            faces.append((station*sides+step,(station+1)*sides+step,
                          (station+1)*sides+next_step,station*sides+next_step))
    faces.extend((tuple(reversed(range(sides))),
                  tuple((len(stations)-1)*sides+step for step in range(sides))))
    mesh = bpy.data.meshes.new(name+'Mesh')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    for polygon in mesh.polygons: polygon.use_smooth = True
    obj = bpy.data.objects.new(name,mesh)
    col.objects.link(obj)
    return Finish(obj,name,mat,col,parent)

def Cylinder(name, center, radius, depth, mat, col, parent=None, vertices=12, axis='Z'):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=center)
    obj = bpy.context.view_layer.objects.active
    if axis == 'X': obj.rotation_euler[1] = math.pi / 2
    if axis == 'Y': obj.rotation_euler[0] = math.pi / 2
    return Finish(obj, name, mat, col, parent, .005)

def Beam(name, start, end, width, depth, mat, col, parent=None):
    a, b = Vector(start), Vector(end)
    obj = Cube(name, (a+b)/2, (width, depth, (b-a).length), mat, col, parent, .008)
    obj.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
    return obj

def TaperBone(name, start, end, upper_radius, lower_radius, mat, col, parent=None):
    a, b = Vector(start), Vector(end)
    bpy.ops.mesh.primitive_cone_add(vertices=14, radius1=upper_radius,
                                   radius2=lower_radius, depth=(b-a).length,
                                   location=(a+b)/2)
    obj = bpy.context.view_layer.objects.active
    obj.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
    for polygon in obj.data.polygons: polygon.use_smooth = True
    return Finish(obj, name, mat, col, parent)

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
        Finish(bpy.context.view_layer.objects.active,f'WheelRim{side}_{radius}',material,cart_col,pivot)
    Cylinder(f'IronAxleCap{side}',(x+side*.1,-.18,.72),.088,.024,iron,cart_col,pivot,10,'X')

def BuildAnimal(kind):
    is_ox = kind == 'Ox'
    col = bpy.data.collections.new(kind); scene.collection.children.link(col)
    root = Empty(kind+'Root',(0,0,0),col)
    body = Empty(kind+'BodyPivot',(0,4.15,1.31 if is_ox else 1.50),col,root)
    coat = ox_coat if is_ox else horse_coat
    # The body is one tapered surface: a draft ox has a deep, heavy forequarter;
    # the horse has longer legs, a tucked barrel and a higher withers line.
    if is_ox:
        # The withers rise out of the whole forequarter.  The deep brisket,
        # narrower waist and rounded pelvic end belong to the same skin mesh.
        ox_profile = [
            (3.06,.19,1.57,1.11),(3.24,.46,1.80,.92),
            (3.45,.57,1.84,.79),(3.70,.59,1.79,.77),
            (3.96,.57,1.75,.75),(4.19,.59,1.82,.70),
            (4.40,.65,1.96,.68),(4.56,.67,2.04,.67),
            (4.72,.62,1.97,.68),(4.89,.46,1.72,.83),
            (5.05,.22,1.47,1.05)]
        torso_stations = [(y,width,(top+bottom)/2,(top-bottom)/2)
                          for y,width,top,bottom in SmoothStations(ox_profile)]
    else:
        torso_stations = [
            (3.12,.16,1.50,.22),(3.30,.38,1.48,.39),(3.56,.46,1.48,.46),
            (3.89,.43,1.46,.44),(4.18,.40,1.45,.42),(4.47,.45,1.50,.48),
            (4.72,.48,1.54,.54),(4.90,.32,1.54,.43),(5.00,.16,1.53,.23)]
    LoftY(kind+'Torso',torso_stations,coat,col,body)
    if is_ox:
        # A ventral fold under the neck and broad chest, instead of a ball.
        LoftY('OxDewlap',SmoothStations([
            (4.39,.07,.93,.12),(4.53,.19,.92,.22),
            (4.72,.24,.94,.29),(4.92,.20,1.04,.27),
            (5.14,.09,1.17,.15)]),coat,col,body,14)
    else:
        Curve('HorseMane',[(0,4.69,1.94),(0,4.87,2.15),(0,5.04,2.27),(0,5.23,2.33)],
              .075,horse_dark,col,body)
    head_pivot=Empty(kind+'HeadPivot',(0,4.82,1.61 if is_ox else 1.72),col,root)
    if is_ox:
        neck_stations = [(4.70,.33,1.44,.37),(4.90,.35,1.51,.39),
                         (5.13,.30,1.58,.34),(5.29,.20,1.61,.23)]
        skull_stations = [(5.05,.19,1.62,.19),(5.25,.30,1.66,.30),
                          (5.46,.30,1.56,.27),(5.64,.25,1.43,.20)]
    else:
        neck_stations = [(4.64,.28,1.59,.34),(4.83,.30,1.73,.41),
                         (5.02,.27,1.89,.38),(5.18,.21,2.05,.29),
                         (5.29,.15,2.15,.18)]
        skull_stations = [(5.17,.15,2.15,.19),(5.30,.21,2.13,.30),
                          (5.47,.20,1.99,.28),(5.62,.16,1.82,.20),
                          (5.70,.13,1.70,.12)]
    LoftY(kind+'Neck',neck_stations,coat,col,head_pivot)
    LoftY(kind+'Skull',skull_stations,coat,col,head_pivot)
    Ellipsoid(kind+'Muzzle',(0,5.72,1.38 if is_ox else 1.68),
              (.27,.18,.16) if is_ox else (.17,.14,.12),
              ox_light if is_ox else horse_dark,col,head_pivot,16,10)
    for side in (-1,1):
        Ellipsoid(kind+f'Ear{side}',(side*(.30 if is_ox else .18),5.31 if is_ox else 5.26,
                                   1.84 if is_ox else 2.43),
                  (.19,.11,.075) if is_ox else (.09,.09,.16),coat,col,head_pivot)
        Ellipsoid(kind+f'Eye{side}',(side*(.292 if is_ox else .195),5.52 if is_ox else 5.46,
                                     1.69 if is_ox else 2.07),
                  (.031,.024,.029),eye,col,head_pivot,8,6)
        if is_ox:
            Curve(f'OxHorn{side}',[(side*.27,5.27,1.84),(side*.44,5.25,1.91),(side*.58,5.26,2.04)],.064,horn,col,head_pivot)
        else:
            Beam(f'HorseEarTip{side}',(side*.18,5.26,2.47),(side*.19,5.32,2.63),.055,.055,horse_dark,col,head_pivot)
        # Four articulated legs, with each upper leg pivot at the shoulder/hip.
    leg_pivots=[]
    for side in (-1,1):
        for front in (True,False):
            x=side*(.39 if is_ox else .28)
            y=4.72 if front else 3.48
            upper_z=1.27 if is_ox else 1.48
            joint=(.57 if front else .62) if is_ox else .72
            knee_y=y+(.03 if front else -.23) if is_ox else y+(.06 if front else -.18)
            foot_y=y+(.07 if front else .03) if is_ox else y+(.10 if front else .06)
            name=f'{kind}{"Front" if front else "Rear"}{"Left" if side<0 else "Right"}'
            pivot=Empty(name+'Pivot',(x,y,upper_z),col,root)
            if is_ox:
                # The upper foreleg flows out of the shoulder; the haunch
                # narrows through a backwards hock. Keep pivots for the walk.
                upper_stations = (
                    [(1.65,side*.30,y-.09,.15,.18),
                     (1.42,side*.36,y-.06,.20,.23),
                     (1.23,x,y-.03,.25,.26),
                     (1.03,x,y,.20,.22),(.76,x,knee_y-.015,.15,.17),
                     (joint,x,knee_y,.125,.14)] if front else
                    [(1.59,side*.27,3.47,.14,.18),
                     (1.43,side*.31,3.44,.18,.23),
                     (1.25,x,3.38,.27,.30),
                     (1.03,x,3.32,.22,.23),(.80,x,3.27,.16,.18),
                     (joint,x,knee_y,.125,.15)])
                LoftZ(name+'Upper',SmoothStations(upper_stations,2),coat,col,pivot)
            else:
                TaperBone(name+'Upper',(x,y,upper_z),(x,knee_y,joint),
                          .155 if front else .19,.095,coat,col,pivot)
            knee=Empty(name+'KneePivot',(x,knee_y,joint),col,pivot)
            if is_ox:
                lower_stations = [
                    (joint+.04,x,knee_y,.125,.14),
                    (.48,x,knee_y+(.015 if front else .08),.105,.12),
                    (.30,x,foot_y-.03,.095,.105),
                    (.17,x,foot_y,.12,.12)]
                LoftZ(name+'Lower',SmoothStations(lower_stations,2),coat,col,knee)
            else:
                TaperBone(name+'Lower',(x,knee_y,joint),(x,foot_y,.18),
                          .085,.06,coat,col,knee)
            Ellipsoid(name+'Hoof',(x,foot_y+.07,.105),
                      (.16,.23,.10) if is_ox else (.135,.17,.11),hoof,col,knee,12,8)
            leg_pivots.append((pivot,knee,side,front))
    tail=Empty(kind+'TailPivot',(0,3.32,1.55 if is_ox else 1.78),col,root)
    Curve(kind+'Tail',[(0,3.33,1.5),(0,3.13,1.17),(0,3.10,.96)],.035,coat if is_ox else horse_dark,col,tail)
    # Rope halter, collar and cross-yoke sit at the actual shaft height.
    if is_ox:
        nose_points=[(-.26,5.64,1.48),(-.29,5.72,1.41),(0,5.78,1.32),
                     (.29,5.72,1.41),(.26,5.64,1.48)]
    else:
        nose_points=[(-.16,5.66,1.77),(-.18,5.74,1.70),(0,5.79,1.62),
                     (.18,5.74,1.70),(.16,5.66,1.77)]
    Curve(kind+'NoseBand',nose_points,.018,rope,col,head_pivot)
    for side in (-1,1):
        cheek = ([(side*.24,5.7,1.47),(side*.28,5.44,1.7),(side*.36,4.85,1.38)]
                 if is_ox else
                 [(side*.16,5.70,1.76),(side*.20,5.42,2.10),(side*.30,4.86,1.72)])
        Curve(kind+f'CheekRope{side}',cheek,.016,rope,col,root)
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
                obj.location.z=(1.31 if is_ox else 1.50)+.025*math.cos(2*phase)
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
