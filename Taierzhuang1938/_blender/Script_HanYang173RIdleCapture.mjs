export const CaptureIdle=async ()=>{
  const T=window.Taierzhuang,THREE=await import('three'),{ApplyAnatomicalFingers}=await import('/Taierzhuang1938/Script_FpsAnatomy.mjs');
  T.Debug.OpenEditor('firstPerson');const e=T.editor.active;e.SetWeapon('HanYang');e.SetPose('hip');
  for(let i=0;i<90;i++)e.Update(1/60);
  const vm=T.viewmodel,a=vm.riggedArms,animation=vm.skeletalAnimation,asset=animation.assets.HanYang,clip=animation.Clip('Idle');
  if(clip.count!==241||clip.duration!==4)throw Error('Expected the existing 4s/241 frame Idle');
  const boneNames=asset.bones,bones=boneNames.map(name=>animation.boneMap.get(name.toLowerCase().replace(/[^a-z0-9]/g,'')));
  if(bones.some(b=>!b))throw Error('Missing production bone');
  const selectedBones=boneNames.filter(name=>/_[LR]_(?:Clavicle|UpperArm|Forearm|Hand|Finger[0-4][12]?)$/i.test(name)),selected=new Set(selectedBones);
  if(selected.size!==38)throw Error('Expected both 19-bone arm chains');
  const spec=vm.armPose;
  animation.SetPreview('Idle',{time:0,playing:false});
  const initialControls=Object.fromEntries(Object.entries(clip.controls).map(([key,values])=>[key,{p:new THREE.Vector3().fromArray(values),q:new THREE.Quaternion().fromArray(values,3)}]));

  const frames=[];let maximumWrist=0,maximumProtectedDelta=0;
  a.elbowDirections.l=null;
  for(let pass=0;pass<2;pass++)for(let index=0;index<clip.count;index++){
   const time=clip.duration*index/(clip.count-1);animation.preview.time=time;animation.Update(0,{});
   a.poseSpec=spec;a.poseState={ads:0,adsGrip:0,sprint:0,fire:0,reload:false,reloadBlend:0,melee:false};for(const side of ['l','r']){a.contactWeight[side]=1;a.operationPose[side]=null;}
   const protectedBones=bones.flatMap(b=>selected.has(b.name)?[]:[{bone:b,position:b.position.clone(),quaternion:b.quaternion.clone(),scale:b.scale.clone()}]);
   for(const key of ['handLeft','contactLeft','handRight','contactRight']){
    const candidate=spec.contacts[key.endsWith('Left')?'left':'right'];const newQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(...candidate.rotation,'YXZ')); 
    const object=animation.Controls()[key],base=initialControls[key];object.position.sub(base.p).add(new THREE.Vector3(...candidate.position));
    object.quaternion.premultiply(newQ.clone().multiply(base.q.clone().invert()));
   }
   ApplyAnatomicalFingers(a);
   for(const item of protectedBones){item.bone.position.copy(item.position);item.bone.quaternion.copy(item.quaternion);item.bone.scale.copy(item.scale);}
   a.solveDt=1/60;a.videoBody=null;a.reloadBodyOffset=null;
   vm.root.updateWorldMatrix(true,true);for(const side of ['l','r']){a.elbowDirections[side]=null;a._SolveArm(side);a._OrientHand(side);a._AlignGripPosition(side);vm.root.updateWorldMatrix(true,true);a._UpdateGripError(side);}
   for(const item of protectedBones){const delta=Math.max(item.bone.position.distanceTo(item.position),...item.bone.quaternion.toArray().map((v,i)=>Math.abs(v-item.quaternion.toArray()[i])));maximumProtectedDelta=Math.max(maximumProtectedDelta,delta);if(delta>1e-12)throw Error('Protected bone changed: '+item.bone.name);}
   maximumWrist=Math.max(maximumWrist,a.wristBend.l,a.wristBend.r);if(a.wristBend.l>=65||a.wristBend.r>=65||!a.reachable.l||!a.reachable.r)throw Error('Invalid support arm in holding frame '+index);
   if(pass===0)continue;
   const inverse=a.root.matrixWorld.clone().invert();
   frames.push({time,bones:bones.map(b=>({name:b.name,matrix:inverse.clone().multiply(b.matrixWorld).toArray(),local:[...b.position.toArray(),...b.quaternion.toArray()]})),
    controls:Object.fromEntries(Object.entries(animation.Controls()).filter(([key])=>Object.hasOwn(clip.controls,key)).map(([key,object])=>[key,{transform:[...object.position.toArray(),...object.quaternion.toArray()],visible:object.visible}])),
    weapon:inverse.clone().multiply(vm.rig.group.matrixWorld).toArray(),wrist:a.wristBend.l,reach:a.reachRatio.l});
  }
  let maximumLoopDelta=0;for(let i=0;i<boneNames.length;i++)if(selected.has(boneNames[i]))for(let k=0;k<7;k++)maximumLoopDelta=Math.max(maximumLoopDelta,Math.abs(frames[0].bones[i].local[k]-frames.at(-1).bones[i].local[k]));
  if(maximumLoopDelta>1e-6)throw Error('Support loop does not close: '+maximumLoopDelta);
  return {boneNames,selectedBones,fps:60,duration:clip.duration,frames,selectedSides:['l','r'],scope:'BothHands',maximumWrist,maximumProtectedDelta,maximumLoopDelta,baselineAsset:asset};
 };
