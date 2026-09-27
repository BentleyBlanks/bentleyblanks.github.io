"""Clip library for the 06 casualty collection (docs/Data_CollectionCare20260927.md).

Same module contract as _import/Script_OpeningStoryboardClips.py (CLIPS / STAGES / PROPS /
CONTACT_POINTS / PARTNER_SOURCES / GHOST_BONES / BindCaptives / MakeClips), run by the opening
frame loop through _import/Script_CollectionCareBake.py. The pose toolkit (Toolkit, Anim, KneelFlat,
the world-axis tilt channels) is the opening library's own, loaded from it; nothing there changes.

Authoring space (as the opening library): Blender metres on the rig's source scale, +Z up, forward -Y,
the character's own left +X, ground z = 0, actor root at the origin. Runtime = source x scale; the
three.js actor frame is (-X, Z, Y) -- so a Blender point (x, y, z) is runtime (-x, z, y) x scale.

Tilt channels are WORLD-axis turns (Script_MachineGunCaptivesBake ApplyPose). On a man lying on his back
(pelvisTilt x = -1.5: the trunk laid back toward +Y, the head at +Y, the feet toward -Y):
  * bend (+x)   lifts the trunk off the ground (a crunch); negative arches the back;
  * lean (+y)   rolls the chest about the body's long axis (+ = his chest turns toward his left);
  * twist (+z)  swings the chest sideways over the ground;
  * head x      + lifts the head to look down the body, - presses it back; head y + rolls the face to his left.

The five clips (all loops but the wince):
  CareLieWrithe    alone on the straw, in pain: knee drawn up and dropped, back arching, rolling, clawing.
  CareLieTreated   lying still for a medic: the left leg straight (bandaged), the right knee up, the head
                   lifting to look at the leg, a flinch when the bandage is pulled.
  CareMedicBandage kneeling at a lying man's left side, wrapping his left thigh (the thigh runs across in
                   front of the medic, left to right); two wraps per loop.
  CareMedicPress   kneeling at a lying man's right side, both hands pressing a dressing onto his right
                   upper chest; one glance up over the shoulder per loop.
  CareZhouRecline  Zhou half-reclined against the collection's low wall, left leg out straight (the bandaged
                   leg), right knee up, hands on the knee and the thigh (Notion concept 06B).
  CareZhouWince    one-shot from the recline: moves, the leg pulls, he folds over it holding the thigh, and
                   lets out the breath back into the recline (frame 0 and the last frame are the recline's).
"""
import math, os, runpy
from pathlib import Path
from mathutils import Vector

_here = Path(os.environ['OPENING_PROJECT']) / '_import'
_base = runpy.run_path(str(_here / 'Script_OpeningStoryboardClips.py'), run_name='CollectionCareBase')
Toolkit, Anim, KneelFlat, Standing = _base['Toolkit'], _base['Anim'], _base['KneelFlat'], _base['Standing']
Clamp, Smooth, Unit, Add3 = _base['Clamp'], _base['Smooth'], _base['Unit'], _base['Add3']
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


def Meta(name, duration, loop, **extra):
    row = {'duration': duration, 'loop': loop, 'weaponHold': 'free'}
    row.update(extra)
    CLIPS[name] = row
    return name


def Builder(name):
    def Register(fn):
        BUILDERS[name] = fn
        return fn
    return Register


