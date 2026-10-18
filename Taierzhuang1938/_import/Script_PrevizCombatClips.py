"""FirstLevel0105 previz: NRA combat placeholder clips (2026-10-19, PrevizCombat).

Placeholders the white-box previz (Script_EditorBlockoutFirstLevel0105Previz.mjs) asked for instead of borrowing other
clips: 03 blown back by a grenade-discharger round, the machine gunner hit in the leg, a man throwing himself flat, the
man crawling out with a grenade bundle, climbing out of a trench, two men supporting a hopping wounded man, the shove on
03-1 ("往哪走！"), Luo towing Shunzi under the plank bridge (05-1).

Same module contract as _import/Script_OpeningStoryboardClips.py (CLIPS / STAGES / PROPS / CONTACT_POINTS /
PARTNER_SOURCES / GHOST_BONES / BindCaptives / MakeClips), run by the opening frame loop through
_import/Script_PrevizCombatBake.py. The pose toolkit (Toolkit, Anim, KneelFlat, the world-axis tilt channels) is the
opening library's own, loaded from it; nothing there changes.

Authoring space (as the opening library): Blender metres on the rig's source scale, +Z up, forward -Y, the character's
own left +X, ground z = 0, actor root at the origin. Runtime = source x scale (0.9135 on TengxianNra02); the three.js
actor frame is (-X, Z, Y).

Tilt channels are WORLD-axis turns (Script_MachineGunCaptivesBake ApplyPose): pelvisTilt / bend x + = pitch forward,
y + = roll to his left (lying face down: roll about the body's length), z + = turn left; lean + = chest to his left,
twist + = chest turned to his left.

In-place loops (walk, hop, crawl, crouch run) keep the root still: the planted foot / elbow / knee slides back at the
clip's referenceSpeedMps (runtime m/s at scale 1) and the previz moves the actor; play rate = actual speed / that speed.
The trench climb is authored in place too: the previz raises and moves the root along `rootPath` (manifest), and the
clip's own ground (the trench wall and lip) rides with it.
"""
import math, os, runpy
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion

_here = Path(os.environ['OPENING_PROJECT']) / '_import'
_base = runpy.run_path(str(_here / 'Script_OpeningStoryboardClips.py'), run_name='PrevizCombatBase')
Toolkit, Anim, KneelFlat, Standing = _base['Toolkit'], _base['Anim'], _base['KneelFlat'], _base['Standing']
Channel, Keys, Turned = _base['Channel'], _base['Keys'], _base['Turned']
Clamp, Smooth, Unit, Add3, Lerp3 = _base['Clamp'], _base['Smooth'], _base['Unit'], _base['Add3'], _base['Lerp3']
GHOST_BONES, GHOST_LINKS = _base['GHOST_BONES'], _base['GHOST_LINKS']
Tau = math.pi * 2
LR = ('L', 'R')
Mix = lambda a, b, w: a + (b - a) * w

CLIPS = {}
STAGES = {}
PROPS = {}
CONTACT_POINTS = {}
PARTNER_SOURCES = {}
BUILDERS = {}


def BindCaptives(base):
    """No legacy clips here."""


def Meta(name, duration, loop, hold, **extra):
    row = {'duration': duration, 'loop': loop, 'weaponHold': hold, 'rig': 'TengxianNra02', 'rigs': ['TengxianNra02']}
    row.update(extra)
    CLIPS[name] = row
    return name


def Builder(name):
    def Register(fn):
        BUILDERS[name] = fn
        return fn
    return Register


def R(T, v):
    """Runtime metres -> this rig's source metres (numbers or tuples)."""
    return tuple(c / T.s for c in v) if isinstance(v, (tuple, list)) else v / T.s


def Rows(rows):
    """Channel through (t, value) rows."""
    return Channel(sorted([(t, tuple(v) if isinstance(v, (tuple, list, Vector)) else v) for t, v in rows], key=lambda r: r[0]))


def Periodic(rows):
    return Channel(sorted([(t, tuple(v) if isinstance(v, (tuple, list, Vector)) else v) for t, v in rows], key=lambda r: r[0]),
                   periodic=True)


def Views(c=(0, -.2, .6), far=3.4, h=1.0, top=False):
    cx, cy, cz = c
    rows = [('side', (cx - far, cy, cz + h * .3), (cx, cy, cz)), ('q', (cx - far * .68, cy - far * .82, cz + h), (cx, cy, cz)),
            ('front', (cx - .2, cy - far, cz + .25), (cx, cy, cz))]
    if top:
        rows.append(('top', (cx, cy + .01, cz + far + 1.5), (cx, cy, cz)))
    return rows


def RifleTrack(T, rifle, up=None):
    """Weapon track row (origin = right grip, muzzle axis, up square to it)."""
    a = Vector(rifle['axis'])
    u = Vector(up or (0, 0, 1))
    u = u - a * u.dot(a)
    if u.length < 1e-6:
        u = Vector((0, 1, 0)) - a * a.y
    return (rifle['origin'], rifle['axis'], tuple(u.normalized()), True)


def RifleGrips(T, f, rifle, w=(1.0, 1.0), poles=None, curl=.9):
    """Both hands on the rifle (grip.R at the wrist of the stock, grip.L on the handguard)."""
    palms = T.Palms(rifle['axis'])
    for k, s in enumerate(LR):
        f['grip.' + s] = rifle['grip' + s]
        f['hand.' + s] = rifle['grip' + s]
        f['palmF.' + s], f['palmN.' + s], f['curl.' + s] = palms[s][0], palms[s][1], curl
        f.pop('handRel.' + s, None)
        if w[k] < .999:
            f['gripW.' + s] = max(1e-3, w[k])
        else:
            f.pop('gripW.' + s, None)
        if poles:
            f['armPole.' + s] = poles[s]
    return f


# ---------------------------------------------------------------------------------
# mirror (left <-> right) of a flat pose
# ---------------------------------------------------------------------------------
_MIRROR_POINT = ('pelvis', 'ankle.', 'legPole.', 'hand.', 'armPole.', 'grip.', 'look')
_MIRROR_DIR = ('palmF.', 'palmN.', 'palmFw.', 'palmNw.', 'toeDir.')
_MIRROR_REL = ('handRel.', 'poleRel.')


def Mirror(f):
    out = {}
    for key, v in f.items():
        side = key[-1] if len(key) > 2 and key[-2] == '.' and key[-1] in LR else None
        name = key[:-1] + ('R' if side == 'L' else 'L') if side else key
        if v is None or isinstance(v, (int, float)) and not key.startswith(('lean', 'twist')):
            out[name] = v
            continue
        if key in ('lean', 'twist'):
            out[name] = -v
        elif key.startswith(_MIRROR_POINT) or key.startswith(_MIRROR_DIR) or key.startswith(_MIRROR_REL):
            out[name] = (-v[0], v[1], v[2])
        elif key in ('pelvisTilt', 'neck', 'head'):
            out[name] = (v[0], -v[1], -v[2])
        elif key.startswith('foot.'):
            out[name] = (v[0], -v[1], v[2])
        else:
            out[name] = v
    return out


# ---------------------------------------------------------------------------------
# in-place gait (treadmill): the stance foot slides back at the walking speed
# ---------------------------------------------------------------------------------
def Tread(t, period, phase, duty, stride, lift):
    """One foot of an in-place gait. u = cycle position (0 = this foot's heel strike). Stance: the foot slides from
    stride/2 ahead to stride/2 behind (source m, -Y forward); swing: it returns in an arc. -> (y, z, u, pitchDeg)."""
    u = ((t / period) + phase) % 1.0
    if u < duty:
        s = u / duty
        y = -stride / 2 + stride * s
        pitch = 0.0 if s < .65 else 28.0 * Smooth((s - .65) / .35)       # heel off, rolling over the ball
        z = 0.0
    else:
        s = (u - duty) / (1 - duty)
        y = stride / 2 - stride * (.5 - .5 * math.cos(math.pi * s))
        z = lift * math.sin(math.pi * min(1.0, s * 1.1)) ** 1.2
        pitch = 28.0 * (1 - Smooth(s / .45)) - 12.0 * Smooth((s - .55) / .45)   # toe off, then toes up for the heel strike
    return y, z, u, pitch


def TreadFoot(T, f, side, x, y, z, pitch, yaw=0.0):
    """Ankle target over a treadmill foot point; a heel off (pitch > 0) raises the ankle over the ball of the foot."""
    lift = T.R(.115) * math.sin(math.radians(max(0.0, pitch)))
    f['ankle.' + side] = (x, y, T.A + z + lift)
    f['foot.' + side] = (pitch, yaw, 0)


# =================================================================================
# 1. PvBlastThrownBack -- a round bursts in front of him: blown back off his feet onto his back
# =================================================================================
BL_T = 1.6
BL_RELEASE = .08
BL_LAND = .46               # seat on the ground
BL_BACK = .60               # back and head down
BL_STILL = 1.10
BL_END_BACK_M = .95         # runtime m: the pelvis ends this far behind the root

Meta('PvBlastThrownBack', BL_T, False, 'twoHand', role='pitNra', rootMotion=True, terminal=False, props=['weapon'],
     weaponState='twoHand->dropped', weaponDropFrom='PvBlastThrownBack',
     contacts=[{'t': 0.0, 'limb': 'handsLR', 'action': 'hold', 'target': 'weapon'},
               {'t': BL_RELEASE, 'limb': 'handsLR', 'action': 'release', 'target': 'weapon'}],
     events=[{'t': 0.0, 'kind': 'blast', 'from': 'front'}, {'t': BL_RELEASE, 'kind': 'weaponLost'},
             {'t': BL_LAND, 'kind': 'down', 'sound': 'bodyFall'}, {'t': BL_STILL, 'kind': 'still'}],
     holdLoop=[BL_STILL + .1, BL_T],
     notes='Crouched ready with the rifle in both hands; at 0 s a round bursts in front of him (-z): the blast throws him '
           'up and back off his feet, arms flung forward, the rifle torn out of his hands (0.08 s, weapon track: it flies up '
           'and lands 0.8 m to his right rear, weaponDropFrom); seat on the ground 0.46 s, back and head slam 0.60 s, the legs '
           'come down, a last stir, still from 1.10 s on his back, arms out, the right knee half up. Root motion: the pelvis '
           'ends 0.95 m behind the root (+z). The last frame is the lying pose (hold it; holdLoop 1.2-1.6 is still).')


