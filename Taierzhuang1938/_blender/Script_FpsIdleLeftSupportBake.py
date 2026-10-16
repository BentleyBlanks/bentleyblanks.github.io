"""Bake one captured HanYang Idle Action, then merge only reviewed tracks.

Run in an independently copied Animation_HanYangHands.blend. The copy's parent
directory and scene['BlenderMcpTask'] must both equal FPS_IDLE_SUPPORT_TASK.
Required globals: FPS_PROJECT_ROOT, FPS_IDLE_SUPPORT_INPUT, FPS_IDLE_SUPPORT_TASK.

The capture uses the same native model reference as Data_HanYangHoldingPose:
Three.js column-major arms.root.inverse * bone.world matrices, plus local p/q.
This script authors real Blender pose/control/preview keyframes in one existing
Idle Action and calls the original ExportFpsAnimation. The exporter writes only
the two JSON files in the copy's Stage directory. Missing scope defaults to
LeftSupport (19 left bones plus handLeft/contactLeft); RightIndexRing selects
only six right index/ring bones and no controls. All other fields stay exact.
"""

import copy
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import re


ACTION_NAME = 'Animation_FpsHanYangIdle'
ASSET_NAME = 'Data_FpsHanYangAnimations.json'
MANIFEST_NAME = 'Data_FpsAnimationManifest.json'
SELECTED_CONTROLS = ('handLeft', 'contactLeft')
NATIVE_POSITION_TOLERANCE = 5e-4
ROTATION_TOLERANCE_RAD = 2e-5


def normalize(name):
    return re.sub('[^a-z0-9]', '', name.lower())


def sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def finite_vector(value, width, label):
    assert isinstance(value, list) and len(value) == width, (label, width)
    assert all(type(n) in (int, float) and math.isfinite(n) for n in value), label


def sample(track, index, count):
    assert len(track) in (7, 7 * count), 'A packed transform is constant or full-rate'
    return track[:7] if len(track) == 7 else track[7 * index:7 * index + 7]


def quaternion_error(a, b):
    an = math.sqrt(sum(v * v for v in a))
    bn = math.sqrt(sum(v * v for v in b))
    assert an > 0 and bn > 0
    dot = abs(sum(x * y for x, y in zip(a, b)) / (an * bn))
    return 2 * math.acos(min(1.0, max(-1.0, dot)))


def normalized_loop_track(track, count, label, finger_position=None):
    """Normalize only a newly baked track; never process protected channels."""
    values = []
    for index in range(count):
        row = sample(track, index, count)
        finite_vector(row, 7, label)
        q = row[3:]
        length = math.sqrt(sum(v * v for v in q))
        assert abs(length - 1) < 2e-5, (label, 'non-unit baked quaternion')
        q = [v / length for v in q]
        if values and sum(a * b for a, b in zip(values[-1][3:], q)) < 0:
            q = [-v for v in q]
        position = list(finger_position) if finger_position is not None else row[:3]
        values.append([*position, *q])
    assert max(abs(a - b) for a, b in zip(values[0][:3], values[-1][:3])) <= NATIVE_POSITION_TOLERANCE, (label, 'non-looping position')
    assert quaternion_error(values[0][3:], values[-1][3:]) <= ROTATION_TOLERANCE_RAD, (label, 'non-looping rotation')
    # Close only numerical endpoint noise after proving that the capture loops.
    values[-1] = list(values[0])
    if max(abs(a - b) for row in values for a, b in zip(values[0], row)) < 1e-7:
        values = values[:1]
    result = [n for row in values for n in row]
    for index in range(1 if len(result) == 7 else count):
        q = sample(result, index, count)[3:]
        assert abs(sum(v * v for v in q) - 1) < 1e-12, label
    return result


def capture_selection(capture, names):
    """Allow only the two reviewed publication scopes, never an arbitrary list."""
    scope = capture.get('scope', 'LeftSupport')
    if scope == 'LeftSupport':
        pattern = r'l(clavicle|upperarm|forearm|hand|finger[0-4][12]?)$'
        expected_count, selected_controls = 19, SELECTED_CONTROLS
    elif scope == 'RightIndexRing':
        pattern = r'rfinger[13][12]?$'
        expected_count, selected_controls = 6, ()
    else:
        raise AssertionError(('Unsupported capture publication scope', scope))
    selected = [index for index, name in enumerate(names) if re.search(pattern, normalize(name))]
    assert len(selected) == expected_count, (scope, 'Exact reviewed bone inventory')
    assert len(capture['selectedBones']) == expected_count
    assert set(capture['selectedBones']) == {names[index] for index in selected}, (scope, 'Exact reviewed bone selection')
    assert capture.get('selectedControls', list(selected_controls)) == list(selected_controls), (scope, 'Exact reviewed control selection')
    return scope, selected, selected_controls


