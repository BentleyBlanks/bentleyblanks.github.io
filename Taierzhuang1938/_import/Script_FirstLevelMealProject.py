"""Package private meal studies and one-object handoff pairs on original rigs."""
from pathlib import Path
import argparse, copy, hashlib, json, math, sys
import bpy
from mathutils import Quaternion, Vector


def Main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',type=Path,required=True)
    parser.add_argument('--revision',type=int,default=1)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    root=args.root.resolve();group=f'FirstLevelMealAuthorV{args.revision}'
    out=root/'Models'/group;blends=root/'Blender'/group
    assert not (out/'Data_DeliveryStatus.json').exists(),'Preserve delivered revisions'
    Read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
    Hash=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
    bake=Read(out/'Data_AuthoredBake.json')
    reference=Read(root/'Models/FirstLevelTrainSupportV2/Data_Versions.json')['actions'][0]['variants'][0]['review']
    blends.mkdir(parents=True,exist_ok=True);results=[]
    labels={'Giver':'切食与递食','Receiver':'接食与小口吃','Pair':'双人切食与单次交接'}
    actions={role:dict(id=f'TrainMeal{role}Authored',label=label+' · 后期制作',loop=False,
        description='复用原坐姿、保留原骨架的可选候选；原片和 raw 固定在来源 0 秒，模型播放后期动作。8.3 秒只标记作者交接，不触发游戏任务或对白。',
        cameraDistance=4.2 if role=='Pair' else 3.5,cameraCenter=[0,.9,.57 if role=='Pair' else .25],variants=[])
        for role,label in labels.items()}

    def Reset():
        bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene
        scene.render.fps=bake['sampleFps'];scene.frame_start=0
        scene.frame_end=round(bake['durationSeconds']*bake['sampleFps'])
        for key in ['authoredScope','timingPolicy','sourcePoseSeconds']:scene[key]=bake[key]
        scene['acceptedForGame']=False
        return scene

    def Import(record,prefix=''):
        file=root/record['path'];assert Hash(file)==record['sha256']
        before=set(bpy.context.scene.objects);bpy.ops.import_scene.gltf(filepath=str(file))
        objects=set(bpy.context.scene.objects)-before
        for obj in objects:
            obj.name=prefix+obj.name
            data=obj.animation_data
            if data and data.nla_tracks:
                tracks=list(data.nla_tracks);assert len(tracks)==1
                strip=tracks[0].strips[0];data.action=strip.action
                if hasattr(data,'action_slot') and strip.action_slot:data.action_slot=strip.action_slot
                for track in tracks:track.mute=True
        return objects

    def Save(record,role,file,clip):
        scene=bpy.context.scene;scene.frame_set(480);bpy.context.view_layer.update()
        bpy.ops.file.pack_all();blend=blends/f"Scene_{record['id']}Meal{role}.blend"
        bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True)
        bpy.ops.wm.open_mainfile(filepath=str(blend))
        arms=[o for o in bpy.context.scene.objects if o.type=='ARMATURE']
        assert len(arms)==(2 if role=='Pair' else 1)
        assert all(o.animation_data and o.animation_data.action for o in arms)
        result=dict(id=record['id'],role=role,model=file.relative_to(root).as_posix(),modelSha256=Hash(file),
            blend=blend.relative_to(root).as_posix(),blendSha256=Hash(blend),reopened=True,animatedArmatures=len(arms),clip=clip)
        results.append(result)
        review=copy.deepcopy(reference)
        review.update(sourcePoseSeconds=0,sourceQuality='authored_from_existing_pose',
            sourceAssessment='原片及 raw 固定为已恢复坐姿的 0 秒。展开布、切食、交接和进食为后期作者动作；切食原片另在制作报告中列作语义参考。',
            retargetNotes=bake['authoredScope'],retargetReport=f'Models/{group}/Data_AuthoredBake.json',seamBlendSeconds=0,
            defaultCameraYawRadians=-.65,cameraElevationRadians=.25,sideCameraYawRadians=-math.pi/2)
        review.pop('packageValidation',None)
        actions[role]['variants'].append(dict(id=f"Nra-v{args.revision}-{record['id']}-TrainMeal{role}Authored",faction='Nra',modelId=record['id'],
            revisionOrder=args.revision,label=f"作者 V{args.revision} · {record['id']}",status='已打包作者候选 · 未游戏接入',
            propKind='body',path=result['model'],blend=result['blend'],clip=clip,review=review,travelMeters=None))
        print('Saved and reopened',blend.name,flush=True)

    for record in bake['results']:
        Reset();Import(record);Save(record,record['role'],root/record['path'],record['clip'])

    for modelId in dict.fromkeys(r['id'] for r in bake['results']):
        scene=Reset();pair={r['role']:r for r in bake['results'] if r['id']==modelId};shared=None
        for role in ['Giver','Receiver']:
            objects=Import(pair[role],role+'_')
            sliceRoot=next(o for o in objects if 'Transform_FoodSlice' in o.name)
            if role=='Receiver':
                for obj in [*sliceRoot.children_recursive,sliceRoot]:
                    objects.remove(obj);bpy.data.objects.remove(obj,do_unlink=True)
            else:
                shared=sliceRoot;objects-=set(shared.children_recursive)|{shared}
                shared.parent=None;shared.animation_data_clear();shared.name='Transform_SharedFoodSlice'
            wrapper=bpy.data.objects.new('Transform_'+role,None);scene.collection.objects.link(wrapper)
            for obj in objects:
                if obj.parent not in objects:obj.parent=wrapper
            if role=='Receiver':
                wrapper.rotation_euler.z=math.pi
                wrapper.location=(0,-bake['partnerTransform']['translation'][2],0)
        # glTF (x,y,z) maps to Blender (x,-z,y). Only this slice survives
        # throughout the pair; no duplicate prop is hidden at the switch.
        partner=Quaternion((0,0,1),math.pi);shared.rotation_mode='QUATERNION'
        handoffFrame=round(bake['handoffSeconds']*bake['sampleFps'])
        q=pair['Giver']['samples'][handoffFrame]['sliceQuaternion']
        atHandoff=Quaternion((q[3],q[0],-q[2],q[1]))
        for frame in range(scene.frame_end+1):
            role='Giver' if frame<=handoffFrame else 'Receiver';sample=pair[role]['samples'][frame]
            x,y,z=sample['slicePosition'];q=sample['sliceQuaternion']
            position=Vector((x,-z,y));rotation=Quaternion((q[3],q[0],-q[2],q[1]))
            if role=='Receiver':
                position=partner@position+Vector((0,-bake['partnerTransform']['translation'][2],0))
                rotation=atHandoff.slerp(partner@rotation,min(1,(frame-handoffFrame)/60))
            shared.location=position;shared.rotation_quaternion=rotation
            sx,sy,sz=sample['sliceScale'];shared.scale=(sx,sz,sy)
            for prop in ['location','rotation_quaternion','scale']:shared.keyframe_insert(prop,frame=frame)
        shared['handoffSeconds']=bake['handoffSeconds'];shared['singleSharedObject']=True
        clip=f'FirstLevelTrainMealPair{int(modelId[-2:])}'
        file=out/f'Model_{modelId}MealPair.glb'
        scene.frame_set(0)
        bpy.ops.export_scene.gltf(filepath=str(file),export_format='GLB',export_animations=True,
            export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name=clip,
            export_frame_range=True,export_force_sampling=True,export_anim_slide_to_zero=True,export_yup=True)
        assert file.is_file() and file.stat().st_size>100000
        Save(pair['Giver'],'Pair',file,clip)
    (out/'Data_EditableProjects.json').write_text(json.dumps(dict(status='saved_and_reopened',regressionTestRun=False,
        pairPolicy='One shared food slice; original bone names retained inside each rig. Pair object names have role prefixes.',results=results),indent=2),encoding='utf-8')
    (out/'Data_Versions.json').write_text(json.dumps(dict(actions=list(actions.values())),ensure_ascii=False,indent=2),encoding='utf-8')


if __name__=='__main__':Main()
