# -*- coding: utf-8 -*-
"""AI 视频 → 3D 关键点轨迹（视频转骨骼动画流水线的第一级，2026-09-01）。

    PYTHONUTF8=1 python Taierzhuang1938/_import/Script_MocapVideoExtract.py <video.mp4> \
        --name CarryStretcher --people 2 [--fps 15] [--cycle auto|manual] [--period N --start-frame N] \
        [--start 0 --end 99] [--out Taierzhuang1938/_import/_mocap]

流水线全貌（口径在 docs/Data_MocapPipeline.md）：
  1. 本脚本：逐帧过 RTMW3D（rtmlib.Wholebody3d，COCO-WholeBody 133 点 ×3D），
     按连续性跟踪多人、剔除躺着的人，输出**每个行走者一份** JSON 关键点轨迹
     + 叠帧 QC 图。姊妹作是 TunnelLight1943/Script_MocapTrack.py（2D 侧视版），
     循环步态截取的思路一脉相承。
  2. Script_MocapRetargetClips.mjs：JSON → 十套卢沟桥 GLB 的 AnimationClip。

坐标口径（与 GLB 内的骨架空间对齐，见 Script_MocapRetargetClips.mjs 头注）：
  Y 向上、角色面朝 +Z、左手边 +X，单位米。深度轴（相机径向）的符号按
  「左胯必须落在 +X 侧」自动校正——单目深度分不清镜像，骨盆连线是唯一可靠的尺。

RTMW3D 的输出拆三路用：x/y 取全图 2D（keypoints_2d，像素），z 取模型的米制
根相对深度；像素→米用「腿长尺」换算（大腿+小腿的逐帧最大值 = --leg-m，默认
0.85 与目标骨架同长，省一次换算）。z 噪声大，只信它的低频部分（侧视里它承担
的是左右摆这类小量）。
"""
import argparse, json, math, os, sys
import numpy as np
import cv2

NOSE, LEYE, REYE, LEAR, REAR = 0, 1, 2, 3, 4
LSHO, RSHO, LELB, RELB, LWRI, RWRI = 5, 6, 7, 8, 9, 10
LHIP, RHIP, LKNE, RKNE, LANK, RANK = 11, 12, 13, 14, 15, 16
LBTOE, LSTOE, LHEEL, RBTOE, RSTOE, RHEEL = 17, 18, 19, 20, 21, 22
LHAND0, RHAND0 = 91, 112          # 手 21 点的腕根；+9 = 中指根 MCP

# 导出的关节表：名字 → 133 点里的下标（C = 左右中点）
EXPORT = {
    "hipL": LHIP, "hipR": RHIP, "kneeL": LKNE, "kneeR": RKNE,
    "ankleL": LANK, "ankleR": RANK, "toeL": LBTOE, "toeR": RBTOE,
    "heelL": LHEEL, "heelR": RHEEL, "shoulderL": LSHO, "shoulderR": RSHO,
    "elbowL": LELB, "elbowR": RELB, "wristL": LWRI, "wristR": RWRI,
    "handL": LHAND0 + 9, "handR": RHAND0 + 9,
    "earL": LEAR, "earR": REAR, "eyeL": LEYE, "eyeR": REYE, "nose": NOSE,
}


def smooth_cols(arr, k):
    """逐列高斯平滑，[N, C]。"""
    if k <= 1 or len(arr) < k:
        return arr
    ker = np.exp(-0.5 * (np.arange(k) - (k - 1) / 2) ** 2 / ((k / 3.0) ** 2))
    ker /= ker.sum()
    pad = k // 2
    out = np.copy(arr)
    for c in range(arr.shape[1]):
        col = np.pad(arr[:, c], (pad, pad), mode="edge")
        out[:, c] = np.convolve(col, ker, mode="valid")
    return out


def person_boxes(kps2d, scores):
    """每个人的躯干包围盒（用高置信 body 点，手脸不算）。"""
    boxes = []
    for kp, sc in zip(kps2d, scores):
        body = kp[:23][sc[:23] > 0.3]
        if len(body) < 6:
            boxes.append(None)
            continue
        boxes.append((body[:, 0].min(), body[:, 1].min(), body[:, 0].max(), body[:, 1].max()))
    return boxes


