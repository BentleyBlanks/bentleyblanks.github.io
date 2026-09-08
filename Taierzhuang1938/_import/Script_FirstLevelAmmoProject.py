"""Reopen editable count-ammo studies; retain original production rig and sources."""
from pathlib import Path
import argparse, copy, hashlib, json, sys
import bpy


def Main():
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);parser.add_argument('--revision',type=int,default=3)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);root=args.root.resolve()
    revision=args.revision;assert revision>=2
    group=f'FirstLevelAmmoAuthorV{revision}';out=root/'Models'/group;blends=root/'Blender'/group;blends.mkdir(exist_ok=True)
    assert not (out/'Data_VisualAssessment.json').exists(),'Reviewed study requires a new version'
    Read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
    Hash=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
    bake=Read(out/'Data_AuthoredBake.json');reference=Read(root/'Models/FirstLevelBenchV3/Data_Versions.json')['actions'][0]['variants'][0]['review']
    results=[];variants=[]
    for record in bake['results']:
        model=root/record['path'];assert Hash(model)==record['sha256']
        bpy.ops.wm.read_factory_settings(use_empty=True)
        scene=bpy.context.scene;scene.render.fps=60;scene.frame_start=0;scene.frame_end=600
        bpy.ops.import_scene.gltf(filepath=str(model));scene.frame_set(0)
        arm=next(o for o in scene.objects if o.type=='ARMATURE');assert arm.animation_data
        scene['sourceModel']=record['sourceModel'];scene['sourceSha256']=record['sourceSha256']
        scene['authoredScope']=bake['authoredScope'];scene['timingPolicy']=bake['timingPolicy'];scene['runtimeEnabled']=False
        bpy.ops.file.pack_all();file=blends/f"Scene_{record['id']}AmmoCount.blend"
        bpy.ops.wm.save_as_mainfile(filepath=str(file),compress=True)
        bpy.ops.wm.open_mainfile(filepath=str(file));scene=bpy.context.scene
        arm=next(o for o in scene.objects if o.type=='ARMATURE');samples=[]
        for frame in [0,120,210,360,480,600]:
            scene.frame_set(frame);bpy.context.view_layer.update()
            pose={name:list(arm.matrix_world@arm.pose.bones[name].head) for name in ['Bip002 L Hand','Bip002 R Hand','Bip002 L Foot','Bip002 R Foot']}
            samples.append(dict(frame=frame,joints=pose))
        for side in ['L','R']:
            values=[s['joints'][f'Bip002 {side} Foot'] for s in samples]
            assert max(abs(v[i]-values[0][i]) for v in values for i in range(3))<.00001
        result=dict(id=record['id'],model=record['path'],modelSha256=record['sha256'],blend=file.relative_to(root).as_posix(),blendSha256=Hash(file),bones=len(arm.data.bones),reopened=True,samples=samples)
        results.append(result)
        review=copy.deepcopy(reference)
        review.update(sourcePoseSeconds=0,sourceQuality='authored_from_existing_pose',sourceAssessment='原片仅作坐姿参考，固定在 0 秒；没有数弹新视频。数弹、找弹、抬头回应全部为后期作者动作。',
            retargetNotes=bake['authoredScope'],retargetReport=f'Models/{group}/Data_AuthoredBake.json',seamBlendSeconds=0,
            sourceRangeSeconds=[0,7.966666666666667])
        variants.append(dict(id=f"Nra-v{revision}-{record['id']}-TrainAmmoCountAuthored",faction='Nra',modelId=record['id'],label=f"作者数弹 V{revision} · {record['id']}",
            revisionOrder=revision,status='作者动作 · 待接触审阅',propKind='body',path=record['path'],blend=result['blend'],clip=record['clip'],review=review,travelMeters=None))
        print('Reopened',record['id'],len(samples),'samples',flush=True)
    (out/'Data_EditableProjectValidation.json').write_text(json.dumps(dict(status='reopened_static_foot_bones_checked',results=results),indent=2),encoding='utf-8')
    (out/'Data_Versions.json').write_text(json.dumps(dict(actions=[dict(id='TrainAmmoCountAuthored',label='数弹、找弹与抬头回应 · 后期制作',loop=False,
        description='复用已验坐姿；左右两栏固定显示坐姿来源，第三栏独立播放作者数弹动作。试制道具与手指接触仍待验。',cameraDistance=3.6,cameraCenter=[0,.82,.1],variants=variants)]),ensure_ascii=False,indent=2),encoding='utf-8')


if __name__=='__main__':Main()
