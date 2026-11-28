"""Build and bake the editable Type92Hmg game exterior in BlenderMCP."""
import json
import math
import os
from pathlib import Path
import sys

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from Type92HmgExterior import (ASSET_ID, ATLAS_UV, BASE_REV, REST_POSE, Exterior,
                               PrepareExterior, ReadBaseline, SourcePath)

SURFACES = {
    # Linear reflectance, roughness, metalness, bump distance in scene meters.
    "ReceiverSteel": ((.097, .105, .111), (.170, .178, .183), .51, .72, .00012),
    "RecessSteel": ((.022, .025, .027), (.043, .049, .051), .66, .56, .00004),
    "FinSteel": ((.080, .089, .096), (.163, .171, .177), .48, .78, .00012),
    "ContactSteel": ((.087, .097, .104), (.153, .164, .172), .50, .73, .00010),
    "TripodSteel": ((.077, .082, .076), (.174, .173, .151), .54, .67, .00020),
    "HandleWood": ((.072, .036, .018), (.159, .091, .045), .57, .00, .00015),
}


def AssignAtlasUvs(objects):
    """A single unwrap across every visible piece keeps charts from overlapping."""
    allPoints, allFaces, allMaterials = [], [], []
    for obj in objects:
        mesh = obj.data
        first = len(allPoints)
        allPoints.extend(obj.matrix_world @ vertex.co for vertex in mesh.vertices)
        allFaces.extend(tuple(first + i for i in face.vertices) for face in mesh.polygons)
        allMaterials.extend([obj["FinishSurface"]] * len(mesh.polygons))
    mesh = bpy.data.meshes.new("Mesh_AtlasBake")
    mesh.from_pydata(allPoints, [], allFaces)
    materials = [bpy.data.materials[key] for key in SURFACES]
    for material in materials:
        mesh.materials.append(material)
    indices = {material.name: index for index, material in enumerate(materials)}
    for polygon, name in zip(mesh.polygons, allMaterials, strict=True):
        polygon.material_index = indices[name]
        polygon.use_smooth = True
    mesh.set_sharp_from_angle(angle=math.radians(47))
    obj = bpy.data.objects.new("AtlasBake", mesh)
    bpy.context.scene.collection.objects.link(obj)
    for other in bpy.context.view_layer.objects:
        other.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    mesh.uv_layers.new(name=ATLAS_UV)
    with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj],
                                   selected_editable_objects=[obj], edit_object=obj):
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(69), island_margin=.0035,
                                margin_method="FRACTION", area_weight=.25, scale_to_bounds=True)
        bpy.ops.object.mode_set(mode="OBJECT")
    coords = [tuple(value.vector) for value in mesh.uv_layers.active.uv]
    offset = 0
    for item in objects:
        layer = item.data.uv_layers.new(name=ATLAS_UV)
        for destination, value in zip(layer.uv, coords[offset:offset + len(layer.uv)], strict=True):
            destination.vector = value
        offset += len(layer.uv)
    if offset != len(mesh.loops):
        raise RuntimeError("UV chart transfer lost one or more mesh corners")
    return obj


