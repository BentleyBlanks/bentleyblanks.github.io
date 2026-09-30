"""Directional death clips from a Bullet rigid-body ragdoll, authored through BlenderMCP.

Run `Script_DeathImpactPrepare.mjs` first (it writes tmp/DeathImpact/Data_DeathImpactSource.json:
the shared skeleton at rest and the two standing rifle poses of `AdvanceFire`).
Environment: DEATH_IMPACT_PROJECT = absolute Taierzhuang1938 directory (required);
DEATH_IMPACT_CLIPS = comma list, bake a subset; DEATH_IMPACT_RENDER=1 = side/front sample renders into
the private folder; DEATH_IMPACT_WRITE=0 = do not write the JSON (tuning runs).

Method (docs/Data_DeathImpactClips.md has the numbers):

* Same importer / source-frame exporter as Script_LitterBearerBake.py. The production TengxianNra02 rig
  is posed at the game's standing rifle pose, then every segment is replaced by ONE capsule fitted to
  the skinned vertices of that segment (pelvis, abdomen, chest, head, upper arm, forearm+hand, thigh,
  calf, foot). Masses follow Dempster (70 kg). Thirteen joints are Bullet Generic-Spring constraints with
  anatomical angle limits (knee/elbow hinge, hip/shoulder cones, spine +-25..30, neck +-40, ankle +-30);
  the spring equilibrium is the start pose.
* "Muscle tone": stiffness and damping of every joint spring are keyframed (RigidBodyConstraint
  properties are animatable): full until ~0.05-0.09 s after the hit, then a smoothstep down to a passive
  tissue floor, legs first, spine last. The body is held up by the springs, so the knees fold under
  weight instead of a board tipping over.
* The hit is a wind force field lasting one frame on the struck segment(s); Blender applies
  force = strength / fps, so the impulse is J [N s] = strength * frames / fps^2 (measured).
* Simulation at 60 fps, 10 substeps per frame, 40 solver iterations, split impulse. Ground: passive box,
  friction 0.9, restitution 0.05. Gravity is scaled by authoring/game height so the 1.82 m authoring
  body falls like the 1.66 m game body.
* Body transforms become bone matrices again (rigid delta of the driving body; spine1 / neck are 50/50
  blends), exported at 30 fps in the shipped node-local frame, tail trimmed at rest, constant tracks
  stored with two keys, the lowest skinned vertex lifted (never sunk) mid-clip and eased to 4 mm at the end.
"""
import bpy, os, json, math, runpy, hashlib, time, bmesh
from pathlib import Path
from mathutils import Matrix, Vector, Quaternion

project = Path(os.environ['DEATH_IMPACT_PROJECT'])
os.environ['CAPTIVES_PROJECT'] = str(project)
os.environ['CAPTIVES_SKIP_BLEND'] = '1'
source = json.loads((project.parent / 'tmp/DeathImpact/Data_DeathImpactSource.json').read_text())
helpers = runpy.run_path(str(project / '_import/Script_MachineGunCaptivesBake.py'), run_name='DeathImpactHelpers')
convert = helpers['convert']
Op = helpers['Op']
private = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DeathImpact_20260930')
output = project / 'Animation/HitReaction'
private.mkdir(parents=True, exist_ok=True)
output.mkdir(parents=True, exist_ok=True)
wanted = [c for c in os.environ.get('DEATH_IMPACT_CLIPS', '').split(',') if c]
DO_RENDER = os.environ.get('DEATH_IMPACT_RENDER') == '1'
DO_WRITE = os.environ.get('DEATH_IMPACT_WRITE', '1') != '0'
DEBUG = os.environ.get('DEATH_IMPACT_DEBUG') == '1'
DIAG = [d for d in os.environ.get('DEATH_IMPACT_DIAG', '').split(',') if d]   # tuning switches: nospring, nogravity, nolimit
REVISION = '20260930DeathImpactV1'

SIM_FPS = 60
SUBSTEPS = int(os.environ.get('DEATH_IMPACT_SUBSTEPS', 10))
ITERATIONS = int(os.environ.get('DEATH_IMPACT_ITERATIONS', 40))
OUT_FPS = 30
MASS_KG = 70.0
FLOOR_CLEARANCE = 0.004
GRAVITY = 9.81
HIT_FRAME = 3
DIR_ROT = float(os.environ.get('DEATH_IMPACT_DIRROT', 0.0))   # tuning: turn every hit direction about the vertical (deg, + = counter-clockwise from above)
TONE_SCALE = float(os.environ.get('DEATH_IMPACT_TONESCALE', 1.0))
DV_SCALE = float(os.environ.get('DEATH_IMPACT_DVSCALE', 1.0))
UPRIGHT_TILT_DEG = float(os.environ.get('DEATH_IMPACT_TILT', 10))

# Dempster fractions of 70 kg (per single segment). mode 'group': the skin vertices dominated by the listed
# weight groups; mode 'slab': every torso-ish vertex inside a slab of the spine (t0, t1 or None = joint distance, + extra) (the rig's Pelvis bone owns
# only a handful of vertices, the hips belong to Spine/Thigh, so groups cannot cut Dempster's segments).
# axis 'verts' = from the axis-from joint to the centroid of the segment's skin; 'sole' = flat-soled box along the foot.
SEGMENTS = [
    # id,       axis from,     axis to,      mode,   groups / slab (t0, t1 metres from the axis-from joint), mass, pct
    ('pelvis',  'Pelvis',      'Spine',      'slab', (-.11, .10, 0),                                         .142, .50),
    ('abdomen', 'Spine',       'Spine2',     'slab', (0.0, None, 0),                                         .139, .60),
    ('chest',   'Spine2',      'Neck',       'slab', (0.0, None, .02),                                       .216, .60),
    ('head',    'Neck',        'up',         'group', ['Head'],                                              .081, .80),
    ('uarmL',   'L UpperArm',  'L Forearm',  'group', ['L UpperArm'],                                        .028, .70),
    ('farmL',   'L Forearm',   'verts',      'group', ['L Forearm', 'L Hand', 'L Finger'],                   .022, .60),
    ('uarmR',   'R UpperArm',  'R Forearm',  'group', ['R UpperArm'],                                        .028, .70),
    ('farmR',   'R Forearm',   'verts',      'group', ['R Forearm', 'R Hand', 'R Finger'],                   .022, .60),
    ('thighL',  'L Thigh',     'L Calf',     'group', ['L Thigh'],                                           .100, .70),
    ('calfL',   'L Calf',      'L Foot',     'group', ['L Calf'],                                            .0465, .70),
    ('footL',   'L Foot',      'sole',        'group', ['L Foot', 'L Toe0'],                                  .0145, .70),
    ('thighR',  'R Thigh',     'R Calf',     'group', ['R Thigh'],                                           .100, .70),
    ('calfR',   'R Calf',      'R Foot',     'group', ['R Calf'],                                            .0465, .70),
    ('footR',   'R Foot',      'sole',        'group', ['R Foot', 'R Toe0'],                                  .0145, .70),
]
TORSO_GROUPS = ['Pelvis', 'Spine', 'Spine1', 'Spine2', 'Neck', 'L Clavicle', 'R Clavicle', 'L Thigh', 'R Thigh']
SHRINK = {'pelvis': .95, 'abdomen': .95, 'chest': .92, 'head': .95, 'farmL': .9, 'farmR': .9}
# bone role (without 'Bip001 ') -> (driving body,) or (body a, body b, weight of b). Others ride their parent.
BONE_BODY = {
    'Pelvis': ('pelvis',), 'Spine': ('abdomen',), 'Spine1': ('abdomen', 'chest', .5), 'Spine2': ('chest',),
    'Neck': ('chest', 'head', .5), 'Head': ('head',),
    'L Clavicle': ('chest',), 'R Clavicle': ('chest',),
    'L UpperArm': ('uarmL',), 'L Forearm': ('farmL',), 'R UpperArm': ('uarmR',), 'R Forearm': ('farmR',),
    'L Thigh': ('thighL',), 'L Calf': ('calfL',), 'L Foot': ('footL',), 'L Toe0': ('footL',),
    'R Thigh': ('thighR',), 'R Calf': ('calfR',), 'R Foot': ('footR',), 'R Toe0': ('footR',),
}