def LyingBack(T, y, knee=0.35):
    """Supine with the head toward +Y (blown back): pelvis at y (source), legs toward -Y, arms out."""
    H, SX = T.H, T.SX
    reach = (T.F + T.S) * .96
    f = T.Stand()
    f.update({'pelvis': (0, y, .12), 'pelvisTilt': (-1.50, 0, .06), 'bend': .04, 'lean': 0.0, 'twist': .05, 'shrug': .03,
              'neck': (.10, 0, 0), 'head': (.06, .10, .30),
              'ankle.L': (H + .10, y - reach, .075), 'legPole.L': (H + .30, y - .45, 1.2), 'foot.L': (-70, 18, 0),
              'ankle.R': (-(H + .08), y - reach + (reach - .46) * knee, .075 + (T.A - .075) * knee),
              'legPole.R': (-(H + .25), y - .45, 1.2), 'foot.R': (-70 * (1 - knee), -14, 0),
              'hand.L': (SX + .42, y + .22, .045), 'armPole.L': (SX + .70, y + .10, .40),
              'palmF.L': Unit((.6, .7, -.1)), 'palmN.L': (0, 0, 1), 'curl.L': .40,
              'hand.R': (-(SX + .36), y + .05, .045), 'armPole.R': (-(SX + .70), y - .05, .40),
              'palmF.R': Unit((-.7, .5, -.1)), 'palmN.R': (0, 0, 1), 'curl.R': .45})
    return f


@Builder('PvBlastThrownBack')
def BuildBlast(T, name):
    H, P, A, SX, SZ = T.H, T.P, T.A, T.SX, T.SZ
    yEnd = R(T, BL_END_BACK_M)
    base = T.Stand()
    # frame 0: crouched ready, the rifle across the chest, muzzle forward and up to his left
    base.update({'pelvis': (0, .04, P - .14), 'pelvisTilt': (.18, 0, 0), 'bend': .22, 'neck': (-.08, 0, 0), 'head': (-.10, 0, 0),
                 'ankle.L': (H + .04, -.14, A), 'ankle.R': (-(H + .04), .16, A),
                 'legPole.L': (H + .25, -1.0, .45), 'legPole.R': (-(H + .25), -.8, .45), 'foot.L': (0, 8, 0), 'foot.R': (0, -12, 0)})
    lie = LyingBack(T, yEnd)
    keys = [
        (0.0, {}),
        # the blast: the chest jolts back, the head snaps, the knees give
        (.08, {'pelvis': (0, .12, P - .16), 'pelvisTilt': (-.10, 0, 0), 'bend': -.12, 'neck': (.20, 0, 0), 'head': (.25, 0, .05), 'shrug': .18}),
        # off his feet, flying back: hips up, the trunk laid back, legs swinging forward
        (.24, {'pelvis': (.02, .30, .64), 'pelvisTilt': (-.68, .05, 0), 'bend': .08, 'neck': (.25, 0, 0), 'head': (.30, .05, .05),
               'ankle.L': (H + .08, -.05, .14), 'ankle.R': (-(H + .06), .08, .10), 'legPole.L': (H + .3, -1.2, .7),
               'legPole.R': (-(H + .3), -1.2, .7), 'foot.L': (-20, 10, 0), 'foot.R': (-15, -10, 0)}),
        (.38, {'pelvis': (.03, .55, .48), 'pelvisTilt': (-.95, .08, 0), 'bend': .12, 'neck': (.22, 0, 0), 'head': (.25, .05, .05),
               'ankle.L': (H + .10, .05, .38), 'ankle.R': (-(H + .06), .12, .30), 'legPole.L': (H + .3, -1.0, 1.4),
               'legPole.R': (-(H + .3), -1.0, 1.3), 'foot.L': (-40, 12, 0), 'foot.R': (-40, -12, 0)}),
        # seat down, rolling back onto the shoulders, the legs up
        (BL_LAND, {'pelvis': (.03, yEnd - .12, .16), 'pelvisTilt': (-1.20, .06, 0), 'bend': .18, 'neck': (.25, 0, 0),
                   'head': (.25, .05, .05), 'ankle.L': (H + .10, yEnd - .45, .50), 'ankle.R': (-(H + .06), yEnd - .35, .42),
                   'legPole.L': (H + .3, yEnd - .9, 1.6), 'legPole.R': (-(H + .3), yEnd - .9, 1.5), 'foot.L': (-55, 14, 0), 'foot.R': (-50, -12, 0)}),
        (BL_BACK, {'pelvis': (.02, yEnd + .04, .13), 'pelvisTilt': (-1.62, .05, 0), 'bend': -.04, 'neck': (.02, 0, 0),
                   'head': (-.10, .05, .10), 'ankle.L': (H + .10, yEnd - .50, .48), 'ankle.R': (-(H + .08), yEnd - .40, .38),
                   'shrug': .10}),
        # the legs come down, the head lifts once (dazed)
        (.80, {'pelvis': (.01, yEnd, .12), 'pelvisTilt': (-1.52, .03, .04), 'bend': .08, 'neck': (.18, 0, 0), 'head': (.20, .10, .15),
               'ankle.L': lie['ankle.L'], 'ankle.R': Add3(lie['ankle.R'], (0, -.10, .06)), 'legPole.L': lie['legPole.L'],
               'legPole.R': lie['legPole.R'], 'foot.L': lie['foot.L'], 'foot.R': (-40, -14, 0)}),
        (.95, {'neck': (.06, 0, 0), 'head': (.04, .10, .22), 'bend': .03}),
        (BL_STILL, {k: lie[k] for k in ('pelvis', 'pelvisTilt', 'bend', 'twist', 'neck', 'head', 'shrug', 'ankle.L', 'ankle.R',
                                        'legPole.L', 'legPole.R', 'foot.L', 'foot.R')}),
        (BL_T, {}),
    ]
    anim = Keys(base, keys, lag={'head': .05, 'neck': .03})
    # the rifle at frame 0 and where it lands
    rifle0 = T.Rifle((-.14, -.30, P - .02), Unit((.45, -.70, .55)))
    land = T.Rifle(R(T, (-1.05, .55, .03)), Unit((-.45, -.89, 0)))

    def RifleAt(t):
        if t <= BL_RELEASE:
            return rifle0
        u = Clamp((t - BL_RELEASE) / .55)
        o = Lerp3(rifle0['origin'], land['origin'], Smooth(u))
        lift = R(T, .55) * math.sin(math.pi * u)
        o = (o[0], o[1], Mix(rifle0['origin'][2], land['origin'][2], u) + lift)
        spin = Quaternion((1, 0, 0), -3.6 * Smooth(u)) @ Quaternion((0, 0, 1), .8 * u) @ Vector(rifle0['axis'])
        axis = Unit(Lerp3(tuple(spin), land['axis'], Smooth((u - .55) / .45)))
        return T.Rifle(o, axis)
    # free hands after the release (world targets): flung forward and up, then out on the ground
    lieHands = {s: lie['hand.' + s] for s in LR}
    handL = Rows([(BL_RELEASE, rifle0['gripL']), (.24, (SX + .25, -.10, P + .30)), (.40, (SX + .35, .15, .95)),
                  (BL_BACK, (SX + .45, yEnd - .05, .45)), (.75, Add3(lieHands['L'], (0, -.05, .10))), (BL_STILL, lieHands['L'])])
    handR = Rows([(BL_RELEASE, rifle0['gripR']), (.24, (-(SX + .20), -.15, P + .25)), (.40, (-(SX + .35), .10, .90)),
                  (BL_BACK, (-(SX + .40), yEnd - .10, .40)), (.75, Add3(lieHands['R'], (0, -.08, .12))), (BL_STILL, lieHands['R'])])

    def Pose(t):
        f = anim(t)
        if t <= BL_RELEASE + .02:
            RifleGrips(T, f, rifle0, w=(1 - Smooth((t - BL_RELEASE) / .02),) * 2,
                       poles={'L': (SX + .45, .20, SZ - .55), 'R': (-(SX + .45), .25, SZ - .55)})
        else:
            # flung forward and up in the torso frame while he flies, then out onto the ground (world)
            fl = Smooth((t - BL_RELEASE) / .16)
            f['handRel.L'] = Lerp3((.10, -.30, -.10), (.30, -.25, .30), fl)
            f['handRel.R'] = Lerp3((-.10, -.30, -.10), (-.28, -.28, .26), fl)
            f['poleRel.L'], f['poleRel.R'] = (.45, .30, -.30), (-.45, .30, -.30)
            f['handRelW.L'] = f['handRelW.R'] = 1 - Smooth((t - BL_BACK + .05) / (BL_STILL - BL_BACK + .05))
            f['hand.L'], f['hand.R'] = lieHands['L'], lieHands['R']
            w = Smooth((t - BL_LAND) / (BL_STILL - BL_LAND))
            f['armPole.L'] = Lerp3((SX + .60, .30, P - .10), lie['armPole.L'], w)
            f['armPole.R'] = Lerp3((-(SX + .60), .30, P - .10), lie['armPole.R'], w)
            f['palmF.L'], f['palmN.L'] = (0, -.3, 1), (-1, 0, 0)
            f['palmF.R'], f['palmN.R'] = (0, -.3, 1), (1, 0, 0)
            f['palmFw.L'], f['palmNw.L'] = lie['palmF.L'], lie['palmN.L']
            f['palmFw.R'], f['palmNw.R'] = lie['palmF.R'], lie['palmN.R']
            f['curl.L'] = f['curl.R'] = Mix(.25, .42, w)
        return T.Nest(f)

    def Ground(t):
        # off the ground while he flies (the authored heights hold), full grounding before and after
        return 1.0 - Smooth((t - .10) / .08) * (1 - Smooth((t - .40) / .08))
    c = (0, R(T, .45), .45)
    return {'pose': Pose, 'props': lambda t: {'weapon': RifleTrack(T, RifleAt(t))}, 'groundWeight': Ground,
            'plants': [('L', 0, .05), ('R', 0, .05)],
            'reviewProps': lambda t: T.RifleProps(RifleAt(t)) + [('point', (0, -1.0, .2), None, .12)],
            'reviewViews': Views(c, 3.4, .8, top=True), 'reviewScale': 3.2,
            'reviewFrames': lambda n: [0, 2, 6, 9, 11, 14, 19, 26, n - 1]}


