"""Export a static external GLB with the game's shared material applied at runtime.

Usage:
  blender --background --python Script_ExternalPropOptimize.py -- --input in.glb --output out.glb

This intentionally removes downloaded texture payloads.  The web build assigns
the existing WoodBeam / GroundRubble material recipes after loading, so keeping
4K source textures in a repeated combat prop would only inflate download size.
"""

import argparse
import bpy


def ParseArgs():
    argv = list(__import__("sys").argv)
    try:
        start = argv.index("--") + 1
    except ValueError:
        start = len(argv)
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args(argv[start:])


def Main():
    args = ParseArgs()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=args.input)
    material = bpy.data.materials.new("TZM_SharedRuntimeMaterial")
    material.diffuse_color = (0.38, 0.30, 0.23, 1.0)
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        obj.data.materials.clear()
        obj.data.materials.append(material)
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=args.output,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_materials="EXPORT",
        export_yup=True,
    )


if __name__ == "__main__":
    Main()
