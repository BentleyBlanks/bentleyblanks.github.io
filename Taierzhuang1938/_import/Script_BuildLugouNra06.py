"""Build Model_LugouNra06.glb, the first-level interpreter (user request 2026-09-24).

The user's second reference is the classic film image of the collaborator interpreter:
round fat face, small round wire spectacles, one protruding upper front tooth, raised
anxious brows, a soft cap with a star, an open dark Chinese jacket over a white vest.
Derived from the shipped Model_LugouNra02.glb inside Blender (run through BlenderMCP):
  * Head (primitive 0): topology-preserving reshape in the head frame (Biped: X up,
    Y forward, Z to the character's left; centimetres): puffed cheeks, wider jowls,
    a soft double chin, brows lifted more at the inner ends. Vertex order, triangles,
    UVs and weights are unchanged; normals/tangents follow the deformation's Jacobian.
  * Face texture ("Material #9"): heavier, raised brows and a little colour in the
    cheeks, painted from each texel's head position (UV rasterisation).
  * Clothes (atlas "Material #1721585337", renamed "Material_InterpreterGarb" so the
    NRA uniform tint and the opening's cloth dye never touch it): the blue uniform is
    re-dyed as a dark civilian jacket and trousers, a near-black cap, collar tabs gone,
    and a white vest painted down the open jacket front (texels found by body position).
  * The cross strap, belt and hip tool (primitives 3 and 4) are removed; a civilian
    carries no webbing.
  * Cap badge ("Material #1721585500"): the NRA sun is repainted as a pale five-point
    star on cap cloth. The same primitive carries new round wire spectacles (rims,
    bridge, temples to the ears), rigid on the head bone, textured from a metal patch
    painted in a free corner of the badge image.
The buck tooth is facial geometry (Script_AuthorCharacterFacial MODELS['Nra06']
'buckTooth'), so it rides the head with the upper teeth and shows past the lips.
Skeleton and sockets are NRA02's; NRA06 plays NRA02's clip libraries
(Data_CharacterSelection CHARACTER_CLIP_SOURCE_BY_MODEL).

Run inside Blender (node scripts/Script_BlenderMcp.mjs exec --file <wrapper>):
    NRA06_BUILD = {'repo': <worktree>, 'save': <.blend or None>, 'preview': <png dir or None>,
                   'write': True, 'work': <temp dir or None>}
    exec(compile(open(path).read(), path, 'exec'))
Source project: OneDrive/AI/Models/Blender/Taierzhuang1938/Characters_20260924/Scene_LugouNra06.blend
"""
import bpy, json, math, os, tempfile, importlib.util
import numpy as np
from mathutils import Vector

BASE = 'Model_LugouNra02.glb'
OUTPUT = 'Model_LugouNra06.glb'
MODEL_ID = 'LugouNra06'
HEAD = 'Bip002 Head'
HEAD_PRIM, UNIFORM_PRIM, EYE_PRIM, BADGE_PRIM = 0, 2, 5, 6
DROP_PRIMS = (3, 4)                       # cross strap + belt, hip tool
FACE_MATERIAL, UNIFORM_MATERIAL, BADGE_MATERIAL = 'Material #9', 'Material #1721585337', 'Material #1721585500'
GARB_MATERIAL = 'Material_InterpreterGarb'

# Head-local landmarks of the NRA02 head (Script_AuthorCharacterFacial.Landmarks).
LIP_LINE, LIP_FRONT, MID_Z = 8.06, 13.32, -0.55
EYES = [(15.23, 9.80, 2.53), (15.23, 9.80, -3.77)]   # L (+Z), R
EYE_FRONT = 11.02

SHAPE = {'cheekPuff': 1.00, 'jowl': .14, 'chinFull': .45, 'browInner': .50, 'browOuter': .22}
# Cloth targets (sRGB albedo; fold detail comes from the source luminance).
CLOTH = {'jacket': (.20, .19, .175), 'trousers': (.14, .14, .15), 'cap': (.11, .105, .10),
         'vest': (.86, .85, .81)}
# Open jacket front (GLB world metres): vest half width by height.
VEST = {'y': [1.00, 1.12, 1.26, 1.40, 1.50, 1.56], 'half': [.050, .066, .074, .066, .050, .040]}
SPECTACLES = {'radius': 1.95, 'wire': .085, 'templeWire': .07, 'clearance': .40, 'segments': 28, 'sides': 5,
              'metal': (.22, .20, .17)}
METAL_UV = (.045, .045)                   # badge image corner outside the badge disc


def Smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def Gauss(d2, sigma):
    return np.exp(-d2 / (2 * sigma * sigma))


def LoadModule(repo, name):
    path = os.path.join(repo, 'Taierzhuang1938', '_import', name + '.py')
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


# ---------------------------------------------------------------- head reshape

def Deform(L, s=SHAPE):
    """Head-local cm -> reshaped head-local cm (smooth, position-only: seams stay welded)."""
    x, y, z = L[:, 0], L[:, 1], L[:, 2]
    zz = z - MID_Z; az = np.abs(zz)
    out = L.copy()
    face = Smooth(2.0, 5.0, y)                                    # front half only
    radial = np.stack([np.zeros_like(x), y - 2.0, zz], 1)
    radial /= np.maximum(np.linalg.norm(radial, axis=1, keepdims=True), 1e-6)
    puff = Gauss((x - 10.2) ** 2 * .8 + (az - 5.0) ** 2 + (y - 8.8) ** 2 * .5, 2.1) * face
    out += radial * (s['cheekPuff'] * puff)[:, None]               # round cheeks
    jowl = Smooth(2.5, 5.0, x) * Smooth(12.5, 9.5, x) * Smooth(1.2, 3.0, az) * face
    out[:, 2] += zz * s['jowl'] * jowl                             # wider lower face
    chin = Gauss((x - 2.4) ** 2 + az ** 2 * .35 + (y - 8.6) ** 2 * .45, 1.5) * Smooth(5.0, 7.0, y)
    out[:, 0] -= s['chinFull'] * chin                              # soft double chin
    out[:, 1] += .5 * s['chinFull'] * chin
    for ex, ey, ez in EYES:                                        # raised, anxious brows
        dz = (z - ez) * np.sign(ez - MID_Z)                        # + outward
        lift = s['browInner'] + (s['browOuter'] - s['browInner']) * Smooth(-1.8, 2.2, dz)
        band = Smooth(ex + 1.0, ex + 1.9, x) * Smooth(ex + 4.6, ex + 2.6, x)
        side = Smooth(3.4, 2.4, np.abs(z - ez)) * Smooth(7.5, 9.0, y)
        out[:, 0] += lift * band * side
    return out


def DeformJacobian(L, h=.01):
    J = np.zeros((len(L), 3, 3))
    for k in range(3):
        e = np.zeros(3); e[k] = h
        J[:, :, k] = (Deform(L + e) - Deform(L - e)) / (2 * h)
    return J


# ---------------------------------------------------------------- spectacles

def Surface(points, x, z, radius=.45, front=6.0):
    """Front-most y of `points` near (x, z) (head-local cm), or None."""
    sel = (np.abs(points[:, 0] - x) < radius) & (np.abs(points[:, 2] - z) < radius) & (points[:, 1] > front)
    return float(points[sel, 1].max()) if sel.any() else None


def Side(points, x, y, sign, radius=.6):
    """Outer-most |z - MID_Z| of `points` near height x and depth y on one side."""
    zz = (points[:, 2] - MID_Z) * sign
    sel = (np.abs(points[:, 0] - x) < radius) & (np.abs(points[:, 1] - y) < radius) & (zz > 0)
    return float(zz[sel].max()) if sel.any() else None


def Tube(path, radius, sides, closed=False):
    """Positions and triangles of a tube along `path` (n x 3, head-local cm)."""
    path = np.asarray(path, float); n = len(path)
    tangents = np.zeros_like(path)
    for i in range(n):
        a = path[(i - 1) % n] if closed or i > 0 else path[i]
        b = path[(i + 1) % n] if closed or i < n - 1 else path[i]
        tangents[i] = b - a
    tangents /= np.maximum(np.linalg.norm(tangents, axis=1, keepdims=True), 1e-9)
    ref = np.array([0.0, 1.0, 0.0])
    P = []
    for p, t in zip(path, tangents):
        r = ref if abs(t @ ref) < .9 else np.array([1.0, 0, 0])
        u = np.cross(t, r); u /= np.linalg.norm(u); v = np.cross(t, u)
        for k in range(sides):
            a = 2 * math.pi * k / sides
            P.append(p + radius * (math.cos(a) * u + math.sin(a) * v))
    T = []
    rings = n if closed else n - 1
    for i in range(rings):
        j = (i + 1) % n
        for k in range(sides):
            a, b = i * sides + k, i * sides + (k + 1) % sides
            c, d = j * sides + (k + 1) % sides, j * sides + k
            T += [(a, b, c), (a, c, d)]
    if not closed:  # end caps
        for i, flip in ((0, True), (n - 1, False)):
            centre = len(P); P.append(path[i])
            for k in range(sides):
                a, b = i * sides + k, i * sides + (k + 1) % sides
                T.append((centre, b, a) if flip else (centre, a, b))
    return np.array(P), np.array(T)