# ---------------------------------------------------------------------------------
# Pairing (RUNTIME metres, in the lying man's actor frame: +x his right, -z toward his feet).
# The director (Script_FirstLevelCollectionCare) puts the medic's root here; the medic's hand targets
# below are authored from the same numbers, so moving one means rebaking the other.
# ---------------------------------------------------------------------------------
# The thigh a medic wraps: the lying man's left thigh, 0.24 m toward the feet from the pelvis joint.
BANDAGE_ALONG_M = .24
# The medic kneels this far out on the man's left, facing him (his root yaw = the man's - 90 deg).
BANDAGE_OUT_M = .40
# The dressing a medic presses: the man's right upper chest, 0.34 m up the body from the pelvis joint.
PRESS_ALONG_M = .36
PRESS_OUT_M = .42
STAGES['bandage'] = {'anchor': 'patient', 'notes': 'CareMedicBandage kneels at CareLieTreated\'s left: medic root = '
                     'patient root + (-%.2f x, %.2f z) in the patient frame, yaw = patient yaw - 90 deg.' % (BANDAGE_OUT_M, -BANDAGE_ALONG_M),
                     'medic': {'x': -BANDAGE_OUT_M, 'z': -BANDAGE_ALONG_M, 'yawDeg': -90}}
STAGES['press'] = {'anchor': 'patient', 'notes': 'CareMedicPress kneels at CareLieTreated\'s right: medic root = '
                   'patient root + (%.2f x, %.2f z) in the patient frame, yaw = patient yaw + 90 deg.' % (PRESS_OUT_M, PRESS_ALONG_M),
                   'medic': {'x': PRESS_OUT_M, 'z': PRESS_ALONG_M, 'yawDeg': 90}}
# Zhou's recline: the wall face behind him is this far behind his root (runtime m; the director puts the
# root that far from CollectionLitterWall's north face).
RECLINE_WALL_M = .43
STAGES['recline'] = {'anchor': 'wall', 'notes': 'CareZhouRecline / CareZhouWince: the root %.2f m in front of the '
                     'wall face, his back to it.' % RECLINE_WALL_M, 'wallBehindM': RECLINE_WALL_M}

Meta('CareLieWrithe', 4.8, True, role='wounded',
     notes='Alone on the straw in pain: the right knee drawn up and dropped, back arching, rolling to his left and '
           'back, the right hand clutching the belly, the left clawing the straw. Loops seamlessly.')
Meta('CareLieTreated', 4.0, True, role='wounded',
     notes='Lying for a medic: left leg straight and still, right knee up, the head lifting to look at the leg, '
           'a flinch at 2.5 s (a pulled wrap). Pairs with CareMedicBandage / CareMedicPress (stages bandage / press).')
Meta('CareMedicBandage', 4.0, True, role='medic',
     notes='Kneels at the lying man\'s left, wraps his left thigh: two wraps per loop, the right hand carrying the '
           'roll round the limb, the left holding the turns, a tug at the top of each wrap.')
Meta('CareMedicPress', 3.2, True, role='medic',
     notes='Kneels at the lying man\'s right, both hands pressing a dressing onto his right upper chest, the weight '
           'rocking onto the hands; glances up over his right shoulder once a loop.')
Meta('CareZhouRecline', 5.0, True, role='zhou',
     notes='Zhou half-reclined against the low wall: left leg out straight (bandaged), right knee up, right forearm '
           'over the knee, left hand on the thigh. Head neutral: the speaker head layer turns it at runtime.')
Meta('CareZhouWince', 2.4, False, role='zhou', next=['CareZhouRecline'],
     notes='BorrowLight "wince": the leg pulls, he folds forward over it with both hands on the thigh, holds, and '
           'breathes back out into the recline (last frame = CareZhouRecline frame 0).')


def R(T, v):
    """Runtime metres -> this rig's source metres."""
    return tuple(c / T.s for c in v) if isinstance(v, (tuple, list)) else v / T.s


