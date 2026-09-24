"""Speaker gestures for first-level 03-06 on LugouNra02 and LugouNra05 (Data_FirstLevelSpeakerGestures).

Run headless, one process per rig (they are independent and bake in parallel):

    blender --background --factory-startup --python-exit-code 1 --python Taierzhuang1938/_import/Script_SpeakerGestureBake.py

or send the same file through `node scripts/Script_BlenderMcp.mjs exec --file` (same bpy path). Environment:

  GESTURE_PROJECT    absolute Taierzhuang1938 directory (required)
  GESTURE_MODEL      comma list of rigs (default LugouNra02,LugouNra05)
  GESTURE_CLIPS      comma list: bake only these clips and merge them into the rig's file
  GESTURE_PASS       'bake' (default) | 'probe' (print the rig measures, write nothing) |
                     'manifest' (rewrite the manifest from the rig files on disk, no Blender work)
  GESTURE_OUTPUT     default <project>/Animation/SpeakerGestures
  GESTURE_REVIEW     review stills folder (default <repo>/tmp/SpeakerGestures/BlenderReview; never committed)
  GESTURE_RENDER     '1' renders the review stills
  GESTURE_BLEND_DIR  when set, the editable scene (one action per clip) is saved there -- never in the repository

It reuses the production-rig importer, two-bone IK, palm turn and finger curl of
`_import/Script_MachineGunCaptivesBake.py` (the same route as the opening library's baker); meshes,
skins and inverse binds are never replaced, and the 01-02 opening scripts are not touched.

A gesture is an ARM clip, not a body clip. The runtime layer (docs/Data_CharacterSpeech.md, "Speaker
gestures (03-06)") overwrites one arm -- clavicle, upper arm, forearm, hand, fingers -- with the clip's
glTF node-local rotations and adds the clip's spine lean (Spine/Spine1/Spine2, relative to its first
frame) on top of whatever the body is doing. So only those bones are exported, rotations only (the
local translations of a rig's bones never change), and the body the arm is authored on is a plain
upright stance: the arm's local rotations are relative to the chest, so the same clip reads the same
on a standing, crouching, kneeling or seated man.

Authoring space: Blender metres on the rig's source scale, +Z up, character forward -Y, the
character's own left +X, ground z = 0. The keys below are REAL (runtime) metres from the gesture
side's own rest shoulder in the body frame (out, forward, up): out is away from the body (the
character's left for an L clip, his right for an R clip). Runtime = source x scale.
"""
import bpy, os, runpy, json, math, hashlib, time
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion, bvhtree

project = Path(os.environ['GESTURE_PROJECT'])
output = Path(os.environ.get('GESTURE_OUTPUT') or (project / 'Animation/SpeakerGestures'))
reviews = Path(os.environ.get('GESTURE_REVIEW') or (project.parent / 'tmp/SpeakerGestures/BlenderReview'))
blendDir = os.environ.get('GESTURE_BLEND_DIR')
PASS = os.environ.get('GESTURE_PASS', 'bake')
RENDER = os.environ.get('GESTURE_RENDER') == '1'
VERSION = '20260925SpeakerGesturesV1'
FPS = 30                              # every clip length and window is a whole number of 1/30 s frames
MODELS = ['LugouNra02', 'LugouNra05']
TARGET_HEIGHT = 1.66                  # Script_Actor KIND_SPEC nra: what CharacterModel scales the rig to
selectedModels = [m for m in os.environ.get('GESTURE_MODEL', '').split(',') if m] or MODELS
selectedClips = [c for c in os.environ.get('GESTURE_CLIPS', '').split(',') if c]
os.environ['CAPTIVES_PROJECT'] = str(project)
os.environ['CAPTIVES_SKIP_BLEND'] = '1'
convert = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
convertInv = convert.inverted()


def Sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


# ---------------------------------------------------------------------------------------------
# curves: monotone cubic Hermite (PCHIP). Velocity is continuous through a key, nothing
# overshoots, and two equal keys hold perfectly still (a hold window's seam is exact).
# ---------------------------------------------------------------------------------------------
def PchipSlopes(ts, ys):
    n = len(ts)
    if n < 2:
        return [0.0] * n
    h = [ts[i + 1] - ts[i] for i in range(n - 1)]
    d = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    m = [0.0] * n
    for i in range(1, n - 1):
        if d[i - 1] * d[i] > 0:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    return m


def Hermite(t0, t1, y0, y1, m0, m1, t):
    h = t1 - t0
    s = (t - t0) / h
    s2, s3 = s * s, s * s * s
    return (2 * s3 - 3 * s2 + 1) * y0 + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * y1 + (s3 - s2) * h * m1


