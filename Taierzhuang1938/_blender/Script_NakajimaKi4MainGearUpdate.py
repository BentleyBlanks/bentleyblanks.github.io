"""Hash-bound V25 author update for a separate main-gear gray candidate.

Run through Script_BlenderMcp, using a NEW external author copy. The reviewed
V25 source/export remains immutable. This is not a PBR/AO rebake recipe.
"""
import bpy, pathlib, os, json, hashlib, array, struct

scriptPath=pathlib.Path(globals().get('__file__',str(pathlib.Path(os.environ['KI4_ASSET_ROOT']).resolve().parents[2]/'Taierzhuang1938/_blender/Script_NakajimaKi4MainGearUpdate.py'))).resolve()
repo=scriptPath.parents[2]
source=pathlib.Path(os.environ['KI4_SOURCE_ROOT']).resolve()
asset=pathlib.Path(os.environ['KI4_ASSET_ROOT']).resolve()
author=source/'Scene_NakajimaKi4.blend'
assert pathlib.Path(bpy.data.filepath).resolve()==author
assert source.name=='ReferenceV28' and 'OneDrive' in str(source)
assert hashlib.sha256(author.read_bytes()).hexdigest()=='ad5e1f7902cd0457541af48fbf3aa914916fc4531c12db7a01de7c33d2a39545'
root=bpy.data.objects['NakajimaKi4']
assert root['version']=='20261026ReferenceV25'
assert all(abs(root.matrix_world[i][j]-(1 if i==j else 0))<1e-7 for i in range(4) for j in range(4))
oldNames=['LandingGear_'+direction+'Stay'+side for direction in ['Fore','Aft'] for side in ['Left','Right']]
assert all(name in bpy.data.objects for name in oldNames)

def MeshFingerprint(obj):
    mesh=obj.data;digest=hashlib.sha256()
    for collection,attribute,count,kind in [(mesh.vertices,'co',3,'f'),(mesh.loops,'vertex_index',1,'i'),(mesh.polygons,'loop_start',1,'i'),(mesh.polygons,'loop_total',1,'i')]:
        values=array.array(kind,[0])*(len(collection)*count);collection.foreach_get(attribute,values);digest.update(values.tobytes())
    for uv in mesh.uv_layers:
        digest.update(uv.name.encode());values=array.array('f',[0])*(len(uv.data)*2);uv.data.foreach_get('uv',values);digest.update(values.tobytes())
    normals=array.array('f',[0])*(len(mesh.corner_normals)*3)
    mesh.corner_normals.foreach_get('vector',normals);digest.update(normals.tobytes())
    digest.update(struct.pack('<16d',*[v for row in obj.matrix_world for v in row]))
    digest.update(json.dumps([mat.name for mat in mesh.materials]).encode())
    return digest.hexdigest()

bpy.context.view_layer.update()
before={obj.name:MeshFingerprint(obj) for obj in root.children_recursive if obj.type=='MESH' and obj.name not in oldNames}
imagesBefore={image.name:hashlib.sha256(image.packed_file.data).hexdigest() for image in bpy.data.images if image.packed_file}
material=bpy.data.objects[oldNames[0]].data.materials[0]
oldRecords=[]
for name in oldNames:
    obj=bpy.data.objects[name]
    oldRecords.append({'name':name,'triangles':sum(len(p.vertices)-2 for p in obj.data.polygons)})
    bpy.data.objects.remove(obj,do_unlink=True)
modulePath=scriptPath.with_name('Script_NakajimaKi4MainGear.py')
namespace={};exec(compile(modulePath.read_text(encoding='utf8'),str(modulePath),'exec'),namespace)
result=namespace['BuildMainVLegs'](root,bpy.data.objects['Fuselage_Monocoque'],material,.780,1.810,1.640,.430)
bpy.context.view_layer.update()
after={name:MeshFingerprint(bpy.data.objects[name]) for name in before}
assert after==before, 'Unrelated source mesh, UV, normal, material or transform changed'
assert imagesBefore=={image.name:hashlib.sha256(image.packed_file.data).hexdigest() for image in bpy.data.images if image.packed_file}
assert len(imagesBefore)==37
root['version']='20261026ReferenceV28'
root['geometryUpdateScope']='MainGearVFrameGrayCandidate_PbrAndGeometryAoPending'
root['mainGearBaselineVersion']='20261026ReferenceV25'
root['mainGearBaselineRuntimeSha256']='209eaea8eb4e9a4dbd3a0693b55a15f8d22557ff22d4c10a410f24c43b1e56f9'
root['geometryAoPendingForChangedGeometry']=True
for p in [scriptPath,modulePath]:
    text=bpy.data.texts.get(p.name) or bpy.data.texts.new(p.name);text.clear();text.write(p.read_text(encoding='utf8'));text.use_fake_user=True