# =================================================================================
# lying on the back
# =================================================================================
def LieBase(T, rightKnee=0.0):
    """Supine on the straw. rightKnee 0 = both legs out, 1 = the right knee up, sole flat."""
    H, A, SX = T.H, T.A, T.SX
    reach = (T.F + T.S) * .97
    f = T.Stand()
    f.update({
        'pelvis': (0, 0, .12), 'pelvisTilt': (-1.50, 0, 0),
        'bend': .05, 'lean': 0.0, 'twist': 0.0, 'shrug': .04,
        'neck': (.16, 0, 0), 'head': (.08, 0, 0),
        # Legs: straight out, heels on the straw, toes up and falling outward.
        'ankle.L': (H + .05, -reach, .075), 'legPole.L': (H + .10, -.45, 1.2), 'foot.L': (-70, 14, 0),
        'ankle.R': (-(H + .05), -reach, .075), 'legPole.R': (-(H + .10), -.45, 1.2), 'foot.R': (-70, -14, 0),
        # Arms: the right hand on the straw beside the hip, the left over the belly.
        'hand.R': (-(SX + .16), .12, .045), 'armPole.R': (-(SX + .55), .40, .05),
        'palmF.R': Unit((-.15, -1, 0)), 'palmN.R': (0, 0, -1), 'curl.R': .45,
        'hand.L': (.06, .10, .27), 'armPole.L': (SX + .50, .30, .30),
        'palmF.L': Unit((-.8, -.4, -.2)), 'palmN.L': (0, 0, -1), 'curl.L': .35,
    })
    if rightKnee:
        KneeUp(T, f, 'R', rightKnee)
    return f


def KneeUp(T, f, side, w, y=-.46, out=.05):
    """Draw one knee up (w 0..1): the sole slides in flat on the straw toward the seat."""
    H, A = T.H, T.A
    sign = 1 if side == 'L' else -1
    reach = (T.F + T.S) * .97
    f['ankle.' + side] = (sign * (H + out + .03 * w), -reach + (reach + y) * w, .075 + (A - .075) * w)
    f['legPole.' + side] = (sign * (H + .10 + .12 * w), -.45, 1.2)
    base = -70 if side == 'L' else -70
    f['foot.' + side] = (base * (1 - w), sign * 14 * (1 - w) + sign * -6 * w, 0)
    return f


def Breathe(f, t, period, amount=1.0, chest=.020):
    b = math.sin(Tau * t / period) * amount
    f['bend'] += chest * b
    f['shrug'] += .03 * b
    return f


def LieReview(T, extra=None):
    def Props(t):
        rows = [('box', (0, .15, -.01), (.9, 2.0, .02), 0)]      # the straw mat
        return rows + (extra(t) if extra else [])
    return Props


LIE_VIEWS = [('side', (-3.2, -.10, .75), (0, -.10, .15)), ('q', (-2.0, -2.4, 1.7), (0, -.10, .15)),
             ('top', (0, -.10, 3.2), (0, -.09, 0))]


