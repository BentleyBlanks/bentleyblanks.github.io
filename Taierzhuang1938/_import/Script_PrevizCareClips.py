"""Placeholder clips for the FirstLevel0105 blockout previz (01-02): the wounded Donggua, bandaging, the
single blanket he is dragged on, and the litter at the 02 collection point.

Same module contract as _import/Script_OpeningStoryboardClips.py (CLIPS / STAGES / PROPS / CONTACT_POINTS /
PARTNER_SOURCES / GHOST_BONES / BindCaptives / MakeClips), run by the opening frame loop through
_import/Script_PrevizCareBake.py. The pose toolkit is the opening library's own and the lying / kneeling bases are
the 06 collection library's (_import/Script_CollectionCareClips.py), both loaded with runpy; neither file changes.

Authoring space (as the opening library): Blender metres on the rig's source scale, +Z up, forward -Y, the
character's own left +X, ground z = 0, actor root at the origin. Runtime = source x scale; the three.js actor
frame is (-X, Z, Y) -- a Blender point (x, y, z) is runtime (-x, z, y) x scale.

Placeholder grade: blockout previz, one reference body (TengxianNra02; every NRA body shares the skeleton).
The pairing numbers the previz director needs are in STAGES (runtime metres, the actor's three.js frame).
"""
import math, os, runpy
from pathlib import Path
from mathutils import Vector

_here = Path(os.environ['OPENING_PROJECT']) / '_import'
_care = runpy.run_path(str(_here / 'Script_CollectionCareClips.py'), run_name='PrevizCareBase')
_base = _care['_base']
Toolkit, Anim, KneelFlat, Standing = _base['Toolkit'], _base['Anim'], _base['KneelFlat'], _base['Standing']
Clamp, Smooth, Unit, Add3, Lerp3 = _base['Clamp'], _base['Smooth'], _base['Unit'], _base['Add3'], _base['Lerp3']
Channel, SlungRifle, BodyFrame, _Rot = _base['Channel'], _base['SlungRifle'], _base['BodyFrame'], _base['_Rot']
SitBase = _base['SitBase']
LieBase, KneeUp, Breathe, MedicKneel = _care['LieBase'], _care['KneeUp'], _care['Breathe'], _care['MedicKneel']
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
    """No legacy clips here."""


def Meta(name, duration, loop, **extra):
    row = {'duration': duration, 'loop': loop, 'weaponHold': 'free', 'rig': 'TengxianNra02', 'rootMotion': False,
           'placeholder': '20261019 FirstLevel0105 previz'}
    row.update(extra)
    CLIPS[name] = row
    return name


def Builder(name):
    def Register(fn):
        BUILDERS[name] = fn
        return fn
    return Register


def R(T, v):
    """Runtime metres -> this rig's source metres."""
    return tuple(c / T.s for c in v) if isinstance(v, (tuple, list)) else v / T.s


# =================================================================================
# Pairing / placement numbers (RUNTIME metres in the actor's three.js frame: +x his right, -z his front).
# =================================================================================
# Seated against the dugout wall (the opening's SitBase): the wall plane 0.385 source m behind the root.
SIT_WALL_M = .385
# The rifle leans on the wall at his LEFT (wounded) side, butt in the dirt; the pack sits at his right hip.
SIT_RIFLE_BUTT = (.50, .06, .012)        # source m: left of the hip, a hand in front of the wall
SIT_PACK = (-.36, -.02, .0)              # source m: centre of the pack's footprint at his right
SIT_PACK_SIZE = (.30, .22, .30)
# PvSitGrabHand: the wrist he clamps (the player crouched in front of him, his hands at his own pack).
GRAB_WRIST = (-.12, -.42, .50)          # source m
# PvLieGrabSleeve: the sleeve of the man crouched at his RIGHT side (forearm over the blanket edge).
SLEEVE = (-.44, .28, .54)               # source m, the lying man's frame (head +Y)
# Blanket drag (two men side by side, facing forward, the blanket behind them). Each holds the OUTER corner.
DRAG_SPEED_MPS = .8                     # referenceSpeedMps of the in-place loop (a laboured drag; the stride fits the legs)
DRAG_CYCLE_S = 1.2
DRAG_HAND = (.28, .14, .62)             # runtime m, the LEFT man's corner-fist AIM (the straight arm points here; see stage)
DRAG_HALF_M = .55                        # previz PULL.half: each man 0.55 m off the blanket's centre line
# Litter pole in front of the crouching bearer (PvCrouchGripLitter), parallel to his shoulders.
LITTER_POLE = (.0, -.40, .13)            # source m: pole axis centre
LITTER_HANDS_HALF = .24                  # source m: each hand this far either side of his centre line

# Where the fist actually is in the bake (the arm is straight; the aim above is out of reach on purpose), runtime m:
# 0.26 outboard of the root, 0.04 behind it, 0.74-0.80 up (hip height) -- a knee-high fist needs a deeper crouch than a
# walk allows (the shoulder-to-wrist length is 0.46 m runtime).
DRAG_FIST = (.26, .04, .77)
STAGES['blanketDrag'] = {
    'anchor': 'blanket', 'notes': (
        'PvBlanketDragL (left man, He Youtian) and PvBlanketDragR (right man) side by side, both facing the drag '
        'direction, same phase (they step together), referenceSpeedMps %.1f: roots %.2f m either side of the blanket '
        'centre line (1.10 m apart, = previz PULL.half). Each fist holds the OUTER head corner %.2f m outboard of his '
        'own root, %.2f m behind it, %.2f m up (hip height, the arm straight back-down); the cloth falls from the fist '
        'to the ground about 0.5 m further back. So the blanket is 1.6 m wide (2 x (0.55 + 0.26); for a 1.5 m single '
        'quilt use PULL.half 0.50), its head edge lies on the ground about 0.55 m behind the roots and its centre about '
        '1.55 m behind them (2.0 m long) -- previz PULL.toCenter 1.6 fits.'
        % (DRAG_SPEED_MPS, DRAG_HALF_M, DRAG_FIST[0], DRAG_FIST[1], DRAG_FIST[2])),
    'actors': {'left': {'clip': 'PvBlanketDragL', 'x': -DRAG_HALF_M, 'z': 0.0, 'yawDeg': 0},
               'right': {'clip': 'PvBlanketDragR', 'x': DRAG_HALF_M, 'z': 0.0, 'yawDeg': 0}},
    'fistM': {'outboard': DRAG_FIST[0], 'behind': DRAG_FIST[1], 'height': DRAG_FIST[2]},
    'blanketM': {'width': 1.6, 'length': 2.0, 'headEdgeBehind': .55, 'centreBehind': 1.55}}
STAGES['sitWall'] = {'anchor': 'wall', 'wallBehindM': SIT_WALL_M,
                     'notes': 'PvSitOfferArm / PvSitStuffPack / PvSitGrabHand: the root %.3f m in front of the dugout wall, '
                              'his back to it (as WoundedSitRifleIdle). The rifle leans on the wall at his left '
                              '(weapon track); the pack (review box) at his right hip.' % SIT_WALL_M}
STAGES['litterSide'] = {'anchor': 'litter', 'notes': 'PvCrouchGripLitter: the root 0.40 m from the near pole axis, '
                        'facing it (the pole runs across his front at 0.13 m height, his hands 0.48 m apart on it).'}

