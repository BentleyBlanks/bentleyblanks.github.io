"""Rebuild the V7 high cloth study; no low-poly reduction or game overwrite."""
import bpy,runpy,json
from pathlib import Path

scene=bpy.context.scene
assert scene.get('BlenderMcpTask')=='SichuanBlanketPack'
repo=Path(scene['SichuanPackRepository']);folder=repo/'Taierzhuang1938/_blender'
runpy.run_path(str(folder/'Script_SichuanHighStudyV7.py'))
runpy.run_path(str(folder/'Script_SichuanHighClothV7.py'))
scene=bpy.context.scene;sim=bpy.data.objects['StudyV7_FrontLeafSimulation']
for frame in range(2,52):
    scene.frame_set(frame);bpy.context.view_layer.update()
    evaluated=sim.evaluated_get(bpy.context.evaluated_depsgraph_get());evaluated.to_mesh();evaluated.to_mesh_clear()
scene['HighClothNextFrame']=52
runpy.run_path(str(folder/'Script_SichuanHighClothFreezeV7.py'))
runpy.run_path(str(folder/'Script_SichuanHighClothFinishV7.py'))
runpy.run_path(str(folder/'Script_SichuanHighSecondaryClothV7.py'))
scene['SichuanPackStage']='V7HighClothRefinementDelivered'
scene['HighV7SilhouetteFeedback']='User: outline is closer; continue natural cloth folds'
paths=list(folder.glob('Script_SichuanHigh*V7.py'))
paths.extend(folder/name for name in ('Script_SichuanBlanketPackBake.py','Script_SichuanSoftBundleV6.py','Script_SichuanPackBinding.py','Script_SichuanCivilianJacket.py','Script_SichuanFabricMaterial.py','Script_SichuanPackAttachments.py'))
paths.extend(repo/'Taierzhuang1938/_import'/name for name in ('Script_SichuanPackReferenceCloth.py','Script_SichuanStrawStudy.py','Script_SichuanFabricStudy.py'))
for path in sorted(paths):
    text=bpy.data.texts.get(path.name) or bpy.data.texts.new(path.name);text.clear();text.write(path.read_text(encoding='utf-8-sig'))
for image in bpy.data.images:
    if image.users and image.source=='FILE' and not image.packed_file:image.pack()
source=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/SichuanBlanketPack/HighV7')
bpy.ops.wm.save_as_mainfile(filepath=str(source/'Scene_SichuanHighClothV7.blend'))
print('HIGH_CLOTH_BUILD_SAVED',bpy.data.filepath)
