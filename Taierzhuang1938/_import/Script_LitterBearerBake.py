"""Litter-bearer gait clips (front / rear, walking / standing), authored through BlenderMCP.

Run `Script_AllyGaitPrepare.mjs` first (it writes tmp/AllyGait/Data_AllyGaitSource.json);
LITTER_BEARER_PROJECT points to Taierzhuang1938. Same importer, IK and source-frame
exporter as `Script_AllyGaitBake.py`; the shared TengxianHumanoidV1 skeleton, the
RelaxedGait legs and their measured foot contacts.

Why a new clip instead of the video-mocap CarryStretcher pair: the mocap upper body
(shoulders twisted toward the camera, a forward-pitched trunk, arms that were never
near a 0.58 m rail) sat on top of the walk-cycle legs and the runtime hand IK then
had to drag the wrists onto the poles, so the elbows flew out and the bearers looked
like they were sprinting. Here the trunk stays upright and quiet, both shoulders stay
level, and each arm is solved onto the grip point the litter actually offers:

  rails at +-0.29 m from the litter centre line, 0.88 m above the ground (litter
  origin +0.12), the front bearer's grip 0.28 m BEHIND his hips (arms hang back), the
  rear bearer's grip 0.28 m IN FRONT of his hips; the runtime places the bearer's
  pelvis 0.06 m toward the litter centre (Script_FirstLevelMissionPeople).

The fingers close around the pole (fist axis along the litter), elbows point outward
and back, so the runtime hand IK only has to absorb millimetres.
"""
import bpy, os, json, math, runpy, hashlib
from pathlib import Path
from mathutils import Matrix, Vector, Quaternion

project = Path(os.environ['LITTER_BEARER_PROJECT'])
os.environ['CAPTIVES_PROJECT'] = str(project)
os.environ['CAPTIVES_SKIP_BLEND'] = '1'
source = json.loads((project.parent / 'tmp/AllyGait/Data_AllyGaitSource.json').read_text())
helpers = runpy.run_path(str(project / '_import/Script_MachineGunCaptivesBake.py'), run_name='LitterBearerHelpers')
convert = helpers['convert']
private = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/LitterBearer_20260930')
output = project / 'Animation/LitterBearer'
private.mkdir(parents=True, exist_ok=True)
output.mkdir(parents=True, exist_ok=True)

# Game metres. Keep in step with P012_STRETCHER_GRIPS / MISSION_PEOPLE_TUNING.
RAIL_HALF_M = 0.29          # rail centre line, from the litter centre
RAIL_HEIGHT_M = 0.88        # litter origin + 0.12 above the bearer's ground
GRIP_FROM_HIPS_M = 0.28 - 0.06   # litter grip end (1.0) vs bearer offset (1.28) less the runtime pelvis shift
LOAD_SINK_M = 0.07          # soft knees under the load; authored here, the runtime sink (loadSinkM) is 0
ROLES = {'Front': dict(hipsToGrip=+1, lean=0.010), 'Rear': dict(hipsToGrip=-1, lean=0.030)}