# =================================================================================
# static metadata (manifest)
# =================================================================================
Meta('PvSitOfferArm', 2.0, False, role='donggua', props=['weapon'], holdLoop=[.8, 2.0],
     holdExit='pose.holdUntil lets it go; the clip ends on the held pose (play WoundedSitRifleIdle-like sit after).',
     notes='01 dugout: Donggua sits against the wall and holds his wounded left arm out to be bandaged, the right hand '
           'under the left elbow, the face turned away to his right (wincing). Settled at 0.8 s; 0.8-2.0 s is a '
           'breathing hold loop. Rifle leaning on the wall at his left (weapon track, not in his hands).')
Meta('PvSitStuffPack', 3.0, True, role='donggua', props=['weapon'],
     notes='01-3: seated against the wall, the right hand stuffing things into the pack at his right hip (two pushes '
           'a loop, the second with a frustrated shove), the left arm limp in the lap. Rifle leaning at his left.')
Meta('PvSitGrabHand', 2.5, False, role='donggua', props=['weapon'], holdLoop=[1.0, 2.5],
     contacts=[{'t': .62, 'limb': 'handR', 'action': 'grip', 'partnerRole': 'shunzi', 'part': 'wrist',
                'point': 'GRAB_WRIST runtime (%.2f, %.2f, %.2f)' % (-GRAB_WRIST[0], GRAB_WRIST[2], GRAB_WRIST[1])}],
     notes='01-3: seated, the right hand shoots forward and clamps the wrist of the man crouched in front (0.62 s), '
           'holds on; the head comes up to his face. Held from 1.0 s (breathing hold loop 1.0-2.5 s).')
Meta('PvLieGrabSleeve', 3.0, False, role='donggua', holdLoop=[.8, 2.2],
     holdExit='pose.holdUntil: plays the 2.2-3.0 s release (the hand lets go and drops onto the blanket).',
     contacts=[{'t': .8, 'limb': 'handR', 'action': 'grip', 'part': 'sleeve',
                'point': 'SLEEVE runtime (%.2f, %.2f, %.2f)' % (-SLEEVE[0], SLEEVE[2], SLEEVE[1])},
               {'t': 2.2, 'limb': 'handR', 'action': 'release'}],
     notes='02-3: lying on his back on the blanket, the right hand comes up and fists the sleeve of the man crouched '
           'at his right (0.8 s), holds (0.8-2.2 s, hold loop, a tremor in the fist), lets go and the arm drops back '
           'onto the blanket (2.2-3.0 s). The head turns to that man.')
Meta('PvKneelDig', 2.0, True, role='rescuer', slungRifle=True,
     notes='02-1: kneeling, both hands clawing the earth in front and flinging it out to the sides, alternating '
           '(two scoops per hand a loop). Rifle on the back (runtime slung list).')
Meta('PvKneelPullBlanket', 3.0, False, role='rescuer', slungRifle=True,
     events=[{'t': .55, 'kind': 'packOpen'}, {'t': 1.0, 'kind': 'blanketOut'}, {'t': 1.75, 'kind': 'blanketShake'},
             {'t': 2.55, 'kind': 'blanketDown'}],
     notes='02-3: kneeling, a pack on the ground at his right knee: flips it open, pulls out a folded single blanket, shakes '
           'it open forward and lays it flat on the ground in front (blanketDown 2.55 s; the blanket lies 0.41-1.32 m in '
           'front of the root). Rifle on the back.')
Meta('PvKneelHaulBody', 2.5, True, role='rescuer', slungRifle=True,
     notes='02-3: kneeling, both fists in the shoulder cloth of the man lying in front (head toward the kneeler) and '
           'hauling him toward the knees, a heave a loop (grab 0.25 s, haul 0.45-1.25 s, reach again). Rifle on the back.')
Meta('PvBlanketDragL', DRAG_CYCLE_S, True, role='dragger', slungRifle=True, referenceSpeedMps=DRAG_SPEED_MPS,
     notes='02-3..02-7: the LEFT man of the two dragging Donggua on the blanket: walks forward leaning into it, the '
           'LEFT fist behind and low at his outer side gripping the blanket corner (stage blanketDrag), the right arm '
           'pumping. In place (root fixed), two steps a loop; referenceSpeedMps %.1f. Rifle on the back.' % DRAG_SPEED_MPS)
Meta('PvBlanketDragR', DRAG_CYCLE_S, True, role='dragger', slungRifle=True, referenceSpeedMps=DRAG_SPEED_MPS,
     notes='Mirror of PvBlanketDragL for the RIGHT man: the RIGHT fist on the outer corner. Same phase as the left one.')
Meta('PvBlanketReleaseTurn', 2.0, False, role='dragger', props=['weapon'], prev=['PvBlanketDragL'],
     weaponState='back->twoHand', endHold='twoHand', holdLoop=[1.85, 2.0],
     notes='02-4..02-6: from PvBlanketDragL frame 0 the left fist lets go of the corner, he turns about 170 deg to '
           'his LEFT (away from the blanket) in three steps and drops to a half crouch, the right hand pulls the rifle '
           'off the back over the right shoulder (0.45-0.95 s), the left takes the handguard (1.0 s) and he comes up '
           'aiming the way he came at 1.6 s. Last frame held. `weapon` track: on the back -> both hands. Root does not '
           'move; the end facing is the root yaw + ~170 deg (manifest models root.end).')
Meta('PvCrouchGripLitter', 2.0, False, role='bearer', slungRifle=True, holdLoop=[.6, 2.0],
     notes='02 end, collection point: from standing he squats beside a litter on the ground (stage litterSide) and '
           'takes the near pole in both hands, ready to lift; settled at 0.6 s, breathing hold 0.6-2.0 s. Rifle on '
           'the back.')


# =================================================================================
# shared
# =================================================================================
def BackRifleReview(T):
    """Review-only: the rifle hanging across the back (the runtime's slung list puts it there)."""
    def Props(t):
        rifle, _ = SlungRifle(T, 'back')
        return T.RifleProps(rifle)
    return Props


def Combine(*fns):
    return lambda t: [row for fn in fns for row in fn(t)]


def ArmTo(T, side, target, pole, palmF=None, palmN=None, curl=.5):
    """Re-solve one arm onto a world wrist target AFTER the pose (spec postGrip): a hand that follows the posed body
    (the right hand under the left elbow)."""
    K = T.K
    K['Chain'](K['Bone'](side + ' UpperArm'), K['Bone'](side + ' Forearm'), K['Bone'](side + ' Hand'), Vector(target),
               Vector(pole), label='post' + side)
    if palmF is not None:
        n = K['TurnPalm'](side, tuple(palmF), tuple(palmN))
        K['CurlFingers'](side, n, curl)
    K['Update']()


# =================================================================================
# seated against the dugout wall (Donggua, the left shoulder wounded)
# =================================================================================
def PvSitBase(T):
    """The opening's WoundedSitRifleIdle sit without the rifle: both hands free, the left arm limp in the lap."""
    H, SX = T.H, T.SX
    f = SitBase(T)
    for k in ('grip.R', 'gripW.R'):
        f.pop(k, None)
    f.update({
        'hand.R': (-(H + .12), -.20, .42), 'armPole.R': (-(SX + .45), .25, .25),
        'palmF.R': Unit((.25, -.55, -.80)), 'palmN.R': (0, -.25, -.97), 'curl.R': .45,
        'hand.L': (H + .06, -.16, .38), 'armPole.L': (SX + .45, .30, .30),
        'palmF.L': Unit((-.35, -.55, -.75)), 'palmN.L': (0, -.20, -.98), 'curl.L': .50,
        'head': (.18, .02, 0), 'twist': -.02,
    })
    return f


