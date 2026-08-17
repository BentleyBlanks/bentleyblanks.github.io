# -*- coding: utf-8 -*-
"""
《地道里的光》—— 视频 → 骨骼轨道（mocap 试验，2026-08-18）。

    PYTHONUTF8=1 python TunnelLight1943/Script_MocapTrack.py <video.mp4> --name mocap_ladderClimb \
        [--fps 12] [--face auto|+1|-1] [--out TunnelLight1943/_mocap] [--start 0] [--end 8]

流程：
  1. 逐帧过 RTMPose（rtmlib.Wholebody，COCO-WholeBody 133 点：17 身体 + 6 脚 + 42 手）；
  2. 侧视换算成 Script_Rig 的关节角（0° 指地、负＝朝前；躯干/头正＝前倾；脚 0° 指前；
     手相对前臂）——**规则跟 Rig 头注一字不差**；
  3. 时间上平滑（高斯 3 帧）、按 --fps 抽稀，输出一段可以直接贴进 `TRACKS` 的 JS 字面量
     （`<out>/<name>.track.mjs`）+ 逐帧骨架叠在视频上的对比图（`<out>/<name>_overlay_*.jpg`）
     + 关节角 CSV。

判读：手脚哪一侧是"前"（画在前面的那侧）——按左右两侧关键点的平均置信度挑高的那侧
（侧视里近相机那一侧看得清）。朝向 --face auto ＝ 鼻子在肩的哪一边。
胯高 hipY 是相对"站直"（BONE.hipY 0.62）的差，尺子用整段里最长的一条腿（大腿+小腿）当
0.62m；hipX 是胯相对两脚中点的前后。**轨道不带位移**：整段的位移交给 World（爬梯是 lift、
走路是 x），这里只留姿势。
"""
import argparse, json, math, os, sys
import numpy as np
import cv2

# COCO-WholeBody 索引
NOSE, LEYE, REYE, LEAR, REAR = 0, 1, 2, 3, 4
LSHO, RSHO, LELB, RELB, LWRI, RWRI = 5, 6, 7, 8, 9, 10
LHIP, RHIP, LKNE, RKNE, LANK, RANK = 11, 12, 13, 14, 15, 16
LBTOE, LSTOE, LHEEL, RBTOE, RSTOE, RHEEL = 17, 18, 19, 20, 21, 22
LHAND0, RHAND0 = 91, 112          # 手的 21 点：0 腕 … 9 中指根(MCP) 12 中指尖
BONE = dict(hipY=0.62, torso=0.52, upperArm=0.25, foreArm=0.24, thigh=0.31, shin=0.31, sole=0.09, chest=0.24)
DEG = 180 / math.pi


def ang_down(fx, fy):
    """四肢角：向量 (前为正 fx, 上为正 fy) → 0° 指地、负＝朝前、正＝朝后"""
    return math.atan2(-fx, -fy) * DEG


def ang_up(fx, fy):
    """躯干/头角：0° 竖直向上，正＝前倾"""
    return math.atan2(fx, fy) * DEG


def wrap(a):
    while a > 180: a -= 360
    while a <= -180: a += 360
    return a


