"""Build the 1938 rural two-wheel evacuation cart and ox/horse draft models.

Execute in the task's BlenderMCP instance (set scene['OxCartProject'] to the
absolute Taierzhuang1938 directory first), or headless from the worktree:
  blender -b --factory-startup --python Taierzhuang1938/_blender/Script_OxCartBake.py
The editable .blend is saved outside the Pages repository; these exports are
deterministic rebuilds.
Blender +Y becomes glTF -Z, the game's agreed forward direction.
"""
import bpy
import math
import random
from pathlib import Path
from mathutils import Matrix, Vector

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
tire_iron = Material('ForgedWheelTire', (.075, .078, .073), .62)
worn_iron = Material('IronContactWear', (.19, .18, .16), .55)
rope = Material('HempRope', (.53, .45, .29))
leather = Material('WornLeather', (.12, .075, .046))
ox_coat = Material('OxBrownCoat', (.35, .22, .14))
ox_light = Material('OxMuzzle', (.43, .31, .24))
ox_ear = Material('OxEarInterior', (.29, .17, .14))
ox_socket = Material('OxEyeSocket', (.27, .16, .10))
horse_coat = Material('HorseBayCoat', (.36, .18, .11))
horse_leg = Material('HorseLowerLeg', (.16, .085, .055))
horse_light = Material('HorseFetlockAndBlaze', (.70, .57, .42))
horse_muzzle = Material('HorseMuzzle', (.23, .17, .15))
horse_dark = Material('HorseMane', (.09, .07, .06))
hoof = Material('HornAndHoof', (.19, .17, .14))
horn = Material('OxHorn', (.68, .62, .49))
eye = Material('DarkEye', (.025, .019, .016))


def PaintedMaterial(mat, name, base, seed, grain=False):
    """Small deterministic colour maps survive the GLB export without a shader patch."""
    rng = random.Random(seed)
    size = 256
    image = bpy.data.images.new(name, width=size, height=size, alpha=True)
    pixels = []
    for row in range(size):
        for column in range(size):
            u, v = column / size, row / size
            if grain:
                wave = math.sin(2*math.pi*(v*19 + .075*math.sin(u*17)))
                fine = math.sin(2*math.pi*(v*57 + .04*math.sin(u*31)))
                value = .075*wave + .025*fine + rng.uniform(-.024,.024)
            else:
                broad = math.sin(2*math.pi*(u*3.2 + .12*math.sin(v*9)))
                fine = rng.uniform(-1,1)
                hair = -.075 if rng.random() < .024 else 0
                value = .037*broad + .026*fine + hair
            pixels.extend((*[max(.015,min(.95,channel*(1+value))) for channel in base], 1))
    image.pixels.foreach_set(pixels)
    image.pack()
    nodes = mat.node_tree.nodes
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = image
    mat.node_tree.links.new(tex.outputs['Color'], nodes.get('Principled BSDF').inputs['Base Color'])


PaintedMaterial(edge, 'WornElmGrain', (.43,.32,.21), 1939, True)


def PbrMaterial(mat, material_name):
    """Use aligned imagegen-derived maps; glTF embeds their compact PNGs."""
    texture_dir = project / 'Texture' / 'OxCart'
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    shader = nodes.get('Principled BSDF')

    def image_node(suffix, non_color=False):
        image = bpy.data.images.load(str(texture_dir / f'Texture_{material_name}{suffix}.png'), check_existing=False)
        image.pack()
        if non_color:
            image.colorspace_settings.name = 'Non-Color'
        node = nodes.new('ShaderNodeTexImage')
        node.image = image
        return node

    base_color = image_node('BaseColor')
    links.new(base_color.outputs['Color'], shader.inputs['Base Color'])
    metal_rough = image_node('MetallicRoughness', True)
    channels = nodes.new('ShaderNodeSeparateColor')
    links.new(metal_rough.outputs['Color'], channels.inputs['Color'])
    links.new(channels.outputs['Green'], shader.inputs['Roughness'])
    links.new(channels.outputs['Blue'], shader.inputs['Metallic'])
    normal_image = image_node('Normal', True)
    normal_map = nodes.new('ShaderNodeNormalMap')
    normal_map.inputs['Strength'].default_value = .55
    links.new(normal_image.outputs['Color'], normal_map.inputs['Color'])
    links.new(normal_map.outputs['Normal'], shader.inputs['Normal'])


for material, name in (
    (wood, 'Elm'), (iron, 'ForgedIron'), (tire_iron, 'ForgedIron'),
    (leather, 'HarnessLeather'), (ox_coat, 'OxCoat'),
    (horse_coat, 'HorseCoat'),
):
    PbrMaterial(material, name)

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

def Frame(origin, pitch):
    """Local modelling frame: +Y runs along the part, +Z is its top; pitched about X."""
    return Matrix.Translation(Vector(origin)) @ Matrix.Rotation(pitch, 4, 'X')

def At(frame, point):
    return (frame @ Vector(point))[:]

def LoftY(name, stations, mat, col, parent=None, sides=18, frame=None):
    """Continuous rib and shoulder silhouette from measured cross sections.

    Stations are (y, half_width, center_z, half_height); with a frame they are
    authored along the frame's local Y (a pitched neck or head)."""
    vertices = []
    faces = []
    for y, half_width, center_z, half_height in stations:
        for step in range(sides):
            angle = 2 * math.pi * step / sides
            point = Vector((half_width * math.cos(angle), y,
                            center_z + half_height * math.sin(angle)))
            vertices.append((frame @ point)[:] if frame else point[:])
    for station in range(len(stations) - 1):
        for step in range(sides):
            next_step = (step + 1) % sides
            faces.append((station*sides+step, (station+1)*sides+step,
                          (station+1)*sides+next_step, station*sides+next_step))
    faces.extend((tuple(range(sides)),
                  tuple((len(stations)-1)*sides+step for step in reversed(range(sides)))))
    mesh = bpy.data.meshes.new(name+'Mesh')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv = mesh.uv_layers.new(name='CoatUV')
    span = max(.001,stations[-1][0]-stations[0][0])
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            station, side = divmod(vertex_index,sides)
            seam = side == 0 and any(mesh.loops[i].vertex_index % sides == sides-1
                                     for i in polygon.loop_indices)
            uv.data[loop_index].uv = (1 if seam else side/sides,
                                      (stations[station][0]-stations[0][0])/span)
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
    faces.extend((tuple(range(sides)),
                  tuple((len(stations)-1)*sides+step for step in reversed(range(sides)))))
    mesh = bpy.data.meshes.new(name+'Mesh')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv = mesh.uv_layers.new(name='CoatUV')
    span = max(.001,stations[0][0]-stations[-1][0])
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            station, side = divmod(vertex_index,sides)
            seam = side == 0 and any(mesh.loops[i].vertex_index % sides == sides-1
                                     for i in polygon.loop_indices)
            uv.data[loop_index].uv = (1 if seam else side/sides,
                                      (stations[0][0]-stations[station][0])/span)
    for polygon in mesh.polygons: polygon.use_smooth = True
    obj = bpy.data.objects.new(name,mesh)
    col.objects.link(obj)
    return Finish(obj,name,mat,col,parent)


def LoftX(name, stations, mat, col, parent=None, sides=12):
    """Pointed, flattened ear rooted in the skull rather than a floating oval."""
    vertices, faces = [], []
    direction = 1 if stations[-1][0] > stations[0][0] else -1
    for x, center_y, center_z, radius_y, radius_z in stations:
        for step in range(sides):
            angle = 2*math.pi*step/sides
            vertices.append((x, center_y+radius_y*math.cos(angle),
                             center_z+radius_z*math.sin(angle)))
    for station in range(len(stations)-1):
        for step in range(sides):
            next_step = (step+1)%sides
            face = (station*sides+step,(station+1)*sides+step,
                    (station+1)*sides+next_step,station*sides+next_step)
            faces.append(face if direction > 0 else tuple(reversed(face)))
    faces.extend((tuple(reversed(range(sides))),
                  tuple((len(stations)-1)*sides+step for step in range(sides))))
    mesh = bpy.data.meshes.new(name+'Mesh')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    for polygon in mesh.polygons: polygon.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    col.objects.link(obj)
    return Finish(obj, name, mat, col, parent)