def Surface(name):
    dark, light, roughness, metalness, bumpDistance = SURFACES[name]
    isWood = not metalness
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*dark, 1)
    material.use_nodes = True
    graph = material.node_tree
    nodes, links = graph.nodes, graph.links
    shader = nodes.get("Principled BSDF")
    output = nodes.get("Material Output")
    position = nodes.new("ShaderNodeNewGeometry")

    def Math(operation, a, b=0):
        node = nodes.new("ShaderNodeMath")
        node.operation = operation
        for socket, value in zip(node.inputs, (a, b)):
            if isinstance(value, (int, float)):
                socket.default_value = value
            else:
                links.new(value, socket)
        return node.outputs[0]

    def Noise(scale, detail, stretch):
        mapping = nodes.new("ShaderNodeVectorMath")
        mapping.operation = "MULTIPLY"
        mapping.inputs[1].default_value = stretch
        links.new(position.outputs["Position"], mapping.inputs[0])
        node = nodes.new("ShaderNodeTexNoise")
        node.inputs["Scale"].default_value = scale
        node.inputs["Detail"].default_value = detail
        node.inputs["Roughness"].default_value = .62
        links.new(mapping.outputs["Vector"], node.inputs["Vector"])
        return node.outputs["Fac"]

    def Ramp(driver, colorA, colorB, start, end):
        node = nodes.new("ShaderNodeValToRGB")
        for stop, color, threshold in zip(node.color_ramp.elements, (colorA, colorB), (start, end)):
            stop.color = (*color, 1)
            stop.position = threshold
        links.new(driver, node.inputs["Fac"])
        return node.outputs["Color"]

    coarse = Noise(18 if isWood else 37, 3, (2.0, .32, 2.0) if isWood else (1, .67, 1))
    grain = Noise(255 if isWood else 410, 2, (2.3, .062, 2) if isWood else (1, .25, 1))
    micro = Noise(940, 1, (1, .32, 1) if isWood else (1, .65, 1))
    finish = Math("ADD", Math("MULTIPLY", coarse, .57), Math("MULTIPLY", grain, .43))
    if not isWood:
        edge = Math("MAXIMUM", 0, Math("SUBTRACT", position.outputs["Pointiness"], .52))
        finish = Math("ADD", finish, Math("MULTIPLY", edge, 1.25))
    color = Ramp(finish, dark, light, .29, .84)
    rough = Math("ADD", roughness, Math("MULTIPLY", Math("SUBTRACT", coarse, .5), .22))
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Distance"].default_value = bumpDistance
    bump.inputs["Strength"].default_value = .27 if isWood else .20
    links.new(Math("ADD", Math("MULTIPLY", grain, .72), Math("MULTIPLY", micro, .28)), bump.inputs["Height"])
    links.new(color, shader.inputs["Base Color"])
    links.new(rough, shader.inputs["Roughness"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    shader.inputs["Metallic"].default_value = metalness

    occlusion = nodes.new("ShaderNodeAmbientOcclusion")
    occlusion.samples = 24
    occlusion.inputs["Distance"].default_value = .034 if isWood else .029
    channels = nodes.new("ShaderNodeCombineColor")
    channels.mode = "RGB"
    links.new(Math("ADD", .24, Math("MULTIPLY", occlusion.outputs["AO"], .76)), channels.inputs["Red"])
    links.new(rough, channels.inputs["Green"])
    channels.inputs["Blue"].default_value = metalness
    return material, output, shader, color, channels.outputs[0]


def BakeMaps(model, size, folder, sources):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 12
    scene.render.threads_mode = "FIXED"
    scene.render.threads = min(10, os.cpu_count() or 4)
    for channel, bakeType, colorSpace in (("Base", "EMIT", "sRGB"), ("Normal", "NORMAL", "Non-Color"),
                                          ("Orm", "EMIT", "Non-Color")):
        image = bpy.data.images.new(f"Texture_{ASSET_ID}Exterior{channel}", width=size, height=size,
                                    alpha=False, float_buffer=False)
        image.colorspace_settings.name = colorSpace
        active = []
        for material, output, shader, base, orm in sources:
            graph = material.node_tree
            target = graph.nodes.new("ShaderNodeTexImage")
            target.image = image
            graph.nodes.active = target
            emission = None
            if bakeType == "EMIT":
                emission = graph.nodes.new("ShaderNodeEmission")
                graph.links.new(base if channel == "Base" else orm, emission.inputs[0])
                graph.links.new(emission.outputs[0], output.inputs["Surface"])
            active.append((graph, output, shader, target, emission))
        with bpy.context.temp_override(object=model, active_object=model, selected_objects=[model],
                                       selected_editable_objects=[model]):
            bpy.ops.object.bake(type=bakeType, use_clear=True, margin=5, margin_type="EXTEND",
                                uv_layer=ATLAS_UV)
        image.file_format = "PNG"
        image.filepath_raw = str(folder / f"{image.name}.png")
        image.save()
        for graph, output, shader, target, emission in active:
            graph.nodes.remove(target)
            if emission:
                graph.nodes.remove(emission)
                graph.links.new(shader.outputs[0], output.inputs["Surface"])
        bpy.data.images.remove(image)
    bpy.data.objects.remove(model, do_unlink=True)


def PreviewRig():
    scene = bpy.context.scene
    scene.world = bpy.data.worlds.new("FinishStudioWorld")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (.55, .56, .58, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .35
    studio = bpy.data.collections.new("ReferenceStudio")
    scene.collection.children.link(studio)
    target = Vector((0, .300, -.100))
    camera = bpy.data.objects.new("ReferenceCamera", bpy.data.cameras.new("ReferenceCamera"))
    studio.objects.link(camera)
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 1.26
    camera.location = target + Vector((2, .001, .055))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera
    for label, tip, power, size in (
        ("LargeKey", (1.35, .7, 1.2), 125, 1.18),
        ("OppositeFill", (-1.1, .08, .7), 95, 1.14),
        ("LongEdge", (.2, -.42, .98), 95, .82),
    ):
        data = bpy.data.lights.new(label, "AREA")
        data.energy = power
        data.shape = "DISK"
        data.size = size
        light = bpy.data.objects.new(label, data)
        studio.objects.link(light)
        light.location = tip
        light.rotation_euler = (target - light.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 700
    scene.render.resolution_percentage = 100
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 28


def Bake(*, size=1024):
    path = SourcePath()
    path.parent.mkdir(parents=True, exist_ok=True)
    maps = path.parent / "Bakes"
    maps.mkdir(exist_ok=True)
    baseline = ReadBaseline()
    bpy.ops.wm.read_homefile(use_factory_startup=True, use_empty=True)
    scene = bpy.context.scene
    scene["BlenderMcpTask"] = "Type92HmgExterior20261128"
    scene["GameBaseline"] = BASE_REV
    model = bpy.data.collections.new(REST_POSE)
    scene.collection.children.link(model)
    model["AssetId"] = ASSET_ID
    schema = [{key: value for key, value in node.items() if key != "meshes"} for node in baseline["nodes"]]
    model["TzmNodes"] = json.dumps(schema)
    exterior = Exterior(model, schema)
    PrepareExterior(exterior, baseline)
    sources = [Surface(key) for key in SURFACES]
    objects = sorted(model.objects, key=lambda obj: obj.name)
    for item in objects:
        item.data.materials.append(bpy.data.materials[item["FinishSurface"]])
    bpy.context.view_layer.update()
    atlas = AssignAtlasUvs(objects)
    # The atlas proxy provides both shading and occlusion during baking.
    # Hide the corresponding editable objects so surfaces do not occlude themselves.
    for item in objects:
        item.hide_render = True
    BakeMaps(atlas, size, maps, sources)
    for item in objects:
        item.hide_render = False
    PreviewRig()
    bpy.ops.wm.save_as_mainfile(filepath=str(path), compress=True)
    return {"asset": ASSET_ID, "blend": str(path), "maps": str(maps), "objects": len(objects)}
