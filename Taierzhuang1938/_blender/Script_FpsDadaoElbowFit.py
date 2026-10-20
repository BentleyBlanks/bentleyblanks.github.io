"""Fit continuous anatomical elbows to the current Blender-authored stroke.

Run the author first, consume its exported guard in the runtime, then export a
fresh Script_DadaoSwingTest.mjs --trace --export-source trace. FPS_GRIP_PROJECT_ROOT
and FPS_GRIP_SOURCE are required; FPS_DADAO_TRACE optionally overrides the trace
path. This script rejects a stale trace by comparing every recorded weapon
rotation with the current authored curve, rather than trusting file dates.
"""
import bpy, base64, hashlib, importlib.util, json, math, re, time
import numpy as np
from pathlib import Path

fitStarted = time.perf_counter()


def FitPhase(stage, **details):
    line = json.dumps({'task': 'FpsDadaoElbowFit', 'stage': stage,
                       'elapsedSeconds': round(time.perf_counter() - fitStarted, 3), **details})
    print(line, flush=True)
    if globals().get('FPS_DADAO_FIT_PHASE_LOG'):
        with Path(FPS_DADAO_FIT_PHASE_LOG).open('a', encoding='utf-8') as handle:
            handle.write(line + '\n')
            handle.flush()


FitPhase('entered')

root = Path(FPS_GRIP_PROJECT_ROOT).resolve()
source = Path(FPS_GRIP_SOURCE).resolve()
task = globals().get('FPS_GRIP_TASK', 'FpsGripConformity_20261015')
assert Path(bpy.data.filepath).resolve().parent == source, 'Open this task source before fitting elbows'
tracePath = Path(globals().get('FPS_DADAO_TRACE', root / '_shots/DadaoPower/Acceptance/Data_DadaoSwingTrace.json'))
trace = json.loads(tracePath.read_text(encoding='utf-8'))
module = (root / 'Data_FpsDadaoSwing.mjs').read_text(encoding='utf-8')
data = json.loads(re.search(r'export const FPS_DADAO_SWING\s*=\s*(\{.*\});', module, re.S).group(1))
assert data.get('authoringTask') == task, 'Author the task-owned stroke first'
gripModule = (root / 'Data_FpsWeaponGrips.mjs').read_text(encoding='utf-8')
config = json.loads(re.search(r'export const FPS_WEAPON_GRIPS\s*=\s*FreezeTree\((\{.*\})\);', gripModule, re.S).group(1))['Dadao']
clip = next(clip for clip in trace['clips'] if clip['action'] == 'Light')
frames = clip['frames']
assert len(frames) == 121 and len(trace.get('sourceFrames', [])) == len(frames), 'Export --trace --export-source together'
start = clip['windup'] / clip['duration']
end = (clip['windup'] + clip['active']) / clip['duration']


def SourceTime(t):
    return (t / start * data['cutStart'] if t < start else
            data['cutStart'] + (t - start) / (end - start) * (data['cutEnd'] - data['cutStart']) if t < end else
            data['cutEnd'] + (t - end) / (1 - end) * (1 - data['cutEnd']))


def Sample(t):
    f = t * (len(data['frames']) - 1)
    i = min(len(data['frames']) - 2, int(f))
    mix = f - i
    a, b = data['frames'][i:i + 2]
    values = [x + (y - x) * mix for x, y in zip(a, b)]
    # Mirror Three.js Quaternion.slerp(...).normalize() using float64. Blender's
    # mathutils interpolation is a different sampler; using it for this check
    # produced a false stale-trace result on the current runtime matrices.
    q = Slerp(np.array(a[3:7], dtype=np.float64), np.array(b[3:7], dtype=np.float64), mix)
    return values, q


