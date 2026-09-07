"""Register reviewed single-person sources and immutable full raw recoveries."""
from pathlib import Path
import argparse, hashlib, json
import numpy as np


def Main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',type=Path,required=True)
    parser.add_argument('--ids',required=True)
    parser.add_argument('--group',default='FirstLevelPriorityV1')
    args=parser.parse_args();root=args.root.resolve()
    labels={'TrainStairDisembark':'车梯逐阶下车与走停','TrainMealCutOffer':'幺娃展开食物切片递出',
        'ZhouSeatedAttempt':'老周腿伤撑起失败与指前沿',
        'TrainBenchRest':'车厢长凳休息与前倾','TrainGearStow':'车厢整理背包'}
    names=['Pelvis','LeftHip','RightHip','Spine1','LeftKnee','RightKnee','Spine2','LeftAnkle',
        'RightAnkle','Spine3','LeftFoot','RightFoot','Neck','LeftCollar','RightCollar','Head',
        'LeftShoulder','RightShoulder','LeftElbow','RightElbow','LeftWrist','RightWrist']
    Read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
    Hash=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
    out=root/'Models'/args.group;out.mkdir(parents=True,exist_ok=True)
    inventory=out/'Data_SourceInventory.json'
    actions={a['id']:a for a in Read(inventory)['actions']} if inventory.exists() else {}
    for name in args.ids.split(','):
        source=root/'Video/Sources/FirstLevelV1'/name
        receipt=Read(source/'Data_GenerationResult.json')
        assert receipt['gen_status']=='success'
        video=source/Path(receipt['result_json']['videos'][0]['path']).name
        assert video.is_file() and receipt['submit_id'] in video.name
        assessment=Read(source/'DenseReview/Data_VisualAssessment.json')
        assert assessment['status']=='eligible_for_initial_3d_recovery_pending_depth_and_contact_review'
        assert assessment['sourceVideoSha256']==Hash(video)
        cache=root/'Models/_Cache/FirstLevelV1'/name/'Data_GvhmrMotion.npz'
        recovery=Read(cache.with_name('Data_Recovery.json'))
        assert recovery['sourceSha256']==Hash(video) and recovery['cropFraction'] is None
        assert recovery['resultSha256']==Hash(cache.with_name('hmr4d_results.pt'))
        assert assessment['keypointsSha256']==Hash(cache.parent/'preprocess/vitpose.pt')
        assert assessment['observationInputSha256']==Hash(cache.parent/'0_input_video.mp4')
        with np.load(cache) as data:
            positions=data['worldJoints'];assert np.isfinite(positions).all()
            forward=data['worldGlobalRotations'][:20,0,:,2].mean(0)
            raw=dict(schemaVersion=1,stage='GVHMR worldJoints before retarget, filtering, IK or loop correction',
                sourceCache=cache.relative_to(root).as_posix(),sourceCacheSha256=Hash(cache),fps=float(data['fps']),
                parents=data['parents'].tolist(),jointNames=names,positions=positions.tolist(),
                viewerYawRadians=float(-np.arctan2(forward[0],forward[2])),
                viewerOrigin=[float(positions[0,0,0]),0,float(positions[0,0,2])])
        rawPath=root/'Models/RecoveryPreview'/f'Data_V1_{name}RawJoints.json'
        if rawPath.exists():assert Read(rawPath)==raw,'Refusing to overwrite different raw recovery'
        else:rawPath.write_text(json.dumps(raw,separators=(',',':')),encoding='utf-8')
        review=dict(sourceVideo=video.relative_to(root).as_posix(),sourceRangeSeconds=[0,(len(positions)-1)/raw['fps']],
            recoveryTracks=[dict(path=rawPath.relative_to(root).as_posix(),offset=[0,0,0])],
            recoveryLabel='GVHMR 原始恢复 · 未重定向、未修脚',recoveryFps=raw['fps'],
            sourceAssessment=assessment['observed'],sourceQuality='single_person_pending_depth_and_contact_review',
            defaultCameraYawRadians=0,cameraElevationRadians=.35,sideCameraYawRadians=-np.pi/2)
        entry=dict(id=name,label=labels[name],loop=False,category='video_recovery',cameraDistance=5.5,
            latestByFaction={'Nra':'source-'+name},variants=[dict(id='source-'+name,faction='Nra',review=review)])
        if name=='TrainStairDisembark':
            # Center on the complete exported root travel; this only frames the viewer.
            entry.update(cameraDistance=6,cameraCenter=[-.75,1.05,.7])
        if name in actions:
            assert actions[name]['variants']==entry['variants'],'Version changed source references separately'
        actions[name]=entry
        registration=dict(sourceId=name,sourceVideo=review['sourceVideo'],sourceVideoSha256=Hash(video),
            sourceRangeSeconds=review['sourceRangeSeconds'],generationSubmitId=receipt['submit_id'],
            recoveryFrames=len(positions),recoveryFps=raw['fps'],recoveryRevision=1,
            sourceCache=raw['sourceCache'],sourceCacheSha256=raw['sourceCacheSha256'],resultSha256=recovery['resultSha256'],
            rawJointFile=rawPath.relative_to(root).as_posix(),group=args.group,
            visualAssessment=(source/'DenseReview/Data_VisualAssessment.json').relative_to(root).as_posix(),
            status='raw_recovered_pending_retarget_and_contact_review',runtimeEnabled=False)
        (source/'Data_RecoveryRegistration.json').write_text(json.dumps(registration,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(dict(id=name,frames=len(positions),raw=registration['rawJointFile'])))
    inventory.write_text(json.dumps(dict(actions=list(actions.values())),ensure_ascii=False,indent=2),encoding='utf-8')


if __name__=='__main__':Main()
