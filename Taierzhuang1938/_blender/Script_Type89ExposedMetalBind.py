"""Place the exposed steel correction on the V19 editable Blender sources."""
import json
from pathlib import Path

import bpy

from Script_Type89BattleWearHigh import Graph, Existing, Srgb


ASSET = Path(__file__).resolve().parent.parent/'Model'/'Type89MediumTank'
PROFILE = json.loads((ASSET/'Data_ExposedMetalProfile.json').read_text(encoding='utf-8'))
ROOT = 'Model_Type89MediumTank'
WITNESS = 'MetalFinishJacket'
AOV_NAME = 'Metallic'


def Materials(root):
    return {material for obj in root.children_recursive if obj.type=='MESH'
            for material in obj.data.materials if material and material.use_nodes}


def SteelGroup(graph,channel):
    return next(node for node in graph.nodes if node.type=='GROUP'
                and node.label=='SurfaceV17 artist controls').outputs[channel]


def Attribute(graph,name):
    node = graph.Node('ShaderNodeAttribute',name)
    node.attribute_name = name
    return node.outputs['Fac']


def Strength(graph,role,metal):
    if role in {'Armor','CastArmor'}:
        config = PROFILE['paintExposure']
        weight = graph.Smooth(SteelGroup(graph,'Steel'),*config['maskRamp'])
        return config,weight
    if role=='Track':
        config = PROFILE['trackContact']
        coord = graph.Node('ShaderNodeTexCoord').outputs['Object']
        _,y,_ = graph.Separate(coord)
        leading = graph.Smooth(graph.Math('MULTIPLY',y,-1),*config['leadingBandM'])
        physical = graph.Math('MULTIPLY',leading,Attribute(graph,'MetalFinishContact'))
        contact = graph.Smooth(physical,*config['cleanContactRamp'])
        soil = graph.Smooth(SteelGroup(graph,'Earth'),*config['coveredRamp'])
        return config,graph.Math('MULTIPLY',contact,graph.Math('SUBTRACT',1,soil))
    config = PROFILE['steelHardware']
    surface = graph.Smooth(metal,*config['metallicRamp'])
    chosen = graph.Math('MULTIPLY',Attribute(graph,WITNESS),config['strength'])
    return config,graph.Math('MULTIPLY',surface,chosen)


def FinishHigh(root):
    for name in PROFILE['steelHardware']['meshes']:
        body = bpy.data.objects[name]
        assert body in root.children_recursive
        assert body.data.attributes.get(WITNESS),name
    for material in Materials(root):
        graph = Graph(material.node_tree)
        shader = next((node for node in graph.nodes if node.type=='BSDF_PRINCIPLED'),None)
        if shader is None:
            continue
        metal = shader.inputs['Metallic']
        graph.Lane(shader.location.x-1200,shader.location.y-980)
        role = material.get('Type89Role')
        if role in {'Armor','CastArmor','Track','Steel'}:
            old = Existing(metal)
            config,weight = Strength(graph,role,old)
            maximum = graph.Math('MAXIMUM',old,config['metallic'])
            graph.Set(metal,graph.ScalarMix(old,maximum,weight))
            roughness = shader.inputs['Roughness']
            old = Existing(roughness)
            goal = graph.Math('MINIMUM',old,config['roughness'])
            amount = graph.Math('MULTIPLY',weight,config['roughnessBlend'])
            graph.Set(roughness,graph.ScalarMix(old,goal,amount))
            color = shader.inputs['Base Color']
            base = Existing(color)
            floor = graph.Vector('MAXIMUM',base,Srgb(config['reflectanceFloorSrgb'])[:3])
            amount = graph.Math('MULTIPLY',weight,config['colorBlend'])
            graph.Set(color,graph.Mix(base,floor,amount,'Exposed steel reflectance floor'))
        aov = graph.Node('ShaderNodeOutputAOV',AOV_NAME)
        aov.name = aov.aov_name = AOV_NAME
        graph.Set(aov.inputs['Value'],Existing(metal))


def FinishGame(root,directory,report):
    changed = set(report['maps'])
    replaced = {}
    for material in Materials(root):
        for node in material.node_tree.nodes:
            if node.type!='TEX_IMAGE' or not node.image:
                continue
            previous = node.image
            name = previous.name.removesuffix('.png')+'.png'
            if name not in changed:
                continue
            if previous not in replaced:
                previous.name += ' V18'
                image = bpy.data.images.load(str(directory/'Maps'/name),check_existing=False)
                image.name = name
                image.colorspace_settings.name = previous.colorspace_settings.name
                image.pack()
                image.filepath_raw = '//Maps/'+name
                replaced[previous] = image
            node.image = replaced[previous]
    assert len(replaced)==len(changed)
    for previous in replaced:
        if previous.users==0:
            bpy.data.images.remove(previous)


def Bind(version,tier):
    directory = version if tier=='High' else version/'Game'
    target = directory/f'Scene_Type89MediumTank{tier}Pbr.blend'
    assert Path(bpy.data.filepath).resolve()==target.resolve()
    root = bpy.data.objects[ROOT]
    if root['surfaceRevision']==PROFILE['revision']:
        old = version.with_name('GeometryV55SurfaceV18')
        original = old/target.relative_to(version)
        bpy.ops.wm.open_mainfile(filepath=str(original))
        root = bpy.data.objects[ROOT]
    assert root['geometryVersion']==PROFILE['geometryVersion'] and root['surfaceRevision']==PROFILE['baseline']
    scene = bpy.context.scene
    if tier=='High':
        FinishHigh(root)
        for layer in scene.view_layers:
            aov = next((value for value in layer.aovs if value.name==AOV_NAME),None) or layer.aovs.add()
            aov.name,aov.type=AOV_NAME,'VALUE'
    else:
        review = version/'Review'/'Data_ExposedMetalReview.json'
        FinishGame(root,directory,json.loads(review.read_text(encoding='utf-8')))
    root['surfaceRevision'] = PROFILE['revision']
    scene['BlenderMcpTask'] = 'Type89ExposedMetal'
    bpy.data.use_autopack = False
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(target),relative_remap=False)
    print('Saved',tier,'editable',PROFILE['revision'],'source',flush=True)
