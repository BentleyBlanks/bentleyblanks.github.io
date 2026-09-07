"""Build an evidence-based mission handoff; missing source is never a fake clip."""
from pathlib import Path
import argparse, hashlib, json, re, subprocess
from Script_FirstLevelRetargetEvidence import CollectRetargetEvidence


def Main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',type=Path,required=True)
    parser.add_argument('--carry-revision',type=int,default=10)
    args=parser.parse_args()
    root=args.root.resolve()
    revision=args.carry_revision
    group=f'FirstLevelCarryV{revision}'
    project=Path(__file__).resolve().parents[1]
    catalog=json.loads((root/'Preview/Data_Catalog.json').read_text(encoding='utf-8'))
    Hash=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
    Read=lambda p:json.loads(p.read_text(encoding='utf-8'))
    batch=Read(root/'Models/FirstLevelSourceBatchV1/Data_BatchStatus.json')
    coverage=Read(root/'Models/FirstLevelSourceBatchV1/Data_CoveragePlan.json')
    sourceStates={s['id']:s for s in batch['sources']}
    inspection=Read(root/'Models/FirstLevelSourceBatchV1/Data_SourceInspection.json')
    for record in inspection['sources']:
        sourceStates[record['id']]['mediaInspection']=record
    required=project/'docs/Data_FirstLevelMissionAnimationRequirements.md'
    priorities={f'FL{i:02}' for i in [13,14,15,16,17,18,19,20,21,23,24,25,26,27,33,35,36,37,38,39,40,43,44,45,46]}
    stageById={13:['Train'],14:['Train'],15:['Train'],16:['Train'],17:['Train'],
        18:['Unloading'],19:['Unloading'],20:['Unloading'],21:['Unloading'],
        23:['MachineGun'],24:['Orders','Rescue'],25:['Orders','Carry','FinalCarry'],
        26:['South','Courtyard','TransferApproach','Transfer','RetreatFirst','RetreatWall','RetreatYard'],
        27:['South','TransferApproach','Transfer','Carry'],33:['AirFirst','Dive'],35:['Carry','FinalCarry'],
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
                variant=next(v for v in action['variants'] if v['id']==f'Nra-v{revision}-'+name)
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
                revisionLabel=f'V{revision} first-level rigid prop contact pilot; V7 body and lower limbs retained',
                status='needs_correction',previewId='StretcherPair',blendFile=variants[-1]['blendFile'],variants=variants,
                contacts=[dict(prop='CreateP012StretcherGeometry',railSpacingM=.58,railLengthM=2.15,
                    longitudinalGripsM=[-1,1],sourceSeconds=[137/30,197/30],correction='authored arms and fingers, not raw GVHMR')],
                blockers=['Two-person cropped input is experimental, not strict single-person recovery.',
                    'V10 palm penetration improved using actual rail thickness; finger/thumb wrap and cuffs still require final close review.',
                    'A shared constant 5.5034 mm support offset clears NRA02/NRA03 soles; NRA01/NRA04 minimum remains approximately 9.5 mm above the plane. Foot sliding/support phases are not accepted.',
                    'No double-support idle, start/stop, turn, slope or threshold transition is available.',
                    'Nominal ground speed requires measurement; original monocular translation is not calibrated.',
                    'Mission still renders whitebox bearers; candidates are not enabled.'],
                reviewEvidence=['Models/ReviewV7/Data_SelectedExportFidelityValidation.json',
                    f'Models/{group}/Data_ContactValidation.json',
                    f'Preview/{group}/Data_ExportValidation.json',
                    f'Preview/{group}/Contacts/Data_ContactViews.json',
                    f'Models/{group}/GameIntegration/Data_BrowserValidation.json'])
    for row in rows:
        planned=next(r for r in coverage['requirements'] if r['requirementId']==row['requirementId'])
        row['newSourceProduction']=[sourceStates[name] for name in planned['newSources']]
        row['reusedSourceCandidates']=planned['reused']
        row['sourceRetakeIds']=[s['id'] for s in row['newSourceProduction'] if s.get('mediaInspection',{}).get('assessment',{}).get('retakeRequired')]
        if row['requirementId'] in ['FL13','FL21']:
            source=Read(root/'Video/Sources/FirstLevelV1/TrainBenchRise/Data_SourceAssessment.json')
            bench=next(a for a in catalog['actions'] if a['id']=='TrainBenchRise')
            latest=next(v for v in bench['variants'] if v['id']==bench['latestByFaction']['Nra'])
            history,assessment=CollectRetargetEvidence(root,root/'Video/Sources/FirstLevelV1/TrainBenchRise',bench,source['sourceVideoSha256'])
            row.update(actorRoles=['train.recruit'],status='partially_retargeted_requires_contact_review',
                sourceVideo=source['sourceVideo'],sourceVideoSha256=source['sourceVideoSha256'],
                sourceRangeSeconds=source['sourceRangeSeconds'],recoveryRevision=1,
                sourceCacheSha256=source['sourceCacheSha256'],clipName=latest['clip'],
                faction='Nra',modelVariants=['LugouNra01'],loop=False,rootMotionMode='source_relative',
                entryPose='seated',exitPose='standing',previewId='TrainBenchRise',
                blendFile=latest['blend'],variantId=latest['id'],retargetHistory=history,visualAssessment=assessment,
                revisionLabel=latest['review'].get('retargetNotes',latest['label']),
                blockers=['Full bench sequence only; current contact corrections and naturalness require version-specific review. Idle/rise boundaries and game model scale still need integration validation.',
                    'Other generated source targets require dense source review and recovery; first-pass retakes remain explicit.',
                    'Not enabled in mission; preserve the same 41 passengers and real queue.'],
                reviewEvidence=['Models/FirstLevelTrainV1/Data_SelectedExportFidelityValidation.json',
                    'Models/RecoveryPreview/Data_TrainBenchRiseRawRigValidation.json',
                    'Preview/Data_FirstLevelTrainV1PlaybackValidation.json',latest['review']['retargetReport']]+[h['path'] for h in history])
            support=root/'Models/FirstLevelTrainSupportV1'
            if (support/'Data_ProductionSkinValidation.json').exists():
                measured=Read(support/'Data_ProductionSkinValidation.json')
                projects=Read(support/'Data_EditableProjects.json')
                for result in measured['results']:
                    assert Hash(support/('Animation_'+result['id']+'FirstLevelTrainSupport.glb'))==result['animationSha256']
                row['productionSupportTrial']=dict(group='FirstLevelTrainSupportV1',status=measured['status'],runtimeEnabled=False,
                    models=projects['results'],failures=measured['failures'],
                    validation='Models/FirstLevelTrainSupportV1/Data_ProductionSkinValidation.json',
                    editableValidation='Models/FirstLevelTrainSupportV1/Data_EditableProjectValidation.json')
                row['blockers'].append('Production Support V1 fails temporal/height interpolation: retain its evidence and author a new version before runtime use.')
        elif row['requirementId']!='FL26':
            statuses=[s['status'] for s in row['newSourceProduction']]
            row['status']=('video_generation_in_progress' if 'querying' in statuses else
                'source_submission_needs_reconciliation' if 'uncertain_submission' in statuses else
                'source_generation_failed_partial' if 'fail' in statuses else
                'source_waiting_for_credit' if 'waiting_for_credit' in statuses else
                'source_review_retake_required' if row['sourceRetakeIds'] else
                'sources_generated_pending_review' if statuses and all(s=='success' for s in statuses) else
                'source_production_planned' if statuses else 'existing_source_requires_review')
            row['blockers']=['Source targets/reused candidates do not prove this complete requirement is accepted or integrated.']
        row['newRecoveryCandidates']=[]
        for source in row['newSourceProduction']:
            registration=root/'Video/Sources/FirstLevelV1'/source['id']/'Data_RecoveryRegistration.json'
            if not registration.exists():continue
            candidate=Read(registration)
            raw=Read(root/candidate['rawJointFile'])
            assert Hash(root/candidate['sourceVideo'])==candidate['sourceVideoSha256']
            assert Hash(root/raw['sourceCache'])==candidate['sourceCacheSha256']==raw['sourceCacheSha256']
            action=next((a for a in catalog['actions'] if a['id']==source['id']),None)
            if action:
                history,assessment=CollectRetargetEvidence(root,registration.parent,action,candidate['sourceVideoSha256'])
                candidate['retargetHistory']=history
                if assessment:candidate['visualAssessment']=assessment
                variant=next(v for v in action['variants'] if v['id']==action['latestByFaction']['Nra'])
                candidate['retargetCandidate']=dict(variantId=variant['id'],modelSha256=Hash(root/variant['path']),path=variant['path'],clip=variant['clip'],blend=variant['blend'],
                    previewUrl='http://127.0.0.1:8136/Preview/index.html?action='+source['id'],status=variant['status'])
                if candidate.get('visualAssessment'):
                    assert Hash(root/variant['path'])==candidate['visualAssessment']['modelSha256']
            row['newRecoveryCandidates'].append(candidate)
        if row['newRecoveryCandidates']:
            row['status']='partially_retargeted_requires_contact_review' if all('retargetCandidate' in c for c in row['newRecoveryCandidates']) else 'partially_recovered_pending_retarget'
            row['blockers'].append('Source depth errors and authored contact corrections are tracked per version. Props, clip boundaries and mission event binding are not accepted.')
    files=['Data_FirstLevelMission.mjs','Data_FirstLevelMissionDialogue.mjs','Data_FirstLevelMissionTrain.mjs',
        'Data_Tuning_FirstLevel.mjs','Script_FirstLevelMissionRuntime.mjs','Script_FirstLevelMissionColumn.mjs',
        'Script_FirstLevelMissionVoice.mjs','Script_FirstLevelMissionTrain.mjs','Audio/FirstLevel/Data_FirstLevelVoiceManifest.json',
        'Data_FirstLevelMissionVoiceAlignment.mjs','Data_FirstLevelMissionVoiceTiming.mjs']
    missionContract=json.loads(subprocess.check_output(['node','--input-type=module','-e',
        "import {MISSION_VERSION,MISSION_STAGES} from './Data_FirstLevelMission.mjs';"
        "import {MISSION_VOICE_TIMING} from './Data_FirstLevelMissionVoiceTiming.mjs';"
        "console.log(JSON.stringify({version:MISSION_VERSION,stages:MISSION_STAGES,voiceTiming:MISSION_VOICE_TIMING}));"],
        cwd=project,text=True,encoding='utf-8'))
    report=dict(schemaVersion=1,updated='2026-09-07',baseCommit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=project,text=True).strip(),
        missionContract=missionContract,
        libraryRoot=str(root),catalogSha256=Hash(root/'Preview/Data_Catalog.json'),requirementsSha256=Hash(required),
        missionBaselineFiles={p:Hash(project/p) for p in files},
        population=dict(trainRecruits=40,trainNpcsIncludingLuo=41,carRecruits=[8,24,8],litters=20,
            walkingWounded=36,medics=14,civilians=8,guards=8,zhouPatientId='Litter11'),
        timing=dict(status='recorded_alignment_and_playback_events_available',
            retainedContinuousRecordings=True,animationDialogueOffsetsInvented=False,
            sources=['Data_FirstLevelMissionVoiceAlignment.mjs','Data_FirstLevelMissionVoiceTiming.mjs'],
            note='Read current cue/segment/source seconds and Runtime VoiceEvent. TrainFoodReceived releases opening movement after the actual response; free look remains available. Actual shell impacts, train stop, prone/dive orders, TransferHope and medic arrival remain authoritative. New animation clips are not bound yet.'),
        sourceSearch=dict(directories=[str(root/'Video/Sources'),'C:/Users/Bentl/Downloads/GVHMR'],
            catalogActions=len(catalog['actions']),newVideoGenerations=batch['summary'].get('success',0),
            newInferenceRuns=len(list((root/'Models/_Cache/FirstLevelV1').glob('*/Data_Recovery.json')))),
        sourceProduction=dict(userScope='Generate source coverage for all 48 requirements before completing individual retargets.',
            plannedNewSources=coverage['requestedSources'],expectedFirstPassCredits=coverage['expectedFirstPassCredits'],
            inspectionSummary={key:inspection[key] for key in ['updatedUnix','decoded','screened','retakeRequired']},
            batchSnapshot=batch,liveStatus='Models/FirstLevelSourceBatchV1/Data_BatchStatus.json',
            dashboardUrl='http://127.0.0.1:8136/Preview/FirstLevelSourceBatchV1/index.html'),
        priorityRequirementIds=[r['requirementId'] for r in rows],requirements=rows)
    text=json.dumps(report,ensure_ascii=False,indent=2)+'\n'
    (project/'docs/Data_FirstLevelMissionAnimationStatus.json').write_text(text,encoding='utf-8')
    (root/f'Models/{group}/Data_MissionStatus.json').write_text(text,encoding='utf-8')
    print(json.dumps(dict(requirements=len(rows),priority=len(rows),sourceSummary=batch['summary'],
        missionVersion=missionContract['version'],stages=len(missionContract['stages'])),ensure_ascii=False))


if __name__=='__main__':Main()
