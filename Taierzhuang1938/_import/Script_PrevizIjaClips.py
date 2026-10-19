"""Placeholder IJA clips for the FirstLevel0105 blockout previz (01-4 .. 04-2), plus two struck-captive reactions.

Same module contract as _import/Script_OpeningStoryboardClips.py (CLIPS / STAGES / PROPS / CONTACT_POINTS /
PARTNER_SOURCES / GHOST_BONES / BindCaptives / MakeClips), run by the opening frame loop through
_import/Script_PrevizIjaBake.py, baked once on the shared-skeleton reference body TengxianNra02 (every Tengxian body,
IJA ones included, is the same TengxianHumanoidV1 skeleton with the same bone names, so the one file plays on any).
The pose toolkit is the opening library's own, loaded from it; nothing there changes.

Authoring space (as the opening library): Blender metres on the rig's source scale, +Z up, forward -Y, the character's
own left +X, ground z = 0, actor root at the origin. Runtime = source x scale; the three.js actor frame is (-X, Z, Y):
a Blender point (x, y, z) is runtime (-x, z, y) x scale. Pairing numbers below are written in RUNTIME metres in
Blender axes (+X his left, -Y ahead, +Z up) and converted with RT().

The rifle is a Type38 with the bayonet fixed: gripR (model origin, the wrist of the stock) to the butt plate 0.255 m,
to the muzzle 1.029 m, to the bayonet tip 1.408 m (Script_MachineGunCaptivesAnimationTest bayonetTipM). Every rifle
clip writes a `weapon` prop track (origin = gripR, axis = muzzle direction, up), whatever its weaponHold says.

The clips (docs: Clips_PrevizIja side note; FirstLevel0105 previz lines in the comments):
  PvIjaSignalSplit         standing, rifle low in the right hand, the left hand sweeps left, then right (split in two).
  PvIjaBayonetRaiseThreat  both hands raise the rifle, bayonet point down at a man on the ground; stops at 0.6 s.
  PvIjaButtStrikeFace      the butt driven forward-down into a kneeling man's face (contact 0.42 s), back to low ready.
  PvIjaCrouchHairLift      squats at a man's head, the left fist in his hair hauls the head up; rifle slung on the back.
  PvIjaLauncherFire        Type89 grenade discharger gunner on one knee: left hand on the tube, right on the trigger.
  PvIjaLauncherLoad        the loader kneeling at the gunner's right: shell from the pouch, into the muzzle, hand away.
  PvIjaLungeParriedFall    bayonet lunge, beaten aside, stabbed in the chest, falls on his back; the rifle drops.
  PvCaptiveButtHit         kneeling captive hit in the face by a butt: head snaps back, topples sideways onto a hand.
"""
import math, os, runpy
from pathlib import Path
from mathutils import Vector, Quaternion

_here = Path(os.environ['OPENING_PROJECT']) / '_import'
_base = runpy.run_path(str(_here / 'Script_OpeningStoryboardClips.py'), run_name='PrevizIjaBase')
Toolkit, Anim, Tracks, Channel = _base['Toolkit'], _base['Anim'], _base['Tracks'], _base['Channel']
KneelFlat, Standing, IjaABase, IjaReadyBase = _base['KneelFlat'], _base['Standing'], _base['IjaABase'], _base['IjaReadyBase']
Clamp, Smooth, Unit, Add3, Lerp3, Mix = _base['Clamp'], _base['Smooth'], _base['Unit'], _base['Add3'], _base['Lerp3'], _base['Mix']
Grab, EaseGrip, Bump, SlungRifle, BodyFrame = _base['Grab'], _base['EaseGrip'], _base['Bump'], _base['SlungRifle'], _base['BodyFrame']
CrouchBase, RaInHand, RaHidden = _base['CrouchBase'], _base['RaInHand'], _base['RaHidden']
GRIP_PROTRACT, TipBack = _base['GRIP_PROTRACT'], _base['TipBack']
GHOST_BONES, GHOST_LINKS = _base['GHOST_BONES'], _base['GHOST_LINKS']
Tau = math.pi * 2
LR = ('L', 'R')

CLIPS = {}
STAGES = {}
PROPS = {}
CONTACT_POINTS = {}
PARTNER_SOURCES = {}
BUILDERS = {}

TIP_M = 1.408          # gripR -> bayonet tip, runtime m (Type38 + Type30 bayonet)
BUTT_M = .255
GRIPL_M = .30          # where the left hand goes, ahead of gripR


def BindCaptives(base):
    """No legacy clips here: the captives baker's globals are not needed."""


def Meta(name, duration, loop, hold, **extra):
    row = {'duration': duration, 'loop': loop, 'weaponHold': hold}
    row.update(extra)
    CLIPS[name] = row
    return name


def Builder(name):
    def Register(fn):
        BUILDERS[name] = fn
        return fn
    return Register


def RT(T, v):
    """Runtime metres (Blender axes) -> this rig's source metres."""
    return tuple(c / T.s for c in v) if isinstance(v, (tuple, list, Vector)) else v / T.s


def Rifle(T, origin, axis):
    r = T.Rifle(origin, axis, 'Type38')
    r['tip'] = tuple(Vector(r['origin']) + Vector(r['axis']) * T.R(TIP_M))
    return r


def RifleFromButt(T, butt, axis):
    return Rifle(T, tuple(Vector(butt) + Vector(axis).normalized() * T.R(BUTT_M)), axis)


def RifleFromTip(T, tip, axis):
    return Rifle(T, tuple(Vector(tip) - Vector(axis).normalized() * T.R(TIP_M)), axis)


def BlendRifle(T, a, b, w):
    return Rifle(T, Lerp3(a['origin'], b['origin'], w), Unit(Lerp3(a['axis'], b['axis'], w)))


def RifleKeys(T, rows):
    """[(t, rifle)] -> rifle(t): origin and axis eased key to key (Smooth), axis re-normalised."""
    def At(t):
        if t <= rows[0][0]:
            return rows[0][1]
        for (t0, a), (t1, b) in zip(rows, rows[1:]):
            if t <= t1:
                return BlendRifle(T, a, b, Smooth((t - t0) / max(1e-6, t1 - t0)))
        return rows[-1][1]
    return At


def RifleUp(axis):
    """The rifle's up (sights side) for a track: world up made square to the axis (or back when the axis is vertical)."""
    a = Vector(axis).normalized()
    up = Vector((0, 0, 1))
    if abs(a.dot(up)) > .95:
        up = Vector((0, 1, 0))
    up = (up - a * up.dot(a)).normalized()
    return tuple(up)


def RifleTrack(rifle, visible=True, up=None):
    return (rifle['origin'], rifle['axis'], up or RifleUp(rifle['axis']), visible)


def RifleReview(T, r):
    tip = r.get('tip') or tuple(Vector(r['origin']) + Vector(r['axis']) * T.R(TIP_M))
    return [('cyl', r['butt'], r['muzzle'], .018), ('cyl', r['muzzle'], tip, .007)]


def HoldRifle(T, f, rifle, w=1.0, curlR=.95, curlL=.85, sides='LR'):
    palms = T.Palms(rifle['axis'])
    if 'R' in sides:
        f['grip.R'], f['gripW.R'] = rifle['gripR'], w
        f['palmF.R'], f['palmN.R'], f['curl.R'] = palms['R'][0], palms['R'][1], curlR
    if 'L' in sides:
        f['grip.L'], f['gripW.L'] = rifle['gripL'], w
        f['palmF.L'], f['palmN.L'], f['curl.L'] = palms['L'][0], palms['L'][1], curlL
    return f


def Views(cx=0.0, cy=-.3, cz=.7, far=3.4, h=1.0):
    return [('side', (cx - far, cy, cz + h * .3), (cx, cy, cz)), ('q', (cx - far * .68, cy - far * .82, cz + h), (cx, cy, cz)),
            ('front', (cx - .3, cy - far, cz + .2), (cx, cy, cz))]


def Ghost(points, r=.05):
    out = []
    for a, b in points:
        out.append(('cyl', tuple(a), tuple(b), r))
    return out