def Multiply(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return np.array([ax * bw + aw * bx + ay * bz - az * by,
                     ay * bw + aw * by + az * bx - ax * bz,
                     az * bw + aw * bz + ax * by - ay * bx,
                     aw * bw - ax * bx - ay * by - az * bz], dtype=np.float64)


def Slerp(a, b, t):
    cosine = float(np.dot(a, b))
    if cosine < 0:
        b, cosine = -b, -cosine
    # The bundled three.core.js uses NLERP for dot >= .9995. Do not substitute
    # a generic SLERP here: its tiny phase difference is visible in strict
    # matrix comparisons even when both rotations look identical.
    if cosine < .9995:
        angle = math.acos(cosine)
        sine = math.sin(angle)
        result = (math.sin((1 - t) * angle) * a + math.sin(t * angle) * b) / sine
    else:
        result = (1 - t) * a + t * b
    return result / np.linalg.norm(result)


def EulerYXZ(values):
    x, y, z = values
    qy = np.array((0, math.sin(y / 2), 0, math.cos(y / 2)))
    qx = np.array((math.sin(x / 2), 0, 0, math.cos(x / 2)))
    qz = np.array((0, 0, math.sin(z / 2), math.cos(z / 2)))
    return Multiply(Multiply(qy, qx), qz)


def QuaternionMatrix(q):
    x, y, z, w = q / np.linalg.norm(q)
    return np.array(((1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)),
                     (2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)),
                     (2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y))), dtype=np.float64)


def Matrix4(values):
    return np.array(values).reshape(4, 4).T


guard = EulerYXZ(data['guardWeaponRotation'])
rotationError = 0
rotationMatrixError = 0
for f in frames:
    row, delta = Sample(SourceTime(f['t']))
    actual = Matrix4(f['weapon'])[:3, :3]
    actual /= np.linalg.norm(actual, axis=0)[None, :]
    expected = QuaternionMatrix(Multiply(delta, guard))
    rotationMatrixError = max(rotationMatrixError, float(np.abs(expected - actual).max()))
    angle = math.degrees(math.acos(np.clip((np.trace(expected.T @ actual) - 1) / 2, -1, 1)))
    rotationError = max(rotationError, angle)
assert rotationError < .02, f'Stale trace or runtime guard mismatch: {rotationError} degrees'
assert rotationMatrixError < 2e-5, f'Trace rotation matrix mismatch: {rotationMatrixError}'
assert trace.get('strokeControlSignature') == data['strokeControlSignature'], 'Trace stroke signature missing or mismatched'
FitPhase('source_verified', signature=data['strokeControlSignature'])

shoulderPlan = json.loads((root / '_blender/Data_FpsDadaoShoulderBelt.json').read_text(encoding='utf-8'))
clearancePlan = shoulderPlan['forearmClearance']
surfacePath = root / 'Model/Model_Dadao.tzm.json'
assert hashlib.sha256(surfacePath.read_bytes()).hexdigest() == shoulderPlan['weaponSurfaceSha256'], 'Recheck sleeve clearance against the changed sword surface'
surfaceData = json.loads(surfacePath.read_text(encoding='utf-8'))
surfaceTriangles = []
modelRotation = QuaternionMatrix(EulerYXZ(data['modelRotation']))
for mesh in surfaceData['meshes']:
    positions = np.frombuffer(base64.b64decode(mesh['pos']), dtype='<u2').reshape(-1, 3)
    positions = np.array(mesh['posMin']) + positions * np.array(mesh['posScale'])
    indices = np.frombuffer(base64.b64decode(mesh['idx']), dtype='<u4' if mesh['idxBits'] == 32 else '<u2').reshape(-1, 3)
    surfaceTriangles.extend((positions @ modelRotation.T)[indices])
surfaceTriangles = np.asarray(surfaceTriangles)
surfaceLo, surfaceHi = surfaceTriangles.min((0, 1)), surfaceTriangles.max((0, 1))