def BuildSpectacles(head, cap, c=SPECTACLES):
    """Round wire spectacles fitted to the reshaped head (and clear of the cap)."""
    R = c['radius']; seg = c['segments']
    parts = []; info = {'rims': []}
    rimY = []
    for ex, ey, ez in EYES:
        cx = ex + .10
        ys = []
        for a in np.linspace(0, 2 * math.pi, seg, endpoint=False):
            for rr in (R - .3, R, R + .15):
                s = Surface(head, cx + rr * math.cos(a), ez + rr * math.sin(a))
                if s is not None: ys.append(s)
        ys.append(EYE_FRONT)
        rimY.append(max(ys) + c['clearance'])
    y0 = max(rimY)                                                  # one plane for both rims
    rims = []
    for ex, ey, ez in EYES:
        cx = ex + .10
        ring = np.array([(cx + R * math.cos(a), y0 - .25 * (1 - math.cos(a)) * .5, ez + R * math.sin(a))
                         for a in np.linspace(0, 2 * math.pi, seg, endpoint=False)])
        rims.append((cx, ez, ring)); parts.append(Tube(ring, c['wire'], c['sides'], closed=True))
    # Bridge: an arch over the nose between the inner rim points, a little above centre.
    (cxL, ezL, _), (cxR, ezR, _) = rims
    a = math.radians(20)
    pL = np.array([cxL + R * math.sin(a), y0, ezL - R * math.cos(a)])
    pR = np.array([cxR + R * math.sin(a), y0, ezR + R * math.cos(a)])
    nose = Surface(head, (pL[0] + pR[0]) / 2 + .2, MID_Z, radius=.6) or y0
    top = np.array([(pL[0] + pR[0]) / 2 + .45, max(y0, nose + c['clearance'] + .1), MID_Z])
    bridge = [(1 - t) ** 2 * pL + 2 * (1 - t) * t * top + t * t * pR for t in np.linspace(0, 1, 9)]
    parts.append(Tube(bridge, c['wire'], c['sides']))
    info['bridgeClearanceCm'] = round(float(top[1] - nose), 3)
    # Temples: from the outer rim point straight back along the side of the head to
    # the ear, then down behind it; always outside the skin and the cap.
    both = np.vstack([head, cap])
    worst = 99.0
    for cx, ez, ring in rims:
        sign = 1.0 if ez > MID_Z else -1.0
        start = np.array([cx + .35, y0 - .1, ez + sign * R])
        path = [start]
        for yy in np.linspace(y0 - 1.2, -1.2, 10):
            side = Side(both, cx + .4, yy, sign)
            zz = MID_Z + sign * ((side if side is not None else abs(start[2] - MID_Z)) + .30)
            zz = MID_Z + sign * max(abs(zz - MID_Z), abs(path[-1][2] - MID_Z) - .15) if yy > y0 - 3 else zz
            path.append(np.array([cx + .4, yy, zz]))
        end = path[-1]
        for k, (dx, dy) in enumerate(((-.7, -.35), (-1.4, -.55), (-2.0, -.6))):
            px, py = end[0] + dx, end[1] + dy
            side = Side(both, px, py, sign, radius=.5)
            zz = MID_Z + sign * ((side if side is not None else abs(end[2] - MID_Z)) + .25)
            path.append(np.array([px, py, zz]))
        path = np.array(path)
        for p in path[1:]:
            s = Side(both, p[0], p[1], sign, radius=.35)
            if s is not None: worst = min(worst, abs(p[2] - MID_Z) - s)
        parts.append(Tube(path, c['templeWire'], 4))
    info['templeClearanceCm'] = round(float(worst), 3)
    info['rimPlaneY'] = round(float(y0), 3)
    info['rimClearanceCm'] = [round(float(y0 - (r - c['clearance'])), 3) for r in rimY]
    P, T = [], []
    for Pp, Tp in parts:
        T.append(Tp + sum(len(q) for q in P)); P.append(Pp)
    return np.vstack(P), np.vstack(T), info


# ---------------------------------------------------------------- painting

