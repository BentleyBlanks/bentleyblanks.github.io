"""Prepare remaining screened sources serially; never generate video or predict 3D.

Each source still needs a human review of its dense observations before recovery.
Existing recoveries and observations are verified and skipped, not overwritten.
"""
from pathlib import Path
import argparse, datetime, hashlib, json, os, re, subprocess, sys


def Main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',type=Path,required=True)
    parser.add_argument('--group',default='FirstLevelObservationBatchV1')
    parser.add_argument('--ids')
    parser.add_argument('--device',choices=['cuda','cpu'],default='cuda')
    parser.add_argument('--run',action='store_true')
    args=parser.parse_args();root=args.root.resolve();scripts=Path(__file__).resolve().parent
    assert re.fullmatch(r'FirstLevelObservationBatchV[1-9]\d*',args.group)
    Read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
    Hash=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
    selected=set(args.ids.split(',')) if args.ids else None
    records=[]
    for request in Read(scripts/'Data_FirstLevelSourceRequests.json'):
        name=request['id']
        if selected is not None and name not in selected:continue
        folder=root/'Video/Sources/FirstLevelV1'/name;assessment=folder/'Data_SourceAssessment.json'
        if not assessment.exists():continue
        assessed=Read(assessment)
        # The first two historical assessments predate the explicit boolean.
        # Their screened status permits observations only, never 3D acceptance.
        if assessed.get('retakeRequired',assessed.get('status')!='contact_sheet_screened_pending_motion_review'):continue
        receipt=Read(folder/'Data_GenerationResult.json')
        if receipt['gen_status']!='success':continue
        video=folder/Path(receipt['result_json']['videos'][0]['path']).name
        assert video.is_file() and receipt['submit_id'] in video.name
        assert Hash(video)==assessed['sourceVideoSha256']
        cache=root/'Models/_Cache/FirstLevelV1'/name
        prior=cache/'Data_ObservationPreparation.json';recovery=cache/'Data_Recovery.json'
        if recovery.exists():
            assert Read(recovery)['sourceSha256']==Hash(video)
            continue
        if prior.exists():
            assert Read(prior)['sourceSha256']==Hash(video)
            assert all((cache/p).is_file() for p in ['0_input_video.mp4','preprocess/bbx.pt','preprocess/vitpose.pt','preprocess/vit_features.pt'])
            dense=folder/'DenseReview/Data_ObservationReviewFrames.json'
            if dense.exists():
                reviewed=Read(dense)
                assert reviewed['sourceVideoSha256']==Hash(video)
                assert reviewed['inputSha256']==Hash(cache/'0_input_video.mp4')
                assert reviewed['keypointsSha256']==Hash(cache/'preprocess/vitpose.pt')
                assert all((root/sheet['path']).is_file() for sheet in reviewed['sheets'])
                continue
        assert not (cache/'Data_GvhmrMotion.npz').exists() and not (cache/'hmr4d_results.pt').exists(),'Unregistered prediction must be reconciled first'
        records.append(dict(id=name,source=video.relative_to(root).as_posix(),sourceSha256=Hash(video),
            assessment=assessment.relative_to(root).as_posix(),assessmentSha256=Hash(assessment),
            reuseObservations=prior.exists(),status='queued'))
    print(json.dumps(dict(pending=len(records),ids=[r['id'] for r in records],newVideoGenerations=0,newInferenceRuns=0)),flush=True)
    if not args.run:return
    out=root/'Models'/args.group;out.mkdir(parents=True,exist_ok=True)
    reportPath=out/'Data_ObservationBatch.json'
    assert not reportPath.exists(),'Use a new batch report group; completed caches will be skipped'
    report=dict(createdUtc=datetime.datetime.now(datetime.timezone.utc).isoformat(),status='running',device=args.device,
        scope='2D observations and dense review sheets only; no video generation, no 3D inference, no acceptance',
        newVideoGenerations=0,newInferenceRuns=0,sources=records)
    def Save():
        report['updatedUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat()
        reportPath.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    Save();env={**os.environ,'PYTHONUTF8':'1','PYTHONIOENCODING':'utf-8'}
    for record in records:
        name=record['id'];cache=root/'Models/_Cache/FirstLevelV1'/name
        record['status']='preparing_observations';Save()
        commands=[('Observe',[sys.executable,str(scripts/'Script_MotionRecover.py'),'--name',name,'--source',str(root/record['source']),
            '--output',str(cache.parent),'--preprocess-only','--preprocess-device',args.device]),
            ('Dense',[sys.executable,str(scripts/'Script_FirstLevelSourceDenseInspect.py'),'--root',str(root),'--ids',name,'--observations'])]
        if record['reuseObservations']:
            commands=commands[1:]
        cachedHashes={p:Hash(cache/p) for p in ['0_input_video.mp4','preprocess/bbx.pt','preprocess/vitpose.pt','preprocess/vit_features.pt']} if record['reuseObservations'] else None
        try:
            assert Hash(root/record['source'])==record['sourceSha256']
            for stage,command in commands:
                logfile=out/f'Data_{name}{stage}.log'
                with logfile.open('w',encoding='utf-8') as stream:
                    result=subprocess.run(command,stdout=stream,stderr=subprocess.STDOUT,env=env)
                assert result.returncode==0,f'{name}/{stage} exited {result.returncode}; see {logfile.name}'
            if cachedHashes is not None:
                assert cachedHashes=={p:Hash(cache/p) for p in cachedHashes},'Dense review modified observations'
            evidence=[cache/'Data_ObservationPreparation.json',cache/'0_input_video.mp4',cache/'preprocess/vitpose.pt',
                cache/'preprocess/bbx.pt',cache/'preprocess/vit_features.pt',root/'Video/Sources/FirstLevelV1'/name/'DenseReview/Data_ObservationReviewFrames.json']
            assert Read(evidence[0])['sourceSha256']==record['sourceSha256']
            assert not (cache/'hmr4d_results.pt').exists() and not (cache/'Data_GvhmrMotion.npz').exists()
            record.update(status='observations_ready_pending_visual_review',evidence=[dict(path=p.relative_to(root).as_posix(),sha256=Hash(p)) for p in evidence])
        except Exception as error:
            record.update(status='failed_preserved_for_diagnosis',error=str(error));Save()
            report['status']='stopped_on_failure';Save();raise
        Save();print(json.dumps(dict(id=name,status=record['status'])),flush=True)
    report['status']='observations_prepared_pending_visual_review';Save()


if __name__=='__main__':Main()
