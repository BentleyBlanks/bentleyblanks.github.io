"""Render the baked leafless-tree set for topology QA.

Run with Blender from the repository root:
  blender --background --python Taierzhuang1938/_import/Script_SketchfabTreeRender.py
"""

from pathlib import Path

import bpy
from mathutils import Vector


rootDir = Path(__file__).resolve().parents[1]
modelPath = rootDir / "Model" / "Model_LeaflessTreeSet.glb"
outputPath = rootDir / "_shots" / "TreeModels_BlenderQa.png"


def LookAt(obj: bpy.types.Object, point: Vector) -> None:
    obj.rotation_euler = (point - obj.location).to_track_quat("-Z", "Y").to_euler()


def Main() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(modelPath))
    trees = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    trees.sort(key=lambda obj: obj.name)
    for tree, x in zip(trees, (-8.0, 0.0, 8.0), strict=True):
        tree.location.x = x

    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, -0.02))
    ground = bpy.context.object
    groundMaterial = bpy.data.materials.new("QaGround")
    groundMaterial.diffuse_color = (0.11, 0.12, 0.13, 1.0)
    ground.data.materials.append(groundMaterial)

    bpy.ops.object.light_add(type="SUN", location=(0, -4, 12))
    sun = bpy.context.object
    sun.rotation_euler = (0.55, -0.45, -0.65)
    sun.data.energy = 2.0
    sun.data.angle = 0.25

    bpy.ops.object.light_add(type="AREA", location=(0, -8, 10))
    area = bpy.context.object
    area.data.energy = 1100
    area.data.shape = "DISK"
    area.data.size = 8
    LookAt(area, Vector((0, 0, 3.5)))

    bpy.ops.object.camera_add(location=(0, -25, 5.0))
    camera = bpy.context.object
    camera.data.lens = 52
    LookAt(camera, Vector((0, 0, 3.5)))
    bpy.context.scene.camera = camera

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1800
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(outputPath)
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new("QaWorld")
    scene.world.color = (0.035, 0.04, 0.05)
    outputPath.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True)
    print(f"TREE_RENDER_OK {outputPath}", flush=True)


if __name__ == "__main__":
    Main()
