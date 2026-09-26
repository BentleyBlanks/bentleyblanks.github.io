"""Author the machine-gun captives cutscene motions on five production rigs.

Ten clips: five surrender/execution motions for the NRA captives (NRA02, NRA05)
and five guard/humiliation motions for the IJA soldiers (IJA01, IJA02, IJA03).

Run with the installed Blender:

    blender.exe --background --python-exit-code 1 --python
        Taierzhuang1938/_import/Script_MachineGunCaptivesBake.py

Meshes, skins, inverse binds and the original local bone frames of the runtime
GLB stay untouched; only a JSON of original-rig bone samples is produced. The
editable Blender scenes are saved outside the Pages repository. Environment:
`CAPTIVES_PROJECT` (absolute Taierzhuang1938 directory, default <cwd>/Taierzhuang1938),
`CAPTIVES_BLEND` (editable scene directory), `CAPTIVES_MODEL` (bake one rig only),
`CAPTIVES_SKIP_BLEND=1` (skip saving .blend while iterating).

Coordinates inside this script are Blender metres on the *source* scale
(about 1.76-1.82 m tall): +Z up, character forward -Y, character's own left +X,
ground plane z = 0. Every authored frame is translated vertically so the lowest
skinned vertex of that frame rests at `CLEARANCE`; the runtime therefore needs no
floor probe. The exporter converts each Blender bone frame back to the source GLB
local frame, so the runtime never imports a new rig.
"""
import bpy, json, math, struct, hashlib, os, time
from contextlib import contextmanager
from pathlib import Path
from mathutils import Matrix, Vector, Quaternion

project = Path(os.environ.get('CAPTIVES_PROJECT', str(Path.cwd() / 'Taierzhuang1938')))
private = Path(os.environ.get('CAPTIVES_BLEND',
    'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/MachineGunCaptives_20260915'))
output = project / 'Animation/MachineGunCaptives'
output.mkdir(parents=True, exist_ok=True)
if not os.environ.get('CAPTIVES_SKIP_BLEND'):
    private.mkdir(parents=True, exist_ok=True)

fps = 24
CLEARANCE = 0.003
VERSION = '20260916MachineGunCaptivesV3'
TOOL = 'Blender 5.1 driven over BlenderMCP (execute_code), same bpy path as --background'

# clip -> (seconds, loop, weaponHold)
DEFINITIONS = {
    'CaptiveHandsUpWalk':    (1.8, True,  'free'),
    'CaptiveShovedStumble':  (0.7, False, 'free'),
    'CaptiveHandsUpStand':   (4.0, True,  'free'),
    'CaptiveStandToKneel':   (1.0, False, 'free'),
    'CaptiveKneelHandsHead': (4.0, True,  'free'),
    'CaptiveKneelPlead':     (4.0, True,  'free'),
    'CaptiveKneelFlinch':    (0.8, False, 'free'),
    'CaptiveStruckDown':     (1.6, False, 'free'),
    'CaptiveStabbedCollapse': (2.0, False, 'free'),
    'IjaBayonetGuard':       (4.0, True,  'twoHand'),
    'IjaTauntGesture':       (4.0, True,  'oneHandRight'),
    'IjaShoveForward':       (0.9, False, 'oneHandRight'),
    'IjaKickPrisoner':       (1.2, False, 'twoHand'),
    'IjaRifleButtStrike':    (1.4, False, 'twoHand'),
    'IjaBayonetDownThrust':  (1.6, False, 'twoHand'),
}
CAPTIVE_CLIPS = ['CaptiveHandsUpWalk', 'CaptiveShovedStumble', 'CaptiveHandsUpStand',
                 'CaptiveStandToKneel', 'CaptiveKneelHandsHead', 'CaptiveKneelPlead',
                 'CaptiveKneelFlinch', 'CaptiveStruckDown', 'CaptiveStabbedCollapse']
GUARD_CLIPS = ['IjaBayonetGuard', 'IjaTauntGesture', 'IjaShoveForward', 'IjaKickPrisoner',
               'IjaRifleButtStrike', 'IjaBayonetDownThrust']

# The marched-in gait. The adapter has no root motion, so the clip carries the ground
# speed it was authored at and the runtime rescales playback to the cutscene track
# (`state.moveSpeed * 4.2 / referenceSpeedMps`). WALK_AMP is derived, not chosen: a foot
# planted for WALK_STANCE of a WALK_CYCLE-long cycle at WALK_SPEED slides back exactly
# this far, and that is what "no skating" means. Half of it (0.287 m) has to stay inside
# the leg's horizontal reach at the authored crouch — measured 0.347 m at WALK_CROUCH.
WALK_CYCLE = 0.9
WALK_STANCE = 0.58
WALK_SPEED = 1.10
WALK_AMP = WALK_SPEED * WALK_STANCE * WALK_CYCLE
WALK_LIFT = 0.085
WALK_CROUCH = 0.105
REFERENCE_SPEED = {'CaptiveHandsUpWalk': WALK_SPEED}

# Where each strike lands on the kneeling man, as (name, height band, approach angle).
# The angle is measured from straight-behind him toward his own left (+X, degrees) and is
# read off the stage table — every attacker keeps his bearing and only the distance is
# retuned, so these do not move. What the baker reports is the **support distance**: how
# far his skin reaches from his own origin along that bearing. The stage distance the
# cutscene needs is then `strikeReach + support`, both in runtime metres.
#
# This is the number the 2026-09-15 pass did not have. It used the toe *bone height*
# (0.63) as the kick's reach and put the guard 0.78 m away; the boot actually reaches
# 0.80 m and his chest starts 0.15 m out, so the kick went a sixth of a metre through him.
CONTACT_TARGETS = [('shove', 0.95, 1.05, -45.0), ('kick', 0.58, 0.68, -39.8),
                   ('butt', 0.92, 1.02, 53.7),
                   ('thrustYoung', 0.74, 0.84, 38.4), ('thrustThird', 0.74, 0.84, 19.7)]
CONTACT_BAND_CLIPS = ('CaptiveHandsUpWalk', 'CaptiveKneelHandsHead', 'CaptiveKneelPlead',
                      'CaptiveKneelFlinch')
# Half-width of the corridor the striking end sweeps, in runtime metres (a boot sole, a
# rifle butt plate and a bayonet blade are all well inside 18 cm across).
CONTACT_CORRIDOR = 0.09
MODEL_CLIPS = {
    'TengxianNra02': CAPTIVE_CLIPS,
    'TengxianNra05': CAPTIVE_CLIPS,
    'TengxianIja01': GUARD_CLIPS,
    'TengxianIja02': GUARD_CLIPS,
    'TengxianIja03': GUARD_CLIPS,
}
# Type38 with a fixed bayonet, measured from the right-hand grip mount
# (_blender/BuildWeapons.py BUTT_Z 0.255, Data_Weapons bayonetTotalM 1.663).
BAYONET_TIP_M = 1.663 - 0.255
# Script_Actor KIND_SPEC heights, i.e. what CharacterModel scales each rig to. Every
# runtime-metre number this script prints is source metres times targetHeight/restTop,
# so getting the guards wrong (they are NOT 1.66) biases every reach it reports.
TARGET_HEIGHT = {'nra': 1.66, 'ija': 1.62}
# 2026-09-26 (TengxianHumanoidV1, docs/Data_CharacterStandard.md): the rigs are the shared-skeleton
# bodies, and the runtime scales every one of them by targetHeight / the reference skeleton height
# (manifest bounds). The clips were authored in "source metres" of the old Lugou rigs, whose
# runtime scale was targetHeight / their own rest top. To keep every authored number meaning what
# it meant at runtime, the bake poses an AUTHORING copy of the new body scaled by
# f = runtime scale now / runtime scale then (tmp/AuthoringRigs): its Blender metres are the old
# source metres, AUTHORING_SCALE is the old source -> runtime factor, and SourcePose divides the
# written translations by f, so the JSON is in the shipped GLB's own node units.
# Values: the 2026-09-25 validation reports' scale (1.62 or 1.66 / the Lugou rest top).
AUTHORING_SCALE = {'TengxianNra02': 0.9135347842293876, 'TengxianNra05': 0.9184049601068548,
                   'TengxianIja01': 0.9213172117987332, 'TengxianIja02': 0.9127865977215439,
                   'TengxianIja03': 0.9197482282578858}

convert = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
convertInv = convert.inverted()
Clamp = lambda x, a=0, b=1: max(a, min(b, x))
Smooth = lambda x: Clamp(x) * Clamp(x) * (3 - 2 * Clamp(x))
Mix = lambda a, b, x: a + (b - a) * x
Tau = math.pi * 2


@contextmanager
def GuiContext():
    """Give operators a real window/area to run in.

    Under `blender --background` there is nothing to override and this is a no-op.
    Under BlenderMCP the script runs inside a `bpy.app.timers` callback, and right
    after `read_factory_settings` that callback's context has lost `object` /
    `collection` — the glTF importer dereferences `bpy.context.object` and dies with
    `'Context' object has no attribute 'object'`. Re-fetching the window from
    `bpy.data` (not from the stale `bpy.context`) and overriding fixes every
    operator below, and changes nothing about the product.
    """
    managers = list(bpy.data.window_managers)
    windows = list(managers[0].windows) if managers else []
    if bpy.app.background or not windows:
        yield
        return
    window = windows[0]
    override = {'window': window, 'screen': window.screen,
                'scene': window.scene, 'view_layer': window.view_layer}
    area = next((a for a in window.screen.areas if a.type == 'VIEW_3D'), None)
    if area is not None:
        override['area'] = area
        region = next((r for r in area.regions if r.type == 'WINDOW'), None)
        if region is not None:
            override['region'] = region
    with bpy.context.temp_override(**override):
        yield


def Op(operator, **kwargs):
    """Run one bpy operator inside GuiContext()."""
    with GuiContext():
        return operator(**kwargs)


def ResetScene():
    """Empty factory scene to bake into. Same data both ways; only the UI differs.

    `--background` uses `read_factory_settings`, which is what it has always been.
    Under BlenderMCP the very same call **quits Blender**: it runs inside a
    `bpy.app.timers` callback, replaces the window manager, and the new factory file
    has no window attached to that callback's context, so the main loop finds zero
    windows and exits ("Blender quit" one line after "Preferences saved").
    `read_homefile(load_ui=False)` loads the same empty factory scene and leaves the
    existing window alone. It still reloads preferences -- the add-on is disabled and
    the socket server stops, which is what the bootstrap's watchdog is for.
    """
    if bpy.app.background:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        return
    with GuiContext():
        bpy.ops.wm.read_homefile(use_empty=True, use_factory_startup=True, load_ui=False)


def Add(operator, **kwargs):
    """Run an object-creating operator and hand back the object it made.

    `bpy.context.object` has to be read inside the same override the operator ran
    in; outside it, the post-reset timer context does not have that attribute.
    """
    with GuiContext():
        operator(**kwargs)
        return bpy.context.object


def AuthoringRig(modelId):
    """(authoring GLB path, f): the shipped body uniformly scaled by f about its origin (joint
    translations, vertex positions and inverse-bind translations; clips dropped)."""
    import numpy as np
    shipped = project / 'Model/Character' / ('Model_' + modelId + '.glb')
    manifest = json.loads((project / 'Model/Character/Data_TengxianCharacterManifest.json').read_text(encoding='utf-8'))
    record = next(r for r in manifest['models'] if r['id'] == modelId)
    height = float(record.get('scaleHeight') or record['bounds']['size'][2])   # Script_CharacterModel CharacterScaleHeight
    kind = 'ija' if 'Ija' in modelId else 'nra'
    f = (TARGET_HEIGHT[kind] / height) / AUTHORING_SCALE[modelId]
    data = shipped.read_bytes()
    length = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20 + length])
    binary = bytearray(data[28 + length:])
    for node in doc['nodes']:
        if 'translation' in node:
            node['translation'] = [v * f for v in node['translation']]
        if 'matrix' in node:
            node['matrix'] = [v * f if i in (12, 13, 14) else v for i, v in enumerate(node['matrix'])]

    def View(index, width):
        a = doc['accessors'][index]
        assert a['componentType'] == 5126 and not a.get('sparse')
        v = doc['bufferViews'][a['bufferView']]
        stride = v.get('byteStride', width * 4) // 4
        start = v.get('byteOffset', 0) + a.get('byteOffset', 0)
        return np.ndarray((a['count'], width), dtype='<f4', buffer=binary, offset=start, strides=(stride * 4, 4))
    positions = {p['attributes']['POSITION'] for mesh in doc.get('meshes', []) for p in mesh['primitives']}
    for index in positions:
        values = View(index, 3)
        values *= f
        a = doc['accessors'][index]
        if 'min' in a:
            a['min'], a['max'] = values.min(axis=0).tolist(), values.max(axis=0).tolist()
    for skin in doc.get('skins', []):
        values = View(skin['inverseBindMatrices'], 16)
        values[:, 12:15] *= f
    doc.pop('animations', None)
    raw = json.dumps(doc, separators=(',', ':')).encode()
    raw += b' ' * (-len(raw) % 4)
    binary += b'\0' * (-len(binary) % 4)
    out = project.parent / 'tmp/AuthoringRigs' / ('Model_' + modelId + '.glb')
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(struct.pack('<III', 0x46546c67, 2, 28 + len(raw) + len(binary))
                    + struct.pack('<II', len(raw), 0x4e4f534a) + raw
                    + struct.pack('<II', len(binary), 0x004e4942) + bytes(binary))
    return out, f


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


