# -*- coding: utf-8 -*-
"""Quick orientation renders: color-coded parts + axis markers."""

import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
path = argv[0]
out = argv[1]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)

scene = bpy.context.scene

COLORS = {
    "Hull": (1.0, 0.25, 0.25, 1.0),      # red
    "Track": (0.25, 0.4, 1.0, 1.0),      # blue
    "Turret": (0.3, 1.0, 0.3, 1.0),      # green
    "Barrel": (1.0, 1.0, 0.2, 1.0),      # yellow
}

def Mat(name, rgba):
    m = bpy.data.materials.new(name)
    m.diffuse_color = rgba
    return m

for obj in scene.objects:
    if obj.type != "MESH":
        continue
    chain = []
    node = obj
    while node:
        chain.append(node.name)
        node = node.parent
    color = None
    # 最近祖先优先：四个部件组的名字都在链里，Object_4 最近的祖先才是 Hull
    for c in chain:
        for key, rgba in COLORS.items():
            if key in c:
                color = Mat(key, rgba)
                break
        if color:
            break
    if obj.data.materials:
        obj.data.materials.clear()
    if color:
        obj.data.materials.append(color)

# markers: +Y red capsule, -Y blue capsule
def Marker(name, y, rgba):
    m = Mat(name, rgba)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.35, location=(0.0, y, 1.0))
    o = bpy.context.object
    o.name = name
    o.data.materials.append(m)

Marker("markYPlus", 3.0, (1.0, 0.0, 0.0, 1.0))
Marker("markYMinus", -3.4, (0.0, 0.0, 1.0, 1.0))

cam_data = bpy.data.cameras.new("cam")
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

lo = Vector((1e9,) * 3)
hi = Vector((-1e9,) * 3)
for obj in scene.objects:
    if obj.type not in ("MESH",):
        continue
    if obj.name.startswith("mark"):
        continue
    for corner in obj.bound_box:
        w = obj.matrix_world @ Vector(corner)
        for a in range(3):
            lo[a] = min(lo[a], w[a])
            hi[a] = max(hi[a], w[a])
center = (lo + hi) * 0.5
size = hi - lo
radius = max(size) * 0.55

scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "FLAT"
scene.display.shading.color_type = "MATERIAL"
scene.render.resolution_x = 1280
scene.render.resolution_y = 720

def Shoot(name, loc):
    cam.location = loc
    direction = (center - Vector(loc)).normalized()
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    cam_data.lens = 40
    scene.render.filepath = os.path.join(out, name)
    bpy.ops.render.render(write_still=True)

Shoot("side_x.png", (center.x + radius * 3.0, center.y, center.z + radius * 0.4))
Shoot("top.png", (center.x, center.y, center.z + radius * 3.0))
print("RENDER_OK")
