"""Author a facial source scene (bones, weights, oral geometry, poses) in Blender.

Builds Scene_<Model>FacialTalk for a shipped Lugou body GLB so that
Script_BakeCharacterFacial.py can bake Model_Lugou<Model>Facial.glb from it.
Everything here is in the GLB head node's frame (Biped: X up, Y forward, Z to the
character's left; centimetres), the same Head-local convention as the reviewed
NRA05 rig, so the runtime blends every face with one controller.

  * Rig_<Model>Facial: armature whose object matrix is the GLB head world, so
    armature space == Head-local cm. Face_* bones have identity rest rotation.
  * Skin_<Model>_P<n>: GLB primitives rebuilt vertex-for-vertex (int attribute
    glbIndex, object prop glbPrim); only Face_* vertex groups plus the head group.
  * Oral_<Model>_*: cavity tube from the lip loop, teeth rows, tongue
    (object prop facialOral = Cavity/Teeth/Tongue).
  * Animation_<Model>FacialPoses: one keyed frame per pose (POSE_FRAMES).

Weights are procedural functions of Head-local position around measured landmarks
(lip loop, corners, eyeballs), so coincident seam vertices always move together.
Run through Blender (`node scripts/Script_BlenderMcp.mjs exec --file <wrapper>`):
    FACIAL_AUTHOR = {'repo': <worktree>, 'model': 'Nra02', 'save': <.blend path or None>,
                     'preview': <png dir or None>}
    exec(compile(open(path).read(), path, 'exec'))
Source projects live in OneDrive/AI/Models/Blender/Taierzhuang1938/FacialRigs_20260923.
"""
import bpy, bmesh, json, math, os, struct, importlib.util
import numpy as np
from mathutils import Matrix, Vector, Quaternion

POSE_FRAMES = {'Rest': 1, 'Open': 10, 'Wide': 20, 'Round': 30, 'Close': 40, 'Blink': 50,
               'BrowUp': 60, 'Snarl': 70, 'DeadSlack': 80}

# Per-model inputs. Hints are GLB world metres (measured from the shipped files);
# everything else is derived from the mesh.
MODELS = {
    'Nra02': {'base': 'Model_LugouNra02.glb', 'head': 'Bip002 Head', 'skinPrim': 0,
              'mouthHint': (-0.003, 1.603, 0.115), 'eyePrim': 5, 'eyeHintY': 1.680,
              'rigidPrims': [2, 6], 'eyeOpening': (1.35, 0.58)},
    'Ija02': {'base': 'Model_LugouIja02.glb', 'head': 'Bip001 Head', 'skinPrim': 0,
              'mouthHint': (-0.002, 1.566, 0.109), 'eyePrim': 0, 'eyeHintY': 1.621,
              'rigidPrims': [2, 3], 'eyeOpening': (1.10, 0.44), 'lidSkin': .30,
              'mouth': (4.40, 2.20),
              # The IJA head already carries a dark mouth tube behind the lips; it opens with
              # the split, so only teeth and tongue are added, set deeper inside it.
              'cavity': False, 'teethBack': .45},  # sealed lips: lip line and half width, Head-local cm
}

# Pose deltas in Head-local cm (up, forward, outward for paired bones) and jaw
# degrees about Head +Z (opens). Values follow the NRA05 review rig's ranges
# (jaw 10.3 deg, corners 1.8-2.4 mm, lids 6.7 mm) with the added expressions.
POSES = {
    'Open':  {'Jaw': 13.0, 'LipUpper': (.12, .05, 0), 'LipLower': (-.08, .08, 0), 'Corner': (-.10, .04, -.12)},
    'Wide':  {'Jaw': 4.0, 'LipUpper': (.10, -.03, 0), 'LipLower': (-.05, -.03, 0), 'Corner': (.12, -.12, .34)},
    'Round': {'Jaw': 6.0, 'LipUpper': (.04, .30, 0), 'LipLower': (.04, .28, 0), 'Corner': (.02, .28, -.42)},
    'Close': {'LipUpper': (-.10, .04, 0), 'LipLower': (.16, .05, 0), 'Corner': (0, .02, -.04)},
    'Blink': {'LidUpper': 'blink', 'LidLower': (.16, .04, 0)},
    'BrowUp': {'Brow': (.36, .05, .03), 'LidUpper': (.07, 0, 0)},
    'Snarl': {'Jaw': 3.0, 'Brow': (-.26, .08, -.20), 'LipUpper': (.26, .05, 0), 'Corner': (-.04, -.05, .16),
              'LidLower': (.12, .02, 0)},
    'DeadSlack': {'Jaw': 9.0, 'LidUpper': 'half', 'Corner': (-.14, -.03, .02), 'LipLower': (-.05, 0, 0)},
}