class Keys:
    """keys: [(t, {channel: value})]; a channel missing from a key carries the previous value."""

    def __init__(self, keys):
        keys = sorted(keys, key=lambda k: k[0])
        names = []
        for _, row in keys:
            names += [n for n in row if n not in names]
        self.curves = {}
        for name in names:
            points, last = [], None
            for t, row in keys:
                last = row.get(name, last)
                if last is not None:
                    points.append((t, last))
            tuple_ = isinstance(points[0][1], (tuple, list))
            width = len(points[0][1]) if tuple_ else 1
            ts = [p[0] for p in points]
            ys = [[(p[1][k] if tuple_ else p[1]) for p in points] for k in range(width)]
            self.curves[name] = (ts, ys, [PchipSlopes(ts, y) for y in ys], tuple_)

    def __call__(self, t):
        out = {}
        for name, (ts, ys, ms, tuple_) in self.curves.items():
            if t <= ts[0]:
                v = [y[0] for y in ys]
            elif t >= ts[-1]:
                v = [y[-1] for y in ys]
            else:
                i = max(j for j in range(len(ts) - 1) if ts[j] <= t)
                v = [Hermite(ts[i], ts[i + 1], y[i], y[i + 1], m[i], m[i + 1], t) for y, m in zip(ys, ms)]
            out[name] = tuple(v) if tuple_ else v[0]
        return out


# ---------------------------------------------------------------------------------------------
# the clips. Windows (seconds) are the runtime contract and must equal SPEAKER_GESTURE_CLIPS in
# Data_FirstLevelSpeakerGestures.mjs (Script_SpeakerGestureTest compares them). The hold window
# [a, b] is authored as a seamless loop: the pose at a equals the pose at b (the same key), so the
# layer can repeat it while the line lasts.
# ---------------------------------------------------------------------------------------------
CLIPS = {
    'GesturePointL':   {'hand': 'L', 'duration': 1.8, 'inS': .35, 'strokeS': .40, 'hold': [.45, 1.15], 'outS': 1.25, 'aim': True},
    'GestureWaveOnL':  {'hand': 'L', 'duration': 1.6, 'inS': .30, 'strokeS': .48, 'hold': [.40, 1.00], 'outS': 1.10, 'aim': True},
    'GestureBeckonL':  {'hand': 'L', 'duration': 1.8, 'inS': .30, 'strokeS': .55, 'hold': [.35, 1.20], 'outS': 1.30, 'aim': False},
    'GestureDownL':    {'hand': 'L', 'duration': 1.4, 'inS': .25, 'strokeS': .40, 'hold': [.35, .90], 'outS': .95, 'aim': False},
    'GestureBeatL':    {'hand': 'L', 'duration': 1.6, 'inS': .30, 'strokeS': .50, 'hold': [.40, 1.05], 'outS': 1.10, 'aim': False},
    'GestureAskR':     {'hand': 'R', 'duration': 1.6, 'inS': .35, 'strokeS': .55, 'hold': [.50, 1.10], 'outS': 1.15, 'aim': True},
    'GestureToMouthR': {'hand': 'R', 'duration': 1.8, 'inS': .40, 'strokeS': .60, 'hold': [.55, 1.20], 'outS': 1.30, 'aim': False},
    'GestureOfferR':   {'hand': 'R', 'duration': 2.2, 'inS': .45, 'strokeS': .70, 'hold': [.65, 1.60], 'outS': 1.70, 'aim': True},
    'GestureHaltR':    {'hand': 'R', 'duration': 1.4, 'inS': .25, 'strokeS': .35, 'hold': [.35, .90], 'outS': .95, 'aim': False},
    'GestureFlickR':   {'hand': 'R', 'duration': 1.2, 'inS': .20, 'strokeS': .38, 'hold': [.40, .70], 'outS': .75, 'aim': False},
}

# Start / end pose of the gesture arm (the layer weight is 0 there, so these only shape the lift
# and the release): an L clip starts where a rifleman's left hand holds the fore-end in front of
# the belly; an R clip starts with the hand low and forward, where a seated man's hand rests on
# his knee. Real metres from the rest shoulder, (out, forward, up); the wrist target. Both rigs'
# arms (shoulder to wrist) are 0.455-0.458 m, so no target is further than 0.43 m (94 %: the
# elbow never locks straight).
REST = {
    'L': {'hand': (-.12, .32, -.26), 'pole': (.40, -.10, -.45), 'palmF': (-.35, .90, .05), 'palmN': (-.2, .1, -1.0),
          'curl': .85, 'index': .85, 'twist': 0.0, 'bend': .04, 'lean': 0.0},
    'R': {'hand': (-.02, .28, -.30), 'pole': (.40, -.10, -.40), 'palmF': (0.0, .80, -.60), 'palmN': (.10, -.55, -.80),
          'curl': .55, 'index': .5, 'twist': 0.0, 'bend': .04, 'lean': 0.0},
}
RELEASE_L = {'palmF': (-.2, .95, .1), 'palmN': (-.1, .1, -1.0), 'pole': (.45, -.12, -.48)}


def Along(direction, length):
    d = Vector(direction).normalized()
    return tuple(d * length)