# =================================================================================================================
# Pairing (RUNTIME metres, Blender axes in the named actor's root frame: +X his left, -Y ahead).
# =================================================================================================================
# 02-1 PvIjaBayonetRaiseThreat: the bayonet point held over a man on the ground, this far ahead, this high.
THREAT_GRIP = (-.19, -.28, 1.24)      # gripR (right fist) there, the point dropped onto THREAT_TIP_Z
THREAT_TIP_Z = .40
# 02-1 PvIjaButtStrikeFace / PvCaptiveButtHit: the captive kneels facing ijaB, his root this far ahead of ijaB's.
BUTT_CAPTIVE_M = .80
BUTT_HIT_T = .42                       # ijaB clip time of the contact
CAPTIVE_HIT_T = .04                    # PvCaptiveButtHit clip time of the same contact
# 02-1 PvIjaCrouchHairLift: Shunzi's eye (runtime m in ijaB's frame) before / after the haul; the crown 0.08 m further
# off and 0.12 m higher than the eye before the lift; the head tips back 25 deg as it comes up.
HAIR_EYE0 = (-.03, -.70, .30)
HAIR_EYE1 = (-.03, -.71, .56)
HAIR_CROWN_OFF = (0.0, -.08, .12)
HAIR_CROWN_N = (0.0, .35, .94)
HAIR_GRAB_T, HAIR_LIFT_T, HAIR_HOLD = .95, 1.50, (1.50, 3.50)
# 03 Type89 discharger, gunner frame: the base plate on the ground here, the tube 45 deg up straight ahead.
# Real size (2026-10-19 V2): overall 610 mm, barrel 254 mm, fixed 45 deg (en.wikipedia Type 89 grenade discharger, IMFDB,
# ww2db). Model_Type89Launcher.tzm.json is 0.413 m (muzzle node -0.23, base plate end +0.185 from the origin): the previz
# shows it scaled up uniformly by LAUNCHER_SCALE, and these clips hold the scaled tube.
LAUNCHER_REAL_M = .610
LAUNCHER_MODEL = (.185, .23)           # model: base plate end / muzzle from the model origin (gripR, the trigger body)
LAUNCHER_SCALE = LAUNCHER_REAL_M / (LAUNCHER_MODEL[0] + LAUNCHER_MODEL[1])
LAUNCHER_LEN = (LAUNCHER_MODEL[0] * LAUNCHER_SCALE, LAUNCHER_MODEL[1] * LAUNCHER_SCALE)
LAUNCHER_GRIPR = .09                   # right fist: trigger at the foot of the barrel, from the origin toward the muzzle
LAUNCHER_GRIPL = .22                   # left fist: the middle of the 254 mm barrel
LAUNCHER_BASE = (-.22, -.24, .0)
LAUNCHER_PITCH = 45.0
FIRE_T = 1.60                          # PvIjaLauncherFire: the shot (both 2 s loops start together)
DROP_T = .92                           # PvIjaLauncherLoad: the shell lets go into the muzzle
# The loader kneels 0.80 m out at the gunner's right, level with the muzzle, turned 90 deg left: the muzzle is straight
# ahead of him and he reaches in from the side.
LOADER_AT = (-.82, -.86)               # Blender x, y in the gunner frame (runtime m)
LOADER_YAW = 107.0                      # deg, + = turned left (toward the gunner's muzzle)
# 04-2 PvIjaLungeParriedFall: the bayonet is beaten aside at this time, the chest stab lands at STAB_T.
PARRY_T, STAB_T = .42, .86


def LauncherAt(T, recoil=0.0, pitchKick=0.0):
    """The discharger in the gunner frame (source m): base plate end on the ground at LAUNCHER_BASE, the tube pitched
    LAUNCHER_PITCH up straight ahead. recoil (runtime m) pushes it down its own axis into the ground, pitchKick (deg)
    tips the muzzle up."""
    p = math.radians(LAUNCHER_PITCH + pitchKick)
    a = Vector((0.0, -math.cos(p), math.sin(p)))
    base = Vector(RT(T, LAUNCHER_BASE)) + Vector((0, T.R(recoil) * math.cos(p), 0))
    o = base + a * T.R(LAUNCHER_LEN[0])
    return {'origin': tuple(o), 'axis': tuple(a), 'base': tuple(base), 'muzzle': tuple(o + a * T.R(LAUNCHER_LEN[1])),
            'gripR': tuple(o + a * T.R(LAUNCHER_GRIPR)), 'gripL': tuple(o + a * T.R(LAUNCHER_GRIPL)),
            'up': tuple(Vector((0, math.sin(p), math.cos(p))))}


def LauncherReview(L):
    return [('cyl', L['base'], L['muzzle'], .03), ('box', L['base'], (.14, .10, .02), 0)]


def GunnerToLoader(T, p):
    """A gunner-frame source point -> the loader's frame."""
    x, y = RT(T, LOADER_AT[0]), RT(T, LOADER_AT[1])
    a = -math.radians(LOADER_YAW)
    dx, dy = p[0] - x, p[1] - y
    return (dx * math.cos(a) - dy * math.sin(a), dx * math.sin(a) + dy * math.cos(a), p[2])


STAGES['buttFace'] = {
    'anchor': 'ijaB', 'notes': 'PvIjaButtStrikeFace + PvCaptiveButtHit (02-1, line 582-584): the captive kneels %.2f m '
    'straight ahead of ijaB facing him; the butt meets the face at ijaB %.2f s = captive %.2f s (the captive clip starts '
    '%.2f s after ijaB\'s).' % (BUTT_CAPTIVE_M, BUTT_HIT_T, CAPTIVE_HIT_T, BUTT_HIT_T - CAPTIVE_HIT_T),
    'actors': {'ijaB': {'rig': 'TengxianNra02', 'clip': 'PvIjaButtStrikeFace', 'x': 0.0, 'z': 0.0, 'yawDeg': 0},
               'captive': {'rig': 'TengxianNra02', 'clip': 'PvCaptiveButtHit', 'x': 0.0, 'z': -BUTT_CAPTIVE_M,
                           'yawDeg': 180, 'offsetS': round(BUTT_HIT_T - CAPTIVE_HIT_T, 3)}}}
STAGES['launcherCrew'] = {
    'anchor': 'gunner', 'notes': 'PvIjaLauncherFire + PvIjaLauncherLoad (03): both 2 s loops start together; the shell '
    'drops into the muzzle at %.2f s, the shot at %.2f s. The discharger (prop track `launcher` of the gunner clip) stands '
    'on its base plate %.2f m ahead and %.2f m right of the gunner root, tube 45 deg up toward -z.'
    % (DROP_T, FIRE_T, -LAUNCHER_BASE[1], -LAUNCHER_BASE[0]),
    'actors': {'gunner': {'rig': 'TengxianNra02', 'clip': 'PvIjaLauncherFire', 'x': 0.0, 'z': 0.0, 'yawDeg': 0},
               'loader': {'rig': 'TengxianNra02', 'clip': 'PvIjaLauncherLoad', 'x': -LOADER_AT[0], 'z': LOADER_AT[1],
                          'yawDeg': LOADER_YAW}}}
PROPS['launcher'] = {'model': 'Model_Type89Launcher', 'scale': round(LAUNCHER_SCALE, 4),
                     'notes': 'Model_Type89Launcher scaled uniformly by %.4f (0.413 m model -> 0.610 m real overall). Track '
                     'origin = model origin (the trigger body); axis = model -Z (muzzle direction); up = model +Y. Base plate '
                     'end %.3f m behind the origin, muzzle %.3f m ahead (scaled).' % (LAUNCHER_SCALE, LAUNCHER_LEN[0], LAUNCHER_LEN[1])}
PROPS['shell'] = {'notes': 'Type89 shell in the loader\'s right fist: centre, axis = nose direction, up. Hidden outside '
                  'the carry (it is in the pouch, then in the tube).'}


# =================================================================================================================
# metadata
# =================================================================================================================
Meta('PvIjaSignalSplit', 2.0, False, 'oneHandRight', role='ijaA', props=['weapon'], rootMotion=False,
     events=[{'t': .55, 'kind': 'signalLeft'}, {'t': 1.20, 'kind': 'signalRight'}],
     notes='01-4: standing, the rifle low in the right hand by the wrist of the stock (muzzle forward, a little down); '
           'the left arm comes up and sweeps out to his left (0.55 s), then across to his right (1.2 s), and drops. '
           'The head follows the hand.')