def SitRifleLean(T):
    """The rifle leaning on the wall at his left, butt in the dirt (a world prop; not in his hands)."""
    butt = Vector(SIT_RIFLE_BUTT)
    top = Vector((butt.x + .06, SIT_WALL_M - .02, 0))
    # the barrel rests on the wall: axis from the butt up to where it touches
    length = T.R(1.26)
    dy = top.y - butt.y
    dz = math.sqrt(max(1e-6, length * length - dy * dy - .06 * .06))
    axis = Unit((.06, dy, dz))
    return T.RifleFromButt(tuple(butt), axis)


def SitReview(T, extra=None):
    rifle = SitRifleLean(T)

    def Props(t):
        rows = T.RifleProps(rifle) + [('box', (0, SIT_WALL_M + .03, .7), (1.8, .06, 1.4), 0),
                                      ('box', (SIT_PACK[0], SIT_PACK[1], SIT_PACK_SIZE[2] / 2), SIT_PACK_SIZE, 0)]
        return rows + (extra(t) if extra else [])
    return Props


def SitProps(T):
    rifle = SitRifleLean(T)
    return lambda t: {'weapon': T.Track(rifle, up=(0, -1, 0))}


SIT_WALLS = [((0, SIT_WALL_M, 0), (0, -1, 0))]
SIT_VIEWS = [('side', (-3.2, -.25, .70), (0, -.15, .45)), ('q', (-2.0, -2.6, 1.5), (0, -.15, .40)),
             ('front', (.15, -3.0, .75), (0, -.10, .45))]


def SitBreath(f, t, period, amount=1.0):
    b = math.sin(Tau * t / period) * amount
    f['bend'] += .015 * b
    f['shrug'] += .025 * b
    return f


@Builder('PvSitOfferArm')
def BuildSitOfferArm(T, name):
    H, SX = T.H, T.SX
    base = PvSitBase(T)
    h = base['head']
    # The left arm held out to the helper kneeling in front-left: forearm forward, palm up, elbow a little bent.
    offer = {'hand.L': (SX + .12, -.16, .55), 'armPole.L': (SX + .55, .15, .10),
             'palmF.L': Unit((-.10, -1, .05)), 'palmN.L': Unit((-.05, 0, 1)), 'curl.L': .30,
             'head': (h[0] + .02, -.10, -.55), 'neck': (base['neck'][0], 0, -.15),
             'twist': -.10, 'lean': -.04, 'bend': base['bend'] + .04, 'shrug': .12}
    keys = [(0.0, {}),
            (.35, {'hand.L': (SX + .06, -.14, .48), 'shrug': .10, 'head': (h[0], -.05, -.25)}),
            (.80, offer), (2.0, offer)]
    anim = Anim(base, keys, {'head': .08, 'neck': .04})
    hold = lambda t: Smooth((t - .25) / .45)

    def Pose(t):
        f = anim(t)
        if t > .8:
            SitBreath(f, t - .8, 1.2, .8)
        p = T.Nest(f)
        w = hold(t)

        def Under():
            # The right hand under the left elbow (the forearm's head joint), cupping it from below and inside.
            K = T.K
            elbow = K['Point'](K['Bone']('L Forearm'))
            free = K['Point'](K['Bone']('R Hand'))
            want = elbow + Vector((-.03, .01, -.075))
            target = free.lerp(want, w)
            ArmTo(T, 'R', target, (-(SX + .40), -.10, .05), Unit((.85, -.20, .30)), Unit((.20, .05, 1)), .55)
        p['postGrip'] = Under
        return p
    return {'pose': Pose, 'props': SitProps(T), 'plants': [('L', 0, 2.0), ('R', 0, 2.0)], 'walls': SIT_WALLS,
            'reviewProps': SitReview(T), 'reviewViews': SIT_VIEWS, 'reviewScale': 2.0,
            'reviewFrames': lambda n: [0, int(n * .2), int(n * .4), n - 1]}


@Builder('PvSitStuffPack')
def BuildSitStuffPack(T, name):
    H, SX = T.H, T.SX
    base = PvSitBase(T)
    h = base['head']
    px, py, top = SIT_PACK[0], SIT_PACK[1], SIT_PACK_SIZE[2]
    base.update({'twist': -.16, 'lean': -.06, 'head': (h[0] + .18, -.06, -.30), 'neck': (base['neck'][0] + .05, 0, -.10),
                 'hand.L': (H + .04, -.18, .36)})
    above = (px + .02, py - .02, top + .14)
    inside = (px + .01, py, top - .02)
    deep = (px + .02, py + .01, top - .07)
    keys = [(0.0, {'hand.R': above, 'curl.R': .7}),
            (.40, {'hand.R': inside, 'curl.R': .85, 'bend': base['bend'] + .05}),
            (.65, {'hand.R': Add3(inside, (.03, -.02, -.01))}),
            (.90, {'hand.R': Add3(inside, (-.03, .01, -.02))}),
            (1.25, {'hand.R': above, 'curl.R': .5, 'bend': base['bend']}),
            # second push: a harder shove, the shoulder going with it, then a frustrated pull out
            (1.70, {'hand.R': deep, 'curl.R': .95, 'bend': base['bend'] + .10, 'lean': -.12, 'shrug': .14}),
            (2.05, {'hand.R': Add3(deep, (0, 0, .01))}),
            (2.45, {'hand.R': Add3(above, (0, .02, .04)), 'curl.R': .55, 'bend': base['bend'], 'lean': base['lean'],
                    'shrug': base['shrug']}),
            (3.0, {'hand.R': above, 'curl.R': .7})]
    for _, row in keys:
        row.setdefault('palmF.R', Unit((.10, -.20, -1)))
        row.setdefault('palmN.R', Unit((.95, 0, -.20)))
    anim = Anim(dict(base, **{'hand.R': above, 'armPole.R': (-(SX + .60), .15, .20)}), keys, {'head': .08}, periodic=True)

    def Pose(t):
        f = anim(t)
        SitBreath(f, t, 1.5, .8)
        f['look'] = (px, py, top)
        f['lookW'] = .6
        return T.Nest(f)
    return {'pose': Pose, 'props': SitProps(T), 'plants': [('L', 0, 3.0), ('R', 0, 3.0)], 'walls': SIT_WALLS,
            'reviewProps': SitReview(T), 'reviewViews': SIT_VIEWS, 'reviewScale': 2.0,
            'reviewFrames': lambda n: [0, int(n * .14), int(n * .57), int(n * .8)]}


