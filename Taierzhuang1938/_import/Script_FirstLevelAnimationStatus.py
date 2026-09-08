"""Build an evidence-based mission handoff; missing source is never a fake clip."""
from pathlib import Path
import argparse, datetime, hashlib, json, re, subprocess
from Script_FirstLevelRetargetEvidence import CollectRetargetEvidence


def Main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',type=Path,required=True)
    parser.add_argument('--carry-revision',type=int,default=17)
    parser.add_argument('--hold-revision',type=int,default=2)
    parser.add_argument('--compatibility-group')
    args=parser.parse_args()
    root=args.root.resolve()
    revision=args.carry_revision
    group=f'FirstLevelCarryV{revision}'
    project=Path(__file__).resolve().parents[1]
    catalog=json.loads((root/'Preview/Data_Catalog.json').read_text(encoding='utf-8'))
    Hash=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
    Read=lambda p:json.loads(p.read_text(encoding='utf-8'))
    policy=Read(Path(__file__).with_name('Data_FirstLevelSourcePolicy.json'))
    existingPlan=Read(Path(__file__).with_name('Data_FirstLevelExistingSourcePlan.json'))
    batch=Read(root/'Models/FirstLevelSourceBatchV1/Data_BatchStatus.json')
    coverage=Read(root/'Models/FirstLevelSourceBatchV1/Data_CoveragePlan.json')
    sourceStates={s['id']:s for s in batch['sources']}
    inspection=Read(root/'Models/FirstLevelSourceBatchV1/Data_SourceInspection.json')
    for record in inspection['sources']:
        sourceStates[record['id']]['mediaInspection']=record
    for name,state in sourceStates.items():
        cache=root/'Models/_Cache/FirstLevelV1'/name
        prepared=cache/'Data_ObservationPreparation.json'
        if not prepared.exists():continue
        observation=Read(prepared)
        source=root/'Video/Sources/FirstLevelV1'/name
        receipt=Read(source/'Data_GenerationResult.json')
        video=source/Path(receipt['result_json']['videos'][0]['path']).name
        assert Hash(video)==observation['sourceSha256']
        state['observationPreparation']=dict(path=prepared.relative_to(root).as_posix(),sha256=Hash(prepared),
            status=observation['status'],sourceSha256=observation['sourceSha256'],predictionRun=observation['predictionRun'])
        dense=source/'DenseReview/Data_VisualAssessment.json'
        if dense.exists():
            assessed=Read(dense);assert assessed['sourceVideoSha256']==observation['sourceSha256']
            assert assessed['keypointsSha256']==Hash(cache/'preprocess/vitpose.pt')
            state['denseObservationReview']=dict(path=dense.relative_to(root).as_posix(),sha256=Hash(dense),assessment=assessed)
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
        row['productionPolicy']=policy['mode']
        row['existingSourceResolutions']=[r for r in existingPlan['resolutions'] if row['requirementId'] in r['requirementIds']]
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
                    'r12 uses original production-rig bearers and existing carry clips; these contact candidates are not enabled.'],
                reviewEvidence=['Models/ReviewV7/Data_SelectedExportFidelityValidation.json',
                    f'Models/{group}/Data_ContactValidation.json',
                    f'Preview/{group}/Data_ExportValidation.json',
                    f'Preview/{group}/Contacts/Data_ContactViews.json',
                    f'Models/{group}/GameIntegration/Data_BrowserValidation.json'])
            if revision>=11:
                visual=Read(root/f'Models/{group}/Data_VisualAssessment.json')
                validation=Read(root/f'Models/{group}/Data_IndependentValidation.json')
                trial=Read(root/'Models'/validation['fitReport'])
                speed=trial.get('referenceSpeedMps',.55);grip_height=trial.get('gripHeightM',.88)
                assert visual['frozen'] and not visual['acceptedForGame']
                for model in visual['models']:
                    assert Hash(root/model['path'])==model['sha256']
                row.update(rootMotionMode='authored_in_place_support_gait_with_original_rig',referenceSpeedMps=speed,
                    modelVariants=[m['id'] for m in validation['results']],
                    revisionLabel=f'V{revision} production-scale contact trial; pelvis, support gait and hand contacts authored after recovery',
                    visualAssessment=visual,
                    productionFit=dict(validation=f'Models/{group}/Data_IndependentValidation.json',
                        trial='Models/'+validation['fitReport'],runtimeEnabled=False,
                        profiles=sum(len(m['profiles']) for m in validation['results']),
                        samples=sum(p['samples'] for m in validation['results'] for p in m['profiles']),
                        referenceSpeedPolicy=f'{speed:.2f} m/s authoring reference; not calibrated monocular ground speed.',
                        geometryStatus=trial.get('geometryStatus','current_r12')),
                    contacts=[dict(prop='local_candidate_stretcher',railSpacingM=.58,railLengthM=trial.get('railLengthM',2.15),
                        longitudinalGripsM=[-trial.get('gripOffsetM',1),trial.get('gripOffsetM',1)],bedHeightM=grip_height-.12,gripHeightM=grip_height,
                        runtimeBedHeightM=.76,runtimeGripHeightM=.88,
                        correction='Authored pelvis placement, support gait, arms and fingers; original raw unchanged.')],
                    blockers=visual.get('blockers',['Two-person cropped input remains experimental, not strict single-person recovery.',
                        'Flat-ground contact passed independent reimport, but side views show excessive crouch and high elbows; gait does not preserve the source upright walk.',
                        'Palm/thumb wrap improved in sampled close views; this is not full contact/naturalness acceptance for all four model variants.',
                        'No double-support idle clip, start/stop, turn, slope, threshold or loading transition is accepted.',
                        f'r12 uses original production-rig bearers and existing carry clips; this V{revision} candidate is not enabled.']),
                    reviewEvidence=[f'Models/{group}/'+name for name in ['Data_IndependentValidation.json','Data_EditableProjects.json',
                        'Data_EditableProjectValidation.json','Data_ProjectAndPlaybackValidation.json','Data_VisualAssessment.json']]+
                        [f'Preview/{group}/Contacts/Data_ContactViews.json'])
                continuous=root/f'Models/{group}/Data_ContinuousContactValidation.json'
                if continuous.exists():
                    check=Read(continuous);assert not check['failures'] and not check['errors']
                    row['productionFit']['continuousContactValidation']=dict(path=continuous.relative_to(root).as_posix(),
                        sha256=Hash(continuous),maxDriftM=max(p['maxStanceDrift'] for m in check['results'] for p in m['profiles']))
                    row['reviewEvidence'].append(continuous.relative_to(root).as_posix())
                hinge=root/f'Models/{group}/Data_ArmHingeValidation.json'
                if hinge.exists():
                    check=Read(hinge);assert not check['failures'] and not check['errors']
                    row['productionFit']['armHingeValidation']=dict(path=hinge.relative_to(root).as_posix(),sha256=Hash(hinge),
                        maxElbowPlaneErrorDeg=max(p['handPosture']['maxElbowPlaneErrorDeg'] for m in check['results'] for p in m['profiles']))
                    row['reviewEvidence'].append(hinge.relative_to(root).as_posix())
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
            trials=[]
            for support in sorted((root/'Models').glob('FirstLevelTrainSupportV*'),key=lambda p:int(p.name.split('V')[-1])):
                if not (support/'Data_ProductionSkinValidation.json').exists():continue
                measured=Read(support/'Data_ProductionSkinValidation.json')
                projects=Read(support/'Data_EditableProjects.json')
                for result in measured['results']:
                    assert Hash(support/('Animation_'+result['id']+'FirstLevelTrainSupport.glb'))==result['animationSha256']
                trials.append(dict(group=support.name,status=measured['status'],runtimeEnabled=False,
                    models=projects['results'],failures=measured['failures'],
                    validation=(support/'Data_ProductionSkinValidation.json').relative_to(root).as_posix(),
                    editableValidation=(support/'Data_EditableProjectValidation.json').relative_to(root).as_posix()))
            if trials:
                row['productionSupportTrial']=trials[-1];row['productionSupportHistory']=trials[:-1]
                row['modelVariants']=[model['id'] for model in trials[-1]['models']]
                row['blockers'].append('Support validation and past failures remain versioned; latest original-model support is not yet enabled in the physical queue.')
        elif row['requirementId']!='FL26':
            statuses=[s['status'] for s in row['newSourceProduction']]
            row['status']=('video_generation_in_progress' if 'querying' in statuses else
                'source_submission_needs_reconciliation' if 'uncertain_submission' in statuses else
                'source_generation_failed_partial' if 'fail' in statuses else
                'source_waiting_for_credit' if 'waiting_for_credit' in statuses else
                'existing_source_authored_correction_planned' if row['sourceRetakeIds'] and not policy['allowRetakes'] else
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
                latestId=action['latestByFaction'].get('Nra') or next(iter(action['latestByFaction'].values()))
                variant=next(v for v in action['variants'] if v['id']==latestId)
                candidate['retargetCandidate']=dict(variantId=variant['id'],modelSha256=Hash(root/variant['path']),path=variant['path'],clip=variant['clip'],blend=variant['blend'],
                    previewUrl='http://127.0.0.1:8136/Preview/index.html?action='+source['id'],status=variant['status'])
                if candidate.get('visualAssessment'):
                    assert Hash(root/variant['path'])==candidate['visualAssessment']['modelSha256']
            row['newRecoveryCandidates'].append(candidate)
        if row['newRecoveryCandidates']:
            row['status']='partially_retargeted_requires_contact_review' if all('retargetCandidate' in c for c in row['newRecoveryCandidates']) else 'partially_recovered_pending_retarget'
            row['blockers'].append('Source depth errors and authored contact corrections are tracked per version. Props, clip boundaries and mission event binding are not accepted.')
        elif row['existingSourceResolutions'] and not policy['allowNewVideoGeneration'] and row['requirementId']!='FL26':
            row['status']='existing_source_authored_correction_planned'
        row['newVideoSubmissionRequired']=False
    if args.hold_revision:
        holdGroup=f'FirstLevelCarryHoldV{args.hold_revision}';folder=root/'Models'/holdGroup
        visual=Read(folder/'Data_VisualAssessment.json');validation=Read(folder/'Data_ArmHingeValidation.json')
        trial=Read(root/'Models'/validation['fitReport'])
        assert visual['frozen'] and not visual['acceptedForGame'] and trial['hold']
        assert not validation['failures'] and not validation['errors']
        for model in visual['models']:assert Hash(root/model['path'])==model['sha256']
        variants=[]
        for name in ['CarryStretcherFrontHold','CarryStretcherRearHold','StretcherPairHold']:
            action=next(a for a in catalog['actions'] if a['id']==name)
            variant=next(v for v in action['variants'] if v['id']==f'Nra-v{args.hold_revision}-'+name)
            assert variant['review']['sourcePoseSeconds']==trial['sourcePoseSeconds']
            variants.append(dict(previewId=name,variantId=variant['id'],clipName=variant['clip'],path=variant['path'],
                blendFile=variant['blend'],sourceVideo=variant['review']['sourceVideo'],sourceVideoSha256=Hash(root/variant['review']['sourceVideo']),
                sourceRangeSeconds=variant['review']['sourceRangeSeconds'],sourcePoseSeconds=variant['review']['sourcePoseSeconds'],
                recoveryTracks=variant['review']['recoveryTracks'],previewUrl='http://127.0.0.1:8136/Preview/index.html?action='+name))
        row=next(r for r in rows if r['requirementId']=='FL25')
        row.update(status='partially_retargeted_requires_contact_review',actorRoles=['litter.frontBearer','litter.rearBearer'],faction='Nra',
            modelVariants=[m['id'] for m in validation['results']],loop=True,referenceSpeedMps=0,
            sourceVideo=variants[0]['sourceVideo'],sourceVideoSha256=variants[0]['sourceVideoSha256'],
            sourceRangeSeconds=variants[0]['sourceRangeSeconds'],sourcePoseSeconds=trial['sourcePoseSeconds'],recoveryRevision=2,
            clipName=[v['clipName'] for v in variants[:2]],blendFile=variants[-1]['blendFile'],previewId='StretcherPairHold',variants=variants,
            rootMotionMode='authored_double_support_hold_from_fixed_recovered_pose',entryPose='both_feet_planted_holding_rail',exitPose='both_feet_planted_holding_rail',
            revisionLabel=f'Hold V{args.hold_revision}: authored double support, breathing and rail contacts; original walking source/raw held at the explicitly recorded source pose',
            visualAssessment=visual,blockers=visual['blockers'],
            contacts=[dict(railSpacingM=.58,railLengthM=trial['railLengthM'],longitudinalGripsM=[-trial['gripOffsetM'],trial['gripOffsetM']],
                gripHeightM=trial['gripHeightM'],bedHeightM=trial['gripHeightM']-.12,geometryStatus=trial['geometryStatus'])],
            productionFit=dict(validation=f'Models/{holdGroup}/Data_ArmHingeValidation.json',trial='Models/'+validation['fitReport'],runtimeEnabled=False,
                profiles=sum(len(m['profiles']) for m in validation['results']),samples=sum(p['samples'] for m in validation['results'] for p in m['profiles'])),
            reviewEvidence=[f'Models/{holdGroup}/'+name for name in ['Data_IndependentValidation.json','Data_ArmHingeValidation.json',
                'Data_EditableProjectValidation.json','Data_ProjectAndPlaybackValidation.json','Data_VisualAssessment.json']]+
                [f'Preview/{holdGroup}/Contacts/Data_ContactViews.json','Preview/Data_HeldPoseLibraryValidationV2.json'])
    ammoGroups=sorted((p for p in (root/'Models').glob('FirstLevelAmmoAuthorV*') if (p/'Data_VisualAssessment.json').exists()),key=lambda p:int(p.name.split('V')[-1]))
    ammoGroup=ammoGroups[-1].name if ammoGroups else 'FirstLevelAmmoAuthorV2'
    if (root/'Models'/ammoGroup/'Data_VisualAssessment.json').exists():
        folder=root/'Models'/ammoGroup;assessment=Read(folder/'Data_VisualAssessment.json')
        validation=Read(folder/'Data_ExportValidation.json');editable=Read(folder/'Data_EditableProjectValidation.json')
        assert assessment['frozen'] and not assessment['acceptedForGame'] and validation['status']=='passed'
        action=next(a for a in catalog['actions'] if a['id']=='TrainAmmoCountAuthored')
        variants=[v for v in action['variants'] if v['path'].startswith(f'Models/{ammoGroup}/')]
        assert len(variants)==4
        candidates=[]
        for variant in variants:
            checked=next(r for r in validation['results'] if r['id']==variant['modelId'])
            projectRecord=next(r for r in editable['results'] if r['id']==variant['modelId'])
            assert Hash(root/variant['path'])==checked['sha256']==projectRecord['modelSha256']
            assert Hash(root/variant['blend'])==projectRecord['blendSha256']
            candidates.append(dict(variantId=variant['id'],path=variant['path'],modelSha256=checked['sha256'],blend=variant['blend'],
                clip=variant['clip'],status=variant['status'],review=variant['review'],previewUrl='http://127.0.0.1:8136/Preview/index.html?action=TrainAmmoCountAuthored'))
        row=next(r for r in rows if r['requirementId']=='FL16')
        row.update(status='authored_candidate_requires_contact_review',previewId=action['id'],newAuthoredCandidates=candidates,
            existingRuntimeBase='MissionTrainLifePose / CountAmmo',visualAssessment=assessment,blockers=assessment['blockers'])
        row['reviewEvidence'].extend(f'Models/{ammoGroup}/'+name for name in ['Data_AuthoredBake.json','Data_ExportValidation.json','Data_EditableProjectValidation.json','Data_VisualAssessment.json'])
    gameVersion=Read(project/'Animation/FirstLevelTrain/Data_FirstLevelTrainAnimation.json')['version']
    assert re.fullmatch(r'FirstLevelTrainGameV[1-9]\d*',gameVersion)
    gameReport=root/'Models'/gameVersion/'Data_GameIntegration.json'
    integration=Read(gameReport) if gameReport.exists() else None
    compatibility=None
    if integration:
        visual=Read(gameReport.with_name('Data_VisualAssessment.json'))
        assert visual['frozen'] and visual['gameIntegrationSha256']==Hash(gameReport), 'Review the tested game subset before publishing its status'
        changed=[filename for filename,expected in integration['runtimeHashes'].items() if Hash(project/filename)!=expected]
        compatibility=dict(status='matches_frozen_integration' if not changed else 'upstream_changed_revalidation_pending',
            changedFiles=changed,fullCampaignCurrent=not changed,historicalIntegration=gameReport.relative_to(root).as_posix())
        if args.compatibility_group:
            assert re.fullmatch(r'FirstLevelTrain[A-Za-z0-9]+',args.compatibility_group)
            file=root/'Models'/args.compatibility_group/'Data_CompatibilityValidation.json'
            checked=Read(file)
            assert checked['historicalIntegrationSha256']==Hash(gameReport)
            assert checked['changedFiles']==changed
            for filename,digest in checked['runtimeHashes'].items():
                assert Hash(project/filename)==digest, f'Runtime changed after compatibility validation: {filename}'
            assert set(checked['runtimeHashes'])==set(integration['runtimeHashes'])
            for item in checked['evidence']:
                assert Hash(root/item['path'])==item['sha256']
            compatibility.update(checked,evidencePath=file.relative_to(root).as_posix())
        for evidence in integration['evidence']:
            assert Hash(root/evidence['path'])==evidence['sha256']
        for row in rows:
            if row['requirementId'] not in integration['requirementScopes']:continue
            row['status']='partially_integrated_other_actions_pending'
            row['runtimeBinding'].update(enabled=True,scope=integration['requirementScopes'][row['requirementId']],
                evidence=gameReport.relative_to(root).as_posix(),version=integration['version'],
                fullCampaignCurrent=compatibility['fullCampaignCurrent'],compatibilityStatus=compatibility['status'])
            if changed and not compatibility['fullCampaignCurrent']:
                row['status']='runtime_subset_enabled_upstream_campaign_validation_pending'
                row['blockers'].append('The frozen full campaign validates the previous runtime. Current upstream compatibility evidence has its own scope; it does not replace a current full campaign.')
            row['blockers']=[b for b in row['blockers'] if not b.startswith('Not enabled in mission;') and not b.startswith('Support validation and past failures') and not b.startswith('Full bench sequence only;')]
            row['blockers'].append('Only the recorded carriage subset is enabled; dedicated life gestures, prop/finger contact and stair-down are still pending.')
            row['reviewEvidence'].append(gameReport.relative_to(root).as_posix())
            if row.get('productionSupportTrial',{}).get('group')=='FirstLevelTrainSupportV2':
                row['productionSupportTrial']['runtimeEnabled']=True
                row['productionSupportTrial']['runtimeScope']='The recorded carriage support/rise subset only'
    pendingPath=gameReport.with_name('Data_ValidationProgress.json')
    pending=Read(pendingPath) if not integration and pendingPath.exists() else None
    if pending:
        assert pending['validationPending'] and not pending['acceptedForGame']
        for name,digest in pending['runtimeHashes'].items():
            assert Hash(project/name)==digest, f'Pending runtime changed: {name}'
        for row in rows:
            if row['requirementId'] not in pending['requirementScopes']:continue
            row['status']='runtime_subset_enabled_campaign_validation_pending'
            row['runtimeBinding'].update(enabled=True,validationPending=True,version=pending['version'],
                scope=pending['requirementScopes'][row['requirementId']],evidence=pendingPath.relative_to(root).as_posix())
            row['blockers']=[b for b in row['blockers'] if not b.startswith(('Not enabled in mission;','Support validation and past failures','Full bench sequence only;'))]
            row['blockers'].append(pending['note'])
            if row.get('productionSupportTrial',{}).get('group')=='FirstLevelTrainSupportV2':
                row['productionSupportTrial'].update(runtimeEnabled=True,runtimeScope='Support/rise subset; r12 campaign validation pending')
    files=['Data_FirstLevelMission.mjs','Data_FirstLevelMissionDialogue.mjs','Data_FirstLevelMissionTrain.mjs',
        'Data_Tuning_FirstLevel.mjs','Script_FirstLevelMissionRuntime.mjs','Script_FirstLevelMissionColumn.mjs',
        'Script_FirstLevelMissionVoice.mjs','Script_FirstLevelMissionTrain.mjs','Audio/FirstLevel/Data_FirstLevelVoiceManifest.json',
        'Data_FirstLevelMissionVoiceAlignment.mjs','Data_FirstLevelMissionVoiceTiming.mjs',
        'Script_FirstLevelTrainAnimation.mjs','Script_FirstLevelMissionTrainLife.mjs']
    missionContract=json.loads(subprocess.check_output(['node','--input-type=module','-e',
        "import {MISSION_VERSION,MISSION_STAGES} from './Data_FirstLevelMission.mjs';"
        "import {MISSION_VOICE_TIMING} from './Data_FirstLevelMissionVoiceTiming.mjs';"
        "console.log(JSON.stringify({version:MISSION_VERSION,stages:MISSION_STAGES,voiceTiming:MISSION_VOICE_TIMING}));"],
        cwd=project,text=True,encoding='utf-8'))
    reconciliation=Read(root/'Video/Sources/FirstLevelV1/TrainAmmoCount/Data_GenerationReconciliation.json')
    retake=Read(root/'Models/FirstLevelSourceRetakeV2/Data_RetakePlan.json')
    report=dict(schemaVersion=1,updated=datetime.datetime.now().date().isoformat(),recordedUtc=datetime.datetime.now(datetime.timezone.utc).isoformat(),baseCommit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=project,text=True).strip(),
        missionContract=missionContract,
        libraryRoot=str(root),catalogSha256=Hash(root/'Preview/Data_Catalog.json'),requirementsSha256=Hash(required),
        missionBaselineFiles={p:Hash(project/p) for p in files},
        population=dict(trainRecruits=40,trainNpcsIncludingLuo=41,carRecruits=[8,24,8],litters=20,
            walkingWounded=36,medics=14,civilians=8,guards=8,zhouPatientId='Litter11'),
        timing=dict(status='recorded_alignment_and_playback_events_available',
            retainedContinuousRecordings=True,animationDialogueOffsetsInvented=False,
            sources=['Data_FirstLevelMissionVoiceAlignment.mjs','Data_FirstLevelMissionVoiceTiming.mjs'],
            note='Read current cue/segment/source seconds and Runtime VoiceEvent. TrainFoodReceived releases opening movement after the actual response; free look remains available. Actual shell impacts, train stop, prone/dive orders, TransferHope and medic arrival remain authoritative. '+('Only the recorded bench-support/rise subset is enabled.' if integration else 'Carriage subset is enabled, with r12 campaign validation still pending.' if pending else 'New animation clips are not bound yet.')),
        gameIntegration=integration,gameIntegrationPending=pending,gameIntegrationCompatibility=compatibility,
        sourceSearch=dict(directories=[str(root/'Video/Sources'),'C:/Users/Bentl/Downloads/GVHMR'],
            catalogActions=len(catalog['actions']),newVideoGenerations=batch['summary'].get('success',0),
            newInferenceRuns=len(list((root/'Models/_Cache/FirstLevelV1').glob('*/Data_Recovery.json')))),
        sourceProduction=dict(userScope=policy['userInstruction'],policy=policy,
            existingSourcePlan=existingPlan,
            plannedNewSources=0,newVideoCreditsRequired=0,
            historicalFirstPass=dict(requestedSources=coverage['requestedSources'],expectedCredits=coverage['expectedFirstPassCredits']),
            lastCreditObservation=reconciliation.get('lastCreditObservation'),pendingAmmoQuery=reconciliation.get('lastQuery'),
            retakeBudget=dict(active=False,status='cancelled_by_user_existing_sources_only',newVideoCreditsRequired=0,
                historicalEstimate={k:retake[k] for k in ['status','recordedUtc','submitted','spentCredits','sourceCount','expectedCredits','observedBalance','additionalCreditsAtObservedBalance','estimateScope']}),
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
