"""Author/rebake the lower-left first-person Dadao stroke in owned Blender.

Set FPS_GRIP_PROJECT_ROOT to the project's Taierzhuang1938 directory and
FPS_GRIP_SOURCE to the task's OneDrive source directory. FPS_GRIP_TASK defaults
to FpsGripConformity_20261015. The new guard fields must also drive the runtime
hip pose: the exported quaternions are deltas from that exact guard.

First bake uses explicitly marked bootstrap elbow poles. Export a fresh actual
runtime trace with --trace --export-source, run Script_FpsDadaoElbowFit.py, then
rebake. Signature matching prevents poles from a different grip/stroke passing
as a fitted result. FPS_DADAO_EXPORT_ONLY preserves edited Blender curves.
"""
import bpy, hashlib, json, math, re, time
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion

phaseStarted = time.perf_counter()
phaseLog = Path(FPS_DADAO_PHASE_LOG) if globals().get('FPS_DADAO_PHASE_LOG') else None


def Phase(stage, **details):
    row = {'task': 'FpsDadaoPhysicalStroke', 'stage': stage,
           'elapsedSeconds': round(time.perf_counter() - phaseStarted, 3), **details}
    line = json.dumps(row, separators=(',', ':'))
    print(line, flush=True)
    if phaseLog:
        phaseLog.parent.mkdir(parents=True, exist_ok=True)
        with phaseLog.open('a', encoding='utf-8') as handle:
            handle.write(line + '\n')
            handle.flush()


Phase('entered', source=bpy.data.filepath, activeScene=bpy.context.scene.name,
      mode=bpy.context.mode, exportOnly=bool(globals().get('FPS_DADAO_EXPORT_ONLY', False)))
root = Path(FPS_GRIP_PROJECT_ROOT).resolve()
folder = Path(FPS_GRIP_SOURCE).resolve()
task = globals().get('FPS_GRIP_TASK', 'FpsGripConformity_20261015')
exportOnly = bool(globals().get('FPS_DADAO_EXPORT_ONLY', False))
folder.mkdir(parents=True, exist_ok=True)
assert task == 'FpsGripConformity_20261015', 'Use this task-owned stroke source'
assert not bpy.data.filepath or Path(bpy.data.filepath).resolve().parent == folder, 'Open a source copy in this task directory first'
sceneName = 'Scene_FpsDadaoConformityStroke'
scene = bpy.data.scenes.get(sceneName)
if scene is None:
    assert not exportOnly, 'No candidate controls to export'
    scene = bpy.data.scenes.new(sceneName)
    scene['BlenderMcpTask'] = task
assert scene.get('BlenderMcpTask') == task, 'Scene belongs to another task'
Phase('scene_switch_begin', target=scene.name, objects=len(scene.objects))
bpy.context.window.scene = scene
Phase('scene_switch_end', target=scene.name, objects=len(scene.objects))
scene.unit_settings.system = 'METRIC'
scene.render.fps = 120
scene.frame_start = 1
scene.frame_end = 121

# Read the production grip table, not a stale copy beside a previous .blend.
Phase('grip_table_read_begin', path=str(root / 'Data_FpsWeaponGrips.mjs'))
gripModule = (root / 'Data_FpsWeaponGrips.mjs').read_text(encoding='utf-8')
match = re.search(r'export const FPS_WEAPON_GRIPS\s*=\s*FreezeTree\((\{.*\})\);', gripModule, re.S)
assert match, 'Unrecognised production grip table'
config = json.loads(match.group(1))['Dadao']
shoulderPlanPath = root / '_blender/Data_FpsDadaoShoulderBelt.json'
shoulderPlan = json.loads(shoulderPlanPath.read_text(encoding='utf-8'))
kinematicInput = {'contacts': {key: {field: config[key][field] for field in ['position', 'rotation']}
                               for key in ['right', 'left']},
                  'shoulders': config['bodyHip']['shoulders'], 'sourceArmLength': .57233826}
