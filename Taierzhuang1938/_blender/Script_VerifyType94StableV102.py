"""Saved author frames, complete packed PBR, and strict edit rejection."""
import bpy,hashlib,importlib.util,json,os,struct
from pathlib import Path
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=Path(os.environ.get('TYPE94_STABLE_ROOT',str(base/'SurfaceV102')));data=json.loads((root/'Acceptance/Data_StableHighV102.json').read_text());assert not bpy.data.filepath
spec=importlib.util.spec_from_file_location('Stable102Guard',Path(__file__).with_name('Script_Type94StableExportV102.py'));exporter=importlib.util.module_from_spec(spec);spec.loader.exec_module(exporter);checks=[]
def Check(value,label):checks.append(dict(passed=bool(value),check=label))
Check(hashlib.sha256(Path(data['sourceBlend']).read_bytes()).hexdigest()==data['sourceBlendSha256'],'Saved source identity');bpy.ops.wm.open_mainfile(filepath=data['sourceBlend']);Check(exporter.TEXT_NAME in bpy.data.texts,'Authored frames retained inside saved source')
cache=json.loads(bpy.data.texts[exporter.TEXT_NAME].as_string());Check(cache['referenceSha256']==data['reference']['sha256'],'Author frames tied to the actual material reference')
for role,size in [('Paint',4096),('Track',2048),('Steel',2048),('Rubber',1024)]:
    tree=bpy.data.materials['Material_Type94'+role].node_tree
    for channel in ['Base','Orm','Normal']:
        image=tree.nodes['Baked '+channel].image;Check(bool(image.packed_file)and tuple(image.size)==(size,size)and image.colorspace_settings.name==('sRGB'if channel=='Base'else'Non-Color'),role+channel+' complete packed source image')
payload=Path(data['exports'][0]['file']).read_bytes();doc,binary,access=exporter.Read(payload);offset=28+struct.unpack_from('<I',payload,12)[0];primitive=next(p for m in doc['meshes']for p in m['primitives']if'normalTexture'in doc['materials'][p['material']]);vertex=int(access(primitive['indices']).ravel()[0])
for attribute in ['POSITION','NORMAL','TEXCOORD_0']:
    a=doc['accessors'][primitive['attributes'][attribute]];view=doc['bufferViews'][a['bufferView']];width=dict(POSITION=3,NORMAL=3,TEXCOORD_0=2)[attribute];where=offset+view.get('byteOffset',0)+a.get('byteOffset',0)+vertex*view.get('byteStride',width*4);trial=bytearray(payload);value=struct.unpack_from('<f',trial,where)[0];struct.pack_into('<f',trial,where,value+.001);file=root/'Acceptance'/('Rejected_EditProbe'+attribute+'V102.glb');file.write_bytes(trial);rejected=False
    try:exporter.RestoreFrames(file)
    except AssertionError as error:rejected='Authored tangent cache invalid after surface edit'in str(error)
    Check(rejected,'Changed '+attribute+' is rejected before author-frame substitution')
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=data['exports'][0]['file']);Check(len(bpy.data.objects)==296 and sum(o.type=='MESH'for o in bpy.data.objects)==240,'Actual stable GLB imports all240meshes/296nodes');Check(sum(i.source=='FILE'and bool(i.packed_file)for i in bpy.data.images)==12,'Actual stable GLB imports all twelve packed maps')
report=dict(passed=all(r['passed']for r in checks),checks=checks,sha256=data['exports'][0]['sha256'],sourceBlendSha256=data['sourceBlendSha256'],authorTangentReferenceSha256=cache['referenceSha256'],scope='Self-contained author frames and PBR; strict source edit rejection, actual export import. Full reference shape remains a separate requirement.')
(root/'Acceptance/Data_StableSourceAuditV102.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(passed=report['passed'],checks=len(checks),failed=[r for r in checks if not r['passed']])));assert report['passed']
