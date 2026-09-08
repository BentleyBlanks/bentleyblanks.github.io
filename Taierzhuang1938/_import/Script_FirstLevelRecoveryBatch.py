"""Resume reviewed first-level sources without replacing observations or raw caches."""
from pathlib import Path
import argparse, hashlib, json, subprocess, sys
from Script_FirstLevelRecoveryPrepare import ReadReviewedSource


def Main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',type=Path,required=True)
    parser.add_argument('--group',required=True)
    parser.add_argument('--ids',required=True)
    parser.add_argument('--blender',type=Path,required=True)
    parser.add_argument('--allow-reviewed-source-limits',action='store_true')
    args=parser.parse_args();root=args.root.resolve();scripts=Path(__file__).resolve().parent
    out=root/'Models'/args.group;out.mkdir(parents=True,exist_ok=True)
    Read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
    Hash=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
    assert not (out/'Data_VisualAssessment.json').exists(),'Frozen/reviewed groups need a new revision'
    names=args.ids.split(',')
    def Run(label,command):
        log=out/f'Data_{label}.log';attempt=1
        while log.exists():
            attempt+=1;log=out/f'Data_{label}Retry{attempt}.log'
        print('START',label,flush=True)
        with log.open('w',encoding='utf-8') as stream:
            result=subprocess.run(command,cwd=scripts.parents[1],stdout=stream,stderr=subprocess.STDOUT)
        print('END',label,result.returncode,flush=True)
        if result.returncode:raise RuntimeError(str(log))
    for name in names:
        source=root/'Video/Sources/FirstLevelV1'/name;receipt=Read(source/'Data_GenerationResult.json')
        assert receipt['gen_status']=='success'
        video=source/Path(receipt['result_json']['videos'][0]['path']).name
        cache=root/'Models/_Cache/FirstLevelV1'/name;review,_=ReadReviewedSource(source,args.allow_reviewed_source_limits)
        assert Hash(video)==review['sourceVideoSha256']
        assert Hash(cache/'0_input_video.mp4')==review['observationInputSha256']
        assert Hash(cache/'preprocess/vitpose.pt')==review['keypointsSha256']
        hashes={n:Hash(cache/'preprocess'/n) for n in ['bbx.pt','vitpose.pt','vit_features.pt']}
        if not (cache/'Data_GvhmrMotion.npz').exists():
            assert not (cache/'hmr4d_results.pt').exists(),'Existing partial raw recovery requires explicit reconciliation'
            Run(name+'Recovery',[sys.executable,str(scripts/'Script_MotionRecover.py'),'--name',name,'--source',str(video),'--output',str(cache.parent)])
        recovery=Read(cache/'Data_Recovery.json')
        assert recovery['sourceSha256']==Hash(video) and recovery['cropFraction'] is None
        assert recovery['resultSha256']==Hash(cache/'hmr4d_results.pt')
        assert hashes=={n:Hash(cache/'preprocess'/n) for n in hashes},'Observation cache changed'
    if not (out/'Data_SourceInventory.json').exists():
        Run('SourceRegistration',[sys.executable,str(scripts/'Script_FirstLevelRecoveryPrepare.py'),'--root',str(root),'--group',args.group,'--ids',','.join(names)]+(['--allow-reviewed-source-limits'] if args.allow_reviewed_source_limits else []))
    assert {a['id'] for a in Read(out/'Data_SourceInventory.json')['actions']}==set(names)
    if not (out/'Data_Recipes.json').exists():
        Run('FidelityPreparation',[sys.executable,str(scripts/'Script_MotionFidelityPrepare.py'),'--root',str(root),'--group',args.group])
    for name in names:
        raw='Models/RecoveryPreview/Data_V1_'+name+'RawJoints.json'
        rig=root/'Models/RecoveryPreview'/('Data_V1_'+name+'RawRigValidation.json')
        if not rig.exists():
            Run(name+'RawRig',[str(args.blender),'--background','--python-exit-code','1','--python',str(scripts/'Script_MotionRawSkeleton.py'),'--','--root',str(root),'--raw',raw,'--name',name,'--revision','1'])
        else:
            report=Read(rig)
            assert report['sourceCacheSha256']==Read(root/raw)['sourceCacheSha256']
            assert all((root/report[k]).is_file() for k in ['blend','glb'])
        faction='Ija' if name=='EnemySignalAdvance' else 'Nra'
        reportPath=out/f'Data_{faction}_{name}_Validation.json'
        if not reportPath.exists():
            Run(name+'Retarget',[str(args.blender),'--background','--python-exit-code','1','--python',str(scripts/'Script_MotionFidelityBake.py'),'--','--root',str(root),'--group',args.group,'--revision','1','--faction',faction,'--clip',name])
        report=Read(reportPath)
        assert report['maxDirectionErrorDegrees']<.15 and report.get('maxWristDisplacementMeters',0)<.00002
        assert all((root/report['variants'][0][k]).is_file() for k in ['path','blend'])
    Run('RetargetRegistration',[sys.executable,str(scripts/'Script_MotionFidelityRegister.py'),'--root',str(root),'--group',args.group,'--revision','1'])
    Run('PreviewIndex',[sys.executable,str(root/'Preview/Script_IndexLibrary.py'),'--root',str(root)])
    print('DONE: raw and original-rig body candidates; contact/depth/game acceptance still pending',flush=True)


if __name__=='__main__':Main()