def Bake(ctx):
    arm, names = ctx['arm'], ctx['names']
    Bone, Put, Point, BWorld, Update = [ctx[k] for k in ['Bone', 'Put', 'Point', 'BWorld', 'Update']]
    factor = ctx['authoringFactor']
    unit = ctx['restTop'] / 1.66      # Blender units per game metre (NRA target height 1.66 m)
    print('AUTHORING factor %.4f unit %.4f restTop %.3f' % (factor, unit, ctx['restTop']), flush=True)

    def SourceMatrix(flat):
        m = Matrix([flat[i::4] for i in range(4)])
        m.translation *= factor
        return convert @ m

    def Imported(pose):
        return {n: SourceMatrix(pose[n]) @ ctx['corrections'][n].inverted() for n in names}

    rest = Imported(source['rest'])
    prefix = 'Bip001 '

    def Q(part, angle):
        return Quaternion((1, 0, 0), angle) @ rest[prefix + part].to_quaternion()

    def Place(part, point, q):
        Put(Bone(part), Matrix.LocRotScale(point, q, Vector((1, 1, 1))))

    # Which side of the body is each hand on? Measure, do not assume.
    outward = {}
    for side in ['L', 'R']:
        outward[side] = 1.0 if Point(Bone(side + ' UpperArm')).x > Point(Bone('Pelvis')).x else -1.0
    print('OUTWARD', outward, flush=True)

    relaxed = json.loads((project / 'Animation/RelaxedGait/Data_RelaxedGait.json').read_text())
    specs = [('LitterBearerFrontWalk', 'Front', False), ('LitterBearerRearWalk', 'Rear', False),
             ('LitterBearerFrontStand', 'Front', True), ('LitterBearerRearStand', 'Rear', True)]
    clips, report = [], {}
    for clipId, role, idle in specs:
        spec = ROLES[role]
        raw = source['clips']['RelaxedStand' if idle else 'RelaxedWalk']
        count = len(raw['frames']) - 1
        duration = raw['duration']
        action = bpy.data.actions.new(clipId)
        action.use_fake_user = True
        arm.animation_data_create()
        arm.animation_data.action = action
        samples, floors, leans, reach, wrists = [], [], [], [], []
        for f, rawPose in enumerate(raw['frames']):
            bpy.context.scene.frame_set(f + 1)
            frame = Imported(rawPose)
            for n in names:
                Put(arm.pose.bones[n], frame[n])
            pelvis = Point(Bone('Pelvis'))
            centre = rest[prefix + 'Pelvis'].translation
            # Loaded walk: hips sway a third of the free walk, soft knees (small sink).
            pelvis.x = centre.x + (pelvis.x - centre.x) * .35
            pelvis.z -= LOAD_SINK_M * unit
            Place('Pelvis', pelvis, Q('Pelvis', spec['lean'] * .5))
            for side in ['L', 'R']:
                foot = frame[prefix + side + ' Foot'].copy()
                pole = Point(Bone(side + ' Thigh')) + Vector((0, -1, 0))
                ctx['Chain'](Bone(side + ' Thigh'), Bone(side + ' Calf'), Bone(side + ' Foot'), foot.translation, pole)
                Put(Bone(side + ' Foot'), foot)
            # Trunk: upright and quiet, a whisper of breathing, head level.
            parent = 'Pelvis'
            for part, share in [('Spine', .55), ('Spine1', .85), ('Spine2', 1), ('Neck', .30), ('Head', -.10)]:
                parentDelta = BWorld(Bone(parent)).to_quaternion() @ rest[prefix + parent].to_quaternion().inverted()
                offset = rest[prefix + part].translation - rest[prefix + parent].translation
                point = Point(Bone(parent)) + parentDelta @ offset
                angle = spec['lean'] * share + .004 * math.sin(f / count * math.tau * (1 if idle else 2)) * share
                Place(part, point, Q(part, angle))
                parent = part
            chestDelta = BWorld(Bone('Spine2')).to_quaternion() @ rest[prefix + 'Spine2'].to_quaternion().inverted()
            pelvisNow = Point(Bone('Pelvis'))
            for side in ['L', 'R']:
                clav = side + ' Clavicle'
                shoulder = side + ' UpperArm'
                for part in [clav, shoulder]:
                    point = Point(Bone('Spine2')) + chestDelta @ (rest[prefix + part].translation - rest[prefix + 'Spine2'].translation)
                    Place(part, point, chestDelta @ rest[prefix + part].to_quaternion())
                shoulderPoint = Point(Bone(shoulder))
                # Rest arm hangs from the shoulder; then solve it to the rail.
                shift = shoulderPoint - rest[prefix + shoulder].translation
                for n in names:
                    if n.startswith(prefix + side + ' ') and any(t in n for t in ['UpperArm', 'Forearm', 'Hand', 'Finger']):
                        m = rest[n].copy()
                        m.translation += shift
                        Put(arm.pose.bones[n], m)
                # Grip: game metres relative to the (runtime-centred) pelvis. Blender forward is -Y.
                gx = pelvisNow.x + outward[side] * RAIL_HALF_M * unit
                gy = pelvisNow.y + spec['hipsToGrip'] * GRIP_FROM_HIPS_M * unit   # +Y is BEHIND the body
                gz = RAIL_HEIGHT_M * unit
                target = Vector((gx, gy, gz))
                # The runtime pins the finger-root centroid (rig.Grip) on the rail, not the wrist
                # bone, so solve for that point: chain, close the fist, measure how far the
                # centroid sits from the wrist, shift the wrist target by it, repeat.
                elbowHint = shoulderPoint + Vector((outward[side] * .30, .50, -.15)) * unit
                offset = Vector((0, 0, 0))
                for _ in range(4):
                    ctx['Chain'](Bone(side + ' UpperArm'), Bone(side + ' Forearm'), Bone(side + ' Hand'),
                                 target - offset, elbowHint)
                    Update()
                    # Fist around a pole that runs front-to-back: fingers point down the forearm,
                    # curl inward (toward the body's median plane); thumb wraps naturally.
                    forearm = (Point(Bone(side + ' Hand')) - Point(Bone(side + ' Forearm'))).normalized()
                    ctx['TurnPalm'](side, forearm, Vector((-outward[side], 0, 0)))
                    ctx['CurlFingers'](side, Vector((-outward[side], 0, 0)), .95, indexAmount=.9)
                    offset = ctx['GripPoint'](side) - Point(Bone(side + ' Hand'))
                reach.append((ctx['GripPoint'](side) - target).length / unit)
                wrists.append(((Point(Bone(side + ' Hand')) - pelvisNow) / unit)[:])
            floor, _ = ctx['LowestVertex']()
            if abs(floor - .004 * factor) > .00005:
                ctx['Move'](Bone('Pelvis'), Point(Bone('Pelvis')) + Vector((0, 0, .004 * factor - floor)))
            Update()
            floors.append(ctx['LowestVertex']()[0] / factor)
            axis = Point(Bone('Neck')) - Point(Bone('Pelvis'))
            leans.append(math.degrees(math.atan2(-axis.y, axis.z)))
            samples.append(ctx['SourcePose']())
            for pb in arm.pose.bones:
                pb.keyframe_insert('location', frame=f + 1, group=pb.name)
                pb.keyframe_insert('rotation_quaternion', frame=f + 1, group=pb.name)
        tracks = []
        times = [round(duration * f / count, 6) for f in range(count + 1)]
        for i, n in enumerate(names):
            for prop, offset, width, kind in [('position', 0, 3, 'vector'), ('quaternion', 3, 4, 'quaternion')]:
                values = [v for s in samples for v in s[i * 7 + offset:i * 7 + offset + width]]
                tracks.append({'name': n.replace(' ', '_') + '.' + prop, 'type': kind, 'times': times, 'values': values})
        clips.append({'name': clipId, 'uuid': clipId, 'duration': duration, 'tracks': tracks, 'blendMode': 2500})
        report[clipId] = {'duration': duration,
                          'referenceMps': 0 if idle else relaxed['walk']['referenceSpeedMps'],
                          'contacts': {} if idle else relaxed['walk']['contacts'],
                          'floorM': [min(floors), max(floors)], 'leanDeg': [min(leans), max(leans)],
                          'railReachM': [min(reach), max(reach)]}
        print(clipId, report[clipId], flush=True)
        print('  wrist offsets from pelvis (game m) frame0:', [[round(v, 3) for v in w] for w in wrists[:2]], flush=True)
    data = {'schema': 1, 'revision': '20260930LitterBearerV1', 'skeleton': 'TengxianHumanoidV1',
            'clips': clips, 'profiles': report}
    text = json.dumps(data, separators=(',', ':'))
    (output / 'Animation_TengxianLitterBearer.json').write_text(text, encoding='utf-8')
    arm.animation_data.action = bpy.data.actions['LitterBearerFrontWalk']
    scene = bpy.context.scene
    scene.render.fps = 30
    scene.frame_start = 1
    scene.frame_end = 33
    scene.frame_set(9)
    helpers['Op'](bpy.ops.wm.save_as_mainfile, filepath=str(private / 'Scene_LitterBearer.blend'))
    print(json.dumps({'file': str(output / 'Animation_TengxianLitterBearer.json'),
                      'sha256': hashlib.sha256(text.encode()).hexdigest(), 'blend': bpy.data.filepath}))


helpers['Bake']('TengxianNra02', probe=Bake)
