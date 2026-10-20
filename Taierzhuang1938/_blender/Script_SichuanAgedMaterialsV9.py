"""Reference-scale old cotton; part-local, irregular dirt for the V9 study."""
import bpy
from pathlib import Path

imageCache = {}


def MakeAgedMaterial(role, folder, name, coordinateRoot, narrow=False,
                     patch=False, fold=False, button=False, shade=1):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    for key, value in {'AtlasRegion': role, 'NarrowTape': narrow, 'WearPatch': patch,
                       'WearFold': fold, 'WearButton': button, 'StrawTone': shade,
                       'WearCoordinateRoot': coordinateRoot.name,
                       'WornStudy': 'V09 unique cotton and localized weathering'}.items():
        material[key] = value
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()

    def Node(kind): return nodes.new(kind)
    def Math(op, a, b):
        n = Node('ShaderNodeMath'); n.operation = op
        for i, value in enumerate((a, b)):
            if isinstance(value, (float, int)): n.inputs[i].default_value = value
            else: links.new(value, n.inputs[i])
        return n.outputs[0]
    def Vec(op, a, value):
        n = Node('ShaderNodeVectorMath'); n.operation = op
        links.new(a, n.inputs[0]); n.inputs[1].default_value = value
        return n.outputs[0]
    def Mix(color, tint, amount, mode='MULTIPLY'):
        n = Node('ShaderNodeMixRGB'); n.blend_type = mode
        links.new(color, n.inputs[1]); n.inputs[2].default_value = tint
        if isinstance(amount, (float, int)): n.inputs[0].default_value = amount
        else: links.new(amount, n.inputs[0])
        return n.outputs[0]

    out = Node('ShaderNodeOutputMaterial'); shader = Node('ShaderNodeBsdfPrincipled')
    shader.inputs['Metallic'].default_value = 0
    shader.inputs['Roughness'].default_value = .96
    shader.inputs['Specular IOR Level'].default_value = .23
    shader.inputs['Sheen Weight'].default_value = .07 if role == 'straw' else .15
    links.new(shader.outputs[0], out.inputs['Surface'])
    uv = Node('ShaderNodeUVMap'); uv.uv_map = 'UVMap'
    origin = {'cloth': (.02, .52), 'binding': (.02, .02), 'jacket': (.52, .02), 'straw': (.52, .52)}[role]
    vector = Vec('MULTIPLY', Vec('SUBTRACT', uv.outputs['UV'], (*origin, 0)), (1/.46, 1/.46, 1))
    tapeUv = None
    if role == 'cloth':
        # One entire non-repeating panel keeps broad sweat/mud stains legible.
        extent = (.0535, .054) if patch else (.13, .30) if fold else (.38, .30)
        if patch:
            vector = Vec('ADD', Vec('MULTIPLY', vector, (extent[0]/.38, extent[1]/.30, 1)), (.27, .14, 0))
        elif fold:
            vector = Vec('ADD', Vec('MULTIPLY', vector, (.13/.38, 1, 1)), (.60, 0, 0))
        stem = 'Texture_SichuanOldCottonV09'
    else:
        if narrow: vector = Vec('MULTIPLY', Vec('SUBTRACT', vector, (.42, 0, 0)), (1/.16, 1, 1))
        if role == 'binding': tapeUv = vector
        extent = (.026, .18) if role == 'binding' else (.008, .006) if button else (1.24, .56) if role == 'jacket' else (.08, .08)
        repeated = Vec('MULTIPLY', vector, (extent[0]/.08, extent[1]/.08, 1))
        fract = Node('ShaderNodeVectorMath'); fract.operation = 'FRACTION'; links.new(repeated, fract.inputs[0])
        vector = Vec('MULTIPLY', fract.outputs[0], (.484, .484, 1))
        vector = Vec('ADD', vector, {'binding': (.508, .508, 0), 'jacket': (.008, .008, 0), 'straw': (.508, .008, 0)}[role])
        stem = 'Texture_SichuanWornFibersV08'
    material['FabricExtentM'] = extent

    textures = {}
    for channel in ('Base', 'Normal', 'Roughness'):
        key = (stem, channel)
        if key not in imageCache:
            image = bpy.data.images.load(str(Path(folder)/(stem+channel+'.png')), check_existing=False)
            image.colorspace_settings.name = 'sRGB' if channel == 'Base' else 'Non-Color'
            image.pack(); imageCache[key] = image
        texture = Node('ShaderNodeTexImage'); texture.image = imageCache[key]
        texture.extension = 'EXTEND' if role == 'cloth' else 'REPEAT'
        links.new(vector, texture.inputs['Vector']); textures[channel] = texture
    color = textures['Base'].outputs['Color']
    tint = Node('ShaderNodeHueSaturation')
    tint.inputs['Saturation'].default_value = .74 if role == 'straw' else .48 if role == 'binding' else 1.10 if role == 'jacket' else .74
    tint.inputs['Value'].default_value = .79*shade if role == 'straw' else .89 if role == 'binding' else .76 if button else .36 if role == 'jacket' else .70 if patch else .82
    links.new(color, tint.inputs['Color']); color = tint.outputs[0]
    if patch: color = Mix(color, (.88, .92, .94, 1), 1)
    elif role == 'cloth': color = Mix(color, (.97, .94, .88, 1), 1)
    if role == 'straw': color = Mix(color, (1, .87, .55, 1), 1)
    if role == 'jacket': color = Mix(color, (.54, .73, 1, 1), 1)

    coords = Node('ShaderNodeTexCoord'); coords.object = coordinateRoot
    root = bpy.data.objects['Pack_Root']
    position = Vec('ADD', coords.outputs['Object'], tuple(root.matrix_world.inverted() @ coordinateRoot.matrix_world.translation))
    xyz = Node('ShaderNodeSeparateXYZ'); links.new(position, xyz.inputs[0])
    noise = Node('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 24
    noise.inputs['Detail'].default_value = 2.5; noise.inputs['Roughness'].default_value = .72
    links.new(position, noise.inputs['Vector'])
    # Broken broad contact grime, not the fine uniform pepper of V8.
    mask = Node('ShaderNodeMapRange'); mask.clamp = True
    mask.inputs['From Min'].default_value = .38; mask.inputs['From Max'].default_value = .68
    mask.inputs['To Min'].default_value = .025; mask.inputs['To Max'].default_value = .34 if role == 'straw' else .25
    links.new(noise.outputs['Fac'], mask.inputs['Value'])
    lower = Node('ShaderNodeMapRange'); lower.clamp = True
    lower.inputs['From Min'].default_value = -.15; lower.inputs['From Max'].default_value = .055
    lower.inputs['To Min'].default_value = .27; lower.inputs['To Max'].default_value = .02
    links.new(xyz.outputs['Z'], lower.inputs['Value'])
    if role == 'cloth':
        amount = .03  # The unique albedo already contains the entire stain layout.
    else:
        amount = Math('ADD', Math('MULTIPLY', lower.outputs['Result'], noise.outputs['Fac']), mask.outputs['Result'])
    color = Mix(color, (.36, .33, .27, 1), amount)
    if role == 'cloth':
        # The reference has grey-yellow old cotton, without a nearly black hem.
        lift = Math('MULTIPLY', lower.outputs['Result'], .60)
        color = Mix(color, (.30, .26, .20, 1), lift, 'MIX')
        # Two broad washed/rubbed sections interrupt the continuous muddy hem;
        # retain the stronger left corner and naturally stained fold edges.
        def Gaussian(center, width):
            distance = Math('DIVIDE', Math('SUBTRACT', xyz.outputs['X'], center), width)
            return Math('EXPONENT', Math('MULTIPLY', Math('MULTIPLY', distance, distance), -1), 0)
        washed = Math('ADD', Gaussian(.025, .052), Math('MULTIPLY', Gaussian(-.087, .029), .72))
        washed = Math('MULTIPLY', washed, Math('MULTIPLY', lower.outputs['Result'], .85))
        color = Mix(color, (.33, .29, .23, 1), washed, 'MIX')
    elif role == 'binding':
        # Intermittent pale rubs along broken selvedges and across old creases.
        tape = Node('ShaderNodeSeparateXYZ'); links.new(tapeUv, tape.inputs[0])
        edge = Math('ABSOLUTE', Math('SUBTRACT', tape.outputs['X'], .5), 0)
        edge = Math('MULTIPLY', Math('MAXIMUM', Math('SUBTRACT', edge, .30), 0), 1.5)
        transverse = Math('SINE', Math('MULTIPLY', tape.outputs['Y'], 39), 0)
        transverse = Math('MULTIPLY', Math('MAXIMUM', Math('SUBTRACT', transverse, .80), 0), .75)
        rub = Math('MULTIPLY', Math('ADD', edge, transverse), noise.outputs['Fac'])
        color = Mix(color, (.36, .35, .32, 1), rub, 'MIX')
    links.new(color, shader.inputs['Base Color'])
    normal = Node('ShaderNodeNormalMap'); normal.uv_map = 'UVMap'
    normal.inputs['Strength'].default_value = .23 if role == 'cloth' else .10 if role == 'binding' else .20
    links.new(textures['Normal'].outputs['Color'], normal.inputs['Color'])
    links.new(normal.outputs[0], shader.inputs['Normal'])
    links.new(textures['Roughness'].outputs['Color'], shader.inputs['Roughness'])
    return material


def ApplyAgedMaterials(root, folder):
    mapping = {}
    for obj in root.children_recursive:
        if obj.type != 'MESH': continue
        assembly = obj
        while assembly.parent and assembly.parent != root: assembly = assembly.parent
        coordinateRoot = assembly if assembly.name in ('Pack_Jacket', 'Pack_StrawMat', 'Pack_Sandals') else root
        for index, old in enumerate(obj.data.materials):
            if not old or old.get('WearFiber', False): continue
            role = old.get('AtlasRegion', 'cloth')
            narrow = bool(old.get('NarrowTape', False) or 'NarrowCottonTape' in old.name)
            patch = bool(old.get('WearPatch', False))
            fold = bool(old.get('WearFold', False) or (obj.name == 'Pack_Bundle' and index == 2))
            button = bool(old.get('WearButton', False))
            shade = float(old.get('StrawTone', 1))
            style = 'Patch' if patch else 'Fold' if fold else 'Button' if button else 'NarrowTape' if narrow else 'Base'
            key = (role, style, coordinateRoot.name, shade)
            if key not in mapping:
                mapping[key] = MakeAgedMaterial(role, folder,
                    'Material_SichuanV9_'+coordinateRoot.name.replace('Pack_', '')+'_'+role.title()+style+str(len(mapping)),
                    coordinateRoot, narrow, patch, fold, button, shade)
            obj.data.materials[index] = mapping[key]
    return mapping
