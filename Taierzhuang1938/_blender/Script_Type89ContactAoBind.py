"""Bind the V18 ambient occlusion maps in the editable Blender sources."""
import json
from pathlib import Path

import bpy


ROOT = 'Model_Type89MediumTank'
AOV_NAME = 'Baked contact AO'


def Bind(version, tier):
    directory = version if tier=='High' else version/'Game'
    target = directory/f'Scene_Type89MediumTank{tier}Pbr.blend'
    assert Path(bpy.data.filepath).resolve()==target.resolve()
    root = bpy.data.objects[ROOT]
    assert root['geometryVersion']=='20261126GeometryV55' and root['surfaceRevision'] in ('SurfaceV17','SurfaceV18')
    report = json.loads((version/'Review'/'Data_AmbientOcclusionReview.json').read_text(encoding='utf-8'))
    files = {row['file'] for row in report['maps'][tier]}
    maps = directory/'Maps'
    if tier=='High':
        maps /= 'High'
    scene = bpy.context.scene
    materials = {material for obj in root.children_recursive if obj.type=='MESH'
                 for material in obj.data.materials if material and material.use_nodes}
    images = {}
    for material in materials:
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        texture = next((node for node in nodes if node.type=='TEX_IMAGE' and node.label=='Orm' and node.image),None)
        if texture is None:
            continue
        base = texture.image
        name = base.name.removesuffix('.png')+'.png'
        if name in files:
            if base not in images:
                base.name += ' Previous'
                image = bpy.data.images.load(str(maps/name),check_existing=False)
                image.name = name
                image.colorspace_settings.name = 'Non-Color'
                image.pack()
                prefix = '//Maps/High/' if tier=='High' else '//Maps/'
                image.filepath_raw = prefix+name
                images[base] = image
            texture.image = images[base]
        gltf = next((node for node in nodes if node.type=='GROUP' and node.inputs.get('Occlusion')),None)
        if not gltf or not gltf.inputs['Occlusion'].is_linked:
            continue
        source = gltf.inputs['Occlusion'].links[0].from_socket
        aov = nodes.get(AOV_NAME) or nodes.new('ShaderNodeOutputAOV')
        aov.name = aov.label = aov.aov_name = AOV_NAME
        aov.location = (gltf.location.x,gltf.location.y-185)
        links.new(source,aov.inputs['Value'])
    assert len(images)==len(files),(len(images),sorted(files))
    for base in images:
        if base.users==0:
            bpy.data.images.remove(base)
    for layer in scene.view_layers:
        aov = next((aov for aov in layer.aovs if aov.name==AOV_NAME),None) or layer.aovs.add()
        aov.name,aov.type = AOV_NAME,'VALUE'
    # Native viewport contact shadows are evaluated in the lighting pass.
    # The packed AO is separately available through the named render pass.
    scene.eevee.use_raytracing = True
    scene.eevee.use_fast_gi = True
    scene.eevee.fast_gi_method = 'AMBIENT_OCCLUSION_ONLY'
    scene.eevee.fast_gi_distance = report['bake'][tier]['bandsM'][-1]
    scene.eevee.fast_gi_step_count = 16
    scene.eevee.fast_gi_ray_count = 4
    scene.eevee.fast_gi_quality = .75
    bpy.data.use_autopack = False
    bpy.context.preferences.filepaths.save_version = 0
    root['surfaceRevision'] = report['revision']
    root['ambientOcclusionBandsM'] = report['bake'][tier]['bandsM']
    scene['BlenderMcpTask'] = 'Type89AmbientOcclusion'
    bpy.ops.wm.save_as_mainfile(filepath=str(target),relative_remap=False)
    print('Saved',tier,'with',len(images),'updated packed ORM maps and the '+AOV_NAME+' render pass.',flush=True)
