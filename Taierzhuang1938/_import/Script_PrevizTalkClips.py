"""Placeholder talk / gesture clips for the white-box previz (docs/Data_EditorBlockout.md §14; Data_BlockoutPrevizClips.mjs).

Same module contract as _import/Script_OpeningStoryboardClips.py (CLIPS / STAGES / PROPS / CONTACT_POINTS /
PARTNER_SOURCES / GHOST_BONES / BindCaptives / MakeClips), run by the opening frame loop through
_import/Script_PrevizTalkBake.py. The pose toolkit (Toolkit, Anim, Standing, KneelFlat, SlungProps, the prone helpers)
is the opening library's own, loaded from it; nothing there changes.

Authoring space (as the opening library): Blender metres on the rig's source scale, +Z up, forward -Y, the
character's own left +X, ground z = 0, actor root at the origin. Free hands use the torso-frame offsets of
Standing (handRel.<side>: (left, back, up) from that shoulder), so a bend or a twist carries the hand along.

The rule these clips exist for (user, 2026-10-19): a man who talks does not hold his rifle up. Where there is no
fighting the rifle is slung (PvStandTalkSlung); where there is, it hangs low in the right hand (the Pv*L standing
gestures) or stands upright, butt on the ground (the kneeling ones), or lies on the ground in front (prone).
Every rifle is a `weapon` prop track (weaponHold 'track'): the runtime places the hand weapon on it.

  PvStandTalkLowRifle  talking, rifle low in the right hand (muzzle down-forward), the left hand making small gestures
  PvStandTalkSlung     talking, rifle slung across the back, both hands making small gestures
  PvStandPointL        rifle low in the right hand, the left arm comes up to shoulder height and points ahead; holds
  PvStandWaveOnL       rifle low, the left hand swings from beside the head forward and down, twice ("go on, move")
  PvStandBeckonL       half turned to his left, the left hand calls toward himself, twice ("over here")
  PvStandHaltL         rifle low, the left palm up in front of the chest ("stop"); holds
  PvStandShakeHead     rifle low, the head shakes twice, eyes down
  PvCrouchTalkRifle    down on the right knee, rifle upright (butt on the ground) in the right hand, the left hand beats
  PvCrouchPointL       the same kneel, the left arm points to the front left; holds
  PvCrouchCountFingers the same kneel, the left hand up counting on its fingers (one finger, the open hand)
  PvProneBeckonL       prone on the lip, the rifle on the ground in front, the left hand up calling toward himself
"""
import math, os, runpy
from pathlib import Path
from mathutils import Vector

_here = Path(os.environ['OPENING_PROJECT']) / '_import'
_base = runpy.run_path(str(_here / 'Script_OpeningStoryboardClips.py'), run_name='PrevizTalkBase')
Toolkit, Anim, KneelFlat, Standing = _base['Toolkit'], _base['Anim'], _base['KneelFlat'], _base['Standing']
Clamp, Smooth, Unit, Add3 = _base['Clamp'], _base['Smooth'], _base['Unit'], _base['Add3']
SlungRifle, SlungProps = _base['SlungRifle'], _base['SlungProps']
RaProneLocal, RaProneWorld = _base['RaProneLocal'], _base['RaProneWorld']
GHOST_BONES, GHOST_LINKS = _base['GHOST_BONES'], _base['GHOST_LINKS']
Tau = math.pi * 2
LR = ('L', 'R')

CLIPS = {}
STAGES = {}
PROPS = {}
CONTACT_POINTS = {}
PARTNER_SOURCES = {}
BUILDERS = {}


def BindCaptives(base):
    """No legacy clips here: the captives baker's globals are not needed."""


def Meta(name, duration, loop, hold='track', **extra):
    row = {'duration': duration, 'loop': loop, 'weaponHold': hold, 'props': ['weapon'], 'rootMotion': False}
    row.update(extra)
    CLIPS[name] = row
    return name


def Builder(name):
    def Register(fn):
        BUILDERS[name] = fn
        return fn
    return Register


LOW = 'rifle low in the right hand (weapon track: the fist round the wrist of the stock, muzzle down and forward)'
UPRIGHT = 'rifle upright at his right, butt on the ground, the right hand round the handguard (weapon track)'
Meta('PvStandTalkLowRifle', 4.0, True, role='talker', weaponState='lowRight',
     notes='Standing, talking: %s; the left hand comes up in front of the belly and makes small open-palm beats with '
           'the words, the head nods a little. Seamless loop.' % LOW)
