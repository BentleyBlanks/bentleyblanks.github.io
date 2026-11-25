"""Photo-based exterior art for the static Type89Launcher game prop."""

from math import cos, hypot, pi, sin
from pathlib import Path
import json

import bmesh
import bpy
from mathutils import Matrix

from AssetBudgets import SPECIAL_TRIANGLE_TARGETS
from TzmCore import AUTHORED_NORMAL_LAYER, Node


TRIANGLE_LIMIT = SPECIAL_TRIANGLE_TARGETS["Type89Launcher"]
LENGTH = 0.413  # Existing animation-space span. The build is an exterior visual study.
FRONT = -0.228
MOUNTS = {
    "muzzle": (0, 0, -0.230),
    "gripR": (0, 0, 0),
    "gripL": (0, 0, -0.070),
    "sight": (0.026, 0.026, -0.060),
    "magazine": (0, 0, 0.150),
}
MATERIAL = "type89LauncherSteel"
BLENDER_TO_GAME = Matrix.Rotation(-pi / 2, 4, "X")

ATLAS = json.loads(Path(__file__).with_name("Data_Type89LauncherSteelAtlas.json").read_text(encoding="utf-8"))


def NativePoint(point):
    x, y, along = point
    return (x * LENGTH, -(FRONT + along * LENGTH), y * LENGTH)


def AtlasUv(tile, u, v):
    x, y, width, height = ATLAS["regions"][tile]
    size, padding = ATLAS["size"], ATLAS["padding"]
    return ((x + padding + u * (width - 2 * padding)) / size,
            (size - y - height + padding + v * (height - 2 * padding)) / size)


def MeshObject(collection, name, vertices, faces, uvFaces, smooth=None):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([NativePoint(p) for p in vertices], [], faces)
    uv = mesh.uv_layers.new(name="SteelAtlas")
    for polygon, uvs in zip(mesh.polygons, uvFaces):
        polygon.use_smooth = smooth is None or smooth[polygon.index]
        for index, coordinate in zip(polygon.loop_indices, uvs):
            uv.data[index].uv = coordinate
    raw = bmesh.new()
    raw.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(raw, faces=list(raw.faces))
    raw.to_mesh(mesh)
    raw.free()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def Revolve(collection, name, profile, *, sides=40, center=(0, 0), tile="Barrel",
            bandTiles=None, paintBand=None, toothed=False):
    """Closed visual profile. The opening on the tube ends at a recessed dark face."""
    angles = [i * 2 * pi / sides for i in range(sides)]
    if paintBand is not None:
        angles += [pi / 2 - 0.032, pi / 2 + 0.032]
        angles.sort()
    count = len(angles)
    cx, cy = center
    vertices = []
    for along, radius in profile:
        for i, angle in enumerate(angles):
            edge = radius - 0.0033 if toothed and i % 4 in (2, 3) else radius
            vertices.append((cx + edge * cos(angle), cy + edge * sin(angle), along))

    steps = [0.0]
    for (alongA, radiusA), (alongB, radiusB) in zip(profile, profile[1:]):
        steps.append(steps[-1] + hypot(alongB - alongA, radiusB - radiusA))
    faces, uvFaces, smooth = [], [], []
    for ring in range(len(profile) - 1):
        v0, v1 = (steps[i] / steps[-1] for i in (ring, ring + 1))
        for i, angle in enumerate(angles):
            j = (i + 1) % count
            stopAngle = angles[j] if j else 2 * pi
            band = (bandTiles or {}).get(ring, tile)
            if ring == paintBand and abs((angle + stopAngle) / 2 - pi / 2) < 0.032:
                band = "Stripe"
            u0, u1 = angle / (2 * pi), stopAngle / (2 * pi)
            if band == "Stripe":
                u0, u1 = ((a - pi / 2 + .032) / .064 for a in (angle, stopAngle))
            faces.append((ring * count + i, ring * count + j, (ring + 1) * count + j, (ring + 1) * count + i))
            uvFaces.append([AtlasUv(band, u, v) for u, v in ((u0, v0), (u1, v0), (u1, v1), (u0, v1))])
            smooth.append(not toothed)
    for ring, capTile in ((0, (bandTiles or {}).get(0, tile)), (len(profile) - 1, tile)):
        order = list(range(count)) if ring else list(reversed(range(count)))
        faces.append(tuple(ring * count + i for i in order))
        uvFaces.append([AtlasUv(capTile, 0.5 + 0.47 * cos(angles[i]), 0.5 + 0.47 * sin(angles[i])) for i in order])
        smooth.append(False)
    return MeshObject(collection, name, vertices, faces, uvFaces, smooth)


