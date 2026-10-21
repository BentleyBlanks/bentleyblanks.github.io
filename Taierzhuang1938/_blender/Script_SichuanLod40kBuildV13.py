"""Build the human-requested <=40k triangle copy from the frozen PBR high."""
import bpy,json,runpy,hashlib
from pathlib import Path

repo=Path(bpy.context.scene.get('SichuanPackRepository',Path.cwd()))
assert (repo/'Taierzhuang1938/_blender').is_dir()
assert bpy.context.scene.get('BlenderMcpTask')=='SichuanBlanketPack'
base=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/SichuanBlanketPack')
source=base/'QualityV12/Exports/Model_SichuanBlanketPackQualityV12.glb'
out=repo/'tmp/SichuanBlanketPack/Lod40kV13';out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_homefile(use_empty=True,use_factory_startup=True)
scene=bpy.context.scene;scene['SichuanPackRepository']=str(repo);scene['BlenderMcpTask']='SichuanBlanketPack'
options={'filepath':str(source)}
if 'merge_vertices' in bpy.ops.import_scene.gltf.get_rna_type().properties:options['merge_vertices']=True
bpy.ops.import_scene.gltf(**options)
high=bpy.data.objects['Pack_Root']
helper=runpy.run_path(str(repo/'Taierzhuang1938/_blender/Script_SichuanQualityLod40kV13.py'))
helper['TagQualityRoles'](high)
objects=[high,*high.children_recursive]
def Depth(obj):
    count=0
    while obj.parent is not None:count+=1;obj=obj.parent
    return count
copies={}
for original in sorted(objects,key=Depth):
    obj=original.copy()
    if original.type=='MESH':obj.data=original.data.copy()
    obj.name='Lod40k_'+original.name
    obj['QualityOriginalName']=original.get('QualityOriginalName',original.name)
    obj['QualityExportOriginalName']=obj['QualityOriginalName']
    scene.collection.objects.link(obj);obj.parent=copies.get(original.parent)
    obj.matrix_world=original.matrix_world.copy();copies[original]=obj
bpy.context.view_layer.update();low=copies[high]
report=helper['BuildQualityLod40k'](low,triangleLimit=40000,reserveTriangles=500,distanceSamples=512)
high.name='HighV12_Pack_Root';low.name='Lod40kV13_Pack_Root'
high['LodReferenceOnly']=True;low['TriangleLimit']=40000
scene['SichuanHighRoot']=high.name;scene['SichuanLowRoot']=low.name
scene['SichuanPackStage']='Lod40kV13NormalTransferPending'
report['highRuntimeSource']={'path':str(source),'bytes':source.stat().st_size,'sha256':hashlib.sha256(source.read_bytes()).hexdigest()}
report['highRoot']=high.name;report['lowRoot']=low.name
(out/'Data_Lod40kGeometryV13.json').write_text(json.dumps(report,indent=2)+'\n')
work=base/'Lod40kV13/Work/Scene_SichuanPackLodWorkV13.blend';work.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(work))
print('LOD40K_BUILT',json.dumps({'triangles':report['totalTriangles'],'partTriangles':report['partTriangles'],'readyForNormalTransfer':report['readyForNormalTransfer'],'source':str(work)}))
