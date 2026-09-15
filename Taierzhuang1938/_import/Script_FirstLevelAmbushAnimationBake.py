"""Author the room-ambush clips on the production rigs and bake original-rig tracks.

Eight clips:
  IJA (LugouIja01/02/03)  AmbushRise, BayonetStabStanding, BayonetStabDown,
                          RifleButtStrike, PressureStabbed
  NRA (LugouNra02/05)     BearerStabbed, PatientStabbed, PatientWoundedIdle

Poses are authored as bone-space curves on the original 53-bone rig, exactly the way
`Script_FirstLevelCarriageAnimationBake.py` does it: the Blender pose is converted back
into the source GLB bone frames before export, so the runtime never imports a new rig and
the shipped meshes / skin weights / inverse binds stay untouched.

Headless rebuild (Blender 5.1, no MCP server, no GUI):

    "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" --background \
        --python Taierzhuang1938/_import/Script_FirstLevelAmbushAnimationBake.py -- \
        <absolute path of the Taierzhuang1938 project directory>

Environment switches:
    AMBUSH_MODEL=LugouIja01   bake one model only
    AMBUSH_RENDER=1           also render the private Cycles review sheets
The editable .blend files and the numeric review reports go to
C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/RoomAmbush_20260915/, never
into the Pages repository.

Coordinates while authoring (identical to the carriage bake): Blender +X is the
character's left, -Y is the character's facing, +Z is up.  Source glTF +Z maps to Blender
-Y, and CharacterModel's PI yaw then puts the actor's facing on local -Z.  Blender Z and
actor Y are the same axis, so every height in this file is the height the game measures.
"""
import bpy, json, math, struct, hashlib, os, sys
from pathlib import Path
from mathutils import Matrix, Vector, Quaternion

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
project = Path(argv[0] if argv else os.environ.get('AMBUSH_PROJECT', str(Path.cwd() / 'Taierzhuang1938')))
private = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/RoomAmbush_20260915')
output = project / 'Animation/FirstLevelAmbush'
output.mkdir(parents=True, exist_ok=True)
private.mkdir(parents=True, exist_ok=True)
fps = 24
VERSION = '20260916AmbushV2'

# (duration seconds, loop)
definitions = {
    'AmbushRise': (0.7, False),
    'BayonetStabStanding': (1.2, False),
    'BayonetStabDown': (1.4, False),
    'RifleButtStrike': (1.0, False),
    'PressureStabbed': (1.3, False),
    'BearerStabbed': (2.2, False),
    'PatientStabbed': (2.6, False),
    'PatientWoundedIdle': (3.0, True),
}
IJA_CLIPS = ['AmbushRise', 'BayonetStabStanding', 'BayonetStabDown',
             'RifleButtStrike', 'PressureStabbed']
NRA_CLIPS = ['BearerStabbed', 'PatientStabbed', 'PatientWoundedIdle']
modelClips = {
    'LugouIja01': IJA_CLIPS, 'LugouIja02': IJA_CLIPS, 'LugouIja03': IJA_CLIPS,
    'LugouNra02': NRA_CLIPS, 'LugouNra05': NRA_CLIPS,
}

# Type 38 with the fixed bayonet, measured from Model/Model_Type38.tzm.json and
# Model/Model_BayonetType38.tzm.json.  gripR is the weapon origin, gripL (the fore-end
# mount) sits 0.4432 m along the barrel, and Actor._UpdateRiggedWeaponMount aims that
# axis straight at the animated left palm.  Expressed in the (axis, up) frame that the
# mount builds, the blade tip is GRIP_TO_TIP along the axis and TIP_RISE off it.
GRIP_SPAN = 0.4432
GRIP_TO_TIP = 1.4201
TIP_RISE = 0.0511
# The butt plate is the other end of the same line: Model_Type38's stock reaches z = +0.255
# behind the weapon origin (= the right grip).  RifleButtStrike is authored by this point
# because the butt is the end that does the hitting.
BUTT_BACK = 0.255
BUTT_TO_TIP = GRIP_TO_TIP + BUTT_BACK

# PressureStabbed starts on the melee library's own pose so the hand-over from the ground
# QTE is seamless: Animation/Melee/Data_MeleeIjaAnimations.json `BayonetPressure` frame 0
# is the frame the QTE ends on (Script_MeleeAnimation maps a Pressure QTE's progress to
# `1 - progress`, so a win lands on frame 0).  Those tracks are world-space rotation
# deltas from the bind pose in glTF axes, with the pelvis travel scaled by the variant's
# own bind pelvis height (MeleeAnimationPlayer.heightScale).
MELEE_LIBRARY = 'Animation/Melee/Data_MeleeIjaAnimations.json'
MELEE_START_CLIP = 'BayonetPressure'
MELEE_IJA_PELVIS = 0.876513
# How long the authored performance takes over from that imported pose.  Frame 0 is the
# melee pose to the last decimal; the blend is over before the stab lands.
PRESSURE_BLEND_S = 0.16

convert = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
convertInv = convert.inverted()
Clamp = lambda x, a=0, b=1: max(a, min(b, x))
Smooth = lambda x: Clamp(x) * Clamp(x) * (3 - 2 * Clamp(x))
Mix = lambda a, b, x: a + (b - a) * x


def ReadGlb(path):
    data = path.read_bytes()
    length = struct.unpack_from('<I', data, 12)[0]
    return json.loads(data[20:20 + length])


def NodeMatrix(node):
    if 'matrix' in node:
        return Matrix([node['matrix'][i::4] for i in range(4)])
    p = node.get('translation', [0, 0, 0])
    q = node.get('rotation', [0, 0, 0, 1])
    s = node.get('scale', [1, 1, 1])
    return Matrix.LocRotScale(Vector(p), Quaternion((q[3], q[0], q[1], q[2])), Vector(s))


def Keyed(keys, time):
    """Smoothstep between the two bracketing keys of a [(t, {name: value})] table."""
    first, last = keys[0], keys[-1]
    for a, b in zip(keys, keys[1:]):
        if a[0] <= time <= b[0]:
            first, last = a, b
            break
    if time <= keys[0][0]:
        first = last = keys[0]
    if time >= keys[-1][0]:
        first = last = keys[-1]
    w = Smooth((time - first[0]) / max(1e-6, last[0] - first[0])) if last[0] > first[0] else 0
    out = {}
    for name in set(first[1]) | set(last[1]):
        a = first[1].get(name, last[1].get(name))
        b = last[1].get(name, first[1].get(name))
        out[name] = Mix(a, b, w) if isinstance(a, (int, float)) else b
    return out


def BodyQuat(pitch=0.0, roll=0.0, yaw=0.0):
    """Same composition order as the carriage bake's Tilt: yaw, then roll, then pitch."""
    return (Quaternion((0, 0, 1), yaw) @ Quaternion((0, 1, 0), roll)
            @ Quaternion((1, 0, 0), pitch))


# ---------------------------------------------------------------------------
# Clip parameter tables.  `pz` is a fraction of the model's rest pelvis height so the
# same table reads correctly on rigs of different stature.  IJA clips are authored by
# the bayonet TIP plus the barrel axis; the two grips are then solved backwards, which
# is what makes the reach numbers in the report mean something.
# ---------------------------------------------------------------------------
IJA_GUARD = dict(pz=.948, px=0, py=-.006, pitch=.07, roll=0, yaw=0, bend=.04,
                 headPitch=.05, headYaw=0,
                 lfx=.18, lfy=-.17, lfLift=0, rfx=-.18, rfy=.18, rfLift=0,
                 tipX=.264, tipY=-1.306, tipZ=1.255, ax=.30, ay=-.945, az=.13, twist=0)

# The same guard, written from the butt end instead of the blade tip (butt = tip - axis *
# BUTT_TO_TIP - up * TIP_RISE, solved once from IJA_GUARD).  A clip must use one or the
# other for all of its keys; `Keyed` interpolates whatever names its two keys carry.
IJA_BUTT_GUARD = dict({k: v for k, v in IJA_GUARD.items() if not k.startswith('tip')},
                      buttX=-.2365, buttY=.2707, buttZ=.9866)

