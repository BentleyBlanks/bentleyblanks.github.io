"""Clip library for the 01–02 opening (Notion 2026.09.23 draft).

Loaded by `_import/Script_OpeningStoryboardBake.py` with runpy. Module level holds only
plain data (CLIPS / STAGES / PROPS / CONTACT_POINTS / PARTNER_SOURCES) so the manifest
can be written without Blender; `MakeClips(K)` builds the per-rig pose functions from the
toolkit K (the captives baker's rig helpers plus the driver's contact-point evaluator).

Authoring space: Blender metres on the rig's source scale, +Z up, forward -Y, the
character's own left +X, ground z = 0, actor root at the origin. Runtime metres are
source x K['scale']; the three.js actor frame is (-X, Z, Y).

Motion rules this file keeps (docs/Data_FirstLevelOpeningSource20260923.md, contract
§5.4, docs/Data_OpeningStoryboards20260922.md "角色表演、手部解剖"):
  * keys are interpolated with monotone cubic Hermite (PCHIP): velocity is continuous
    through a key, nothing overshoots, and two equal keys hold perfectly still -- a
    planted foot written as the same point twice does not drift;
  * anticipation and follow-through are authored as keys; overlap comes from channel
    lags (the head trails the chest by 40-80 ms);
  * violent beats are short: contact within 0.25-0.5 s of the start, no slow motion;
  * paired clips share one clock: every paired clip starts at the same instant as its
    partner (or at the offset its stage names) and the attacker's hands are solved onto
    the partner's skin patch from the partner track at that same time.
"""
import math
from mathutils import Vector, Quaternion, Matrix

CAP = {}


def BindCaptives(base):
    """The captives baker's module globals (DEFINITIONS, Smooth ...) for the legacy clips."""
    CAP.update(base)


LR = ('L', 'R')
Clamp = lambda x, a=0.0, b=1.0: max(a, min(b, x))
Smooth = lambda x: Clamp(x) * Clamp(x) * (3 - 2 * Clamp(x))
Mix = lambda a, b, w: a + (b - a) * w
Tau = math.pi * 2


def Lerp3(a, b, w):
    return tuple(a[i] + (b[i] - a[i]) * w for i in range(3))


def Add3(a, b, k=1.0):
    return tuple(a[i] + b[i] * k for i in range(3))


def Unit(v):
    v = Vector(v)
    return tuple(v.normalized()) if v.length > 1e-9 else (0.0, 0.0, 1.0)


# ---------------------------------------------------------------------------------
# curves
# ---------------------------------------------------------------------------------
def PchipSlopes(ts, ys, periodic=False):
    n = len(ts)
    if n < 2:
        return [0.0] * n
    h = [ts[i + 1] - ts[i] for i in range(n - 1)]
    d = [(ys[i + 1] - ys[i]) / h[i] if h[i] > 1e-9 else 0.0 for i in range(n - 1)]
    m = [0.0] * n
    for i in range(1, n - 1):
        if d[i - 1] * d[i] <= 0:
            m[i] = 0.0
        else:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    if periodic and n > 2:
        a, b = d[-1], d[0]
        m[0] = m[-1] = 0.0 if a * b <= 0 else 2 / (1 / a + 1 / b)
    return m


def Hermite(t0, t1, y0, y1, m0, m1, t):
    h = t1 - t0
    if h <= 1e-9:
        return y1
    s = (t - t0) / h
    s2, s3 = s * s, s * s * s
    return (2 * s3 - 3 * s2 + 1) * y0 + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * y1 + (s3 - s2) * h * m1


class Channel:
    def __init__(self, points, periodic=False):
        self.ts = [p[0] for p in points]
        first = points[0][1]
        self.none = first is None
        self.tuple = isinstance(first, (tuple, list))
        if self.none:
            return
        width = len(first) if self.tuple else 1
        self.width = width
        self.ys = [[(p[1][k] if self.tuple else p[1]) for p in points] for k in range(width)]
        self.ms = [PchipSlopes(self.ts, ys, periodic) for ys in self.ys]

    def __call__(self, t):
        if self.none:
            return None
        ts = self.ts
        if t <= ts[0]:
            out = [ys[0] for ys in self.ys]
        elif t >= ts[-1]:
            out = [ys[-1] for ys in self.ys]
        else:
            i = max(j for j in range(len(ts) - 1) if ts[j] <= t)
            out = [Hermite(ts[i], ts[i + 1], ys[i], ys[i + 1], ms[i], ms[i + 1], t) for ys, ms in zip(self.ys, self.ms)]
        return tuple(out) if self.tuple else out[0]


class Step:
    def __init__(self, points):
        self.points = points

    def __call__(self, t):
        value = self.points[0][1]
        for key, v in self.points:
            if key <= t + 1e-9:
                value = v
        return value


class Anim:
    """Carry-forward key table over a flat pose. keys: [(t, {channel: value})]."""

    def __init__(self, base, keys, lag=None, periodic=False):
        keys = sorted(keys, key=lambda k: k[0])
        if keys[0][0] > 0:
            keys = [(0.0, {})] + keys
        names = set(base)
        for _, row in keys:
            names.update(row)
        self.channels = {}
        for name in names:
            value = base.get(name)
            points = []
            for t, row in keys:
                if name in row:
                    value = row[name]
                points.append((t, value))
            if all(v is None for _, v in points):
                self.channels[name] = Channel([(0.0, None)])
            elif any(v is None for _, v in points):
                self.channels[name] = Step(points)      # switches on/off: no interpolation
            else:
                self.channels[name] = Channel(points, periodic)
        self.lag = lag or {}

    def __call__(self, t):
        return {name: channel(t - self.lag.get(name.split('.')[0], 0.0)) for name, channel in self.channels.items()}


def Keys(base, keys, lag=None):
    return Anim(base, keys, lag)


# ---------------------------------------------------------------------------------
# skin patches the partners aim at (chosen on the rest pose, carried by one bone)
# score(point, ctx): higher wins. normal: rest-pose outward direction (Blender axes).
# ---------------------------------------------------------------------------------
def _Z(ctx, role):
    return ctx['Point'](ctx['Bone'](role)).z


def _P(ctx, role):
    return ctx['Point'](ctx['Bone'](role))


CONTACT_POINTS = {
    # Top-back of the skull, where a fist closes in the hair.
    'hairBack': {'bones': ['Head'], 'normal': (0, .55, .83), 'count': 18,
                 'score': lambda p, c: p.z + .75 * p.y - 1.5 * abs(p.x)},
    # Crown / top of the hair: where a fist from the front closes to wrench the head back.
    'crown': {'bones': ['Head'], 'normal': (0, .25, .97), 'count': 18,
              'score': lambda p, c: p.z + .15 * p.y - 1.5 * abs(p.x)},
    # Front of the neck under the jaw: where the blade crosses.
    'throat': {'bones': ['Neck', 'Head'], 'normal': (0, -1, 0), 'count': 14,
               'score': lambda p, c: -p.y - 3 * abs(p.z - (_Z(c, 'Neck') + .035)) - 2 * abs(p.x)},
    # Back of the collar (neck base).
    'collarBack': {'bones': ['Neck', 'Spine2'], 'normal': (0, 1, .25), 'count': 16,
                   'score': lambda p, c: p.y - 3 * abs(p.z - (_Z(c, 'Neck') - .015)) - 2 * abs(p.x)},
    # Front collar / lapels, under the chin.
    'collarFront': {'bones': ['Neck', 'Spine2'], 'normal': (0, -1, .2), 'count': 16,
                    'score': lambda p, c: -p.y - 3 * abs(p.z - (_Z(c, 'Neck') - .05)) - 2 * abs(p.x)},
    'chestFront': {'bones': ['Spine2', 'Spine1'], 'normal': (0, -1, 0), 'count': 18,
                   'score': lambda p, c: -p.y - 3 * abs(p.z - (_Z(c, 'Spine2') + .03)) - 2 * abs(p.x)},
    # Outer face of the right upper arm, mid-bone.
    'upperArmR': {'bones': ['R UpperArm'], 'normal': (-1, 0, 0), 'count': 14,
                  'score': lambda p, c: -p.x - 4 * abs(p.z - (_P(c, 'R UpperArm').z + _P(c, 'R Forearm').z) / 2)},
    'wristR': {'bones': ['R Forearm'], 'normal': (-1, 0, 0), 'count': 12,
               'score': lambda p, c: -(p - (_P(c, 'R Hand') + (_P(c, 'R Forearm') - _P(c, 'R Hand')).normalized() * .05)).length},
    'shoulderR': {'bones': ['R Clavicle', 'R UpperArm', 'Spine2'], 'normal': (0, 0, 1), 'count': 16,
                  'score': lambda p, c: p.z - 4 * abs(p.x - _P(c, 'R UpperArm').x * .8) - 2 * abs(p.y)},
    'shoulderL': {'bones': ['L Clavicle', 'L UpperArm', 'Spine2'], 'normal': (0, 0, 1), 'count': 16,
                  'score': lambda p, c: p.z - 4 * abs(p.x - _P(c, 'L UpperArm').x * .8) - 2 * abs(p.y)},
    # Side of the neck where a downward diagonal cut from behind lands.
    'neckSideR': {'bones': ['Neck', 'Spine2', 'R Clavicle'], 'normal': (-.8, .3, .5), 'count': 14,
                  'score': lambda p, c: -p.x + .3 * p.y - 3 * abs(p.z - (_Z(c, 'Neck') - .01))},
    'neckSideL': {'bones': ['Neck', 'Spine2', 'L Clavicle'], 'normal': (.8, -.2, .5), 'count': 14,
                  'score': lambda p, c: p.x - .2 * p.y - 3 * abs(p.z - (_Z(c, 'Neck') - .01))},
}


# ---------------------------------------------------------------------------------
# weapons and props (REAL metres, model axes: -Z muzzle/blade, +Y up, origin at gripR)
# ---------------------------------------------------------------------------------
# gripL here is where the LEFT HAND goes (0.30 m ahead of the right grip, just forward of the
# magazine), not the model's gripL mount (0.443 / 0.418): the native two-hand mount only
# reads the direction right grip -> left grip, and the mount point is out of a shouldered
# man's reach.
WEAPONS = {
    'Type38': {'butt': .255, 'gripL': .30, 'muzzle': 1.029},
    'HanYang': {'butt': .255, 'gripL': .30, 'muzzle': 1.003},
    # Dadao: origin 3 cm below gripR, pommel end +0.27, tip -0.626 (Model_Dadao.tzm.json).
    'Dadao': {'butt': .27, 'gripL': .125, 'muzzle': .626, 'blade': .625},
    # Hand-held Type30 bayonet: socket ring at origin, handle to +0.114, blade to -0.40.
    'Bayonet': {'handle': .062, 'tip': .40},
}


# ---------------------------------------------------------------------------------
# paired staging (runtime metres, anchor actor's three.js frame: +x right, -z forward;
# yawDeg + = turn left). Filled per pair below.
# ---------------------------------------------------------------------------------
STAGES = {}
PROPS = {}
# rig -> clip -> skin patches dumped by OPENING_PASS=partner
PARTNER_SOURCES = {}


# ---------------------------------------------------------------------------------
# static metadata (manifest). Legacy 0922 clips first, untouched, so the 0922 director
# keeps working until the 0923 director (Opening package) replaces it.
# ---------------------------------------------------------------------------------
CLIPS = {}
# env: walls the clip is authored against, RUNTIME metres from the clip root (NRA02/IJA02 scale):
# wallBehindM / wallLeftM / wallRightM = distance from the root to the wall plane. The director
# puts the root that far from the real trench/dugout wall.


def Meta(name, duration, loop, hold, **extra):
    row = {'duration': duration, 'loop': loop, 'weaponHold': hold}
    row.update(extra)
    CLIPS[name] = row
    return name


LEGACY = {
    'SupplyReceive': (3, True, 'free'), 'ClipLoad': (3, True, 'free'),
    'MessengerReport': (3, True, 'oneHandRight'), 'DuckBlast': (1.2, False, 'free'),
    'WoundedReach': (3, True, 'free'), 'CaptiveHeld': (3, True, 'free'),
    'CollarControl': (2, True, 'oneHandRight'), 'BayonetClearWood': (1.6, False, 'twoHand'),
    'CollarDrag': (2.2, False, 'oneHandRight'), 'ButtThreat': (1.4, False, 'twoHand'),
    'InterrogateCrouch': (3, True, 'free'), 'InterpreterPoint': (3, True, 'free'),
    'CreepDadao': (1.8, True, 'oneHandRight'), 'DadaoAmbush': (.85, False, 'oneHandRight'),
    'RifleDeflect': (.8, False, 'oneHandRight'), 'PullComrade': (2, False, 'free'),
    'KickRifle': (1.2, False, 'free'), 'PointBlockade': (3, True, 'oneHandRight'),
    'ShotCollapse': (1.6, False, 'free'), 'GuardTurn': (1.2, False, 'twoHand'),
}
for _name, (_d, _loop, _hold) in LEGACY.items():
    Meta(_name, _d, _loop, _hold, legacy='20260922')

# Clips reused straight from other libraries (loaded at runtime, not baked here).
REUSED = {
    'MachineGunCaptives': ['IjaKickPrisoner', 'IjaShoveForward', 'IjaTauntGesture', 'CaptiveKneelFlinch',
                           'CaptiveShovedStumble', 'IjaBayonetGuard', 'CaptiveStandToKneel', 'CaptiveHandsUpWalk',
                           'CaptiveKneelPlead'],
    'Melee': ['DadaoHeavy', 'DadaoParry'],
    'KimodoDeath': ['DeathCollapseA', 'DeathCollapseB', 'DeathCollapseC', 'DeathCollapseD'],
}

