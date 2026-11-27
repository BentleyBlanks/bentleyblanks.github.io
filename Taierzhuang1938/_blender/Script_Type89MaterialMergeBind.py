"""Consolidate the versioned Type89 Blender material slots."""
import json
from pathlib import Path

import bpy
import numpy as np

from Script_Type89BattleWearHigh import Graph


ROOT = 'Model_Type89MediumTank'
FINISH = 'Type89SurfaceFinish'
AOVS = ('Baked contact AO','Metallic')
BODY_ROLES = {'Armor','CastArmor','Steel','Exhaust','Rubber','Shadow'}
GROUPS = (
    ('Body',('Armor','CastArmor','Shadow')),
    ('Mechanical',('Steel','Rubber','Exhaust')),
    ('RunningGear',('Track','Soil')),
)
PROPERTIES = (
    'operation','use_clamp','blend_type','use_alpha','image','interpolation','projection',
    'projection_blend','extension','attribute_type','attribute_name','data_type','interpolation_type',
    'clamp','space','uv_map','from_instancer','vector_type','noise_dimensions','noise_type',
    'normalize','mode','node_tree','invert','distribution','subsurface_method','convert_from',
    'convert_to','voronoi_dimensions','distance','feature','object','mute',
)


def Role(material):
    return material.get('Type89Role') or ('Soil' if material.name=='Material_Type89HighSoilClod' else material.name)


def Meshes(root):
    return {obj.data for obj in root.children_recursive if obj.type=='MESH'}


def Used(meshes):
    return {mesh.materials[poly.material_index] for mesh in meshes for poly in mesh.polygons}


def Remap(mesh, materials, source, assignments):
    used = sorted(set(source.tolist()))
    resulting = list(dict.fromkeys(assignments[i] for i in used))
    indices = np.zeros(len(materials),np.int32)
    for i in used:
        indices[i] = resulting.index(assignments[i])
    mesh.materials.clear()
    for material in resulting:
        mesh.materials.append(material)
    mesh.polygons.foreach_set('material_index',indices[source])


def SetDefaults(src,dst):
    assert [s.identifier for s in src.inputs]==[s.identifier for s in dst.inputs],src.bl_idname
    assert [s.identifier for s in src.outputs]==[s.identifier for s in dst.outputs],src.bl_idname
    for a,b in zip(src.inputs,dst.inputs,strict=True):
        if not hasattr(a,'default_value'):
            continue
        value = a.default_value
        b.default_value = tuple(value) if hasattr(value,'__iter__') and not isinstance(value,str) else value


def CopyNode(source, tree):
    node = tree.nodes.new(source.bl_idname)
    node.name = source.name
    node.label = source.label
    node.width = source.width
    node.location = source.location
    for field in PROPERTIES:
        if hasattr(source,field):
            setattr(node,field,getattr(source,field))
    SetDefaults(source,node)
    return node


def SourceRoleTree(material,role):
    source = material.node_tree
    tree = bpy.data.node_groups.new('Type89 High • '+role,'ShaderNodeTree')
    tree.interface.new_socket(name='Surface',in_out='OUTPUT',socket_type='NodeSocketShader')
    for name in AOVS:
        tree.interface.new_socket(name=name,in_out='OUTPUT',socket_type='NodeSocketFloat')
    materialOut = next(node for node in source.nodes if node.type=='OUTPUT_MATERIAL' and node.is_active_output)
    assert all(not socket.is_linked for socket in materialOut.inputs if socket.name!='Surface'),role
    translators = {}
    for node in source.nodes:
        if node.type in {'OUTPUT_MATERIAL','OUTPUT_AOV'}:
            continue
        translators[node] = CopyNode(node,tree)
    for node,copy in translators.items():
        if node.parent in translators:
            copy.parent = translators[node.parent]
            copy.location = node.location
    output = tree.nodes.new('NodeGroupOutput')
    output.location = (800,0)

    def Output(socket):
        index = list(socket.node.outputs).index(socket)
        return translators[socket.node].outputs[index]

    for edge in source.links:
        if edge.to_node in translators:
            dest = translators[edge.to_node].inputs[list(edge.to_node.inputs).index(edge.to_socket)]
            tree.links.new(Output(edge.from_socket),dest)
    tree.links.new(Output(materialOut.inputs['Surface'].links[0].from_socket),output.inputs['Surface'])
    for name in AOVS:
        aov = next((node for node in source.nodes if node.type=='OUTPUT_AOV' and node.aov_name==name),None)
        if aov and aov.inputs['Value'].is_linked:
            tree.links.new(Output(aov.inputs['Value'].links[0].from_socket),output.inputs[name])
        elif aov:
            output.inputs[name].default_value = aov.inputs['Value'].default_value
    return tree


