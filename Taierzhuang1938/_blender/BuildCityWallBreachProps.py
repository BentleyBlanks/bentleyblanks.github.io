"""Build the reference-guided Tengxian wall-breach prop pack.

Run inside Blender. The script touches only its temporary collection, exports a
ground-ready GLB, and removes the temporary scene data afterwards.
"""

import math
import os
import random

import bpy


COLLECTION_NAME = "Codex_CityWallBreachKit"
OUTPUT_PATH = os.path.abspath(os.path.join(
    os.path.dirname(__file__), "..", "Model", "Model_CityWallBreachPack.glb"))
MATERIAL_SPECS = {
    "CityBrickWorn": (0.25, 0.28, 0.30),
    "RammedEarth": (0.46, 0.34, 0.20),
    "Ashlar": (0.55, 0.55, 0.52),
    "GroundRubble": (0.29, 0.25, 0.20),
}


def CreateMaterial(name, color):
    existing = bpy.data.materials.get(name)
    if existing:
        return existing, False
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1.0)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = 0.96
    return material, True


def Relink(obj, collection):
    for source in list(obj.users_collection):
        source.objects.unlink(obj)
    collection.objects.link(obj)


def GroundMesh(obj):
    minimum = min(vertex.co.z for vertex in obj.data.vertices)
    for vertex in obj.data.vertices:
        vertex.co.z -= minimum
    obj.data.update()


def CreateShoulder(name, profile, collection, materials, mirror=False):
    depth = 7.6
    points = [(-x if mirror else x, z) for x, z in profile]
    count = len(points)
    vertices = ([(x, -depth / 2, z) for x, z in points]
        + [(x, depth / 2, z) for x, z in points])
    faces = [tuple(range(count - 1, -1, -1)), tuple(range(count, 2 * count))]
    material_indices = [1, 1]
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, count + following, count + index))
        x0, z0 = points[index]
        x1, z1 = points[following]
        material_indices.append(0 if abs(x1 - x0) > abs(z1 - z0) * 0.7 else 1)

    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(materials["CityBrickWorn"])
    mesh.materials.append(materials["RammedEarth"])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    for polygon, material_index in zip(mesh.polygons, material_indices):
        polygon.material_index = material_index
    bevel = obj.modifiers.new("BrokenEdgeBevel", "BEVEL")
    bevel.width = 0.10
    bevel.segments = 1
    obj["asset_role"] = "jagged exposed rammed-earth breach shoulder"

    sign = -1 if name.endswith("Left") else 1
    stones = [
        (sign * 2.75, -3.25, 1.15, 0.80, 0.42, 0.18),
        (sign * 3.15, 2.95, 0.90, 0.70, 0.35, -0.11),
        (sign * 1.95, 3.30, 0.75, 0.65, 0.28, 0.27),
    ]
    for index, (x, y, size_x, size_y, size_z, yaw) in enumerate(stones, 1):
        bpy.ops.mesh.primitive_cube_add(
            location=(x, y, size_z / 2), scale=(size_x / 2, size_y / 2, size_z / 2))
        stone = bpy.context.object
        stone.name = f"{name}_Ashlar_{index:02d}"
        Relink(stone, collection)
        stone.data.materials.append(materials["Ashlar"])
        stone.rotation_euler[2] = yaw
        stone.parent = obj
    return obj