# Joints. `hinge`: X = bend axis measured from the start pose (positive = more flexed), ranges are
# 'flex' = (0, max) from straight. `ball`: X = flexion axis, Z = abduction axis, Y = twist (long) axis,
# ranges anatomical (degrees) about the neutral direction and re-expressed relative to the start pose.
# `neutral` is the child's straight direction: 'down', 'parentAxis' (spine, neck) or 'fwd' (ankle).
# Euler order is XYZ, twist in the middle so it stays clear of the gimbal.
JOINTS = [
    # name,       parent,    child,    bone at the joint, kind,   neutral,      flexion dir, ranges
    ('spine0',    'pelvis',  'abdomen', 'Spine',     'ball',  'parentAxis', 'fwd', dict(flex=(-20, 30), abd=(-25, 25), twist=25)),
    ('spine1',    'abdomen', 'chest',   'Spine2',    'ball',  'parentAxis', 'fwd', dict(flex=(-20, 30), abd=(-25, 25), twist=25)),
    ('neck',      'chest',   'head',    'Neck',      'ball',  'parentAxis', 'fwd', dict(flex=(-40, 40), abd=(-35, 35), twist=40)),
    ('shoulderL', 'chest',   'uarmL',   'L UpperArm', 'ball', 'down',       'fwd', dict(flex=(-50, 170), abd=(-30, 170), twist=60)),
    ('shoulderR', 'chest',   'uarmR',   'R UpperArm', 'ball', 'down',       'fwd', dict(flex=(-50, 170), abd=(-30, 170), twist=60)),
    ('elbowL',    'uarmL',   'farmL',   'L Forearm', 'hinge', 'fwd',        'fwd', dict(flex=(0, 145), twist=8, abd=4)),
    ('elbowR',    'uarmR',   'farmR',   'R Forearm', 'hinge', 'fwd',        'fwd', dict(flex=(0, 145), twist=8, abd=4)),
    ('hipL',      'pelvis',  'thighL',  'L Thigh',   'ball',  'down',       'fwd', dict(flex=(-20, 120), abd=(-30, 45), twist=35)),
    ('hipR',      'pelvis',  'thighR',  'R Thigh',   'ball',  'down',       'fwd', dict(flex=(-20, 120), abd=(-30, 45), twist=35)),
    ('kneeL',     'thighL',  'calfL',   'L Calf',    'hinge', 'back',       'fwd', dict(flex=(0, 140), twist=6, abd=3)),
    ('kneeR',     'thighR',  'calfR',   'R Calf',    'hinge', 'back',       'fwd', dict(flex=(0, 140), twist=6, abd=3)),
    ('ankleL',    'calfL',   'footL',   'L Foot',    'ball',  'fwd',        'up',  dict(flex=(-30, 30), abd=(-15, 15), twist=12, rel=True)),
    ('ankleR',    'calfR',   'footR',   'R Foot',    'ball',  'fwd',        'up',  dict(flex=(-30, 30), abd=(-15, 15), twist=12, rel=True)),
]
TONE_GROUP = {'spine0': 'spine', 'spine1': 'spine', 'neck': 'neck',
              'shoulderL': 'arm', 'shoulderR': 'arm', 'elbowL': 'arm', 'elbowR': 'arm',
              'hipL': 'leg', 'hipR': 'leg', 'kneeL': 'knee', 'kneeR': 'knee', 'ankleL': 'leg', 'ankleR': 'leg'}
HOLD_HZ = float(os.environ.get('DEATH_IMPACT_HOLD_HZ', 5.0))            # natural frequency of a joint spring at full tone (from its distal inertia)
HOLD_ZETA = float(os.environ.get('DEATH_IMPACT_HOLD_ZETA', 0.9))
PASSIVE_HZ = 0.55        # passive tissue: what is left when the muscles let go
PASSIVE_ZETA = 0.55
# seconds after the hit: (held until, soft by)
TONE_TIMES = {
    'normal':  {'knee': (.03, .18), 'leg': (.10, .45), 'spine': (.14, .66), 'neck': (.11, .54), 'arm': (.11, .60)},
    'quick':   {'knee': (.03, .14), 'leg': (.06, .30), 'spine': (.09, .42), 'neck': (.07, .34), 'arm': (.07, .38)},
    'instant': {'knee': (.0, .08), 'leg': (.0, .10), 'spine': (.0, .12), 'neck': (.0, .08), 'arm': (.0, .12)},
}


def Local(x, z):
    """Runtime actor-local horizontal (+X right hand, -Z front) as a Blender direction (forward -Y, left +X)."""
    return Vector((-x, z, 0)).normalized()


BACK, FORWARD = Local(0, 1), Local(0, -1)
LEFTFALL, RIGHTFALL = Local(-1, 0), Local(1, 0)
# hits: (body, horizontal direction, delta-v of that body in *game* m/s, upward bias)
# The numbers below come from a grid search per family (kick dv x whole-body shove x direction), scored on the
# measured fall direction against the family target, no inverted flight, and a pelvis half-drop time >= 0.55 s
# (docs/Data_DeathImpactClips.md, "tuning"). `shove` = delta-v every segment except the feet gets (game m/s).
CLIPS = {
    'DeathImpactBack1':    dict(family='back',    pose='aim',   tone='normal',  part='torso', shove=1.2, hits=[('chest', Local(.259, .966), 3.0, .10)]),
    'DeathImpactBack2':    dict(family='back',    pose='ready', tone='normal',  part='torso', shove=1.2, hits=[('chest', Local(.6, .8), 3.0, .10)]),
    'DeathImpactForward1': dict(family='forward', pose='aim',   tone='normal',  part='torso', shove=.6,  hits=[('chest', Local(-.342, -.94), 1.2, .0)]),
    'DeathImpactForward2': dict(family='forward', pose='ready', tone='normal',  part='torso', shove=.6,  hits=[('abdomen', Local(-.10, -.995), 1.2, .0)]),
    'DeathImpactLeft1':    dict(family='left',    pose='aim',   tone='normal',  part='torso', shove=.8,  hits=[('chest', LEFTFALL, 2.4, .05)]),
    'DeathImpactRight1':   dict(family='right',   pose='ready', tone='normal',  part='torso', shove=1.2, hits=[('chest', Local(.94, .342), 2.4, .05)]),
    'DeathImpactCrumple1': dict(family='crumple', pose='aim',   tone='instant', part='head',  shove=0.0, hits=[('head', BACK, 1.6, .0)]),
    # startS: the gut shot holds its standing tone ~0.5 s before the knees give (pelvis -5 cm at 0.4 s); the runtime
    # starts playback there so a lethal hit is not followed by a standing pause (docs/Data_DeathImpactClips.md §7).
    'DeathImpactCrumple2': dict(family='crumple', pose='ready', tone='normal',  part='torso', shove=0.0, startS=0.4,
                                hits=[('abdomen', FORWARD, 1.2, -.25), ('pelvis', BACK, 1.0, .0)]),
}

Clamp = lambda x, a=0.0, b=1.0: max(a, min(b, x))
Smooth = lambda x: Clamp(x) * Clamp(x) * (3 - 2 * Clamp(x))


