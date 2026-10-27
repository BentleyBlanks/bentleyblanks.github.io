"""Independent tyre AO from current real wheel geometry; preserve all other fields.

Run against protected V34. Save a NEW V35 author only after ray comparison improves.
The analytic circumferential/meridian chart is affine in the preserved primary UV.
"""
import bpy,pathlib,os,json,hashlib,math,ast,array,struct,time
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
repo=pathlib.Path(os.environ['KI4_REPO_ROOT']).resolve();source=pathlib.Path(os.environ['KI4_SOURCE_ROOT']).resolve();asset=pathlib.Path(os.environ['KI4_ASSET_ROOT']).resolve()
baseline=pathlib.Path(bpy.data.filepath);assert baseline.name=='Scene_NakajimaKi4.blend' and baseline.parent.name=='ReferenceV34'
assert hashlib.sha256(baseline.read_bytes()).hexdigest()=='1c194fbdad08e27295e5b67e04e61f14d6e9f282537f7a4fae73c630fe5aeb2b'
assert (source.name=='ReferenceV35' or source.name.startswith('ReferenceV35_')) and 'OneDrive' in str(source);author=source/'Scene_NakajimaKi4.blend';assert not author.exists(),'Never overwrite an existing author checkpoint'
for folder in [source,source/'Textures',source/'Scripts',source/'Evidence',source/'Exports',asset,asset/'Evidence']:folder.mkdir(parents=True,exist_ok=True)
root=bpy.data.objects['NakajimaKi4'];assert root['version']=='20261026ReferenceV34';targets=[bpy.data.objects['Tire_'+side] for side in ['Left','Right']]
helper={};helperPath=repo/'Taierzhuang1938/_blender/Script_NakajimaKi4GeometryAo.py';exec(compile(helperPath.read_text(encoding='utf8'),str(helperPath),'exec'),helper)
tree=ast.parse((repo/'Taierzhuang1938/_blender/Script_NakajimaKi4MainGearUpdate.py').read_text(encoding='utf8'));fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='MeshFingerprint');exec(compile(ast.Module(body=[fn],type_ignores=[]),'Fingerprint','exec'),globals())
before={o.name:MeshFingerprint(o) for o in root.children_recursive if o.type=='MESH' and o not in targets};images={im.name:hashlib.sha256(im.packed_file.data).hexdigest() for im in bpy.data.images if im.packed_file};assert len(images)==38
def ShapeHash(obj):
    mesh=obj.data;digest=hashlib.sha256()
    for collection,attribute,count,kind in [(mesh.vertices,'co',3,'f'),(mesh.loops,'vertex_index',1,'i'),(mesh.polygons,'loop_start',1,'i'),(mesh.polygons,'loop_total',1,'i'),(mesh.corner_normals,'vector',3,'f')]:
        values=array.array(kind,[0])*(len(collection)*count);collection.foreach_get(attribute,values);digest.update(values.tobytes())
    digest.update(helper['AoUvHash'](mesh).encode());digest.update(struct.pack('<16d',*[v for row in obj.matrix_world for v in row]));return digest.hexdigest()