def SurfaceDistance(points):
    answer = []
    a, b, c = [surfaceTriangles[None, :, i] for i in range(3)]
    ab, ac = b - a, c - a
    normal = np.cross(ab, ac)
    nn = np.sum(normal * normal, axis=2)
    for start in range(0, len(points), 24):
        p = points[start:start + 24, None, :]
        u = np.sum(np.cross(p - a, ac) * normal, axis=2) / np.maximum(nn, 1e-30)
        v = np.sum(np.cross(ab, p - a) * normal, axis=2) / np.maximum(nn, 1e-30)
        projected = a + u[:, :, None] * ab + v[:, :, None] * ac
        best = np.sum((p - projected) ** 2, axis=2)
        best[(u < 0) | (v < 0) | (u + v > 1) | (np.broadcast_to(nn, best.shape) < 1e-25)] = np.inf
        for first, second in [(a, b), (b, c), (c, a)]:
            edge = second - first
            fraction = np.clip(np.sum((p - first) * edge, axis=2) / np.maximum(np.sum(edge * edge, axis=2), 1e-30), 0, 1)
            closest = first + fraction[:, :, None] * edge
            best = np.minimum(best, np.sum((p - closest) ** 2, axis=2))
        answer.extend(np.sqrt(best.min(axis=1)))
    return np.asarray(answer)