Meta('PvIjaBayonetRaiseThreat', 1.4, False, 'twoHand', role='ijaB', props=['weapon'], rootMotion=False,
     holdLoop=[.6, 1.4],
     notes='02-1: from low ready both hands lift the rifle high, the bayonet point down at a man on the ground '
           '(tip about 1.3 m ahead, %.2f m up at 0.6 s), pulled up for the thrust and stopped. 0.6-1.4 s is a seamless '
           'hold loop (breathing, the point trembling).' % THREAT_TIP_Z)
Meta('PvIjaButtStrikeFace', 1.0, False, 'track', role='ijaB', props=['weapon'], rootMotion=False, stage='buttFace',
     weaponState='twoHand',
     contacts=[{'t': BUTT_HIT_T, 'limb': 'butt', 'action': 'strike', 'partnerRole': 'captive', 'part': 'face'}],
     events=[{'t': BUTT_HIT_T, 'kind': 'buttHit'}], next=['PvIjaBayonetRaiseThreat'],
     notes='02-1: from low ready the rifle swings muzzle-up, the butt is cocked at the chest and driven forward-down '
           'into the face of the man kneeling %.2f m ahead (contact %.2f s, stage buttFace), then back to low ready.'
           % (BUTT_CAPTIVE_M, BUTT_HIT_T))
Meta('PvIjaCrouchHairLift', 3.5, False, 'track', role='ijaB', props=['weapon'], rootMotion=False,
     weaponState='slungBack', holdLoop=list(HAIR_HOLD), player=True,
     contacts=[{'t': HAIR_GRAB_T, 'limb': 'handL', 'action': 'grab', 'partnerRole': 'shunzi', 'part': 'crown'},
               {'t': HAIR_LIFT_T, 'limb': 'handL', 'action': 'hold', 'partnerRole': 'shunzi', 'part': 'crown'}],
     events=[{'t': HAIR_GRAB_T, 'kind': 'grabHair'}, {'t': HAIR_GRAB_T, 'kind': 'liftHead', 'untilT': HAIR_LIFT_T},
             {'t': 2.15, 'kind': 'shake'}, {'t': 3.0, 'kind': 'shake'}],
     notes='02-1: standing at the man\'s head (rifle on the back), squats, the left hand closes in the hair on his crown '
           '(%.2f s) and hauls the head up (eye %.2f -> %.2f m high, %.2f -> %.2f m ahead) by %.2f s; %.1f-%.1f s is a '
           'seamless hold loop with two shakes. The right hand rests on the right knee. Player track: head (eye), crown.'
           % (HAIR_GRAB_T, HAIR_EYE0[2], HAIR_EYE1[2], -HAIR_EYE0[1], -HAIR_EYE1[1], HAIR_LIFT_T, HAIR_HOLD[0], HAIR_HOLD[1]))
Meta('PvIjaLauncherFire', 2.0, True, 'track', role='gunner', props=['launcher', 'weapon'], rootMotion=False,
     stage='launcherCrew', weaponState='slungBack',
     events=[{'t': FIRE_T - .12, 'kind': 'triggerSqueeze'}, {'t': FIRE_T, 'kind': 'fire', 'weapon': 'Type89Launcher'}],
     notes='03 (V2, real 0.61 m discharger = Model_Type89Launcher x %.4f): gunner on the right knee sat back toward the '
           'right heel, left knee up, the base plate on the ground %.2f m right and %.2f m ahead of his root, tube 45 deg '
           'up; left hand round the middle of the barrel, right hand at the foot of the barrel on the trigger. Holds, '
           'squeezes, fires at %.2f s: the tube jolts down its axis and the shoulders kick, settles by the loop end. One shot '
           'per loop. Rifle on his back.' % (LAUNCHER_SCALE, -LAUNCHER_BASE[0], -LAUNCHER_BASE[1], FIRE_T))
Meta('PvIjaLauncherLoad', 2.0, True, 'track', role='loader', props=['shell', 'weapon'], rootMotion=False,
     stage='launcherCrew', weaponState='slungBack',
     events=[{'t': .40, 'kind': 'shellOut'}, {'t': DROP_T, 'kind': 'shellIn'}],
     notes='03 (V2): loader on both knees %.2f m out at the gunner\'s right and %.2f m ahead, turned %d deg left to face '
           'the muzzle from the side, rising off his heels for the reach. ' % (-LOADER_AT[0], -LOADER_AT[1], LOADER_YAW) +
           'The right hand takes a shell from '
           'the pouch at the front of his belt (0.40 s), lifts it over the muzzle and lets it slide in (%.2f s), snaps '
           'the hand back and turns his face away for the shot (%.2f s). Rifle on his back.' % (DROP_T, FIRE_T))
Meta('PvIjaLungeParriedFall', 2.2, False, 'track', role='ijaTrench', props=['weapon'], rootMotion=False,
     weaponState='twoHand->dropped', weaponDropFrom='PvIjaLungeParriedFall', terminal=True,
     events=[{'t': PARRY_T, 'kind': 'parried'}, {'t': STAB_T, 'kind': 'stabbed'}, {'t': .98, 'kind': 'weaponLost'},
             {'t': 1.62, 'kind': 'groundImpact'}],
     notes='04-2: lunges with the bayonet (left foot forward), the rifle is beaten aside to his left at %.2f s and he '
           'lurches after it; a bayonet in the chest at %.2f s doubles him and throws him back, the rifle falls out of '
           'his hands (0.98 s, `weapon` track to the ground ahead-left), he staggers back and falls on his back '
           '(1.62 s); the last frame is the corpse.' % (PARRY_T, STAB_T))
Meta('PvCaptiveButtHit', 1.4, False, 'free', role='captive', rootMotion=False, stage='buttFace', terminal=False,
     events=[{'t': CAPTIVE_HIT_T, 'kind': 'hitFace'}, {'t': .72, 'kind': 'handOnGround'}],
     notes='02-1: kneeling (sat a little back on the heels, hands on the thighs); the butt hits his face at %.2f s: the '
           'head snaps back, the trunk rocks back and twists, he topples onto his left side and catches himself on the '
           'left hand (0.72 s), right hand to the face. The last frame holds.' % CAPTIVE_HIT_T)


# =================================================================================================================
# 01-4 PvIjaSignalSplit
# =================================================================================================================
@Builder('PvIjaSignalSplit')
def BuildSignalSplit(T, name):
    SX, SZ, P = T.SX, T.SZ, T.P
    base = IjaABase(T)
    base.update({'handRel.L': None, 'bend': .10, 'head': (.05, 0, 0)})
    reach = T.ARM * .86
    shoulder = Vector((SX, .0, SZ - .03))
    rest = (SX + .04, -.02, SZ - .48)

    def At(d, k=1.0):
        return tuple(shoulder + Vector(Unit(d)) * reach * k)
    up = At((.30, -.90, .05))
    left = At((.95, -.30, .10))
    front = At((.15, -.98, .12), .95)
    right = At((-.80, -.55, .20), .97)
    hand = [(0.0, rest), (.30, up), (.55, left), (.72, Add3(left, (.01, .02, 0))), (.98, front), (1.20, right),
            (1.40, Add3(right, (-.01, .02, 0))), (1.70, Lerp3(right, rest, .55)), (2.0, rest)]
    poleL = [(0.0, (SX + .45, .45, SZ - .40)), (.30, (SX + .55, .25, SZ - .55)), (.98, (SX + .35, .20, SZ - .70)),
             (1.40, (SX + .15, .30, SZ - .70)), (2.0, (SX + .45, .45, SZ - .40))]
    body = Tracks(base, {
        'hand.L': hand, 'armPole.L': poleL,
        'twist': [(0.0, 0.0), (.55, .16), (.98, .0), (1.20, -.40), (1.45, -.38), (2.0, 0.0)],
        'bend': [(0.0, .10), (.55, .12), (1.20, .13), (2.0, .10)],
        'lookW': [(0.0, 0.0), (.25, .75), (1.55, .75), (2.0, 0.0)],
    }, lag={'head': .06})
    rifle = Rifle(T, (-(SX + .04), -.14, SZ - .45), Unit((.04, -.98, -.14)))

    def Pose(t):
        f = body(t)
        h = Vector(f['hand.L'])
        d = (h - shoulder)
        f['look'] = tuple(shoulder + d.normalized() * 3.0 + Vector((0, 0, .1)))
        dn = d.normalized()
        f['palmF.L'] = Unit(Lerp3((0, -.1, -1), tuple(dn), Clamp(dn.z + 1.0)))
        f['palmN.L'] = Unit(Lerp3((-1, 0, 0), (0, 0, -1), Clamp(dn.z + 1.0)))
        f['curl.L'] = .15
        HoldRifle(T, f, rifle, sides='R')
        f['armPole.R'] = (-(SX + .40), .30, P - .05)
        return T.Nest(f)
    spec = {'pose': Pose, 'props': lambda t: {'weapon': RifleTrack(rifle)}, 'plants': [('L', 0, 2.0), ('R', 0, 2.0)],
            'check': lambda t: {'R': rifle['gripR']},
            'reviewProps': lambda t: RifleReview(T, rifle),
            'reviewViews': Views(cy=-.2, cz=.9, h=1.0), 'reviewScale': 2.6,
            'reviewFrames': lambda n: [0, int(n * .15), int(n * .28), int(n * .5), int(n * .6), n - 1]}
    return spec


