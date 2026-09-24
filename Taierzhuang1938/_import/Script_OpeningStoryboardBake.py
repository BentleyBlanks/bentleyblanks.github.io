"""01–02 opening action library on the five production rigs.

Run headless (one process per rig; the rigs are independent, so they bake in parallel):

    blender --background --python-exit-code 1 --python Taierzhuang1938/_import/Script_OpeningStoryboardBake.py

or send the same file through `node scripts/Script_BlenderMcp.mjs exec --file` (same bpy
path; start/stop the instance around it). Environment:

  OPENING_PROJECT    absolute Taierzhuang1938 directory (required)
  OPENING_BLEND_DIR  editable scenes, validation and partner tracks; never inside the
                     repository (default OneDrive/AI/Models/Blender/Taierzhuang1938/
                     OpeningStoryboards_20260923 -- the 20260922 sources stay untouched)
  OPENING_VERSION    manifest version (default 20260923OpeningStoryboardsV4)
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
from mathutils import Vector, Matrix, Quaternion

project = Path(os.environ['OPENING_PROJECT'])
private = Path(os.environ.get('OPENING_BLEND_DIR')
               or 'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/OpeningStoryboards_20260923')
VERSION = os.environ.get('OPENING_VERSION') or '20260923OpeningStoryboardsV4'
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
# Skin regions a manifest contact with target 'wall' names (contact `limb`): the check is the
# smallest gap between that region's skin and the wall planes the clip is authored against.
WALL_REGIONS = {
    'shoulderBack': ['Spine2', 'L Clavicle', 'R Clavicle'], 'back': ['Spine1', 'Spine2'],
    'shoulderL': ['L Clavicle', 'L UpperArm'], 'shoulderR': ['R Clavicle', 'R UpperArm'], 'head': ['Head'],
    'handL': ['L Hand', 'L Finger'], 'handR': ['R Hand', 'R Finger'], 'hips': ['Pelvis', 'Spine'],
    'feet': ['L Foot', 'R Foot', 'L Toe0', 'R Toe0'], 'calves': ['L Calf', 'R Calf'],
}
convertInv = convert.inverted()


def Smooth01(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


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

    # ---- wall contacts: skin regions that must TOUCH a wall (manifest contacts with
    # target 'wall'), measured as the smallest skin-to-plane gap of the region's vertices.
    regionVerts = {}
    for region, roles in WALL_REGIONS.items():
        bones = [prefix + ' ' + b for b in roles]
        rows = []
        for o in meshes:
            groups = {g.index: g.name for g in o.vertex_groups}
            picked = [v.index for v in o.data.vertices
                      if sum(g.weight for g in v.groups
                             if any(groups.get(g.group, '') == b or groups.get(g.group, '').startswith(b) and b.endswith('Finger')
                                    for b in bones)) > .5]
            if picked:
                rows.append((o, picked))
        regionVerts[region] = rows

    def WallGap(region, walls):
        """Smallest gap (source metres; negative = inside) between the region's skin and any wall."""
        depsgraph = bpy.context.evaluated_depsgraph_get()
        planes = [(Vector(w[0]), Vector(w[1]).normalized(),
                   (Vector(w[2]), Vector(w[3]).normalized()) if len(w) > 2 else None) for w in walls]
        best = math.inf
        for o, picked in regionVerts.get(region, []):
            ev = o.evaluated_get(depsgraph)
            mesh = ev.to_mesh()
            m = ev.matrix_world
            for i in picked:
                q = m @ mesh.vertices[i].co
                for p, n, edge in planes:
                    if edge is not None and (q - edge[0]).dot(edge[1]) < 0:
                        continue
                    best = min(best, (q - p).dot(n))
            ev.to_mesh_clear()
        return best

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

    fingerBones = {s: [pb for pb in arm.pose.bones if pb.name.startswith(prefix + ' ' + s + ' Finger')] for s in 'LR'}
    handPrev = {}
    HAND_STEP = math.radians(float(os.environ.get('OPENING_HAND_STEP') or 30))

    def ResetFingers(side):
        """CurlFingers bends from the CURRENT finger pose: every pass of the grip loop curled the
        fingers again, so a fist closed 2-5 times too far and changed from frame to frame with
        the number of passes. Each curl now starts from the rest fingers."""
        for pb in fingerBones[side]:
            pb.matrix_basis = ctx['rest'][pb.name]
        Update()

    def LimitHand(side):
        """At most HAND_STEP of hand rotation (world) from the previous frame: a palm hint that
        switches between two authored directions turns the hand over a few frames instead of
        flipping it in one."""
        prev = handPrev.get(side)
        if prev is None:
            return
        hand = Bone(side + ' Hand')
        loc, q, sc = BWorld(hand).decompose()
        angle = prev.rotation_difference(q).angle
        angle = min(angle, 2 * math.pi - angle)
        if angle > HAND_STEP:
            ctx['Put'](hand, Matrix.LocRotScale(loc, prev.slerp(q, HAND_STEP / angle), sc))

    # Rest hinge of each elbow in the upper arm's own frame: at rest (arms out) the forearm
    # folds forward, so the hinge is (upper-arm direction) x (character forward, -Y).
    Reset()
    restHinge = {}
    for s in 'LR':
        ua = Bone(s + ' UpperArm')
        u = (Point(Bone(s + ' Forearm')) - Point(ua)).normalized()
        restHinge[s] = BWorld(ua).to_3x3().normalized().inverted() @ u.cross(Vector((0, -1, 0))).normalized()
    ARM_TWIST_SHARE = .5
    twistPrev, twistNow, twistSeed = {}, {}, {}
    uaPrev, uaNow, faPrev, faNow = {}, {}, {}, {}
    uaSeed, faSeed = {}, {}
    ROLL_STEP = math.radians(float(os.environ.get('OPENING_ROLL_STEP') or 30))

    def ArmRoll(side):
        """Canonical arm roll, independent of how the frame's IK passes got there.

        The two-bone IK aims each bone with the smallest rotation from wherever the previous
        pass left it, so the upper arm's and the forearm's roll about their own axes depended
        on the path (free hand -> body-frame pass -> grip pass) and flipped 50-175 deg in a
        frame whenever the path changed, with the elbow and wrist standing still. Here the
        elbow and wrist positions and the hand's world orientation are kept; the upper arm is
        rolled so its elbow hinge is normal to the plane the arm bends in, the forearm is
        re-aimed from straight (a pure hinge bend) and takes half of the hand's twist about
        the forearm (pronation), the wrist the other half."""
        ua, fa, hd = Bone(side + ' UpperArm'), Bone(side + ' Forearm'), Bone(side + ' Hand')
        S, E, Wr = Point(ua), Point(fa), Point(hd)
        Hloc, Hq, Hs = BWorld(hd).decompose()
        u = (E - S).normalized()
        v = Wr - E
        d = v - u * v.dot(u)
        weight = Smooth01(d.length / (.08 * max(v.length, 1e-6)))
        if weight > 0:
            h = BWorld(ua).to_3x3().normalized() @ restHinge[side]
            h = h - u * h.dot(u)
            if h.length > 1e-6:
                h.normalize()
                want = u.cross(d.normalized())
                angle = math.atan2(u.dot(h.cross(want)), h.dot(want)) * weight
                ctx['Put'](ua, Matrix.Translation(S) @ Quaternion(u, angle).to_matrix().to_4x4() @ Matrix.Translation(-S) @ BWorld(ua))
        # A nearly straight arm has no bend plane to align with (weight -> 0), so its roll is
        # whatever the IK passes left -- and that flipped 90-170 deg in a frame when the arm
        # straightened or the hand switched targets. The roll about the upper arm's own axis
        # moves at most ROLL_STEP a frame from the previous frame's (the elbow does not move).
        prev, step = uaPrev.get(side), ROLL_STEP
        if prev is None and side in uaSeed and uaSeed[side][1].dot(u) > math.cos(math.radians(5)):
            # A real continuation: frame 0 takes the previous clip's last roll exactly (the
            # hand-over is frame to frame) and moves on from there at ROLL_STEP a frame.
            prev, step = uaSeed[side], 0.0
        if prev is not None:
            prevQ, prevAxis = prev
            aligned = prevAxis.rotation_difference(u) @ prevQ
            rel = BWorld(ua).to_quaternion() @ aligned.inverted()
            roll = 2 * math.atan2(Vector((rel.x, rel.y, rel.z)).dot(u), rel.w)
            roll = (roll + math.pi) % (2 * math.pi) - math.pi
            if abs(roll) > step:
                back = Quaternion(u, -(roll - math.copysign(step, roll)))
                ctx['Put'](ua, Matrix.Translation(S) @ back.to_matrix().to_4x4() @ Matrix.Translation(-S) @ BWorld(ua))
        uaNow[side] = (BWorld(ua).to_quaternion(), u.copy())
        fa.matrix_basis = ctx['rest'][fa.name]
        Update()
        ctx['Aim'](fa, hd, Wr)
        a = (Wr - E).normalized()
        Fq = BWorld(fa).to_quaternion()
        rel = Fq.inverted() @ Hq
        axis = Fq.inverted() @ a
        twist = 2 * math.atan2(Vector((rel.x, rel.y, rel.z)).dot(axis), rel.w)
        twist = (twist + math.pi) % (2 * math.pi) - math.pi
        # Unwrapped against the previous frame: the twist crosses +-180 deg for a turned-over
        # palm, and the wrapped value would swing the forearm half a turn in one frame.
        prev = twistPrev.get(side)
        if prev is not None:
            twist += 2 * math.pi * round((prev - twist) / (2 * math.pi))
        elif side in twistSeed:
            turns = round((twistSeed[side] - twist) / (2 * math.pi))
            if abs(twistSeed[side] - twist - 2 * math.pi * turns) < math.radians(20):
                twist += 2 * math.pi * turns
        twistNow[side] = twist
        ctx['Put'](fa, Matrix.Translation(E) @ Quaternion(a, twist * ARM_TWIST_SHARE).to_matrix().to_4x4()
                   @ Matrix.Translation(-E) @ BWorld(fa))
        # The same per-frame limit on the forearm's roll about its own axis (the wrist takes the
        # rest for that frame; the hand keeps its world orientation).
        prev, step = faPrev.get(side), ROLL_STEP
        if prev is None and side in faSeed and faSeed[side][1].dot(a) > math.cos(math.radians(5)):
            prev, step = faSeed[side], 0.0
        if prev is not None:
            prevQ, prevAxis = prev
            aligned = prevAxis.rotation_difference(a) @ prevQ
            rel = BWorld(fa).to_quaternion() @ aligned.inverted()
            roll = 2 * math.atan2(Vector((rel.x, rel.y, rel.z)).dot(a), rel.w)
            roll = (roll + math.pi) % (2 * math.pi) - math.pi
            if abs(roll) > step:
                back = Quaternion(a, -(roll - math.copysign(step, roll)))
                ctx['Put'](fa, Matrix.Translation(E) @ back.to_matrix().to_4x4() @ Matrix.Translation(-E) @ BWorld(fa))
        faNow[side] = (BWorld(fa).to_quaternion(), a.copy())
        ctx['Put'](hd, Matrix.LocRotScale(Wr, Hq, Hs))

    fingerPrev = {}
    FINGER_STEP = math.radians(float(os.environ.get('OPENING_FINGER_STEP') or 22))

    def LimitFingers():
        """At most FINGER_STEP of change per finger joint (local) from the previous frame: a curl
        or palm that switches between two authored values closes or opens the hand over a few
        frames. The grip point (finger roots) does not depend on the finger joints."""
        for s in 'LR':
            for pb in fingerBones[s]:
                prev = fingerPrev.get(pb.name)
                if prev is None:
                    continue
                loc, q, sc = pb.matrix_basis.decompose()
                angle = prev.rotation_difference(q).angle
                angle = min(angle, 2 * math.pi - angle)
                if angle > FINGER_STEP:
                    pb.matrix_basis = Matrix.LocRotScale(loc, prev.slerp(q, FINGER_STEP / angle), sc)

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
                LimitHand(side)
                ResetFingers(side)
                ctx['CurlFingers'](side, normal, palm[2], indexAmount=palm[3] if len(palm) > 3 else None)
            else:
                LimitHand(side)
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
        # Where each reaching hand is in the unassisted pose: a partial reach (weight < 1) blends
        # from THIS point, not from the hand of the pose being corrected -- otherwise the goal
        # would sink with the body and the assist would run to its limit in a single frame.
        free = {side: ctx['GripPoint'](side).copy() for side in (p.get('grips') or {})}
        for _ in range(8):
            excess = Vector()
            for side, grip in (p.get('grips') or {}).items():
                if grip is None:
                    continue
                shoulder = Point(Bone(side + ' UpperArm'))
                # A hand still reaching (weight < 1) asks only for its blended target, so the
                # assist ramps in with the reach instead of switching on at contact.
                w = (p.get('gripWeights') or {}).get(side, 1.0)
                goal = Vector(grip) - Vector((0, 0, solveState['lift']))
                if w < 1.0:
                    goal = free[side].lerp(goal, w)
                want = goal - shoulder
                # Continuous in the target distance (no on/off threshold), so neighbouring
                # frames get neighbouring corrections and the pelvis never jumps.
                if want.length > reach * .92:
                    excess += want.normalized() * (want.length - reach * .92) * w
            if excess.length < .0015:
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
        low, lowAt = ctx['LowestVertex']()
        lift = CLEARANCE - low
        solveState['lift'] = lift
        if os.environ.get('OPENING_LOWDBG'):
            print('LOW t=%.2f %.4f at %s' % (t, low, lowAt), flush=True)
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
                palm = (p.get('gripPalms') or {}).get(side) or p.get('palms', {}).get(side)
                pole = Vector(p['armPoles'][side])
                relPole = (p.get('relPoles') or {}).get(side)
                if relPole is not None:
                    # A reaching hand bends its elbow the way the free hand did and hands the
                    # elbow over to the grip's pole with the reach (no elbow jump at either end).
                    pole = (Vector(relPole) + Vector((0, 0, lift))).lerp(pole, Smooth01(w))
                error = ArmSolve(side, target, pole, palm)
                if w >= 1.0:
                    errors[side] = error
        resolved = {'arm' + s for s in (p.get('grips') or {}) if p['grips'][s] is not None}
        resolved |= {'arm' + s for s in p.get('resolved', ())}
        ctx['overreach'][:] = [o for o in ctx['overreach'] if o[0] not in resolved]
        if p.get('postGrip'):
            p['postGrip']()
            Update()
        for side in 'LR':
            if side not in errors:
                LimitHand(side)
        for side in 'LR':
            ArmRoll(side)
        LimitFingers()
        Update()
        return lift, errors

    clipsOut, reports, partnerDump = {}, [], {}
    twistEnd = {}
    # Bone mounts of props an actor carries between clips (spec 'mountFrames': {prop: (bone role,
    # frame)}): the prop track at that frame in that bone's glTF node frame -- the sheathed
    # bayonet on the pelvis, taken from IjaDrawBayonet frame 0.
    propMounts = {}
    # A clip is baked only on the rigs its manifest row lists (legacy clips: all five).
    onRig = [name for name in specs if modelId in (CLIPS[name].get('rigs') or MODELS)]
    wanted = [name for name in onRig if not selectedClips or name in selectedClips]
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
        # Wall contacts to measure: every second frame inside [t, untilT] of each contact with
        # target 'wall' (a release is the end of one, not a contact).
        wallRows = [c for c in (meta.get('contacts') or []) if c.get('target') == 'wall' and c.get('action') != 'release']
        wallGaps = [[c['limb'], c['t'], c.get('untilT', c['t']), -math.inf, math.inf] for c in wallRows]
        wallFrames = {}
        for k, (limb, t0, t1, _, _) in enumerate(wallGaps):
            f0, f1 = int(round(t0 * (count - 1) / duration)), int(round(t1 * (count - 1) / duration))
            for f in sorted(set(list(range(f0, f1 + 1, 2)) + [f1])):
                wallFrames.setdefault(f, []).append(k)
        handPrev.clear()
        twistPrev.clear()
        fingerPrev.clear()
        uaPrev.clear()
        faPrev.clear()
        # A clip authored to continue another on the same root starts its forearm twist on the
        # branch the previous clip ended on: ArmRoll unwraps the twist frame to frame, so the same
        # hand pose can end one clip at +200 deg and start the next at -160 deg -- half a turn of the
        # forearm at the hand-over. (Only the branch is taken over; no pose is changed.)
        # Only a real continuation: the start hand must be (within 20 deg) the hand the previous
        # clip ended on -- a clip that merely may follow keeps its own shortest branch.
        twistSeed.clear()
        uaSeed.clear()
        faSeed.clear()
        for before in meta.get('prev') or []:
            if before in twistEnd:
                twistSeed.update(twistEnd[before][0])
                uaSeed.update(twistEnd[before][1])
                faSeed.update(twistEnd[before][2])
                break
        for frame in range(count):
            arm.animation_data.action = None
            t = frame * duration / (count - 1)
            ctx['overreach'].clear()
            lift, errors = Solve(spec, t)
            for side in 'LR':
                handPrev[side] = BWorld(Bone(side + ' Hand')).to_quaternion()
            twistPrev.update(twistNow)
            uaPrev.update(uaNow)
            faPrev.update(faNow)
            for s in 'LR':
                for pb in fingerBones[s]:
                    fingerPrev[pb.name] = pb.matrix_basis.to_quaternion()
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
                for name, (role, atFrame) in (spec.get('mountFrames') or {}).items():
                    if frame == atFrame and name in props:
                        row = props[name][-10:]
                        bone = Bone(role).name
                        inverse = NodeWorld(bone).inverted()
                        o = inverse @ Vector(row[0:3])
                        a = (inverse.to_3x3() @ Vector(row[3:6])).normalized()
                        u = (inverse.to_3x3() @ Vector(row[6:9])).normalized()
                        propMounts[name] = {'bone': bone, 'origin': Round(o[:], 6), 'axis': Round(a[:], 6), 'up': Round(u[:], 6),
                                            'from': '%s frame %d' % (clip, atFrame)}
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
                'kneeL': Point(Bone('L Calf'))[:], 'kneeR': Point(Bone('R Calf'))[:],
                'toeL': Point(Bone('L Toe0'))[:], 'toeR': Point(Bone('R Toe0'))[:],
                'gripL': ctx['GripPoint']('L')[:], 'gripR': ctx['GripPoint']('R')[:],
                'pelvis': Point(Bone('Pelvis'))[:], 'head': Point(Bone('Head'))[:],
                'left': (Point(Bone('L Thigh')) - Point(Bone('R Thigh')))[:],
                'overreach': list(ctx['overreach']),
                'targets': spec['check'](t) if spec.get('check') else None,
            })
            if os.environ.get('OPENING_DEBUG') and frame % int(os.environ.get("OPENING_DEBUG")) == 0:
                c = spec['check'](t) if spec.get('check') else {}
                print('DBG %s t=%.2f lift %.3f footL %s footR %s pelvis %s shL %s shR %s gripL %s gripR %s targets %s' % (clip, t, lift,
                      Round(Point(Bone('L Foot'))[:], 3), Round(Point(Bone('R Foot'))[:], 3), Round(Point(Bone('Pelvis'))[:], 2), Round(Point(Bone('L UpperArm'))[:], 2), Round(Point(Bone('R UpperArm'))[:], 2),
                      Round(ctx['GripPoint']('L')[:], 2), Round(ctx['GripPoint']('R')[:], 2),
                      {k: Round(v, 2) for k, v in c.items() if v}), flush=True)
            if frame in wallFrames:
                walls = spec['walls'](t) if callable(spec.get('walls')) else spec.get('walls') or []
                for k in wallFrames[frame]:
                    gap = WallGap(wallGaps[k][0], walls) if walls else math.inf
                    wallGaps[k][3] = max(wallGaps[k][3], gap)
                    wallGaps[k][4] = min(wallGaps[k][4], gap)
                    if os.environ.get('OPENING_DEBUG'):
                        print('WALLGAP %s t=%.2f %s %.4f' % (clip, t, wallGaps[k][0], gap * scale), flush=True)
                if os.environ.get('OPENING_WALLPROBE') and walls:
                    print('WALLPROBE %s t=%.2f %s' % (clip, t, ' '.join('%s=%.3f' % (r, WallGap(r, walls) * scale) for r in WALL_REGIONS)), flush=True)
            if frame in (0, count // 2, count - 1) or frame in review:
                samples[-1]['regions'] = ctx['RegionLows']()
                if spec.get('walls'):
                    samples[-1]['wall'] = WallPenetration(meshes, spec['walls'](t) if callable(spec['walls']) else spec['walls'])
                    if os.environ.get('OPENING_DEBUG'):
                        print('DBGWALL %s t=%.2f %.4f' % (clip, t, samples[-1]['wall']), flush=True)
            if frame in review:
                RenderReview(clip, frame, t, spec, modelId)
            arm.animation_data.action = action
            for name in names:
                pb = arm.pose.bones[name]
                pb.keyframe_insert('location', frame=frame)
                pb.keyframe_insert('rotation_quaternion', frame=frame)
        twistEnd[clip] = (dict(twistPrev), dict(uaPrev), dict(faPrev))
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
        if spec.get('player'):
            # First-person partner (Shunzi): body points the director drives the camera and
            # first-person arms with; runtime metres, three.js actor frame, 12 samples/s.
            rows = {}
            for i in range(int(round(duration * 12)) + 1):
                for part, point in spec['player'](min(duration, i / 12)).items():
                    rows.setdefault(part, []).extend(Round([-point[0] * scale, point[2] * scale, point[1] * scale], 4))
            row['player'] = {'fps': 12, 'parts': rows}
        clipsOut[clip] = row
        if dump:
            partnerDump[clip] = {'fps': FPS, 'duration': duration, 'scale': scale, 'points': dump, 'skeleton': skeleton}
        report = Validate(clip, spec, samples, lifts, gripErrors, seam, scale)
        if wallGaps:
            # Each declared wall contact [limb, t0, t1, largest gap, smallest gap] (runtime metres; a
            # negative gap is skin inside the wall): the region must stay ON the wall -- off it by at
            # most 3 cm and into it by at most 3 cm -- for the whole window.
            report['wallContacts'] = [[limb, round(t0, 4), round(t1, 4), round(gap * scale, 4), round(low * scale, 4)]
                                      for limb, t0, t1, gap, low in wallGaps]
            report['wallContactGapM'] = round(max(row[3] for row in wallGaps) * scale, 4)
            report['wallContactDepthM'] = round(max(0.0, -min(row[4] for row in wallGaps) * scale), 4)
        report['seconds'] = round(time.time() - started, 1)
        reports.append(report)
        print('   REGIONS', json.dumps(report['regions']), 'WALL', report.get('wallPenetrationM'), flush=True)
        print('CLIP %-26s %s frames %3d lift %.3f..%.3f grip %.4f slide %.4f knee %.4f wallgap %s contact %.4f(%s, >3cm %d) seam %.1e %.0fs %s' % (
            clip, modelId, count, min(lifts), max(lifts), max(gripErrors), report['footSlideM'], report['kneeSlideM'],
            report.get('wallContacts'),
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
        previous = json.loads(file.read_text())
        merged = previous['clips']
        merged.update(clipsOut)
        clipsOut = {name: merged[name] for name in CLIPS if name in merged and name in onRig}
        propMounts = dict(previous.get('propMounts') or {}, **propMounts)
    asset = {'schema': 2, 'modelId': modelId, 'fps': FPS, 'stride': 7, 'bones': names, 'clips': clipsOut,
             'contactPoints': contactPoints, 'originalModelSha256': Sha(source),
             **({'propMounts': propMounts} if propMounts else {}),
             'authoringTool': 'Blender ' + bpy.app.version_string + ' (bpy; headless or BlenderMCP exec)'}
    temporary = file.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(asset, separators=(',', ':')), encoding='utf-8')
    temporary.replace(file)
    reportFile = private / ('Data_' + modelId + 'OpeningValidation.json')
    if selectedClips and reportFile.exists():
        old = {row['clip']: row for row in json.loads(reportFile.read_text())['clips']}
        old.update({row['clip']: row for row in reports})
        reports = [old[name] for name in CLIPS if name in old and name in onRig]
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
        Op = base['Op']                  # the captives module's GUI-context operator runner
        Op(bpy.ops.file.pack_all)
        Op(bpy.ops.wm.save_as_mainfile, filepath=str(blend), compress=True)
    print('OPENING_BAKED', modelId, len(clipsOut), str(file), flush=True)
    return {'id': modelId, 'file': file.name, 'sha256': Sha(file), 'originalModelSha256': asset['originalModelSha256'],
            'blend': str(blend), 'contactPoints': contactPoints,
            'clips': [{k: row.get(k) for k in ('clip', 'frames', 'floorCorrectionMin', 'floorCorrectionMax',
                                               'footSlideM', 'contactErrorM', 'gripSolveErrorM', 'wallPenetrationM',
                                               'pelvisMaxStepM', 'root', 'overreach')} for row in reports]}


def WallPenetration(meshes, walls):
    """Deepest skinned vertex behind any wall plane (point, inward normal), source metres.
    A wall may carry an edge (edgePoint, edgeDir): it then exists only where
    (q - edgePoint) . edgeDir >= 0 -- a corner the body leans past."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    worst = 0.0
    planes = [(Vector(w[0]), Vector(w[1]).normalized(),
               (Vector(w[2]), Vector(w[3]).normalized()) if len(w) > 2 else None) for w in walls]
    for o in meshes:
        ev = o.evaluated_get(depsgraph)
        mesh = ev.to_mesh()
        m = ev.matrix_world
        for v in mesh.vertices:
            q = m @ v.co
            for p, n, edge in planes:
                if edge is not None and (q - edge[0]).dot(edge[1]) < 0:
                    continue
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
              'gripSolveErrorM': round(max(gripErrors) * scale, 5),
              # Declared foot plants [side, t0, t1] (clip seconds): the browser review measures
              # the runtime foot drift inside exactly these windows.
              'plants': [[side, round(t0, 4), round(t1, 4)] for side, t0, t1 in spec.get('plants', [])]}
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
    # Knees on the ground (kneeling clips): the knee joint must hold inside each declared window.
    report['kneePlants'] = [[side, round(t0, 4), round(t1, 4)] for side, t0, t1 in spec.get('kneePlants', [])]
    worst = 0.0
    for side, t0, t1 in spec.get('kneePlants', []):
        window = [s for s in samples if t0 - 1e-6 <= s['t'] <= t1 + 1e-6]
        if len(window) >= 2:
            a = Vector(window[0]['knee' + side])
            worst = max(worst, max((Vector(s['knee' + side]) - a).length for s in window) * scale)
    report['kneeSlideM'] = round(worst, 4)
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
    def Root(s):
        # Ground point under the pelvis and the hips' facing, runtime metres, three.js frame.
        left = Vector(s['left'])
        fx, fy = left.y, -left.x                    # forward = left x up, in the ground plane (Blender)
        yaw = math.degrees(math.atan2(fx, -fy)) if abs(fx) + abs(fy) > 1e-6 else 0.0
        return [round(-s['pelvis'][0] * scale, 4), round(s['pelvis'][1] * scale, 4), round(yaw, 2),
                round(s['pelvis'][2] * scale, 4)]
    report['root'] = {'start': Root(samples[0]), 'end': Root(samples[-1]),
                      'note': '[x, z, yawDeg(+ = turned left), pelvisHeight] of the pelvis at the first/last frame'}
    steps = [(Vector(b['pelvis']) - Vector(a['pelvis'])).length * scale for a, b in zip(samples, samples[1:])]
    report['pelvisMaxStepM'] = round(max(steps), 4) if steps else 0.0
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
            row.setdefault('blend', str(private / ('Scene_' + modelId + 'OpeningStoryboards.blend')))
            # Validation numbers of the bake (runtime metres) from the private report, so the
            # repository test can gate foot slide, contact error and pelvis continuity.
            report = private / ('Data_' + modelId + 'OpeningValidation.json')
            if report.exists():
                keep = ('frames', 'footSlideM', 'contactErrorM', 'gripSolveErrorM', 'wallPenetrationM',
                        'pelvisMaxStepM', 'floorCorrectionMin', 'floorCorrectionMax', 'root', 'finite', 'plants',
                        'kneePlants', 'kneeSlideM', 'wallContacts', 'wallContactGapM', 'wallContactDepthM')
                row['clips'] = [dict({'clip': c['clip']}, **{k: c[k] for k in keep if k in c})
                                for c in json.loads(report.read_text())['clips'] if c['clip'] in asset['clips']]
    manifest = {'schema': 2, 'version': VERSION, 'fps': FPS, 'actorForward': [0, 0, -1], 'blendSeconds': .12,
                'floorClearanceM': CLEARANCE,
                'coordinates': {
                    'values': 'glTF node-local bone transforms (p xyz, q xyzw), stride 7',
                    'props': 'glTF scene space = rig.root local, source metres: origin xyz, axis xyz, up xyz, visible',
                    'stages': 'runtime metres in the anchor actor frame (+x right, +y up, -z forward); yawDeg + = turn left',
                    'contacts': 'clip seconds; partner parts are contactPoints names; standoffM = runtime metres along the patch normal where the knuckle centroid (finger roots) sits'},
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
