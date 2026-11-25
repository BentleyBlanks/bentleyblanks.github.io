# -*- coding: utf-8 -*-
"""
Rebuild script for the 1938 Jinpu Railway sleeper + fastener + fishplate kit.
Exports pure-geometry GLB (zero embedded images; runtime binds existing
Texture_BeishaheSleeper / Texture_BeishaheSleeperEnd / Texture_BeishaheSteel PBR sets)
to Taierzhuang1938/Model/RailTrack/Model_RailSleeperKit.glb and saves the source
.blend to C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/RailTrack/RailSleeperKit.blend.

Coordinate contract (glTF Y-up, matching Script_RoadSpline.mjs):
  - X: along track (sleeper width ~0.23 m)
  - Y: up (Y = 0 is the sleeper top surface; body extends down to -0.16 m;
           tie-plates sit at Y = 0.000..0.014 m; rail foot rests at Y = 0.014 m)
  - Z: transverse across track (sleeper length 2.55 m; rail centers at Z = +-0.75 m,
           giving 1.435 m standard inner railhead gauge for 65 mm railhead)

Run via BlenderMCP:
  node scripts/Script_BlenderMcp.mjs start --task RailTrack
  node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_blender/Script_BuildRailTrackKit.py
  node scripts/Script_BlenderMcp.mjs stop
"""

import math
import os
import random
import bpy
import bmesh
from mathutils import Vector

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_GLB = os.path.join(REPO_ROOT, "Taierzhuang1938", "Model", "RailTrack", "Model_RailSleeperKit.glb")


def ResolveBlendPath():
    preferred = r"C:\Users\Bentl\OneDrive\AI\Models\Blender"
    if os.path.isdir(preferred):
        return os.path.join(preferred, "Taierzhuang1938", "RailTrack", "RailSleeperKit.blend")
    user_onedrive = os.path.join(os.path.expanduser("~"), "OneDrive", "AI", "Models", "Blender")
    if os.path.isdir(os.path.join(os.path.expanduser("~"), "OneDrive")):
        return os.path.join(user_onedrive, "Taierzhuang1938", "RailTrack", "RailSleeperKit.blend")
    return os.path.join(REPO_ROOT, "tmp", "BlenderMcp", "RailSleeperKit.blend")


OUT_BLEND = ResolveBlendPath()

RAIL_HALF_GAUGE = 0.750  # 1.500 m rail-center spacing = 1.435 m inner gauge + 0.065 m head


def ToBlender(x, y, z):
    """Map Three.js / glTF Y-up (x, y, z) to Blender Z-up (x, -z, y)."""
    return Vector((x, -z, y))


def ResetScene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0


def MakeMaterial(name, base_color, roughness=0.85, metallic=0.0):
    mat = bpy.data.materials.new(name=name)
    bsdf = mat.node_tree.nodes.get("Principled BSDF") if mat.node_tree else None
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
    return mat