def PaintFace(rgb, orig, mask, M):
    """Face texture: heavier raised brows (painted at the original brow skin, which the
    reshape lifts) and a flush on the round cheeks. orig: head-local cm before reshape."""
    h, w, _ = rgb.shape
    x, y, z = orig[..., 0], orig[..., 1], orig[..., 2]
    out = rgb.copy()
    for ex, ey, ez in EYES:
        sgn = np.sign(ez - MID_Z); dz = (z - ez) * sgn             # + outward
        t = np.clip((dz + 2.0) / 4.3, 0, 1)                        # 0 inner end .. 1 outer end
        line = ex + 1.70 + .22 * np.sin(t * math.pi) + .30 * (1 - t) - .20 * t   # inner end high
        thick = .17 + .10 * (1 - t)                                # half thickness, thin outer tail
        brow = Smooth(thick + .12, thick - .10, np.abs(x - line)) * Smooth(-2.4, -1.9, dz) * Smooth(2.6, 2.1, dz) * (y > 8.0)
        hair = M.Noise((h, w), 61 + int(ez > 0), 1.1) * .45 + M.Noise((h, w), 63, 3.0) * .25 + .45
        a = np.clip(brow * hair, 0, .88)
        out = out * (1 - a[..., None]) + np.array([.06, .05, .045], np.float32) * a[..., None]
    zz = np.abs(z - MID_Z)
    flush = np.exp(-(((x - 10.4) / 1.8) ** 2 + ((zz - 4.8) / 1.7) ** 2)) * (y > 6.0)
    out = out * (1 - .10 * flush[..., None]) + np.array([.78, .45, .40], np.float32) * (.10 * flush)[..., None]
    return np.clip(np.where(mask[..., None], out, rgb), 0, 1)


def Luma(rgb):
    return rgb @ np.array([.2126, .7152, .0722], np.float32)


def PaintGarb(atlas, posMap, mask, bones, headBone, M):
    """Uniform atlas -> dark civilian clothes. posMap: GLB world metres per texel."""
    h, w, _ = atlas.shape
    rgb = atlas[..., :3]
    blue = np.clip((rgb[..., 2] - rgb[..., 0]) / np.maximum(rgb[..., 2], 1e-3), -1, 1)
    red = np.clip((rgb[..., 0] - np.maximum(rgb[..., 1], rgb[..., 2])) / np.maximum(rgb[..., 0], 1e-3), 0, 1)
    cloth = Smooth(.10, .32, blue)
    # Collar tabs, rank pips and brass buttons (saturated, not blue) above the feet;
    # the rope soles keep their colour.
    hi = rgb.max(-1); lo = rgb.min(-1)
    sat = (hi - lo) / np.maximum(hi, 1e-3)
    warm = Smooth(.25, .45, sat) * (rgb[..., 2] < hi - .02) * (hi > .12)
    tabs = np.maximum(Smooth(.35, .55, red) * (rgb[..., 0] > .25), warm * ((posMap[..., 1] > .30) | ~mask))
    base = float(np.median(Luma(rgb)[cloth > .9]))
    detail = np.clip(Luma(rgb) / base, .35, 1.8)[..., None]
    y = posMap[..., 1]; x = posMap[..., 0]; zf = posMap[..., 2]
    target = np.empty_like(rgb); target[:] = CLOTH['jacket']
    trousers = mask & (y < .98)
    cap = mask & bones & (y > 1.70)
    target[trousers] = CLOTH['trousers']; target[cap] = CLOTH['cap']
    # Unrasterised padding keeps the jacket colour; masks bleed a few texels so the
    # class borders do not show a jacket seam at mip levels.
    t2, _ = M.Dilate(target.copy(), mask, 6)
    dyed = t2 * detail
    out = rgb * (1 - cloth[..., None]) + dyed * cloth[..., None]
    out = out * (1 - tabs[..., None]) + (t2 * detail * .9) * tabs[..., None]   # collar tabs gone
    # Open jacket front: the white vest between the lapels, a dark lapel edge beside it.
    half = np.interp(y, VEST['y'], VEST['half'], left=0, right=0)
    front = mask & (zf > .02) & (y > VEST['y'][0]) & (y < VEST['y'][-1])
    d = np.abs(x) - half                                          # <0 inside the opening
    vest = front & (d < 0)
    # Vest shading from the blurred source folds only: pockets, buttons and the name
    # tag painted on the tunic front must not print through the white cotton.
    lum = Luma(rgb) / base
    for _ in range(3):
        lum = sum(np.roll(lum, (dy, dx), (0, 1)) for dy in range(-6, 7, 3) for dx in range(-6, 7, 3)) / 25.0
    soft = np.clip(lum, .75, 1.2) ** .6 * (.95 + .08 * M.Noise((h, w), 71, 6))
    vestRgb = np.array(CLOTH['vest'], np.float32) * soft[..., None] * (1 - .22 * Smooth(-.012, 0, d))[..., None]
    out = np.where(vest[..., None], vestRgb, out)
    # The painted name tag on the tunic breast (neutral white, so outside the blue mask).
    tag = front & (d >= 0) & (np.abs(x) < .20) & (y > 1.20) & (Luma(rgb) > .45) & (sat < .25)
    out = np.where(tag[..., None], t2 * .95, out)
    # Turned-back sleeve cuffs (neutral grey in the source atlas) read as pale arm bands
    # on a dark civilian jacket: dye them with the jacket.
    cuff = mask & (np.abs(x) > .30) & (y > 1.2) & (sat < .25) & (Luma(rgb) > .25)
    out = np.where(cuff[..., None], t2 * np.clip(Luma(rgb) / float(np.median(Luma(rgb)[cuff]) if cuff.any() else 1), .6, 1.3)[..., None], out)
    edge = front & (d >= 0) & (d < .010)
    out = np.where(edge[..., None], out * (.55 + .45 * Smooth(.004, .010, d))[..., None], out)
    report = {'clothTexels': int((cloth > .5).sum()), 'tabTexels': int((tabs > .5).sum()),
              'capTexels': int(cap.sum()), 'trouserTexels': int(trousers.sum()), 'vestTexels': int(vest.sum()),
              'tagTexels': int(tag.sum()), 'cuffTexels': int(cuff.sum())}
    return np.clip(out, 0, 1), report, vest