IJA_KEYS = {
    'AmbushRise': [
        # Hiding: deep crouch, rifle carried diagonally across the body with the muzzle
        # up so the blade stays inside the screen's silhouette.
        (0.00, dict(IJA_GUARD, pz=.548, py=.03, pitch=.34, bend=.20, headPitch=.17,
                    lfx=.145, lfy=-.09, rfx=-.155, rfy=.07,
                    tipX=.131, tipY=-.982, tipZ=1.731, ax=.22, ay=-.68, az=.70)),
        (0.34, dict(IJA_GUARD, pz=.735, py=.02, pitch=.24, bend=.13, headPitch=.13,
                    lfx=.165, lfy=-.13, rfx=-.17, rfy=.12,
                    tipX=.20, tipY=-1.15, tipZ=1.50, ax=.26, ay=-.83, az=.50)),
        (0.70, dict(IJA_GUARD)),
    ],
    'BayonetStabStanding': [
        (0.00, dict(IJA_GUARD)),
        (0.22, dict(IJA_GUARD, pz=.935, py=.05, pitch=.02, bend=0, yaw=-.17,
                    lfx=.18, lfy=-.14, rfx=-.19, rfy=.23, headPitch=.02,
                    tipX=.30, tipY=-1.10, tipZ=1.30, ax=.30, ay=-.935, az=.19)),
        (0.36, dict(IJA_GUARD, pz=.915, py=-.09, pitch=.13, bend=.03, yaw=-.07,
                    lfx=.18, lfy=-.30, rfx=-.20, rfy=.27, rfLift=.02, headPitch=.06,
                    tipX=.18, tipY=-1.37, tipZ=1.15, ax=.27, ay=-.960, az=.05)),
        (0.52, dict(IJA_GUARD, pz=.895, py=-.24, pitch=.22, bend=.08, yaw=.05,
                    lfx=.175, lfy=-.47, rfx=-.20, rfy=.31, rfLift=.055, headPitch=.10,
                    tipX=.10, tipY=-1.57, tipZ=1.065, ax=.20, ay=-.9767, az=-.075)),
        (0.66, dict(IJA_GUARD, pz=.895, py=-.24, pitch=.22, bend=.08, yaw=.05,
                    lfx=.175, lfy=-.47, rfx=-.20, rfy=.31, rfLift=.055, headPitch=.10,
                    tipX=.095, tipY=-1.51, tipZ=1.080, ax=.20, ay=-.9767, az=-.07,
                    twist=.38)),
        (0.94, dict(IJA_GUARD, pz=.925, py=-.09, pitch=.13, bend=.04, yaw=-.02,
                    lfx=.18, lfy=-.35, rfx=-.19, rfy=.27, headPitch=.07,
                    tipX=.22, tipY=-1.31, tipZ=1.17, ax=.28, ay=-.952, az=.12, twist=.18)),
        (1.20, dict(IJA_GUARD, lfy=-.20, rfy=.20)),
    ],
    'BayonetStabDown': [
        (0.00, dict(IJA_GUARD)),
        (0.26, dict(IJA_GUARD, pz=.930, py=.02, pitch=.06, bend=.02, yaw=-.12,
                    lfx=.18, lfy=-.16, rfx=-.19, rfy=.21, headPitch=.12,
                    tipX=.30, tipY=-1.05, tipZ=1.45, ax=.30, ay=-.90, az=.31)),
        (0.44, dict(IJA_GUARD, pz=.895, py=-.06, pitch=.20, bend=.08, yaw=-.04,
                    lfx=.18, lfy=-.28, rfx=-.20, rfy=.25, headPitch=.20,
                    tipX=.20, tipY=-1.30, tipZ=1.20, ax=.26, ay=-.960, az=-.02)),
        (0.62, dict(IJA_GUARD, pz=.855, py=-.16, pitch=.42, bend=.16, yaw=.02,
                    lfx=.175, lfy=-.40, rfx=-.20, rfy=.29, rfLift=.045, headPitch=.26,
                    tipX=.10, tipY=-1.55, tipZ=1.055, ax=.20, ay=-.9721, az=-.12)),
        (0.80, dict(IJA_GUARD, pz=.855, py=-.16, pitch=.42, bend=.16, yaw=.02,
                    lfx=.175, lfy=-.40, rfx=-.20, rfy=.29, rfLift=.045, headPitch=.26,
                    tipX=.095, tipY=-1.50, tipZ=1.060, ax=.20, ay=-.9721, az=-.115,
                    twist=.38)),
        (1.08, dict(IJA_GUARD, pz=.915, py=-.05, pitch=.18, bend=.07, yaw=-.03,
                    lfx=.18, lfy=-.30, rfx=-.19, rfy=.25, headPitch=.14,
                    tipX=.22, tipY=-1.26, tipZ=1.21, ax=.28, ay=-.944, az=.14, twist=.20)),
        (1.40, dict(IJA_GUARD, lfy=-.20, rfy=.20)),
    ],
    # Butt stroke.  The rifle turns end for end about the hands: at the apex the butt
    # leads (1.0 m in front of the pelvis, 1.5 m up, i.e. the head of a man standing
    # 1.0-1.2 m away) and the blade trails behind the man's own right shoulder.  The
    # muzzle sweeps through the actor's right-hand side on the way round, so the staging
    # needs about 1.6 m of clearance there — see the doc.
    'RifleButtStrike': [
        (0.00, dict(IJA_BUTT_GUARD)),
        # Cocked: rifle lifted, butt up behind the right shoulder, muzzle steeply down and
        # forward.  The rifle turns over in a near-vertical plane, not a flat one: the
        # mount puts the left hand a fixed 0.44 m down the barrel from the right, and on a
        # flat swing that lands 0.7 m across the body, out of the left arm's reach — the
        # rendered rifle aims at the left palm, so an arm that cannot get there is a rifle
        # pointing somewhere else entirely.
        (0.16, dict(IJA_BUTT_GUARD, pz=.942, py=.04, pitch=.02, bend=.02, yaw=-.28,
                    lfx=.18, lfy=-.14, lfLift=.02, rfx=-.18, rfy=.20, headPitch=-.05,
                    buttX=-.326, buttY=.258, buttZ=1.519, ax=.26, ay=-.62, az=-.74)),
        # The left foot lands and the hips open; the muzzle is swinging down past his
        # own knees, 0.2 m short of where the man's shins are.
        # Rifle vertical, muzzle down, held out over his LEFT side.  Two things decide
        # that side: on the mid-line the barrel goes through his own helmet, and out on
        # his right the left hand — a fixed 0.48 m down the barrel — has to cross 0.45 m
        # of chest and cannot reach.  Over the left, the right arm crosses instead (it
        # has the shorter way to go) and the helmet is 0.17 m clear.
        # `headPitch` goes negative from here on: the torso is thrown 45 degrees forward,
        # and a head that only follows it is a man diving at the floor instead of looking
        # at what he is hitting — and it puts his own face inside the barrel's path.
        (0.30, dict(IJA_BUTT_GUARD, pz=.930, py=-.18, pitch=.30, bend=.18, yaw=.10,
                    lfx=.18, lfy=-.42, rfx=-.19, rfy=.14, rfLift=.02, headPitch=-.12,
                    headYaw=-.08,
                    buttX=.213, buttY=-.349, buttZ=1.875, ax=-.05, ay=-.28, az=-.96)),
        # Impact.  Hips, spine, arm and rifle are stacked along one line to the butt: this
        # man is 1.62 m in game and the butt has to reach a standing man's jaw a metre
        # away, which is the whole reach budget (0.54 pelvis-to-shoulder + 0.50 arm +
        # 0.26 grip-to-butt) end to end.  That is why he stays tall on the hips and is
        # thrown forward from the waist instead of crouching into it, and why the rear
        # foot is in the air here — planted 0.45 m back it would cap the pelvis 6 cm lower
        # and take the butt below the man's chin.
        (0.42, dict(IJA_BUTT_GUARD, pz=.980, py=-.28, pitch=.58, bend=.34, yaw=.40,
                    lfx=.18, lfy=-.42, rfx=-.20, rfy=.06, rfLift=.09, headPitch=-.75,
                    headYaw=-.28,
                    buttX=-.040, buttY=-1.286, buttZ=1.653, ax=-.18, ay=.70, az=-.69)),
        # Follow-through: the butt carries on down and across to his left, rear foot down.
        (0.56, dict(IJA_BUTT_GUARD, pz=.950, py=-.26, pitch=.46, bend=.28, yaw=.40,
                    lfx=.18, lfy=-.42, rfx=-.20, rfy=.00, rfLift=.01, headPitch=-.50,
                    headYaw=-.26,
                    buttX=.046, buttY=-1.185, buttZ=1.596, ax=-.18, ay=.80, az=-.56)),
        # Recovery rolls the rifle back the way it came.  The muzzle passes through
        # vertical twice in this clip, and the rifle does NOT shrink with the man: the
        # rig is scaled to 1.62 m but Actor cancels that on the weapon, so the blade
        # reaches 1.42 m from the right hand in real metres — 11 cm further than the same
        # number measured in the authoring rig.  Both vertical passes need the right hand
        # above 1.63 m (authoring scale) or the bayonet goes through the floor.
        (0.70, dict(IJA_BUTT_GUARD, pz=.945, py=-.20, pitch=.30, bend=.16, yaw=.16,
                    lfx=.18, lfy=-.42, rfx=-.19, rfy=.00, headPitch=-.10,
                    buttX=.193, buttY=-.289, buttZ=1.900, ax=-.05, ay=-.20, az=-.98)),
        # Back through the cocked attitude: right hand behind the shoulder, muzzle down
        # and forward.  With the rifle at 45 degrees the two hands are 0.34 m apart fore
        # and aft, and only this way round does each hand land inside its own shoulder's
        # reach — with the right hand in front of the shoulder instead, the left is left
        # holding air 0.6 m out.
        (0.85, dict(IJA_BUTT_GUARD, pz=.948, py=-.14, pitch=.12, bend=.06, yaw=0,
                    lfx=.18, lfy=-.42, rfx=-.18, rfy=.02, headPitch=0,
                    buttX=-.306, buttY=.138, buttZ=1.519, ax=.26, ay=-.62, az=-.74)),
        # Guard again, one pace further in than he started.
        (1.00, dict(IJA_BUTT_GUARD, py=-.16, lfx=.18, lfy=-.42, rfx=-.18, rfy=.02,
                    buttX=-.2365, buttY=.1107, buttZ=.9866)),
    ],
}

