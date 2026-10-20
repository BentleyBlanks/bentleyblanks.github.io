"""Native Blender end-grain baking, isolated from the editable asset scene.

Call BakeEndGrain(sourceImagePath, outputDir) inside Blender. The result contains
Base/Normal/Orm products; their paths point to WebP files. PNG bake targets and a
fake-user material retain the editable native bake graph. This module neither
starts Blender nor assigns materials or UVs to asset objects.
"""

import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path

import bpy


def BakeEndGrain(sourceImagePath, outputDir):
    """Bake Base1024, tangent Normal512 and ORM512 using one temporary plane.

    The bump uses source luminance, distance 0.0006 and strength 0.25. ORM is
    (1, 0.76 + luminance * 0.12, 0). Runtime files are limited to 600,000 bytes
    each and 1,000,000 bytes together; WebP quality starts at 90 and is reduced
    only when those byte budgets require it.
    """
    sourceImagePath = Path(sourceImagePath).resolve()
    outputDir = Path(outputDir).resolve()
    if not sourceImagePath.is_file():
        raise FileNotFoundError(sourceImagePath)
    if bpy.context.mode != "OBJECT":
        raise RuntimeError("End-grain bake requires Object Mode")
    outputDir.mkdir(parents=True, exist_ok=True)
    pythonExecutable = os.environ.get("SKIFF_PYTHON") or shutil.which("python")
    if not pythonExecutable:
        raise RuntimeError("Set SKIFF_PYTHON to a Python executable with Pillow installed")
    roles = ("Base", "Normal", "Orm")
    products = {}
    targets = {}
    outputs = {}
    # MCP timer callbacks can have no context.window even while Blender has a
    # visible window. Bind an actual existing window for native bake operators;
    # WebP encoding runs in an external Python process, without the glTF addon.
    sourceWindow = bpy.context.window
    if sourceWindow is None:
        windows = list(bpy.context.window_manager.windows)
        sourceWindow = next((window for window in windows
                             if window.scene == bpy.context.scene),
                            windows[0] if windows else None)
    if sourceWindow is None:
        raise RuntimeError("End-grain baking requires an existing Blender window")
    previousScene = sourceWindow.scene
    bakeScene = None
    plane = None
    planeMesh = None

    mother = bpy.data.images.load(str(sourceImagePath), check_existing=False)
    mother.name = "Texture_SkiffB27EndGrainMother"
    mother.colorspace_settings.name = "sRGB"
    mother.pack()
    material = bpy.data.materials.new("Material_SkiffB27EndGrainBake")
    material.use_nodes = True
    material.use_fake_user = True
    tree = material.node_tree
    tree.nodes.clear()
    source = tree.nodes.new("ShaderNodeTexImage")
    source.name = "EndGrainMother"
    source.label = "Editable end-grain mother"
    source.image = mother
    source.interpolation = "Linear"
    source.location = (-850, 240)
    luminance = tree.nodes.new("ShaderNodeRGBToBW")
    luminance.name = "EndGrainLuminance"
    luminance.location = (-620, 0)
    tree.links.new(source.outputs["Color"], luminance.inputs["Color"])

    baseEmission = tree.nodes.new("ShaderNodeEmission")
    baseEmission.name = "EndGrainBaseEmission"
    baseEmission.location = (-350, 340)
    tree.links.new(source.outputs["Color"], baseEmission.inputs["Color"])
    bump = tree.nodes.new("ShaderNodeBump")
    bump.name = "EndGrainMicroBump"
    bump.location = (-350, 60)
    bump.inputs["Distance"].default_value = 0.0006
    bump.inputs["Strength"].default_value = 0.25
    tree.links.new(luminance.outputs[0], bump.inputs["Height"])
    normalShader = tree.nodes.new("ShaderNodeBsdfPrincipled")
    normalShader.name = "EndGrainNormalShader"
    normalShader.location = (-60, 100)
    normalShader.inputs["Roughness"].default_value = 0.82
    normalShader.inputs["Metallic"].default_value = 0.0
    tree.links.new(source.outputs["Color"], normalShader.inputs["Base Color"])
    tree.links.new(bump.outputs["Normal"], normalShader.inputs["Normal"])

    roughnessScale = tree.nodes.new("ShaderNodeMath")
    roughnessScale.name = "EndGrainRoughnessVariation"
    roughnessScale.operation = "MULTIPLY"
    roughnessScale.inputs[1].default_value = 0.12
    roughnessScale.location = (-400, -250)
    tree.links.new(luminance.outputs[0], roughnessScale.inputs[0])
    roughnessOffset = tree.nodes.new("ShaderNodeMath")
    roughnessOffset.name = "EndGrainRoughnessFloor"
    roughnessOffset.operation = "ADD"
    roughnessOffset.inputs[1].default_value = 0.76
    roughnessOffset.location = (-210, -250)
    tree.links.new(roughnessScale.outputs[0], roughnessOffset.inputs[0])
    orm = tree.nodes.new("ShaderNodeCombineColor")
    orm.name = "EndGrainOrmChannels"
    orm.mode = "RGB"
    orm.location = (-20, -250)
    orm.inputs["Red"].default_value = 1.0
    orm.inputs["Blue"].default_value = 0.0
    tree.links.new(roughnessOffset.outputs[0], orm.inputs["Green"])
    ormEmission = tree.nodes.new("ShaderNodeEmission")
    ormEmission.name = "EndGrainOrmEmission"
    ormEmission.location = (190, -250)
    tree.links.new(orm.outputs[0], ormEmission.inputs["Color"])
    for role, shader in (("Base", baseEmission), ("Normal", normalShader),
                         ("Orm", ormEmission)):
        output = tree.nodes.new("ShaderNodeOutputMaterial")
        output.name = "EndGrain" + role + "Output"
        output.label = role + " bake output"
        output.location = (550, 350 - len(outputs) * 280)
        tree.links.new(shader.outputs[0], output.inputs["Surface"])
        outputs[role] = output

    try:
        bakeScene = bpy.data.scenes.new("Scene_SkiffB27EndGrainBake")
        bakeScene.render.engine = "CYCLES"
        bakeScene.render.threads_mode = "FIXED"
        bakeScene.render.threads = 2
        bakeScene.cycles.device = "CPU"
        bakeScene.cycles.samples = 1
        bakeScene.render.bake.use_selected_to_active = False
        bakeScene.render.bake.use_clear = True
        bakeScene.render.bake.margin = 0
        planeMesh = bpy.data.meshes.new("Model_SkiffB27EndGrainBakePlaneMesh")
        planeMesh.from_pydata([(-1, -1, 0), (1, -1, 0), (1, 1, 0), (-1, 1, 0)],
                             [], [(0, 1, 2, 3)])
        planeMesh.update()
        uv = planeMesh.uv_layers.new(name="EndGrainUv")
        corners = ((0, 0), (1, 0), (1, 1), (0, 1))
        for loop in planeMesh.loops:
            uv.data[loop.index].uv = corners[loop.vertex_index]
        plane = bpy.data.objects.new("Model_SkiffB27EndGrainBakePlane", planeMesh)
        bakeScene.collection.objects.link(plane)
        planeMesh.materials.append(material)
        layer = bakeScene.view_layers[0]
        layer.objects.active = plane
        plane.select_set(True, view_layer=layer)
        sourceWindow.scene = bakeScene

        with bpy.context.temp_override(window=sourceWindow, scene=bakeScene, view_layer=layer,
                                       object=plane, active_object=plane,
                                       selected_objects=[plane],
                                       selected_editable_objects=[plane]):
            for role in roles:
                dimension = 1024 if role == "Base" else 512
                target = bpy.data.images.new("Texture_SkiffB27EndGrain" + role,
                                             width=dimension, height=dimension,
                                             alpha=False, float_buffer=False)
                target.colorspace_settings.name = "sRGB" if role == "Base" else "Non-Color"
                destination = tree.nodes.new("ShaderNodeTexImage")
                destination.name = "EndGrain" + role + "BakeTarget"
                destination.label = role + " native bake target"
                destination.image = target
                destination.location = (850, 350 - len(targets) * 280)
                for node in tree.nodes:
                    node.select = False
                destination.select = True
                tree.nodes.active = destination
                for outputRole, output in outputs.items():
                    output.is_active_output = outputRole == role
                if role == "Normal":
                    bpy.ops.object.bake(type="NORMAL", normal_space="TANGENT", margin=0)
                else:
                    bpy.ops.object.bake(type="EMIT", margin=0)
                pngPath = outputDir / ("Texture_SkiffB27EndGrain" + role + "_Bake.png")
                target.filepath_raw = str(pngPath)
                target.file_format = "PNG"
                target.save()
                target.pack()
                targets[role] = target
                products[role] = {"path": str(outputDir / ("Texture_SkiffB27EndGrain" + role + ".webp")),
                                  "pngPath": str(pngPath), "size": [dimension, dimension],
                                  "bakeImage": target.name, "bakeMaterial": material.name,
                                  "motherSha256": hashlib.sha256(sourceImagePath.read_bytes()).hexdigest()}

        encoderPath = Path(__file__).resolve().with_name("Script_SkiffB27Encode.py")
        result = subprocess.run([pythonExecutable, str(encoderPath), "--directory", str(outputDir)],
                                capture_output=True, text=True, encoding="utf-8",
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        if result.returncode:
            raise RuntimeError("End-grain WebP encoding failed: " + result.stderr[-4000:])
        encodedProducts = json.loads(result.stdout)
        for role in roles:
            products[role].update(encodedProducts[role])

        outputs["Base"].is_active_output = True
        tree.nodes.active = tree.nodes["EndGrainBaseBakeTarget"]
        return products
    finally:
        if sourceWindow and previousScene:
            sourceWindow.scene = previousScene
        if plane is not None:
            bpy.data.objects.remove(plane, do_unlink=True)
        if planeMesh is not None and planeMesh.users == 0:
            bpy.data.meshes.remove(planeMesh)
        if bakeScene is not None:
            bpy.data.scenes.remove(bakeScene)
