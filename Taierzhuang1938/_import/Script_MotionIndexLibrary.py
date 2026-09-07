from pathlib import Path
import argparse,json,struct,re
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path);args=parser.parse_args()
root=args.root or Path(__file__).resolve().parent.parent
manifest=json.loads((root/'Data_ArchiveManifest.json').read_text(encoding='utf-8'))['records']
def Find(suffix):
    suffix=suffix.replace('\\','/')
    return next((r['path'] for r in manifest if r['source'].replace('\\','/').endswith(suffix)),None)
def Clips(path):
    with (root/path).open('rb') as stream:
        stream.seek(12);n,_=struct.unpack('<II',stream.read(8));data=json.loads(stream.read(n))
    return [a['name'] for a in data.get('animations',[])]
names={'CarryStretcherFront':'抬担架 · 前位','CarryStretcherRear':'抬担架 · 后位','WoundedLimp':'伤员跛行','RifleCrouchAdvance':'持枪低姿前进','StandToKneel':'站立 → 跪下','KneelHold':'跪姿保持','KneelToStand':'跪姿 → 站立','GrenadeThrow':'投掷手榴弹','BackRifleRun':'背枪跑步'}
actions={}
def Entry(name):
    return actions.setdefault(name,{'id':name,'label':names.get(name,name),'loop':name not in ['StandToKneel','KneelToStand','GrenadeThrow'],'variants':[]})
for name in names:Entry(name)
for faction in ['Nra','Ija']:
    path=f'Models/SourceCharacters/Model_Lugou{faction}01.glb'
    for clip in Clips(path):Entry(clip)['variants'].append({'id':f'{faction}-original-{clip}','faction':faction,'label':'原游戏动作','path':path,'clip':clip,'status':'历史版本','sourceKind':'legacy_rtmw3d' if clip in ['CarryStretcherFront','CarryStretcherRear','WoundedLimp'] else 'legacy_bip_fbx'})
    for clip in ['RifleCrouchAdvance','StandToKneel','KneelHold','KneelToStand','GrenadeThrow']:
        path=Find(f'GameIntegration/Standalone/Animation_{faction}_{clip}_Game.glb')
        Entry(clip)['variants'].append({'id':f'{faction}-v1-{clip}','faction':faction,'label':'V1 · 已接入游戏','path':path,'clip':Clips(path)[0],'status':'历史版本','blend':Find('GameIntegration/Scene_InfantryGameIntegration.blend')})
path=Find('Deliverables/Animation_NraSeedanceBackRun.glb')
if path:Entry('BackRifleRun')['variants'].append({'id':'Nra-backrun','faction':'Nra','label':'背枪跑步 · 现有版','path':path,'clip':Clips(path)[0],'blend':Find('Deliverables/Scene_NraSeedanceBackRun.blend')})
for name in ['CarryStretcherFront','CarryStretcherRear']:Entry(name)['source']=Find('mocap/Video_StretcherWalk.mp4')
Entry('WoundedLimp')['source']=Find('mocap/Video_WoundedLimp.mp4')
for clip in ['RifleCrouchAdvance','StandToKneel','KneelHold','KneelToStand','GrenadeThrow']:
    source='RifleKneelTransition' if clip in ['StandToKneel','KneelHold','KneelToStand'] else clip
    Entry(clip)['source']=Find(f'Capture/{source}/0_input_video.mp4')
# Revision manifests add new clips, factions and versions without changing the player.
def ManifestRevision(file):
    data=json.loads(file.read_text(encoding='utf-8'))
    return max((v.get('revisionOrder',int(m.group(1)) if (m:=re.search(r'-v(\d+)-',v['id'])) else 0)
        for a in data['actions'] for v in a['variants']),default=0),file.as_posix()
# A new batch directory need not sort after ReviewV7 alphabetically. Metadata
# such as framing belongs to the highest revision just as the default clip does.
for file in sorted((root/'Models').glob('*/Data_Versions.json'),key=ManifestRevision):
    for item in json.loads(file.read_text(encoding='utf-8'))['actions']:
        entry=Entry(item['id']);entry.update({k:v for k,v in item.items() if k!='variants'});entry['variants']=item['variants']+entry['variants']
mappingPath=root/'Models/RecoveryPreview/Data_SourceMappings.json'
mappings=json.loads(mappingPath.read_text(encoding='utf-8')) if mappingPath.exists() else {}
for entry in actions.values():
    mapping=mappings.get(entry['id'],{})
    for variant in entry['variants']:
        if 'review' in variant:continue
        if '-v2-' in variant['id'] or variant['id']=='Nra-backrun':variant['review']=mapping.get('latest')
        elif '-v1-' in variant['id']:variant['review']=mapping.get('history',{}).get('v1')
    def Revision(variant):
        match=re.search(r'-v(\d+)-',variant['id']);return variant.get('revisionOrder',int(match[1]) if match else 0)
    entry['variants'].sort(key=Revision,reverse=True)
    entry['category']='split_experiment' if any((v.get('review') or {}).get('sourceQuality')=='not_strict_single_person' for v in entry['variants']) else 'video_recovery' if any(v.get('review') for v in entry['variants']) else 'legacy_bip_fbx' if all(v.get('sourceKind')=='legacy_bip_fbx' for v in entry['variants']) else 'source_unregistered'
    entry['latestByFaction']={}
    for variant in entry['variants']:entry['latestByFaction'].setdefault(variant['faction'],variant['id'])
catalog={'schemaVersion':2,'defaultView':'source-recovery-latest','actions':[e for e in actions.values() if e['variants']]}
(root/'Preview/Data_Catalog.json').write_text(json.dumps(catalog,indent=2,ensure_ascii=False),encoding='utf-8')
print('Indexed',len(catalog['actions']),'actions')