Meta('PvStandTalkSlung', 4.0, True, role='talker', weaponState='slungBack', weaponSlung=True,
     notes='Standing, talking where nobody is fighting (the dugout, the collection point): rifle slung across the back '
           '(weapon track), both hands making small gestures in front of the belly, the right half a beat after the left. '
           'Seamless loop.')
Meta('PvStandPointL', 3.0, False, role='talker', weaponState='lowRight', holdLoop=[0.8, 3.0],
     notes='Standing, %s; the left arm comes up to shoulder height and points straight ahead (index finger out) by '
           '0.8 s, then holds (0.8-3.0 s hold loop: breathing only).' % LOW)
Meta('PvStandWaveOnL', 1.8, True, role='talker', weaponState='lowRight',
     notes='Standing, %s; the left hand swings from beside the head forward and down, twice a loop ("go on, follow"), '
           'the trunk leaning into each swing.' % LOW)
Meta('PvStandBeckonL', 1.8, True, role='talker', weaponState='lowRight',
     notes='Standing half turned to his left (chest and head toward the people he calls), %s; the left arm out toward '
           'them, the hand drawn back toward himself twice a loop, palm toward him ("over here").' % LOW)
Meta('PvStandHaltL', 1.6, False, role='talker', weaponState='lowRight', holdLoop=[0.4, 1.6],
     notes='Standing, %s; the left palm comes up flat in front of the chest, fingers up ("stop") by 0.4 s, then holds '
           '(0.4-1.6 s hold loop).' % LOW)
Meta('PvStandShakeHead', 1.6, False, role='talker', weaponState='lowRight',
     notes='Standing, %s; the head drops a little and shakes twice (no), eyes down; first and last frames neutral.' % LOW)
Meta('PvCrouchTalkRifle', 4.0, True, role='talker', weaponState='upright',
     notes='Down on the right knee, the left foot forward, %s; the left forearm over the left knee, the hand beating '
           'small with the words. Seamless loop.' % UPRIGHT)
Meta('PvCrouchPointL', 2.0, False, role='talker', weaponState='upright', holdLoop=[0.6, 2.0],
     notes='The PvCrouchTalkRifle kneel, %s; the left arm points to the front left by 0.6 s, then holds (0.6-2.0 s '
           'hold loop).' % UPRIGHT)
Meta('PvCrouchCountFingers', 3.0, True, role='talker', weaponState='upright',
     notes='The PvCrouchTalkRifle kneel, %s; the left hand up in front of the chest counting on its fingers: a fist, one '
           'finger, the open hand, twice a loop (01: Yaowa counting the guns).' % UPRIGHT)
Meta('PvProneBeckonL', 1.6, True, role='talker', weaponState='ground',
     notes='Prone on the lip, the rifle lying on the ground in front of him at his right (weapon track), the right hand on '
           'its stock; the left forearm up off the ground, the hand calling toward himself twice a loop, the head turned '
           'to his left toward whoever he calls.')
# 2026-10-19 V2: resting poses for the men who do NOT talk where nobody is fighting (the dugout, the collection point):
# no rifle held at the ready.
Meta('PvCrouchRestRifle', 4.0, True, role='rest', weaponState='upright',
     notes='Down on the right knee, the left foot forward, the rifle upright in front of him (butt on the ground between the '
           'knees, leaning back toward the chest), both hands resting stacked on the handguard, the head a little down; '
           'slow breathing only. Seamless loop.')
Meta('PvSitRestRifle', 4.0, True, role='rest', weaponState='upright', env={'wallBehindM': .35},
     notes='Seated on the ground with his back to the trench / dugout wall (root 0.35 m in front of the wall face, as '
           'WoundedSitRifleIdle), knees up, the rifle upright between the knees, butt in the dirt, both arms round it '
           '(right hand on the handguard, left hand below it); slow breathing, the head nodding a little. Seamless loop.')


def R(T, v):
    """Runtime metres -> this rig's source metres."""
    return tuple(c / T.s for c in v) if isinstance(v, (tuple, list)) else v / T.s


def Breathe(f, t, period, amount=1.0):
    b = math.sin(Tau * t / period) * amount
    f['bend'] += .012 * b
    f['shrug'] += .02 * b
    return f


