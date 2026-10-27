"""Evaluate the existing6mm sole, separate actual surface AO charts and rebake.

The old Solidify modifier duplicated faceUVs and generated zero-area rimUVs.
Keep its original editable plane/modifier as a hidden author guide. Actual
evaluated geometry, primaryUV, normals and the other927 root meshes are held.
"""
import bpy,os,pathlib,json,hashlib,array,ast,struct,math,time
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
repo=pathlib.Path(os.environ['KI4_REPO_ROOT']).resolve();source=pathlib.Path(os.environ['KI4_SOURCE_ROOT']).resolve();asset=pathlib.Path(os.environ['KI4_ASSET_ROOT']).resolve();baseline=pathlib.Path(bpy.data.filepath)
assert baseline.parent.name=='ReferenceV35' and hashlib.sha256(baseline.read_bytes()).hexdigest()=='3226cd38470225f835f59eb4af6d0ff9ea398c597c26e3e7a90cb90952a11084'
assert (source.name=='ReferenceV36' or source.name.startswith('ReferenceV36_')) and 'OneDrive' in str(source);author=source/'Scene_NakajimaKi4.blend';assert not author.exists()
for folder in [source,source/'Scripts',source/'Textures',source/'Exports',source/'Evidence',asset,asset/'Evidence']:folder.mkdir(parents=True,exist_ok=True)
helper={};p=repo/'Taierzhuang1938/_blender/Script_NakajimaKi4GeometryAo.py';exec(compile(p.read_text(encoding='utf8'),str(p),'exec'),helper)
tree=ast.parse((repo/'Taierzhuang1938/_blender/Script_NakajimaKi4MainGearUpdate.py').read_text(encoding='utf8'));fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='MeshFingerprint');exec(compile(ast.Module(body=[fn],type_ignores=[]),'Fingerprint','exec'),globals())
root=bpy.data.objects['NakajimaKi4'];assert root['version']=='20261026ReferenceV35';obj=bpy.data.objects['TailSkidShoe'];assert [m.type for m in obj.modifiers]==['SOLIDIFY'];assert abs(obj.modifiers[0].thickness-.006)<1e-8;deps=bpy.context.evaluated_depsgraph_get()
def EvaluatedHash(o):
    evaluated=o.evaluated_get(deps);mesh=evaluated.to_mesh(preserve_all_data_layers=True,depsgraph=deps)
    try:
        mesh.calc_loop_triangles();digest=hashlib.sha256()
        for tri in mesh.loop_triangles:
            for vi,li in zip(tri.vertices,tri.loops):digest.update(struct.pack('<8f',*mesh.vertices[vi].co,*mesh.corner_normals[li].vector,*mesh.uv_layers[0].data[li].uv))
        digest.update(struct.pack('<16d',*[v for row in o.matrix_world for v in row]));return digest.hexdigest(),len(mesh.loop_triangles)
    finally:evaluated.to_mesh_clear()
