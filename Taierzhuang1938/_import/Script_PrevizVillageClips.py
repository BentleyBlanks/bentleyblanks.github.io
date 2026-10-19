"""Placeholder village clips for the FirstLevel0610 blockout previz (06-10; 12-18 reuses the crouch / prone / sit / hug).

Same module contract as _import/Script_OpeningStoryboardClips.py (CLIPS / STAGES / PROPS / CONTACT_POINTS /
PARTNER_SOURCES / GHOST_BONES / BindCaptives / MakeClips), run by the opening frame loop through
_import/Script_PrevizVillageBake.py, baked once on the shared-skeleton reference body TengxianNra02 (every Tengxian
body, IJA ones included, is the same TengxianHumanoidV1 skeleton with the same bone names, so the one file plays on any;
the white-box editor's villager / child / officer bodies are that skeleton too). The pose toolkit is the opening
library's own, loaded through _import/Script_PrevizCareClips.py (which adds the 06 lying bases and the in-place
walking foot); nothing there changes.

Authoring space (as the opening library): Blender metres on the rig's source scale, +Z up, forward -Y, the character's
own left +X, ground z = 0, actor root at the origin. Runtime = source x scale; the three.js actor frame is (-X, Z, Y):
a Blender point (x, y, z) is runtime (-x, z, y) x scale. Pairing numbers below are RUNTIME metres in Blender axes
(+X his left, -Y ahead, +Z up) and converted with RT(); the manifest `stages` are runtime three.js (+x right, -z front).

Placeholder grade: key poses and contact moments right, no clipping, feet not visibly sliding. Clip names all start
with `Vil`; the contract table (Contract_FirstLevel0610_v3_Assets.md section 2) says where each one plays.
Nier is the editor's child body (scale 0.62): VilBiteWrist / VilHugLegs / VilCowerWhimper / VilCrouchHold /
VilSitEdge are authored on the full-size rig; the stage notes give the pairing numbers at scale 0.62 where it matters.
"""
import math, os, runpy
from pathlib import Path
from mathutils import Vector

_here = Path(os.environ['OPENING_PROJECT']) / '_import'
_pv = runpy.run_path(str(_here / 'Script_PrevizCareClips.py'), run_name='PrevizVillageBase')
_care = _pv['_care']
_base = _pv['_base']
Toolkit, Anim, Tracks, Channel = _base['Toolkit'], _base['Anim'], _base['Tracks'], _base['Channel']
KneelFlat, Standing, IjaABase, IjaReadyBase = _base['KneelFlat'], _base['Standing'], _base['IjaABase'], _base['IjaReadyBase']
Clamp, Smooth, Unit, Add3, Lerp3, Mix = _base['Clamp'], _base['Smooth'], _base['Unit'], _base['Add3'], _base['Lerp3'], _base['Mix']
Bump, SlungRifle, BodyFrame, CrouchBase = _base['Bump'], _base['SlungRifle'], _base['BodyFrame'], _base['CrouchBase']
RaHidden, _Rot = _base['RaHidden'], _base['_Rot']
WrPath, Turned = _base['WrPath'], _base['Turned']        # feet under a travelling, turning pelvis; the whole pose turned (VilPushVat V2)
GHOST_BONES, GHOST_LINKS = _base['GHOST_BONES'], _base['GHOST_LINKS']
GaitFoot, SetGrip, KneelLean = _pv['GaitFoot'], _pv['SetGrip'], _pv['KneelLean']
LieBase, Breathe = _care['LieBase'], _care['Breathe']
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
PLACEHOLDER = '20261019 FirstLevel0610 previz'


def BindCaptives(base):
    """No legacy clips here."""


def Meta(name, duration, loop, hold='free', **extra):
    row = {'duration': duration, 'loop': loop, 'weaponHold': hold, 'rig': 'TengxianNra02', 'rootMotion': False,
           'placeholder': PLACEHOLDER}
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


def Rtm(T, v):
    """Source metres -> runtime (for the printed pairing numbers)."""
    return tuple(round(c * T.s, 3) for c in v) if isinstance(v, (tuple, list, Vector)) else round(v * T.s, 3)


def Sig(side):
    return 1 if side == 'L' else -1


def Other(side):
    return 'R' if side == 'L' else 'L'


# ---------------------------------------------------------------------------------------------------------------
# hands
# ---------------------------------------------------------------------------------------------------------------
def World(f, side, pos, pole, palmF=(0, -.2, -1), palmN=None, curl=.5):
    """A free hand on a world wrist point (the body-frame hand of Standing switched off)."""
    f['hand.' + side] = tuple(pos)
    f['armPole.' + side] = tuple(pole)
    f['palmF.' + side] = Unit(palmF)
    f['palmN.' + side] = Unit(palmN or (-Sig(side), 0, 0))
    f['curl.' + side] = curl
    f['handRel.' + side] = None
    f.pop('grip.' + side, None)
    f.pop('gripW.' + side, None)


def Rel(f, side, off, pole=None, palmF=None, palmN=None, curl=.5):
    """A free hand in the torso frame (left, back, up) from its shoulder."""
    f['handRel.' + side] = tuple(off)
    f['handRelW.' + side] = 1.0
    if pole is not None:
        f['poleRel.' + side] = tuple(pole)
    if palmF is not None:
        f['palmF.' + side] = Unit(palmF)
    if palmN is not None:
        f['palmN.' + side] = Unit(palmN)
    f['curl.' + side] = curl
    f.pop('grip.' + side, None)
    f.pop('gripW.' + side, None)


def Grip(f, side, point, palmF, palmN, curl=.9, pole=None, w=1.0):
    """A hand pinned on a world point (finger roots on it)."""
    f['grip.' + side] = tuple(point)
    f['gripW.' + side] = w
    f['hand.' + side] = tuple(point)
    f['palmF.' + side] = Unit(palmF)
    f['palmN.' + side] = Unit(palmN)
    f['curl.' + side] = curl
    if pole is not None:
        f['armPole.' + side] = tuple(pole)
    f['handRel.' + side] = None


def Hang(T, f, side):
    """The hand hanging at the thigh (Stand's)."""
    s = T.Stand()
    World(f, side, s['hand.' + side], s['armPole.' + side], s['palmF.' + side], s['palmN.' + side], .45)


# ---------------------------------------------------------------------------------------------------------------
# rifle (copied from the PrevizIja module: that file is not loaded here)
# ---------------------------------------------------------------------------------------------------------------
def Rifle(T, origin, axis):
    r = T.Rifle(origin, axis, 'Type38' if T.gun == 'Type38' else None)
    r['tip'] = tuple(Vector(r['origin']) + Vector(r['axis']) * T.R(TIP_M))
    return r


def RifleFromTip(T, tip, axis):
    return Rifle(T, tuple(Vector(tip) - Vector(axis).normalized() * T.R(TIP_M)), axis)


def RifleFromButt(T, butt, axis):
    return Rifle(T, tuple(Vector(butt) + Vector(axis).normalized() * T.R(BUTT_M)), axis)


def BlendRifle(T, a, b, w):
    return Rifle(T, Lerp3(a['origin'], b['origin'], w), Unit(Lerp3(a['axis'], b['axis'], w)))


def RifleKeys(T, rows):
    def At(t):
        if t <= rows[0][0]:
            return rows[0][1]
        for (t0, a), (t1, b) in zip(rows, rows[1:]):
            if t <= t1:
                return BlendRifle(T, a, b, Smooth((t - t0) / max(1e-6, t1 - t0)))
        return rows[-1][1]
    return At


def RifleUp(axis):
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
    for s in sides:
        f['grip.' + s], f['gripW.' + s] = rifle['grip' + s], w
        f['palmF.' + s], f['palmN.' + s], f['curl.' + s] = palms[s][0], palms[s][1], curlR if s == 'R' else curlL
        f['handRel.' + s] = None
    return f


def LowReady(T):
    H, P = T.H, T.P
    return Rifle(T, (-(H + .02), -.13, P + .22), Unit((.16, -.90, -.40)))


def SlungTrack(T, side='back'):
    r, up = SlungRifle(T, side)
    return RifleTrack(r, up=up)


def SlungReview(T, side='back'):
    return lambda t: RifleReview(T, SlungRifle(T, side)[0])


def Views(cx=0.0, cy=-.3, cz=.7, far=3.4, h=1.0):
    return [('side', (cx - far, cy, cz + h * .3), (cx, cy, cz)), ('q', (cx - far * .68, cy - far * .82, cz + h), (cx, cy, cz)),
            ('front', (cx - .3, cy - far, cz + .2), (cx, cy, cz))]


def Combine(*fns):
    return lambda t: [row for fn in fns for row in (fn(t) or [])]


def Box(c, size, yaw=0):
    return ('box', tuple(c), tuple(size), yaw)


# ---------------------------------------------------------------------------------------------------------------
# feet
# ---------------------------------------------------------------------------------------------------------------
def WalkFeet(T, f, ph, speedRt, cycle, lift=.085, back=False, spread=.03, duty=None):
    """In-place walking feet (PrevizCare GaitFoot); back: walking backwards (the foot travels forward in stance)."""
    H = T.H
    stride = T.R(speedRt * _pv['DUTY'] * cycle) * (-1 if back else 1)
    for s in LR:
        p = ph if s == 'L' else (ph + .5) % 1.0
        y, z, pitch = GaitFoot(T, p, stride, lift)
        f['ankle.' + s] = (Sig(s) * (H + spread), y, z)
        f['foot.' + s] = (pitch * (.3 if back else 1.0), Sig(s) * 4, 0)
        f['legPole.' + s] = (Sig(s) * (H + .12), y - 1.0, .55)
    return f


RUN_DUTY = .5


def RunFoot(T, ph, stride, lift=.16):
    A = T.A
    heel = lambda deg: .105 * math.sin(math.radians(max(0.0, deg)))
    if ph < RUN_DUTY:
        u = ph / RUN_DUTY
        y = -stride / 2 + stride * u
        pitch = -8 * (1 - Smooth(u / .2)) + 40 * Smooth((u - .55) / .45)
        return y, A + heel(pitch) + .008 * (1 - Smooth(u / .2)), pitch
    u = (ph - RUN_DUTY) / (1 - RUN_DUTY)
    y = stride / 2 - stride * Smooth(u)
    pitch = 40 * (1 - Smooth(u / .4)) - 8 * Smooth((u - .6) / .4)
    return y, A + heel(pitch) * (1 - u) + lift * math.sin(math.pi * u) + .008 * Smooth((u - .7) / .3), pitch


def RunFeet(T, f, ph, speedRt, cycle, spread=.02):
    H = T.H
    stride = T.R(speedRt * RUN_DUTY * cycle)
    for s in LR:
        p = ph if s == 'L' else (ph + .5) % 1.0
        y, z, pitch = RunFoot(T, p, stride)
        f['ankle.' + s] = (Sig(s) * (H + spread), y, z)
        f['foot.' + s] = (pitch, Sig(s) * 3, 0)
        f['legPole.' + s] = (Sig(s) * (H + .10), y - 1.0, .60)
    return f


def Steps(T, side, start, steps, lift=.08, ground=None, pitchOn=None):
    """Ankle key rows for one foot: planted between steps, each (t0, t1, (x, y)) swings in an arc onto the ground at the
    new place (ground(x, y) -> z, default flat). -> (rows, plants, pitchRows)."""
    A = T.A
    G = ground or (lambda x, y: 0.0)
    Z = lambda p: G(p[0], p[1]) + A
    at = (start[0], start[1])
    rows = [(0.0, (at[0], at[1], Z(at)))]
    pitch = [(0.0, pitchOn(at) if pitchOn else 0.0)]
    plants, last = [], 0.0
    for t0, t1, to in steps:
        if t0 - last > .04:
            plants.append((side, last, t0))
        rows.append((t0, (at[0], at[1], Z(at))))
        pitch.append((t0, pitchOn(at) if pitchOn else 0.0))
        mid = ((at[0] + to[0]) / 2, (at[1] + to[1]) / 2)
        rows.append(((t0 + t1) / 2, (mid[0], mid[1], max(Z(at), Z(to)) + lift)))
        pitch.append(((t0 + t1) / 2, (pitchOn(at) if pitchOn else 0.0) * .5 + (pitchOn(to) if pitchOn else 0.0) * .5 + 8))
        rows.append((t1, (to[0], to[1], Z(to))))
        pitch.append((t1, pitchOn(to) if pitchOn else 0.0))
        at, last = (to[0], to[1]), t1
    return rows, plants, pitch, at


def Pole(T, side, ankle, ahead=1.0, up=.55):
    return (ankle[0] + Sig(side) * .10, ankle[1] - ahead, ankle[2] + up)


# ---------------------------------------------------------------------------------------------------------------
# pairing numbers (RUNTIME metres, Blender axes, the named anchor's frame)
# ---------------------------------------------------------------------------------------------------------------
THRUST_T = .50                        # VilIjaBayonetThrust: the point goes in = VilStabbedFall's stab
THRUST_GRIP = (-.15, -.40, .98)       # the right fist at the full lunge
THRUST_AXIS = (.02, -.995, -.09)
BELLY_IN_M = .12                      # the point stops this far inside the victim's front (his root to the belly front .12)
DRAG_CYCLE = 1.2
DRAG_SPEED = .7                       # referenceSpeedMps of both drag loops (the pair moves toward the IJA's back)
DRAG_VICTIM = (.15, -1.05)            # VilDraggedByArm root in the IJA frame (x, y): ahead 1.05, .15 to his left; yaw 0 (she lies head toward him)
DRAG_WRIST_V = (-.16, .85, .50)       # the victim's right wrist, victim frame (she lies on her back, head toward +Y)
PIN_HOLD = (0.0, 2.0)                 # VilIjaPinBayonet hold loop; the bite at PIN_BITE_T
PIN_BITE_T = 2.0
PIN_GRIPR = (-.22, -.42, .68)         # the pressing right fist (runtime, IJA frame)
PIN_AXIS = (.96, -.22, -.08)          # the rifle across to his left-forward
BITE_T = .50                          # VilBiteWrist: the mouth closes on the wrist
NIER_SCALE = .62
BITE_POINT = (0.0, -.55, .70 / NIER_SCALE)   # full-size rig: the wrist she bites; at scale .62 it is .34 ahead, .70 up
HUG_AHEAD = .55                       # VilHugLegs: the legs she hugs, full-size rig (.34 at scale .62)
HUG_HEIGHT = .50
YANK_T = 1.40
YANKER_BEHIND = .75                   # VilNraYankBack root behind the reacher's
CARRY_CYCLE = 1.2
CARRY_SPEED = .9
RIDER_PELVIS = (0.0, .22, .98)        # VilRideOnBack pelvis in the carrier frame (behind .22, up .98)
SEAT_H = .90                          # VilSitEdge: the cart tail edge height; the edge runs left-right under the root
HOLE_H = .40                          # VilCrawlHole: the dog hole's clear height; the hole 0.4-1.0 m ahead of the root
CRAWL_M = 1.5                         # root motion of VilCrawlHole
# VilHandsUpClimbOut (V2, 2026-10-20): the white-box cellar (Data_EditorBlockoutFirstLevel0610Space L0610_GENG.cellar) -- a 1.6 m
# square shaft 2.0 m deep with STRAIGHT walls, the mouth 1.2 m. The root is on the rim ground; the wall he climbs (the
# pit's near wall face) is PIT_WALL_BACK behind the root, the pit floor from there back to PIT_WALL_BACK + 1.6.
PIT_DEPTH = 2.0
PIT_WALL_BACK = .10
PIT_FLOOR_W, PIT_MOUTH_W = 1.6, 1.2
PIT_HOLES = (.50, 1.00)               # two foot holes dug in the wall face, this high above the pit floor (right foot, then left)
PIT_RIM_GRIP = .15                    # both hands this far onto the rim ground (from the wall face)
PIT_STAND_BACK = .45                  # he starts standing on the pit floor, his pelvis this far behind the wall face
WALL_H, WALL_FACE, WALL_THICK = 2.2, .35, .30   # VilIjaClimbWall: the wall face .35 m ahead, top 2.2 m, .30 thick
CHARGE_M = 1.2                        # VilIjaShoulderCharge root motion
WAVE_M = .8                           # VilNraWaveCharge root motion
GATE_M = .55                          # VilIjaGateSmash: the gate plane ahead
DOOR_M, BOLT_H, BOLT_TRAVEL = .45, 1.25, .25    # VilUnboltDoor: the door plane, the bolt height, the bolt slides this far left
# VilPushVat (V2, 2026-10-20), laid out on the white box (L0610_GENG: backVat (98, 504), backDoor x 98 in the south wall z 506,
# the leaf 0.15 inside it, w 1.2, bolt 1.25 up): Geng stands WEST of the vat facing EAST (the root; +X world = clip forward),
# the vat centre VAT_AHEAD ahead; he shoves it VAT_MOVE straight ahead (east: (98, 504) -> (99.7, 504), clear of the doorway),
# turns right (south) and walks to the door, slides the bolt toward the hinge, grabs the leaf and PULLS it open INTO the yard
# (the white box's BackDoorLeafOpen: hinged on the west jamb, swung 90 deg north) while he backs out of its way.
# Door numbers are in the root frame: right = south (+z world), ahead = east (+x world).
VAT_AHEAD, VAT_R, VAT_H, VAT_MOVE = 1.05, .40, .90, 1.70
VAT_HAND_H = .80                      # both palms on the vat's near face just under the rim
VAT_PUSH_BACK = .60                   # his pelvis this far behind the vat's near face while he drives it
DOOR_RIGHT = 1.85                     # the leaf plane (505.85) this far right of the root
DOOR_HINGE_AHEAD, DOOR_LEAF_M = .45, 1.15      # the hinge (the west jamb, x 97.4) this far ahead; the leaf runs further ahead from it
BOLT_AHEAD = .95                      # the bolt handle on the leaf (x 97.9), 1.25 up; it slides BOLT_TRAVEL toward the hinge (to his right at the door)
DOOR_STAND = (1.40, 1.05)             # (right, ahead) where he stands to unbolt, facing right (yaw -90: south)
DOOR_GRAB = (1.40, 1.35)              # (right, ahead) a side step toward the free edge: where he stands as both hands take the leaf
DOOR_EDGE_GRIP, DOOR_EDGE_H = 1.08, 1.30       # the left hand hooks the leaf's free edge this far from the hinge, this high
DOOR_FACE_GRIP, DOOR_FACE_H = .78, 1.25        # the right palm on the leaf's face this far from the hinge, this high (lets go as the leaf comes)
DOOR_SWING_DEG = 90.0                 # the leaf swings this far into the yard (BackDoorLeafOpen: along z 504.6-505.75 at x 97.45)
DOOR_HANDS_OFF_DEG = 60.0             # about where the left hand lets go; the leaf swings on to 90
DOOR_END = (.55, .90)                 # (right, ahead) his pelvis at the end: inside, 0.4 m east of the open leaf's tip, facing the doorway


def VictimInIja(T):
    """VilStabbedFall's root in the IJA frame (runtime Blender axes): the bayonet tip at the thrust = the belly front."""
    g, a = Vector(THRUST_GRIP), Vector(THRUST_AXIS).normalized()
    tip = g + a * TIP_M
    return (tip.x, tip.y - BELLY_IN_M), tip


def DragWristInIja():
    vx, vy = DRAG_VICTIM
    wx, wy, wz = DRAG_WRIST_V
    return (wx + vx, wy + vy, wz)            # same yaw: her frame is only shifted


def PinWrist(T):
    """The IJA's right wrist (runtime, IJA frame) while pressing: the point Nier bites."""
    return (PIN_GRIPR[0] + .02, PIN_GRIPR[1] + .04, PIN_GRIPR[2] + .02)


def NierInIja(T):
    """Nier's root (runtime, IJA frame) and yaw: she faces the IJA's centre line from his right, the bite point under her
    mouth .34 m ahead of her root (BITE_POINT at scale .62)."""
    w = PinWrist(T)
    ahead = -BITE_POINT[1] * NIER_SCALE
    return (w[0] - ahead, w[1]), 90.0      # facing +X (his left) from his right side: yaw +90 (turned left)


# ---------------------------------------------------------------------------------------------------------------
# stages (manifest: runtime three.js, x right, z front = -y)
# ---------------------------------------------------------------------------------------------------------------
def Actor(clip, xBl, yBl, yawDeg, **extra):
    row = {'rig': 'TengxianNra02', 'clip': clip, 'x': round(-xBl, 3), 'z': round(yBl, 3), 'yawDeg': yawDeg}
    row.update(extra)
    return row