# =================================================================================
# standing, rifle low in the right hand
# =================================================================================
def LowRifle(T):
    """The rifle hanging from the right fist: the fist round the wrist of the stock beside the right thigh, the muzzle
    down and forward, a little out from the leg. -> (rifle points, fist point, palmF, palmN)."""
    sh = Vector(T.K['shoulder']['R'])
    axis = Vector((-.10, -.80, -.58)).normalized()
    fist = sh + Vector((-.035, -.10, -(T.ARM * .93 + .02)))
    rifle = T.Rifle(tuple(fist), tuple(axis))
    # Fingers wrap the stock from the outside: extended they would point down and a little back (square to the stock),
    # the palm toward the thigh.
    down = Vector((0, 0, -1))
    fingers = (down - axis * down.dot(axis)).normalized()
    palmN = Vector((1, 0, 0))
    palmN = (palmN - fingers * palmN.dot(fingers)).normalized()
    return rifle, tuple(fist), tuple(fingers), tuple(palmN)


def StandBase(T, crouch=0.0):
    H, A = T.H, T.A
    f = Standing(T, crouch=crouch, bend=.07)
    f.update({'ankle.L': (H + .05, -.04, A), 'ankle.R': (-(H + .05), .05, A), 'foot.L': (0, 9, 0), 'foot.R': (0, -9, 0),
              'handRel.L': (.07, -.12, -.46), 'curl.L': .45, 'neck': (.02, 0, 0), 'head': (.03, 0, 0)})
    return f


def HoldLow(T, f):
    rifle, fist, fingers, palmN = LowRifle(T)
    f['grip.R'] = fist
    f['palmF.R'], f['palmN.R'], f['curl.R'] = fingers, palmN, 1.0
    f['armPole.R'] = (-(T.SX + .45), .40, T.SZ - .45)
    f['handRel.R'] = None
    return rifle


def LowProps(T):
    rifle = LowRifle(T)[0]
    return lambda t: {'weapon': T.Track(rifle, up=(0, 0, 1))}


STAND_VIEWS = [('side', (-3.4, -.35, 1.0), (0, -.25, .80)), ('q', (-2.3, -2.9, 1.8), (0, -.25, .75)),
               ('front', (.4, -3.4, 1.1), (0, -.2, .85))]


def StandSpec(T, Pose, D, frames, extraReview=None):
    rifle = LowRifle(T)[0]
    review = lambda t: T.RifleProps(rifle) + (extraReview(t) if extraReview else [])
    return {'pose': Pose, 'props': LowProps(T), 'plants': [('L', 0, D), ('R', 0, D)], 'reviewProps': review,
            'reviewViews': STAND_VIEWS, 'reviewScale': 2.4, 'reviewFrames': frames,
            'check': lambda t: {'R': LowRifle(T)[1]}}


# Left-hand gesture poses in the torso frame of the left shoulder (left, back, up), with palm (fingers, normal, curl).
G_REST = {'handRel.L': (.07, -.12, -.46), 'palmF.L': (0, -.2, -1), 'palmN.L': (-1, 0, 0), 'curl.L': .45}
G_LOW = {'handRel.L': (.00, -.30, -.33), 'palmF.L': Unit((-.35, -.9, -.15)), 'palmN.L': Unit((-.25, -.1, 1)), 'curl.L': .30}
G_OPEN = {'handRel.L': (.08, -.36, -.26), 'palmF.L': Unit((.05, -1, .05)), 'palmN.L': Unit((-.35, 0, 1)), 'curl.L': .20}
G_BEAT = {'handRel.L': (.02, -.33, -.36), 'palmF.L': Unit((-.25, -.95, -.25)), 'palmN.L': Unit((-.3, 0, 1)), 'curl.L': .35}


def Mirror(g):
    """A left-hand gesture as the right hand's (x negated)."""
    out = {}
    for k, v in g.items():
        key = k[:-1] + 'R'
        out[key] = (-v[0], v[1], v[2]) if isinstance(v, tuple) else v
    return out


@Builder('PvStandTalkLowRifle')
def BuildStandTalkLow(T, name):
    D = 4.0
    base = StandBase(T)
    HoldLow(T, base)
    base.update(G_REST)
    h = base['head']
    keys = [
        (0.00, {}),
        (0.55, dict(G_LOW, head=(h[0] + .05, 0, .04))),
        (1.05, dict(G_BEAT, head=(h[0] - .02, 0, .02))),
        (1.55, dict(G_OPEN, head=(h[0] + .06, 0, -.04), twist=.04)),
        (2.15, dict(G_BEAT, head=(h[0] - .01, 0, -.02))),
        (2.70, dict(G_LOW, head=(h[0] + .05, 0, .03), twist=0.0)),
        (3.40, dict(G_REST, head=h)),
        (D, {}),
    ]
    anim = Anim(base, keys, {'head': .08, 'hand': .04}, periodic=True)

    def Pose(t):
        f = Breathe(anim(t), t, 2.0)
        return T.Nest(f)
    return StandSpec(T, Pose, D, lambda n: [0, int(n * .14), int(n * .39), int(n * .54)])


