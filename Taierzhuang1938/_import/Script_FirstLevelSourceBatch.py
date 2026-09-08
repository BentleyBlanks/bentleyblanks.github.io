"""Resumable, receipt-driven source batch. This never retries a submitted job.

The credit ceiling includes existing submissions in this batch. No purchase,
automatic regeneration, or uncertain-submission retry is performed here.
"""
from pathlib import Path
import argparse
import json
import os
import subprocess
import sys
import time


def AcquireBatchLock(directory):
    """Allow one controller; the OS releases its lock if the process crashes."""
    lease=(directory/'Data_Batch.lock').open('a+b')
    if not lease.tell():
        lease.write(b'0');lease.flush()
    lease.seek(0)
    try:
        if os.name=='nt':
            import msvcrt
            msvcrt.locking(lease.fileno(),msvcrt.LK_NBLCK,1)
        else:
            import fcntl
            fcntl.flock(lease.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
    except OSError:
        lease.close()
        raise RuntimeError('This library already has an active source batch; observe that process.')
    return lease


def Main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',type=Path,required=True)
    parser.add_argument('--max-credits',type=int,required=True)
    parser.add_argument('--concurrency',type=int,default=3)
    args=parser.parse_args()
    root=args.root.resolve()
    folder=Path(__file__).resolve().parent
    policy=json.loads((folder/'Data_FirstLevelSourcePolicy.json').read_text(encoding='utf-8'))
    if not policy['allowNewVideoGeneration']:
        raise RuntimeError('Current user policy is existing_sources_only; use existing receipts/raw caches instead of a generation batch')
    requests=json.loads((folder/'Data_FirstLevelSourceRequests.json').read_text(encoding='utf-8'))
    requestById={r['id']:r for r in requests}
    out=root/'Models/FirstLevelSourceBatchV1'
    lease=AcquireBatchLock(out)
    plan=json.loads((out/'Data_CoveragePlan.json').read_text(encoding='utf-8'))
    # Cover every requirement before adding its remaining variants/role tracks.
    order=[]
    covered={r['requirementId'] for r in plan['requirements'] if r['reused']}
    for row in plan['requirements']:
        if row['requirementId'] in covered:
            continue
        name=row['newSources'][0]
        if name not in order:
            order.append(name)
        covered.update(requestById[name]['requirementIds'])
    order.extend(r['id'] for r in requests if r['id'] not in order)
    requestRoot=root/'Video/Sources/FirstLevelV1'
    ledgerPath=out/'Data_BatchStatus.json'
    lastStatus={}

    def Read(file):
        return json.loads(file.read_text(encoding='utf-8')) if file.exists() else None

    def Inspect(name):
        request=requestById[name]
        directory=requestRoot/name
        submit=Read(directory/'Data_GenerationSubmit.json')
        result=Read(directory/'Data_GenerationResult.json')
        state=dict(id=name,requirementIds=request['requirementIds'],expectedCredits=request['expectedCredits'],
            status='unsubmitted',submitId=None,committedCredits=0)
        if submit:
            value=result or submit
            state.update(status=value.get('gen_status','uncertain_submission'),submitId=submit.get('submit_id'),
                committedCredits=submit.get('credit_count',request['expectedCredits'] if submit.get('submit_id') or submit.get('status')=='submitting' else 0))
            if state['status']=='fail':
                state['failReason']=value.get('fail_reason','No reason returned by the service')
            if state['status']=='success':
                videos=value.get('result_json',{}).get('videos',[])
                files=[directory/Path(v['path']).name for v in videos]
                state['files']=[str(p) for p in files]
                if not files or not all(p.is_file() and p.stat().st_size>0 for p in files):
                    state['status']='success_download_missing'
                state['sourceAcceptance']='not_reviewed' if not (directory/'Data_SourceAssessment.json').exists() else 'see_source_assessment'
            reconciliation=Read(directory/'Data_GenerationReconciliation.json')
            if reconciliation and reconciliation.get('status')=='needs_provider_reconciliation' and state['status']!='success':
                assert reconciliation['submitId']==state['submitId'],'Reconciliation must identify the original request'
                state.update(serviceStatus=state['status'],status='uncertain_submission',
                    reconciliation='Video/Sources/FirstLevelV1/'+name+'/Data_GenerationReconciliation.json')
        return state

    def Run(name,query=False):
        command=[sys.executable,str(folder/'Script_FirstLevelSourceGenerate.py'),'--root',str(root),'--id',name]
        if query:command.append('--query')
        result=subprocess.run(command,capture_output=True)
        if result.returncode:
            # Receipts remain authoritative; a transient observation failure is
            # not a failed service job and must not trigger a new submission.
            log=requestRoot/name/('Data_BatchQueryError.txt' if query else 'Data_BatchSubmitError.txt')
            log.write_bytes(result.stdout+b'\n'+result.stderr)
            print(json.dumps(dict(event='query_error' if query else 'submit_error',id=name,log=str(log)),ensure_ascii=True),flush=True)

    while True:
        states=[Inspect(name) for name in order]
        committed=sum(s['committedCredits'] for s in states)
        active=[s for s in states if s['submitId'] and s['status'] in ('querying','success_download_missing')]
        for state in active:
            Run(state['id'],True)
        states=[Inspect(name) for name in order]
        active=[s for s in states if s['submitId'] and s['status'] in ('querying','success_download_missing')]
        for state in states:
            if len(active)>=args.concurrency:
                break
            if state['status']!='unsubmitted':
                continue
            if committed+state['expectedCredits']>args.max_credits:
                continue
            Run(state['id'])
            updated=Inspect(state['id'])
            committed+=updated['committedCredits']
            if updated['submitId'] and updated['status'] in ('querying','success_download_missing'):
                active.append(updated)
        states=[Inspect(name) for name in order]
        committed=sum(s['committedCredits'] for s in states)
        for state in states:
            if state['status']=='unsubmitted' and committed+state['expectedCredits']>args.max_credits:
                state['status']='waiting_for_credit'
            if state['status']!=lastStatus.get(state['id']):
                if state['status']!='unsubmitted':
                    print(json.dumps(dict(event='source_state',**state),ensure_ascii=True),flush=True)
                lastStatus[state['id']]=state['status']
        summary={status:sum(s['status']==status for s in states) for status in sorted({s['status'] for s in states})}
        report=dict(updatedUnix=time.time(),status='running' if active else 'stopped',creditCeiling=args.max_credits,
            committedCredits=committed,creditPolicy='Conservative reservation; failed-job refunds are not assumed.',summary=summary,sources=states)
        temporary=ledgerPath.with_suffix('.tmp')
        temporary.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        temporary.replace(ledgerPath)
        if not active:
            print(json.dumps(dict(event='batch_terminal',committedCredits=committed,summary=summary)),flush=True)
            lease.close()
            return
        time.sleep(30)


if __name__=='__main__':
    Main()
