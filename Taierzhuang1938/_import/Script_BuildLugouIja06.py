"""Build Model_LugouIja06.glb, the standard IJA rifleman (user request 2026-09-24).

Derived from the shipped Model_LugouIja02.glb inside Blender (run through BlenderMCP):
  * Head (primitive 0): topology-preserving reshape in the head frame (Biped: X up,
    Y forward, Z to the character's left; centimetres), a gaunt long face after the
    user's reference photo: longer chin, narrower jaw, hollow cheeks under high
    cheekbones, lower and heavier brow, narrower eyes, a nasolabial crease. Vertex
    order, triangles, UVs and skin weights are unchanged; normals and tangents follow
    the deformation's Jacobian.
  * Face texture (material "Material #48"): yellow-brown rough skin, a short
    toothbrush moustache, blue-grey stubble on lip, chin and jaw, darker eye sockets
    and nasolabial folds. Painted procedurally from the head-local position of every
    texel (UV rasterisation), so it registers on the game UVs.
  * Hand/neck skin ("Material #25") tinted to the same tone.
  * Headgear (primitive 2 tail, uniform atlas "Material #55"): the Type 90 helmet and
    its havelock are removed and replaced by a Type 98 cloth field cap (soft crown,
    short visor, front star) fitted to the reshaped head. Its texels reuse the
    helmet's atlas rectangle, repainted as khaki wool with seams and a brass star.
Everything else (skeleton, sockets, uniform, equipment) is identical to IJA02, so the
IJA02 clip libraries apply unchanged (Data_CharacterSelection
CHARACTER_CLIP_SOURCE_BY_MODEL).

Run inside Blender (node scripts/Script_BlenderMcp.mjs exec --file <wrapper>):
    IJA06_BUILD = {'repo': <worktree>, 'save': <.blend or None>, 'preview': <png dir or None>,
                   'write': True, 'work': <temp dir or None>}
    exec(compile(open(path).read(), path, 'exec'))
Source project: OneDrive/AI/Models/Blender/Taierzhuang1938/Characters_20260924/Scene_LugouIja06.blend
"""
import bpy, json, math, os, tempfile, importlib.util
import numpy as np
from mathutils import Vector

BASE = 'Model_LugouIja02.glb'
OUTPUT = 'Model_LugouIja06.glb'
HEAD = 'Bip001 Head'
HEAD_PRIM, UNIFORM_PRIM = 0, 2
HELMET_FIRST_VERTEX = 4787          # IJA02 prim 2: havelock flaps, band and helmet are the tail
FACE_MATERIAL, SKIN_MATERIAL, UNIFORM_MATERIAL = 'Material #48', 'Material #25', 'Material #55'
CAP_RECT = (0.729, 0.214, 0.996, 0.489)   # helmet texels in the uniform atlas (u0, v0, u1, v1)
KHAKI = (.53, .47, .31)

# Head-local landmarks of the IJA02 head (Script_AuthorCharacterFacial.Landmarks).
LIP_LINE, MID_Z = 4.4, -0.2
EYES = [(10.31, 7.64, 2.63), (10.36, 7.75, -2.99)]

# Reshape (cm). Moderate: the lip loop stays where the IJA02 face rig measured it.
SHAPE = {
    'chinDrop': .75, 'jawNarrow': .10, 'faceNarrow': .035,
    'cheekHollow': .55, 'cheekbone': .32, 'browDown': .32, 'browForward': .28,
    'upperLidDown': .20, 'lowerLidUp': .06, 'crease': .14,
}
# Cap (cm, head frame).
CAP = {'segments': 32, 'bandFront': 13.6, 'bandBack': 11.6, 'ease': .38, 'crownTop': 22.5,
       'crownBackDrop': .9, 'flare': .05, 'visorLength': 5.0, 'visorDrop': 1.6, 'visorSpan': 68.0,
       'visorThickness': .22, 'starRadius': .95, 'starHeight': 1.7}


def Smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def Gauss(d2, sigma):
    return np.exp(-d2 / (2 * sigma * sigma))


