"""接管机枪握姿：在 Blender 里量双手陷进枪体多深、逐指拟合屈曲角、出近景图。

输入是 `Script_MountedGripExport.mjs` 从实机导出的取证包（枪局部坐标，three.js Y 上）。
参数取全局字典 MOUNTED_GRIP（BlenderMCP 的 exec 拿不到客户端环境变量），其次取同名大写环境变量
（后台 `blender -b --python` 时用）：
  package  取证包路径（默认 <worktree>/Taierzhuang1938/_shots/MountedGrip/Data_MountedGripPackage.json）
  project  源工程目录（默认 ~/OneDrive/AI/Models/Blender/Taierzhuang1938/Zb26MountedGrip_20260927）
  mode     measure（建场景、量穿插、出图）| fit（再加逐指拟合、出拟合后图、写结果）
  tag      图名前缀（默认 Before / After）
BlenderMCP 用法（从 worktree 根）：
  node scripts/Script_BlenderMcp.mjs exec --code "MOUNTED_GRIP={'mode':'fit','package':r'<包>'}; exec(open(r'Taierzhuang1938/_blender/Script_MountedGripFit.py',encoding='utf-8').read())"

拟合与运行时同一套正向运动学（Script_FpsAnatomy.ApplyAnatomicalFingers）：
  bone.quaternion = rest * axisAngle(axis, curlDeg)（第 0 节另左乘外展），
所以屈曲角加 d 度就是 q' = q * axisAngle(axis, d)，新 `fingers[指][节]` = 旧值 + d。
皮肤按每根骨头的增量 W'W⁻¹ 线性混合跟着走。穿插判据是「最近面法线在内侧」且
「三条斜射线奇偶多数在内」两条同时成立 —— 枪模不是封闭网格（弹匣、枪机是拆开的件），
只看其中一条都会误报。拇指根节由 thumbDirection 驱动，只拟合第 1、2 节；扳机指不动。
结果写 <工程>/Data_<武器>MountedFingerFit.json，由人抄进 Data_FpsArmPoses 的架设姿势。
"""
import bpy, bmesh, json, math, os, re
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree

_CFG = globals().get("MOUNTED_GRIP") or {}
def Setting(key, fallback=None):
    return _CFG.get(key) or os.environ.get("MOUNTED_GRIP_" + key.upper()) or fallback
PROJECT_ROOT = Path(__file__).resolve().parents[1] if "__file__" in globals() else Path.cwd() / "Taierzhuang1938"
PKG = Setting("package", str(PROJECT_ROOT / "_shots/MountedGrip/Data_MountedGripPackage.json"))
ROOT = Setting("project", str(Path.home() / "OneDrive/AI/Models/Blender/Taierzhuang1938/Zb26MountedGrip_20260927"))
MODE = Setting("mode", "measure")
TAG = Setting("tag", "After" if MODE == "fit" else "Before")
PEN_OK, GAP_OK = 0.0010, 0.0020        # 允许陷入 1 mm；指腹离枪面不超过 2 mm
KEEP = {("r", 1)}                      # 扳机指归 FpsHandContactTest 的扳机接触管
os.makedirs(ROOT + "/Preview", exist_ok=True)
pkg = json.load(open(PKG, encoding="utf-8"))
scene = bpy.context.scene
scene["task"] = Path(ROOT).name


def B(v):
    return Vector((v[0], -v[2], v[1]))          # three（Y 上）→ Blender（Z 上）


def M4(a):
    return Matrix([[a[0], a[4], a[8], a[12]], [a[1], a[5], a[9], a[13]], [a[2], a[6], a[10], a[14]], [a[3], a[7], a[11], a[15]]])


# ---- 量尺：枪面 BVH（three 坐标）与内外判据 ----------------------------------
gv, gf = [], []
for t in pkg["gun"]:
    b = len(gv)
    gv += [Vector(t[0:3]), Vector(t[3:6]), Vector(t[6:9])]
    gf.append((b, b + 1, b + 2))
bvh = BVHTree.FromPolygons(gv, gf, epsilon=0.0)
RAYS = [Vector((0.577, 0.577, 0.577)), Vector((-0.6, 0.3, 0.74)).normalized(), Vector((0.2, -0.9, 0.39)).normalized()]


def Parity(co, d):
    n, o = 0, co.copy()
    for _ in range(64):
        loc, nrm, fi, dist = bvh.ray_cast(o, d, 2.0)
        if loc is None:
            break
        n += 1
        o = loc + d * 1e-5
    return n % 2


def Signed(co):
    """离枪面的距离；陷进枪体时为负。"""
    loc, nrm, fi, dist = bvh.find_nearest(co)
    if loc is None:
        return 1.0
    if dist < 0.025 and (co - loc).dot(nrm) < 0 and sum(Parity(co, d) for d in RAYS) >= 2:
        return -dist
    return dist


