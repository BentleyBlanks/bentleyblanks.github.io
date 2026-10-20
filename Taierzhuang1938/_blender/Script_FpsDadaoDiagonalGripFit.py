"""Refit both dadao hands' digits for the diagonal (30 degree) hilt grasp.

Run order (DadaoDiagonalGrip_20261021):
  1. node Taierzhuang1938/Script_FpsDadaoDiagonalGrip.mjs        rotates both palm frames only;
  2. node Taierzhuang1938/Script_FpsWeaponGripExport.mjs <dir> --only=Dadao --clean
     exports the actual skinned hands posed on the rotated palms plus the sword triangles;
  3. this script inside the task-owned Blender source.
Set FPS_GRIP_PROJECT_ROOT (the Taierzhuang1938 directory), FPS_GRIP_INPUT (step 2 folder)
and FPS_GRIP_SOURCE (the open .blend's directory).

Fingers 1-4: hinge corrections on top of the exported local rotations (MCP/PIP/DIP about the
anatomical axis, MCP spread). Skin stays out of the hilt (1.3 mm tolerance, as the scanned-hand
fit) and the pad rests on the hilt surface. A diagonal hilt changes where it crosses each finger,
so the corrections are larger than the earlier small trims.
Thumb: power grasp. Its pad bears on the curled index's proximal phalanx (refit first), outside
the hilt and the index skin; it does not reach for the guard or the pommel ring.
Palm: a rigid +/-20 mm slide seats the diagonal hilt before the digits are refit; the slide is
added to the contact position. Writes Dadao right/left position and fingerRotations into
Data_FpsWeaponGrips.mjs (palm orientation comes from Script_FpsDadaoDiagonalGrip.mjs).
"""
import bpy, json, math, re
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree

root = Path(FPS_GRIP_PROJECT_ROOT).resolve()
folder = Path(FPS_GRIP_INPUT).resolve()
source = Path(FPS_GRIP_SOURCE).resolve()
assert Path(bpy.data.filepath).resolve().parent == source, 'Open the task-owned source before fitting'
M = lambda a: Matrix([a[i::4] for i in range(4)])
Q = lambda a: Quaternion((a[3], *a[:3]))
QA = lambda q: [round(v, 9) for v in (q.x, q.y, q.z, q.w)]
PEN = .0013

pkg = json.loads((folder / 'Data_Dadao.json').read_text())
assert pkg['weapon'] == 'Dadao', pkg['weapon']
vertices = [Vector(t[i:i + 3]) for t in pkg['gun'] for i in (0, 3, 6)]
bvh = BVHTree.FromPolygons(vertices, [(i, i + 1, i + 2) for i in range(0, len(vertices), 3)])
boneWorlds = dict(zip(pkg['boneNames'], map(M, pkg['boneMatrices'])))
inverse = M(pkg['weaponMatrix']).inverted()


def Depth(point, tree=bvh, reach=.022):
    hit, normal, _, distance = tree.find_nearest(point)
    return distance if hit is not None and distance < reach and (point - hit).dot(normal) < -1e-6 else 0.


