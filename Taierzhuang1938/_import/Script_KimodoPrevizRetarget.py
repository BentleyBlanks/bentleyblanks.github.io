"""Retarget Kimodo SOMA77 motions onto TengxianNra02 for the blockout previz library (docs/Data_EditorBlockout.md §14.5).

Input:  tmp/KimodoPreviz/<clip>/<clip>_<nn>.npz (Script_KimodoPrevizGenerate.py), the picked sample per clip
        from Data_KimodoPrevizPrompts.json (`pick`, default 0, or --pick Clip=n,...).
Output: Animation/PrevizKimodo/Animation_TengxianNra02PrevizKimodo.json + Data_PrevizKimodoAnimation.json,
        the same record / manifest shape as the hand-keyed Previz libraries (glTF node-local p xyz + q xyzw, stride 7, 24 fps).
        Clips keep their old names; Data_BlockoutPrevizClips lists PrevizKimodo first so these win the merge.

How a bone is retargeted: Kimodo global rotations are relative to its neutral T-pose (identity = neutral), so
  W_target(t) = H · R_source(t) · A_b · Wrest_target,
A_b = the shortest rotation taking the target bone's rest direction (joint -> primary child) onto the source neutral
direction, H = the heading that faces the first frame to the asset front (+Z). Pelvis height maps the neutral hip height
onto the target rest pelvis height and scales displacement by the leg-length ratio.
Kept from the old hand-keyed clip (same clip name in its Previz library): every finger bone, and the weapon track:
  weaponState lowRight / slungBack / free: the old weapon pose rigid to the nearest bone at frame 0, carried by the new bone;
  weaponState upright / ground: the old weapon track as it was, and the right hand two-bone-IK'd onto the old right hand.
Plain Python + numpy (the SOMA77 neutral is dumped in Data_KimodoSoma77Neutral.json):
  python _import/Script_KimodoPrevizRetarget.py [--pick PvStandPointL=2] [--sheets tmp/KimodoPreviz/sheets]
"""
from pathlib import Path
import argparse
import hashlib
import json
import struct

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--spec", type=Path, default=ROOT / "_import/Data_KimodoPrevizPrompts.json")
parser.add_argument("--raw", type=Path, default=ROOT / "tmp/KimodoPreviz")
parser.add_argument("--out", type=Path, default=ROOT / "Animation/PrevizKimodo")
parser.add_argument("--pick", default="", help="Clip=sample,... overrides the spec's pick")
parser.add_argument("--only", default="")
parser.add_argument("--all-samples", action="store_true", help="retarget every sample as <clip>__s<nn> (for contact sheets only)")
parser.add_argument("--version", default="20261020PrevizKimodoV1")
args = parser.parse_args()

FPS = 24
GLB = ROOT / "Model/Character/Model_TengxianNra02.glb"

# ---------------------------------------------------------------- quaternions (x, y, z, w) and matrices

def QMul(a, b):
    ax, ay, az, aw = np.moveaxis(a, -1, 0)
    bx, by, bz, bw = np.moveaxis(b, -1, 0)
    return np.stack([aw * bx + ax * bw + ay * bz - az * by,
                     aw * by - ax * bz + ay * bw + az * bx,
                     aw * bz + ax * by - ay * bx + az * bw,
                     aw * bw - ax * bx - ay * by - az * bz], -1)


def QInv(q):
    return q * np.array([-1, -1, -1, 1.0])


def QToM(q):
    x, y, z, w = np.moveaxis(q, -1, 0)
    return np.stack([
        np.stack([1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], -1),
        np.stack([2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], -1),
        np.stack([2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)], -1)], -2)


def MToQ(m):
    m = np.asarray(m, dtype=np.float64)
    shape = m.shape[:-2]
    m = m.reshape(-1, 3, 3)
    q = np.zeros((len(m), 4))
    for i, r in enumerate(m):
        t = r[0, 0] + r[1, 1] + r[2, 2]
        if t > 0:
            s = np.sqrt(t + 1.0) * 2
            q[i] = [(r[2, 1] - r[1, 2]) / s, (r[0, 2] - r[2, 0]) / s, (r[1, 0] - r[0, 1]) / s, 0.25 * s]
        elif r[0, 0] > r[1, 1] and r[0, 0] > r[2, 2]:
            s = np.sqrt(1.0 + r[0, 0] - r[1, 1] - r[2, 2]) * 2
            q[i] = [0.25 * s, (r[0, 1] + r[1, 0]) / s, (r[0, 2] + r[2, 0]) / s, (r[2, 1] - r[1, 2]) / s]
        elif r[1, 1] > r[2, 2]:
            s = np.sqrt(1.0 + r[1, 1] - r[0, 0] - r[2, 2]) * 2
            q[i] = [(r[0, 1] + r[1, 0]) / s, 0.25 * s, (r[1, 2] + r[2, 1]) / s, (r[0, 2] - r[2, 0]) / s]
        else:
            s = np.sqrt(1.0 + r[2, 2] - r[0, 0] - r[1, 1]) * 2
            q[i] = [(r[0, 2] + r[2, 0]) / s, (r[1, 2] + r[2, 1]) / s, 0.25 * s, (r[1, 0] - r[0, 1]) / s]
    q /= np.linalg.norm(q, axis=1, keepdims=True)
    return q.reshape(*shape, 4)