def HighFamily(name,roles,old):
    material = old[roles[0]].copy()
    material.name = 'Material_Type89High'+name
    material['Type89Role'] = name
    material['Type89Finishes'] = ', '.join(roles)
    graph = Graph(material.node_tree)
    graph.nodes.clear()
    graph.Lane(-710,230)
    attribute = graph.Node('ShaderNodeAttribute','Authored part finish')
    attribute.attribute_name = FINISH
    factor = attribute.outputs['Fac']
    graph.Lane(-430,230)
    variants = []
    for role in roles:
        node = graph.Node('ShaderNodeGroup',role)
        node.node_tree = SourceRoleTree(old[role],role)
        variants.append(node.outputs)
    graph.Lane(-50,220)
    result = {key:variants[0][key] for key in ('Surface',*AOVS)}
    for index,variant in enumerate(variants[1:],1):
        mask = graph.Math('GREATER_THAN',factor,index-.5)
        select = graph.Node('ShaderNodeMixShader','Use the authored finish')
        for socket,value in zip(select.inputs,(mask,result['Surface'],variant['Surface'])):
            graph.Set(socket,value)
        result['Surface'] = select.outputs[0]
        for name in AOVS:
            result[name] = graph.ScalarMix(result[name],variant[name],mask)

    graph.Lane(630,200)
    output = graph.Node('ShaderNodeOutputMaterial')
    graph.Set(output.inputs['Surface'],result['Surface'])
    for name in AOVS:
        passNode = graph.Node('ShaderNodeOutputAOV',name)
        passNode.name = passNode.aov_name = name
        graph.Set(passNode.inputs['Value'],result[name])
    settings = bpy.data.node_groups.get('glTF Material Output')
    if settings:
        ao = graph.Node('ShaderNodeGroup','Baked occlusion')
        ao.node_tree = settings
        graph.Set(ao.inputs['Occlusion'],result[AOVS[0]])
    return material


def ConsolidateHigh(meshes):
    old = {Role(material):material for material in Used(meshes)}
    # The cast material originally retained a stale shared AO image alias.
    # The current packed armour atlas includes the same UVs for both roles.
    armorOrm = next(node for node in old['Armor'].node_tree.nodes if node.type=='TEX_IMAGE' and node.label=='Orm')
    castOrm = next(node for node in old['CastArmor'].node_tree.nodes if node.type=='TEX_IMAGE' and node.label=='Orm')
    assert tuple(armorOrm.image.size)==tuple(castOrm.image.size)
    castOrm.image = armorOrm.image

    target = {}
    choices = {}
    for name,roles in GROUPS:
        material = HighFamily(name,roles,old)
        target.update({role:material for role in roles})
        choices.update({role:index for index,role in enumerate(roles)})

    for mesh in meshes:
        materials = list(mesh.materials)
        names = [Role(material) for material in materials]
        source = np.empty(len(mesh.polygons),np.int32)
        mesh.polygons.foreach_get('material_index',source)
        if any(role in choices for role in names):
            finish = mesh.attributes.new(FINISH,'FLOAT','FACE')
            values = np.array([choices.get(role,0) for role in names],np.float32)
            finish.data.foreach_set('value',values[source])
        Remap(mesh,materials,source,[target.get(role,material) for role,material in zip(names,materials,strict=True)])


def Load(directory,name,space):
    image = bpy.data.images.load(str(directory/(name+'.png')),check_existing=False)
    image.colorspace_settings.name = space
    image.alpha_mode = 'STRAIGHT'
    image.pack()
    image.filepath_raw = '//Maps/'+name+'.png'
    return image


def AddCoating(material,image):
    graph = Graph(material.node_tree)
    shader = next(node for node in graph.nodes if node.type=='BSDF_PRINCIPLED')
    graph.Lane(shader.location.x-600,shader.location.y-350)
    uv = graph.Node('ShaderNodeUVMap','Surface finish coordinates')
    uv.uv_map = FINISH
    texture = graph.Node('ShaderNodeTexImage','Coat and specular swatches')
    texture.image = image
    texture.interpolation = 'Closest'
    texture.extension = 'EXTEND'
    graph.Set(texture.inputs['Vector'],uv.outputs[0])
    channels = graph.Node('ShaderNodeSeparateColor')
    graph.Set(channels.inputs[0],texture.outputs['Color'])
    graph.Set(shader.inputs['Coat Weight'],channels.outputs['Red'])
    graph.Set(shader.inputs['Coat Roughness'],channels.outputs['Green'])
    graph.Set(shader.inputs['Specular IOR Level'],graph.Math('MULTIPLY',texture.outputs['Alpha'],.5))


