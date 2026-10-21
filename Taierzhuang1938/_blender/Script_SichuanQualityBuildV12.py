"""Restore native cloth/grass detail in a separate quality-first source.

The human explicitly withdrew the low-poly requirement on 2026-10-21.
The completed GameV10 build remains a historical backup, not this output.
"""
import bpy,json,runpy,hashlib
from pathlib import Path

scene=bpy.context.scene
assert scene.get('BlenderMcpTask')=='SichuanBlanketPack'
base=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/SichuanBlanketPack')
original=base/'HighV10/Scene_SichuanPackSoftWearV10.blend'
assert Path(bpy.data.filepath).resolve()==original.resolve(),'Open original HighV10 in a completed separate call'
repo=Path(scene['SichuanPackRepository']);folder=repo/'Taierzhuang1938/_blender'
out=repo/'tmp/SichuanBlanketPack/QualityV12';out.mkdir(parents=True,exist_ok=True)
destination=base/'QualityV12/Scene_SichuanPackQualityV12.blend';destination.parent.mkdir(parents=True,exist_ok=True)
originalHash=hashlib.sha256(original.read_bytes()).hexdigest()
bpy.ops.wm.save_as_mainfile(filepath=str(destination))
root=bpy.data.objects['Pack_Root']
if 'TriangleLimit' in root:del root['TriangleLimit']
root['QualityNoDecimation']=True;root['SourceSculptBlend']=str(original)
root['QualityUserDirection']='Restore high-quality native geometry; no low-poly budget; mat winding remains a texture'

# A separate relative key keeps the original sculpt editable while making
# the character-facing contact flat. Existing cotton-wear keys remain on.
body=bpy.data.objects['Pack_Bundle'];body.data.update()
ids={index for face in body.data.polygons if face.normal.y>.98
     and all(abs(body.data.vertices[index].co.y)<=.003 for index in face.vertices)
     for index in face.vertices}
if body.data.shape_keys is None:body.shape_key_add(name='Basis')
basis=body.data.shape_keys.key_blocks[0]
flat=body.shape_key_add(name='QualityFlatBackV12');flat.relative_key=basis
maxMove=0.0
for index in ids:
    maxMove=max(maxMove,abs(float(basis.data[index].co.y)))
    flat.data[index].co.y=0
flat.value=1.0
flatReport={'vertices':len(ids),'maximumSourceYCorrectionM':maxMove,'method':'Independent relative key on strongly rear-facing faces within3mm; original sculpt/basis untouched'}

straw=runpy.run_path(str(folder/'Script_SichuanQualityStrawV12.py'))['PrepareQualityStraw'](root,repo)
jacket=runpy.run_path(str(folder/'Script_SichuanQualityJacketV12.py'))['RefineQualityJacket'](root,repo)
bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
parts={};objects=[]
for part in root.children:
    partRows=[]
    for obj in (part,*part.children_recursive):
        if obj.type!='MESH' or obj.hide_render or obj.get('QualityExportExclude'):continue
        evaluated=obj.evaluated_get(deps);mesh=evaluated.to_mesh()
        try:
            mesh.calc_loop_triangles()
            row={'name':obj.name,'vertices':len(mesh.vertices),'triangles':len(mesh.loop_triangles),
                 'sourceUvLayers':[uv.name for uv in mesh.uv_layers],
                 'materials':[slot.material.name if slot.material else None for slot in obj.material_slots]}
            partRows.append(row);objects.append(row)
        finally:evaluated.to_mesh_clear()
    parts[part.name]={'triangles':sum(row['triangles']for row in partRows),'objects':partRows}
scene['SichuanPackStage']='QualityV12NativeReview';scene['SichuanQualityOutput']=str(out)
for path in folder.glob('Script_SichuanQuality*V12.py'):
    text=bpy.data.texts.get(path.name)or bpy.data.texts.new(path.name);text.clear();text.write(path.read_text(encoding='utf-8-sig'))
bpy.ops.file.pack_all()
bpy.ops.wm.save_mainfile()
assert hashlib.sha256(original.read_bytes()).hexdigest()==originalHash,'Original HighV10 changed'
report={'stage':'NativeQualitySourceBuilt','qualityBlend':str(destination),'originalHighBlend':str(original),
        'originalHighSha256':originalHash,'originalHighUnchanged':True,'noDecimation':True,'triangleBudget':None,
        'totalVisibleTriangles':sum(row['triangles']for row in objects),'visibleMeshes':len(objects),
        'parts':parts,'flatBack':flatReport,'straw':straw,'jacket':jacket,
        'nativeMaterialsPreserved':True,'glbPbrExportPending':True,
        'latestUserInstruction':'Quality first; remove low-poly limitation; retain texture-based mat cross section'}
(out/'Data_QualityNativeV12.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print('QUALITY_NATIVE_SAVED',json.dumps({'file':str(destination),'triangles':report['totalVisibleTriangles'],'meshes':len(objects),'parts':{name:value['triangles']for name,value in parts.items()}}))
