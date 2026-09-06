"""Extract reviewed GVHMR performances. No authored gesture curves or mirrored takes.

Only source-time remapping, axis/proportion conversion and sub-frame filtering are
applied here. Full predictions and the raw preview remain untouched in the library.
"""
from pathlib import Path
import argparse,json,hashlib
import numpy as np
from scipy.ndimage import gaussian_filter1d
from scipy.spatial.transform import Rotation,Slerp

parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True)
args=parser.parse_args();root=args.root;project=Path(__file__).resolve().parents[1]
out=root/'Models/MeleeVideoV1';out.mkdir(parents=True,exist_ok=True)
# Source frame numbers were reviewed against the original video and 2D overlay.
# Gameplay knots preserve existing windup/active windows; source holds are shortened.
definitions={
 'DadaoLight':('DadaoCutsV1',[18,35,44,59,76],[0,.17/.65,.30/.65,.75,1],'大刀 · 斜斩'),
 'DadaoLightAlt':('DadaoCutsV1',[78,95,105,119,134],[0,.17/.65,.30/.65,.75,1],'大刀 · 回身反斩'),
 'DadaoHeavy':('DadaoCutsV1',[144,163,177,238,267],[0,.32/1.36,.50/1.36,.57,1],'大刀 · 双手重劈'),
 'DadaoParryLeft':('DadaoParriesV1',[23,32,47,61,79],[0,.07/.59,.25/.59,.68,1],'大刀 · 提刀接架拨开'),
 'DadaoParryRight':('DadaoParriesV1',[45,53,62,71,82],[0,.07/.59,.25/.59,.70,1],'大刀 · 转肩外拨'),
 'BayonetLight':('StaffThrustsV1',[18,27,35,76,97],[0,.21/.69,.33/.69,.57,1],'刺刀 · 短刺'),
 'BayonetHeavy':('StaffThrustsV1',[102,115,125,147,170],[0,.35/1.43,.51/1.43,.61,1],'刺刀 · 跨步长刺'),
 'BayonetParryLeft':('BayonetParriesV1',[88,96,104,112,117],[0,.07/.59,.25/.59,.68,1],'刺刀 · 左拨'),
 'BayonetParryRight':('BayonetParriesV1',[12,37,45,60,73],[0,.07/.59,.25/.59,.70,1],'刺刀 · 右拨'),
}
aliases={'DadaoCompact':'DadaoLight','DadaoCompactAlt':'DadaoLightAlt','DadaoParry':'DadaoParryLeft','BayonetLightAlt':'BayonetLight','BayonetCompact':'BayonetLight','BayonetCompactAlt':'BayonetLight','BayonetParry':'BayonetParryLeft'}
names=['Pelvis','LeftHip','RightHip','Spine1','LeftKnee','RightKnee','Spine2','LeftAnkle','RightAnkle','Spine3','LeftFoot','RightFoot','Neck','LeftCollar','RightCollar','Head','LeftShoulder','RightShoulder','LeftElbow','RightElbow','LeftWrist','RightWrist']
clips={};recipes={}
for name,(source,marks,knots,label) in definitions.items():
 path=root/'Models/_Cache/MeleeVideoV1'/source/'Data_GvhmrMotion.npz';d=np.load(path)
 receipt=json.loads((root/'Video/Sources'/source/'Data_GenerationResult.json').read_text(encoding='utf-8'))
 video=Path(receipt['result_json']['videos'][0]['path']);sourceHash=hashlib.sha256(video.read_bytes()).hexdigest()
 a,b=marks[0],marks[-1];ids=np.arange(len(d['worldJoints']));query=np.interp(np.linspace(0,1,31),knots,marks)
 forward=d['worldGlobalRotations'][max(0,a-5):a+1,0,:,2].mean(0)
 if name.startswith('Bayonet'):
  prop=np.load(path.with_name('Data_PropTrack.npz'))['worldPropRotations']
  # An opponent stands along the thrust axis, not along the actor's hip axis.
  # A fixed heading calibration retains the source's side-on fighting stance.
  forward=-prop[marks[2] if source=='StaffThrustsV1' else 0,:,2]
 heading=-np.arctan2(forward[0],forward[2])+np.pi
 transform=Rotation.from_euler('y',heading).as_matrix()
 # The FPS camera replaces the source actor's root heading. Remove that yaw
 # per frame, retaining the captured spine/shoulder twist relative to the hips.
 forwardFrames=d['worldGlobalRotations'][:,0,:,2]
 rootYaw=gaussian_filter1d(np.unwrap(np.pi-np.arctan2(forwardFrames[:,0],forwardFrames[:,2])),.55)
 cameraTransforms=Rotation.from_euler('y',rootYaw[:,None]).as_matrix()
 if source=='StaffThrustsV1':cameraTransforms=np.repeat(transform[None],len(rootYaw),axis=0)
 joints=np.einsum('fij,fkj->fki',cameraTransforms,gaussian_filter1d(d['worldJoints'],.55,axis=0))
 # In-place locomotion: retain crouch/weight transfer; game owns horizontal root travel.
 joints[:,:,[0,2]]-=joints[:,0:1,[0,2]]
 rotations=np.einsum('fij,fkjl->fkil',cameraTransforms,d['worldGlobalRotations'])
 weaponRotations=rotations[:,21]
 if name.startswith('Bayonet'):
  # Image-observed prop line corrects the ambiguous recovered wrist span.
  prop=np.load(path.with_name('Data_PropTrack.npz'))['worldPropRotations']
  weaponRotations=np.einsum('fij,fjk->fik',cameraTransforms,prop)
 # Calibrate the fixed game rifle to the thrust's observed contact direction.
 # The source begins waist-low and across the body, not in the FPS ready pose.
 reference=Rotation.from_matrix(weaponRotations[marks[2] if source=='StaffThrustsV1' else 0])
 wrist=Rotation.from_matrix(weaponRotations);relative=(wrist*reference.inv()).as_rotvec()
 wrist=Rotation.from_rotvec(gaussian_filter1d(relative,.55,axis=0))
 quat=Slerp(ids,wrist)(query).as_quat()
 # Source-to-FPS arm length conversion uses the existing viewmodel's 1.6x
 # bind-proportion contract. Calibrate its actual length during runtime sampling.
 sourceArm=float(np.linalg.norm(d['worldRestJoints'][0,19]-d['worldRestJoints'][0,17])+np.linalg.norm(d['worldRestJoints'][0,21]-d['worldRestJoints'][0,19]))
 def At(values):return np.stack([np.interp(query,ids,values[:,c]) for c in range(3)],axis=1)
 frames=np.concatenate([At(joints[:,21]-joints[0,21]),quat,
  At(joints[:,17]-joints[0,17]),At(joints[:,16]-joints[0,16]),
  At(joints[:,19]-joints[:,17]),At(joints[:,18]-joints[:,16])],axis=1)
 clips[name]={'source':source,'sourceSha256':sourceHash,'recoverySha256':hashlib.sha256(path.read_bytes()).hexdigest(),
  'sourceFrameRate':30,'sourceFrames':np.round(query,5).tolist(),'sourceArmLength':sourceArm,
  'propSource':'image line + GVHMR depth / torso roll' if name.startswith('Bayonet') else 'recovered wrist rotation with calibrated sword grip',
  'frames':np.round(frames,6).tolist()}
 recipes[name]={'source':source,'range':[a,b],'label':label,'loop':False,'kind':'melee','cameraDistance':5.4 if name.startswith('Dadao') else 7.5,'weapon':'Dadao' if name.startswith('Dadao') else 'Bayonet',
  # BIP body bind faces Blender -Y, while the FPS camera faces Three -Z.
  # Their source heading calibrations differ by pi, not by a runtime actor turn.
  'runtimeTimeKnots':knots,'sourceFrameKnots':marks,'headingRadians':float(heading-np.pi),'sourceVideo':video.relative_to(root).as_posix(),
  'sourceAssessment':'Fixed single performer take; hands corrected after recovery. Camera angle is a request, not measured calibration.'}
 raw={'schemaVersion':1,'stage':'GVHMR worldJoints before retarget, filtering, IK or loop correction','sourceCache':path.relative_to(root).as_posix(),
  'sourceCacheSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'fps':float(d['fps']),'parents':d['parents'].tolist(),'jointNames':names,'positions':d['worldJoints'].tolist(),
  'viewerYawRadians':float(heading-np.pi),'viewerOrigin':[float(d['worldJoints'][0,0,0]),0,float(d['worldJoints'][0,0,2])]}
 (root/f'Models/RecoveryPreview/Data_V1_{name}RawJoints.json').write_text(json.dumps(raw,separators=(',',':')),encoding='utf-8')
for alias,name in aliases.items():clips[alias]={**clips[name],'aliasOf':name}
(out/'Data_Recipes.json').write_text(json.dumps(recipes,ensure_ascii=False,indent=2),encoding='utf-8')
result={'schema':1,'source':'Seedance video / fresh GVHMR / original-skeleton retarget','frameCount':31,'channels':'right wrist displacement xyz, wrist delta quaternion xyzw, shoulder displacement right/left xyz, elbow directions right/left xyz','clips':clips}
(project/'Data_MeleeVideoAnimations.mjs').write_text('// Generated by _import/Script_MeleeVideoPrepare.py from actual recovered video frames.\nexport const MELEE_VIDEO_ANIMATIONS = '+json.dumps(result,separators=(',',':'))+';\n',encoding='utf-8')
print('Prepared',len(definitions),'source selections;',len(clips),'runtime clips')