# =================================================================================
# 2. PvLegHitKneelClutch -- shot in the right thigh: the leg gives, down on that knee, both hands round the thigh
# =================================================================================
LH_T = 2.0
LH_HIT = .05
LH_RELEASE = .12
LH_KNEE = .38               # the right knee on the ground
LH_HOLD = 1.2
Meta('PvLegHitKneelClutch', LH_T, False, 'twoHand', role='gunner', rootMotion=False, props=['weapon'],
     weaponState='twoHand->dropped', weaponDropFrom='PvLegHitKneelClutch', holdLoop=[LH_HOLD, LH_T],
     holdExit='pose.holdUntil is not needed: the hold loop is the clutching kneel itself (play another clip to leave it)',
     contacts=[{'t': 0.0, 'limb': 'handsLR', 'action': 'hold', 'target': 'weapon'},
               {'t': LH_RELEASE, 'limb': 'handsLR', 'action': 'release', 'target': 'weapon'},
               {'t': .55, 'limb': 'handsLR', 'action': 'hold', 'target': 'self', 'part': 'thighR'}],
     events=[{'t': LH_HIT, 'kind': 'shot', 'at': 'thighR'}, {'t': LH_RELEASE, 'kind': 'weaponLost'},
             {'t': LH_KNEE, 'kind': 'kneeDown', 'sound': 'bodyFall'}],
     notes='Standing ready with the rifle in both hands; 0.05 s a round into the right thigh: the right knee gives and he drops '
           'onto it (knee on the ground 0.38 s, the left foot still planted), the rifle falls out of his hands (0.12 s) to the '
           'ground at his right front (weapon track, weaponDropFrom); both hands go to the right thigh (0.55 s), the left knee '
           'comes down too (0.70 s) and he sits back on his heels (kneel-sit), hunched over the thigh, both hands round it; '
           'from 1.2 s the hold loop: rocking with short breaths (1.2-2.0 s loops seamlessly). No root motion.')


@Builder('PvLegHitKneelClutch')
def BuildLegHit(T, name):
    H, P, A, SX, SZ = T.H, T.P, T.A, T.SX, T.SZ
    K = T.K
    base = T.Stand()
    base.update({'pelvis': (0, .03, P - .07), 'pelvisTilt': (.10, 0, 0), 'bend': .14, 'neck': (-.04, 0, 0), 'head': (-.04, 0, 0),
                 'ankle.L': (H + .04, -.16, A), 'ankle.R': (-(H + .04), .12, A), 'foot.L': (0, 8, 0), 'foot.R': (0, -10, 0)})
    up3 = lambda f: {k: (Add3(v, (0, 0, .03)) if k == 'pelvis' or k.startswith(('ankle.', 'legPole.')) else v) for k, v in f.items()}
    kneel = up3(KneelFlat(T, sit=.15))
    sit = up3(KneelFlat(T, sit=.85))
    footL = (H + .04, -.16, A)
    poleL = (H + .30, -1.3, .55)
    hold = {'pelvis': Add3(sit['pelvis'], (0, 0, .01)), 'pelvisTilt': (.12, -.03, -.06), 'bend': .48, 'lean': -.05,
            'twist': -.16, 'neck': (.10, 0, -.06), 'head': (.22, -.05, -.10), 'shrug': .14}
    for k in ('ankle.L', 'ankle.R', 'legPole.L', 'legPole.R', 'foot.L', 'foot.R'):
        hold[k] = sit[k]
    keys = [
        (0.0, {}),
        (LH_HIT + .02, {'pelvis': (-.01, .05, P - .08), 'pelvisTilt': (.04, -.08, -.10), 'bend': .06, 'neck': (.10, 0, 0),
                        'head': (.12, -.04, -.06), 'shrug': .15}),
        # the leg buckles: the right knee folds forward and down, the trunk pitches over it; the left foot holds
        (.22, {'pelvis': (-.04, .06, P - .30), 'pelvisTilt': (.30, -.12, -.12), 'bend': .40, 'twist': -.10,
               'ankle.R': (-(H + .03), .24, A + .04), 'legPole.R': (-(H + .2), -1.2, .2), 'foot.R': (25, -10, 0),
               'ankle.L': footL, 'legPole.L': poleL, 'foot.L': (0, 6, 0), 'head': (.20, -.05, -.05)}),
        (.30, {'ankle.R': (-(H + .03), .30, A + .12), 'foot.R': (40, -10, 0)}),
        (LH_KNEE, {'pelvis': Add3(kneel['pelvis'], (-.02, -.02, .05)), 'pelvisTilt': (.30, -.06, -.10), 'bend': .50,
                   'ankle.R': kneel['ankle.R'], 'legPole.R': kneel['legPole.R'], 'foot.R': kneel['foot.R'], 'twist': -.18,
                   'ankle.L': footL, 'legPole.L': poleL, 'foot.L': (0, 6, 0)}),
        # the left knee comes down beside it (the foot lifted back off the ground)
        (.54, {'ankle.L': Lerp3(footL, sit['ankle.L'], .45)[:2] + (A + .16,), 'foot.L': (10, 4, 0), 'bend': .58,
               'legPole.L': (H + .28, -1.2, .30), 'head': (.25, -.05, -.10), 'shrug': .18}),
        (.70, {'ankle.L': sit['ankle.L'], 'legPole.L': sit['legPole.L'], 'foot.L': sit['foot.L'],
               'pelvis': Add3(KneelFlat(T, sit=.40)['pelvis'], (0, 0, .04))}),
        # sits back on the heels, folded over the thigh: a groan
        (.95, dict(hold, bend=.62, head=(.30, -.05, -.10), neck=(.14, 0, -.06))),
        (LH_HOLD, hold),
        (1.6, {'bend': .56, 'pelvis': Add3(hold['pelvis'], (0, -.01, .005)), 'head': (.18, -.05, -.10), 'shrug': .18}),
        (LH_T, hold),
    ]
    anim = Keys(base, keys, lag={'head': .05, 'neck': .03})
    rifle0 = T.Rifle((-.13, -.28, P - .08), Unit((.38, -.80, .46)))
    land = T.Rifle(R(T, (-.62, -.55, .03)), Unit((.40, -.92, 0)))

    def RifleAt(t):
        if t <= LH_RELEASE:
            return rifle0
        u = Clamp((t - LH_RELEASE) / .32)
        o = Lerp3(rifle0['origin'], land['origin'], 1 - (1 - u) ** 2)      # thrown out away from him first, then down
        o = (o[0], o[1], Mix(rifle0['origin'][2], land['origin'][2], u * u))
        axis = Unit(Lerp3(rifle0['axis'], land['axis'], Smooth(u)))
        return T.Rifle(o, axis)
    # hands on the right thigh: a point along it from the hip to the knee joint, read from the posed rig at each frame
    # (Pose returns a 'post' that places them once the legs are solved)

    def Pose(t):
        f = anim(t)
        if t <= LH_RELEASE + .03:
            RifleGrips(T, f, rifle0, w=(1 - Smooth((t - LH_RELEASE) / .03),) * 2,
                       poles={'L': (SX + .45, .20, SZ - .55), 'R': (-(SX + .45), .25, SZ - .55)})
            return T.Nest(f)
        w = Smooth((t - LH_RELEASE) / (.55 - LH_RELEASE))
        f['handRel.L'] = Lerp3((.25, -.30, -.15), (.10, -.20, -.35), w)
        f['handRel.R'] = Lerp3((-.25, -.30, -.15), (-.10, -.20, -.35), w)
        f['palmF.L'], f['palmN.L'] = (0, -.3, -1), (-1, 0, 0)
        f['palmF.R'], f['palmN.R'] = (0, -.3, -1), (1, 0, 0)
        p = T.Nest(f)
        clutch = Smooth((t - .30) / .25)
        post = p['post']

        def Post():
            post()
            if clutch < 1e-3:
                return
            th, ca = K['Point'](K['Bone']('R Thigh')), K['Point'](K['Bone']('R Calf'))
            axis = (ca - th).normalized()
            out = Vector((-1, 0, 0))
            up = axis.cross(out).normalized()             # the front of the thigh
            if up.z < 0:
                up = -up
            front = th.lerp(ca, .45) + up * T.R(.075)
            outer = th.lerp(ca, .62) + out * T.R(.075) + up * T.R(.02)
            grips = {'L': (front, -up, axis), 'R': (outer, -out, axis)}
            for s in LR:
                spot, inward, along = grips[s]
                sh = K['Point'](K['Bone'](s + ' UpperArm'))
                free = K['Point'](K['Bone'](s + ' Hand'))
                # the wrist a palm's length back from the spot, the palm onto the thigh
                wrist = spot - inward * T.R(.03) + (sh - spot).normalized() * T.R(.075)
                target = free.lerp(wrist, clutch)
                pole = sh + Vector((.35 if s == 'L' else -.35, .25, -.30))
                K['Chain'](K['Bone'](s + ' UpperArm'), K['Bone'](s + ' Forearm'), K['Bone'](s + ' Hand'), target, pole, label='clutch' + s)
                normal = K['TurnPalm'](s, tuple(Vector((0, 0, -1)).lerp(along, .2).normalized()), tuple(inward))
                K['CurlFingers'](s, normal, Mix(.4, .85, clutch))
            K['Update']()
        p['post'] = Post
        return p
    return {'pose': Pose, 'props': lambda t: {'weapon': RifleTrack(T, RifleAt(t))},
            'plants': [('L', 0, .40)], 'kneePlants': [('R', LH_KNEE + .05, .5), ('L', .75, LH_T)],
            'reviewProps': lambda t: T.RifleProps(RifleAt(t)),
            'reviewViews': Views((0, -.15, .55), 3.0, .8), 'reviewScale': 2.4,
            'reviewFrames': lambda n: [0, 2, 5, 9, 13, 20, 29, 38, n - 1]}


