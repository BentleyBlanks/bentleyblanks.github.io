"""Refresh the local delivery manifest; historical archive inventory stays immutable."""
from pathlib import Path
from datetime import datetime,timezone
import argparse,hashlib,json,re

parser=argparse.ArgumentParser()
parser.add_argument('--root',type=Path,required=True)
args=parser.parse_args()
root=args.root.resolve()
target=root/'Data_DeliveryManifest.json'
previous=json.loads(target.read_text(encoding='utf-8')) if target.exists() else {'files':[]}
paths={root/item['path'] for item in previous['files']}
# Follow registered version directories as well as historical naming patterns.
# Mission batches such as FirstLevelCarryV9 are valid without a ReviewV prefix.
catalogPath=root/'Preview/Data_Catalog.json'
if catalogPath.exists():
    catalog=json.loads(catalogPath.read_text(encoding='utf-8'))
    for action in catalog['actions']:
        for variant in action['variants']:
            for key in ['path','blend']:
                if not variant.get(key):continue
                folder=(root/variant[key]).resolve().parent
                assert folder.is_relative_to(root),folder
                paths.update(p for p in folder.rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix!='.log')
for pattern in ['Models/ReviewV*','Blender/ReviewV*','Models/DeathCollapseV*','Blender/DeathCollapseV*',
    'Models/NextTenV*','Blender/NextTenV*','Models/MeleeVideoV*','Blender/MeleeVideoV*',
    'Models/RecoveryPreview','Blender/RawRecovery','Models/SourceWeapons','Models/_Pipeline',
    'Models/FirstLevelSourceBatchV*','Models/FirstLevelSourceRetakeV*','Models/FirstLevelTrainSupportV*','Blender/FirstLevelTrainSupportV*','Models/FirstLevelTrainGameV*',
    'Models/FirstLevelStairFitV*',
    'Models/_Cache/*','Video/Sources/*','Preview']:
    for folder in root.glob(pattern):
        paths.update(p for p in folder.rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix not in ['.log'])
paths.update(p for name in ['Data_ReadMe.md','Data_Standard.md'] if (p:=root/name).is_file())
paths.update(p for p in root.glob('Data_ReviewV*.md') if p.is_file())
records=[]
for file in sorted(paths):
    assert file.resolve().is_relative_to(root) and file.is_file(),file
    with file.open('rb') as stream: digest=hashlib.file_digest(stream,'sha256').hexdigest()
    records.append({'path':file.relative_to(root).as_posix(),'bytes':file.stat().st_size,'sha256':digest})
groups={}
for record in records:
    parts=Path(record['path']).parts
    if parts[0] not in ['Models','Blender'] or len(parts)<3: continue
    group=parts[1]
    suffix=Path(record['path']).suffix
    if suffix in ['.glb','.blend']:
        counts=groups.setdefault(group,{'glb':0,'blend':0})
        counts[suffix[1:]]+=1
archive=root/'Data_ArchiveManifest.json'
integrations=[]
for candidate in root.glob('Models/FirstLevelTrainGameV*/Data_GameIntegration.json'):
    reviewPath=candidate.with_name('Data_VisualAssessment.json')
    if not reviewPath.exists():continue
    review=json.loads(reviewPath.read_text(encoding='utf-8'))
    digest=hashlib.sha256(candidate.read_bytes()).hexdigest()
    assert review['frozen'] and review['gameIntegrationSha256']==digest, candidate
    accepted=json.loads(candidate.read_text(encoding='utf-8'))
    integrations.append({'path':candidate.relative_to(root).as_posix(),'sha256':digest,
        'status':accepted['status'],'requirementScopes':accepted['requirementScopes']})
previewVersion=re.search(r'Script_SourceReview\.mjs\?v=([^"\s]+)',(root/'Preview/index.html').read_text(encoding='utf-8'))
report={'schemaVersion':2,'updatedAt':datetime.now(timezone.utc).isoformat(),
    'status':'partial_runtime_integration_remaining_local_review' if integrations else 'local_review_not_accepted_for_production',
    'runtimeIntegrations':integrations,'defaultView':'source-recovery-latest',
    'previewRevision':'SourceRecoveryLatest_'+previewVersion.group(1) if previewVersion else None,'groups':groups,
    'glbCount':sum(Path(f['path']).suffix=='.glb' for f in records),
    'blendCount':sum(Path(f['path']).suffix=='.blend' for f in records),
    'rawJointFileCount':len(list((root/'Models/RecoveryPreview').glob('Data_*RawJoints.json'))),
    'historicalArchive':{'path':'Data_ArchiveManifest.json','sha256':hashlib.sha256(archive.read_bytes()).hexdigest()},
    'files':records}
target.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='files'},ensure_ascii=False))
print('Hashed delivery files',len(records))
