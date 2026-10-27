"""Canvas10 paragraph53: No1 aluminium-alloy V legs, steel oleo casing.

Update only the two V-frame materials in an exclusive V31 author copy.
Existing aluminium PBR is an appearance analogue; its finish is not measured.
Rebake only their own-AO atlas regions, without moving geometry or UVs.
"""
import bpy,pathlib,os,json,hashlib,ast,array,struct,math,re,numpy as np
repo=pathlib.Path(os.environ['KI4_REPO_ROOT']);source=pathlib.Path(os.environ['KI4_SOURCE_ROOT']);asset=pathlib.Path(os.environ['KI4_ASSET_ROOT']);author=source/'Scene_NakajimaKi4.blend'
assert re.fullmatch(r'ReferenceV32(?:_[A-Za-z0-9]+)?',source.name) and pathlib.Path(bpy.data.filepath).resolve()==author.resolve()
assert hashlib.sha256(author.read_bytes()).hexdigest()=='e03a286311472b3516ddbb1e42808fa52d832a2938698a33df2e47da2d075408'
baseline=json.loads((repo/'tmp/NakajimaKi4/ReferenceV31/Evidence/Data_HardwareHighAo.json').read_text());root=bpy.data.objects['NakajimaKi4'];assert root['version']=='20261026ReferenceV31'
tree=ast.parse((repo/'Taierzhuang1938/_blender/Script_NakajimaKi4MainGearUpdate.py').read_text(encoding='utf8'));fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='MeshFingerprint');exec(compile(ast.Module(body=[fn],type_ignores=[]),'Fingerprint','exec'),globals())
changed=['LandingGear_MainVFrameLeft','LandingGear_MainVFrameRight'];targets=[bpy.data.objects[name] for name in changed]
before={o.name:MeshFingerprint(o) for o in root.children_recursive if o.type=='MESH'};imageBefore={im.name:hashlib.sha256(im.packed_file.data).hexdigest() for im in bpy.data.images if im.packed_file};assert len(before)==928 and len(imageBefore)==38
oldMaterials={o:list(o.data.materials) for o in targets};aluminium=bpy.data.objects['Oleo_InnerGuideRight'].data.materials[0]
assert 'MachinedAluminum' in aluminium.name
for obj in targets:
    assert 'OxidizedSteel' in obj.data.materials[0].name;obj.data.materials[0]=aluminium
oldAo=bpy.data.images[root['hardwareAoImage']];aoName=oldAo.name;newAo=bpy.data.images.new(aoName+'_V32',width=2048,height=2048,alpha=True,float_buffer=True);newAo.colorspace_settings.name='Non-Color';pixels=np.empty(2048*2048*4,dtype=np.float32);oldAo.pixels.foreach_get(pixels);newAo.pixels.foreach_set(pixels)
scene=bpy.context.scene;hide={o:o.hide_render for o in scene.objects};temporary=[]
def Group(obj):
    parent=obj.parent
    while parent:
        if parent.name.startswith('Pivot_'):return parent.name
        parent=parent.parent
    return 'Fixed'
opaque=[o for o in root.children_recursive if o.type=='MESH' and o.name!='Surface_FlushRivetHeads' and not any('Windscreen' in m.name for m in o.data.materials)]
scene.render.engine='CYCLES';scene.cycles.samples=1;scene.cycles.device='CPU';scene.cycles.use_denoising=False;scene.render.threads_mode='FIXED';scene.render.threads=8;scene.render.bake.margin=6
try:
    for obj in scene.objects:obj.hide_render=obj not in opaque or Group(obj)!='Fixed'
    for obj in targets:
        mat=bpy.data.materials.new('Temp_VFrameAluminiumAo');mat.use_nodes=True;nodes=mat.node_tree.nodes;nodes.clear();links=mat.node_tree.links;out=nodes.new('ShaderNodeOutputMaterial');em=nodes.new('ShaderNodeEmission');ao=nodes.new('ShaderNodeAmbientOcclusion');ao.samples=64;ao.inputs['Distance'].default_value=2.;links.new(ao.outputs['AO'],em.inputs[0]);links.new(em.outputs[0],out.inputs[0])
        orm=next(n.image for n in aluminium.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and 'Orm' in n.image.name);uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap';tex=nodes.new('ShaderNodeTexImage');tex.image=orm;split=nodes.new('ShaderNodeSeparateColor');multiply=nodes.new('ShaderNodeMath');multiply.operation='MULTIPLY';links.new(uv.outputs[0],tex.inputs[0]);links.new(tex.outputs[0],split.inputs[0]);links.new(split.outputs['Red'],multiply.inputs[0]);links.new(ao.outputs['AO'],multiply.inputs[1]);links.new(multiply.outputs[0],em.inputs[0]);target=nodes.new('ShaderNodeTexImage');target.image=newAo;nodes.active=target
        obj.data.materials.clear();obj.data.materials.append(mat);obj.data.uv_layers.active=obj.data.uv_layers['GeometryAO'];obj.data.uv_layers['GeometryAO'].active_render=True;temporary.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in targets:obj.select_set(True)
    bpy.context.view_layer.objects.active=targets[0];bpy.ops.object.bake(type='EMIT',uv_layer='GeometryAO',use_clear=False,use_selected_to_active=False)