def PaintBadge(img):
    """Badge image: cap cloth with a pale five-point star; a metal patch in the corner."""
    h, w, _ = img.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    u = (xx + .5) / w - .5; v = (yy + .5) / h - .5
    r = np.hypot(u, v); a = np.arctan2(u, -v)                     # angle from "up"
    # Star: radius from the angle between an outer point (.40) and an inner notch (.16).
    k = (a / (2 * math.pi / 5)) % 1.0
    tri = np.abs(k - .5) * 2                                      # 1 at the points, 0 between
    outer, inner = .40, .165
    # Straight star edges: interpolate in 1/r between point and notch radii.
    edge = 1 / (1 / inner + (1 / outer - 1 / inner) * tri)
    star = Smooth(edge + .012, edge - .012, r)
    cloth = np.array(CLOTH['cap'], np.float32) * (.92 + .16 * (np.sin(xx * .9) * np.sin(yy * .7) * .5 + .5))[..., None]
    pale = np.array([.84, .80, .66], np.float32) * (1 - .18 * Smooth(0, .40, r))[..., None]
    rgb = cloth * (1 - star[..., None]) + pale * star[..., None]
    mu, mv = METAL_UV
    metal = (np.abs(u + .5 - mu) < .045) & (np.abs(v + .5 - mv) < .045)
    rgb[metal] = SPECTACLES['metal']
    out = img.copy(); out[..., :3] = rgb; out[..., 3] = 1
    return out


# ---------------------------------------------------------------- glb helpers

def PruneMaterials(doc):
    """Drop materials no primitive uses, then textures/images/samplers nothing uses."""
    used = sorted({p['material'] for m in doc['meshes'] for p in m['primitives'] if 'material' in p})
    remap = {old: new for new, old in enumerate(used)}
    doc['materials'] = [doc['materials'][i] for i in used]
    for m in doc['meshes']:
        for p in m['primitives']:
            if 'material' in p: p['material'] = remap[p['material']]
    refs = []
    def Walk(o):
        if isinstance(o, dict):
            if 'index' in o and isinstance(o['index'], int) and ('texCoord' in o or 'scale' in o or 'strength' in o or len(o) <= 3):
                refs.append(o)
            for v in o.values(): Walk(v)
        elif isinstance(o, list):
            for v in o: Walk(v)
    for m in doc['materials']: Walk(m)
    usedTex = sorted({r['index'] for r in refs})
    texMap = {old: new for new, old in enumerate(usedTex)}
    for r in refs: r['index'] = texMap[r['index']]
    doc['textures'] = [doc['textures'][i] for i in usedTex]
    def Source(t): return t.get('source', t.get('extensions', {}).get('EXT_texture_webp', {}).get('source'))
    usedImg = sorted({Source(t) for t in doc['textures']})
    imgMap = {old: new for new, old in enumerate(usedImg)}
    for t in doc['textures']:
        if 'source' in t: t['source'] = imgMap[t['source']]
        if 'EXT_texture_webp' in t.get('extensions', {}): t['extensions']['EXT_texture_webp']['source'] = imgMap[Source(t)]
    doc['images'] = [doc['images'][i] for i in usedImg]
    return {'materials': len(doc['materials']), 'textures': len(doc['textures']), 'images': len(doc['images'])}


