"""Game topology for the V55 photo-aligned Type89 source."""

import math

import bmesh
import bpy
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt


def Role(material):
    return material.get('Type89Role', 'Shadow')


def Triangles(mesh):
    mesh.calc_loop_triangles()
    return len(mesh.loop_triangles)


def StripMaterials(mesh, allowed):
    edit = bmesh.new()
    edit.from_mesh(mesh)
    remove = [face for face in edit.faces if Role(mesh.materials[face.material_index]) not in allowed]
    bmesh.ops.delete(edit, geom=remove, context='FACES')
    edit.to_mesh(mesh)
    edit.free()
    mesh.update()


def Inside(point, loop):
    x, y = point
    inside = False
    for (ax, ay), (bx, by) in zip(loop, loop[1:]+loop[:1]):
        if (ay > y) != (by > y) and x < ax + (bx-ax)*(y-ay)/(by-ay):
            inside = not inside
    return inside


def ShoeMesh(original):
    # The four full-depth apertures, drawn from the existing high casting
    # footprint, survive as topology. The little pin eyes stay in the bake.
    outer = [(-.183,-.066),(-.010,-.067),(0,-.057),(.010,-.067),(.183,-.066),
             (.170,.009),(.126,.060),(.018,.060),(0,.039),(-.018,.060),(-.126,.060),(-.170,.009)]
    big = [(.025,-.018),(.035,-.037),(.081,-.036),(.090,-.017),(.084,.032),(.043,.041),(.028,.022)]
    small = [(.112,-.018),(.146,-.019),(.146,.017),(.112,.024)]
    outlines = [outer, big, small] + [[(-x,y) for x,y in loop] for loop in (big,small)]
    halfWidth = max(vertex.co.x for vertex in original.vertices)
    outlines = [[(x*halfWidth/.183,y) for x,y in loop] for loop in outlines]
    points = []
    edges = []
    for loop in outlines:
        offset = len(points)
        points.extend(loop)
        edges.extend((offset+i,offset+(i+1)%len(loop)) for i in range(len(loop)))
    coordinates, _, result, origins, _, _ = delaunay_2d_cdt([Vector(p) for p in points], edges, [], 0, 1e-8)
    assert len(coordinates)==len(points) and all(len(indices)==1 for indices in origins)
    planarFaces = []
    for face in result:
        middle = sum((coordinates[i] for i in face), Vector((0,0))) / len(face)
        if Inside(middle, outlines[0]) and not any(Inside(middle, loop) for loop in outlines[1:]):
            planarFaces.append(tuple(origins[i][0] for i in face))
    assert sum(len(face)-2 for face in planarFaces) == len(points)+2*len(outlines)-4
    count = len(points)
    perimeter = len(outlines[0])
    # The 1.5 mm offset is on the inner face. The tread crown, width and path
    # are tied to their high-source datums while the low wheel chords turn.
    vertices = [(x,y,-.011) for x,y in points]
    for i,(x,y) in enumerate(points):
        if i < perimeter:
            x *= .990
            y *= .970
        vertices.append((x,y,.022-.162*y))
    vertices.extend((x,y,.022-.162*y-.0025) for x,y in points[:perimeter])
    faces = [tuple(reversed(face)) for face in planarFaces]
    faces.extend(tuple(i+count for i in face) for face in planarFaces)
    for a,b in edges:
        if a < perimeter:
            faces.append((a,b,2*count+b,2*count+a))
            faces.append((2*count+a,2*count+b,count+b,count+a))
        else:
            faces.append((a,b,count+b,count+a))

    # The low guide horn stays inside the checked high envelope. The outer
    # shoe knuckles retain their visible crowns and the central break.
    offset = len(vertices)
    for x in (-.0135,.0135):
        vertices.extend((x,y,z) for y,z in [(-.038,-.014),(-.017,-.064),(.015,-.064),(.040,-.014)])
    faces.extend(tuple(offset+i for i in face) for face in
                 [(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)])
    for left,right in [(-.137,-.082),(-.031,.031),(.082,.137)]:
        first = len(vertices)
        profile = [(.0445,-.010),(.051,-.025),(.065,-.028),(.0806,-.014),(.063,.008)]
        for x in (left,right):
            vertices.extend((x,y,z) for y,z in profile)
        segments = len(profile)
        faces.extend([(first+i,first+i+segments,first+i+segments+1,first+i+1) for i in range(segments-1)])
    low = bpy.data.meshes.new('Mesh_Type89GameCastShoe')
    low.from_pydata(vertices, [], faces)
    low.materials.append(original.materials[0])
    edit = bmesh.new()
    edit.from_mesh(low)
    bmesh.ops.recalc_face_normals(edit, faces=list(edit.faces))
    edit.to_mesh(low)
    edit.free()
    low.update()
    return low


def GuardMesh(source):
    # Use the proven guard profile from the high reconstruction recipe. Reuse
    # its analytic opacity layout while baking colour/normal/data from the
    # actual punched high mesh. The four stiffener bands stay geometric.
    from Script_Type89MediumTank import BuildPerforatedGuard, Mesh, exhaustGuardSettings

    before = set(bpy.context.scene.objects)
    parent = bpy.data.objects.new('Type89GuardPattern', None)
    bpy.context.scene.collection.objects.link(parent)
    temporary = bpy.data.materials.new('Type89GuardPatternMaterial')
    temporary.use_nodes = True
    armor = next(mat for mat in source.materials if Role(mat)=='Armor')
    guard = BuildPerforatedGuard('Game', parent, armor, temporary, Mesh,
                                 lambda *args: None, lambda *args: None, exhaustGuardSettings)
    sourceMaterial = next(mat for mat in source.materials if Role(mat)=='Guard')
    mesh = guard.data
    mesh.name = 'Mesh_Type89GamePerforatedSheet'
    mesh.materials[0] = sourceMaterial
    mask = next(node.image for node in temporary.node_tree.nodes if node.type=='TEX_IMAGE')
    for obj in set(bpy.context.scene.objects)-before:
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.materials.remove(temporary)
    return mesh, mask