def DefineStages(T):
    v, tip = VictimInIja(T)
    STAGES['bayonetVictim'] = {
        'anchor': 'ija', 'notes': 'VilIjaBayonetThrust + VilStabbedFall (09-3): the villager stands %.2f m ahead of the IJA, %.2f m '
        'to his right, facing him; the point goes into his belly at %.2f s of both clips (they start together); the tip at the '
        'thrust is %.2f m up.' % (-v[1], -v[0], THRUST_T, tip.z),
        'actors': {'ija': Actor('VilIjaBayonetThrust', 0, 0, 0), 'victim': Actor('VilStabbedFall', v[0], v[1], 180)}}
    w = DragWristInIja()
    STAGES['dragByArm'] = {
        'anchor': 'ija', 'notes': 'VilIjaDragByArm + VilDraggedByArm (09-4): both %.1f s loops, same phase, referenceSpeedMps %.1f; '
        'the pair moves toward the IJA\'s BACK (he walks backwards). The woman lies on her back, her root %.2f m ahead of the IJA root, '
        '%.2f m to his left, same yaw (her head toward him, her feet away); her right wrist, which both his hands hold, is %.2f m ahead of his root, '
        '%.2f m up.' % (DRAG_CYCLE, DRAG_SPEED, -DRAG_VICTIM[1], DRAG_VICTIM[0], -w[1], w[2]),
        'actors': {'ija': Actor('VilIjaDragByArm', 0, 0, 0, referenceSpeedMps=DRAG_SPEED),
                   'victim': Actor('VilDraggedByArm', DRAG_VICTIM[0], DRAG_VICTIM[1], 0, referenceSpeedMps=DRAG_SPEED)}}
    n, yaw = NierInIja(T)
    pw = PinWrist(T)
    STAGES['pinBite'] = {
        'anchor': 'ija', 'notes': 'VilIjaPinBayonet + VilBiteWrist (09-7): the IJA kneels astride the man on the ground pressing the '
        'rifle down; his right wrist is %.2f m to his right, %.2f m ahead, %.2f m up. Nier (child body, scale %.2f) stands at his '
        'right side facing his centre line (yaw +90), her root %.2f m right / %.2f m ahead of his, and starts %.1f s after him: her '
        'bite (%.1f s) lands on the wrist at his %.1f s, the end of his hold loop; his exit (scream, the hand flung up) follows.'
        % (-pw[0], -pw[1], pw[2], NIER_SCALE, -n[0], -n[1], PIN_BITE_T - BITE_T, BITE_T, PIN_BITE_T),
        'actors': {'ija': Actor('VilIjaPinBayonet', 0, 0, 0),
                   'nier': Actor('VilBiteWrist', n[0], n[1], yaw, offsetS=round(PIN_BITE_T - BITE_T, 3), scale=NIER_SCALE)}}
    STAGES['yankBack'] = {
        'anchor': 'reacher', 'notes': 'VilReachPinned + VilNraYankBack (08-5): Geng on hands and knees at the trench lip reaching '
        'forward; Yaowa kneels %.2f m behind him facing the same way, grabs his belt at %.2f s of both clips (same start) and '
        'hauls: both roots end about 0.6 m further back (manifest root.end: Geng 0.66, Yaowa 0.58), sat back on the heels in the trench.' % (YANKER_BEHIND, YANK_T),
        'actors': {'reacher': Actor('VilReachPinned', 0, 0, 0), 'yanker': Actor('VilNraYankBack', 0, YANKER_BEHIND, 0)}}
    STAGES['carryOnBack'] = {
        'anchor': 'carrier', 'notes': 'VilNraCarryOnBack + VilRideOnBack (07): same root, same yaw, same phase, both %.1f s loops, '
        'referenceSpeedMps %.1f. The rider\'s pelvis rides %.2f m behind and %.2f m above the carrier root, his chest on the '
        'carrier\'s back, arms over the shoulders, knees forward round the carrier\'s hips (the carrier\'s hands under them).'
        % (CARRY_CYCLE, CARRY_SPEED, RIDER_PELVIS[1], RIDER_PELVIS[2]),
        'actors': {'carrier': Actor('VilNraCarryOnBack', 0, 0, 0, referenceSpeedMps=CARRY_SPEED),
                   'rider': Actor('VilRideOnBack', 0, 0, 0, referenceSpeedMps=CARRY_SPEED)}}
    STAGES['clingHem'] = {
        'anchor': 'clinger', 'notes': 'VilClingHem (09-6): the one she hangs on (any standing clip) is 0.45 m ahead facing the same '
        'way; her fists are on his coat at the small of his back, 0.95 m up (full-size rig; at scale .62 the fists are 0.59 m up '
        'and 0.28 m ahead -- put the child 0.17 m closer).',
        'actors': {'clinger': Actor('VilClingHem', 0, 0, 0), 'front': {'rig': 'TengxianNra02', 'clip': None, 'x': 0.0, 'z': -.45, 'yawDeg': 0}}}
    STAGES['hugLegs'] = {
        'anchor': 'nier', 'notes': 'VilHugLegs (10-5): Geng stands facing her %.2f m ahead (full-size rig); the child body at scale '
        '%.2f reaches %.2f m, so place him %.2f m ahead of her root; her arms close round his legs %.2f m up at 1.0 s (scaled %.2f).'
        % (HUG_AHEAD, NIER_SCALE, HUG_AHEAD * NIER_SCALE, HUG_AHEAD * NIER_SCALE, HUG_HEIGHT, HUG_HEIGHT * NIER_SCALE),
        'actors': {'nier': Actor('VilHugLegs', 0, 0, 0, scale=NIER_SCALE),
                   'geng': {'rig': 'TengxianNra02', 'clip': None, 'x': 0.0, 'z': -round(HUG_AHEAD * NIER_SCALE, 3), 'yawDeg': 180}}}
    STAGES['sitEdge'] = {'anchor': 'seat', 'seatHeightM': SEAT_H,
                         'notes': 'VilSitEdge: the root on the ground under the pelvis; the edge (cart tail) runs left-right through '
                                  'the root at %.2f m, the cart body behind (+z). No grounding (groundWeight 0): feet dangle.' % SEAT_H}
    STAGES['dogHole'] = {'anchor': 'crawler', 'holeHeightM': HOLE_H, 'rootMotionM': CRAWL_M,
                         'notes': 'VilCrawlHole: the hole (%.2f m clear) spans 0.4-1.0 m ahead of the start root; he crawls %.1f m '
                                  'forward and comes up into a squat (manifest root.end).' % (HOLE_H, CRAWL_M)}
    STAGES['cellarPit'] = {'anchor': 'climber', 'pitDepthM': PIT_DEPTH, 'wallBehindM': PIT_WALL_BACK, 'floorM': PIT_FLOOR_W, 'mouthM': PIT_MOUTH_W,
                           'footHolesM': list(PIT_HOLES), 'rimGripM': PIT_RIM_GRIP,
                           'startPelvis': {'x': 0.0, 'z': round(PIT_WALL_BACK + PIT_STAND_BACK, 3), 'y': -1.18},
                           'end': {'x': 0.0, 'z': -.38, 'yawDeg': 0},
                           'notes': 'VilHandsUpClimbOut (V2): the root is on the rim ground; the wall he climbs (the pit\'s near wall, STRAIGHT) '
                                    'is %.2f m behind the root, the pit floor %.1f m down from there back to %.2f m behind (the %.1f m shaft; '
                                    'the %.1f m mouth is the lid opening). Place the root %.2f m outside the pit edge, facing away from the pit. '
                                    'He starts standing on the floor, pelvis %.2f m behind the root (root.start), toes the right foot into a '
                                    'hole %.2f m up the wall, both hands on the wall, pushes up, hands over the rim %.2f m onto the ground, '
                                    'left foot into the hole %.2f m up, heaves his chest over, right knee onto the rim, left foot up, stands '
                                    '%.2f m ahead of the root with both hands up (root.end) and holds.'
                                    % (PIT_WALL_BACK, PIT_DEPTH, PIT_WALL_BACK + PIT_FLOOR_W, PIT_FLOOR_W, PIT_MOUTH_W, PIT_WALL_BACK,
                                       PIT_WALL_BACK + PIT_STAND_BACK, PIT_HOLES[0], PIT_RIM_GRIP, PIT_HOLES[1], .38)}
    STAGES['villageWall'] = {'anchor': 'climber', 'wallHeightM': WALL_H, 'wallFaceM': WALL_FACE, 'wallThickM': WALL_THICK,
                             'notes': 'VilIjaClimbWall: the wall face %.2f m ahead of the root, %.2f m high, %.2f m thick; he lands '
                                      '%.2f m ahead of the root (root.end).' % (WALL_FACE, WALL_H, WALL_THICK, WALL_FACE + WALL_THICK + .40)}
    STAGES['gate'] = {'anchor': 'ija', 'gateM': GATE_M, 'notes': 'VilIjaGateSmash: the gate plane %.2f m ahead; butt strikes 0.45 / 0.95 s, kick 1.6 s.' % GATE_M}
    STAGES['door'] = {'anchor': 'opener', 'doorM': DOOR_M, 'boltHeightM': BOLT_H,
                      'notes': 'VilUnboltDoor: the door plane %.2f m ahead, the bolt handle %.2f m up near the centre; it slides %.2f m '
                               'to his left (1.3 s), the push (1.7 s) swings the door away.' % (DOOR_M, BOLT_H, BOLT_TRAVEL)}
    STAGES['vatDoor'] = {'anchor': 'geng', 'vatRadiusM': VAT_R, 'vatHeightM': VAT_H, 'vatMoveM': VAT_MOVE,
                         'vatStart': {'x': 0.0, 'z': -VAT_AHEAD}, 'vatEnd': {'x': 0.0, 'z': -round(VAT_AHEAD + VAT_MOVE, 3)},
                         'pushedEnd': {'x': 0.0, 'z': -round(VAT_AHEAD + VAT_MOVE - VAT_R - VAT_PUSH_BACK, 3), 'yawDeg': 0},
                         'doorPlaneRightM': DOOR_RIGHT, 'doorHinge': {'x': DOOR_RIGHT, 'z': -DOOR_HINGE_AHEAD}, 'doorLeafM': DOOR_LEAF_M,
                         'bolt': {'x': round(DOOR_RIGHT - .03, 3), 'z': -BOLT_AHEAD, 'y': BOLT_H, 'travelM': BOLT_TRAVEL,
                                  'slidTo': {'x': round(DOOR_RIGHT - .03, 3), 'z': -round(BOLT_AHEAD - BOLT_TRAVEL, 3)}},
                         'standAtDoor': {'x': DOOR_STAND[0], 'z': -DOOR_STAND[1], 'yawDeg': -90},
                         'doorGrab': {'x': DOOR_GRAB[0], 'z': -DOOR_GRAB[1], 'yawDeg': -90},
                         'doorOpensInward': True, 'doorSwingDeg': DOOR_SWING_DEG, 'handsOffDeg': DOOR_HANDS_OFF_DEG,
                         'doorOpenTip': {'x': round(DOOR_RIGHT - DOOR_LEAF_M, 3), 'z': -DOOR_HINGE_AHEAD},
                         'end': {'x': DOOR_END[0], 'z': -DOOR_END[1], 'yawDeg': -90},
                         'notes': 'VilPushVat (V2): root frame = Geng\'s start (x right, -z ahead); put the root %.2f m WEST of the vat centre '
                                  'facing EAST (world: root (%.2f, 504), yaw toward +x). The vat (radius %.2f, %.2f m high) starts %.2f m ahead '
                                  'and is shoved straight ahead %.1f m (0.4-2.8 s) to %.2f m ahead (world (98, 504) -> (99.7, 504)); his pelvis '
                                  'follows to %.2f m ahead (pushedEnd). He turns right (south) and walks to the door: the leaf plane is %.2f m right '
                                  'of the root (z 505.85), the hinge %.2f m ahead (x 97.4), the leaf %.2f m long from it; he stands at '
                                  '(right %.2f, ahead %.2f) facing right, the right hand on the bolt (right %.2f, ahead %.2f, %.2f up; grab 5.15 s), '
                                  'slides it %.2f m toward the hinge (open 5.55 s), side-steps to (right %.2f, ahead %.2f), hooks the leaf\'s free '
                                  'edge with the left hand and puts the right palm on it (5.75 s) and PULLS it INTO the yard: the leaf swings about '
                                  'the hinge toward the root side (x decreasing) while he backs out of its sweep (3 steps); the hands let go at '
                                  'about %.0f deg (6.3 s), the leaf swings on to %.0f deg (6.6 s) and lies at doorOpenTip (the BackDoorLeafOpen '
                                  'block: x 97.45, z 504.6-505.75); root.end at (right %.2f, ahead %.2f), yaw -90: inside, east of the open leaf, '
                                  'facing the doorway.'
                                  % (VAT_AHEAD, 98 - VAT_AHEAD, VAT_R, VAT_H, VAT_AHEAD, VAT_MOVE, VAT_AHEAD + VAT_MOVE,
                                     VAT_AHEAD + VAT_MOVE - VAT_R - VAT_PUSH_BACK, DOOR_RIGHT, DOOR_HINGE_AHEAD, DOOR_LEAF_M,
                                     DOOR_STAND[0], DOOR_STAND[1], DOOR_RIGHT - .03, BOLT_AHEAD, BOLT_H, BOLT_TRAVEL, DOOR_GRAB[0], DOOR_GRAB[1],
                                     DOOR_HANDS_OFF_DEG, DOOR_SWING_DEG, DOOR_END[0], DOOR_END[1])}


PROPS['grenade'] = {'notes': 'VilIjaHelmetGrenadeLob: Type 91 grenade in the right fist (centre, axis = fuze cap direction, up); flies '
                    'into the pit 1.5 m ahead / 1.5 m down after the release (1.2 s), hidden from 1.7 s.'}
PROPS['weapon'] = {'notes': 'The IJA / NRA rifle: origin = gripR (wrist of the stock), axis = muzzle direction, up.'}


# ---------------------------------------------------------------------------------------------------------------
# metadata
# ---------------------------------------------------------------------------------------------------------------
Meta('VilCrouchHold', 3.0, True, role='villager', scaleNote='Nier at .62 too',
     notes='09 Nier behind the firewood stack, villagers crouching: squatting on the heels, knees together, both arms wrapped round '
           'the shins below the knees, the head down between them; a slow breathing loop.')
Meta('VilDuckProne', 2.0, False, role='villager', holdLoop=[1.3, 2.0],
     events=[{'t': .45, 'kind': 'kneesDown'}, {'t': 1.0, 'kind': 'flat'}],
     notes='07-4 the plane overhead: from standing he throws himself down -- knees (0.45 s), hands on the ground, flat on his face '
           '(1.0 s), both hands clasped over the back of his head by 1.3 s; 1.3-2.0 s is a trembling hold loop.')
Meta('VilSitEdge', 2.4, True, role='nier', stage='sitEdge', scaleNote='Nier at .62: the seat is then .56 m high',
     notes='07 Nier on the cart tail: sitting on a %.2f m edge, hands on the edge beside the hips, the legs hanging and swinging '
           'alternately forward and back (one swing each a loop), looking down at her feet. groundWeight 0 (nothing on the ground).' % SEAT_H)
Meta('VilPanicRun', .7, True, role='villager', referenceSpeedMps=3.0,
     notes='08 villagers fleeing, 08-5 Nier running: a hunched panic run in place (referenceSpeedMps 3.0, one stride a loop), the '
           'arms flailing out of time with the legs, the head ducked.')
Meta('VilCrawlHole', 3.0, False, role='nier', stage='dogHole', rootMotion=True,
     events=[{'t': .3, 'kind': 'crawlStart'}, {'t': 2.3, 'kind': 'crawlEnd'}, {'t': 3.0, 'kind': 'squatUp'}],
     notes='09-2 the dog hole: from prone, a hands-and-knees belly crawl %.1f m forward (0.3-2.3 s; the back stays under %.2f m), '
           'then up onto the haunches into a squat (3.0 s). Root motion: the pelvis ends %.1f m ahead.' % (CRAWL_M, HOLE_H, CRAWL_M))
Meta('VilHandsUpClimbOut', 5.0, False, role='villager', stage='cellarPit', rootMotion=True, holdLoop=[4.2, 5.0],
     events=[{'t': .45, 'kind': 'handsOnWall'}, {'t': .85, 'kind': 'footHole'}, {'t': 1.3, 'kind': 'handsOnRim'}, {'t': 1.85, 'kind': 'footHole'},
             {'t': 2.85, 'kind': 'kneeOnRim'}, {'t': 4.0, 'kind': 'onRim'}, {'t': 4.2, 'kind': 'handsUp'}],
     notes='09-3 the family out of the cellar (V2: the %.1f m straight-walled shaft): he stands on the pit floor %.2f m from the wall, '
           'hands half raised; both palms onto the wall (0.45 s), the right foot toed into the hole %.2f m up (0.85 s), pushes up, both '
           'hands over the rim (1.3 s), the left foot into the hole %.2f m up (1.85 s), heaves his chest over the rim, the right knee onto '
           'the rim (2.85 s), the left foot up (3.35 s), stands (4.0 s) and raises both hands (4.2 s); 4.2-5.0 s is a breathing hold loop, '
           'hands up. Root motion: root.start on the pit floor %.2f m behind the root, root.end %.2f m ahead on the rim.'
           % (PIT_DEPTH, PIT_STAND_BACK, PIT_HOLES[0], PIT_HOLES[1], PIT_WALL_BACK + PIT_STAND_BACK, .38))
Meta('VilStabbedFall', 2.4, False, role='villager', stage='bayonetVictim', terminal=True,
     contacts=[{'t': THRUST_T, 'limb': 'belly', 'action': 'stabbed', 'partnerRole': 'ija', 'part': 'bayonet'}],
     events=[{'t': THRUST_T, 'kind': 'stabbed'}, {'t': 1.15, 'kind': 'knees'}, {'t': 1.9, 'kind': 'groundImpact'}],
     notes='09-3 the man: standing, hands half raised, the bayonet goes into his belly at %.2f s: he folds over it, hands to the '
           'wound, the knees go (1.15 s), he topples onto his left side (1.9 s) and lies still; the last frame is the corpse.' % THRUST_T)
Meta('VilDraggedByArm', DRAG_CYCLE, True, role='villager', stage='dragByArm', referenceSpeedMps=DRAG_SPEED,
     notes='09-4 the wife: on her back, the right arm hauled up over her head toward the IJA, sliding head first; the heels kick '
           'and scrape at the ground, the left hand claws at the ground and at the gripped arm. In place, one kick each a loop.')
Meta('VilKneelCrawlToPit', 2.4, True, role='villager', referenceSpeedMps=.35,
     notes='09-4 the old woman: crawling forward on her knees (in place, two knee steps a loop, referenceSpeedMps 0.35), the right '
           'hand on the ground, the left arm clutching a bundle to her chest, the head down.')
Meta('VilCowerWhimper', 2.0, True, role='nier', scaleNote='Nier at .62',
     notes='09-5 Nier whimpering: a deep squat, both hands cupped over the mouth, shivering (a fast tremor on the trunk and '
           'shoulders), the head pulled down; a loop.')
Meta('VilUnboltDoor', 2.6, False, role='nier', stage='door',
     events=[{'t': .6, 'kind': 'boltGrab'}, {'t': 1.3, 'kind': 'boltOpen'}, {'t': 1.7, 'kind': 'doorPush'}],
     notes='09-5 Nier at the door: standing, the right hand reaches up to the bolt (%.2f m up, 0.6 s), slides it %.2f m to her left '
           '(1.3 s), then both hands push the door (1.7 s) with a step forward; ends leaning into the open door.' % (BOLT_H, BOLT_TRAVEL))
Meta('VilClingHem', 2.0, True, role='nier', stage='clingHem', scaleNote='Nier at .62',
     notes='09-6 Nier clinging: standing behind the man ahead, both fists in his coat at the small of his back, the body hung back '
           'from the fists (weight on the heels, trunk leaning back), head down; a tugging breathing loop.')
Meta('VilBiteWrist', 1.6, False, role='nier', stage='pinBite', holdLoop=[1.3, 1.6], scaleNote='Nier at .62',
     contacts=[{'t': BITE_T, 'limb': 'mouth', 'action': 'bite', 'partnerRole': 'ija', 'part': 'wristR'}],
     events=[{'t': BITE_T, 'kind': 'bite'}, {'t': .75, 'kind': 'shake'}, {'t': 1.05, 'kind': 'shake'}],
     notes='09-7 Nier bites: lunges forward and down, the mouth closes on the wrist %.2f m ahead, %.2f m up (full-size rig; '
           '%.2f / %.2f at scale .62) at %.2f s, shakes the head twice, hangs on; the hands grab the forearm.'
           % (-BITE_POINT[1], BITE_POINT[2], -BITE_POINT[1] * NIER_SCALE, BITE_POINT[2] * NIER_SCALE, BITE_T))
Meta('VilHugLegs', 2.0, False, role='nier', stage='hugLegs', holdLoop=[1.2, 2.0], scaleNote='Nier at .62',
     events=[{'t': 1.0, 'kind': 'hug'}],
     notes='10-5 Nier hugs Geng\'s legs: two quick steps forward, drops onto both knees and throws both arms round the legs %.2f m '
           'ahead at %.2f m up (1.0 s), the face pressed against them; 1.2-2.0 s is a sobbing hold loop.' % (HUG_AHEAD, HUG_HEIGHT))
Meta('VilPushVat', 6.8, False, role='geng', stage='vatDoor', rootMotion=True,
     events=[{'t': .4, 'kind': 'handsOnVat'}, {'t': 2.8, 'kind': 'vatMoved'}, {'t': 5.15, 'kind': 'boltGrab'}, {'t': 5.55, 'kind': 'boltOpen'},
             {'t': 5.75, 'kind': 'doorGrab'}, {'t': 6.3, 'kind': 'handsOff'}, {'t': 6.6, 'kind': 'doorOpen'}],
     notes='10-6 Geng (V2, laid out on the white box): both palms on the vat %.2f m ahead (0.4 s), bent low he drives it STRAIGHT AHEAD '
           '%.1f m with quick shuffling steps (0.4-2.8 s), straightens, turns right (south) and walks to the door (3.1-4.9 s), the right hand '
           'to the bolt (5.15 s), slides it %.2f m toward the hinge (5.55 s), a side step to the leaf\'s free edge, both hands on it (5.75 s) '
           'and he PULLS the door into the yard, backing out of its sweep in three steps; the hands let go at about %.0f deg (6.3 s), the leaf '
           'swings on to %.0f deg (6.6 s); he stands inside beside the open leaf facing the doorway. Root motion: root.end at (right %.2f, '
           'ahead %.2f), yaw -90 (stage vatDoor).' % (VAT_AHEAD, VAT_MOVE, BOLT_TRAVEL, DOOR_HANDS_OFF_DEG, DOOR_SWING_DEG, DOOR_END[0], DOOR_END[1]))
Meta('VilReachPinned', 2.4, False, role='geng', stage='yankBack', rootMotion=True,
     events=[{'t': YANK_T, 'kind': 'yanked'}, {'t': 2.1, 'kind': 'down'}],
     notes='08-5 Geng: on hands and knees at the lip, the chest over it, the right arm thrust forward and up shouting (0.4-1.3 s); '
           'hauled back by the belt at %.2f s: the pelvis flies back, he lands sitting on his heels / half fallen (2.1 s). '
           'Root motion: root.end is about 0.65 m behind.' % YANK_T)
