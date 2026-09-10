"""Export only the isolated HanYang hand mesh; never create animation clips."""
import bpy
import json
import struct
from pathlib import Path

scene=bpy.context.scene
assert scene.get('task')=='HanYangHands_20260910'
projectRoot=Path(FPS_PROJECT_ROOT)
rig=next(o for o in scene.objects if o.type=='ARMATURE')
sourceMesh=bpy.data.objects['Mesh_FpsArmsNraSkeletal01']
rig.data.pose_position='REST'
bpy.ops.object.select_all(action='DESELECT')
temporary=sourceMesh.copy();temporary.data=sourceMesh.data.copy()
for attribute in list(temporary.data.color_attributes):temporary.data.color_attributes.remove(attribute)
scene.collection.objects.link(temporary)
temporary.hide_viewport=False;temporary.hide_set(False)
bpy.context.view_layer.objects.active=temporary;temporary.select_set(True)
bpy.ops.object.shape_key_remove(all=True,apply_mix=True)
# Subdivide the skin surface, leaving the long sleeves at their existing budget.
sleeve=temporary.copy();sleeve.data=temporary.data.copy();scene.collection.objects.link(sleeve)
for obj,keepSkin in [(temporary,True),(sleeve,False)]:
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_mode(type='FACE');bpy.ops.mesh.select_all(action='DESELECT');bpy.ops.object.mode_set(mode='OBJECT')
    for polygon in obj.data.polygons:polygon.select=(polygon.material_index!=1)!=keepSkin
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.delete(type='FACE');bpy.ops.object.mode_set(mode='OBJECT')
    if not keepSkin:
        for modifier in list(obj.modifiers):
            if modifier.type=='SUBSURF':obj.modifiers.remove(modifier)
temporary.select_set(True);sleeve.select_set(True)
rig.select_set(True)
if bpy.data.objects.get('Mesh_HanYangCuffs'):bpy.data.objects['Mesh_HanYangCuffs'].select_set(True)
outputPath=projectRoot/'Model/Model_FpsHanYangHands.glb'
try:
    bpy.ops.export_scene.gltf(filepath=str(outputPath),export_format='GLB',use_selection=True,
        export_animations=False,export_rest_position_armature=True,export_apply=True,
        export_extras=True,export_image_format='WEBP',export_image_quality=85)
finally:
    bpy.data.objects.remove(temporary,do_unlink=True)
    bpy.data.objects.remove(sleeve,do_unlink=True)
    rig.data.pose_position='POSE'
# Source pose and animation metadata belong in the .blend, not the runtime GLB.
# Preserve node extras, including fpsFixedRestLengths, used by the rig bridge.
raw=outputPath.read_bytes();jsonLength=struct.unpack_from('<I',raw,12)[0]
document=json.loads(raw[20:20+jsonLength])
for exportedScene in document.get('scenes',[]):exportedScene.pop('extras',None)
payload=json.dumps(document,separators=(',',':'),ensure_ascii=False).encode('utf-8')
payload+=b' '*((-len(payload))%4)
remaining=raw[20+jsonLength:]
outputPath.write_bytes(struct.pack('<III',0x46546c67,2,20+len(payload)+len(remaining))
    +struct.pack('<II',len(payload),0x4e4f534a)+payload+remaining)
result={'asset':str(outputPath),'bytes':outputPath.stat().st_size,'generatedAnimations':0}
