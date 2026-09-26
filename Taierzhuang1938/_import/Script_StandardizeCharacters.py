"""Bake the adopted Tengxian bodies on one metre-space reference skeleton.

Run inside the task's BlenderMCP instance, with __file__ set to this file.
Source bytes come from a pinned Git revision, never from previously baked output.
The serializer preserves embedded textures, material properties and vertex weights.

After a rebake, run `node Taierzhuang1938/_import/Script_FixMocapFootRoll.mjs`: the pinned
sources carry CarryStretcherRear / WoundedLimp with feet rolled 180 degrees (sole up); that
script flips them back, re-grounds both clips and rewrites their manifest audit.
Script_CharacterModelTest fails on the flipped feet until it has run.
"""
import bpy
import copy
import hashlib
import json
import re
import struct
import subprocess
from pathlib import Path
import numpy as np
from mathutils import Matrix, Vector, Quaternion

REPO = Path(__file__).resolve().parents[2]
PROJECT = REPO / 'Taierzhuang1938'
REVISION = 'b3ba06096ae9929a44220b07cdedf86dbba8b197'
ADOPTED = ('Nra02', 'Nra05', 'Ija01', 'Ija02', 'Ija03')
# Second source (2026-09-26): the 01-06 refactor / 01-03 storyboard round authored these on the
# Lugou rigs before this standardization landed. They are read from the storyboard integration
# head that preceded the merge; the adopted bodies above are byte-identical in both revisions.
STORYBOARD_REVISION = 'b39cd831066e1e2527389edd504048b4b5120ac6'
DERIVED = ('Ija06', 'Nra06')        # cast-only looks derived from Ija02 / Nra02 (not adopted appearances)
FACIAL = ('Ija01Facial', 'Ija02Facial', 'Ija06Facial', 'Nra02Facial', 'Nra05Facial', 'Nra06Facial')   # 13 Face_ bones
SOURCE_DIR = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Tengxian/SharedCharacters')
WIDTH = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
DTYPE = {5121: '<u1', 5123: '<u2', 5125: '<u4', 5126: '<f4'}

def Source(relative, revision=REVISION):
    return subprocess.check_output(['git', '-C', str(REPO), 'show', revision + ':Taierzhuang1938/' + relative])

def Name(name):
    return re.sub(r'^Bip\d+', 'Bip001', name).replace('Lugou', 'Tengxian')

def Quat(value):
    return Quaternion((value[3], *value[:3])).normalized()

def QArray(value):
    return [value.x, value.y, value.z, value.w]

def Trs(node):
    if 'matrix' in node:
        return Matrix(np.array(node['matrix']).reshape(4, 4).T.tolist())
    return Matrix.LocRotScale(Vector(node.get('translation', [0, 0, 0])),
                             Quat(node.get('rotation', [0, 0, 0, 1])),
                             Vector(node.get('scale', [1, 1, 1])))

def SetTrs(node, matrix):
    p, q, s = matrix.decompose()
    node.pop('matrix', None)
    node.update(translation=list(p), rotation=QArray(q), scale=list(s))

class Glb:
    def __init__(self, data):
        length = struct.unpack_from('<I', data, 12)[0]
        self.g = json.loads(data[20:20 + length])
        self.bin = bytearray(data[28 + length:])
        self.nodes = self.g['nodes']
        self.parent = [-1] * len(self.nodes)
        for i, node in enumerate(self.nodes):
            for child in node.get('children', []): self.parent[child] = i
        self.order = []
        def Visit(i):
            self.order.append(i)
            for child in self.nodes[i].get('children', []): Visit(child)
        for root in self.g['scenes'][self.g.get('scene', 0)]['nodes']: Visit(root)
        self.local = [Trs(n) for n in self.nodes]
        self.world = self.World(self.local)
        self.byName = {Name(n.get('name', '')): i for i, n in enumerate(self.nodes)}

    def World(self, local):
        world = [Matrix.Identity(4) for _ in local]
        for i in self.order:
            world[i] = world[self.parent[i]] @ local[i] if self.parent[i] >= 0 else local[i].copy()
        return world

    def Read(self, index):
        a = self.g['accessors'][index]; v = self.g['bufferViews'][a['bufferView']]
        dtype = np.dtype(DTYPE[a['componentType']]); width = WIDTH[a['type']]
        return np.ndarray((a['count'], width), dtype=dtype, buffer=self.bin,
            offset=v.get('byteOffset', 0) + a.get('byteOffset', 0),
            strides=(v.get('byteStride', width * dtype.itemsize), dtype.itemsize)).copy()

    def Add(self, values, kind, component=5126):
        values = np.asarray(values, dtype=DTYPE[component]).reshape(-1, WIDTH[kind])
        self.bin.extend(b'\0' * (-len(self.bin) % 4))
        view = {'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': values.nbytes}
        self.bin.extend(values.tobytes())
        self.g['bufferViews'].append(view)
        accessor = {'bufferView': len(self.g['bufferViews']) - 1, 'componentType': component,
                    'count': len(values), 'type': kind}
        if kind in ('SCALAR', 'VEC3') and len(values):
            accessor.update(min=values.min(axis=0).tolist(), max=values.max(axis=0).tolist())
        self.g['accessors'].append(accessor)
        return len(self.g['accessors']) - 1

    def Save(self, path):
        self.Compact()
        self.g['buffers'] = [{'byteLength': len(self.bin)}]
        raw = json.dumps(self.g, separators=(',', ':'), ensure_ascii=True).encode()
        raw += b' ' * (-len(raw) % 4)
        binary = bytes(self.bin) + b'\0' * (-len(self.bin) % 4)
        payload = struct.pack('<III', 0x46546c67, 2, 28 + len(raw) + len(binary))
        payload += struct.pack('<II', len(raw), 0x4e4f534a) + raw
        payload += struct.pack('<II', len(binary), 0x004e4942) + binary
        path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(payload)

    def Compact(self):
        accessors = []; views = []; binary = bytearray(); accessorMap = {}; viewMap = {}
        def View(index):
            if index not in viewMap:
                value = copy.deepcopy(self.g['bufferViews'][index]); start = value.get('byteOffset', 0)
                binary.extend(b'\0' * (-len(binary) % 4)); value['byteOffset'] = len(binary)
                binary.extend(self.bin[start:start + value['byteLength']])
                viewMap[index] = len(views); views.append(value)
            return viewMap[index]
        def Accessor(index):
            if index not in accessorMap:
                value = copy.deepcopy(self.g['accessors'][index]); value['bufferView'] = View(value['bufferView'])
                accessorMap[index] = len(accessors); accessors.append(value)
            return accessorMap[index]
        for mesh in self.g.get('meshes', []):
            for primitive in mesh['primitives']:
                primitive['attributes'] = {key: Accessor(index) for key, index in primitive['attributes'].items()}
                if 'indices' in primitive: primitive['indices'] = Accessor(primitive['indices'])
        for skin in self.g.get('skins', []): skin['inverseBindMatrices'] = Accessor(skin['inverseBindMatrices'])
        for animation in self.g.get('animations', []):
            for sampler in animation['samplers']:
                sampler['input'] = Accessor(sampler['input']); sampler['output'] = Accessor(sampler['output'])
        for image in self.g.get('images', []):
            if 'bufferView' in image: image['bufferView'] = View(image['bufferView'])
        self.g['accessors'] = accessors; self.g['bufferViews'] = views; self.bin = binary

