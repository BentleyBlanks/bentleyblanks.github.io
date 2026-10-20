"""Fit the aiming-only left support grip of the three bolt rifles.

At the COD-style close ADS (iron sight 0.22-0.24 m from the eye) the hip support
hand sits 0.31 m in front of the eye with its thumb raised to the sight line, and
the left wrist reaches the 65 degree limit because the hand lies behind the
shoulder anchor. This fit keeps the scanned hand, its skin and every finger bone
length; it only searches a new palm frame and finger joint rotations for ADS.

Palm (7 DOF about the hip contact, incl. a turn about the palm normal) is searched
jointly with the fingers: palm skin against the real fore-end, no penetration
(nearest normal + three-ray parity), the production two-bone IK's minimum wrist
bend, and the highest hand point seen from the ADS eye (ray-cast against the
rifle) kept in the COD band 0.18-0.31 screen heights under the sight line (neither
raised to it nor hidden). Fingers are pure hinges about each joint's captured curl
axis, measured like Script_FpsHandPoseTest: finger MCP -10..95 deg plus abduction
(index/middle/ring/little +-20/12/15/20), PIP 0..105, DIP 0..80, thumb MCP/IP -5..60/80
(the thumb base keeps three free axes), so no joint bends backwards. Distal pads on the
fore-end (FPS_ADS_REACH), skin >= 0.6 mm off the wood, finger top under
FPS_ADS_FINGER_TOP (weight FPS_ADS_FINGER_TOP_WEIGHT).

Thumb along the stock (user sketch, 2026-10-20): FPS_ADS_THUMB_SIDE {weapon: [pad y low,
pad y high, thumb ceiling] mm} puts the thumb pad on the left face in that band, its IP
joint no lower than 4 mm under it, pointing at the muzzle 0-20 deg up, and no thumb skin
above the ceiling (the stock's upper edge); FPS_ADS_THUMB_TOP is its own NDC limit.
FPS_ADS_INDEX_CEIL {weapon: mm} keeps the index (FPS_ADS_CEIL_DIGITS=4: all four fingers)
below the thumb, so a straight index no longer rises along the stock where the thumb
belongs. FPS_ADS_GRID {weapon: {theta, phi, dy}} sweeps the palm rolled about the
fore-end axis, turned about its normal and lowered; FPS_ADS_EXTRA_SEEDS adds palms to
compare. FPS_ADS_PEN weights skin inside the 0.6 mm clearance (3000 for the shipped
grips), FPS_ADS_LITTLE_REACH the little finger's pad pull, FPS_ADS_WRAP an experimental
pull of index/middle round to the stock's right side (not shipped). The per-rifle
settings are in docs/Data_FpsRifleView20261016.md v14.

FPS_ADS_PALM (json {weapon: palm params}) reruns the fingers on fixed palms;
FPS_ADS_PALM_SEED refines from given palms; FPS_ADS_ROLL_ANCHOR / FPS_ADS_ROLL_SEEDS
start from the hip palm turned about the fore-end axis; FPS_ADS_SHOULDER sets the ADS
shoulder used by the wrist estimate; FPS_ADS_CUFF targets the wrist on screen;
FPS_ADS_SWEEP_ONLY prints palm costs.

FPS_SUPPORT_STATE=hip refits the hip support fingers instead: the hip palm frame is
kept exactly. Only the PIP/DIP and thumb MCP/IP joints that fail the FpsHandPoseTest
gate are rebuilt as pure hinges (thumb floor -4 deg for rounding margin); passing
joints keep their authored rotation plus a flex delta (+-25), each MCP its authored
rotation plus a flex/spread delta (+-12/10), the thumb CMC its authored rotation plus
the usual deltas. A digit whose joints all pass and that neither enters the wood nor
misses it stays exactly as authored. Besides pad contact and clearance, FPS_HIP_STAY
weights the RMS skin displacement from the authored grip, so the fit only removes the
backward/sideways bends. Shipped: FPS_ADS_REACH=150 FPS_HIP_STAY=100 (docs v13).
Output Data_HipSupportGrips.json.
Inputs (globals or environment):
  FPS_GRIP_PROJECT_ROOT  Taierzhuang1938 folder
  FPS_GRIP_INPUT         Script_FpsWeaponGripExport output (Data_<id>.json, --clean)
  FPS_ADS_FRAMES         ADS eye/shoulder/arm dump (Data_AdsFrames.json)
  FPS_GRIP_SOURCE        editable Blender source folder (reports, review renders)
  FPS_GRIP_IDS           optional comma list, default Type38,HanYang,ZhongZheng
Output: <source>/Data_AdsSupportGrips.json (contacts + report). The runtime data
is written into Data_FpsArmPoses.mjs by hand from that file.
"""
import bpy, json, math, os, re, time
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion, Euler
from mathutils.bvhtree import BVHTree


def Setting(name, default=None):
    value = globals().get(name)
    if value is None:
        value = os.environ.get(name, default)
    return value


root = Path(Setting('FPS_GRIP_PROJECT_ROOT'))
folder = Path(Setting('FPS_GRIP_INPUT'))
frames = json.loads(Path(Setting('FPS_ADS_FRAMES')).read_text())
source = Path(Setting('FPS_GRIP_SOURCE'))
ids = Setting('FPS_GRIP_IDS', 'Type38,HanYang,ZhongZheng')
ids = ids.split(',') if isinstance(ids, str) else list(ids)
source.mkdir(parents=True, exist_ok=True)
DEG = math.pi / 180
hipMode = str(Setting('FPS_SUPPORT_STATE', 'ads')).lower() == 'hip'
stayWeight = float(Setting('FPS_HIP_STAY', 15)) if hipMode else 0.


def M4(v):
    return Matrix([v[i::4] for i in range(4)])


def Q(v):
    return Quaternion((v[3], *v[:3]))


def QA(q):
    q = q.normalized()
    return [round(v, 9) for v in (q.x, q.y, q.z, q.w)]