def Stem(collection):
    # The open-looking strip is shallow. All of its surfaces are visible exterior art.
    outline = [(-.023, .020), (-.019, .023), (-.014, .022), (-.014, .007),
               (.014, .007), (.014, .022), (.019, .023), (.023, .020),
               (.025, -.003), (.021, -.016), (.013, -.023), (0, -.025),
               (-.013, -.023), (-.021, -.016), (-.025, -.003)]
    sections = [(.421, .79), (.442, .97), (.480, 1), (.703, 1), (.742, 1.02), (.761, .94)]
    vertices = [(x * scale, y * scale, along) for along, scale in sections for x, y in outline]
    faces, uvFaces, smooth = [], [], []
    count = len(outline)
    for ring in range(len(sections) - 1):
        v0, v1 = ((sections[i][0] - sections[0][0]) / (sections[-1][0] - sections[0][0]) for i in (ring, ring + 1))
        for i in range(count):
            j = (i + 1) % count
            tile = "Channel" if i == 3 else "Recess" if i in (2, 4) else "Edge" if i in (1, 5) else "Stem"
            u0, u1 = (0, 1) if tile == "Channel" else (i / count, (i + 1) / count)
            faces.append((ring * count + i, ring * count + j, (ring + 1) * count + j, (ring + 1) * count + i))
            uvFaces.append([AtlasUv(tile, u, v) for u, v in ((u0, v0), (u1, v0), (u1, v1), (u0, v1))])
            smooth.append(i >= 7)
    for ring in (0, len(sections) - 1):
        faces.append(tuple(ring * count + i for i in range(count)))
        uvFaces.append([AtlasUv("Collar", x / .052 + .5, y / .052 + .5) for x, y in outline])
        smooth.append(False)
    return MeshObject(collection, "FlutedSteelStem", vertices, faces, uvFaces, smooth)


def FlatPart(collection, name, outline, x0, x1, tile="Tab", bevel=.0017, backTile=None):
    """Rounded, flat silhouette plate. Outline vertices are (height, along)."""
    count = len(outline)
    vertices = [(x, y, along) for x in (x0, x1) for y, along in outline]
    faces = [tuple(reversed(range(count))), tuple(range(count, 2 * count))]
    faces.extend((i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count))
    lowY, highY = min(y for y, _ in outline), max(y for y, _ in outline)
    lowS, highS = min(s for _, s in outline), max(s for _, s in outline)
    coords = [((along - lowS) / (highS - lowS), (y - lowY) / (highY - lowY)) for y, along in outline]
    uvFaces = [[AtlasUv(backTile or tile, u, v) for u, v in reversed(coords)],
               [AtlasUv(tile, u, v) for u, v in coords]]
    uvFaces.extend([AtlasUv(tile, (i + u) / count, v) for u, v in ((0, .4), (1, .4), (1, .6), (0, .6))] for i in range(count))
    obj = MeshObject(collection, name, vertices, faces, uvFaces, [False] * len(faces))
    modifier = obj.modifiers.new("ForgedEdgeRounds", "BEVEL")
    modifier.width = bevel * LENGTH
    modifier.segments = 2
    return obj


def OvalLoop(collection, name, center, height, length, wire, tile="Edge"):
    cx, cy, along = center
    sides, cross = 28, 8
    vertices = []
    for i in range(sides):
        t = 2 * pi * i / sides
        for j in range(cross):
            a = 2 * pi * j / cross
            radial = wire * cos(a)
            vertices.append((cx + wire * sin(a), cy + (height + radial) * cos(t), along + (length + radial) * sin(t)))
    faces, uvFaces = [], []
    for i in range(sides):
        k = (i + 1) % sides
        for j in range(cross):
            n = (j + 1) % cross
            faces.append((i * cross + j, i * cross + n, k * cross + n, k * cross + j))
            uvFaces.append([AtlasUv(tile, (j + u) / cross, (i + v) / sides) for u, v in ((0, 0), (1, 0), (1, 1), (0, 1))])
    return MeshObject(collection, name, vertices, faces, uvFaces)