@Builder('PvSitGrabHand')
def BuildSitGrabHand(T, name):
    H, SX = T.H, T.SX
    base = PvSitBase(T)
    h, n = base['head'], base['neck']
    wrist = GRAB_WRIST
    # the fist sits on top of the other man's wrist: the wrist target a hand above and behind the clamp point
    clamp = Add3(wrist, (.0, .07, .045))
    keys = [(0.0, {}),
            (.22, {'hand.R': (-(H + .10), -.24, .46), 'bend': base['bend'] + .02, 'head': (h[0] + .05, 0, -.05)}),
            (.62, {'hand.R': clamp, 'curl.R': 1.0, 'bend': base['bend'] + .22, 'pelvisTilt': (-.26, 0, .04),
                   'neck': (n[0] - .10, 0, 0), 'head': (h[0] - .35, .02, -.03), 'twist': -.06, 'shrug': .10}),
            (1.0, {'hand.R': Add3(clamp, (0, .01, .005)), 'head': (h[0] - .42, .02, -.02), 'shrug': .06,
                   'bend': base['bend'] + .20, 'pelvisTilt': (-.28, 0, .04)}),
            (2.5, {'hand.R': Add3(clamp, (0, .01, .005)), 'head': (h[0] - .42, .02, -.02), 'shrug': .06,
                   'bend': base['bend'] + .20, 'pelvisTilt': (-.28, 0, .04)})]
    for _, row in keys[1:]:
        pass
    anim = Anim(dict(base, **{'armPole.R': (-(SX + .45), .10, .05), 'palmF.R': Unit((.10, -1, -.30)),
                              'palmN.R': Unit((0, -.15, -1))}), keys, {'head': .07})

    def Pose(t):
        f = anim(t)
        if t > 1.0:
            SitBreath(f, t - 1.0, 1.5, 1.0)
        return T.Nest(f)
    return {'pose': Pose, 'props': SitProps(T), 'plants': [('L', 0, 2.5), ('R', 0, 2.5)], 'walls': SIT_WALLS,
            'reviewProps': SitReview(T, lambda t: [('cyl', Add3(wrist, (.25, -.20, .05)), wrist, .035),
                                                   ('point', wrist, None, .03)]),
            'reviewViews': SIT_VIEWS, 'reviewScale': 2.0,
            'reviewFrames': lambda n: [0, int(n * .09), int(n * .25), n - 1]}


# =================================================================================
# lying on the blanket (Donggua)
# =================================================================================
LIE_VIEWS = [('side', (-3.2, -.10, .75), (0, -.10, .25)), ('q', (-2.0, -2.4, 1.7), (0, -.10, .20)),
             ('feet', (-.3, -3.2, .9), (-.1, .2, .25))]


@Builder('PvLieGrabSleeve')
def BuildLieGrabSleeve(T, name):
    SX = T.SX
    base = LieBase(T, rightKnee=.0)
    base.update({'hand.L': (.06, .08, .26), 'neck': (.18, 0, 0), 'head': (.10, 0, 0),
                 'hand.R': (-(SX + .14), .10, .15)})
    h, n = base['head'], base['neck']
    sleeve = SLEEVE
    fist = Add3(sleeve, (.05, .0, -.06))        # the wrist under-inside of the fist that holds the cloth
    drop = (-(SX + .16), .08, .15)              # where the hand falls back onto the blanket
    keys = [(0.0, {}),
            (.35, {'hand.R': (-(SX + .20), .22, .30), 'armPole.R': (-(SX + .50), .20, .10),
                   'head': (h[0] + .05, -.25, 0), 'curl.R': .3}),
            (.80, {'hand.R': fist, 'armPole.R': (-(SX + .40), .05, -.10), 'curl.R': 1.0,
                   'head': (h[0] + .14, -.55, 0), 'neck': (n[0] + .06, 0, 0), 'bend': base['bend'] + .05,
                   'lean': -.10, 'shrug': .10}),
            (1.5, {'hand.R': Add3(fist, (0, .01, -.01)), 'head': (h[0] + .12, -.58, 0), 'bend': base['bend'] + .03}),
            (2.2, {'hand.R': fist, 'head': (h[0] + .14, -.55, 0), 'bend': base['bend'] + .05}),
            # lets go: the fist opens, the arm falls back onto the blanket, the head rolls back up
            (2.42, {'hand.R': Add3(fist, (.0, -.03, -.08)), 'curl.R': .35, 'bend': base['bend']}),
            (2.75, {'hand.R': Add3(drop, (0, 0, .03)), 'armPole.R': base['armPole.R'], 'curl.R': .40,
                    'head': (h[0] + .02, -.25, 0), 'neck': n, 'lean': 0.0, 'shrug': base['shrug']}),
            (3.0, {'hand.R': drop, 'head': (h[0], -.18, 0)})]
    anim = Anim(base, keys, {'head': .08, 'neck': .04})
    rest = (base['palmF.R'], base['palmN.R'])
    grab = (Unit((.10, .40, -.90)), Unit((.90, -.10, .10)))
    down = (Unit((.15, -.10, -1)), (0, 0, -1))

    def Pose(t):
        f = anim(t)
        Breathe(f, t, 1.4, 1.0, chest=.025)
        if .8 < t < 2.2:
            # the fist trembles while it holds on
            p = f['hand.R']
            f['hand.R'] = (p[0], p[1], p[2] + .004 * math.sin(Tau * (t - .8) / .14))
        # the palm turns onto the sleeve with the reach and over onto the blanket with the drop
        a, b = Smooth((t - .25) / .5), Smooth((t - 2.2) / .5)
        for k, i in (('palmF.R', 0), ('palmN.R', 1)):
            f[k] = Unit(Lerp3(Lerp3(rest[i], grab[i], a), down[i], b))
        return T.Nest(f)

    def Review(t):
        return [('box', (0, .15, -.01), (1.3, 2.0, .02), 0), ('cyl', Add3(sleeve, (-.10, .30, .0)), Add3(sleeve, (.02, -.05, .0)), .045)]
    return {'pose': Pose, 'reviewProps': Review, 'reviewViews': LIE_VIEWS, 'reviewScale': 2.4,
            'reviewFrames': lambda n: [0, int(n * .27), int(n * .6), int(n * .85), n - 1]}


# =================================================================================
# kneeling work (the rifle on the back). Hands on the ground or on a body are grips (the finger roots pinned to the
# point): the bake's reach assist then slides the hips toward a low grip and folds the trunk, as a man reaching does.
# =================================================================================
KNEEL_VIEWS = [('side', (-3.2, -.40, .80), (0, -.30, .45)), ('q', (-2.1, -2.8, 1.7), (0, -.30, .40)),
               ('front', (.3, -3.0, .9), (0, -.30, .40))]
KNEEL_REACH = {'fraction': .90, 'travel': .04, 'bend': .45, 'sink': .03}


def KneelArc(T, theta):
    """The hip joint on its arc about the planted knee (knee on the ground at y -0.10, the captives baker's kneel):
    theta = the thigh's angle back from vertical (0 = hips straight over the knees, 0.3 = KneelFlat, 1.0 = sat back
    toward the heels). On the arc the knee cannot move, so the shins stay flat and the grounding lift stays put."""
    return (0.0, -.10 + T.F * math.sin(theta), .075 + T.F * math.cos(theta))


def KneelLean(T, sit=0.0, bend=.70, forward=.06, tilt=.75, theta=None):
    f = MedicKneel(T, sit=sit, bend=bend, forward=forward, tilt=tilt)
    f['pelvis'] = KneelArc(T, .3 - forward * 2.5 + sit * .7 if theta is None else theta)
    f.update({'head': (-.10, 0, 0), 'neck': (-.15, 0, 0)})
    for s in LR:
        sign = 1 if s == 'L' else -1
        f['armPole.' + s] = (sign * (T.SX + .55), .15, .30)
    return f