# =================================================================================
# 3. PvStandToProneDive -- running, he throws himself flat, the rifle held out in front
# =================================================================================
DV_T = 1.2
DV_KNEES = .36
DV_HANDS = .52
DV_FLAT = .72
DV_END_FWD_M = .80          # runtime m: the pelvis ends this far ahead of the root
Meta('PvStandToProneDive', DV_T, False, 'twoHand', role='any', rootMotion=True, props=['weapon'], weaponState='twoHand',
     contacts=[{'t': 0.0, 'limb': 'handsLR', 'action': 'hold', 'target': 'weapon'}],
     events=[{'t': DV_KNEES, 'kind': 'kneesDown', 'sound': 'bodyFall'}, {'t': DV_FLAT, 'kind': 'prone', 'sound': 'bodyFall'}],
     holdLoop=[1.0, DV_T],
     notes='A running stride with the rifle at port (both hands), he drops: knees on the ground 0.36 s, the rifle and forearms '
           'out in front 0.52 s, flat on his chest 0.72 s, the head up looking forward, the rifle held in front of the face '
           'pointing forward (right hand at the stock wrist by the right cheek, left hand on the handguard, elbows on the '
           'ground). Root motion: the pelvis ends 0.80 m ahead of the root (the feet end about where he started). Last frame '
           '= prone hold (1.0-1.2 s still).')


def ProneBase(T, y, chest=.30):
    """Face down, head toward -Y, the pelvis at source y, the chest propped on the forearms by `chest` (rad)."""
    H = T.H
    f = T.Stand()
    f.update({'pelvis': (0, y, T.R(.205)), 'pelvisTilt': (1.50, 0, 0), 'bend': -chest, 'lean': 0.0, 'twist': 0.0, 'shrug': .10,
              'neck': (-.20, 0, 0), 'head': (-.30, 0, 0),
              'ankle.L': (H + .07, y + .82, T.R(.10)), 'ankle.R': (-(H + .09), y + .82, T.R(.10)),
              'legPole.L': (H + .25, y + .40, -.15), 'legPole.R': (-(H + .25), y + .40, -.15),
              'toeDir.L': Unit((.25, .90, -.30)), 'toeDir.R': Unit((-.30, .90, -.30)), 'foot.L': None, 'foot.R': None})
    return f


@Builder('PvStandToProneDive')
def BuildDive(T, name):
    H, P, A, SX, SZ = T.H, T.P, T.A, T.SX, T.SZ
    yEnd = -R(T, DV_END_FWD_M)
    base = T.Stand()
    # frame 0: mid running stride, crouched, the left leg swinging through
    base.update({'pelvis': (0, .02, P - .10), 'pelvisTilt': (.22, 0, -.05), 'bend': .25, 'twist': .06,
                 'neck': (-.10, 0, 0), 'head': (-.12, 0, 0),
                 'ankle.L': (H + .03, -.10, A + .14), 'ankle.R': (-(H + .03), .22, A + .02),
                 'legPole.L': (H + .2, -1.2, .6), 'legPole.R': (-(H + .2), -1.0, .45), 'foot.L': (10, 6, 0), 'foot.R': (30, -6, 0)})
    prone = ProneBase(T, yEnd, chest=.30)
    kneel = KneelFlat(T, y=-.40, sit=0.0)
    keys = [
        (0.0, {}),
        # the left foot plants ahead, the body pitching down over it
        (.16, {'pelvis': (0, -.18, P - .20), 'pelvisTilt': (.40, 0, 0), 'bend': .35, 'ankle.L': (H + .04, -.38, A),
               'foot.L': (0, 6, 0), 'ankle.R': (-(H + .03), .18, A + .10), 'foot.R': (35, -6, 0), 'legPole.R': (-(H + .2), -1.0, .3)}),
        # down on the knees
        (DV_KNEES, {'pelvis': Add3(kneel['pelvis'], (0, -.05, -.02)), 'pelvisTilt': (.55, 0, 0), 'bend': .45,
                    'ankle.L': kneel['ankle.L'], 'ankle.R': kneel['ankle.R'], 'legPole.L': kneel['legPole.L'],
                    'legPole.R': kneel['legPole.R'], 'foot.L': kneel['foot.L'], 'foot.R': kneel['foot.R'],
                    'neck': (-.15, 0, 0), 'head': (-.20, 0, 0)}),
        # falling forward onto the forearms and the rifle, the legs straightening behind
        (DV_HANDS, {'pelvis': (0, yEnd + .12, .42), 'pelvisTilt': (1.15, 0, 0), 'bend': .05,
                    'ankle.L': Add3(kneel['ankle.L'], (0, .04, 0)), 'ankle.R': Add3(kneel['ankle.R'], (0, .04, 0)),
                    'legPole.L': (H + .25, -.1, -.4), 'legPole.R': (-(H + .25), -.1, -.4)}),
        (DV_FLAT, {k: prone[k] for k in ('pelvis', 'pelvisTilt', 'bend', 'neck', 'head', 'shrug', 'ankle.L', 'ankle.R',
                                         'legPole.L', 'legPole.R')}),
        (.86, {'bend': -prone['bend'] * -1.15, 'head': (-.38, 0, 0)}),
        (1.0, {'bend': prone['bend'], 'head': prone['head']}),
        (DV_T, {}),
    ]
    anim = Keys(base, keys, lag={'head': .05, 'neck': .03})
    footW = lambda t: Smooth((t - DV_KNEES) / (DV_FLAT - DV_KNEES))      # toes turn from the kneel to the prone
    port = T.Rifle((-.12, -.26, P + .08), Unit((.50, -.55, .67)))
    out = T.Rifle((-.09, yEnd - R(T, .46), R(T, .14)), Unit((.16, -1, .05)))
    mid = T.Rifle((-.12, yEnd - R(T, .45), R(T, .35)), Unit((.25, -.90, -.20)))

    def RifleAt(t):
        if t <= .20:
            return port
        if t <= DV_HANDS:
            u = Smooth((t - .20) / (DV_HANDS - .20))
            return T.Rifle(Lerp3(port['origin'], mid['origin'], u), Unit(Lerp3(port['axis'], mid['axis'], u)))
        u = Smooth((t - DV_HANDS) / (DV_FLAT + .06 - DV_HANDS))
        return T.Rifle(Lerp3(mid['origin'], out['origin'], u), Unit(Lerp3(mid['axis'], out['axis'], u)))

    def Pose(t):
        f = anim(t)
        w = footW(t)
        if w > 1e-3:
            for s, sign in (('L', 1), ('R', -1)):
                f['toeDir.' + s] = Unit(Lerp3((0, .55, -.83), prone['toeDir.' + s], w))
                f['foot.' + s] = None
        r = RifleAt(t)
        down = Smooth((t - .40) / .30)
        catch = Smooth((t - .30) / .14) * (1 - Smooth((t - DV_FLAT) / .20))
        RifleGrips(T, f, r, w=(1 - catch, 1.0),
                   poles={'L': Lerp3((SX + .45, .20, SZ - .55), (SX + .55, yEnd - .20, -.30), down),
                          'R': Lerp3((-(SX + .45), .25, SZ - .55), (-(SX + .45), yEnd - .10, -.30), down)})
        if catch > 1e-3:
            # the left palm out onto the ground ahead of the left shoulder (breaks the fall)
            f['hand.L'] = (SX + .10, yEnd - R(T, .55), .06)
            f['palmF.L'], f['palmN.L'], f['curl.L'] = Unit(Lerp3(f['palmF.L'], (0, -1, 0), catch)), Unit(Lerp3(f['palmN.L'], (0, 0, -1), catch)), Mix(.9, .3, catch)
        f['look'] = (0, yEnd - 3.0, .6) if t > .5 else None
        f['lookW'] = .6 * Smooth((t - .6) / .3)
        return T.Nest(f)
    c = (0, R(T, -.45), .45)
    return {'pose': Pose, 'props': lambda t: {'weapon': RifleTrack(T, RifleAt(t))},
            'reach': {'fraction': .90, 'travel': 0.0, 'bend': .0, 'sink': 0.0},
            'reviewProps': lambda t: T.RifleProps(RifleAt(t)),
            'reviewViews': Views(c, 3.4, .8, top=True), 'reviewScale': 3.0,
            'reviewFrames': lambda n: [0, 4, 9, 13, 17, 21, n - 1]}


# =================================================================================
# 4. PvCrawlCarryBundle -- face down, a grenade bundle hugged to the chest in the right arm, left elbow + right knee crawl
# =================================================================================
CR_T = 2.0                  # two strokes
CR_STROKE = 1.0
CR_REACH = .62              # fraction of a stroke spent pulling (the rest: the arm reaching forward again)
CR_SPEED = .30              # runtime m/s
Meta('PvCrawlCarryBundle', CR_T, True, 'free', role='bundleMan', rootMotion=False, referenceSpeedMps=CR_SPEED, props=['bundle'],
     slung=True,
     notes='Face down, the chest a little off the ground, a bundle of stick grenades hugged against the right side of the chest '
           'in the right arm (prop track `bundle`: centre, axis along the handles, up = away from the chest; the runtime '
           'needs a mesh for it), the rifle slung on the back (back-sling list). Crawls on the LEFT elbow and the RIGHT knee: '
           'the left forearm reaches forward and pulls, the right knee draws up to the side and pushes; two strokes per 2 s '
           'loop. In place: the root stays put, the planted elbow and knee slide back at referenceSpeedMps 0.30 (runtime m/s); '
           'play rate = actual speed / 0.30.')