@Builder('PvStandTalkSlung')
def BuildStandTalkSlung(T, name):
    D = 4.0
    base = StandBase(T)
    base.update(G_REST)
    base.update(Mirror(G_REST))
    h = base['head']
    keys = [
        (0.00, {}),
        (0.50, dict(G_LOW, head=(h[0] + .05, 0, .04))),
        (0.80, Mirror(G_LOW)),
        (1.10, dict(G_BEAT, head=(h[0] - .02, 0, .02))),
        (1.50, dict(G_OPEN, **Mirror(G_OPEN), head=(h[0] + .06, 0, -.04))),
        (2.10, dict(G_BEAT, **Mirror(G_BEAT), head=(h[0] - .01, 0, -.02))),
        (2.70, dict(G_LOW, **Mirror(G_LOW), head=(h[0] + .04, 0, .02))),
        (3.40, dict(G_REST, **Mirror(G_REST), head=h)),
        (D, {}),
    ]
    anim = Anim(base, keys, {'head': .08, 'hand': .04}, periodic=True)

    def Pose(t):
        return T.Nest(Breathe(anim(t), t, 2.0))
    props, review = SlungProps(T, 'back')
    return {'pose': Pose, 'props': props, 'plants': [('L', 0, D), ('R', 0, D)], 'reviewProps': review,
            'reviewViews': STAND_VIEWS + [('back', (1.8, 2.6, 1.6), (0, 0, .9))], 'reviewScale': 2.4,
            'reviewFrames': lambda n: [0, int(n * .38), int(n * .53)]}


def WorldL(f, hand, palmF, palmN, curl, index, pole=None):
    """The left hand on a world target (source m) with its own palm: the index finger only bends on its own for a
    world hand (the torso-frame hands of Standing curl all four fingers alike)."""
    f.update({'handRel.L': None, 'hand.L': tuple(hand), 'palmF.L': Unit(palmF), 'palmN.L': Unit(palmN), 'curl.L': curl,
              'index.L': index})
    if pole is not None:
        f['armPole.L'] = tuple(pole)
    return f


def ShoulderL(T, kneel=False):
    """The left shoulder (source m) of the standing / kneeling base, the trunk taken as upright."""
    sh = Vector(T.K['shoulder']['L'])
    if kneel:
        K = T.K
        drop = (T.P - .035) - (K['kneelPelvisZ'] + .10)
        sh = sh + Vector((0, K['kneelPelvisY'] - .08, -drop))
    return sh


@Builder('PvStandPointL')
def BuildStandPoint(T, name):
    D, at = 3.0, .8
    base = StandBase(T)
    HoldLow(T, base)
    sh = ShoulderL(T)
    a = T.ARM
    rest = WorldL({}, sh + Vector((.03, -.10, -(a * .92))), (0, -.15, -1), (-1, 0, 0), .45, .45, sh + Vector((.45, .45, -.40)))
    mid = WorldL({}, sh + Vector((.04, -.32, -.30)), (0, -.8, .4), (-.6, 0, -.4), 1.0, .4, sh + Vector((.45, .30, -.40)))
    point = WorldL({}, sh + Vector((.05, -(a * .96), -.03)), (0, -1, 0), (-.3, 0, -1), 1.45, 0.0, sh + Vector((.40, .10, -.30)))
    point.update({'head': (-.02, 0, .03), 'twist': .06, 'bend': .05})
    base.update(rest)
    keys = [(0.00, {}), (.35, mid), (at, point), (D, {})]
    anim = Anim(base, keys, {'head': .06})

    def Pose(t):
        f = anim(t)
        if t > at:
            Breathe(f, t - at, D - at, Smooth((t - at) / .3) if t < at + .3 else 1.0)
        return T.Nest(f)
    return StandSpec(T, Pose, D, lambda n: [0, int(n * .12), int(n * .27), n - 1])


