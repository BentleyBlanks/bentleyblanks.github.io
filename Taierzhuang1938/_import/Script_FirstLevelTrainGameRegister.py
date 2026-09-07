"""Register only the tested carriage subset, keeping remaining FL work explicit."""
from pathlib import Path
import argparse, datetime, hashlib, json, re, shutil, subprocess

parser=argparse.ArgumentParser()
parser.add_argument('--root',type=Path,required=True)
args=parser.parse_args()
root=args.root.resolve()
project=Path(__file__).resolve().parents[1]
local=project/'_shots/FirstLevelTrainGameV1'
game=project/'Animation/FirstLevelTrain'
out=root/'Models/FirstLevelTrainGameV1'
preview=root/'Preview/FirstLevelTrainGameV1'
Read=lambda p:json.loads(p.read_text(encoding='utf-8'))
Hash=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
config=Read(game/'Data_FirstLevelTrainAnimation.json')
transition=Read(local/'Data_RealTrainTransition.json')
assert not transition['failures'] and not transition['errors']
for name,expected in transition['runtimeHashes'].items():
    assert Hash(project/name)==expected, f'Runtime changed after transition validation: {name}'
sampler=Read(local/'Data_SamplerValidation.json')
assert not sampler['failures'] and not sampler['errors']
ride=Read(project/'_shots/FirstLevelMission/Data_TrainRide.json')
contacts=[p for p in ride['contacts'] if p['rendered']]
assert len(contacts)>=8 and len({p['model'] for p in contacts})==4
assert all(p['penetrating']==0 and p['deckPenetrating']==0 and p['seatGap'] is not None and 0<=p['seatGap']<.006 for p in contacts)
disembark=Read(project/'_shots/FirstLevelMission/Data_TrainDisembark.json')['train']
assert disembark['exited']==40 and len(disembark['entries'])==41
assert all(e['arrived'] and e['life']['weight']==0 for e in disembark['entries'])
complete=Read(project/'_shots/FirstLevelMission/Data_Complete.json')['mission']
assert complete['stage']=='Complete'
log=(local/'Data_PrepushRun.log').read_text(encoding='utf-8')
regressionFiles=['Data_PrepushRun.log']
regression=dict(status='passed',initialFailures=[])
if '[FAIL]' in log:
    # A fail-fast suite may be resumed, but the original failure remains evidence.
    # This exception is specific to the investigated phase-5 PhysicsTest: it
    # requires both an unchanged default rerun and matched navigation scheduling.
    failed=re.findall(r'^\[FAIL\] (\w+)',log,re.M)
    assert failed==['PhysicsTest'], f'Unresolved prepush failures: {failed}'
    remaining=(local/'Data_PrepushRemaining.log').read_text(encoding='utf-8')
    assert '[FAIL]' not in remaining and '[BASELINE]' not in remaining
    assert '失败 0' in remaining and '历史基线 0' in remaining
    selection=next(line for line in log.splitlines() if line.startswith('[runner] profile=prepush'))
    required=selection.split('：',1)[1].split(', ')
    passed=set(re.findall(r'^\[PASS\] (\w+)',log+'\n'+remaining,re.M))
    current=Read(local/'Data_PhysicsComparison_current.json')
    baseline=Read(local/'Data_PhysicsComparison_baseline.json')
    controlledCurrent=Read(local/'Data_PhysicsComparison_current_nav0.2.json')
    controlledBaseline=Read(local/'Data_PhysicsComparison_baseline_nav0.2.json')
    assert current['exitCode']==baseline['exitCode']==0
    assert controlledCurrent['exitCode']==controlledBaseline['exitCode']==0
    assert current.get('navStep',0)==baseline.get('navStep',0)==0
    assert controlledCurrent['navStep']==controlledBaseline['navStep']==.2
    assert controlledCurrent['revision']==controlledBaseline['revision']==current['revision']==baseline['revision']
    assert controlledCurrent['sourceHashes']==controlledBaseline['sourceHashes']
    assert controlledCurrent['sourceHashes']['test']==Hash(project/'Script_PhysicsTest.mjs')
    assert controlledCurrent['sourceHashes']['navigation']==Hash(project/'Script_Navigation.mjs')
    assert controlledCurrent['sourceHashes']['hook']==Hash(local/'Script_PhysicsComparisonHook.mjs')
    def AiSample(report):
        return next(row for row in report['evaluations'] if isinstance(row.get('value'),dict) and 'inside' in row['value'])
    left,right=AiSample(controlledCurrent),AiSample(controlledBaseline)
    assert left['index']==right['index'] and left['value']==right['value'], 'Controlled AI outcomes differ'
    for a,b in zip(controlledCurrent['evaluations'][:left['index']+1],controlledBaseline['evaluations'][:right['index']+1]):
        assert a['trace']==b['trace'], f"Controlled physical state differs at evaluation {a['index']}"
    for report in [current,controlledCurrent]:
        assert report['mode']=='current'
        for entry in report['served']:
            if entry['served']:assert Hash(project.parent/entry['name'].lstrip('/'))==entry['sha256']
    assert baseline['mode']==controlledBaseline['mode']=='baseline'
    for report in [baseline,controlledBaseline]:
        for entry in report['served']:
            if not entry['served']:continue
            expected=subprocess.check_output(['git','show',report['revision']+':'+entry['name'].lstrip('/')],cwd=project.parent)
            assert hashlib.sha256(expected).hexdigest()==entry['sha256'], 'Baseline bytes differ from recorded revision'
    passed.add('PhysicsTest')
    assert len(required)==len(set(required)) and set(required)==passed, f'Missing tests: {set(required)-passed}'
    finalSelection=next(line for line in (local/'Data_PrepushFinalSelection.log').read_text(encoding='utf-8-sig').splitlines() if line.startswith('[runner] profile=prepush'))
    assert set(finalSelection.split('：',1)[1].split(', '))==set(required), 'Final diff requires additional tests'
    regressionFiles+=['Data_PrepushRemaining.log','Data_PhysicsComparison_current.json','Data_PhysicsComparison_baseline.json',
        'Data_PhysicsComparisonCurrent.log','Data_PhysicsComparisonBaseline.log',
        'Data_PhysicsComparison_current_nav0.2.json','Data_PhysicsComparison_baseline_nav0.2.json',
        'Data_PhysicsControlledCurrent.log','Data_PhysicsControlledBaseline.log',
        'Script_PhysicsComparisonHook.mjs','Data_PrepushFinalSelection.log',
        'Data_PhysicsControlledCurrentSetupFailure.log','Data_PhysicsControlledBaselineSetupFailure.log']
    regression=dict(status='passed_after_investigation',requiredTests=required,passedTests=sorted(passed),
        initialFailures=failed,baselineRevision=baseline['revision'],
        defaultCurrentAi=AiSample(current)['value'],defaultBaselineAi=AiSample(baseline)['value'],
        controlledAi=left['value'],controlledStateSamples=left['index']+1,
        diagnosticSetupRetry='First controlled pair stopped before browser launch because the runner changes cwd; the private hook now resolves its workspace explicitly. Setup failure logs retained.',
        note='Initial phase-5 overlap failure retained. Default current and HEAD reruns pass unchanged thresholds; equal navigation scheduling must produce identical physical states. Navigation uses wall-clock search budgets. This is not a zero-failure first run or a default baseline failure.')
