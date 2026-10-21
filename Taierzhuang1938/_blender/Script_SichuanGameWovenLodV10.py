"""Reinforce actual V10 high-source grass with the imagegen V11 woven tile.

ApplyWovenLodSource(root, repo) edits source material assignments and retains
original materials with fake users for reliable save/reopen. It copies every
shader by projection kind without changing the original shader graph, and
changes no vertices, UVs, modifiers or object/anchor transforms.
"""
import hashlib
from pathlib import Path

import bpy


generator = 'SichuanWovenLodSourceV11'
tileWidthM = .055
tileWeight = .50
tileTint = (.98, .91, .78)
tileRelativePath = 'Taierzhuang1938/_import/SichuanBlanketPack/Source/GrassWeaveV11/Texture_SichuanWovenLodBaseV11.png'


def SourceName(obj):
    name = obj.get('PackSourceName', obj.name)
    return name[5:] if name.startswith('High_') else name


def ApplyWovenLodSource(root, repo):
    if root is None or SourceName(root) != 'Pack_Root':
        raise RuntimeError('Pass the retained high Pack_Root assembly')
    objects = {SourceName(obj): obj for obj in (root, *root.children_recursive)}
    targetNames = {
        'Mat': ('Pack_TrueRolledGrassSheet', 'Pack_InterlacedMatGrass'),
        'Sandals': ('Pack_GrassSandal01Foundation', 'Pack_GrassSandal01BraidedWeave',
                    'Pack_GrassSandal02Foundation', 'Pack_GrassSandal02BraidedWeave')}
    anchorNames = {'Mat': 'Pack_StrawMat', 'Sandals': 'Pack_Sandals'}
    for name in [*anchorNames.values(), *targetNames['Mat'], *targetNames['Sandals']]:
        if name not in objects:
            raise RuntimeError('Missing actual high woven source: ' + name)
    path = Path(repo)/tileRelativePath
    if not path.is_file():
        raise FileNotFoundError('The imagegen woven source tile has not been staged: ' + str(path))
    image = bpy.data.images.load(str(path.resolve()), check_existing=True)
    image.colorspace_settings.name = 'sRGB'
    if tuple(image.size) != (1024, 1024):
        raise RuntimeError('The woven source tile must be the staged 1024 x 1024 imagegen image')
    image.pack()
    imageDigest = hashlib.sha256(path.read_bytes()).hexdigest()
    matPart, sheet = objects['Pack_StrawMat'], objects['Pack_TrueRolledGrassSheet']
    if len(sheet.data.vertices) != 601*49:
        raise RuntimeError('Measure the actual V10 601 x 49 rolled sheet, without rebuilding a cylinder')
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = sheet.evaluated_get(depsgraph)
    evaluatedMesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=depsgraph)
    try:
        transform = matPart.matrix_world.inverted_safe() @ evaluated.matrix_world
        outer = [transform @ evaluatedMesh.vertices[index].co for index in range(471*49, 601*49)]
    finally:
        evaluated.to_mesh_clear()
    centerY = .5*(min(point.y for point in outer)+max(point.y for point in outer))
    centerZ = .5*(min(point.z for point in outer)+max(point.z for point in outer))
    radius = sum(((point.y-centerY)**2+(point.z-centerZ)**2)**.5 for point in outer)/len(outer)
    if not .015 < radius < .060:
        raise RuntimeError('Actual roll radius is outside the expected centimetre-scale source')
    materialCache, materialReports, assignments = {}, [], []

    def Math(tree, operation, name, first=None, second=None):
        node = tree.nodes.new('ShaderNodeMath')
        node.operation = operation
        node.label = name
        for index, value in enumerate((first, second)):
            if value is None:
                continue
            if isinstance(value, (int, float)):
                node.inputs[index].default_value = value
            else:
                tree.links.new(value, node.inputs[index])
        return node.outputs[0]

    def CopyMaterial(original, kind):
        # Repeated calls restart from the original shader rather than mixing
        # another tile layer into the previous reinforcement.
        if original.get(generator):
            name = original.get('WovenLodOriginalMaterial')
            original = bpy.data.materials.get(name)
            if original is None:
                raise RuntimeError('The original woven material is no longer available: ' + str(name))
        key = (original.name, kind)
        if key in materialCache:
            return materialCache[key]
        if not original.use_nodes or original.node_tree is None:
            raise RuntimeError('The real grass source requires its existing Principled shader')
        # The repeat-call reference is a material name.  Retain the real
        # original datablock across save/reopen even after its last surface
        # switches to the copied woven material.
        original.use_fake_user = True
        result = original.copy()
        result.use_fake_user = False
        digest = hashlib.sha256(original.name.encode('utf-8')).hexdigest()[:10]
        result.name = 'Material_WovenLodV11_' + kind + '_' + digest
        tree = result.node_tree
        shaders = [node for node in tree.nodes if node.type == 'BSDF_PRINCIPLED']
        if len(shaders) != 1:
            raise RuntimeError('Expected one real source Principled shader: ' + original.name)
        shader = shaders[0]
        coordinates = tree.nodes.new('ShaderNodeTexCoord')
        coordinates.object = objects[anchorNames[kind]]
        coordinates.label = 'Part-local physical woven projection ' + kind
        separate = tree.nodes.new('ShaderNodeSeparateXYZ')
        tree.links.new(coordinates.outputs['Object'], separate.inputs['Vector'])
        combine = tree.nodes.new('ShaderNodeCombineXYZ')
        u = Math(tree, 'MULTIPLY', 'Physical U / %.0f mm' % (tileWidthM*1000), separate.outputs['X'], 1/tileWidthM)
        if kind == 'Mat':
            dy = Math(tree, 'SUBTRACT', 'Roll local Y minus measured centre', separate.outputs['Y'], centerY)
            dz = Math(tree, 'SUBTRACT', 'Roll local Z minus measured centre', separate.outputs['Z'], centerZ)
            angle = Math(tree, 'ARCTAN2', 'Measured roll circumferential angle', dz, dy)
            v = Math(tree, 'MULTIPLY', 'Roll arc / %.0f mm' % (tileWidthM*1000), angle, radius/tileWidthM)
        else:
            v = Math(tree, 'MULTIPLY', 'Physical Z / %.0f mm' % (tileWidthM*1000), separate.outputs['Z'], 1/tileWidthM)
        tree.links.new(u, combine.inputs['X'])
        tree.links.new(v, combine.inputs['Y'])
        texture = tree.nodes.new('ShaderNodeTexImage')
        texture.image = image
        texture.extension = 'REPEAT'
        texture.interpolation = 'Linear'
        texture.label = 'Imagegen V11 coarse woven grass, sRGB, %.0f mm tile' % (tileWidthM*1000)
        tree.links.new(combine.outputs['Vector'], texture.inputs['Vector'])
        color = shader.inputs['Base Color']
        incoming = color.links[0].from_socket if color.is_linked else None
        originalValue = tuple(color.default_value)
        mix = tree.nodes.new('ShaderNodeMixRGB')
        mix.blend_type = 'MIX'
        mix.inputs[0].default_value = tileWeight
        mix.label = '50% fine imagegen weave + 50% actual old grass colour'
        if incoming is not None:
            tree.links.new(incoming, mix.inputs[1])
        else:
            mix.inputs[1].default_value = originalValue
        tint = tree.nodes.new('ShaderNodeMixRGB')
        tint.blend_type = 'MULTIPLY'
        tint.inputs[0].default_value = 1
        tint.inputs[2].default_value = (*tileTint, 1)
        tint.label = 'Warm weathered straw; imagegen tile branch only'
        tree.links.new(texture.outputs['Color'], tint.inputs[1])
        tree.links.new(tint.outputs['Color'], mix.inputs[2])
        tree.links.new(mix.outputs['Color'], color)
        oldNormalLinked = shader.inputs['Normal'].is_linked
        for link in list(shader.inputs['Normal'].links):
            tree.links.remove(link)
        luminance = tree.nodes.new('ShaderNodeRGBToBW')
        tree.links.new(texture.outputs['Color'], luminance.inputs['Color'])
        bump = tree.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = .08
        bump.inputs['Distance'].default_value = .0006
        bump.invert = False
        bump.label = 'Gentle imagegen fibre bump from actual geometry normal'
        tree.links.new(luminance.outputs[0], bump.inputs['Height'])
        tree.links.new(bump.outputs['Normal'], shader.inputs['Normal'])
        result[generator] = True
        result['WovenLodOriginalMaterial'] = original.name
        result['WovenLodProjectionKind'] = kind
        result['WovenLodImagegenSource'] = str(path.resolve())
        result['WovenLodImageSha256'] = imageDigest
        result['WovenLodTileWidthM'] = tileWidthM
        result['WovenLodTileMix'] = tileWeight
        result['WovenLodTileTint'] = list(tileTint)
        result['WovenLodUsesGeometryNormal'] = True
        result['WovenLodSuppressesOldShaderNormal'] = oldNormalLinked
        materialCache[key] = result
        materialReports.append({'material': result.name, 'original': original.name, 'projectionKind': kind,
                                'originalPersistentFakeUser': bool(original.use_fake_user),
                                'anchor': coordinates.object.name, 'tileWeight': tileWeight,
                                'tileTintLinear': list(tileTint),
                                'originalColourWeight': 1-tileWeight, 'bumpStrength': .08,
                                'bumpDistanceM': .0006, 'previousShaderNormalSuppressed': oldNormalLinked})
        return result

    for kind, names in targetNames.items():
        for name in names:
            obj = objects[name]
            if obj.type != 'MESH' or not obj.data.materials:
                raise RuntimeError('The actual source has no material-bearing mesh: ' + name)
            # Read the effective material before changing DATA/OBJECT links.
            # A per-object override can contain the real cavity/weathering
            # shader even when the underlying mesh slot points elsewhere.
            effectiveMaterials = [slot.material for slot in obj.material_slots]
            originalSlotLinks = [slot.link for slot in obj.material_slots]
            # Avoid changing an excluded source if it happens to share a mesh
            # datablock.  A copied mesh retains all positions/UVs verbatim.
            copiedSharedData = obj.data.users > 1
            if copiedSharedData:
                obj.data = obj.data.copy()
            replacements = []
            for index, original in enumerate(effectiveMaterials):
                if original is None:
                    raise RuntimeError('Empty grass source material slot: ' + obj.name)
                result = CopyMaterial(original, kind)
                obj.data.materials[index] = result
                # Resolve any existing per-object override to the same new
                # data material, so evaluated copying and direct baking agree.
                obj.material_slots[index].link = 'DATA'
                replacements.append(result.name)
            obj[generator] = True
            assignments.append({'object': obj.name, 'sourceName': name, 'projectionKind': kind,
                                'effectiveOriginalMaterials': [mat.name if mat else None for mat in effectiveMaterials],
                                'originalSlotLinks': originalSlotLinks,
                                'materials': replacements, 'copiedSharedMeshData': copiedSharedData})
    return {'generator': generator, 'imagegenTile': str(path.resolve()), 'imageSha256': imageDigest,
            'imageResolution': list(image.size), 'imagePacked': bool(image.packed_file),
            'tileWidthM': tileWidthM, 'tileWeight': tileWeight, 'tileTintLinear': list(tileTint), 'assignments': assignments,
            'materials': materialReports, 'rollProjection': {'centerY': centerY, 'centerZ': centerZ,
                'radiusM': radius, 'measuredOuterTurnGridRows': [471, 600], 'measuredPoints': len(outer)},
            'excludedSources': ['cut grass end bundles', 'inner mat tuck', 'cotton retainers', 'hanging twine'],
            'originalShaderGraphsUnchanged': True, 'originalMaterialsRetainedWithFakeUser': True,
            'geometryAndUvsUnchanged': True}
