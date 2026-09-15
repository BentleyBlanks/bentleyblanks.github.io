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
VERSION = '20260915MachineGunCaptivesV1'
TOOL = 'Blender 5.1 background python (same bpy path BlenderMCP executes)'

# clip -> (seconds, loop, weaponHold)
DEFINITIONS = {
    'CaptiveHandsUpStand':   (4.0, True,  'free'),
    'CaptiveKneelHandsHead': (4.0, True,  'free'),
    'CaptiveKneelPlead':     (4.0, True,  'free'),
    'CaptiveStruckDown':     (1.6, False, 'free'),
    'CaptiveStabbedCollapse': (2.0, False, 'free'),
    'IjaBayonetGuard':       (4.0, True,  'twoHand'),
    'IjaTauntGesture':       (4.0, True,  'oneHandRight'),
    'IjaKickPrisoner':       (1.2, False, 'twoHand'),
    'IjaRifleButtStrike':    (1.4, False, 'twoHand'),
    'IjaBayonetDownThrust':  (1.6, False, 'twoHand'),
}
CAPTIVE_CLIPS = ['CaptiveHandsUpStand', 'CaptiveKneelHandsHead', 'CaptiveKneelPlead',
                 'CaptiveStruckDown', 'CaptiveStabbedCollapse']
GUARD_CLIPS = ['IjaBayonetGuard', 'IjaTauntGesture', 'IjaKickPrisoner',
               'IjaRifleButtStrike', 'IjaBayonetDownThrust']
MODEL_CLIPS = {
    'LugouNra02': CAPTIVE_CLIPS,
    'LugouNra05': CAPTIVE_CLIPS,
    'LugouIja01': GUARD_CLIPS,
    'LugouIja02': GUARD_CLIPS,
    'LugouIja03': GUARD_CLIPS,
}
# Type38 with a fixed bayonet, measured from the right-hand grip mount
# (_blender/BuildWeapons.py BUTT_Z 0.255, Data_Weapons bayonetTotalM 1.663).
BAYONET_TIP_M = 1.663 - 0.255

convert = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
convertInv = convert.inverted()
Clamp = lambda x, a=0, b=1: max(a, min(b, x))
Smooth = lambda x: Clamp(x) * Clamp(x) * (3 - 2 * Clamp(x))
Mix = lambda a, b, x: a + (b - a) * x
Tau = math.pi * 2


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


