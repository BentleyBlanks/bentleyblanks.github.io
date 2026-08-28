"""Read-only audit of a legacy 3ds Max scene through Blender's io_scene_max add-on.

This is deliberately an audit tool, not the production character exporter.  The open-source
MAX reader can recover meshes, UVs, materials, object hierarchy and Biped placeholders from
legacy ``.max`` containers, which is enough to inventory a source scene before the lossless
3ds Max -> FBX -> Blender bake.  It does not claim to reconstruct Skin modifiers or ``.bip``
animation tracks.

Run with Blender, passing arguments after ``--``::

    blender --background --python Script_AuditMaxImport.py -- \
      --addon-root C:/path/to/io_scene_max \
      --input C:/path/to/scene.max \
      --output C:/path/to/audit.blend
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
import time

import bpy


def ParseArgs() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--addon-root", required=True, type=Path)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--no-image-search", action="store_true")
    parser.add_argument("--include-objects", action="store_true")
    return parser.parse_args(argv)


def ObjectSummary(obj: bpy.types.Object) -> dict[str, object]:
    summary: dict[str, object] = {
        "name": obj.name,
        "type": obj.type,
        "parent": obj.parent.name if obj.parent else None,
        "children": len(obj.children),
    }
    if obj.type == "MESH":
        summary.update(
            vertices=len(obj.data.vertices),
            polygons=len(obj.data.polygons),
            materials=len(obj.data.materials),
            vertexGroups=len(obj.vertex_groups),
            modifiers=[modifier.type for modifier in obj.modifiers],
        )
    return summary


def Main() -> None:
    args = ParseArgs()
    sourceFile = args.input.resolve()
    outputFile = args.output.resolve()
    addonRoot = args.addon_root.resolve()
    if not sourceFile.is_file():
        raise FileNotFoundError(sourceFile)
    if not (addonRoot / "source" / "__init__.py").is_file():
        raise FileNotFoundError(addonRoot / "source" / "__init__.py")

    sys.path.insert(0, str(addonRoot))
    import source as io_scene_max  # pylint: disable=import-error,import-outside-toplevel

    io_scene_max.register()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    startedAt = time.perf_counter()
    result = bpy.ops.import_scene.max(
        filepath=str(sourceFile),
        object_filter={"MATERIAL", "UV", "PRIMITIVE", "EMPTY", "ARMATURE"},
        use_image_search=not args.no_image_search,
        use_collection=False,
        use_apply_matrix=True,
        scale_objects=1.0,
        axis_forward="Y",
        axis_up="Z",
    )
    elapsedSeconds = time.perf_counter() - startedAt

    outputFile.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(outputFile), check_existing=False)

    objects = [ObjectSummary(obj) for obj in bpy.context.scene.objects]
    meshes = [obj for obj in objects if obj["type"] == "MESH"]
    empties = [obj for obj in objects if obj["type"] == "EMPTY"]
    report = {
        "source": str(sourceFile),
        "output": str(outputFile),
        "operatorResult": sorted(result),
        "elapsedSeconds": round(elapsedSeconds, 3),
        "objects": len(objects),
        "meshes": len(meshes),
        "empties": len(empties),
        "armatures": sum(obj["type"] == "ARMATURE" for obj in objects),
        "vertices": sum(int(obj.get("vertices", 0)) for obj in meshes),
        "polygons": sum(int(obj.get("polygons", 0)) for obj in meshes),
        "skinnedMeshes": sum(
            "ARMATURE" in obj.get("modifiers", []) and int(obj.get("vertexGroups", 0)) > 0
            for obj in meshes
        ),
        "actions": [action.name for action in bpy.data.actions],
    }
    if args.include_objects:
        report["objectData"] = objects
    print("MAX_AUDIT_JSON=" + json.dumps(report, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    Main()
