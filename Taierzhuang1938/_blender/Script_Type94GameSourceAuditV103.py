"""Actual saved current-game source arrays and authored-frame reexport."""
import bpy,hashlib,importlib.util,json,os,numpy as np
from pathlib import Path
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=Path(os.environ.get('TYPE94_GAME_ROOT',str(base/'GameWearV103')));acc=root/'Acceptance';m=json.loads((acc/'Data_GamePbrV103.json').read_text());transfer=json.loads((acc/'Data_SurfaceTransferV103.json').read_text());assert not bpy.data.filepath and hashlib.sha256(Path(m['sourceBlend']).read_bytes()).hexdigest()==m['sourceBlendSha256'];bpy.ops.wm.open_mainfile(filepath=m['sourceBlend']);assert bpy.context.scene.get('BlenderMcpTask')=='Type94Tankette'
file=Path(__file__).with_name('Script_Type94StableExportV102.py');spec=importlib.util.spec_from_file_location('Game103Export',file);exporter=importlib.util.module_from_spec(spec);spec.loader.exec_module(exporter);cache=json.loads(bpy.data.texts[exporter.TEXT_NAME].as_string());assert cache['referenceSha256']==transfer['low']['sha256'];asset=bpy.data.objects['Type94Tankette'];meshes=sorted([o for o in asset.children_recursive if o.type=='MESH'],key=lambda o:o.name);arrays={};rows=[]
for i,obj in enumerate(meshes):
    mesh=exporter.TriangulatedCopy(obj.data);p=np.array([tuple(v.co)for v in mesh.vertices],dtype=float);t=np.array([tuple(f.vertices)for f in mesh.polygons],dtype=np.int64);arrays['points'+str(i)]=p[:,[0,2,1]]*[1,1,-1];arrays['triangles'+str(i)]=t;rows.append(dict(index=i,name=obj.name,triangles=len(t)));bpy.data.meshes.remove(mesh)
assert len(meshes)==240 and sum(r['triangles']for r in rows)==78716
np.savez_compressed(acc/'Data_LowSourceArraysV103.npz',**arrays);(acc/'Data_LowSourceArraysV103.json').write_text(json.dumps(dict(source=m['sourceBlend'],sourceBlendSha256=m['sourceBlendSha256'],rows=rows),indent=2)+'\n')
for role,size in [('Paint',4096),('Track',2048),('Steel',2048),('Rubber',1024)]:
    tree=bpy.data.materials['Material_Type94'+role].node_tree
    for channel in ['Base','Orm','Normal']:
        image=tree.nodes['Baked '+channel].image;assert image.packed_file and tuple(image.size)==(size,size)and image.colorspace_settings.name==('sRGB'if channel=='Base'else'Non-Color')
    assert abs(tree.nodes['Tangent normal, OpenGL +Y'].inputs['Strength'].default_value-1)<1e-8
bpy.ops.object.select_all(action='DESELECT')
for obj in [asset,*asset.children_recursive]:obj.select_set(True)
reexport=root/'Exports/Model_Type94TanketteGameSourceReexportV103.glb';exporter.ExportGltf(reexport)
report=dict(passed=True,sourceBlendSha256=m['sourceBlendSha256'],sha256=m['sha256'],sourceReexport=str(reexport),sourceReexportSha256=hashlib.sha256(reexport.read_bytes()).hexdigest(),authorFrameReferenceSha256=cache['referenceSha256'],packedPbrImages=12,scope='Actual final saved source, arrays, packed maps and authored-frame export. Continuous bounds require exact current high and low equality to the retained proof pair.')
(acc/'Data_GameSourceReopenV103.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