# =================================================================================================================
# 02-1 PvIjaBayonetRaiseThreat
# =================================================================================================================
def LowReady(T):
    H, P = T.H, T.P
    return Rifle(T, (-(H + .02), -.13, P + .22), Unit((.16, -.90, -.40)))


@Builder('PvIjaBayonetRaiseThreat')
def BuildBayonetRaise(T, name):
    SX, SZ, P = T.SX, T.SZ, T.P
    base = IjaReadyBase(T)
    g = Vector(THREAT_GRIP)
    drop = g.z - THREAT_TIP_Z
    flat = math.sqrt(max(0.0, TIP_M ** 2 - drop ** 2))
    tipRT = Vector((.0, g.y - flat, THREAT_TIP_Z))
    tip = Vector(RT(T, tipRT))
    threat = Rifle(T, RT(T, g), Unit(tipRT - g))
    print('PREVIZIJA_THREAT tip runtime', tuple(round(c, 3) for c in tipRT), flush=True)
    wound = Rifle(T, Add3(threat['origin'], (0, T.R(.05), T.R(.07))), threat['axis'])
    ready = LowReady(T)
    lifted = Rifle(T, (-(SX - .02), -.30, SZ - .05), Unit((.12, -.85, -.15)))
    rifleAt = RifleKeys(T, [(0.0, ready), (.22, lifted), (.45, wound), (.60, threat)])
    body = Tracks(base, {
        'bend': [(0.0, .20), (.22, .10), (.45, .02), (.60, .16)],
        'pelvis': [(0.0, base['pelvis']), (.45, Add3(base['pelvis'], (0, .03, .01))), (.60, Add3(base['pelvis'], (0, -.02, -.02)))],
        'twist': [(0.0, -.05), (.45, -.12), (.60, -.08)],
        'shrug': [(0.0, 0.0), (.45, .10), (.60, .06)],
    }, lag={'head': .05})
    span = 1.4 - .6

    def RifleAt(t):
        r = rifleAt(min(t, .60))
        if t > .60:
            u = t - .60
            b = math.sin(Tau * u / span)
            tremble = Bump(u, .25, .45) * math.sin(Tau * u / .07) * .004
            r = Rifle(T, Add3(r['origin'], (0, .006 * b, .010 * b + tremble)), r['axis'])
        return r

    def Pose(t):
        f = body(t)
        if t > .60:
            u = t - .60
            b = math.sin(Tau * u / span)
            f['bend'] += .012 * b
            f['shrug'] += .02 * b
        r = RifleAt(t)
        HoldRifle(T, f, r)
        f['armPole.R'] = (-(SX + .50), .25, SZ - .10)
        f['armPole.L'] = (SX + .45, -.10, P)
        f['look'] = tuple(tip + Vector((0, 0, -T.R(.20))))
        f['lookW'] = Smooth(t / .40) * .8
        return T.Nest(f)
    spec = {'pose': Pose, 'props': lambda t: {'weapon': RifleTrack(RifleAt(t))},
            'plants': [('L', 0, 1.4), ('R', 0, 1.4)], 'check': lambda t: {'R': RifleAt(t)['gripR'], 'L': RifleAt(t)['gripL']},
            'probes': lambda t: {'tipToMark': (RifleAt(t)['tip'], tuple(tip))} if t >= .6 else {},
            'reviewProps': lambda t: RifleReview(T, RifleAt(t)) + [('point', tuple(tip), None, .03),
                                                                  ('cyl', RT(T, (0, tipRT.y + .45, .12)), RT(T, (0, tipRT.y - .45, .12)), RT(T, .12))],
            'reviewViews': Views(cy=-.45, cz=.8), 'reviewScale': 2.8,
            'reviewFrames': lambda n: [0, int(n * .16), int(n * .32), int(n * .43), n - 1]}
    return spec


# =================================================================================================================
# 02-1 PvIjaButtStrikeFace / PvCaptiveButtHit
# =================================================================================================================
def CaptiveKneelBase(T):
    f = Standing(T)
    f.update(KneelFlat(T, 0.0, 0.0, sit=.30))
    f.update({'bend': .06, 'pelvisTilt': (.04, 0, 0), 'head': (.0, 0, 0), 'neck': (.0, 0, 0), 'handRel.L': None,
              'handRel.R': None})
    H = T.H
    # hands on the thighs above the knees
    kz = f['pelvis'][2]
    f['hand.L'] = (H + .07, f['pelvis'][1] - .30, kz - .02)
    f['hand.R'] = (-(H + .07), f['pelvis'][1] - .30, kz - .02)
    f['armPole.L'] = (T.SX + .40, .30, T.SZ - .40)
    f['armPole.R'] = (-(T.SX + .40), .30, T.SZ - .40)
    f['palmF.L'], f['palmN.L'], f['curl.L'] = (0, -1, -.2), (0, 0, -1), .40
    f['palmF.R'], f['palmN.R'], f['curl.R'] = (0, -1, -.2), (0, 0, -1), .40
    return f


def CaptiveFace(T):
    """The kneeling captive's face (front of the nose), his own frame, source m: estimated from the rest measures
    (KneelFlat sit .30 lowers the pelvis; the trunk is near upright)."""
    K = T.K
    kz = CaptiveKneelBase(T)['pelvis'][2]
    head = kz + (T.HD - T.P) * .985
    return (0.0, -.11, head + .07)


def CaptiveFaceInIjaB(T):
    x, y, z = CaptiveFace(T)
    return (-x, -y - RT(T, BUTT_CAPTIVE_M), z)


@Builder('PvIjaButtStrikeFace')
def BuildButtStrike(T, name):
    SX, SZ, P, H = T.SX, T.SZ, T.P, T.H
    base = IjaReadyBase(T)
    face = Vector(CaptiveFaceInIjaB(T))
    hitAxis = Unit((-.30, .78, .55))           # muzzle up and back toward him: the butt is the low, forward end
    hit = RifleFromButt(T, tuple(face + Vector((0, T.R(.01), 0))), hitAxis)
    through = RifleFromButt(T, tuple(face + Vector((0, -T.R(.03), -T.R(.04)))), hitAxis)
    cocked = RifleFromButt(T, (-.08, -.38, SZ - .13), Unit((-.32, .88, .34)))
    ready = LowReady(T)
    up1 = Rifle(T, (-(H + .06), -.24, P + .30), Unit((.15, -.30, .94)))
    rifleAt = RifleKeys(T, [(0.0, ready), (.12, up1), (.28, cocked), (BUTT_HIT_T, hit), (.50, through), (.62, hit),
                            (1.0, ready)])
    body = Tracks(base, {
        'bend': [(0.0, .20), (.28, .02), (BUTT_HIT_T, .40), (.55, .42), (1.0, .20)],
        'pelvis': [(0.0, base['pelvis']), (.28, Add3(base['pelvis'], (0, .05, 0))), (BUTT_HIT_T, Add3(base['pelvis'], (0, -.07, -.05))),
                   (.60, Add3(base['pelvis'], (0, -.06, -.04))), (1.0, base['pelvis'])],
        'twist': [(0.0, -.05), (.28, -.22), (BUTT_HIT_T, .06), (1.0, -.05)],
        'shrug': [(0.0, 0.0), (.28, .08), (BUTT_HIT_T, .02), (1.0, 0.0)],
    }, lag={'head': .04})

    def Pose(t):
        f = body(t)
        r = rifleAt(t)
        HoldRifle(T, f, r)
        f['armPole.R'] = (-(SX + .50), .35, P + .05)
        f['armPole.L'] = (SX + .45, -.05, P)
        f['look'] = tuple(face)
        f['lookW'] = .7
        return T.Nest(f)
    D = RT(T, BUTT_CAPTIVE_M)
    captive = [(Vector((0, -D, face.z - T.R(.18))), Vector((0, -D, T.R(.50)))),
               (Vector((0, -D, T.R(.50))), Vector((0, -D + T.R(.40), T.R(.12))))]
    spec = {'pose': Pose, 'props': lambda t: {'weapon': RifleTrack(rifleAt(t))},
            'plants': [('L', 0, 1.0), ('R', 0, 1.0)], 'check': lambda t: {'R': rifleAt(t)['gripR'], 'L': rifleAt(t)['gripL']},
            'probes': lambda t: {'buttToFace': (rifleAt(t)['butt'], tuple(face))} if abs(t - BUTT_HIT_T) < .021 else {},
            'reviewProps': lambda t: RifleReview(T, rifleAt(t)) + [('point', tuple(face), None, .03), ('point', tuple(face + Vector((0, -T.R(.09), 0))), None, T.R(.10))]
                                     + Ghost(captive, .07),
            'reviewViews': Views(cy=-.40, cz=.85), 'reviewScale': 2.8,
            'reviewFrames': lambda n: [0, int(n * .12), int(n * .28), int(round(n * BUTT_HIT_T)), int(n * .62), n - 1]}
    return spec