shape={o.name:ShapeHash(o) for o in targets};oldMats={o:list(o.data.materials) for o in targets};hide={o:o.hide_render for o in bpy.context.scene.objects};temporary=[];tempLayers={};size=(2048,1024);started=time.time()
image=bpy.data.images.new('Texture_Ki4TireGeometryAo',width=size[0],height=size[1],alpha=False,float_buffer=True);image.colorspace_settings.name='Non-Color';image.generated_color=(1,1,1,1);image.pixels.foreach_set(np.ones(size[0]*size[1]*4,np.float32))
try:
    for side,obj in enumerate(targets):
        mesh=obj.data;layer=mesh.uv_layers.new(name='Temp_TireAo');tempLayers[obj]=layer
        for i,item in enumerate(layer.data):
            u,v=mesh.uv_layers[0].data[i].uv;item.uv=((8+u*2032)/2048,(8+side*512+v*496)/1024)
        mat=bpy.data.materials.new('Temp_TireAo_'+obj.name);mat.use_nodes=True;temporary.append(mat);nodes=mat.node_tree.nodes;nodes.clear();links=mat.node_tree.links;output=nodes.new('ShaderNodeOutputMaterial');emission=nodes.new('ShaderNodeEmission');ao=nodes.new('ShaderNodeAmbientOcclusion');ao.samples=128;ao.inputs['Distance'].default_value=2.
        uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap';orm=nodes.new('ShaderNodeTexImage');orm.image=next(n.image for n in oldMats[obj][0].node_tree.nodes if n.type=='TEX_IMAGE' and n.image and 'Orm' in n.image.name);split=nodes.new('ShaderNodeSeparateColor');mul=nodes.new('ShaderNodeMath');mul.operation='MULTIPLY';links.new(uv.outputs[0],orm.inputs[0]);links.new(orm.outputs['Color'],split.inputs[0]);links.new(split.outputs['Red'],mul.inputs[0]);links.new(ao.outputs['AO'],mul.inputs[1]);links.new(mul.outputs[0],emission.inputs[0]);links.new(emission.outputs[0],output.inputs[0]);target=nodes.new('ShaderNodeTexImage');target.image=image;nodes.active=target;mesh.materials.clear();mesh.materials.append(mat)
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=1;scene.cycles.device='CPU';scene.cycles.use_denoising=False;scene.render.threads_mode='FIXED';scene.render.threads=min(8,os.cpu_count() or 4);scene.render.bake.use_selected_to_active=False
    opaque=[o for o in root.children_recursive if o.type=='MESH' and o.name!='Surface_FlushRivetHeads' and not helper['AoGlass'](o)];batches=[]
    for obj in targets:
        group=helper['AoMovingGroup'](obj)
        for o in scene.objects:o.hide_render=o not in opaque or helper['AoMovingGroup'](o)!=group
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.context.view_layer.update();tick=time.time();bpy.ops.object.bake(type='EMIT',uv_layer='Temp_TireAo',use_clear=False,margin=6,use_selected_to_active=False);batches.append({'target':obj.name,'group':group,'seconds':time.time()-tick})
finally:
    for obj,value in hide.items():obj.hide_render=value
    for obj,materials in oldMats.items():
        obj.data.materials.clear()
        for mat in materials:obj.data.materials.append(mat)
        obj.data.uv_layers.active_index=0;obj.data.uv_layers[0].active_render=True
    for mat in temporary:bpy.data.materials.remove(mat)