kinematicSignature = hashlib.sha256(json.dumps(kinematicInput, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
assert shoulderPlan['kinematicSignature'] == kinematicSignature, 'Refit the torso motion for the current wrist contacts/body anchors'
Phase('grip_table_read_end')
planeUp = Vector((.65, .7599342076785331, 0)).normalized()
guardPosition = Vector((.160, -.200, -.530))
guardPitch = 58


def Rotation(pitch):
    theta = math.radians(pitch)
    blade = planeUp * math.sin(theta) + Vector((0, 0, -math.cos(theta)))
    y = planeUp * math.cos(theta) + Vector((0, 0, math.sin(theta)))
    z = -blade
    return Matrix((y.cross(z).normalized(), y, z)).transposed().to_quaternion()


base = Rotation(guardPitch)
baseGrip = guardPosition + base @ Vector(config['right']['position'])
# The hilt starts moving left before the blade points forward. Keeping it below
# the diagonal blade path also offsets the cut plane from the eye: simply
# translating along the same diagonal makes the blade collapse to a point.
keys = [
    (0, tuple(baseGrip), 58, (0, 0, 0), (0, 0, 0)),
    (.14, (.190, -.110, -.465), 84, (.015, .040, .015), (.035, .040, .010)),
    (.26, (.190, -.005, -.440), 105, (.020, .070, .015), (.050, .075, .005)),
    (.30, (.095, -.055, -.460), 82, (.005, .050, -.030), (.055, .060, -.025)),
    (.36, (-.080, -.270, -.480), 15, (-.015, .010, -.055), (.040, .020, -.055)),
    (.43, (-.180, -.370, -.470), -32, (-.035, .010, -.040), (.015, .025, -.035)),
    (.52, (-.200, -.390, -.450), -40, (-.030, .010, -.025), (.010, .030, -.025)),
    (.65, (-.160, -.340, -.470), -8, (-.025, .010, -.020), (.010, .030, -.020)),
    (.80, (-.040, -.220, -.515), 32, (-.010, 0, -.010), (.010, .010, -.010)),
    (1, tuple(baseGrip), 58, (0, 0, 0), (0, 0, 0)),
]


def Control(suffix):
    name = 'Animation_FpsDadaoConformity' + suffix
    obj = bpy.data.objects.get(name)
    if obj is None:
        assert not exportOnly, name
        obj = bpy.data.objects.new(name, None)
        scene.collection.objects.link(obj)
        obj['BlenderMcpTask'] = task
    assert obj.get('BlenderMcpTask') == task, name
    if not exportOnly:
        obj.animation_data_clear()
    obj.empty_display_type = 'ARROWS'
    obj.empty_display_size = .04
    return obj


controls = [Control(name) for name in ['Grip', 'Blade', 'RightShoulder', 'LeftShoulder', 'RightElbowPole', 'LeftElbowPole']]
Phase('controls_ready', count=len(controls), sceneObjects=len(scene.objects))
grip, blade, right, left, rpole, lpole = controls
# Show authored controls in Blender's Z-up world without changing their local
# game-camera values or the runtime export convention.
carrierName = 'Scene_FpsDadaoConformityControlBasis'
carrier = bpy.data.objects.get(carrierName)
if carrier is None:
    carrier = bpy.data.objects.new(carrierName, None)
    scene.collection.objects.link(carrier)
    carrier['BlenderMcpTask'] = task
assert carrier.get('BlenderMcpTask') == task
carrier.matrix_world = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
for obj in controls:
    obj.parent = carrier
    obj.matrix_parent_inverse = Matrix.Identity(4)
blade.rotation_mode = 'QUATERNION'
if not exportOnly:
    Phase('control_keys_begin', keys=len(keys))
    previous = base.copy()
    for t, p, angle, r, l in keys:
        frame = 1 + t * 120
        grip.location = p
        grip.keyframe_insert('location', frame=frame)
        q = Rotation(angle)
        q.make_compatible(previous)
        blade.rotation_quaternion = q
        blade.keyframe_insert('rotation_quaternion', frame=frame)
        previous = q.copy()
        for obj, value in [(right, r), (left, l)]:
            obj.location = value
            obj.keyframe_insert('location', frame=frame)
    for obj in controls[:4]:
        for layer in obj.animation_data.action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points:
                            key.interpolation = 'BEZIER'
                            key.handle_left_type = key.handle_right_type = 'AUTO_CLAMPED'
    Phase('control_keys_end')

    # A descending two-handed cut turns the shoulder belt with the torso.
    # Keep the measured shoulder spacing and both wrist targets fixed. These
    # editable dense local curves are sampled identically by every action.
    def LocationAt(obj, frame):
        values = list(obj.location)
        for layer in obj.animation_data.action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        if curve.data_path == 'location':
                            values[curve.array_index] = curve.evaluate(frame)
        return Vector(values)

    def Smooth(value):
        value = max(0., min(1., value))
        return value ** 3 * (value * (value * 6 - 15) + 10)

    Phase('shoulder_belt_begin')
    scale = shoulderPlan['sourceToRuntimeScale']
    rotationVector = Vector([math.radians(value) for value in shoulderPlan['rotationVectorDeg']])
    translation = Vector(shoulderPlan['translationAnchorMeters'])
    baseShoulders = [Vector(config['bodyHip']['shoulders'][key]) for key in ['right', 'left']]
    shoulderFrames = []
    for frame in range(1, 122):
        t = (frame - 1) / 120
        rise, fall = shoulderPlan['weightRise'], shoulderPlan['weightFall']
        weight = Smooth((t - rise[0]) / (rise[1] - rise[0])) * (1 - Smooth((t - fall[0]) / (fall[1] - fall[0])))
        original = [base + LocationAt(obj, frame) * scale for base, obj in zip(baseShoulders, [right, left])]
        center = (original[0] + original[1]) * .5
        rotation = Quaternion(rotationVector.normalized(), rotationVector.length * weight)
        shoulderFrames.append([(center + rotation @ (point - center) + translation * weight - base) / scale
                               for point, base in zip(original, baseShoulders)])
    for obj in [right, left]:
        obj.animation_data_clear()
    for i, values in enumerate(shoulderFrames):
        for obj, value in zip([right, left], values):
            obj.location = value
            obj.keyframe_insert('location', frame=i + 1)
    for obj in [right, left]:
        for layer in obj.animation_data.action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points:
                            key.interpolation = 'LINEAR'
    Phase('shoulder_belt_end', maximumDisplacementMm=shoulderPlan['maximumShoulderDisplacementMm'])

# Finger/hand local frames and body anchors affect the elbow solution too.
# Sampling actual edited controls makes export-only edits invalidate old poles.
controlFrames = []
Phase('sample_controls_begin', frames=121)
for frame in range(1, 122):
    if (frame - 1) % 30 == 0:
        Phase('sample_controls_frame_begin', frame=frame)
    scene.frame_set(frame)
    q = blade.rotation_quaternion.normalized() @ base.inverted()
    controlFrames.append([round(v, 7) for v in [*(grip.location - baseGrip), q.x, q.y, q.z, q.w, *right.location, *left.location]])
    if (frame - 1) % 30 == 0:
        Phase('sample_controls_frame_end', frame=frame)
Phase('sample_controls_end')
signatureInput = {'frames': controlFrames, 'grip': {key: config[key] for key in ['right', 'left', 'bodyHip']},
                  'guard': [*guardPosition, base.x, base.y, base.z, base.w]}
signature = hashlib.sha256(json.dumps(signatureInput, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
polePath = root / '_blender/Data_FpsDadaoElbowPoles.json'
poleData = json.loads(polePath.read_text()) if polePath.exists() else {}
fitted = poleData.get('strokeControlSignature') == signature
Phase('elbow_poles_begin', signature=signature, fitted=fitted)
rows = poleData['rows'] if fitted else [[t, *config['bodyHip']['elbowPoles']['right'], *config['bodyHip']['elbowPoles']['left']] for t in [0, 1]]
for obj in [rpole, lpole]:
    obj.animation_data_clear()
for row in rows:
    for obj, i in [(rpole, 1), (lpole, 4)]:
        obj.location = row[i:i + 3]
        obj.keyframe_insert('location', frame=1 + row[0] * 120)
for obj in [rpole, lpole]:
    for layer in obj.animation_data.action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:
                        key.interpolation = 'LINEAR'
Phase('elbow_poles_end', rows=len(rows))
frames = []
Phase('sample_poles_begin', frames=len(controlFrames))
for i, values in enumerate(controlFrames):
    if i % 30 == 0:
        Phase('sample_poles_frame_begin', frame=i + 1)
    scene.frame_set(i + 1)
    frames.append(values + [round(v, 7) for v in [*rpole.location, *lpole.location]])
    if i % 30 == 0:
        Phase('sample_poles_frame_end', frame=i + 1)
Phase('sample_poles_end')
# Export Three.js intrinsic YXZ explicitly. Blender Euler convention is not an
# implicit contract: runtime reconstruction is Ry(y) @ Rx(x) @ Rz(z).
guardMatrix = base.to_matrix()
guardEuler = [math.asin(max(-1, min(1, -guardMatrix[1][2]))),
              math.atan2(guardMatrix[0][2], guardMatrix[2][2]),
              math.atan2(guardMatrix[1][0], guardMatrix[1][1])]
data = {'schema': 1, 'source': 'BlenderDadaoPowerSwing', 'sourceArmLength': .57233826,
        'authoringTask': task, 'strokeControlSignature': signature,
        'guardWeaponPosition': list(guardPosition), 'guardWeaponRotation': list(guardEuler),
        'cutPlaneUp': list(planeUp), 'elbowFitStatus': 'fitted' if fitted else 'bootstrap',
        'shoulderBelt': {key: shoulderPlan[key] for key in ['rotationVectorDeg', 'translationAnchorMeters', 'weightRise', 'weightFall', 'kinematicSignature']},
        'modelRotation': [0, 0, math.pi], 'sourceEdgeDirection': [0, 1, 0],
        'defensiveVideoRotationScale': .15, 'defensivePoseRotationScale': 0,
        'compactPositionScale': .9, 'compactRotationScale': .9,
        'frameCount': 121, 'cutStart': .26, 'cutEnd': .46, 'frames': frames}
Phase('runtime_module_write_begin')
(root / 'Data_FpsDadaoSwing.mjs').write_text('// Blender-authored lower-left stroke; rebuild with _blender/Script_FpsDadaoPhysicalStroke.py.\nexport const FPS_DADAO_SWING = ' + json.dumps(data, separators=(',', ':')) + ';\n', encoding='utf-8')
Phase('runtime_module_write_end')
Phase('source_json_write_begin')
(folder / 'Data_FpsDadaoStroke.json').write_text(json.dumps(data, indent=2), encoding='utf-8')
Phase('source_json_write_end')
for name, t in [('Guard', 0), ('Load', .26), ('Cut', .36), ('Follow', .52), ('Return', .80), ('GuardEnd', 1)]:
    marker = scene.timeline_markers.get(name) or scene.timeline_markers.new(name)
    marker.frame = round(1 + 120 * t)
scene['StrokeControlSignature'] = signature
scene['ElbowFitStatus'] = data['elbowFitStatus']
scene['GuardWeaponPosition'] = list(guardPosition)
scene['GuardWeaponRotationYXZ'] = list(guardEuler)
scene['CutPlaneUp'] = list(planeUp)
scriptName = 'Script_FpsDadaoPhysicalStroke.py'
text = bpy.data.texts.get(scriptName) or bpy.data.texts.new(scriptName)
text.clear()
text.write((root / '_blender' / scriptName).read_text(encoding='utf-8'))
Phase('guard_seek_begin')
scene.frame_set(1)
Phase('guard_seek_end')
Phase('source_blend_save_begin', path=str(folder / 'Animation_FpsGripConformity.blend'), compress=True)
bpy.ops.wm.save_as_mainfile(filepath=str(folder / 'Animation_FpsGripConformity.blend'), compress=True)
Phase('source_blend_save_end')
print(json.dumps({'source': bpy.data.filepath, 'strokeFrames': len(frames), 'signature': signature,
                  'elbowFitStatus': data['elbowFitStatus'], 'guardWeaponPosition': list(guardPosition),
                  'guardWeaponRotation': list(guardEuler)}), flush=True)