Meta('VilNraYankBack', 2.4, False, role='yaowa', stage='yankBack', rootMotion=True, slungRifle=True, weaponSlung=True, hold='track', props=['weapon'],
     contacts=[{'t': 1.1, 'limb': 'handR', 'action': 'grip', 'partnerRole': 'reacher', 'part': 'belt'}, {'t': YANK_T, 'limb': 'handR', 'action': 'yank'}],
     events=[{'t': 1.1, 'kind': 'grabBelt'}, {'t': YANK_T, 'kind': 'yank'}, {'t': 2.1, 'kind': 'down'}],
     notes='08-5 Yaowa: kneeling behind Geng, both hands reach and grip his belt (1.1 s), the heave at %.2f s throws himself back '
           'onto his seat (2.1 s), the hands let go as they land (1.75 s). Rifle on the back. Root motion: root.end about 0.6 m behind.' % YANK_T)
Meta('VilNraCarryOnBack', CARRY_CYCLE, True, role='bearer', stage='carryOnBack', referenceSpeedMps=CARRY_SPEED, hold='track', props=['weapon'],
     notes='07 the evacuation: walking bent forward under a man on his back (in place, referenceSpeedMps %.1f, two steps a loop), '
           'both hands hooked under the rider\'s knees at his hips. Rifle slung from the right shoulder (weapon track).' % CARRY_SPEED)
Meta('VilRideOnBack', CARRY_CYCLE, True, role='wounded', stage='carryOnBack', referenceSpeedMps=CARRY_SPEED,
     notes='07 the wounded man carried: chest on the carrier\'s back, arms over his shoulders hanging down his chest, knees forward '
           'round his hips, the head drooping on his shoulder; bobs with the carrier\'s steps. groundWeight 0.')
Meta('VilNraWaveCharge', 1.6, False, role='squadLeader', rootMotion=True, hold='track', props=['weapon'],
     events=[{'t': .45, 'kind': 'up'}, {'t': .75, 'kind': 'wave'}],
     notes='10-1 the squad leader: crouched behind cover, rifle low in the right hand; springs up (0.45 s), the left arm sweeps '
           'forward over the head (0.75 s) and he goes forward two running steps. Root motion: the pelvis ends %.1f m ahead, '
           'mid stride (hand on to a run).' % WAVE_M)
Meta('VilIjaBayonetThrust', 1.4, False, 'track', role='ija', stage='bayonetVictim', props=['weapon'], weaponState='twoHand',
     contacts=[{'t': THRUST_T, 'limb': 'blade', 'action': 'stab', 'partnerRole': 'victim', 'part': 'belly'}, {'t': .95, 'limb': 'blade', 'action': 'release'}],
     events=[{'t': THRUST_T, 'kind': 'thrust'}, {'t': .95, 'kind': 'pullOut'}],
     notes='09-3: from guard the left foot lunges and the rifle drives forward, the point into the belly of the man %.2f m ahead at '
           '%.2f s; held 0.2 s, wrenched out (0.95 s), back to guard.' % (-VictimInIja(None)[0][1], THRUST_T))
Meta('VilIjaDragByArm', DRAG_CYCLE, True, 'track', role='ija', stage='dragByArm', props=['weapon'], weaponState='slungBack', weaponSlung=True,
     referenceSpeedMps=DRAG_SPEED,
     notes='09-4: walking backwards in place (referenceSpeedMps %.1f), bent and leaning back, both hands on the wrist of the woman '
           'on the ground ahead (stage dragByArm). Rifle on the back.' % DRAG_SPEED)
Meta('VilIjaHelmetGrenadeLob', 2.0, False, 'track', role='ija', props=['grenade', 'weapon'], weaponState='slungBack', weaponSlung=True,
     events=[{'t': .55, 'kind': 'knock'}, {'t': 1.2, 'kind': 'release'}],
     notes='09-4: standing at the pit edge, rifle on the back; the right fist knocks the grenade\'s fuze on the helmet (0.55 s), '
           'the arm swings back and lobs it forward-down into the pit (release 1.2 s; `grenade` track flies to 1.5 m ahead, 1.5 m '
           'down, hidden from 1.7 s), a half step forward with it.')
Meta('VilIjaBayonetLiftFling', 2.2, False, 'track', role='ija', props=['weapon'], weaponState='twoHand',
     events=[{'t': .5, 'kind': 'stab'}, {'t': 1.1, 'kind': 'lift'}, {'t': 1.5, 'kind': 'fling'}],
     notes='09-4: the bayonet driven down into the bundle on the ground 1.1 m ahead (0.5 s), hooked up to chest height (1.1 s) and '
           'flung off the point to his left (1.5 s); back to low ready. No baby prop.')
Meta('VilIjaPissStand', 3.0, False, 'track', role='ija', props=['weapon'], weaponState='slungBack', weaponSlung=True, holdLoop=[0.0, 2.0],
     holdExit='pose.holdUntil: plays 2.0-3.0 s (hands to the belt, a half turn of the head over the left shoulder).',
     events=[{'t': 2.0, 'kind': 'done'}, {'t': 2.6, 'kind': 'lookBack'}],
     notes='09-5 the sentry: standing (back to the yard: the director turns the root), both hands at the crotch, the body swaying '
           'a little; 0-2.0 s is the hold loop. Exit: the hands come up to the belt and fasten (2.0-2.6 s), the head turns over '
           'his left shoulder (2.6-3.0 s). Rifle on the back.')
Meta('VilIjaPinBayonet', 3.0, False, 'track', role='ija', stage='pinBite', props=['weapon'], weaponState='twoHand', holdLoop=list(PIN_HOLD),
     holdExit='pose.holdUntil at or before %.1f s: 2.0-3.0 s is the bite exit (the right hand flung up, the scream, reared back).' % PIN_BITE_T,
     contacts=[{'t': PIN_BITE_T, 'limb': 'wristR', 'action': 'bitten', 'partnerRole': 'nier', 'part': 'mouth'}],
     events=[{'t': PIN_BITE_T, 'kind': 'bitten'}, {'t': 2.15, 'kind': 'scream'}],
     notes='09-7: kneeling astride the man on the ground, both hands pressing the rifle down across him (the right fist %.2f m up), '
           'straining with a tremor; 0-2.0 s hold loop. At %.1f s the right wrist is bitten: the hand flies up and back, the head '
           'back in a scream, the trunk rears back, the rifle left in the left hand; held from 2.6 s.' % (PIN_GRIPR[2], PIN_BITE_T))
Meta('VilIjaShoulderCharge', 1.4, False, 'track', role='ija', props=['weapon'], weaponState='twoHand', rootMotion=True,
     notes='09-7: bursts out of the doorway, the right shoulder leading, three driving steps; the rifle held across the chest. '
           'Root motion: the pelvis ends %.1f m ahead, mid stride.' % CHARGE_M)
Meta('VilIjaGateSmash', 2.4, False, 'track', role='ija', stage='gate', props=['weapon'], weaponState='twoHand',
     events=[{'t': .45, 'kind': 'buttHit'}, {'t': .95, 'kind': 'buttHit'}, {'t': 1.6, 'kind': 'kick'}],
     notes='10-4: at the gate %.2f m ahead: the rifle swings muzzle-up and the butt slams the gate twice (0.45, 0.95 s), then a '
           'front kick with the right foot (1.6 s), back to the stance.' % GATE_M)
Meta('VilIjaClimbWall', 3.4, False, 'track', role='ija', stage='villageWall', props=['weapon'], weaponState='slungBack', weaponSlung=True, rootMotion=True,
     events=[{'t': .5, 'kind': 'gripTop'}, {'t': 1.5, 'kind': 'pulledUp'}, {'t': 2.1, 'kind': 'astride'}, {'t': 3.2, 'kind': 'landed'}],
     notes='10-5: the %.1f m wall %.2f m ahead: a step and a jump, both hands on the top (0.5 s), feet against the face, pull up '
           '(1.5 s), the right leg over, astride the top (2.1 s), the left leg over, hangs on the far side, lets go at 2.9 s and drops (landed 3.2 s), '
           'stands. Rifle on the back. Root motion: root.end %.2f m ahead. groundWeight 0 while off the ground.' % (WALL_H, WALL_FACE, WALL_FACE + WALL_THICK + .40))
Meta('VilIjaShoutPoint', 2.0, True, 'track', role='ija', props=['weapon'], weaponState='lowRight',
     notes='09-3 the squad leader, 10 the officer: rifle low in the right hand, the left arm pointing straight ahead at shoulder '
           'height, the head thrust forward shouting -- two jabs of the arm and trunk a loop.')


# ===============================================================================================================
# squats and crouches (villagers, Nier)
# ===============================================================================================================
def Squat(T, pelvisZ=.33, kneeOut=.06, forward=.02):
    """Sitting on the heels: feet flat, knees up and a little apart, the trunk folded forward over them."""
    H, A = T.H, T.A
    f = Standing(T)
    f.update({'pelvis': (0, .10 + forward, pelvisZ), 'pelvisTilt': (.55, 0, 0), 'bend': .55, 'lean': 0.0, 'twist': 0.0, 'shrug': .06,
              'neck': (.05, 0, 0), 'head': (.10, 0, 0),
              'ankle.L': (H + kneeOut, -.06, A), 'ankle.R': (-(H + kneeOut), -.04, A),
              'legPole.L': (H + kneeOut + .30, -1.1, .70), 'legPole.R': (-(H + kneeOut + .30), -1.1, .70),
              'foot.L': (0, 12, 0), 'foot.R': (0, -12, 0)})
    return f


SQUAT_VIEWS = Views(cy=-.15, cz=.45, far=2.8, h=.8)


