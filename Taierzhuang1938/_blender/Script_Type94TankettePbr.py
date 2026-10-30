"""Author and bake physical surface families for the single Type 94 asset.

This is deterministic Blender shader / UV baking, with no generative-image API.
Source and full-resolution texture masters stay in the external asset folder.
The procedural authoring nodes remain editable after their baked maps are wired.
"""
import bpy
import json
import math
import hashlib
import os
from pathlib import Path

SOURCE=Path(os.environ.get('TYPE94_SOURCE_ROOT',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette'))
REPO=Path(os.environ.get('TYPE94_REPO_ROOT',str(Path(__file__).resolve().parents[2] if '__file__' in globals() else Path.cwd())))
scene=bpy.context.scene
assert scene.get('BlenderMcpTask')=='Type94Tankette'
assert str(SOURCE).lower() in bpy.data.filepath.lower()
QUALITY='High' if 'High' in Path(bpy.data.filepath).stem else 'Game'
VARIANT=os.environ.get('TYPE94_PBR_VARIANT','PbrStudy')
assert VARIANT.replace('_','').isalnum(),'Invalid local PBR variant'
SURFACE_STYLE=os.environ.get('TYPE94_SURFACE_STYLE','LegacyStudy')
UV_MODE=os.environ.get('TYPE94_UV_MODE','Checkpoint')
assert UV_MODE in ['Checkpoint','Fresh'],'Unknown Type94 UV generation mode'
if UV_MODE=='Checkpoint' and SURFACE_STYLE not in ['SurfaceV36','SurfaceV39','SurfaceV44']:
    UV_MODE='Fresh'
scene['SurfaceUvGenerationMode']=UV_MODE
OUT=SOURCE/'Textures'/(QUALITY if VARIANT=='PbrStudy' else QUALITY+VARIANT)
OUT.mkdir(parents=True,exist_ok=True)
scene.render.engine='CYCLES'
scene.cycles.samples=8
scene.render.bake.margin=8
scene.render.bake.use_clear=False
scene.render.bake.use_selected_to_active=False
records=[]


def Node(tree,kind,name):
    node=tree.nodes.new(kind)
    node.name=name
    node.label=name
    return node


def Math(tree,operation,a,b=None,name=''):
    node=Node(tree,'ShaderNodeMath',name or operation)
    node.operation=operation
    for index,value in enumerate([a,b]):
        if value is None:continue
        if isinstance(value,(float,int)):
            node.inputs[index].default_value=value
        else:
            tree.links.new(value,node.inputs[index])
    return node.outputs[0]


def Ramp(tree,value,low,high,name):
    node=Node(tree,'ShaderNodeValToRGB',name)
    node.color_ramp.elements[0].position=low
    node.color_ramp.elements[0].color=(0,0,0,1)
    node.color_ramp.elements[1].position=high
    node.color_ramp.elements[1].color=(1,1,1,1)
    tree.links.new(value,node.inputs[0])
    return node.outputs['Color']


def Mix(tree,factor,a,b,name):
    node=Node(tree,'ShaderNodeMixRGB',name)
    for index,value in enumerate([factor,a,b]):
        if isinstance(value,(float,int)):
            node.inputs[index].default_value=value
        elif isinstance(value,tuple):
            node.inputs[index].default_value=value
        else:
            tree.links.new(value,node.inputs[index])
    return node.outputs[0]


def Noise(tree,coordinate,scale,detail,name):
    node=Node(tree,'ShaderNodeTexNoise',name)
    node.noise_dimensions='3D'
    node.inputs['Scale'].default_value=scale
    node.inputs['Detail'].default_value=detail
    node.inputs['Roughness'].default_value=.67
    tree.links.new(coordinate,node.inputs['Vector'])
    return node.outputs['Fac']


def Author(material,role):
    material.use_backface_culling=True
    tree=material.node_tree
    tree.nodes.clear()
    shader=Node(tree,'ShaderNodeBsdfPrincipled','Physical '+role)
    output=Node(tree,'ShaderNodeOutputMaterial','Material Output')
    tree.links.new(shader.outputs['BSDF'],output.inputs['Surface'])
    geometry=Node(tree,'ShaderNodeNewGeometry','Physical surface position and curvature')
    position=geometry.outputs['Position']
    wearAttribute=Node(tree,'ShaderNodeAttribute','Fitting-specific handling exposure')
    wearAttribute.attribute_name='WearZone'
    fine=Noise(tree,position,700 if role=='Rubber' else 440,2,'Submillimetre surface grain')
    coarse=Noise(tree,position,18 if role=='Paint' else 45,3,'Centimetre surface variation')
    edge=Ramp(tree,geometry.outputs['Pointiness'],.502,.543,'Convex manufactured edges')
    pits=Ramp(tree,fine,.69,.78,'Sparse surface pits')
    chips=Math(tree,'MULTIPLY',edge,pits,'Localized edge chips')
    chips=Math(tree,'MULTIPLY',chips,wearAttribute.outputs['Fac'],'Handling exposure chip mask')
    recess=Ramp(tree,geometry.outputs['Pointiness'],.485,.499,'Recess curvature')
    recess=Math(tree,'SUBTRACT',1,recess,'Concave retention')
    oxidation=Math(tree,'MULTIPLY',recess,Ramp(tree,coarse,.62,.77,'Oxidation islands'),'Recess oxidation')
    oxidation=Math(tree,'MULTIPLY',oxidation,.48 if role=='Track' else .22,'Restrained oxidation amount')
    if role=='Paint':
        retained=Math(tree,'MULTIPLY',wearAttribute.outputs['Fac'],Ramp(tree,coarse,.68,.80,'Small fitting oxide islands'),'Fitting retention')
        oxidation=Math(tree,'ADD',oxidation,Math(tree,'MULTIPLY',retained,.28),'Localized fitting oxide')
    ao=Node(tree,'ShaderNodeAmbientOcclusion','Local geometry AO')
    ao.inputs['Distance'].default_value=.025 if role=='Paint' else .012
    if hasattr(ao,'samples'):ao.samples=8
    if hasattr(ao,'only_local'):ao.only_local=True
    if role=='Paint':
        base=Mix(tree,coarse,(.088,.098,.061,1),(.118,.128,.088,1),'Olive paint pigment variation')
        base=Mix(tree,chips,base,(.115,.122,.11,1),'Exposed steel at chips')
        base=Mix(tree,oxidation,base,(.084,.038,.014,1),'Small retained oxide')
        rough=Mix(tree,coarse,(.17,.17,.17,1),(.29,.29,.29,1),'Museum enamel roughness')
        rough=Mix(tree,oxidation,rough,(.72,.72,.72,1),'Oxide roughness')
        metallic=Math(tree,'MULTIPLY',chips,.88,'Only exposed metal conducts')
        bumpDistance=.00065
        shader.inputs['Coat Weight'].default_value=.20
        shader.inputs['Coat Roughness'].default_value=.17
    elif role=='Track':
        contact=Ramp(tree,geometry.outputs['Pointiness'],.505,.543,'Track shoe edge contact')
        base=Mix(tree,contact,(.019,.022,.019,1),(.21,.22,.195,1),'Dark track / polished contact')
        base=Mix(tree,oxidation,base,(.094,.043,.017,1),'Oxide retained inside track')
        rough=Mix(tree,contact,(.49,.49,.49,1),(.20,.20,.20,1),'Polished contact roughness')
        metallic=Mix(tree,oxidation,(.93,.93,.93,1),(.04,.04,.04,1),'Oxide is dielectric')
        bumpDistance=.00045
    elif role=='Rubber':
        base=Mix(tree,coarse,(.012,.013,.011,1),(.023,.023,.019,1),'Carbon rubber and embedded dust')
        rough=Mix(tree,fine,(.58,.58,.58,1),(.76,.76,.76,1),'Rubber surface roughness')
        metallic=0
        bumpDistance=.00019
    else:
        base=Mix(tree,coarse,(.025,.029,.03,1),(.043,.047,.047,1),'Blued steel and handling')
        rough=Mix(tree,coarse,(.23,.23,.23,1),(.36,.36,.36,1),'Blued steel roughness')
        metallic=.86
        bumpDistance=.00008
    if SURFACE_STYLE in ['SurfaceV34','SurfaceV36','SurfaceV39','SurfaceV44']:
        cast=Node(tree,'ShaderNodeAttribute','Cast steel surface family')
        cast.attribute_name='SurfaceCast'
        grain=Noise(tree,position,340,2,'Fine enamel grain')
        casting=Noise(tree,position,180,3,'Fine cast steel pores')
        micro=Mix(tree,cast.outputs['Fac'],grain,casting,'Rolled versus cast microrelief')
        if role=='Paint':
            # Thin museum enamel over steel, rather than a uniform metallic
            # paint. Wear stays at the geometry's exposed handling edges.
            base=Mix(tree,coarse,(.083,.094,.059,1),(.106,.116,.078,1),'Restrained olive enamel variation')
            base=Mix(tree,chips,base,(.16,.17,.15,1),'Small bare steel chips')
            base=Mix(tree,oxidation,base,(.075,.034,.014,1),'Retained oxide at fittings')
            rolled=Mix(tree,grain,(.27,.27,.27,1),(.36,.36,.36,1),'Thin rolled-plate enamel roughness')
            castRough=Mix(tree,casting,(.34,.34,.34,1),(.45,.45,.45,1),'Cast fitting enamel roughness')
            rough=Mix(tree,cast.outputs['Fac'],rolled,castRough,'Surface-specific enamel finish')
            rough=Mix(tree,chips,rough,(.25,.25,.25,1),'Handled bare steel is smoother')
            rough=Mix(tree,oxidation,rough,(.72,.72,.72,1),'Oxide remains matte')
            metallic=Math(tree,'MULTIPLY',chips,.92,'Only exposed steel is metallic')
            bumpDistance=Mix(tree,cast.outputs['Fac'],(.000045,)*3+(1,),(.00017,)*3+(1,),'Thin enamel and cast pore depth')
            shader.inputs['Coat Weight'].default_value=.10
            shader.inputs['Coat Roughness'].default_value=.28
        elif role=='Track':
            contact=Node(tree,'ShaderNodeAttribute','Actual shoe contact and guide faces')
            contact.attribute_name='TrackContact'
            contact=Math(tree,'MULTIPLY',contact.outputs['Fac'],Mix(tree,grain,(.65,.65,.65,1),(1,1,1,1),'Irregular contact polishing'),'Localized track contact')
            base=Mix(tree,contact,(.020,.024,.021,1),(.20,.215,.195,1),'Dark cast shoes and worn contact steel')
            base=Mix(tree,oxidation,base,(.083,.039,.018,1),'Oxide inside shoe recesses')
            rough=Mix(tree,contact,(.59,.59,.59,1),(.24,.24,.24,1),'Rough shoe cavities and polished contact')
            metallic=Mix(tree,oxidation,(.94,.94,.94,1),(.06,.06,.06,1),'Clean steel versus oxide conductivity')
            micro=casting;bumpDistance=.00020
        elif role=='Steel':
            direction=Node(tree,'ShaderNodeVectorMath','Subtle longitudinal steel tooling')
            direction.operation='MULTIPLY';direction.inputs[1].default_value=(900,90,900);tree.links.new(position,direction.inputs[0])
            tooling=Noise(tree,direction.outputs['Vector'],1,2,'Fine longitudinal machining grain')
            base=Mix(tree,coarse,(.026,.031,.032,1),(.048,.054,.055,1),'Blued steel colour variation')
            rough=Mix(tree,tooling,(.22,.22,.22,1),(.38,.38,.38,1),'Directional blued steel roughness')
            metallic=.90;micro=tooling;bumpDistance=.000025
        else:
            micro=grain;bumpDistance=.00008
        if SURFACE_STYLE in ['SurfaceV36','SurfaceV39','SurfaceV44']:
            # Metric, lighting-free finish. Low-frequency roughness describes
            # uneven enamel; actual normal relief stays below a millimetre.
            texture=Noise(tree,position,95,3,'Millimetre coating and casting texture')
            pores=Ramp(tree,Noise(tree,position,280,2,'Sparse coating pores'),.67,.78,'Sparse shallow pore mask')
            if role=='Paint':
                rolled=Mix(tree,coarse,(.25,.25,.25,1),(.40,.40,.40,1),'Uneven enamel sheen across plates')
                castRough=Mix(tree,texture,(.34,.34,.34,1),(.49,.49,.49,1),'Cast fitting coarse sheen')
                rough=Mix(tree,cast.outputs['Fac'],rolled,castRough,'Plate and casting roughness families')
                rough=Mix(tree,pores,rough,(.52,.52,.52,1),'Pores soften small specular reflections')
                rough=Mix(tree,oxidation,rough,(.73,.73,.73,1),'Oxide in manufactured recesses')
                texture=Math(tree,'MULTIPLY',texture,.35,'Coating texture height')
                micro=Math(tree,'ADD',Math(tree,'MULTIPLY',micro,.65),texture,'Fine and medium enamel height')
                micro=Math(tree,'SUBTRACT',micro,Math(tree,'MULTIPLY',pores,.16),'Shallow enamel pores')
                bumpDistance=Mix(tree,cast.outputs['Fac'],(.00016,)*3+(1,),(.00038,)*3+(1,),'Painted plate and cast microrelief depth')
            elif role=='Track':
                base=Mix(tree,contact,(.029,.034,.030,1),(.26,.28,.255,1),'Dark shoe cavities and rubbed steel lands')
                base=Mix(tree,oxidation,base,(.080,.038,.017,1),'Oxide confined to shoe recesses')
                rough=Mix(tree,contact,(.62,.62,.62,1),(.21,.21,.21,1),'Contact steel reflects more sharply')
                micro=Math(tree,'ADD',Math(tree,'MULTIPLY',casting,.7),Math(tree,'MULTIPLY',texture,.3),'Cast shoe grain at two scales')
                bumpDistance=.00032
            elif role=='Steel':
                rough=Mix(tree,tooling,(.19,.19,.19,1),(.37,.37,.37,1),'Visible directional gun steel sheen')
                bumpDistance=.00005
        if SURFACE_STYLE in ['SurfaceV39','SurfaceV44']:
            # Museum repaint: soft coating relief, cast pores and handling
            # marks have distinct physical scales. No photo lighting in Base.
            meso=Noise(tree,position,140,3,'Fine orange peel on museum coating')
            castGrain=Noise(tree,position,240,3,'Irregular millimetre cast texture')
            poreMask=Ramp(tree,Noise(tree,position,390,2,'Small irregular coating voids'),.63,.77,'Sparse coating micro-pits')
            if role=='Paint':
                pigment=Ramp(tree,coarse,.23,.76,'Restrained pigment patch contrast')
                base=Mix(tree,pigment,(.077,.087,.052,1),(.107,.117,.077,1),'Museum olive pigment and thin coating')
                base=Mix(tree,chips,base,(.16,.17,.15,1),'Exposed steel stays localized')
                base=Mix(tree,oxidation,base,(.068,.030,.012,1),'Oxidation restricted to retained fittings')
                rolled=Mix(tree,pigment,(.27,.27,.27,1),(.48,.48,.48,1),'Uneven coating sheen across real plates')
                castRough=Mix(tree,castGrain,(.37,.37,.37,1),(.56,.56,.56,1),'Matte cast fitting valleys')
                rough=Mix(tree,cast.outputs['Fac'],rolled,castRough,'Distinct coated plate and cast finish')
                rough=Mix(tree,poreMask,rough,(.64,.64,.64,1),'Diffuse pore interiors')
                rough=Mix(tree,oxidation,rough,(.76,.76,.76,1),'Small oxide islands remain matte')
                height=Mix(tree,cast.outputs['Fac'],meso,castGrain,'Coating versus cast height field')
                micro=Math(tree,'SUBTRACT',height,Math(tree,'MULTIPLY',poreMask,.28),'Shallow coating pit relief')
                bumpDistance=Mix(tree,cast.outputs['Fac'],(.00038,)*3+(1,),(.00070,)*3+(1,),'Submillimetre paint and cast depth')
                shader.inputs['Coat Weight'].default_value=.065
                shader.inputs['Coat Roughness'].default_value=.34
            elif role=='Track':
                # Brightness follows authored rolling and grouser faces,
                # while the rougher cavities retain dark cast steel/oxide.
                base=Mix(tree,contact,(.042,.047,.041,1),(.33,.35,.32,1),'Readable shoe steel and rubbed contact lands')
                base=Mix(tree,oxidation,base,(.085,.039,.016,1),'Oxide remains inside shoe recesses')
                rough=Mix(tree,contact,(.69,.69,.69,1),(.24,.24,.24,1),'Rough cast shoe and polished working faces')
                micro=Math(tree,'SUBTRACT',castGrain,Math(tree,'MULTIPLY',poreMask,.32),'Irregular cast shoe pore relief')
                bumpDistance=.00055
            elif role=='Steel':
                toolContrast=Ramp(tree,tooling,.25,.77,'Fine steel machining contrast')
                base=Mix(tree,coarse,(.038,.045,.046,1),(.073,.080,.080,1),'Blued steel with visible neutral reflections')
                rough=Mix(tree,toolContrast,(.24,.24,.24,1),(.43,.43,.43,1),'Subtle directional tool marks in gun steel')
                micro=tooling;bumpDistance=.000075
        if SURFACE_STYLE=='SurfaceV44':
            import importlib.util
            finishPath=REPO/'Taierzhuang1938/_blender/Script_Type94MetalFinish.py'
            finishSpec=importlib.util.spec_from_file_location('Type94MetalFinish',finishPath)
            finish=importlib.util.module_from_spec(finishSpec);finishSpec.loader.exec_module(finish)
            base,rough,metallic,micro,bumpDistance=finish.RefineFinish(
                globals(),tree,role,position,cast.outputs['Fac'],wearAttribute.outputs['Fac'],
                coarse,contact if role=='Track'else None,base,rough,metallic,micro,bumpDistance)
    else:micro=fine
    bump=Node(tree,'ShaderNodeBump','Physical microrelief')
    if isinstance(bumpDistance,(int,float)):bump.inputs['Distance'].default_value=bumpDistance
    else:tree.links.new(bumpDistance,bump.inputs['Distance'])
    bump.inputs['Strength'].default_value=(.72 if role=='Paint' else .42) if SURFACE_STYLE in ['SurfaceV39','SurfaceV44'] else (.55 if role=='Paint' else .32)
    tree.links.new(micro,bump.inputs['Height'])
    tree.links.new(bump.outputs['Normal'],shader.inputs['Normal'])
    if role=='Paint':tree.links.new(bump.outputs['Normal'],shader.inputs['Coat Normal'])
    tree.links.new(base,shader.inputs['Base Color'])
    tree.links.new(rough,shader.inputs['Roughness'])
    if isinstance(metallic,(int,float)):shader.inputs['Metallic'].default_value=metallic
    else:tree.links.new(metallic,shader.inputs['Metallic'])
    orm=Node(tree,'ShaderNodeCombineColor','ORM: AO / Roughness / Metallic')
    orm.mode='RGB'
    tree.links.new(ao.outputs['Color'],orm.inputs['Red'])
    tree.links.new(rough,orm.inputs['Green'])
    if isinstance(metallic,(int,float)):orm.inputs['Blue'].default_value=metallic
    else:tree.links.new(metallic,orm.inputs['Blue'])
    return tree,shader,output,base,orm.outputs[0]


def Select(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]


def ImageTarget(tree,role,channel,size,reuse=None):
    image=reuse
    if image is None:
        image=bpy.data.images.new('Texture_Type94'+role+channel,width=size,height=size,alpha=False)
        image.colorspace_settings.name='sRGB' if channel=='Base' else 'Non-Color'
        image.generated_color=(.5,.5,1,1) if channel=='Normal' else (0,0,0,1)
        image.filepath_raw=str(OUT/(image.name+'.png'))
        image.file_format='PNG'
    node=Node(tree,'ShaderNodeTexImage','Baked '+channel)
    node.image=image
    for other in tree.nodes:other.select=False
    node.select=True;tree.nodes.active=node
    return image,node


def TransferSurfaceUvs(objects,role):
    """Reuse an exact, hashed UV checkpoint, reserving a strip for changed parts.

    This is an explicit UV dependency, not a claim of a fresh atlas replay.
    Compare complete local polygons and positions before transferring loops.
    """
    import numpy as np
    prior=json.loads((REPO/'Taierzhuang1938/Model/Type94Tankette/Data_SurfaceStudyV34.json').read_text(encoding='utf-8'))
    checkpoint=Path(prior['sourceBlend'])
    assert hashlib.sha256(checkpoint.read_bytes()).hexdigest()==prior['sourceBlendSha256']
    with bpy.data.libraries.load(str(checkpoint),link=False) as (available,loaded):
        names=tuple(available.objects);loaded.objects=list(names)
    references=dict(zip(names,loaded.objects));changed=[];retained=[]
    def Coordinates(mesh):
        values=np.empty(len(mesh.vertices)*3,dtype=np.float32);mesh.vertices.foreach_get('co',values);return values
    def Loops(mesh):
        values=np.empty(len(mesh.loops),dtype=np.int32);mesh.loops.foreach_get('vertex_index',values);return values
    def PolygonSizes(mesh):
        values=np.empty(len(mesh.polygons),dtype=np.int32);mesh.polygons.foreach_get('loop_total',values);return values
    for obj in objects:
        reference=references.get(obj.name);mesh=obj.data
        if reference is None or reference.type!='MESH' or not reference.data.uv_layers or len(mesh.vertices)!=len(reference.data.vertices) or len(mesh.loops)!=len(reference.data.loops) or not np.array_equal(Coordinates(mesh),Coordinates(reference.data)) or not np.array_equal(Loops(mesh),Loops(reference.data)) or not np.array_equal(PolygonSizes(mesh),PolygonSizes(reference.data)):
            changed.append(obj);continue
        if not mesh.uv_layers:mesh.uv_layers.new(name='UVMap')
        values=np.empty(len(mesh.loops)*2,dtype=np.float32);reference.data.uv_layers.active.data.foreach_get('uv',values)
        mesh.uv_layers.active.data.foreach_set('uv',values);retained.append(obj)
    # Appended reference objects are never linked or exported. Their data may
    # include old material graphs; remove unused IDs before authoring channels.
    for reference in loaded.objects:
        if reference and reference.name in bpy.data.objects:bpy.data.objects.remove(reference,do_unlink=True)
    if changed:
        Select(changed)
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(65),island_margin=.004,scale_to_bounds=True)
        bpy.ops.object.mode_set(mode='OBJECT')
        for group,offset,width in [(retained,0.,.75),(changed,.77,.23)]:
            for obj in group:
                values=np.empty(len(obj.data.loops)*2,dtype=np.float32)
                obj.data.uv_layers.active.data.foreach_get('uv',values);values[::2]=offset+width*values[::2]
                obj.data.uv_layers.active.data.foreach_set('uv',values)
    scene['SurfaceUvCheckpointSha256']=prior['sourceBlendSha256']
    scene['SurfaceUvCheckpointScope']='Exact local topology transfer; changed paint parts use a separate atlas strip'
    print('TYPE94_UV_CHECKPOINT',role,'retained',len(retained),'changed',len(changed),flush=True)
    return {'role':role,'retainedOwners':[o.name for o in retained],'repackedOwners':[o.name for o in changed],'checkpoint':str(checkpoint),'sha256':prior['sourceBlendSha256']}


uvTransfers=[]
def BakeRole(role,size,selectedObjects=None,unwrap=True,reuseImages=None):
    material=bpy.data.materials.get('Material_Type94'+role)
    if not material:return
    unique={}
    for obj in bpy.data.objects:
        if obj.type=='MESH' and any(m==material for m in obj.data.materials):
            unique.setdefault(obj.data.as_pointer(),obj)
    objects=selectedObjects if selectedObjects is not None else list(unique.values())
    if not objects:return
    print('TYPE94_UV',role,len(objects),size,flush=True)
    Select(objects)
    if unwrap and UV_MODE=='Checkpoint' and SURFACE_STYLE in ['SurfaceV36','SurfaceV39','SurfaceV44']:
        uvTransfers.append(TransferSurfaceUvs(objects,role))
        Select(objects)
    elif unwrap:
        for obj in objects:
            if not obj.data.uv_layers:obj.data.uv_layers.new(name='UVMap')
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(65),island_margin=.004,scale_to_bounds=True)
        bpy.ops.object.mode_set(mode='OBJECT')
    tree,shader,output,base,orm=Author(material,role)
    emission=Node(tree,'ShaderNodeEmission','Unlit channel baker')
    images={};nodes={}
    for channel,socket in [('Base',base),('Orm',orm),('Normal',None)]:
        image,node=ImageTarget(tree,role,channel,size,(reuseImages or {}).get(channel))
        if channel=='Normal':
            tree.links.new(shader.outputs['BSDF'],output.inputs['Surface'])
            bpy.ops.object.bake(type='NORMAL',normal_space='TANGENT',use_clear=False,margin=8)
        else:
            tree.links.new(socket,emission.inputs['Color'])
            tree.links.new(emission.outputs[0],output.inputs['Surface'])
            bpy.ops.object.bake(type='EMIT',use_clear=False,margin=8)
        image.save()
        image.pack()
        images[channel]=image;nodes[channel]=node
        records.append({'role':role,'channel':channel,'file':image.filepath_raw,'size':[size,size],
                        'sha256':hashlib.sha256(Path(image.filepath_raw).read_bytes()).hexdigest()})
        print('TYPE94_BAKED',role,channel,flush=True)
    tree.links.new(shader.outputs['BSDF'],output.inputs['Surface'])
    tree.links.new(nodes['Base'].outputs['Color'],shader.inputs['Base Color'])
    separate=Node(tree,'ShaderNodeSeparateColor','Baked ORM decoder');separate.mode='RGB'
    tree.links.new(nodes['Orm'].outputs['Color'],separate.inputs['Color'])
    tree.links.new(separate.outputs['Green'],shader.inputs['Roughness'])
    tree.links.new(separate.outputs['Blue'],shader.inputs['Metallic'])
    normal=Node(tree,'ShaderNodeNormalMap','Tangent normal, OpenGL +Y')
    if SURFACE_STYLE in ['SurfaceV39','SurfaceV44']:normal.inputs['Strength'].default_value={'Paint':1.65,'Track':1.25,'Steel':1.15}.get(role,1.)
    tree.links.new(nodes['Normal'].outputs['Color'],normal.inputs['Color'])
    tree.links.new(normal.outputs['Normal'],shader.inputs['Normal'])
    if role=='Paint':tree.links.new(normal.outputs['Normal'],shader.inputs['Coat Normal'])
    # glTF AO is a separate R channel, using Blender's exporter convention.
    group=bpy.data.node_groups.get('glTF Material Output')
    if not group:
        from io_scene_gltf2.blender.com.material_helpers import create_settings_group
        group=create_settings_group('glTF Material Output')
    aoOutput=Node(tree,'ShaderNodeGroup','glTF Material Output');aoOutput.node_tree=group
    tree.links.new(separate.outputs['Red'],aoOutput.inputs['Occlusion'])
    # Keep the disconnected authoring graph as an editable, named frame.
    frame=Node(tree,'NodeFrame','Editable physical surface authoring')
    for node in list(tree.nodes):
        if node.name not in ['Material Output','Physical '+role,'Baked Base','Baked Orm','Baked Normal','Baked ORM decoder','Tangent normal, OpenGL +Y','glTF Material Output',frame.name]:
            node.parent=frame