def KeysPointL():
    r = REST['L']
    # Out along the arm to shoulder height, 25 deg left of straight ahead; index out, the rest
    # curled. The stroke overshoots 1.5 cm and settles (the accent), then holds with a slight sag.
    aim = (math.sin(math.radians(25)), math.cos(math.radians(25)), .02)
    stroke, over = Along(aim, .415), Along(aim, .43)
    sag = (stroke[0], stroke[1] - .005, stroke[2] - .012)
    point = {'palmF': aim, 'palmN': (0.0, 0.0, -1.0), 'curl': 1.45, 'index': .05, 'pole': (.55, -.25, -.55)}
    return [
        (0.0, dict(r)),
        (.22, {'hand': (.02, .28, -.14), 'curl': 1.1, 'index': .6, 'pole': (.50, -.15, -.50), 'twist': .02}),
        (.40, dict(point, hand=over, twist=.07, bend=.08)),
        (.45, dict(point, hand=stroke, twist=.06, bend=.07)),
        (.80, dict(point, hand=sag, twist=.06, bend=.07)),
        (1.15, dict(point, hand=stroke, twist=.06, bend=.07)),
        (1.25, dict(point, hand=stroke, twist=.06, bend=.07)),
        (1.52, dict(RELEASE_L, hand=(-.02, .28, -.16), curl=1.0, index=.7, twist=.02, bend=.05)),
        (1.80, dict(r)),
    ]


def KeysWaveOnL():
    r = REST['L']
    # Flat hand up beside the head, chopped forward and down toward the target, twice.
    up = {'hand': (.08, .08, .10), 'palmF': (0.0, .15, 1.0), 'palmN': (-.15, 1.0, 0.0), 'curl': .12, 'index': .12,
          'pole': (.60, .10, -.35)}
    aim = (math.sin(math.radians(18)), math.cos(math.radians(18)), -.12)
    chop = {'hand': Along(aim, .415), 'palmF': aim, 'palmN': (-1.0, 0.0, 0.0), 'curl': .15, 'index': .15,
            'pole': (.55, -.20, -.60)}
    lift = dict(up, hand=(.06, .16, .05))
    return [
        (0.0, dict(r)),
        (.28, dict(up, twist=-.03, bend=.02)),
        (.40, dict(lift, twist=-.01, bend=.02)),
        (.55, dict(chop, twist=.07, bend=.10)),
        (.74, dict(lift, twist=.01, bend=.06)),
        (.88, dict(chop, hand=Along(aim, .39), twist=.05, bend=.09)),
        (1.00, dict(lift, twist=-.01, bend=.02)),
        (1.10, dict(lift, twist=-.01, bend=.02)),
        (1.35, dict(RELEASE_L, hand=(-.05, .28, -.18), curl=.6, index=.6, twist=0.0, bend=.04)),
        (1.60, dict(r)),
    ]


def KeysBeckonL():
    r = REST['L']
    # Palm up, hand out in front; the forearm swings back toward the shoulder with the fingers
    # curling in, twice ("come here").
    out = {'hand': (.10, .38, -.10), 'palmF': (.15, .95, .15), 'palmN': (0.0, -.25, 1.0), 'curl': .25, 'index': .25,
           'pole': (.50, -.10, -.55), 'bend': .03}
    back = {'hand': (.18, .20, -.16), 'palmF': (.1, .15, 1.0), 'palmN': (0.0, -1.0, .15), 'curl': 1.0, 'index': .9,
            'pole': (.55, -.05, -.50), 'bend': 0.0}
    return [
        (0.0, dict(r)),
        (.30, dict(out)),
        (.35, dict(out)),
        (.55, dict(back)),
        (.78, dict(out)),
        (.97, dict(back)),
        (1.20, dict(out)),
        (1.30, dict(out)),
        (1.55, dict(RELEASE_L, hand=(-.05, .28, -.20), curl=.7, index=.7, bend=.04)),
        (1.80, dict(r)),
    ]


def KeysDownL():
    r = REST['L']
    # Palm down at chest height, pushed down twice ("get down").
    high = {'hand': (.10, .36, -.14), 'palmF': (.25, .95, 0.0), 'palmN': (0.0, 0.0, -1.0), 'curl': .1, 'index': .1,
            'pole': (.55, -.10, -.55), 'bend': .06}
    low = dict(high, hand=(.10, .30, -.26), bend=.10)
    return [
        (0.0, dict(r)),
        (.25, dict(high)),
        (.35, dict(high)),
        (.42, dict(low)),
        (.62, dict(high)),
        (.72, dict(low)),
        (.90, dict(high)),
        (.95, dict(high)),
        (1.18, dict(RELEASE_L, hand=(-.06, .28, -.26), curl=.6, index=.6, bend=.05)),
        (1.40, dict(r)),
    ]


def KeysBeatL():
    r = REST['L']
    # Open hand half raised, small downward beats (assigning, explaining).
    up = {'hand': (.02, .37, -.15), 'palmF': (.20, .95, .15), 'palmN': (-.55, 0.0, .80), 'curl': .35, 'index': .3,
          'pole': (.50, -.10, -.55), 'bend': .05}
    return [
        (0.0, dict(r)),
        (.30, dict(up, hand=(.02, .35, -.11))),
        (.40, dict(up)),
        (.50, dict(up, hand=(.03, .35, -.22), bend=.07)),
        (.70, dict(up)),
        (.82, dict(up, hand=(.05, .36, -.20), bend=.06)),
        (1.05, dict(up)),
        (1.10, dict(up)),
        (1.35, dict(RELEASE_L, hand=(-.07, .30, -.24), curl=.65, index=.65, bend=.04)),
        (1.60, dict(r)),
    ]


