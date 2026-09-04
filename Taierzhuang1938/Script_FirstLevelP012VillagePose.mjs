// Opt-in GLB arm IK for the two village door workers ONLY. No three import:
// vectors/quaternions are cloned from the real rig. Never changes clip selection,
// root, pelvis, legs, weapon poses or the shared Actor/CharacterModel classes.
const installed=new WeakMap();
// Side-working pocket: the board rotates between the workers, never through
// their feet. Move to position through the host character sweep, do not teleport.
// Controller must hold board progress while either worker is not at position.
export function P012VillageWorkerTargets(spec,door,groundAt){
 const side=spec.id.endsWith("A")?-1:1,p=Math.max(0,Math.min(1,door.progress||0));
 const position={x:door.position.x+side*.83,z:door.position.z+.12};
 const yaw=side<0?-Math.PI/2:Math.PI/2;
 const localCenter=.2-.55*p,rotation=door.rotationX;
 function Target(offset){const localY=localCenter+offset;return{x:door.position.x+side*.47,y:groundAt(door.position.x,door.position.z)+door.height+Math.cos(rotation)*localY-Math.sin(rotation)*.07,z:door.position.z+Math.sin(rotation)*localY+Math.cos(rotation)*.07};}
 return{position,yaw,crouch:p>=.2?.5:0,targets:{left:Target(-side*.16*p),right:Target(side*.16*p)},speedMps:.35,arrivalRadius:.04,bodyRadius:.3};
}
export function InstallP012VillagePose(actor){
 const rig=actor?.characterRig;if(!rig?.root||typeof rig.Update!=="function")return null;
 if(installed.has(rig))return installed.get(rig);
 const chains=["L","R"].map(side=>[rig.bones?.[`upperArm${side}`],rig.bones?.[`forearm${side}`],rig.bones?.[`hand${side}`]]);
 if(chains.some(chain=>chain.some(bone=>!bone)))return null;
 const original=rig.Update,saved=new Map();let targets=null,report=[],disposed=false;
 function Restore(){for(const [bone,quaternion] of saved)bone.quaternion.copy(quaternion);saved.clear();}
 function Aim(bone,child,target){
  rig.root.updateWorldMatrix(true,true);
  const start=bone.getWorldPosition(bone.position.clone()),end=child.getWorldPosition(child.position.clone());
  const direction=end.sub(start).normalize(),desired=target.clone().sub(start).normalize();
  const correction=bone.quaternion.clone().setFromUnitVectors(direction,desired);
  const world=bone.getWorldQuaternion(bone.quaternion.clone()).premultiply(correction);
  const inverse=bone.parent.getWorldQuaternion(bone.quaternion.clone()).invert();
  bone.quaternion.copy(inverse.multiply(world));
 }
 function Solve(chain,target,side){
  const [upper,forearm,hand]=chain;rig.root.updateWorldMatrix(true,true);
  const shoulder=upper.getWorldPosition(upper.position.clone()),elbow=forearm.getWorldPosition(forearm.position.clone()),palm=hand.getWorldPosition(hand.position.clone());
  const lengthA=shoulder.distanceTo(elbow),lengthB=elbow.distanceTo(palm),requested=shoulder.clone().set(target.x,target.y,target.z);
  const axis=requested.clone().sub(shoulder),distance=axis.length();if(distance<.0001)return;
  axis.normalize();const reach=Math.max(Math.abs(lengthA-lengthB)+.00001,Math.min(lengthA+lengthB-.00001,distance));
  const endpoint=shoulder.clone().addScaledVector(axis,reach);
  // Elbows bend down/outward relative to actor forward (-Z), not relative to
  // imported FBX local bone axes (which vary between UpperArm and Forearm).
  const world=actor.root.getWorldQuaternion(actor.root.quaternion.clone());
  let bend=axis.clone().set(side==="left"?-.4:.4,-1,.1).normalize().applyQuaternion(world);
  bend.addScaledVector(axis,-bend.dot(axis));
  if(bend.lengthSq()<.000001){bend.set(0,0,-1).applyQuaternion(world);bend.addScaledVector(axis,-bend.dot(axis));}
  bend.normalize();const along=(lengthA*lengthA-lengthB*lengthB+reach*reach)/(2*reach);
  const joint=shoulder.clone().addScaledVector(axis,along).addScaledVector(bend,Math.sqrt(Math.max(0,lengthA*lengthA-along*along)));
  saved.set(upper,upper.quaternion.clone());saved.set(forearm,forearm.quaternion.clone());
  Aim(upper,forearm,joint);Aim(forearm,hand,endpoint);rig.root.updateWorldMatrix(true,true);
  const actual=hand.getWorldPosition(hand.position.clone());
  report.push({side,target:{...target},actual:{x:actual.x,y:actual.y,z:actual.z},residual:actual.distanceTo(requested),unreachable:Math.abs(reach-distance)>.001});
 }
 function UpdateVillagePose(dt,state={}){
  Restore();const result=original.call(this,dt,state);report=[];
  if(!disposed&&targets){Solve(chains[0],targets.left,"left");Solve(chains[1],targets.right,"right");}
  return result;
 }
 const handle={
  SetTargets(value){if(disposed)return;targets=value&&[value.left,value.right].every(p=>p&&[p.x,p.y,p.z].every(Number.isFinite))?{left:{...value.left},right:{...value.right}}:null;},
  Snapshot(){return{active:!!targets&&!disposed,hands:report.map(row=>({...row,target:{...row.target},actual:{...row.actual}}))};},
  Dispose(){if(disposed)return;disposed=true;targets=null;Restore();if(rig.Update===UpdateVillagePose)rig.Update=original;installed.delete(rig);report=[];rig.root.updateWorldMatrix(true,true);},
 };
 rig.Update=UpdateVillagePose;installed.set(rig,handle);return handle;
}