else:
    assert '失败 0' in log and '历史基线 0' in log
assert '[PASS] FirstLevelTrainAnimationTest' in log and '[PASS] FirstLevelMissionBrowserTest' in log
assert not (out/'Data_VisualAssessment.json').exists(), 'Already reviewed; use a new game version for a new result'
for record in config['models']:
    assert Hash(game/record['file'])==record['sourceAnimationSha256']
    assert Hash(project/f"Model/Character/Model_{record['id']}.glb")==record['originalModelSha256']
    assert Hash(out/record['file'])==record['sourceAnimationSha256']
preview.mkdir(parents=True,exist_ok=True)
evidence=[]
for folder,names in [(local,['Data_SamplerValidation.json','Data_RealTrainTransition.json',*regressionFiles]),
                     (project/'_shots/FirstLevelMission',['Data_TrainRide.json','Data_TrainDisembark.json','Data_Complete.json'])]:
    for name in names:
        target=out/name
        shutil.copy2(folder/name,target)
        evidence.append({'path':target.relative_to(root).as_posix(),'sha256':Hash(target)})
for source in [*local.glob('Scene_RealTrainRise*.png'),project/'_shots/FirstLevelMission/Scene_Train.png',project/'_shots/FirstLevelMission/Scene_TrainAllDisembarked.png']:
    shutil.copy2(source,preview/source.name)
report=dict(status='partially_integrated',recordedUtc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    version=config['version'],runtimeHashes=transition['runtimeHashes'],models=config['models'],regression=regression,
    enabledComponents=['Original-model seated support','Source-based bench rise','Upright wait for door queue','Blend into physical locomotion'],
    requirementScopes={'FL13':'原骨架侧凳身体支撑；站姿扶稳和第二版表演待制',
        'FL17':'复用原骨架坐姿支撑；专用生活表演与手中道具待接',
        'FL21':'扶腿起身、直立等队列与行走衔接；逐阶下车待接'},
    retained=['41 original NPCs and 8/24/8 recruits','Original bone names, hierarchy and inverse binds','Original physical AI movement','r11 mission facts and voice events','Distinct procedural carriage activities and attached equipment'],
    incomplete=['Standing carriage performances and dedicated life-action retargets','Food, ammunition and gear hand/finger contacts','Dedicated stair-down clip: four treads at each of three car exits','Existing locomotion clips retain their own pelvis loop seams; dedicated walking remains pending','48-requirement completion, stretcher and medical integration'],
    sourcePreview='http://127.0.0.1:8136/Preview/index.html?action=TrainBenchRise',
    localGamePreview='http://127.0.0.1:8137/Taierzhuang1938/?whitebox=p012',evidence=evidence,
    measured=dict(renderedSeatedSamples=len(contacts),minSeatGapM=min(p['seatGap'] for p in contacts),maxSeatGapM=max(p['seatGap'] for p in contacts),
        maxStationaryFootDriftM=max(r['maxStationaryFootDrift'] for r in transition['summary']),
        maxPelvisVerticalSpeedMps=max(r['maxPelvisSpeed'] for r in transition['summary']),
        maxNativePelvisVerticalSpeedMps=max(r['maxNativePelvisSpeed'] for r in transition['summary']),
        maxNativePelvisLocalError=max(r['maxNativePelvisError'] for r in transition['summary']),
        observedRiseActors=sum(r['samples']>0 for r in transition['summary']),disembarkedNpcs=41))
(out/'Data_GameIntegration.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report['measured'],ensure_ascii=False))