@Builder('CareLieWrithe')
def BuildLieWrithe(T, name):
    base = LieBase(T, rightKnee=.35)
    SX = T.SX
    b = dict(base)
    h, n = b['head'], b['neck']
    reach = (T.F + T.S) * .97
    # The right hand pressed into the belly, fingers dug in; the left clawing the straw out to the side.
    clutch = {'hand.R': (-.04, .12, .27), 'armPole.R': (-(SX + .45), .35, .35), 'palmF.R': Unit((.8, -.4, -.3)),
              'palmN.R': (0, 0, -1), 'curl.R': .85}
    claw = {'hand.L': (SX + .30, .25, .05), 'armPole.L': (SX + .60, .45, .10), 'palmF.L': Unit((.3, -1, -.2)),
            'palmN.L': (0, 0, -1), 'curl.L': .55}
    b.update(clutch)
    b.update(claw)
    kneeHigh = KneeUp(T, dict(b), 'R', 1.0, y=-.34)
    kneeMid = KneeUp(T, dict(b), 'R', .55)
    legBentL = KneeUp(T, dict(b), 'L', .45)
    keys = [
        (0.00, {}),
        # The spasm: the right knee comes up hard, the back arches, the head presses back, the left hand grabs.
        (0.55, {k: kneeHigh[k] for k in ('ankle.R', 'legPole.R', 'foot.R')}),
        (0.80, {'bend': -.10, 'pelvis': (0, 0, .15), 'neck': (n[0] - .20, 0, 0), 'head': (h[0] - .22, -.10, 0),
                'curl.L': .95, 'hand.L': (SX + .26, .22, .045), 'shrug': .12,
                **{k: legBentL[k] for k in ('ankle.L', 'legPole.L', 'foot.L')}}),
        (1.25, {'bend': -.06, 'head': (h[0] - .12, .12, 0)}),
        # Rolls toward his left, the raised knee falling across; the face turns away.
        (1.90, {'bend': .10, 'lean': .30, 'twist': .06, 'pelvisTilt': (-1.50, .22, 0), 'neck': (n[0] + .05, 0, 0),
                'head': (h[0] + .05, .45, 0), 'curl.L': .70, 'hand.L': (SX + .34, .30, .05),
                'ankle.R': (T.H * .2, -.50, .20), 'legPole.R': (T.H + .60, -.40, .80)}),
        (2.60, {'lean': .24, 'head': (h[0] + .10, .38, 0)}),
        # ...and back, the knee coming up again with a groan (head lifts to look at the belly).
        (3.20, {'bend': .16, 'lean': .02, 'twist': 0.0, 'pelvisTilt': base['pelvisTilt'], 'neck': (n[0] + .12, 0, 0),
                'head': (h[0] + .25, -.05, 0), 'pelvis': (0, 0, .12),
                **{k: kneeMid[k] for k in ('ankle.R', 'legPole.R', 'foot.R')},
                **{k: base[k] for k in ('ankle.L', 'legPole.L', 'foot.L')}}),
        (3.80, {'bend': .06, 'head': (h[0] + .05, .06, 0), 'neck': n, 'curl.L': .55, 'hand.L': claw['hand.L']}),
        (4.80, dict(b)),       # a loop: every channel back to frame 0 (Anim carries the last key forward)
    ]
    anim = Anim(b, keys, {'head': .06, 'neck': .03}, periodic=True)
    # The loop's first key is the base with the knee a third up: keep the knee channel ending there.

    def Pose(t):
        f = anim(t)
        Breathe(f, t, 1.2, 1.0, chest=.03)       # fast shallow breaths
        # A tremor in the clutching hand and the jaw of the head.
        tremor = math.sin(Tau * t * 5.0) * .006
        p = f['hand.R']
        f['hand.R'] = (p[0], p[1], p[2] + tremor)
        return T.Nest(f)
    return {'pose': Pose, 'reviewProps': LieReview(T), 'reviewViews': LIE_VIEWS, 'reviewScale': 2.4,
            'reviewFrames': lambda n: [0, int(n * .17), int(n * .40), int(n * .67), int(n * .8)]}


def TreatedBase(T):
    f = LieBase(T, rightKnee=1.0)
    SX = T.SX
    # Both hands on the belly (a medic kneels at either side of him), the head a little up on the neck.
    f.update({'hand.R': (-.10, .03, .25), 'armPole.R': (-(SX + .50), .30, .30), 'palmF.R': Unit((.8, -.4, -.2)),
              'palmN.R': (0, 0, -1), 'curl.R': .55,
              'hand.L': (.08, .08, .26), 'curl.L': .45, 'neck': (.20, 0, 0), 'head': (.10, 0, 0)})
    return f


