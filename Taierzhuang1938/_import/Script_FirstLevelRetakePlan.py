"""Prepare evidence-linked replacement requests without submitting or spending."""
from pathlib import Path
import argparse, datetime, hashlib, json

parser=argparse.ArgumentParser()
parser.add_argument('--root',type=Path,required=True)
parser.add_argument('--observed-balance',type=int,required=True)
args=parser.parse_args()
assert args.observed_balance>=0
root=args.root.resolve()
folder=Path(__file__).resolve().parent
Read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
Hash=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
changes=Read(folder/'Data_FirstLevelSourceRetakeChanges.json')
requests={r['id']:r for r in Read(folder/'Data_FirstLevelSourceRequests.json')}
inspection=Read(root/'Models/FirstLevelSourceBatchV1/Data_SourceInspection.json')
rejected={r['id']:r for r in inspection['sources'] if r.get('assessment',{}).get('retakeRequired')}
batch=Read(root/'Models/FirstLevelSourceBatchV1/Data_BatchStatus.json')
failed={r['id']:r for r in batch['sources'] if r['status']=='fail'}
assert set(changes['actions'])==set(rejected)|set(failed), 'Reconcile new findings before drafting a new batch'
out=root/'Models/FirstLevelSourceRetakeV2'
out.mkdir(parents=True,exist_ok=True)
rows=[]
for name,action in changes['actions'].items():
    original=requests[name]
    receipt=root/'Video/Sources/FirstLevelV1'/name/'Data_GenerationResult.json'
    result=Read(receipt)
    assert result['gen_status']==('success' if name in rejected else 'fail'), name
    if name in rejected:assert Hash(root/rejected[name]['sourceVideo'])==rejected[name]['sourceSha256']
    prompt=f"一段{original['durationSeconds']}秒的视频。"+changes['commonPrompt']+action
    rows.append(dict(id=name,requirementIds=original['requirementIds'],modelVersion=original['modelVersion'],
        durationSeconds=original['durationSeconds'],expectedCredits=original['expectedCredits'],
        status='prepared_not_submitted',outputDirectory=f'Video/Sources/FirstLevelRetakeV2/{name}',
        originalSubmitId=result['submit_id'],originalReceiptSha256=Hash(receipt),
        reason=rejected[name]['assessment']['limitations'] if name in rejected else 'Provider failed the original request',
        originalSourceSha256=rejected[name]['sourceSha256'] if name in rejected else None,
        prompt=prompt,promptSha256=hashlib.sha256(prompt.encode('utf-8')).hexdigest()))
estimated=sum(r['expectedCredits'] for r in rows)
report=dict(status='prepared_not_submitted',recordedUtc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    submitted=False,spentCredits=0,sourceCount=len(rows),expectedCredits=estimated,
    observedBalance=args.observed_balance,additionalCreditsAtObservedBalance=max(0,estimated-args.observed_balance),
    estimateScope='One attempt at original duration/model per known retake/failure; excludes unresolved submissions and later review findings.',
    excludedPending=[dict(id=r['id'],submitId=r['submitId'],status=r['status']) for r in batch['sources'] if r['status'] in ['uncertain_submission','querying']],
    requests=rows)
target=out/'Data_RetakePlan.json'
if target.exists():
    previous=Read(target)
    assert not previous['submitted'] and previous['spentCredits']==0,'Submitted plans must be versioned'
target.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='requests'},ensure_ascii=False))