# PressureStabbed is authored the way the NRA clips are (pelvis lift + body frame + IK
# hands and feet), not by the rifle line: from the moment the player wrenches the rifle
# away the man has nothing in his hands.  Frame 0 is the imported BayonetPressure pose,
# and this table's first key reproduces it closely enough that the 0.16 s cross-fade
# between them is invisible.
PRESSURE_STAND = dict(lift=.7965, px=0, py=-.006, pitch=.12, roll=0, yaw=0, bend=.13,
                      headPitch=.25, headYaw=0, headRoll=0, feetWorld=1,
                      lax=.18, lay=-.17, laz=.092, rax=-.18, ray=.18, raz=.092,
                      lpx=.26, lpy=-1.0, lpz=.50, rpx=-.26, rpy=-1.0, rpz=.50,
                      footSplay=0, footPitch=0,
                      hlx=-.091, hly=-.337, hlz=.108, hrx=-.037, hry=.077, hrz=.765,
                      apx=.72, apy=-.02, apz=-.30, palmBelly=0, curl=.95, supine=0)

PRESSURE_KEYS = [
    (0.00, dict(PRESSURE_STAND)),
    # The rifle is driven up and back into him; he is still holding on.
    (0.12, dict(PRESSURE_STAND, lift=.815, pitch=.02, bend=.04, headPitch=.10,
                hlx=-.02, hly=-.20, hlz=.42, hrx=-.10, hry=.16, hrz=.88, curl=.9)),
    # Both hands are off it, thrown up and open, chest wide: the frame before the blade
    # turns round.
    (0.24, dict(PRESSURE_STAND, lift=.845, pitch=-.10, bend=-.06, headPitch=-.14,
                hlx=.20, hly=-.06, hlz=.80, hrx=-.26, hry=.20, hrz=.90, curl=.25)),
    # Impact.  Belly takes it: head snaps back, arms fly out, knees start to give.
    (0.36, dict(PRESSURE_STAND, lift=.790, pitch=.18, bend=.12, headPitch=-.30,
                hlx=.30, hly=-.10, hlz=.46, hrx=-.32, hry=-.06, hrz=.50, curl=.35)),
    # Doubled over the wound, both hands pressed on it.
    (0.50, dict(PRESSURE_STAND, lift=.735, pitch=.46, bend=.28, headPitch=.30,
                lay=-.15, ray=.20,
                hlx=.10, hly=-.20, hlz=.10, hrx=-.10, hry=-.21, hrz=.10,
                apx=.62, apy=.10, apz=-.30, palmBelly=1, curl=1.15)),
    # Knees buckle and he starts to go over to his right, off the man under him.  The
    # legs follow BearerStabbed's collapse: heels come up over the toes first, then the
    # shins fold flat on the floor.  Anything else drives a knee through the floor,
    # because the runtime lifts the whole body by the sole probe, not by the lowest point.
    (0.68, dict(PRESSURE_STAND, lift=.630, px=-.05, py=-.10, pitch=.62, roll=-.20,
                bend=.26, headPitch=.30, headRoll=-.08,
                lax=.145, lay=.20, laz=.150, rax=-.145, ray=.22, raz=.150,
                lpx=.18, lpy=-1.30, lpz=-.10, rpx=-.18, rpy=-1.30, rpz=-.10,
                footSplay=.08, footPitch=.55,
                hlx=.10, hly=-.20, hlz=.10, hrx=-.10, hry=-.21, hrz=.10,
                apx=.62, apy=.10, apz=-.30, palmBelly=1, curl=1.2)),
    # Heels roll up over the toes on the way down; the ankle has to rise with the foot
    # pitch or the shoe is dragged through the floor and the runtime's sole solve lifts
    # the whole body back out of it.
    (0.78, dict(PRESSURE_STAND, lift=.585, px=-.08, py=-.115, pitch=.58, roll=-.26,
                bend=.25, headPitch=.30, headRoll=-.13,
                lax=.145, lay=.32, laz=.250, rax=-.145, ray=.34, raz=.250,
                lpx=.145, lpy=-1.30, lpz=-.50, rpx=-.145, rpy=-1.30, rpz=-.50,
                footSplay=.15, footPitch=1.30,
                hlx=.10, hly=-.19, hlz=.09, hrx=-.10, hry=-.20, hrz=.09,
                apx=.62, apy=.10, apz=-.30, palmBelly=1, curl=1.2)),
    (0.88, dict(PRESSURE_STAND, lift=.545, px=-.11, py=-.13, pitch=.54, roll=-.32,
                bend=.24, headPitch=.30, headRoll=-.18,
                lax=.145, lay=.45, laz=.095, rax=-.145, ray=.47, raz=.095,
                lpx=.145, lpy=-1.30, lpz=-.35, rpx=-.145, rpy=-1.30, rpz=-.35,
                footSplay=.25, footPitch=2.45,
                hlx=.10, hly=-.19, hlz=.09, hrx=-.10, hry=-.20, hrz=.09,
                apx=.62, apy=.10, apz=-.30, palmBelly=1, curl=1.2)),
    (1.08, dict(PRESSURE_STAND, lift=.430, px=-.23, py=-.15, pitch=.96, roll=-.62,
                bend=.22, headPitch=.16, headRoll=-.28,
                lax=.175, lay=.50, laz=.090, rax=-.115, ray=.54, raz=.090,
                lpx=.145, lpy=-1.10, lpz=-.45, rpx=-.145, rpy=-1.10, rpz=-.45,
                footSplay=.25, footPitch=2.45,
                hlx=.10, hly=-.18, hlz=.08, hrx=-.11, hry=-.16, hrz=.04,
                apx=.62, apy=.10, apz=-.30, palmBelly=1, curl=1.18)),
    # Corpse rest pose: down on his right side over his own folded legs, both hands still
    # under the belly.  Package D may hand this over to the death-pose system; either way
    # the last frame is a settled pose.
    (1.30, dict(PRESSURE_STAND, lift=.290, px=-.34, py=-.16, pitch=1.24, roll=-.92,
                bend=.18, headPitch=.02, headRoll=-.36,
                lax=.215, lay=.54, laz=.085, rax=-.065, ray=.58, raz=.085,
                lpx=.145, lpy=-1.10, lpz=-.45, rpx=-.145, rpy=-1.10, rpz=-.45,
                footSplay=.25, footPitch=2.45,
                hlx=.11, hly=-.17, hlz=.07, hrx=-.12, hry=-.13, hrz=.02,
                apx=.62, apy=.10, apz=-.30, palmBelly=1, curl=1.15)),
]

# NRA tables.
#   * hands are body-local offsets from the pelvis, so they follow the torso through the
#     topple onto the right side and the quarter turn of the two litter clips;
#   * ankles are WORLD points (`feetWorld`) for the bearer, because the floor is what
#     they have to agree with, and body-local for the supine patient, where they have to
#     agree with the torso instead;
#   * `lift` is an absolute pelvis height and wins over the `pz` fraction of the model's
#     rest pelvis height.
NRA_STAND = dict(lift=.947, px=0, py=0, pitch=.10, roll=0, yaw=0, bend=.04,
                 headPitch=.03, headYaw=0, headRoll=0, feetWorld=1,
                 lax=.14, lay=-.12, laz=.1114, rax=-.14, ray=.10, raz=.1114,
                 lpx=.26, lpy=-1.0, lpz=.50, rpx=-.26, rpy=-1.0, rpz=.50,
                 footSplay=0, footPitch=0,
                 hlx=.29, hly=-.27, hlz=-.05, hrx=-.29, hry=-.27, hrz=-.05,
                 apx=.72, apy=-.02, apz=-.30, palmBelly=0, curl=.95, supine=0)

