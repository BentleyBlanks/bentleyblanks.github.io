"""Export independently loadable rest-pose glTFs; runtime driver lives in Script_TrainRig.mjs."""
import bpy,json
from pathlib import Path
assetDir=Path(bpy.data.filepath).parent
bpy.context.scene.frame_set(1)
outputs=[]
for kind in ['Locomotive','Gondola']:
    collection=bpy.data.collections['Model_'+kind]
    root=bpy.data.objects['Model_'+kind+'Root']
    oldLocation=root.location.copy()
    root.location.y=0
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    for obj in collection.objects: obj.select_set(True)
    bpy.context.view_layer.objects.active=root
    path=assetDir/('Model_'+kind+'Rig.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_extras=True,export_apply=True,export_yup=True)
    root.location=oldLocation
    outputs.append({'file':path.name,'bytes':path.stat().st_size})
result={'exports':outputs,'note':'Rest-pose GLBs retain mechanical pivots; use Script_TrainRig.mjs for distance-driven motion. Blender project contains live drivers and forward/stop/reverse timeline.'}