def TaperCurve(name, stations, mat, col, parent=None, sides=10):
    """Closed tapering tube for the swept horns and hanging tail."""
    points = [Vector(item[:3]) for item in stations]
    vertices, faces = [], []
    for index, (point, station) in enumerate(zip(points, stations)):
        tangent = (points[min(index+1,len(points)-1)] -
                   points[max(index-1,0)]).normalized()
        reference = Vector((0,1,0)) if abs(tangent.y) < .9 else Vector((1,0,0))
        axis = tangent.cross(reference).normalized()
        other = tangent.cross(axis).normalized()
        for step in range(sides):
            angle = 2*math.pi*step/sides
            vertex = point + station[3]*(math.cos(angle)*axis + math.sin(angle)*other)
            vertices.append(vertex[:])
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


def HoofDigit(name, center_x, foot_y, direction, mat, col, parent):
    """One flat grounded toe (a 1.4 m bullock's claw is ~8 x 13 cm) with a
    sloped front wall; the pair converge at the tips around a narrow cleft."""
    vertices, faces = [], []
    sections = [(-.05,.036,.006,.078),(.0,.041,.004,.080),
                (.06,.039,.004,.056),(.105,.027,.006,.020)]
    for offset_y, half_width, bottom, top in sections:
        x = center_x - direction*(.006 if offset_y > .05 else 0)
        y = foot_y + offset_y
        vertices.extend([(x-half_width,y,bottom),(x+half_width,y,bottom),
                         (x+half_width,y,top),(x-half_width,y,top)])
    for station in range(len(sections)-1):
        for edge_index in range(4):
            next_edge = (edge_index+1)%4
            faces.append((station*4+edge_index,station*4+next_edge,
                          (station+1)*4+next_edge,(station+1)*4+edge_index))
    faces.extend(((3,2,1,0),(12,13,14,15)))
    mesh = bpy.data.meshes.new(name+'Mesh')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name,mesh)
    col.objects.link(obj)
    return Finish(obj,name,mat,col,parent,.004)


def HorseHoof(name, center_x, foot_y, mat, col, parent):
    """A grounded rounded toe (13 cm across) and a narrower coronet."""
    outline = [(-.045,-.050),(.045,-.050),(.062,-.025),
               (.066,.025),(.052,.070),(.028,.088),(-.028,.088),
               (-.052,.070),(-.066,.025),(-.062,-.025)]
    vertices, faces = [], []
    for z, scale, forward in ((.004,1,0),(.045,.93,-.012),(.080,.76,-.030)):
        vertices.extend((center_x+x*scale,foot_y+y*scale+forward,z)
                        for x,y in outline)
    sides = len(outline)
    for station in range(2):
        for step in range(sides):
            next_step = (step+1)%sides
            faces.append((station*sides+step,station*sides+next_step,
                          (station+1)*sides+next_step,(station+1)*sides+step))
    faces.extend((tuple(reversed(range(sides))),
                  tuple(2*sides+step for step in range(sides))))
    mesh = bpy.data.meshes.new(name+'Mesh')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name,mesh)
    col.objects.link(obj)
    return Finish(obj,name,mat,col,parent,.006)

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

def Curve(name, points, radius, mat, col, parent=None, cyclic=False):
    data = bpy.data.curves.new(name, 'CURVE')
    data.dimensions = '3D'
    data.bevel_depth = radius
    data.bevel_resolution = 1
    spline = data.splines.new('POLY')
    spline.use_cyclic_u = cyclic
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


def WheelArc(name, center, inner_radius, outer_radius, width, start, end,
             mat, col, parent, divisions=4):
    """A square-section felloe or iron tire; X is the wheel axle."""
    x, y, z = center
    vertices, faces = [], []
    for step in range(divisions+1):
        angle = start + (end-start)*step/divisions
        along_y, along_z = math.sin(angle), math.cos(angle)
        vertices.extend([
            (x-width/2, y+inner_radius*along_y, z+inner_radius*along_z),
            (x-width/2, y+outer_radius*along_y, z+outer_radius*along_z),
            (x+width/2, y+outer_radius*along_y, z+outer_radius*along_z),
            (x+width/2, y+inner_radius*along_y, z+inner_radius*along_z),
        ])
    for step in range(divisions):
        for edge_index in range(4):
            next_edge = (edge_index+1) % 4
            faces.append((step*4+edge_index, step*4+next_edge,
                          (step+1)*4+next_edge, (step+1)*4+edge_index))
    faces.extend(((3,2,1,0), tuple(divisions*4+index for index in range(4))))
    mesh = bpy.data.meshes.new(name+'Mesh')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    col.objects.link(obj)
    return Finish(obj, name, mat, col, parent)


def WheelSpoke(name, center, angle, mat, col, parent):
    """Tapered rectangular wood spoke, seated in both hub and felloe."""
    x, y, z = center
    radial_y, radial_z = math.sin(angle), math.cos(angle)
    tangent_y, tangent_z = math.cos(angle), -math.sin(angle)
    vertices = []
    for radius, half_width, half_depth in ((.13,.055,.052),(.625,.033,.042)):
        for axial, tangent in ((-1,-1),(1,-1),(1,1),(-1,1)):
            vertices.append((x+axial*half_depth,
                             y+radius*radial_y+tangent*half_width*tangent_y,
                             z+radius*radial_z+tangent*half_width*tangent_z))
    faces = [(3,2,1,0),(4,5,6,7)]
    faces.extend((index,(index+1)%4,(index+1)%4+4,index+4) for index in range(4))
    mesh = bpy.data.meshes.new(name+'Mesh')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    col.objects.link(obj)
    return Finish(obj, name, mat, col, parent, .004)


def WheelHub(name, center, mat, col, parent):
    """Barrel-shaped timber hub with shoulders for the spoke tenons."""
    x, y, z = center
    stations = ((-.15,.125),(-.105,.17),(.105,.17),(.15,.125))
    vertices, faces = [], []
    for offset, radius in stations:
        for step in range(16):
            angle = 2*math.pi*step/16
            vertices.append((x+offset,y+radius*math.sin(angle),
                             z+radius*math.cos(angle)))
    for station in range(len(stations)-1):
        for step in range(16):
            next_step = (step+1)%16
            faces.append((station*16+step,station*16+next_step,
                          (station+1)*16+next_step,(station+1)*16+step))
    faces.extend((tuple(reversed(range(16))),
                  tuple((len(stations)-1)*16+step for step in range(16))))
    mesh = bpy.data.meshes.new(name+'Mesh')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    col.objects.link(obj)
    return Finish(obj, name, mat, col, parent)


# Shaft line shared by the cart and both harnesses (cart frame, metres).
SHAFT_TIP_Y = 4.18
SHAFT_EYE_Y = 4.02
def ShaftAt(y, side):
    t = (y-1.12)/(SHAFT_TIP_Y-1.12)
    return (side*(.62-.22*t), y, .82+.15*t)

cart_col = bpy.data.collections.new('Cart'); scene.collection.children.link(cart_col)
cart_root = Empty('CartRoot', (0,0,0), cart_col)
deck = Empty('CartDeck', (0,0,0), cart_col, cart_root)
# The deck is 2.3 x 3.5 m, top 1.12 m: two 0.6 m stretchers and a seated escort.
for index in range(10):
    x = -1.035 + index*.23
    Cube(f'DeckPlank{index:02}', (x,0,1.045), (.218,3.5,.13), edge if index in (0,9) else wood, cart_col, deck, .012)
for x in (-.98,.98):
    Beam(f'LongitudinalBeam{x}', (x,-1.72,.89), (x,1.74,.89), .13,.13,dark_wood,cart_col,deck)
for y in (-1.55,-.4,.72,1.58):
    Cube(f'CrossMember{y}',(0,y,.86),(2.33,.13,.16),dark_wood,cart_col,deck)
# Paired axle saddles transfer the deck load into the fixed timber axle.
for x in (-.89,.89):
    Cube(f'AxleSaddle{x}',(x,-.18,.805),(.23,.39,.21),dark_wood,cart_col,deck,.012)
    for y in (-.355,-.005):
        Cube(f'AxleClamp{x}_{y}',(x,y,.805),(.025,.032,.29),iron,cart_col,deck,.003)
    Cube(f'AxleClampTop{x}',(x,-.18,.951),(.027,.38,.025),iron,cart_col,deck,.002)