def SetGameUv(mesh,source,roles,report):
    layer = mesh.uv_layers.active
    assert layer is not None
    finish = mesh.uv_layers.new(name=FINISH,do_init=False)
    mesh.uv_layers.active = layer
    layer.active_render = True
    size = len(mesh.loops)
    vertex = np.empty(size*2,np.float32)
    layer.uv.foreach_get('vector',vertex)
    old = vertex.reshape(-1,2)
    extra = np.zeros_like(old)
    recessU,recessV = report['recess']['uv']
    for face,index in zip(mesh.polygons,source,strict=True):
        role = roles[index]
        if role not in BODY_ROLES:
            continue
        u,v = report['coating'][role]['uv']
        indices = slice(face.loop_start,face.loop_start+face.loop_total)
        extra[indices] = (u,1-v)
        if role=='Shadow':
            old[indices] = (recessU,1-recessV)
    finish.uv.foreach_set('vector',extra.ravel())
    layer.uv.foreach_set('vector',old.ravel())


def ConsolidateGame(meshes,directory,report):
    old = {Role(material):material for material in Used(meshes)}
    body = old['Armor'].copy()
    body.name = 'Material_Type89GameBody'
    body['Type89Role'] = 'Body'
    maps = directory/'Maps'
    atlases = {}
    for material,group in [(body,'Body'),(old['Glass'],'Body'),(old['Track'],'Track'),(old['Guard'],'Guard')]:
        for node in material.node_tree.nodes:
            if node.type!='TEX_IMAGE' or node.label not in ('Base','Normal','Orm'):
                continue
            name = 'Texture_Type89Game'+group+node.label
            if name not in atlases:
                atlases[name] = Load(maps,name,'sRGB' if node.label=='Base' else 'Non-Color')
            node.image = atlases[name]
    AddCoating(body,Load(maps,'Texture_Type89GameCoating','Non-Color'))
    for mesh in meshes:
        materials = list(mesh.materials)
        roles = [Role(material) for material in materials]
        source = np.empty(len(mesh.polygons),np.int32)
        mesh.polygons.foreach_get('material_index',source)
        if any(role in BODY_ROLES for role in roles):
            SetGameUv(mesh,source,roles,report)
        Remap(mesh,materials,source,[body if role in BODY_ROLES else value for role,value in zip(roles,materials,strict=True)])


def Bind(version,tier):
    directory = version if tier=='High' else version/'Game'
    target = directory/f'Scene_Type89MediumTank{tier}Pbr.blend'
    assert Path(bpy.data.filepath).resolve()==target.resolve()
    root = bpy.data.objects[ROOT]
    if root['surfaceRevision']=='SurfaceV20':
        donor = version.with_name('GeometryV55SurfaceV19')/target.relative_to(version)
        bpy.ops.wm.open_mainfile(filepath=str(donor))
        root = bpy.data.objects[ROOT]
    assert root['surfaceRevision']=='SurfaceV19'
    meshes = Meshes(root)
    before = len(Used(meshes))
    reportFile = version/'Review'/'Data_MaterialMergeReview.json'
    report = json.loads(reportFile.read_text(encoding='utf-8'))
    if tier=='High':
        ConsolidateHigh(meshes)
    else:
        ConsolidateGame(meshes,directory,report)
    active = Used(meshes)
    orphaned = []
    for material in list(bpy.data.materials):
        if material in active or not material.name.startswith('Material_Type89'):
            continue
        if material.users==int(material.use_fake_user):
            orphaned.append(material.name)
            bpy.data.materials.remove(material)
    root['surfaceRevision'] = 'SurfaceV20'
    bpy.context.scene['BlenderMcpTask'] = 'Type89Materials'
    bpy.context.preferences.filepaths.save_version = 0
    bpy.data.use_autopack = False
    bpy.ops.wm.save_as_mainfile(filepath=str(target),relative_remap=False)
    report.setdefault('sources',{})[tier] = {'before':before,'after':len(active),
        'activeMaterialNames':sorted(material.name for material in active),'removedUnusedMaterials':sorted(orphaned)}
    reportFile.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(tier,report['sources'][tier],flush=True)