def KeysAskR():
    r = REST['R']
    # Open palm up, held out low toward the listener, lifted a little on the stress.
    out = {'hand': (-.05, .36, -.20), 'palmF': (-.15, .95, .05), 'palmN': (0.0, 0.0, 1.0), 'curl': .30, 'index': .25,
           'pole': (.45, -.15, -.50), 'twist': -.03, 'bend': .05}
    return [
        (0.0, dict(r)),
        (.35, dict(out, hand=(-.04, .33, -.24))),
        (.50, dict(out)),
        (.60, dict(out, hand=(-.05, .38, -.15), curl=.22, index=.2, twist=-.05, bend=.07)),
        (.80, dict(out)),
        (1.10, dict(out)),
        (1.15, dict(out)),
        (1.40, dict(r, hand=(-.03, .29, -.28))),
        (1.60, dict(r)),
    ]


# ToMouth: index and middle finger at the lips, a cigarette held between them. `mouth` is the lip
# centre from the right shoulder (out, forward, up), measured on the rig's own head skin, so both
# rigs reach their own lips. The key is where the finger roots go (3.5 cm in front of the lips,
# 1.5 cm to the right, 1 cm down); the wrist sits 8.5 cm behind them along the fingers.
def KeysToMouthR(mouth):
    r = REST['R']
    fingers = Vector((-.45, -.10, .88)).normalized()          # up and inward, toward the mouth
    palmN = (-.90, -.35, -.10)                                 # the palm faces across, the back of the hand out

    def Wrist(roots):
        return tuple(Vector(roots) - fingers * .085)
    lipsRoots = (mouth[0] + .03, mouth[1] + .03, mouth[2] - .035)
    lips = {'hand': Wrist(lipsRoots), 'palmF': tuple(fingers), 'palmN': palmN, 'curl': .95, 'index': .55,
            'pole': (.55, -.05, -.55), 'bend': .02}
    near = dict(lips, hand=Wrist((lipsRoots[0] + .01, lipsRoots[1] + .03, lipsRoots[2] - .03)))
    held = dict(lips, hand=Wrist((lipsRoots[0], lipsRoots[1] + .006, lipsRoots[2] - .003)))
    away = {'hand': (-.02, .26, -.12), 'palmF': (.30, .50, .80), 'palmN': (-.2, .95, -.3), 'curl': .5, 'index': .2,
            'pole': (.45, -.10, -.55), 'bend': .03}
    return [
        (0.0, dict(r)),
        (.40, dict(away, hand=(-.02, .26, -.20))),
        (.55, dict(near)),
        (.60, dict(lips)),
        (.90, dict(held)),
        (1.20, dict(near)),
        (1.38, dict(away)),
        (1.60, dict(r, hand=(-.02, .28, -.26))),
        (1.80, dict(r)),
    ]


def KeysOfferR():
    r = REST['R']
    # The arm extends toward the listener, fingers loosely closed as if holding a cigarette out.
    out = {'hand': (-.07, .39, -.15), 'palmF': (-.20, .95, .10), 'palmN': (-.15, 0.0, 1.0), 'curl': .75, 'index': .55,
           'pole': (.55, -.15, -.50), 'twist': -.08, 'bend': .10}
    return [
        (0.0, dict(r)),
        (.45, dict(out, hand=(-.05, .36, -.22), twist=-.04, bend=.07)),
        (.65, dict(out)),
        (.70, dict(out, hand=(-.07, .40, -.14))),
        (1.10, dict(out, hand=(-.07, .39, -.16))),
        (1.60, dict(out)),
        (1.70, dict(out)),
        (1.95, dict(r, hand=(-.03, .29, -.27))),
        (2.20, dict(r)),
    ]


def KeysHaltR():
    r = REST['R']
    # Palm raised toward the listener at shoulder height ("wait").
    palm = {'hand': (.02, .30, -.02), 'palmF': (0.0, .15, 1.0), 'palmN': (0.0, 1.0, -.10), 'curl': .10, 'index': .1,
            'pole': (.50, -.05, -.55), 'bend': .02}
    return [
        (0.0, dict(r)),
        (.25, dict(palm, hand=(.02, .27, -.08))),
        (.35, dict(palm)),
        (.60, dict(palm, hand=(.02, .31, -.01))),
        (.90, dict(palm)),
        (.95, dict(palm)),
        (1.18, dict(r, hand=(-.02, .28, -.26))),
        (1.40, dict(r)),
    ]


def KeysFlickR():
    r = REST['R']
    # Back-hand flick out and away (annoyed): cocked across the belly, flung out to the right.
    cocked = {'hand': (-.07, .34, -.20), 'palmF': (-.60, .70, .30), 'palmN': (.20, .30, -.95), 'curl': .55, 'index': .5,
              'pole': (.55, -.10, -.50), 'twist': -.04}
    flung = {'hand': (.14, .34, -.18), 'palmF': (.70, .70, .05), 'palmN': (.05, -.10, -1.0), 'curl': .15, 'index': .15,
             'pole': (.55, -.10, -.50), 'twist': .05}
    return [
        (0.0, dict(r)),
        (.20, dict(cocked)),
        (.38, dict(flung)),
        (.40, dict(flung)),
        (.55, dict(flung, hand=(.13, .33, -.21))),
        (.70, dict(flung)),
        (.75, dict(flung)),
        (1.00, dict(r, hand=(-.02, .28, -.28))),
        (1.20, dict(r)),
    ]


