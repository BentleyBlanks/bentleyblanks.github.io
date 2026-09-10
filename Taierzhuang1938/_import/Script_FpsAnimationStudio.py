"""BlenderMCP entry points for the editable FPS action library.

SelectFpsAnimation('HanYang', 'Idle', normalized=.55)
ExportFpsAnimation(projectRoot, 'Idle') exports only that existing Action.
"""
import bpy
from pathlib import Path


def SelectFpsAnimation(weapon='HanYang', clip='Idle', normalized=0, frame=None):
    scene=bpy.context.scene
    if scene.get('task')!='HanYangHands_20260910' or weapon!='HanYang':
        raise RuntimeError('Select the isolated HanYang source project')
    rig=next(o for o in scene.objects if o.type=='ARMATURE')
    name='Animation_Fps'+weapon+clip
    action=bpy.data.actions.get(name)
    if not action:raise ValueError('Unknown FPS action: '+name)
    if clip!='Idle':raise ValueError('Only the single authorized Idle clip is available')
    for obj in scene.objects:
        slotName=obj.get('fpsIdleSlot')
        if slotName:
            obj.animation_data_create();obj.animation_data.action=action
            obj.animation_data.action_slot=action.slots[slotName]
    for collection in bpy.data.collections:
        if collection.name.startswith('Collection_Fps'):
            collection.hide_viewport=collection.name!='Collection_Fps'+weapon
            collection.hide_render=collection.hide_viewport
    rig.data.pose_position='POSE'
    scene.frame_start=1;scene.frame_end=round(action.frame_range[1])
    position=frame if frame is not None else 1+max(0,min(1,normalized))*(scene.frame_end-1)
    scene.frame_set(int(position),subframe=position-int(position))
    for obj in scene.objects:
        if obj.parent and obj.parent.name.startswith('Preview_'):
            obj.hide_viewport=obj.parent.hide_viewport;obj.hide_render=obj.parent.hide_render
    bpy.context.view_layer.objects.active=rig
    rig.select_set(True)
    return {'weapon':weapon,'clip':clip,'frame':position,'frames':scene.frame_end,'seconds':(position-1)/scene.render.fps}


def ExportFpsAnimation(projectRoot, clip):
    script=Path(projectRoot)/'_import/Script_FpsAnimationBake.py'
    scope={'__file__':str(script)}
    exec(compile(script.read_text(encoding='utf-8'),str(script),'exec'),scope)
    return scope['ExportFpsAnimation'](projectRoot,clip)