def MinRot(a, b):
    """Shortest rotation matrix taking unit vector a onto b."""
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b)
    v = np.cross(a, b); c = float(np.dot(a, b))
    if c < -0.9999:
        axis = np.cross(a, [1, 0, 0]) if abs(a[0]) < 0.9 else np.cross(a, [0, 1, 0])
        axis /= np.linalg.norm(axis)
        return 2 * np.outer(axis, axis) - np.eye(3)
    k = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + k + k @ k / (1 + c)


def Slerp(a, b, t):
    d = np.sum(a * b, -1, keepdims=True)
    b = np.where(d < 0, -b, b); d = np.abs(d)
    t = np.asarray(t, dtype=np.float64)
    if t.ndim < a.ndim: t = t[..., None]
    lin = d > 0.9995
    th = np.arccos(np.clip(d, -1, 1)); s = np.sin(th) + 1e-12
    wa = np.where(lin, 1 - t, np.sin((1 - t) * th) / s)
    wb = np.where(lin, t, np.sin(t * th) / s)
    q = wa * a + wb * b
    return q / np.linalg.norm(q, axis=-1, keepdims=True)


# ---------------------------------------------------------------- target rig (rest from the GLB, bone order from the old record)

def ReadGlb(path):
    b = path.read_bytes()
    n = struct.unpack("<I", b[12:16])[0]
    return json.loads(b[20:20 + n])


gltf = ReadGlb(GLB)
nodeByName = {n.get("name"): i for i, n in enumerate(gltf["nodes"])}
nodeParent = {}
for i, n in enumerate(gltf["nodes"]):
    for c in n.get("children", []): nodeParent[c] = i


def NodeLocal(i):
    n = gltf["nodes"][i]
    return np.array(n.get("translation", [0, 0, 0]), float), np.array(n.get("rotation", [0, 0, 0, 1]), float)


def NodeWorld(i):
    """World (scene) rotation matrix + position of node i at rest."""
    chain = []
    while i is not None:
        chain.append(i); i = nodeParent.get(i)
    R = np.eye(3); p = np.zeros(3)
    for j in reversed(chain):
        t, q = NodeLocal(j)
        p = p + R @ t; R = R @ QToM(q)
    return R, p


OLD_LIBS = {}


def OldLibrary(name):
    if name not in OLD_LIBS:
        rec = json.loads((ROOT / f"Animation/{name}/Animation_TengxianNra02{name}.json").read_text(encoding="utf-8"))
        man = json.loads((ROOT / f"Animation/{name}/Data_{name}Animation.json").read_text(encoding="utf-8"))
        OLD_LIBS[name] = (rec, man)
    return OLD_LIBS[name]


BONES = OldLibrary("PrevizTalk")[0]["bones"]
NB = len(BONES)
BI = {b: i for i, b in enumerate(BONES)}
PARENT = []
for b in BONES:
    p = nodeParent.get(nodeByName[b])
    PARENT.append(BI.get(gltf["nodes"][p]["name"], -1) if p is not None else -1)
for i, p in enumerate(PARENT): assert p < i, (BONES[i], p)
REST_T = np.array([NodeLocal(nodeByName[b])[0] for b in BONES])
REST_Q = np.array([NodeLocal(nodeByName[b])[1] for b in BONES])
REST_W = [NodeWorld(nodeByName[b]) for b in BONES]

# ---------------------------------------------------------------- source skeleton

SOMA = json.loads((ROOT / "_import/Data_KimodoSoma77Neutral.json").read_text(encoding="utf-8"))
SN = SOMA["names"]
SNEU = np.array(SOMA["neutral"], dtype=np.float64)