def Load(repo):
    path = os.path.join(repo, 'Taierzhuang1938', '_import', 'Script_AuthorCharacterFacial.py')
    spec = importlib.util.spec_from_file_location('Script_AuthorCharacterFacial', path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


# ---------------------------------------------------------------- head reshape

def CreaseDistance(x, az):
    """Distance (cm, in the X/|Z| plane) to the nasolabial line, and which side of it."""
    path = np.array([[6.3, 1.85], [5.2, 2.55], [4.0, 3.05], [2.9, 3.25]])
    px = np.stack([x, az], -1)
    d = np.full(x.shape, np.inf); side = np.zeros(x.shape)
    for a, b in zip(path[:-1], path[1:]):
        ab = b - a; t = np.clip(((px - a) @ ab) / (ab @ ab), 0, 1)
        dd = np.linalg.norm(px - (a + t[..., None] * ab), axis=-1)
        closer = dd < d; d = np.where(closer, dd, d)
        side = np.where(closer, ab[0] * (px[..., 1] - a[1]) - ab[1] * (px[..., 0] - a[0]), side)
    return d, side


def Deform(L, s=SHAPE):
    """Head-local cm -> reshaped head-local cm (smooth, position-only: seams stay welded)."""
    x, y, z = L[:, 0], L[:, 1], L[:, 2]
    az = np.abs(z - MID_Z)
    out = L.copy()
    front = Smooth(-3.0, 3.0, y)
    lower = Smooth(5.6, 1.6, x) * Smooth(-7.5, -3.0, x)
    out[:, 0] -= s['chinDrop'] * lower * Smooth(-5.0, 2.0, y)                 # longer chin
    jaw = Smooth(8.8, 3.2, x) * Smooth(-7.5, -2.0, x) * Smooth(-6.0, 1.0, y)
    face = Smooth(-6.0, -1.0, x) * Smooth(16.0, 12.0, x) * Smooth(-4.0, 2.0, y)
    out[:, 2] -= (z - MID_Z) * (s['jawNarrow'] * jaw + s['faceNarrow'] * face)  # narrow jaw/face
    radial = np.stack([np.zeros_like(x), y - 1.0, z - MID_Z], 1)
    radial /= np.maximum(np.linalg.norm(radial, axis=1, keepdims=True), 1e-6)
    hollow = Gauss((x - 5.6) ** 2 + (az - 4.7) ** 2 * .8 + (y - 7.6) ** 2 * .6, 1.55) * front
    bone = Gauss((x - 8.9) ** 2 * 1.4 + (az - 5.3) ** 2 + (y - 6.4) ** 2 * .5, 1.25) * front
    out += radial * (-s['cheekHollow'] * hollow + s['cheekbone'] * bone)[:, None]
    brow = Gauss((x - 12.4) ** 2, .95) * Smooth(5.6, 3.4, az) * Smooth(6.0, 8.5, y)
    out[:, 0] -= s['browDown'] * brow
    out[:, 1] += s['browForward'] * brow
    d, _ = CreaseDistance(x, az)
    out += radial * (-s['crease'] * Gauss(d * d, .32) * (y > 7.0))[:, None]
    for ex, ey, ez in EYES:                                                      # narrower eyes
        r = np.sqrt((x - ex) ** 2 + (z - ez) ** 2)
        near = Smooth(2.5, 1.3, r) * Smooth(ey - .2, ey + 1.0, y)
        up = Smooth(ex + .1, ex + .7, x); down = Smooth(ex - .1, ex - .7, x)
        out[:, 0] += (-s['upperLidDown'] * up + s['lowerLidUp'] * down) * near
    return out


def DeformJacobian(L, h=.01):
    J = np.zeros((len(L), 3, 3))
    for k in range(3):
        e = np.zeros(3); e[k] = h
        J[:, :, k] = (Deform(L + e) - Deform(L - e)) / (2 * h)
    return J


# ---------------------------------------------------------------- cap

def HeadRadius(points, center, theta, x0, x1, wedge=.30):
    """Max horizontal distance from the skull axis within an angular wedge and height band."""
    d = points[:, 1:] - center
    ang = np.arctan2(d[:, 1], d[:, 0])
    diff = np.abs((ang - theta + np.pi) % (2 * np.pi) - np.pi)
    sel = (diff < wedge) & (points[:, 0] >= x0) & (points[:, 0] <= x1)
    return float(np.linalg.norm(d[sel], axis=1).max()) if sel.any() else 0.0


def SkullCenter(head):
    """(y, z) of the skull axis: middle of the cranium's front-back and side extent."""
    band = head[(head[:, 0] > 14.0) & (head[:, 0] < 19.0)]
    return np.array([(band[:, 1].max() + band[:, 1].min()) / 2, (band[:, 2].max() + band[:, 2].min()) / 2])


def BandX(theta, c=CAP):
    return c['bandBack'] + (c['bandFront'] - c['bandBack']) * (np.cos(theta) * .5 + .5)


def BuildCap(head, c=CAP):
    """Type 98 field cap around the reshaped head (head-local cm): list of
    (label, positions, uv, triangles) with uv inside CAP_RECT, plus fit info."""
    top = head[head[:, 0] > 11.0]
    center = SkullCenter(head)
    u0, v0, u1, v1 = CAP_RECT
    N = c['segments']
    thetas = np.linspace(-np.pi, np.pi, N + 1)  # seam at the back
    ring0 = np.array([(BandX(th), HeadRadius(top, center, th, BandX(th) - .3, BandX(th) + 4.0) + c['ease'])
                      for th in thetas])
    r = ring0[:, 1].copy()
    for _ in range(3): r = (np.roll(r, 1) + 2 * r + np.roll(r, -1)) / 4
    r[-1] = r[0]; ring0[:, 1] = r
    skullTop = float(head[:, 0].max())
    levels = [0.0, .30, .55, .78, .93, 1.0]
    flares = [0.0, .012, .040, .070, .068, .030]
    wall = np.array([[(BandX(th) + (c['crownTop'] - c['crownBackDrop'] * (.5 - np.cos(th) * .5) - BandX(th)) * f,
                       center[0] + ring0[k, 1] * (1 + fl + c['flare'] * f * (np.cos(th) * .5 + .5)) * math.cos(th),
                       center[1] + ring0[k, 1] * (1 + fl + c['flare'] * f * (np.cos(th) * .5 + .5)) * math.sin(th))
                      for k, th in enumerate(thetas)] for f, fl in zip(levels, flares)])
    # Clearance: every wall ring must stay outside the skull at its own height.
    worst = 99.0
    for li in range(1, len(levels)):
        for k, th in enumerate(thetas[:-1]):
            xx = wall[li, k, 0]; rr = np.linalg.norm(wall[li, k, 1:] - center)
            hr = HeadRadius(head, center, th, xx - .6, xx + .6)
            if hr: worst = min(worst, rr - hr)
    parts = []

    def WallU(th):  # front half of the wall gets 64 % of the strip (texel density where it is seen)
        return np.interp((th + np.pi) / (2 * np.pi), [0, .25, .75, 1], [0, .18, .82, 1])
    wu0, wu1, wv0, wv1 = u0 + .006, u1 - .006, v0 + .006, v0 + .150
    P, UV, T = [], [], []
    for li in range(len(levels)):
        for k, th in enumerate(thetas):
            P.append(wall[li, k]); UV.append((wu0 + (wu1 - wu0) * WallU(th), wv1 - (wv1 - wv0) * levels[li]))
    W = N + 1
    for li in range(len(levels) - 1):
        for k in range(N):
            a, b, cc, d = li * W + k, li * W + k + 1, (li + 1) * W + k + 1, (li + 1) * W + k
            T += [(a, b, cc), (a, cc, d)]
    parts.append(('wall', np.array(P), np.array(UV), np.array(T)))
    # Crown top: edge ring (own vertices), two inner rings, centre; slightly domed.
    edge = wall[-1, :-1]; mid = edge.mean(0)
    reach = np.linalg.norm((edge - mid)[:, 1:], axis=1).max()
    tu, tv, tr = u0 + .075, v0 + .225, .062
    P, UV, T = [], [], []
    rings = [(1.0, 0.0), (.62, .35), (.28, .55)]
    for scale, lift in rings:
        for k in range(N):
            p = mid + (edge[k] - mid) * scale; p = p.copy(); p[0] += lift
            rel = (edge[k] - mid)[1:] / reach
            P.append(p); UV.append((tu + rel[1] * tr * scale, tv - rel[0] * tr * scale))
    P.append(mid + np.array([.62, 0, 0])); UV.append((tu, tv))
    for ri in range(len(rings) - 1):
        for k in range(N):
            a, b = ri * N + k, ri * N + (k + 1) % N; cc, d = (ri + 1) * N + (k + 1) % N, (ri + 1) * N + k
            T += [(a, cc, b), (a, d, cc)]
    ci = len(P) - 1; last = (len(rings) - 1) * N
    for k in range(N): T.append((last + k, ci, last + (k + 1) % N))
    for p in P:  # the top must clear the skull directly below it
        near = np.linalg.norm(head[:, 1:] - p[1:], axis=1) < 1.2
        if near.any(): worst = min(worst, float(p[0] - head[near, 0].max()))
    parts.append(('top', np.array(P), np.array(UV), np.array(T)))
    # Visor: crescent from the band bottom, drooping forward; top, underside, front edge.
    span = math.radians(c['visorSpan']); M = 14
    inner, outer = [], []
    for th in np.linspace(-span, span, M + 1):
        rr = float(np.interp(th, thetas, ring0[:, 1]))
        base = np.array([BandX(th) + .05, center[0] + rr * math.cos(th), center[1] + rr * math.sin(th)])
        length = c['visorLength'] * math.sqrt(max(math.cos(th / span * math.pi / 2), 0.0))
        tip = base + np.array([0.0, math.cos(th), math.sin(th)]) * length
        tip[0] -= c['visorDrop'] * (length / c['visorLength'])
        inner.append(base); outer.append(tip)
    inner = np.array(inner); outer = np.array(outer); t = c['visorThickness']
    for label, dx, (vu0, vv0, vu1, vv1) in (('visorTop', 0.0, (u0 + .150, v0 + .168, u1 - .006, v0 + .208)),
                                             ('visorBottom', -t, (u0 + .150, v0 + .214, u1 - .006, v0 + .254))):
        P, UV, T = [], [], []
        for row, pts in ((0, inner), (1, outer)):
            for k in range(M + 1):
                p = pts[k].copy(); p[0] += dx
                P.append(p); UV.append((vu0 + (vu1 - vu0) * k / M, vv0 + (vv1 - vv0) * row))
        for k in range(M):
            a, b, cc, d = k, k + 1, M + 1 + k + 1, M + 1 + k
            T += [(a, b, cc), (a, cc, d)]
        parts.append((label, np.array(P), np.array(UV), np.array(T)))
    P, UV, T = [], [], []
    eu0, ev0, eu1, ev1 = u0 + .150, v0 + .258, u1 - .006, v0 + .268
    for row, dx in ((0, 0.0), (1, -t)):
        for k in range(M + 1):
            p = outer[k].copy(); p[0] += dx; P.append(p); UV.append((eu0 + (eu1 - eu0) * k / M, ev0 + (ev1 - ev0) * row))
    for k in range(M):
        a, b, cc, d = k, k + 1, M + 1 + k + 1, M + 1 + k
        T += [(a, b, cc), (a, cc, d)]
    parts.append(('visorEdge', np.array(P), np.array(UV), np.array(T)))
    # Star: flat five-point star on the wall front, a hair proud of the cloth.
    k0 = int(np.argmin(np.abs(thetas)))
    fx = BandX(0.0) + c['starHeight']
    li = int(min(max(np.searchsorted(wall[:, k0, 0], fx), 1), len(levels) - 1))
    f = (fx - wall[li - 1, k0, 0]) / (wall[li, k0, 0] - wall[li - 1, k0, 0])
    anchor = wall[li - 1, k0] * (1 - f) + wall[li, k0] * f + np.array([0.0, .12, 0.0])
    su, sv, sr = u0 + .140, v0 + .262, .0035
    P = [anchor + np.array([0.0, .03, 0.0])]; UV = [(su, sv)]
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5; rad = c['starRadius'] * (1.0 if i % 2 == 0 else .40)
        P.append(anchor + np.array([rad * math.sin(a), 0.0, rad * math.cos(a)]))
        UV.append((su + sr * math.cos(a), sv + sr * math.sin(a)))
    T = [(0, 1 + i, 1 + (i + 1) % 10) for i in range(10)]
    parts.append(('star', np.array(P), np.array(UV), np.array(T)))
    assert worst > .15, ('cap intersects the head', worst)
    return parts, {'center': center.tolist(), 'skullTop': skullTop, 'starRect': (su, sv, sr),
                   'minClearanceCm': round(float(worst), 3)}


def Orient(P, T, out):
    """Wind triangles so their normal agrees with `out` (a vector, or a per-triangle function)."""
    T = np.array(T).copy()
    for i, (a, b, c) in enumerate(T):
        n = np.cross(P[b] - P[a], P[c] - P[a])
        o = out((P[a] + P[b] + P[c]) / 3) if callable(out) else out
        if n @ o < 0: T[i] = (a, c, b)
    return T


def VertexNormals(P, T):
    N = np.zeros_like(P)
    for a, b, c in T:
        n = np.cross(P[b] - P[a], P[c] - P[a]); N[a] += n; N[b] += n; N[c] += n
    return N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)