for x in (-1.1,1.1):
    for y in (-1.58,1.58):
        Cube(f'CornerPost{x}_{y}',(x,y,1.29),(.10,.11,.48),edge,cart_col,deck)
        Cube(f'PostFoot{x}_{y}',(x,y,1.13),(.15,.17,.16),dark_wood,cart_col,deck,.005)
        Cylinder(f'PostPeg{x}_{y}',(x+(.079 if x>0 else -.079),y,1.33),
                 .016,.011,dark_wood,cart_col,deck,8,'X')
    Cube(f'SideBoard{x}',(x,0,1.235),(.064,3.32,.20),wood,cart_col,deck,.005)
    Cube(f'SideBoardUpper{x}',(x,0,1.40),(.064,3.32,.10),wood,cart_col,deck,.005)
    Cube(f'SideRail{x}',(x,0,1.50),(.075,3.35,.075),edge,cart_col,deck)
for y in (-1.68,1.68):
    Cube(f'EndBoard{y}',(0,y,1.22),(2.1,.075,.18),wood,cart_col,deck,.005)
    Cube(f'EndBoardUpper{y}',(0,y,1.40),(2.1,.075,.10),wood,cart_col,deck,.005)
    Cube(f'EndRail{y}',(0,y,1.50),(2.1,.08,.08),edge,cart_col,deck)
for side in (-1,1):
    # The shafts converge from the deck to a 0.80 m tip gap that clears the
    # ox's 0.66 m barrel, rising to point-of-shoulder height on both animals.
    # Its rear tenon runs beneath the deck crossmember.
    x0,_,z0 = ShaftAt(1.12,side)
    x1,_,z1 = ShaftAt(SHAFT_TIP_Y,side)
    Beam(f'DraftShaft{side}',(x0,1.12,z0),(x1,SHAFT_TIP_Y,z1),
         .105,.105,edge,cart_col,deck)
    Cube(f'ShaftSocket{side}',(side*.63,1.73,.87),(.18,.30,.16),dark_wood,cart_col,deck,.008)
    for y in (1.73,3.00):
        x,_,z = ShaftAt(y,side)
        Curve(f'ShaftBinding{side}_{y}',[(x-.068,y,z-.058),(x-.068,y,z+.058),
              (x+.068,y,z+.058),(x+.068,y,z-.058),(x-.068,y,z-.058)],
              .013,rope,cart_col,deck)
    x,_,z = ShaftAt(SHAFT_EYE_Y,side)
    # A forged eye near each tip is where the collar traces / yoke ropes tie.
    Curve(f'ShaftIronEye{side}',[(x,SHAFT_EYE_Y+.06*math.cos(step*math.pi/8),
          z+.06*math.sin(step*math.pi/8)) for step in range(17)],
          .012,iron,cart_col,deck)
    Cube(f'FrontIronStrap{side}',(side*.64,1.82,.96),(.09,.26,.025),iron,cart_col,deck,.004)
axle = Cylinder('TimberAxle',(0,-.18,.72),.11,3.00,dark_wood,cart_col,deck,12,'X')
wheel_pivots = []
for side in (-1,1):
    x=side*1.32
    pivot=Empty('WheelLeft' if side<0 else 'WheelRight',(x,-.18,.72),cart_col,cart_root)
    wheel_pivots.append(pivot)
    # The 0.72 m rolling radius meets the ground at z=0; the wheel turns around X.
    center = (x,-.18,.72)
    WheelHub(f'WheelHub{side}',center,dark_wood,cart_col,pivot)
    for step in range(12):
        angle=2*math.pi*step/12
        WheelSpoke(f'Spoke{side}_{step}',center,angle,edge,cart_col,pivot)
        gap = .011
        WheelArc(f'WheelRimFelloe{side}_{step}',center,.605,.691,.145,
                 angle-math.pi/12+gap,angle+math.pi/12-gap,
                 wood if step%3 else edge,cart_col,pivot)
        bolt_angle = angle+math.pi/12
        Cylinder(f'WheelRimPeg{side}_{step}',
                 (x+side*.079,-.18+.65*math.sin(bolt_angle),.72+.65*math.cos(bolt_angle)),
                 .013,.012,iron,cart_col,pivot,8,'X')
    WheelArc(f'WheelTire{side}',center,.691,.72,.153,0,2*math.pi,
             tire_iron,cart_col,pivot,divisions=72)
    # Short burnished marks on the exposed iron side; the dark forging stays
    # dominant and the contact radius remains exactly 0.72 m.
    for step in range(12):
        angle = step*2*math.pi/12
        WheelArc(f'WheelIronWear{side}_{step}',
                 (x+side*.079,-.18,.72),.701,.708,.006,
                 angle+.045,angle+2*math.pi/12-.065,
                 worn_iron,cart_col,pivot,divisions=3)
    for offset in (-.108,.108):
        Cylinder(f'WheelHubBand{side}_{offset}',(x+offset,-.18,.72),
                 .149,.024,iron,cart_col,pivot,16,'X')
    Cylinder(f'IronAxleCap{side}',(x+side*.171,-.18,.72),.073,.027,iron,cart_col,pivot,12,'X')

# ---------------------------------------------------------------------------
# Draft animals, authored in the cart's frame (metres above ground, +Y ahead).
# Sizes are the 1938 local breeds, not fantasy draughts: a Luxi (鲁西) bullock
# and a North China cart horse both stand ~1.40 m at the withers, i.e. at a
# 1.70 m carter's shoulder. The game hangs the animal root TEAM_OFFSET_M ahead
# of the cart (Data_Tuning_FirstLevelMid.draft.teamOffsetM); the GLB root
# carries the same number as an extra so Script_DraftCartModel can re-centre.
TEAM_OFFSET_M = 3.3
# Walk: stride (m travelled per clip loop) and the planted share of each loop.
GAIT = {'Horse': dict(stride=1.25, duty=.62, bob=.012, nod=.055),
        'Ox': dict(stride=1.05, duty=.64, bob=.010, nod=.030)}

# Each leg is a hidden upper joint (P0 shoulder/hip -> P1 elbow/stifle, inside
# the body) plus the visible column P1 -> P2 knee/hock -> P3 fetlock.  All the
# length change a planted hoof needs happens at the hidden joint, so the
# visible leg stays a straight weight-bearing column; the knee/hock only folds
# in swing (front knee folds the cannon back, hind hock swings it forward).
# P0/P1 were searched offline for zero planted-hoof error over the whole loop.
LEGS = {
    'Horse': {
        True: dict(x=.14, P=((3.52,1.33),(3.92,1.05),(3.87,.45),(3.88,.15)),
                   fold=-1.25, lift=.16, flex=-.55,
                   mid=[(.98,3.905,.085,.13),(.84,3.89,.08,.115),(.72,3.878,.066,.088),
                        (.60,3.872,.054,.07),(.50,3.87,.05,.062),(.44,3.87,.053,.064)],
                   cannon=[(.47,3.87,.052,.063),(.41,3.872,.041,.053),(.25,3.877,.036,.048),
                           (.19,3.879,.046,.062),(.145,3.88,.048,.062),(.12,3.882,.04,.05)]),
        False: dict(x=.15, P=((2.79,1.33),(2.99,1.05),(2.71,.50),(2.73,.15)),
                    fold=.75, lift=.12, flex=-.45,
                    thigh=((.165,2.84,1.02),(.095,.21,.25)),
                    mid=[(.90,2.94,.095,.13),(.78,2.875,.078,.105),(.66,2.79,.062,.088),
                         (.57,2.735,.054,.08),(.51,2.715,.05,.072)],
                    hock=(2.668,.545,.035,.04,.055),
                    cannon=[(.53,2.71,.05,.064),(.46,2.713,.041,.056),(.25,2.724,.037,.05),
                            (.19,2.727,.046,.062),(.145,2.73,.048,.062),(.12,2.732,.04,.05)]),
    },
    'Ox': {
        True: dict(x=.17, P=((3.52,1.17),(3.87,.96),(3.85,.38),(3.86,.13)),
                   fold=-1.0, lift=.11, flex=-.45,
                   mid=[(.90,3.875,.10,.14),(.74,3.866,.09,.12),(.60,3.86,.076,.095),
                        (.47,3.855,.066,.078),(.40,3.85,.066,.076)],
                   cannon=[(.42,3.85,.062,.072),(.34,3.852,.052,.06),(.20,3.857,.048,.056),
                           (.15,3.86,.056,.064),(.12,3.86,.052,.058)]),
        False: dict(x=.18, P=((2.63,1.23),(2.86,.91),(2.62,.44),(2.64,.13)),
                    fold=.6, lift=.10, flex=-.35,
                    mid=[(.82,2.80,.09,.12),(.70,2.73,.076,.10),(.58,2.665,.066,.085),
                         (.48,2.628,.06,.076),(.43,2.62,.06,.074)],
                    hock=(2.578,.47,.035,.04,.05),
                    cannon=[(.46,2.62,.058,.068),(.38,2.625,.05,.058),(.20,2.635,.047,.055),
                            (.15,2.64,.055,.062),(.12,2.64,.052,.058)]),
    },
}