@Builder('PvCrawlCarryBundle')
def BuildCrawl(T, name):
    H, SX = T.H, T.SX
    K = T.K
    v = R(T, CR_SPEED)                          # source m/s
    pull = CR_STROKE * CR_REACH
    travel = v * CR_STROKE                      # source m the contact points slide back per stroke
    base = ProneBase(T, 0.0, chest=.12)
    base.update({'pelvisTilt': (1.52, -.10, 0), 'lean': -.06, 'neck': (-.28, 0, 0), 'head': (-.34, 0, 0)})

    def Stroke(t):
        u = (t % CR_STROKE) / CR_STROKE
        return u, Smooth(u / CR_REACH) if u < CR_REACH else 1 - Smooth((u - CR_REACH) / (1 - CR_REACH))

    def Pose(t):
        f = dict(base)
        u, k = Stroke(t)                        # k: 0 = reached forward / knee drawn up, 1 = end of the push
        pulling = u < CR_REACH
        # the left forearm: elbow planted far forward, slid back during the pull; lifted and carried forward after
        yE = -.44 + travel * k                  # elbow y (source): slides back exactly the stroke's travel
        liftA = 0.0 if pulling else math.sin(math.pi * (u - CR_REACH) / (1 - CR_REACH)) * .07
        f['hand.L'] = (SX + .04, yE - .22, .07 + liftA)
        f['armPole.L'] = (SX + .70, yE + .05, -.12 + liftA)
        f['palmF.L'], f['palmN.L'], f['curl.L'] = Unit((-.25, -1, -.1)), (0, 0, -1), .65
        # the right knee: drawn up to the side and pushing back to a straight leg
        dk = 1 - k
        f['ankle.R'] = (-(H + .10 + .28 * dk), .86 - .48 * dk, T.R(.10) + .03 * dk + (0.0 if pulling else .03 * math.sin(math.pi * k)))
        f['legPole.R'] = (-(H + .25 + .80 * dk), .40 - .45 * dk, -.15 + .10 * dk)
        f['toeDir.R'] = Unit((-.30 - .25 * dk, .90 - .35 * dk, -.30 + .15 * dk))
        # the trunk rides the push: forward and up a little, rolling onto the right hip as the knee comes up
        f['pelvis'] = (-.01 * dk, .025 * math.sin(Tau * u), base['pelvis'][2] + .012 * math.sin(math.pi * k))
        f['pelvisTilt'] = (1.50, -.10 - .10 * dk, -.05 * dk)
        f['twist'] = .06 * (k - .5)
        f['bend'] = base['bend'] - .04 * math.sin(math.pi * k)
        f['head'] = (base['head'][0] + .04 * math.sin(Tau * u), 0, .04 * (k - .5))
        # the right arm hugs the bundle under the right chest: the forearm across, the hand at the left chest
        f['handRel.R'] = (.10, -.17, -.10)
        f['poleRel.R'] = (-.40, .10, -.45)
        f['palmF.R'], f['palmN.R'], f['curl.R'] = (1, 0, .1), (0, -.3, 1), .85
        f['hand.R'] = (-.05, -.40, .10)
        f['armPole.R'] = (-(SX + .45), -.30, -.30)
        return T.Nest(f)

    def Bundle():
        # in the right fist under the right chest: the handles along the body, toward the head
        fr = _base['BodyFrame'](K)
        centre = K['GripPoint']('R') - fr['back'] * T.R(.045) + fr['left'] * T.R(.02)
        return centre, fr['up'], -fr['back']

    def Props(t):
        c, a, u = Bundle()
        u = (u - a * u.dot(a)).normalized()
        return {'bundle': (tuple(c), tuple(a), tuple(u), True)}

    def Review(t):
        c, a, u = Bundle()
        return [('cyl', tuple(c - a * T.R(.14)), tuple(c + a * T.R(.14)), T.R(.06))]
    return {'pose': Pose, 'props': Props, 'reviewProps': Review,
            'reviewViews': Views((0, -.2, .2), 3.0, .5, top=True) + [('under', (-.9, -1.6, .25), (0, -.35, .15))], 'reviewScale': 2.8,
            'reviewFrames': lambda n: [0, 6, 12, 18, 24, 36]}


# =================================================================================
# 5. PvClimbOutTrench -- hands on the lip, a foot up the wall, over onto the lip, crouched there (in place)
# =================================================================================
CL_T = 2.5
CL_WALL_M = .40             # runtime: the trench wall this far ahead of the root at frame 0
CL_LIP_M = 1.40             # runtime: lip over the trench floor
CL_END_FWD_M = .85          # runtime: the root at the end, past the wall (the man crouches on the lip there)
# the root path the previz plays (runtime m): (t, forward, up)
CL_PATH = [(0.0, 0.0, 0.0), (.55, 0.0, 0.0), (.80, .04, .18), (1.10, .16, .62), (1.40, .32, 1.08), (1.75, .55, 1.36),
           (2.10, .78, 1.40), (2.30, .85, 1.40), (CL_T, .85, 1.40)]
Meta('PvClimbOutTrench', CL_T, False, 'free', role='any', rootMotion=False, slung=True,
     rootPath={'note': 'IN PLACE: the previz moves the root (runtime m, along the actor\'s facing and up) by these keys '
                       '(monotone cubic between them); the clip\'s own trench wall and lip ride with it',
               'keys': [[t, f, u] for t, f, u in CL_PATH]},
     ground={'wallAheadM': CL_WALL_M, 'lipM': CL_LIP_M, 'note': 'frame 0: the wall face 0.40 m ahead of the root, the lip 1.40 m '
                                                               'over the trench floor; the root ends 0.85 m ahead of its start, 1.40 m up'},
     contacts=[{'t': .35, 'limb': 'handsLR', 'action': 'plant', 'target': 'lip'}, {'t': .80, 'limb': 'footR', 'action': 'push', 'target': 'trenchWall'},
               {'t': 1.40, 'limb': 'kneeR', 'action': 'plant', 'target': 'lip'}, {'t': 1.80, 'limb': 'handsLR', 'action': 'release', 'target': 'lip'}],
     events=[{'t': .35, 'kind': 'handsOnLip'}, {'t': 1.40, 'kind': 'kneeOnLip'}, {'t': 2.10, 'kind': 'onLip'}],
     notes='Facing the trench wall (0.40 m ahead, the lip 1.40 m up), rifle slung on the back (back-sling list): both hands '
           'onto the lip (0.35 s), a dip, the right foot up onto the wall (0.80 s), arms and leg drive him up, the chest over '
           'the lip, the right knee onto it (1.40 s), the left leg comes up (1.75 s), he rises into a crouch on the lip (2.1 s) '
           'and holds it, looking ahead. Authored IN PLACE: play it with the root moved along rootPath (forward 0.85 m, up '
           '1.40 m: 0.55-2.1 s), the last frame is a crouch on the lip at the moved root.')


def ClimbPath(T):
    ch = Channel([(t, (f, u)) for t, f, u in CL_PATH])

    def At(t):
        f, u = ch(t)
        return R(T, f), R(T, u)               # source forward, up
    return At


