"""Surgical anatomical dismemberment preparation for a test copy of JapaneseSoldierA.

Reads Model/Character/Model_JapaneseSoldierA.glb (read-only), performs 9 anatomical
bisect cuts with coincident zero-seam vertex splitting (preserving exact UV, smooth
normals, and 65-bone skin weights on intact mesh), isolates the Type 90 steel helmet
+ chinstrap + rivets as an independent pop-off region, measures exact cut-plane
elliptical metadata in bone-local space, saves an editable .blend to OneDrive, writes
intermediate raw mesh data for Script_PackJapaneseSoldierAGoreTest.mjs, and renders
Blender verification previews to scratch.
"""
import bpy
import bmesh
import json
import math
import os
import struct
from pathlib import Path
from mathutils import Vector, Matrix

REPO_ROOT = Path.cwd().resolve()
SOURCE_GLB = REPO_ROOT / "Taierzhuang1938/Model/Character/Model_JapaneseSoldierA.glb"
RAW_DIR = REPO_ROOT / "tmp/GoreTestBuild"
RAW_DIR.mkdir(parents=True, exist_ok=True)
_BENTL_BLENDER = Path(r"C:/Users/Bentl/OneDrive/AI/Models/Blender")
_BLENDER_BASE = _BENTL_BLENDER if _BENTL_BLENDER.exists() else (Path.home() / "OneDrive/AI/Models/Blender")
BLEND_DIR = _BLENDER_BASE / "Taierzhuang1938/GoreTest_20261125"
BLEND_DIR.mkdir(parents=True, exist_ok=True)
PREVIEW_DIR = Path(r"C:/Users/admin/.gemini/antigravity/brain/febba2f7-47d8-41c9-b72d-c7ab827d3230/scratch/blender_check")
PREVIEW_DIR.mkdir(parents=True, exist_ok=True)

# Region codes (aligned with Data_Tuning_Gore LIMBS order + 10=helmet)
REGION = {
    "torso": 0,
    "upperArmL": 1,
    "forearmL": 2,
    "upperArmR": 3,
    "forearmR": 4,
    "thighL": 5,
    "calfL": 6,
    "thighR": 7,
    "calfR": 8,
    "head": 9,
    "helmet": 10,
}

# Blender Z-up -> glTF Y-up conversion: (bx, by, bz) -> (bx, bz, -by)
def b2g(v):
    return (float(v.x), float(v.z), float(-v.y))

# Fresh scene on current window (Blender 5.2 glTF importer requires valid scene/view_layer)
old_sc = bpy.data.scenes.get("GoreTestSoldierA")
if old_sc:
    for o in list(old_sc.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.scenes.remove(old_sc)

sc = bpy.data.scenes.new("GoreTestSoldierA")
bpy.context.window.scene = sc

before = set(bpy.data.objects)
with bpy.context.temp_override(scene=sc, view_layer=sc.view_layers[0]):
    bpy.ops.import_scene.gltf(filepath=str(SOURCE_GLB))
imported = [o for o in bpy.data.objects if o not in before]

arm = next(o for o in imported if o.type == "ARMATURE")
# Ignore Blender glTF importer's helper bone-shape Icosphere; select the actual skinned character mesh!
obj = max(
    (o for o in imported if o.type == "MESH" and (o.parent == arm or any(m.type == "ARMATURE" for m in o.modifiers))),
    key=lambda o: len(o.data.vertices),
)
obj.name = "JapaneseSoldierA_GoreTest"
bpy.context.view_layer.update()

mw = obj.matrix_world.copy()
mw_inv = mw.inverted()
mw_rot = mw.to_3x3().normalized()

# Build bmesh in world space (meters, Z-up) for clean exact plane slicing, then transform back
bm = bmesh.new()
bm.from_mesh(obj.data)
bmesh.ops.transform(bm, matrix=mw, verts=bm.verts)
# Weld coincident UV-seam duplicates (bmesh preserves per-loop UVs while giving true topological shells
# and smooth normals across UV seams; physically distinct shells like helmet/head/hands/boots stay separate).
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
bm.verts.ensure_lookup_table()
bm.verts.index_update()
bm.faces.ensure_lookup_table()
bm.faces.index_update()
all_zs = [v.co.z for v in bm.verts]
print(f"Imported mesh world Z bounds: [{min(all_zs):.4f}, {max(all_zs):.4f}], verts={len(bm.verts)}, faces={len(bm.faces)}")

# Store original vertex normals (in world space) before slicing? We'll compute smooth normals cleanly
# First identify connected components on the uncut mesh so we know BodyShell, HeadShell, Hands, Feet, Helmet
comp_layer = bm.faces.layers.int.new("orig_comp")
v_visited = set()
components = []
for v in bm.verts:
    if v.index in v_visited:
        continue
    stack = [v]
    v_visited.add(v.index)
    verts_c = []
    while stack:
        cur = stack.pop()
        verts_c.append(cur)
        for e in cur.link_edges:
            ov = e.other_vert(cur)
            if ov.index not in v_visited:
                v_visited.add(ov.index)
                stack.append(ov)
    components.append(verts_c)

components.sort(key=len, reverse=True)
vert_comp = {}
comp_bounds = []
for ci, verts_c in enumerate(components):
    xs = [v.co.x for v in verts_c]
    ys = [v.co.y for v in verts_c]
    zs = [v.co.z for v in verts_c]
    b = (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))
    comp_bounds.append(b)
    for v in verts_c:
        vert_comp[v.index] = ci