def smooth(arr, k=3):
    if k <= 1 or len(arr) < k: return arr
    ker = np.exp(-0.5 * (np.arange(k) - (k - 1) / 2) ** 2 / ((k / 3) ** 2)); ker /= ker.sum()
    pad = k // 2
    out = np.copy(arr)
    for c in range(arr.shape[1]):
        col = np.pad(arr[:, c], (pad, pad), mode="edge")
        out[:, c] = np.convolve(col, ker, mode="valid")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--name", default="mocap")
    ap.add_argument("--fps", type=float, default=12)
    ap.add_argument("--face", default="auto")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "_mocap"))
    ap.add_argument("--start", type=float, default=0)
    ap.add_argument("--end", type=float, default=1e9)
    ap.add_argument("--overlay-every", type=int, default=12)
    ap.add_argument("--mode", default="balanced")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)

    from rtmlib import Wholebody, draw_skeleton
    model = Wholebody(mode=a.mode, backend="onnxruntime", device="cpu")

    cap = cv2.VideoCapture(a.video)
    vfps = cap.get(cv2.CAP_PROP_FPS) or 30
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    W, H = int(cap.get(3)), int(cap.get(4))
    print(f"video {W}x{H} @{vfps:.1f}fps {n} frames")
    frames = []   # (t, kps[133,2], scores[133])
    i = 0
    while True:
        ok, img = cap.read()
        if not ok: break
        t = i / vfps
        i += 1
        if t < a.start or t > a.end: continue
        kps, sc = model(img)
        if kps is None or len(kps) == 0:
            continue
        # 挑最大的那个人（框最高）
        best = max(range(len(kps)), key=lambda j: kps[j][:, 1].max() - kps[j][:, 1].min())
        frames.append((t, kps[best].copy(), sc[best].copy(), img if (len(frames) % a.overlay_every == 0) else None))
    print(f"pose ok on {len(frames)} frames")
    if not frames: sys.exit(1)

    K = np.stack([f[1] for f in frames])          # [N,133,2]
    S = np.stack([f[2] for f in frames])          # [N,133]
    T = np.array([f[0] for f in frames])
    # 时间平滑（像素域）
    Ks = K.copy()
    Ks[:, :, 0] = smooth(K[:, :, 0], 5)
    Ks[:, :, 1] = smooth(K[:, :, 1], 5)

    # 朝向：鼻子在两肩中点的哪一边（+1 朝图像右）
    if a.face == "auto":
        d = np.median(Ks[:, NOSE, 0] - (Ks[:, LSHO, 0] + Ks[:, RSHO, 0]) / 2)
        face = 1 if d >= 0 else -1
    else:
        face = int(a.face)
    # 前侧＝置信度高的那一侧
    lscore = S[:, [LSHO, LELB, LWRI, LHIP, LKNE, LANK]].mean()
    rscore = S[:, [RSHO, RELB, RWRI, RHIP, RKNE, RANK]].mean()
    frontLeft = lscore >= rscore
    print(f"face={'right' if face > 0 else 'left'}  front side={'LEFT' if frontLeft else 'RIGHT'} (score L {lscore:.2f} R {rscore:.2f})")
    F = dict(sho=LSHO, elb=LELB, wri=LWRI, hip=LHIP, kne=LKNE, ank=LANK, toe=LBTOE, heel=LHEEL, hand=LHAND0) if frontLeft \
        else dict(sho=RSHO, elb=RELB, wri=RWRI, hip=RHIP, kne=RKNE, ank=RANK, toe=RBTOE, heel=RHEEL, hand=RHAND0)
    B = dict(sho=RSHO, elb=RELB, wri=RWRI, hip=RHIP, kne=RKNE, ank=RANK, toe=RBTOE, heel=RHEEL, hand=RHAND0) if frontLeft \
        else dict(sho=LSHO, elb=LELB, wri=LWRI, hip=LHIP, kne=LKNE, ank=LANK, toe=LBTOE, heel=LHEEL, hand=LHAND0)

    def vec(p, q, f):
        dx = (q[0] - p[0]) * face          # 前为正
        dy = -(q[1] - p[1])                # 上为正
        return dx, dy

    # 尺子：最长的一条腿（像素）＝ thigh+shin
    legpx = 0
    for f in range(len(Ks)):
        for side in (F, B):
            legpx = max(legpx, np.linalg.norm(Ks[f, side["hip"]] - Ks[f, side["kne"]]) + np.linalg.norm(Ks[f, side["kne"]] - Ks[f, side["ank"]]))
    ppm = legpx / (BONE["thigh"] + BONE["shin"])
    print(f"scale {ppm:.1f} px/m (leg {legpx:.0f}px)")

    rows = []
    for f in range(len(Ks)):
        k = Ks[f]
        hipm = (k[LHIP] + k[RHIP]) / 2
        shom = (k[LSHO] + k[RSHO]) / 2
        earm = (k[LEAR] + k[REAR]) / 2
        r = {}
        tx, ty = vec(hipm, shom, f)
        r["torso"] = ang_up(tx, ty)
        r["chest"] = 0.0
        hx, hy = vec(shom, earm, f)
        r["head"] = wrap(ang_up(hx, hy) - r["torso"])
        r["neck"] = 0.0
        for tag, side in (("F", F), ("B", B)):
            thx, thy = vec(k[side["hip"]], k[side["kne"]], f)
            th = ang_down(thx, thy)
            sx, sy = vec(k[side["kne"]], k[side["ank"]], f)
            sh = wrap(ang_down(sx, sy) - th)
            fx, fy = vec(k[side["ank"]], k[side["toe"]], f)
            fw = ang_down(fx, fy)                    # 脚尖朝前＝ −90
            ft = wrap(fw + 90 - th - sh)
            r["thigh" + tag] = th; r["shin" + tag] = max(0.0, sh); r["foot" + tag] = ft
            ax, ay = vec(k[side["sho"]], k[side["elb"]], f)
            ar = ang_down(ax, ay)
            ex, ey = vec(k[side["elb"]], k[side["wri"]], f)
            fo = wrap(ang_down(ex, ey) - ar)
            r["arm" + tag] = ar; r["fore" + tag] = min(0.0, fo)
            hb = side["hand"]
            if S[f, hb + 9] > 0.3:
                mx, my = vec(k[hb], k[hb + 9], f)
                r["hand" + tag] = wrap(ang_down(mx, my) - ar - fo)
            else:
                r["hand" + tag] = -12.0
        # 胯高/前后：相对最低的那只脚（脚踝−鞋帮）
        anky = max(k[F["ank"]][1], k[B["ank"]][1])           # 图像 y 越大越低
        hipH = (anky - hipm[1]) / ppm + BONE["sole"]
        r["hipY"] = hipH - BONE["hipY"] - BONE["sole"]
        ankx = (k[F["ank"]][0] + k[B["ank"]][0]) / 2
        r["hipX"] = (hipm[0] - ankx) * face / ppm
        r["_t"] = T[f]
        rows.append(r)

    # 抽稀到 --fps
    step = max(1, int(round(vfps / a.fps)))
    keys = rows[::step]
    t0 = keys[0]["_t"]
    fields = ["hipY", "hipX", "torso", "chest", "head", "neck", "thighB", "shinB", "footB", "thighF", "shinF", "footF", "armB", "foreB", "handB", "armF", "foreF", "handF"]
    # 角度再夹一遍
    def clampf(k, v):
        if k in ("shinB", "shinF"): return max(0, min(150, v))
        if k in ("foreB", "foreF"): return max(-155, min(0, v))
        if k in ("handB", "handF"): return max(-75, min(75, v))
        return v
    lines = []
    for kk in keys:
        parts = [f"t: {kk['_t'] - t0:.2f}"]
        for fld in fields:
            v = clampf(fld, kk[fld])
            parts.append(f"{fld}: {v:.3f}" if fld in ("hipY", "hipX") else f"{fld}: {v:.0f}")
        lines.append("      { " + ", ".join(parts) + " },")
    dur = keys[-1]["_t"] - t0 + 1 / a.fps
    js = (f"  // —— 视频转骨骼（Script_MocapTrack.py，{os.path.basename(a.video)}，{a.fps:g}fps 抽稀）——\n"
          f"  {a.name}: {{\n    dur: {dur:.2f}, loop: false,\n    keys: [\n" + "\n".join(lines) + "\n    ],\n  }},\n")
    with open(os.path.join(a.out, a.name + ".track.mjs"), "w", encoding="utf-8") as fh:
        fh.write(js)
    with open(os.path.join(a.out, a.name + ".csv"), "w", encoding="utf-8") as fh:
        fh.write("t," + ",".join(fields) + "\n")
        for kk in rows:
            fh.write(f"{kk['_t']:.3f}," + ",".join(f"{kk[x]:.2f}" for x in fields) + "\n")
    # 叠图
    for idx, fr in enumerate(frames):
        if fr[3] is None: continue
        img = draw_skeleton(fr[3].copy(), fr[1][None], fr[2][None], kpt_thr=0.3)
        cv2.putText(img, f"t={fr[0]:.2f}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 255), 2)
        cv2.imwrite(os.path.join(a.out, f"{a.name}_overlay_{idx:04d}.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 82])
    print(f"wrote {a.out}/{a.name}.track.mjs ({len(keys)} keys, {dur:.2f}s), csv, overlays")


if __name__ == "__main__":
    main()
