"""V33: repair ownAO UV overlaps, rebake exact geometry, preserve UV0."""
import bpy,os,pathlib,json,hashlib,ast,array,struct,math,numpy as np,re
repo=pathlib.Path(os.environ['KI4_REPO_ROOT']);source=pathlib.Path(os.environ['KI4_SOURCE_ROOT']);asset=pathlib.Path(os.environ['KI4_ASSET_ROOT']);author=source/'Scene_NakajimaKi4.blend';root=bpy.data.objects['NakajimaKi4'];scene=bpy.context.scene
minimumOnly=os.environ.get('KI4_UV1_MIN_ONLY','0')=='1';expected='e07a5cb8bfcc00efb05bcb79addd3861594df611fb1904821dc02308eefc5717' if minimumOnly else '465892610a6cfa0cf3584945e0b5125c2800b7a4cb3684500ca8cdf5b460df2d';baselineVersion='ReferenceV33' if minimumOnly else 'ReferenceV32'
assert re.fullmatch(r'ReferenceV3[34](?:_[A-Za-z0-9]+)?',source.name) and pathlib.Path(bpy.data.filepath).resolve()==author.resolve();assert hashlib.sha256(author.read_bytes()).hexdigest()==expected;assert root['version']=='20261026'+baselineVersion
baseline=json.loads((repo/'tmp/NakajimaKi4'/baselineVersion/'Evidence/Data_HardwareHighAo.json').read_text(encoding='utf8'));names=baseline['partNames'];targets=[bpy.data.objects[name] for name in names]
helper={};path=repo/'Taierzhuang1938/_blender/Script_NakajimaKi4GeometryAo.py';exec(compile(path.read_text(encoding='utf8'),str(path),'exec'),helper)
tree=ast.parse((repo/'Taierzhuang1938/_blender/Script_NakajimaKi4MainGearUpdate.py').read_text(encoding='utf8'));fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='MeshFingerprint');exec(compile(ast.Module(body=[fn],type_ignores=[]),'Fingerprint','exec'),globals())
before={o.name:MeshFingerprint(o) for o in root.children_recursive if o.type=='MESH'};images={im.name:hashlib.sha256(im.packed_file.data).hexdigest() for im in bpy.data.images if im.packed_file};assert len(before)==928 and len(images)==38
oldUvs={obj:np.array([v.uv[:] for v in obj.data.uv_layers['GeometryAO'].data],np.float32) for obj in targets};repair={};path=repo/'Taierzhuang1938/_blender/Script_NakajimaKi4HardwareUv1.py';exec(compile(path.read_text(encoding='utf8'),str(path),'exec'),repair);report=repair['EnsureMinimumAoCharts'](targets,4) if minimumOnly else repair['RepairHardwareAoUv'](targets,helper)
newUvs={obj:np.array([v.uv[:] for v in obj.data.uv_layers['GeometryAO'].data],np.float32) for obj in targets}
for obj in targets:
    obj.data.uv_layers['GeometryAO'].data.foreach_set('uv',oldUvs[obj].ravel());assert MeshFingerprint(obj)==before[obj.name],'Geometry/primaryUV/normal changed';obj.data.uv_layers['GeometryAO'].data.foreach_set('uv',newUvs[obj].ravel())
for obj in root.children_recursive:
    if obj.type=='MESH' and obj.name not in names:assert MeshFingerprint(obj)==before[obj.name]
oldAo=bpy.data.images[root['hardwareAoImage']];aoName=oldAo.name;newAo=bpy.data.images.new(aoName+'_V33',width=2048,height=2048,alpha=True,float_buffer=True);newAo.colorspace_settings.name='Non-Color';newAo.pixels.foreach_set(np.ones(2048*2048*4,np.float32));mats={o:list(o.data.materials) for o in targets};hide={o:o.hide_render for o in scene.objects};temporary=[]
for obj in targets:
    original=mats[obj][0];mat=bpy.data.materials.new('Temp_RepairedHardwareAo');mat.use_nodes=True;nodes=mat.node_tree.nodes;nodes.clear();links=mat.node_tree.links;out=nodes.new('ShaderNodeOutputMaterial');em=nodes.new('ShaderNodeEmission');ao=nodes.new('ShaderNodeAmbientOcclusion');ao.samples=64;ao.inputs['Distance'].default_value=2.;links.new(ao.outputs['AO'],em.inputs[0]);links.new(em.outputs[0],out.inputs[0]);orm=next(n.image for n in original.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and 'Orm' in n.image.name);uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap';tex=nodes.new('ShaderNodeTexImage');tex.image=orm;split=nodes.new('ShaderNodeSeparateColor');mul=nodes.new('ShaderNodeMath');mul.operation='MULTIPLY';links.new(uv.outputs[0],tex.inputs[0]);links.new(tex.outputs[0],split.inputs[0]);links.new(split.outputs['Red'],mul.inputs[0]);links.new(ao.outputs['AO'],mul.inputs[1]);links.new(mul.outputs[0],em.inputs[0]);target=nodes.new('ShaderNodeTexImage');target.image=newAo;nodes.active=target;obj.data.materials.clear();obj.data.materials.append(mat);obj.data.uv_layers.active=obj.data.uv_layers['GeometryAO'];obj.data.uv_layers['GeometryAO'].active_render=True;temporary.append(mat)