# target bone -> (source joint, source child for the direction, target child for the direction)
MAP = {
    "Bip001 Pelvis": ("Hips", "Spine1", "Bip001 Spine"),
    "Bip001 Spine": ("Spine1", "Spine2", "Bip001 Spine1"),
    "Bip001 Spine1": ("Spine2", "Chest", "Bip001 Spine2"),
    "Bip001 Spine2": ("Chest", "Neck1", "Bip001 Neck"),
    "Bip001 Neck": ("Neck1", "Head", "Bip001 Head"),
    "Bip001 Head": ("Head", "HeadEnd", None),
}
for s, S in (("L", "Left"), ("R", "Right")):
    MAP.update({
        f"Bip001 {s} Clavicle": (f"{S}Shoulder", f"{S}Arm", f"Bip001 {s} UpperArm"),
        f"Bip001 {s} UpperArm": (f"{S}Arm", f"{S}ForeArm", f"Bip001 {s} Forearm"),
        f"Bip001 {s} Forearm": (f"{S}ForeArm", f"{S}Hand", f"Bip001 {s} Hand"),
        f"Bip001 {s} Hand": (f"{S}Hand", f"{S}HandMiddle1", f"Bip001 {s} Finger2"),
        f"Bip001 {s} Thigh": (f"{S}Leg", f"{S}Shin", f"Bip001 {s} Calf"),
        f"Bip001 {s} Calf": (f"{S}Shin", f"{S}Foot", f"Bip001 {s} Foot"),
        f"Bip001 {s} Foot": (f"{S}Foot", f"{S}ToeBase", f"Bip001 {s} Toe0"),
        f"Bip001 {s} Toe0": (f"{S}ToeBase", f"{S}ToeEnd", None),
    })

OFFSET = {}  # bone -> 3x3 M_b with W_target = R_source · M_b
MIDLINE = {"Bip001 Pelvis", "Bip001 Spine", "Bip001 Spine1", "Bip001 Spine2", "Bip001 Neck", "Bip001 Head"}
for b, (sj, sc, tc) in MAP.items():
    Rr, pr = REST_W[BI[b]]
    if tc is not None:
        dT = REST_W[BI[tc]][1] - pr
    else:
        dT = Rr[:, 0]  # Biped bones run along local +X
    dS = SNEU[SN.index(sc)] - SNEU[SN.index(sj)]
    # the trunk, neck and head stand straight facing +Z in both rests: take them one to one (a bone-direction fit tips the
    # head back ~15°: Biped's head axis and SOMA's Head->HeadEnd are not the same line through the skull)
    OFFSET[b] = Rr if b in MIDLINE else MinRot(dT, dS) @ Rr

LEG_T = np.linalg.norm(REST_T[BI["Bip001 L Calf"]]) + np.linalg.norm(REST_T[BI["Bip001 L Foot"]])
LEG_S = np.linalg.norm(SNEU[SN.index("LeftShin")] - SNEU[SN.index("LeftLeg")]) + np.linalg.norm(SNEU[SN.index("LeftFoot")] - SNEU[SN.index("LeftShin")])
LEG_RATIO = LEG_T / LEG_S
SRC_FLOOR = SNEU[:, 1].min()
SRC_HIP_H = SNEU[0, 1] - SRC_FLOOR
TGT_PELVIS_H = REST_W[BI["Bip001 Pelvis"]][1][1]

FINGERS = [i for i, b in enumerate(BONES) if "Finger" in b]


# ---------------------------------------------------------------- forward kinematics on the target

def Fk(T, Q):
    """T [F,NB,3], Q [F,NB,4] node-local -> world rotation matrices [F,NB,3,3] and positions [F,NB,3]."""
    F = len(T)
    Rw = np.zeros((F, NB, 3, 3)); Pw = np.zeros((F, NB, 3))
    Ml = QToM(Q)
    for i in range(NB):
        p = PARENT[i]
        if p < 0:
            Rw[:, i] = Ml[:, i]; Pw[:, i] = T[:, i]
        else:
            Rw[:, i] = Rw[:, p] @ Ml[:, i]
            Pw[:, i] = Pw[:, p] + np.einsum("fij,fj->fi", Rw[:, p], T[:, i])
    return Rw, Pw


def Unpack(values, frames):
    v = np.asarray(values, float).reshape(frames, NB, 7)
    return v[:, :, :3], v[:, :, 3:]


# ---------------------------------------------------------------- one source motion -> target locals at 24 fps

def Resample(arr, srcFps, times):
    f = np.clip(times * srcFps, 0, len(arr) - 1)
    i0 = np.floor(f).astype(int); i1 = np.minimum(i0 + 1, len(arr) - 1); w = f - i0
    return i0, i1, w