def Wrap(angle):
    return math.atan2(math.sin(angle), math.cos(angle))


def LegRotations(P, target, fold):
    """Two-link IK in the leg's YZ plane with the knee/hock folded by `fold`.

    Returns (pivot, elbow local, cannon world) rotations about X and the
    distance by which the fetlock misses its target (0 unless out of reach)."""
    P0, P1, P2, P3 = (Vector((0,)+p) for p in P)
    folded = Matrix.Rotation(fold, 3, 'X') @ (P3-P2)
    upper, lower = P1-P0, P2+folded-P1
    reach = Vector((0,)+tuple(target))-P0
    a, b, d = upper.length, lower.length, reach.length
    rest_reach = P3-P0
    bend = 1 if rest_reach.y*upper.z-rest_reach.z*upper.y > 0 else -1
    clamped = max(abs(a-b)+1e-5, min(a+b-1e-5, d))
    alpha = math.acos((a*a+clamped*clamped-b*b)/(2*a*clamped))
    upper_angle = math.atan2(reach.z, reach.y)+bend*alpha
    knee = P0+a*Vector((0,math.cos(upper_angle),math.sin(upper_angle)))
    to_target = Vector((0,)+tuple(target))-knee
    lower_angle = math.atan2(to_target.z, to_target.y)
    end = knee+b*Vector((0,math.cos(lower_angle),math.sin(lower_angle)))
    pivot = Wrap(upper_angle-math.atan2(upper.z, upper.y))
    lower_world = Wrap(lower_angle-math.atan2(lower.z, lower.y))
    return pivot, Wrap(lower_world-pivot), lower_world+fold, (end-Vector((0,)+tuple(target))).length


def LegPose(leg, gait, step, root_z):
    """Hoof target and fold for one leg at `step` (0..1) of the walk loop."""
    P3 = leg['P'][3]
    sweep = gait['stride']*gait['duty']
    if step < gait['duty']:
        # Planted: the fetlock tracks backwards at exactly road speed.
        return (P3[0]+sweep/2-sweep*step/gait['duty'], P3[1]-root_z), 0, 0
    progress = (step-gait['duty'])/(1-gait['duty'])
    eased = progress*progress*(3-2*progress)
    arc = math.sin(math.pi*progress)
    return ((P3[0]-sweep/2+sweep*eased, P3[1]+leg['lift']*arc-root_z),
            leg['fold']*arc, arc)


def TorsoRing(stations, y, angles, outset, x_sign=1):
    """Points on the loft surface at `y`, pushed out by `outset` (harness)."""
    for index in range(len(stations)-1):
        if stations[index][0] <= y <= stations[index+1][0]: break
    lo, hi = stations[index], stations[index+1]
    t = (y-lo[0])/max(1e-6, hi[0]-lo[0])
    half_width, center_z, half_height = (lo[k]+(hi[k]-lo[k])*t for k in (1,2,3))
    return [(x_sign*(half_width+outset)*math.cos(math.radians(a)), y,
             center_z+(half_height+outset)*math.sin(math.radians(a))) for a in angles]


def BuildLeg(kind, coat, lower_coat, col, root, side, front):
    leg = LEGS[kind][front]
    x = side*leg['x']
    name = f'{kind}{"Front" if front else "Rear"}{"Left" if side<0 else "Right"}'
    (y0,z0),(y1,z1),(y2,z2),(y3,z3) = leg['P']
    pivot = Empty(name+'Pivot',(x,y0,z0),col,root)
    elbow = Empty(name+'ElbowPivot',(x,y1,z1),col,pivot)
    knee = Empty(name+'KneePivot',(x,y2,z2),col,elbow)
    hoof_pivot = Empty(name+'HoofPivot',(x,y3,z3),col,knee)
    loft = lambda stations: [(z,x,y,rx,ry) for z,y,rx,ry in stations]
    if 'thigh' in leg:
        (tx,ty,tz),scale = leg['thigh']
        Ellipsoid(name+'Upper',(side*tx,ty,tz),scale,coat,col,pivot,16,12)
    LoftZ(name+'Forearm',SmoothStations(loft(leg['mid']),2),coat,col,elbow)
    if 'hock' in leg:
        hy,hz,rx,ry,rz = leg['hock']
        Ellipsoid(name+'HockPoint',(x,hy,hz),(rx,ry,rz),coat,col,elbow,12,8)
    LoftZ(name+'Cannon',SmoothStations(loft(leg['cannon']),2),lower_coat,col,knee)
    if kind == 'Horse':
        LoftZ(name+'Pastern',loft([(.16,y3,.043,.052),(.11,y3+.012,.037,.044),
              (.07,y3+.022,.046,.052)]),lower_coat,col,hoof_pivot)
        HorseHoof(name+'Hoof',x,y3+.025,hoof,col,hoof_pivot)
    else:
        LoftZ(name+'Pastern',loft([(.13,y3,.052,.058),(.085,y3+.008,.05,.052)]),
              lower_coat,col,hoof_pivot)
        for digit in (-1,1):
            HoofDigit(name+f'HoofDigit{digit}',x+digit*.043,y3+.01,digit,hoof,col,hoof_pivot)
            Ellipsoid(name+f'DewClaw{digit}',(x+digit*.035,y3-.055,.10),
                      (.016,.02,.022),hoof,col,hoof_pivot,8,6)
    return dict(leg=leg, side=side, front=front, pivot=pivot, elbow=elbow,
                knee=knee, hoof=hoof_pivot)


HORSE_TORSO = [
    (2.50,.05,1.26,1.12),(2.55,.15,1.33,.98),(2.64,.215,1.37,.88),
    (2.78,.245,1.39,.82),(2.96,.25,1.385,.79),(3.14,.25,1.36,.76),
    (3.34,.255,1.345,.73),(3.54,.255,1.355,.715),(3.70,.24,1.395,.72),
    (3.82,.215,1.43,.75),(3.93,.19,1.41,.80),(4.02,.15,1.33,.88),
    (4.08,.07,1.20,.97),(4.10,.02,1.12,1.02)]
OX_TORSO = [
    (2.44,.06,1.26,1.10),(2.50,.19,1.31,.86),(2.66,.27,1.33,.74),
    (2.84,.30,1.33,.66),(3.06,.32,1.315,.59),(3.30,.33,1.31,.57),
    (3.52,.32,1.32,.58),(3.70,.30,1.37,.60),(3.84,.27,1.40,.62),
    (3.96,.24,1.34,.64),(4.06,.17,1.20,.68),(4.10,.06,1.06,.78)]
TorsoStations = lambda profile: [(y,w,(top+bottom)/2,(top-bottom)/2) for y,w,top,bottom in SmoothStations(profile)]