def SetGrip(f, side, point, palmF, palmN, curl):
    f['grip.' + side] = tuple(point)
    f['gripW.' + side] = 1.0
    f['hand.' + side] = tuple(point)
    f['palmF.' + side], f['palmN.' + side], f['curl.' + side] = Unit(palmF), Unit(palmN), curl


@Builder('PvKneelDig')
def BuildKneelDig(T, name):
    SX = T.SX
    base = KneelLean(T, sit=0.0, bend=.75, forward=.08, tilt=.80)
    pel = base['pelvis']

    def Scoop(side, t):
        """One hand's path, a scoop a second: dig in front (in the dirt), drag back, fling out to the side."""
        sign = 1 if side == 'L' else -1
        # (phase .2 at t = 0: neither hand is mid-fling on the first frame, which the solver starts clean -- a
        # clean start mid-fling put the right elbow on the other side, 80 deg off the steady loop)
        u = ((t + .2 + (0 if side == 'L' else .5)) % 1.0)
        pts = [(0.0, (sign * .14, -.50, .085)),           # fingers in
               (.30, (sign * .16, -.32, .085)),           # dragged back toward the knees
               (.52, (sign * (SX + .18), -.30, .30)),     # flung out to the side
               (.78, (sign * .13, -.52, .18)),            # reaching in again
               (1.0, (sign * .14, -.50, .085))]
        return Channel(pts, periodic=True)(u), u

    def Pose(t):
        f = dict(base)
        for s in LR:
            sign = 1 if s == 'L' else -1
            p, u = Scoop(s, t)
            # 1 = clawing the dirt, 0 = flinging it (blended: a switched palm lags the hand's rate limit)
            d = Smooth((u - .70) / .26) if u > .55 else 1 - Smooth((u - .28) / .24)
            fwd = Lerp3((sign * .55, -.30, .30), (sign * -.10, -.85, -.55), d)
            nrm = Lerp3((sign * .30, .55, .70), (0, .25, -1), d)
            SetGrip(f, s, p, fwd, nrm, .40 + .30 * d)
            # elbows out and up (on all fours they point back and up); a pole below the shoulder sat on the
            # shoulder-hand line during the fling and the elbow flipped sides at the loop seam
            f['armPole.' + s] = (sign * (SX + .45), .05, 1.0)
        # the trunk rocks toward each scooping hand
        f['twist'] = .07 * math.sin(Tau * t / 1.0)
        f['bend'] = base['bend'] + .05 * math.cos(Tau * t / .5)
        f['lean'] = .04 * math.sin(Tau * t / 1.0)
        f['pelvis'] = Add3(pel, (0, -.015 * math.cos(Tau * t / .5), 0))
        return T.Nest(f)

    def Review(t):
        return [('box', (0, -.60, .03), (.9, .45, .06), 0)]
    return {'pose': Pose, 'plants': [('L', 0, 2.0), ('R', 0, 2.0)], 'reach': KNEEL_REACH, 'twistMax': 180,
            'reviewProps': Combine(Review, BackRifleReview(T)), 'reviewViews': KNEEL_VIEWS, 'reviewScale': 2.0,
            'reviewFrames': lambda n: [0, int(n * .15), int(n * .25), int(n * .4)]}


@Builder('PvKneelPullBlanket')
def BuildKneelPullBlanket(T, name):
    SX = T.SX
    up = KneelLean(T, sit=.10, bend=.25, forward=.02, tilt=.20)
    low = KneelLean(T, bend=.85, tilt=.88, theta=.02)
    pack = (-.40, -.22, .11)
    # (t, L, R, palm kind, posture 0 = up .. 1 = low)
    rows = [
        (0.00, (.14, -.10, .40), (-.14, -.10, .40), 'rest', .30),
        (.35, (-.30, -.26, .25), (-.46, -.22, .25), 'down', .80),     # hands on the pack (at his right knee)
        (.55, (-.28, -.20, .40), (-.46, -.22, .25), 'down', .80),     # the left flips the flap open
        (.80, (-.33, -.24, .18), (-.45, -.22, .18), 'in', .85),       # both hands into the pack
        (1.10, (.10, -.30, .62), (-.10, -.30, .62), 'in', .20),        # pulls the folded blanket up to the chest
        (1.45, (.30, -.42, .80), (-.30, -.42, .80), 'out', 0.0),       # opens it out, arms up
        (1.75, (.32, -.52, .52), (-.32, -.52, .52), 'out', .30),       # shakes it forward (the fling)
        (1.95, (.32, -.48, .70), (-.32, -.48, .70), 'out', .15),
        (2.30, (.28, -.56, .16), (-.28, -.56, .16), 'out', 1.0),       # lays it down, far edge first
        (2.55, (.30, -.52, .09), (-.30, -.52, .09), 'down', 1.0),
        (2.80, (.30, -.48, .09), (-.30, -.48, .09), 'down', .95),      # smooths it
        (3.00, (.24, -.44, .10), (-.24, -.44, .10), 'down', .90),
    ]
    PALM = {'rest': ((0, -.6, -.8), (0, .3, -1), .40), 'down': ((0, -1, -.25), (0, 0, -1), .45),
            'in': ((0, -.4, -.9), None, .85), 'out': ((0, -.6, .8), None, .90)}
    tL = Channel([(r[0], r[1]) for r in rows])
    tR = Channel([(r[0], r[2]) for r in rows])
    pose = Channel([(r[0], r[4]) for r in rows])
    twist = Channel([(0.0, .3), (.35, 1.0), (.80, 1.0), (1.10, 0.0), (3.0, 0.0)])

    def PalmKeys(side):
        sign = 1 if side == 'L' else -1
        out = []
        for r in rows:
            fwd, nrm, curl = PALM[r[3]]
            out.append((r[0], tuple(fwd) + tuple(nrm or (-sign, 0, 0)) + (curl,)))
        return Channel(out)
    palmCh = {s: PalmKeys(s) for s in LR}      # the palms turn between keys like the hands move (no one-frame switch)

    def Pose(t):
        w = Clamp(pose(t))
        f = dict(up)
        for k in ('pelvis', 'pelvisTilt'):
            f[k] = Lerp3(up[k], low[k], w)
        f['bend'] = up['bend'] + (low['bend'] - up['bend']) * w
        f['twist'] = -.30 * twist(t)            # turned to the pack at his right knee
        for s, ch in (('L', tL), ('R', tR)):
            v = palmCh[s](t)
            SetGrip(f, s, ch(t), v[0:3], v[3:6], v[6])
        f['look'] = Lerp3(pack, (0, -.9, .1), Smooth((t - 1.2) / .8))
        f['lookW'] = .5
        return T.Nest(f)

    def Review(t):
        out = [('box', pack, (.32, .22, .22), 0)]
        a, b = tL(t), tR(t)
        if .95 <= t < 1.40:
            mid = Lerp3(a, b, .5)
            out.append(('box', (mid[0], mid[1] - .06, mid[2] - .04), (.30, .14, .10), 0))     # the folded bundle
        elif 1.40 <= t < 2.50:
            hang = .70 * (1 - Smooth((t - 2.0) / .5))
            reachOut = .25 + .45 * Smooth((t - 1.9) / .5)
            out.append(('poly', [a, b, (b[0], b[1] - reachOut, max(.01, b[2] - hang)),
                                 (a[0], a[1] - reachOut, max(.01, a[2] - hang))], None, 0))
        elif t >= 2.50:
            out.append(('box', (0, -.95, .01), (1.3, 1.0, .02), 0))           # laid flat in front (near edge 0.45 m out)
        return out
    return {'pose': Pose, 'plants': [('L', 0, 3.0), ('R', 0, 3.0)], 'reach': KNEEL_REACH,
            'reviewProps': Combine(Review, BackRifleReview(T)), 'reviewViews': KNEEL_VIEWS, 'reviewScale': 2.2,
            'reviewFrames': lambda n: [int(n * .12), int(n * .27), int(n * .37), int(n * .49), int(n * .58),
                                       int(n * .78), n - 1]}