for f in bm.faces:
    f[comp_layer] = vert_comp[f.verts[0].index]

# Classify original islands:
# - Comp 0: Uniform body shell (torso + sleeves + trousers/puttees)
# - Comp 1: Full sculpted Head + Neck (Z ~ 1.486..1.809, X ~ -0.09..0.09)
# - Hands: |X| > 0.60, Z ~ 1.32..1.46
# - Feet: Z_min < 0.05, Z_max < 0.25
# - Helmet / Chinstrap / Helmet rivets: separate islands with Z_min > 1.54 and |X| < 0.14 (not Comp 0, not Comp 1)
body_comp = 0
head_comp = None
hand_l_comps, hand_r_comps = set(), set()
foot_l_comps, foot_r_comps = set(), set()
helmet_comps = set()
torso_extra_comps = set()

for ci, (minx, maxx, miny, maxy, minz, maxz) in enumerate(comp_bounds):
    if len(components[ci]) >= 15:
        print(f"  Comp #{ci:2d}: verts={len(components[ci]):5d} X=[{minx:+.3f},{maxx:+.3f}] Y=[{miny:+.3f},{maxy:+.3f}] Z=[{minz:+.3f},{maxz:+.3f}]")
    cx = 0.5 * (minx + maxx)
    if ci == 0:
        continue
    if head_comp is None and minz > 1.40 and maxz > 1.74 and len(components[ci]) > 2000:
        head_comp = ci
    elif minx > 0.55 and minz > 1.25:
        hand_l_comps.add(ci)
    elif maxx < -0.55 and minz > 1.25:
        hand_r_comps.add(ci)
    elif minz < 0.05 and maxz < 0.30 and cx > 0.05:
        foot_l_comps.add(ci)
    elif minz < 0.05 and maxz < 0.30 and cx < -0.05:
        foot_r_comps.add(ci)
    elif minz > 1.53 and maxx < 0.16 and minx > -0.16:
        helmet_comps.add(ci)
    else:
        torso_extra_comps.add(ci)

print(f"Identified components: body={body_comp}, head={head_comp}, handL={hand_l_comps}, handR={hand_r_comps}, "
      f"footL={foot_l_comps}, footR={foot_r_comps}, helmet={helmet_comps}, torsoExtra={torso_extra_comps}")
assert head_comp is not None, "Failed to find head component"
assert len(helmet_comps) >= 1, "Failed to find helmet components"

# Measure exact collar top on body_comp to place the neck bisect plane cleanly above the collar & below chin
body_verts = components[body_comp]
collar_front_top = max(v.co.z for v in body_verts if abs(v.co.x) < 0.08 and v.co.y < 0.0)
collar_back_top = max(v.co.z for v in body_verts if abs(v.co.x) < 0.08 and v.co.y > 0.0)
print(f"Body collar top: front={collar_front_top:.4f}m, back={collar_back_top:.4f}m")