def Track(keys, time):
    """Smooth-stepped table of pose parameters; scalars and tuples both interpolate."""
    if time <= keys[0][0]:
        return dict(keys[0][1])
    if time >= keys[-1][0]:
        return dict(keys[-1][1])
    for a, b in zip(keys, keys[1:]):
        if a[0] <= time <= b[0]:
            w = Smooth((time - a[0]) / max(1e-6, b[0] - a[0]))
            out = {}
            for key, va in a[1].items():
                vb = b[1][key]
                if isinstance(va, (tuple, list)):
                    out[key] = tuple(Mix(va[i], vb[i], w) for i in range(len(va)))
                else:
                    out[key] = Mix(va, vb, w)
            return out
    return dict(keys[-1][1])


def Bake(modelId, probe=None):
    """Author every clip of one rig and write its JSON.

    `probe` is the BlenderMCP hook: pass a callable and the rig is built, measured
    and calibrated as usual, then the callable is handed every local helper
    (`Author`, `ApplyPose`, `Point`, `RegionLows`, `LowestVertex`, the rest
    measurements …) and its return value replaces the bake. Nothing is written.
    That is how the 2026-09-16 pass posed and measured interactively inside a live
    Blender without a second copy of the rig setup drifting away from this one.
    """
    started = time.time()
    ResetScene()
    scene = bpy.context.scene
    scene.render.fps = fps
    source = project / 'Model/Character' / ('Model_' + modelId + '.glb')
    rigFile, authoringFactor = AuthoringRig(modelId)
    document = ReadGlb(rigFile)
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
    Op(bpy.ops.import_scene.gltf, filepath=str(rigFile))
    arm = next(o for o in scene.objects if o.type == 'ARMATURE')
    arm.animation_data_clear()
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
    # Written bone order = the committed captives library's (Script_OpeningStoryboardAnimation copies
    # captives clips into the opening records and checks the orders match). On TengxianHumanoidV1 the
    # Blender pose-bone order follows the new thigh/clavicle parents, not the retargeted library's.
    committedOrder = output / ('Animation_' + modelId + 'MachineGunCaptives.json')
    if committedOrder.exists():
        order = json.loads(committedOrder.read_text(encoding='utf-8'))['bones']
        if sorted(order) == sorted(names):
            names = order
    prefix = next(n for n in names if n.endswith(' Pelvis')).split(' ')[0]
    Bone = lambda role: arm.pose.bones[prefix + ' ' + role]
    armInv = arm.matrix_world.inverted()
    corrections = {name: (arm.matrix_world @ arm.data.bones[name].matrix_local).inverted()
                   @ convert @ sourceWorld[nodeIndex[name]] for name in names}
    rest = {p.name: p.matrix_basis.copy() for p in arm.pose.bones}
    BWorld = lambda pb: arm.matrix_world @ pb.matrix
    Point = lambda pb: BWorld(pb).translation.copy()
    Update = lambda: bpy.context.view_layer.update()

    def GripPoint(side):
        """Where the runtime actually mounts the rifle.

        `Script_CharacterModel.BuildHandGrip` does NOT use the hand bone: a Max Biped hand
        tail sits 8-10 cm out of the palm, so the runtime grip is the centroid of the four
        finger roots. Measuring the hand bone here instead put every reported bayonet tip
        and butt about 3.5 cm off the number the gate reads, which is a third of the
        margin the stage distances are tuned to."""
        total = Vector((0, 0, 0))
        for finger in range(1, 5):
            total += Point(Bone(side + ' Finger' + str(finger)))
        return total / 4

    def Put(pb, matrix):
        pb.matrix = armInv @ matrix
        Update()

    def Move(pb, point):
        matrix = BWorld(pb)
        matrix.translation = Vector(point)
        Put(pb, matrix)

    def Tilt(pb, x=0, y=0, z=0):
        return TiltWorld(pb, x=x, y=y, z=z)

    def TiltWorld(pb, x=0, y=0, z=0):
        if abs(x) < 1e-9 and abs(y) < 1e-9 and abs(z) < 1e-9:
            return
        matrix = BWorld(pb)
        point = matrix.translation.copy()
        rotation = Quaternion((0, 0, 1), z) @ Quaternion((0, 1, 0), y) @ Quaternion((1, 0, 0), x)
        Put(pb, Matrix.Translation(point) @ rotation.to_matrix().to_4x4()
            @ Matrix.Translation(-point) @ matrix)

    def Aim(pb, child, target):
        at = Point(pb)
        direction = Point(child) - at
        delta = direction.rotation_difference(Vector(target) - at)
        Put(pb, Matrix.Translation(at) @ delta.to_matrix().to_4x4() @ Matrix.Translation(-at) @ BWorld(pb))

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
        Put(hand, Matrix.Translation(at) @ delta.to_matrix().to_4x4() @ Matrix.Translation(-at) @ BWorld(hand))
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

    overreach = []

    def Chain(a, b, c, target, pole, label=''):
        start = Point(a)
        mid = Point(b)
        end = Point(c)
        target = Vector(target)
        pole = Vector(pole)
        l1 = (mid - start).length
        l2 = (end - mid).length
        direction = target - start
        want = direction.length
        if want > (l1 + l2) * .99 and label:
            overreach.append((label, round(want / (l1 + l2), 3)))
        distance = Clamp(want, abs(l1 - l2) + .0001, l1 + l2 - .0001)
        direction.normalize()
        bend = pole - start
        bend -= direction * bend.dot(direction)
        bend.normalize()
        along = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance)
        knee = start + direction * along + bend * math.sqrt(max(0, l1 * l1 - along * along))
        Aim(a, b, knee)
        Aim(b, c, target)

    # ---- rest measurements (source metres) -------------------------------
    footQuats = {side: BWorld(Bone(side + ' Foot')).to_quaternion() for side in ['L', 'R']}
    restPelvis = Point(Bone('Pelvis')).z
    restChest = Point(Bone('Spine2')).z
    restHead = Point(Bone('Head')).z
    ankleZ = Point(Bone('L Foot')).z
    hipHalf = abs(Point(Bone('L Thigh')).x)
    femur = (Point(Bone('L Thigh')) - Point(Bone('L Calf'))).length
    shin = (Point(Bone('L Calf')) - Point(Bone('L Foot'))).length
    footLen = (Point(Bone('L Toe0')) - Point(Bone('L Foot'))).length
    shoulder = {side: Point(Bone(side + ' UpperArm')) for side in ['L', 'R']}
    armLen = ((Point(Bone('L UpperArm')) - Point(Bone('L Forearm'))).length
              + (Point(Bone('L Forearm')) - Point(Bone('L Hand'))).length)
    # Source +Z maps to Blender -Y, then CharacterModel's pi-yaw gives actor -Z.
    sourceFacing = {side: ((Point(Bone(side + ' Toe0')) - Point(Bone(side + ' Foot'))).normalized())[:]
                    for side in ['L', 'R']}
    assert sum(v[1] for v in sourceFacing.values()) < -1, sourceFacing
    restTop = max((o.matrix_world @ v.co).z for o in meshes for v in o.data.vertices)
    # CharacterModel's targetHeight, and it is **not the same for both sides**
    # (Script_Actor KIND_SPEC: nra 1.66, ija 1.62). Reporting the guards at 1.66 made
    # every IJA reach in this file 2.4 % long -- about 2 cm on the butt and the bayonet,
    # which is four times the tolerance the stage distances are tuned to.
    # (was targetHeight / restTop on the Lugou rigs; the authoring copy keeps that meaning -- see AUTHORING_SCALE)
    nominalScale = AUTHORING_SCALE[modelId]
    print('REST %s pelvis %.3f chest %.3f head %.3f ankle %.3f femur %.3f shin %.3f arm %.3f'
          % (modelId, restPelvis, restChest, restHead, ankleZ, femur, shin, armLen), flush=True)

    kneeZ = 0.075                       # knee joint centre when the knee is on the ground
    kneelLean = 0.30                    # femur tipped back from vertical (rad)
    kneelPelvisZ = kneeZ + femur * math.cos(kneelLean)
    kneelPelvisY = -0.10 + femur * math.sin(kneelLean)
    # Shin flat on the ground, instep down: the ankle sits a shin-length behind the
    # knee and the foot continues back and down so the boot top meets the floor.
    kneelAnkleDy = shin * .998 - .10 - kneelPelvisY
    kneelAnkleZ = kneeZ + shin * .060
    kneelToe = (0, .855, -.519)
    kneelAnkle = lambda sign: (sign * (hipHalf + .012), kneelPelvisY + kneelAnkleDy, kneelAnkleZ)
    kneelPole = lambda sign: (sign * (hipHalf + .03), -1.2, -0.35)

    # ---- pose application -------------------------------------------------
    def ApplyPose(p, lift):
        """p is a plain dict of world-space targets; `lift` shifts every one of them.

        Optional `frameYaw` (radians, + = turn left) and `frameShift` (x, y) author the whole
        pose in a turned/moved frame (opening clips that pivot the body): every target and
        every tilt axis is carried by that frame. Absent (all captives clips) the math below
        is the original world-axis path, bit for bit."""
        frameYaw = p.get('frameYaw', 0.0)
        shift = p.get('frameShift', (0.0, 0.0))
        framed = abs(frameYaw) > 1e-12 or abs(shift[0]) > 1e-12 or abs(shift[1]) > 1e-12
        spin = Quaternion((0, 0, 1), frameYaw)
        spinInv = spin.inverted()

        def L(point):
            if not framed:
                return (point[0], point[1], point[2] + lift)
            v = spin @ Vector(point)
            return (v.x + shift[0], v.y + shift[1], v.z + lift)

        def D(v):
            return tuple(spin @ Vector(v)) if framed else v

        def Tilt(pb, x=0, y=0, z=0):
            if not framed:
                return TiltWorld(pb, x=x, y=y, z=z)
            if abs(x) < 1e-9 and abs(y) < 1e-9 and abs(z) < 1e-9:
                return
            matrix = BWorld(pb)
            point = matrix.translation.copy()
            rotation = spin @ Quaternion((0, 0, 1), z) @ Quaternion((0, 1, 0), y) @ Quaternion((1, 0, 0), x) @ spinInv
            Put(pb, Matrix.Translation(point) @ rotation.to_matrix().to_4x4()
                @ Matrix.Translation(-point) @ matrix)

        pelvis = Bone('Pelvis')
        Move(pelvis, L(p['pelvis']))
        if framed and abs(frameYaw) > 1e-12:
            # The frame turns the body itself: the hips (and everything the spine carries)
            # yaw about the pelvis; the tilts below are then expressed in that turned frame.
            TiltWorld(pelvis, z=frameYaw)
        tilt = p.get('pelvisTilt', (0, 0, 0))
        Tilt(pelvis, x=tilt[0], y=tilt[1], z=tilt[2])
        bend = p.get('bend', 0.0)
        lean = p.get('lean', 0.0)
        twist = p.get('twist', 0.0)
        Tilt(Bone('Spine'), x=bend * .34, y=lean * .34, z=twist * .34)
        Tilt(Bone('Spine1'), x=bend * .33, y=lean * .33, z=twist * .33)
        Tilt(Bone('Spine2'), x=bend * .33, y=lean * .33, z=twist * .33)
        neck = p.get('neck', (0, 0, 0))
        Tilt(Bone('Neck'), x=neck[0], y=neck[1], z=neck[2])
        head = p.get('head', (0, 0, 0))
        Tilt(Bone('Head'), x=head[0], y=head[1], z=head[2])
        shrug = p.get('shrug', 0.0)
        for side, sign in [('L', 1), ('R', -1)]:
            Tilt(Bone(side + ' Clavicle'), y=-sign * shrug)
        # Shoulder brought forward (protraction, rad about the vertical) for a hand that reaches
        # (2026-09-26, TengxianHumanoidV1: the common skeleton's shoulders sit ~5 cm further back).
        for side, sign in [('L', 1), ('R', -1)]:
            amount = (p.get('protract') or {}).get(side) or 0.0
            if amount:
                Tilt(Bone(side + ' Clavicle'), z=-sign * amount)
        for side, sign in [('L', 1), ('R', -1)]:
            foot = Bone(side + ' Foot')
            Chain(Bone(side + ' Thigh'), Bone(side + ' Calf'), foot,
                  L(p['ankles'][side]), L(p['legPoles'][side]), label='leg' + side)
            toeDir = p.get('toeDirs', {}).get(side)
            if toeDir is None:
                matrix = BWorld(foot)
                location = matrix.translation.copy()
                _, _, scale = matrix.decompose()
                Put(foot, Matrix.LocRotScale(location, (spin @ footQuats[side]) if framed else footQuats[side], scale))
            else:
                at = Point(foot)
                Aim(foot, Bone(side + ' Toe0'), at + Vector(D(toeDir)).normalized() * footLen)
        for side, sign in [('L', 1), ('R', -1)]:
            Chain(Bone(side + ' UpperArm'), Bone(side + ' Forearm'), Bone(side + ' Hand'),
                  L(p['hands'][side]), L(p['armPoles'][side]), label='arm' + side)
        for side in ['L', 'R']:
            palm = p.get('palms', {}).get(side)
            if not palm:
                continue
            forward, normalHint, curl = palm[0], palm[1], palm[2]
            indexCurl = palm[3] if len(palm) > 3 else None
            normal = TurnPalm(side, D(forward), D(normalHint))
            CurlFingers(side, normal, curl, indexAmount=indexCurl)
        Update()

    def AimFrom(pitch, yaw):
        """枪口方向：pitch 是矢状面仰角（0 = 水平朝前 −Y，正 = 抬头，可以过 ±90° 一直转），
        yaw 是朝角色左手边（+X）偏多少度。**别直接插值方向向量** —— 枪托抡过头顶那一下
        方向要转 172°，线性插两个反向向量会在中途缩到近零，归一化后整支枪甩到侧面去
        （实测刺刀尖从地下 −0.06 m 扫到 1.77 m）。按角度插就是一条干净的矢状面圆弧。"""
        p = math.radians(pitch)
        y = math.radians(yaw)
        return Vector((math.sin(y) * math.cos(p), -math.cos(y) * math.cos(p), math.sin(p))).normalized()

    def GripPalms(axis, curl=.85):
        """Both hands wrapped around a rifle whose muzzle points along `axis`."""
        axis = Vector(axis).normalized()
        up = Vector((0, 0, 1))
        if abs(axis.dot(up)) > .95:
            up = Vector((0, -1, 0))
        across = axis.cross(up).normalized()
        palms = {}
        for side, sign in [('L', 1), ('R', -1)]:
            fingers = across * sign
            normal = fingers.cross(axis).normalized() * sign
            palms[side] = (tuple(fingers), tuple(normal), curl)
        return palms

    # ---- clip authoring ---------------------------------------------------
    def StandBase(phase, sway):
        return {
            'ankles': {'L': (hipHalf + .015, .01, ankleZ), 'R': (-(hipHalf + .015), -.03, ankleZ)},
            'legPoles': {'L': (hipHalf + .22, -.95, .45), 'R': (-(hipHalf + .22), -.95, .45)},
            'toeDirs': {'L': None, 'R': None},
            'pelvis': (.018 * sway, .02, restPelvis - .038),
        }

    def KneelBase(sink=0.0):
        return {
            'pelvis': (0, kneelPelvisY, kneelPelvisZ - sink),
            'ankles': {'L': kneelAnkle(1), 'R': kneelAnkle(-1)},
            'legPoles': {'L': kneelPole(1), 'R': kneelPole(-1)},
            'toeDirs': {'L': kneelToe, 'R': kneelToe},
        }

    # ---- shared captive poses --------------------------------------------
    # The two transition clips (CaptiveStandToKneel / CaptiveKneelFlinch) have to end on
    # **exactly** the frame the loop clip they hand over to starts on, or the 0.12 s
    # cross-fade shows as a twitch. So the loop poses are functions, and the transitions
    # call them with every wobble set to zero instead of retyping their numbers.
    #
    # Every wobble is an INTEGER harmonic of the clip period. A term like sin(phase*0.9)
    # samples fine (the runtime wraps on `at % duration`) but the authored last frame no
    # longer equals the authored first frame, so the loop pops once a cycle. The baker
    # prints LOOPSEAM for every loop clip and the gate asserts it.
    def HandsUpStandPose(sway=.0, sway2=.0, breath=.0, nod=.0, tremble=.0, crouch=.040):
        p = StandBase(0.0, sway)
        reachZ = shoulder['L'].z - crouch + .440
        p['pelvis'] = (.020 * sway, .02 + .010 * breath, restPelvis - crouch + .008 * breath)
        p['pelvisTilt'] = (.05, .045 * sway, 0)
        p['bend'] = .12 - .012 * breath
        p['lean'] = .03 * sway2
        p['shrug'] = .26 + .022 * breath
        p['neck'] = (.06, 0, 0)
        p['head'] = (.16 + .03 * nod, 0, .10 * sway)
        p['hands'] = {
            'L': (hipHalf + .175 + .020 * sway + .005 * tremble, -.10,
                  reachZ + .012 * breath + .006 * tremble),
            'R': (-(hipHalf + .175) - .020 * sway + .005 * tremble, -.10,
                  reachZ - .012 * breath - .006 * tremble),
        }
        p['armPoles'] = {'L': (hipHalf + .95, .15, reachZ - .55), 'R': (-(hipHalf + .95), .15, reachZ - .55)}
        p['palms'] = {
            'L': ((-.18, -.10, .98), (0, -1, .1), .12),
            'R': ((.18, -.10, .98), (0, -1, .1), .12),
        }
        return p

    def KneelHandsHeadPose(breath=.0, tremble=.0, slow=.0, turn=.0):
        p = KneelBase(sink=.005 * breath)
        crown = kneelPelvisZ + (restHead - restPelvis) * .90
        p['pelvisTilt'] = (.10, .012 * tremble, 0)
        p['bend'] = .20 + .010 * tremble - .014 * breath
        p['lean'] = .018 * slow
        p['shrug'] = .34 + .024 * breath
        p['neck'] = (.12, 0, 0)
        p['head'] = (.24, 0, .07 * turn)
        handZ = crown + .070 - .005 * breath
        p['hands'] = {'L': (hipHalf - .020 + .004 * tremble, .105, handZ),
                      'R': (-(hipHalf - .020) + .004 * tremble, .105, handZ)}
        p['armPoles'] = {'L': (hipHalf + 1.0, -.62, crown - .30), 'R': (-(hipHalf + 1.0), -.62, crown - .30)}
        p['palms'] = {
            'L': ((-.86, .22, .46), (0, -1, .12), .55),
            'R': ((.86, .22, .46), (0, -1, .12), .55),
        }
        return p

    def ToeArc(pitch):
        """Toe direction as one sagittal angle: 0 = level and forward, 90 = straight down,
        149 = the kneel's instep-down-and-back. **Never lerp the two end vectors** — they
        are 118 deg apart and the straight line between them passes within 0.05 of the
        origin, which after normalisation flips the foot inside out midway (the same trap
        AimFrom() documents for the rifle)."""
        a = math.radians(pitch)
        return (.03, -math.cos(a), -math.sin(a))

    # The rest foot and the kneel foot expressed in that one angle.
    toeStandPitch = math.degrees(math.atan2(-sourceFacing['L'][2], -sourceFacing['L'][1]))
    toeKneelPitch = math.degrees(math.atan2(-kneelToe[2], -kneelToe[1]))

    def BlendPose(a, b, w, toe):
        """Field-wise blend of two finished pose dicts; `toe` replaces toeDirs."""
        out = {'toeDirs': {'L': toe, 'R': toe}}
        for key in ('bend', 'lean', 'twist', 'shrug'):
            out[key] = Mix(a.get(key, .0), b.get(key, .0), w)
        for key in ('pelvis', 'pelvisTilt', 'neck', 'head'):
            va, vb = a.get(key, (0, 0, 0)), b.get(key, (0, 0, 0))
            out[key] = tuple(Mix(va[i], vb[i], w) for i in range(3))
        for key in ('ankles', 'legPoles', 'hands', 'armPoles'):
            out[key] = {side: tuple(Mix(a[key][side][i], b[key][side][i], w) for i in range(3))
                        for side in ('L', 'R')}
        out['palms'] = {side: (tuple(Mix(a['palms'][side][0][i], b['palms'][side][0][i], w) for i in range(3)),
                               tuple(Mix(a['palms'][side][1][i], b['palms'][side][1][i], w) for i in range(3)),
                               Mix(a['palms'][side][2], b['palms'][side][2], w))
                        for side in ('L', 'R')}
        return out

    def WalkFoot(t, offset):
        """One foot of the marched-in gait: (ankleY, lift, planted).

        Stance slides the ankle straight back at exactly WALK_SPEED. That is the whole
        contract with the cutscene track: the adapter has no root motion, so the runtime
        scales playback by `state.moveSpeed * 4.2 / referenceSpeedMps` and the planted
        foot then matches the track metre for metre. Easing this would skate.
        """
        u = ((t / WALK_CYCLE) - offset) % 1.0
        half = WALK_AMP / 2
        if u < WALK_STANCE:
            return (-half + WALK_AMP * (u / WALK_STANCE), .0, True)
        w = (u - WALK_STANCE) / (1 - WALK_STANCE)
        return (half - WALK_AMP * Smooth(w), WALK_LIFT * math.sin(math.pi * w), False)

    def HandsUpWalkPose(t):
        """Marched in with the hands up.

        No root motion: the cutscene track does the travelling, this only has to set the
        planted foot down at the speed the track is moving (WalkFoot's note). Two gait
        cycles per clip, so the upper body can lurch on one of them without desyncing
        the feet. A function, not an inline branch, because `CaptiveShovedStumble` has
        to start on **exactly** this pose at t = 0.
        """
        phase = Tau * t / DEFINITIONS['CaptiveHandsUpWalk'][0]
        gait = Tau * t / WALK_CYCLE
        lurch = math.sin(phase)                       # one per clip (two cycles)
        bob = math.cos(2 * (gait - Tau * WALK_STANCE / 2))
        reachZ = shoulder['L'].z - WALK_CROUCH + .415
        feet = {'L': WalkFoot(t, .0), 'R': WalkFoot(t, .5)}
        walkTremble = math.sin(phase * 11)
        return {
            'pelvis': (.028 * math.cos(gait - Tau * WALK_STANCE / 2) + .010 * lurch,
                       .015 + .012 * lurch,
                       restPelvis - WALK_CROUCH + .016 * bob - .012 * max(.0, lurch)),
            'pelvisTilt': (.11, .05 * math.sin(gait - Tau * WALK_STANCE / 2), .06 * lurch),
            'bend': .23 + .03 * lurch,
            'lean': .05 * lurch,
            'twist': .05 * math.sin(gait),
            'shrug': .31,
            'neck': (.10, 0, 0),
            'head': (.19 + .04 * bob, 0, .13 * lurch),
            'ankles': {side: (sign * (hipHalf + .020), feet[side][0], ankleZ + feet[side][1])
                       for side, sign in [('L', 1), ('R', -1)]},
            'legPoles': {'L': (hipHalf + .26, -.95, .42), 'R': (-(hipHalf + .26), -.95, .42)},
            'toeDirs': {'L': None, 'R': None},
            'hands': {
                'L': (hipHalf + .165 + .018 * math.sin(gait) + .006 * walkTremble, -.115,
                      reachZ + .014 * bob + .007 * walkTremble),
                'R': (-(hipHalf + .165) + .018 * math.sin(gait) + .006 * walkTremble, -.115,
                      reachZ - .014 * bob - .007 * walkTremble),
            },
            'armPoles': {'L': (hipHalf + .95, .15, reachZ - .55), 'R': (-(hipHalf + .95), .15, reachZ - .55)},
            'palms': {
                'L': ((-.20, -.12, .97), (0, -1, .1), .16),
                'R': ((.20, -.12, .97), (0, -1, .1), .16),
            },
        }

    def Author(clip, t, lift):
        for pb in arm.pose.bones:
            pb.matrix_basis = rest[pb.name]
        Update()
        duration = DEFINITIONS[clip][0]
        phase = Tau * t / duration
        # Integer harmonics only, and every one of them **zero at t = 0** — sines, never
        # cosines, never a phase offset. Two reasons: a loop clip's authored last frame
        # then equals its authored first frame (no pop), and the loop's frame 0 is the
        # neutral pose, which is what the transition clips start and end on.
        # Breathing is the slowest one: 1 cycle per 4 s = 0.25 Hz, about 15 a minute.
        breath = math.sin(phase)
        sway = math.sin(phase * 2)
        sway2 = math.sin(phase * 3)
        nod = math.sin(phase * 5)
        tremble = math.sin(phase * 13)
        p = None

        if clip == 'CaptiveHandsUpStand':
            p = HandsUpStandPose(sway=sway, sway2=sway2, breath=breath, nod=nod, tremble=tremble)

        elif clip == 'CaptiveHandsUpWalk':
            p = HandsUpWalkPose(t)

        elif clip == 'CaptiveShovedStumble':
            # Shoved in the back while being marched in: one lurching catch-step and then
            # the hands-up stand. First frame is **exactly** the walk clip's frame 0 and
            # the last is **exactly** the stand clip's frame 0, so both cross-fades are
            # no-ops (same contract as CaptiveStandToKneel).
            #
            # The clip has no root motion; the cutscene track carries him the 0.30 m the
            # shove costs him. That number is not free: the planted left foot travels
            # from -0.287 (walk frame 0) to +0.010 (stand frame 0) relative to the root,
            # which is 0.297 m of ground - author more travel than that and the plant
            # skates. The right foot swings through, lands ahead at -0.185, and drifts
            # back to the stand stance as the root catches up.
            if t <= 1e-9:
                p = HandsUpWalkPose(.0)
            elif t >= duration - 1e-9:
                p = HandsUpStandPose()
            else:
                walkPose, standPose = HandsUpWalkPose(.0), HandsUpStandPose()
                # The push itself: a hard impulse that decays. Everything the blow does
                # rides on this one curve so the recovery cannot outlast the hit.
                push = Track([(0.00, {'k': .0}), (0.08, {'k': 1.0}), (0.20, {'k': .78}),
                              (0.34, {'k': .50}), (0.50, {'k': .22}), (0.70, {'k': .0})], t)['k']
                wBody = Smooth(Clamp((t - .20) / .50))
                p = BlendPose(walkPose, standPose, wBody, None)
                p['toeDirs'] = {'L': None, 'R': None}
                # Torso thrown forward over the feet, hips driven the same way.
                p['bend'] = Mix(walkPose['bend'], standPose['bend'], wBody) + .30 * push
                p['lean'] = Mix(walkPose['lean'], standPose['lean'], wBody) - .10 * push
                p['twist'] = Mix(walkPose.get('twist', .0), .0, wBody) - .13 * push
                p['shrug'] = Mix(walkPose['shrug'], standPose['shrug'], wBody) + .12 * push
                p['pelvisTilt'] = (p['pelvisTilt'][0] + .20 * push, p['pelvisTilt'][1] - .06 * push,
                                   p['pelvisTilt'][2] - .05 * push)
                # 颈与头只跟一点：加满的话（+.24/+.30）脸整个扎到胸口里，从正面看
                # 头会缩进两肩之间不见了。被推的人是**身子**被顶出去，头是跟着走的。
                p['neck'] = (p['neck'][0] + .15 * push, 0, -.14 * push)
                p['head'] = (p['head'][0] + .17 * push, 0, -.18 * push)
                base = Mix(walkPose['pelvis'][2], standPose['pelvis'][2], wBody)
                p['pelvis'] = (Mix(walkPose['pelvis'][0], standPose['pelvis'][0], wBody) - .022 * push,
                               Mix(walkPose['pelvis'][1], standPose['pelvis'][1], wBody) - .105 * push,
                               base - .055 * push)
                # Feet: left stays planted and slides back exactly as far as the track
                # carries him; right swings through and catches the fall.
                # Linear, because the track that carries him is linear: a planted foot
                # that eases has to make the difference up by sliding.
                stanceY = Mix(walkPose['ankles']['L'][1], standPose['ankles']['L'][1], t / duration)
                swing = Track([(0.00, {'y': walkPose['ankles']['R'][1], 'lift': .0}),
                               (0.10, {'y': .130, 'lift': .030}),
                               (0.22, {'y': -.060, 'lift': .092}),
                               (0.34, {'y': -.185, 'lift': .004}),
                               (0.70, {'y': standPose['ankles']['R'][1], 'lift': .0})], t)
                p['ankles'] = {
                    'L': (Mix(walkPose['ankles']['L'][0], standPose['ankles']['L'][0], wBody),
                          stanceY, ankleZ),
                    'R': (Mix(walkPose['ankles']['R'][0], standPose['ankles']['R'][0], wBody),
                          swing['y'], ankleZ + swing['lift']),
                }
                p['legPoles'] = {'L': (hipHalf + .26, -.95, .42), 'R': (-(hipHalf + .26), -1.02, .48)}
                # Hands stay up (they are not his to lower) but get flung forward.
                # They have to travel with the shoulders and then some: the push drives
                # the pelvis 0.105 m forward and bends the spine another 0.30 rad, which
                # carries the shoulder about 0.27 m ahead of where it was. Leaving the
                # overhead hand targets where they were asks the arm for 15 % more than
                # it has, the IK clamps, and both elbows lock straight (OVERREACH armL
                # 1.152 on the first cut).
                for side, sign in [('L', 1), ('R', -1)]:
                    hand = p['hands'][side]
                    p['hands'][side] = (hand[0] + sign * .045 * push, hand[1] - .310 * push,
                                        hand[2] - .070 * push)

        elif clip == 'CaptiveStandToKneel':
            # Hands-up stand -> both knees on the ground, hands to the back of the head.
            # First and last frames are the neighbouring loop clips' neutral frames, so
            # the 0.12 s cross-fade in and out is a no-op.
            if t <= 1e-9:
                p = HandsUpStandPose()
            elif t >= duration - 1e-9:
                p = KneelHandsHeadPose()
            else:
                w = Clamp(t / duration)
                bell = math.sin(math.pi * w)
                standPose, kneelPose = HandsUpStandPose(), KneelHandsHeadPose()
                # The hips drop first, the feet stay planted, and only once the knees are
                # down do the feet swing back and the shins lie over. Doing all of it on
                # one ramp slid both boots backwards along the ground for a whole second.
                wBody = Smooth(Clamp(w * 1.18))
                wPelvis = Smooth(Clamp(w * 1.30))
                wFoot = Smooth(Clamp((w - .45) / .55))
                wToe = Smooth(Clamp((w - .38) / .62))
                wHand = Smooth(Clamp(w * 1.12))
                p = BlendPose(standPose, kneelPose, wBody,
                              ToeArc(Mix(toeStandPitch, toeKneelPitch, wToe)))
                p['pelvis'] = (Mix(standPose['pelvis'][0], kneelPose['pelvis'][0], wPelvis),
                               Mix(standPose['pelvis'][1], kneelPose['pelvis'][1], wPelvis) + .13 * bell,
                               Mix(standPose['pelvis'][2], kneelPose['pelvis'][2], wPelvis) - .025 * bell)
                dragLift = WALK_LIFT * .75 * math.sin(math.pi * Clamp((w - .45) / .55))
                for side, sign in [('L', 1), ('R', -1)]:
                    a, b = standPose['ankles'][side], kneelPose['ankles'][side]
                    p['ankles'][side] = (Mix(a[0], b[0], wFoot), Mix(a[1], b[1], wFoot),
                                         Mix(a[2], b[2], wFoot) + dragLift)
                    ha, hb = standPose['hands'][side], kneelPose['hands'][side]
                    p['hands'][side] = (Mix(ha[0], hb[0], wHand) + sign * .055 * bell,
                                        Mix(ha[1], hb[1], wHand) - .045 * bell,
                                        Mix(ha[2], hb[2], wHand))
                p['bend'] = Mix(standPose['bend'], kneelPose['bend'], wBody) + .16 * bell
                p['pelvisTilt'] = (p['pelvisTilt'][0] + .14 * bell, p['pelvisTilt'][1], p['pelvisTilt'][2])

        elif clip == 'CaptiveKneelHandsHead':
            p = KneelHandsHeadPose(breath=breath, tremble=tremble,
                                   slow=sway, turn=math.sin(phase * 2))

        elif clip == 'CaptiveKneelFlinch':
            # A rifle butt across the **head and back of the neck** from behind-left
            # (2026-09-16 second pass; the first version was a strike to the shoulder
            # blades and the body curled up under it). A blow on the skull does not make
            # a man crouch, it turns his head: the neck whips forward-right and rolls
            # over, the torso follows late and far less, then he pulls back into the
            # hands-on-head loop. Both ends are that loop's neutral frame.
            hit = Track([(0.00, {'k': .0}), (0.07, {'k': 1.0}), (0.16, {'k': .86}),
                         (0.30, {'k': .52}), (0.52, {'k': .20}), (0.80, {'k': .0})], t)['k']
            # The torso lags the head by about 50 ms - that lag is the whole difference
            # between "his head was hit" and "he ducked".
            drag = Track([(0.00, {'k': .0}), (0.13, {'k': .78}), (0.26, {'k': 1.0}),
                          (0.44, {'k': .56}), (0.64, {'k': .18}), (0.80, {'k': .0})], t)['k']
            shudder = .005 * math.sin(t * 92) * max(.0, 1 - t / .30)
            p = KneelHandsHeadPose()
            crown = kneelPelvisZ + (restHead - restPelvis) * .90
            p['pelvis'] = (p['pelvis'][0] - .016 * drag, p['pelvis'][1] + .010 * drag,
                           p['pelvis'][2] - .014 * drag + shudder)
            p['pelvisTilt'] = (.10 + .09 * drag, -.07 * drag, -.05 * drag)
            p['bend'] = .20 + .15 * drag
            p['lean'] = -.20 * drag
            p['twist'] = -.17 * drag
            # Neck and head carry the blow: pitched forward, yawed away from the swing,
            # and rolled over onto his own right shoulder.
            p['neck'] = (.12 + .46 * hit, -.26 * hit, -.36 * hit)
            p['head'] = (.24 + .40 * hit, -.30 * hit, -.52 * hit)
            p['shrug'] = .34 + .18 * drag
            # The hands are still laced behind the head, so they go with it.
            handZ = crown + .070 - .030 * hit + shudder
            p['hands'] = {'L': (hipHalf - .020 - .075 * hit, .105 - .060 * hit, handZ - .020 * hit),
                          'R': (-(hipHalf - .020) - .020 * hit, .105 - .040 * hit, handZ + .010 * hit)}
            p['armPoles'] = {'L': (hipHalf + 1.0 - .34 * hit, -.62, crown - .30),
                             'R': (-(hipHalf + 1.0 - .12 * hit), -.62, crown - .30)}

        elif clip == 'CaptiveKneelPlead':
            beg = (1 - math.cos(phase)) / 2
            plead = math.sin(phase * 2)
            p = KneelBase(sink=.006 * breath)
            p['pelvisTilt'] = (.06, .010 * tremble, 0)
            p['bend'] = .14 + .05 * plead - .014 * breath
            p['shrug'] = .16 + .022 * breath
            p['neck'] = (-.14, 0, 0)
            p['head'] = (-.22 + .05 * plead, 0, .05 * sway)
            chest = kneelPelvisZ + (restChest - restPelvis) * .94
            p['hands'] = {
                'L': (hipHalf - .015 + .02 * beg + .006 * tremble, -.235 - .085 * beg,
                      chest - .095 + .050 * beg + .008 * tremble),
                'R': (-(hipHalf - .015) - .02 * beg + .006 * tremble, -.235 - .085 * beg,
                      chest - .105 + .050 * beg + .008 * tremble),
            }
            p['armPoles'] = {'L': (hipHalf + .80, -.05, chest - .42), 'R': (-(hipHalf + .80), -.05, chest - .42)}
            p['palms'] = {
                'L': ((-.15, -.92, .36), (0, -.3, 1), .28),
                'R': ((.15, -.92, .36), (0, -.3, 1), .28),
            }

        elif clip in ('CaptiveStruckDown', 'CaptiveStabbedCollapse'):
            # Ankles and hands are pelvis-relative: once the torso pitches down the
            # pelvis travels most of a body length forward, and absolute targets
            # would tear the legs straight (measured 1.10 m of a 0.85 m leg).
            chestUp = (restChest - restPelvis) * .94
            hipThick = .118
            kneelHandZ = kneelPelvisZ + chestUp
            legFolded = kneelAnkleDy
            legOut = (femur + shin) * .955
            # A prone leg is nearly straight, so the IK pole decides where the surplus
            # bend goes. Pointing it down buried both knees 0.16 m under the floor;
            # a sideways pole splays the knees instead and keeps hip/knee/ankle level.
            proneKeys = {
                'CaptiveStruckDown': [
                    (0.00, {'px': 0, 'py': kneelPelvisY, 'pz': kneelPelvisZ, 'tilt': .10, 'bend': .20,
                            'neck': .12, 'head': .24, 'roll': 0, 'turn': 0,
                            'dAy': legFolded, 'az': kneelAnkleZ, 'toe': kneelToe,
                            'hx': hipHalf + .055, 'dHy': .06, 'hz': kneelHandZ + .275,
                            'poleDy': .30, 'poleDz': -.30,
                            'legPoleX': .03, 'legPoleDy': -1.225, 'legPoleZ': -.35, 'shrug': .34}),
                    (0.16, {'px': .01, 'py': kneelPelvisY - .02, 'pz': kneelPelvisZ - .015, 'tilt': .42, 'bend': .34,
                            'neck': .22, 'head': .30, 'roll': .05, 'turn': .05,
                            'dAy': legFolded, 'az': kneelAnkleZ, 'toe': kneelToe,
                            'hx': hipHalf + .105, 'dHy': -.02, 'hz': kneelHandZ + .185,
                            'poleDy': .30, 'poleDz': -.26,
                            'legPoleX': .03, 'legPoleDy': -1.225, 'legPoleZ': -.35, 'shrug': .34}),
                    (0.52, {'px': .02, 'py': kneelPelvisY - .120, 'pz': kneelPelvisZ - .100, 'tilt': .72, 'bend': .30,
                            'neck': .10, 'head': .05, 'roll': .10, 'turn': .12,
                            'dAy': legFolded + .16, 'az': kneelAnkleZ + .02, 'toe': (0, .93, -.36),
                            'hx': hipHalf + .195, 'dHy': -.58, 'hz': .40,
                            'poleDy': .26, 'poleDz': .16,
                            'legPoleX': .45, 'legPoleDy': -.60, 'legPoleZ': -.10, 'shrug': .22}),
                    (0.70, {'px': .02, 'py': kneelPelvisY - .210, 'pz': kneelPelvisZ - .215, 'tilt': 1.08, 'bend': .20,
                            'neck': .04, 'head': -.02, 'roll': .10, 'turn': .22,
                            'dAy': legFolded + .34, 'az': kneelAnkleZ + .02, 'toe': (0, .93, -.36),
                            'hx': hipHalf + .190, 'dHy': -.66, 'hz': .215,
                            'poleDy': .24, 'poleDz': .26,
                            'legPoleX': .80, 'legPoleDy': -.10, 'legPoleZ': .02, 'shrug': .16}),
                    # Face-down: the spine must not arch or the skull floats a quarter of
                    # a metre; the face turns sideways instead of lifting the chin.
                    (0.88, {'px': .02, 'py': -.285, 'pz': hipThick, 'tilt': 1.48, 'bend': .01,
                            'neck': -.04, 'head': -.09, 'roll': .09, 'turn': .75,
                            'dAy': legOut, 'az': .0515, 'toe': (0, .94, -.35),
                            'hx': hipHalf + .175, 'dHy': -.735, 'hz': -.0125,
                            'poleDy': .22, 'poleDz': .34,
                            'legPoleX': 1.20, 'legPoleDy': .42, 'legPoleZ': .12, 'shrug': .10}),
                    (1.16, {'px': .02, 'py': -.315, 'pz': hipThick, 'tilt': 1.53, 'bend': .02,
                            'neck': -.05, 'head': -.10, 'roll': .09, 'turn': .84,
                            'dAy': legOut, 'az': .0475, 'toe': (0, .94, -.35),
                            'hx': hipHalf + .170, 'dHy': -.725, 'hz': -.0225,
                            'poleDy': .22, 'poleDz': .34,
                            'legPoleX': 1.20, 'legPoleDy': .42, 'legPoleZ': .12, 'shrug': .08}),
                    (1.60, {'px': .02, 'py': -.320, 'pz': hipThick - .004, 'tilt': 1.54, 'bend': .02,
                            'neck': -.05, 'head': -.10, 'roll': .09, 'turn': .86,
                            'dAy': legOut, 'az': .0455, 'toe': (0, .94, -.35),
                            'hx': hipHalf + .168, 'dHy': -.720, 'hz': -.0245,
                            'poleDy': .22, 'poleDz': .34,
                            'legPoleX': 1.20, 'legPoleDy': .42, 'legPoleZ': .12, 'shrug': .08}),
                ],
                'CaptiveStabbedCollapse': [
                    (0.00, {'px': 0, 'py': kneelPelvisY, 'pz': kneelPelvisZ, 'tilt': .06, 'bend': .14,
                            'neck': -.14, 'head': -.22, 'roll': 0, 'turn': 0,
                            'dAy': legFolded, 'az': kneelAnkleZ, 'toe': kneelToe,
                            'hx': hipHalf - .015, 'dHy': -.26, 'hz': kneelHandZ - .095,
                            'poleDy': .25, 'poleDz': -.34,
                            'legPoleX': .03, 'legPoleDy': -1.225, 'legPoleZ': -.35, 'shrug': .16}),
                    (0.22, {'px': 0, 'py': kneelPelvisY + .03, 'pz': kneelPelvisZ + .055, 'tilt': -.26, 'bend': -.30,
                            'neck': -.30, 'head': -.40, 'roll': 0, 'turn': 0,
                            'dAy': legFolded, 'az': kneelAnkleZ, 'toe': kneelToe,
                            'hx': hipHalf + .245, 'dHy': -.135, 'hz': kneelHandZ + .055,
                            'poleDy': .28, 'poleDz': -.20,
                            'legPoleX': .03, 'legPoleDy': -1.225, 'legPoleZ': -.35, 'shrug': .30}),
                    (0.50, {'px': 0, 'py': kneelPelvisY + .01, 'pz': kneelPelvisZ + .02, 'tilt': .22, 'bend': .26,
                            'neck': .16, 'head': .22, 'roll': .03, 'turn': .04,
                            'dAy': legFolded, 'az': kneelAnkleZ, 'toe': kneelToe,
                            'hx': hipHalf + .015, 'dHy': -.225, 'hz': kneelHandZ - .255,
                            'poleDy': .25, 'poleDz': -.30,
                            'legPoleX': .03, 'legPoleDy': -1.225, 'legPoleZ': -.35, 'shrug': .18}),
                    (0.92, {'px': .01, 'py': kneelPelvisY - .155, 'pz': kneelPelvisZ - .195, 'tilt': .92, 'bend': .34,
                            'neck': .18, 'head': .18, 'roll': .10, 'turn': .10,
                            'dAy': legFolded + .14, 'az': kneelAnkleZ + .02, 'toe': (0, .93, -.37),
                            'hx': hipHalf + .045, 'dHy': -.335, 'hz': .30,
                            'poleDy': .24, 'poleDz': .06,
                            'legPoleX': .45, 'legPoleDy': -.60, 'legPoleZ': -.10, 'shrug': .14}),
                    (1.45, {'px': .02, 'py': -.255, 'pz': hipThick + .012, 'tilt': 1.40, 'bend': .03,
                            'neck': -.03, 'head': -.08, 'roll': .16, 'turn': .74,
                            'dAy': legOut * .955, 'az': .0785, 'toe': (0, .90, -.43),
                            'hx': hipHalf + .055, 'dHy': -.545, 'hz': -.0045,
                            'poleDy': .22, 'poleDz': .32,
                            'legPoleX': 1.20, 'legPoleDy': .42, 'legPoleZ': .12, 'shrug': .10}),
                    (2.00, {'px': .02, 'py': -.270, 'pz': hipThick + .008, 'tilt': 1.44, 'bend': .03,
                            'neck': -.04, 'head': -.09, 'roll': .16, 'turn': .80,
                            'dAy': legOut * .955, 'az': .0745, 'toe': (0, .90, -.43),
                            'hx': hipHalf + .050, 'dHy': -.535, 'hz': -.0125,
                            'poleDy': .22, 'poleDz': .32,
                            'legPoleX': 1.20, 'legPoleDy': .42, 'legPoleZ': .12, 'shrug': .10}),
                ],
            }[clip]
            k = Track(proneKeys, t)
            settle = .004 * math.sin(t * 17) * max(0, 1 - t / .9)
            handY = k['py'] + k['dHy']
            ankleY = k['py'] + k['dAy']
            poleY = k['py'] + k['legPoleDy']
            p = {
                'pelvis': (k['px'], k['py'], k['pz'] + settle),
                'pelvisTilt': (k['tilt'], k['roll'], 0),
                'bend': k['bend'],
                'lean': k['roll'] * .4,
                'twist': k['turn'] * .3,
                'neck': (k['neck'], 0, k['turn'] * .4),
                'head': (k['head'], 0, k['turn']),
                'shrug': k['shrug'],
                # Both ankles keep the same reach: the earlier 3 cm stagger on the right
                # pushed the straightened prone leg past thigh+shin and clamped the IK.
                'ankles': {'L': (hipHalf + .012, ankleY, k['az']), 'R': (-(hipHalf + .012), ankleY, k['az'] + .014)},
                'legPoles': {'L': (hipHalf + k['legPoleX'], poleY, k['legPoleZ']),
                             'R': (-(hipHalf + k['legPoleX']), poleY, k['legPoleZ'])},
                'toeDirs': {'L': k['toe'], 'R': k['toe']},
                'hands': {'L': (k['hx'], handY, k['hz']), 'R': (-k['hx'], handY + .03, k['hz'] - .01)},
                'armPoles': {'L': (hipHalf + 1.0, handY + k['poleDy'], k['hz'] + k['poleDz']),
                             'R': (-(hipHalf + 1.0), handY + k['poleDy'], k['hz'] + k['poleDz'])},
                'palms': {'L': ((-.25, -.90, -.35), (0, -.2, 1), .30), 'R': ((.25, -.90, -.35), (0, -.2, 1), .30)},
            }

        elif clip == 'IjaBayonetGuard':
            # Standing guard is not standing still: the weight rolls between the feet once
            # a loop, the hips drop a little onto the loaded leg, and the head keeps
            # scanning the line of prisoners. Four guards share this clip, so the cutscene
            # data offsets them with state.performPhase instead of four near-identical
            # copies (docs/Data_CutsceneRedo.md §1.3).
            shift = .030 * sway
            aim = Vector((.12, -.902, -.414)).normalized()
            left = Vector((hipHalf - .055, -.275 - .010 * breath, shoulder['L'].z - .32 + .012 * breath))
            right = left - aim * .365
            p = StandBase(phase, sway)
            p['ankles'] = {'L': (hipHalf + .02, -.115, ankleZ), 'R': (-(hipHalf + .02), .085, ankleZ)}
            p['pelvis'] = (shift, .015 + .008 * sway2, restPelvis - .055 + .006 * breath - .009 * abs(sway))
            p['pelvisTilt'] = (.07 + .012 * breath, .045 * sway, -.16)
            p['bend'] = .13 - .012 * breath
            p['neck'] = (.05, 0, .05 + .06 * math.sin(phase * 2))
            p['head'] = (.09 + .035 * nod, 0, .10 + .130 * sway)
            p['shrug'] = .05 + .020 * breath
            p['hands'] = {'L': tuple(left), 'R': tuple(right)}
            p['armPoles'] = {'L': (hipHalf + .80, -.25, left.z - .45), 'R': (-(hipHalf + .75), .10, right.z - .45)}
            p['palms'] = GripPalms(aim)

        elif clip == 'IjaTauntGesture':
            jab = Smooth(math.sin(phase * 2) * .5 + .5)
            p = StandBase(phase, sway)
            p['ankles'] = {'L': (hipHalf + .02, -.10, ankleZ), 'R': (-(hipHalf + .02), .075, ankleZ)}
            p['pelvis'] = (.026 * sway, .01 - .02 * jab, restPelvis - .048 - .008 * abs(sway))
            p['pelvisTilt'] = (.10, .040 * sway, -.10)
            p['bend'] = .17 + .04 * jab
            p['neck'] = (.17, 0, .04 + .05 * sway)
            p['head'] = (.10 + .05 * jab, 0, .12 + .100 * sway)
            p['shrug'] = .03
            # The rifle is carried at the hip in the right hand only, and the engine aims a
            # one-handed weapon along the forearm: an arm hanging straight down would drive
            # 1.66 m of rifle and bayonet through the floor, so the forearm points forward.
            hang = Vector((-(hipHalf + .050), -.250, shoulder['R'].z - .335))
            p['hands'] = {
                'L': (hipHalf - .035, -.285 - .115 * jab, shoulder['L'].z - .175 + .055 * jab),
                'R': tuple(hang),
            }
            p['armPoles'] = {'L': (hipHalf + .85, -.15, shoulder['L'].z - .60),
                             'R': (-(hipHalf + .33), .92, shoulder['R'].z - .43)}
            p['palms'] = {
                'L': ((-.06, -.97, .22), (0, -.25, -.96), .95, .03),
                'R': ((0, -.30, -.95), (-.95, -.25, 0), .90),
            }

        elif clip == 'IjaShoveForward':
            # 押解路上的一记推搡：左手掌推在俘虏的后背上，重心前送再收回。
            # 接触在 0.40 s，最远伸展在 0.52 s（与踢同一条口径：接触之后还往前推
            # 5 cm，那时人已经在往前趔趄，所以看不出陷体）。
            #
            # **枪必须竖起来。** 喝令那一条（IjaTauntGesture）把单手枪的前臂指向前方，
            # 于是刺刀尖落在身前 1.52 m、高 0.33–0.45 —— 对着趴在地上的人没事，对着
            # 0.79 m 外**站着**的人就是一刀捅穿大腿。所以这一条把右前臂立起来
            # （肘低、腕高过肩），枪口朝上偏后 26°，刺刀尖在头顶 2.5 m 处，
            # 身前那条线上一寸钢都没有。
            shove = [
                (0.00, {'lx': hipHalf - .010, 'ly': -.235, 'lz': shoulder['L'].z - .330,
                        'px': 0, 'py': .015, 'pz': restPelvis - .055, 'tilt': .07, 'bend': .13,
                        'twist': .0, 'head': .09, 'fy': -.100, 'by': .075, 'curl': .40}),
                (0.18, {'lx': hipHalf + .055, 'ly': -.035, 'lz': shoulder['L'].z - .215,
                        'px': -.025, 'py': .075, 'pz': restPelvis - .080, 'tilt': -.04, 'bend': .02,
                        'twist': .13, 'head': .02, 'fy': -.060, 'by': .105, 'curl': .28}),
                (0.40, {'lx': hipHalf - .005, 'ly': -.560, 'lz': shoulder['L'].z - .390,
                        'px': .020, 'py': -.120, 'pz': restPelvis - .105, 'tilt': .26, 'bend': .23,
                        'twist': -.06, 'head': .16, 'fy': -.330, 'by': .075, 'curl': .14}),
                (0.52, {'lx': hipHalf - .010, 'ly': -.620, 'lz': shoulder['L'].z - .400,
                        'px': .024, 'py': -.150, 'pz': restPelvis - .112, 'tilt': .29, 'bend': .25,
                        'twist': -.08, 'head': .18, 'fy': -.360, 'by': .070, 'curl': .12}),
                (0.70, {'lx': hipHalf - .010, 'ly': -.380, 'lz': shoulder['L'].z - .330,
                        'px': .010, 'py': -.040, 'pz': restPelvis - .075, 'tilt': .14, 'bend': .17,
                        'twist': -.02, 'head': .12, 'fy': -.190, 'by': .080, 'curl': .26}),
                (0.90, {'lx': hipHalf - .010, 'ly': -.235, 'lz': shoulder['L'].z - .330,
                        'px': 0, 'py': .015, 'pz': restPelvis - .055, 'tilt': .07, 'bend': .13,
                        'twist': .0, 'head': .09, 'fy': -.100, 'by': .075, 'curl': .40}),
            ]
            k = Track(shove, t)
            p = {
                'pelvis': (k['px'], k['py'], k['pz']),
                'pelvisTilt': (k['tilt'], 0, -.10 + k['twist']),
                'bend': k['bend'],
                'twist': k['twist'] * .5,
                'neck': (.06, 0, .04),
                'head': (k['head'], 0, .08),
                'shrug': .05,
                'ankles': {'L': (hipHalf + .02, k['fy'], ankleZ), 'R': (-(hipHalf + .02), k['by'], ankleZ)},
                'legPoles': {'L': (hipHalf + .30, -.95, .45), 'R': (-(hipHalf + .30), -.95, .45)},
                'toeDirs': {'L': None, 'R': None},
                # 右手与肘跟着骨盆走（枪不会在弓步前送时被留在原地）。
                'hands': {'L': (k['lx'], k['ly'], k['lz']),
                          'R': (-(hipHalf + .150), k['py'] + .210, shoulder['R'].z + .040)},
                'armPoles': {'L': (hipHalf + .95, .10, k['lz'] - .52),
                             'R': (-(hipHalf + .10), k['py'] - .220, shoulder['R'].z - .86)},
                'palms': {
                    # 左手张开、掌心朝前推；右手握在枪身上（枪竖着，掌心朝身体内侧）。
                    'L': ((-.22, -.30, .93), (0, -1, .12), k['curl']),
                    'R': ((0, .30, .95), (-.95, .25, 0), .90),
                },
            }

        elif clip == 'IjaKickPrisoner':
            aim = Vector((.12, -.88, -.46)).normalized()
            kick = [
                (0.00, {'ax': -(hipHalf + .02), 'ay': .075, 'az': ankleZ, 'toeY': -.82, 'toeZ': -.55,
                        'px': 0, 'py': .015, 'pz': restPelvis - .055, 'tilt': .07, 'bend': .13,
                        'sx': -(hipHalf + .02), 'sy': -.115, 'hy': -.275, 'hz': -.32, 'lean': 0, 'kneePoleZ': .45}),
                (0.26, {'ax': -(hipHalf + .015), 'ay': -.255, 'az': .470, 'toeY': -.70, 'toeZ': -.71,
                        'px': .045, 'py': .055, 'pz': restPelvis - .085, 'tilt': -.10, 'bend': .02,
                        'sx': -(hipHalf + .015), 'sy': -.055, 'hy': -.215, 'hz': -.27, 'lean': -.07, 'kneePoleZ': 1.20}),
                (0.50, {'ax': -(hipHalf + .015), 'ay': -.660, 'az': .720, 'toeY': -.93, 'toeZ': -.33,
                        'px': .060, 'py': .085, 'pz': restPelvis - .100, 'tilt': -.20, 'bend': -.06,
                        'sx': -(hipHalf + .015), 'sy': -.035, 'hy': -.150, 'hz': -.22, 'lean': -.11, 'kneePoleZ': 1.75}),
                (0.74, {'ax': -(hipHalf + .015), 'ay': -.300, 'az': .480, 'toeY': -.75, 'toeZ': -.66,
                        'px': .045, 'py': .050, 'pz': restPelvis - .085, 'tilt': -.05, 'bend': .04,
                        'sx': -(hipHalf + .015), 'sy': -.060, 'hy': -.230, 'hz': -.28, 'lean': -.05, 'kneePoleZ': 1.25}),
                (1.00, {'ax': -(hipHalf + .02), 'ay': -.010, 'az': ankleZ + .012, 'toeY': -.80, 'toeZ': -.58,
                        'px': .015, 'py': .020, 'pz': restPelvis - .065, 'tilt': .05, 'bend': .11,
                        'sx': -(hipHalf + .02), 'sy': -.100, 'hy': -.265, 'hz': -.31, 'lean': 0, 'kneePoleZ': .60}),
                (1.20, {'ax': -(hipHalf + .02), 'ay': .075, 'az': ankleZ, 'toeY': -.82, 'toeZ': -.55,
                        'px': 0, 'py': .015, 'pz': restPelvis - .055, 'tilt': .07, 'bend': .13,
                        'sx': -(hipHalf + .02), 'sy': -.115, 'hy': -.275, 'hz': -.32, 'lean': 0, 'kneePoleZ': .45}),
            ]
            k = Track(kick, t)
            # The kicking foot is always aimed: gating the aim on altitude made the
            # ankle snap between the rest quaternion and the authored direction, and
            # the toe punched 7 cm through the floor on the frame it switched.
            left = Vector((hipHalf - .055, k['hy'], shoulder['L'].z + k['hz']))
            right = left - aim * .365
            p = {
                'pelvis': (k['px'], k['py'], k['pz']),
                'pelvisTilt': (k['tilt'], k['lean'], -.14),
                'bend': k['bend'],
                'lean': k['lean'] * .5,
                'neck': (.05, 0, .05),
                'head': (.10, 0, .10),
                'shrug': .05,
                'ankles': {'L': (hipHalf + .02, -.115, ankleZ), 'R': (k['ax'], k['ay'], k['az'])},
                # The kicking knee must ride ABOVE the hip-ankle line or the joint reads
                # as bending backwards; the pole climbs with the leg and drops back for
                # the planted stance at both ends.
                'legPoles': {'L': (hipHalf + .30, -.95, .45), 'R': (-(hipHalf + .05), -1.00, k['kneePoleZ'])},
                'toeDirs': {'L': None, 'R': (-.17, k['toeY'], k['toeZ'])},
                'hands': {'L': tuple(left), 'R': tuple(right)},
                'armPoles': {'L': (hipHalf + .80, -.25, left.z - .45), 'R': (-(hipHalf + .75), .10, right.z - .45)},
                'palms': GripPalms(aim),
            }

        elif clip == 'IjaRifleButtStrike':
            # Anchored on the **butt** (the striking end), because that is what the shot has
            # to sell: the wind-up puts it above and behind the head, the smash drives it
            # down in front onto the **head and back of the neck** of the kneeling man. The right hand
            # follows 0.255 m up the stock (weapon origin = gripR) and the left another
            # `span` along the barrel, so the two hands always sit fore-and-aft on the rifle
            # instead of both crowding in front of the face (the 2026-09-15 first cut did).
            # pitch 一路单调减到 −216.9°（= +143.1°），也就是枪托**从后上方翻过头顶砸到身前**
            # 那条弧；写成 +143 会让插值走反方向（枪托先往下绕）。
            strike = [
                (0.00, {'pitch': -24.5, 'yaw': 7.6, 'bx': hipHalf - .130, 'by': .284,
                        'bz': shoulder['L'].z - .063, 'px': 0, 'py': .015, 'pz': restPelvis - .055,
                        'tilt': .07, 'bend': .13, 'head': .09, 'fy': -.115, 'span': .365}),
                (0.28, {'pitch': -36.9, 'yaw': 11.6, 'bx': hipHalf - .175, 'by': .325,
                        'bz': shoulder['L'].z + .130, 'px': -.01, 'py': .045, 'pz': restPelvis - .050,
                        'tilt': -.06, 'bend': .02, 'head': -.02, 'fy': -.100, 'span': .360}),
                # 蓄力（0.50）：枪托甩到头顶后上方（离地约 1.80 m、身后 0.30 m），枪口朝前下 45°；
                # 右手在右耳上方、左手在胸前，一后一前握着枪身。
                (0.50, {'pitch': -45.3, 'yaw': 8.0, 'bx': hipHalf - .315, 'by': .300,
                        'bz': shoulder['L'].z + .390, 'px': -.02, 'py': .055, 'pz': restPelvis - .045,
                        'tilt': -.13, 'bend': -.08, 'head': -.10, 'fy': -.095, 'span': .350}),
                # 过顶：枪身竖起来、枪托在身前上方，重心开始压到前脚。枪托这一路必须**保持高**——
                # 枪连刺刀 1.66 m，握把一低，枪口扫过竖直位时刺刀尖就插进地里（实测 −0.22 m）。
                (0.68, {'pitch': -136.0, 'yaw': -2.0, 'bx': hipHalf - .150, 'by': -.400,
                        'bz': shoulder['L'].z + .385, 'px': 0, 'py': -.075, 'pz': restPelvis - .085,
                        'tilt': .12, 'bend': .04, 'head': .08, 'fy': -.180, 'span': .345}),
                # 砸击（0.85）：**落在跪着的人的头与后颈上**，不是肩胛（2026-09-16 第二轮改；
                # 第一版落点高 0.62 m，对跪着的人是后背）。枪托停在身前约 0.72 m、
                # 高约 0.93 m —— 跪姿头骨 0.98 / 颈 0.96 那一带。抡得更早停就意味着
                # 躯干前倾少一截、骨盆前移少一截，那两条断言的带子跟着实测改。
                (0.85, {'pitch': -210.0, 'yaw': -3.6, 'bx': hipHalf - .128, 'by': -.890,
                        'bz': 1.045, 'px': .015, 'py': -.170, 'pz': restPelvis - .110,
                        'tilt': .28, 'bend': .10, 'head': .22, 'fy': -.300, 'span': .305}),
                (1.02, {'pitch': -214.0, 'yaw': -3.6, 'bx': hipHalf - .124, 'by': -.880,
                        'bz': 1.005, 'px': .015, 'py': -.190, 'pz': restPelvis - .116,
                        'tilt': .30, 'bend': .11, 'head': .23, 'fy': -.315, 'span': .305}),
                # 收回也把枪先带回高位再落到持枪式：枪口转回来必然要扫过「竖直朝下」，
                # 那一瞬握把低于 1.5 m 刺刀尖就进地（第一版实测 −0.19 m）。
                (1.16, {'pitch': -150.0, 'yaw': -2.0, 'bx': hipHalf - .150, 'by': -.470,
                        'bz': shoulder['L'].z + .300, 'px': .01, 'py': -.130, 'pz': restPelvis - .115,
                        'tilt': .30, 'bend': .16, 'head': .20, 'fy': -.300, 'span': .330}),
                (1.28, {'pitch': -100.0, 'yaw': 3.0, 'bx': hipHalf - .150, 'by': -.180,
                        'bz': shoulder['L'].z + .470, 'px': .005, 'py': -.060, 'pz': restPelvis - .090,
                        'tilt': .18, 'bend': .15, 'head': .14, 'fy': -.220, 'span': .330}),
                (1.40, {'pitch': -24.5, 'yaw': 7.6, 'bx': hipHalf - .130, 'by': .284,
                        'bz': shoulder['L'].z - .063, 'px': 0, 'py': .015, 'pz': restPelvis - .055,
                        'tilt': .07, 'bend': .13, 'head': .09, 'fy': -.115, 'span': .365}),
            ]
            k = Track(strike, t)
            aim = AimFrom(k['pitch'], k['yaw'])
            right = Vector((k['bx'], k['by'], k['bz'])) + aim * .255
            left = right + aim * k['span']
            p = {
                'pelvis': (k['px'], k['py'], k['pz']),
                'pelvisTilt': (k['tilt'], 0, -.12),
                'bend': k['bend'],
                'neck': (.05, 0, .05),
                'head': (k['head'], 0, .08),
                'shrug': .08,
                'ankles': {'L': (hipHalf + .02, k['fy'], ankleZ), 'R': (-(hipHalf + .02), .085, ankleZ)},
                'legPoles': {'L': (hipHalf + .30, -.95, .45), 'R': (-(hipHalf + .30), -.95, .45)},
                'toeDirs': {'L': None, 'R': None},
                'hands': {'L': tuple(left), 'R': tuple(right)},
                'armPoles': {'L': (hipHalf + .90, -.10, left.z - .50), 'R': (-(hipHalf + .90), .15, right.z - .50)},
                'palms': GripPalms(aim),
            }

        elif clip == 'IjaBayonetDownThrust':
            thrust = [
                (0.00, {'ra': (.12, -.902, -.414), 'lx': hipHalf - .055, 'ly': -.275,
                        'lz': shoulder['L'].z - .320, 'px': 0, 'py': .015, 'pz': restPelvis - .055,
                        'tilt': .07, 'bend': .13, 'head': .09, 'fy': -.115, 'twist': -.16}),
                (0.40, {'ra': (.09, -.930, -.357), 'lx': hipHalf - .090, 'ly': -.140,
                        'lz': shoulder['L'].z - .300, 'px': -.03, 'py': .075, 'pz': restPelvis - .085,
                        'tilt': -.05, 'bend': .04, 'head': .02, 'fy': -.080, 'twist': -.24}),
                (0.76, {'ra': (.05, -.955, -.292), 'lx': hipHalf - .020, 'ly': -.520,
                        'lz': shoulder['L'].z - .300, 'px': .015, 'py': -.075, 'pz': restPelvis - .125,
                        'tilt': .26, 'bend': .29, 'head': .16, 'fy': -.330, 'twist': -.06}),
                (1.06, {'ra': (.05, -.958, -.283), 'lx': hipHalf - .022, 'ly': -.535,
                        'lz': shoulder['L'].z - .295, 'px': .015, 'py': -.080, 'pz': restPelvis - .128,
                        'tilt': .27, 'bend': .30, 'head': .17, 'fy': -.340, 'twist': -.05}),
                (1.36, {'ra': (.09, -.935, -.342), 'lx': hipHalf - .040, 'ly': -.330,
                        'lz': shoulder['L'].z - .315, 'px': -.01, 'py': .030, 'pz': restPelvis - .080,
                        'tilt': .10, 'bend': .16, 'head': .11, 'fy': -.150, 'twist': -.14}),
                (1.60, {'ra': (.12, -.902, -.414), 'lx': hipHalf - .055, 'ly': -.275,
                        'lz': shoulder['L'].z - .320, 'px': 0, 'py': .015, 'pz': restPelvis - .055,
                        'tilt': .07, 'bend': .13, 'head': .09, 'fy': -.115, 'twist': -.16}),
            ]
            k = Track(thrust, t)
            aim = Vector(k['ra']).normalized()
            left = Vector((k['lx'], k['ly'], k['lz']))
            right = left - aim * .365
            p = {
                'pelvis': (k['px'], k['py'], k['pz']),
                'pelvisTilt': (k['tilt'], 0, k['twist']),
                'bend': k['bend'],
                'twist': k['twist'] * .4,
                'neck': (.05, 0, .05),
                'head': (k['head'], 0, .10),
                'shrug': .06,
                'ankles': {'L': (hipHalf + .02, k['fy'], ankleZ), 'R': (-(hipHalf + .02), .085, ankleZ)},
                'legPoles': {'L': (hipHalf + .30, -.95, .45), 'R': (-(hipHalf + .30), -.95, .45)},
                'toeDirs': {'L': None, 'R': None},
                'hands': {'L': tuple(left), 'R': tuple(right)},
                'armPoles': {'L': (hipHalf + .85, -.20, left.z - .50), 'R': (-(hipHalf + .80), .12, right.z - .50)},
                'palms': GripPalms(aim),
            }

        else:
            raise RuntimeError('Unknown captives clip ' + clip)

        ApplyPose(p, lift)

    def SourcePose():
        current = {name: convertInv @ BWorld(arm.pose.bones[name]) @ corrections[name] for name in names}
        result = []
        for name in names:
            index = nodeIndex[name]
            parent = parents.get(index)
            parentName = nodes[parent].get('name') if parent is not None else None
            pm = current.get(parentName, sourceWorld[parent]) if parent is not None else Matrix.Identity(4)
            p, q, s = (pm.inverted() @ current[name]).decompose()
            result.extend([*(p / authoringFactor), q.x, q.y, q.z, q.w])   # shipped node units
        return [round(v, 6) for v in result]

    depsgraph = lambda: bpy.context.evaluated_depsgraph_get()

    def LowestVertex(ground=None):
        """Lowest skinned vertex over the floor z = 0, or over `ground(x, y)` (a clip authored on
        uneven ground: the height it returns is the floor under that point)."""
        dg = depsgraph()
        low = 1e9
        where = (0, 0, 0)
        for o in meshes:
            ev = o.evaluated_get(dg)
            geometry = ev.to_mesh()
            matrix = ev.matrix_world
            for v in geometry.vertices:
                p = matrix @ v.co
                z = p.z - ground(p.x, p.y) if ground else p.z
                if z < low:
                    low = z
                    where = (round(p.x, 3), round(p.y, 3), round(p.z, 3))
            ev.to_mesh_clear()
        return low, where

    def GroupSets(match):
        sets = []
        for o in meshes:
            wanted = {g.index for g in o.vertex_groups if match(g.name)}
            sets.append([v.index for v in o.data.vertices
                         if sum(g.weight for g in v.groups if g.group in wanted) > .6])
        return sets

    footVertices = GroupSets(lambda n: 'Foot' in n or 'Toe' in n)
    shinVertices = GroupSets(lambda n: 'Calf' in n)
    handVertices = GroupSets(lambda n: 'Hand' in n or 'Finger' in n)
    kickVertices = GroupSets(lambda n: 'R Foot' in n or 'R Toe' in n)
    # The shoving hand, for the same reason the kick measures the boot and not the toe
    # bone: what stops on the prisoner's back is the palm, 7 cm past the wrist joint.
    shoveVertices = GroupSets(lambda n: 'L Hand' in n or 'L Finger' in n)
    regionVertices = {
        'foot': footVertices, 'shin': shinVertices,
        'thigh': GroupSets(lambda n: 'Thigh' in n),
        'hip': GroupSets(lambda n: 'Pelvis' in n),
        'torso': GroupSets(lambda n: 'Spine' in n),
        'head': GroupSets(lambda n: 'Head' in n or 'Neck' in n),
        'hand': handVertices,
        'arm': GroupSets(lambda n: 'Arm' in n or 'Hand' in n or 'Finger' in n),
    }

    def RegionLows():
        out = {}
        dg = depsgraph()
        for meshIndex, o in enumerate(meshes):
            ev = o.evaluated_get(dg)
            geometry = ev.to_mesh()
            matrix = ev.matrix_world
            for name, sets in regionVertices.items():
                low = out.get(name, (1e9, 0, 0))
                for index in sets[meshIndex]:
                    p = matrix @ geometry.vertices[index].co
                    if p.z < low[0]:
                        low = (p.z, p.x, p.y)
                out[name] = low
            ev.to_mesh_clear()
        return {k: [round(c, 3) for c in v] for k, v in out.items() if v[0] < 1e8}

    def LowestOf(sets):
        dg = depsgraph()
        low = 1e9
        for o, indices in zip(meshes, sets):
            if not indices:
                continue
            ev = o.evaluated_get(dg)
            geometry = ev.to_mesh()
            matrix = ev.matrix_world
            for index in indices:
                z = (matrix @ geometry.vertices[index].co).z
                if z < low:
                    low = z
            ev.to_mesh_clear()
        return low

    def Forward(sets):
        """How far in front of the root (actor -Y) the furthest vertex of `sets` is,
        in RUNTIME metres, plus its height. The kick lands with a boot, not with the toe
        bone: the 2026-09-15 stage table read the toe bone's *height* (0.63) as if it were
        its reach and put the guard 0.16 m too close, so the boot went through the chest."""
        dg = depsgraph()
        best = 1e9
        height = .0
        for o, indices in zip(meshes, sets):
            if not indices:
                continue
            ev = o.evaluated_get(dg)
            geometry = ev.to_mesh()
            matrix = ev.matrix_world
            for index in indices:
                point = matrix @ geometry.vertices[index].co
                if point.y < best:
                    best, height = point.y, point.z
            ev.to_mesh_clear()
        return -best * nominalScale, height * nominalScale

    def BodyBack():
        """Support distance of the skin along each strike bearing, in RUNTIME metres.

        This is the other half of every contact distance: the striker has to stop at the
        victim's *skin*, and on a kneeling man the skin starts 0.13-0.17 m out from his
        origin depending on the bearing. One pass over every vertex, so it only runs on
        the frames that matter."""
        dg = depsgraph()
        bearings = [(name, low, high, math.sin(math.radians(a)), math.cos(math.radians(a)))
                    for name, low, high, a in CONTACT_TARGETS]
        best = {name: -1e9 for name, _, _, _ in CONTACT_TARGETS}
        for o in meshes:
            ev = o.evaluated_get(dg)
            geometry = ev.to_mesh()
            matrix = ev.matrix_world
            for v in geometry.vertices:
                point = matrix @ v.co
                z = point.z * nominalScale
                for name, low, high, ux, uy in bearings:
                    if low <= z <= high:
                        # Only skin inside the corridor the striking end actually sweeps.
                        # A plain support function answers "is anything of him this far out
                        # along that bearing", and on a man with his hands behind his head
                        # the answer at 0.79 m is his elbow, a quarter of a metre off to
                        # the side of where the blade goes.
                        if abs(point.x * uy - point.y * ux) > CONTACT_CORRIDOR:
                            continue
                        reach = point.x * ux + point.y * uy
                        if reach > best[name]:
                            best[name] = reach
            ev.to_mesh_clear()
        return {name: round(value * nominalScale, 4) for name, value in best.items() if value > -1e8}

    # Calibrate the folded foot: the kneel rests on shin and boot top at once, and the
    # distance from the toe bone to the boot's upper surface differs per rig. Solve it
    # from the deformed mesh instead of guessing a constant.
    calibration = []
    for _ in range(3):
        for pb in arm.pose.bones:
            pb.matrix_basis = rest[pb.name]
        Update()
        kneelProbe = KneelBase()
        chestProbe = kneelPelvisZ + (restChest - restPelvis) * .94
        kneelProbe.update({'pelvisTilt': (.10, 0, 0), 'bend': .20, 'neck': (.12, 0, 0), 'head': (.24, 0, 0), 'shrug': .30,
                      'hands': {'L': (hipHalf + .10, -.10, chestProbe - .30),
                                'R': (-(hipHalf + .10), -.10, chestProbe - .30)},
                      'armPoles': {'L': (hipHalf + .9, .10, chestProbe - .50),
                                   'R': (-(hipHalf + .9), .10, chestProbe - .50)}})
        ApplyPose(kneelProbe, 0.0)
        shinLow = LowestOf(shinVertices)
        footLow = LowestOf(footVertices)
        calibration.append((round(shinLow, 4), round(footLow, 4), round(kneelAnkleZ, 4)))
        kneelAnkleZ += shinLow - footLow
    print('KNEEL_CALIBRATION %s %s -> ankleZ %.4f' % (modelId, calibration, kneelAnkleZ), flush=True)

    # BlenderMCP hook: hand the live rig to the caller instead of baking it.
    if probe is not None:
        return probe(dict(locals()))

    # Fast authoring-loop preview (CAPTIVES_RENDER=<directory>). Workbench, a few frames
    # per clip; these renders are review-only and never leave the local machine.
    renderDir = os.environ.get('CAPTIVES_RENDER')
    previewCamera = None
    if renderDir:
        Path(renderDir).mkdir(parents=True, exist_ok=True)
        previewCamera = Add(bpy.ops.object.camera_add, location=(-2.4, -2.9, 1.25))
        previewCamera.rotation_euler = (Vector((0, 0, .70)) - previewCamera.location).to_track_quat('-Z', 'Y').to_euler()
        previewCamera.data.type = 'ORTHO'
        previewCamera.data.ortho_scale = 2.4
        scene.camera = previewCamera
        scene.render.engine = 'BLENDER_WORKBENCH'
        scene.render.resolution_x = 420
        scene.render.resolution_y = 460
        scene.display.shading.light = 'STUDIO'
        scene.display.shading.show_shadows = True
        Add(bpy.ops.mesh.primitive_plane_add, size=6, location=(0, 0, 0)).name = 'Prop_PreviewGround'

    rifleProxy = None

    def RenderPreview(clip, t, hold):
        nonlocal rifleProxy
        if hold != 'free':
            if rifleProxy is None:
                rifleProxy = Add(bpy.ops.mesh.primitive_cube_add, size=1)
                rifleProxy.name = 'Prop_PreviewRifle'
            grip = GripPoint('R')
            if hold == 'oneHandRight':
                axis = (grip - Point(Bone('R Forearm'))).normalized()
            else:
                axis = (GripPoint('L') - grip).normalized()
            butt = grip - axis * .255
            tip = grip + axis * (BAYONET_TIP_M / nominalScale)
            rifleProxy.location = (butt + tip) / 2
            rifleProxy.scale = (.035, .035, (tip - butt).length)
            rifleProxy.rotation_euler = axis.to_track_quat('Z', 'Y').to_euler()
            rifleProxy.hide_render = False
        elif rifleProxy is not None:
            rifleProxy.hide_render = True
        scene.render.filepath = str(Path(renderDir) / ('%s_%s_%s.png' % (modelId, clip, ('%.2f' % t).replace('.', 'p'))))
        Op(bpy.ops.render.render, write_still=True)

    framesByClip = {}
    clipReports = []
    for clip in MODEL_CLIPS[modelId]:
        duration, loop, weaponHold = DEFINITIONS[clip]
        count = math.ceil(duration * fps) + 1
        step = duration / (count - 1)
        action = bpy.data.actions.new(clip)
        arm.animation_data_create()
        values = []
        samples = []
        lifts = []
        for frame in range(count):
            arm.animation_data.action = None
            t = frame * step
            overreach.clear()
            Author(clip, t, 0.0)
            low, lowAt = LowestVertex()
            regions = RegionLows() if os.environ.get('CAPTIVES_REGIONS') else None
            lift = CLEARANCE - low
            Author(clip, t, lift)
            lifts.append(lift)
            values.extend(SourcePose())
            gripR = GripPoint('R')
            gripL = GripPoint('L')
            # Match Actor._UpdateRiggedWeaponMount: a two-handed rifle aims along the
            # grip line, a one-handed one along the forearm's extension past the wrist.
            axis = (gripR - Point(Bone('R Forearm'))) if weaponHold == 'oneHandRight' else (gripL - gripR)
            axis = axis.normalized() if axis.length > 1e-5 else Vector((0, -1, 0))
            # The rifle keeps its real size while the actor is scaled to 1.66 m, so the
            # tip is a scaled hand plus an unscaled weapon length, exactly as at runtime.
            tip = gripR * nominalScale + axis * BAYONET_TIP_M
            kickY, kickZ = Forward(kickVertices) if clip == 'IjaKickPrisoner' else (0.0, 0.0)
            palmY, palmZ = Forward(shoveVertices) if clip == 'IjaShoveForward' else (0.0, 0.0)
            back = BodyBack() if (clip in CONTACT_BAND_CLIPS and frame == 0) else None
            samples.append({
                't': round(t, 4),
                'head': round(Point(Bone('Head')).z, 4),
                'pelvis': round(Point(Bone('Pelvis')).z, 4),
                'chest': round(Point(Bone('Spine2')).z, 4),
                'kneeL': round(Point(Bone('L Calf')).z, 4),
                'kneeR': round(Point(Bone('R Calf')).z, 4),
                'toeL': round(Point(Bone('L Toe0')).z, 4),
                'toeR': round(Point(Bone('R Toe0')).z, 4),
                'ankleL': round(Point(Bone('L Foot')).y, 4),
                'ankleR': round(Point(Bone('R Foot')).y, 4),
                'wristL': round(gripL.z, 4),
                'wristR': round(gripR.z, 4),
                'handSpan': round((gripL - gripR).length, 4),
                'tip': [round(tip.x, 4), round(tip.y, 4), round(tip.z, 4)],
                'butt': [round(v, 4) for v in (gripR * nominalScale - axis * .255)],
                'bootReach': round(kickY, 4), 'bootZ': round(kickZ, 4),
                'palmReach': round(palmY, 4), 'palmZ': round(palmZ, 4),
                'back': back,
                'lift': round(lift, 5),
                'lowAt': lowAt,
                'regions': regions,
                'overreach': list(overreach),
            })
            if renderDir and frame % max(1, (count - 1) // 5) == 0:
                RenderPreview(clip, t, weaponHold)
            arm.animation_data.action = action
            for name in names:
                pb = arm.pose.bones[name]
                pb.keyframe_insert('location', frame=frame)
                pb.keyframe_insert('rotation_quaternion', frame=frame)
        framesByClip[clip] = {'duration': duration, 'loop': loop, 'weaponHold': weaponHold,
                              'frameCount': count, 'values': values}
        if clip in REFERENCE_SPEED:
            framesByClip[clip]['referenceSpeedMps'] = REFERENCE_SPEED[clip]
        action.use_fake_user = True
        arm.animation_data.action = None
        track = arm.animation_data.nla_tracks.new()
        track.name = clip
        track.mute = True
        track.strips.new(clip, 0, action)
        problems = sorted({'%s@%.2f=%.3f' % (label, s['t'], ratio)
                           for s in samples for label, ratio in s['overreach']})
        headLo = min(s['head'] for s in samples)
        headHi = max(s['head'] for s in samples)
        # The loop seam: a loop clip's authored last frame has to equal its authored first
        # frame. Sampling wraps on `at % duration`, so a non-periodic wobble term never
        # trips the runtime wrap test — it just pops once a cycle on screen.
        stride = len(names) * 7
        seam = max(abs(values[i] - values[len(values) - stride + i]) for i in range(stride)) if loop else .0
        # The planted foot's backward speed, which is the whole no-skating contract.
        # Per interval the planted foot is whichever ankle is travelling backwards (+Y)
        # fastest; the swinging one is going forwards, so max() picks the planted one.
        stanceSpeed = None
        if clip in REFERENCE_SPEED:
            speeds = [max((b['ankleL'] - a['ankleL']) / (b['t'] - a['t']),
                          (b['ankleR'] - a['ankleR']) / (b['t'] - a['t']))
                      for a, b in zip(samples, samples[1:])]
            stanceSpeed = [round(min(speeds), 4), round(max(speeds), 4)]
        clipReports.append({'clip': clip, 'duration': duration, 'loop': loop, 'weaponHold': weaponHold,
                            'frameCount': count, 'samples': samples,
                            'headRange': [round(headLo, 4), round(headHi, 4)],
                            'liftRange': [round(min(lifts), 5), round(max(lifts), 5)],
                            'referenceSpeedMps': REFERENCE_SPEED.get(clip),
                            'stanceSpeed': stanceSpeed,
                            'loopSeam': round(seam, 9),
                            'overreach': problems})
        if loop:
            print('   LOOPSEAM %-24s %.3e %s' % (clip, seam, 'OK' if seam < 1e-9 else '**POPS**'), flush=True)
        if stanceSpeed:
            print('   STANCE   %-24s planted foot %.4f..%.4f m/s (reference %.3f)'
                  % (clip, stanceSpeed[0], stanceSpeed[1], REFERENCE_SPEED[clip]), flush=True)
        # The contact window, frame by frame, in runtime metres: this is what the stage
        # distances in Data_CutsceneMachineGunCaptives are derived from.
        window = {'IjaShoveForward': (0.32, 0.58), 'IjaKickPrisoner': (0.34, 0.56),
                  'IjaRifleButtStrike': (0.76, 0.96),
                  'IjaBayonetDownThrust': (0.66, 1.12)}.get(clip)
        if window:
            for s in samples:
                if window[0] <= s['t'] <= window[1]:
                    print('     REACH %-22s t=%.3f boot %.3f/%.3f  palm %.3f/%.3f  butt %.3f/%.3f  tip %.3f/%.3f'
                          % (clip, s['t'], s['bootReach'], s['bootZ'], s['palmReach'], s['palmZ'],
                             -s['butt'][1], s['butt'][2], -s['tip'][1], s['tip'][2]), flush=True)
        if samples[0]['back']:
            print('   BACK     %-24s %s' % (clip, json.dumps(samples[0]['back'])), flush=True)
        print('CLIP %-24s %-11s head %.3f-%.3f lift %.3f..%.3f toeMax %.3f kneeMin %.3f wristTop %.3f %s'
              % (clip, modelId, headLo, headHi, min(lifts), max(lifts),
                 max(max(s['toeL'], s['toeR']) for s in samples),
                 min(min(s['kneeL'], s['kneeR']) for s in samples),
                 max(max(s['wristL'], s['wristR']) - s['head'] for s in samples),
                 ('OVERREACH ' + ' '.join(problems)) if problems else ''), flush=True)
        if weaponHold != 'free':
            best = min(samples, key=lambda s: s['tip'][1])
            butt = min(samples, key=lambda s: s['butt'][1])
            print('   tip reach y=%.3f z=%.3f at t=%s; tip height %.3f..%.3f; butt reach y=%.3f z=%.3f; span %.3f-%.3f'
                  % (best['tip'][1], best['tip'][2], best['t'],
                     min(s['tip'][2] for s in samples), max(s['tip'][2] for s in samples),
                     butt['butt'][1], butt['butt'][2],
                     min(s['handSpan'] for s in samples), max(s['handSpan'] for s in samples)), flush=True)
        for s in samples[::max(1, (count - 1) // 4)]:
            print('   t=%-5s low@%-22s knee %.3f toe %.3f pelvis %.3f head %.3f %s'
                  % (s['t'], str(s['lowAt']), min(s['kneeL'], s['kneeR']),
                     min(s['toeL'], s['toeR']), s['pelvis'], s['head'],
                     json.dumps(s['regions']) if s['regions'] else ''), flush=True)

    firstClip = MODEL_CLIPS[modelId][0]
    arm.animation_data.action = bpy.data.actions[firstClip]
    scene.frame_start = 0
    scene.frame_end = framesByClip[firstClip]['frameCount'] - 1
    scene.frame_set(0)
    for track in arm.animation_data.nla_tracks:
        track.mute = True

    asset = {'schema': 1, 'modelId': modelId, 'authoringTool': TOOL,
             'originalModelSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
             'fps': fps, 'stride': 7, 'bones': names, 'clips': framesByClip}
    file = output / ('Animation_' + modelId + 'MachineGunCaptives.json')
    temporary = file.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(asset, separators=(',', ':')), encoding='utf-8')
    temporary.replace(file)

    if not os.environ.get('CAPTIVES_SKIP_BLEND'):
        def Material(name, color):
            material = bpy.data.materials.new(name)
            material.diffuse_color = (*color, 1)
            return material

        def Box(name, location, scale, material):
            o = Add(bpy.ops.mesh.primitive_cube_add, size=1, location=location)
            o.name = name
            o.scale = scale
            o.data.materials.append(material)
            return o

        Box('Prop_ProofGround', (0, 0, -.04), (4, 4, .08), Material('Material_CaptivesProofGround', (.20, .19, .16)))
        camera = Add(bpy.ops.object.camera_add, location=(-2.55, -3.15, 1.55))
        camera.name = 'Camera_CaptivesPoseReview'
        camera.rotation_euler = (Vector((0, 0, .75)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
        camera.data.type = 'ORTHO'
        camera.data.ortho_scale = 2.6
        scene.camera = camera
        for name, point, power, size in [('Light_Key', (-2.4, -3.2, 4), 620, 4), ('Light_Fill', (3, -1.4, 3), 380, 3)]:
            lamp = Add(bpy.ops.object.light_add, type='AREA', location=point)
            lamp.name = name
            lamp.data.energy = power
            lamp.data.shape = 'DISK'
            lamp.data.size = size
            lamp.rotation_euler = (Vector((0, 0, .9)) - lamp.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.engine = 'CYCLES'
        scene.cycles.samples = 12
        scene.render.resolution_x = 640
        scene.render.resolution_y = 720
        if not scene.world:
            scene.world = bpy.data.worlds.new('World_CaptivesProof')
        scene.world.color = (.22, .22, .22)
        scene['authoringTool'] = TOOL
        scene['runtimeCoordinatePolicy'] = ('Original GLB bone frames, source +Z facing, runtime CharacterModel '
                                            'yaw PI -> actor -Z; every frame grounded at bake time; no Actor world-root tracks')
        scene['originalSourceSha256'] = asset['originalModelSha256']
        scene['reviewActions'] = 'Select an action on the original armature; NLA copies are muted for reference'
        Op(bpy.ops.file.pack_all)
        blend = private / ('Scene_' + modelId + 'MachineGunCaptives.blend')
        Op(bpy.ops.wm.save_as_mainfile, filepath=str(blend), compress=True)
    else:
        blend = private / ('Scene_' + modelId + 'MachineGunCaptives.blend')

    validation = {'modelId': modelId, 'sourceFacingBlender': sourceFacing, 'runtimeForward': [0, 0, -1],
                  'rest': {'pelvis': round(restPelvis, 4), 'chest': round(restChest, 4), 'head': round(restHead, 4),
                           'ankle': round(ankleZ, 4), 'femur': round(femur, 4), 'shin': round(shin, 4),
                           'arm': round(armLen, 4), 'hipHalf': round(hipHalf, 4)},
                  'clips': clipReports, 'blend': str(blend), 'file': file.name,
                  'sha256': hashlib.sha256(file.read_bytes()).hexdigest(),
                  'bakeSeconds': round(time.time() - started, 1)}
    if not os.environ.get('CAPTIVES_SKIP_BLEND'):
        (private / ('Data_' + modelId + 'MachineGunCaptivesValidation.json')).write_text(
            json.dumps(validation, indent=1), encoding='utf-8')
    print('MODEL %s done in %.1fs -> %s (%d bytes)'
          % (modelId, time.time() - started, file.name, file.stat().st_size), flush=True)
    return validation


# Driver. Guarded so BlenderMCP (and any other caller) can exec this file as a
# module and reach Bake()/its probe hook without baking all five rigs first.
if __name__ == '__main__':
    selected = os.environ.get('CAPTIVES_MODEL')
    wanted = set(selected.split(',')) if selected else None
    results = [Bake(modelId) for modelId in MODEL_CLIPS if not wanted or modelId in wanted]
    manifest = {'schema': 1, 'version': VERSION, 'authoringTool': TOOL, 'actorForward': [0, 0, -1],
                'floorClearanceM': CLEARANCE, 'blendSeconds': 0.12,
                'scope': 'Machine-gun stage captives cutscene only',
                'clips': {name: ({'duration': duration, 'loop': loop, 'weaponHold': hold,
                                  'referenceSpeedMps': REFERENCE_SPEED[name]} if name in REFERENCE_SPEED
                                 else {'duration': duration, 'loop': loop, 'weaponHold': hold})
                          for name, (duration, loop, hold) in DEFINITIONS.items()},
                'models': []}
    for modelId, clips in MODEL_CLIPS.items():
        file = output / ('Animation_' + modelId + 'MachineGunCaptives.json')
        if file.exists():
            manifest['models'].append({
                'id': modelId, 'file': file.name,
                'sha256': hashlib.sha256(file.read_bytes()).hexdigest(),
                'clipIds': clips,
                'originalModelSha256': hashlib.sha256(
                    (project / 'Model/Character' / ('Model_' + modelId + '.glb')).read_bytes()).hexdigest()})
    manifestFile = output / 'Data_MachineGunCaptivesAnimation.json'
    temporary = manifestFile.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    temporary.replace(manifestFile)
    print('MANIFEST', manifestFile, len(manifest['models']), 'models', flush=True)
