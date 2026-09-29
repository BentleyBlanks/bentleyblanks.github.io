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
    # Back of the head below the cap, where a fist grabs the hair to wrench the head back (2026-09-27: ijaA at his left
    # shoulder; 12 cm over the head joint the back of the NRA02 head is 7 cm behind it, the cap starts above).
    'hairNape': {'bones': ['Head'], 'normal': (0, 1, .25), 'count': 16,
                 'score': lambda p, c: p.y - 4 * abs(p.z - (_Z(c, 'Head') + .12)) - 2 * abs(p.x)},
    # Front of the neck under the jaw: where the blade crosses.
    # (2026-09-27: 1.5 cm under the neck joint, the middle of the throat; at 3.5 cm over it -- the old height -- the
    # TengxianHumanoidV1 patch sat on the jaw and the blade crossed the mouth.)
    'throat': {'bones': ['Neck', 'Head'], 'normal': (0, -1, 0), 'count': 14,
               'score': lambda p, c: -p.y - 3 * abs(p.z - (_Z(c, 'Neck') - .015)) - 2 * abs(p.x)},
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
# puts the root that far from the real trench/dugout wall. wallLeanFromM / wallLeanDeg: the wall behind
# leans back that many degrees above that height over the root's ground (the planks behind R3).


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

# -- 01 bunker banter / blast (comrade = TengxianNra02) ------------------------------------
Meta('WoundedSitRifleIdle', 4.0, True, 'track', role='comrade', rig='TengxianNra02', props=['weapon'],
     rootMotion=False, env={'wallBehindM': .35},
     contacts=[{'t': 0, 'limb': 'handR', 'action': 'hold', 'target': 'weapon', 'part': 'handguard'},
               {'t': 0, 'limb': 'butt', 'action': 'rest', 'target': 'ground'}],
     next=['BanterLaugh', 'BanterLookShoulder', 'BanterPatRifle', 'WoundedRiseWall'],
     notes='Seated on the dugout floor, back on the wall, knees up; rifle upright between the knees, '
           'butt in the dirt, right hand round the handguard; bandaged left arm limp on the left knee.')
Meta('BanterLaugh', 1.6, False, 'track', role='any', rig='TengxianNra02', props=['weapon'], rootMotion=False,
     additive={'reference': 'frame0', 'bones': ADDITIVE_UPPER},
     notes='Short shared laugh: breath in, three decaying chest pulses, head back then down. '
           'Additive on spine/neck/head/clavicles; full-body it is the seated comrade.')
Meta('BanterLookShoulder', 2.2, False, 'track', role='comrade', rig='TengxianNra02', props=['weapon'], rootMotion=False,
     additive={'reference': 'frame0', 'bones': ADDITIVE_UPPER},
     notes='Glances down at the bandaged left shoulder and back up ("低头看了一眼肩膀").')
Meta('BanterPatRifle', 2.0, False, 'track', role='comrade', rig='TengxianNra02', props=['weapon'], rootMotion=False,
     additive={'reference': 'WoundedSitRifleIdle@0', 'bones': ADDITIVE_ARM_R},
     contacts=[{'t': .62, 'limb': 'handR', 'action': 'pat', 'target': 'weapon'},
               {'t': 1.02, 'limb': 'handR', 'action': 'pat', 'target': 'weapon'},
               {'t': 1.55, 'limb': 'handR', 'action': 'regrip', 'target': 'weapon'}],
     prev=['WoundedSitRifleIdle'], next=['WoundedSitRifleIdle', 'WoundedRiseWall'],
     notes='"拿这个噻": lets go of the handguard, pats the rifle twice, closes the hand again. '
           'Starts and ends on WoundedSitRifleIdle frame 0.')
Meta('WoundedRiseWall', 2.8, False, 'track', role='comrade', rig='TengxianNra02', props=['weapon'], rootMotion=True,
     env={'wallBehindM': .35, 'wallLeftM': .43},
     contacts=[{'t': .55, 'limb': 'handL', 'action': 'brace', 'target': 'wall'},
               {'t': 1.9, 'limb': 'handL', 'action': 'release', 'target': 'wall'},
               {'t': 2.1, 'limb': 'handL', 'action': 'grip', 'target': 'weapon', 'part': 'handguard'}],
     events=[{'t': 1.25, 'kind': 'effort', 'what': 'sharpInhale'}],
     prev=['WoundedSitRifleIdle'], next=['BlastSlamBuried'],
     notes='Pulls the feet in, braces the bandaged side on the wall, stalls with a sharp inhale when '
           'the shoulder pulls, rises into a hunched low-ceiling stance, clamps the rifle at port.')
Meta('BlastSlamBuried', 1.5, False, 'track', role='comrade', rig='TengxianNra02', props=['weapon'], rootMotion=True,
     weaponState='held->dropped',
     env={'wallLeftM': .55},
     events=[{'t': 0.0, 'kind': 'blastHit'}, {'t': .08, 'kind': 'weaponLost'}, {'t': .30, 'kind': 'wallImpact'},
             {'t': .62, 'kind': 'weaponLands'}],
     prev=['WoundedRiseWall'], next=['CaptiveDraggedFromDirt'], terminalPose='buried',
     notes='Near miss from front-right: thrown back-left into the trench wall, the rifle torn out '
           'forward-right, slides down the wall into a slumped heap on his left side (dust hides him). '
           'The heap lies on the real bank at the foot of the planks (BANK_RAMP). '
           'The last frame is exactly BlastDazedStir / CaptiveDraggedFromDirt frame 0 in the same root.')
Meta('BlastDazedStir', 6.4, True, 'free', role='comrade', rig='TengxianNra02', rootMotion=False, weaponState='dropped',
     weaponDropFrom='BlastSlamBuried', env={'wallLeftM': .55},
     events=[{'t': 2.3, 'kind': 'effort', 'what': 'groan'}, {'t': 3.9, 'kind': 'effort', 'what': 'strain'}],
     prev=['BlastSlamBuried'], next=['CaptiveDraggedFromDirt'],
     notes='Stunned by the near miss, in the heap on the bank (Wake .. the drag): heavy breathing, the head '
           'comes up and lolls, the right hand goes to the ringing head and he shakes it slowly, the left palm '
           'pushes on the bank to sit up and the arm gives, he sags back. Frame 0 = last frame = '
           'BlastSlamBuried last frame = CaptiveDraggedFromDirt frame 0 (the director lands the drag on a loop end).')


# -- 01 the comrade is dragged out, shoved to the wall -----------------------------------
# The planks behind the kneeling comrade (R3), in the R3 actor frame: R3WallEnv(T) with the NRA02 scale;
# R3Clip checks the two agree (2026-09-27: they stand 0.41 m behind R3 and lean back 20 deg above 0.50 m).
KNEEL_WALL_ENV = {'wallBehindM': .41, 'wallLeanFromM': .496, 'wallLeanDeg': 20}
STAGES['captiveDrag'] = {
    'anchor': 'comrade', 'syncS': 0.0,
    'notes': 'All three clips start together; roots stay put, every body moves inside its clip. '
             'Comrade root = BlastSlamBuried root (wall 0.55 m on his left).',
    'actors': {
        'comrade': {'rig': 'TengxianNra02', 'clip': 'CaptiveDraggedFromDirt', 'x': 0.0, 'z': 0.0, 'yawDeg': 0},
        'ijaA': {'rig': 'TengxianIja02', 'clip': 'IjaDragCollarFromDirt', 'x': .05, 'z': -.58, 'yawDeg': 156},
        # ijaB works from his right side (yaw 95, was 122): at 122 both soldiers stooped into the
        # same space in front of him and ijaB's head went through ijaA's chest at the grab.
        'ijaB': {'rig': 'TengxianIja01', 'clip': 'IjaPullArm', 'x': .48, 'z': -.24, 'yawDeg': 95},
    }}
STAGES['captiveWall'] = {
    'anchor': 'comrade', 'syncS': 0.0,
    'notes': 'Comrade root R3 = his kneel spot at the end of the drag (pelvis hand-over: models[].clips[].root, CaptiveDraggedFromDirt end = CaptiveWallBrace start); '
             'he kneels on the north bank with the planks of trenchFacadeN 0.41 m behind (KNEEL_WALL_ENV; he was hauled round to face his right). ijaA stands square in front.',
    'actors': {
        'comrade': {'rig': 'TengxianNra02', 'clip': 'CaptiveWallBrace', 'x': 0.0, 'z': 0.0, 'yawDeg': 0},
        'ijaA': {'rig': 'TengxianIja02', 'clip': 'IjaShoveToWall', 'x': .02, 'z': -.60, 'yawDeg': 180},
    }}
PARTNER_SOURCES.setdefault('TengxianNra02', {}).update({
    'CaptiveDraggedFromDirt': ['collarBack', 'upperArmR', 'wristR'],
    'CaptiveWallBrace': ['chestFront'],
})

Meta('CaptiveDraggedFromDirt', 4.4, False, 'free', role='comrade', rig='TengxianNra02', rootMotion=True, weaponState='dropped', weaponDropFrom='BlastSlamBuried',
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
Meta('IjaDragCollarFromDirt', 4.4, False, 'track', role='ijaA', rig='TengxianIja02', props=['weapon'], rootMotion=True,
     stage='captiveDrag', weaponState='slungBack',
     contacts=[{'t': .30, 'limb': 'handR', 'action': 'grab', 'partnerRole': 'comrade', 'part': 'collarBack', 'standoffM': .035}],
     events=[{'t': 2.20, 'kind': 'jerkUp', 'line': 'CaptiveDragged.02'}],
     next=['IjaShoveToWall'],
     notes='Stoops, hooks the back collar with the right hand, backs up three steps hauling; the '
           'jerk on "立て！" straightens him. Rifle slung across the back.')
Meta('IjaPullArm', 4.4, False, 'track', role='ijaB', rig='TengxianIja01', props=['weapon'], rootMotion=True,
     stage='captiveDrag', weaponState='slungBack',
     contacts=[{'t': .70, 'limb': 'handL', 'action': 'grab', 'partnerRole': 'comrade', 'part': 'upperArmR', 'standoffM': .045},
               {'t': .62, 'limb': 'handR', 'action': 'grab', 'partnerRole': 'comrade', 'part': 'wristR', 'standoffM': .04},
               {'t': 3.20, 'limb': 'handsLR', 'action': 'yank', 'partnerRole': 'comrade'},
               {'t': 4.05, 'limb': 'handsLR', 'action': 'release'}],
     next=['IjaBayonetGuard', 'GuardTurn', 'IjaReadyRifle'],
     notes='Two-handed hold on the right upper arm and wrist, sidesteps back with the drag, '
           'wrenches the arm up at 3.2 s and lets go at 4.05 s.')
Meta('CaptiveWallBrace', 2.0, False, 'free', role='comrade', rig='TengxianNra02', rootMotion=True, weaponState='dropped', weaponDropFrom='BlastSlamBuried',
     stage='captiveWall', env=KNEEL_WALL_ENV,
     contacts=[{'t': .34, 'by': 'ijaA', 'part': 'chestFront', 'action': 'shove'},
               {'t': .62, 'limb': 'handL', 'action': 'brace', 'target': 'wall', 'untilT': 1.0},
               {'t': 1.20, 'limb': 'shoulderBack', 'action': 'lean', 'target': 'wall', 'untilT': 2.0}],
     prev=['CaptiveDraggedFromDirt'], next=['CaptiveKneelMud', 'CaptiveHeadPulledBack'],
     notes='Shoved in the chest: topples back-left, the left palm finds the planks and slides down them, he ends '
           'kneeling on the bank leaning back with shoulders and back on the planks, right hand on the torn bandage.')
Meta('IjaShoveToWall', 1.0, False, 'track', role='ijaA', rig='TengxianIja02', props=['weapon'], rootMotion=True,
     stage='captiveWall', weaponState='slungBack', extra=True,
     contacts=[{'t': .34, 'limb': 'handR', 'action': 'shove', 'partnerRole': 'comrade', 'part': 'chestFront', 'standoffM': .04},
               {'t': .56, 'limb': 'handR', 'action': 'release'}],
     prev=['IjaDragCollarFromDirt'], next=['InterrogateCrouch', 'IjaHairGrabPull'],
     notes='Not in contract §5.4 (added): the shove the draft describes ("推到沟壁上") needs its own pair '
           'with CaptiveWallBrace. Short wind-up, lunge on the left foot, flat right palm to the chest.')
Meta('CaptiveKneelMud', 3.0, True, 'free', role='comrade', rig='TengxianNra02', rootMotion=False, weaponState='dropped', weaponDropFrom='BlastSlamBuried',
     env=KNEEL_WALL_ENV,
     contacts=[{'t': 0.0, 'limb': 'shoulderBack', 'action': 'lean', 'target': 'wall', 'untilT': 3.0}],
     prev=['CaptiveWallBrace'], next=['CaptiveHeadPulledBack'],
     notes='Interrogation idle: kneeling on the bank (shins up the slope, sitting on high heels) and leaning back on '
           'the planks, three hard breaths per loop, head lolling, right hand pressed on the bandage. Same root as '
           'CaptiveWallBrace.')


# =================================================================================
# per-rig builders
# =================================================================================
BUILDERS = {}
# TengxianHumanoidV1 (2026-09-26): the bake's reach assist (Script_OpeningStoryboardBake Solve, spec 'reach')
# for the IJA hands that grip at the end of their reach. On the common skeleton the IJA shoulders sit ~5 cm
# further back and 3.6 cm higher and the arm is 2.4 cm shorter than IJA02's own, and a grasping hand's
# finger-root centroid stops ~0.85 arm lengths out: at the Lugou default start (.92 of the arm) these hands
# stayed 3.2-9 cm off their targets. Only the gripping hand starts the assist earlier ('sides'); travel and
# lean stay at the defaults (a bigger lean put ijaA's face into the comrade's: OpeningClipsBrowserTest).
# The hair hand also brings its shoulder forward (HAIR_PROTRACT). Every other clip keeps the defaults.
# 2026-09-27 pinned rescue: on the slash chain the reach assist only leans the trunk in -- the hips it pulled toward the man
# (up to 0.16 m, and 0.15 m down) put ijaA's body against the kneeling man's raised left arm (OpeningClipsBrowserTest
# 13-18 cm); the bake's spec key 'sink' keeps the hips up.
REACH_BY_CLIP = {name: {'fraction': .86, 'travel': 0.0, 'bend': .25, 'sink': 0.0}
                 for name in ('IjaHairGrabPull', 'IjaDrawBayonet', 'IjaThroatSlash', 'IjaReleaseSheathe')}
# The right hand across to the scabbard on his left hip (the draw 0.1-0.45 s, the sheathe after the cut from 0.45 s): the
# trunk leans further in there -- only there: the frames the chain hands over on keep the chain's lean.
REACH_BY_CLIP['IjaDrawBayonet'] = dict(REACH_BY_CLIP['IjaDrawBayonet'],
                                       bend=lambda t: .25 + .15 * Smooth((t - .06) / .10) * (1 - Smooth((t - .40) / .14)))
REACH_BY_CLIP['IjaReleaseSheathe'] = dict(REACH_BY_CLIP['IjaReleaseSheathe'], bend=lambda t: .25 + .15 * Smooth((t - .40) / .16))
# The stooped collar drag (the player on the ground) also needs the longer travel and lean.
REACH_BY_CLIP['IjaCollarDragSnag'] = {'fraction': .86, 'sides': 'L', 'travel': .13, 'bend': .40}
REACH_BY_CLIP['IjaDragCollarFromDirt'] = {'fraction': .86, 'sides': 'R'}
# The parried fall's left hand on the swinging handguard (0.10-0.52 s): at the default start the arm ran straight
# and its forearm snapped 77 deg in one frame at 0.33 s (OpeningClipsBrowserTest spike); from 0.80 it stays bent.
REACH_BY_CLIP['IjaParriedChoppedFall'] = {'fraction': .80, 'sides': 'L'}
# ... and the gripping hand's shoulder comes forward (rad about the vertical, ~6 cm): the hair hand, the collar grab.
GRIP_PROTRACT = .65
# The wipe starts in the hair hold (IjaThroatSlash's last frame) and ends reaching for the slung barrel
# (IjaReadyRifle's first frame, default assist); only the wipe on his thigh (3.75 s) needs more.
_WIPE_ON = lambda t: Smooth(Clamp((t - 2.6) / .8)) - Smooth(Clamp((t - 4.3) / .7))   # 0 at the hand-overs, 1 for the thigh wipe
REACH_BY_CLIP['IjaWipeSheathBayonet'] = {
    'travel': lambda t: .10 + .03 * _WIPE_ON(t), 'bend': lambda t: .25 + .15 * _WIPE_ON(t), 'fractionBySide': {
        'L': lambda t: .86 + .06 * Smooth(Clamp((t - 4.3) / .7)),   # the hair hand as in the throat slash, then free
        'R': lambda t: .92 - .06 * _WIPE_ON(t)}}                     # the knife hand: default, lower only for the wipe


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
        if name in REACH_BY_CLIP:
            spec.setdefault('reach', REACH_BY_CLIP[name])
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
        self.nra = K['modelId'].startswith('TengxianNra')
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
        p['protract'] = {s: f.get('protract.' + s) or 0.0 for s in LR}
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
        # The bake grounds every frame AFTER the pose (a kneeling body is lifted by up to 0.15 m): aim
        # from where the eye will be, as the grips do (the previous frame's lift; 2026-09-26 -- with the
        # TengxianHumanoidV1 proportions a 12 cm kneel lift left Luo's face 4 deg under Shunzi's eye).
        if K.get('GroundLift'):
            target = Vector(target) - Vector((0, 0, K['GroundLift']()))
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
            # Hand-over between a world target (a wall, the ground) and the body frame. Either end out of reach is taken
            # where the straight arm already points (the same pose at weight 0 or 1): blended from a hand flung out 1.7
            # arm lengths away, the arm stayed straight for 60 % of the blend and crossed to the head in three frames
            # (BlastDazedStir, 2026-09-28).
            reach = K['armLen']
            ends = []
            for end in (Vector(world), target):
                if (end - shoulder).length > reach:
                    end = shoulder + (end - shoulder).normalized() * reach
                ends.append(end)
            target = ends[0].lerp(ends[1], weight)
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
    # yM: the height of an actor's root over the anchor's (each actor stands on its own ground: ijaA on the trench floor
    # at the foot of the bank the comrade kneels on, 2026-09-27)
    p.z += other.get('yM', 0.0) - me.get('yM', 0.0)
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
    dz = other.get('yM', 0.0) - me.get('yM', 0.0)
    for k in range(0, len(row), 3):
        x, y = _Rot(row[k], row[k + 1], oyaw)
        x, y = _Rot(x + ox - mx, y + oy - my, -myaw)
        points.append(Vector((x, y, row[k + 2] + dz)) / T.s)
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
    # (2026-09-28: axis (.64, -.22, .74) put the handguard 13 cm in front of the left shoulder: the left arm folded to
    # 170 deg and its elbow whipped round as the hand came onto the rifle at the end of WoundedRiseWall)
    return T.Rifle((-(T.H + .04), -.44, T.P - .10), (.60, -.45, .66))


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
                # (2026-09-28: off the wall the hand comes round in front of the shoulder -- from under it (-.30, P + .05) the
                # reach for the handguard passed the shoulder joint and the elbow whipped round)
                'head': (-.10, 0, .05), 'twist': 0.0, 'hand.L': (SX + .10, -.58, P + .12), 'curl.L': .45,
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
        if t >= 2.10 - 1e-6:
            out['L'] = T.Along(rifle, .80)
        return out

    def Pose(t):
        f = anim(t)
        g = Grips(t)
        f['grip.R'], f['grip.L'] = g['R'], g.get('L')
        if t >= REACH_L[0] and g.get('L') is None:
            # 2026-09-28: the left hand reaches the handguard over the 0.2 s before it closes on it (it
            # arrived in one frame at 2.10 s: the forearm turned over 119 deg between two frames).
            f['grip.L'], f['gripW.L'] = T.Along(RifleAt(t), .80), Smooth((t - REACH_L[0]) / (REACH_L[1] - REACH_L[0]))
        return T.Nest(f)
    REACH_L = (1.90, 2.10)
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


# 2026-09-26: the ground he really lands on. At banter.comradeBlast (3.6, -125.85) the north wall is
# not a vertical face 0.55 m to his left: the trench floor ends 0.29 m to his RIGHT and the foot of the
# wall is a 35-degree bank (the game's 0.75 m heightfield rounds the corner) rising to trenchFacadeN's
# planks, 0.345 m to his left, which stand upright to 0.384 m and lean back 20 degrees above
# (Data_OpeningSet0103). Authored on a flat floor, the heap sat up to 0.42 m deep in the bank with the
# head and the left shoulder in the planks. RUNTIME metres from the root: (left distance, height over
# the root's own ground), battlefield.GroundHeight at x 3.4-3.8 sampled 2026-09-26 (the highest row).
BANK_RAMP = ((-.29, -.205), (.42, .30), (.80, 1.06))
BANK_FACE = (.345, .384, math.tan(math.radians(20)))
BANK_SHIFT = .22             # the heap lands this far (runtime m) to his right of the flat-floor authoring


def BankHeight(T, x):
    """Ground under source X (his left +) in source metres over the root's own ground."""
    d, (a, b, c) = x * T.s, BANK_RAMP
    if d <= a[0]:
        h = a[1]
    elif d <= b[0]:
        h = a[1] + (d - a[0]) * (b[1] - a[1]) / (b[0] - a[0])
    else:
        h = b[1] + (d - b[0]) * (c[1] - b[1]) / (c[0] - b[0])
    return h / T.s


def OnBank(T, f, w=1.0):
    """A flat-floor pose carried onto the bank: every world target moves BANK_SHIFT to his right and
    up by the bank under its new place (w blends it in). Body-frame hands (handRel) ride along."""
    out = dict(f)
    if w <= 1e-6:
        return out
    dx = -T.R(BANK_SHIFT) * w
    for key in ('pelvis', 'ankle.L', 'ankle.R', 'hand.L', 'hand.R'):
        v = f.get(key)
        if v is None:
            continue
        x = v[0] + dx
        out[key] = (x, v[1], v[2] + w * BankHeight(T, x))
    # Knee and elbow poles are directions from the body: they move with the pelvis (lifting them by the
    # bank under their own far-out points cocked the left knee up into ijaA's thigh).
    rise = w * BankHeight(T, f['pelvis'][0] + dx)
    for key in ('legPole.L', 'legPole.R', 'armPole.L', 'armPole.R'):
        v = f.get(key)
        if v is not None:
            out[key] = (v[0] + dx, v[1], v[2] + rise)
    return out


def BankGround(T, weight=None):
    """The bake's grounding surface for the heap: the bank, blended in by weight(t)."""
    return lambda x, y, t: BankHeight(T, x) * (weight(t) if weight else 1.0)


def BankWalls(T):
    """Ramp, flat floor and the leaning planks as wall planes (point, inward normal, edge), source metres."""
    (a, b, _), (face, upright, lean) = BANK_RAMP, BANK_FACE
    k, tilt = math.atan2(b[1] - a[1], b[0] - a[0]), math.atan(lean)
    return [((T.R(a[0]), 0, T.R(a[1])), (-math.sin(k), 0, math.cos(k)), (T.R(a[0]), 0, 0), (1, 0, 0)),
            ((T.R(a[0]), 0, T.R(a[1])), (0, 0, 1), (T.R(a[0]), 0, 0), (-1, 0, 0)),
            ((T.R(face), 0, T.R(upright)), (-math.cos(tilt), 0, math.sin(tilt)), (0, 0, T.R(upright)), (0, 0, 1))]


def BankReview(T):
    """The floor, the bank and the planks for the Blender review stills."""
    (a, b, _), (face, upright, lean) = BANK_RAMP, BANK_FACE
    top, back = T.R(1.6), T.R(face + (1.6 - upright) * lean)
    Y = (T.R(-1.2), T.R(1.2))
    foot = BankHeight(T, T.R(face))
    return [('poly', [(T.R(-.9), Y[0], T.R(a[1])), (T.R(-.9), Y[1], T.R(a[1])), (T.R(a[0]), Y[1], T.R(a[1])), (T.R(a[0]), Y[0], T.R(a[1]))], None, 0),
            ('poly', [(T.R(a[0]), Y[0], T.R(a[1])), (T.R(a[0]), Y[1], T.R(a[1])), (T.R(face), Y[1], foot), (T.R(face), Y[0], foot)], None, 0),
            ('poly', [(T.R(face), Y[0], foot), (T.R(face), Y[1], foot), (T.R(face), Y[1], T.R(upright)), (T.R(face), Y[0], T.R(upright))], None, 0),
            ('poly', [(T.R(face), Y[0], T.R(upright)), (T.R(face), Y[1], T.R(upright)), (back, Y[1], top), (back, Y[0], top)], None, 0)]


def BankHeap(T):
    """BuriedBase on the bank: BlastSlamBuried's last frame, BlastDazedStir's and CaptiveDraggedFromDirt's first."""
    return OnBank(T, BuriedBase(T))


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
    # Standing he hits the planks where they lean back to ~0.6 m; sliding down he comes off them onto the
    # bank (OnBank grows from the impact to the landing), and the grounding follows the bank the same way.
    onBank = lambda t: Smooth((t - .30) / .55)

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

    held = RifleAt(.05)
    release = (.05, .20)

    def Pose(t):
        f = OnBank(T, anim(t), onBank(t))
        if t <= release[0]:
            r = RifleAt(t)
            f['grip.R'], f['grip.L'] = r['gripR'], T.Along(r, .80)
        elif t < release[1]:
            # 2026-09-28: the hands fly open from where they held the rifle (they went to the hips for one frame
            # and then up: the left forearm turned 166 deg between two frames at 0.08 s).
            w = 1 - Smooth((t - release[0]) / (release[1] - release[0]))
            f['grip.R'], f['grip.L'] = held['gripR'], T.Along(held, .80)
            f['gripW.R'] = f['gripW.L'] = w
        else:
            f['grip.R'] = f['grip.L'] = None
        return T.Nest(f)
    return {'pose': Pose, 'props': lambda t: {'weapon': T.Track(RifleAt(t))},
            'ground': BankGround(T, onBank), 'walls': lambda t: BankWalls(T) if t >= .85 else [],
            'reviewProps': lambda t: T.RifleProps(RifleAt(t)) + BankReview(T),
            'reviewViews': [('side', (-3.2, -.35, .8), (.2, -.1, .55)), ('q', (-2.3, -2.6, 1.6), (.2, -.1, .5)),
                            ('back', (-1.5, 2.8, 1.6), (.2, 0, .5))],
            'reviewFrames': lambda n: [0, int(n * .12), int(n * .2), int(n * .4), n - 1], 'reviewScale': 2.6,
            # (2026-09-28) the forearm twist back within +-200 deg during the blast (Script_OpeningStoryboardBake ArmRoll):
            # the heap and everything after it hold the arms the way the old one-frame snap left them, but turned over in
            # six frames of the blast instead of one
            'twistMax': 200}


# ---------------------------------------------------------------------------------
# 01: the comrade dragged out of the dirt, shoved to the wall, kneeling against it.
# Victim root = BlastSlamBuried root for the drag; R3 (his kneel spot) afterwards.
# ---------------------------------------------------------------------------------
# 2026-09-27: the kneel spot is on the bank too. The trench floor ends 0.36 m in front of the old R3
# (4.057, -125.905) and a 32-degree bank rises behind it to the foot of trenchFacadeN's planks (0.29 m
# behind, 0.20 m up), then 64 degrees. Authored on a flat floor with a vertical wall 0.49 m behind, his
# insteps and toes lay 0.45 m deep in the bank and 0.2 m behind the planks, and his back was 6-11 cm in
# the leaning planks, from the drop to his knees (drag 2.1 s) to the corpse. R3 moves KNEEL_SHIFT forward
# (south; the stage partners ride on R3 and move with it), the feet are laid on the bank (BankLegs) and
# every R3 clip grounds on it (R3Bank) against the real planks (R3Walls).
# KNEEL_BANK: (runtime m north of the OLD R3, height over the old R3's own ground), battlefield.GroundHeight
# at x 4.057 sampled 2026-09-27; x 3.7-4.45 agree within 2-3 cm, the west a little higher (KNEEL_BANK_WEST).
KNEEL_BANK = ((-.36, -.222), (.245, .156), (.345, .228), (.395, .271), (.445, .374), (.80, 1.105))
KNEEL_BANK_WEST = .035          # runtime m per m: the ground rises to the west (his right at R3)
# The planks: m north of the old R3, upright to this height over its ground (floorAt + 0.384), then leaning
# back 20 degrees (Data_OpeningSet0103 lean; the built rows lean from floorAt + 0.3, 3 cm further back).
KNEEL_FACE = (.29, .424, math.tan(math.radians(20)))
DRAG_ROOT_SOUTH = .055          # banter.comradeBlast is this far south of the old R3 (runtime m)
KNEEL_SHIFT = .131              # source m (0.12 runtime): R3 forward (south) of the old kneel spot, off the planks
KNEE_CONTACT = .10              # source: with the shin up the slope the knee rests on its front, this far behind the joint
KNEE_FLAT = (-.055, .022)       # (y, z) source, before grounding: the knee joint of the flat KneelWallBase (bake 2026-09-27)
KNEE_MIN_DEG = 25.0             # the smallest knee angle (thigh over shin) the bank kneel folds to
KNEEL_RECLINE_M = .42           # source: the trunk reclines 1 rad per this much the seat comes forward (shoulders to the planks)
DRAG_END = (.06 - KNEEL_SHIFT, -.50)   # victim kneel spot (R3 origin) in the drag root (source metres, Blender axes)
DRAG_TURN = -math.pi / 2        # hauled round to face his right: the trench wall ends up behind him
WALL_R3_Y = .54                 # the flat-floor wall of the old authoring (R3_WALL_BOX review prop only)


def KneelBankOld(b):
    """Ground b runtime m north of the old R3, runtime m over the old R3's ground."""
    pts = KNEEL_BANK
    if b <= pts[0][0]:
        return pts[0][1]
    for (b0, h0), (b1, h1) in zip(pts, pts[1:]):
        if b <= b1 or b1 == pts[-1][0]:
            return h0 + (b - b0) * (h1 - h0) / (b1 - b0)


def R3Bank(T, x, y):
    """Ground under R3 source (x, y) in source m over the (moved) R3's own ground: +Y = north, +X = east."""
    s = T.s
    return (KneelBankOld(y * s - KNEEL_SHIFT * s) - KneelBankOld(-KNEEL_SHIFT * s) - KNEEL_BANK_WEST * x * s) / s


def DragBank(T, x, y):
    """The same ground in the drag root (banter.comradeBlast, facing east): +X = north, +Y = west."""
    s = T.s
    return (KneelBankOld(x * s - DRAG_ROOT_SOUTH) - KneelBankOld(-DRAG_ROOT_SOUTH) + KNEEL_BANK_WEST * y * s) / s


def PlankWalls(T, north, axis):
    """trenchFacadeN as two wall planes (point, inward normal, edge) in source m: upright below the lean,
    leaning back above. `north` = runtime m from the root to the planks, `axis` = 0 (+X north) or 1 (+Y)."""
    face, upright, lean = KNEEL_FACE
    s, tilt = T.s, math.atan(lean)
    d, z0 = (face + north) / s, (upright - KneelBankOld(-north)) / s

    def V(a, z):
        return (a, 0, z) if axis == 0 else (0, a, z)
    return [(V(d, 0), V(-1, 0), (0, 0, z0), (0, 0, -1)),
            (V(d, z0), V(-math.cos(tilt), math.sin(tilt)), (0, 0, z0), (0, 0, 1))]


def R3Walls(T):
    return PlankWalls(T, KNEEL_SHIFT * T.s, 1)


def R3WallY(T, z):
    """Back distance (source) of the planks at height z over R3's ground."""
    face, upright, lean = KNEEL_FACE
    s = T.s
    z0 = (upright - KneelBankOld(-KNEEL_SHIFT * s)) / s
    return (face + KNEEL_SHIFT * s) / s + max(0.0, z - z0) * lean


def R3WallEnv(T):
    """The planks for the manifest env (runtime m, the R3 actor frame): OpeningClipsBrowserTest's wall gap."""
    face, upright, lean = KNEEL_FACE
    north = KNEEL_SHIFT * T.s
    return {'wallBehindM': round(face + north, 3), 'wallLeanFromM': round(upright - KneelBankOld(-north), 3),
            'wallLeanDeg': 20}


def BankLegs(T, f, bank, knee, back=(0.0, 1.0), w=1.0):
    """A kneel authored on a flat floor with its feet laid on the bank. Each ankle rises by the ground under it
    over the ground under the knees (`knee` = (x, y); the bake grounds the knees on the bank), and each foot
    pitches with the slope along the body's back direction (`back`, a unit (x, y)). `bank`(x, y): source m."""
    if w <= 1e-6:
        return f
    out = dict(f)
    base, e = bank(*knee), .04
    for s in LR:
        a = f.get('ankle.' + s)
        if a is None:
            continue
        out['ankle.' + s] = (a[0], a[1], a[2] + w * (bank(a[0], a[1]) - base))
        slope = (bank(a[0] + back[0] * e, a[1] + back[1] * e) - bank(a[0] - back[0] * e, a[1] - back[1] * e)) / (2 * e)
        foot = f.get('foot.' + s)
        if foot is not None:
            out['foot.' + s] = (foot[0] + w * math.degrees(math.atan(slope)), foot[1], foot[2])
    return out


def BankKneelSpot(T, a):
    """(knee joint y, kneecap contact y) of the bank kneel, R3 source: the shin (T.S) from the knee joint (at
    KNEE_FLAT's height) reaches the ankle `a` laid on the bank at its flat height over the ground under the kneecap."""
    lo, hi = -.40, a[1] - .05
    for _ in range(40):
        ky = (lo + hi) / 2
        dz = a[2] + R3Bank(T, 0, a[1]) - R3Bank(T, 0, ky + KNEE_CONTACT) - KNEE_FLAT[1]
        lo, hi = (ky, hi) if math.hypot(a[1] - ky, dz) > T.S else (lo, ky)
    return ky, ky + KNEE_CONTACT


def KneelSpot(T):
    """BankKneelSpot of the R3 kneel's own feet (every R3 clip kneels on them; the slide moves one out)."""
    if 'kneelSpot' not in T.cache:
        T.cache['kneelSpot'] = BankKneelSpot(T, KneelFeet(T, KneelFlat(T))['ankle.L'])
    return T.cache['kneelSpot']


def BankKneel(T, f, w=1.0):
    """The seat of a flat-floor kneel on the bank. With the knees on the slope and the shins lying up it
    (BankLegs), the heels are ~0.2 m higher than the knees: the thigh keeps its authored angle unless that
    folds the knee under KNEE_MIN_DEG, then it stands up (the seat comes up and forward, sitting on high
    heels). The trunk reclines by as much as the seat came forward so the shoulders stay on the planks."""
    if w <= 1e-6:
        return f
    out = dict(f)
    px, py, pz = f['pelvis']
    vy, vz = py - KNEE_FLAT[0], pz - KNEE_FLAT[1]
    # One thigh length for every frame (the kneel-sit's): a seat that rises or sinks turns about the planted knee.
    k = KneelFlat(T, 0.0, .02, sit=KNEEL_WALL_SIT)['pelvis']
    length, elev = math.hypot(k[1] - KNEE_FLAT[0], k[2] - KNEE_FLAT[1]), math.atan2(vz, vy)
    a = KneelFeet(T, KneelFlat(T))['ankle.L']
    ky, contact = KneelSpot(T)
    shin = math.atan2(a[2] + R3Bank(T, 0, a[1]) - R3Bank(T, 0, contact) - KNEE_FLAT[1], a[1] - ky)
    stand = max(elev, shin + math.radians(KNEE_MIN_DEG))
    # Heights over the ground under the knees (the bake lays the knees on the bank).
    ny, nz = ky + length * math.cos(stand), KNEE_FLAT[1] + length * math.sin(stand)
    dy, dz = w * (ny - py), w * (nz - pz)
    out['pelvis'] = (px, py + dy, pz + dz)
    t = f['pelvisTilt']
    out['pelvisTilt'] = (t[0] + min(0.0, dy) / KNEEL_RECLINE_M, t[1], t[2])
    return out


def R3OnBank(T, f, kneel=1.0):
    return BankLegs(T, BankKneel(T, f, kneel), lambda x, y: R3Bank(T, x, y), (0.0, KneelSpot(T)[1]))


def R3BankReview(T):
    """The bank and the planks behind R3 for the Blender review stills."""
    s = T.s
    X = (T.R(-1.0), T.R(1.0))
    ys = [y / 20 / s for y in range(-8, 13)]
    faces = [('poly', [(X[0], a, R3Bank(T, 0, a)), (X[1], a, R3Bank(T, 0, a)), (X[1], b, R3Bank(T, 0, b)),
                       (X[0], b, R3Bank(T, 0, b))], None, 0) for a, b in zip(ys, ys[1:]) if a < R3WallY(T, 0)]
    y0, z0, top = R3WallY(T, 0), R3Bank(T, 0, R3WallY(T, 0)), T.R(1.6)
    zu = (KNEEL_FACE[1] - KneelBankOld(-KNEEL_SHIFT * s)) / s
    return faces + [('poly', [(X[0], y0, z0), (X[1], y0, z0), (X[1], y0, zu), (X[0], y0, zu)], None, 0),
                    ('poly', [(X[0], y0, zu), (X[1], y0, zu), (X[1], R3WallY(T, top), top), (X[0], R3WallY(T, top), top)], None, 0)]


def R3ToDrag(p):
    """R3 point -> drag root (R3 is the drag root turned by DRAG_TURN about DRAG_END)."""
    x, y = _Rot(p[0], p[1], DRAG_TURN)
    return (x + DRAG_END[0], y + DRAG_END[1], p[2])


# The planks stand 0.49 m behind R3's origin at the foot (source): flat on their insteps behind him the
# toes reached 0.53 m. The ankles come in and the heels out, the toes turn in (as a man sitting between his
# heels), so the feet end in front of the planks once BankLegs lays them up the slope.
KNEEL_FEET = (.22, 0.0, 40.0)   # source: ankles at most this far back, heels this much further out; toe-in (deg)


def KneelFeet(T, f):
    back, splay, turn = KNEEL_FEET
    out = dict(f)
    for s, sign in (('L', 1), ('R', -1)):
        a, p = f['ankle.' + s], f.get('foot.' + s) or (0, 0, 0)
        out['ankle.' + s] = (a[0] + sign * splay, min(a[1], back), a[2])
        out['foot.' + s] = (p[0], p[1] + sign * turn, p[2])
    return out


def R3Kneel(T):
    """The kneel he is dropped into, R3 local (upright on both knees, no wall contact yet)."""
    return KneelFeet(T, KneelFlat(T, 0.0, 0.0))


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
        # (2026-09-26: off the bank the right leg comes in straight ahead as he is hauled up; fallen out to his
        # right it swept into ijaA's planted left leg.)
        (0.60, {'ankle.R': (.30 - H + .06, .22 - .46, A), 'legPole.R': (.30 - H, -1.2, .45),
                'pelvis': (.30, .10, .22), 'pelvisTilt': (.30, .05, .12), 'bend': .45, 'lean': .05, 'twist': -.05,
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
        # (2026-09-27: his knees and feet are dragged along with him, off the bank toward R3; left where they
        # trailed at 1.7 s they stayed on the bank and up against the planks through the jerk up.)
        (2.00, {'pelvis': (ex, ey - .02, .36), 'hand.R': (-.496, -.915, .785), 'armPole.R': (-.222, -.877, .388), 'turn': 0.0,
                **{k: Add3(kneelMid[k], (ex - .26, ey - .02 + .38, 0)) for k in ('ankle.L', 'ankle.R', 'legPole.L', 'legPole.R')}}),
        # "立て！" -- jerked up and round by the collar; the head snaps back, the legs do not hold.
        (2.20, {'pelvis': (ex, ey, kz + .16), 'pelvisTilt': (.10, 0, 0), 'bend': .18, 'turn': -.55,
                'head': (-.12, 0, 0), 'neck': (-.05, 0, 0), 'shrug': .20,
                'hand.R': (-.316, -.645, .944), 'armPole.R': (-.22, -.458, .76)}),
        (2.45, {'pelvis': (ex, ey, kz + .08), 'bend': .25, 'head': (.15, 0, .05), 'turn': -1.25,
                'hand.R': (-.284, -.510, .871), 'armPole.R': (-.161, -.354, .687)}),
        (2.75, {'pelvis': kneel['pelvis'], 'ankle.L': kneel['ankle.L'], 'ankle.R': kneel['ankle.R'],
                'legPole.L': kneel['legPole.L'], 'legPole.R': kneel['legPole.R'], 'foot.L': kneel['foot.L'], 'foot.R': kneel['foot.R'],
                'turn': DRAG_TURN, 'armPole.R': armBase,
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


# The drag starts from the heap on the bank and is hauled off it: the bank shift fades out while he is
# dragged on his knees (1.2-2.2 s, slow enough for ijaB's planted feet), before the jerk up on "立て！"
# (2.2 s), so the kneel at the end -- and with it ComradeWallRoot and the interrogation -- stays put.
DRAG_OFF_BANK = lambda t: 1 - Smooth((t - 1.2) / 1.0)


def DragKnee(T, f, t):
    """The kneeling knees in the drag root: under the dragged man (KneelFlat's femur foot, turned with him)
    until he is dropped onto them, then R3's (KneelSpot), where CaptiveWallBrace keeps them."""
    p, psi = f['pelvis'], f.get('turn') or 0.0
    kx, ky = _Rot(0.0, -.13, psi)
    r3, w = R3ToDrag((0.0, KneelSpot(T)[1], 0.0)), Smooth((t - 2.45) / .30)
    return (Mix(p[0] + kx, r3[0], w), Mix(p[1] + ky, r3[1], w))


@Builder('CaptiveDraggedFromDirt')
def BuildCaptiveDragged(T, name):
    raw = DragVictimKeys(T)

    def anim(t):
        # Off the heap's bank (OnBank fades 1.2-2.2 s) and on his knees on the real ground: from 1.2 s the feet
        # are laid on the bank the way the R3 kneel's are (BankLegs, the same ground seen from this root), so the
        # last frame is CaptiveWallBrace's first.
        f = raw(t)
        knee, back = DragKnee(T, f, t), _Rot(0.0, 1.0, f.get('turn') or 0.0)
        f = OnBank(T, f, DRAG_OFF_BANK(t))
        # Dropped onto his knees at R3: the seat of the bank kneel (BankKneel, worked out in R3).
        wK = Smooth((t - 2.45) / .30)
        if wK > 0:
            ex, ey = DRAG_END
            p = f['pelvis']
            x, y = _Rot(p[0] - ex, p[1] - ey, -DRAG_TURN)
            k = BankKneel(T, {'pelvis': (x, y, p[2]), 'pelvisTilt': f['pelvisTilt']}, wK)
            x, y = _Rot(k['pelvis'][0], k['pelvis'][1], DRAG_TURN)
            f['pelvis'], f['pelvisTilt'] = (x + ex, y + ey, k['pelvis'][2]), k['pelvisTilt']
        f = BankLegs(T, f, lambda x, y: DragBank(T, x, y), knee, back, 1 - DRAG_OFF_BANK(t))
        return Turned(f, f['turn'])

    def Ground(x, y, t):
        w = DRAG_OFF_BANK(t)
        return w * BankHeight(T, x) + (1 - w) * DragBank(T, x, y)
    return {'pose': lambda t: T.Nest(anim(t)), 'ground': Ground,
            'walls': lambda t: BankWalls(T) if DRAG_OFF_BANK(t) > .99 else PlankWalls(T, DRAG_ROOT_SOUTH, 0) if DRAG_OFF_BANK(t) < .01 else [],
            'reviewProps': lambda t: BankReview(T),
            'reviewViews': [('side', (-3.4, -.3, .8), (.25, -.2, .45)), ('q', (-2.4, -2.9, 1.7), (.25, -.2, .45))],
            'reviewFrames': lambda n: [0, int(n * .14), int(n * .3), int(n * .5), int(n * .62), int(n * .75), n - 1],
            'reviewScale': 2.6}


@Builder('BlastDazedStir')
def BuildDazedStir(T, name):
    """Wake .. the drag: stunned in the heap on the bank. Authored on the flat heap (DragVictimKeys
    frame 0, which is BuriedBase with the left hand ready for the body frame) and carried onto the
    bank like BlastSlamBuried's last frame, so frame 0 = the last frame = both neighbours' seam."""
    base = DragVictimKeys(T)(0.0)
    x0, y0 = .30, .22
    # Right hand to the ringing head: a body-frame wrist target at the side of the head, blended in
    # from where it lies in the dirt (handRelW.R 0 = BuriedBase's world hand, palm and pole).
    # (2026-09-28: 0.05 -0.07 0.09 folded the elbow to 163 deg, the wrist 12 cm off the shoulder: the elbow
    # swung round the shoulder as the hand came up and went down, 48-55 deg in a frame.)
    HEAD_R = (.08, -.04, .15)
    # (2026-09-28) The hand's way up and down: blended straight between the dirt and the head in 0.4 s the wrist passed
    # the shoulder and the elbow swung round it. It now rises over 0.5 s (2.10-2.60) and drops over 0.4 s (3.45-3.85)
    # through a point in front of the chest (FRONT_R); the other channels keep their keys.
    FRONT_R = (.03, -.36, .00)
    handPath = Channel([(2.10, HEAD_R), (2.38, FRONT_R), (2.50, (.06, -.22, .08)), (2.60, HEAD_R), (3.45, HEAD_R),
                        (3.68, FRONT_R), (3.85, FRONT_R)])
    handWeight = lambda t: Smooth((t - 2.10) / .50) if t < 3.0 else 1 - Smooth((t - 3.45) / .40)
    base.update({'handRel.R': HEAD_R, 'poleRel.R': (-.45, .05, -.20), 'handRelW.R': 0.0,
                 'palmFw.R': base['palmF.R'], 'palmNw.R': base['palmN.R'],
                 'palmF.R': (.05, -.10, 1), 'palmN.R': (1, 0, .10)})
    # The left palm flat on the bank beside the hip, fingers forward-left: the push to sit up.
    push = {'hand.L': (x0 + .24, y0 - .20, .045), 'armPole.L': (x0 + .55, y0 + .25, .45),
            'palmF.L': (.35, -.9, -.05), 'palmN.L': (0, .05, -1), 'curl.L': .2}
    keys = [
        (0.00, {}),
        (0.70, {}),
        # The head comes up off the chest and lolls toward the bank, then the other way.
        (1.50, {'head': (.10, .14, -.12), 'neck': (.12, 0, 0), 'bend': .56, 'shrug': .06}),
        (2.05, {'head': (.16, -.14, .10), 'neck': (.10, 0, 0)}),
        # The right hand to the side of the head (groan); a slow shake inside the hand.
        (2.10, {'handRelW.R': 0.0, 'curl.R': base['curl.R']}),
        (2.50, {'handRelW.R': 1.0, 'curl.R': .35, 'head': (.22, -.06, .04), 'bend': .58}),
        (2.78, {'head': (.24, -.06, -.14)}),
        (3.06, {'head': (.24, -.06, .13)}),
        (3.34, {'head': (.27, -.06, -.06)}),
        (3.50, {'handRelW.R': 1.0}),
        # The hand drops back into the dirt; the left palm goes onto the bank.
        (3.85, {'handRelW.R': 0.0, 'curl.R': base['curl.R'], 'head': (.30, -.08, .04)}),
        (3.60, {k: base[k] for k in push}),
        (4.00, push),
        # He pushes himself up (strain), the trunk comes off the bank...
        (4.50, {'bend': .34, 'lean': -.02, 'pelvisTilt': (-.10, .02, .16), 'pelvis': (x0 - .03, y0, .15),
                'head': (.10, .02, -.04), 'neck': (.06, 0, 0), 'shrug': .10}),
        (4.80, {'bend': .37, 'head': (.13, .04, -.02)}),
        # ...and the arm gives: he sags back over onto the bank, the head drops.
        (5.10, {'bend': .68, 'lean': .16, 'pelvisTilt': base['pelvisTilt'], 'pelvis': base['pelvis'],
                'head': (.45, -.12, .12), 'neck': (.28, -.05, .05), 'shrug': .02}),
        (5.45, dict(push, **{'hand.L': (x0 + .20, y0 - .24, .06), 'curl.L': .35})),
        (5.95, {k: base[k] for k in ('bend', 'lean', 'head', 'neck', 'shrug', *push)}),
        (6.40, {}),
    ]
    anim = Anim(base, keys, {'head': .06, 'neck': .03}, periodic=True)

    def Pose(t):
        f = anim(t)
        f['handRelW.R'] = handWeight(t)
        f['handRel.R'] = handPath(t) if 2.10 <= t <= 3.85 else HEAD_R
        breath = math.sin(Tau * t / 1.6)         # four heavy breaths a loop
        f['bend'] += .03 * breath
        f['shrug'] += .025 * breath
        p = f['pelvis']
        f['pelvis'] = (p[0], p[1], p[2] + .004 * breath)
        f = OnBank(T, f)
        return T.Nest(Turned(f, f['turn']))
    return {'pose': Pose, 'ground': BankGround(T), 'walls': BankWalls(T),
            'reviewProps': lambda t: BankReview(T),
            'reviewViews': [('side', (-3.2, -.35, .8), (.2, -.1, .45)), ('q', (-2.3, -2.6, 1.6), (.2, -.1, .45)),
                            ('front', (.1, -2.9, .9), (.1, -.1, .45))],
            'reviewFrames': lambda n: [0, int(n * .3), int(n * .43), int(n * .7), int(n * .8)], 'reviewScale': 2.4}


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
    # With the man on the bank (BANK_SHIFT) he stands 0.28 m further back before the grab (his legs went into
    # the sitting man's) and 0.14 m at the grab (further, his arm reaching over the head met it).
    back = [(0.0, .80), (.30, .66), (.75, .66), (1.20, .60), (1.75, .52), (2.05, .62), (2.25, .64), (2.8, .58), (4.4, .58)]

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
    # knee went into the sitting man's raised right knee. (2026-09-26: 6 cm wider again for the man on the bank.)
    stance = {'L': (H + .32, -.02, T.A), 'R': (-(H + .04), .16, T.A)}
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
                             **{'hand.R': [(0.0, (-(SX + .05), -.05, P - .05))], 'protract.R': [(0.0, 0.0), (.30, GRIP_PROTRACT)],
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
    # (TengxianHumanoidV1 2026-09-26: starts at .80, not .72 -- the common skeleton's longer thighs met ijaA's, 8.7 cm)
    # (2026-09-27: 4 cm closer through the jerk up -- dropped at R3's bank kneel, 0.12 m further south, the arm
    # swung 3 cm out of reach at 2.45 s.)
    stand = [(0.0, .80), (.6, .80), (1.8, .80), (2.1, .64), (2.4, .58), (2.8, .57), (4.4, .58)]

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


R3_WALL_BOX = ('box', (0, WALL_R3_Y + .03, .7), (2.0, .06, 1.4), 0)


def R3Clip(T, spec):
    """An R3 clip on the real ground: grounded on the bank, walled by the planks, the bank in the stills."""
    env = R3WallEnv(T)
    assert all(abs(env[k] - KNEEL_WALL_ENV[k]) < .002 for k in env), ('KNEEL_WALL_ENV', env)
    spec.update({'ground': lambda x, y, t: R3Bank(T, x, y), 'walls': R3Walls(T)})
    props = spec.get('reviewProps')
    spec['reviewProps'] = lambda t: (props(t) if props else []) + R3BankReview(T)
    return spec
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
    k = KneelFeet(T, KneelFlat(T, 0.0, .02, sit=KNEEL_WALL_SIT))
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
    # Wrist target: the palm and fingers lie on the planks in front of it (they lean back with height).
    wallY = lambda z: R3WallY(T, z) - .055
    # 2026-09-28: the left hand reaches for the planks from the hanging arm over 0.22 s (0.32-0.54), the
    # world target already on the planks: it went there in two frames (0.36 m in one at 0.46 s, the forearm
    # turned 98 deg) from a world seed left at the drag's heap.
    start['hand.L'], start['armPole.L'] = (.24, wallY(kz + .30) - .03, kz + .30), (.55, -.20, kz)
    start['palmFw.L'], start['palmNw.L'] = (0, .2, 1), (0, 1, 0)
    # The blend weights of both hands are set in the pose (a key row would pin every other channel too): the left
    # hand leaves the hanging arm for the planks over 0.32-0.54 s and comes back into the body frame over 1.35-1.70 s,
    # the right one comes off the drag's world seed onto the bandage over 0.9-1.45 s (it went in 0.15 s).
    weightL = lambda t: 1 - Smooth(Clamp((t - .32) / .22)) if t < 1.0 else Smooth(Clamp((t - 1.35) / .35))
    weightR = lambda t: Smooth(Clamp((t - .90) / .55))
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
                'hand.L': (.24, wallY(kz + .30) - .03, kz + .30), 'palmFw.L': (0, .2, 1), 'palmNw.L': (0, 1, 0), 'curl.L': .15,
                'armPole.L': (.55, -.20, kz), 'handRelW.R': 0.0, 'handRelW.L': 0.0,
                **{key: end[key] for key in ('ankle.L', 'ankle.R', 'legPole.L', 'legPole.R', 'foot.L', 'foot.R')}}),
        (0.62, {'hand.L': (.24, wallY(kz + .22), kz + .22)}),
        # The loose earth gives: the palm slides down, shoulders and back take the wall.
        (1.20, {'hand.L': (.26, wallY(kz - .12), kz - .12), 'pelvis': end['pelvis'], 'lean': end['lean'] + .01,
                'pelvisTilt': Add3(end['pelvisTilt'], (-.02, 0, -.01)), 'bend': end['bend'] - .02, 'head': (.30, .08, .10)}),
        (1.35, {'handRelW.R': 1.0, 'handRelW.L': 0.0}),
        (1.70, {'handRelW.L': 1.0, 'curl.L': .5}),
        # Every channel lands on KneelWallBase, the world hand/pole seeds too: the arm IK keeps
        # the roll of its first solve, so the seeds decide the forearm twist the next clip starts on.
        (2.00, dict(end)),
    ]
    anim = Keys(start, rows, lag={'head': .05, 'neck': .03})

    def Pose(t):
        f = anim(t)
        f['handRelW.L'], f['handRelW.R'] = weightL(t), weightR(t)
        return T.Nest(R3OnBank(T, f))
    return R3Clip(T, {'pose': Pose, 'kneePlants': [('L', .62, 2.0), ('R', .62, 2.0)],
                      'reviewViews': R3_VIEWS,
                      'reviewFrames': lambda n: [0, int(n * .17), int(n * .26), int(n * .45), n - 1], 'reviewScale': 2.2})


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
        return T.Nest(R3OnBank(T, f))
    return R3Clip(T, {'pose': Pose, 'reviewViews': R3_VIEWS, 'kneePlants': [('L', 0, 3.0), ('R', 0, 3.0)], 'reviewScale': 2.2})


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
# 01: hair grab, blade, taunt. Victim root R3 (as CaptiveWallBrace); ijaA's root is the same spot for the grab, the
# draw and the cut. 2026-09-27 pinned-rescue rework (user: 「那个割喉的日军动作还需要优化现在看不出来是割喉」): the killing is
# seen first person from the pinned eye (shunzi.witnessEye), 2.27 m off the comrade's right front and 0.28 m over the
# trench floor (R3_EYE). ijaA used to stand at his right front, between the eye and the throat, and the eye saw his back.
# Now he stands at the comrade's LEFT shoulder, a little in front of it (the side away from the eye), facing his neck; his
# left fist in the hair at the back of the head wrenches the head back and turns the face ~50 deg toward the eye, so the
# stretched throat faces it, and the bayonet, held reversed out of the cross draw, is drawn across the front of the throat
# from the comrade's left to his right: a sweep across the picture, the follow-through out toward the eye.
# Where he stands is what the arms allow (browser review, 2026-09-27): further out to the left (x -0.36 .. -0.50) the knife
# hand could not reach round the neck and the straightened forearm went through the jaw; beside the shoulder (z > -0.12)
# his body was in the kneeling man's raised left arm. The comrade's left elbow goes up (not out toward him).
# =================================================================================
IJA_A_AT = {'x': -.23, 'z': -.175, 'yawDeg': -128}
# His root stands at the foot of the bank (just off R3's left, where the kneel spot's bank runs down to the trench
# floor), this much under R3's ground (runtime m, KNEEL_BANK at the root: SlashGroundSpec checks it; the runtime stands
# every actor on its own ground). The stages carry it as `yM` (the height of the actor's root over the anchor's): the
# partner tracks and the browser review place him that much lower, and his feet are laid on the bank (GroundFeet).
IJA_A_YM = -.117
# The retired wipe (IjaWipeSheathBayonet, no longer played) keeps the old spot it was baked at.
IJA_A_WIPE_AT = {'x': .20, 'z': -.53, 'yawDeg': 165}
# The pinned eye in the R3 frame (runtime m, Blender axes: +X his left, +Y back, up over R3's ground): +2.21 m to his
# right, 0.54 m ahead, 0.28 m over the trench floor, which is 0.15 m under R3's ground.
R3_EYE = (-2.21, -.54, .13)
R3_LOOK = (0.0, .12, .98)          # where the review camera at the eye looks: his throat and head
# IjaThroatSlash's length and its taunt hold loop (the director lets go at 2.0 s: ija.tauntHoldS after the cut at 0.24).
SLASH_T = 5.0
SLASH_HOLD = (2.0, SLASH_T)
# IjaReleaseSheathe: its length, the knife turned back over in the fist, pushed home in the scabbard.
RELEASE_T = 32 / 24                  # 1.333 s
RELEASE_TURN = (.30, .44)            # the knife turned back over in the fist
RELEASE_HOME = .80                   # pushed home in the scabbard
STAGES['slashGrab'] = {'anchor': 'comrade', 'notes': 'IjaHairGrabPull and CaptiveHeadPulledBack start together. ijaA stands at '
                       'the comrade\'s left shoulder (away from the pinned eye) on the trench floor at the foot of the bank '
                       '(yM: his root\'s ground under R3\'s).',
                       'actors': {'comrade': {'rig': 'TengxianNra02', 'clip': 'CaptiveHeadPulledBack', 'x': 0.0, 'z': 0.0, 'yawDeg': 0},
                                  'ijaA': dict(IJA_A_AT, yM=IJA_A_YM, rig='TengxianIja02', clip='IjaHairGrabPull')}}
STAGES['slashDraw'] = {'anchor': 'comrade', 'notes': 'IjaDrawBayonet starts 1.0 s into CaptiveHeadPulledBack (the hair is still held).',
                       'actors': {'comrade': {'rig': 'TengxianNra02', 'clip': 'CaptiveHeadPulledBack', 'x': 0.0, 'z': 0.0, 'yawDeg': 0},
                                  'ijaA': dict(IJA_A_AT, yM=IJA_A_YM, rig='TengxianIja02', clip='IjaDrawBayonet', offsetS=1.0)}}
STAGES['slashCut'] = {'anchor': 'comrade', 'notes': 'IjaThroatSlash and CaptiveThroatCut start together; the blade crosses at 0.24 s.',
                      'actors': {'comrade': {'rig': 'TengxianNra02', 'clip': 'CaptiveThroatCut', 'x': 0.0, 'z': 0.0, 'yawDeg': 0},
                                 'ijaA': dict(IJA_A_AT, yM=IJA_A_YM, rig='TengxianIja02', clip='IjaThroatSlash')}}
STAGES['slashTaunt'] = {'anchor': 'comrade', 'notes': 'CaptiveClutchThroat loops from IjaThroatSlash 1.0 s; both loop the same 3.0 s.',
                        'actors': {'comrade': {'rig': 'TengxianNra02', 'clip': 'CaptiveClutchThroat', 'x': 0.0, 'z': 0.0, 'yawDeg': 0, 'offsetS': 1.0},
                                   'ijaA': dict(IJA_A_AT, yM=IJA_A_YM, rig='TengxianIja02', clip='IjaThroatSlash')}}
STAGES['slashRelease'] = {'anchor': 'comrade', 'notes': 'IjaReleaseSheathe and CaptiveWallSlideTwitch start together (the fist '
                          'lets go at 0; IjaThroatSlash 2.0 s).',
                          'actors': {'comrade': {'rig': 'TengxianNra02', 'clip': 'CaptiveWallSlideTwitch', 'x': 0.0, 'z': 0.0, 'yawDeg': 0},
                                     'ijaA': dict(IJA_A_AT, yM=IJA_A_YM, rig='TengxianIja02', clip='IjaReleaseSheathe')}}
STAGES['slashWipe'] = {'anchor': 'comrade', 'notes': 'Retired 2026-09-27 (the director walks ijaA off from the taunt): '
                                                     'IjaWipeSheathBayonet was baked against the old CaptiveWallSlideTwitch '
                                                     'at the old spot in front of him and is kept as it was.',
                       'actors': {'comrade': {'rig': 'TengxianNra02', 'clip': 'CaptiveWallSlideTwitch', 'x': 0.0, 'z': 0.0, 'yawDeg': 0},
                                  'ijaA': dict(IJA_A_WIPE_AT, rig='TengxianIja02', clip='IjaWipeSheathBayonet')}}
PARTNER_SOURCES['TengxianNra02'].update({
    'CaptiveHeadPulledBack': ['collarFront', 'throat', 'hairNape'],
    'CaptiveThroatCut': ['collarFront', 'throat', 'hairNape'],
    'CaptiveClutchThroat': ['collarFront', 'throat', 'hairNape', 'shoulderL'],
    'CaptiveWallSlideTwitch': ['shoulderR', 'shoulderL', 'collarFront', 'thighL', 'throat', 'hairNape'],
})

Meta('CaptiveHeadPulledBack', 1.8, False, 'free', role='comrade', rig='TengxianNra02', rootMotion=False, stage='slashGrab', weaponState='dropped', weaponDropFrom='BlastSlamBuried',
     env=KNEEL_WALL_ENV,
     contacts=[{'t': .28, 'by': 'ijaA', 'part': 'hairNape', 'action': 'grab'},
               {'t': 0.0, 'limb': 'shoulderBack', 'action': 'lean', 'target': 'wall', 'untilT': .08},
               {'t': .30, 'limb': 'shoulderBack', 'action': 'release', 'target': 'wall'}],
     prev=['CaptiveKneelMud', 'CaptiveWallBrace'], next=['CaptiveThroatCut'],
     notes='2026-09-27: a fist in the hair at the back of his head (ijaA at his left shoulder): he is wrenched up off his '
           'heels and off the planks, the head torn back and turned to his right -- toward the pinned eye -- so the stretched '
           'throat faces it; both hands fly up to the wrist in his hair and claw at it while the bayonet is drawn '
           '(covers IjaHairGrabPull + IjaDrawBayonet).')
Meta('IjaHairGrabPull', 1.0, False, 'track', role='ijaA', rig='TengxianIja02', props=['weapon'], rootMotion=True,
     stage='slashGrab', weaponState='slungBack',
     contacts=[{'t': .28, 'limb': 'handL', 'action': 'grab', 'partnerRole': 'comrade', 'part': 'hairNape', 'standoffM': .03},
               {'t': .42, 'limb': 'handL', 'action': 'yank', 'partnerRole': 'comrade'}],
     next=['IjaDrawBayonet'],
     notes='2026-09-27: a step in at the comrade\'s left shoulder, the left fist into the hair at the back of his head and '
           'a hard wrench: the head back and turned away from him (toward the pinned eye). No pause before the draw.')
Meta('IjaDrawBayonet', .8, False, 'track', role='ijaA', rig='TengxianIja02', props=['weapon', 'bayonet'], rootMotion=False,
     stage='slashDraw', weaponState='slungBack',
     contacts=[{'t': 0, 'limb': 'handL', 'action': 'hold', 'partnerRole': 'comrade', 'part': 'hairNape', 'standoffM': .03},
               {'t': .22, 'limb': 'handR', 'action': 'grip', 'target': 'bayonet', 'part': 'handle'},
               {'t': .30, 'limb': 'handR', 'action': 'draw', 'target': 'bayonet'},
               {'t': .51, 'limb': 'handR', 'action': 'turnGrip', 'target': 'bayonet'}],
     events=[{'t': .30, 'kind': 'bayonetDraw', 'sound': 'bladeScrape'}],
     prev=['IjaHairGrabPull'], next=['IjaThroatSlash'],
     notes='The left fist keeps the head wrenched back; the right hand crosses to the scabbard on the left hip and draws the '
           'bayonet out blade down (reversed), brings it up in front of his chest and turns it over in the fist to a forward '
           'grip (0.44-0.58), then reaches round in front of the comrade\'s neck and lays the edge on the right of his throat, '
           'the fist in front of the neck (last frame = IjaThroatSlash frame 0). 2026-09-29: a closed fist round the handle.')
Meta('IjaThroatSlash', SLASH_T, False, 'track', role='ijaA', rig='TengxianIja02', props=['weapon', 'bayonet'], rootMotion=False,
     stage='slashCut', weaponState='slungBack', holdLoop=list(SLASH_HOLD),
     contacts=[{'t': 0, 'limb': 'bayonet', 'action': 'press', 'partnerRole': 'comrade', 'part': 'throat'},
               {'t': .24, 'limb': 'bayonet', 'action': 'cut', 'partnerRole': 'comrade', 'part': 'throat'},
               {'t': 0, 'limb': 'handL', 'action': 'hold', 'partnerRole': 'comrade', 'part': 'hairNape', 'standoffM': .03},
               # the taunt hold (stage slashTaunt, against CaptiveClutchThroat): the fist in the hair, the blade wiped on
               # his left shoulder
               {'t': 1.0, 'limb': 'handL', 'action': 'hold', 'partnerRole': 'comrade', 'part': 'hairNape', 'standoffM': .03},
               {'t': 1.24, 'limb': 'bayonet', 'action': 'wipe', 'partnerRole': 'comrade', 'part': 'shoulderL'}],
     events=[{'t': .24, 'kind': 'throatCut'}, {'t': .72, 'kind': 'hairShake'}, {'t': 1.24, 'kind': 'bladeWipe'},
             {'t': 1.6, 'kind': 'hairShake', 'line': 'CaptiveTaunt.01'}, {'t': 2.8, 'kind': 'hairShake', 'line': 'CaptiveTaunt.02'}],
     prev=['IjaDrawBayonet'], next=['IjaReleaseSheathe'],
     notes='2026-09-29 pull cut: the edge laid on the right of the throat and pressed in (0-0.12 s, a short push seats it), then '
           'one hard pull back toward his right hip draws it round the front of the neck -- the fist leads, the edge stays '
           'on the skin (it crosses the front of the throat at 0.24 s) and the blade slides through along its length; the '
           'trunk turns into the pull, the weight goes back. The pull runs out past his right hip and the bloody blade '
           'comes to rest low at his right side (0.4-1.0). The left fist keeps the head up and shakes it (0.72) while he '
           'leans in to jeer; 1.0-1.6 he lays the flat of the blade on the dying man\'s left shoulder and wipes it once '
           'along its length. 2.0-5.0 is a seamless hold loop with two more shakes (the director lets go at 2.0: '
           'ija.tauntHoldS after the cut).')
Meta('IjaReleaseSheathe', RELEASE_T, False, 'track', role='ijaA', rig='TengxianIja02', props=['weapon', 'bayonet'], rootMotion=False,
     stage='slashRelease', weaponState='slungBack',
     contacts=[{'t': 0, 'limb': 'handL', 'action': 'hold', 'partnerRole': 'comrade', 'part': 'hairNape', 'standoffM': .03},
               {'t': .05, 'limb': 'handL', 'action': 'release', 'partnerRole': 'comrade'},
               {'t': .37, 'limb': 'handR', 'action': 'turnGrip', 'target': 'bayonet'},
               {'t': RELEASE_HOME, 'limb': 'bayonet', 'action': 'sheathe', 'target': 'scabbard'},
               {'t': .92, 'limb': 'handR', 'action': 'release', 'target': 'bayonet'}],
     events=[{'t': 0.0, 'kind': 'releaseHair'}, {'t': RELEASE_HOME, 'kind': 'bayonetSheathe', 'sound': 'bladeSheath'}],
     prev=['IjaThroatSlash'], next=['IjaTauntWalk'],
     notes='2026-09-29 (user: 「朝着玩家走过来的时候没有收起来的小刀」): frame 0 = IjaThroatSlash at 2.0 s (the start of its hold '
           'loop, where the director lets go). The fist opens with a shove off the head of the dying man; the wiped knife comes '
           'in front of his chest and is turned back over in the fist to the reversed grip (0.30-0.44, the turn of '
           'IjaDrawBayonet run backwards), goes down into the scabbard on his left hip and is pushed home (0.80), his eyes down on it; '
           'the hand comes off the handle and hangs free. Then he walks off empty-handed (IjaTauntWalk).')
Meta('CaptiveThroatCut', 1.0, False, 'free', role='comrade', rig='TengxianNra02', rootMotion=True, stage='slashCut', weaponState='dropped', weaponDropFrom='BlastSlamBuried',
     env=KNEEL_WALL_ENV,
     contacts=[{'t': .24, 'by': 'ijaA', 'part': 'throat', 'action': 'cut'},
               {'t': .44, 'limb': 'handR', 'action': 'clutch', 'target': 'self.throat'}],
     events=[{'t': .24, 'kind': 'bloodSpray', 'at': 'throat'}, {'t': .30, 'kind': 'effort', 'what': 'chokedGurgle'}],
     prev=['CaptiveHeadPulledBack'], next=['CaptiveClutchThroat'],
     notes='The cut lands: a full-body jolt, the right hand drops off the fist and clamps on the throat (2026-09-29: the left '
           'keeps clawing at the fist in his hair until ijaA lets go; in the old bake both hands came down and the left '
           'elbow went through ijaA), the legs go -- the seat '
           'sinks toward the heels (0.56 s) and he hangs from the fist in his hair, which keeps the face turned up toward '
           'the pinned eye (2026-09-27: his back no longer slams onto the planks; he falls back onto them when let go).')
Meta('CaptiveClutchThroat', 3.0, True, 'free', role='comrade', rig='TengxianNra02', rootMotion=False, stage='slashTaunt', weaponState='dropped', weaponDropFrom='BlastSlamBuried',
     env=KNEEL_WALL_ENV,
     events=[{'t': .30, 'kind': 'spasm'}, {'t': 1.2, 'kind': 'spasm'}, {'t': 2.2, 'kind': 'spasm'},
             {'t': .60, 'kind': 'hairShake'}, {'t': 1.80, 'kind': 'hairShake'}],
     prev=['CaptiveThroatCut'], next=['CaptiveWallSlideTwitch'],
     notes='The right hand clamped on the throat, the left still on the fist in his hair, choking spasms, the head held up by the fist and shaken twice per loop '
           '(in step with the IjaThroatSlash hold window).')
Meta('CaptiveWallSlideTwitch', 3.2, False, 'free', role='comrade', rig='TengxianNra02', rootMotion=True, stage='slashWipe', weaponState='dropped', weaponDropFrom='BlastSlamBuried',
     env=KNEEL_WALL_ENV, terminal=True,
     contacts=[{'t': .55, 'limb': 'shoulderBack', 'action': 'slide', 'target': 'wall', 'untilT': 1.2},
               {'t': 1.6, 'limb': 'shoulderBack', 'action': 'rest', 'target': 'wall', 'untilT': 3.2}],
     events=[{'t': 0.0, 'kind': 'released'}, {'t': 1.6, 'kind': 'twitch'}, {'t': 2.1, 'kind': 'twitch'},
             {'t': 2.5, 'kind': 'twitch'}, {'t': 3.2, 'kind': 'dead', 'fact': 'captivesKilled'}],
     prev=['CaptiveClutchThroat'], next=[],
     notes='Let go: the head drops, his left hand comes off his hair to his throat (0.05-0.45 s), he falls back onto the planks (0.55 s), the seat sags to his right on his heels and he slides down the planks over to his '
           'right -- he dies kneeling on the bank; one hand slips off the throat, the legs jerk three times and stop. '
           'Last frame is the corpse (hold it; replaces ShotCollapse).')
WIPE_LEAD = 3.2     # IjaWipeSheathBayonet: the release and the watch while CaptiveWallSlideTwitch plays
Meta('IjaWipeSheathBayonet', WIPE_LEAD + 2.4, False, 'track', role='ijaA', rig='TengxianIja02', props=['weapon', 'bayonet'],
     rootMotion=True, stage='slashWipe', weaponState='slungBack',
     contacts=[{'t': 0.0, 'limb': 'handL', 'action': 'hold', 'partnerRole': 'comrade', 'part': 'collarFront', 'standoffM': .03},
               {'t': .05, 'limb': 'handL', 'action': 'release', 'partnerRole': 'comrade'},
               {'t': WIPE_LEAD + .55, 'limb': 'bayonet', 'action': 'wipe', 'partnerRole': 'comrade', 'part': 'shoulderL'},
               {'t': WIPE_LEAD + .85, 'limb': 'bayonet', 'action': 'lift'},
               {'t': WIPE_LEAD + 1.50, 'limb': 'bayonet', 'action': 'sheathe', 'target': 'scabbard'},
               {'t': WIPE_LEAD + 2.30, 'limb': 'handR', 'action': 'grip', 'target': 'weapon', 'part': 'barrel'}],
     events=[{'t': 0.0, 'kind': 'releaseHair'}, {'t': WIPE_LEAD + 1.5, 'kind': 'bayonetSheathe', 'sound': 'bladeSheath'}],
     prev=['IjaThroatSlash'], next=['IjaReadyRifle'], retired='20260927',
     notes='Retired 2026-09-27 (not played: the director walks ijaA off taunting, IjaTauntWalk, and he sheathes the bayonet in '
           'IjaFoundLook); kept as baked 2026-09-27 V12 against the old collar-hold chain at the old spot (stage slashWipe). '
           'Frame 0 was the old IjaThroatSlash hold pose: the fist opens (0.05 s) and drops, the knife stays low at '
           'the hip while he watches the man slide down the wall (to 3.2 s). Then he stoops, drags the flat of the blade once '
           'across the dead man\'s left shoulder, straightens, sheathes on the left hip and reaches over the right shoulder for '
           'the slung rifle (last frame = IjaReadyRifle frame 0).')
Meta('IjaReadyRifle', 1.1, False, 'track', role='ijaA', rig='TengxianIja02', props=['weapon'], rootMotion=False,
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


# The sheathed hilt over the left hip (runtime m up from the pelvis joint). 2026-09-29: 0.09 (was 0.04, at the belt): the
# Type 30 frog carries the hilt standing above the belt, and at the belt the right hand could not reach it across the
# body -- the sheathe after the throat cut (IjaReleaseSheathe) and the draw stopped 9-12 cm short of it.
SCABBARD_UP = .09


def ScabbardKnife(T):
    """Sheathed: handle just in front of the left hip, blade down and back (posed bones)."""
    f = BodyFrame(T.K)
    handle = f['pelvis'] + f['left'] * T.R(.13) - f['back'] * T.R(.12) + f['up'] * T.R(SCABBARD_UP)
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


# 2026-09-29 (user: 「割喉的时候的手部动作……更写实更物理一些」): the fist round the bayonet. The grip curl bends the first
# two joints of each finger (47 and 63 deg at curl 1.1) and leaves the tips straight, and the handle sat on the knuckle
# line: in the game that read as an open hand holding the knife between its fingers. A knife fist curls further
# (KNIFE_CURL), the tips close round the handle (CloseFist: the last joint turned KNIFE_TIP of the joint before it) and
# the handle lies in the fist, KNIFE_IN palmward of the knuckles (FistKnife).
KNIFE_CURL = 1.55
KNIFE_TIP = .8
KNIFE_IN = .016      # runtime m


def FistFrame(T, side='R'):
    """(knuckles, palmar) of a posed hand: the finger-root centroid (the runtime grip point) and the direction the
    curled fingers close toward, square to the back of the hand."""
    K = T.K
    roots = [K['Point'](K['Bone'](side + ' Finger%d' % i)) for i in range(1, 5)]
    mids = [K['Point'](K['Bone'](side + ' Finger%d1' % i)) for i in range(1, 5)]
    knuckles = sum(roots, Vector()) / 4
    back = (knuckles - K['Point'](K['Bone'](side + ' Hand'))).normalized()
    closing = sum(mids, Vector()) / 4 - knuckles
    palmar = closing - back * closing.dot(back)
    return knuckles, (palmar.normalized() if palmar.length > 1e-6 else Vector((0, 0, -1)))


def FistKnife(T, axis, up=None, side='R'):
    """The bayonet in a closed fist (posed bones): handle centre KNIFE_IN palmward of the knuckles."""
    knuckles, palmar = FistFrame(T, side)
    return Knife(T, tuple(knuckles + palmar * T.R(KNIFE_IN)), axis, up)


def AimBone(K, bone, child, target):
    """Turn `bone` about its head so `child`'s head points at `target` (world, source m)."""
    at = K['Point'](bone)
    now, want = K['Point'](child) - at, Vector(target) - at
    if now.length < 1e-6 or want.length < 1e-6:
        return
    q = now.normalized().rotation_difference(want.normalized())
    K['Put'](bone, Matrix.Translation(at) @ q.to_matrix().to_4x4() @ Matrix.Translation(-at) @ K['BWorld'](bone))
    K['Update']()


def CloseFist(T, side='R', tip=KNIFE_TIP, thumb=0.0):
    """The finger tips close round the handle: each last joint turns `tip` of the turn of the joint before it (the
    grip curl leaves them straight). `thumb` 0..1: the thumb wraps over the curled index and middle fingers (a forward
    grip; at 0 it stays as the grip left it, on the pommel of a reversed grip). A spec's postGrip, after the grip pass
    has curled the fingers."""
    K = T.K
    for i in range(1, 5):
        mid, end = K['Bone'](side + ' Finger%d1' % i), K['Bone'](side + ' Finger%d2' % i)
        rest = K['rest'][mid.name].to_quaternion()
        bent = rest.rotation_difference(mid.matrix_basis.to_quaternion())
        loc, q, scale = K['rest'][end.name].decompose()
        end.matrix_basis = Matrix.LocRotScale(loc, q @ Quaternion().slerp(bent, tip), scale)
    K['Update']()
    if thumb > 1e-3:
        P, B = K['Point'], K['Bone']
        base, mid, end = B(side + ' Finger0'), B(side + ' Finger01'), B(side + ' Finger02')
        # the thumb's middle joint beside the index knuckle, its last joint over the middle of the curled index finger
        knuckle = P(B(side + ' Finger1'))
        overIndex = (P(B(side + ' Finger11')) + P(B(side + ' Finger12'))) / 2
        _, palmar = FistFrame(T, side)
        for bone, child, target in ((base, mid, knuckle + palmar * T.R(.022)), (mid, end, overIndex + palmar * T.R(.010))):
            now = P(child)
            AimBone(K, bone, child, now.lerp(target, thumb))


def WithFist(T, p, side='R', thumb=0.0):
    """T.Nest(f) whose `side` hand closes into a knife fist after the grip pass (`thumb`: CloseFist)."""
    before = p.get('postGrip')

    def PostGrip():
        if before:
            before()
        CloseFist(T, side, thumb=thumb)
    p['postGrip'] = PostGrip
    return p


def CarryPalm(a0, palm0, a1, palm1, w):
    """The fist's palm while the blade turns from a0 to a1 (w 0..1): palm0 carried round with the blade (the shortest
    turn), then rolled about the blade into palm1 as w reaches 1 -- no jump where KnifePalm changes its reference."""
    a0, a1 = Vector(a0).normalized(), Vector(a1).normalized()
    a = a0.lerp(a1, w)
    a = a.normalized() if a.length > 1e-6 else a1
    q = a0.rotation_difference(a)
    f, n = q @ Vector(palm0[0]), q @ Vector(palm0[1])
    end = a0.rotation_difference(a1)
    n1 = end @ Vector(palm0[1])
    roll = math.atan2(a1.dot(n1.cross(Vector(palm1[1]))), n1.dot(Vector(palm1[1])))
    r = Quaternion(a, roll * w)
    return tuple(a), (tuple(r @ f), tuple(r @ n))


def IjaABase(T):
    H, P, SX = T.H, T.P, T.SX
    f = Standing(T)
    f.update({'handRel.L': (.08, -.12, -.46), 'palmF.L': (0, -.2, -1), 'palmN.L': (-1, 0, 0), 'curl.L': .7,
              'handRel.R': (-.08, -.12, -.46), 'palmF.R': (0, -.2, -1), 'palmN.R': (1, 0, 0), 'curl.R': .7,
              'ankle.L': (H + .03, -.08, T.A), 'ankle.R': (-(H + .02), .10, T.A), 'foot.L': (0, 8, 0), 'foot.R': (0, -14, 0)})
    return f


def Pulse(t, c, w):
    return math.exp(-((t - c) / w) ** 2)


# ---- ijaA side ------------------------------------------------------------------------
def AReview(spec):
    spec['reviewViews'] = [('side', (-3.2, -.9, 1.0), (0, -.55, .70)), ('q', (-2.3, -3.2, 1.8), (0, -.5, .65)),
                           ('back', (1.6, 1.4, 1.5), (0, -.6, .6))]
    spec['reviewScale'] = 2.6
    return spec


def DrawBase(T):
    """ijaA while holding the collar: planted in the half step of IjaHairGrabPull."""
    return HairHoldPose(T)


def HairHoldPose(T):
    base = IjaABase(T)
    # The half step plants the left foot beside his right knee (0.20 m out to the left, the
    # knee turned out), not
    # between his thighs: straddling, the shin clears the kneeling man.
    # Tall over the kneeling man, looking down at him with the arm out to the collar -- stooped
    # (bend .38) his face ended up against the victim's.
    base.update({'ankle.L': Add3(base['ankle.L'], (.20, -.31, 0)), 'legPole.L': Add3(base['legPole.L'], (.25, -.13, 0)),
                 'pelvis': Add3(base['pelvis'], (0, -.25, -.03)),
                 'bend': .14, 'pelvisTilt': (.06, 0, 0), 'head': (.10, 0, 0)})
    return base


def HairHandPose(T):
    """HairHoldPose with the left gripping shoulder forward (legacy function name)."""
    return dict(HairHoldPose(T), **{'protract.L': HAIR_PROTRACT})


# TengxianHumanoidV1 (2026-09-26): the gripping shoulder comes forward (rad about the vertical: ~6 cm) -- the common skeleton's shoulder
# sits ~5 cm further back and its arm is 2.4 cm shorter than IJA02's own, and leaning the trunk in instead put
# his face into the comrade's (OpeningClipsBrowserTest stage overlap).
HAIR_PROTRACT = GRIP_PROTRACT


HAIR_GRAB_HAND_R = (-.04, -.16, -.42)     # ijaA's free right hand at the end of IjaHairGrabPull


WIPE_SQUAT = [float(v) for v in (__import__('os').environ.get('WIPESQUAT') or '.30,.02,.10').split(',')]   # bend, forward, down


WIPE_STROKE = [float(v) for v in (__import__('os').environ.get('WIPESTROKE') or '.15,.14').split(',')]   # fist to patch, pull


def WIPE_BACK_L(base):
    """ijaA's left foot stepped back and out while the man slides down beside it."""
    return Add3(base['ankle.L'], (.08, .20, 0))
TAUNT_STEP = [float(v) for v in (__import__('os').environ.get('TAUNTSTEP') or '.22,.12,.03,.20').split(',')]


def TauntStance(T):
    """ijaA over the man pinned against the wall (IjaThroatSlash 0.78 s on and its hold loop, and
    IjaWipeSheathBayonet frame 0): the right foot a step in, hips forward, leaning over him."""
    base = HairHoldPose(T)
    step, hips, sink, bend = TAUNT_STEP
    return {'ankle.R': Add3(base['ankle.R'], (0, -step, 0)), 'pelvis': Add3(base['pelvis'], (0, -hips, -sink)),
            'bend': bend, 'head': (.12, 0, .05)}


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


def IjaReadyBase(T):
    """The wider guard stance after the close-range collar grab."""
    ready = IjaABase(T)
    ready.update({'ankle.L': Add3(ready['ankle.L'], (.20, -.12, 0)),
                  'legPole.L': Add3(ready['legPole.L'], (.25, .05, 0)),
                  'pelvis': Add3(ready['pelvis'], (0, -.05, -.03)),
                  'bend': .20, 'pelvisTilt': (.06, 0, 0), 'head': (.22, 0, 0)})
    return ready


# ---- 2026-09-27 pinned rescue: helpers shared by the slash chain (comrade and ijaA) -------------------------------
def R3GroundRT(x, y):
    """Ground under the R3 point (x, y) (runtime m, Blender axes: +X his left = east, +Y back = north), runtime m over
    R3's own ground on the bank (KNEEL_BANK; the same ground R3Bank gives in source metres)."""
    shift = KNEEL_SHIFT * NRA02_SCALE
    return KneelBankOld(y - shift) - KneelBankOld(-shift) - KNEEL_BANK_WEST * x


def AnchorToRole(T, stage, role, p, direction=False):
    """A point (or a direction) in the stage anchor's frame (runtime m, Blender axes, height over the anchor's ground)
    -> `role`'s source frame (height over its own ground: the stage row's yM)."""
    me = STAGES[stage]['actors'][role]
    mx, my, myaw = _StageXY(me)
    if direction:
        x, y = _Rot(p[0], p[1], -myaw)
        return (x, y, p[2])
    x, y = _Rot(p[0] - mx, p[1] - my, -myaw)
    return (x / T.s, y / T.s, (p[2] - me.get('yM', 0.0)) / T.s)


def StageGround(T, stage, role):
    """ground(x, y) in `role`'s source frame (source m over its root's ground) for an actor on the R3 bank."""
    me = STAGES[stage]['actors'][role]
    mx, my, myaw = _StageXY(me)
    y0 = me.get('yM', 0.0)

    def G(x, y):
        rx, ry = _Rot(x * T.s, y * T.s, myaw)
        return (R3GroundRT(rx + mx, ry + my) - y0) / T.s
    return G


def StageWalls(T, stage, role):
    """The planks behind R3 (R3Walls) as wall planes in `role`'s source frame."""
    out = []
    for w in R3Walls(T):
        p, n = [c * T.s for c in w[0]], w[1]
        row = [AnchorToRole(T, stage, role, p), AnchorToRole(T, stage, role, n, True)]
        if len(w) > 2:
            row += [AnchorToRole(T, stage, role, [c * T.s for c in w[2]]), AnchorToRole(T, stage, role, w[3], True)]
        out.append(tuple(row))
    return out


def GroundFeet(T, f, G, frameYaw=0.0, hips=1.0):
    """Stand a flat-floor pose on uneven ground G(x, y): each foot pitches and rolls with the ground under its heel, toe
    and sides (sampled along the foot, not at the ankle: at the foot of the bank the toe is on the slope while the ankle
    is still over the floor), the ankle rises with the ground under the heel, and the pelvis by `hips` of the mean rise
    (the knees keep most of their bend)."""
    out = dict(f)
    rises = []
    for s, sign in (('L', 1), ('R', -1)):
        a = f.get('ankle.' + s)
        if a is None:
            continue
        p, y, r = f.get('foot.' + s) or (0, 0, 0)
        yaw = frameYaw + math.radians(y)
        fwd = Vector((math.sin(yaw), -math.cos(yaw), 0.0))   # rest foot forward -Y turned toes-left + (OrientFoot)
        out_ = Vector((-fwd.y, fwd.x, 0.0)) * sign                  # the foot's outside
        A = Vector((a[0], a[1], 0.0))
        heel, toe = A - fwd * T.R(.05), A + fwd * T.R(.20)
        hHeel, hToe = G(heel.x, heel.y), G(toe.x, toe.y)
        side = (G(*(A + out_ * T.R(.05))[:2]) - G(*(A - out_ * T.R(.05))[:2])) / T.R(.10)
        pitch = -math.degrees(math.atan((hToe - hHeel) / T.R(.25)))   # toes-down +: ground rising ahead lifts the toes
        roll = math.degrees(math.atan(side))                          # sole-out +: ground rising outside lifts the outer edge
        h = max(hHeel, G(a[0], a[1]))
        rises.append(h)
        out['ankle.' + s] = (a[0], a[1], a[2] + h)
        out['foot.' + s] = (p + pitch, y, r + roll)
    if rises:
        px, py, pz = f['pelvis']
        # the lower foot decides: the leg to the higher one bends more, the one to the lower one can still reach
        out['pelvis'] = (px, py, pz + hips * min(rises))
    return out


def ResetFingers(T, side):
    """Fingers of one hand back to rest (CurlFingers bends from the current pose: a hand re-solved after Nest's own
    pass must start from rest or it closes twice)."""
    K = T.K
    prefix = K['Bone']('Pelvis').name.split(' ')[0] + ' ' + side + ' Finger'
    for pb in K['arm'].pose.bones:
        if pb.name.startswith(prefix):
            pb.matrix_basis = K['rest'][pb.name]
    K['Update']()


def NestWorldHands(T, f, Targets):
    """T.Nest(f) whose hands with weight f['world.<side>'] > 0 are put on points of the POSED body (the partner is
    this body itself: the comrade's hands on the fist in his hair, on his own throat). Targets() -> {side: (grip, pole,
    palmF, palmN, curl)} world (source m), evaluated after the body is posed and the head aimed; the weight blends from
    the body-frame hand (handRel) to the grip. Two passes pin the grip point (finger roots) on the target."""
    sides = [s for s in LR if (f.get('world.' + s) or 0.0) > 1e-4]
    if not sides:
        return T.Nest(f)
    stash = {s: (f.get('handRel.' + s), f.get('poleRel.' + s), f.get('palmF.' + s), f.get('palmN.' + s), f.get('curl.' + s, .5))
             for s in sides}
    g = dict(f)
    for s in sides:
        g['handRel.' + s], g['palmF.' + s] = None, None
    p = T.Nest(g)
    before = p['post']
    K = T.K

    def Post():
        before()
        rows = Targets()
        for s in sides:
            rel, poleRel, pf, pn, curl = stash[s]
            grip, pole, wf, wn, wc = rows[s]
            w = Clamp(f['world.' + s])
            if rel is None:
                rel, w = (0.0, 0.0, 0.0), 1.0
            pf, pn = pf or (0, -.2, -1), pn or (1 if s == 'R' else -1, 0, 0)
            wrist = Vector(grip) - Vector(wf).normalized() * T.R(.085)
            for _ in range(2):
                ResetFingers(T, s)
                T.RelArm(s, rel, poleRel, pf, pn, Mix(curl, wc, w), world=tuple(wrist), weight=1.0 - w,
                         worldPole=tuple(pole), worldPalm=(tuple(wf), tuple(wn)))
                if w < .999:
                    break
                wrist += Vector(grip) - K['GripPoint'](s)
    p['post'] = Post
    p['resolved'] = tuple(set(p.get('resolved', ())) | set(sides))
    return p


# ---- the comrade (R3) --------------------------------------------------------------------------------------------
def R3EyeView(T):
    """The review cameras at the pinned eye (R3 frame, source m) on the throat and the head: the game's 65 deg and a
    22 deg close-up of the same line of sight (what a player's eye picks out)."""
    eye, look = tuple(v / T.s for v in R3_EYE), tuple(v / T.s for v in R3_LOOK)
    return [FirstPersonView(eye, look, name='eye'), FirstPersonView(eye, look, fov=22.0, name='eyeZoom')]


def R3Review(extra=None):
    return {'reviewViews': R3_VIEWS, 'reviewScale': 2.4}


def WrenchLook(T, turnDeg, pitchDeg):
    """The point the wrenched face looks at (R3 source m): turnDeg to his right, pitchDeg up, 3 m off the head. The fist
    in his hair turns the face toward the pinned eye (76 deg to his right) and tips it back: the throat faces the eye."""
    a, p = math.radians(turnDeg), math.radians(pitchDeg)
    d = Vector((-math.sin(a) * math.cos(p), -math.cos(a) * math.cos(p), math.sin(p)))
    return tuple((Vector((.04, .14, 1.0)) + d * 3.0) / T.s)


# His hands on ijaA's wrist in his hair: grip points (runtime m, R3 axes) from the hair patch -- the left hand round the
# forearm on the side it comes from (east, toward ijaA), the right over the top of the fist -- fingers / palm facing,
# and the elbows (from each shoulder, runtime m): out to the sides and up.
# The right arm goes up behind his head (the elbow high and back toward the planks), never across the face: the pinned
# eye is at his right front and must see the throat.
FIST_GRIP = {'L': (-.02, -.06, .10), 'R': (-.02, .05, .07)}
FIST_PALM = {'L': ((-.2, .35, .9), (.6, .75, .1)), 'R': ((.75, .2, -.6), (.1, -.3, -.95))}
FIST_POLE = {'L': (.02, .02, .60), 'R': (-.25, .40, .55)}


def FistTargets(T):
    K = T.K
    hair, _ = K['ContactWorld']('hairNape')
    out = {}
    for s in LR:
        shoulder = K['Point'](K['Bone'](s + ' UpperArm'))
        out[s] = (tuple(hair + Vector(FIST_GRIP[s]) / T.s), tuple(shoulder + Vector(FIST_POLE[s]) / T.s),
                  Unit(FIST_PALM[s][0]), Unit(FIST_PALM[s][1]), 1.0)
    return out


def ThroatAxes(point, normal):
    """(throat point, horizontal outward normal, his-left along the throat)."""
    up = Vector((0, 0, 1))
    n = Vector(normal) - up * Vector(normal).dot(up)
    n = n.normalized() if n.length > 1e-6 else Vector((0, -1, 0))
    return Vector(point), n, up.cross(n).normalized()


def ThroatTargets(T, press=0.0):
    """Both hands clamped on his own throat, whichever way the fist has turned his head: the right palm flat across the
    front (fingers to his left), the left hand over it from his left side (fingers to his right). Grip points (finger
    roots). 2026-09-29: the right hand 3.8 cm lower -- the patch is carried by the head, and with the head wrenched back
    the hand at its height covered his mouth, not his throat; the left hand comes from his left side with the elbow down
    (reaching across to the right of his throat, its elbow stuck out into ijaA, who stands at that shoulder)."""
    K = T.K
    P, n, a = ThroatAxes(*K['ContactWorld']('throat'))
    up = Vector((0, 0, 1))
    shoulders = {s: K['Point'](K['Bone'](s + ' UpperArm')) for s in LR}
    gripR = P + (a * .042 + n * (.030 - .012 * press) - up * .050) / T.s
    gripL = P + (a * .020 + n * (.058 - .012 * press) - up * .022) / T.s
    return {'R': (tuple(gripR), tuple(shoulders['R'] + Vector((-.30, -.05, -.45)) / T.s), tuple(a), tuple(-n), .35),
            'L': (tuple(gripL), tuple(shoulders['L'] + Vector((.04, -.12, -.45)) / T.s), tuple(-a), tuple(-n), .35)}


def ComradeHands(T, f):
    """The hands' world targets: on the fist in the hair (throatMix 0) or on the throat (1), blended."""
    def Blend(a, b, w):
        w = Smooth(w)
        return (Lerp3(a[0], b[0], w), Lerp3(a[1], b[1], w), Unit(Lerp3(a[2], b[2], w)), Unit(Lerp3(a[3], b[3], w)),
                Mix(a[4], b[4], w))

    def Targets():
        mix = Clamp(f.get('throatMix', 0.0))
        # leftHair: his left hand stays on the fist in his hair after the cut (the right clamps the throat) until ijaA
        # lets go (2026-09-29: both hands dropping from the hair at once, the left elbow swung through ijaA, who stands
        # at that shoulder -- the old bake snapped that elbow down in one frame, which the bake's elbow limit now stops).
        hair = Clamp(f.get('leftHair', 0.0))
        fist = FistTargets(T) if mix < .999 or hair > 1e-3 else None
        throat = ThroatTargets(T, f.get('press', 0.0)) if mix > 1e-3 else None
        if throat is None:
            return fist
        out = {s: Blend(fist[s], throat[s], mix) for s in LR} if fist is not None else dict(throat)
        # On the way down from the fist in his hair the elbows swing in across his chest (the poles lean inward half way).
        bump = 4 * Smooth(mix) * (1 - Smooth(mix))
        for s, lean in (('L', (-.35, -.20, 0)), ('R', (.30, -.20, 0))):
            g, pole, pf, pn, c = out[s]
            out[s] = (g, tuple(Vector(pole) + Vector(lean) / T.s * bump), pf, pn, c)
        if hair > 1e-3:
            out['L'] = Blend(out['L'], fist['L'], hair)
        return out
    return Targets


def ComradeNest(T, f, kneel=1.0):
    g = R3OnBank(T, f, kneel)
    return NestWorldHands(T, g, ComradeHands(T, g))


def ComradeThroatCheck(T, since, sides=LR):
    """The contact check of the clutch: each grip point on its throat target (the posed throat, at check time)."""
    def Check(t):
        if t < since:
            return {}
        rows = ThroatTargets(T)
        return {s: rows[s][0] for s in sides}
    return Check


def WrenchedPelvis(T):
    """Hauled up by the hair: off the heels (sit .35), a little toward the fist (his left) and forward."""
    return Add3(KneelFlat(T, 0.0, .02, sit=.30)['pelvis'], (0, -.04, -.02))


def HeadPulledBackKeys(T):
    """KneelWallBase (CaptiveKneelMud frame 0) -> the fist in the hair wrenches him up and turns the face toward the
    pinned eye; the hands fly to the wrist in his hair and claw at it; he struggles in the grip to 1.8 s."""
    base = dict(KneelWallBase(T), look=WrenchLook(T, 12, -20), lookW=0.0, lookLimit=80.0, throatMix=0.0, press=0.0,
                **{'world.L': 0.0, 'world.R': 0.0})
    b = base
    rows = [
        (0.00, {}),
        # The hand at his hair: a start, the shoulders come up.
        (0.08, {}),
        # The hand at his hair: he starts up off the planks away from it, the shoulders up (the left elbow comes forward:
        # out to the side it went into ijaA, who stands at that shoulder).
        (0.22, {'head': Add3(b['head'], (-.05, 0, -.03)), 'shrug': b['shrug'] + .08, 'bend': b['bend'] + .22,
                'pelvis': Lerp3(b['pelvis'], WrenchedPelvis(T), .6), 'pelvisTilt': Add3(b['pelvisTilt'], (.10, 0, 0)), 'lean': 0.0,
                'poleRel.L': (.02, .02, .50)}),
        # (2026-09-29: the left elbow stays up on the way to the wrist in his hair -- ijaA stands at that shoulder; keyed
        # forward and down here, the elbow swung through ijaA's chest as the swivel limit turned it back up)
        (0.30, {'world.R': 0.0, 'handRel.L': (-.12, -.22, .02), 'poleRel.L': (-.02, -.10, .45)}),
        (0.46, {'world.L': 0.0}),
        # Wrenched: the seat off the heels and the back off the planks, the trunk hauled toward the fist and twisted to
        # his right, the head torn back and round toward the eye (the throat stretched and turned to it).
        (0.42, {'pelvis': WrenchedPelvis(T), 'pelvisTilt': (-.16, .02, .02), 'bend': .30, 'lean': -.06, 'twist': -.22,
                'shrug': .26, 'neck': (-.16, 0, -.18), 'look': WrenchLook(T, 43, 28), 'lookW': 1.0}),
        (0.52, {'world.R': 1.0}),
        (0.68, {'world.L': 1.0}),
        # Clawing at the wrist; the fist wrenches the head again and again.
        (0.64, {'look': WrenchLook(T, 55, 20), 'twist': -.20, 'shrug': .22}),
        (0.95, {'look': WrenchLook(T, 48, 25), 'lean': -.08, 'shrug': .25}),
        (1.25, {'look': WrenchLook(T, 54, 19), 'shrug': .22, 'twist': -.23}),
        (1.55, {'look': WrenchLook(T, 49, 24), 'lean': -.06, 'shrug': .25}),
        (1.80, {'look': WrenchLook(T, 52, 22), 'twist': -.22, 'shrug': .24}),
    ]
    return Keys(base, rows, lag={'head': .04, 'neck': .03})


@Builder('CaptiveHeadPulledBack')
def BuildHeadPulledBack(T, name):
    anim = HeadPulledBackKeys(T)

    spec = {'pose': lambda t: ComradeNest(T, anim(t)),
            'kneePlants': [('L', 0, 1.8), ('R', 0, 1.8)],
            'reviewFrames': lambda n: [0, int(n * .16), int(n * .24), int(n * .3), n - 1]}
    spec.update(R3Review())
    spec = R3Clip(T, spec)
    spec['reviewViews'] = R3_VIEWS + R3EyeView(T)
    return spec


def ThroatCutKeys(T):
    """The cut lands (0.24 s): a jolt, the hands drop off the fist onto the throat (0.28-0.44), the legs go -- the seat
    sinks toward the heels and he hangs slumped from the fist in his hair, which keeps the face up and toward the eye
    (the back does not reach the planks until the fist lets go: CaptiveWallSlideTwitch)."""
    base = HeadPulledBackKeys(T)(1.8)
    b = base
    sag = Add3(KneelFlat(T, 0.0, .02, sit=.52)['pelvis'], (0, -.04, -.02))
    rows = [
        (0.00, {}),
        (0.24, {'shrug': b['shrug'] + .08, 'bend': b['bend'] + .06, 'look': WrenchLook(T, 49, 29)}),
        (0.26, {'throatMix': 0.0}),
        (0.44, {'throatMix': 1.0}),
        (0.40, {'bend': b['bend'] + .10, 'shrug': b['shrug'] + .12, 'look': WrenchLook(T, 52, 21)}),
        (0.56, {'pelvis': sag, 'bend': b['bend'] + .14, 'lean': b['lean'] + .04, 'twist': -.20, 'neck': (-.10, 0, -.18),
                'look': WrenchLook(T, 49, 18)}),
        # The fist shakes him (IjaThroatSlash 0.72 s).
        (0.72, {'look': WrenchLook(T, 42, 14), 'shrug': b['shrug'] + .04}),
        (0.82, {'look': WrenchLook(T, 55, 21)}),
        (1.00, {'look': WrenchLook(T, 50, 18), 'shrug': b['shrug'] + .08, 'bend': b['bend'] + .12}),
    ]
    return Keys(base, rows, lag={'head': .03})


@Builder('CaptiveThroatCut')
def BuildThroatCut(T, name):
    anim = ThroatCutKeys(T)

    def Pose(t):
        # the right hand to the throat; the left stays on the fist in his hair (ComradeHands leftHair)
        return ComradeNest(T, dict(anim(t), leftHair=1.0))
    spec = {'pose': Pose,
            'check': ComradeThroatCheck(T, .52, 'R'), 'kneePlants': [('L', 0, 1.0), ('R', 0, 1.0)],
            'reviewFrames': lambda n: [0, int(n * .24), int(n * .36), int(n * .52), n - 1]}
    spec.update(R3Review())
    spec = R3Clip(T, spec)
    spec['reviewViews'] = R3_VIEWS + R3EyeView(T)
    return spec


def ClutchPose(T, t):
    f = ThroatCutKeys(T)(1.0)
    phase = Tau * t / 3.0
    spasm = Pulse(t, .30, .09) + .8 * Pulse(t, 1.20, .09) + .9 * Pulse(t, 2.20, .09)
    # The fist shakes the head (0.6 and 1.8: IjaThroatSlash 1.6 / 2.8 on the taunt lines).
    shake = Pulse(t, .60, .07) - Pulse(t, .72, .07) + Pulse(t, 1.80, .07) - Pulse(t, 1.92, .07)
    gasp = math.sin(4 * phase)
    f['bend'] += .06 * spasm + .015 * gasp
    f['shrug'] += .08 * spasm + .03 * gasp
    f['twist'] += .04 * spasm
    f['look'] = WrenchLook(T, 50 + 7 * shake, 18 + 3 * spasm - 3 * abs(shake))
    f['press'] = spasm
    p = f['pelvis']
    f['pelvis'] = (p[0], p[1], p[2] + .012 * spasm)
    return f


@Builder('CaptiveClutchThroat')
def BuildClutchThroat(T, name):
    spec = {'pose': lambda t: ComradeNest(T, dict(ClutchPose(T, t), leftHair=1.0)), 'check': ComradeThroatCheck(T, 0.0, 'R'),
            'kneePlants': [('L', 0, 3.0), ('R', 0, 3.0)]}
    spec.update(R3Review())
    spec = R3Clip(T, spec)
    spec['reviewViews'] = R3_VIEWS + R3EyeView(T)
    return spec


_SLIDE = [float(v) for v in (__import__('os').environ.get('SLIDE') or '-.10,.03,-.02,.14').split(',')]
# 2026-09-27 on the bank: he dies kneeling. His heels are up the slope behind him, higher than the seat can drop
# (the knee is already at its fold, BankKneel), and the flat floor's side-sit off the heels put the knees and the
# feet through the bank on the way down; so the seat only sags to his right on his heels and the trunk slides
# down the planks over to his right (SB03A: the head at the door's east post).
SLIDE_SEAT = tuple(_SLIDE[:3])     # the seat's sag from the kneel: (x, +y, z)
SLIDE_TILT = (_SLIDE[3], -.12, -.10)   # added to the kneel-wall pelvis tilt: the back stays on the wall


def SlideKeys(T):
    """Released (the fist opens): the face drops out of the turn and he falls back onto the planks (0.55 s), then the seat
    sags to his right on his heels while his back slides down them; he ends slumped kneeling against them over to his
    right, hands dropped off the throat, the legs jerking three times. The last frame is the corpse. Authored from the
    bank kneel (BankKneel: the clutch's seat and the wall kneel's seat and recline)."""
    base = BankKneel(T, ClutchPose(T, 0.0))
    wall = BankKneel(T, KneelWallBase(T))
    ar, al = base['ankle.R'], base['ankle.L']
    p0 = wall['pelvis']
    endPelvis = Add3(p0, SLIDE_SEAT)
    rows = [
        (0.00, {}),
        # The fist opens: the face falls out of the turn, the neck follows; the hands stay on the throat.
        (0.18, {'lookW': .35, 'neck': (.02, 0, -.18)}),
        # He drops back onto the planks.
        (0.40, {'lookW': 0.0, 'head': (.20, -.05, -.18), 'neck': (.10, 0, -.10), 'twist': -.18}),
        (0.55, {'pelvis': p0, 'pelvisTilt': wall['pelvisTilt'], 'lean': wall['lean'], 'bend': wall['bend'] + .02,
                'head': (.30, -.05, -.20)}),
        # Down the planks: the seat sags to his right on his heels, the back rides down, the trunk sags over.
        (0.95, {'pelvis': Lerp3(p0, endPelvis, .5), 'lean': -.16, 'pelvisTilt': Add3(wall['pelvisTilt'], (.04, -.06, -.04)),
                'bend': wall['bend'] + .04, 'twist': -.14}),
        # Still clutching his throat as he goes down.
        (1.60, {'pelvis': endPelvis, 'lean': -.34, 'pelvisTilt': Add3(wall['pelvisTilt'], SLIDE_TILT),
                'bend': wall['bend'] + .08, 'twist': -.10, 'head': (.40, -.30, -.20), 'neck': (.10, -.10, 0)}),
        (1.64, {'ankle.R': ar}),
        # (The jerks go out sideways along the slope: lifting a foot up the bank swung the knee into it.)
        (1.72, {'ankle.R': Add3(ar, (-.03, -.01, .01)), 'shrug': base['shrug'] + .06}),        # twitch 1
        (1.84, {'ankle.R': ar, 'world.R': 1.0}),
        # The right hand slips off onto his lap.
        (1.95, {'world.R': 0.0, 'handRel.R': (.10, -.18, -.30), 'poleRel.R': (-.40, .20, -.40), 'palmF.R': (.1, -.5, -.9),
                'palmN.R': (0, 0, -1), 'curl.R': .30}),
        (2.10, {'ankle.L': al}),
        (2.18, {'ankle.L': Add3(al, (.035, -.01, .01)), 'bend': wall['bend'] + .11}),       # twitch 2: the left leg jerks
        (2.30, {'ankle.L': al, 'bend': wall['bend'] + .08, 'world.L': 1.0}),
        (2.50, {'ankle.R': ar}),
        (2.56, {'ankle.R': Add3(ar, (-.015, 0, .005))}),                                   # twitch 3, smaller
        # The left hand drops off the throat onto his thigh, palm up, slack.
        (2.70, {'ankle.R': ar, 'head': (.46, -.34, -.22)}),
        (2.75, {'world.L': 0.0, 'handRel.L': (-.02, -.10, -.34), 'poleRel.L': (.40, .20, -.40),
                'palmF.L': (-.1, -.3, -.9), 'palmN.L': (0, .3, -1), 'curl.L': .25}),
        (3.20, {'head': (.48, -.34, -.22), 'bend': wall['bend'] + .08, 'shrug': 0.0}),
    ]
    return Keys(base, rows, lag={'head': .08, 'neck': .05})


@Builder('CaptiveWallSlideTwitch')
def BuildWallSlide(T, name):
    anim = SlideKeys(T)

    def Pose(t):
        # SlideKeys starts from the bank kneel (its seat is BankKneel's): only the feet are laid on the bank here.
        # (2026-09-29: let go, his left hand comes off the hair to his throat as he falls back.)
        return ComradeNest(T, dict(anim(t), leftHair=1.0 - Smooth((t - .05) / .40)), kneel=0.0)
    spec = {'pose': Pose, 'kneePlants': [('L', 0, .5), ('R', 0, .5)],
            'reviewFrames': lambda n: [0, int(n * .15), int(n * .35), int(n * .55), n - 1]}
    spec.update(R3Review())
    spec = R3Clip(T, spec)
    spec['reviewViews'] = R3_VIEWS + R3EyeView(T)
    return spec


# ---- ijaA (IJA02) at the comrade's left shoulder ------------------------------------------------------------------
def SlashReview(T, stage, spec):
    """ijaA's review: the side views and the pinned eye (the eye carried into his frame through the stage)."""
    spec = AReview(spec)
    eye = AnchorToRole(T, stage, 'ijaA', R3_EYE)
    look = AnchorToRole(T, stage, 'ijaA', R3_LOOK)
    spec['reviewViews'] = [('side', (-3.2, -.9, 1.1), (0, -.55, .80)), ('q', (-2.3, -3.2, 1.9), (0, -.5, .75)),
                           FirstPersonView(eye, look, name='eye'), FirstPersonView(eye, look, fov=22.0, name='eyeZoom')]
    return spec


def SlashGroundSpec(T, stage, spec):
    """ijaA's slash clips stand on the bank ground and are walled by the planks behind R3."""
    me = STAGES[stage]['actors']['ijaA']
    assert abs(R3GroundRT(-me['x'], me['z']) - me['yM']) < .003, ('IJA_A_YM', R3GroundRT(-me['x'], me['z']))
    G = StageGround(T, stage, 'ijaA')
    spec.update({'ground': lambda x, y, t: G(x, y), 'walls': StageWalls(T, stage, 'ijaA')})
    props = spec.get('reviewProps')
    bank = [('poly', [AnchorToRole(T, stage, 'ijaA', (x0 * T.s, a * T.s, R3Bank(T, 0, a) * T.s)) for x0, a in quad], None, 0)
            for quad in [((-1.0, a), (1.0, a), (1.0, b), (-1.0, b)) for a, b in
                         [(y / 20 / T.s, (y + 1) / 20 / T.s) for y in range(-10, 12)]]]
    spec['reviewProps'] = lambda t: (props(t) if props else []) + bank
    return spec


# The step in: from the root (standing, square) he steps in with the left foot toward the kneeling man's left shoulder.
SLASH_STEP = .04                    # source m: the pelvis comes this far forward with the step
SLASH_FOOT_L = (.05, -.16)          # source m: the left foot's step (out, forward) from IjaABase's
SLASH_FOOT_R = (-.03, .05, 0)       # source m: the right foot a little back (at the foot of the bank: the toe off the slope)
HAIR_DOWN = (0, 0, -1)              # the fist's fingers run down the back of the head


def SlashStance(T):
    """ijaA planted at the comrade's left shoulder after the step (the draw, the cut, the taunt)."""
    f = IjaABase(T)
    f.update({'pelvis': Add3(f['pelvis'], (0, -SLASH_STEP, -.05)), 'ankle.R': Add3(f['ankle.R'], SLASH_FOOT_R),
              'ankle.L': Add3(f['ankle.L'], (SLASH_FOOT_L[0], SLASH_FOOT_L[1], 0)),
              'legPole.L': Add3(f['legPole.L'], (.20, -.10, 0)),
              'bend': .04, 'pelvisTilt': (.03, 0, 0), 'head': (.10, 0, 0), 'twist': 0.0, 'lookW': 1.0,
              'protract.L': HAIR_PROTRACT})
    return f


def SlashBody(T, stage, f, t):
    """Face on the comrade's face (his throat point, lifted), the feet on the bank."""
    hit = PartnerPoint(T, stage, 'ijaA', 'comrade', 'throat', t)
    if hit is not None:
        f['look'] = tuple(hit[0] + Vector((0, 0, T.R(.10))))
    return GroundFeet(T, f, StageGround(T, stage, 'ijaA'))


@Builder('IjaHairGrabPull')
def BuildHairGrab(T, name):
    base = dict(IjaABase(T), lookW=.9, look=(0, -T.R(.6), T.R(1.0)))
    base['ankle.R'] = Add3(base['ankle.R'], SLASH_FOOT_R)
    held = SlashStance(T)
    anim = Tracks(base, {
        # The half step in with the left foot (0.06-0.24 s), the pelvis following; the right foot stays.
        'ankle.L': [(0.0, base['ankle.L']), (.06, base['ankle.L']), (.15, Add3(Lerp3(base['ankle.L'], held['ankle.L'], .5), (0, 0, .06))),
                    (.24, held['ankle.L'])],
        'legPole.L': [(0.0, base['legPole.L']), (.24, held['legPole.L'])],
        'pelvis': [(0.0, base['pelvis']), (.24, Add3(held['pelvis'], (0, .02, .01))), (.32, Add3(held['pelvis'], (0, -.02, -.01))),
                   # the wrench: he leans back against the pull
                   (.44, Add3(held['pelvis'], (0, .03, 0))), (1.0, held['pelvis'])],
        'bend': [(0.0, .08), (.28, .16), (.44, .06), (1.0, held['bend'])],
        'pelvisTilt': [(0.0, (.03, 0, 0)), (.28, (.12, 0, 0)), (1.0, held['pelvisTilt'])],
        'twist': [(0.0, 0.0), (.28, .12), (.44, -.08), (1.0, 0.0)],
        'shrug': [(0.0, 0.0), (.40, .08), (1.0, .02)],
        'head': [(0.0, (.10, 0, 0)), (1.0, held['head'])],
        'lookW': [(0.0, .9), (.3, 1.0)],
        'protract.L': [(0.0, 0.0), (.28, HAIR_PROTRACT)],
        'handRel.R': [(0.0, base['handRel.R']), (1.0, HAIR_GRAB_HAND_R)],
    }, lag={'head': .05})

    def Body(t):
        return SlashBody(T, 'slashGrab', anim(t), t)
    spec = AttackerSpec(T, 'slashGrab', 'ijaA', 'comrade', {'L': [(.28, 1.0, 'hairNape', .03, HAIR_DOWN, 1.1)]}, Body, 1.0)
    props, review = SlungProps(T)
    spec.update({'props': props, 'plants': [('R', 0, 1.0), ('L', .24, 1.0)],
                 'look': lambda t: Body(t)['look'] if t >= .3 else None,
                 'reviewProps': lambda t: review(t) + spec['markers'](t),
                 'reviewFrames': lambda n: [0, int(n * .28), int(n * .44), n - 1]})
    return SlashReview(T, 'slashGrab', SlashGroundSpec(T, 'slashGrab', spec))


# The pull cut (2026-09-29, user: 「割喉的日军动作还有点问题，比如割喉的时候的手部动作……帮我做的更写实更物理一些」).
# The old stroke cocked the reversed blade away from the throat and swept it out across the front of the neck toward the
# eye: the arm ran out of reach (the fist 20 cm off its path at 0.33 s), the open hand dragged over the dying man's jaw
# and the trailing blade went through ijaA's own forearm. Now the bayonet comes out of the cross draw reversed and is
# turned over in the fist to a forward grip (IjaDrawBayonet), the edge is laid on the right of the throat with the fist
# in front of the neck and pressed in, and one hard pull back toward his own right hip draws it round the front of the
# neck -- the fist leads, the edge stays on the skin the whole way (the blade is a line from the fist that touches the
# neck), and the blade slides through along its length as it goes (a draw cut, not a slash). The trunk turns into the
# pull and the weight goes back; the left fist in the hair holds the head against it.
# The neck in the throat patch's frame (runtime m): the patch is on the skin, the neck's axis NECK_R behind it; the
# pressed edge runs BLADE_PRESS inside the skin.
NECK_R = .050
BLADE_PRESS = .006
# (t, contact angle deg -- round the neck from the front toward his RIGHT --, distance along the blade from the handle
# centre to the contact, fist height over the patch) runtime m. The blade from the fist runs round the front of the neck
# toward his right; the fist is where the line through the contact, tangent to the neck, puts it.
SLASH_DRAW = [
    (0.00, 22, .160, -.015),     # laid on: the middle of the edge on the right of the throat, the fist in front of the neck
    (0.06, 26, .150, -.014),     # the bite: pushed a little toward his right to seat the edge
    (0.12, 18, .170, -.016),     # the pull starts
    (0.24, 0, .230, -.020),      # the edge across the front of the throat (the cut)
    (0.30, -26, .290, -.026),
    (0.36, -52, .345, -.032),    # past the left of the neck, near the tip
    (0.40, -66, .400, -.036),    # the tip comes off
]
SLASH_DRAW_END = SLASH_DRAW[-1][0]
# Then (his own frame, runtime m: +X his left, +Y back, up; the forward-grip blade's axis) the pull runs out past his right
# hip and the bloody blade comes to rest low at his right side, point forward and down.
SLASH_RECOVER = [(.52, (-.30, .06, .94), (.10, -.40, -.91)), (.70, (-.26, -.04, .88), (.06, -.52, -.85)),
                 (1.0, (-.24, -.07, .86), (.05, -.55, -.83))]
SLASH_HOLD_HAND, SLASH_HOLD_AXIS = SLASH_RECOVER[-1][1], SLASH_RECOVER[-1][2]
# The wipe (IjaThroatSlash 1.0-1.6 s, the taunt hold): the flat of the blade laid on the dying man's left shoulder and
# drawn back along its length once (the patch from the middle of the blade to near its point), then back to his side.
SLASH_WIPE = (1.02, 1.14, 1.34, 1.62)      # reach, on the cloth, off, back at his side
SLASH_WIPE_D = (.16, .32)                  # runtime m: handle centre to the patch at the start / the end of the stroke


def ThroatFrame(T, stage, t):
    """(neck axis point, out of the throat, his left along it, up) at the throat patch (ijaA source frame)."""
    hit = PartnerPoint(T, stage, 'ijaA', 'comrade', 'throat', t)
    P, n, a = ThroatAxes(*(hit or (Vector((0, -T.R(.55), T.R(1.15))), Vector((0, 1, 0)))))
    return P - n * T.R(NECK_R), n, a, Vector((0, 0, 1))


def NeckBlade(T, frame, phi, d, v):
    """(handle centre, blade axis, spine) for a blade that touches the pressed neck `phi` deg round from the front
    toward his right, with the handle centre `d` back along it and the fist `v` over the patch (runtime m). `frame` is
    ThroatFrame's (neck axis point, out of the throat, his left, up), in whichever body's frame it was taken."""
    C, n, a, up = frame
    r = T.R(NECK_R - BLADE_PRESS)
    ph = math.radians(phi)
    radial = n * math.cos(ph) - a * math.sin(ph)
    tangent = -n * math.sin(ph) - a * math.cos(ph)          # round the front toward his right
    contact = C + radial * r
    hand = contact - tangent * T.R(d) + up * T.R(v)
    axis = (contact - hand).normalized()
    return hand, axis, radial


def SlashElbow(T, frame):
    """ijaA's elbow pole through the cut: out in front of the neck on the man's left (the side ijaA stands), low -- the
    forearm comes in to the fist from below and outside, the blade goes on round the neck from it."""
    C, n, a, up = frame
    side = math.radians(-85.0)
    return C + (n * math.cos(side) - a * math.sin(side)) * T.R(.40) - up * T.R(.22)


def BladeOnNeck(T, stage, t, phi, d, v):
    return NeckBlade(T, ThroatFrame(T, stage, t), phi, d, v)


def SlashCut(T):
    """The cut and the recovery (IjaThroatSlash 0-1.0 s): (handle centre, blade axis, spine, elbow pole)."""
    phi = Channel([(t, p) for t, p, _, _ in SLASH_DRAW])
    dist = Channel([(t, d) for t, _, d, _ in SLASH_DRAW])
    height = Channel([(t, v) for t, _, _, v in SLASH_DRAW])
    rec = Channel([(t, p) for t, p, _ in SLASH_RECOVER])
    recAxis = Channel([(t, a) for t, _, a in SLASH_RECOVER])

    def At(t):
        t = min(t, 1.0)
        u = min(t, SLASH_DRAW_END)
        frame = ThroatFrame(T, 'slashCut', t)
        hand, axis, spine = NeckBlade(T, frame, phi(u), dist(u), height(u))
        pole = SlashElbow(T, frame)
        w = Smooth((t - SLASH_DRAW_END) / (SLASH_RECOVER[0][0] - SLASH_DRAW_END))
        if w > 0:
            q = max(t, SLASH_RECOVER[0][0])
            hand = hand.lerp(Vector(rec(q)) / T.s, w)
            axis = axis.lerp(Vector(Unit(recAxis(q))), w).normalized()
            spine = spine.lerp(Vector((0, 0, 1)), w)
            pole = pole.lerp(Vector((-T.R(.60), T.R(.10), T.R(.85))), Smooth((t - SLASH_DRAW_END) / .30))
        return hand, axis, spine, pole
    return At


def SlashWipe(T):
    """The wipe on the dying man's left shoulder (stage slashTaunt): (weight, handle centre, blade axis, spine)."""
    reach, on, off, back = SLASH_WIPE

    def At(t):
        if t <= reach or t >= back:
            return None
        hit = PartnerPoint(T, 'slashTaunt', 'ijaA', 'comrade', 'shoulderL', min(max(t, on), off))
        if hit is None:
            return None
        P, n = hit
        n = n if n.z > .3 else Vector((0, 0, 1))
        # Laid along the shoulder from ijaA's side of him: the blade points from his hand over the patch toward the
        # dying man's neck (level), the flat on the cloth (spine square to the axis and the patch normal).
        toward = Vector((P.x, P.y, 0)) - Vector((-T.R(.25), -T.R(.05), 0))
        axis = (toward - n * toward.dot(n)).normalized()
        spine = n.cross(axis).normalized()
        s = Smooth((t - on) / (off - on))
        hand = P + n * T.R(.010) - axis * T.R(Mix(SLASH_WIPE_D[0], SLASH_WIPE_D[1], s))
        w = Smooth((t - reach) / (on - reach)) if t < on else 1.0 - Smooth((t - off) / (back - off)) if t > off else 1.0
        return w, hand, axis, spine
    return At


def SlashKnifeUp(axis, n):
    """The blade's spine side: along n (away from the throat), square to the blade."""
    a, u = Vector(axis), Vector(n)
    u = u - a * u.dot(a)
    return tuple(u.normalized()) if u.length > 1e-6 else (0, 0, 1)


def SlashKnifeAt(T):
    """IjaThroatSlash's (handle centre, blade axis, spine, elbow pole) at any time: the cut, the recovery, the wipe and
    the hold (the blade low at his right side)."""
    cut, wipe = SlashCut(T), SlashWipe(T)
    holdHand, holdAxis = Vector(SLASH_HOLD_HAND) / T.s, Vector(Unit(SLASH_HOLD_AXIS))

    def At(t):
        if t <= SLASH_RECOVER[-1][0]:
            return cut(t)
        hand, axis, spine = holdHand, holdAxis, Vector((0, 0, 1))
        pole = Vector((-T.R(.60), T.R(.10), T.R(.85)))
        row = wipe(t)
        if row is not None:
            w, wh, wa, ws = row
            hand, axis, spine = hand.lerp(wh, w), axis.lerp(wa, w).normalized(), spine.lerp(ws, w)
            pole = pole.lerp(Vector((-T.R(.55), T.R(.05), T.R(1.05))), w)
        return hand, axis, spine, pole
    return At


def KnifeGrip(T, hand, axis, reverse=False):
    """(grip target, palm forward, palm normal) for the handle centre `hand`: the knuckles KNIFE_IN back from it."""
    pf, pn = KnifePalm(tuple(-Vector(axis) if reverse else Vector(axis)))
    return tuple(Vector(hand) - Vector(pn) * T.R(KNIFE_IN)), pf, pn


# The reversed grip out of (and back into) the scabbard and the turn to a forward grip in front of his chest.
DRAWN_AXIS = (.35, -.35, -.87)      # reversed, down, forward and to his left out of the scabbard


def GripTurn():
    """(reversed axis, the palm kept through the turn, the line of the fingers the knife turns about, turn sign). The
    blade swings over on his own side: half way round it points back at him, not at the man's head."""
    drawn = Vector(Unit(DRAWN_AXIS))
    palm = KnifePalm(tuple(-drawn))
    fingers = Vector(palm[0])
    sign = 1.0 if (Quaternion(fingers, math.pi / 2) @ drawn).y > 0 else -1.0
    return drawn, palm, fingers, sign


@Builder('IjaDrawBayonet')
def BuildDrawBayonet(T, name):
    held = SlashStance(T)
    pel = held['pelvis']
    scabbard = (pel[0] + T.R(.13), pel[1] - T.R(.12), pel[2] + T.R(SCABBARD_UP))
    sheathAxis = Vector(Unit((.0, .34, -.94)))     # ScabbardKnife: blade down and back
    # The drawn knife ends exactly where IjaThroatSlash starts it (IjaDrawBayonet 0.8 s = IjaThroatSlash 0 s).
    ready, readyAxis, readySpine, readyPole = SlashKnifeAt(T)(0.0)
    body = Keys(dict(held, **{'handRel.R': HAIR_GRAB_HAND_R}), [
        (0.00, {}),
        (0.14, {'twist': .24, 'bend': held['bend'] + .12}),      # the right hand crosses to the left hip, a hunch over it
        (0.30, {'twist': .26, 'bend': held['bend'] + .12}),
        (0.55, {'twist': .06, 'bend': held['bend'] + .03}),
        (0.80, {'twist': .10, 'bend': held['bend'] + .04}),     # reaching round in front of the neck (IjaThroatSlash 0)
    ], lag={'head': .05})
    # Out of the scabbard reversed (blade down, 0.28-0.44), up in front of his chest and turned over in the fist (0.44-0.58:
    # the blade swings out of the little-finger side and up, about the line of the fingers) to a forward grip, then laid
    # across the throat (0.80).
    out = Add3(scabbard, (T.R(.02), -T.R(.12), T.R(.20)))
    chest = Add3(scabbard, (-T.R(.12), -T.R(.04), T.R(.26)))        # in front of his own chest, clear of the man's face
    path = Channel([(0.0, (pel[0] - T.R(.20), pel[1] - T.R(.10), pel[2] - T.R(.08))), (.22, scabbard), (.28, scabbard),
                    (.44, out), (.58, chest), (.70, Lerp3(chest, tuple(ready), .65)), (.80, tuple(ready))])
    drawn, turnPalm, fingers, turnSign = GripTurn()
    flipAt = (.44, .58)
    readyPalm = KnifePalm(tuple(readyAxis))

    def Axis(t):
        """(axis, reversed): the knife in the fist."""
        if t <= .28:
            return sheathAxis, True
        if t <= flipAt[0]:
            w = Smooth((t - .28) / (flipAt[0] - .28))
            return sheathAxis.lerp(drawn, w).normalized(), True
        if t <= flipAt[1]:
            s = Smooth((t - flipAt[0]) / (flipAt[1] - flipAt[0]))
            return Quaternion(fingers, turnSign * math.pi * s) @ drawn, s < .5
        # Forward grip (the blade out of the thumb side, up and forward after the turn): round to across the throat.
        a, _ = CarryPalm(-drawn, turnPalm, readyAxis, readyPalm, Smooth((t - flipAt[1]) / (.80 - flipAt[1])))
        return Vector(a), False

    def Palm(t):
        """The hand keeps the reversed grip's palm through the turn (the knife turns in it, not the hand), then the palm
        is carried round with the blade into IjaThroatSlash's first palm."""
        if t <= flipAt[0]:
            a, _ = Axis(t)
            return KnifePalm(tuple(-a))
        if t <= flipAt[1]:
            return turnPalm
        return CarryPalm(-drawn, turnPalm, readyAxis, readyPalm, Smooth((t - flipAt[1]) / (.80 - flipAt[1])))[1]

    def KnifeAt(t):
        if t < .28:
            return ScabbardKnife(T)
        a, rev = Axis(t)
        spine = SlashKnifeUp(a, readySpine) if t > .62 else SlashKnifeUp(a, (0, -1, 0))
        return FistKnife(T, tuple(a), spine)

    def BodyAt(t):
        f = SlashBody(T, 'slashDraw', body(t), t)
        if t > 0:     # frame 0 is IjaHairGrabPull's last frame exactly
            pf, pn = Palm(t)
            f['grip.R'] = tuple(Vector(path(t)) - Vector(pn) * T.R(KNIFE_IN) * Smooth((t - .16) / .12))
            f['gripW.R'] = Smooth(t / .16)
            f['armPole.R'] = Lerp3((pel[0] - T.R(.55), pel[1] + T.R(.10), pel[2] + T.R(.02)), tuple(readyPole), Smooth((t - .50) / .30))
        if t >= .16:
            f['handRel.R'] = None
        if t >= .20:
            pf, pn = Palm(t)
            f['palmF.R'], f['palmN.R'], f['curl.R'] = pf, pn, Mix(1.1, KNIFE_CURL, Smooth((t - .20) / .10))
        return f
    spec = AttackerSpec(T, 'slashDraw', 'ijaA', 'comrade', {'L': [(0.0, .8, 'hairNape', .03, HAIR_DOWN, 1.1)]}, BodyAt, .8)
    pose = spec['pose']
    spec['pose'] = lambda t: WithFist(T, pose(t), thumb=Smooth((t - flipAt[1]) / .12)) if t >= .22 else pose(t)
    props, review = SlungProps(T)

    def Props(t):
        out = props(t)
        out['bayonet'] = KnifeTrack(KnifeAt(t))
        return out

    def Review(t):
        return review(t) + KnifeProps(KnifeAt(t)) + spec['markers'](t)
    spec.update({'props': Props, 'plants': [('R', 0, .8), ('L', 0, .8)], 'reviewProps': Review,
                 'look': lambda t: SlashBody(T, 'slashDraw', body(t), t).get('look'),
                 'mountFrames': {'bayonet': ('Pelvis', 0)},
                 'reviewFrames': lambda n: [0, int(n * .3), int(n * .55), int(n * .62), int(n * .7), n - 1]})
    return SlashReview(T, 'slashDraw', SlashGroundSpec(T, 'slashDraw', spec))


def SlashBodyKeys(T):
    """IjaThroatSlash's trunk to the start of its hold loop (IjaReleaseSheathe starts from its end)."""
    held = SlashStance(T)
    pel = held['pelvis']
    b = held['bend']
    return Keys(held, [(0.0, {'twist': .10, 'bend': b + .04}),                                  # right shoulder forward, round the neck
                       (.06, {'twist': .12, 'bend': b + .05, 'shrug': .04}),                    # the bite: leaning into it
                       (.12, {'twist': .08, 'shrug': .06}),
                       # the pull: the right shoulder goes back, the weight onto the back foot
                       # (the trunk turns only a little: turned further, his left shoulder -- the arm in the hair -- came
                       # forward into the dying man's raised left elbow)
                       (.24, {'twist': -.03, 'bend': b + .03, 'shrug': .10, 'pelvis': Add3(pel, (-.01, .03, 0))}),
                       (.36, {'twist': -.05, 'bend': b + .02, 'shrug': .08, 'pelvis': Add3(pel, (-.03, .06, -.01))}),
                       (.52, {'twist': -.04, 'bend': b + .02, 'shrug': .03, 'pelvis': Add3(pel, (-.03, .06, -.01))}),
                       # his weight stays back a moment, then he leans in over him and jeers; the fist wrenches the head
                       # (0.72) (hips only 0.5 cm forward: at 3 cm his chest met the dying man's head in the hold, 2.9-3.2 cm)
                       (.62, {'bend': b + .02, 'pelvis': Add3(pel, (-.02, .05, -.01)), 'twist': -.03}),
                       (.72, {'shrug': .10}),
                       (.84, {'bend': b + .06, 'pelvis': Add3(pel, (0, -.005, -.02)), 'twist': -.02, 'shrug': .0}),
                       (1.0, {'twist': 0.0, 'bend': b + .045, 'pelvis': Add3(pel, (0, -.005, -.02)), 'shrug': .0}),
                       # the wipe: over the shoulder, the blade drawn back along it
                       (1.14, {'twist': -.04, 'bend': b + .08}),
                       (1.34, {'twist': .02, 'bend': b + .07}),
                       (1.62, {'twist': 0.0, 'bend': b + .045}),
                       (SLASH_HOLD[0], {'twist': 0.0, 'bend': b + .045, 'pelvis': Add3(pel, (0, -.005, -.02)), 'shrug': .0})],
                lag={'head': .05})


@Builder('IjaThroatSlash')
def BuildThroatSlash(T, name):
    held = SlashStance(T)
    knife = SlashKnifeAt(T)
    body = SlashBodyKeys(T)

    def BodyAt(t):
        f = SlashBody(T, 'slashCut' if t <= 1.0 else 'slashTaunt', body(min(t, SLASH_HOLD[0])), t)
        if t > SLASH_HOLD[0]:
            # the hold loop -- breathing, two shakes of the head in his fist on the taunt lines (in step with
            # CaptiveClutchThroat's shakes: its loop runs 1.0 s behind this clip, 3.0 s long).
            u = t - SLASH_HOLD[0]
            shake = Pulse(u, .80, .07) - Pulse(u, .92, .07) + Pulse(u, 2.60, .07) - Pulse(u, 2.72, .07)
            breath = math.sin(Tau * u / 1.5)
            f['bend'] += .012 * breath + .03 * abs(shake)
            f['shrug'] += .05 * abs(shake)
            f['twist'] += .04 * shake
        hand, axis, spine, pole = knife(t)
        grip, pf, pn = KnifeGrip(T, hand, axis)
        f['handRel.R'] = None
        f['grip.R'] = grip
        f['armPole.R'] = tuple(pole)
        f['palmF.R'], f['palmN.R'], f['curl.R'] = pf, pn, KNIFE_CURL
        return f
    grips = {'L': [(0.0, 1.0, 'hairNape', .03, HAIR_DOWN, 1.1, 'slashCut'),
                   (1.0, SLASH_T, 'hairNape', .03, HAIR_DOWN, 1.1, 'slashTaunt')],
             'R': []}
    spec = AttackerSpec(T, 'slashCut', 'ijaA', 'comrade', grips, BodyAt, SLASH_T)
    pose = spec['pose']
    spec['pose'] = lambda t: WithFist(T, pose(t), thumb=1.0)
    props, review = SlungProps(T)

    def KnifeAt(t):
        hand, axis, spine, _ = knife(t)
        return FistKnife(T, tuple(axis), SlashKnifeUp(axis, spine))

    def Props(t):
        out = props(t)
        out['bayonet'] = KnifeTrack(KnifeAt(t))
        return out

    def CutProbe(t):
        # The blade on the throat at the cut: the throat patch against the nearest point of the posed blade.
        if abs(t - .24) > .021:
            return None
        k = KnifeAt(t)
        o, tip = Vector(k['origin']), Vector(k['tip'])
        P = PartnerPoint(T, 'slashCut', 'ijaA', 'comrade', 'throat', t)
        if P is None:
            return None
        d = tip - o
        u = Clamp((P[0] - o).dot(d) / max(d.length_squared, 1e-9))
        return {'bladeOnThroat': (tuple(P[0]), tuple(o + d * u))}
    spec.update({'props': Props, 'plants': [('R', 0, SLASH_T), ('L', 0, SLASH_T)],
                 'probes': CutProbe,
                 'look': lambda t: BodyAt(t).get('look'),
                 'reviewProps': lambda t: review(t) + KnifeProps(KnifeAt(t)) + spec['markers'](t),
                 'reviewFrames': lambda n: [0, 2, 4, 6, 7, 8, 9, 10, 12, 17, 24, 27, 30, 32, 36, 48, n - 1]})
    return SlashReview(T, 'slashCut', SlashGroundSpec(T, 'slashCut', spec))


# ---- IjaReleaseSheathe (2026-09-29, user: 「朝着玩家走过来的时候没有收起来的小刀」) -----------------------------------
# He used to walk off with the bloody bayonet in his fist and sheathe it only when he stopped over the pinned man. Now,
# on the spot where he cut (stage slashRelease, against CaptiveWallSlideTwitch), he lets go of the hair with a shove,
# brings the knife in front of his chest, turns it back over in the fist (the draw's turn run backwards: the blade
# swings over on his own side, reversed again), and pushes it home in the scabbard on his left hip, the eyes down on
# it; then the hands are free and he turns to go (IjaTauntWalk, empty-handed).


@Builder('IjaReleaseSheathe')
def BuildReleaseSheathe(T, name):
    held = SlashStance(T)
    pel = held['pelvis']
    start = SlashBodyKeys(T)(SLASH_HOLD[0])
    b0 = start['bend']
    body = Keys(start, [(0.0, {}),
                        (.12, {'shrug': .06, 'bend': b0 - .02}),                          # the shove off the head
                        (.30, {'shrug': .0, 'bend': b0 - .01, 'twist': .04, 'protract.L': 0.0,
                               'pelvis': Add3(pel, (0, .015, -.01))}),                  # straightens, weight back
                        (.55, {'twist': .20, 'bend': b0 + .14}),                          # right shoulder round to the hip,
                        (RELEASE_HOME, {'twist': .28, 'bend': b0 + .24}),                 # hunched over the scabbard
                        (1.05, {'twist': .06, 'bend': b0 + .06}),
                        (RELEASE_T, {'twist': 0.0, 'bend': b0, 'pelvis': Add3(pel, (0, .015, -.01))})],
                lag={'head': .05})
    scabbard = (pel[0] + T.R(.13), pel[1] - T.R(.12), pel[2] + T.R(SCABBARD_UP))
    sheathAxis = Vector(Unit((.0, .34, -.94)))
    holdHand, holdAxis, _, holdPole = SlashKnifeAt(T)(SLASH_HOLD[0])
    holdPalm = KnifePalm(tuple(holdAxis))
    drawn, turnPalm, fingers, turnSign = GripTurn()
    chest = Add3(scabbard, (-T.R(.12), -T.R(.04), T.R(.26)))      # IjaDrawBayonet's turn point
    out = Add3(scabbard, (T.R(.02), -T.R(.12), T.R(.20)))
    over = Add3(scabbard, (0, 0, T.R(.14)))                          # the point just in the scabbard mouth
    home = Add3(scabbard, (0, 0, T.R(.03)))                          # the fist pressing on the pommel end
    path = Channel([(0.0, tuple(holdHand)), (.12, tuple(holdHand)), (RELEASE_TURN[0], chest), (RELEASE_TURN[1], chest),
                    (.62, out), (.72, over), (RELEASE_HOME, home), (.92, home)])
    up = -drawn                                                        # forward grip, blade up: where the turn starts

    def Axis(t):
        """(axis, palm): the blade in the fist."""
        if t <= RELEASE_TURN[0]:
            a, palm = CarryPalm(holdAxis, holdPalm, up, turnPalm, Smooth((t - .06) / (RELEASE_TURN[0] - .06)))
            return Vector(a), palm
        if t <= RELEASE_TURN[1]:
            s = Smooth((t - RELEASE_TURN[0]) / (RELEASE_TURN[1] - RELEASE_TURN[0]))
            return Quaternion(fingers, -turnSign * math.pi * s) @ up, turnPalm
        # reversed again: down into the scabbard
        a = drawn.lerp(sheathAxis, Smooth((t - RELEASE_TURN[1]) / (.72 - RELEASE_TURN[1]))).normalized()
        return a, KnifePalm(tuple(-a))

    def KnifeAt(t):
        if t >= RELEASE_HOME:
            return ScabbardKnife(T)
        a, _ = Axis(t)
        k = FistKnife(T, tuple(a), SlashKnifeUp(a, (0, 0, 1) if t < RELEASE_TURN[0] else (0, -1, 0)))
        w = Smooth((t - .70) / (RELEASE_HOME - .70))
        if w <= 0:
            return k
        # into the scabbard: the last few centimetres slide it onto its sheathed place (the fist on the pommel)
        home_ = ScabbardKnife(T)
        axis = Vector(k['axis']).lerp(Vector(home_['axis']), w).normalized()
        return Knife(T, tuple(Vector(k['handle']).lerp(Vector(home_['handle']), w)), tuple(axis),
                     tuple(Vector(k['up']).lerp(Vector(home_['up']), w)))

    def BodyAt(t):
        f = SlashBody(T, 'slashRelease', body(t), t)
        if t > .45:
            # eyes down on the scabbard while the blade goes in, then back up
            w = Smooth((t - .45) / .15) * (1 - Smooth((t - .88) / .25))
            if w > 0 and f.get('look') is not None:
                f['look'] = Lerp3(f['look'], Add3(scabbard, (0, -T.R(.10), 0)), w)
        a, (pf, pn) = Axis(t)
        f['handRel.R'] = None if t < .92 else (-.07, -.10, -.47)
        if t < .92:
            f['grip.R'] = tuple(Vector(path(t)) - Vector(pn) * T.R(KNIFE_IN))
            f['armPole.R'] = Lerp3(tuple(holdPole), (pel[0] - T.R(.55), pel[1] + T.R(.10), pel[2] + T.R(.02)), Smooth(t / .30))
            f['palmF.R'], f['palmN.R'], f['curl.R'] = pf, pn, KNIFE_CURL
        else:
            # the hand comes off the handle and hangs at his side
            f['palmF.R'], f['palmN.R'], f['curl.R'] = (0, -.2, -1), (1, 0, 0), .45
            f['handRelW.R'] = Smooth((t - .92) / .18)
            f['hand.R'] = tuple(Vector(scabbard) + Vector((0, 0, T.R(.03))))
            f['palmFw.R'], f['palmNw.R'] = Axis(.91)[1]
        return f
    spec = AttackerSpec(T, 'slashRelease', 'ijaA', 'comrade', {'L': [(0.0, .05, 'hairNape', .03, HAIR_DOWN, 1.1)]}, BodyAt,
                        RELEASE_T)
    pose = spec['pose']
    spec['pose'] = lambda t: WithFist(T, pose(t), thumb=1.0 - Smooth((t - RELEASE_TURN[0]) / .14)) if t < .92 else pose(t)
    props, review = SlungProps(T)

    def Props(t):
        out_ = props(t)
        out_['bayonet'] = KnifeTrack(KnifeAt(t))
        return out_
    spec.update({'props': Props, 'plants': [('R', 0, RELEASE_T), ('L', 0, RELEASE_T)],
                 'look': lambda t: BodyAt(t).get('look'),
                 'reviewProps': lambda t: review(t) + KnifeProps(KnifeAt(t)) + spec['markers'](t),
                 'reviewFrames': lambda n: [0, 3, 7, 9, 11, 15, 19, 24, n - 1]})
    return SlashReview(T, 'slashRelease', SlashGroundSpec(T, 'slashRelease', spec))


@Builder('IjaWipeSheathBayonet')
def BuildWipeSheath(T, name):
    base = HairHandPose(T)
    pel = base['pelvis']
    P = T.P
    # After wiping the blade, step back into the guard stance for the rifle hand-off.
    ready = IjaReadyBase(T)

    L = WIPE_LEAD

    def Thigh():
        # The dead man's left shoulder, the nearest cloth to ijaA's right hand once he is slumped kneeling
        # against the planks over to his right (2026-09-27; on the flat floor he sat with the left knee up and
        # the blade went over that thigh -- kneeling, the thigh is down at the bank and the squat to it put
        # ijaA's knee on the ground). The corpse at rest.
        try:
            hit = PartnerPoint(T, 'slashWipe', 'ijaA', 'comrade', 'shoulderL', L)
        except KeyError:   # partner track dumped before shoulderL was listed
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
                       (.55, {'ankle.L': WIPE_BACK_L(base), 'protract.L': 0.0}),   # the gripping shoulder settles back
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
                       (L + 1.85, {'ankle.L': Add3(Lerp3(base['ankle.L'], ready['ankle.L'], .5), (0, 0, .06)),
                                   'legPole.L': Lerp3(base['legPole.L'], ready['legPole.L'], .5),
                                   'pelvis': Lerp3(pel, ready['pelvis'], .5)}),
                       (L + 2.10, {'ankle.L': ready['ankle.L'], 'legPole.L': ready['legPole.L'],
                                   'pelvis': ready['pelvis']}),
                       (L + 2.40, {'twist': -.05, 'bend': .12, 'head': (.05, 0, -.10),
                                   'ankle.L': ready['ankle.L'], 'legPole.L': ready['legPole.L'],
                                   'pelvis': ready['pelvis']})], lag={'head': .05})

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
    # The left fist still holds the front collar at frame 0 and lets go at once.
    spec = AttackerSpec(T, 'slashWipe', 'ijaA', 'comrade', {'L': [(0.0, .05, 'collarFront', .03, (0, 1, -.3), 1.1)]}, BodyAt, L + 2.4)
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
                                            ('L', L + 2.10, L + 2.4)],
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
    base = IjaReadyBase(T)
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
                'scabbard': 'left hip: pelvis + left 0.13 + forward 0.12 + up 0.09 (runtime metres; 0.04 before 2026-09-29), blade down-back',
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


Meta('IjaCornerFire', 2.6, True, 'track', role='ijaC', rig='TengxianIja01', props=['weapon'], rootMotion=False,
     events=[{'t': .10, 'kind': 'fire', 'weapon': 'Type38'}, {'t': .70, 'kind': 'boltUp'}, {'t': .82, 'kind': 'boltBack'},
             {'t': .98, 'kind': 'boltForward'}],
     notes='At the trench corner: bladed stance, cheek on the stock, one shot, recoil, bolt cycled with the right '
           'hand while the butt stays in the shoulder, back on aim and breathing. Muzzle along actor -Z, 4 deg up.')
Meta('IjaJunctionPeek', 3.2, True, 'track', role='ijaD', rig='TengxianIja02', props=['weapon'], rootMotion=False,
     env={'wallRightM': .32},
     notes='Right shoulder on the junction wall, rifle at high port; leans out to the right past the corner, '
           'scans, leans back and waits. The wall edge is 0.30 m to his right, its corner 0.25 m ahead.')
# The collar drag in the mouth (IjaCollarDragSnag -> IjaKickBeam), 2026-09-26 rework; key times are whole frames.
SNAG_T = 42 / 24               # 1.75 s (was 2.2; a whole number of 12 fps player-track frames)
SNAG_GRAB_T = 5 / 24           # the fist in the collar
SNAG_HIT_T = 18 / 24           # the pack catches on the beam
KICK_T = 24 / 24               # 1.0 s (was 1.2)
KICK_HIT_T = 9 / 24            # the sole on the beam
SNAG_BACK = .62                # hips behind the collar (the reach of a squatting man's arm to a collar on the ground)
SNAG_CROUCH = .40              # hips this far below standing (squatting at him with the knees bent, not stooping)


Meta('IjaSlingRifle', .8, False, 'track', role='ijaA', rig='TengxianIja02', props=['weapon'], rootMotion=False,
     weaponState='twoHand->slungRight', endHold='slungRight',
     prev=['IjaReadyRifle', 'IjaBayonetGuard'], next=['IjaCollarDragSnag', 'CollarDrag'],
     notes='"把步枪甩到身侧": swings the rifle up and back onto the right shoulder by the sling, lets go, '
           'hands free and stooping for the collar.')
Meta('IjaCollarDragSnag', SNAG_T, False, 'track', role='ijaA', rig='TengxianIja02', props=['weapon'], rootMotion=False,
     weaponState='slungRight', player=True,
     contacts=[{'t': SNAG_GRAB_T, 'limb': 'handL', 'action': 'grab', 'partnerRole': 'shunzi', 'part': 'collarBack'}],
     events=[{'t': SNAG_HIT_T, 'kind': 'packSnagged', 'target': 'beam'}, {'t': .86, 'kind': 'yank'}, {'t': 1.06, 'kind': 'yank'}],
     prev=['IjaSlingRifle'], next=['IjaKickBeam'],
     notes='Squats at his head, hooks the back of the collar and backs off two short steps hauling, face on him; the '
           'pack snags on the beam (packSnagged): a dead stop that jerks him forward, two yanks, a look back at what holds. '
           '2026-09-26: hips further back and lower, trunk less folded (the face was straight above the prone eye, '
           'upside down in the picture, the jacket collar through the chin) and 1.7 s instead of 2.2 s.')
Meta('IjaKickBeam', KICK_T, False, 'track', role='ijaA', rig='TengxianIja02', props=['weapon', 'beam'], rootMotion=False,
     weaponState='slungRight', player=True,
     contacts=[{'t': 0, 'limb': 'handL', 'action': 'hold', 'partnerRole': 'shunzi', 'part': 'collarBack'},
               {'t': KICK_HIT_T, 'limb': 'footR', 'action': 'kick', 'target': 'beam'}],
     events=[{'t': KICK_HIT_T, 'kind': 'beamKicked'}],
     prev=['IjaCollarDragSnag'], next=['IjaVaultTimberOut'],
     notes='Keeps the collar in his left fist, stamps the loose beam off the pack with the right sole; the '
           'beam track carries it clear (rests at 0.75 s); face back on him for the haul (1.0 s, was 1.2 s).')
Meta('IjaButtStrike', 1.0, False, 'track', role='ijaA', rig='TengxianIja02', props=['weapon'], rootMotion=False,
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
    # (2026-09-28: at -.10 the fist on the rifle sat on the shoulder, the elbow folded 179 deg and flipped over)
    lifted = T.Rifle((-(SX + .06), -.22, P + .28), Unit((-.05, -.25, .97)))
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
            f['grip.R'] = T.Along(rifle, Mix(w['butt'], .45, Smooth(t / .30)))
            f['gripW.R'] = 1.0 if t <= .30 else 1 - Smooth((t - .30) / .18)
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
    """Shunzi's back collar in ijaA's frame (source metres): prone under the beam, hauled 0.30 m, snagged."""
    g, h = SNAG_GRAB_T, SNAG_HIT_T
    return Channel([(0.0, (-.02, -.62, .22)), (g, (-.02, -.62, .22)), (g + .12, (-.02, -.57, .29)),
                    (h, (-.02, -.33, .37)), (h + .04, (-.02, -.32, .37)), (.86, (-.02, -.30, .39)),
                    (.96, (-.02, -.32, .37)), (1.06, (-.02, -.30, .39)), (1.16, (-.02, -.32, .37)), (SNAG_T, (-.02, -.32, .37))])


def PlayerEyeFromCollar(c):
    """The prone eye a hand's breadth past the collar toward ijaA and a little over it (the runtime camera,
    Script_OpeningStoryboards Shot for Drag/Snag/KickBeam): what the face looks at."""
    return (c[0], c[1] + .14, c[2] + .09)


def SnagPelvis(T, c, crouch, lurch=0.0):
    return (c[0] + .04, c[1] + SNAG_BACK - .05 * lurch, T.P - crouch + .02 * lurch)


SNAG_STANCE = lambda T: {'L': (T.H + .10, -.26, T.A), 'R': (-(T.H + .08), .12, T.A)}   # from the hips' ground point
SNAG_LEG_POLES = lambda T: {'L': (T.H + .55, -1.0, .60), 'R': (-(T.H + .55), -.9, .60)}     # knees out over the toes


@Builder('IjaCollarDragSnag')
def BuildCollarDragSnag(T, name):
    collar = PlayerCollarPath(T)
    base = IjaABase(T)
    g, h = SNAG_GRAB_T, SNAG_HIT_T

    def PelvisXY(t):
        c = collar(t)
        return (c[0] + .04, c[1] + SNAG_BACK)
    schedule = [('R', g + .10, g + .28), ('L', g + .30, h - .02)]
    feet, plants = FollowSteps(PelvisXY, SNAG_STANCE(T), schedule, SNAG_T)
    times = [0.0, g, g + .12, g + .30, h, h + .04, .86, .96, 1.06, 1.16, SNAG_T]
    lurch = Channel([(0.0, 0.0), (h, 0.0), (h + .04, 1.0), (.82, .2), (.86, .8), (.96, .1), (1.06, .8), (1.16, 0.0), (SNAG_T, 0.0)])
    # (a deeper dip at the grab put the right knee on the ground: the grounding lift slid the planted feet)
    crouch = Channel([(0.0, SNAG_CROUCH), (g, SNAG_CROUCH + .01), (g + .12, SNAG_CROUCH - .01), (h, SNAG_CROUCH - .04),
                      (SNAG_T, SNAG_CROUCH - .04)])
    pelvis = [(t, SnagPelvis(T, collar(t), crouch(t), lurch(t))) for t in times]
    poles = SNAG_LEG_POLES(T)
    body = Tracks(base, dict(feet, pelvis=pelvis,
                             bend=[(0.0, .64), (g, .76), (g + .12, .66), (h, .56), (h + .04, .68), (1.16, .60), (SNAG_T, .58)],
                             pelvisTilt=[(0.0, (.30, 0, 0)), (g + .12, (.26, 0, 0)), (h, (.22, 0, 0)), (h + .04, (.30, 0, 0)),
                                         (SNAG_T, (.24, 0, 0))],
                             head=[(0.0, (-.28, 0, 0)), (g + .12, (-.22, 0, 0)), (h + .04, (-.12, 0, 0)), (1.16, (-.24, 0, 0)), (1.36, (-.05, .10, -.60)),
                                   (SNAG_T, (-.02, .06, -.58))],
                             lookW=[(0.0, 0.0), (SNAG_T, 0.0)],
                             twist=[(0.0, 0.0), (1.20, -.20), (SNAG_T, -.18)]),
                  lag={'head': .06})

    def Body(t):
        f = body(t)
        f['look'] = PlayerEyeFromCollar(collar(t))
        f['legPole.L'], f['legPole.R'] = poles['L'], poles['R']
        return f
    spec = PlayerGripSpec(T, Body, {'L': [(g, SNAG_T, collar, (0, 0, -1), 1.1)]})
    props, review = SlungProps(T, 'side')
    spec.update({'props': props, 'plants': plants,
                 'look': lambda t: PlayerEyeFromCollar(collar(t)) if body(t)['lookW'] >= .99 else None,
                 'reviewProps': lambda t: review(t) + [('point', collar(t), None, .04)] + PlayerGhost(T, collar(t)),
                 'reviewFrames': lambda n: [0, int(n * .12), int(n * .43), int(n * .5), int(n * .8), n - 1]})
    spec['player'] = lambda t: {'collar': collar(t)}
    spec = AReview(spec)
    spec['reviewViews'].append(FirstPersonView(lambda t: PlayerEyeFromCollar(collar(t)),
                                               lambda t: Add3(PlayerEyeFromCollar(collar(t)), (0, .9, .55))))
    return spec


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


KICK_REACH = {'fraction': .86, 'sides': 'L', 'travel': .17, 'bend': .40}


@Builder('IjaKickBeam')
def BuildKickBeam(T, name):
    parts = KickBeamParts(T)
    body, hold, eye, poles, k = parts['body'], parts['hold'], parts['eye'], parts['poles'], KICK_HIT_T

    def Body(t):
        f = body(t)
        f['look'] = eye
        f['legPole.L'] = poles['L']
        return f
    spec = PlayerGripSpec(T, Body, {'L': [(0.0, KICK_T, lambda t: hold, (0, 0, -1), 1.1)]})
    spec['reach'] = dict(KICK_REACH)
    props, review = SlungProps(T, 'side')

    def Beam(t):
        c, a = Vector(BEAM_PINNED[0]), Vector(BEAM_PINNED[1]).normalized()
        u = Smooth((t - k) / .37) if t > k else 0.0
        c = c + Vector((-.28, -.42, 0)) * u + Vector((0, 0, .10 * math.sin(math.pi * Clamp((t - k) / .37))))
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
    spec.update({'props': Props, 'plants': [('L', 0, KICK_T), ('R', .74, KICK_T)], 'reviewProps': Review,
                 'look': lambda t: eye if body(t)['lookW'] >= .99 else None,
                 'reviewFrames': lambda n: [0, int(n * .27), int(n * .375), int(n * .55), n - 1]})
    spec['player'] = lambda t: {'collar': hold}
    spec = AReview(spec)
    spec['reviewViews'].append(FirstPersonView(lambda t: eye, lambda t: Add3(eye, (0, .9, .55))))
    return spec


def KickBeamParts(T):
    """IjaKickBeam's body keys (the collar held in the left fist, the right sole on the beam); its last frame is
    also IjaVaultTimberOut's first (same root, same inputs, same reach assist)."""
    H = T.H
    collar = PlayerCollarPath(T)
    hold = collar(SNAG_T)
    base = IjaABase(T)
    # frame 0 = IjaCollarDragSnag's last frame (same root): the feet where its steps left them, the same hips
    st = SNAG_STANCE(T)
    gx, gy = hold[0] + .04, hold[1] + SNAG_BACK
    stand = {s: (gx + st[s][0], gy + st[s][1], st[s][2]) for s in LR}
    pel = SnagPelvis(T, hold, SNAG_CROUCH - .04)
    poles = SNAG_LEG_POLES(T)
    strike = (BEAM_PINNED[0][0] + .02, BEAM_PINNED[0][1] + .10, BEAM_PINNED[0][2] + .02)
    k = KICK_HIT_T
    body = Tracks(base, {
        # The left fist stays on the collar through the kick: the wind-up loads the left leg and
        # rolls the hips open rather than pulling the body back off the held man.
        'pelvis': [(0.0, pel), (.25, Add3(pel, (.03, .0, .03))), (k, Add3(pel, (-.02, -.05, .02))), (.60, Add3(pel, (0, .01, 0))),
                   (KICK_T, pel)],
        'ankle.L': [(0.0, stand['L'])],
        'ankle.R': [(0.0, stand['R']), (.10, stand['R']), (.25, (stand['R'][0] + .06, stand['R'][1] - .30, .36)),
                    (k, strike), (.52, (strike[0] + .08, strike[1] + .25, .30)), (.74, stand['R']), (KICK_T, stand['R'])],
        'legPole.R': [(0.0, poles['R']), (.14, (-(H + .30), -1.1, 1.2)), (.52, (-(H + .30), -1.1, 1.2)), (.78, poles['R'])],
        'foot.R': [(0.0, (0, -14, 0)), (.22, (-25, -60, 0)), (k, (-15, -80, 0)), (.60, (-10, -40, 0)), (.78, (0, -14, 0))],
        'bend': [(0.0, .58), (.22, .56), (k, .66), (.60, .60), (KICK_T, .58)],
        'pelvisTilt': [(0.0, (.24, 0, 0)), (.22, (.18, -.08, -.12)), (k, (.24, -.10, -.18)), (.70, (.24, 0, 0))],
        'head': [(0.0, (-.02, .06, -.58)), (.28, (.30, 0, -.25)), (.50, (.25, 0, -.15)), (.80, (-.24, 0, 0)), (KICK_T, (-.24, 0, 0))],
        'lookW': [(0.0, 0.0), (KICK_T, 0.0)],
        'twist': [(0.0, -.18), (.28, -.05), (.70, 0.0), (KICK_T, 0.0)],
    }, lag={'head': .05})
    return {'body': body, 'hold': hold, 'eye': PlayerEyeFromCollar(hold), 'poles': poles}


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
               'ijaA': {'rig': 'TengxianIja02', 'clip': 'IjaHoldCollarUp', 'x': .52, 'z': -.52, 'yawDeg': -105},
               'interpreter': {'rig': 'TengxianNra02', 'clip': 'InterpreterCrouchAsk', 'x': 0.0, 'z': -1.02, 'yawDeg': 180},
               'ijaB': {'rig': 'TengxianIja01', 'clip': 'IjaChoppedFallWall', 'x': -.80, 'z': -.72, 'yawDeg': 133}}}
STAGES['chopRear'] = {'anchor': 'ijaB', 'notes': 'Luo steps in from ijaB\'s right-rear; the blade reaches the right side '
                      'of his neck at 0.45 s in both clips.',
                      'actors': {'ijaB': {'rig': 'TengxianIja01', 'clip': 'IjaChoppedFallWall', 'x': 0.0, 'z': 0.0, 'yawDeg': 0},
                                 'luo': {'rig': 'TengxianNra05', 'clip': 'LuoDadaoChopRear', 'x': .42, 'z': .62, 'yawDeg': 34}}}
STAGES['chopParry'] = {'anchor': 'ijaA', 'notes': 'ijaA root = his IjaHoldCollarUp root (crouched, facing Shunzi). He comes '
                       'in behind his left; ijaA spins left onto him. Muzzle beaten aside at 0.40 s, the cut lands at 0.78 s.',
                       'actors': {'ijaA': {'rig': 'TengxianIja02', 'clip': 'IjaParriedChoppedFall', 'x': 0.0, 'z': 0.0, 'yawDeg': 0},
                                  'heyoutian': {'rig': 'TengxianNra02', 'clip': 'HeDadaoParryChop', 'x': -.30, 'z': 1.32,
                                                'yawDeg': 12}}}
PARTNER_SOURCES.setdefault('TengxianIja01', {}).update({'IjaChoppedFallWall': ['neckSideR']})
PARTNER_SOURCES.setdefault('TengxianIja02', {}).update({'IjaParriedChoppedFall': ['neckSideL', 'muzzle']})

Meta('IjaHoldCollarUp', 3.8, False, 'track', role='ijaA', rig='TengxianIja02', props=['weapon'], rootMotion=False,
     weaponState='slungRight', holdLoop=[.8, 3.8], player=True,
     contacts=[{'t': .35, 'limb': 'handL', 'action': 'grab', 'partnerRole': 'shunzi', 'part': 'collarFront'},
               {'t': .8, 'limb': 'handL', 'action': 'hold', 'partnerRole': 'shunzi', 'part': 'collarFront'}],
     events=[{'t': 1.8, 'kind': 'shake'}, {'t': 2.45, 'kind': 'glanceRight'}, {'t': 3.0, 'kind': 'shake'}],
     prev=['IjaDragByForearm', 'IjaButtStrike'], next=['IjaStartleTurn', 'IjaParriedChoppedFall'],
     notes='SB05 (2026-09-25): squats in front of Shunzi, fists the front of his jacket and hauls him up until his eye '
           'is 0.73 m off the ground (player head); the head is up and pushed forward and the face stays on Shunzi\'s '
           'eye (head aimed at the player head track; the helmet brim does not cover it) except one glance to his '
           'right at the interpreter (2.2-2.9 s). 0.8-3.8 s is a seamless hold loop with two shakes.')
Meta('InterpreterCrouchAsk', 3.2, True, 'free', role='interpreter', rig='TengxianNra02', rootMotion=False, player=True,
     notes='Squatting on his heels in front of Shunzi, leaning in, right hand turned up asking and jabbing, left '
           'forearm on the left knee; the head searches his face.')
Meta('InterpreterGrabCollar', 3.0, False, 'free', role='interpreter', rig='TengxianNra02', rootMotion=False, player=True,
     holdLoop=[.6, 3.0],
     contacts=[{'t': .32, 'limb': 'handR', 'action': 'grab', 'partnerRole': 'shunzi', 'part': 'collarFront'}],
     events=[{'t': .45, 'kind': 'shake', 'line': 'RescueInterrogation.06'}],
     prev=['InterpreterCrouchAsk'], next=['InterpreterFlee'],
     notes='"说话！": lunges from the squat, grabs the collar with the right hand and shakes once; 0.6-3.0 s holds.')
Meta('InterpreterFlee', 1.6, False, 'free', role='interpreter', rig='TengxianNra02', rootMotion=True,
     events=[{'t': .05, 'kind': 'startle', 'line': 'RescueFlee.01'}, {'t': .40, 'kind': 'handsDown'},
             {'t': 1.6, 'kind': 'handoff', 'to': 'locomotion.run'}],
     prev=['InterpreterGrabCollar', 'InterpreterCrouchAsk'], next=[],
     notes='Lets go, recoils onto his hands, scrambles up turning away and breaks into a run toward the front trench '
           '(about 1.3 m inside the clip); the director hands him to the native run at the end.')
Meta('LuoDadaoChopRear', 1.3, False, 'track', role='luo', rig='TengxianNra05', props=['weapon'], rootMotion=True,
     stage='chopRear', weapon='Dadao',
     contacts=[{'t': .45, 'limb': 'blade', 'action': 'cut', 'partnerRole': 'ijaB', 'part': 'neckSideR'}],
     events=[{'t': .45, 'kind': 'dadaoHit'}],
     prev=['CreepDadao'], next=['LuoDragToCover'],
     notes='From the right-rear: dadao cocked over the right shoulder, a step in on the left foot and one diagonal '
           'two-handed cut down through the right side of the neck, follow-through low left, back to guard.')
CHOP_WALL_X = float(__import__('os').environ.get('CHOPWALL') or .745)   # trench wall on ijaB's left (source metres)
# TengxianHumanoidV1 (2026-09-26): the pelvis distances from the wall +2 cm (.40,.51,.455 / .51 before) -- the
# common skeleton's shoulders are 1.7 cm wider, and the left shoulder rode 1.9 cm into the wall (body 3.2 cm).
CHOP_END = [float(v) for v in (__import__('os').environ.get('CHOPEND') or '.42,.53,.475,.22,-.1,-.1,.34,.53').split(',')]
Meta('IjaChoppedFallWall', 2.2, False, 'track', role='ijaB', rig='TengxianIja01', props=['weapon'], rootMotion=True,
     stage='chopRear', env={'wallLeftM': round(CHOP_WALL_X * .9213, 2)}, terminal=True,
     contacts=[{'t': .45, 'by': 'luo', 'part': 'neckSideR', 'action': 'cut'},
               {'t': .92, 'limb': 'shoulderL', 'action': 'hit', 'target': 'wall', 'untilT': 2.2}],
     events=[{'t': .45, 'kind': 'bloodSpray', 'at': 'neckSideR'}, {'t': .50, 'kind': 'weaponLost'}, {'t': 2.2, 'kind': 'dead'}],
     prev=['IjaBayonetGuard', 'IjaReadyRifle'], next=[],
     notes='Aiming down at Shunzi when the blade lands: neck snaps away, the rifle drops out of his hands, he '
           'staggers left into the trench wall, left shoulder first, and slides down it into a sit on the ground, '
           'the left shoulder and head against the wall, legs out, arms slack. Frame 0 is his aim; last frame is '
           'the corpse.')
Meta('HeDadaoParryChop', 1.5, False, 'track', role='heyoutian', rig='TengxianNra02', props=['weapon'], rootMotion=True,
     stage='chopParry', weapon='Dadao',
     contacts=[{'t': .417, 'limb': 'blade', 'action': 'parry', 'partnerRole': 'ijaA', 'part': 'muzzle'},
               {'t': .792, 'limb': 'blade', 'action': 'cut', 'partnerRole': 'ijaA', 'part': 'neckSideL'}],
     events=[{'t': .417, 'kind': 'steelClash'}, {'t': .792, 'kind': 'dadaoHit'}],
     prev=['CreepDadao'], next=['HeSwapDadaoRifle'],
     notes='Runs the last step in, beats the turning muzzle aside with the flat of the dadao (0.40 s), and cuts down '
           'into the left side of the neck (0.78 s). No pause between the two.')
Meta('IjaParriedChoppedFall', 2.4, False, 'track', role='ijaA', rig='TengxianIja02', props=['weapon'], rootMotion=True,
     stage='chopParry', terminal=True,
     contacts=[{'t': .417, 'by': 'heyoutian', 'part': 'muzzle', 'action': 'parry'},
               {'t': .792, 'by': 'heyoutian', 'part': 'neckSideL', 'action': 'cut'}],
     events=[{'t': .792, 'kind': 'bloodSpray', 'at': 'neckSideL'}, {'t': 2.4, 'kind': 'dead'}],
     prev=['IjaStartleTurn', 'IjaHoldCollarUp'], next=[],
     notes='Comes up spinning left and swinging the rifle off his shoulder at the man behind him; the muzzle is beaten '
           'aside, the cut drops him beside Shunzi. Last frame is the corpse. Frame 0 is IjaStartleTurn\'s last frame '
           '(collar already let go -- IjaStartleTurn carries the releaseCollar event -- head and shoulders turned to his '
           'left rear, hips dropped); play it after IjaStartleTurn (from IjaHoldCollarUp directly it is a blend that '
           'turns the head ~60 deg in 0.12 s).')
Meta('LuoDragToCover', 2.6, False, 'free', role='luo', rig='TengxianNra05', rootMotion=True, player=True, weapon='Dadao',
     weaponState='dadaoInBelt',
     contacts=[{'t': .30, 'limb': 'handsLR', 'action': 'grab', 'partnerRole': 'shunzi', 'part': 'collarBackAndStrap'},
               {'t': 2.30, 'limb': 'handsLR', 'action': 'release'}],
     prev=['LuoDadaoChopRear'], next=['LuoKneelCheck'],
     notes='Crouches, fists the back of the collar and the pack strap, and hauls Shunzi backwards 1.4 m behind the '
           'collapsed earth (first-person: Shunzi is the dragged one; `player` gives his collar).')
Meta('HeSwapDadaoRifle', 1.6, False, 'track', role='heyoutian', rig='TengxianNra02', props=['weapon', 'rifle'], rootMotion=False,
     events=[{'t': .45, 'kind': 'dadaoPlanted'}, {'t': .90, 'kind': 'switchWeapon', 'to': 'HanYang'}],
     endHold='twoHand', weaponState='dadao->planted',
     prev=['HeDadaoParryChop'], next=[],
     notes='Backs into the cover, drives the dadao point-down into the earth, pulls the rifle off his back over the '
           'right shoulder and comes up at low ready. `weapon` = the dadao (planted), `rifle` = the rifle. At the '
           'last frame the director calls DropOpeningWeapon(soldier, "HeSwapDadaoRifle") (the dadao stays planted in '
           'the world) and then SetWeapon("HanYang") (his rifle; the `rifle` prop hides with the next clip).')
Meta('LuoKneelCheck', 3.4, False, 'free', role='luo', rig='TengxianNra05', rootMotion=False, player=True, holdLoop=[.9, 2.6],
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
        (0.66, (SX - .02, -.28, P - .05), (.35, -.20, -.92), (-.2, -.2, -.95)),  # follow-through low left (0.60 until 2026-09-28)
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
    both = Channel([(0.0, 1.0), (.28, 1.0), (.44, 0.0), (.62, 0.0), (.84, 1.0), (1.3, 1.0)])
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
        (0.10, {'head': hold['head']}),        # still on the man behind him (IjaStartleTurn's level look), then the spin
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
            w = Smooth((t - .10) / .16)
            palms = T.Palms(rifle['axis'])                     # body frame: Nest turns them for the grips
            world = World(rifle, t)
            f['grip.R'], f['gripW.R'] = world['gripR'], w
            f['palmF.R'], f['palmN.R'], f['curl.R'] = palms['R'][0], palms['R'][1], .95
            # The beat tears the forward hand off the handguard (0.40-0.52 s); the rifle is
            # left in the right fist and the left arm is flung out.
            # (2026-09-28: the left hand takes the handguard once the rifle is off the shoulder, 0.18-0.34 s: from 0.10
            # it reached across the chest for the right shoulder and the arm folded flat)
            wL = Smooth((t - .18) / .16) if t <= .40 else w * (1 - Smooth((t - .40) / .18))
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
        if not (.26 < t <= .80):
            return {}
        w = World(RifleAt(t), t)
        return {'R': w['gripR'], 'L': w['gripL']} if .34 <= t <= .40 else {'R': w['gripR']}
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
    # (2026-09-28: it joined over 0.08 s and left over 0.08 s -- the wrist 0.46 and 0.61 m in a frame; now 0.30-0.55 on,
    # 0.62-0.82 off)
    both = Channel([(0.0, 0.0), (.30, 0.0), (.55, 1.0), (.62, 1.0), (.82, 0.0), (1.0, 0.0), (1.2, 1.0), (1.5, 1.0)])
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
    # (2026-09-28: the rifle comes off the back over 0.32 s, not 0.28, and to ready by 1.34 s; the right hand lets go of
    # the planted hilt over 0.18 s and takes the rifle over 0.16 s, the left over 0.30 s -- each was a one- or two-frame
    # switch, the forearm turning 111-160 deg in a frame)
    rifles = [(0.0, backRifle), (.72, backRifle), (1.04, lifted), (1.34, ready), (1.6, ready)]

    def RifleAt(t):
        for (t0, a), (t1, b) in zip(rifles, rifles[1:]):
            if t <= t1:
                u = Smooth((t - t0) / max(1e-6, t1 - t0))
                return T.Rifle(Lerp3(a['origin'], b['origin'], u), Unit(Lerp3(a['axis'], b['axis'], u)))
        return ready
    along = Channel([(0.0, .92), (.72, .92), (1.04, .70), (1.20, .45), (1.38, WEAPONS[T.gun]['butt']), (1.6, WEAPONS[T.gun]['butt'])])

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
            # up over the right shoulder for the rifle on his back (the wrist a hand above the shoulder: at
            # -.10 .02 .05 it sat on the shoulder, the elbow folded 155 deg)
            f['handRel.R'] = (-.06, .05, .17)
            f['palmF.R'], f['palmN.R'], f['curl.R'] = (0, .3, 1), (0, 1, 0), .6
            if t < .68:
                f['grip.R'], f['gripW.R'] = planted['gripR'], 1 - Smooth((t - .50) / .18)
            f['handRelW.R'] = 1.0
        else:
            rifle = RifleAt(t)
            palms = T.Palms(rifle['axis'])
            f['grip.R'] = T.Along(rifle, along(t))
            f['palmF.R'], f['palmN.R'], f['curl.R'] = palms['R'][0], palms['R'][1], .95
            f['gripW.R'] = Smooth((t - .70) / .16)
            if t >= 1.00:
                f['grip.L'] = rifle['gripL']
                f['gripW.L'] = Smooth((t - 1.00) / .30)
                f['palmF.L'], f['palmN.L'], f['curl.L'] = palms['L'][0], palms['L'][1], .85
            if f['gripW.R'] < 1.0:
                f['handRel.R'], f['handRelW.R'] = (-.06, .05, .17), 1.0
            else:
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


Meta('IjaButtStrikeCollar', BUTT_T, False, 'track', role='ijaA', rig='TengxianIja02', props=['weapon'], rootMotion=False,
     weaponState='clubRight', player=True, holdLoop=[.55, 1.05],
     holdExit='pose.holdUntil: the apex loop lets go at that clip time; 1.05-1.125 s wind-up, butt on the head at 1.375 s',
     contacts=[{'t': 0.0, 'limb': 'handL', 'action': 'hold', 'partnerRole': 'shunzi', 'part': 'collar'},
               # the butt lands on his forehead: playerOffsetM from the player 'head' point (his eye) in the
               # actor frame, runtime metres (ButtStrikeParts hitButt: source (0, .05, .07) x IJA02 scale 0.913)
               {'t': BUTT_HIT_T, 'limb': 'butt', 'action': 'strike', 'partnerRole': 'shunzi', 'part': 'head',
                'playerOffsetM': [0.0, .064, .046]}],
     events=[{'t': .55, 'kind': 'apex'}, {'t': 1.125, 'kind': 'windUp'},
             {'t': BUTT_HIT_T, 'kind': 'buttHit', 'fact': 'playerStruck'}],
     prev=['IjaHaulForearmUnder', 'IjaKickBeam'], next=['IjaDragByForearm'],
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
    # (2026-09-28) the right forearm starts on the twist branch IjaHaulForearmUnder ends on although the hand is not the
    # same (the director blends the two): on the other branch it turned 153 deg in that blend. The club hand's twist is
    # past the bake's TWIST_MAX in the apex hold loop: it keeps the unwrapped branch (the seam is one pose).
    spec['seedAnyHand'], spec['twistMax'] = 'R', 400
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


Meta('IjaDragByForearm', DRAG_T, False, 'track', role='ijaA', rig='TengxianIja02', props=['weapon'], rootMotion=True,
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
Meta('IjaLookBackLow', LOOK_T, False, 'track', role='ijaA', rig='TengxianIja02', props=['weapon'], rootMotion=False,
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


STARTLE_DUCK = .09                  # the flinch drops his hips (source m): the head comes down out of the top of SB05A
# (.07 on the Lugou rig; TengxianHumanoidV1 2026-09-26: the collar hold already sinks the hips on the shorter reach, and
# at .07 the head dropped only 0.8 cm between the hold and the end of the flinch -- the test wants >= 2 cm)
# The keyed head of the last frame (x = nod, + down; z = turn, + to his left): chin up so the face stays level on
# the man coming up behind him after the look aim lets go (0.34-0.54 s). With the squat's forward lean the old
# (.05, 0, .80) dropped the face 39 deg to the ground by the end (2026-09-25 review).
STARTLE_HEAD = (-.55, 0, .80)


def StartleEnd(T):
    """IjaStartleTurn's last frame = IjaParriedChoppedFall frame 0: the collar let go, the fist drawn back,
    trunk twisted and head turned to his left rear, shoulders up, hips dropped in the flinch."""
    f = HoldCollarBase(T)
    f.update({'twist': .45, 'neck': (.05, 0, .25), 'head': STARTLE_HEAD, 'shrug': .12, 'lookW': 0.0,
              'handRel.L': (.14, -.22, -.28), 'curl.L': .45, 'pelvis': Add3(f['pelvis'], (0, 0, -STARTLE_DUCK))})
    return f


Meta('IjaStartleTurn', STARTLE_T, False, 'track', role='ijaA', rig='TengxianIja02', props=['weapon'], rootMotion=False,
     weaponState='slungRight', player=True,
     contacts=[{'t': 0.0, 'limb': 'handL', 'action': 'hold', 'partnerRole': 'shunzi', 'part': 'collar'},
               {'t': .12, 'limb': 'handL', 'action': 'release'}],
     events=[{'t': .04, 'kind': 'startle'}, {'t': .12, 'kind': 'releaseCollar'}],
     prev=['IjaHoldCollarUp'], next=['IjaParriedChoppedFall'],
     notes='SB05A: frame 0 = IjaHoldCollarUp at its hold-loop start (0.8 s). A flinch (0.04 s), the fist opens off the '
           'collar (0.12 s) and head and shoulders snap round to his LEFT rear (= screen right from Shunzi, where Luo '
           'and He come from) by 0.3 s, eyes on a point 95 deg to his left at head height. Shunzi sinks (player collar '
           'and head drop 0.12 m: the contract\'s 0.62 m eye); he flinches down with it (hips 0.07 m lower, so his head '
           'stays in the top of the SB05A frame). Look check: the face on the swinging look point while the aim is on '
           '(0-0.34 s); the keyed head then holds the turn to his left rear. Last frame = IjaParriedChoppedFall frame 0 '
           '(same root, no blend).')


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
        'pelvis': [(0.0, hold['pelvis']), (.06, hold['pelvis']), (.30, end['pelvis']), (STARTLE_T, end['pelvis'])],
        # the chin comes up to the end key while the look aim lets go (0.34-0.54 s), so the face stays level
        'head': [(0.0, hold['head']), (.04, (-.14, 0, .10)), (.30, (.05, 0, STARTLE_HEAD[2])), (.54, end['head']),
                 (STARTLE_T, end['head'])],
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
    def Look(t):
        # the look check while the aim is fully on (0-0.34 s): the face follows the point swinging from Shunzi's eye
        # to the one 95 deg to his left. After that the keyed head holds the turn (the repository test measures
        # where the face points on the last frame: to his left rear, level).
        return tuple(Vector(head(t)).lerp(Vector(STARTLE_LOOK), swing(t))) if body(t)['lookW'] >= .99 else None
    spec = {'pose': Pose, 'props': Props, 'plants': [('L', 0, STARTLE_T), ('R', 0, STARTLE_T)],
            'check': lambda t: PlayerHands({}, t, grips), 'player': lambda t: {'collar': collar(t), 'head': head(t)},
            'look': Look,
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
Meta('IjaGuardPort', 3.0, True, 'track', role='ijaB', rig='TengxianIja01', props=['weapon'], rootMotion=False,
     weaponState='twoHand',
     prev=['IjaKickPrisoner', 'IjaReadyRifle'], next=['IjaChoppedFallWall', 'IjaChoppedFallBack'],
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
NRA02_SCALE = .9135          # TengxianNra02 source -> runtime metres (manifest numbers below are runtime)


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
Meta('LuoKneelReach', REACH_T, False, 'free', role='luo', rig='TengxianNra05', rootMotion=False, player=True,
     holdLoop=list(REACH_HOLD),
     holdExit='pose.holdUntil: the loop lets go at that clip time and plays on through the 2.5-2.8 s hand back and the rise',
     contacts=[{'t': REACH_HOLD[0], 'limb': 'handL', 'action': 'reach', 'partnerRole': 'shunzi', 'part': 'chest',
                'gapM': REACH_GAP_M},
               {'t': REACH_HOLD[1], 'limb': 'handL', 'action': 'release'}],
     events=[{'t': .60, 'kind': 'kneel'}, {'t': 1.05, 'kind': 'line', 'line': 'RescueCheck.01'}, {'t': 2.8, 'kind': 'rise'}],
     prev=['LuoDragToCover'], next=['KickRifle', 'LuoKneelCheck'],
     notes='SB06 (2026-09-25): from the standing pose (= LuoKneelCheck frame 0) he drops onto his right knee in front of '
           'the sitting Shunzi (1.1 m, player head/chest), leans in and holds out his open left hand, palm down, fingers '
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
# 2026-09-25 review: the storyboard's LEFT hand on the post put him north of the north door post, i.e. inside
# the dugout's north wall (or, turned so the left hand reaches it, with his back to the dugout). Mirrored
# (contract §1.3): the RIGHT hand on the post at his front right, so he stands in the mouth just south of the
# north post facing into the dugout -- post, fist, body read left to right from the SB01 camera.
RUNNER_POST = (-.62, -.32)             # the post's axis on the ground (source m, his frame: +X = his left)
RUNNER_POST_R = .065                   # post radius (source m, ~0.12 m timber)
RUNNER_GRIP = (-(.62 - RUNNER_POST_R - .025), -.34, 1.28)   # finger-root centroid of the fist round the post (source m)
RUNNER_LOOK = (.30, -2.6, .80)         # into the dugout: the men 2.6 m in, low (source m)


def _RuntimePoint(p, scale=NRA02_SCALE):
    return [round(-p[0] * scale, 3), round(p[2] * scale, 3), round(p[1] * scale, 3)]


Meta('RunnerLeanPostCall', RUNNER_T, False, 'track', role='runner', rig='TengxianNra02', props=['weapon'], rootMotion=False,
     weaponState='slungBack', holdLoop=list(RUNNER_HOLD),
     contacts=[{'t': .45, 'limb': 'handR', 'action': 'brace', 'target': 'post', 'untilT': RUNNER_T,
                # the fist's finger roots on the post, and the post's axis on the ground (runtime metres, actor frame)
                'pointM': _RuntimePoint(RUNNER_GRIP), 'postAxisM': _RuntimePoint((RUNNER_POST[0], RUNNER_POST[1], 0.0)),
                'postRadiusM': round(RUNNER_POST_R * NRA02_SCALE, 3)}],
     events=[{'t': .45, 'kind': 'handOnPost'}, {'t': 1.25, 'kind': 'shout'}, {'t': 2.30, 'kind': 'shout'}],
     prev=['MessengerReport'], next=['MessengerReport'],
     notes='SB01 (2026-09-25): in the dugout mouth, the RIGHT hand closes round the north door post at shoulder height '
           '(0.45 s; contact pointM = the fist on the post, postAxisM = where the post stands, runtime metres in the actor '
           'frame: the director puts the root so postAxisM is on the north door post (1.05,-127.5) -- facing into the '
           'dugout that is root ~(1.24,-126.89), yawDeg ~80) and he leans in past it, shouting into the dugout (head on a '
           'point 2.4 m in, 0.73 m up, a little to his left). Mirrored from the storyboard\'s left hand (contract §1.3: the '
           'storyboard side of the post is the north wall). 0.75-3.0 s is a seamless hold loop with two shouts '
           '(1.25 / 2.30 s: the trunk pushes in, the free left hand swings up). Rifle slung across the back.')


@Builder('RunnerLeanPostCall')
def BuildRunnerLeanPost(T, name):
    H, P, A, SX = T.H, T.P, T.A, T.SX
    base = Standing(T)
    # (mirror of the storyboard's left-hand brace: every left/right key below is swapped and negated in X)
    base.update({'ankle.L': (H + .02, .20, A), 'ankle.R': (-(H + .06), -.14, A), 'foot.L': (0, 12, 0), 'foot.R': (0, -14, 0),
                 'pelvis': (-.02, .04, P - .05), 'lookW': 0.0, 'handRel.L': (.06, -.14, -.44), 'curl.L': .55})
    lean = {'bend': .60, 'pelvisTilt': (.16, 0, -.04), 'twist': -.04, 'pelvis': (-.05, .10, P - .08), 'lookW': 1.0}
    body = Keys(base, [(0.0, {'bend': .12}), (.45, lean), (RUNNER_HOLD[0], lean), (RUNNER_HOLD[1], lean)], lag={'head': .05})
    # the fist on the post: fingers round it (toward his front), palm onto the wood, thumb up
    palmF, palmN = Unit((.25, -.95, 0)), Unit((-1, -.15, 0))

    def Shout(t):
        return Bump(t, .95, 1.75) + Bump(t, 2.0, 2.85)

    def Pose(t):
        f = body(t)
        s = Shout(t)
        f['bend'] += .08 * s
        f['look'] = Add3(RUNNER_LOOK, (0, 0, -.10 * s))
        # the free left hand swings up a little on each shout
        r = f['handRel.L']
        f['handRel.L'] = (r[0] + .01 * s, r[1] - .07 * s, r[2] + .07 * s)
        f['curl.L'] = .55 + .25 * s
        EaseGrip(f, 'R', RUNNER_GRIP, Smooth((t - .15) / .30), palmF, palmN, .95)
        return T.Nest(f)
    props, review = SlungProps(T, 'back')
    post = [('cyl', (RUNNER_POST[0], RUNNER_POST[1], 0.0), (RUNNER_POST[0], RUNNER_POST[1], 1.95), RUNNER_POST_R)]
    spec = {'pose': Pose, 'props': props, 'plants': [('L', 0, RUNNER_T), ('R', 0, RUNNER_T)],
            'check': lambda t: {'R': RUNNER_GRIP} if t >= .45 else {},
            'look': lambda t: Add3(RUNNER_LOOK, (0, 0, -.10 * Shout(t))) if body(t)['lookW'] >= .99 else None,
            'reviewProps': lambda t: review(t) + post,
            'reviewFrames': lambda n: [0, int(n * .15), int(n * .42), int(n * .77), n - 1]}
    spec = AReview(spec)
    # SB01 camera: sitting in the dugout ~3.2 m in front of him and ~21 deg to his left, eye 0.95 m up
    spec['reviewViews'].append(('sb', (1.15, -3.0, 1.04), (-.35, 0, 1.05), 65.0, 0.0))
    return spec


# -- SB04A InterpreterHurryReach (Nra02 -> NRA06) --------------------------------------
# The interpreter hurries back up the trench toward the downed Shunzi with one arm out (SB04A). An upper-body
# clip: the director plays it with upperBody:true over the native fast walk (Move(..., {upperBody:true})),
# so only the arms, clavicles, neck and head come from here; the legs here only stand in a stride for the
# stills and a stationary fallback.
HURRY_T = 30 / 24                      # 1.25 s
HURRY_HOLD = (.50, HURRY_T)
HURRY_LOOK = (0, -3.2, .40)            # the man on the ground ~3 m ahead (source m)
Meta('InterpreterHurryReach', HURRY_T, False, 'free', role='interpreter', rig='TengxianNra02', rootMotion=False,
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
Meta('YaowaSitLoad', LOAD_T, True, 'track', role='yaowa', rig='TengxianNra02', props=['weapon'], rootMotion=False,
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


# -- SB01 ShunziSitFillCharger (Nra02: the first-person player body) ---------------------------
# 2026-09-27 review 「主角应该在给自己的弹夹装弹，手上的动作是自然延续的而不是僵住」: through Banter and the
# first half of Orders Shunzi sits against the back wall filling an empty five-round charger with loose rounds from
# the pouch at the right front of his belt. The first-person body plays this clip (Script_OpeningFirstPerson
# fill mode); it replaces the two held palm poses (palmClip / palmClipTilt) that only tilted the charger.
# He sits on an ammo crate against the back wall (FILL_SEAT; the runtime draws it: SB01's eye stays 0.85-1.05 m up
# -- on the floor the eye was 0.72 m and Luo's head covered the men going up the trench), feet on the floor, the rifle
# along his right thigh (laid there at runtime), the charger held in the left hand over the lap, the head bowed. Loop (9.5 s): five rounds -- the right hand dips into the
# pouch, comes back with a round, sets it over the charger's lips, presses it down and slides it home with the
# thumb -- then the full charger is looked over, tucked into the left breast pocket and an empty one comes out
# (each way ~0.65 s: the palm turns ~130 deg from under the charger to the pocket). Hands are written in the torso
# frame (left, back, up) from the shoulders' midpoint (RelArm), so the breathing and the lean carry them; the FILL_
# points are palm centres, the wrist sits FILL_PALM behind along the fingers.
# 2026-09-29 review 「画面里怎么没有枪」: the lap rifle (runtime FP_PROPS.fillRifle) now lies along the right thigh
# as in SB01 -- receiver just behind the right knee, butt low beside the hip, muzzle up towards the dugout mouth -- and
# between rounds the right hand rests on it behind the knee (FILL_RIFLE_REST, palm down, fingers across it towards the
# muzzle) instead of hanging by the knee under it. FILL_RIFLE_REST is the runtime rifle's top measured in this torso
# frame (the lap-rifle probe in docs/Data_OpeningFirstPersonLoad20260927.md); moving fillRifle means measuring it again.
FILL_T = 228 / 24                                   # 9.5 s
FILL_ROUND0, FILL_ROUND_S = .25, 1.45               # the first round's cycle start; one round
FILL_PICK, FILL_OVER, FILL_PRESS, FILL_SLIDE = .48, .92, 1.08, 1.22   # in a cycle: round taken, over the lips, pressed, home
FILL_REST_AT = 7.85                                 # the right hand back on the rifle after the fifth round
FILL_STOW, FILL_DRAW = 8.30, 8.55                   # the full charger into the pocket, the empty one out
FILL_PALM = .075
FILL_CHARGER = (.03, -.42, -.12)                    # the charger (under the right palm pressing on it)
FILL_POUCH = (-.16, -.16, -.47)                     # right front belt pouch
FILL_POCKET = (.10, -.11, -.15)                     # left breast pocket
FILL_RIFLE_REST = (-.24, -.33, -.27)                # right hand resting on the lap rifle behind the right knee
FILL_SEAT = (.44, .30, .28)                         # the crate (runtime m: across, deep, high) under the seat


def FillRounds():
    """Clip seconds of each round's pick-up (event roundPicked) and press (roundIn)."""
    return [(FILL_ROUND0 + k * FILL_ROUND_S + FILL_PICK, FILL_ROUND0 + k * FILL_ROUND_S + FILL_PRESS) for k in range(5)]


Meta('ShunziSitFillCharger', FILL_T, True, 'free', role='shunzi', rig='TengxianNra02', props=[], rootMotion=False,
     env={'wallBehindM': .35}, firstPerson=True, seat={'crateM': list(FILL_SEAT)},
     events=[e for k, (pick, press) in enumerate(FillRounds())
             for e in ({'t': round(pick, 3), 'kind': 'roundPicked', 'n': k + 1}, {'t': round(press, 3), 'kind': 'roundIn', 'n': k + 1})]
            + [{'t': FILL_STOW, 'kind': 'chargerStowed'}, {'t': FILL_DRAW, 'kind': 'chargerDrawn'}],
     notes='SB01 first person (2026-09-27): seated on an ammo crate (seat.crateM, drawn at runtime) against the back '
           'wall, feet on the floor, rifle along the right thigh (runtime prop; the right hand rests on it between rounds), the charger held in the left hand over the lap. Five rounds from the right '
           'front belt pouch pressed into it one after the other (events roundPicked / roundIn n), then the full '
           'charger looked over, into the left breast pocket (chargerStowed) and an empty one out (chargerDrawn). '
           'Hands in the torso frame. Played on the player body in Banter / Orders until the order to leave.')


def FillPalms():
    """Palm (fingers, palm normal) in the torso frame (left, back, up)."""
    return {
        # left: palm up under the charger, fingers across to the right, thumb over the top
        'hold': (Unit((-.60, -.78, .12)), Unit((-.30, -.10, .95))),
        'check': (Unit((-.45, -.70, .55)), Unit((-.35, .55, .76))),
        'pocket': (Unit((.05, -.50, -.86)), Unit((.05, .86, -.50))),
        # right: palm down over the charger, fingers forward and to the left
        'press': (Unit((.45, -.85, -.28)), Unit((.10, .25, -.96))),
        'pouch': (Unit((.05, -.35, -.94)), Unit((.25, .90, -.35))),
        # right: resting on the lap rifle, palm down on it, fingers across it forward and to the left
        'rifle': (Unit((.855, -.495, .151)), Unit((-.275, -.330, -.903))),
    }


def FillWrist(palm, forward):
    return tuple(Vector(palm) - Vector(forward) * FILL_PALM)


@Builder('ShunziSitFillCharger')
def BuildShunziSitFillCharger(T, name):
    H, A, SX = T.H, T.A, T.SX
    base = SitBase(T)
    seatZ = T.R(FILL_SEAT[2])
    base.update({'pelvis': (0, .05, .125 + seatZ - .02), 'pelvisTilt': (-.12, 0, .03), 'bend': .40, 'lean': .02, 'twist': .03,
                 'shrug': .05, 'lookW': .85,
                 # on the crate: thighs level, shins down to the floor a little apart, the rifle lies along the right thigh
                 'ankle.L': (H + .10, -.46, A), 'ankle.R': (-(H + .08), -.42, A),
                 'legPole.L': (H + .30, -.90, .50), 'legPole.R': (-(H + .28), -.90, .50), 'foot.L': (0, 8, 0), 'foot.R': (0, -8, 0),
                 'grip.L': None, 'grip.R': None})
    P = FillPalms()
    C, pouch, pocket, rest = Vector(FILL_CHARGER), Vector(FILL_POUCH), Vector(FILL_POCKET), Vector(FILL_RIFLE_REST)
    over = C + Vector((-.012, .012, .062))
    press = C + Vector((0, 0, .034))
    home = C + Vector((.010, .006, .030))
    # the arc out to the right between pouch and charger, low: the forearm stays under the eye line
    up = (C + pouch) * .5 + Vector((-.09, -.02, -.01))
    down = (C + pouch) * .5 + Vector((-.10, -.02, -.04))
    # right palm centre, the pouch weight (palm turned into the pouch), the rest weight (palm on the rifle), curl and index curl
    rows = [(0.0, rest, 0.0, 1.0, .55, .50)]
    for k in range(5):
        s = FILL_ROUND0 + k * FILL_ROUND_S
        start = rest if k == 0 else home
        # off the rifle a little earlier than off the charger: the palm turns further from it to the pouch
        rows += [(s - .15 if k == 0 else s, start, 0.0, 1.0 if k == 0 else 0.0, .55 if k == 0 else .45, .50 if k == 0 else .45),
                 (s + .20, down, .55, .0, .30, .25),
                 (s + .38, pouch, 1.0, .0, .25, .20),
                 (s + FILL_PICK, pouch + Vector((0, 0, -.018)), 1.0, .0, .80, .95),
                 (s + .66, up, .45, .0, .75, .90),
                 (s + FILL_OVER, over, 0.0, .0, .70, .85),
                 (s + FILL_PRESS, press, 0.0, .0, .55, .70),
                 (s + FILL_SLIDE, home, 0.0, .0, .45, .45)]
    rows += [(FILL_REST_AT, rest, 0.0, 1.0, .55, .50), (FILL_T, rest, 0.0, 1.0, .55, .50)]
    rows.sort(key=lambda r: r[0])
    palmR = Channel([(r[0], tuple(r[1])) for r in rows], periodic=True)
    pouchW = Channel([(r[0], r[2]) for r in rows], periodic=True)
    restW = Channel([(r[0], r[3]) for r in rows], periodic=True)
    curlR = Channel([(r[0], r[4]) for r in rows], periodic=True)
    indexR = Channel([(r[0], r[5]) for r in rows], periodic=True)
    # left palm centre: under the charger, pushing up a little against each press; the check, the pocket, back
    hold = C + Vector((.035, .01, -.03))
    rowsL = [(0.0, hold, 0.0, 0.0)]
    for pick, pressAt in FillRounds():
        rowsL += [(pick + .20, hold + Vector((-.006, 0, -.004)), 0.0, 0.0),                   # turns the lips to the round
                  (pressAt, hold + Vector((-.004, 0, .010)), 0.0, 0.0),                       # meets the press
                  (pressAt + .22, hold, 0.0, 0.0)]
    check = hold + Vector((-.02, .03, .10))
    rowsL += [(7.30, hold, 0.0, 0.0), (7.50, check, 1.0, 0.0), (7.62, check + Vector((.005, 0, .008)), 1.0, 0.0),
              (FILL_STOW - .02, pocket, 0.0, 1.0), (FILL_DRAW, pocket + Vector((0, 0, .012)), 0.0, 1.0),
              (9.20, hold + Vector((0, .01, -.01)), 0.0, 0.0), (FILL_T, hold, 0.0, 0.0)]
    rowsL.sort(key=lambda r: r[0])
    palmL = Channel([(r[0], tuple(r[1])) for r in rowsL], periodic=True)
    checkW = Channel([(r[0], r[2]) for r in rowsL], periodic=True)
    pocketW = Channel([(r[0], r[3]) for r in rowsL], periodic=True)
    lookAt = (-.02, -.62, .30)                               # world (source m): down at the charger in front of him

    def Frame(palm):
        """(fingers, palm normal) -> the palm's rotation, so two palms mix by slerp (lerping the two directions apart
        bunched the whole roll of the pocket tuck into a few frames)."""
        x = Vector(palm[0]).normalized()
        z = Vector(palm[1]) - x * x.dot(Vector(palm[1]))
        z.normalize()
        return Matrix((x, z.cross(x), z)).transposed().to_quaternion()

    Q = {name: Frame(palm) for name, palm in P.items()}

    def Mix(a, b, w):
        return a.slerp(b, Clamp(w))

    def Palm(q):
        return tuple(q @ Vector((1, 0, 0))), tuple(q @ Vector((0, 0, 1)))

    def Pose(t):
        f = SitBreath(t, dict(base), period=FILL_T / 2, amount=.5)
        # the shoulders dip a little into each press
        f['bend'] += .015 * sum(Bump(t, p - .10, p + .25) for _, p in FillRounds())
        pw, kw = pouchW(t), restW(t)
        fR, nR = Palm(Mix(Mix(Q['press'], Q['pouch'], pw), Q['rifle'], kw))
        cw, qw = checkW(t), pocketW(t)
        fL, nL = Palm(Mix(Mix(Q['hold'], Q['check'], cw), Q['pocket'], qw))
        # handRel is measured from each shoulder: they sit SX to either side of the midpoint
        wristR = Vector(FillWrist(palmR(t), fR)) + Vector((SX, 0, 0))
        wristL = Vector(FillWrist(palmL(t), fL)) - Vector((SX, 0, 0))
        f['handRel.R'], f['handRel.L'] = tuple(wristR), tuple(wristL)
        f['palmF.R'], f['palmN.R'], f['curl.R'], f['index.R'] = fR, nR, curlR(t), indexR(t)
        f['palmF.L'], f['palmN.L'], f['curl.L'], f['index.L'] = fL, nL, .55 - .25 * qw, .40
        f['poleRel.L'], f['poleRel.R'] = (.40, .30, -.40), (-.40, .30, -.40)
        f['look'] = lookAt
        return T.Nest(f)
    # twistMax: the pocket tuck turns the left palm over past the forearm's half turn; unwrapped (the 09-28 default, 320 deg)
    # the twist never came back and the loop's seam copy snapped the left forearm 180 deg on its last frame.
    # twistSplit (2026-09-29 「手的模型扭曲成这样了」): the skeleton binds the hand 81 deg off the forearm round its axis,
    # and the twist was halved without it: the palm-up left hand sat 81 deg at the elbow and 162 deg at the wrist (244 deg
    # of turn against its bind pose, on the long way round -- the tuck's turn to the pocket ran on to 425), where a
    # two-bone skin pinches shut at a 160 deg turn (the first person sees the wrist, at the bottom of the frame). Now the
    # turn is kept on the branch nearest the bind pose (-116 deg at the hold, +65 at the pocket) and shared shoulder .35 /
    # elbow .35 / wrist .30 (41 / 41 / 35 deg at the hold: the wrist is the joint on screen, the shoulder is not).
    spec = {'pose': Pose, 'plants': [('L', 0, FILL_T), ('R', 0, FILL_T)], 'look': lambda t: lookAt, 'twistMax': 180,
            'twistSplit': (.35, .35, .30),
            'walls': SIT_WALL, 'reviewFrames': lambda n: [0, int(n * .06), int(n * .08), int(n * .12), int(n * .14), int(n * .87), int(n * .93)],
            'reviewProps': lambda t: [('box', (0, .06, seatZ / 2), (T.R(FILL_SEAT[0]), T.R(FILL_SEAT[1]), seatZ), 0)]}
    spec['reviewViews'] = list(SIT_VIEWS)
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
FALLBACK_SEAT = (.06, .20, .15)           # pelvis when the seat hits the mud (source m, IJA01): 0.2 m behind his root
# He goes over toward his LEFT rear (the body turned this far to his right about the pelvis once the feet are off,
# rad): Luo stands at his right rear (chopRear stage), and straight back put ijaB's right shoulder and arm through
# Luo's left thigh (browser review 2026-09-25, 11 cm capsule overlap at 1.08 s). The wall on his left is 0.745 m off.
FALLBACK_TURN = -.38
FALLBACK_SIT = 22 / 24                    # 0.917 s: the seat hits the mud
Meta('IjaChoppedFallBack', FALLBACK_T, False, 'track', role='ijaB', rig='TengxianIja01', props=['weapon'], rootMotion=True,
     stage='chopRear', env={'wallLeftM': round(CHOP_WALL_X * .9213, 2)}, terminal=True,
     contacts=[{'t': .45, 'by': 'luo', 'part': 'neckSideR', 'action': 'cut'}],
     events=[{'t': .45, 'kind': 'bloodSpray', 'at': 'neckSideR'}, {'t': .50, 'kind': 'weaponLost'},
             {'t': FALLBACK_SIT, 'kind': 'seatHit'}, {'t': FALLBACK_T, 'kind': 'dead'}],
     prev=['IjaGuardPort', 'IjaBayonetGuard', 'IjaReadyRifle'], next=[],
     notes='SB05A (2026-09-25), alternative to IjaChoppedFallWall on the same stage and frames 0-0.50 s: aiming down '
           'at Shunzi when the blade lands; neck snaps away, the rifle drops forward into the mud in front of Shunzi, '
           'the front (left) foot shoots out and he sits down hard 0.2 m behind his root (0.92 s, event seatHit), the '
           'trunk thrown back, arms flung out, right knee up (the SB05A frame is 0.92-1.15 s); then he goes over onto '
           'his back toward his left rear (turned 22 deg right about the pelvis: Luo stands at his right rear), the '
           'right knee falling open. Last frame is the corpse on his back.')


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
        (0.78, {'pelvis': (.03, .15, P - .44), 'pelvisTilt': (-.30, .08, -.28), 'bend': -.04, 'turn': FALLBACK_TURN * .35,
                'ankle.L': (H + .06, -.48, A + .10), 'legPole.L': (H + .15, -1.0, 1.0), 'foot.L': (-40, 10, 0),
                'legPole.R': (-(H + .30), -.9, .6), 'head': (-.05, .30, .50), 'shrug': .15}),
        # Seat in the mud: trunk thrown back, left leg out toward Shunzi, right knee up, arms flung wide.
        (S, {'pelvis': (sx, sy, sz), 'pelvisTilt': (-.50, .08, -.22), 'bend': -.08, 'lean': -.04, 'turn': FALLBACK_TURN,
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
    base['turn'] = 0.0
    anim = Keys(base, rows, lag={'head': .04, 'neck': .03})
    # Free hands in the torso frame (left, back, up from the shoulder): flung out as he sits, slack on the
    # ground beside him once he lies back (the torso's `back` is then the ground). The left one stays clear
    # of the trench wall on his left.
    hands = Keys({'handRel.R': (-.10, -.20, -.42), 'handRel.L': (.10, -.10, -.45)}, [
        (0.0, {}), (.62, {}),
        (0.78, {'handRel.R': (-.28, -.34, -.18), 'handRel.L': (.26, -.26, -.20)}),
        (S, {'handRel.R': (-.08, -.46, .10), 'handRel.L': (.30, -.22, -.10)}),   # right arm up in front, clear of Luo
        (1.12, {'handRel.R': (-.10, -.44, .02), 'handRel.L': (.30, -.14, -.16)}),
        (1.50, {'handRel.R': (-.16, -.24, -.14), 'handRel.L': (.30, -.04, -.24)}),
        (FALLBACK_T, {'handRel.R': (-.24, -.06, -.24), 'handRel.L': (.30, .04, -.28)})])

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
            # the right hand opens toward Shunzi as it is flung up (SB05A: fingers spread, palm out)
            w = Smooth((t - .62) / .20)
            f['palmF.R'] = Unit(Lerp3((0, -.2, -1), (-.6, 0, .8), w))
            f['palmN.R'] = Unit(Lerp3((1, 0, 0), (0, -1, 0), w))
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
        return T.Nest(Turned(f, f['turn']))

    spec = {'pose': Pose, 'props': lambda t: {'weapon': T.Track(RifleAt(t))}, 'plants': [('L', 0, .50), ('R', 0, .72)],
            'walls': [((wallX, 0, 0), (-1, 0, 0))],
            'reviewProps': lambda t: T.RifleProps(RifleAt(t)) + [('box', (wallX + .03, 0, .7), (.06, 2.0, 1.4), 0)],
            'reviewFrames': lambda n: [0, int(n * .22), int(n * .35), int(n * .41), int(n * .5), int(n * .7), n - 1]}
    spec = AReview(spec)
    # SB05A camera: Shunzi half-lying 3 m in front of ijaB, eye 0.67 m up, looking a little up the trench
    spec['reviewViews'].append(('sb', (-.315, -3.02, .673), (-.52, -.03, .99), 65.0, 0.0))
    return spec


# =================================================================================
# 01 Found / DragOut over the fallen roof timber (2026-09-27 review: 「日军从外面走进来怎么能直接进的，至少有个翻越
# 动作吧。拖动的动作也还是很奇怪」). The roof timber (Data_OpeningSet0103 roofTimberDown, settled in Reach) lies across
# the dugout mouth 0.3 m in front of Shunzi's eye, its top 0.80 m over the floor -- ijaA's hip height. ijaA used to walk
# through it into the pit and walk back out through it with Shunzi trailing off one arm stretched behind him. Now he
# side-vaults it into the pit (IjaVaultTimberIn: the left hand on the timber, the rifle up in the right fist), and after
# the kick lets go, vaults back out (IjaVaultTimberOut: both hands, the rifle slung), drops to a knee at its east face,
# seizes the left wrist Shunzi has stretched out from under it after the rifle and hauls him out backwards, bent low,
# face on him, to the trench edge where the butt comes down (IjaHaulForearmUnder): 「顺子的身体从断木下面被拖出来」.
# Both vaults cross on the lane z -124.72, where the fallen lintel over the timber is highest (underside ~1.5 m); the head
# goes out over the landing side, never under the lintel's low north end. The numbers below are RUNTIME metres in each
# clip's root frame: d ahead (actor -z), l to his left, h up (Data_OpeningStoryboards.ija.vault / haul place the roots;
# Script_OpeningStoryboardsTest checks the two agree).
# =================================================================================
REACH_ASSIST_DEFAULT = .92          # the bake's REACH_FRACTION (Script_OpeningStoryboardBake)
VAULT_TOP = .80                     # the timber's top over the floor (roofTimberDown settled: lift .65 + half its .28)
# IjaVaultTimberIn crosses on the lane z -124.95, just north of the timber's south support: from Shunzi's eye under the
# timber the approach and the landing are in view (on z -124.72 the support hid them); the lintel over it ~1.4 m
VAULT_IN_NEAR, VAULT_IN_FAR = .47, .77   # its east / west face ahead of IjaVaultTimberIn's root (1.42,-124.95) facing west
VAULT_IN_END = (.914, -.482)        # the snag root (0.506,-125.432) in that frame: the clip ends standing on it, facing west
VAULT_IN_EYE = (1.17, -.10, .18)    # Shunzi's reach eye (0.25,-125.05) in that frame
VAULT_OUT_NEAR, VAULT_OUT_FAR = .144, .444   # the timber's west / east face BEHIND the snag root (IjaVaultTimberOut's root)
VAULT_OUT_LANE = .712               # the lane (z -124.72) to the left of the snag root
# IjaHaulForearmUnder's root in the snag frame (d, l, turn rad, + = left): Data_OpeningStoryboards.ija.haul puts the root
# where the clip's frame-0 head track lands on haul.eye facing back along haul.eye -> shunzi.butt (1.097,-125.039, yaw 62.0 deg)
VAULT_OUT_END = (-.591, .393, -.4887)
HAUL_WRIST = (0.0, 0.0, .12)        # Shunzi's left wrist, stretched out 0.22 m past the timber's east face (d, l, h)
HAUL_EYE = (.45, 0.0, .30)          # his eye under the timber, 0.45 m behind the wrist (the arm out after the rifle), 0.3 m up
HAUL_TRAVEL = 1.812                 # the eye's haul: from under the timber (0.70,-125.25) to shunzi.butt (2.3,-124.4)
VIN_T = 44 / 24
VOUT_T = 46 / 24
HAUL_T = 66 / 24
HAUL_GRAB_T = 9 / 24


def RootPoint(T, d, l, h=None):
    """(d ahead, l left[, h up]) runtime metres in a clip root frame -> source metres (Blender: +X left, -Y ahead)."""
    return (T.R(l), -T.R(d)) if h is None else (T.R(l), -T.R(d), T.R(h))


def BodyPoint(pel, psi, left, back, z):
    """A point given in the body frame (x left, y back, source metres) of a body whose pelvis ground point is
    `pel` and which is turned psi (rad, + = left) -- in the clip root frame."""
    x, y = _Rot(left, back, psi)
    return (pel[0] + x, pel[1] + y, z)


def BodyRifle(T, pel, psi, rest, dz=0.0):
    """A rifle given in the body frame (T.Rifle origin/axis at rest) carried by that body."""
    o, a = rest['origin'], rest['axis']
    ax, ay = _Rot(a[0], a[1], psi)
    return T.Rifle(BodyPoint(pel, psi, o[0], o[1], o[2] + dz), Unit((ax, ay, a[2])))


def BlendRifle(T, a, b, w):
    return T.Rifle(Lerp3(a['origin'], b['origin'], w), Unit(Lerp3(a['axis'], b['axis'], w)))


def Ramp(t, t0, t1):
    return Smooth((t - t0) / max(1e-6, t1 - t0))


def Window(t, a0, a1, b0, b1):
    """0 before a0, up to 1 by a1, 1 until b0, down to 0 by b1."""
    return Ramp(t, a0, a1) * (1 - Ramp(t, b0, b1))


def Swing(points, lift=.07):
    """Ankle keys from [(t, (x, y, z), planted)]: a step between two planted keys arcs `lift` over the ground."""
    rows = []
    for i, (t, p, planted) in enumerate(points):
        if i and planted and points[i - 1][2] and p != points[i - 1][1]:
            t0, p0 = points[i - 1][0], points[i - 1][1]
            rows.append(((t0 + t) / 2, ((p0[0] + p[0]) / 2, (p0[1] + p[1]) / 2, max(p0[2], p[2]) + lift)))
        rows.append((t, p))
    return rows


def VaultFeetPlants(rows):
    """Plant windows from Swing input rows [(t, p, planted)]: between consecutive planted keys at the same point."""
    out = []
    for (t0, p0, a), (t1, p1, b) in zip(rows, rows[1:]):
        if a and b and p0 == p1 and t1 - t0 > .02:
            out.append((t0, t1))
    return out


def PlantedFeet(f, t, turn, plants):
    """A foot planted while the body turns keeps the heading it landed with: the rest foot follows the frame's yaw
    (OrientFoot), so the yaw it gained since the plant began is taken back off (else the toe swings round a
    planted heel: 5-12 cm of slide in the first bake)."""
    for s in LR:
        for a, b in plants[s]:
            if a <= t <= b:
                p, y, r = f.get('foot.' + s) or (0, 0, 0)
                f['foot.' + s] = (p, y + math.degrees(turn(a) - turn(t)), r)
                break
    return f


def TimberPalm(across):
    """A palm flat on the timber's top, fingers pointing `across` it (source axes)."""
    return Grab((0, 0, 1), across, .75)


def VaultPoles(T, pel, psi, tuck):
    """Knee poles in front of the body; tucked (1) they rise to chest height and close in (the knees drawn up
    together, not splayed) for the legs coming over the timber."""
    out = {}
    for s, sign in (('L', 1), ('R', -1)):
        out[s] = BodyPoint(pel, psi, sign * (T.H + .20 - .16 * tuck), -(.95 + .15 * tuck), .45 + .75 * tuck)
    return out


def SlungHang(T, hang):
    """SlungRifle(T, 'side') whose muzzle swings back toward the vertical as he bends (hang 0..1): slung on the
    right shoulder a bent-over man's rifle hangs from it, it does not stick out ahead of his face."""
    rifle, up = SlungRifle(T, 'side')
    if hang <= 1e-4:
        return rifle, up
    axis = Unit(Lerp3(rifle['axis'], (0, 0, 1), hang))
    top = Vector(rifle['origin']) + Vector(rifle['axis']) * T.R(.55)     # the sling's shoulder end stays put
    return T.Rifle(tuple(top - Vector(axis) * T.R(.55)), axis), up


def SlungHangProps(T, hang):
    def Props(t):
        rifle, up = SlungHang(T, hang(t))
        return {'weapon': (rifle['origin'], rifle['axis'], up, True)}

    def Review(t):
        return T.RifleProps(SlungHang(T, hang(t))[0])
    return Props, Review


HAUL_STAND_BACK = .30               # where he stands before he goes down: 0.3 m behind the wrist (not on the hand)


def HaulStart(T):
    """IjaHaulForearmUnder frame 0 (and IjaVaultTimberOut's last frame, carried into the snag frame): standing
    HAUL_STAND_BACK behind Shunzi's wrist (0.5 m off the timber's east face) facing him, rifle slung on the right,
    both hands hanging, the eyes on his."""
    f = IjaABase(T)
    f.update({'bend': .18, 'head': (.12, 0, 0), 'lookW': 1.0, 'turn': 0.0,
              'handRel.L': (.08, -.14, -.44), 'handRel.R': (-.08, -.12, -.46)})
    back = T.R(HAUL_STAND_BACK)
    for key, v in list(f.items()):
        if v is not None and (key == 'pelvis' or key.startswith(POSITION_CHANNELS)):
            f[key] = (v[0], v[1] + back, v[2])
    f['look'] = RootPoint(T, *HAUL_EYE)
    return f


def PlacedPose(f, origin, psi):
    """A flat pose authored in its own root carried into another root: positions rotated by psi about that root and
    moved to `origin` (source x, y), the body turned psi (IjaVaultTimberOut's last frame = HaulStart at the haul root)."""
    g = dict(f)
    for key, v in f.items():
        if v is None or not (key == 'pelvis' or key.startswith(POSITION_CHANNELS) or key == 'look'):
            continue
        x, y = _Rot(v[0], v[1], psi)
        g[key] = (x + origin[0], y + origin[1], v[2])
    g['turn'] = psi
    return g


Meta('IjaVaultTimberIn', VIN_T, False, 'track', role='ijaA', rig='TengxianIja02', props=['weapon'], rootMotion=True,
     weaponState='twoHand->highLeft->twoHand',
     obstacle={'kind': 'roofTimberDown', 'nearM': VAULT_IN_NEAR, 'farM': VAULT_IN_FAR, 'topM': VAULT_TOP},
     contacts=[{'t': .40, 'limb': 'handR', 'action': 'plant', 'target': 'timber'},
               {'t': .72, 'limb': 'handR', 'action': 'release', 'target': 'timber'}],
     events=[{'t': .54, 'kind': 'takeoff'}, {'t': .96, 'kind': 'land'}],
     prev=['IjaBayonetGuard'], next=['BayonetClearWood'],
     notes='Found (2026-09-27): comes up to the fallen roof timber (hip high, 0.47 m ahead), turns side-on to it (facing '
           'south), lets the wrist of the stock go and puts the right palm on its top, the rifle up in the left fist; '
           'loads, hops and swings both legs over drawn up under him, the hips 0.25 m over the top and the head leaned '
           'out over the landing side, lands in the pit south-west of Shunzi\'s eye (0.35 m off it), takes the rifle in '
           'both hands again and steps round to the snag root facing west (the clip ends standing on it: root motion). '
           'Frames 0.55-0.92 s are off the ground (bake spec groundWeight 0).')
Meta('IjaVaultTimberOut', VOUT_T, False, 'track', role='ijaA', rig='TengxianIja02', props=['weapon'], rootMotion=True,
     weaponState='slungRight', player=True,
     obstacle={'kind': 'roofTimberDown', 'nearM': VAULT_OUT_NEAR, 'farM': VAULT_OUT_FAR, 'topM': VAULT_TOP, 'laneM': VAULT_OUT_LANE},
     contacts=[{'t': 0.0, 'limb': 'handL', 'action': 'hold', 'partnerRole': 'shunzi', 'part': 'collarBack'},
               {'t': .04, 'limb': 'handL', 'action': 'release'},   # the fist opens at once (the arm eases off over 0.45 s)
               {'t': .92, 'limb': 'handL', 'action': 'plant', 'target': 'timber'},
               {'t': 1.18, 'limb': 'handL', 'action': 'release', 'target': 'timber'}],
     events=[{'t': 1.00, 'kind': 'takeoff'}, {'t': 1.36, 'kind': 'land'}],
     prev=['IjaKickBeam'], next=['IjaHaulForearmUnder'],
     notes='DragOut (2026-09-27): frame 0 = IjaKickBeam\'s last frame (same root, the left fist in the collar). Lets go, '
           'rises and turns left to face south, walks to the lane at the south end of the timber, the left palm on its '
           'top (the rifle slung on the right), vaults it the other way (0.98-1.36 s off the ground), lands outside and turns '
           'right to face Shunzi (west-north-west): the last frame is IjaHaulForearmUnder frame 0 at that clip\'s root '
           '(VAULT_OUT_END in this root).')
Meta('IjaHaulForearmUnder', HAUL_T, False, 'track', role='ijaA', rig='TengxianIja02', props=['weapon'], rootMotion=True,
     weaponState='slungRight', player=True,
     contacts=[{'t': HAUL_GRAB_T, 'limb': 'handR', 'action': 'grab', 'partnerRole': 'shunzi', 'part': 'forearmL'},
               {'t': 2.54, 'limb': 'handR', 'action': 'release'}],
     events=[{'t': .50, 'kind': 'yank'}, {'t': .75, 'kind': 'haulStart'}, {'t': 2.50, 'kind': 'haulStop'}],
     prev=['IjaVaultTimberOut'], next=['IjaButtStrikeCollar'],
     notes='DragOut (2026-09-27): at the timber\'s east face goes down on the right knee, the chest low, reaches down with '
           'the right hand to Shunzi\'s left wrist stretched out from under the timber, grabs it (0.375 s), yanks it up '
           'and toward him, comes off the knee and backs off bent low, seven short hauling steps, face on Shunzi, hauling '
           'him out from under the timber 1.8 m straight back (root motion along actor +z) to the trench edge; lets go '
           'at 2.56 s. Rifle slung on the right (hanging as he bends); the left hand swings free. Player track: forearmL '
           '(the grip) and head (his eye, 0.45 m behind the wrist).')


@Builder('IjaVaultTimberIn')
def BuildVaultTimberIn(T, name):
    H, P, A, SX = T.H, T.P, T.A, T.SX
    stand = P - .035
    R = T.R
    Q = lambda d, l: RootPoint(T, d, l)
    near, far = VAULT_IN_NEAR, VAULT_IN_FAR
    mid = (near + far) / 2
    endD, endL = VAULT_IN_END
    S = math.pi / 2                                    # side-on to the timber: facing south, turned left a quarter
    turn = Channel([(0.0, 0.0), (.06, 0.0), (.34, S), (1.14, S), (1.44, S * .40), (1.66, 0.0), (VIN_T, 0.0)])
    # pelvis ground point (d, l) and its height over standing (runtime m): up over the timber (top 0.80, the hips'
    # standing height 0.785), 0.25 over it at the top of the hop; the legs come over in front of him (south), and he
    # lands south-west of Shunzi's eye, clear of it, then steps round to the snag root
    pelKeys = [(0.0, (0.0, 0.0, 0.0)), (.18, (.12, -.01, -.02)), (.34, (.23, .02, -.06)), (.46, (.27, .02, -.13)),
               (.54, (.31, .02, .02)), (.62, (.43, .04, .24)), (.70, (.55, .06, .27)), (.78, (.68, .09, .28)),
               (.86, (.82, .12, .16)), (.95, (.93, .16, -.10)), (1.08, (.95, .14, -.08)), (1.40, (.93, -.12, -.03)),
               (1.64, (.92, -.36, -.02)), (1.80, (endD, endL, -.01)), (VIN_T, (endD, endL, -.01))]
    pelCh = Channel(pelKeys)

    def Pel(t):
        d, l, dz = pelCh(t)
        x, y = Q(d, l)
        return (x, y, stand + R(dz))
    # feet (runtime d, l; planted on the ground, or in the air at h): side-on the RIGHT foot is the timber side; in the
    # air both are drawn up under the hips, the soles over the top (0.80) while they are over the timber (d .47-.77)
    G = lambda d, l: (Q(d, l)[0], Q(d, l)[1], A)
    U = lambda d, l, h: (Q(d, l)[0], Q(d, l)[1], R(h))
    # (2026-09-28: the feet 1-8 cm lower over the top of the hop than they were -- at 0.97-1.00 the heels were at the
    # hips, the knees folded 165 deg and the thighs and calves spun round them; they still clear the top by 5 cm)
    footR = [(0.0, G(.06, -.10), True), (.14, G(.06, -.10), True), (.34, G(.31, .02), True), (.53, G(.31, .02), True),
             (.62, U(.42, .12, .70), False), (.70, U(.54, .14, .98), False), (.78, U(.70, .13, .92), False),
             (.86, U(.88, .12, .76), False), (.92, U(1.00, .16, .30), False), (.96, G(1.00, .20), True), (1.26, G(1.00, .20), True),
             (1.46, G(.98, -.28), True), (1.58, G(.98, -.28), True), (1.76, G(.97, -.58), True), (VIN_T, G(.97, -.58), True)]
    footL = [(0.0, G(-.02, .09), True), (.04, G(-.02, .09), True), (.22, G(.16, -.07), True), (.49, G(.16, -.07), True),
             (.62, U(.34, .08, .66), False), (.70, U(.46, .10, .92), False), (.78, U(.62, .10, .92), False),
             (.86, U(.84, .10, .90), False), (.94, U(.88, .12, .40), False), (1.00, G(.88, .14), True), (1.10, G(.88, .14), True),
             (1.30, G(.87, -.14), True), (1.50, G(.87, -.14), True), (1.66, G(.89, -.39), True), (VIN_T, G(.89, -.39), True)]
    ankles = {'L': Channel(Swing(footL)), 'R': Channel(Swing(footR))}
    plantWin = {'L': VaultFeetPlants(footL), 'R': VaultFeetPlants(footR)}
    plants = [(s, a, b) for s in LR for a, b in plantWin[s]]
    # the body: loads, the chest over the timber, leans far out over the landing side (his right) in the air
    base = IjaABase(T)
    body = Tracks(base, {
        'bend': [(0.0, .10), (.34, .18), (.46, .42), (.62, .45), (.78, .40), (.95, .45), (1.10, .25), (1.40, .12), (VIN_T, .10)],
        'lean': [(0.0, 0.0), (.46, -.12), (.62, -.55), (.74, -.85), (.86, -.60), (.98, -.12), (1.12, 0.0)],
        'pelvisTilt': [(0.0, (.05, 0, 0)), (.46, (.28, -.05, 0)), (.70, (.18, -.30, 0)), (.86, (.15, -.15, 0)), (.98, (.30, 0, 0)),
                       (1.20, (.08, 0, 0)), (VIN_T, (.05, 0, 0))],
        'twist': [(0.0, 0.0), (.46, .10), (.72, .22), (.95, .08), (1.20, 0.0)],
        'head': [(0.0, (.10, 0, 0)), (.34, (.28, 0, -.10)), (.60, (.10, 0, -.20)), (.95, (.05, 0, 0)), (VIN_T, (.05, 0, 0))],
        'shrug': [(0.0, 0.0), (.46, .10), (.78, .18), (.95, .04), (1.20, 0.0)],
        'lookW': [(0.0, 0.0), (.66, 0.0), (.98, .95), (1.40, .80), (VIN_T, .70)],
        # in the air the toes are pulled up (a pointed toe hung 5 cm into the timber's top)
        'foot.R': [(0.0, (0, -14, 0)), (.53, (0, -14, 0)), (.70, (-18, 0, 0)), (.86, (-8, 0, 0)), (.96, (0, -14, 0))],
        'foot.L': [(0.0, (0, 8, 0)), (.49, (0, 8, 0)), (.70, (-18, 0, 0)), (.86, (-8, 0, 0)), (1.00, (0, 8, 0))],
    }, lag={'head': .05})
    tuck = lambda t: Window(t, .50, .62, .86, .96)
    carry = lambda t: Window(t, .06, .34, 1.02, 1.30)      # 1 = the rifle up in the left fist alone (from .12-.30, 2026-09-28)
    low = LowReady(T)
    lifted = Unit((.08, -.20, .98))
    fist = Vector((SX + .10, -.16, P + .20))       # (2026-09-28: -.04/.24 folded the left arm flat under the shoulder)
    high = T.Rifle(tuple(fist - Vector(lifted) * T.R(WEAPONS[T.gun]['gripL'])), lifted)   # the left fist on the handguard
    hand = RootPoint(T, mid + .04, -.03, VAULT_TOP + .015)  # right palm on the top, just behind his right hip
    palmF, palmN, _ = TimberPalm((0, -1, 0))
    wood = lambda t: Window(t, .26, .40, .60, .72)          # pushes off as the hips go over the top
    gun = lambda t: 1 - Window(t, .18, .30, 1.10, 1.30)

    def RifleAt(t):
        pel, psi = Pel(t), turn(t)
        return BodyRifle(T, pel, psi, BlendRifle(T, low, high, carry(t)), pel[2] - stand)

    def Pose(t):
        f = body(t)
        pel, psi = Pel(t), turn(t)
        f['pelvis'] = pel
        f['ankle.L'], f['ankle.R'] = ankles['L'](t), ankles['R'](t)
        PlantedFeet(f, t, turn, plantWin)
        poles = VaultPoles(T, pel, psi, tuck(t))
        f['legPole.L'], f['legPole.R'] = poles['L'], poles['R']
        f['look'] = RootPoint(T, *VAULT_IN_EYE)
        rifle = RifleAt(t)
        palms = T.Palms(rifle['axis'])
        f['grip.L'] = rifle['gripL']
        f['palmF.L'], f['palmN.L'], f['curl.L'] = palms['L'][0], palms['L'][1], .9
        f['armPole.L'] = BodyPoint(pel, psi, SX + .45, .25, P + .10)
        f['handRel.L'] = None
        w, g = wood(t), gun(t)
        if w > 0:
            f['grip.R'], f['gripW.R'] = hand, w
            f['palmF.R'], f['palmN.R'], f['curl.R'] = palmF, palmN, .55
            f['armPole.R'] = BodyPoint(pel, psi, -(SX + .45), .35, P + .05)
        elif g > 0:
            f['grip.R'], f['gripW.R'] = rifle['gripR'], g
            f['palmF.R'], f['palmN.R'], f['curl.R'] = palms['R'][0], palms['R'][1], .95
            f['armPole.R'] = BodyPoint(pel, psi, -(SX + .45), .20, P + .10)
        return T.Nest(Turned(f, psi))

    def Check(t):
        rifle = RifleAt(t)
        return {'L': rifle['gripL'], 'R': hand if wood(t) >= .999 else rifle['gripR'] if gun(t) >= .999 else None}
    timber = [('box', RootPoint(T, mid, 0.0, VAULT_TOP - .14), (T.R(2.0), T.R(far - near), T.R(.28)), 0)]
    spec = {'pose': Pose, 'check': Check, 'plants': plants, 'props': lambda t: {'weapon': T.Track(RifleAt(t))},
            'groundWeight': lambda t: 1 - Window(t, .50, .55, .92, .97),
            'reviewProps': lambda t: T.RifleProps(RifleAt(t)) + timber,
            'reviewFrames': lambda n: [0, int(n * .2), int(n * .28), int(n * .36), int(n * .41), int(n * .46), int(n * .52), int(n * .75), n - 1]}
    spec = AReview(spec)
    spec['reviewViews'] = [('side', (-3.4, -.9, 1.1), (0, -.6, .75)), ('q', (-2.2, 1.4, 1.9), (0, -.6, .7)),
                           ('front', (0, -3.6, 1.0), (0, -.6, .75))]
    return spec


@Builder('IjaVaultTimberOut')
def BuildVaultTimberOut(T, name):
    H, P, A, SX = T.H, T.P, T.A, T.SX
    stand = P - .035
    R = T.R
    Q = lambda d, l: RootPoint(T, d, l)
    kick = KickBeamParts(T)
    k0 = kick['body'](KICK_T)
    near, far, lane = VAULT_OUT_NEAR, VAULT_OUT_FAR, VAULT_OUT_LANE
    mid = (near + far) / 2
    endD, endL, endPsi = VAULT_OUT_END
    last = PlacedPose(HaulStart(T), Q(endD, endL), endPsi)
    S = math.pi / 2                                    # side-on to the timber the other way: facing south, turned left
    turn = Channel([(0.0, 0.0), (.14, 0.0), (.50, S * .75), (.72, S), (1.40, S), (1.60, S * .35), (1.80, endPsi), (VOUT_T, endPsi)])
    p0, pe = k0['pelvis'], last['pelvis']
    toSrc = lambda d, l, dz: (Q(d, l)[0], Q(d, l)[1], stand + R(dz))
    # against (not in) the timber's west face (d -.144), then 0.25 m over its top in the hop
    pelKeys = [(0.0, p0), (.12, p0), (.46, toSrc(.02, .30, -.03)), (.72, toSrc(.03, lane - .06, -.05)), (.86, toSrc(.03, lane - .06, -.12)),
               (.96, toSrc(-.04, lane - .05, -.04)), (1.02, toSrc(-.12, lane - .05, .14)), (1.08, toSrc(-.22, lane - .05, .25)),
               (1.16, toSrc(-.34, lane - .05, .28)), (1.24, toSrc(-.47, lane - .05, .24)), (1.32, toSrc(-.60, lane - .06, .06)),
               (1.40, toSrc(-.68, lane - .07, -.10)), (1.56, toSrc(-.68, lane - .12, -.05)), (1.80, pe), (VOUT_T, pe)]
    pelCh = Channel(pelKeys)
    G = lambda d, l: (Q(d, l)[0], Q(d, l)[1], A)
    U = lambda d, l, h: (Q(d, l)[0], Q(d, l)[1], R(h))
    kl, kr = k0['ankle.L'], k0['ankle.R']
    # side-on facing south the LEFT foot is the timber (east) side; drawn up under the hips over the top
    footL = [(0.0, kl, True), (.30, kl, True), (.52, G(-.02, .42), True), (.60, G(-.02, .42), True), (.76, G(-.06, lane - .02), True),
             (.98, G(-.06, lane - .02), True), (1.04, U(-.09, lane + .06, .64), False), (1.08, U(-.17, lane + .10, .92), False),
             (1.14, U(-.30, lane + .12, .92), False),
             (1.22, U(-.46, lane + .11, .90), False), (1.30, U(-.62, lane + .08, .60), False), (1.36, G(-.76, lane + .02), True),
             (1.50, G(-.76, lane + .02), True), (1.74, last['ankle.L'], True), (VOUT_T, last['ankle.L'], True)]
    footR = [(0.0, kr, True), (.14, kr, True), (.36, G(.08, .18), True), (.56, G(.08, .18), True), (.72, G(.07, lane - .12), True),
             (.96, G(.07, lane - .12), True), (1.06, U(-.04, lane + .08, .70), False), (1.14, U(-.18, lane + .10, .94), False),
             (1.22, U(-.36, lane + .10, .96), False), (1.30, U(-.52, lane + .07, .70), False), (1.40, G(-.62, lane + .08), True),
             (1.60, G(-.62, lane + .08), True), (1.84, last['ankle.R'], True), (VOUT_T, last['ankle.R'], True)]
    ankles = {'L': Channel(Swing(footL)), 'R': Channel(Swing(footR))}
    plantWin = {'L': VaultFeetPlants(footL), 'R': VaultFeetPlants(footR)}
    plants = [(s, a, b) for s in LR for a, b in plantWin[s]]

    def Key(name, rows):
        return [(0.0, k0[name])] + rows + [(VOUT_T, last[name])]
    body = Tracks(k0, {
        'bend': Key('bend', [(.14, k0['bend']), (.50, .22), (.80, .30), (.90, .42), (1.10, .45), (1.30, .40), (1.42, .45), (1.70, .22)]),
        'lean': Key('lean', [(.80, 0.0), (.92, .12), (1.06, .55), (1.18, .85), (1.30, .55), (1.42, .10), (1.62, 0.0)]),
        'pelvisTilt': Key('pelvisTilt', [(.14, k0['pelvisTilt']), (.50, (.08, 0, 0)), (.90, (.26, .05, 0)), (1.14, (.16, .30, 0)),
                                         (1.30, (.14, .15, 0)), (1.42, (.30, 0, 0)), (1.70, (.08, 0, 0))]),
        'twist': Key('twist', [(.30, 0.0), (.92, -.10), (1.14, -.20), (1.40, -.06), (1.66, 0.0)]),
        'head': Key('head', [(.14, k0['head']), (.50, (.10, 0, 0)), (.90, (.30, 0, .15)), (1.14, (.10, 0, .20)), (1.42, (.10, 0, 0))]),
        'shrug': [(0.0, 0.0), (.90, .10), (1.14, .18), (1.42, .04), (1.70, 0.0), (VOUT_T, 0.0)],
        'lookW': [(0.0, 0.0), (1.40, 0.0), (1.80, 1.0), (VOUT_T, 1.0)],
        'foot.L': [(0.0, k0.get('foot.L') or (0, 8, 0)), (.98, (0, 8, 0)), (1.14, (-18, 0, 0)), (1.30, (-8, 0, 0)), (1.36, (0, 8, 0)),
                   (VOUT_T, last['foot.L'])],
        'foot.R': [(0.0, k0['foot.R']), (.20, (0, -14, 0)), (.96, (0, -14, 0)), (1.14, (-18, 0, 0)), (1.30, (-8, 0, 0)), (1.40, (0, -14, 0)),
                   (VOUT_T, last['foot.R'])],
    }, lag={'head': .05})
    tuck = lambda t: Window(t, .98, 1.08, 1.28, 1.38)
    # one hand, as over the way in: the left palm (his timber side) on the far half, just behind his left hip
    hands = {'L': RootPoint(T, -(mid + .06), lane - .12, VAULT_TOP + .015)}
    palmF, palmN, _ = TimberPalm((0, 1, 0))           # fingers across the top toward its far (east) side
    woods = {'L': lambda t: Window(t, .72, .92, 1.08, 1.18), 'R': lambda t: 0.0}   # (.80 until 2026-09-28: 0.12 s from the hip)
    wood = woods['L']
    kickPoles = kick['poles']
    hang = lambda t: .55 * Window(t, .80, 1.00, 1.30, 1.50)

    def Pose(t):
        f = body(t)
        pel, psi = pelCh(t), turn(t)
        f['pelvis'] = pel
        f['ankle.L'], f['ankle.R'] = ankles['L'](t), ankles['R'](t)
        PlantedFeet(f, t, turn, plantWin)
        stood = Ramp(t, .12, .46)
        poles = VaultPoles(T, pel, psi, tuck(t))
        for s in LR:
            # from IjaKickBeam's knee poles to the vault's, and onto HaulStart's (placed) at the hand-over
            f['legPole.' + s] = Lerp3(Lerp3(kickPoles[s], poles[s], stood), last['legPole.' + s], Ramp(t, 1.62, 1.84))
        f['look'] = kick['eye'] if t < .60 else last['look']
        f['lookW'] = f['lookW'] if t >= .60 else 0.0
        for s in LR:
            w = woods[s](t)
            f['handRel.' + s] = HaulStart(T)['handRel.' + s]
            if w > 0:
                f['grip.' + s], f['gripW.' + s] = hands[s], w
                f['palmF.' + s], f['palmN.' + s], f['curl.' + s] = palmF, palmN, .55
                f['armPole.' + s] = BodyPoint(pel, psi, (SX + .45) * (1 if s == 'L' else -1), .30, P + .05)
        if t < .46:
            # frame 0 = IjaKickBeam's last frame: the fist in the collar, let go over 0.45 s (the reach assist that
            # pulled his hips 0.15 m toward it fades with the grip: a quick release made the hips jump 0.21 m in a frame)
            hold = kick['hold']
            gw = 1.0 - Ramp(t, 0.0, .45)
            f['handRel.L'] = k0['handRel.L']
            if gw > 0:
                palmF0, palmN0, _ = Grab((0, .6, .8), (0, 0, -1))
                f['grip.L'], f['gripW.L'] = tuple(hold), gw
                f['palmF.L'], f['palmN.L'], f['curl.L'] = palmF0, palmN0, 1.1
        return T.Nest(Turned(f, psi))

    def Check(t):
        out = {s: hands[s] for s in hands if woods[s](t) >= .999}
        if t <= 0:
            out['L'] = kick['hold']
        return out
    props, review = SlungHangProps(T, hang)
    timber = [('box', RootPoint(T, -mid, lane, VAULT_TOP - .14), (T.R(2.0), T.R(far - near), T.R(.28)), 0)]
    # IjaKickBeam's reach assist, for frame 0 to be its last frame, only while the fist leaves the collar: on the
    # palms on the timber it pulled the hips toward them and let go with them (0.23 m in a frame at 1.17 s)
    # ... and a short one (the default's) on the palm on the timber
    on = lambda t: KICK_REACH['fraction'] if t < .46 else REACH_ASSIST_DEFAULT if .80 <= t <= 1.20 else 5.0
    reach = dict(KICK_REACH, fraction=on, fractionBySide={'L': on, 'R': lambda t: 5.0},
                 travel=lambda t: KICK_REACH['travel'] if t < .46 else .08)
    spec = {'pose': Pose, 'check': Check, 'plants': plants, 'props': props, 'reach': reach,
            'groundWeight': lambda t: 1 - Window(t, .96, 1.01, 1.34, 1.39),
            'player': lambda t: {'collar': kick['hold']},
            'reviewProps': lambda t: review(t) + timber + PlayerGhost(T, kick['hold']),
            'reviewFrames': lambda n: [0, int(n * .2), int(n * .38), int(n * .5), int(n * .54), int(n * .58), int(n * .62), int(n * .72), n - 1]}
    spec = AReview(spec)
    spec['reviewViews'] = [('side', (3.4, .6, 1.2), (0, .5, .75)), ('q', (-2.4, 2.8, 2.0), (0, .5, .7)),
                           ('back', (-.6, -3.2, 1.1), (0, .4, .75))]
    return spec


def HaulPaths():
    """Shunzi's left wrist and eye in IjaHaulForearmUnder's root (runtime d, l, h): the wrist waits out past the
    timber's east face, is yanked 0.22 m and lifted (his arm pulled up by the fist), then hauled back a pull per step;
    the eye trails 0.45 m behind it (the arm straight), the head hanging, bumping over the mud."""
    yank = .22
    steps = 7
    t0, t1 = .75, 2.50
    per = (HAUL_TRAVEL - yank) / steps

    def Travel(t):
        if t <= .50:
            return 0.0
        if t <= t0:
            return yank * Smooth((t - .50) / (t0 - .50))
        if t >= t1:
            return HAUL_TRAVEL
        u = (t - t0) / (t1 - t0) * steps
        k = min(steps - 1, int(u))
        return yank + per * (k + Smooth(u - k))       # a pull per step: the body lurches, then rests
    wx, wl, wh = HAUL_WRIST
    ex, el, eh = HAUL_EYE

    def Wrist(t):
        return (wx - Travel(t), wl, wh + .26 * Window(t, .50, .80, 2.54, 2.72))

    def Eye(t):
        u = (t - t0) / (t1 - t0) * steps
        bob = .025 * math.sin(math.pi * (u % 1.0)) if t0 < t < t1 else 0.0
        return (ex - Travel(t), el, eh - .03 * Window(t, .50, .80, 2.40, 2.70) + bob)
    return Travel, Wrist, Eye


@Builder('IjaHaulForearmUnder')
def BuildHaulForearmUnder(T, name):
    H, P, A, SX = T.H, T.P, T.A, T.SX
    stand = P - .035
    R = T.R
    Q = lambda d, l: RootPoint(T, d, l)
    start = HaulStart(T)
    Travel, Wrist, Eye = HaulPaths()
    W = lambda t: RootPoint(T, *Wrist(t))
    E = lambda t: RootPoint(T, *Eye(t))
    s0 = start['pelvis']
    G = lambda d, l: (Q(d, l)[0], Q(d, l)[1], A)
    # the pelvis ground point rides `off` behind the wrist: down on the right knee 0.45 m back for the grab (the chest
    # low, the arm straight down to the wrist), then 0.40 m behind it for the haul (the arm bent, the fist at his knee)
    off = Channel([(0.0, -HAUL_STAND_BACK), (.30, -.45), (.50, -.45), (.75, -.40), (HAUL_T, -.40)])
    PelD = lambda t: HAUL_WRIST[0] - Travel(t) + off(t)
    low = Channel([(0.0, 0.0), (.14, -.16), (.30, -.34), (.50, -.34), (.66, -.26), (.80, -.23), (2.50, -.23), (2.64, -.12), (HAUL_T, -.08)])
    steps, t0, t1 = 7, .75, 2.50

    def Pel(t):
        u = (t - t0) / (t1 - t0) * steps
        bob = -.012 * math.sin(math.pi * (u % 1.0)) if t0 < t < t1 else 0.0
        return (s0[0], s0[1] + R(-(PelD(t) - PelD(0.0))), stand + R(low(t) + bob))
    # the right foot back and its knee down for the grab (the shin on the ground, toes tucked), the left foot forward;
    # off the knee on the yank, then seven backward steps, alternating
    footL = [(0.0, start['ankle.L'], True), (.08, start['ankle.L'], True), (.26, G(-.18, .14), True)]
    kneel = (Q(-.86, -.12)[0], Q(-.86, -.12)[1], R(.10))
    footR = [(0.0, start['ankle.R'], True), (.06, start['ankle.R'], True), (.28, kneel, True), (.52, kneel, True),
             (.70, G(-.84, -.12), True)]
    at = {'L': (-.18, .14), 'R': (-.84, -.12)}
    rows = {'L': list(footL), 'R': list(footR)}
    for i in range(steps):
        side = 'L' if i % 2 == 0 else 'R'
        ta = t0 + .25 * i
        tb = ta + .23
        rows[side].append((ta, G(*at[side]), True))
        d1 = PelD(min(t1, tb + .02)) + (.14 if side == 'L' else -.12)     # PelD is from the root, as G is
        at[side] = (d1, at[side][1])
        rows[side].append((tb, G(*at[side]), True))
    for side in LR:
        rows[side].append((HAUL_T, G(*at[side]), True))
    ankles = {s: Channel(Swing(rows[s], lift=.06)) for s in LR}
    plants = [(s, a, b) for s in LR for a, b in VaultFeetPlants(rows[s])]
    body = Tracks(start, {
        'bend': [(0.0, start['bend']), (.30, 1.20), (.50, 1.20), (.70, .92), (.85, .85), (2.50, .85), (2.70, .42), (HAUL_T, .35)],
        'pelvisTilt': [(0.0, start['pelvisTilt']), (.30, (.45, 0, 0)), (.50, (.45, 0, 0)), (.75, (.34, 0, 0)), (2.50, (.34, 0, 0)),
                       (HAUL_T, (.12, 0, 0))],
        'twist': [(0.0, 0.0), (.30, .14), (.50, .14), (.80, .06), (2.50, .06), (HAUL_T, 0.0)],
        'shrug': [(0.0, 0.0), (.30, .16), (2.50, .10), (HAUL_T, 0.0)],
        'lookW': [(0.0, 1.0), (HAUL_T, 1.0)],
        'foot.R': [(0.0, start['foot.R']), (.08, start['foot.R']), (.28, (-60, -8, 0)), (.52, (-60, -8, 0)), (.70, (0, -10, 0))],
        'legPole.R': [(0.0, start['legPole.R']), (.10, start['legPole.R']), (.28, (-(H + .16), -1.3, -.20)), (.52, (-(H + .16), -1.3, -.20)),
                      (.72, start['legPole.R'])],
    }, lag={'head': .05})
    hang = lambda t: .6 * Window(t, .10, .30, 2.50, 2.75)

    def Pose(t):
        f = body(t)
        f['pelvis'] = Pel(t)
        f['ankle.L'], f['ankle.R'] = ankles['L'](t), ankles['R'](t)
        f['look'] = E(t)
        f['handRel.L'] = start['handRel.L'] if t < .20 else (.18, -.24, -.30)
        gw = Window(t, .14, HAUL_GRAB_T, 2.40, 2.54)
        if gw > 0:
            palmF, palmN, _ = Grab((0, 0, 1), (0, -1, 0))
            f['grip.R'], f['gripW.R'] = W(t), gw
            f['palmF.R'], f['palmN.R'], f['curl.R'] = palmF, palmN, 1.0
            f['armPole.R'] = BodyPoint(f['pelvis'], 0.0, -(SX + .40), .10, P - .10)
        return T.Nest(f)

    def Check(t):
        return {'R': W(t) if HAUL_GRAB_T <= t <= 2.40 else None}
    props, review = SlungHangProps(T, hang)
    face = .2167                                                     # the timber's east face ahead of this root (l 0)
    timber = [('box', RootPoint(T, face + .15, 0.0, VAULT_TOP - .14), (T.R(2.0), T.R(.30), T.R(.28)), 0)]
    spec = {'pose': Pose, 'check': Check, 'plants': plants, 'props': props,
            'kneePlants': [('R', .30, .50)],
            # on the knee the solved kneecap sits a few cm into the mud: grounding it lifted the whole body 6 cm and the
            # planted left foot with it (7.6 cm of slide, and the fist 5 cm short of the wrist), so the kneel is not grounded
            'groundWeight': lambda t: 1 - Window(t, .12, .22, .58, .70),
            'reach': {'fraction': .86, 'sides': 'R', 'travel': .12, 'bend': .30},
            'player': lambda t: {'forearmL': W(t), 'head': E(t)},
            'look': E,
            'reviewProps': lambda t: review(t) + timber + [('point', W(t), None, .03), ('point', E(t), None, .05)],
            'reviewFrames': lambda n: [0, int(n * .1), int(n * .14), int(n * .2), int(n * .3), int(n * .5), int(n * .75), n - 1]}
    spec = AReview(spec)
    spec['reviewViews'] = [('side', (-3.6, .2, 1.1), (0, .4, .6)), ('q', (-2.4, -2.6, 1.9), (0, .3, .6)),
                           ('front', (0, -3.4, .9), (0, .3, .55))]
    return spec


# =================================================================================
# 2026-09-27 pinned rescue (docs/Data_OpeningPinnedRescue20260927.md; user: 「一割马上就嚣张的说了那些台词；然后边说边走，
# 看到了被木头压住的主角……日军也不再拖出主角，直接在原地审问，把从枪托改成扇巴掌」). After the cut ijaA walks off west
# toward the mouth jeering back at the dying man (IjaTauntWalk, upper body over the native walk), stops dead over the
# pinned Shunzi and sheathes the bayonet (IjaFoundLook), squats at his head and lifts it by the hair (IjaCrouchHairHold)
# and slaps him (IjaSlapForehand / IjaSlapBackhand; IjaSlapRaise is the third, cut off by the charge). In 02 He heaves
# the timber off Shunzi's hips (HeLiftTimber) while Luo hauls him out (LuoDragToCover). Shunzi is the first-person
# player: the crouch clips carry his lifted eye (`player` head).
# =================================================================================
# Durations and loop windows are whole baked frames (a window edge between two frames is interpolated, not a seam).
TAUNT_WALK_T = 57 / 24             # 2.375 s
FOUND_T = 54 / 24                  # 2.25 s
FOUND_HOLD = (39 / 24, FOUND_T)    # 1.625-2.25 s
CROUCH_HOLD = (18 / 24, 18 / 24 + 3.0)   # 0.75-3.75 s (the lift is up at 0.70: rescue.holdShot; whole 1/12 s for the player track)
CROUCH_T = CROUCH_HOLD[1]
# 2026-09-29 (user: 「看不出来是扇巴掌的动作」): the hand goes up high over his shoulder -- against the sky from the pinned
# eye, a silhouette -- hangs there cocked for a beat and cracks down across the face; the blow at 0.58 s, back by 1.3 s.
SLAP_T = 36 / 24                   # 1.5 s
SLAP_HIT = 14 / 24                 # the palm on the cheek on a baked frame (0.583 s; the manifest contact says .58)
RAISE_HOLD = (10 / 24, 10 / 24 + 2.0)
RAISE_T = RAISE_HOLD[1]
LIFT_HOLD = (24 / 24, 36 / 24)     # 1.0-1.5 s
LIFT_T = 58 / 24                   # 2.417 s
LIFT_RELEASE = LIFT_HOLD[1]

Meta('IjaTauntWalk', TAUNT_WALK_T, True, 'track', role='ijaA', rig='TengxianIja02', props=['weapon'],
     rootMotion=False, upperBody=True, weaponState='slungBack',
     events=[{'t': .55, 'kind': 'jab'}, {'t': 1.25, 'kind': 'lookAhead'}],
     prev=['IjaReleaseSheathe'], next=['IjaFoundLook'],
     notes='2026-09-27: upper body over the native walk (the director walks him west to ija.found at 0.75 m/s, seconds = '
           'time since he set off; loops): head and shoulders turned back over his RIGHT shoulder at the dying man behind '
           'him (from the walk the comrade is behind his right shoulder, north-east of the trench floor he walks along), '
           'one contemptuous flick of the open right hand back at him per loop with a swaggering shrug, the left thumb in '
           'the belt; a glance ahead (1.1-1.7 s) where the pinned man lies. 2026-09-29: empty-handed, the bayonet already '
           'sheathed (IjaReleaseSheathe; the runtime shows it on its scabbard mount).')
Meta('IjaFoundLook', FOUND_T, False, 'track', role='ijaA', rig='TengxianIja02', props=['weapon'], rootMotion=False,
     weaponState='slungBack', holdLoop=list(FOUND_HOLD),
     events=[{'t': .10, 'kind': 'stop'}],
     prev=['IjaTauntWalk'], next=['IjaCrouchHairHold'],
     notes='2026-09-27 ShunziFound: on ija.found facing west, the pinned man\'s eye 1.13 m ahead on the ground. He stops dead '
           'out of the walk (the weight onto the front foot, the back foot drawn up), bends a little and looks down into the '
           'man\'s face (the face on the eye: look); 1.6-2.2 s is a seamless hold loop (breathing, looking down at him). '
           '2026-09-29: the hands are free (the bayonet went into its scabbard before the walk, IjaReleaseSheathe).')
Meta('IjaCrouchHairHold', CROUCH_T, False, 'track', role='ijaA', rig='TengxianIja02', props=['weapon'], rootMotion=False,
     weaponState='slungBack', holdLoop=list(CROUCH_HOLD), player=True,
     contacts=[{'t': .25, 'limb': 'handL', 'action': 'grab', 'partnerRole': 'shunzi', 'part': 'crown'},
               {'t': .70, 'limb': 'handL', 'action': 'hold', 'partnerRole': 'shunzi', 'part': 'crown'}],
     events=[{'t': .25, 'kind': 'grabHair'}, {'t': .25, 'kind': 'liftHead', 'untilT': .70}, {'t': 1.40, 'kind': 'shake'},
             {'t': 2.30, 'kind': 'shake'}, {'t': 3.15, 'kind': 'shake'}],
     prev=['IjaFoundLook'], next=['IjaSlapForehand', 'IjaSlapBackhand', 'IjaSlapRaise', 'IjaStartleTurn'],
     notes='2026-09-27 Hold: on ija.crouch facing west over the pinned man\'s head (his eye 0.60 m ahead, 0.28 m up). Frame 0 '
           'is a deep squat, forearms on the knees. 0-0.25 s the LEFT hand reaches out and grabs the hair on his crown; '
           '0.25-0.70 s hauls the head up by it -- the eye rises 0.16 m and tips back (rescue.holdShot liftM / liftS) -- the '
           'fist on the crown all the way. 0.75-3.75 s is a seamless hold loop: leaning in, the face on the eye, three small '
           'angry shakes. The right hand rests on the right knee. Player track: head (the lifted eye), crown (where the fist '
           'closes in the hair).')
Meta('IjaSlapForehand', SLAP_T, False, 'track', role='ijaA', rig='TengxianIja02', props=['weapon'], rootMotion=False,
     weaponState='slungBack', player=True,
     contacts=[{'t': .58, 'limb': 'handR', 'action': 'slap', 'partnerRole': 'shunzi', 'part': 'cheekL'},
               {'t': 0.0, 'limb': 'handL', 'action': 'hold', 'partnerRole': 'shunzi', 'part': 'crown'}],
     events=[{'t': .30, 'kind': 'windUp'}, {'t': .58, 'kind': 'slap', 'side': 1}],
     prev=['IjaCrouchHairHold'], next=['IjaCrouchHairHold'],
     notes='2026-09-29: from the hair hold (frame 0 and the last frame = IjaCrouchHairHold at its hold-loop start, the left '
           'fist in the hair). 0-0.30 s the open right hand goes up high over his right shoulder (1.1 m up: from the pinned '
           'eye it stands against the sky), the trunk wound back to his right, and hangs there cocked to 0.42 s; 0.50-0.58 s '
           'it cracks down, the PALM across the man\'s LEFT cheek (0.58 s: on ijaA\'s right), the shoulder and trunk turning '
           'through; follow-through wide to his left; the head knocked away in his fist and held there a moment; back to '
           'the hold by 1.3 s.')
Meta('IjaSlapBackhand', SLAP_T, False, 'track', role='ijaA', rig='TengxianIja02', props=['weapon'], rootMotion=False,
     weaponState='slungBack', player=True,
     contacts=[{'t': .58, 'limb': 'handR', 'action': 'slap', 'partnerRole': 'shunzi', 'part': 'cheekR'},
               {'t': 0.0, 'limb': 'handL', 'action': 'hold', 'partnerRole': 'shunzi', 'part': 'crown'}],
     events=[{'t': .30, 'kind': 'windUp'}, {'t': .58, 'kind': 'slap', 'side': -1}],
     prev=['IjaCrouchHairHold'], next=['IjaCrouchHairHold'],
     notes='2026-09-29: the mirror of IjaSlapForehand: the right hand goes up in front of his left shoulder (0.30 s, cocked to 0.42 s), '
           'the BACK of the hand lashes down across the man\'s RIGHT cheek left to right (0.58 s), follow-through wide to his '
           'right; back to the hold by 1.3 s.')
Meta('IjaSlapRaise', RAISE_T, False, 'track', role='ijaA', rig='TengxianIja02', props=['weapon'], rootMotion=False,
     weaponState='slungBack', player=True, holdLoop=list(RAISE_HOLD),
     contacts=[{'t': 0.0, 'limb': 'handL', 'action': 'hold', 'partnerRole': 'shunzi', 'part': 'crown'}],
     events=[{'t': .20, 'kind': 'raise'}],
     prev=['IjaCrouchHairHold'], next=['IjaStartleTurn'],
     notes='2026-09-27 「说话！」: from the hair hold the right hand goes up high, open, for a third, bigger slap (0-0.4 s) and '
           'hangs there shaking with rage, the trunk wound to his right, the fist still in the hair (0.4-2.4 s hold loop). The '
           'charge interrupts it: the director plays IjaStartleTurn -> IjaParriedChoppedFall (a pose blend covers the start).')
Meta('HeLiftTimber', LIFT_T, False, 'track', role='heyoutian', rig='TengxianNra02', props=['weapon'], rootMotion=False,
     weapon='Dadao', weaponState='dadaoInBelt', holdLoop=list(LIFT_HOLD),
     holdExit='pose.holdUntil: the loop lets go at that clip time and plays on through the 1.5-2.4 s release (the director '
              'drops the timber) and the straightening',
     contacts=[{'t': .30, 'limb': 'handsLR', 'action': 'grip', 'target': 'roofTimberDown'},
               {'t': LIFT_RELEASE, 'limb': 'handsLR', 'action': 'release', 'target': 'roofTimberDown'}],
     events=[{'t': .30, 'kind': 'effort', 'what': 'strain'}, {'t': .55, 'kind': 'heave'}],
     prev=['HeDadaoParryChop'], next=['HeSwapDadaoRifle'],
     notes='2026-09-27 Lift: on rescue.lift.heLift facing the fallen roof timber (west-north-west), the dadao pushed through '
           'his belt at the left hip. 0-0.3 s he squats and gets both hands under the timber\'s east edge south of Shunzi\'s '
           'hips (z -124.87 / -125.03); 0.3-0.8 s heaves it up on the director\'s lift (rescue.lift raise .55 over raiseS from '
           'gripS: the hands ride the Set\'s PoseRoofTimber path); 1.0-1.5 s a seamless straining hold loop (kept short: after '
           'holdUntil the loop plays out before the release); 1.5-2.4 s he lets go -- the timber drops -- and straightens.')

PROPS.setdefault('roofTimberDown', {'set': 'Data_OpeningSet0103.roofTimberDown',
                                    'notes': 'posed by the Set (OpeningSet.LiftRoofTimber); HeLiftTimber\'s hands ride its lift'})


# The squat's left hand reaches out to the crown at the end of the arm (the pelvis may sink and travel a little toward it).
REACH_BY_CLIP.update({name: {'fraction': .86, 'sides': 'L', 'travel': .12, 'bend': .30}
                      for name in ('IjaCrouchHairHold', 'IjaSlapForehand', 'IjaSlapBackhand', 'IjaSlapRaise')})


# ---- B. IjaTauntWalk ---------------------------------------------------------------------------------------------------
# The dying man from the walk (runtime m, his frame: +X left, +Y back): behind his right shoulder, kneeling (head ~1.0 m).
TAUNT_LOOK_BACK = (-1.0, .95, .95)
TAUNT_LOOK_AHEAD = (0.0, -2.0, .30)       # the pinned man on the ground ahead


@Builder('IjaTauntWalk')
def BuildTauntWalk(T, name):
    """2026-09-29: empty-handed (the bayonet is sheathed before he sets off: IjaReleaseSheathe). The jab back at the dying
    man is a flick of the open right hand, the back of it toward him."""
    D = TAUNT_WALK_T
    base = Standing(T, bend=.06)
    base.update({'lookW': 1.0, 'lookLimit': 80.0, 'look': tuple(Vector(TAUNT_LOOK_BACK) / T.s), 'neck': (0, 0, 0),
                 'handRel.L': (-.02, -.16, -.40), 'poleRel.L': (.50, .25, -.25), 'palmF.L': (-.4, -.2, -.9), 'palmN.L': (-.9, 0, .3),
                 'curl.L': .9, 'handRel.R': (-.08, -.08, -.46), 'poleRel.R': (-.45, .35, -.30), 'protract.R': 0.0,
                 'palmF.R': (0, -.2, -1), 'palmN.R': (1, 0, 0), 'curl.R': .45})
    jab = Channel([(0.0, 0.0), (.40, 0.0), (.55, 1.0), (.66, 1.0), (.85, 0.0), (D, 0.0)])
    ahead = Channel([(0.0, 0.0), (1.05, 0.0), (1.30, 1.0), (1.65, 1.0), (1.95, 0.0), (D, 0.0)])
    shrug = Channel([(0.0, .02), (.45, .02), (.60, .16), (.80, .10), (1.0, .03), (D, .02)])

    def Body(t):
        f = dict(base)
        j, a = jab(t), ahead(t)
        sway = math.sin(Tau * t / (D / 2))                     # two swaggering rolls per loop
        f['look'] = tuple(Vector(Lerp3(TAUNT_LOOK_BACK, TAUNT_LOOK_AHEAD, Smooth(a))) / T.s)
        f['neck'] = (.04 * a, 0, -.42 * (1 - a) + .02 * sway)
        f['shrug'] = shrug(t) + .02 * sway
        f['protract.R'] = -.25 * j
        # the hand low at his right side; in the flick it swings back at him, fingers first, loose
        f['handRel.R'] = Lerp3((-.08, -.08, -.46), (-.14, .26, -.38), j)
        f['poleRel.R'] = Lerp3((-.45, .35, -.30), (-.40, .10, -.10), j)
        f['palmF.R'] = Unit(Lerp3((0, -.2, -1), (-.20, .90, -.40), j))
        f['palmN.R'] = Unit(Lerp3((1, 0, 0), (.10, .35, .93), j))
        f['curl.R'] = Mix(.45, .25, j)
        f['twist'] = -.04 * (1 - a) + .02 * sway
        return f
    props, review = SlungProps(T)
    spec = {'pose': lambda t: T.Nest(Body(t)), 'props': props, 'plants': [('L', 0, D), ('R', 0, D)],
            'look': lambda t: Body(t)['look'] if ahead(t) < 1e-3 or ahead(t) > .999 else None,
            'reviewProps': lambda t: review(t) + KnifeProps(ScabbardKnife(T)),
            'reviewFrames': lambda n: [0, int(n * .23), int(n * .6), n - 1]}
    return AReview(spec)


# ---- C. IjaFoundLook -------------------------------------------------------------------------------------------------
FOUND_EYE = (-.05, -1.13, .28)        # the pinned eye (runtime m, his frame): 1.13 m ahead on the ground


@Builder('IjaFoundLook')
def BuildFoundLook(T, name):
    H, P, A, SX = T.H, T.P, T.A, T.SX
    eye = tuple(Vector(FOUND_EYE) / T.s)
    base = IjaABase(T)
    base.update({'lookW': 1.0, 'lookLimit': 70.0, 'look': eye, 'bend': .10,
                 'handRel.L': (-.02, -.16, -.40), 'poleRel.L': (.50, .25, -.25), 'palmF.L': (-.4, -.2, -.9), 'palmN.L': (-.9, 0, .3),
                 'curl.L': .9})
    # Out of the walk: the left foot has just landed ahead, the right is behind on its toes; the weight goes onto the
    # front foot and the back foot comes up beside it.
    frontL = Add3(base['ankle.L'], (0, -.12, 0))
    backR0 = Add3(base['ankle.R'], (0, .22, .02))
    feet = {'ankle.L': [(0.0, frontL)], 'ankle.R': [(0.0, backR0), (.14, backR0), (.28, Add3(Lerp3(backR0, base['ankle.R'], .5), (0, 0, .05))),
                                                 (.42, Add3(base['ankle.R'], (0, -.04, 0)))],
            'foot.R': [(0.0, (-18, -14, 0)), (.14, (-18, -14, 0)), (.42, base['foot.R'])]}
    pel0 = base['pelvis']
    anim = Tracks(base, dict(feet,
        pelvis=[(0.0, Add3(pel0, (0, .04, -.02))), (.12, Add3(pel0, (0, -.03, -.035))), (.42, Add3(pel0, (0, -.06, -.02))),
                (1.0, Add3(pel0, (0, -.05, -.02))), (FOUND_T, Add3(pel0, (0, -.05, -.02)))],
        bend=[(0.0, .10), (.12, .24), (.42, .30), (.9, .28), (1.25, .32), (1.6, .30), (FOUND_T, .30)],
        pelvisTilt=[(0.0, (.04, 0, 0)), (.42, (.12, 0, 0)), (FOUND_T, (.12, 0, 0))],
        twist=[(0.0, 0.0), (.8, .04), (1.6, 0.0), (FOUND_T, 0.0)],
        shrug=[(0.0, .04), (.3, 0.0), (FOUND_T, 0.0)]), lag={'head': .05})
    # 2026-09-29: the bayonet is already in its scabbard (IjaReleaseSheathe, before the walk): the right hand hangs free,
    # a little forward with the stoop.

    def Body(t):
        f = anim(t)
        if t > FOUND_HOLD[0]:
            u = t - FOUND_HOLD[0]
            b = math.sin(Tau * u / (FOUND_T - FOUND_HOLD[0]))
            f['bend'] += .012 * b
            f['shrug'] += .015 * b
        f['handRel.R'] = (-.07, -.12, -.46)
        f['palmF.R'], f['palmN.R'], f['curl.R'] = (0, -.2, -1), (1, 0, 0), .45
        return f
    props, review = SlungProps(T)
    spec = {'pose': lambda t: T.Nest(Body(t)), 'props': props,
            'plants': [('L', 0, FOUND_T), ('R', .42, FOUND_T)],
            'look': lambda t: eye,
            'reviewProps': lambda t: review(t) + KnifeProps(ScabbardKnife(T)) + [('point', eye, None, .05)],
            'reviewFrames': lambda n: [0, int(n * .15), int(n * .45), int(n * .7), n - 1]}
    spec = AReview(spec)
    spec['reviewViews'].append(FirstPersonView(eye, (0, 0, T.R(1.35)), name='eye'))
    return spec


# ---- D. IjaCrouchHairHold ------------------------------------------------------------------------------------------
# ija.crouch frame (runtime m, Blender axes: +X his left, +Y back, up): the pinned man's eye 0.60 m ahead, 0.28 m up,
# the crown of his head 0.08 m further and 0.12 m higher. The fist lifts it: the eye rises 0.16 m (and 0.04 m further
# off: the director's holdShot) and the head tips back 25 deg about the eye.
CROUCH_EYE = (-.03, -.60, .28)
CROUCH_CROWN = (-.03, -.68, .40)
CROUCH_LIFT = (0.0, -.04, .16)
CROUCH_TIP = 25.0
CROUCH_CROWN_N = (0.0, .35, .94)          # the crown's outward normal before the lift (up, toward ijaA)
LIFT_AT, LIFT_S = .25, .45


def CrouchLift(t):
    return Smooth((t - LIFT_AT) / LIFT_S)


def CrouchShake(t):
    """The fist's angry shakes in the hold loop (0.75-3.75 s): (x, y, z) runtime m, zero at the loop's ends."""
    u = t - CROUCH_HOLD[0]
    out = Vector((0, 0, 0))
    for c, sx in ((.65, 1.0), (1.55, -.8), (2.40, .9)):
        w = Bump(u, c - .16, c + .16)
        out += Vector((.018 * sx * math.sin(Tau * (u - c) / .16), 0, .008)) * w
    return out


def TipBack(v, deg):
    """A head-frame vector (y, z in the vertical plane) tipped back: +Z toward -Y (away from ijaA)."""
    a = math.radians(deg)
    return Vector((v[0], v[1] * math.cos(a) - v[2] * math.sin(a), v[1] * math.sin(a) + v[2] * math.cos(a)))


def CrouchHead(t, knock=(0, 0, 0)):
    """(eye, crown, crown normal) of the pinned man at IjaCrouchHairHold time t (runtime m); knock: the slap's jolt."""
    w = CrouchLift(t)
    shake = CrouchShake(t) if t > CROUCH_HOLD[0] else Vector((0, 0, 0))
    eye = Vector(CROUCH_EYE) + Vector(CROUCH_LIFT) * w + shake + Vector(knock)
    crown = eye + TipBack(Vector(CROUCH_CROWN) - Vector(CROUCH_EYE), CROUCH_TIP * w)
    return eye, crown, TipBack(CROUCH_CROWN_N, CROUCH_TIP * w).normalized()


CROWN_DOWN = (0, -1, -.35)                # the fist's fingers run back over his head


def CrouchBase(T):
    """Squatting deep at his head, knees wide either side of it, forearms on the knees, the face on the eye."""
    H, A = T.H, T.A
    f = Standing(T)
    f.update({'pelvis': (0, .02, .43), 'pelvisTilt': (.38, 0, 0), 'bend': .50, 'lean': 0.0, 'twist': 0.0, 'shrug': .04,
              'neck': (-.10, 0, 0), 'head': (-.15, 0, 0),
              'ankle.L': (H + .12, -.10, A), 'ankle.R': (-(H + .12), -.07, A),
              'legPole.L': (H + .62, -1.2, .75), 'legPole.R': (-(H + .62), -1.2, .75), 'foot.L': (6, 24, 0), 'foot.R': (6, -24, 0),
              'handRel.L': (-.02, -.38, -.26), 'poleRel.L': (.35, .05, -.40), 'palmF.L': (-.2, -.6, -.8), 'palmN.L': (0, -.2, -1),
              'curl.L': .55, 'handRel.R': (.02, -.38, -.26), 'poleRel.R': (-.35, .05, -.40), 'palmF.R': (.2, -.6, -.8),
              'palmN.R': (0, -.2, -1), 'curl.R': .55,
              'lookW': 1.0, 'lookLimit': 70.0, 'protract.L': 0.0})
    return f


def CrouchKeys(T):
    base = CrouchBase(T)
    return Keys(base, [
        (0.00, {}),
        (0.25, {'bend': .78, 'pelvisTilt': (.44, 0, 0), 'twist': -.14, 'protract.L': GRIP_PROTRACT, 'shrug': .06}),
        # the haul: he rocks back against the weight of the head
        (0.48, {'bend': .64, 'twist': -.10, 'shrug': .12, 'pelvis': Add3(base['pelvis'], (0, .02, .01))}),
        (0.70, {'bend': .70, 'twist': -.12, 'shrug': .08, 'pelvis': base['pelvis']}),
    ], lag={'head': .05})


def CrouchHoldPose(T, t, keys=None):
    """The crouched body at IjaCrouchHairHold time t (the hold loop's breathing and shakes on top)."""
    f = (keys or CrouchKeys(T))(min(t, CROUCH_HOLD[0]))
    if t > CROUCH_HOLD[0]:
        u = t - CROUCH_HOLD[0]
        span = CROUCH_HOLD[1] - CROUCH_HOLD[0]
        b = math.sin(Tau * u / span * 2)
        lean = .5 - .5 * math.cos(Tau * u / span)
        s = CrouchShake(t)
        f['bend'] += .015 * b + .05 * lean
        f['shrug'] += .01 * b + 2.0 * abs(s.x)
        f['twist'] += -1.5 * s.x
    return f


def CrouchGrip(T, crown, n):
    """The left fist's grip point in the hair on the crown (source m)."""
    return tuple((crown + n * .035) / T.s)


def CrouchSpec(T, duration, body, knock, rightHand=None, check=None, headAt=lambda t: t):
    """The crouched hair hold with the left fist on the crown (eased in over 0.07-0.25 s when `body` starts from the
    squat), the face on the lifted eye, the right hand from `rightHand(f, t)`."""
    def Head(t):
        return CrouchHead(headAt(t), knock(t))

    def Pose(t):
        f = body(t)
        eye, crown, n = Head(t)
        f['look'] = tuple(eye / T.s)
        w = f.pop('crownW', 1.0)
        palmF, palmN, _ = Grab(n, CROWN_DOWN)
        EaseGrip(f, 'L', CrouchGrip(T, crown, n), w, palmF, palmN, 1.1)
        f['armPole.L'] = (T.SX + T.R(.55), T.R(.10), T.R(.55))
        if rightHand:
            rightHand(f, t)
        return T.Nest(f)
    props, review = SlungProps(T)

    def Player(t):
        # head: the eye; crown: where the fist closes in the hair on the crown (the grip point the left hand is on)
        eye, crown, n = Head(t)
        return {'head': tuple(eye / T.s), 'crown': CrouchGrip(T, crown, n)}

    def Check(t):
        out = {}
        f = body(t)
        if f.get('crownW', 1.0) >= .999:
            eye, crown, n = Head(t)
            out['L'] = CrouchGrip(T, crown, n)
        if check:
            out.update(check(t))
        return out
    spec = {'pose': Pose, 'props': props, 'plants': [('L', 0, duration), ('R', 0, duration)],
            'check': Check, 'player': Player, 'look': lambda t: tuple(Head(t)[0] / T.s),
            'reviewProps': lambda t: review(t) + [('point', Player(t)['head'], None, .03), ('point', Player(t)['crown'], None, .03)]}
    spec = AReview(spec)
    spec['reviewViews'] = [('side', (-3.2, -.5, .8), (0, -.4, .45)), ('q', (-2.2, -2.8, 1.5), (0, -.4, .45)),
                           FirstPersonView(lambda t: Player(t)['head'], (0, 0, T.R(.95)), name='eye')]
    return spec


@Builder('IjaCrouchHairHold')
def BuildCrouchHairHold(T, name):
    keys = CrouchKeys(T)

    def Body(t):
        f = CrouchHoldPose(T, t, keys)
        f['crownW'] = Smooth((t - .07) / (LIFT_AT - .07))
        return f
    spec = CrouchSpec(T, CROUCH_T, Body, lambda t: (0, 0, 0))
    spec['reviewFrames'] = lambda n: [0, 4, 6, 12, 17, 50, n - 1]
    return spec


def SlapKnock(side, t):
    """The head knocked aside in his fist by the slap (runtime m): away from the blow, and down; it hangs there a moment
    (the director's camera kick, rescue.slap) and is back by the end."""
    k = Smooth((t - SLAP_HIT) / .07) * (1 - Smooth((t - SLAP_HIT - .30) / .55))
    return (.07 * side * k, 0, -.035 * k)


def SlapBody(T, keys):
    """IjaCrouchHairHold's hold-loop start (frame 0 = last frame), the trunk turning with the blow."""
    hold = CrouchHoldPose(T, CROUCH_HOLD[0])

    def Body(t):
        f = dict(hold)
        for k, v in keys(t).items():
            f[k] = f[k] + v if isinstance(v, float) and k in f and isinstance(f[k], float) else v
        return f
    return Body


def SlapHand(T, path, palms, weight):
    """The right hand on a world path (runtime m) with its palm keys, eased in and out by weight(t)."""
    def Right(f, t):
        w = weight(t)
        if w <= 1e-4:
            return
        pf, pn = palms(t)
        EaseGrip(f, 'R', tuple(Vector(path(t)) / T.s), w, Unit(pf), Unit(pn), .15)
        f['armPole.R'] = (-(T.SX + T.R(.55)), T.R(.20), T.R(.40))
    return Right


# Slap hand paths (grip point = the finger roots, runtime m, crouch frame). At the hit the palm (forehand) or the back of
# the hand (backhand) is on the cheek: the grip point 2 cm off the cheek on the hand's side, 4.5 cm on toward the fingers.
SLAP_FINGERS = (0, -.45, .89)
SLAP_CHEEK = {'L': (-.07, -.58, .41), 'R': (.07, -.58, .41)}   # the pinned man's cheeks (his LEFT is on ijaA's right)


def SlapPalmPoint(T, side, back=False):
    """The middle of the right palm (or of the back of the hand) on the posed bones."""
    K = T.K
    hand = K['Point'](K['Bone']('R Hand'))
    grip = K['GripPoint']('R')
    forward = (K['Point'](K['Bone']('R Finger2')) - hand).normalized()
    across = K['Point'](K['Bone']('R Finger1')) - K['Point'](K['Bone']('R Finger4'))
    facing = -forward.cross(across).normalized()
    return (hand + grip) / 2 + facing * T.R(-.022 if back else .022)


def SlapSpec(T, side, name):
    """side +1: forehand, the palm on his LEFT cheek (ijaA's right); -1: backhand, the back of the hand on his right."""
    fore = side > 0
    cheek = Vector(SLAP_CHEEK['L' if fore else 'R'])
    hit = cheek + Vector(SLAP_FINGERS) * .045 + Vector((1, 0, 0)) * (-.02 if fore else .02)
    # Keys: rest (the hold's right hand) -> up high over the shoulder by 0.30 (cocked, drawn a little further to 0.42) ->
    # the crack (0.50 -> the hit, two frames) -> the follow-through -> back onto the hold's hand (the weight fades 1.02-1.30:
    # the bake turns a hand at most 30 deg a frame, so the palm keys turn in steps of < 30 deg a frame round the crack).
    if fore:
        path = Channel([(0.0, (-.25, -.36, .50)), (.12, (-.34, -.28, .74)), (.30, (-.46, -.04, 1.08)), (.42, (-.48, .00, 1.12)),
                        (.50, (-.40, -.16, .98)), (SLAP_HIT, tuple(hit)), (.66, (.14, -.56, .40)), (.80, (.26, -.44, .50)),
                        (1.05, (.00, -.38, .52)), (1.30, (-.22, -.36, .50)), (SLAP_T, (-.25, -.36, .50))])
        twist = Channel([(0.0, 0.0), (.30, -.46), (.42, -.50), (.50, -.40), (SLAP_HIT, .08), (.66, .26), (.80, .30),
                         (1.05, .10), (SLAP_T, 0.0)])
        palmF = Channel([(0.0, (0, -.6, -.8)), (.30, (-.1, .1, 1)), (.42, (-.1, .1, 1)), (.50, (0, -.2, 1)),
                         (SLAP_HIT, SLAP_FINGERS), (.66, (.2, -.6, .75)), (.80, (.2, -.6, .75)), (1.30, (0, -.6, -.8)),
                         (SLAP_T, (0, -.6, -.8))])
        palmN = Channel([(0.0, (0, -.2, -1)), (.30, (.7, -.65, -.2)), (.42, (.7, -.65, -.2)), (.50, (.85, -.45, -.15)),
                         (SLAP_HIT, (1, 0, 0)), (.66, (.8, .2, -.2)), (.80, (.8, .2, -.2)), (1.30, (0, -.2, -1)),
                         (SLAP_T, (0, -.2, -1))])
        protract = Channel([(0.0, 0.0), (.30, -.40), (.42, -.42), (SLAP_HIT, .50), (.70, .15), (SLAP_T, 0.0)])
    else:
        # (cocked up in front of his left shoulder, not by his ear: wound further across, the right hand could not reach and
        # the trunk's turn pulled the left fist 8 cm out of the hair)
        path = Channel([(0.0, (-.25, -.36, .50)), (.12, (-.10, -.34, .72)), (.30, (.08, -.26, 1.02)), (.42, (.10, -.24, 1.06)),
                        (.50, (.08, -.34, .92)), (SLAP_HIT, tuple(hit)), (.66, (-.30, -.52, .44)), (.80, (-.40, -.40, .56)),
                        (1.05, (-.30, -.36, .52)), (1.30, (-.23, -.36, .50)), (SLAP_T, (-.25, -.36, .50))])
        twist = Channel([(0.0, 0.0), (.30, .20), (.42, .22), (.50, .16), (SLAP_HIT, -.06), (.66, -.26), (.80, -.30),
                         (1.05, -.10), (SLAP_T, 0.0)])
        palmF = Channel([(0.0, (0, -.6, -.8)), (.30, (-.1, 0, 1)), (.42, (-.1, 0, 1)), (.50, (0, -.2, 1)),
                         (SLAP_HIT, SLAP_FINGERS), (.66, (-.2, -.6, .75)), (.80, (-.2, -.6, .75)), (1.30, (0, -.6, -.8)),
                         (SLAP_T, (0, -.6, -.8))])
        palmN = Channel([(0.0, (0, -.2, -1)), (.30, (.8, .55, 0)), (.42, (.8, .55, 0)), (.50, (.95, .25, -.1)),
                         (SLAP_HIT, (1, 0, 0)), (.66, (.9, -.3, -.2)), (.80, (.9, -.3, -.2)), (1.30, (0, -.2, -1)),
                         (SLAP_T, (0, -.2, -1))])
        protract = Channel([(0.0, 0.0), (.30, .30), (.42, .32), (SLAP_HIT, -.10), (.70, -.15), (SLAP_T, 0.0)])
    weight = lambda t: Smooth(t / .10) * (1 - Smooth((t - 1.02) / .28))
    lean = Channel([(0.0, 0.0), (.30, -.08), (.42, -.09), (SLAP_HIT, .10), (.66, .08), (1.05, .02), (SLAP_T, 0.0)])
    shrug = Channel([(0.0, 0.0), (.30, .10), (.42, .12), (SLAP_HIT, .02), (SLAP_T, 0.0)])
    body = SlapBody(T, lambda t: {'twist': twist(t), 'bend': lean(t), 'shrug': shrug(t), 'protract.R': protract(t)})
    right = SlapHand(T, path, lambda t: (palmF(t), palmN(t)), weight)

    def Probe(t):
        if abs(t - SLAP_HIT) > .021:
            return None
        return {'palmOnCheek' if fore else 'backOnCheek': (tuple(SlapPalmPoint(T, side, back=not fore)), tuple(cheek / T.s))}
    spec = CrouchSpec(T, SLAP_T, body, lambda t: SlapKnock(side, t), right, headAt=lambda t: CROUCH_HOLD[0])
    spec['probes'] = Probe
    spec['reviewFrames'] = lambda n: [0, 7, 10, 12, 14, 16, 19, 25, n - 1]
    spec['reviewProps'] = (lambda rp: lambda t: rp(t) + [('point', tuple(cheek / T.s), None, .025)])(spec['reviewProps'])
    return spec


@Builder('IjaSlapForehand')
def BuildSlapForehand(T, name):
    return SlapSpec(T, 1, name)


@Builder('IjaSlapBackhand')
def BuildSlapBackhand(T, name):
    return SlapSpec(T, -1, name)


@Builder('IjaSlapRaise')
def BuildSlapRaise(T, name):
    up = (-.34, -.22, 1.12)                    # the open hand up by his right ear, cocked (runtime m): in the pinned eye's frame
    span = RAISE_HOLD[1] - RAISE_HOLD[0]

    def Tremble(t):
        if t <= RAISE_HOLD[0]:
            return Vector((0, 0, 0))
        u = t - RAISE_HOLD[0]
        return Vector((.012 * math.sin(Tau * 6 * u / span), .008 * math.sin(Tau * 4 * u / span + 1.0),
                       .010 * math.sin(Tau * 8 * u / span)))
    path = lambda t: tuple(Vector((-.25, -.36, .50)).lerp(Vector(up), Smooth(t / RAISE_HOLD[0])) + Tremble(t))
    palms = lambda t: (Unit(Lerp3((0, -.6, -.8), (.1, .1, 1), Smooth(t / RAISE_HOLD[0]))),
                       Unit(Lerp3((0, -.2, -1), (0, -1, .1), Smooth(t / RAISE_HOLD[0]))))
    weight = lambda t: Smooth(t / .10)

    def Keys_(t):
        w = Smooth(t / RAISE_HOLD[0])
        rage = Tremble(t)
        return {'twist': -.26 * w + 2.0 * rage.x, 'bend': -.08 * w + 1.5 * rage.z, 'shrug': .10 * w + 1.5 * abs(rage.z),
                'protract.R': -.30 * w, 'pelvis': Add3(CrouchHoldPose(T, CROUCH_HOLD[0])['pelvis'], (0, T.R(.04) * w, 0))}
    body = SlapBody(T, Keys_)
    right = SlapHand(T, path, palms, weight)
    spec = CrouchSpec(T, RAISE_T, body, lambda t: (0, 0, 0), right, headAt=lambda t: CROUCH_HOLD[0])
    spec['reviewFrames'] = lambda n: [0, 5, 10, 30, n - 1]
    return spec


# ---- F. HeLiftTimber (NRA02) --------------------------------------------------------------------------------------
# Data_OpeningStoryboards rescue.lift.heLift (1.45,-124.7) facing 1.2 rad; Data_OpeningSet0103 roofTimberDown
# (rest a/b, hang a/b, 0.30 wide, 0.28 high) and the director's lift: RoofLift(Smooth((t - gripS)/raiseS) * raise).
HE_LIFT_ROOT = (1.45, -124.70, 1.2)
TIMBER_REST = ((.95, -126.15, .44), (.95, -124.60, .44))
TIMBER_HANG = ((.80, -126.25, 1.62), (.80, -124.50, 1.05))
TIMBER_HALF = (.15, .14)                # half width, half height
TIMBER_RAISE, TIMBER_GRIP_S, TIMBER_RAISE_S = .55, .30, .50
HE_GRIP_Z = {'L': -124.87, 'R': -125.03}   # where his hands go under it (south of Shunzi's hips; L is the southern)
HE_GRIP_IN = .06                        # the finger roots this far in under the east face
HE_TURN = -.17                          # his body turned this much right of the root (rad): the grips square in front


def TimberLift(t):
    return Smooth((t - TIMBER_GRIP_S) / TIMBER_RAISE_S) * TIMBER_RAISE


def TimberGripWorld(side, k):
    """World (x, y up, z) of one grip under the timber lifted by k (the Set's PoseRoofTimber at 1 - k), and the timber's
    bottom normal (down, world)."""
    a = [TIMBER_REST[0][i] + (TIMBER_HANG[0][i] - TIMBER_REST[0][i]) * k for i in range(3)]
    b = [TIMBER_REST[1][i] + (TIMBER_HANG[1][i] - TIMBER_REST[1][i]) * k for i in range(3)]
    rest = TIMBER_REST
    u = (HE_GRIP_Z[side] - rest[0][1]) / (rest[1][1] - rest[0][1])     # a fixed point along the timber
    c = [a[i] + (b[i] - a[i]) * u for i in range(3)]                  # (x, z, y) as the tables are (x, z, lift)
    along = Vector((b[0] - a[0], b[2] - a[2], b[1] - a[1])).normalized()   # world (x, y, z)
    up = Vector((0, 1, 0))
    up = (up - along * up.dot(along)).normalized()
    east = Vector((1, 0, 0))
    point = Vector((c[0], c[2], c[1])) + east * (TIMBER_HALF[0] - HE_GRIP_IN) - up * (TIMBER_HALF[1] + .02)
    return point, -up


def HeLocal(T, p, direction=False):
    """World (x, y, z) three.js -> He's source frame (Blender axes)."""
    x0, z0, yaw = HE_LIFT_ROOT
    dx, dz = (p[0], p[2]) if direction else (p[0] - x0, p[2] - z0)
    c, s = math.cos(-yaw), math.sin(-yaw)
    lx, lz = dx * c + dz * s, -dx * s + dz * c
    v = Vector((-lx, lz, p[1]))
    return v if direction else v / T.s


@Builder('HeLiftTimber')
def BuildHeLiftTimber(T, name):
    H, P, A, SX = T.H, T.P, T.A, T.SX
    base = Standing(T)
    base.update({'ankle.L': (H + .06, -.16, A), 'ankle.R': (-(H + .08), .06, A), 'foot.L': (0, 10, 0), 'foot.R': (0, -18, 0),
                 'legPole.L': (H + .45, -1.2, .6), 'legPole.R': (-(H + .45), -1.2, .6), 'head': (.15, 0, 0)})
    turn = Channel([(0.0, 0.0), (.30, HE_TURN), (LIFT_T, HE_TURN)])
    hold = LIFT_HOLD
    span = hold[1] - hold[0]

    def Strain(t):
        if not (hold[0] < t < hold[1]):
            return 0.0
        return math.sin(Tau * (t - hold[0]) / span)
    rel = LIFT_RELEASE
    anim = Tracks(base, {
        'pelvis': [(0.0, base['pelvis']), (.30, (0, .06, .46)), (.55, (0, .04, .70)), (hold[0], (0, .03, .80)), (hold[1], (0, .03, .80)),
                   (rel + .30, (0, .02, .84)), (LIFT_T, Add3(base['pelvis'], (0, 0, -.02)))],
        'bend': [(0.0, .10), (.30, .62), (.55, .42), (hold[0], .32), (hold[1], .32), (rel + .30, .30), (LIFT_T, .14)],
        'pelvisTilt': [(0.0, (.04, 0, 0)), (.30, (.30, 0, 0)), (hold[0], (.22, 0, 0)), (hold[1], (.22, 0, 0)), (LIFT_T, (.05, 0, 0))],
        'shrug': [(0.0, 0.0), (.30, .06), (.55, .14), (hold[0], .12), (hold[1], .12), (rel + .25, .02), (LIFT_T, 0.0)],
        'head': [(0.0, (.15, 0, 0)), (.30, (-.10, 0, 0)), (.55, (-.25, 0, 0)), (hold[0], (-.20, 0, 0)), (hold[1], (-.20, 0, 0)),
                 (rel + .35, (.10, 0, 0)), (LIFT_T, (.05, 0, 0))],
    }, lag={'head': .05})

    def K(t):
        if t <= hold[0]:
            return TimberLift(t)
        return TIMBER_RAISE

    def Body(t):
        f = anim(t)
        s = Strain(t)
        f['bend'] += .015 * s
        f['shrug'] += .02 * s
        psi = turn(t)
        k = K(t)
        w = Smooth(t / TIMBER_GRIP_S) * (1 - Smooth((t - rel) / .12))
        for side in LR:
            point, down = TimberGripWorld(side, k)
            grip = HeLocal(T, (point.x, point.y, point.z))
            if t > rel:          # let go: the hands open and come off it upward and back as the weight goes
                grip = grip + Vector((0, T.R(.10), T.R(.08))) * Smooth((t - rel) / .25)
            d = HeLocal(T, (down.x, down.y, down.z), True)
            west = HeLocal(T, (-1, 0, 0), True)
            palmF, palmN, _ = Grab(tuple(d), tuple(west))
            q = Quaternion((0, 0, 1), -psi)          # Nest turns grip palms by the frame's yaw: author them against it
            palmF, palmN = tuple(q @ Vector(palmF)), tuple(q @ Vector(palmN))
            EaseGrip(f, side, tuple(grip), w, palmF, palmN, .95 if t <= rel else .35)
            sign = 1 if side == 'L' else -1
            f['armPole.' + side] = (sign * (SX + .40), .10, P - .15)
        for s_ in LR:
            f['handRel.' + s_] = f.get('handRel.' + s_) or (.07 if s_ == 'L' else -.07, -.10, -.47)
        PlantedFeet(f, t, turn, {'L': [(0.0, LIFT_T)], 'R': [(0.0, LIFT_T)]})
        return Turned(f, psi, pivot=(0.0, 0.0))

    def Dadao_():
        frame = BodyFrame(T.K)
        grip = frame['pelvis'] + frame['left'] * T.R(.17) - frame['back'] * T.R(.06) + frame['up'] * T.R(.10)
        axis = (-frame['up'] * .55 + frame['back'] * .80 + frame['left'] * .12).normalized()
        return Dadao(T, tuple(grip), tuple(axis), tuple(frame['left']))

    def Check(t):
        if not (TIMBER_GRIP_S <= t <= rel):
            return {}
        out = {}
        for side in LR:
            point, _ = TimberGripWorld(side, K(t))
            out[side] = tuple(HeLocal(T, (point.x, point.y, point.z)))
        return out

    def Review(t):
        rows = DadaoProps(Dadao_())
        k = K(t) if t <= rel + .1 else 0.0
        a = [TIMBER_REST[0][i] + (TIMBER_HANG[0][i] - TIMBER_REST[0][i]) * k for i in range(3)]
        b = [TIMBER_REST[1][i] + (TIMBER_HANG[1][i] - TIMBER_REST[1][i]) * k for i in range(3)]
        rows.append(('cyl', tuple(HeLocal(T, (a[0], a[2], a[1]))), tuple(HeLocal(T, (b[0], b[2], b[1]))), T.R(.14)))
        for side in LR:
            point, _ = TimberGripWorld(side, k)
            rows.append(('point', tuple(HeLocal(T, (point.x, point.y, point.z))), None, .025))
        # Shunzi lying under it (hips at the timber, the head east)
        rows.append(('cyl', tuple(HeLocal(T, (.95, .12, -125.3))), tuple(HeLocal(T, (1.85, .15, -125.25))), .12))
        return rows
    spec = {'pose': lambda t: T.Nest(Body(t)), 'check': Check, 'plants': [('L', 0, LIFT_T), ('R', 0, LIFT_T)],
            'props': lambda t: {'weapon': DadaoTrack(Dadao_())},
            'reach': {'fraction': .86, 'travel': .14, 'bend': .35},
            'reviewProps': Review,
            'reviewFrames': lambda n: [0, 7, 13, 19, 31, 40, n - 1]}
    spec = AReview(spec)
    spec['reviewViews'] = spec['reviewViews'][:2] + [('top', (.02, -.5, 3.0), (0, -.45, 0)), ('front', (-.4, -3.2, .8), (0, -.4, .6))]
    return spec


# =================================================================================
# 2026-09-29 Luo picks up the rifle, pulls Shunzi out by the armpits and hands it to him.
# User: 「班长把我拖出来有穿模，而且这一段做的有点垃圾……完全可以让我仰头被拉出来啊，看到自己的脚从倒塌的房子里被拖出来」,
# 「在开局的过场动画里我要你在这里直接做一个班长把枪递交到我手上然后直接开打的动作，而不是要我自己还要捡起来；最后这里结束动画
# 的时候玩家应该是站立的而不是半蹲」. Three NRA05 clips: LuoPickUpRifleSling, LuoRescueDrag (+ `player` body), LuoHandRifle
# (+ `player` body and rifle points). Numbers named RT* are RUNTIME metres in Luo's root frame at the start of the clip
# (the manifest's three.js actor frame: +x right, +y up, +z BACK, -z forward); RT() turns them into this rig's source
# metres (Blender axes: +X left, +Y back, +Z up).
# =================================================================================
def RT(T, x, y, z):
    """Runtime actor metres (x right, y up, z back) -> this rig's source metres."""
    return Vector((-x / T.s, z / T.s, y / T.s))


def RTd(x, y, z):
    """A direction in the runtime actor frame -> source axes, unit length."""
    v = Vector((-x, z, y))
    return v.normalized() if v.length > 1e-9 else v


def RTs(T, p):
    """Source metres -> runtime actor metres (x right, y up, z back)."""
    return Vector((-p[0] * T.s, p[2] * T.s, p[1] * T.s))


HANYANG_HALF = (WEAPONS['HanYang']['muzzle'] - WEAPONS['HanYang']['butt']) / 2      # rifle centre, real m ahead of the right-hand grip


def RifleAtCentre(T, centre, axis):
    """The HanYang whose centre (butt plate and muzzle tip half way) sits at `centre` (source m) and points along `axis`."""
    a = Vector(axis).normalized()
    return T.Rifle(tuple(Vector(centre) - a * T.R(HANYANG_HALF)), tuple(a))


def RifleCentre(T, rifle):
    return Vector(rifle['origin']) + Vector(rifle['axis']) * T.R(HANYANG_HALF)


def RifleSlerp(T, a, b, w):
    """Rifle pose between two rifles: the grip origin by straight line, the bore direction by the shortest arc."""
    origin = Vector(a['origin']).lerp(Vector(b['origin']), w)
    va, vb = Vector(a['axis']).normalized(), Vector(b['axis']).normalized()
    axis = va.slerp(vb, w) if va.dot(vb) > -.98 else va.lerp(vb, w).normalized()
    return T.Rifle(tuple(origin), tuple(axis))


def RiflePath(T, rows):
    """rows [(t, rifle)] -> f(t) the rifle between them: smoothstep in time, arc in direction (a hand-held carry keeps
    the grip origin on a smooth path: PCHIP through the origins, the bore by shortest arcs)."""
    ts = [r[0] for r in rows]
    origins = Channel([(r[0], tuple(r[1]['origin'])) for r in rows])

    def At(t):
        if t <= ts[0]:
            return rows[0][1]
        if t >= ts[-1]:
            return rows[-1][1]
        i = max(j for j in range(len(ts) - 1) if ts[j] <= t)
        w = (t - ts[i]) / max(1e-6, ts[i + 1] - ts[i])
        rifle = RifleSlerp(T, rows[i][1], rows[i + 1][1], Smooth(w))
        return T.Rifle(tuple(origins(t)), rifle['axis'])
    return At


LUO_GROUND_RIFLE = ((.70, .04, .05), (-.5, 0.0, .87))      # centre, bore (muzzle) direction: runtime m, root frame of LuoPickUpRifleSling
LUO_SHUNZI_EYE0 = (0.0, .28, -.70)                         # Shunzi's prone eye in that frame (the first-person camera)


def LuoStand(T):
    """Luo standing at his root, hands hanging: frame 0 of LuoPickUpRifleSling is it (dadao in the belt), the last frame
    of LuoPickUpRifleSling (rifle slung) and frame 0 of LuoRescueDrag are it."""
    f = Standing(T)
    f.update({'lookW': 0.0, 'curl.L': .45, 'curl.R': .45})
    return f


LUO_PICK_T = 43 / 24                 # 1.79 s
LUO_PICK_EVENTS = {'lifted': .72, 'slung': 1.46}
Meta('LuoPickUpRifleSling', LUO_PICK_T, False, 'free', role='luo', rig='TengxianNra05', props=['rifle'], rootMotion=False,
     weapon='Dadao', weaponState='dadaoInBelt',
     contacts=[{'t': .58, 'limb': 'handsLR', 'action': 'grip', 'target': 'rifle'},
               {'t': 1.50, 'limb': 'handsLR', 'action': 'release', 'target': 'rifle'}],
     events=[{'t': LUO_PICK_EVENTS['lifted'], 'kind': 'rifleLifted'}, {'t': LUO_PICK_EVENTS['slung'], 'kind': 'rifleSlung'}],
     prev=['LuoDadaoChopRear'], next=['LuoRescueDrag'],
     notes='2026-09-29: from standing (dadao in the belt) steps his right foot out, stoops and takes the Hanyang lying 0.7 m to '
           'his right (prop `rifle`: on the ground at frame 0, centre (+.70, .04, +.05), muzzle toward (-.5, 0, +.87) in the root '
           'frame), stands with it, swings it over the right shoulder onto his back and lets go; the last frame is the standing '
           'pose with the rifle slung (SlungRifle back) = LuoRescueDrag frame 0.')

def LuoPickPath(T):
    """The pick-up and sling of LuoPickUpRifleSling: (stand, RifleAt(t), along(t), alongL(t), the rifle on the ground, ready, slung).
    along / alongL: where the right / left fist holds the rifle, real metres from the butt plate."""
    H, P, A, SX, SZ = T.H, T.P, T.A, T.SX, T.SZ
    stand = LuoStand(T)
    gr = RifleAtCentre(T, RT(T, *LUO_GROUND_RIFLE[0]), RTd(*LUO_GROUND_RIFLE[1]))
    ready = T.Rifle((-.17, -.32, P + .02), Unit((.55, -.18, .82)))     # port arms: muzzle up over his left shoulder, not at Shunzi's camera
    swung = T.Rifle((-.20, -.30, P + .22), Unit((.22, -.82, .52)))
    lifted = T.Rifle((-.20, .15, P + .25), Unit((-.20, -.35, .91)))
    slung = T.Rifle((.107, .20, P + .16), Unit((-.37, .05, .93)))
    up = T.Rifle(tuple(gr['origin'][:2]) + (gr['origin'][2] + T.R(.16),), gr['axis'])
    mid = RifleAtCentre(T, RT(T, .26, .84, -.02), RTd(-.30, .55, .78))    # off the ground and up against his right side, the muzzle swinging up
    rifleAt = RiflePath(T, [(0.0, gr), (.62, gr), (.72, up), (.88, mid), (1.06, ready), (1.16, swung), (1.32, lifted), (1.50, slung)])
    w = WEAPONS[T.gun]
    along = Channel([(0.0, .60), (.62, .60), (.72, .58), (.88, .46), (1.06, w['butt']), (1.16, .45), (1.32, .70), (1.50, .92)])
    alongL = Channel([(0.0, w['gripL'] + w['butt']), (1.10, w['gripL'] + w['butt'])])
    return stand, rifleAt, along, alongL, gr, ready, slung


@Builder('LuoPickUpRifleSling')
def BuildLuoPickUp(T, name):
    H, P, A, SX, SZ = T.H, T.P, T.A, T.SX, T.SZ
    stand, rifleAt, along, alongL, gr, ready, slung = LuoPickPath(T)
    Foot = lambda x, z: (RT(T, x, 0, z).x, RT(T, x, 0, z).y, A)
    footR, footL = Foot(.52, .02), Foot(.13, .0)
    lift = lambda a, b: (Vector(a).lerp(Vector(b), .5).x, Vector(a).lerp(Vector(b), .5).y, A + .08)
    sR, sL = stand['ankle.R'], stand['ankle.L']
    body = Tracks(stand, {
        'pelvis': [(0.0, stand['pelvis']), (.24, Add3(stand['pelvis'], (-.10, 0, -.04))), (.44, tuple(RT(T, .36, .52, .06))),
                   (.62, tuple(RT(T, .36, .48, .05))), (.90, tuple(RT(T, .16, .76, .0))), (1.20, tuple(RT(T, .05, .84, .0))),
                   (LUO_PICK_T, stand['pelvis'])],
        'bend': [(0.0, stand['bend']), (.24, .30), (.44, .92), (.62, .98), (.90, .40), (1.20, .12), (LUO_PICK_T, stand['bend'])],
        'lean': [(0.0, 0.0), (.44, -.26), (.62, -.30), (.90, -.10), (1.20, 0.0)],
        'twist': [(0.0, 0.0), (.44, -.22), (.62, -.24), (.90, -.08), (1.20, 0.0)],
        'pelvisTilt': [(0.0, stand['pelvisTilt']), (.44, (.30, 0, 0)), (.62, (.34, 0, 0)), (.90, (.12, 0, 0)), (1.20, stand['pelvisTilt'])],
        'head': [(0.0, (0, 0, 0)), (1.0, (0, 0, 0))],
        'ankle.R': [(0.0, sR), (.10, sR), (.21, lift(sR, footR)), (.32, footR), (1.00, footR), (1.12, lift(footR, sR)), (1.24, sR), (LUO_PICK_T, sR)],
        'ankle.L': [(0.0, sL), (.22, sL), (.31, lift(sL, footL)), (.40, footL), (1.10, footL), (1.22, lift(footL, sL)), (1.36, sL), (LUO_PICK_T, sL)],
        'legPole.R': [(0.0, stand['legPole.R']), (.32, (footR[0] - .30, -.95, .50)), (1.00, (footR[0] - .30, -.95, .50)), (1.24, stand['legPole.R'])],
        'legPole.L': [(0.0, stand['legPole.L']), (.40, (footL[0] + .22, -.95, .50)), (1.10, (footL[0] + .22, -.95, .50)), (1.36, stand['legPole.L'])],
        'foot.R': [(0.0, stand['foot.R']), (.32, (0, -14, 0)), (1.00, (0, -14, 0)), (1.24, stand['foot.R'])],
        'foot.L': [(0.0, stand['foot.L']), (.40, (0, 8, 0)), (1.36, stand['foot.L'])],
    }, lag={'head': .05})
    seeRifle = Channel([(0.0, 0.0), (.16, 0.0), (.40, .85), (.62, .85), (.90, .30), (1.04, 0.0)])
    braceL = Channel([(0.0, 0.0), (.30, 1.0), (.66, 1.0), (.90, 0.0), (LUO_PICK_T, 0.0)])     # the free left hand on his thigh

    def Pose(t):
        f = body(t)
        rifle = rifleAt(t)
        palms = T.Palms(rifle['axis'])
        held = Smooth((t - .40) / .18) if t < .70 else 1.0
        # right fist: near the balance of the rifle while it is picked up, on the neck once it is up, then up the barrel as it
        # goes over the shoulder and off it
        if t >= .40 and t < 1.56:
            off = 1 - Smooth((t - 1.44) / .12) if t > 1.44 else 1.0
            EaseGrip(f, 'R', T.Along(rifle, along(t)), min(held, off), palms['R'][0], palms['R'][1], .95)
            f['armPole.R'] = (-(SX + .50), .20, P - .10)
        # left fist: hangs on his thigh while the right hand takes the rifle off the ground, joins on the handguard once it is
        # up (0.78-0.94 s) and lets go before it goes over the shoulder (1.10-1.24 s)
        if .78 <= t < 1.26:
            offL = 1 - Smooth((t - 1.10) / .14) if t > 1.10 else 1.0
            EaseGrip(f, 'L', T.Along(rifle, alongL(t)), min(Smooth((t - .78) / .16), offL), palms['L'][0], palms['L'][1], .85)
        # eyes: on Shunzi, then on the rifle while he stoops for it, then back
        aim = Vector(RifleCentre(T, gr)) + Vector((0, 0, .0))
        f['look'] = tuple(Vector(RT(T, *LUO_SHUNZI_EYE0)).lerp(aim, seeRifle(t)))
        f['lookW'] = .6 if t <= 1.3 else .6 * (1 - Smooth((t - 1.3) / .3))
        f['handRel.L'] = tuple(Vector(stand['handRel.L']).lerp(Vector((.07, -.22, -.40)), braceL(t)))
        return T.Nest(f)

    def Props(t):
        # the last 0.2 s the rifle settles onto SlungRifle(back) evaluated on the posed body: LuoRescueDrag's frame 0 (and LuoHandRifle's)
        # is that same rifle, so the hand-over does not move it
        rifle, up, w = rifleAt(t), Vector((0, 0, 1)), Smooth((t - 1.30) / .20)
        if w > 0:
            actual, actualUp = SlungRifle(T, 'back')
            origin = Vector(rifle['origin']).lerp(Vector(actual['origin']), w)
            axis = Vector(rifle['axis']).slerp(Vector(actual['axis']), w) if w < 1 else Vector(actual['axis'])
            rifle, up = T.Rifle(tuple(origin), tuple(axis)), up.lerp(Vector(actualUp), w)
        return {'rifle': (rifle['origin'], rifle['axis'], tuple(up), True)}

    def Check(t):
        out = {}
        rifle = rifleAt(t)
        if .58 <= t <= 1.44:
            out['R'] = T.Along(rifle, along(t))
        if .94 <= t <= 1.10:
            out['L'] = T.Along(rifle, alongL(t))
        return out
    spec = {'pose': Pose, 'props': Props, 'check': Check,
            'plants': [('L', 0, .22), ('L', .40, 1.10), ('L', 1.36, LUO_PICK_T), ('R', 0, .10), ('R', .32, 1.00), ('R', 1.24, LUO_PICK_T)],
            'reach': {'fraction': .80, 'travel': .14, 'bend': .55, 'sink': .20},
            'reviewProps': lambda t: T.RifleProps(rifleAt(t)) + [('cyl', tuple(RT(T, 0, .05, -.70)), tuple(RT(T, 0, .28, -.70)), .07)],
            'reviewFrames': lambda n: [0, int(n * .16), int(n * .30), int(n * .42), int(n * .58), int(n * .72), int(n * .86), n - 1]}
    spec = AReview(spec)
    spec['reviewViews'] = [('side', (-3.2, -.4, 1.0), (0, -.1, .6)), ('q', (-2.3, -2.9, 1.8), (0, -.1, .55)),
                           FirstPersonView(tuple(RT(T, *LUO_SHUNZI_EYE0)), tuple(RT(T, 0, .95, .15)), fov=70.0)]
    return spec


# ---- Shunzi's body for the first person: one rigid figure, runtime metres in the root frame of LuoRescueDrag -----------------
# (`player` track: eye, gaze, crown, chest, chestUp, pelvis, kneeL/R, heelL/R). The figure is the brief's numbers made
# rigid: the pelvis, the trunk (0.64 m pelvis to chest centre), the thighs and shins keep their lengths through the roll, the
# lift and the drag, the head turns on a neck pivot. Prone / supine key states match the brief within ~2 cm. Left / right
# are HIS: prone his left is +x, supine -x.
SZ_AXIS_Y = .125                        # the body's axis over the ground while he lies
SZ_PELVIS = (0.0, SZ_AXIS_Y, -1.60)
SZ_TRUNK = .64
SZ_NECK = ((.209, -.037), (.149, .067))  # neck pivot from the chest centre (cranial, ventral m): prone, supine
SZ_GAZE0 = math.radians(15.0)           # the prone gaze: 15 deg over the ground, toward Luo (+z)
SZ_LIFT_DEG, SZ_LOW_DEG = 25.0, 5.0


def _Rx(v, a):
    c, s = math.cos(a), math.sin(a)
    return Vector((v.x, v.y * c - v.z * s, v.y * s + v.z * c))


def _Ry(v, a):
    c, s = math.cos(a), math.sin(a)
    return Vector((v.x * c + v.z * s, v.y, -v.x * s + v.z * c))


def _Rz(v, a):
    c, s = math.cos(a), math.sin(a)
    return Vector((v.x * c - v.y * s, v.x * s + v.y * c, v.z))


def ShunziFigure(roll, lift, dz, pitch, headRoll, bob=0.0, yaw=0.0):
    """Shunzi lying, as Vectors (runtime m, Luo's root frame).
    roll: 0 prone .. pi supine, about the body axis (+ = his left side, +x prone, rises first: the chest normal goes down, +x, up);
    lift: the trunk raised about the hips (rad, + = the head up); dz: the drag along +z; pitch: the gaze elevation over the prone
    15 deg (rad; the camera turns about +x); headRoll: the head's roll about its own gaze (rad, the camera's roll); bob / yaw:
    the eye's rise (m) and a swing of the gaze about the vertical (rad) with each pull."""
    s = (1 - math.cos(roll)) / 2
    P = Vector((0.0, SZ_AXIS_Y, SZ_PELVIS[2] + dz))
    a = _Rx(Vector((0, 0, 1)), -lift)
    v = _Rx(_Rz(Vector((0, -1, 0)), roll), -lift)                   # ventral (chest normal)
    l = _Rx(_Rz(Vector((1, 0, 0)), roll), -lift)                    # his left
    C = P + a * SZ_TRUNK
    Na = SZ_NECK[0][0] + (SZ_NECK[1][0] - SZ_NECK[0][0]) * s
    Nv = SZ_NECK[0][1] + (SZ_NECK[1][1] - SZ_NECK[0][1]) * s
    N = C + a * Na + v * Nv
    g0 = Vector((0, math.sin(SZ_GAZE0), math.cos(SZ_GAZE0)))
    c0 = Vector((0, math.cos(SZ_GAZE0), -math.sin(SZ_GAZE0)))
    g, c = g0, Quaternion(g0, headRoll) @ c0
    g, c = _Rx(g, -pitch), _Rx(c, -pitch)
    if yaw:
        g, c = _Ry(g, yaw), _Ry(c, yaw)
    eye = N + g * .10 + c * .10 + Vector((0, bob, 0))
    kneeY = .07 + .03 * s + .05 * math.sin(roll)
    heelY = .12 - .07 * s + .04 * math.sin(roll)
    x = math.cos(roll)
    return {'P': P, 'a': a, 'v': v, 'l': l, 'C': C, 'N': N, 'g': g, 'c': c, 'eye': eye,
            'kneeL': Vector((.11 * x, kneeY, P.z - .48)), 'kneeR': Vector((-.11 * x, kneeY, P.z - .48)),
            'heelL': Vector((.12 * x, heelY, P.z - .95)), 'heelR': Vector((-.12 * x, heelY, P.z - .95))}


def ShunziPoints(fig):
    """The `player` parts of a figure: eye, gaze (1.0 m along the head), crown (0.2 m toward the top of the head), chest (the
    breastbone centre), chestUp (0.25 m along the chest normal), pelvis, knees, heels."""
    eye = fig['eye']
    return {'eye': eye, 'gaze': eye + fig['g'], 'crown': eye + fig['c'] * .2, 'chest': fig['C'], 'chestUp': fig['C'] + fig['v'] * .25,
            'pelvis': fig['P'], 'kneeL': fig['kneeL'], 'kneeR': fig['kneeR'], 'heelL': fig['heelL'], 'heelR': fig['heelR']}


def ShunziShoulder(fig, sign=1.0, out=.0):
    """His left (sign 1) or right (-1) shoulder joint (m), `out` further out."""
    return fig['C'] + fig['a'] * .12 + fig['l'] * (sign * (.19 + out))


RD_T = 120 / 24                                       # LuoRescueDrag: 5.0 s
RD_ROLL = (.50, 1.30)                                 # the roll onto his back
RD_LIFT = (1.30, 1.90)                                # the trunk raised about the hips
RD_HEAD = (1.60, 2.10)                                # the head goes over from looking back at Luo to looking down his body at his feet
RD_LOWER = (4.10, 4.60)                               # let down to 12 deg
RD_PULLS = [(1.90 + .44 * k, 2.20 + .44 * k) for k in range(5)]        # five pulls of 0.29 m, 0.14 s rests: haulStart 1.9, haulEnd 4.1
RD_PULL_M = 1.45 / 5


def RdDrag(t):
    return sum(RD_PULL_M * Smooth((t - t0) / (t1 - t0)) for t0, t1 in RD_PULLS)


def RdPull(t):
    """(k, u): which pull is on and how far through it, or None."""
    for k, (t0, t1) in enumerate(RD_PULLS):
        if t0 <= t <= t1:
            return k, (t - t0) / (t1 - t0)
    return None


def RdFigure(t):
    roll = math.pi * Smooth((t - RD_ROLL[0]) / (RD_ROLL[1] - RD_ROLL[0]))
    lift = math.radians(SZ_LIFT_DEG) * Smooth((t - RD_LIFT[0]) / (RD_LIFT[1] - RD_LIFT[0])) \
        - math.radians(SZ_LIFT_DEG - SZ_LOW_DEG) * Smooth((t - RD_LOWER[0]) / (RD_LOWER[1] - RD_LOWER[0]))
    # gaze elevation: 15 -> 50 deg over the roll (he looks up at Luo), over the top to 210 deg (the direction of his feet, 30 deg
    # down along his body), a little less while he is hauled (207), 200 when he is let down
    pitch = math.radians(35) * Smooth((t - RD_ROLL[0]) / (RD_ROLL[1] - RD_ROLL[0])) \
        + math.radians(160) * Smooth((t - RD_HEAD[0]) / (RD_HEAD[1] - RD_HEAD[0])) \
        - math.radians(3) * Smooth((t - 2.10) / 1.0) - math.radians(7) * Smooth((t - RD_LOWER[0]) / (RD_LOWER[1] - RD_LOWER[0]))
    bob, yaw, pull = 0.0, 0.0, RdPull(t)
    if pull:
        k, u = pull
        bob = .03 * math.sin(math.pi * u)
        yaw = math.radians(4) * math.sin(math.pi * u) * (1 if k % 2 == 0 else -1)
    return ShunziFigure(roll, lift, RdDrag(t), pitch, roll, bob, yaw)


def ViewRoll(direction, up):
    """The roll (deg) that puts a review camera looking along `direction` with `up` overhead (Blender's track quaternion keeps
    the camera's up toward world +Z; the bake turns it by this much about the view axis)."""
    d = Vector(direction).normalized()
    q = d.to_track_quat('-Z', 'Y')
    up0, right0 = q @ Vector((0, 1, 0)), q @ Vector((1, 0, 0))
    u = Vector(up) - d * Vector(up).dot(d)
    return math.degrees(math.atan2(-u.dot(right0), u.dot(up0)))


def SegmentDistance(p1, q1, p2, q2):
    """Smallest distance between segments p1-q1 and p2-q2."""
    d1, d2, r = q1 - p1, q2 - p2, p1 - p2
    a, e, f = d1.dot(d1), d2.dot(d2), d2.dot(r)
    if a <= 1e-12 and e <= 1e-12:
        return r.length
    if a <= 1e-12:
        s, t = 0.0, Clamp(f / e)
    else:
        c = d1.dot(r)
        if e <= 1e-12:
            s, t = Clamp(-c / a), 0.0
        else:
            b = d1.dot(d2)
            den = a * e - b * b
            s = Clamp((b * f - c * e) / den) if den > 1e-12 else 0.0
            t = (b * s + f) / e
            if t < 0:
                t, s = 0.0, Clamp(-c / a)
            elif t > 1:
                t, s = 1.0, Clamp((b - c) / a)
    return ((p1 + d1 * s) - (p2 + d2 * t)).length


RD_HOOK_Z = -.10                 # Luo's pelvis (runtime z) when he hooks his arms in behind Shunzi's head
RD_END_BACK = .78                # Luo stands this far behind Shunzi's eye at the end (the brief: 0.75 +- 0.1)
RD_GRIP_ON, RD_GRIP_OFF = (.40, .52), (4.50, 4.70)
RD_ROLL_HANDS_OFF = .78          # the hands let go of the shoulder over the top of the roll (the body finishes it)


def RdEndZ():
    return RdFigure(RD_T)['eye'].z + RD_END_BACK


Meta('LuoRescueDrag', RD_T, False, 'free', role='luo', rig='TengxianNra05', props=['rifle'], rootMotion=True, player=True,
     weapon='Dadao', weaponState='dadaoInBelt',
     contacts=[{'t': .50, 'limb': 'handsLR', 'action': 'grab', 'partnerRole': 'shunzi', 'part': 'shoulderL'},
               {'t': 1.80, 'limb': 'handsLR', 'action': 'grab', 'partnerRole': 'shunzi', 'part': 'armpitsChest'},
               {'t': 4.50, 'limb': 'handsLR', 'action': 'release'}],
     events=[{'t': 1.30, 'kind': 'rolled'}, {'t': 1.80, 'kind': 'hooked'}, {'t': 1.90, 'kind': 'haulStart'},
             {'t': 4.10, 'kind': 'haulEnd'}],
     prev=['LuoPickUpRifleSling'], next=['LuoHandRifle'],
     notes='2026-09-29: Luo (rifle slung on his back, dadao in the belt) squats at the head of the prone Shunzi, rolls him onto his back '
           'by the left shoulder, hooks both forearms under his armpits from behind the head, lifts his trunk and hauls him '
           '1.45 m (five pulls, feet planted) out from under the roof timber, lets him down and stands 0.78 m behind his eye. '
           '`player`: his rigid body in Luo\'s root frame at frame 0 -- eye, gaze (1.0 m along the head), crown (0.2 m toward the top '
           'of the head: the camera\'s up is crown - eye), chest (breastbone centre), chestUp (0.25 m along the chest normal), '
           'pelvis, kneeL/R, heelL/R (his left/right). The root is pinned at frame 0 and the pelvis carries the root motion.')


def SlungBack(T, hang=0.0):
    """SlungRifle(T, 'back') whose barrel swings back toward the vertical as he bends (hang 0..1): on the back of a bent-over man
    the rifle hangs from the sling, it does not point over his head at what he looks at. The sling's shoulder end stays put."""
    rifle, up = SlungRifle(T, 'back')
    if hang <= 1e-4:
        return rifle, up
    axis = Unit(Lerp3(rifle['axis'], (0, .0, 1), hang))
    top = Vector(rifle['origin']) + Vector(rifle['axis']) * T.R(.55)
    return T.Rifle(tuple(top - Vector(axis) * T.R(.55)), axis), up


def SzGhost(T, fig):
    """His body as review shapes (source metres): trunk, neck, head, thighs, shins, the arms along his sides."""
    r = lambda p: tuple(RT(T, p.x, p.y, p.z))
    s = T.s
    head = fig['N'] + fig['c'] * .07 + fig['g'] * .03
    rows = [('cyl', r(fig['P']), r(fig['C']), .11 / s), ('cyl', r(fig['C']), r(fig['N']), .05 / s), ('point', r(head), None, .09 / s),
            ('cyl', r(fig['P']), r(fig['kneeL']), .07 / s), ('cyl', r(fig['P']), r(fig['kneeR']), .07 / s),
            ('cyl', r(fig['kneeL']), r(fig['heelL']), .05 / s), ('cyl', r(fig['kneeR']), r(fig['heelR']), .05 / s)]
    for sign in (1, -1):
        sh = ShunziShoulder(fig, sign)
        rows.append(('cyl', r(sh), r(sh - fig['a'] * .50 + fig['l'] * (sign * .06)), .04 / s))
    return rows


def RdHand(fig, side, t, figAt):
    """The world point (runtime m) Luo's hand `side` closes on at clip time t. Roll: on the shoulder that goes up (his left, +x
    prone) -- the right hand on its outer top, the left inside it -- until the top of the roll; then across to his armpit
    on its own side, then in over the chest to the breastbone (right hand on his right, left on his left)."""
    outer = side == 'R'

    def Body(f, a, l, v):
        return f['C'] + f['a'] * a + f['l'] * l + f['v'] * v
    if t <= RD_ROLL_HANDS_OFF:
        return Body(fig, .12 if outer else .10, .24 if outer else .13, -.10)
    top = Body(figAt(RD_ROLL_HANDS_OFF), .12 if outer else .10, .24 if outer else .13, -.10)
    sign = -1 if outer else 1                               # Luo's right hand on his right (-l), left on his left (+l)
    armpit = Body(fig, .08, sign * .18, .03)
    chest = Body(fig, .10, sign * .13, .10)                  # the upper chest under the collarbone: 'armpitsChest'
    if t <= 1.45:
        return top.lerp(armpit, Smooth((t - RD_ROLL_HANDS_OFF) / (1.45 - RD_ROLL_HANDS_OFF)))
    return armpit.lerp(chest, Smooth((t - 1.45) / .40))


def RdPalm(fig, side, t):
    """(fingers, palm normal, curl) in source axes: on the shoulder top the fingers reach across his back; on the chest they
    point down the body, the palm on the breastbone."""
    dorsal = -fig['v']
    across = -fig['l']
    top = (RTd(*across), RTd(*(-dorsal)), .9)
    chest = (RTd(*(-fig['a'])), RTd(*(-fig['v'])), 1.0)
    w = Smooth((t - RD_ROLL_HANDS_OFF) / (1.75 - RD_ROLL_HANDS_OFF))
    f = Vector(top[0]).lerp(Vector(chest[0]), w).normalized()
    n = Vector(top[1]).lerp(Vector(chest[1]), w).normalized()
    return tuple(f), tuple(n), Mix(top[2], chest[2], w)


@Builder('LuoRescueDrag')
def BuildLuoRescueDrag(T, name):
    H, P, A, SX, SZ = T.H, T.P, T.A, T.SX, T.SZ
    s = T.s
    stand = LuoStand(T)
    zEnd = RdEndZ()
    shift = Vector((0.0, zEnd / s, 0.0))                       # the standing pose he ends in: LuoStand carried back
    endStand = {k: (Add3(v, tuple(shift)) if (v is not None and (k == 'pelvis' or k.startswith(POSITION_CHANNELS))) else v)
                for k, v in stand.items()}
    # Luo's pelvis over the ground (runtime m): x, z; height h
    px = Channel([(0.0, 0.0), (.42, .46), (.70, .46), (1.10, .08), (1.30, .04), (1.45, .03), (1.80, 0.0), (RD_T, 0.0)])
    zBase = Channel([(0.0, stand['pelvis'][1] * s), (.20, -.06), (.42, -.26), (1.00, -.24), (1.30, -.12), (1.45, -.10), (1.90, RD_HOOK_Z),
                     (4.10, RD_HOOK_Z), (4.60, RD_HOOK_Z + .01), (RD_T, zEnd - 1.45 + stand['pelvis'][1] * s)])
    ph = Channel([(0.0, stand['pelvis'][2] * s), (.20, .80), (.42, .50), (.90, .50), (1.30, .46), (1.45, .46), (1.90, .58), (4.10, .58),
                  (4.40, .50), (4.60, .54), (RD_T, stand['pelvis'][2] * s)])

    def PelvisRT(t):
        dip = .0
        pull = RdPull(t)
        if pull:
            dip = -.02 * math.sin(math.pi * pull[1])
        return (px(t), ph(t) + dip, zBase(t) + RdDrag(t))

    def PelvisSrc(t):
        x, h, z = PelvisRT(t)
        return (-x / s, z / s, h / s)

    bend = Channel([(0.0, stand['bend']), (.20, .30), (.42, .95), (1.00, .95), (1.30, 1.25), (1.45, 1.35), (1.90, 1.15), (2.20, 1.2), (4.10, 1.2),
                    (4.40, 1.3), (4.60, .90), (RD_T, stand['bend'])])
    tilt = Channel([(0.0, stand['pelvisTilt']), (.42, (.30, 0, 0)), (1.00, (.30, 0, 0)), (1.80, (.34, 0, 0)), (4.10, (.34, 0, 0)),
                    (4.60, (.30, 0, 0)), (RD_T, stand['pelvisTilt'])])
    # feet (source): approach and squat, the step round behind his head, the five hauling steps, then home
    Foot = lambda x, z: (RT(T, x, 0, z).x, RT(T, x, 0, z).y, A)
    sL, sR = stand['ankle.L'], stand['ankle.R']
    L1, R1 = Foot(.28, -.20), Foot(.70, -.26)
    L2, R2 = Foot(-.20, -.12), Foot(.22, -.10)
    lift = lambda a, b: (Vector(a).lerp(Vector(b), .5).x, Vector(a).lerp(Vector(b), .5).y, A + .08)
    LS1, RS1, RS2, LS2 = (.14, .30), (.24, .40), (.72, .90), (.82, 1.00)        # the steps in: L, R; the steps round behind his head: R, L
    rowsL = [(0.0, sL), (LS1[0], sL), ((LS1[0] + LS1[1]) / 2, lift(sL, L1)), (LS1[1], L1), (LS2[0], L1), ((LS2[0] + LS2[1]) / 2, lift(L1, L2)), (LS2[1], L2)]
    rowsR = [(0.0, sR), (RS1[0], sR), ((RS1[0] + RS1[1]) / 2, lift(sR, R1)), (RS1[1], R1), (RS2[0], R1), ((RS2[0] + RS2[1]) / 2, lift(R1, R2)), (RS2[1], R2)]
    plants = {'L': [(0.0, LS1[0]), (LS1[1], LS2[0]), (LS2[1], None)], 'R': [(0.0, RS1[0]), (RS1[1], RS2[0]), (RS2[1], None)]}
    at = {'L': L2, 'R': R2}
    rows = {'L': rowsL, 'R': rowsR}
    stanceX = {'L': .21, 'R': -.21}
    for k, (t0, t1) in enumerate(RD_PULLS):
        side = 'L' if k % 2 == 0 else 'R'
        a, b = t0 + .02, t1 - .02
        px_, py_, _ = PelvisSrc(t1)
        to = (stanceX[side] / s, py_ - .10 / s, A)
        rows[side] += [(a, at[side]), ((a + b) / 2, lift(at[side], to)), (b, to)]
        plants[side][-1] = (plants[side][-1][0], a)
        plants[side].append((b, None))
        at[side] = to
    # home: two small steps into the standing stance carried back, R first
    homeL, homeR = endStand['ankle.L'], endStand['ankle.R']
    rows['R'] += [(4.60, at['R']), (4.72, lift(at['R'], homeR)), (4.84, homeR), (RD_T, homeR)]
    rows['L'] += [(4.72, at['L']), (4.84, lift(at['L'], homeL)), (4.96, homeL), (RD_T, homeL)]
    plants['R'][-1] = (plants['R'][-1][0], 4.60)
    plants['R'].append((4.84, RD_T))
    plants['L'][-1] = (plants['L'][-1][0], 4.72)
    plants['L'].append((4.96, RD_T))
    plantList = [(side, a, b) for side in 'LR' for a, b in plants[side] if b is not None and b - a > .03]
    poleL = Channel([(0.0, stand['legPole.L']), (LS1[1], (L1[0] + .22, L1[1] - .95, .50)), (LS2[1], (L2[0] + .22, L2[1] - .95, .50)),
                     (RD_T - .30, (L2[0] + .22, L2[1] - .95, .50)), (RD_T, endStand['legPole.L'])])
    poleR = Channel([(0.0, stand['legPole.R']), (RS1[1], (R1[0] - .22, R1[1] - .95, .50)), (RS2[1], (R2[0] - .22, R2[1] - .95, .50)),
                     (RD_T - .30, (R2[0] - .22, R2[1] - .95, .50)), (RD_T, endStand['legPole.R'])])
    channels = {
        'pelvis': [(t, PelvisSrc(t)) for t in [round(.05 * i, 2) for i in range(0, int(RD_T / .05) + 1)]],
        'bend': [(t, bend(t)) for t in [round(.05 * i, 2) for i in range(0, int(RD_T / .05) + 1)]],
        'pelvisTilt': [(t, tilt(t)) for t in [round(.1 * i, 2) for i in range(0, int(RD_T / .1) + 1)]],
        'ankle.L': rows['L'], 'ankle.R': rows['R'],
        'legPole.L': [(t, poleL(t)) for t in (0.0, LS1[1], LS2[1], RD_T - .3, RD_T)], 'legPole.R': [(t, poleR(t)) for t in (0.0, RS1[1], RS2[1], RD_T - .3, RD_T)],
        'foot.L': [(0.0, stand['foot.L']), (LS1[1], (0, 8, 0)), (RD_T - .3, (0, 8, 0)), (RD_T, stand['foot.L'])],
        'foot.R': [(0.0, stand['foot.R']), (RS1[1], (0, -14, 0)), (RD_T - .3, (0, -14, 0)), (RD_T, stand['foot.R'])],
        'twist': [(0.0, 0.0), (.42, .45), (.78, .45), (1.20, 0.0), (RD_T, 0.0)],
        'head': [(0.0, (0, 0, 0)), (.42, (-.30, 0, 0)), (1.0, (-.30, 0, 0)), (1.30, (-.40, 0, 0)), (4.40, (-.40, 0, 0)),
                 (4.60, (-.10, 0, 0)), (RD_T, (0, 0, 0))],
        'neck': [(0.0, (0, 0, 0)), (.42, (-.30, 0, 0)), (1.0, (-.30, 0, 0)), (1.30, (-.90, 0, 0)),
                 (4.40, (-.90, 0, 0)), (4.60, (0, 0, 0)), (RD_T, (0, 0, 0))],
    }
    for key in ('hand.L', 'hand.R', 'armPole.L', 'armPole.R'):        # world targets of the free hands: carried back with the standing pose
        channels[key] = [(0.0, stand[key]), (RD_T, endStand[key])]
    body = Tracks(stand, channels, lag={'head': .05})
    figAt = RdFigure
    palmOn = Channel([(0.0, 0.0), (RD_GRIP_ON[0], 0.0), (RD_GRIP_ON[1], 1.0), (RD_GRIP_OFF[0], 1.0), (RD_GRIP_OFF[1], 0.0), (RD_T, 0.0)])
    K_ = T.K
    ARCH = .6
    archExt = Channel([(0.0, 0.0), (1.20, 0.0), (1.50, ARCH), (4.40, ARCH), (4.60, 0.0), (RD_T, 0.0)])

    def Pose(t):
        f = body(t)
        fig = figAt(t)
        w = palmOn(t)
        for side in LR:
            if w > 1e-4:
                point = RdHand(fig, side, t, figAt)
                palmF, palmN, curl = RdPalm(fig, side, t)
                EaseGrip(f, side, tuple(RT(T, point.x, point.y, point.z)), Smooth(w), palmF, palmN, curl)
                sign = 1 if side == 'L' else -1
                pel = PelvisSrc(t)
                f['armPole.' + side] = (pel[0] + sign * .55, pel[1] + .15, pel[2] + .45)
        f['lookW'] = 0.0
        p = T.Nest(f)
        # the upper back arches (Spine2 back over the flexed lower spine): with the arms at full reach the shoulders cannot come
        # nearer, so this is what lifts his head and face off Shunzi's (the neck joint sits a hand's width in front of the chest)
        arch = archExt(t)
        if arch > 1e-4:
            inner = p['post']

            def Post(inner=inner, arch=arch):
                inner()
                K_['Tilt'](K_['Bone']('Spine2'), x=-arch)
                K_['Update']()
            p['post'] = Post
        return p

    def Props(t):
        bendNow = bend(t)
        rifle, up = SlungBack(T, Clamp((bendNow - .15) / .7))
        return {'rifle': (rifle['origin'], rifle['axis'], up, True)}

    def Check(t):
        out = {}
        if RD_GRIP_ON[1] <= t <= RD_GRIP_OFF[0]:
            fig = figAt(t)
            for side in LR:
                p = RdHand(fig, side, t, figAt)
                out[side] = tuple(RT(T, p.x, p.y, p.z))
        return out

    def Player(t):
        pts = ShunziPoints(figAt(t))
        return {k: tuple(RT(T, v.x, v.y, v.z)) for k, v in pts.items()}
    K = T.K
    minima = {'torso': [9.0, 0.0], 'forearm': [9.0, 0.0], 'trunkClear': [9.0, 0.0]}
    debug = __import__('os').environ.get('OPENING_LUODBG')

    def Probe(t):
        """Luo against Shunzi's eye every frame (source metres -> runtime): trunk / head / legs >= 0.30 m, forearm and hand >= 0.12 m;
        and the forearms against his trunk (the axis pelvis-chest, radius 0.11). Debug numbers only (OPENING_LUODBG=1 prints one
        LUOCLEAR line a frame and the minima at the end); nothing is written to the manifest."""
        if not debug:
            return {}
        fig = figAt(t)
        eye = RT(T, fig['eye'].x, fig['eye'].y, fig['eye'].z)
        Pt = lambda role: K['Point'](K['Bone'](role))
        names = ('Pelvis', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head')
        chain = [Pt(r) for r in names]
        chain.append(chain[-1] + (chain[-1] - chain[-2]).normalized() * T.R(.12))
        near = ('', 9.0)
        for i, (a, b) in enumerate(zip(chain, chain[1:])):
            d = SegmentDistance(a, b, eye, eye) * s
            if d < near[1]:
                near = ((names + ('HeadTop',))[i] + '>' + (names + ('HeadTop',))[i + 1], d)
        torso = near[1]
        for side in LR:
            th = [Pt(side + ' Thigh'), Pt(side + ' Calf'), Pt(side + ' Foot')]
            for i, (a, b) in enumerate(zip(th, th[1:])):
                d = SegmentDistance(a, b, eye, eye) * s
                if d < near[1]:
                    near = (side + ('Thigh>Calf', 'Calf>Foot')[i], d)
            torso = near[1]
        arm = 9.0
        clear = 9.0
        P0, C0 = RT(T, fig['P'].x, fig['P'].y, fig['P'].z), RT(T, fig['C'].x, fig['C'].y, fig['C'].z)
        for side in LR:
            fa = [Pt(side + ' Forearm'), Pt(side + ' Hand'), K['GripPoint'](side)]
            arm = min(arm, min(SegmentDistance(a, b, eye, eye) for a, b in zip(fa, fa[1:])) * s)
            clear = min(clear, min(SegmentDistance(a, b, P0, C0) for a, b in zip(fa, fa[1:])) * s - .11)
        for key, value in (('torso', torso), ('forearm', arm), ('trunkClear', clear)):
            if value < minima[key][0]:
                minima[key] = [value, t]
        if debug:
            hd, sh = RTs(T, Pt('Head')), RTs(T, Pt('Spine2'))
            ey = RTs(T, eye)
            print('LUOCLEAR RD t=%.2f torso %.3f (%s) forearm %.3f trunkClear %.3f | eye (%.2f,%.2f,%.2f) head (%.2f,%.2f,%.2f) chest (%.2f,%.2f,%.2f)' % (
                t, torso, near[0], arm, clear, ey.x, ey.y, ey.z, hd.x, hd.y, hd.z, sh.x, sh.y, sh.z), flush=True)
            if t >= RD_T - 1e-6:
                print('LUOCLEAR_MIN RD', {k: [round(v[0], 3), round(v[1], 2)] for k, v in minima.items()}, flush=True)
        return {}

    def Review(t):
        fig = figAt(t)
        rifle, _ = SlungBack(T, Clamp((bend(t) - .15) / .7))
        rows_ = T.RifleProps(rifle) + SzGhost(T, fig)
        for side in LR:
            if palmOn(t) > .5:
                p = RdHand(fig, side, t, figAt)
                rows_.append(('point', tuple(RT(T, p.x, p.y, p.z)), None, .03))
        return rows_

    def EyeAt(t):
        e = figAt(t)['eye']
        return tuple(RT(T, e.x, e.y, e.z))

    def GazeAt(t):
        f = figAt(t)
        p = f['eye'] + f['g']
        return tuple(RT(T, p.x, p.y, p.z))

    def RollAt(t):
        f = figAt(t)
        return ViewRoll(RTd(*f['g']), RTd(*f['c']))
    spec = {'pose': Pose, 'props': Props, 'check': Check, 'player': Player, 'probes': Probe, 'plants': plantList,
            'reach': {'fraction': .97, 'travel': .06, 'bend': .90, 'sink': .08},
            'reviewProps': Review,
            'reviewFrames': lambda n: [0, int(n * .08), int(n * .16), int(n * .22), int(n * .28), int(n * .36), int(n * .42), int(n * .5),
                                       int(n * .62), int(n * .8), int(n * .9), n - 1]}
    spec = AReview(spec)

    def Mid(t):
        c = figAt(t)['C']
        return (PelvisSrc(t)[1] + RT(T, c.x, c.y, c.z).y) / 2
    spec['reviewViews'] = [('side', lambda t: (-3.6, Mid(t), 1.0), lambda t: (0, Mid(t), .45)),
                           ('q', lambda t: (-2.6, Mid(t) - 2.4, 2.0), lambda t: (0, Mid(t), .45)),
                           ('top', lambda t: (.02, Mid(t), 3.6), lambda t: (0, Mid(t), .1)),
                           ('fp', EyeAt, GazeAt, 75.0, RollAt)]
    spec['reviewScale'] = 3.4
    return spec


# ---- LuoHandRifle: Luo unslings the rifle, kneels in front of Shunzi, offers it, hauls him up by the strap and steps aside ------
# Root frame R_C = Luo's pelvis ground point at the end of LuoRescueDrag, his facing (-z). Shunzi (`player`) starts where that
# clip left him (lying, head bowed to his feet, 0.78 m off), looks back up at Luo, rolls back onto his belly, pushes up to all
# fours, kneels upright (eye 1.10 m), takes the rifle, is hauled to his feet (eye 1.62 m) and stands facing +z (the front trench).
HR_T = 114 / 24                        # 4.75 s
HR_HOLD = (1.9, 2.9)
HR_OFFER = (1.50, 1.75)                # the rifle turns across him and stops in front of his chest (settled a good 0.15 s before the hold loop)
HR_GRIP = 2.9                          # Shunzi's hands close on it (rifle prop hidden from 3.1 on: the director's rifle takes over)
HR_HIDE = 3.1
HR_KNEEL_LIFT = .0                     # (source m) pelvis raised over LuoKneelReach's kneel
HR_KNEEL_INSTEP = .0                   # (source m) the right instep raised over K.kneelAnkle
HR_KNEEL_LDROP = .026                  # (source m) the standing left foot is authored this far into the ground: the kneecap is 2.6 cm in it, and the grounding lift that
#                                        raises the whole body by that much would otherwise float the left foot
HR_STRAP = (3.2, 4.2)                  # Luo's left fist on Shunzi's right shoulder strap
HR_RISE = (3.3, 4.2)                   # both come up to their feet
HR_EYE = {'kneel': (0.0, 1.10, -.80), 'stand': (0.0, 1.62, -.85), 'fours': (0.0, .62, -.72)}
HR_OFFER_CENTRE = (0.0, .85, -.52)     # the rifle's centre at the offer (0.30 m off his chest), the muzzle to Shunzi's left (+x), raised 10 deg
HR_LOW_CENTRE = (0.0, 1.05, -.55)      # low carry once he is up: the muzzle forward (+z), a little to his left, 15 deg down

Meta('LuoHandRifle', HR_T, False, 'free', role='luo', rig='TengxianNra05', props=['rifle'], rootMotion=True, player=True,
     holdLoop=list(HR_HOLD),
     holdExit='pose.holdUntil: the loop lets go at that clip time and plays on through the 2.9-3.3 hand-over and the 3.3-4.2 haul to his feet',
     contacts=[{'t': HR_GRIP, 'limb': 'handsLR', 'action': 'release', 'partnerRole': 'shunzi', 'part': 'rifle'},
               {'t': HR_STRAP[0], 'limb': 'handL', 'action': 'grip', 'partnerRole': 'shunzi', 'part': 'shoulderStrapR'},
               {'t': HR_STRAP[1], 'limb': 'handL', 'action': 'release'}],
     events=[{'t': .40, 'kind': 'unslung'}, {'t': HR_HOLD[0], 'kind': 'offered'}, {'t': HR_HIDE, 'kind': 'handed'}, {'t': HR_RISE[0], 'kind': 'hauling'},
             {'t': HR_STRAP[1], 'kind': 'stood'}],
     prev=['LuoRescueDrag'], next=[],
     notes='2026-09-29: from the standing pose LuoRescueDrag ends in (rifle slung; root R_C = its root.end) Luo pulls the rifle off his back '
           'over the right shoulder into both hands, kneels on his right knee 0.75 m in front of Shunzi (who rolls back onto his belly, '
           'pushes up and kneels), holds the Hanyang across his chest height (1.9-2.9 s seamless hold loop: "还能打不？" and the nod), lets go '
           'as Shunzi\'s hands close on it (2.9-3.1 s; the `rifle` prop is hidden after 3.1 s), takes Shunzi\'s right shoulder strap in his left '
           'fist and hauls him to his feet (3.3-4.2 s), lets go and steps round to his right side (-x, 0.8 m) turning to face +z, left arm '
           'pointing down the front trench. `player`: eye, gaze, crown, chest, chestUp, pelvis, kneeL/R, heelL/R (his left/right) plus '
           'gripR (neck of the rifle), gripL (handguard), rifle (centre), rifleMuzzle (0.4 m along the bore), rifleUp (0.1 m along the sights) '
           'for the whole clip -- after 3.1 s they follow Shunzi\'s hands -- and shoulderStrapR (where the left fist closes).')


def Hr3Head(t):
    """Head roll / pitch of the rigid figure: back to Luo (gaze 45 deg up), then level."""
    return Channel([(0.0, math.radians(185)), (.50, math.radians(29.6)), (1.00, math.radians(-9.3)), (HR_T, math.radians(-9.3))])(t)


def Hr3Rigid(t, shift):
    """The rigid figure of LuoRescueDrag's end, rolled back onto his belly (.50-.95 s) and sliding away as he goes."""
    u = Smooth((t - .50) / .45)
    roll = math.pi * (1 - u)
    lift = math.radians(SZ_LOW_DEG) * (1 - u)
    dz = 1.45 - shift - .20 * Smooth((t - .50) / .50)
    return ShunziFigure(roll, lift, dz, Hr3Head(t), roll)


def Hr3Keyed(name):
    """The brief's key states of one exported point (R_C, runtime m): all fours 1.2 s, kneeling upright 1.7-3.3 s, hauled up 4.2 s."""
    E = HR_EYE
    kz = E['kneel'][2]
    rows = {
        'eye': [(1.2, E['fours']), (1.7, E['kneel']), (3.3, E['kneel']), (3.75, (0.0, 1.38, -.83)), (4.2, E['stand']), (HR_T, E['stand'])],
        'gaze': [(1.2, (0.0, .72, .275)), (1.7, (0.0, 1.10, .20)), (3.3, (0.0, 1.10, .20)), (3.75, (0.0, 1.38, .17)), (4.2, (0.0, 1.62, .15)), (HR_T, (0.0, 1.62, .15))],
        'crown': [(1.2, (0.0, .819, -.74)), (1.7, (0.0, 1.30, kz)), (3.3, (0.0, 1.30, kz)), (3.75, (0.0, 1.58, -.83)), (4.2, (0.0, 1.82, -.85)), (HR_T, (0.0, 1.82, -.85))],
        'chest': [(1.2, (0.0, .55, -1.0)), (1.7, (0.0, .82, -.78)), (3.3, (0.0, .82, -.78)), (3.75, (0.0, 1.08, -.80)), (4.2, (0.0, 1.33, -.83)), (HR_T, (0.0, 1.33, -.83))],
        'chestUp': [(1.2, (0.0, .30, -1.0)), (1.7, (0.0, .82, -.53)), (3.3, (0.0, .82, -.53)), (3.75, (0.0, 1.08, -.55)), (4.2, (0.0, 1.33, -.58)), (HR_T, (0.0, 1.33, -.58))],
        'pelvis': [(1.2, (0.0, .62, -1.35)), (1.7, (0.0, .55, -.95)), (3.3, (0.0, .55, -.95)), (3.75, (0.0, .78, -.90)), (4.2, (0.0, .95, -.85)), (HR_T, (0.0, .95, -.85))],
        'kneeL': [(1.2, (.12, .06, -1.30)), (1.7, (.12, .06, -.95)), (3.3, (.12, .06, -.95)), (3.75, (.11, .30, -.88)), (4.2, (.10, .50, -.83)), (HR_T, (.10, .50, -.83))],
        'kneeR': [(1.2, (-.12, .06, -1.30)), (1.7, (-.12, .06, -.95)), (3.3, (-.12, .06, -.95)), (3.75, (-.11, .30, -.88)), (4.2, (-.10, .50, -.83)), (HR_T, (-.10, .50, -.83))],
        'heelL': [(1.2, (.12, .15, -1.75)), (1.7, (.12, .10, -1.42)), (3.3, (.12, .10, -1.42)), (3.75, (.11, .08, -1.10)), (4.2, (.10, .06, -.85)), (HR_T, (.10, .06, -.85))],
        'heelR': [(1.2, (-.12, .15, -1.75)), (1.7, (-.12, .10, -1.42)), (3.3, (-.12, .10, -1.42)), (3.75, (-.11, .08, -1.10)), (4.2, (-.10, .06, -.85)), (HR_T, (-.10, .06, -.85))],
    }
    return Channel([(t, tuple(v)) for t, v in rows[name]])


def HrRiflePoints(T, rifle):
    """A rifle's `player` points (source metres): centre, muzzle (0.4 m along the bore), the neck (gripR) and the handguard (gripL)."""
    a = Vector(rifle['axis'])
    centre = RifleCentre(T, rifle)
    return {'rifle': centre, 'rifleMuzzle': centre + a * T.R(.4), 'gripR': Vector(rifle['origin']),
            'gripL': Vector(rifle['origin']) + a * T.R(WEAPONS['HanYang']['gripL'])}


def HrGhost(T, pts, t):
    """Shunzi as review shapes from his exported points: trunk, neck, head, thighs, shins."""
    s = T.s
    r = lambda p: tuple(RT(T, p.x, p.y, p.z))
    head = pts['eye'] - (pts['gaze'] - pts['eye']) * .07 - (pts['crown'] - pts['eye']) * .3          # the head centre sits behind and under the eye
    return [('cyl', r(pts['pelvis']), r(pts['chest']), .11 / s), ('cyl', r(pts['chest']), r(head), .05 / s), ('point', r(head), None, .08 / s),
            ('cyl', r(pts['pelvis']), r(pts['kneeL']), .07 / s), ('cyl', r(pts['pelvis']), r(pts['kneeR']), .07 / s),
            ('cyl', r(pts['kneeL']), r(pts['heelL']), .05 / s), ('cyl', r(pts['kneeR']), r(pts['heelR']), .05 / s)]


@Builder('LuoHandRifle')
def BuildLuoHandRifle(T, name):
    H, P, A, SX, SZ = T.H, T.P, T.A, T.SX, T.SZ
    s, K = T.s, T.K
    stand = LuoStand(T)
    shift = RdEndZ() + stand['pelvis'][1] * s                  # LuoRescueDrag's root.end z, runtime m (its frame): the origin of this clip
    kz, ky = K['kneelPelvisZ'], K['kneelPelvisY']
    kp = K['toeKneelPitch'] - K['toeStandPitch']
    w = WEAPONS[T.gun]
    K['Reset']()
    K['ApplyPose'](T.Nest(dict(stand)), 0.0)
    slungNom, slungUpNom = SlungRifle(T, 'back')
    K['Reset']()
    # ---- the rifle ---------------------------------------------------------------------------------------------------------
    # port arms (muzzle up over his left shoulder): he does not aim the rifle at Shunzi on the way to him
    ready = T.Rifle((-.17, -.32, P + .02), Unit((.55, -.18, .82)))
    lifted = T.Rifle((-.20, .15, P + .25), Unit((-.20, -.35, .91)))
    swung = T.Rifle((-.20, -.30, P + .22), Unit((.22, -.82, .52)))
    carry = T.Rifle(tuple(Add3(ready['origin'], (.02, -.10, -.20))), ready['axis'])
    turn = RifleAtCentre(T, RT(T, .0, .98, -.40), RTd(.05, .99, -.10))
    offer = RifleAtCentre(T, RT(T, *HR_OFFER_CENTRE), RTd(.985, .174, 0.0))
    low = RifleAtCentre(T, RT(T, *HR_LOW_CENTRE), RTd(.25, -.26, .93))
    rifleAt = RiflePath(T, [(0.0, slungNom), (.15, lifted), (.32, swung), (.50, ready), (1.20, ready), (1.45, carry), (HR_OFFER[0], turn),
                            (HR_OFFER[1], offer), (HR_STRAP[0], offer), (HR_RISE[1], low), (HR_T, low)])
    # where the two fists are on it (real metres from the butt plate): the right one up the barrel to take it off the back, at the neck
    # once it is in front, at the balance (0.60) while it turns, at the fore-end (0.95) for the offer; the left one on the handguard
    # (0.555), then at the butt end (0.12): so the hands never cross
    alongR = Channel([(0.0, .60), (.15, .60), (.32, .50), (.50, w['butt']), (1.36, w['butt']), (1.45, .60), (1.72, .95), (HR_T, .95)])
    alongL = Channel([(0.0, w['butt'] + w['gripL']), (1.30, w['butt'] + w['gripL']), (1.50, .12), (HR_T, .12)])
    onR = Channel([(0.0, 0.0), (.06, 0.0), (.20, 1.0), (HR_GRIP, 1.0), (HR_HIDE, 0.0), (HR_T, 0.0)])
    onL_rifle = Channel([(0.0, 0.0), (.30, 0.0), (.45, 1.0), (1.32, 1.0), (1.40, 0.0), (1.50, 0.0), (1.72, 1.0), (HR_GRIP, 1.0), (HR_HIDE, 0.0), (HR_T, 0.0)])
    onL_strap = Channel([(0.0, 0.0), (HR_HIDE, 0.0), (HR_STRAP[0] + .05, 1.0), (HR_STRAP[1], 1.0), (HR_STRAP[1] + .15, 0.0), (HR_T, 0.0)])
    # ---- Shunzi -----------------------------------------------------------------------------------------------------------
    keyed = {n: Hr3Keyed(n) for n in ('eye', 'gaze', 'crown', 'chest', 'chestUp', 'pelvis', 'kneeL', 'kneeR', 'heelL', 'heelR')}

    def Shunzi(t):
        """Shunzi's points at clip time t (runtime m, R_C): the rigid figure, then the brief's key states (blend .80-1.25 s)."""
        rigid = ShunziPoints(Hr3Rigid(t, shift))
        wgt = Smooth((t - .80) / .45)
        out = {k: (rigid[k].lerp(Vector(keyed[k](t)), wgt) if wgt > 0 else rigid[k]) for k in rigid}
        if HR_HOLD[0] - .2 <= t <= HR_STRAP[0]:                               # breathing: one per second, periodic over the hold loop
            breath = .004 * math.sin(Tau * (t - HR_HOLD[0]) / 1.0) * Smooth((t - (HR_HOLD[0] - .2)) / .2) \
                * (1 - Smooth((t - HR_GRIP) / (HR_STRAP[0] - HR_GRIP)))
            for k in ('eye', 'gaze', 'crown', 'chest', 'chestUp'):
                out[k] = out[k] + Vector((0, breath, 0))
        return out

    def Strap(t):
        """Where his right shoulder strap is (runtime m): the shoulder is a hand's width under and to the right of the eye."""
        return Shunzi(t)['eye'] + Vector((-.19, -.19, -.02))

    def HrUp(t):
        """The rifle's sights direction (source axes): up while he holds it low, up and back to the 10 deg raise at the offer."""
        return Vector((0, 0, 1)).lerp(Vector(RTd(0, .96, .27)), Smooth((t - HR_STRAP[0]) / (HR_RISE[1] - HR_STRAP[0]))).normalized()

    def Player(t):
        pts = Shunzi(t)
        out = {k: tuple(RT(T, v.x, v.y, v.z)) for k, v in pts.items()}
        rifle = rifleAt(t)
        rp = HrRiflePoints(T, rifle)
        out.update({'gripR': tuple(rp['gripR']), 'gripL': tuple(rp['gripL']), 'rifle': tuple(rp['rifle']), 'rifleMuzzle': tuple(rp['rifleMuzzle']),
                    'rifleUp': tuple(rp['rifle'] + HrUp(t) * T.R(.1))})
        sp = Strap(t)
        out['shoulderStrapR'] = tuple(RT(T, sp.x, sp.y, sp.z))
        return out
    # ---- Luo's body ---------------------------------------------------------------------------------------------------------
    standH, standY = stand['pelvis'][2] * s, stand['pelvis'][1] * s
    kneelH = kz * s + HR_KNEEL_LIFT
    Foot = lambda x, z: (RT(T, x, 0, z).x, RT(T, x, 0, z).y, A)
    sL, sR = stand['ankle.L'], stand['ankle.R']
    kneelL = (H + .08, ky - .58, A - HR_KNEEL_LDROP)
    kneelR = tuple(Add3(K['kneelAnkle'](-1), (0, 0, HR_KNEEL_INSTEP)))
    upL, upR = Foot(-.135, -.40), Foot(.135, -.44)              # standing in front of Shunzi (his left foot on the -x side)
    pel = [(0.0, (0.0, standH, standY)), (.50, (0.0, standH - .01, standY - .01)), (1.20, (0.0, standH - .02, standY - .02)),
           (1.45, (0.0, .60, -.06)), (1.70, (0.0, kneelH, (ky - .16) * s)), (HR_GRIP, (0.0, kneelH, (ky - .16) * s)),
           (3.30, (0.0, kneelH + .02, -.22)), (3.75, (0.0, .66, -.30)), (4.20, (0.0, standH - .04, -.38)),
           (4.42, (-.30, standH, -.55)), (4.62, (-.66, standH, -.72)), (HR_T, (-.80, standH, -.80))]
    pelvisSrc = Channel([(t, (-x / s, z / s, h / s)) for t, (x, h, z) in pel])
    bendC = Channel([(0.0, stand['bend']), (.30, .14), (.50, .12), (1.20, .12), (1.45, .40), (1.70, .52), (HR_GRIP, .52), (3.30, .70), (3.75, .45),
                     (4.20, .14), (HR_T, stand['bend'])])
    tiltC = Channel([(0.0, stand['pelvisTilt']), (1.45, (.14, 0, 0)), (1.70, (.08, 0, 0)), (HR_GRIP, (.08, 0, 0)), (3.30, (.20, 0, 0)),
                     (4.20, stand['pelvisTilt']), (HR_T, stand['pelvisTilt'])])
    turnC = Channel([(0.0, 0.0), (4.25, 0.0), (HR_T, math.pi)])

    def Stance(side, t):
        """Where his `side` foot stands when he stands at clip time t (source m): the standing stance about the pelvis, turned by the
        yaw he has then."""
        pl = pelvisSrc(t)
        off = Vector((stand['ankle.' + side][0] - stand['pelvis'][0], stand['ankle.' + side][1] - stand['pelvis'][1], 0))
        off = Quaternion((0, 0, 1), turnC(t)) @ off
        return (pl[0] + off.x, pl[1] + off.y, A)
    # the feet: (start, end, landing spot) swings; the right one back onto its knee, the left one forward; up again; round to his side
    kneelLup = (kneelL[0], kneelL[1], A)                         # the left foot comes up out of the 2.6 cm it is sunk while he kneels
    swingsL = [(1.24, 1.50, kneelL), (3.28, 3.72, kneelLup), (4.20, 4.34, None), (4.46, 4.62, None)]
    swingsR = [(1.28, 1.62, kneelR), (3.32, 3.68, upR), (4.32, 4.46, None), (4.58, 4.72, None)]
    footRows, plants = {}, []
    for side, swings, start in (('L', swingsL, sL), ('R', swingsR, sR)):
        rows, at, last = [(0.0, start)], start, 0.0
        for a, b, to in swings:
            to = to or Stance(side, b + .0)
            if a - last > .03:
                plants.append((side, last, a))
            mid = Vector(at).lerp(Vector(to), .5)
            rows += [(a, at), ((a + b) / 2, (mid.x, mid.y, mid.z if (Vector(at) - Vector(to)).xy.length < .02 else A + .08)), (b, to)]
            at, last = to, b
        rows.append((HR_T, at))
        plants.append((side, last, HR_T))
        footRows[side] = rows
    # knee poles: keyed while he kneels and stands up; from the strap's release on they turn with him (each knee a step in front of its foot
    # and out to its side, in the frame of his yaw then): keys that carry a pole round the pelvis in a single step spun the thigh 71 deg
    ankleAt = {'L': Channel([(t, v) for t, v in footRows['L']]), 'R': Channel([(t, v) for t, v in footRows['R']])}

    def TurnPole(side, t):
        a = Vector(ankleAt[side](t))
        r = Quaternion((0, 0, 1), turnC(t)) @ Vector(((.22 if side == 'L' else -.22), -.95, 0.0))
        return (a.x + r.x, a.y + r.y, .50)
    turnStart = 4.20
    samples = [round(turnStart + .0417 * i, 4) for i in range(0, int((HR_T - turnStart) / .0417) + 1)] + [HR_T]
    blend = lambda t, keyed, turned: tuple(Vector(keyed).lerp(Vector(turned), Smooth((t - turnStart) / .12)))
    poleL = [(0.0, stand['legPole.L']), (1.24, stand['legPole.L']), (1.50, (kneelL[0] + .30, -1.2, .9)), (turnStart, (kneelL[0] + .30, -1.2, .9))]         + [(t, blend(t, (kneelL[0] + .30, -1.2, .9), TurnPole('L', t))) for t in samples[1:]]
    poleR = [(0.0, stand['legPole.R']), (1.28, stand['legPole.R']), (1.62, tuple(K['kneelPole'](-1))), (3.32, tuple(K['kneelPole'](-1))),
             (3.68, (upR[0] - .22, upR[1] - .95, .50)), (turnStart, (upR[0] - .22, upR[1] - .95, .50))]         + [(t, blend(t, (upR[0] - .22, upR[1] - .95, .50), TurnPole('R', t))) for t in samples[1:]]
    times = [round(.05 * i, 2) for i in range(0, int(HR_T / .05) + 1)] + [HR_T]
    body = Tracks(stand, {
        'pelvis': [(t, tuple(pelvisSrc(t))) for t in times],
        'bend': [(t, bendC(t)) for t in times],
        'pelvisTilt': [(t, tuple(tiltC(t))) for t in times],
        'ankle.L': footRows['L'], 'ankle.R': footRows['R'],
        'legPole.L': poleL, 'legPole.R': poleR,
        'foot.L': [(0.0, stand['foot.L']), (1.24, stand['foot.L']), (1.50, (0, 12, 0)), (4.20, (0, 12, 0)), (HR_T, stand['foot.L'])],
        'foot.R': [(0.0, stand['foot.R']), (1.28, stand['foot.R']), (1.62, (kp, 0, 0)), (3.32, (kp, 0, 0)), (3.68, (0, -12, 0)), (4.20, (0, -12, 0)),
                   (HR_T, stand['foot.R'])],
        'head': [(0.0, (0, 0, 0)), (HR_T, (0, 0, 0))],
    }, lag={'head': .05})
    # (the planted windows: where the grounding lift has settled -- it moves while the knee goes down and while he comes up)
    plants = [('L', 0.0, 1.24), ('L', 1.80, 3.28), ('L', 3.80, 4.20), ('L', 4.62, HR_T), ('R', 0.0, 1.28), ('R', 1.80, 3.28), ('R', 3.80, 4.30), ('R', 4.72, HR_T)]
    plantSides = {'L': [(a, b) for sd, a, b in plants if sd == 'L'], 'R': [(a, b) for sd, a, b in plants if sd == 'R']}
    kneePlants = [('R', 1.72, 3.05)]

    def Pose(t):
        f = body(t)
        rifle = rifleAt(t)
        palms = T.Palms(rifle['axis'])
        wR = onR(t)
        if wR > 1e-4:
            EaseGrip(f, 'R', T.Along(rifle, alongR(t)), Smooth(wR), palms['R'][0], palms['R'][1], .95)
            f['armPole.R'] = (-(SX + .50), .10, P - .05)
        wL = onL_rifle(t)
        wS = onL_strap(t)
        if wL > 1e-4:
            # from the re-grip at the butt end (1.55 s) the left palm goes on the stock from above (fingers forward over it): with the palm
            # under it the left forearm sat on the +-180 deg edge of its twist and the breathing tipped it over (the hold-loop seam: 145 deg)
            pf, pn = (tuple(-Vector(palms['L'][0])), tuple(-Vector(palms['L'][1]))) if t >= 1.45 else (palms['L'][0], palms['L'][1])
            EaseGrip(f, 'L', T.Along(rifle, alongL(t)), Smooth(wL), pf, pn, .85)
        elif wS > 1e-4:
            sp = Strap(t)
            palmF, palmN, _ = Grab(RTd(-1, .2, 0), RTd(0, -1, 0), .9)
            EaseGrip(f, 'L', tuple(RT(T, sp.x, sp.y, sp.z)), Smooth(wS), palmF, palmN, .95)
            f['armPole.L'] = (SX + .45, .10, P - .05)
        e = Shunzi(t)['eye']
        f['look'] = tuple(RT(T, e.x, e.y, e.z))
        f['lookW'] = .7 * Smooth((t - .30) / .3) * (1 - Smooth((t - 4.25) / .25))
        psi = turnC(t)
        PlantedFeet(f, t, turnC, plantSides)
        if psi:
            f = Turned(f, psi)
        if HR_HOLD[0] - .3 <= t <= HR_STRAP[0]:                               # breathing, one per second: periodic over 1.9-2.9
            b = math.sin(Tau * (t - HR_HOLD[0]) / 1.0) * Smooth((t - (HR_HOLD[0] - .3)) / .3) * (1 - Smooth((t - HR_GRIP) / (HR_STRAP[0] - HR_GRIP)))
            f['bend'] += .012 * b
            f['shrug'] += .015 * b
        return T.Nest(f)

    def Props(t):
        rifle = rifleAt(t)
        upv = Vector((0, 0, 1))
        if t < .5:
            actual, actualUp = SlungBack(T, 0.0)
            wgt = 1 - Smooth(t / .12)
            origin = Vector(rifle['origin']).lerp(Vector(actual['origin']), wgt)
            axis = Vector(rifle['axis']).slerp(Vector(actual['axis']), wgt) if wgt < 1 else Vector(actual['axis'])
            rifle = T.Rifle(tuple(origin), tuple(axis))
            upv = Vector((0, 0, 1)).lerp(Vector(actualUp), 1 - Smooth(t / .4))
        return {'rifle': (rifle['origin'], rifle['axis'], tuple(upv), t < HR_HIDE)}

    def Check(t):
        out = {}
        rifle = rifleAt(t)
        if .45 <= t <= 1.32:
            out['L'] = T.Along(rifle, alongL(t))
        if 1.72 <= t <= HR_GRIP:
            out['L'] = T.Along(rifle, alongL(t))
        if .20 <= t <= HR_GRIP:
            out['R'] = T.Along(rifle, alongR(t))
        if HR_STRAP[0] + .05 <= t <= HR_STRAP[1]:
            sp = Strap(t)
            out['L'] = tuple(RT(T, sp.x, sp.y, sp.z))
        return out

    def EyeAt(t):
        return tuple(RT(T, *Shunzi(t)['eye']))

    def GazeAt(t):
        return tuple(RT(T, *Shunzi(t)['gaze']))

    def RollAt(t):
        pts = Shunzi(t)
        return ViewRoll(RTd(*(pts['gaze'] - pts['eye'])), RTd(*(pts['crown'] - pts['eye'])))
    minima = {'torso': [9.0, 0.0], 'forearm': [9.0, 0.0]}
    debug = __import__('os').environ.get('OPENING_LUODBG')

    def Probe(t):
        """Luo against Shunzi's eye every frame (debug print only): trunk / head / legs and forearm / hand."""
        if not debug:
            return {}
        e = Shunzi(t)['eye']
        eye = RT(T, e.x, e.y, e.z)
        Pt = lambda role: K['Point'](K['Bone'](role))
        names = ('Pelvis', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head')
        chain = [Pt(r) for r in names]
        chain.append(chain[-1] + (chain[-1] - chain[-2]).normalized() * T.R(.12))
        torso, near = 9.0, ''
        for i, (a, b) in enumerate(zip(chain, chain[1:])):
            d = SegmentDistance(a, b, eye, eye) * s
            if d < torso:
                torso, near = d, (names + ('HeadTop',))[i]
        for side in LR:
            th = [Pt(side + ' Thigh'), Pt(side + ' Calf'), Pt(side + ' Foot')]
            for i, (a, b) in enumerate(zip(th, th[1:])):
                d = SegmentDistance(a, b, eye, eye) * s
                if d < torso:
                    torso, near = d, side + ('Thigh', 'Calf')[i]
        arm = 9.0
        for side in LR:
            fa = [Pt(side + ' Forearm'), Pt(side + ' Hand'), K['GripPoint'](side)]
            arm = min(arm, min(SegmentDistance(a, b, eye, eye) for a, b in zip(fa, fa[1:])) * s)
        for key, value in (('torso', torso), ('forearm', arm)):
            if value < minima[key][0]:
                minima[key] = [value, t]
        print('LUOCLEAR HR t=%.2f torso %.3f (%s) forearm %.3f | eye (%.2f,%.2f,%.2f)' % (t, torso, near, arm, e.x, e.y, e.z), flush=True)
        if t >= HR_T - 1e-6:
            print('LUOCLEAR_MIN HR', {k: [round(v[0], 3), round(v[1], 2)] for k, v in minima.items()}, flush=True)
        if __import__('os').environ.get('LUODBG_LOW'):
            import bpy
            dg = bpy.context.evaluated_depsgraph_get()
            best = (9.0, None, None)
            for o in K['meshes']:
                ev = o.evaluated_get(dg)
                mesh = ev.to_mesh()
                groups = {g.index: g.name for g in o.vertex_groups}
                for v in mesh.vertices:
                    z = (ev.matrix_world @ v.co).z
                    if z < best[0]:
                        best = (z, o.name, groups.get(max(v.groups, key=lambda g: g.weight).group) if v.groups else None)
                ev.to_mesh_clear()
            print('LUOLOW t=%.2f z %.3f mesh %s bone %s' % (t, best[0], best[1], best[2]), flush=True)
        return {}
    spec = {'pose': Pose, 'props': Props, 'check': Check, 'player': Player, 'plants': plants, 'kneePlants': kneePlants, 'probes': Probe,
            'reach': {'fraction': .92, 'travel': .10, 'bend': .60, 'sink': 0.0},
            'reviewProps': lambda t: T.RifleProps(rifleAt(t)) + HrGhost(T, Shunzi(t), t),
            'reviewFrames': lambda n: [0, int(n * .05), int(n * .10), int(n * .18), int(n * .27), int(n * .36), int(n * .42), int(n * .5),
                                       int(n * .6), int(n * .7), int(n * .8), int(n * .9), n - 1]}
    spec = AReview(spec)
    spec['reviewViews'] = [('side', (-3.4, -.5, 1.0), (0, -.5, .8)), ('q', (-2.6, -3.6, 1.9), (0, -.5, .8)), ('top', (.02, -.5, 3.6), (0, -.5, .1)),
                           ('fp', EyeAt, GazeAt, 75.0, RollAt)]
    spec['reviewScale'] = 3.4
    return spec


# =================================================================================
# which rigs bake which clip (manifest `rigs`). Every 2026-09-23 clip is baked only on the
# rigs its role can wear (contract §5.1: comrade/interpreter/He/Liu/yaowa = NRA02, Luo =
# NRA05, ijaA = IJA02, ijaB = IJA01, ijaC/ijaD = IJA01 or IJA02); the legacy 0922 clips stay
# on all five so the old director keeps working. A clip missing on a rig is not playable on
# it (the runtime falls back to native animation), so the director must cast accordingly.
# =================================================================================
IJA_BOTH = ['TengxianIja01', 'TengxianIja02']
RIGS_BY_ROLE = {'ijaA': ['TengxianIja02'], 'ijaB': ['TengxianIja01'], 'ijaC': IJA_BOTH, 'ijaD': IJA_BOTH,
                'luo': ['TengxianNra05']}
SHARED_IJA = {'IjaReadyRifle'}          # ijaA and ijaB both ready their rifles
for _name, _row in CLIPS.items():
    if _row.get('legacy'):
        continue
    _row.setdefault('rigs', IJA_BOTH if _name in SHARED_IJA else RIGS_BY_ROLE.get(_row.get('role'), ['TengxianNra02']))


# Bake order (2026-09-28): a clip takes its arm seeds only from a `prev` that bakes before it, and IjaButtStrikeCollar
# continues IjaHaulForearmUnder (the 2026-09-27 vault/haul clips are declared after it): they bake just before it.
def _BakeBefore(names, anchor):
    rows = list(CLIPS.items())
    moved, rest = [r for r in rows if r[0] in names], [r for r in rows if r[0] not in names]
    at = [name for name, _ in rest].index(anchor)
    CLIPS.clear()
    CLIPS.update(rest[:at] + moved + rest[at:])


_BakeBefore(('IjaVaultTimberIn', 'IjaVaultTimberOut', 'IjaHaulForearmUnder'), 'IjaButtStrikeCollar')