def AddBox(bm, cx, cy, cz, sx, sy, sz, mat_idx, uv_layer, uv_scale=1.0, cap_mat_idx=None, bevel_x=0.0, bevel_y=0.0):
    """Add an axis-aligned box (optionally chamfered on top/bottom edges along Z) in glTF coords."""
    hx, hy, hz = sx * 0.5, sy * 0.5, sz * 0.5
    if bevel_x > 0.0 and bevel_y > 0.0:
        # 8-vertex chamfered cross-section extruded along Z (transverse sleeper axis)
        profile = [
            (-hx + bevel_x, hy),
            (hx - bevel_x, hy),
            (hx, hy - bevel_y),
            (hx, -hy + bevel_y * 0.5),
            (hx - bevel_x * 0.6, -hy),
            (-hx + bevel_x * 0.6, -hy),
            (-hx, -hy + bevel_y * 0.5),
            (-hx, hy - bevel_y),
        ]
        n = len(profile)
        rings = []
        for z in (cz - hz, cz + hz):
            ring = [bm.verts.new(ToBlender(cx + px, cy + py, z)) for (px, py) in profile]
            rings.append(ring)
        # Side faces along Z
        perim = [0.0]
        for i in range(n):
            p0, p1 = profile[i], profile[(i + 1) % n]
            perim.append(perim[-1] + math.hypot(p1[0] - p0[0], p1[1] - p0[1]))
        for i in range(n):
            j = (i + 1) % n
            f = bm.faces.new((rings[0][i], rings[0][j], rings[1][j], rings[1][i]))
            f.material_index = mat_idx
            f.smooth = False
            v0, v1 = perim[i] * uv_scale, perim[i + 1] * uv_scale
            u0, u1 = (cz - hz) * uv_scale, (cz + hz) * uv_scale
            uvs = [(u0, v0), (u0, v1), (u1, v1), (u1, v0)]
            for loop, uv in zip(f.loops, uvs):
                loop[uv_layer].uv = uv
        # End caps (-Z and +Z)
        end_idx = cap_mat_idx if cap_mat_idx is not None else mat_idx
        f0 = bm.faces.new(tuple(reversed(rings[0])))
        f0.material_index = end_idx
        for loop in f0.loops:
            p = loop.vert.co
            loop[uv_layer].uv = ((p.x - (cx - hx)) / max(sx, 1e-4), (p.z - (cy - hy)) / max(sy, 1e-4))
        f1 = bm.faces.new(tuple(rings[1]))
        f1.material_index = end_idx
        for loop in f1.loops:
            p = loop.vert.co
            loop[uv_layer].uv = ((p.x - (cx - hx)) / max(sx, 1e-4), (p.z - (cy - hy)) / max(sy, 1e-4))
        return

    # Plain 6-face box
    corners = [
        ToBlender(cx - hx, cy - hy, cz - hz),
        ToBlender(cx + hx, cy - hy, cz - hz),
        ToBlender(cx + hx, cy + hy, cz - hz),
        ToBlender(cx - hx, cy + hy, cz - hz),
        ToBlender(cx - hx, cy - hy, cz + hz),
        ToBlender(cx + hx, cy - hy, cz + hz),
        ToBlender(cx + hx, cy + hy, cz + hz),
        ToBlender(cx - hx, cy + hy, cz + hz),
    ]
    vs = [bm.verts.new(c) for c in corners]
    faces = [
        (0, 3, 2, 1),  # -Z
        (4, 5, 6, 7),  # +Z
        (0, 1, 5, 4),  # -Y
        (2, 3, 7, 6),  # +Y
        (1, 2, 6, 5),  # +X
        (3, 0, 4, 7),  # -X
    ]
    for fi, idxs in enumerate(faces):
        f = bm.faces.new([vs[i] for i in idxs])
        f.material_index = cap_mat_idx if (cap_mat_idx is not None and fi < 2) else mat_idx
        f.smooth = False
        # Planar box UV in meters
        for loop in f.loops:
            co = loop.vert.co
            if fi < 2:
                loop[uv_layer].uv = (co.x * uv_scale, co.z * uv_scale)
            elif fi < 4:
                loop[uv_layer].uv = (co.x * uv_scale, co.y * uv_scale)
            else:
                loop[uv_layer].uv = (co.y * uv_scale, co.z * uv_scale)


def AddPrismHex(bm, cx, y0, y1, cz, radius, sides, mat_idx, uv_layer, uv_scale=1.0):
    """Vertical polygonal cylinder/bolt along +Y in glTF coords."""
    bot, top = [], []
    for i in range(sides):
        ang = (2.0 * math.pi * i) / sides + math.pi / sides
        px = cx + math.cos(ang) * radius
        pz = cz + math.sin(ang) * radius
        bot.append(bm.verts.new(ToBlender(px, y0, pz)))
        top.append(bm.verts.new(ToBlender(px, y1, pz)))
    for i in range(sides):
        j = (i + 1) % sides
        f = bm.faces.new((bot[i], bot[j], top[j], top[i]))
        f.material_index = mat_idx
        f.smooth = False
        for loop in f.loops:
            co = loop.vert.co
            loop[uv_layer].uv = ((co.x + co.y) * uv_scale, co.z * uv_scale)
    f_top = bm.faces.new(tuple(top))
    f_top.material_index = mat_idx
    for loop in f_top.loops:
        co = loop.vert.co
        loop[uv_layer].uv = (co.x * uv_scale, co.y * uv_scale)