def AppendRigid(glb, M, prim, P, UV, T, headJoint, toWorld, R):
    """Append head-rigid geometry (head-local cm) to a primitive."""
    doc = glb.doc
    attrs = {k: M.ReadRaw(glb, v) for k, v in prim['attributes'].items()}
    idx = M.ReadRaw(glb, prim['indices']).ravel().astype(np.int64).reshape(-1, 3)
    first = len(attrs['POSITION']); n = len(P)
    N = M.VertexNormals(P, T); Tn = M.Tangents(P, UV, T, N)
    out = {}
    for k, arr in attrs.items():
        if k == 'POSITION': tail = toWorld(P)
        elif k == 'NORMAL': tail = N @ R.T
        elif k == 'TANGENT': tail = np.c_[Tn[:, :3] @ R.T, Tn[:, 3]]
        elif k == 'TEXCOORD_0': tail = UV
        elif k == 'JOINTS_0': tail = np.zeros((n, arr.shape[1])); tail[:, 0] = headJoint
        elif k == 'WEIGHTS_0':
            tail = np.zeros((n, arr.shape[1])); tail[:, 0] = 1.0 if arr.dtype == np.float32 else np.iinfo(arr.dtype).max
        else: tail = np.repeat(arr[:1], n, 0)
        out[k] = np.vstack([arr, tail.astype(arr.dtype)])
    for k, arr in out.items():
        a = doc['accessors'][prim['attributes'][k]]
        kind = {1: 'SCALAR', 2: 'VEC2', 3: 'VEC3', 4: 'VEC4'}[arr.shape[1]]
        prim['attributes'][k] = M.WriteAccessor(glb, arr, kind, a['componentType'], a.get('normalized', False))
    prim['indices'] = M.WriteAccessor(glb, np.vstack([idx, T + first]).astype(np.uint32).reshape(-1, 1), 'SCALAR', 5125, target=34963)
    return first


# ---------------------------------------------------------------- build