scene.render.engine='CYCLES';scene.cycles.samples=1;scene.cycles.device='CPU';scene.cycles.use_denoising=False;scene.render.threads_mode='FIXED';scene.render.threads=8;scene.render.bake.margin=6
opaque=[o for o in root.children_recursive if o.type=='MESH' and o.name!='Surface_FlushRivetHeads' and not helper['AoGlass'](o)]
try:
    for group in ['Fixed','Pivot_WheelLeft','Pivot_WheelRight']:
        selected=[o for o in targets if helper['AoMovingGroup'](o)==group]
        for obj in scene.objects:obj.hide_render=obj not in opaque or helper['AoMovingGroup'](obj)!=group
        bpy.ops.object.select_all(action='DESELECT')
        for obj in selected:obj.select_set(True)
        bpy.context.view_layer.objects.active=selected[0];bpy.ops.object.bake(type='EMIT',uv_layer='GeometryAO',use_clear=False,use_selected_to_active=False)
finally:
    for obj,value in hide.items():obj.hide_render=value
    for obj,materials in mats.items():
        obj.data.materials.clear()
        for mat in materials:obj.data.materials.append(mat)
        obj.data.uv_layers.active_index=0;obj.data.uv_layers[0].active_render=True
    for mat in temporary:bpy.data.materials.remove(mat)
for material in bpy.data.materials:
    if material.use_nodes:
        for node in material.node_tree.nodes:
            if node.type=='TEX_IMAGE' and node.image==oldAo:node.image=newAo
bpy.data.images.remove(oldAo);newAo.name=aoName;imagePath=source/'Textures'/(aoName+'.png');newAo.filepath_raw=str(imagePath);newAo.file_format='PNG';newAo.save();newAo.pack()
for name,value in images.items():
    if name!=aoName:assert hashlib.sha256(bpy.data.images[name].packed_file.data).hexdigest()==value
root['version']=os.environ.get('KI4_CANDIDATE_VERSION','20261026ReferenceV33');root['hardwareAoUvScope']='Analytic coil helix/wire charts with separate caps; strict triangle-interior overlap graph split and minimum4px chart sampling. Geometry/primaryUV/normals unchanged; emitted UV1 overlap audit still required.'
root['geometryAoPendingForChangedGeometry']=True
for filename in ['Script_NakajimaKi4HardwareUv1.py','Script_NakajimaKi4HardwareUv1Update.py']:
    path=repo/'Taierzhuang1938/_blender'/filename;text=bpy.data.texts.get(filename) or bpy.data.texts.new(filename);text.clear();text.write(path.read_text(encoding='utf8'));text.use_fake_user=True
bpy.ops.wm.save_as_mainfile(filepath=str(author));sourceSha=hashlib.sha256(author.read_bytes()).hexdigest();patch=asset/'Model_HardwareHighPatch.glb';bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
for name in ['Pivot_WheelLeft','Pivot_WheelRight']+names:bpy.data.objects[name].select_set(True)
bpy.context.view_layer.objects.active=root;bpy.ops.export_scene.gltf(filepath=str(patch),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_extras=True,export_texcoords=True,export_normals=True,export_tangents=True,export_animations=False,export_cameras=False,export_lights=False)
record={**baseline,'state':'HardwareOwnAoUvRepairedAndRebaked_LowPending','sourceSha256':sourceSha,'patchSha256':hashlib.sha256(patch.read_bytes()).hexdigest(),'image':{'path':str(imagePath),'sha256':hashlib.sha256(imagePath.read_bytes()).hexdigest(),'size':[2048,2048]},'uv1Repair':report,'scope':'Only46 AO UV1 fields and ownAO atlas replaced; all928 geometry/UV0/normal fields and37 old image payloads retained. Actual emitted overlap/ray/seam and full fidelity/motion gates still required.'}
for folder in [source/'Evidence',asset/'Evidence']:(folder/'Data_HardwareHighAo.json').write_text(json.dumps(record,indent=2),encoding='utf8');(folder/'Data_HardwareHighUv1Repair.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps({'sourceSha256':sourceSha,'repairedParts':len(targets),'minimumOnly':minimumOnly,'sourceGeometryUv0NormalsRetained':True}),flush=True)