@Builder('PvKneelHaulBody')
def BuildKneelHaulBody(T, name):
    SX = T.SX
    forward = KneelLean(T, sit=0.0, bend=.72, forward=.06, tilt=.75)
    back = KneelLean(T, sit=.50, bend=.30, forward=0.0, tilt=.30)
    far, near = .48, .28
    # (t, haul 0 = hands at the far shoulders .. 1 = pulled in, posture 0 = leaning in .. 1 = sat back, curl)
    rows = [(0.00, 0.0, 0.0, .55), (.25, 0.0, 0.0, 1.0), (.45, .05, .05, 1.0), (1.25, 1.0, 1.0, 1.0),
            (1.50, 1.0, .95, .45), (2.10, 0.0, 0.0, .55), (2.50, 0.0, 0.0, .55)]
    haul = Channel([(r[0], r[1]) for r in rows], periodic=True)
    sat = Channel([(r[0], r[2]) for r in rows], periodic=True)
    curl = Channel([(r[0], r[3]) for r in rows], periodic=True)

    def Pose(t):
        h, w = Clamp(haul(t)), Clamp(sat(t))
        f = dict(forward)
        for k in ('pelvis', 'pelvisTilt'):
            f[k] = Lerp3(forward[k], back[k], w)
        f['bend'] = forward['bend'] + (back['bend'] - forward['bend']) * w
        y = -(far + (near - far) * h)
        z = .19 + .05 * h
        for s in LR:
            sign = 1 if s == 'L' else -1
            SetGrip(f, s, (sign * .17, y, z), (sign * -.15, -.55, -.80), (sign * -.15, .45, -.85), curl(t))
        f['head'] = (-.10 + .10 * w, 0, 0)
        return T.Nest(f)

    def Review(t):
        # the man being hauled: shoulders across the fists, his head toward the kneeler, his body away
        y = -(far + (near - far) * Clamp(haul(t))) - .03
        return [('cyl', (.24, y, .12), (-.24, y, .12), .09), ('cyl', (0, y, .12), (0, y - .80, .10), .13),
                ('point', (0, y + .14, .12), None, .10)]
    return {'pose': Pose, 'plants': [('L', 0, 2.5), ('R', 0, 2.5)], 'reach': KNEEL_REACH,
            'reviewProps': Combine(Review, BackRifleReview(T)), 'reviewViews': KNEEL_VIEWS, 'reviewScale': 2.2,
            'reviewFrames': lambda n: [0, int(n * .18), int(n * .5), int(n * .7)]}


# =================================================================================
# dragging the blanket (in place, walking)
# =================================================================================
DUTY = .62            # stance fraction of each foot's cycle


def GaitFoot(T, phase, stride, lift=.085):
    """In-place walking foot (y from front -stride/2 to back +stride/2 during stance), its ankle z and pitch."""
    A = T.A
    heelUp = lambda deg: .105 * math.sin(math.radians(max(0.0, deg)))
    if phase < DUTY:
        u = phase / DUTY
        y = -stride / 2 + stride * u
        # heel strike (toes up 14 deg) -> flat by 15 % -> heel rises from 65 % to toe-off at 32 deg
        pitch = -14 * (1 - Smooth(u / .15)) + 32 * Smooth((u - .62) / .38)
        z = A + heelUp(pitch) + .012 * (1 - Smooth(u / .15))
        return y, z, pitch
    u = (phase - DUTY) / (1 - DUTY)
    y = stride / 2 - stride * Smooth(u)
    pitch = 32 * (1 - Smooth(u / .45)) - 14 * Smooth((u - .55) / .45)
    z = A + heelUp(pitch) * (1 - u) + lift * math.sin(math.pi * u) + .012 * Smooth((u - .7) / .3)
    return y, z, pitch


def DragPose(T, t, side):
    """side 'L' = the left man (left fist on the corner), 'R' = the right man (mirror)."""
    H, P, A, SX = T.H, T.P, T.A, T.SX
    m = 1 if side == 'L' else -1           # mirror: +X is the gripping side
    grip, free = side, ('R' if side == 'L' else 'L')
    stride = R(T, DRAG_SPEED_MPS * DUTY * DRAG_CYCLE_S)
    ph = (t / DRAG_CYCLE_S) % 1.0
    f = T.Stand()
    phases = {'L': ph, 'R': (ph + .5) % 1.0}
    for s in LR:
        sign = 1 if s == 'L' else -1
        y, z, pitch = GaitFoot(T, phases[s], stride)
        f['ankle.' + s] = (sign * (H + .03), y + .02, z)
        f['foot.' + s] = (pitch, sign * 4, 0)
        f['legPole.' + s] = (sign * (H + .12), y - 1.0, .55)
    bob = math.cos(Tau * 2 * ph)
    sway = math.sin(Tau * ph)
    f['pelvis'] = (.012 * sway, .03, P - .07 + .012 * bob)
    f['pelvisTilt'] = (.62, 0, 0)
    f['bend'] = .36 + .02 * bob
    f['twist'] = m * .10 + .05 * sway
    f['lean'] = m * -.04
    f['neck'] = (-.30, 0, 0)
    f['head'] = (-.42, 0, m * .05)
    f['shrug'] = .06
    # the corner fist: behind and low at the outer side, riding the hips' bob (the cloth is taut)
    hx, hy, hz = R(T, DRAG_HAND)
    f['hand.' + grip] = (m * hx, hy, hz + .012 * bob)
    f['armPole.' + grip] = (m * (SX + .55), .35, .85)
    f['palmF.' + grip] = Unit((m * .10, .45, -1))
    f['palmN.' + grip] = Unit((m * -.70, .55, -.10))
    f['curl.' + grip] = 1.0
    # the free arm pumps against the opposite leg (forward when the gripping-side foot is forward)
    sm = 1 if free == 'L' else -1
    swing = math.cos(Tau * phases[grip])
    f['hand.' + free] = (sm * (SX - .02), -.27 - .15 * swing, P + .02 + .06 * swing)
    f['armPole.' + free] = (sm * (SX + .35), .30, P - .25)
    f['palmF.' + free] = Unit((sm * -.20, -.40, -.85))
    f['palmN.' + free] = (-sm, 0, 0)
    f['curl.' + free] = .75
    return f


def DragReview(T, side):
    m = 1 if side == 'L' else -1

    def Props(t):
        hx, hy, hz = R(T, DRAG_HAND)
        corner = tuple(T.K['GripPoint']('L' if side == 'L' else 'R'))
        # the blanket corner: from the fist down to the ground behind, and the blanket's head edge across
        ground = (m * (hx - .05), hy + .45, .02)
        inner = (m * (hx - R(T, 1.3)), hy + .45, .02)
        return [('cyl', corner, ground, .02), ('cyl', ground, inner, .02),
                ('box', (m * (hx - R(T, .65)), hy + .45 + 1.0, .01), (R(T, 1.3), 2.0, .02), 0)]
    return Props


