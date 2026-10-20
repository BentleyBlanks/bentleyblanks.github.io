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
rifle). Fingers: per digit deltas from the authored hip rotations within normal
abduction, distal pads on the fore-end, skin >= 0.6 mm off the wood, also kept
behind the receiver. On a 30-40 mm fore-end the cradled little finger lies outside
the wood and stays tucked (see docs/Data_FpsRifleView20261016.md v12).

FPS_ADS_PALM (json {weapon: palm params}) reruns the fingers on fixed palms;
FPS_ADS_PALM_SEED refines from given palms; FPS_ADS_SWEEP_ONLY prints palm costs.
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
    shoulder = anchorToGun @ Vector(frame['shoulderAnchor'])
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
                        'localQ': Q(c['local'])}
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

    def TopNdc(points, tree=None):
        tree = tree or bvh
        top = -9
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
        return top

    def PalmDelta(p):
        rotation = Euler((p[0], p[1], p[2]), 'XYZ').to_matrix().to_4x4()
        pivot = Vector(hipContact['position'])
        D = Matrix.Translation(pivot + Vector(p[3:6])) @ rotation @ Matrix.Translation(-pivot)
        if len(p) > 6 and p[6]:
            # Turn the hand about its own palm normal (contact-frame Y) so the four
            # fingers can lie across the fore-end instead of along it.
            D = D @ C0 @ Matrix.Rotation(p[6], 4, 'Y') @ C0inv
        return D

    targetNdc = -0.45
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
        top = TopNdc([D @ v for v, infl in handCloud])
        cost = 400 * pen + 40 * max(0, mean40 - .003) + 60 * max(0, nearest - .002) + 40 * max(0, meanShare - .006)
        cost += .03 * max(0, bend - 22) + .2 * max(0, reach - .95)
        cost += 10 * max(0, contactX - centerX - .006) + 10 * max(0, centerX - .014 - contactX)
        cost += 6.0 * max(0, top - targetNdc)
        cost += .4 * Vector(p[3:6]).length + .02 * Vector(p[:3]).length
        if detail:
            return {'cost': cost, 'rootGapMm': rootGap * 1000, 'contactXMm': (contactX - centerX) * 1000, 'penMm': pen * 1000, 'nearestMm': nearest * 1000, 'mean40Mm': mean40 * 1000, 'meanShare35Mm': meanShare * 1000,
                    'minWristBend': bend, 'reachRatio': reach, 'topNdc': top}
        return cost

    hip = PalmCost([0] * 6, True)
    print(json.dumps({'weapon': wid, 'stage': 'hip', **hip}), flush=True)
    pads = {d: (pkg['pads'][f'l{d}2']['bone'], Vector(pkg['pads'][f'l{d}2']['point'])) for d in range(5)}

    def FK(D, digit, params):
        transforms, rotations, parent = {}, {}, None
        for name in Bones(digit):
            c = chains[name]
            seg = c['segment']
            q = c['localQ'].copy()
            if digit == 0 and seg == 0:
                q = q @ Euler((params[0] * DEG, params[1] * DEG, params[2] * DEG), 'XYZ').to_quaternion()
            else:
                curl = params[3 + seg - 1] if digit == 0 else params[seg]
                q = q @ Quaternion(c['axisV'], curl * DEG)
                if seg == 0:
                    q = Quaternion(c['spreadV'], params[3] * DEG) @ q
            W = (D @ c['P'] if parent is None else parent) @ Matrix.LocRotScale(Vector(c['position']), q, Vector(c['scale']))
            transforms[name] = W @ c['W'].inverted()
            rotations[str(digit) + (str(seg) if seg else '')] = QA(q)
            parent = W
        return transforms, rotations

    def FitFingers(D, quick=False, seeds=None):
        """Per digit deltas from the authored hip rotations under palm delta D.
        Gate (FpsHandContactTest): distal pad <= 4 mm (fit to 3.2), skin >= 0.6 mm off the wood."""
        authored, reports, total = {}, [], 0.
        for digit in range(5):
            pts = digitSamples.get(digit, [])
            if quick:
                pts = pts[::2]
            padBone, padPoint = pads[digit]
            padHip = chains[padBone]['W'] @ padPoint

            def Evaluate(params, detail=False):
                T, rotations = FK(D, digit, params)
                pen, squared, distalGap, seen = 0., 0., 1., []
                for index, (v, infl) in enumerate(pts):
                    moved = sum((((T[b] @ v) if b in T else (D @ v) if (b == handName or b in chains) else v) * w for b, w in infl), Vector()) * (1 / sum(w for b, w in infl))
                    if index % 3 == 0:
                        seen.append(moved)
                    signed = Signed(moved, bvhAll)
                    depth = max(0., .0006 - signed)
                    pen = max(pen, depth)
                    squared += depth * depth
                    if max(infl, key=lambda pair: pair[1])[0] == padBone:
                        distalGap = min(distalGap, signed)
                gap = max(abs(Signed(T[padBone] @ padHip)), distalGap)
                # The little finger falls outside a 30-40 mm fore-end once the palm
                # cradles it; it only has to come close, not be wrenched onto the wood.
                reach = 15 if digit == 4 else 60
                # Keep the digit behind the receiver from the ADS eye, as the palm is.
                top = TopNdc(seen, bvhAll)
                cost = 300 * pen + 30 * math.sqrt(squared / max(1, len(pts))) + reach * max(0, gap - .0032) + 4 * max(0, top - targetNdc)
                cost += .00004 * sum(abs(a) for a in params)
                return (cost, pen, gap, rotations, top) if detail else cost

            n = 5 if digit == 0 else 4
            spread = {1: 15, 2: 12, 3: 15, 4: 18}.get(digit, 0)
            bounds = [(-45, 45)] * 3 + [(-40, 40)] * 2 if digit == 0 else [(-40, 90), (-40, 70), (-40, 60), (-spread, spread)]
            starts = [[0] * n] if digit == 0 else [[0] * n, [25, 20, 10, 0], [45, 35, 20, 0], [70, 40, 20, 10], [70, 40, 20, -10]]
            if digit == 0 and not quick:
                starts += [[20, 0, 0, 0, 0], [-20, 0, 0, 0, 0], [0, 20, 0, 0, 0], [0, -20, 0, 0, 0], [0, 0, 20, 0, 0], [0, 0, -20, 0, 0]]
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
            reports.append({'digit': digit, 'penMm': round(after[1] * 1000, 3), 'gapMm': round(after[2] * 1000, 3), 'topNdc': round(after[4], 3), 'deltaDeg': winner})
        return authored, reports, total

    # Palm: start from the hidden cradles the palm-only fit found (palm under the
    # wood, hand behind the receiver, wrist ~35 deg) and search a small neighbourhood
    # jointly with the fingers, so the palm is judged by whether all five digits close.
    seedsByWeapon = {'Type38': [.5, .08, -.3, 0, -.015, -.065], 'HanYang': [.5, .15, -.1, .0225, -.02, -.0415],
                     'ZhongZheng': [.64, .04, -.24, .015, -.014, -.009]}
    base = seedsByWeapon.get(wid, [0] * 6)
    fingerSeeds = {}

    def Joint(p, detail=False):
        D = PalmDelta(p)
        authored, reports, fingers = FitFingers(D, quick=True, seeds=fingerSeeds)
        palmCost = PalmCost(p)
        cost = palmCost + fingers
        if detail:
            return cost, palmCost, fingers, reports
        return cost

    fixedPalm = Setting('FPS_ADS_PALM')
    fixedPalm = json.loads(Path(fixedPalm).read_text()).get(wid) if fixedPalm else None
    seedPalm = Setting('FPS_ADS_PALM_SEED')
    seedPalm = json.loads(Path(seedPalm).read_text()).get(wid) if seedPalm else None
    sweepOnly = Setting('FPS_ADS_SWEEP_ONLY')
    if sweepOnly:
        for phi in [float(x) for x in str(sweepOnly).split(',')]:
            detail = PalmCost(base[:] + [phi], True)
            print(json.dumps({'weapon': wid, 'stage': 'sweep-detail', 'phi': phi, **{k: round(v, 3) for k, v in detail.items()}}), flush=True)
        continue
    best, p = math.inf, None
    for phi in (() if fixedPalm or seedPalm else (-1.4, -1.0, -.6, -.3, 0, .3, .6, 1.0, 1.4)):
        trial = base[:] + [phi]
        cost, palmCost, fingers, reports = Joint(trial, True)
        print(json.dumps({'weapon': wid, 'stage': 'sweep', 'phi': phi, 'cost': round(cost, 4), 'palm': round(palmCost, 4),
                          'gaps': [r['gapMm'] for r in reports], 'pens': [r['penMm'] for r in reports]}), flush=True)
        if cost < best:
            best, p = cost, trial
    if fixedPalm:
        p = list(fixedPalm)
    elif seedPalm:
        p = list(seedPalm)
        best = Joint(p)
    print(json.dumps({'weapon': wid, 'stage': 'joint-start', 'cost': best, 'phi': p[6]}), flush=True)
    for step in ([] if fixedPalm else [.12, .06, .03]):
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
        'contact': {'position': [round(v, 7) for v in C1.to_translation()], 'rotation': ToEulerYXZ(C1.to_3x3()),
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
    for label, transform in (('Hip', None), ('Ads', True)):
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

(source / 'Data_AdsSupportGrips.json').write_text(json.dumps(results, indent=1), encoding='utf-8')
print(json.dumps({'written': str(source / 'Data_AdsSupportGrips.json'), 'weapons': list(results)}), flush=True)

blend = Setting('FPS_GRIP_BLEND')
if blend:
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    print(json.dumps({'saved': str(blend)}), flush=True)