ADDITIVE_UPPER = ['Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'L Clavicle', 'R Clavicle']
ADDITIVE_ARM_R = ADDITIVE_UPPER + ['R UpperArm', 'R Forearm', 'R Hand', 'R Finger']

# -- 01 bunker banter / blast (comrade = LugouNra02) ------------------------------------
Meta('WoundedSitRifleIdle', 4.0, True, 'track', role='comrade', rig='LugouNra02', props=['weapon'],
     rootMotion=False, env={'wallBehindM': .35},
     contacts=[{'t': 0, 'limb': 'handR', 'action': 'hold', 'target': 'weapon', 'part': 'handguard'},
               {'t': 0, 'limb': 'butt', 'action': 'rest', 'target': 'ground'}],
     next=['BanterLaugh', 'BanterLookShoulder', 'BanterPatRifle', 'WoundedRiseWall'],
     notes='Seated on the dugout floor, back on the wall, knees up; rifle upright between the knees, '
           'butt in the dirt, right hand round the handguard; bandaged left arm limp on the left knee.')
Meta('BanterLaugh', 1.6, False, 'track', role='any', rig='LugouNra02', props=['weapon'], rootMotion=False,
     additive={'reference': 'frame0', 'bones': ADDITIVE_UPPER},
     notes='Short shared laugh: breath in, three decaying chest pulses, head back then down. '
           'Additive on spine/neck/head/clavicles; full-body it is the seated comrade.')
Meta('BanterLookShoulder', 2.2, False, 'track', role='comrade', rig='LugouNra02', props=['weapon'], rootMotion=False,
     additive={'reference': 'frame0', 'bones': ADDITIVE_UPPER},
     notes='Glances down at the bandaged left shoulder and back up ("低头看了一眼肩膀").')
Meta('BanterPatRifle', 2.0, False, 'track', role='comrade', rig='LugouNra02', props=['weapon'], rootMotion=False,
     additive={'reference': 'WoundedSitRifleIdle@0', 'bones': ADDITIVE_ARM_R},
     contacts=[{'t': .62, 'limb': 'handR', 'action': 'pat', 'target': 'weapon'},
               {'t': 1.02, 'limb': 'handR', 'action': 'pat', 'target': 'weapon'},
               {'t': 1.55, 'limb': 'handR', 'action': 'regrip', 'target': 'weapon'}],
     prev=['WoundedSitRifleIdle'], next=['WoundedSitRifleIdle', 'WoundedRiseWall'],
     notes='"拿这个噻": lets go of the handguard, pats the rifle twice, closes the hand again. '
           'Starts and ends on WoundedSitRifleIdle frame 0.')
Meta('WoundedRiseWall', 2.8, False, 'track', role='comrade', rig='LugouNra02', props=['weapon'], rootMotion=True,
     env={'wallBehindM': .35, 'wallLeftM': .43},
     contacts=[{'t': .55, 'limb': 'handL', 'action': 'brace', 'target': 'wall'},
               {'t': 1.9, 'limb': 'handL', 'action': 'release', 'target': 'wall'},
               {'t': 2.1, 'limb': 'handL', 'action': 'grip', 'target': 'weapon', 'part': 'handguard'}],
     events=[{'t': 1.25, 'kind': 'effort', 'what': 'sharpInhale'}],
     prev=['WoundedSitRifleIdle'], next=['BlastSlamBuried'],
     notes='Pulls the feet in, braces the bandaged side on the wall, stalls with a sharp inhale when '
           'the shoulder pulls, rises into a hunched low-ceiling stance, clamps the rifle at port.')
Meta('BlastSlamBuried', 1.5, False, 'track', role='comrade', rig='LugouNra02', props=['weapon'], rootMotion=True,
     env={'wallLeftM': .55},
     events=[{'t': 0.0, 'kind': 'blastHit'}, {'t': .08, 'kind': 'weaponLost'}, {'t': .30, 'kind': 'wallImpact'},
             {'t': .62, 'kind': 'weaponLands'}],
     prev=['WoundedRiseWall'], next=['CaptiveDraggedFromDirt'], terminalPose='buried',
     notes='Near miss from front-right: thrown back-left into the trench wall, the rifle torn out '
           'forward-right, slides down the wall into a slumped heap on his left side (dust hides him). '
           'The last frame is exactly CaptiveDraggedFromDirt frame 0 in the same root.')


# -- 01 the comrade is dragged out, shoved to the wall -----------------------------------
STAGES['captiveDrag'] = {
    'anchor': 'comrade', 'syncS': 0.0,
    'notes': 'All three clips start together; roots stay put, every body moves inside its clip. '
             'Comrade root = BlastSlamBuried root (wall 0.55 m on his left).',
    'actors': {
        'comrade': {'rig': 'LugouNra02', 'clip': 'CaptiveDraggedFromDirt', 'x': 0.0, 'z': 0.0, 'yawDeg': 0},
        'ijaA': {'rig': 'LugouIja02', 'clip': 'IjaDragCollarFromDirt', 'x': .05, 'z': -.58, 'yawDeg': 156},
        'ijaB': {'rig': 'LugouIja01', 'clip': 'IjaPullArm', 'x': .48, 'z': -.24, 'yawDeg': 122},
    }}
STAGES['captiveWall'] = {
    'anchor': 'comrade', 'syncS': 0.0,
    'notes': 'Comrade root R3 = his kneel spot at the end of the drag (pelvis handoff in models[].roots); '
             'the trench wall is 0.49 m behind him (he was hauled round to face his right). ijaA stands square in front.',
    'actors': {
        'comrade': {'rig': 'LugouNra02', 'clip': 'CaptiveWallBrace', 'x': 0.0, 'z': 0.0, 'yawDeg': 0},
        'ijaA': {'rig': 'LugouIja02', 'clip': 'IjaShoveToWall', 'x': .02, 'z': -.60, 'yawDeg': 180},
    }}
PARTNER_SOURCES.setdefault('LugouNra02', {}).update({
    'CaptiveDraggedFromDirt': ['collarBack', 'upperArmR', 'wristR'],
    'CaptiveWallBrace': ['chestFront'],
})

Meta('CaptiveDraggedFromDirt', 4.4, False, 'free', role='comrade', rig='LugouNra02', rootMotion=True,
     stage='captiveDrag', env={'wallLeftM': .55},
     contacts=[{'t': .30, 'by': 'ijaA', 'part': 'collarBack', 'action': 'grab'},
               {'t': .28, 'by': 'ijaB', 'part': 'upperArmR', 'action': 'grab'},
               {'t': .62, 'by': 'ijaB', 'part': 'wristR', 'action': 'grab'},
               {'t': 2.75, 'limb': 'knees', 'action': 'land', 'target': 'ground'},
               {'t': 4.05, 'by': 'ijaB', 'part': 'upperArmR', 'action': 'release'}],
     events=[{'t': .35, 'kind': 'effort', 'what': 'groan'}, {'t': 1.25, 'kind': 'footPush'},
             {'t': 2.20, 'kind': 'jerkUp', 'line': 'CaptiveDragged.02'}, {'t': 3.30, 'kind': 'effort', 'what': 'gasp'}],
     prev=['BlastSlamBuried'], next=['CaptiveWallBrace'],
     notes='Hauled out of the loose earth by the back collar (ijaA) and the right arm (ijaB); knees and '
           'insteps drag, one foot gets under him and slips; jerked up on "立て！", drops onto his knees; '
           'the arm is wrenched up across the wound (gasp). Frame 0 = BlastSlamBuried last frame.')
Meta('IjaDragCollarFromDirt', 4.4, False, 'track', role='ijaA', rig='LugouIja02', props=['weapon'], rootMotion=True,
     stage='captiveDrag', weaponState='slungBack',
     contacts=[{'t': .30, 'limb': 'handR', 'action': 'grab', 'partnerRole': 'comrade', 'part': 'collarBack'}],
     events=[{'t': 2.20, 'kind': 'jerkUp', 'line': 'CaptiveDragged.02'}],
     next=['IjaShoveToWall'],
     notes='Stoops, hooks the back collar with the right hand, backs up three steps hauling; the '
           'jerk on "立て！" straightens him. Rifle slung across the back.')
Meta('IjaPullArm', 4.4, False, 'track', role='ijaB', rig='LugouIja01', props=['weapon'], rootMotion=True,
     stage='captiveDrag', weaponState='slungBack',
     contacts=[{'t': .28, 'limb': 'handL', 'action': 'grab', 'partnerRole': 'comrade', 'part': 'upperArmR'},
               {'t': .62, 'limb': 'handR', 'action': 'grab', 'partnerRole': 'comrade', 'part': 'wristR'},
               {'t': 3.20, 'limb': 'handsLR', 'action': 'yank', 'partnerRole': 'comrade'},
               {'t': 4.05, 'limb': 'handsLR', 'action': 'release'}],
     next=['IjaBayonetGuard', 'GuardTurn', 'IjaReadyRifle'],
     notes='Two-handed hold on the right upper arm and wrist, sidesteps back with the drag, '
           'wrenches the arm up at 3.2 s and lets go at 4.05 s.')
Meta('CaptiveWallBrace', 2.0, False, 'free', role='comrade', rig='LugouNra02', rootMotion=True,
     stage='captiveWall', env={'wallBehindM': .49},
     contacts=[{'t': .34, 'by': 'ijaA', 'part': 'chestFront', 'action': 'shove'},
               {'t': .62, 'limb': 'handL', 'action': 'brace', 'target': 'wall'},
               {'t': 1.20, 'limb': 'shoulderBack', 'action': 'lean', 'target': 'wall'}],
     prev=['CaptiveDraggedFromDirt'], next=['CaptiveKneelMud', 'CaptiveHeadPulledBack'],
     notes='Shoved in the chest: topples back-left, the left palm finds the wall and slides down the loose '
           'earth, he ends kneel-sitting with shoulder and back on the wall, right hand on the torn bandage.')
Meta('IjaShoveToWall', 1.0, False, 'track', role='ijaA', rig='LugouIja02', props=['weapon'], rootMotion=True,
     stage='captiveWall', weaponState='slungBack', extra=True,
     contacts=[{'t': .34, 'limb': 'handR', 'action': 'shove', 'partnerRole': 'comrade', 'part': 'chestFront'},
               {'t': .56, 'limb': 'handR', 'action': 'release'}],
     prev=['IjaDragCollarFromDirt'], next=['InterrogateCrouch', 'IjaHairGrabPull'],
     notes='Not in contract §5.4 (added): the shove the draft describes ("推到沟壁上") needs its own pair '
           'with CaptiveWallBrace. Short wind-up, lunge on the left foot, flat right palm to the chest.')
Meta('CaptiveKneelMud', 3.0, True, 'free', role='comrade', rig='LugouNra02', rootMotion=False,
     env={'wallBehindM': .49},
     prev=['CaptiveWallBrace'], next=['CaptiveHeadPulledBack'],
     notes='Interrogation idle: kneel-sitting in the mud against the wall, three hard breaths per loop, head '
           'lolling, right hand pressed on the bandage. Same root as CaptiveWallBrace.')


# =================================================================================
# per-rig builders
# =================================================================================
BUILDERS = {}


def Builder(*names):
    def Register(fn):
        for name in names:
            BUILDERS[name] = fn
        return fn
    return Register


def MakeClips(K):
    T = Toolkit(K)
    specs = {}
    for name in CLIPS:
        if name in LEGACY:
            specs[name] = LegacySpec(K, name)
            continue
        fn = BUILDERS.get(name)
        if fn is None:
            print('OPENING_MISSING_BUILDER', name, flush=True)
            continue
        spec = fn(T, name)
        specs[name] = spec
    for spec in specs.values():
        spec.setdefault('scale', K['scale'])
        spec.setdefault('modelId', K['modelId'])
    return specs


class Toolkit:
    """Body measures and pose helpers for one rig (source metres)."""

    def __init__(self, K):
        self.K = K
        self.s = K['scale']
        self.P, self.C, self.HD = K['restPelvis'], K['restChest'], K['restHead']
        self.A, self.H, self.F, self.S = K['ankleZ'], K['hipHalf'], K['femur'], K['shin']
        # Sole calibration: the ankle height at which a rest-oriented boot sole sits on the
        # clearance plane. The rest ankle alone leaves ~1.5 cm of air under the boot, and the
        # per-frame grounding then shifts every planted foot when a hip or knee becomes lowest.
        K['Reset']()
        self.A = K['ankleZ'] - K['LowestOf'](K['footVertices']) + .003
        self.SZ, self.SX = K['shoulder']['L'].z, K['shoulder']['L'].x
        self.ARM = K['armLen']
        self.rig = K['modelId']
        self.nra = K['modelId'].startswith('LugouNra')
        self.gun = 'HanYang' if self.nra else 'Type38'
        self.cache = {}

    def R(self, metres):
        """Real (runtime) metres -> this rig's source metres."""
        return metres / self.s

    # -- pose assembly ------------------------------------------------------------
    def Nest(self, f):
        K = self.K
        p = {key: f[key] for key in ('pelvis', 'pelvisTilt', 'bend', 'lean', 'twist', 'neck', 'head', 'shrug')}
        if f.get('frameYaw') is not None:
            p['frameYaw'], p['frameShift'] = f['frameYaw'], f.get('frameShift') or (0.0, 0.0)
        p['ankles'] = {s: f['ankle.' + s] for s in LR}
        p['legPoles'] = {s: f['legPole.' + s] for s in LR}
        p['toeDirs'] = {s: f.get('toeDir.' + s) for s in LR}
        p['hands'], p['armPoles'], p['palms'], p['grips'] = {}, {}, {}, {}
        p['gripWeights'] = {s: f['gripW.' + s] for s in LR if f.get('gripW.' + s) is not None}
        for s in LR:
            forward = f.get('palmF.' + s)
            grip = f.get('grip.' + s)
            if grip is not None and f.get('gripW.' + s, 1.0) < 1.0:
                p['grips'][s] = grip
                p['hands'][s] = f['hand.' + s]
            elif grip is not None:
                p['grips'][s] = grip
                lead = Vector(forward).normalized() if forward is not None else Vector((0, -1, 0))
                p['hands'][s] = tuple(Vector(grip) - lead * .085)
            else:
                p['hands'][s] = f['hand.' + s]
            p['armPoles'][s] = f['armPole.' + s]
            if forward is not None:
                p['palms'][s] = (forward, f['palmN.' + s], f.get('curl.' + s, .5), f.get('index.' + s))
        feet = {s: f.get('foot.' + s) for s in LR}
        rel = {s: f.get('handRel.' + s) for s in LR if f.get('handRel.' + s) is not None
               and (f.get('grip.' + s) is None or f.get('gripW.' + s, 1.0) < 1.0)}

        def Post():
            for s in LR:
                if feet[s] is not None and f.get('toeDir.' + s) is None:
                    self.OrientFoot(s, feet[s], f.get('frameYaw') or 0.0)
            for s, offset in rel.items():
                self.RelArm(s, offset, f.get('poleRel.' + s), f.get('palmF.' + s), f.get('palmN.' + s), f.get('curl.' + s, .5),
                            world=f.get('hand.' + s), weight=f.get('handRelW.' + s, 1.0),
                            worldPole=f.get('armPole.' + s), worldPalm=(f.get('palmFw.' + s), f.get('palmNw.' + s)))
        p['post'] = Post
        p['resolved'] = tuple(s for s in rel if f.get('grip.' + s) is None)
        # CurlFingers bends from the current finger pose: a hand the body-frame pass (Post)
        # turns and curls must not be curled by ApplyPose first, or it closes twice as far
        # (and a clip handing over from a world-space hand would jump by that much).
        for s in rel:
            p['palms'].pop(s, None)
        if f.get('frameYaw') and p['grips']:
            # Grips are pinned after ApplyPose in world space: their palm hints must be turned
            # by the frame here (ApplyPose turns the ones it applies itself).
            q = Quaternion((0, 0, 1), f['frameYaw'])
            p['gripPalms'] = {s: (tuple(q @ Vector(p['palms'][s][0])), tuple(q @ Vector(p['palms'][s][1])))
                              + tuple(p['palms'][s][2:]) for s in p['grips'] if s in p['palms']}
        return p

    def RelArm(self, side, offset, poleRel, palmF, palmN, curl, world=None, weight=1.0, worldPole=None, worldPalm=(None, None)):
        """Free hand placed in the torso frame (left, back, up) from its own shoulder, so a
        bending or twisting body carries the hand with it instead of stretching the arm."""
        K = self.K
        frame = BodyFrame(K)
        basis = Matrix((frame['left'], frame['back'], frame['up'])).transposed()
        shoulder = K['Point'](K['Bone'](side + ' UpperArm'))
        sign = 1 if side == 'L' else -1
        target = shoulder + basis @ Vector(offset)
        pole = shoulder + basis @ Vector(poleRel or (sign * .45, .40, -.35))
        forward = basis @ Vector(palmF) if palmF is not None else None
        normal = basis @ Vector(palmN) if palmN is not None else None
        if world is not None and weight < 1.0:
            # Hand-over between a world target (a wall, the ground) and the body frame.
            target = Vector(world).lerp(target, weight)
            if worldPole is not None:
                pole = Vector(worldPole).lerp(pole, weight)
            if worldPalm[0] is not None and forward is not None:
                forward = Vector(worldPalm[0]).lerp(forward, weight)
                normal = Vector(worldPalm[1]).lerp(normal, weight)
        K['Chain'](K['Bone'](side + ' UpperArm'), K['Bone'](side + ' Forearm'), K['Bone'](side + ' Hand'), target, pole, label='rel' + side)
        if forward is not None:
            normal = K['TurnPalm'](side, tuple(forward), tuple(normal))
            K['CurlFingers'](side, normal, curl)
        K['Update']()

    def OrientFoot(self, side, angles, frameYaw=0.0):
        """Rest foot rotated by (pitch toes-down+, yaw toes-left+, roll sole-out+) degrees."""
        K = self.K
        foot = K['Bone'](side + ' Foot')
        m = K['BWorld'](foot)
        location = m.translation.copy()
        _, _, scale = m.decompose()
        pitch, yaw, roll = [math.radians(a) for a in angles]
        sign = 1 if side == 'L' else -1
        q = Quaternion((0, 0, 1), frameYaw + yaw) @ Quaternion((1, 0, 0), pitch) @ Quaternion((0, -1, 0), sign * roll)
        K['Put'](foot, Matrix.LocRotScale(location, q @ K['footQuats'][side], scale))

    # -- stock bases ----------------------------------------------------------------
    def Stand(self):
        H, P, A, SX, SZ = self.H, self.P, self.A, self.SX, self.SZ
        return {
            'pelvis': (0, .02, P - .035), 'pelvisTilt': (.03, 0, 0), 'bend': .06, 'lean': 0.0, 'twist': 0.0,
            'neck': (0, 0, 0), 'head': (0, 0, 0), 'shrug': 0.0,
            'ankle.L': (H + .02, -.01, A), 'ankle.R': (-(H + .02), .03, A),
            'legPole.L': (H + .22, -.95, .45), 'legPole.R': (-(H + .22), -.95, .45),
            'foot.L': (0, 6, 0), 'foot.R': (0, -6, 0),
            'hand.L': (SX + .02, .01, P - .09), 'hand.R': (-(SX + .02), .01, P - .09),
            'armPole.L': (SX + .45, .45, SZ - .40), 'armPole.R': (-(SX + .45), .45, SZ - .40),
            'palmF.L': (0, -.1, -1), 'palmN.L': (-1, 0, 0), 'curl.L': .45,
            'palmF.R': (0, -.1, -1), 'palmN.R': (1, 0, 0), 'curl.R': .45,
        }

    # -- weapons ----------------------------------------------------------------------
    def Rifle(self, origin, axis, kind=None):
        """Points of a rifle whose gripR (model origin) sits at `origin`."""
        w = WEAPONS[kind or self.gun]
        o, a = Vector(origin), Vector(axis).normalized()
        return {'origin': tuple(o), 'axis': tuple(a), 'gripR': tuple(o), 'gripL': tuple(o + a * self.R(w['gripL'])),
                'butt': tuple(o - a * self.R(w['butt'])), 'muzzle': tuple(o + a * self.R(w['muzzle']))}

    def RifleFromButt(self, butt, axis, kind=None):
        w = WEAPONS[kind or self.gun]
        return self.Rifle(Vector(butt) + Vector(axis).normalized() * self.R(w['butt']), axis, kind)

    def Along(self, rifle, metres):
        """Point `metres` (real) along the rifle from the butt plate."""
        w = WEAPONS[self.gun]
        return tuple(Vector(rifle['butt']) + Vector(rifle['axis']) * self.R(metres))

    def Palms(self, axis):
        return self.K['GripPalms'](axis)

    def Track(self, rifle, up=(0, 0, 1), visible=True):
        return (rifle['origin'], rifle['axis'], up, visible)

    def RifleProps(self, rifle):
        return [('cyl', rifle['butt'], rifle['muzzle'], .018)]


def Spec(T, anim, **kw):
    """Wrap a flat-pose function into a driver spec."""
    extra = kw.pop('extra', None)

    def Pose(t):
        f = anim(t)
        if extra:
            f = extra(t, dict(f))
        return T.Nest(f)
    spec = {'pose': Pose}
    spec.update(kw)
    return spec


# ---------------------------------------------------------------------------------
# legacy 0922 clips -- same pose code as the V1 bake, kept so the old director works
# ---------------------------------------------------------------------------------
def LegacySpec(K, clip):
    base = CAP
    duration = LEGACY[clip][0]

    def Author(t, lift):
        arm = K['arm']
        for bone in arm.pose.bones:
            bone.matrix_basis = K['rest'][bone.name]
        K['Update']()
        u = min(1, t / duration)
        wave = math.sin(2 * math.pi * u)
        if clip in ('ButtThreat', 'ShotCollapse', 'BayonetClearWood'):
            source = {'ButtThreat': 'IjaRifleButtStrike', 'ShotCollapse': 'CaptiveStruckDown',
                      'BayonetClearWood': 'IjaBayonetDownThrust'}[clip]
            K['Author'](source, t * base['DEFINITIONS'][source][0] / duration, lift)
            return
        kneel = clip in ('SupplyReceive', 'ClipLoad', 'DuckBlast', 'CaptiveHeld', 'InterrogateCrouch', 'InterpreterPoint', 'PullComrade')
        p = K['KneelBase']() if kneel else K['StandBase'](0, wave * .15)
        z = p['pelvis'][2]
        chest = z + (K['restChest'] - K['restPelvis']) * .92
        p.update(bend=.12 + .015 * wave, head=(.03, 0, .035 * wave),
                 hands={'L': (.23, -.27, chest - .2), 'R': (-.22, -.22, chest - .18)},
                 armPoles={'L': (.8, .05, chest - .35), 'R': (-.8, .05, chest - .35)},
                 palms={'L': ((0, -1, 0), (0, 0, 1), .45), 'R': ((0, -1, 0), (0, 0, 1), .75)})
        if clip == 'SupplyReceive':
            p['hands']['L'] = (.12, -.53, chest - .13 + .04 * wave)
            p['hands']['R'] = (-.23, -.12, z - .05)
            p['palms']['L'] = ((0, -1, 0), (0, 0, 1), .15)
        elif clip == 'ClipLoad':
            p['hands'] = {'L': (.13, -.39, chest - .15), 'R': (-.08, -.36, chest + .02 + .10 * wave)}
            p['palms'] = {'L': ((1, 0, 0), (0, 0, 1), 1.1), 'R': ((0, -1, 0), (-1, 0, 0), 1.25)}
            p['head'] = (.25, 0, 0)
        elif clip == 'DuckBlast':
            w = base['Smooth'](u * 3)
            p['bend'] = .14 + .40 * w
            p['hands'] = {'L': (.20, -.38, chest + .34 * w), 'R': (-.23, -.32, chest + .34 * w)}
            p['head'] = (.5 * w, 0, 0)
        elif clip == 'WoundedReach':
            p['pelvis'] = (0, .30, .27)
            p['pelvisTilt'] = (-.80, .20, 0)
            p['ankles'] = {'L': (.22, -.46, .16), 'R': (-.23, -.44, .17)}
            p['hands'] = {'L': (.16, -.65, .48 + .015 * wave), 'R': (-.23, -.22, .33)}
            p['palms'] = {'L': ((0, -1, 0), (1, 0, 0), 1.25), 'R': ((0, -1, 0), (0, 0, -1), .45)}
            p['bend'] = .18
            p['head'] = (.30, 0, 0)
        elif clip == 'CaptiveHeld':
            p['hands'] = {'L': (.21, .14, chest - .24), 'R': (-.21, .13, chest - .25)}
            p['head'] = (-.18, 0, .13 * wave)
            p['bend'] = .16 + .025 * wave
        elif clip in ('CollarControl', 'CollarDrag'):
            w = base['Smooth'](u) if clip == 'CollarDrag' else .5 + .05 * wave
            p['bend'] = .38 - .18 * w
            p['hands']['L'] = (.10, -.58 + .20 * w, chest - .38)
            p['hands']['R'] = (-.27, -.20, chest - .15)
            p['palms']['L'] = ((0, -1, 0), (1, 0, 0), 1.6)
        elif clip == 'InterrogateCrouch':
            p['bend'] = .28
            p['hands'] = {'L': (.08, -.53, chest - .25), 'R': (-.17, -.46, chest + .1 + .035 * wave)}
            p['palms']['L'] = ((0, -1, 0), (1, 0, 0), 1.6)
            p['palms']['R'] = ((0, -1, 0), (0, 0, -1), 1.5, 0)
            p['head'] = (.08, 0, .06 * wave)
        elif clip == 'InterpreterPoint':
            p['hands']['R'] = (-.12, -.50, chest + .03 + .04 * wave)
            p['palms']['R'] = ((0, -1, 0), (0, 0, -1), 1.5, 0)
            p['hands']['L'] = (.28, -.05, chest - .29)
        elif clip == 'CreepDadao':
            K['Author']('CaptiveHandsUpWalk', t, 0)
            p['pelvis'] = (0, .04, K['restPelvis'] - .15 + .012 * wave)
            for side, sign in [('L', 1), ('R', -1)]:
                phase = 2 * math.pi * u + (0 if side == 'L' else math.pi)
                p['ankles'][side] = (sign * .16, .20 * math.sin(phase), K['ankleZ'] + .055 * max(0, math.cos(phase)))
            for bone in arm.pose.bones:
                bone.matrix_basis = K['rest'][bone.name]
            K['Update']()
            p['bend'] = .30
            p['hands']['R'] = (-.30, -.19, chest - .25)
        elif clip == 'DadaoAmbush':
            w = base['Smooth']((u - .15) / .55)
            p['twist'] = .60 - 1.0 * w
            p['bend'] = .15 + .2 * math.sin(math.pi * u)
            p['hands']['R'] = (-.42 + .64 * w, -.25 - .23 * math.sin(math.pi * u), chest + .35 - .60 * w)
            p['hands']['L'] = (.30, -.45, chest + .03)
            p['palms']['R'] = ((0, -1, 0), (1, 0, 0), 1.35)
        elif clip == 'RifleDeflect':
            w = math.sin(math.pi * u)
            p['twist'] = -.40 * w
            p['bend'] = .18 + .18 * w
            p['hands']['L'] = (.16 + .27 * w, -.52, chest + .04)
        elif clip == 'PullComrade':
            w = base['Smooth'](u)
            p['bend'] = .42 - .34 * w
            p['hands'] = {'L': (.10, -.57 + .30 * w, chest - .20 + .12 * w), 'R': (-.10, -.57 + .30 * w, chest - .20 + .12 * w)}
            p['palms'] = {s: ((0, -1, 0), (0, 0, 1), 1.6) for s in ('L', 'R')}
        elif clip == 'KickRifle':
            w = math.sin(math.pi * u)
            p['ankles']['R'] = (-.16, -.15 - .55 * w, K['ankleZ'] + .10 * w)
            p['bend'] = .16 + .12 * w
            p['hands']['L'] = (.10, -.47, chest - .30)
            p['hands']['R'] = (-.30, .04, chest - .25)
        elif clip == 'PointBlockade':
            p['hands']['L'] = (.32, -.62, chest + .14 + .015 * wave)
            p['palms']['L'] = ((0, -1, 0), (0, 0, -1), 1.5, 0)
            p['head'] = (0, 0, -.25)
        elif clip == 'GuardTurn':
            p['twist'] = .5 * base['Smooth'](u)
            p['hands'] = {'L': (.16, -.56, chest), 'R': (-.16, -.28, chest - .06)}
        K['ApplyPose'](p, lift)
    return {'author': Author}


# ---------------------------------------------------------------------------------
# toolkit extensions: partners, steps, slung rifle, kneels
# ---------------------------------------------------------------------------------
def _StageXY(row):
    """Stage row (three.js x right, z back, yaw) -> Blender-axes (X, Y, yawRad)."""
    return -row['x'], row['z'], math.radians(row['yawDeg'])


def _Rot(x, y, yaw):
    c, s = math.cos(yaw), math.sin(yaw)
    return x * c - y * s, x * s + y * c


def PartnerPoint(T, stage, selfRole, partnerRole, point, t, normalOffset=0.0):
    """A partner's skin patch at this actor's clip time `t`, in this actor's source metres.

    Reads the track OPENING_PASS=partner dumped from the partner's canonical rig, then walks
    it through the stage: partner local -> stage -> self local, runtime -> source metres.
    Returns (point, normal) Vectors, or None while the partner track has not been dumped."""
    st = STAGES[stage]
    me, other = st['actors'][selfRole], st['actors'][partnerRole]
    track = T.K['partnerTracks'].get(other['rig'], {}).get(other['clip'])
    if not track:
        return None
    frames = track['points'][point]
    at = t + me.get('offsetS', 0.0) - other.get('offsetS', 0.0)   # offsetS = stage time the clip starts
    u = Clamp(at / track['duration']) * (len(frames) - 1)
    i = min(int(u), len(frames) - 2)
    w = u - i
    row = [frames[i][k] + (frames[i + 1][k] - frames[i][k]) * w for k in range(6)]
    p, n = Vector(row[:3]), Vector(row[3:]).normalized()
    p = p + n * normalOffset
    ox, oy, oyaw = _StageXY(other)
    mx, my, myaw = _StageXY(me)
    sx, sy = _Rot(p.x, p.y, oyaw)
    nx, ny = _Rot(n.x, n.y, oyaw)
    sx, sy = sx + ox - mx, sy + oy - my
    lx, ly = _Rot(sx, sy, -myaw)
    lnx, lny = _Rot(nx, ny, -myaw)
    return Vector((lx, ly, p.z)) / T.s, Vector((lnx, lny, n.z)).normalized()


def Tracks(base, channels, lag=None, extraKeys=None):
    """Per-channel key lists {channel: [(t, value), ...]} -> Anim. Each channel is
    interpolated through ITS OWN keys only (a carry-forward table would insert flat holds
    at every other channel's key times and turn smooth paths into steps)."""
    anim = Anim(base, [(0.0, {})] + (extraKeys or []), lag)
    for name, points in channels.items():
        points = sorted(points, key=lambda p: p[0])
        if points[0][0] > 0:
            points = [(0.0, base.get(name, points[0][1]))] + points
        dedup = []
        for t, v in points:
            if dedup and abs(dedup[-1][0] - t) < 1e-9:
                dedup[-1] = (t, v)
            else:
                dedup.append((t, v))
        anim.channels[name] = Step(dedup) if any(v is None for _, v in dedup) else Channel(dedup)
    return anim


def StepPoints(start, steps, lift=.07):
    """Ankle key list: planted between steps; each step (t0, t1, to) swings in an arc."""
    points = [(0.0, tuple(start))]
    at = tuple(start)
    for t0, t1, to in steps:
        points.append((t0, at))
        mid = Lerp3(at, to, .5)
        points.append(((t0 + t1) / 2, (mid[0], mid[1], mid[2] + lift)))
        points.append((t1, tuple(to)))
        at = tuple(to)
    return points


def PlantWindows(side, duration, steps):
    """Plant windows between the steps of StepPoints (for the slide check)."""
    windows, t = [], 0.0
    for t0, t1, _ in steps:
        if t0 - t > .05:
            windows.append((side, t, t0))
        t = t1
    if duration - t > .05:
        windows.append((side, t, duration))
    return windows


def BodyFrame(K):
    """Current torso frame from the posed bones (Blender world)."""
    P = K['Point']
    B = K['Bone']
    pelvis, neck = P(B('Pelvis')), P(B('Neck'))
    up = (neck - pelvis).normalized()
    left = (P(B('L UpperArm')) - P(B('R UpperArm')))
    left = (left - up * left.dot(up)).normalized()
    back = up.cross(left).normalized()          # up x left = back (+Y at rest)
    return {'up': up, 'left': left, 'back': back, 'chest': P(B('Spine2')), 'spine': P(B('Spine1')),
            'pelvis': pelvis, 'neck': neck}


def SlungRifle(T, side='back'):
    """Rifle hanging on the sling: across the back (muzzle up over the right shoulder) or
    from the right shoulder (muzzle up, butt at the hip). Evaluated on the posed bones."""
    f = BodyFrame(T.K)
    if side == 'back':
        axis = (f['up'] * .93 - f['left'] * .37).normalized()
        origin = f['spine'] + f['back'] * T.R(.16) + f['left'] * T.R(.10) - f['up'] * T.R(.02)
        up = f['back']
    else:
        axis = (f['up'] * .97 + f['back'] * .12).normalized()
        origin = f['pelvis'] - f['left'] * T.R(.24) + f['back'] * T.R(.06) + f['up'] * T.R(.02)
        up = -f['left']
    return T.Rifle(tuple(origin), tuple(axis)), tuple(up)


def KneelFlat(T, x=0.0, y=0.0, sit=0.0):
    """Both knees down, insteps flat behind; `sit` lowers the seat toward the heels."""
    K = T.K
    kz, ky = K['kneelPelvisZ'], K['kneelPelvisY']
    kp = K['toeKneelPitch'] - K['toeStandPitch']
    f = {
        # Sitting back on the heels: the seat travels back over the insteps, not straight down.
        'pelvis': (x, y + ky + (.26 - ky) * sit, kz + (.29 - kz) * sit),
        'ankle.L': Add3(K['kneelAnkle'](1), (x, y, 0)), 'ankle.R': Add3(K['kneelAnkle'](-1), (x, y, 0)),
        'legPole.L': Add3(K['kneelPole'](1), (x, y, 0)), 'legPole.R': Add3(K['kneelPole'](-1), (x, y, 0)),
        'foot.L': (kp, 0, 0), 'foot.R': (kp, 0, 0),
    }
    return f


def Grab(normal, down=(0, 0, -1), curl=.95):
    """Palm onto a surface whose outward normal is `normal`; fingers run along `down`."""
    n = Vector(normal).normalized()
    d = Vector(down)
    d = (d - n * d.dot(n))
    d = d.normalized() if d.length > 1e-6 else Vector((1, 0, 0))
    return tuple(d), tuple(-n), curl


def FollowSteps(pelvisAt, stance, schedule, duration, lift=.075):
    """Feet that follow a travelling pelvis. pelvisAt(t) -> (x, y); stance[side] = (dx, dy)
    offset from the pelvis ground point; schedule = [(side, t0, t1)]. Between steps a foot
    stays exactly where it landed (the plant windows are returned for the slide check)."""
    points = {}
    plants = []
    for side in LR:
        own = [(t0, t1) for s, t0, t1 in schedule if s == side]
        px, py = pelvisAt(0.0)
        at = (px + stance[side][0], py + stance[side][1])
        z = stance[side][2]
        rows = [(0.0, (at[0], at[1], z))]
        last = 0.0
        for t0, t1 in own:
            if t0 - last > .02:
                plants.append((side, last, t0))
            rows.append((t0, (at[0], at[1], z)))
            px, py = pelvisAt(t1)
            to = (px + stance[side][0], py + stance[side][1])
            rows.append(((t0 + t1) / 2, ((at[0] + to[0]) / 2, (at[1] + to[1]) / 2, z + lift)))
            rows.append((t1, (to[0], to[1], z)))
            at, last = to, t1
        if duration - last > .02:
            plants.append((side, last, duration))
        rows.append((duration, (at[0], at[1], z)))
        points['ankle.' + side] = rows
    return points, plants


GHOST_BONES = ['Pelvis', 'Spine2', 'Neck', 'Head', 'L UpperArm', 'L Forearm', 'L Hand', 'R UpperArm', 'R Forearm',
               'R Hand', 'L Thigh', 'L Calf', 'L Foot', 'R Thigh', 'R Calf', 'R Foot']
GHOST_LINKS = [(0, 1), (1, 2), (2, 3), (2, 4), (4, 5), (5, 6), (2, 7), (7, 8), (8, 9), (0, 10), (10, 11), (11, 12),
               (0, 13), (13, 14), (14, 15)]


def PartnerGhost(T, stage, selfRole, partnerRole, t):
    """The partner's stick skeleton at this actor's time, as review cylinders (source metres)."""
    st = STAGES[stage]
    me, other = st['actors'][selfRole], st['actors'][partnerRole]
    track = T.K['partnerTracks'].get(other['rig'], {}).get(other['clip'])
    if not track or not track.get('skeleton'):
        return []
    frames = track['skeleton']
    at = t + me.get('offsetS', 0.0) - other.get('offsetS', 0.0)   # offsetS = stage time the clip starts
    i = int(round(Clamp(at / track['duration']) * (len(frames) - 1)))
    row = frames[i]
    ox, oy, oyaw = _StageXY(other)
    mx, my, myaw = _StageXY(me)
    points = []
    for k in range(0, len(row), 3):
        x, y = _Rot(row[k], row[k + 1], oyaw)
        x, y = _Rot(x + ox - mx, y + oy - my, -myaw)
        points.append(Vector((x, y, row[k + 2])) / T.s)
    out = [('cyl', tuple(points[a]), tuple(points[b]), .03) for a, b in GHOST_LINKS]
    out.append(('point', tuple(points[3]), None, .09))
    return out


POSITION_CHANNELS = ('ankle.', 'legPole.', 'hand.', 'armPole.')


def Turned(f, psi, pivot=None):
    """Turn the whole body by psi (rad, + = left) about its pelvis without moving any authored
    world position: positions are pre-rotated into the turned frame, ApplyPose carries them
    back, while every tilt axis, rest foot and palm direction turns with the body."""
    if abs(psi) < 1e-9:
        return f
    c = pivot or (f['pelvis'][0], f['pelvis'][1])
    for key in list(f):
        v = f[key]
        if v is None or not (key == 'pelvis' or key.startswith(POSITION_CHANNELS)):
            continue
        x, y = _Rot(v[0] - c[0], v[1] - c[1], -psi)
        f[key] = (x + c[0], y + c[1], v[2])
    sx, sy = _Rot(c[0], c[1], psi)
    f['frameYaw'], f['frameShift'] = psi, (c[0] - sx, c[1] - sy)
    return f


# ---------------------------------------------------------------------------------
# 01: the dugout. The comrade sits against the back wall, rifle between the knees.
# ---------------------------------------------------------------------------------
def SitBase(T):
    """Frame 0 of WoundedSitRifleIdle; also the reference of every banter clip."""
    if 'sit' in T.cache:
        return dict(T.cache['sit'])
    H, A, SX, SZ = T.H, T.A, T.SX, T.SZ
    rifle = SitRifle(T)
    f = T.Stand()
    f.update({
        # Hip joint 13 cm off the floor: ischia + buttock under it. Pelvis rolled back so the
        # sacrum takes the weight and the shoulders rest on the wall behind.
        'pelvis': (0, .05, .125), 'pelvisTilt': (-.46, 0, .04),
        'bend': .24, 'lean': .02, 'twist': -.05, 'shrug': .06,
        'neck': (.10, 0, 0), 'head': (.20, .05, -.10),
        # Knees up, soles flat, the left (wounded side) foot drawn in a little further.
        'ankle.L': (H + .08, -.37, A), 'ankle.R': (-(H + .05), -.44, A),
        'legPole.L': (H + .42, -.30, 1.2), 'legPole.R': (-(H + .34), -.35, 1.2),
        'foot.L': (0, 16, 0), 'foot.R': (0, -10, 0),
        # Right hand round the handguard, thumb up, fingers wrapping toward his left.
        'grip.R': T.Along(rifle, .66), 'armPole.R': (-(SX + .50), -.05, .12),
        'palmF.R': Unit((.9, -.35, .08)), 'palmN.R': Unit((.35, -.93, 0)), 'curl.R': 1.0,
        # Bandaged left arm limp across the left knee, palm down.
        'hand.L': (H + .15, -.13, .50), 'armPole.L': (SX + .45, .30, .30),
        'palmF.L': Unit((-.15, -.60, -.78)), 'palmN.L': (0, -.25, -.97), 'curl.L': .55,
    })
    T.cache['sit'] = f
    return dict(f)


def SitRifle(T):
    """HanYang/Type38 upright between the knees, butt in the dirt, leaning back to the right shoulder."""
    return T.RifleFromButt((-.04, -.30, .012), (-.21, .22, .95))


def SitBreath(t, f, period=4.0, amount=1.0):
    phase = Tau * t / period
    breath = math.sin(2 * phase) * amount           # two shallow breaths per loop
    slow = math.sin(phase)
    f['bend'] += .018 * breath
    f['shrug'] += .025 * breath
    p = f['pelvis']
    f['pelvis'] = (p[0], p[1], p[2] + .002 * breath)
    h = f['head']
    f['head'] = (h[0] + .025 * slow, h[1], h[2] + .045 * slow)
    f['twist'] += .012 * slow
    return f


def SitReview(T, rifle):
    return lambda t: T.RifleProps(rifle) + [('box', (0, .385 + .03, .7), (1.6, .06, 1.4), 0)]


SIT_WALL = [((0, .385, 0), (0, -1, 0))]     # dugout back wall, 0.385 source m behind the root
SIT_VIEWS = [('side', (-3.2, -.25, .75), (0, -.15, .45)), ('q', (-2.1, -2.8, 1.6), (0, -.15, .40))]


@Builder('WoundedSitRifleIdle')
def BuildWoundedSit(T, name):
    base = SitBase(T)
    rifle = SitRifle(T)
    anim = lambda t: SitBreath(t, dict(base))
    return {'pose': lambda t: T.Nest(anim(t)), 'props': lambda t: {'weapon': T.Track(rifle, up=(0, 1, 0))},
            'plants': [('L', 0, 4.0), ('R', 0, 4.0)], 'reviewProps': SitReview(T, rifle), 'walls': SIT_WALL,
            'reviewViews': SIT_VIEWS, 'reviewScale': 2.0,
            'check': lambda t: {'R': base['grip.R']}}


@Builder('BanterLaugh')
def BuildLaugh(T, name):
    base = SitBase(T)
    b, s, h = base['bend'], base['shrug'], base['head']
    anim = Keys(base, [
        (0.00, {}),
        (0.12, {'bend': b - .03, 'shrug': s + .06, 'head': (h[0] - .12, h[1], h[2])}),   # snort, breath in
        (0.24, {'bend': b + .13, 'shrug': s - .02, 'head': (h[0] + .10, h[1] + .04, h[2])}),  # first "ha"
        (0.38, {'bend': b + .04, 'shrug': s + .04, 'head': (h[0] - .04, h[1], h[2])}),
        (0.52, {'bend': b + .11, 'shrug': s, 'head': (h[0] + .08, h[1] + .03, h[2])}),
        (0.68, {'bend': b + .04, 'shrug': s + .03, 'head': (h[0] - .02, h[1], h[2])}),
        (0.86, {'bend': b + .08, 'shrug': s, 'head': (h[0] + .06, h[1] + .02, h[2])}),
        (1.10, {'bend': b + .02, 'shrug': s + .01, 'head': (h[0] + .01, h[1], h[2])}),
        (1.60, {'bend': b, 'shrug': s, 'head': h}),
    ], lag={'head': .05, 'neck': .03})
    rifle = SitRifle(T)
    return {'pose': lambda t: T.Nest(anim(t)), 'props': lambda t: {'weapon': T.Track(rifle, up=(0, 1, 0))},
            'plants': [('L', 0, 1.6), ('R', 0, 1.6)], 'reviewProps': SitReview(T, rifle),
            'reviewViews': SIT_VIEWS, 'reviewScale': 2.0, 'check': lambda t: {'R': base['grip.R']}}


@Builder('BanterLookShoulder')
def BuildLookShoulder(T, name):
    base = SitBase(T)
    h, n = base['head'], base['neck']
    look = {'head': (h[0] + .30, h[1] + .12, h[2] + .52), 'neck': (n[0] + .12, 0, .22),
            'twist': base['twist'] + .08, 'bend': base['bend'] + .03}
    anim = Keys(base, [
        (0.00, {}),
        (0.18, {'head': (h[0] - .04, h[1], h[2] + .06)}),        # small lead-in before the turn
        (0.55, look),
        (1.45, {'head': (look['head'][0] + .03, look['head'][1], look['head'][2] - .03)}),
        (1.85, {'head': (h[0] - .03, h[1], h[2] - .03), 'neck': n, 'twist': base['twist'], 'bend': base['bend']}),
        (2.20, {'head': h}),
    ], lag={'head': .04})
    rifle = SitRifle(T)
    return {'pose': lambda t: T.Nest(anim(t)), 'props': lambda t: {'weapon': T.Track(rifle, up=(0, 1, 0))},
            'plants': [('L', 0, 2.2), ('R', 0, 2.2)], 'reviewProps': SitReview(T, rifle),
            'reviewViews': SIT_VIEWS, 'reviewScale': 2.0, 'check': lambda t: {'R': base['grip.R']}}


@Builder('BanterPatRifle')
def BuildPatRifle(T, name):
    base = SitBase(T)
    rifle = SitRifle(T)
    grip = Vector(base['grip.R'])
    axis = Vector(rifle['axis'])
    pat = grip + axis * .10 + Vector((0, .035, 0))          # flat palm lands on the stock above the fist
    lift = pat + Vector((0, .10, .07))
    lift2 = pat + Vector((0, .07, .05))
    wrapF, wrapN = base['palmF.R'], base['palmN.R']
    patF, patN = Unit(tuple(axis + Vector((0, -.15, 0)))), Unit((.10, -1, .15))
    h = base['head']
    anim = Keys(base, [
        (0.00, {}),
        (0.22, {'grip.R': tuple(grip + Vector((0, .015, .01))), 'curl.R': .75}),
        (0.40, {'grip.R': tuple(lift), 'curl.R': .25, 'palmF.R': patF, 'palmN.R': patN,
                'head': (h[0] + .10, h[1], h[2] - .05), 'bend': base['bend'] + .02}),
        (0.62, {'grip.R': tuple(pat)}),
        (0.80, {'grip.R': tuple(lift2)}),
        (1.02, {'grip.R': tuple(pat), 'bend': base['bend'] + .04}),
        (1.22, {'grip.R': tuple(lift2), 'bend': base['bend'] + .02}),
        (1.55, {'grip.R': tuple(grip), 'curl.R': 1.0, 'palmF.R': wrapF, 'palmN.R': wrapN, 'head': (h[0] + .04, h[1], h[2])}),
        (2.00, {'bend': base['bend'], 'head': h}),
    ], lag={'head': .06})
    track = lambda t: {'R': anim(t)['grip.R']}
    return {'pose': lambda t: T.Nest(anim(t)), 'props': lambda t: {'weapon': T.Track(rifle, up=(0, 1, 0))},
            'plants': [('L', 0, 2.0), ('R', 0, 2.0)], 'reviewProps': SitReview(T, rifle),
            'reviewViews': SIT_VIEWS, 'reviewScale': 2.0, 'check': track,
            'reviewFrames': lambda n: [0, int(n * .31), int(n * .51), int(n * .78), n - 1]}


def StoopBase(T):
    """Hunched low-ceiling stance, rifle clamped at port: end of WoundedRiseWall."""
    if 'stoop' in T.cache:
        return dict(T.cache['stoop'])
    H, P, A, SX, SZ = T.H, T.P, T.A, T.SX, T.SZ
    rifle = StoopRifle(T)
    palms = T.Palms(rifle['axis'])
    f = T.Stand()
    f.update({
        'pelvis': (0, -.27, P - .16), 'pelvisTilt': (.22, 0, .05), 'bend': .40, 'twist': -.06, 'shrug': .10,
        'neck': (-.05, 0, 0), 'head': (-.22, 0, .04),
        'ankle.L': (H + .05, -.33, A), 'ankle.R': (-(H + .06), -.22, A),
        'legPole.L': (H + .12, -1.2, .55), 'legPole.R': (-(H + .12), -1.2, .55),
        'foot.L': (0, 12, 0), 'foot.R': (0, -12, 0),
        'grip.R': rifle['gripR'], 'grip.L': T.Along(rifle, .80),
        'armPole.R': (-(SX + .55), .10, P - .20), 'armPole.L': (SX + .30, -.20, P - .45),
        'palmF.R': palms['R'][0], 'palmN.R': palms['R'][1], 'curl.R': .95,
        'palmF.L': palms['L'][0], 'palmN.L': palms['L'][1], 'curl.L': .80,
    })
    T.cache['stoop'] = f
    return dict(f)


def StoopRifle(T):
    return T.Rifle((-(T.H + .04), -.44, T.P - .10), (.64, -.22, .74))


SIDE_WALL_X = .47            # the dugout mouth's side wall on his left (source metres)


@Builder('WoundedRiseWall')
def BuildRiseWall(T, name):
    H, P, A, SX = T.H, T.P, T.A, T.SX
    sit, stoop = SitBase(T), StoopBase(T)
    sitRifle, endRifle = SitRifle(T), StoopRifle(T)
    wall = (SIDE_WALL_X - .03, -.06, .52)               # palm flat on the side wall, left of him
    wallHigh = (SIDE_WALL_X - .03, -.12, .74)
    liftRifle = T.RifleFromButt((-.06, -.34, .08), (-.16, .16, .97))
    risenRifle = T.RifleFromButt((-.12, -.42, .30), (.08, -.06, .99))
    rifles = [(0.0, sitRifle), (0.40, sitRifle), (0.95, liftRifle), (1.70, risenRifle), (2.35, endRifle), (2.8, endRifle)]
    feetL, feetR = stoop['ankle.L'], stoop['ankle.R']
    wallPalm = {'palmF.L': (0, -.15, 1), 'palmN.L': (1, 0, 0), 'curl.L': .15}

    def RifleAt(t):
        for (t0, a), (t1, b) in zip(rifles, rifles[1:]):
            if t <= t1:
                w = Smooth((t - t0) / max(1e-6, t1 - t0))
                return T.Rifle(Lerp3(a['origin'], b['origin'], w), Unit(Lerp3(a['axis'], b['axis'], w)))
        return rifles[-1][1]

    keys = [
        (0.00, {}),
        # Anticipation: lean off the back wall, head down, both feet drawn in under the knees.
        (0.30, {'bend': sit['bend'] + .20, 'pelvisTilt': (-.30, 0, .04), 'head': (.35, .02, .10),
                'ankle.L': Add3(feetL, (0, .02, .04)), 'ankle.R': Add3(feetR, (0, -.04, .03)),
                'hand.L': (SIDE_WALL_X - .10, -.02, .45), 'palmF.L': (0, -.2, 1), 'palmN.L': (.8, 0, .3), 'curl.L': .30,
                'foot.L': (0, 12, 0), 'foot.R': (0, -12, 0)}),
        (0.45, {'ankle.L': feetL, 'ankle.R': feetR}),
        # Bandaged side takes the wall; weight comes forward over the feet.
        (0.55, dict(wallPalm, **{'hand.L': wall, 'pelvisTilt': (-.05, 0, .03), 'bend': .42, 'head': (.25, 0, .15)})),
        (0.95, {'pelvis': (0, -.10, .36), 'pelvisTilt': (.55, 0, .02), 'bend': .36, 'head': (.10, 0, .10), 'hand.L': wall}),
        # The shoulder pulls: the rise stalls, sharp inhale, head ducks toward the wound.
        (1.25, {'pelvis': (0, -.15, .45), 'pelvisTilt': (.50, .06, .10), 'bend': .30, 'shrug': .24,
                'head': (.32, .24, .22), 'twist': .14, 'hand.L': wallHigh}),
        (1.45, {'pelvis': (0, -.17, .48), 'shrug': .16, 'head': (.26, .15, .16), 'twist': .10, 'hand.L': wallHigh}),
        (1.85, {'pelvis': (0, -.24, P - .22), 'pelvisTilt': (.30, 0, .06), 'bend': .42, 'shrug': .12,
                'head': (-.10, 0, .05), 'twist': 0.0, 'hand.L': (SX + .12, -.30, P + .05), 'curl.L': .45,
                'palmF.L': (-.3, -.6, .2), 'palmN.L': (-.6, 0, .2)}),
        (2.10, {'palmF.L': stoop['palmF.L'], 'palmN.L': stoop['palmN.L'], 'curl.L': .8,
                'palmF.R': sit['palmF.R'], 'palmN.R': sit['palmN.R'], 'curl.R': 1.0}),
        (2.50, {'palmF.R': stoop['palmF.R'], 'palmN.R': stoop['palmN.R'], 'curl.R': .95}),
        (2.80, {k: stoop[k] for k in stoop if not k.startswith('grip')}),
    ]
    anim = Keys(sit, keys, lag={'head': .06, 'neck': .04})

    def Grips(t):
        # Right fist rides the handguard up, then slides down to the wrist of the stock once
        # the left hand has come off the wall onto the handguard (2.10-2.50).
        rifle = RifleAt(t)
        slide = Smooth((t - 2.10) / .40)
        out = {'R': T.Along(rifle, Mix(.66, WEAPONS[T.gun]['butt'], slide))}
        if t >= 2.10:
            out['L'] = T.Along(rifle, .80)
        return out

    def Pose(t):
        f = anim(t)
        g = Grips(t)
        f['grip.R'], f['grip.L'] = g['R'], g.get('L')
        return T.Nest(f)
    return {'pose': Pose, 'props': lambda t: {'weapon': T.Track(RifleAt(t), up=(0, 1, 0) if t < 1.5 else (0, 0, 1))},
            'plants': [('L', .45, 2.8), ('R', .45, 2.8)], 'check': Grips,
            'walls': [((0, .385, 0), (0, -1, 0)), ((SIDE_WALL_X, 0, 0), (-1, 0, 0))],
            'reviewProps': lambda t: T.RifleProps(RifleAt(t)) + [('box', (0, .415, .7), (1.6, .06, 1.4), 0),
                                                                ('box', (SIDE_WALL_X + .03, -.4, .7), (.06, 1.2, 1.4), 0)],
            'reviewViews': [('side', (-3.2, -.35, .8), (0, -.2, .55)), ('q', (-2.3, -2.6, 1.6), (0, -.2, .5)),
                            ('front', (-.3, -3.2, .9), (0, -.2, .55))],
            'reviewScale': 2.4, 'reviewFrames': lambda n: [0, int(n * .2), int(n * .45), int(n * .68), n - 1]}


WALL_LEFT_X = .60            # trench wall on his left after the blast (source metres)


def BuriedBase(T):
    """Slumped heap at the foot of the trench wall on his left: last frame of BlastSlamBuried,
    first frame of CaptiveDraggedFromDirt (same root)."""
    if 'buried' in T.cache:
        return dict(T.cache['buried'])
    H, A, SX = T.H, T.A, T.SX
    x0, y0 = .30, .22
    f = T.Stand()
    f.update({
        # Sitting in the loose earth, legs half bent and fallen outward, the trunk sagged
        # forward and over to the left so the left shoulder rests on the wall.
        'pelvis': (x0, y0, .125), 'pelvisTilt': (-.15, .10, .20), 'bend': .62, 'lean': .14, 'twist': .10, 'shrug': .02,
        'neck': (.25, -.05, .05), 'head': (.38, -.10, .10),
        'ankle.L': (x0 + H + .02, y0 - .50, A), 'ankle.R': (x0 - H - .14, y0 - .58, A),
        'legPole.L': (x0 + H + .20, y0 - .40, 1.0), 'legPole.R': (x0 - H - .60, y0 - .45, .70),
        'foot.L': (0, 25, 0), 'foot.R': (0, -35, 0),
        'hand.R': (x0 - .30, y0 - .12, .08), 'armPole.R': (x0 - .60, y0 + .30, .30),
        'palmF.R': (-.3, -.6, -.7), 'palmN.R': (0, .2, 1), 'curl.R': .55,
        'hand.L': (x0 + .02, y0 - .36, .20), 'armPole.L': (x0 + .45, y0 + .20, .25),
        'palmF.L': (-.4, -.6, -.6), 'palmN.L': (-.3, 0, -1), 'curl.L': .6,
    })
    T.cache['buried'] = f
    return dict(f)


@Builder('BlastSlamBuried')
def BuildBlastSlam(T, name):
    H, P, A, SX = T.H, T.P, T.A, T.SX
    stoop, buried = StoopBase(T), BuriedBase(T)
    start = StoopRifle(T)
    ground = T.Rifle((-.70, -.85, .035), (.94, -.30, .02))
    keys = [
        (0.00, {}),
        # Hit: shoved back-left, head whips toward the blast side, hands fly open.
        (0.06, {'pelvis': (.06, -.20, P - .17), 'bend': .22, 'head': (-.35, -.12, -.25), 'neck': (-.15, 0, -.10),
                'shrug': .30, 'curl.R': .1, 'curl.L': .1}),
        # Airborne part of the shove: arms flung up and back, legs scrambling back-left.
        (0.18, {'pelvis': (.20, .00, P - .20), 'pelvisTilt': (-.12, .20, .20), 'bend': .02, 'lean': .15, 'twist': .20,
                'head': (-.30, .15, .10), 'ankle.L': (H + .16, -.14, A + .03), 'ankle.R': (-(H - .06), -.10, A + .05),
                'hand.R': (-(SX + .30), .10, P + .40), 'hand.L': (SX + .28, .12, P + .35),
                'palmF.R': (-.3, .3, 1), 'palmN.R': (0, 1, 0), 'palmF.L': (.3, .3, 1), 'palmN.L': (0, 1, 0)}),
        # Left shoulder into the wall: a hard stop, head rebounds.
        (0.30, {'pelvis': (.27, .12, P - .28), 'pelvisTilt': (0, .15, .30), 'lean': .12, 'bend': .15,
                'head': (.20, -.15, .10), 'neck': (.10, -.05, .05),
                'ankle.L': (H + .22, -.12, A), 'ankle.R': (-(H - .10), -.22, A),
                'hand.L': (WALL_LEFT_X - .08, .10, P + .02), 'hand.R': (-(SX), -.20, P + .10), 'curl.R': .4, 'curl.L': .3}),
        # Legs go: slides down the wall.
        (0.55, {'pelvis': (.30, .18, .42), 'pelvisTilt': (-.05, .12, .25), 'bend': .45, 'lean': .16,
                'head': (.35, -.05, .15), 'ankle.L': (.30 + H + .02, -.22, A), 'ankle.R': (.30 - H - .12, -.30, A),
                'hand.L': (.36, -.08, .36), 'hand.R': (.02, -.02, .28)}),
        (0.85, {'pelvis': (.30, .22, .15), 'bend': .58, 'head': (.42, -.08, .12)}),
        (1.05, {'head': (.35, -.10, .10), 'bend': .60}),       # small rebound as he lands
        (1.50, {k: buried[k] for k in buried}),
    ]
    anim = Keys(stoop, keys, lag={'head': .04, 'neck': .03})

    def RifleAt(t):
        if t <= .06:
            return start
        u = Clamp((t - .06) / .56)
        # Torn forward-right out of his hands: travel leads, the tumble follows.
        travel = 1 - (1 - u) ** 2
        o = Lerp3(start['origin'], ground['origin'], travel)
        o = (o[0], o[1], o[2] + .45 * math.sin(math.pi * Clamp(u * 1.15)) * (1 - u))
        spin = Quaternion(Vector((0, 0, 1)), -2.2 * Smooth(u)) @ Quaternion(Vector((1, 0, 0)), 1.6 * Smooth(u))
        axis = Unit(Lerp3(tuple(spin @ Vector(start['axis'])), ground['axis'], Smooth((u - .6) / .4)))
        return T.Rifle(o, axis)

    def Pose(t):
        f = anim(t)
        if t <= .05:
            r = RifleAt(t)
            f['grip.R'], f['grip.L'] = r['gripR'], T.Along(r, .80)
        else:
            f['grip.R'] = f['grip.L'] = None
        return T.Nest(f)
    return {'pose': Pose, 'props': lambda t: {'weapon': T.Track(RifleAt(t))},
            'walls': [((WALL_LEFT_X, 0, 0), (-1, 0, 0))],
            'reviewProps': lambda t: T.RifleProps(RifleAt(t)) + [('box', (WALL_LEFT_X + .03, 0, .7), (.06, 2.0, 1.4), 0)],
            'reviewViews': [('side', (-3.2, -.35, .8), (.2, -.1, .55)), ('q', (-2.3, -2.6, 1.6), (.2, -.1, .5)),
                            ('back', (-1.5, 2.8, 1.6), (.2, 0, .5))],
            'reviewFrames': lambda n: [0, int(n * .12), int(n * .2), int(n * .4), n - 1], 'reviewScale': 2.6}


# ---------------------------------------------------------------------------------
# 01: the comrade dragged out of the dirt, shoved to the wall, kneeling against it.
# Victim root = BlastSlamBuried root for the drag; R3 (his kneel spot) afterwards.
# ---------------------------------------------------------------------------------
DRAG_END = (.06, -.50)          # victim kneel spot (R3 origin) in the drag root (source metres, Blender axes)
DRAG_TURN = -math.pi / 2        # hauled round to face his right: the trench wall ends up behind him
WALL_R3_Y = .54                 # that wall, behind him in R3 (it is the same wall as WALL_LEFT_X)


def R3ToDrag(p):
    """R3 point -> drag root (R3 is the drag root turned by DRAG_TURN about DRAG_END)."""
    x, y = _Rot(p[0], p[1], DRAG_TURN)
    return (x + DRAG_END[0], y + DRAG_END[1], p[2])


def R3Kneel(T):
    """The kneel he is dropped into, R3 local (upright on both knees, no wall contact yet)."""
    k = KneelFlat(T, 0.0, 0.0)
    return k


def DragVictimKeys(T):
    H, A, SX = T.H, T.A, T.SX
    K = T.K
    kz = K['kneelPelvisZ']
    kneel = {key: (R3ToDrag(v) if isinstance(v, tuple) and key != 'foot.L' and key != 'foot.R' else v)
             for key, v in R3Kneel(T).items()}
    kneelMid = KneelFlat(T, .27, -.20)
    kp = kneelMid['foot.L']
    ex, ey = DRAG_END
    rows = [
        (0.00, {'turn': 0.0, 'handRel.L': (.06, -.10, -.50), 'poleRel.L': (.40, .30, -.20), 'handRelW.L': 0.0,
                'palmFw.L': (-.4, -.6, -.6), 'palmNw.L': (-.3, 0, -1), 'palmF.L': (0, -.2, -1), 'palmN.L': (-1, 0, 0)}),
        # The grab: a groan, the head comes up a little.
        (0.30, {'head': (.24, -.05, .05), 'shrug': .08, 'neck': (.20, -.05, .05)}),
        # Hauled up by the collar and the right arm: trunk lifts, head hangs.
        (0.60, {'pelvis': (.30, .10, .22), 'pelvisTilt': (.30, .05, .12), 'bend': .45, 'lean': .05, 'twist': -.05,
                'head': (.45, .05, .10), 'neck': (.25, 0, .05),
                'hand.R': (.02, -.20, .62), 'palmF.R': (0, -.7, .7), 'palmN.R': (-.5, 0, -.8), 'curl.R': .4,
                'hand.L': (.36, .02, .08)}),
        # Dragged: knees in the dirt behind him, feet trailing on their insteps.
        (1.00, {'pelvis': (.28, -.16, .34), 'pelvisTilt': (.55, 0, .05), 'bend': .42,
                'ankle.L': kneelMid['ankle.L'], 'ankle.R': kneelMid['ankle.R'],
                'legPole.L': kneelMid['legPole.L'], 'legPole.R': kneelMid['legPole.R'], 'foot.L': kp, 'foot.R': kp,
                'hand.R': (.04, -.40, .74), 'handRelW.L': 1.0}),
        # One foot gets under him and shoves -- and goes out again.
        (1.25, {'ankle.R': (.27 - H - .02, -.46, A), 'legPole.R': (.27 - H - .10, -1.2, .6), 'foot.R': (0, -8, 0),
                'pelvis': (.27, -.28, .42)}),
        (1.45, {'ankle.R': (.27 - H - .02, -.46, A), 'pelvis': (.27, -.34, .50), 'bend': .35}),
        (1.70, {'ankle.R': kneelMid['ankle.R'], 'legPole.R': kneelMid['legPole.R'], 'foot.R': kp,
                'pelvis': (.26, -.38, .36), 'bend': .45}),
        (2.00, {'pelvis': (ex, ey - .02, .36), 'hand.R': (ex - .20, ey - .30, .80), 'turn': 0.0}),
        # "立て！" -- jerked up and round by the collar; the head snaps back, the legs do not hold.
        (2.20, {'pelvis': (ex, ey, kz + .16), 'pelvisTilt': (.10, 0, 0), 'bend': .18, 'turn': -.55,
                'head': (-.12, 0, 0), 'neck': (-.05, 0, 0), 'shrug': .20}),
        (2.45, {'pelvis': (ex, ey, kz + .08), 'bend': .25, 'head': (.15, 0, .05), 'turn': -1.25}),
        (2.75, {'pelvis': kneel['pelvis'], 'ankle.L': kneel['ankle.L'], 'ankle.R': kneel['ankle.R'],
                'legPole.L': kneel['legPole.L'], 'legPole.R': kneel['legPole.R'], 'turn': DRAG_TURN,
                # The held right arm comes round with him (R3 = his own frame from here on).
                'hand.R': R3ToDrag((-.20, -.30, .80)),
                'pelvisTilt': (.12, 0, 0), 'bend': .32, 'head': (.35, .05, .08),
                'neck': (.15, 0, 0), 'shrug': .08}),
        # The arm is wrenched up across the wound: sharp inhale, the face screws up.
        (3.20, {'hand.R': R3ToDrag((-.42, -.30, 1.05)), 'twist': -.25, 'lean': -.10, 'shrug': .28,
                'head': (-.18, -.15, -.10), 'bend': .20}),
        (3.45, {'hand.R': R3ToDrag((-.44, -.30, 1.10)), 'head': (-.22, -.18, -.12), 'shrug': .32}),
        (3.85, {'hand.R': R3ToDrag((-.36, -.26, .82)), 'twist': -.12, 'lean': -.04, 'shrug': .15,
                'head': (.10, -.05, -.05), 'bend': .28}),
        (4.15, {'hand.R': R3ToDrag((-.30, -.14, .66))}),
        (4.40, {'hand.R': R3ToDrag((-.26, -.04, .45)), 'palmF.R': (0, -.2, -1), 'palmN.R': (1, 0, 0),
                'head': (.32, .02, .02), 'bend': .30, 'twist': -.04, 'lean': 0.0}),
    ]
    return Keys(BuriedBase(T), rows, lag={'head': .06, 'neck': .03})


@Builder('CaptiveDraggedFromDirt')
def BuildCaptiveDragged(T, name):
    raw = DragVictimKeys(T)

    def anim(t):
        f = raw(t)
        return Turned(f, f['turn'])
    return {'pose': lambda t: T.Nest(anim(t)), 'walls': [((WALL_LEFT_X, 0, 0), (-1, 0, 0))],
            'reviewProps': lambda t: [('box', (WALL_LEFT_X + .03, 0, .7), (.06, 2.0, 1.4), 0)],
            'reviewViews': [('side', (-3.4, -.3, .8), (.25, -.2, .45)), ('q', (-2.4, -2.9, 1.7), (.25, -.2, .45))],
            'reviewFrames': lambda n: [0, int(n * .14), int(n * .3), int(n * .5), int(n * .62), int(n * .75), n - 1],
            'reviewScale': 2.6}


def Standing(T, crouch=0.0, bend=.08):
    """Stand() with the free arms hanging in the torso frame (they follow any bend or step);
    a clip that wants a world-space hand sets handRelW.<side> = 0 for it."""
    f = T.Stand()
    p = f['pelvis']
    f['pelvis'] = (p[0], p[1], p[2] - crouch)
    f['bend'] = bend
    f.update({'handRel.L': (.07, -.10, -.47), 'handRel.R': (-.07, -.10, -.47), 'handRelW.L': 1.0, 'handRelW.R': 1.0,
              'palmF.L': (0, -.2, -1), 'palmN.L': (-1, 0, 0), 'palmF.R': (0, -.2, -1), 'palmN.R': (1, 0, 0)})
    return f


def AttackerSpec(T, stage, role, partner, grips, body, duration, extra=None, walls=None):
    """Attacker clip whose hands ride the partner's skin patches.

    grips: {side: [(t0, t1, point, normalOffset, down, curl)]} contact windows; outside a
    window the hand eases between its body pose and the next contact (0.18 s reach)."""
    lookups = {}
    spec = {}

    def Rows(side):
        for row in grips.get(side, []):
            yield (row + (stage,))[:7]

    def Contact(side, t):
        rows = list(Rows(side))
        inside = [r for r in rows if r[0] <= t <= r[1]]
        for t0, t1, point, offset, down, curl, st in inside + rows:
            if t0 - .18 <= t <= t1 + .18:
                hit = PartnerPoint(T, st, role, partner, point, Clamp(t, t0, t1), offset)
                if hit is None:
                    return None
                w = 1.0 if t0 <= t <= t1 else Smooth(1 - (t0 - t) / .18) if t < t0 else Smooth(1 - (t - t1) / .18)
                return hit, w, down, curl
        return None

    def Pose(t):
        f = body(t)
        spec['ghost'] = t
        for side in LR:
            c = Contact(side, t)
            if c is None:
                continue
            (point, normal), w, down, curl = c
            palmF, palmN, _ = Grab(normal, down)
            f['grip.' + side] = tuple(point)
            f['gripW.' + side] = w
            f['palmF.' + side] = Unit(Lerp3(f.get('palmF.' + side) or palmF, palmF, w))
            f['palmN.' + side] = Unit(Lerp3(f.get('palmN.' + side) or palmN, palmN, w))
            f['curl.' + side] = Mix(f.get('curl.' + side, .4), curl, Smooth((w - .6) / .4))
        if extra:
            f = extra(t, f)
        return T.Nest(f)

    def Check(t):
        out = {}
        for side in LR:
            for t0, t1, point, offset, _, _, st in Rows(side):
                if t0 <= t <= t1:
                    hit = PartnerPoint(T, st, role, partner, point, t, offset)
                    out[side] = tuple(hit[0]) if hit else None
        return out

    def Markers(t):
        rows = []
        ghostStage = stage
        for side in LR:
            for t0, t1, point, offset, _, _, st in Rows(side):
                if t0 - .2 <= t <= t1 + .2:
                    ghostStage = st
                hit = PartnerPoint(T, st, role, partner, point, Clamp(t, t0, t1), offset)
                if hit and t0 - .2 <= t <= t1 + .2:
                    rows.append(('point', tuple(hit[0]), None, .04))
        return rows + PartnerGhost(T, ghostStage, role, partner, t)
    spec.update({'pose': Pose, 'check': Check, 'markers': Markers})
    return spec


def PartnerPath(T, stage, role, partner, point, times, offset=0.0, fallback=(0, -.6, .6)):
    rows = []
    for t in times:
        hit = PartnerPoint(T, stage, role, partner, point, t, offset)
        rows.append((t, tuple(hit[0]) if hit else fallback))
    return rows


def SlungProps(T, side='back'):
    def Props(t):
        rifle, up = SlungRifle(T, side)
        return {'weapon': (rifle['origin'], rifle['axis'], up, True)}

    def Review(t):
        rifle, _ = SlungRifle(T, side)
        return T.RifleProps(rifle)
    return Props, Review


@Builder('IjaDragCollarFromDirt')
def BuildDragCollar(T, name):
    H, P, A, SX, SZ = T.H, T.P, T.A, T.SX, T.SZ
    stage, role = 'captiveDrag', 'ijaA'
    times = [0.0, .30, .60, 1.00, 1.45, 2.00, 2.20, 2.75, 3.20, 3.85, 4.40]
    collar = PartnerPath(T, stage, role, 'comrade', 'collarBack', times)
    # Pelvis rides 0.50 m behind the collar (his own +Y), height by how far down he reaches.
    def PelvisXY(t):
        c = Channel(collar)(t)
        return (c[0] * .85, c[1] + .52)
    crouch = [(0.0, .06), (.30, .20), (.60, .16), (1.0, .12), (2.0, .12), (2.20, .02), (2.75, .08), (4.40, .06)]
    bend = [(0.0, .15), (.30, .62), (.60, .48), (1.0, .40), (2.0, .40), (2.20, .10), (2.35, .05), (2.75, .25), (4.40, .22)]
    tilt = [(0.0, (.05, 0, 0)), (.30, (.35, 0, .05)), (1.0, (.25, 0, .05)), (2.20, (-.08, 0, 0)), (2.75, (.12, 0, 0))]
    # The haul starts at the grab (0.30 s) and moves the collar 0.6 m in 0.65 s: he backs off
    # from the first pull, one short backward step every quarter second, then steps in on the
    # jerk up at 2.2 s (the collar rises and comes forward) and settles.
    schedule = [('R', .30, .55), ('L', .57, .82), ('R', .84, 1.08), ('L', 1.10, 1.36), ('R', 1.42, 1.70),
                ('L', 1.74, 2.00), ('R', 2.06, 2.30), ('L', 2.52, 2.76)]
    stance = {'L': (H + .06, -.12, T.A), 'R': (-(H + .04), .16, T.A)}
    feet, plants = FollowSteps(PelvisXY, stance, schedule, 4.4)
    pelvis = [(t, (PelvisXY(t)[0], PelvisXY(t)[1], P - .04 - Channel(crouch)(t))) for t in times]
    base = Standing(T)
    base.update({'handRel.L': (.08, -.14, -.46), 'palmF.L': (0, -.3, -1), 'palmN.L': (-1, 0, 0), 'curl.L': .9})
    anim = Tracks(base, dict(feet, pelvis=pelvis, bend=bend, pelvisTilt=tilt,
                             head=[(0.0, (.10, 0, 0)), (.30, (.25, 0, .05)), (2.20, (-.15, 0, 0)), (2.75, (.05, 0, .10)),
                                   (3.20, (.0, 0, -.35)), (3.85, (.05, 0, .05))],
                             **{'hand.R': [(0.0, (-(SX + .05), -.05, P - .05))],
                                'armPole.R': [(0.0, (-(SX + .45), .30, P - .10)), (2.20, (-(SX + .50), .45, P + .10))]}),
                  lag={'head': .06})
    spec = AttackerSpec(T, stage, role, 'comrade', {'R': [(.30, 4.40, 'collarBack', .035, (0, 0, -1), 1.0)]},
                        anim, 4.4)
    props, review = SlungProps(T)
    spec.update({'props': props, 'plants': plants,
                 'reviewProps': lambda t: review(t) + spec['markers'](t),
                 'reviewViews': [('side', (-3.4, -.3, .9), (0, -.3, .6)), ('q', (-2.4, -2.9, 1.7), (0, -.3, .6))],
                 'reviewFrames': lambda n: [0, int(n * .07), int(n * .3), int(n * .5), int(n * .73), n - 1]})
    return spec


@Builder('IjaPullArm')
def BuildPullArm(T, name):
    H, P, A, SX, SZ = T.H, T.P, T.A, T.SX, T.SZ
    stage, role = 'captiveDrag', 'ijaB'
    times = [round(.2 * i, 2) for i in range(22)] + [4.4]
    arm = PartnerPath(T, stage, role, 'comrade', 'upperArmR', times)

    def PelvisXY(t):
        c = Channel(arm)(t)
        return (c[0] - .05, c[1] + .50)
    crouch = [(0.0, .05), (.28, .18), (.60, .12), (2.0, .10), (2.75, .08), (3.20, .02), (3.45, .0), (4.40, .06)]
    bend = [(0.0, .12), (.28, .55), (.60, .40), (2.0, .38), (2.75, .30), (3.20, .08), (3.45, .02), (3.85, .15), (4.40, .15)]
    # The arm travels 0.45 m to his right between 0.6 and 1.0 s, 0.25 m back by 1.2 s, another
    # 0.25 m right-back by 2.0 s and swings 0.3 m back left on the jerk up (2.0-2.2 s): side
    # steps lead with the foot on the side he travels to, so no planted leg is left behind.
    schedule = [('R', .52, .76), ('L', .78, 1.02), ('R', 1.06, 1.28), ('L', 1.30, 1.52), ('R', 1.60, 1.84),
                ('L', 2.02, 2.24), ('R', 2.28, 2.50), ('L', 3.05, 3.25), ('R', 3.95, 4.20)]
    stance = {'L': (H + .05, -.14, T.A), 'R': (-(H + .05), .14, T.A)}
    feet, plants = FollowSteps(PelvisXY, stance, schedule, 4.4)
    pelvis = [(t, (PelvisXY(t)[0], PelvisXY(t)[1], P - .04 - Channel(crouch)(t))) for t in times]
    base = Standing(T)
    base.update({'handRel.L': (.08, -.16, -.45), 'handRel.R': (-.08, -.16, -.45),
                 'palmF.L': (0, -.2, -1), 'palmN.L': (-1, 0, 0), 'palmF.R': (0, -.2, -1), 'palmN.R': (1, 0, 0)})
    crouch = [(0.0, .05), (.28, .26), (.60, .16), (2.0, .12), (2.75, .08), (3.20, .06), (3.45, .05), (4.40, .06)]
    bend = [(0.0, .12), (.28, .62), (.60, .45), (2.0, .38), (2.75, .30), (3.20, .20), (3.45, .18), (3.85, .20), (4.40, .15)]
    pelvis = [(t, (PelvisXY(t)[0], PelvisXY(t)[1], P - .04 - Channel(crouch)(t))) for t in times]
    anim = Tracks(base, dict(feet, pelvis=pelvis, bend=bend,
                             pelvisTilt=[(0.0, (.05, 0, 0)), (.28, (.30, 0, 0)), (3.20, (.05, 0, .10)), (3.85, (.08, 0, 0))],
                             twist=[(0.0, 0.0), (3.20, .20), (3.85, .05)],
                             head=[(0.0, (.10, 0, 0)), (.28, (.20, 0, 0)), (3.20, (-.10, 0, 0)), (3.85, (.10, 0, 0))],
                             **{'armPole.L': [(0.0, (SX + .55, .10, P - .10))], 'armPole.R': [(0.0, (-(SX + .45), .25, P - .20))]}),
                  lag={'head': .05})
    grips = {'L': [(.28, 4.05, 'upperArmR', .045, (0, 0, -1), 1.0)],
             'R': [(.62, 4.05, 'wristR', .04, (0, 0, -1), 1.0)]}
    spec = AttackerSpec(T, stage, role, 'comrade', grips, anim, 4.4)
    props, review = SlungProps(T)
    spec.update({'props': props, 'plants': plants,
                 'reviewProps': lambda t: review(t) + spec['markers'](t),
                 'reviewViews': [('side', (-3.4, -.3, .9), (0, -.3, .6)), ('q', (-2.4, -2.9, 1.7), (0, -.3, .6))],
                 'reviewFrames': lambda n: [0, int(n * .07), int(n * .3), int(n * .5), int(n * .73), n - 1]})
    return spec


R3_WALL = [((0, WALL_R3_Y, 0), (0, -1, 0))]
R3_WALL_BOX = ('box', (0, WALL_R3_Y + .03, .7), (2.0, .06, 1.4), 0)
R3_VIEWS = [('side', (-3.0, -.3, .8), (0, 0, .55)), ('q', (-2.2, -2.8, 1.6), (0, 0, .5)),
            ('front', (-.4, -3.2, .9), (0, 0, .55))]


def KneelWallBase(T):
    """Kneel-sitting with shoulders and back on the wall behind, right palm pressed over the
    torn bandage. End of CaptiveWallBrace, CaptiveKneelMud frame 0, start of
    CaptiveHeadPulledBack (root R3)."""
    if 'kneelWall' in T.cache:
        return dict(T.cache['kneelWall'])
    f = Standing(T)
    k = KneelFlat(T, 0.0, .02, sit=.35)
    f.update(k)
    f.update({'pelvisTilt': (-.22, 0, .04), 'bend': .12, 'lean': .05, 'twist': -.05, 'shrug': .10,
              'neck': (.10, 0, -.05), 'head': (.22, .08, .10),
              # Right palm over the bandage on the left shoulder, left forearm dropped on the
              # left thigh; both in the torso frame so breathing and the hair pull carry them.
              'handRel.R': (.25, -.13, -.12), 'poleRel.R': (-.10, -.30, -.40), 'handRelW.R': 1.0,
              'palmF.R': (.35, .05, .94), 'palmN.R': (0, .95, .1), 'curl.R': .45,
              'handRel.L': (.03, -.20, -.40), 'poleRel.L': (.40, .20, -.20), 'handRelW.L': 1.0,
              'palmF.L': (0, -.6, -.8), 'palmN.L': (0, -.2, -1), 'curl.L': .50})
    T.cache['kneelWall'] = f
    return dict(f)


def KneelAfterDrag(T):
    """First frame of CaptiveWallBrace: the drag's last pose expressed in R3."""
    f = DragVictimKeys(T)(4.4)
    ex, ey = DRAG_END
    for key in list(f):
        v = f[key]
        if v is not None and (key == 'pelvis' or key.startswith(POSITION_CHANNELS)):
            x, y = _Rot(v[0] - ex, v[1] - ey, -DRAG_TURN)
            f[key] = (x, y, v[2])
    f.pop('frameYaw', None)
    f.pop('frameShift', None)
    f.pop('turn', None)
    return f


@Builder('CaptiveWallBrace')
def BuildWallBrace(T, name):
    start, end = KneelAfterDrag(T), KneelWallBase(T)
    kz = start['pelvis'][2]
    for s in LR:
        start['palmFw.' + s], start['palmNw.' + s] = start['palmF.' + s], start['palmN.' + s]
        start['palmF.' + s], start['palmN.' + s] = end['palmF.' + s], end['palmN.' + s]
        start['handRel.' + s], start['poleRel.' + s], start['handRelW.' + s] = end['handRel.' + s], end['poleRel.' + s], 0.0
    # The left arm was hanging in the body frame at the end of the drag: keep it there.
    start['handRel.L'], start['poleRel.L'], start['handRelW.L'] = (.06, -.10, -.50), (.40, .30, -.20), 1.0
    start['palmF.L'], start['palmN.L'] = (0, -.2, -1), (-1, 0, 0)
    wallY = WALL_R3_Y - .07          # wrist target: the palm and fingers lie on the wall in front of it
    rows = [
        (0.00, {}),
        (0.26, {'head': (.25, 0, .05)}),
        (0.40, {'handRelW.L': 1.0}),
        # Palm on the chest: the trunk is driven back, the head lags forward.
        (0.34, {'bend': -.12, 'pelvisTilt': (-.25, 0, 0), 'head': (.42, 0, .02), 'shrug': .18,
                'pelvis': Add3(start['pelvis'], (0, .06, 0))}),
        # Toppling backward: the left hand shoots back for the wall.
        (0.48, {'pelvis': (.02, .10, kz - .06), 'bend': -.05, 'lean': .08, 'head': (.10, .05, .05),
                'hand.L': (.24, wallY - .03, kz + .30), 'palmFw.L': (0, .2, 1), 'palmNw.L': (0, 1, 0), 'curl.L': .15,
                'armPole.L': (.55, -.20, kz), 'handRelW.R': 0.0, 'handRelW.L': 0.0}),
        (0.62, {'hand.L': (.24, wallY, kz + .22)}),
        # The loose earth gives: the palm slides down, shoulders and back take the wall.
        (1.20, {'hand.L': (.26, wallY, kz - .12), 'pelvis': end['pelvis'], 'lean': .06, 'pelvisTilt': (-.24, 0, .03),
                'bend': .10, 'head': (.28, .08, .10)}),
        (1.35, {'handRelW.R': 1.0, 'handRelW.L': 0.0}),
        (1.70, {'handRelW.L': 1.0, 'curl.L': .5}),
        # Every channel lands on KneelWallBase, the world hand/pole seeds too: the arm IK keeps
        # the roll of its first solve, so the seeds decide the forearm twist the next clip starts on.
        (2.00, dict(end)),
    ]
    anim = Keys(start, rows, lag={'head': .05, 'neck': .03})
    return {'pose': lambda t: T.Nest(anim(t)), 'walls': R3_WALL,
            'reviewProps': lambda t: [R3_WALL_BOX], 'reviewViews': R3_VIEWS,
            'reviewFrames': lambda n: [0, int(n * .17), int(n * .26), int(n * .45), n - 1], 'reviewScale': 2.2}


@Builder('CaptiveKneelMud')
def BuildKneelMud(T, name):
    base = KneelWallBase(T)

    def Pose(t):
        f = dict(base)
        phase = Tau * t / 3.0
        breath = math.sin(3 * phase)             # three hard breaths every three seconds
        sway = math.sin(phase)
        f['bend'] += .03 * breath
        f['shrug'] += .035 * breath
        p = f['pelvis']
        f['pelvis'] = (p[0], p[1], p[2] + .004 * breath)
        h = f['head']
        f['head'] = (h[0] + .06 * sway + .02 * breath, h[1] + .04 * math.sin(2 * phase), h[2] + .05 * sway)
        f['twist'] += .02 * sway
        r = f['handRel.R']
        f['handRel.R'] = (r[0], r[1], r[2] + .008 * breath)
        return T.Nest(f)
    return {'pose': Pose, 'walls': R3_WALL, 'reviewProps': lambda t: [R3_WALL_BOX], 'reviewViews': R3_VIEWS,
            'reviewScale': 2.2}


@Builder('IjaShoveToWall')
def BuildShoveToWall(T, name):
    H, P, A, SX, SZ = T.H, T.P, T.A, T.SX, T.SZ
    stage, role = 'captiveWall', 'ijaA'
    base = Standing(T)
    base.update({'hand.R': (-(SX + .06), -.06, P + .02), 'palmFw.R': (0, -.3, -1), 'palmNw.R': (1, 0, 0), 'curl.R': .7,
                 'handRelW.R': 0.0,
                 'handRel.L': (.08, -.10, -.47), 'palmF.L': (0, -.2, -1), 'palmN.L': (-1, 0, 0), 'curl.L': .6})
    feet = {'ankle.L': [(0.0, base['ankle.L']), (.12, base['ankle.L']), (.22, Add3(base['ankle.L'], (0, -.12, .06))),
                        (.32, Add3(base['ankle.L'], (0, -.32, 0)))],
            'ankle.R': [(0.0, base['ankle.R'])]}
    anim = Tracks(base, dict(feet,
                             pelvis=[(0.0, base['pelvis']), (.14, Add3(base['pelvis'], (0, .04, -.02))),
                                     (.34, Add3(base['pelvis'], (0, -.22, -.08))), (.55, Add3(base['pelvis'], (0, -.20, -.07))),
                                     (1.0, Add3(base['pelvis'], (0, -.10, -.04)))],
                             bend=[(0.0, .08), (.14, .02), (.34, .32), (.55, .30), (1.0, .18)],
                             twist=[(0.0, 0.0), (.14, .18), (.34, -.10), (.60, -.05), (1.0, 0.0)],
                             head=[(0.0, (.05, 0, 0)), (.34, (.20, 0, 0)), (1.0, (.12, 0, .05))],
                             **{'hand.R': [(0.0, base['hand.R']), (.14, (-(SX + .02), .06, SZ - .30)),
                                           (.70, (-(SX + .04), -.10, SZ - .38)), (1.0, base['hand.R'])],
                                'armPole.R': [(0.0, (-(SX + .45), .40, P - .10)), (.34, (-(SX + .45), .10, P - .20))]}),
                  lag={'head': .05})
    spec = AttackerSpec(T, stage, role, 'comrade', {'R': [(.34, .56, 'chestFront', .04, (0, 0, 1), .15)]}, anim, 1.0)
    props, review = SlungProps(T)
    spec.update({'props': props, 'plants': [('R', 0, 1.0), ('L', .32, 1.0)],
                 'reviewProps': lambda t: review(t) + spec['markers'](t),
                 'reviewFrames': lambda n: [0, int(n * .14), int(n * .34), int(n * .5), n - 1]})
    return spec


# =================================================================================
# 01: hair, blade, taunt, release. Victim root R3 (as CaptiveWallBrace); ijaA's root is
# the same spot for the whole run (square in front, a little to the victim's right).
# =================================================================================
IJA_A_AT = {'x': -.04, 'z': -.28, 'yawDeg': 180}
STAGES['slashGrab'] = {'anchor': 'comrade', 'notes': 'IjaHairGrabPull and CaptiveHeadPulledBack start together.',
                       'actors': {'comrade': {'rig': 'LugouNra02', 'clip': 'CaptiveHeadPulledBack', 'x': 0.0, 'z': 0.0, 'yawDeg': 0},
                                  'ijaA': dict(IJA_A_AT, rig='LugouIja02', clip='IjaHairGrabPull')}}
STAGES['slashDraw'] = {'anchor': 'comrade', 'notes': 'IjaDrawBayonet starts 1.0 s into CaptiveHeadPulledBack (the hair is still held).',
                       'actors': {'comrade': {'rig': 'LugouNra02', 'clip': 'CaptiveHeadPulledBack', 'x': 0.0, 'z': 0.0, 'yawDeg': 0},
                                  'ijaA': dict(IJA_A_AT, rig='LugouIja02', clip='IjaDrawBayonet', offsetS=1.0)}}
STAGES['slashCut'] = {'anchor': 'comrade', 'notes': 'IjaThroatSlash and CaptiveThroatCut start together; the blade crosses at 0.24 s.',
                      'actors': {'comrade': {'rig': 'LugouNra02', 'clip': 'CaptiveThroatCut', 'x': 0.0, 'z': 0.0, 'yawDeg': 0},
                                 'ijaA': dict(IJA_A_AT, rig='LugouIja02', clip='IjaThroatSlash')}}
STAGES['slashTaunt'] = {'anchor': 'comrade', 'notes': 'CaptiveClutchThroat loops from IjaThroatSlash 1.0 s; both loop the same 3.0 s.',
                        'actors': {'comrade': {'rig': 'LugouNra02', 'clip': 'CaptiveClutchThroat', 'x': 0.0, 'z': 0.0, 'yawDeg': 0, 'offsetS': 1.0},
                                   'ijaA': dict(IJA_A_AT, rig='LugouIja02', clip='IjaThroatSlash')}}
STAGES['slashWipe'] = {'anchor': 'comrade', 'notes': 'IjaWipeSheathBayonet starts when CaptiveWallSlideTwitch has finished (3.2 s).',
                       'actors': {'comrade': {'rig': 'LugouNra02', 'clip': 'CaptiveWallSlideTwitch', 'x': 0.0, 'z': 0.0, 'yawDeg': 0},
                                  'ijaA': dict(IJA_A_AT, rig='LugouIja02', clip='IjaWipeSheathBayonet', offsetS=3.2)}}
PARTNER_SOURCES['LugouNra02'].update({
    'CaptiveHeadPulledBack': ['crown', 'hairBack', 'throat'],
    'CaptiveThroatCut': ['crown', 'hairBack', 'throat'],
    'CaptiveClutchThroat': ['crown', 'hairBack'],
    'CaptiveWallSlideTwitch': ['shoulderR', 'hairBack'],
})

Meta('CaptiveHeadPulledBack', 1.8, False, 'free', role='comrade', rig='LugouNra02', rootMotion=False, stage='slashGrab',
     env={'wallBehindM': .49},
     contacts=[{'t': .28, 'by': 'ijaA', 'part': 'hairBack', 'action': 'grab'}],
     prev=['CaptiveKneelMud', 'CaptiveWallBrace'], next=['CaptiveThroatCut'],
     notes='Fist in the hair, the head is torn back and the throat opened; both hands come up by reflex '
           'and stay half-raised while the bayonet is drawn (covers IjaHairGrabPull + IjaDrawBayonet).')
Meta('IjaHairGrabPull', 1.0, False, 'track', role='ijaA', rig='LugouIja02', props=['weapon'], rootMotion=False,
     stage='slashGrab', weaponState='slungBack',
     contacts=[{'t': .28, 'limb': 'handL', 'action': 'grab', 'partnerRole': 'comrade', 'part': 'hairBack'},
               {'t': .42, 'limb': 'handL', 'action': 'yank', 'partnerRole': 'comrade'}],
     next=['IjaDrawBayonet'],
     notes='Half step in, left fist into the hair, yanks the head back hard. No pause before the draw.')
Meta('IjaDrawBayonet', .8, False, 'track', role='ijaA', rig='LugouIja02', props=['weapon', 'bayonet'], rootMotion=False,
     stage='slashDraw', weaponState='slungBack',
     contacts=[{'t': 0, 'limb': 'handL', 'action': 'hold', 'partnerRole': 'comrade', 'part': 'hairBack'},
               {'t': .22, 'limb': 'handR', 'action': 'grip', 'target': 'bayonet', 'part': 'handle'},
               {'t': .30, 'limb': 'handR', 'action': 'draw', 'target': 'bayonet'}],
     events=[{'t': .30, 'kind': 'bayonetDraw', 'sound': 'bladeScrape'}],
     prev=['IjaHairGrabPull'], next=['IjaThroatSlash'],
     notes='Left fist keeps the hair; right hand to the scabbard on the left hip, draws the short bayonet '
           'and brings it low to the right, point toward the victim.')
Meta('IjaThroatSlash', 4.0, False, 'track', role='ijaA', rig='LugouIja02', props=['weapon', 'bayonet'], rootMotion=False,
     stage='slashCut', weaponState='slungBack', holdLoop=[1.0, 4.0],
     contacts=[{'t': .24, 'limb': 'bayonet', 'action': 'cut', 'partnerRole': 'comrade', 'part': 'throat'},
               {'t': 0, 'limb': 'handL', 'action': 'hold', 'partnerRole': 'comrade', 'part': 'hairBack'}],
     events=[{'t': .24, 'kind': 'throatCut'}, {'t': 1.6, 'kind': 'hairShake', 'line': 'CaptiveTaunt.01'},
             {'t': 2.8, 'kind': 'hairShake', 'line': 'CaptiveTaunt.02'}],
     prev=['IjaDrawBayonet'], next=['IjaWipeSheathBayonet'],
     notes='No pause: a 0.1 s cock to the right and one hard right-to-left draw across the throat (blade at '
           'the throat 0.24 s). Keeps the hair and leans in to taunt; 1.0-4.0 s is a seamless hold loop '
           '(the director samples it in window until "日兵甲松手") with two hair shakes on the taunt lines.')
Meta('CaptiveThroatCut', 1.0, False, 'free', role='comrade', rig='LugouNra02', rootMotion=True, stage='slashCut',
     env={'wallBehindM': .49},
     contacts=[{'t': .24, 'by': 'ijaA', 'part': 'throat', 'action': 'cut'},
               {'t': .38, 'limb': 'handsLR', 'action': 'clutch', 'target': 'self.throat'},
               {'t': .52, 'limb': 'shoulderBack', 'action': 'slam', 'target': 'wall'}],
     events=[{'t': .24, 'kind': 'bloodSpray', 'at': 'throat'}, {'t': .30, 'kind': 'effort', 'what': 'chokedGurgle'}],
     prev=['CaptiveHeadPulledBack'], next=['CaptiveClutchThroat'],
     notes='The cut lands: a full-body jolt, both hands fly to the throat, the trunk slams back into the wall; '
           'the head stays where the fist holds it.')
Meta('CaptiveClutchThroat', 3.0, True, 'free', role='comrade', rig='LugouNra02', rootMotion=False, stage='slashTaunt',
     env={'wallBehindM': .49},
     events=[{'t': .30, 'kind': 'spasm'}, {'t': 1.2, 'kind': 'spasm'}, {'t': 2.2, 'kind': 'spasm'},
             {'t': .60, 'kind': 'hairShake'}, {'t': 1.80, 'kind': 'hairShake'}],
     prev=['CaptiveThroatCut'], next=['CaptiveWallSlideTwitch'],
     notes='Hands clamped on the throat, choking spasms, head held back by the fist and shaken twice per loop '
           '(in step with IjaThroatSlash hold window).')
Meta('CaptiveWallSlideTwitch', 3.2, False, 'free', role='comrade', rig='LugouNra02', rootMotion=True, stage='slashWipe',
     env={'wallBehindM': .49}, terminal=True,
     events=[{'t': 0.0, 'kind': 'released'}, {'t': 1.6, 'kind': 'twitch'}, {'t': 2.1, 'kind': 'twitch'},
             {'t': 2.5, 'kind': 'twitch'}, {'t': 3.2, 'kind': 'dead', 'fact': 'captivesKilled'}],
     prev=['CaptiveClutchThroat'], next=[],
     notes='Let go: the head drops, he slides down the wall onto his side-sit, one hand slips off the throat, '
           'the legs jerk three times and stop. Last frame is the corpse (hold it; replaces ShotCollapse).')
Meta('IjaWipeSheathBayonet', 2.4, False, 'track', role='ijaA', rig='LugouIja02', props=['weapon', 'bayonet'], rootMotion=False,
     stage='slashWipe', weaponState='slungBack',
     contacts=[{'t': .55, 'limb': 'bayonet', 'action': 'wipe', 'partnerRole': 'comrade', 'part': 'shoulderR'},
               {'t': .85, 'limb': 'bayonet', 'action': 'lift'},
               {'t': 1.50, 'limb': 'bayonet', 'action': 'sheathe', 'target': 'scabbard'},
               {'t': 2.30, 'limb': 'handR', 'action': 'grip', 'target': 'weapon', 'part': 'barrel'}],
     events=[{'t': 1.5, 'kind': 'bayonetSheathe', 'sound': 'bladeSheath'}],
     prev=['IjaThroatSlash'], next=['IjaReadyRifle'],
     notes='Stoops, drags the flat of the blade once across the dead man\'s shoulder, straightens, sheathes '
           'on the left hip, reaches over the right shoulder for the slung rifle.')
Meta('IjaReadyRifle', 1.1, False, 'track', role='ijaA', rig='LugouIja02', props=['weapon'], rootMotion=False,
     weaponState='slungBack->twoHand', endHold='twoHand',
     contacts=[{'t': 0, 'limb': 'handR', 'action': 'grip', 'target': 'weapon', 'part': 'barrel'},
               {'t': .55, 'limb': 'handL', 'action': 'grip', 'target': 'weapon', 'part': 'handguard'},
               {'t': .80, 'limb': 'handR', 'action': 'regrip', 'target': 'weapon', 'part': 'wrist'}],
     prev=['IjaWipeSheathBayonet'], next=['IjaBayonetGuard', 'GuardTurn', 'IjaSlingRifle'],
     notes='Pulls the rifle off the back over the right shoulder, left hand catches the handguard, right '
           'hand slides to the wrist of the stock; ends at low ready (native two-hand mount matches).')


def Knife(T, handle, axis, up=None):
    """Hand-held Type30 bayonet whose handle centre is `handle` and blade points along `axis`."""
    a = Vector(axis).normalized()
    u = Vector(up) if up is not None else Vector((0, 0, 1))
    u = u - a * u.dot(a)
    u = u.normalized() if u.length > 1e-6 else Vector((1, 0, 0))
    origin = Vector(handle) + a * T.R(WEAPONS['Bayonet']['handle'])
    return {'handle': tuple(handle), 'origin': tuple(origin), 'axis': tuple(a), 'up': tuple(u),
            'tip': tuple(origin + a * T.R(WEAPONS['Bayonet']['tip']))}


def KnifeTrack(knife, visible=True):
    return (knife['origin'], knife['axis'], knife['up'], visible)


def KnifeProps(knife):
    return [('cyl', knife['handle'], knife['tip'], .012)]


def ScabbardKnife(T):
    """Sheathed: handle just in front of the left hip, blade down and back (posed bones)."""
    f = BodyFrame(T.K)
    handle = f['pelvis'] + f['left'] * T.R(.13) - f['back'] * T.R(.12) + f['up'] * T.R(.04)
    axis = (-f['up'] * .94 + f['back'] * .34).normalized()
    return Knife(T, tuple(handle), tuple(axis), tuple(f['left']))


def HandKnife(T, axis, up=None):
    """In the right fist: handle centre at the runtime grip point."""
    return Knife(T, tuple(T.K['GripPoint']('R')), axis, up)


def KnifePalm(axis):
    """Right fist wrapped round a handle along `axis`, thumb toward the blade."""
    a = Vector(axis).normalized()
    ref = Vector((0, 0, 1)) if abs(a.z) < .9 else Vector((1, 0, 0))
    across = a.cross(ref).normalized()
    fingers = across
    normal = fingers.cross(a).normalized() * -1
    return tuple(fingers), tuple(normal)


def IjaABase(T):
    H, P, SX = T.H, T.P, T.SX
    f = Standing(T)
    f.update({'handRel.L': (.08, -.12, -.46), 'palmF.L': (0, -.2, -1), 'palmN.L': (-1, 0, 0), 'curl.L': .7,
              'handRel.R': (-.08, -.12, -.46), 'palmF.R': (0, -.2, -1), 'palmN.R': (1, 0, 0), 'curl.R': .7,
              'ankle.L': (H + .03, -.08, T.A), 'ankle.R': (-(H + .02), .10, T.A), 'foot.L': (0, 8, 0), 'foot.R': (0, -14, 0)})
    return f


def SlashVictimStart(T):
    return KneelWallBase(T)


def HeadPulledBackKeys(T):
    base = SlashVictimStart(T)
    h = base['head']
    rows = [
        (0.00, {}),
        (0.26, {'head': (h[0] + .06, h[1], h[2])}),
        # Yanked: head torn back, throat open, the chest lifts off the heels a little.
        (0.42, {'head': (-.34, .05, .10), 'neck': (-.06, 0, .04), 'bend': .16, 'shrug': .24, 'twist': -.26,
                'pelvis': Add3(base['pelvis'], (0, -.02, .05)),
                'handRel.R': (.10, -.26, .02), 'palmF.R': (.1, -.2, 1), 'palmN.R': (0, -1, .1), 'curl.R': .35,
                'handRel.L': (-.08, -.24, .00), 'palmF.L': (-.1, -.2, 1), 'palmN.L': (0, -1, .1), 'curl.L': .35}),
        (0.62, {'head': (-.30, .08, .08), 'shrug': .20}),
        (0.95, {'head': (-.35, .02, .12), 'handRel.R': (.13, -.30, .10), 'curl.R': .7}),
        (1.25, {'head': (-.31, .07, .09), 'handRel.L': (-.10, -.28, .06), 'curl.L': .6}),
        (1.55, {'head': (-.34, .04, .11), 'shrug': .23}),
        (1.80, {'head': (-.33, .05, .10)}),
    ]
    return Keys(base, rows, lag={'head': .04, 'neck': .03})


def R3Review(extra=None):
    return {'walls': R3_WALL, 'reviewViews': R3_VIEWS, 'reviewScale': 2.4}


@Builder('CaptiveHeadPulledBack')
def BuildHeadPulledBack(T, name):
    anim = HeadPulledBackKeys(T)
    spec = {'pose': lambda t: T.Nest(anim(t)), 'reviewProps': lambda t: [R3_WALL_BOX],
            'reviewFrames': lambda n: [0, int(n * .16), int(n * .24), n - 1]}
    spec.update(R3Review())
    return spec


def ThroatCutKeys(T):
    base = HeadPulledBackKeys(T)(1.8)
    throatR, throatL = (.14, -.14, .05), (-.14, -.14, .05)
    rows = [
        (0.00, {}),
        (0.24, {'shrug': base['shrug'] + .10, 'bend': base['bend'] - .06}),
        # Both hands to the throat.
        (0.36, {'handRel.R': throatR, 'palmF.R': (-.55, 0, .83), 'palmN.R': (0, .95, .2), 'curl.R': .65,
                'handRel.L': throatL, 'palmF.L': (.55, 0, .83), 'palmN.L': (0, .95, .2), 'curl.L': .65,
                'shrug': base['shrug'] + .16}),
        # Slammed back into the wall; the fist keeps the head.
        (0.52, {'pelvis': Add3(base['pelvis'], (.03, .04, -.01)), 'lean': base['lean'] + .08, 'bend': base['bend'] - .10,
                'twist': base['twist'] - .04}),
        (0.70, {'bend': base['bend'] + .10, 'shrug': base['shrug'] + .08}),
        (1.00, {'bend': base['bend'] + .02, 'shrug': base['shrug'] + .10}),
    ]
    return Keys(base, rows, lag={'handRel': .02})


@Builder('CaptiveThroatCut')
def BuildThroatCut(T, name):
    anim = ThroatCutKeys(T)
    spec = {'pose': lambda t: T.Nest(anim(t)), 'reviewProps': lambda t: [R3_WALL_BOX],
            'reviewFrames': lambda n: [0, int(n * .24), int(n * .36), int(n * .52), n - 1]}
    spec.update(R3Review())
    return spec


def Pulse(t, c, w):
    return math.exp(-((t - c) / w) ** 2)


def ClutchPose(T, t):
    f = ThroatCutKeys(T)(1.0)
    phase = Tau * t / 3.0
    spasm = Pulse(t, .30, .09) + .8 * Pulse(t, 1.20, .09) + .9 * Pulse(t, 2.20, .09)
    shake = Pulse(t, .60, .07) - Pulse(t, .72, .07) + Pulse(t, 1.80, .07) - Pulse(t, 1.92, .07)
    gasp = math.sin(4 * phase)
    f['bend'] += .10 * spasm + .015 * gasp
    f['shrug'] += .08 * spasm + .03 * gasp
    f['twist'] += .04 * spasm
    h = f['head']
    f['head'] = (h[0] + .04 * spasm, h[1] + .10 * shake, h[2] + .08 * shake)
    for s, sign in (('R', 1), ('L', -1)):
        r = f['handRel.' + s]
        f['handRel.' + s] = (r[0] + .01 * sign * spasm, r[1] - .01 * spasm, r[2] + .006 * gasp)
    p = f['pelvis']
    f['pelvis'] = (p[0], p[1], p[2] + .012 * spasm)
    return f


@Builder('CaptiveClutchThroat')
def BuildClutchThroat(T, name):
    spec = {'pose': lambda t: T.Nest(ClutchPose(T, t)),
            'reviewProps': lambda t: [R3_WALL_BOX]}
    spec.update(R3Review())
    return spec


def SlideKeys(T):
    base = ClutchPose(T, 0.0)
    ar, al = base['ankle.R'], base['ankle.L']
    seat = KneelFlat(T, 0.0, .02, sit=1.0)['pelvis']
    endPelvis = (seat[0] - .03, seat[1], seat[2])
    rows = [
        (0.00, {}),
        # The fist opens: the head drops forward, the neck follows.
        (0.18, {'head': (.10, .05, .05), 'neck': (0.0, 0, 0)}),
        (0.40, {'head': (.35, -.05, -.05), 'neck': (.18, 0, 0), 'bend': base['bend'] + .10}),
        # Down the wall: the seat slips off the heels to his right, the trunk sags that way.
        (1.10, {'pelvis': Add3(base['pelvis'], (-.02, .05, -.10)), 'lean': -.12, 'pelvisTilt': (-.10, -.10, -.06),
                'bend': .40}),
        (1.20, {'handRel.R': (.08, -.20, -.30), 'palmF.R': (0, -.5, -.9), 'palmN.R': (0, 0, -1), 'curl.R': .4}),
        (1.60, {'pelvis': endPelvis, 'lean': -.30, 'pelvisTilt': (.05, -.18, -.12), 'bend': .70, 'twist': -.08,
                'head': (.45, -.18, -.15)}),
        (1.64, {'ankle.R': ar}),
        (1.72, {'ankle.R': Add3(ar, (0, .02, .035)), 'shrug': base['shrug'] + .06}),        # twitch 1
        (1.84, {'ankle.R': ar, 'handRel.L': (-.12, -.18, .06)}),
        (2.10, {'ankle.L': al}),
        (2.18, {'ankle.L': Add3(al, (0, .02, .025)), 'bend': .74}),                          # twitch 2
        (2.30, {'ankle.L': al, 'bend': .70, 'handRel.L': (-.05, -.18, -.28), 'palmF.L': (0, -.5, -.9),
                'palmN.L': (0, 0, -1), 'curl.L': .45}),
        (2.50, {'ankle.R': ar}),
        (2.56, {'ankle.R': Add3(ar, (0, .01, .015))}),                                     # twitch 3, smaller
        (2.70, {'ankle.R': ar, 'head': (.50, -.20, -.16)}),
        (3.20, {'head': (.52, -.20, -.16), 'bend': .72, 'shrug': 0.0}),
    ]
    return Keys(base, rows, lag={'head': .08, 'neck': .05})


@Builder('CaptiveWallSlideTwitch')
def BuildWallSlide(T, name):
    anim = SlideKeys(T)
    spec = {'pose': lambda t: T.Nest(anim(t)), 'reviewProps': lambda t: [R3_WALL_BOX],
            'reviewFrames': lambda n: [0, int(n * .15), int(n * .35), int(n * .55), n - 1]}
    spec.update(R3Review())
    return spec


# ---- ijaA side ------------------------------------------------------------------------
def AReview(spec):
    spec['reviewViews'] = [('side', (-3.2, -.9, 1.0), (0, -.55, .70)), ('q', (-2.3, -3.2, 1.8), (0, -.5, .65)),
                           ('back', (1.6, 1.4, 1.5), (0, -.6, .6))]
    spec['reviewScale'] = 2.6
    return spec


@Builder('IjaHairGrabPull')
def BuildHairGrab(T, name):
    H, P = T.H, T.P
    base = IjaABase(T)
    anim = Tracks(base, {
        'ankle.L': [(0.0, base['ankle.L']), (.06, base['ankle.L']), (.13, Add3(base['ankle.L'], (0, -.07, .05))),
                    (.20, Add3(base['ankle.L'], (0, -.14, 0)))],
        'pelvis': [(0.0, base['pelvis']), (.20, Add3(base['pelvis'], (0, -.10, -.04))), (.30, Add3(base['pelvis'], (0, -.11, -.05))),
                   (.44, Add3(base['pelvis'], (0, -.03, -.03))), (1.0, Add3(base['pelvis'], (0, -.05, -.03)))],
        'bend': [(0.0, .08), (.28, .46), (.44, .34), (1.0, .38)],
        'pelvisTilt': [(0.0, (.03, 0, 0)), (.28, (.18, 0, 0)), (1.0, (.14, 0, 0))],
        'twist': [(0.0, 0.0), (.28, .12), (.44, -.05), (1.0, 0.0)],
        'head': [(0.0, (.10, 0, 0)), (.28, (.15, 0, 0)), (.44, (.10, 0, -.05)), (1.0, (.12, 0, 0))],
        'handRel.R': [(0.0, base['handRel.R']), (1.0, (-.04, -.16, -.42))],
    }, lag={'head': .05})
    spec = AttackerSpec(T, 'slashGrab', 'ijaA', 'comrade', {'L': [(.28, 1.0, 'crown', .03, (0, 1, -.3), 1.1)]}, anim, 1.0)
    props, review = SlungProps(T)
    spec.update({'props': props, 'plants': [('R', 0, 1.0), ('L', .20, 1.0)],
                 'reviewProps': lambda t: review(t) + spec['markers'](t),
                 'reviewFrames': lambda n: [0, int(n * .28), int(n * .44), n - 1]})
    return AReview(spec)


def DrawBase(T):
    """ijaA while holding the hair: planted in the half step of IjaHairGrabPull."""
    return HairHoldPose(T)


def HairHoldPose(T):
    base = IjaABase(T)
    base.update({'ankle.L': Add3(base['ankle.L'], (0, -.14, 0)), 'pelvis': Add3(base['pelvis'], (0, -.05, -.03)),
                 'bend': .38, 'pelvisTilt': (.12, 0, 0), 'head': (.12, 0, 0)})
    return base


@Builder('IjaDrawBayonet')
def BuildDrawBayonet(T, name):
    H, P = T.H, T.P
    base = HairHoldPose(T)
    pel = base['pelvis']
    scabbard = (pel[0] + T.R(.13), pel[1] - T.R(.12), pel[2] + T.R(.04))
    ready = (pel[0] - T.R(.26), pel[1] - T.R(.30), pel[2] + T.R(.18))
    drawAxis = Unit((-.20, -.35, .92))
    readyAxis = Unit((.25, -.95, .10))
    keys = [
        (0.00, {}),
        (0.10, {'twist': .03, 'bend': .42}),
        (0.50, {'twist': .02, 'bend': .38}),
        (0.80, {'twist': -.04, 'bend': .38}),
    ]
    body = Keys(dict(base, **{'handRel.R': base['handRel.R']}), keys, lag={'head': .05})
    path = [(0.0, (pel[0] - T.R(.20), pel[1] - T.R(.10), pel[2] - T.R(.08))), (.22, scabbard), (.28, scabbard),
            (.42, Add3(scabbard, (0, -T.R(.10), T.R(.24)))), (.60, Add3(ready, (T.R(.06), T.R(.06), T.R(.10)))), (.80, ready)]
    hand = Channel(path)
    axes = Channel([(0.0, drawAxis), (.28, drawAxis), (.42, Unit((-.40, -.55, .73))), (.60, readyAxis), (.80, readyAxis)])

    def BodyAt(t):
        f = body(t)
        if t >= .08:
            f['handRel.R'] = None
            f['grip.R'] = hand(t)
            f['armPole.R'] = (pel[0] - T.R(.55), pel[1] + T.R(.20), pel[2] + T.R(.05))
            if t >= .20:
                pf, pn = KnifePalm(Unit(axes(t)))
                f['palmF.R'], f['palmN.R'], f['curl.R'] = pf, pn, 1.1
        return f
    spec = AttackerSpec(T, 'slashDraw', 'ijaA', 'comrade', {'L': [(0.0, .8, 'crown', .03, (0, 1, -.3), 1.1)]}, BodyAt, .8)
    props, review = SlungProps(T)

    def Props(t):
        out = props(t)
        knife = ScabbardKnife(T) if t < .28 else HandKnife(T, axes(t))
        out['bayonet'] = KnifeTrack(knife)
        return out

    def Review(t):
        knife = ScabbardKnife(T) if t < .28 else HandKnife(T, axes(t))
        return review(t) + KnifeProps(knife) + spec['markers'](t)
    spec.update({'props': Props, 'plants': [('R', 0, .8), ('L', 0, .8)], 'reviewProps': Review,
                 'reviewFrames': lambda n: [0, int(n * .3), int(n * .55), n - 1]})
    return AReview(spec)


def SlashKnifePath(T):
    """Handle centre and blade axis through the cut, relative to the victim's throat
    (A-local, source metres). The blade's middle crosses the throat at 0.24 s."""
    mid = T.R(.057 + .20)
    cutAxis = Vector(Unit((.55, -.82, .05)))
    atCut = -cutAxis * mid + Vector((0, .02, 0))
    return [
        (0.00, (-T.R(.20), T.R(.34), -T.R(.12)), Unit((.25, -.95, .10))),
        (0.08, (-T.R(.30), T.R(.30), T.R(.00)), Unit((.40, -.88, .25))),      # cock
        (0.24, tuple(atCut), tuple(cutAxis)),                                # through the throat
        (0.36, (T.R(.12), T.R(.32), -T.R(.10)), Unit((.75, -.60, -.20))),     # follow-through
        (0.70, (-T.R(.05), T.R(.42), -T.R(.28)), Unit((.30, -.90, -.25))),
        (1.00, (-T.R(.12), T.R(.40), -T.R(.30)), Unit((.30, -.92, -.20))),
    ]


@Builder('IjaThroatSlash')
def BuildThroatSlash(T, name):
    base = HairHoldPose(T)
    pel = base['pelvis']
    path = SlashKnifePath(T)
    offs = Channel([(t, o) for t, o, _ in path])
    axes = Channel([(t, a) for t, a, _ in [(p[0], p[2], None) for p in path]])

    def Throat(t):
        hit = PartnerPoint(T, 'slashCut', 'ijaA', 'comrade', 'throat', min(t, 1.0))
        return hit[0] if hit else Vector((0, -T.R(.50), .75))

    def Taunt(t):
        """1.0-4.0: seamless hold loop. Leans in, two hair shakes on the taunt lines."""
        u = t - 1.0
        phase = Tau * u / 3.0
        shake = Pulse(u, .60, .07) - Pulse(u, .72, .07) + Pulse(u, 1.80, .07) - Pulse(u, 1.92, .07)
        breath = math.sin(2 * phase)
        return shake, breath

    body = Keys(base, [(0.0, {}), (.08, {'twist': .08, 'bend': .40}), (.24, {'twist': -.08, 'bend': .42}),
                       (.36, {'twist': -.12, 'bend': .40}), (.70, {'twist': -.05, 'bend': .40, 'head': (.15, 0, .05)}),
                       (1.0, {'twist': 0.0, 'bend': .40, 'head': (.15, 0, .05)})], lag={'head': .05})

    def BodyAt(t):
        f = body(min(t, 1.0))
        shake, breath = Taunt(t) if t > 1.0 else (0.0, 0.0)
        f['bend'] += .015 * breath + .04 * shake
        h = f['head']
        f['head'] = (h[0] - .06 * abs(shake), h[1], h[2] + .05 * math.sin(Tau * (t - 1.0) / 3.0) * (t > 1.0))
        f['handRel.R'] = None
        f['grip.R'] = tuple(Throat(t) + Vector(offs(min(t, 1.0))))
        f['armPole.R'] = (pel[0] - T.R(.55), pel[1] + T.R(.15), pel[2] + T.R(.10))
        pf, pn = KnifePalm(Unit(axes(min(t, 1.0))))
        f['palmF.R'], f['palmN.R'], f['curl.R'] = pf, pn, 1.1
        return f
    grips = {'L': [(0.0, 1.0, 'crown', .03, (0, 1, -.3), 1.1, 'slashCut'),
                   (1.0, 4.0, 'crown', .03, (0, 1, -.3), 1.1, 'slashTaunt')],
             'R': []}
    spec = AttackerSpec(T, 'slashCut', 'ijaA', 'comrade', grips, BodyAt, 4.0)
    props, review = SlungProps(T)

    def KnifeAt(t):
        return HandKnife(T, axes(min(t, 1.0)))

    def Props(t):
        out = props(t)
        out['bayonet'] = KnifeTrack(KnifeAt(t))
        return out

    def CutCheck(t):
        out = spec['check'](t)
        return out
    spec.update({'props': Props, 'plants': [('R', 0, 4.0), ('L', 0, 4.0)],
                 'reviewProps': lambda t: review(t) + KnifeProps(KnifeAt(t)) + spec['markers'](t)
                 + [('point', tuple(Throat(t)), None, .03)],
                 'bladeCheck': (.24, 'throat'),
                 'reviewFrames': lambda n: [0, int(n * .02), int(n * .06), int(n * .09), int(n * .25), n - 1]})
    return AReview(spec)


@Builder('IjaWipeSheathBayonet')
def BuildWipeSheath(T, name):
    base = HairHoldPose(T)
    pel = base['pelvis']
    P = T.P

    def Shoulder():
        hit = PartnerPoint(T, 'slashWipe', 'ijaA', 'comrade', 'shoulderR', 0.0)
        return (hit[0] + hit[1] * T.R(.02)) if hit else Vector((0, -T.R(.6), .6))
    sh = Shoulder()
    wipeAxis = Unit((.10, -.60, -.80))
    mid = T.R(.057 + .18)
    startH = tuple(sh - Vector(wipeAxis) * mid + Vector((0, -T.R(.03), 0)))
    endH = tuple(sh - Vector(wipeAxis) * mid + Vector((0, T.R(.13), T.R(.03))))
    scabbard = (pel[0] + T.R(.13), pel[1] - T.R(.12), pel[2] + T.R(.04))
    sheathAxis = Unit((.0, .34, -.94))
    shoulderR = (pel[0] - T.R(.20), pel[1] + T.R(.02), P + T.R(.55))
    handPath = Channel([(0.0, (pel[0] - T.R(.12), pel[1] - T.R(.35), pel[2] - T.R(.10))), (.55, startH), (.85, endH),
                        (1.20, (pel[0] - T.R(.05), pel[1] - T.R(.20), pel[2] + T.R(.10))),
                        (1.50, Add3(scabbard, (0, 0, T.R(.20)))), (1.62, scabbard), (1.85, (pel[0] - T.R(.10), pel[1] - T.R(.10), pel[2] + T.R(.15))),
                        (2.30, shoulderR), (2.40, shoulderR)])
    axes = Channel([(0.0, Unit((.30, -.92, -.20))), (.55, wipeAxis), (.85, wipeAxis), (1.20, Unit((.2, -.5, -.8))),
                    (1.50, sheathAxis), (2.40, sheathAxis)])
    # The victim's right shoulder is on his left: the hips shift onto the left foot and the
    # trunk turns into the wipe so the right hand draws the blade across it within reach.
    body = Keys(base, [(0.0, {}), (.55, {'bend': .62, 'pelvis': Add3(pel, (.14, -.04, -T.R(.22))), 'head': (.40, 0, .15), 'twist': .32}),
                       (.85, {'bend': .58, 'twist': .30, 'pelvis': Add3(pel, (.14, -.02, -T.R(.20)))}), (1.30, {'bend': .20, 'twist': .08, 'pelvis': Add3(pel, (0, .02, -.03)), 'head': (.10, 0, .05)}),
                       (1.62, {'twist': .26, 'bend': .26}), (2.40, {'twist': -.05, 'bend': .12, 'head': (.05, 0, -.10)})], lag={'head': .05})

    def BodyAt(t):
        f = body(t)
        f['handRel.R'] = None
        f['grip.R'] = handPath(t)
        f['armPole.R'] = (pel[0] - T.R(.55), pel[1] + T.R(.20), pel[2] + T.R(.05))
        if t < 1.62:
            pf, pn = KnifePalm(Unit(axes(t)))
            f['palmF.R'], f['palmN.R'], f['curl.R'] = pf, pn, 1.1
        else:
            f['palmF.R'], f['palmN.R'], f['curl.R'] = (0, .3, 1), (1, 0, 0), .8
        return f
    spec = AttackerSpec(T, 'slashWipe', 'ijaA', 'comrade', {}, BodyAt, 2.4)
    props, review = SlungProps(T)

    def KnifeAt(t):
        return HandKnife(T, axes(t)) if t < 1.62 else ScabbardKnife(T)

    def Props(t):
        out = props(t)
        out['bayonet'] = KnifeTrack(KnifeAt(t))
        return out
    spec.update({'props': Props, 'plants': [('R', 0, 2.4), ('L', 0, 2.4)],
                 # The blade on the shoulder: where the fist must be while it wipes (0.55-0.85 s).
                 'check': lambda t: {'R': handPath(t)} if .55 <= t <= .85 else {},
                 'reviewProps': lambda t: review(t) + KnifeProps(KnifeAt(t)) + PartnerGhost(T, 'slashWipe', 'ijaA', 'comrade', t)
                 + [('point', tuple(sh), None, .03)],
                 'reviewFrames': lambda n: [0, int(n * .23), int(n * .35), int(n * .66), n - 1]})
    return AReview(spec)


def w_butt(T):
    return WEAPONS[T.gun]['butt']


def LowReady(T):
    """IJA low ready: rifle across the body, muzzle forward-down (IjaBayonetGuard family)."""
    H, P = T.H, T.P
    return T.Rifle((-(H + .02), -.13, P + .22), Unit((.16, -.90, -.40)))


@Builder('IjaReadyRifle')
def BuildReadyRifle(T, name):
    H, P, SX, SZ = T.H, T.P, T.SX, T.SZ
    base = HairHoldPose(T)
    base.update({'bend': .12, 'head': (.05, 0, -.10), 'twist': -.05})
    slung = T.Rifle((.107, .20, P + .16), Unit((-.37, .05, .93)))
    lifted = T.Rifle((-.20, .15, P + .25), Unit((-.20, -.35, .91)))
    swung = T.Rifle((-.20, -.30, P + .22), Unit((.22, -.82, .52)))
    alongKeys = Channel([(0.0, .92), (.32, .70), (.58, .45), (.80, w_butt(T)), (1.1, w_butt(T))])
    ready = LowReady(T)
    rifles = [(0.0, slung), (.32, lifted), (.58, swung), (.85, ready), (1.1, ready)]

    def RifleAt(t):
        for (t0, a), (t1, b) in zip(rifles, rifles[1:]):
            if t <= t1:
                w = Smooth((t - t0) / max(1e-6, t1 - t0))
                return T.Rifle(Lerp3(a['origin'], b['origin'], w), Unit(Lerp3(a['axis'], b['axis'], w)))
        return ready
    w = WEAPONS[T.gun]
    body = Keys(base, [(0.0, {}), (.32, {'twist': -.18, 'bend': .08, 'head': (.0, 0, -.2)}), (.58, {'twist': .05, 'bend': .14}),
                       (1.1, {'twist': 0.0, 'bend': .12, 'head': (.12, 0, 0)})], lag={'head': .05})

    def Pose(t):
        f = body(t)
        rifle = RifleAt(t)
        palms = T.Palms(rifle['axis'])
        along = alongKeys(t)
        f['grip.R'] = T.Along(rifle, along)
        f['palmF.R'], f['palmN.R'], f['curl.R'] = palms['R'][0], palms['R'][1], .95
        f['armPole.R'] = (-(SX + .50), .20, P + .25)
        f['handRel.R'] = None
        if t >= .50:
            f['grip.L'] = rifle['gripL']
            f['gripW.L'] = Smooth((t - .50) / .08)
            f['palmF.L'], f['palmN.L'], f['curl.L'] = palms['L'][0], palms['L'][1], .85
        return T.Nest(f)

    def Props(t):
        if t < .03:
            rifle, up = SlungRifle(T)
            return {'weapon': (rifle['origin'], rifle['axis'], up, True)}
        return {'weapon': T.Track(RifleAt(t))}
    spec = {'pose': Pose, 'props': Props, 'plants': [('R', 0, 1.1), ('L', 0, 1.1)],
            'check': lambda t: {'R': T.Along(RifleAt(t), alongKeys(t)),
                                'L': RifleAt(t)['gripL'] if t >= .58 else None},
            'reviewProps': lambda t: T.RifleProps(RifleAt(t)),
            'reviewFrames': lambda n: [0, int(n * .3), int(n * .53), int(n * .77), n - 1]}
    return AReview(spec)


# =================================================================================
# 01: front pass (ijaC corner fire, ijaD junction peek) and Shunzi found (ijaA).
# Shunzi is the first-person player: his body points are authored here as a track the
# Opening director follows with the camera and the first-person arms (`player` in the
# clip metadata, runtime metres in the actor frame, sampled every 1/12 s).
# =================================================================================
PROPS.update({
    'bayonet': {'model': 'BayonetType30', 'mesh': 'Model_BayonetType38.tzm.json',
                'grip': 'handle centre 0.062 m behind the socket ring (model +Z), blade along model -Z',
                'scabbard': 'left hip: pelvis + left 0.13 + forward 0.12 + up 0.04 (runtime metres), blade down-back',
                'owner': 'ijaA', 'rifleBayonet': False,
                'notes': 'ijaA carries his bayonet in the scabbard (roster must spawn his Type38 with bayonet:false); '
                         'the prop track `bayonet` places it for every clip that touches it.'},
    'beam': {'model': 'procedural', 'lengthM': 1.55, 'widthM': .13, 'heightM': .12, 'splinterM': .22,
             'material': 'WoodBeam',
             'states': {'pinned': 'across the pack of the prone player at the dugout mouth',
                        'nudged': 'BayonetClearWood 0.9 s: rotated 12 deg about its far end',
                        'kicked': 'IjaKickBeam 0.45 s: the `beam` track, rests 0.55 m further out'},
             'collision': 'Space package (static collider per state; the kicked state frees the player)'},
    'comradeRifle': {'model': 'HanYang (actor weapon)', 'track': 'weapon',
                     'notes': 'WoundedSitRifleIdle/Banter*/WoundedRiseWall hold it through the `weapon` track; '
                              'BlastSlamBuried throws it forward-right; last track frame = where it lies.'},
})

def SlungSideNominal(T):
    """Where SlungRifle(T, 'side') puts the rifle on an upright stance (for key blending)."""
    return T.Rifle((-.24, .06, T.P + .02), Unit((0, .12, .97)))


Meta('IjaCornerFire', 2.6, True, 'track', role='ijaC', rig='LugouIja01', props=['weapon'], rootMotion=False,
     events=[{'t': .10, 'kind': 'fire', 'weapon': 'Type38'}, {'t': .70, 'kind': 'boltUp'}, {'t': .82, 'kind': 'boltBack'},
             {'t': .98, 'kind': 'boltForward'}],
     notes='At the trench corner: bladed stance, cheek on the stock, one shot, recoil, bolt cycled with the right '
           'hand while the butt stays in the shoulder, back on aim and breathing. Muzzle along actor -Z, 4 deg up.')
Meta('IjaJunctionPeek', 3.2, True, 'track', role='ijaD', rig='LugouIja02', props=['weapon'], rootMotion=False,
     env={'wallRightM': .32},
     notes='Right shoulder on the junction wall, rifle at high port; leans out to the right past the corner, '
           'scans, leans back and waits. The wall edge is 0.30 m to his right, its corner 0.25 m ahead.')
Meta('IjaSlingRifle', .8, False, 'track', role='ijaA', rig='LugouIja02', props=['weapon'], rootMotion=False,
     weaponState='twoHand->slungRight', endHold='slungRight',
     prev=['IjaReadyRifle', 'IjaBayonetGuard'], next=['IjaCollarDragSnag', 'CollarDrag'],
     notes='"把步枪甩到身侧": swings the rifle up and back onto the right shoulder by the sling, lets go, '
           'hands free and stooping for the collar.')
Meta('IjaCollarDragSnag', 2.2, False, 'track', role='ijaA', rig='LugouIja02', props=['weapon'], rootMotion=False,
     weaponState='slungRight', player=True,
     contacts=[{'t': .25, 'limb': 'handL', 'action': 'grab', 'partnerRole': 'shunzi', 'part': 'collarBack'}],
     events=[{'t': .95, 'kind': 'packSnagged', 'target': 'beam'}, {'t': 1.12, 'kind': 'yank'}, {'t': 1.42, 'kind': 'yank'}],
     prev=['IjaSlingRifle'], next=['IjaKickBeam'],
     notes='Hooks the back of the collar, backs off two steps hauling; the pack snags on the beam at 0.95 s: '
           'a dead stop that jerks him forward, two yanks, a look back at what holds.')
Meta('IjaKickBeam', 1.2, False, 'track', role='ijaA', rig='LugouIja02', props=['weapon', 'beam'], rootMotion=False,
     weaponState='slungRight', player=True,
     contacts=[{'t': 0, 'limb': 'handL', 'action': 'hold', 'partnerRole': 'shunzi', 'part': 'collarBack'},
               {'t': .45, 'limb': 'footR', 'action': 'kick', 'target': 'beam'}],
     events=[{'t': .45, 'kind': 'beamKicked'}],
     prev=['IjaCollarDragSnag'], next=['CollarDrag'],
     notes='Keeps the collar in his left fist, stamps the loose beam off the pack with the right sole; the '
           '`beam` track carries it clear (rests at 0.9 s).')
Meta('IjaButtStrike', 1.0, False, 'track', role='ijaA', rig='LugouIja02', props=['weapon'], rootMotion=False,
     weaponState='slungRight->twoHand', endHold='twoHand', player=True,
     contacts=[{'t': .42, 'limb': 'butt', 'action': 'strike', 'partnerRole': 'shunzi', 'part': 'head'}],
     events=[{'t': .42, 'kind': 'buttHit', 'fact': 'playerStruck'}],
     prev=['CollarDrag'], next=['IjaBayonetGuard', 'IjaHoldCollarUp'],
     notes='No warning: the rifle comes off the shoulder into both hands and the butt is driven straight down onto '
           'the head of the man propping himself up (0.42 s), then back to low ready.')


def AimRifle(T, pitchDeg=4.0, yawDeg=0.0, recoil=0.0):
    """Shouldered Type38: butt in the right shoulder pocket, muzzle along -Y."""
    SX, SZ = T.SX, T.SZ
    p, y = math.radians(pitchDeg), math.radians(yawDeg)
    axis = Vector((math.sin(y) * math.cos(p), -math.cos(y) * math.cos(p), math.sin(p)))
    butt = Vector((-(SX - .05), -.10 + recoil * T.R(.035), SZ - .05))
    return T.RifleFromButt(tuple(butt), tuple(axis))


def AimStance(T):
    H, P = T.H, T.P
    f = Standing(T)
    f.update({'ankle.L': (H + .02, -.16, T.A), 'ankle.R': (-(H + .04), .14, T.A), 'foot.L': (0, 10, 0), 'foot.R': (0, -35, 0),
              'pelvis': (0, .0, P - .06), 'pelvisTilt': (.06, 0, -.45), 'twist': -.12, 'bend': .10,
              'head': (.12, -.14, .42), 'neck': (.06, -.05, .20)})
    return f


@Builder('IjaCornerFire')
def BuildCornerFire(T, name):
    base = AimStance(T)
    w = WEAPONS[T.gun]
    recoil = Channel([(0.0, 0.0), (.10, 0.0), (.13, 1.0), (.22, .45), (.35, 0.0), (2.6, 0.0)])
    pitch = Channel([(0.0, 4.0), (.10, 4.0), (.14, 10.0), (.30, 5.0), (.55, 4.0), (.75, 1.0), (1.10, 0.5), (1.40, 4.0), (2.6, 4.0)])
    # Bolt: fist leaves the wrist of the stock, lifts, draws, drives home, turns down.
    boltW = Channel([(0.0, 0.0), (.55, 0.0), (.68, 1.0), (1.12, 1.0), (1.30, 0.0), (2.6, 0.0)])
    boltPath = Channel([(0.0, (0, 0, 0)), (.68, (0, 0, 0)), (.78, (0, 0, .03)), (.90, (0, .09, .03)), (1.00, (0, 0, .03)),
                        (1.10, (0, 0, 0)), (2.6, (0, 0, 0))])

    def RifleAt(t):
        return AimRifle(T, pitch(t), 0.0, recoil(t))

    def Pose(t):
        f = dict(base)
        phase = Tau * t / 2.6
        breath = math.sin(phase)
        k = recoil(t)
        f['bend'] += .005 * breath - .05 * k
        f['twist'] += .01 * breath
        p = f['pelvis']
        f['pelvis'] = (p[0], p[1] + .02 * k, p[2])
        h = f['head']
        f['head'] = (h[0] - .06 * k, h[1], h[2])
        rifle = RifleAt(t)
        palms = T.Palms(rifle['axis'])
        a, o = Vector(rifle['axis']), Vector(rifle['origin'])
        side = a.cross(Vector((0, 0, 1))).normalized()          # rifle's right side
        bolt = o + a * T.R(.07) + side * T.R(.05) + Vector((0, 0, T.R(.03)))
        b = boltW(t)
        grip = o.lerp(bolt + Vector(boltPath(t)) * (1 / T.s) * .9, b)
        f['grip.R'] = tuple(grip)
        f['grip.L'] = rifle['gripL']
        f['palmF.R'], f['palmN.R'], f['curl.R'] = palms['R'][0], palms['R'][1], Mix(.95, .55, b)
        f['palmF.L'], f['palmN.L'], f['curl.L'] = palms['L'][0], palms['L'][1], .85
        f['armPole.R'] = (-(T.SX + .45), .10, T.SZ - .35)
        f['armPole.L'] = (T.SX + .30, -.40, T.SZ - .60)
        return T.Nest(f)
    spec = {'pose': Pose, 'props': lambda t: {'weapon': T.Track(RifleAt(t))},
            'check': lambda t: {'L': RifleAt(t)['gripL']},
            'plants': [('L', 0, 2.6), ('R', 0, 2.6)], 'reviewProps': lambda t: T.RifleProps(RifleAt(t)),
            'reviewFrames': lambda n: [0, int(n * .05), int(n * .31), int(n * .36), int(n * .6)]}
    return AReview(spec)


@Builder('IjaJunctionPeek')
def BuildJunctionPeek(T, name):
    H, P, SX, SZ = T.H, T.P, T.SX, T.SZ
    base = Standing(T)
    base.update({'ankle.L': (H + .03, -.04, T.A), 'ankle.R': (-(H + .03), .06, T.A), 'foot.L': (0, 5, 0), 'foot.R': (0, -12, 0),
                 'pelvis': (-.03, .02, P - .08), 'bend': .16, 'lean': -.04, 'twist': -.05})
    port = T.Rifle((-(H + .02), -.18, P + .22), Unit((.30, -.35, .89)))
    peek = T.Rifle((-(H + .08), -.26, P + .26), Unit((-.05, -.80, .60)))
    # Leaning out: the hips come forward over the front foot so the head and shoulder pass the
    # corner before they go right (nothing crosses into the wall behind the corner).
    keys = [(0.0, {}), (.60, {}), (1.10, {'pelvis': (-.02, -.13, P - .12), 'lean': -.12, 'twist': -.30, 'bend': .40,
                                           'head': (.06, -.15, -.35), 'neck': (0, -.05, -.10)}),
            (1.45, {'head': (.04, -.15, -.20)}), (1.75, {'head': (.06, -.14, -.42)}),
            (2.40, {'pelvis': (-.03, .02, P - .08), 'lean': -.04, 'twist': -.05, 'bend': .16, 'head': (0, 0, 0), 'neck': (0, 0, 0)}),
            (3.20, {})]
    body = Anim(base, keys, {'head': .06}, periodic=True)
    out = Channel([(0.0, 0.0), (.60, 0.0), (1.10, 1.0), (1.90, 1.0), (2.40, 0.0), (3.2, 0.0)])

    def RifleAt(t):
        w = out(t)
        return T.Rifle(Lerp3(port['origin'], peek['origin'], w), Unit(Lerp3(port['axis'], peek['axis'], w)))

    def Pose(t):
        f = body(t)
        phase = Tau * t / 3.2
        f['shrug'] += .02 * math.sin(2 * phase)
        rifle = RifleAt(t)
        palms = T.Palms(rifle['axis'])
        f['grip.R'], f['grip.L'] = rifle['gripR'], rifle['gripL']
        f['palmF.R'], f['palmN.R'], f['curl.R'] = palms['R'][0], palms['R'][1], .95
        f['palmF.L'], f['palmN.L'], f['curl.L'] = palms['L'][0], palms['L'][1], .85
        # Right elbow tucked down along the wall (not flared into it).
        f['armPole.R'] = (-(SX + .06), .40, P - .10)
        f['armPole.L'] = (SX + .30, -.30, P - .10)
        return T.Nest(f)
    spec = {'pose': Pose, 'props': lambda t: {'weapon': T.Track(RifleAt(t))}, 'plants': [('L', 0, 3.2), ('R', 0, 3.2)],
            # The junction wall runs back from its corner at y = -0.15 (the review box).
            'walls': [((-.34, 0, 0), (1, 0, 0), (0, -.15, 0), (0, 1, 0))],
            'reviewProps': lambda t: T.RifleProps(RifleAt(t)) + [('box', (-.33, .30, .8), (.06, .9, 1.6), 0)],
            'reviewFrames': lambda n: [0, int(n * .34), int(n * .5), int(n * .75)]}
    return AReview(spec)


@Builder('IjaSlingRifle')
def BuildSlingRifle(T, name):
    H, P, SX, SZ = T.H, T.P, T.SX, T.SZ
    base = HairHoldPose(T)
    base.update({'bend': .12, 'head': (.10, 0, 0), 'ankle.L': IjaABase(T)['ankle.L'], 'pelvis': IjaABase(T)['pelvis']})
    ready = LowReady(T)
    lifted = T.Rifle((-(SX + .06), -.10, P + .32), Unit((-.05, -.25, .97)))
    w = WEAPONS[T.gun]
    hung = SlungSideNominal(T)

    def RifleAt(t):
        if t <= .30:
            u = Smooth(t / .30)
            return T.Rifle(Lerp3(ready['origin'], lifted['origin'], u), Unit(Lerp3(ready['axis'], lifted['axis'], u)))
        if t <= .50:
            u = Smooth((t - .30) / .20)
            return T.Rifle(Lerp3(lifted['origin'], hung['origin'], u), Unit(Lerp3(lifted['axis'], hung['axis'], u)))
        return None

    body = Keys(base, [(0.0, {}), (.30, {'twist': -.12, 'bend': .08}), (.50, {'twist': -.05}),
                       (.80, {'twist': 0.0, 'bend': .42, 'pelvis': Add3(base['pelvis'], (0, -.03, -.08)), 'head': (.35, 0, 0)})],
                lag={'head': .05})

    def Pose(t):
        f = body(t)
        rifle = RifleAt(t)
        if rifle:
            palms = T.Palms(rifle['axis'])
            f['grip.R'] = T.Along(rifle, Mix(w['butt'], .55, Smooth(t / .30)))
            f['gripW.R'] = 1.0 if t <= .40 else 1 - Smooth((t - .40) / .10)
            f['palmF.R'], f['palmN.R'], f['curl.R'] = palms['R'][0], palms['R'][1], .95
            f['armPole.R'] = (-(SX + .45), .15, P + .15)
            f['handRel.R'] = None
            if t < .18:
                f['grip.L'] = rifle['gripL']
                f['gripW.L'] = 1 - Smooth(t / .18)
                f['palmF.L'], f['palmN.L'], f['curl.L'] = palms['L'][0], palms['L'][1], .85
        return T.Nest(f)

    def Props(t):
        rifle = RifleAt(t)
        if rifle:
            return {'weapon': T.Track(rifle)}
        slung, up = SlungRifle(T, 'side')
        return {'weapon': (slung['origin'], slung['axis'], up, True)}
    spec = {'pose': Pose, 'props': Props, 'plants': [('L', 0, .8), ('R', 0, .8)],
            'reviewProps': lambda t: T.RifleProps(RifleAt(t) or SlungRifle(T, 'side')[0]),
            'reviewFrames': lambda n: [0, int(n * .4), n - 1]}
    return AReview(spec)


def PlayerCollarPath(T):
    """Shunzi's back collar in ijaA's frame (source metres): prone under the beam, hauled 0.33 m, snagged."""
    return Channel([(0.0, (-.02, -.62, .22)), (.25, (-.02, -.62, .22)), (.40, (-.02, -.57, .30)),
                    (.95, (-.02, -.32, .38)), (1.00, (-.02, -.31, .38)), (1.12, (-.02, -.29, .40)),
                    (1.25, (-.02, -.31, .38)), (1.42, (-.02, -.29, .40)), (1.55, (-.02, -.31, .38)), (2.2, (-.02, -.31, .38))])


@Builder('IjaCollarDragSnag')
def BuildCollarDragSnag(T, name):
    H, P, SX = T.H, T.P, T.SX
    collar = PlayerCollarPath(T)
    base = IjaABase(T)

    def PelvisXY(t):
        c = collar(t)
        return (c[0] + .04, c[1] + .58)
    schedule = [('R', .40, .62), ('L', .66, .90)]
    stance = {'L': (H + .06, -.22, T.A), 'R': (-(H + .04), .10, T.A)}
    feet, plants = FollowSteps(PelvisXY, stance, schedule, 2.2)
    times = [0.0, .25, .40, .66, .95, 1.00, 1.12, 1.25, 1.42, 1.55, 2.2]
    lurch = Channel([(0.0, 0.0), (.95, 0.0), (1.00, 1.0), (1.10, .2), (1.12, .8), (1.25, .1), (1.42, .8), (1.55, 0.0), (2.2, 0.0)])
    crouch = Channel([(0.0, .34), (.25, .38), (.40, .34), (.95, .28), (2.2, .28)])
    pelvis = [(t, (PelvisXY(t)[0], PelvisXY(t)[1] - .05 * lurch(t), P - crouch(t) + .02 * lurch(t))) for t in times]
    body = Tracks(base, dict(feet, pelvis=pelvis,
                             bend=[(0.0, .80), (.25, .88), (.40, .82), (.95, .72), (1.00, .85), (1.55, .75), (2.2, .72)],
                             pelvisTilt=[(0.0, (.25, 0, 0)), (.40, (.22, 0, 0)), (.95, (.18, 0, 0)), (1.0, (.28, 0, 0)), (2.2, (.20, 0, 0))],
                             head=[(0.0, (.30, 0, 0)), (.95, (.20, 0, 0)), (1.05, (.35, 0, 0)), (1.60, (.05, .10, -.60)),
                                   (1.95, (.05, .10, -.70)), (2.2, (.10, .05, -.55))],
                             twist=[(0.0, 0.0), (1.6, -.20), (2.2, -.18)]),
                  lag={'head': .06})

    def Body(t):
        f = body(t)
        return f
    grips = {'L': []}
    spec = PlayerGripSpec(T, Body, {'L': [(.25, 2.2, collar, (0, 0, -1), 1.1)]})
    props, review = SlungProps(T, 'side')
    spec.update({'props': props, 'plants': plants,
                 'reviewProps': lambda t: review(t) + [('point', collar(t), None, .04)] + PlayerGhost(T, collar(t)),
                 'reviewFrames': lambda n: [0, int(n * .12), int(n * .43), int(n * .5), int(n * .8), n - 1]})
    spec['player'] = lambda t: {'collar': collar(t)}
    return AReview(spec)


def PlayerGripSpec(T, body, grips):
    """Hands on the first-person player's body points (channels of source-space points)."""
    def Pose(t):
        f = body(t)
        for side, rows in grips.items():
            for t0, t1, path, down, curl in rows:
                if t0 - .18 <= t <= t1 + .18:
                    point = Vector(path(Clamp(t, t0, t1)))
                    w = 1.0 if t0 <= t <= t1 else Smooth(1 - (t0 - t) / .18) if t < t0 else Smooth(1 - (t - t1) / .18)
                    palmF, palmN, _ = Grab((0, .6, .8), down)
                    f['grip.' + side], f['gripW.' + side] = tuple(point), w
                    f['palmF.' + side], f['palmN.' + side] = palmF, palmN
                    f['curl.' + side] = curl
                    f['handRel.' + side] = f.get('handRel.' + side) or (.06 if side == 'L' else -.06, -.14, -.45)
                    break
        return T.Nest(f)

    def Check(t):
        out = {}
        for side, rows in grips.items():
            for t0, t1, path, _, _ in rows:
                if t0 <= t <= t1:
                    out[side] = path(t)
        return out
    return {'pose': Pose, 'check': Check}


def PlayerGhost(T, collar, lying=True):
    """Rough stick body of the prone player for the review stills."""
    c = Vector(collar)
    head = c + Vector((0, -.10, .06))
    hips = c + Vector((0, .55, -.08))
    feet = hips + Vector((0, .80, -.05))
    return [('cyl', tuple(head), tuple(hips), .06), ('cyl', tuple(hips), tuple(feet), .05), ('point', tuple(head), None, .10)]


BEAM_PINNED = ((-.30, -.74, .20), (1, .12, .05))     # centre, axis (source, ijaA frame at IjaKickBeam)


@Builder('IjaKickBeam')
def BuildKickBeam(T, name):
    H, P, SX = T.H, T.P, T.SX
    collar = PlayerCollarPath(T)
    hold = collar(2.2)
    base = IjaABase(T)
    stand = {'L': (hold[0] + .04 + H + .06, hold[1] + .58 - .22, T.A), 'R': (hold[0] + .04 - H - .04, hold[1] + .58 + .10, T.A)}
    pel = (hold[0] + .04, hold[1] + .58, P - .28)
    strike = (BEAM_PINNED[0][0] + .02, BEAM_PINNED[0][1] + .10, BEAM_PINNED[0][2] + .02)
    body = Tracks(base, {
        # The left fist stays on the collar through the kick: the wind-up loads the left leg and
        # rolls the hips open rather than pulling the body back off the held man.
        'pelvis': [(0.0, pel), (.30, Add3(pel, (.03, .0, .015))), (.45, Add3(pel, (-.02, -.05, -.01))), (.70, Add3(pel, (0, .01, 0))),
                   (1.2, pel)],
        'ankle.L': [(0.0, stand['L'])],
        'ankle.R': [(0.0, stand['R']), (.15, stand['R']), (.32, (stand['R'][0] + .06, stand['R'][1] - .30, .36)),
                    (.45, strike), (.60, (strike[0] + .08, strike[1] + .25, .30)), (.85, stand['R']), (1.2, stand['R'])],
        'legPole.R': [(0.0, (-(H + .20), -.95, .45)), (.20, (-(H + .30), -1.1, 1.2)), (.60, (-(H + .30), -1.1, 1.2)), (.90, (-(H + .20), -.95, .45))],
        'foot.R': [(0.0, (0, -14, 0)), (.30, (-25, -60, 0)), (.45, (-15, -80, 0)), (.70, (-10, -40, 0)), (.90, (0, -14, 0))],
        'bend': [(0.0, .72), (.30, .70), (.45, .78), (.70, .72), (1.2, .72)],
        'pelvisTilt': [(0.0, (.20, 0, 0)), (.30, (.14, -.08, -.12)), (.45, (.20, -.10, -.18)), (.80, (.20, 0, 0))],
        'head': [(0.0, (.10, .05, -.50)), (.35, (.40, 0, -.25)), (.60, (.35, 0, -.15)), (1.2, (.30, 0, 0))],
    }, lag={'head': .05})
    spec = PlayerGripSpec(T, body, {'L': [(0.0, 1.2, lambda t: hold, (0, 0, -1), 1.1)]})
    props, review = SlungProps(T, 'side')

    def Beam(t):
        c, a = Vector(BEAM_PINNED[0]), Vector(BEAM_PINNED[1]).normalized()
        u = Smooth((t - .45) / .45) if t > .45 else 0.0
        c = c + Vector((-.28, -.42, 0)) * u + Vector((0, 0, .10 * math.sin(math.pi * Clamp((t - .45) / .45))))
        a = Quaternion((0, 0, 1), .9 * u) @ a
        return c, a

    def Props(t):
        out = props(t)
        c, a = Beam(t)
        out['beam'] = (tuple(c), tuple(a), (0, 0, 1), True)
        return out

    def Review(t):
        c, a = Beam(t)
        half = a * T.R(.775)
        return review(t) + [('cyl', tuple(c - half), tuple(c + half), .06), ('point', hold, None, .04)] + PlayerGhost(T, hold)
    spec.update({'props': Props, 'plants': [('L', 0, 1.2), ('R', .85, 1.2)], 'reviewProps': Review,
                 'reviewFrames': lambda n: [0, int(n * .27), int(n * .375), int(n * .55), n - 1]})
    spec['player'] = lambda t: {'collar': hold}
    return AReview(spec)


def PlayerHeadPath():
    """Shunzi propping himself up at the trench edge, then struck (source metres, ijaA frame)."""
    return Channel([(0.0, (0, -.64, .30)), (.30, (0, -.63, .42)), (.42, (0, -.62, .44)), (.50, (.02, -.64, .30)),
                    (1.0, (.03, -.66, .22))])


@Builder('IjaButtStrike')
def BuildButtStrike(T, name):
    H, P, SX, SZ = T.H, T.P, T.SX, T.SZ
    base = IjaABase(T)
    head = PlayerHeadPath()
    w = WEAPONS[T.gun]
    ready = LowReady(T)
    hit = Vector(head(.42)) + Vector((0, .02, T.R(.07)))
    downAxis = Vector(Unit((0, .38, .92)))          # muzzle up and back toward him: the butt is the low end          # muzzle up-forward, butt driven down onto the head
    rifles = [(0.0, SlungSideNominal(T)), (.12, T.Rifle((-(SX + .08), -.20, P + .30), Unit((-.05, -.30, .95)))),
              (.30, T.RifleFromButt(tuple(hit + Vector((0, .10, T.R(.34)))), tuple(downAxis))),
              (.42, T.RifleFromButt(tuple(hit), tuple(downAxis))),
              (.58, T.RifleFromButt(tuple(hit + Vector((0, .04, T.R(.12)))), tuple(downAxis))),
              (1.0, ready)]

    def RifleAt(t):
        for (t0, a), (t1, b) in zip(rifles, rifles[1:]):
            if t <= t1:
                u = Smooth((t - t0) / max(1e-6, t1 - t0))
                return T.Rifle(Lerp3(a['origin'], b['origin'], u), Unit(Lerp3(a['axis'], b['axis'], u)))
        return ready
    body = Keys(base, [(0.0, {'bend': .30}), (.12, {'bend': .20}), (.30, {'bend': .10, 'pelvis': Add3(base['pelvis'], (0, .03, 0))}),
                       (.42, {'bend': .50, 'pelvis': Add3(base['pelvis'], (0, -.06, -.08)), 'head': (.40, 0, 0)}),
                       (.60, {'bend': .42}), (1.0, {'bend': .12, 'pelvis': base['pelvis'], 'head': (.12, 0, 0)})],
                lag={'head': .04})

    def Pose(t):
        f = body(t)
        rifle = RifleAt(t)
        if rifle:
            palms = T.Palms(rifle['axis'])
            f['grip.R'], f['grip.L'] = rifle['gripR'], rifle['gripL']
            f['gripW.R'] = f['gripW.L'] = Smooth(t / .12)
            f['palmF.R'], f['palmN.R'], f['curl.R'] = palms['R'][0], palms['R'][1], .95
            f['palmF.L'], f['palmN.L'], f['curl.L'] = palms['L'][0], palms['L'][1], .85
            f['armPole.R'] = (-(SX + .45), .20, P + .15)
            f['armPole.L'] = (SX + .40, -.20, P + .05)
        return T.Nest(f)

    def Props(t):
        rifle = RifleAt(t)
        if t < .02:
            slung, up = SlungRifle(T, 'side')
            return {'weapon': (slung['origin'], slung['axis'], up, True)}
        return {'weapon': T.Track(rifle)}
    spec = {'pose': Pose, 'props': Props, 'plants': [('L', 0, 1.0), ('R', 0, 1.0)],
            'check': lambda t: {'R': RifleAt(t)['gripR']} if t > .14 and RifleAt(t) else {},
            'reviewProps': lambda t: (T.RifleProps(RifleAt(t)) if RifleAt(t) else []) + [('point', head(t), None, .10)],
            'reviewFrames': lambda n: [0, int(n * .3), int(n * .42), int(n * .6), n - 1]}
    spec['player'] = lambda t: {'head': head(t)}
    return AReview(spec)


# =================================================================================
# 02: interrogating Shunzi, the dadao counter-attack, drag to cover, "还能打不？".
# Shunzi is the first-person player; each clip carries his body points (`player`).
# Recommended layout around him (runtime metres, his frame: he lies on his left side at
# the trench edge, head toward -z; x right): STAGES['rescueCircle'].
# =================================================================================
STAGES['rescueCircle'] = {
    'anchor': 'shunzi', 'notes': 'Layout only (first-person player has no clip): ijaA crouched at his right holding the '
    'front collar, the interpreter squatting in front, ijaB standing off his left aiming; each clip\'s `player` '
    'track says where Shunzi\'s collar/head must be relative to that actor.',
    'actors': {'shunzi': {'rig': None, 'clip': None, 'x': 0.0, 'z': 0.0, 'yawDeg': 0},
               'ijaA': {'rig': 'LugouIja02', 'clip': 'IjaHoldCollarUp', 'x': .52, 'z': -.52, 'yawDeg': -105},
               'interpreter': {'rig': 'LugouNra02', 'clip': 'InterpreterCrouchAsk', 'x': 0.0, 'z': -1.02, 'yawDeg': 180},
               'ijaB': {'rig': 'LugouIja01', 'clip': 'IjaChoppedFallWall', 'x': -.80, 'z': -.72, 'yawDeg': 133}}}
STAGES['chopRear'] = {'anchor': 'ijaB', 'notes': 'Luo steps in from ijaB\'s right-rear; the blade reaches the right side '
                      'of his neck at 0.45 s in both clips.',
                      'actors': {'ijaB': {'rig': 'LugouIja01', 'clip': 'IjaChoppedFallWall', 'x': 0.0, 'z': 0.0, 'yawDeg': 0},
                                 'luo': {'rig': 'LugouNra05', 'clip': 'LuoDadaoChopRear', 'x': .42, 'z': .62, 'yawDeg': 34}}}
STAGES['chopParry'] = {'anchor': 'ijaA', 'notes': 'ijaA root = his IjaHoldCollarUp root (crouched, facing Shunzi). He comes '
                       'in behind his left; ijaA spins left onto him. Muzzle beaten aside at 0.40 s, the cut lands at 0.78 s.',
                       'actors': {'ijaA': {'rig': 'LugouIja02', 'clip': 'IjaParriedChoppedFall', 'x': 0.0, 'z': 0.0, 'yawDeg': 0},
                                  'heyoutian': {'rig': 'LugouNra02', 'clip': 'HeDadaoParryChop', 'x': -.30, 'z': 1.32,
                                                'yawDeg': 12}}}
PARTNER_SOURCES.setdefault('LugouIja01', {}).update({'IjaChoppedFallWall': ['neckSideR']})
PARTNER_SOURCES.setdefault('LugouIja02', {}).update({'IjaParriedChoppedFall': ['neckSideL', 'muzzle']})

Meta('IjaHoldCollarUp', 3.8, False, 'track', role='ijaA', rig='LugouIja02', props=['weapon'], rootMotion=False,
     weaponState='slungRight', holdLoop=[.8, 3.8], player=True,
     contacts=[{'t': .35, 'limb': 'handL', 'action': 'grab', 'partnerRole': 'shunzi', 'part': 'collarFront'},
               {'t': .8, 'limb': 'handL', 'action': 'hold', 'partnerRole': 'shunzi', 'part': 'collarFront'}],
     events=[{'t': 1.8, 'kind': 'shake'}, {'t': 3.0, 'kind': 'shake'}],
     prev=['IjaButtStrike'], next=['IjaParriedChoppedFall'],
     notes='Squats at his right, fists the front of his jacket and hauls the upper body out of the mud; 0.8-3.8 s is a '
           'seamless hold loop (turns his head to the interpreter, two shakes).')
Meta('InterpreterCrouchAsk', 3.2, True, 'free', role='interpreter', rig='LugouNra02', rootMotion=False, player=True,
     notes='Squatting on his heels in front of Shunzi, leaning in, right hand turned up asking and jabbing, left '
           'forearm on the left knee; the head searches his face.')
Meta('InterpreterGrabCollar', 3.0, False, 'free', role='interpreter', rig='LugouNra02', rootMotion=False, player=True,
     holdLoop=[.6, 3.0],
     contacts=[{'t': .32, 'limb': 'handR', 'action': 'grab', 'partnerRole': 'shunzi', 'part': 'collarFront'}],
     events=[{'t': .45, 'kind': 'shake', 'line': 'RescueInterrogation.06'}],
     prev=['InterpreterCrouchAsk'], next=['InterpreterFlee'],
     notes='"说话！": lunges from the squat, grabs the collar with the right hand and shakes once; 0.6-3.0 s holds.')
Meta('InterpreterFlee', 1.6, False, 'free', role='interpreter', rig='LugouNra02', rootMotion=True,
     events=[{'t': .05, 'kind': 'startle', 'line': 'RescueFlee.01'}, {'t': .40, 'kind': 'handsDown'},
             {'t': 1.6, 'kind': 'handoff', 'to': 'locomotion.run'}],
     prev=['InterpreterGrabCollar', 'InterpreterCrouchAsk'], next=[],
     notes='Lets go, recoils onto his hands, scrambles up turning away and breaks into a run toward the front trench '
           '(about 1.3 m inside the clip); the director hands him to the native run at the end.')
Meta('LuoDadaoChopRear', 1.3, False, 'track', role='luo', rig='LugouNra05', props=['weapon'], rootMotion=True,
     stage='chopRear', weapon='Dadao',
     contacts=[{'t': .45, 'limb': 'blade', 'action': 'cut', 'partnerRole': 'ijaB', 'part': 'neckSideR'}],
     events=[{'t': .45, 'kind': 'dadaoHit'}],
     prev=['CreepDadao'], next=['LuoDragToCover'],
     notes='From the right-rear: dadao cocked over the right shoulder, a step in on the left foot and one diagonal '
           'two-handed cut down through the right side of the neck, follow-through low left, back to guard.')
Meta('IjaChoppedFallWall', 2.2, False, 'track', role='ijaB', rig='LugouIja01', props=['weapon'], rootMotion=True,
     stage='chopRear', env={'wallLeftM': .80}, terminal=True,
     contacts=[{'t': .45, 'by': 'luo', 'part': 'neckSideR', 'action': 'cut'}, {'t': .92, 'limb': 'shoulderL', 'action': 'hit', 'target': 'wall'}],
     events=[{'t': .45, 'kind': 'bloodSpray', 'at': 'neckSideR'}, {'t': .50, 'kind': 'weaponLost'}, {'t': 2.2, 'kind': 'dead'}],
     prev=['IjaBayonetGuard', 'IjaReadyRifle'], next=[],
     notes='Aiming down at Shunzi when the blade lands: neck snaps away, the rifle drops out of his hands, he '
           'staggers left into the trench wall and slides down it. Frame 0 is his aim; last frame is the corpse.')
Meta('HeDadaoParryChop', 1.5, False, 'track', role='heyoutian', rig='LugouNra02', props=['weapon'], rootMotion=True,
     stage='chopParry', weapon='Dadao',
     contacts=[{'t': .417, 'limb': 'blade', 'action': 'parry', 'partnerRole': 'ijaA', 'part': 'muzzle'},
               {'t': .792, 'limb': 'blade', 'action': 'cut', 'partnerRole': 'ijaA', 'part': 'neckSideL'}],
     events=[{'t': .417, 'kind': 'steelClash'}, {'t': .792, 'kind': 'dadaoHit'}],
     prev=['CreepDadao'], next=['HeSwapDadaoRifle'],
     notes='Runs the last step in, beats the turning muzzle aside with the flat of the dadao (0.40 s), and cuts down '
           'into the left side of the neck (0.78 s). No pause between the two.')
Meta('IjaParriedChoppedFall', 2.4, False, 'track', role='ijaA', rig='LugouIja02', props=['weapon'], rootMotion=True,
     stage='chopParry', terminal=True,
     contacts=[{'t': .417, 'by': 'heyoutian', 'part': 'muzzle', 'action': 'parry'},
               {'t': .792, 'by': 'heyoutian', 'part': 'neckSideL', 'action': 'cut'}],
     events=[{'t': .05, 'kind': 'releaseCollar'}, {'t': .792, 'kind': 'bloodSpray', 'at': 'neckSideL'}, {'t': 2.4, 'kind': 'dead'}],
     prev=['IjaHoldCollarUp'], next=[],
     notes='Lets go of Shunzi, comes up spinning left and swinging the rifle off his shoulder at the man behind him; '
           'the muzzle is beaten aside, the cut drops him beside Shunzi. Last frame is the corpse.')
Meta('LuoDragToCover', 2.6, False, 'free', role='luo', rig='LugouNra05', rootMotion=True, player=True, weapon='Dadao',
     weaponState='dadaoInBelt',
     contacts=[{'t': .30, 'limb': 'handsLR', 'action': 'grab', 'partnerRole': 'shunzi', 'part': 'collarBackAndStrap'},
               {'t': 2.30, 'limb': 'handsLR', 'action': 'release'}],
     prev=['LuoDadaoChopRear'], next=['LuoKneelCheck'],
     notes='Crouches, fists the back of the collar and the pack strap, and hauls Shunzi backwards 1.4 m behind the '
           'collapsed earth (first-person: Shunzi is the dragged one; `player` gives his collar).')
Meta('HeSwapDadaoRifle', 1.6, False, 'track', role='heyoutian', rig='LugouNra02', props=['weapon', 'rifle'], rootMotion=False,
     events=[{'t': .45, 'kind': 'dadaoPlanted'}, {'t': .90, 'kind': 'switchWeapon', 'to': 'HanYang'}],
     endHold='twoHand',
     prev=['HeDadaoParryChop'], next=[],
     notes='Backs into the cover, drives the dadao point-down into the earth, pulls the rifle off his back over the '
           'right shoulder and comes up at low ready. `weapon` = the dadao (planted), `rifle` = the rifle.')
Meta('LuoKneelCheck', 3.4, False, 'free', role='luo', rig='LugouNra05', rootMotion=False, player=True, holdLoop=[.9, 2.6],
     contacts=[{'t': .85, 'limb': 'handL', 'action': 'grip', 'partnerRole': 'shunzi', 'part': 'shoulderR'},
               {'t': 2.6, 'limb': 'handL', 'action': 'release'}],
     events=[{'t': 1.0, 'kind': 'line', 'line': 'RescueCheck.01'}],
     prev=['LuoDragToCover'], next=['KickRifle'],
     notes='Drops onto his right knee in front of Shunzi, left hand on his shoulder, looks him in the face (0.9-2.6 s '
           'hold loop while "还能打不？" and the nod play), then stands for the kick.')


# ---- 02 builders ---------------------------------------------------------------------
def Squat(T, depth=1.0):
    """Squatting on the heels (flat feet, knees forward), pelvis low."""
    H, A = T.H, T.A
    f = Standing(T)
    f.update({'pelvis': (0, .10, .36 + (1 - depth) * .30), 'pelvisTilt': (.30, 0, 0), 'bend': .30,
              'ankle.L': (H + .06, -.05, A), 'ankle.R': (-(H + .06), -.02, A),
              'legPole.L': (H + .30, -1.2, .9), 'legPole.R': (-(H + .30), -1.2, .9), 'foot.L': (0, 18, 0), 'foot.R': (0, -18, 0)})
    return f


@Builder('IjaHoldCollarUp')
def BuildHoldCollarUp(T, name):
    H, P, SX = T.H, T.P, T.SX
    base = Squat(T, .85)
    base.update({'handRel.R': (-.05, -.30, -.35), 'palmF.R': (0, -.6, -.8), 'palmN.R': (0, 0, -1), 'curl.R': .6,
                 'handRel.L': (.06, -.14, -.45), 'palmF.L': (0, -.2, -1), 'palmN.L': (-1, 0, 0), 'curl.L': .7})
    collar = Channel([(0.0, (.04, -.62, .20)), (.35, (.04, -.62, .20)), (.80, (.04, -.52, .50)), (1.8, (.04, -.52, .50)),
                      (1.86, (.05, -.49, .53)), (1.94, (.03, -.53, .49)), (2.02, (.04, -.52, .50)), (3.0, (.04, -.52, .50)),
                      (3.06, (.05, -.49, .53)), (3.14, (.03, -.53, .49)), (3.22, (.04, -.52, .50)), (3.8, (.04, -.52, .50))])
    head = lambda t: tuple(Vector(collar(t)) + Vector((0, -.04, .22)))
    body = Keys(base, [(0.0, {'bend': .55}), (.35, {'bend': .70, 'head': (.30, 0, 0)}), (.80, {'bend': .42, 'head': (.15, 0, .05)}),
                       (1.2, {'head': (.10, .05, .45)}), (1.6, {'head': (.12, 0, .10)}), (2.4, {'head': (.10, .05, .40)}),
                       (3.2, {'head': (.14, 0, .08)}), (3.8, {'bend': .42, 'head': (.15, 0, .05)})], lag={'head': .05})
    spec = PlayerGripSpec(T, body, {'L': [(.35, 3.8, collar, (0, .3, -1), 1.15)]})
    props, review = SlungProps(T, 'side')
    spec.update({'props': props, 'plants': [('L', 0, 3.8), ('R', 0, 3.8)], 'player': lambda t: {'collar': collar(t), 'head': head(t)},
                 'reviewProps': lambda t: review(t) + [('point', collar(t), None, .04), ('point', head(t), None, .10)],
                 'reviewFrames': lambda n: [0, int(n * .1), int(n * .22), int(n * .5), n - 1]})
    return AReview(spec)


def InterpreterBase(T):
    H, SX = T.H, T.SX
    f = Squat(T, 1.0)
    f.update({'bend': .42, 'head': (-.05, 0, 0),
              'handRel.L': (-.02, -.30, -.30), 'poleRel.L': (.40, .10, -.30), 'palmF.L': (-.2, -.8, -.4), 'palmN.L': (0, 0, -1), 'curl.L': .55,
              'handRel.R': (.02, -.36, -.12), 'poleRel.R': (-.40, .10, -.35), 'palmF.R': (.1, -1, .1), 'palmN.R': (0, 0, 1), 'curl.R': .35})
    return f


def InterpreterPlayer():
    return {'collar': (0, -.72, .52), 'head': (0, -.76, .74)}


@Builder('InterpreterCrouchAsk')
def BuildCrouchAsk(T, name):
    base = InterpreterBase(T)

    def Pose(t):
        f = dict(base)
        phase = Tau * t / 3.2
        ask = math.sin(phase)
        jab = max(0.0, math.sin(2 * phase)) ** 2
        f['bend'] += .05 * jab + .01 * math.sin(4 * phase)
        h = f['head']
        f['head'] = (h[0] - .06 * jab, h[1] + .10 * ask, h[2] + .12 * math.sin(phase + 0.0))
        r = f['handRel.R']
        f['handRel.R'] = (r[0] + .03 * ask, r[1] - .08 * jab, r[2] + .06 * jab)
        f['curl.R'] = .35 + .25 * jab
        return T.Nest(f)
    player = InterpreterPlayer()
    return AReview({'pose': Pose, 'plants': [('L', 0, 3.2), ('R', 0, 3.2)], 'player': lambda t: player,
                    'reviewProps': lambda t: [('point', player['collar'], None, .04), ('point', player['head'], None, .10)]})


@Builder('InterpreterGrabCollar')
def BuildGrabCollar(T, name):
    base = InterpreterBase(T)
    player = InterpreterPlayer()
    collar = Channel([(0.0, player['collar']), (.40, player['collar']), (.46, Add3(player['collar'], (0, .04, .03))),
                      (.52, Add3(player['collar'], (0, -.02, -.01))), (.60, player['collar']), (3.0, player['collar'])])
    body = Keys(base, [(0.0, {}), (.25, {'bend': .62, 'pelvis': Add3(base['pelvis'], (0, -.08, .04))}),
                       (.45, {'bend': .58, 'head': (-.10, 0, 0)}), (.60, {'bend': .60, 'head': (-.06, 0, 0)}),
                       (1.8, {'head': (-.04, .05, .06)}), (3.0, {'bend': .60, 'head': (-.06, 0, 0)})], lag={'head': .05})
    spec = PlayerGripSpec(T, body, {'R': [(.32, 3.0, collar, (0, .3, -1), 1.15)]})
    spec.update({'plants': [('L', 0, 3.0), ('R', 0, 3.0)], 'player': lambda t: {'collar': collar(t), 'head': player['head']},
                 'reviewProps': lambda t: [('point', collar(t), None, .04), ('point', player['head'], None, .10)],
                 'reviewFrames': lambda n: [0, int(n * .1), int(n * .15), n - 1]})
    return AReview(spec)


@Builder('InterpreterFlee')
def BuildFlee(T, name):
    H, P, A, SX = T.H, T.P, T.A, T.SX
    base = InterpreterBase(T)
    base.update({'turn': 0.0})
    run = Standing(T)
    # Keys are in the actor's frame; `turn` spins the body left about the pelvis as he gets up.
    rows = [
        (0.00, {}),
        (0.12, {'bend': .20, 'head': (-.30, 0, 0), 'pelvis': Add3(base['pelvis'], (0, .06, .02)),
                'handRel.R': (.05, -.25, .15), 'handRel.L': (-.05, -.25, .15), 'palmF.R': (0, -.2, 1), 'palmN.R': (0, -1, 0),
                'palmF.L': (0, -.2, 1), 'palmN.L': (0, -1, 0)}),
        # Sits back on his hands.
        (0.40, {'pelvis': (0, .30, .22), 'pelvisTilt': (-.30, 0, 0), 'bend': .10, 'head': (-.10, 0, 0),
                'handRel.R': (-.10, .30, -.45), 'handRel.L': (.10, .30, -.45), 'palmF.R': (0, .3, -1), 'palmN.R': (0, 0, -1),
                'palmF.L': (0, .3, -1), 'palmN.L': (0, 0, -1),
                'ankle.L': (H + .08, -.25, A), 'ankle.R': (-(H + .05), -.30, A)}),
        # Scrambles up turning away (left) toward the front trench.
        (0.80, {'pelvis': (-.05, .55, P - .30), 'pelvisTilt': (.45, 0, 0), 'bend': .45, 'turn': 1.9, 'head': (.10, 0, .30),
                'ankle.L': (H + .04, .40, A), 'ankle.R': (-(H + .02), .60, A + .08),
                'handRel.R': (-.08, -.20, -.40), 'handRel.L': (.08, .05, -.42)}),
        (1.05, {'pelvis': (-.10, .85, P - .14), 'pelvisTilt': (.30, 0, 0), 'bend': .30, 'turn': 3.0,
                'ankle.L': (-.02, 1.05, A + .10), 'ankle.R': (-.18, .70, A), 'head': (.0, 0, .10)}),
        (1.30, {'pelvis': (-.12, 1.15, P - .10), 'turn': 3.14, 'ankle.L': (0.0, 1.30, A), 'ankle.R': (-.25, 1.10, A + .12)}),
        (1.60, {'pelvis': (-.14, 1.45, P - .08), 'turn': 3.14, 'bend': .25,
                'ankle.L': (-.02, 1.30, A + .10), 'ankle.R': (-.26, 1.62, A),
                'handRel.R': (-.06, .10, -.40), 'handRel.L': (.06, -.20, -.38)}),
    ]
    anim = Keys(base, rows, lag={'head': .05})

    def Pose(t):
        f = anim(t)
        f = Turned(f, f['turn'])
        return T.Nest(f)
    spec = {'pose': Pose, 'reviewFrames': lambda n: [0, int(n * .25), int(n * .5), int(n * .8), n - 1],
            'reviewViews': [('side', (-3.6, .6, 1.0), (0, .6, .6)), ('q', (-2.6, -2.2, 1.9), (0, .6, .6))], 'reviewScale': 3.2}
    return spec


def Dadao(T, grip, axis, up=(0, 0, 1)):
    """Dadao held at `grip` (right fist), blade along `axis`."""
    a = Vector(axis).normalized()
    u = Vector(up)
    u = (u - a * u.dot(a))
    u = u.normalized() if u.length > 1e-6 else Vector((1, 0, 0))
    g = Vector(grip)
    origin = g + a * T.R(.03)
    return {'origin': tuple(origin), 'axis': tuple(a), 'up': tuple(u), 'gripR': tuple(g),
            'gripL': tuple(origin - a * T.R(.15)), 'tip': tuple(origin + a * T.R(.626)),
            'mid': tuple(origin + a * T.R(.34)), 'pommel': tuple(origin - a * T.R(.27))}


def DadaoTrack(d, visible=True):
    return (d['origin'], d['axis'], d['up'], visible)


def DadaoProps(d):
    return [('cyl', d['pommel'], d['tip'], .02)]


def DadaoPalms(axis, up):
    """Both fists round the dadao grip; knuckles along the spine side."""
    a = Vector(axis).normalized()
    u = Vector(up)
    fingers = a.cross(u).normalized()
    return {'R': (tuple(fingers), tuple(-u.normalized()), 1.1), 'L': (tuple(fingers), tuple(-u.normalized()), 1.05)}


def ChopSpec(T, stage, role, partner, point, contactT, keysBlade, body, duration, twoHand=True, contacts=None):
    """Blade clip: the fists follow keyed grip points; at each contact key the blade middle is
    solved onto the partner's patch (grip = patch - axis * mid). contacts: [(t, patch)]."""
    contacts = contacts or [(contactT, point)]
    solved = {}
    for tk, grip, axis, up in keysBlade:
        for tc, patch in contacts:
            if abs(tk - tc) < 1e-6 and patch:
                hit = PartnerPoint(T, stage, role, partner, patch, tk)
                if hit is not None:
                    solved[tk] = tuple(hit[0] - Vector(axis).normalized() * T.R(.37))

    def BladeAt(t):
        rows = [(tk, solved.get(tk, grip), axis, up) for tk, grip, axis, up in keysBlade]
        g = Channel([(r[0], r[1]) for r in rows])(t)
        a = Channel([(r[0], Unit(r[2])) for r in rows])(t)
        u = Channel([(r[0], Unit(r[3])) for r in rows])(t)
        return Dadao(T, g, a, u)

    def Pose(t):
        f = body(t)
        d = BladeAt(t)
        palms = DadaoPalms(d['axis'], d['up'])
        f['grip.R'] = d['gripR']
        f['palmF.R'], f['palmN.R'], f['curl.R'] = palms['R']
        f['handRel.R'] = None
        w = twoHand(t) if callable(twoHand) else (1.0 if twoHand else 0.0)
        if w > 0:
            # The left fist leaves the long grip for the reach of a one-handed extension
            # and comes back on the recovery (twoHand is a weight curve).
            f['grip.L'] = d['gripL']
            f['gripW.L'] = w
            f['palmF.L'], f['palmN.L'], f['curl.L'] = palms['L']
            f['handRel.L'] = f.get('handRel.L') or (.07, -.20, -.30)
        return T.Nest(f)

    def Check(t):
        out = {}
        for tc, patch in contacts:
            if abs(t - tc) >= .021 or not patch:
                continue
            hit = PartnerPoint(T, stage, role, partner, patch, t)
            if hit is not None:
                # Reported as a grip error: where the fist has to be for the blade middle to sit on the patch.
                d = BladeAt(t)
                out['R'] = tuple(hit[0] - Vector(d['axis']) * T.R(.37))
        return out

    def Review(t):
        rows = DadaoProps(BladeAt(t)) + PartnerGhost(T, stage, role, partner, t)
        hit = PartnerPoint(T, stage, role, partner, point, t) if point else None
        if hit:
            rows.append(('point', tuple(hit[0]), None, .035))
        return rows
    return {'pose': Pose, 'check': Check, 'reviewProps': Review, 'blade': BladeAt,
            'props': lambda t: {'weapon': DadaoTrack(BladeAt(t))}}


def AimDownRifle(T):
    """IJA standing aim down at a man on the ground ~1.2 m ahead (butt in the shoulder)."""
    return AimRifle(T, pitchDeg=-24.0, yawDeg=0.0)


@Builder('IjaChoppedFallWall')
def BuildChoppedFallWall(T, name):
    H, P, A, SX = T.H, T.P, T.A, T.SX
    base = AimStance(T)
    base.update({'bend': .18, 'head': (.30, -.14, .42)})
    rifle0 = AimDownRifle(T)
    ground = T.Rifle((-.30, -.70, .035), Unit((.80, -.60, .02)))
    wallX = .86
    rows = [
        (0.00, {}),
        (0.45, {}),
        # The blade lands on the right of the neck: head and neck thrown left, shoulders hunch.
        (0.50, {'head': (.10, .35, .60), 'neck': (0.0, .20, .20), 'shrug': .30, 'bend': .08}),
        (0.62, {'pelvis': (.12, -.10, P - .16), 'pelvisTilt': (.10, .20, -.20), 'lean': .20, 'bend': .25,
                'ankle.L': (H + .18, -.30, A), 'foot.L': (0, 25, 0)}),
        (0.78, {'pelvis': (.24, -.20, P - .22), 'ankle.R': (.05, -.15, A + .02), 'foot.R': (0, 10, 0)}),
        # Left shoulder into the wall.
        (0.92, {'pelvis': (.26, -.22, P - .25), 'lean': .28, 'bend': .30, 'head': (.30, .30, .30), 'ankle.R': (.08, -.18, A)}),
        (1.40, {'pelvis': (.27, -.18, .55), 'bend': .50, 'lean': .20, 'head': (.45, .25, .20)}),
        (1.80, {'pelvis': (.28, -.12, .25), 'bend': .65, 'lean': .15, 'head': (.50, .20, .20),
                'ankle.L': (H + .30, -.60, A), 'ankle.R': (.05, -.55, A), 'foot.L': (0, 35, 0), 'foot.R': (0, -20, 0),
                'legPole.L': (H + .60, -.9, .8), 'legPole.R': (-.10, -1.0, .8)}),
        (2.20, {'pelvis': (.28, -.10, .14), 'bend': .70, 'head': (.55, .22, .22)}),
    ]
    anim = Keys(base, rows, lag={'head': .04, 'neck': .03})
    hands = Keys({'handRel.R': (-.10, -.20, -.42), 'handRel.L': (.10, -.10, -.45)}, [(0.0, {}), (.6, {}),
                  (1.2, {'handRel.L': (.17, .05, -.12)}), (2.2, {'handRel.R': (-.02, -.20, -.45), 'handRel.L': (.10, -.20, -.40)})])

    def RifleAt(t):
        if t <= .50:
            return rifle0
        u = Clamp((t - .50) / .45)
        o = Lerp3(rifle0['origin'], ground['origin'], u)
        o = (o[0], o[1], o[2] + .10 * math.sin(math.pi * u))
        return T.Rifle(o, Unit(Lerp3(rifle0['axis'], ground['axis'], Smooth(u))))

    def Pose(t):
        f = anim(t)
        if t <= .50:
            r = rifle0
            palms = T.Palms(r['axis'])
            f['grip.R'], f['grip.L'] = r['gripR'], r['gripL']
            f['palmF.R'], f['palmN.R'], f['curl.R'] = palms['R'][0], palms['R'][1], .95
            f['palmF.L'], f['palmN.L'], f['curl.L'] = palms['L'][0], palms['L'][1], .85
            f['armPole.R'] = (-(SX + .45), .10, T.SZ - .35)
            f['armPole.L'] = (SX + .30, -.40, T.SZ - .60)
        else:
            h = hands(t)
            f['handRel.R'], f['handRel.L'] = h['handRel.R'], h['handRel.L']
            f['palmF.R'], f['palmN.R'], f['curl.R'] = (0, -.2, -1), (1, 0, 0), .35
            f['palmF.L'], f['palmN.L'], f['curl.L'] = (0, .2, 1), (1, 0, 0), .25
        return T.Nest(f)

    spec = {'pose': Pose, 'props': lambda t: {'weapon': T.Track(RifleAt(t))}, 'plants': [('L', 0, .50), ('R', 0, .62), ('L', .62, 1.40), ('R', .92, 1.40)],  # feet slide out as he slumps (1.4-1.8 s)
            'walls': [((wallX, 0, 0), (-1, 0, 0))],
            'reviewProps': lambda t: T.RifleProps(RifleAt(t)) + [('box', (wallX + .03, 0, .7), (.06, 2.0, 1.4), 0)],
            'reviewFrames': lambda n: [0, int(n * .2), int(n * .28), int(n * .42), int(n * .7), n - 1]}
    return AReview(spec)


@Builder('LuoDadaoChopRear')
def BuildChopRear(T, name):
    H, P, A, SX, SZ = T.H, T.P, T.A, T.SX, T.SZ
    base = Standing(T)
    base.update({'ankle.L': (H + .02, -.10, A), 'ankle.R': (-(H + .03), .14, A), 'foot.L': (0, 10, 0), 'foot.R': (0, -25, 0),
                 'pelvis': (0, .02, P - .10), 'bend': .12})
    blade = [
        (0.00, (-(SX + .02), -.05, SZ + .10), (-.10, .45, .89), (-1, 0, 0)),     # cocked over the right shoulder
        (0.25, (-(SX + .05), .02, SZ + .26), (-.15, .60, .79), (-1, 0, 0)),      # wind-up, weight back
        (0.38, (-(SX - .05), -.25, SZ + .20), (.05, -.70, .71), (-.8, 0, -.2)),  # coming over
        (0.45, (0, -.40, SZ - .10), (.35, -.80, -.48), (-.6, 0, -.8)),          # through the neck (solved)
        (0.60, (SX - .02, -.28, P - .05), (.35, -.20, -.92), (-.2, -.2, -.95)),  # follow-through low left
        (0.90, (-.05, -.22, P + .10), (.10, -.75, -.65), (-.3, 0, -.95)),
        (1.30, (-(SX - .05), -.20, P + .25), (.05, -.80, .60), (-1, 0, 0)),      # guard
    ]
    body = Tracks(base, {
        'ankle.L': [(0.0, base['ankle.L']), (.25, base['ankle.L']), (.35, Add3(base['ankle.L'], (-.02, -.16, .07))),
                    (.45, Add3(base['ankle.L'], (-.04, -.30, 0)))],
        'pelvis': [(0.0, base['pelvis']), (.25, Add3(base['pelvis'], (0, .06, .01))), (.45, Add3(base['pelvis'], (-.02, -.18, -.08))),
                   (.60, Add3(base['pelvis'], (-.02, -.20, -.10))), (1.3, Add3(base['pelvis'], (0, -.16, -.06)))],
        'twist': [(0.0, -.20), (.25, -.40), (.45, .25), (.60, .35), (1.3, 0.0)],
        'bend': [(0.0, .12), (.25, .02), (.45, .35), (.60, .42), (1.3, .20)],
        'head': [(0.0, (.10, 0, .20)), (.25, (.05, 0, .30)), (.45, (.30, 0, .05)), (1.3, (.15, 0, 0))],
    }, lag={'head': .05})
    both = Channel([(0.0, 1.0), (.36, 1.0), (.42, 0.0), (.62, 0.0), (.80, 1.0), (1.3, 1.0)])
    spec = ChopSpec(T, 'chopRear', 'luo', 'ijaB', 'neckSideR', .45, blade, body, 1.3, twoHand=both)
    spec.update({'plants': [('R', 0, 1.3), ('L', .45, 1.3)],
                 'reviewFrames': lambda n: [0, int(n * .19), int(n * .3), int(n * .35), int(n * .46), n - 1]})
    return AReview(spec)


@Builder('IjaParriedChoppedFall')
def BuildParriedFall(T, name):
    H, P, A, SX, SZ = T.H, T.P, T.A, T.SX, T.SZ
    hold = Squat(T, .85)
    hold.update({'bend': .42, 'head': (.15, 0, .05), 'turn': 0.0,
                 'handRel.R': (-.05, -.30, -.35), 'palmF.R': (0, -.6, -.8), 'palmN.R': (0, 0, -1), 'curl.R': .6,
                 'handRel.L': (.06, -.14, -.45), 'palmF.L': (0, -.2, -1), 'palmN.L': (-1, 0, 0), 'curl.L': .7})
    spin = 2.6                                      # turns left ~150 deg onto the man behind him
    rows = [
        (0.00, {}),
        (0.10, {'head': (.0, 0, .60)}),
        (0.30, {'pelvis': (.02, .12, P - .22), 'pelvisTilt': (.15, 0, 0), 'bend': .20, 'turn': spin * .55,
                'ankle.L': (H + .10, .12, A), 'ankle.R': (-(H + .02), -.06, A), 'head': (.05, 0, .35)}),
        # Spun round in a deep crouch with the rifle low: the hips stay down (a braced, sprung
        # stance), so the hands keep the rifle without the reach assist and nothing pops up
        # when the grip lets go at the cut.
        (0.45, {'pelvis': (.02, .20, P - .27), 'turn': spin * .92, 'ankle.R': (-(H - .10), .10, A),
                'foot.L': (0, 60, 0), 'foot.R': (0, 110, 0), 'head': (.10, 0, .10)}),
        # The last 12 deg of the turn are in the hips: the planted feet counter-rotate so they stay put.
        (0.60, {'pelvis': (0.0, .24, P - .30), 'turn': spin, 'bend': .18, 'twist': -.15,
                'foot.L': (0, 60 - math.degrees(spin * .08), 0), 'foot.R': (0, 110 - math.degrees(spin * .08), 0)}),
        # The cut: collapses at the knees, head thrown right, falls on his side beside Shunzi.
        (0.78, {'turn': spin}),
        (0.84, {'pelvis': (-.01, .21, P - .32), 'head': (.10, -.35, -.55), 'neck': (0, -.20, -.20), 'shrug': .30}),
        (1.10, {'pelvis': (-.05, .06, .55), 'bend': .45, 'lean': -.25, 'pelvisTilt': (.20, -.25, 0)}),
        (1.50, {'pelvis': (-.12, -.05, .25), 'bend': .60, 'lean': -.40, 'pelvisTilt': (.40, -.60, 0),
                'ankle.L': (H + .15, .20, A + .05), 'ankle.R': (-(H - .05), .35, A + .02)}),
        (2.40, {'pelvis': (-.18, -.10, .15), 'bend': .30, 'lean': -.60, 'pelvisTilt': (.60, -1.10, 0), 'head': (.20, -.40, -.30)}),
    ]
    anim = Keys(hold, rows, lag={'head': .04})
    hung = SlungSideNominal(T)

    def RifleAt(t, f=None):
        # Swung off the shoulder into the hands pointing at He (local +Y after the spin), then dropped.
        swung = T.Rifle((-(SX + .02), -.04, P + .10), Unit((.10, -.95, .30)))
        if t <= .10:
            return hung
        if t <= .40:
            u = Smooth((t - .10) / .30)
            return T.Rifle(Lerp3(hung['origin'], swung['origin'], u), Unit(Lerp3(hung['axis'], swung['axis'], u)))
        if t <= .60:
            # Beaten aside to his right by the dadao.
            u = Smooth((t - .40) / .20)
            aside = T.Rifle((-(SX - .12), -.20, P - .04), Unit((-.40, -.90, .12)))
            return T.Rifle(Lerp3(swung['origin'], aside['origin'], u), Unit(Lerp3(swung['axis'], aside['axis'], u)))
        aside = T.Rifle((-(SX - .12), -.20, P - .04), Unit((-.40, -.90, .12)))
        if t <= .80:
            return aside
        u = Clamp((t - .80) / .40)
        down = T.Rifle((-.45, -.30, .035), Unit((-.70, -.70, .02)))
        return T.Rifle(Lerp3(aside['origin'], down['origin'], u), Unit(Lerp3(aside['axis'], down['axis'], Smooth(u))))

    def Pose(t):
        f = anim(t)
        rifle = RifleAt(t)
        if .10 < t <= .80:
            w = Smooth((t - .10) / .12)
            palms = T.Palms(rifle['axis'])                     # body frame: Nest turns them for the grips
            world = World(rifle, t)
            f['grip.R'], f['gripW.R'] = world['gripR'], w
            f['palmF.R'], f['palmN.R'], f['curl.R'] = palms['R'][0], palms['R'][1], .95
            # The beat tears the forward hand off the handguard (0.40-0.52 s); the rifle is
            # left in the right fist and the left arm is flung out.
            wL = w if t <= .40 else w * (1 - Smooth((t - .40) / .12))
            if wL > 1e-3:
                f['grip.L'], f['gripW.L'] = world['gripL'], wL
                f['palmF.L'], f['palmN.L'], f['curl.L'] = palms['L'][0], palms['L'][1], .85
        if t > .40:
            u = Smooth((t - .40) / .20)
            f['handRel.L'] = Lerp3(hold['handRel.L'], (.26, -.18, -.28), u)
            f['curl.L'] = Mix(.85, .35, u)
        f = Turned(f, f['turn'])
        return T.Nest(f)

    def World(rifle, t):
        """Rifle keys are written in the body frame of the squat (pelvis at hold['pelvis']); they
        ride the authored pelvis and turn with the body about it."""
        f = anim(t)
        psi, c, c0 = f['turn'], f['pelvis'], hold['pelvis']
        out = {}
        for key in ('origin', 'gripR', 'gripL', 'muzzle', 'butt'):
            p = rifle[key]
            x, y = _Rot(p[0] - c0[0], p[1] - c0[1], psi)
            out[key] = (x + c[0], y + c[1], p[2])
        ax, ay = _Rot(rifle['axis'][0], rifle['axis'][1], psi)
        out['axis'] = (ax, ay, rifle['axis'][2])
        return out

    def RifleWorld(t):
        return World(RifleAt(t), t) if t > .10 else World(RifleAt(t), t)

    def Props(t):
        r = RifleWorld(t)
        return {'weapon': (r['origin'], r['axis'], (0, 0, 1), True)}

    def Points(t):
        r = RifleWorld(t)
        return {'muzzle': (Vector(r['muzzle']), Vector((0, 0, 1)))}
    def Check(t):
        if not (.22 < t <= .80):
            return {}
        w = World(RifleAt(t), t)
        return {'R': w['gripR'], 'L': w['gripL']} if t <= .40 else {'R': w['gripR']}
    spec = {'pose': Pose, 'props': Props, 'points': Points, 'plants': [('L', .45, .78), ('R', .45, .78)], 'check': Check,
            'reviewProps': lambda t: [('cyl', RifleWorld(t)['butt'], RifleWorld(t)['muzzle'], .018)],
            'reviewFrames': lambda n: [0, int(n * .12), int(n * .17), int(n * .25), int(n * .33), int(n * .6), n - 1]}
    return AReview(spec)


@Builder('HeDadaoParryChop')
def BuildParryChop(T, name):
    H, P, A, SX, SZ = T.H, T.P, T.A, T.SX, T.SZ
    base = Standing(T)
    base.update({'ankle.L': (H + .02, -.12, A), 'ankle.R': (-(H + .03), .16, A), 'foot.L': (0, 10, 0), 'foot.R': (0, -25, 0),
                 'pelvis': (0, .02, P - .12), 'bend': .20})
    # Parry: flat of the blade against the muzzle, driving it to He's left (ijaA's right).
    blade = [
        (0.00, (-(SX - .02), -.25, P + .30), (.10, -.70, .70), (-1, 0, 0)),        # low guard, running in
        (0.28, (-(SX - .05), -.35, P + .40), (.45, -.70, .55), (-.9, 0, -.2)),
        # Contact keys sit on frames (10/24 and 19/24 s) so a frame shows the steel touching.
        (10 / 24, (-.02, -.45, P + .30), (.80, -.55, .20), (0, 0, 1)),            # beat (solved onto the muzzle)
        (0.55, (-(SX + .05), -.05, SZ + .22), (-.10, .40, .91), (-1, 0, 0)),       # straight back up over the shoulder
        (19 / 24, (0, -.42, SZ - .12), (-.30, -.80, -.50), (.6, 0, -.8)),         # cut into the left of the neck (solved)
        (0.95, (-(SX - .05), -.30, P - .05), (-.30, -.25, -.92), (.2, -.2, -.95)),
        (1.50, (-(SX - .05), -.22, P + .25), (.05, -.80, .60), (-1, 0, 0)),
    ]
    body = Tracks(base, {
        'ankle.L': [(0.0, base['ankle.L']), (.12, base['ankle.L']), (.22, Add3(base['ankle.L'], (0, -.18, .07))),
                    (.32, Add3(base['ankle.L'], (0, -.34, 0)))],
        'ankle.R': [(0.0, base['ankle.R']), (.55, base['ankle.R']), (.66, Add3(base['ankle.R'], (0, -.14, .06))),
                    (.76, Add3(base['ankle.R'], (0, -.24, 0)))],
        'pelvis': [(0.0, base['pelvis']), (.32, Add3(base['pelvis'], (0, -.18, -.04))), (.55, Add3(base['pelvis'], (0, -.16, 0))),
                   (.78, Add3(base['pelvis'], (0, -.30, -.10))), (1.5, Add3(base['pelvis'], (0, -.28, -.06)))],
        'twist': [(0.0, 0.0), (.40, .30), (.55, -.05), (.78, .15), (.95, .30), (1.5, 0.0)],
        'bend': [(0.0, .20), (.40, .25), (.55, .08), (.78, .35), (1.5, .20)],
        'head': [(0.0, (.10, 0, 0)), (.40, (.20, 0, -.10)), (.78, (.30, 0, 0)), (1.5, (.15, 0, 0))],
    }, lag={'head': .05})
    # The left fist closes on the long grip at the top of the lift and leaves it as the blade
    # drops past the shoulder (the cut itself is one-handed, the reach of the right arm).
    both = Channel([(0.0, 0.0), (.50, 0.0), (.58, 1.0), (.64, 1.0), (.72, 0.0), (1.0, 0.0), (1.2, 1.0), (1.5, 1.0)])
    spec = ChopSpec(T, 'chopParry', 'heyoutian', 'ijaA', 'neckSideL', 19 / 24, blade, body, 1.5, twoHand=both,
                    contacts=[(10 / 24, 'muzzle'), (19 / 24, 'neckSideL')])

    spec.update({'plants': [('R', 0, .55), ('L', .32, 1.5), ('R', .76, 1.5)],
                 'reviewFrames': lambda n: [0, int(n * .27), int(n * .37), int(n * .52), int(n * .64), n - 1]})
    return AReview(spec)


@Builder('LuoDragToCover')
def BuildLuoDrag(T, name):
    H, P, A, SX = T.H, T.P, T.A, T.SX
    base = Standing(T)
    # Shunzi's back collar, relative to Luo's root: he is hauled 1.4 m back with Luo.
    collar = Channel([(0.0, (0, -.66, .30)), (.30, (0, -.66, .30)), (.55, (0, -.52, .40)), (2.30, (0, .88, .40)), (2.6, (0, .88, .38))])

    def PelvisXY(t):
        c = collar(t)
        return (c[0], c[1] + .55)
    schedule = [('L', .60, .85), ('R', .90, 1.15), ('L', 1.20, 1.45), ('R', 1.50, 1.75), ('L', 1.80, 2.05), ('R', 2.10, 2.30)]
    stance = {'L': (H + .10, -.18, A), 'R': (-(H + .10), .05, A)}
    feet, plants = FollowSteps(PelvisXY, stance, schedule, 2.6)
    times = [round(.1 * i, 2) for i in range(27)]
    crouch = Channel([(0.0, .10), (.30, .40), (.55, .34), (2.3, .34), (2.6, .30)])
    body = Tracks(base, dict(feet, pelvis=[(t, (PelvisXY(t)[0], PelvisXY(t)[1], P - crouch(t))) for t in times],
                             bend=[(0.0, .30), (.30, .95), (.55, .75), (2.3, .72), (2.6, .60)],
                             pelvisTilt=[(0.0, (.10, 0, 0)), (.30, (.35, 0, 0)), (2.6, (.30, 0, 0))],
                             head=[(0.0, (.10, 0, 0)), (.30, (.20, 0, 0)), (.80, (-.25, 0, .60)), (1.50, (-.20, 0, -.50)),
                                   (2.2, (-.10, 0, .40)), (2.6, (.10, 0, 0))]),
                  lag={'head': .06})
    grips = {'L': [(.30, 2.30, lambda t: tuple(Vector(collar(t)) + Vector((.07, 0, 0))), (0, 0, -1), 1.15)],
             'R': [(.30, 2.30, lambda t: tuple(Vector(collar(t)) + Vector((-.14, .06, -.04))), (0, 0, -1), 1.15)]}
    spec = PlayerGripSpec(T, body, grips)
    spec.update({'plants': plants, 'player': lambda t: {'collar': collar(t)},
                 'reviewProps': lambda t: [('point', collar(t), None, .04)] + PlayerGhost(T, collar(t)),
                 'reviewViews': [('side', (-3.6, .4, 1.0), (0, .3, .5)), ('q', (-2.6, -2.2, 1.9), (0, .3, .5))], 'reviewScale': 3.4,
                 'reviewFrames': lambda n: [0, int(n * .12), int(n * .5), n - 1]})
    return spec


@Builder('HeSwapDadaoRifle')
def BuildSwap(T, name):
    H, P, A, SX, SZ = T.H, T.P, T.A, T.SX, T.SZ
    base = Standing(T)
    base.update({'pelvis': (0, .04, P - .22), 'bend': .30, 'ankle.L': (H + .04, -.12, A), 'ankle.R': (-(H + .04), .12, A)})
    blade = [(0.00, (-(SX - .05), -.22, P + .20), (.05, -.80, .60), (-1, 0, 0)),
             (0.30, (-(SX - .02), -.35, P + .10), (0, -.25, -.97), (-1, 0, 0)),          # point down
             (0.45, (-(SX - .02), -.36, T.R(.66)), (0, -.25, -.97), (-1, 0, 0))]          # driven into the earth
    planted = Dadao(T, blade[2][1], blade[2][2], blade[2][3])
    ready = T.Rifle((-(H + .02), -.16, P + .15), Unit((.16, -.90, -.40)))
    backRifle = T.Rifle((.107, .20, P + .16), Unit((-.37, .05, .93)))
    lifted = T.Rifle((-.20, .15, P + .25), Unit((-.20, -.35, .91)))
    rifles = [(0.0, backRifle), (.70, backRifle), (.98, lifted), (1.30, ready), (1.6, ready)]

    def RifleAt(t):
        for (t0, a), (t1, b) in zip(rifles, rifles[1:]):
            if t <= t1:
                u = Smooth((t - t0) / max(1e-6, t1 - t0))
                return T.Rifle(Lerp3(a['origin'], b['origin'], u), Unit(Lerp3(a['axis'], b['axis'], u)))
        return ready
    along = Channel([(0.0, .92), (.70, .92), (.98, .70), (1.15, .45), (1.35, WEAPONS[T.gun]['butt']), (1.6, WEAPONS[T.gun]['butt'])])

    def BladeAt(t):
        if t >= .45:
            return planted
        rows = blade
        g = Channel([(r[0], r[1]) for r in rows])(t)
        a = Channel([(r[0], Unit(r[2])) for r in rows])(t)
        return Dadao(T, g, a, (-1, 0, 0))
    body = Keys(base, [(0.0, {}), (.45, {'bend': .55, 'pelvis': Add3(base['pelvis'], (0, -.04, -.12))}),
                       (.62, {'bend': .12, 'twist': -.20, 'pelvis': base['pelvis']}), (1.1, {'twist': .05}), (1.6, {'bend': .22, 'twist': 0.0})],
                lag={'head': .05})

    def Pose(t):
        f = body(t)
        if t < .50:
            d = BladeAt(t)
            palms = DadaoPalms(d['axis'], d['up'])
            f['grip.R'] = d['gripR']
            f['palmF.R'], f['palmN.R'], f['curl.R'] = palms['R']
            f['handRel.L'] = (.08, -.14, -.45)
        elif t < .70:
            f['handRel.R'] = (-.10, .02, .05)
            f['palmF.R'], f['palmN.R'], f['curl.R'] = (0, .3, 1), (0, 1, 0), .6
        else:
            rifle = RifleAt(t)
            palms = T.Palms(rifle['axis'])
            f['grip.R'] = T.Along(rifle, along(t))
            f['palmF.R'], f['palmN.R'], f['curl.R'] = palms['R'][0], palms['R'][1], .95
            f['gripW.R'] = Smooth((t - .70) / .06)
            if t >= 1.05:
                f['grip.L'] = rifle['gripL']
                f['gripW.L'] = Smooth((t - 1.05) / .12)
                f['palmF.L'], f['palmN.L'], f['curl.L'] = palms['L'][0], palms['L'][1], .85
            f['handRel.R'] = None
        f['armPole.R'] = (-(SX + .45), .20, P + .10)
        return T.Nest(f)

    def Props(t):
        return {'weapon': DadaoTrack(BladeAt(t)), 'rifle': T.Track(RifleAt(t))}
    spec = {'pose': Pose, 'props': Props, 'plants': [('L', 0, 1.6), ('R', 0, 1.6)],
            'reviewProps': lambda t: DadaoProps(BladeAt(t)) + T.RifleProps(RifleAt(t)),
            'reviewFrames': lambda n: [0, int(n * .28), int(n * .5), int(n * .7), n - 1]}
    return AReview(spec)


@Builder('LuoKneelCheck')
def BuildKneelCheck(T, name):
    H, P, A, SX, SZ = T.H, T.P, T.A, T.SX, T.SZ
    K = T.K
    stand = Standing(T)
    kz = K['kneelPelvisZ']
    kp = K['toeKneelPitch'] - K['toeStandPitch']
    # Right knee down, left foot planted forward (the "genuflect").
    ky = K['kneelPelvisY']
    # Kneels in close and leans in over the knee to put the hand on the shoulder and his face
    # level with Shunzi's (the hand reaches without stretching the arm straight).
    kneel = {'pelvis': (0, ky - .08, kz + .16), 'ankle.L': (H + .08, ky - .56, A), 'legPole.L': (H + .30, -1.2, .9), 'foot.L': (0, 12, 0),
             'ankle.R': K['kneelAnkle'](-1), 'legPole.R': K['kneelPole'](-1), 'foot.R': (kp, 0, 0),
             'bend': .50, 'pelvisTilt': (.08, 0, 0), 'head': (-.20, 0, 0)}
    shoulder = (.10, -.50, .58)              # Shunzi's right shoulder (sitting against the earth)
    head = (.02, -.62, .80)
    rows = [(0.0, {}), (.20, {'pelvis': Add3(stand['pelvis'], (0, 0, -.12)), 'bend': .25}),
            (.60, kneel),
            (.90, {'head': (-.25, 0, .05)}), (1.75, {'head': (-.24, .06, .02), 'bend': .52}), (2.60, {'head': (-.25, 0, .05), 'bend': .50}),
            (3.40, {k: stand[k] for k in ('pelvis', 'ankle.L', 'ankle.R', 'legPole.L', 'legPole.R', 'foot.L', 'foot.R', 'bend',
                                           'pelvisTilt', 'head')})]
    body = Keys(dict(stand, **{'handRel.L': (.06, -.14, -.45), 'palmF.L': (0, -.2, -1), 'palmN.L': (-1, 0, 0),
                               'handRel.R': (-.08, -.16, -.44), 'palmF.R': (0, -.2, -1), 'palmN.R': (1, 0, 0), 'curl.R': .7}),
                rows, lag={'head': .05})
    spec = PlayerGripSpec(T, body, {'L': [(.85, 2.60, lambda t: shoulder, (0, .3, -1), .75)]})
    spec.update({'plants': [('L', .60, 2.6), ('R', .60, 2.6)], 'player': lambda t: {'shoulderR': shoulder, 'head': head},
                 'reviewProps': lambda t: [('point', shoulder, None, .04), ('point', head, None, .10)],
                 'reviewFrames': lambda n: [0, int(n * .18), int(n * .27), int(n * .6), n - 1]})
    return AReview(spec)


# =================================================================================
# which rigs bake which clip (manifest `rigs`). Every 2026-09-23 clip is baked only on the
# rigs its role can wear (contract §5.1: comrade/interpreter/He/Liu/yaowa = NRA02, Luo =
# NRA05, ijaA = IJA02, ijaB = IJA01, ijaC/ijaD = IJA01 or IJA02); the legacy 0922 clips stay
# on all five so the old director keeps working. A clip missing on a rig is not playable on
# it (the runtime falls back to native animation), so the director must cast accordingly.
# =================================================================================
IJA_BOTH = ['LugouIja01', 'LugouIja02']
RIGS_BY_ROLE = {'ijaA': ['LugouIja02'], 'ijaB': ['LugouIja01'], 'ijaC': IJA_BOTH, 'ijaD': IJA_BOTH,
                'luo': ['LugouNra05']}
SHARED_IJA = {'IjaReadyRifle'}          # ijaA and ijaB both ready their rifles
for _name, _row in CLIPS.items():
    if _row.get('legacy'):
        continue
    _row.setdefault('rigs', IJA_BOTH if _name in SHARED_IJA else RIGS_BY_ROLE.get(_row.get('role'), ['LugouNra02']))