# Anatomical 9 cut planes (world space, Z-up meters).
# Each entry: (limb_id, target_comp_set, plane_co, plane_no, spatial_filter_fn)
# plane_no points FROM body TOWARD the severed distal limb!
# Note: in Blender world Z-up, +X = soldier's left, -X = soldier's right, -Y = soldier's front, +Y = back, +Z = up.
neck_z = max(1.576, collar_front_top + 0.012)
neck_no = Vector((0.0, -0.10, 1.0)).normalized()  # tilts slightly down toward front throat, clears back collar

CUT_SPECS = [
    ("head",      {head_comp}, Vector((0.0036, 0.010, neck_z)), neck_no,                     lambda p: True),
    ("upperArmL", {body_comp}, Vector(( 0.295, -0.035, 1.42)),  Vector(( 1.0, 0.0, 0.0)),    lambda p: p.x >  0.22 and p.z > 1.22),
    ("forearmL",  {body_comp}, Vector(( 0.495, -0.025, 1.41)),  Vector(( 1.0, 0.0, 0.0)),    lambda p: p.x >  0.42 and p.z > 1.22),
    ("upperArmR", {body_comp}, Vector((-0.295, -0.035, 1.42)),  Vector((-1.0, 0.0, 0.0)),    lambda p: p.x < -0.22 and p.z > 1.22),
    ("forearmR",  {body_comp}, Vector((-0.495, -0.025, 1.41)),  Vector((-1.0, 0.0, 0.0)),    lambda p: p.x < -0.42 and p.z > 1.22),
    ("thighL",    {body_comp}, Vector(( 0.130,  0.015, 0.605)), Vector(( 0.0, 0.0, -1.0)),   lambda p: p.x >  0.01 and p.z < 0.72),
    ("calfL",     {body_comp}, Vector(( 0.155,  0.025, 0.445)), Vector(( 0.0, 0.0, -1.0)),   lambda p: p.x >  0.01 and p.z < 0.54),
    ("thighR",    {body_comp}, Vector((-0.130,  0.015, 0.605)), Vector(( 0.0, 0.0, -1.0)),   lambda p: p.x < -0.01 and p.z < 0.72),
    ("calfR",     {body_comp}, Vector((-0.155,  0.025, 0.445)), Vector(( 0.0, 0.0, -1.0)),   lambda p: p.x < -0.01 and p.z < 0.54),
]

# Perform surgical bmesh.ops.bisect_plane on ONLY the matching faces/edges for each cut
for limb_id, comp_set, plane_co, plane_no, filt in CUT_SPECS:
    bm.faces.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.verts.ensure_lookup_table()
    target_faces = [
        f for f in bm.faces
        if f[comp_layer] in comp_set and filt(f.calc_center_median())
    ]
    target_edges = list({e for f in target_faces for e in f.edges})
    target_verts = list({v for f in target_faces for v in f.verts})
    geom = target_faces + target_edges + target_verts
    res = bmesh.ops.bisect_plane(
        bm,
        geom=geom,
        dist=1e-5,
        plane_co=plane_co,
        plane_no=plane_no,
        use_snap_center=False,
        clear_inner=False,
        clear_outer=False,
    )
    cut_edges = [g for g in res["geom_cut"] if isinstance(g, bmesh.types.BMEdge)]
    cut_verts = [g for g in res["geom_cut"] if isinstance(g, bmesh.types.BMVert)]
    print(f"Bisect {limb_id:10s}: cut_verts={len(cut_verts):3d}, cut_edges={len(cut_edges):3d}")
    assert len(cut_edges) >= 8, f"Bisect {limb_id} produced too few cut edges ({len(cut_edges)})"

# Triangulate any n-gons/quads introduced by bisect_plane while preserving interpolated UVs & deform weights!
bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3], quad_method='BEAUTY', ngon_method='BEAUTY')
bm.verts.ensure_lookup_table()
bm.verts.index_update()
bm.faces.ensure_lookup_table()
bm.faces.index_update()