# Every skinned vertex as per-bone contributions in weapon space (exact LBS replay).
vertexParts = []
for skin in pkg['skin']:
    transforms = [inverse @ boneWorlds[name] @ M(bind) @ M(skin['bindMatrix']) for name, bind in zip(skin['bones'], skin['inverseBinds'])]
    faces = skin['idx'] or list(range(len(skin['rest']) // 3))
    offset = len(vertexParts)
    for i in range(len(skin['rest']) // 3):
        infl = [(skin['bones'][skin['infl'][4 * i + k]], skin['wts'][4 * i + k], skin['infl'][4 * i + k]) for k in range(4) if skin['wts'][4 * i + k] > 1e-6]
        rest = Vector(skin['rest'][3 * i:3 * i + 3])
        parts = [(name, w, transforms[index] @ rest) for name, w, index in infl]
        replay = sum((p * w for _, w, p in parts), Vector())
        assert (replay - Vector(skin['pos'][3 * i:3 * i + 3])).length < 3e-6, 'LBS replay mismatch'
        vertexParts.append(parts)
    skin['_offset'] = offset
allFaces = [[skin['_offset'] + j for j in (skin['idx'] or [])[i:i + 3]] for skin in pkg['skin'] for i in range(0, len(skin['idx'] or []), 3)]


def Owner(parts):
    return max(parts, key=lambda part: part[1])[0]


def Posed(parts, transforms):
    return sum(((transforms[name] @ p if name in transforms else p) * w for name, w, p in parts), Vector())


reports, rotationsBySide, current = [], {}, {}
for side, key in [('r', 'right'), ('l', 'left')]:
    chains = {name: {**c, 'W': M(c['world']), 'P': M(c['parentWorld']), 'q': Q(c['local']), 'axisV': Vector(c['axis']), 'spreadV': Vector(c['spreadAxis'])}
              for name, c in pkg['chain'][side].items()}
    Names = lambda digit: sorted([n for n in chains if re.search(r'finger' + str(digit) + r'[12]?$', n, re.I)], key=len)
    byDigit = {}
    for index, parts in enumerate(vertexParts):
        match = re.search(r'([rl])[_ ]?finger(\d)(\d)?$', Owner(parts), re.I)
        if match and match[1].lower() == side:
            byDigit.setdefault(int(match[2]), []).append(index)
    rotations = {}
    current[side] = {}
    handBone = next(n for n in pkg['boneNames'] if re.search(r'_' + side.upper() + r'_Hand$', n))
    handIndices = [i for i, parts in enumerate(vertexParts) if re.search(r'_' + side.upper() + r'_(Hand|Finger\d+)$', Owner(parts))]
    padPoints = [chains[pkg['pads'][f'{side}{d}2']['bone']]['W'] @ Vector(pkg['pads'][f'{side}{d}2']['point']) for d in range(5)]
    handChain = {handBone, *chains}

    # The rotation pivots on the old grip point, so the hilt now crosses the
    # index root. Slide the rigid hand (current curls) to seat the diagonal hilt,
    # exactly as the original grip fit trims the palm (+/-20 mm here).
    def RigidCost(offset, full=False):
        D = Matrix.Translation(Vector(offset))
        rigid = {name: D for name in handChain}
        pick = handIndices if full else handIndices[::8]
        pen = max((Depth(Posed(vertexParts[i], rigid)) for i in pick), default=0.)
        gaps = sum(max(0., bvh.find_nearest(D @ p)[3] - .003) for p in padPoints[1:])
        return 220 * max(0., pen - .0015) + 12 * gaps + 3 * Vector(offset).length, pen
    offset = [0., 0., 0.]
    best = RigidCost(offset)[0]
    for step in [.008, .004, .002, .001]:
        for _ in range(5):
            changed = False
            for index in range(3):
                for sign in (-1, 1):
                    trial = offset.copy()
                    trial[index] = max(-.02, min(.02, trial[index] + sign * step))
                    value = RigidCost(trial)[0]
                    if value < best - 1e-7:
                        offset, best, changed = trial, value, True
            if not changed:
                break
    palm = Matrix.Translation(Vector(offset))
    current[side][handBone] = palm
    palmOffsets = globals().setdefault('palmOffsets', {})
    palmOffsets[key] = [round(v, 7) for v in offset]
    print(json.dumps({'side': side, 'palmOffsetMm': [round(v * 1000, 2) for v in offset], 'rigidPenMm': round(RigidCost(offset, True)[1] * 1000, 3)}), flush=True)

    def FK(digit, parameters):
        transforms, local, parent = {handBone: palm}, {}, None
        for segment, name in enumerate(Names(digit)):
            c = chains[name]
            q = c['q'].copy()
            if digit == 0 and segment == 0:
                for axis, angle in zip([(1, 0, 0), (0, 1, 0), (0, 0, 1)], parameters[:3]):
                    q = q @ Quaternion(axis, math.radians(angle))
            else:
                q = q @ Quaternion(c['axisV'], math.radians(parameters[segment + 2] if digit == 0 else parameters[segment]))
                if segment == 0:
                    q = Quaternion(c['spreadV'], math.radians(parameters[3])) @ q
            world = (palm @ c['P'] if parent is None else parent) @ Matrix.LocRotScale(Vector(c['position']), q, Vector(c['scale']))
            transforms[name] = world @ c['W'].inverted()
            local[str(digit) + (str(segment) if segment else '')] = QA(q)
            parent = world
        return transforms, local

    def Search(evaluate, size, limits, seeds):
        best, winner = math.inf, [0.] * size
        for seed in seeds:
            p = list(seed)
            score = evaluate(p)[0]
            for step in [12, 6, 3, 1.5, .75, .375]:
                for _ in range(6):
                    changed = False
                    for index in range(size):
                        for sign in (-1, 1):
                            trial = p.copy()
                            trial[index] = max(-limits[index], min(limits[index], trial[index] + sign * step))
                            value = evaluate(trial)[0]
                            if value < score - 1e-7:
                                p, score, changed = trial, value, True
                    if not changed:
                        break
            full = evaluate(p, True)[0]
            if full < best:
                best, winner = full, p
        return winner

    # Fingers 1-4 against the hilt surface.
    for digit in range(1, 5):
        indices = byDigit[digit]
        pad = pkg['pads'][f'{side}{digit}2']
        padPoint = chains[pad['bone']]['W'] @ Vector(pad['point'])

        def Evaluate(parameters, full=False, digit=digit, indices=indices, pad=pad, padPoint=padPoint):
            transforms, local = FK(digit, parameters)
            pick = indices if full else indices[::max(1, len(indices) // 300)]
            depths = [Depth(Posed(vertexParts[i], transforms)) for i in pick]
            pen = max(depths, default=0.)
            rms = math.sqrt(sum(max(0., d - PEN) ** 2 for d in depths) / max(1, len(depths)))
            tip = transforms[pad['bone']] @ padPoint
            _, _, _, gap = bvh.find_nearest(tip)
            score = 400 * max(0., pen - PEN) + 35 * rms + 180 * max(0., gap - .001) + .000015 * sum(p * p for p in parameters)
            return score, pen, gap, local, transforms
        before = Evaluate([0.] * 4, True)
        winner = Search(Evaluate, 4, [45, 50, 45, 14], [[0, 0, 0, 0], [12, -10, 0, 0], [-12, 10, 0, 0], [0, 18, 12, 0], [0, -18, -12, 0], [20, 15, 10, 0]])
        after = Evaluate(winner, True)
        rotations.update(after[3])
        current[side].update(after[4])
        reports.append({'side': side, 'digit': digit, 'beforePenMm': round(before[1] * 1000, 3), 'beforeGapMm': round(before[2] * 1000, 3),
                        'penMm': round(after[1] * 1000, 3), 'gapMm': round(after[2] * 1000, 3), 'offsetDeg': winner})
        print(json.dumps(reports[-1]), flush=True)

    # Thumb: power grasp over the refit index.
    indexNames = set(Names(1))
    indexVertices = [Posed(parts, current[side]) for parts in vertexParts]
    indexWeight = [sum(w for name, w, _ in parts if name in indexNames) for parts in vertexParts]
    proximal = Names(1)[0]
    proximalWeight = [sum(w for name, w, _ in parts if name == proximal) for parts in vertexParts]
    indexFaces = [f for f in allFaces if min(indexWeight[j] for j in f) > .2 and max(indexWeight[j] for j in f) > .7]
    proximalFaces = [f for f in allFaces if min(proximalWeight[j] for j in f) > .4]
    indexBvh = BVHTree.FromPolygons(indexVertices, indexFaces)
    proximalBvh = BVHTree.FromPolygons(indexVertices, proximalFaces)
    thumbNames = Names(0)
    thumbIndices = byDigit[0]
    pad = pkg['pads'][f'{side}02']
    padPoint = chains[pad['bone']]['W'] @ Vector(pad['point'])

    # Contact anywhere on the outer surface of the index's proximal or middle
    # phalanx (whichever the thumb reaches without entering the sword).
    middle = Names(1)[1]
    middleWeight = [sum(w for name, w, _ in parts if name == middle) for parts in vertexParts]
    middleBvh = BVHTree.FromPolygons(indexVertices, [f for f in allFaces if min(middleWeight[j] for j in f) > .4])

    def MakeEvaluate(surface):
        def EvaluateThumb(parameters, full=False):
            transforms, local = FK(0, parameters)
            pick = thumbIndices if full else thumbIndices[::max(1, len(thumbIndices) // 300)]
            weaponPen = selfPen = 0.
            deepest = None
            for i in pick:
                point = Posed(vertexParts[i], transforms)
                depth = Depth(point)
                if depth > weaponPen:
                    weaponPen, deepest = depth, point
                selfPen = max(selfPen, Depth(point, indexBvh, .025))
            tip = transforms[pad['bone']] @ padPoint
            gap = surface.find_nearest(tip)[3]
            score = 400 * max(0., weaponPen - .001) + 400 * max(0., selfPen - .001) + 220 * max(0., gap - .001) + .00001 * sum(p * p for p in parameters)
            return score, weaponPen, selfPen, gap, local, transforms, deepest
        return EvaluateThumb

    span = [-60, -40, -20, 0, 20, 40, 60]
    results = []
    for label, surface in [('proximal', proximalBvh), ('middle', middleBvh)]:
        grid = []
        for a in span:
            for b in span:
                for c in span:
                    for f1 in (0, 25, 50):
                        for f2 in (0, 30, 60):
                            p = [a, b, c, f1, f2]
                            tip = FK(0, p)[0][pad['bone']] @ padPoint
                            grid.append((surface.find_nearest(tip)[3], p))
        grid.sort(key=lambda item: item[0])
        evaluate = MakeEvaluate(surface)
        winner = Search(evaluate, 5, [75, 75, 75, 70, 80], [p for _, p in grid[:12]] + [[0, 0, 0, 0, 0]])
        results.append((evaluate(winner, True), winner, label, grid[0][0]))
    after, winner, label, coarse = min(results, key=lambda item: item[0][0])
    rotations.update(after[4])
    current[side].update(after[5])
    reports.append({'side': side, 'digit': 0, 'target': label, 'indexGapMm': round(after[3] * 1000, 3),
                    'weaponPenMm': round(after[1] * 1000, 3), 'indexPenMm': round(after[2] * 1000, 3), 'offsetDeg': winner,
                    'deepestWeaponPoint': [round(v, 4) for v in after[6]] if after[6] is not None else None,
                    'alternatives': [{'target': r[2], 'score': round(r[0][0], 4), 'gapMm': round(r[0][3] * 1000, 3),
                                      'weaponPenMm': round(r[0][1] * 1000, 3)} for r in results]})
    print(json.dumps(reports[-1]), flush=True)
    rotationsBySide[key] = rotations

# The two hands share a 20 cm hilt. Report the closest approach of their skins.
from mathutils.kdtree import KDTree
handSets = {side: [i for i, parts in enumerate(vertexParts) if re.search(r'_' + side.upper() + r'_(Hand|Finger\d+)$', Owner(parts))]
            for side in ('r', 'l')}
both = {**current['r'], **current['l']}
rightPoints = [Posed(vertexParts[i], both) for i in handSets['r'][::2]]
leftPoints = [Posed(vertexParts[i], both) for i in handSets['l'][::2]]
leftTree = KDTree(len(leftPoints))
for i, point in enumerate(leftPoints):
    leftTree.insert(point, i)
leftTree.balance()
gapBetweenHands = min((leftTree.find(point)[2] for point in rightPoints), default=math.inf)

modulePath = root / 'Data_FpsWeaponGrips.mjs'
text = modulePath.read_text(encoding='utf-8')
marker = 'export const FPS_WEAPON_GRIPS = FreezeTree('
start = text.index(marker) + len(marker)
end = text.rindex(');')
config = json.loads(text[start:end])
for key, rotations in rotationsBySide.items():
    config['Dadao'][key]['fingerRotations'].update(rotations)
    # Relative to the exported palm, so rerunning on the same export is idempotent.
    config['Dadao'][key]['position'] = [round(v + d, 9) for v, d in zip(pkg['contacts'][key]['position'], palmOffsets[key])]
modulePath.write_text(text[:start] + json.dumps(config, separators=(',', ':')) + text[end:], encoding='utf-8')
result = {'task': 'DadaoDiagonalGrip_20261021', 'input': str(folder), 'penetrationToleranceMm': PEN * 1000,
          'closestHandSkinMm': round(gapBetweenHands * 1000, 3), 'digits': reports,
          'palms': {key: {'rotation': config['Dadao'][key]['rotation'], 'position': config['Dadao'][key]['position'],
                          'offsetMm': [v * 1000 for v in palmOffsets[key]]} for key in ('right', 'left')}}
(source / 'Data_DadaoDiagonalGripFit.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
textName = 'Script_FpsDadaoDiagonalGripFit.py'
block = bpy.data.texts.get(textName) or bpy.data.texts.new(textName)
block.clear()
block.write((root / '_blender' / textName).read_text(encoding='utf-8'))
print(json.dumps({'closestHandSkinMm': result['closestHandSkinMm'], 'written': str(modulePath)}), flush=True)
