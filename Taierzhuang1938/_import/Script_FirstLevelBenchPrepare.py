"""Register the new single-person bench source and untouched recovery for reuse."""
from pathlib import Path
import argparse
import hashlib
import json
import numpy as np


def Main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',type=Path,required=True)
    args=parser.parse_args()
    root=args.root.resolve()
    source=root/'Video/Sources/FirstLevelV1/TrainBenchRise'
    receipt=json.loads((source/'Data_GenerationResult.json').read_text(encoding='utf-8'))
    assert receipt['gen_status']=='success'
    # The Windows CLI may corrupt Chinese path characters in its JSON output.
    # Resolve this exact submit ID's filename; never choose the first MP4.
    reported=Path(receipt['result_json']['videos'][0]['path'])
    video=reported if reported.is_file() else source/reported.name
    assert video.is_file() and receipt['submit_id'] in video.name
    cache=root/'Models/_Cache/FirstLevelV1/TrainBenchRise/Data_GvhmrMotion.npz'
    recovery=json.loads(cache.with_name('Data_Recovery.json').read_text(encoding='utf-8'))
    sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
    assert recovery['sourceSha256']==sha(video)
    with np.load(cache) as data:
        positions=data['worldJoints']
        assert np.isfinite(positions).all()
        forward=data['worldGlobalRotations'][:20,0,:,2].mean(0)
        names=['Pelvis','LeftHip','RightHip','Spine1','LeftKnee','RightKnee','Spine2','LeftAnkle','RightAnkle','Spine3','LeftFoot','RightFoot','Neck','LeftCollar','RightCollar','Head','LeftShoulder','RightShoulder','LeftElbow','RightElbow','LeftWrist','RightWrist']
        raw=dict(schemaVersion=1,stage='GVHMR worldJoints before retarget, filtering, IK or loop correction',
            sourceCache=cache.relative_to(root).as_posix(),sourceCacheSha256=sha(cache),fps=float(data['fps']),
            parents=data['parents'].tolist(),jointNames=names,positions=positions.tolist(),
            viewerYawRadians=float(-np.arctan2(forward[0],forward[2])),
            viewerOrigin=[float(positions[0,0,0]),0,float(positions[0,0,2])])
    rawPath=root/'Models/RecoveryPreview/Data_V1_TrainBenchRiseRawJoints.json'
    if rawPath.exists():
        assert json.loads(rawPath.read_text(encoding='utf-8'))==raw,'Refusing to overwrite a different raw recovery'
    else:
        rawPath.write_text(json.dumps(raw,separators=(',',':')),encoding='utf-8')
    assessment=dict(status='single_person_source_recovered_pending_depth_review',sourceVideo=video.relative_to(root).as_posix(),
        sourceVideoSha256=sha(video),generationSubmitId=receipt['submit_id'],credits=receipt['credit_count'],
        observed='Single full-body person, fixed bench and floor; sit, turn head, rise once, settle standing.',
        cameraLimitation='Generated view is closer to elevated front than requested 45-degree azimuth. Both legs are visible; knee depth and seat contact still require review.',
        nominalSourceFps=24,recoveryFps=raw['fps'],recoveryFrames=len(raw['positions']),recoveryRevision=1,
        sourceCache=raw['sourceCache'],sourceCacheSha256=raw['sourceCacheSha256'],resultSha256=recovery['resultSha256'],
        sourceRangeSeconds=[0,(len(raw['positions'])-1)/raw['fps']],
        events=[dict(id='SeatedObservation',sourceRangeSeconds=[0,4.3]),dict(id='RiseOnce',sourceRangeSeconds=[4.3,6.5]),dict(id='StandingSettle',sourceRangeSeconds=[6.5,7.9])],
        eventPolicy='Visual observations for selecting clips, not mission/dialogue timing. Do not speed up the entire performance to force the current 1.25-second rise placeholder.')
    (source/'Data_SourceAssessment.json').write_text(json.dumps(assessment,ensure_ascii=False,indent=2),encoding='utf-8')
    review=dict(sourceVideo=assessment['sourceVideo'],sourceRangeSeconds=assessment['sourceRangeSeconds'],
        recoveryTracks=[dict(path=rawPath.relative_to(root).as_posix(),offset=[0,0,0])],
        recoveryLabel='GVHMR 原始恢复 · 未重定向、未修脚',recoveryFps=raw['fps'],
        sourceAssessment=assessment['cameraLimitation'],sourceQuality='single_person_camera_deviation',
        defaultCameraYawRadians=0,cameraElevationRadians=.25,sideCameraYawRadians=-np.pi/2)
    entry=dict(id='TrainBenchRise',label='车厢长凳坐姿与起身',loop=False,category='video_recovery',cameraDistance=4.8,
        latestByFaction={'Nra':'source-TrainBenchRise'},variants=[dict(id='source-TrainBenchRise',faction='Nra',review=review)])
    out=root/'Models/FirstLevelTrainV1'
    out.mkdir(parents=True,exist_ok=True)
    inventory=out/'Data_SourceInventory.json'
    inventory.write_text(json.dumps(dict(actions=[entry]),ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in assessment.items() if k!='events'},ensure_ascii=True))


if __name__=='__main__':
    Main()
