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


def parse_anchor(spec):
    """"hipY=-0.36,torso=26,thighF=-44" → {字段: 数}。度/米都按 Rig 姿势里的写法"""
    out = {}
    for kv in (spec or "").split(","):
        kv = kv.strip()
        if not kv:
            continue
        k, _, v = kv.partition("=")
        out[k.strip()] = float(v)
    return out


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
    ap.add_argument("--cycle", default="", help="auto：从两脚踝前后差的振荡里找步态周期，截一个周期做循环轨（走/跑用）；manual：用 --period/--start 指定")
    ap.add_argument("--period", type=int, default=0, help="cycle=manual 时的周期（源视频帧数）")
    ap.add_argument("--start-frame", type=int, default=0, help="cycle=manual 时的起始帧")
    ap.add_argument("--mirror-half", action="store_true", help="给的是半个周期（一步）：把它前后侧互换再接一遍，拼成整周期（走/跑左右对称）")
    ap.add_argument("--time-scale", type=float, default=1.0, help="时间轴缩放（生成视频常是慢动作：0.25 就是提速四倍）")
    ap.add_argument("--anchor-start", default="", help='起落转换用：把开头拽到某个静态姿势上，"hipY=-0.36,torso=26,thighF=-44,..."（度/米，同 Rig 的姿势值）')
    ap.add_argument("--anchor-end", default="", help="同上，拽末尾。轨道接在姿势前/后播，两端不落在姿势上收尾会跳一下")
    ap.add_argument("--anchor-frac", type=float, default=0.3, help="两端各用多长比例过渡到锚点（默认三成）")
    ap.add_argument("--flatten", default="", help="这些字段整段不要 mocap，直接从起锚滑到末锚：侧视里被身子挡住的远侧肢（深弯腰时的远侧胳膊/手）估出来是错的，不是抖")
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
    Ks = K.copy()          # 先按原始点配左右（见下），配完再平滑——先平滑会把认反那几帧的两条腿平均成一条

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
    L = dict(sho=LSHO, elb=LELB, wri=LWRI, hip=LHIP, kne=LKNE, ank=LANK, toe=LBTOE, heel=LHEEL, hand=LHAND0, ear=LEAR, eye=LEYE)
    Rr = dict(sho=RSHO, elb=RELB, wri=RWRI, hip=RHIP, kne=RKNE, ank=RANK, toe=RBTOE, heel=RHEEL, hand=RHAND0, ear=REAR, eye=REYE)
    F, B = (L, Rr) if frontLeft else (Rr, L)
    # 侧视里两条腿/两条胳膊交叉那一刻，估计器常把左右**认反**（跑步尤甚），于是同一条腿
    # 一帧在前一帧在后，角度来回跳、步态周期看着是真周期的一半。这里不信它的左右标签，
    # 按**连续性**重新配对：每帧比较"保持 / 交换"两种配法哪种离上一帧的膝踝（肘腕）更近，
    # 腿和胳膊各自配；配好之后把点**重排**进固定槽位（前侧一律放进 Rr 的下标、后侧放进 L
    # 的下标），再做时间平滑。之后 F/B 就是固定的两张下标表
    LEG, ARM = ("hip", "kne", "ank", "toe", "heel"), ("sho", "elb", "wri", "hand")
    Ko = K.copy(); So = S.copy()
    prev = {"leg": None, "arm": None}
    for f in range(len(K)):
        for grp, keysN in (("leg", LEG), ("arm", ARM)):
            keep = swap = 0.0
            if prev[grp] is not None:
                pf, pb = prev[grp]
                for kk in keysN[1:3]:
                    keep += np.linalg.norm(K[f, F[kk]] - pf[kk]) + np.linalg.norm(K[f, B[kk]] - pb[kk])
                    swap += np.linalg.norm(K[f, B[kk]] - pf[kk]) + np.linalg.norm(K[f, F[kk]] - pb[kk])
            srcF, srcB = (F, B) if swap >= keep else (B, F)
            for kk in keysN:
                if kk == "hand":
                    for d in range(21):
                        Ko[f, Rr[kk] + d] = K[f, srcF[kk] + d]; So[f, Rr[kk] + d] = S[f, srcF[kk] + d]
                        Ko[f, L[kk] + d] = K[f, srcB[kk] + d]; So[f, L[kk] + d] = S[f, srcB[kk] + d]
                else:
                    Ko[f, Rr[kk]] = K[f, srcF[kk]]; So[f, Rr[kk]] = S[f, srcF[kk]]
                    Ko[f, L[kk]] = K[f, srcB[kk]]; So[f, L[kk]] = S[f, srcB[kk]]
            prev[grp] = ({kk: K[f, srcF[kk]] for kk in keysN}, {kk: K[f, srcB[kk]] for kk in keysN})
    F, B = Rr, L
    K, S = Ko, So
    Ks = K.copy()
    Ks[:, :, 0] = smooth(K[:, :, 0], 5)
    Ks[:, :, 1] = smooth(K[:, :, 1], 5)
    sideF = [F] * len(K); sideB = [B] * len(K)

    def vec(p, q, f):
        dx = (q[0] - p[0]) * face          # 前为正
        dy = -(q[1] - p[1])                # 上为正
        return dx, dy

    # 尺子：最长的一条腿（像素）＝ thigh+shin
    legpx = 0
    for f in range(len(Ks)):
        for side in (sideF[f], sideB[f]):
            legpx = max(legpx, np.linalg.norm(Ks[f, side["hip"]] - Ks[f, side["kne"]]) + np.linalg.norm(Ks[f, side["kne"]] - Ks[f, side["ank"]]))
    ppm = legpx / (BONE["thigh"] + BONE["shin"])
    print(f"scale {ppm:.1f} px/m (leg {legpx:.0f}px)")

    rows = []
    for f in range(len(Ks)):
        k = Ks[f]
        F, B = sideF[f], sideB[f]
        hipm = (k[LHIP] + k[RHIP]) / 2
        shom = (k[LSHO] + k[RSHO]) / 2
        r = {}
        tx, ty = vec(hipm, shom, f)
        r["torso"] = ang_up(tx, ty)
        r["chest"] = 0.0
        # 头的朝向用**耳→眼**这条轴（脸朝哪儿），不用肩→耳（耳朵在极端仰头时飘）：
        # 平视＝水平朝前＝0，仰头为负、低头为正（Rig 的 head 正＝往下点），再减去躯干
        ear = k[F["ear"]] if S[f, F["ear"]] > 0.3 else k[B["ear"]]
        eye = k[F["eye"]] if S[f, F["eye"]] > 0.3 else k[B["eye"]]
        ex_, ey_ = vec(ear, eye, f)
        tilt = math.atan2(ey_, max(1e-6, abs(ex_))) * DEG        # 眼在耳之上＝仰
        r["head"] = wrap(-tilt - r["torso"])
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

    # 循环步态：拿"前踝 − 后踝"的前后差当相位信号，自相关找周期，从一次过零（两脚并拢、
    # 前脚正往前迈）截一个整周期出来做 loop 轨。抽稀之后再截，关键帧数＝周期×fps
    loop = False
    if a.cycle == "manual":
        period, start = a.period, a.start_frame
        allrows = rows
        rows = rows[start:start + period + 1]
        loop = True
        print(f"cycle(manual): period {period} frames = {period / vfps:.2f}s, start frame {start}")
    elif a.cycle == "auto":
        sig = np.array([(Ks[f, sideF[f]["ank"]][0] - Ks[f, sideB[f]["ank"]][0]) * face for f in range(len(Ks))])
        sig = sig - sig.mean()
        # 自相关取**第一个真正的峰**（比左右邻居都高），不取全局最大：从最小滞后起自相关
        # 本来就在往下掉，全局最大常常落在搜索窗口的第一格上（跑步那段就是这么把 0.33s
        # 当成周期的——那只是站立相的长度）
        ac = {}
        for lag in range(int(vfps * 0.3), int(vfps * 2.2)):
            if lag >= len(sig) - 2: break
            ac[lag] = np.dot(sig[:-lag], sig[lag:]) / (np.linalg.norm(sig[:-lag]) * np.linalg.norm(sig[lag:]) + 1e-9)
        lags = sorted(ac)
        peaks = [l for l in lags[1:-1] if ac[l] > ac[l - 1] and ac[l] >= ac[l + 1] and ac[l] > 0.3]
        best = max(peaks, key=lambda l: ac[l]) if peaks else max(lags, key=lambda l: ac[l])
        bestv = ac[best]
        period = best
        # 起点：信号从负变正的过零（前脚从后往前迈过另一只脚），挑离中段最近的一个
        zc = [i for i in range(1, len(sig) - period) if sig[i - 1] < 0 <= sig[i]]
        start = min(zc, key=lambda i: abs(i - len(sig) // 3)) if zc else 0
        allrows = rows
        rows = rows[start:start + period + 1]
        loop = True
        print(f"cycle: period {period} frames = {period / vfps:.2f}s (r={bestv:.2f}), start frame {start}")
    # 半个周期镜像成整周期：第二步＝第一步把 F/B 互换（走/跑左右对称）。时间接在末尾
    if loop and a.mirror_half:
        SW = [("thighF", "thighB"), ("shinF", "shinB"), ("footF", "footB"), ("armF", "armB"), ("foreF", "foreB"), ("handF", "handB")]
        half = rows
        span = half[-1]["_t"] - half[0]["_t"]
        second = []
        for r in half[1:]:
            q = dict(r)
            for x, y in SW: q[x], q[y] = r[y], r[x]
            q["_t"] = r["_t"] + span
            second.append(q)
        rows = half + second
    if a.time_scale != 1.0:
        t00 = rows[0]["_t"]
        for r in rows: r["_t"] = t00 + (r["_t"] - t00) * a.time_scale
        vfps_eff = vfps / a.time_scale
    else:
        vfps_eff = vfps
    # 抽稀到 --fps
    step = max(1, int(round(vfps_eff / a.fps)))
    keys = rows[::step]
    if loop and (len(rows) - 1) % step:            # 循环轨末帧要落在周期末尾上
        keys = keys + [rows[-1]]
    t0 = keys[0]["_t"]
    # ── 两端拽到静态姿势上（起落转换）──────────────────────────────────────────
    # 这类轨道是**接在姿势前后**播的（站→跪那一段播完，人就停在 kneel 上），末帧
    # 不落在那个姿势上，轨道一收就"啪"地跳一下。真人的曲线只在中段值钱，两端本来
    # 就该被目标姿势收走，所以按比例平滑地拽过去（smoothstep，不是线性）。
    def anchor(rows_, vals, at_end, frac):
        if not vals:
            return
        n = len(rows_)
        span = max(2, int(round(n * max(0.05, min(0.9, frac)))))
        for i in range(n):
            j = (i - (n - span)) if at_end else (span - 1 - i)
            if j < 0:
                continue
            u = min(1.0, j / (span - 1))
            w = u * u * (3 - 2 * u)
            for f, v in vals.items():
                if f in rows_[i]:
                    rows_[i][f] = rows_[i][f] * (1 - w) + v * w
    A0, A1 = parse_anchor(a.anchor_start), parse_anchor(a.anchor_end)
    anchor(keys, A0, False, a.anchor_frac)
    anchor(keys, A1, True, a.anchor_frac)
    # 整段抹平的字段：深弯腰时远侧胳膊整条藏在身子后头，估计器给的不是噪声而是错值
    # （量出来一帧 1000°/s 以上的跳）。这类通道 mocap 供不出东西，直接两锚之间滑过去
    for fld in [x.strip() for x in (a.flatten or "").split(",") if x.strip()]:
        if fld not in A0 or fld not in A1:
            print(f"flatten: {fld} 两端都得有锚点，跳过")
            continue
        n = len(keys)
        for i, kk in enumerate(keys):
            u = i / max(1, n - 1)
            w = u * u * (3 - 2 * u)
            kk[fld] = A0[fld] * (1 - w) + A1[fld] * w
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
    dur = (keys[-1]["_t"] - t0) if loop else (keys[-1]["_t"] - t0 + 1 / a.fps)
    cyc = "，截一个步态周期循环" if loop else ""
    js = (f"  // —— 视频转骨骼（Script_MocapTrack.py，{os.path.basename(a.video)}，{a.fps:g}fps 抽稀{cyc}）——\n"
          f"  {a.name}: {{\n    dur: {dur:.2f}, loop: {'true' if loop else 'false'},\n    keys: [\n" + "\n".join(lines) + "\n    ],\n  },\n")
    with open(os.path.join(a.out, a.name + ".track.mjs"), "w", encoding="utf-8") as fh:
        fh.write(js)
    with open(os.path.join(a.out, a.name + ".csv"), "w", encoding="utf-8") as fh:
        fh.write("t," + ",".join(fields) + "\n")
        for kk in (allrows if loop else rows):
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