source.joinpath('Scripts').mkdir(exist_ok=True)
for p in [scriptPath,modulePath]:source.joinpath('Scripts',p.name).write_text(p.read_text(encoding='utf8'),encoding='utf8')
for area in bpy.context.screen.areas if bpy.context.screen else []:
    if area.type=='VIEW_3D':area.spaces.active.shading.type='SOLID'
bpy.ops.wm.save_as_mainfile(filepath=str(author))
sourceSha=hashlib.sha256(author.read_bytes()).hexdigest()

# Export only new authored geometry. The composition step retains the other
# verified V25 low/high geometry bytes and all existing material image payloads.
newObjects=[bpy.data.objects[name] for name in result['newParts']]
savedMaterials={obj:[mat for mat in obj.data.materials] for obj in newObjects}
gray=bpy.data.materials.new('Material_MainGearGrayStudy');gray.use_nodes=True
bs=gray.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.43,.43,.43,1);bs.inputs['Roughness'].default_value=.72
patchPath=asset/'Model_MainGearPatch.glb'
try:
    bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
    for obj in newObjects:
        obj.select_set(True);obj.data.materials.clear();obj.data.materials.append(gray)
    bpy.context.view_layer.objects.active=root
    bpy.ops.export_scene.gltf(filepath=str(patchPath),export_format='GLB',use_selection=True,export_apply=True,
                              export_yup=True,export_extras=True,export_texcoords=True,export_normals=True,
                              export_tangents=True,export_animations=False,export_cameras=False,export_lights=False)
finally:
    for obj,materials in savedMaterials.items():
        obj.data.materials.clear()
        for mat in materials:obj.data.materials.append(mat)
    bpy.data.materials.remove(gray)
newRecords=[]
for obj in newObjects:
    obj.data.calc_loop_triangles()
    newRecords.append({'name':obj.name,'vertices':len(obj.data.vertices),'triangles':len(obj.data.loop_triangles),'sourceFingerprint':MeshFingerprint(obj)})
record={'state':'ActualMainGearSourceGeometryUpdate_GrayCandidateOnly','baselineSourceSha256':'ad5e1f7902cd0457541af48fbf3aa914916fc4531c12db7a01de7c33d2a39545','sourceSha256':sourceSha,'source':str(author),'patchGlb':str(patchPath),'patchSha256':hashlib.sha256(patchPath.read_bytes()).hexdigest(),'unchangedSourceMeshes':len(before),'allOtherMeshUvNormalTransformHashesRetained':True,'unchangedPackedImages':imagesBefore,'removed':oldRecords,'new':newRecords,'construction':result,'scope':'Source copy only. New V-leg and inferred contacting body fittings; actual V25 other source geometry, UV0/UV1, normals, controls and37 packed images retained exactly. New geometry primary UVs are provisional and geometric AO is pending; no PBR/fidelity acceptance or loaded-gear validation is claimed.'}
for folder in [source/'Evidence',asset/'Evidence']:
    folder.mkdir(exist_ok=True);(folder/'Data_MainGearSourceUpdate.json').write_text(json.dumps(record,indent=2),encoding='utf8')
print(json.dumps({'state':record['state'],'sourceSha256':sourceSha,'unchangedSourceMeshes':len(before),'newPartCount':len(newRecords),'newTriangles':sum(p['triangles'] for p in newRecords),'sourceBodyEyeDistancesM':[r['actualSideEyeSeparationM'] for r in result['records']]}))