# Assign every face to an exact Gore Region ID (0..10)
region_layer = bm.faces.layers.int.new("gore_region")
for f in bm.faces:
    ci = f[comp_layer]
    c = f.calc_center_median()
    if ci in helmet_comps:
        r = REGION["helmet"]
    elif ci in hand_l_comps:
        r = REGION["forearmL"]
    elif ci in hand_r_comps:
        r = REGION["forearmR"]
    elif ci in foot_l_comps:
        r = REGION["calfL"]
    elif ci in foot_r_comps:
        r = REGION["calfR"]
    elif ci == head_comp:
        d_neck = (c - Vector((0.0036, 0.010, neck_z))).dot(neck_no)
        r = REGION["head"] if d_neck >= 0.0 else REGION["torso"]
    elif ci == body_comp:
        if c.z > 1.22 and c.x >= 0.495:
            r = REGION["forearmL"]
        elif c.z > 1.22 and c.x >= 0.295:
            r = REGION["upperArmL"]
        elif c.z > 1.22 and c.x <= -0.495:
            r = REGION["forearmR"]
        elif c.z > 1.22 and c.x <= -0.295:
            r = REGION["upperArmR"]
        elif c.z <= 0.445 and c.x >= 0.0:
            r = REGION["calfL"]
        elif c.z <= 0.605 and c.x >= 0.0:
            r = REGION["thighL"]
        elif c.z <= 0.445 and c.x < 0.0:
            r = REGION["calfR"]
        elif c.z <= 0.605 and c.x < 0.0:
            r = REGION["thighR"]
        else:
            r = REGION["torso"]
    else:
        r = REGION["torso"]
    f[region_layer] = r

# Verify region face counts & measure exact cut-loop ellipses BEFORE splitting vertices!
# Compute smooth vertex normals on the welded bisected mesh FIRST so coincident split vertices keep IDENTICAL normals!
bm.normal_update()
pre_split_normals = {v.index: v.normal.copy() for v in bm.verts}

# Measure exact boundary rings between each (parent_region, child_region) pair
CUT_PAIRS = [
    ("head",      REGION["torso"],     REGION["head"],      "Neck",         "Head"),
    ("upperArmL", REGION["torso"],     REGION["upperArmL"], "LeftArm",      "LeftArm"),
    ("forearmL",  REGION["upperArmL"], REGION["forearmL"],  "LeftForeArm",  "LeftForeArm"),
    ("upperArmR", REGION["torso"],     REGION["upperArmR"], "RightArm",     "RightArm"),
    ("forearmR",  REGION["upperArmR"], REGION["forearmR"],  "RightForeArm", "RightForeArm"),
    ("thighL",    REGION["torso"],     REGION["thighL"],    "LeftUpLeg",    "LeftUpLeg"),
    ("calfL",     REGION["thighL"],    REGION["calfL"],     "LeftLeg",      "LeftLeg"),
    ("thighR",    REGION["torso"],     REGION["thighR"],    "RightUpLeg",   "RightUpLeg"),
    ("calfR",     REGION["thighR"],    REGION["calfR"],     "RightLeg",     "RightLeg"),
]
cut_spec_by_id = {s[0]: s for s in CUT_SPECS}

