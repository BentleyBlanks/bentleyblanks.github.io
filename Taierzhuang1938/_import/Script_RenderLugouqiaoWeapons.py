"""Render one neutral-clay identification image per root asset in an imported blend.

Required environment variables:
    TAIERZHUANG_WEAPON_SHOT_DIR  Absolute output directory.

The input ``.blend`` is supplied to Blender on the command line. The script does
not modify or save it.
"""

import os
import re
from pathlib import Path

import bpy
from mathutils import Vector


def descendants(root):
    result = [root]
    for child in root.children:
        result.extend(descendants(child))
    return result


def safe_stem(name):
    value = re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_")
    return value or "Unnamed"


def bounds(objects):
    corners = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        corners.extend(obj.matrix_world @ Vector(point) for point in obj.bound_box)
    if not corners:
        return Vector((0.0, 0.0, 0.0)), [Vector((0.0, 0.0, 0.0))]
    minimum = Vector(tuple(min(point[axis] for point in corners) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in corners) for axis in range(3)))
    return (minimum + maximum) * 0.5, corners


def aim_camera(camera, center, corners, direction):
    direction = Vector(direction).normalized()
    camera.location = center + direction * 1000.0
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.view_layer.update()
    matrix = camera.matrix_world.to_3x3()
    right = matrix @ Vector((1.0, 0.0, 0.0))
    up = matrix @ Vector((0.0, 1.0, 0.0))
    half_width = max(abs((corner - center).dot(right)) for corner in corners)
    half_height = max(abs((corner - center).dot(up)) for corner in corners)
    aspect = bpy.context.scene.render.resolution_x / bpy.context.scene.render.resolution_y
    camera.data.ortho_scale = max(half_height * 2.0, half_width * 2.0 / aspect) * 1.18


output_value = os.environ.get("TAIERZHUANG_WEAPON_SHOT_DIR", "")
if not output_value:
    raise RuntimeError("TAIERZHUANG_WEAPON_SHOT_DIR is required")
output_dir = Path(output_value).resolve()
output_dir.mkdir(parents=True, exist_ok=True)

scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
scene.render.resolution_x = 1024
scene.render.resolution_y = 768
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.display.shading.light = "STUDIO"
scene.display.shading.studio_light = "paint.sl"
scene.display.shading.color_type = "SINGLE"
scene.display.shading.single_color = (0.32, 0.46, 0.62)
scene.display.shading.show_shadows = True
scene.display.shading.show_cavity = True
scene.display.shading.cavity_type = "WORLD"
scene.display.shading.curvature_ridge_factor = 1.6
scene.display.shading.curvature_valley_factor = 1.2
if scene.world is None:
    scene.world = bpy.data.worlds.new("World_Identification")
scene.world.color = (0.025, 0.035, 0.055)

camera_data = bpy.data.cameras.new("Camera_Identification")
camera_data.type = "ORTHO"
camera = bpy.data.objects.new("Camera_Identification", camera_data)
scene.collection.objects.link(camera)
scene.camera = camera

key_data = bpy.data.lights.new("Light_IdentificationKey", "AREA")
key_data.energy = 1800.0
key_data.shape = "DISK"
key_data.size = 700.0
key = bpy.data.objects.new("Light_IdentificationKey", key_data)
key.location = (350.0, -450.0, 650.0)
scene.collection.objects.link(key)

fill_data = bpy.data.lights.new("Light_IdentificationFill", "AREA")
fill_data.energy = 900.0
fill_data.size = 600.0
fill = bpy.data.objects.new("Light_IdentificationFill", fill_data)
fill.location = (-500.0, 250.0, 250.0)
scene.collection.objects.link(fill)

roots = sorted(
    [obj for obj in scene.objects if obj.parent is None and obj.type not in {"CAMERA", "LIGHT"}],
    key=lambda item: item.name.casefold(),
)
root_filter = {
    value.strip() for value in os.environ.get("TAIERZHUANG_WEAPON_ROOTS", "").split(",")
    if value.strip()
}
if root_filter:
    roots = [root for root in roots if root.name in root_filter]
root_members = {root.name: descendants(root) for root in roots}
for members in root_members.values():
    for obj in members:
        obj.hide_render = True

views = {
    "Iso": (1.0, -1.0, 0.72),
    "Front": (0.0, -1.0, 0.0),
    "Side": (-1.0, 0.0, 0.0),
    "Top": (0.0, 0.0, 1.0),
}
view_filter = {
    value.strip() for value in os.environ.get("TAIERZHUANG_WEAPON_VIEWS", "").split(",")
    if value.strip()
}
if view_filter:
    views = {name: direction for name, direction in views.items() if name in view_filter}

for index, root in enumerate(roots, start=1):
    members = root_members[root.name]
    for obj in members:
        obj.hide_render = False
    center, corners = bounds(members)
    for view_name, direction in views.items():
        aim_camera(camera, center, corners, direction)
        scene.render.filepath = str(
            output_dir / f"Shot_LugouqiaoWeapon_{index:02d}_{safe_stem(root.name)}_{view_name}.png"
        )
        bpy.ops.render.render(write_still=True)
    for obj in members:
        obj.hide_render = True
    print(f"Rendered {index:02d}: {root.name}")

print(f"Rendered {len(roots)} identification images to {output_dir}")