def is_lying(kp, sc):
    """躺着的人：肩胯连线接近水平（担架上的伤员，不进跟踪）。"""
    if min(sc[LSHO], sc[RSHO], sc[LHIP], sc[RHIP]) < 0.3:
        return False
    shoulder = (kp[LSHO] + kp[RSHO]) / 2
    hip = (kp[LHIP] + kp[RHIP]) / 2
    dx, dy = abs(shoulder[0] - hip[0]), abs(shoulder[1] - hip[1])
    return dx > dy * 1.6


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--name", required=True)
    ap.add_argument("--people", type=int, default=1, help="要跟踪的行走者数量（按首帧从左到右编号 p0, p1…）")
    ap.add_argument("--fps", type=float, default=15, help="输出关键帧率（抽稀）")
    ap.add_argument("--start", type=float, default=0)
    ap.add_argument("--end", type=float, default=1e9)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "_mocap"))
    ap.add_argument("--leg-m", type=float, default=0.85, help="像素→米的腿长尺（大腿+小腿，与目标骨架同长最省事）")
    ap.add_argument("--cycle", default="", help="auto：按两踝前后差的自相关截一个步态周期做循环；manual：--period/--start-frame")
    ap.add_argument("--period", type=int, default=0)
    ap.add_argument("--start-frame", type=int, default=0)
    ap.add_argument("--time-scale", type=float, default=1.0, help="生成的视频常是慢动作：0.5 = 提速一倍")
    ap.add_argument("--overlay-every", type=int, default=16)
    ap.add_argument("--smooth", type=int, default=5)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)

    from rtmlib import Wholebody3d, draw_skeleton
    model = Wholebody3d(mode="balanced", backend="onnxruntime", device="cpu")

    cap = cv2.VideoCapture(a.video)
    vfps = cap.get(cv2.CAP_PROP_FPS) or 24
    W, H = int(cap.get(3)), int(cap.get(4))
    print(f"video {W}x{H} @{vfps:.1f}fps")

    # ── 逐帧推理 + 连续性跟踪 ────────────────────────────────────────────────
    tracks = None            # tracks[p] = list of (t, kp3d[133,3], kp2d[133,2], sc[133])
    overlays = []
    i = 0
    while True:
        ok, img = cap.read()
        if not ok:
            break
        t = i / vfps
        i += 1
        if t < a.start or t > a.end:
            continue
        kps3d, sc, _simcc, kps2d = model(img)
        if kps3d is None or len(kps3d) == 0:
            continue
        walkers = [j for j in range(len(kps3d)) if not is_lying(kps2d[j], sc[j])]
        boxes = person_boxes(kps2d, sc)
        walkers = [j for j in walkers if boxes[j] is not None]
        if len(walkers) < a.people:
            continue
        centers = {j: ((boxes[j][0] + boxes[j][2]) / 2, (boxes[j][1] + boxes[j][3]) / 2) for j in walkers}
        if tracks is None:
            order = sorted(walkers, key=lambda j: centers[j][0])[: a.people]
            tracks = [[] for _ in range(a.people)]
            assign = {p: order[p] for p in range(a.people)}
        else:
            # 每条轨道认离自己上一帧最近的那个人；贪心但两个人隔着一副担架，够了
            assign = {}
            used = set()
            for p in range(a.people):
                last = tracks[p][-1]
                lx = (last[2][:23, 0].mean(), last[2][:23, 1].mean())
                best = min((j for j in walkers if j not in used), key=lambda j: (centers[j][0] - lx[0]) ** 2 + (centers[j][1] - lx[1]) ** 2, default=None)
                if best is None:
                    break
                assign[p] = best
                used.add(best)
            if len(assign) < a.people:
                continue
        for p, j in assign.items():
            tracks[p].append((t, kps3d[j].copy(), kps2d[j].copy(), sc[j].copy()))
        if (len(tracks[0]) - 1) % a.overlay_every == 0:
            keep = np.stack([kps2d[j] for j in assign.values()])
            keeps = np.stack([sc[j] for j in assign.values()])
            vis = draw_skeleton(img.copy(), keep, keeps, kpt_thr=0.3)
            cv2.putText(vis, f"t={t:.2f}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 255), 2)
            overlays.append((len(overlays), vis))
    if tracks is None:
        sys.exit("no frames with enough walkers")
    print(f"tracked {a.people} walkers over {len(tracks[0])} frames")
    for idx, vis in overlays:
        cv2.imwrite(os.path.join(a.out, f"{a.name}_overlay_{idx:04d}.jpg"), vis, [cv2.IMWRITE_JPEG_QUALITY, 82])

    # ── 每个行走者独立成一份 JSON ────────────────────────────────────────────
    for p, track in enumerate(tracks):
        T = np.array([f[0] for f in track])
        K3 = np.stack([f[1] for f in track])          # [N,133,3] 裁剪像素 x/y + 米制 z
        K2 = np.stack([f[2] for f in track])          # [N,133,2] 全图像素
        S = np.stack([f[3] for f in track])

        # 侧视里两腿/两臂交叉那一刻，估计器常把左右**认反**（同一条腿一帧在前
        # 一帧在后）。不信它的左右标签，按连续性逐帧重新配对；**必须在平滑之前**
        # 做，否则认反的那几帧会把两条腿平均成一条（TunnelLight 的老账）。
        LEG_L = [LHIP, LKNE, LANK, LBTOE, LSTOE, LHEEL]
        LEG_R = [RHIP, RKNE, RANK, RBTOE, RSTOE, RHEEL]
        ARM_L = [LSHO, LELB, LWRI] + list(range(LHAND0, LHAND0 + 21))
        ARM_R = [RSHO, RELB, RWRI] + list(range(RHAND0, RHAND0 + 21))
        for group_l, group_r, probe in ((LEG_L, LEG_R, (1, 2)), (ARM_L, ARM_R, (1, 2))):
            for fidx in range(1, len(K2)):
                keep = swap = 0.0
                for pi in probe:      # 用膝踝/肘腕两点判定
                    keep += np.linalg.norm(K2[fidx, group_l[pi]] - K2[fidx - 1, group_l[pi]])
                    keep += np.linalg.norm(K2[fidx, group_r[pi]] - K2[fidx - 1, group_r[pi]])
                    swap += np.linalg.norm(K2[fidx, group_r[pi]] - K2[fidx - 1, group_l[pi]])
                    swap += np.linalg.norm(K2[fidx, group_l[pi]] - K2[fidx - 1, group_r[pi]])
                if swap < keep:
                    for ia, ib in zip(group_l, group_r):
                        for arr in (K2, K3, S):
                            arr[fidx, [ia, ib]] = arr[fidx, [ib, ia]]

        # 像素→米：x/y 用全图 2D（跨人同一把尺），z 直接是米。
        legpx = 0.0
        for side in ((LHIP, LKNE, LANK), (RHIP, RKNE, RANK)):
            seg = np.linalg.norm(K2[:, side[0]] - K2[:, side[1]], axis=1) + np.linalg.norm(K2[:, side[1]] - K2[:, side[2]], axis=1)
            legpx = max(legpx, np.percentile(seg, 95))
        ppm = legpx / a.leg_m
        print(f"p{p}: scale {ppm:.1f} px/m")

        pts = np.zeros((len(T), 133, 3))
        pts[:, :, 0] = K2[:, :, 0] / ppm
        pts[:, :, 1] = -K2[:, :, 1] / ppm             # 图像 y 向下 → 世界 Y 向上
        pts[:, :, 2] = K3[:, :, 2]                    # 根相对深度（米）
        # z 只要低频：它是单目深度，逐帧抖动没有信息量
        pts[:, :, 2] = smooth_cols(pts[:, :, 2], max(a.smooth, 9))
        for c in (0, 1):
            pts[:, :, c] = smooth_cols(pts[:, :, c], a.smooth)

        # ── 旋到角色空间：面朝 +Z、左 +X ───────────────────────────────────
        pel = (pts[:, LHIP] + pts[:, RHIP]) / 2
        vx = np.median(np.diff(pel[:, 0]))            # 行走方向（世界 X 分量）
        face_sign = 1.0 if vx >= 0 else -1.0          # +1 = 朝图像右走
        # 旋转：行走方向 → +Z。绕 Y 转 ±90°：x' = ∓z, z' = ±x
        rot = np.zeros_like(pts)
        rot[:, :, 1] = pts[:, :, 1]
        rot[:, :, 0] = -face_sign * pts[:, :, 2]
        rot[:, :, 2] = face_sign * pts[:, :, 0]
        # 左胯必须在 +X 侧；反了就是深度轴符号错，整轴翻过来
        lat = np.median(rot[:, LHIP, 0] - rot[:, RHIP, 0])
        if lat < 0:
            rot[:, :, 0] = -rot[:, :, 0]
            print(f"p{p}: depth axis flipped (hip line check {lat:.3f})")
        pts = rot

        # 原点：两脚中点（水平）+ 全段最低脚跟（竖直）→ 地面 = Y0
        feet = (pts[:, LANK] + pts[:, RANK]) / 2
        ground = min(pts[:, LHEEL, 1].min(), pts[:, RHEEL, 1].min(),
                     pts[:, LBTOE, 1].min(), pts[:, RBTOE, 1].min())
        pts[:, :, 0] -= np.median(feet[:, 0])
        pts[:, :, 2] -= feet[:, 2][:, None]           # 前后原点跟着两脚中点走（步态留在骨盆差里）
        pts[:, :, 1] -= ground

        # ── 循环步态截取 ─────────────────────────────────────────────────────
        loop = False
        rows = list(range(len(T)))
        if a.cycle == "manual":
            rows = rows[a.start_frame: a.start_frame + a.period + 1]
            loop = True
        elif a.cycle == "auto":
            sig = pts[:, LANK, 2] - pts[:, RANK, 2]
            sig = sig - sig.mean()
            ac = {}
            # 搜索窗上限 4 秒：跛行/负重这类慢步态一个整周期能到 3.5 s，
            # 2.5 s 的窗会让自相关抓到噪声峰（WoundedLimp 就是这么截出 0.37 s 的）
            for lag in range(int(vfps * 0.4), min(int(vfps * 4.0), len(sig) - 2)):
                ac[lag] = float(np.dot(sig[:-lag], sig[lag:]) / (np.linalg.norm(sig[:-lag]) * np.linalg.norm(sig[lag:]) + 1e-9))
            lags = sorted(ac)
            peaks = [l for l in lags[1:-1] if ac[l] > ac[l - 1] and ac[l] >= ac[l + 1] and ac[l] > 0.3]
            period = max(peaks, key=lambda l: ac[l]) if peaks else max(lags, key=lambda l: ac[l])
            zc = [k for k in range(1, len(sig) - period) if sig[k - 1] < 0 <= sig[k]]
            start = min(zc, key=lambda k: abs(k - len(sig) // 3)) if zc else 0
            rows = rows[start: start + period + 1]
            loop = True
            print(f"p{p}: cycle period {period} frames = {period / vfps:.2f}s (r={ac[period]:.2f}), start {start}")

        # 抽稀 + 时间轴缩放
        vfps_eff = vfps / a.time_scale
        step = max(1, int(round(vfps_eff / a.fps)))
        keys = rows[::step]
        if loop and rows[-1] != keys[-1]:
            keys = keys + [rows[-1]]
        t0 = T[keys[0]]
        times = [(T[k] - t0) * a.time_scale for k in keys]

        joints = {}
        for name, idx in EXPORT.items():
            joints[name] = [[round(float(v), 4) for v in pts[k, idx]] for k in keys]
        conf = {name: round(float(S[:, idx].mean()), 3) for name, idx in EXPORT.items()}
        # 逐帧置信度：远侧肢被身体挡住时估出来的是**错值**不是抖动，反解侧要按
        # 这个把坏臂换成好臂的镜像（Script_MocapRetargetClips 的 arm fallback）。
        conf_keys = {name: [round(float(S[k, idx]), 3) for k in keys] for name, idx in EXPORT.items()}

        out = {
            "name": a.name if a.people == 1 else f"{a.name}_p{p}",
            "video": os.path.basename(a.video),
            "loop": loop,
            "times": [round(t, 4) for t in times],
            "legM": a.leg_m,
            "joints": joints,
            "confidence": conf,
            "confKeys": conf_keys,
        }
        path = os.path.join(a.out, out["name"] + ".mocap.json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(out, fh, ensure_ascii=False)
        print(f"wrote {path} ({len(keys)} keys, {times[-1]:.2f}s, loop={loop})")


if __name__ == "__main__":
    main()
