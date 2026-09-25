"""01–02 opening action library on the five production rigs.

Run headless (one process per rig; the rigs are independent, so they bake in parallel):

    blender --background --python-exit-code 1 --python Taierzhuang1938/_import/Script_OpeningStoryboardBake.py

or send the same file through `node scripts/Script_BlenderMcp.mjs exec --file` (same bpy
path; start/stop the instance around it). Environment:

  OPENING_PROJECT    absolute Taierzhuang1938 directory (required)
  OPENING_BLEND_DIR  editable scenes, validation and partner tracks; never inside the
                     repository (default OneDrive/AI/Models/Blender/Taierzhuang1938/
                     OpeningStoryboards_20260926HumanoidV1 -- the 20260922/20260923/20260925
                     Lugou-rig sources stay untouched; the 0926 folder started as a copy of
                     the 0925 partner tracks, renamed to the Tengxian rig ids)
  OPENING_VERSION    manifest version (default 20260926OpeningStoryboardsV5HumanoidV1)
  OPENING_MODEL      comma list of rigs (default all five)
  OPENING_CLIPS      comma list: bake only these clips and merge into the rig's JSON. A clip's only
                     inputs from other clips are the arm-roll seeds of its `prev` clip (below): a
                     partial bake gives the same frames as a from-scratch bake of every clip.
  OPENING_PASS       'bake' (default) | 'partner' (dump the partner tracks the paired
                     clips aim their hands at -- run it before 'bake') | 'manifest'
                     (rewrite the manifest from the rig files on disk, no Blender work) |
                     'verify' (bake as 'bake' but write ONLY the baked clips to
                     tmp/OpeningStoryboards/Verify -- no report, scene or manifest -- then
                     `node Taierzhuang1938/Script_OpeningStoryboardsTest.mjs
                     --rebake=tmp/OpeningStoryboards/Verify` compares them with the committed
                     files: every bone within 0.5 deg and 1 mm on every frame)
  OPENING_RENDER     '1' renders review stills to tmp/OpeningStoryboards/BlenderReview
  OPENING_SKIP_BLEND '1' skips saving the editable scene while iterating

Reproducibility (2026-09-25 review): each clip starts from a clean solver state (grounding lift,
hand/forearm/finger rate limits). A clip that continues another on the same root (`prev`) takes
its forearm-twist branch, arm rolls and grounding lift (rig JSON `endLift`) from the LAST WRITTEN
FRAME of the first `prev` clip that
bakes before it on this rig -- the one baked in this run, or else the committed repository file
(the same numbers, which 'verify' checks) -- so baking one clip alone gives the frames a full
bake gives.

It reuses the production-rig importer, two-bone IK, palm solver and original-local-frame
exporter of `_import/Script_MachineGunCaptivesBake.py`; meshes, skins and inverse binds are
never replaced. The clips are authored in `_import/Script_OpeningStoryboardClips.py`; this
file is the frame loop, grounding, grip pinning, prop tracks, validation and export.

Authoring space is Blender metres on the rig's *source* scale: +Z up, character forward
-Y, character's own left +X, ground z = 0, actor root at the origin.

TengxianHumanoidV1 (2026-09-26): the rigs are the shared-skeleton bodies. The clips keep the
source metres they were authored in on the Lugou rigs: the importer poses an authoring copy
of each body scaled by f (Script_MachineGunCaptivesBake AUTHORING_SCALE / AuthoringRig), and
everything written in the rig's own node units -- bone values, prop tracks, contact point
offsets, prop mounts, endLift -- is divided by f on the way out (multiplied on the way in). Every frame is lifted
so the lowest skinned vertex rests at CLEARANCE. Anything a director or partner reads is
in RUNTIME metres (source x scale) in the three.js actor frame (+x right, +y up, -z
forward): runtime = (-X, Z, Y) * scale.
"""
import bpy, os, runpy, json, math, hashlib, time
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion

project = Path(os.environ['OPENING_PROJECT'])
private = Path(os.environ.get('OPENING_BLEND_DIR')
               or 'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/OpeningStoryboards_20260926HumanoidV1')