def protected_fields(document, selected_indices, selected_controls=SELECTED_CONTROLS):
    result = copy.deepcopy(document)
    clip = result['clips']['Idle']
    for index in selected_indices:
        clip['bones'][index] = None
    for key in selected_controls:
        clip['controls'][key] = None
    return result


def validate_capture(capture, baseline):
    assert capture['version'] == 1
    assert capture['fps'] == 60 and capture['duration'] == 4
    names = baseline['bones']
    assert len(names) == 53 and len(set(map(normalize, names))) == 53
    assert capture['boneNames'] == names, 'Capture and baseline bone order must match'
    assert list(baseline['clips']) == ['Idle'], 'Only the existing single Idle is authorized'
    clip = baseline['clips']['Idle']
    assert clip['duration'] == 4 and clip['count'] == 241 and len(clip['bones']) == 53
    _, selected, selected_controls = capture_selection(capture, names)
    frames = capture['frames']
    assert len(frames) == 241
    control_keys = set(clip['controls'])
    assert set(selected_controls) <= control_keys
    for index, frame in enumerate(frames):
        assert abs(frame['time'] - index / 60) < 1e-8
        assert len(frame['bones']) == 53
        assert [row['name'] for row in frame['bones']] == names
        finite_vector(frame['weapon'], 16, 'weapon matrix')
        assert set(frame['controls']) == control_keys, 'Capture must retain every existing control'
        for key, control in frame['controls'].items():
            finite_vector(control['transform'], 7, key)
            assert type(control['visible']) is bool
            assert control['visible'] == clip['visible'][key][index], 'Visibility is protected, not re-authored'
        for bone_index, row in enumerate(frame['bones']):
            finite_vector(row['matrix'], 16, row['name'] + ' matrix')
            finite_vector(row['local'], 7, row['name'] + ' local')
            assert abs(sum(v * v for v in row['local'][3:]) - 1) < 2e-5
            if 'finger' in normalize(row['name']):
                original_position = sample(clip['bones'][bone_index], 0, 241)[:3]
                assert max(abs(a - b) for a, b in zip(row['local'][:3], original_position)) <= 1e-5, (row['name'], 'Finger reach must retain the baseline rest translation')
    for bone_index in selected:
        a, b = frames[0]['bones'][bone_index]['local'], frames[-1]['bones'][bone_index]['local']
        assert max(abs(x - y) for x, y in zip(a[:3], b[:3])) <= NATIVE_POSITION_TOLERANCE
        assert quaternion_error(a[3:], b[3:]) <= ROTATION_TOLERANCE_RAD
    for key in selected_controls:
        a, b = frames[0]['controls'][key]['transform'], frames[-1]['controls'][key]['transform']
        assert max(abs(x - y) for x, y in zip(a[:3], b[:3])) <= 1e-6
        assert quaternion_error(a[3:], b[3:]) <= ROTATION_TOLERANCE_RAD
    return selected


