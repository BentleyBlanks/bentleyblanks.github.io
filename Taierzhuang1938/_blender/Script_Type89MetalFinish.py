"""Apply a photo-calibrated metal finish to the frozen G55 Type89 source pair."""

import argparse
import hashlib
import json
import sys
from pathlib import Path
from types import SimpleNamespace

import bpy
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from Script_Type89RestorationHigh import MODEL, SOURCE_ROOT, SaveMaps
from Script_Type89RestorationTopology import Role, StripMaterials
from Script_Type89RestorationGame import BakeAtlas


BASELINE = SOURCE_ROOT / 'GeometryV55SurfaceV15'
DEFAULT_OUTPUT = SOURCE_ROOT / 'GeometryV55SurfaceV16'
PROFILE_FILE = HERE.parent / 'Model/Type89MediumTank/Data_MetalFinishProfile.json'
HIGH_BLEND = 'Scene_Type89MediumTankHighPbr.blend'
GAME_BLEND = 'Scene_Type89MediumTankGamePbr.blend'


def RecipeSha256():
    # The repository and Windows authoring tools use different line endings.
    profile = PROFILE_FILE.read_text(encoding='utf-8')
    return hashlib.sha256(profile.encode('utf-8')).hexdigest()


class FinishGraph:
    def __init__(self, material):
        self.tree = material.node_tree
        self.shader = next(node for node in self.tree.nodes if node.type == 'BSDF_PRINCIPLED')
        self.attributes = {}
        self.frame = self.tree.nodes.new('NodeFrame')
        self.frame.label = 'SurfaceV16 Tsuchiura finish'
        self.frame.location = (-980, -620)
        self.index = 0

    def Node(self, kind, label=''):
        node = self.tree.nodes.new(kind)
        node.parent = self.frame
        node.label = label
        node.location = ((self.index // 8)*200, -(self.index % 8)*135)
        self.index += 1
        return node

    def Bind(self, value, target):
        if isinstance(value, bpy.types.NodeSocket):
            self.tree.links.new(value, target)
        else:
            target.default_value = value

    def Get(self, name):
        socket = self.shader.inputs[name]
        return socket.links[0].from_socket if socket.is_linked else socket.default_value

    def Put(self, name, value):
        target = self.shader.inputs[name]
        for link in list(target.links):
            self.tree.links.remove(link)
        self.Bind(value, target)

    def Attribute(self, name, channel='Fac'):
        if name not in self.attributes:
            node = self.Node('ShaderNodeAttribute', name)
            node.attribute_name = name
            self.attributes[name] = node
        return self.attributes[name].outputs[channel]

    def Math(self, operation, a, b=0, clamp=False):
        node = self.Node('ShaderNodeMath')
        node.operation = operation
        node.use_clamp = clamp
        self.Bind(a, node.inputs[0])
        self.Bind(b, node.inputs[1])
        return node.outputs[0]

    def Mix(self, factor, a, b, blend='MIX', label=''):
        node = self.Node('ShaderNodeMixRGB', label)
        node.blend_type = blend
        self.Bind(factor, node.inputs[0])
        self.Bind(a, node.inputs[1])
        self.Bind(b, node.inputs[2])
        return node.outputs[0]

    def Lerp(self, weight, a, b):
        return self.Math('ADD', self.Math('MULTIPLY', self.Math('SUBTRACT', 1, weight), a),
                         self.Math('MULTIPLY', weight, b), clamp=True)

    def Noise(self, coordinate, metres, detail=2.0):
        node = self.Node('ShaderNodeTexNoise')
        self.Bind(coordinate, node.inputs['Vector'])
        node.inputs['Scale'].default_value = 1/metres
        node.inputs['Detail'].default_value = detail
        node.inputs['Roughness'].default_value = .56
        return node.outputs['Fac']

    def Stroke(self, coordinate, stretch):
        node = self.Node('ShaderNodeVectorMath', 'Direction of contact polish')
        node.operation = 'MULTIPLY'
        self.Bind(coordinate, node.inputs[0])
        node.inputs[1].default_value = stretch
        return self.Noise(node.outputs['Vector'], .008, 1.0)

    def Smooth(self, source, lower, upper):
        node = self.Node('ShaderNodeMapRange')
        node.clamp = True
        node.interpolation_type = 'SMOOTHSTEP'
        self.Bind(source, node.inputs['Value'])
        node.inputs['From Min'].default_value = lower
        node.inputs['From Max'].default_value = upper
        return node.outputs['Result']

    def Variation(self, center, noise, amplitude):
        return self.Math('ADD', center, self.Math('MULTIPLY', self.Math('SUBTRACT', noise, .5), amplitude))

    def Bump(self, height, distance, strength=1):
        node = self.Node('ShaderNodeBump', 'Metal grain, metres')
        node.inputs['Distance'].default_value = distance
        self.Bind(strength, node.inputs['Strength'])
        self.Bind(self.Get('Normal'), node.inputs['Normal'])
        self.Bind(height, node.inputs['Height'])
        self.Put('Normal', node.outputs[0])


def Rgba(value):
    return tuple(value)+(1,)


def AddFinishCoordinates(root):
    seen = set()
    # Preserve a single shoe-local coordinate shared by every moving link.
    for obj in sorted(root.children_recursive, key=lambda item: item.name):
        if obj.type != 'MESH' or obj.data in seen:
            continue
        mesh = obj.data
        seen.add(mesh)
        track = obj.name.startswith('Mesh_TrackLink')
        coord = mesh.attributes.new('MetalFinishMetres', 'FLOAT_VECTOR', 'POINT')
        slope = mesh.attributes.new('MetalFinishSkyward', 'FLOAT', 'FACE')
        land = mesh.attributes.new('MetalFinishContact', 'FLOAT', 'FACE')
        kind = {
            'MetalFinishSkirt': obj.name.startswith('Mesh_VerticalSkirt'),
            'MetalFinishPressed': obj.name in {'Mesh_SuspensionLeft', 'Mesh_SuspensionRight'},
            'MetalFinishJacket': obj.name in {'Mesh_BowMgJacket', 'Mesh_TurretMachineGun'},
            'MetalFinishBowJacket': obj.name == 'Mesh_BowMgJacket',
        }
        for name, chosen in kind.items():
            if chosen:
                attr = mesh.attributes.new(name, 'FLOAT', 'FACE')
                attr.data.foreach_set('value', np.ones(len(mesh.polygons), dtype=np.float32))
        rotation = obj.matrix_world.to_3x3().normalized()
        points = [vertex.co if track else obj.matrix_world@vertex.co for vertex in mesh.vertices]
        coord.data.foreach_set('vector', np.asarray(points, dtype=np.float32).ravel())
        skyward = np.zeros(len(mesh.polygons), dtype=np.float32)
        contact = np.zeros_like(skyward)
        race = np.zeros_like(skyward)
        for face in mesh.polygons:
            normal = rotation@face.normal
            if not track:
                # Within the main hull silhouette, the upper inclined panel
                # has the more luminous warm olive film seen in the primary.
                skyward[face.index] = max(0,min(1,(normal.z-.30)/.57))
                if obj.name == 'Mesh_TurretYaw' and (obj.matrix_world@face.center).z < 1.87:
                    race[face.index] = 1
                continue
            # The shoe crown only bears contact facing outwards from the belt.
            # Older paint evidence cannot define the individual worn scratch.
            z = face.center.z
            outward = max(0, min(1, (face.normal.z-.12)/.73))
            crest = max(0, min(1, (z-.008)/.017))
            edge = max(0, min(1, (-face.center.y-.039)/.016))
            lip = edge*max(0, min(1, (z-.012)/.011))
            contact[face.index] = max(outward*crest, lip*.82)
        slope.data.foreach_set('value', skyward)
        land.data.foreach_set('value', contact)
        if np.any(race):
            attr = mesh.attributes.new('MetalFinishRace', 'FLOAT', 'FACE')
            attr.data.foreach_set('value', race)


def Paint(g, role, config, broad, grain):
    metal = g.Get('Metallic')
    dielectric = g.Math('SUBTRACT', 1, g.Math('MULTIPLY', metal, 2.2, clamp=True), clamp=True)
    preserve = g.Math('SUBTRACT', 1, g.Attribute('MuseumBadge'), clamp=True)
    paint = g.Math('MULTIPLY', dielectric, preserve)
    tint = Rgba(config['paintLinearScale'])
    if role == 'Armor':
        up = g.Attribute('MetalFinishSkyward')
        tint = g.Mix(up, tint, Rgba(config['skywardLinearScale']))
        tint = g.Mix(g.Attribute('MetalFinishPressed'), tint, Rgba(config['pressedLinearScale']))
        tint = g.Mix(g.Attribute('MetalFinishSkirt'), tint, Rgba(config['lowerLinearScale']))
    base = g.Mix(paint, g.Get('Base Color'), tint, 'MULTIPLY', 'Photographed olive film')
    variation = g.Variation(1, broad, .082 if role == 'CastArmor' else .052)
    g.Put('Base Color', g.Mix(paint, base, variation, 'MULTIPLY'))
    target = g.Variation(config['roughness'], broad, .16 if role == 'CastArmor' else .12)
    target = g.Math('ADD', target, g.Variation(0, grain, .08))
    g.Put('Roughness', g.Lerp(g.Math('MULTIPLY', paint, .73), g.Get('Roughness'), target))
    g.Put('Specular IOR Level', config['specular'])
    g.Put('Coat Weight', g.Math('MULTIPLY', paint, config['coatWeight']))
    g.Put('Coat Roughness', config['coatRoughness'])
    g.Bump(grain, config['reliefM'], paint)


def Steel(g, config, grain):
    race = g.Attribute('MetalFinishRace')
    jacket = g.Attribute('MetalFinishJacket')
    bow = g.Attribute('MetalFinishBowJacket')
    painted = g.Get('Base Color')
    neutral = g.Node('ShaderNodeRGBToBW')
    g.Bind(painted, neutral.inputs[0])
    neutralized = g.Mix(.79, painted, neutral.outputs[0], label='Neutral iron reflection')
    neutralized = g.Mix(1, neutralized, (1.04, .99, .88, 1), 'MULTIPLY')
    jacketColor = g.Mix(bow, Rgba(config['jacketLinear']), Rgba(config['frontJacketLinear']))
    oxide = g.Mix(jacket, neutralized, jacketColor)
    base = g.Mix(race, oxide, Rgba(config['raceLinear']), label='Dark greased turret race')
    g.Put('Base Color', g.Mix(1, base, g.Variation(1, grain, .23), 'MULTIPLY'))
    jacketRoughness = g.Lerp(bow, config['jacketRoughness'], config['frontJacketRoughness'])
    roughness = g.Lerp(jacket, g.Get('Roughness'), g.Variation(jacketRoughness, grain, .20))
    g.Put('Roughness', g.Lerp(race, roughness, g.Variation(config['raceRoughness'], grain, .15)))
    g.Put('Metallic', g.Lerp(race, g.Lerp(jacket, g.Get('Metallic'), g.Lerp(bow, .77, .72)), .68))
    g.Bump(grain, config['reliefM'], .56)


def Track(g, config, coordinate, broad, grain):
    crown = g.Attribute('MetalFinishContact')
    split = g.Node('ShaderNodeSeparateXYZ')
    g.Bind(coordinate, split.inputs[0])
    # The high shoe tapers across the open web. The primary shows the
    # surviving pale band across the thick leading lip of each casting.
    leading = g.Smooth(g.Math('MULTIPLY', split.outputs['Y'], -1), *config['leadingBandM'])
    strokes = g.Stroke(coordinate, (.19, 5.1, 1))
    worn = g.Math('MULTIPLY', crown, leading)
    polish = g.Math('MULTIPLY', worn, g.Variation(.99, broad, .25), clamp=True)
    source = g.Node('ShaderNodeRGBToBW')
    g.Bind(g.Get('Base Color'), source.inputs[0])
    porous = g.Mix(.77, source.outputs[0], Rgba(config['castLinear']), label='Oxide in cast webs')
    porous = g.Mix(1, porous, g.Variation(1, grain, .43), 'MULTIPLY')
    land = g.Mix(1, Rgba(config['landLinear']), g.Variation(1, strokes, .19), 'MULTIPLY')
    g.Put('Base Color', g.Mix(polish, porous, land, label='Warm burnished contact lands'))
    roughCast = g.Variation(config['castRoughness'], grain, .23)
    roughLand = g.Variation(config['landRoughness'], strokes, .16)
    g.Put('Roughness', g.Lerp(polish, roughCast, roughLand))
    g.Put('Metallic', g.Lerp(polish, config['castMetallic'], config['landMetallic']))
    g.Bump(g.Lerp(polish, grain, strokes), config['reliefM'], g.Lerp(polish, .96, .28))


def Materials(root):
    return {material for obj in root.children_recursive if obj.type == 'MESH'
            for material in obj.data.materials if material}


def ApplyHigh(profile, output):
    source = BASELINE/HIGH_BLEND
    bpy.ops.wm.open_mainfile(filepath=str(source))
    root = bpy.data.objects[MODEL]
    assert root['geometryVersion'] == profile['geometryVersion'] and root['surfaceRevision'] == 'SurfaceV15'
    AddFinishCoordinates(root)
    for material in Materials(root):
        role = Role(material)
        config = profile['roles'].get(role)
        if config is None:
            continue
        g = FinishGraph(material)
        coordinate = g.Attribute('MetalFinishMetres', 'Vector')
        broad = g.Noise(coordinate, config['grainM']*5.5, 2.5)
        grain = g.Noise(coordinate, config['grainM'], 2.0)
        if role == 'Track':
            Track(g, config, coordinate, broad, grain)
        elif role == 'Steel':
            Steel(g, config, grain)
        else:
            Paint(g, role, config, broad, grain)
    root['surfaceRevision'] = profile['revision']
    root['materialRecipeSha256'] = RecipeSha256()
    bpy.data.use_autopack = False
    bpy.context.preferences.filepaths.save_version = 0
    SaveMaps(root, output)
    bpy.ops.wm.save_as_mainfile(filepath=str(output/HIGH_BLEND), relative_remap=False)
    print(f'High project saved in {output}', flush=True)


def HighDonors(root, highFile):
    objects = {}
    for obj in sorted(root.children_recursive, key=lambda item: item.name):
        if obj.type != 'MESH' or obj.data in objects:
            continue
        objects[obj.data] = obj
    names = [obj.name for obj in objects.values()]
    names.remove('Mesh_ExhaustGuardPerforatedSheet')
    with bpy.data.libraries.load(str(highFile), link=False) as (source, destination):
        missing = set(names)-set(source.objects)
        assert not missing, missing
        destination.objects = list(names)
    high = {name: obj.data for name, obj in zip(names, destination.objects)}
    guard = high['Mesh_ExhaustGuard'].copy()
    StripMaterials(guard, {'Guard'})
    shell = high['Mesh_ExhaustGuard'].copy()
    StripMaterials(shell, {'Armor', 'Exhaust'})
    high['Mesh_ExhaustGuard'] = shell
    high['Mesh_ExhaustGuardPerforatedSheet'] = guard
    pairs = {'Body': [], 'Track': [], 'Guard': []}
    for obj in objects.values():
        atlas = 'Track' if obj.name.startswith('Mesh_TrackLink') else (
            'Guard' if obj.name == 'Mesh_ExhaustGuardPerforatedSheet' else 'Body')
        pairs[atlas].append((high[obj.name], obj))
    return pairs


def BakeGame(output):
    bpy.ops.wm.open_mainfile(filepath=str(BASELINE/'Game'/GAME_BLEND))
    root = bpy.data.objects[MODEL]
    pairs = HighDonors(root, output/HIGH_BLEND)
    guard = next(node.image for material in Materials(root) if Role(material) == 'Guard'
                 for node in material.node_tree.nodes if node.type == 'TEX_IMAGE' and node.label == 'Base')
    for obj in root.children_recursive:
        if obj.type == 'MESH':
            obj.hide_render = True
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 8
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 4
    scene.render.bake.target = 'IMAGE_TEXTURES'
    import os
    os.environ['TYPE89_SOURCE_SUBDIR'] = output.parent.name if output.parent != SOURCE_ROOT else output.name
    os.environ['TYPE89_REVIEW_SUBDIR'] = 'SurfaceV16'
    from Script_Type89PbrBake import Image, SaveImage
    bake = SimpleNamespace(Image=Image, SaveImage=SaveImage)
    maps = output/'Bake'
    maps.mkdir(exist_ok=True)
    for name, rows in pairs.items():
        size = 4096 if name == 'Body' else 1024
        BakeAtlas(bake, name, rows, maps, (size,)*3, guard)


def BindGame(profile, output):
    bpy.ops.wm.open_mainfile(filepath=str(BASELINE/'Game'/GAME_BLEND))
    root = bpy.data.objects[MODEL]
    materials = Materials(root)
    directory = output/'Game'
    images = {}
    for material in materials:
        role = Role(material)
        if role in {'Armor','CastArmor','Guard'}:
            shader = next(node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
            for name, key in [('Coat Weight','coatWeight'),('Coat Roughness','coatRoughness'),
                              ('Specular IOR Level','specular')]:
                shader.inputs[name].default_value = profile['roles'][role][key]
        for node in material.node_tree.nodes:
            if node.type != 'TEX_IMAGE' or not node.image:
                continue
            original = node.image
            if original not in images:
                name = original.name
                original.name = name+'Baseline'
                image = bpy.data.images.load(str(directory/'Maps'/name), check_existing=False)
                image.name = name
                image.colorspace_settings.name = original.colorspace_settings.name
                image.pack()
                images[original] = (name,image)
            node.image = images[original][1]
    root['surfaceRevision'] = profile['revision']
    root['materialRecipeSha256'] = RecipeSha256()
    bpy.data.orphans_purge(do_recursive=True)
    bpy.data.use_autopack = False
    bpy.context.preferences.filepaths.save_version = 0
    for name,image in images.values():
        image.filepath_raw = '//Maps/'+name
    bpy.ops.wm.save_as_mainfile(filepath=str(directory/GAME_BLEND), relative_remap=False)


def Main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--phase', choices=['high','bake','bind'], required=True)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    output = args.output.resolve()
    assert output.is_relative_to(DEFAULT_OUTPUT.resolve())
    output.mkdir(parents=True, exist_ok=True)
    profile = json.loads(PROFILE_FILE.read_text(encoding='utf-8'))
    if args.phase == 'high':
        ApplyHigh(profile, output)
    elif args.phase == 'bake':
        BakeGame(output)
    else:
        BindGame(profile, output)


if __name__ == '__main__':
    Main()
