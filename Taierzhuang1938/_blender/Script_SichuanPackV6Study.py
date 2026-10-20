"""V6 review build; production V5 assets stay untouched until comparison."""
import bpy,json,runpy
from pathlib import Path
repo=Path(bpy.context.scene['SichuanPackRepository']);project=repo/'Taierzhuang1938';review=repo/'tmp/SichuanBlanketPack/Review'
code=(project/'_blender/Script_SichuanBlanketPackBake.py').read_text(encoding='utf-8')
exec(code[:code.index('# Persist the exact rebuild recipe')],globals())
triangles={}
for root in (bundle,bindingRoot,jacketRoot,*attachments):
    count=0
    for obj in [root,*root.children_recursive]:
        if obj.type=='MESH':obj.data.calc_loop_triangles();count+=len(obj.data.loop_triangles)
    triangles[root.name]=count
bpy.ops.object.select_all(action='DESELECT')
for obj in [packRoot,*packRoot.children_recursive]:obj.select_set(True)
bpy.context.view_layer.objects.active=packRoot
bpy.ops.export_scene.gltf(filepath=str(reviewPath/'Model_SichuanV6Geometry.glb'),export_format='GLB',use_selection=True,export_yup=True)
for image in bpy.data.images:
    if image.users and image.source=='FILE' and not image.packed_file:image.pack()
for filename in ('Script_SichuanSoftBundleV6.py','Script_SichuanPackBinding.py','Script_SichuanPackAttachments.py','Script_SichuanFabricMaterial.py'):
    text=bpy.data.texts.get(filename) or bpy.data.texts.new(filename);text.clear();text.write((projectPath/'_blender'/filename).read_text(encoding='utf-8'))
bpy.ops.wm.save_as_mainfile(filepath=str(sourcePath/'StudyV6/Scene_SichuanBlanketPackV6.blend'))
(reviewPath/'Data_V6Build.json').write_text(json.dumps({'triangles':triangles,'totalTriangles':sum(triangles.values()),'stage':'geometryStudy','budgetTriangles':10000},indent=2)+'\n')
print('V6_BUILD',json.dumps(triangles),'TOTAL',sum(triangles.values()))