def BuildHorse(col, root):
    coat = horse_coat
    body = Empty('HorseBodyPivot',(0,TEAM_OFFSET_M,1.0),col,root)
    torso = TorsoStations(HORSE_TORSO)
    LoftY('HorseTorso',torso,coat,col,body)
    for side in (-1,1):
        # Shoulder and forearm muscle where the scapula meets the chest.
        Ellipsoid(f'HorseShoulderChest{side}',(side*.15,3.93,1.07),(.09,.13,.17),coat,col,body,14,10)
    head_pivot = Empty('HorseHeadPivot',(0,3.88,1.24),col,root)
    neck = Frame((0,3.90,1.18),math.radians(50))
    neck_stations = [(-.12,.19,-.02,.30),(.02,.18,0,.285),(.16,.155,.015,.235),
                     (.30,.13,.02,.185),(.43,.11,.018,.145),(.54,.095,.012,.12),
                     (.62,.085,.005,.105),(.67,.07,0,.08)]
    LoftY('HorseNeck',SmoothStations(neck_stations,2),coat,col,head_pivot,18,neck)
    head = Frame((0,4.30,1.745),math.radians(-58))
    skull = [(0,.07,0,.06),(.04,.10,-.025,.115),(.10,.11,-.055,.155),
             (.17,.105,-.0575,.1525),(.25,.085,-.0225,.1075),(.34,.07,-.005,.08),
             (.44,.068,-.005,.07),(.52,.075,-.01,.07),(.57,.06,-.0125,.0575),
             (.60,.03,-.0125,.0275)]
    LoftY('HorseSkull',SmoothStations(skull,2),coat,col,head_pivot,18,head)
    pitch = math.radians(-58)
    muzzle = Ellipsoid('HorseMuzzle',At(head,(0,.535,-.012)),(.078,.075,.068),horse_muzzle,col,head_pivot,16,10)
    lip = Ellipsoid('HorseLowerLip',At(head,(0,.52,-.075)),(.05,.05,.025),horse_muzzle,col,head_pivot,12,8)
    for obj in (muzzle, lip): obj.rotation_euler[0] = pitch
    top_of_face = {.12:.10,.22:.09,.32:.077,.42:.067,.50:.062}
    Curve('HorseBlaze',[At(head,(0,y,z+.004)) for y,z in top_of_face.items()],
          .017,horse_light,col,head_pivot)
    TaperCurve('HorseForelockHair',[At(head,(0,.0,.095))+(.03,),At(head,(0,.07,.115))+(.03,),
               At(head,(0,.14,.112))+(.004,)],horse_dark,col,head_pivot,8)
    # Mane lies along the crest and falls to the off (right) side.
    crest = [(y,cz+hh) for y,_,cz,hh in neck_stations[1:]]
    TaperCurve('HorseNeckHairCrest',[At(neck,(0,y,top+.01))+(r,) for (y,top),r in
               zip(reversed(crest),(.02,.035,.04,.042,.04,.035,.03))],horse_dark,col,head_pivot)
    for index in range(14):
        y = .64-index*.047
        top = next(cz+hh for yy,_,cz,hh in reversed(neck_stations) if yy <= y+1e-6)
        base = Vector(At(neck,(.015,y,top)))
        TaperCurve(f'HorseNeckHairTuft{index}',[base[:]+(.02,),(base+Vector((.05,-.01,-.03)))[:]+(.018,),
                   (base+Vector((.085,-.035,-.12)))[:]+(.002,)],horse_dark,col,head_pivot,8)
    for side in (-1,1):
        base = Vector(At(head,(side*.05,.035,.085)))
        TaperCurve(f'HorseEar{side}',[base[:]+(.032,),(base+Vector((side*.02,.012,.08)))[:]+(.03,),
                   (base+Vector((side*.035,.028,.15)))[:]+(.014,),
                   (base+Vector((side*.04,.036,.18)))[:]+(.002,)],coat,col,head_pivot,10)
        TaperCurve(f'HorseEarInterior{side}',[(base+Vector((side*.018,.03,.07)))[:]+(.014,),
                   (base+Vector((side*.03,.042,.13)))[:]+(.008,)],horse_dark,col,head_pivot,8)
        socket = Ellipsoid(f'HorseEyeSocket{side}',At(head,(side*.098,.15,.04)),(.028,.04,.032),horse_muzzle,col,head_pivot,12,8)
        ball = Ellipsoid(f'HorseEye{side}',At(head,(side*.108,.155,.042)),(.02,.03,.024),eye,col,head_pivot,12,8)
        glint = Ellipsoid(f'HorseEyeGlint{side}',At(head,(side*.124,.165,.05)),(.005,.007,.005),horse_light,col,head_pivot,8,6)
        nostril = Ellipsoid(f'HorseNostril{side}',At(head,(side*.04,.585,.008)),(.014,.012,.022),eye,col,head_pivot,10,6)
        for obj in (socket, ball, glint, nostril): obj.rotation_euler[0] = pitch
        # Bridle: headpiece behind the ears, cheek strap to the bit, snaffle ring.
        Curve(f'HorseCheekStrap{side}',[At(head,(side*.03,.03,.10)),At(head,(side*.085,.045,.035)),
              At(head,(side*.098,.25,-.01)),At(head,(side*.083,.46,-.045))],.012,leather,col,head_pivot)
        ring = Cylinder(f'HorseBitRing{side}',At(head,(side*.084,.47,-.055)),.024,.01,iron,col,head_pivot,12,'X')
        Curve(f'HorseRein{side}',[At(head,(side*.09,.47,-.055)),At(head,(side*.15,.24,-.20)),
              At(neck,(side*.16,.30,.05)),At(neck,(side*.2,.12,.22))],.008,leather,col,head_pivot)
    Curve('HorseBrowband',[At(head,(-.10,.07,.05)),At(head,(0,.075,.105)),At(head,(.10,.07,.05))],
          .011,leather,col,head_pivot)
    Curve('HorseNoseBand',[At(head,(.08*math.cos(a*math.pi/8),.40,-.004+.08*math.sin(a*math.pi/8)))
          for a in range(16)],.011,leather,col,head_pivot,True)
    tail = Empty('HorseTailPivot',(0,2.52,1.30),col,root)
    TaperCurve('HorseTailDock',[(0,2.53,1.31,.06),(0,2.475,1.24,.055),(0,2.445,1.12,.045)],coat,col,tail)
    TaperCurve('HorseTailHair',[(0,2.50,1.26,.05),(0,2.44,1.10,.08),(0,2.415,.90,.095),
               (0,2.405,.70,.09),(0,2.41,.52,.06),(0,2.42,.42,.004)],horse_dark,col,tail,12)
    for index in range(9):
        spread, shift = (index-4)*.022, (index%3-1)*.02
        TaperCurve(f'HorseTailStrand{index}',[(spread*.3,2.45,1.05,.02),
                   (spread,2.405+shift,.75,.022),(spread*1.25,2.41+shift,.44+(index%3)*.04,.002)],
                   horse_dark,col,tail,8)
    # Shaft harness: a padded straw collar over the neck base takes the pull
    # through wooden hames and traces to the shafts; a back pad with tugs holds
    # the shafts up and the breeching lets the horse brake the cart.
    collar_y = .10
    Curve('HorseCollarPad',[At(neck,(.215*math.cos(a*math.pi/12),collar_y,.005+.315*math.sin(a*math.pi/12)))
          for a in range(24)],.05,rope,col,root,True)
    for side in (-1,1):
        Curve(f'HorseHame{side}',[At(neck,(side*.265*math.cos(math.radians(a)),collar_y+.015,
              .005+.36*math.sin(math.radians(a)))) for a in (72,45,15,-15,-40)],.022,dark_wood,col,root)
        Curve(f'HorseTrace{side}',[At(neck,(side*.26,collar_y+.02,-.13)),
              (side*.40,3.75,1.0),ShaftAt(3.30,side)],.018,leather,col,root)
        tug = ShaftAt(3.52,side)
        Curve(f'HorseShaftTug{side}',TorsoRing(torso,3.52,[25,5,-12],.03,side)+[
              (tug[0]-side*.02,tug[1],tug[2]+.06),(tug[0]+side*.06,tug[1],tug[2]),
              (tug[0]-side*.02,tug[1],tug[2]-.06)],.02,leather,col,root)
        Curve(f'HorseHipStrap{side}',[(side*.31,2.76,1.03),(side*.19,2.80,1.30),(0,2.82,1.405)],
              .018,leather,col,root)
    Curve('HorseBackPad',TorsoRing(torso,3.52,range(25,160,15),.03),.045,leather,col,root)
    Curve('HorseBellyGirth',TorsoRing(torso,3.52,range(-20,-165,-15),.02),.03,leather,col,root)
    Curve('HorseBreeching',[ShaftAt(3.00,-1),(-.33,2.84,1.02),(-.29,2.66,1.04),(-.17,2.54,1.06),
          (0,2.495,1.07),(.17,2.54,1.06),(.29,2.66,1.04),(.33,2.84,1.02),ShaftAt(3.00,1)],
          .028,leather,col,root)
    return body, head_pivot, tail


