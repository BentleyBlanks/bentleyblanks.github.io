"""Save editable four-tread studies and register their held-source three-pane review."""
from pathlib import Path
import argparse,copy,hashlib,json,sys
import bpy


def Main():
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);parser.add_argument('--revision',type=int,default=2)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);root=args.root.resolve()
    group=f'FirstLevelStairAuthorV{args.revision}';out=root/'Models'/group;blends=root/'Blender'/group
    assert not (out/'Data_DeliveryStatus.json').exists() and not (out/'Data_VisualAssessment.json').exists(),'Use a new revision after delivery'
    Read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
    Hash=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
    bake=Read(out/'Data_AuthoredBake.json')
    reference=Read(root/'Models/FirstLevelTrainSupportV2/Data_Versions.json')['actions'][0]['variants'][0]['review']
    blends.mkdir(exist_ok=True);results=[]
    action=dict(id='TrainStairDescentAuthored',label='四级车梯下车 · 后期制作',loop=False,
        description='复用站稳末态，按游戏四级车梯后期制作逐级落脚。原片和 raw 固定在来源姿态，模型独立播放；可选候选，游戏队列仍自行决定移动。',
        cameraDistance=7.4,cameraCenter=[0,1.15,1.4],variants=[])
    for record in bake['results']:
        file=root/record['path'];assert Hash(file)==record['sha256']
        bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene
        scene.render.fps=bake['sampleFps'];scene.frame_start=0;scene.frame_end=round(bake['durationSeconds']*bake['sampleFps'])
        bpy.ops.import_scene.gltf(filepath=str(file))
        scene['sourceModel']=record['sourceModel'];scene['sourceSha256']=record['sourceSha256'];scene['sourcePoseSeconds']=record['sourcePoseSeconds']
        scene['authoredScope']=bake['authoredScope'];scene['timingPolicy']=bake['timingPolicy'];scene['acceptedForGame']=False
        scene.frame_set(round(scene.frame_end/2));bpy.context.view_layer.update()
        bpy.ops.file.pack_all();blend=blends/f"Scene_{record['id']}{record['mode']}.blend"
        bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True)
        bpy.ops.wm.open_mainfile(filepath=str(blend))
        armatures=[o for o in bpy.context.scene.objects if o.type=='ARMATURE']
        assert armatures and any(o.animation_data and o.animation_data.action for o in armatures)
        results.append(dict(id=record['id'],mode=record['mode'],model=record['path'],modelSha256=record['sha256'],blend=blend.relative_to(root).as_posix(),blendSha256=Hash(blend),reopened=True,animatedArmatures=len(armatures)))
        review=copy.deepcopy(reference)
        review.update(sourcePoseSeconds=record['sourcePoseSeconds'],sourceQuality='authored_from_existing_pose',
            sourceAssessment='原片和 raw 仅展示已恢复的站稳来源；四级下降、脚步和骨盆位移均为后期制作。',
            retargetNotes=bake['authoredScope'],retargetReport=f'Models/{group}/Data_AuthoredBake.json',seamBlendSeconds=0)
        review.pop('packageValidation',None)
        action['variants'].append(dict(id=f"Nra-v{args.revision}-{record['id']}-TrainStairDescentAuthored",faction='Nra',modelId=record['id'],revisionOrder=args.revision,
            label=f"作者 V{args.revision} · {record['id']}",status='作者候选 · 可编辑 · 尚未游戏接入',propKind='body',path=record['path'],blend=results[-1]['blend'],clip=record['clip'],review=review,travelMeters=None))
        print('Saved and reopened',blend.name,flush=True)
    (out/'Data_EditableProjects.json').write_text(json.dumps(dict(status='saved_and_reopened',regressionTestRun=False,results=results),indent=2),encoding='utf-8')
    (out/'Data_Versions.json').write_text(json.dumps(dict(actions=[action]),ensure_ascii=False,indent=2),encoding='utf-8')


if __name__=='__main__':Main()