def Baker(repo):
    path = os.path.join(repo, 'Taierzhuang1938', '_import', 'Script_BakeCharacterFacial.py')
    spec = importlib.util.spec_from_file_location('Script_BakeCharacterFacial', path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


def Smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def Components(indices, count):
    parent = list(range(count))
    def Find(a):
        while parent[a] != a: parent[a] = parent[parent[a]]; a = parent[a]
        return a
    for tri in indices.reshape(-1, 3):
        a, b, c = (Find(int(x)) for x in tri)
        parent[b] = a; parent[Find(c)] = a
    return np.array([Find(i) for i in range(count)])


def Weld(points):
    key = np.round(points * 1e4).astype(np.int64)
    _, inverse = np.unique(key, axis=0, return_inverse=True)
    return inverse.ravel()


def BoundaryLoops(indices, weld):
    tris = weld[indices.reshape(-1, 3)]
    edges = np.sort(np.concatenate([tris[:, [0, 1]], tris[:, [1, 2]], tris[:, [2, 0]]]), axis=1)
    unique, counts = np.unique(edges, axis=0, return_counts=True)
    boundary = unique[counts == 1]
    adjacency = {}
    for a, b in boundary: adjacency.setdefault(a, []).append(b); adjacency.setdefault(b, []).append(a)
    seen = set(); loops = []
    for start in adjacency:
        if start in seen: continue
        stack = [start]; comp = []; seen.add(start)
        while stack:
            x = stack.pop(); comp.append(x)
            for y in adjacency[x]:
                if y not in seen: seen.add(y); stack.append(y)
        loops.append(comp)
    return loops


def FitSphere(points):
    A = np.c_[2 * points, np.ones(len(points))]; b = (points ** 2).sum(1)
    solution = np.linalg.lstsq(A, b, rcond=None)[0]
    center = solution[:3]; radius = math.sqrt(solution[3] + center @ center)
    return center, radius


class Source:
    """The shipped GLB, read through the baker's reader, in Head-local cm."""
    def __init__(self, repo, spec):
        self.baker = Baker(repo)
        self.glb = self.baker.Glb(os.path.join(repo, 'Taierzhuang1938', 'Model', 'Character', spec['base']))
        self.head = self.glb.World(self.glb.byName[spec['head']])
        self.headInverse = self.head.inverted()

    def Prim(self, index):
        p = self.glb.doc['meshes'][0]['primitives'][index]
        world = np.array(self.glb.Read(p['attributes']['POSITION']), dtype=np.float64)
        indices = np.array(self.glb.Read(p['indices']), dtype=np.int64).ravel() if 'indices' in p else np.arange(len(world))
        H = np.array(self.headInverse)
        local = world @ H[:3, :3].T + H[:3, 3]
        uv = np.array(self.glb.Read(p['attributes']['TEXCOORD_0'])) if 'TEXCOORD_0' in p['attributes'] else None
        return {'world': world, 'local': local, 'indices': indices, 'uv': uv, 'material': p.get('material')}

    def ToLocal(self, point):
        return np.array(self.headInverse @ Vector(point))


def Dijkstra(weld, indices, welded, seed):
    import heapq
    tris = weld[indices.reshape(-1, 3)]
    neighbours = {}
    for a, b, c in tris:
        for x, y in ((a, b), (b, c), (c, a)):
            neighbours.setdefault(int(x), set()).add(int(y)); neighbours.setdefault(int(y), set()).add(int(x))
    distance = np.full(len(welded), np.inf); distance[seed] = 0; heap = [(0.0, seed)]
    while heap:
        d, x = heapq.heappop(heap)
        if d > distance[x]: continue
        for y in neighbours.get(x, ()):
            nd = d + float(np.linalg.norm(welded[x] - welded[y]))
            if nd < distance[y]: distance[y] = nd; heapq.heappush(heap, (nd, y))
    return distance


def Landmarks(src, spec):
    skin = src.Prim(spec['skinPrim']); L = skin['local']
    weld = Weld(skin['world'])
    welded = np.zeros((weld.max() + 1, 3)); welded[weld] = L
    hint = src.ToLocal(spec['mouthHint'])
    if 'mouth' in spec:
        # Sealed lips (IJA heads): measured lip line and half width; corners are the
        # front-most skin points at that width.
        lipLine, halfWidth = spec['mouth']; midZ = float(hint[2]) if abs(hint[2]) < .5 else 0.0
        corners = []
        for sign in (1, -1):
            near = np.where((np.abs(welded[:, 0] - lipLine) < .6) & (np.abs(welded[:, 2] - midZ - sign * halfWidth) < .45))[0]
            corners.append(welded[near[np.argmax(welded[near, 1])]])
        mouth = []
    else:
        loops = BoundaryLoops(skin['indices'], weld)
        mouth = min(loops, key=lambda loop: np.linalg.norm(welded[loop].mean(0) - hint))
        ring = welded[mouth]
        front = ring[ring[:, 1] > ring[:, 1].max() - 1.2]  # lip edge, not an inner tube
        corners = [front[np.argmax(front[:, 2])], front[np.argmin(front[:, 2])]]
        center = front[np.abs(front[:, 2]) < .5]
        lipLine = float(np.median(center[:, 0])) if len(center) else float(front[:, 0].mean())
        halfWidth = float((corners[0][2] - corners[1][2]) / 2)
        midZ = float((corners[0][2] + corners[1][2]) / 2)
    lipFront = float(welded[(np.abs(welded[:, 2] - midZ) < .6) & (np.abs(welded[:, 0] - lipLine) < 1.2)][:, 1].max())

    def FrontAt(l):
        near = (np.abs(welded[:, 0] - lipLine) < 1.0) & (np.abs(welded[:, 2] - midZ - l) < .4)
        return float(welded[near, 1].max()) if near.any() else lipFront

    # Upper/lower lip sides by surface distance from a seed on each lip: the two lips
    # meet only at the corners (slit) or through a sealing membrane (split later).
    def Seed(up):
        target = np.array([lipLine + up, lipFront, midZ])
        return int(np.argmin(np.linalg.norm(welded - target, axis=1)))
    dUp = Dijkstra(weld, skin['indices'], welded, Seed(.85))
    dDown = Dijkstra(weld, skin['indices'], welded, Seed(-.95))
    # Eyes: two eyeball components near the eye height hint.
    eyePrim = src.Prim(spec['eyePrim'])
    eyeWeld = Weld(eyePrim['world'])
    comps = Components(eyeWeld[eyePrim['indices']].reshape(-1), eyeWeld.max() + 1)[eyeWeld]
    eyeHint = src.ToLocal((0, spec['eyeHintY'], spec['mouthHint'][2]))
    eyes = []
    for c in np.unique(comps):
        idx = np.where(comps == c)[0]; pts = eyePrim['local'][idx]
        size = pts.max(0) - pts.min(0)
        if not (1.5 < size[0] < 3.5 and 1.5 < size[2] < 3.5): continue
        if abs(pts[:, 0].mean() - eyeHint[0]) > 2.5: continue
        centerSphere, radius = FitSphere(pts)
        eyes.append({'indices': idx, 'center': centerSphere, 'radius': radius, 'front': float(pts[:, 1].max()),
                     'mid': pts.mean(0)})
    assert len(eyes) == 2, ('eyeballs not found', len(eyes))
    eyes.sort(key=lambda e: -e['mid'][2])  # L (+Z) first
    return {'skin': skin, 'weld': weld, 'mouthLoop': mouth, 'welded': welded, 'lipLine': float(lipLine),
            'lipFront': lipFront, 'halfWidth': float(halfWidth), 'midZ': float(midZ), 'corners': corners,
            'frontAt': FrontAt, 'side': dUp - dDown,  # >0: closer to the lower lip
            'tmj': np.array([lipLine + 1.0, lipFront - 11.0, midZ]), 'eyes': eyes, 'eyePrim': eyePrim}


def LipZone(L, lm):
    l = np.abs(L[:, 2] - lm['midZ'])
    return (Smooth(lm['halfWidth'] + .35, lm['halfWidth'] - .3, l) * Smooth(1.9, 1.2, np.abs(L[:, 0] - lm['lipLine']))
            * (L[:, 1] > lm['lipFront'] - 3.6))


def SplitLips(obj, lm):
    """Cut sealed lips apart: edges between upper-side and lower-side faces inside the
    mouth get their vertices duplicated, corners stay joined. Returns the per-vertex
    lower flag (1 lower lip, 0 upper, .5 undecided) for the (possibly longer) mesh,
    the number of cut edges and the lip-edge rim points (Head-local, lower flag)."""
    bm = bmesh.new(); bm.from_mesh(obj.data)
    layer = bm.verts.layers.int.get('glbIndex')
    local = lm['skin']['local']; weld = lm['weld']; side = lm['side']
    def Local(v): return local[v[layer]]
    lowerFace = {}
    for face in bm.faces:
        lowerFace[face] = float(np.mean([side[weld[v[layer]]] for v in face.verts])) > 0
    seam = []
    for edge in bm.edges:
        if len(edge.link_faces) != 2: continue
        a, b = edge.link_faces
        if lowerFace[a] == lowerFace[b]: continue
        pts = np.array([Local(v) for v in edge.verts])
        if (np.abs(pts[:, 2] - lm['midZ']) < lm['halfWidth'] - .08).all() and (LipZone(pts, lm) > .5).all():
            seam.append(edge)
    for face in bm.faces: face.tag = lowerFace[face]
    if seam: bmesh.ops.split_edges(bm, edges=seam)
    # Loose interior pieces inside the mouth (the IJA heads' own painted mouth bag)
    # would stretch across the new opening; the authored cavity replaces them.
    comps = Components(weld[lm['skin']['indices']], weld.max() + 1)
    main = np.bincount(comps).argmax(); eyes = set(int(i) for e in lm['eyes'] for i in e['indices'])
    drop = []
    for face in bm.faces:
        ids = [v[layer] for v in face.verts]
        if comps[weld[ids[0]]] == main or ids[0] in eyes: continue
        if np.abs(local[ids][:, 0] - lm['lipLine']).max() < 6 and (local[ids][:, 1] > lm['lipFront'] - 8).all(): drop.append(face)
    if drop: bmesh.ops.delete(bm, geom=drop, context='FACES_ONLY')
    lm['droppedInteriorFaces'] = len(drop)
    bm.verts.ensure_lookup_table()
    lower = np.full(len(bm.verts), .5)
    for v in bm.verts:
        flags = [f.tag for f in v.link_faces]
        if flags and all(flags): lower[v.index] = 1.0
        elif flags and not any(flags): lower[v.index] = 0.0
    rim = [(np.array(Local(v)), lower[v.index]) for v in bm.verts
           if any(len(e.link_faces) == 1 for e in v.link_edges) and LipZone(np.array([Local(v)]), lm)[0] > .3]
    bm.to_mesh(obj.data); bm.free(); obj.data.update()
    return lower, len(seam), rim


def FaceWeights(L, lm, spec, isEyeball=None, lower=None):
    """Procedural Face_* weights for Head-local points L (n x 3). lower is the
    per-vertex lip side from SplitLips (1 lower, 0 upper, .5 undecided)."""
    u, f, l = L[:, 0], L[:, 1], L[:, 2] - lm['midZ']
    um, fm, w = lm['lipLine'], lm['lipFront'], lm['halfWidth']
    tmj = lm['tmj']; uc = float(np.mean([c[0] for c in lm['corners']])); fc = float(np.mean([c[1] for c in lm['corners']]))
    front = f > fm - 3.6
    # Jaw: below the lip line at the mouth, below the corner->hinge line on the cheek.
    tl = np.clip((np.abs(l) - w) / (6.6 - w), 0, 1); tf = np.clip((fc - f) / (fc - tmj[1]), 0, 1)
    t = np.maximum(tl, tf)
    lineCenter = um + (uc - um) * np.clip(np.abs(l) / max(w, 1e-3), 0, 1) ** 2
    boundary = np.where(t > 0, uc + (tmj[0] - uc) * t ** 1.2, lineCenter)
    band = .16 + 1.3 * t
    jaw = Smooth(boundary + band * .5, boundary - band * .5, u)
    if lower is not None:
        # Inside the lips the side comes from topology, not height (the lips overlap).
        zone = LipZone(L, lm) * (lower != .5)
        jaw = zone * lower + (1 - zone) * jaw
    jaw *= Smooth(tmj[1] + .5, tmj[1] + 3.5, f)
    jaw *= Smooth(um - 8.0, um - 5.8, u)
    lipLower = np.exp(-(l / (w * .95)) ** 4 - ((u - (um - .5)) / .75) ** 2) * front * (jaw > .5)
    lipUpper = np.exp(-(l / (w * .95)) ** 4 - ((u - (um + .55)) / .80) ** 2) * front * (jaw < .5)
    out = {}
    for side, sign in (('L', 1), ('R', -1)):
        corner = lm['corners'][0 if sign > 0 else 1]
        c = .75 * np.exp(-(((l * sign) - abs(corner[2] - lm['midZ'])) / .9) ** 2 - ((u - corner[0]) / .8) ** 2
                         - ((f - corner[1]) / 1.3) ** 2) * (l * sign > 0)
        out['Face_Corner' + side] = c
    corner = out['Face_CornerL'] + out['Face_CornerR']
    out['Face_Jaw'] = jaw * np.clip(1 - .8 * lipLower - corner, 0, 1)
    out['Face_LipLower'] = jaw * .8 * lipLower
    out['Face_LipUpper'] = .8 * lipUpper * (1 - jaw) * (1 - corner)
    # Brows and lids around each eyeball; lid margins sit on the eyeball's front.
    A, B = spec['eyeOpening']
    for eye, side in zip(lm['eyes'], 'LR'):
        ec = eye['center']; du = u - ec[0]; dl = L[:, 2] - ec[2]
        onFace = f > eye['front'] - 1.6
        brow = .85 * np.exp(-(dl / 2.0) ** 2 - ((du - 1.9) / 1.0) ** 2) * onFace * Smooth(.4, 1.0, du)
        # Lids hinge at the eye corners: full weight on the margin at the middle of the
        # opening, fading to the canthi and over ~7 mm of lid skin above/below it.
        x = np.clip(np.abs(dl) / (A * 1.05), 0, 1)
        profile = np.sqrt(np.clip(1 - x ** 2, 0, 1)) * Smooth(1.0, .8, x)
        margin = B * np.sqrt(np.clip(1 - (dl / A) ** 2, 0, 1))
        upperLid = profile * Smooth(spec.get('lidSkin', .70), 0, du - margin) * Smooth(-.2, .15, du) * onFace
        lowerLid = .75 * profile * Smooth(.55, 0, -du - margin) * Smooth(.2, -.15, du) * onFace
        if isEyeball is not None: upperLid *= ~isEyeball; lowerLid *= ~isEyeball; brow *= ~isEyeball
        out['Face_Brow' + side] = brow * (1 - upperLid)
        out['Face_LidUpper' + side] = upperLid
        out['Face_LidLower' + side] = lowerLid
    return out


def MakeMesh(name, local, indices, scene, matrix, uv=None):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(p) for p in local], [], [tuple(int(i) for i in t) for t in indices.reshape(-1, 3)])
    if uv is not None:
        layer = mesh.uv_layers.new(name='UVMap')
        for loop in mesh.loops: layer.data[loop.index].uv = (uv[loop.vertex_index][0], 1 - uv[loop.vertex_index][1])
    obj = bpy.data.objects.new(name, mesh); scene.collection.objects.link(obj)
    obj.matrix_world = matrix
    return obj