reference = Glb(Source('Model/Character/Model_LugouNra02.glb'))
bodyNames = [Name(reference.nodes[i]['name']) for i in reference.g['skins'][0]['joints']]
canonicalWorld = {}
for name in bodyNames:
    matrix = reference.world[reference.byName[name]]
    p, q, _ = matrix.decompose()
    canonicalWorld[name] = Matrix.LocRotScale(p, q, Vector((1, 1, 1)))
canonicalWorld['GroundRoot'] = Matrix.Identity(4)
canonicalLocal = {}
canonicalParent = {}
for name in bodyNames:
    i = reference.byName[name]
    parent = Name(reference.nodes[reference.parent[i]].get('name', ''))
    if name in ('Bip001 L Thigh', 'Bip001 R Thigh'): parent = 'Bip001 Pelvis'
    if name in ('Bip001 L Clavicle', 'Bip001 R Clavicle'): parent = 'Bip001 Spine2'
    canonicalParent[name] = parent if parent in bodyNames else None
    canonicalLocal[name] = canonicalWorld[parent].inverted() @ canonicalWorld[name] if parent in bodyNames else canonicalWorld[name].copy()
# Eliminate insignificant exporter noise. Every model receives these exact arrays.
canonicalNodes = {}
for name, matrix in canonicalLocal.items():
    node = {'name': name}; SetTrs(node, matrix)
    node['translation'] = [round(v, 8) for v in node['translation']]
    node['rotation'] = QArray(Quat([round(v, 8) for v in node['rotation']]))
    node['scale'] = [1, 1, 1]
    canonicalNodes[name] = node
    canonicalLocal[name] = Trs(node)
for name in bodyNames:
    parent = canonicalParent[name]
    canonicalWorld[name] = canonicalWorld[parent] @ canonicalLocal[name] if parent else canonicalLocal[name].copy()

class Retarget:
    def __init__(self, source, plantLegs=False):
        self.source = source
        self.plantLegs = plantLegs
        self.names = [name for name in bodyNames if name in source.byName]
        self.pelvis = source.byName['Bip001 Pelvis']
        self.root = source.byName['GroundRoot']
        self.height = canonicalWorld['Bip001 Pelvis'].translation.y / source.world[self.pelvis].translation.y

    def Frame(self, local):
        world = self.source.World(local)
        posed = {}; output = {}
        for name in self.names:
            i = self.source.byName[name]; parent = canonicalParent[name]
            # Both inputs are Biped rigs with the same anatomical local axes.
            # Their A/T reference-pose difference is NOT an axis correction:
            # adding it to the performance would lift IJA elbows a second time.
            rotation = world[i].to_quaternion()
            if name == 'GroundRoot':
                rotation = rotation @ self.source.world[i].to_quaternion().inverted()
                position = world[i].translation - self.source.world[i].translation
                # GroundRoot is a correction track, not world locomotion.
                position *= self.height
            elif name == 'Bip001 Pelvis':
                position = world[i].translation.copy()
                # Source containers have been recentered in the model files.
                position.y *= self.height
            else:
                position = posed[parent] @ canonicalLocal[name].translation
            posed[name] = Matrix.LocRotScale(position, rotation, Vector((1, 1, 1)))
            output[name] = posed[parent].inverted() @ posed[name] if parent else posed[name]
            if name not in ('GroundRoot', 'Bip001 Pelvis'):
                output[name].translation = canonicalLocal[name].translation
        if self.plantLegs:
            for side in ('L', 'R'):
                thigh, calf, foot, toe = ['Bip001 ' + side + ' ' + key for key in ('Thigh', 'Calf', 'Foot', 'Toe0')]
                start = posed[thigh].translation.copy(); knee = posed[calf].translation.copy(); ankle = posed[foot].translation.copy()
                target = world[self.source.byName[foot]].translation.copy()
                a = canonicalLocal[calf].translation.length; b = canonicalLocal[foot].translation.length
                axis = target - start; distance = min(axis.length, a + b - 1e-7); axis.normalize()
                target = start + axis * distance
                along = (a * a - b * b + distance * distance) / (2 * distance)
                pole = knee - start; pole -= axis * pole.dot(axis); pole.normalize()
                bend = start + axis * along + pole * max(0, a * a - along * along) ** .5
                thighQ = (knee - start).normalized().rotation_difference((bend - start).normalized()) @ posed[thigh].to_quaternion()
                calfQ = (ankle - knee).normalized().rotation_difference((target - bend).normalized()) @ posed[calf].to_quaternion()
                posed[thigh] = Matrix.LocRotScale(start, thighQ, Vector((1, 1, 1)))
                posed[calf] = Matrix.LocRotScale(bend, calfQ, Vector((1, 1, 1)))
                posed[foot].translation = target
                posed[toe].translation = posed[foot] @ canonicalLocal[toe].translation
            for name in self.names:
                parent = canonicalParent[name]
                output[name] = posed[parent].inverted() @ posed[name] if parent else posed[name]
                if name not in ('GroundRoot', 'Bip001 Pelvis'): output[name].translation = canonicalLocal[name].translation
        return output

