"""Three IJA alert-gait clips, authored through BlenderMCP. Run Script_IjaAlertGaitPrepare.mjs first.

IJA_ALERT_PROJECT points to Taierzhuang1938. Uses the production importer, IK and
source-frame exporter (Script_MachineGunCaptivesBake.Bake probe) on IJA01; saves the
editable action library outside the repository.

  IjaAlertTrot   upright jog (BackRifleRun legs), rifle in both hands at the waist
  IjaAlertWalk   the same hold on the relaxed walk
  IjaAlertStand  standing, the same hold

The two-hand hold is IjaGuardPort's (butt at the right hip, left hand on the handguard,
muzzle a little down), carried rigidly on the chest. The chest stays level and upright;
the head sweeps left and right (the chest follows a third of it, and the rifle with it:
the muzzle goes where he looks). Each clip is several source cycles long so one sweep
spans the whole clip; foot contacts repeat per cycle.
"""
import bpy, os, json, math, runpy, hashlib
from pathlib import Path
from mathutils import Matrix, Vector, Quaternion

project = Path(os.environ['IJA_ALERT_PROJECT'])
os.environ['CAPTIVES_PROJECT'] = str(project)
os.environ['CAPTIVES_SKIP_BLEND'] = '1'
source = json.loads((project.parent / 'tmp/IjaAlertGait/Data_IjaAlertGaitSource.json').read_text())
helpers = runpy.run_path(str(project / '_import/Script_MachineGunCaptivesBake.py'), run_name='IjaAlertGaitHelpers')
convert = helpers['convert']
private = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/IjaAlertGait_20260927')
output = project / 'Animation/IjaAlertGait'
private.mkdir(parents=True, exist_ok=True)
output.mkdir(parents=True, exist_ok=True)

REVISION = '20260927IjaAlertGaitV1'
# clipId, source cycle, cycles per clip, idle, lean (rad, whole-chest pitch forward), per-frame floor fit
SPECS = [
    ('IjaAlertTrot', 'BackRifleRun', 4, False, .10, False),   # a jog has a flight phase: one constant floor fit
    ('IjaAlertWalk', 'RelaxedWalk', 3, False, .07, True),
    ('IjaAlertStand', 'RelaxedStand', 1, True, .04, True),
]
SCAN_DEG = 38          # head yaw either side
SCAN_SHARE = [('Spine', .1), ('Spine1', .2), ('Spine2', .3), ('Neck', .62), ('Head', 1.0)]
LEAN_SHARE = {'Spine': .55, 'Spine1': .85, 'Spine2': 1, 'Neck': .55, 'Head': .12}
RIFLE_BOB_RAD = .02    # the hold nods a little on every step (two per source cycle)
# Low ready, source metres from the pelvis joint in the chest's turning frame (Blender: +X his left, -Y forward,
# +Z up): the right grip in front of the right hip at belt height, the barrel forward, across to the left, down.
CHEST_SCAN = .3        # the rifle turns with the chest: this share of the head's sweep
GRIP_R = (-.13, -.07, .19)
BARREL = (.55, -.83, -.12)
GRIP_SPAN = .26          # right grip to left grip along the barrel (IjaGuardPort: .34, out of the left arm's reach here)
# The chest is bladed a little to the right (brings the left shoulder over the handguard); the head does not follow.
BODY_BIAS = -.15
BIAS_SHARE = {'Spine': .4, 'Spine1': .7, 'Spine2': 1, 'Neck': .4, 'Head': 0}
POLE_R = (-.35, .3, -.35)   # elbow bend directions from the shoulder
POLE_L = (.35, -.05, -.45)
ARM_PARTS = ['Clavicle', 'UpperArm', 'Forearm', 'Hand', 'Finger']


def Scan(u):
    """Head yaw fraction over one clip (u in [0,1)): left, a hold, across, a hold at the right, back."""
    s = math.sin(u * math.tau)
    return math.copysign(abs(s) ** .55, s)