# Independently compare exactly the old observed source triangle probes.
pixels=np.empty(size[0]*size[1]*4,np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape(size[1],size[0],4)
def Sample(uv):
    x=float(uv.x)*size[0]-.5;y=float(uv.y)*size[1]-.5;ix=math.floor(x);iy=math.floor(y);fx=x-ix;fy=y-iy
    return sum(float(pixels[max(0,min(size[1]-1,iy+dy)),max(0,min(size[0]-1,ix+dx)),0])*(fx if dx else 1-fx)*(fy if dy else 1-fy) for dx in [0,1] for dy in [0,1])
oldAudit=json.loads((repo/'tmp/NakajimaKi4/MultiviewV35/Data_RetainedAoAudit.json').read_text());comparisons=[]
for obj in targets:
    prior=next(r for r in oldAudit['rows'] if r['name']==obj.name);mesh=obj.data;mesh.calc_loop_triangles();samples=[]
    for row in prior['samples']:
        tri=mesh.loop_triangles[row['face']];uv=sum((tempLayers[obj].data[i].uv for i in tri.loops),Vector((0,0)))/3;value=Sample(uv);samples.append({**row,'newUv1Source':list(uv),'newAo':value,'newError':value-row['currentGeometryPrediction']})
    errors=np.array([s['newError'] for s in samples]);comparison={'name':obj.name,'oldRms':prior['currentErrorRms'],'oldMax':prior['currentErrorMaxAbs'],'newRms':float(np.sqrt(np.mean(errors*errors))),'newMax':float(max(abs(errors))),'samples':samples};comparisons.append(comparison)
    print(json.dumps({k:v for k,v in comparison.items() if k!='samples'}),flush=True)
result={'state':'CurrentTireAoRebakeRayCompared_AuthorNotSavedYet','sourceBaselineSha256':hashlib.sha256(baseline.read_bytes()).hexdigest(),'size':size,'batches':batches,'comparisons':comparisons,'seconds':time.time()-started}
(asset/'Evidence/Data_TireAoBakeTrial.json').write_text(json.dumps(result,indent=2))
assert all(r['newRms']<r['oldRms']*.75 and r['newMax']<r['oldMax']*.75 for r in comparisons),'Do not save a rebake that fails to improve independent current-geometry probes'

for obj in targets:
    values=np.empty(len(tempLayers[obj].data)*2,np.float32);tempLayers[obj].data.foreach_get('uv',values);obj.data.uv_layers['GeometryAO'].data.foreach_set('uv',values);obj.data.uv_layers.remove(tempLayers[obj]);obj.data.uv_layers.active_index=0;obj.data.uv_layers[0].active_render=True
material=oldMats[targets[0]][0].copy();material.name='Material_Ki4TireWeatheredRubber'
for obj in targets:obj.data.materials[0]=material
class Scoped:children_recursive=targets
helper['BindGeometryAo'](Scoped,image)
assert shape=={o.name:ShapeHash(o) for o in targets}
assert before=={name:MeshFingerprint(bpy.data.objects[name]) for name in before}
assert all(hashlib.sha256(bpy.data.images[name].packed_file.data).hexdigest()==value for name,value in images.items())
image.filepath_raw=str(source/'Textures/Texture_Ki4TireGeometryAo.png');image.file_format='PNG';image.save();image.pack();root['version']='20261026ReferenceV35';root['tireAoImage']=image.name;root['tireAoScope']='Actual current same-wheel-group AO,128ray Cycles,2m range; unique analytic primary-coordinate charts. Tire geometry/primaryUV/normals/material base/normal/MR and38 prior images retained. Whole fidelity remains pending.'
scriptPath=repo/'Taierzhuang1938/_blender/Script_NakajimaKi4TireAo.py';text=bpy.data.texts.get(scriptPath.name) or bpy.data.texts.new(scriptPath.name);text.clear();text.write(scriptPath.read_text(encoding='utf8'));text.use_fake_user=True;(source/'Scripts'/scriptPath.name).write_text(scriptPath.read_text(encoding='utf8'))
bpy.ops.wm.save_as_mainfile(filepath=str(author))
bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
for obj in targets+[bpy.data.objects['Pivot_WheelLeft'],bpy.data.objects['Pivot_WheelRight']]:obj.select_set(True)
bpy.context.view_layer.objects.active=root;patch=asset/'Model_TireHighPatch.glb';bpy.ops.export_scene.gltf(filepath=str(patch),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_extras=True,export_texcoords=True,export_normals=True,export_tangents=True,export_animations=False,export_cameras=False,export_lights=False)
result.update({'state':'ActualCurrentTireAoBaked_NewAuthorSaved_WholeFidelityPending','source':str(author),'sourceSha256':hashlib.sha256(author.read_bytes()).hexdigest(),'imageSha256':hashlib.sha256(pathlib.Path(image.filepath_raw).read_bytes()).hexdigest(),'patchSha256':hashlib.sha256(patch.read_bytes()).hexdigest(),'unchangedSourceMeshes':before,'tireShapeUv0NormalHashes':shape,'originalPackedImages':images,'geometryAndPrimaryUvNormalsUnchanged':True,'sourceMeshCount':len(before)+2,'packedImages':39,'chart':{'width':2048,'height':1024,'uSource':[8/2048,2032/2048],'vSourceOffset':[8/1024,520/1024],'vSourceScale':496/1024},'scope':root['tireAoScope']})
for folder in [asset/'Evidence',source/'Evidence']:(folder/'Data_TireAoHigh.json').write_text(json.dumps(result,indent=2))
print('FINAL '+json.dumps({k:v for k,v in result.items() if k not in ['comparisons','unchangedSourceMeshes','originalPackedImages']}),flush=True)