def Build(job):
    repo = job['repo']
    M = LoadModule(repo, 'Script_BuildLugouIja06')     # shared GLB/texture helpers
    A = M.Load(repo); B = A.Baker(repo)
    charDir = os.path.join(repo, 'Taierzhuang1938', 'Model', 'Character')
    glb = B.Glb(os.path.join(charDir, BASE)); doc = glb.doc
    head = glb.World(glb.byName[HEAD]); Hm = np.array(head); Hinv = np.array(head.inverted())
    R = Hm[:3, :3] / np.linalg.norm(Hm[:3, 0]); Rinv = R.T
    work = job.get('work') or tempfile.mkdtemp(prefix='Nra06_')
    os.makedirs(work, exist_ok=True)
    io = M.ImageIO(work)
    prims = doc['meshes'][0]['primitives']
    report = {'base': BASE, 'output': OUTPUT}
    def ToLocal(P): return P @ Hinv[:3, :3].T + Hinv[:3, 3]
    def ToWorld(L): return L @ Hm[:3, :3].T + Hm[:3, 3]
    headJoint = [doc['nodes'][j]['name'] for j in doc['skins'][0]['joints']].index(HEAD)

    # --- head reshape (prim 0); the eyeballs are their own primitive and stay put
    p0 = prims[HEAD_PRIM]
    P = M.ReadRaw(glb, p0['attributes']['POSITION']).astype(np.float64)
    N = M.ReadRaw(glb, p0['attributes']['NORMAL']).astype(np.float64)
    Tn = M.ReadRaw(glb, p0['attributes']['TANGENT']).astype(np.float64)
    idx0 = M.ReadRaw(glb, p0['indices']).ravel().astype(np.int64)
    L = ToLocal(P)
    newL = Deform(L)
    J = DeformJacobian(L)
    nL = N @ Rinv.T; nL = np.einsum('nji,nj->ni', np.linalg.inv(J), nL)  # J^-T n
    nL /= np.linalg.norm(nL, axis=1, keepdims=True)
    tL = Tn[:, :3] @ Rinv.T; tL = np.einsum('nij,nj->ni', J, tL); tL -= nL * (tL * nL).sum(1, keepdims=True)
    tL /= np.maximum(np.linalg.norm(tL, axis=1, keepdims=True), 1e-9)
    moved = np.linalg.norm(newL - L, axis=1)
    eyeL = ToLocal(M.ReadRaw(glb, prims[EYE_PRIM]['attributes']['POSITION']).astype(np.float64))
    lidGap = []
    for ex, ey, ez in EYES:   # the lids must not move onto the eyeball
        near = (np.abs(L[:, 0] - ex) < 1.0) & (np.abs(L[:, 2] - ez) < 1.6) & (L[:, 1] > ey)
        lidGap.append(round(float(moved[near].max()), 3))
    report['head'] = {'vertices': len(P), 'moved': int((moved > .01).sum()), 'maxMoveCm': round(float(moved.max()), 3),
                      'eyeRegionMaxMoveCm': lidGap}
    p0['attributes']['POSITION'] = M.WriteAccessor(glb, ToWorld(newL), 'VEC3', 5126)
    p0['attributes']['NORMAL'] = M.WriteAccessor(glb, nL @ R.T, 'VEC3', 5126)
    p0['attributes']['TANGENT'] = M.WriteAccessor(glb, np.c_[tL @ R.T, Tn[:, 3]], 'VEC4', 5126)

    # --- textures: face
    faceIndex = M.ImageOf(doc, FACE_MATERIAL); face = io.Decode(M.ImageBytes(glb, faceIndex), 'face')
    fh, fw, _ = face.shape
    uv0 = M.ReadRaw(glb, p0['attributes']['TEXCOORD_0']).astype(np.float64)
    # The NRA02 head UVs span two texture tiles (v in [0, 2], sampled with REPEAT):
    # rasterise each tile and merge.
    origMap = np.zeros((fh, fw, 3), np.float32); fmask = np.zeros((fh, fw), bool)
    for tile in range(int(math.floor(float(uv0[:, 1].min()))), int(math.ceil(float(uv0[:, 1].max())))):
        part, m = M.Rasterize(uv0, L, idx0.reshape(-1, 3), fw, fh, float(tile))
        report.setdefault('faceTileConflicts', []).append(int((m & fmask & (np.linalg.norm(part - origMap, axis=-1) > 1.0)).sum()))
        origMap[m] = part[m]; fmask |= m
    face[..., :3] = PaintFace(face[..., :3], origMap, fmask, M)
    M.ReplaceImage(glb, faceIndex, io.Encode(face, 'Nra06Face'))

    # --- clothes atlas (prim 2)
    p2 = prims[UNIFORM_PRIM]
    P2 = M.ReadRaw(glb, p2['attributes']['POSITION']).astype(np.float64)
    UV2 = M.ReadRaw(glb, p2['attributes']['TEXCOORD_0']).astype(np.float64)
    J2 = M.ReadRaw(glb, p2['attributes']['JOINTS_0']); W2 = M.ReadRaw(glb, p2['attributes']['WEIGHTS_0']).astype(np.float64)
    T2 = M.ReadRaw(glb, p2['indices']).ravel().astype(np.int64).reshape(-1, 3)
    onHead = J2[np.arange(len(J2)), W2.argmax(1)] == headJoint
    atlasIndex = M.ImageOf(doc, UNIFORM_MATERIAL); atlas = io.Decode(M.ImageBytes(glb, atlasIndex), 'atlas')
    ah, aw, _ = atlas.shape
    posMap, amask = M.Rasterize(UV2, P2, T2, aw, ah, 0.0)
    headMap, _ = M.Rasterize(UV2, np.c_[onHead.astype(float), np.zeros((len(P2), 2))], T2, aw, ah, 0.0)
    painted, garb, vest = PaintGarb(atlas, posMap, amask, headMap[..., 0] > .5, headJoint, M)
    atlas[..., :3] = painted
    M.ReplaceImage(glb, atlasIndex, io.Encode(atlas, 'Nra06Garb'))
    # The tunic's normal map (pockets, buttons, placket) mostly flattened under the vest.
    uniform = next(m for m in doc['materials'] if m.get('name') == UNIFORM_MATERIAL)
    nt = doc['textures'][uniform['normalTexture']['index']]
    normalIndex = nt.get('source', nt.get('extensions', {}).get('EXT_texture_webp', {}).get('source'))
    nmap = io.Decode(M.ImageBytes(glb, normalIndex), 'normal')
    nh, nw, _ = nmap.shape
    vm = vest if (nh, nw) == vest.shape else np.array(
        [[vest[int(r * vest.shape[0] / nh), int(c * vest.shape[1] / nw)] for c in range(nw)] for r in range(nh)])
    vm, _ = M.Dilate(vm[..., None].astype(np.float32).repeat(3, -1), vm, 3)
    k = .75 * vm[..., :1]
    nmap[..., :3] = nmap[..., :3] * (1 - k) + np.array([.5, .5, 1.0], np.float32) * k
    M.ReplaceImage(glb, normalIndex, io.Encode(nmap, 'Nra06GarbNormal'))
    garb['normalFlattened'] = int((k[..., 0] > .5).sum())
    report['garb'] = garb
    capLocal = ToLocal(P2[onHead])

    # --- badge: star + metal patch, and the spectacles on the badge primitive
    badgeIndex = M.ImageOf(doc, BADGE_MATERIAL); badge = io.Decode(M.ImageBytes(glb, badgeIndex), 'badge')
    M.ReplaceImage(glb, badgeIndex, io.Encode(PaintBadge(badge), 'Nra06Badge'))
    SP, ST, specInfo = BuildSpectacles(newL, capLocal)
    SUV = np.tile(np.array(METAL_UV), (len(SP), 1))
    AppendRigid(glb, M, prims[BADGE_PRIM], SP, SUV, ST, headJoint, ToWorld, R)
    report['spectacles'] = {'vertices': len(SP), 'triangles': len(ST), **specInfo}

    # --- remove webbing, rename the cloth material, prune
    for i in sorted(DROP_PRIMS, reverse=True): del prims[i]
    for m in doc['materials']:
        if m.get('name') == UNIFORM_MATERIAL: m['name'] = GARB_MATERIAL
    report['pruned'] = PruneMaterials(doc)
    for node in doc['nodes']:
        if node.get('name') == 'Character_LugouNra02': node['name'] = 'Character_' + MODEL_ID
    glb.Compact()
    doc.setdefault('extras', {})['lugouVariant'] = {
        'id': MODEL_ID, 'role': 'interpreter', 'derivedFrom': BASE, 'builder': '_import/Script_BuildLugouNra06.py',
        'approved': '2026-09-24', 'shape': SHAPE, 'cloth': CLOTH, 'spectacles': SPECTACLES}
    report['triangles'] = int(sum(doc['accessors'][p['indices']]['count'] for p in prims) // 3)
    report['vertices'] = int(sum(doc['accessors'][p['attributes']['POSITION']]['count'] for p in prims))
    if job.get('write', True):
        path = os.path.join(charDir, OUTPUT); open(path, 'wb').write(glb.Encode()); report['bytes'] = os.path.getsize(path)
    if job.get('save') or job.get('preview'): report['scene'] = BuildScene(job, M)
    print(json.dumps(report))
    return report


def BuildScene(job, M):
    """Blender scene of the shipped result, for review renders and the saved source project."""
    path = os.path.join(job['repo'], 'Taierzhuang1938', 'Model', 'Character', OUTPUT)
    sceneName = 'Scene_' + MODEL_ID
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
    if job.get('preview'): result['previews'] = Preview(scene, job['preview'], 'Nra06')
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
    # NRA02 stands taller than the IJA bodies: eyes at ~1.68 m, cap top ~1.82 m.
    shots = [('HeadFront', (0, 0, 1.66), (0, -.78, .02), 85), ('HeadThreeQuarter', (0, 0, 1.66), (-.52, -.58, .03), 85),
             ('HeadSide', (0, 0, 1.66), (-.78, 0, .02), 85), ('FaceClose', (0, -.10, 1.63), (-.10, -.42, .0), 85),
             ('Torso', (0, 0, 1.32), (-.35, -1.5, .05), 50),
             ('Body', (0, 0, .95), (-.9, -4.2, .2), 50), ('Back', (0, 0, .95), (.6, 4.2, .2), 50)]
    for name, target, offset, lens in shots:
        cam.data.lens = lens
        cam.location = Vector(target) + Vector(offset)
        cam.rotation_euler = (Vector(target) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        p = os.path.join(folder, 'Preview_%s_%s.png' % (label, name)); scene.render.filepath = p
        bpy.ops.render.render(write_still=True, scene=scene.name); out.append(p)
    return out


if 'NRA06_BUILD' in globals():
    NRA06_BUILD_RESULT = Build(NRA06_BUILD)