def Bake(ctx):
    arm, names = ctx['arm'], ctx['names']
    Bone, Put, Point, BWorld, Update = [ctx[k] for k in ['Bone', 'Put', 'Point', 'BWorld', 'Update']]
    factor = ctx['authoringFactor']
    prefix = 'Bip001 '

    def SourceMatrix(flat):
        m = Matrix([flat[i::4] for i in range(4)])
        m.translation *= factor
        return convert @ m

    def Imported(pose):
        return {n: SourceMatrix(pose[n]) @ ctx['corrections'][n].inverted() for n in names}

    rest, ready = Imported(source['rest']), Imported(source['ready'])
    readyChestInv = ready[prefix + 'Spine2'].inverted()

    def RifleFrame(origin, forward, up):
        forward = forward.normalized()
        right = forward.cross(up).normalized()
        up = right.cross(forward)
        m = Matrix.Identity(4)
        for i in range(3):
            m[i][0], m[i][1], m[i][2], m[i][3] = right[i], forward[i], up[i], origin[i]
        return m

    # IjaGuardPort's own rifle frame (runtime grips = finger-root centroids): the hands keep its grip on the stock.
    def ReadyGrip(side):
        return sum((ready[prefix + side + ' Finger' + str(i)].translation for i in range(1, 5)), Vector()) / 4
    readyUp = ready[prefix + 'Neck'].translation - ready[prefix + 'Pelvis'].translation
    # One frame per hand, at its own grip: the left hand can then hold nearer than IjaGuardPort's span.
    readyFrameInv = {side: RifleFrame(ReadyGrip(side), ReadyGrip('L') - ReadyGrip('R'), readyUp.normalized()).inverted() for side in 'LR'}
    armNames = [n for n in names if any(n.startswith(prefix + s + ' ' + p) for s in 'LR' for p in ARM_PARTS)]

    def Place(part, point, q):
        Put(Bone(part), Matrix.LocRotScale(point, q, Vector((1, 1, 1))))

    def Pose(rawPose, u, phase, lean):
        frame = Imported(rawPose)
        for n in names:
            Put(arm.pose.bones[n], frame[n])
        # Upright, level chest; the scan turns it about world Z (spine a little, head the most).
        yaw = math.radians(SCAN_DEG) * Scan(u)
        parent = 'Pelvis'
        for part, share in SCAN_SHARE:
            parentDelta = BWorld(Bone(parent)).to_quaternion() @ rest[prefix + parent].to_quaternion().inverted()
            offset = rest[prefix + part].translation - rest[prefix + parent].translation
            point = Point(Bone(parent)) + parentDelta @ offset
            q = Quaternion((0, 0, 1), yaw * share + BODY_BIAS * BIAS_SHARE[part]) @ Quaternion((1, 0, 0), lean * LEAN_SHARE[part]) @ rest[prefix + part].to_quaternion()
            Place(part, point, q)
            parent = part
        # Clavicles ride on the chest as IjaGuardPort sets them (shoulders a little forward for the hold).
        chest = BWorld(Bone('Spine2'))
        carry = chest @ readyChestInv
        for side in 'LR':
            Put(Bone(side + ' Clavicle'), carry @ ready[prefix + side + ' Clavicle'])
        # The rifle at low ready, in the frame the chest turns in: right hand on the wrist of the stock in
        # front of the right hip, the barrel across the body to the left hand, muzzle forward and down.
        turn = Quaternion((0, 0, 1), yaw * CHEST_SCAN + BODY_BIAS)
        pelvis = Point(Bone('Pelvis'))
        grip = pelvis + turn @ (Vector(GRIP_R) * factor)
        pitch = Quaternion(turn @ Vector((1, 0, 0)), RIFLE_BOB_RAD * math.sin(phase * math.tau * 2))
        axis = pitch @ turn @ Vector(BARREL).normalized()
        up = Vector((0, 0, 1))
        for side, pole in [('R', POLE_R), ('L', POLE_L)]:
            move = RifleFrame(grip + axis * (GRIP_SPAN * factor if side == 'L' else 0), axis, up) @ readyFrameInv[side]
            hand = move @ ready[prefix + side + ' Hand']
            # Start the IK from the hold's own arm (not the source's swinging one): the minimal-rotation aim keeps
            # the starting twist, and the swing's would roll the sleeves a quarter turn on every step.
            for part in ['UpperArm', 'Forearm']:
                Put(Bone(side + ' ' + part), carry @ ready[prefix + side + ' ' + part])
            shoulder = Point(Bone(side + ' UpperArm'))
            ctx['Chain'](Bone(side + ' UpperArm'), Bone(side + ' Forearm'), Bone(side + ' Hand'), hand.translation,
                         shoulder + turn @ (Vector(pole) * factor), label=side + ' arm')
            Put(Bone(side + ' Hand'), hand)
            for n in armNames:
                if n.startswith(prefix + side + ' Finger'):
                    Put(arm.pose.bones[n], move @ ready[n])

    clips, report = [], {}
    only = os.environ.get('IJA_ALERT_ONLY')   # iterate on one clip (nothing is written then)
    for clipId, sourceId, cycles, idle, lean, perFrameFloor in SPECS:
        if only and clipId != only:
            continue
        raw = source['clips'][sourceId]
        count = len(raw['frames']) - 1
        total = count * cycles
        duration = raw['duration'] * cycles
        # One constant fit for the jog, from the lowest skin over a whole source cycle.
        offset = 0.0
        if not perFrameFloor:
            lows = []
            for f in range(count):
                Pose(raw['frames'][f], f / total, f / count, lean)
                lows.append(ctx['LowestVertex']()[0])
            offset = .004 * factor - min(lows)
        action = bpy.data.actions.new(clipId)
        action.use_fake_user = True
        arm.animation_data_create()
        arm.animation_data.action = action
        samples, floors, leans, spans, heads = [], [], [], [], []
        for f in range(total + 1):
            bpy.context.scene.frame_set(f + 1)
            Pose(raw['frames'][f % count], (f % total) / total, (f % count) / count, lean)
            if perFrameFloor:
                floor, _ = ctx['LowestVertex']()
                offset = .004 * factor - floor
            if abs(offset) > .00005:
                ctx['Move'](Bone('Pelvis'), Point(Bone('Pelvis')) + Vector((0, 0, offset)))
            Update()
            floors.append(ctx['LowestVertex']()[0] / factor)
            axis = Point(Bone('Neck')) - Point(Bone('Pelvis'))
            leans.append(math.degrees(math.atan2(-axis.y, axis.z)))
            # Grip span (runtime grips: finger-root centroids) and the barrel's pitch, right grip -> left grip.
            gr, gl = ctx['GripPoint']('R'), ctx['GripPoint']('L')
            barrel = gl - gr
            spans.append(barrel.length / factor)
            heads.append(math.degrees(math.atan2(barrel.z, math.hypot(barrel.x, barrel.y))))
            samples.append(ctx['SourcePose']())
            for pb in arm.pose.bones:
                pb.keyframe_insert('location', frame=f + 1, group=pb.name)
                pb.keyframe_insert('rotation_quaternion', frame=f + 1, group=pb.name)
        times = [round(duration * f / total, 6) for f in range(total + 1)]
        tracks = []
        for i, n in enumerate(names):
            for prop, off, width, kind in [('position', 0, 3, 'vector'), ('quaternion', 3, 4, 'quaternion')]:
                values = [round(v, 5) for s in samples for v in s[i * 7 + off:i * 7 + off + width]]
                # A channel that never moves (every bone's bind offset but the pelvis's) ships as one key.
                if all(abs(values[j] - values[j % width]) < 2e-5 for j in range(len(values))):
                    tracks.append({'name': n.replace(' ', '_') + '.' + prop, 'type': kind, 'times': [0], 'values': values[:width]})
                else:
                    tracks.append({'name': n.replace(' ', '_') + '.' + prop, 'type': kind, 'times': times, 'values': values})
        clips.append({'name': clipId, 'uuid': clipId, 'duration': round(duration, 6), 'tracks': tracks, 'blendMode': 2500})
        profile = source['profiles'].get(sourceId)
        contacts = {} if idle else {side: [[round((a + k) / cycles, 6), round((b + k) / cycles, 6)]
                                           for k in range(cycles) for a, b in spans_]
                                    for side, spans_ in profile['contacts'].items()}
        report[clipId] = {'duration': round(duration, 6), 'cycles': cycles, 'source': sourceId,
                          'referenceMps': 0 if idle else profile['referenceMps'], 'contacts': contacts,
                          'floorM': [round(min(floors), 4), round(max(floors), 4)],
                          'leanDeg': [round(min(leans), 2), round(max(leans), 2)],
                          'gripSpanM': [round(min(spans), 4), round(max(spans), 4)],
                          'barrelPitchDeg': [round(min(heads), 2), round(max(heads), 2)]}
        report[clipId]['overreach'] = {side: max([r for l, r in ctx['overreach'] if l.startswith(side)] or [0]) for side in 'LR'}
        ctx['overreach'].clear()
        print(clipId, json.dumps({k: v for k, v in report[clipId].items() if k != 'contacts'}), flush=True)
    data = {'schema': 1, 'revision': REVISION, 'skeleton': 'TengxianHumanoidV1', 'sourceModel': source['model'],
            'scanDeg': SCAN_DEG, 'clips': clips, 'profiles': report}
    text = json.dumps(data, separators=(',', ':'))
    if only:
        return
    (output / 'Animation_TengxianIjaAlertGait.json').write_text(text, encoding='utf-8')
    arm.animation_data.action = bpy.data.actions['IjaAlertTrot']
    scene = bpy.context.scene
    scene.render.fps = 30
    scene.frame_start = 1
    scene.frame_end = len(source['clips']['BackRifleRun']['frames']) * 4 - 3
    scene.frame_set(9)
    helpers['Op'](bpy.ops.wm.save_as_mainfile, filepath=str(private / 'Scene_IjaAlertGait.blend'))
    print(json.dumps({'file': str(output / 'Animation_TengxianIjaAlertGait.json'),
                      'sha256': hashlib.sha256(text.encode()).hexdigest(), 'blend': bpy.data.filepath}))


helpers['Bake']('TengxianIja01', probe=Bake)