def PalmQuats(keys):
    """(palmF, palmN) of every key -> one orientation quaternion 'palmQ', each on the hemisphere of
    the key before it. Interpolating the two vectors component by component flipped the hand
    (their cross product passes near zero when the palm turns over); a quaternion turns it the
    short way round at an even rate."""
    out, prev, F, N = [], None, None, None
    for t, row in sorted(keys, key=lambda k: k[0]):
        row = dict(row)
        F, N = row.pop('palmF', F), row.pop('palmN', N)
        f = Vector(F).normalized()
        n = Vector(N)
        n = (n - f * n.dot(f)).normalized()
        q = Matrix((f, n, f.cross(n))).transposed().to_quaternion()
        if prev is not None and prev.dot(q) < 0:
            q.negate()
        prev = q
        row['palmQ'] = tuple(q)
        out.append((t, row))
    return out


AUTHORS = {'GesturePointL': KeysPointL, 'GestureWaveOnL': KeysWaveOnL, 'GestureBeckonL': KeysBeckonL,
           'GestureDownL': KeysDownL, 'GestureBeatL': KeysBeatL, 'GestureAskR': KeysAskR,
           'GestureToMouthR': KeysToMouthR, 'GestureOfferR': KeysOfferR, 'GestureHaltR': KeysHaltR,
           'GestureFlickR': KeysFlickR}

SPINE = ['Spine', 'Spine1', 'Spine2']
FINGERS = ['Finger0', 'Finger01', 'Finger02'] + ['Finger%d%s' % (f, s) for f in range(1, 5) for s in ('', '1', '2')]


def ArmBones(side):
    return [side + ' Clavicle', side + ' UpperArm', side + ' Forearm', side + ' Hand'] + [side + ' ' + f for f in FINGERS]


