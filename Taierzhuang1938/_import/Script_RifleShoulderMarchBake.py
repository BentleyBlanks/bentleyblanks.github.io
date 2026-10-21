"""RifleShoulderMarch: an in-place loaded-march walk with a bolt rifle on the right shoulder, authored in Blender.

Run through BlenderMCP (RIFLE_MARCH_PROJECT = the absolute Taierzhuang1938 directory; prepare the rifle mesh first):

    node Taierzhuang1938/_import/Script_RifleShoulderMarchPrepare.mjs
    node scripts/Script_BlenderMcp.mjs start --task RifleShoulderMarch
    node scripts/Script_BlenderMcp.mjs exec --code "import os; os.environ['RIFLE_MARCH_PROJECT']=r'<worktree>/Taierzhuang1938'; os.environ['RIFLE_MARCH_SAVE']='1'"
    node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_import/Script_RifleShoulderMarchBake.py --timeout 900
    node scripts/Script_BlenderMcp.mjs stop
    node Taierzhuang1938/_import/Script_RifleShoulderMarchProfile.mjs   # measure the runtime profile into the clip JSON
    node Taierzhuang1938/Script_RifleShoulderMarchTest.mjs --write

Environment: RIFLE_MARCH_PROJECT (required), RIFLE_MARCH_WRITE=0 (measure only, write nothing to the repository),
RIFLE_MARCH_SAVE=1 (also save the editable .blend), RIFLE_MARCH_PARAMS_FILE (JSON overrides of GAIT, for iteration),
RIFLE_MARCH_DEBUG=1 (print the per-leg pelvis-height limits).

Nothing is copied from another clip. Every channel is evaluated from the parameters in GAIT below, on the shared
TengxianHumanoidV1 bind of Model_TengxianNra02.glb (imported by the production importer of
_import/Script_MachineGunCaptivesBake.py; its authoring factor is 1 for NRA02, so Blender metres are the shipped
GLB's own metres, the actor is later scaled by 0.9135 to 1.66 m).

Method (all joints are driven by rotations only, bone lengths never change; the pelvis alone translates):
  - Feet: rolling contact. A heel-sole vertex is a ground-fixed pivot through heel rocker and foot-flat, then a Toe0
    sole vertex is the pivot through heel rise until toe-off; pivots move back at the pelvis speed. The swing is a cubic
    Hermite in the GROUND frame (rest at toe-off, still moving forward at landing) plus a clearance arc and the foot
    pitch, so velocity joins the stance at both ends; the heel settles over the heel rocker (a few millimetres).
  - Legs and the rifle arm: two-bone hinges (law of cosines; hinge axis from the knee / elbow pole). Each frame the
    ankle targets are corrected so the lowest skinned sole vertex rests on the floor (4 mm).
  - Pelvis height: derived, not a sine. Each stance leg gets a knee-flexion target curve; the pelvis takes the highest
    height both legs allow (soft minimum), lightly smoothed and held under the hard no-hyperextension limit.
  - Pelvis fore-aft: iterated until the whole-body centre of mass (Winter/Dempster fractions, rifle as a point mass)
    moves at the mean speed +- comFwdSpeedMps (fastest at heel strike, slowest at mid single support), low harmonics only.
  - Right hand: holds the rifle at the knuckle centroid (where the runtime mounts the weapon). The hand's orientation on
    the rifle is searched (elbow as open as possible, modest wrist bend, forearm twist in range); the thumb's curl axis
    is the candidate that closes the thumb onto the index finger. The rifle rides on the chest frame with a small bob.
    The clip ships an `AllyRifle` prop track (rig-root local, rifle origin = grip, muzzle = -Z), as Animation/AllyGait.
Output: Animation/RifleShoulderMarch/Animation_TengxianRifleShoulderMarch.json (three.js AnimationClip JSON, sanitized
bone names) and the editable scene in OneDrive/AI/Models/Blender/Taierzhuang1938/RifleShoulderMarch_20261021.
"""
import bpy, os, json, math, runpy, hashlib, time
import numpy as np
from pathlib import Path
from mathutils import Matrix, Vector, Quaternion

project = Path(os.environ['RIFLE_MARCH_PROJECT'])
os.environ['CAPTIVES_PROJECT'] = str(project)
os.environ['CAPTIVES_SKIP_BLEND'] = '1'
helpers = runpy.run_path(str(project / '_import/Script_MachineGunCaptivesBake.py'), run_name='RifleShoulderMarchHelpers')
convert = helpers['convert']
private = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/RifleShoulderMarch_20261021')
output = project / 'Animation/RifleShoulderMarch'
scratch = project.parent / 'tmp/RifleShoulderMarch'
output.mkdir(parents=True, exist_ok=True)
private.mkdir(parents=True, exist_ok=True)
scratch.mkdir(parents=True, exist_ok=True)

REVISION = '20261021RifleShoulderMarchV1'
CLIP = 'RifleShoulderMarch'
PREFIX = 'Bip001 '