@Builder('CareLieTreated')
def BuildLieTreated(T, name):
    base = TreatedBase(T)
    h, n = base['head'], base['neck']
    keys = [
        (0.00, {}),
        # Lifts the head to look down at the leg being wrapped.
        (0.70, {'neck': (n[0] + .18, 0, 0), 'head': (h[0] + .22, .10, 0), 'bend': base['bend'] + .06}),
        (1.60, {'neck': (n[0] + .16, 0, 0), 'head': (h[0] + .18, .12, 0)}),
        (2.20, {'neck': n, 'head': (h[0], -.04, 0), 'bend': base['bend']}),
        # The wrap is pulled: flinch -- the back arches a little, the head presses back, the hand grabs.
        (2.45, {'bend': base['bend'] - .07, 'neck': (n[0] - .12, 0, 0), 'head': (h[0] - .18, -.08, 0), 'curl.R': .95,
                'curl.L': .80, 'shrug': .12}),
        (2.90, {'bend': base['bend'] - .02, 'head': (h[0] - .06, -.10, 0), 'curl.R': .75, 'shrug': .06}),
        (3.50, {'bend': base['bend'], 'neck': n, 'head': h, 'curl.R': base['curl.R'], 'curl.L': base['curl.L'],
                'shrug': base['shrug']}),
        (4.00, {}),
    ]
    anim = Anim(base, keys, {'head': .06, 'neck': .03}, periodic=True)

    def Pose(t):
        f = anim(t)
        Breathe(f, t, 2.0, 1.0, chest=.022)
        # The raised knee sways a little.
        sway = math.sin(Tau * t / 4.0) * .03
        a = f['ankle.R']
        f['legPole.R'] = (f['legPole.R'][0] + sway * 4, f['legPole.R'][1], f['legPole.R'][2])
        f['ankle.R'] = a
        return T.Nest(f)
    return {'pose': Pose, 'reviewProps': LieReview(T), 'reviewViews': LIE_VIEWS, 'reviewScale': 2.4,
            'reviewFrames': lambda n: [0, int(n * .25), int(n * .62), int(n * .8)]}


# =================================================================================
# medics (kneeling, the lying man in front of the knees)
# =================================================================================
def MedicKneel(T, sit=.40, bend=.62, forward=.06, tilt=.30):
    """Both knees down, the seat part way back to the heels, the trunk folded over the man in front.
    The hands are world targets (T.Stand, not the torso-frame free arms of Standing)."""
    f = T.Stand()
    f.update(KneelFlat(T, sit=sit))
    p = f['pelvis']
    f.update({'pelvis': (p[0], p[1] - forward, p[2]), 'bend': bend, 'pelvisTilt': (tilt, 0, 0),
              'neck': (-.10, 0, 0), 'head': (-.05, 0, 0), 'shrug': .04})
    return f


# The kneeling reach: the seat may slide 12 cm over the knees and the trunk fold 0.3 rad more before an arm
# straightens (the opening bake's reach assist, Script_OpeningStoryboardBake Solve).
MEDIC_REACH = {'fraction': .86, 'travel': .12, 'bend': .30}


def PatientLimb(T, along, out, up):
    """A point of the lying man in the kneeling medic's frame (source m). `along` runtime metres up the man's
    body from his pelvis joint (toward his head), `out` the medic's distance out from the man's centre line,
    `up` height over the ground."""
    return R(T, (0.0, -out, up)), along


