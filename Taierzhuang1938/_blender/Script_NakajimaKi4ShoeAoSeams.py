"""Stitch one physical AO field across the existing smooth sole chart edges.

Only512AO pixels change; no geometry/UV/material-role rebake. A new author is
saved, keeping the V36 unstiched source and all other39 image payloads intact.
"""
import bpy,os,pathlib,json,hashlib,ast,array,struct,math
import numpy as np
from mathutils import Vector
repo=pathlib.Path(os.environ['KI4_REPO_ROOT']).resolve();source=pathlib.Path(os.environ['KI4_SOURCE_ROOT']).resolve();asset=pathlib.Path(os.environ['KI4_ASSET_ROOT']).resolve();baseline=pathlib.Path(bpy.data.filepath)
assert baseline.parent.name=='ReferenceV36' and hashlib.sha256(baseline.read_bytes()).hexdigest()=='23e0ffb5a21086e794d01d74171c9453e810392ae5922e20f271f5de9e0eada6'
assert (source.name=='ReferenceV37' or source.name.startswith('ReferenceV37_')) and 'OneDrive' in str(source);author=source/'Scene_NakajimaKi4.blend';assert not author.exists()
for folder in [source,source/'Textures',source/'Scripts',source/'Evidence',source/'Exports',asset,asset/'Evidence']:folder.mkdir(parents=True,exist_ok=True)
root=bpy.data.objects['NakajimaKi4'];assert root['version']=='20261027ReferenceV36';obj=bpy.data.objects['TailSkidShoe'];im=bpy.data.images['Texture_Ki4ShoeGeometryAo'];assert hashlib.sha256(im.packed_file.data).hexdigest()=='57db09233cd0d7fb6cb2cb57983f1e931e917b89c207703dcc4f39d196b201ab'
tree=ast.parse((repo/'Taierzhuang1938/_blender/Script_NakajimaKi4MainGearUpdate.py').read_text(encoding='utf8'));fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='MeshFingerprint');exec(compile(ast.Module(body=[fn],type_ignores=[]),'Fingerprint','exec'),globals());before={o.name:MeshFingerprint(o) for o in root.children_recursive if o.type=='MESH'};images={image.name:hashlib.sha256(image.packed_file.data).hexdigest() for image in bpy.data.images if image.packed_file and image!=im};assert len(before)==928 and len(images)==39
pixels=np.empty(512*512*4,np.float32);im.pixels.foreach_get(pixels);pixels=pixels.reshape(512,512,4);original=pixels.copy();helper={};path=repo/'Taierzhuang1938/_blender/Script_NakajimaKi4AoSeams.py';helper['__file__']=str(path);exec(compile(path.read_text(encoding='utf8'),str(path),'exec'),helper);repair=helper['StitchAoSeams']([obj],pixels,protectedStrip=0.)
assert repair['edgePairs']==36 and repair['maxPairDifferenceAfter']<=1/255
prior=json.loads((repo/'tmp/NakajimaKi4/ReferenceV36/Evidence/Data_ShoeAoHigh.json').read_text());mesh=obj.data;mesh.calc_loop_triangles();rows=[]
for old in prior['rows']:
    tri=mesh.loop_triangles[old['face']];uv=sum((mesh.uv_layers['GeometryAO'].data[i].uv for i in tri.loops),Vector((0,0)))/3;value=float(helper['SampleAoAtlas'](pixels,np.array([uv]))[0]);rows.append({**old,'newStitchedAo':value,'newError':value-old['independent256RayPrediction']})
errors=np.array([r['newError'] for r in rows]);stats={'rms':float(np.sqrt(np.mean(errors*errors))),'maxAbs':float(max(abs(errors)))};assert stats['rms']<.04 and stats['maxAbs']<.15
assert before=={name:MeshFingerprint(bpy.data.objects[name]) for name in before};assert images=={name:hashlib.sha256(bpy.data.images[name].packed_file.data).hexdigest() for name in images}
if im.packed_file:im.unpack(method='REMOVE')
im.pixels.foreach_set(pixels.ravel());im.update();im.filepath_raw=str(source/'Textures/Texture_Ki4ShoeGeometryAo.png');im.file_format='PNG';im.save();im.pack();assert hashlib.sha256(im.packed_file.data).hexdigest()==hashlib.sha256(pathlib.Path(im.filepath_raw).read_bytes()).hexdigest(),'Packed AO must match the actual filtered PNG';root['version']='20261027ReferenceV37';root['shoeAoSeamScope']='Actual V36 baked sole AO, same-material smooth physical edges filtered to one common boundary field; one-byte quantized continuity. Geometry/UV0/UV1/normals and all39 other images retained. Whole fidelity pending.'
script=repo/'Taierzhuang1938/_blender/Script_NakajimaKi4ShoeAoSeams.py';text=bpy.data.texts.get(script.name) or bpy.data.texts.new(script.name);text.clear();text.write(script.read_text(encoding='utf8'));text.use_fake_user=True;(source/'Scripts'/script.name).write_text(script.read_text(encoding='utf8'));bpy.ops.wm.save_as_mainfile(filepath=str(author))
result={'state':'SoleAoPhysicalChartSeamsFiltered_NewAuthorSaved_WholePending','sourceBaselineSha256':'23e0ffb5a21086e794d01d74171c9453e810392ae5922e20f271f5de9e0eada6','sourceSha256':hashlib.sha256(author.read_bytes()).hexdigest(),'imagePath':im.filepath_raw,'imageSha256':hashlib.sha256(im.packed_file.data).hexdigest(),'unchangedSourceMeshFingerprints':before,'original39PackedImageHashes':images,'repair':repair,'stats':stats,'rows':rows,'scope':root['shoeAoSeamScope']}
for folder in [source/'Evidence',asset/'Evidence']:(folder/'Data_ShoeAoSeamsHigh.json').write_text(json.dumps(result,indent=2))
print(json.dumps({k:v for k,v in result.items() if k not in ['rows','unchangedSourceMeshFingerprints','original39PackedImageHashes']}),flush=True)
