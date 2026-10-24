"""Render the delivered GLBs to ignored local 640px inspection images.

Run through Script_BlenderMcp.mjs exec --file after the source build. This does
not save the inspection scene over any editable source or change any asset.
"""
import math
from pathlib import Path

import bpy
from mathutils import Vector

projectDir = (Path(__file__).resolve().parents[1] if "__file__" in globals() else Path.cwd()/"Taierzhuang1938")
previewDir = projectDir.parent / "tmp/ClothLabAssetPreview"
previewDir.mkdir(parents=True, exist_ok=True)


def Render(assetId):
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=str(projectDir/f"Model/ClothLab/Model_{assetId}.glb"))
    rig = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
    if assetId != "SichuanBanner":
        # Inspection-only corner-to-centre folds demonstrate a thick closed edge.
        for bone in rig.pose.bones:
            if bone.name == "Blanket_Root":
                continue
            x, y, _ = bone.bone.head_local
            matrix = bone.bone.matrix_local.copy()
            matrix.translation.z += .10*math.exp(-((x-.18)/.32)**2)+.023*math.sin(y*5+x*3)
            bone.matrix = matrix
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.08))
    floor = bpy.context.object
    material = bpy.data.materials.new("PreviewGround")
    material.diffuse_color = (.115, .12, .105, 1)
    material.use_nodes = True
    material.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (.115, .12, .105, 1)
    material.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = .9
    floor.data.materials.append(material)
    for location, energy, size in [((-2, -3, 4), 400, 3), ((2, 1, 3), 250, 3)]:
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.data.energy, light.data.shape, light.data.size = energy, "DISK", size
        light.rotation_euler = (Vector((0, 0, 0))-light.location).to_track_quat("-Z", "Y").to_euler()
    bpy.ops.object.camera_add(location=(1.7, 2.8, 3.5))
    camera = bpy.context.object
    camera.rotation_euler = (-camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type, camera.data.ortho_scale = "ORTHO", 2.65
    scene = bpy.context.scene
    scene.camera = camera
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 20
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 640, 480
    scene.render.resolution_percentage = 100
    if scene.world is None:
        scene.world = bpy.data.worlds.new("ClothPreviewWorld")
    scene.world.color = (.22, .22, .22)
    scene.view_settings.view_transform = "AgX"
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 82
    scene.render.filepath = str(previewDir/f"Preview_{assetId}.jpg")
    bpy.ops.render.render(write_still=True)
    print("CLOTH_PREVIEW "+scene.render.filepath)


for assetId in ("DongguaQuilt", "DoorCurtain", "SichuanBanner"):
    Render(assetId)