def Tangents(P, UV, T, Nrm):
    tan = np.zeros_like(P); bit = np.zeros_like(P)
    for a, b, c in T:
        e1, e2 = P[b] - P[a], P[c] - P[a]; d1, d2 = UV[b] - UV[a], UV[c] - UV[a]
        det = d1[0] * d2[1] - d2[0] * d1[1]
        if abs(det) < 1e-12: continue
        r = 1 / det; t = (e1 * d2[1] - e2 * d1[1]) * r; bb = (e2 * d1[0] - e1 * d2[0]) * r
        for i in (a, b, c): tan[i] += t; bit[i] += bb
    tan -= Nrm * (tan * Nrm).sum(1, keepdims=True)
    good = np.linalg.norm(tan, axis=1) > 1e-9
    fallback = np.cross(Nrm, [1.0, 0, 0]); tan[~good] = fallback[~good]
    tan /= np.maximum(np.linalg.norm(tan, axis=1, keepdims=True), 1e-9)
    w = np.where((np.cross(Nrm, tan) * bit).sum(1) < 0, -1.0, 1.0)
    return np.c_[tan, w]


# ---------------------------------------------------------------- texture painting

def Rasterize(uv, pos, tris, width, height, vOffset=0.0):
    """Per-texel interpolated position (top-down rows, glTF uv). Returns (pos map, mask)."""
    out = np.zeros((height, width, 3), np.float32); mask = np.zeros((height, width), bool)
    px = np.c_[uv[:, 0] * width - .5, (uv[:, 1] - vOffset) * height - .5]
    for a, b, c in tris:
        pa, pb, pc = px[a], px[b], px[c]
        x0 = max(int(math.floor(min(pa[0], pb[0], pc[0]))) - 1, 0); x1 = min(int(math.ceil(max(pa[0], pb[0], pc[0]))) + 1, width - 1)
        y0 = max(int(math.floor(min(pa[1], pb[1], pc[1]))) - 1, 0); y1 = min(int(math.ceil(max(pa[1], pb[1], pc[1]))) + 1, height - 1)
        if x1 < x0 or y1 < y0: continue
        d = (pb[1] - pc[1]) * (pa[0] - pc[0]) + (pc[0] - pb[0]) * (pa[1] - pc[1])
        if abs(d) < 1e-12: continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        l1 = ((pb[1] - pc[1]) * (gx - pc[0]) + (pc[0] - pb[0]) * (gy - pc[1])) / d
        l2 = ((pc[1] - pa[1]) * (gx - pc[0]) + (pa[0] - pc[0]) * (gy - pc[1])) / d
        l3 = 1 - l1 - l2
        inside = (l1 >= -.02) & (l2 >= -.02) & (l3 >= -.02)
        if not inside.any(): continue
        p = l1[..., None] * pos[a] + l2[..., None] * pos[b] + l3[..., None] * pos[c]
        out[gy[inside], gx[inside]] = p[inside]; mask[gy[inside], gx[inside]] = True
    return out, mask