@Builder('CareMedicBandage')
def BuildMedicBandage(T, name):
    SX = T.SX
    base = MedicKneel(T, sit=.70, bend=.95, forward=0.0, tilt=.45)
    # The man's left thigh runs across in front of the medic along +X/-X. The medic kneels at the man's left
    # with the man's feet on the medic's LEFT (+X) and the head on his right: the limb axis is +X.
    centre = Vector(R(T, (0.0, -(BANDAGE_OUT_M - .10), .10)))     # thigh axis: 0.10 m in from the man's centre line
    radius = R(T, .085)
    wrap = 2.0                                                      # seconds per turn

    def Hand(t):
        """The roll hand orbits the thigh in the Y-Z plane (over the top, down the far side, back up the near
        side; under the limb is the straw and, on the near side, his own chest, so the orbit flattens at the
        limb's mid height), creeping along the limb."""
        a = Tau * t / wrap
        y = centre.y - math.sin(a) * radius * 1.05 + R(T, .02)
        z = centre.z + math.cos(a) * radius * 1.4
        z = max(z, R(T, .11))
        x = centre.x + R(T, .06) * math.sin(Tau * t / 4.0)
        return (x - R(T, .03), y, z), a

    def Pose(t):
        f = dict(base)
        (hx, hy, hz), a = Hand(t)
        f['hand.R'] = (hx, hy, hz)
        f['armPole.R'] = (-(SX + .45), .15, .25)
        # The palm faces the limb; the fingers run round it (the roll is wrapped in them).
        n = Vector((0, centre.y - hy, centre.z - hz))
        n = n.normalized() if n.length > 1e-6 else Vector((0, -1, 0))
        f['palmN.R'] = tuple(n)
        f['palmF.R'] = Unit((.35, math.cos(a) * -.9, -math.sin(a) * .9))
        f['curl.R'] = .80
        # The left hand holds the turns on top of the thigh a hand's width to the left, and pulls at the top.
        tug = Smooth(Clamp(math.cos(Tau * t / wrap) * 2 - 1))
        f['hand.L'] = (centre.x + R(T, .11), centre.y + R(T, .02) + R(T, .025) * tug, centre.z + radius + R(T, .02))
        f['armPole.L'] = (SX + .45, .15, .25)
        f['palmF.L'] = Unit((-.3, -.9, -.3))
        f['palmN.L'] = (0, .15, -1)
        f['curl.L'] = .55
        # The body works with the hands: leans into the far side of the wrap and pulls back with the tug.
        f['bend'] = base['bend'] + .05 * math.sin(a) - .04 * tug
        f['twist'] = -.05 * math.sin(Tau * t / 4.0)
        f['lean'] = .03 * math.sin(a)
        f['look'] = (centre.x, centre.y, centre.z)
        f['lookW'] = .5
        return T.Nest(f)

    def Review(t):
        c = centre
        return [('box', (0, -.45, -.01), (2.0, .9, .02), 0),
                ('cyl', (c.x - .30, c.y, c.z), (c.x + .30, c.y, c.z), radius)]
    return {'pose': Pose, 'plants': [('L', 0, 4.0), ('R', 0, 4.0)], 'reviewProps': Review, 'reach': MEDIC_REACH,
            'reviewViews': [('side', (-3.2, -.40, .80), (0, -.35, .40)), ('q', (-2.1, -2.8, 1.7), (0, -.35, .35)),
                            ('front', (.3, -3.0, .9), (0, -.35, .35))],
            'reviewFrames': lambda n: [0, int(n * .125), int(n * .25), int(n * .375)], 'reviewScale': 2.0,
            'check': lambda t: {'R': Hand(t)[0]}}