EXACT_BUDGETS = {
    'Hull': 3450,
    'BowPlate': 2050,
    'BowHatch': 460,
    'BowRoundPortCover': 610,
    'BowDoorLatch': 385,
    'BowDoorFixedHinge': 440,
    'BowTowClevis': 550,
    'BowMgJacket': 1100,
    'BowMgBall': 490,
    'BowMgMount': 825,
    'DriverVisionFlap': 650,
    'DriverPortShutter': 300,
    'EngineHatchLeft': 840,
    'EngineHatchRight': 690,
    'ExhaustGuard': 790,
    'MainGunPitch': 640,
    'MainGunRecoil': 568,
    'RearLamp': 490,
    'TurretYaw': 2800,
    'CommanderCupola': 540,
    'CommanderHatchFront': 425,
    'CommanderHatchRear': 385,
    'TurretMgMount': 410,
    'TurretMachineGun': 410,
    'UnderfloorDetail': 220,
}
SERIES_BUDGETS = (
    ('SuspensionCover', 235), ('Suspension', 1290), ('VerticalSkirt', 460),
    ('OuterBogieCheek', 255), ('BogieSpringUnit', 136), ('Bogie', 110),
    ('RoadWheel', 278), ('LeadingWheel', 420), ('ReturnRoller', 173),
    ('FrontIdler', 1000), ('RearSprocket', 835), ('InboardIdlerSupport', 495),
    ('SideVisionLatch', 180), ('SideVisionFrame', 300), ('SideVisionFlap', 415),
)


def Budget(name):
    suffix = name.removeprefix('Mesh_')
    if suffix in EXACT_BUDGETS:
        return EXACT_BUDGETS[suffix]
    return next((limit for prefix,limit in SERIES_BUDGETS if suffix.startswith(prefix)), 400)


def KeepMuzzle(obj):
    from Script_Type89RestorationHigh import Component

    mesh = obj.data
    muzzle = Component(mesh,max(mesh.vertices,key=lambda vertex:vertex.co.y).index)
    linerSeed = min((vertex for vertex in mesh.vertices if vertex.index not in muzzle),
                    key=lambda vertex:abs(vertex.co.y-.7072))
    liner = Component(mesh,linerSeed.index)
    assert len(liner)==64 and abs(linerSeed.co.y-.7072)<1e-6
    # Match the enclosed dark surface to the visible metal opening after
    # triangulation. Its outer ring must sit behind the cut metal edge.
    for index in liner:
        point = mesh.vertices[index].co
        point.x *= .0280/.0284
        point.z = .032+(point.z-.032)*.0280/.0284
    muzzle |= liner
    saved = mesh.copy()
    for target,keepMuzzle in ((saved,True),(mesh,False)):
        edit = bmesh.new()
        edit.from_mesh(target)
        bmesh.ops.delete(edit,geom=[vertex for vertex in edit.verts if (vertex.index in muzzle)!=keepMuzzle],context='VERTS')
        edit.to_mesh(target)
        edit.free()
    part = bpy.data.objects.new('Type89ProtectedMuzzle',saved)
    bpy.context.scene.collection.objects.link(part)
    part.matrix_world = obj.matrix_world.copy()
    return part


def ConstrainMovingSurfaces(obj):
    mesh = obj.data
    if obj.name == 'Mesh_BowMgBall':
        radius = obj.parent['outerRadiusM']
        for vertex in mesh.vertices:
            if vertex.co.length>radius:
                vertex.co *= radius/vertex.co.length
    elif obj.name.startswith(('Mesh_RoadWheel','Mesh_LeadingWheel')):
        radius = obj.parent['radiusM']
        sign = -1 if 'Left' in obj.name else 1
        for vertex in mesh.vertices:
            p = vertex.co
            r = math.hypot(p.y,p.z)
            limit = radius-.0013
            if r>limit:
                p.y *= limit/r
                p.z *= limit/r
            if .24*radius<r<.66*radius and abs(sign*p.x-.061)<.009:
                p.x = sign*.061
    mesh.update()


def Simplify(obj):
    muzzle = KeepMuzzle(obj) if obj.name=='Mesh_MainGunRecoil' else None
    mesh = obj.data
    edit = bmesh.new()
    edit.from_mesh(mesh)
    bmesh.ops.dissolve_limit(edit, angle_limit=math.radians(.7), verts=list(edit.verts),
                             edges=list(edit.edges), delimit={'MATERIAL','SHARP'}, use_dissolve_boundaries=False)
    edit.to_mesh(mesh)
    edit.free()
    mesh.update()
    count = Triangles(mesh)
    budget = Budget(obj.name)
    if count > budget:
        modifier = obj.modifiers.new('GameSilhouetteSimplification', 'DECIMATE')
        modifier.ratio = budget/count
        modifier.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    if muzzle is not None:
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        muzzle.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.join()
    ConstrainMovingSurfaces(obj)
    return obj.data


def PrepareTriangulation(mesh):
    edit = bmesh.new()
    edit.from_mesh(mesh)
    bmesh.ops.triangulate(edit, faces=list(edit.faces), quad_method='BEAUTY', ngon_method='BEAUTY')
    bmesh.ops.delete(edit, geom=[face for face in edit.faces if face.calc_area() < 5e-13], context='FACES')
    edit.to_mesh(mesh)
    edit.free()
    mesh.update()