@Builder('PvClimbOutTrench')
def BuildClimb(T, name):
    H, P, A, SX, SZ = T.H, T.P, T.A, T.SX, T.SZ
    W, D = R(T, CL_WALL_M), R(T, CL_LIP_M)
    path = ClimbPath(T)

    def L(p, t):
        """World (trench) point -> the clip's local frame (the root moved by the path)."""
        f, u = path(t)
        return (p[0], p[1] + f, p[2] - u)
    # keys in the WORLD trench frame (source m: +X his left, -Y toward the wall, z up from the trench floor)
    lipY = -W                                   # the wall face; the lip top is y < -W at z = D
    hands1 = {'L': (SX + .05, lipY - .10, D + .045), 'R': (-(SX + .05), lipY - .10, D + .045)}
    hands2 = {'L': (SX + .02, lipY - .45, D + .045), 'R': (-(SX + .02), lipY - .45, D + .045)}

    def LipHand(s, t):
        # planted at the edge, then (1.22-1.42 s, one after the other) moved further onto the lip to push up from
        u = Smooth((t - (1.22 if s == 'R' else 1.30)) / .14)
        p = Lerp3(hands1[s], hands2[s], u)
        return (p[0], p[1], p[2] + R(T, .10) * math.sin(math.pi * u))
    stand = T.Stand()
    crouch = {'pelvis': (0, lipY - R(T, .45), D + .48), 'pelvisTilt': (.30, 0, 0), 'bend': .38,
              'ankle.L': (H + .06, lipY - R(T, .48), D + A), 'ankle.R': (-(H + .06), lipY - R(T, .38), D + A),
              'legPole.L': (H + .30, lipY - 1.6, D + .55), 'legPole.R': (-(H + .30), lipY - 1.5, D + .55),
              'foot.L': (0, 10, 0), 'foot.R': (0, -10, 0), 'neck': (-.18, 0, 0), 'head': (-.20, 0, 0)}
    base = dict(stand)
    base.update({'pelvis': (0, .02, P - .035), 'neck': (-.10, 0, 0), 'head': (-.15, 0, 0)})
    rows = [
        (0.0, {}),
        (.35, {'pelvis': (0, -.02, P - .05), 'pelvisTilt': (.08, 0, 0), 'bend': .10, 'neck': (-.18, 0, 0), 'head': (-.20, 0, 0)}),
        # the dip before the jump
        (.55, {'pelvis': (0, .02, P - .14), 'pelvisTilt': (.15, 0, 0), 'bend': .16,
               'ankle.R': (-(H + .02), .03, A + .03), 'foot.R': (15, -6, 0)}),
        # the right foot up on the wall face, the body rising on the arms
        (.80, {'pelvis': (0, -.08, P + .10), 'pelvisTilt': (.20, 0, 0), 'bend': .25,
               'ankle.R': (-(H + .02), lipY + R(T, .19), .55), 'legPole.R': (-(H + .2), lipY - 1.2, 1.2), 'foot.R': (-25, -6, 0),
               'ankle.L': (H + .03, -.02, A + .10), 'foot.L': (30, 6, 0)}),
        # driving up: hips at the lip, the chest over it, the left leg hanging
        (1.10, {'pelvis': (0, lipY + .10, D - .10), 'pelvisTilt': (.55, 0, 0), 'bend': .50, 'neck': (-.25, 0, 0),
                'ankle.R': (-(H + .02), lipY + R(T, .19), D - .40), 'legPole.R': (-(H + .2), lipY - 1.3, D + .3), 'foot.R': (-25, -6, 0),
                'ankle.L': (H + .03, lipY + .30, .40), 'legPole.L': (H + .2, lipY - .6, .9), 'foot.L': (40, 6, 0)}),
        # the right knee on the lip (the shin back along it, the foot over the edge), the hands planted further on, the left
        # leg hanging
        (1.40, {'pelvis': (-.02, lipY + .06, D + .40), 'pelvisTilt': (.80, 0, 0), 'bend': .45, 'neck': (-.35, 0, 0), 'head': (-.30, 0, 0),
                'ankle.R': (-(H + .04), lipY + .25, D + .09), 'legPole.R': (-(H + .1), lipY - 1.0, D - .60), 'foot.R': (55, -6, 0),
                'ankle.L': (H + .04, lipY + .30, D - .50), 'legPole.L': (H + .2, lipY - .8, D - .1), 'foot.L': (35, 6, 0)}),
        # the left knee comes up, the foot clearing the edge
        (1.58, {'pelvis': (0, lipY - .02, D + .42), 'pelvisTilt': (.70, 0, 0), 'bend': .45,
                'ankle.L': (H + .05, lipY + .16, D + .20), 'legPole.L': (H + .25, lipY - 1.4, D + .60), 'foot.L': (30, 6, 0)}),
        # the left foot onto the lip, the right foot coming under
        (1.75, {'pelvis': (0, lipY - .20, D + .44), 'pelvisTilt': (.55, 0, 0), 'bend': .45,
                'ankle.L': (H + .06, lipY - R(T, .30), D + A), 'legPole.L': (H + .30, lipY - 1.6, D + .55), 'foot.L': (0, 8, 0),
                'ankle.R': (-(H + .04), lipY - .06, D + A + .03), 'legPole.R': (-(H + .2), lipY - 1.4, D + .4), 'foot.R': (25, -6, 0)}),
        # up into the crouch
        (2.10, dict(crouch, pelvis=Add3(crouch['pelvis'], (0, .03, -.04)), bend=.45)),
        (2.30, crouch),
        (CL_T, {}),
    ]
    anim = Keys(base, rows, lag={'head': .05, 'neck': .03})
    hangL = (SX + .02, .01, P - .10)
    hangR = (-(SX + .02), .01, P - .10)
    onLip = Rows([(0.0, 0.0), (.12, 0.0), (.35, 1.0), (1.50, 1.0), (1.84, 0.0), (CL_T, 0.0)])

    def Pose(t):
        f = anim(t)
        w = onLip(t)
        late = t > 1.0
        # off the lip: the hands at his sides (early) or on his knees in the crouch (late)
        knees = {'L': Add3(f['ankle.L'], (.02, -.16, .38)), 'R': Add3(f['ankle.R'], (-.02, -.16, .38))}
        for s, sign in (('L', 1), ('R', -1)):
            free = knees[s] if late else (hangL if s == 'L' else hangR)
            f['hand.' + s] = Lerp3(free, LipHand(s, t), w)
            f['armPole.' + s] = Lerp3((sign * (SX + .45), .40, P - .10), (sign * (SX + .50), .30, D - .20), w)
            f['palmF.' + s] = Unit(Lerp3((0, -.2, -1), (0, -1, -.05), w))
            f['palmN.' + s] = Unit(Lerp3((-sign, 0, 0), (0, 0, -1), w))
            f['curl.' + s] = Mix(.45, .30, w)
        # into the root frame that rides the path
        for key in list(f):
            if f[key] is not None and (key == 'pelvis' or key.startswith(('ankle.', 'legPole.', 'hand.', 'armPole.'))):
                f[key] = L(f[key], t)
        return T.Nest(f)

    def Ground(x, y, t):
        fw, up = path(t)
        return (D if (y - fw) < -W and t > 1.34 else 0.0) - up

    def Weight(t):
        # hanging on the hands with a foot on the wall (0.55-1.45 s): the authored heights hold
        return 1.0 - Smooth((t - .50) / .08) * (1 - Smooth((t - 1.38) / .10))

    def Walls(t):
        fw, up = path(t)
        return [((0, -W + fw, 0), (0, 1, 0), (0, 0, D - up), (0, 0, -1))]

    def Review(t):
        fw, up = path(t)
        return [('box', (0, -W + fw - .6, D / 2 - up), (2.0, 1.2, D), 0), ('box', (0, -W + fw + .9, -up - .01), (2.0, 1.8, .02), 0)]
    return {'pose': Pose, 'ground': Ground, 'groundWeight': Weight, 'walls': Walls, 'reviewProps': Review,
            # the finger roots on the lip (the targets above are wrists): 8 cm on from the wrist, 3 cm down
            'check': lambda t: {s: Add3(L(LipHand(s, t), t), (0, -R(T, .075), -.03)) for s in LR if .40 <= t <= 1.20},
            'reviewViews': [('side', (-3.4, -.30, .70), (0, -.30, .40)), ('q', (-2.3, 2.6, 1.9), (0, -.30, .40)),
                            ('back', (.4, 3.2, 1.2), (0, -.30, .40))],
            'reviewScale': 3.2, 'reviewFrames': lambda n: [0, 8, 13, 19, 26, 30, 34, 38, 42, 50, n - 1]}


# =================================================================================
# 6-8. Two men supporting a wounded man who hops on his left leg (the right one wounded, held off the ground)
# =================================================================================
SP_T = 1.2                  # one cycle: two hops of the wounded man, one step of each foot of the supporters
SP_SPEED = .90              # runtime m/s
SP_GAP_M = .50              # runtime: each supporter's centre line this far out from the wounded man's
SP_AHEAD_M = .06            # runtime: the supporters this far ahead of him
HOP_STANCE = .62            # fraction of a hop on the foot
STAGES['supportWalk'] = {
    'anchor': 'wounded',
    'notes': 'Three abreast, all facing the wounded man\'s facing and moving together at the same speed: the left supporter '
             '(PvSupportWalkL) 0.50 m to the wounded man\'s left and 0.06 m ahead, the right one (PvSupportWalkR) mirrored. '
             'The three clips share one clock (start them together; same loop length 1.2 s, same referenceSpeedMps 0.9). The '
             'wounded man\'s left arm lies over the left supporter\'s shoulders, the hand on top of the supporter\'s left '
             'shoulder (the supporter\'s left hand holds it); the supporter\'s right arm round the wounded man\'s back, the '
             'hand on his belt behind the left hip. Mirrored on the right.',
    'actors': {'wounded': {'rig': 'TengxianNra02', 'clip': 'PvSupportedHop', 'x': 0.0, 'z': 0.0, 'yawDeg': 0},
               'supporterL': {'rig': 'TengxianNra02', 'clip': 'PvSupportWalkL', 'x': -SP_GAP_M, 'z': -SP_AHEAD_M, 'yawDeg': 0},
               'supporterR': {'rig': 'TengxianNra02', 'clip': 'PvSupportWalkR', 'x': SP_GAP_M, 'z': -SP_AHEAD_M, 'yawDeg': 0}}}
_SP_NOTE = (' In place: the root stays put, the stance foot slides back at referenceSpeedMps 0.9 (runtime m/s); play rate = '
            'actual speed / 0.9, all three at the same rate. Stage supportWalk has the spacing.')
Meta('PvSupportWalkL', SP_T, True, 'free', role='supporterL', rootMotion=False, referenceSpeedMps=SP_SPEED, slung=True,
     stage='supportWalk', contacts=[{'t': 0.0, 'limb': 'handR', 'action': 'hold', 'partnerRole': 'wounded', 'part': 'beltBackL'},
                                    {'t': 0.0, 'limb': 'handL', 'action': 'hold', 'partnerRole': 'wounded', 'part': 'handL'}],
     notes='The supporter on the wounded man\'s LEFT (the wounded man on his right): walks leaning a little toward him, his '
           'right arm round the wounded man\'s back (hand on the belt behind the wounded man\'s left hip), his left hand up at '
           'his own left shoulder holding the wounded man\'s left hand that hangs over it. Rifle slung on the back.' + _SP_NOTE)
Meta('PvSupportWalkR', SP_T, True, 'free', role='supporterR', rootMotion=False, referenceSpeedMps=SP_SPEED, slung=True,
     stage='supportWalk', contacts=[{'t': 0.0, 'limb': 'handL', 'action': 'hold', 'partnerRole': 'wounded', 'part': 'beltBackR'},
                                    {'t': 0.0, 'limb': 'handR', 'action': 'hold', 'partnerRole': 'wounded', 'part': 'handR'}],
     notes='Mirror of PvSupportWalkL: on the wounded man\'s RIGHT, the left arm round his back, the right hand holding the '
           'wounded man\'s right hand over his own right shoulder. Rifle slung on the back.' + _SP_NOTE)
Meta('PvSupportedHop', SP_T, True, 'free', role='wounded', rootMotion=False, referenceSpeedMps=SP_SPEED, stage='supportWalk',
     contacts=[{'t': 0.0, 'limb': 'handL', 'action': 'hold', 'partnerRole': 'supporterL', 'part': 'shoulderL'},
               {'t': 0.0, 'limb': 'handR', 'action': 'hold', 'partnerRole': 'supporterR', 'part': 'shoulderR'}],
     notes='The wounded man between them: both arms over their shoulders, hunched, hopping on the LEFT foot (two hops a loop, '
           'off the ground 0.23 s each), the right leg (wounded) bent and held off the ground behind. No rifle.' + _SP_NOTE)


def HopPelvis(T, t):
    """The wounded man's pelvis target (source m, his frame) at clip time t: hunched, dipping on the landing, rising
    into the hop, swayed over the left foot."""
    P = T.P
    u = (t / (SP_T / 2)) % 1.0
    if u < HOP_STANCE:
        s = u / HOP_STANCE
        z = -.035 * math.sin(math.pi * s) ** 1.5           # absorb on the landing, push up out of it
    else:
        s = (u - HOP_STANCE) / (1 - HOP_STANCE)
        z = .030 * math.sin(math.pi * s)
    return (.045, .06, P - .075 + z)


def WoundedBelt(T, t, side):
    """Where a supporter's hand holds the wounded man's belt behind his `side` hip (source m, the wounded man's frame)."""
    p = HopPelvis(T, t)
    sign = 1 if side == 'L' else -1
    return (p[0] + sign * T.R(.10), p[1] + T.R(.12), p[2] + T.R(.22))


