"""01–02 opening action library on the five production rigs.

Run headless (one process per rig; the rigs are independent, so they bake in parallel):

    blender --background --python-exit-code 1 --python Taierzhuang1938/_import/Script_OpeningStoryboardBake.py

or send the same file through `node scripts/Script_BlenderMcp.mjs exec --file` (same bpy
path; start/stop the instance around it). Environment:

  OPENING_PROJECT    absolute Taierzhuang1938 directory (required)
  OPENING_BLEND_DIR  editable scenes, validation and partner tracks; never inside the
                     repository (default OneDrive/AI/Models/Blender/Taierzhuang1938/
                     OpeningStoryboards_20260923 -- the 20260922 sources stay untouched)
  OPENING_VERSION    manifest version (default 20260923OpeningStoryboardsV2)
  OPENING_MODEL      comma list of rigs (default all five)
  OPENING_CLIPS      comma list: bake only these clips and merge into the rig's JSON
  OPENING_PASS       'bake' (default) | 'partner' (dump the partner tracks the paired
                     clips aim their hands at -- run it before 'bake') | 'manifest'
                     (rewrite the manifest from the rig files on disk, no Blender work)
  OPENING_RENDER     '1' renders review stills to tmp/OpeningStoryboards/BlenderReview
  OPENING_SKIP_BLEND '1' skips saving the editable scene while iterating

It reuses the production-rig importer, two-bone IK, palm solver and original-local-frame
exporter of `_import/Script_MachineGunCaptivesBake.py`; meshes, skins and inverse binds are
never replaced. The clips are authored in `_import/Script_OpeningStoryboardClips.py`; this
file is the frame loop, grounding, grip pinning, prop tracks, validation and export.

Authoring space is Blender metres on the rig's *source* scale: +Z up, character forward
-Y, character's own left +X, ground z = 0, actor root at the origin. Every frame is lifted
so the lowest skinned vertex rests at CLEARANCE. Anything a director or partner reads is
in RUNTIME metres (source x scale) in the three.js actor frame (+x right, +y up, -z
forward): runtime = (-X, Z, Y) * scale.
"""
import bpy, os, runpy, json, math, hashlib, time
from pathlib import Path
from mathutils import Vector, Matrix

project = Path(os.environ['OPENING_PROJECT'])
private = Path(os.environ.get('OPENING_BLEND_DIR')
               or 'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/OpeningStoryboards_20260923')
VERSION = os.environ.get('OPENING_VERSION') or '20260923OpeningStoryboardsV2'
output = Path(os.environ.get('OPENING_OUTPUT') or (project / 'Animation/OpeningStoryboards'))
reviews = Path(os.environ.get('OPENING_REVIEW') or (project.parent / 'tmp/OpeningStoryboards/BlenderReview'))
PASS = os.environ.get('OPENING_PASS', 'bake')
RENDER = os.environ.get('OPENING_RENDER') == '1'
SKIP_BLEND = os.environ.get('OPENING_SKIP_BLEND') == '1'
for folder in (private, output, reviews):
    folder.mkdir(parents=True, exist_ok=True)
os.environ['CAPTIVES_PROJECT'] = str(project)
os.environ['CAPTIVES_SKIP_BLEND'] = '1'
FPS = 24
CLEARANCE = .003
MODELS = ['LugouNra02', 'LugouNra05', 'LugouIja01', 'LugouIja02', 'LugouIja03']
PARTNER_GLOB = 'Data_OpeningPartnerTracks_*.json'   # one file per partner rig (parallel-safe)
library = runpy.run_path(str(project / '_import/Script_OpeningStoryboardClips.py'), run_name='OpeningClipLibrary')
CLIPS = library['CLIPS']            # name -> static metadata written to the manifest
TARGET_HEIGHT = {'nra': 1.66, 'ija': 1.62}   # Script_Actor KIND_SPEC, what CharacterModel scales to
selectedModels = [m for m in os.environ.get('OPENING_MODEL', '').split(',') if m] or MODELS
selectedClips = [c for c in os.environ.get('OPENING_CLIPS', '').split(',') if c]
convert = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
convertInv = convert.inverted()


def Sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def Round(values, digits=6):
    return [round(v, digits) for v in values]