def CreateDebris(name, seed, width, depth, count, collection, materials,
        corridor=0.0, peak=1.4):
    randomizer = random.Random(seed)
    pieces = []
    attempts = 0
    palette = ["CityBrickWorn", "CityBrickWorn", "GroundRubble", "RammedEarth", "Ashlar"]
    while len(pieces) < count and attempts < count * 12:
        attempts += 1
        x = randomizer.uniform(-width / 2, width / 2)
        y = randomizer.uniform(-depth / 2, depth / 2)
        if corridor and abs(x) < corridor / 2:
            continue
        center_bias = 1.0 - min(1.0, abs(y) / (depth / 2))
        side_bias = 0.55 + 0.45 * min(1.0, abs(x) / (width / 2))
        mound = max(0.12, peak * center_bias * side_bias)
        size_x = randomizer.uniform(0.24, 0.95)
        size_y = randomizer.uniform(0.22, 0.82)
        size_z = randomizer.uniform(0.12, 0.46)
        z = size_z / 2 + randomizer.uniform(0.0, mound * 0.75)
        bpy.ops.mesh.primitive_cube_add(
            location=(x, y, z), scale=(size_x / 2, size_y / 2, size_z / 2))
        piece = bpy.context.object
        Relink(piece, collection)
        piece.rotation_euler = (
            randomizer.uniform(-0.35, 0.35), randomizer.uniform(-0.35, 0.35),
            randomizer.uniform(0, math.tau))
        piece.data.materials.append(materials[randomizer.choice(palette)])
        bevel = piece.modifiers.new("ChippedEdges", "BEVEL")
        bevel.width = min(size_x, size_y, size_z) * 0.12
        bevel.segments = 1
        bpy.context.view_layer.objects.active = piece
        bpy.ops.object.modifier_apply(modifier=bevel.name)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        pieces.append(piece)

    bpy.ops.object.select_all(action="DESELECT")
    for piece in pieces:
        piece.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0]
    bpy.ops.object.join()
    root = pieces[0]
    root.name = name
    root.data.name = name + "Mesh"
    GroundMesh(root)
    root["asset_role"] = ("two-sided rubble fan with clear infantry trough"
        if corridor else "broken brick cluster")
    return root


def CreateCoping(name, length, collection, material):
    vertices = [
        (-length / 2, -0.55, 0), (length / 2, -0.48, 0),
        (length / 2, 0.50, 0), (-length / 2, 0.58, 0),
        (-length / 2 + 0.18, -0.48, 0.30), (length / 2 - 0.30, -0.42, 0.42),
        (length / 2 - 0.12, 0.44, 0.34), (-length / 2 + 0.30, 0.50, 0.45),
    ]
    faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1),
        (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    bevel = obj.modifiers.new("ChippedEdges", "BEVEL")
    bevel.width = 0.09
    bevel.segments = 1
    obj["asset_role"] = "fallen wall-top ashlar coping"
    return obj


def Build():
    old = bpy.data.collections.get(COLLECTION_NAME)
    if old:
        for obj in list(old.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(old)
    collection = bpy.data.collections.new(COLLECTION_NAME)
    bpy.context.scene.collection.children.link(collection)
    material_pairs = {name: CreateMaterial(name, color)
        for name, color in MATERIAL_SPECS.items()}
    materials = {name: pair[0] for name, pair in material_pairs.items()}

    profile = [
        (-3.8, 0.0), (3.8, 0.0), (3.8, 10.7), (3.0, 10.9),
        (2.4, 9.7), (1.8, 10.2), (1.2, 8.6), (0.45, 8.9),
        (-0.15, 6.8), (-0.8, 7.4), (-1.35, 5.4), (-2.0, 5.8),
        (-2.55, 3.6), (-3.2, 4.0), (-3.8, 2.1),
    ]
    # The left shoulder has its low torn edge on +X, toward the opening.
    CreateShoulder("CityWallBreachShoulderLeft", profile, collection, materials, mirror=True)
    CreateShoulder("CityWallBreachShoulderRight", profile, collection, materials, mirror=False)
    CreateDebris("CityWallBreachDebrisFan", 19380317, 16.0, 17.0, 92,
        collection, materials, corridor=3.8, peak=1.8)
    CreateDebris("CityWallBreachBrickCluster01", 1220317, 4.8, 3.6, 20,
        collection, materials, peak=0.85)
    CreateDebris("CityWallBreachBrickCluster02", 4100317, 5.4, 4.0, 22,
        collection, materials, peak=1.0)
    CreateCoping("CityWallBreachCoping01", 3.4, collection, materials["Ashlar"])
    CreateCoping("CityWallBreachCoping02", 2.6, collection, materials["Ashlar"])

    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = bpy.data.objects["CityWallBreachShoulderLeft"]
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUTPUT_PATH, export_format="GLB", use_selection=True,
        export_apply=True, export_materials="EXPORT", export_yup=True)

    for obj in list(collection.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(collection)
    for name, (material, created) in material_pairs.items():
        if created and material.users == 0:
            bpy.data.materials.remove(material)
    print({"output": OUTPUT_PATH, "bytes": os.path.getsize(OUTPUT_PATH)})


Build()
