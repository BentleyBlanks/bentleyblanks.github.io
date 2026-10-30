"""Add the V98 fixed lug to intact V96 PBR, with its own guarded paint tile."""
import ast,bpy,hashlib,importlib.util,json,math,os,numpy as np
from pathlib import Path
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=Path(os.environ.get('TYPE94_HIGH_ROOT',str(base/'SurfaceV99')));folder=root/'Textures/HighSurfaceV99';phase=os.environ.get('TYPE94_LUG_PHASE','Bake')
for directory in [folder,root/'Acceptance',root/'Exports',root/'Rebuild']:directory.mkdir(parents=True,exist_ok=True)
assert phase in ['Bake','Finalize']and not bpy.data.filepath
atlas=json.loads((root/'Acceptance/Data_LugAtlasV99.json').read_text());material=atlas['reference'];geometry=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_GrayTrialV98.json').read_text());x,y,w,h=atlas['patchPixels'];destination=root/'Scene_Type94TanketteHighSurfaceV99Current.blend'
def Hash(file):return hashlib.sha256(Path(file).read_bytes()).hexdigest()
def Export(file):
    bpy.ops.object.select_all(action='DESELECT');asset=bpy.data.objects['Type94Tankette']
    for obj in [asset,*asset.children_recursive]:obj.select_set(True)
    spec=importlib.util.spec_from_file_location('Lug99Export',repo/'Taierzhuang1938/_blender/Script_Type94Export.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);module.ExportGltf(file)
if phase=='Bake':
    assert Hash(material['sourceBlend'])==material['sourceBlendSha256']and Hash(geometry['sourceBlend'])==geometry['sourceBlendSha256'];bpy.ops.wm.open_mainfile(filepath=material['sourceBlend']);scene=bpy.context.scene;assert scene.get('BlenderMcpTask')=='Type94Tankette';paint=bpy.data.materials['Material_Type94Paint'];inputs={}
    for channel in ['Base','Orm','Normal']:
        image=paint.node_tree.nodes['Baked '+channel].image;file=folder/('Texture_Type94Paint'+channel+'InputV99.png');assert image.packed_file;file.write_bytes(image.packed_file.data);inputs[channel]=dict(file=str(file),sha256=Hash(file))
    before=set(bpy.data.objects)
    with bpy.data.libraries.load(geometry['sourceBlend'],link=False)as(available,loaded):loaded.objects=['Geometry_FinalDriveRaisedEarRight_Paint']
    imported=set(bpy.data.objects)-before;source=loaded.objects[0];lug=source.copy();lug.data=source.data.copy();lug.parent=bpy.data.objects['FinalDriveHousingRight'];lug.matrix_basis=source.matrix_basis.copy();scene.collection.objects.link(lug)
    for obj in imported:bpy.data.objects.remove(obj,do_unlink=True)
    lug.name='Geometry_FinalDriveRaisedEarRight_Paint';author=bpy.data.materials.new('Material_Type94LugAuthorV99');author.use_nodes=True;author.use_fake_user=True;lug.data.materials.clear();lug.data.materials.append(author)
    for name,value in [('WearZone',.8),('SurfaceCast',.25)]:
        attr=lug.data.attributes.get(name)or lug.data.attributes.new(name,'FLOAT','FACE')
        for item in attr.data:item.value=value
    bpy.ops.object.select_all(action='DESELECT');lug.select_set(True);bpy.context.view_layer.objects.active=lug;bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=math.radians(65),island_margin=.02,scale_to_bounds=True,correct_aspect=False);bpy.ops.object.mode_set(mode='OBJECT')
    for item in lug.data.uv_layers.active.data:item.uv=(6/w+(1-12/w)*item.uv.x,6/h+(1-12/h)*item.uv.y)
    file=repo/'Taierzhuang1938/_blender/Script_Type94TankettePbr.py';syntax=ast.parse(file.read_text());names={'Node','Math','Ramp','Mix','Noise','Author'};scope=dict(bpy=bpy,math=math,importlib=importlib,REPO=repo,SURFACE_STYLE='SurfaceV44');exec(compile(ast.Module(body=[n for n in syntax.body if isinstance(n,ast.FunctionDef)and n.name in names],type_ignores=[]),str(file),'exec'),scope)
    tree,shader,output,baseColor,orm=scope['Author'](author,'Paint');mix=tree.nodes.new('ShaderNodeMixRGB');mix.inputs[0].default_value=.38;mix.inputs[2].default_value=(.092,.102,.067,1);tree.links.new(baseColor,mix.inputs[1]);baseColor=mix.outputs[0];tree.links.new(baseColor,shader.inputs['Base Color'])
    for node in tree.nodes:
        if node.type=='AMBIENT_OCCLUSION':node.only_local=False
        if node.type=='BUMP':node.inputs['Strength'].default_value*=.55
    emission=tree.nodes.new('ShaderNodeEmission');scene.render.engine='CYCLES';scene.cycles.samples=8;scene.render.threads_mode='FIXED';scene.render.threads=4;records={}
    for channel,socket in [('Base',baseColor),('Orm',orm),('Normal',None)]:
        image=bpy.data.images.new('Texture_Type94Lug'+channel+'TileV99',width=w,height=h,alpha=False);image.colorspace_settings.name='sRGB'if channel=='Base'else'Non-Color';image.generated_color=(.5,.5,1,1)if channel=='Normal'else(0,0,0,1);image.filepath_raw=str(folder/('Texture_Type94Lug'+channel+'TileV99.png'));image.file_format='PNG';target=tree.nodes.new('ShaderNodeTexImage');target.name='Editable lug tile '+channel;target.image=image
        for node in tree.nodes:node.select=False
        target.select=True;tree.nodes.active=target
        if channel=='Normal':tree.links.new(shader.outputs[0],output.inputs['Surface']);bpy.ops.object.bake(type='NORMAL',normal_space='TANGENT',use_selected_to_active=False,use_clear=False,margin=6)
        else:tree.links.new(socket,emission.inputs['Color']);tree.links.new(emission.outputs[0],output.inputs['Surface']);bpy.ops.object.bake(type='EMIT',use_selected_to_active=False,use_clear=False,margin=6)
        image.save();image.pack();records[channel]=dict(file=image.filepath_raw,sha256=Hash(image.filepath_raw))
    tree.links.new(shader.outputs[0],output.inputs['Surface'])
    for item in lug.data.uv_layers.active.data:u,v=item.uv;item.uv=((x+w*u)/4096,1-(y+h*(1-v))/4096)
    lug.data.materials.clear();lug.data.materials.append(paint);scene['SurfaceStudyRevision']='SurfaceV99Current';scene['WholeReferenceAccepted']=False;bpy.ops.wm.save_as_mainfile(filepath=str(destination))
    (root/'Acceptance/Data_LugBakeV99.json').write_text(json.dumps(dict(materialReference=material,geometryReference=geometry,inputs=inputs,tiles=records,patchPixels=[x,y,w,h]),indent=2)+'\n')
