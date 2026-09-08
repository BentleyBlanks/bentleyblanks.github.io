"""Package FL20 original-rig studies as editable private projects and source reviews."""
from pathlib import Path
import argparse, copy, hashlib, json, sys
import bpy
from mathutils import Vector


def Main():
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);parser.add_argument('--revision',type=int,default=2)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);root=args.root.resolve();assert args.revision>0
    group=f'FirstLevelAisleAuthorV{args.revision}';out=root/'Models'/group;blends=root/'Blender'/group
    assert not (out/'Data_VisualAssessment.json').exists(),'Preserve frozen projects'
    Read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
    Hash=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
    bake=Read(out/'Data_AuthoredBake.json');checked=Read(out/'Data_ExportValidation.json');assert not checked['errors']
    reference=Read(root/'Models/FirstLevelTrainSupportV2/Data_Versions.json')['actions'][0]['variants'][0]['review']
    blends.mkdir(exist_ok=True);results=[];actions={}
    for record in bake['results']:
        file=root/record['path'];assert Hash(file)==record['sha256']
        bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene
        scene.render.fps=bake['sampleFps'];scene.frame_start=0;scene.frame_end=600
        bpy.ops.import_scene.gltf(filepath=str(file));arm=next(o for o in scene.objects if o.type=='ARMATURE')
        scene['sourceModel']=record['sourceModel'];scene['sourceSha256']=record['sourceSha256'];scene['sourcePoseSeconds']=record['sourcePoseSeconds']
        scene['authoredScope']=bake['authoredScope'];scene['timingPolicy']=bake['timingPolicy'];scene['acceptedForGame']=False
        bpy.ops.file.pack_all();blend=blends/f"Scene_{record['id']}{record['mode']}.blend"
        bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True);bpy.ops.wm.open_mainfile(filepath=str(blend))
        arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');maximum=0
        for frame in [0,84,192,252,360,540,600]:
            bpy.context.scene.frame_set(frame);bpy.context.view_layer.update()
            for side in ['L','R']:
                actual=arm.matrix_world@arm.pose.bones[f'Bip002 {side} Foot'].head
                p=record['samples'][frame]['feet'][side];expected=Vector((p[0],-p[2],p[1]))
                maximum=max(maximum,(actual-expected).length)
        assert maximum<.00005,(record['id'],record['mode'],maximum)
        results.append(dict(id=record['id'],mode=record['mode'],model=record['path'],modelSha256=record['sha256'],blend=blend.relative_to(root).as_posix(),blendSha256=Hash(blend),reopened=True,maxFootErrorM=maximum))
        action_id='TrainAisleSideStepAuthored' if record['mode']=='SideStep' else 'TrainBagKickAsideAuthored'
        action=actions.setdefault(action_id,dict(id=action_id,label='车厢侧身让路 · 后期制作' if record['mode']=='SideStep' else '踢开背包 · 后期制作',loop=False,
            description='复用已验起身末态；原片与 raw 固定显示站稳来源。侧步／踢包为后期动作，尚未绑定实际车内障碍和演员。',cameraDistance=4.3,cameraCenter=[0,.83,.2],variants=[]))
        review=copy.deepcopy(reference)
        review.update(sourcePoseSeconds=record['sourcePoseSeconds'],sourceQuality='authored_from_existing_pose',
            sourceAssessment='固定展示原起身末态；侧身、脚步及踢包全部为作者后期制作，不是新增视频恢复。',
            retargetNotes=bake['authoredScope'],retargetReport=f'Models/{group}/Data_AuthoredBake.json',seamBlendSeconds=0)
        review.pop('packageValidation',None)
        action['variants'].append(dict(id=f"Nra-v{args.revision}-{record['id']}-{action_id}",faction='Nra',modelId=record['id'],revisionOrder=args.revision,label=f"作者 V{args.revision} · {record['id']}",
            status='作者动作 · 待接触审阅',propKind='body',path=record['path'],blend=results[-1]['blend'],clip=record['clip'],review=review,travelMeters=None))
        print('Reopened',record['id'],record['mode'],maximum,flush=True)
    (out/'Data_EditableProjectValidation.json').write_text(json.dumps(dict(status='reopened_projects_match_export',results=results),indent=2),encoding='utf-8')
    (out/'Data_Versions.json').write_text(json.dumps(dict(actions=list(actions.values())),ensure_ascii=False,indent=2),encoding='utf-8')


if __name__=='__main__':Main()