def Bake(modelId):
    started = time.time()
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

    def Tilt(pb, x=0, y=0, z=0):
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
    nominalScale = 1.66 / restTop            # CharacterModel's targetHeight for infantry
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
        """p is a plain dict of world-space targets; `lift` shifts every one of them."""
        def L(point):
            return (point[0], point[1], point[2] + lift)

        pelvis = Bone('Pelvis')
        Move(pelvis, L(p['pelvis']))
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
        for side, sign in [('L', 1), ('R', -1)]:
            foot = Bone(side + ' Foot')
            Chain(Bone(side + ' Thigh'), Bone(side + ' Calf'), foot,
                  L(p['ankles'][side]), L(p['legPoles'][side]), label='leg' + side)
            toeDir = p.get('toeDirs', {}).get(side)
            if toeDir is None:
                matrix = BWorld(foot)
                location = matrix.translation.copy()
                _, _, scale = matrix.decompose()
                Put(foot, Matrix.LocRotScale(location, footQuats[side], scale))
            else:
                at = Point(foot)
                Aim(foot, Bone(side + ' Toe0'), at + Vector(toeDir).normalized() * footLen)
        for side, sign in [('L', 1), ('R', -1)]:
            Chain(Bone(side + ' UpperArm'), Bone(side + ' Forearm'), Bone(side + ' Hand'),
                  L(p['hands'][side]), L(p['armPoles'][side]), label='arm' + side)
        for side in ['L', 'R']:
            palm = p.get('palms', {}).get(side)
            if not palm:
                continue
            forward, normalHint, curl = palm[0], palm[1], palm[2]
            indexCurl = palm[3] if len(palm) > 3 else None
            normal = TurnPalm(side, forward, normalHint)
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

    def Author(clip, t, lift):
        for pb in arm.pose.bones:
            pb.matrix_basis = rest[pb.name]
        Update()
        duration = DEFINITIONS[clip][0]
        phase = Tau * t / duration
        sway = math.sin(phase)
        sway2 = math.sin(phase * 1.7 + 1.1)
        breath = math.sin(phase * 2)
        tremble = math.sin(t * 13.0)
        p = None

        if clip == 'CaptiveHandsUpStand':
            p = StandBase(phase, sway)
            p['pelvis'] = (.020 * sway, .02 + .010 * breath, restPelvis - .040 + .008 * breath)
            p['pelvisTilt'] = (.05, .045 * sway, 0)
            p['bend'] = .12
            p['lean'] = .03 * sway2
            p['shrug'] = .26
            p['neck'] = (.06, 0, 0)
            p['head'] = (.16 + .03 * math.sin(phase * 2.3), 0, .10 * sway)
            reachZ = shoulder['L'].z - .040 + .440
            p['hands'] = {
                'L': (hipHalf + .175 + .020 * sway, -.10, reachZ + .012 * breath),
                'R': (-(hipHalf + .175) - .020 * sway, -.10, reachZ - .012 * breath),
            }
            p['armPoles'] = {'L': (hipHalf + .95, .15, reachZ - .55), 'R': (-(hipHalf + .95), .15, reachZ - .55)}
            p['palms'] = {
                'L': ((-.18, -.10, .98), (0, -1, .1), .12),
                'R': ((.18, -.10, .98), (0, -1, .1), .12),
            }

        elif clip == 'CaptiveKneelHandsHead':
            p = KneelBase(sink=.004 * breath)
            p['pelvisTilt'] = (.10, .012 * tremble, 0)
            p['bend'] = .20 + .010 * tremble
            p['lean'] = .018 * math.sin(phase * .9)
            p['shrug'] = .34
            p['neck'] = (.12, 0, 0)
            p['head'] = (.24, 0, .07 * math.sin(phase * .8))
            crown = kneelPelvisZ + (restHead - restPelvis) * .90
            p['hands'] = {
                'L': (hipHalf - .020, .105, crown + .070),
                'R': (-(hipHalf - .020), .105, crown + .070),
            }
            p['armPoles'] = {'L': (hipHalf + 1.0, -.62, crown - .30), 'R': (-(hipHalf + 1.0), -.62, crown - .30)}
            p['palms'] = {
                'L': ((-.86, .22, .46), (0, -1, .12), .55),
                'R': ((.86, .22, .46), (0, -1, .12), .55),
            }

        elif clip == 'CaptiveKneelPlead':
            beg = (1 - math.cos(phase)) / 2
            p = KneelBase(sink=.006 * breath)
            p['pelvisTilt'] = (.06, .010 * tremble, 0)
            p['bend'] = .14 + .05 * math.sin(phase * 2.4)
            p['shrug'] = .16
            p['neck'] = (-.14, 0, 0)
            p['head'] = (-.22 + .05 * math.sin(phase * 2.4), 0, .05 * sway)
            chest = kneelPelvisZ + (restChest - restPelvis) * .94
            p['hands'] = {
                'L': (hipHalf - .015 + .02 * beg, -.235 - .085 * beg, chest - .095 + .050 * beg),
                'R': (-(hipHalf - .015) - .02 * beg, -.235 - .085 * beg, chest - .105 + .050 * beg),
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
                            'dAy': legOut, 'az': .078, 'toe': (0, .94, -.35),
                            'hx': hipHalf + .175, 'dHy': -.735, 'hz': .014,
                            'poleDy': .22, 'poleDz': .34,
                            'legPoleX': 1.20, 'legPoleDy': .42, 'legPoleZ': .12, 'shrug': .10}),
                    (1.16, {'px': .02, 'py': -.315, 'pz': hipThick, 'tilt': 1.53, 'bend': .02,
                            'neck': -.05, 'head': -.10, 'roll': .09, 'turn': .84,
                            'dAy': legOut, 'az': .074, 'toe': (0, .94, -.35),
                            'hx': hipHalf + .170, 'dHy': -.725, 'hz': .004,
                            'poleDy': .22, 'poleDz': .34,
                            'legPoleX': 1.20, 'legPoleDy': .42, 'legPoleZ': .12, 'shrug': .08}),
                    (1.60, {'px': .02, 'py': -.320, 'pz': hipThick - .004, 'tilt': 1.54, 'bend': .02,
                            'neck': -.05, 'head': -.10, 'roll': .09, 'turn': .86,
                            'dAy': legOut, 'az': .072, 'toe': (0, .94, -.35),
                            'hx': hipHalf + .168, 'dHy': -.720, 'hz': .002,
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
                            'dAy': legOut * .955, 'az': .100, 'toe': (0, .90, -.43),
                            'hx': hipHalf + .055, 'dHy': -.545, 'hz': .038,
                            'poleDy': .22, 'poleDz': .32,
                            'legPoleX': 1.20, 'legPoleDy': .42, 'legPoleZ': .12, 'shrug': .10}),
                    (2.00, {'px': .02, 'py': -.270, 'pz': hipThick + .008, 'tilt': 1.44, 'bend': .03,
                            'neck': -.04, 'head': -.09, 'roll': .16, 'turn': .80,
                            'dAy': legOut * .955, 'az': .096, 'toe': (0, .90, -.43),
                            'hx': hipHalf + .050, 'dHy': -.535, 'hz': .030,
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
            shift = .012 * sway
            aim = Vector((.12, -.902, -.414)).normalized()
            left = Vector((hipHalf - .055, -.275 - .010 * breath, shoulder['L'].z - .32 + .012 * breath))
            right = left - aim * .365
            p = StandBase(phase, sway)
            p['ankles'] = {'L': (hipHalf + .02, -.115, ankleZ), 'R': (-(hipHalf + .02), .085, ankleZ)}
            p['pelvis'] = (shift, .015, restPelvis - .055 + .006 * breath)
            p['pelvisTilt'] = (.07, .020 * sway, -.16)
            p['bend'] = .13
            p['neck'] = (.05, 0, .05)
            p['head'] = (.09, 0, .10 + .035 * sway)
            p['shrug'] = .05
            p['hands'] = {'L': tuple(left), 'R': tuple(right)}
            p['armPoles'] = {'L': (hipHalf + .80, -.25, left.z - .45), 'R': (-(hipHalf + .75), .10, right.z - .45)}
            p['palms'] = GripPalms(aim)

        elif clip == 'IjaTauntGesture':
            jab = Smooth(math.sin(phase * 2) * .5 + .5)
            p = StandBase(phase, sway)
            p['ankles'] = {'L': (hipHalf + .02, -.10, ankleZ), 'R': (-(hipHalf + .02), .075, ankleZ)}
            p['pelvis'] = (.014 * sway, .01 - .02 * jab, restPelvis - .048)
            p['pelvisTilt'] = (.10, .02 * sway, -.10)
            p['bend'] = .17 + .04 * jab
            p['neck'] = (.17, 0, .04)
            p['head'] = (.10 + .05 * jab, 0, .12)
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
            # down in front to a kneeling man's head-and-shoulder height. The right hand
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
                (0.68, {'pitch': -131.0, 'yaw': -2.0, 'bx': hipHalf - .150, 'by': -.420,
                        'bz': shoulder['L'].z + .375, 'px': 0, 'py': -.090, 'pz': restPelvis - .090,
                        'tilt': .15, 'bend': .05, 'head': .10, 'fy': -.200, 'span': .340}),
                # 砸击（0.85）：枪托落到身前约 0.78 m、高约 0.66 m（跪着的人的头肩高度），
                # 躯干前倾、右臂打直、骨盆压到前脚上方。
                (0.85, {'pitch': -216.9, 'yaw': -3.6, 'bx': hipHalf - .125, 'by': -.875,
                        'bz': .655, 'px': .02, 'py': -.290, 'pz': restPelvis - .150,
                        'tilt': .40, 'bend': .12, 'head': .26, 'fy': -.410, 'span': .300}),
                (1.02, {'pitch': -221.0, 'yaw': -3.6, 'bx': hipHalf - .120, 'by': -.855,
                        'bz': .620, 'px': .02, 'py': -.318, 'pz': restPelvis - .155,
                        'tilt': .42, 'bend': .13, 'head': .27, 'fy': -.420, 'span': .300}),
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
            result.extend([*p, q.x, q.y, q.z, q.w])
        return [round(v, 6) for v in result]

    depsgraph = lambda: bpy.context.evaluated_depsgraph_get()

    def LowestVertex():
        dg = depsgraph()
        low = 1e9
        where = (0, 0, 0)
        for o in meshes:
            ev = o.evaluated_get(dg)
            geometry = ev.to_mesh()
            matrix = ev.matrix_world
            for v in geometry.vertices:
                p = matrix @ v.co
                if p.z < low:
                    low = p.z
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
    regionVertices = {
        'foot': footVertices, 'shin': shinVertices,
        'thigh': GroupSets(lambda n: 'Thigh' in n),
        'hip': GroupSets(lambda n: 'Pelvis' in n),
        'torso': GroupSets(lambda n: 'Spine' in n),
        'head': GroupSets(lambda n: 'Head' in n or 'Neck' in n),
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

    # Calibrate the folded foot: the kneel rests on shin and boot top at once, and the
    # distance from the toe bone to the boot's upper surface differs per rig. Solve it
    # from the deformed mesh instead of guessing a constant.
    calibration = []
    for _ in range(3):
        for pb in arm.pose.bones:
            pb.matrix_basis = rest[pb.name]
        Update()
        probe = KneelBase()
        chestProbe = kneelPelvisZ + (restChest - restPelvis) * .94
        probe.update({'pelvisTilt': (.10, 0, 0), 'bend': .20, 'neck': (.12, 0, 0), 'head': (.24, 0, 0), 'shrug': .30,
                      'hands': {'L': (hipHalf + .10, -.10, chestProbe - .30),
                                'R': (-(hipHalf + .10), -.10, chestProbe - .30)},
                      'armPoles': {'L': (hipHalf + .9, .10, chestProbe - .50),
                                   'R': (-(hipHalf + .9), .10, chestProbe - .50)}})
        ApplyPose(probe, 0.0)
        shinLow = LowestOf(shinVertices)
        footLow = LowestOf(footVertices)
        calibration.append((round(shinLow, 4), round(footLow, 4), round(kneelAnkleZ, 4)))
        kneelAnkleZ += shinLow - footLow
    print('KNEEL_CALIBRATION %s %s -> ankleZ %.4f' % (modelId, calibration, kneelAnkleZ), flush=True)

    # Fast authoring-loop preview (CAPTIVES_RENDER=<directory>). Workbench, a few frames
    # per clip; these renders are review-only and never leave the local machine.
    renderDir = os.environ.get('CAPTIVES_RENDER')
    previewCamera = None
    if renderDir:
        Path(renderDir).mkdir(parents=True, exist_ok=True)
        bpy.ops.object.camera_add(location=(-2.4, -2.9, 1.25))
        previewCamera = bpy.context.object
        previewCamera.rotation_euler = (Vector((0, 0, .70)) - previewCamera.location).to_track_quat('-Z', 'Y').to_euler()
        previewCamera.data.type = 'ORTHO'
        previewCamera.data.ortho_scale = 2.4
        scene.camera = previewCamera
        scene.render.engine = 'BLENDER_WORKBENCH'
        scene.render.resolution_x = 420
        scene.render.resolution_y = 460
        scene.display.shading.light = 'STUDIO'
        scene.display.shading.show_shadows = True
        bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0))
        bpy.context.object.name = 'Prop_PreviewGround'

    rifleProxy = None

    def RenderPreview(clip, t, hold):
        nonlocal rifleProxy
        if hold != 'free':
            if rifleProxy is None:
                bpy.ops.mesh.primitive_cube_add(size=1)
                rifleProxy = bpy.context.object
                rifleProxy.name = 'Prop_PreviewRifle'
            grip = Point(Bone('R Hand'))
            if hold == 'oneHandRight':
                axis = (grip - Point(Bone('R Forearm'))).normalized()
            else:
                axis = (Point(Bone('L Hand')) - grip).normalized()
            butt = grip - axis * .255
            tip = grip + axis * (BAYONET_TIP_M / nominalScale)
            rifleProxy.location = (butt + tip) / 2
            rifleProxy.scale = (.035, .035, (tip - butt).length)
            rifleProxy.rotation_euler = axis.to_track_quat('Z', 'Y').to_euler()
            rifleProxy.hide_render = False
        elif rifleProxy is not None:
            rifleProxy.hide_render = True
        scene.render.filepath = str(Path(renderDir) / ('%s_%s_%s.png' % (modelId, clip, ('%.2f' % t).replace('.', 'p'))))
        bpy.ops.render.render(write_still=True)

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
            gripR = Point(Bone('R Hand'))
            gripL = Point(Bone('L Hand'))
            # Match Actor._UpdateRiggedWeaponMount: a two-handed rifle aims along the
            # grip line, a one-handed one along the forearm's extension past the wrist.
            axis = (gripR - Point(Bone('R Forearm'))) if weaponHold == 'oneHandRight' else (gripL - gripR)
            axis = axis.normalized() if axis.length > 1e-5 else Vector((0, -1, 0))
            # The rifle keeps its real size while the actor is scaled to 1.66 m, so the
            # tip is a scaled hand plus an unscaled weapon length, exactly as at runtime.
            tip = gripR * nominalScale + axis * BAYONET_TIP_M
            samples.append({
                't': round(t, 4),
                'head': round(Point(Bone('Head')).z, 4),
                'pelvis': round(Point(Bone('Pelvis')).z, 4),
                'chest': round(Point(Bone('Spine2')).z, 4),
                'kneeL': round(Point(Bone('L Calf')).z, 4),
                'kneeR': round(Point(Bone('R Calf')).z, 4),
                'toeL': round(Point(Bone('L Toe0')).z, 4),
                'toeR': round(Point(Bone('R Toe0')).z, 4),
                'wristL': round(gripL.z, 4),
                'wristR': round(gripR.z, 4),
                'handSpan': round((gripL - gripR).length, 4),
                'tip': [round(tip.x, 4), round(tip.y, 4), round(tip.z, 4)],
                'butt': [round(v, 4) for v in (gripR * nominalScale - axis * .255)],
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
        clipReports.append({'clip': clip, 'duration': duration, 'loop': loop, 'weaponHold': weaponHold,
                            'frameCount': count, 'samples': samples,
                            'headRange': [round(headLo, 4), round(headHi, 4)],
                            'liftRange': [round(min(lifts), 5), round(max(lifts), 5)],
                            'overreach': problems})
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
    file = output / ('Animation_Lugou' + modelId[len('Lugou'):] + 'MachineGunCaptives.json')
    temporary = file.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(asset, separators=(',', ':')), encoding='utf-8')
    temporary.replace(file)

    if not os.environ.get('CAPTIVES_SKIP_BLEND'):
        def Material(name, color):
            material = bpy.data.materials.new(name)
            material.diffuse_color = (*color, 1)
            return material

        def Box(name, location, scale, material):
            bpy.ops.mesh.primitive_cube_add(size=1, location=location)
            o = bpy.context.object
            o.name = name
            o.scale = scale
            o.data.materials.append(material)
            return o

        Box('Prop_ProofGround', (0, 0, -.04), (4, 4, .08), Material('Material_CaptivesProofGround', (.20, .19, .16)))
        bpy.ops.object.camera_add(location=(-2.55, -3.15, 1.55))
        camera = bpy.context.object
        camera.name = 'Camera_CaptivesPoseReview'
        camera.rotation_euler = (Vector((0, 0, .75)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
        camera.data.type = 'ORTHO'
        camera.data.ortho_scale = 2.6
        scene.camera = camera
        for name, point, power, size in [('Light_Key', (-2.4, -3.2, 4), 620, 4), ('Light_Fill', (3, -1.4, 3), 380, 3)]:
            bpy.ops.object.light_add(type='AREA', location=point)
            lamp = bpy.context.object
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
        bpy.ops.file.pack_all()
        blend = private / ('Scene_' + modelId + 'MachineGunCaptives.blend')
        bpy.ops.wm.save_as_mainfile(filepath=str(blend), compress=True)
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


selected = os.environ.get('CAPTIVES_MODEL')
wanted = set(selected.split(',')) if selected else None
results = [Bake(modelId) for modelId in MODEL_CLIPS if not wanted or modelId in wanted]
manifest = {'schema': 1, 'version': VERSION, 'authoringTool': TOOL, 'actorForward': [0, 0, -1],
            'floorClearanceM': CLEARANCE, 'blendSeconds': 0.12,
            'scope': 'Machine-gun stage captives cutscene only',
            'clips': {name: {'duration': duration, 'loop': loop, 'weaponHold': hold}
                      for name, (duration, loop, hold) in DEFINITIONS.items()},
            'models': []}
for modelId, clips in MODEL_CLIPS.items():
    file = output / ('Animation_Lugou' + modelId[len('Lugou'):] + 'MachineGunCaptives.json')
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