def ToSupporterL(T, p):
    """Wounded man's frame -> the left supporter's frame (source m)."""
    return (p[0] - R(T, SP_GAP_M), p[1] + R(T, SP_AHEAD_M), p[2])


def FromSupporterL(T, p):
    return (p[0] + R(T, SP_GAP_M), p[1] - R(T, SP_AHEAD_M), p[2])


def SupporterFlat(T, t, belt):
    """The left supporter's flat pose at t; `belt`: where his right hand holds (his frame, source m)."""
    H, P, A, SX, SZ = T.H, T.P, T.A, T.SX, T.SZ
    stride = R(T, SP_SPEED) * SP_T * .60
    f = T.Stand()
    u = (t / SP_T) % 1.0
    f.update({'pelvis': (-.015 - .012 * math.cos(Tau * (u - .30)), .02, P - .12 + .012 * math.cos(Tau * (2 * u - .6))),
              'pelvisTilt': (.14, -.03, .05 * math.sin(Tau * (u - .05))), 'bend': .20, 'lean': -.08,
              'twist': -.04 * math.sin(Tau * (u - .05)) - .04, 'neck': (-.04, 0, -.05), 'head': (-.04, 0, -.06), 'shrug': .06})
    for s, sign, phase in (('L', 1, 0.0), ('R', -1, .5)):
        y, z, uu, pitch = Tread(t, SP_T, phase, .60, stride, .07)
        TreadFoot(T, f, s, sign * (H + .02), y, z, pitch, sign * 6)
        f['legPole.' + s] = (sign * (H + .22), -.95, .45)
    # right arm round the wounded man's back
    f['hand.R'] = belt
    f['armPole.R'] = (-(SX + .10), .60, P + .05)
    f['palmF.R'], f['palmN.R'], f['curl.R'] = Unit((-.6, .2, -.75)), Unit((.6, -.6, 0)), .70
    # left hand up at the left shoulder, holding the hand that hangs over it
    f['handRel.L'] = (-.05, -.13, -.05)
    f['poleRel.L'] = (.35, .10, -.45)
    f['palmF.L'], f['palmN.L'], f['curl.L'] = (-.3, -.2, 1), (-.2, 1, 0), .80
    return f


def SupporterProbe(T):
    """The left supporter's left shoulder, neck and ghost bones over one cycle (his frame, source m), posed in the rig."""
    if 'pvSup' in T.cache:
        return T.cache['pvSup']
    K = T.K
    rows = []
    n = 24
    for i in range(n + 1):
        t = SP_T * i / n
        belt = ToSupporterL(T, WoundedBelt(T, t, 'L'))
        K['Reset']()
        p = T.Nest(SupporterFlat(T, t, belt))
        K['ApplyPose'](p, 0.0)
        p['post']()
        K['Update']()
        rows.append((t, {'shoulder': K['Point'](K['Bone']('L UpperArm')).copy(), 'neck': K['Point'](K['Bone']('Neck')).copy(),
                         'clav': K['Point'](K['Bone']('L Clavicle')).copy(),
                         'hand': K['GripPoint']('L').copy(),
                         'ghost': [K['Point'](K['Bone'](b)).copy() for b in GHOST_BONES]}))
    K['Reset']()
    T.cache['pvSup'] = rows
    return rows


def ProbeAt(rows, t, key):
    t = t % SP_T
    n = len(rows) - 1
    x = t / SP_T * n
    i = min(int(x), n - 1)
    w = x - i
    a, b = rows[i][1][key], rows[i + 1][1][key]
    if isinstance(a, list):
        return [p.lerp(q, w) for p, q in zip(a, b)]
    return a.lerp(b, w)


def WoundedShoulderHand(T, t, side):
    """Where the wounded man's `side` hand lies: on top of that supporter's outer shoulder (the wounded man's frame)."""
    rows = SupporterProbe(T)
    sh, nk = ProbeAt(rows, t, 'shoulder'), ProbeAt(rows, t, 'neck')
    top = nk.lerp(sh, .70) + Vector((0, -T.R(.02), T.R(.075)))
    p = FromSupporterL(T, tuple(top))
    return p if side == 'L' else (-p[0], p[1], p[2])


def Ghost(points, mirror=False, shift=(0, 0)):
    pts = [Vector(((-p.x if mirror else p.x) + shift[0], p.y + shift[1], p.z)) for p in points]
    out = [('cyl', tuple(pts[a]), tuple(pts[b]), .028) for a, b in GHOST_LINKS]
    out.append(('point', tuple(pts[3]), None, .08))
    return out


SP_VIEWS = lambda c: [('front', (c[0] + .2, c[1] - 3.6, c[2] + .35), c), ('back', (c[0] - .3, c[1] + 3.6, c[2] + .8), c),
                      ('q', (c[0] - 2.4, c[1] - 2.6, c[2] + 1.2), c), ('side', (c[0] - 3.6, c[1], c[2] + .2), c)]


def WoundedProbe(T):
    """The wounded man's ghost bones over one cycle (his frame, source m), posed in the rig."""
    if 'pvHop' in T.cache:
        return T.cache['pvHop']
    K = T.K
    flat = BUILDERS['PvSupportedHop'](T, 'PvSupportedHop')['flat']
    rows = []
    n = 24
    for i in range(n + 1):
        t = SP_T * i / n
        K['Reset']()
        K['ApplyPose'](T.Nest(flat(t)), 0.0)
        K['Update']()
        rows.append((t, {'ghost': [K['Point'](K['Bone'](b)).copy() for b in GHOST_BONES]}))
    K['Reset']()
    T.cache['pvHop'] = rows
    return rows


def BuildSupporter(T, side):
    rows = SupporterProbe(T)

    def Flat(t):
        if side == 'L':
            return SupporterFlat(T, t, ToSupporterL(T, WoundedBelt(T, t, 'L')))
        b = WoundedBelt(T, t, 'R')                       # mirrored into a left supporter's frame, posed, mirrored back
        return Mirror(SupporterFlat(T, t, ToSupporterL(T, (-b[0], b[1], b[2]))))

    def Pose(t):
        return T.Nest(Flat(t))
    sign = 1 if side == 'L' else -1
    gx = -sign * R(T, SP_GAP_M)

    def Review(t):
        # the wounded man's hands on the shoulders and his belt, as points (this supporter's frame)
        hand = WoundedShoulderHand(T, t, side)
        belt = WoundedBelt(T, t, side)
        to = lambda p: (p[0] + gx, p[1] + R(T, SP_AHEAD_M), p[2])
        ghost = Ghost(ProbeAt(WoundedProbe(T), t, 'ghost'), False, (gx, R(T, SP_AHEAD_M)))
        return [('point', to(hand), None, .04), ('point', to(belt), None, .04)] + ghost
    c = (gx * .5, 0, .9)
    return {'pose': Pose, 'reviewProps': Review, 'reviewViews': SP_VIEWS(c), 'reviewScale': 2.6,
            'reviewFrames': lambda n: [0, 7, 14, 21]}


@Builder('PvSupportWalkL')
def BuildSupportL(T, name):
    return BuildSupporter(T, 'L')


@Builder('PvSupportWalkR')
def BuildSupportR(T, name):
    return BuildSupporter(T, 'R')


@Builder('PvSupportedHop')
def BuildHop(T, name):
    H, P, A, SX, SZ = T.H, T.P, T.A, T.SX, T.SZ
    half = SP_T / 2
    stride = R(T, SP_SPEED) * half * HOP_STANCE         # the foot slides this far back while on the ground
    SupporterProbe(T)

    def Flat(t):
        f = T.Stand()
        f['pelvis'] = HopPelvis(T, t)
        u = (t / half) % 1.0
        f.update({'pelvisTilt': (.18, .03, -.04), 'bend': .22, 'lean': .03, 'twist': .02, 'shrug': .22,
                  'neck': (-.10, 0, 0), 'head': (-.04 + .03 * math.sin(Tau * u), 0, 0)})
        # the left foot: on the ground for the stance, in the air for the hop (it swings forward)
        if u < HOP_STANCE:
            s = u / HOP_STANCE
            y, z = -stride / 2 + stride * s, 0.0
            pitch = 22.0 * Smooth((s - .70) / .30)
        else:
            s = (u - HOP_STANCE) / (1 - HOP_STANCE)
            y = stride / 2 - stride * (.5 - .5 * math.cos(math.pi * s))
            z = .045 * math.sin(math.pi * s)
            pitch = 22.0 * (1 - Smooth(s / .5)) - 6 * Smooth((s - .5) / .5)
        TreadFoot(T, f, 'L', H + .01, y + .02, z, pitch, 4)
        f['legPole.L'] = (H + .20, -.95, .45)
        # the right leg held up behind, the knee bent, swinging a little with the hops
        sw = math.sin(Tau * u)
        f['ankle.R'] = (-(H + .03), .26 + .03 * sw, .36 + .03 * sw)
        f['legPole.R'] = (-(H + .15), -1.0, .40)
        f['foot.R'] = (35, -6, 0)
        # the arms over the supporters' shoulders
        for s, sign in (('L', 1), ('R', -1)):
            spot = WoundedShoulderHand(T, t, s)
            f['grip.' + s] = spot
            f['hand.' + s] = spot
            f['armPole.' + s] = (sign * (SX + .30), .45, SZ + .45)
            f['palmF.' + s] = Unit((sign * .45, -.35, -.80))
            f['palmN.' + s] = Unit((sign * .20, .05, -1))
            f['curl.' + s] = .70
        return f

    def Pose(t):
        return T.Nest(Flat(t))

    def Ground(t):
        u = (t / half) % 1.0
        if u < HOP_STANCE:
            return 1.0
        s = (u - HOP_STANCE) / (1 - HOP_STANCE)
        return 1.0 - Smooth(s / .25) * (1 - Smooth((s - .75) / .25))

    rows = SupporterProbe(T)

    def Review(t):
        g = ProbeAt(rows, t, 'ghost')
        gx, gy = R(T, SP_GAP_M), -R(T, SP_AHEAD_M)
        return Ghost(g, False, (gx, gy)) + Ghost(g, True, (-gx, gy))
    return {'pose': Pose, 'flat': Flat, 'groundWeight': Ground, 'reviewProps': Review, 'reviewViews': SP_VIEWS((0, 0, .9)), 'reviewScale': 2.6,
            'reach': {'fraction': .95, 'travel': 0.0, 'bend': 0.0, 'sink': 0.0},
            'check': lambda t: {s: WoundedShoulderHand(T, t, s) for s in LR},
            'reviewFrames': lambda n: [0, 4, 8, 11, 14, 21]}


