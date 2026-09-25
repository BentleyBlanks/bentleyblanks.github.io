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
    # Front of the left thigh, mid-length (the trouser leg a blade is wiped on).
    'thighL': {'bones': ['L Thigh'], 'normal': (0, -1, 0), 'count': 16,
               'score': lambda p, c: -p.y - 4 * abs(p.z - (_P(c, 'L Thigh').z + _P(c, 'L Calf').z) / 2)
               - 2 * abs(p.x - (_P(c, 'L Thigh').x + _P(c, 'L Calf').x) / 2)},
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
     weaponState='held->dropped',
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
        # ijaB works from his right side (yaw 95, was 122): at 122 both soldiers stooped into the
        # same space in front of him and ijaB's head went through ijaA's chest at the grab.
        'ijaB': {'rig': 'LugouIja01', 'clip': 'IjaPullArm', 'x': .48, 'z': -.24, 'yawDeg': 95},
    }}
STAGES['captiveWall'] = {
    'anchor': 'comrade', 'syncS': 0.0,
    'notes': 'Comrade root R3 = his kneel spot at the end of the drag (pelvis hand-over: models[].clips[].root, CaptiveDraggedFromDirt end = CaptiveWallBrace start); '
             'the trench wall is 0.49 m behind him (he was hauled round to face his right). ijaA stands square in front.',
    'actors': {
        'comrade': {'rig': 'LugouNra02', 'clip': 'CaptiveWallBrace', 'x': 0.0, 'z': 0.0, 'yawDeg': 0},
        'ijaA': {'rig': 'LugouIja02', 'clip': 'IjaShoveToWall', 'x': .02, 'z': -.60, 'yawDeg': 180},
    }}
PARTNER_SOURCES.setdefault('LugouNra02', {}).update({
    'CaptiveDraggedFromDirt': ['collarBack', 'upperArmR', 'wristR'],
    'CaptiveWallBrace': ['chestFront'],
})