cut_meta = {}
boundary_edges = set()
for limb_id, reg_parent, reg_child, stump_bone, part_bone in CUT_PAIRS:
    ring_verts = set()
    ring_edges = []
    for e in bm.edges:
        regs = {f[region_layer] for f in e.link_faces}
        if reg_parent in regs and reg_child in regs:
            ring_edges.append(e)
            boundary_edges.add(e)
            ring_verts.add(e.verts[0])
            ring_verts.add(e.verts[1])
    assert len(ring_verts) >= 8, f"Boundary ring for {limb_id} has only {len(ring_verts)} verts!"
    pts = [v.co.copy() for v in ring_verts]
    centroid = sum(pts, Vector((0, 0, 0))) / len(pts)
    n_world = cut_spec_by_id[limb_id][3].normalized()

    # Build orthonormal frame (u_world, v_world, n_world) on the cut plane using 2D PCA of projected ring points
    ref = Vector((0, 1, 0)) if abs(n_world.y) < 0.85 else Vector((1, 0, 0))
    b1 = ref.cross(n_world).normalized()
    b2 = n_world.cross(b1).normalized()
    coords_2d = [((p - centroid).dot(b1), (p - centroid).dot(b2)) for p in pts]
    # 2x2 covariance for principal axis
    cxx = sum(x * x for x, y in coords_2d) / len(coords_2d)
    cyy = sum(y * y for x, y in coords_2d) / len(coords_2d)
    cxy = sum(x * y for x, y in coords_2d) / len(coords_2d)
    angle = 0.5 * math.atan2(2.0 * cxy, cxx - cyy)
    u_world = (b1 * math.cos(angle) + b2 * math.sin(angle)).normalized()
    v_world = n_world.cross(u_world).normalized()

    # Compute p95 half-axes (robust against any single protruding fold) + actual max
    us = sorted(abs((p - centroid).dot(u_world)) for p in pts)
    vs = sorted(abs((p - centroid).dot(v_world)) for p in pts)
    ru = us[min(len(us) - 1, int(len(us) * 0.92))]
    rv = vs[min(len(vs) - 1, int(len(vs) * 0.92))]
    ru_max = us[-1]
    rv_max = vs[-1]

    # Store in glTF Y-up world meters (the Node packer will transform directly into the EXACT XBot bone local space!)
    cut_meta[limb_id] = {
        "stumpBone": stump_bone,
        "partBone": part_bone,
        "ringVerts": len(ring_verts),
        "centerWorld": list(b2g(centroid)),
        "normalWorld": list(b2g(n_world)),
        "tangentUWorld": list(b2g(u_world)),
        "tangentVWorld": list(b2g(v_world)),
        "radiusU": round(float(ru), 5),
        "radiusV": round(float(rv), 5),
        "maxRadiusU": round(float(ru_max), 5),
        "maxRadiusV": round(float(rv_max), 5),
    }
    print(f"Ring {limb_id:10s}: verts={len(ring_verts):3d}, center_g={cut_meta[limb_id]['centerWorld']}, "
          f"rU={ru*100:.2f}cm (max {ru_max*100:.2f}), rV={rv*100:.2f}cm (max {rv_max*100:.2f})")

# Measure helmet world bounds & center (in glTF Y-up meters)
helmet_pts = [v.co.copy() for f in bm.faces if f[region_layer] == REGION["helmet"] for v in f.verts]
h_center = sum(helmet_pts, Vector((0, 0, 0))) / len(helmet_pts)
h_gpts = [b2g(p) for p in helmet_pts]
helmet_meta = {
    "bone": "Head",
    "centerWorld": list(b2g(h_center)),
    "minWorld": [min(p[i] for p in h_gpts) for i in range(3)],
    "maxWorld": [max(p[i] for p in h_gpts) for i in range(3)],
    "radius": round(float(max((p - h_center).length for p in helmet_pts)), 5),
}
print(f"Helmet bounds: center_g={helmet_meta['centerWorld']}, radius={helmet_meta['radius']*100:.2f}cm")

# Extract vertex attributes directly per triangle corner, splitting ONLY across (pos, uv, region)
# while preserving the exact pre-split smooth normals so intact mesh has ZERO shading seam!
uv_layer = bm.loops.layers.uv.active
deform_layer = bm.verts.layers.deform.active
vgroup_names = [g.name for g in obj.vertex_groups]

# Build compact indexed buffers (each vertex belongs to EXACTLY ONE gore_region -> 0 dropped triangles!)
vert_map = {}
out_pos = []
out_nrm = []
out_uv = []
out_jnt = []
out_wgt = []
out_reg = []
out_idx = []
reg_tri_counts = {k: 0 for k in REGION}
reg_id_to_name = {v: k for k, v in REGION.items()}

for f in bm.faces:
    reg = f[region_layer]
    reg_tri_counts[reg_id_to_name[reg]] += 1
    assert len(f.verts) == 3
    for loop in f.loops:
        v = loop.vert
        uv = loop[uv_layer].uv
        # Key includes (vert index, quantized uv, gore region) -> splits ONLY across UV seams or cut rings!
        key = (v.index, round(uv.x, 6), round(uv.y, 6), reg)
        idx = vert_map.get(key)
        if idx is None:
            idx = len(out_reg)
            vert_map[key] = idx
            p_g = b2g(v.co)
            n_g = b2g(pre_split_normals[v.index])
            nl = math.sqrt(n_g[0]*n_g[0] + n_g[1]*n_g[1] + n_g[2]*n_g[2]) or 1.0
            out_pos.extend(p_g)
            out_nrm.extend((n_g[0]/nl, n_g[1]/nl, n_g[2]/nl))
            # glTF UV v-flip (Blender UV V=0 bottom -> glTF V=0 top)
            out_uv.extend((float(uv.x), float(1.0 - uv.y)))

            # Top 4 bone weights, normalized
            dvert = v[deform_layer]
            pairs = sorted([(gi, w) for gi, w in dvert.items() if w > 1e-6], key=lambda kv: -kv[1])[:4]
            if not pairs:
                pairs = [(0, 1.0)]
            wsum = sum(w for _, w in pairs) or 1.0
            j4 = [0, 0, 0, 0]
            w4 = [0.0, 0.0, 0.0, 0.0]
            for k, (gi, w) in enumerate(pairs):
                j4[k] = gi
                w4[k] = float(w / wsum)
            out_jnt.extend(j4)
            out_wgt.extend(w4)
            out_reg.append(reg)
        out_idx.append(idx)