def PreviewMaterial(src, primMaterial, folder, cache):
    if primMaterial is None: return None
    if primMaterial in cache: return cache[primMaterial]
    doc = src.glb.doc; material = doc['materials'][primMaterial]
    result = bpy.data.materials.new('Preview_' + material.get('name', str(primMaterial)))
    tex = material.get('pbrMetallicRoughness', {}).get('baseColorTexture')
    if tex is not None:
        texture = doc['textures'][tex['index']]
        source = texture.get('source', texture.get('extensions', {}).get('EXT_texture_webp', {}).get('source'))
        image = doc['images'][source]; view = doc['bufferViews'][image['bufferView']]
        ext = '.webp' if image.get('mimeType') == 'image/webp' else '.png'
        path = os.path.join(folder, 'Texture_%s_%d%s' % (os.path.splitext(os.path.basename(src.glb_path))[0], source, ext))
        open(path, 'wb').write(src.glb.binary[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']])
        result.use_nodes = True
        node = result.node_tree.nodes.new('ShaderNodeTexImage'); node.image = bpy.data.images.load(path)
        bsdf = result.node_tree.nodes.get('Principled BSDF')
        result.node_tree.links.new(node.outputs['Color'], bsdf.inputs['Base Color'])
        result.node_tree.nodes.active = node
    cache[primMaterial] = result
    return result


def Author(job):
    repo = job['repo']; model = job['model']; spec = MODELS[model]
    folder = job.get('folder') or os.path.join(os.path.expanduser('~'), 'OneDrive', 'AI', 'Models', 'Blender',
                                               'Taierzhuang1938', 'FacialRigs_20260923')
    os.makedirs(folder, exist_ok=True)
    src = Source(repo, spec); src.glb_path = spec['base']
    lm = Landmarks(src, spec)
    sceneName = 'Scene_%sFacialTalk' % model
    if sceneName in bpy.data.scenes:
        old = bpy.data.scenes[sceneName]
        for obj in list(old.objects): bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.scenes.remove(old)
    # Re-authoring replaces the previous run's data blocks instead of piling up .001 copies.
    for collection in (bpy.data.actions, bpy.data.armatures, bpy.data.meshes, bpy.data.cameras):
        for block in list(collection):
            if model in block.name and block.users == 0: collection.remove(block)
    scene = bpy.data.scenes.new(sceneName)
    if bpy.context.window: bpy.context.window.scene = scene
    C = src.baker.CONVERSION
    headMatrix = C.inverted() @ src.head  # Blender world of the head frame (includes the 0.01 cm scale)
    meshMatrix = C.inverted()              # GLB world metres -> Blender world

    # Armature: head frame + Face_* bones (identity rest rotation, Head-local cm).
    armature = bpy.data.armatures.new('Rig_%sFacial' % model)
    rig = bpy.data.objects.new('Rig_%sFacial' % model, armature); scene.collection.objects.link(rig)
    rig.matrix_world = headMatrix
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    def Bone(name, point, parent=None, length=.6):
        bone = armature.edit_bones.new(name)
        bone.head = Vector(point); bone.tail = Vector(point) + Vector((0, length, 0)); bone.roll = 0
        if parent: bone.parent = armature.edit_bones[parent]
        return bone
    Bone(spec['head'], (0, 0, 0), length=12)
    um, fm, mz = lm['lipLine'], lm['lipFront'], lm['midZ']
    Bone('Face_Jaw', tuple(lm['tmj']), spec['head'])
    Bone('Face_LipLower', (um - .55, fm - .15, mz), 'Face_Jaw')
    Bone('Face_LipUpper', (um + .55, fm - .10, mz), spec['head'])
    Bone('Face_CornerL', tuple(lm['corners'][0]), spec['head'])
    Bone('Face_CornerR', tuple(lm['corners'][1]), spec['head'])
    for eye, side in zip(lm['eyes'], 'LR'):
        c = eye['center']
        Bone('Face_Brow' + side, (c[0] + 1.9, eye['front'] - .4, c[2]), spec['head'])
        Bone('Face_LidUpper' + side, (c[0] + .6, eye['front'] - .1, c[2]), spec['head'])
        Bone('Face_LidLower' + side, (c[0] - .6, eye['front'] - .1, c[2]), spec['head'])
        Bone('Face_Eye' + side, tuple(c), spec['head'])
    bpy.ops.object.mode_set(mode='OBJECT')
    names = [b.name for b in armature.bones if b.name.startswith('Face_')]

    materials = {}
    def AddSkin(prim, weightsFor, split=False):
        data = src.Prim(prim)
        obj = MakeMesh('Skin_%s_P%d' % (model, prim), data['world'], data['indices'], scene, meshMatrix, data['uv'])
        # GLB world metres are Y-up; the object matrix converts to Blender Z-up.
        obj['glbPrim'] = prim
        attr = obj.data.attributes.new('glbIndex', 'INT', 'POINT')
        attr.data.foreach_set('value', list(range(len(data['world']))))
        lower = None
        if split:
            lower, cut, rim = SplitLips(obj, lm)
            lm['rim'] = rim; lm['cutEdges'] = cut
            if len(obj.data.vertices) != len(data['world']): obj['glbRebuild'] = 1
        index = np.array([v.value for v in obj.data.attributes['glbIndex'].data])
        weights = weightsFor(data['local'][index], index, lower)
        material = PreviewMaterial(src, data['material'], folder, materials)
        if material: obj.data.materials.append(material)
        head = obj.vertex_groups.new(name=spec['head'])
        groups = {n: obj.vertex_groups.new(name=n) for n in names}
        total = np.zeros(len(index))
        for n, values in weights.items():
            for i in np.where(values > .01)[0]: groups[n].add([int(i)], float(values[i]), 'REPLACE')
            total += np.where(values > .01, values, 0)
        rest = np.clip(1 - total, 0, 1)
        for i in np.where(rest > 1e-4)[0]: head.add([int(i)], float(rest[i]), 'REPLACE')
        modifier = obj.modifiers.new('Armature', 'ARMATURE'); modifier.object = rig
        return obj, weights

    sameEyePrim = spec['eyePrim'] == spec['skinPrim']
    def SkinWeights(L, index, lower):
        eyeball = np.zeros(len(index), bool)
        if sameEyePrim:
            for eye in lm['eyes']: eyeball |= np.isin(index, eye['indices'])
        # Interior mouth pieces of the skin prim (IJA mouth bag) open with the jaw by height.
        weights = FaceWeights(L, lm, spec, eyeball, lower)
        if sameEyePrim:
            for eye, side in zip(lm['eyes'], 'LR'): weights['Face_Eye' + side] = np.isin(index, eye['indices']).astype(float)
        return weights
    skinObject, weights = AddSkin(spec['skinPrim'], SkinWeights, split=True)
    if not sameEyePrim:
        def EyeWeights(L, index, lower):
            return {'Face_Eye' + side: np.isin(index, eye['indices']).astype(float) for eye, side in zip(lm['eyes'], 'LR')}
        AddSkin(spec['eyePrim'], EyeWeights)
    for prim in spec['rigidPrims']:  # preview only: caps, helmets, collars stay on the head bone
        data = src.Prim(prim)
        obj = MakeMesh('Preview_%s_P%d' % (model, prim), data['world'], data['indices'], scene, meshMatrix, data['uv'])
        material = PreviewMaterial(src, data['material'], folder, materials)
        if material: obj.data.materials.append(material)
        obj.hide_select = True

    BuildOral(scene, rig, lm, spec, headMatrix, model)

    # Poses.
    lid = {'blink': None, 'half': None}
    action = bpy.data.actions.new('Animation_%sFacialPoses' % model)
    rig.animation_data_create(); rig.animation_data.action = action
    A, B = spec['eyeOpening']
    for label, frame in POSE_FRAMES.items():
        for bone in rig.pose.bones:
            bone.rotation_mode = 'QUATERNION'; bone.location = (0, 0, 0); bone.rotation_quaternion = (1, 0, 0, 0)
        for key, value in POSES.get(label, {}).items():
            if key == 'Jaw':
                rig.pose.bones['Face_Jaw'].rotation_quaternion = Quaternion((0, 0, 1), math.radians(value)); continue
            if value == 'blink': value = (-2 * B * 1.12, .30, 0)
            if value == 'half': value = (-2 * B * .55, .16, 0)
            for side, sign in (('L', 1), ('R', -1)):
                name = 'Face_' + key + (side if key in ('Corner', 'Brow', 'LidUpper', 'LidLower') else '')
                if name not in rig.pose.bones: continue
                up, fwd, out = value
                rig.pose.bones[name].location = (up, fwd, out * sign)
                if not name.endswith(('L', 'R')): break
        for bone in rig.pose.bones:
            bone.keyframe_insert('location', frame=frame); bone.keyframe_insert('rotation_quaternion', frame=frame)
    rig.animation_data.action = None
    scene.frame_start = 1; scene.frame_end = max(POSE_FRAMES.values()); scene.frame_set(1)
    scene['facialLandmarks'] = json.dumps({'lipLine': um, 'lipFront': fm, 'halfWidth': lm['halfWidth'],
        'tmj': [float(x) for x in lm['tmj']], 'eyes': [[float(x) for x in e['center']] + [e['radius']] for e in lm['eyes']]})
    report = {'scene': sceneName, 'bones': names, 'cutEdges': lm.get('cutEdges', 0), 'droppedInteriorFaces': lm.get('droppedInteriorFaces', 0), 'rimPoints': len(lm.get('rim', [])),
              'skinVertices': len(skinObject.data.vertices), 'lipLine': um, 'lipFront': fm, 'halfWidth': lm['halfWidth'],
              'tmj': [round(float(x), 2) for x in lm['tmj']],
              'eyes': [[round(float(x), 2) for x in e['center']] + [round(e['radius'], 2)] for e in lm['eyes']],
              'faceVertices': int(sum((v > .01).astype(int) for v in weights.values()).astype(bool).sum())}
    if job.get('preview'): report['previews'] = len(Preview(scene, rig, job['preview'], model, headMatrix, lm))
    if job.get('save'):
        bpy.data.libraries.write(job['save'], {scene, bpy.data.actions['Animation_%sFacialPoses' % model]},
                                 fake_user=True, compress=True)
        report['saved'] = job['save']
    print(json.dumps(report))
    return report


def Ring(bm, points):
    return [bm.verts.new(tuple(p)) for p in points]


def BuildOral(scene, rig, lm, spec, headMatrix, model):
    """Cavity tube from the lip loop, two teeth rows and a tongue, Head-local cm."""
    um, fm, w, mz = lm['lipLine'], lm['lipFront'], lm['halfWidth'], lm['midZ']
    head = spec['head']

    def Object(name, bm, category, jawWeight, flags=None):
        mesh = bpy.data.meshes.new(name); bm.to_mesh(mesh); bm.free()
        obj = bpy.data.objects.new(name, mesh); scene.collection.objects.link(obj)
        obj.matrix_world = headMatrix; obj['facialOral'] = category
        gJaw = obj.vertex_groups.new(name='Face_Jaw'); gHead = obj.vertex_groups.new(name=head)
        for v in mesh.vertices:
            j = float(flags[v.index] if flags is not None else jawWeight(Vector(v.co)))
            if j > 1e-4: gJaw.add([v.index], j, 'REPLACE')
            if j < 1 - 1e-4: gHead.add([v.index], 1 - j, 'REPLACE')
        obj.modifiers.new('Armature', 'ARMATURE').object = rig
        material = bpy.data.materials.new('Preview_Oral' + category)
        material.diffuse_color = {'Cavity': (.05, .01, .012, 1), 'Teeth': (.72, .66, .55, 1), 'Tongue': (.35, .08, .09, 1)}[category]
        mesh.materials.append(material)
        return obj

    def JawBelow(split, band=.25):
        return lambda p: float(Smooth(split + band, split - band, p.x))

    # Cavity: a ring on the lip edges (upper edge on the head, lower on the jaw, corners
    # shared), then rings sinking into the head, always behind the face surface.
    rim = lm.get('rim') or []
    count = 10; span = w - .12
    upperRim = [p for p, low in rim if low == 0]; lowerRim = [p for p, low in rim if low == 1]
    def Edge(points, l, fallbackUp):
        if not points: return np.array([um + fallbackUp, lm['frontAt'](l) - .25, mz + l])
        pts = np.array(points); d = np.abs(pts[:, 2] - mz - l)
        pick = pts[np.argsort(d)[:3]]
        return pick[np.argmax(pick[:, 1])]
    lat = np.linspace(span, -span, count)
    ring0 = [np.array(lm['corners'][0])]; angles = [0.0]; jawFlags = [.5]
    for k, l in enumerate(lat):
        ring0.append(Edge(upperRim, l, .02)); angles.append(math.pi * (k + 1) / (count + 1)); jawFlags.append(0.0)
    ring0.append(np.array(lm['corners'][1])); angles.append(math.pi); jawFlags.append(.5)
    for k, l in enumerate(lat[::-1]):
        ring0.append(Edge(lowerRim, l, -.02)); angles.append(math.pi + math.pi * (k + 1) / (count + 1)); jawFlags.append(1.0)
    n = len(ring0)
    rimF = min(p[1] for p in ring0)
    bm = bmesh.new()
    rings = [Ring(bm, [p + np.array([0, -.10, 0]) for p in ring0])]
    flags = list(jawFlags)
    for depth, scale, height in ((.7, .86, 1.2), (1.8, .82, 1.65), (3.0, .70, 1.55), (4.0, .50, 1.05)):
        pts = []
        for a, p0 in zip(angles, ring0):
            l = math.cos(a) * w * scale
            pts.append((um - .25 + math.sin(a) * height * (.8 if math.sin(a) < 0 else 1.0),
                        min(p0[1] - .10 - depth, lm['frontAt'](l) - .45 - depth * .6), mz + l))
        rings.append(Ring(bm, pts))
        flags += [float(Smooth(.25, -.25, math.sin(a))) for a in angles]
    for r0, r1 in zip(rings, rings[1:]):
        for i in range(n):
            bm.faces.new((r0[i], r0[(i + 1) % n], r1[(i + 1) % n], r1[i]))
    cap = bm.verts.new((um - .3, rimF - .10 - 4.3, mz)); flags.append(.5)
    for i in range(n): bm.faces.new((rings[-1][i], rings[-1][(i + 1) % n], cap))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for face in bm.faces: face.normal_flip()  # seen from inside the mouth
    bm.verts.index_update()
    flagByVertex = {v.index: flags[v.index] for v in bm.verts}
    if spec.get('cavity', True): Object('Oral_%s_Cavity' % model, bm, 'Cavity', None, flagByVertex)
    else: bm.free()

    # Teeth: rounded boxes along an arch that stays behind the lips at every width.
    # Upper incisors overlap the lower ones in front (a normal bite), so both rows show
    # as soon as the lips part; the rows are separate objects so the overlap cannot
    # confuse the head/jaw split.
    rimPoints = np.array([p for p, _ in rim]) if rim else None
    def RimFront(l):
        # Teeth sit behind the lips' inner edge (the lips curl inwards before they part).
        if rimPoints is None: return lm['frontAt'](l) - .65
        d = np.abs(rimPoints[:, 2] - mz - l)
        return float(rimPoints[np.argsort(d)[:4], 1].min())
    for label, top, bottom, back, jaw in (('Upper', um + .72, um - .30, 0.0, 0.0), ('Lower', um - .04, um - .66, .16, 1.0)):
        bm = bmesh.new()
        teeth = 10; span = w * .78
        for i in range(teeth):
            z = -span + (2 * span) * (i + .5) / teeth
            width = (2 * span / teeth) * .86 * (1.12 if abs(z) < span * .25 else 1.0)
            depth = .34 if abs(z) < span * .5 else .42
            f0 = min(fm - .75 - .10 * z * z, lm['frontAt'](z) - .65, RimFront(z) - .20) - back - spec.get('teethBack', 0)
            for v in bmesh.ops.create_cube(bm, size=1.0)['verts']:
                v.co = Vector(((top + bottom) / 2 + v.co.z * (top - bottom), f0 - depth * (v.co.y + .5), mz + z + v.co.x * width))
        bmesh.ops.bevel(bm, geom=[e for e in bm.edges if abs(e.verts[0].co.x - e.verts[1].co.x) > .2],
                        offset=.05, segments=1, affect='EDGES')
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        Object('Oral_%s_Teeth%s' % (model, label), bm, 'Teeth', lambda p, jaw=jaw: jaw)

    # Tongue: flattened ellipsoid resting behind the lower teeth.
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=6, radius=1.0)
    for v in bm.verts:
        v.co = Vector((um - .85 + v.co.z * .40, rimF - 1.95 - spec.get('teethBack', 0) + v.co.y * 1.5, mz + v.co.x * w * .60))
    Object('Oral_%s_Tongue' % model, bm, 'Tongue', lambda p: 1.0)


def Preview(scene, rig, folder, model, headMatrix, lm):
    os.makedirs(folder, exist_ok=True)
    cam = bpy.data.objects.new('Camera_%sFacial' % model, bpy.data.cameras.new('Camera_%sFacial' % model))
    scene.collection.objects.link(cam); scene.camera = cam; cam.data.lens = 85
    scene.render.engine = 'BLENDER_WORKBENCH'; scene.display.shading.light = 'FLAT'
    scene.display.shading.color_type = 'TEXTURE'
    scene.render.resolution_x = 360; scene.render.resolution_y = 360
    face = headMatrix @ Vector((lm['lipLine'] + 3.2, lm['lipFront'], lm['midZ']))
    rig.animation_data.action = bpy.data.actions['Animation_%sFacialPoses' % model]
    out = []
    for view, offset in (('Front', Vector((0, -.42, 0))), ('ThreeQuarter', Vector((.24, -.34, 0)))):
        cam.location = face + offset
        direction = face - cam.location
        cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
        for label, frame in POSE_FRAMES.items():
            scene.frame_set(frame)
            path = os.path.join(folder, 'Preview_%s_%s_%s.png' % (model, view, label))
            scene.render.filepath = path; bpy.ops.render.render(write_still=True); out.append(path)
    rig.animation_data.action = None; scene.frame_set(1)
    return out


if 'FACIAL_AUTHOR' in globals():
    FACIAL_AUTHOR_RESULT = Author(FACIAL_AUTHOR)


# ---------------------------------------------------------------- NRA05 upgrade

NRA05_POSE_FRAMES = {'Rest': 1, 'Open': 140, 'Wide': 44, 'Round': 55, 'Blink': 74,
                     'Close': 300, 'BrowUp': 310, 'Snarl': 320, 'DeadSlack': 330}


def UpgradeNra05(job):
    """Bring the reviewed NRA05 scene (Nra05FacialTalk_20260913) to the 2026-09-23 rig:
    eye bones, the four added poses, one-segment tooth bevels. The reviewed file is
    not overwritten; the scene is written to FacialRigs_20260923."""
    scene = bpy.data.scenes['Scene_Nra05FacialTalk']
    if bpy.context.window: bpy.context.window.scene = scene
    rig = scene.objects['Rig_LugouCharacter']; body = scene.objects['John_Body003']
    head = rig.data.bones['Bip002 Head']
    # Eyeballs: the 战士1_头部 material slot, split by side (Blender +X = character left).
    slot = [s.material.name for s in body.material_slots].index('战士1_头部')
    eyeVerts = {'L': set(), 'R': set()}
    for poly in body.data.polygons:
        if poly.material_index != slot: continue
        for v in poly.vertices:
            world = body.matrix_world @ body.data.vertices[v].co
            eyeVerts['L' if world.x > 0 else 'R'].add(v)
    centers = {}
    for side, verts in eyeVerts.items():
        pts = np.array([tuple(rig.matrix_world.inverted() @ body.matrix_world @ body.data.vertices[v].co) for v in verts])
        centers[side] = FitSphere(pts)[0]
    bpy.context.view_layer.objects.active = rig
    if rig.mode != 'OBJECT': bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.mode_set(mode='EDIT')
    for side, c in centers.items():
        name = 'Face_Eye' + side
        bone = rig.data.edit_bones.get(name) or rig.data.edit_bones.new(name)
        bone.head = Vector(c); bone.tail = Vector(c) + Vector((0, 0, 1.3)); bone.roll = 0
        bone.parent = rig.data.edit_bones['Bip002 Head']
    bpy.ops.object.mode_set(mode='OBJECT')
    for side, verts in eyeVerts.items():
        group = body.vertex_groups.get('Face_Eye' + side) or body.vertex_groups.new(name='Face_Eye' + side)
        for v in verts:
            for g in list(body.data.vertices[v].groups):
                body.vertex_groups[g.group].remove([v])
            group.add([v], 1.0, 'REPLACE')
    for obj in scene.objects:
        if obj.name.startswith('Mesh_Tooth'):
            for m in obj.modifiers:
                if m.type == 'BEVEL': m.segments = 1
    # Added poses, Head-local deltas converted to each bone's rest frame.
    action = bpy.data.actions['Animation_Nra05Speaking']
    rig.animation_data.action = action
    headRotation = head.matrix_local.to_3x3().normalized()
    lid = (-.67, .23, 0)  # the reviewed Blink lid travel
    extra = {'Close': POSES['Close'], 'BrowUp': POSES['BrowUp'], 'Snarl': POSES['Snarl'],
             'DeadSlack': {**POSES['DeadSlack'], 'LidUpper': (lid[0] * .55, lid[1] * .6, 0)}}
    faceBones = [b for b in rig.pose.bones if b.name.startswith('Face_')]
    for label, pose in extra.items():
        frame = NRA05_POSE_FRAMES[label]
        for bone in faceBones:
            bone.rotation_mode = 'QUATERNION'; bone.location = (0, 0, 0); bone.rotation_quaternion = (1, 0, 0, 0)
        for key, value in pose.items():
            for side, sign in (('L', 1), ('R', -1)):
                name = 'Face_' + key + (side if key in ('Corner', 'Brow', 'LidUpper', 'LidLower') else '')
                bone = rig.pose.bones.get(name)
                if not bone: continue
                toBone = bone.bone.matrix_local.to_3x3().normalized().inverted() @ headRotation
                if key == 'Jaw':
                    bone.rotation_quaternion = Quaternion(toBone @ Vector((0, 0, 1)), math.radians(value))
                else:
                    up, fwd, out = value
                    bone.location = toBone @ Vector((up, fwd, out * sign))
                if name[-1] not in 'LR': break
        for bone in faceBones:
            bone.keyframe_insert('location', frame=frame); bone.keyframe_insert('rotation_quaternion', frame=frame)
    rig.animation_data.action = None
    for bone in rig.pose.bones: bone.matrix_basis.identity()
    scene.frame_end = max(scene.frame_end, max(NRA05_POSE_FRAMES.values()))
    report = {'eyeCenters': {k: [round(float(x), 3) for x in v] for k, v in centers.items()},
              'eyeVertices': {k: len(v) for k, v in eyeVerts.items()}}
    if job.get('save'):
        bpy.data.libraries.write(job['save'], {scene, action}, fake_user=True, compress=True)
        report['saved'] = job['save']
    print(json.dumps(report))
    return report


# ---------------------------------------------------------------- bake jobs

MOUTH_BONES = ['Face_Jaw', 'Face_Lip', 'Face_Corner']
POSE_MASK = {  # which bones a pose may move; the rest stay at Rest (e.g. no brow-follows-jaw)
    'Open': MOUTH_BONES, 'Wide': MOUTH_BONES, 'Round': MOUTH_BONES, 'Close': MOUTH_BONES,
    'Blink': ['Face_Lid'], 'BrowUp': ['Face_Brow', 'Face_LidUpper'],
    'Snarl': MOUTH_BONES + ['Face_Brow', 'Face_LidLower'],
    'DeadSlack': MOUTH_BONES + ['Face_Lid'],
}
EYES = {'bones': ['Face_EyeL', 'Face_EyeR'], 'frame': 'parent',
        # Head frame: X up, Y forward, Z to the character's left.
        'yawAxis': [1, 0, 0], 'pitchAxis': [0, 0, 1], 'forward': [0, 1, 0]}


def BakeJobs(repo):
    common = {'repo': repo, 'oralMode': 'merged', 'stripImages': True, 'stripAnimations': True,
              'poseMask': POSE_MASK, 'eyes': EYES}
    jobs = {}
    for model, head in (('Nra02', 'Bip002 Head'), ('Ija02', 'Bip001 Head')):
        jobs[model] = {**common, 'scene': 'Scene_%sFacialTalk' % model, 'rig': 'Rig_%sFacial' % model,
                       'headBone': head, 'base': 'Model_Lugou%s.glb' % model, 'output': 'Model_Lugou%sFacial.glb' % model,
                       'action': 'Animation_%sFacialPoses' % model, 'poseFrames': POSE_FRAMES, 'weightMode': 'index',
                       'source': 'FacialRigs_20260923/%s' % model, 'sourceFile': 'Animation_%sFacialTalk.blend' % model}
    # IJA01 shares IJA02's head mesh, vertex order and triangles: weights, cut lips,
    # bones and oral parts are carried over rigidly in the head frame.
    jobs['Ija01'] = {**jobs['Ija02'], 'base': 'Model_LugouIja01.glb', 'output': 'Model_LugouIja01Facial.glb',
                     'transferFrom': 'Model_LugouIja02.glb', 'source': 'FacialRigs_20260923/Ija02->Ija01'}
    jobs['Nra05'] = {**common, 'scene': 'Scene_Nra05FacialTalk', 'rig': 'Rig_LugouCharacter', 'headBone': 'Bip002 Head',
                     'base': 'Model_LugouNra05.glb', 'output': 'Model_LugouNra05Facial.glb',
                     'action': 'Animation_Nra05Speaking', 'poseFrames': NRA05_POSE_FRAMES,
                     'weightMode': 'kdtree', 'body': 'John_Body003', 'legacyOralNames': True,
                     'source': 'Nra05FacialTalk_20260913+FacialRigs_20260923', 'sourceFile': 'Animation_Nra05FacialTalk.blend'}
    return jobs


if 'FACIAL_UPGRADE_NRA05' in globals():
    FACIAL_UPGRADE_RESULT = UpgradeNra05(FACIAL_UPGRADE_NRA05)
if 'FACIAL_BAKE' in globals():
    _job = BakeJobs(FACIAL_BAKE['repo'])[FACIAL_BAKE['model']]
    _job.update(FACIAL_BAKE.get('override', {}))
    FACIAL_BAKE_RESULT = Baker(FACIAL_BAKE['repo']).Bake(_job)