@Builder('PvStandWaveOnL')
def BuildStandWaveOn(T, name):
    D = 1.8
    base = StandBase(T)
    HoldLow(T, base)
    up = {'handRel.L': (.10, -.10, .18), 'palmF.L': Unit((0, -.2, 1)), 'palmN.L': Unit((-.2, -1, 0)), 'curl.L': .15,
          'poleRel.L': (.45, .15, -.30), 'bend': .05, 'twist': .05}
    down = {'handRel.L': (.03, -.43, -.19), 'palmF.L': Unit((0, -1, -.6)), 'palmN.L': Unit((-.1, -.4, -1)), 'curl.L': .25,
            'poleRel.L': (.45, .10, -.40), 'bend': .13, 'twist': -.03}
    base.update(up)
    keys = [(0.0, {}), (.42, down), (.90, up), (1.32, down), (D, up)]
    anim = Anim(base, keys, {'head': .05}, periodic=True)

    def Pose(t):
        return T.Nest(anim(t))
    return StandSpec(T, Pose, D, lambda n: [0, int(n * .23), int(n * .5)])


@Builder('PvStandBeckonL')
def BuildStandBeckon(T, name):
    D = 1.8
    base = StandBase(T)
    HoldLow(T, base)
    base.update({'pelvisTilt': (.03, 0, .18), 'twist': .32, 'head': (.0, 0, .40), 'neck': (0, 0, .12),
                 'ankle.L': (T.H + .08, .06, T.A), 'foot.L': (0, 28, 0)})
    out = {'handRel.L': (.18, -.40, -.12), 'palmF.L': Unit((.15, -1, .25)), 'palmN.L': Unit((-.1, .3, 1)), 'curl.L': .15,
           'poleRel.L': (.50, .15, -.40)}
    inn = {'handRel.L': (.14, -.30, -.06), 'palmF.L': Unit((.1, -.2, 1)), 'palmN.L': Unit((0, .9, .2)), 'curl.L': .95,
           'poleRel.L': (.50, .15, -.45)}
    base.update(out)
    keys = [(0.0, {}), (.45, inn), (.90, out), (1.35, inn), (D, out)]
    anim = Anim(base, keys, {'hand': .03}, periodic=True)

    def Pose(t):
        return T.Nest(anim(t))
    return StandSpec(T, Pose, D, lambda n: [0, int(n * .25), int(n * .5)])


@Builder('PvStandHaltL')
def BuildStandHalt(T, name):
    D, at = 1.6, .4
    base = StandBase(T)
    HoldLow(T, base)
    base.update(G_REST)
    base['poleRel.L'] = (.45, .40, -.35)
    halt = {'handRel.L': (-.04, -.42, -.10), 'palmF.L': Unit((-.1, -.1, 1)), 'palmN.L': Unit((0, -1, .05)), 'curl.L': .05,
            'poleRel.L': (.45, .10, -.40), 'head': (-.02, 0, 0)}
    keys = [(0.0, {}), (at, halt), (D, {})]
    anim = Anim(base, keys, {'head': .05})

    def Pose(t):
        f = anim(t)
        if t > at:
            Breathe(f, t - at, D - at, Smooth((t - at) / .3) if t < at + .3 else 1.0)
        return T.Nest(f)
    return StandSpec(T, Pose, D, lambda n: [0, int(n * .25), n - 1])


@Builder('PvStandShakeHead')
def BuildStandShake(T, name):
    D = 1.6
    base = StandBase(T)
    HoldLow(T, base)
    base.update(G_REST)
    h, n = base['head'], base['neck']
    keys = [(0.0, {}), (.20, {'head': (h[0] + .20, 0, 0), 'neck': (n[0] + .10, 0, 0), 'bend': .10}),
            (.42, {'head': (h[0] + .22, 0, .32)}), (.68, {'head': (h[0] + .22, 0, -.30)}),
            (.92, {'head': (h[0] + .22, 0, .26)}), (1.15, {'head': (h[0] + .20, 0, -.18)}),
            (1.38, {'head': (h[0] + .10, 0, 0), 'neck': n, 'bend': base['bend']}), (D, {'head': h})]
    anim = Anim(base, keys)

    def Pose(t):
        return T.Nest(anim(t))
    return StandSpec(T, Pose, D, lambda n: [0, int(n * .26), int(n * .42)])


