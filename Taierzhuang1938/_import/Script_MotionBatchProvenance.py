"""Verify source/recovery hashes and collect unique generation receipts for this delivery."""
from pathlib import Path
from datetime import datetime, timezone
import argparse, hashlib, json

parser=argparse.ArgumentParser()
parser.add_argument('--root',type=Path,required=True)
parser.add_argument('--group',default='NextTenV1')
parser.add_argument('--revision',type=int,default=1)
parser.add_argument('--without-death',action='store_true')
args=parser.parse_args()
if args.revision<1:parser.error('--revision must be positive')
root=args.root.resolve()

def Read(path): return json.loads(path.read_text(encoding='utf-8'))
def Hash(path):
    with path.open('rb') as stream: return hashlib.file_digest(stream,'sha256').hexdigest()

recipes=Read(root/'Models'/args.group/'Data_Recipes.json')
receipts={}
records=[]
items=list(recipes.items())
if not args.without_death:items.insert(0,('DeathCollapse',{'group':'DeathCollapseV1','revision':1}))
for name,cfg in items:
    group=cfg.get('group',args.group);source=cfg.get('source',name);revision=cfg.get('revision',args.revision)
    sourceDir=root/'Video/Sources'/source
    sourcePath=sourceDir/f'Video_{source}.mp4'
    generation=Read(sourceDir/'Data_GenerationResult.json')
    assert generation['gen_status']=='success',name
    # Read the final result path; a glob may select a rejected earlier attempt.
    downloaded=Path(generation['result_json']['videos'][0]['path'])
    sourceHash=Hash(sourcePath)
    assert Hash(downloaded)==sourceHash,name
    cache=root/'Models/_Cache'/group/source
    recovery=Read(cache/'Data_Recovery.json')
    assert recovery['status']=='fresh_local_recovery' and recovery['predictionReused'] is False,name
    assert recovery['sourceSha256']==sourceHash,name
    assert recovery['resultSha256']==Hash(cache/'hmr4d_results.pt'),name
    raw=Read(root/f'Models/RecoveryPreview/Data_V{revision}_{name}RawJoints.json')
    assert raw['sourceCacheSha256']==Hash(cache/'Data_GvhmrMotion.npz'),name
    rigReport=f'Models/RecoveryPreview/Data_{name}RawRigValidation.json' if revision==1 else f'Models/RecoveryPreview/Data_V{revision}_{name}RawRigValidation.json'
    rig=Read(root/rigReport)
    assert rig['sourceCacheSha256']==raw['sourceCacheSha256'],name
    variants=Read(root/'Models'/group/'Data_Versions.json')['actions']
    entry=next(action for action in variants if action['id']==name)
    for variant in entry['variants']:
        for key in ['path','blend']: assert (root/variant[key]).is_file(),variant[key]
        assert variant['review']['sourceVideo']==sourcePath.relative_to(root).as_posix(),name
    motion=Read(root/'Models/_Cache'/group/f'Data_{name}Motion.json')
    records.append({'action':name,'sourceTask':source,'submitId':generation['submit_id'],
        'sourceVideo':sourcePath.relative_to(root).as_posix(),'sourceSha256':sourceHash,
        'recoveryCache':raw['sourceCache'],'recoverySha256':raw['sourceCacheSha256'],
        'predictionSha256':recovery['resultSha256'],
        'recoverySeconds':recovery['seconds'],'predictionReused':False,
        'sourceRangeSeconds':entry['variants'][0]['review']['sourceRangeSeconds'],
        'sourceAssessment':cfg.get('sourceAssessment'),
        'corrections':motion.get('corrections',['Retarget-only temporal filtering, local loop seam, contact IK and calibrated rifle grips']),
        'rawRigValidation':rigReport,
        'variants':[{'faction':v['faction'],'glb':v['path'],'blend':v['blend'],'status':v['status']} for v in entry['variants']]})
    for receiptPath in sourceDir.rglob('Data_GenerationResult*.json'):
        receipt=Read(receiptPath)
        if receipt.get('gen_status')!='success' or 'credit_count' not in receipt:continue
        key=receipt['submit_id'];credits=receipt['credit_count']
        if key in receipts: assert receipts[key]['credits']==credits,key
        receipts[key]={'submitId':key,'credits':credits,'receipt':receiptPath.relative_to(root).as_posix()}

report={'updatedAt':datetime.now(timezone.utc).isoformat(),'status':'local_review_not_accepted_for_production',
    'camera':'Requested fixed diagonal semi-overhead view near 45 degrees; generated angles are not calibrated camera measurements',
    'actions':records,'uniqueSuccessfulGenerationReceipts':list(receipts.values()),
    'receiptCreditsTotal':sum(r['credits'] for r in receipts.values()),
    'scope':f'{args.group} revision {args.revision}'+(' plus DeathCollapse' if not args.without_death else '')+'; includes rejected source attempts retained in History, excludes existing approved video reuse'}
target=root/'Models'/args.group/'Data_Production.json'
target.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'actions':len(records),'retargets':sum(len(r['variants']) for r in records),'rawRigs':len(records),'uniqueGenerationReceipts':len(receipts),'receiptCreditsTotal':report['receiptCreditsTotal']}))