def BuildOx(col, root):
    coat = ox_coat
    body = Empty('OxBodyPivot',(0,TEAM_OFFSET_M,1.0),col,root)
    torso = TorsoStations(OX_TORSO)
    LoftY('OxTorso',torso,coat,col,body)
    LoftY('OxDewlap',SmoothStations([(3.98,.06,.70,.10),(4.10,.065,.76,.14),
          (4.22,.06,.84,.12),(4.32,.04,.93,.08)]),coat,col,body,14)
    for side in (-1,1):
        # Pin bones square off the bovine rump either side of the tail-head.
        Ellipsoid(f'OxHaunchPin{side}',(side*.09,2.47,1.215),(.045,.045,.04),coat,col,body,10,6)
        Ellipsoid(f'OxShoulderChest{side}',(side*.19,3.90,.98),(.10,.14,.18),coat,col,body,14,10)
    head_pivot = Empty('OxHeadPivot',(0,3.90,1.10),col,root)
    neck = Frame((0,3.92,1.06),math.radians(12))
    neck_stations = [(-.10,.22,0,.29),(.05,.20,.01,.25),(.18,.17,0,.20),
                     (.30,.14,-.01,.165),(.38,.11,-.01,.13),(.43,.075,-.01,.085)]
    LoftY('OxNeck',SmoothStations(neck_stations,2),coat,col,head_pivot,18,neck)
    pitch = math.radians(-50)
    head = Frame((0,4.30,1.25),pitch)
    skull = [(0,.11,-.01,.07),(.05,.15,-.03,.115),(.12,.16,-.045,.135),
             (.20,.135,-.035,.12),(.30,.105,-.015,.085),(.40,.095,-.01,.07),
             (.47,.105,-.0125,.0675),(.52,.09,-.0125,.0475),(.54,.05,-.01,.02)]
    # A bullock's head is heavy: every head feature below is authored at
    # the lighter scale above and grown together by HEAD_SCALE about the poll.
    HEAD_SCALE = 1.12
    head = head @ Matrix.Scale(HEAD_SCALE, 4)
    LoftY('OxSkull',SmoothStations(skull,2),coat,col,head_pivot,18,head)
    grown = lambda size: tuple(value*HEAD_SCALE for value in size)
    parts = [Ellipsoid('OxMuzzle',At(head,(0,.49,-.012)),grown((.112,.07,.075)),ox_light,col,head_pivot,16,10),
             Ellipsoid('OxLowerLip',At(head,(0,.47,-.078)),grown((.075,.05,.025)),ox_light,col,head_pivot,12,8)]
    for side in (-1,1):
        parts += [
            Ellipsoid(f'OxNostrilRim{side}',At(head,(side*.05,.545,.012)),(.028,.014,.022),ox_socket,col,head_pivot,10,6),
            Ellipsoid(f'OxNostril{side}',At(head,(side*.05,.553,.013)),(.017,.01,.013),eye,col,head_pivot,10,6),
            Ellipsoid(f'OxEyeSocket{side}',At(head,(side*.15,.13,.012)),(.026,.04,.032),ox_socket,col,head_pivot,12,8),
            Ellipsoid(f'OxEye{side}',At(head,(side*.162,.135,.014)),(.018,.027,.022),eye,col,head_pivot,12,8)]
        base = Vector(At(head,(side*.10,.015,.05)))
        Ellipsoid(f'OxHornRoot{side}',base[:],(.04,.04,.035),coat,col,head_pivot,10,6)
        TaperCurve(f'OxHorn{side}',[base[:]+(.032,),(base+Vector((side*.05,.01,.035)))[:]+(.028,),
                   (base+Vector((side*.10,.04,.075)))[:]+(.02,),(base+Vector((side*.12,.08,.12)))[:]+(.012,),
                   (base+Vector((side*.115,.11,.15)))[:]+(.003,)],horn,col,head_pivot)
        ear = Vector(At(head,(side*.13,.09,-.02)))
        LoftX(f'OxEar{side}',[(ear.x,ear.y,ear.z,.025,.02),(ear.x+side*.06,ear.y+.005,ear.z-.01,.05,.03),
              (ear.x+side*.12,ear.y+.01,ear.z-.025,.045,.025),(ear.x+side*.16,ear.y+.012,ear.z-.035,.006,.006)],
              coat,col,head_pivot)
        LoftX(f'OxEarInterior{side}',[(ear.x+side*.03,ear.y+.022,ear.z-.004,.01,.01),
              (ear.x+side*.08,ear.y+.028,ear.z-.013,.03,.015),(ear.x+side*.13,ear.y+.024,ear.z-.028,.004,.004)],
              ox_ear,col,head_pivot,10)
    for obj in parts: obj.rotation_euler[0] = pitch
    # Halter rope round the muzzle and behind the horns, iron nose ring and
    # the lead rope back to the near-side shaft where the carter walks.
    Curve('OxHalterNose',[At(head,(.115*math.cos(a*math.pi/8),.42,-.01+.095*math.sin(a*math.pi/8)))
          for a in range(16)],.011,rope,col,head_pivot,True)
    for side in (-1,1):
        Curve(f'OxHalterCheek{side}',[At(head,(side*.11,.42,.0)),At(head,(side*.15,.15,.0)),
              At(head,(side*.11,.03,.02)),At(head,(0,-.01,.07))],.011,rope,col,head_pivot)
    Curve('OxNoseRing',[At(head,(0,.555+.02*math.cos(a*math.pi/6),-.035+.02*math.sin(a*math.pi/6)))
          for a in range(12)],.005,iron,col,head_pivot,True)
    Curve('OxLeadRope',[At(head,(0,.555,-.055)),At(head,(-.12,.46,-.12)),(-.30,3.95,.86),
          ShaftAt(3.60,-1)],.011,rope,col,head_pivot)
    tail = Empty('OxTailPivot',(0,2.47,1.20),col,root)
    TaperCurve('OxTail',[(0,2.47,1.22,.04),(0,2.43,1.10,.035),(0,2.415,.85,.025),(0,2.41,.55,.02)],
               coat,col,tail)
    TaperCurve('OxTailTuft',[(0,2.41,.58,.022),(0,2.405,.48,.05),(0,2.40,.38,.055),(0,2.40,.30,.004)],
               horse_dark,col,tail)
    # Bent wooden yoke (牛轭) on the neck ahead of the hump; its two ends are
    # roped to the shaft eyes. Belly band and breeching ropes as on the horse.
    yoke = [At(neck,(.25*math.cos(math.radians(a)),.04,.01+.29*math.sin(math.radians(a))))
            for a in range(-5,186,15)]
    TaperCurve('OxYoke',[p+(.048,) for p in yoke],edge,col,root,10)
    Curve('OxYokeThroatRope',[At(neck,(.23*math.cos(math.radians(a)),.04,.01+.27*math.sin(math.radians(a))))
          for a in range(185,356,17)],.012,rope,col,root)
    for side, end in ((-1,yoke[-1]),(1,yoke[0])):
        Curve(f'OxYokeRope{side}',[end,((end[0]+ShaftAt(SHAFT_EYE_Y,side)[0])/2,end[1]+.02,end[2]),
              ShaftAt(SHAFT_EYE_Y,side)],.014,rope,col,root)
        tug = ShaftAt(3.50,side)
        Curve(f'OxShaftTug{side}',[TorsoRing(torso,3.50,[20],.02,side)[0],(tug[0],tug[1],tug[2]+.06),
              (tug[0]+side*.05,tug[1],tug[2]),(tug[0],tug[1],tug[2]-.06)],.014,rope,col,root)
    Curve('OxBellyRope',TorsoRing(torso,3.50,range(20,-201,-20),.02),.014,rope,col,root)
    Curve('OxBreeching',[ShaftAt(3.00,-1),(-.38,2.80,.97),(-.32,2.62,.99),(-.19,2.50,1.0),
          (0,2.465,1.0),(.19,2.50,1.0),(.32,2.62,.99),(.38,2.80,.97),ShaftAt(3.00,1)],
          .016,rope,col,root)
    return body, head_pivot, tail