def BakeModel(identifier, relative=None, destination=None, revision=REVISION):
    relative = relative or 'Model/Character/Model_Lugou' + identifier + '.glb'
    glb = Glb(Source(relative, revision)); source = copy.deepcopy(glb)
    retarget = Retarget(source, relative.endswith('Infantry.glb'))
    # Biped's exported thigh-under-spine / clavicle-under-neck hierarchy relied
    # on animated joint translations. Use anatomical parents so fixed segment
    # lengths do not turn the hips when the torso leans or the neck looks around.
    for name, parentName in canonicalParent.items():
        if not parentName or name not in glb.byName: continue
        index = glb.byName[name]; parent = glb.byName[parentName]; oldParent = glb.parent[index]
        if oldParent != parent:
            glb.nodes[oldParent]['children'].remove(index)
            glb.nodes[parent].setdefault('children', []).append(index); glb.parent[index] = parent
    glb.order = []
    def Visit(index):
        glb.order.append(index)
        for child in glb.nodes[index].get('children', []): Visit(child)
    for root in glb.g['scenes'][glb.g.get('scene', 0)]['nodes']: Visit(root)
    newWorld = [m.copy() for m in source.world]
    for name in bodyNames:
        if name in glb.byName: newWorld[glb.byName[name]] = canonicalWorld[name].copy()
    joints = set(j for s in glb.g.get('skins', []) for j in s['joints'])
    joints.update(glb.byName[name] for name in bodyNames if name in glb.byName)
    # Facial controls and equipment inherit the normalized parent frame; facial
    # shape is kept in metres, independent of the body source's centimetre units.
    attached = set(joints)
    for i in glb.order:
        name = Name(glb.nodes[i].get('name', '')); parent = glb.parent[i]
        if name in canonicalNodes: continue
        if parent >= 0 and parent in attached:
            relativeMatrix = source.world[parent].inverted() @ source.world[i]
            p, q, s = relativeMatrix.decompose()
            p *= source.world[parent].to_scale().x
            s = Vector((1, 1, 1))
            newWorld[i] = newWorld[parent] @ Matrix.LocRotScale(p, q, s)
            attached.add(i)
        elif i in joints:
            raise ValueError('Unknown joint hierarchy: ' + name)
    # Skin all rest vertices into the common bind space, then install inverse
    # bind matrices for that space. No texture or weight regeneration is needed.
    bounds = []
    for i, node in enumerate(glb.nodes):
        if 'mesh' not in node: continue
        for primitive in glb.g['meshes'][node['mesh']]['primitives']:
            attributes = primitive['attributes']; position = source.Read(attributes['POSITION'])
            if 'skin' in node:
                skin = source.g['skins'][node['skin']]
                inverse = source.Read(skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
                palette = np.array([np.array(newWorld[j] @ Matrix.Diagonal((*source.world[j].to_scale(), 1))) for j in skin['joints']]) @ inverse
                indices = source.Read(attributes['JOINTS_0']).astype(int)
                weights = source.Read(attributes['WEIGHTS_0'])
                transforms = (palette[indices] * weights[:, :, None, None]).sum(axis=1)
                result = np.einsum('nij,nj->ni', transforms[:, :3, :3], position) + transforms[:, :3, 3]
                normalMatrix = np.linalg.inv(transforms[:, :3, :3]).transpose(0, 2, 1)
            else:
                # Rigid carried kit remains attached to its original body bone.
                matrix = np.array(source.world[i]); result = position @ matrix[:3, :3].T + matrix[:3, 3]
                parent = glb.parent[i]
                while parent >= 0 and parent not in joints: parent = glb.parent[parent]
                if parent >= 0:
                    deform = np.array(newWorld[parent] @ Matrix.Diagonal((*source.world[parent].to_scale(), 1)) @ source.world[parent].inverted())
                    result = result @ deform[:3, :3].T + deform[:3, 3]
                else: deform = np.eye(4)
                normalMatrix = np.linalg.inv((deform @ matrix)[:3, :3]).T
                # Store rigid vertices in the new parent bone's coordinates.
                if parent >= 0:
                    inverseParent = np.array(newWorld[glb.parent[i]].inverted())
                    result = result @ inverseParent[:3, :3].T + inverseParent[:3, 3]
                    normalMatrix = inverseParent[:3, :3] @ normalMatrix
            attributes['POSITION'] = glb.Add(result, 'VEC3')
            if 'skin' in node: bounds.extend(result.tolist())
            for semantic in ('NORMAL', 'TANGENT'):
                if semantic not in attributes: continue
                values = source.Read(attributes[semantic]); vectors = values[:, :3]
                vectors = np.einsum('nij,nj->ni', normalMatrix, vectors) if normalMatrix.ndim == 3 else vectors @ normalMatrix.T
                vectors /= np.maximum(1e-12, np.linalg.norm(vectors, axis=1))[:, None]
                values[:, :3] = vectors
                attributes[semantic] = glb.Add(values, 'VEC4' if semantic == 'TANGENT' else 'VEC3')
        if 'skin' not in node:
            node['translation'] = [0, 0, 0]; node['rotation'] = [0, 0, 0, 1]; node['scale'] = [1, 1, 1]
    for i in glb.order:
        node = glb.nodes[i]; name = Name(node.get('name', ''))
        if name in canonicalNodes:
            node.update(copy.deepcopy(canonicalNodes[name]))
        elif i in joints or node.get('name', '').startswith('Socket_'):
            parent = glb.parent[i]
            SetTrs(node, newWorld[parent].inverted() @ newWorld[i])
        elif 'mesh' not in node or 'skin' in node:
            node.update(translation=[0, 0, 0], rotation=[0, 0, 0, 1], scale=[1, 1, 1])
        node['name'] = Name(node.get('name', 'Node_' + str(i)))
        if 'extras' in node:
            node['extras'] = json.loads(re.sub(r'Bip00[12]', 'Bip001', json.dumps(node['extras']).replace('Lugou', 'Tengxian')))
    for skin in glb.g.get('skins', []):
        matrices = [np.array(newWorld[j].inverted()).T.reshape(16) for j in skin['joints']]
        skin['inverseBindMatrices'] = glb.Add(matrices, 'MAT4'); skin['name'] = 'Rig_TengxianHumanoid'
    glb.g['asset']['extras'] = {'skeleton': 'TengxianHumanoidV1', 'unit': 'metre', 'up': '+Y', 'forward': '+Z',
        'sourceRevision': revision, 'sourceAsset': relative, 'bodyReference': 'TengxianNra02'}
    # A derived look names itself and its base body in the root extras (CharacterModelTest reads the id).
    variant = glb.g.get('extras', {}).get('lugouVariant')
    if variant:
        for key in ('id', 'derivedFrom'):
            if key in variant: variant[key] = variant[key].replace('Lugou', 'Tengxian')
    glb.g.setdefault('extras', {})['sharedHumanoid'] = {
        'id': 'TengxianHumanoidV1',
        'sourceBindRotations': {name.removeprefix('Bip001 '): QArray(source.world[source.byName[name]].to_quaternion()) for name in bodyNames if name in source.byName},
    }
    BakeClips(glb, source, retarget)
    if not glb.g['animations']:
        # The 13-bone facial derivatives carry no clips: the runtime plays the base body's
        # animations on them (facialRig.animationsFrom = 'base').
        del glb.g['animations']
    elif relative.startswith('Model/Character/Model_'):
        BakeProne(glb)
        GroundClips(glb, glb)
    if relative.endswith('Infantry.glb'):
        body = Glb((PROJECT / 'Model/Character' / ('Model_Tengxian' + identifier + '.glb')).read_bytes())
        GroundClips(glb, body)
        reference = next(a for a in body.g['animations'] if a['name'] == 'AdvanceFire')
        sample = AnimationSampler(body, reference); floor = SkinProbe(body)
        duration = max(float(body.Read(s['input'])[-1, 0]) for s in reference['samplers'])
        values = [floor(sample(min(duration, frame / 120))) for frame in range(int(np.ceil(duration * 120)) + 1)]
        glb.g['scenes'][glb.g.get('scene', 0)].setdefault('extras', {})['infantryStandFloor'] = {'fps': 120, 'values': values}
    # Face pose translations are also authored in the old head-local units.
    facial = glb.g.get('extras', {}).get('facialRig')
    if facial:
        for pose in facial['poses'].values():
            for transform in pose.values(): transform['translation'] = [v * .01 for v in transform['translation']]
    destination = destination or PROJECT / 'Model/Character' / ('Model_Tengxian' + identifier + '.glb')
    glb.Save(destination)
    return glb, source, np.asarray(bounds)

def BakeClips(glb, source, retarget):
    animations = []
    for original in source.g.get('animations', []):
        channels = []
        times = set()
        for channel in original['channels']:
            sampler = original['samplers'][channel['sampler']]
            keys = source.Read(sampler['input']).ravel(); values = source.Read(sampler['output'])
            interpolation = sampler.get('interpolation', 'LINEAR')
            if interpolation not in ('LINEAR', 'STEP'): raise ValueError('Unsupported interpolation')
            channels.append((channel['target']['node'], channel['target']['path'], keys, values, interpolation)); times.update(keys.tolist())
        times = sorted(times); frames = {name: [] for name in retarget.names}
        for time in times:
            local = [m.copy() for m in source.local]; trs = {}
            for node, property, keys, values, interpolation in channels:
                at = min(len(keys) - 1, int(np.searchsorted(keys, time, side='right') - 1)); after = min(at + 1, len(keys) - 1)
                factor = (time - keys[at]) / (keys[after] - keys[at]) if after != at else 0
                factor = min(1, max(0, float(factor)))
                if interpolation == 'STEP': factor = 0
                if property == 'rotation': value = QArray(Quat(values[at]).slerp(Quat(values[after]), factor))
                else: value = (values[at] * (1 - factor) + values[after] * factor).tolist()
                trs.setdefault(node, copy.deepcopy(source.nodes[node]))[property] = value
            for node, values in trs.items(): local[node] = Trs(values)
            output = retarget.Frame(local)
            for name in retarget.names: frames[name].append(output[name].decompose())
        animation = {'name': original['name'], 'channels': [], 'samplers': []}
        timeAccessor = glb.Add(np.array(times), 'SCALAR')
        endpoints = glb.Add([times[0], times[-1]], 'SCALAR')
        for name in retarget.names:
            for property, component, kind in [('translation', 0, 'VEC3'), ('rotation', 1, 'VEC4'), ('scale', 2, 'VEC3')]:
                values = [QArray(frame[component]) if component == 1 else list(frame[component]) for frame in frames[name]]
                if component == 2: values = [[1, 1, 1] for frame in frames[name]]
                if component == 1:
                    for i in range(1, len(values)):
                        if np.dot(values[i - 1], values[i]) < 0: values[i] = [-v for v in values[i]]
                constant = float(np.max(np.abs(np.asarray(values) - values[0]))) < 1e-6
                if constant: values = [values[0], values[0]]
                animation['channels'].append({'sampler': len(animation['samplers']), 'target': {'node': glb.byName[name], 'path': property}})
                animation['samplers'].append({'input': endpoints if constant else timeAccessor, 'output': glb.Add(values, kind), 'interpolation': 'LINEAR'})
        # Non-body channels (props / face controls) stay explicit for later audit.
        for channel in original['channels']:
            if Name(source.nodes[channel['target']['node']].get('name', '')) in retarget.names: continue
            if not source.nodes[channel['target']['node']].get('name', '').startswith(('Infantry', 'Face_')): continue
            channel = copy.deepcopy(channel); sampler = copy.deepcopy(original['samplers'][channel['sampler']])
            channel['sampler'] = len(animation['samplers']); animation['samplers'].append(sampler); animation['channels'].append(channel)
        animations.append(animation)
    glb.g['animations'] = animations

def SkinProbe(glb):
    parts = []
    for node in glb.nodes:
        if 'skin' not in node: continue
        skin = glb.g['skins'][node['skin']]
        inverse = glb.Read(skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
        for primitive in glb.g['meshes'][node['mesh']]['primitives']:
            a = primitive['attributes']
            parts.append((skin['joints'], inverse, glb.Read(a['POSITION']), glb.Read(a['JOINTS_0']).astype(int), glb.Read(a['WEIGHTS_0'])))
    def Floor(local):
        world = glb.World(local); floor = float('inf')
        for joints, inverse, position, indices, weights in parts:
            palette = np.array([np.array(world[j]) for j in joints]) @ inverse
            y = palette[indices, 1, :]
            height = ((np.einsum('nki,ni->nk', y[:, :, :3], position) + y[:, :, 3]) * weights).sum(axis=1)
            floor = min(floor, float(height.min()))
        return floor
    return Floor

def AnimationSampler(glb, animation):
    tracks = [(c['target']['node'], c['target']['path'], glb.Read(animation['samplers'][c['sampler']]['input']).ravel(), glb.Read(animation['samplers'][c['sampler']]['output'])) for c in animation['channels']]
    def Sample(time):
        nodes = copy.deepcopy(glb.nodes)
        for index, property, keys, values in tracks:
            at = min(len(keys) - 1, max(0, int(np.searchsorted(keys, time, side='right') - 1))); after = min(at + 1, len(keys) - 1)
            mix = (time - keys[at]) / (keys[after] - keys[at]) if at != after else 0
            mix = min(1, max(0, float(mix)))
            nodes[index][property] = QArray(Quat(values[at]).slerp(Quat(values[after]), mix)) if property == 'rotation' else (values[at] * (1 - mix) + values[after] * mix).tolist()
        return [Trs(n) for n in nodes]
    return Sample

def GroundClips(glb, body):
    floor = SkinProbe(body)
    for animation in glb.g['animations']:
        times = sorted(set(t for sampler in animation['samplers'] for t in glb.Read(sampler['input']).ravel()))
        sample = AnimationSampler(glb, animation)
        corrected = {}
        for time in times:
            local = sample(time)
            correction = .003 - floor(local)
            for index, node in enumerate(glb.nodes):
                if node.get('name') == 'GroundRoot' or node.get('name', '').startswith('Infantry'):
                    value = list(local[index].translation); value[1] += correction
                    corrected.setdefault(index, []).append(value)
        timeAccessor = glb.Add(times, 'SCALAR')
        for channel in animation['channels']:
            if channel['target']['path'] == 'translation' and channel['target']['node'] in corrected:
                sampler = animation['samplers'][channel['sampler']]
                sampler['input'] = timeAccessor; sampler['output'] = glb.Add(corrected[channel['target']['node']], 'VEC3')

def BakeProne(glb):
    """Bake the existing full-size prone correction, previously built at load."""
    reference = next(a for a in glb.g['animations'] if a['name'] == 'AdvanceFire')
    tracks = [(c['target']['node'], c['target']['path'], glb.Read(reference['samplers'][c['sampler']]['output'])) for c in reference['channels']]
    times = sorted(set(t for sampler in reference['samplers'] for t in glb.Read(sampler['input']).ravel()))
    trackTimes = [glb.Read(reference['samplers'][c['sampler']]['input']).ravel() for c in reference['channels']]
    floor = SkinProbe(glb); best = None; bestLift = float('inf')
    pelvis = glb.byName['Bip001 Pelvis']; lean = Quaternion(Vector((1, 0, 0)), 1.15)
    for at in range(len(times)):
        nodes = copy.deepcopy(glb.nodes)
        for (index, property, values), keys in zip(tracks, trackTimes):
            key = min(len(keys) - 1, int(np.searchsorted(keys, times[at], side='right') - 1))
            after = min(key + 1, len(keys) - 1)
            blend = (times[at] - keys[key]) / (keys[after] - keys[key]) if after != key else 0
            blend = min(1, max(0, float(blend)))
            nodes[index][property] = QArray(Quat(values[key]).slerp(Quat(values[after]), blend)) if property == 'rotation' else (values[key] * (1 - blend) + values[after] * blend).tolist()
        local = [Trs(node) for node in nodes]; world = glb.World(local)
        p = world[pelvis].translation.copy(); p.y = .22
        desired = Matrix.LocRotScale(p, lean @ world[pelvis].to_quaternion(), Vector((1, 1, 1)))
        local[pelvis] = world[glb.parent[pelvis]].inverted() @ desired
        for side, sign in [('L', 1), ('R', -1)]:
            for bone, child, direction in [('Thigh', 'Calf', (sign * .15, -.18, -1)), ('Calf', 'Foot', (sign * .1, -.08, -1)), ('Foot', 'Toe0', (sign * .03, -.7, -.65))]:
                index = glb.byName['Bip001 ' + side + ' ' + bone]; end = glb.byName['Bip001 ' + side + ' ' + child]
                world = glb.World(local); axis = (world[end].translation - world[index].translation).normalized()
                rotation = axis.rotation_difference(Vector(direction).normalized()) @ world[index].to_quaternion()
                parentRotation = world[glb.parent[index]].to_quaternion()
                local[index] = Matrix.LocRotScale(local[index].translation, parentRotation.inverted() @ rotation, Vector((1, 1, 1)))
        lift = max(0, .003 - floor(local))
        if lift < bestLift:
            world = glb.World(local); p = world[pelvis].translation.copy(); p.y += lift
            local[pelvis].translation = world[glb.parent[pelvis]].inverted() @ p
            best = [m.copy() for m in local]; bestLift = lift
    animation = {'name': 'StandFireCrouch', 'channels': [], 'samplers': []}
    inputIndex = glb.Add([0, float(times[-1])], 'SCALAR')
    for name in bodyNames:
        index = glb.byName[name]; p, q, s = best[index].decompose()
        for property, values, kind in [('translation', list(p), 'VEC3'), ('rotation', QArray(q), 'VEC4'), ('scale', [1, 1, 1], 'VEC3')]:
            animation['channels'].append({'sampler': len(animation['samplers']), 'target': {'node': index, 'path': property}})
            animation['samplers'].append({'input': inputIndex, 'output': glb.Add([values, values], kind), 'interpolation': 'LINEAR'})
    glb.g['animations'] = [animation if a['name'] == animation['name'] else a for a in glb.g['animations']]

def BakeStoryLibraries(outputs):
    # OpeningStoryboards is no longer retargeted here (2026-09-26): its V5 library solves hand,
    # partner and wall contacts by IK, so `_import/Script_OpeningStoryboardBake.py` re-authors it
    # directly on the TengxianHumanoidV1 bodies this script writes (docs/Data_CharacterStandard.md).
    for folder, manifestName in [('MachineGunCaptives', 'Data_MachineGunCaptivesAnimation.json')]:
        manifest = json.loads(Source('Animation/' + folder + '/' + manifestName))
        manifest['version'] = '20260926' + folder + 'HumanoidV1'
        for row in manifest['models']:
            identifier = row['id'].replace('Lugou', '')
            target, source, _ = outputs[identifier]; retarget = Retarget(source)
            floor = SkinProbe(target)
            record = json.loads(Source('Animation/' + folder + '/' + row['file']))
            indices = [source.byName[Name(name)] for name in record['bones']]
            for clipId, clip in record['clips'].items():
                frames = np.asarray(clip['values']).reshape(clip['frameCount'], len(indices), 7)
                result = []
                for frame in frames:
                    local = [m.copy() for m in source.local]
                    for index, values in zip(indices, frame):
                        local[index] = Matrix.LocRotScale(Vector(values[:3]), Quat(values[3:]), source.local[index].to_scale())
                    pose = retarget.Frame(local)
                    if clipId == 'IjaShoveForward':
                        # The common forearm is longer than the IJA source. Keep
                        # the upright rifle behind the captive during the shove:
                        # tilt the right forearm 1.4 degrees back, without moving
                        # joints or changing the pushing left palm performance.
                        forearm = 'Bip001 R Forearm'
                        parent = canonicalParent[forearm]
                        chain = []; cursor = parent
                        while cursor:
                            chain.append(cursor); cursor = canonicalParent[cursor]
                        parentWorld = Matrix.Identity(4)
                        for name in reversed(chain): parentWorld = parentWorld @ pose[name]
                        axis = parentWorld.to_quaternion().inverted() @ Vector((1, 0, 0))
                        p, q, s = pose[forearm].decompose()
                        pose[forearm] = Matrix.LocRotScale(p, Quaternion(axis, -.025) @ q, s)
                    targetLocal = [Trs(node) for node in target.nodes]
                    for name, matrix in pose.items(): targetLocal[target.byName[name]] = matrix
                    correction = .004 - floor(targetLocal)
                    pose['GroundRoot'].translation.y += correction
                    result.extend(v for name in record['bones'] for v in (*pose[Name(name)].translation, *QArray(pose[Name(name)].to_quaternion())))
                clip['values'] = result
            record['bones'] = [Name(name) for name in record['bones']]
            record['modelId'] = Name(record['modelId']); record['skeleton'] = 'TengxianHumanoidV1'
            modelPath = PROJECT / 'Model/Character' / ('Model_Tengxian' + identifier + '.glb')
            record['originalModelSha256'] = hashlib.sha256(modelPath.read_bytes()).hexdigest()
            row['originalModelSha256'] = record['originalModelSha256']
            row['id'] = Name(row['id']); row['file'] = Name(row['file'])
            destination = PROJECT / 'Animation' / folder / row['file']
            destination.write_text(json.dumps(record, separators=(',', ':')) + '\n', encoding='utf8')
            row['sha256'] = hashlib.sha256(destination.read_bytes()).hexdigest()
            print('Retargeted', folder, identifier, flush=True)
        (PROJECT / 'Animation' / folder / manifestName).write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf8')

def WriteManifest(outputs):
    # The storyboard head's manifest is the adopted rows plus the derived looks and the facial
    # cast (facialUrl / facialCast); every other adopted-row field is the same as in REVISION.
    manifest = json.loads(Source('Model/Character/Data_LugouCharacterManifest.json', STORYBOARD_REVISION))
    manifest['models'] = [row for row in manifest['models'] if row['id'].replace('Lugou', '') in (*ADOPTED, *DERIVED)]
    manifest['generatedBy'] = 'Script_StandardizeCharacters.py'; manifest['skeleton'] = 'TengxianHumanoidV1'
    for row in manifest['models']:
        identifier = row['id'].replace('Lugou', ''); glb, source, bounds = outputs[identifier]
        row['id'] = Name(row['id']); row['url'] = Name(row['url'])
        row['sourceRevision'] = STORYBOARD_REVISION if identifier in DERIVED else REVISION
        row['animationSource'] = 'TengxianHumanoidV1'; row['animationSourceModel'] = 'TengxianNra02'
        row['boneRoles'] = {key: Name(value) for key, value in row['boneRoles'].items()}
        if 'derivedFrom' in row: row['derivedFrom'] = Name(row['derivedFrom'])
        # Derived looks used to scale to their base body's height; every body now shares the
        # reference skeleton (bounds below), so the per-look height and bake stamp go.
        row.pop('scaleHeight', None); row.pop('version', None)
        if 'facialUrl' in row:
            row['facialUrl'] = Name(row['facialUrl'])
            # CharacterSpeechTest: the cache stamp is the facial file's own hash.
            row['facialVersion'] = hashlib.sha256((PROJECT / row['facialUrl'].removeprefix('./')).read_bytes()).hexdigest()[:16]
        # Runtime target heights use a shared skeleton reference, not hats or hair.
        row['bounds'] = copy.deepcopy(next(r for r in json.loads(Source('Model/Character/Data_LugouCharacterManifest.json'))['models'] if r['id'] == 'LugouNra02')['bounds'])
        row['bytes'] = (PROJECT / row['url'].removeprefix('./')).stat().st_size
        row['sourceAnimationAudit'] = row.pop('animationAudit')
        row['animationAudit'] = {}
        for animation in glb.g['animations']:
            channel = next(c for c in animation['channels'] if c['target']['node'] == glb.byName['Bip001 Pelvis'] and c['target']['path'] == 'translation')
            # Root correction is included by the independent Node pose audit.
            row['animationAudit'][animation['name']] = {'sourceFrames': glb.g['accessors'][animation['samplers'][channel['sampler']]['input']]['count'], 'sourceBones': 53}
    (PROJECT / 'Model/Character/Data_TengxianCharacterManifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf8')
    infantry = json.loads(Source('Model/Character/Data_InfantryAnimations.json'))
    infantry['models'] = [row for row in infantry['models'] if row['id'].replace('Lugou', '') in ('Nra02', 'Ija01', 'Ija02', 'Ija03')]
    for row in infantry['models']:
        row['id'] = Name(row['id']); row['file'] = Name(row['file'])
    infantry['skeleton'] = 'TengxianHumanoidV1'
    (PROJECT / 'Model/Character/Data_InfantryAnimations.json').write_text(json.dumps(infantry, indent=2) + '\n', encoding='utf8')
    subprocess.run(['node', str(PROJECT / '_import/Script_StandardCharacterAudit.mjs')], cwd=str(REPO), check=True)

def SaveBlenderSource():
    # Hidden collections cannot be selected by object.select_all. Remove this
    # isolated task scene's datablocks explicitly so repeated bakes stay clean.
    for obj in list(bpy.data.objects): bpy.data.objects.remove(obj, do_unlink=True)
    for collection in list(bpy.data.collections): bpy.data.collections.remove(collection)
    for action in list(bpy.data.actions): bpy.data.actions.remove(action)
    bpy.data.orphans_purge(do_recursive=True)
    scene = bpy.context.scene; scene.unit_settings.system = 'METRIC'; scene.unit_settings.scale_length = 1
    for identifier in (*ADOPTED, *DERIVED, *FACIAL):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(PROJECT / 'Model/Character' / ('Model_Tengxian' + identifier + '.glb')))
        collection = bpy.data.collections.new('Character_Tengxian' + identifier); scene.collection.children.link(collection)
        for obj in set(bpy.data.objects) - before:
            for old in list(obj.users_collection): old.objects.unlink(obj)
            collection.objects.link(obj)
            if obj.type == 'ARMATURE':
                obj.name = 'Rig_Tengxian' + identifier
                obj.data.name = 'Skeleton_TengxianHumanoidV1_' + identifier
                obj.data.pose_position = 'REST'
        collection.hide_viewport = identifier != 'Nra02'; collection.hide_render = identifier != 'Nra02'
    scene['SharedSkeletonContract'] = 'Model/Character/Data_TengxianHumanoid.json'
    scene['SourceRevision'] = REVISION
    scene['StoryboardSourceRevision'] = STORYBOARD_REVISION
    rigs = [obj for obj in bpy.data.objects if obj.type == 'ARMATURE']
    assert len(rigs) == len(ADOPTED) + len(DERIVED) + len(FACIAL), 'One armature per body, derived look or facial derivative'
    referenceRig = bpy.data.objects['Rig_TengxianNra02']
    audit = []
    for rig in rigs:
        assert rig.location.length < 1e-7 and rig.rotation_euler.to_quaternion().angle < 1e-7
        assert max(abs(v - 1) for v in rig.scale) < 1e-7
        difference = max(abs(referenceRig.data.bones[bone.name].matrix_local[i][j] - bone.matrix_local[i][j]) for bone in rig.data.bones if bone.name in referenceRig.data.bones for i in range(4) for j in range(4))
        assert difference < 3e-6
        audit.append({'rig': rig.name, 'bones': len(rig.data.bones), 'maxBodyRestDifference': difference})
    # 2026-09-26: saved beside (not over) the first standardization's Model_TengxianSharedCharacters.blend.
    (SOURCE_DIR / 'Data_TengxianSharedCharactersStoryboard.json').write_text(json.dumps(audit, indent=2) + '\n', encoding='utf8')
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_DIR / 'Model_TengxianSharedCharactersStoryboard.blend'))