DRAG_VIEWS = [('side', (-3.4, -.30, 1.0), (0, .10, .75)), ('q', (-2.4, -2.6, 1.8), (0, .10, .65)),
              ('back', (.6, 3.2, 1.4), (0, .10, .65))]


def BuildDrag(T, name, side):
    def Pose(t):
        return T.Nest(DragPose(T, t, side))
    n = 'L' if side == 'L' else 'R'
    return {'pose': Pose, 'reviewProps': Combine(DragReview(T, side), BackRifleReview(T)), 'reviewViews': DRAG_VIEWS,
            'reviewScale': 2.6, 'reviewFrames': lambda c: [0, int(c * .25), int(c * .5), int(c * .75)],
            'reach': {'fraction': 2.0}}


@Builder('PvBlanketDragL')
def BuildDragL(T, name):
    return BuildDrag(T, name, 'L')


@Builder('PvBlanketDragR')
def BuildDragR(T, name):
    return BuildDrag(T, name, 'R')


# =================================================================================
# letting go of the corner, turning to the cover, the rifle off the back
# =================================================================================
def Frame(v, psi, c):
    """A world point into a body frame turned by psi about c (as Turned does)."""
    x, y = _Rot(v[0] - c[0], v[1] - c[1], -psi)
    return (x + c[0], y + c[1], v[2])


@Builder('PvBlanketReleaseTurn')
def BuildReleaseTurn(T, name):
    H, P, A, SX, SZ = T.H, T.P, T.A, T.SX, T.SZ
    start = DragPose(T, 0.0, 'L')
    TURN = math.radians(170)
    crouchZ = P - .30
    psiC = Channel([(0.0, 0.0), (.20, 0.0), (.55, TURN * .45), (.90, TURN * .90), (1.10, TURN), (2.0, TURN)])
    # feet in WORLD (root) coordinates: left planted, the right steps across in front, the left swings round
    aL0, aR0 = start['ankle.L'], start['ankle.R']
    W = lambda ang, r, back: (r * math.cos(ang) - back * math.sin(ang), r * math.sin(ang) + back * math.cos(ang))
    # end stance in the turned frame: feet wide, left a little forward (local)
    endL = W(TURN, H + .10, -.10)
    endR = W(TURN, -(H + .12), .10)
    stepR = [(0.0, aR0), (.22, aR0), (.38, (-.02, -.10, A + .09)), (.55, (-.10 + .0, -.18, A))]
    stepL = [(0.0, aL0), (.52, aL0), (.70, (.05, .02, A + .09)), (.90, (endL[0], endL[1], A))]
    stepR2 = [(.95, (-.10, -.18, A)), (1.05, ((endR[0] - .10) / 2, (endR[1] - .18) / 2, A + .06)), (1.18, (endR[0], endR[1], A))]
    chL = Channel(stepL + [(2.0, (endL[0], endL[1], A))])
    chR = Channel(stepR + stepR2 + [(2.0, (endR[0], endR[1], A))])
    yawL = Channel([(0.0, 0.0), (.52, 0.0), (.90, TURN), (2.0, TURN)])
    yawR = Channel([(0.0, 0.0), (.22, 0.0), (.55, TURN * .55), (.95, TURN * .55), (1.18, TURN), (2.0, TURN)])
    pZ = Channel([(0.0, start['pelvis'][2]), (.30, start['pelvis'][2] - .02), (.80, crouchZ + .08), (1.15, crouchZ), (2.0, crouchZ)])
    bend = Channel([(0.0, start['bend']), (.30, .12), (.90, .18), (1.20, .30), (1.6, .26), (2.0, .26)])
    tiltX = Channel([(0.0, start['pelvisTilt'][0]), (.35, .10), (1.15, .32), (2.0, .32)])
    # the rifle, body-frame (local) path: on the back -> over the right shoulder -> both hands -> aimed
    back = T.Rifle((-.05, .20, SZ - .55), Unit((-.37, .08, .93)))                 # approx. of SlungRifle at the grab
    over = T.Rifle((-.22, -.05, SZ - .25), Unit((-.05, -.55, .83)))
    low = T.Rifle((-.16, -.30, crouchZ + .36), Unit((.12, -.85, .50)))
    aim = T.Rifle((-.10, -.42, crouchZ + .46), Unit((.02, -1, .04)))
    path = [(0.0, back), (.50, back), (.78, over), (1.08, low), (1.55, aim), (2.0, aim)]
    alongR = Channel([(0.0, .90), (.50, .90), (.78, .72), (1.08, .40), (1.55, .30), (2.0, .30)])

    def RifleLocal(t):
        for (t0, a), (t1, b) in zip(path, path[1:]):
            if t <= t1:
                u = Smooth((t - t0) / max(1e-6, t1 - t0))
                return T.Rifle(Lerp3(a['origin'], b['origin'], u), Unit(Lerp3(a['axis'], b['axis'], u)))
        return aim

    def Pose(t):
        f = dict(start)
        psi = psiC(t)
        c = (start['pelvis'][0], start['pelvis'][1])
        f['pelvis'] = (start['pelvis'][0], start['pelvis'][1], pZ(t))
        f['bend'] = bend(t)
        f['pelvisTilt'] = (tiltX(t), 0, 0)
        f['twist'] = start['twist'] * (1 - Smooth(t / .5)) + .10 * Smooth((t - .3) / .4) * (1 - Smooth((t - .9) / .4))
        f['lean'] = 0.0
        f['neck'] = (-.10 + .06 * Smooth((t - .4) / .6), 0, 0)
        f['head'] = (-.10 + .02 * Smooth((t - 1.2) / .4), 0, .30 * Smooth((t - .05) / .3) * (1 - Smooth((t - .7) / .4)))
        for s, ch, yw in (('L', chL, yawL), ('R', chR, yawR)):
            sign = 1 if s == 'L' else -1
            a = ch(t)
            f['ankle.' + s] = Frame(a, psi, c)
            f['foot.' + s] = (0.0, math.degrees(yw(t) - psi) + sign * 6, 0)
            f['legPole.' + s] = Frame((a[0] + math.sin(-yw(t)) * -1.0 + sign * .15, a[1] - math.cos(yw(t)) * 1.0, .55), psi, c)
        # left hand: lets go of the corner (0-0.25 s), swings in, then takes the handguard
        rifle = RifleLocal(t)
        palms = T.Palms(rifle['axis'])
        hx, hy, hz = R(T, DRAG_HAND)
        letGo = Smooth(t / .25)
        f['hand.L'] = Lerp3((hx, hy, hz), (SX + .06, -.05, P - .25), Smooth((t - .1) / .5))
        f['armPole.L'] = Lerp3(start['armPole.L'], (SX + .45, .40, P - .10), Smooth(t / .5))
        f['curl.L'] = 1.0 - .55 * letGo
        f['palmF.L'], f['palmN.L'] = Unit((0, -.1, -1)), (-1, 0, 0)
        if t >= .85:
            wl = Smooth((t - .85) / .35)
            f['grip.L'] = T.Along(rifle, .62)
            f['gripW.L'] = wl
            f['palmF.L'] = Unit(Lerp3(f['palmF.L'], palms['L'][0], wl))
            f['palmN.L'] = Unit(Lerp3(f['palmN.L'], palms['L'][1], wl))
            f['curl.L'] = .45 + .40 * wl
        # right hand: from the pumping swing up over the right shoulder to the rifle, then off the back
        f['armPole.R'] = (-(SX + .45), .25, P + .05)
        # (the reach to the rifle on the back is a grip whose weight ramps 0.18-0.50 s, the palm turning with it:
        # a free hand switched to a grip at one frame turned the hand 160 deg in that frame)
        # the free hand first comes up in front of the right shoulder (0.08-0.30 s), then the grip takes it back over
        # the shoulder onto the rifle (0.28-0.50 s): straight from the pumping swing to behind the shoulder the target
        # passed through the shoulder and the elbow flipped sides
        up = Smooth((t - .08) / .22)
        f['hand.R'] = Lerp3(start['hand.R'], (-(SX - .02), -.22, SZ + .02), up)
        w = Smooth((t - .28) / .22)
        f['grip.R'] = T.Along(rifle, alongR(t))
        f['gripW.R'] = w
        f['palmF.R'] = Unit(Lerp3(start['palmF.R'], palms['R'][0], w))
        f['palmN.R'] = Unit(Lerp3(start['palmN.R'], palms['R'][1], w))
        f['curl.R'] = .75 + .20 * w
        return T.Nest(_base['RaYaw'](f, psi) if psi > 1e-9 else f)

    def RifleWorld(t):
        psi = psiC(t)
        c = (start['pelvis'][0], start['pelvis'][1])
        r = RifleLocal(t)
        out = {}
        for k in ('origin', 'butt', 'muzzle', 'gripR', 'gripL'):
            x, y = _Rot(r[k][0] - c[0], r[k][1] - c[1], psi)
            out[k] = (x + c[0], y + c[1], r[k][2])
        ax = r['axis']
        x, y = _Rot(ax[0], ax[1], psi)
        out['axis'] = (x, y, ax[2])
        return out

    def Props(t):
        slung, up = SlungRifle(T, 'back')
        if t < .50:
            return {'weapon': (slung['origin'], slung['axis'], up, True)}
        held = RifleWorld(t)
        w = Smooth((t - .50) / .12)
        o = Lerp3(slung['origin'], held['origin'], w)
        a = Unit(Lerp3(slung['axis'], held['axis'], w))
        u = Vector(Lerp3(up, (0, 0, 1), Smooth((t - .5) / .6)))
        return {'weapon': (o, a, tuple(u), True)}

    def Review(t):
        tr = Props(t)['weapon']
        r = T.Rifle(tr[0], tr[1])
        hx, hy, hz = R(T, DRAG_HAND)
        return T.RifleProps(r) + [('box', (.10, .95, .40), (1.4, .35, .8), 0),          # the cover (crate stack) he turns to
                                  ('cyl', (hx, hy, hz * (1 - Smooth(t / .3))), (hx - .05, hy + .45, .02), .02)]
    return {'pose': Pose, 'props': Props, 'plants': [('L', 0, .52), ('R', 1.18, 2.0), ('L', .90, 2.0)],
            'reviewProps': Review, 'reviewViews': [('side', (-3.4, -.30, 1.0), (0, .0, .65)),
                                                   ('q', (-2.4, -2.6, 1.8), (0, .0, .60)),
                                                   ('back', (.6, 3.2, 1.4), (0, .0, .60))],
            'reviewScale': 2.6, 'reviewFrames': lambda n: [0, int(n * .25), int(n * .4), int(n * .55), n - 1]}