def Noise(shape, seed, scale):
    """Value noise (bilinear upsampled random grid), 0..1; `scale` is the cell size in texels."""
    rng = np.random.default_rng(seed)
    h, w = shape; gh, gw = max(int(h / scale), 2) + 2, max(int(w / scale), 2) + 2
    g = rng.random((gh, gw)).astype(np.float32)
    ys = np.linspace(0, gh - 2.001, h); xs = np.linspace(0, gw - 2.001, w)
    y0 = ys.astype(int); x0 = xs.astype(int); fy = (ys - y0)[:, None].astype(np.float32); fx = (xs - x0)[None, :].astype(np.float32)
    a = g[y0][:, x0]; b = g[y0][:, x0 + 1]; c = g[y0 + 1][:, x0]; d = g[y0 + 1][:, x0 + 1]
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy


def Dilate(rgb, mask, steps=6):
    """Bleed painted texels over the mask border (mip/bilinear safety)."""
    rgb = rgb.copy(); m = mask.copy()
    for _ in range(steps):
        acc = np.zeros_like(rgb); cnt = np.zeros(m.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sm = np.roll(m, (dy, dx), (0, 1)); acc += np.roll(rgb, (dy, dx), (0, 1)) * sm[..., None]; cnt += sm
        grow = (~m) & (cnt > 0)
        rgb[grow] = acc[grow] / cnt[grow][:, None]; m |= grow
    return rgb, m


def Sallow(rgb, amount=.45):
    lum = rgb @ np.array([.30, .59, .11], np.float32)
    return rgb * (1 - amount) + (lum[..., None] / .52) * np.array([.64, .49, .34], np.float32) * amount


def PaintFace(rgb, posMap, mask):
    """rgb: HxWx3 sRGB 0..1 (top-down). posMap: head-local cm of the reshaped head."""
    h, w, _ = rgb.shape
    x, y, z = posMap[..., 0], posMap[..., 1], posMap[..., 2]
    az = np.abs(z - MID_Z)
    base = Sallow(rgb)
    base *= (.94 + .10 * (Noise((h, w), 7, 22) * .6 + Noise((h, w), 8, 5) * .4))[..., None]
    base *= (.96 + .06 * Noise((h, w), 9, 1.6))[..., None]
    out = base
    for ex, ey, ez in EYES:  # eye sockets and under-brow shadow
        sock = np.exp(-(((x - ex) / 1.9) ** 2 + ((z - ez) / 2.3) ** 2) * 1.4) * (y > 5.0)
        under = np.exp(-(((x - (ex - 1.3)) / .75) ** 2 + ((z - ez) / 1.9) ** 2)) * (y > 5.0)
        out = out * (1 - .26 * sock - .16 * under)[..., None]
    hollow = np.exp(-(((x - 5.6) / 1.4) ** 2 + ((az - 4.6) / 1.5) ** 2)) * (y > 3.0)
    out = out * (1 - .15 * hollow)[..., None]
    d, side = CreaseDistance(x, az)
    front = (y > 7.0)
    out = out * (1 - .38 * np.exp(-(d / .16) ** 2) * front)[..., None]
    out = out * (1 + .06 * np.exp(-((d - .45) / .3) ** 2) * (side > 0) * front)[..., None]
    beard = (Smooth(7.2, 5.4, x) * Smooth(-5.5, -2.0, x) * Smooth(7.2, 5.8, az + (x - 3.0) * .25) * Smooth(-1.0, 3.0, y))
    lips = Smooth(1.0, .5, np.abs(x - LIP_LINE)) * Smooth(2.6, 1.9, az) * (y > 9.0)
    beard *= 1 - lips
    dots = (Noise((h, w), 21, 1.2) > .58).astype(np.float32) * .6 + Noise((h, w), 22, 3.0) * .4
    stubble = beard * (.30 + .30 * dots)
    out = out * (1 - stubble[..., None]) + np.array([.19, .19, .20], np.float32) * stubble[..., None]
    # Thin line moustache along the upper lip, tapering to the mouth corners.
    lipTop = LIP_LINE + .45 + .10 * (az / 2.2) ** 2
    thick = .62 * (1 - .55 * (az / 2.3) ** 2)
    must = (Smooth(lipTop - .12, lipTop + .08, x) * Smooth(lipTop + thick + .10, lipTop + thick - .12, x)
            * Smooth(2.45, 1.85, az) * (y > 8.5))
    strands = Noise((h, w), 31, 1.0) * .35 + Noise((h, w), 32, 2.5) * .25 + .55
    mustA = np.clip(must * strands * 1.05, 0, .92)
    out = out * (1 - mustA[..., None]) + np.array([.07, .06, .055], np.float32) * mustA[..., None]
    out = out * (1 - Smooth(.55, .85, Noise((h, w), 41, 40)) * .10)[..., None]
    return np.clip(np.where(mask[..., None], out, rgb), 0, 1)


def PaintCloth(region, pos, m, patch, starBox):
    """Cap texels: khaki wool from a tunic patch looked up by cap-surface coordinates,
    band-top stitching, the top's centre seam and a brass star patch."""
    ph, pw, _ = patch.shape
    ang = np.arctan2(pos[..., 2] - MID_Z, pos[..., 1])
    s = ang * 9.0 * 22; t = pos[..., 0] * 22 + pos[..., 1] * 6
    def Mirror(v, n):
        v = np.mod(v, 2 * n); return np.where(v >= n, 2 * n - 1 - v, v).astype(int).clip(0, n - 1)
    cloth = patch[Mirror(t, ph), Mirror(s, pw)]
    cloth = cloth - patch.reshape(-1, 3).mean(0) + np.array(KHAKI, np.float32)
    seam = np.exp(-(pos[..., 2] - MID_Z) ** 2 / .02) * (pos[..., 0] > 21.0)
    seam += np.exp(-((pos[..., 0] - BandX(ang) - 3.1) ** 2) / .03) * (pos[..., 0] < 21.0)
    cloth = cloth * (1 - .25 * np.clip(seam, 0, 1))[..., None]
    cloth = cloth * (Noise(m.shape, 51, 18) * .10 + .95)[..., None]
    region = np.where(m[..., None], cloth, region)
    y0, y1, x0, x1 = starBox
    region[y0:y1, x0:x1] = np.array([.78, .62, .22], np.float32)
    return np.clip(region, 0, 1)


# ---------------------------------------------------------------- glb io

class ImageIO:
    """Decode/encode GLB images through Blender (WEBP)."""
    def __init__(self, folder): self.folder = folder

    def Decode(self, data, name):
        path = os.path.join(self.folder, name + '.webp'); open(path, 'wb').write(data)
        img = bpy.data.images.load(path, check_existing=False)
        w, h = img.size; px = np.empty(w * h * 4, np.float32); img.pixels.foreach_get(px)
        bpy.data.images.remove(img)
        return np.flipud(px.reshape(h, w, 4)).copy()

    def Encode(self, rgba, name, quality=90):
        h, w, _ = rgba.shape
        img = bpy.data.images.new(name, w, h, alpha=False)
        img.pixels.foreach_set(np.flipud(rgba).astype(np.float32).ravel())
        path = os.path.join(self.folder, name + '.out.webp')
        img.filepath_raw = path; img.file_format = 'WEBP'
        img.save(filepath=path, quality=quality)
        bpy.data.images.remove(img)
        return open(path, 'rb').read()


def ImageOf(doc, materialName):
    for m in doc['materials']:
        if m.get('name') != materialName: continue
        t = doc['textures'][m['pbrMetallicRoughness']['baseColorTexture']['index']]
        return t.get('source', t.get('extensions', {}).get('EXT_texture_webp', {}).get('source'))
    raise KeyError(materialName)


def ImageBytes(glb, index):
    v = glb.doc['bufferViews'][glb.doc['images'][index]['bufferView']]
    start = v.get('byteOffset', 0); return bytes(glb.binary[start:start + v['byteLength']])


def ReplaceImage(glb, index, data):
    binary = glb.binary
    while len(binary) % 4: binary.append(0)
    offset = len(binary); binary.extend(data)
    glb.doc['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(data)})
    glb.doc['images'][index]['bufferView'] = len(glb.doc['bufferViews']) - 1


def WriteAccessor(glb, values, kind, component, normalized=False, target=34962):
    arr = np.ascontiguousarray(values)
    dtype = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}[component]
    data = arr.astype(dtype).tobytes()
    binary = glb.binary
    while len(binary) % 4: binary.append(0)
    offset = len(binary); binary.extend(data)
    view = {'buffer': 0, 'byteOffset': offset, 'byteLength': len(data)}
    if target: view['target'] = target
    glb.doc['bufferViews'].append(view)
    acc = {'bufferView': len(glb.doc['bufferViews']) - 1, 'componentType': component, 'count': int(arr.shape[0]), 'type': kind}
    if normalized: acc['normalized'] = True
    if kind == 'VEC3' and component == 5126:
        acc['min'] = arr.astype(np.float32).min(0).astype(float).tolist(); acc['max'] = arr.astype(np.float32).max(0).astype(float).tolist()
    glb.doc['accessors'].append(acc)
    return len(glb.doc['accessors']) - 1


def ReadRaw(glb, index):
    a = glb.doc['accessors'][index]; v = glb.doc['bufferViews'][a['bufferView']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    dtype = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}[a['componentType']]
    size = np.dtype(dtype).itemsize * n; stride = v.get('byteStride', size)
    start = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    raw = np.frombuffer(bytes(glb.binary[start:start + stride * a['count']]), np.uint8).reshape(a['count'], stride)[:, :size]
    return np.ascontiguousarray(raw).view(dtype).reshape(a['count'], n)


# ---------------------------------------------------------------- build

def Build(job):
    repo = job['repo']
    A = Load(repo); B = A.Baker(repo)
    charDir = os.path.join(repo, 'Taierzhuang1938', 'Model', 'Character')
    glb = B.Glb(os.path.join(charDir, BASE)); doc = glb.doc
    head = glb.World(glb.byName[HEAD]); Hm = np.array(head); Hinv = np.array(head.inverted())
    R = Hm[:3, :3] / np.linalg.norm(Hm[:3, 0]); Rinv = R.T
    work = job.get('work') or tempfile.mkdtemp(prefix='Ija06_')
    os.makedirs(work, exist_ok=True)
    io = ImageIO(work)
    prims = doc['meshes'][0]['primitives']
    report = {'base': BASE, 'output': OUTPUT}
    def ToLocal(P): return P @ Hinv[:3, :3].T + Hinv[:3, 3]
    def ToWorld(L): return L @ Hm[:3, :3].T + Hm[:3, 3]

    # --- head reshape (prim 0)
    p0 = prims[HEAD_PRIM]
    P = ReadRaw(glb, p0['attributes']['POSITION']).astype(np.float64)
    N = ReadRaw(glb, p0['attributes']['NORMAL']).astype(np.float64)
    Tn = ReadRaw(glb, p0['attributes']['TANGENT']).astype(np.float64)
    idx0 = ReadRaw(glb, p0['indices']).ravel().astype(np.int64)
    L = ToLocal(P)
    weld = A.Weld(P); comps = A.Components(weld[idx0], weld.max() + 1)[weld]
    eyeball = np.zeros(len(P), bool)
    for c in np.unique(comps):
        ii = np.where(comps == c)[0]; size = L[ii].max(0) - L[ii].min(0)
        if 1.5 < size[0] < 3.5 and 1.5 < size[2] < 3.5 and abs(L[ii, 0].mean() - 10.3) < 2.5: eyeball[ii] = True
    newL = Deform(L)
    for c in np.unique(comps[eyeball]):   # eyeballs move rigidly with the field at their centre
        ii = np.where(comps == c)[0]; centre = L[ii].mean(0, keepdims=True)
        newL[ii] = L[ii] + (Deform(centre) - centre)
    J = DeformJacobian(L); J[eyeball] = np.eye(3)
    nL = N @ Rinv.T; nL = np.einsum('nji,nj->ni', np.linalg.inv(J), nL)  # J^-T n
    nL /= np.linalg.norm(nL, axis=1, keepdims=True)
    tL = Tn[:, :3] @ Rinv.T; tL = np.einsum('nij,nj->ni', J, tL); tL -= nL * (tL * nL).sum(1, keepdims=True)
    tL /= np.maximum(np.linalg.norm(tL, axis=1, keepdims=True), 1e-9)
    moved = np.linalg.norm(newL - L, axis=1)
    report['head'] = {'vertices': len(P), 'eyeballVertices': int(eyeball.sum()), 'moved': int((moved > .01).sum()),
                      'maxMoveCm': round(float(moved.max()), 3)}
    p0['attributes']['POSITION'] = WriteAccessor(glb, ToWorld(newL), 'VEC3', 5126)
    p0['attributes']['NORMAL'] = WriteAccessor(glb, nL @ R.T, 'VEC3', 5126)
    p0['attributes']['TANGENT'] = WriteAccessor(glb, np.c_[tL @ R.T, Tn[:, 3]], 'VEC4', 5126)

    # --- cap (prim 2 tail)
    p2 = prims[UNIFORM_PRIM]
    attrs = {k: ReadRaw(glb, v) for k, v in p2['attributes'].items()}
    idx2 = ReadRaw(glb, p2['indices']).ravel().astype(np.int64).reshape(-1, 3)
    keep = (idx2 < HELMET_FIRST_VERTEX).all(1)
    dropped = int((~keep).sum()); idx2 = idx2[keep]
    u0, v0, u1, v1 = CAP_RECT
    used = np.unique(idx2.ravel()); uvUsed = attrs['TEXCOORD_0'][used]
    clash = (uvUsed[:, 0] > u0) & (uvUsed[:, 0] < u1) & (uvUsed[:, 1] > v0) & (uvUsed[:, 1] < v1)
    assert not clash.any(), ('uniform texels inside the cap rectangle', int(clash.sum()))
    parts, capInfo = BuildCap(newL)
    headJoint = [doc['nodes'][j]['name'] for j in doc['skins'][0]['joints']].index(HEAD)
    center = capInfo['center']
    outward = {'star': np.array([0.0, 1.0, 0.0]), 'visorTop': np.array([1.0, 0.0, 0.0]),
               'visorBottom': np.array([-1.0, 0.0, 0.0]), 'top': np.array([1.0, 0.0, 0.0])}
    capP, capN, capUV, capT, tris, local = [], [], [], [], [], []
    count = 0
    for label, Pp, UVp, Tp in parts:
        if label in outward: Tp = Orient(Pp, Tp, outward[label])
        else: Tp = Orient(Pp, Tp, lambda cen: np.array([0.0, cen[1] - center[0], cen[2] - center[1]]))
        Np = VertexNormals(Pp, Tp)
        tris.append(Tp + HELMET_FIRST_VERTEX + count); local.append(Tp + count); count += len(Pp)
        capP.append(Pp); capN.append(Np); capUV.append(UVp); capT.append(Tangents(Pp, UVp, Tp, Np))
    capP = np.vstack(capP); capN = np.vstack(capN); capUV = np.vstack(capUV); capT = np.vstack(capT)
    newTris = np.vstack(tris); localTris = np.vstack(local); n = len(capP)
    out = {}
    for k, arr in attrs.items():
        if k == 'POSITION': tail = ToWorld(capP)
        elif k == 'NORMAL': tail = capN @ R.T
        elif k == 'TANGENT': tail = np.c_[capT[:, :3] @ R.T, capT[:, 3]]
        elif k == 'TEXCOORD_0': tail = capUV
        elif k == 'JOINTS_0': tail = np.zeros((n, arr.shape[1])); tail[:, 0] = headJoint
        elif k == 'WEIGHTS_0':
            tail = np.zeros((n, arr.shape[1])); tail[:, 0] = 1.0 if arr.dtype == np.float32 else np.iinfo(arr.dtype).max
        else: tail = np.repeat(arr[HELMET_FIRST_VERTEX:HELMET_FIRST_VERTEX + 1], n, 0)
        out[k] = np.vstack([arr[:HELMET_FIRST_VERTEX], tail.astype(arr.dtype)])
    for k, arr in out.items():
        a = doc['accessors'][p2['attributes'][k]]
        kind = {1: 'SCALAR', 2: 'VEC2', 3: 'VEC3', 4: 'VEC4'}[arr.shape[1]]
        p2['attributes'][k] = WriteAccessor(glb, arr, kind, a['componentType'], a.get('normalized', False))
    p2['indices'] = WriteAccessor(glb, np.vstack([idx2, newTris]).astype(np.uint32).reshape(-1, 1), 'SCALAR', 5125, target=34963)
    report['cap'] = {'vertices': n, 'triangles': int(len(newTris)), 'droppedHelmetTriangles': dropped,
                     'skullTopCm': round(capInfo['skullTop'], 2), 'minClearanceCm': capInfo['minClearanceCm']}

    # --- textures
    faceIndex = ImageOf(doc, FACE_MATERIAL); face = io.Decode(ImageBytes(glb, faceIndex), 'face')
    fh, fw, _ = face.shape
    uv0 = ReadRaw(glb, p0['attributes']['TEXCOORD_0']).astype(np.float64)
    vOff = math.floor(float(uv0[:, 1].min()) + 1e-6)
    tri0 = idx0.reshape(-1, 3)
    posMap, mask = Rasterize(uv0, newL, tri0[~eyeball[tri0].any(1)], fw, fh, vOff)
    face[..., :3] = PaintFace(face[..., :3], posMap, mask)
    ReplaceImage(glb, faceIndex, io.Encode(face, 'Ija06Face'))
    skinIndex = ImageOf(doc, SKIN_MATERIAL); skin = io.Decode(ImageBytes(glb, skinIndex), 'skin')
    skin[..., :3] = np.clip(Sallow(skin[..., :3]), 0, 1)
    ReplaceImage(glb, skinIndex, io.Encode(skin, 'Ija06Skin'))
    atlasIndex = ImageOf(doc, UNIFORM_MATERIAL); atlas = io.Decode(ImageBytes(glb, atlasIndex), 'atlas')
    ah, aw, _ = atlas.shape
    patch = atlas[int(.17 * ah):int(.46 * ah), int(.51 * aw):int(.71 * aw), :3].copy()  # tunic wool
    capMap, capMask = Rasterize(capUV, capP, localTris, aw, ah, 0.0)
    X0, Y0, X1, Y1 = int(u0 * aw), int(v0 * ah), int(math.ceil(u1 * aw)), int(math.ceil(v1 * ah))
    su, sv, sr = capInfo['starRect']
    starBox = (int((sv - sr * 1.8) * ah) - Y0, int((sv + sr * 1.8) * ah) + 1 - Y0,
               int((su - sr * 1.8) * aw) - X0, int((su + sr * 1.8) * aw) + 1 - X0)
    region = PaintCloth(atlas[Y0:Y1, X0:X1, :3].copy(), capMap[Y0:Y1, X0:X1], capMask[Y0:Y1, X0:X1], patch, starBox)
    m = capMask[Y0:Y1, X0:X1].copy(); m[starBox[0]:starBox[1], starBox[2]:starBox[3]] = True
    region, grown = Dilate(region, m, 24)
    region[~grown] = np.array(KHAKI, np.float32)
    atlas[Y0:Y1, X0:X1, :3] = region
    ReplaceImage(glb, atlasIndex, io.Encode(atlas, 'Ija06Atlas'))

    # --- write
    for node in doc['nodes']:
        if node.get('name') == 'Character_LugouIja02': node['name'] = 'Character_LugouIja06'
    glb.Compact()
    doc.setdefault('extras', {})['lugouVariant'] = {
        'id': 'LugouIja06', 'derivedFrom': BASE, 'builder': '_import/Script_BuildLugouIja06.py',
        'approved': '2026-09-24', 'shape': SHAPE, 'cap': dict(CAP)}
    if job.get('write', True):
        path = os.path.join(charDir, OUTPUT); open(path, 'wb').write(glb.Encode()); report['bytes'] = os.path.getsize(path)
    if job.get('save') or job.get('preview'): report['scene'] = BuildScene(job)
    print(json.dumps(report))
    return report


def BuildScene(job):
    """Blender scene of the shipped result, for review renders and the saved source project."""
    path = os.path.join(job['repo'], 'Taierzhuang1938', 'Model', 'Character', OUTPUT)
    sceneName = 'Scene_LugouIja06'
    if sceneName in bpy.data.scenes:
        old = bpy.data.scenes[sceneName]
        for o in list(old.objects): bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.scenes.remove(old)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.armatures, bpy.data.cameras, bpy.data.lights):
        for b in list(coll):
            if b.users == 0: coll.remove(b)
    scene = bpy.data.scenes.new(sceneName)
    if bpy.context.window: bpy.context.window.scene = scene
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    for o in set(bpy.data.objects) - before:
        if o.type == 'MESH' and not o.data.materials: o.hide_render = True  # importer's bone shape
        for c in list(o.users_collection): c.objects.unlink(o)
        scene.collection.objects.link(o)
        if o.type == 'ARMATURE': o.data.pose_position = 'REST'; o.animation_data_clear()
    result = {'objects': len(scene.objects)}
    if job.get('preview'): result['previews'] = Preview(scene, job['preview'], 'Ija06')
    if job.get('save'):
        os.makedirs(os.path.dirname(job['save']), exist_ok=True)
        bpy.data.libraries.write(job['save'], {scene}, fake_user=True, compress=True)
        result['saved'] = job['save']
    return result


