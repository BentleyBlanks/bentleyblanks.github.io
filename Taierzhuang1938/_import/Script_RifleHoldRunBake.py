"""RifleHoldRun: a two-hand rifle run cycle on the shared TengxianHumanoidV1 rig, authored through Blender.

Run Script_RifleHoldRunPrepare.mjs first, then (from the task worktree root):

  set RIFLE_HOLD_RUN_PROJECT=<worktree>/Taierzhuang1938
  node scripts/Script_BlenderMcp.mjs start --batch Taierzhuang1938/_import/Script_RifleHoldRunBake.py --task RifleHoldRun

Nothing is copied from an existing clip. The cycle is generated from a ballistic centre-of-mass model:

  * time:    one cycle = two steps. Each foot is on the ground for GAIT.stanceShare of the cycle and the two
             feet share a flight phase (both off the ground) between a toe-off and the next touchdown.
  * mass:    the whole-body centre of mass (de Leva 1996 segment masses, Zatsiorsky-Seluyanov adjusted, male) follows
             a prescribed path: free-fall parabola in flight, a half-sine ground-reaction force in stance (braking then
             propulsion horizontally), a small lateral sway. The pelvis is solved per frame so the posed body's centre
             of mass sits on that path.
  * feet:    planted feet roll heel -> flat -> ball about points that stay fixed on the ground (the character frame
             moves back at the run speed); swing feet follow a quintic path between the toe-off and touchdown states
             so position and velocity are continuous. Each sole is measured on the real skinned mesh and put at the
             floor (stance) or kept above it (swing).
  * trunk:   forward lean with a steady head; the pelvis turns one way, the chest the other.
  * arms:    both hands ride the rifle, the rifle rides the chest (two-bone IK per arm, hand shape from IjaGuardPort),
             with a soft shoulder/elbow mount (spring, share GAIT.rifleMountShare) so the rifle lags the chest a little.

Environment: RIFLE_HOLD_RUN_PROJECT (required), RIFLE_HOLD_RUN_GAIT='{"name": value}' overrides GAIT entries,
RIFLE_HOLD_RUN_NOWRITE=1 measures without writing, RIFLE_HOLD_RUN_RENDER=1 + RIFLE_HOLD_RUN_ROUND/VIEWS/FRAMES write review tiles.

Authoring unit: Blender metres = runtime metres of the 1.66 m NRA actor, so g = 9.81 is literal. The exporter divides the
translations by `authoringFactor` to write the shipped GLB's node units. Output: Animation/RifleHoldRun/
Animation_TengxianRifleHoldRun.json (three.js AnimationClip JSON + a weapon track) and an editable .blend outside
the repository. Review renders go to tmp/RifleHoldRun/Sheets/<ROUND>/.
"""
import bpy, os, json, math, runpy, hashlib, base64, struct
from pathlib import Path
from mathutils import Matrix, Vector, Quaternion

project = Path(os.environ['RIFLE_HOLD_RUN_PROJECT'])
os.environ['CAPTIVES_PROJECT'] = str(project)
os.environ['CAPTIVES_SKIP_BLEND'] = '1'
source = json.loads((project.parent / 'tmp/RifleHoldRun/Data_RifleHoldRunSource.json').read_text())
helpers = runpy.run_path(str(project / '_import/Script_MachineGunCaptivesBake.py'), run_name='RifleHoldRunHelpers')
helpers['AUTHORING_SCALE']['TengxianNra02'] = 1.0     # Blender metres = runtime metres (see docstring)
convert = helpers['convert']
private = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/RifleHoldRun_20261021')
output = project / 'Animation/RifleHoldRun'
ROUND = os.environ.get('RIFLE_HOLD_RUN_ROUND', 'Scratch')
sheets = project.parent / 'tmp/RifleHoldRun/Sheets' / ROUND
private.mkdir(parents=True, exist_ok=True)
output.mkdir(parents=True, exist_ok=True)

REVISION = '20261021RifleHoldRunV1'
G = 9.81
# ---------------------------------------------------------------------------------------------------- parameters
GAIT = dict(
    cycleS=0.72,            # one left+right cycle: 167 steps/min
    keys=30,                # keyframes per cycle (about 42 Hz)
    speedMps=3.2,           # run speed the cycle is authored for (character frame travels at this speed)
    stanceShare=0.3333,     # foot-on-ground share of the cycle (0.24 s)
    comTdHeight=0.885,      # centre-of-mass height at touchdown / toe-off (m)
    brakeAccel=2.6,         # peak horizontal braking/propulsion acceleration (m/s^2)
    swayM=0.014,            # lateral centre-of-mass sway amplitude
    footHalfWidth=0.070,    # lateral distance of each planted foot from the midline
    tdAhead=0.17,           # ankle ahead of the centre of mass at touchdown (m)
    heelTdPitch=-0.10,      # foot pitch at touchdown (heel up +, so negative = toes up)
    toePitch=0.95,          # foot pitch at toe-off
    heelRockShare=0.12, flatEndShare=0.55,   # stance shares: heel rocker ends, ball rocker starts
    pitchHandOff=0.20, ankleRelaxed=0.32,   # share of the swing over which toe-off / touchdown pitch hand over to the relaxed ankle
    landingDropMps=-1.2,    # vertical ankle speed at touchdown
    swingClear=0.12,        # extra ankle height at the swing apex (m)
    liftRise=0.14, liftHold=0.70, liftDrop=0.82,   # swing lift: peak by liftRise, lowered to liftHold by liftDrop, down to the touchdown at 1
    pelvisYawDeg=6.0, chestYawDeg=5.0, pelvisRollDeg=3.0, pelvisTiltDeg=2.0,
    leanDeg=[11.0, 19.0, 25.0, 29.0, 24.0, 8.0],     # world forward pitch of Pelvis, Spine, Spine1, Spine2, Neck, Head
    headYawShare=0.15,
    clearance=0.003,        # sole height of a planted foot (m)
    # rifle (heading frame: x left, y forward, z up; metres from the pelvis joint) and the two grips
    rifleGrip=(-0.12, 0.33, 0.26),
    rifleAxis=(0.78, 0.42, 0.46),
    gripSpan=0.34,
    rifleMountHz=1.7, rifleMountDamping=0.7, rifleMountShare=0.4, rifleChestYawShare=0.3,
    poleR=(-0.35, -0.10, -0.40), poleL=(0.35, -0.30, -0.40),
)
GAIT.update(json.loads(os.environ.get('RIFLE_HOLD_RUN_GAIT', '{}')))
T, N = GAIT['cycleS'], GAIT['keys']
TS = GAIT['stanceShare'] * T            # stance time of one foot
TF = (T / 2 - TS)                       # flight time between toe-off and the other foot's touchdown
V = GAIT['speedMps']
assert TF > 0