def ForearmClearances(elbows, wrist, weapon, radius):
    lo, hi = clearancePlan['fractionRange']
    fractions = np.linspace(lo, hi, clearancePlan['samples'])
    points = elbows[:, None, :] + (wrist[None, None, :] - elbows[:, None, :]) * fractions[None, :, None]
    halfStep = np.linalg.norm(wrist - elbows, axis=1) * (hi - lo) / (len(fractions) - 1) * .5
    scale = np.linalg.norm(weapon[:3, :3], axis=0)
    assert np.ptp(scale) < 2e-5, 'Clearance expects the affine render layer removed by armAnchor'
    scale = float(scale.mean())
    local = (np.c_[points.reshape(-1, 3), np.ones(points.size // 3)] @ np.linalg.inv(weapon).T)[:, :3]
    distances = np.linalg.norm(np.maximum(np.maximum(surfaceLo - local, local - surfaceHi), 0), axis=1)
    threshold = np.repeat((radius + halfStep + clearancePlan['marginMeters']) / scale, len(fractions))
    near = np.where(distances < threshold + 1e-8)[0]
    if len(near):
        distances[near] = SurfaceDistance(local[near])
    # Distance to a surface is 1-Lipschitz. Subtracting half the sample step
    # certifies the complete middle segment, including between samples.
    return distances.reshape(len(elbows), -1).min(1) * scale - radius - halfStep

boneIndices = {''.join(c for c in name.lower() if c.isalnum()): i for i, name in enumerate(trace['boneNames'])}


def BonePoint(i, side, role):
    index = next(index for name, index in boneIndices.items() if name.endswith(side + role))
    cameraFromAnchor = Matrix4(trace['sourceFrames'][i]['weapon']) @ np.linalg.inv(Matrix4(frames[i]['weapon']))
    return (np.linalg.inv(cameraFromAnchor) @ Matrix4(trace['sourceFrames'][i]['bones'][index]))[:3, 3]


geometryPath = root / '_blender/Script_FpsDadaoSleeveGeometry.py'
geometrySpec = importlib.util.spec_from_file_location('DadaoActualSleeveGeometry', geometryPath)
geometryModule = importlib.util.module_from_spec(geometrySpec)
geometrySpec.loader.exec_module(geometryModule)
# The final runtime gate is1mm. Reserve20um for the validated candidate bone
# rotation reconstruction (<10um), not an enlarged circular cloth envelope.
sleeveGeometry = geometryModule.SleeveGeometry(root, trace, surfaceTriangles, clearancePlan['marginMeters'] + .00002)


theta = np.arange(360) * 2 * math.pi / 360
chosen, metrics = {}, []
for side, key in [('r', 'right'), ('l', 'left')]:
    FitPhase('elbow_circle_begin', side=side)
    u = np.linalg.norm(BonePoint(0, side, 'upperarm') - BonePoint(0, side, 'forearm'))
    l = np.linalg.norm(BonePoint(0, side, 'forearm') - BonePoint(0, side, 'hand'))
    contactDirection = QuaternionMatrix(EulerYXZ(config[key]['rotation'])) @ np.array((0, 0, 1), dtype=np.float64)
    contactNormal = QuaternionMatrix(EulerYXZ(config[key]['rotation'])) @ np.array((0, 1, 0), dtype=np.float64)
    candidates, poles, valid, preference, bends, clearances = [], [], [], [], [], []
    maximumReachRatio = 0
    for i, f in enumerate(frames):
        t = SourceTime(f['t'])
        if i % 30 == 0:
            FitPhase('elbow_circle_frame', side=side, frame=i, sourceTime=t)
        shoulder = BonePoint(i, side, 'upperarm')
        wrist = np.array(f['right' if side == 'r' else 'left'])
        direction = wrist - shoulder
        distance = np.linalg.norm(direction)
        maximumReachRatio = max(maximumReachRatio, distance / (u + l))
        assert distance < (u + l) * .999, f'Unreachable wrist: {side} {t} {distance / (u + l)}'
        direction /= distance
        cosine = np.clip((u * u + distance * distance - l * l) / (2 * u * distance), -1, 1)
        radius = u * math.sqrt(max(0, 1 - cosine * cosine))
        reference = np.array(config['bodyHip']['elbowPoles'][key], dtype=float)
        reference -= direction * np.dot(reference, direction)
        reference /= np.linalg.norm(reference)
        across = np.cross(direction, reference)
        normals = reference[None, :] * np.cos(theta)[:, None] + across[None, :] * np.sin(theta)[:, None]
        elbow = shoulder + direction * (u * cosine) + normals * radius
        weaponMatrix = Matrix4(f['weapon'])
        weapon = weaponMatrix[:3, :3].copy()
        weapon /= np.linalg.norm(weapon, axis=0)[None, :]
        forward = weapon @ contactDirection
        forward /= np.linalg.norm(forward)
        lower = wrist[None, :] - elbow
        lower /= np.linalg.norm(lower, axis=1)[:, None]
        bend = np.arccos(np.clip(lower @ forward, -1, 1)) * 180 / math.pi
        allowed = bend <= 63.8
        # With a narrow-side sword grasp the hand may finish below the elbow.
        # Screen Y is not a collision measure. Pre-screen only the middle bone
        # centerline here; real garment triangles are checked on the DP path.
        clearance = np.full(len(theta), -np.inf)
        tested = np.where(allowed)[0]
        if len(tested):
            clearance[tested] = ForearmClearances(elbow[tested], wrist, weaponMatrix, 0.)
            allowed[tested] &= clearance[tested] >= clearancePlan['marginMeters'] - 1e-8
        if not np.any(allowed):
            bestClearance = float(clearance[np.isfinite(clearance)].max()) if np.any(np.isfinite(clearance)) else -math.inf
            raise RuntimeError(f'No wrist/elbow solution: {side} sourceTime={t:.4f}, minimum wrist={bend.min():.3f}, best certified sleeve clearance={bestClearance * 1000:.3f}mm')
        if i in [0, len(frames) - 1]:
            relaxed = min(63.8, max(35, float(bend.min()) + 12))
            allowed &= bend <= relaxed + .25
            choices = np.where(allowed)[0]
            choices = choices[np.argsort(np.linalg.norm(normals[choices] - reference, axis=1))]
            winner = next((int(index) for index in choices if sleeveGeometry.Check(i, side, elbow[index], wrist, weapon @ contactNormal, weaponMatrix)['clearanceM'] >= sleeveGeometry.margin - 1e-9), None)
            assert winner is not None, f'No real sleeve-clear guard elbow: {side}'
            allowed[:] = False
            allowed[winner] = True
        candidates.append(elbow)
        poles.append(normals)
        valid.append(allowed)
        bends.append(bend)
        clearances.append(clearance)
        preference.append(.00002 * np.sum((normals - reference) ** 2, axis=1))
    points, valid = np.array(candidates), np.array(valid)
    FitPhase('continuous_path_begin', side=side)
    # A sleeve that meets the blade at one elbow angle usually meets it at the
    # neighbouring angles too; drop a +/-12 degree band so the search converges.
    for collisionPass in range(24):
        parents = []
        cost = np.where(valid[0], preference[0], np.inf)
        for i in range(1, len(frames)):
            travel = np.sum((points[i - 1, :, None, :] - points[i, None, :, :]) ** 2, axis=2)
            transitions = cost[:, None] + travel
            parent = np.argmin(transitions, axis=0)
            cost = transitions[parent, np.arange(len(theta))] + preference[i]
            cost[~valid[i]] = np.inf
            parents.append(parent)
        assert np.isfinite(cost).any(), f'No continuous sleeve-clear elbow path: {side}'
        index = int(np.argmin(cost))
        indices = [index]
        for parent in reversed(parents):
            index = int(parent[index])
            indices.append(index)
        indices.reverse()
        selected = points[np.arange(len(frames)), indices]
        actualSleeveRows, invalid = [], []
        for i, f in enumerate(frames):
            weaponMatrix = Matrix4(f['weapon'])
            rotation = weaponMatrix[:3, :3].copy()
            rotation /= np.linalg.norm(rotation, axis=0)[None, :]
            measured = sleeveGeometry.Check(i, side, selected[i], np.array(f[key]), rotation @ contactNormal, weaponMatrix)
            actualSleeveRows.append(measured)
            if measured['clearanceM'] < sleeveGeometry.margin - 1e-9:
                valid[i, (indices[i] + np.arange(-12, 13)) % len(theta)] = False
                invalid.append(i)
        FitPhase('actual_sleeve_path', side=side, passIndex=collisionPass, invalidFrames=invalid)
        if not invalid:
            break
    else:
        raise RuntimeError(f'Actual sleeve geometry still intersects the sword: {side}')
    maximumStep = float(np.linalg.norm(np.diff(selected, axis=0), axis=1).max())
    assert maximumStep < .085, f'Elbow branch jump: {side} {maximumStep}'
    chosen[side] = [poles[i][index].tolist() for i, index in enumerate(indices)]
    metrics.append({'side': side, 'maximumElbowStepM': maximumStep,
                    'maximumWristBendDeg': max(float(bends[i][index]) for i, index in enumerate(indices)),
                    'minimumCertifiedSleeveClearanceM': min(row['clearanceM'] for row in actualSleeveRows),
                    'sleeveGeometrySubmeshes': sorted(set(name for row in actualSleeveRows for name in row['submeshes'])),
                    'sleeveGeometryTrianglesTested': sum(row['testedSleeveTriangles'] for row in actualSleeveRows),
                    'maximumReachRatio': maximumReachRatio})
    FitPhase('side_complete', **metrics[-1])
rows = [[round(SourceTime(f['t']), 9), *chosen['r'][i], *chosen['l'][i]] for i, f in enumerate(frames)]
result = {'source': 'Blender anatomical elbow circles', 'authoringTask': task,
          'strokeControlSignature': data['strokeControlSignature'], 'traceRotationErrorDeg': rotationError,
          'traceRotationMatrixError': rotationMatrixError,
          'forearmClearance': {'method': 'All actual GLB sleeve submeshes with weighted LBS; clipped middle20–68% triangles against actual sword triangles; no circular cloth envelope',
                              'fractionRange': clearancePlan['fractionRange'], 'marginMeters': clearancePlan['marginMeters'],
                              'candidateReconstructionReserveMeters': .00002},
          'metrics': metrics, 'rows': rows}
(root / '_blender/Data_FpsDadaoElbowPoles.json').write_text(json.dumps(result, separators=(',', ':')), encoding='utf-8')
(source / 'Data_FpsDadaoElbowFit.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
textName = 'Script_FpsDadaoElbowFit.py'
text = bpy.data.texts.get(textName) or bpy.data.texts.new(textName)
text.clear()
text.write((root / '_blender' / textName).read_text(encoding='utf-8'))
geometryText = bpy.data.texts.get(geometryPath.name) or bpy.data.texts.new(geometryPath.name)
geometryText.clear()
geometryText.write(geometryPath.read_text(encoding='utf-8'))
print(json.dumps({'strokeControlSignature': data['strokeControlSignature'], 'metrics': metrics,
                  'traceRotationErrorDeg': rotationError, 'traceRotationMatrixError': rotationMatrixError}), flush=True)