# Every number is model metres / radians (the actor is scaled by 0.9135 at runtime). Phase u of a foot: heel strike = 0.
GAIT = dict(
    frames=60, fps=60,                 # one cycle = 60 / 60 s = 1.0 s -> 120 steps per minute
    stepM=0.665,                        # distance between two successive heel strikes (one step), model metres
    stance=0.63, heelRockerEnd=0.10, heelOff=0.42,   # fractions of the cycle: toe-off, heel-flat, heel rise
    heelStrikeM=0.26,                  # heel pivot ahead of the pelvis axis at heel strike
    strikePitch=0.26, toeOffPitch=0.95, toeRisePower=1.25, midSwingPitch=-0.03,
    footHalfWidthM=0.075, toeOutRad=0.10, circumductionM=0.012, clearanceM=0.004,
    swingLiftM=0.065, swingLiftExp=0.8, landSpeedShare=0.15,
    # stance-leg knee flexion target (deg) by foot phase u: base + loading-response bump + pre-swing rise; the pelvis rides as high as these allow
    kneeBaseDeg=11.0, hardMarginM=0.0004, kneeLoadingDeg=14.0, kneeLoadingU=0.11, kneeLoadingWidth=0.075, kneePreSwingDeg=20.0, kneePreSwingFrom=0.44,
    pelvisDropM=0.0, softMinM=0.010, kneeSwingReleaseTau=0.3, kneeLateSwingExtraDeg=20.0, kneeLateSwingFrom=0.55, heightFilterFrames=1,
    swayM=0.022, swayPeakPhase=0.31,
    pelvisYawRad=0.075, pelvisListRad=0.05, listPeakPhase=0.31,
    thoraxYawRad=0.09, thoraxYawLag=0.03,
    reachCap=0.9985,                   # the hip-ankle distance never exceeds this share of the straight leg
    # trunk: absolute forward pitch of each segment (the load), lateral compensation, head kept level
    pelvisPitch=0.035, pelvisPitchOsc=0.012,
    pitch=dict(Spine=0.08, Spine1=0.10, Spine2=0.12, Neck=0.09, Head=0.035),
    rollLoad=dict(Spine=0.010, Spine1=0.020, Spine2=0.030, Neck=0.018, Head=0.008),
    rollOsc=dict(Spine=-0.012, Spine1=-0.016, Spine2=-0.020, Neck=-0.010, Head=0.0),
    yawShare=dict(Spine=0.30, Spine1=0.65, Spine2=1.0, Neck=0.40, Head=0.10),
    # free (left) arm
    armSwingRad=0.36, armBiasRad=0.05, armPhaseLag=0.02, armOutRad=0.12,
    elbowBaseRad=0.34, elbowSwingRad=0.22,
    fingerCurl=(0.8, 0.9, 0.55), thumbCurl=(0.25, 0.35, 0.25),
    # rifle on the right shoulder (character frame: +X left, +Y back, +Z up)
    rifleCrossBackUp=(0.164, 0.27), rifleRollRad=0.0,   # where the rifle axis crosses the body's centre line, behind / above the Spine2 joint
    gripFromChest=(-0.185, -0.151, 0.20),     # knuckle centroid relative to the Spine2 joint (rest axes)
    shrugRad=0.09, protractRad=0.12,
    gripSearchStepDeg=15, wristFlexLimitDeg=45.0, forearmTwistRangeDeg=(-20.0, 150.0),
    gripCurl=(1.2, 1.45, 0.9), gripThumb=(0.7, 0.8, 0.6),
    rifleBobPitchRad=0.010, rifleBobRollRad=0.007, rifleBobLiftM=0.003, rifleBobPhase=0.05,
    elbowPoleR=(-0.45, -0.15, -0.88),
    comFwdSpeedMps=0.109,           # body centre of mass: forward speed swings +-this (model m/s; 0.10 m/s at the actor's scale) around the mean,
    comDrive=True, comFwdHarmonics=5, comFwdSpeedPeakPhase=0.0,       # fastest at heel strike / double support, slowest at mid single support
)

if os.environ.get('RIFLE_MARCH_PARAMS_FILE'):     # iteration only: a JSON file such as {"heelStrikeM": 0.3} overrides GAIT for one run
    GAIT.update(json.loads(Path(os.environ['RIFLE_MARCH_PARAMS_FILE']).read_text(encoding='utf-8')))

Rx = lambda a: Quaternion((1, 0, 0), a)
Ry = lambda a: Quaternion((0, 1, 0), a)
Rz = lambda a: Quaternion((0, 0, 1), a)
ID = Quaternion((1, 0, 0, 0))
Clamp = lambda x, a=0.0, b=1.0: max(a, min(b, x))
Smooth = lambda x: Clamp(x) * Clamp(x) * (3 - 2 * Clamp(x))
Lerp = lambda a, b, t: a + (b - a) * t
Tau = math.tau


def Basis(u, v):
    u = Vector(u).normalized()
    w = u.cross(Vector(v)).normalized()
    v2 = w.cross(u)
    return Matrix(((u.x, v2.x, w.x), (u.y, v2.y, w.y), (u.z, v2.z, w.z)))


def FrameRot(u0, v0, u1, v1):
    """Rotation taking the orthonormalised pair (u0, v0) to (u1, v1)."""
    return (Basis(u1, v1) @ Basis(u0, v0).inverted()).to_quaternion()


def Perp(v, axis):
    axis = Vector(axis).normalized()
    return (Vector(v) - axis * Vector(v).dot(axis)).normalized()