@Builder('CareMedicPress')
def BuildMedicPress(T, name):
    SX = T.SX
    base = MedicKneel(T, sit=.70, bend=.80, forward=0.0, tilt=.38)
    # The dressing on the man's right upper chest: in the medic's frame straight ahead, chest height.
    spot = Vector(R(T, (0.0, -(PRESS_OUT_M - .12), .22)))
    keys = [
        (0.00, {}),
        (0.40, {'bend': base['bend'] + .08, 'pelvis': Add3(base['pelvis'], (0, -.03, .02)), 'push': 1.0}),
        (1.00, {'bend': base['bend'], 'pelvis': base['pelvis'], 'push': 0.0}),
        (1.35, {'bend': base['bend'] + .07, 'pelvis': Add3(base['pelvis'], (0, -.025, .015)), 'push': .8}),
        # Looks up over his right shoulder (calling for a stretcher), still pressing.
        (1.80, {'head': (-.05, 0, -.55), 'neck': (.02, 0, -.20), 'twist': -.08, 'push': .4}),
        (2.45, {'head': (-.02, 0, -.50), 'neck': (.02, 0, -.18)}),
        (2.85, {'head': base['head'], 'neck': base['neck'], 'twist': 0.0, 'push': 0.0}),
        (3.20, dict(base, push=0.0)),
    ]
    anim = Anim(dict(base, push=0.0), keys, {'head': .06, 'neck': .03}, periodic=True)

    def Pose(t):
        f = anim(t)
        push = f.pop('push')
        down = R(T, .02) * push
        # Wrist targets: the palm centres sit on the dressing, the wrists a palm's length back toward the medic.
        back = Vector(R(T, (0, .07, .03)))
        f['hand.R'] = tuple(Vector((spot.x - R(T, .01), spot.y, spot.z - down)) + back)
        f['hand.L'] = tuple(Vector((spot.x + R(T, .015), spot.y + R(T, .02), spot.z + R(T, .035) - down)) + back)
        f['armPole.R'] = (-(SX + .40), .25, .30)
        f['armPole.L'] = (SX + .40, .25, .30)
        # Heel of the hand down, fingers toward the man's far side; the left palm on the back of the right hand.
        f['palmF.R'] = Unit((.45, -.85, -.25))
        f['palmN.R'] = (0, 0, -1)
        f['palmF.L'] = Unit((-.35, -.85, -.25))
        f['palmN.L'] = (0, 0, -1)
        f['curl.R'] = .25
        f['curl.L'] = .45
        Breathe(f, t, 3.2, .6)
        return T.Nest(f)

    def Review(t):
        return [('box', (0, -.45, -.01), (.9, 2.0, .02), 0), ('point', tuple(spot), None, .05)]
    return {'pose': Pose, 'plants': [('L', 0, 3.2), ('R', 0, 3.2)], 'reviewProps': Review, 'reach': MEDIC_REACH,
            'reviewViews': [('side', (-3.2, -.40, .80), (0, -.35, .40)), ('q', (-2.1, -2.8, 1.7), (0, -.35, .35))],
            'reviewFrames': lambda n: [0, int(n * .125), int(n * .65)], 'reviewScale': 2.0,
            'check': lambda t: {'R': tuple(spot)}}


# =================================================================================
# Zhou against the wall
# =================================================================================
def ReclineBase(T):
    H, A, SX = T.H, T.A, T.SX
    reach = (T.F + T.S) * .96
    f = T.Stand()
    f.update({
        # Seat on the ground, trunk laid back on the wall behind (about 35 deg off the vertical).
        'pelvis': (0, .06, .12), 'pelvisTilt': (-.62, 0, .03),
        'bend': .20, 'lean': .03, 'twist': -.04, 'shrug': .05,
        'neck': (.16, 0, 0), 'head': (.18, 0, 0),
        # Left (wounded) leg out straight, toes up and falling out; right knee up, sole flat.
        'ankle.L': (H + .07, .06 - reach, .075), 'legPole.L': (H + .12, -.40, 1.2), 'foot.L': (-62, 12, 0),
        'ankle.R': (-(H + .04), -.40, A), 'legPole.R': (-(H + .26), -.40, 1.2), 'foot.R': (0, -10, 0),
        # Right forearm over the raised knee, the hand hanging; left hand on the thigh above the bandage.
        'hand.R': (-(H + .02), -.42, .50), 'armPole.R': (-(SX + .45), .10, .30),
        'palmF.R': Unit((.2, -.5, -.85)), 'palmN.R': Unit((.3, .2, -1)), 'curl.R': .50,
        'hand.L': (H + .12, -.18, .20), 'armPole.L': (SX + .45, .25, .20),
        'palmF.L': Unit((-.10, -1, -.15)), 'palmN.L': (0, 0, -1), 'curl.L': .40,
    })
    return f


def ReclineWalls(T):
    return [((0, R(T, RECLINE_WALL_M), 0), (0, -1, 0))]


RECLINE_VIEWS = [('side', (-3.2, -.25, .75), (0, -.20, .40)), ('q', (-2.1, -2.8, 1.6), (0, -.20, .40)),
                 ('front', (.1, -3.0, .9), (0, -.1, .45))]


def ReclineReview(T):
    return lambda t: [('box', (0, R(T, RECLINE_WALL_M) + .35, .55), (2.0, .70, 1.1), 0)]


