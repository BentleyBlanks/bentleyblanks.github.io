"""V10 soft cloth, worn tape and compressed straw; independent high source."""
import bpy, json, runpy
from pathlib import Path

scene = bpy.context.scene
assert scene.get('BlenderMcpTask') == 'SichuanBlanketPack'
base = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/SichuanBlanketPack')
assert Path(bpy.data.filepath).resolve().is_relative_to(base.resolve())
repo = Path(scene['SichuanPackRepository']); folder = repo/'Taierzhuang1938/_blender'
root = bpy.data.objects['Pack_Root']
cloth = runpy.run_path(str(folder/'Script_SichuanSoftWearGeometryV10.py'))['ApplySoftWearGeometry'](root)
palette = runpy.run_path(str(folder/'Script_SichuanWornMaterialsV10.py'))['ApplySoftWornMaterials'](root, repo/'Taierzhuang1938/Model/SichuanBlanketPack')
straw = runpy.run_path(str(folder/'Script_SichuanStrawCompressionV10.py'))['ApplyStrawCompression'](root)
cutGrass = runpy.run_path(str(folder/'Script_SichuanCutGrassBundlesV10.py'))['ApplyCutGrassBundles'](root)
innerTuck = runpy.run_path(str(folder/'Script_SichuanMatInnerTuckV10.py'))['ApplyMatInnerTuck'](root)
sandalWear = runpy.run_path(str(folder/'Script_SichuanSandalWearV10.py'))['ApplySandalWear'](root)

# Attach new wear to the evaluated shallow folds, while retaining editable
# shape keys on the source objects instead of freezing their original Basis.
swapped = []
depsgraph = bpy.context.evaluated_depsgraph_get()
try:
    for name in ('StudyV7_RelaxedFrontLeaf', 'Pack_ContinuousClothStrap'):
        obj = bpy.data.objects[name]
        visible = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph)
        swapped.append((obj, obj.data, visible)); obj.data = visible
    wear = runpy.run_path(str(folder/'Script_SichuanWearGeometryV9.py'))['ApplyWearGeometry'](root)
finally:
    for obj, original, temporary in reversed(swapped):
        obj.data = original
        if temporary.users == 0: bpy.data.meshes.remove(temporary)
scene['SichuanPackStage'] = 'V10SoftWearReferenceReview'
root['Stage'] = 'V10 soft old cotton, tape creases and compressed roll'
source = base/'HighV10'; source.mkdir(parents=True, exist_ok=True)
for path in list(folder.glob('Script_Sichuan*V10.py'))+list((repo/'Taierzhuang1938/_import').glob('Script_Sichuan*V10.py')):
    text = bpy.data.texts.get(path.name) or bpy.data.texts.new(path.name)
    text.clear(); text.write(path.read_text(encoding='utf-8-sig'))
for image in bpy.data.images:
    if image.users and image.source == 'FILE' and not image.packed_file: image.pack()
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(source/'Scene_SichuanPackSoftWearV10.blend'))
report = {'stage': scene['SichuanPackStage'], 'sourceBlend': bpy.data.filepath,
          'clothRelief': cloth, 'strawCompression': straw, 'cutGrass': cutGrass,
          'innerTuck': innerTuck, 'sandalWear': sandalWear, 'wear': wear,
          'materialCount': len(palette), 'visualApproval': False, 'gameExportCompleted': False}
for path in (source/'Data_ReferenceRefinementV10.json', repo/'tmp/SichuanBlanketPack/Review/Data_V10Refinement.json'):
    path.write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
print('V10_SOURCE_SAVED', json.dumps(report))
