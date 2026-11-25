"""Build sculpted PBR anatomical stump caps, torn cloth collars, and gib chunks in Blender.

Outputs:
  - Taierzhuang1938/Model/GoreTest/Model_GoreStumpCaps.glb (6 sculpted caps + 3 gib chunks,
    embedded 512x512 procedural PBR WebP Albedo + Normal + ORM textures)
  - Editable .blend at C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/GoreTest_20261125/Scene_GoreStumpCaps.blend
  - Verification render at scratch/blender_check/03_gore_stump_caps_showcase.png

Every cap is authored at UNIT RADIUS (1.0) along local +Y (glTF Y-up, Blender Z-up before export),
so runtime stretches (radiusU, avgR, radiusV) to fit each exact bisected elliptical cut ring.
"""
import bpy
import bmesh
import math
import os
import random
from pathlib import Path
from mathutils import Vector, Matrix, noise
import numpy as np

REPO_ROOT = Path.cwd().resolve()
OUT_DIR = REPO_ROOT / "Taierzhuang1938/Model/GoreTest"
OUT_DIR.mkdir(parents=True, exist_ok=True)
OUT_GLB = OUT_DIR / "Model_GoreStumpCaps.glb"
_BENTL_BLENDER = Path(r"C:/Users/Bentl/OneDrive/AI/Models/Blender")
_BLENDER_BASE = _BENTL_BLENDER if _BENTL_BLENDER.exists() else (Path.home() / "OneDrive/AI/Models/Blender")
BLEND_DIR = _BLENDER_BASE / "Taierzhuang1938/GoreTest_20261125"
BLEND_DIR.mkdir(parents=True, exist_ok=True)
PREVIEW_DIR = Path(r"C:/Users/admin/.gemini/antigravity/brain/febba2f7-47d8-41c9-b72d-c7ab827d3230/scratch/blender_check")
PREVIEW_DIR.mkdir(parents=True, exist_ok=True)