# ---------------------------------------------------------------------------------------------
def BakeRig(ctx):
    arm, scene, names = ctx['arm'], ctx['scene'], ctx['names']
    modelId = ctx['modelId']
    Bone, Point, Update, BWorld, Put = ctx['Bone'], ctx['Point'], ctx['Update'], ctx['BWorld'], ctx['Put']
    corrections, meshes = ctx['corrections'], ctx['meshes']
    nodes, nodeIndex, parents, sourceWorld = ctx['nodes'], ctx['nodeIndex'], ctx['parents'], ctx['sourceWorld']
    scale = TARGET_HEIGHT / ctx['restTop']
    prefix = next(n for n in names if n.endswith(' Pelvis')).split(' ')[0]
    R = lambda metres: metres / scale

    def Reset():
        for bone in arm.pose.bones:
            bone.matrix_basis = ctx['rest'][bone.name]
        Update()

    Reset()
    shoulder = {s: Point(Bone(s + ' UpperArm')) for s in 'LR'}
    head = Point(Bone('Head'))
    neck = Point(Bone('Neck'))
    # The lips: the most forward head-weighted skin in a band 2-8 cm above the head bone (a Biped
    # head bone sits at the base of the skull), 5 cm above it.
    headVerts = []
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for o in meshes:
        groups = {g.index: g.name for g in o.vertex_groups}
        ev = o.evaluated_get(depsgraph)
        mesh = ev.to_mesh()
        for v in mesh.vertices:
            w = sum(g.weight for g in v.groups if groups.get(g.group, '') == prefix + ' Head')
            if w > .5:
                headVerts.append(ev.matrix_world @ v.co)
        ev.to_mesh_clear()
    band = [q for q in headVerts if head.z + R(.02) < q.z < head.z + R(.08) and abs(q.x) < R(.03)]
    front = min(q.y for q in band) if band else head.y - R(.10)
    lipsWorld = Vector((0.0, front, head.z + R(.05)))
    print('REST %s scale %.4f shoulderL %s shoulderR %s head %s neck %s lips %s armLen %.3f restTop %.3f' % (
        modelId, scale, tuple(round(c * scale, 3) for c in shoulder['L']), tuple(round(c * scale, 3) for c in shoulder['R']),
        tuple(round(c * scale, 3) for c in head), tuple(round(c * scale, 3) for c in neck),
        tuple(round(c * scale, 3) for c in lipsWorld), ctx['armLen'] * scale, ctx['restTop']), flush=True)
    if PASS == 'probe':
        return {'id': modelId}

    # Torso skin (pelvis, spine, neck) as a BVH on the current pose, for the "no hand inside the
    # body" check; the head skin joins it for the lips clip.
    torsoBones = {prefix + ' ' + b for b in ('Pelvis', 'Spine', 'Spine1', 'Spine2', 'Neck')}
    headBones = {prefix + ' Head'}

    def RegionVerts(o, bones):
        groups = {g.index: g.name for g in o.vertex_groups}
        return {v.index for v in o.data.vertices if sum(g.weight for g in v.groups if groups.get(g.group, '') in bones) > .5}

    torsoKeep = {o.name: RegionVerts(o, torsoBones) for o in meshes}
    headKeep = {o.name: RegionVerts(o, headBones) for o in meshes}
    armKeep = {s: {o.name: RegionVerts(o, {prefix + ' ' + b for b in [s + ' Forearm', s + ' Hand'] + [s + ' ' + f for f in FINGERS]})
                   for o in meshes} for s in 'LR'}

    def Penetration(side, withHead=False):
        """Deepest arm vertex (forearm, hand, fingers) inside the torso (and head) skin, source metres."""
        dg = bpy.context.evaluated_depsgraph_get()
        verts, polys, arms = [], [], []
        for o in meshes:
            ev = o.evaluated_get(dg)
            mesh = ev.to_mesh()
            m = ev.matrix_world
            keep = set(torsoKeep[o.name]) | (headKeep[o.name] if withHead else set())
            remap = {}
            for i in keep:
                remap[i] = len(verts)
                verts.append(m @ mesh.vertices[i].co)
            for p in mesh.polygons:
                if all(i in remap for i in p.vertices):
                    polys.append([remap[i] for i in p.vertices])
            arms += [m @ mesh.vertices[i].co for i in armKeep[side][o.name]]
            ev.to_mesh_clear()
        if not polys:
            return 0.0
        tree = bvhtree.BVHTree.FromPolygons(verts, polys)
        worst = 0.0
        for q in arms:
            hit = tree.find_nearest(q, R(.06))
            if hit[0] is None:
                continue
            depth = -(q - hit[0]).dot(hit[1])
            if depth > worst:
                worst = depth
        return worst

    # Rest relation of each forearm and hand (the pronation share is measured against it).
    restRel = {s: BWorld(Bone(s + ' Forearm')).to_quaternion().inverted() @ BWorld(Bone(s + ' Hand')).to_quaternion() for s in 'LR'}
    twistPrev = {}

    def ShareTwist(side):
        """The palm turn puts all of the hand's roll into the wrist; hand half of it to the forearm
        (pronation), keeping the hand's world orientation. Unwrapped frame to frame."""
        fa, hd = Bone(side + ' Forearm'), Bone(side + ' Hand')
        E, Wr = Point(fa), Point(hd)
        _, Hq, Hs = BWorld(hd).decompose()
        Fq = BWorld(fa).to_quaternion()
        a = (Wr - E).normalized()
        rel = Fq.inverted() @ Hq @ restRel[side].inverted()
        axis = Fq.inverted() @ a
        twist = 2 * math.atan2(Vector((rel.x, rel.y, rel.z)).dot(axis), rel.w)
        twist = (twist + math.pi) % (2 * math.pi) - math.pi
        prev = twistPrev.get(side)
        if prev is not None:
            twist += 2 * math.pi * round((prev - twist) / (2 * math.pi))
        twistPrev[side] = twist
        Put(fa, Matrix.Translation(E) @ Quaternion(a, twist * .5).to_matrix().to_4x4() @ Matrix.Translation(-E) @ BWorld(fa))
        Put(hd, Matrix.LocRotScale(Wr, Hq, Hs))

    def ToWorld(side, v, point=True):
        sign = 1 if side == 'L' else -1
        d = Vector((sign * v[0], -v[1], v[2]))
        return shoulder[side] + d / scale if point else d

    other = {'L': 'R', 'R': 'L'}
    # The idle arm of the review stills: the rifle hand at the right hip for an L clip, the left
    # hand on the thigh for an R clip (not exported).
    idle = {'R': ((.02, .22, -.46), (.40, -.10, -.40), (0, .3, -1), (.3, 0, 0), .9),
            'L': ((-.02, .10, -.50), (.40, -.10, -.40), (0, .2, -1), (.2, .3, 0), .5)}

    def Pose(side, f):
        Reset()
        p = ctx['StandBase'](0, 0)
        p['bend'], p['lean'], p['twist'] = f.get('bend', 0.0), f.get('lean', 0.0), f.get('twist', 0.0) * (1 if side == 'L' else -1)
        o = other[side]
        ih, ip, ipf, ipn, ic = idle[o]
        p['hands'] = {side: tuple(ToWorld(side, f['hand'])), o: tuple(ToWorld(o, ih))}
        p['armPoles'] = {side: tuple(ToWorld(side, f['pole'])), o: tuple(ToWorld(o, ip))}
        palm = Quaternion(f['palmQ']).normalized().to_matrix()
        p['palms'] = {side: (tuple(ToWorld(side, palm.col[0], False).normalized()), tuple(ToWorld(side, palm.col[1], False).normalized()),
                             f['curl'], f.get('index')),
                      o: (tuple(ToWorld(o, ipf, False).normalized()), tuple(ToWorld(o, ipn, False).normalized()), ic)}
        ctx['ApplyPose'](p, 0.0)
        ShareTwist(side)
        Update()

    def SourceLocal(boneNames):
        current = {n: convertInv @ BWorld(arm.pose.bones[n]) @ corrections[n] for n in names}
        out = []
        for n in boneNames:
            index = nodeIndex[n]
            parent = parents.get(index)
            parentName = nodes[parent].get('name') if parent is not None else None
            pm = current.get(parentName, sourceWorld[parent]) if parent is not None else Matrix.Identity(4)
            _, q, _ = (pm.inverted() @ current[n]).decompose()
            out.append(q)
        return out

    # The lip centre from the right shoulder in real metres (out, forward, up), for KeysToMouthR.
    sR = shoulder['R']
    lipsRel = (-(lipsWorld.x - sR.x) * scale, -(lipsWorld.y - sR.y) * scale, (lipsWorld.z - sR.z) * scale)

    fileOut = output / ('Animation_' + modelId + 'SpeakerGestures.json')
    previous = json.loads(fileOut.read_text()) if (selectedClips and fileOut.exists()) else None
    clipsOut = dict(previous['clips']) if previous else {}
    reports = dict(previous.get('validation') or {}) if previous else {}
    wanted = [c for c in CLIPS if not selectedClips or c in selectedClips]
    arm.animation_data_create()
    for clip in wanted:
        meta = CLIPS[clip]
        side = meta['hand']
        keys = Keys(PalmQuats(AUTHORS[clip](lipsRel) if clip == 'GestureToMouthR' else AUTHORS[clip]()))
        count = int(round(meta['duration'] * FPS)) + 1
        assert abs((count - 1) - meta['duration'] * FPS) < 1e-6, clip
        boneNames = [prefix + ' ' + b for b in ArmBones(side)] + [prefix + ' ' + b for b in SPINE]
        values, frames = [], []
        twistPrev.clear()
        action = bpy.data.actions.new(clip) if blendDir else None
        worstPen, worstPenAt, elbowMin, elbowMax = 0.0, None, 999.0, 0.0
        strokeDir = None
        tipOf = {}
        started = time.time()
        for frame in range(count):
            t = frame * meta['duration'] / (count - 1)
            Pose(side, keys(t))
            qs = SourceLocal(boneNames)
            frames.append(qs)
            for q in qs:
                values.extend([round(q.x, 5), round(q.y, 5), round(q.z, 5), round(q.w, 5)])
            ua, fa, hd = Point(Bone(side + ' UpperArm')), Point(Bone(side + ' Forearm')), Point(Bone(side + ' Hand'))
            bendDeg = math.degrees((fa - ua).angle(hd - fa))
            elbowMin, elbowMax = min(elbowMin, bendDeg), max(elbowMax, bendDeg)
            tip = Point(Bone(side + ' Finger12')) if clip == 'GesturePointL' else ctx['GripPoint'](side)
            tipOf[frame] = tip
            if abs(t - meta['strokeS']) < .5 / FPS:
                d = (tip - ua).normalized()
                strokeDir = [round(-d.x, 4), round(d.z, 4), round(d.y, 4)]      # three.js actor frame
            live = meta['inS'] * .5 <= t <= meta['outS'] + (meta['duration'] - meta['outS']) * .5
            if live and (frame % 2 == 0 or frame == count - 1):
                pen = Penetration(side, withHead=(clip == 'GestureToMouthR'))
                if pen > worstPen:
                    worstPen, worstPenAt = pen, round(t, 3)
            if RENDER and (frame in (0, count - 1) or abs(t - meta['strokeS']) < .5 / FPS
                           or abs(t - (meta['hold'][0] + meta['hold'][1]) / 2) < .5 / FPS
                           or abs(t - (meta['outS'] + meta['duration']) / 2) < .5 / FPS):
                RenderReview(clip, modelId, frame, side)
            if action is not None:
                arm.animation_data.action = action
                for n in names:
                    arm.pose.bones[n].keyframe_insert('rotation_quaternion', frame=frame)
                arm.animation_data.action = None
        # Per-frame angular step of every exported bone (local), the hold seam, the lips.
        stepWorst, stepAt = 0.0, None
        for i in range(1, count):
            for k, n in enumerate(boneNames):
                a = frames[i - 1][k].rotation_difference(frames[i][k]).angle
                a = math.degrees(min(a, 2 * math.pi - a))
                if a > stepWorst:
                    stepWorst, stepAt = a, '%s@%.2f' % (n.split(' ', 1)[1], i / FPS)
        def Sampled(t, k):
            """What the runtime reads at clip time t: the two nearest frames, nlerped."""
            x = t * FPS
            i = min(count - 2, int(math.floor(x)))
            a, b = frames[i][k], frames[i + 1][k].copy()
            if a.dot(b) < 0:
                b.negate()
            return a.slerp(b, x - i)
        seam = 0.0
        for k in range(len(boneNames)):
            a = Sampled(meta['hold'][0], k).rotation_difference(Sampled(meta['hold'][1], k)).angle
            seam = max(seam, math.degrees(min(a, 2 * math.pi - a)))
        report = {'frames': count, 'maxStepDeg': round(stepWorst, 2), 'maxStepAt': stepAt, 'holdSeamDeg': round(seam, 3),
                  'elbowBendDeg': [round(elbowMin, 1), round(elbowMax, 1)],
                  'penetrationM': round(worstPen * scale, 4), 'penetrationAt': worstPenAt,
                  'finite': all(math.isfinite(v) for v in values)}
        if clip == 'GestureToMouthR':
            s0 = int(round(meta['strokeS'] * FPS))
            report['lipsGapM'] = round((tipOf[s0] - lipsWorld).length * scale, 4)
        if action is not None:
            action.use_fake_user = True
        clipsOut[clip] = {'duration': meta['duration'], 'frameCount': count, 'hand': side,
                          'bones': list(boneNames), 'strokeDir': strokeDir, 'values': values}
        reports[clip] = report
        print('CLIP %-16s %s frames %d step %.1f(%s) seam %.3f elbow %s pen %.4f@%s %s %.0fs' % (
            clip, modelId, count, stepWorst, stepAt, seam, report['elbowBendDeg'], report['penetrationM'], worstPenAt,
            ('lips %.4f' % report['lipsGapM']) if 'lipsGapM' in report else '', time.time() - started), flush=True)

    output.mkdir(parents=True, exist_ok=True)
    source = project / 'Model/Character' / ('Model_' + modelId + '.glb')
    asset = {'schema': 1, 'modelId': modelId, 'fps': FPS, 'stride': 4,
             'coordinates': 'glTF node-local bone rotations (q xyzw) of the listed bones; strokeDir is the '
                            'shoulder -> hand (index tip for a point) direction at the stroke, three.js actor frame',
             'clips': {c: clipsOut[c] for c in CLIPS if c in clipsOut}, 'validation': {c: reports[c] for c in CLIPS if c in reports},
             'originalModelSha256': Sha(source), 'authoringTool': 'Blender ' + bpy.app.version_string + ' (bpy; headless)'}
    temporary = fileOut.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(asset, separators=(',', ':')), encoding='utf-8')
    temporary.replace(fileOut)
    if blendDir:
        Path(blendDir).mkdir(parents=True, exist_ok=True)
        scene['BlenderTask'] = 'SpeakerGestures20260925'
        base['Op'](bpy.ops.wm.save_as_mainfile, filepath=str(Path(blendDir) / ('Scene_' + modelId + 'SpeakerGestures.blend')), compress=True)
    print('GESTURE_BAKED', modelId, len(asset['clips']), fileOut.stat().st_size, flush=True)
    return {'id': modelId}