@Builder('PvCaptiveButtHit')
def BuildCaptiveHit(T, name):
    SX, SZ, H = T.SX, T.SZ, T.H
    base = CaptiveKneelBase(T)
    p0 = base['pelvis']
    h = CAPTIVE_HIT_T
    # He falls to his LEFT (+X): the seat slides off the heels to the left, the trunk leans left onto the left hand.
    hand0L, hand0R = base['hand.L'], base['hand.R']
    planted = (H + .48, p0[1] - .05, .045)
    face = (-.05, p0[1] - .22, p0[2] + .62)
    body = Tracks(base, {
        'neck': [(0.0, (0, 0, 0)), (h, (0, 0, 0)), (h + .07, (-.30, .05, .10)), (.35, (-.18, .10, .12)), (.70, (.10, .05, .05)),
                 (1.0, (.18, .05, 0)), (1.4, (.20, .05, 0))],
        'head': [(0.0, (0, 0, 0)), (h, (0, 0, 0)), (h + .06, (-.42, .12, .20)), (.30, (-.25, .18, .25)), (.70, (.12, .10, .10)),
                 (1.0, (.30, .08, .05)), (1.4, (.32, .08, .05))],
        'bend': [(0.0, .06), (h, .06), (h + .10, -.14), (.40, .05), (.75, .38), (1.0, .42), (1.4, .44)],
        'twist': [(0.0, 0.0), (h, 0.0), (.20, .18), (.55, .30), (1.0, .25), (1.4, .25)],
        'lean': [(0.0, 0.0), (h, 0.0), (.25, .05), (.60, .42), (.80, .55), (1.0, .52), (1.4, .52)],
        'pelvis': [(0.0, p0), (h, p0), (.20, Add3(p0, (.0, .04, .01))), (.55, Add3(p0, (.18, .06, -.12))),
                   (.80, Add3(p0, (.28, .05, -.24))), (1.0, Add3(p0, (.30, .05, -.27))), (1.4, Add3(p0, (.30, .05, -.27)))],
        'pelvisTilt': [(0.0, base['pelvisTilt']), (h, base['pelvisTilt']), (.25, (-.10, 0, 0)), (.80, (.05, .30, .10)),
                       (1.4, (.06, .32, .10))],
        'hand.L': [(0.0, hand0L), (h, hand0L), (.25, Add3(hand0L, (.10, .05, .12))), (.55, Add3(planted, (-.02, 0, .12))),
                   (.72, planted), (1.4, planted)],
        'armPole.L': [(0.0, base['armPole.L']), (.55, (SX + .50, .40, SZ - .20)), (1.4, (SX + .50, .40, SZ - .20))],
        'hand.R': [(0.0, hand0R), (h, hand0R), (.25, Add3(hand0R, (-.08, .02, .20))), (1.4, Add3(hand0R, (-.08, .02, .20)))],
        'handRelW.R': [(0.0, 0.0), (.22, 0.0), (.60, 1.0), (1.4, 1.0)],
    }, lag={'head': .03})

    def Pose(t):
        f = body(t)
        w = Smooth((t - .45) / .27)
        f['palmF.L'] = Unit(Lerp3((0, -1, -.2), (.35, -.85, 0), w))
        f['palmN.L'] = Unit(Lerp3((0, 0, -1), (0, 0, -1), w))
        f['curl.L'] = Mix(.40, .25, w)
        v = Smooth((t - .25) / .35)
        # the right hand comes up to the struck face (torso frame: left, back, up from the right shoulder)
        f['handRel.R'] = (.17, -.17, .12)
        f['poleRel.R'] = (-.30, .15, -.40)
        f['palmF.R'] = Unit(Lerp3((0, -1, -.2), (.2, -.1, 1), v))
        f['palmN.R'] = Unit(Lerp3((0, 0, -1), (.3, 1, 0), v))
        f['curl.R'] = Mix(.40, .55, v)
        return T.Nest(f)
    spec = {'pose': Pose, 'kneePlants': [('R', 0, .25)],
            'reviewProps': lambda t: [('point', CaptiveFace(T), None, .03), ('point', planted, None, .03)],
            'reviewViews': Views(cx=.15, cy=-.15, cz=.45, far=3.0, h=.9), 'reviewScale': 2.2,
            'reviewFrames': lambda n: [0, 2, int(n * .2), int(n * .4), int(n * .55), n - 1]}
    return spec


# =================================================================================================================
# 02-1 PvIjaCrouchHairLift
# =================================================================================================================
def HairHead(T, t):
    """(eye, crown, crown normal) of Shunzi in ijaB's frame at clip time t (runtime m)."""
    w = Smooth((t - HAIR_GRAB_T) / (HAIR_LIFT_T - HAIR_GRAB_T))
    shake = Vector((0, 0, 0))
    if t > HAIR_HOLD[0]:
        u = t - HAIR_HOLD[0]
        for c, sx in ((.65, 1.0), (1.50, -.8)):
            k = Bump(u, c - .16, c + .16)
            shake += Vector((.022 * sx * math.sin(Tau * (u - c) / .16), 0, .010)) * k
    eye = Vector(HAIR_EYE0).lerp(Vector(HAIR_EYE1), w) + shake
    crown = eye + TipBack(Vector(HAIR_CROWN_OFF), 25.0 * w)
    return eye, crown, TipBack(HAIR_CROWN_N, 25.0 * w).normalized()