def EulerYXZ(values):
    x, y, z = values
    return (Matrix.Rotation(y, 3, 'Y') @ Matrix.Rotation(x, 3, 'X') @ Matrix.Rotation(z, 3, 'Z'))


def ToEulerYXZ(m):
    # three.js Euler.setFromRotationMatrix, order 'YXZ'
    m13, m23, m33 = m[0][2], m[1][2], m[2][2]
    m11, m21, m31, m12, m22 = m[0][0], m[1][0], m[2][0], m[0][1], m[1][1]
    x = math.asin(-max(-1, min(1, m23)))
    if abs(m23) < 0.9999999:
        y = math.atan2(m13, m33)
        z = math.atan2(m21, m22)
    else:
        y = math.atan2(-m31, m11)
        z = 0
    return [round(x, 9), round(y, 9), round(z, 9)]


def Contact(position, rotation):
    return Matrix.Translation(Vector(position)) @ EulerYXZ(rotation).to_4x4()


results = {}
started = time.time()
for wid in ids:
    pkg = json.loads((folder / ('Data_' + wid + '.json')).read_text())
    frame = frames[wid]
    hipContact = pkg['contacts']['left']
    C0 = Contact(hipContact['position'], hipContact['rotation'])
    C0inv = C0.inverted()
    handGun = M4(frame['handGun'])
    contactGun = M4(frame['contactGun'])
    handFromContact = contactGun.inverted() @ handGun
    anchorToGun = M4(frame['anchorToGun'])
    shoulderOverride = Setting('FPS_ADS_SHOULDER')
    shoulderOverride = json.loads(Path(shoulderOverride).read_text()).get(wid) if shoulderOverride else None
    shoulder = anchorToGun @ Vector(shoulderOverride or frame['shoulderAnchor'])
    upper, lower = frame['armLength']['upper'], frame['armLength']['lower']
    eye = Vector(frame['eye'])
    tanHalf = math.tan(frame['fov'] * DEG / 2)

    vertices = [Vector(t[i:i + 3]) for t in pkg['gun'] for i in (0, 3, 6)]
    # Fore-end underside at the hip contact: slice the rifle there. Parts that hang
    # entirely below it (sling swivel, band lugs) are not a support surface; the
    # first fit parked the palm on the swivel 17 mm under the wood.
    z0 = hipContact['position'][2]
    cut = []
    for i in range(0, len(vertices), 3):
        tri = vertices[i:i + 3]
        for a, b in ((0, 1), (1, 2), (2, 0)):
            pa, pb = tri[a], tri[b]
            if (pa.z - z0) * (pb.z - z0) < 0:
                cut.append(pa.lerp(pb, (z0 - pa.z) / (pb.z - pa.z)))
    underside = min(v.y for v in cut if abs(v.x) < .03)
    sectionX = [v.x for v in cut if abs(v.x) < .03]
    centerX = (min(sectionX) + max(sectionX)) / 2
    sectionY = [v.y for v in cut if abs(v.x) < .03]
    foreEndCenter = Vector((centerX, (min(sectionY) + max(sectionY)) / 2, z0))
    sideX = min(sectionX)   # left face of the stock at the contact
    support = [i for i in range(0, len(vertices), 3) if max(v.y for v in vertices[i:i + 3]) >= underside - .002]
    supportVertices = [vertices[i + k] for i in support for k in range(3)]
    bvh = BVHTree.FromPolygons(supportVertices, [(i, i + 1, i + 2) for i in range(0, len(supportVertices), 3)])
    # Clearance is checked against the whole rifle; only the palm's support target excludes hanging parts.
    bvhAll = BVHTree.FromPolygons(vertices, [(i, i + 1, i + 2) for i in range(0, len(vertices), 3)])
    print(json.dumps({'weapon': wid, 'underside': underside, 'supportTriangles': len(support), 'allTriangles': len(vertices) // 3}), flush=True)

    rays = [Vector((.577, .577, .577)), Vector((-.707, .1, .7)).normalized(), Vector((.2, -.9, -.39)).normalized()]

    def Parity(v, direction, tree):
        hits, origin = 0, v.copy()
        for _ in range(40):
            hit = tree.ray_cast(origin, direction, .5)
            if hit[0] is None:
                break
            hits += 1
            origin = hit[0] + direction * 1e-5
        return hits % 2 == 1

    def Signed(v, tree=None):
        # The rifles are open meshes and the Zhongzheng has flipped faces: a vertex
        # is inside only when the nearest face normal AND the majority of three
        # ray parities agree (same rule as the mounted-gun hand fit).
        tree = tree or bvh
        p, n, index, d = tree.find_nearest(v)
        if p is None:
            return 1.0
        if d < .022 and (v - p).dot(n) < -1e-6 and sum(Parity(v, r, tree) for r in rays) >= 2:
            return -d
        return d

    chains = {}
    for name, c in pkg['chain']['l'].items():
        match = re.search(r'finger(\d)(\d)?$', name, re.I)
        chains[name] = {**c, 'digit': int(match[1]), 'segment': int(match[2] or 0), 'W': M4(c['world']),
                        'P': M4(c['parentWorld']), 'axisV': Vector(c['axis']), 'spreadV': Vector(c['spreadAxis']),
                        'localQ': Q(c['local']), 'restQ': Q(c['rest'])}
    handName = [n for n in pkg['boneNames'] if re.search(r'l[_ ]?hand$', n, re.I)][0]

    # Skin samples owned by the left hand or its fingers.
    palmSamples, digitSamples, handCloud = [], {}, []
    for mesh in pkg['skin']:
        for i in range(0, len(mesh['pos']) // 3):
            infl = [(mesh['bones'][mesh['infl'][4 * i + k]], mesh['wts'][4 * i + k]) for k in range(4) if mesh['wts'][4 * i + k] > .001]
            owned = sum(w for b, w in infl if b == handName or b in chains)
            if owned < .5:
                continue
            v = Vector(mesh['pos'][3 * i:3 * i + 3])
            owner = max(infl, key=lambda pair: pair[1])[0]
            if owner in chains:
                if i % 3 == 0:
                    digitSamples.setdefault(chains[owner]['digit'], []).append((v, infl))
            elif owner == handName:
                local = C0inv @ v
                palmSamples.append((v, local))
            if i % 15 == 0:
                handCloud.append((v, infl))
    # Volar palm: in the hip contact frame +Y is dorsal, so in every 6 mm (x, z)
    # cell the skin within 3 mm of the lowest y is the palm surface. A plain y
    # threshold only kept the thenar bulge, and one touching bulge let the whole
    # palm hang below the wood.
    cells = {}
    for v, local in palmSamples:
        key = (round(local.x / .006), round(local.z / .006))
        cells[key] = min(cells.get(key, 1), local.y)
    volar = [v for v, local in palmSamples if local.y <= cells[(round(local.x / .006), round(local.z / .006))] + .003][::2]
    palmOnly = [v for v, local in palmSamples][::4]
    print(json.dumps({'weapon': wid, 'palmVertices': len(palmSamples), 'volarSamples': len(volar), 'cells': len(cells)}), flush=True)

    def Bones(digit):
        return sorted([n for n, c in chains.items() if c['digit'] == digit], key=lambda n: chains[n]['segment'])

    def MinimumWristBend(C):
        hand = (C @ handFromContact).to_translation()
        handDir = (C.to_3x3() @ Vector((0, 0, 1))).normalized()
        offset = hand - shoulder
        d = min(offset.length, (upper + lower) * .985)
        direction = offset.normalized()
        cosine = max(-1, min(1, (upper * upper + d * d - lower * lower) / (2 * upper * d)))
        angle = math.acos(cosine)
        axial = handDir.dot(direction)
        radius = upper * math.sin(angle)
        amplitude = radius / lower * math.sqrt(max(0, 1 - axial * axial))
        baseCos = axial * (d - upper * math.cos(angle)) / lower
        return math.degrees(math.acos(max(-1, min(1, baseCos + amplitude)))), offset.length / (upper + lower)

    def Visible(points, tree=None):
        """Highest NDC y and the NDC x of every hand point the ADS eye sees past the rifle."""
        tree = tree or bvh
        top, xs = -9, []
        for v in points:
            ray = v - eye
            distance = ray.length
            hit = tree.ray_cast(eye, ray / distance, distance - .003)
            if hit[0] is not None:
                continue
            depth = -ray.z
            if depth <= 0:
                continue
            top = max(top, ray.y / depth / tanHalf)
            xs.append(ray.x / depth / tanHalf / frame['aspect'])
        return top, xs

    def TopNdc(points, tree=None):
        return Visible(points, tree)[0]

    def PalmDelta(p):
        rotation = Euler((p[0], p[1], p[2]), 'XYZ').to_matrix().to_4x4()
        pivot = Vector(hipContact['position'])
        D = Matrix.Translation(pivot + Vector(p[3:6])) @ rotation @ Matrix.Translation(-pivot)
        if len(p) > 6 and p[6]:
            # Turn the hand about its own palm normal (contact-frame Y) so the four
            # fingers can lie across the fore-end instead of along it.
            D = D @ C0 @ Matrix.Rotation(p[6], 4, 'Y') @ C0inv
        return D

    targetNdc = float(Setting('FPS_ADS_TOP', -0.36))   # hand and fingers stay below this NDC (−0.36 = 0.18 screen heights)
    topWeight = float(Setting('FPS_ADS_TOP_WEIGHT', 6.0))
    fingerTopWeight = float(Setting('FPS_ADS_FINGER_TOP_WEIGHT', 0 if hipMode else 4.0))   # 0: visible fingers are fine if anatomical
    fingerTop = float(Setting('FPS_ADS_FINGER_TOP', targetNdc))
    reachWeight = float(Setting('FPS_ADS_REACH', 60))       # distal pad onto the wood
    anchorShift = float(Setting('FPS_ADS_ANCHOR_SHIFT', 60))  # palm translation cost near the roll anchor
    # Thumb along the upper left side of the stock, pointing at the muzzle (user sketch 2026-10-20):
    # {weapon: [pad y low, pad y high, thumb ceiling]} in gun-local mm. Unset: the older rule that
    # tucks the thumb under the index knuckle (it then hid in the web between thumb and index).
    thumbSide = Setting('FPS_ADS_THUMB_SIDE')
    thumbSide = json.loads(Path(thumbSide).read_text()).get(wid) if thumbSide else None
    thumbTop = float(Setting('FPS_ADS_THUMB_TOP', fingerTop))
    wrapWeight = float(Setting('FPS_ADS_WRAP', 0))   # index/middle curl under the wood instead of pointing forward
    penWeight = float(Setting('FPS_ADS_PEN', 300))   # skin closer than 0.6 mm to the rifle, per metre
    # {weapon: mm}: the whole index finger stays under this gun-local height, below the thumb band;
    # a straight index rising along the stock took the place the thumb belongs in.
    indexCeil = Setting('FPS_ADS_INDEX_CEIL')
    indexCeil = json.loads(Path(indexCeil).read_text()).get(wid) if indexCeil else None
    fingerCeilDigits = int(Setting('FPS_ADS_CEIL_DIGITS', 1))   # 4: no finger climbs the side past the thumb
    littleReach = float(Setting('FPS_ADS_LITTLE_REACH', .25))
    grid = Setting('FPS_ADS_GRID')   # {weapon: {theta, phi, dy}}: palm rolled about the fore-end axis, turned, lowered
    grid = json.loads(Path(grid).read_text()).get(wid) if grid else None
    extraSeeds = Setting('FPS_ADS_EXTRA_SEEDS')
    extraSeeds = json.loads(Path(extraSeeds).read_text()).get(wid, []) if extraSeeds else []
    # COD Type 38 ADS: the sleeve cuff sits ~0.30 screen heights left of and under the sight
    # line and the forearm runs from there to the lower-left corner.
    cuffTarget = json.loads(Setting('FPS_ADS_CUFF')) if Setting('FPS_ADS_CUFF') else None
    handLow = -0.62     # ...but the hand still shows above 0.31 screen heights under it
    # Finger roots (MCP joints) of the four fingers: they must stay near the wood
    # or the finger stage cannot close the digits onto it.
    roots = [chains[n]['W'].to_translation() for n in chains if chains[n]['segment'] == 0 and chains[n]['digit'] > 0]

    def PalmCost(p, detail=False):
        D = PalmDelta(p)
        moved = [D @ v for v in palmOnly]
        pen = max([max(0., .0005 - Signed(v, bvhAll)) for v in moved], default=0)
        volarGaps = sorted(((abs(Signed(D @ v)), D @ v) for v in volar), key=lambda pair: pair[0])
        allGaps = [g for g, v in volarGaps]
        contactX = sum(v.x for g, v in volarGaps[:40]) / 40
        rootGap = sum(max(0, abs(Signed(D @ r)) - .022) for r in roots)
        gaps = allGaps[:40]
        nearest, mean40 = gaps[0], sum(gaps) / len(gaps)
        share = allGaps[:max(40, int(len(allGaps) * .35))]
        meanShare = sum(share) / len(share)
        bend, reach = MinimumWristBend(D @ C0)
        # Where the wrist (sleeve cuff) lands on screen, in screen heights (x left -, y down +).
        wrist = (D @ C0 @ handFromContact).to_translation() - eye
        cuff = (wrist.x / -wrist.z / (2 * tanHalf), -wrist.y / -wrist.z / (2 * tanHalf))
        cuffMiss = math.hypot(cuff[0] - cuffTarget[0], cuff[1] - cuffTarget[1]) if cuffTarget else 0
        top, xs = Visible([D @ v for v, infl in handCloud])
        rightShare = sum(1 for x in xs if x > 0) / max(1, len(xs))
        cost = 400 * pen + 40 * max(0, mean40 - .003) + 60 * max(0, nearest - .002) + 40 * max(0, meanShare - .006)
        cost += .03 * max(0, bend - 22) + .2 * max(0, reach - .95)
        cost += 10 * max(0, contactX - centerX - .006) + 10 * max(0, centerX - .014 - contactX)
        # COD Type 38 ADS: the support hand shows left of the receiver, its top about
        # 0.19 screen heights under the sight line, the sleeve below it. Neither
        # hidden (v12 first cut) nor raised to the sight line (the original blob).
        cost += topWeight * max(0, top - targetNdc) + 6.0 * max(0, handLow - top) + 2.0 * rightShare + 8.0 * cuffMiss
        cost += .4 * Vector(p[3:6]).length + .02 * Vector(p[:3]).length
        if detail:
            return {'cost': cost, 'rootGapMm': rootGap * 1000, 'contactXMm': (contactX - centerX) * 1000, 'penMm': pen * 1000, 'nearestMm': nearest * 1000, 'mean40Mm': mean40 * 1000, 'meanShare35Mm': meanShare * 1000,
                    'minWristBend': bend, 'reachRatio': reach, 'topNdc': top, 'visible': len(xs), 'rightShare': rightShare,
                    'cuff': [round(cuff[0], 3), round(cuff[1], 3)]}
        return cost

    hip = PalmCost([0] * 6, True)
    print(json.dumps({'weapon': wid, 'stage': 'hip', **hip}), flush=True)
    pads = {d: (pkg['pads'][f'l{d}2']['bone'], Vector(pkg['pads'][f'l{d}2']['point'])) for d in range(5)}

    # Anatomical hinge limits (degrees), measured exactly like Script_FpsHandPoseTest:
    # twist of rest^-1 * q about the captured curl axis. PIP/DIP never bend backwards.
    # Hip keeps 1 deg of margin under the test's -5 so rounding the quaternions cannot cross it.
    HINGE = {(0, 1): (-4, 60), (0, 2): (-4, 80)} if hipMode else {(0, 1): (-5, 60), (0, 2): (-5, 80)}
    for d in range(1, 5):
        # PIP/DIP stay at or above straight. The MCP can extend passively 20-30 degrees, but a
        # raised knuckle over a curled PIP reads as a claw (HanYang middle -22 deg), so 10 at most.
        HINGE[(d, 0)], HINGE[(d, 1)], HINGE[(d, 2)] = (-10, 95), (0, 105), (0, 80)
        if hipMode:
            # Hip: the authored MCP (incl. its abduction/roll) stays; only a small delta is fitted.
            del HINGE[(d, 0)]

    def Hinge(name, q):
        c = chains[name]
        relative = c['restQ'].inverted() @ q
        if relative.w < 0:
            relative = Quaternion((-relative.w, -relative.x, -relative.y, -relative.z))
        axis = c['axisV'].normalized()
        projection = Vector((relative.x, relative.y, relative.z)).dot(axis)
        twist = Quaternion((relative.w, *(axis * projection)))
        twist = Quaternion() if twist.magnitude < 1e-10 else twist.normalized()
        flex = math.degrees(2 * math.atan2(Vector((twist.x, twist.y, twist.z)).dot(axis), twist.w))
        off = math.degrees((relative @ twist.inverted()).angle)
        return flex, off

    def AnatomyCost(quats):
        cost, worst = 0., []
        for name, q in quats.items():
            c = chains[name]
            limits = HINGE.get((c['digit'], c['segment']))
            if not limits:
                continue
            flex, off = Hinge(name, q)
            cost += .5 * (max(0, limits[0] - flex) + max(0, flex - limits[1]))
            if c['segment'] > 0:
                cost += .2 * max(0, off - 8)
            worst.append((name[-8:], round(flex, 1), round(off, 1)))
        return cost, worst

    hipHinges = [(n[-8:], *[round(v, 1) for v in Hinge(n, chains[n]['localQ'])]) for n in sorted(chains)]
    print(json.dumps({'weapon': wid, 'stage': 'hip-hinges', 'hinges': hipHinges}), flush=True)
    # Hip mode rebuilds only the PIP/DIP (thumb MCP/IP) joints that fail the FpsHandPoseTest
    # gate (flex < -5 or off-hinge > 8 deg). Passing joints keep their authored rotation and
    # get a flex delta about the curl axis, which leaves their off-hinge part unchanged.
    rebuilt = {n for n in chains if chains[n]['segment'] > 0
               and (Hinge(n, chains[n]['localQ'])[0] < -5 or Hinge(n, chains[n]['localQ'])[1] > 8)} if hipMode else set(chains)
    if hipMode:
        print(json.dumps({'weapon': wid, 'stage': 'hip-rebuilt', 'joints': sorted(n[-8:] for n in rebuilt)}), flush=True)

    def FK(D, digit, params):
        """Digits 1-4: [MCP flex, PIP flex, DIP flex, MCP spread]; thumb: [CMC x, y, z deltas
        on the authored CMC, MCP flex, IP flex]. PIP/DIP/thumb MCP/IP are rebuilt as pure
        hinges from the bind rest (rest @ hinge), like Script_FpsWeaponGripFit, so they can
        neither twist sideways nor bend backwards past the bounds."""
        transforms, rotations, quats, parent = {}, {}, {}, None
        for name in Bones(digit):
            c = chains[name]
            seg = c['segment']
            if digit == 0 and seg == 0:
                q = c['localQ'] @ Euler((params[0] * DEG, params[1] * DEG, params[2] * DEG), 'XYZ').to_quaternion()
            elif hipMode and seg == 0:
                # Hip MCP: authored rotation, then flex delta about the curl axis and spread delta.
                q = Quaternion(c['spreadV'], params[3] * DEG) @ c['localQ'] @ Quaternion(c['axisV'], params[0] * DEG)
            else:
                flex = params[3 + seg - 1] if digit == 0 else params[seg]
                q = (c['restQ'] if name in rebuilt else c['localQ']) @ Quaternion(c['axisV'], flex * DEG)
                if digit and seg == 0:
                    q = Quaternion(c['spreadV'], params[3] * DEG) @ q
            W = (D @ c['P'] if parent is None else parent) @ Matrix.LocRotScale(Vector(c['position']), q, Vector(c['scale']))
            transforms[name] = W @ c['W'].inverted()
            rotations[str(digit) + (str(seg) if seg else '')] = QA(q)
            quats[name] = q
            parent = W
        return transforms, rotations, quats

    def HipParams(digit):
        """Start from the authored hip grip's hinge angles, clamped into anatomy."""
        names = Bones(digit)
        flexes = [Hinge(n, chains[n]['localQ'])[0] if n in rebuilt else 0 for n in names]
        if digit == 0:
            return [0, 0, 0] + [max(HINGE[(0, k)][0], min(HINGE[(0, k)][1], flexes[k])) if names[k] in rebuilt else 0 for k in (1, 2)]
        if hipMode:
            return [0] + [max(HINGE[(digit, k)][0], min(HINGE[(digit, k)][1], flexes[k])) if names[k] in rebuilt else 0 for k in (1, 2)] + [0]
        return [max(HINGE[(digit, k)][0], min(HINGE[(digit, k)][1], flexes[k])) for k in range(3)] + [0]

    def FitFingers(D, quick=False, seeds=None):
        """Per digit deltas from the authored hip rotations under palm delta D.
        Gate (FpsHandContactTest): distal pad <= 4 mm (fit to 3.2), skin >= 0.6 mm off the wood."""
        authored, reports, total = {}, [], 0.
        indexKnuckle = (D @ chains[Bones(1)[0]]['W']).to_translation()
        for digit in range(5):
            pts = digitSamples.get(digit, [])
            if quick:
                pts = pts[::2]
            padBone, padPoint = pads[digit]
            padHip = chains[padBone]['W'] @ padPoint

            def Evaluate(params, detail=False):
                T, rotations, quats = FK(D, digit, params)
                anatomy, hinges = AnatomyCost(quats)
                pen, squared, distalGap, seen, drift = 0., 0., 1., [], 0.
                for index, (v, infl) in enumerate(pts):
                    moved = sum((((T[b] @ v) if b in T else (D @ v) if (b == handName or b in chains) else v) * w for b, w in infl), Vector()) * (1 / sum(w for b, w in infl))
                    if index % 3 == 0:
                        seen.append(moved)
                    # The package skin is posed in the authored hip grip.
                    drift += (moved - v).length_squared
                    signed = Signed(moved, bvhAll)
                    depth = max(0., .0006 - signed)
                    pen = max(pen, depth)
                    squared += depth * depth
                    if max(infl, key=lambda pair: pair[1])[0] == padBone:
                        distalGap = min(distalGap, signed)
                gap = max(abs(Signed(T[padBone] @ padHip)), distalGap)
                thumbShape, shape = 0., None
                if digit == 0 and thumbSide and not hipMode:
                    # The thumb lies on the left face of the stock, in its upper band, and points
                    # at the muzzle (at most ~15 deg up); no part of it rises over the stock edge.
                    pad = T[padBone] @ padHip
                    mcpName = Bones(0)[1]
                    mcp = T[mcpName] @ chains[mcpName]['W'].to_translation()
                    direction = (pad - mcp).normalized()
                    lo, hi, ceiling = (v / 1000 for v in thumbSide)
                    # Pitch in the side plane: 0-20 deg up toward the muzzle; turning in toward the wood is fine.
                    pitch = math.degrees(math.atan2(direction.y, max(1e-6, -direction.z)))
                    thumbShape = .1 * (max(0, -pitch) + max(0, pitch - 20)) + 4 * max(0, .5 - (-direction.z))
                    ipName = Bones(0)[2]
                    ip = T[ipName] @ chains[ipName]['W'].to_translation()
                    thumbShape += 200 * max(0, lo - .004 - ip.y)
                    thumbShape += 200 * (max(0, lo - pad.y) + max(0, pad.y - hi))
                    thumbShape += 200 * max(0, pad.x - (sideX + .004))
                    thumbShape += 200 * max(0, max(v.y for v in seen) - ceiling) if seen else 0
                    shape = {'padMm': [round(v * 1000, 1) for v in pad], 'direction': [round(v, 2) for v in direction], 'pitch': round(pitch, 1),
                             'ipMm': round(ip.y * 1000, 1), 'topMm': round(max(v.y for v in seen) * 1000, 1) if seen else None}
                if digit and digit <= fingerCeilDigits and indexCeil is not None and seen and not hipMode:
                    indexTop = max(v.y for v in seen)
                    thumbShape += 200 * max(0, indexTop - indexCeil / 1000)
                    shape = {**(shape or {}), 'indexTopMm': round(indexTop * 1000, 1)}
                elif digit and digit < 3 and wrapWeight and not hipMode:
                    # Index and middle wrap under the stock to its right side instead of lying
                    # straight forward along the left face.
                    pad = T[padBone] @ padHip
                    rootName = Bones(digit)[0]
                    mcp = T[rootName] @ chains[rootName]['W'].to_translation()
                    forward = (pad - mcp).normalized().dot(Vector((0, 0, -1)))
                    thumbShape = wrapWeight * (max(0, forward - .5) + 100 * max(0, (centerX - .004) - pad.x))
                    shape = {'padMm': [round(v * 1000, 1) for v in pad], 'forward': round(forward, 2)}
                elif digit == 0 and not thumbSide and not hipMode:
                    # Seen from the ADS eye a raised thumb tip stands beside the receiver as a
                    # lone stub. Keep it pointing forward along the wood and below the index
                    # knuckle, so the silhouette is the knuckle row of a holding hand.
                    pad = T[padBone] @ padHip
                    distal = T[padBone] @ chains[padBone]['W'].to_translation()
                    direction = (pad - distal).normalized()
                    thumbShape = 40 * max(0, pad.y - (indexKnuckle.y - .004)) + 2 * max(0, .8 - direction.dot(Vector((0, 0, -1))))
                # The little finger falls outside a 30-40 mm fore-end once the palm
                # cradles it; it only has to come close, not be wrenched onto the wood.
                reach = reachWeight * (littleReach if digit == 4 else 1)
                # Keep the digit behind the receiver from the ADS eye, as the palm is.
                top = TopNdc(seen, bvhAll) if fingerTopWeight or detail else -9
                driftRms = math.sqrt(drift / max(1, len(pts)))
                limit = thumbTop if digit == 0 else fingerTop
                cost = penWeight * pen + 30 * math.sqrt(squared / max(1, len(pts))) + reach * max(0, gap - .0032) + fingerTopWeight * max(0, top - limit) + thumbShape + anatomy
                cost += stayWeight * driftRms + .00004 * sum(abs(a) for a in params)
                return (cost, pen, gap, rotations, top, hinges, driftRms, shape) if detail else cost

            n = 5 if digit == 0 else 4
            spread = {1: 20, 2: 12, 3: 15, 4: 20}.get(digit, 0)
            # A kept (authored) joint takes a flex delta, a rebuilt one an absolute hinge angle.
            JointBounds = lambda k: HINGE[(digit, k)] if Bones(digit)[k] in rebuilt else (-25, 25)
            bounds = ([(-45, 45)] * 3 + [JointBounds(1), JointBounds(2)] if digit == 0
                      else [(-12, 12), JointBounds(1), JointBounds(2), (-10, 10)] if hipMode
                      else [HINGE[(digit, 0)], HINGE[(digit, 1)], HINGE[(digit, 2)], (-spread, spread)])
            hipStart = HipParams(digit)
            if hipMode and not rebuilt.intersection(Bones(digit)):
                after = Evaluate(hipStart, True)
                if after[1] <= 0 and after[2] <= .0032:
                    # Every joint passes and the digit neither enters the wood nor misses it: keep it exactly.
                    total += after[0]
                    authored.update(after[3])
                    reports.append({'digit': digit, 'kept': True, 'penMm': round(after[1] * 1000, 3), 'gapMm': round(after[2] * 1000, 3),
                                    'hinges': after[5], 'deltaDeg': hipStart, 'driftRmsMm': round(after[6] * 1000, 3)})
                    continue
                print(json.dumps({'weapon': wid, 'stage': 'hip-refit-contact', 'digit': digit, 'penMm': round(after[1] * 1000, 3), 'gapMm': round(after[2] * 1000, 3)}), flush=True)
            if digit == 0:
                starts = [hipStart, [0, 0, 0, 20, 15]]
                if hipMode:
                    starts += [[0, 0, 0, a, b] for a, b in ((0, 0), (10, 10), (30, 20))]
                if not quick:
                    starts += [[a, b, c, 20, 15] for a, b, c in ((20, 0, 0), (-20, 0, 0), (0, 20, 0), (0, -20, 0), (0, 0, 20), (0, 0, -20))]
            elif hipMode:
                starts = [hipStart] + [[m, hipStart[1] + p, hipStart[2] + d, 0] for m, p, d in
                                       ((0, 10, 10), (0, -10, 0), (0, 0, 20), (6, 15, 10), (-6, -5, 15))]
            else:
                starts = [hipStart, [25, 20, 10, 0], [45, 35, 20, 0], [70, 40, 20, 10], [70, 40, 20, -10]]
            if hipMode:
                starts = [[max(bounds[i][0], min(bounds[i][1], s[i])) for i in range(n)] for s in starts]
            if seeds and digit in seeds:
                starts = [seeds[digit]] + (starts[:2] if quick else starts)
            elif quick:
                starts = starts[:3]
            best, winner = math.inf, None
            for start in starts:
                params = start[:]
                local = Evaluate(params)
                for step in ([8, 4, 2] if quick else [12, 6, 3, 1.5, .75]):
                    for iteration in range(4 if quick else 6):
                        changed = False
                        for index in range(n):
                            for sign in (-1, 1):
                                trial = params[:]
                                trial[index] = max(bounds[index][0], min(bounds[index][1], trial[index] + sign * step))
                                score = Evaluate(trial)
                                if score < local - 1e-7:
                                    params, local, changed = trial, score, True
                        if not changed:
                            break
                if local < best:
                    best, winner = local, params[:]
            after = Evaluate(winner, True)
            total += after[0]
            authored.update(after[3])
            reports.append({'digit': digit, 'penMm': round(after[1] * 1000, 3), 'gapMm': round(after[2] * 1000, 3), 'topNdc': round(after[4], 3), 'hinges': after[5], 'deltaDeg': winner,
                            'driftRmsMm': round(after[6] * 1000, 3), 'cost': round(after[0], 3), **({'shape': after[7]} if after[7] else {})})
        return authored, reports, total

    # Palm: start from the hidden cradles the palm-only fit found (palm under the
    # wood, hand behind the receiver, wrist ~35 deg) and search a small neighbourhood
    # jointly with the fingers, so the palm is judged by whether all five digits close.
    seedsByWeapon = {'Type38': [.5, .08, -.3, 0, -.015, -.065], 'HanYang': [.5, .15, -.1, .0225, -.02, -.0415],
                     'ZhongZheng': [.64, .04, -.24, .015, -.014, -.009]}
    base = seedsByWeapon.get(wid, [0] * 6)
    fingerSeeds = {}

    anchor = {'params': None}

    def Joint(p, detail=False):
        D = PalmDelta(p)
        authored, reports, fingers = FitFingers(D, quick=True, seeds=fingerSeeds)
        palmCost = PalmCost(p)
        cost = palmCost + fingers
        if anchor['params']:
            # Stay near the anchored roll: the in-game sleeve/hand composition was chosen there.
            a = anchor['params']
            cost += 4 * math.sqrt(sum((p[i] - a[i]) ** 2 for i in (0, 1, 2, 6))) + anchorShift * math.sqrt(sum((p[i] - a[i]) ** 2 for i in (3, 4, 5)))
        if detail:
            return cost, palmCost, fingers, reports
        return cost

    fixedPalm = Setting('FPS_ADS_PALM')
    fixedPalm = json.loads(Path(fixedPalm).read_text()).get(wid) if fixedPalm else None
    if hipMode:
        fixedPalm = [0] * 7
    seedPalm = Setting('FPS_ADS_PALM_SEED')
    seedPalm = json.loads(Path(seedPalm).read_text()).get(wid) if seedPalm else None
    sweepOnly = Setting('FPS_ADS_SWEEP_ONLY')
    if sweepOnly:
        for phi in [float(x) for x in str(sweepOnly).split(',')]:
            detail = PalmCost(base[:] + [phi], True)
            print(json.dumps({'weapon': wid, 'stage': 'sweep-detail', 'phi': phi, **{k: (round(v, 3) if isinstance(v, float) else v) for k, v in detail.items()}}), flush=True)
        continue
    best, p = math.inf, None
    rollSeeds = Setting('FPS_ADS_ROLL_SEEDS')
    rollAnchor = Setting('FPS_ADS_ROLL_ANCHOR')
    if rollAnchor and not (fixedPalm or seedPalm):
        pivot = Vector(hipContact['position'])
        theta = float(rollAnchor)
        R = Matrix.Rotation(theta, 3, 'Z')
        t = foreEndCenter + R @ (pivot - foreEndCenter) - pivot
        anchor['params'] = [0, 0, theta, t.x, t.y, t.z, 0]
        seedPalm = anchor['params'][:]
    if rollSeeds and not (fixedPalm or seedPalm):
        # Hip grip turned about the fore-end axis: the thumb leaves the top edge for the left side.
        pivot = Vector(hipContact['position'])
        for theta in [float(x) for x in str(rollSeeds).split(',')]:
            R = Matrix.Rotation(theta, 3, 'Z')
            t = foreEndCenter + R @ (pivot - foreEndCenter) - pivot
            trial = [0, 0, theta, t.x, t.y, t.z, 0]
            cost, palmCost, fingers, reports = Joint(trial, True)
            detail = PalmCost(trial, True)
            print(json.dumps({'weapon': wid, 'stage': 'roll-seed', 'theta': theta, 'cost': round(cost, 4), 'palm': round(palmCost, 4),
                              'top': round(detail['topNdc'], 3), 'visible': detail['visible'], 'right': round(detail['rightShare'], 2),
                              'wrist': round(detail['minWristBend'], 1), 'cuff': detail['cuff'], 'gaps': [r['gapMm'] for r in reports]}), flush=True)
            if cost < best:
                best, p = cost, trial
    for trial in ([] if fixedPalm else extraSeeds):
        cost, palmCost, fingers, reports = Joint(list(trial), True)
        detail = PalmCost(list(trial), True)
        print(json.dumps({'weapon': wid, 'stage': 'extra-seed', 'seed': trial, 'cost': round(cost, 4), 'palm': round(palmCost, 4), 'fingers': round(fingers, 4),
                          'top': round(detail['topNdc'], 3), 'wrist': round(detail['minWristBend'], 1), 'gaps': [r['gapMm'] for r in reports]}), flush=True)
        if cost < best:
            best, p = cost, list(trial)
    if grid and not fixedPalm:
        pivot = Vector(hipContact['position'])
        for theta in grid['theta']:
            R = Matrix.Rotation(theta, 3, 'Z')
            t = foreEndCenter + R @ (pivot - foreEndCenter) - pivot
            for phi in grid['phi']:
                for dy in grid['dy']:
                    trial = [0, 0, theta, t.x, t.y + dy, t.z, phi]
                    cost, palmCost, fingers, reports = Joint(trial, True)
                    print(json.dumps({'weapon': wid, 'stage': 'grid', 'theta': theta, 'phi': phi, 'dy': dy, 'cost': round(cost, 3), 'palm': round(palmCost, 3),
                                      'digits': [round(r['cost'], 2) for r in reports], 'gaps': [r['gapMm'] for r in reports], 'pens': [r['penMm'] for r in reports]}), flush=True)
                    if cost < best:
                        best, p = cost, trial
    for phi in (() if fixedPalm or seedPalm or rollSeeds or grid else (-1.4, -1.0, -.6, -.3, 0, .3, .6, 1.0, 1.4)):
        trial = base[:] + [phi]
        cost, palmCost, fingers, reports = Joint(trial, True)
        print(json.dumps({'weapon': wid, 'stage': 'sweep', 'phi': phi, 'cost': round(cost, 4), 'palm': round(palmCost, 4),
                          'gaps': [r['gapMm'] for r in reports], 'pens': [r['penMm'] for r in reports]}), flush=True)
        if cost < best:
            best, p = cost, trial
    if fixedPalm:
        p = list(fixedPalm)
    elif seedPalm and not extraSeeds:
        p = list(seedPalm)
        best = Joint(p)
    print(json.dumps({'weapon': wid, 'stage': 'joint-start', 'cost': best, 'phi': p[6]}), flush=True)
    for step in ([] if fixedPalm else [.04, .02] if anchor['params'] else [.08, .04] if rollSeeds or grid else [.12, .06, .03]):
        for iteration in range(3):
            changed = False
            for index in range(7):
                scale = step if index < 3 or index == 6 else step * .08
                for sign in (-1, 1):
                    trial = p[:]
                    trial[index] += sign * scale
                    score = Joint(trial)
                    if score < best - 1e-6:
                        p, best, changed = trial, score, True
                        print(json.dumps({'weapon': wid, 'stage': 'joint', 'cost': round(best, 5), 'parameters': [round(v, 4) for v in p]}), flush=True)
            if not changed:
                break
    palmWinner = p
    palm = PalmCost(palmWinner, True)
    print(json.dumps({'weapon': wid, 'stage': 'palm', 'parameters': palmWinner, **palm}), flush=True)
    D = PalmDelta(palmWinner)
    C1 = D @ C0
    authored, digitReports, fingerCost = FitFingers(D)
    for report in digitReports:
        print(json.dumps({'weapon': wid, 'stage': 'finger', **report}), flush=True)

    results[wid] = {
        'contact': {'position': hipContact['position'] if hipMode else [round(v, 7) for v in C1.to_translation()],
                    'rotation': hipContact['rotation'] if hipMode else ToEulerYXZ(C1.to_3x3()),
                    'fingerRotations': authored},
        'palmParameters': [round(v, 6) for v in palmWinner],
        'palm': palm, 'hip': hip, 'digits': digitReports,
        'palmDelta': [list(row) for row in D],
    }

    # Review geometry: rifle and the posed left hand (hip and fitted ADS).
    collection = bpy.data.collections.get('AdsSupportGrip') or bpy.data.collections.new('AdsSupportGrip')
    if collection.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(collection)

    def Mesh(name, verts, faces, color):
        old = bpy.data.objects.get(name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([tuple(v) for v in verts], [], faces)
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        material = bpy.data.materials.get(name + '_Mat') or bpy.data.materials.new(name + '_Mat')
        material.diffuse_color = color
        obj.data.materials.append(material)
        # gun-local (+Y up, -Z forward) -> Blender (+Z up)
        obj.matrix_world = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
        return obj

    Mesh(f'{wid}_Rifle', vertices, [(i, i + 1, i + 2) for i in range(0, len(vertices), 3)], (.35, .22, .14, 1))
    fingerT = {}
    for digit in range(5):
        params = [0] * (5 if digit == 0 else 4)
        for report in digitReports:
            if report['digit'] == digit:
                params = report['deltaDeg']
        fingerT.update(FK(D, digit, params)[0])
    for label, transform in (('Hip', None), ('HipFit' if hipMode else 'Ads', True)):
        verts, faces, base = [], [], 0
        for mesh in pkg['skin']:
            count = len(mesh['pos']) // 3
            keep, remap = [], {}
            for i in range(count):
                infl = [(mesh['bones'][mesh['infl'][4 * i + k]], mesh['wts'][4 * i + k]) for k in range(4) if mesh['wts'][4 * i + k] > .001]
                owned = sum(w for b, w in infl if b == handName or b in chains)
                if owned < .5:
                    continue
                v = Vector(mesh['pos'][3 * i:3 * i + 3])
                if transform:
                    total = sum(w for b, w in infl)
                    v = sum((((fingerT[b] @ v) if b in fingerT else (D @ v) if b == handName else v) * w for b, w in infl), Vector()) * (1 / total)
                remap[i] = len(verts)
                verts.append(v)
            index = mesh['idx'] or list(range(count))
            for t in range(0, len(index), 3):
                a, b, c = index[t:t + 3]
                if a in remap and b in remap and c in remap:
                    faces.append((remap[a], remap[b], remap[c]))
        Mesh(f'{wid}_LeftHand{label}', verts, faces, (.86, .62, .5, 1) if transform else (.5, .6, .86, 1))
    print(json.dumps({'weapon': wid, 'elapsedS': round(time.time() - started, 1)}), flush=True)

outputName = 'Data_HipSupportGrips.json' if hipMode else 'Data_AdsSupportGrips.json'
(source / outputName).write_text(json.dumps(results, indent=1), encoding='utf-8')
print(json.dumps({'written': str(source / outputName), 'weapons': list(results)}), flush=True)

blend = Setting('FPS_GRIP_BLEND')
if blend:
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    print(json.dumps({'saved': str(blend)}), flush=True)