reviewCamera = None


def RenderReview(clip, modelId, frame, side):
    """Workbench stills for the local review folder (never committed): front, side and top."""
    global reviewCamera
    scene = bpy.context.scene
    reviews.mkdir(parents=True, exist_ok=True)
    if reviewCamera is None:
        reviewCamera = bpy.data.objects.new('Camera_GestureReview', bpy.data.cameras.new('Camera_GestureReview'))
        scene.collection.objects.link(reviewCamera)
        ground = bpy.data.meshes.new('Prop_ReviewGround')
        ground.from_pydata([(-3, -3, 0), (3, -3, 0), (3, 3, 0), (-3, 3, 0)], [], [(0, 1, 2, 3)])
        scene.collection.objects.link(bpy.data.objects.new('Prop_ReviewGround', ground))
        scene.render.engine = 'BLENDER_WORKBENCH'
        scene.render.resolution_x, scene.render.resolution_y = 300, 340
        scene.display.shading.light = 'STUDIO'
        scene.display.shading.show_shadows = True
        scene.camera = reviewCamera
    sx = 1 if side == 'L' else -1
    for view, location, target in [('front', (.3 * sx, -3.4, 1.35), (0, 0, 1.2)), ('side', (3.4 * sx, -.3, 1.35), (0, -.2, 1.2)),
                                   ('top', (1.0 * sx, -1.4, 3.4), (0, -.2, 1.2))]:
        reviewCamera.location = location
        reviewCamera.rotation_euler = (Vector(target) - Vector(location)).to_track_quat('-Z', 'Y').to_euler()
        reviewCamera.data.type = 'ORTHO'
        reviewCamera.data.ortho_scale = 1.5
        scene.render.filepath = str(reviews / ('%s_%s_%02d_%s.png' % (clip, modelId, frame, view)))
        bpy.ops.render.render(write_still=True)