# =================================================================================
# 9. PvShoulderShove -- walking, turns the left shoulder in and shoves the man coming the other way ("往哪走！")
# =================================================================================
SH_T = 1.2
SH_CONTACT = .42
SH_SPEED = 1.0
Meta('PvShoulderShove', SH_T, False, 'oneHandRight', role='shover', rootMotion=False, referenceSpeedMps=SH_SPEED, props=['weapon'],
     weaponState='oneHandRight',
     contacts=[{'t': 0.0, 'limb': 'handR', 'action': 'hold', 'target': 'weapon'},
               {'t': SH_CONTACT, 'limb': 'handL', 'action': 'shove', 'target': 'chestFront', 'atM': [-.12, 1.25, -.50]}],
     events=[{'t': SH_CONTACT, 'kind': 'shove'}],
     notes='Walking (in place, referenceSpeedMps 1.0), the rifle carried low in the right hand (stock wrist, muzzle forward and '
           'down; weapon track); turns his left shoulder in and shoves with the left hand: contact 0.42 s at 0.12 m to his left, '
           '1.25 m up, 0.50 m ahead: the oncoming man\'s chest), the head turned at him; back to '
           'walking by 1.0 s. The previz keeps moving him through it (the shove is a beat while walking past).')


@Builder('PvShoulderShove')
def BuildShove(T, name):
    H, P, A, SX, SZ = T.H, T.P, T.A, T.SX, T.SZ
    period = 1.1
    stride = R(T, SH_SPEED) * period * .60
    push = Rows([(0.0, 0.0), (.18, .15), (SH_CONTACT - .06, .85), (SH_CONTACT, 1.0), (.55, .95), (.80, .30), (1.0, 0.0), (SH_T, 0.0)])
    touch = (R(T, .12), -R(T, .50), R(T, 1.25))

    def Pose(t):
        f = T.Stand()
        u = (t / period) % 1.0
        k = push(t)
        f.update({'pelvis': (-.012 * math.cos(Tau * (u - .30)), .02 - .03 * k, P - .05 + .012 * math.cos(Tau * (2 * u - .6))),
                  'pelvisTilt': (.06, 0, -.15 * k + .05 * math.sin(Tau * (u - .05))), 'bend': .10 + .06 * k,
                  'lean': .04 * k, 'twist': -.45 * k - .04 * math.sin(Tau * (u - .05)), 'shrug': .10 * k,
                  'neck': (-.04, 0, .15 * k), 'head': (-.04, 0, .30 * k)})
        for s, sign, phase in (('L', 1, 0.0), ('R', -1, .5)):
            y, z, uu, pitch = Tread(t, period, phase, .60, stride, .07)
            TreadFoot(T, f, s, sign * (H + .02), y, z, pitch, sign * 6)
            f['legPole.' + s] = (sign * (H + .22), -.95, .45)
        # the left hand: swinging with the walk, then out at the oncoming man's chest
        swing = math.sin(Tau * (t / period))
        free = (.06, -.10 + .10 * swing, -.47)
        f['handRel.L'] = free
        f['handRelW.L'] = 1 - Smooth(k / .8)
        f['hand.L'] = (touch[0], touch[1] + .02, touch[2] - .085)      # the wrist under the palm on his chest
        f['armPole.L'] = (SX + .55, .10, SZ - .45)
        f['palmF.L'], f['palmN.L'], f['curl.L'] = (0, -.2, -1), (-1, 0, 0), .45
        f['palmFw.L'], f['palmNw.L'] = Unit((-.15, -.1, 1)), Unit((0, -1, .1))
        # the rifle low in the right hand
        rifle = T.Rifle((-(SX + .05), -.10 + .03 * swing, P + .09), Unit((.05, -.94, -.34)))
        f['grip.R'] = rifle['gripR']
        palms = T.Palms(rifle['axis'])
        f['palmF.R'], f['palmN.R'], f['curl.R'] = palms['R'][0], palms['R'][1], .95
        f['armPole.R'] = (-(SX + .35), .45, SZ - .40)
        f['_rifle'] = rifle
        return f

    def Nested(t):
        f = Pose(t)
        f.pop('_rifle')
        return T.Nest(f)
    return {'pose': Nested, 'props': lambda t: {'weapon': RifleTrack(T, Pose(t)['_rifle'])},
            'reach': {'fraction': .95, 'travel': 0.0, 'bend': 0.0, 'sink': 0.0},
            'check': lambda t: {'L': touch} if abs(t - SH_CONTACT) < .03 else {},
            'reviewProps': lambda t: T.RifleProps(Pose(t)['_rifle']) + [('point', touch, None, .05)],
            'reviewViews': Views((0, -.2, .9), 3.2, .6, top=True), 'reviewScale': 2.6,
            'reviewFrames': lambda n: [0, 5, 10, 13, 20, n - 1]}


# =================================================================================
# 10. PvCrouchRunPullBehind -- crouched run, the left hand back, fist in the collar of the man behind (Shunzi)
# =================================================================================
TW_T = 1.0
TW_SPEED = 1.4
TW_COLLAR_M = (.22, .18, .90)       # runtime: the collar he holds, (left, behind, up) of the root
Meta('PvCrouchRunPullBehind', TW_T, True, 'oneHandRight', role='luo', rootMotion=False, referenceSpeedMps=TW_SPEED,
     props=['weapon', 'collar'], weaponState='oneHandRight',
     contacts=[{'t': 0.0, 'limb': 'handR', 'action': 'hold', 'target': 'weapon'},
               {'t': 0.0, 'limb': 'handL', 'action': 'hold', 'target': 'player', 'part': 'collarBack'}],
     notes='Crouched run (in place, referenceSpeedMps 1.4), the chest turned a little to his left, the left arm back with the '
           'fist in the collar of the man behind him (Shunzi, first person): the fist stays about 0.22 m to his left, 0.18 m '
           'behind the root, 0.90 m up (prop track `collar`: the fist point; the first-person camera can be pulled by it), '
           'tugging with each stride. The rifle in the right hand, low and forward (stock wrist, weapon track).')


@Builder('PvCrouchRunPullBehind')
def BuildTow(T, name):
    H, P, A, SX, SZ = T.H, T.P, T.A, T.SX, T.SZ
    K = T.K
    stride = R(T, TW_SPEED) * TW_T * .52
    collar = R(T, (TW_COLLAR_M[0], TW_COLLAR_M[1], TW_COLLAR_M[2]))

    def Flat(t):
        f = T.Stand()
        u = (t / TW_T) % 1.0
        f.update({'pelvis': (-.015 * math.cos(Tau * (u - .26)), .04, P - .19 + .018 * math.cos(Tau * (2 * u - .52))),
                  'pelvisTilt': (.22, 0, .10 + .06 * math.sin(Tau * (u - .05))), 'bend': .18, 'lean': .03,
                  'twist': .22 - .05 * math.sin(Tau * (u - .05)), 'shrug': .05,
                  'neck': (-.18, 0, -.18), 'head': (-.22, 0, -.20)})
        for s, sign, phase in (('L', 1, 0.0), ('R', -1, .5)):
            y, z, uu, pitch = Tread(t, TW_T, phase, .52, stride, .10)
            TreadFoot(T, f, s, sign * (H + .03), y, z, pitch, sign * 8)
            f['legPole.' + s] = (sign * (H + .22), -1.0, .45)
        tug = .03 * math.sin(Tau * 2 * u)
        f['grip.L'] = (collar[0], collar[1] - tug, collar[2])
        f['hand.L'] = f['grip.L']
        f['armPole.L'] = (SX + .45, .10, P - .40)
        f['palmF.L'], f['palmN.L'], f['curl.L'] = Unit((-.2, .3, -1)), Unit((-1, -.2, 0)), 1.05
        swing = math.sin(Tau * u)
        rifle = T.Rifle((-(SX + .02), -.26 + .04 * swing, P - .06), Unit((.10, -.92, -.38)))
        f['grip.R'] = rifle['gripR']
        palms = T.Palms(rifle['axis'])
        f['palmF.R'], f['palmN.R'], f['curl.R'] = palms['R'][0], palms['R'][1], .95
        f['armPole.R'] = (-(SX + .40), .40, SZ - .45)
        f['_rifle'] = rifle
        return f

    def Pose(t):
        f = Flat(t)
        f.pop('_rifle')
        return T.Nest(f)

    def Props(t):
        rifle = Flat(t)['_rifle']
        fist = K['GripPoint']('L')
        return {'weapon': RifleTrack(T, rifle), 'collar': (tuple(fist), (0, 1, 0), (0, 0, 1), False)}
    return {'pose': Pose, 'props': Props, 'reach': {'fraction': .90, 'travel': R(T, .06), 'bend': .10, 'sink': 0.0},
            'check': lambda t: {'L': Flat(t)['grip.L']},
            'reviewProps': lambda t: T.RifleProps(Flat(t)['_rifle']) + [('point', Flat(t)['grip.L'], None, .05)],
            'reviewViews': Views((0, 0, .7), 3.2, .7, top=True), 'reviewScale': 2.6,
            'reviewFrames': lambda n: [0, 6, 12, 18]}


def MakeClips(K):
    T = Toolkit(K)
    print('PREVIZ_COMBAT_MEASURES', K['modelId'], 'scale %.4f H %.3f A %.3f F %.3f S %.3f SX %.3f SZ %.3f P %.3f'
          % (T.s, T.H, T.A, T.F, T.S, T.SX, T.SZ, T.P), flush=True)
    specs = {}
    building = K.get('Building') or (lambda name: None)
    for name in CLIPS:
        building(name)
        spec = BUILDERS[name](T, name)
        spec.setdefault('scale', K['scale'])
        spec.setdefault('modelId', K['modelId'])
        specs[name] = spec
    building(None)
    return specs
