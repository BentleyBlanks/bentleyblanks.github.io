"""Build and bake the editable Type 11 game exterior in BlenderMCP."""
import json
import math
import os
from pathlib import Path
import sys
import tempfile

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from ImportWeapons import BuildImported
from Type11Exterior import (ATLAS_UV, BASE_REV, REST_POSE, Exterior,
                            PrepareType11, ReadBaseline, SourcePath)
from TzmCore import WriteTzm

SURFACES = {
    # Linear oxide and polished-steel reflectance, dry roughness, metalness,
    # shallow normal texture and bake-only edge radius (metres).
    "ReceiverSteel": ((.289, .301, .305), (.528, .544, .535), .415, .635, .00014, .00110),
    "TubeSteel": ((.172, .184, .190), (.417, .444, .448), .447, .681, .00009, .00065),
    "FinSteel": ((.163, .174, .173), (.479, .496, .483), .423, .771, .00007, .00029),
    "HopperSteel": ((.186, .189, .181), (.433, .454, .435), .441, .640, .00013, .00092),
    "ContactSteel": ((.231, .235, .223), (.544, .549, .520), .383, .719, .00012, .00078),
    "StockWood": ((.076, .033, .015), (.208, .115, .062), .52, .00, .00016, 0),
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
    dark, light, roughness, metalness, bumpDistance, bevelRadius = SURFACES[name]
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

    def Range(value, start, end, minimum=0, maximum=1):
        node = nodes.new("ShaderNodeMapRange")
        node.interpolation_type = "SMOOTHERSTEP"
        node.clamp = True
        links.new(value, node.inputs["Value"])
        for label, limit in (("From Min", start), ("From Max", end),
                             ("To Min", minimum), ("To Max", maximum)):
            node.inputs[label].default_value = limit
        return node.outputs["Result"]

    def MixColor(weight, darkColor, lightColor):
        node = nodes.new("ShaderNodeMixRGB")
        links.new(weight, node.inputs[0])
        links.new(darkColor, node.inputs[1])
        links.new(lightColor, node.inputs[2])
        return node.outputs[0]

    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Distance"].default_value = bumpDistance
    if isWood:
        coarse = Noise(18, 3, (2.0, .32, 2.0))
        grain = Noise(255, 2, (2.3, .062, 2))
        micro = Noise(940, 1, (1, .32, 1))
        finish = Math("ADD", Math("MULTIPLY", coarse, .57), Math("MULTIPLY", grain, .43))
        edge = Math("MAXIMUM", 0, Math("SUBTRACT", position.outputs["Pointiness"], .53))
        patch = Math("MAXIMUM", 0, Math("SUBTRACT", Noise(30, 2, (1.8, .36, 1.3)), .44))
        wear = Math("MULTIPLY", Math("MULTIPLY", edge, .72),
                    Math("ADD", .55, Math("MULTIPLY", patch, 2.0)))
        color = Ramp(Math("ADD", finish, wear), dark, light, .28, .82)
        rough = Math("ADD", roughness, Math("MULTIPLY", Math("SUBTRACT", coarse, .5), .20))
        rough = Math("SUBTRACT", rough, Math("MULTIPLY", wear, .14))
        bump.inputs["Strength"].default_value = .27
        links.new(Math("ADD", Math("MULTIPLY", grain, .72), Math("MULTIPLY", micro, .28)), bump.inputs["Height"])
        # Shade the two shallow, worn butt fittings visible in the side photographs.
        coordinates = nodes.new("ShaderNodeSeparateXYZ")
        links.new(position.outputs["Position"], coordinates.inputs[0])
        normal = nodes.new("ShaderNodeSeparateXYZ")
        links.new(position.outputs["Normal"], normal.inputs[0])
        along = Math("MULTIPLY", Math("ADD", coordinates.outputs["Y"], .154), 53)
        height = Math("MULTIPLY", Math("ADD", coordinates.outputs["Z"], .048), 115)
        footprint = Math("ADD", Math("MULTIPLY", along, along), Math("MULTIPLY", height, height))
        side = Math("GREATER_THAN", Math("ABSOLUTE", normal.outputs["X"]), .60)
        plate = Math("MULTIPLY", side, Math("LESS_THAN", footprint, 1))
        lip = Math("MULTIPLY", plate, Math("GREATER_THAN", footprint, .75))
        plateColor = Ramp(coarse, (.043, .038, .030), (.133, .116, .086), .32, .74)
        wornPlate = Ramp(lip, (.064, .061, .056), (.144, .125, .092), 0, 1)
        inlay = nodes.new("ShaderNodeMixRGB")
        inlay.blend_type = "MIX"
        links.new(lip, inlay.inputs[0])
        links.new(plateColor, inlay.inputs[1])
        links.new(wornPlate, inlay.inputs[2])
        finishColor = nodes.new("ShaderNodeMixRGB")
        links.new(plate, finishColor.inputs[0])
        links.new(color, finishColor.inputs[1])
        links.new(inlay.outputs[0], finishColor.inputs[2])
        color = finishColor.outputs[0]
        rough = Math("ADD", Math("MULTIPLY", rough, Math("SUBTRACT", 1, plate)), Math("MULTIPLY", plate, .50))
        metalness = Math("MULTIPLY", plate, .66)
    else:
        # Use the actual exterior edges for the baked normals and interrupt the
        # exposed steel with oxide that follows the handling and polishing marks.
        bevel = nodes.new("ShaderNodeBevel")
        bevel.samples = 6
        bevel.inputs["Radius"].default_value = bevelRadius
        links.new(bevel.outputs["Normal"], bump.inputs["Normal"])
        agreement = nodes.new("ShaderNodeVectorMath")
        agreement.operation = "DOT_PRODUCT"
        links.new(position.outputs["Normal"], agreement.inputs[0])
        links.new(bevel.outputs["Normal"], agreement.inputs[1])
        bevelMask = Range(agreement.outputs["Value"], .915, .9985, 1, 0)
        convex = Range(position.outputs["Pointiness"], .484, .522, .15, 1)
        raised = Range(position.outputs["Pointiness"], .506, .551)
        contour = Math("MAXIMUM", Math("MULTIPLY", bevelMask, convex), Math("MULTIPLY", raised, .62))

        patina = Noise(26, 3, (1.35, .71, 1.4))
        patch = Noise(64, 2, (1.5, .52, 2.1))
        machining = Noise(316, 2, (1.5, .077, 3.0) if name != "FinSteel" else (2.2, .48, 2.2))
        scratchSeeds = Noise(121, 2, (2.3, .052, 2.9))
        scratch = Math("MULTIPLY", Range(scratchSeeds, .60, .76), Range(patch, .34, .65, .12, .86))
        pits = nodes.new("ShaderNodeTexVoronoi")
        pits.voronoi_dimensions = "3D"
        pits.inputs["Scale"].default_value = 570
        links.new(position.outputs["Position"], pits.inputs["Vector"])
        pitting = Math("MULTIPLY", Range(pits.outputs["Distance"], .090, .235, 1, 0),
                       Range(patina, .39, .71, .16, .9))
        exposed = Math("MULTIPLY", contour, Range(patch, .29, .69, .35, .88))
        burnish = Math("MINIMUM", .84, Math("ADD", exposed, Math("MULTIPLY", scratch, .31)))
        stain = Math("ADD", Math("MULTIPLY", patina, .71), Math("MULTIPLY", patch, .29))
        bluing = Ramp(stain, tuple(channel * .77 for channel in dark),
                      tuple(channel * 1.41 for channel in dark), .27, .78)
        polished = Ramp(machining, tuple(channel * .68 for channel in light), light, .30, .73)
        color = MixColor(burnish, bluing, polished)
        darkPits = Ramp(pitting, (1, 1, 1), (.55, .57, .59), .10, 1)
        shade = nodes.new("ShaderNodeMixRGB")
        shade.blend_type = "MULTIPLY"
        shade.inputs[0].default_value = 1
        links.new(color, shade.inputs[1])
        links.new(darkPits, shade.inputs[2])
        color = shade.outputs[0]

        rough = Math("ADD", roughness, Range(stain, .28, .75, -.067, .072))
        rough = Math("ADD", rough, Math("MULTIPLY", pitting, .11))
        rough = Math("SUBTRACT", rough, Math("MULTIPLY", burnish, .153))
        height = Math("ADD", Math("MULTIPLY", machining, .62), Math("MULTIPLY", scratch, .13))
        height = Math("SUBTRACT", height, Math("MULTIPLY", pitting, .46))
        bump.inputs["Strength"].default_value = .36
        links.new(height, bump.inputs["Height"])


        # Bluing absorbs some diffuse light at the surface. Exposed and polished
        # patches approach bare metal as their roughness falls.
        metalness = Math("SUBTRACT", Math("ADD", metalness, Math("MULTIPLY", burnish, .94 - metalness)),
                         Math("MULTIPLY", pitting, .044))
        if name == "ReceiverSteel":
            # The rear cover retains more of its oxide than the worn side rails.
            location = nodes.new("ShaderNodeSeparateXYZ")
            orientation = nodes.new("ShaderNodeSeparateXYZ")
            links.new(position.outputs["Position"], location.inputs[0])
            links.new(position.outputs["Normal"], orientation.inputs[0])
            rear = Range(location.outputs["Y"], .083, .248, 1, 0)
            cover = Math("MAXIMUM", Range(orientation.outputs["Z"], .34, .87),
                         Range(orientation.outputs["Y"], -.92, -.46, 1, 0))
            retained = Math("MULTIPLY", Math("MULTIPLY", rear, cover), Math("SUBTRACT", 1, burnish))
            oxide = nodes.new("ShaderNodeMixRGB")
            oxide.blend_type = "MULTIPLY"
            links.new(retained, oxide.inputs[0])
            links.new(color, oxide.inputs[1])
            oxide.inputs[2].default_value = (.52, .60, .67, 1)
            color = oxide.outputs[0]
            rough = Math("ADD", rough, Math("MULTIPLY", retained, .038))
            metalness = Math("ADD", metalness, Math("MULTIPLY", retained, .089))

    links.new(color, shader.inputs["Base Color"])
    links.new(rough, shader.inputs["Roughness"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    links.new(metalness, shader.inputs["Metallic"])

    occlusion = nodes.new("ShaderNodeAmbientOcclusion")
    occlusion.samples = 12 if isWood else 32
    occlusion.inputs["Distance"].default_value = .034 if isWood else .024
    channels = nodes.new("ShaderNodeCombineColor")
    channels.mode = "RGB"
    aoFloor = .24 if isWood else .29
    links.new(Math("ADD", aoFloor, Math("MULTIPLY", occlusion.outputs["AO"], 1 - aoFloor)), channels.inputs["Red"])
    links.new(rough, channels.inputs["Green"])
    links.new(metalness, channels.inputs["Blue"])
    return material, output, shader, color, channels.outputs[0]


def BakeMaps(name, model, size, folder, sources):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 12
    scene.render.threads_mode = "FIXED"
    scene.render.threads = min(10, os.cpu_count() or 4)
    for channel, bakeType, colorSpace in (("Base", "EMIT", "sRGB"), ("Normal", "NORMAL", "Non-Color"),
                                          ("Orm", "EMIT", "Non-Color")):
        image = bpy.data.images.new(f"Texture_{name}Exterior{channel}", width=size, height=size,
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


def NodeSchema(baseline):
    nodes = [{key: value for key, value in item.items() if key != "meshes"} for item in baseline["nodes"]]
    for node in nodes:
        if node["name"] == "fpsOperatingHandleContact":
            node["t"] = [-.044, .054, -.158]
        if node["name"] == "sight":
            node["t"] = [.00145, .119, -.2022]
    nodes.append(dict(name="hopperFollower", parent=1, t=[-.044, .072, -.388], r=[0, 0, 0], joint=True))
    nodes.append(dict(name="hopperSeat", parent=1, t=[-.071, .023, -.325], r=[0, 0, 0]))
    nodes.append(dict(name="ejection", parent=1, t=[.034, .0585, -.264], r=[0, 0, 0]))
    return nodes


def PreviewRig():
    scene = bpy.context.scene
    scene.world = bpy.data.worlds.new("FinishStudioWorld")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (.55, .56, .58, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .35
    studio = bpy.data.collections.new("ReferenceStudio")
    scene.collection.children.link(studio)
    target = Vector((0, .300, .018))
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


def Bake(*, size=2048):
    name = "Type11"
    path = SourcePath()
    path.parent.mkdir(parents=True, exist_ok=True)
    maps = path.parent / "Bakes"
    maps.mkdir(exist_ok=True)
    baseline = ReadBaseline()
    with tempfile.TemporaryDirectory() as temporary:
        source = Path(temporary) / "Type11CcBy.tzm.json"
        WriteTzm(BuildImported(name), str(source), name, audit=False)
        ccBy = json.loads(source.read_text(encoding="utf-8"))
    bpy.ops.wm.read_homefile(use_factory_startup=True, use_empty=True)
    scene = bpy.context.scene
    scene["BlenderMcpTask"] = "Type11Exterior20261128"
    scene["GameBaseline"] = BASE_REV
    model = bpy.data.collections.new(REST_POSE)
    scene.collection.children.link(model)
    model["AssetId"] = name
    schema = NodeSchema(baseline)
    model["TzmNodes"] = json.dumps(schema)
    exterior = Exterior(model, schema)
    PrepareType11(exterior, baseline, ccBy)
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
    BakeMaps(name, atlas, size, maps, sources)
    for item in objects:
        item.hide_render = False
    PreviewRig()
    bpy.ops.wm.save_as_mainfile(filepath=str(path), compress=True)
    return {"asset": name, "blend": str(path), "maps": str(maps), "objects": len(objects)}