# =================================================================================
# down on the right knee, rifle upright at his right
# =================================================================================
def KneelBase(T):
    """Right knee on the ground, the left foot planted forward (the genuflect of LuoKneelCheck), trunk upright."""
    H, A, K = T.H, T.A, T.K
    kz, ky = K['kneelPelvisZ'], K['kneelPelvisY']
    kp = K['toeKneelPitch'] - K['toeStandPitch']
    f = Standing(T, bend=.10)
    f.update({'pelvis': (0, ky - .06, kz + .10), 'pelvisTilt': (.04, 0, 0),
              'ankle.L': (H + .10, ky - .52, A), 'legPole.L': (H + .30, -1.2, .9), 'foot.L': (0, 10, 0),
              'ankle.R': K['kneelAnkle'](-1), 'legPole.R': K['kneelPole'](-1), 'foot.R': (kp, 0, 0),
              'neck': (.03, 0, 0), 'head': (.02, 0, 0), 'handRel.L': (.07, -.18, -.40), 'curl.L': .45})
    return f


def UprightRifle(T):
    """Butt on the ground ahead of the right knee, the rifle leaning back toward the right shoulder."""
    K = T.K
    butt = (-(T.SX + .02), K['kneelPelvisY'] - .30, .012)
    return T.RifleFromButt(butt, Unit((-.02, .16, 1.0)))


def HoldUpright(T, f):
    rifle = UprightRifle(T)
    # the fist round the handguard about the height of the elbow
    along = (T.K['kneelPelvisZ'] + .28) * T.s
    f['grip.R'] = T.Along(rifle, along)
    f['palmF.R'], f['palmN.R'], f['curl.R'] = Unit((.9, -.35, .08)), Unit((.35, -.93, 0)), 1.0
    f['armPole.R'] = (-(T.SX + .50), .10, T.K['kneelPelvisZ'] + .10)
    f['handRel.R'] = None
    return rifle


KNEEL_VIEWS = [('side', (-3.2, -.40, .70), (0, -.25, .55)), ('q', (-2.2, -2.8, 1.5), (0, -.25, .50)),
               ('front', (.4, -3.2, .8), (0, -.2, .55))]


def KneelSpec(T, Pose, D, frames):
    rifle = UprightRifle(T)
    g = T.Along(rifle, (T.K['kneelPelvisZ'] + .28) * T.s)
    return {'pose': Pose, 'props': lambda t: {'weapon': T.Track(rifle, up=(0, 1, 0))},
            'plants': [('L', 0, D)], 'kneePlants': [('R', 0, D)],
            'reviewProps': lambda t: T.RifleProps(rifle), 'reviewViews': KNEEL_VIEWS, 'reviewScale': 2.2,
            'reviewFrames': frames, 'check': lambda t: {'R': g}}


K_REST = {'handRel.L': (.07, -.18, -.40), 'palmF.L': (0, -.3, -1), 'palmN.L': (-1, 0, 0), 'curl.L': .45}
K_LOW = {'handRel.L': (.02, -.36, -.30), 'palmF.L': Unit((-.3, -.9, -.2)), 'palmN.L': Unit((-.2, 0, 1)), 'curl.L': .35}
K_BEAT = {'handRel.L': (.04, -.38, -.22), 'palmF.L': Unit((-.2, -1, 0)), 'palmN.L': Unit((-.4, 0, 1)), 'curl.L': .25}


@Builder('PvCrouchTalkRifle')
def BuildCrouchTalk(T, name):
    D = 4.0
    base = KneelBase(T)
    HoldUpright(T, base)
    base.update(K_LOW)
    h = base['head']
    keys = [(0.0, {}), (.45, dict(K_BEAT, head=(h[0] + .05, 0, .03))), (.85, dict(K_LOW, head=(h[0], 0, .02))),
            (1.35, dict(K_BEAT, head=(h[0] + .06, 0, -.03))), (1.80, dict(K_LOW)),
            (2.40, dict(K_BEAT, head=(h[0] + .04, 0, .03))), (2.90, dict(K_REST, head=h)), (3.50, dict(K_LOW)), (D, {})]
    anim = Anim(base, keys, {'head': .08}, periodic=True)

    def Pose(t):
        return T.Nest(Breathe(anim(t), t, 2.0))
    return KneelSpec(T, Pose, D, lambda n: [0, int(n * .11), int(n * .34)])


def KneelRestL(T):
    """The kneeling left hand at rest, over the left knee (world)."""
    sh = ShoulderL(T, kneel=True)
    return WorldL({}, sh + Vector((.0, -.24, -.40)), (-.2, -.5, -.85), (-.6, 0, -.6), .45, .45, sh + Vector((.45, .30, -.40)))