def Saddle(collection):
    """Single curved steel shoe with rounded ends and visible lip thickness."""
    sides = 52
    rings = [(0.28, 0), (0.55, 0), (0.78, 0), (0.963, 0), (1, .002),
             (1, .006), (0.965, .008), (0.78, .008), (0.55, .008), (0.28, .008)]
    angles = [2 * pi * i / sides for i in range(sides)]
    directions = [(cos(a), sin(a)) for a in angles]
    # A rounded rectangle in plan with the bend across the short dimension.
    across = [(x, y, (abs(x) ** 3.2 + abs(y) ** 3.2) ** (-1 / 3.2)) for x, y in directions]
    samples = [(x * factor, y * factor) for x, y, factor in across]
    shapeMax = max(.053 * y ** 2 + .027 * x + .010 * x ** 2 + .008 * y for x, y in samples)
    start = .994 - shapeMax
    vertices = []
    for radius, depth in rings:
        for x, y in samples:
            x, y = x * radius, y * radius
            along = start + .053 * y ** 2 + .027 * x + .010 * x ** 2 + .008 * y + depth
            vertices.append((.155 * x, .071 * y, along))

    # Align the furthest shoe edge to the retained prop span.
    correction = max(p[2] for p in vertices) - 1
    vertices = [(x, y, along - correction) for x, y, along in vertices]
    faces, uvFaces = [], []
    for ring in range(len(rings) - 1):
        tile = "Saddle" if ring < 3 else "SaddleRim" if ring < 6 else "SaddleBack"
        for i in range(sides):
            j = (i + 1) % sides
            face = (ring * sides + i, ring * sides + j, (ring + 1) * sides + j, (ring + 1) * sides + i)
            faces.append(face)
            if 3 <= ring <= 5:
                uvFaces.append([AtlasUv(tile, (i + u) / sides, (ring - 3 + v) / 3) for u, v in ((0, 0), (1, 0), (1, 1), (0, 1))])
            else:
                uvFaces.append([AtlasUv(tile, vertices[index][0] / .32 + .5, vertices[index][1] / .149 + .5) for index in face])
    for ring, tile in ((0, "Saddle"), (len(rings) - 1, "SaddleBack")):
        face = tuple(ring * sides + i for i in range(sides))
        faces.append(face)
        uvFaces.append([AtlasUv(tile, vertices[i][0] / .32 + .5, vertices[i][1] / .149 + .5) for i in face])
    return MeshObject(collection, "CurvedBaseShoe", vertices, faces, uvFaces)


def BuildExterior():
    collection = bpy.data.collections.new("Type89LauncherExterior")
    bpy.context.scene.collection.children.link(collection)

    Revolve(collection, "TubeAndRecess", [(.027, .040), (.003, .0395), (0, .041), (0, .0445),
        (.002, .046), (.007, .046), (.013, .0448), (.025, .0447), (.354, .0447), (.372, .0453),
        (.377, .048), (.381, .051), (.385, .051), (.387, .050), (.391, .052), (.405, .052),
        (.411, .049), (.414, .045)], sides=56, tile="Collar",
        bandTiles={0: "Recess", 1: "Recess", 2: "Edge", 3: "Edge", 5: "Barrel", 6: "Barrel",
                   7: "Barrel", 8: "Barrel", 9: "Edge", 12: "Recess"}, paintBand=7)
    Revolve(collection, "CollarShoulder", [(.398, .044), (.412, .044), (.425, .0355),
        (.441, .030), (.451, .0257), (.454, .024)], sides=40, tile="Collar")
    Stem(collection)

    Revolve(collection, "ScallopedThumbWheel", [(.416, .023), (.419, .024), (.429, .024), (.431, .022)],
        sides=48, center=(.039, .017), tile="Edge", toothed=True)
    Revolve(collection, "KnurledSideGrip", [(.427, .009), (.451, .009), (.455, .0165),
        (.461, .018), (.503, .018), (.508, .016), (.510, .009), (.520, .009)],
        sides=32, center=(.046, .019), tile="Knurl", bandTiles={0: "Collar", 1: "Collar", 5: "Collar", 6: "Collar"})
    OvalLoop(collection, "SmallSideEye", (.046, .019, .529), .008, .014, .0023)
    FlatPart(collection, "SideBracket", [(-.013, .418), (.004, .413), (.032, .417),
        (.039, .433), (.020, .442), (-.010, .446), (-.022, .436)], .012, .043, "Collar")

    FlatPart(collection, "CurvedRearTab", [(.017, .756), (.018, .721), (.025, .702), (.041, .683),
        (.056, .676), (.065, .680), (.066, .691), (.058, .697), (.052, .691), (.046, .694),
        (.037, .708), (.034, .727), (.040, .752), (.030, .761)], -.010, .011, backTile="TabBack")
    FlatPart(collection, "RearTabShoulder", [(.016, .711), (.031, .728), (.040, .751),
        (.034, .763), (.008, .766), (.003, .737)], -.020, .019, "Collar")
    OvalLoop(collection, "RearTabEye", (0, .062, .684), .013, .010, .0029, tile="RearEye")

    profile = [(.734, .022), (.746, .026), (.753, .027), (.766, .0235)]
    for i in range(15):
        start = .768 + i * .0083
        profile.extend([(start, .024), (start + .002, .0265), (start + .0048, .0264), (start + .0064, .0232)])
    profile += [(.894, .024), (.901, .0245), (.905, .021)]
    Revolve(collection, "RibbedLowerSleeve", profile, sides=24, tile="Sleeve")
    Revolve(collection, "BaseNeck", [(.878, .018), (.902, .020), (.910, .024), (.918, .033), (.934, .038)],
        sides=32, tile="Neck")
    Saddle(collection)

    root = bpy.data.objects.new("Type89Launcher", None)
    collection.objects.link(root)
    for obj in list(collection.objects):
        if obj.type == "MESH":
            obj.parent = root
    for name, (x, y, z) in MOUNTS.items():
        marker = bpy.data.objects.new(name, None)
        marker.empty_display_size = .008
        marker.location = (x, -z, y)
        marker.parent = root
        collection.objects.link(marker)
    bpy.context.view_layer.update()
    return collection


