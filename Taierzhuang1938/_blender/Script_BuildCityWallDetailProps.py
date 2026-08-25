"""Build reusable Blender-authored detail modules for intact Tengxian walls."""

from __future__ import annotations

import math
import os
import random

import bpy


COLLECTION_NAME = "Codex_CityWallDetailKit"
OUTPUT_PATH = os.path.abspath(os.path.join(
    os.path.dirname(__file__), "..", "Model", "Model_CityWallDetailPack.glb"))
MATERIAL_SPECS = {
    "CityBrickWorn": (0.27, 0.29, 0.31),
    "CityBrickPatch": (0.22, 0.24, 0.26),
    "RammedEarth": (0.48, 0.34, 0.19),
    "Ashlar": (0.57, 0.57, 0.54),
    "Charred": (0.055, 0.05, 0.045),
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


def AddBox(collection, material, name, size, location, rotation=(0, 0, 0), bevel=0.025):
    bpy.ops.mesh.primitive_cube_add(location=location, scale=tuple(value * 0.5 for value in size))
    obj = bpy.context.object
    obj.name = name
    Relink(obj, collection)
    obj.rotation_euler = rotation
    obj.data.materials.append(material)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if bevel > 0:
        modifier = obj.modifiers.new("WornEdge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 1
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


def JoinAsset(objects, name, role):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    root = objects[0]
    root.name = name
    root.data.name = name + "Mesh"
    minimum = min(vertex.co.z for vertex in root.data.vertices)
    for vertex in root.data.vertices:
        vertex.co.z -= minimum
    root.data.update()
    root["asset_role"] = role
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(58), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    return root


def CreateRepairPatch(collection, materials, name, seed, rows, columns, brick_scale=1.0):
    randomizer = random.Random(seed)
    objects = []
    brick_w = 0.48 * brick_scale
    brick_h = 0.23 * brick_scale
    for row in range(rows):
        row_columns = columns - (1 if row in (0, rows - 1) else 0)
        offset = (row % 2) * brick_w * 0.48 + randomizer.uniform(-0.08, 0.08)
        for column in range(row_columns):
            x = (column - (row_columns - 1) / 2) * brick_w + offset
            z = brick_h * (row + 0.5) + randomizer.uniform(-0.018, 0.018)
            depth = randomizer.uniform(0.10, 0.17)
            # Most of the repair uses darker later brick; scattered original
            # facing bricks remain.  A 1-in-5 accent disappeared against the
            # full wall in the first game capture, so the contrast is carried
            # by the actual modeled courses rather than a flat decal.
            objects.append(AddBox(collection,
                materials["CityBrickWorn" if (row + column) % 3 == 0 else "CityBrickPatch"],
                f"{name}_Brick_{row:02d}_{column:02d}",
                (brick_w * randomizer.uniform(0.88, 1.04), depth, brick_h * 0.90),
                (x, depth * 0.5, z),
                rotation=(randomizer.uniform(-0.025, 0.025), 0,
                    randomizer.uniform(-0.025, 0.025)), bevel=0.018))
    return JoinAsset(objects, name, "irregular hand-laid repair patch with real brick relief")


def CreateDrainSpout(collection, materials):
    objects = []
    objects.append(AddBox(collection, materials["Charred"], "DrainVoid",
        (0.50, 0.12, 0.32), (0, 0.01, 0.42), bevel=0.01))
    for index, (x, z, sx, sz) in enumerate([
            (-0.43, 0.43, 0.30, 0.72), (0.43, 0.43, 0.30, 0.72),
            (0, 0.78, 0.66, 0.22), (0, 0.12, 0.72, 0.18)]):
        objects.append(AddBox(collection, materials["Ashlar"], f"DrainFrame{index:02d}",
            (sx, 0.25, sz), (x, 0.10, z),
            rotation=(0, 0, (-0.02 if index % 2 else 0.018)), bevel=0.045))
    objects.append(AddBox(collection, materials["Ashlar"], "DrainTongue",
        (0.74, 0.88, 0.15), (0, 0.49, 0.10), rotation=(0.09, 0, 0), bevel=0.035))
    return JoinAsset(objects, "CityWallDrainSpout",
        "projecting dressed-stone wall drain with recessed throat")


def CreateRootSpall(collection, materials):
    randomizer = random.Random(19380321)
    objects = []
    for index in range(22):
        x = randomizer.uniform(-2.0, 2.0)
        z = randomizer.uniform(0.08, 0.95) * (1.0 - abs(x) / 5.0)
        sx = randomizer.uniform(0.28, 0.72)
        sy = randomizer.uniform(0.12, 0.32)
        sz = randomizer.uniform(0.16, 0.42)
        material = materials["Ashlar" if index % 4 == 0 else "CityBrickWorn"]
        objects.append(AddBox(collection, material, f"RootSpall{index:02d}",
            (sx, sy, sz), (x, sy * 0.5, z),
            rotation=(randomizer.uniform(-0.15, 0.15), randomizer.uniform(-0.12, 0.12),
                randomizer.uniform(-0.22, 0.22)), bevel=0.035))
    return JoinAsset(objects, "CityWallRootSpall",
        "ground-level missing facing bricks and loosened limestone plinth")


def CreateBrokenCoping(collection, materials):
    randomizer = random.Random(19380322)
    objects = []
    cursor = -2.25
    for index in range(7):
        length = randomizer.uniform(0.48, 0.84)
        height = randomizer.uniform(0.20, 0.36)
        objects.append(AddBox(collection, materials["Ashlar"], f"CopingStone{index:02d}",
            (length, 0.84, height), (cursor + length * 0.5, 0, height * 0.5),
            rotation=(randomizer.uniform(-0.08, 0.08), randomizer.uniform(-0.04, 0.04),
                randomizer.uniform(-0.08, 0.08)), bevel=0.065))
        cursor += length + randomizer.uniform(0.04, 0.16)
    return JoinAsset(objects, "CityWallCopingBrokenRun",
        "uneven chipped coping run breaking the otherwise straight wall-top silhouette")


def CreateShellScar(collection, materials):
    randomizer = random.Random(19380323)
    objects = [AddBox(collection, materials["Charred"], "ShellScarVoid",
        (1.15, 0.08, 1.05), (0, 0.01, 1.05), bevel=0.18)]
    for index in range(16):
        angle = math.tau * index / 16 + randomizer.uniform(-0.11, 0.11)
        radius = randomizer.uniform(0.68, 1.05)
        sx = randomizer.uniform(0.24, 0.50)
        sz = randomizer.uniform(0.16, 0.34)
        x = math.cos(angle) * radius
        z = 1.05 + math.sin(angle) * radius
        objects.append(AddBox(collection, materials["CityBrickWorn"], f"ShellScarBrick{index:02d}",
            (sx, randomizer.uniform(0.10, 0.21), sz), (x, 0.10, z),
            rotation=(0, randomizer.uniform(-0.12, 0.12), angle + math.pi / 2), bevel=0.025))
    return JoinAsset(objects, "CityWallShellScar",
        "wartime shell impact with displaced brick ring and scorched recess")


def CreateCoreExposure(collection, materials):
    objects = [AddBox(collection, materials["RammedEarth"], "ExposureCore",
        (2.25, 0.11, 1.48), (0, 0.01, 0.74), bevel=0.09)]
    teeth = [
        (-1.15, 0.18, 0.46, 0.28), (-1.03, 0.61, 0.38, 0.24),
        (-0.92, 1.09, 0.54, 0.28), (1.12, 0.20, 0.42, 0.25),
        (1.00, 0.66, 0.55, 0.26), (0.93, 1.20, 0.48, 0.25),
        (-0.55, 1.46, 0.48, 0.25), (0.12, 1.53, 0.56, 0.26),
        (0.72, 1.43, 0.42, 0.23),
    ]
    for index, (x, z, sx, sz) in enumerate(teeth):
        objects.append(AddBox(collection, materials["CityBrickWorn"], f"ExposureTooth{index:02d}",
            (sx, 0.18, sz), (x, 0.08, z), rotation=(0, 0, (-0.08 if index % 2 else 0.06)),
            bevel=0.025))
    for index, z in enumerate((0.40, 0.78, 1.14)):
        objects.append(AddBox(collection, materials["RammedEarth"], f"ExposureLift{index:02d}",
            (1.82 - index * 0.12, 0.15, 0.055), (0.03 * (index - 1), 0.09, z), bevel=0.018))
    return JoinAsset(objects, "CityWallCoreExposurePatch",
        "small facing loss exposing compacted earth lifts and broken brick teeth")


def Build():
    original_meshes = set(bpy.data.meshes)
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

    CreateRepairPatch(collection, materials, "CityWallRepairPatchLarge", 19380319, 7, 9, 1.05)
    CreateRepairPatch(collection, materials, "CityWallRepairPatchSmall", 19380320, 4, 6, 0.88)
    CreateDrainSpout(collection, materials)
    CreateRootSpall(collection, materials)
    CreateBrokenCoping(collection, materials)
    CreateShellScar(collection, materials)
    CreateCoreExposure(collection, materials)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = bpy.data.objects["CityWallRepairPatchLarge"]
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUTPUT_PATH, export_format="GLB", use_selection=True,
        export_apply=True, export_materials="EXPORT", export_yup=True)

    for obj in list(collection.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(collection)
    for mesh in list(bpy.data.meshes):
        if mesh not in original_meshes and mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    for material, created in material_pairs.values():
        if created and material.users == 0:
            bpy.data.materials.remove(material)
    print({"output": OUTPUT_PATH, "bytes": os.path.getsize(OUTPUT_PATH)})


Build()