def BuildSleeperVariant(name, variant_idx, mats):
    """
    Build one weathered 1938 Jinpu timber sleeper with multi-station profile
    (subtle hand-hewn taper & adzed rail seats) + forged cast-iron tie-plates
    and Prussian screw spikes at both rails (Z = +-0.75 m).
    """
    rng = random.Random(193803 + variant_idx * 977)
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")

    length = 2.54 + rng.uniform(-0.03, 0.03)
    base_w = 0.232 + rng.uniform(-0.008, 0.008)
    base_h = 0.160
    bevel_x = 0.018 + rng.uniform(-0.003, 0.004)
    bevel_y = 0.015 + rng.uniform(-0.002, 0.004)

    # 7 transverse stations along sleeper length (Z): ends + outside/inside rail seats + center
    hz = length * 0.5
    stations = [-hz, -0.98, -0.75, -0.42, 0.0, 0.42, 0.75, 0.98, hz]
    rings = []
    # Cross-section profile (8 verts, CCW looking from +Z -> -Z)
    n_prof = 8
    perim_ref = None
    for si, z in enumerate(stations):
        at_seat = abs(abs(z) - RAIL_HALF_GAUGE) < 0.08
        at_end = si == 0 or si == len(stations) - 1
        # Slight hand-hewn width/crown variation away from the adzed rail seats
        w_scale = 1.0 if at_seat else (0.95 if at_end else 1.0 + rng.uniform(-0.035, 0.035))
        y_top = 0.0 if at_seat else (-0.006 if at_end else rng.uniform(-0.004, 0.005))
        x_shift = 0.0 if at_seat else rng.uniform(-0.005, 0.005)
        hx = base_w * 0.5 * w_scale
        bx = min(bevel_x * (1.25 if at_end else 1.0), hx * 0.35)
        by = bevel_y * (1.25 if at_end else 1.0)
        y_bot = -base_h
        prof = [
            (x_shift - hx + bx, y_top),
            (x_shift + hx - bx, y_top),
            (x_shift + hx, y_top - by),
            (x_shift + hx, y_bot + by * 0.45),
            (x_shift + hx - bx * 0.5, y_bot),
            (x_shift - hx + bx * 0.5, y_bot),
            (x_shift - hx, y_bot + by * 0.45),
            (x_shift - hx, y_top - by),
        ]
        if perim_ref is None:
            perim_ref = [0.0]
            for i in range(n_prof):
                p0, p1 = prof[i], prof[(i + 1) % n_prof]
                perim_ref.append(perim_ref[-1] + math.hypot(p1[0] - p0[0], p1[1] - p0[1]))
        rings.append([bm.verts.new(ToBlender(px, py, z)) for (px, py) in prof])

    u_offset = variant_idx * 0.37
    v_offset = variant_idx * 0.29
    for si in range(len(stations) - 1):
        z0, z1 = stations[si], stations[si + 1]
        for i in range(n_prof):
            j = (i + 1) % n_prof
            f = bm.faces.new((rings[si][i], rings[si][j], rings[si + 1][j], rings[si + 1][i]))
            f.material_index = 0  # Mat_SleeperWood
            f.smooth = False
            u0, u1 = z0 + hz + u_offset, z1 + hz + u_offset
            v0, v1 = perim_ref[i] + v_offset, perim_ref[i + 1] + v_offset
            for loop, uv in zip(f.loops, ((u0, v0), (u0, v1), (u1, v1), (u1, v0))):
                loop[uv_layer].uv = uv

    # End-grain caps (Mat_SleeperEnd = index 1)
    for ring, flip in ((rings[0], True), (rings[-1], False)):
        verts = tuple(reversed(ring)) if flip else tuple(ring)
        f = bm.faces.new(verts)
        f.material_index = 1
        f.smooth = False
        for loop in f.loops:
            p = loop.vert.co
            u = (p.x + base_w * 0.5) / base_w
            v = (p.z + base_h) / base_h
            loop[uv_layer].uv = (u, v)

    # Forged steel tie-plates + rail-clip shoulders + Prussian screw spikes (Mat_RailFastener = index 2)
    plate_h = 0.014
    for side in (-1, 1):
        rz = side * RAIL_HALF_GAUGE
        # Base tie plate resting on sleeper top (Y = 0..0.014)
        AddBox(bm, 0.0, plate_h * 0.5, rz, 0.210, plate_h, 0.240, 2, uv_layer, uv_scale=1.2)
        # Outer & inner raised rail-foot shoulders hugging the 126 mm Vignoles rail foot
        for face in (-1, 1):
            sh_z = rz + face * 0.088
            AddBox(bm, 0.0, plate_h + 0.008, sh_z, 0.205, 0.016, 0.044, 2, uv_layer, uv_scale=1.2)
            # Prussian screw spikes: 2 on outer side, 1 on inner side
            outside = (face == side)
            xs = (-0.056, 0.056) if outside else (0.0,)
            for sx in xs:
                sz = rz + face * 0.088
                # Washer flange + square/hex spike head
                AddPrismHex(bm, sx, plate_h + 0.014, plate_h + 0.023, sz, 0.021, 6, 2, uv_layer, uv_scale=2.0)
                AddBox(bm, sx, plate_h + 0.032, sz, 0.020, 0.018, 0.020, 2, uv_layer, uv_scale=2.0)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()

    for mat in mats:
        mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def BuildFishplateJoint(name, mats):
    """
    Build a 1938 Jinpu 4-bolt rail-joint fishplate pair centered on one rail web:
      - X: along rail ([-0.27, +0.27] = 540 mm splice bar)
      - Y: up (Y = 0 = rail foot bottom; fishplate sits at Y = 0.024..0.094 m)
      - Z: across rail (both sides of 20 mm web at Z = +-0.023 m)
    """
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    for side in (-1, 1):
        AddBox(bm, 0.0, 0.060, side * 0.022, 0.54, 0.068, 0.018, 2, uv_layer, uv_scale=1.5)
    for bx in (-0.185, -0.062, 0.062, 0.185):
        # Bolt head + nut protruding across both fishplates
        AddBox(bm, bx, 0.060, 0.0, 0.024, 0.024, 0.082, 2, uv_layer, uv_scale=2.0)
        for side in (-1, 1):
            AddBox(bm, bx, 0.060, side * 0.036, 0.032, 0.032, 0.016, 2, uv_layer, uv_scale=2.0)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for mat in mats:
        mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def Main():
    ResetScene()
    mat_wood = MakeMaterial("Mat_SleeperWood", (0.28, 0.22, 0.16), roughness=0.90, metallic=0.0)
    mat_end = MakeMaterial("Mat_SleeperEnd", (0.24, 0.19, 0.14), roughness=0.92, metallic=0.0)
    mat_iron = MakeMaterial("Mat_RailFastener", (0.22, 0.19, 0.17), roughness=0.68, metallic=0.72)
    mats = [mat_wood, mat_end, mat_iron]

    objs = [
        BuildSleeperVariant("Sleeper_0", 0, mats),
        BuildSleeperVariant("Sleeper_1", 1, mats),
        BuildSleeperVariant("Sleeper_2", 2, mats),
        BuildFishplateJoint("Fishplate_Joint", mats),
    ]

    # Save source .blend to OneDrive Blender root (per AGENTS.md)
    os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)

    # Export clean Y-up GLB (no embedded textures -> runtime binds existing PBR sets)
    os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUT_GLB,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="NONE",
    )

    total_tris = 0
    for obj in objs:
        mesh = obj.data
        mesh.calc_loop_triangles()
        tris = len(mesh.loop_triangles)
        total_tris += tris
        bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
        # Convert Blender Z-up back to glTF Y-up for readable verification
        gbb = [(v.x, v.z, -v.y) for v in bb]
        mins = [min(p[i] for p in gbb) for i in range(3)]
        maxs = [max(p[i] for p in gbb) for i in range(3)]
        print(f"PART {obj.name}: tris={tris} glTF_min={[round(v, 3) for v in mins]} glTF_max={[round(v, 3) for v in maxs]}")
    size_kb = os.path.getsize(OUT_GLB) / 1024.0
    print(f"OK exported {OUT_GLB} ({size_kb:.1f} KB, {total_tris} tris total); blend={OUT_BLEND}")


Main()
