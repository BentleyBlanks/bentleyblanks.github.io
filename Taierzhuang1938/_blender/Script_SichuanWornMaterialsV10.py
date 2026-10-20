"""Soft washed cotton and old yarn relief, preserving the V9 imagegen albedo."""
from pathlib import Path
import runpy
import bpy


def ApplySoftWornMaterials(root, folder):
    folder = Path(folder)
    apply = runpy.run_path(str(folder.parents[1]/'_blender/Script_SichuanAgedMaterialsV9.py'))['ApplyAgedMaterials']
    mapping = apply(root, folder)
    image = bpy.data.images.load(str(folder/'Texture_SichuanCottonReliefV10Normal.png'), check_existing=False)
    image.colorspace_settings.name = 'Non-Color'
    image.pack()
    base = bpy.data.images.load(str(folder/'Texture_SichuanSoftOldCottonV10Base.png'), check_existing=False)
    base.colorspace_settings.name = 'sRGB'; base.pack()
    strawImages={}
    for channel in ('Base','Normal','Roughness'):
        texture=bpy.data.images.load(str(folder/('Texture_SichuanWornStrawV10'+channel+'.png')),check_existing=False)
        texture.colorspace_settings.name='sRGB' if channel=='Base' else 'Non-Color';texture.pack()
        strawImages[channel]=texture
    for material in mapping.values():
        material.name = material.name.replace('SichuanV9', 'SichuanV10')
        material['WornStudy'] = 'V10 soft worn nap, band-limited old-yarn relief'
        role = material['AtlasRegion']
        nodes, links = material.node_tree.nodes, material.node_tree.links
        shader = next(node for node in nodes if node.type == 'BSDF_PRINCIPLED')
        for node in nodes:
            if node.type == 'TEX_IMAGE' and role == 'cloth' and node.image and 'OldCottonV09Normal' in node.image.name:
                node.image = image
                # The generated front's fine yarn is smaller than the large
                # compressed pilling visible in the reference. Sample this
                # technical relief at a coarser physical scale; keep albedo
                # and its broad asymmetric wear at the original unique UV.
                incoming = node.inputs['Vector'].links[0].from_socket
                scale = nodes.new('ShaderNodeVectorMath'); scale.operation = 'MULTIPLY'
                scale.inputs[1].default_value = (.32,.32,1); links.new(incoming,scale.inputs[0])
                shift = nodes.new('ShaderNodeVectorMath'); shift.operation = 'ADD'
                shift.inputs[1].default_value = (.26,.21,0); links.new(scale.outputs[0],shift.inputs[0])
                links.new(shift.outputs[0],node.inputs['Vector'])
                material['CottonReliefUvScale'] = .32
            elif node.type == 'TEX_IMAGE' and role == 'cloth' and node.image and 'OldCottonV09Base' in node.image.name:
                node.image = base
            elif node.type == 'TEX_IMAGE' and role == 'straw' and node.image:
                channel=next((key for key in strawImages if key in node.image.name),None)
                if channel:
                    incoming=node.inputs['Vector'].links[0].from_socket
                    origin=nodes.new('ShaderNodeVectorMath');origin.operation='SUBTRACT'
                    origin.inputs[1].default_value=(.508,.008,0);links.new(incoming,origin.inputs[0])
                    scale=nodes.new('ShaderNodeVectorMath');scale.operation='MULTIPLY'
                    scale.inputs[1].default_value=(1/.484,1/.484,1);links.new(origin.outputs[0],scale.inputs[0])
                    links.new(scale.outputs[0],node.inputs['Vector']);node.image=strawImages[channel]
            elif node.type == 'NORMAL_MAP':
                node.inputs['Strength'].default_value = .30 if role in ('cloth','straw') else .06 if role == 'binding' else .20
            elif role=='straw' and node.type=='HUE_SAT':
                node.inputs['Value'].default_value=.62*float(material.get('StrawTone',1))
                node.inputs['Saturation'].default_value=.98
            elif role=='straw' and node.type=='MIX_RGB' and node.blend_type=='MULTIPLY':
                color=node.inputs[2].default_value
                if abs(color[0]-1)<.001 and abs(color[1]-.87)<.001 and abs(color[2]-.55)<.001:
                    node.inputs[2].default_value=(1,.90,.66,1)
            elif node.type == 'TEX_IMAGE' and role == 'binding':
                node.interpolation = 'Cubic'
        if role == 'cloth':
            shader.inputs['Sheen Weight'].default_value = .24
            shader.inputs['Specular IOR Level'].default_value = .19
            source = shader.inputs['Base Color'].links[0].from_socket
            gray = nodes.new('ShaderNodeRGBToBW'); links.new(source, gray.inputs[0])
            mask = nodes.new('ShaderNodeMapRange'); mask.clamp = True
            mask.inputs['From Min'].default_value = .035
            mask.inputs['From Max'].default_value = .14
            mask.inputs['To Min'].default_value = .20
            mask.inputs['To Max'].default_value = 0
            links.new(gray.outputs[0], mask.inputs['Value'])
            wash = nodes.new('ShaderNodeMixRGB'); wash.blend_type = 'MIX'
            links.new(source, wash.inputs[1]); wash.inputs[2].default_value = (.24, .21, .17, 1)
            links.new(mask.outputs['Result'], wash.inputs[0]); links.new(wash.outputs[0], shader.inputs['Base Color'])
            coords = nodes.new('ShaderNodeTexCoord'); coords.object = root
            position = nodes.new('ShaderNodeSeparateXYZ'); links.new(coords.outputs['Object'],position.inputs[0])
            hem = nodes.new('ShaderNodeMapRange'); hem.clamp = True
            hem.inputs['From Min'].default_value = -.15; hem.inputs['From Max'].default_value = -.065
            hem.inputs['To Min'].default_value = .28; hem.inputs['To Max'].default_value = 0
            links.new(position.outputs['Z'],hem.inputs['Value'])
            pale = nodes.new('ShaderNodeMixRGB'); pale.blend_type = 'MIX'
            links.new(wash.outputs[0],pale.inputs[1]); pale.inputs[2].default_value = (.38,.34,.28,1)
            links.new(hem.outputs['Result'],pale.inputs[0]); links.new(pale.outputs[0],shader.inputs['Base Color'])
            roughSource = shader.inputs['Roughness'].links[0].from_socket
            rough = nodes.new('ShaderNodeMath'); rough.operation = 'MAXIMUM'; rough.inputs[1].default_value = .97
            links.new(roughSource, rough.inputs[0]); links.new(rough.outputs[0], shader.inputs['Roughness'])
        elif role == 'binding':
            shader.inputs['Sheen Weight'].default_value = .18
            shader.inputs['Specular IOR Level'].default_value = .20
        elif role == 'straw':
            # Discontinuous grey dust, with a few pale rubbed grass patches.
            # Coordinates belong to the removable assembly, so wear stays put.
            coords = nodes.new('ShaderNodeTexCoord')
            coords.object = bpy.data.objects[material['WearCoordinateRoot']]
            noise = nodes.new('ShaderNodeTexNoise')
            noise.inputs['Scale'].default_value = 74
            noise.inputs['Detail'].default_value = 2.5
            links.new(coords.outputs['Object'], noise.inputs['Vector'])
            mask = nodes.new('ShaderNodeMapRange'); mask.clamp = True
            mask.inputs['From Min'].default_value = .30
            mask.inputs['From Max'].default_value = .72
            sandal = material['WearCoordinateRoot'] == 'Pack_Sandals'
            mask.inputs['To Min'].default_value = .055 if sandal else .035
            mask.inputs['To Max'].default_value = .26 if sandal else .20
            links.new(noise.outputs['Fac'], mask.inputs['Value'])
            source = shader.inputs['Base Color'].links[0].from_socket
            dust = nodes.new('ShaderNodeMixRGB'); dust.blend_type = 'MIX'
            links.new(source, dust.inputs[1]); dust.inputs[2].default_value = (.20,.18,.14,1)
            links.new(mask.outputs['Result'], dust.inputs[0]); links.new(dust.outputs[0], shader.inputs['Base Color'])
            shader.inputs['Specular IOR Level'].default_value = .17
    return mapping