def Preview(scene, folder, label):
    os.makedirs(folder, exist_ok=True)
    cam = bpy.data.objects.new('Camera_' + label, bpy.data.cameras.new('Camera_' + label)); scene.collection.objects.link(cam)
    scene.camera = cam
    for name, energy, rot in (('Key', 3.0, (68, 0, -28)), ('Fill', 1.0, (75, 0, 150))):
        light = bpy.data.objects.new('%s_%s' % (name, label), bpy.data.lights.new('%s_%s' % (name, label), 'SUN'))
        scene.collection.objects.link(light); light.data.energy = energy
        light.rotation_euler = tuple(math.radians(a) for a in rot)
    if scene.world is None: scene.world = bpy.data.worlds.new('World_' + label)
    scene.world.use_nodes = True; scene.world.node_tree.nodes['Background'].inputs[1].default_value = .35
    scene.render.engine = 'BLENDER_EEVEE'
    scene.view_settings.view_transform = 'Standard'
    scene.render.resolution_x = 640; scene.render.resolution_y = 640
    out = []
    shots = [('HeadFront', (0, 0, 1.60), (0, -.78, .02), 85), ('HeadThreeQuarter', (0, 0, 1.60), (-.52, -.58, .03), 85),
             ('HeadSide', (0, 0, 1.60), (-.78, 0, .02), 85), ('FaceClose', (0, -.08, 1.55), (-.10, -.42, .0), 85),
             ('EyesClose', (0, -.08, 1.63), (0, -.34, -.03), 85),
             ('Body', (0, 0, .9), (-.9, -4.0, .2), 50)]
    for name, target, offset, lens in shots:
        cam.data.lens = lens
        cam.location = Vector(target) + Vector(offset)
        cam.rotation_euler = (Vector(target) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        p = os.path.join(folder, 'Preview_%s_%s.png' % (label, name)); scene.render.filepath = p
        bpy.ops.render.render(write_still=True, scene=scene.name); out.append(p)
    return out


if 'IJA06_BUILD' in globals():
    IJA06_BUILD_RESULT = Build(IJA06_BUILD)