vcount = len(out_reg)
tcount = len(out_idx) // 3
print(f"Packed zero-seam mesh: verts={vcount}, tris={tcount}")
print("Region triangle counts:", reg_tri_counts)

# Write raw binary buffers for Script_PackJapaneseSoldierAGoreTest.mjs
raw_bin_path = RAW_DIR / "JapaneseSoldierAGoreTest_Raw.bin"
raw_json_path = RAW_DIR / "JapaneseSoldierAGoreTest_Raw.json"
with open(raw_bin_path, "wb") as bf:
    off_pos = bf.tell(); bf.write(struct.pack(f"<{len(out_pos)}f", *out_pos))
    off_nrm = bf.tell(); bf.write(struct.pack(f"<{len(out_nrm)}f", *out_nrm))
    off_uv  = bf.tell(); bf.write(struct.pack(f"<{len(out_uv)}f",  *out_uv))
    off_jnt = bf.tell(); bf.write(struct.pack(f"<{len(out_jnt)}H", *out_jnt))
    off_wgt = bf.tell(); bf.write(struct.pack(f"<{len(out_wgt)}f", *out_wgt))
    off_reg = bf.tell(); bf.write(bytes(out_reg))
    # Pad to 4 bytes before uint32 indices
    pad = (4 - (bf.tell() % 4)) % 4
    if pad: bf.write(b"\x00" * pad)
    off_idx = bf.tell(); bf.write(struct.pack(f"<{len(out_idx)}I", *out_idx))

with open(raw_json_path, "w", encoding="utf-8") as jf:
    json.dump({
        "vertexCount": vcount,
        "triangleCount": tcount,
        "vertexGroupNames": vgroup_names,
        "regions": REGION,
        "regionTriangles": reg_tri_counts,
        "cuts": cut_meta,
        "helmet": helmet_meta,
        "offsets": {
            "position": off_pos, "normal": off_nrm, "uv": off_uv,
            "joints": off_jnt, "weights": off_wgt, "region": off_reg, "indices": off_idx,
        },
    }, jf, indent=2)

# Write back bisected geometry to Blender object (transforming back to local space) & save editable .blend
bmesh.ops.transform(bm, matrix=mw_inv, verts=bm.verts)
bm.to_mesh(obj.data)
obj.data.update()

# Create an exploded visual audit copy side-by-side in a separate collection for the .blend + Blender preview render
audit_col = bpy.data.collections.new("GoreAuditPreview")
sc.collection.children.link(audit_col)

# Build exploded preview mesh separated by region with clear distinct material colors
region_colors = {
    0: (0.42, 0.45, 0.34, 1.0),  # torso khaki
    1: (0.85, 0.35, 0.25, 1.0),  # upperArmL
    2: (0.95, 0.60, 0.20, 1.0),  # forearmL
    3: (0.85, 0.25, 0.45, 1.0),  # upperArmR
    4: (0.95, 0.45, 0.65, 1.0),  # forearmR
    5: (0.25, 0.55, 0.85, 1.0),  # thighL
    6: (0.30, 0.80, 0.90, 1.0),  # calfL
    7: (0.35, 0.40, 0.85, 1.0),  # thighR
    8: (0.55, 0.70, 0.95, 1.0),  # calfR
    9: (0.92, 0.76, 0.62, 1.0),  # head skin
    10: (0.30, 0.34, 0.24, 1.0), # helmet olive steel
}
region_offsets = {
    0: Vector((0, 0, 0)),
    1: Vector((0.08, 0, 0)),
    2: Vector((0.18, 0, 0)),
    3: Vector((-0.08, 0, 0)),
    4: Vector((-0.18, 0, 0)),
    5: Vector((0.03, 0, -0.07)),
    6: Vector((0.05, 0, -0.15)),
    7: Vector((-0.03, 0, -0.07)),
    8: Vector((-0.05, 0, -0.15)),
    9: Vector((0, 0, 0.08)),
    10: Vector((0, 0, 0.22)),
}

