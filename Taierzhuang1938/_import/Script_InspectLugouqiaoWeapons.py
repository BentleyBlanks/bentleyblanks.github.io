"""Import the Lugouqiao weapon collection and write machine-readable evidence.

Run with Blender 4.2+ after enabling the official ``io_scene_max`` extension::

    blender --background --python Script_InspectLugouqiaoWeapons.py

Required environment variables:
    TAIERZHUANG_WEAPON_MAX       Absolute input ``.max`` path.
    TAIERZHUANG_WEAPON_REPORT    Absolute output JSON path.

Optional:
    TAIERZHUANG_WEAPON_BLEND     Absolute output ``.blend`` path.
"""

import json
import os
from pathlib import Path

import bpy
from mathutils import Vector


def require_path(variable):
    value = os.environ.get(variable, "")
    if not value:
        raise RuntimeError(f"{variable} is required")
    return Path(value).resolve()


def world_bounds(obj):
    if not obj.bound_box:
        zero = [0.0, 0.0, 0.0]
        return zero, zero, zero
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    minimum = [min(corner[axis] for corner in corners) for axis in range(3)]
    maximum = [max(corner[axis] for corner in corners) for axis in range(3)]
    center = [(minimum[axis] + maximum[axis]) * 0.5 for axis in range(3)]
    size = [maximum[axis] - minimum[axis] for axis in range(3)]
    return center, size, minimum


source_path = require_path("TAIERZHUANG_WEAPON_MAX")
report_path = require_path("TAIERZHUANG_WEAPON_REPORT")
blend_value = os.environ.get("TAIERZHUANG_WEAPON_BLEND", "")
blend_path = Path(blend_value).resolve() if blend_value else None
apply_matrix = os.environ.get("TAIERZHUANG_WEAPON_APPLY_MATRIX", "true").casefold() != "false"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.preferences.addon_enable(module="bl_ext.blender_org.io_scene_max")
result = bpy.ops.import_scene.max(
    filepath=str(source_path),
    scale_objects=1.0,
    use_image_search=True,
    object_filter={"MATERIAL", "UV", "PRIMITIVE", "EMPTY", "ARMATURE"},
    use_collection=False,
    use_apply_matrix=apply_matrix,
    axis_forward="Y",
    axis_up="Z",
)
if "FINISHED" not in result:
    raise RuntimeError(f"MAX import failed: {result}")

objects = []
for obj in sorted(bpy.data.objects, key=lambda item: item.name.casefold()):
    center, size, minimum = world_bounds(obj)
    mesh = obj.data if obj.type == "MESH" else None
    objects.append(
        {
            "name": obj.name,
            "type": obj.type,
            "parent": obj.parent.name if obj.parent else None,
            "collections": sorted(collection.name for collection in obj.users_collection),
            "vertices": len(mesh.vertices) if mesh else 0,
            "triangles": sum(len(poly.vertices) - 2 for poly in mesh.polygons) if mesh else 0,
            "materials": [slot.material.name if slot.material else None for slot in obj.material_slots],
            "visibleViewport": not obj.hide_get(),
            "visibleRender": not obj.hide_render,
            "center": center,
            "size": size,
            "minimum": minimum,
        }
    )

images = []
for image in sorted(bpy.data.images, key=lambda item: item.name.casefold()):
    resolved = bpy.path.abspath(image.filepath) if image.filepath else ""
    images.append(
        {
            "name": image.name,
            "filepath": resolved,
            "size": list(image.size),
            "packed": image.packed_file is not None,
            "exists": bool(resolved and Path(resolved).is_file()),
        }
    )

materials = []
for material in sorted(bpy.data.materials, key=lambda item: item.name.casefold()):
    material_images = []
    if material.use_nodes and material.node_tree:
        material_images = sorted(
            {
                node.image.name
                for node in material.node_tree.nodes
                if node.type == "TEX_IMAGE" and node.image is not None
            }
        )
    materials.append(
        {
            "name": material.name,
            "baseColor": list(material.diffuse_color),
            "images": material_images,
        }
    )

report_path.parent.mkdir(parents=True, exist_ok=True)
report_path.write_text(
    json.dumps(
        {
            "source": str(source_path),
            "applyMatrix": apply_matrix,
            "objectCount": len(objects),
            "meshCount": sum(item["type"] == "MESH" for item in objects),
            "objects": objects,
            "images": images,
            "materials": materials,
        },
        ensure_ascii=False,
        indent=2,
    ),
    encoding="utf-8",
)

if blend_path:
    blend_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), check_existing=False)

print(f"Imported {len(objects)} objects from {source_path}")
print(f"Report: {report_path}")
if blend_path:
    print(f"Blend: {blend_path}")