@Builder('CareZhouRecline')
def BuildZhouRecline(T, name):
    base = ReclineBase(T)
    h = base['head']
    keys = [
        (0.00, {}),
        # Shifts his weight once a loop: the head settles against the wall and comes back.
        (1.80, {'head': (h[0] - .08, .05, .06), 'lean': .06, 'hand.L': Add3(base['hand.L'], (0, .03, 0))}),
        (3.20, {'head': (h[0] - .02, -.02, -.03), 'lean': .01}),
        (5.00, dict(base)),
    ]
    anim = Anim(base, keys, {'head': .08}, periodic=True)

    def Pose(t):
        f = anim(t)
        Breathe(f, t, 2.5, 1.0, chest=.018)
        return T.Nest(f)
    return {'pose': Pose, 'plants': [('R', 0, 5.0)], 'walls': ReclineWalls(T), 'reviewProps': ReclineReview(T),
            'reviewViews': RECLINE_VIEWS, 'reviewScale': 2.0,
            'reviewFrames': lambda n: [0, int(n * .36)]}


@Builder('CareZhouWince')
def BuildZhouWince(T, name):
    base = ReclineBase(T)
    H, SX = T.H, T.SX
    h, n = base['head'], base['neck']
    fold = {'bend': .52, 'pelvisTilt': (-.40, 0, .03), 'neck': (n[0] + .12, 0, 0), 'head': (h[0] + .30, -.06, 0),
            'shrug': .14,
            # Both hands to the left thigh above the wound; the right reaches across.
            'hand.L': (H + .12, -.26, .21), 'armPole.L': (SX + .50, .05, .30), 'curl.L': .85,
            'palmF.L': Unit((-.2, -.3, -.9)), 'palmN.L': Unit((-.6, 0, -.8)),
            'hand.R': (H - .04, -.32, .23), 'armPole.R': (-(SX + .30), -.20, .45), 'curl.R': .85,
            'palmF.R': Unit((.3, -.3, -.9)), 'palmN.R': Unit((.6, 0, -.8))}
    keys = [
        (0.00, {}),
        (0.18, {'head': (h[0] - .10, 0, 0), 'bend': base['bend'] - .04, 'shrug': .10}),     # the jolt
        (0.55, fold),
        (1.30, {'head': (h[0] + .34, -.02, 0), 'bend': .55}),                              # holds, jaw set
        (1.75, {'bend': .40, 'head': (h[0] + .15, 0, 0), 'shrug': .02}),                   # breath out
        (2.40, {k: base[k] for k in fold}),
    ]
    anim = Anim(base, keys, {'head': .06, 'neck': .03, 'hand': .04})

    def Pose(t):
        f = anim(t)
        shake = math.sin(Tau * t * 7) * .005 * Smooth(Clamp((t - .5) / .2)) * (1 - Smooth(Clamp((t - 1.4) / .3)))
        for s in LR:
            p = f['hand.' + s]
            f['hand.' + s] = (p[0], p[1], p[2] + shake)
        return T.Nest(f)
    return {'pose': Pose, 'plants': [('R', 0, 2.4)], 'walls': ReclineWalls(T), 'reviewProps': ReclineReview(T),
            'reviewViews': RECLINE_VIEWS, 'reviewScale': 2.0,
            'reviewFrames': lambda n: [0, int(n * .25), int(n * .55), n - 1]}


def MakeClips(K):
    T = Toolkit(K)
    print('CARE_MEASURES', K['modelId'], 'scale %.4f H %.3f A %.3f F %.3f S %.3f SX %.3f SZ %.3f P %.3f'
          % (T.s, T.H, T.A, T.F, T.S, T.SX, T.SZ, T.P), flush=True)
    specs = {}
    for name in CLIPS:
        spec = BUILDERS[name](T, name)
        spec.setdefault('scale', K['scale'])
        spec.setdefault('modelId', K['modelId'])
        specs[name] = spec
    return specs
