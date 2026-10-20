"""Rebuild V9 in its dedicated source; retain all previous reviewed checkpoints."""
import bpy, runpy, json
from pathlib import Path

scene = bpy.context.scene
assert scene.get('BlenderMcpTask') == 'SichuanBlanketPack'
base = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/SichuanBlanketPack')
assert Path(bpy.data.filepath).resolve().is_relative_to(base.resolve())
repo = Path(scene['SichuanPackRepository']); folder = repo/'Taierzhuang1938/_blender'
root = bpy.data.objects['Pack_Root']
materials = {role: next(m for obj in root.children_recursive if obj.type == 'MESH'
                       for m in obj.data.materials if m and m.get('AtlasRegion') == role
                       and not m.get('WearFiber', False) and not m.get('NarrowTape', False))
             for role in ('straw', 'binding')}
for name in ('Pack_StrawMat', 'Pack_Sandals'):
    obj = bpy.data.objects.get(name)
    if obj:
        for child in reversed(list(obj.children_recursive)): bpy.data.objects.remove(child, do_unlink=True)
        bpy.data.objects.remove(obj, do_unlink=True)
build = runpy.run_path(str(folder/'Script_SichuanStrawHighV9.py'))['BuildStrawHighV9']
mat, sandals = build(root, materials)
patch = runpy.run_path(str(folder/'Script_SichuanRepairPatchV9.py'))['RestoreRepairPatch'](root)
palette = runpy.run_path(str(folder/'Script_SichuanAgedMaterialsV9.py'))['ApplyAgedMaterials'](root, repo/'Taierzhuang1938/Model/SichuanBlanketPack')
button = bpy.data.objects.get('StudyV7_ClothKnotButton')
if button:
    button.location.y = -.014
    button['ReferenceWearV9ButtonReveal'] = True
    if not button.get('ReferenceWearV9ButtonEnlarged', False):
        for vertex in button.data.vertices:
            vertex.co.x = .15735+(vertex.co.x-.15735)*1.22
            vertex.co.z = .124+(vertex.co.z-.124)*1.45
        button.data.update()
        button['ReferenceWearV9ButtonEnlarged'] = True
wear = runpy.run_path(str(folder/'Script_SichuanWearGeometryV9.py'))['ApplyWearGeometry'](root)
root['Stage'] = 'V9 reference wear and straw shape refinement'
root['TriangleBudget'] = 'High model refinement; game reduction pending visual approval'
scene['SichuanPackStage'] = 'V9ReferenceWearReview'
source = base/'HighV9'; source.mkdir(parents=True, exist_ok=True)
for path in list(folder.glob('Script_Sichuan*V9.py'))+[repo/'Taierzhuang1938/_import/Script_SichuanOldCottonV9.py']:
    text = bpy.data.texts.get(path.name) or bpy.data.texts.new(path.name)
    text.clear(); text.write(path.read_text(encoding='utf-8-sig'))
for image in bpy.data.images:
    if image.users and image.source == 'FILE' and not image.packed_file: image.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(source/'Scene_SichuanPackReferenceWearV9.blend'))
report = {'stage': 'V9ReferenceWearReview', 'sourceBlend': bpy.data.filepath,
          'reference': 'User-approved ThreeViewV02', 'patch': patch, 'wear': wear,
          'materials': len(palette), 'visualApproval': False, 'gameAssetReplaced': False}
for path in (source/'Data_ReferenceWearV9.json', repo/'tmp/SichuanBlanketPack/Review/Data_V9Refinement.json'):
    path.write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
print('V9_SOURCE_SAVED', json.dumps(report))
