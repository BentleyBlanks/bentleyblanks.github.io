"""Export one explicitly named, existing HanYang Action. Never generate Actions.

Running this file alone does nothing. Batch authoring is intentionally absent.
"""
import bpy
import json
import math
from pathlib import Path
from mathutils import Matrix, Vector


def ExportFpsAnimation(projectRoot, clip):
    allowed=('Idle',)
    scene=bpy.context.scene
    if scene.get('task')!='HanYangHands_20260910' or clip not in allowed:
        raise ValueError('Specify one existing HanYang clip: '+', '.join(allowed))
    outputPath=Path(projectRoot)/'Animation/FirstPerson/Data_FpsHanYangAnimations.json'
    output=json.loads(outputPath.read_text(encoding='utf-8'))
    output['clips']={}
    metadata=json.loads(scene['fpsAnimationMetadata'])
    original=metadata['weapons']['HanYang']['clips'][clip]
    action=bpy.data.actions.get('Animation_FpsHanYang'+clip)
    if action is None:raise ValueError('The requested Action does not exist')
    rig=bpy.data.objects['Rig_FpsArmsNraSkeletal01']
    normalize=lambda name:''.join(c for c in name.lower() if c.isalnum())
    boneMap={normalize(b.name):b for b in rig.pose.bones}
    bones=[boneMap[normalize(entry['name'])] for entry in metadata['bones']]
    read=lambda values:Matrix([values[i::4] for i in range(4)])
    convert=Matrix.Rotation(math.pi/2,4,'X');inverseConvert=convert.inverted()
    localPositions=json.loads(scene['fpsHoldingLocalPositions'])
    inverse=rig.matrix_world.inverted()
    corrections=[b.bone.matrix_local.inverted()@inverse@convert@read(entry['world'])
                 for b,entry in zip(bones,metadata['bones'])]
    controls={key:bpy.data.objects.get('Animation_Control_'+key)
              for key in original['frames'][0]['controls']}
    assignments=[(rig,action)]
    for key,obj in controls.items():
        if obj is None:raise ValueError('Missing control: '+key)
        assignments.append((obj,action if obj.get('fpsIdleSlot') else None))
    for obj,_ in assignments:
        if obj.animation_data and any(not track.mute for track in obj.animation_data.nla_tracks):
            raise RuntimeError('Mute NLA layers before exporting the selected Action')
    previousFrame=(scene.frame_current,scene.frame_subframe)
    previousPose=rig.data.pose_position
    previousBones=[b.matrix_basis.copy() for b in bones]
    previous=[(obj,obj.animation_data.action if obj.animation_data else None,
               obj.matrix_basis.copy()) for obj,_ in assignments]
    actionNames=set(bpy.data.actions.keys())
    start,end=action.frame_range
    if end<=start:raise ValueError('The selected Action has no animated frame range')
    duration=float(action.get('duration',original['duration']))
    count=1+round(duration*metadata['fps'])
    boneSamples=[[] for _ in bones];controlSamples={key:[] for key in controls}
    def Append(samples,position,rotation):
        q=[rotation.x,rotation.y,rotation.z,rotation.w]
        if samples and sum(a*b for a,b in zip(samples[-1][3:],q))<0:q=[-v for v in q]
        samples.append([*position,*q])
    try:
        rig.data.pose_position='POSE'
        for obj,target in assignments:
            obj.animation_data_create();obj.animation_data.action=target
            if target:obj.animation_data.action_slot=target.slots[obj['fpsIdleSlot']]
        for index in range(count):
            frame=start+(end-start)*index/(count-1)
            scene.frame_set(math.floor(frame),subframe=frame%1)
            bpy.context.view_layer.update()
            worlds=[inverseConvert@rig.matrix_world@b.matrix@correction
                    for b,correction in zip(bones,corrections)]
            for n,world in enumerate(worlds):
                entry=metadata['bones'][n]
                parent=read(entry['parentWorld']) if entry['parent']<0 else worlds[entry['parent']]
                position,rotation,_=(parent.inverted()@world).decompose()
                # Avoid float32 matrix round-trip drift in constant finger lengths.
                if 'finger' in normalize(bones[n].name):position=Vector(localPositions[entry['name']])
                Append(boneSamples[n],position,rotation)
            for key,obj in controls.items():
                position,rotation,_=obj.matrix_basis.decompose()
                Append(controlSamples[key],position,rotation)
    finally:
        for obj,oldAction,matrix in previous:
            obj.animation_data.action=oldAction
            if oldAction and oldAction.slots:obj.animation_data.action_slot=oldAction.slots[obj['fpsIdleSlot']] if obj.get('fpsIdleSlot') else oldAction.slots[0]
        scene.frame_set(previousFrame[0],subframe=previousFrame[1])
        for obj,oldAction,matrix in previous:
            if oldAction is None:obj.matrix_basis=matrix
        if previous[0][1] is None:
            for bone,matrix in zip(bones,previousBones):bone.matrix_basis=matrix
        rig.data.pose_position=previousPose;bpy.context.view_layer.update()
    if set(bpy.data.actions.keys())!=actionNames:raise RuntimeError('Action inventory changed; export cancelled')
    def Pack(samples):
        if max(abs(a-b) for sample in samples for a,b in zip(samples[0],sample))<1e-6:samples=samples[:1]
        return [round(value,7) for sample in samples for value in sample]
    frames=[original['frames'][round(i*(len(original['frames'])-1)/(count-1))] for i in range(count)]
    output['clips'][clip]={
        'duration':duration,'count':count,'bones':[Pack(samples) for samples in boneSamples],
        'controls':{key:Pack(samples) for key,samples in controlSamples.items()},
        'visible':{key:[frame['visible'][key] for frame in frames] for key in controls},
        'state':[frame['state'] for frame in frames],'contact':[frame['contact'] for frame in frames]}
    temporary=outputPath.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(output,separators=(',',':')),encoding='utf-8');temporary.replace(outputPath)
    manifestPath=outputPath.with_name('Data_FpsAnimationManifest.json')
    manifest=json.loads(manifestPath.read_text(encoding='utf-8'))
    manifest['HanYang']={'clips':len(output['clips']),'bytes':outputPath.stat().st_size}
    manifestPath.write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    return {'weapon':'HanYang','updatedClip':clip,'frames':count,'newActions':0,'asset':str(outputPath)}