class March:
    def __init__(self, ctx):
        self.ctx = ctx
        self.P = GAIT
        self.arm, self.names, self.meshes = ctx['arm'], ctx['names'], ctx['meshes']
        self.Update, self.SourcePose = ctx['Update'], ctx['SourcePose']
        arm = self.arm
        for pb in arm.pose.bones:
            pb.matrix_basis.identity()
            pb.rotation_mode = 'QUATERNION'
        self.Update()
        self.armInv = arm.matrix_world.inverted()
        bones = arm.pose.bones
        self.parent = {n: (bones[n].parent.name if bones[n].parent else None) for n in self.names}
        # parents first
        self.order = []
        pending = list(self.names)
        while pending:
            for n in list(pending):
                if self.parent[n] is None or self.parent[n] in self.order:
                    self.order.append(n)
                    pending.remove(n)
        self.restW = {n: arm.matrix_world @ bones[n].matrix for n in self.names}
        self.restHead = {n: self.restW[n].translation.copy() for n in self.names}
        self.restQ = {n: self.restW[n].to_quaternion() for n in self.names}
        RL = {n: arm.data.bones[n].matrix_local.copy() for n in self.names}
        self.relInv = {n: ((RL[self.parent[n]].inverted() @ RL[n]) if self.parent[n] else RL[n]).inverted() for n in self.names}
        B = lambda role: PREFIX + role
        self.B = B
        self.pelvis = B('Pelvis')
        # segment lengths and rest directions
        dist = lambda a, b: (self.restHead[B(b)] - self.restHead[B(a)]).length
        self.L = {s: (dist(s + ' Thigh', s + ' Calf'), dist(s + ' Calf', s + ' Foot')) for s in 'LR'}
        self.armL = {s: (dist(s + ' UpperArm', s + ' Forearm'), dist(s + ' Forearm', s + ' Hand')) for s in 'LR'}
        self.dir = lambda a, b: (self.restHead[B(b)] - self.restHead[B(a)]).normalized()
        self.side = {'L': 1.0, 'R': -1.0}
        # rest hand triads: finger direction d0, palm normal n0 (palm side), curl axis c0 = d0 x n0
        self.hand = {}
        for s in 'LR':
            fingers = [self.restHead[B(f'{s} Finger{k}')] for k in range(1, 5)]
            d0 = (sum((self.restHead[B(f'{s} Finger{k}2')] - self.restHead[B(f'{s} Finger{k}')] for k in range(1, 5)), Vector()) / 4).normalized()
            across = (fingers[0] - fingers[3]).normalized()
            n0 = (d0.cross(across) * (1 if s == 'L' else -1)).normalized()
            n0 = Perp(n0, d0)
            self.hand[s] = dict(d0=d0, n0=n0, c0=d0.cross(n0).normalized(),
                                grip=sum(fingers, Vector()) / 4)
        # finger chains and per-joint curl axes (rest world)
        self.chains = {}
        self.fingerAxis = {}
        for s in 'LR':
            for k in range(5):
                stem = f'{s} Finger{k}'
                chain = [B(stem), B(stem + '1'), B(stem + '2')]
                self.chains[(s, k)] = chain
                for j, name in enumerate(chain):
                    child = chain[j + 1] if j < 2 else None
                    d = ((self.restHead[child] - self.restHead[name]) if child else (self.restHead[name] - self.restHead[chain[j - 1]])).normalized()
                    self.fingerAxis[name] = d.cross(self.hand[s]['n0']).normalized()
        self.ChooseThumbAxes()
        # sole vertices of the skinned mesh (weight > .55 on Foot/Toe0)
        self.body = meshes = self.meshes[0]
        groups = {g.index: g.name for g in meshes.vertex_groups}
        nv = len(meshes.data.vertices)
        wFoot = {s: np.zeros(nv) for s in 'LR'}
        wToe = {s: np.zeros(nv) for s in 'LR'}
        for v in meshes.data.vertices:
            for g in v.groups:
                name = groups[g.group]
                for s in 'LR':
                    if name == B(s + ' Foot'):
                        wFoot[s][v.index] += g.weight
                    elif name == B(s + ' Toe0'):
                        wToe[s][v.index] += g.weight
        self.soleIdx = {s: np.nonzero(wFoot[s] + wToe[s] > 0.55)[0] for s in 'LR'}
        pts = self.EvalPoints()
        self.restPoints = pts
        self.pivots = {}
        for s in 'LR':
            idx = self.soleIdx[s]
            low = idx[pts[idx, 2] < 0.010]
            # heel pivot: the rearmost vertex of the flat sole, nearest the foot's centre line
            rear = pts[low, 1].max()
            cand = low[pts[low, 1] > rear - 0.006]
            xc = self.restHead[B(s + ' Foot')].x
            heel = cand[np.argmin(np.abs(pts[cand, 0] - xc))]
            # ball pivot: a vertex carried (almost) only by Toe0, on the sole, just ahead of the toe joint
            toeY = self.restHead[B(s + ' Toe0')].y
            ball = low[(wToe[s][low] > 0.95) & (pts[low, 1] < toeY + 0.002)]
            ball = ball[np.argsort(-pts[ball, 1])[:12]]
            ball = ball[np.argmin(np.abs(pts[ball, 0] - self.restHead[B(s + ' Toe0')].x))]
            self.pivots[s] = dict(heel=int(heel), ball=int(ball), h0=Vector(pts[heel]), b0=Vector(pts[ball]))
        print('PIVOTS', {s: dict(heel=[round(x, 4) for x in self.pivots[s]['h0']], ball=[round(x, 4) for x in self.pivots[s]['b0']]) for s in 'LR'}, flush=True)
        wHead = np.zeros(nv)
        for v in meshes.data.vertices:
            for g in v.groups:
                if groups[g.group] == B('Head'):
                    wHead[v.index] += g.weight
        headPts = pts[wHead > 0.9]
        self.headCentroidRel = Vector(headPts.mean(axis=0)) - self.restHead[B('Head')]
        self.floorZ = 0.0
        # rifle in the hand: grip frame, fixed at the neutral pose
        self.BuildGrip()
        self.SolveBase()

    def ChooseThumbAxes(self):
        """The thumb closes toward the fingers: of the candidate curl axes (the hand's own axes and their mixes) take the one that,
        with the curl angles of that hand, brings the thumb tip nearest the middle joint of the index finger."""
        P = self.P
        B = self.B
        for side, curl, thumb in (('L', P['fingerCurl'], P['thumbCurl']), ('R', P['gripCurl'], P['gripThumb'])):
            h = self.hand[side]
            d0, n0, c0 = h['d0'], h['n0'], h['c0']
            cands = [a * sg for a in (d0, n0, c0) for sg in (1, -1)]
            for a, b in ((n0, c0), (d0, n0), (d0, c0)):
                cands += [(a * s1 + b * s2).normalized() for s1 in (1, -1) for s2 in (1, -1)]
            chain = self.chains[(side, 0)]
            best = None
            for cand in cands:
                for name in chain:
                    self.fingerAxis[name] = cand
                heads, _ = self.Fk(self.FingerDeltas(side, ID, curl, thumb), self.restHead[self.pelvis])
                tip = heads[chain[2]] + (heads[chain[2]] - heads[chain[1]]) * 0.9
                cost = (tip - heads[B(side + ' Finger11')]).length
                if best is None or cost < best[0]:
                    best = (cost, cand)
            for name in chain:
                self.fingerAxis[name] = best[1]
            print('THUMB', side, 'axis', [round(v, 2) for v in best[1]], 'tip-to-index-middle %.3f m' % best[0], flush=True)

    # ------------------------------------------------------------------ skin
    def EvalPoints(self):
        ev = self.body.evaluated_get(bpy.context.evaluated_depsgraph_get())
        me = ev.to_mesh()
        co = np.empty(len(me.vertices) * 3)
        me.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3)
        w = np.array(ev.matrix_world)
        ev.to_mesh_clear()
        return co @ w[:3, :3].T + w[:3, 3]

    # ------------------------------------------------------------------ FK
    def Fk(self, D, pelvisPos):
        heads, deltas = {}, {}
        for n in self.order:
            p = self.parent[n]
            if p is None:
                heads[n] = self.restHead[n].copy()
                deltas[n] = D.get(n, ID)
            else:
                heads[n] = heads[p] + deltas[p] @ (self.restHead[n] - self.restHead[p])
                deltas[n] = D.get(n, deltas[p])
            if n == self.pelvis:
                heads[n] = Vector(pelvisPos)
        return heads, deltas

    def World(self, heads, deltas):
        one = Vector((1, 1, 1))
        return {n: Matrix.LocRotScale(heads[n], deltas[n] @ self.restQ[n], one) for n in self.names}

    def ApplyWorld(self, world):
        bones = self.arm.pose.bones
        M = {n: self.armInv @ world[n] for n in self.names}
        for n in self.order:
            p = self.parent[n]
            bones[n].matrix_basis = self.relInv[n] @ (M[p].inverted() @ M[n] if p else M[n])
        self.Update()

    # ------------------------------------------------------------------ IK
    def Hinge(self, root, target, lengths, poleDir, rest0, restAxis, flexRest=0.0, cap=1.0):
        """Two-bone solve. Returns (upper delta, lower delta, flexion, reach ratio).
        poleDir: the side the joint bends toward (world). rest0: rest direction of the upper bone, restAxis: rest hinge axis."""
        l1, l2 = lengths
        d = Vector(target) - Vector(root)
        reach = d.length / (l1 + l2)
        distance = Clamp(d.length, abs(l1 - l2) + 1e-4, (l1 + l2) * cap)
        dn = d.normalized()
        q = Perp(poleDir, dn)
        cosInterior = (l1 * l1 + l2 * l2 - distance * distance) / (2 * l1 * l2)
        flexion = math.pi - math.acos(Clamp(cosInterior, -1, 1))
        cosAlpha = (l1 * l1 + distance * distance - l2 * l2) / (2 * l1 * distance)
        alpha = math.acos(Clamp(cosAlpha, -1, 1))
        t = (dn * math.cos(alpha) + q * math.sin(alpha)).normalized()
        hinge = q.cross(dn).normalized()
        upper = FrameRot(rest0, restAxis, t, hinge)
        lower = Quaternion(hinge, flexion - flexRest) @ upper
        return upper, lower, flexion, reach

    # ------------------------------------------------------------------ feet
    def FootSetup(self):
        P = self.P
        self.stride = 2 * P['stepM']
        self.cycleS = P['frames'] / P['fps']
        self.speed = self.stride / self.cycleS
        self.pelvisRest = self.restHead[self.pelvis].copy()

    def FootStance(self, side, u, xw, floor):
        """Ankle position, foot and toe deltas for the foot phase u in [0, stance] (ground-fixed contact)."""
        P = self.P
        s = self.side[side]
        pv = self.pivots[side]
        A0 = self.restHead[self.B(side + ' Foot')]
        T0 = self.restHead[self.B(side + ' Toe0')]
        psi = s * P['toeOutRad']
        yaw = Rz(psi)
        yRef = self.pelvisRest.y
        stride = self.stride
        clear = P['clearanceM']
        uHr, uHl, uTo = P['heelRockerEnd'], P['heelOff'], P['stance']

        def Settle(uu):
            # The heel lands still moving forward over the ground (landSpeedShare of the walking speed, so the swing and the stance
            # join with the same velocity) and stops over the heel rocker; the drift is a few millimetres.
            x = min(uu, uHr) / uHr
            return -P['landSpeedShare'] * stride * uHr * (x - x * x + x ** 3 / 3)

        def HeelPoint(uu):
            return Vector((xw, yRef - P['heelStrikeM'] + stride * uu + Settle(uu), floor + clear))
        if u <= uHl:
            theta = -P['strikePitch'] * (1 - Smooth(u / uHr)) if u < uHr else 0.0
            Df = yaw @ Rx(theta)
            H = HeelPoint(u)
            A = H - Df @ (pv['h0'] - A0)
            return A, Df, Df, theta
        Hhl = HeelPoint(uHl)
        Bhl = Hhl + yaw @ (pv['b0'] - pv['h0'])
        Bu = Bhl + Vector((0, stride * (u - uHl), 0))
        x = (u - uHl) / (uTo - uHl)
        theta = P['toeOffPitch'] * Smooth(x) ** P['toeRisePower']
        Df = yaw @ Rx(theta)
        Dt = yaw
        A = Bu - Df @ (T0 - A0) - Dt @ (pv['b0'] - T0)
        return A, Df, Dt, theta

    def Foot(self, side, phi, floor, corr):
        P = self.P
        s = self.side[side]
        u = (phi + (0.0 if side == 'R' else 0.5)) % 1.0
        xw = s * P['footHalfWidthM']
        uTo = P['stance']
        yaw = Rz(s * P['toeOutRad'])
        if u <= uTo:
            A, Df, Dt, theta = self.FootStance(side, u, xw, floor)
            A = A.copy(); A.z += corr
            return dict(ankle=A, foot=Df, toe=Dt, stance=True, u=u, pitch=theta)
        tau = (u - uTo) / (1 - uTo)
        A0s, Dfs, Dts, thetaTo = self.FootStance(side, uTo, xw, floor)
        A1s, Dfe, Dte, thetaHs = self.FootStance(side, 0.0, xw, floor)
        stride = self.stride
        # Forward travel as a minimum-jerk move in the GROUND frame (zero ground speed at toe-off and heel strike), shown in the
        # clip frame by adding the pelvis's progress: velocity and acceleration then join the stance exactly.
        ygTo = A0s.y - stride * uTo
        ygHs = A1s.y - stride
        # cubic Hermite in the ground frame: starts at rest, lands still moving forward at landSpeed * the walking speed
        m1 = -P['landSpeedShare'] * stride * (1 - uTo)
        h00, h10, h01, h11 = 2 * tau ** 3 - 3 * tau ** 2 + 1, tau ** 3 - 2 * tau ** 2 + tau, -2 * tau ** 3 + 3 * tau ** 2, tau ** 3 - tau ** 2
        y = h00 * ygTo + h01 * ygHs + h11 * m1 + stride * u
        lift = P['swingLiftM'] * math.sin(math.pi * tau ** P['swingLiftExp']) ** 2        # zero slope at both ends, peak earlier than mid-swing
        ankle = Vector((Lerp(A0s.x, A1s.x, Smooth(tau)) + s * P['circumductionM'] * math.sin(math.pi * tau) ** 2, y,
                        Lerp(A0s.z, A1s.z, Smooth(tau)) + lift + corr))
        mid = P['midSwingPitch']
        theta = Lerp(thetaTo, mid, Smooth(tau / 0.5)) if tau < 0.5 else Lerp(mid, thetaHs, Smooth((tau - 0.5) / 0.5))
        toeFlat = 1 - Smooth(tau / 0.3)
        Df = yaw @ Rx(theta)
        Dt = yaw @ Rx(theta * (1 - toeFlat))
        return dict(ankle=ankle, foot=Df, toe=Dt, stance=False, u=u, pitch=theta)

    # ------------------------------------------------------------------ rifle grip
    def RifleFrameRest(self):
        """Rifle orientation in the character frame (rest axes) as columns of a matrix: X right, Y up, Z back.
        The axis runs from the grip to the point where it crosses the body's centre line behind the neck."""
        P = self.P
        origin = self.restHead[self.B('Spine2')]
        grip = origin + Vector(P['gripFromChest'])
        cross = origin + Vector((0.0, P['rifleCrossBackUp'][0], P['rifleCrossBackUp'][1]))
        a = (cross - grip).normalized()
        up = Perp(Vector((0, 0, 1)), a)
        up = Quaternion(a, P['rifleRollRad']) @ up
        right = a.cross(up).normalized()
        back = -a
        return Matrix(((right.x, up.x, back.x), (right.y, up.y, back.y), (right.z, up.z, back.z)))

    def BuildGrip(self):
        """Hand orientation on the rifle: the finger-curl axis is the rifle axis (either way), the palm normal is the
        rifle's up turned about the axis by psi. psi and the axis sign are searched for the most open elbow with a
        modest wrist bend and a forearm twist inside the human range, at the neutral pose."""
        P = self.P
        B = self.B
        R0 = self.RifleFrameRest()
        a = -R0.col[2].to_3d()
        up = R0.col[1].to_3d()
        hand = self.hand['R']
        shoulder = self.restHead[B('R UpperArm')]
        grip = self.restHead[B('Spine2')] + Vector(P['gripFromChest'])
        pole = Vector(P['elbowPoleR'])
        fdir0 = self.dir('R Forearm', 'R Hand')
        wristRest = math.acos(Clamp(fdir0.dot(hand['d0']), -1, 1))
        rows = []
        steps = int(360 / P['gripSearchStepDeg'])
        for sign in (1, -1):
            for k in range(steps):
                psi = k * Tau / steps
                c_w = a * sign
                n_w = Perp(Quaternion(a, psi) @ up, c_w)
                d_w = n_w.cross(c_w).normalized()
                Dh = FrameRot(hand['d0'], hand['n0'], d_w, n_w)
                wrist = grip - Dh @ (hand['grip'] - self.restHead[B('R Hand')])
                upper, lower, flex, reach = self.Hinge(shoulder, wrist, self.armL['R'], pole, self.dir('R UpperArm', 'R Forearm'),
                                                       self.armRestAxis('R'), self.armRestFlex('R'), 1.0)
                fdir = lower @ fdir0
                wristFlex = math.degrees(math.acos(Clamp(fdir.dot(d_w), -1, 1)) - wristRest)
                nf = Perp(lower @ hand['n0'], fdir)
                nh = Perp(n_w, fdir)
                twist = math.degrees(math.atan2(fdir.dot(nf.cross(nh)), nf.dot(nh)))
                lo, hi = P['forearmTwistRangeDeg']
                cost = math.degrees(flex) + 3 * max(0.0, wristFlex - P['wristFlexLimitDeg']) + 3 * max(0.0, twist - hi, lo - twist) + (100 if reach > 1.0 else 0)
                rows.append((cost, sign, psi, math.degrees(flex), wristFlex, twist))
        rows.sort()
        for r in rows[:3]:
            print('GRIP candidate cost %.1f sign %d psi %.0f elbow %.1f wrist %.1f twist %.1f' % (r[0], r[1], math.degrees(r[2]), r[3], r[4], r[5]), flush=True)
        _, sign, psi, *_ = rows[0]
        c_w = a * sign
        n_w = Perp(Quaternion(a, psi) @ up, c_w)
        d_w = n_w.cross(c_w).normalized()
        self.handRel = (R0.to_quaternion().inverted()) @ FrameRot(hand['d0'], hand['n0'], d_w, n_w)
        self.RifleRot0 = R0.to_quaternion()
        self.gripChoice = dict(sign=sign, psiDeg=round(math.degrees(psi), 1))
        print('GRIP hand dir', [round(x, 3) for x in d_w], 'palm', [round(x, 3) for x in n_w], 'rifle axis', [round(x, 3) for x in a], flush=True)

    def SolveBase(self):
        self.FootSetup()

    # ------------------------------------------------------------------ pose
    def KneeTargetDeg(self, u):
        P = self.P
        return (P['kneeBaseDeg'] + P['kneeLoadingDeg'] * math.exp(-((u - P['kneeLoadingU']) / P['kneeLoadingWidth']) ** 2)
                + P['kneePreSwingDeg'] * Smooth((u - P['kneePreSwingFrom']) / (P['stance'] - P['kneePreSwingFrom'])))

    def PelvisHeightAt(self, phi, corr, pelvisXY, Dp, both=False, full=False):
        """Highest pelvis height at which each leg reaches its ankle target with its allowed knee flexion
        (stance: the knee-flexion target; swing: the global reach cap); the two limits are blended with a soft minimum."""
        P = self.P
        B = self.B
        limits = []
        for side in 'LR':
            foot = self.Foot(side, phi, self.floorZ, corr[side])
            off = Dp @ (self.restHead[B(side + ' Thigh')] - self.restHead[self.pelvis])
            hipXY = Vector((pelvisXY.x + off.x, pelvisXY.y + off.y, 0))
            L1, L2 = self.L[side]
            if full:
                cap = P['reachCap']
            elif foot['stance']:
                cap = math.cos(math.radians(self.KneeTargetDeg(foot['u'])) / 2)
            else:   # swing: the allowed flexion relaxes from the toe-off value, then settles smoothly onto the heel-strike value
                tau = (foot['u'] - P['stance']) / (1 - P['stance'])
                w = Smooth(tau / P['kneeSwingReleaseTau'])
                late = self.KneeTargetDeg(0.0) + P['kneeLateSwingExtraDeg'] * (1 - Smooth((tau - P['kneeLateSwingFrom']) / (1 - P['kneeLateSwingFrom'])))
                flex = Lerp(self.KneeTargetDeg(P['stance']), late, w)
                cap = math.cos(math.radians(flex) / 2)
            reachLen = (L1 + L2) * cap
            dx, dy = foot['ankle'].x - hipXY.x, foot['ankle'].y - hipXY.y
            hipZ = foot['ankle'].z + math.sqrt(max(0.0, reachLen ** 2 - dx * dx - dy * dy))
            limits.append(hipZ - off.z)
        if both:
            return limits
        k = P['softMinM']
        low = min(limits)
        softmin = low - k * math.log(sum(math.exp(-(v - low) / k) for v in limits))
        return softmin - P['pelvisDropM']

    def PelvisBase(self, phi, fwd):
        """Pelvis planar position (before height), its rotation, and yaw for the clip phase phi; `fwd` = forward offset (m)."""
        P = self.P
        sway = -P['swayM'] * math.cos(Tau * (phi - P['swayPeakPhase']))
        yawP = P['pelvisYawRad'] * math.cos(Tau * phi)
        list_ = P['pelvisListRad'] * math.cos(Tau * (phi - P['listPeakPhase']))
        pitchP = P['pelvisPitch'] + P['pelvisPitchOsc'] * math.cos(2 * Tau * (phi - 0.05))
        Dp = Rz(yawP) @ Ry(list_) @ Rx(pitchP)
        return Vector((self.pelvisRest.x + sway, self.pelvisRest.y - fwd, 0.0)), Dp, yawP

    def HeightTable(self, fwdTable):
        """Pelvis height per frame. The shape comes from the knee-flexion targets (soft minimum of the two legs' limits), is
        smoothed over several frames, and only then held under the hard limit of a knee that never goes past reachCap."""
        P = self.P
        N = P['frames']
        zero = {'L': 0.0, 'R': 0.0}
        soft, hard = [], []
        k = P['softMinM']
        for f in range(N):
            xy, Dp, _ = self.PelvisBase(f / N, fwdTable[f])
            limits = self.PelvisHeightAt(f / N, zero, xy, Dp, both=True)
            low = min(limits)
            soft.append(low - k * math.log(sum(math.exp(-(v - low) / k) for v in limits)) - P['pelvisDropM'])
            hard.append(min(self.PelvisHeightAt(f / N, zero, xy, Dp, both=True, full=True)))
        h = P['heightFilterFrames']
        kernel = np.array([h + 1 - abs(j) for j in range(-h, h + 1)], dtype=float)
        kernel /= kernel.sum()
        values = np.array(soft)
        padded = np.concatenate([values[-h:], values, values[:h]])
        smooth = np.convolve(padded, kernel, mode='valid')
        return [float(min(v, hd - P['hardMarginM'])) for v, hd in zip(smooth, hard)]

    def Com(self, heads, deltas, riflePos, rifleRot):
        """Mass-weighted centre of mass (Winter/Dempster fractions; the rifle as a point mass), Blender coordinates."""
        B = self.B
        terms = []
        seg = [('UpperArm', 'Forearm', 0.028, 0.436), ('Forearm', 'Hand', 0.016, 0.430), ('Thigh', 'Calf', 0.100, 0.433),
               ('Calf', 'Foot', 0.0465, 0.433), ('Foot', 'Toe0', 0.0145, 0.5)]
        for side in 'LR':
            for a, b, m, f in seg:
                terms.append((m, heads[B(side + ' ' + a)].lerp(heads[B(side + ' ' + b)], f)))
            tip = sum((heads[B(side + ' Finger%d2' % k)] for k in range(1, 5)), Vector()) / 4
            terms.append((0.006, heads[B(side + ' Hand')].lerp(tip, 0.506)))
        hip = (heads[B('L Thigh')] + heads[B('R Thigh')]) / 2
        shoulder = (heads[B('L UpperArm')] + heads[B('R UpperArm')]) / 2
        terms.append((0.497, hip.lerp(shoulder, 0.5)))
        terms.append((0.081, heads[B('Head')] + deltas[B('Head')] @ self.headCentroidRel))
        mass = sum(m for m, _ in terms)
        com = sum((m * p for m, p in terms), Vector()) / mass
        k = 4.0 / 60.0
        rifleCom = riflePos + rifleRot @ Vector((0, 0, -0.195 * 1.0946))
        return (com + rifleCom * k) / (1 + k)

    def Pose(self, phi, corr, height, fwd):
        P = self.P
        B = self.B
        th = Tau * phi
        D = {}
        # --- pelvis
        pelvisXY, D[B('Pelvis')], yawP = self.PelvisBase(phi, fwd)
        pelvisPos = Vector((pelvisXY.x, pelvisXY.y, height))
        yawT = -P['thoraxYawRad'] * math.cos(Tau * (phi - P['thoraxYawLag']))
        for part in ['Spine', 'Spine1', 'Spine2', 'Neck', 'Head']:
            yaw = yawP + (yawT - yawP) * P['yawShare'][part] if part in ('Spine', 'Spine1', 'Spine2') else yawT * P['yawShare'][part]
            roll = P['rollLoad'][part] + P['rollOsc'][part] * math.cos(Tau * (phi - P['listPeakPhase']))
            D[B(part)] = Rz(yaw) @ Ry(roll) @ Rx(P['pitch'][part])
        chest = D[B('Spine2')]
        D[B('L Clavicle')] = chest
        D[B('R Clavicle')] = chest @ Rz(P['protractRad']) @ Ry(P['shrugRad'])
        heads, deltas = self.Fk(D, pelvisPos)
        info = {}
        # --- legs
        for side in 'LR':
            s = self.side[side]
            foot = self.Foot(side, phi, self.floorZ, corr[side])
            hip = heads[B(side + ' Thigh')]
            pole = Rz(s * P['toeOutRad'] * 0.5) @ Vector((0, -1, 0))
            upper, lower, flex, reach = self.Hinge(hip, foot['ankle'], self.L[side], pole,
                                                   self.dir(side + ' Thigh', side + ' Calf'), Vector((1, 0, 0)), 0.0, P['reachCap'])
            D[B(side + ' Thigh')] = upper
            D[B(side + ' Calf')] = lower
            D[B(side + ' Foot')] = foot['foot']
            D[B(side + ' Toe0')] = foot['toe']
            info[side] = dict(flex=flex, reach=reach, stance=foot['stance'], u=foot['u'], pitch=foot['pitch'], ankle=foot['ankle'])
        heads, deltas = self.Fk(D, pelvisPos)
        # --- free left arm
        sw = P['armBiasRad'] + P['armSwingRad'] * math.cos(Tau * (phi - P['armPhaseLag']))
        forward = max(0.0, math.cos(Tau * (phi - P['armPhaseLag'])))
        tL = Vector((math.sin(P['armOutRad']), -math.sin(sw) * math.cos(P['armOutRad']), -math.cos(sw) * math.cos(P['armOutRad']))).normalized()
        tL = chest @ tL
        flexL = P['elbowBaseRad'] + P['elbowSwingRad'] * forward
        up_, lo_, hand_ = self.FreeArm('L', tL, flexL, chest)
        D[B('L UpperArm')], D[B('L Forearm')], D[B('L Hand')] = up_, lo_, hand_
        D.update(self.FingerDeltas('L', hand_, P['fingerCurl'], P['thumbCurl']))
        # --- right arm holding the rifle
        rifleRot, gripPos = self.RiflePose(phi, heads, deltas)
        Dh = rifleRot @ self.handRel
        wrist = gripPos - Dh @ (self.hand['R']['grip'] - self.restHead[B('R Hand')])
        shoulder = heads[B('R UpperArm')]
        pole = chest @ Vector(P['elbowPoleR'])
        upper, lower, flex, reach = self.Hinge(shoulder, wrist, self.armL['R'], pole,
                                               self.dir('R UpperArm', 'R Forearm'), self.armRestAxis('R'), self.armRestFlex('R'), 1.0)
        D[B('R UpperArm')], D[B('R Forearm')], D[B('R Hand')] = upper, lower, Dh
        D.update(self.FingerDeltas('R', Dh, P['gripCurl'], P['gripThumb']))
        info['armR'] = dict(flex=flex, reach=reach)
        heads, deltas = self.Fk(D, pelvisPos)
        info['rifle'] = dict(rot=rifleRot, pos=gripPos)
        info['pelvis'] = pelvisPos
        info['com'] = self.Com(heads, deltas, gripPos, rifleRot)
        return self.World(heads, deltas), heads, deltas, info

    def armRestAxis(self, side):
        d1 = self.dir(side + ' UpperArm', side + ' Forearm')
        d2 = self.dir(side + ' Forearm', side + ' Hand')
        return d1.cross(d2).normalized()

    def armRestFlex(self, side):
        d1 = self.dir(side + ' UpperArm', side + ' Forearm')
        d2 = self.dir(side + ' Forearm', side + ' Hand')
        return math.acos(Clamp(d1.dot(d2), -1, 1))

    def FreeArm(self, side, t, flex, chestQ):
        """Hanging arm: upper arm direction t, forearm flexed forward by `flex` (hand follows the forearm)."""
        q = chestQ @ Vector((0, 1, 0))
        dn = Vector(t).normalized()
        hinge = Perp(q, dn).cross(dn).normalized()
        upper = FrameRot(self.dir(side + ' UpperArm', side + ' Forearm'), self.armRestAxis(side), dn, hinge)
        lower = Quaternion(hinge, flex - self.armRestFlex(side)) @ upper
        return upper, lower, lower

    def FingerDeltas(self, side, Dh, curl, thumb):
        out = {}
        for k in range(5):
            angles = thumb if k == 0 else curl
            cumulative = Dh
            for j, name in enumerate(self.chains[(side, k)]):
                cumulative = cumulative @ Quaternion(self.fingerAxis[name], angles[j])
                out[name] = cumulative
        return out

    def RiflePose(self, phi, heads, deltas):
        P = self.P
        chest = deltas[self.B('Spine2')]
        bobPitch = P['rifleBobPitchRad'] * math.sin(2 * Tau * (phi - P['rifleBobPhase']))
        bobRoll = P['rifleBobRollRad'] * math.sin(Tau * (phi - P['rifleBobPhase']))
        lift = P['rifleBobLiftM'] * math.sin(2 * Tau * (phi - P['rifleBobPhase']))
        rot = chest @ Ry(bobRoll) @ Rx(bobPitch) @ self.RifleRot0
        pos = heads[self.B('Spine2')] + chest @ Vector(P['gripFromChest']) + Vector((0, 0, lift))
        return rot, pos

    # ------------------------------------------------------------------ solve + export
    def Run(self, only=None):
        P = self.P
        N = P['frames']
        t0 = time.time()
        zero = {'L': 0.0, 'R': 0.0}
        # --- fore-aft pelvis offset: iterate until the whole-body COM follows the prescribed braking/propulsion speed
        amplitude = P['comFwdSpeedMps'] * self.cycleS / (2 * Tau)
        target = [amplitude * math.sin(2 * Tau * (f / N - P['comFwdSpeedPeakPhase'])) for f in range(N)]
        fwd = [0.0] * N
        for it in range(6 if P['comDrive'] else 0):
            heights = self.HeightTable(fwd)
            comY = [self.Pose(f / N, zero, heights[f], fwd[f])[3]['com'].y for f in range(N)]
            mean = sum(comY) / N
            err = [comY[f] - mean + target[f] for f in range(N)]       # + = the COM is too far back
            spectrum = np.fft.rfft(np.array(err) - sum(err) / N)
            spectrum[P['comFwdHarmonics'] + 1:] = 0          # keep only the slow harmonics: the pelvis path must stay smooth
            smooth = np.fft.irfft(spectrum, N)
            worst = float(np.abs(smooth).max())
            fwd = [fwd[f] + float(smooth[f]) for f in range(N)]
            print('COM pass %d: max error %.2f mm, pelvis fore-aft range %.1f mm' % (it, worst * 1000, (max(fwd) - min(fwd)) * 1000), flush=True)
            if worst < 2e-4:
                break
        heights = self.HeightTable(fwd)
        self.heights, self.fwd = heights, fwd
        if os.environ.get('RIFLE_MARCH_DEBUG'):
            for f in range(0, N, 3):
                xy, Dp, _ = self.PelvisBase(f / N, fwd[f])
                lim = self.PelvisHeightAt(f / N, zero, xy, Dp, both=True)
                print('LIMITS f %2d phi %.3f  L %.4f  R %.4f  H %.4f' % (f, f / N, lim[0], lim[1], heights[f]), flush=True)
        samples, props, logs, contacts = [], [], [], []
        for f in range(N + 1):
            phi = (f % N) / N
            if f == N:
                samples.append(samples[0]); props.append(props[0]); continue
            corr = {'L': 0.0, 'R': 0.0}
            for it in range(4):
                world, heads, deltas, info = self.Pose(phi, corr, heights[f], fwd[f])
                self.ApplyWorld(world)
                pts = self.EvalPoints()
                lows = {s: float(pts[self.soleIdx[s], 2].min()) for s in 'LR'}
                for s in 'LR':
                    want = P['clearanceM'] if info[s]['stance'] else max(P['clearanceM'], lows[s])
                    corr[s] += want - lows[s]
                if all(abs((P['clearanceM'] if info[s]['stance'] else max(P['clearanceM'], lows[s])) - lows[s]) < 2e-4 for s in 'LR'):
                    break
            world, heads, deltas, info = self.Pose(phi, corr, heights[f], fwd[f])
            self.ApplyWorld(world)
            pts = self.EvalPoints()
            lows = {s: float(pts[self.soleIdx[s], 2].min()) for s in 'LR'}
            samples.append(self.SourcePose())
            R = Matrix.LocRotScale(info['rifle']['pos'], info['rifle']['rot'], Vector((1, 1, 1)))
            props.append(R)
            logs.append(dict(f=f, flexL=math.degrees(info['L']['flex']), flexR=math.degrees(info['R']['flex']),
                             armR=math.degrees(info['armR']['flex']), reachL=info['L']['reach'], reachR=info['R']['reach'],
                             lowL=lows['L'], lowR=lows['R'], corrL=corr['L'], corrR=corr['R'],
                             pelvisZ=float(info['pelvis'].z), comY=float(info['com'].y), comZ=float(info['com'].z)))
            contacts.append({s: (heads[self.B(s + ' Toe0')].copy()) for s in 'LR'})
        self.logs, self.samples, self.props, self.toeTrack = logs, samples, props, contacts
        print('BAKE frames %d in %.1fs' % (N, time.time() - t0), flush=True)
        return None

    def Report(self):
        L = self.logs
        rng = lambda k: (round(min(l[k] for l in L), 4), round(max(l[k] for l in L), 4))
        print('KNEE L', rng('flexL'), 'R', rng('flexR'), 'ELBOW R', rng('armR'))
        print('REACH', rng('reachL'), rng('reachR'))
        N = self.P['frames']
        at = lambda k, ph: round(L[int(round(ph * N)) % N][k], 1)
        print('KNEE@phase R', {ph: at('flexR', ph) for ph in (0, .1, .15, .31, .4, .5, .62, .73, .9)}, 'pelvisZ', rng('pelvisZ'))
        print('SOLE low L', rng('lowL'), 'R', rng('lowR'), 'CORR', rng('corrL'), rng('corrR'))
        flex = [l['flexR'] for l in L]
        second = [abs(flex[(i - 1) % N] - 2 * flex[i] + flex[(i + 1) % N]) for i in range(N)]
        worst = max(range(N), key=lambda i: second[i])
        print('SCORE kneeSpike %.2f at %.3f  pelvisPP %.1f mm  kneePeak %.1f  kneeToeOff %.1f' % (
            second[worst], worst / N, (max(l['pelvisZ'] for l in L) - min(l['pelvisZ'] for l in L)) * 1000, max(flex), at('flexR', self.P['stance'])))

    def Contacts(self):
        """Foot contact spans (fractions of the cycle), measured like _import/Script_LocomotionProfileBake:
        the toe joint is low and travelling back faster than 0.12 m/s. Runs crossing the seam are split."""
        P = self.P
        N = P['frames']
        dt = self.cycleS / N
        out = {}
        for s in 'LR':
            toe = [self.toeTrack[i][s] for i in range(N)]
            floor = min(p.z for p in toe)
            flags = []
            for i in range(N):
                vel = (toe[(i + 1) % N].y - toe[(i - 1) % N].y) / (2 * dt)   # +Y is backward
                flags.append(toe[i].z < floor + 0.035 and vel > 0.12)
            spans = []
            if all(flags):
                spans = [[0.0, 1.0]]
            elif any(flags):
                first = next(i for i in range(N) if not flags[i])
                runs, cur = [], None
                for k in range(1, N + 1):
                    if flags[(first + k) % N]:
                        cur = [k, k] if cur is None else [cur[0], k]
                    elif cur is not None:
                        runs.append(cur); cur = None
                if cur is not None:
                    runs.append(cur)
                for ks, ke in runs:
                    length = ke - ks + 1
                    if length * dt <= 0.075:
                        continue
                    a = (first + ks) % N
                    if a + length > N:
                        spans.append([round(a / N, 4), 1.0]); spans.append([0.0, round((a + length - N) / N, 4)])
                    else:
                        spans.append([round(a / N, 4), round((a + length) / N, 4)])
                spans.sort()
            out[s] = spans
        return out

    def Export(self, height):
        P = self.P
        N = P['frames']
        names = self.names
        samples = self.samples
        times = [round(f / P['fps'], 6) for f in range(N + 1)]
        duration = times[-1]
        tracks = []
        # keep quaternion signs continuous
        def Fix(vals, width):
            out = []
            prev = None
            for f in range(len(vals) // width):
                q = vals[f * width:(f + 1) * width]
                if prev is not None and sum(a * b for a, b in zip(prev, q)) < 0:
                    q = [-v for v in q]
                out.extend(q); prev = q
            return out
        for i, n in enumerate(names):
            for prop, off, width, kind in [('position', 0, 3, 'vector'), ('quaternion', 3, 4, 'quaternion')]:
                values = [round(v, 6 if kind == 'quaternion' else 5) for s in samples for v in s[i * 7 + off:i * 7 + off + width]]
                if kind == 'quaternion':
                    values = Fix(values, 4)
                    values[-4:] = values[:4]
                else:
                    values[-3:] = values[:3]
                if all(abs(values[j] - values[j % width]) < 2e-5 for j in range(len(values))):
                    tracks.append({'name': n.replace(' ', '_') + '.' + prop, 'type': kind, 'times': [0], 'values': values[:width]})
                else:
                    tracks.append({'name': n.replace(' ', '_') + '.' + prop, 'type': kind, 'times': times, 'values': values})
        # rifle prop track (rig-root local = shipped glTF frame, grip origin, muzzle -Z)
        pos, quat = [], []
        prev = None
        for R in self.props:
            m = convert.inverted() @ R
            p, q, _ = m.decompose()
            if prev is not None and prev.dot(q) < 0:
                q = Quaternion((-q.w, -q.x, -q.y, -q.z))
            pos.extend(round(v, 6) for v in p)
            quat.extend(round(v, 6) for v in (q.x, q.y, q.z, q.w))
            prev = q
        pos[-3:] = pos[:3]
        quat[-4:] = quat[:4]
        tracks.append({'name': 'AllyRifle.position', 'type': 'vector', 'times': times, 'values': pos})
        tracks.append({'name': 'AllyRifle.quaternion', 'type': 'quaternion', 'times': times, 'values': quat})
        contacts = self.Contacts()
        profile = {'duration': duration, 'referenceMps': round(self.speed, 6), 'contacts': contacts,
                   'strideM': round(self.stride, 5), 'stepM': P['stepM'], 'pelvisHeightM': round(height, 5),
                   'weapon': 'ZhongZheng', 'rifleTrack': 'AllyRifle'}
        clip = {'name': CLIP, 'uuid': CLIP, 'duration': duration, 'tracks': tracks, 'blendMode': 2500}
        data = {'schema': 1, 'revision': REVISION, 'skeleton': 'TengxianHumanoidV1', 'sourceModel': 'Model/Character/Model_TengxianNra02.glb',
                'clips': [clip], 'profiles': {CLIP: profile}}
        text = json.dumps(data, separators=(',', ':'))
        return text, profile

    def SaveScene(self):
        arm = self.arm
        action = bpy.data.actions.new(CLIP)
        action.use_fake_user = True
        arm.animation_data_create()
        arm.animation_data.action = action
        P = self.P
        for f in range(P['frames'] + 1):
            phi = (f % P['frames']) / P['frames']
            corr = self.corrs[f % P['frames']]
            world, *_ = self.Pose(phi, corr, self.heights[f % P['frames']], self.fwd[f % P['frames']])
            self.ApplyWorld(world)
            for pb in arm.pose.bones:
                pb.keyframe_insert('location', frame=f + 1, group=pb.name)
                pb.keyframe_insert('rotation_quaternion', frame=f + 1, group=pb.name)
        scene = bpy.context.scene
        scene.render.fps = P['fps']
        scene.frame_start = 1
        scene.frame_end = P['frames'] + 1
        scene.frame_set(1)
        helpers['Op'](bpy.ops.wm.save_as_mainfile, filepath=str(private / 'Scene_RifleShoulderMarch.blend'))


def Bake(ctx):
    march = March(ctx)
    march.Run()
    height = float(np.mean([l['pelvisZ'] for l in march.logs]))
    march.corrs = [{'L': l['corrL'], 'R': l['corrR']} for l in march.logs]
    march.Report()
    text, profile = march.Export(height)
    (scratch / 'Animation_TengxianRifleShoulderMarch.candidate.json').write_text(text, encoding='utf-8')
    (scratch / 'BakeLog.json').write_text(json.dumps(march.logs), encoding='utf-8')
    if os.environ.get('RIFLE_MARCH_WRITE', '1') != '0':
        (output / 'Animation_TengxianRifleShoulderMarch.json').write_text(text, encoding='utf-8')
    if os.environ.get('RIFLE_MARCH_SAVE', '0') == '1':
        march.SaveScene()
    print(json.dumps({'file': 'Animation_TengxianRifleShoulderMarch.json', 'sha256': hashlib.sha256(text.encode()).hexdigest(),
                      'bytes': len(text), 'profile': profile}), flush=True)
    return march


MARCH = helpers['Bake']('TengxianNra02', probe=Bake)