# Build exploded mesh objects in audit_col positioned at X = +1.35m for side-by-side comparison
bm_world = bmesh.new()
bm_world.from_mesh(obj.data)
bmesh.ops.transform(bm_world, matrix=mw, verts=bm_world.verts)
bm_world.faces.ensure_lookup_table()
# Re-read region from our already computed out_idx/out_reg cleanly by building one mesh per region
for rname, rid in REGION.items():
    me = bpy.data.meshes.new(f"Audit_{rname}")
    r_verts = {}
    vs_list, fs_list = [], []
    for t in range(tcount):
        a, b, c = out_idx[t*3], out_idx[t*3+1], out_idx[t*3+2]
        if out_reg[a] != rid:
            continue
        tri = []
        for vi in (a, b, c):
            ni = r_verts.get(vi)
            if ni is None:
                ni = len(vs_list)
                r_verts[vi] = ni
                gx, gy, gz = out_pos[vi*3], out_pos[vi*3+1], out_pos[vi*3+2]
                # glTF -> Blender Z-up
                vs_list.append((gx, -gz, gy))
            tri.append(ni)
        fs_list.append(tuple(tri))
    me.from_pydata(vs_list, [], fs_list)
    me.update()
    ob = bpy.data.objects.new(f"Audit_{rname}", me)
    ob.location = Vector((1.25, 0.0, 0.0)) + region_offsets[rid]
    mat = bpy.data.materials.new(f"MatAudit_{rname}")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = region_colors[rid]
        bsdf.inputs["Roughness"].default_value = 0.55
    ob.data.materials.append(mat)
    audit_col.objects.link(ob)

bm_world.free()
bm.free()

# Render side-by-side verification image (original textured bisected mesh left, exploded regions right)
sc.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in [e.identifier for e in sc.render.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE_NEXT"
sc.render.resolution_x = 1280
sc.render.resolution_y = 720
sc.world = bpy.data.worlds.new("GoreAuditWorld")
sc.world.use_nodes = True
bg = sc.world.node_tree.nodes.get("Background")
if bg:
    bg.inputs[0].default_value = (0.14, 0.15, 0.14, 1.0)
    bg.inputs[1].default_value = 1.1

light_data = bpy.data.lights.new("KeyLight", type='SUN')
light_data.energy = 3.2
light_obj = bpy.data.objects.new("KeyLight", light_data)
light_obj.rotation_euler = (math.radians(48), math.radians(15), math.radians(-35))
sc.collection.objects.link(light_obj)

cam_data = bpy.data.cameras.new("AuditCam")
cam_data.lens = 50
cam_obj = bpy.data.objects.new("AuditCam", cam_data)
cam_obj.location = (0.62, -3.15, 1.05)
cam_obj.rotation_euler = (math.radians(88), 0.0, 0.0)
sc.collection.objects.link(cam_obj)
sc.camera = cam_obj

sc.render.filepath = str(PREVIEW_DIR / "01_ijaA_gore_cuts_exploded.png")
bpy.ops.render.render(write_still=True)

# Close-up on exploded head/helmet/neck + upperArm + thigh cuts
cam_obj.location = (1.25, -1.65, 1.62)
cam_obj.rotation_euler = (math.radians(88), 0.0, 0.0)
sc.render.filepath = str(PREVIEW_DIR / "02_ijaA_head_helmet_neck_closeup.png")
bpy.ops.render.render(write_still=True)

# Save editable .blend to OneDrive (hide audit preview collection by default in viewport)
blend_path = BLEND_DIR / "Scene_JapaneseSoldierAGoreTest.blend"
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
print("Saved editable .blend:", blend_path)
print("DONE Script_BuildJapaneseSoldierAGoreTest.py")