def SurfaceMaterial(textureDir):
    material = bpy.data.materials.new(MATERIAL)
    material.diffuse_color = (.075, .080, .087, 1)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = nodes.get("Principled BSDF")
    for channel, colorSpace in (("Base", "sRGB"), ("Normal", "Non-Color"), ("Orm", "Non-Color")):
        texture = nodes.new("ShaderNodeTexImage")
        texture.label = f"Steel {channel}"
        file = Path(textureDir) / f"Texture_Type89LauncherSteel{channel}.webp"
        texture.image = bpy.data.images.load(str(file), check_existing=True)
        texture.image.colorspace_settings.name = colorSpace
        texture.image.pack()
        if channel == "Base":
            links.new(texture.outputs["Color"], shader.inputs["Base Color"])
        elif channel == "Normal":
            normal = nodes.new("ShaderNodeNormalMap")
            links.new(texture.outputs["Color"], normal.inputs["Color"])
            links.new(normal.outputs["Normal"], shader.inputs["Normal"])
        else:
            separate = nodes.new("ShaderNodeSeparateColor")
            links.new(texture.outputs["Color"], separate.inputs["Color"])
            links.new(separate.outputs["Green"], shader.inputs["Roughness"])
            links.new(separate.outputs["Blue"], shader.inputs["Metallic"])
    return material


def ToTzm(collection):
    root = Node("root")
    body = root.Child("body")
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in collection.objects:
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        raw = bmesh.new()
        raw.from_mesh(mesh)
        authored = raw.loops.layers.float_vector.new(AUTHORED_NORMAL_LAYER)
        basis = BLENDER_TO_GAME @ evaluated.matrix_world
        normalBasis = basis.to_3x3().inverted().transposed()
        raw.faces.ensure_lookup_table()
        for polygon in mesh.polygons:
            for loop, index in zip(raw.faces[polygon.index].loops, polygon.loop_indices):
                loop[authored] = (normalBasis @ mesh.corner_normals[index].vector).normalized()
        raw.transform(basis)
        evaluated.to_mesh_clear()
        body.Add(MATERIAL, raw, tile="sourceUv")
    for name, position in MOUNTS.items():
        body.Child(name, t=position)
    return root


def BuildType89Launcher():
    collection = BuildExterior()
    root = ToTzm(collection)
    BuildType89Launcher.sourceTriangles = sum(
        len(face.verts) - 2 for _, mesh, _ in root.children[0].parts for face in mesh.faces
    )
    return root


BuildType89Launcher.budget = TRIANGLE_LIMIT
BuildType89Launcher.targetTriangles = TRIANGLE_LIMIT