@Builder('PvIjaCrouchHairLift')
def BuildCrouchHairLift(T, name):
    SX, SZ, P, H = T.SX, T.SZ, T.P, T.H
    stand = IjaABase(T)
    squat = CrouchBase(T)
    squat['ankle.L'] = (H + .12, -.10, T.A)
    squat['ankle.R'] = (-(H + .12), -.07, T.A)
    stand.update({'ankle.L': squat['ankle.L'], 'ankle.R': squat['ankle.R'], 'foot.L': squat['foot.L'], 'foot.R': squat['foot.R'],
                  'lookW': 1.0, 'lookLimit': 70.0, 'neck': (0, 0, 0), 'head': (.15, 0, 0),
                  'legPole.L': (H + .30, -1.0, .60), 'legPole.R': (-(H + .30), -1.0, .60), 'poleRel.L': squat['poleRel.L'],
                  'poleRel.R': squat['poleRel.R'], 'protract.L': 0.0})
    g, l = HAIR_GRAB_T, HAIR_LIFT_T
    lift = Add3(squat['pelvis'], (0, .06, .03))
    body = Tracks(stand, {
        'pelvis': [(0.0, stand['pelvis']), (.15, stand['pelvis']), (.65, squat['pelvis']), (g, Add3(squat['pelvis'], (0, -.02, -.01))),
                   (l, lift)],
        'pelvisTilt': [(0.0, stand['pelvisTilt']), (.15, stand['pelvisTilt']), (.65, squat['pelvisTilt']), (g, (.44, 0, 0)),
                       (l, (.30, 0, 0))],
        'bend': [(0.0, .10), (.15, .12), (.65, .50), (g, .78), (1.20, .50), (l, .42)],
        'twist': [(0.0, 0.0), (.65, 0.0), (g, -.14), (l, -.10)],
        'shrug': [(0.0, 0.0), (.65, .04), (g, .06), (1.20, .14), (l, .08)],
        'neck': [(0.0, (0, 0, 0)), (.65, squat['neck'])],
        'head': [(0.0, (.15, 0, 0)), (.65, squat['head'])],
        'legPole.L': [(0.0, stand['legPole.L']), (.65, squat['legPole.L'])],
        'legPole.R': [(0.0, stand['legPole.R']), (.65, squat['legPole.R'])],
        'handRel.L': [(0.0, stand['handRel.L']), (.65, squat['handRel.L'])],
        'handRel.R': [(0.0, stand['handRel.R']), (.65, squat['handRel.R'])],
        'protract.L': [(0.0, 0.0), (.70, 0.0), (g, GRIP_PROTRACT), (l, GRIP_PROTRACT * .6)],
    }, lag={'head': .05})

    def Body(t):
        f = body(t)
        if t > HAIR_HOLD[0]:
            u = t - HAIR_HOLD[0]
            span = HAIR_HOLD[1] - HAIR_HOLD[0]
            b = math.sin(Tau * u / span * 2)
            lean = .5 - .5 * math.cos(Tau * u / span)
            eye, _, _ = HairHead(T, t)
            sx = (eye - Vector(HairHead(T, HAIR_HOLD[0])[0])).x
            f['bend'] += .015 * b + .05 * lean
            f['shrug'] += .01 * b + 2.0 * abs(sx)
            f['twist'] += -1.5 * sx
        w = Smooth((t - .65) / .20)
        f['palmF.L'] = Unit(Lerp3(stand['palmF.L'], squat['palmF.L'], w))
        f['palmN.L'] = Unit(Lerp3(stand['palmN.L'], squat['palmN.L'], w))
        f['palmF.R'] = Unit(Lerp3(stand['palmF.R'], squat['palmF.R'], w))
        f['palmN.R'] = Unit(Lerp3(stand['palmN.R'], squat['palmN.R'], w))
        return f

    def Grip(t):
        eye, crown, n = HairHead(T, t)
        return tuple((crown + n * .035) / T.s), n

    def Pose(t):
        f = Body(t)
        eye, crown, n = HairHead(T, t)
        f['look'] = tuple(eye / T.s)
        point, n = Grip(t)
        palmF, palmN, _ = Grab(n, (0, -1, -.35))
        EaseGrip(f, 'L', point, Smooth((t - .65) / (g - .65)), palmF, palmN, 1.1)
        f['armPole.L'] = (SX + T.R(.55), T.R(.10), T.R(.55))
        return T.Nest(f)

    props = lambda t: {'weapon': RifleTrack(SlungRifle(T, 'back')[0], up=SlungRifle(T, 'back')[1])}

    def Player(t):
        eye, crown, n = HairHead(T, t)
        return {'head': tuple(eye / T.s), 'crown': Grip(t)[0]}

    def ShunziGhost(t):
        eye, crown, n = HairHead(T, t)
        e = eye / T.s
        chest = Vector((e.x, e.y - T.R(.30), max(T.R(.12), e.z - T.R(.42))))
        hips = Vector((e.x, chest.y - T.R(.55), T.R(.12)))
        return [('point', tuple(e + Vector((0, -T.R(.06), T.R(.02)))), None, T.R(.11)),
                ('cyl', tuple(e + Vector((0, -T.R(.06), -T.R(.08)))), tuple(chest), T.R(.10)),
                ('cyl', tuple(chest), tuple(hips), T.R(.12)), ('point', Player(t)['crown'], None, .03)]
    spec = {'pose': Pose, 'props': props, 'plants': [('L', 0, 3.5), ('R', 0, 3.5)],
            'check': lambda t: {'L': Grip(t)[0]} if t >= g else {}, 'player': Player,
            'look': lambda t: tuple(HairHead(T, t)[0] / T.s),
            'reviewProps': lambda t: RifleReview(T, SlungRifle(T, 'back')[0]) + ShunziGhost(t),
            'reviewViews': Views(cy=-.35, cz=.5, far=3.2, h=.9), 'reviewScale': 2.4,
            'reviewFrames': lambda n: [0, int(n * .19), int(round(n * g / 3.5)), int(n * .34), int(round(n * l / 3.5)),
                                       int(n * .61), n - 1]}
    return spec


# =================================================================================================================
# 03 Type89 discharger crew
# =================================================================================================================
def GunnerKneel(T):
    """On the right knee, the left foot planted ahead and out, trunk near upright leaning a little over the tube."""
    K = T.K
    H, A = T.H, T.A
    kz, ky = K['kneelPelvisZ'], K['kneelPelvisY']
    kp = K['toeKneelPitch'] - K['toeStandPitch']
    f = Standing(T)
    heel = K['kneelAnkle'](-1)
    f.update({'pelvis': (-.04, heel[1] - .10, .40), 'ankle.L': (H + .20, ky - .40, A), 'legPole.L': (H + .60, -1.2, .9),
              'foot.L': (0, 22, 0), 'ankle.R': K['kneelAnkle'](-1), 'legPole.R': K['kneelPole'](-1), 'foot.R': (kp, 0, 0),
              'bend': .80, 'pelvisTilt': (.40, 0, -.06), 'twist': .0, 'lean': .10, 'shrug': .05,
              'neck': (-.05, 0, 0), 'head': (-.10, 0, 0), 'handRel.L': None, 'handRel.R': None})
    return f


@Builder('PvIjaLauncherFire')
def BuildLauncherFire(T, name):
    SX, SZ, P = T.SX, T.SZ, T.P
    base = GunnerKneel(T)
    recoil = Channel([(0.0, 0.0), (FIRE_T, 0.0), (FIRE_T + .04, 1.0), (FIRE_T + .16, .35), (FIRE_T + .32, 0.0), (2.0, 0.0)])
    kick = Channel([(0.0, 0.0), (FIRE_T, 0.0), (FIRE_T + .05, 1.0), (FIRE_T + .22, .2), (FIRE_T + .36, 0.0), (2.0, 0.0)])
    squeeze = Channel([(0.0, 0.0), (FIRE_T - .20, 0.0), (FIRE_T - .02, 1.0), (FIRE_T + .20, 1.0), (FIRE_T + .40, 0.0), (2.0, 0.0)])

    def L(t):
        return LauncherAt(T, recoil=.025 * recoil(t), pitchKick=2.0 * kick(t))

    def Pose(t):
        f = dict(base)
        k = kick(t)
        b = math.sin(Tau * t / 2.0)
        f['bend'] += .01 * b - .07 * k
        f['shrug'] += .015 * b + .06 * k
        p = f['pelvis']
        f['pelvis'] = (p[0], p[1] + .025 * k, p[2] + .01 * k)
        f['head'] = (f['head'][0] - .10 * k, 0, 0)
        g = L(t)
        a = Vector(g['axis'])
        up = Vector(g['up'])
        side = a.cross(up).normalized()            # the tube's right side (gunner's right)
        # left fist round the tube from above-left, 0.11 m up from the origin; right hand on the trigger body from the right
        left = Vector(g['gripL']) + up * T.R(.035) - side * T.R(.025)
        right = Vector(g['gripR']) - up * T.R(.005) + side * T.R(.040)
        f['grip.L'], f['grip.R'] = tuple(left), tuple(right)
        f['palmF.L'], f['palmN.L'], f['curl.L'] = tuple(side), tuple(-up), 1.0
        f['palmF.R'], f['palmN.R'], f['curl.R'] = tuple(-up * .7 + a * .3), tuple(-side), Mix(.70, 1.05, squeeze(t))
        f['armPole.L'] = (SX + .55, -.10, P - .10)
        f['armPole.R'] = (-(SX + .55), .10, P - .20)
        f['look'] = tuple(Vector(g['muzzle']) + a * T.R(3.0))
        f['lookW'] = .55
        return T.Nest(f)

    def Props(t):
        g = L(t)
        slung, up = SlungRifle(T, 'back')
        return {'launcher': (g['origin'], g['axis'], g['up'], True), 'weapon': RifleTrack(slung, up=up)}

    def Check(t):
        return {}
    spec = {'pose': Pose, 'props': Props, 'plants': [('L', 0, 2.0)], 'kneePlants': [('R', 0, 2.0)],
            'reach': {'fraction': .93, 'travel': .14, 'bend': .30, 'sink': 0.0},
            'reviewProps': lambda t: LauncherReview(L(t)) + RifleReview(T, SlungRifle(T, 'back')[0]),
            'reviewViews': Views(cy=-.30, cz=.45, far=3.0, h=.8), 'reviewScale': 2.2,
            'reviewFrames': lambda n: [0, int(round(n * (FIRE_T - .1) / 2)), int(round(n * (FIRE_T + .04) / 2)),
                                       int(round(n * (FIRE_T + .2) / 2))]}
    return spec


