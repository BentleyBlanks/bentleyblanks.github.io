"""Build the 1938 rural two-wheel evacuation cart and ox/horse draft models.

Execute in the task's BlenderMCP instance. Set scene['OxCartProject'] to the
absolute Taierzhuang1938 directory before execution. The editable .blend is
saved outside the Pages repository; these exports are deterministic rebuilds.
Blender +Y becomes glTF -Z, the game's agreed forward direction.
"""
import bpy
import math
import random
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
        axis = tangent.cross(Vector((0,1,0))).normalized()
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
    """One flat grounded toe with a forward wall and a narrow central cleft."""
    vertices, faces = [], []
    sections = [(-.09,.060,.018,.148),(.015,.069,.008,.151),
                (.115,.069,.008,.125),(.205,.057,.012,.090)]
    for offset_y, half_width, bottom, top in sections:
        x = center_x + direction*(.008 if offset_y > .1 else 0)
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
    return Finish(obj,name,mat,col,parent,.008)


def HorseHoof(name, center_x, foot_y, mat, col, parent):
    """A grounded rounded toe and narrower coronet instead of a square block."""
    outline = [(-.095,-.105),(.095,-.105),(.132,-.055),
               (.142,.055),(.112,.17),(.06,.205),(-.06,.205),
               (-.112,.17),(-.142,.055),(-.132,-.055)]
    vertices, faces = [], []
    for z, scale, forward in ((.012,1,0),(.095,.94,-.012),(.158,.78,-.035)):
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
    return Finish(obj,name,mat,col,parent,.012)

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
    # The shaft bows outside the ox's 0.67 m shoulder, then rises to a real
    # harness attachment. Its rear tenon runs beneath the deck crossmember.
    shaft_at = lambda y: (side*(.62+.15*(y-1.12)/3.76),
                           .82+.38*(y-1.12)/3.76)
    x0,z0 = shaft_at(1.12)
    x1,z1 = shaft_at(4.88)
    Beam(f'DraftShaft{side}',(x0,1.12,z0),(x1,4.88,z1),
         .115,.115,edge,cart_col,deck)
    Cube(f'ShaftSocket{side}',(side*.63,1.73,.87),(.18,.30,.16),dark_wood,cart_col,deck,.008)
    for y in (1.73,3.16):
        x,z = shaft_at(y)
        Curve(f'ShaftBinding{side}_{y}',[(x-.073,y,z-.063),(x-.073,y,z+.063),
              (x+.073,y,z+.063),(x+.073,y,z-.063),(x-.073,y,z-.063)],
              .014,rope,cart_col,deck)
    x,z = shaft_at(4.66)
    # A forged eye at each tip is the load path for the hanging yoke strap.
    Curve(f'ShaftIronEye{side}',[(x,4.66+.074*math.cos(step*math.pi/8),
          z+.074*math.sin(step*math.pi/8)) for step in range(17)],
          .014,iron,cart_col,deck)
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
            (2.94,.035,1.53,1.43),(3.04,.28,1.68,1.08),
            (3.24,.49,1.80,.92),
            (3.45,.57,1.84,.79),(3.70,.59,1.79,.77),
            (3.96,.57,1.75,.75),(4.19,.59,1.82,.70),
            (4.40,.65,1.96,.68),(4.56,.67,2.04,.67),
            (4.72,.62,1.97,.68),(4.89,.46,1.72,.83),
            (5.05,.22,1.47,1.05)]
        torso_stations = [(y,width,(top+bottom)/2,(top-bottom)/2)
                          for y,width,top,bottom in SmoothStations(ox_profile)]
    else:
        # Croup, tucked flank, sloping shoulder and withers are independent of
        # the ox's deep cylindrical barrel. Values are metres above ground.
        horse_profile = [
            (3.04,.05,1.69,1.58),(3.15,.27,1.84,1.27),
            (3.34,.40,1.93,1.18),(3.57,.43,1.89,1.16),
            (3.82,.40,1.83,1.12),(4.07,.37,1.83,1.13),
            (4.28,.42,1.92,1.15),(4.47,.45,2.05,1.15),
            (4.62,.45,2.08,1.10),(4.78,.39,1.96,1.17),
            (4.94,.24,1.77,1.30),(5.02,.04,1.57,1.50)]
        torso_stations = [(y,width,(top+bottom)/2,(top-bottom)/2)
                          for y,width,top,bottom in SmoothStations(horse_profile)]
    LoftY(kind+'Torso',torso_stations,coat,col,body)
    if is_ox:
        # A ventral fold under the neck and broad chest, instead of a ball.
        LoftY('OxDewlap',SmoothStations([
            (4.39,.07,.93,.12),(4.53,.19,.92,.22),
            (4.72,.24,.94,.29),(4.92,.20,1.04,.27),
            (5.14,.09,1.17,.15)]),coat,col,body,14)
    else:
        TaperCurve('HorseManeCrest',[(0,4.60,2.04,.045),
                   (0,4.79,2.16,.075),(0,4.98,2.27,.080),
                   (0,5.18,2.36,.055),(0,5.33,2.40,.005)],horse_dark,col,body)
        for index in range(16):
            y = 4.67 + index*.043
            z = 2.08 + index*.022
            for side in (-1,1):
                TaperCurve(f'HorseManeTuft{index}_{side}',
                           [(side*.025,y,z+.01,.020),
                            (side*.055,y-.045,z+.075,.018),
                            (side*.075,y-.12,z+.11,.002)],
                           horse_dark,col,body,8)
    head_pivot=Empty(kind+'HeadPivot',(0,4.82,1.61 if is_ox else 1.72),col,root)
    if is_ox:
        neck_stations = [(4.70,.33,1.44,.37),(4.90,.35,1.51,.39),
                         (5.13,.30,1.58,.34),(5.29,.20,1.61,.23)]
        skull_stations = [(5.05,.20,1.62,.20),(5.25,.34,1.67,.30),
                          (5.42,.35,1.59,.28),(5.56,.28,1.51,.22),
                          (5.68,.17,1.44,.13)]
    else:
        neck_stations = SmoothStations([
            (4.62,.30,1.63,.37),(4.80,.30,1.78,.40),
            (4.98,.27,1.94,.38),(5.16,.23,2.10,.32),
            (5.26,.16,2.18,.20),(5.30,.09,2.18,.13)],2)
        skull_stations = SmoothStations([
            (5.19,.14,2.17,.18),(5.32,.19,2.13,.25),
            (5.45,.215,2.02,.28),(5.58,.17,1.87,.24),
            (5.71,.12,1.73,.16)],2)
    LoftY(kind+'Neck',neck_stations,coat,col,head_pivot)
    LoftY(kind+'Skull',skull_stations,coat,col,head_pivot)
    if is_ox:
        LoftY('OxNoseBridge',[(5.46,.19,1.47,.13),(5.60,.19,1.44,.13),
                             (5.75,.15,1.40,.11)],coat,col,head_pivot,16)
        Ellipsoid('OxMuzzle',(0,5.79,1.34),(.33,.18,.15),
                  ox_light,col,head_pivot,18,12)
        Ellipsoid('OxLowerLip',(0,5.905,1.235),(.16,.060,.035),
                  ox_light,col,head_pivot,16,8)
    else:
        Ellipsoid('HorseJaw',(0,5.38,1.79),(.205,.20,.155),
                  coat,col,head_pivot,18,10)
        LoftY('HorseNoseBridge',[(5.53,.14,1.84,.16),
              (5.68,.12,1.72,.14),(5.79,.13,1.64,.095)],
              coat,col,head_pivot,16)
        Ellipsoid('HorseMuzzle',(0,5.83,1.60),(.18,.15,.115),
                  horse_muzzle,col,head_pivot,18,10)
        Ellipsoid('HorseLowerLip',(0,5.94,1.525),(.115,.065,.036),
                  horse_muzzle,col,head_pivot,14,8)
        Curve('HorseBlaze',[(0,5.48,2.17),(0,5.55,2.09),
              (0,5.63,1.97),(0,5.71,1.83)],.025,horse_light,col,head_pivot)
    for side in (-1,1):
        if is_ox:
            Ellipsoid(f'OxCheek{side}',(side*.245,5.49,1.47),
                      (.145,.185,.145),coat,col,head_pivot,16,10)
            LoftX(f'OxEar{side}',[(side*.24,5.29,1.80,.035,.04),
                  (side*.35,5.29,1.81,.09,.07),(side*.49,5.28,1.82,.13,.075),
                  (side*.62,5.27,1.84,.10,.055),(side*.69,5.27,1.85,.008,.008)],
                  coat,col,head_pivot)
            LoftX(f'OxEarInterior{side}',[(side*.33,5.348,1.824,.01,.012),
                  (side*.46,5.365,1.836,.067,.038),
                  (side*.60,5.338,1.846,.055,.025),
                  (side*.66,5.295,1.85,.005,.005)],ox_ear,col,head_pivot,10)
            Ellipsoid(f'OxEyeSocket{side}',(side*.305,5.47,1.66),
                      (.036,.087,.062),ox_socket,col,head_pivot,12,8)
            Ellipsoid(f'OxEye{side}',(side*.336,5.487,1.668),
                      (.025,.046,.032),eye,col,head_pivot,12,8)
            Curve(f'OxBrow{side}',[(side*.30,5.40,1.716),
                  (side*.34,5.46,1.728),(side*.31,5.54,1.703)],
                  .022,coat,col,head_pivot)
            Ellipsoid(f'OxNostrilRim{side}',(side*.205,5.929,1.399),
                      (.054,.024,.035),ox_socket,col,head_pivot,12,8)
            Ellipsoid(f'OxNostril{side}',(side*.205,5.950,1.401),
                      (.032,.014,.021),eye,col,head_pivot,12,8)
            Ellipsoid(f'OxHornRoot{side}',(side*.255,5.24,1.89),
                      (.095,.085,.075),coat,col,head_pivot,12,8)
            TaperCurve(f'OxHorn{side}',[(side*.275,5.235,1.89,.082),
                       (side*.405,5.245,1.955,.069),
                       (side*.565,5.265,2.025,.047),
                       (side*.685,5.285,2.105,.027),
                       (side*.725,5.305,2.17,.003)],horn,col,head_pivot)
        else:
            TaperCurve(f'HorseEar{side}',[(side*.15,5.29,2.29,.069),
                       (side*.17,5.28,2.43,.055),
                       (side*.20,5.31,2.60,.020),
                       (side*.215,5.34,2.67,.002)],coat,col,head_pivot,10)
            TaperCurve(f'HorseEarInterior{side}',[(side*.19,5.334,2.40,.021),
                       (side*.21,5.348,2.53,.013),
                       (side*.22,5.35,2.61,.002)],horse_dark,col,head_pivot,8)
            Ellipsoid(f'HorseEyeSocket{side}',(side*.203,5.45,2.055),
                      (.031,.068,.058),horse_muzzle,col,head_pivot,12,8)
            Ellipsoid(f'HorseEye{side}',(side*.225,5.47,2.063),
                      (.021,.035,.028),eye,col,head_pivot,12,8)
            Ellipsoid(f'HorseEyeGlint{side}',(side*.241,5.486,2.075),
                      (.006,.008,.006),horse_light,col,head_pivot,8,6)
            Ellipsoid(f'HorseNostril{side}',(side*.125,5.943,1.634),
                      (.024,.018,.034),eye,col,head_pivot,12,8)
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
                    [(1.73,side*.27,y-.12,.13,.17),
                     (1.48,side*.34,y-.07,.20,.23),
                     (1.26,x,y-.03,.25,.26),
                     (1.03,x,y,.19,.22),(.76,x,knee_y-.015,.15,.17),
                     (joint,x,knee_y,.125,.14)] if front else
                    [(1.67,side*.25,3.47,.12,.16),
                     (1.43,side*.30,3.44,.18,.23),
                     (1.25,x,3.38,.27,.30),
                     (1.03,x,3.32,.22,.23),(.80,x,3.27,.16,.18),
                     (joint,x,knee_y,.125,.15)])
                LoftZ(name+'Upper',SmoothStations(upper_stations,2),coat,col,pivot)
            else:
                if front:
                    upper_stations = [(1.76,side*.20,y-.12,.10,.14),
                        (1.62,side*.25,y-.07,.15,.19),
                        (1.48,side*.29,y,.19,.22),
                        (1.28,x,y+.025,.17,.18),
                        (1.08,x,y+.04,.115,.13),
                        (.80,x,knee_y,.088,.102),
                        (joint,x,knee_y,.105,.115)]
                else:
                    upper_stations = [(1.72,side*.20,3.38,.10,.14),
                        (1.61,side*.26,3.35,.18,.22),
                        (1.48,side*.31,3.33,.22,.25),
                        (1.28,x,3.30,.23,.25),
                        (1.00,x,3.20,.15,.17),
                        (.78,x,knee_y-.04,.108,.13),
                        (joint,x,knee_y,.10,.115)]
                LoftZ(name+'Upper',SmoothStations(upper_stations,2),coat,col,pivot)
            knee=Empty(name+'KneePivot',(x,knee_y,joint),col,pivot)
            if is_ox:
                lower_stations = [
                    (joint+.04,x,knee_y,.125,.14),
                    (.48,x,knee_y+(.015 if front else .08),.105,.12),
                    (.30,x,foot_y-.03,.095,.105),
                    (.17,x,foot_y,.12,.12)]
                LoftZ(name+'Lower',SmoothStations(lower_stations,2),coat,col,knee)
            else:
                lower_stations = [
                    (joint+.04,x,knee_y,.102,.114),
                    (.56,x,knee_y+(.015 if front else .055),.071,.087),
                    (.33,x,foot_y-.025,.061,.069),
                    (.20,x,foot_y,.078,.09)]
                LoftZ(name+'Lower',SmoothStations(lower_stations,2),horse_leg,col,knee)
                Ellipsoid(name+'Fetlock',(x,foot_y,.195),
                          (.092,.105,.07),horse_leg,col,knee,12,8)
            hoof_pivot=Empty(name+'HoofPivot',(x,foot_y,0),col,knee)
            if is_ox:
                # Two grounded toes leave a visible cleft at the front.
                for digit in (-1,1):
                    HoofDigit(name+f'HoofDigit{digit}',x+digit*.076,
                              foot_y,digit,hoof,col,hoof_pivot)
            else:
                HorseHoof(name+'Hoof',x,foot_y,hoof,col,hoof_pivot)
                Cube(name+'Coronet',(x,foot_y+.015,.167),
                     (.19,.19,.032),coat,col,hoof_pivot,.014)
            leg_pivots.append((pivot,knee,hoof_pivot,side,front,y,knee_y,foot_y,upper_z,joint))
    tail=Empty(kind+'TailPivot',(0,3.06 if is_ox else 3.32,
                                 1.55 if is_ox else 1.78),col,root)
    if is_ox:
        TaperCurve('OxTail',[(0,3.01,1.56,.052),(0,2.92,1.40,.047),
                   (0,2.86,1.18,.035),(0,2.85,.98,.025)],coat,col,tail)
        TaperCurve('OxTailTuft',[(0,2.85,1.01,.029),
                   (0,2.84,.89,.065),(0,2.83,.75,.085),
                   (0,2.82,.66,.005)],horse_dark,col,tail)
    else:
        TaperCurve('HorseTailDock',[(0,3.16,1.75,.085),
                   (0,2.99,1.58,.09),(0,2.85,1.42,.065)],coat,col,tail)
        TaperCurve('HorseTailMass',[(0,2.88,1.50,.060),
                   (0,2.75,1.30,.12),(0,2.66,1.04,.15),
                   (0,2.58,.78,.105),(0,2.53,.62,.006)],horse_dark,col,tail,12)
        for index in range(15):
            spread = (index-7)*.027
            shift = (index%3-1)*.035
            TaperCurve(f'HorseTailStrand{index}',[
                (spread*.4,2.79,1.32,.024),
                (spread,2.63+shift,1.04,.027),
                (spread*1.3,2.45+shift,.67+(index%4)*.045,.002)],
                horse_dark,col,tail,8)
    # Head halter stays with the animated head; the load-bearing harness is
    # anchored to the body and meets the cart's two iron shaft eyes.
    if is_ox:
        nose_points=[(-.27,5.64,1.48),(-.32,5.72,1.41),(0,5.78,1.32),
                     (.32,5.72,1.41),(.27,5.64,1.48)]
    else:
        nose_points=[(-.17,5.80,1.68),(-.18,5.88,1.61),(0,5.92,1.51),
                     (.18,5.88,1.61),(.17,5.80,1.68)]
    Curve(kind+'NoseBand',nose_points,.018,rope if is_ox else leather,
          col,head_pivot)
    for side in (-1,1):
        if is_ox:
            Curve(kind+f'CheekRope{side}',
                  [(side*.24,5.7,1.47),(side*.28,5.44,1.7),
                   (side*.36,4.85,1.38)],.016,rope,col,root)
            Curve(kind+f'YokeDrop{side}',[(side*.75,4.95,2.10),
                  (side*.77,4.89,1.76),(side*.77,4.76,1.43),
                  (side*.75,4.66,1.20)],.035,leather,col,root)
            trace_points=[(side*.72,4.94,1.46),(side*.75,4.64,1.25),
                          (side*.73,3.83,1.11),(side*.70,3.16,1.03)]
        else:
            # Bridle follows the nodding head; metal bit and reins are legible
            # without a wooden cross-yoke hovering above the horse's poll.
            Curve(f'HorseCheekStrap{side}',[(side*.17,5.82,1.67),
                  (side*.20,5.52,1.94),(side*.22,5.33,2.19),
                  (side*.18,5.29,2.36)],.022,leather,col,head_pivot)
            Cylinder(f'HorseBitRing{side}',(side*.19,5.84,1.60),
                     .044,.025,iron,col,head_pivot,12,'X')
            Curve(f'HorseRein{side}',[(side*.19,5.84,1.60),
                  (side*.34,5.34,1.82),(side*.47,4.60,1.70),
                  (side*.44,4.20,1.72)],.010,rope,col,head_pivot)
            trace_points=[(side*.43,5.04,1.49),
                          (side*.75,4.66,1.20),(side*.73,3.83,1.11),
                          (side*.70,3.16,1.03)]
            Curve(f'HorseShaftLoop{side}',[(side*.46,4.46,2.04),
                  (side*.57,4.52,1.71),(side*.75,4.66,1.20)],
                  .030,leather,col,root)
            Curve(f'HorseBreeching{side}',[(side*.34,3.11,1.62),
                  (side*.45,3.20,1.49),(side*.57,3.49,1.34),
                  (side*.69,3.73,1.12)],.042,leather,col,root)
            Cylinder(f'HorseTraceRing{side}',(side*.75,4.66,1.20),
                     .046,.022,iron,col,root,12,'X')
        Curve(kind+f'BreastTrace{side}',trace_points,.027,leather,col,root)
        Curve(kind+f'TraceBinding{side}',[(side*.65,3.16,1.04),
              (side*.70,3.13,1.09),(side*.76,3.16,1.04)],
              .013,rope,col,root)
        if is_ox:
            Cylinder(kind+f'YokePin{side}',(side*.79,4.95,2.10),
                     .037,.028,iron,col,root,10,'X')
    if is_ox:
        Beam(kind+'Yoke',(-.82,4.95,2.10),(.82,4.95,2.10),
             .13,.14,edge,col,root)
    else:
        Curve('HorseBrowband',[(-.20,5.37,2.26),(0,5.41,2.31),
              (.20,5.37,2.26)],.022,leather,col,head_pivot)
        Curve('HorseSaddlePad',[(-.45,4.42,1.89),(-.30,4.43,2.04),
              (0,4.43,2.10),(.30,4.43,2.04),(.45,4.42,1.89)],
              .052,leather,col,body)
        Curve('HorseBellyGirth',[(-.45,4.38,1.70),(-.36,4.38,1.27),
              (0,4.38,1.10),(.36,4.38,1.27),(.45,4.38,1.70)],
              .036,leather,col,body)
        # The collar lies across the breast and transfers pull into two traces.
        Curve('HorseCollarCrest',[(-.45,4.82,2.07),(-.28,4.72,2.20),
              (0,4.68,2.25),(.28,4.72,2.20),(.45,4.82,2.07)],
              .035,leather,col,root)
    Curve(kind+'ShoulderHarness',[(-.72 if is_ox else -.56,4.54,1.38 if is_ox else 1.60),
          (-.68 if is_ox else -.45,4.54,1.91 if is_ox else 1.96),
          (0,4.54,2.14 if is_ox else 2.08),
          (.68 if is_ox else .45,4.54,1.91 if is_ox else 1.96),
          (.72 if is_ox else .56,4.54,1.38 if is_ox else 1.60)],
          .038,leather,col,body)
    Curve(kind+'BreastCollar',[(-.70 if is_ox else -.54,4.97,1.48 if is_ox else 1.64),
          (-.48 if is_ox else -.38,5.07,1.24 if is_ox else 1.44),
          (0,5.13,1.10 if is_ox else 1.37),
          (.48 if is_ox else .38,5.07,1.24 if is_ox else 1.44),
          (.70 if is_ox else .54,4.97,1.48 if is_ox else 1.64)],
          .04,leather,col,root)
    # Four-beat walk: each planted hoof tracks backwards at road speed for
    # 62% of the cycle, then lifts and returns. The lowered root gives the
    # almost straight rest legs enough reach without stretching geometry.
    def leg_angles(entry, step, root_height):
        _, _, _, side, front, hip_y, knee_y, foot_y, hip_z, knee_z = entry
        phase_offset = ({(-1, False): 0, (-1, True): .25,
                         (1, False): .50, (1, True): .75})[(side, front)]
        gait = (step + phase_offset) % 1
        stance = .62
        if gait < stance:
            target_y = foot_y + .25 - .50 * gait / stance
            lift = 0
        else:
            progress = (gait - stance) / (1 - stance)
            eased = progress * progress * (3 - 2 * progress)
            target_y = foot_y - .25 + .50 * eased
            lift = .13 * math.sin(math.pi * progress)
        target_z = -root_height + lift
        upper_y, upper_z = knee_y - hip_y, knee_z - hip_z
        lower_y, lower_z = foot_y - knee_y, -knee_z
        upper_length = math.hypot(upper_y, upper_z)
        lower_length = math.hypot(lower_y, lower_z)
        reach_y, reach_z = target_y - hip_y, target_z - hip_z
        reach_square = reach_y * reach_y + reach_z * reach_z
        cosine = (reach_square - upper_length**2 - lower_length**2) / (2 * upper_length * lower_length)
        bend = math.acos(max(-1, min(1, cosine)))
        aim = math.atan2(reach_z, reach_y) - math.atan2(
            lower_length * math.sin(bend), upper_length + lower_length * math.cos(bend))
        upper_rest = math.atan2(upper_z, upper_y)
        lower_rest = math.atan2(lower_z, lower_y)
        return aim - upper_rest, bend - (lower_rest - upper_rest)

    animated=[root,body,head_pivot,tail,*[entry[index] for entry in leg_pivots for index in (0,1,2)]]
    for obj in animated:
        obj.animation_data_create()
    # Blender's shared action cannot animate multiple objects with one slot in newer versions;
    # per-object actions are collected by the glTF exporter into one NLA track named Walk.
    for obj in animated:
        obj.animation_data.action = None
        act=bpy.data.actions.new(kind+'Walk_'+obj.name)
        obj.animation_data.action=act
        for frame in range(1, 32):
            step=(frame-1)/30
            phase=2*math.pi*step
            root_height=-.045+.008*math.cos(2*phase)
            if obj == root:
                obj.location.z=root_height
            elif obj == body:
                obj.location.z=1.31 if is_ox else 1.50
            elif obj == head_pivot:
                obj.rotation_euler[0]=.055*math.sin(phase-.4)
            elif obj == tail:
                obj.rotation_euler[1]=.11*math.sin(phase)
            else:
                entry=next(e for e in leg_pivots if obj in e[:3])
                upper_angle, lower_angle = leg_angles(entry, step, root_height)
                if obj == entry[0]: obj.rotation_euler[0]=upper_angle
                elif obj == entry[1]: obj.rotation_euler[0]=lower_angle
                else: obj.rotation_euler[0]=-(upper_angle+lower_angle)
            obj.keyframe_insert(data_path='location' if obj in (root,body) else 'rotation_euler',frame=frame)
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
    # 6. The pivots now live only as bones.
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
        export_frame_range=False,export_materials='EXPORT')

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