def bake_idle_left_support(project_root, input_path, task):
    import bpy
    from mathutils import Matrix, Quaternion, Vector

    project = Path(project_root).resolve()
    capture_path = Path(input_path).resolve()
    source_path = Path(bpy.data.filepath).resolve()
    folder = source_path.parent
    scene = bpy.context.scene
    assert task and folder.name == task, 'Use a separately named source-copy directory'
    assert scene.get('BlenderMcpTask') == task, 'Only this task-owned Blender source may change'
    assert folder.name != 'HanYangHandContact_20260911', 'The original source remains archived'
    assert scene.get('task') == 'HanYangHands_20260910'
    assert source_path.is_file() and source_path.suffix.lower() == '.blend'
    capture_raw = capture_path.read_bytes()
    capture = json.loads(capture_raw.decode('utf-8-sig'))
    baseline_path = Path(capture['baselinePath']).resolve()
    baseline_raw = baseline_path.read_bytes()
    assert sha256(baseline_raw) == capture['baselineSha256'], 'Exact capture baseline hash'
    baseline = json.loads(baseline_raw.decode('utf-8-sig'))
    selected = validate_capture(capture, baseline)
    scope, _, selected_controls = capture_selection(capture, baseline['bones'])
    asset = project / 'Animation/FirstPerson' / ASSET_NAME
    manifest_path = asset.with_name(MANIFEST_NAME)
    assert sha256(asset.read_bytes()) == capture['baselineSha256'], 'Production Idle changed since this capture'
    manifest_raw = manifest_path.read_bytes()
    manifest = json.loads(manifest_raw.decode('utf-8-sig'))
    assert manifest['HanYang']['clips'] == 1

    metadata = json.loads(scene['fpsAnimationMetadata'])
    assert len(metadata['bones']) == 53
    assert [normalize(entry['name']) for entry in metadata['bones']] == list(map(normalize, baseline['bones']))
    rig = bpy.data.objects['Rig_FpsArmsNraSkeletal01']
    bone_map = {normalize(bone.name): bone for bone in rig.pose.bones}
    bones = [bone_map[normalize(name)] for name in baseline['bones']]
    controls = {key: bpy.data.objects.get('Animation_Control_' + key) for key in baseline['clips']['Idle']['controls']}
    assert all(controls.values()), 'All captured controls already exist in the source'
    weapon = bpy.data.objects.get('Preview_HanYang_weapon')
    assert weapon is not None
    managed = [rig, *controls.values(), weapon]
    assert len({obj.as_pointer() for obj in managed}) == len(managed)
    previous_action = bpy.data.actions.get(ACTION_NAME)
    assert previous_action is not None, 'Only the existing authorized Idle may be rebuilt'
    other_actions = set(bpy.data.actions.keys()) - {ACTION_NAME}
    for obj in bpy.data.objects:
        if obj.animation_data and obj.animation_data.action == previous_action:
            assert obj in managed, ('Unexpected user of the previous Idle', obj.name)
    for obj in managed:
        animation = obj.animation_data
        assert animation is None or animation.action in (None, previous_action), ('Another Action owns this object', obj.name)
        assert animation is None or all(track.mute for track in animation.nla_tracks), 'Mute NLA before baking the selected Action'

    read_matrix = lambda values: Matrix([values[i::4] for i in range(4)])
    convert = Matrix.Rotation(math.pi / 2, 4, 'X')
    inverse_convert = convert.inverted()
    inverse_rig = rig.matrix_world.inverted()
    corrections = [bone.bone.matrix_local.inverted() @ inverse_rig @ convert @ read_matrix(entry['world'])
                   for bone, entry in zip(bones, metadata['bones'])]
    parents = [entry['parent'] for entry in metadata['bones']]
    for index, parent in enumerate(parents):
        assert type(parent) is int and -1 <= parent < index, 'Parent-first native hierarchy'
        if parent >= 0:
            assert bones[index].parent == bones[parent], 'Source/native hierarchy mismatch'

    # Validate world/local references before replacing any source Action.
    input_matrix_local_position_error = 0
    input_matrix_local_rotation_error = 0
    input_scale_error = 0
    for frame in capture['frames']:
        worlds = [read_matrix(row['matrix']) for row in frame['bones']]
        for index, row in enumerate(frame['bones']):
            parent = read_matrix(metadata['bones'][index]['parentWorld']) if parents[index] < 0 else worlds[parents[index]]
            position, rotation, scale = (parent.inverted() @ worlds[index]).decompose()
            position_error = max(abs(a - b) for a, b in zip(position, row['local'][:3]))
            rotation_error = quaternion_error([rotation.x, rotation.y, rotation.z, rotation.w], row['local'][3:])
            input_matrix_local_position_error = max(input_matrix_local_position_error, position_error)
            input_matrix_local_rotation_error = max(input_matrix_local_rotation_error, rotation_error)
            input_scale_error = max(input_scale_error, *(abs(v - 1) for v in scale))
    assert input_matrix_local_position_error <= NATIVE_POSITION_TOLERANCE, 'Capture native matrix and local position disagree'
    assert input_matrix_local_rotation_error <= ROTATION_TOLERANCE_RAD, 'Capture native matrix and local rotation disagree'
    assert input_scale_error < 2e-5, 'Transform tracks cannot hide bone stretching'

    for obj in managed:
        if obj.animation_data:
            obj.animation_data.action = None
    bpy.data.actions.remove(previous_action)
    action = bpy.data.actions.new(ACTION_NAME)
    action.use_fake_user = True
    action['duration'] = 4.0
    action['authorizedScope'] = 'One captured HanYang Idle; ' + scope + ' publication only'
    for obj in managed:
        slot = action.slots.new(id_type='OBJECT', name=obj.name)
        obj.animation_data_create()
        obj.animation_data.action = action
        obj.animation_data.action_slot = slot
        obj['fpsIdleSlot'] = slot.identifier
        # The imported armature object's Euler rotation carries the native FBX
        # reference. Its object transform is not animated by this operation.
        if obj != rig:
            obj.rotation_mode = 'QUATERNION'
    rig.data.pose_position = 'POSE'
    previous_quaternions = {}

    def key_transform(obj, position, rotation, scale, frame, key):
        rotation = rotation.normalized()
        if key in previous_quaternions and rotation.dot(previous_quaternions[key]) < 0:
            rotation.negate()
        previous_quaternions[key] = rotation.copy()
        obj.location = position
        obj.rotation_quaternion = rotation
        obj.scale = scale
        for channel in ('location', 'rotation_quaternion', 'scale'):
            obj.keyframe_insert(channel, frame=frame, group=key)

    source_basis_scale_error = 0
    for index, frame in enumerate(capture['frames']):
        frame_number = index + 1
        scene.frame_set(frame_number)
        native_worlds = [read_matrix(row['matrix']) for row in frame['bones']]
        matrices = [inverse_rig @ convert @ world @ correction.inverted()
                    for world, correction in zip(native_worlds, corrections)]
        quantized_parent_poses = []
        for bone_index, bone in enumerate(bones):
            parent = parents[bone_index]
            kwargs = {} if parent < 0 else {'parent_matrix': quantized_parent_poses[parent], 'parent_matrix_local': bone.parent.bone.matrix_local}
            basis = bone.bone.convert_local_to_pose(matrices[bone_index], bone.bone.matrix_local, invert=True, **kwargs)
            position, rotation, scale = basis.decompose()
            source_basis_scale_error = max(source_basis_scale_error, *(abs(v - 1) for v in scale))
            bone.rotation_mode = 'QUATERNION'
            key_transform(bone, position, rotation, scale, frame_number, bone.name)
            # Propagate the pose rebuilt from the actual float32 channels. An
            # ideal target parent differs slightly from Blender's stored TRS;
            # reusing it at every child accumulates position/scale roundoff.
            quantized_parent_poses.append(bone.bone.convert_local_to_pose(
                bone.matrix_basis, bone.bone.matrix_local, **kwargs))
        for key, obj in controls.items():
            row = frame['controls'][key]
            values = row['transform']
            key_transform(obj, Vector(values[:3]), Quaternion((values[6], *values[3:6])), Vector((1, 1, 1)), frame_number, obj.name)
            obj.hide_viewport = not row['visible']
            obj.hide_render = not row['visible']
            obj.keyframe_insert('hide_viewport', frame=frame_number)
            obj.keyframe_insert('hide_render', frame=frame_number)
        bpy.context.view_layer.update()
        weapon.matrix_world = convert @ read_matrix(frame['weapon'])
        position, rotation, scale = weapon.matrix_basis.decompose()
        key_transform(weapon, position, rotation, scale, frame_number, weapon.name)
    assert source_basis_scale_error < 2e-4, 'Source replay must retain native bone lengths'
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for keyframe in curve.keyframe_points:
                        keyframe.interpolation = 'CONSTANT' if curve.data_path in ('hide_viewport', 'hide_render') else 'LINEAR'
    scene.render.fps = 60
    scene.render.fps_base = 1
    scene.frame_start = 1
    scene.frame_end = 241
    assert tuple(action.frame_range) == (1.0, 241.0)
    assert set(bpy.data.actions.keys()) == other_actions | {ACTION_NAME}, 'No other Action was created or removed'

    # Real evaluated Action parity, independently of the JSON exporter.
    evaluated_world_error = 0
    evaluated_control_error = 0
    for index, frame in enumerate(capture['frames']):
        scene.frame_set(index + 1)
        bpy.context.view_layer.update()
        for bone, correction, row in zip(bones, corrections, frame['bones']):
            actual = inverse_convert @ rig.matrix_world @ bone.matrix @ correction
            expected = read_matrix(row['matrix'])
            evaluated_world_error = max(evaluated_world_error, *(abs(actual[r][c] - expected[r][c]) for r in range(4) for c in range(4)))
        for key, obj in controls.items():
            position, rotation, _ = obj.matrix_basis.decompose()
            values = [*position, rotation.x, rotation.y, rotation.z, rotation.w]
            expected = frame['controls'][key]['transform']
            evaluated_control_error = max(evaluated_control_error, *(abs(a - b) for a, b in zip(values[:3], expected[:3])))
            assert quaternion_error(values[3:], expected[3:]) <= ROTATION_TOLERANCE_RAD
    assert evaluated_world_error <= 1e-3, ('Evaluated Blender Action differs from the native capture', evaluated_world_error)
    assert evaluated_control_error <= 1e-6

    # The original exporter reads static finger positions and metadata channels.
    scene['fpsHoldingLocalPositions'] = json.dumps({name: sample(baseline['clips']['Idle']['bones'][index], 0, 241)[:3]
                                                    for index, name in enumerate(baseline['bones'])})
    original = copy.deepcopy(metadata['weapons']['HanYang']['clips']['Idle'])
    original['duration'] = 4.0
    original['frames'] = [{'controls': {key: sample(track, index, 241) for key, track in baseline['clips']['Idle']['controls'].items()},
                           'visible': {key: rows[index] for key, rows in baseline['clips']['Idle']['visible'].items()},
                           'state': baseline['clips']['Idle']['state'][index],
                           'contact': baseline['clips']['Idle']['contact'][index]}
                          for index in range(241)]
    metadata['weapons']['HanYang']['clips']['Idle'] = original
    metadata['fps'] = 60
    scene['fpsAnimationMetadata'] = json.dumps(metadata, separators=(',', ':'))

    stage = folder / 'Stage_FpsIdleLeftSupport'
    stage_files = {stage / 'Animation/FirstPerson' / ASSET_NAME, stage / 'Animation/FirstPerson' / MANIFEST_NAME}
    if stage.exists():
        assert {path for path in stage.rglob('*') if path.is_file()} <= stage_files, 'This stage is reserved for exactly two exporter JSON files'
    stage_asset = stage / 'Animation/FirstPerson' / ASSET_NAME
    stage_asset.parent.mkdir(parents=True, exist_ok=True)
    stage_asset.write_bytes(baseline_raw)
    stage_manifest = stage_asset.with_name(MANIFEST_NAME)
    stage_manifest.write_bytes(manifest_raw)
    exporter_path = project / '_import/Script_FpsAnimationBake.py'
    spec = importlib.util.spec_from_file_location('FpsIdleLeftSupportOriginalExporter', exporter_path)
    exporter = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(exporter)
    exported = exporter.ExportFpsAnimation(str(stage), 'Idle')
    assert exported['updatedClip'] == 'Idle' and exported['newActions'] == 0 and exported['frames'] == 241
    assert {path for path in stage.rglob('*') if path.is_file()} == stage_files
    staged = json.loads(stage_asset.read_text(encoding='utf-8'))
    assert staged['bones'] == baseline['bones'] and list(staged['clips']) == ['Idle']
    new_clip = staged['clips']['Idle']
    assert new_clip['duration'] == 4 and new_clip['count'] == 241
    result = copy.deepcopy(baseline)
    output_clip = result['clips']['Idle']
    baked_local_position_error = 0
    baked_local_rotation_error = 0
    for bone_index in selected:
        name = baseline['bones'][bone_index]
        track = new_clip['bones'][bone_index]
        finger_position = sample(baseline['clips']['Idle']['bones'][bone_index], 0, 241)[:3] if 'finger' in normalize(name) else None
        track = normalized_loop_track(track, 241, name, finger_position)
        output_clip['bones'][bone_index] = track
        for index, frame in enumerate(capture['frames']):
            values = sample(track, index, 241)
            expected = frame['bones'][bone_index]['local']
            baked_local_position_error = max(baked_local_position_error, *(abs(a - b) for a, b in zip(values[:3], expected[:3])))
            baked_local_rotation_error = max(baked_local_rotation_error, quaternion_error(values[3:], expected[3:]))
    for key in selected_controls:
        output_clip['controls'][key] = normalized_loop_track(new_clip['controls'][key], 241, key)
        for index, frame in enumerate(capture['frames']):
            actual = sample(output_clip['controls'][key], index, 241)
            expected = frame['controls'][key]['transform']
            assert max(abs(a - b) for a, b in zip(actual[:3], expected[:3])) <= 1e-6
            assert quaternion_error(actual[3:], expected[3:]) <= ROTATION_TOLERANCE_RAD
    assert baked_local_position_error <= NATIVE_POSITION_TOLERANCE
    assert baked_local_rotation_error <= ROTATION_TOLERANCE_RAD
    assert protected_fields(result, selected, selected_controls) == protected_fields(baseline, selected, selected_controls), 'Every non-selected JSON field stays exact'
    output_raw = json.dumps(result, separators=(',', ':'), allow_nan=False).encode('utf-8')
    final_manifest = copy.deepcopy(manifest)
    final_manifest['HanYang']['bytes'] = len(output_raw)
    expected_manifest = copy.deepcopy(final_manifest)
    expected_manifest['HanYang']['bytes'] = manifest['HanYang']['bytes']
    assert expected_manifest == manifest, 'Only the HanYang byte count may change'

    # Recheck concurrency immediately before publishing the local artifact.
    assert sha256(asset.read_bytes()) == capture['baselineSha256']
    assert manifest_path.read_bytes() == manifest_raw
    temporary = asset.with_suffix('.json.tmp')
    temporary.write_bytes(output_raw)
    temporary.replace(asset)
    manifest_path.write_text(json.dumps(final_manifest, indent=2) + '\n', encoding='utf-8')
    report = {'version': 1, 'source': str(source_path), 'task': task, 'action': ACTION_NAME, 'scope': scope,
              'clipsCreated': 0, 'frames': 241, 'fps': 60, 'duration': 4,
              'keyedBones': 53, 'keyedControls': list(controls), 'actionSlots': len(action.slots),
              'parentQuantizationMode': 'ForwardFromStoredBasis',
              'selectedBones': [baseline['bones'][index] for index in selected], 'selectedControls': list(selected_controls),
              'input': str(capture_path), 'inputSha256': sha256(capture_raw),
              'baseline': str(baseline_path), 'baselineSha256': sha256(baseline_raw),
              'output': str(asset), 'outputSha256': sha256(output_raw),
              'stage': str(stage), 'stageSha256': sha256(stage_asset.read_bytes()),
              'originalExporter': str(exporter_path), 'originalExporterSha256': sha256(exporter_path.read_bytes()),
              'inputMatrixLocalPositionMaximumError': input_matrix_local_position_error,
              'inputMatrixLocalRotationMaximumErrorRad': input_matrix_local_rotation_error,
              'inputLocalScaleMaximumError': input_scale_error,
              'sourceBasisScaleMaximumError': source_basis_scale_error,
              'evaluatedNativeWorldMatrixMaximumError': evaluated_world_error,
              'evaluatedControlPositionMaximumError': evaluated_control_error,
              'bakedLocalPositionMaximumError': baked_local_position_error,
              'bakedLocalRotationMaximumErrorRad': baked_local_rotation_error,
              'protectedFieldsExact': True, 'fingerRestTranslationsExact': True,
              'newTracksNormalizedAndLooped': True, 'sourceActionEvaluatedAtEveryFrame': True,
              'geometrySourceSeparate': True,
              'geometrySourceNote': 'This is the editable Action source. Current scanned hand geometry and skin-weight source remain separately archived; no GLB preview import or geometry parity claim is made here.'}
    scene['FpsIdleLeftSupportInputSha256'] = sha256(capture_raw)
    scene['FpsIdleLeftSupportBaselineSha256'] = sha256(baseline_raw)
    scene['FpsIdleLeftSupportOutputSha256'] = sha256(output_raw)
    scene.frame_set(1)
    bpy.context.view_layer.update()

    # Save the complete editable Action before touching any Text datablock.
    # copy=True leaves the active source filepath unchanged. If later archive
    # preparation fails, this checkpoint recovers all authored slots/keyframes
    # without replaying the capture or restoring the production baseline.
    checkpoint = source_path.with_name(source_path.stem + '_ActionCheckpoint.blend')
    bpy.ops.wm.save_as_mainfile(filepath=str(checkpoint), compress=True, copy=True)
    assert Path(bpy.data.filepath).resolve() == source_path
    assert checkpoint.is_file()
    report['actionCheckpoint'] = str(checkpoint)
    report['actionCheckpointSha256'] = sha256(checkpoint.read_bytes())
    report['actionCheckpointSavedBeforeTextArchives'] = True
    report['archiveDiskEncoding'] = 'Exact original bytes, including any UTF-8 BOM'
    report['archiveTextEncoding'] = 'Readable JSON with bounded lines; decoded JSON is identical to the raw disk document'
    report['archiveJsonMaximumLineLength'] = 512
    report_text = json.dumps(report, indent=2, allow_nan=False) + '\n'
    archives = {'Data_FpsIdleLeftSupportInput.json': capture_raw,
                'Data_FpsIdleLeftSupportBaseline.json': baseline_raw,
                'Data_FpsIdleLeftSupportBaselineManifest.json': manifest_raw,
                'Script_FpsIdleLeftSupportBake.py': (project / '_blender/Script_FpsIdleLeftSupportBake.py').read_bytes(),
                'Data_FpsIdleLeftSupportBakeReport.json': report_text.encode('utf-8'),
                ASSET_NAME: output_raw}
    readable, archive_hashes = {}, {}
    for name, raw in archives.items():
        content = raw.decode('utf-8-sig')
        is_json = name.endswith('.json')
        if is_json:
            document = json.loads(content)
            content = json.dumps(document, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
            assert json.loads(content) == document
        lines = content.splitlines()
        maximum_line = max(map(len, lines), default=0)
        assert maximum_line <= (512 if is_json else 4096), (name, 'Refusing a long-line Text archive', maximum_line)
        readable[name] = content
        archive_hashes[name] = {'rawSha256': sha256(raw), 'rawBytes': len(raw),
                                'embeddedUtf8Sha256': sha256(content.encode('utf-8')),
                                'embeddedLines': len(lines), 'maximumLineLength': maximum_line,
                                'decodedJsonEquivalent': is_json}

    # Persist every raw archive before embedding anything. Text.write on a
    # multi-megabyte single line is pathologically slow in Blender; never send
    # the raw packed JSON to it. from_string replaces a bounded-line document.
    for name, raw in archives.items():
        (folder / name).write_bytes(raw)
        assert sha256((folder / name).read_bytes()) == archive_hashes[name]['rawSha256']
    hashes_name = 'Data_FpsIdleLeftSupportArchiveHashes.json'
    hashes_raw = (json.dumps(archive_hashes, indent=2, allow_nan=False) + '\n').encode('utf-8')
    (folder / hashes_name).write_bytes(hashes_raw)
    for name, content in readable.items():
        text_block = bpy.data.texts.get(name) or bpy.data.texts.new(name)
        text_block.from_string(content)
        text_block['FpsIdleSupportRawSha256'] = archive_hashes[name]['rawSha256']
        text_block['FpsIdleSupportEmbeddedUtf8Sha256'] = archive_hashes[name]['embeddedUtf8Sha256']
        text_block['FpsIdleSupportMaximumLineLength'] = archive_hashes[name]['maximumLineLength']
    hashes_text = bpy.data.texts.get(hashes_name) or bpy.data.texts.new(hashes_name)
    hashes_text.from_string(hashes_raw.decode('utf-8'))
    hashes_text['FpsIdleSupportRawSha256'] = sha256(hashes_raw)
    scene['FpsIdleLeftSupportArchiveHashesSha256'] = sha256(hashes_raw)
    bpy.ops.wm.save_as_mainfile(filepath=str(source_path), compress=True)
    assert set(bpy.data.actions.keys()) == other_actions | {ACTION_NAME}
    print(json.dumps(report, separators=(',', ':')))
    return report


if 'FPS_PROJECT_ROOT' in globals():
    bake_idle_left_support(FPS_PROJECT_ROOT, FPS_IDLE_SUPPORT_INPUT, FPS_IDLE_SUPPORT_TASK)
