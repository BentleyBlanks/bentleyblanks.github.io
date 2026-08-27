"""Convert licensed air-asset source files into the runtime GLB files.

Run from the Taierzhuang1938 directory with Blender 5.2:
  blender --background --python _import/Script_ImportAirAssets.py -- --source <obj> --output <glb>

This is intentionally a narrow conversion tool: it preserves the source
materials/textures, applies transforms, and emits one self-contained GLB.
"""

import argparse
import os
import sys

import bpy


def ParseArgs():
    separator = sys.argv.index("--") if "--" in sys.argv else len(sys.argv)
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, action="append")
    parser.add_argument("--output", required=True)
    parser.add_argument("--join-meshes", action="store_true")
    parser.add_argument("--flatten-materials", action="store_true")
    return parser.parse_args(sys.argv[separator + 1:])


def Main():
    args = ParseArgs()
    sourcePaths = [os.path.abspath(source) for source in args.source]
    outputPath = os.path.abspath(args.output)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # OBJ material paths are relative to the source file, not Blender's launch
    # directory.  Entering each source folder first preserves bundled textures.
    for sourcePath in sourcePaths:
        os.chdir(os.path.dirname(sourcePath))
        extension = os.path.splitext(sourcePath)[1].lower()
        if extension in (".gltf", ".glb"):
            bpy.ops.import_scene.gltf(filepath=sourcePath)
        elif extension == ".obj":
            bpy.ops.wm.obj_import(filepath=sourcePath)
        else:
            raise ValueError(f"Unsupported air-asset source format: {extension}")
    if args.join_meshes:
        bpy.ops.object.select_all(action="DESELECT")
        meshObjects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
        for obj in meshObjects:
            obj.select_set(True)
        if meshObjects:
            bpy.context.view_layer.objects.active = meshObjects[0]
            bpy.ops.object.join()
    if args.flatten_materials:
        material = bpy.data.materials.new(name="AircraftOliveDrab")
        material.diffuse_color = (0.12, 0.17, 0.08, 1.0)
        material.use_nodes = True
        principled = material.node_tree.nodes.get("Principled BSDF")
        principled.inputs["Base Color"].default_value = (0.12, 0.17, 0.08, 1.0)
        principled.inputs["Roughness"].default_value = 0.78
        principled.inputs["Metallic"].default_value = 0.15
        for obj in [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]:
            obj.data.materials.clear()
            obj.data.materials.append(material)
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        obj.select_set(False)
    bpy.ops.export_scene.gltf(
        filepath=outputPath,
        export_format="GLB",
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_yup=True,
        export_apply=True,
    )


if __name__ == "__main__":
    Main()