def BuildAnimal(kind):
    col = bpy.data.collections.new(kind); scene.collection.children.link(col)
    root = Empty(kind+'Root',(0,0,0),col)
    gait = GAIT[kind]
    # glTF extras -> three.js userData: the runtime reads these instead of
    # keeping its own copies of the stride and the re-centring offset.
    root['strideM'] = gait['stride']
    root['teamOffsetM'] = TEAM_OFFSET_M
    body, head_pivot, tail = (BuildHorse if kind == 'Horse' else BuildOx)(col, root)
    lower_coat = horse_leg if kind == 'Horse' else ox_coat
    legs = [BuildLeg(kind, horse_coat if kind == 'Horse' else ox_coat, lower_coat,
                     col, root, side, front) for side in (-1,1) for front in (True,False)]
    # Lateral-sequence walk: LH, LF, RH, RF a quarter loop apart.
    offsets = {(-1,False): 0, (-1,True): .25, (1,False): .5, (1,True): .75}
    animated = [root, body, head_pivot, tail]
    for entry in legs: animated += [entry['pivot'], entry['elbow'], entry['knee'], entry['hoof']]
    keys = {obj.name: [] for obj in animated}
    worst = 0
    for frame in range(1, 32):
        step = (frame-1)/30
        phase = 2*math.pi*step
        root_z = gait['bob']*math.cos(4*math.pi*step)
        keys[root.name].append(('location', (0, 0, root_z)))
        keys[body.name].append(('location', tuple(body.location)))
        keys[head_pivot.name].append(('rotation_euler', (gait['nod']*math.sin(2*phase-.6), 0,
                                                         .025*math.sin(phase))))
        keys[tail.name].append(('rotation_euler', (.03*math.sin(2*phase), .09*math.sin(phase), 0)))
        for entry in legs:
            leg = entry['leg']
            gait_step = (step+offsets[(entry['side'], entry['front'])]) % 1
            target, fold, arc = LegPose(leg, gait, gait_step, root_z)
            pivot, elbow, cannon_world, miss = LegRotations(leg['P'], target, fold)
            worst = max(worst, miss)
            # Flat on the road while planted; in swing the pastern flexes and
            # the hoof sole turns back under the folded cannon.
            hoof = (1-arc)*(-cannon_world)+arc*leg['flex']
            for obj, value in ((entry['pivot'],pivot),(entry['elbow'],elbow),
                               (entry['knee'],fold),(entry['hoof'],hoof)):
                keys[obj.name].append(('rotation_euler', (value, 0, 0)))
    print(f'{kind} gait: worst fetlock miss {worst*1000:.2f} mm')
    for obj in animated:
        obj.animation_data_create()
        # Blender's shared action cannot animate multiple objects with one slot
        # in newer versions; per-object actions are collected by the glTF
        # exporter into one NLA track named Walk.
        act = bpy.data.actions.new(kind+'Walk_'+obj.name)
        obj.animation_data.action = act
        for frame, (path, value) in enumerate(keys[obj.name], 1):
            setattr(obj, path, value)
            obj.keyframe_insert(data_path=path, frame=frame)
        track = obj.animation_data.nla_tracks.new(); track.name = kind+'Walk'
        strip = track.strips.new(kind+'Walk',1,act)
        strip.action_frame_start = 1; strip.action_frame_end = 31
        obj.animation_data.action = None
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
        elif name.startswith(('SideRail','SideBoard','CornerPost','PostFoot','PostPeg','EndRail','EndBoard')): group='Rail'
        elif name.startswith('Spoke'): group='Spokes'
        elif name.startswith(('WheelRim','WheelTire')): group='Rim'
        elif name.startswith(('WheelHub','IronAxleCap')): group='Hub'
        elif name.startswith(('LongitudinalBeam','CrossMember','TimberAxle','AxleSaddle','AxleClamp')): group='Frame'
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

# --- Runtime draw budget (2026-09-27) ---------------------------------------
# Consolidate still left ~60 separately-drawn pieces per cart (28 cart + 31/36
# animal), and every piece is submitted in two shadow cascades, the prepass and
# the main pass. Each model now exports as ONE skinned mesh whose primitives are
# one per material: the moving pivots become bones (rigid 1.0 weights), untextured
# paints collapse into two vertex-colour materials, and ForgedWheelTire (the same
# ForgedIron maps as BlackenedIron) folds into BlackenedIron.  Cart 5 draws,
# ox 5, horse 4 per pass.  Bone names are the old pivot names, so WheelLeft /
# OxFrontLeftPivot / the Walk clip bind exactly as before.

def FlatPaint(name, roughness, metallic):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    shader = nodes.get('Principled BSDF')
    paint = nodes.new('ShaderNodeVertexColor')
    paint.layer_name = 'FlatColor'
    mat.node_tree.links.new(paint.outputs['Color'], shader.inputs['Base Color'])
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    return mat

flat_paint = FlatPaint('FlatPaint', .86, 0)
flat_metal = FlatPaint('FlatPaintMetal', .68, .55)
MATERIAL_FOLD = {'ForgedWheelTire': 'BlackenedIron'}

def PivotOf(obj):
    parent = obj.parent
    while parent is not None and parent.type != 'EMPTY': parent = parent.parent
    return parent

def BatchForRuntime(col, prefix, clip=None):
    scene.frame_set(1)
    bpy.context.view_layer.update()
    empties = [o for o in col.objects if o.type == 'EMPTY']
    meshes = [o for o in col.objects if o.type == 'MESH']
    # 1. Materials: textured ones stay, flat paints become a vertex colour.
    for obj in meshes:
        mat = obj.data.materials[0] if obj.data.materials else None
        if mat and mat.name in MATERIAL_FOLD:
            mat = bpy.data.materials[MATERIAL_FOLD[mat.name]]
            obj.data.materials[0] = mat
        textured = bool(mat) and any(node.type == 'TEX_IMAGE' for node in mat.node_tree.nodes)
        color = (1, 1, 1, 1)
        if mat and not textured:
            shader = mat.node_tree.nodes.get('Principled BSDF')
            color = tuple(shader.inputs['Base Color'].default_value)
            obj.data.materials[0] = flat_metal if shader.inputs['Metallic'].default_value > 0 else flat_paint
        paint = obj.data.color_attributes.new('FlatColor', 'FLOAT_COLOR', 'CORNER')
        for item in paint.data: item.color = color
        # 2. One UV layer that holds exactly what TEXCOORD_0 held before (textured
        #    pieces without UVs sampled texel 0,0 — keep that look, don't re-unwrap).
        uvs = obj.data.uv_layers
        if len(uvs) == 0:
            layer = uvs.new(name='UVMap')
            for item in layer.data: item.uv = (0, 0)
        else:
            keep = uvs[0].name
            for name in [layer.name for layer in uvs if layer.name != keep]: uvs.remove(uvs[name])
            uvs[0].name = 'UVMap'
    # 3. Armature: one bone per pivot empty, rest = the pivot's frame-1 world matrix.
    rest = {e.name: e.matrix_world.normalized() for e in empties}
    armature = bpy.data.armatures.new(prefix + 'Rig')
    rig = bpy.data.objects.new(prefix + 'Rig', armature)
    col.objects.link(rig)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bones = {}
    for e in empties:
        bone = armature.edit_bones.new(e.name)
        bone.head = (0, 0, 0); bone.tail = (0, .1, 0)
        bone.matrix = rest[e.name]
        bones[e.name] = bone
    for e in empties:
        pivot = PivotOf(e)
        if pivot is not None: bones[e.name].parent = bones[pivot.name]
    bpy.ops.object.mode_set(mode='OBJECT')
    # 4. Bake the pivots' walk onto the bones (same frames the NLA export sampled).
    if clip:
        bone_rest = {bone.name: bone.matrix_local.copy() for bone in armature.bones}
        rig.animation_data_create()
        action = bpy.data.actions.new(clip)
        rig.animation_data.action = action
        for frame in range(1, 32):
            scene.frame_set(frame)
            world = {e.name: e.matrix_world.normalized() for e in empties}
            for e in empties:
                pivot = PivotOf(e)
                if pivot is not None:
                    basis = (bone_rest[pivot.name].inverted() @ bone_rest[e.name]).inverted() \
                        @ (world[pivot.name].inverted() @ world[e.name])
                else:
                    basis = bone_rest[e.name].inverted() @ world[e.name]
                pose = rig.pose.bones[e.name]
                pose.matrix_basis = basis
                pose.keyframe_insert('location', frame=frame)
                pose.keyframe_insert('rotation_quaternion', frame=frame)
        track = rig.animation_data.nla_tracks.new(); track.name = clip
        strip = track.strips.new(clip, 1, action)
        strip.action_frame_start = 1; strip.action_frame_end = 31
        rig.animation_data.action = None
        scene.frame_set(1)
        bpy.context.view_layer.update()
    # 5. Rigid skin: every piece follows its pivot bone with weight 1.0.
    for obj in meshes:
        pivot = PivotOf(obj)
        group = obj.vertex_groups.new(name=pivot.name)
        group.add(range(len(obj.data.vertices)), 1.0, 'REPLACE')
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = world
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes: obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    merged = meshes[0]
    merged.name = prefix + 'Batch'; merged.data.name = prefix + 'BatchMesh'
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    merged.parent = rig
    modifier = merged.modifiers.new('Armature', 'ARMATURE'); modifier.object = rig
    # 6. The pivots now live only as bones; the root's custom properties
    #    (strideM / teamOffsetM glTF extras) move onto the rig node.
    for e in empties:
        if PivotOf(e) is None:
            for key in e.keys(): rig[key] = e[key]
    for e in empties: bpy.data.objects.remove(e, do_unlink=True)
    return merged