def Bake(ctx):
    arm, names, meshes = ctx['arm'], ctx['names'], ctx['meshes']
    Bone, Put, Point, BWorld, Update = [ctx[k] for k in ['Bone', 'Put', 'Point', 'BWorld', 'Update']]
    factor = ctx['authoringFactor']
    unit = ctx['restTop'] / 1.66          # authoring metres per game metre
    scene = bpy.context.scene
    prefix = 'Bip001 '
    armInv = arm.matrix_world.inverted()
    print('DEATHIMPACT factor %.4f unit %.4f' % (factor, unit), flush=True)
    state = {'pose': {}, 'fits': {}}

    def SourceMatrix(flat):
        m = Matrix([flat[i::4] for i in range(4)])
        m.translation *= factor
        return convert @ m

    def Imported(pose):
        return {n: SourceMatrix(pose[n]) @ ctx['corrections'][n].inverted() for n in names}

    parentOf = {n: (arm.pose.bones[n].parent.name if arm.pose.bones[n].parent else None) for n in names}
    restArm = {n: arm.data.bones[n].matrix_local.copy() for n in names}
    order = {n: i for i, n in enumerate(names)}
    assert all(parentOf[n] is None or order[parentOf[n]] < order[n] for n in names), 'names must list parents first'

    def ApplyTargets(target):
        """Set every pose bone to target[name] (world matrices) with one depsgraph update."""
        targetArm = {n: armInv @ target[n] for n in names}
        for n in names:
            parent = parentOf[n]
            base = (targetArm[parent] @ restArm[parent].inverted() @ restArm[n]) if parent else restArm[n]
            arm.pose.bones[n].matrix_basis = base.inverted() @ targetArm[n]
        Update()

    # ------------------------------------------------------------------ start poses and capsule fits
    def PlantFeet():
        """AdvanceFire is a walking-advance clip: one foot is always in the air. A standing soldier has both soles
        on the ground, so the raised leg is solved down onto the floor (ankle at the grounded ankle's height,
        sole levelled like the grounded foot); hip, torso and arms are untouched."""
        heights = {}
        for side in ('L', 'R'):
            heights[side] = min(Point(Bone(side + ' Foot')).z, Point(Bone(side + ' Toe0')).z)
        grounded = 'L' if heights['L'] <= heights['R'] else 'R'
        raised = 'R' if grounded == 'L' else 'L'
        if heights[raised] - heights[grounded] < .02:
            return
        gAnkle, gToe = Point(Bone(grounded + ' Foot')), Point(Bone(grounded + ' Toe0'))
        gVec = gToe - gAnkle
        rAnkle = Point(Bone(raised + ' Foot'))
        target = Vector((rAnkle.x, rAnkle.y, gAnkle.z))
        pole = Point(Bone(raised + ' Thigh')) + Vector((0, -1, 0))
        ctx['Chain'](Bone(raised + ' Thigh'), Bone(raised + ' Calf'), Bone(raised + ' Foot'), target, pole)
        Update()
        foot = Bone(raised + ' Foot')
        at = Point(foot)
        tv = Point(Bone(raised + ' Toe0')) - at
        yaw = math.atan2(tv.y, tv.x) - math.atan2(gVec.y, gVec.x)
        want = Quaternion((0, 0, 1), yaw) @ gVec
        delta = tv.rotation_difference(want)
        Put(foot, Matrix.Translation(at) @ delta.to_matrix().to_4x4() @ Matrix.Translation(-at) @ BWorld(foot))
        print('PLANT raised %s foot to ankle z %.3f (was %.3f)' % (raised, gAnkle.z, rAnkle.z), flush=True)

    def StandUpright(maxTiltDeg):
        """The shouldered-rifle frames lean the trunk 30-45 degrees forward (a walking-advance pose), which no
        standing body can hold: it topples forward whatever hit it. Pitch the whole upper body (spine subtree,
        arms and head with it) back about the lumbar joint until the trunk leans at most `maxTiltDeg`."""
        spine = Bone('Spine')
        pivot = Point(spine)
        axis = Point(Bone('Neck')) - pivot
        tilt = math.degrees(math.atan2(-axis.y, axis.z))          # + = leaning forward (-Y)
        if tilt <= maxTiltDeg:
            return
        angle = math.radians(tilt - maxTiltDeg)
        lat = Point(Bone('L Thigh')) - Point(Bone('R Thigh'))
        lat = Vector((lat.x, lat.y, 0)).normalized()
        rot = Quaternion(lat, -angle).to_matrix().to_4x4()
        Put(spine, Matrix.Translation(pivot) @ rot @ Matrix.Translation(-pivot) @ BWorld(spine))
        print('UPRIGHT trunk tilt %.1f -> %.1f deg' % (tilt, maxTiltDeg), flush=True)

    def PoseStart(poseId):
        frame = Imported(source['poses'][poseId]['world'])
        ApplyTargets(frame)
        PlantFeet()
        StandUpright(UPRIGHT_TILT_DEG)
        planted = {n: BWorld(arm.pose.bones[n]).copy() for n in names}
        floor, _ = ctx['LowestVertex']()
        lift = Matrix.Translation((0, 0, FLOOR_CLEARANCE * factor - floor))
        ApplyTargets({n: (planted[n] if n == 'GroundRoot' else lift @ planted[n]) for n in names})
        return {n: BWorld(arm.pose.bones[n]).copy() for n in names}

    def SkinVertices():
        dg = bpy.context.evaluated_depsgraph_get()
        out = []
        for o in meshes:
            ev = o.evaluated_get(dg)
            geometry = ev.to_mesh()
            matrix = ev.matrix_world
            groups = {g.index: g.name for g in o.vertex_groups}
            for v, orig in zip(geometry.vertices, o.data.vertices):
                w = {}
                for g in orig.groups:
                    w[groups[g.group]] = w.get(groups[g.group], 0) + g.weight
                out.append((matrix @ v.co, w))
            ev.to_mesh_clear()
        return out

    def Role(groupName):
        return groupName[len(prefix):] if groupName.startswith(prefix) else groupName

    def GroupWeight(w, groups):
        total = 0.0
        for name, value in w.items():
            role = Role(name)
            if any(role == g or (g.endswith('Finger') and role.startswith(g)) for g in groups):
                total += value
        return total

    def Fit(W0):
        skin = SkinVertices()
        # dominant "group segment" of every vertex (limbs, head, feet)
        groupSegs = [(s[0], s[4]) for s in SEGMENTS if s[3] == 'group']
        verts = {s[0]: [] for s in SEGMENTS}
        torso = []
        for p, w in skin:
            if not w:
                continue
            scores = [(GroupWeight(w, g), sid) for sid, g in groupSegs]
            best = max(scores)
            if best[0] >= .5:
                verts[best[1]].append(p)
            elif GroupWeight(w, TORSO_GROUPS) >= .5:
                torso.append(p)
        # thighs also own the hips: torso slab candidates include thigh-dominant vertices near the top
        thighTop = [p for sid in ('thighL', 'thighR') for p in verts[sid] if p.z > W0[prefix + 'L Thigh'].translation.z - .12]
        fits = {}
        q = lambda arr, f: arr[min(len(arr) - 1, int(f * len(arr)))]
        chestAxis = None
        for sid, aFrom, aTo, mode, spec, frac, pct in SEGMENTS:
            p0 = W0[prefix + aFrom].translation.copy()
            if mode == 'slab':
                pB = W0[prefix + aTo].translation
                d = (pB - p0).normalized()
                span = (pB - p0).length
                t0 = spec[0]
                t1 = spec[1] if spec[1] is not None else span + spec[2]
                pool = torso + (thighTop if sid == 'pelvis' else [])
                pts = [p for p in pool if t0 <= (p - p0).dot(d) <= t1 and (((p - p0) - d * (p - p0).dot(d)).length < .30)]
                lo, hi = t0, t1
            else:
                pts = verts[sid]
                if aTo == 'verts':
                    d = (sum(pts, Vector()) / len(pts) - p0).normalized()
                elif aTo == 'up':
                    d = (Vector((0, 0, 1)) + fits['chest']['axis']).normalized()
                elif aTo == 'sole':
                    toe = W0[prefix + aFrom.replace('Foot', 'Toe0')].translation - W0[prefix + aFrom].translation
                    hd = Vector((toe.x, toe.y, 0)).normalized()
                    # sole pitch: line through the lowest skin point of each slice along the foot (heel-up stance keeps its pitch)
                    import numpy as np
                    hs = [(p - p0).dot(hd) for p in pts]
                    lo_h, hi_h = min(hs), max(hs)
                    bins = {}
                    for p, h in zip(pts, hs):
                        k = min(7, int(8 * (h - lo_h) / max(1e-6, hi_h - lo_h)))
                        bins[k] = min(bins.get(k, (9e9, 0))[0], p.z), h
                    low = {}
                    for p, h in zip(pts, hs):
                        k = min(7, int(8 * (h - lo_h) / max(1e-6, hi_h - lo_h)))
                        if k not in low or p.z < low[k][1]:
                            low[k] = (h, p.z)
                    slope = float(np.polyfit([v[0] for v in low.values()], [v[1] for v in low.values()], 1)[0])
                    slope = max(-.8, min(.8, slope))
                    d = (hd + Vector((0, 0, slope))).normalized()
                else:
                    d = (W0[prefix + aTo].translation - p0).normalized()
                lo = hi = None
            assert len(pts) > 8, (sid, len(pts))
            perps = [((p - p0) - d * (p - p0).dot(d)) for p in pts]
            perp = sum(perps, Vector()) / len(pts)
            ts = sorted((p - p0).dot(d) for p in pts)
            rho = sorted((v - perp).length for v in perps)          # distance from the fitted centre line
            if lo is None:
                lo, hi = q(ts, .01), q(ts, .99)
            if aTo == 'sole':
                # flat-soled box: X across, Y up, Z along the foot
                up = Vector((0, 0, 1))
                yb = (up - d * up.dot(d)).normalized()
                xb = yb.cross(d).normalized()
                ext = lambda axis: (q(sorted((p - p0).dot(axis) for p in pts), .01), q(sorted((p - p0).dot(axis) for p in pts), .99))
                ex, ey, ez = ext(xb), ext(yb), ext(d)
                centre = p0 + xb * (ex[0] + ex[1]) / 2 + yb * (ey[0] + ey[1]) / 2 + d * (ez[0] + ez[1]) / 2
                dims = (ex[1] - ex[0], ey[1] - ey[0], ez[1] - ez[0])
                fits[sid] = dict(center=centre, axis=d, radius=.5 * max(dims[0], dims[1]), length=dims[2], mass=MASS_KG * frac,
                                 count=len(pts), shape='box', dims=dims, frame=Matrix((xb, yb, d)).transposed())
                print('FIT %-8s n=%4d BOX %s centre=%s axis=%s' % (sid, len(pts), [round(v, 3) for v in dims],
                                                                   [round(v, 3) for v in centre], [round(v, 2) for v in d]), flush=True)
                continue
            radius = q(rho, pct) * SHRINK.get(sid, 1.0)
            length = max(hi - lo, 2 * radius + .01)
            centre = p0 + d * (lo + hi) / 2 + perp
            fits[sid] = dict(center=centre, axis=d, radius=radius, length=length, mass=MASS_KG * frac, count=len(pts), shape='capsule',
                             axisLocal=Vector((0, 0, 1)))
            print('FIT %-8s n=%4d r=%.3f L=%.3f centre=%s axis=%s' % (
                sid, len(pts), radius, length, [round(v, 3) for v in centre], [round(v, 2) for v in d]), flush=True)
        # bodies must not start below the floor
        for sid, f in fits.items():
            if f['shape'] == 'box':
                low = min((f['center'] + f['frame'] @ Vector((sx * f['dims'][0] / 2, sy * f['dims'][1] / 2, sz * f['dims'][2] / 2))).z
                          for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1))
            else:
                half = max(0.0, f['length'] / 2 - f['radius'])
                low = min((f['center'] + f['axis'] * half).z, (f['center'] - f['axis'] * half).z) - f['radius']
            if low < -.004:
                print('WARNING body %s starts %.3f below the floor' % (sid, -low), flush=True)
        return fits

    def StartFor(poseId):
        if poseId not in state['pose']:
            state['pose'][poseId] = PoseStart(poseId)
            state['fits'][poseId] = Fit(state['pose'][poseId])
        else:
            ApplyTargets(state['pose'][poseId])
        return state['pose'][poseId], state['fits'][poseId]

    # ------------------------------------------------------------------ ragdoll
    def ClearRagdoll():
        if scene.rigidbody_world is not None:
            Op(bpy.ops.rigidbody.world_remove)
        for o in list(bpy.data.objects):
            if o.name.startswith(('RB_', 'J_', 'F_', 'GROUND')):
                bpy.data.objects.remove(o)
        for m in list(bpy.data.meshes):
            if m.users == 0:
                bpy.data.meshes.remove(m)
        for c in list(bpy.data.collections):
            if c.name.startswith('RigidBody'):
                bpy.data.collections.remove(c)
        for a in list(bpy.data.actions):
            if a.users == 0 and not a.use_fake_user:
                bpy.data.actions.remove(a)

    def CapsuleMesh(name, radius, length):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=10, radius=radius)
        half = max(0.0, length / 2 - radius)
        for v in bm.verts:
            v.co.z += half if v.co.z >= 0 else -half
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        return me

    def Select(o):
        bpy.context.view_layer.objects.active = o
        for other in bpy.context.view_layer.objects:
            other.select_set(other is o)

    def BuildRagdoll(fits):
        ClearRagdoll()
        Op(bpy.ops.rigidbody.world_add)
        rbw = scene.rigidbody_world
        rbw.substeps_per_frame = SUBSTEPS
        rbw.solver_iterations = ITERATIONS
        rbw.use_split_impulse = True
        scene.render.fps = SIM_FPS
        scene.render.fps_base = 1
        scene.gravity = (0, 0, 0 if 'nogravity' in DIAG else -GRAVITY * unit)
        scene.use_gravity = True
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1)
        for v in bm.verts:
            v.co = Vector((v.co.x * 40, v.co.y * 40, v.co.z))
        gm = bpy.data.meshes.new('GROUNDMesh')
        bm.to_mesh(gm)
        bm.free()
        ground = bpy.data.objects.new('GROUND', gm)
        scene.collection.objects.link(ground)
        ground.location = (0, 0, -.5)      # a body is centred on the object origin, top face at z = 0
        Select(ground)
        Op(bpy.ops.rigidbody.object_add, type='PASSIVE')
        g = ground.rigid_body
        g.collision_shape = 'BOX'
        g.friction = .9
        g.restitution = .05
        g.use_margin = True
        g.collision_margin = 0.0
        g.collision_collections = [True] * 20
        ground.hide_render = True
        bodies = {}
        for layer, (sid, fit) in enumerate(fits.items()):
            if fit['shape'] == 'box':
                bmx = bmesh.new()
                bmesh.ops.create_cube(bmx, size=1)
                for v in bmx.verts:
                    v.co = Vector((v.co.x * fit['dims'][0], v.co.y * fit['dims'][1], v.co.z * fit['dims'][2]))
                mesh = bpy.data.meshes.new('RB_' + sid)
                bmx.to_mesh(mesh)
                bmx.free()
                world = Matrix.Translation(fit['center']) @ fit['frame'].to_4x4()
            else:
                mesh = CapsuleMesh('RB_' + sid, fit['radius'], fit['length'])
                world = Matrix.Translation(fit['center']) @ Vector((0, 0, 1)).rotation_difference(fit['axis']).to_matrix().to_4x4()
            o = bpy.data.objects.new('RB_' + sid, mesh)
            scene.collection.objects.link(o)
            o.matrix_world = world
            Select(o)
            Op(bpy.ops.rigidbody.object_add, type='ACTIVE')
            rb = o.rigid_body
            rb.collision_shape = 'BOX' if fit['shape'] == 'box' else 'CAPSULE'
            rb.mass = fit['mass'] * (8 if ('heavyfeet' in DIAG and sid.startswith(('foot', 'calf'))) else 1)
            rb.friction = .9
            rb.restitution = .05
            rb.linear_damping = .03
            rb.angular_damping = .12
            rb.use_deactivation = False
            rb.collision_collections = [i == layer for i in range(20)]   # ground only, no self collision
            o.display_type = 'WIRE'
            o.hide_render = True
            bodies[sid] = o
        return bodies

    def Subtree(bodyId):
        out = [bodyId]
        for j in JOINTS:
            if j[1] == bodyId:
                out += Subtree(j[2])
        return out

    def JointFrame(j, W0, fits):
        name, parent, child, boneName, kind, neutral, flexDir, rng = j
        pos = W0[prefix + boneName].translation.copy()
        up = Vector((0, 0, 1))
        lat = W0[prefix + 'L Thigh'].translation - W0[prefix + 'R Thigh'].translation
        lat = (lat - up * lat.dot(up)).normalized()             # character's left
        fwd = lat.cross(up).normalized()                        # character's front
        side = 1.0 if (pos.x - W0[prefix + 'Pelvis'].translation.x) >= 0 else -1.0
        if name.startswith(('spine', 'neck')):
            side = 1.0
        out = lat * side
        c = fits[child]['axis']
        ap = fits[parent]['axis']
        if kind == 'hinge':
            a = ap if ap.dot(c) >= 0 else -ap
            bend = c - a * c.dot(a)
            phi0 = math.atan2(bend.length, c.dot(a))
            if phi0 > math.radians(7):
                m = bend.normalized()
            else:
                m = fwd if neutral == 'fwd' else -fwd
                m = (m - a * m.dot(a)).normalized()
            xAxis = a.cross(m).normalized()
            yAxis = a
            zAxis = xAxis.cross(yAxis).normalized()
            lims = dict(x=(-phi0 - math.radians(1.5), math.radians(rng['flex'][1]) - phi0),
                        y=(-math.radians(rng['twist']), math.radians(rng['twist'])),
                        z=(-math.radians(rng['abd']), math.radians(rng['abd'])))
            start = dict(bendDeg=math.degrees(phi0))
        else:
            n = {'down': -up, 'parentAxis': ap if ap.dot(up) >= 0 else -ap, 'fwd': fwd}[neutral]
            if neutral == 'parentAxis' and name.startswith('ankle'):
                n = ap
            f = fwd if flexDir == 'fwd' else up
            f = (f - n * f.dot(n)).normalized()
            o = (out - n * out.dot(n) - f * out.dot(f)).normalized()
            xAxis = n.cross(f).normalized()
            zAxis = n.cross(o).normalized()
            yAxis = zAxis.cross(xAxis).normalized()
            aFlex = math.atan2(c.dot(f), c.dot(n))
            aAbd = math.atan2(c.dot(o), c.dot(n))
            if rng.get('rel'):          # ranges are already relative to the start pose (ankle: the stance is toed out)
                aFlex = aAbd = 0.0
            lims = dict(x=(math.radians(rng['flex'][0]) - aFlex, math.radians(rng['flex'][1]) - aFlex),
                        y=(-math.radians(rng['twist']), math.radians(rng['twist'])),
                        z=(math.radians(rng['abd'][0]) - aAbd, math.radians(rng['abd'][1]) - aAbd))
            start = dict(flexDeg=math.degrees(aFlex), abdDeg=math.degrees(aAbd))
        m3 = Matrix((xAxis, yAxis, zAxis)).transposed()
        assert m3.determinant() > .9, (name, m3.determinant())
        for ax in 'xyz':
            lo, hi = lims[ax]
            if not lo < 0 < hi:
                print('WARNING joint %s axis %s: the start pose (0) is outside its limits (%.1f, %.1f) deg, widened' % (
                    name, ax, math.degrees(lo), math.degrees(hi)), flush=True)
                lims[ax] = (min(lo, -.03), max(hi, .03))
        return dict(name=name, pos=pos, matrix=Matrix.Translation(pos) @ m3.to_4x4(), lims=lims, start=start)

    def BuildJoints(bodies, frames):
        joints = {}
        for j in JOINTS:
            info = frames[j[0]]
            e = bpy.data.objects.new('J_' + j[0], None)
            e.empty_display_type = 'ARROWS'
            e.empty_display_size = .05
            scene.collection.objects.link(e)
            e.matrix_world = info['matrix']
            Select(e)
            Op(bpy.ops.rigidbody.constraint_add, type='GENERIC_SPRING')
            c = e.rigid_body_constraint
            c.object1 = bodies[j[1]]
            c.object2 = bodies[j[2]]
            c.disable_collisions = True
            c.spring_type = 'SPRING2'
            for ax in 'xyz':
                setattr(c, 'use_limit_lin_' + ax, True)
                setattr(c, 'limit_lin_' + ax + '_lower', 0)
                setattr(c, 'limit_lin_' + ax + '_upper', 0)
                lo, hi = info['lims'][ax]
                if 'lockankles' in DIAG and j[0].startswith('ankle'):
                    lo = hi = 0.0
                setattr(c, 'use_limit_ang_' + ax, 'nolimit' not in DIAG)
                setattr(c, 'limit_ang_' + ax + '_lower', lo)
                setattr(c, 'limit_ang_' + ax + '_upper', hi)
                setattr(c, 'use_spring_ang_' + ax, 'nospring' not in DIAG)
            e.hide_render = True
            joints[j[0]] = e
        return joints

    def JointInertia(jointName, frames, fits):
        """(own, carried): the inertia of what hangs below/beyond the joint (kg m^2, authoring metres), and for the
        leg joints what the muscles have to carry (everything above the joint, about the joint). The muscles
        need `carried` while they hold; the passive tissue left afterwards is only as stiff as `own`."""
        j = next(x for x in JOINTS if x[0] == jointName)
        pos = frames[jointName]['pos']
        below = Subtree(j[2])
        own = 0.0
        for sid in below:
            fit = fits[sid]
            own += fit['mass'] * ((fit['center'] - pos).length_squared + .25 * fit['radius'] ** 2)
        carried = own
        if TONE_GROUP[jointName] in ('leg', 'knee'):
            above = [sid for sid in fits if sid not in below]
            m = sum(fits[sid]['mass'] for sid in above)
            com = sum((fits[sid]['center'] * fits[sid]['mass'] for sid in above), Vector()) / m
            carried = max(own, m * (com - pos).length_squared)
        return own, carried

    def ToneKeys(joints, frames, fits, spec):
        pref = bpy.context.preferences.edit
        oldInterp = pref.keyframe_new_interpolation_type
        pref.keyframe_new_interpolation_type = 'LINEAR'
        times = TONE_TIMES[os.environ.get('DEATH_IMPACT_TONESET') or spec['tone']]
        if os.environ.get('DEATH_IMPACT_LEG'):
            times = dict(times, knee=tuple(float(v) for v in os.environ['DEATH_IMPACT_LEG'].split(',')))
        hitT = (HIT_FRAME - 1) / SIM_FPS
        w0, wp = 2 * math.pi * HOLD_HZ, 2 * math.pi * PASSIVE_HZ
        for jn, e in joints.items():
            own, carried = JointInertia(jn, frames, fits)
            k0, c0 = carried * w0 * w0, 2 * HOLD_ZETA * carried * w0
            kp, cp = own * wp * wp, 2 * PASSIVE_ZETA * own * wp
            hold, soft = (900., 901.) if 'hold' in DIAG else tuple(v * TONE_SCALE for v in times[TONE_GROUP[jn]])
            c = e.rigid_body_constraint
            keys = sorted(set([1, HIT_FRAME] + [HIT_FRAME + int(round((hold + (soft - hold) * i / 12) * SIM_FPS)) for i in range(13)]))
            for fr in keys:
                t = (fr - 1) / SIM_FPS - hitT
                w = Smooth((t - hold) / max(1e-6, soft - hold)) if t > 0 else 0.0
                for ax in 'xyz':
                    twist = .5 if ax == 'y' else 1.0
                    setattr(c, 'spring_stiffness_ang_' + ax, (k0 + (kp - k0) * w) * twist)
                    setattr(c, 'spring_damping_ang_' + ax, (c0 + (cp - c0) * w) * twist)
                    c.keyframe_insert('spring_stiffness_ang_' + ax, frame=fr)
                    c.keyframe_insert('spring_damping_ang_' + ax, frame=fr)
        pref.keyframe_new_interpolation_type = oldInterp

    def AddHit(bodyId, direction, dvGame, upBias, bodies, fits, index):
        d = (Quaternion((0, 0, 1), math.radians(DIR_ROT)) @ Vector(direction) + Vector((0, 0, upBias))).normalized()
        J = fits[bodyId]['mass'] * dvGame * unit           # authoring N s
        strength = J * SIM_FPS * SIM_FPS                   # one frame
        f = bpy.data.objects.new('F_%d' % index, None)
        scene.collection.objects.link(f)
        f.location = bodies[bodyId].matrix_world.translation
        f.rotation_mode = 'QUATERNION'
        f.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d)
        Select(f)
        Op(bpy.ops.object.forcefield_toggle)
        f.field.type = 'WIND'
        f.field.use_max_distance = True
        near = min((fits[bodyId]['center'] - fits[o]['center']).length for o in fits if o != bodyId)
        f.field.distance_max = min(.09, .5 * near)
        f.field.strength = 0
        for fr, v in [(1, 0), (HIT_FRAME, strength), (HIT_FRAME + 1, 0)]:
            f.field.strength = v
            f.keyframe_insert('field.strength', frame=fr)
        for bag in f.animation_data.action.layers[0].strips[0].channelbags:
            for fc in bag.fcurves:
                for kp in fc.keyframe_points:
                    kp.interpolation = 'CONSTANT'
        f.hide_render = True

    def Simulate(clipId, spec, W0, fits):
        frames = {j[0]: JointFrame(j, W0, fits) for j in JOINTS}
        for jn, info in frames.items():
            print('JOINT %-9s start %s lims(deg) x=%s y=%s z=%s' % (
                jn, {k: round(v, 1) for k, v in info['start'].items()},
                [round(math.degrees(v), 1) for v in info['lims']['x']],
                [round(math.degrees(v), 1) for v in info['lims']['y']],
                [round(math.degrees(v), 1) for v in info['lims']['z']]), flush=True)
        bodies = BuildRagdoll(fits)
        # lying bodies do not creep: damping ramps up once the fall is over (animatable rigid body property)
        pref = bpy.context.preferences.edit
        oldInterp = pref.keyframe_new_interpolation_type
        pref.keyframe_new_interpolation_type = 'LINEAR'
        for o in bodies.values():
            for fr, lin, ang in ((1, .03, .12), (int(.7 * SIM_FPS), .03, .12), (int(1.5 * SIM_FPS), .30, .60)):
                o.rigid_body.linear_damping = lin
                o.rigid_body.angular_damping = ang
                o.keyframe_insert('rigid_body.linear_damping', frame=fr)
                o.keyframe_insert('rigid_body.angular_damping', frame=fr)
        pref.keyframe_new_interpolation_type = oldInterp
        joints = {} if 'nojoints' in DIAG else BuildJoints(bodies, frames)
        ToneKeys(joints, frames, fits, spec)
        for i, hit in enumerate([] if os.environ.get('DEATH_IMPACT_NOHIT') == '1' else spec['hits']):
            AddHit(hit[0], hit[1], hit[2] * DV_SCALE, hit[3], bodies, fits, i)
        # momentum of the blow is shared by the whole body (tissue transmits it): every segment except the feet gets
        # the same delta-v along the struck direction, on top of the local kick of the struck segment
        shove = float(os.environ.get('DEATH_IMPACT_SHOVE') or spec.get('shove', 0.0))
        if shove > 0 and 'nohit' not in DIAG:
            for i, sid in enumerate(s for s in fits if not s.startswith('foot')):
                AddHit(sid, spec['hits'][0][1], shove, spec['hits'][0][3] * .5, bodies, fits, 100 + i)
        total = int(spec.get('seconds', 4.2) * SIM_FPS)
        scene.frame_start = 1
        scene.frame_end = total
        rbw = scene.rigidbody_world
        rbw.point_cache.frame_start = 1
        rbw.point_cache.frame_end = total
        scene.frame_set(1)
        rec = []
        started = time.time()
        for fr in range(1, total + 1):
            scene.frame_set(fr)
            rec.append({sid: o.matrix_world.copy() for sid, o in bodies.items()})
            if DEBUG and (fr - 1) % 6 == 0:
                print('  t=%.2f chest %s pelvis %s head %s' % ((fr - 1) / SIM_FPS, [round(v, 3) for v in rec[-1]['chest'].translation],
                      [round(v, 3) for v in rec[-1]['pelvis'].translation], [round(v, 3) for v in rec[-1]['head'].translation]), flush=True)
        if DEBUG:
            for fr in (int(.3 * SIM_FPS), int(.6 * SIM_FPS)):
                row = []
                for j in JOINTS:
                    r0 = rec[0][j[1]].inverted() @ rec[0][j[2]]
                    r1 = rec[fr][j[1]].inverted() @ rec[fr][j[2]]
                    row.append('%s %.0f' % (j[0], math.degrees((r1.to_quaternion() @ r0.to_quaternion().inverted()).angle)))
                for sid in ('footL', 'footR'):
                    f = fits[sid]
                    lows = [(rec[fr][sid] @ Vector((sx * f['dims'][0] / 2, sy * f['dims'][1] / 2, sz * f['dims'][2] / 2))).z for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
                    lows0 = [(rec[0][sid] @ Vector((sx * f['dims'][0] / 2, sy * f['dims'][1] / 2, sz * f['dims'][2] / 2))).z for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
                    print('  FOOT %s t=%.2f lowest corner %.3f (start %.3f)' % (sid, fr / SIM_FPS, min(lows), min(lows0)), flush=True)
                print('  BODYMOVE t=%.2f %s' % (fr / SIM_FPS, ', '.join('%s (%.0f,%.0f,%.0f)mm rot%.0f' % (sid, *[1000 * v for v in (rec[fr][sid].translation - rec[0][sid].translation)], math.degrees((rec[fr][sid].to_quaternion() @ rec[0][sid].to_quaternion().inverted()).angle)) for sid in rec[0])), flush=True)
                print('  JOINTDRIFT t=%.2f %s' % (fr / SIM_FPS, ', '.join(row)), flush=True)
        print('SIM %s %d frames in %.1fs' % (clipId, total, time.time() - started), flush=True)
        return rec

    # ------------------------------------------------------------------ bones from bodies
    def BoneTargets(W0, B0, Bf):
        delta = {sid: Bf[sid] @ B0[sid].inverted() for sid in Bf}
        target = {}
        for n in names:
            role = n[len(prefix):] if n.startswith(prefix) else n
            entry = BONE_BODY.get(role)
            if entry is None:
                parent = parentOf[n]
                target[n] = W0[n] if parent is None else target[parent] @ W0[parent].inverted() @ W0[n]
            elif len(entry) == 1:
                target[n] = delta[entry[0]] @ W0[n]
            else:
                a, b, w = entry
                q = delta[a].to_quaternion().slerp(delta[b].to_quaternion(), w)
                p = (delta[a] @ W0[n].translation).lerp(delta[b] @ W0[n].translation, w)
                m = q.to_matrix().to_4x4() @ W0[n].to_3x3().to_4x4()
                m.translation = p
                target[n] = m
        return target

    def Lifted(target, dz):
        if abs(dz) < 1e-9:
            return target
        t = Matrix.Translation((0, 0, dz))
        return {n: (m if n == 'GroundRoot' else t @ m) for n, m in target.items()}

    # ------------------------------------------------------------------ extract
    def Speeds(rec):
        out = []
        for i in range(len(rec)):
            j = max(0, i - 2)
            v = 0.0
            for sid in rec[i]:
                v = max(v, (rec[i][sid].translation - rec[j][sid].translation).length / max(1e-6, (i - j) / SIM_FPS))
                # angular: tip of a unit vector along local z
                za, zb = rec[i][sid].to_3x3() @ Vector((0, 0, 1)), rec[j][sid].to_3x3() @ Vector((0, 0, 1))
                v = max(v, .25 * (za - zb).length / max(1e-6, (i - j) / SIM_FPS))
            out.append(v)
        return out

    def Extract(clipId, spec, W0, B0, rec, fits_now):
        speeds = Speeds(rec)
        settle = 0
        for i, v in enumerate(speeds):
            if v > .08 * unit and i > HIT_FRAME:
                settle = i
        if settle >= len(rec) - 8:
            # a slow creep along the floor (< 0.3 m/s) is not part of the fall: settle where the body is that slow
            print('NOTE %s creeps slowly at the end of the simulation, settle threshold raised' % clipId, flush=True)
            settle = 0
            for i, v in enumerate(speeds):
                if v > .3 * unit and i > HIT_FRAME:
                    settle = i
        settleS = (settle + 1) / SIM_FPS
        duration = min(len(rec) / SIM_FPS, settleS + .15)
        count = max(2, int(math.ceil(duration * OUT_FPS)))
        duration = count / OUT_FPS
        idx = [min(len(rec) - 1, int(round(k / OUT_FPS * SIM_FPS))) for k in range(count + 1)]
        # pass 1: raw skin floor per output frame
        raw = []
        targets = []
        for k in range(count + 1):
            tg = BoneTargets(W0, B0, rec[idx[k]])
            targets.append(tg)
            ApplyTargets(tg)
            raw.append(ctx['LowestVertex']()[0])
        lift = [max(0.0, .002 * factor - f) for f in raw]
        for _ in range(3):
            lift = [max(lift[i], .25 * lift[max(0, i - 1)] + .5 * lift[i] + .25 * lift[min(count, i + 1)]) for i in range(count + 1)]
        end = raw[-1] + lift[-1]
        final = FLOOR_CLEARANCE * factor - end
        # pass 2: apply, ease the last frames to the 4 mm floor, sample
        blendStart = max(.35 * duration, duration - .6)
        samples, floors, applied = [], [], []
        for k in range(count + 1):
            t = k / OUT_FPS
            dz = lift[k] + final * Smooth((t - blendStart) / max(1e-6, duration - blendStart))
            tg = Lifted(targets[k], dz)
            applied.append(tg)
            ApplyTargets(tg)
            floors.append(ctx['LowestVertex']()[0])
            samples.append(ctx['SourcePose']())
        # tracks
        tracks = []
        times = [round(k / OUT_FPS, 6) for k in range(count + 1)]
        constant = 0
        for i, n in enumerate(names):
            for prop, offset, width, kind in [('position', 0, 3, 'vector'), ('quaternion', 3, 4, 'quaternion')]:
                rows = [s[i * 7 + offset:i * 7 + offset + width] for s in samples]
                if kind == 'quaternion':
                    for r in range(1, len(rows)):
                        if sum(a * b for a, b in zip(rows[r - 1], rows[r])) < 0:
                            rows[r] = [-v for v in rows[r]]
                dev = max(max(abs(rows[r][c] - rows[0][c]) for c in range(width)) for r in range(len(rows)))
                if dev < 2e-5:
                    constant += 1
                    tracks.append({'name': n.replace(' ', '_') + '.' + prop, 'type': kind, 'times': [0, times[-1]],
                                   'values': [round(v, 6) for v in rows[0]] * 2})
                else:
                    tracks.append({'name': n.replace(' ', '_') + '.' + prop, 'type': kind, 'times': times,
                                   'values': [round(v, 5) for row in rows for v in row]})
        clip = {'name': clipId, 'uuid': clipId, 'duration': times[-1], 'tracks': tracks, 'blendMode': 2500}
        # ---- profile, measured on the final applied pose (authoring metres -> game metres)
        def Actor(v, ref):
            return [-(v.x - ref.x) / unit, (v.z - ref.z) / unit, (v.y - ref.y) / unit]   # actor local x, y(up), z
        start0 = applied[0]
        startRoot = start0[prefix + 'Pelvis'].translation
        endT = applied[-1]
        pelvisEnd = Actor(endT[prefix + 'Pelvis'].translation, startRoot)
        pelvisEnd[1] = endT[prefix + 'Pelvis'].translation.z / unit
        headEnd = Actor(endT[prefix + 'Head'].translation, startRoot)
        headEnd[1] = endT[prefix + 'Head'].translation.z / unit
        fall = Vector((headEnd[0], headEnd[2]))
        fallLen = fall.length
        fall = fall.normalized() if fallLen > 1e-6 else Vector((0, 0))
        tilts = []
        for k in range(len(rec)):
            v = rec[k]['chest'].to_3x3() @ fits_now['chest']['axisLocal']
            tilts.append(math.degrees(math.atan2(-v.y, v.z)))
        z0 = rec[0]['pelvis'].translation.z
        rise = max(r['pelvis'].translation.z - z0 for r in rec) / unit
        inverted = sum(1 for r in rec if r['head'].translation.z < r['pelvis'].translation.z - .1 * unit and r['pelvis'].translation.z > .4 * unit) / SIM_FPS
        half = next((i / SIM_FPS for i, r in enumerate(rec) if r['pelvis'].translation.z < .5 * z0), None)
        hit = spec['hits'][0]
        dirL = Vector(hit[1])
        profile = {
            'family': spec['family'],
            'fallLocal': [round(fall.x, 4), round(fall.y, 4)],
            'fallDistanceM': round(fallLen, 3),
            'pelvisEndLocal': [round(v, 4) for v in pelvisEnd],
            'headEndLocal': [round(v, 4) for v in headEnd],
            'pelvisDropM': round((startRoot.z - endT[prefix + 'Pelvis'].translation.z) / unit, 3),
            'durationS': round(times[-1], 4),
            'playbackRate': 1,
            'settleS': round(min(times[-1], settleS), 3),
            'floorM': round(floors[-1] / factor, 4),
            'floorRangeM': [round(min(floors) / factor, 4), round(max(floors) / factor, 4)],
            'impact': {'part': spec['part'], 'dirLocal': [round(-dirL.x, 3), round(hit[3], 3), round(dirL.y, 3)],
                       'bodies': [h[0] for h in spec['hits']], 'deltaVMps': [h[2] for h in spec['hits']]},
            'trunkTiltDeg': [round(min(tilts), 1), round(max(tilts), 1)],
            'pelvisRiseM': round(rise, 3),
            'halfDropS': None if half is None else round(half, 2),
            'invertedS': round(inverted, 2),
            'source': 'ragdoll-sim',
            'startPose': spec['pose'],
        }
        if spec.get('startS'): profile['startS'] = spec['startS']
        print('PROFILE %s %s constantTracks=%d/%d lift=%.4f' % (clipId, json.dumps(profile), constant, len(tracks), max(lift)), flush=True)
        return clip, profile, applied, idx

    # ------------------------------------------------------------------ renders
    def SetupRender():
        if 'CAM_SIDE' in bpy.data.objects:
            return
        scene.render.engine = 'BLENDER_WORKBENCH'
        scene.render.resolution_x = 360
        scene.render.resolution_y = 360
        shading = scene.display.shading
        shading.light = 'STUDIO'
        shading.color_type = 'TEXTURE'
        shading.show_shadows = False
        scene.render.film_transparent = False
        world = bpy.data.worlds.new('W') if scene.world is None else scene.world
        scene.world = world
        world.color = (.62, .66, .70)
        bm = bmesh.new()
        bmesh.ops.create_grid(bm, x_segments=40, y_segments=40, size=10)
        me = bpy.data.meshes.new('VIZFloorMesh')
        bm.to_mesh(me)
        bm.free()
        floor = bpy.data.objects.new('VIZFloor', me)
        scene.collection.objects.link(floor)
        mat = bpy.data.materials.new('VIZFloor')
        mat.diffuse_color = (.36, .38, .34, 1)
        floor.data.materials.append(mat)
        for name in ('CAM_SIDE', 'CAM_FRONT'):
            cam = bpy.data.cameras.new(name)
            cam.type = 'ORTHO'
            o = bpy.data.objects.new(name, cam)
            scene.collection.objects.link(o)

    def Frame(cam, side, span, centre):
        cam.data.ortho_scale = span
        if side == 'side':      # look along -X from +X: forward (-Y) is on the left of the picture
            cam.location = (centre.x + 20, centre.y, centre.z)
            cam.rotation_euler = (math.radians(90), 0, math.radians(90))
        else:                   # look from the front (-Y) toward +Y
            cam.location = (centre.x, centre.y - 20, centre.z)
            cam.rotation_euler = (math.radians(90), 0, 0)

    def Render(clipId, applied, idx, duration):
        SetupRender()
        times = [0, .15, .3, .5, .75, 1.0, duration]
        allpts = [tg[prefix + 'Pelvis'].translation for tg in applied] + [tg[prefix + 'Head'].translation for tg in applied]
        lo = Vector((min(p.x for p in allpts), min(p.y for p in allpts), 0))
        hi = Vector((max(p.x for p in allpts), max(p.y for p in allpts), 1.9))
        centre = (lo + hi) / 2
        centre.z = .95
        span = max(2.3, hi.y - lo.y + 1.1, hi.x - lo.x + 1.1)
        folder = private / 'renders' / clipId
        folder.mkdir(parents=True, exist_ok=True)
        for old in folder.glob('*.png'):
            old.unlink()
        for view, camName in (('side', 'CAM_SIDE'), ('front', 'CAM_FRONT')):
            cam = bpy.data.objects[camName]
            Frame(cam, view, span, centre)
            scene.camera = cam
            for n, t in enumerate(times):
                k = min(len(applied) - 1, int(round(t * OUT_FPS)))
                ApplyTargets(applied[k])
                scene.render.filepath = str(folder / ('%s_%d_%03d.png' % (view, n, int(t * 1000))))
                Op(bpy.ops.render.render, write_still=True)

    def Scan():
        """Print, for every exported pose, how far the centre of mass sits from the middle of the support polygon."""
        for poseId in source['poses']:
            W0, fits = StartFor(poseId)
            mass = sum(f['mass'] for f in fits.values())
            com = sum((f['center'] * f['mass'] for f in fits.values()), Vector()) / mass
            feet = [fits['footL'], fits['footR']]
            pts = []
            for f in feet:
                for sx in (-1, 1):
                    for sz in (-1, 1):
                        pts.append(f['center'] + f['frame'] @ Vector((sx * f['dims'][0] / 2, 0, sz * f['dims'][2] / 2)))
            xs, ys = [p.x for p in pts], [p.y for p in pts]
            cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
            lowOf = lambda f: min((f['center'] + f['frame'] @ Vector((sx * f['dims'][0] / 2, sy * f['dims'][1] / 2, sz * f['dims'][2] / 2))).z
                                  for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1))
            print('SCAN %-5s footLow L=%.3f R=%.3f' % (poseId, lowOf(fits['footL']), lowOf(fits['footR'])), flush=True)
            print('SCAN %-5s com=(%.3f,%.3f,%.3f) support x[%.2f,%.2f] y[%.2f,%.2f] offset from centre (x %.3f, y %.3f) inside=%s' % (
                poseId, com.x, com.y, com.z, min(xs), max(xs), min(ys), max(ys), com.x - cx, com.y - cy,
                min(xs) < com.x < max(xs) and min(ys) < com.y < max(ys)), flush=True)

    if 'scan' in DIAG:
        Scan()
        return {}

    # ------------------------------------------------------------------ main
    results, profiles, clips = {}, {}, []
    started = time.time()
    for clipId, spec in CLIPS.items():
        if wanted and clipId not in wanted:
            continue
        W0, fits = StartFor(spec['pose'])
        rec = Simulate(clipId, spec, W0, fits)
        B0 = rec[0]
        clip, profile, applied, idx = Extract(clipId, spec, W0, B0, rec, fits)
        clips.append(clip)
        profiles[clipId] = profile
        if DO_RENDER:
            Render(clipId, applied, idx, clip['duration'])
        if DO_WRITE:
            # editable scene: rig posed at the last frame, capsules and joints where the simulation left them
            scene.frame_start, scene.frame_end = 1, len(rec)
            ApplyTargets(applied[-1])
            Op(bpy.ops.wm.save_as_mainfile, filepath=str(private / ('Scene_' + clipId + '.blend')))
    print('ALL DONE in %.1fs' % (time.time() - started), flush=True)
    if DO_WRITE:
        target = output / 'Animation_TengxianDeathImpact.json'
        existing = {'schema': 1, 'revision': REVISION, 'skeleton': 'TengxianHumanoidV1', 'clips': [], 'profiles': {}}
        if target.exists():
            existing = json.loads(target.read_text(encoding='utf-8'))
        byName = {c['name']: c for c in existing['clips']}
        for c in clips:
            byName[c['name']] = c
        existing['clips'] = list(byName.values())
        existing['profiles'].update(profiles)
        existing['revision'] = REVISION
        text = json.dumps(existing, separators=(',', ':'))
        target.write_text(text, encoding='utf-8')
        print(json.dumps({'file': str(target), 'bytes': len(text), 'sha256': hashlib.sha256(text.encode()).hexdigest()}))
    return profiles


helpers['Bake']('TengxianNra02', probe=Bake)