NRA_KEYS = {
    'BearerStabbed': [
        (0.00, dict(NRA_STAND)),
        # The blade goes in: chest snaps back, head thrown up, the poles leave the hands.
        (0.16, dict(NRA_STAND, lift=.940, pitch=-.12, bend=-.05, headPitch=-.26,
                    hlx=.32, hly=-.23, hlz=-.02, hrx=-.32, hry=-.23, hrz=-.02,
                    palmBelly=.35, curl=.45)),
        (0.42, dict(NRA_STAND, lift=.909, pitch=.24, bend=.12, headPitch=.18,
                    hlx=.11, hly=-.25, hlz=.06, hrx=-.11, hry=-.26, hrz=.06, apx=.62, apy=.10, apz=-.30, palmBelly=1, curl=1.1)),
        (0.78, dict(NRA_STAND, lift=.804, pitch=.55, bend=.24, headPitch=.30,
                    lay=-.05, ray=.09,
                    hlx=.09, hly=-.21, hlz=.12, hrx=-.09, hry=-.22, hrz=.12, apx=.62, apy=.10, apz=-.30, palmBelly=1, curl=1.2)),
        (1.10, dict(NRA_STAND, lift=.700, pitch=.62, bend=.26, headPitch=.34,
                    lax=.145, lay=.10, rax=-.145, ray=.13,
                    lpx=.20, lpy=-1.30, lpz=.10, rpx=-.20, rpy=-1.30, rpz=.10,
                    hlx=.09, hly=-.20, hlz=.10, hrx=-.09, hry=-.21, hrz=.10, apx=.62, apy=.10, apz=-.30, palmBelly=1, curl=1.2)),
        # Heels come up over the toes on the way down; the ankle has to rise with the
        # foot pitch or the shoe is dragged straight through the floor.
        (1.21, dict(NRA_STAND, lift=.630, pitch=.62, bend=.26, headPitch=.33,
                    lax=.145, lay=.20, laz=.150, rax=-.145, ray=.22, raz=.150,
                    lpx=.18, lpy=-1.30, lpz=-.10, rpx=-.18, rpy=-1.30, rpz=-.10,
                    footSplay=.08, footPitch=.55,
                    hlx=.09, hly=-.20, hlz=.10, hrx=-.09, hry=-.21, hrz=.10, apx=.62, apy=.10, apz=-.30, palmBelly=1, curl=1.2)),
        (1.32, dict(NRA_STAND, lift=.585, pitch=.60, bend=.26, headPitch=.32,
                    lax=.145, lay=.32, laz=.250, rax=-.145, ray=.34, raz=.250,
                    lpx=.145, lpy=-1.30, lpz=-.50, rpx=-.145, rpy=-1.30, rpz=-.50,
                    footSplay=.15, footPitch=1.30,
                    hlx=.09, hly=-.19, hlz=.09, hrx=-.09, hry=-.20, hrz=.09, apx=.62, apy=.10, apz=-.30, palmBelly=1, curl=1.2)),
        # Knees on the floor, shins folded back, still doubled over the wound.
        (1.52, dict(NRA_STAND, lift=.545, pitch=.52, roll=-.06, bend=.24, headPitch=.30,
                    lax=.145, lay=.45, laz=.095, rax=-.145, ray=.47, raz=.095,
                    lpx=.145, lpy=-1.30, lpz=-.35, rpx=-.145, rpy=-1.30, rpz=-.35,
                    footSplay=.25, footPitch=2.45,
                    hlx=.09, hly=-.19, hlz=.09, hrx=-.09, hry=-.20, hrz=.09, apx=.62, apy=.10, apz=-.30, palmBelly=1, curl=1.2)),
        (1.86, dict(NRA_STAND, lift=.525, px=-.04, py=-.06, pitch=1.00, roll=-.20,
                    bend=.26, headPitch=.16, headRoll=-.14,
                    lax=.145, lay=.52, laz=.085, rax=-.145, ray=.54, raz=.085,
                    lpx=.145, lpy=-1.30, lpz=-.05, rpx=-.145, rpy=-1.30, rpz=-.05,
                    footSplay=.25, footPitch=2.45,
                    hlx=.09, hly=-.19, hlz=.08, hrx=-.10, hry=-.17, hrz=.05, apx=.62, apy=.10, apz=-.30, palmBelly=1, curl=1.2)),
        # Corpse rest pose: face down over his own legs, tipped onto the right shoulder,
        # both hands still under the belly.  Package A may hand this over to the
        # death-pose system; either way the last frame is a settled pose.
        (2.20, dict(NRA_STAND, lift=.395, px=-.05, py=-.10, pitch=1.45, roll=-.32,
                    bend=.20, headPitch=-.25, headRoll=-.30,
                    lax=.145, lay=.66, laz=.085, rax=-.145, ray=.68, raz=.085,
                    lpx=.145, lpy=-1.10, lpz=-.45, rpx=-.145, rpy=-1.10, rpz=-.45,
                    footSplay=.25, footPitch=2.45,
                    hlx=.10, hly=-.18, hlz=.07, hrx=-.11, hry=-.14, hrz=.02, apx=.62, apy=.10, apz=-.30, palmBelly=1, curl=1.15)),
    ],
}

# Supine clips share one base: the body is rolled a quarter turn onto its back
# (pitch -PI/2) and turned end for end (yaw PI) so the head points along the actor's
# local -Z, i.e. toward the front bearer.  The pack under the shoulders is the lowest
# part of a man lying on his back, so the legs slope down to the canvas: `lay`/`ray`
# hold the ankles a fixed 0.132 m below the pelvis line, which is what keeps the sole
# probe (and therefore the runtime's deck solve) still while he writhes.
NRA_SUPINE = dict(NRA_STAND, lift=.190, px=0, py=0,
                  pitch=-math.pi / 2, roll=0, yaw=math.pi,
                  bend=.02, headPitch=.06, headYaw=0, headRoll=0, feetWorld=0,
                  lax=.115, lay=.132, laz=-.840, rax=-.115, ray=.132, raz=-.840,
                  footSplay=.34, lpx=.20, lpy=-.45, lpz=-.30, rpx=-.20, rpy=-.45, rpz=-.30,
                  apx=.66, apy=.42, apz=.16, palmBelly=1,
                  hlx=.150, hly=-.060, hlz=.110, hrx=-.150, hry=-.060, hrz=.110,
                  curl=.35, supine=1)

NRA_KEYS['PatientStabbed'] = [
    (0.00, dict(NRA_SUPINE)),
    # Impact: back arches off the canvas, chin up, arms fly out.
    (0.22, dict(NRA_SUPINE, bend=-.17, headPitch=-.24,
                laz=-.820, raz=-.820,
                hlx=.27, hly=-.05, hlz=-.04, hrx=-.27, hry=-.05, hrz=-.04, palmBelly=.2, curl=.15)),
    (0.60, dict(NRA_SUPINE, bend=.13, headPitch=.19, yaw=math.pi + .06,
                lax=.135, laz=-.760, raz=-.800,
                hlx=.115, hly=-.145, hlz=.105, hrx=-.115, hry=-.145, hrz=.105, curl=1.2)),
    (1.10, dict(NRA_SUPINE, bend=.06, roll=.17, headPitch=.10, headRoll=.26,
                lax=.150, laz=-.715, raz=-.785,
                hlx=.105, hly=-.150, hlz=.115, hrx=-.120, hry=-.140, hrz=.100, curl=1.2)),
    (1.65, dict(NRA_SUPINE, bend=.08, roll=-.16, headPitch=.12, headRoll=-.24,
                rax=-.150, laz=-.790, raz=-.720,
                hlx=.120, hly=-.140, hlz=.100, hrx=-.105, hry=-.150, hrz=.115, curl=1.2)),
    (2.15, dict(NRA_SUPINE, bend=.05, roll=.07, headPitch=.08, headRoll=.10,
                laz=-.770, raz=-.770,
                hlx=.115, hly=-.145, hlz=.108, hrx=-.115, hry=-.145, hrz=.108, curl=1.15)),
    (2.60, dict(NRA_SUPINE, bend=.03, headPitch=.05,
                laz=-.800, raz=-.800,
                hlx=.115, hly=-.148, hlz=.110, hrx=-.115, hry=-.148, hrz=.110, curl=1.1)),
]

# PatientWoundedIdle is generated from PatientStabbed's settled pose plus a periodic
# breathing term, so its first and last frames are identical by construction.  The
# pelvis height and the ankle drop never move: the runtime's deck solve reads the sole,
# and a breathing sole would bob the whole body against the litter.
NRA_IDLE_BASE = dict(NRA_SUPINE, bend=.03, headPitch=.05,
                     laz=-.800, raz=-.800,
                     hlx=.115, hly=-.148, hlz=.110, hrx=-.115, hry=-.148, hrz=.110,
                     curl=1.1)