def WriteShoulderAudit(outputs):
    references = json.loads(Source('_blender/Data_NraRelaxedShoulderReference.json'))
    result = {}
    for oldId, reference in references.items():
        identifier = oldId.replace('Lugou', '')
        if identifier not in ADOPTED: continue
        _, source, _ = outputs[identifier]
        skin = source.g['skins'][0]
        inverse = source.Read(skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
        palette = np.array([np.array(canonicalWorld[Name(source.nodes[j]['name'])] @ Matrix.Diagonal((*source.world[j].to_scale(), 1))) for j in skin['joints']]) @ inverse
        for landmark in reference['landmarks']:
            primitive = source.g['meshes'][landmark['mesh']]['primitives'][landmark['primitive']]
            joints = source.Read(primitive['attributes']['JOINTS_0'])[landmark['vertex']].astype(int)
            weights = source.Read(primitive['attributes']['WEIGHTS_0'])[landmark['vertex']]
            deform = (palette[joints] * weights[:, None, None]).sum(axis=0)
            point = np.array([*landmark['sourcePosition'], 1])
            landmark['sourcePosition'] = (deform @ point)[:3].tolist()
            landmark['toSourceLinear'] = np.linalg.inv(deform[:3, :3]).tolist()
        result[Name(oldId)] = reference
    (PROJECT / '_blender/Data_TengxianShoulderReference.json').write_text(json.dumps(result, separators=(',', ':')) + '\n', encoding='utf8')

def AdoptBackRifleAppearance():
    """The historical preview embedded rejected NRA01; use the adopted body."""
    file = PROJECT / 'Animation/BackRifleRun/Animation_TengxianNraBackRifleRun.glb'
    library = Glb(file.read_bytes())
    base = Glb((PROJECT / 'Model/Character/Model_TengxianNra02.glb').read_bytes())
    socket = library.byName['Socket_BackRifle']; extra = []
    def Visit(index):
        extra.append(index)
        for child in library.nodes[index].get('children', []): Visit(child)
    Visit(socket)
    meshes = sorted({library.nodes[i]['mesh'] for i in extra if 'mesh' in library.nodes[i]})
    materials = sorted({p['material'] for i in meshes for p in library.g['meshes'][i]['primitives'] if 'material' in p})
    textures = set()
    def FindTextures(value):
        if isinstance(value, dict):
            for key, child in value.items():
                if key.endswith('Texture') and isinstance(child, dict) and 'index' in child: textures.add(child['index'])
                else: FindTextures(child)
        elif isinstance(value, list):
            for child in value: FindTextures(child)
    for i in materials: FindTextures(library.g['materials'][i])
    textures = sorted(textures); images = set()
    for i in textures:
        texture = library.g['textures'][i]
        if 'source' in texture: images.add(texture['source'])
        for ext in texture.get('extensions', {}).values():
            if 'source' in ext: images.add(ext['source'])
    images = sorted(images)
    base.bin.extend(b'\0' * (-len(base.bin) % 4)); binaryOffset = len(base.bin); base.bin.extend(library.bin)
    viewOffset = len(base.g['bufferViews']); accessorOffset = len(base.g['accessors'])
    for view in library.g['bufferViews']:
        value = copy.deepcopy(view); value['byteOffset'] = value.get('byteOffset', 0) + binaryOffset; base.g['bufferViews'].append(value)
    for accessor in library.g['accessors']:
        value = copy.deepcopy(accessor); value['bufferView'] += viewOffset; base.g['accessors'].append(value)
    imageMap = {i: len(base.g.get('images', [])) + n for n, i in enumerate(images)}
    for i in images:
        value = copy.deepcopy(library.g['images'][i]); value['bufferView'] += viewOffset; base.g.setdefault('images', []).append(value)
    samplerOffset = len(base.g.get('samplers', [])); base.g.setdefault('samplers', []).extend(copy.deepcopy(library.g.get('samplers', [])))
    textureMap = {i: len(base.g.get('textures', [])) + n for n, i in enumerate(textures)}
    for i in textures:
        value = copy.deepcopy(library.g['textures'][i])
        if 'source' in value: value['source'] = imageMap[value['source']]
        if 'sampler' in value: value['sampler'] += samplerOffset
        for ext in value.get('extensions', {}).values():
            if 'source' in ext: ext['source'] = imageMap[ext['source']]
        base.g.setdefault('textures', []).append(value)
    def RemapTextures(value):
        if isinstance(value, dict):
            for key, child in value.items():
                if key.endswith('Texture') and isinstance(child, dict) and 'index' in child: child['index'] = textureMap[child['index']]
                else: RemapTextures(child)
        elif isinstance(value, list):
            for child in value: RemapTextures(child)
    materialMap = {i: len(base.g.get('materials', [])) + n for n, i in enumerate(materials)}
    for i in materials:
        value = copy.deepcopy(library.g['materials'][i]); RemapTextures(value); base.g.setdefault('materials', []).append(value)
    meshMap = {i: len(base.g['meshes']) + n for n, i in enumerate(meshes)}
    for i in meshes:
        value = copy.deepcopy(library.g['meshes'][i])
        for primitive in value['primitives']:
            primitive['attributes'] = {key: index + accessorOffset for key, index in primitive['attributes'].items()}
            if 'indices' in primitive: primitive['indices'] += accessorOffset
            if 'material' in primitive: primitive['material'] = materialMap[primitive['material']]
        base.g['meshes'].append(value)
    nodeMap = {i: base.byName[Name(node.get('name', ''))] for i, node in enumerate(library.nodes) if Name(node.get('name', '')) in base.byName}
    nodeMap.update({i: len(base.nodes) + n for n, i in enumerate(extra)})
    for i in extra:
        node = copy.deepcopy(library.nodes[i])
        if 'children' in node: node['children'] = [nodeMap[j] for j in node['children']]
        if 'mesh' in node: node['mesh'] = meshMap[node['mesh']]
        base.nodes.append(node)
    base.nodes[nodeMap[library.parent[socket]]].setdefault('children', []).append(nodeMap[socket])
    base.g['animations'] = copy.deepcopy(library.g['animations'])
    for animation in base.g['animations']:
        for channel in animation['channels']: channel['target']['node'] = nodeMap[channel['target']['node']]
        for sampler in animation['samplers']: sampler['input'] += accessorOffset; sampler['output'] += accessorOffset
    base.g['asset']['extras']['animationSource'] = library.g['asset']['extras']['sourceAsset']
    base.Save(file)
    config = json.loads(Source('Animation/BackRifleRun/Data_BackRifleRun.json').decode('utf-8-sig'))
    config['legacySourceModel'] = config['sourceModel']; config['legacySourceModelSha256'] = config['sourceModelSha256']
    config['sourceModel'] = 'Taierzhuang1938/Model/Character/Model_TengxianNra02.glb'
    config['sourceModelSha256'] = hashlib.sha256((REPO / config['sourceModel']).read_bytes()).hexdigest()
    config['armature'] = 'Rig_TengxianCharacter'; config['socketBone'] = 'Bip001 Spine2'; config['skeleton'] = 'TengxianHumanoidV1'
    config['revision'] = 'HumanoidV1'
    config['legacySocketMatrixBlenderLocal'] = config.pop('socketMatrixBlenderLocal')
    socketNode = base.nodes[nodeMap[socket]]
    config['socketTransformGltfMetres'] = {key: socketNode[key] for key in ('translation', 'rotation', 'scale')}
    (PROJECT / 'Animation/BackRifleRun/Data_BackRifleRun.json').write_text(json.dumps(config, indent=2) + '\n', encoding='utf8')

def Main(skipBodies=False):
    assert bpy.context.scene.get('BlenderMcpTask') == 'CharacterStandardization', 'Use the isolated task BlenderMCP instance'
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    outputs = {}
    for identifier in (*ADOPTED, *DERIVED, *FACIAL):
        revision = REVISION if identifier in ADOPTED else STORYBOARD_REVISION
        outputs[identifier] = (Glb((PROJECT / 'Model/Character' / ('Model_Tengxian' + identifier + '.glb')).read_bytes()), Glb(Source('Model/Character/Model_Lugou' + identifier + '.glb', revision)), None) if skipBodies else BakeModel(identifier, revision=revision)
        print('Baked', identifier, flush=True)
    for identifier in ('Nra02', 'Ija01', 'Ija02', 'Ija03'):
        source = 'Model/Character/Animation_Lugou' + identifier + 'Infantry.glb'
        BakeModel(identifier, source, PROJECT / Name(source))
        print('Retargeted infantry', identifier, flush=True)
    for faction in ('Nra', 'Ija'):
        source = 'Model/Character/Animation_Lugou' + faction + 'DeathCollapse.glb'
        BakeModel(faction, source, PROJECT / Name(source))
        print('Retargeted death', faction, flush=True)
    source = 'Animation/BackRifleRun/Animation_LugouNraBackRifleRun.glb'
    BakeModel('NraBackRifleRun', source, PROJECT / Name(source))
    AdoptBackRifleAppearance()
    BakeStoryLibraries(outputs)
    WriteManifest(outputs)
    WriteShoulderAudit(outputs)
    subprocess.run(['node', str(PROJECT / '_import/Script_LocomotionProfileBake.mjs')], cwd=str(REPO), check=True)
    contract = {'schema': 1, 'id': 'TengxianHumanoidV1', 'sourceRevision': REVISION,
        'unit': 'metre', 'up': '+Y', 'assetForward': '+Z', 'actorForward': '-Z',
        'reference': 'TengxianNra02', 'bodyBones': list(canonicalNodes.values()), 'parents': canonicalParent}
    (PROJECT / 'Model/Character/Data_TengxianHumanoid.json').write_text(json.dumps(contract, indent=2) + '\n', encoding='utf8')
    SaveBlenderSource()
    print('Body assets, compatible animations and editable Blender source saved.', flush=True)

if __name__ == '__main__': Main()