# Segment masses and centre-of-mass fractions: de Leva (1996), Zatsiorsky-Seluyanov adjusted, male (see SegmentCom below).

def Smooth(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def Quintic(u, p0, v0, a0, p1, v1, a1, d):
    """Quintic Hermite on u in [0,1] over a duration d (v, a per second)."""
    u2, u3, u4, u5 = u * u, u ** 3, u ** 4, u ** 5
    h0 = 1 - 10 * u3 + 15 * u4 - 6 * u5
    h1 = u - 6 * u3 + 8 * u4 - 3 * u5
    h2 = .5 * u2 - 1.5 * u3 + 1.5 * u4 - .5 * u5
    h3 = 10 * u3 - 15 * u4 + 6 * u5
    h4 = -4 * u3 + 7 * u4 - 3 * u5
    h5 = .5 * u3 - u4 + .5 * u5
    return h0 * p0 + h1 * d * v0 + h2 * d * d * a0 + h3 * p1 + h4 * d * v1 + h5 * d * d * a1


def S5(x):
    x = max(0.0, min(1.0, x))
    return x * x * x * (10 - 15 * x + 6 * x * x)


def SwingLift(u):
    """Extra ankle height through the swing: up fast (heel kick / knee drive), a slow lowering, a late drop to the touchdown.
    Zero value, slope and curvature at both ends, so the swing joins the stance paths smoothly."""
    a, hold, b = GAIT['liftRise'], GAIT['liftHold'], GAIT['liftDrop']
    if u < a:
        return S5(u / a)
    if u < b:
        return 1 - (1 - hold) * S5((u - a) / (b - a))
    return hold * (1 - S5((u - b) / (1 - b)))


def WQ(yaw=0.0, roll=0.0, pitch=0.0):
    """World rotation: pitch about +X (forward lean +) first, then roll about +Y (left side down +), then yaw about +Z (left +)."""
    return Quaternion((0, 0, 1), yaw) @ Quaternion((0, 1, 0), roll) @ Quaternion((1, 0, 0), pitch)


def Gait(s, l, z):
    """Gait coordinates (forward, left, up) -> Blender world (+X left, -Y forward, +Z up)."""
    return Vector((l, -s, z))


# ---------------------------------------------------------------------------------------------------- centre of mass
def ComPath():
    """Prescribed centre-of-mass path over one step (touchdown at 0): returns functions of time in the step.

    Vertical: stance has a half-sine ground reaction force whose peak makes the impulse close the free fall of
    the flight (symmetric about mid-stance); flight is the parabola. Horizontal (relative to the mean frame):
    braking then propulsion as -A sin(2 pi t / ts), no force in flight, mean velocity zero. Both are integrated
    numerically on a fine grid (periodic by construction)."""
    steps = 2000
    dt = (TS + TF) / steps
    A = math.pi * G * (TS + TF) / (2 * TS)                 # peak of GRF/m so that the stance impulse closes the flight
    ax_peak = GAIT['brakeAccel']
    z, vz, x, vx = 0.0, -G * TF / 2, 0.0, 0.0
    # horizontal: choose the starting speed so that the mean over the step is zero (done in a second pass)
    rows = []
    vx0 = 0.0
    for _ in range(2):
        z, vz, x, vx = 0.0, -G * TF / 2, 0.0, vx0
        rows = []
        for i in range(steps + 1):
            t = i * dt
            rows.append((t, x, z, vx, vz))
            if t < TS:
                az = A * math.sin(math.pi * t / TS) - G
                ax = -ax_peak * math.sin(2 * math.pi * t / TS)
            else:
                az, ax = -G, 0.0
            vz += az * dt
            z += vz * dt
            vx += ax * dt
            x += vx * dt
        mean = sum(r[3] for r in rows) / len(rows)
        vx0 -= mean
    # close tiny integration drift so the path is exactly periodic: subtract the linear residual
    t_end, x_end, z_end = rows[-1][0], rows[-1][1], rows[-1][2]
    out = []
    for t, x, z, vx, vz in rows:
        u = t / t_end
        out.append((t, x - x_end * u, z - z_end * u))
    return out


COM_ROWS = ComPath()


def RifleSoftMount():
    """Rifle height relative to the chest through the soft shoulder/elbow mount: a damped spring driven by the
    centre-of-mass bob (steady state over a few cycles). Returns a function of the cycle time: rifle - chest (m)."""
    wn = 2 * math.pi * GAIT['rifleMountHz']
    zeta = GAIT['rifleMountDamping']
    steps = 4000
    dt = T / steps
    # chest height ~ CoM bob
    def Chest(t):
        return ComAt(t % T)[1]
    x, v = Chest(0.0), 0.0
    series = []
    for cycle in range(6):
        series = []
        for i in range(steps):
            t = i * dt
            c = Chest(t)
            cv = (Chest(t + dt) - Chest(t - dt)) / (2 * dt)
            a = -2 * zeta * wn * (v - cv) - wn * wn * (x - c)
            v += a * dt
            x += v * dt
            series.append(x - c)
    cs = [Chest(i * dt) for i in range(steps)]
    xs = [r + c for r, c in zip(series, cs)]
    amp = lambda v: (max(v) - min(v)) / 2
    print('RIFLE_MOUNT chest amp %.4f  rifle amp %.4f  relative amp %.4f' % (amp(cs), amp(xs), amp(series)), flush=True)
    share = GAIT['rifleMountShare']
    return lambda t: share * series[int((t % T) / T * steps) % steps]


RIFLE_REL_Z = None   # set in Bake(): the soft-mount rifle height relative to the chest


def ComAt(t):
    """(x, z) centre-of-mass offset at time t of the cycle (touchdown of the left foot at 0)."""
    step = T / 2
    k = int(t // step)
    local = t - k * step
    local = min(local, COM_ROWS[-1][0])
    i = min(len(COM_ROWS) - 2, int(local / COM_ROWS[-1][0] * (len(COM_ROWS) - 1)))
    a, b = COM_ROWS[i], COM_ROWS[i + 1]
    w = (local - a[0]) / max(1e-12, b[0] - a[0])
    return a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w


def Bake(ctx):
    arm, names = ctx['arm'], ctx['names']
    Bone, Put, Point, BWorld, Update, Aim = [ctx[k] for k in ['Bone', 'Put', 'Point', 'BWorld', 'Update', 'Aim']]
    factor = ctx['authoringFactor']
    prefix = 'Bip001 '
    meshes = ctx['meshes']

    def SourceMatrix(flat):
        m = Matrix([flat[i::4] for i in range(4)])
        m.translation *= factor
        return convert @ m

    def Imported(pose):
        return {n: SourceMatrix(pose[n]) @ ctx['corrections'][n].inverted() for n in names}

    rest, ready = Imported(source['rest']), Imported(source['ready'])
    restQ = {n: rest[n].to_quaternion() for n in names}
    R = lambda n: rest[prefix + n].translation.copy()          # rest joint position (Blender metres)
    RQ = lambda n: restQ[prefix + n]
    for n in names:                                              # the bake starts from the bind pose
        Put(arm.pose.bones[n], rest[n])
    Update()

    # ---- rig measurements ----------------------------------------------------------------------------------
    L1 = (R('L Thigh') - R('L Calf')).length
    L2 = (R('L Calf') - R('L Foot')).length
    soleSets = {s: ctx['GroupSets'](lambda n, s=s: (s + ' Foot') in n or (s + ' Toe') in n) for s in 'LR'}

    def Evaluated(sets):
        dg = bpy.context.evaluated_depsgraph_get()
        pts = []
        for o, idx in zip(meshes, sets):
            if not idx:
                continue
            ev = o.evaluated_get(dg)
            geo = ev.to_mesh()
            mat = ev.matrix_world
            pts.extend(mat @ geo.vertices[i].co for i in idx)
            ev.to_mesh_clear()
        return pts

    def SoleMin(side):
        return min(p.z for p in Evaluated(soleSets[side]))

    foot = {}
    for side in 'LR':
        pts = Evaluated(soleSets[side])
        floor = min(p.z for p in pts)
        low = [p for p in pts if p.z < floor + .02]
        heelY = max(p.y for p in low)
        ankle, toe = R(side + ' Foot'), R(side + ' Toe0')
        foot[side] = dict(floor=floor, heel=Vector((ankle.x, heelY - .015, floor)), ball=Vector((toe.x, toe.y, floor)), ankle=ankle, toe=toe,
                          ankleFromHeel=None)
        foot[side]['ankleFromHeel'] = ankle - foot[side]['heel']
        foot[side]['ankleFromBall'] = ankle - foot[side]['ball']
        foot[side]['heelToBall'] = foot[side]['ball'] - foot[side]['heel']
        foot[side]['ankleFromToe'] = ankle - toe
    print('FOOT', {s: {k: tuple(round(c, 4) for c in v) if isinstance(v, Vector) else round(v, 4) for k, v in foot[s].items()} for s in 'LR'}, flush=True)
    side_sign = {'L': 1.0, 'R': -1.0}

    # ---- centre of mass -------------------------------------------------------------------------------------
    def SegmentCom():
        pts = {n: Point(arm.pose.bones[n]) for n in names}
        P = lambda n: pts[prefix + n]
        total = Vector()
        mass = 0.0
        parts = []
        neck, head = P('Neck'), P('Head')
        parts.append((.0694, neck + (head - neck).normalized() * .11))
        shoulder = P('Neck')
        parts.append((.4346, shoulder + (P('Pelvis') - shoulder) * .5138))
        for side in 'LR':
            ua, fa, ha = P(side + ' UpperArm'), P(side + ' Forearm'), P(side + ' Hand')
            parts.append((.0271, ua + (fa - ua) * .5772))
            parts.append((.0162, fa + (ha - fa) * .4574))
            fingers = sum((P(side + ' Finger' + str(i)) for i in range(1, 5)), Vector()) / 4
            parts.append((.0061, ha + (fingers - ha) * .79))
            th, ca, ft, to = P(side + ' Thigh'), P(side + ' Calf'), P(side + ' Foot'), P(side + ' Toe0')
            parts.append((.1416, th + (ca - th) * .4095))
            parts.append((.0433, ca + (ft - ca) * .4459))
            parts.append((.0137, ft + (to - ft) * .55))
        for m, p in parts:
            total += p * m
            mass += m
        return total / mass

    # ---- foot model -----------------------------------------------------------------------------------------
    A_SHARE, B_SHARE = GAIT['heelRockShare'], GAIT['flatEndShare']
    tdAhead = GAIT['tdAhead']

    def StanceFoot(side, tau):
        """Planted foot, tau seconds after touchdown (0..TS). Returns ankle (gait coords s,l,z), foot pitch, toe pitch, pivot."""
        f = foot[side]
        tA, tB = A_SHARE * TS, B_SHARE * TS
        l = side_sign[side] * GAIT['footHalfWidth']
        a_fwd = -f['ankleFromHeel'].y              # ankle is this far ahead of the heel pivot (flat foot)
        heel_s0 = tdAhead - a_fwd                  # heel pivot at touchdown (gait s)
        Rx = lambda p: Quaternion((1, 0, 0), p)
        ToGait = lambda off: Vector((-off.y, off.x, off.z))
        if tau < tA:
            pitch = GAIT['heelTdPitch'] * (1 - Smooth(tau / tA))
            pivot = Vector((heel_s0 - V * tau, l, 0.0))
            return pivot + ToGait(Rx(pitch) @ f['ankleFromHeel']), pitch, pitch, 'heel'
        if tau < tB:
            pivot = Vector((heel_s0 - V * tau, l, 0.0))
            return pivot + ToGait(f['ankleFromHeel']), 0.0, 0.0, 'flat'
        w = (tau - tB) / (TS - tB)
        pitch = GAIT['toePitch'] * w ** 1.5
        # the foot rolls over the toe joint (Toe0), which stays on the ground, flat, at the place the flat foot put it
        toeJoint = Vector((heel_s0 - f['heelToBall'].y - V * tau, l + (f['toe'].x - f['ankle'].x), f['toe'].z))
        return toeJoint + ToGait(Rx(pitch) @ f['ankleFromToe']), pitch, 0.0, 'ball'

    def Derivs(fn, t, h=1e-3):
        a, b, c = fn(t - h), fn(t), fn(t + h)
        return (c - a) / (2 * h), (c - 2 * b + a) / (h * h)

    def StanceAnkle(side, tau):
        return StanceFoot(side, tau)[0]

    def FootState(side, phi):
        """Foot at cycle phase phi (the left foot touches down at 0, the right at 0.5)."""
        offset = 0.0 if side == 'L' else T / 2
        t = (phi * T - offset) % T
        if t < TS:
            ankle, pitch, toe, pivot = StanceFoot(side, t)
            return dict(ankle=ankle, pitch=pitch, toe=toe, stance=True, pivot=pivot)
        # swing: quintic from the toe-off state to the next touchdown state
        d = T - TS
        u = (t - TS) / d
        h = 2e-3
        p0 = StanceAnkle(side, TS)
        v0 = (StanceAnkle(side, TS) - StanceAnkle(side, TS - h)) / h
        a0 = (StanceAnkle(side, TS) - 2 * StanceAnkle(side, TS - h) + StanceAnkle(side, TS - 2 * h)) / (h * h)
        p1 = StanceAnkle(side, 0.0)
        v1 = (StanceAnkle(side, h) - StanceAnkle(side, 0.0)) / h
        a1 = (StanceAnkle(side, 2 * h) - 2 * StanceAnkle(side, h) + StanceAnkle(side, 0.0)) / (h * h)
        a0 *= 0.0
        a1 *= 0.0
        v1.z = GAIT['landingDropMps']          # the foot is still coming down when it lands (the stance model then stops it)
        out = Vector((0, 0, 0))
        for k in range(3):
            out[k] = Quintic(u, p0[k], v0[k], a0[k], p1[k], v1[k], a1[k], d)
        # swing clearance bump (zero value, slope and curvature at both ends)
        out.z += GAIT['swingClear'] * SwingLift(u)
        # foot pitch: the toe-off pitch (continuing its rotation) fades out, the relaxed ankle (shank pitch + a little
        # plantar flexion) carries the swing, the touchdown pitch fades in. Pose() resolves it once the shank is known.
        pitch0 = StanceFoot(side, TS)[1]
        pitchRate0 = (StanceFoot(side, TS)[1] - StanceFoot(side, TS - h)[1]) / h
        pitch1 = StanceFoot(side, 0.0)[1]
        w0 = 1 - S5(u / GAIT['pitchHandOff'])
        w1 = S5((u - (1 - GAIT['pitchHandOff'])) / GAIT['pitchHandOff'])
        return dict(ankle=out, pitchParts=dict(w0=w0, w1=w1, p0=pitch0 + pitchRate0 * (t - TS), p1=pitch1, alpha=GAIT['ankleRelaxed'] * (1 - .6 * S5(u))),
                    pitch=None, toe=None, u=u, stance=False, pivot='air')

    # ---- body pose ---------------------------------------------------------------------------------------------
    def Place(part, point, q):
        Put(Bone(part), Matrix.LocRotScale(point, q, Vector((1, 1, 1))))

    readyChestInv = ready[prefix + 'Spine2'].inverted()

    def RifleFrame(origin, forward, up):
        forward = forward.normalized()
        right = forward.cross(up).normalized()
        up = right.cross(forward)
        m = Matrix.Identity(4)
        for i in range(3):
            m[i][0], m[i][1], m[i][2], m[i][3] = right[i], forward[i], up[i], origin[i]
        return m

    def ReadyGrip(side):
        return sum((ready[prefix + side + ' Finger' + str(i)].translation for i in range(1, 5)), Vector()) / 4

    readyUp = ready[prefix + 'Neck'].translation - ready[prefix + 'Pelvis'].translation
    readyFrameInv = {side: RifleFrame(ReadyGrip(side), ReadyGrip('L') - ReadyGrip('R'), readyUp.normalized()).inverted() for side in 'LR'}
    ARM_PARTS = ['Clavicle', 'UpperArm', 'Forearm', 'Hand', 'Finger']
    armNames = [n for n in names if any(n.startswith(prefix + s + ' ' + p) for s in 'LR' for p in ARM_PARTS)]
    GRIP = Vector(GAIT['rifleGrip'])
    AXIS = Vector(GAIT['rifleAxis']).normalized()
    pelvisRest = R('Pelvis')
    clamps = []

    def Pose(phi, pelvisPoint, footZ, riflePerturb):
        """Pose the whole body with the pelvis joint at `pelvisPoint` (Blender world). Returns a dict of measurements."""
        th = 2 * math.pi * phi
        # --- pelvis and trunk orientation (left foot touches down at phi=0: its hip is forward, pelvis yaw negative)
        yawP = math.radians(GAIT['pelvisYawDeg']) * -math.cos(th)
        yawC = math.radians(GAIT['chestYawDeg']) * math.cos(th)
        rollP = -math.radians(GAIT['pelvisRollDeg']) * math.cos(th - 2 * math.pi * 0.19)      # the swing-side hip drops
        tiltP = math.radians(GAIT['pelvisTiltDeg']) * math.cos(2 * th)
        lean = [math.radians(a) for a in GAIT['leanDeg']]
        pelvisQ = WQ(yawP, rollP, lean[0] + tiltP)
        Place('Pelvis', pelvisPoint, pelvisQ @ RQ('Pelvis'))
        order = ['Spine', 'Spine1', 'Spine2', 'Neck', 'Head']
        share = {'Spine': .33, 'Spine1': .66, 'Spine2': 1.0, 'Neck': .35, 'Head': GAIT['headYawShare']}
        parentName, parentPoint, parentQ = 'Pelvis', pelvisPoint, pelvisQ
        chestQ = None
        for i, part in enumerate(order):
            f = share[part]
            yaw = yawP + (yawC - yawP) * min(1.0, f) if part in ('Spine', 'Spine1', 'Spine2') else yawC * f
            roll = rollP * (1 - min(1.0, f)) if part in ('Spine', 'Spine1', 'Spine2') else 0.0
            pitch = lean[i + 1] - (tiltP if part in ('Spine', 'Spine1') else 0.0) * (1 - f if part == 'Spine' else 0.3)
            q = WQ(yaw, roll, pitch)
            point = parentPoint + parentQ @ (R(part) - R(parentName))
            Place(part, point, q @ RQ(part))
            parentName, parentPoint, parentQ = part, point, q
            if part == 'Spine2':
                chestQ = q
        # --- legs
        info = {}
        for side in 'LR':
            st = FootState(side, phi)
            ankle = Gait(*st['ankle'])
            ankle.z += footZ[side]
            hip = pelvisPoint + pelvisQ @ (R(side + ' Thigh') - pelvisRest)
            # start every frame's IK from the same rigid leg (no history in the bone twist)
            for part in ('Thigh', 'Calf', 'Foot'):
                Place(side + ' ' + part, hip + pelvisQ @ (R(side + ' ' + part) - R(side + ' Thigh')), pelvisQ @ RQ(side + ' ' + part))
            kneePole = hip + Vector((side_sign[side] * .12, -1.0, 0.0))
            ctx['Chain'](Bone(side + ' Thigh'), Bone(side + ' Calf'), Bone(side + ' Foot'), ankle, kneePole, label=side + ' leg')
            reach = (ankle - hip).length / (L1 + L2)
            footPoint = Point(Bone(side + ' Foot'))
            if st['pitch'] is None:
                shank = footPoint - Point(Bone(side + ' Calf'))
                parts_ = st['pitchParts']
                st['pitch'] = (parts_['w0'] * parts_['p0'] + parts_['w1'] * parts_['p1']
                               + (1 - parts_['w0'] - parts_['w1']) * (math.atan2(shank.y, -shank.z) + parts_['alpha']))
                st['toe'] = st['pitch'] * Smooth(st['u'] / .25)
            fq = Quaternion((1, 0, 0), st['pitch'])
            Place(side + ' Foot', footPoint, fq @ RQ(side + ' Foot'))
            toePoint = footPoint + fq @ (R(side + ' Toe0') - R(side + ' Foot'))
            Place(side + ' Toe0', toePoint, Quaternion((1, 0, 0), st['toe']) @ RQ(side + ' Toe0'))
            info[side] = dict(reach=reach, stance=st['stance'], pivot=st['pivot'], ankle=ankle, pitch=st['pitch'], toe=st['toe'])
        # --- arms and rifle
        chest = BWorld(Bone('Spine2'))
        carry = chest @ readyChestInv
        for side in 'LR':
            Put(Bone(side + ' Clavicle'), carry @ ready[prefix + side + ' Clavicle'])
        heading = Quaternion((0, 0, 1), yawC * GAIT['rifleChestYawShare'])
        gripB = pelvisPoint + heading @ Vector((GRIP.x, -GRIP.y, GRIP.z)) + Vector((0, 0, riflePerturb['dz']))
        axisB = heading @ Vector((AXIS.x, -AXIS.y, AXIS.z))
        axisB = Quaternion((1, 0, 0), riflePerturb['pitch']) @ axisB
        axisB.normalize()
        up = (Point(Bone('Neck')) - Point(Bone('Pelvis'))).normalized()
        span = GAIT['gripSpan']
        for side, pole in [('R', GAIT['poleR']), ('L', GAIT['poleL'])]:
            move = RifleFrame(gripB + (axisB * span if side == 'L' else Vector()), axisB, up) @ readyFrameInv[side]
            hand = move @ ready[prefix + side + ' Hand']
            for part in ['UpperArm', 'Forearm']:
                Put(Bone(side + ' ' + part), carry @ ready[prefix + side + ' ' + part])
            shoulder = Point(Bone(side + ' UpperArm'))
            ctx['Chain'](Bone(side + ' UpperArm'), Bone(side + ' Forearm'), Bone(side + ' Hand'), hand.translation,
                         shoulder + heading @ Vector((pole[0], -pole[1], pole[2])), label=side + ' arm')
            Put(Bone(side + ' Hand'), hand)
            for n in armNames:
                if n.startswith(prefix + side + ' Finger'):
                    Put(arm.pose.bones[n], move @ ready[n])
        return info, dict(up=up, axis=axisB, grip=gripB, heading=heading)

    # ---- bake -------------------------------------------------------------------------------------------------
    action = bpy.data.actions.new('RifleHoldRun')
    action.use_fake_user = True
    arm.animation_data_create()
    arm.animation_data.action = action
    samples, props, propsB, report = [], [], [], dict(floor=[], lean=[], span=[], pitch=[], reach=[], comErr=[], clamps=0)
    global RIFLE_REL_Z
    RIFLE_REL_Z = RifleSoftMount()
    for f in range(N + 1):
        phi = (f % N) / N
        t = phi * T
        comX, comZ = ComAt(t)
        lat = GAIT['swayM'] * math.cos(2 * math.pi * (phi - 0.19))
        target = Vector((lat, -comX, GAIT['comTdHeight'] + comZ))
        # chest-linked rifle bob: damp a share of the pelvis' vertical motion (shoulders and elbows absorb)
        perturb = dict(dz=RIFLE_REL_Z(t), pitch=0.0)
        footZ = {'L': 0.0, 'R': 0.0}
        bpy.context.scene.frame_set(f + 1)
        pelvisPoint = Vector((target.x, target.y, target.z - .08))
        for it in range(8):
            info, rifle = Pose(phi, pelvisPoint, footZ, perturb)
            com = SegmentCom()
            err = target - com
            lowL, lowR = SoleMin('L'), SoleMin('R')
            moved = False
            for side, low in (('L', lowL), ('R', lowR)):
                want = GAIT['clearance'] if info[side]['stance'] else max(GAIT['clearance'], low)
                dz = want - low
                if abs(dz) > 2e-4 and info[side]['reach'] < 0.995:
                    footZ[side] = max(-.03, min(.06, footZ[side] + dz))
                    moved = True
            if err.length > 3e-4:
                pelvisPoint += err
                moved = True
            if not moved:
                break
        com = SegmentCom()
        report['comErr'].append(round((target - com).length * 1000, 3))
        report['reach'].append(round(max(i['reach'] for i in info.values()), 3))
        if max(i['reach'] for i in info.values()) > .985:
            report['clamps'] += 1
        samples.append(ctx['SourcePose']())
        axisG = (Point(Bone('Neck')) - Point(Bone('Pelvis')))
        report['lean'].append(math.degrees(math.atan2(-axisG.y, axisG.z)))
        gr, gl = ctx['GripPoint']('R'), ctx['GripPoint']('L')
        barrel = gl - gr
        report['span'].append(barrel.length)
        report['pitch'].append(math.degrees(math.atan2(barrel.z, math.hypot(barrel.x, barrel.y))))
        report['floor'].append((SoleMin('L'), SoleMin('R')))
        # weapon track: frame of the rifle in glTF/shipped units, like AllyRifle (local -Z = muzzle, +Y = up)
        axis = barrel.normalized()
        upv = (Point(Bone('Neck')) - Point(Bone('Pelvis'))).normalized()
        upv = (upv - axis * upv.dot(axis)).normalized()
        right = axis.cross(upv).normalized()
        prop = Matrix(((right.x, upv.x, -axis.x, gr.x), (right.y, upv.y, -axis.y, gr.y), (right.z, upv.z, -axis.z, gr.z), (0, 0, 0, 1)))
        propsB.append(prop.copy())
        prop = convert.inverted() @ prop
        pp, qq, _ = prop.decompose()
        props.append([*(pp / factor), qq.x, qq.y, qq.z, qq.w])
        for pb in arm.pose.bones:
            pb.keyframe_insert('location', frame=f + 1, group=pb.name)
            pb.keyframe_insert('rotation_quaternion', frame=f + 1, group=pb.name)
        print('F%02d phi %.3f com err %.2f mm  reach %s  stance %s/%s  pelvis s %.3f z %.3f  com s %.3f z %.3f  ankles L(%.3f,%.3f) R(%.3f,%.3f) pitchL %.2f R %.2f toeL %.2f sole %.3f/%.3f' % (
            f, phi, report['comErr'][-1], {s: round(i['reach'], 3) for s, i in info.items()}, info['L']['pivot'], info['R']['pivot'],
            -pelvisPoint.y, pelvisPoint.z, -com.y, com.z, -info['L']['ankle'].y, info['L']['ankle'].z, -info['R']['ankle'].y, info['R']['ankle'].z, info['L']['pitch'], info['R']['pitch'], info['L']['toe'], SoleMin('L'), SoleMin('R')), flush=True)

    # ---- the rifle (the shipped ZhongZheng mesh) rides the weapon track so the editable project shows the hold ------------
    scene = bpy.context.scene
    weapon = json.loads((project / 'Model/Model_ZhongZheng.tzm.json').read_text(encoding='utf-8'))

    def Decode(data, kind):
        raw = base64.b64decode(data)
        return struct.unpack('<' + kind * (len(raw) // struct.calcsize(kind)), raw)

    rifle = bpy.data.objects.new('Prop_HoldRifle', None)
    scene.collection.objects.link(rifle)
    rifle.rotation_mode = 'QUATERNION'
    colors = {'wood': (.30, .13, .05, 1), 'steel': (.10, .11, .12, 1)}
    for index, block in enumerate(weapon['meshes']):
        q = Decode(block['pos'], 'H')
        indices = Decode(block['idx'], 'I' if block['idxBits'] == 32 else 'H')
        verts = [tuple(block['posMin'][j] + q[i * 3 + j] * block['posScale'][j] for j in range(3)) for i in range(block['count'])]
        mesh = bpy.data.meshes.new('Model_HoldRiflePart' + str(index))
        mesh.from_pydata(verts, [], [indices[i:i + 3] for i in range(0, len(indices), 3)])
        mesh.update()
        obj = bpy.data.objects.new('Model_HoldRifle' + str(index), mesh)
        scene.collection.objects.link(obj)
        obj.parent = rifle
        mat = bpy.data.materials.new('Material_HoldRifle' + block['material'])
        mat.diffuse_color = colors.get(block['material'], (.2, .2, .2, 1))
        obj.data.materials.append(mat)
    for f in range(N + 1):
        rifle.matrix_world = propsB[f]
        rifle.keyframe_insert('location', frame=f + 1)
        rifle.keyframe_insert('rotation_quaternion', frame=f + 1)
    ground = helpers['Add'](bpy.ops.mesh.primitive_cube_add, size=1, location=(0, 0, -.01))
    ground.scale = (6, 6, .02)
    ground.name = 'Prop_GroundLine'

    # ---- review renders (RIFLE_HOLD_RUN_RENDER=1): the real rig and the real rifle mesh, side / front / back ----------
    if os.environ.get('RIFLE_HOLD_RUN_RENDER'):
        sheets.mkdir(parents=True, exist_ok=True)
        scene.render.engine = 'BLENDER_WORKBENCH'
        scene.display.shading.light = 'STUDIO'
        scene.display.shading.color_type = 'TEXTURE'
        scene.display.shading.show_shadows = False
        scene.render.resolution_x, scene.render.resolution_y = 380, 480
        scene.render.film_transparent = False
        world = bpy.data.worlds.new('World_RifleHoldRun')
        world.color = (.78, .79, .80)
        scene.world = world
        views = {'side': ((4.0, 0.0, .9), .9, 2.05), 'front': ((0.0, -4.0, .9), .9, 2.05), 'back': ((0.0, 4.0, .9), .9, 2.05),
                 'upFront': ((0.0, -4.0, 1.12), 1.12, 1.15), 'upSide': ((4.0, 0.0, 1.12), 1.12, 1.15), 'upThreeQ': ((-2.8, -2.8, 1.12), 1.12, 1.15),
                 'upRight': ((-4.0, 0.0, 1.12), 1.12, 1.15), 'legSide': ((4.0, 0.0, .45), .45, 1.1), 'legFront': ((0.0, -4.0, .45), .45, 1.1),
                 'handsThreeQ': ((-2.2, -3.4, 1.0), 1.0, .8), 'handsTop': ((-1.0, -1.0, 4.0), 0.0, .9)}
        wanted = os.environ.get('RIFLE_HOLD_RUN_VIEWS', 'side,front,back').split(',')
        cams = {}
        for name in wanted:
            loc, aim, scale = views[name]
            cam = helpers['Add'](bpy.ops.object.camera_add, location=loc)
            cam.data.type = 'ORTHO'
            cam.data.ortho_scale = scale
            cam.rotation_euler = (Vector((0, 0, aim)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
            cams[name] = cam
        frames = [int(v) for v in os.environ.get('RIFLE_HOLD_RUN_FRAMES', ','.join(str(k) for k in range(0, N, 3))).split(',')]
        for f in frames:
            scene.frame_set(f + 1)
            rifle.matrix_world = propsB[f]
            Update()
            for name, cam in cams.items():
                scene.camera = cam
                scene.render.filepath = str(sheets / ('%s_%02d.png' % (name, f)))
                helpers['Op'](bpy.ops.render.render, write_still=True)
        print('RENDERED', len(frames) * 3, 'tiles ->', sheets, flush=True)
    # ---- export
    times = [round(T * f / N, 6) for f in range(N + 1)]
    tracks = []
    for i, n in enumerate(names):
        for prop_, off, width, kind in [('position', 0, 3, 'vector'), ('quaternion', 3, 4, 'quaternion')]:
            values = [round(v, 5) for s in samples for v in s[i * 7 + off:i * 7 + off + width]]
            if all(abs(values[j] - values[j % width]) < 2e-5 for j in range(len(values))):
                tracks.append({'name': n.replace(' ', '_') + '.' + prop_, 'type': kind, 'times': [0], 'values': values[:width]})
            else:
                tracks.append({'name': n.replace(' ', '_') + '.' + prop_, 'type': kind, 'times': times, 'values': values})
    for prop_, off, width, kind in [('position', 0, 3, 'vector'), ('quaternion', 3, 4, 'quaternion')]:
        tracks.append({'name': 'HoldRifle.' + prop_, 'type': kind, 'times': times, 'values': [round(v, 6) for s in props for v in s[off:off + width]]})
    clip = {'name': 'RifleHoldRun', 'uuid': 'RifleHoldRun', 'duration': round(T, 6), 'tracks': tracks, 'blendMode': 2500}
    stance_share = GAIT['stanceShare']
    profile = {'duration': round(T, 6), 'cycles': 1, 'source': 'procedural', 'referenceMps': V,
               'contacts': {'L': [[0.0, round(stance_share, 6)]], 'R': [[0.5, round(0.5 + stance_share, 6)]]},
               'floorM': [round(min(min(p) for p in report['floor']), 4), round(max(max(p) for p in report['floor']), 4)],
               'leanDeg': [round(min(report['lean']), 2), round(max(report['lean']), 2)],
               'gripSpanM': [round(min(report['span']), 4), round(max(report['span']), 4)],
               'barrelPitchDeg': [round(min(report['pitch']), 2), round(max(report['pitch']), 2)],
               'overreach': {side: max([r for l, r in ctx['overreach'] if l.startswith(side)] or [0]) for side in 'LR'},
               'comFitErrMm': [round(min(report['comErr']), 3), round(max(report['comErr']), 3)],
               'clampedFrames': report['clamps']}
    data = {'schema': 1, 'revision': REVISION, 'skeleton': 'TengxianHumanoidV1', 'sourceModel': source['model'],
            'gait': GAIT, 'weaponTrack': 'HoldRifle', 'weapon': 'ZhongZheng', 'clips': [clip], 'profiles': {'RifleHoldRun': profile}}
    text = json.dumps(data, separators=(',', ':'))
    print('PROFILE', json.dumps(profile), flush=True)
    only = os.environ.get('RIFLE_HOLD_RUN_NOWRITE')
    if only:
        return
    (output / 'Animation_TengxianRifleHoldRun.json').write_text(text, encoding='utf-8')
    scene = bpy.context.scene
    scene.render.fps = int(round(N / T))
    scene.frame_start = 1
    scene.frame_end = N
    scene.frame_set(1)
    arm.animation_data.action = action
    scene.frame_set(1)
    if not os.environ.get('RIFLE_HOLD_RUN_RENDER'):
        for name, loc, power in (('Light_Key', (3, -3, 4), 600), ('Light_Fill', (-3, 2, 3), 300)):
            lamp = helpers['Add'](bpy.ops.object.light_add, type='AREA', location=loc)
            lamp.name = name
            lamp.data.energy = power
            lamp.rotation_euler = (Vector((0, 0, .9)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        cam = helpers['Add'](bpy.ops.object.camera_add, location=(4.0, 0.0, .9))
        cam.name = 'Camera_RifleHoldRunSide'
        cam.data.type = 'ORTHO'
        cam.data.ortho_scale = 2.05
        cam.rotation_euler = (Vector((0, 0, .9)) - Vector(cam.location)).to_track_quat('-Z', 'Y').to_euler()
        scene.camera = cam
        scene['authoringTool'] = helpers['TOOL']
        scene['revision'] = REVISION
        scene['note'] = 'Action RifleHoldRun on the Tengxian armature (Blender metres = runtime metres of the 1.66 m actor); Prop_HoldRifle follows the HoldRifle weapon track.'
        helpers['Op'](bpy.ops.wm.save_as_mainfile, filepath=str(private / 'Scene_RifleHoldRun.blend'), compress=True)
    print(json.dumps({'file': str(output / 'Animation_TengxianRifleHoldRun.json'), 'sha256': hashlib.sha256(text.encode()).hexdigest(), 'blend': bpy.data.filepath}), flush=True)
    return dict(props=props, samples=samples)


helpers['Bake']('TengxianNra02', probe=Bake)
