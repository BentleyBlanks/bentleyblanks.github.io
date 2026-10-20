"""Bake the V6 study separately from the rejected production model."""
import bpy,runpy,json,shutil
from pathlib import Path
repo=Path(bpy.context.scene['SichuanPackRepository']);project=repo/'Taierzhuang1938';review=repo/'tmp/SichuanBlanketPack/Review/V6Bake'
review.mkdir(exist_ok=True);fake=review/'Project';model=fake/'Model/SichuanBlanketPack';imports=fake/'_import/SichuanBlanketPack';model.mkdir(parents=True,exist_ok=True);imports.mkdir(parents=True,exist_ok=True)
shutil.copy2(project/'Model/SichuanBlanketPack/Data_SichuanBlanketPackTextures.json',model/'Data_SichuanBlanketPackTextures.json')
shutil.copy2(project/'_import/SichuanBlanketPack/Data_SichuanBlanketPackTextureBake.json',imports/'Data_SichuanBlanketPackTextureBake.json')
shutil.copy2(project/'_import/Script_SichuanPackSurfaceMaps.py',fake/'_import/Script_SichuanPackSurfaceMaps.py')
root=bpy.data.objects['Pack_Root'];high=bpy.data.objects['Study_SoftBundleHigh']
Bake=runpy.run_path(str(project/'_blender/Script_SichuanPackSurfaceBake.py'))['BakeSurfaces']
Bake(root,fake,review,highSource=high,fabricVersion='V06')
bpy.ops.object.select_all(action='DESELECT')
for obj in [root,*root.children_recursive]:obj.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.export_scene.gltf(filepath=str(review.parent/'Model_SichuanV6Pbr.glb'),export_format='GLB',use_selection=True,export_yup=True,export_tangents=True,export_extras=True)
for image in bpy.data.images:
    if image.users and image.source=='FILE' and not image.packed_file:image.pack()
bpy.context.scene['SichuanPackStage']='V6ReferenceRefinement'
bpy.ops.wm.save_as_mainfile(filepath='C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/SichuanBlanketPack/StudyV6/Scene_SichuanBlanketPackV6.blend')
print('V6_STUDY_PBR_COMPLETE')