finally:
    for obj,value in hide.items():obj.hide_render=value
    for obj in targets:obj.data.materials.clear();obj.data.materials.append(aluminium);obj.data.uv_layers.active_index=0;obj.data.uv_layers[0].active_render=True
    for mat in temporary:bpy.data.materials.remove(mat)
newPixels=np.empty(2048*2048*4,dtype=np.float32);newAo.pixels.foreach_get(newPixels);changedPixels=int(np.sum(np.any(abs(newPixels.reshape(-1,4)-pixels.reshape(-1,4))>1e-7,axis=1)))
for material in bpy.data.materials:
    if material.use_nodes:
        for node in material.node_tree.nodes:
            if node.type=='TEX_IMAGE' and node.image==oldAo:node.image=newAo
bpy.data.images.remove(oldAo);newAo.name=aoName;path=source/'Textures'/(aoName+'.png');newAo.filepath_raw=str(path);newAo.file_format='PNG';newAo.save();newAo.pack()
after={o.name:MeshFingerprint(o) for o in root.children_recursive if o.type=='MESH'}
for name in before:
    if name not in changed:assert before[name]==after[name],name
for obj in targets:
    newMaterial=obj.data.materials[0];obj.data.materials[0]=oldMaterials[obj][0];assert MeshFingerprint(obj)==before[obj.name],'Geometry/UV/normal changed';obj.data.materials[0]=newMaterial
for name,value in imageBefore.items():
    if name!=aoName:assert hashlib.sha256(bpy.data.images[name].packed_file.data).hexdigest()==value,name
root['version']='20261026ReferenceV32';root['mainVFrameMaterialSource']='NDL8815746 Canvas10 paragraph53: No1 aluminium-alloy V strut; separate steel-tube strut houses oleo. Exact alloy composition, paint and roughness not specified.'
root['mainVFrameMaterialScope']='Two V-frame meshes use existing aluminium PBR analogue; coating/finish inferred. Geometry, UVs, normals, all controls retained. Only two high own-AO atlas regions rebaked; whole fidelity/retained receiver AO still pending.'
for obj in targets:obj['materialEvidence']=root['mainVFrameMaterialSource']
scriptPath=repo/'Taierzhuang1938/_blender/Script_NakajimaKi4VFrameMaterial.py';text=bpy.data.texts.get(scriptPath.name) or bpy.data.texts.new(scriptPath.name);text.clear();text.write(scriptPath.read_text(encoding='utf8'));text.use_fake_user=True
bpy.ops.wm.save_as_mainfile(filepath=str(author));sourceSha=hashlib.sha256(author.read_bytes()).hexdigest()
patch=asset/'Model_HardwareHighPatch.glb';bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
for name in ['Pivot_WheelLeft','Pivot_WheelRight']+baseline['partNames']:bpy.data.objects[name].select_set(True)
bpy.context.view_layer.objects.active=root;bpy.ops.export_scene.gltf(filepath=str(patch),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_extras=True,export_texcoords=True,export_normals=True,export_tangents=True,export_animations=False,export_cameras=False,export_lights=False)
highRecord={**baseline,'state':'ScopedHardwareAoAfterPrimaryMaterialCorrection_LowPending','sourceSha256':sourceSha,'patchSha256':hashlib.sha256(patch.read_bytes()).hexdigest(),'image':{'path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'size':[2048,2048]},'materialChangedParts':changed,'sourceMaterialReference':root['mainVFrameMaterialSource']}
result={'state':'PrintedVFrameAluminiumMaterialCorrected_SourceGeometryUnchanged','baselineAuthorSha256':'e03a286311472b3516ddbb1e42808fa52d832a2938698a33df2e47da2d075408','sourceSha256':sourceSha,'changedParts':changed,'oldMaterial':oldMaterials[targets[0]][0].name,'newMaterial':aluminium.name,'unchangedSourceMeshes':926,'all928GeometryUvNormalsRetained':True,'oldPackedImagesRetained':37,'ownAoChangedPixels':changedPixels,'scope':root['mainVFrameMaterialScope']}
for folder in [asset/'Evidence',source/'Evidence']:
    (folder/'Data_HardwareHighAo.json').write_text(json.dumps(highRecord,indent=2),encoding='utf8');(folder/'Data_VFrameMaterialSourceCorrection.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps(result),flush=True)