BatchForRuntime(cart_col, 'Cart')
BatchForRuntime(ox_col, 'Ox', 'OxWalk')
BatchForRuntime(horse_col, 'Horse', 'HorseWalk')

def Export(col, filename):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in col.objects: obj.select_set(True)
    bpy.context.view_layer.objects.active=next(o for o in col.objects if o.type=='MESH')
    bpy.ops.export_scene.gltf(filepath=str(model_dir/filename),export_format='GLB',
        use_selection=True,export_apply=False,export_animations=True,
        export_animation_mode='NLA_TRACKS',export_force_sampling=True,
        export_frame_range=False,export_materials='EXPORT',export_extras=True)

def CompactGlb(path):
    """Shrink what the rigid skin added to the download (Pages serves ~0.5 MB/s).

    The exporter writes WEIGHTS_0 as float4 and COLOR_0 as float3 on every
    primitive. Rigid weights are exactly 1/0, so they become normalized bytes;
    the paint colour is only read by the FlatPaint primitives, so it stays there
    as normalized shorts and is dropped elsewhere, and FlatPaint primitives drop
    the UVs nothing samples. Everything else is copied byte for byte.
    """
    import json, struct
    raw = path.read_bytes()
    json_length = struct.unpack_from('<I', raw, 12)[0]
    gltf = json.loads(raw[20:20 + json_length])
    bin_offset = 20 + json_length
    binary = raw[bin_offset + 8: bin_offset + 8 + struct.unpack_from('<I', raw, bin_offset)[0]]
    views, accessors = gltf['bufferViews'], gltf['accessors']
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
    def Floats(index):
        accessor = accessors[index]
        view = views[accessor['bufferView']]
        assert accessor['componentType'] == 5126 and 'byteStride' not in view
        count = accessor['count'] * width[accessor['type']]
        start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        return struct.unpack_from(f'<{count}f', binary, start), width[accessor['type']]
    extra = []   # (accessor index, bytes)
    def Replace(index, component, fmt, values, count, kind):
        accessors[index] = {'componentType': component, 'normalized': True,
                            'count': count, 'type': kind}
        extra.append((index, struct.pack(f'<{len(values)}{fmt}', *values)))
    for mesh in gltf['meshes']:
        for primitive in mesh['primitives']:
            attributes = primitive['attributes']
            flat = gltf['materials'][primitive['material']]['name'].startswith('FlatPaint')
            if 'WEIGHTS_0' in attributes:
                index = attributes['WEIGHTS_0']
                values, _ = Floats(index)
                quantized = []
                for i in range(0, len(values), 4):
                    q = [round(v * 255) for v in values[i:i + 4]]
                    q[q.index(max(q))] += 255 - sum(q)
                    quantized.extend(q)
                Replace(index, 5121, 'B', quantized, len(values) // 4, 'VEC4')
            if 'COLOR_0' in attributes:
                if flat:
                    index = attributes['COLOR_0']
                    values, size = Floats(index)
                    packed = []
                    for i in range(0, len(values), size):
                        rgb = values[i:i + 3]
                        packed.extend([round(max(0, min(1, v)) * 65535) for v in rgb] + [65535])
                    Replace(index, 5123, 'H', packed, len(values) // size, 'VEC4')
                else:
                    del attributes['COLOR_0']
            if flat:
                for key in [key for key in attributes if key.startswith('TEXCOORD_')]: del attributes[key]
    # Rebuild: keep only referenced accessors / views, pack the new data after them.
    used = set()
    for mesh in gltf['meshes']:
        for primitive in mesh['primitives']:
            used.update(primitive['attributes'].values())
            if 'indices' in primitive: used.add(primitive['indices'])
    for skin in gltf.get('skins', []):
        if 'inverseBindMatrices' in skin: used.add(skin['inverseBindMatrices'])
    for animation in gltf.get('animations', []):
        for sampler in animation['samplers']: used.update((sampler['input'], sampler['output']))
    replaced = dict(extra)
    order = sorted(used)
    remap = {old: new for new, old in enumerate(order)}
    chunks, new_views = [], []
    def Append(data, target=None):
        offset = sum(len(chunk) for chunk in chunks)
        view = {'buffer': 0, 'byteOffset': offset, 'byteLength': len(data)}
        if target: view['target'] = target
        chunks.append(data + b'\0' * (-len(data) % 4))
        new_views.append(view)
        return len(new_views) - 1
    view_remap = {}
    def CopyView(index):
        if index not in view_remap:
            view = views[index]
            start = view.get('byteOffset', 0)
            view_remap[index] = Append(binary[start:start + view['byteLength']], view.get('target'))
            if 'byteStride' in view: new_views[-1]['byteStride'] = view['byteStride']
        return view_remap[index]
    new_accessors = []
    for old in order:
        accessor = dict(accessors[old])
        if old in replaced:
            accessor['bufferView'] = Append(replaced[old], 34962)
        else:
            accessor['bufferView'] = CopyView(accessor['bufferView'])
        new_accessors.append(accessor)
    for image in gltf.get('images', []):
        if 'bufferView' in image: image['bufferView'] = CopyView(image['bufferView'])
    for mesh in gltf['meshes']:
        for primitive in mesh['primitives']:
            primitive['attributes'] = {key: remap[value] for key, value in primitive['attributes'].items()}
            if 'indices' in primitive: primitive['indices'] = remap[primitive['indices']]
    for skin in gltf.get('skins', []):
        if 'inverseBindMatrices' in skin: skin['inverseBindMatrices'] = remap[skin['inverseBindMatrices']]
    for animation in gltf.get('animations', []):
        for sampler in animation['samplers']:
            sampler['input'], sampler['output'] = remap[sampler['input']], remap[sampler['output']]
    gltf['accessors'], gltf['bufferViews'] = new_accessors, new_views
    blob = b''.join(chunks)
    gltf['buffers'] = [{'byteLength': len(blob)}]
    text = json.dumps(gltf, separators=(',', ':')).encode()
    text += b' ' * (-len(text) % 4)
    body = struct.pack('<II', len(text), 0x4E4F534A) + text + struct.pack('<II', len(blob), 0x004E4942) + blob
    path.write_bytes(struct.pack('<III', 0x46546C67, 2, 12 + len(body)) + body)

Export(cart_col,'Model_WoodenEvacCart.glb')
Export(ox_col,'Model_WorkingOx.glb')
Export(horse_col,'Model_WorkingHorse.glb')
for filename in ('Model_WoodenEvacCart.glb','Model_WorkingOx.glb','Model_WorkingHorse.glb'):
    CompactGlb(model_dir/filename)
scene.frame_set(1)
for col in (cart_col,horse_col): col.hide_viewport=True
for obj in ox_col.objects:
    if obj.type=='EMPTY': obj.hide_set(False)
bpy.ops.wm.save_as_mainfile(filepath=str(private_dir/'Scene_OxCart.blend'))
print('Ox cart exports:',[(p.name,p.stat().st_size) for p in model_dir.glob('*.glb')])