def Penetration(skin_positions):
    worst = {}
    for s, positions in skin_positions:
        for i, co in enumerate(positions):
            sd = Signed(co)
            if sd < -0.0005:
                j = max(range(4), key=lambda k: s["wts"][i * 4 + k])
                bone = s["bones"][s["infl"][i * 4 + j]]
                worst[bone] = max(worst.get(bone, 0), -sd)
    return {k: round(v * 1000, 2) for k, v in sorted(worst.items(), key=lambda kv: -kv[1])}


# ---- 手指骨链与正向运动学 ------------------------------------------------------
chain = {}
for side in ("r", "l"):
    for name, c in pkg["chain"][side].items():
        m = re.search(r"finger(\d)(\d)?$", name, re.I)
        if not m:
            continue
        chain[name] = {"side": side, "digit": int(m.group(1)), "seg": int(m.group(2) or 0),
                       "W": M4(c["world"]), "P": M4(c["parentWorld"]), "q": Quaternion((c["local"][3], *c["local"][:3])),
                       "axis": Vector(c["axis"]), "pos": Vector(c["position"]), "scale": Vector(c["scale"])}


def Bones(side, digit):
    return sorted((n for n, c in chain.items() if c["side"] == side and c["digit"] == digit), key=lambda n: chain[n]["seg"])


def FK(side, digit, deltas):
    """每根骨头的增量 W'W⁻¹（枪局部）。deltas 是三节屈曲角的增量（度）。"""
    out, parent = {}, None
    for n in Bones(side, digit):
        c = chain[n]
        q = c["q"] @ Quaternion(c["axis"], math.radians(deltas[c["seg"]]))
        W = (c["P"] if parent is None else parent) @ Matrix.LocRotScale(c["pos"], q, c["scale"])
        out[n] = W @ c["W"].inverted()
        parent = W
    return out


fk_error = max(abs(a - b) for n, c in chain.items()
               for a, b in zip(sum((list(r) for r in (FK(c["side"], c["digit"], [0, 0, 0])[n] @ c["W"])), []),
                               sum((list(r) for r in c["W"]), [])))


def Deform(s, deltas_by_bone):
    positions = []
    n = len(s["pos"]) // 3
    for i in range(n):
        v = Vector(s["pos"][i * 3:i * 3 + 3])
        infl = [(s["bones"][s["infl"][i * 4 + k]], s["wts"][i * 4 + k]) for k in range(4) if s["wts"][i * 4 + k] > 0]
        if any(b in deltas_by_bone for b, w in infl):
            acc, ws = Vector(), 0.0
            for b, w in infl:
                acc += (deltas_by_bone[b] @ v if b in deltas_by_bone else v) * w
                ws += w
            v = acc / ws
        positions.append(v)
    return positions


# ---- 拟合 ----------------------------------------------------------------------
result = {"right": [list(f) for f in pkg["contacts"]["right"]["fingers"]],
          "left": [list(f) for f in pkg["contacts"]["left"]["fingers"]]}
fit_report, deltas_by_bone = {}, {}
if MODE == "fit":
    verts = {}
    for s in pkg["skin"]:
        for i in range(len(s["pos"]) // 3):
            infl = [(s["bones"][s["infl"][i * 4 + k]], s["wts"][i * 4 + k]) for k in range(4) if s["wts"][i * 4 + k] > 0.02]
            owner = next((chain[b] for b, w in infl if b in chain), None)
            if owner:
                verts.setdefault((owner["side"], owner["digit"]), []).append((Vector(s["pos"][i * 3:i * 3 + 3]), infl))
    pads = {(k[0], int(k[1])): (p["bone"], Vector(p["point"])) for k, p in pkg["pads"].items()}

    def Evaluate(side, digit, deltas, stride=3):
        D = FK(side, digit, deltas)
        pen = 0.0
        for v, infl in verts.get((side, digit), [])[::stride]:
            acc, ws = Vector(), 0.0
            for b, w in infl:
                acc += (D[b] @ v if b in D else v) * w
                ws += w
            pen = max(pen, -min(0.0, Signed(acc / ws)))
        bone, point = pads[(side, digit)]
        return pen, Signed(D[bone] @ chain[bone]["W"] @ point)

    def Cost(pen, gap, d):
        return 400 * max(0, pen - PEN_OK) + 150 * max(0, gap - GAP_OK) + 0.004 * sum(abs(x) for x in d)

    for side in ("r", "l"):
        for digit in range(5):
            if (side, digit) in KEEP:
                continue
            segs = [1, 2] if digit == 0 else [0, 1, 2]
            d = [0.0, 0.0, 0.0]
            before = Evaluate(side, digit, d, 1)
            best = Cost(*before, d)
            for step in (6.0, 3.0, 1.5, 0.75):
                improved = True
                while improved:
                    improved = False
                    for s_ in segs:
                        for sign in (-1, 1):
                            trial = list(d)
                            trial[s_] = max(-35, min(20, trial[s_] + sign * step))
                            c = Cost(*Evaluate(side, digit, trial), trial)
                            if c < best - 1e-6:
                                best, d, improved = c, trial, True
            after = Evaluate(side, digit, d, 1)
            fit_report[f"{side}{digit}"] = {"beforeMm": [round(x * 1000, 2) for x in before],
                                            "afterMm": [round(x * 1000, 2) for x in after], "delta": d}
            key = "right" if side == "r" else "left"
            result[key][digit] = [round(result[key][digit][k] + (d[k] if k in segs else 0), 2) for k in range(3)]
            deltas_by_bone.update(FK(side, digit, d))

# ---- 场景与出图 ----------------------------------------------------------------
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)