def LoaderKneel(T):
    f = Standing(T)
    f.update(KneelFlat(T, 0.0, 0.0, sit=.35))
    f.update({'bend': .42, 'pelvisTilt': (.12, 0, 0), 'twist': .0, 'head': (-.10, 0, 0), 'neck': (-.05, 0, 0),
              'handRel.L': None, 'handRel.R': None, 'shrug': .04})
    return f


@Builder('PvIjaLauncherLoad')
def BuildLauncherLoad(T, name):
    SX, SZ, P, H = T.SX, T.SZ, T.P, T.H
    base = LoaderKneel(T)
    L0 = LauncherAt(T)
    muzzle = Vector(GunnerToLoader(T, L0['muzzle']))
    a = Vector(GunnerToLoader(T, tuple(Vector(L0['muzzle']) + Vector(L0['axis'])))) - muzzle
    a.normalize()
    kz = base['pelvis'][2]
    pouch = (-(H + .02), base['pelvis'][1] - .17, kz + .06)          # the cartridge pouch at the front right of the belt
    over = tuple(muzzle + a * T.R(.13))                               # the wrist held up the tube's line over the muzzle
    into = tuple(muzzle + a * T.R(.07))
    away = (-(SX - .02), base['pelvis'][1] - .22, kz + .30)
    restL = (H + .10, base['pelvis'][1] - .28, kz + .02)
    ready = (-(H - .02), base['pelvis'][1] - .28, kz + .12)
    hand = [(0.0, ready), (.30, Add3(pouch, (0, -.02, .06))), (.40, pouch), (.50, Add3(pouch, (0, -.02, .08))),
            (.75, Add3(over, (0, .03, .06))), (.84, over), (DROP_T, into), (1.10, away), (FIRE_T, away), (1.85, ready), (2.0, ready)]
    up = KneelFlat(T, 0.0, 0.0, sit=0.0)['pelvis']
    reachP = (up[0], up[1] - .15, up[2] - .03)        # up off the heels, hips forward over the knees for the reach
    p0 = base['pelvis']
    body = Tracks(base, {
        'pelvis': [(0.0, p0), (.45, p0), (.75, reachP), (DROP_T, reachP), (1.20, p0), (2.0, p0)],
        'hand.R': hand,
        'twist': [(0.0, .05), (.30, .10), (.40, .10), (.80, -.12), (DROP_T, -.14), (1.10, .10), (FIRE_T, .12), (2.0, .05)],
        'bend': [(0.0, .42), (.40, .55), (.72, .58), (.84, .62), (DROP_T, .64), (1.15, .35), (FIRE_T, .30), (FIRE_T + .1, .38), (2.0, .42)],
        'head': [(0.0, (-.05, 0, .10)), (.40, (.25, 0, -.20)), (.80, (.10, 0, .10)), (DROP_T, (.10, 0, .10)),
                 (1.15, (.20, 0, -.45)), (FIRE_T, (.25, 0, -.50)), (1.85, (-.05, 0, .10)), (2.0, (-.05, 0, .10))],
        'shrug': [(0.0, .04), (1.10, .14), (FIRE_T, .16), (FIRE_T + .10, .20), (2.0, .04)],
    }, lag={'head': .04})

    def Pose(t):
        f = body(t)
        f['hand.L'] = restL
        f['armPole.L'] = (SX + .40, .25, SZ - .40)
        f['palmF.L'], f['palmN.L'], f['curl.L'] = (0, -1, -.2), (0, 0, -1), .45
        f['armPole.R'] = (-(SX + .50), .20, P - .10)
        carry = Smooth((t - .40) / .08) * (1 - Smooth((t - DROP_T + .02) / .06))
        # fingers round the shell, then the open hand flat (snapping away), then relaxed
        f['palmF.R'] = Unit(Lerp3((0, -.6, -.8), tuple(-a), carry))
        f['palmN.R'] = Unit(Lerp3((.9, 0, .1), (.6, -.3, -.7), carry))
        f['curl.R'] = Mix(.45, 1.0, carry)
        return T.Nest(f)

    def Props(t):
        slung, up = SlungRifle(T, 'back')
        rifle = RifleTrack(slung, up=up)
        if .40 <= t <= DROP_T:
            c, ax, upv, _ = RaInHand(T, 'R', .03, .03)
            return {'shell': (c, ax, upv, True), 'weapon': rifle}
        if DROP_T < t < DROP_T + .10:
            u = (t - DROP_T) / .10
            c = tuple(Vector(into) - a * T.R(.15) * u)
            return {'shell': (c, tuple(-a), (0, 0, 1), u < .8), 'weapon': rifle}
        return {'shell': RaHidden(), 'weapon': rifle}
    def ShellReview(T, row):
        if not row[3]:
            return []
        c, ax = Vector(row[0]), Vector(row[1]) * T.R(.09)
        return [('cyl', tuple(c - ax), tuple(c + ax), T.R(.025))]
    tube = lambda: [('cyl', GunnerToLoader(T, L0['base']), GunnerToLoader(T, L0['muzzle']), .045)]
    spec = {'pose': Pose, 'props': Props, 'plants': [], 'kneePlants': [('L', 0, 2.0), ('R', 0, 2.0)],
            'reach': {'fraction': .93, 'travel': .26, 'bend': .35, 'sink': .02},
            'check': lambda t: {},
            'reviewProps': lambda t: tube() + [('point', tuple(muzzle), None, .025)] + RifleReview(T, SlungRifle(T, 'back')[0])
            + ShellReview(T, Props(t)['shell']),
            'reviewViews': Views(cx=-.10, cy=-.30, cz=.45, far=3.0, h=.8), 'reviewScale': 2.2,
            'reviewFrames': lambda n: [0, int(n * .2), int(n * .42), int(round(n * DROP_T / 2)), int(n * .6), int(n * .82)]}
    return spec


