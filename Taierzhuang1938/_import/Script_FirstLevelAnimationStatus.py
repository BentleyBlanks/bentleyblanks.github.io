"""Build an evidence-based mission handoff; missing source is never a fake clip."""
from pathlib import Path
import argparse, hashlib, json, re, subprocess


def Main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',type=Path,required=True)
    args=parser.parse_args()
    root=args.root.resolve()
    project=Path(__file__).resolve().parents[1]
    catalog=json.loads((root/'Preview/Data_Catalog.json').read_text(encoding='utf-8'))
    Hash=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
    Read=lambda p:json.loads(p.read_text(encoding='utf-8'))
    required=project/'docs/Data_FirstLevelMissionAnimationRequirements.md'
    priorities={f'FL{i:02}' for i in [13,14,15,16,17,18,19,20,21,23,24,25,26,27,33,35,36,37,38,39,40,43,44,45,46]}
    stageById={13:['Train'],14:['Train'],15:['Train'],16:['Train'],17:['Train'],
        18:['Unloading'],19:['Unloading'],20:['Unloading'],21:['Unloading'],
        23:['MachineGun'],24:['Orders','Rescue'],25:['Orders','Carry','FinalCarry'],
        26:['South','Courtyard','Transfer','RetreatFirst','RetreatWall','RetreatYard'],
        27:['South','Transfer','Carry'],33:['AirFirst','Dive'],35:['Carry','FinalCarry'],
        36:['Dive'],37:['Rescue'],38:['RetreatWall'],39:['RetreatFirst','RetreatWall','RetreatYard','Death'],
        40:['AirFirst','RetreatWall','FinalDefense'],43:['FinalCarry','Death'],44:['Death'],45:['Death'],46:['FinalDefense','Exit']}
    rows=[]
    for line in required.read_text(encoding='utf-8').splitlines():
        match=re.match(r'^\| (FL\d+)／([ABC]) \| (.*?) \| (.*?) \|$',line)
        if not match:continue
        rid,priority,label,requirements=match.groups()
        rows.append(dict(requirementId=rid,priority=priority,label=label,acceptanceRequirements=requirements,
            actorRoles=[],sourceVideo=None,sourceVideoSha256=None,sourceRangeSeconds=None,
            recoveryRevision=None,sourceCacheSha256=None,clipName=None,faction=None,modelVariants=[],
            loop=None,referenceSpeedMps=None,rootMotionMode=None,contacts=[],events=[],entryPose=None,exitPose=None,
            interruptPolicy='Animation must not write mission facts, population, inventory, camera or patient identity.',
            blendFile=None,previewId=None,revisionLabel=None,
            status='source_missing' if rid in priorities else 'not_started_this_batch',
            runtimeBinding=dict(enabled=False,stages=stageById.get(int(rid[2:]),[])),reviewEvidence=[],
            blockers=['No matching dedicated source/recovery was found in the inspected library.'] if rid in priorities else []))
    for row in rows:
        if row['requirementId']=='FL25':
            row['blockers']=['Existing carry walk does not provide pickup, double-support hold, put-down or release transitions.']
        if row['requirementId']=='FL26':
            variants=[]
            for name in ['CarryStretcherFront','CarryStretcherRear','StretcherPair']:
                action=next(a for a in catalog['actions'] if a['id']==name)
                variant=next(v for v in action['variants'] if v['id']=='Nra-v9-'+name)
                raw=Read(root/variant['review']['recoveryTracks'][0]['path'])
                variants.append(dict(previewId=name,variantId=variant['id'],clipName=variant['clip'],
                    path=variant['path'],blendFile=variant['blend'],sourceVideo=variant['review']['sourceVideo'],
                    sourceVideoSha256=Hash(root/variant['review']['sourceVideo']),
                    sourceRangeSeconds=variant['review']['sourceRangeSeconds'],
                    recoveryTracks=variant['review']['recoveryTracks'],recoveryRevision=2,
                    sourceCacheSha256=raw['sourceCacheSha256'],
                    previewUrl='http://127.0.0.1:8136/Preview/index.html?action='+name))
            row.update(actorRoles=['litter.frontBearer','litter.rearBearer'],faction='Nra',
                modelVariants=['LugouNra01','LugouNra02','LugouNra03','LugouNra04'],
                sourceVideo=variants[0]['sourceVideo'],sourceVideoSha256=variants[0]['sourceVideoSha256'],
                sourceRangeSeconds=variants[0]['sourceRangeSeconds'],recoveryRevision=2,
                sourceCacheSha256=[v['sourceCacheSha256'] for v in variants[:2]],
                clipName=[v['clipName'] for v in variants[:2]],loop=True,rootMotionMode='in_place_with_explicit_assembly_translation',
                referenceSpeedMps=None,entryPose='walking',exitPose='walking',
                revisionLabel='V9 first-level rigid prop contact pilot; V7 body and lower limbs retained',
                status='needs_correction',previewId='StretcherPair',blendFile=variants[-1]['blendFile'],variants=variants,
                contacts=[dict(prop='CreateP012StretcherGeometry',railSpacingM=.58,railLengthM=2.15,
                    longitudinalGripsM=[-1,1],sourceSeconds=[137/30,197/30],correction='authored arms and fingers, not raw GVHMR')],
                blockers=['Two-person cropped input is experimental, not strict single-person recovery.',
                    'Finger/thumb wrap and forearm contact require close review; constrained palm points alone are insufficient.',
                    'NRA02/NRA03 original skin soles penetrate ground by approximately 4–5 mm.',
                    'No double-support idle, start/stop, turn, slope or threshold transition is available.',
                    'Nominal ground speed requires measurement; original monocular translation is not calibrated.',
                    'Mission still renders whitebox bearers; candidates are not enabled.'],
                reviewEvidence=['Models/ReviewV7/Data_SelectedExportFidelityValidation.json',
                    'Models/FirstLevelCarryV9/Data_ContactValidation.json',
                    'Preview/FirstLevelCarryV9/Data_ExportValidation.json',
                    'Models/FirstLevelCarryV9/GameIntegration/Data_BrowserValidation.json'])
    files=['Data_FirstLevelMission.mjs','Data_FirstLevelMissionDialogue.mjs','Data_FirstLevelMissionTrain.mjs',
        'Data_Tuning_FirstLevel.mjs','Script_FirstLevelMissionRuntime.mjs','Script_FirstLevelMissionColumn.mjs',
        'Script_FirstLevelMissionVoice.mjs','Script_FirstLevelMissionTrain.mjs','Audio/FirstLevel/Data_FirstLevelVoiceManifest.json']
    report=dict(schemaVersion=1,updated='2026-09-07',baseCommit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=project,text=True).strip(),
        libraryRoot=str(root),catalogSha256=Hash(root/'Preview/Data_Catalog.json'),requirementsSha256=Hash(required),
        missionBaselineFiles={p:Hash(project/p) for p in files},
        population=dict(trainRecruits=40,trainNpcsIncludingLuo=41,carRecruits=[8,24,8],litters=20,
            walkingWounded=36,medics=14,civilians=8,guards=8,zhouPatientId='Litter11'),
        timing=dict(status='recorded_segment_timeline_missing_in_current_master',
            retainedContinuousRecordings=True,animationDialogueOffsetsInvented=False,
            note='Current voice player still allocates subtitle timing by text length. Wait for actual audio segment IDs and recorded source ranges before binding gesture offsets.'),
        sourceSearch=dict(directories=[str(root/'Video/Sources'),'C:/Users/Bentl/Downloads/GVHMR'],
            catalogActions=len(catalog['actions']),newVideoGenerations=0,newInferenceRuns=0),
        priorityRequirementIds=sorted(priorities),requirements=rows)
    text=json.dumps(report,ensure_ascii=False,indent=2)+'\n'
    (project/'docs/Data_FirstLevelMissionAnimationStatus.json').write_text(text,encoding='utf-8')
    (root/'Models/FirstLevelCarryV9/Data_MissionStatus.json').write_text(text,encoding='utf-8')
    print(json.dumps(dict(requirements=len(rows),priority=len(priorities),status='partial_missing_sources'),ensure_ascii=False))


if __name__=='__main__':Main()