def Material(name, rgb, rough=0.6, metal=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    return mat


gun_mat, skin_mat, hit_mat = Material("Mat_GunSteel", (0.16, 0.17, 0.19), 0.45, 0.3), Material("Mat_HandSkin", (0.62, 0.42, 0.33), 0.55), Material("Mat_Penetration", (1.0, 0.05, 0.02), 0.4)
mesh = bpy.data.meshes.new("MountedGun")
mesh.from_pydata([B(v) for v in gv], [], gf)
bm = bmesh.new(); bm.from_mesh(mesh); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6); bm.to_mesh(mesh); bm.free()
gun = bpy.data.objects.new("Model_" + pkg["weapon"] + "Mounted", mesh)
scene.collection.objects.link(gun)
gun.data.materials.append(gun_mat)
skin_positions = []
for s in pkg["skin"]:
    positions = Deform(s, deltas_by_bone)
    skin_positions.append((s, positions))
    n = len(positions)
    idx = s["idx"] or list(range(n))
    hm = bpy.data.meshes.new("Hands_" + (s["name"] or "Arms"))
    hm.from_pydata([B(v) for v in positions], [], [(idx[i], idx[i + 1], idx[i + 2]) for i in range(0, len(idx), 3)])
    ho = bpy.data.objects.new("Model_" + (s["name"] or "Arms"), hm)
    scene.collection.objects.link(ho)
    ho.data.materials.append(skin_mat)
    ho.data.materials.append(hit_mat)
    inside = [Signed(v) < -0.0008 for v in positions]
    for poly in hm.polygons:
        poly.material_index = 1 if sum(inside[v] for v in poly.vertices) >= 2 else 0
penetration = Penetration(skin_positions)

for rot, energy in (((40, 20, 30), 4.0), ((-130, 10, -150), 1.6)):
    bpy.ops.object.light_add(type="SUN")
    bpy.context.object.data.energy = energy
    bpy.context.object.rotation_euler = tuple(math.radians(v) for v in rot)
scene.world = scene.world or bpy.data.worlds.new("World")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.6
engines = bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items.keys()
scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
scene.render.resolution_x, scene.render.resolution_y = 1200, 900


def Shot(name, eye, target, lens=50):
    cam = bpy.data.objects.new("Cam_" + name, bpy.data.cameras.new("Cam_" + name))
    scene.collection.objects.link(cam)
    cam.data.lens, cam.data.clip_start = lens, 0.005
    cam.location = eye
    cam.rotation_euler = (target - eye).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scene.render.filepath = f"{ROOT}/Preview/{TAG}_{name}.png"
    bpy.ops.render.render(write_still=True)


grip, fore = B((0.0, -0.06, -0.10)), B((0.0, -0.02, -0.36))
Shot("PlayerEye", B((-0.085, 0.180, 0.380)), B((0, 0.0, -0.9)), 32)
Shot("RightOutSide", grip + Vector((0.22, 0.0, 0.0)), grip)
Shot("RightInSide", grip + Vector((-0.22, 0.03, 0.0)), grip)
Shot("RightBelow", grip + Vector((0.0, -0.05, -0.24)), grip)
Shot("LeftOutSide", fore + Vector((-0.24, 0.02, 0.02)), fore)
Shot("LeftInSide", fore + Vector((0.24, 0.02, 0.02)), fore)
bpy.ops.wm.save_as_mainfile(filepath=f"{ROOT}/Animation_{pkg['weapon']}MountedGrip.blend")
summary = {"mode": MODE, "armPose": pkg["armPose"], "fkErrorM": fk_error, "penetrationMm": penetration}
if MODE == "fit":
    summary.update({"fingers": result, "fit": fit_report})
    json.dump(summary, open(f"{ROOT}/Data_{pkg['weapon']}MountedFingerFit.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print(json.dumps(summary, ensure_ascii=False))