VERSION = os.environ.get('OPENING_VERSION') or '20260926OpeningStoryboardsV5HumanoidV1'
committedDir = project / 'Animation/OpeningStoryboards'
output = Path(os.environ.get('OPENING_OUTPUT') or (project.parent / 'tmp/OpeningStoryboards/Verify'
                                                   if os.environ.get('OPENING_PASS') == 'verify' else committedDir))
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
MODELS = ['TengxianNra02', 'TengxianNra05', 'TengxianIja01', 'TengxianIja02', 'TengxianIja03']
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
# Reach assist (Solve): where it starts (fraction of the bare arm length, shoulder to grip), how far
# the pelvis may travel over the planted feet (source m) and how much extra trunk lean it may add
# (rad). A clip may override any of them with spec 'reach': {'fraction', 'travel', 'bend'} (a number
# or a function of the clip time; 'sides' limits the fraction to those hands, 'fractionBySide'
# gives each hand its own number or function of time). TengxianHumanoidV1 (2026-09-26): the IJA shoulders
# sit ~5 cm further back and 3.6 cm higher and the arm is 2.4 cm shorter than IJA02's own (NRA02
# proportions), and a grasping hand's finger-root centroid stops ~0.85 arm lengths out, so at .92 the
# assist never woke for the hair hold; the clips that grip at the end of their reach override it
# (Script_OpeningStoryboardClips REACH_HUMANOID_V1). OPENING_REACH_* are for experiments only.
REACH_FRACTION = float(os.environ.get('OPENING_REACH_FRACTION') or .92)
REACH_TRAVEL = float(os.environ.get('OPENING_REACH_TRAVEL') or .10)
REACH_BEND = float(os.environ.get('OPENING_REACH_BEND') or .25)
ARM_PASSES = int(os.environ.get('OPENING_ARM_PASSES') or 4)   # ArmSolve grip-pinning passes


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
    # Authoring source metres -> runtime metres (the Lugou rig's targetHeight / rest top; see the module doc).
    scale = ctx['nominalScale']
    unitF = ctx['authoringFactor']   # authoring copy / shipped body; written node-unit numbers are divided by it

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

    # The face of the head at rest looks along the character's forward (-Y); kept in the head
    # bone's own frame so the look check (spec 'look': the point a clip aims the face at, e.g.
    # the first-person player's eye) measures where the face really points on every frame.
    Reset()
    headRest = BWorld(Bone('Head')).to_quaternion()
    faceLocal = headRest.inverted() @ Vector((0, -1, 0))
    eyeLocal = headRest.inverted() @ Vector((0, -.09, .10))
    neckRest = BWorld(Bone('Neck')).to_quaternion().inverted() @ headRest

    def FaceError(target):
        """Angle (deg) between the face direction and the eye -> target line, and the head's
        turn against the neck (deg, from its rest relation)."""
        loc, q, _ = BWorld(Bone('Head')).decompose()
        face = q @ faceLocal
        eye = loc + q @ eyeLocal
        want = Vector(target) - eye
        err = math.degrees(face.angle(want)) if want.length > 1e-6 else 0.0
        rel = BWorld(Bone('Neck')).to_quaternion().inverted() @ q
        turn = math.degrees(neckRest.rotation_difference(rel).angle)
        return err, min(turn, 360 - turn)

    K = dict(ctx)
    K.update({'scale': scale, 'ContactWorld': ContactWorld, 'Reset': Reset,
              'partnerTracks': {f.stem.split('_')[-1]: json.loads(f.read_text()) for f in private.glob(PARTNER_GLOB)}})
    # The grounding lift of the previous frame (Solve's solveState, defined below): AimHead aims from
    # where the eye ends up after grounding, as the reach assist does for the grips.
    K['GroundLift'] = lambda: solveState['lift']
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
        couple of arm-only passes close the gap without re-solving the body.

        Only the last pass reports an overreach: the first pass aims the WRIST at the grip
        point (a hand length too far), so it read every relaxed arm easing onto a grip as
        1.1-1.3 of its length although the converged arm was bent (2026-09-25)."""
        hand = Bone(side + ' Hand')
        target = Vector(grip)
        wrist = target.copy()
        reported = []
        for _ in range(ARM_PASSES):
            mark = len(ctx['overreach'])
            ctx['Chain'](Bone(side + ' UpperArm'), Bone(side + ' Forearm'), hand, wrist, Vector(pole), label='grip' + side)
            reported = ctx['overreach'][mark:]
            del ctx['overreach'][mark:]
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
        ctx['overreach'].extend(reported)
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
        assist = spec.get('reach') or {}
        fraction = assist.get('fraction', REACH_FRACTION)
        fraction = fraction(t) if callable(fraction) else fraction
        travel, lean = assist.get('travel', REACH_TRAVEL), assist.get('bend', REACH_BEND)
        travel, lean = (travel(t) if callable(travel) else travel), (lean(t) if callable(lean) else lean)
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
                own = assist.get('sides', 'LR')
                start = (assist.get('fractionBySide') or {}).get(side, fraction if side in own else REACH_FRACTION)
                start = reach * (start(t) if callable(start) else start)
                if want.length > start:
                    excess += want.normalized() * (want.length - start) * w
            if excess.length < .0015:
                break
            px, py, pz = p['pelvis']
            # Only ever sink toward a low grip; lifting the pelvis would pull the planted feet
            # up, and more than ~10 cm of sideways travel straightens the planted legs.
            moved = Vector((px, py, 0)) - Vector((p0[0], p0[1], 0)) + Vector((excess.x, excess.y, 0))
            if moved.length > travel:
                # The hips have gone as far as the planted feet allow: lean the trunk into
                # the rest (up to +0.25 rad of bend by default), which is what a man reaching does.
                over = moved.length - travel
                moved = moved.normalized() * travel
                p['bend'] = min(bend0 + lean, p.get('bend', 0.0) + over / .45)
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
    committedFile = committedDir / ('Animation_' + modelId + 'OpeningStoryboards.json')
    committed = json.loads(committedFile.read_text()) if committedFile.exists() else {'clips': {}}
    depth = {name: len(arm.pose.bones[name].parent_recursive) for name in names}

    def PoseFromValues(bones, values):
        """Put the rig in one written frame (glTF node-local p xyz, q xyzw per bone): SourcePose inverted."""
        nodes, parents, nodeIndex = ctx['nodes'], ctx['parents'], ctx['nodeIndex']
        local = {name: values[i * 7:i * 7 + 7] for i, name in enumerate(bones)}
        world = {}

        def Node(name):
            if name not in world:
                i = nodeIndex[name]
                parent = parents.get(i)
                if parent is None:
                    pm = Matrix.Identity(4)
                else:
                    pname = nodes[parent].get('name')
                    pm = Node(pname) if pname in local else ctx['sourceWorld'][parent]
                v = local[name]
                world[name] = pm @ Matrix.LocRotScale(Vector(v[:3]) * unitF, Quaternion((v[6], v[3], v[4], v[5])),
                                                      Vector(nodes[i].get('scale', [1, 1, 1])))
            return world[name]
        Reset()
        for name in sorted(local, key=lambda n: depth[n]):
            ctx['Put'](arm.pose.bones[name], convert @ Node(name) @ corrections[name].inverted())

    def SeedsFromValues(bones, values):
        """ArmRoll's carried state for the frame `values`: the forearm-twist branch (twice the forearm's roll about
        its own axis against the same forearm re-aimed from rest -- the forearm takes half the twist) and the
        upper-arm / forearm world rotations with their axes."""
        twist, ua, fa = {}, {}, {}
        for side in 'LR':
            PoseFromValues(bones, values)
            u_, f_, h_ = Bone(side + ' UpperArm'), Bone(side + ' Forearm'), Bone(side + ' Hand')
            S, E, Wr = Point(u_), Point(f_), Point(h_)
            a = (Wr - E).normalized()
            ua[side] = (BWorld(u_).to_quaternion(), (E - S).normalized())
            fa[side] = (BWorld(f_).to_quaternion(), a.copy())
            f_.matrix_basis = ctx['rest'][f_.name]
            Update()
            ctx['Aim'](f_, h_, Wr)
            rel = fa[side][0] @ BWorld(f_).to_quaternion().inverted()
            roll = 2 * math.atan2(Vector((rel.x, rel.y, rel.z)).dot(a), rel.w)
            twist[side] = 2 * ((roll + math.pi) % (2 * math.pi) - math.pi)
        Reset()
        return twist, ua, fa
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
        looks, probes = [], {}
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
        # The reach assist reads the previous frame's grounding lift; a clip's first frame must not read
        # the last frame of whichever clip was baked before it (a partial and a full bake then differ --
        # 10 cm on IjaStartleTurn frame 0 after the parried fall's corpse). A continuation (below) starts
        # from its `prev` clip's last lift -- that IS the frame before -- and anything else from 0.
        solveState['lift'] = 0.0
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
        # The first `prev` that bakes before this clip on this rig (what a full bake has in twistEnd); when
        # this run did not bake it, its last frame comes from the committed file.
        earlier = onRig[:onRig.index(clip)]
        for before in meta.get('prev') or []:
            if before not in earlier:
                continue
            if before not in twistEnd and before in committed['clips']:
                row = committed['clips'][before]
                last = len(committed['bones']) * 7 * (row['frameCount'] - 1)
                twistEnd[before] = SeedsFromValues(committed['bones'], row['values'][last:]) + (row.get('endLift', 0.0) * unitF,)
                print('   SEED', clip, 'from committed', before, flush=True)
            if before in twistEnd:
                twistSeed.update(twistEnd[before][0])
                uaSeed.update(twistEnd[before][1])
                faSeed.update(twistEnd[before][2])
                solveState['lift'] = twistEnd[before][3]
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
            if spec.get('look'):
                target = spec['look'](t)
                if target is not None:
                    err, turn = FaceError(target)
                    looks.append((t, err, turn))
            # Prop-to-player contacts (a rifle butt on the head): name -> (point, point) in source
            # metres at the frames the clip declares them; the report keeps the largest gap.
            for name, pair in ((spec['probes'](t) or {}).items() if spec.get('probes') else ()):
                if pair is not None:
                    gap = (Vector(pair[0]) - Vector(pair[1])).length * scale
                    if gap > probes.get(name, (-1, 0))[0]:
                        probes[name] = (gap, t)
            values.extend(ctx['SourcePose']())
            if props:
                track = spec['props'](t)
                for name in props:
                    row = track.get(name)
                    if row is None:
                        props[name].extend([0, 0, 0, 0, 0, -1, 0, 1, 0, 0])
                        continue
                    origin = (convertInv @ Vector(row[0])) / unitF   # shipped rig-root units
                    axis = (convertInv.to_3x3() @ Vector(row[1])).normalized()
                    up = convertInv.to_3x3() @ Vector(row[2])
                    up = (up - axis * up.dot(axis)).normalized()
                    props[name].extend(Round([*origin, *axis, *up, 1.0 if row[3] else 0.0], 5))
                for name, (role, atFrame) in (spec.get('mountFrames') or {}).items():
                    if frame == atFrame and name in props:
                        row = props[name][-10:]
                        bone = Bone(role).name
                        inverse = NodeWorld(bone).inverted()
                        o = (inverse @ (Vector(row[0:3]) * unitF)) / unitF
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
                      Round(ctx['GripPoint']('L')[:], 3), Round(ctx['GripPoint']('R')[:], 3),
                      {k: Round(v, 3) for k, v in c.items() if v}), flush=True)
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
        stride = len(names) * 7
        seam = max(abs(values[i] - values[len(values) - stride + i]) for i in range(stride)) if loop else 0.0
        if loop:
            values[-stride:] = values[:stride]
            for name in props:
                props[name][-10:] = props[name][:10]
        action.use_fake_user = True
        arm.animation_data.action = None
        # What a clip that continues this one starts from: the written last frame (not the solver's running
        # state, which a loop's seam copy or an authored clip leaves out of step with it).
        # (+ the grounding lift of that frame: a loop's last frame is its first)
        endLift = round(lifts[0] if loop else lifts[-1], 6)
        twistEnd[clip] = SeedsFromValues(names, values[-stride:]) + (endLift,)
        nla = arm.animation_data.nla_tracks.new()
        nla.name = clip
        nla.mute = True
        nla.strips.new(clip, 0, action)
        row = {'duration': duration, 'loop': loop, 'weaponHold': meta['weaponHold'], 'frameCount': count, 'values': values,
               'endLift': round(endLift / unitF, 6)}   # bake bookkeeping (shipped node units): what a partial bake of a continuation starts from
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
        if looks:
            # Where the face points (spec 'look'): the largest miss while the aim is on, and the
            # largest turn of the head on the neck (a face turned past ~70 deg reads broken).
            report['lookErrorDeg'] = round(max(err for _, err, _ in looks), 2)
            report['headTurnDeg'] = round(max(turn for _, _, turn in looks), 2)
        if probes:
            report['probes'] = {name: [round(gap, 4), round(at, 4)] for name, (gap, at) in probes.items()}
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
        if report.get('lookErrorDeg') is not None or report.get('probes'):
            print('   LOOK', report.get('lookErrorDeg'), 'HEADTURN', report.get('headTurnDeg'), 'PROBES', report.get('probes'), flush=True)
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
    if selectedClips and file.exists() and PASS != 'verify':
        previous = json.loads(file.read_text())
        merged = previous['clips']
        merged.update(clipsOut)
        clipsOut = {name: merged[name] for name in CLIPS if name in merged and name in onRig}
        propMounts = dict(previous.get('propMounts') or {}, **propMounts)
    # Contact patches in the shipped bone frames (the solver above used the authoring copy's).
    shippedPoints = {name: dict(row, offset=Round([v / unitF for v in row['offset']], 5)) for name, row in contactPoints.items()}
    asset = {'schema': 2, 'modelId': modelId, 'skeleton': 'TengxianHumanoidV1', 'fps': FPS, 'stride': 7, 'bones': names, 'clips': clipsOut,
             'contactPoints': shippedPoints, 'originalModelSha256': Sha(source),
             **({'propMounts': propMounts} if propMounts else {}),
             'authoringTool': 'Blender ' + bpy.app.version_string + ' (bpy; headless or BlenderMCP exec)'}
    temporary = file.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(asset, separators=(',', ':')), encoding='utf-8')
    temporary.replace(file)
    if PASS == 'verify':
        print('OPENING_VERIFY_BAKED', modelId, len(clipsOut), str(file), flush=True)
        return {'id': modelId, 'verify': list(clipsOut)}
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
            'blend': str(blend), 'contactPoints': shippedPoints,
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
    for row in spec.get('reviewViews') or [('side', (-3.4, -.35, 1.05), (0, -.25, .75)),
                                           ('q', (-2.3, -2.9, 1.9), (0, -.25, .65))]:
        # (name, location, target) = orthographic review; (name, location, target, vfovDeg[, rollDeg])
        # = a perspective camera, e.g. the storyboard's first-person eye. location/target may be
        # functions of the clip time (a camera riding the player track).
        view, location, target = row[:3]
        location = location(t) if callable(location) else location
        target = target(t) if callable(target) else target
        q = (Vector(target) - Vector(location)).to_track_quat('-Z', 'Y')
        if len(row) > 4 and row[4]:
            q = q @ Quaternion((0, 0, 1), math.radians(row[4]))
        reviewCamera.location = location
        reviewCamera.rotation_euler = q.to_euler()
        if len(row) > 3:
            reviewCamera.data.type = 'PERSP'
            reviewCamera.data.sensor_fit = 'VERTICAL'
            reviewCamera.data.angle = math.radians(row[3])
            reviewCamera.data.clip_start = .02
            scene.render.resolution_x, scene.render.resolution_y = 640, 360
        else:
            reviewCamera.data.type = 'ORTHO'
            reviewCamera.data.ortho_scale = spec.get('reviewScale', 2.8)
            scene.render.resolution_x, scene.render.resolution_y = 520, 600
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
            blend = private / ('Scene_' + modelId + 'OpeningStoryboards.blend')
            if blend.exists() or 'blend' not in row:
                row['blend'] = str(blend)
            # Validation numbers of the bake (runtime metres) from the private report, so the
            # repository test can gate foot slide, contact error and pelvis continuity.
            report = private / ('Data_' + modelId + 'OpeningValidation.json')
            if report.exists():
                keep = ('frames', 'footSlideM', 'contactErrorM', 'gripSolveErrorM', 'wallPenetrationM',
                        'pelvisMaxStepM', 'floorCorrectionMin', 'floorCorrectionMax', 'root', 'finite', 'plants',
                        'kneePlants', 'kneeSlideM', 'wallContacts', 'wallContactGapM', 'wallContactDepthM',
                        'lookErrorDeg', 'headTurnDeg', 'probes')
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