@Builder('VilCrouchHold')
def BuildCrouchHold(T, name):
    D = 3.0
    H = T.H
    base = Squat(T, pelvisZ=.31, kneeOut=.02)
    base.update({'bend': .70, 'head': (.35, 0, 0), 'neck': (.15, 0, 0)})
    # arms wrapped round the shins just below the knees: wrists cross in front of the shins
    shinL = (H + .02 - .02, -.30, .40)
    shinR = (-(H + .02) + .02, -.31, .38)

    def Pose(t):
        f = dict(base)
        b = math.sin(Tau * t / D)
        f['bend'] += .02 * b
        f['shrug'] += .02 * b
        f['pelvis'] = Add3(base['pelvis'], (0, 0, .004 * b))
        World(f, 'R', (shinL[0] - .06, shinL[1] - .05, shinL[2] - .02), (-(T.SX + .45), -.30, .30), (.9, -.2, -.3), (.1, -.5, -.85), .85)
        World(f, 'L', (shinR[0] + .06, shinR[1] - .02, shinR[2] + .06), (T.SX + .45, -.30, .30), (-.9, -.2, -.3), (-.1, -.5, -.85), .85)
        return T.Nest(f)
    return {'pose': Pose, 'plants': [('L', 0, D), ('R', 0, D)], 'reviewViews': SQUAT_VIEWS, 'reviewScale': 2.0,
            'reviewFrames': lambda n: [0, n // 2]}


@Builder('VilCowerWhimper')
def BuildCowerWhimper(T, name):
    D = 2.0
    base = Squat(T, pelvisZ=.34, kneeOut=.03)
    base.update({'bend': .50, 'head': (.25, 0, 0), 'neck': (.10, 0, 0), 'shrug': .14})

    def Pose(t):
        f = dict(base)
        sh = math.sin(Tau * t * 7 / D) * Bump(t, 0.0, D)         # the shiver (an integer count of cycles a loop)
        f['bend'] += .015 * sh
        f['shrug'] += .025 * sh
        f['lean'] = .02 * math.sin(Tau * t / D)
        f['head'] = (.25 + .03 * sh, 0, .04 * math.sin(Tau * t * 3 / D))
        Rel(f, 'L', (.00, -.11, .30), (.45, .00, -.10), (-.3, -.5, .80), (.5, -.85, .1), .60)
        Rel(f, 'R', (-.00, -.12, .29), (-.45, .00, -.10), (.3, -.5, .80), (-.5, -.85, .1), .60)
        return T.Nest(f)
    return {'pose': Pose, 'plants': [('L', 0, D), ('R', 0, D)], 'reviewViews': SQUAT_VIEWS, 'reviewScale': 2.0,
            'reviewFrames': lambda n: [0, n // 3]}


# ===============================================================================================================
# VilDuckProne: standing -> flat on the face, hands over the head
# ===============================================================================================================
def ProneKeys(T, py):
    """The flat body: pelvis py behind the root, trunk forward (-Y) face down, legs behind."""
    H = T.H
    return {'pelvis': (0, py, T.R(.21)), 'pelvisTilt': (1.45, 0, 0), 'bend': .0, 'lean': 0.0, 'twist': 0.0, 'neck': (-.15, 0, 0),
            'head': (-.40, 0, .55), 'shrug': 0.0,
            'ankle.L': (H + .06, py + .82, T.R(.085)), 'ankle.R': (-(H + .08), py + .82, T.R(.085)),
            'legPole.L': (H + .25, py + .40, -.15), 'legPole.R': (-(H + .25), py + .40, -.15),
            'toeDir.L': Unit((.25, .85, -.45)), 'toeDir.R': Unit((-.30, .85, -.45))}


@Builder('VilDuckProne')
def BuildDuckProne(T, name):
    D = 2.0
    H, A, P, SX = T.H, T.A, T.P, T.SX
    stand = Standing(T, bend=.10)
    prone = ProneKeys(T, .30)
    kneel = {'pelvis': (0, .12, .44), 'pelvisTilt': (.55, 0, 0), 'bend': .55}
    body = Tracks(stand, {
        'pelvis': [(0.0, stand['pelvis']), (.15, Add3(stand['pelvis'], (0, 0, -.04))), (.45, kneel['pelvis']), (.75, (0, .24, .30)), (1.0, prone['pelvis'])],
        'pelvisTilt': [(0.0, stand['pelvisTilt']), (.45, kneel['pelvisTilt']), (.75, (1.10, 0, 0)), (1.0, prone['pelvisTilt'])],
        'bend': [(0.0, .10), (.45, .55), (.75, .30), (1.0, 0.0)],
        'neck': [(0.0, (0, 0, 0)), (.45, (.10, 0, 0)), (1.0, prone['neck'])],
        'head': [(0.0, (.10, 0, 0)), (.45, (.30, 0, 0)), (1.0, prone['head'])],
        'ankle.L': [(0.0, stand['ankle.L']), (.20, stand['ankle.L']), (.45, (H + .04, .15, .07)), (1.0, prone['ankle.L'])],
        'ankle.R': [(0.0, stand['ankle.R']), (.20, stand['ankle.R']), (.45, (-(H + .05), .18, .07)), (1.0, prone['ankle.R'])],
        'legPole.L': [(0.0, stand['legPole.L']), (.45, (H + .20, -.20, .05)), (1.0, prone['legPole.L'])],
        'legPole.R': [(0.0, stand['legPole.R']), (.45, (-(H + .20), -.20, .05)), (1.0, prone['legPole.R'])],
        'toeDir.L': [(0.0, None), (.40, None), (.45, Unit((.1, .6, -.8))), (1.0, prone['toeDir.L'])],
        'toeDir.R': [(0.0, None), (.40, None), (.45, Unit((-.1, .6, -.8))), (1.0, prone['toeDir.R'])],
        # the hands: hanging -> thrown forward onto the ground -> clasped over the back of the head
        'hand.L': [(0.0, (SX + .02, .01, P - .09)), (.30, (SX + .10, -.40, .55)), (.50, (SX + .14, -.45, .05)), (1.0, (SX + .12, -.30, .03)), (1.3, (SX + .12, -.30, .03))],
        'hand.R': [(0.0, (-(SX + .02), .01, P - .09)), (.30, (-(SX + .10), -.42, .55)), (.50, (-(SX + .14), -.47, .05)), (1.0, (-(SX + .12), -.32, .03)), (1.3, (-(SX + .12), -.32, .03))],
        'handRelW.L': [(0.0, 1.0), (.10, 1.0), (.25, 0.0), (1.0, 0.0), (1.3, 1.0)],
        'handRelW.R': [(0.0, 1.0), (.10, 1.0), (.25, 0.0), (1.0, 0.0), (1.3, 1.0)],
    }, lag={'head': .05})

    def Pose(t):
        f = body(t)
        if f.get('toeDir.L') is None:
            f['foot.L'], f['foot.R'] = stand['foot.L'], stand['foot.R']
        else:
            f['foot.L'] = f['foot.R'] = None
        # the body-frame target the hands blend to: the back of the head (from 1.0 s), the hang before
        onHead = Smooth((t - .9) / .3)
        for s in LR:
            f['handRel.' + s] = Lerp3(stand['handRel.' + s], (Sig(s) * .07, .10, .29), onHead)
            f['poleRel.' + s] = (Sig(s) * .50, .20, .05)
            f['armPole.' + s] = (Sig(s) * (SX + .45), -.30, .20)
            f['palmF.' + s] = Unit(Lerp3((0, -.2, -1), (Sig(s) * -.3, .2, .9), onHead))
            f['palmN.' + s] = Unit(Lerp3((-Sig(s), 0, 0), (Sig(s) * -.3, -.9, .2), onHead))
            f['curl.' + s] = .45 + .25 * onHead
        if t > 1.3:
            u = t - 1.3
            tr = math.sin(Tau * u * 4 / (D - 1.3)) * Bump(t, 1.3, D)
            f['shrug'] += .02 * tr
            f['bend'] += .01 * tr
        return T.Nest(f)
    views = [('side', (-3.2, -.2, .7), (0, .2, .3)), ('q', (-2.2, -2.6, 1.6), (0, .1, .3)), ('front', (-.2, -3.2, .8), (0, 0, .3))]
    return {'pose': Pose, 'plants': [('L', 0, .2), ('R', 0, .2)], 'kneePlants': [('L', 1.05, D), ('R', 1.05, D)],
            'reach': {'fraction': 2.0}, 'reviewViews': views, 'reviewScale': 2.8,
            'reviewFrames': lambda n: [0, int(n * .22), int(n * .37), int(n * .5), int(n * .65), n - 1]}


# ===============================================================================================================
# VilSitEdge: on the cart tail, legs swinging
# ===============================================================================================================
@Builder('VilSitEdge')
def BuildSitEdge(T, name):
    D = 2.4
    H, F, S, SX = T.H, T.F, T.S, T.SX
    seat = T.R(SEAT_H)
    pz = seat + .11
    base = Standing(T)
    base.update({'pelvis': (0, .0, pz), 'pelvisTilt': (-.20, 0, 0), 'bend': .22, 'head': (.30, 0, 0), 'neck': (.10, 0, 0), 'shrug': .04,
                 'foot.L': None, 'foot.R': None})

    def Pose(t):
        f = dict(base)
        ph = t / D
        for s in LR:
            sw = math.sin(Tau * ph + (0 if s == 'L' else math.pi)) * .28     # the shin's swing angle (rad), alternating
            knee = (Sig(s) * (H + .02), -F * .96, pz - .02)
            f['ankle.' + s] = (knee[0] + Sig(s) * .02, knee[1] - S * .96 * math.sin(sw), knee[2] - S * .96 * math.cos(sw))
            f['legPole.' + s] = (knee[0], knee[1] - .8, knee[2] + .2)
            f['toeDir.' + s] = Unit((Sig(s) * .1, -.35 - .5 * math.sin(sw), -.9 * math.cos(sw) + .3 * math.sin(sw)))
            World(f, s, (Sig(s) * (H + .20), .04, seat + .005), (Sig(s) * (SX + .50), .35, pz + .30), (0, -1, -.1), (0, 0, -1), .45)
        f['bend'] = .22 + .01 * math.sin(Tau * ph)
        f['head'] = (.30, 0, .10 * math.sin(Tau * ph))
        return T.Nest(f)

    def Review(t):
        return [Box((0, .45, seat / 2), (1.6, .90, seat), 0)]
    return {'pose': Pose, 'plants': [], 'groundWeight': lambda t: 0.0, 'reach': {'fraction': 2.0},
            'reviewProps': Review, 'reviewViews': Views(cy=-.1, cz=.9, far=3.4, h=.9), 'reviewScale': 2.6,
            'reviewFrames': lambda n: [0, n // 4, n // 2]}


# ===============================================================================================================
# VilPanicRun: hunched run in place, arms flailing
# ===============================================================================================================
@Builder('VilPanicRun')
def BuildPanicRun(T, name):
    D = .7
    P, SX, SZ = T.P, T.SX, T.SZ
    base = Standing(T)

    def Pose(t):
        f = dict(base)
        ph = (t / D) % 1.0
        RunFeet(T, f, ph, 2.6, D)
        bob = math.cos(Tau * 2 * ph)
        f['pelvis'] = (.01 * math.sin(Tau * ph), -.02, P - .10 + .02 * bob)
        f['pelvisTilt'] = (.35, 0, 0)
        f['bend'] = .40 + .02 * bob
        f['twist'] = .12 * math.sin(Tau * ph)
        f['neck'] = (-.10, 0, 0)
        f['head'] = (.05, 0, -.15 * math.sin(Tau * ph))
        f['shrug'] = .14
        # the arms flail: out and up, out of time with the legs
        for s in LR:
            a = Tau * ph + (0 if s == 'L' else 2.3)
            Rel(f, s, (Sig(s) * (.30 + .08 * math.sin(a)), -.25 + .12 * math.cos(a), -.10 + .18 * math.sin(a * 1.0 + .7)),
                (Sig(s) * .55, .30, -.30), (Sig(s) * .3, -.8, -.4), (-Sig(s), 0, .2), .25)
        return T.Nest(f)
    return {'pose': Pose, 'plants': [], 'reach': {'fraction': 2.0}, 'reviewViews': Views(cy=-.1, cz=.8, far=3.2),
            'reviewScale': 2.6, 'reviewFrames': lambda n: [0, n // 4, n // 2, 3 * n // 4]}


# ===============================================================================================================
# VilClingHem / VilIjaShoutPoint / VilHugLegs / VilBiteWrist / VilUnboltDoor
# ===============================================================================================================
@Builder('VilClingHem')
def BuildClingHem(T, name):
    D = 2.0
    H, A, P, SX = T.H, T.A, T.P, T.SX
    base = Standing(T, bend=-.05)
    base.update({'pelvis': (0, .06, P - .08), 'pelvisTilt': (-.10, 0, 0), 'head': (.30, 0, 0), 'neck': (.15, 0, 0),
                 'ankle.L': (H + .04, -.10, A), 'ankle.R': (-(H + .04), -.06, A), 'foot.L': (0, 6, 0), 'foot.R': (0, -6, 0)})
    hemL = RT(T, (.10, -.45 + .20, .90))
    hemR = RT(T, (-.10, -.45 + .20, .90))

    def Pose(t):
        f = dict(base)
        tug = .5 - .5 * math.cos(Tau * t / D)
        f['bend'] = -.05 - .04 * tug
        f['pelvis'] = Add3(base['pelvis'], (0, .02 * tug, 0))
        f['shrug'] = .10 + .03 * tug
        Grip(f, 'L', hemL, (0, -.6, -.8), (-.6, -.5, .3), 1.0, (SX + .45, .10, .50))
        Grip(f, 'R', hemR, (0, -.6, -.8), (.6, -.5, .3), 1.0, (-(SX + .45), .10, .50))
        return T.Nest(f)

    def Review(t):
        return [('cyl', RT(T, (0, -.45, .10)), RT(T, (0, -.45, 1.55)), .12)]
    return {'pose': Pose, 'plants': [('L', 0, D), ('R', 0, D)], 'reach': {'fraction': .95, 'travel': .08, 'bend': .1, 'sink': .02},
            'check': lambda t: {'L': hemL, 'R': hemR}, 'reviewProps': Review, 'reviewViews': Views(cy=-.25, cz=.9), 'reviewScale': 2.6,
            'reviewFrames': lambda n: [0, n // 2]}


@Builder('VilIjaShoutPoint')
def BuildShoutPoint(T, name):
    D = 2.0
    SX, SZ, P = T.SX, T.SZ, T.P
    base = IjaABase(T)
    base.update({'bend': .12, 'head': (-.05, 0, 0), 'neck': (-.05, 0, 0)})
    rifle = Rifle(T, (-(SX + .04), -.14, SZ - .45), Unit((.04, -.98, -.14)))
    shoulder = Vector((SX, .0, SZ - .03))
    point = tuple(shoulder + Vector((.10, -.99, .05)).normalized() * T.ARM * .93)

    def Pose(t):
        f = dict(base)
        jab = max(0.0, math.sin(Tau * 2 * t / D))                # two jabs a loop
        f['bend'] += .08 * jab
        f['twist'] = .10 + .04 * jab
        f['shrug'] = .06 + .04 * jab
        f['head'] = (-.05 - .06 * jab, 0, .06)
        f['neck'] = (-.05 - .03 * jab, 0, 0)
        f['pelvis'] = Add3(base['pelvis'], (0, -.015 * jab, 0))
        World(f, 'L', Add3(point, (0, -.03 * jab, 0)), (SX + .35, .30, SZ - .40), (.1, -1, .05), (0, 0, 1), .95)
        f['index.L'] = 1.0
        HoldRifle(T, f, rifle, sides='R')
        f['armPole.R'] = (-(SX + .40), .30, P - .05)
        return T.Nest(f)
    return {'pose': Pose, 'props': lambda t: {'weapon': RifleTrack(rifle)}, 'plants': [('L', 0, D), ('R', 0, D)],
            'check': lambda t: {'R': rifle['gripR']}, 'reviewProps': lambda t: RifleReview(T, rifle),
            'reviewViews': Views(cy=-.2, cz=.9), 'reviewScale': 2.6, 'reviewFrames': lambda n: [0, n // 4]}


@Builder('VilHugLegs')
def BuildHugLegs(T, name):
    D = 2.0
    H, A, P, SX = T.H, T.A, T.P, T.SX
    stand = Standing(T, bend=.15)
    legs = RT(T, (0, -HUG_AHEAD, 0))
    hugZ = T.R(HUG_HEIGHT)
    # two quick steps, dropping onto both knees just short of the legs
    rowsL, plL, _, _ = Steps(T, 'L', stand['ankle.L'], [(.10, .35, (H + .03, -.22))])
    rowsR, plR, _, _ = Steps(T, 'R', stand['ankle.R'], [(.30, .55, (-(H + .03), -.12))])
    kz = T.K['kneelPelvisZ']
    kneel = KneelFlat(T, 0.0, -.30, sit=.05)
    kneel['pelvis'] = (0, -.30 + .02, kz + .02)
    body = Tracks(stand, {
        'pelvis': [(0.0, stand['pelvis']), (.55, Add3(stand['pelvis'], (0, -.20, -.10))), (.85, (0, -.28, .55)), (1.0, kneel['pelvis'])],
        'pelvisTilt': [(0.0, stand['pelvisTilt']), (.55, (.25, 0, 0)), (1.0, (.30, 0, 0))],
        'bend': [(0.0, .15), (.55, .35), (1.0, .55)],
        'head': [(0.0, (0, 0, 0)), (.55, (.15, 0, 0)), (1.0, (.35, .10, .15))],
        'ankle.L': rowsL + [(.60, rowsL[-1][1]), (.85, kneel['ankle.L']), (D, kneel['ankle.L'])],
        'ankle.R': rowsR + [(.60, rowsR[-1][1]), (.85, kneel['ankle.R']), (D, kneel['ankle.R'])],
        'legPole.L': [(0.0, stand['legPole.L']), (.6, stand['legPole.L']), (1.0, kneel['legPole.L'])],
        'legPole.R': [(0.0, stand['legPole.R']), (.6, stand['legPole.R']), (1.0, kneel['legPole.R'])],
        'toeDir.L': [(0.0, None), (.58, None), (.62, Unit((.05, -.3, -.95))), (.9, Unit((.0, .55, -.83)))],
        'toeDir.R': [(0.0, None), (.58, None), (.62, Unit((-.05, -.3, -.95))), (.9, Unit((.0, .55, -.83)))],
    }, lag={'head': .05})
    gL = (legs[0] + .12, legs[1] + .02, hugZ + .02)
    gR = (legs[0] - .12, legs[1] + .02, hugZ - .02)

    def Pose(t):
        f = body(t)
        if f.get('toeDir.L') is None:
            f['foot.L'], f['foot.R'] = stand['foot.L'], stand['foot.R']
        else:
            f['foot.L'] = f['foot.R'] = None
        w = Smooth((t - .55) / .45)
        for s in LR:
            f['handRel.' + s] = (Sig(s) * .10, -.20, -.20)
            f['poleRel.' + s] = (Sig(s) * .5, .2, -.3)
            f['palmF.' + s] = (0, -.9, -.4)
            f['palmN.' + s] = (-Sig(s), 0, 0)
        if w > 1e-3:
            # the arms close round the legs: each hand reaches round to the far side
            Grip(f, 'L', (gL[0] - .24 * w, gL[1] - .10 * w, gL[2]), (-1, -.2, 0), (0, 1, 0), .9, (SX + .50, -.10, hugZ + .30), w)
            Grip(f, 'R', (gR[0] + .24 * w, gR[1] - .10 * w, gR[2]), (1, -.2, 0), (0, 1, 0), .9, (-(SX + .50), -.10, hugZ + .30), w)
            f['handRel.L'] = (.10, -.20, -.20)
            f['handRel.R'] = (-.10, -.20, -.20)
        if t > 1.2:
            sob = math.sin(Tau * (t - 1.2) * 2 / (D - 1.2)) * Bump(t, 1.2, D)
            f['shrug'] = .06 + .03 * sob
            f['bend'] += .02 * sob
        return T.Nest(f)

    def Review(t):
        return [('cyl', (legs[0] + .10, legs[1], .02), (legs[0] + .10, legs[1], .95), .07), ('cyl', (legs[0] - .10, legs[1], .02), (legs[0] - .10, legs[1], .95), .07)]
    return {'pose': Pose, 'plants': plL + plR, 'kneePlants': [('L', .95, D), ('R', .95, D)], 'reach': {'fraction': .95, 'travel': .06, 'bend': .2, 'sink': .03},
            'reviewProps': Review, 'reviewViews': Views(cy=-.3, cz=.6, far=3.0), 'reviewScale': 2.6,
            'reviewFrames': lambda n: [0, int(n * .2), int(n * .4), int(n * .5), n - 1]}


@Builder('VilBiteWrist')
def BuildBiteWrist(T, name):
    D = 1.6
    H, A, P, SX = T.H, T.A, T.P, T.SX
    stand = Standing(T, bend=.12)
    bite = Vector(RT(T, BITE_POINT))
    # the mouth: estimated from the head bone at rest; the look point drives the face onto the wrist, the trunk brings it there
    mouthDrop = T.HD + .02 - bite.z            # how far the mouth must come down from standing
    bend = Clamp(mouthDrop / .55, 0, .9)
    rowsL, plL, _, _ = Steps(T, 'L', stand['ankle.L'], [(.08, .32, (H + .04, -.26))])
    body = Tracks(stand, {
        'pelvis': [(0.0, stand['pelvis']), (.32, Add3(stand['pelvis'], (0, -.12, -.08))), (BITE_T, Add3(stand['pelvis'], (0, -.16, -.12)))],
        'pelvisTilt': [(0.0, (.03, 0, 0)), (BITE_T, (.35 + .3 * bend, 0, 0))],
        'bend': [(0.0, .12), (.25, .30), (BITE_T, .35 + .6 * bend)],
        'neck': [(0.0, (0, 0, 0)), (BITE_T, (.25, 0, 0))],
        'head': [(0.0, (0, 0, 0)), (BITE_T, (.20, 0, 0))],
        'ankle.L': rowsL,
        'legPole.L': [(0.0, stand['legPole.L']), (.32, Add3(stand['legPole.L'], (0, -.2, 0)))],
    }, lag={'head': .03})
    fore = Vector(bite) + Vector((0, .06, -.04))            # the forearm behind the wrist (toward the IJA's elbow): the hands grab it
    gripL = tuple(fore + Vector((.05, .10, .0)))
    gripR = tuple(fore + Vector((-.05, .18, -.02)))

    def Pose(t):
        f = body(t)
        if t > BITE_T:
            u = t - BITE_T
            shake = (Bump(u, .15, .40) * math.sin(Tau * u / .12) + Bump(u, .45, .70) * math.sin(Tau * u / .12)) * .06
            f['head'] = (.20, shake * .5, shake)
            f['twist'] = shake * .4
            if t > 1.3:
                b = math.sin(Tau * (t - 1.3) / (D - 1.3))
                f['shrug'] = .04 + .02 * b
        w = Smooth((t - .15) / (BITE_T - .15))
        f['look'] = tuple(bite + Vector((0, -.01, .02)))
        f['lookW'] = w
        f['lookLimit'] = 50.0
        for s, g in (('L', gripL), ('R', gripR)):
            f['handRel.' + s] = (Sig(s) * .12, -.25, -.25)
            f['poleRel.' + s] = (Sig(s) * .5, .2, -.3)
            f['palmF.' + s] = (0, -.9, -.4)
            f['palmN.' + s] = (-Sig(s), 0, 0)
            if w > 1e-3:
                Grip(f, s, g, (0, .8, -.5), (Sig(s) * -.9, .2, -.3), .95, (Sig(s) * (SX + .5), .0, bite.z + .25), w)
                f['handRel.' + s] = (Sig(s) * .12, -.25, -.25)
        return T.Nest(f)

    def Review(t):
        return [('point', tuple(bite), None, .035), ('cyl', tuple(bite + Vector((0, .35, -.25))), tuple(bite), .035)]
    return {'pose': Pose, 'plants': plL + [('R', 0, D)], 'reach': {'fraction': .95, 'travel': .10, 'bend': .3, 'sink': .08},
            'look': lambda t: tuple(bite), 'reviewProps': Review, 'reviewViews': Views(cy=-.3, cz=.9, far=3.0), 'reviewScale': 2.6,
            'reviewFrames': lambda n: [0, int(n * .2), int(round(n * BITE_T / D)), int(n * .55), n - 1]}


@Builder('VilUnboltDoor')
def BuildUnboltDoor(T, name):
    D = 2.6
    H, A, P, SX, SZ = T.H, T.A, T.P, T.SX, T.SZ
    stand = Standing(T, bend=.08)
    door = T.R(DOOR_M)
    bolt0 = (-.04, -door + .04, T.R(BOLT_H))
    bolt1 = (bolt0[0] + T.R(BOLT_TRAVEL), bolt0[1], bolt0[2])
    pushR = (-(SX - .04), -door - .06, T.R(1.05))
    pushL = (SX - .04, -door - .06, T.R(1.05))
    rowsL, plL, _, _ = Steps(T, 'L', stand['ankle.L'], [(1.55, 1.85, (H + .03, -.28))])
    handR = Channel([(0.0, (-(SX + .02), .01, P - .09)), (.30, (-(SX - .06), -.22, T.R(1.0))), (.60, bolt0), (.75, bolt0), (1.3, bolt1), (1.45, Add3(bolt1, (0, .05, -.05))),
                     (1.7, pushR), (2.3, Add3(pushR, (0, -.12, 0))), (D, Add3(pushR, (0, -.14, 0)))])
    handL = Channel([(0.0, (SX + .02, .01, P - .09)), (1.3, (SX + .02, .01, P - .09)), (1.7, pushL), (2.3, Add3(pushL, (0, -.12, 0))), (D, Add3(pushL, (0, -.14, 0)))])
    gripW = Channel([(0.0, 0.0), (.45, 0.0), (.60, 1.0), (1.3, 1.0), (1.45, 0.0), (D, 0.0)])
    body = Tracks(stand, {
        'pelvis': [(0.0, stand['pelvis']), (.6, Add3(stand['pelvis'], (0, -.04, .01))), (1.3, Add3(stand['pelvis'], (.04, -.04, .01))), (1.85, Add3(stand['pelvis'], (0, -.20, -.02))), (D, Add3(stand['pelvis'], (0, -.24, -.03)))],
        'bend': [(0.0, .08), (.6, .02), (1.7, .14), (D, .22)],
        'pelvisTilt': [(0.0, (.03, 0, 0)), (1.5, (.03, 0, 0)), (D, (.15, 0, 0))],
        'twist': [(0.0, 0.0), (.6, -.10), (1.3, .08), (1.7, 0.0)],
        'head': [(0.0, (0, 0, 0)), (.6, (-.15, 0, -.05)), (1.3, (-.12, 0, .08)), (1.7, (.05, 0, 0))],
        'ankle.L': rowsL, 'legPole.L': [(0.0, stand['legPole.L']), (1.85, Add3(stand['legPole.L'], (0, -.25, 0)))],
    }, lag={'head': .05})

    def Pose(t):
        f = body(t)
        w = gripW(t)
        hr = handR(t)
        push = Smooth((t - 1.45) / .25)
        if w > 1e-3 and t < 1.4:
            Grip(f, 'R', hr, (0, -.3, -1), (.95, -.3, 0), .95, (-(SX + .40), .25, SZ + .10), w)
            f['handRel.R'] = (-.06, -.20, -.10)
        else:
            World(f, 'R', hr, (-(SX + .40), .25, SZ - .20), Lerp3((0, -.2, -1), (0, -.3, .95), push), Lerp3((1, 0, 0), (0, -1, -.3), push), .45 - .2 * push)
        World(f, 'L', handL(t), (SX + .40, .30, SZ - .30), Lerp3((0, -.2, -1), (0, -.3, .95), push), Lerp3((-1, 0, 0), (0, -1, -.3), push), .45 - .2 * push)
        return T.Nest(f)

    def Review(t):
        swing = Smooth((t - 1.7) / .7) * .9
        return [Box((bolt0[0] + T.R(BOLT_TRAVEL) * Smooth((t - .75) / .55), bolt0[1] + .02, bolt0[2]), (.18, .03, .03), 0),
                ('poly', [(-.45, -door, 0), (-.45 + .9 * math.cos(swing), -door - .9 * math.sin(swing), 0), (-.45 + .9 * math.cos(swing), -door - .9 * math.sin(swing), 1.9), (-.45, -door, 1.9)], None, 0)]
    return {'pose': Pose, 'plants': plL + [('R', 0, D)], 'check': lambda t: {'R': bolt0} if .6 <= t <= .75 else ({'R': bolt1} if 1.25 <= t <= 1.3 else {}),
            'reach': {'fraction': .95, 'travel': .06, 'bend': .15, 'sink': .0}, 'reviewProps': Review, 'reviewViews': Views(cy=-.3, cz=1.0, far=3.2),
            'reviewScale': 2.8, 'reviewFrames': lambda n: [0, int(n * .23), int(n * .5), int(n * .66), n - 1]}


# ===============================================================================================================
# VilCrawlHole: belly crawl 1.5 m forward under the dog hole, up into a squat
# ===============================================================================================================
@Builder('VilCrawlHole')
def BuildCrawlHole(T, name):
    D = 3.0
    H, A, SX = T.H, T.A, T.SX
    far = T.R(CRAWL_M)
    t0, t1 = .30, 2.30
    pelvY = Channel([(0.0, 0.0), (t0, 0.0), (t1, -far), (D, -far - .02)])
    pelvZ = Channel([(0.0, T.R(.22)), (t0, T.R(.26)), (t1, T.R(.26)), (2.6, .40), (D, .36)])
    tilt = Channel([(0.0, 1.45), (t0, 1.25), (t1, 1.25), (2.6, .60), (D, .55)])
    bend = Channel([(0.0, 0.0), (t0, -.20), (t1, -.20), (2.6, .45), (D, .55)])
    neck = Channel([(0.0, -.15), (t0, -.35), (t1, -.35), (2.6, .05), (D, .05)])
    # hands and knees stepping: each limb planted between its steps, the body sliding past it
    def Limb(side, dy, z, times, lift):
        rows, plants, last = [], [], 0.0
        at = None
        for i, (a, b) in enumerate(times):
            to = (Sig(side) * (H + .18 if z < .05 else H + .05), pelvY(b) + dy)
            if at is None:
                at = (to[0], pelvY(a) + dy)
                rows.append((0.0, (at[0], at[1], z)))
            if a - last > .04:
                plants.append((side, last, a))
            rows.append((a, (at[0], at[1], z)))
            rows.append(((a + b) / 2, ((at[0] + to[0]) / 2, (at[1] + to[1]) / 2, z + lift)))
            rows.append((b, (to[0], to[1], z)))
            at, last = to, b
        return rows, plants, at
    handTimes = {'L': [(.30, .60), (1.10, 1.40), (1.90, 2.20)], 'R': [(.70, 1.00), (1.50, 1.80)]}
    footTimes = {'L': [(.50, .80), (1.30, 1.60), (2.00, 2.25)], 'R': [(.90, 1.20), (1.70, 2.00)]}
    hands, feet, plants = {}, {}, []
    for s in LR:
        hands[s], _, hEnd = Limb(s, -.55, .03, handTimes[s], .07)
        feet[s], pl, fEnd = Limb(s, .70, T.R(.085), footTimes[s], .05)
        plants += pl
        # the squat at the end: feet come forward under him, hands onto the knees
        squatFoot = (Sig(s) * (H + .04), -far - .05, A)
        feet[s] = feet[s] + [(2.40, (fEnd[0], fEnd[1], T.R(.085))), (2.65, (squatFoot[0], (fEnd[1] + squatFoot[1]) / 2, A + .10)), (2.85, squatFoot), (D, squatFoot)]
        hands[s] = hands[s] + [(2.35, (hEnd[0], hEnd[1], .03)), (2.75, (Sig(s) * (H + .10), -far - .32, .40)), (D, (Sig(s) * (H + .08), -far - .30, .42))]
    gripW = Channel([(0.0, 1.0), (2.35, 1.0), (2.6, 0.0), (D, 0.0)])

    def Pose(t):
        py = pelvY(t)
        f = Standing(T)
        f.update({'pelvis': (0, py, pelvZ(t)), 'pelvisTilt': (tilt(t), 0, 0), 'bend': bend(t), 'lean': 0.0, 'twist': 0.0,
                  'neck': (neck(t), 0, 0), 'head': (-.25 + .35 * Smooth((t - 2.3) / .4), 0, 0), 'shrug': .05})
        prone = 1 - Smooth((t - 2.3) / .4)
        for s in LR:
            a = Channel(feet[s])(t)
            f['ankle.' + s] = a
            f['legPole.' + s] = Lerp3((a[0] + Sig(s) * .15, a[1] - .40, -.10), (a[0] + Sig(s) * .25, a[1] - 1.1, .70), 1 - prone)
            f['toeDir.' + s] = Unit(Lerp3((Sig(s) * .25, .85, -.45), (Sig(s) * .1, -.6, -.8), 1 - prone))
            f['foot.' + s] = None
            h = Channel(hands[s])(t)
            w = gripW(t)
            if w > 1e-3:
                Grip(f, s, h, (0, -1, -.1), (0, 0, -1), .55, (Sig(s) * (SX + .55), h[1] + .10, .35), w)
                f['handRel.' + s] = (Sig(s) * .10, -.25, -.40)
            else:
                World(f, s, h, (Sig(s) * (SX + .55), h[1] + .20, .45), (0, -.8, -.6), (0, 0, -1), .5)
        return T.Nest(f)

    def Review(t):
        y0, y1 = -T.R(.40), -T.R(1.0)
        return [Box((0, (y0 + y1) / 2, T.R(HOLE_H) + .15), (1.6, y0 - y1, .30), 0)]
    return {'pose': Pose, 'plants': [], 'kneePlants': [], 'reach': {'fraction': 2.0}, 'reviewProps': Review,
            'reviewViews': [('side', (-3.4, -.8, .7), (0, -.8, .25)), ('q', (-2.4, -3.0, 1.6), (0, -.8, .25)), ('front', (-.2, -4.0, .8), (0, -.8, .25))],
            'reviewScale': 3.0, 'reviewFrames': lambda n: [0, int(n * .2), int(n * .4), int(n * .6), int(n * .8), n - 1]}


# ===============================================================================================================
# VilHandsUpClimbOut (V2): out of the 2 m straight-walled cellar -- foot holes, hands over the rim, knee up, stand, hands up
# ===============================================================================================================
@Builder('VilHandsUpClimbOut')
def BuildHandsUpClimbOut(T, name):
    D = 5.0
    H, A, P, SX, SZ = T.H, T.A, T.P, T.SX, T.SZ
    r = T.R
    depth, wallY = r(PIT_DEPTH), r(PIT_WALL_BACK)
    floor = -depth
    hole1, hole2 = floor + r(PIT_HOLES[0]), floor + r(PIT_HOLES[1])
    holeY = wallY + r(.16)                                 # the ankle of a foot toed into a hole (the toes inside the wall)
    rimY, rimZ = wallY - r(PIT_RIM_GRIP), r(.04)         # finger roots 4 cm up: the flat fingers lie on the ground, not in it
    rimY2 = rimY - r(.15)                                  # the palms walk forward on the rim as he heaves over
    wallZ = floor + r(1.30)                                # both palms flat on the wall at chest height
    y0 = wallY + r(PIT_STAND_BACK)
    standZ = P - .035
    stand = Standing(T)
    pelv = Channel([(0.0, (0, y0, floor + standZ - .02)), (.45, (0, y0 - .02, floor + standZ - .06)), (.85, (0, y0 - .06, floor + standZ - .08)),
                    (1.35, (0, .33, -.86)), (1.85, (0, .30, -.86)), (2.45, (0, .22, -.30)), (2.85, (0, .20, .18)),
                    (3.30, (0, -.08, .42)), (3.60, (0, -.22, .62)), (4.00, (0, -.42, standZ - .02)), (D, (0, -.42, standZ - .02))])
    bend = Channel([(0.0, .06), (.45, .25), (1.35, .45), (1.85, .45), (2.45, .70), (2.85, 1.0), (3.30, .45), (3.60, .30), (4.00, .06), (D, .06)])
    tilt = Channel([(0.0, .03), (.45, .15), (1.35, .35), (2.45, .50), (2.85, .75), (3.30, .35), (4.00, .03), (D, .03)])
    head = Channel([(0.0, -.10), (.45, -.35), (2.45, -.35), (2.85, .20), (3.30, -.10), (4.00, -.15), (D, -.15)])
    ankL = Channel([(0.0, (H + .02, y0 - .03, floor + A)), (.95, (H + .02, y0 - .03, floor + A)), (1.15, (H + .03, .40, floor + r(.35))),
                    (1.35, (H + .03, .33, -1.30)), (1.50, (H + .03, .42, -1.20)), (1.85, (H + .03, holeY, hole2)), (2.42, (H + .03, holeY, hole2)),
                    (2.58, (.15, .36, -.80)), (2.85, (.15, .33, -.55)), (3.05, (.15, .30, .22)), (3.20, (.15, -.12, .30)),
                    (3.35, (H + .05, -.50, A)), (D, (H + .05, -.50, A))])
    ankR = Channel([(0.0, (-(H + .02), y0 + .01, floor + A)), (.50, (-(H + .02), y0 + .01, floor + A)), (.68, (-(H + .03), .50, floor + r(.62))),
                    (.85, (-(H + .03), holeY, hole1)), (1.95, (-(H + .03), holeY, hole1)), (2.15, (-.15, .36, -1.20)), (2.45, (-.146, .33, -.75)),
                    (2.65, (-.166, .30, -.15)), (2.85, (-.166, .16, .10)), (3.30, (-.166, -.02, .18)), (3.55, (-.166, -.02, .18)),
                    (3.72, (-.17, -.21, .24)), (3.90, (-(H + .05), -.40, A)), (D, (-(H + .05), -.40, A))])
    pitchL = Channel([(0.0, 0.0), (.95, 0.0), (1.35, 35.0), (1.70, 20.0), (1.85, 15.0), (2.55, 15.0), (2.85, 35.0), (3.05, 10.0), (3.35, 0.0), (D, 0.0)])
    pitchR = Channel([(0.0, 0.0), (.50, 0.0), (.70, 25.0), (.85, 15.0), (1.95, 15.0), (2.45, 35.0), (2.70, 60.0), (2.85, 80.0), (3.10, 80.0), (3.30, 15.0), (3.55, 15.0), (3.90, 0.0), (D, 0.0)])
    poleL = Channel([(0.0, (H + .22, y0 - .95, floor + .45)), (.95, (H + .22, y0 - .95, floor + .45)), (1.35, (.55, -.25, -1.0)), (1.85, (.60, -.10, -.55)),
                     (2.55, (.60, -.10, -.55)), (2.85, (.45, -.20, -.10)), (3.35, (H + .22, -1.45, .45)), (D, (H + .22, -1.45, .45))])
    poleR = Channel([(0.0, (-(H + .22), y0 - .95, floor + .45)), (.50, (-(H + .22), y0 - .95, floor + .45)), (.85, (-.55, -.20, -1.1)), (1.95, (-.55, -.20, -1.1)),
                     (2.45, (-.45, -.25, -.30)), (2.85, (-.25, -.90, .25)), (3.55, (-.25, -1.0, .35)), (3.90, (-(H + .22), -1.35, .45)), (D, (-(H + .22), -1.35, .45))])
    # grounded only while a sole is planted: on the floor (to 0.95), then once the left foot stands on the rim (3.35); in between
    # (foot holes, the heave, the knee on the rim) the authored heights rule, as the wall climb's
    ground = Channel([(0.0, 1.0), (.85, 1.0), (.95, 0.0), (3.35, 0.0), (3.45, 1.0), (D, 1.0)])
    wallHand = lambda s: (Sig(s) * .22, wallY - .015, wallZ)
    rimHand = lambda s, t: (Sig(s) * (SX + .06), Mix(rimY, rimY2, Smooth((t - 2.45) / .40)), rimZ)
    gripWall = Channel([(0.0, 0.0), (.30, 0.0), (.45, 1.0), (1.05, 1.0), (D, 1.0)])         # 1.05-1.30: the same grips travel wall -> rim
    gripOut = Channel([(0.0, 1.0), (2.85, 1.0), (3.0, 0.0), (D, 0.0)])
    handsUp = Channel([(0.0, (.12, -.30, .02)), (3.15, (.12, -.30, .02)), (3.30, (.12, -.15, .10)), (4.20, (.18, -.12, .44)), (D, (.18, -.12, .44))])

    def Hand(s, t):
        if t <= 1.05:
            return wallHand(s)
        if t >= 1.30:
            return rimHand(s, t)
        return Lerp3(wallHand(s), rimHand(s, 1.30), Smooth((t - 1.05) / .25))

    def Pose(t):
        f = dict(stand)
        f['pelvis'] = pelv(t)
        f['pelvisTilt'] = (tilt(t), 0, 0)
        f['bend'] = bend(t)
        f['head'] = (head(t), 0, 0)
        f['neck'] = (-.10, 0, 0)
        f['shrug'] = .10
        f['ankle.L'], f['ankle.R'] = ankL(t), ankR(t)
        f['foot.L'], f['foot.R'] = (pitchL(t), 6, 0), (pitchR(t), -6, 0)
        f['legPole.L'], f['legPole.R'] = poleL(t), poleR(t)
        w = gripWall(t) * gripOut(t)
        for s in LR:
            up = handsUp(t)
            Rel(f, s, (Sig(s) * up[0], up[1], up[2]), (Sig(s) * .5, .15, .10), (0, 0, 1), (0, -1, 0), .2)
            if w > 1e-3:
                h = Hand(s, t)
                onWall = t < 1.15
                Grip(f, s, h, (0, 0, 1) if onWall else (0, -1, 0), (0, -1, 0) if onWall else (0, 0, -1), .25 if onWall else .2,
                     (Sig(s) * (SX + .5), .30, wallZ) if onWall else (Sig(s) * (SX + .6), .35, h[2] + .10), w)
                f['handRel.' + s] = (Sig(s) * up[0], up[1], up[2])
        if t > 4.2:
            b = math.sin(Tau * (t - 4.2) / (D - 4.2))
            f['bend'] += .012 * b
            f['shrug'] += .02 * b
        return T.Nest(f)

    def Review(t):
        far = wallY + r(PIT_FLOOR_W)
        return [('poly', [(-.9, wallY, 0), (.9, wallY, 0), (.9, wallY, floor), (-.9, wallY, floor)], None, 0),
                ('poly', [(-.9, wallY, floor), (.9, wallY, floor), (.9, far, floor), (-.9, far, floor)], None, 0),
                ('poly', [(-.9, wallY, 0), (.9, wallY, 0), (.9, wallY - 1.2, 0), (-.9, wallY - 1.2, 0)], None, 0),
                Box((-(H + .03), wallY - .06, hole1), (.16, .12, .12), 0), Box((H + .03, wallY - .06, hole2), (.16, .12, .12), 0)]

    def Check(t):
        if .45 <= t <= 1.05 or 1.30 <= t <= 2.85:
            return {'L': Hand('L', t), 'R': Hand('R', t)}
        return {}
    return {'pose': Pose, 'plants': [('L', 0, .95), ('L', 1.85, 2.42), ('L', 3.35, D), ('R', 0, .50), ('R', .85, 1.95), ('R', 3.90, D)],
            'ground': lambda x, y, t: 0.0 if y < wallY - r(.18) else floor, 'groundWeight': lambda t: ground(t),
            'walls': [((0, wallY, 0), (0, 1, 0), (0, wallY, 0), (0, 0, -1))], 'check': Check, 'reach': {'fraction': 2.0}, 'reviewProps': Review,
            'reviewViews': [('side', (-4.6, .9, -.6), (0, .5, -.6)), ('q', (-3.2, -2.8, 1.6), (0, .4, -.5)), ('front', (-.2, -4.2, .8), (0, .4, -.5))],
            'reviewScale': 4.6, 'reviewFrames': lambda n: sorted({0, int(round(n * .85 / D)), int(round(n * 1.35 / D)), int(round(n * 1.85 / D)), int(round(n * 2.45 / D)),
                                                                  int(round(n * 2.85 / D)), int(round(n * 3.3 / D)), int(round(n * 4.0 / D)), n - 1})}


# ===============================================================================================================
# VilStabbedFall: stabbed in the belly, folds, knees, onto the left side (corpse)
# ===============================================================================================================
@Builder('VilStabbedFall')
def BuildStabbedFall(T, name):
    D = 2.4
    H, A, P, SX, SZ = T.H, T.A, T.P, T.SX, T.SZ
    stand = Standing(T, bend=.06)
    stand.update({'handRel.L': (.20, -.22, -.15), 'handRel.R': (-.20, -.22, -.15), 'poleRel.L': (.5, .2, -.3), 'poleRel.R': (-.5, .2, -.3),
                  'palmF.L': (.2, -.8, .5), 'palmN.L': (-.3, -.8, -.4), 'palmF.R': (-.2, -.8, .5), 'palmN.R': (.3, -.8, -.4), 'curl.L': .3, 'curl.R': .3,
                  'head': (-.05, 0, 0)})
    s0 = THRUST_T
    aL, aR = stand['ankle.L'], stand['ankle.R']
    lieL, lieR = (H + .55, .55, .09), (H + .45, .25, .22)
    body = Tracks(stand, {
        'pelvis': [(0.0, stand['pelvis']), (s0, stand['pelvis']), (s0 + .12, Add3(stand['pelvis'], (0, .10, -.06))), (.95, Add3(stand['pelvis'], (0, .06, -.22))),
                   (1.15, (0, .08, .50)), (1.45, (.10, .12, .36)), (1.9, (.30, .14, .13)), (D, (.30, .14, .13))],
        'pelvisTilt': [(0.0, (.03, 0, 0)), (s0, (.03, 0, 0)), (s0 + .12, (.30, 0, 0)), (.95, (.45, 0, 0)), (1.15, (.50, 0, 0)), (1.45, (.55, .35, 0)),
                       (1.9, (.60, 1.35, .10)), (D, (.60, 1.40, .10))],
        'bend': [(0.0, .06), (s0, .06), (s0 + .12, .70), (.95, .85), (1.45, .80), (1.9, .60), (D, .60)],
        'lean': [(0.0, 0.0), (1.15, 0.0), (1.45, .25), (1.9, .40), (D, .40)],
        'twist': [(0.0, 0.0), (s0 + .12, -.05), (1.45, .10), (1.9, .15), (D, .15)],
        'neck': [(0.0, (0, 0, 0)), (s0, (0, 0, 0)), (s0 + .10, (.30, 0, 0)), (1.45, (.20, 0, 0)), (1.9, (.10, .15, 0)), (D, (.10, .15, 0))],
        'head': [(0.0, (-.05, 0, 0)), (s0, (-.05, 0, 0)), (s0 + .10, (.35, 0, 0)), (1.45, (.30, 0, 0)), (1.9, (.15, .20, .10)), (D, (.15, .20, .10))],
        'shrug': [(0.0, .02), (s0 + .08, .18), (1.15, .10), (1.9, .02), (D, .02)],
        'ankle.L': [(0.0, aL), (.95, aL), (1.15, aL), (1.45, (H + .14, .22, .10)), (1.9, lieL), (D, lieL)],
        'ankle.R': [(0.0, aR), (.80, aR), (.95, (-(H + .04), .12, A)), (1.15, (-(H + .02), .22, A - .02)), (1.9, lieR), (D, lieR)],
        'legPole.L': [(0.0, stand['legPole.L']), (1.15, (H + .40, -.9, .5)), (1.9, (H + .90, -.5, .35)), (D, (H + .90, -.5, .35))],
        'legPole.R': [(0.0, stand['legPole.R']), (.95, (-(H + .30), -.5, .1)), (1.9, (H + .70, -.5, .55)), (D, (H + .70, -.5, .55))],
        'toeDir.L': [(0.0, None), (1.10, None), (1.15, Unit((.1, -.5, -.85))), (1.9, Unit((.9, -.3, -.2)))],
        'toeDir.R': [(0.0, None), (.80, None), (.85, Unit((-.1, .3, -.95))), (1.9, Unit((.9, -.2, -.3)))],
        'handRel.L': [(0.0, stand['handRel.L']), (s0, stand['handRel.L']), (s0 + .14, (.06, -.16, -.36)), (D, (.04, -.14, -.36))],
        'handRel.R': [(0.0, stand['handRel.R']), (s0, stand['handRel.R']), (s0 + .14, (-.06, -.17, -.34)), (D, (-.04, -.15, -.34))],
    }, lag={'head': .04})

    def Pose(t):
        f = body(t)
        if f.get('toeDir.L') is None:
            f['foot.L'] = stand['foot.L']
        else:
            f['foot.L'] = None
        if f.get('toeDir.R') is None:
            f['foot.R'] = stand['foot.R']
        else:
            f['foot.R'] = None
        w = Smooth((t - s0) / .14)
        for s in LR:
            f['poleRel.' + s] = Lerp3((Sig(s) * .5, .2, -.3), (Sig(s) * .45, .35, -.25), w)
            f['palmF.' + s] = Unit(Lerp3((Sig(s) * .2, -.8, .5), (Sig(s) * -.2, -.3, -.9), w))
            f['palmN.' + s] = Unit(Lerp3((Sig(s) * -.3, -.8, -.4), (Sig(s) * -.6, -.8, .1), w))
            f['curl.' + s] = .3 + .55 * w
        return T.Nest(f)
    return {'pose': Pose, 'plants': [('L', 0, THRUST_T), ('R', 0, THRUST_T)], 'reach': {'fraction': 2.0},
            'reviewViews': Views(cx=.2, cy=-.1, cz=.6, far=3.6, h=1.0), 'reviewScale': 3.0,
            'reviewFrames': lambda n: [0, int(round(n * s0 / D)), int(n * .3), int(n * .48), int(n * .62), int(n * .8), n - 1]}


# ===============================================================================================================
# VilDraggedByArm: on her back, hauled head first by the right arm
# ===============================================================================================================
@Builder('VilDraggedByArm')
def BuildDraggedByArm(T, name):
    D = DRAG_CYCLE
    H, A, SX = T.H, T.A, T.SX
    base = LieBase(T, rightKnee=.0)
    base.update({'pelvis': (0, 0, .14), 'pelvisTilt': (-1.35, 0, 0), 'bend': .18, 'neck': (.35, 0, 0), 'head': (.25, 0, .15), 'shrug': .10})
    wrist = RT(T, DRAG_WRIST_V)
    reach = (T.F + T.S) * .92

    def Pose(t):
        f = dict(base)
        ph = t / D
        f['twist'] = -.12 + .06 * math.sin(Tau * ph)
        f['lean'] = .05 * math.sin(Tau * ph)
        f['bend'] = .18 + .05 * math.sin(Tau * ph)
        f['head'] = (.25, .05 * math.sin(Tau * ph), .15 + .10 * math.sin(Tau * ph))
        # the heels kick: each leg draws up and shoves down alternately, the knee up
        for s in LR:
            k = .5 - .5 * math.cos(Tau * ph + (0 if s == 'L' else math.pi))      # 1 = drawn up
            y = -reach + .42 * k
            f['ankle.' + s] = (Sig(s) * (H + .08), y, .075 + .03 * k)
            f['legPole.' + s] = (Sig(s) * (H + .12), -.45, 1.2)
            f['foot.' + s] = (-70 + 40 * k, Sig(s) * 10, 0)
        # the right arm hauled up past the head to the IJA's hands; the left claws at the ground beside her, then at the arm
        Grip(f, 'R', wrist, (0, 1, .2), (-.9, -.1, .3), .6, (-(SX + .40), .30, .35))
        c = .5 - .5 * math.cos(Tau * ph)
        World(f, 'L', Lerp3((SX + .28, .30, .05), (SX + .10, .72, .36), c), (SX + .50, .20, .35), Lerp3((0, 1, -.1), (0, 1, .3), c), Lerp3((0, 0, -1), (-.9, 0, -.3), c), .8)
        return T.Nest(f)

    def Review(t):
        return [('point', wrist, None, .03), Box((0, -.1, .005), (1.0, 2.2, .01), 0)]
    return {'pose': Pose, 'plants': [], 'reach': {'fraction': .95, 'travel': .0, 'bend': .2, 'sink': .0}, 'check': lambda t: {'R': wrist}, 'reviewProps': Review,
            'reviewViews': [('side', (-3.2, .2, .8), (0, .3, .25)), ('q', (-2.2, 3.0, 1.7), (0, .3, .25)), ('head', (-.2, 3.4, 1.0), (0, .3, .3))],
            'reviewScale': 2.8, 'reviewFrames': lambda n: [0, n // 3, 2 * n // 3]}


# ===============================================================================================================
# VilKneelCrawlToPit: knee crawl in place, the bundle clutched
# ===============================================================================================================
@Builder('VilKneelCrawlToPit')
def BuildKneelCrawl(T, name):
    D = 2.4
    H, SX = T.H, T.SX
    base = KneelLean(T, sit=.0, bend=.70, forward=.06, tilt=.85)
    base.update({'head': (.05, 0, 0), 'neck': (-.05, 0, 0)})
    aL, aR = base['ankle.L'], base['ankle.R']
    step = T.R(.35 * .5 * D)          # each knee advances this far a step (in place: it travels back in stance)

    def Knee(side, ph):
        a = base['ankle.' + side]
        if ph < .55:
            u = ph / .55
            return (a[0], a[1] - step / 2 + step * u, a[2]), 0.0
        u = (ph - .55) / .45
        return (a[0], a[1] + step / 2 - step * Smooth(u), a[2] + .06 * math.sin(math.pi * u)), math.sin(math.pi * u)

    def Pose(t):
        f = dict(base)
        ph = (t / D) % 1.0
        for s in LR:
            p = ph if s == 'L' else (ph + .5) % 1.0
            a, lift = Knee(s, p)
            f['ankle.' + s] = a
            f['legPole.' + s] = (a[0] + Sig(s) * .05, a[1] - 1.0, a[2] + .35)
        f['pelvis'] = Add3(base['pelvis'], (.015 * math.sin(Tau * ph), 0, .01 * math.cos(Tau * 2 * ph)))
        f['twist'] = .06 * math.sin(Tau * ph)
        f['lean'] = .04 * math.sin(Tau * ph)
        # the right hand on the ground ahead, stepping with the left knee; the left arm hugs the bundle
        hp = (ph + .5) % 1.0
        hy = -.46 - step / 2 + step * (hp / .55 if hp < .55 else 1 - Smooth((hp - .55) / .45))
        hz = .085 + (.08 * math.sin(math.pi * (hp - .55) / .45) if hp >= .55 else 0.0)
        Grip(f, 'R', (-(H + .14), hy, hz), (0, -1, -.1), (0, 0, -1), .5, (-(SX + .55), hy + .2, .40))
        Rel(f, 'L', (-.02, -.20, -.20), (.5, .1, -.3), (-.8, -.5, .1), (.2, -.5, -.8), .7)
        return T.Nest(f)

    def Review(t):
        return [Box((.06, -.30, .45), (.30, .22, .22), 0)]
    return {'pose': Pose, 'plants': [], 'kneePlants': [], 'reach': {'fraction': .90, 'travel': .04, 'bend': .45, 'sink': .03}, 'reviewProps': Review,
            'reviewViews': Views(cy=-.3, cz=.5, far=3.0, h=.8), 'reviewScale': 2.4, 'reviewFrames': lambda n: [0, n // 4, n // 2]}


# ===============================================================================================================
# VilPushVat (V2): drive the vat 1.7 m straight ahead, turn right to the door, unbolt, pull the leaf open into the yard
# ===============================================================================================================
@Builder('VilPushVat')
def BuildPushVat(T, name):
    D = 6.8
    H, A, P, SX, SZ = T.H, T.A, T.P, T.SX, T.SZ
    r = T.R
    stand = Standing(T, bend=.08)
    moved = Channel([(0.0, 0.0), (.40, 0.0), (2.80, 1.0), (D, 1.0)])
    # beats: push 0.4-2.8 | straighten | turn + walk 3.1-4.9 | bolt grab 5.15, open 5.55 | side step, both hands on the leaf 5.75 |
    # pull it into the yard backing out of its sweep, hands off ~6.3 | the leaf swings on to 90 deg at 6.6 | stands inside
    tBolt, tBoltOpen, tDoor, tHandsOff, tDoorOpen = 5.15, 5.55, 5.75, 6.30, 6.60
    VatY = lambda t: -r(VAT_AHEAD + VAT_MOVE * moved(t))                 # the vat centre (x 0) while he drives it
    vr, vh = r(VAT_R), r(VAT_H)
    faceOff = math.sqrt(vr * vr - r(.20) ** 2) + r(.01)                  # the near face under a palm .20 m off the centre line
    VatHand = lambda s, t: (Sig(s) * r(.20), VatY(t) + faceOff, r(VAT_HAND_H))
    doorX, hingeY = -r(DOOR_RIGHT), -r(DOOR_HINGE_AHEAD)
    bolt0 = (doorX + r(.03), -r(BOLT_AHEAD), r(BOLT_H))
    boltAt = lambda t: (bolt0[0], bolt0[1] + r(BOLT_TRAVEL) * Smooth((t - (tBoltOpen - .30)) / .30), bolt0[2])
    swing = lambda t: math.radians(DOOR_SWING_DEG) * Smooth((t - tDoor) / (tDoorOpen - tDoor))       # + = into the yard (toward +x)

    def LeafPoint(rr, th, off=0.0):
        """A point on the leaf rr from the hinge, `off` toward its yard-side face (the side he starts on); the leaf
        swings from along -y (closed, the right plane) toward +x (open, into the yard)."""
        return (doorX + rr * math.sin(th) + off * math.cos(th), hingeY - rr * math.cos(th) + off * math.sin(th))

    def LeafHand(s, t):
        th = swing(t)
        if s == 'L':
            x, y = LeafPoint(r(DOOR_EDGE_GRIP), th, r(.03))              # the left hand hooks the free edge
            return (x, y, r(DOOR_EDGE_H))
        x, y = LeafPoint(r(DOOR_FACE_GRIP), th, r(.04))                  # the right palm flat on the face
        return (x, y, r(DOOR_FACE_H))
    pushBack = r(VAT_R + VAT_PUSH_BACK)
    yEnd = VatY(D) + pushBack
    grabXY, endXY = (-r(DOOR_GRAB[0]), -r(DOOR_GRAB[1])), (-r(DOOR_END[0]), -r(DOOR_END[1]))
    path = Channel([(t / 48, (0.0, VatY(t / 48) + pushBack)) for t in range(0, int(2.8 * 48) + 1)]
                   + [(3.10, (0.0, yEnd)), (3.70, (-r(.40), yEnd + r(.08))), (4.30, (-r(1.00), yEnd + r(.38))),
                      (4.90, (-r(DOOR_STAND[0]), -r(DOOR_STAND[1]))), (5.50, (-r(DOOR_STAND[0]), -r(DOOR_STAND[1]))),
                      (5.78, grabXY), (6.00, (-r(1.05), -r(1.28))), (6.22, (-r(.72), -r(1.12))), (6.45, (-r(.55), -r(.95))),
                      (6.62, endXY), (D, endXY)])
    PelvisXY = lambda t: path(t)
    turnAt = Channel([(0.0, 0.0), (3.0, 0.0), (4.1, -math.pi / 2), (D, -math.pi / 2)])
    steps = [('R', .40, .65), ('L', .65, .90), ('R', .90, 1.15), ('L', 1.15, 1.40), ('R', 1.40, 1.65), ('L', 1.65, 1.90), ('R', 1.90, 2.15),
             ('L', 2.15, 2.40), ('R', 2.40, 2.65), ('L', 2.65, 2.90),
             ('R', 3.10, 3.40), ('L', 3.40, 3.70), ('R', 3.70, 4.00), ('L', 4.00, 4.30), ('R', 4.30, 4.60), ('L', 4.60, 4.90),
             ('L', 5.52, 5.76), ('R', 5.78, 6.00), ('L', 6.00, 6.22), ('R', 6.22, 6.45), ('L', 6.45, 6.62)]
    pushSt = lambda s: (Sig(s) * (H + .05), -r(.02))
    walkSt = lambda s: (Sig(s) * (H + .03), 0.0)
    stance = {'L': [pushSt('L')] * 5 + [walkSt('L')] * 3 + [(H + .03, 0.0), (H + .03, r(.08)), (H + .03, 0.0)],
              'R': [pushSt('R')] * 5 + [walkSt('R')] * 3 + [(-(H + .03), r(.10)), (-(H + .03), r(.05))]}
    legs, plants = WrPath(T, stand, PelvisXY, turnAt, steps, stance, lambda s, t: (H + .22, .95 + .10 * moved(t) * (1 - Smooth((t - 2.8) / .3)), .45), D, lift=.06)
    legsAnim = Tracks(stand, legs)
    # the knees stay a little bent on the walk and the backing steps (a straight-legged pelvis leaves the trailing foot out of reach)
    pelvZ = Channel([(0.0, P - .035), (.40, r(.78)), (2.80, r(.78)), (3.10, P - .05), (3.30, P - .075), (4.70, P - .075), (4.90, P - .045), (5.50, P - .045),
                     (tDoor, P - .07), (6.45, P - .09), (6.62, P - .05), (D, P - .05)])
    bend = Channel([(0.0, .08), (.40, .80), (2.80, .78), (3.10, .08), (4.90, .10), (tBolt, .12), (tBoltOpen, .12), (tDoor, .25), (6.22, .25), (6.45, .10), (D, .08)])
    tilt = Channel([(0.0, .03), (.40, .35), (2.80, .33), (3.10, .03), (tDoor, .08), (6.45, .03), (D, .03)])
    head = Channel([(0.0, (0, 0, 0)), (.40, (-.10, 0, 0)), (2.80, (-.10, 0, 0)), (3.10, (0, 0, -.25)), (3.90, (0, 0, -.15)), (4.90, (.10, 0, 0)),
                    (tBoltOpen, (.05, 0, 0)), (tDoor, (.05, 0, .15)), (6.22, (0, 0, .30)), (6.45, (0, 0, .10)), (D, (-.05, 0, 0))])
    gripVat = Channel([(0.0, 0.0), (.20, 0.0), (.40, 1.0), (2.75, 1.0), (2.90, 0.0), (D, 0.0)])
    gripBolt = Channel([(0.0, 0.0), (tBolt - .25, 0.0), (tBolt, 1.0), (tBoltOpen, 1.0), (tBoltOpen + .12, 0.0), (D, 0.0)])
    gripDoorL = Channel([(0.0, 0.0), (tDoor - .15, 0.0), (tDoor, 1.0), (tHandsOff - .05, 1.0), (tHandsOff + .10, 0.0), (D, 0.0)])
    gripDoorR = Channel([(0.0, 0.0), (tDoor - .12, 0.0), (tDoor, 1.0), (5.92, 1.0), (6.05, 0.0), (D, 0.0)])     # lets go as the leaf comes at him

    def Wp(t, lx, ly, z):
        """A world point from a body-frame offset (left, back, up) at the pelvis under the current turn."""
        px, py = PelvisXY(t)
        dx, dy = _Rot(lx, ly, turnAt(t))
        return (px + dx, py + dy, z)

    def Pose(t):
        f = dict(stand)
        f.update({k: v for k, v in legsAnim(t).items() if k.startswith(('ankle.', 'foot.', 'legPole.'))})
        px, py = PelvisXY(t)
        f['pelvis'] = (px, py, pelvZ(t))
        f['pelvisTilt'] = (tilt(t), 0, 0)
        f['bend'] = bend(t)
        f['head'] = head(t)
        f['twist'] = -.10 * Bump(t, 3.0, 4.2) - .12 * Bump(t, tDoor - .1, 6.5)
        for s in LR:
            f['poleRel.' + s] = (Sig(s) * .5, .3, -.3)
        wv, wb = gripVat(t), gripBolt(t)
        wd = {'L': gripDoorL(t), 'R': gripDoorR(t)}
        if wv > 1e-3:
            for s in LR:
                h = VatHand(s, t)
                Grip(f, s, h, (Sig(s) * .3, -.2, .93), (0, -1, 0), .35, (Sig(s) * (SX + .5), h[1] + r(.35), r(1.05)), wv)
                f['handRel.' + s] = (Sig(s) * .08, -.16, -.40)
        if wb > 1e-3:
            Grip(f, 'R', boltAt(t), (0, -.3, -.95), (0, -1, .2), .9, Wp(t, -(SX + .45), .30, SZ - .10), wb)
            f['handRel.R'] = (-.06, -.25, -.05)
        for s in LR:
            if wd[s] > 1e-3:
                if s == 'L':
                    Grip(f, s, LeafHand(s, t), (0, -.3, -.95), (-.6, -.8, 0), .8, Wp(t, SX + .5, .20, r(1.05)), wd[s])    # fingers hooked over the edge
                else:
                    Grip(f, s, LeafHand(s, t), (-.3, -.1, .95), (0, -1, 0), .3, Wp(t, -(SX + .5), .25, r(1.05)), wd[s])
                f['handRel.' + s] = (Sig(s) * .10, -.25, -.12)
        f['framedGrips'] = True
        return T.Nest(Turned(f, turnAt(t)))

    def Review(t):
        c = (0.0, VatY(t))
        th = swing(t)
        far = LeafPoint(r(DOOR_LEAF_M), th)
        b = boltAt(t)
        return [('cyl', (c[0], c[1], .0), (c[0], c[1], vh), vr),
                ('poly', [(doorX, hingeY, 0), (far[0], far[1], 0), (far[0], far[1], r(2.0)), (doorX, hingeY, r(2.0))], None, 0),
                Box((b[0] + r(.01), b[1], b[2]), (.03, .20, .03), 0)]

    def Check(t):
        if .45 <= t <= 2.70:
            return {'L': VatHand('L', t), 'R': VatHand('R', t)}
        if tBolt + .05 <= t <= tBoltOpen - .05:
            return {'R': boltAt(t)}
        out = {}
        if tDoor + .05 <= t <= tHandsOff - .05:
            out['L'] = LeafHand('L', t)
        if tDoor + .05 <= t <= 5.92:
            out['R'] = LeafHand('R', t)
        return out
    # (the side camera on his LEFT, +x: the door leaf stands on his right and would hide him)
    return {'pose': Pose, 'plants': plants, 'reach': {'fraction': .95, 'travel': .08, 'bend': .15, 'sink': .02}, 'check': Check,
            'reviewProps': Review, 'reviewViews': [('side', (4.2, -1.3, 1.0), (-.6, -1.3, .7)), ('q', (3.4, -4.6, 2.4), (-.6, -1.3, .7)), ('top', (-.6, -1.3, 6.0), (-.6, -1.31, .0))],
            'reviewScale': 5.2,
            'reviewFrames': lambda n: sorted({0, int(round(n * .4 / D)), int(round(n * 1.6 / D)), int(round(n * 2.8 / D)), int(round(n * 3.7 / D)), int(round(n * 4.9 / D)),
                                              int(round(n * tBoltOpen / D)), int(round(n * tDoor / D)), int(round(n * 6.0 / D)), int(round(n * 6.22 / D)),
                                              int(round(n * tHandsOff / D)), int(round(n * tDoorOpen / D)), n - 1})}


# ===============================================================================================================
# VilReachPinned / VilNraYankBack: the reach over the lip and the haul back by the belt
# ===============================================================================================================
def CrawlKneel(T, forward=.08):
    f = KneelLean(T, sit=0.0, bend=.75, forward=forward, tilt=.80)
    f.update({'head': (-.25, 0, 0), 'neck': (-.15, 0, 0)})
    return f


@Builder('VilReachPinned')
def BuildReachPinned(T, name):
    D = 2.4
    H, A, SX = T.H, T.A, T.SX
    base = CrawlKneel(T)
    back = T.R(.45)
    p0 = base['pelvis']
    sat = KneelFlat(T, 0.0, back, sit=.6)
    body = Tracks(base, {
        'pelvis': [(0.0, p0), (.4, Add3(p0, (0, -.06, .02))), (1.3, Add3(p0, (0, -.08, .03))), (YANK_T, Add3(p0, (0, -.06, .02))), (YANK_T + .25, Add3(p0, (0, back * .7, -.02))),
                   (2.1, (0, sat['pelvis'][1] + .06, sat['pelvis'][2] + .02)), (D, (0, sat['pelvis'][1] + .06, sat['pelvis'][2]))],
        'pelvisTilt': [(0.0, base['pelvisTilt']), (1.3, Add3(base['pelvisTilt'], (.1, 0, 0))), (YANK_T + .25, (.0, 0, 0)), (2.1, (-.35, 0, 0)), (D, (-.30, 0, 0))],
        'bend': [(0.0, .75), (.4, .62), (1.3, .58), (YANK_T + .25, .10), (2.1, -.05), (D, .0)],
        'twist': [(0.0, 0.0), (.4, .18), (1.3, .22), (YANK_T + .25, .05), (2.1, 0.0)],
        'neck': [(0.0, (-.15, 0, 0)), (.4, (-.30, 0, 0)), (YANK_T + .25, (.0, 0, 0)), (2.1, (-.10, 0, 0))],
        'head': [(0.0, (-.25, 0, 0)), (.4, (-.40, 0, 0)), (YANK_T + .25, (-.10, 0, 0)), (2.1, (-.25, 0, 0))],
        'shrug': [(0.0, .04), (.4, .12), (YANK_T + .25, .16), (2.1, .04)],
        'ankle.L': [(0.0, base['ankle.L']), (YANK_T, base['ankle.L']), (YANK_T + .3, Add3(sat['ankle.L'], (0, -.05, 0))), (D, sat['ankle.L'])],
        'ankle.R': [(0.0, base['ankle.R']), (YANK_T, base['ankle.R']), (YANK_T + .3, Add3(sat['ankle.R'], (0, -.05, 0))), (D, sat['ankle.R'])],
        'legPole.L': [(0.0, base['legPole.L']), (YANK_T, base['legPole.L']), (D, sat['legPole.L'])],
        'legPole.R': [(0.0, base['legPole.R']), (YANK_T, base['legPole.R']), (D, sat['legPole.R'])],
    }, lag={'head': .04})
    reach = Channel([(0.0, 0.0), (.4, 1.0), (1.3, 1.0), (YANK_T, .9), (YANK_T + .3, 0.0), (D, 0.0)])
    shoulderR = Vector((-SX, -.05, SX * 0 + T.SZ - .55))
    farPoint = (-SX - .10, -.80, .75)

    def Pose(t):
        f = body(t)
        r = reach(t)
        jab = Bump(t, .55, .95) * .04 + Bump(t, 1.0, 1.3) * .04
        # left hand on the ground (the support), right arm thrust forward and up
        Grip(f, 'L', (H + .18, -.50, .085), (0, -1, -.1), (0, 0, -1), .5, (SX + .55, -.3, .40), 1 - Smooth((t - YANK_T) / .2))
        f['handRel.L'] = (.25, -.10, -.30)
        f['poleRel.L'] = (.5, .3, -.2)
        if r < 1e-3:
            Grip(f, 'R', (-(H + .18), -.48, .085), (0, -1, -.1), (0, 0, -1), .5, (-(SX + .55), -.3, .40), 1 - Smooth((t - YANK_T) / .2))
        else:
            World(f, 'R', (farPoint[0], farPoint[1] - jab, farPoint[2] + jab), (-(SX + .40), .10, .9), (0, -1, .2), (0, 0, 1), .15)
        f['handRel.R'] = (-.25, -.10, -.30)
        f['poleRel.R'] = (-.5, .3, -.2)
        if t > YANK_T + .2:
            for s in LR:
                f['handRel.' + s] = (Sig(s) * .32, .08, -.30)
                f['poleRel.' + s] = (Sig(s) * .5, .35, -.1)
                f['palmF.' + s], f['palmN.' + s], f['curl.' + s] = (0, -.5, -.85), (-Sig(s), 0, 0), .4
        f['lookW'] = .0
        return T.Nest(f)

    def Review(t):
        return [Box((0, -.95, -.5), (2.0, 1.2, 1.0), 0)]
    return {'pose': Pose, 'plants': [], 'kneePlants': [('L', 0, YANK_T), ('R', 0, YANK_T)], 'reach': {'fraction': .90, 'travel': .04, 'bend': .45, 'sink': .03},
            'reviewProps': Review, 'reviewViews': Views(cy=-.3, cz=.6, far=3.4, h=.9), 'reviewScale': 3.0,
            'reviewFrames': lambda n: [0, int(n * .25), int(round(n * YANK_T / D)), int(n * .7), n - 1]}


@Builder('VilNraYankBack')
def BuildYankBack(T, name):
    D = 2.4
    H, A, SX = T.H, T.A, T.SX
    base = KneelLean(T, sit=.05, bend=.35, forward=.02, tilt=.35)
    base.update({'bend': .30, 'head': (-.20, 0, 0), 'neck': (-.10, 0, 0)})
    behind = T.R(YANKER_BEHIND)
    back = T.R(.40)
    # Geng's belt (the small of his back) in this frame: his kneeling pelvis .55 m up, .12 m behind his root
    belt0 = (0.0, -behind + T.R(.12) + .06, T.R(.60))
    beltPath = Channel([(0.0, belt0), (YANK_T, belt0), (YANK_T + .25, Add3(belt0, (0, back * .7, .02))), (2.1, Add3(belt0, (0, back * 1.2, -.12))), (D, Add3(belt0, (0, back * 1.2, -.14)))])
    p0 = base['pelvis']
    sat = KneelFlat(T, 0.0, back, sit=.55)
    body = Tracks(base, {
        'pelvis': [(0.0, p0), (.6, Add3(p0, (0, -.12, .06))), (1.1, Add3(p0, (0, -.16, .08))), (YANK_T, Add3(p0, (0, -.10, .10))), (YANK_T + .25, Add3(p0, (0, back * .6, .0))),
                   (2.1, (0, sat['pelvis'][1] + .04, sat['pelvis'][2])), (D, (0, sat['pelvis'][1] + .04, sat['pelvis'][2]))],
        'pelvisTilt': [(0.0, base['pelvisTilt']), (1.1, (.45, 0, 0)), (YANK_T + .25, (-.1, 0, 0)), (2.1, (-.45, 0, 0)), (D, (-.40, 0, 0))],
        'bend': [(0.0, .30), (1.1, .55), (YANK_T, .50), (YANK_T + .25, .10), (2.1, -.10), (D, -.05)],
        'neck': [(0.0, (-.15, 0, 0)), (1.1, (-.30, 0, 0)), (YANK_T + .25, (.0, 0, 0)), (2.1, (-.2, 0, 0))],
        'head': [(0.0, (-.20, 0, 0)), (1.1, (-.35, 0, 0)), (YANK_T + .25, (-.1, 0, 0)), (2.1, (-.3, 0, 0))],
        'shrug': [(0.0, .04), (1.1, .10), (YANK_T + .1, .20), (2.1, .06)],
        'ankle.L': [(0.0, base['ankle.L']), (YANK_T, base['ankle.L']), (YANK_T + .3, sat['ankle.L']), (D, sat['ankle.L'])],
        'ankle.R': [(0.0, base['ankle.R']), (YANK_T, base['ankle.R']), (YANK_T + .3, sat['ankle.R']), (D, sat['ankle.R'])],
        'legPole.L': [(0.0, base['legPole.L']), (YANK_T, base['legPole.L']), (D, sat['legPole.L'])],
        'legPole.R': [(0.0, base['legPole.R']), (YANK_T, base['legPole.R']), (D, sat['legPole.R'])],
    }, lag={'head': .04})
    gripW = Channel([(0.0, 0.0), (.6, 0.0), (1.1, 1.0), (1.65, 1.0), (1.85, 0.0), (D, 0.0)])

    def Pose(t):
        f = body(t)
        w = gripW(t)
        b = beltPath(t)
        if t > 1.75:
            for s in LR:
                f['handRel.' + s] = (Sig(s) * .34, .10, -.28)
                f['poleRel.' + s] = (Sig(s) * .5, .35, -.1)
                f['palmF.' + s], f['palmN.' + s], f['curl.' + s] = (0, -.5, -.85), (-Sig(s), 0, 0), .4
        for s in LR:
            f['handRel.' + s] = (Sig(s) * .12, -.30, -.30)
            f['poleRel.' + s] = (Sig(s) * .5, .2, -.3)
            if w > 1e-3:
                Grip(f, s, (b[0] + Sig(s) * .09, b[1], b[2]), (0, -.8, -.6), (0, .4, -.9), .95, (Sig(s) * (SX + .5), b[1] + .3, b[2] + .35), w)
                f['handRel.' + s] = (Sig(s) * .12, -.30, -.30)
        return T.Nest(f)

    def Review(t):
        b = beltPath(t)
        return [('cyl', (.25, b[1], b[2]), (-.25, b[1], b[2]), .04), ('cyl', (0, b[1] - .05, b[2] - .55), (0, b[1] - .05, b[2] + .35), .12)]
    return {'pose': Pose, 'props': lambda t: {'weapon': SlungTrack(T, 'back')}, 'plants': [], 'kneePlants': [('L', 0, YANK_T), ('R', 0, YANK_T)],
            'reach': {'fraction': .95, 'travel': .10, 'bend': .2, 'sink': .02}, 'check': lambda t: {'L': Add3(beltPath(t), (.09, 0, 0)), 'R': Add3(beltPath(t), (-.09, 0, 0))} if 1.1 <= t <= 1.65 else {},
            'reviewProps': Combine(Review, SlungReview(T)), 'reviewViews': Views(cy=-.3, cz=.6, far=3.4, h=.9), 'reviewScale': 3.0,
            'reviewFrames': lambda n: [0, int(n * .3), int(n * .46), int(round(n * YANK_T / D)), int(n * .72), n - 1]}


# ===============================================================================================================
# VilNraCarryOnBack / VilRideOnBack
# ===============================================================================================================
@Builder('VilNraCarryOnBack')
def BuildCarryOnBack(T, name):
    D = CARRY_CYCLE
    H, P, SX = T.H, T.P, T.SX
    base = Standing(T)

    def Pose(t):
        f = dict(base)
        ph = (t / D) % 1.0
        WalkFeet(T, f, ph, CARRY_SPEED, D, lift=.07, spread=.05)
        bob = math.cos(Tau * 2 * ph)
        f['pelvis'] = (.012 * math.sin(Tau * ph), .02, P - .10 + .012 * bob)
        f['pelvisTilt'] = (.55, 0, 0)
        f['bend'] = .32 + .015 * bob
        f['twist'] = .04 * math.sin(Tau * ph)
        f['neck'] = (-.30, 0, 0)
        f['head'] = (-.30, 0, 0)
        f['shrug'] = .10
        # hands hooked under the rider's knees at his own hips (torso frame: out, a little back, down)
        for s in LR:
            Rel(f, s, (Sig(s) * .28, .02, -.38), (Sig(s) * .55, .35, -.10), (0, -.6, -.8), (-Sig(s) * .3, -.6, .7), .85)
        return T.Nest(f)

    def Review(t):
        return [('cyl', (.25, .12, .62), (-.25, .12, .62), .09)]
    return {'pose': Pose, 'props': lambda t: {'weapon': SlungTrack(T, 'shoulder')}, 'plants': [], 'reach': {'fraction': 2.0},
            'reviewProps': Combine(Review, SlungReview(T, 'shoulder')), 'reviewViews': Views(cy=.0, cz=.8, far=3.2), 'reviewScale': 2.6,
            'reviewFrames': lambda n: [0, n // 4, n // 2]}


@Builder('VilRideOnBack')
def BuildRideOnBack(T, name):
    D = CARRY_CYCLE
    H, SX = T.H, T.SX
    pel = RT(T, RIDER_PELVIS)
    base = Standing(T)
    base.update({'pelvis': pel, 'pelvisTilt': (.75, 0, 0), 'bend': .25, 'lean': 0.0, 'twist': 0.0, 'neck': (.35, 0, 0), 'head': (.30, .25, .35), 'shrug': .12,
                 'foot.L': None, 'foot.R': None})

    def Pose(t):
        f = dict(base)
        ph = (t / D) % 1.0
        bob = math.cos(Tau * 2 * ph)
        f['pelvis'] = (pel[0] + .012 * math.sin(Tau * ph), pel[1], pel[2] + .012 * bob)
        f['bend'] = .25 + .01 * bob
        # the knees forward round the carrier's hips, the shins hanging down-forward
        for s in LR:
            f['ankle.' + s] = (Sig(s) * (H + .14), pel[1] - .42, pel[2] - .42 + .01 * bob)
            f['legPole.' + s] = (Sig(s) * (H + .20), pel[1] - 1.2, pel[2] + .25)
            f['toeDir.' + s] = Unit((Sig(s) * .1, -.75, -.65))
            # the arms over the carrier's shoulders, hanging down his chest
            World(f, s, (Sig(s) * .13, pel[1] - .60, pel[2] - .14 + .01 * bob), (Sig(s) * (SX + .55), pel[1] - .35, pel[2] + .40), (0, -.2, -1), (-Sig(s), 0, 0), .3)
        return T.Nest(f)
    return {'pose': Pose, 'plants': [], 'groundWeight': lambda t: 0.0, 'reach': {'fraction': 2.0},
            'reviewViews': Views(cy=.0, cz=.9, far=3.2), 'reviewScale': 2.6, 'reviewFrames': lambda n: [0, n // 2]}


# ===============================================================================================================
# VilNraWaveCharge
# ===============================================================================================================
@Builder('VilNraWaveCharge')
def BuildWaveCharge(T, name):
    D = 1.6
    H, A, P, SX, SZ = T.H, T.A, T.P, T.SX, T.SZ
    far = T.R(WAVE_M)
    crouch = Standing(T)
    crouch.update({'pelvis': (0, .06, .48), 'pelvisTilt': (.45, 0, 0), 'bend': .45, 'head': (-.25, 0, 0), 'neck': (-.10, 0, 0),
                   'ankle.L': (H + .10, -.12, A), 'ankle.R': (-(H + .10), .10, A), 'legPole.L': (H + .45, -1.1, .7), 'legPole.R': (-(H + .45), -1.1, .7),
                   'foot.L': (0, 10, 0), 'foot.R': (0, -10, 0)})
    rowsL, plL, _, _ = Steps(T, 'L', crouch['ankle.L'], [(.75, .98, (H + .04, -far * .45)), (1.32, 1.58, (H + .04, -far - .30))], lift=.12)
    rowsR, plR, _, _ = Steps(T, 'R', crouch['ankle.R'], [(.45, .70, (-(H + .04), -.30)), (1.02, 1.28, (-(H + .04), -far * .85))], lift=.12)
    pelvY = Channel([(0.0, .06), (.35, .06), (.70, -.15), (1.0, -far * .35), (1.3, -far * .7), (D, -far)])
    pelvZ = Channel([(0.0, .48), (.30, .46), (.55, P - .10), (.80, P - .06), (D, P - .09)])
    tilt = Channel([(0.0, .45), (.55, .25), (1.0, .30), (D, .32)])
    bend = Channel([(0.0, .45), (.55, .20), (.80, .15), (1.1, .25), (D, .28)])
    rifle0 = Rifle(T, (-(H + .08), -.16, .72), Unit((.10, -.95, .25)))
    rifle1 = Rifle(T, (-(H + .08), -.18, P - .08), Unit((.12, -.95, .20)))
    rifleAt = RifleKeys(T, [(0.0, rifle0), (.30, rifle0), (.65, rifle1), (D, rifle1)])
    wave = Channel([(0.0, 0.0), (.35, 0.0), (.60, .6), (.78, 1.0), (1.0, .6), (1.3, 0.0), (D, 0.0)])

    def Pose(t):
        f = dict(crouch)
        y = pelvY(t)
        f['pelvis'] = (0, y, pelvZ(t))
        f['pelvisTilt'] = (tilt(t), 0, 0)
        f['bend'] = bend(t)
        f['neck'] = (-.10 - .05 * wave(t), 0, 0)
        f['head'] = (-.25 + .15 * Smooth((t - .5) / .4), 0, 0)
        f['shrug'] = .04 + .08 * wave(t)
        for s, rows in (('L', rowsL), ('R', rowsR)):
            a = Channel(rows)(t)
            f['ankle.' + s] = a
            f['legPole.' + s] = (a[0] + Sig(s) * .25, a[1] - 1.0, a[2] + .6)
            f['foot.' + s] = (0, Sig(s) * 6, 0)
        r = Rifle(T, Add3(rifleAt(t)['origin'], (0, y, 0)), rifleAt(t)['axis'])
        HoldRifle(T, f, r, sides='R')
        f['armPole.R'] = (-(SX + .45), y + .30, P - .10)
        # the left arm: from the knee, up past the ear and forward over the head, down to a running pump
        w = wave(t)
        up = Smooth((t - .35) / .25)
        aheadHigh = (SX + .05, y - .55, SZ + .35)
        pump = (SX + .05, y - .25 + .12 * math.sin(Tau * t / .55), P - .05)
        hand = Lerp3(Lerp3((SX + .10, y - .25, .55), (SX + .12, y + .10, SZ + .45), up), aheadHigh, w) if t < 1.0 else Lerp3(aheadHigh, pump, Smooth((t - 1.0) / .3))
        World(f, 'L', hand, (SX + .55, y + .2, SZ + .2), (0, -1, .2), (0, 0, 1), .25)
        return T.Nest(f)
    spec = {'pose': Pose, 'props': lambda t: {'weapon': RifleTrack(Rifle(T, Add3(rifleAt(t)['origin'], (0, pelvY(t), 0)), rifleAt(t)['axis']))},
            'plants': plL + plR, 'check': lambda t: {'R': Add3(rifleAt(t)['gripR'], (0, pelvY(t), 0))}, 'reach': {'fraction': .95, 'travel': .04, 'bend': .2, 'sink': .0},
            'reviewProps': lambda t: RifleReview(T, Rifle(T, Add3(rifleAt(t)['origin'], (0, pelvY(t), 0)), rifleAt(t)['axis'])) + [Box((0, .55, .45), (1.6, .3, .9), 0)],
            'reviewViews': Views(cy=-.4, cz=.8, far=3.6), 'reviewScale': 3.0, 'reviewFrames': lambda n: [0, int(n * .28), int(n * .48), int(n * .7), n - 1]}
    return spec


# ===============================================================================================================
# IJA: bayonet thrust, drag by the arm, grenade lob, lift-fling, piss stand, pin, shoulder charge, gate smash, wall climb
# ===============================================================================================================
@Builder('VilIjaBayonetThrust')
def BuildBayonetThrust(T, name):
    D = 1.4
    H, A, P, SX, SZ = T.H, T.A, T.P, T.SX, T.SZ
    base = IjaReadyBase(T)
    base.update({'handRel.L': None, 'handRel.R': None})
    guard = Rifle(T, (-(H + .04), -.10, P + .16), Unit((.12, -.92, .30)))
    cock = Rifle(T, (-(H + .02), .06, P + .20), Unit((.08, -.95, .20)))
    thrust = Rifle(T, RT(T, THRUST_GRIP), Unit(THRUST_AXIS))
    rifleAt = RifleKeys(T, [(0.0, guard), (.22, cock), (THRUST_T, thrust), (.70, thrust), (.95, Rifle(T, Add3(thrust['origin'], (0, .30, .03)), thrust['axis'])), (1.25, guard), (D, guard)])
    aL = base['ankle.L']
    stepL = Add3(aL, (.02, -.32, 0))
    body = Tracks(base, {
        'ankle.L': [(0.0, aL), (.18, aL), (.28, Add3(aL, (0, -.16, .08))), (.40, stepL), (1.05, stepL), (1.15, Add3(stepL, (0, .16, .06))), (1.28, aL), (D, aL)],
        'legPole.L': [(0.0, base['legPole.L']), (.40, Add3(base['legPole.L'], (0, -.3, 0))), (1.28, base['legPole.L'])],
        'pelvis': [(0.0, base['pelvis']), (.22, Add3(base['pelvis'], (0, .04, 0))), (THRUST_T, Add3(base['pelvis'], (0, -.22, -.06))), (.70, Add3(base['pelvis'], (0, -.22, -.06))),
                   (.95, Add3(base['pelvis'], (0, -.08, -.04))), (1.25, base['pelvis'])],
        'pelvisTilt': [(0.0, (.06, 0, 0)), (THRUST_T, (.18, 0, 0)), (.95, (.10, 0, 0)), (1.25, (.06, 0, 0))],
        'bend': [(0.0, .20), (.22, .15), (THRUST_T, .30), (.70, .32), (.95, .22), (1.25, .20)],
        'twist': [(0.0, -.05), (.22, -.18), (THRUST_T, .12), (.95, -.02), (1.25, -.05)],
        'shrug': [(0.0, 0.0), (THRUST_T, .12), (.95, .04), (1.25, 0.0)],
        'head': [(0.0, (.22, 0, 0)), (THRUST_T, (.10, 0, 0)), (1.25, (.22, 0, 0))],
    }, lag={'head': .04})

    def Pose(t):
        f = body(t)
        r = rifleAt(t)
        HoldRifle(T, f, r)
        f['armPole.R'] = (-(SX + .50), .30, P - .05)
        f['armPole.L'] = (SX + .45, -.05, P - .05)
        f['look'] = tuple(Vector(r['tip']) + Vector((0, -.5, .2)))
        f['lookW'] = .6
        return T.Nest(f)
    v, tip = VictimInIja(T)
    tipS = RT(T, tip)
    return {'pose': Pose, 'props': lambda t: {'weapon': RifleTrack(rifleAt(t))}, 'plants': [('R', 0, D), ('L', 0, .18), ('L', .40, 1.05), ('L', 1.28, D)],
            'check': lambda t: {'R': rifleAt(t)['gripR'], 'L': rifleAt(t)['gripL']},
            'probes': lambda t: {'tipToBelly': (rifleAt(t)['tip'], tipS)} if abs(t - THRUST_T) < .021 else {},
            'reviewProps': lambda t: RifleReview(T, rifleAt(t)) + [('cyl', RT(T, (v[0], v[1], .05)), RT(T, (v[0], v[1], 1.5)), .12), ('point', tipS, None, .03)],
            'reviewViews': Views(cy=-.8, cz=.9, far=4.0), 'reviewScale': 3.4, 'reviewFrames': lambda n: [0, int(n * .16), int(round(n * THRUST_T / D)), int(n * .68), n - 1]}


@Builder('VilIjaDragByArm')
def BuildIjaDragByArm(T, name):
    D = DRAG_CYCLE
    H, P, SX, SZ = T.H, T.P, T.SX, T.SZ
    base = IjaABase(T)
    wrist = RT(T, DragWristInIja())

    def Pose(t):
        f = dict(base)
        ph = (t / D) % 1.0
        WalkFeet(T, f, ph, DRAG_SPEED, D, lift=.06, back=True, spread=.05)
        bob = math.cos(Tau * 2 * ph)
        f['pelvis'] = (.01 * math.sin(Tau * ph), .12, P - .22 + .01 * bob)
        f['pelvisTilt'] = (.60, 0, 0)
        f['bend'] = .45 + .02 * bob
        f['lean'] = .03 * math.sin(Tau * ph)
        f['neck'] = (-.10, 0, 0)
        f['head'] = (.05, 0, .10)
        f['shrug'] = .10
        Grip(f, 'R', Add3(wrist, (-.04, .0, .0)), (0, 1, -.2), (-.9, 0, -.3), 1.0, (-(SX + .50), .0, .55))
        Grip(f, 'L', Add3(wrist, (.05, -.06, .02)), (0, 1, -.2), (.9, 0, -.3), 1.0, (SX + .50, .0, .55))
        return T.Nest(f)

    def Review(t):
        vx, vy = RT(T, DRAG_VICTIM)
        return [('point', wrist, None, .03), ('cyl', (vx, vy + .55, .15), (vx, vy - .75, .15), .13)]
    return {'pose': Pose, 'props': lambda t: {'weapon': SlungTrack(T, 'back')}, 'plants': [], 'reach': {'fraction': .95, 'travel': .08, 'bend': .2, 'sink': .05},
            'check': lambda t: {'R': Add3(wrist, (-.04, 0, 0)), 'L': Add3(wrist, (.05, -.06, .02))},
            'reviewProps': Combine(Review, SlungReview(T)), 'reviewViews': Views(cy=-.3, cz=.8, far=3.4), 'reviewScale': 2.8,
            'reviewFrames': lambda n: [0, n // 4, n // 2]}


@Builder('VilIjaHelmetGrenadeLob')
def BuildGrenadeLob(T, name):
    D = 2.0
    H, A, P, SX, SZ = T.H, T.A, T.P, T.SX, T.SZ
    base = IjaABase(T)
    base.update({'handRel.R': None})
    knock = (-.03, -.10, T.HD + .07)                         # the helmet's crown front
    hold = (-(SX + .02), -.20, P + .05)
    back = (-(SX + .20), .30, SZ - .10)
    release = (-(SX - .02), -.45, SZ - .05)
    through = (-(SX - .10), -.55, P + .15)
    hand = Channel([(0.0, hold), (.30, (-(SX - .06), -.18, SZ - .05)), (.55, knock), (.62, Add3(knock, (0, 0, .02))), (.85, back), (1.0, back), (1.2, release), (1.4, through), (1.7, (-(SX + .02), -.14, P - .05)), (D, (-(SX + .02), -.10, P - .09))])
    rowsL, plL, _, _ = Steps(T, 'L', base['ankle.L'], [(1.0, 1.3, (H + .03, -.32))], lift=.08)
    body = Tracks(base, {
        'ankle.L': rowsL, 'legPole.L': [(0.0, base['legPole.L']), (1.3, Add3(base['legPole.L'], (0, -.3, 0)))],
        'pelvis': [(0.0, base['pelvis']), (.55, Add3(base['pelvis'], (0, .02, -.01))), (1.0, Add3(base['pelvis'], (0, .06, -.03))), (1.3, Add3(base['pelvis'], (0, -.14, -.05))), (D, Add3(base['pelvis'], (0, -.10, -.02)))],
        'bend': [(0.0, .10), (.55, .05), (1.0, -.05), (1.3, .30), (1.7, .25), (D, .15)],
        'twist': [(0.0, 0.0), (.55, -.08), (1.0, -.30), (1.3, .15), (D, .05)],
        'head': [(0.0, (.05, 0, 0)), (.55, (-.08, 0, 0)), (1.0, (.0, 0, 0)), (1.3, (.35, 0, 0)), (D, (.30, 0, 0))],
        'shrug': [(0.0, 0.0), (.55, .06), (1.0, .12), (1.3, .02)],
    }, lag={'head': .04})
    pit = (0, -T.R(1.5), -T.R(1.5))

    def Grenade(t):
        if t <= 1.2:
            h = hand(t)
            return (tuple(Vector(h) + Vector((0, -.06, .03))), (0, -.3, .95), (0, -1, 0), True)
        u = Clamp((t - 1.2) / .5)
        h = Vector(hand(1.2)) + Vector((0, -.06, .03))
        p = h.lerp(Vector(pit), u)
        p.z = h.z + (pit[2] - h.z) * u * u + .35 * math.sin(math.pi * u)
        return (tuple(p), (0, -.3, .95), (0, -1, 0), u < 1.0)

    def Pose(t):
        f = body(t)
        c = Smooth((t - 1.15) / .12)
        World(f, 'R', hand(t), (-(SX + .50), .30, SZ - .15), Lerp3((0, -.6, -.8), (0, -.9, -.4), c), Lerp3((.9, -.2, .3), (.9, 0, 0), c), .95 - .6 * c)
        return T.Nest(f)
    return {'pose': Pose, 'props': lambda t: {'grenade': Grenade(t), 'weapon': SlungTrack(T, 'back')}, 'plants': plL + [('R', 0, D)],
            'check': lambda t: {'R': knock} if abs(t - .55) < .021 else {}, 'reach': {'fraction': .95, 'travel': .04, 'bend': .1, 'sink': 0.0},
            'reviewProps': Combine(lambda t: [('point', Grenade(t)[0], None, .035)] if Grenade(t)[3] else [], SlungReview(T), lambda t: [Box((0, -T.R(1.5) - .5, -T.R(.75)), (2.0, 1.4, T.R(1.5)), 0)]),
            'reviewViews': Views(cy=-.3, cz=1.0, far=3.4), 'reviewScale': 2.8, 'reviewFrames': lambda n: [0, int(n * .27), int(n * .5), int(n * .6), int(n * .7), n - 1]}


@Builder('VilIjaBayonetLiftFling')
def BuildLiftFling(T, name):
    D = 2.2
    H, A, P, SX, SZ = T.H, T.A, T.P, T.SX, T.SZ
    base = IjaReadyBase(T)
    base.update({'handRel.L': None, 'handRel.R': None})
    ready = LowReady(T)
    raised = Rifle(T, (-(H + .04), -.22, SZ + .05), Unit((.10, -.60, -.79)))
    stab = Rifle(T, RT(T, (-.13, -.25, 1.23)), Unit((.06, -.57, -.82)))          # the point in the bundle 1.1 m ahead, on the ground
    lifted = Rifle(T, RT(T, (-.11, -.26, 1.02)), Unit((.04, -.99, -.12)))        # the point hooked up to .85 m, 1.65 m ahead
    flung = Rifle(T, RT(T, (.10, -.22, 1.0)), Unit((.80, -.55, .25)))            # swung across to his left, chest high
    rifleAt = RifleKeys(T, [(0.0, ready), (.25, raised), (.50, stab), (.75, stab), (1.10, lifted), (1.30, lifted), (1.50, flung), (1.75, Rifle(T, Add3(flung['origin'], (-.1, 0, -.1)), flung['axis'])), (D, ready)])
    body = Tracks(base, {
        'pelvis': [(0.0, base['pelvis']), (.25, Add3(base['pelvis'], (0, .0, .0))), (.50, Add3(base['pelvis'], (0, -.08, -.14))), (.75, Add3(base['pelvis'], (0, -.08, -.14))),
                   (1.10, Add3(base['pelvis'], (0, -.02, -.02))), (1.50, Add3(base['pelvis'], (.04, .0, 0))), (D, base['pelvis'])],
        'bend': [(0.0, .20), (.25, .05), (.50, .55), (.75, .55), (1.10, .10), (1.50, .05), (D, .20)],
        'twist': [(0.0, -.05), (.50, .05), (1.10, 0.0), (1.50, .40), (1.75, .42), (D, -.05)],
        'pelvisTilt': [(0.0, (.06, 0, 0)), (.50, (.25, 0, 0)), (1.10, (.06, 0, 0))],
        'head': [(0.0, (.22, 0, 0)), (.50, (.40, 0, 0)), (1.10, (.10, 0, 0)), (1.50, (.05, 0, .35)), (D, (.22, 0, 0))],
        'shrug': [(0.0, 0.0), (.50, .10), (1.10, .14), (1.50, .06), (D, 0.0)],
    }, lag={'head': .04})

    def Pose(t):
        f = body(t)
        r = rifleAt(t)
        HoldRifle(T, f, r)
        f['armPole.R'] = (-(SX + .50), .25, P - .10)
        f['armPole.L'] = (SX + .45, -.05, P - .10)
        return T.Nest(f)
    return {'pose': Pose, 'props': lambda t: {'weapon': RifleTrack(rifleAt(t))}, 'plants': [('L', 0, D), ('R', 0, D)],
            'check': lambda t: {'R': rifleAt(t)['gripR'], 'L': rifleAt(t)['gripL']}, 'reach': {'fraction': .92, 'travel': .10, 'bend': .3, 'sink': .15},
            'reviewProps': lambda t: RifleReview(T, rifleAt(t)) + [Box((-.05, -T.R(1.1), .08), (.5, .4, .16), 0)],
            'reviewViews': Views(cy=-.4, cz=.8, far=3.4), 'reviewScale': 3.0, 'reviewFrames': lambda n: [0, int(n * .23), int(n * .5), int(n * .68), int(n * .8), n - 1]}


@Builder('VilIjaPissStand')
def BuildPissStand(T, name):
    D = 3.0
    H, P, SX, SZ = T.H, T.P, T.SX, T.SZ
    base = IjaABase(T)
    base.update({'bend': .06, 'head': (.25, 0, 0), 'neck': (.08, 0, 0), 'ankle.L': (H + .10, -.02, T.A), 'ankle.R': (-(H + .10), .02, T.A)})
    loopEnd = PIN_HOLD[1] if False else 2.0

    def Pose(t):
        f = dict(base)
        u = min(t, loopEnd)
        sway = math.sin(Tau * u / loopEnd)
        f['lean'] = .03 * sway
        f['twist'] = .02 * math.sin(Tau * 2 * u / loopEnd)
        f['bend'] = .06 + .01 * math.sin(Tau * 2 * u / loopEnd)
        f['pelvis'] = Add3(base['pelvis'], (.01 * sway, 0, 0))
        exitW = Smooth((t - loopEnd) / .5)
        turn = Smooth((t - 2.6) / .4)
        f['head'] = (.25 - .30 * exitW, 0, .75 * turn)
        f['neck'] = (.08 - .08 * exitW, 0, .20 * turn)
        f['twist'] += .12 * turn
        crotchL, crotchR = (-.09, -.14, -.46), (.09, -.14, -.46)
        beltL, beltR = (-.13, -.13, -.38), (.13, -.13, -.38)
        fiddle = Bump(t, 2.05, 2.55) * .02
        Rel(f, 'L', Add3(Lerp3(crotchL, beltL, exitW), (0, 0, fiddle)), (.45, .30, -.30), (-.3, -.9, -.3), (.9, -.3, -.2), .6)
        Rel(f, 'R', Add3(Lerp3(crotchR, beltR, exitW), (0, 0, -fiddle)), (-.45, .30, -.30), (.3, -.9, -.3), (-.9, -.3, -.2), .6)
        return T.Nest(f)
    return {'pose': Pose, 'props': lambda t: {'weapon': SlungTrack(T, 'back')}, 'plants': [('L', 0, D), ('R', 0, D)],
            'reviewProps': SlungReview(T), 'reviewViews': Views(cy=-.1, cz=.9), 'reviewScale': 2.6, 'reviewFrames': lambda n: [0, int(n * .3), int(n * .78), n - 1]}


def KneelAstride(T, spread=.16, sit=.10):
    f = Standing(T)
    f.update(KneelFlat(T, 0.0, 0.0, sit=sit))
    for s in LR:
        f['ankle.' + s] = Add3(f['ankle.' + s], (Sig(s) * spread, 0, 0))
        f['legPole.' + s] = Add3(f['legPole.' + s], (Sig(s) * spread, 0, 0))
    f.update({'handRel.L': None, 'handRel.R': None})
    return f


@Builder('VilIjaPinBayonet')
def BuildPinBayonet(T, name):
    D = 3.0
    H, P, SX, SZ = T.H, T.P, T.SX, T.SZ
    base = KneelAstride(T)
    base.update({'bend': .55, 'pelvisTilt': (.30, 0, 0), 'head': (.15, 0, 0), 'neck': (.05, 0, 0), 'shrug': .10})
    press = Rifle(T, RT(T, PIN_GRIPR), Unit(PIN_AXIS))
    loopEnd = PIN_HOLD[1]
    p0 = base['pelvis']
    # exit: the right hand flung up and back, the trunk rears, the rifle tips in the left hand
    rear = Channel([(0.0, 0.0), (loopEnd, 0.0), (loopEnd + .12, .5), (loopEnd + .45, 1.0), (D, 1.0)])
    handUp = Channel([(0.0, 0.0), (loopEnd, 0.0), (loopEnd + .20, 1.0), (D, 1.0)])

    def Pose(t):
        f = dict(base)
        u = min(t, loopEnd)
        strain = math.sin(Tau * u * 5 / loopEnd) * .006            # the tremor (whole cycles over the loop)
        push = .5 - .5 * math.cos(Tau * u / loopEnd)
        r = rear(t)
        f['bend'] = .55 + .04 * push - .75 * r
        f['shrug'] = .10 + .02 * push + .10 * r
        f['pelvisTilt'] = (.30 - .50 * r, 0, 0)
        f['pelvis'] = Add3(p0, (0, .008 * push + .10 * r, -.01 * push + .04 * r))
        f['head'] = (.15 + .05 * push - .70 * r, 0, -.25 * r)
        f['neck'] = (.05 - .30 * r, 0, 0)
        rifle = Rifle(T, Add3(press['origin'], (0, strain, strain * 1.5 - .02 * push)), press['axis'])
        if r > 1e-3:
            tipped = Rifle(T, Add3(press['origin'], (.05, .22 * r, .22 * r)), Unit(Lerp3(press['axis'], (.90, .10, -.30), r)))
            rifle = tipped
        HoldRifle(T, f, rifle, sides='L')
        f['armPole.L'] = (SX + .50, .10, P - .05)
        hu = handUp(t)
        if hu < 1e-3:
            HoldRifle(T, f, rifle, sides='R')
        else:
            Grip(f, 'R', rifle['gripR'], T.Palms(rifle['axis'])['R'][0], T.Palms(rifle['axis'])['R'][1], .95, (-(SX + .50), .20, P), 1 - hu)
            f['handRel.R'] = (-.27, .12, .36)
            f['poleRel.R'] = (-.55, .35, .10)
            f['palmFw.R'], f['palmNw.R'] = (0, -.5, .85), (.9, 0, .3)
            f['curl.R'] = .3
        f['armPole.R'] = (-(SX + .50), .20, P)
        return T.Nest(f)
    w = PinWrist(T)

    def Review(t):
        return RifleReview(T, press) + [('point', RT(T, w), None, .03), ('cyl', (0, -.15, .12), (0, -1.0, .12), .14)]
    return {'pose': Pose, 'props': lambda t: {'weapon': RifleTrack(Rifle(T, press['origin'], press['axis']))}, 'plants': [], 'kneePlants': [('L', 0, D), ('R', 0, D)],
            'check': lambda t: {'R': press['gripR'], 'L': press['gripL']} if t < loopEnd else {}, 'reach': {'fraction': .95, 'travel': .06, 'bend': .2, 'sink': .05},
            'reviewProps': Review, 'reviewViews': Views(cy=-.3, cz=.6, far=3.2, h=.9), 'reviewScale': 2.6,
            'reviewFrames': lambda n: [0, int(n * .3), int(round(n * loopEnd / D)), int(n * .76), n - 1]}


@Builder('VilIjaShoulderCharge')
def BuildShoulderCharge(T, name):
    D = 1.4
    H, A, P, SX, SZ = T.H, T.A, T.P, T.SX, T.SZ
    far = T.R(CHARGE_M)
    base = IjaABase(T)
    base.update({'handRel.L': None, 'handRel.R': None})
    rowsR, plR, _, _ = Steps(T, 'R', base['ankle.R'], [(.05, .30, (-(H + .02), -far * .30)), (.65, .90, (-(H + .02), -far * .78))], lift=.10)
    rowsL, plL, _, _ = Steps(T, 'L', base['ankle.L'], [(.35, .60, (H + .02, -far * .55)), (.95, 1.20, (H + .02, -far - .20))], lift=.10)
    pelvY = Channel([(0.0, .02), (.30, -far * .12), (.60, -far * .38), (.90, -far * .62), (1.2, -far * .9), (D, -far)])
    rifle = Rifle(T, (-(H + .10), -.16, P + .18), Unit((.75, -.55, .35)))

    def Pose(t):
        f = dict(base)
        y = pelvY(t)
        bob = math.cos(Tau * 2 * t / .6)
        f['pelvis'] = (-.02, y, P - .14 + .015 * bob)
        f['pelvisTilt'] = (.40, 0, 0)
        f['bend'] = .30 + .02 * bob
        f['twist'] = .40
        f['lean'] = -.12
        f['head'] = (.05, .10, -.35)
        f['neck'] = (-.10, 0, -.10)
        f['shrug'] = .12
        for s, rows in (('L', rowsL), ('R', rowsR)):
            a = Channel(rows)(t)
            f['ankle.' + s] = a
            f['legPole.' + s] = (a[0] + Sig(s) * .2, a[1] - 1.0, a[2] + .6)
            f['foot.' + s] = (0, Sig(s) * 5, 0)
        r = Rifle(T, Add3(rifle['origin'], (0, y, 0)), rifle['axis'])
        HoldRifle(T, f, r)
        f['armPole.R'] = (-(SX + .45), y + .35, P - .10)
        f['armPole.L'] = (SX + .40, y + .10, P - .20)
        return T.Nest(f)
    R = lambda t: Rifle(T, Add3(rifle['origin'], (0, pelvY(t), 0)), rifle['axis'])
    return {'pose': Pose, 'props': lambda t: {'weapon': RifleTrack(R(t))}, 'plants': plL + plR, 'check': lambda t: {'R': R(t)['gripR'], 'L': R(t)['gripL']},
            'reach': {'fraction': 2.0}, 'reviewProps': lambda t: RifleReview(T, R(t)) + [Box((.55, .45, 1.0), (.3, .3, 2.0), 0), Box((-.55, .45, 1.0), (.3, .3, 2.0), 0)],
            'reviewViews': Views(cy=-.6, cz=.9, far=3.8), 'reviewScale': 3.2, 'reviewFrames': lambda n: [0, int(n * .3), int(n * .6), n - 1]}


@Builder('VilIjaGateSmash')
def BuildGateSmash(T, name):
    D = 2.4
    H, A, P, SX, SZ = T.H, T.A, T.P, T.SX, T.SZ
    base = IjaReadyBase(T)
    base.update({'handRel.L': None, 'handRel.R': None})
    gate = T.R(GATE_M)
    ready = LowReady(T)
    cocked = RifleFromButt(T, (-.06, -.22, SZ - .38), Unit((-.25, .45, .86)))
    hit = RifleFromButt(T, (-.02, -gate + .01, T.R(1.0)), Unit((-.25, .85, .45)))
    rifleAt = RifleKeys(T, [(0.0, ready), (.20, cocked), (.45, hit), (.55, hit), (.75, cocked), (.95, hit), (1.05, hit), (1.25, cocked), (1.40, Rifle(T, (-(H + .04), -.10, P + .20), Unit((.12, -.92, .30)))), (2.1, Rifle(T, (-(H + .04), -.10, P + .20), Unit((.12, -.92, .30)))), (D, ready)])
    aR = base['ankle.R']
    kick = (-(H + .02), -gate + .02, T.R(.55))
    body = Tracks(base, {
        'ankle.R': [(0.0, aR), (1.30, aR), (1.45, (-(H + .02), -.20, .30)), (1.60, kick), (1.68, Add3(kick, (0, .04, -.02))), (1.95, Add3(aR, (0, -.05, .05))), (2.05, aR), (D, aR)],
        'legPole.R': [(0.0, base['legPole.R']), (1.45, (-(H + .30), -1.0, 1.1)), (1.60, (-(H + .30), -.6, 1.3)), (2.05, base['legPole.R'])],
        'foot.R': [(0.0, base['foot.R']), (1.40, base['foot.R']), (1.60, (-60, -4, 0)), (2.05, base['foot.R'])],
        'pelvis': [(0.0, base['pelvis']), (.20, Add3(base['pelvis'], (0, .04, 0))), (.45, Add3(base['pelvis'], (0, -.08, -.03))), (.75, Add3(base['pelvis'], (0, .02, 0))), (.95, Add3(base['pelvis'], (0, -.08, -.03))),
                   (1.25, base['pelvis']), (1.60, Add3(base['pelvis'], (0, -.06, .02))), (2.05, base['pelvis'])],
        'bend': [(0.0, .20), (.20, .05), (.45, .35), (.75, .05), (.95, .35), (1.25, .20), (1.60, .05), (2.05, .20)],
        'pelvisTilt': [(0.0, (.06, 0, 0)), (1.45, (.06, 0, 0)), (1.60, (-.15, 0, 0)), (2.05, (.06, 0, 0))],
        'twist': [(0.0, -.05), (.20, -.25), (.45, .10), (.75, -.25), (.95, .10), (1.25, -.05), (1.60, -.15), (2.05, -.05)],
        'shrug': [(0.0, 0.0), (.45, .10), (.75, .02), (.95, .10), (1.25, 0.0)],
    }, lag={'head': .04})

    def Pose(t):
        f = body(t)
        r = rifleAt(t)
        HoldRifle(T, f, r)
        f['armPole.R'] = (-(SX + .50), .35, P + .05)
        f['armPole.L'] = (SX + .45, -.05, P)
        f['look'] = (0, -gate, T.R(1.2))
        f['lookW'] = .5
        return T.Nest(f)
    walls = [((0, -gate, 0), (0, 1, 0))]
    return {'pose': Pose, 'props': lambda t: {'weapon': RifleTrack(rifleAt(t))}, 'plants': [('L', 0, D), ('R', 0, 1.30), ('R', 2.05, D)],
            'check': lambda t: {'R': rifleAt(t)['gripR'], 'L': rifleAt(t)['gripL']}, 'walls': walls,
            'probes': lambda t: {'buttToGate': (rifleAt(t)['butt'], (rifleAt(t)['butt'][0], -gate, rifleAt(t)['butt'][2]))} if abs(t - .45) < .021 or abs(t - .95) < .021 else {},
            'reviewProps': lambda t: RifleReview(T, rifleAt(t)) + [Box((0, -gate - .03, 1.0), (1.6, .06, 2.0), 0)],
            'reviewViews': [('side', (-3.4, -.3, 1.2), (0, -.3, .9)), ('q', (-2.4, 2.4, 2.0), (0, -.3, .9)), ('back', (.2, 3.2, 1.2), (0, -.3, .9))], 'reviewScale': 3.0,
            'reviewFrames': lambda n: [0, int(round(n * .45 / D)), int(n * .33), int(round(n * 1.6 / D)), n - 1]}


@Builder('VilIjaClimbWall')
def BuildClimbWall(T, name):
    D = 3.4
    H, A, P, SX, SZ = T.H, T.A, T.P, T.SX, T.SZ
    face, top, thick = T.R(WALL_FACE), T.R(WALL_H), T.R(WALL_THICK)
    farY = -(face + thick + T.R(.40))
    base = IjaABase(T)
    base.update({'handRel.L': None, 'handRel.R': None})
    gL0, gR0 = (.18, -face - .02, top + .02), (-.18, -face - .02, top + .02)       # the near edge of the top
    gL1, gR1 = (.30, -face - thick + .02, top + .02), (-.30, -face - thick + .02, top + .02)
    gFar = (.20, -face - thick + .02, top + .02)
    aL, aR = base['ankle.L'], base['ankle.R']
    pelv = Channel([(0.0, base['pelvis']), (.25, (0, -.04, P - .12)), (.50, (0, -face + .36, top - .95)), (.80, (0, -face + .34, top - .98)),
                    (1.50, (0, -face + .12, top - .15)), (2.10, (0, -face - thick / 2, top + .08)), (2.70, (0, -face - thick - .20, top - .60)),
                    (2.90, (0, -face - thick - .22, top - .62)), (3.20, (0, farY, P - .22)), (3.30, (0, farY, P - .30)), (D, (0, farY, P - .05))])
    tilt = Channel([(0.0, .03), (.25, .25), (.50, .10), (1.50, .40), (2.10, .35), (2.70, .10), (3.20, .30), (D, .05)])
    bend = Channel([(0.0, .10), (.25, .25), (.50, .05), (1.50, .45), (2.10, .85), (2.70, .10), (3.20, .35), (D, .10)])
    ankL = Channel([(0.0, aL), (.25, aL), (.50, (H + .05, -face + .10, top - 1.75)), (.80, (H + .05, -face + .06, top - 1.60)), (1.50, (H + .05, -face + .04, top - .80)),
                    (2.10, (H + .20, -face + .02, top - .55)), (2.45, (H + .30, -face - thick / 2, top + .15)), (2.70, (H + .15, -face - thick - .06, top - .55)),
                    (2.90, (H + .15, -face - thick - .08, top - .60)), (3.20, (H + .05, farY + .02, A)), (D, (H + .04, farY - .02, A))])
    ankR = Channel([(0.0, aR), (.20, aR), (.50, (-(H + .05), -face + .12, top - 1.85)), (.80, (-(H + .05), -face + .06, top - 1.70)), (1.50, (-(H + .05), -face + .04, top - .95)),
                    (1.80, (-(H + .30), -face - thick / 2, top + .15)), (2.10, (-(H + .20), -face - thick - .06, top - .40)), (2.70, (-(H + .15), -face - thick - .06, top - .75)),
                    (2.90, (-(H + .15), -face - thick - .08, top - .78)), (3.20, (-(H + .05), farY - .04, A)), (D, (-(H + .06), farY + .02, A))])
    gripW = Channel([(0.0, 0.0), (.30, 0.0), (.50, 1.0), (2.90, 1.0), (2.96, 0.0), (D, 0.0)])
    handL = Channel([(0.0, gL0), (1.50, gL0), (2.10, gL1), (2.70, gFar), (D, gFar)])
    handR = Channel([(0.0, gR0), (1.50, gR0), (2.10, gR1), (2.70, (gFar[0] - .40, gFar[1], gFar[2])), (D, (gFar[0] - .40, gFar[1], gFar[2]))])
    ground = Channel([(0.0, 1.0), (.22, 1.0), (.30, 0.0), (3.18, 0.0), (3.24, 1.0), (D, 1.0)])

    def Pose(t):
        f = dict(base)
        f['pelvis'] = pelv(t)
        f['pelvisTilt'] = (tilt(t), 0, 0)
        f['bend'] = bend(t)
        f['twist'] = .25 * Bump(t, 1.5, 2.7)
        f['lean'] = .15 * Bump(t, 1.5, 2.7)
        f['head'] = (-.35 + .40 * Smooth((t - 2.7) / .35), 0, 0)
        f['neck'] = (-.15, 0, 0)
        f['shrug'] = .10
        for s, ch in (('L', ankL), ('R', ankR)):
            a = ch(t)
            f['ankle.' + s] = a
            onWall = Bump(t, .30, 2.95)
            f['legPole.' + s] = (a[0] + Sig(s) * .25, a[1] - .9 + .4 * onWall, a[2] + .5 + .3 * onWall)
            f['foot.' + s] = (20 * onWall, Sig(s) * 6, 0)
        w = gripW(t)
        if w > 1e-3:
            Grip(f, 'L', handL(t), (0, -1, 0), (0, 0, 1), .95, (SX + .55, -face + .35, top - .25), w)
            Grip(f, 'R', handR(t), (0, -1, 0), (0, 0, 1), .95, (-(SX + .55), -face + .35, top - .25), w)
            for s in LR:
                f['handRel.' + s] = (Sig(s) * .08, -.12, -.45)
                f['poleRel.' + s] = (Sig(s) * .5, .3, -.3)
        else:
            for s in LR:
                before = t < 1.0
                Rel(f, s, (Sig(s) * .10, -.14, .30) if before else (Sig(s) * .25, .05, -.35), (Sig(s) * .5, .3, -.1), (0, -.8, .6) if before else (0, -.5, -.85), (-Sig(s), 0, 0), .4)
        return T.Nest(f)

    def Review(t):
        return [Box((0, -face - thick / 2, top / 2), (2.4, thick, top), 0)]
    return {'pose': Pose, 'props': lambda t: {'weapon': SlungTrack(T, 'back')}, 'plants': [('L', 0, .22), ('R', 0, .20), ('L', 3.26, D), ('R', 3.26, D)],
            'groundWeight': lambda t: ground(t), 'walls': lambda t: [((0, -face, 0), (0, 1, 0))] if t < .45 else [],
            'check': lambda t: {'L': handL(t), 'R': handR(t)} if .5 <= t <= 2.9 else {}, 'reach': {'fraction': 2.0},
            'reviewProps': Combine(Review, SlungReview(T)), 'reviewViews': [('side', (-4.2, -.6, 1.4), (0, -.6, 1.1)), ('q', (-3.0, -3.4, 2.6), (0, -.6, 1.1)), ('front', (-.2, -4.4, 1.6), (0, -.6, 1.1))],
            'reviewScale': 4.0, 'reviewFrames': lambda n: [0, int(round(n * .5 / D)), int(round(n * 1.2 / D)), int(round(n * 1.5 / D)), int(round(n * 2.1 / D)), int(round(n * 2.7 / D)), int(round(n * 3.05 / D)), n - 1]}


# ===============================================================================================================
def MakeClips(K):
    T = Toolkit(K)
    print('PREVIZ_VILLAGE_MEASURES', K['modelId'], 'scale %.4f H %.3f A %.3f F %.3f S %.3f SX %.3f SZ %.3f P %.3f HD %.3f ARM %.3f'
          % (T.s, T.H, T.A, T.F, T.S, T.SX, T.SZ, T.P, T.HD, T.ARM), flush=True)
    DefineStages(T)
    v, tip = VictimInIja(T)
    print('PREVIZ_VILLAGE_PAIRS victim(ija frame, runtime Blender axes) %s tip %s dragWrist %s pinWrist %s nier %s'
          % (tuple(round(c, 3) for c in v), tuple(round(c, 3) for c in tip), DragWristInIja(), PinWrist(T), NierInIja(T)), flush=True)
    specs = {}
    building = K.get('Building') or (lambda name: None)
    for name in CLIPS:
        if name not in BUILDERS:
            print('PREVIZ_VILLAGE_NO_BUILDER', name, flush=True)
            continue
        building(name)
        spec = BUILDERS[name](T, name)
        spec.setdefault('scale', K['scale'])
        spec.setdefault('modelId', K['modelId'])
        specs[name] = spec
    building(None)
    return specs