SWAP = [SN.index(n.replace("Left", "@").replace("Right", "Left").replace("@", "Right")) for n in SN]
MIRROR = np.diag([-1.0, 1.0, 1.0])


def SourceMotion(npz, hand=None, knee=None):
    """SOMA77 positions + global rotations, mirrored left/right when Kimodo swapped the sides (text models do now and then):
    `knee` = the knee the old clip kneels on (the lower knee decides), else `hand` = its gesturing hand (the hand that
    moves more relative to the chest decides)."""
    d = np.load(npz)
    P = d["posed_joints"].astype(np.float64); R = d["global_rot_mats"].astype(np.float64)
    mirrored = False
    busy = want = None
    if knee in ("L", "R"):
        h = lambda j: float(P[len(P) // 3:, SN.index(j), 1].mean())
        busy, want = ("L" if h("LeftShin") < h("RightShin") else "R"), knee
    elif hand in ("L", "R"):
        act = lambda j: float(np.linalg.norm(np.diff(P[:, SN.index(j)] - P[:, SN.index("Chest")], axis=0), axis=1).sum())
        busy, want = ("L" if act("LeftHand") > act("RightHand") else "R"), hand
    if busy is not None:
        if busy != want:
            P = P[:, SWAP] @ MIRROR; R = MIRROR @ R[:, SWAP] @ MIRROR
            mirrored = True
    return P, R, mirrored


def SourceToTarget(npz, inPlace, runAxis=False, hand=None, knee=None):
    P, R, mirrored = SourceMotion(npz, hand, knee)
    F = len(P)
    # heading: face the first frames (or the run direction) to +Z
    if runAxis:
        v = P[-1, 0] - P[0, 0]; fwd = np.array([v[0], 0, v[2]])
    else:
        fwd = (R[: min(10, F), 0] @ np.array([0, 0, 1.0])).mean(0); fwd[1] = 0
    yaw = np.arctan2(fwd[0], fwd[2])
    c, s = np.cos(-yaw), np.sin(-yaw)
    H = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    P = P @ H.T; R = H @ R
    floor = min(P[:, SN.index("LeftToeEnd"), 1].min(), P[:, SN.index("RightToeEnd"), 1].min(), P[:, :, 1].min())
    root = P[:, 0].copy()
    root[:, [0, 2]] -= root[0, [0, 2]]
    speed = 0.0
    if inPlace == "strip":
        span = (F - 1) / 30.0
        vel = (root[-1, [0, 2]] - root[0, [0, 2]]) / span
        speed = float(np.linalg.norm(vel)) * LEG_RATIO
        root[:, [0, 2]] -= np.outer(np.arange(F) / 30.0, vel)
    T = np.tile(REST_T, (F, 1, 1)); Q = np.tile(REST_Q, (F, 1, 1))
    # world rotations of the mapped bones, then node-local by walking down the hierarchy
    Wt = {}
    for b, M in OFFSET.items():
        Wt[b] = R[:, SN.index(MAP[b][0])] @ M
    Rw = np.zeros((F, NB, 3, 3))
    for i, b in enumerate(BONES):
        p = PARENT[i]
        Rp = Rw[:, p] if p >= 0 else np.tile(np.eye(3), (F, 1, 1))
        if b in Wt:
            Rw[:, i] = Wt[b]
            Q[:, i] = MToQ(np.transpose(Rp, (0, 2, 1)) @ Wt[b])
        else:
            Rw[:, i] = Rp @ QToM(REST_Q[i])
    pel = BI["Bip001 Pelvis"]
    T[:, pel, 0] = root[:, 0] * LEG_RATIO
    T[:, pel, 2] = root[:, 2] * LEG_RATIO
    T[:, pel, 1] = TGT_PELVIS_H + ((root[:, 1] - floor) - SRC_HIP_H) * LEG_RATIO
    return T, Q, 30.0, speed, mirrored


def ToFps(T, Q, srcFps, times):
    i0, i1, w = Resample(T, srcFps, times)
    T2 = T[i0] * (1 - w)[:, None, None] + T[i1] * w[:, None, None]
    Q2 = Slerp(Q[i0], Q[i1], w[:, None])
    return T2, Q2


# ---------------------------------------------------------------- loop / timing helpers

def PoseFeature(T, Q):
    _, Pw = Fk(T, Q)
    rel = Pw - Pw[:, BI["Bip001 Pelvis"]][:, None]
    rel[:, BI["Bip001 Pelvis"]] = Pw[:, BI["Bip001 Pelvis"]]
    return rel.reshape(len(T), -1)


def MakeLoop(T, Q, srcFps, duration, fade=0.5, skip=0.6, durRange=(0.8, 1.25)):
    """Pick [a, a+L] (L near duration) with the best start/end match among the windows where the hands keep moving
    (>= 60% of the busiest window: a still stretch always seams best and a gesture loop would lose its gesture);
    crossfade the continuation into the start."""
    feat = PoseFeature(T, Q)
    _, Pw = Fk(T, Q)
    chest = Pw[:, BI["Bip001 Spine2"]][:, None]
    hands = Pw[:, [BI["Bip001 L Hand"], BI["Bip001 R Hand"], BI["Bip001 Head"]]] - chest
    speed = np.concatenate([[0], np.linalg.norm(np.diff(hands, axis=0), axis=2).sum(1)])
    cum = np.cumsum(speed)
    F = len(T)
    cands = []
    for L in range(int(duration * durRange[0] * srcFps), int(duration * durRange[1] * srcFps) + 1):
        nf = int(min(fade, L / srcFps * 0.45) * srcFps)
        for a in range(int(skip * srcFps), F - L - nf):
            err = np.linalg.norm(feat[a] - feat[a + L]) + 0.5 * np.linalg.norm((feat[a + 1] - feat[a]) - (feat[a + L + 1] - feat[a + L])) * srcFps * 0.1
            cands.append((err, a, L, nf, (cum[a + L] - cum[a]) / L))
    best = None
    if cands:
        top = max(c[4] for c in cands)
        best = min((c for c in cands if c[4] >= 0.6 * top), key=lambda c: c[0])
    if best is None:
        raise RuntimeError(f"source too short for a {duration}s loop")
    _, a, L, nf, _ = best
    Ts = T[a:a + L].copy(); Qs = Q[a:a + L].copy()
    for k in range(nf):
        w = (k + 0.5) / nf; w = w * w * (3 - 2 * w)
        Ts[k] = T[a + L + k] * (1 - w) + T[a + k] * w
        Qs[k] = Slerp(Q[a + L + k], Q[a + k], w)
    dur = L / srcFps
    frames = int(round(dur * FPS)) + 1
    times = np.linspace(0, dur, frames)
    Tw = np.concatenate([Ts, Ts[:1]]); Qw = np.concatenate([Qs, Qs[:1]])
    T2, Q2 = ToFps(Tw, Qw, srcFps, times)
    return T2, Q2, dur, {"window": [round(a / srcFps, 3), round((a + L) / srcFps, 3)], "seamError": round(float(best[0]), 4)}


def Settle(T, Q, srcFps, bones, after=0.3, speed=0.12):
    """First time after which the given bones' world positions stay under `speed` m/s."""
    _, Pw = Fk(T, Q)
    v = np.linalg.norm(np.diff(Pw[:, [BI[b] for b in bones]], axis=0), axis=2).max(1) * srcFps
    moving = np.where(v > speed)[0]
    start = int(after * srcFps)
    moving = moving[moving >= start]
    return (moving[-1] + 1) / srcFps if len(moving) else after


MAX_SPEEDUP = 1.6


def OneShot(T, Q, srcFps, duration, hold=None, settleBones=None, settleSpeed=0.12):
    """Old duration kept. With a hold: time-map so the source settle lands on the old hold start (sped up at most
    MAX_SPEEDUP; past that the hold starts later and the clip grows by the same amount), hold region seamless.
    Returns T, Q, info, duration, hold."""
    srcDur = (len(T) - 1) / srcFps
    info = {}
    if hold and settleBones:
        s = Settle(T, Q, srcFps, settleBones, speed=settleSpeed)
        s = min(max(s, 0.2), srcDur - (duration - hold[0]) - 0.05)
        h0 = max(hold[0], s / MAX_SPEEDUP)
        duration = duration + (h0 - hold[0]); hold = [round(h0, 3), round(duration, 3)]
        times = np.linspace(0, duration, int(round(duration * FPS)) + 1)
        src = np.where(times <= hold[0], times / hold[0] * s, s + (times - hold[0]))
        info = {"sourceSettleS": round(float(s), 3), "timeScale": round(float(s / hold[0]), 3)}
        T2, Q2 = ToFps(T, Q, srcFps, src * 1.0)
        # hold loop seam: ease the last 0.3 s back onto the hold start pose
        h0 = int(round(hold[0] * FPS)); n = min(int(0.3 * FPS), len(T2) - h0 - 1)
        for k in range(n):
            i = len(T2) - n + k; w = (k + 1) / n; w = w * w * (3 - 2 * w)
            T2[i] = T2[i] * (1 - w) + T2[h0] * w
            Q2[i] = Slerp(Q2[i], Q2[h0], w)
        return T2, Q2, info, duration, hold
    times = np.linspace(0, duration, int(round(duration * FPS)) + 1)
    scale = min(1.0, srcDur / duration)
    T2, Q2 = ToFps(T, Q, srcFps, times * scale)
    return T2, Q2, info, duration, hold


# ---------------------------------------------------------------- old clip: fingers, weapon, right-hand IK

def OldClip(libName, clip):
    rec, man = OldLibrary(libName)
    row = rec["clips"][clip]
    T, Q = Unpack(row["values"], row["frameCount"])
    return row, man["clips"][clip], T, Q


def SampleOld(arr, frames):
    """Old clip resampled onto the new frame count end to end (an old seamless loop stays seamless)."""
    return arr[np.round(np.linspace(0, len(arr) - 1, frames)).astype(int)]


def WeaponFrames(values, stride):
    return np.asarray(values, float).reshape(-1, stride)


def BasisFromWeapon(row):
    o = row[0:3]; ax = row[3:6] / np.linalg.norm(row[3:6]); up = row[6:9] / np.linalg.norm(row[6:9])
    side = np.cross(up, ax); side /= np.linalg.norm(side); up = np.cross(ax, side)
    return o, np.stack([ax, up, side], 1)


def WeaponRow(o, B, vis):
    return [*o, *B[:, 0], *B[:, 1], vis]


def TwoBoneIk(T, Q, side, targetPos, targetRot, Rw, Pw):
    """Put hand `side` at targetPos/targetRot (world), solving upper arm + forearm; elbow keeps its plane."""
    iU, iF, iH = BI[f"Bip001 {side} UpperArm"], BI[f"Bip001 {side} Forearm"], BI[f"Bip001 {side} Hand"]
    l1 = np.linalg.norm(REST_T[iF]); l2 = np.linalg.norm(REST_T[iH])
    for f in range(len(T)):
        S = Pw[f, iU]; E = Pw[f, iF]; W = targetPos[f]
        d = W - S; dist = np.clip(np.linalg.norm(d), 1e-4, l1 + l2 - 1e-4); dn = d / np.linalg.norm(d)
        pole = E - S - np.dot(E - S, dn) * dn
        if np.linalg.norm(pole) < 1e-5: pole = np.array([0, -1.0, 0]) - dn[1] * dn
        pole /= np.linalg.norm(pole)
        a = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist)
        Enew = S + dn * l1 * a + pole * l1 * np.sqrt(max(0, 1 - a * a))
        # upper arm: rotate its world frame so +X (toward the forearm) hits Enew
        RU = Rw[f, iU]; RU = MinRot(RU @ (REST_T[iF] / l1), Enew - S) @ RU
        Rp = Rw[f, PARENT[iU]]
        Q[f, iU] = MToQ(Rp.T @ RU)
        RF = RU @ QToM(Q[f, iF]); EF = S + RU @ REST_T[iF]
        RF = MinRot(RF @ (REST_T[iH] / l2), W - EF) @ RF
        Q[f, iF] = MToQ(RU.T @ RF)
        Q[f, iH] = MToQ(RF.T @ targetRot[f])


def FootPlant(T, Q, info):
    """Floor: lift / drop the whole clip so the lowest contact point over the clip sits on the ground."""
    _, Pw = Fk(T, Q)
    # joint height above the ground when that part rests on it (rest pose feet; the hand-keyed kneel / sit / prone clips)
    probe = {f"Bip001 {s} {b}": r for s in "LR" for b, r in (("Toe0", 0.016), ("Foot", 0.105), ("Calf", 0.07), ("Hand", 0.03))}
    probe["Bip001 Pelvis"] = 0.12; probe["Bip001 Head"] = 0.12; probe["Bip001 Spine2"] = 0.16
    low = min(float((Pw[:, BI[b], 1] - r).min()) for b, r in probe.items())
    T[:, BI["Bip001 Pelvis"], 1] -= low
    info["floorShiftM"] = round(-low, 4)


# ---------------------------------------------------------------- build

spec = json.loads(args.spec.read_text(encoding="utf-8"))
picks = {k: int(v) for k, v in (p.split("=") for p in args.pick.split(",") if p)}
only = {s for s in args.only.split(",") if s}
record = {"schema": 2, "modelId": "TengxianNra02", "skeleton": "TengxianHumanoidV1", "fps": FPS, "stride": 7, "bones": BONES,
          "clips": {}, "contactPoints": {}, "originalModelSha256": OldLibrary("PrevizTalk")[0]["originalModelSha256"],
          "authoringTool": "Kimodo-SOMA-RP-v1.2 text-to-motion + _import/Script_KimodoPrevizRetarget.py"}
manifest = {"schema": 2, "version": args.version, "fps": FPS, "actorForward": [0, 0, -1], "blendSeconds": 0.12, "floorClearanceM": 0.003,
            "coordinates": OldLibrary("PrevizTalk")[1]["coordinates"], "stages": {}, "props": {}, "clips": {}, "models": []}
report = []

for row in spec["clips"]:
    name = row["clip"]
    if only and name not in only: continue
    if row.get("rejected") and not args.all_samples: continue
    oldRow, oldMeta, oT, oQ = OldClip(row["library"], name)
    samples = range(row["samples"]) if args.all_samples else [picks.get(name, row.get("pick", 0))]
    for sample in samples:
        npz = args.raw / name / f"{name}_{sample:02d}.npz"
        outName = f"{name}__s{sample:02d}" if args.all_samples else name
        dur = float(oldMeta["duration"]); loop = bool(oldMeta.get("loop")); ref = oldMeta.get("referenceSpeedMps")
        T, Q, srcFps, speed, mirrored = SourceToTarget(npz, "strip" if ref else False, runAxis=bool(ref), hand=row.get("hand"), knee=row.get("knee"))
        info = {"sample": sample, "mirrored": mirrored}
        if loop:
            T2, Q2, dur, li = MakeLoop(T, Q, srcFps, dur, fade=min(0.5, dur * 0.4), skip=0.3 if ref else 0.6)
            info.update(li)
        else:
            hold = oldMeta.get("holdLoop")
            moverSide = "L" if name.endswith("L") or "Point" in name or "Halt" in name else None
            settleBones = [f"Bip001 L Hand"] if moverSide else (["Bip001 Pelvis", "Bip001 Head"] if hold else None)
            T2, Q2, info2, dur, hold = OneShot(T, Q, srcFps, dur, hold, settleBones, settleSpeed=0.15 if moverSide else 0.25)
            info.update(info2)
            if hold: info["holdLoop"] = hold
        F = len(T2)
        # fingers from the old clip
        oTs = SampleOld(oT, F); oQs = SampleOld(oQ, F)
        for i in FINGERS: Q2[:, i] = oQs[:, i]
        T2[:, 0] = oTs[:, 0]; Q2[:, 0] = oQs[:, 0]  # GroundRoot as authored (identity)
        FootPlant(T2, Q2, info)
        Rw, Pw = Fk(T2, Q2)
        # weapon
        props = {}
        state = oldMeta.get("weaponState", "")
        if "weapon" in (oldRow.get("props") or {}):
            stride = oldRow["props"]["weapon"]["stride"]
            W = WeaponFrames(oldRow["props"]["weapon"]["values"], stride)
            oRw, oPw = Fk(oT, oQ)
            if state in ("upright", "ground"):
                # weapon stays as authored; the right hand (and the left, if it was on the weapon) IK'd onto the old hands
                Ws = SampleOld(W, F)
                for side in ("R", "L"):
                    h = BI[f"Bip001 {side} Hand"]
                    o0, B0 = BasisFromWeapon(W[0])
                    near = np.linalg.norm(oPw[0, h] - o0) < 0.9 and (side == "R" or oldMeta.get("role") == "rest")
                    if not near: continue
                    tp = SampleOld(oPw[:, h], F); tr = SampleOld(oRw[:, h], F)
                    TwoBoneIk(T2, Q2, side, tp, tr, Rw, Pw)
                    Rw, Pw = Fk(T2, Q2)
                props["weapon"] = {"stride": stride, "values": [round(float(x), 5) for x in Ws.reshape(-1)]}
                info["weapon"] = "authored track, hands IK'd onto the old grip"
            else:
                if state == "lowRight":
                    # Kimodo's right arm knows nothing of the rifle: the right hand goes where the old clip held it,
                    # carried by the pelvis (old hand in the old pelvis frame -> new pelvis), two-bone IK
                    h = BI["Bip001 R Hand"]; pel = BI["Bip001 Pelvis"]
                    oR = SampleOld(oRw, F); oP = SampleOld(oPw, F)
                    tp = np.zeros((F, 3)); tr = np.zeros((F, 3, 3))
                    def Yaw(Rm):  # Ry(a), a = heading of the hips line (Biped pelvis local +Z = character left, world +X at rest)
                        left = Rm[:, 2]; a = np.arctan2(left[2], left[0])
                        c, s_ = np.cos(a), np.sin(a)
                        return np.array([[c, 0, s_], [0, 1, 0], [-s_, 0, c]])
                    for f in range(F):
                        A = Yaw(Rw[f, pel]).T @ Yaw(oR[f, pel])
                        tp[f] = Pw[f, pel] + A @ (oP[f, h] - oP[f, pel]); tr[f] = A @ oR[f, h]
                    TwoBoneIk(T2, Q2, "R", tp, tr, Rw, Pw)
                    Rw, Pw = Fk(T2, Q2)
                    info["rightHand"] = "IK onto the old grip (pelvis frame)"
                o0, B0 = BasisFromWeapon(W[0])
                cands = ["Bip001 Spine2"] if state == "slungBack" else ["Bip001 R Hand", "Bip001 L Hand", "Bip001 Spine2", "Bip001 Pelvis"]
                bone = min(cands, key=lambda b: np.linalg.norm(oPw[0, BI[b]] - o0) * (0.5 if "Hand" in b else 1))
                j = BI[bone]
                relO = oRw[0, j].T @ (o0 - oPw[0, j]); relB = oRw[0, j].T @ B0
                rows = []
                for f in range(F):
                    vis = W[min(f, len(W) - 1), stride - 1]
                    rows += WeaponRow(Rw[f, j] @ relO + Pw[f, j], Rw[f, j] @ relB, vis)
                props["weapon"] = {"stride": stride, "values": [round(float(x), 5) for x in rows]}
                info["weapon"] = f"rigid to {bone}"
        vals = np.concatenate([T2, Q2], axis=2)
        assert np.isfinite(vals).all(), name
        clipRec = {"duration": round(dur, 4), "loop": loop, "weaponHold": oldRow.get("weaponHold", oldMeta.get("weaponHold", "free")),
                   "frameCount": F, "values": [round(float(x), 6) for x in vals.reshape(-1)], "endLift": oldRow.get("endLift", 0)}
        if props: clipRec["props"] = props
        record["clips"][outName] = clipRec
        meta = {k: v for k, v in oldMeta.items() if k not in ("bake", "events", "contacts")}
        meta["duration"] = round(dur, 4)
        if "holdLoop" in info: meta["holdLoop"] = info["holdLoop"]
        if ref: meta["referenceSpeedMps"] = round(max(speed, 0.5), 3)
        meta["source"] = {"kimodo": spec["model"], "prompt": row["prompt"], "seed": row["seed"], "sample": sample,
                          "raw": f"tmp/KimodoPreviz/{name}/{npz.name}", "rawSha256": hashlib.sha256(npz.read_bytes()).hexdigest(),
                          "replaces": f"{row['library']}/{name}", **{k: v for k, v in info.items() if k != "sample"}}
        meta["notes"] = f"Kimodo text-to-motion (replaces the hand-keyed {row['library']} clip). Old intent: {oldMeta.get('notes', '')}"
        manifest["clips"][outName] = meta
        _, Pw = Fk(T2, Q2)
        pel = Pw[:, BI["Bip001 Pelvis"]]
        report.append({"clip": outName, "frames": F, "duration": round(dur, 3), **info,
                       "pelvisY": [round(float(pel[:, 1].min()), 3), round(float(pel[:, 1].max()), 3)],
                       "pelvisXZDrift": round(float(np.linalg.norm(pel[-1, [0, 2]] - pel[0, [0, 2]])), 3)})
        print(json.dumps(report[-1]), flush=True)

args.out.mkdir(parents=True, exist_ok=True)
recName = "Animation_TengxianNra02PrevizKimodo.json" if not args.all_samples else "Animation_TengxianNra02PrevizKimodoSamples.json"
recPath = args.out / recName
recPath.write_text(json.dumps(record, separators=(",", ":")), encoding="utf-8")
manifest["models"] = [{"id": "TengxianNra02", "file": recName, "sha256": hashlib.sha256(recPath.read_bytes()).hexdigest(),
                       "originalModelSha256": record["originalModelSha256"], "contactPoints": {}, "clips": report}]
manName = "Data_PrevizKimodoAnimation.json" if not args.all_samples else "Data_PrevizKimodoSamplesAnimation.json"
(args.out / manName).write_text(json.dumps(manifest, indent=1, ensure_ascii=False), encoding="utf-8")
print("wrote", recPath, len(record["clips"]), "clips")
