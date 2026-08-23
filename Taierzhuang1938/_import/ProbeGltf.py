# -*- coding: utf-8 -*-
"""Headless probe: import a glTF and dump object/material/bounds info."""

import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
path = argv[0]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)

def Chain(obj):
    names = []
    node = obj
    while node is not None:
        names.append(node.name)
        node = node.parent
    return "/".join(reversed(names))

lo = Vector((1e9, 1e9, 1e9))
hi = Vector((-1e9, -1e9, -1e9))
for obj in bpy.context.scene.objects:
    if obj.type == "MESH":
        for corner in obj.bound_box:
            w = obj.matrix_world @ Vector(corner)
            for a in range(3):
                lo[a] = min(lo[a], w[a])
                hi[a] = max(hi[a], w[a])
        mats = [s.material.name if s.material else "?" for s in obj.material_slots]
        olo = Vector((1e9, 1e9, 1e9))
        ohi = Vector((-1e9, -1e9, -1e9))
        for corner in obj.bound_box:
            w = obj.matrix_world @ Vector(corner)
            for a in range(3):
                olo[a] = min(olo[a], w[a])
                ohi[a] = max(ohi[a], w[a])
        size = tuple(round(ohi[a] - olo[a], 3) for a in range(3))
        print("MESH %-46s verts=%-6d faces=%-6d mats=%s bounds min=%s max=%s size=%s" % (
            Chain(obj), len(obj.data.vertices), len(obj.data.polygons), mats,
            tuple(round(v, 3) for v in olo), tuple(round(v, 3) for v in ohi), size))
    else:
        print("NODE %-46s rot=%s scale=%s" % (Chain(obj), tuple(round(v, 3) for v in obj.rotation_euler),
                                              tuple(round(v, 3) for v in obj.scale)))
print("BOUNDS min=%s max=%s size=%s" % (tuple(round(v, 3) for v in lo),
                                        tuple(round(v, 3) for v in hi),
                                        tuple(round(hi[a] - lo[a], 3) for a in range(3))))
print("OBJECTS_OK")
