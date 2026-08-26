# -*- coding: utf-8 -*-
"""Build a game-ready low-poly character from a Hunyuan high-poly GLB.

The script keeps the generated PBR material, runs Blender's QuadriFlow remesher
with attribute preservation, normalizes the character to a requested height,
and exports GLB/FBX plus a source Blend file.  If QuadriFlow cannot complete,
the script falls back to a UV-preserving Decimate pass and records that fact in
the report instead of silently claiming a retopology result.

Run with Blender, not the system Python::

    blender --background --factory-startup --python Script_CharacterRetopology.py -- \
      --input Model.glb --output-dir Output --stem Model_SoldierLow --target-faces 30000
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def ParseArgs() -> argparse.Namespace:
    separator = sys.argv.index("--") + 1 if "--" in sys.argv else len(sys.argv)
    parser = argparse.ArgumentParser(description="Retopologize a generated character")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--stem", required=True)
    parser.add_argument("--target-faces", type=int, default=30000)
    parser.add_argument("--height", type=float, default=1.72)
    parser.add_argument("--method", choices=["quadriflow", "decimate"], default="quadriflow")
    return parser.parse_args(sys.argv[separator:])


def ClearScene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def SelectOnly(target: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    target.select_set(True)
    bpy.context.view_layer.objects.active = target


def MeshStats(target: bpy.types.Object) -> dict:
    mesh = target.data
    triangleCount = sum(max(1, len(face.vertices) - 2) for face in mesh.polygons)
    return {
        "vertices": len(mesh.vertices),
        "polygons": len(mesh.polygons),
        "triangles": triangleCount,
        "materials": len(mesh.materials),
        "uvLayers": len(mesh.uv_layers),
        "dimensionsMeters": [round(float(value), 6) for value in target.dimensions],
    }


def NormalizeTransform(target: bpy.types.Object, desiredHeight: float) -> None:
    SelectOnly(target)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    currentHeight = max(float(value) for value in target.dimensions)
    if currentHeight <= 0:
        raise RuntimeError("Imported mesh has zero height")
    scaleFactor = desiredHeight / currentHeight
    target.scale = (scaleFactor, scaleFactor, scaleFactor)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    worldCorners = [target.matrix_world @ Vector(target.bound_box[i]) for i in range(8)]
    lowestPoint = min(point.z for point in worldCorners)
    target.location.z -= lowestPoint
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)


def Decimate(source: bpy.types.Object, targetFaces: int) -> bpy.types.Object:
    low = source.copy()
    low.data = source.data.copy()
    bpy.context.collection.objects.link(low)
    low.name = "Model_SichuanInfantryLow1938"
    low.data.name = "Model_SichuanInfantryLow1938_Mesh"
    SelectOnly(low)
    sourceTriangles = max(1, MeshStats(low)["triangles"])
    modifier = low.modifiers.new(name="RetopologyFallback", type="DECIMATE")
    modifier.decimate_type = "COLLAPSE"
    modifier.ratio = min(1.0, max(0.01, targetFaces / sourceTriangles))
    modifier.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    return low


def Retopologize(source: bpy.types.Object, targetFaces: int,
                 preferredMethod: str) -> tuple[bpy.types.Object, str]:
    if preferredMethod == "decimate":
        return Decimate(source, targetFaces), "DecimateUVPreserving"

    low = source.copy()
    low.data = source.data.copy()
    bpy.context.collection.objects.link(low)
    low.name = "Model_SichuanInfantryLow1938"
    low.data.name = "Model_SichuanInfantryLow1938_Mesh"
    SelectOnly(low)

    method = "QuadriFlow"
    try:
        result = bpy.ops.object.quadriflow_remesh(
            use_mesh_symmetry=False,
            use_preserve_sharp=True,
            use_preserve_boundary=True,
            preserve_attributes=True,
            smooth_normals=True,
            mode="FACES",
            target_faces=targetFaces,
            seed=0,
        )
        if "FINISHED" not in result:
            raise RuntimeError(f"QuadriFlow returned {result}")
    except Exception as error:
        method = f"DecimateFallback: {type(error).__name__}: {error}"
        bpy.data.objects.remove(low, do_unlink=True)
        low = Decimate(source, targetFaces)

    return low, method


def ExportAssets(low: bpy.types.Object, source: bpy.types.Object, outputDir: Path,
                 stem: str) -> dict:
    outputDir.mkdir(parents=True, exist_ok=True)
    source.hide_render = True
    source.hide_set(True)
    SelectOnly(low)

    glbPath = outputDir / f"{stem}.glb"
    fbxPath = outputDir / f"{stem}.fbx"
    blendPath = outputDir / f"{stem}.blend"

    bpy.ops.export_scene.gltf(
        filepath=str(glbPath),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
    )
    bpy.ops.export_scene.fbx(
        filepath=str(fbxPath),
        use_selection=True,
        apply_unit_scale=True,
        bake_space_transform=False,
        add_leaf_bones=False,
        path_mode="COPY",
        embed_textures=True,
    )
    bpy.ops.wm.save_as_mainfile(filepath=str(blendPath), compress=True)

    return {
        "glb": glbPath.name,
        "fbx": fbxPath.name,
        "blend": blendPath.name,
        "bytes": {
            "glb": glbPath.stat().st_size,
            "fbx": fbxPath.stat().st_size,
            "blend": blendPath.stat().st_size,
        },
    }


def Main() -> None:
    args = ParseArgs()
    inputPath = Path(args.input).resolve()
    outputDir = Path(args.output_dir).resolve()
    if not inputPath.is_file():
        raise SystemExit(f"Input model not found: {inputPath}")

    ClearScene()
    bpy.ops.import_scene.gltf(filepath=str(inputPath))
    meshes = [target for target in bpy.context.scene.objects if target.type == "MESH"]
    if not meshes:
        raise SystemExit("Imported model contains no mesh")
    source = max(meshes, key=lambda target: len(target.data.polygons))
    source.name = "Model_SichuanInfantryHigh1938"
    source.data.name = "Model_SichuanInfantryHigh1938_Mesh"
    NormalizeTransform(source, args.height)
    highStats = MeshStats(source)

    low, method = Retopologize(source, args.target_faces, args.method)
    NormalizeTransform(low, args.height)
    lowStats = MeshStats(low)
    assets = ExportAssets(low, source, outputDir, args.stem)

    report = {
        "source": inputPath.name,
        "retopologyMethod": method,
        "targetFaces": args.target_faces,
        "targetHeightMeters": args.height,
        "high": highStats,
        "low": lowStats,
        "assets": assets,
    }
    reportPath = outputDir / "Data_RetopologyReport.json"
    reportPath.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("RETOPOLOGY_RESULT=" + json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    Main()
