"""Expose original GVHMR joint arrays and source-time mappings for local review."""
from pathlib import Path
import argparse,json,hashlib
import numpy as np
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);args=parser.parse_args();root=args.root
archive=json.loads((root/'Data_ArchiveManifest.json').read_text(encoding='utf-8'))['records'];out=root/'Models/RecoveryPreview';out.mkdir(exist_ok=True)
def Find(suffix):
    return next((r['path'] for r in archive if r['source'].replace('\\','/').endswith(suffix)),None)
def Original(name):
    return next((r['path'] for r in archive if '/Sources/'+name+'/' in r['source'].replace('\\','/') and r['source'].endswith('.mp4')),None)
names=['Pelvis','LeftHip','RightHip','Spine1','LeftKnee','RightKnee','Spine2','LeftAnkle','RightAnkle','Spine3','LeftFoot','RightFoot','Neck','LeftCollar','RightCollar','Head','LeftShoulder','RightShoulder','LeftElbow','RightElbow','LeftWrist','RightWrist']
raw={}
for revision,sources in [('V2',['CarryStretcherFront','CarryStretcherRear','WoundedLimp','RifleCrouchAdvance','RifleKneelTransition']),('V1',['RifleCrouchAdvance','RifleKneelTransition','GrenadeThrow']),('BackRun',['Animation_SeedanceBackRunSecond'])]:
    for source in sources:
        path=root/'Models/_Cache/ReviewV2'/source/'Data_GvhmrMotion.npz' if revision=='V2' else root/Find(('InfantryActions_20260905/' if revision=='V1' else '')+f'Capture/{source}/Data_GvhmrMotion.npz')
        with np.load(path) as data:
            positions=data['worldJoints'];forward=data['worldGlobalRotations'][:20,0,:,2].mean(0)
            payload={'schemaVersion':1,'stage':'GVHMR worldJoints before retarget, filtering, IK or loop correction','sourceCache':path.relative_to(root).as_posix(),'sourceCacheSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'fps':float(data['fps']),'parents':data['parents'].tolist(),'jointNames':names,'positions':positions.tolist(),'viewerYawRadians':float(-np.arctan2(forward[0],forward[2])),'viewerOrigin':[float(positions[0,0,0]),0,float(positions[0,0,2])]}
        target=out/f'Data_{revision}_{source}RawJoints.json';target.write_text(json.dumps(payload,separators=(',',':')),encoding='utf-8');raw[(revision,source)]=target.relative_to(root).as_posix()
configs={
 'CarryStretcherFront':('CarryStretcherFront',Find('mocap/Video_StretcherWalk.mp4'),[137,197]),
 'CarryStretcherRear':('CarryStretcherRear',Find('mocap/Video_StretcherWalk.mp4'),[137,197]),
 'WoundedLimp':('WoundedLimp',Find('mocap/Video_WoundedLimp.mp4'),[30,137]),
 'RifleCrouchAdvance':('RifleCrouchAdvance',Original('RifleCrouchAdvance'),[30,129]),
 'StandToKneel':('RifleKneelTransition',Original('RifleKneelTransition'),[18,70]),
 'KneelHold':('RifleKneelTransition',Original('RifleKneelTransition'),[70,101]),
 'KneelToStand':('RifleKneelTransition',Original('RifleKneelTransition'),[101,148]),
 'KneelSequence':('RifleKneelTransition',Original('RifleKneelTransition'),[18,148]),
 'StretcherPair':('CarryStretcherFront',Find('mocap/Video_StretcherWalk.mp4'),[137,197]),
 'GrenadeThrow':('GrenadeThrow',Original('GrenadeThrow'),[17,144]),
 'BackRifleRun':('Animation_SeedanceBackRunSecond',Find('Capture/Animation_SeedanceBackRunSecond/0_input_video.mp4'),[130,151])}
v1Ranges={'RifleCrouchAdvance':[9,114],'StandToKneel':[18,70],'KneelHold':[70,96],'KneelToStand':[101,148],'GrenadeThrow':[17,144]}
mapping={}
for name,(source,video,span) in configs.items():
    revision='BackRun' if name=='BackRifleRun' else 'V1' if name=='GrenadeThrow' else 'V2'
    tracks=[{'path':raw[(revision,source)],'offset':[0,0,0]}]
    if name=='StretcherPair':tracks=[{'path':raw[('V2','CarryStretcherFront')],'offset':[0,0,1.25]},{'path':raw[('V2','CarryStretcherRear')],'offset':[0,0,-1.25]}]
    # These sources face left on screen; use the opposite viewing side, never mirror joints/video.
    sideYaw=np.pi/2 if name in ['CarryStretcherFront','CarryStretcherRear','StretcherPair','WoundedLimp'] else -np.pi/2
    latest={'sourceVideo':video,'sourceRangeSeconds':[f/30 for f in span],'recoveryTracks':tracks,'recoveryLabel':'GVHMR 原始恢复 · 未重定向、未修脚','recoveryFps':30,'sideCameraYawRadians':float(sideYaw)}
    if name=='StretcherPair':latest['recoveryLabel']='两人分别恢复 · 间距仅用于展示'
    if name in ['CarryStretcherFront','CarryStretcherRear','StretcherPair']:
        latest['sourceAssessment']='多人原片拆分实验：两名担架员分别裁剪推理；裁剪内仍可见伤员局部，不符合严格单人素材规范。两人间距与共用担架由后期组装。'
        latest['inferenceInputs']=[f'Models/_Cache/ReviewV2/{s}_Crop.mp4' for s in (['CarryStretcherFront','CarryStretcherRear'] if name=='StretcherPair' else [name])]
        latest['sourceQuality']='not_strict_single_person'
    history={}
    if name in v1Ranges:
        history['v1']={**latest,'sourceRangeSeconds':[f/30 for f in v1Ranges[name]],'recoveryTracks':[{'path':raw[('V1',source)],'offset':[0,0,0]}]}
    mapping[name]={'latest':latest,'history':history}
(out/'Data_SourceMappings.json').write_text(json.dumps(mapping,ensure_ascii=False,indent=2),encoding='utf-8')
print('Exported',len(raw),'unaltered recovery arrays;',len(mapping),'source mappings')