old_sc = bpy.data.scenes.get("GoreStumpCaps")
if old_sc:
    for o in list(old_sc.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.scenes.remove(old_sc)

sc = bpy.data.scenes.new("GoreStumpCaps")
bpy.context.window.scene = sc

# ---------------------------------------------------------------------------
# 1. Generate high-detail 512x512 PBR atlas textures (3 horizontal bands in UV V):
#    V in [0.00..0.44]: Wet striated dark-crimson muscle, tendon fibers, dark arterial clots
#    V in [0.44..0.72]: Blood-soaked torn IJA olive-khaki wool cloth (adjacent to flesh -> seamless fold!)
#    V in [0.72..1.00]: Fractured ivory-ochre bone shaft + porous reddish-brown marrow cavity
# ---------------------------------------------------------------------------
TEX_SIZE = 512

def make_pbr_atlas():
    rng = np.random.default_rng(19380317)
    u = np.linspace(0.0, 1.0, TEX_SIZE, endpoint=False, dtype=np.float32)
    v = np.linspace(0.0, 1.0, TEX_SIZE, endpoint=False, dtype=np.float32)
    U, V = np.meshgrid(u, v)

    # Multi-octave periodic value noise (tileable in U)
    def fbm(freq_u, freq_v, octaves=4, seed=1):
        r = np.random.default_rng(seed)
        acc = np.zeros_like(U)
        amp = 1.0
        norm = 0.0
        for oct_i in range(octaves):
            fu = int(freq_u * (2 ** oct_i))
            fv = int(freq_v * (2 ** oct_i))
            grid = r.random((fv, fu), dtype=np.float32)
            x = (U * fu) % fu
            y = (V * fv) % fv
            x0 = np.floor(x).astype(np.int32)
            y0 = np.floor(y).astype(np.int32)
            x1 = (x0 + 1) % fu
            y1 = (y0 + 1) % fv
            tx = x - x0; tx = tx * tx * (3.0 - 2.0 * tx)
            ty = y - y0; ty = ty * ty * (3.0 - 2.0 * ty)
            c00 = grid[y0, x0]; c10 = grid[y0, x1]
            c01 = grid[y1, x0]; c11 = grid[y1, x1]
            val = (c00 * (1 - tx) + c10 * tx) * (1 - ty) + (c01 * (1 - tx) + c11 * tx) * ty
            acc += val * amp
            norm += amp
            amp *= 0.52
        return acc / norm

    n_coarse = fbm(8, 8, 4, 11)
    n_med = fbm(20, 20, 4, 23)
    n_fine = fbm(56, 56, 3, 37)
    n_fiber = fbm(36, 10, 4, 53)
    # Fine diagonal wool twill weave (subtle organic fabric grain, zero chunky checkerboard!)
    twill = 0.5 + 0.5 * np.sin((U * 220.0 + V * 220.0 + n_med * 2.5) * np.pi)
    twill2 = 0.5 + 0.5 * np.sin((U * 220.0 - V * 180.0 + n_coarse * 2.0) * np.pi)
    weave = 0.5 * (0.6 * twill + 0.4 * twill2)

    albedo = np.zeros((TEX_SIZE, TEX_SIZE, 3), dtype=np.float32)
    height = np.zeros((TEX_SIZE, TEX_SIZE), dtype=np.float32)
    ao = np.ones((TEX_SIZE, TEX_SIZE), dtype=np.float32)
    rough = np.full((TEX_SIZE, TEX_SIZE), 0.5, dtype=np.float32)

    # Band 1: Wet striated muscle & torn flesh (V < 0.44)
    m_flesh = V < 0.44
    bundle = np.sin(U * 2.0 * np.pi * 14.0 + n_coarse * 8.0) * 0.5 + 0.5
    fascia = np.clip((n_fiber - 0.70) * 4.2, 0.0, 1.0)
    clot = np.clip((0.40 - n_med) * 3.8, 0.0, 1.0)
    f_r = 0.30 + 0.18 * bundle + 0.18 * fascia - 0.20 * clot + 0.06 * (n_fine - 0.5)
    f_g = 0.032 + 0.024 * bundle + 0.12 * fascia - 0.025 * clot + 0.015 * (n_fine - 0.5)
    f_b = 0.028 + 0.018 * bundle + 0.10 * fascia - 0.022 * clot + 0.015 * (n_fine - 0.5)
    albedo[m_flesh, 0] = np.clip(f_r[m_flesh], 0.035, 0.75)
    albedo[m_flesh, 1] = np.clip(f_g[m_flesh], 0.008, 0.35)
    albedo[m_flesh, 2] = np.clip(f_b[m_flesh], 0.008, 0.30)
    height[m_flesh] = (0.45 * bundle + 0.35 * n_med + 0.20 * n_fine - 0.35 * clot)[m_flesh]
    ao[m_flesh] = np.clip(0.55 + 0.45 * height[m_flesh] - 0.35 * clot[m_flesh], 0.22, 1.0)
    rough[m_flesh] = np.clip(0.15 + 0.14 * fascia[m_flesh] + 0.08 * n_fine[m_flesh] - 0.05 * clot[m_flesh], 0.12, 0.36)

    # Band 2: Blood-soaked torn IJA olive-khaki wool cloth collar (0.44 <= V < 0.72)
    # Placed right next to flesh so cloth->flesh folds interpolate through dark arterial crimson!
    m_cloth = (V >= 0.44) & (V < 0.72)
    cloth_v = np.clip((V - 0.44) / 0.28, 0.0, 1.0)
    # cloth_v=0 is the torn blood-drenched lip; cloth_v=1 hugs the intact IJA khaki wool sleeve
    soak = np.clip((0.68 - cloth_v + (n_coarse - 0.5) * 0.45) * 2.5, 0.0, 1.0)
    khaki = np.array([0.36, 0.31, 0.19], dtype=np.float32)   # matches Model_JapaneseSoldierA wool
    soaked = np.array([0.14, 0.022, 0.018], dtype=np.float32) # deep wet arterial soak on wool
    c_mod = 0.88 + 0.12 * weave + 0.16 * (n_med - 0.5) + 0.08 * (n_fine - 0.5)
    for ch in range(3):
        base_c = khaki[ch] * (1.0 - soak) + soaked[ch] * soak
        albedo[m_cloth, ch] = np.clip((base_c * c_mod)[m_cloth], 0.018, 0.62)
    height[m_cloth] = (0.18 * weave + 0.48 * n_coarse + 0.34 * n_med)[m_cloth]
    ao[m_cloth] = np.clip(0.62 + 0.28 * n_med[m_cloth] - 0.16 * soak[m_cloth], 0.30, 1.0)
    rough[m_cloth] = np.clip(0.90 - 0.48 * soak[m_cloth] + 0.06 * n_fine[m_cloth], 0.34, 0.96)

    # Band 3: Fractured bone + bloody marrow rim (V >= 0.72)
    m_bone = V >= 0.72
    bone_v = np.clip((V - 0.72) / 0.28, 0.0, 1.0)
    blood_wick = np.clip((0.35 - bone_v + (n_coarse - 0.5) * 0.30) * 3.4, 0.0, 1.0)
    b_r = 0.72 - 0.09 * n_med - 0.44 * blood_wick + 0.05 * n_fine
    b_g = 0.64 - 0.10 * n_med - 0.56 * blood_wick + 0.04 * n_fine
    b_b = 0.49 - 0.10 * n_med - 0.44 * blood_wick + 0.03 * n_fine
    albedo[m_bone, 0] = np.clip(b_r[m_bone], 0.08, 0.84)
    albedo[m_bone, 1] = np.clip(b_g[m_bone], 0.02, 0.76)
    albedo[m_bone, 2] = np.clip(b_b[m_bone], 0.02, 0.64)
    height[m_bone] = (0.55 + 0.22 * n_fiber + 0.18 * n_fine - 0.15 * n_coarse)[m_bone]
    ao[m_bone] = np.clip(0.70 + 0.28 * n_med[m_bone] - 0.22 * blood_wick[m_bone], 0.32, 1.0)
    rough[m_bone] = np.clip(0.56 - 0.36 * blood_wick[m_bone] + 0.12 * n_fine[m_bone], 0.18, 0.76)

    # Compute tangent-space normal map from height (Sobel-like periodic gradient)
    strength = 4.2
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * strength
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * strength
    nz = np.ones_like(height)
    nlen = np.sqrt(dx * dx + dy * dy + nz * nz)
    nx = (-dx / nlen) * 0.5 + 0.5
    ny = ( dy / nlen) * 0.5 + 0.5  # OpenGL normal green=+Y
    nz = ( nz / nlen) * 0.5 + 0.5
    normal = np.stack([nx, ny, nz], axis=-1)

    # ORM: R=AO, G=Roughness, B=Metalness(0)
    orm = np.stack([ao, rough, np.zeros_like(ao)], axis=-1)

    def to_blender_img(name, rgb, colorspace):
        img = bpy.data.images.new(name, width=TEX_SIZE, height=TEX_SIZE, alpha=False)
        img.colorspace_settings.name = colorspace
        rgba = np.ones((TEX_SIZE, TEX_SIZE, 4), dtype=np.float32)
        rgba[:, :, :3] = rgb
        img.pixels.foreach_set(rgba.ravel())
        img.pack()
        return img

    img_albedo = to_blender_img("Tex_GoreStump_Base", albedo, "sRGB")
    img_normal = to_blender_img("Tex_GoreStump_Normal", normal, "Non-Color")
    img_orm = to_blender_img("Tex_GoreStump_ORM", orm, "Non-Color")

    mat = bpy.data.materials.new("Mat_GoreStumpPBR")
    mat.use_nodes = True
    mat.use_backface_culling = False
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Metallic"].default_value = 0.0
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.65
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tex_c = nt.nodes.new("ShaderNodeTexImage"); tex_c.image = img_albedo
    nt.links.new(tex_c.outputs["Color"], bsdf.inputs["Base Color"])

    tex_n = nt.nodes.new("ShaderNodeTexImage"); tex_n.image = img_normal
    nmap = nt.nodes.new("ShaderNodeNormalMap"); nmap.inputs["Strength"].default_value = 1.25
    nt.links.new(tex_n.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

    tex_orm = nt.nodes.new("ShaderNodeTexImage"); tex_orm.image = img_orm
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(tex_orm.outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    # Hook AO into glTF occlusion via Mix or glTF Settings node
    mix_ao = nt.nodes.new("ShaderNodeMix")
    mix_ao.data_type = 'RGBA'; mix_ao.blend_type = 'MULTIPLY'; mix_ao.inputs["Factor"].default_value = 0.45
    nt.links.new(tex_c.outputs["Color"], mix_ao.inputs["A"])
    nt.links.new(sep.outputs["Red"], mix_ao.inputs["B"])
    nt.links.new(mix_ao.outputs["Result"], bsdf.inputs["Base Color"])
    return mat

mat_stump = make_pbr_atlas()

# ---------------------------------------------------------------------------
# 2. Procedural sculpting helpers (Blender Z-up -> glTF exporter converts +Z to +Y!)
# ---------------------------------------------------------------------------
def add_organic_flesh_basin(bm, uv_layer, segs=20, rings=5, radius=1.0, depth=0.14, rim_height=0.05, seed=1.0):
    """Recessed organic muscular stump cross-section facing +Z (becomes +Y in glTF)."""
    ring_verts = []
    for ri in range(rings):
        t = (ri + 1) / rings  # 0.2 .. 1.0
        r = radius * t
        ring = []
        for si in range(segs):
            ang = (si / segs) * math.tau
            ca, sa = math.cos(ang), math.sin(ang)
            n1 = noise.noise(Vector((ca * 2.2 + seed, sa * 2.2, t * 2.0)))
            n2 = noise.noise(Vector((ca * 5.0, sa * 5.0 + seed, t * 3.5)))
            rr = r * (1.0 + (0.06 * n1 + 0.03 * n2) * (0.4 + 0.6 * t))
            # Dish slightly inward in middle, rise slightly at ragged outer flesh rim
            z = -depth * (1.0 - t * t) + rim_height * (t ** 2.5) + 0.055 * n1 + 0.025 * n2
            v = bm.verts.new((ca * rr, sa * rr, z))
            ring.append(v)
        ring_verts.append(ring)

    center = bm.verts.new((0.0, 0.0, -depth * 1.05))
    # Center fan
    for si in range(segs):
        sn = (si + 1) % segs
        f = bm.faces.new((center, ring_verts[0][si], ring_verts[0][sn]))
        f.smooth = True
        u0 = si / segs; u1 = (si + 1) / segs
        f.loops[0][uv_layer].uv = (0.5 * (u0 + u1), 0.02)
        f.loops[1][uv_layer].uv = (u0, 0.10)
        f.loops[2][uv_layer].uv = (u1, 0.10)
    # Concentric rings
    for ri in range(rings - 1):
        v_lo = 0.10 + 0.36 * (ri / (rings - 1))
        v_hi = 0.10 + 0.36 * ((ri + 1) / (rings - 1))
        for si in range(segs):
            sn = (si + 1) % segs
            f = bm.faces.new((ring_verts[ri][si], ring_verts[ri+1][si], ring_verts[ri+1][sn], ring_verts[ri][sn]))
            f.smooth = True
            u0 = si / segs; u1 = (si + 1) / segs
            f.loops[0][uv_layer].uv = (u0, v_lo)
            f.loops[1][uv_layer].uv = (u0, v_hi)
            f.loops[2][uv_layer].uv = (u1, v_hi)
            f.loops[3][uv_layer].uv = (u1, v_lo)
    return ring_verts[-1]

def add_fractured_bone(bm, uv_layer, offset_xy=(0.0, 0.0), radius=0.28, length=0.46, segs=12, seed=2.0, hollow=True):
    """Splintered protruding bone shaft with jagged fracture tip & optional red marrow hollow."""
    ox, oy = offset_xy
    rows = 4
    grid = []
    for ri in range(rows):
        t = ri / (rows - 1)
        row = []
        for si in range(segs):
            ang = (si / segs) * math.tau
            ca, sa = math.cos(ang), math.sin(ang)
            n = noise.noise(Vector((ca * 2.5 + seed, sa * 2.5, t * 2.0)))
            # Jagged oblique splinter at tip (t=1)
            splinter = (0.28 * math.sin(ang * 2.0 + seed) + 0.18 * math.cos(ang * 3.0 - seed) + 0.14 * n) * (t ** 1.6)
            r = radius * (1.0 - 0.14 * t + 0.08 * n)
            z = -0.10 + (length + splinter * length) * t
            row.append(bm.verts.new((ox + ca * r, oy + sa * r, z)))
        grid.append(row)

    for ri in range(rows - 1):
        v0 = 0.74 + 0.24 * (ri / (rows - 1))
        v1 = 0.74 + 0.24 * ((ri + 1) / (rows - 1))
        for si in range(segs):
            sn = (si + 1) % segs
            f = bm.faces.new((grid[ri][si], grid[ri][sn], grid[ri+1][sn], grid[ri+1][si]))
            f.smooth = True
            u0 = si / segs; u1 = (si + 1) / segs
            f.loops[0][uv_layer].uv = (u0, v0)
            f.loops[1][uv_layer].uv = (u1, v0)
            f.loops[2][uv_layer].uv = (u1, v1)
            f.loops[3][uv_layer].uv = (u0, v1)

    # Top bevel into recessed dark marrow core
    top = grid[-1]
    inner = []
    for si, tv in enumerate(top):
        ang = (si / segs) * math.tau
        in_r = 0.52 if hollow else 0.20
        iv = bm.verts.new((ox + (tv.co.x - ox) * in_r, oy + (tv.co.y - oy) * in_r, tv.co.z - (0.09 if hollow else -0.02)))
        inner.append(iv)
    for si in range(segs):
        sn = (si + 1) % segs
        f = bm.faces.new((top[si], top[sn], inner[sn], inner[si]))
        f.smooth = True
        u0 = si / segs; u1 = (si + 1) / segs
        f.loops[0][uv_layer].uv = (u0, 0.96)
        f.loops[1][uv_layer].uv = (u1, 0.96)
        f.loops[2][uv_layer].uv = (u1, 0.76)
        f.loops[3][uv_layer].uv = (u0, 0.76)

    marrow_center = bm.verts.new((ox, oy, sum(v.co.z for v in inner) / len(inner) - 0.06))
    for si in range(segs):
        sn = (si + 1) % segs
        f = bm.faces.new((marrow_center, inner[si], inner[sn]))
        f.smooth = True
        # Map marrow center to dark crimson flesh band!
        f.loops[0][uv_layer].uv = (0.5, 0.12)
        f.loops[1][uv_layer].uv = (si / segs, 0.20)
        f.loops[2][uv_layer].uv = ((si + 1) / segs, 0.20)

def add_torn_collar(bm, uv_layer, segs=22, r_inner=0.96, r_outer=1.08, skirt_down=0.42, lip_up=0.14, seed=5.0, cloth=True):
    """Blood-soaked torn cloth (or ragged skin) cuff wrapping outside the cut seam to seal any micro-gap."""
    # Band 2 (cloth) is V=[0.44..0.72], directly adjacent to Band 1 (flesh V=[0.00..0.44]) -> ZERO bone bleed!
    v_band = (0.45, 0.70) if cloth else (0.14, 0.40)
    rows_spec = [
        (-skirt_down, r_outer * 1.01, v_band[1]),   # hugs intact sleeve/trouser behind cut
        (-skirt_down * 0.35, r_outer * 1.04, 0.5 * (v_band[0] + v_band[1])),
        (lip_up, r_outer * 1.02, v_band[0] + 0.01), # jagged torn blood-soaked outer lip
        (lip_up * 0.25, r_inner * 0.96, 0.32),      # folds cleanly inward into dark wet tissue!
    ]
    grid = []
    for ri, (z_base, r_base, uv_v) in enumerate(rows_spec):
        row = []
        for si in range(segs):
            ang = (si / segs) * math.tau
            ca, sa = math.cos(ang), math.sin(ang)
            n1 = noise.noise(Vector((ca * 3.1 + seed, sa * 3.1, ri * 1.7)))
            n2 = noise.noise(Vector((ca * 7.0, sa * 7.0 + seed, ri * 1.1)))
            jag = (0.12 * n1 + 0.07 * n2) if ri == 2 else (0.04 * n1)
            rr = r_base * (1.0 + 0.05 * n1 + (0.04 * n2 if ri == 2 else 0.0))
            zz = z_base + jag
            row.append(bm.verts.new((ca * rr, sa * rr, zz)))
        grid.append((row, uv_v))

    for ri in range(len(grid) - 1):
        row_a, va = grid[ri]
        row_b, vb = grid[ri + 1]
        for si in range(segs):
            sn = (si + 1) % segs
            f = bm.faces.new((row_a[si], row_a[sn], row_b[sn], row_b[si]))
            f.smooth = True
            u0 = si / segs; u1 = (si + 1) / segs
            f.loops[0][uv_layer].uv = (u0, va)
            f.loops[1][uv_layer].uv = (u1, va)
            f.loops[2][uv_layer].uv = (u1, vb)
            f.loops[3][uv_layer].uv = (u0, vb)

def add_trachea_ring(bm, uv_layer, offset_xy=(0.0, -0.34), radius=0.18, height=0.16, segs=12):
    """Cartilage windpipe ring for anatomical neck cross-section."""
    ox, oy = offset_xy
    bot = [bm.verts.new((ox + math.cos(i/segs*math.tau)*radius, oy + math.sin(i/segs*math.tau)*radius, -0.08)) for i in range(segs)]
    top = [bm.verts.new((ox + math.cos(i/segs*math.tau)*radius*0.95, oy + math.sin(i/segs*math.tau)*radius*0.95, height)) for i in range(segs)]
    inn = [bm.verts.new((ox + math.cos(i/segs*math.tau)*radius*0.62, oy + math.sin(i/segs*math.tau)*radius*0.62, height - 0.14)) for i in range(segs)]
    for i in range(segs):
        j = (i + 1) % segs
        f1 = bm.faces.new((bot[i], bot[j], top[j], top[i])); f1.smooth = True
        for l, uv in zip(f1.loops, [(i/segs, 0.78), (j/segs, 0.78), (j/segs, 0.92), (i/segs, 0.92)]): l[uv_layer].uv = uv
        f2 = bm.faces.new((top[i], top[j], inn[j], inn[i])); f2.smooth = True
        for l, uv in zip(f2.loops, [(i/segs, 0.26), (j/segs, 0.26), (j/segs, 0.08), (i/segs, 0.08)]): l[uv_layer].uv = uv

def build_mesh_obj(name, builder_fn):
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    builder_fn(bm, uv_layer)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.normal_update()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(mat_stump)
    sc.collection.objects.link(ob)
    return ob

# --- Build 6 specialized anatomical stump caps ---
def make_neck(bm, uv):
    add_organic_flesh_basin(bm, uv, segs=22, rings=5, radius=1.0, depth=0.14, rim_height=0.06, seed=1.3)
    # Cervical vertebra (posterior) + trachea windpipe (anterior, -Y is front in Blender)
    add_fractured_bone(bm, uv, offset_xy=(0.0, 0.24), radius=0.25, length=0.34, segs=12, seed=2.1, hollow=True)
    add_trachea_ring(bm, uv, offset_xy=(0.0, -0.34), radius=0.19, height=0.15, segs=12)
    add_torn_collar(bm, uv, segs=22, r_inner=0.95, r_outer=1.05, skirt_down=0.26, lip_up=0.12, seed=4.1, cloth=False)

def make_arm(bm, uv):
    add_organic_flesh_basin(bm, uv, segs=20, rings=5, radius=1.0, depth=0.16, rim_height=0.05, seed=3.7)
    add_fractured_bone(bm, uv, offset_xy=(0.02, 0.02), radius=0.27, length=0.52, segs=12, seed=4.5, hollow=True)
    add_torn_collar(bm, uv, segs=22, r_inner=0.94, r_outer=1.08, skirt_down=0.45, lip_up=0.16, seed=6.2, cloth=True)

def make_forearm(bm, uv):
    add_organic_flesh_basin(bm, uv, segs=20, rings=5, radius=1.0, depth=0.14, rim_height=0.05, seed=5.1)
    # Dual radius & ulna bones!
    add_fractured_bone(bm, uv, offset_xy=(-0.22, 0.04), radius=0.17, length=0.48, segs=10, seed=6.1, hollow=True)
    add_fractured_bone(bm, uv, offset_xy=( 0.22,-0.04), radius=0.16, length=0.38, segs=10, seed=7.3, hollow=True)
    add_torn_collar(bm, uv, segs=20, r_inner=0.94, r_outer=1.08, skirt_down=0.42, lip_up=0.15, seed=8.1, cloth=True)

def make_thigh(bm, uv):
    add_organic_flesh_basin(bm, uv, segs=24, rings=5, radius=1.0, depth=0.18, rim_height=0.06, seed=7.9)
    # Heavy fractured femur
    add_fractured_bone(bm, uv, offset_xy=(0.04, -0.03), radius=0.29, length=0.56, segs=14, seed=9.1, hollow=True)
    add_torn_collar(bm, uv, segs=24, r_inner=0.94, r_outer=1.08, skirt_down=0.48, lip_up=0.18, seed=10.4, cloth=True)

def make_calf(bm, uv):
    add_organic_flesh_basin(bm, uv, segs=20, rings=5, radius=1.0, depth=0.15, rim_height=0.05, seed=11.2)
    # Tibia (thick anterior) + fibula (thin lateral)
    add_fractured_bone(bm, uv, offset_xy=(0.0, -0.14), radius=0.23, length=0.50, segs=12, seed=12.4, hollow=True)
    add_fractured_bone(bm, uv, offset_xy=(0.28, 0.10), radius=0.13, length=0.36, segs=10, seed=13.1, hollow=False)
    add_torn_collar(bm, uv, segs=22, r_inner=0.94, r_outer=1.07, skirt_down=0.42, lip_up=0.14, seed=14.0, cloth=True)

def make_head_burst(bm, uv):
    """Mangled shattered cranium/upper-neck crater for HMG / explosive headshots."""
    add_organic_flesh_basin(bm, uv, segs=24, rings=6, radius=1.05, depth=0.24, rim_height=0.20, seed=15.5)
    # Splintered cervical spine + jagged jaw/occipital skull shards rising around the rim
    add_fractured_bone(bm, uv, offset_xy=(0.0, 0.16), radius=0.25, length=0.46, segs=12, seed=16.2, hollow=True)
    add_fractured_bone(bm, uv, offset_xy=(-0.48, 0.25), radius=0.18, length=0.62, segs=8, seed=17.8, hollow=False)
    add_fractured_bone(bm, uv, offset_xy=( 0.45, 0.30), radius=0.16, length=0.54, segs=8, seed=18.4, hollow=False)
    add_trachea_ring(bm, uv, offset_xy=(0.0, -0.32), radius=0.20, height=0.22, segs=12)
    add_torn_collar(bm, uv, segs=24, r_inner=0.95, r_outer=1.12, skirt_down=0.32, lip_up=0.28, seed=19.3, cloth=False)

def make_gib_chunk(bm, uv, seed=20.0, bone_mix=False):
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.055)
    for v in bm.verts:
        p = v.co
        n = noise.noise(p * 18.0 + Vector((seed, seed * 0.7, seed * 1.3)))
        v.co = Vector((p.x * (1.25 + 0.45 * n), p.y * (0.85 + 0.4 * n), p.z * (0.65 + 0.35 * n)))
    for f in bm.faces:
        f.smooth = True
        use_bone = bone_mix and (f.calc_center_median().z > 0.022 and f.calc_center_median().x > -0.01)
        for l in f.loops:
            p = l.vert.co
            u = 0.5 + math.atan2(p.y, p.x) / math.tau
            v = (0.76 + 0.18 * (p.z / 0.06 + 0.5)) if use_bone else (0.10 + 0.28 * (p.z / 0.06 + 0.5))
            l[uv].uv = (u, max(0.02, min(0.98, v)))

def make_cloth_shred(bm, uv, seed=30.0):
    cols, rows = 5, 3
    grid = []
    for r in range(rows):
        row = []
        for c in range(cols):
            u = c / (cols - 1); v = r / (rows - 1)
            x = (u - 0.5) * 0.14
            y = (v - 0.5) * 0.065 * (0.7 + 0.6 * math.sin(u * math.pi))
            n = noise.noise(Vector((x * 22 + seed, y * 22, seed)))
            row.append(bm.verts.new((x, y, 0.016 * n)))
        grid.append(row)
    for r in range(rows - 1):
        for c in range(cols - 1):
            f = bm.faces.new((grid[r][c], grid[r][c+1], grid[r+1][c+1], grid[r+1][c]))
            f.smooth = True
            for l, (uu, vv) in zip(f.loops, [
                (c/(cols-1), 0.46 + 0.23*r/(rows-1)),
                ((c+1)/(cols-1), 0.46 + 0.23*r/(rows-1)),
                ((c+1)/(cols-1), 0.46 + 0.23*(r+1)/(rows-1)),
                (c/(cols-1), 0.46 + 0.23*(r+1)/(rows-1)),
            ]):
                l[uv].uv = (uu, vv)

caps = [
    build_mesh_obj("Stump_Neck", make_neck),
    build_mesh_obj("Stump_Arm", make_arm),
    build_mesh_obj("Stump_Forearm", make_forearm),
    build_mesh_obj("Stump_Thigh", make_thigh),
    build_mesh_obj("Stump_Calf", make_calf),
    build_mesh_obj("Stump_HeadBurst", make_head_burst),
    build_mesh_obj("Gib_ChunkA", lambda bm, uv: make_gib_chunk(bm, uv, 21.0, False)),
    build_mesh_obj("Gib_ChunkB", lambda bm, uv: make_gib_chunk(bm, uv, 25.4, True)),
    build_mesh_obj("Gib_ClothShred", lambda bm, uv: make_cloth_shred(bm, uv, 31.7)),
]

for ob in caps:
    print(f"Built {ob.name:16s}: verts={len(ob.data.vertices):4d}, tris={len(ob.data.polygons):4d}")

# Export GLB with all objects centered at origin (so runtime clones each by name with zero offset)
with bpy.context.temp_override(scene=sc, view_layer=sc.view_layers[0]):
    bpy.ops.export_scene.gltf(
        filepath=str(OUT_GLB),
        export_format="GLB",
        export_image_format="WEBP",
        export_image_quality=90,
        export_normals=True,
        export_texcoords=True,
        export_materials="EXPORT",
        use_selection=False,
        use_active_scene=True,
    )
print(f"Exported {OUT_GLB} ({OUT_GLB.stat().st_size} bytes)")

# Spread out cleanly (radius=1.0 -> spacing=2.4) for visual showcase render + editable .blend inspection
positions = [
    (-6.0, 0, 0), (-3.6, 0, 0), (-1.2, 0, 0), (1.2, 0, 0), (3.6, 0, 0), (6.0, 0, 0),
    (-2.2, -2.5, 0.25), (0.0, -2.5, 0.25), (2.2, -2.5, 0.25),
]
for ob, pos in zip(caps, positions):
    ob.location = Vector(pos)
    if ob.name.startswith("Gib_"):
        ob.scale = (8.0, 8.0, 8.0)

sc.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in [e.identifier for e in sc.render.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE_NEXT"
sc.render.resolution_x = 1280
sc.render.resolution_y = 720
sc.world = bpy.data.worlds.new("CapWorld")
sc.world.use_nodes = True
bg = sc.world.node_tree.nodes.get("Background")
if bg:
    bg.inputs[0].default_value = (0.16, 0.16, 0.15, 1.0)
    bg.inputs[1].default_value = 1.3

sun = bpy.data.lights.new("CapSun", type='SUN')
sun.energy = 3.8
sun_obj = bpy.data.objects.new("CapSun", sun)
sun_obj.rotation_euler = (math.radians(40), math.radians(20), math.radians(-28))
sc.collection.objects.link(sun_obj)

rim = bpy.data.lights.new("CapRim", type='SUN')
rim.energy = 1.6
rim_obj = bpy.data.objects.new("CapRim", rim)
rim_obj.rotation_euler = (math.radians(55), math.radians(-20), math.radians(145))
sc.collection.objects.link(rim_obj)

cam = bpy.data.cameras.new("CapCam")
cam.lens = 45
cam_obj = bpy.data.objects.new("CapCam", cam)
cam_obj.location = (0.0, -10.5, 6.2)
cam_obj.rotation_euler = (math.radians(58), 0.0, 0.0)
sc.collection.objects.link(cam_obj)
sc.camera = cam_obj

sc.render.filepath = str(PREVIEW_DIR / "03_gore_stump_caps_showcase.png")
bpy.ops.render.render(write_still=True)

blend_path = BLEND_DIR / "Scene_GoreStumpCaps.blend"
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
print("Saved editable .blend:", blend_path)
print("DONE Script_BuildGoreStumpAssets.py")