# =================================================================================================================
# 04-2 PvIjaLungeParriedFall
# =================================================================================================================
@Builder('PvIjaLungeParriedFall')
def BuildLungeFall(T, name):
    SX, SZ, P, H, A = T.SX, T.SZ, T.P, T.H, T.A
    base = IjaReadyBase(T)
    base.update({'handRel.L': None, 'handRel.R': None})
    aL, aR = base['ankle.L'], base['ankle.R']
    guard = Rifle(T, (-(H + .04), -.10, P + .16), Unit((.12, -.92, .30)))           # on guard: point at the chest
    thrust = Rifle(T, (-(H - .02), -.48, P + .22), Unit((.03, -.99, .10)))            # full lunge, arms out
    beaten = Rifle(T, (-(H - .08), -.40, P + .20), Unit((.75, -.62, .15)))             # point knocked out to his left
    lurch = Rifle(T, (.0, -.30, P + .12), Unit((.85, -.45, -.10)))
    hit = Rifle(T, (-.02, -.18, P + .05), Unit((.70, -.40, -.45)))                     # doubled over, the rifle dipping
    rifleHeld = RifleKeys(T, [(0.0, guard), (.30, thrust), (PARRY_T, thrust), (.55, beaten), (.78, lurch), (STAB_T + .06, hit)])
    drop = .98
    # the rifle falls from where the hands let it go to the ground ahead-left of him, flat, point forward-left
    restOrigin = (.42, -.55, T.R(.03))
    restAxis = Unit((.55, -.83, 0.0))

    def RifleAt(t):
        if t <= drop:
            return rifleHeld(t)
        r0 = rifleHeld(drop)
        u = Clamp((t - drop) / .36)
        fall = u * u
        o = Vector(r0['origin']).lerp(Vector(restOrigin), u)
        o.z = Mix(r0['origin'][2], restOrigin[2], fall)
        ax = Unit(Lerp3(r0['axis'], restAxis, Smooth(u)))
        return Rifle(T, tuple(o), ax)

    # the body: lunge (left foot steps forward), lurch left after the beaten rifle, the stab doubles him and drives him
    # back two short steps, the knees go, he sits and goes over onto his back.
    stepL = Add3(aL, (.02, -.30, 0))
    backR = Add3(aR, (-.02, .18, 0))
    sitL = Add3(aL, (.10, -.25, 0))
    lieL = (H + .10, -.36, A)
    lieR = (-(H + .16), -.32, A)
    pel = base['pelvis']
    body = Tracks(base, {
        'ankle.L': [(0.0, aL), (.10, aL), (.20, Add3(aL, (0, -.16, .08))), (.30, stepL), (.60, stepL), (.70, Add3(stepL, (.05, -.02, .06))),
                    (.78, Add3(stepL, (.10, 0, 0))), (1.05, Add3(stepL, (.10, 0, 0))), (1.18, Add3(sitL, (0, .12, .10))), (1.35, sitL),
                    (1.62, Add3(lieL, (0, -.30, .12))), (1.80, lieL), (2.2, lieL)],
        'ankle.R': [(0.0, aR), (STAB_T + .02, aR), (.98, Add3(backR, (0, -.06, .08))), (1.08, backR), (1.30, backR),
                    (1.62, Add3(lieR, (0, -.25, .15))), (1.80, lieR), (2.2, lieR)],
        'foot.L': [(0.0, base['foot.L']), (1.35, base['foot.L']), (1.80, (-60, 14, 0)), (2.2, (-62, 14, 0))],
        'foot.R': [(0.0, base['foot.R']), (1.30, base['foot.R']), (1.80, (-60, -14, 0)), (2.2, (-62, -14, 0))],
        'legPole.L': [(0.0, base['legPole.L']), (1.35, (H + .30, -1.0, .80)), (1.80, (H + .20, -.60, 1.2)), (2.2, (H + .20, -.60, 1.2))],
        'legPole.R': [(0.0, base['legPole.R']), (1.30, (-(H + .30), -1.0, .80)), (1.80, (-(H + .20), -.60, 1.2)), (2.2, (-(H + .20), -.60, 1.2))],
        'pelvis': [(0.0, pel), (.30, Add3(pel, (0, -.20, -.06))), (PARRY_T, Add3(pel, (0, -.22, -.06))), (.60, Add3(pel, (.10, -.20, -.05))),
                   (.78, Add3(pel, (.12, -.16, -.06))), (STAB_T + .04, Add3(pel, (.08, -.10, -.06))), (1.05, Add3(pel, (.04, .08, -.10))),
                   (1.30, Add3(pel, (.02, .20, -.35))), (1.48, (.02, .32, .36)), (1.62, (.02, .42, .16)), (1.80, (.02, .45, .12)),
                   (2.2, (.02, .45, .12))],
        'pelvisTilt': [(0.0, base['pelvisTilt']), (.30, (.14, 0, .05)), (.60, (.10, .10, .15)), (STAB_T + .04, (.18, .05, .10)),
                       (1.05, (-.05, 0, .05)), (1.30, (-.35, 0, 0)), (1.48, (-.85, 0, 0)), (1.62, (-1.40, 0, 0)), (1.80, (-1.50, 0, 0)),
                       (2.2, (-1.50, 0, 0))],
        'bend': [(0.0, .20), (.30, .32), (.60, .28), (STAB_T, .30), (STAB_T + .08, .62), (1.05, .45), (1.30, .30), (1.48, .25),
                 (1.62, .10), (1.80, .05), (2.2, .05)],
        'twist': [(0.0, -.05), (.30, -.10), (.60, .25), (.78, .30), (STAB_T + .08, .10), (1.30, .05), (1.80, 0.0)],
        'lean': [(0.0, 0.0), (.60, .12), (.78, .15), (1.05, .05), (1.62, 0.0)],
        'neck': [(0.0, (0, 0, 0)), (STAB_T, (.0, 0, 0)), (STAB_T + .08, (.25, 0, 0)), (1.05, (.10, 0, 0)), (1.48, (.20, 0, 0)),
                 (1.62, (-.10, 0, 0)), (1.75, (.02, 0, 0)), (2.2, (.0, 0, 0))],
        'head': [(0.0, (.10, 0, 0)), (.60, (.05, 0, .25)), (STAB_T, (.0, 0, .15)), (STAB_T + .08, (.30, 0, 0)), (1.30, (.25, 0, 0)),
                 (1.62, (-.15, .05, 0)), (1.75, (.02, .25, 0)), (2.2, (.0, .35, 0))],
        'shrug': [(0.0, 0.0), (STAB_T + .06, .18), (1.30, .05), (2.2, .02)],
    }, lag={'head': .05, 'neck': .03})
    free = Channel([(0.0, 0.0), (drop - .02, 0.0), (drop + .10, 1.0), (2.2, 1.0)])

    def FreeHands(f, t):
        """After the drop: the hands clutch at the chest, then fly out and land beside him on the ground."""
        pz = f['pelvis'][2]
        clutch = Smooth((t - drop) / .20) * (1 - Smooth((t - 1.40) / .25))
        lyingL, lyingR = (SX + .30, .30, .05), (-(SX + .30), .25, .05)
        chestL, chestR = (.06, -.20, pz + .38), (-.06, -.22, pz + .32)
        flop = Smooth((t - 1.40) / .30)
        return (Lerp3(Lerp3(chestL, lyingL, flop), chestL, clutch * (1 - flop)),
                Lerp3(Lerp3(chestR, lyingR, flop), chestR, clutch * (1 - flop)))

    def Pose(t):
        f = body(t)
        r = rifleHeld(min(t, drop))
        w = 1 - free(t)
        if w > 1e-3:
            HoldRifle(T, f, r, w)
        hl, hr = FreeHands(f, t)
        f['hand.L'], f['hand.R'] = hl, hr
        lying = Smooth((t - 1.30) / .40)
        f['armPole.R'] = Lerp3((-(SX + .50), .25, P - .10), (-(SX + .60), .20, -.30), lying)
        f['armPole.L'] = Lerp3((SX + .45, -.05, P - .10), (SX + .60, .20, -.30), lying)
        if w < 1:
            f['palmF.L'], f['palmN.L'], f['curl.L'] = (0, -.3, -1), (0, 0, -1), .55
            f['palmF.R'], f['palmN.R'], f['curl.R'] = (0, -.3, -1), (0, 0, -1), .55
            if w <= 1e-3:
                for s in LR:
                    f.pop('grip.' + s, None)
                    f.pop('gripW.' + s, None)
        return T.Nest(f)

    def GroundW(t):
        return 1.0
    spec = {'pose': Pose, 'props': lambda t: {'weapon': RifleTrack(RifleAt(t))},
            'plants': [('R', 0, .86), ('L', .30, .62)],
            'check': lambda t: {'R': rifleHeld(t)['gripR'], 'L': rifleHeld(t)['gripL']} if t < drop - .05 else {},
            'reviewProps': lambda t: RifleReview(T, RifleAt(t)),
            'reviewViews': Views(cx=.1, cy=-.1, cz=.6, far=3.6, h=1.0), 'reviewScale': 3.2,
            'reviewFrames': lambda n: [0, int(n * .14), int(n * .19), int(n * .27), int(n * .39), int(n * .47), int(n * .6),
                                       int(n * .68), int(n * .74), n - 1]}
    return spec


def MakeClips(K):
    T = Toolkit(K)
    print('PREVIZIJA_MEASURES', K['modelId'], 'scale %.4f H %.3f A %.3f F %.3f S %.3f SX %.3f SZ %.3f P %.3f HD %.3f ARM %.3f'
          % (T.s, T.H, T.A, T.F, T.S, T.SX, T.SZ, T.P, T.HD, T.ARM), flush=True)
    L = LauncherAt(T)
    print('PREVIZIJA_PAIRS face(ijaB frame, runtime Blender axes) %s launcher base %s gripR %s muzzle %s'
          % tuple(tuple(round(c * T.s, 3) for c in v) for v in (CaptiveFaceInIjaB(T), L['base'], L['origin'], L['muzzle'])), flush=True)
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