Meta('CaptiveDraggedFromDirt', 4.4, False, 'free', role='comrade', rig='LugouNra02', rootMotion=True, weaponState='dropped', weaponDropFrom='BlastSlamBuried',
     stage='captiveDrag', env={'wallLeftM': .55},
     contacts=[{'t': .30, 'by': 'ijaA', 'part': 'collarBack', 'action': 'grab'},
               {'t': .70, 'by': 'ijaB', 'part': 'upperArmR', 'action': 'grab'},
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
     contacts=[{'t': .30, 'limb': 'handR', 'action': 'grab', 'partnerRole': 'comrade', 'part': 'collarBack', 'standoffM': .035}],
     events=[{'t': 2.20, 'kind': 'jerkUp', 'line': 'CaptiveDragged.02'}],
     next=['IjaShoveToWall'],
     notes='Stoops, hooks the back collar with the right hand, backs up three steps hauling; the '
           'jerk on "立て！" straightens him. Rifle slung across the back.')
Meta('IjaPullArm', 4.4, False, 'track', role='ijaB', rig='LugouIja01', props=['weapon'], rootMotion=True,
     stage='captiveDrag', weaponState='slungBack',
     contacts=[{'t': .70, 'limb': 'handL', 'action': 'grab', 'partnerRole': 'comrade', 'part': 'upperArmR', 'standoffM': .045},
               {'t': .62, 'limb': 'handR', 'action': 'grab', 'partnerRole': 'comrade', 'part': 'wristR', 'standoffM': .04},
               {'t': 3.20, 'limb': 'handsLR', 'action': 'yank', 'partnerRole': 'comrade'},
               {'t': 4.05, 'limb': 'handsLR', 'action': 'release'}],
     next=['IjaBayonetGuard', 'GuardTurn', 'IjaReadyRifle'],
     notes='Two-handed hold on the right upper arm and wrist, sidesteps back with the drag, '
           'wrenches the arm up at 3.2 s and lets go at 4.05 s.')
Meta('CaptiveWallBrace', 2.0, False, 'free', role='comrade', rig='LugouNra02', rootMotion=True, weaponState='dropped', weaponDropFrom='BlastSlamBuried',
     stage='captiveWall', env={'wallBehindM': .49},
     contacts=[{'t': .34, 'by': 'ijaA', 'part': 'chestFront', 'action': 'shove'},
               {'t': .62, 'limb': 'handL', 'action': 'brace', 'target': 'wall', 'untilT': 1.0},
               {'t': 1.20, 'limb': 'shoulderBack', 'action': 'lean', 'target': 'wall', 'untilT': 2.0}],
     prev=['CaptiveDraggedFromDirt'], next=['CaptiveKneelMud', 'CaptiveHeadPulledBack'],
     notes='Shoved in the chest: topples back-left, the left palm finds the wall and slides down the loose '
           'earth, he ends kneel-sitting with shoulder and back on the wall, right hand on the torn bandage.')
Meta('IjaShoveToWall', 1.0, False, 'track', role='ijaA', rig='LugouIja02', props=['weapon'], rootMotion=True,
     stage='captiveWall', weaponState='slungBack', extra=True,
     contacts=[{'t': .34, 'limb': 'handR', 'action': 'shove', 'partnerRole': 'comrade', 'part': 'chestFront', 'standoffM': .04},
               {'t': .56, 'limb': 'handR', 'action': 'release'}],
     prev=['IjaDragCollarFromDirt'], next=['InterrogateCrouch', 'IjaHairGrabPull'],
     notes='Not in contract §5.4 (added): the shove the draft describes ("推到沟壁上") needs its own pair '
           'with CaptiveWallBrace. Short wind-up, lunge on the left foot, flat right palm to the chest.')
Meta('CaptiveKneelMud', 3.0, True, 'free', role='comrade', rig='LugouNra02', rootMotion=False, weaponState='dropped', weaponDropFrom='BlastSlamBuried',
     env={'wallBehindM': .49},
     contacts=[{'t': 0.0, 'limb': 'shoulderBack', 'action': 'lean', 'target': 'wall', 'untilT': 3.0}],
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
        # The head's face direction and eye at rest in the head bone's own frame, and the head's
        # rest relation to the neck (AimHead turns the face onto a point and keeps it on the neck).
        K['Reset']()
        q0 = K['BWorld'](K['Bone']('Head')).to_quaternion()
        self.faceLocal = q0.inverted() @ Vector((0, -1, 0))
        self.eyeLocal = q0.inverted() @ Vector((0, -.09, .10))
        self.headOnNeck = K['BWorld'](K['Bone']('Neck')).to_quaternion().inverted() @ q0
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
        # A hand still reaching for its grip (weight < 1) keeps its body-frame wrist target, but
        # the palm hint that comes with a grip is a WORLD direction: turning it through the body
        # frame (as a free hand's palm is) put the hand in a wrong orientation for the whole
        # reach and flipped it 90-180 deg in one frame when the weight reached 1. The grip pass
        # (ArmSolve) turns these hands; the bake's hand-rate limit carries the free hand's
        # orientation over to the grip palm in a few frames.
        relGrip = {s for s in rel if f.get('grip.' + s) is not None}
        look, lookW, lookLimit = f.get('look'), f.get('lookW', 1.0), f.get('lookLimit', 62.0)

        def Post():
            # Face onto its look point first: the free arms below are solved from the shoulders
            # after it (the head carries nothing but the helmet socket).
            if look is not None and lookW > 1e-3:
                self.AimHead(look, lookW, lookLimit)
            for s in LR:
                if feet[s] is not None and f.get('toeDir.' + s) is None:
                    self.OrientFoot(s, feet[s], f.get('frameYaw') or 0.0)
            p['relPoles'] = {}
            for s, offset in rel.items():
                own = s not in relGrip
                if not own:
                    # The elbow pole the free hand used, in world: the grip pass starts from it
                    # and moves over to the grip's world pole as the reach completes.
                    frame = BodyFrame(K)
                    basis = Matrix((frame['left'], frame['back'], frame['up'])).transposed()
                    shoulder = K['Point'](K['Bone'](s + ' UpperArm'))
                    sign = 1 if s == 'L' else -1
                    p['relPoles'][s] = tuple(shoulder + basis @ Vector(f.get('poleRel.' + s) or (sign * .45, .40, -.35)))
                self.RelArm(s, offset, f.get('poleRel.' + s), f.get('palmF.' + s) if own else None,
                            f.get('palmN.' + s) if own else None, f.get('curl.' + s, .5),
                            world=f.get('hand.' + s), weight=f.get('handRelW.' + s, 1.0),
                            worldPole=f.get('armPole.' + s), worldPalm=(f.get('palmFw.' + s), f.get('palmNw.' + s)))
        p['post'] = Post
        p['resolved'] = tuple(s for s in rel if f.get('grip.' + s) is None)
        # CurlFingers bends from the current finger pose: a hand the body-frame pass (Post)
        # turns and curls must not be curled by ApplyPose first, or it closes twice as far
        # (and a clip handing over from a world-space hand would jump by that much).
        gripPalms = {s: p['palms'][s] for s in p['grips'] if s in p['palms']}
        for s in rel:
            p['palms'].pop(s, None)
        # Grips are pinned after ApplyPose in world space: their palm hints must be turned by the
        # frame here (ApplyPose turns the ones it applies itself).
        q = Quaternion((0, 0, 1), f['frameYaw']) if f.get('frameYaw') else None
        p['gripPalms'] = {s: ((tuple(q @ Vector(palm[0])), tuple(q @ Vector(palm[1]))) + tuple(palm[2:])) if q else palm
                          for s, palm in gripPalms.items()}
        return p

    def AimHead(self, target, weight=1.0, limitDeg=62.0):
        """Turn the head (only the head: the clavicles hang on the neck) so the face looks at
        `target` (world, source metres), blended by `weight`, at most limitDeg off its rest
        relation to the neck. The storyboard close-ups need the face toward the first-person
        eye; an authored head tilt cannot follow a moving eye point."""
        K = self.K
        head, neck = K['Bone']('Head'), K['Bone']('Neck')
        loc, q0, sc = K['BWorld'](head).decompose()
        q = q0.copy()
        for _ in range(3):
            face = q @ self.faceLocal
            eye = loc + q @ self.eyeLocal
            want = Vector(target) - eye
            if want.length < 1e-6:
                break
            d = face.rotation_difference(want.normalized())
            if d.angle < 1e-4:
                break
            q = d @ q
        q = q0.slerp(q, Clamp(weight))
        nq = K['BWorld'](neck).to_quaternion()
        delta = (nq.inverted() @ q) @ self.headOnNeck.inverted()
        if delta.w < 0:
            delta = -delta
        limit = math.radians(limitDeg)
        if delta.angle > limit:
            delta = Quaternion().slerp(delta, limit / delta.angle)
            q = nq @ (delta @ self.headOnNeck)
        K['Put'](head, Matrix.LocRotScale(loc, q, sc))

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
    # The right arm is hauled towards ijaB, who faces it from his right (IjaPullArm keeps its
    # pelvis 0.5 m out along that line): each key puts the wrist 0.38 m (~75 % reach) from where
    # the right shoulder is at that time, along (right .98, ahead .10, down .14) -- held at
    # ijaB's belt, not up into his face,
    # the elbow hanging down-out. (It trailed behind the shoulder, folded to 7-9 cm shoulder-
    # wrist, and flipped the elbow for a frame at 2.04 s.)
    armBase = BuriedBase(T)['armPole.R']
    rows = [
        (0.00, {'turn': 0.0, 'handRel.L': (.06, -.10, -.50), 'poleRel.L': (.40, .30, -.20), 'handRelW.L': 0.0,
                'palmFw.L': (-.4, -.6, -.6), 'palmNw.L': (-.3, 0, -1), 'palmF.L': (0, -.2, -1), 'palmN.L': (-1, 0, 0)}),
        # The grab: a groan, the head comes up a little.
        (0.30, {'head': (.24, -.05, .05), 'shrug': .08, 'neck': (.20, -.05, .05)}),
        # Hauled up by the collar and the right arm: trunk lifts, head hangs.
        (0.60, {'pelvis': (.30, .10, .22), 'pelvisTilt': (.30, .05, .12), 'bend': .45, 'lean': .05, 'twist': -.05,
                'head': (.45, .05, .10), 'neck': (.25, 0, .05),
                'hand.R': (-.101, -.196, .646), 'armPole.R': armBase,
                'palmF.R': (0, -.7, .7), 'palmN.R': (-.5, 0, -.8), 'curl.R': .4,
                'hand.L': (.36, .02, .08)}),
        # Dragged: knees in the dirt behind him, feet trailing on their insteps.
        (1.00, {'pelvis': (.28, -.16, .34), 'pelvisTilt': (.55, 0, .05), 'bend': .42,
                'ankle.L': kneelMid['ankle.L'], 'ankle.R': kneelMid['ankle.R'],
                'legPole.L': kneelMid['legPole.L'], 'legPole.R': kneelMid['legPole.R'], 'foot.L': kp, 'foot.R': kp,
                'hand.R': (-.275, -.546, .855), 'armPole.R': (-.001, -.508, .458), 'handRelW.L': 1.0}),
        # One foot gets under him and shoves -- and goes out again.
        (1.25, {'ankle.R': (.27 - H - .02, -.46, A), 'legPole.R': (.27 - H - .10, -1.2, .6), 'foot.R': (0, -8, 0),
                'pelvis': (.27, -.28, .42), 'hand.R': (-.286, -.667, .885), 'armPole.R': (-.012, -.629, .488)}),
        (1.45, {'ankle.R': (.27 - H - .02, -.46, A), 'pelvis': (.27, -.34, .50), 'bend': .35,
                'hand.R': (-.285, -.711, .914), 'armPole.R': (-.011, -.673, .517)}),
        (1.70, {'ankle.R': kneelMid['ankle.R'], 'legPole.R': kneelMid['legPole.R'], 'foot.R': kp,
                'pelvis': (.26, -.38, .36), 'bend': .45, 'hand.R': (-.295, -.774, .861), 'armPole.R': (-.021, -.736, .464)}),
        (2.00, {'pelvis': (ex, ey - .02, .36), 'hand.R': (-.496, -.915, .785), 'armPole.R': (-.222, -.877, .388), 'turn': 0.0}),
        # "立て！" -- jerked up and round by the collar; the head snaps back, the legs do not hold.
        (2.20, {'pelvis': (ex, ey, kz + .16), 'pelvisTilt': (.10, 0, 0), 'bend': .18, 'turn': -.55,
                'head': (-.12, 0, 0), 'neck': (-.05, 0, 0), 'shrug': .20,
                'hand.R': (-.316, -.645, .944), 'armPole.R': (-.22, -.458, .76)}),
        (2.45, {'pelvis': (ex, ey, kz + .08), 'bend': .25, 'head': (.15, 0, .05), 'turn': -1.25,
                'hand.R': (-.284, -.510, .871), 'armPole.R': (-.161, -.354, .687)}),
        (2.75, {'pelvis': kneel['pelvis'], 'ankle.L': kneel['ankle.L'], 'ankle.R': kneel['ankle.R'],
                'legPole.L': kneel['legPole.L'], 'legPole.R': kneel['legPole.R'], 'turn': DRAG_TURN, 'armPole.R': armBase,
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
            # World palm of the grip from the first reaching frame (the free hand's palm is in
            # the body frame; mixing the two numbers gave a meaningless direction).
            f['palmF.' + side], f['palmN.' + side] = palmF, palmN
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
    # Pelvis rides 0.52 m behind the collar (his own +Y), height by how far down he reaches;
    # 0.62 m while he jerks the man up (2.0-2.6 s) so the rising head does not meet his chest.
    back = [(0.0, .52), (1.75, .52), (2.05, .62), (2.25, .64), (2.8, .58), (4.4, .58)]

    def PelvisXY(t):
        c = Channel(collar)(t)
        return (c[0] * .85, c[1] + Channel(back)(t))
    crouch = [(0.0, .06), (.30, .20), (.60, .16), (1.0, .12), (2.0, .12), (2.20, .02), (2.75, .08), (4.40, .06)]
    bend = [(0.0, .15), (.30, .62), (.60, .48), (1.0, .40), (2.0, .40), (2.20, .10), (2.35, .05), (2.75, .25), (4.40, .22)]
    tilt = [(0.0, (.05, 0, 0)), (.30, (.35, 0, .05)), (1.0, (.25, 0, .05)), (2.20, (-.08, 0, 0)), (2.75, (.12, 0, 0))]
    # The haul starts at the grab (0.30 s) and moves the collar 0.6 m in 0.65 s: he backs off
    # from the first pull, one short backward step every quarter second, then steps in on the
    # jerk up at 2.2 s (the collar rises and comes forward) and settles.
    schedule = [('R', .30, .50), ('L', .50, .74), ('R', .84, 1.08), ('L', 1.10, 1.36), ('R', 1.42, 1.70),
                ('L', 1.74, 2.00), ('R', 2.06, 2.30), ('L', 2.52, 2.76)]
    # Left foot 20 cm further out and 10 cm back, knee turned out: square, his stooping left
    # knee went into the sitting man's raised right knee.
    stance = {'L': (H + .26, -.02, T.A), 'R': (-(H + .04), .16, T.A)}
    feet, plants = FollowSteps(PelvisXY, stance, schedule, 4.4)
    pelvis = [(t, (PelvisXY(t)[0], PelvisXY(t)[1], P - .04 - Channel(crouch)(t))) for t in times]
    base = Standing(T)
    # The free left fist is kept in front of his belly (hanging at his side it swung into ijaB,
    # who works on that side).
    base.update({'handRel.L': (-.02, -.26, -.34), 'palmF.L': (0, -.3, -1), 'palmN.L': (-1, 0, 0), 'curl.L': .9,
                 'legPole.L': (H + .60, -.80, .45)})
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

    # 0.72 m off the arm (closing to 0.52 m for the wrench on his knees) and down in a squat, not stooped over it; and he closes in only once
    # ijaA has hauled the man up and backed off (wrist 0.62 s, upper arm 0.70 s): grabbing at
    # 0.28 s with ijaA put his head through ijaA's chest (both reached for the same shoulder).
    stand = [(0.0, .72), (.6, .80), (1.8, .80), (2.1, .66), (2.4, .62), (2.8, .58), (4.4, .58)]

    def PelvisXY(t):
        c = Channel(arm)(t)
        return (c[0] - .05, c[1] + Channel(stand)(t))
    crouch = [(0.0, .05), (.40, .12), (.62, .28), (.90, .16), (2.0, .10), (2.75, .08), (3.20, .02), (3.45, .0), (4.40, .06)]
    bend = [(0.0, .12), (.40, .22), (.62, .40), (.90, .34), (2.0, .34), (2.75, .30), (3.20, .08), (3.45, .02), (3.85, .15), (4.40, .15)]
    # The arm travels 0.45 m to his right between 0.6 and 1.0 s, 0.25 m back by 1.2 s, another
    # 0.25 m right-back by 2.0 s and swings 0.3 m back left on the jerk up (2.0-2.2 s): side
    # steps lead with the foot on the side he travels to, so no planted leg is left behind.
    schedule = [('R', .50, .72), ('L', .72, .96), ('R', 1.06, 1.28), ('L', 1.30, 1.52), ('R', 1.60, 1.84),
                ('L', 1.98, 2.18), ('R', 2.18, 2.40), ('L', 3.05, 3.25), ('R', 3.95, 4.20)]
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
    grips = {'L': [(.70, 4.05, 'upperArmR', .045, (0, 0, -1), 1.0)],
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


# Kneel-sitting against the R3 wall. His insteps already touch the wall (the toes are 0.2 m
# behind the ankles), so the body cannot move back: the seat drops toward the heels and the
# trunk leans back until the shoulder blades are on the wall (at sit .35 / tilt -.22 the
# upper back stood 13-14 cm off it). The head comes forward to keep the face up.
KNEEL_WALL_SIT = .70
KNEEL_WALL_TILT = (-.36, 0, .04)
KNEEL_WALL_BEND = .02
KNEEL_WALL_NECK = (.15, 0, -.05)
KNEEL_WALL_HEAD = (.35, .08, .10)


def KneelWallBase(T):
    """Kneel-sitting with shoulders and back on the wall behind, right palm pressed over the
    torn bandage. End of CaptiveWallBrace, CaptiveKneelMud frame 0, start of
    CaptiveHeadPulledBack (root R3)."""
    if 'kneelWall' in T.cache:
        return dict(T.cache['kneelWall'])
    f = Standing(T)
    k = KneelFlat(T, 0.0, .02, sit=KNEEL_WALL_SIT)
    f.update(k)
    f.update({'pelvisTilt': KNEEL_WALL_TILT, 'bend': KNEEL_WALL_BEND, 'lean': .05, 'twist': -.05, 'shrug': .10,
              'neck': KNEEL_WALL_NECK, 'head': KNEEL_WALL_HEAD,
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
        # The knees skid back 2 cm with the topple (they stay put from here on).
        (0.48, {'pelvis': (.02, .10, kz - .06), 'bend': -.05, 'lean': .08, 'head': (.10, .05, .05),
                'hand.L': (.24, wallY - .03, kz + .30), 'palmFw.L': (0, .2, 1), 'palmNw.L': (0, 1, 0), 'curl.L': .15,
                'armPole.L': (.55, -.20, kz), 'handRelW.R': 0.0, 'handRelW.L': 0.0,
                **{key: end[key] for key in ('ankle.L', 'ankle.R', 'legPole.L', 'legPole.R', 'foot.L', 'foot.R')}}),
        (0.62, {'hand.L': (.24, wallY, kz + .22)}),
        # The loose earth gives: the palm slides down, shoulders and back take the wall.
        (1.20, {'hand.L': (.26, wallY, kz - .12), 'pelvis': end['pelvis'], 'lean': end['lean'] + .01,
                'pelvisTilt': Add3(end['pelvisTilt'], (-.02, 0, -.01)), 'bend': end['bend'] - .02, 'head': (.30, .08, .10)}),
        (1.35, {'handRelW.R': 1.0, 'handRelW.L': 0.0}),
        (1.70, {'handRelW.L': 1.0, 'curl.L': .5}),
        # Every channel lands on KneelWallBase, the world hand/pole seeds too: the arm IK keeps
        # the roll of its first solve, so the seeds decide the forearm twist the next clip starts on.
        (2.00, dict(end)),
    ]
    anim = Keys(start, rows, lag={'head': .05, 'neck': .03})
    return {'pose': lambda t: T.Nest(anim(t)), 'walls': R3_WALL, 'kneePlants': [('L', .62, 2.0), ('R', .62, 2.0)],
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
            'kneePlants': [('L', 0, 3.0), ('R', 0, 3.0)], 'reviewScale': 2.2}


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
STAGES['slashWipe'] = {'anchor': 'comrade', 'notes': 'IjaWipeSheathBayonet and CaptiveWallSlideTwitch start together: '
                                                     'ijaA lets go of the hair (0-0.3 s), watches him slide down and '
                                                     'wipes the blade on the corpse from 3.2 s.',
                       'actors': {'comrade': {'rig': 'LugouNra02', 'clip': 'CaptiveWallSlideTwitch', 'x': 0.0, 'z': 0.0, 'yawDeg': 0},
                                  'ijaA': dict(IJA_A_AT, rig='LugouIja02', clip='IjaWipeSheathBayonet')}}
PARTNER_SOURCES['LugouNra02'].update({
    'CaptiveHeadPulledBack': ['crown', 'hairBack', 'throat'],
    'CaptiveThroatCut': ['crown', 'hairBack', 'throat'],
    'CaptiveClutchThroat': ['crown', 'hairBack', 'throat'],
    'CaptiveWallSlideTwitch': ['shoulderR', 'shoulderL', 'hairBack', 'crown', 'thighL'],
})

Meta('CaptiveHeadPulledBack', 1.8, False, 'free', role='comrade', rig='LugouNra02', rootMotion=False, stage='slashGrab', weaponState='dropped', weaponDropFrom='BlastSlamBuried',
     env={'wallBehindM': .49},
     contacts=[{'t': .28, 'by': 'ijaA', 'part': 'crown', 'action': 'grab'},
               {'t': 0.0, 'limb': 'shoulderBack', 'action': 'lean', 'target': 'wall', 'untilT': .28},
               {'t': .42, 'limb': 'shoulderBack', 'action': 'release', 'target': 'wall'}],
     prev=['CaptiveKneelMud', 'CaptiveWallBrace'], next=['CaptiveThroatCut'],
     notes='Fist in the hair: he is hauled up off his heels and off the wall, the head torn back and the '
           'throat opened; both hands come up by reflex and stay half-raised while the bayonet is drawn '
           '(covers IjaHairGrabPull + IjaDrawBayonet).')
Meta('IjaHairGrabPull', 1.0, False, 'track', role='ijaA', rig='LugouIja02', props=['weapon'], rootMotion=False,
     stage='slashGrab', weaponState='slungBack',
     contacts=[{'t': .28, 'limb': 'handL', 'action': 'grab', 'partnerRole': 'comrade', 'part': 'crown', 'standoffM': .03},
               {'t': .42, 'limb': 'handL', 'action': 'yank', 'partnerRole': 'comrade'}],
     next=['IjaDrawBayonet'],
     notes='Half step in, left fist into the hair, yanks the head back hard. No pause before the draw.')
Meta('IjaDrawBayonet', .8, False, 'track', role='ijaA', rig='LugouIja02', props=['weapon', 'bayonet'], rootMotion=False,
     stage='slashDraw', weaponState='slungBack',
     contacts=[{'t': 0, 'limb': 'handL', 'action': 'hold', 'partnerRole': 'comrade', 'part': 'crown', 'standoffM': .03},
               {'t': .22, 'limb': 'handR', 'action': 'grip', 'target': 'bayonet', 'part': 'handle'},
               {'t': .30, 'limb': 'handR', 'action': 'draw', 'target': 'bayonet'}],
     events=[{'t': .30, 'kind': 'bayonetDraw', 'sound': 'bladeScrape'}],
     prev=['IjaHairGrabPull'], next=['IjaThroatSlash'],
     notes='Left fist keeps the hair; right hand to the scabbard on the left hip, draws the short bayonet '
           'and brings it low to the right, point toward the victim.')
Meta('IjaThroatSlash', 4.0, False, 'track', role='ijaA', rig='LugouIja02', props=['weapon', 'bayonet'], rootMotion=False,
     stage='slashCut', weaponState='slungBack', holdLoop=[1.0, 4.0],
     contacts=[{'t': .24, 'limb': 'bayonet', 'action': 'cut', 'partnerRole': 'comrade', 'part': 'throat'},
               {'t': 0, 'limb': 'handL', 'action': 'hold', 'partnerRole': 'comrade', 'part': 'crown', 'standoffM': .03},
               # the taunt hold (stage slashTaunt, against CaptiveClutchThroat)
               {'t': 1.0, 'limb': 'handL', 'action': 'hold', 'partnerRole': 'comrade', 'part': 'crown', 'standoffM': .03}],
     events=[{'t': .24, 'kind': 'throatCut'}, {'t': 1.6, 'kind': 'hairShake', 'line': 'CaptiveTaunt.01'},
             {'t': 2.8, 'kind': 'hairShake', 'line': 'CaptiveTaunt.02'}],
     prev=['IjaDrawBayonet'], next=['IjaWipeSheathBayonet'],
     notes='No pause: a 0.1 s cock to the right and one hard right-to-left draw across the throat (blade at '
           'the throat 0.24 s). Keeps the hair and leans in to taunt; 1.0-4.0 s is a seamless hold loop '
           '(the director samples it in window until "日兵甲松手") with two hair shakes on the taunt lines.')
Meta('CaptiveThroatCut', 1.0, False, 'free', role='comrade', rig='LugouNra02', rootMotion=True, stage='slashCut', weaponState='dropped', weaponDropFrom='BlastSlamBuried',
     env={'wallBehindM': .49},
     contacts=[{'t': .24, 'by': 'ijaA', 'part': 'throat', 'action': 'cut'},
               {'t': .44, 'limb': 'handsLR', 'action': 'clutch', 'target': 'self.throat'},
               {'t': .52, 'limb': 'shoulderBack', 'action': 'slam', 'target': 'wall', 'untilT': 1.0}],
     events=[{'t': .24, 'kind': 'bloodSpray', 'at': 'throat'}, {'t': .30, 'kind': 'effort', 'what': 'chokedGurgle'}],
     prev=['CaptiveHeadPulledBack'], next=['CaptiveClutchThroat'],
     notes='The cut lands: a full-body jolt, both hands fly to the throat, the legs go and the trunk slams '
           'back into the wall (0.52 s); the head stays up where the fist holds it.')
Meta('CaptiveClutchThroat', 3.0, True, 'free', role='comrade', rig='LugouNra02', rootMotion=False, stage='slashTaunt', weaponState='dropped', weaponDropFrom='BlastSlamBuried',
     env={'wallBehindM': .49},
     contacts=[{'t': 0.0, 'limb': 'shoulderBack', 'action': 'lean', 'target': 'wall', 'untilT': 3.0}],
     events=[{'t': .30, 'kind': 'spasm'}, {'t': 1.2, 'kind': 'spasm'}, {'t': 2.2, 'kind': 'spasm'},
             {'t': .60, 'kind': 'hairShake'}, {'t': 1.80, 'kind': 'hairShake'}],
     prev=['CaptiveThroatCut'], next=['CaptiveWallSlideTwitch'],
     notes='Hands clamped on the throat, choking spasms, head held back by the fist and shaken twice per loop '
           '(in step with IjaThroatSlash hold window).')
Meta('CaptiveWallSlideTwitch', 3.2, False, 'free', role='comrade', rig='LugouNra02', rootMotion=True, stage='slashWipe', weaponState='dropped', weaponDropFrom='BlastSlamBuried',
     env={'wallBehindM': .49}, terminal=True,
     contacts=[{'t': 0.0, 'limb': 'shoulderBack', 'action': 'slide', 'target': 'wall', 'untilT': 1.2},
               {'t': 1.6, 'limb': 'shoulderBack', 'action': 'rest', 'target': 'wall', 'untilT': 3.2}],
     events=[{'t': 0.0, 'kind': 'released'}, {'t': 1.6, 'kind': 'twitch'}, {'t': 2.1, 'kind': 'twitch'},
             {'t': 2.5, 'kind': 'twitch'}, {'t': 3.2, 'kind': 'dead', 'fact': 'captivesKilled'}],
     prev=['CaptiveClutchThroat'], next=[],
     notes='Let go: the head drops, he slides down the wall onto his side-sit, one hand slips off the throat, '
           'the legs jerk three times and stop. Last frame is the corpse (hold it; replaces ShotCollapse).')
WIPE_LEAD = 3.2     # IjaWipeSheathBayonet: the release and the watch while CaptiveWallSlideTwitch plays
Meta('IjaWipeSheathBayonet', WIPE_LEAD + 2.4, False, 'track', role='ijaA', rig='LugouIja02', props=['weapon', 'bayonet'],
     rootMotion=False, stage='slashWipe', weaponState='slungBack',
     contacts=[{'t': 0.0, 'limb': 'handL', 'action': 'hold', 'partnerRole': 'comrade', 'part': 'crown', 'standoffM': .03},
               {'t': .05, 'limb': 'handL', 'action': 'release', 'partnerRole': 'comrade'},
               {'t': WIPE_LEAD + .55, 'limb': 'bayonet', 'action': 'wipe', 'partnerRole': 'comrade', 'part': 'thighL'},
               {'t': WIPE_LEAD + .85, 'limb': 'bayonet', 'action': 'lift'},
               {'t': WIPE_LEAD + 1.50, 'limb': 'bayonet', 'action': 'sheathe', 'target': 'scabbard'},
               {'t': WIPE_LEAD + 2.30, 'limb': 'handR', 'action': 'grip', 'target': 'weapon', 'part': 'barrel'}],
     events=[{'t': 0.0, 'kind': 'releaseHair'}, {'t': WIPE_LEAD + 1.5, 'kind': 'bayonetSheathe', 'sound': 'bladeSheath'}],
     prev=['IjaThroatSlash'], next=['IjaReadyRifle'],
     notes='Frame 0 is the IjaThroatSlash hold pose: the fist opens (0.05 s) and drops, the knife stays low at '
           'the hip while he watches the man slide down the wall (to 3.2 s, in step with CaptiveWallSlideTwitch). '
           'Then he squats, drags the flat of the blade once across the dead man\'s trouser leg, straightens, '
           'sheathes on the left hip and reaches over the right shoulder for the slung rifle '
           '(last frame = IjaReadyRifle frame 0).')
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


def PulledUpPelvis(T):
    """Seat of a man hauled up by the hair: off the heels (sit .35), a little forward and up."""
    sit, dy, dz = [float(v) for v in (__import__('os').environ.get('PULL') or '.35,-.02,-.02').split(',')]
    return Add3(KneelFlat(T, 0.0, .02, sit=sit)['pelvis'], (0, dy, dz))


HAULED_TILT = (-.22, 0, .04)


def HeadPulledBackKeys(T):
    base = SlashVictimStart(T)
    h = base['head']
    rows = [
        (0.00, {}),
        (0.26, {'head': (h[0] + .06, h[1], h[2])}),
        # Yanked: the fist hauls him up by the hair -- the seat comes off the heels and the back
        # comes off the wall (it slams back into it with the cut, CaptiveThroatCut); the head is
        # torn back and the throat opened. The knees stay where they are.
        (0.42, {'head': (-.34, .05, .10), 'neck': (-.06, 0, .04), 'bend': .16, 'shrug': .24, 'twist': -.26,
                'pelvis': PulledUpPelvis(T), 'pelvisTilt': HAULED_TILT,
                # Both hands fly up at the fist in his hair (forehead high), not out into ijaA's belly.
                'handRel.R': (.07, -.06, .31), 'palmF.R': (.1, -.2, 1), 'palmN.R': (0, -1, .1), 'curl.R': .35,
                'handRel.L': (-.05, -.05, .29), 'palmF.L': (-.1, -.2, 1), 'palmN.L': (0, -1, .1), 'curl.L': .35}),
        (0.62, {'head': (-.30, .08, .08), 'shrug': .20}),
        (0.95, {'head': (-.35, .02, .12), 'handRel.R': (.09, -.07, .33), 'curl.R': .7}),
        (1.25, {'head': (-.31, .07, .09), 'handRel.L': (-.06, -.06, .31), 'curl.L': .6}),
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
            'kneePlants': [('L', 0, 1.8), ('R', 0, 1.8)],
            'reviewFrames': lambda n: [0, int(n * .16), int(n * .24), n - 1]}
    spec.update(R3Review())
    return spec


# Both hands on the cut (torso frame from each hand's own shoulder: left, back, up). The wrist
# targets sit below the jaw in front of the collar so the knuckles land on the throat and the
# fingers lie across it (right fingers toward his left, left hand over them), elbows down.
THROAT_R, THROAT_L = (.13, -.17, -.02), (-.11, -.20, .00)
THROAT_PALM_F_R, THROAT_PALM_N_R = Unit((1, .10, .10)), (0, 1, 0)
THROAT_PALM_F_L, THROAT_PALM_N_L = Unit((-1, .10, .15)), (0, 1, 0)
THROAT_POLE_R, THROAT_POLE_L = (-.25, -.10, -.65), (.25, -.10, -.65)
SLAM_NECK = (.12, 0, .04)
SLAM_HEAD = (-.20, .05, .10)
HELD_NECK = tuple(float(v) for v in (__import__('os').environ.get('HELDNECK') or '.40,0,.04').split(','))
HELD_HEAD = tuple(float(v) for v in (__import__('os').environ.get('HELDHEAD') or '-.40,.05,.10').split(','))


def ThroatCutKeys(T):
    base = HeadPulledBackKeys(T)(1.8)
    # Both hands over the cut, fingers open: the right palm flat across the front of the throat
    # (fingers toward his left), the left pressed over it from the other side, elbows down and
    # out. (Each hand clamping its own side of the neck with the fingers round the nape read, from
    # the front, as two crossed fists under the chin.) Torso frame from each hand's own shoulder.
    throatR, throatL = THROAT_R, THROAT_L
    wall = KneelWallBase(T)
    rows = [
        (0.00, {}),
        # The blade crosses: a jolt forward against the fist...
        (0.24, {'shrug': base['shrug'] + .10, 'bend': base['bend'] + .06, 'pelvis': Add3(base['pelvis'], (0, -.02, .01))}),
        # Both hands to the throat.
        (0.40, {'handRel.R': throatR, 'palmF.R': THROAT_PALM_F_R, 'palmN.R': THROAT_PALM_N_R, 'curl.R': .35,
                'poleRel.R': THROAT_POLE_R,
                'handRel.L': throatL, 'palmF.L': THROAT_PALM_F_L, 'palmN.L': THROAT_PALM_N_L, 'curl.L': .35,
                'poleRel.L': THROAT_POLE_L, 'bend': base['bend'] + .10,
                'shrug': base['shrug'] + .16}),
        # ...and his legs go: the seat drops back onto the heels and the back slams into the wall.
        # The fist keeps the head up: the neck folds forward instead of following the trunk.
        (0.52, {'pelvis': Add3(wall['pelvis'], (.02, 0, 0)), 'pelvisTilt': wall['pelvisTilt'], 'lean': wall['lean'] + .03,
                'bend': wall['bend'], 'twist': base['twist'] - .04, 'neck': SLAM_NECK, 'head': SLAM_HEAD}),
        # The fist drags the head up off the wall again to hold his face up: the neck comes forward
        # off the wall, the head stays tipped back (throat open for the taunt).
        (0.70, {'bend': wall['bend'] + .04, 'shrug': base['shrug'] + .08, 'neck': HELD_NECK, 'head': HELD_HEAD}),
        (1.00, {'bend': wall['bend'] + .02, 'shrug': base['shrug'] + .10}),
    ]
    return Keys(base, rows, lag={'handRel': .02})


THROAT_CHECK_R, THROAT_CHECK_L = (.035, -.015, -.035), (-.035, -.035, -.03)


def OwnThroatCheck(T, stage, since):
    """The knuckles of both hands over his own throat (the dumped 'throat' patch): the right
    hand's on the left of the cut against the skin, the left hand's over the right hand, on the
    right of the cut (source metres, Blender axes: +X his left, -Y his front)."""
    def Check(t):
        if t < since:
            return {}
        try:
            hit = PartnerPoint(T, stage, 'comrade', 'comrade', 'throat', t)
        except KeyError:   # an older partner dump without this clip's throat patch
            hit = None
        return {'R': tuple(hit[0] + Vector(THROAT_CHECK_R)), 'L': tuple(hit[0] + Vector(THROAT_CHECK_L))} if hit else {}
    return Check


@Builder('CaptiveThroatCut')
def BuildThroatCut(T, name):
    anim = ThroatCutKeys(T)
    spec = {'pose': lambda t: T.Nest(anim(t)), 'reviewProps': lambda t: [R3_WALL_BOX],
            'check': OwnThroatCheck(T, 'slashCut', .46), 'kneePlants': [('L', 0, 1.0), ('R', 0, 1.0)],
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
    f['bend'] += .06 * spasm + .015 * gasp
    f['shrug'] += .08 * spasm + .03 * gasp
    f['twist'] += .04 * spasm
    h = f['head']
    f['head'] = (h[0] + .04 * spasm, h[1] + .10 * shake, h[2] + .08 * shake)
    for s, sign in (('R', 1), ('L', -1)):
        r = f['handRel.' + s]
        # (The shrug of a spasm lifts the shoulders the hands hang from: they press down on the
        # throat instead of riding up the jaw.)
        f['handRel.' + s] = (r[0] + .01 * sign * spasm, r[1] - .01 * spasm, r[2] + .006 * gasp - .03 * spasm)
    p = f['pelvis']
    f['pelvis'] = (p[0], p[1], p[2] + .012 * spasm)
    return f


@Builder('CaptiveClutchThroat')
def BuildClutchThroat(T, name):
    spec = {'pose': lambda t: T.Nest(ClutchPose(T, t)), 'check': OwnThroatCheck(T, 'slashTaunt', 0.0),
            'kneePlants': [('L', 0, 3.0), ('R', 0, 3.0)], 'reviewProps': lambda t: [R3_WALL_BOX]}
    spec.update(R3Review())
    return spec


_SLIDE = [float(v) for v in (__import__('os').environ.get('SLIDE') or '-.15,.07,.13,.14').split(',')]
SLIDE_SEAT = tuple(_SLIDE[:3])     # end seat: off the heels to his right, on the ground (x, +y, z)
SLIDE_TILT = (_SLIDE[3], -.12, -.10)   # added to the kneel-wall pelvis tilt: the back stays on the wall
SLIDE_LEG = [float(v) for v in (__import__('os').environ.get('SLIDELEG') or '.22,.0').split(',')]   # left ankle out: (left, forward)


def SlideKeys(T):
    """Released: the head drops, the seat slides off the heels to his right and down onto the
    ground while his back slides down the wall; he ends slumped in a side-sit, shoulders and the
    back of the head against the foot of the wall, legs folded to his left, hands dropped off the
    throat into his lap. The last frame is the corpse (pelvis on the ground, limbs slack)."""
    base = ClutchPose(T, 0.0)
    ar, al = base['ankle.R'], base['ankle.L']
    p0 = base['pelvis']
    endPelvis = (p0[0] + SLIDE_SEAT[0], p0[1] + SLIDE_SEAT[1], SLIDE_SEAT[2])
    A = T.A
    # The left leg slides out along the foot of the wall to his left as the seat drops (not forward:
    # ijaA stands over him there).
    alOut = (endPelvis[0] + SLIDE_LEG[0], endPelvis[1] - SLIDE_LEG[1], A)
    poleOut = (endPelvis[0] + SLIDE_LEG[0] * .8, endPelvis[1] - SLIDE_LEG[1] - .25, .55)
    rows = [
        (0.00, {}),
        # The fist opens: the head drops forward, the neck follows; the hands stay on the throat.
        (0.18, {'head': (.10, .05, .05), 'neck': (0.0, 0, 0)}),
        (0.40, {'head': (.30, -.05, -.05), 'neck': (.14, 0, 0)}),
        # Down the wall: the seat slips off the heels to his right and drops, the back rides
        # down the wall, the trunk sags over to his right.
        (0.95, {'pelvis': Add3(p0, (-.06, .01, -.10)), 'lean': -.16, 'pelvisTilt': Add3(base['pelvisTilt'], (.04, -.06, -.04)),
                'bend': base['bend'] + .04, 'legPole.L': base['legPole.L'], 'ankle.L': al}),
        # The left foot comes out from under him and the leg slides out forward.
        (1.25, {'ankle.L': Lerp3(Add3(al, (0, 0, .06)), alOut, .45), 'legPole.L': Add3(poleOut, (0, -.05, .10))}),
        # Still clutching his throat as he goes down.
        (1.60, {'pelvis': endPelvis, 'lean': -.34, 'pelvisTilt': Add3(base['pelvisTilt'], SLIDE_TILT),
                'bend': base['bend'] + .08, 'twist': -.10, 'head': (.40, -.30, -.20), 'neck': (.10, -.10, 0),
                'ankle.L': alOut, 'legPole.L': poleOut, 'foot.L': (-20, 15, 5), 'handRel.R': base['handRel.R']}),
        (1.64, {'ankle.R': ar}),
        (1.72, {'ankle.R': Add3(ar, (0, .02, .035)), 'shrug': base['shrug'] + .06}),        # twitch 1
        (1.84, {'ankle.R': ar}),
        # The right hand slips off onto his lap.
        (1.95, {'handRel.R': (.10, -.18, -.30), 'poleRel.R': (-.40, .20, -.40), 'palmF.R': (.1, -.5, -.9), 'palmN.R': (0, 0, -1),
                'curl.R': .30}),
        (2.10, {'ankle.L': alOut}),
        (2.18, {'ankle.L': Add3(alOut, (0, -.02, .045)), 'bend': base['bend'] + .11}),       # twitch 2: the out leg kicks
        (2.30, {'ankle.L': alOut, 'bend': base['bend'] + .08, 'handRel.L': base['handRel.L']}),
        (2.50, {'ankle.R': ar}),
        (2.56, {'ankle.R': Add3(ar, (0, .01, .015))}),                                     # twitch 3, smaller
        # The left hand drops off the throat onto the ground beside his thigh, palm up, slack.
        (2.70, {'ankle.R': ar, 'head': (.46, -.34, -.22)}),
        (2.75, {'handRel.L': (-.02, -.10, -.34), 'poleRel.L': (.40, .20, -.40),
                'palmF.L': (-.1, -.3, -.9), 'palmN.L': (0, .3, -1), 'curl.L': .25}),
        (3.20, {'head': (.48, -.34, -.22), 'bend': base['bend'] + .08, 'shrug': 0.0}),
    ]
    return Keys(base, rows, lag={'head': .08, 'neck': .05})


@Builder('CaptiveWallSlideTwitch')
def BuildWallSlide(T, name):
    anim = SlideKeys(T)
    spec = {'pose': lambda t: T.Nest(anim(t)), 'reviewProps': lambda t: [R3_WALL_BOX],
            'kneePlants': [('L', 0, .5), ('R', 0, .5)],
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
        # Starts with the left foot already out beside his right knee (a square stance at this
        # spot stands on it); the half step goes forward from there.
        'ankle.L': [(0.0, Add3(base['ankle.L'], (.12, 0, 0))), (.06, Add3(base['ankle.L'], (.12, 0, 0))),
                    (.13, Add3(base['ankle.L'], (.16, -.06, .05))), (.20, HairHoldPose(T)['ankle.L'])],
        'legPole.L': [(0.0, base['legPole.L']), (.20, HairHoldPose(T)['legPole.L'])],
        'pelvis': [(0.0, base['pelvis']), (.20, Add3(base['pelvis'], (0, -.10, -.04))), (.30, Add3(base['pelvis'], (0, -.13, -.05))),
                   (.44, Add3(base['pelvis'], (0, -.03, -.03))), (1.0, Add3(base['pelvis'], (0, -.05, -.03)))],
        'bend': [(0.0, .08), (.28, .32), (.44, .18), (1.0, .20)],
        'pelvisTilt': [(0.0, (.03, 0, 0)), (.28, (.12, 0, 0)), (1.0, (.06, 0, 0))],
        'twist': [(0.0, 0.0), (.28, .12), (.44, -.05), (1.0, 0.0)],
        'head': [(0.0, (.10, 0, 0)), (.28, (.18, 0, 0)), (.44, (.16, 0, -.05)), (1.0, (.22, 0, 0))],
        'handRel.R': [(0.0, base['handRel.R']), (1.0, HAIR_GRAB_HAND_R)],
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
    # The half step plants the left foot beside his right knee (0.20 m out to the left, the
    # knee turned out), not
    # between his thighs: straddling, the shin clears the kneeling man.
    # Tall over the kneeling man, looking down at him with the arm out to the hair -- stooped
    # (bend .38) his face ended up against the victim's.
    base.update({'ankle.L': Add3(base['ankle.L'], (.20, -.12, 0)), 'legPole.L': Add3(base['legPole.L'], (.25, .05, 0)),
                 'pelvis': Add3(base['pelvis'], (0, -.05, -.03)),
                 'bend': .20, 'pelvisTilt': (.06, 0, 0), 'head': (.22, 0, 0)})
    return base


@Builder('IjaDrawBayonet')
def BuildDrawBayonet(T, name):
    H, P = T.H, T.P
    base = HairHoldPose(T)
    pel = base['pelvis']
    scabbard = (pel[0] + T.R(.13), pel[1] - T.R(.12), pel[2] + T.R(.04))
    # The drawn knife ends exactly where IjaThroatSlash starts it: SlashKnifePath's first key,
    # relative to the victim's throat at the hand-over (IjaDrawBayonet 0.8 s = IjaThroatSlash 0 s).
    path0 = SlashKnifePath(T)[0]
    throat = PartnerPoint(T, 'slashDraw', 'ijaA', 'comrade', 'throat', .8)
    ready = tuple((throat[0] if throat else Vector((0, -T.R(.50), .75))) + Vector(path0[1]))
    drawAxis = Unit((-.20, -.35, .92))
    readyAxis = path0[2]
    keys = [
        (0.00, {}),
        (0.10, {'twist': .03, 'bend': .26}),
        (0.50, {'twist': .02, 'bend': .20}),
        (0.80, {'twist': 0.0, 'bend': .20}),
    ]
    body = Keys(dict(base, **{'handRel.R': HAIR_GRAB_HAND_R}), keys, lag={'head': .05})
    path = [(0.0, (pel[0] - T.R(.20), pel[1] - T.R(.10), pel[2] - T.R(.08))), (.22, scabbard), (.28, scabbard),
            (.42, Add3(scabbard, (0, -T.R(.10), T.R(.24)))), (.60, Add3(ready, (T.R(.06), T.R(.06), T.R(.10)))), (.80, ready)]
    hand = Channel(path)
    axes = Channel([(0.0, drawAxis), (.28, drawAxis), (.42, Unit((-.40, -.55, .73))), (.60, readyAxis), (.80, readyAxis)])

    def BodyAt(t):
        f = body(t)
        # The free right hand (IjaHairGrabPull's last pose) reaches for the handle: the grip
        # target fades in from the free hand over 0.16 s (no pop where the world path takes over).
        if t > 0:     # frame 0 is IjaHairGrabPull's last frame exactly
            f['grip.R'] = hand(t)
            f['gripW.R'] = Smooth(t / .16)
            f['armPole.R'] = SLASH_POLE(T, pel)
        if t >= .16:
            f['handRel.R'] = None
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
                 'mountFrames': {'bayonet': ('Pelvis', 0)},
                 'reviewFrames': lambda n: [0, int(n * .3), int(n * .55), n - 1]})
    return AReview(spec)


HAIR_GRAB_HAND_R = (-.04, -.16, -.42)     # ijaA's free right hand at the end of IjaHairGrabPull


WIPE_SQUAT = [float(v) for v in (__import__('os').environ.get('WIPESQUAT') or '.45,.02,.30').split(',')]   # bend, forward, down


WIPE_STROKE = [float(v) for v in (__import__('os').environ.get('WIPESTROKE') or '.15,.14').split(',')]   # fist to patch, pull


def WIPE_BACK_L(base):
    """ijaA's left foot stepped back and out while the man slides down beside it."""
    return Add3(base['ankle.L'], (.08, .20, 0))
TAUNT_STEP = [float(v) for v in (__import__('os').environ.get('TAUNTSTEP') or '.22,.12,.03,.32').split(',')]


def TauntStance(T):
    """ijaA over the man pinned against the wall (IjaThroatSlash 0.78 s on and its hold loop, and
    IjaWipeSheathBayonet frame 0): the right foot a step in, hips forward, leaning over him."""
    base = HairHoldPose(T)
    step, hips, sink, bend = TAUNT_STEP
    return {'ankle.R': Add3(base['ankle.R'], (0, -step, 0)), 'pelvis': Add3(base['pelvis'], (0, -hips, -sink)),
            'bend': bend, 'head': (.25, 0, .05)}


def SLASH_POLE(T, pel):
    """ijaA's right elbow pole through the draw, the cut, the hold and the wipe's lead-in."""
    return (pel[0] - T.R(.55), pel[1] + T.R(.18), pel[2] + T.R(.08))


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
        # Knife held low at the right hip -- but inside the arm's reach: lower (it was -.28/-.30)
        # the reach assist sank the pelvis 13 cm and pressed his face into the victim's.
        (0.70, (-T.R(.05), T.R(.40), -T.R(.17)), Unit((.30, -.90, -.25))),
        (1.00, (-T.R(.12), T.R(.36), -T.R(.16)), Unit((.30, -.92, -.20))),
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

    # He slams back into the wall with the cut: ijaA follows him in with the right foot and leans
    # over him, the fist pinning the head, for the taunt (TauntStance).
    held = TauntStance(T)
    body = Keys(base, [(0.0, {}), (.08, {'twist': .08, 'bend': .24}), (.24, {'twist': -.08, 'bend': .30}),
                       (.36, {'twist': -.12, 'bend': .26}),
                       (.26, {'ankle.R': base['ankle.R'], 'pelvis': pel}),
                       (.37, {'ankle.R': Add3(Lerp3(base['ankle.R'], held['ankle.R'], .5), (0, 0, .07))}),
                       (.48, {'ankle.R': held['ankle.R'], 'pelvis': held['pelvis']}),
                       (.70, {'twist': -.05, 'bend': held['bend'] - .02, 'head': held['head']}),
                       (1.0, {'twist': 0.0, 'bend': held['bend'], 'head': held['head']})], lag={'head': .05})

    def BodyAt(t):
        f = body(min(t, 1.0))
        shake, breath = Taunt(t) if t > 1.0 else (0.0, 0.0)
        f['bend'] += .015 * breath + .04 * shake
        h = f['head']
        f['head'] = (h[0] - .06 * abs(shake), h[1], h[2] + .05 * math.sin(Tau * (t - 1.0) / 3.0) * (t > 1.0))
        f['handRel.R'] = None
        f['grip.R'] = tuple(Throat(t) + Vector(offs(min(t, 1.0))))
        f['armPole.R'] = SLASH_POLE(T, pel)
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
    spec.update({'props': Props, 'plants': [('R', 0, .26), ('R', .48, 4.0), ('L', 0, 4.0)],
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

    L = WIPE_LEAD

    def Thigh():
        # The dead man's left thigh, the nearest cloth to ijaA's right hand once he sits slumped
        # against the wall (his shoulders are at the wall, over his legs: reaching them put
        # ijaA's body through the legs). The corpse at rest.
        try:
            hit = PartnerPoint(T, 'slashWipe', 'ijaA', 'comrade', 'thighL', L)
        except KeyError:   # partner track dumped before thighL was listed
            hit = None
        return (hit[0] + hit[1] * T.R(.02)) if hit else Vector((0, -T.R(.5), .3))
    sh = Thigh()
    # Frame 0 = IjaThroatSlash's hold: the knife where the cut left it (throat-relative), then low
    # at the hip while he watches.
    throat = PartnerPoint(T, 'slashCut', 'ijaA', 'comrade', 'throat', 1.0)
    held = tuple((throat[0] if throat else Vector((0, -T.R(.50), .75))) + Vector(SlashKnifePath(T)[-1][1]))
    heldAxis = SlashKnifePath(T)[-1][2]
    low = (pel[0] - T.R(.12), pel[1] - T.R(.35), pel[2] - T.R(.10))
    # Last frame = IjaReadyRifle frame 0: right fist on the slung rifle's barrel over the shoulder.
    slung = T.Rifle((.107, .20, P + .16), Unit((-.37, .05, .93)))
    barrel = T.Along(slung, .92)
    barrelPalm = T.Palms(slung['axis'])['R']
    wipeAxis = Unit((-.10, -.60, -.80))
    # A wipe draws the blade back along its own length over the cloth: the fist starts 0.15 m
    # from the thigh patch along the blade and pulls back 0.14 m, so the patch runs from the
    # middle of the blade to near its point.
    startH = tuple(sh - Vector(wipeAxis) * T.R(WIPE_STROKE[0]))
    endH = tuple(sh - Vector(wipeAxis) * T.R(WIPE_STROKE[0] + WIPE_STROKE[1]))
    scabbard = (pel[0] + T.R(.13), pel[1] - T.R(.12), pel[2] + T.R(.04))
    sheathAxis = Unit((.0, .34, -.94))
    shoulderR = (pel[0] - T.R(.20), pel[1] + T.R(.02), P + T.R(.55))
    handPath = Channel([(0.0, held), (.60, low), (L, low), (L + .55, startH), (L + .85, endH),
                        (L + 1.20, (pel[0] - T.R(.05), pel[1] - T.R(.20), pel[2] + T.R(.10))),
                        (L + 1.50, Add3(scabbard, (0, 0, T.R(.20)))), (L + 1.62, scabbard),
                        (L + 1.85, (pel[0] - T.R(.10), pel[1] - T.R(.10), pel[2] + T.R(.15))),
                        (L + 2.25, barrel), (L + 2.40, barrel)])
    axes = Channel([(0.0, heldAxis), (.60, Unit((.30, -.92, -.20))), (L, Unit((.30, -.92, -.20))), (L + .55, wipeAxis),
                    (L + .85, wipeAxis), (L + 1.20, Unit((.2, -.5, -.8))), (L + 1.50, sheathAxis), (L + 2.40, sheathAxis)])
    # The victim's left shoulder is in front of his right hand: he drops his hips a little over
    # to the right and bends in so the right hand draws the blade across it within reach.
    held = TauntStance(T)
    body = Keys(base, [(0.0, {'bend': held['bend'], 'twist': 0.0, 'head': held['head'], 'ankle.R': held['ankle.R'],
                              'pelvis': held['pelvis']}),
                       # Lets go, straightens a little over him and watches him go down the wall; the left
                       # foot (by his right knee) steps back out of the way of the body slumping onto it.
                       # Both feet come back out of the way of the body slumping in front of them.
                       (.25, {'ankle.L': base['ankle.L'], 'ankle.R': held['ankle.R'], 'pelvis': held['pelvis']}),
                       (.40, {'ankle.L': Add3(Lerp3(base['ankle.L'], WIPE_BACK_L(base), .5), (0, 0, .07))}),
                       (.50, {'bend': .18, 'twist': -.04, 'head': (.30, 0, .02)}),
                       (.55, {'ankle.L': WIPE_BACK_L(base)}),
                       (.62, {'ankle.R': Add3(Lerp3(held['ankle.R'], base['ankle.R'], .5), (0, 0, .07))}),
                       (.78, {'ankle.R': base['ankle.R'], 'pelvis': pel}),
                       (1.60, {'bend': .20, 'twist': -.06, 'head': (.42, 0, -.04)}),
                       (2.60, {'bend': .19, 'twist': -.05, 'head': (.44, 0, -.06)}),
                       (L, {'bend': .20, 'twist': -.04, 'head': (.40, 0, -.06)}),
                       # Squats rather than stoops over the corpse's legs, trunk fairly upright, and draws the
                       # blade across the left shoulder.
                       (L + .55, {'bend': WIPE_SQUAT[0], 'pelvis': Add3(pel, (-.04, -WIPE_SQUAT[1], -T.R(WIPE_SQUAT[2]))), 'head': (.40, 0, -.10), 'twist': -.06}),
                       (L + .85, {'bend': WIPE_SQUAT[0] - .03, 'twist': -.04, 'pelvis': Add3(pel, (-.04, -WIPE_SQUAT[1] + .02, -T.R(WIPE_SQUAT[2] - .02)))}),
                       # Straightens to sheathe.
                       (L + 1.30, {'bend': .20, 'twist': .08, 'pelvis': Add3(pel, (0, .02, -.03)), 'head': (.10, 0, .05)}),
                       (L + 1.40, {'ankle.L': WIPE_BACK_L(base)}),
                       (L + 1.52, {'ankle.L': Add3(Lerp3(base['ankle.L'], WIPE_BACK_L(base), .5), (0, 0, .07))}),
                       (L + 1.65, {'ankle.L': base['ankle.L']}),
                       (L + 1.62, {'twist': .26, 'bend': .26}),
                       (L + 2.40, {'twist': -.05, 'bend': .12, 'head': (.05, 0, -.10), 'pelvis': pel})], lag={'head': .05})
    ready = HairHoldPose(T)

    def BodyAt(t):
        f = body(t)
        f['handRel.R'] = None
        f['grip.R'] = handPath(t)
        # The elbow hands over from the cut's pole to the reach for the barrel.
        w = Smooth((t - (L + 1.85)) / .40)
        f['armPole.R'] = Lerp3(SLASH_POLE(T, pel), (-(T.SX + .50), .20, P + .25), w)
        if t < L + 1.62:
            pf, pn = KnifePalm(Unit(axes(t)))
            f['palmF.R'], f['palmN.R'], f['curl.R'] = pf, pn, 1.1
        elif t < L + 2.25:
            f['palmF.R'], f['palmN.R'], f['curl.R'] = (0, .3, 1), (1, 0, 0), .8
        else:
            f['palmF.R'], f['palmN.R'], f['curl.R'] = barrelPalm[0], barrelPalm[1], .95
        return f
    # The left fist is still in his hair at frame 0 and lets go at once.
    spec = AttackerSpec(T, 'slashWipe', 'ijaA', 'comrade', {'L': [(0.0, .05, 'crown', .03, (0, 1, -.3), 1.1)]}, BodyAt, L + 2.4)
    baseCheck = spec['check']
    props, review = SlungProps(T)

    def KnifeAt(t):
        return HandKnife(T, axes(t)) if t < L + 1.62 else ScabbardKnife(T)

    def BladeCheck(t):
        # Distance from the posed blade (origin -> tip) to the thigh patch.
        knife = HandKnife(T, axes(t))
        o, tip = Vector(knife['origin']), Vector(knife['tip'])
        d = tip - o
        u = Clamp((Vector(sh) - o).dot(d) / max(d.length_squared, 1e-9))
        gap = Vector(sh) - (o + d * u)
        return tuple(Vector(T.K['GripPoint']('R')) + gap)

    def Props(t):
        out = props(t)
        out['bayonet'] = KnifeTrack(KnifeAt(t))
        return out
    spec.update({'props': Props, 'plants': [('R', 0, .55), ('R', .78, L + 2.4),
                                            ('L', 0, .25), ('L', .55, L + 1.40),
                                            ('L', L + 1.65, L + 2.4)],
                 # The blade on the trouser leg while it wipes (L + 0.55-0.85 s): the check reads the
                 # distance from the blade (the posed knife) to the thigh patch, as a target that far
                 # from the fist.
                 'check': lambda t: dict(baseCheck(t), **({'R': BladeCheck(t)} if L + .55 <= t <= L + .85 else {})),
                 'reviewProps': lambda t: review(t) + KnifeProps(KnifeAt(t)) + PartnerGhost(T, 'slashWipe', 'ijaA', 'comrade', t)
                 + [('point', tuple(sh), None, .03)],
                 'reviewFrames': lambda n: [0, int(n * .06), int(n * .4), int(n * .67), int(n * .72), int(n * .86), n - 1]})
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


def _BeamPoses(scale=.9128):
    """The beam's three key states in IjaKickBeam's root frame, RUNTIME metres (three.js actor
    frame: +x right, +y up, -z forward; ijaA stands at the root facing -z). Same numbers the
    `beam` track of IjaKickBeam starts and ends on; 'nudged' is BayonetClearWood's 12 deg swing
    about the far (splintered) end."""
    def R(p):
        return [round(-p[0] * scale, 3), round(p[2] * scale, 3), round(p[1] * scale, 3)]

    def D(v):
        n = math.sqrt(sum(c * c for c in v))
        return [round(-v[0] / n, 4), round(v[2] / n, 4), round(v[1] / n, 4)]

    def Yaw(v, a):
        c, s_ = math.cos(a), math.sin(a)
        return (v[0] * c - v[1] * s_, v[0] * s_ + v[1] * c, v[2])
    c, a = BEAM_PINNED
    n = math.sqrt(sum(x * x for x in a))
    a = tuple(x / n for x in a)
    half = .775 / scale
    far = (c[0] + a[0] * half, c[1] + a[1] * half, c[2] + a[2] * half)
    a12 = Yaw(a, math.radians(12))
    nudged = (far[0] - a12[0] * half, far[1] - a12[1] * half, c[2])
    kicked = (c[0] - .28, c[1] - .42, c[2])
    return {'pinned': {'centre': R(c), 'axis': D(a)}, 'nudged': {'centre': R(nudged), 'axis': D(a12)},
            'kicked': {'centre': R(kicked), 'axis': D(Yaw(a, .9))},
            'frame': 'IjaKickBeam root (ijaA), runtime metres; axis = the long (+X model) axis, splintered end at +axis'}


PROPS['beam']['poses'] = _BeamPoses()


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
     events=[{'t': 1.8, 'kind': 'shake'}, {'t': 2.45, 'kind': 'glanceRight'}, {'t': 3.0, 'kind': 'shake'}],
     prev=['IjaDragByForearm', 'IjaButtStrike'], next=['IjaStartleTurn', 'IjaParriedChoppedFall'],
     notes='SB05 (2026-09-25): squats in front of Shunzi, fists the front of his jacket and hauls him up until his eye '
           'is 0.73 m off the ground (player head); the head is up and pushed forward and the face stays on Shunzi\'s '
           'eye (head aimed at the player head track; the helmet brim does not cover it) except one glance to his '
           'right at the interpreter (2.2-2.9 s). 0.8-3.8 s is a seamless hold loop with two shakes.')
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
CHOP_WALL_X = float(__import__('os').environ.get('CHOPWALL') or .745)   # trench wall on ijaB's left (source metres)
CHOP_END = [float(v) for v in (__import__('os').environ.get('CHOPEND') or '.40,.51,.455,.22,-.1,-.1,.34,.51').split(',')]
Meta('IjaChoppedFallWall', 2.2, False, 'track', role='ijaB', rig='LugouIja01', props=['weapon'], rootMotion=True,
     stage='chopRear', env={'wallLeftM': round(CHOP_WALL_X * .9213, 2)}, terminal=True,
     contacts=[{'t': .45, 'by': 'luo', 'part': 'neckSideR', 'action': 'cut'},
               {'t': .92, 'limb': 'shoulderL', 'action': 'hit', 'target': 'wall', 'untilT': 2.2}],
     events=[{'t': .45, 'kind': 'bloodSpray', 'at': 'neckSideR'}, {'t': .50, 'kind': 'weaponLost'}, {'t': 2.2, 'kind': 'dead'}],
     prev=['IjaBayonetGuard', 'IjaReadyRifle'], next=[],
     notes='Aiming down at Shunzi when the blade lands: neck snaps away, the rifle drops out of his hands, he '
           'staggers left into the trench wall, left shoulder first, and slides down it into a sit on the ground, '
           'the left shoulder and head against the wall, legs out, arms slack. Frame 0 is his aim; last frame is '
           'the corpse.')
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
     prev=['IjaStartleTurn', 'IjaHoldCollarUp'], next=[],
     notes='Comes up spinning left and swinging the rifle off his shoulder at the man behind him; the muzzle is beaten '
           'aside, the cut drops him beside Shunzi. Last frame is the corpse. Frame 0 is IjaStartleTurn\'s last frame '
           '(collar already let go, head and shoulders turned to his left rear); from IjaHoldCollarUp it is a blend.')
Meta('LuoDragToCover', 2.6, False, 'free', role='luo', rig='LugouNra05', rootMotion=True, player=True, weapon='Dadao',
     weaponState='dadaoInBelt',
     contacts=[{'t': .30, 'limb': 'handsLR', 'action': 'grab', 'partnerRole': 'shunzi', 'part': 'collarBackAndStrap'},
               {'t': 2.30, 'limb': 'handsLR', 'action': 'release'}],
     prev=['LuoDadaoChopRear'], next=['LuoKneelCheck'],
     notes='Crouches, fists the back of the collar and the pack strap, and hauls Shunzi backwards 1.4 m behind the '
           'collapsed earth (first-person: Shunzi is the dragged one; `player` gives his collar).')
Meta('HeSwapDadaoRifle', 1.6, False, 'track', role='heyoutian', rig='LugouNra02', props=['weapon', 'rifle'], rootMotion=False,
     events=[{'t': .45, 'kind': 'dadaoPlanted'}, {'t': .90, 'kind': 'switchWeapon', 'to': 'HanYang'}],
     endHold='twoHand', weaponState='dadao->planted',
     prev=['HeDadaoParryChop'], next=[],
     notes='Backs into the cover, drives the dadao point-down into the earth, pulls the rifle off his back over the '
           'right shoulder and comes up at low ready. `weapon` = the dadao (planted), `rifle` = the rifle. At the '
           'last frame the director calls DropOpeningWeapon(soldier, "HeSwapDadaoRifle") (the dadao stays planted in '
           'the world) and then SetWeapon("HanYang") (his rifle; the `rifle` prop hides with the next clip).')
Meta('LuoKneelCheck', 3.4, False, 'free', role='luo', rig='LugouNra05', rootMotion=False, player=True, holdLoop=[.9, 2.6],
     holdExit='pose.holdUntil: the loop lets go at that clip time and plays on through the 2.6-3.4 s release and rise',
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


HOLD_EYE = (0, -.14, .20)          # Shunzi's eye from his front collar while he is held up: the head pulls back (source m)


def HoldCollarPath():
    """Shunzi's front collar in ijaA's frame (source m) through IjaHoldCollarUp: lying (0.26 m), hauled up
    to 0.55 m (eye 0.73 m) at 0.8 s, two shakes in the hold loop."""
    return Channel([(0.0, (.04, -.66, .28)), (.35, (.04, -.66, .28)), (.80, (.04, -.56, .60)), (1.8, (.04, -.56, .60)),
                    (1.86, (.05, -.53, .63)), (1.94, (.03, -.57, .59)), (2.02, (.04, -.56, .60)), (3.0, (.04, -.56, .60)),
                    (3.06, (.05, -.53, .63)), (3.14, (.03, -.57, .59)), (3.22, (.04, -.56, .60)), (3.8, (.04, -.56, .60))])


def HoldCollarBase(T):
    """ijaA squatting close in front of the held man: trunk up, chin pushed forward (the hold-loop pose)."""
    base = Squat(T, .85)
    base.update({'bend': .30, 'neck': (.12, 0, 0), 'head': (-.10, 0, 0), 'shrug': 0.0, 'twist': 0.0, 'lookW': 1.0,
                 'handRel.R': (-.05, -.30, -.35), 'palmF.R': (0, -.6, -.8), 'palmN.R': (0, 0, -1), 'curl.R': .6,
                 'handRel.L': (.06, -.14, -.45), 'palmF.L': (0, -.2, -1), 'palmN.L': (-1, 0, 0), 'curl.L': .7})
    return base


def PlayerHands(f, t, grips):
    """Hands on the first-person player's body points. grips: {side: [(t0, t1, path, normal, down, curl)]}; a
    hand eases onto a window and off it over 0.18 s (PlayerGripSpec with the patch normal per row).
    Returns {side: target} for the windows the hand is fully on (the bake's contact check)."""
    out = {}
    for side, rows in grips.items():
        for t0, t1, path, normal, down, curl in rows:
            if not (t0 - .18 <= t <= t1 + .18):
                continue
            w = 1.0 if t0 <= t <= t1 else Smooth(1 - (t0 - t) / .18) if t < t0 else Smooth(1 - (t - t1) / .18)
            if w <= 1e-4:
                continue
            point = tuple(path(Clamp(t, t0, t1)))
            palmF, palmN, _ = Grab(normal, down)
            f['grip.' + side], f['gripW.' + side] = point, w
            f['palmF.' + side], f['palmN.' + side], f['curl.' + side] = palmF, palmN, curl
            f['handRel.' + side] = f.get('handRel.' + side) or (.06 if side == 'L' else -.06, -.14, -.45)
            if t0 <= t <= t1:
                out[side] = point
            break
    return out


COLLAR_NORMAL = (0, .75, .65)      # the front of a jacket facing the man who holds it (his +Y, up)


def FirstPersonView(eye, target, fov=65.0, roll=0.0, name='sb'):
    """A storyboard review camera at the first-person player's eye (a function of t) looking at `target`."""
    return (name, eye, target, fov, roll)


@Builder('IjaHoldCollarUp')
def BuildHoldCollarUp(T, name):
    base = HoldCollarBase(T)
    collar = HoldCollarPath()
    head = lambda t: tuple(Vector(collar(t)) + Vector(HOLD_EYE))
    # 0-0.8 s: stoops and hauls (looking at him the whole time), then the hold: trunk up, face on him; one
    # glance to his right at the interpreter (SB05 layout: the interpreter squats at Shunzi's left).
    body = Keys(base, [(0.0, {'bend': .55, 'lookW': .8}), (.35, {'bend': .62}), (.80, {'bend': .30, 'lookW': 1.0}),
                       (2.20, {'lookW': 1.0, 'head': (-.10, 0, 0)}), (2.45, {'lookW': .30, 'head': (.02, 0, -.50)}),
                       (2.75, {'lookW': .30}), (3.00, {'lookW': 1.0, 'head': (-.10, 0, 0)}), (3.8, {'bend': .30, 'lookW': 1.0})],
                lag={'head': .05})
    grips = {'L': [(.35, 3.8, collar, COLLAR_NORMAL, (0, .3, -1), 1.15)]}

    def Pose(t):
        f = body(t)
        f['look'] = head(t)
        PlayerHands(f, t, grips)
        return T.Nest(f)
    props, review = SlungProps(T, 'side')
    spec = {'pose': Pose, 'props': props, 'plants': [('L', 0, 3.8), ('R', 0, 3.8)],
            'check': lambda t: PlayerHands({}, t, grips), 'player': lambda t: {'collar': collar(t), 'head': head(t)},
            'look': lambda t: head(t) if body(t)['lookW'] >= .99 else None,
            'reviewProps': lambda t: review(t) + [('point', collar(t), None, .03)] + ShunziGhost(collar(t)),
            'reviewFrames': lambda n: [0, int(n * .1), int(n * .22), int(n * .5), int(n * .65), n - 1]}
    spec = AReview(spec)
    spec['reviewViews'].append(FirstPersonView(head, (0, -.25, 1.05)))
    return spec


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
    wallX = CHOP_WALL_X
    # Sitting at the foot of the wall: hips on the ground a hand's width off it, the trunk leaning
    # over onto the left shoulder, the head fallen against the wall, legs out in front.
    # (CHOP_END: seat, 1.4 s and 1.8 s pelvis distances from the wall, end lean, end head roll.)
    seat = (wallX - CHOP_END[0], -.16, .13)
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
        # Legs go: he slides down the wall, the shoulder riding on it.
        # The shoulder rides down the wall: the hips stay under it while the knees give.
        (1.15, {'pelvis': (wallX - CHOP_END[7], -.20, P - .45), 'lean': CHOP_END[6], 'bend': .34}),
        (1.40, {'pelvis': (wallX - CHOP_END[1], -.19, .50), 'bend': .38, 'lean': .30, 'head': (.35, .30, .25)}),
        (1.80, {'pelvis': (wallX - CHOP_END[2], seat[1], .22), 'pelvisTilt': (-.20, .15, -.30), 'bend': .30, 'lean': .34,
                'head': (.30, .18, .10), 'neck': (.10, .12, .10), 'shrug': .10,
                'ankle.L': (seat[0] + .10, -.80, A), 'ankle.R': (seat[0] - .22, -.72, A), 'foot.L': (-10, 25, 10), 'foot.R': (-10, -20, -10),
                'legPole.L': (seat[0] + .45, -.8, .9), 'legPole.R': (seat[0] - .55, -.8, .9)}),
        # Dead: the seat on the ground, the left shoulder and the side of the head against the wall,
        # legs out in front and falling open, arms slack.
        (2.20, {'pelvis': seat, 'pelvisTilt': (-.26, .18, -.30), 'bend': .30, 'lean': CHOP_END[3], 'head': (.30, CHOP_END[4], CHOP_END[5]),
                'neck': (.12, .15, .10), 'shrug': 0.0,
                'ankle.L': (seat[0] + .16, -.92, A), 'ankle.R': (seat[0] - .26, -.84, A), 'foot.L': (-20, 30, 15), 'foot.R': (-20, -30, -15)}),
    ]
    anim = Keys(base, rows, lag={'head': .04, 'neck': .03})
    hands = Keys({'handRel.R': (-.10, -.20, -.42), 'handRel.L': (.10, -.10, -.45)}, [(0.0, {}), (.6, {}),
                  (1.2, {'handRel.L': (.12, .02, -.22)}), (1.8, {'handRel.L': (.12, -.04, -.40)}),
                  (2.2, {'handRel.R': (-.04, -.24, -.44), 'handRel.L': (.12, -.06, -.46)})])

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
            if t < .64:
                # The hands open off the rifle over 0.14 s (they do not snap to the new pose).
                r = rifle0
                f['grip.R'], f['grip.L'] = r['gripR'], r['gripL']
                f['gripW.R'] = f['gripW.L'] = 1 - Smooth((t - .50) / .14)
                f['armPole.R'] = (-(SX + .45), .10, T.SZ - .35)
                f['armPole.L'] = (SX + .30, -.40, T.SZ - .60)
        return T.Nest(f)

    spec = {'pose': Pose, 'props': lambda t: {'weapon': T.Track(RifleAt(t))}, 'plants': [('L', 0, .50), ('R', 0, .62), ('L', .62, 1.40), ('R', .92, 1.40)],  # feet slide out as he sits down (1.4-1.8 s)
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
    # Frame 0 = IjaStartleTurn's last frame (2026-09-25): the collar is already let go and the head
    # and shoulders are turned to his left rear; the spin below takes over from there. Only the first
    # 0.45 s changed (the rifle, pelvis and turn keys, and so the parry and the cut, are as before).
    hold = StartleEnd(T)
    hold['turn'] = 0.0
    spin = 2.6                                      # turns left ~150 deg onto the man behind him
    rows = [
        (0.00, {}),
        (0.10, {'head': (.0, 0, .80)}),
        (0.30, {'pelvis': (.02, .12, P - .22), 'pelvisTilt': (.15, 0, 0), 'bend': .20, 'turn': spin * .55,
                'ankle.L': (H + .10, .12, A), 'ankle.R': (-(H + .02), -.06, A), 'head': (.05, 0, .35),
                'twist': .20, 'neck': (0, 0, .05), 'shrug': 0.0}),
        # Spun round in a deep crouch with the rifle low: the hips stay down (a braced, sprung
        # stance), so the hands keep the rifle without the reach assist and nothing pops up
        # when the grip lets go at the cut.
        (0.45, {'pelvis': (.02, .20, P - .27), 'turn': spin * .92, 'ankle.R': (-(H - .10), .10, A), 'twist': 0.0,
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
# 2026-09-25 storyboard round (docs/Data_FirstLevelStoryboard0103Contract.md §4.1): the Notion
# storyboards SB03A, SB04, SB04A, SB05 and SB05A. Shunzi is the first-person player; every
# clip that touches him carries his body points (`player`: collar / head / forearmR, runtime
# metres in the actor frame, 12 samples/s) and aims ijaA's face at his eye (`look`).
# =================================================================================
def RotX(v, deg):
    """v turned about the character's left axis (+X): + = the top goes forward (over the head)."""
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return (v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c)


def RifleByHand(T, hand, dirButt, along=.62):
    """Rifle held in one fist `along` real metres from the butt plate (the handguard, its balance);
    dirButt = fist -> butt."""
    d = Vector(dirButt).normalized()
    return T.RifleFromButt(tuple(Vector(hand) + d * T.R(along)), tuple(-d))


def ShunziGhost(collar):
    """Stick body of the half-lying first-person player for the review stills: trunk and legs only (no head
    sphere -- the storyboard camera sits in his eye)."""
    c = Vector(collar)
    hips = c + Vector((0, .55, -.10))
    feet = hips + Vector((0, .80, -.12))
    return [('cyl', tuple(c), tuple(hips), .07), ('cyl', tuple(hips), tuple(feet), .05)]


def ClubUp(axis):
    """The rifle's sight side while it is swung like a club: axis x (+X), continuous through vertical
    (the grip palms and the prop track would flip where a world-up reference goes parallel)."""
    u = Vector(axis).normalized().cross(Vector((1, 0, 0)))
    return tuple(u.normalized()) if u.length > 1e-5 else (0.0, 0.0, 1.0)


def ClubPalm(axis, up):
    """Right fist round the handguard of a rifle held like a club (fingers across, palm on the wood)."""
    a, u = Vector(axis).normalized(), Vector(up).normalized()
    fingers = -(a.cross(u)).normalized()
    normal = -(fingers.cross(a)).normalized()
    return tuple(fingers), tuple(normal)


def DirChannel(keys):
    """Directions keyed per time, interpolated component-wise (PCHIP) and normalised: keys must be less
    than ~60 deg apart (no collapse through zero)."""
    ch = Channel([(t, tuple(Vector(d).normalized())) for t, d in keys])
    return lambda t: Unit(ch(t))


# -- SB04 IjaButtStrikeCollar ------------------------------------------------------------
# Shunzi half-lies on his back, propped, feet toward ijaA; ijaA squats astride his legs, left fist in his
# collar. He swings the rifle up butt-first over the top and holds it high one-handed, choked up to the
# wrist of the stock, the butt aimed down at Shunzi's face and the barrel standing up behind his right
# shoulder (apex, hold loop) -- from Shunzi's eye the butt is in the upper left (SB04). He cocks it and
# drives the butt down onto the forehead. The storyboard camera is Shunzi's eye (player `head`, ~0.40 m
# high) looking up ~30-38 deg: the face is up and toward it the whole clip.
BUTT_STANCE = {'pelvis': (0, .06, .32), 'pelvisTilt': (.32, 0, 0), 'bend': .75}   # deep squat: the collar is in reach without the reach assist
BUTT_LOW_HAND, BUTT_LOW_DIR = (-.45, -.30, .45), (-.10, .90, .40)     # low carry: fist at the knee, butt behind the hip
# Apex (SB04): the fist high over his right shoulder, the butt aimed forward-down at Shunzi's face.
BUTT_APEX_HAND, BUTT_APEX_DIR = (-.30, -.32, 1.20), (.06, -.63, -.77)   # the fist clear of the helmet on screen
BUTT_WIND_DIR = (-.10, -.75, -.45)        # cocked: the butt pulled up a little before the blow
BUTT_HIT_DIR = (.05, -.45, -.89)          # the blow: the butt driven down onto the forehead
# Where the fist holds the rifle (real metres from the butt plate): the handguard in the low carry, choked
# up to the wrist of the stock for the blow (the rifle slides through the fist on the way up and down).
BUTT_GRIP = Channel([(0.0, .62), (.20, .62), (.46, .42), (1.55, .42), (1.95, .62), (51 / 24, .62)])
# The butt goes over the top (fist -> butt, keys <= 52 deg apart for DirChannel), both ways.
BUTT_OVER = [(-.18, .40, .90), (-.18, -.25, .95), (-.15, -.85, .40), (-.12, -.95, -.20)]
BUTT_HIT_T = 33 / 24          # the butt on the head (a baked frame)
BUTT_T = 51 / 24               # durations are whole frames: every key time above is then a baked frame


def ButtCollarPaths():
    # The fist is in the front of his jacket at the breastbone (named `collar` like every other front grip);
    # his eye is 0.3 m further on, so ijaA's face is ~0.7 m from the camera (SB04's framing).
    collar = Channel([(0.0, (.04, -.62, .34)), (.20, (.04, -.62, .34)), (.55, (.04, -.60, .39)), (1.05, (.04, -.60, .39)),
                      (1.125, (.04, -.61, .37)), (1.30, (.04, -.585, .42)), (BUTT_HIT_T, (.04, -.58, .43)),
                      (1.50, (.04, -.63, .35)), (1.70, (.04, -.64, .33)), (BUTT_T, (.04, -.64, .33))])
    # his eye from the grip: propped on his elbows, then knocked back and down by the butt
    eyeFrom = Channel([(0.0, (0, -.28, .12)), (BUTT_HIT_T, (0, -.28, .12)), (1.47, (0, -.32, .05)), (BUTT_T, (0, -.31, .07))])
    head = lambda t: tuple(Vector(collar(t)) + Vector(eyeFrom(t)))
    return collar, head


def ButtStrikeParts(T):
    """Everything IjaButtStrikeCollar and IjaDragByForearm share (the drag starts on the strike's last frame)."""
    if 'buttStrike' in T.cache:
        return T.cache['buttStrike']
    H, A = T.H, T.A
    collar, head = ButtCollarPaths()
    hitButt = Vector(head(BUTT_HIT_T)) + Vector((0, .05, .07))           # the forehead, in front of the eye
    hitDir = Unit(BUTT_HIT_DIR)
    hitHand = tuple(hitButt - Vector(hitDir) * T.R(BUTT_GRIP(BUTT_HIT_T)))
    base = Standing(T)
    base.update({'pelvis': BUTT_STANCE['pelvis'], 'pelvisTilt': BUTT_STANCE['pelvisTilt'], 'bend': BUTT_STANCE['bend'],
                 'neck': (-.15, 0, 0), 'head': (-.20, 0, 0), 'lookW': 1.0,
                 # astride his legs: feet wide, knees out
                 'ankle.L': (H + .17, -.10, A), 'ankle.R': (-(H + .17), .12, A), 'foot.L': (0, 18, 0), 'foot.R': (0, -18, 0),
                 'legPole.L': (H + .60, -1.0, .70), 'legPole.R': (-(H + .60), -1.0, .70),
                 'armPole.L': (.65, -.20, .30), 'handRel.L': (.08, -.30, -.30)})
    body = Tracks(base, {
        'pelvis': [(0.0, (0, .06, .32)), (.55, (0, .07, .36)), (1.05, (0, .07, .36)), (1.125, (0, .08, .37)),
                   (BUTT_HIT_T, (0, .03, .31)), (1.60, (0, .05, .32)), (BUTT_T, (0, .06, .32))],
        'bend': [(0.0, .75), (.55, .62), (1.05, .62), (1.125, .58), (BUTT_HIT_T, .86), (1.60, .78), (BUTT_T, .75)],
        'pelvisTilt': [(0.0, (.32, 0, 0)), (.55, (.28, 0, .05)), (1.05, (.28, 0, .05)), (BUTT_HIT_T, (.36, 0, -.03)), (BUTT_T, (.32, 0, 0))],
        'twist': [(0.0, 0.0), (.55, -.18), (1.05, -.18), (1.125, -.24), (BUTT_HIT_T, .10), (1.60, .02), (BUTT_T, 0.0)],
        'shrug': [(0.0, 0.0), (.55, .10), (1.05, .10), (BUTT_HIT_T, .18), (BUTT_T, 0.0)],
        'armPole.R': [(0.0, (-.70, -.20, .55)), (.55, (-.75, .05, 1.10)), (1.05, (-.75, .05, 1.10)), (BUTT_HIT_T, (-.70, -.30, .90)),
                      # letting the rifle down past shoulder height the fist goes out to his right, where the
                      # elbow pole was: the elbow is held back/up meanwhile (it flipped over in one frame at 1.96 s)
                      (1.75, (-.72, -.10, .95)), (1.88, (-.55, .35, .90)), (2.02, (-.62, .15, .55)), (BUTT_T, (-.70, -.20, .55))],
    })
    windHand = Add3(BUTT_APEX_HAND, (-.02, .08, -.03))      # cocked back (the apex fist is already near full reach)
    # the rifle is up by 0.48 s: the hand's rate limit settles on the apex before the hold loop starts (seam)
    hand = Channel([(0.0, BUTT_LOW_HAND), (.20, Add3(BUTT_LOW_HAND, (0, 0, .03))), (.35, (-.34, -.24, .98)), (.48, BUTT_APEX_HAND),
                    (.55, BUTT_APEX_HAND),
                    (1.05, BUTT_APEX_HAND), (1.125, windHand), (1.25, Lerp3(windHand, hitHand, .55)),
                    (BUTT_HIT_T, hitHand), (1.50, Add3(hitHand, (-.03, .05, .04))), (1.70, (-.26, -.26, 1.12)),
                    (1.88, (-.36, -.26, .85)), (2.05, BUTT_LOW_HAND), (BUTT_T, BUTT_LOW_HAND)])
    o1, o2, o3, o4 = BUTT_OVER
    # up: the butt swings from behind his hip over the top and forward; back down: the same arc reversed
    rifleDir = DirChannel([(0.0, BUTT_LOW_DIR), (.20, BUTT_LOW_DIR), (.28, o1), (.35, o2), (.40, o3), (.44, o4), (.48, BUTT_APEX_DIR), (.55, BUTT_APEX_DIR),
                           (1.05, BUTT_APEX_DIR), (1.125, BUTT_WIND_DIR), (BUTT_HIT_T, BUTT_HIT_DIR), (1.50, (0, -.55, -.83)),
                           (1.62, o4), (1.72, o3), (1.82, o2), (1.94, o1), (2.05, BUTT_LOW_DIR), (BUTT_T, BUTT_LOW_DIR)])

    def DirAt(t):
        return rifleDir(t)

    def Tremor(t):
        # the apex hold: the fist trembles with the effort (two cycles per loop, zero at both seams)
        if .55 < t < 1.05:
            s = math.sin(Tau * 2 * (t - .55) / .5)
            return (.004 * s, 0, .006 * math.sin(Tau * (t - .55) / .5))
        return (0, 0, 0)

    def RifleAt(t):
        return RifleByHand(T, Add3(hand(t), Tremor(t)), DirAt(t), BUTT_GRIP(t))
    parts = {'base': base, 'body': body, 'collar': collar, 'head': head, 'rifle': RifleAt, 'hitButt': tuple(hitButt),
             'hand': lambda t: Add3(hand(t), Tremor(t)), 'grip': BUTT_GRIP}
    T.cache['buttStrike'] = parts
    return parts


def ClubGrip(f, T, rifle, along=.62):
    """Right fist round a club-held rifle, `along` real metres from the butt plate (the handguard by default)."""
    up = ClubUp(rifle['axis'])
    palmF, palmN = ClubPalm(rifle['axis'], up)
    f['grip.R'] = T.Along(rifle, along)
    f['palmF.R'], f['palmN.R'], f['curl.R'] = palmF, palmN, 1.0
    f['handRel.R'] = None
    return up


Meta('IjaButtStrikeCollar', BUTT_T, False, 'track', role='ijaA', rig='LugouIja02', props=['weapon'], rootMotion=False,
     weaponState='clubRight', player=True, holdLoop=[.55, 1.05],
     holdExit='pose.holdUntil: the apex loop lets go at that clip time; 1.05-1.125 s wind-up, butt on the head at 1.375 s',
     contacts=[{'t': 0.0, 'limb': 'handL', 'action': 'hold', 'partnerRole': 'shunzi', 'part': 'collar'},
               # the butt lands on his forehead: playerOffsetM from the player 'head' point (his eye) in the
               # actor frame, runtime metres (ButtStrikeParts hitButt: source (0, .05, .07) x IJA02 scale 0.913)
               {'t': BUTT_HIT_T, 'limb': 'butt', 'action': 'strike', 'partnerRole': 'shunzi', 'part': 'head',
                'playerOffsetM': [0.0, .064, .046]}],
     events=[{'t': .55, 'kind': 'apex'}, {'t': 1.125, 'kind': 'windUp'},
             {'t': BUTT_HIT_T, 'kind': 'buttHit', 'fact': 'playerStruck'}],
     prev=['CollarDrag', 'IjaKickBeam'], next=['IjaDragByForearm'],
     notes='SB04: squats astride Shunzi\'s legs, left fist in his collar (player collar), and swings the rifle up one-handed, '
           'butt first over the top, sliding his fist from the handguard up to the wrist of the stock (0.42 m from the butt '
           'plate): fist high over his right shoulder, butt aimed down at Shunzi\'s face, barrel up behind him (apex 0.55 s; '
           'from Shunzi\'s eye the butt is upper left). 0.55-1.05 s is a seamless hold loop (the fist trembles); the '
           'director lets go with pose.holdUntil (hold at least 0.4 s). Cocks to 1.125 s and drives the butt down onto the '
           'forehead (buttHit 1.375 s, player head + playerOffsetM), swings it back over the top and ends in the low carry '
           '(fist on the handguard at the knee, muzzle forward-down to his right). '
           'Face up and on Shunzi\'s eye throughout (look = player head). Last frame = IjaDragByForearm frame 0.')


@Builder('IjaButtStrikeCollar')
def BuildButtStrikeCollar(T, name):
    parts = ButtStrikeParts(T)
    body, collar, head, RifleAt = parts['body'], parts['collar'], parts['head'], parts['rifle']
    grips = {'L': [(0.0, BUTT_T, collar, COLLAR_NORMAL, (0, 0, -1), 1.1)]}

    def Pose(t):
        f = body(t)
        f['look'] = head(t)
        PlayerHands(f, t, grips)
        ClubGrip(f, T, RifleAt(t), BUTT_GRIP(t))
        return T.Nest(f)

    def Check(t):
        out = PlayerHands({}, t, grips)
        out['R'] = T.Along(RifleAt(t), BUTT_GRIP(t))
        return out

    def Probes(t):
        if abs(t - BUTT_HIT_T) < .021:
            return {'buttOnHead': (RifleAt(t)['butt'], parts['hitButt'])}
        return None
    spec = {'pose': Pose, 'check': Check, 'probes': Probes, 'plants': [('L', 0, BUTT_T), ('R', 0, BUTT_T)],
            'props': lambda t: {'weapon': (RifleAt(t)['origin'], RifleAt(t)['axis'], ClubUp(RifleAt(t)['axis']), True)},
            'player': lambda t: {'collar': collar(t), 'head': head(t)},
            'look': head,
            'reviewProps': lambda t: T.RifleProps(RifleAt(t)) + [('point', collar(t), None, .03)]
            + ShunziGhost(collar(t)),
            'reviewFrames': lambda n: [0, 13, 24, 27, 30, 33, 42, n - 1]}
    spec = AReview(spec)
    # the storyboard camera: Shunzi's eye, pitched up 32 deg toward ijaA (SB04 30-38 deg), rolled -4 deg
    spec['reviewViews'].append(FirstPersonView(head, lambda t: Add3(head(t), (-.10, .91, .41)), roll=-4.0))
    return spec


# -- SB04A IjaDragByForearm --------------------------------------------------------------
DRAG_T = 63 / 24
DRAG_DIST = Channel([(0.0, 0.0), (.40, 0.0), (.65, .10), (2.10, 2.05), (2.40, 2.19), (DRAG_T, 2.19)])   # source m along +Y
DRAG_GRAB_T = .41


def DragPaths():
    """Shunzi's forearm (the fist's grip), collar and eye in ijaA's start frame (source m): the forearm is pulled
    first and up, the body follows a hand behind, his head hangs (dazed)."""
    collar0, head0 = ButtCollarPaths()
    c0 = Vector(collar0(BUTT_T))
    e0 = Vector(head0(BUTT_T)) - c0
    f0 = c0 + Vector((.12, .06, .10))                 # his right forearm, raised to ijaA's left forearm
    pull = lambda t: Smooth((t - .40) / .45)
    forearm = lambda t: tuple(f0 + Vector((0, DRAG_DIST(t), .12 * pull(t))))
    collar = lambda t: tuple(c0 + Vector((0, DRAG_DIST(t) - .08 * pull(t), -.03 * pull(t))))
    eye = lambda t: tuple(Vector(collar(t)) + e0.lerp(Vector((0, -.24, .05)), pull(t)))
    return forearm, collar, eye


Meta('IjaDragByForearm', DRAG_T, False, 'track', role='ijaA', rig='LugouIja02', props=['weapon'], rootMotion=True,
     weaponState='clubRight', player=True,
     contacts=[{'t': 0.0, 'limb': 'handL', 'action': 'hold', 'partnerRole': 'shunzi', 'part': 'collar'},
               {'t': .05, 'limb': 'handL', 'action': 'release'},
               {'t': DRAG_GRAB_T, 'limb': 'handL', 'action': 'grab', 'partnerRole': 'shunzi', 'part': 'forearmR'}],
     events=[{'t': .45, 'kind': 'haulStart'}, {'t': 2.40, 'kind': 'haulStop'}],
     prev=['IjaButtStrikeCollar'], next=['IjaHoldCollarUp'],
     notes='SB04A: frame 0 = IjaButtStrikeCollar\'s last frame (astride, rifle in the low carry). Lets go of the collar, '
           'grabs Shunzi\'s right forearm (player forearmR, 0.41 s) and backs off bent low, hauling him 2.0 m (root motion '
           'along +z of the actor frame, i.e. backwards) with ten short steps; the right fist keeps the rifle low, muzzle '
           'forward-down. The head is up and the face on Shunzi\'s eye (look = player head) the whole way.')


@Builder('IjaDragByForearm')
def BuildDragByForearm(T, name):
    H, A = T.H, T.A
    parts = ButtStrikeParts(T)
    start = parts['body'](BUTT_T)
    forearm, collar, eye = DragPaths()
    p0 = start['pelvis']

    def PelvisXY(t):
        return (p0[0], p0[1] + DRAG_DIST(t))
    stance = {'L': (start['ankle.L'][0] - p0[0], start['ankle.L'][1] - p0[1], start['ankle.L'][2]),
              'R': (start['ankle.R'][0] - p0[0], start['ankle.R'][1] - p0[1], start['ankle.R'][2])}
    schedule = [('R' if k % 2 == 0 else 'L', .45 + .195 * k, .45 + .195 * (k + 1)) for k in range(10)]
    feet, plants = FollowSteps(PelvisXY, stance, schedule, DRAG_T, lift=.06)
    times = [round(.05 * i, 3) for i in range(int(DRAG_T / .05) + 1)]
    # a small drop of the hips on each planted step
    bob = lambda t: -.012 * abs(math.sin(math.pi * Clamp((t - .45) / .195))) if .45 <= t <= 2.40 else 0.0
    pelvis = [(t, (PelvisXY(t)[0], PelvisXY(t)[1], p0[2] + bob(t))) for t in times]
    base = dict(start)
    base['handRel.L'] = (.10, -.34, -.20)            # the free fist between the collar and the forearm (elbow bent: no straight-arm reach)
    body = Tracks(base, dict(feet, pelvis=pelvis,
                             bend=[(0.0, start['bend']), (.40, .90), (2.40, .90), (DRAG_T, .86)],
                             pelvisTilt=[(0.0, start['pelvisTilt']), (.40, (.36, 0, 0)), (DRAG_T, (.36, 0, 0))],
                             twist=[(0.0, 0.0), (.40, .10), (2.40, .10), (DRAG_T, .06)],
                             shrug=[(0.0, 0.0), (.40, .12), (DRAG_T, .10)]))
    grips = {'L': [(0.0, .05, collar, COLLAR_NORMAL, (0, 0, -1), 1.1),
                   (DRAG_GRAB_T, DRAG_T, forearm, (0, .25, .97), (-.6, -.8, 0), 1.2)]}
    low = parts['hand'](BUTT_T)

    def RifleAt(t):
        sway = .02 * math.sin(math.pi * Clamp((t - .45) / .195)) if .45 <= t <= 2.40 else 0.0
        return RifleByHand(T, (low[0], low[1] + DRAG_DIST(t), low[2] + sway), BUTT_LOW_DIR)

    def Pose(t):
        f = body(t)
        f['look'] = eye(t)
        PlayerHands(f, t, grips)
        ClubGrip(f, T, RifleAt(t))
        return T.Nest(f)

    def Check(t):
        out = PlayerHands({}, t, grips)
        out['R'] = T.Along(RifleAt(t), .62)
        return out
    spec = {'pose': Pose, 'check': Check, 'plants': plants,
            'props': lambda t: {'weapon': (RifleAt(t)['origin'], RifleAt(t)['axis'], ClubUp(RifleAt(t)['axis']), True)},
            'player': lambda t: {'forearmR': forearm(t), 'collar': collar(t), 'head': eye(t)},
            'look': eye,
            'reviewProps': lambda t: T.RifleProps(RifleAt(t)) + [('point', forearm(t), None, .03)]
            + ShunziGhost(collar(t)),
            'reviewFrames': lambda n: [0, 10, 24, 40, n - 1]}
    spec = AReview(spec)
    spec['reviewViews'] = [('side', lambda t: (-3.4, -.4 + DRAG_DIST(t), 1.0), lambda t: (0, -.4 + DRAG_DIST(t), .6)),
                           ('q', lambda t: (-2.3, -3.2 + DRAG_DIST(t), 1.8), lambda t: (0, -.4 + DRAG_DIST(t), .6)),
                           FirstPersonView(eye, lambda t: Add3(eye(t), (-.05, .98, .21)), roll=-8.0)]
    return spec


# -- SB03A IjaLookBackLow ----------------------------------------------------------------
LOOKBACK_BEARING = 115.0      # deg to his left from his forward: where the low eye is
LOOKBACK_EYE = (4.67, 2.18, .20)     # 4.7 m out on that bearing, 0.18 m off the ground (source m)
LOOK_T = 39 / 24
Meta('IjaLookBackLow', LOOK_T, False, 'track', role='ijaA', rig='LugouIja02', props=['weapon'], rootMotion=False,
     weaponState='twoHand->oneHandRight', holdLoop=[.8, LOOK_T],
     events=[{'t': .15, 'kind': 'hears'}, {'t': .75, 'kind': 'lookSettled'}],
     prev=['IjaReadyRifle'], next=['BayonetClearWood', 'IjaButtStrikeCollar'],
     notes='SB03A: standing at low ready he hears the beam shift, stops, and turns head and shoulders back and down over '
           'his LEFT shoulder (0.15-0.75 s; hips 13 deg, spine 29 deg, the rest in neck and head) onto a point 4.7 m away, '
           '115 deg to his left of his forward and 0.18 m off the ground (the director turns his root so Shunzi\'s eye '
           'is there). The left hand leaves the handguard; the rifle hangs low in the right fist, muzzle forward-down. '
           '0.8 s to the end is a seamless hold (breathing).')


@Builder('IjaLookBackLow')
def BuildLookBackLow(T, name):
    H, P, SX = T.H, T.P, T.SX
    base = Standing(T)
    base.update({'pelvis': (0, .02, P - .06), 'bend': .14, 'ankle.L': (H + .04, -.10, T.A), 'ankle.R': (-(H + .04), .08, T.A),
                 'foot.L': (0, 6, 0), 'foot.R': (0, -10, 0), 'lookW': 0.0, 'neck': (0, 0, 0), 'head': (.10, 0, 0),
                 'armPole.R': (-(SX + .45), .15, P + .10), 'armPole.L': (SX + .40, -.20, P + .05)})
    ready = LowReady(T)
    oneLow = T.Rifle((-(H + .10), -.12, P + .02), Unit((.10, -.80, -.59)))
    body = Tracks(base, {
        'turn': [(0.0, 0.0), (.15, 0.0), (.75, .22), (LOOK_T, .22)],
        'twist': [(0.0, 0.0), (.15, 0.0), (.75, .50), (LOOK_T, .50)],
        'neck': [(0.0, (0, 0, 0)), (.15, (0, 0, 0)), (.75, (.10, 0, .30)), (LOOK_T, (.10, 0, .30))],
        'bend': [(0.0, .14), (.15, .16), (.75, .22), (LOOK_T, .22)],
        'lookW': [(0.0, 0.0), (.15, 0.0), (.70, 1.0), (LOOK_T, 1.0)],
    }, lag={'neck': .04})
    move = Channel([(0.0, 0.0), (.22, 0.0), (.60, 1.0), (LOOK_T, 1.0)])

    def RifleAt(t):
        w = move(t)
        return T.Rifle(Lerp3(ready['origin'], oneLow['origin'], w), Unit(Lerp3(ready['axis'], oneLow['axis'], w)))

    def Pose(t):
        f = body(t)
        if t > .8:
            f['bend'] += .010 * math.sin(Tau * (t - .8) / (LOOK_T - .8))
            f['shrug'] = .012 * math.sin(Tau * (t - .8) / (LOOK_T - .8))
        psi = f.pop('turn')
        f['look'] = LOOKBACK_EYE
        # planted feet stay put while the hips turn over them
        f['foot.L'] = (0, 6 - math.degrees(psi), 0)
        f['foot.R'] = (0, -10 - math.degrees(psi), 0)
        f = Turned(f, psi)
        rifle = RifleAt(t)
        palms = T.Palms(rifle['axis'])
        f['grip.R'] = rifle['gripR']
        f['palmF.R'], f['palmN.R'], f['curl.R'] = palms['R'][0], palms['R'][1], .95
        f['handRel.R'] = None
        wl = 1 - Smooth((t - .12) / .16)       # the left hand is off the handguard before the rifle swings low
        if wl > .05:
            f['grip.L'], f['gripW.L'] = rifle['gripL'], wl
            f['palmF.L'], f['palmN.L'], f['curl.L'] = palms['L'][0], palms['L'][1], .85
        f['handRel.L'] = (.08, -.10, -.40)          # hangs with the elbow a little bent (a straight arm locked on the way off)
        return T.Nest(f)
    spec = {'pose': Pose, 'props': lambda t: {'weapon': T.Track(RifleAt(t))}, 'plants': [('L', 0, LOOK_T), ('R', 0, LOOK_T)],
            'check': lambda t: {'R': RifleAt(t)['gripR']},
            'look': lambda t: LOOKBACK_EYE if body(t)['lookW'] >= .99 else None,
            'reviewProps': lambda t: T.RifleProps(RifleAt(t)),
            'reviewFrames': lambda n: [0, 8, 18, n - 1]}
    spec = AReview(spec)
    spec['reviewViews'].append(('sb', LOOKBACK_EYE, (0, 0, 1.30), 65.0, 3.0))
    return spec


# -- SB05A IjaStartleTurn ----------------------------------------------------------------
STARTLE_T = 15 / 24
STARTLE_LOOK = (3.0, .26, 1.30)     # 95 deg to his left (a man coming up behind his left shoulder), head height


def StartleEnd(T):
    """IjaStartleTurn's last frame = IjaParriedChoppedFall frame 0: the collar let go, the fist drawn back,
    trunk twisted and head turned to his left rear, shoulders up."""
    f = HoldCollarBase(T)
    f.update({'twist': .45, 'neck': (.05, 0, .25), 'head': (.05, 0, .80), 'shrug': .12, 'lookW': 0.0,
              'handRel.L': (.14, -.22, -.28), 'curl.L': .45})
    return f


Meta('IjaStartleTurn', STARTLE_T, False, 'track', role='ijaA', rig='LugouIja02', props=['weapon'], rootMotion=False,
     weaponState='slungRight', player=True,
     contacts=[{'t': 0.0, 'limb': 'handL', 'action': 'hold', 'partnerRole': 'shunzi', 'part': 'collar'},
               {'t': .12, 'limb': 'handL', 'action': 'release'}],
     events=[{'t': .04, 'kind': 'startle'}, {'t': .12, 'kind': 'releaseCollar'}],
     prev=['IjaHoldCollarUp'], next=['IjaParriedChoppedFall'],
     notes='SB05A: frame 0 = IjaHoldCollarUp at its hold-loop start (0.8 s). A flinch (0.04 s), the fist opens off the '
           'collar (0.12 s) and head and shoulders snap round to his LEFT rear (= screen right from Shunzi, where Luo '
           'and He come from) by 0.3 s, eyes on a point 95 deg to his left at head height. Shunzi sinks (player collar '
           'and head drop 0.12 m). Last frame = IjaParriedChoppedFall frame 0 (same root, no blend).')


@Builder('IjaStartleTurn')
def BuildStartleTurn(T, name):
    hold = HoldCollarBase(T)
    end = StartleEnd(T)
    held = HoldCollarPath()(.80)
    collar = Channel([(0.0, held), (.10, held), (.45, Add3(held, (0, -.02, -.12))), (STARTLE_T, Add3(held, (0, -.02, -.12)))])
    eyeFrom = Channel([(0.0, HOLD_EYE), (.10, HOLD_EYE), (.45, (0, -.15, .14)), (STARTLE_T, (0, -.15, .14))])
    head = lambda t: tuple(Vector(collar(t)) + Vector(eyeFrom(t)))
    keys = lambda k: [(0.0, hold[k]), (.30, end[k]), (STARTLE_T, end[k])]
    body = Tracks(hold, {
        'twist': keys('twist'), 'neck': keys('neck'),
        'head': [(0.0, hold['head']), (.04, (-.14, 0, .10)), (.30, end['head']), (STARTLE_T, end['head'])],
        'shrug': [(0.0, 0.0), (.04, .25), (.30, end['shrug']), (STARTLE_T, end['shrug'])],
        'lookW': [(0.0, 1.0), (.34, 1.0), (.54, 0.0), (STARTLE_T, 0.0)],
        'handRel.L': [(0.0, hold['handRel.L']), (.26, end['handRel.L']), (STARTLE_T, end['handRel.L'])],
        'curl.L': [(0.0, 1.15), (.12, 1.15), (.30, end['curl.L']), (STARTLE_T, end['curl.L'])],
    }, lag={'head': .03})
    swing = Channel([(0.0, 0.0), (.06, 0.0), (.32, 1.0), (STARTLE_T, 1.0)])
    grips = {'L': [(0.0, .08, collar, COLLAR_NORMAL, (0, .3, -1), 1.15)]}

    def Pose(t):
        f = body(t)
        f['look'] = tuple(Vector(head(t)).lerp(Vector(STARTLE_LOOK), swing(t)))
        PlayerHands(f, t, grips)
        return T.Nest(f)
    _, review = SlungProps(T, 'side')
    hung = SlungSideNominal(T)            # where IjaParriedChoppedFall's weapon track starts

    def Props(t):
        # The slung rifle rides the flinching body (IjaHoldCollarUp's track) and settles onto the nominal
        # sling pose the parried fall starts from.
        rifle, up = SlungRifle(T, 'side')
        w = Smooth(t / STARTLE_T)
        return {'weapon': (Lerp3(rifle['origin'], hung['origin'], w), Unit(Lerp3(rifle['axis'], hung['axis'], w)),
                           Unit(Lerp3(up, (0, 0, 1), w)), True)}
    spec = {'pose': Pose, 'props': Props, 'plants': [('L', 0, STARTLE_T), ('R', 0, STARTLE_T)],
            'check': lambda t: PlayerHands({}, t, grips), 'player': lambda t: {'collar': collar(t), 'head': head(t)},
            'reviewProps': lambda t: review(t) + [('point', collar(t), None, .03)],
            'reviewFrames': lambda n: [0, 2, 4, 8, n - 1]}
    spec = AReview(spec)
    spec['reviewViews'].append(FirstPersonView(head, (-.10, -.25, 1.00)))
    return spec


# The parried fall now continues IjaStartleTurn frame to frame: bake it after the turn (the bake runs the
# clips in manifest order and seeds a clip's forearm twist from the `prev` clip baked before it).
CLIPS['IjaParriedChoppedFall'] = CLIPS.pop('IjaParriedChoppedFall')


# -- SB05 IjaGuardPort (ijaB) ------------------------------------------------------------
GUARD_TARGET = (0, -4.4, .82)       # the captive's eye 4 m ahead, 0.75 m up (source m, IJA01)
Meta('IjaGuardPort', 3.0, True, 'track', role='ijaB', rig='LugouIja01', props=['weapon'], rootMotion=False,
     weaponState='twoHand',
     prev=['IjaKickPrisoner', 'IjaReadyRifle'], next=['IjaChoppedFallWall'],
     notes='SB05 ijaB: stands square in the trench, rifle level at the waist (butt at the right hip, left hand on the '
           'handguard), muzzle a little down onto the captive 4 m ahead; breathing, the muzzle drifts 1-2 deg. The '
           'face is on a point 4 m ahead, 0.75 m up (look). Seamless 3 s loop.')


@Builder('IjaGuardPort')
def BuildGuardPort(T, name):
    H, P, SX, SZ = T.H, T.P, T.SX, T.SZ
    base = Standing(T)
    base.update({'ankle.L': (H + .05, -.14, T.A), 'ankle.R': (-(H + .06), .12, T.A), 'foot.L': (0, 8, 0), 'foot.R': (0, -24, 0),
                 'pelvis': (0, .03, P - .045), 'pelvisTilt': (.05, 0, -.10), 'bend': .22, 'twist': .08, 'neck': (.05, 0, 0),
                 'lookW': 1.0, 'armPole.R': (-(SX + .45), .30, P - .05), 'armPole.L': (SX + .35, -.30, P - .15)})

    def RifleAt(t):
        ph = Tau * t / 3.0
        pitch = math.radians(-7 + 1.2 * math.sin(ph))
        yaw = math.radians(20 + 1.5 * math.sin(2 * ph))       # the muzzle toward his left, across the body (left arm in reach)
        a = (math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch))
        return T.Rifle((-.06, -.22, P + .22 + .006 * math.sin(2 * ph)), a)

    def Pose(t):
        f = dict(base)
        ph = Tau * t / 3.0
        f['bend'] += .010 * math.sin(2 * ph)
        f['shrug'] = .015 * math.sin(2 * ph)
        f['look'] = GUARD_TARGET
        rifle = RifleAt(t)
        palms = T.Palms(rifle['axis'])
        f['grip.R'], f['grip.L'] = rifle['gripR'], rifle['gripL']
        f['palmF.R'], f['palmN.R'], f['curl.R'] = palms['R'][0], palms['R'][1], .95
        f['palmF.L'], f['palmN.L'], f['curl.L'] = palms['L'][0], palms['L'][1], .85
        f['handRel.R'] = f['handRel.L'] = None
        return T.Nest(f)
    spec = {'pose': Pose, 'props': lambda t: {'weapon': T.Track(RifleAt(t))}, 'plants': [('L', 0, 3.0), ('R', 0, 3.0)],
            'check': lambda t: {'R': RifleAt(t)['gripR'], 'L': RifleAt(t)['gripL']},
            'look': lambda t: GUARD_TARGET,
            'reviewProps': lambda t: T.RifleProps(RifleAt(t)),
            'reviewFrames': lambda n: [0, n // 2]}
    spec = AReview(spec)
    spec['reviewViews'].append(('sb', GUARD_TARGET, (0, 0, 1.15), 65.0, 0.0))
    return spec


# -- 2026-09-25 storyboard round, NRA clips (SB01, SB04A, SB06) ---------------------------
NRA02_SCALE = .9135          # LugouNra02 source -> runtime metres (manifest numbers below are runtime)


def Bump(t, t0, t1):
    """0 -> 1 -> 0 over [t0, t1] with zero value and zero slope at both ends (a pulse that keeps a hold loop's
    seam C1); 0 outside."""
    if t <= t0 or t >= t1:
        return 0.0
    return .5 - .5 * math.cos(Tau * (t - t0) / (t1 - t0))


def EaseGrip(f, side, point, weight, palmF, palmN, curl):
    """A hand on a world point with its own ease weight (0 = the free body-frame hand, 1 = on the point)."""
    if weight <= 1e-4:
        return
    f['grip.' + side], f['gripW.' + side] = tuple(point), min(1.0, weight)
    f['palmF.' + side], f['palmN.' + side], f['curl.' + side] = palmF, palmN, curl
    f['handRel.' + side] = f.get('handRel.' + side) or (.06 if side == 'L' else -.06, -.14, -.45)


# -- SB06 LuoKneelReach (Nra05) ----------------------------------------------------------
# Shunzi sits against the collapsed earth 0.9 m in front of Luo; Luo drops onto his right knee, leans in and
# holds out his open left hand to him ("还能打不？"), 0.3 m short of his breastbone, then takes it back and
# stands. Frame 0 and the last frame are LuoKneelCheck frame 0 (the standing pose Luo arrives in after
# LuoDragToCover), so the director can play either clip at the Check beat and hand on to KickRifle.
REACH_T = 84 / 24                    # 3.5 s
REACH_HOLD = (1.0, 2.5)
REACH_EYE = (.02, -1.24, .78)         # Shunzi's eye from Luo's root (source m): sitting, 0.72 m up, 1.14 m off (SB06: Luo bent
#                                      far over his knee, his face ~0.6 m from the camera, the offered hand ~0.45 m)
REACH_CHEST = (.04, -1.14, .50)        # his breastbone
REACH_GAP_M = .30                    # runtime m: the offered hand stops this far short of the chest (SB06)
REACH_DIR = (.12, .78, .62)           # chest -> the offered hand: toward Luo's left shoulder and up (clear of his raised knee)
LUO_KNEEL_HAND = (.20, -.46, .72)     # where his free left hand is in the kneel, over the raised knee, elbow bent (baked, source m)
Meta('LuoKneelReach', REACH_T, False, 'free', role='luo', rig='LugouNra05', rootMotion=False, player=True,
     holdLoop=list(REACH_HOLD),
     holdExit='pose.holdUntil: the loop lets go at that clip time and plays on through the 2.5-2.8 s hand back and the rise',
     contacts=[{'t': REACH_HOLD[0], 'limb': 'handL', 'action': 'reach', 'partnerRole': 'shunzi', 'part': 'chest',
                'gapM': REACH_GAP_M},
               {'t': REACH_HOLD[1], 'limb': 'handL', 'action': 'release'}],
     events=[{'t': .60, 'kind': 'kneel'}, {'t': 1.05, 'kind': 'line', 'line': 'RescueCheck.01'}, {'t': 2.8, 'kind': 'rise'}],
     prev=['LuoDragToCover'], next=['KickRifle', 'LuoKneelCheck'],
     notes='SB06 (2026-09-25): from the standing pose (= LuoKneelCheck frame 0) he drops onto his right knee in front of '
           'the sitting Shunzi (0.9 m, player head/chest), leans in and holds out his open left hand, palm down, fingers '
           'toward him, 0.3 m short of his breastbone (1.0 s; the elbow stays bent). 1.0-2.5 s is a seamless hold loop '
           '(the hand offers twice, the face on Shunzi\'s eye, look = player head). holdUntil lets go: the hand comes back '
           'to the knee (2.5-2.8 s) and he stands (3.5 s). Last frame = frame 0 = LuoKneelCheck frame 0: a drop-in for the '
           'Check beat, hands on to KickRifle like LuoKneelCheck does.')


def LuoKneelPose(T):
    K = T.K
    H, A = T.H, T.A
    kz, ky = K['kneelPelvisZ'], K['kneelPelvisY']
    kp = K['toeKneelPitch'] - K['toeStandPitch']
    return {'pelvis': (0, ky - .16, kz + .0), 'ankle.L': (H + .08, ky - .58, A), 'legPole.L': (H + .30, -1.2, .9), 'foot.L': (0, 12, 0),
            'ankle.R': K['kneelAnkle'](-1), 'legPole.R': K['kneelPole'](-1), 'foot.R': (kp, 0, 0),
            'bend': .50, 'pelvisTilt': (.08, 0, 0)}


@Builder('LuoKneelReach')
def BuildKneelReach(T, name):
    stand = Standing(T)
    kneel = LuoKneelPose(T)
    base = dict(stand, **{'handRel.L': (.06, -.14, -.45), 'palmF.L': (0, -.2, -1), 'palmN.L': (-1, 0, 0),
                          'handRel.R': (-.08, -.16, -.44), 'palmF.R': (0, -.2, -1), 'palmN.R': (1, 0, 0), 'curl.R': .7, 'lookW': 0.0})
    upright = {k: stand[k] for k in ('pelvis', 'ankle.L', 'ankle.R', 'legPole.L', 'legPole.R', 'foot.L', 'foot.R', 'bend', 'pelvisTilt')}
    rows = [(0.0, {}), (.20, {'pelvis': Add3(stand['pelvis'], (0, 0, -.12)), 'bend': .25}),
            (.60, dict(kneel, lookW=.8, **{'handRel.L': (.05, -.24, -.33)})),
            (REACH_HOLD[0], {'bend': 1.25, 'lookW': 1.0, 'handRel.R': (-.10, -.22, -.40)}),
            (REACH_HOLD[1], {'bend': 1.25, 'lookW': 1.0}),
            (2.80, {'bend': .50, 'lookW': .8, 'handRel.R': base['handRel.R']}),
            (3.10, {'handRel.L': base['handRel.L']}),
            (3.20, {'lookW': 0.0}),
            (REACH_T, dict(upright, lookW=0.0))]
    body = Keys(base, rows, lag={'head': .05})
    gap = T.R(REACH_GAP_M)
    offered = tuple(Vector(REACH_CHEST) + Vector(Unit(REACH_DIR)) * gap)
    palmF, palmN = Unit((-.18, -.93, -.30)), Unit((-.30, -.22, -.93))      # fingers to him, palm down (an offered hand)

    # The hand travels on a world path from where it hangs in the kneel (by his left knee) out to the offer and
    # back, and the free hand is bent over the knee meanwhile: a hanging (straight) arm blended into the offer
    # by weight let the bake's reach assist pull the hips (and the planted knee) 3-10 cm while it moved.
    rest = LUO_KNEEL_HAND
    out = Channel([(.60, rest), (REACH_HOLD[0], offered), (REACH_HOLD[1], offered), (2.75, rest)])

    def Hand(t):
        # the offer: the hand eases forward twice per loop (1.5 cm), zero slope at the loop seam
        b = Bump(t, REACH_HOLD[0], REACH_HOLD[0] + .75) + Bump(t, REACH_HOLD[0] + .75, REACH_HOLD[1])
        return Add3(out(t), (-.004 * b, -.016 * b, .010 * b))

    def Weight(t):
        if t < REACH_HOLD[1]:
            return Smooth((t - .52) / .12)
        return 1 - Smooth((t - 2.70) / .10)

    def Pose(t):
        f = body(t)
        f['look'] = REACH_EYE
        b = Bump(t, REACH_HOLD[0], REACH_HOLD[0] + .75) + Bump(t, REACH_HOLD[0] + .75, REACH_HOLD[1])
        f['bend'] += .02 * b
        EaseGrip(f, 'L', Hand(t), Weight(t), palmF, palmN, .22)
        return T.Nest(f)

    def Check(t):
        return {'L': Hand(t)} if REACH_HOLD[0] <= t <= REACH_HOLD[1] else {}
    spec = {'pose': Pose, 'check': Check, 'plants': [('L', .60, 2.80), ('R', .60, 2.80)], 'kneePlants': [('R', .62, 2.78)],
            'player': lambda t: {'head': REACH_EYE, 'chest': REACH_CHEST},
            'look': lambda t: REACH_EYE if body(t)['lookW'] >= .99 else None,
            'reviewProps': lambda t: [('point', REACH_CHEST, None, .04), ('point', offered, None, .025),
                                      ('cyl', (.04, -1.10, .05), (.04, -1.10, .45), .10)],
            'reviewFrames': lambda n: [0, int(n * .17), int(n * .29), int(n * .5), int(n * .8), n - 1]}
    spec = AReview(spec)
    # SB06 camera: Shunzi's eye looking at Luo (the storyboard frames him left of centre: aim to his left, +X)
    spec['reviewViews'].append(FirstPersonView(REACH_EYE, (.52, -.30, .70), roll=0.0))
    return spec


# -- SB01 RunnerLeanPostCall (Nra02) -----------------------------------------------------
# The runner at the dugout mouth: left hand round the upright timber prop at shoulder height, leaning in past
# it and shouting into the dugout. The post is on his left, a little ahead (the storyboard: the post on the
# right of him as he faces the camera).
RUNNER_T = 72 / 24                     # 3.0 s
RUNNER_HOLD = (.75, RUNNER_T)
RUNNER_POST = (.62, -.32)              # the post's axis on the ground (source m, his frame)
RUNNER_POST_R = .065                   # post radius (source m, ~0.12 m timber)
RUNNER_GRIP = (.62 - RUNNER_POST_R - .025, -.34, 1.28)   # finger-root centroid of the fist round the post (source m)
RUNNER_LOOK = (-.30, -2.6, .80)        # into the dugout: the men 2.6 m in, low (source m)


def _RuntimePoint(p, scale=NRA02_SCALE):
    return [round(-p[0] * scale, 3), round(p[2] * scale, 3), round(p[1] * scale, 3)]


Meta('RunnerLeanPostCall', RUNNER_T, False, 'track', role='runner', rig='LugouNra02', props=['weapon'], rootMotion=False,
     weaponState='slungBack', holdLoop=list(RUNNER_HOLD),
     contacts=[{'t': .45, 'limb': 'handL', 'action': 'brace', 'target': 'post', 'untilT': RUNNER_T,
                # the fist's finger roots on the post, and the post's axis on the ground (runtime metres, actor frame)
                'pointM': _RuntimePoint(RUNNER_GRIP), 'postAxisM': _RuntimePoint((RUNNER_POST[0], RUNNER_POST[1], 0.0)),
                'postRadiusM': round(RUNNER_POST_R * NRA02_SCALE, 3)}],
     events=[{'t': .45, 'kind': 'handOnPost'}, {'t': 1.25, 'kind': 'shout'}, {'t': 2.30, 'kind': 'shout'}],
     prev=['MessengerReport'], next=['MessengerReport'],
     notes='SB01 (2026-09-25): at the dugout mouth, the left hand closes round the upright timber prop at shoulder height '
           '(0.45 s; contact pointM = the fist on the post, postAxisM = where the post stands, runtime metres in the actor '
           'frame: the director puts the root so postAxisM is on the north door post) and he leans in past it, shouting '
           'into the dugout (head on a point 2.4 m in, 0.73 m up). 0.75-3.0 s is a seamless hold loop with two shouts '
           '(1.25 / 2.30 s: the trunk pushes in, the free right hand swings up). Rifle slung across the back.')


@Builder('RunnerLeanPostCall')
def BuildRunnerLeanPost(T, name):
    H, P, A, SX = T.H, T.P, T.A, T.SX
    base = Standing(T)
    base.update({'ankle.L': (H + .06, -.14, A), 'ankle.R': (-(H + .02), .20, A), 'foot.L': (0, 14, 0), 'foot.R': (0, -12, 0),
                 'pelvis': (.02, .04, P - .05), 'lookW': 0.0, 'handRel.R': (-.06, -.14, -.44), 'curl.R': .55})
    lean = {'bend': .60, 'pelvisTilt': (.16, 0, .04), 'twist': .04, 'pelvis': (.05, .10, P - .08), 'lookW': 1.0}
    body = Keys(base, [(0.0, {'bend': .12}), (.45, lean), (RUNNER_HOLD[0], lean), (RUNNER_HOLD[1], lean)], lag={'head': .05})
    # the fist on the post: fingers round it (toward his front), palm onto the wood, thumb up
    palmF, palmN = Unit((-.25, -.95, 0)), Unit((1, -.15, 0))

    def Shout(t):
        return Bump(t, .95, 1.75) + Bump(t, 2.0, 2.85)

    def Pose(t):
        f = body(t)
        s = Shout(t)
        f['bend'] += .08 * s
        f['look'] = Add3(RUNNER_LOOK, (0, 0, -.10 * s))
        # the right hand swings up a little on each shout
        r = f['handRel.R']
        f['handRel.R'] = (r[0] - .01 * s, r[1] - .07 * s, r[2] + .07 * s)
        f['curl.R'] = .55 + .25 * s
        EaseGrip(f, 'L', RUNNER_GRIP, Smooth((t - .15) / .30), palmF, palmN, .95)
        return T.Nest(f)
    props, review = SlungProps(T, 'back')
    post = [('cyl', (RUNNER_POST[0], RUNNER_POST[1], 0.0), (RUNNER_POST[0], RUNNER_POST[1], 1.95), RUNNER_POST_R)]
    spec = {'pose': Pose, 'props': props, 'plants': [('L', 0, RUNNER_T), ('R', 0, RUNNER_T)],
            'check': lambda t: {'L': RUNNER_GRIP} if t >= .45 else {},
            'look': lambda t: Add3(RUNNER_LOOK, (0, 0, -.10 * Shout(t))) if body(t)['lookW'] >= .99 else None,
            'reviewProps': lambda t: review(t) + post,
            'reviewFrames': lambda n: [0, int(n * .15), int(n * .42), int(n * .77), n - 1]}
    spec = AReview(spec)
    # SB01 camera: sitting in the dugout 2.7 m in front of him, eye 0.95 m up, looking out past him
    spec['reviewViews'].append(('sb', (-.9, -2.9, 1.04), (.35, 0, 1.05), 65.0, 0.0))
    return spec


# -- SB04A InterpreterHurryReach (Nra02 -> NRA06) --------------------------------------
# The interpreter hurries back up the trench toward the downed Shunzi with one arm out (SB04A). An upper-body
# clip: the director plays it with upperBody:true over the native fast walk (Move(..., {upperBody:true})),
# so only the arms, clavicles, neck and head come from here; the legs here only stand in a stride for the
# stills and a stationary fallback.
HURRY_T = 30 / 24                      # 1.25 s
HURRY_HOLD = (.50, HURRY_T)
HURRY_LOOK = (0, -3.2, .40)            # the man on the ground ~3 m ahead (source m)
Meta('InterpreterHurryReach', HURRY_T, False, 'free', role='interpreter', rig='LugouNra02', rootMotion=False,
     upperBody=True, holdLoop=list(HURRY_HOLD),
     events=[{'t': .40, 'kind': 'reachOut'}],
     prev=['InterpreterCrouchAsk'], next=['InterpreterCrouchAsk', 'InterpreterGrabCollar'],
     notes='SB04A (2026-09-25): play with upperBody:true over the native walk/run (the director\'s Move(actor, point, '
           'face, "InterpreterHurryReach", speed, {upperBody:true})): the right arm comes up and reaches forward, open '
           'hand palm down, fingers spread (0.40 s), the left arm pulled back, the face on the ground 3 m ahead. '
           '0.5-1.25 s is a seamless hold loop (the hand grabs at the air once). Full-body it is a standing stride '
           '(stills and a stationary fallback only).')


@Builder('InterpreterHurryReach')
def BuildHurryReach(T, name):
    H, P, A = T.H, T.P, T.A
    base = Standing(T)
    base.update({'ankle.L': (H + .02, -.24, A), 'ankle.R': (-(H + .02), .22, A), 'foot.L': (0, 6, 0), 'foot.R': (0, -6, 0),
                 'pelvis': (0, .0, P - .06), 'bend': .20, 'pelvisTilt': (.08, 0, 0), 'lookW': 1.0,
                 'handRel.L': (.10, .06, -.40), 'poleRel.L': (.40, .45, -.20), 'palmF.L': (0, .2, -1), 'palmN.L': (-1, 0, 0), 'curl.L': .75,
                 'handRel.R': (-.07, -.10, -.47), 'poleRel.R': (-.45, .40, -.35), 'palmF.R': (0, -.2, -1), 'palmN.R': (1, 0, 0), 'curl.R': .45})
    reach = {'handRel.R': (-.03, -.43, -.05), 'poleRel.R': (-.45, .15, -.45), 'palmF.R': Unit((.05, -1, -.12)),
             'palmN.R': Unit((.25, -.15, -.95)), 'curl.R': .18, 'bend': .24}
    body = Keys(base, [(0.0, {}), (.40, reach), (HURRY_HOLD[0], reach), (HURRY_HOLD[1], reach)], lag={'head': .04})

    def Pose(t):
        f = body(t)
        g = Bump(t, HURRY_HOLD[0] + .10, HURRY_HOLD[1] - .05)
        r = f['handRel.R']
        f['handRel.R'] = (r[0], r[1] - .05 * g, r[2] + .02 * g)
        f['curl.R'] += .40 * g
        f['look'] = HURRY_LOOK
        return T.Nest(f)
    spec = {'pose': Pose, 'plants': [('L', 0, HURRY_T), ('R', 0, HURRY_T)], 'look': lambda t: HURRY_LOOK,
            'reviewFrames': lambda n: [0, int(n * .32), int(n * .7), n - 1]}
    spec = AReview(spec)
    # SB04A camera: on the ground 3 m ahead of him, looking up the trench at him
    spec['reviewViews'].append(('sb', (.25, -3.3, .33), (0, 0, 1.15), 65.0, -8.0))
    return spec


# -- SB01 YaowaSitLoad (Nra02) -----------------------------------------------------------
# Yaowa sits on the dugout floor against the north wall, knees up, the rifle between his knees (butt in the
# dirt, muzzle leaning away to his left), bent over it pushing a charger of rounds down into the magazine.
# The 2026-09-22 ClipLoad he had is a kneeling pose that reads as a man kneeling with his arms out from the
# SB01 camera (survey T_SB01_staged2). Seamless 3 s loop: two thumb pushes, the empty charger flicked away, a
# new one from the belt pouch, seated in the guide.
LOAD_T = 72 / 24                       # 3.0 s
Meta('YaowaSitLoad', LOAD_T, True, 'track', role='yaowa', rig='LugouNra02', props=['weapon'], rootMotion=False,
     env={'wallBehindM': .35},
     contacts=[{'t': 0, 'limb': 'handL', 'action': 'hold', 'target': 'weapon', 'part': 'handguard'},
               {'t': 0, 'limb': 'butt', 'action': 'rest', 'target': 'ground'},
               {'t': .20, 'limb': 'handR', 'action': 'press', 'target': 'weapon', 'part': 'receiver'},
               {'t': 1.20, 'limb': 'handR', 'action': 'release'},
               {'t': 2.40, 'limb': 'handR', 'action': 'seat', 'target': 'weapon', 'part': 'receiver'}],
     events=[{'t': .45, 'kind': 'roundsDown'}, {'t': .95, 'kind': 'roundsDown'}, {'t': 1.30, 'kind': 'chargerOut'},
             {'t': 1.75, 'kind': 'pouch'}, {'t': 2.45, 'kind': 'chargerIn'}],
     next=['BanterLaugh'],
     notes='SB01 (2026-09-25): sits on the floor against the north wall (wall 0.35 m behind the root), knees up and apart, '
           'the rifle between the knees, butt in the dirt, muzzle leaning away to his left; the left hand holds the '
           'handguard, the head is bowed over the open bolt (look = the receiver). Loop: two thumb pushes on the charger '
           '(0.2-1.1 s), the empty charger flicked out to his right (1.3 s), a new one from the belt pouch (1.75 s), '
           'seated in the guide (2.45 s). Replaces the kneeling ClipLoad for Yaowa in Banter/Orders.')


def YaowaRifle(T):
    rifle = T.RifleFromButt((-.03, -.27, .012), Unit((.12, -.17, .98)))
    # sights toward him (he looks down into the open receiver)
    a = Vector(rifle['axis'])
    up = Vector((0, 1, .15))
    up = (up - a * up.dot(a)).normalized()
    return rifle, tuple(up)


@Builder('YaowaSitLoad')
def BuildYaowaSitLoad(T, name):
    H, A = T.H, T.A
    rifle, up = YaowaRifle(T)
    a, u = Vector(rifle['axis']), Vector(up)
    butt = Vector(rifle['butt'])
    receiver = butt + a * T.R(.355) + u * T.R(.035)          # the charger guide on top of the receiver
    handguard = butt + a * T.R(.56)
    base = SitBase(T)
    base.update({'pelvisTilt': (-.28, 0, .02), 'bend': .56, 'lean': 0.0, 'twist': .04, 'shrug': .04, 'lookW': 1.0,
                 # knees up and apart, the rifle between them
                 'ankle.L': (H + .16, -.42, A), 'ankle.R': (-(H + .12), -.46, A),
                 'legPole.L': (H + .75, -.30, 1.0), 'legPole.R': (-(H + .70), -.35, 1.0), 'foot.L': (0, 22, 0), 'foot.R': (0, -18, 0),
                 'hand.L': base['hand.L'], 'armPole.L': (.60, -.10, .30), 'armPole.R': (-.60, -.05, .35)})
    across = (a.cross(u)).normalized()                        # across the receiver, toward his left
    pressAt = receiver + u * T.R(.030)                        # the fist's finger roots over the charger, thumb on it
    pouch = Vector((-.13, -.17, .25))                         # right front belt pouch
    flick = pressAt + Vector((-.16, .02, .10))
    down = -a * T.R(.028)
    path = Channel([(0.0, tuple(pressAt)), (.20, tuple(pressAt)), (.45, tuple(pressAt + down)), (.60, tuple(pressAt)),
                    (.70, tuple(pressAt)), (.95, tuple(pressAt + down * 1.3)), (1.15, tuple(pressAt + down * 1.3)),
                    (1.30, tuple(flick)), (1.50, tuple(Vector(flick).lerp(pouch, .45) + Vector((0, 0, .04)))),
                    (1.75, tuple(pouch)), (1.95, tuple(pouch)), (2.20, tuple(pressAt + u * T.R(.06))),
                    (2.45, tuple(pressAt)), (LOAD_T, tuple(pressAt))], periodic=True)
    # palm: onto the top of the charger (thumb push); at the pouch the palm faces the belt
    pressF, pressN = tuple(across), tuple(-u)
    pouchF, pouchN = Unit((.30, -.95, 0)), Unit((0, -.30, -.95))
    palm = Channel([(0.0, 0.0), (1.15, 0.0), (1.50, 1.0), (1.95, 1.0), (2.30, 0.0), (LOAD_T, 0.0)], periodic=True)
    curl = Channel([(0.0, .55), (1.15, .55), (1.30, .20), (1.60, .35), (1.75, .75), (1.95, .80), (2.45, .55), (LOAD_T, .55)], periodic=True)
    palmsL = T.Palms(rifle['axis'])

    def Palm(t):
        w = palm(t)
        return Unit(Lerp3(pressF, pouchF, w)), Unit(Lerp3(pressN, pouchN, w))

    def Pose(t):
        f = SitBreath(t, dict(base), period=LOAD_T, amount=.6)
        push = Bump(t, .20, .60) + Bump(t, .70, 1.10)
        f['bend'] += .03 * push
        f['look'] = tuple(receiver)
        f['grip.L'] = tuple(handguard)
        f['palmF.L'], f['palmN.L'], f['curl.L'] = palmsL['L'][0], palmsL['L'][1], .85
        pf, pn = Palm(t)
        f['grip.R'] = path(t)
        f['palmF.R'], f['palmN.R'], f['curl.R'] = pf, pn, curl(t)
        f['handRel.L'] = f['handRel.R'] = None
        return T.Nest(f)
    spec = {'pose': Pose, 'props': lambda t: {'weapon': T.Track(rifle, up=up)}, 'plants': [('L', 0, LOAD_T), ('R', 0, LOAD_T)],
            'check': lambda t: {'L': tuple(handguard), 'R': path(t)}, 'look': lambda t: tuple(receiver),
            'reviewProps': lambda t: T.RifleProps(rifle) + [('box', (0, .385 + .03, .7), (1.6, .06, 1.4), 0),
                                                            ('point', tuple(receiver), None, .02)],
            'walls': SIT_WALL, 'reviewFrames': lambda n: [0, int(n * .15), int(n * .43), int(n * .58), int(n * .82)]}
    spec['reviewViews'] = list(SIT_VIEWS) + [('sb', (-1.75, -.30, 1.02), (0, -.25, .45), 65.0, 0.0)]
    spec['reviewScale'] = 2.2
    return spec


# -- SB05A IjaChoppedFallBack (ijaB, Ija01) -----------------------------------------------
# SB05A frames ijaB going over backwards: sat down hard in the mud, one leg shot out toward Shunzi,
# the other knee up, trunk thrown back, arms flung out, mouth open. IjaChoppedFallWall (staggers left
# into the wall and slides down it) reads from Shunzi's eye as a man crumpling over, not as a man
# thrown off balance backwards, so this is its alternative for the SB05A camera. Frames 0-0.50 s are
# IjaChoppedFallWall's (the same aim, the same neck under Luo's LuoDadaoChopRear blade at 0.45 s):
# the director swaps the clip on ijaB in STAGES['chopRear'] without moving anyone.
FALLBACK_T = 54 / 24                      # 2.25 s
FALLBACK_SEAT = (-.02, .20, .15)          # pelvis when the seat hits the mud (source m, IJA01): 0.2 m behind his root
FALLBACK_SIT = 22 / 24                    # 0.917 s: the seat hits the mud
Meta('IjaChoppedFallBack', FALLBACK_T, False, 'track', role='ijaB', rig='LugouIja01', props=['weapon'], rootMotion=True,
     stage='chopRear', env={'wallLeftM': round(CHOP_WALL_X * .9213, 2)}, terminal=True,
     contacts=[{'t': .45, 'by': 'luo', 'part': 'neckSideR', 'action': 'cut'}],
     events=[{'t': .45, 'kind': 'bloodSpray', 'at': 'neckSideR'}, {'t': .50, 'kind': 'weaponLost'},
             {'t': FALLBACK_SIT, 'kind': 'seatHit'}, {'t': FALLBACK_T, 'kind': 'dead'}],
     prev=['IjaGuardPort', 'IjaBayonetGuard', 'IjaReadyRifle'], next=[],
     notes='SB05A (2026-09-25), alternative to IjaChoppedFallWall on the same stage and frames 0-0.50 s: aiming down '
           'at Shunzi when the blade lands; neck snaps away, the rifle drops forward into the mud in front of Shunzi, '
           'the front (left) foot shoots out and he sits down hard 0.2 m behind his root (0.92 s, event seatHit), the '
           'trunk thrown back, arms flung out, right knee up (the SB05A frame is 0.92-1.15 s); then he goes over onto '
           'his back, the right knee falling open. Last frame is the corpse on his back.')


@Builder('IjaChoppedFallBack')
def BuildChoppedFallBack(T, name):
    H, P, A, SX = T.H, T.P, T.A, T.SX
    base = AimStance(T)
    base.update({'bend': .18, 'head': (.30, -.14, .42)})           # = IjaChoppedFallWall's base
    rifle0 = AimDownRifle(T)
    ground = T.Rifle((-.12, -.92, .035), Unit((.85, -.52, .02)))  # in the mud in front of Shunzi
    wallX = CHOP_WALL_X
    sx, sy, sz = FALLBACK_SEAT
    S = FALLBACK_SIT
    rows = [
        (0.00, {}),
        (0.45, {}),
        # The blade lands on the right of the neck: shoulders hunch, head and neck thrown left (as the wall fall,
        # but the head goes over 0.12 s: the wall fall's one-frame 43 deg head snap reads as a pop).
        (0.50, {'shrug': .30, 'bend': .08, 'head': (.22, .08, .50), 'neck': (0.03, .08, .20)}),
        # The front foot slips out and the weight goes back over the rear foot (the drop to the seat takes
        # about as long as a free fall of that height, 0.3 s).
        (0.62, {'pelvis': (.02, .07, P - .18), 'pelvisTilt': (-.12, .05, -.35), 'bend': .02,
                'head': (.10, .35, .60), 'neck': (0.0, .20, .20),
                'ankle.L': (H + .04, -.30, A + .06), 'foot.L': (-20, 10, 0)}),
        (0.78, {'pelvis': (.0, .15, P - .44), 'pelvisTilt': (-.30, .08, -.28), 'bend': -.04,
                'ankle.L': (H + .06, -.48, A + .10), 'legPole.L': (H + .15, -1.0, 1.0), 'foot.L': (-40, 10, 0),
                'legPole.R': (-(H + .30), -.9, .6), 'head': (-.05, .30, .50), 'shrug': .15}),
        # Seat in the mud: trunk thrown back, left leg out toward Shunzi, right knee up, arms flung wide.
        (S, {'pelvis': (sx, sy, sz), 'pelvisTilt': (-.50, .08, -.22), 'bend': -.08, 'lean': -.04,
             'ankle.L': (H + .06, -.52, A + .01), 'legPole.L': (H + .10, -1.0, 1.1), 'foot.L': (-50, 10, 0),
             'ankle.R': (-(H + .02), -.24, A), 'legPole.R': (-(H + .45), -.55, .80), 'foot.R': (0, -20, 0),
             'head': (-.25, .25, .40), 'neck': (-.10, .12, .12), 'shrug': .05}),
        (1.12, {'pelvisTilt': (-.58, .08, -.22), 'bend': -.10, 'head': (-.30, .22, .35)}),
        # Over onto his back; the right knee falls open.
        (1.50, {'pelvis': (sx + .01, sy + .04, sz - .03), 'pelvisTilt': (-1.00, .06, -.18), 'bend': -.04,
                'head': (-.10, .25, .40), 'neck': (-.05, .10, .10), 'ankle.R': (-(H + .08), -.30, A)}),
        (1.85, {'pelvis': (sx + .02, sy + .06, sz - .05), 'pelvisTilt': (-1.32, .06, -.14), 'bend': 0.0,
                'ankle.R': (-(H + .18), -.36, A - .05), 'legPole.R': (-(H + .95), -.50, .45), 'foot.R': (0, -35, -20),
                'ankle.L': (H + .10, -.50, A - .06), 'foot.L': (-60, 20, 15)}),
        (FALLBACK_T, {'pelvis': (sx + .02, sy + .07, sz - .05), 'pelvisTilt': (-1.40, .06, -.12), 'bend': .02,
                      'head': (.0, .40, .45), 'neck': (0.0, .12, .12), 'shrug': 0.0,
                      'ankle.R': (-(H + .22), -.38, A - .06), 'ankle.L': (H + .10, -.50, A - .07), 'foot.R': (0, -45, -30)}),
    ]
    anim = Keys(base, rows, lag={'head': .04, 'neck': .03})
    # Free hands in the torso frame (left, back, up from the shoulder): flung out as he sits, slack on the
    # ground beside him once he lies back (the torso's `back` is then the ground). The left one stays clear
    # of the trench wall on his left.
    hands = Keys({'handRel.R': (-.10, -.20, -.42), 'handRel.L': (.10, -.10, -.45)}, [
        (0.0, {}), (.62, {}),
        (0.78, {'handRel.R': (-.28, -.34, -.18), 'handRel.L': (.26, -.26, -.20)}),
        (S, {'handRel.R': (-.26, -.44, -.02), 'handRel.L': (.30, -.22, -.10)}),
        (1.12, {'handRel.R': (-.30, -.40, -.10), 'handRel.L': (.30, -.14, -.16)}),
        (1.50, {'handRel.R': (-.40, -.12, -.20), 'handRel.L': (.30, -.04, -.24)}),
        (FALLBACK_T, {'handRel.R': (-.42, .04, -.24), 'handRel.L': (.30, .04, -.28)})])

    def RifleAt(t):
        if t <= .50:
            return rifle0
        # Let go and falls: a small toss forward, then the drop gathers speed like a free fall.
        u = Clamp((t - .50) / .34)
        o = Lerp3(rifle0['origin'], ground['origin'], Smooth(u))
        o = (o[0], o[1], rifle0['origin'][2] + (ground['origin'][2] - rifle0['origin'][2]) * u * u)
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
            f['palmF.R'], f['palmN.R'] = (0, -.2, -1), (1, 0, 0)
            f['palmF.L'], f['palmN.L'] = (0, .2, 1), (1, 0, 0)
            f['curl.R'] = f['curl.L'] = Mix(.35, .20, Smooth((t - .60) / .30))
            f['poleRel.R'], f['poleRel.L'] = (-.45, .40, -.35), (.45, .40, -.35)
            if t < .64:
                # The hands open off the rifle over 0.14 s (they do not snap to the new pose).
                r = rifle0
                f['grip.R'], f['grip.L'] = r['gripR'], r['gripL']
                f['gripW.R'] = f['gripW.L'] = 1 - Smooth((t - .50) / .14)
                f['armPole.R'] = (-(SX + .45), .10, T.SZ - .35)
                f['armPole.L'] = (SX + .30, -.40, T.SZ - .60)
        return T.Nest(f)

    spec = {'pose': Pose, 'props': lambda t: {'weapon': T.Track(RifleAt(t))}, 'plants': [('L', 0, .50), ('R', 0, .72)],
            'walls': [((wallX, 0, 0), (-1, 0, 0))],
            'reviewProps': lambda t: T.RifleProps(RifleAt(t)) + [('box', (wallX + .03, 0, .7), (.06, 2.0, 1.4), 0)],
            'reviewFrames': lambda n: [0, int(n * .22), int(n * .35), int(n * .41), int(n * .5), int(n * .7), n - 1]}
    spec = AReview(spec)
    # SB05A camera: Shunzi half-lying 3 m in front of ijaB, eye 0.67 m up, looking a little up the trench
    spec['reviewViews'].append(('sb', (-.315, -3.02, .673), (-.52, -.03, .99), 65.0, 0.0))
    return spec


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