else:
    bpy.ops.wm.open_mainfile(filepath=str(destination));scene=bpy.context.scene;tree=bpy.data.materials['Material_Type94Paint'].node_tree
    for channel in ['Base','Orm','Normal']:
        old=tree.nodes['Baked '+channel].image;image=bpy.data.images.load(str(folder/('Texture_Type94Paint'+channel+'PatchedV99.png')),check_existing=False);image.colorspace_settings.name=old.colorspace_settings.name;image.pack();archive=tree.nodes.new('ShaderNodeTexImage');archive.name='Editable pre-lug '+channel+' V99';archive.image=old
        for node in tree.nodes:
            if node.type=='TEX_IMAGE'and node.image==old and node!=archive:node.image=image
    scene['LugPbrApplied']=True;bpy.ops.wm.save_as_mainfile(filepath=str(destination));bpy.ops.wm.open_mainfile(filepath=str(destination));Export(root/'Exports/Model_Type94TanketteHighSurfaceV99Current.glb');bpy.ops.wm.open_mainfile(filepath=str(destination));Export(root/'Exports/Model_Type94TanketteHighSurfaceV99Reexport.glb')
    from io_scene_gltf2.io.com.constants import ROUNDING_DIGIT
    report=dict(sourceBlend=str(destination),sourceBlendSha256=Hash(destination),sourceGlb=str(root/'Exports/Model_Type94TanketteHighSurfaceV99Current.glb'),sha256=Hash(root/'Exports/Model_Type94TanketteHighSurfaceV99Current.glb'),sourceReexportSha256=Hash(root/'Exports/Model_Type94TanketteHighSurfaceV99Reexport.glb'),exporterTangentRoundingDigits=ROUNDING_DIGIT,wholeReferenceAccepted=False)
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=report['sourceGlb']);assert len(bpy.data.objects)==296 and sum(o.type=='MESH'for o in bpy.data.objects)==240 and sum(i.source=='FILE'for i in bpy.data.images)==12;report['actualGlbImportPassed']=True
    (root/'Acceptance/Data_CurrentPbrV99.json').write_text(json.dumps(report,indent=2)+'\n')
print('TYPE94_LUGPBR99_'+phase.upper()+'_COMPLETE',flush=True)
