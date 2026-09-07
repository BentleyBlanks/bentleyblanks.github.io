"""First-level contact pilot. Reuse V7; never alter video or recovery caches.

Blender --background --python-exit-code 1 --python this.py -- --root LIBRARY
The body/lower limbs are V7; arm contact and fingers are authored corrections.
Outputs remain in the private motion library until visual acceptance.
"""
from pathlib import Path
import argparse, copy, hashlib, json, math, sys
import bpy
import numpy as np
from mathutils import Vector, Matrix


def Main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--group', default='FirstLevelCarryV9')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    root = args.root.resolve()
    out = root / 'Models' / args.group
    blends = root / 'Blender' / args.group
    out.mkdir(parents=True, exist_ok=True)
    blends.mkdir(parents=True, exist_ok=True)
    catalog = json.loads((root / 'Preview/Data_Catalog.json').read_text(encoding='utf-8'))
    sources = {}
    for role in ['Front', 'Rear']:
        entry = next(a for a in catalog['actions'] if a['id'] == 'CarryStretcher' + role)
        variant = next(v for v in entry['variants'] if v['id'] == 'Nra-v7-CarryStretcher' + role)
        raw = json.loads((root / variant['review']['recoveryTracks'][0]['path']).read_text(encoding='utf-8'))
        cache = root / raw['sourceCache']
        assert hashlib.sha256(cache.read_bytes()).hexdigest() == raw['sourceCacheSha256']
        with np.load(cache) as data:
            assert np.array_equal(np.array(raw['positions']), data['worldJoints'])
        sources[role] = dict(variant=variant, raw=raw,
            glbSha256=hashlib.sha256((root / variant['path']).read_bytes()).hexdigest(),
            videoSha256=hashlib.sha256((root / variant['review']['sourceVideo']).read_bytes()).hexdigest())

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = 'Scene_FirstLevelOriginalRigCarry'
    scene.render.fps = 60
    scene.frame_start = 1
    scene.frame_end = 121
    rigs = {}
    objects = {}
    for role in sources:
        before = set(scene.objects)
        bpy.ops.import_scene.gltf(filepath=str(root / sources[role]['variant']['path']))
        imported = set(scene.objects) - before
        for obj in list(imported):
            if obj.name.startswith('Prop_'):
                imported.remove(obj)
                bpy.data.objects.remove(obj, do_unlink=True)
        arm = next(o for o in imported if o.type == 'ARMATURE')
        for obj in imported:
            obj.name = role + '_' + obj.name
        rigs[role] = arm
        objects[role] = list(imported)
    # Source GLB starts at 0. Preserve the complete two-second cycle.
    for action in bpy.data.actions:
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points:
                            key.co.x += 1
                        curve.update()

    def Bone(arm, part):
        return next(b for b in arm.pose.bones if b.name.replace('_', ' ').endswith(' ' + part))

    def World(arm, bone):
        return arm.matrix_world @ bone.matrix

    def Point(arm, part):
        return World(arm, Bone(arm, part)).translation

    samples = {}
    objectSamples = {}
    for role, arm in rigs.items():
        frames = []
        transforms = []
        for frame in range(1, 122):
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            frames.append({b.name: b.matrix_basis.copy() for b in arm.pose.bones})
            transforms.append(arm.matrix_basis.copy())
        samples[role] = frames
        objectSamples[role] = transforms

    # Work in Blender Z-up. Original GLB +Z faces Blender -Y. The game bridge
    # rotates the actor once by pi; this bake does not add another rotation.
    scene.frame_set(1)
    bpy.context.view_layer.update()
    calibration = {}
    for role, arm in rigs.items():
        calibration[role] = {}
        for side in ['L', 'R']:
            hand = Bone(arm, side + ' Hand')
            inv = (arm.matrix_world @ hand.bone.matrix_local).inverted()
            fingers = [Bone(arm, side + ' Finger' + str(i)) for i in range(1, 5)]
            tips = [inv @ (arm.matrix_world @ b.bone.matrix_local).translation for b in fingers]
            forward = sum(tips, Vector()) / 4
            across = tips[0] - tips[-1]
            if side == 'L':
                across.negate()
            dorsal = forward.cross(across).normalized()
            f = forward.normalized()
            d = (dorsal - f * dorsal.dot(f)).normalized()
            native = Matrix((f, d, f.cross(d))).transposed()
            sign = 1 if (arm.matrix_world @ hand.bone.matrix_local).translation.x > 0 else -1
            desiredF = Vector((0, 0, -1))
            desiredD = Vector((sign, 0, 0))
            wanted = Matrix((desiredF, desiredD, desiredF.cross(desiredD))).transposed()
            orientation = wanted @ native.transposed()
            handScale = World(arm, hand).to_scale()
            palm = forward * .70 - dorsal * (.016 / handScale.x)
            calibration[role][side] = dict(orientation=orientation, palm=palm, sign=sign, scale=handScale)
        # Constant root placement is an assembly decision, not recovered spacing.
        mid = (Point(arm, 'L Hand') + Point(arm, 'R Hand')) * .5
        targetY = -1.0 if role == 'Front' else 1.0
        # Keep the torso and coat outside the bed ends; hands reach back/front
        # to the handles instead of centering the hips inside the patient bed.
        shift = Vector((-mid.x, targetY - mid.y + (-.24 if role=='Front' else .24), 0))
        for obj in objects[role]:
            if not obj.parent:
                obj.location += shift
        sources[role]['assemblyTranslationBlender'] = list(shift)
    bpy.context.view_layer.update()
    # Measure support height from the recovered wrists; the old .82 m bed was
    # a placeholder. A fixed rigid bed avoids separate per-hand prop motion.
    wristHeights = []
    for frame in range(1, 122):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        wristHeights.extend(Point(arm, side + ' Hand').z for arm in rigs.values() for side in ['L', 'R'])
    gripHeight = float(np.median(wristHeights)) + .02
    for frame in range(1,122):
        scene.frame_set(frame)
        for role,arm in rigs.items():
            arm.matrix_basis = objectSamples[role][frame-1]
            arm.location += Vector(sources[role]['assemblyTranslationBlender'])
            for b in arm.pose.bones:
                b.matrix_basis = samples[role][frame-1][b.name]
            bpy.context.view_layer.update()
            for side,cfg in calibration[role].items():
                a,b,c=[Point(arm,side+' '+p) for p in ['UpperArm','Forearm','Hand']]
                reach=((a-b).length+(b-c).length)*.97
                palmShift=cfg['orientation'] @ Vector([v*s for v,s in zip(cfg['palm'],cfg['scale'])])
                x=cfg['sign']*.29-palmShift.x
                y=(-1 if role=='Front' else 1)-palmShift.y
                horizontal=(x-a.x)**2+(y-a.y)**2
                if horizontal>=reach*reach:
                    raise ValueError('Body placement makes grip unreachable')
                gripHeight=max(gripHeight,a.z-math.sqrt(reach*reach-horizontal)+palmShift.z)
    bedHeight = gripHeight - .12

    # Capture all original local poses before replacing the actions.
    for arm in rigs.values():
        arm.animation_data_clear()
        for b in arm.pose.bones:
            b.rotation_mode = 'QUATERNION'

    def Aim(arm, bone, child, target):
        bpy.context.view_layer.update()
        world = World(arm, bone)
        start = world.translation.copy()
        old = World(arm, child).translation - start
        q = old.rotation_difference(target - start)
        rotation = q.to_matrix().to_4x4() @ world
        rotation.translation = start
        bone.matrix = arm.matrix_world.inverted() @ rotation
        bpy.context.view_layer.update()

    def SolveArm(arm, side, target):
        a, b, c = [Bone(arm, side + ' ' + p) for p in ['UpperArm', 'Forearm', 'Hand']]
        start, elbow, wrist = [World(arm, n).translation for n in [a, b, c]]
        l1, l2 = (elbow - start).length, (wrist - elbow).length
        delta = target - start
        reach = delta.length / (l1 + l2)
        if reach >= .999:
            raise ValueError(f'{side}: unreachable grip {reach}; lengths {l1,l2}; shoulder {list(start)}; target {list(target)}; scale {list(arm.scale)}')
        direction = delta.normalized()
        pole = elbow - start
        pole -= direction * pole.dot(direction)
        if pole.length < .001:
            pole = Vector((1, 0, 0)) - direction * direction.x
        pole.normalize()
        along = (l1*l1 - l2*l2 + delta.length_squared) / (2*delta.length)
        desiredElbow = start + direction*along + pole*math.sqrt(max(0, l1*l1 - along*along))
        Aim(arm, a, b, desiredElbow)
        Aim(arm, b, c, target)
        return reach

    reports = []
    for frame in range(1, 122):
        scene.frame_set(frame)
        for role, arm in rigs.items():
            arm.matrix_basis = objectSamples[role][frame-1]
            arm.location += Vector(sources[role]['assemblyTranslationBlender'])
            for b in arm.pose.bones:
                b.matrix_basis = samples[role][frame-1][b.name]
            bpy.context.view_layer.update()
            baseline = {b.name: World(arm, b).copy() for b in arm.pose.bones}
            for side, cfg in calibration[role].items():
                grip = Vector((cfg['sign']*.29, -1 if role == 'Front' else 1, gripHeight))
                scaledPalm = Vector([v*s for v,s in zip(cfg['palm'],cfg['scale'])])
                target = grip - cfg['orientation'] @ scaledPalm
                reach = SolveArm(arm, side, target)
                hand = Bone(arm, side + ' Hand')
                m = cfg['orientation'].to_4x4() @ Matrix.Diagonal((*cfg['scale'],1))
                m.translation = target
                hand.matrix = arm.matrix_world.inverted() @ m
                # Fingers keep original axes and lengths. Flex each knuckle
                # toward the rail-facing palm, explicitly authored, not mocap.
                for i in range(1, 5):
                    for depth, curl in [('', .75), ('1', 1.15), ('2', .75)]:
                        finger = Bone(arm, side + ' Finger' + str(i) + depth)
                        axisWorld = Vector((0, 1, 0))  # Shared rail axis.
                        # Aiming toward the palm follows each native joint axis.
                        localAxis = World(arm, finger).to_quaternion().inverted() @ axisWorld
                        from mathutils import Quaternion
                        finger.rotation_quaternion = samples[role][frame-1][finger.name].to_quaternion() @ Quaternion(localAxis, curl * cfg['sign'])
                bpy.context.view_layer.update()
                actual = World(arm, hand) @ cfg['palm']
                untouched = [b for b in arm.pose.bones if not any(t in b.name for t in ['UpperArm', 'Forearm', 'Hand', 'Finger'])]
                reports.append(dict(frame=frame, role=role, side=side,
                    palmErrorMeters=(actual-grip).length, reachRatio=reach,
                    wristCorrectionMeters=(World(arm, hand).translation-baseline[hand.name].translation).length,
                    elbowCorrectionMeters=(Point(arm, side+' Forearm')-baseline[Bone(arm, side+' Forearm').name].translation).length,
                    bodyMatrixError=max(max(abs(x-y) for ra, rb in zip(World(arm,b), baseline[b.name]) for x,y in zip(ra,rb)) for b in untouched)))
            for b in arm.pose.bones:
                for prop in ['location', 'rotation_quaternion', 'scale']:
                    b.keyframe_insert(data_path=prop, frame=frame)
            for prop in ['location','rotation_quaternion','scale']:
                arm.keyframe_insert(data_path=prop, frame=frame)

    def Material(name, color):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        p = m.node_tree.nodes['Principled BSDF']
        p.inputs['Base Color'].default_value = (*color, 1)
        p.inputs['Roughness'].default_value = .85
        return m

    wood = Material('Material_FirstLevelStretcher', (.42,.30,.15))
    prop = bpy.data.objects.new('Prop_FirstLevelStretcher', None)
    scene.collection.objects.link(prop)
    prop.location.z = bedHeight
    geometry = [('Bed', (0,0,0),(.58,1.85,.14))]
    for sign in [-1,1]:
        geometry.append(('Rail', (sign*.29,0,.12),(.065,2.15,.065)))
        geometry.append(('Crosspiece', (0,sign*.68,.075),(.65,.065,.06)))
    for name, at, size in geometry:
        bpy.ops.mesh.primitive_cube_add(size=1)
        obj = bpy.context.object
        obj.name = 'Prop_FirstLevel' + name
        obj.parent = prop
        obj.location = at
        obj.scale = size
        obj.data.materials.append(wood)

    for action in bpy.data.actions:
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points:
                            key.interpolation = 'LINEAR'
    scene.frame_set(1)
    for img in bpy.data.images:
        if img.source == 'FILE' and img.has_data and not img.packed_file:
            img.pack()
    scene['sourcePolicy'] = 'V7 body/lower limbs unchanged; authored arm contact and fingers; two-person crop experiment'
    scene['bedHeightMeters'] = bedHeight
    scene['sourceRangeSeconds'] = [137/30,197/30]
    blend = blends / 'Scene_Nra_StretcherPair_V9.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend), compress=True)

    variants = []
    for name, selected in [('StretcherPair', list(scene.objects))] + [('CarryStretcher'+role, group) for role,group in objects.items()]:
        bpy.ops.object.select_all(action='DESELECT')
        for obj in selected:
            obj.select_set(True)
        clip = 'Animation_Nra_' + name + '_V9'
        path = out / (clip + '.glb')
        bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
            export_animations=True, export_animation_mode='ACTIVE_ACTIONS',
            export_nla_strips_merged_animation_name=clip, export_frame_range=True,
            export_force_sampling=True, export_anim_slide_to_zero=True, export_yup=True)
        source = next(a for a in catalog['actions'] if a['id'] == name)
        v7 = next(v for v in source['variants'] if v['id'] == 'Nra-v7-'+name)
        review = copy.deepcopy(v7['review'])
        review['retargetReport'] = f'Models/{args.group}/Data_ContactValidation.json'
        review['retargetNotes'] = '第一关实物担架接触试制；V7 躯干下肢保留，双臂与手指后期修正，待近景审阅。'
        variants.append(dict(id=name, label=source['label'], loop=True,
            cameraDistance=6.5,
            description='第一关 0.58 m 杆距／2.15 m 杆长；原身体与下肢保留，手臂接触修正版，非全身保真。',
            variants=[dict(id='Nra-v9-'+name, faction='Nra', revisionOrder=9,
                label='V9 · 第一关实物担架接触试制', status='实验 · 待审阅', propKind='carry',
                path=path.relative_to(root).as_posix(), clip=clip,
                blend=blend.relative_to(root).as_posix(), review=review,
                travelMeters=v7.get('travelMeters',[0,0,1.1]))]))
    report = dict(status='requires_visual_review', sourcePolicy=scene['sourcePolicy'],
        newVideoGenerations=0, newInferenceRuns=0, bedHeightMeters=bedHeight,
        geometry=dict(railSpacingM=.58,railLengthM=2.15,gripEndM=1.0),
        maxPalmErrorMeters=max(r['palmErrorMeters'] for r in reports),
        maxWristCorrectionMeters=max(r['wristCorrectionMeters'] for r in reports),
        maxElbowCorrectionMeters=max(r['elbowCorrectionMeters'] for r in reports),
        maxBodyMatrixError=max(r['bodyMatrixError'] for r in reports),
        maxReachRatio=max(r['reachRatio'] for r in reports), samples=reports,
        sources={role:{k:v for k,v in s.items() if k!='raw'} for role,s in sources.items()},
        calibration={role:{side:{'palmLocal':list(c['palm']),'sign':c['sign']} for side,c in cal.items()} for role,cal in calibration.items()})
    (out/'Data_ContactValidation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    (out/'Data_Versions.json').write_text(json.dumps(dict(actions=variants),ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k not in ['samples','sources','calibration']},ensure_ascii=False),flush=True)


if __name__ == '__main__':
    Main()