def BakeRig(ctx):
    arm, scene, names = ctx['arm'], ctx['scene'], ctx['names']
    modelId = ctx['modelId']
    Bone, Point, Update, BWorld = ctx['Bone'], ctx['Point'], ctx['Update'], ctx['BWorld']
    corrections, meshes = ctx['corrections'], ctx['meshes']
    scale = TARGET_HEIGHT['ija' if modelId.startswith('LugouIja') else 'nra'] / ctx['restTop']

    def Reset():
        for bone in arm.pose.bones:
            bone.matrix_basis = ctx['rest'][bone.name]
        Update()

    def NodeWorld(name):
        """Current glTF-node world matrix of a bone, in glTF source space."""
        return convertInv @ BWorld(arm.pose.bones[name]) @ corrections[name]

    # ---- contact points: skin patches carried by their dominant bone ----------------
    # Chosen once on the rest pose from the skinned mesh and stored as an offset in that
    # bone's glTF node frame, so the runtime evaluates the same point from bones alone.
    Reset()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    restVerts = []
    for o in meshes:
        ev = o.evaluated_get(depsgraph)
        mesh = ev.to_mesh()
        groups = {g.index: g.name for g in o.vertex_groups}
        for v in mesh.vertices:
            weights = {groups[g.group]: g.weight for g in v.groups if g.group in groups and g.weight > .05}
            restVerts.append((ev.matrix_world @ v.co, weights))
        ev.to_mesh_clear()
    prefix = next(n for n in names if n.endswith(' Pelvis')).split(' ')[0]
    contactPoints = {}
    for name, spec in library['CONTACT_POINTS'].items():
        bones = [prefix + ' ' + b for b in spec['bones']]
        candidates = [(p, w) for p, w in restVerts if sum(w.get(b, 0) for b in bones) > .5]
        if not candidates:
            raise RuntimeError('contact point %s: no vertices on %s' % (name, bones))
        ranked = sorted(candidates, key=lambda pw: -spec['score'](pw[0], ctx))
        chosen = [p for p, _ in ranked[:spec.get('count', 16)]]
        centre = sum(chosen, Vector()) / len(chosen)
        owner = max(bones, key=lambda b: sum(w.get(b, 0) for _, w in candidates))
        local = NodeWorld(owner).inverted() @ (convertInv @ centre)
        normal = Vector(spec['normal'])
        localNormal = (NodeWorld(owner).to_3x3().inverted() @ (convertInv.to_3x3() @ normal)).normalized()
        contactPoints[name] = {'bone': owner, 'offset': Round(local[:], 5), 'normal': Round(localNormal[:], 4)}

    def ContactWorld(name):
        """Blender-world point and outward normal of one contact patch on the current pose."""
        row = contactPoints[name]
        m = NodeWorld(row['bone'])
        point = convert @ (m @ Vector(row['offset']))
        normal = (convert.to_3x3() @ (m.to_3x3() @ Vector(row['normal']))).normalized()
        return point, normal

    K = dict(ctx)
    K.update({'scale': scale, 'ContactWorld': ContactWorld, 'Reset': Reset,
              'partnerTracks': {f.stem.split('_')[-1]: json.loads(f.read_text()) for f in private.glob(PARTNER_GLOB)}})
    specs = library['MakeClips'](K)

    def ArmSolve(side, grip, pole, palm):
        """Pin the grip centroid (finger roots -- what the runtime mounts to) on `grip`.

        The IK drives the wrist; the grip sits 8-10 cm past it along the palm, so a
        couple of arm-only passes close the gap without re-solving the body."""
        hand = Bone(side + ' Hand')
        target = Vector(grip)
        wrist = target.copy()
        for _ in range(4):
            ctx['Chain'](Bone(side + ' UpperArm'), Bone(side + ' Forearm'), hand, wrist, Vector(pole), label='grip' + side)
            if palm:
                normal = ctx['TurnPalm'](side, palm[0], palm[1])
                ctx['CurlFingers'](side, normal, palm[2], indexAmount=palm[3] if len(palm) > 3 else None)
            Update()
            error = target - ctx['GripPoint'](side)
            if error.length < .0006:
                break
            wrist += error
        return (target - ctx['GripPoint'](side)).length

    solveState = {'lift': 0.0}

    def Solve(spec, t):
        """One frame: pose, ground on the lowest skinned vertex, then pin world grips."""
        if spec.get('author'):
            spec['author'](t, 0.0)
            low, _ = ctx['LowestVertex']()
            spec['author'](t, CLEARANCE - low)
            return CLEARANCE - low, {}
        Reset()
        p = spec['pose'](t)
        ctx['ApplyPose'](p, 0.0)
        if p.get('post'):
            p['post']()
            Update()
        # Reach assist: a grip the arm cannot make pulls the pelvis toward it (feet stay
        # planted, the knees and hips absorb it) -- the body follows the hand, never the
        # other way round. Uses the previous frame's lift for the post-ground target.
        # Shoulder-to-grip reach with a grasping (not pointing) hand: the finger-root centroid
        # sits off the forearm line, so the usable reach is about the bare arm length.
        reach = ctx['armLen']
        p0 = p['pelvis']
        bend0 = p.get('bend', 0.0)
        for _ in range(8):
            excess = Vector()
            for side, grip in (p.get('grips') or {}).items():
                if grip is None:
                    continue
                shoulder = Point(Bone(side + ' UpperArm'))
                if (p.get('gripWeights') or {}).get(side, 1.0) < 1.0:
                    continue
                want = Vector(grip) - Vector((0, 0, solveState['lift'])) - shoulder
                if want.length > reach * .97:
                    excess += want.normalized() * (want.length - reach * .92)
            if excess.length < .004:
                break
            px, py, pz = p['pelvis']
            # Only ever sink toward a low grip; lifting the pelvis would pull the planted feet
            # up, and more than ~10 cm of sideways travel straightens the planted legs.
            moved = Vector((px, py, 0)) - Vector((p0[0], p0[1], 0)) + Vector((excess.x, excess.y, 0))
            if moved.length > .10:
                # The hips have gone as far as the planted feet allow: lean the trunk into
                # the rest (up to +0.25 rad of bend), which is what a man reaching does.
                over = moved.length - .10
                moved = moved.normalized() * .10
                p['bend'] = min(bend0 + .25, p.get('bend', 0.0) + over / .45)
            p['pelvis'] = (p0[0] + moved.x, p0[1] + moved.y, max(p0[2] - .15, pz + min(0.0, excess.z) * .6))
            Reset()
            ctx['ApplyPose'](p, 0.0)
            if p.get('post'):
                p['post']()
                Update()
        low, _ = ctx['LowestVertex']()
        lift = CLEARANCE - low
        solveState['lift'] = lift
        pelvis = Bone('Pelvis')
        matrix = BWorld(pelvis)
        matrix.translation = matrix.translation + Vector((0, 0, lift))
        pelvis.matrix = arm.matrix_world.inverted() @ matrix
        Update()
        errors = {}
        for side, grip in (p.get('grips') or {}).items():
            if grip is not None:
                w = (p.get('gripWeights') or {}).get(side, 1.0)
                target = ctx['GripPoint'](side).lerp(Vector(grip), w) if w < 1.0 else Vector(grip)
                error = ArmSolve(side, target, p['armPoles'][side], p.get('palms', {}).get(side))
                if w >= 1.0:
                    errors[side] = error
        resolved = {'arm' + s for s in (p.get('grips') or {}) if p['grips'][s] is not None}
        resolved |= {'arm' + s for s in p.get('resolved', ())}
        ctx['overreach'][:] = [o for o in ctx['overreach'] if o[0] not in resolved]
        if p.get('postGrip'):
            p['postGrip']()
            Update()
        return lift, errors

    clipsOut, reports, partnerDump = {}, [], {}
    wanted = [name for name in specs if not selectedClips or name in selectedClips]
    if PASS == 'partner':
        wanted = [name for name in wanted if name in library['PARTNER_SOURCES'].get(modelId, {})]
    arm.animation_data_create()
    for clip in wanted:
        spec = specs[clip]
        meta = CLIPS[clip]
        duration, loop = meta['duration'], meta['loop']
        count = math.ceil(duration * FPS) + 1
        action = bpy.data.actions.new(clip)
        values, samples, lifts, gripErrors = [], [], [], []
        props = {name: [] for name in (meta.get('props') or [])}
        dumpPoints = library['PARTNER_SOURCES'].get(modelId, {}).get(clip, []) if PASS == 'partner' else []
        dump = {name: [] for name in dumpPoints}
        skeleton = []
        started = time.time()
        review = spec.get('reviewFrames', lambda n: [0, n // 2, n - 1])(count) if RENDER else []
        for frame in range(count):
            arm.animation_data.action = None
            t = frame * duration / (count - 1)
            ctx['overreach'].clear()
            lift, errors = Solve(spec, t)
            lifts.append(lift)
            gripErrors.append(max(errors.values()) if errors else 0.0)
            values.extend(ctx['SourcePose']())
            if props:
                track = spec['props'](t)
                for name in props:
                    row = track.get(name)
                    if row is None:
                        props[name].extend([0, 0, 0, 0, 0, -1, 0, 1, 0, 0])
                        continue
                    origin = convertInv @ Vector(row[0])
                    axis = (convertInv.to_3x3() @ Vector(row[1])).normalized()
                    up = convertInv.to_3x3() @ Vector(row[2])
                    up = (up - axis * up.dot(axis)).normalized()
                    props[name].extend(Round([*origin, *axis, *up, 1.0 if row[3] else 0.0], 5))
            for name in dumpPoints:
                if name in contactPoints:
                    point, normal = ContactWorld(name)
                else:
                    point, normal = spec['points'](t)[name]
                dump[name].append(Round([point.x * scale, point.y * scale, point.z * scale,
                                         normal.x, normal.y, normal.z], 5))
            if dumpPoints:
                skeleton.append(Round([c * scale for role in library['GHOST_BONES'] for c in Point(Bone(role))], 4))
            samples.append({
                't': round(t, 4),
                'footL': Point(Bone('L Foot'))[:], 'footR': Point(Bone('R Foot'))[:],
                'toeL': Point(Bone('L Toe0'))[:], 'toeR': Point(Bone('R Toe0'))[:],
                'gripL': ctx['GripPoint']('L')[:], 'gripR': ctx['GripPoint']('R')[:],
                'pelvis': Point(Bone('Pelvis'))[:], 'head': Point(Bone('Head'))[:],
                'overreach': list(ctx['overreach']),
                'targets': spec['check'](t) if spec.get('check') else None,
            })
            if os.environ.get('OPENING_DEBUG') and frame % int(os.environ.get("OPENING_DEBUG")) == 0:
                c = spec['check'](t) if spec.get('check') else {}
                print('DBG %s t=%.2f pelvis %s shL %s shR %s gripL %s gripR %s targets %s' % (clip, t,
                      Round(Point(Bone('Pelvis'))[:], 2), Round(Point(Bone('L UpperArm'))[:], 2), Round(Point(Bone('R UpperArm'))[:], 2),
                      Round(ctx['GripPoint']('L')[:], 2), Round(ctx['GripPoint']('R')[:], 2),
                      {k: Round(v, 2) for k, v in c.items() if v}), flush=True)
            if frame in (0, count // 2, count - 1) or frame in review:
                samples[-1]['regions'] = ctx['RegionLows']()
                if spec.get('walls'):
                    samples[-1]['wall'] = WallPenetration(meshes, spec['walls'](t) if callable(spec['walls']) else spec['walls'])
            if frame in review:
                RenderReview(clip, frame, t, spec, modelId)
            arm.animation_data.action = action
            for name in names:
                pb = arm.pose.bones[name]
                pb.keyframe_insert('location', frame=frame)
                pb.keyframe_insert('rotation_quaternion', frame=frame)
        stride = len(names) * 7
        seam = max(abs(values[i] - values[len(values) - stride + i]) for i in range(stride)) if loop else 0.0
        if loop:
            values[-stride:] = values[:stride]
            for name in props:
                props[name][-10:] = props[name][:10]
        action.use_fake_user = True
        arm.animation_data.action = None
        nla = arm.animation_data.nla_tracks.new()
        nla.name = clip
        nla.mute = True
        nla.strips.new(clip, 0, action)
        row = {'duration': duration, 'loop': loop, 'weaponHold': meta['weaponHold'], 'frameCount': count, 'values': values}
        if meta.get('referenceSpeedMps'):
            row['referenceSpeedMps'] = meta['referenceSpeedMps']
        if props:
            row['props'] = {name: {'stride': 10, 'values': data} for name, data in props.items()}
        clipsOut[clip] = row
        if dump:
            partnerDump[clip] = {'fps': FPS, 'duration': duration, 'scale': scale, 'points': dump, 'skeleton': skeleton}
        report = Validate(clip, spec, samples, lifts, gripErrors, seam, scale)
        report['seconds'] = round(time.time() - started, 1)
        reports.append(report)
        print('   REGIONS', json.dumps(report['regions']), 'WALL', report.get('wallPenetrationM'), flush=True)
        print('CLIP %-26s %s frames %3d lift %.3f..%.3f grip %.4f slide %.4f contact %.4f(%s, >3cm %d) seam %.1e %.0fs %s' % (
            clip, modelId, count, min(lifts), max(lifts), max(gripErrors), report['footSlideM'],
            report['contactErrorM'], report['contactWorst'], len(report['contactOver3cm']), seam, report['seconds'],
            ('OVERREACH ' + ' '.join(report['overreach'][:6])) if report['overreach'] else ''), flush=True)

    if PASS == 'partner':
        partnerFile = private / ('Data_OpeningPartnerTracks_' + modelId + '.json')
        existing = json.loads(partnerFile.read_text()) if partnerFile.exists() else {}
        existing.update(partnerDump)
        partnerFile.write_text(json.dumps(existing, separators=(',', ':')), encoding='utf-8')
        print('PARTNER_DUMP', modelId, list(partnerDump), flush=True)
        return {'id': modelId, 'partner': list(partnerDump)}

    source = project / 'Model/Character' / ('Model_' + modelId + '.glb')
    file = output / ('Animation_' + modelId + 'OpeningStoryboards.json')
    if selectedClips and file.exists():
        merged = json.loads(file.read_text())['clips']
        merged.update(clipsOut)
        clipsOut = {name: merged[name] for name in CLIPS if name in merged}
    asset = {'schema': 2, 'modelId': modelId, 'fps': FPS, 'stride': 7, 'bones': names, 'clips': clipsOut,
             'contactPoints': contactPoints, 'originalModelSha256': Sha(source),
             'authoringTool': 'Blender ' + bpy.app.version_string + ' (bpy; headless or BlenderMCP exec)'}
    temporary = file.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(asset, separators=(',', ':')), encoding='utf-8')
    temporary.replace(file)
    reportFile = private / ('Data_' + modelId + 'OpeningValidation.json')
    if selectedClips and reportFile.exists():
        old = {row['clip']: row for row in json.loads(reportFile.read_text())['clips']}
        old.update({row['clip']: row for row in reports})
        reports = [old[name] for name in CLIPS if name in old]
    reportFile.write_text(json.dumps({'modelId': modelId, 'scale': scale, 'clips': reports}, indent=1), encoding='utf-8')
    blend = private / ('Scene_' + modelId + 'OpeningStoryboards.blend')
    if not SKIP_BLEND:
        if wanted:
            arm.animation_data.action = bpy.data.actions[wanted[0]]
        scene.frame_start, scene.frame_end = 0, 120
        scene['BlenderMcpTask'] = 'OpeningStoryboards20260923'
        scene['StoryboardSource'] = 'docs/Data_FirstLevelOpeningSource20260923.md'
        scene['runtimeCoordinatePolicy'] = 'Original GLB bone frames; runtime = (-X, Z, Y) * scale; every frame grounded'
        scene['reviewActions'] = 'Select an action on the original armature; NLA copies are muted for reference'
        ctx['Op'](bpy.ops.file.pack_all)
        ctx['Op'](bpy.ops.wm.save_as_mainfile, filepath=str(blend), compress=True)
    print('OPENING_BAKED', modelId, len(clipsOut), str(file), flush=True)
    return {'id': modelId, 'file': file.name, 'sha256': Sha(file), 'originalModelSha256': asset['originalModelSha256'],
            'blend': str(blend), 'contactPoints': contactPoints,
            'clips': [{k: row[k] for k in ('clip', 'frames', 'floorCorrectionMin', 'floorCorrectionMax',
                                           'footSlideM', 'contactErrorM', 'gripSolveErrorM')} for row in reports]}


def WallPenetration(meshes, walls):
    """Deepest skinned vertex behind any wall plane (point, inward normal), source metres."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    worst = 0.0
    planes = [(Vector(p), Vector(n).normalized()) for p, n in walls]
    for o in meshes:
        ev = o.evaluated_get(depsgraph)
        mesh = ev.to_mesh()
        m = ev.matrix_world
        for v in mesh.vertices:
            q = m @ v.co
            for p, n in planes:
                depth = -(q - p).dot(n)
                if depth > worst:
                    worst = depth
        ev.to_mesh_clear()
    return worst


def Validate(clip, spec, samples, lifts, gripErrors, seam, scale):
    """Numbers the review and the gate read: foot drift inside declared plants (runtime
    metres), grip error against world/partner targets, overreach, loop seam, NaN."""
    report = {'clip': clip, 'frames': len(samples), 'floorCorrectionMin': round(min(lifts), 5),
              'floorCorrectionMax': round(max(lifts), 5), 'loopSeam': round(seam, 9),
              'gripSolveErrorM': round(max(gripErrors) * scale, 5)}
    worstBy = {}
    for s in samples:
        for label, ratio in s['overreach']:
            if ratio > worstBy.get(label, (0, 0))[0]:
                worstBy[label] = (ratio, s['t'])
    report['overreach'] = ['%s=%.3f@%.2f(%d)' % (label, r, at, sum(1 for s in samples for l, _ in s['overreach'] if l == label))
                           for label, (r, at) in sorted(worstBy.items())]
    worst = 0.0
    for side, t0, t1 in spec.get('plants', []):
        window = [s for s in samples if t0 - 1e-6 <= s['t'] <= t1 + 1e-6]
        for key in ('foot' + side, 'toe' + side):
            if len(window) >= 2:
                a = Vector(window[0][key])
                worst = max(worst, max((Vector(s[key]) - a).length for s in window) * scale)
    report['footSlideM'] = round(worst, 4)
    contact, worstAt = 0.0, None
    over = []
    for s in samples:
        for side, target in (s['targets'] or {}).items():
            if target is not None:
                e = (Vector(s['grip' + side]) - Vector(target)).length * scale
                if e > .03:
                    over.append('%s@%.2f' % (side, s['t']))
                if e > contact:
                    contact, worstAt = e, '%s@%.2f' % (side, s['t'])
    report['contactErrorM'] = round(contact, 4)
    report['contactWorst'] = worstAt
    report['contactOver3cm'] = over
    regions = [s for s in samples if s.get('regions')]
    report['regions'] = {('%.2f' % s['t']): {k: round(v[0] * scale, 3) for k, v in s['regions'].items()} for s in regions}
    walls = [s['wall'] for s in samples if 'wall' in s]
    if walls:
        report['wallPenetrationM'] = round(max(walls) * scale, 4)
    report['finite'] = all(math.isfinite(v) for s in samples for v in s['pelvis'] + s['head'])
    return report


reviewCamera = None


def RenderReview(clip, frame, t, spec, modelId):
    """Workbench stills for the local review folder (never committed)."""
    global reviewCamera
    import bmesh
    scene = bpy.context.scene
    if reviewCamera is None:
        reviewCamera = bpy.data.objects.new('Camera_OpeningReview', bpy.data.cameras.new('Camera_OpeningReview'))
        scene.collection.objects.link(reviewCamera)
        ground = bpy.data.meshes.new('Prop_ReviewGround')
        ground.from_pydata([(-3, -3, 0), (3, -3, 0), (3, 3, 0), (-3, 3, 0)], [], [(0, 1, 2, 3)])
        scene.collection.objects.link(bpy.data.objects.new('Prop_ReviewGround', ground))
        scene.render.engine = 'BLENDER_WORKBENCH'
        scene.render.resolution_x, scene.render.resolution_y = 520, 600
        scene.display.shading.light = 'STUDIO'
        scene.display.shading.show_shadows = True
        scene.camera = reviewCamera
    extras = []
    for index, (kind, a, b, radius) in enumerate(spec['reviewProps'](t) if spec.get('reviewProps') else []):
        bm = bmesh.new()
        if kind == 'point':
            bmesh.ops.create_icosphere(bm, subdivisions=1, radius=radius)
        elif kind == 'box':
            bmesh.ops.create_cube(bm, size=1.0)
            bmesh.ops.scale(bm, vec=Vector(b), verts=bm.verts)
        else:
            bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=radius, radius2=radius, depth=(Vector(b) - Vector(a)).length)
        mesh = bpy.data.meshes.new('ReviewProp')
        bm.to_mesh(mesh)
        bm.free()
        o = bpy.data.objects.new('ReviewProp%d' % index, mesh)
        if kind in ('point', 'box'):
            o.location = a
        else:
            o.location = (Vector(a) + Vector(b)) / 2
            o.rotation_euler = (Vector(b) - Vector(a)).to_track_quat('Z', 'Y').to_euler()
        scene.collection.objects.link(o)
        extras.append(o)
    for view, location, target in spec.get('reviewViews') or [('side', (-3.4, -.35, 1.05), (0, -.25, .75)),
                                                              ('q', (-2.3, -2.9, 1.9), (0, -.25, .65))]:
        reviewCamera.location = location
        reviewCamera.rotation_euler = (Vector(target) - Vector(location)).to_track_quat('-Z', 'Y').to_euler()
        reviewCamera.data.type = 'ORTHO'
        reviewCamera.data.ortho_scale = spec.get('reviewScale', 2.8)
        scene.render.filepath = str(reviews / ('%s_%s_%s_%02d.png' % (clip, modelId, view, frame)))
        bpy.ops.render.render(write_still=True)
    for o in extras:
        bpy.data.objects.remove(o, do_unlink=True)


def WriteManifest(results):
    existing = output / 'Data_OpeningStoryboardsAnimation.json'
    rows = {}
    if existing.exists():
        rows = {row['id']: row for row in json.loads(existing.read_text()).get('models', [])}
    rows.update({row['id']: row for row in results})
    for modelId in MODELS:
        file = output / ('Animation_' + modelId + 'OpeningStoryboards.json')
        if file.exists():
            row = rows.setdefault(modelId, {'id': modelId, 'file': file.name})
            asset = json.loads(file.read_text())
            row['sha256'] = Sha(file)
            row['originalModelSha256'] = Sha(project / 'Model/Character' / ('Model_' + modelId + '.glb'))
            row['clipIds'] = list(asset['clips'])
            row['contactPoints'] = asset.get('contactPoints', {})
    manifest = {'schema': 2, 'version': VERSION, 'fps': FPS, 'actorForward': [0, 0, -1], 'blendSeconds': .12,
                'floorClearanceM': CLEARANCE,
                'coordinates': {
                    'values': 'glTF node-local bone transforms (p xyz, q xyzw), stride 7',
                    'props': 'glTF scene space = rig.root local, source metres: origin xyz, axis xyz, up xyz, visible',
                    'stages': 'runtime metres in the anchor actor frame (+x right, +y up, -z forward); yawDeg + = turn left',
                    'contacts': 'clip seconds; partner parts are contactPoints names'},
                'clips': CLIPS, 'stages': library['STAGES'], 'props': library['PROPS'],
                'models': [rows[m] for m in MODELS if m in rows]}
    existing.write_text(json.dumps(manifest, indent=1), encoding='utf-8')
    print('OPENING_MANIFEST', len(manifest['models']), 'models', len(CLIPS), 'clips', flush=True)


if PASS == 'manifest':
    WriteManifest([])
else:
    base = runpy.run_path(str(project / '_import/Script_MachineGunCaptivesBake.py'), run_name='OpeningRigLibrary')
    library['BindCaptives'](base)
    results = [base['Bake'](modelId, probe=BakeRig) for modelId in MODELS if modelId in selectedModels]
    if PASS == 'bake' and not os.environ.get('OPENING_NO_MANIFEST'):
        WriteManifest([row for row in results if 'file' in row])
    print('OPENING_COMPLETE', PASS, len(results), flush=True)