evaluatedBefore=EvaluatedHash(obj);before={o.name:MeshFingerprint(o) for o in root.children_recursive if o.type=='MESH' and o!=obj};oldImages={im.name:hashlib.sha256(im.packed_file.data).hexdigest() for im in bpy.data.images if im.packed_file};assert len(oldImages)==39
guideCollection=bpy.data.collections.get('Source_EditableModifierGuides') or bpy.data.collections.new('Source_EditableModifierGuides')
if not guideCollection.users:bpy.context.scene.collection.children.link(guideCollection)
guide=obj.copy();guide.data=obj.data.copy();guide.parent=None;guide.matrix_world=obj.matrix_world.copy();guide.name='SourceGuide_TailSkidShoe';guide['sourceGuideFor']='TailSkidShoe';guide['scope']='Original4quad plane and6mm Solidify retained for author editing; not part of exported root';guideCollection.objects.link(guide);guide.hide_render=True;guide.hide_viewport=True;guide.hide_set(True)
bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.modifier_apply(modifier=obj.modifiers[0].name);bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();assert EvaluatedHash(obj)==evaluatedBefore,'Applying the existing modifier must retain evaluated triangles/normal/UV0 bytes'
mesh=obj.data;mesh.calc_loop_triangles();assert len(mesh.polygons)==18 and len(mesh.loop_triangles)==36
oldUv1=np.array([v.uv[:] for v in mesh.uv_layers['GeometryAO'].data]);oldAo=bpy.data.images['Texture_Ki4GeometryAo'];oldAoPixels=np.empty(oldAo.size[0]*oldAo.size[1]*4,np.float32);oldAo.pixels.foreach_get(oldAoPixels);oldAoPixels=oldAoPixels.reshape(oldAo.size[1],oldAo.size[0],4)
for index,polygon in enumerate(mesh.polygons):
    points=[mesh.vertices[mesh.loops[k].vertex_index].co for k in polygon.loop_indices];along=max((p-points[0] for p in points[1:]),key=lambda v:v.length_squared).normalized();across=polygon.normal.cross(along).normalized();xy=np.array([[(p-points[0]).dot(along),(p-points[0]).dot(across)] for p in points]);lo=xy.min(0);extent=np.maximum(xy.max(0)-lo,1e-9);origin=np.array([(index%6)*512/6+8,(index//6)*512/3+8]);dimensions=np.array([512/6-16,512/3-16])
    for k,value in zip(polygon.loop_indices,(xy-lo)/extent*dimensions+origin):mesh.uv_layers['GeometryAO'].data[k].uv=value/512
original=list(mesh.materials);originalHide={o:o.hide_render for o in bpy.context.scene.objects};image=bpy.data.images.new('Texture_Ki4ShoeGeometryAo',width=512,height=512,alpha=False,float_buffer=True);image.colorspace_settings.name='Non-Color';image.generated_color=(1,1,1,1);image.pixels.foreach_set(np.ones(512*512*4,np.float32));temporary=bpy.data.materials.new('Temp_ShoeAo');temporary.use_nodes=True;nodes=temporary.node_tree.nodes;nodes.clear();links=temporary.node_tree.links;output=nodes.new('ShaderNodeOutputMaterial');emission=nodes.new('ShaderNodeEmission');ao=nodes.new('ShaderNodeAmbientOcclusion');ao.samples=128;ao.inputs['Distance'].default_value=2.;uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap';orm=nodes.new('ShaderNodeTexImage');ormImage=next(n.image for n in original[0].node_tree.nodes if n.type=='TEX_IMAGE' and n.image and 'Orm' in n.image.name);orm.image=ormImage;separate=nodes.new('ShaderNodeSeparateColor');multiply=nodes.new('ShaderNodeMath');multiply.operation='MULTIPLY';links.new(uv.outputs[0],orm.inputs[0]);links.new(orm.outputs['Color'],separate.inputs[0]);links.new(separate.outputs['Red'],multiply.inputs[0]);links.new(ao.outputs['AO'],multiply.inputs[1]);links.new(multiply.outputs[0],emission.inputs[0]);links.new(emission.outputs[0],output.inputs[0]);target=nodes.new('ShaderNodeTexImage');target.image=image;nodes.active=target;mesh.materials.clear();mesh.materials.append(temporary)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=1;scene.cycles.device='CPU';scene.cycles.use_denoising=False;scene.render.threads_mode='FIXED';scene.render.threads=min(8,os.cpu_count() or 4);scene.render.bake.use_selected_to_active=False;started=time.time()
opaque=[o for o in root.children_recursive if o.type=='MESH' and o.name!='Surface_FlushRivetHeads' and not helper['AoGlass'](o) and helper['AoMovingGroup'](o)=='Fixed']
try:
    for o in scene.objects:o.hide_render=o not in opaque
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.context.view_layer.update();bpy.ops.object.bake(type='EMIT',uv_layer='GeometryAO',use_clear=False,margin=4,use_selected_to_active=False)
finally:
    for o,value in originalHide.items():o.hide_render=value
    mesh.materials.clear()
    for mat in original:mesh.materials.append(mat)
    bpy.data.materials.remove(temporary)

# Use actual evaluated occluders, including the retained bevels and6mm sole.
vertices=[];faces=[]
for other in opaque:
    evaluated=other.evaluated_get(deps);part=evaluated.to_mesh(preserve_all_data_layers=True,depsgraph=deps)
    try:
        part.calc_loop_triangles();offset=len(vertices);vertices.extend(other.matrix_world@v.co for v in part.vertices);faces.extend([[offset+i for i in t.vertices] for t in part.loop_triangles])
    finally:evaluated.to_mesh_clear()
bvh=BVHTree.FromPolygons(vertices,faces,all_triangles=True);pixels=np.empty(512*512*4,np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape(512,512,4);ormPixels=np.empty(ormImage.size[0]*ormImage.size[1]*4,np.float32);ormImage.pixels.foreach_get(ormPixels);ormPixels=ormPixels.reshape(ormImage.size[1],ormImage.size[0],4)
def Sample(field,uv):
    h,w=field.shape[:2];x=(uv[0]%1)*w-.5;y=(uv[1]%1)*h-.5;ix=math.floor(x);iy=math.floor(y);fx=x-ix;fy=y-iy;return sum(float(field[(iy+dy)%h,(ix+dx)%w,0])*(fx if dx else 1-fx)*(fy if dy else 1-fy) for dx in [0,1] for dy in [0,1])
rows=[];normalMatrix=obj.matrix_world.to_3x3().inverted().transposed()
for ti,tri in enumerate(mesh.loop_triangles):
    point=sum((obj.matrix_world@mesh.vertices[i].co for i in tri.vertices),Vector())/3;normal=(normalMatrix@sum((mesh.corner_normals[i].vector for i in tri.loops),Vector())).normalized();along=(Vector((1,0,0))-normal*normal.x).normalized() if abs(normal.x)<.95 else (Vector((0,1,0))-normal*normal.y).normalized();across=normal.cross(along);visible=0
    for k in range(256):
        radius=math.sqrt((k+.5)/256);angle=2*math.pi*((k*.6180339887498949)%1);direction=along*(radius*math.cos(angle))+across*(radius*math.sin(angle))+normal*math.sqrt(1-radius*radius);visible+=bvh.ray_cast(point+normal*.00003,direction,2.)[0] is None
    uv1=sum((mesh.uv_layers['GeometryAO'].data[i].uv for i in tri.loops),Vector((0,0)))/3;uv0=sum((mesh.uv_layers[0].data[i].uv for i in tri.loops),Vector((0,0)))/3;oldUv=oldUv1[list(tri.loops)].mean(0);expected=visible/256*Sample(ormPixels,uv0);actual=Sample(pixels,uv1);old=Sample(oldAoPixels,oldUv);rows.append({'face':ti,'pointBlenderM':list(point),'actual':actual,'old':old,'independent256RayPrediction':expected,'error':actual-expected,'oldError':old-expected})
errors=np.array([r['error'] for r in rows]);oldErrors=np.array([r['oldError'] for r in rows]);stats={'rms':float(np.sqrt(np.mean(errors*errors))),'maxAbs':float(max(abs(errors))),'oldRms':float(np.sqrt(np.mean(oldErrors*oldErrors))),'oldMaxAbs':float(max(abs(oldErrors)))};print(json.dumps(stats),flush=True);(asset/'Evidence/Data_ShoeAoTrial.json').write_text(json.dumps({'stats':stats,'rows':rows},indent=2));assert stats['rms']<.04 and stats['maxAbs']<.15 and stats['rms']<stats['oldRms']*.75
material=original[0].copy();material.name='Material_Ki4ShoeOxidizedSteel';mesh.materials[0]=material
class Scoped:children_recursive=[obj]
helper['BindGeometryAo'](Scoped,image);mesh.uv_layers.active_index=0;mesh.uv_layers[0].active_render=True;assert EvaluatedHash(obj)==evaluatedBefore;assert before=={name:MeshFingerprint(bpy.data.objects[name]) for name in before};assert all(hashlib.sha256(bpy.data.images[name].packed_file.data).hexdigest()==value for name,value in oldImages.items())
image.filepath_raw=str(source/'Textures/Texture_Ki4ShoeGeometryAo.png');image.file_format='PNG';image.save();image.pack();root['version']='20261027ReferenceV36';root['shoeAoImage']=image.name;root['shoeAoScope']='Retained6mm sole evaluated into explicit mesh; original editable plane/modifier kept outside root as hidden guide. Separate18 physical AO charts, actual current fixed-group128ray2m bake. Actual evaluated geometry/UV0/normals unchanged; whole fidelity pending.'
script=repo/'Taierzhuang1938/_blender/Script_NakajimaKi4ShoeAo.py';text=bpy.data.texts.get(script.name) or bpy.data.texts.new(script.name);text.clear();text.write(script.read_text(encoding='utf8'));text.use_fake_user=True;(source/'Scripts'/script.name).write_text(script.read_text(encoding='utf8'));bpy.ops.wm.save_as_mainfile(filepath=str(author));bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);root.select_set(True);bpy.context.view_layer.objects.active=root;patch=asset/'Model_ShoeHighPatch.glb';bpy.ops.export_scene.gltf(filepath=str(patch),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_extras=True,export_texcoords=True,export_normals=True,export_tangents=True,export_animations=False,export_cameras=False,export_lights=False)
result={'state':'ActualShoeAoRepaired_NewAuthorSaved_WholePending','sourceBaselineSha256':'3226cd38470225f835f59eb4af6d0ff9ea398c597c26e3e7a90cb90952a11084','sourceSha256':hashlib.sha256(author.read_bytes()).hexdigest(),'imageSha256':hashlib.sha256(pathlib.Path(image.filepath_raw).read_bytes()).hexdigest(),'patchSha256':hashlib.sha256(patch.read_bytes()).hexdigest(),'evaluatedShoeShapePrimaryUvNormalHash':evaluatedBefore[0],'evaluatedTriangles':evaluatedBefore[1],'unchangedSourceMeshes':before,'originalPackedImages':oldImages,'stats':stats,'rows':rows,'chartCount':18,'resolution':[512,512],'editableModifierGuide':guide.name,'seconds':time.time()-started,'scope':root['shoeAoScope']}
for folder in [source/'Evidence',asset/'Evidence']:(folder/'Data_ShoeAoHigh.json').write_text(json.dumps(result,indent=2))
print('FINAL '+json.dumps({k:v for k,v in result.items() if k not in ['rows','unchangedSourceMeshes','originalPackedImages']}),flush=True)