def WriteManifest():
    rows = []
    for modelId in MODELS:
        file = output / ('Animation_' + modelId + 'SpeakerGestures.json')
        if not file.exists():
            continue
        asset = json.loads(file.read_text())
        rows.append({'id': modelId, 'file': file.name, 'sha256': Sha(file), 'bytes': file.stat().st_size,
                     'originalModelSha256': asset['originalModelSha256'], 'clipIds': list(asset['clips']),
                     'validation': asset.get('validation') or {}})
    manifest = {'schema': 1, 'version': VERSION, 'fps': FPS,
                'scope': 'First-level 03-06 speaker gestures (Data_FirstLevelSpeakerGestures); arm layer, not body clips',
                'coordinates': {'values': 'glTF node-local bone rotations (q xyzw), stride 4, per clip bone list',
                                'strokeDir': 'three.js actor frame (+x right, +y up, -z forward)'},
                'clips': CLIPS, 'models': rows}
    target = output / 'Data_SpeakerGesturesAnimation.json'
    target.write_text(json.dumps(manifest, indent=1), encoding='utf-8')
    print('GESTURE_MANIFEST', len(rows), 'models', len(CLIPS), 'clips', flush=True)


if PASS == 'manifest':
    WriteManifest()
else:
    base = runpy.run_path(str(project / '_import/Script_MachineGunCaptivesBake.py'), run_name='GestureRigLibrary')
    results = [base['Bake'](modelId, probe=BakeRig) for modelId in MODELS if modelId in selectedModels]
    print('GESTURE_COMPLETE', PASS, len(results), flush=True)