@Builder('PvCrouchPointL')
def BuildCrouchPoint(T, name):
    D, at = 2.0, .6
    base = KneelBase(T)
    HoldUpright(T, base)
    sh = ShoulderL(T, kneel=True)
    a = T.ARM
    aim = Vector((.50, -.866, .02)).normalized()
    base.update(KneelRestL(T))
    point = WorldL({}, sh + aim * (a * .95), tuple(aim), (-.3, 0, -1), 1.45, 0.0, sh + Vector((.40, .15, -.30)))
    point.update({'head': (-.03, 0, .30), 'neck': (0, 0, .10), 'twist': .10})
    keys = [(0.0, {}), (at, point), (D, {})]
    anim = Anim(base, keys, {'head': .06})

    def Pose(t):
        f = anim(t)
        if t > at:
            Breathe(f, t - at, D - at, Smooth((t - at) / .3) if t < at + .3 else 1.0)
        return T.Nest(f)
    return KneelSpec(T, Pose, D, lambda n: [0, int(n * .30), n - 1])


@Builder('PvCrouchCountFingers')
def BuildCrouchCount(T, name):
    D = 3.0
    base = KneelBase(T)
    HoldUpright(T, base)
    sh = ShoulderL(T, kneel=True)
    up = sh + Vector((-.07, -.38, -.24))
    pole = sh + Vector((.45, .20, -.40))
    # the palm toward his face, fingers up
    fist = WorldL({'head': (.12, 0, .05)}, up, (-.1, -.1, 1), (-.2, .95, .1), 1.45, 1.45, pole)
    one = WorldL({}, up + Vector((0, 0, .02)), (-.1, -.1, 1), (-.2, .95, .1), 1.45, 0.0, pole)
    five = WorldL({}, up + Vector((.01, 0, .03)), (-.1, -.1, 1), (-.2, .95, .1), 0.05, 0.0, pole)
    base.update(fist)
    keys = [(0.0, {}), (.35, one), (.70, one), (1.05, five), (1.40, fist), (1.85, one), (2.20, five), (2.65, fist), (D, {})]
    anim = Anim(base, keys, {'head': .1}, periodic=True)

    def Pose(t):
        return T.Nest(Breathe(anim(t), t, 1.5))
    return KneelSpec(T, Pose, D, lambda n: [0, int(n * .2), int(n * .36)])


# =================================================================================
# prone on the lip
# =================================================================================
def GroundRifle(T):
    """Lying on the ground ahead of his right shoulder, muzzle forward, on its left side."""
    SX = T.SX
    return T.Rifle((-(SX + .08), -.62, R(T, .035)), (0.02, -1, 0))


@Builder('PvProneBeckonL')
def BuildProneBeckon(T, name):
    D = 1.6
    SX = T.SX
    local, pivot = RaProneLocal(T)
    local.update({'head': (0, 0, .55), 'neck': (.02, 0, .20)})
    rifle = GroundRifle(T)
    grip = Vector(rifle['gripR']) + Vector((0, 0, R(T, .03)))
    out = (SX + .30, -.90, R(T, .32))
    inn = (SX + .22, -.70, R(T, .40))
    hand = lambda w: tuple(Vector(out).lerp(Vector(inn), w))
    beckon = lambda t: Smooth(Clamp(.5 - .5 * math.cos(Tau * 2 * t / D)))

    def Pose(t):
        w = beckon(t)
        f = RaProneWorld(T, local, pivot, arch=.22)
        f['hand.L'] = hand(w)
        f['armPole.L'] = (SX + .45, -.45, -.35)
        f['palmF.L'] = tuple(Vector((.1, -.3, 1)).normalized())
        f['palmN.L'] = tuple(Vector((0, 1, .25 - .2 * w)).normalized())
        f['curl.L'] = .15 + .80 * w
        f['grip.R'] = tuple(grip)
        f['palmF.R'], f['palmN.R'], f['curl.R'] = Unit((.6, -.2, -.8)), (0, 0, -1), .7
        f['armPole.R'] = (-(SX + .70), -.20, -.30)
        return T.Nest(f)
    views = [('side', (-3.2, -.5, .6), (0, -.45, .2)), ('q', (-2.0, -2.8, 1.6), (0, -.45, .2)),
             ('front', (.6, -3.4, .7), (0, -.4, .25))]
    return {'pose': Pose, 'props': lambda t: {'weapon': T.Track(rifle, up=(1, 0, 0))}, 'plants': [],
            'reviewProps': lambda t: T.RifleProps(rifle), 'reviewViews': views, 'reviewScale': 2.6,
            'reviewFrames': lambda n: [0, int(n * .25)], 'check': lambda t: {'R': tuple(grip)}}


