"""Bake the Blender-fitted constant digits into the existing holding loop.

Only the explicitly selected constant HanYang holding-finger tracks are replaced.
Breathing, arm transforms, all positions, control tracks and timing stay exact.
"""
import bpy,json,copy,re,hashlib
from pathlib import Path
from mathutils import Quaternion
assert bpy.context.scene.get('BlenderMcpTask')==globals().get('FPS_IDLE_GRIP_TASK','FpsHandAnatomy_20261015')
root=Path(FPS_PROJECT_ROOT);folder=Path(bpy.data.filepath).parent
output=root/'Animation/FirstPerson/Data_FpsHanYangAnimations.json'
baseline=folder/globals().get('FPS_IDLE_GRIP_BASELINE','Data_HanYangIdleBeforeAnatomy.json')
if not baseline.exists():baseline.write_bytes(output.read_bytes())
before=json.loads(baseline.read_text(encoding='utf-8'));after=copy.deepcopy(before)
assert list(before['clips'])==['Idle'] and len(before['bones'])==53
corrections=json.loads((folder/globals().get('FPS_IDLE_GRIP_CORRECTIONS','Data_FpsAnatomyFingerCorrections.json')).read_text())['HanYang']
changed=[]
for index,name in enumerate(before['bones']):
 match=re.search(r'([rl])[_ ]?finger(\d)(\d)?$',name,re.I)
 if not match:continue
 key=('r' if match[1].lower()=='r' else '')+match[2]+(match[3] or '')
 if key not in corrections:continue
 values=after['clips']['Idle']['bones'][index]
 assert len(values)==7, 'A moving digit requires a full Action edit, not a constant correction.'
 q=corrections[key];rotation=Quaternion((q[3],*q[:3])).normalized()
 values[3:7]=[rotation.x,rotation.y,rotation.z,rotation.w]
 changed.append(index)
assert len(changed)==globals().get('FPS_IDLE_GRIP_EXPECTED_TRACKS',9)
for index,(a,b) in enumerate(zip(before['clips']['Idle']['bones'],after['clips']['Idle']['bones'])):
 if index in changed:assert a[:3]==b[:3]
 else:assert a==b
for key in ['duration','count','controls','visible','state','contact']:assert before['clips']['Idle'][key]==after['clips']['Idle'][key]
output.write_text(json.dumps(after,separators=(',',':')),encoding='utf-8')
manifestPath=output.with_name('Data_FpsAnimationManifest.json');manifest=json.loads(manifestPath.read_text())
manifest['HanYang']['bytes']=output.stat().st_size;manifestPath.write_text(json.dumps(manifest,indent=2),encoding='utf-8')
report={'updatedClip':'Idle','constantFingerTracks':len(changed),'bones':[before['bones'][i] for i in changed],'frames':before['clips']['Idle']['count'],'otherChannelsPreserved':True,'sourceSha256':hashlib.sha256(baseline.read_bytes()).hexdigest(),'sha256':hashlib.sha256(output.read_bytes()).hexdigest()}
(folder/'Data_FpsIdleGripRefresh.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
for name,content in [('Script_FpsIdleGripRefresh.py',(root/'_blender/Script_FpsIdleGripRefresh.py').read_text()),('Data_FpsHanYangAnimations.json',output.read_text())]:
 text=bpy.data.texts.get(name) or bpy.data.texts.new(name);text.clear();text.write(content)
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath,compress=True)
print(json.dumps(report))