def NraSpec(clip, time):
    if clip == 'PressureStabbed':
        return Keyed(PRESSURE_KEYS, time)
    if clip == 'PatientWoundedIdle':
        duration = definitions[clip][0]
        phase = 2 * math.pi * time / duration
        breath = math.sin(phase)
        catch = math.sin(phase * 3)
        spec = dict(NRA_IDLE_BASE)
        spec['bend'] = .03 + .034 * breath + .009 * catch
        spec['headRoll'] = .085 * math.sin(phase + 1.1)
        spec['headPitch'] = .05 + .032 * breath
        spec['roll'] = .030 * math.sin(phase - .6)
        spec['hlz'] = .110 + .008 * breath
        spec['hrz'] = .110 + .008 * breath
        spec['hly'] = -.148 - .014 * breath
        spec['hry'] = -.148 - .014 * breath
        spec['laz'] = -.800 + .022 * math.sin(phase + 2.0)
        spec['raz'] = -.800 - .022 * math.sin(phase + 2.0)
        return spec
    return Keyed(NRA_KEYS[clip], time)


def Bake(modelId, render):
    only = os.environ.get('AMBUSH_CLIP')
    clips = [c for c in modelClips[modelId] if not only or c == only]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = fps
    source = project / 'Model/Character' / ('Model_' + modelId + '.glb')
    document = ReadGlb(source)
    nodes = document['nodes']
    parents = {c: i for i, n in enumerate(nodes) for c in n.get('children', [])}
    nodeIndex = {n.get('name'): i for i, n in enumerate(nodes)}
    sourceWorld = {}

    def WorldOf(i):
        if i not in sourceWorld:
            sourceWorld[i] = (WorldOf(parents[i]) if i in parents else Matrix.Identity(4)) @ NodeMatrix(nodes[i])
        return sourceWorld[i]

    for i in range(len(nodes)):
        WorldOf(i)
    bpy.ops.import_scene.gltf(filepath=str(source))
    arm = next(o for o in scene.objects if o.type == 'ARMATURE')
    arm.animation_data_clear()
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    for pb in arm.pose.bones:
        pb.matrix_basis.identity()
        pb.rotation_mode = 'QUATERNION'
    bpy.context.view_layer.update()
    meshes = [o for o in scene.objects if o.type == 'MESH' and o.vertex_groups
              and any(m.type == 'ARMATURE' for m in o.modifiers)]
    for o in scene.objects:
        if o.type == 'MESH' and o not in meshes:
            o.hide_render = True
            o.hide_viewport = True
    for o in meshes:
        for material in o.data.materials:
            if material and material.use_nodes:
                for node in material.node_tree.nodes:
                    if node.type == 'BSDF_PRINCIPLED':
                        node.inputs['Metallic'].default_value = 0
                        node.inputs['Roughness'].default_value = .75
    names = [p.name for p in arm.pose.bones if p.name in nodeIndex]
    prefix = next(n for n in names if n.endswith(' Pelvis')).split(' ')[0]
    Bone = lambda role: arm.pose.bones[prefix + ' ' + role]
    armInv = arm.matrix_world.inverted()
    corrections = {name: (arm.matrix_world @ arm.data.bones[name].matrix_local).inverted()
                   @ convert @ sourceWorld[nodeIndex[name]] for name in names}
    rest = {p.name: p.matrix_basis.copy() for p in arm.pose.bones}
    BWorld = lambda pb: arm.matrix_world @ pb.matrix
    Point = lambda pb: BWorld(pb).translation.copy()
    Update = lambda: bpy.context.view_layer.update()

    def Put(pb, matrix):
        pb.matrix = armInv @ matrix
        Update()

    def Move(pb, point):
        matrix = BWorld(pb)
        matrix.translation = Vector(point)
        Put(pb, matrix)

    def Spin(pb, quaternion):
        """Rotate a bone by a world-space quaternion about its own head."""
        matrix = BWorld(pb)
        point = matrix.translation.copy()
        Put(pb, Matrix.Translation(point) @ quaternion.to_matrix().to_4x4()
            @ Matrix.Translation(-point) @ matrix)

    def TiltAxes(pb, frame, x=0.0, y=0.0, z=0.0):
        """Tilt about the body frame's axes (the carriage Tilt when frame is identity)."""
        rotation = (Quaternion(frame @ Vector((0, 0, 1)), z)
                    @ Quaternion(frame @ Vector((0, 1, 0)), y)
                    @ Quaternion(frame @ Vector((1, 0, 0)), x))
        Spin(pb, rotation)

    def Aim(pb, child, target):
        at = Point(pb)
        direction = Point(child) - at
        delta = direction.rotation_difference(Vector(target) - at)
        Put(pb, Matrix.Translation(at) @ delta.to_matrix().to_4x4()
            @ Matrix.Translation(-at) @ BWorld(pb))

    def TurnPalm(side, forward, normal):
        hand = Bone(side + ' Hand')
        forward = Vector(forward).normalized()
        normal = Vector(normal).normalized()
        Aim(hand, Bone(side + ' Finger2'), Point(hand) + forward)
        across = Point(Bone(side + ' Finger1')) - Point(Bone(side + ' Finger4'))
        current = forward.cross(across).normalized() * (1 if side == 'L' else -1)
        normal = (normal - forward * normal.dot(forward)).normalized()
        angle = math.atan2(forward.dot(current.cross(normal)), current.dot(normal))
        at = Point(hand)
        delta = Quaternion(forward, angle)
        Put(hand, Matrix.Translation(at) @ delta.to_matrix().to_4x4()
            @ Matrix.Translation(-at) @ BWorld(hand))
        return normal

    def CurlFingers(side, normal, amount, indexAmount=None):
        for finger in range(1, 5):
            value = indexAmount if finger == 1 and indexAmount is not None else amount
            for suffix, childSuffix, factor in [('', '1', .75), ('1', '2', 1)]:
                joint = Bone(side + ' Finger' + str(finger) + suffix)
                child = Bone(side + ' Finger' + str(finger) + childSuffix)
                at = Point(joint)
                forward = (Point(child) - at).normalized()
                bend = (Vector(normal) - forward * Vector(normal).dot(forward)).normalized()
                Aim(joint, child, at + forward * math.cos(value * factor) + bend * math.sin(value * factor))

    def Chain(a, b, c, target, pole):
        start = Point(a)
        mid = Point(b)
        end = Point(c)
        target = Vector(target)
        pole = Vector(pole)
        l1 = (mid - start).length
        l2 = (end - mid).length
        direction = target - start
        distance = Clamp(direction.length, abs(l1 - l2) + .0001, l1 + l2 - .0001)
        direction.normalize()
        bend = pole - start
        bend -= direction * bend.dot(direction)
        bend.normalize()
        along = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance)
        knee = start + direction * along + bend * math.sqrt(max(0, l1 * l1 - along * along))
        Aim(a, b, knee)
        Aim(b, c, target)

    def GripPoint(side):
        total = Vector((0, 0, 0))
        for finger in range(1, 5):
            total += Point(Bone(side + ' Finger' + str(finger)))
        return total / 4

    def ReachGrip(side, target, pole, rounds=4):
        """Drive the finger-root centroid (BuildHandGrip's weapon grip) onto a target.

        Each pass aims the arm at `target` minus the wrist-to-centroid offset measured
        from the previous pass, and aiming the forearm turns the wrist, which moves that
        offset again.  The loop usually walks in, but in some poses it circles instead,
        and then the answer depends on which pass you happen to stop on — which is how a
        clip ends up with one hand 14 cm off the barrel.  Keep the best pass instead.
        """
        arms = [Bone(side + ' UpperArm'), Bone(side + ' Forearm'), Bone(side + ' Hand')]
        target = Vector(target)
        best, bestError = None, None
        for _ in range(rounds):
            offset = GripPoint(side) - Point(arms[2])
            Chain(arms[0], arms[1], arms[2], target - offset, pole)
            error = (GripPoint(side) - target).length
            if bestError is None or error < bestError - 1e-6:
                bestError, best = error, [pb.matrix_basis.copy() for pb in arms]
            if error < 1e-4:
                return
        for pb, matrix in zip(arms, best):
            pb.matrix_basis = matrix
        Update()

    footQuats = {side: BWorld(Bone(side + ' Foot')).to_quaternion() for side in ['L', 'R']}
    ankleZ = {side: Point(Bone(side + ' Foot')).z for side in ['L', 'R']}
    restPelvis = Point(Bone('Pelvis')).z
    targetHeight = 1.62 if prefix == 'Bip001' else 1.66
    restBounds = max(v.z for mesh in meshes for v in [mesh.matrix_world @ c.co for c in mesh.data.vertices])
    restChest = Point(Bone('Spine2')).z
    runtimeScale = targetHeight / restBounds
    sourceFacing = {side: ((Point(Bone(side + ' Toe0')) - Point(Bone(side + ' Foot'))).normalized())[:]
                    for side in ['L', 'R']}
    assert sum(v[1] for v in sourceFacing.values()) < -1, sourceFacing
    footGroups = {}
    for mesh in meshes:
        indices = {g.index for g in mesh.vertex_groups if ' Foot' in g.name or ' Toe' in g.name}
        selected = []
        for vertex in mesh.data.vertices:
            weight = sum(g.weight for g in vertex.groups if g.group in indices)
            if weight > .65:
                selected.append(vertex.index)
        footGroups[mesh.name] = selected

    def PlaceFoot(side, target, pole, orient):
        foot = Bone(side + ' Foot')
        Chain(Bone(side + ' Thigh'), Bone(side + ' Calf'), foot, target, pole)
        matrix = BWorld(foot)
        location = matrix.translation.copy()
        _, _, scale = matrix.decompose()
        Put(foot, Matrix.LocRotScale(location, orient @ footQuats[side], scale))

    # Authored soles are ground to the floor numerically: `AuthorGrounded` re-authors
    # the frame with every world ankle raised by whatever the sole probe was short by.
    # Hand tuning cannot keep a rolling shoe on the floor to the millimetre, and a sole
    # that wanders is a body that bobs, because the runtime lifts the root by exactly
    # this measurement every frame.
    shift = {'feet': 0.0}
    trace = os.environ.get('AMBUSH_TRACE')

    def Trace(clip, time, stage):
        if trace and clip == trace:
            print('TRACE %s %.3f %-12s head=%.4f pelvis=%.4f spine2=%.4f' % (
                clip, time, stage, Point(Bone('Head')).z, Point(Bone('Pelvis')).z,
                Point(Bone('Spine2')).z), flush=True)

    def Reset():
        for pb in arm.pose.bones:
            pb.matrix_basis = rest[pb.name]
        Update()

    # --- the melee library's own pose, imported bone for bone -------------------------
    # Only the rotations are imported.  The melee tracks also carry a world offset per
    # bone (the retarget's residual), but every bone except the pelvis must keep its
    # source local translation or the shipped asset stretches the skeleton; the offsets
    # are at most 1.2 cm and only on the right hand, so FK from the rotations is the same
    # pose.  Rotations are glTF-space deltas on the left of the bind rotation, and Blender
    # is the glTF frame rotated -90 degrees about X, so the delta is conjugated by that.
    Reset()
    restWorld = {name: BWorld(arm.pose.bones[name]).copy() for name in names}
    meleeStart = None
    if prefix == 'Bip001':
        meleeDocument = json.loads((project / MELEE_LIBRARY).read_text(encoding='utf-8'))
        meleeParts = meleeDocument['parts']
        meleeFrame = meleeDocument['clips'][MELEE_START_CLIP]['frames'][0]
        meleePelvisScale = restPelvis / MELEE_IJA_PELVIS

        def BoneDepth(name):
            depth, bone = 0, arm.data.bones[name].parent
            while bone:
                depth, bone = depth + 1, bone.parent
            return depth
        meleeOrder = sorted((part for part in meleeParts if prefix + ' ' + part in names),
                            key=lambda part: BoneDepth(prefix + ' ' + part))
        assert len(meleeOrder) == len(meleeParts), meleeOrder
        meleeStart = {}
        for part in meleeOrder:
            at = meleeParts.index(part) * 7
            x, y, z, w = meleeFrame[at + 3:at + 7]
            meleeStart[part] = (Quaternion((w, x, -z, y)), Vector(meleeFrame[at:at + 3]))

    def ApplyMeleeStart():
        """Frame 0 of PressureStabbed: BayonetPressure, on this rig, to the last decimal."""
        Reset()
        for part in meleeOrder:
            name = prefix + ' ' + part
            pb = arm.pose.bones[name]
            delta, offset = meleeStart[part]
            matrix = BWorld(pb)
            location, _, scale = matrix.decompose()
            if part == 'Pelvis':
                location = restWorld[name].translation + Vector(
                    (offset.x, -offset.z, offset.y)) * meleePelvisScale
                location.z += shift['feet']
            Put(pb, Matrix.LocRotScale(location, delta @ restWorld[name].to_quaternion(), scale))
        return {'meleeStart': MELEE_START_CLIP}

    def AuthorIja(clip, time):
        Reset()
        s = Keyed(IJA_KEYS[clip], time)
        frame = BodyQuat(s['pitch'], s['roll'], s['yaw'])
        pelvis = Vector((s['px'], s['py'], restPelvis * s['pz']))
        Move(Bone('Pelvis'), pelvis)
        Spin(Bone('Pelvis'), frame)
        for role, share in [('Spine', .30), ('Spine1', .35), ('Spine2', .35)]:
            TiltAxes(Bone(role), frame, x=s['bend'] * share, z=s['yaw'] * .18 * share / .35)
        TiltAxes(Bone('Neck'), frame, x=s['headPitch'] * .35)
        TiltAxes(Bone('Head'), frame, x=s['headPitch'] * .65, z=s['headYaw'])
        Trace(clip, time, 'torso')
        for side, sign, fx, fy, lift in [('L', 1, 'lfx', 'lfy', 'lfLift'), ('R', -1, 'rfx', 'rfy', 'rfLift')]:
            target = Vector((s[fx], s[fy], ankleZ[side] + s[lift] + .003 + shift['feet']))
            PlaceFoot(side, target, Vector((sign * .19, -.95, .55)), Quaternion())
        Trace(clip, time, 'legs')
        axis = Vector((s['ax'], s['ay'], s['az'])).normalized()
        # The rig is scaled to the in-game 1.62 m but Actor cancels that scale on the
        # weapon, so the rifle keeps its real 0.4432 m fore-end distance.  Author the
        # hands that much further apart, or the left palm lands short of the fore-end.
        span = GRIP_SPAN / runtimeScale
        up = Vector((0, 0, 1)) - axis * axis.z
        if up.length < 1e-5:
            up = Vector((0, 1, 0))
        up.normalize()
        # A clip is written either from the blade tip (thrusts) or from the butt plate
        # (the butt stroke, where the butt is the end that has to land somewhere exact).
        tip = (Vector((s['buttX'], s['buttY'], s['buttZ'])) + axis * BUTT_TO_TIP + up * TIP_RISE
               if 'buttX' in s else Vector((s['tipX'], s['tipY'], s['tipZ'])))
        gripR = tip - axis * GRIP_TO_TIP - up * TIP_RISE
        gripL = gripR + axis * span
        chest = Point(Bone('Spine2'))
        across = up.cross(axis).normalized()
        # Elbow poles hang off the shoulders, not off the grips.  A pole tied to the
        # grip drifts onto the shoulder-to-hand line once the left arm crosses the body,
        # and a degenerate pole makes Chain straighten the arm and overshoot the target
        # (the symptom is a grip span wider than the rifle's fore-end).
        poleR = Point(Bone('R UpperArm')) + Vector((-.45, .10, -.55))
        poleL = Point(Bone('L UpperArm')) + Vector((.45, .10, -.55))
        for _ in range(3):
            ReachGrip('R', gripR, poleR)
            ReachGrip('L', gripL, poleL)
        Trace(clip, time, 'reach')
        roll = Quaternion(axis, s['twist'])
        # Both palms wrap the same barrel: fingers point across it, the palm faces it.
        # Palm and arm have to be settled together, not one after the other: turning the
        # palm drags the finger-root centroid off the barrel, and putting the centroid
        # back turns the forearm, which turns the palm again.  Two passes is enough to
        # come out with the grip on the barrel AND the palm still facing it; one pass
        # leaves whichever of the two was done last, and on the butt stroke's near-
        # vertical frames that was a hand 6 cm off the stock.
        for _ in range(2):
            normalR = TurnPalm('R', roll @ (axis * .55 - up * .84), roll @ (up * .30 + across * .94))
            normalL = TurnPalm('L', roll @ (axis * .45 - up * .89), roll @ (up * .28 - across * .96))
            Trace(clip, time, 'palms')
            ReachGrip('R', gripR, poleR, rounds=8)
            ReachGrip('L', gripL, poleL, rounds=8)
        Trace(clip, time, 'reach2')
        CurlFingers('R', normalR, 1.05, indexAmount=.55)
        CurlFingers('L', normalL, 1.05, indexAmount=.75)
        Update()
        Trace(clip, time, 'fingers')
        return {'tip': tip[:], 'butt': (gripR - axis * BUTT_BACK)[:], 'axis': axis[:],
                'gripRTarget': gripR[:], 'gripLTarget': gripL[:], 'chestZ': round(chest.z, 4)}

    def AuthorNra(clip, time):
        Reset()
        s = NraSpec(clip, time)
        frame = BodyQuat(s['pitch'], s['roll'], s['yaw'])
        supine = s['supine'] > .5
        pelvis = Vector((s['px'], s['py'], s['lift']))
        Move(Bone('Pelvis'), pelvis)
        Spin(Bone('Pelvis'), frame)
        for role, share in [('Spine', .30), ('Spine1', .35), ('Spine2', .35)]:
            TiltAxes(Bone(role), frame, x=s['bend'] * share)
        TiltAxes(Bone('Neck'), frame, x=s['headPitch'] * .35, y=s.get('headRoll', 0) * .35)
        TiltAxes(Bone('Head'), frame, x=s['headPitch'] * .65, y=s.get('headRoll', 0) * .65,
                 z=s['headYaw'])
        At = lambda x, y, z: pelvis + frame @ Vector((x, y, z))
        world = s['feetWorld'] > .5
        for side, sign, ax, ay, az, px, py, pz in [
                ('L', 1, 'lax', 'lay', 'laz', 'lpx', 'lpy', 'lpz'),
                ('R', -1, 'rax', 'ray', 'raz', 'rpx', 'rpy', 'rpz')]:
            target = (Vector((s[ax], s[ay], s[az] + shift['feet'])) if world
                      else At(s[ax], s[ay], s[az]))
            # The knee pole is written as the knee point itself; Chain only uses its
            # direction, but naming the joint is far easier to reason about than a ray.
            pole = (Vector((s[px], s[py], s[pz])) if world else At(s[px], s[py], s[pz]))
            # World feet keep the sole level with the floor no matter how far the torso
            # has folded; `footPitch` is the only thing that tips them.
            base = Quaternion() if world else frame
            splayAxis = base @ Vector((0, 0, 1))
            pitchAxis = base @ Vector((1, 0, 0))
            orient = (Quaternion(pitchAxis, s['footPitch'])
                      @ Quaternion(splayAxis, s['footSplay'] * sign) @ base)
            PlaceFoot(side, target, pole, orient)
        for side, sign, hx, hy, hz in [('L', 1, 'hlx', 'hly', 'hlz'), ('R', -1, 'hrx', 'hry', 'hrz')]:
            target = At(s[hx], s[hy], s[hz])
            # Elbow pole out to the side and behind: with the hands on the belly the arm
            # is almost straight, and an elbow left on the shoulder-to-wrist line drags
            # the whole forearm through the abdomen.
            pole = At(sign * s['apx'], s['apy'], s['apz'])
            ReachGrip(side, target, pole)
            # Palm: `palmBelly` 0 is the stretcher grip (fingers wrap a fore-and-aft pole),
            # 1 is the hand pressed flat on the wound (fingers across the belly toward the
            # midline, palm facing the body).
            belly = s['palmBelly']
            forward = Vector((Mix(-sign * .55, -sign * .80, belly), 0, Mix(-.83, .30, belly)))
            normal = Vector((Mix(-sign * .83, 0.0, belly), Mix(0.0, 1.0, belly), Mix(.55, 0.0, belly)))
            palm = TurnPalm(side, frame @ forward, frame @ normal)
            ReachGrip(side, target, pole, rounds=4)
            CurlFingers(side, palm, s['curl'])
        Update()
        return {'pelvisZ': round(pelvis.z, 4), 'supine': 1 if supine else 0}

    def FootFloor():
        depsgraph = bpy.context.evaluated_depsgraph_get()
        lowest = float('inf')
        for mesh in meshes:
            evaluated = mesh.evaluated_get(depsgraph)
            geometry = evaluated.to_mesh()
            matrix = evaluated.matrix_world
            for index in footGroups[mesh.name]:
                lowest = min(lowest, (matrix @ geometry.vertices[index].co).z)
            evaluated.to_mesh_clear()
        return lowest

    def AuthorPressure(clip, time):
        """Imported start pose, cross-faded into the authored collapse over PRESSURE_BLEND_S."""
        weight = Smooth(time / PRESSURE_BLEND_S) if PRESSURE_BLEND_S > 0 else 1
        info = ApplyMeleeStart()
        if weight <= 0:
            return info
        imported = {pb.name: pb.matrix_basis.copy() for pb in arm.pose.bones}
        info = dict(AuthorNra(clip, time), meleeBlend=round(weight, 4))
        if weight < 1:
            for pb in arm.pose.bones:
                p0, q0, s0 = imported[pb.name].decompose()
                p1, q1, s1 = pb.matrix_basis.decompose()
                pb.matrix_basis = Matrix.LocRotScale(p0.lerp(p1, weight), q0.slerp(q1, weight),
                                                     s0.lerp(s1, weight))
            Update()
        return info

    def RawAuthor(clip, time):
        if clip == 'PressureStabbed':
            return AuthorPressure(clip, time)
        return AuthorIja(clip, time) if prefix == 'Bip001' else AuthorNra(clip, time)

    def Author(clip, time):
        shift['feet'] = 0.0
        info = RawAuthor(clip, time)
        if prefix == 'Bip002' and clip != 'BearerStabbed':
            return info                       # supine clips ride the litter, not the floor
        for _ in range(3):
            error = .003 - FootFloor()
            if abs(error) < .0002:
                break
            shift['feet'] += error
            info = RawAuthor(clip, time)
        info['footShiftM'] = round(shift['feet'], 4)
        return info

    def SourcePose():
        current = {name: convertInv @ BWorld(arm.pose.bones[name]) @ corrections[name] for name in names}
        result = []
        for name in names:
            index = nodeIndex[name]
            parent = parents.get(index)
            parentName = nodes[parent].get('name') if parent is not None else None
            pm = current.get(parentName, sourceWorld[parent]) if parent is not None else Matrix.Identity(4)
            p, q, s = (pm.inverted() @ current[name]).decompose()
            result.extend([*p, q.x, q.y, q.z, q.w])
        return [round(v, 7) for v in result]

    def MeasureFloor():
        depsgraph = bpy.context.evaluated_depsgraph_get()
        lowest = float('inf')
        lowestAt = None
        footLowest = float('inf')
        box = [float('inf')] * 3 + [float('-inf')] * 3
        for mesh in meshes:
            evaluated = mesh.evaluated_get(depsgraph)
            geometry = evaluated.to_mesh()
            matrix = evaluated.matrix_world
            coords = [matrix @ v.co for v in geometry.vertices]
            for v in coords:
                for i in range(3):
                    box[i] = min(box[i], v[i])
                    box[3 + i] = max(box[3 + i], v[i])
                if v.z < lowest:
                    lowest = v.z
                    lowestAt = [round(c, 4) for c in v]
            for index in footGroups[mesh.name]:
                footLowest = min(footLowest, coords[index].z)
            evaluated.to_mesh_clear()
        return {'lowest': round(lowest, 4), 'lowestAt': lowestAt,
                'footLowest': round(footLowest, 4),
                'footAboveBodyM': round(footLowest - lowest, 4),
                'box': [round(v, 4) for v in box]}

    framesByClip = {}
    metrics = []
    for clip in clips:
        duration, loop = definitions[clip]
        count = round(duration * fps) + 1
        step = duration / (count - 1)
        action = bpy.data.actions.new(clip)
        arm.animation_data_create()
        arm.animation_data.action = action
        values = []
        samples = []
        probeFrames = sorted(set(range(0, count, 2)) | {count - 1})
        for frame in range(count):
            arm.animation_data.action = None
            time = frame * step
            info = Author(clip, time)
            values.extend(SourcePose())
            # Measure the pose that was just exported.  Probing after
            # `scene.frame_set` instead reads the action back through the depsgraph,
            # which is a different pose while the curves are still being written.
            if frame in probeFrames:
                sample = {'time': round(time, 4), 'frame': frame,
                          'headZ': round(Point(Bone('Head')).z, 4),
                          'pelvisZ': round(Point(Bone('Pelvis')).z, 4),
                          'pelvis': [round(v, 4) for v in Point(Bone('Pelvis'))],
                          'gripR': [round(v, 4) for v in GripPoint('R')],
                          'gripL': [round(v, 4) for v in GripPoint('L')],
                          'armL': [round(v, 4) for v in Point(Bone('L UpperArm'))],
                          'armR': [round(v, 4) for v in Point(Bone('R UpperArm'))],
                          'kneeL': [round(v, 4) for v in Point(Bone('L Calf'))],
                          'kneeR': [round(v, 4) for v in Point(Bone('R Calf'))],
                          'ankleL': [round(v, 4) for v in Point(Bone('L Foot'))],
                          'ankleR': [round(v, 4) for v in Point(Bone('R Foot'))]}
                sample['gripSpan'] = round((GripPoint('L') - GripPoint('R')).length, 4)
                sample.update(MeasureFloor())
                sample.update({k: ([round(x, 4) for x in v] if isinstance(v, (list, tuple)) else v)
                               for k, v in info.items()})
                if prefix == 'Bip001':
                    axis = (GripPoint('L') - GripPoint('R')).normalized()
                    up = Point(Bone('Neck')) - Point(Bone('Pelvis'))
                    up = (up - axis * up.dot(axis)).normalized()
                    actual = GripPoint('R') + axis * GRIP_TO_TIP + up * TIP_RISE
                    sample['tipActual'] = [round(v, 4) for v in actual]
                    sample['buttActual'] = [round(v, 4) for v in (GripPoint('R') - axis * BUTT_BACK)]
                    if clip == 'PressureStabbed' and frame == 0:
                        # The imported frame has to survive Put/Update and come back out
                        # of the pose bones unchanged; the browser test then measures the
                        # same thing end to end, through the shipped asset.
                        worst = 0.0
                        for part in meleeOrder:
                            name = prefix + ' ' + part
                            want = meleeStart[part][0] @ restWorld[name].to_quaternion()
                            got = BWorld(arm.pose.bones[name]).to_quaternion()
                            worst = max(worst, math.degrees(
                                2 * math.acos(min(1.0, abs(want.dot(got))))))
                        sample['meleeStartWorstDeg'] = round(worst, 4)
                samples.append(sample)
            arm.animation_data.action = action
            for name in names:
                pb = arm.pose.bones[name]
                pb.keyframe_insert('location', frame=frame)
                pb.keyframe_insert('rotation_quaternion', frame=frame)
                pb.keyframe_insert('scale', frame=frame)
        framesByClip[clip] = {'duration': duration, 'loop': loop, 'frameCount': count, 'values': values}
        action.use_fake_user = True
        arm.animation_data.action = None
        track = arm.animation_data.nla_tracks.new()
        track.name = clip
        track.mute = True
        track.strips.new(clip, 0, action)
        # The .blend is the human review copy; confirm its action really replays the
        # poses that were exported instead of trusting the keyframe round trip.
        arm.animation_data.action = action
        drift = 0.0
        for sample in samples:
            scene.frame_set(sample['frame'])
            Update()
            drift = max(drift, abs(Point(Bone('Head')).z - sample['headZ']),
                        abs(Point(Bone('Pelvis')).z - sample['pelvisZ']))
        arm.animation_data.action = None
        metrics.append({'clip': clip, 'reviewActionDriftM': round(drift, 5), 'samples': samples})
        print('Ambush authored ' + modelId + ' ' + clip + ' reviewDrift=' + str(round(drift, 5)), flush=True)

    arm.animation_data.action = bpy.data.actions[clips[0]]
    scene.frame_start = 0
    scene.frame_end = round(definitions[clips[0]][0] * fps)
    scene.frame_set(0)
    for track in arm.animation_data.nla_tracks:
        track.mute = True

    def Material(name, color):
        mat = bpy.data.materials.new(name)
        mat.diffuse_color = (*color, 1)
        return mat

    def Box(name, location, scale, mat, rotation=(0, 0, 0)):
        bpy.ops.mesh.primitive_cube_add(size=1, location=location)
        o = bpy.context.object
        o.name = name
        o.scale = scale
        o.rotation_euler = rotation
        o.data.materials.append(mat)
        return o

    floorMat = Material('Material_AmbushProofFloor', (.13, .14, .15))
    timber = Material('Material_AmbushProofTimber', (.17, .12, .08))
    Box('Prop_ProofFloor', (0, 0, -.04), (4, 4, .08), floorMat)
    if prefix == 'Bip002':
        # Litter deck reference for the two supine clips: 1.95 x 0.58, top face at z = 0.
        Box('Prop_ProofLitter', (0, 0, -.05), (.58, 1.95, .10), timber)
    else:
        Box('Prop_ProofScreen', (0, 1.05, .55), (1.9, .10, 1.10), timber)
    bpy.ops.object.camera_add(location=(-3.3, -3.9, 2.2))
    camera = bpy.context.object
    camera.name = 'Camera_AmbushPoseReview'
    camera.rotation_euler = (Vector((0, -.35, .85)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 3.2
    scene.camera = camera
    for name, point, power, size in [('Light_Key', (-2.4, -3.4, 4), 620, 4), ('Light_Fill', (3, -1.4, 3), 430, 3)]:
        bpy.ops.object.light_add(type='AREA', location=point)
        lamp = bpy.context.object
        lamp.name = name
        lamp.data.energy = power
        lamp.data.shape = 'DISK'
        lamp.data.size = size
        lamp.rotation_euler = (Vector((0, 0, .9)) - lamp.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 10
    scene.render.resolution_x = 560
    scene.render.resolution_y = 560
    scene.render.resolution_percentage = 100
    if not scene.world:
        scene.world = bpy.data.worlds.new('World_AmbushProof')
    scene.world.color = (.22, .22, .22)
    scene['authoringTool'] = 'Blender 5.1 headless (blender --background --python)'
    scene['runtimeCoordinatePolicy'] = ('Original GLB bone frames, source +Z facing, runtime '
                                        'CharacterModel yaw PI -> actor -Z; no Actor world-root tracks')
    scene['originalSourceSha256'] = hashlib.sha256(source.read_bytes()).hexdigest()
    scene['reviewActions'] = 'Select an action on the original armature; NLA copies are muted for reference'
    bpy.ops.file.pack_all()
    blend = private / ('Scene_' + modelId + 'RoomAmbush.blend')
    bpy.ops.wm.save_as_mainfile(filepath=str(blend), compress=True)

    if render:
        reviewDir = private / 'Review'
        reviewDir.mkdir(parents=True, exist_ok=True)
        for clip in clips:
            arm.animation_data.action = bpy.data.actions[clip]
            count = framesByClip[clip]['frameCount']
            for frame in sorted({0, count // 3, (2 * count) // 3, count - 1}):
                scene.frame_set(frame)
                scene.render.filepath = str(reviewDir / ('Texture_' + modelId + '_' + clip + '_%02d' % frame))
                bpy.ops.render.render(write_still=True)
        arm.animation_data.action = bpy.data.actions[clips[0]]
        scene.frame_set(0)

    if only:
        print('AMBUSH_PARTIAL ' + modelId + ' ' + only + ' (asset not written)', flush=True)
        (private / ('Data_' + modelId + 'RoomAmbushValidation.json')).write_text(
            json.dumps({'modelId': modelId, 'partial': only, 'samples': metrics}, indent=1),
            encoding='utf-8')
        return {'modelId': modelId, 'partial': only}
    asset = {'schema': 1, 'modelId': modelId, 'authoringTool': scene['authoringTool'],
             'originalModelSha256': scene['originalSourceSha256'], 'fps': fps, 'stride': 7,
             'bones': names, 'clips': framesByClip}
    file = output / ('Animation_' + modelId + 'Ambush.json')
    temporary = file.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(asset, separators=(',', ':')), encoding='utf-8')
    temporary.replace(file)
    validation = {'modelId': modelId, 'prefix': prefix, 'sourceFacingBlender': sourceFacing,
                  'runtimeForward': [0, 0, -1], 'restPelvisZ': round(restPelvis, 4),
                  'restChestZ': round(restChest, 4), 'ankleZ': {k: round(v, 4) for k, v in ankleZ.items()},
                  'runtimeTargetHeightM': targetHeight,
                  'runtimeScale': round(runtimeScale, 5),
                  'authoredGripSpanM': round(GRIP_SPAN / runtimeScale, 5),
                  'clipCount': len(framesByClip), 'samples': metrics, 'blend': str(blend),
                  'file': file.name, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()}
    (private / ('Data_' + modelId + 'RoomAmbushValidation.json')).write_text(
        json.dumps(validation, indent=1), encoding='utf-8')
    return validation


selected = os.environ.get('AMBUSH_MODEL')
render = os.environ.get('AMBUSH_RENDER') == '1'
results = [Bake(modelId, render) for modelId in modelClips if not selected or selected == modelId]
manifest = {'schema': 1, 'version': VERSION,
            'authoringTool': 'Blender 5.1 headless (blender --background --python)',
            'actorForward': [0, 0, -1], 'floorClearanceM': .003,
            'scope': 'First level room ambush (public phase 9 Melee) only',
            'clips': {name: {'duration': duration, 'loop': loop}
                      for name, (duration, loop) in definitions.items()},
            'models': []}
for modelId in modelClips:
    file = output / ('Animation_' + modelId + 'Ambush.json')
    if file.exists():
        manifest['models'].append({
            'id': modelId, 'file': file.name,
            'sha256': hashlib.sha256(file.read_bytes()).hexdigest(),
            'clipIds': modelClips[modelId],
            'originalModelSha256': hashlib.sha256(
                (project / 'Model/Character' / ('Model_' + modelId + '.glb')).read_bytes()).hexdigest()})
manifestFile = output / 'Data_FirstLevelAmbushAnimation.json'
temporary = manifestFile.with_suffix('.json.tmp')
temporary.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
temporary.replace(manifestFile)
print('AMBUSH_BAKE_DONE ' + str(output), flush=True)