# =================================================================================
# V2: resting (not talking) where nobody is fighting
# =================================================================================
def RestKneelRifle(T):
    """Butt on the ground in front between the knees, leaning back toward the chest."""
    ky = T.K['kneelPelvisY']
    return T.RifleFromButt((-.06, ky - .36, .012), Unit((.03, .22, 1.0)))


@Builder('PvCrouchRestRifle')
def BuildCrouchRest(T, name):
    D = 4.0
    base = KneelBase(T)
    rifle = RestKneelRifle(T)
    kz = T.K['kneelPelvisZ']
    gR = T.Along(rifle, (kz + .24) * T.s)
    gL = T.Along(rifle, (kz + .36) * T.s)
    base.update({'handRel.L': None, 'handRel.R': None, 'bend': .16, 'head': (.16, 0, 0), 'neck': (.06, 0, 0),
                 'grip.R': gR, 'palmF.R': Unit((.9, -.35, .08)), 'palmN.R': Unit((.35, -.93, 0)), 'curl.R': 1.0,
                 'armPole.R': (-(T.SX + .45), .05, kz + .05),
                 'grip.L': gL, 'palmF.L': Unit((-.9, -.35, .08)), 'palmN.L': Unit((-.35, -.93, 0)), 'curl.L': .9,
                 'armPole.L': (T.SX + .45, .05, kz + .05)})
    h = base['head']
    keys = [(0.0, {}), (2.0, {'head': (h[0] + .05, 0, .04)}), (D, {})]
    anim = Anim(base, keys, {'head': .1}, periodic=True)

    def Pose(t):
        return T.Nest(Breathe(anim(t), t, 4.0, 1.2))
    return {'pose': Pose, 'props': lambda t: {'weapon': T.Track(rifle, up=(0, 1, 0))},
            'plants': [('L', 0, D)], 'kneePlants': [('R', 0, D)],
            'reviewProps': lambda t: T.RifleProps(rifle), 'reviewViews': KNEEL_VIEWS, 'reviewScale': 2.2,
            'reviewFrames': lambda n: [0, n // 2], 'check': lambda t: {'R': gR, 'L': gL}}


@Builder('PvSitRestRifle')
def BuildSitRest(T, name):
    D = 4.0
    base = _base['SitBase'](T)
    rifle = _base['SitRifle'](T)
    gL = T.Along(rifle, .50)
    base.update({'grip.L': gL, 'palmF.L': Unit((-.9, -.35, .08)), 'palmN.L': Unit((-.35, -.93, 0)), 'curl.L': .95,
                 'armPole.L': (T.SX + .50, -.05, .12), 'handRel.L': None, 'hand.L': gL,
                 'head': (.26, .02, -.04), 'neck': (.12, 0, 0)})
    h = base['head']
    keys = [(0.0, {}), (2.0, {'head': (h[0] + .06, h[1], h[2] + .03)}), (D, {})]
    anim = Anim(base, keys, {'head': .1}, periodic=True)

    def Pose(t):
        return T.Nest(Breathe(anim(t), t, 4.0, 1.0))
    return {'pose': Pose, 'props': lambda t: {'weapon': T.Track(rifle, up=(0, 1, 0))},
            'plants': [('L', 0, D), ('R', 0, D)], 'walls': _base['SIT_WALL'],
            'reviewProps': _base['SitReview'](T, rifle), 'reviewViews': _base['SIT_VIEWS'], 'reviewScale': 2.0,
            'reviewFrames': lambda n: [0, n // 2], 'check': lambda t: {'R': base['grip.R'], 'L': gL}}


def MakeClips(K):
    T = Toolkit(K)
    print('PREVIZ_TALK_MEASURES', K['modelId'], 'scale %.4f H %.3f A %.3f F %.3f S %.3f SX %.3f SZ %.3f P %.3f ARM %.3f'
          % (T.s, T.H, T.A, T.F, T.S, T.SX, T.SZ, T.P, T.ARM), flush=True)
    specs = {}
    for name in CLIPS:
        spec = BUILDERS[name](T, name)
        spec.setdefault('scale', K['scale'])
        spec.setdefault('modelId', K['modelId'])
        specs[name] = spec
    return specs