for role,size in [('Paint',4096),('Track',2048),('Rubber',1024),('Steel',2048 if SURFACE_STYLE in ['SurfaceV34','SurfaceV36','SurfaceV39','SurfaceV44']else 1024)]:
    BakeRole(role,size)
for role,color,roughness,metal in [('Dark',(.007,.008,.007,1),.75,0),('White',(.76,.76,.72,1),.45,0),('Red',(.65,.005,.002,1),.42,0)]:
    material=bpy.data.materials.get('Material_Type94'+role)
    if material:
        shader=material.node_tree.nodes.get('Principled BSDF')
        if shader:
            shader.inputs['Base Color'].default_value=color
            shader.inputs['Roughness'].default_value=roughness
            shader.inputs['Metallic'].default_value=metal
scene['SurfaceAcceptance']='PBR study; strict reference surface comparison pending'
if SURFACE_STYLE in ['SurfaceV36','SurfaceV39','SurfaceV44']:
    # The hashed UV checkpoint supplies no retained source objects/materials.
    # Remove its unused IDs after all four roles have taken their UV loops.
    for blocks in [bpy.data.meshes,bpy.data.materials,bpy.data.images,bpy.data.node_groups]:
        for block in list(blocks):
            if block.users==0:blocks.remove(block)
import importlib.util
patchPath=REPO/'Taierzhuang1938/_blender/Script_Type94MechanismCorrect.py'
spec=importlib.util.spec_from_file_location('Type94MechanismCorrection',patchPath)
patch=importlib.util.module_from_spec(spec);spec.loader.exec_module(patch);patch.CorrectMechanism()
manifest={'id':'Type94Tankette','quality':QUALITY,'variant':VARIANT,'surfaceStyle':SURFACE_STYLE,'uvGenerationMode':UV_MODE,'method':'Deterministic geometry-aware Blender procedural authoring, UV bake, no photo lighting in albedo',
          'textures':records,'uvTransfers':uvTransfers,'acceptance':'Pending reference comparison and exported-image channel audit'}
(OUT/'Data_PbrBake.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
destination=SOURCE/('Scene_Type94Tankette'+QUALITY+VARIANT+'.blend')
bpy.ops.wm.save_as_mainfile(filepath=str(destination))
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.data.objects:
    if obj.type not in ['CAMERA','LIGHT']:obj.select_set(True)
export=SOURCE/'Exports'/('Model_Type94Tankette'+QUALITY+VARIANT+'.glb')
exportSpec=importlib.util.spec_from_file_location('Type94GlbExport',REPO/'Taierzhuang1938/_blender/Script_Type94Export.py')
exporter=importlib.util.module_from_spec(exportSpec);exportSpec.loader.exec_module(exporter);exporter.ExportGltf(export)
print('TYPE94_PBR_STUDY_DONE',str(destination),str(export),flush=True)