# =================================================================================
# the litter at the collection point
# =================================================================================
@Builder('PvCrouchGripLitter')
def BuildCrouchGripLitter(T, name):
    H, P, A, SX = T.H, T.P, T.A, T.SX
    stand = T.Stand()
    pole = LITTER_POLE
    squat = {'pelvis': (0, .10, .45), 'pelvisTilt': (.62, 0, 0), 'bend': .52, 'head': (-.25, 0, 0), 'neck': (-.10, 0, 0),
             'ankle.L': (H + .10, .02, A), 'ankle.R': (-(H + .10), .02, A),
             'legPole.L': (H + .45, -1.0, .55), 'legPole.R': (-(H + .45), -1.0, .55),
             'foot.L': (0, 10, 0), 'foot.R': (0, -10, 0), 'shrug': .06}
    gripL = (LITTER_HANDS_HALF, pole[1], pole[2])
    gripR = (-LITTER_HANDS_HALF, pole[1], pole[2])
    keys = [(0.0, {}), (.30, {'pelvis': (0, .10, P - .28), 'bend': .32, 'pelvisTilt': (.35, 0, 0)}), (.60, squat), (2.0, squat)]
    anim = Anim(dict(stand, **{'ankle.L': squat['ankle.L'], 'ankle.R': squat['ankle.R']}), keys, {'head': .06})

    def Pose(t):
        f = anim(t)
        if t > .6:
            Breathe(f, t - .6, 1.4, 1.0, chest=.012)
        w = Smooth((t - .15) / .45)
        for s, g in (('L', gripL), ('R', gripR)):
            sign = 1 if s == 'L' else -1
            f['grip.' + s] = g
            f['gripW.' + s] = w
            f['hand.' + s] = (sign * (SX + .02), .01, f['pelvis'][2] - .12)    # hanging hands go down with the hips
            f['armPole.' + s] = (sign * (SX + .55), .20, .60)
            # fingers over the pole from the far side, wrapping back (turning from the hanging hand's palm)
            f['palmF.' + s] = Unit(Lerp3(stand['palmF.' + s], (0, .35, -1), w))
            f['palmN.' + s] = Unit(Lerp3(stand['palmN.' + s], (0, .95, .30), w))
            f['curl.' + s] = .3 + .7 * Smooth((t - .45) / .15)
        return T.Nest(f)

    def Review(t):
        return [('cyl', (.9, pole[1], pole[2]), (-.9, pole[1], pole[2]), .02), ('cyl', (.9, pole[1] - .55, pole[2]), (-.9, pole[1] - .55, pole[2]), .02),
                ('box', (0, pole[1] - .275, pole[2] - .01), (1.6, .50, .01), 0)]
    return {'pose': Pose, 'plants': [('L', 0, 2.0), ('R', 0, 2.0)], 'reach': {'fraction': .90, 'travel': .08, 'bend': .25, 'sink': .05},
            'reviewProps': Combine(Review, BackRifleReview(T)), 'reviewViews': [('side', (-3.2, -.30, 1.0), (0, -.20, .70)), ('q', (-2.1, -2.8, 1.9), (0, -.20, .65)), ('front', (.3, -3.0, 1.1), (0, -.20, .70))], 'reviewScale': 2.4,
            'reviewFrames': lambda n: [0, int(n * .15), int(n * .3), n - 1],
            'check': lambda t: {'L': gripL, 'R': gripR} if t >= .6 else {}}


def MakeClips(K):
    T = Toolkit(K)
    print('PREVIZ_CARE_MEASURES', K['modelId'], 'scale %.4f H %.3f A %.3f F %.3f S %.3f SX %.3f SZ %.3f P %.3f ARM %.3f'
          % (T.s, T.H, T.A, T.F, T.S, T.SX, T.SZ, T.P, T.ARM), flush=True)
    specs = {}
    for name in CLIPS:
        spec = BUILDERS[name](T, name)
        spec.setdefault('scale', K['scale'])
        spec.setdefault('modelId', K['modelId'])
        specs[name] = spec
    return specs
