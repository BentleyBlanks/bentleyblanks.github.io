// One Blender-authored performance, synchronized to the retained TrainMeal voice.
import * as THREE from 'three';
import { GLTFLoader } from './vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { MissionTrainLifePose } from './Script_FirstLevelMissionTrainLife.mjs';
import { CaptureAnatomy, ApplyAnatomicalFingers } from './Script_FpsAnatomy.mjs';
let assets, loading;
const VERSION='202609112350';
export function LoadFirstLevelMeal(){
  return loading ||= (async()=>{
    const base='./Model/BaconHandoff/';
    const [gltf,response]=await Promise.all([
      new GLTFLoader().loadAsync(base+'Model_CuredPork.glb?v='+VERSION),
      fetch(base+'Data_BaconHandoff.json?v='+VERSION),
    ]);
    if(!response.ok)throw Error('Bacon animation HTTP '+response.status);
    const clip=await response.json();
    assets={clip,whole:gltf.scene.getObjectByName(clip.models.whole),slice:gltf.scene.getObjectByName(clip.models.slice)};
    if(!assets.whole?.isObject3D||!assets.slice?.isObject3D||!clip.frames.length)throw Error('Incomplete bacon performance');
    return assets;
  })();
}
export function CreateMealProp(kind){
  if(!assets)throw Error('Load meal assets before creating mission');
  const object=assets[kind].clone();
  object.name='Meal_'+kind;object.visible=false;
  object.traverse(node=>{if(node.isMesh){node.geometry=node.geometry.clone();node.castShadow=true;node.receiveShadow=true}});
  return object;
}
const Clamp=x=>Math.max(0,Math.min(1,x));
const Smooth=x=>{x=Clamp(x);return x*x*(3-2*x)};
export class FirstLevelMeal {
  constructor(runtime){
    this.r=runtime;this.clip=assets.clip;
    this.root=new THREE.Group();this.root.name='FirstLevelBaconHandoff';runtime.scene.add(this.root);
    this.whole=CreateMealProp('whole');this.slice=CreateMealProp('slice');this.root.add(this.whole,this.slice);
    this.frame={};for(const key of Object.keys(this.clip.frames[0]))this.frame[key]=new THREE.Vector3();
    this.anchor=new THREE.Object3D();this.target=new THREE.Vector3();
    this.owner='giver';this.seconds=0;
  }
  Restore(){
    this.pose?.Restore();
    const arms=this.r.viewmodel?.riggedArms;
    if(this.active&&arms)for(const side of ['r','l']){arms.SetContactWeight(side,1);arms.operationPose[side]=null}
  }
  Sample(seconds){
    const frame=Math.max(0,Math.min(this.clip.frames.length-1,seconds*this.clip.fps));
    const a=Math.floor(frame),b=Math.min(a+1,this.clip.frames.length-1);
    for(const key of Object.keys(this.frame))this.frame[key].fromArray(this.clip.frames[a][key]).lerp(this.target.fromArray(this.clip.frames[b][key]),frame-a);
  }
  PlaceWhole(giver){
    const hand=giver.actor.characterRig.bones.handL;
    this.whole.position.copy(hand.localToWorld(this.anatomy.anatomy.l.frame.position.clone()));
    this.whole.position.y+=.025;this.whole.quaternion.copy(giver.actor.root.quaternion);
    this.whole.rotateZ(-.15);this.whole.visible=true;
  }
  Update(){
    const r=this.r,voice=r.voice.current,giver=r.companion.Handle('yaowa');
    // The existing missing-model fallback can have no anatomical rig.
    const hasHands=!!(giver?.actor?.characterRig?.bones.handR&&giver.actor.characterRig.bones.handL);
    const active=r.flow.stage.id==='Train'&&!r.Has('trainFirstShellImpact')&&giver?.alive&&hasHands;
    const source=voice?.cue.id==='TrainMeal'?voice.sourceTime: r.Has('trainFoodReceived')?this.clip.duration:0;
    this.seconds=Math.max(0,Math.min(this.clip.duration,source));
    this.whole.visible=false;this.slice.visible=false;
    if(giver?.missionTrainLife)giver.missionTrainLife.mealPerforming=!!active;
    if(!active||this.seconds>=this.clip.duration){
      this.active=false;
      if(active&&this.anatomy)this.PlaceWhole(giver);
      return;
    }
    this.active=true;this.Sample(this.seconds);
    const actor=giver.actor,rig=actor.characterRig,b=rig.bones;
    if(!this.pose||this.pose.soldier!==giver){
      this.pose=new MissionTrainLifePose(giver);
      const fingers={r:[],l:[]};
      rig.root.traverse(node=>{const name=node.name.replace(/[^a-z0-9]/gi,'');for(const side of ['r','l'])if(node.isBone&&new RegExp(side+'finger[0-4][0-2]?$','i').test(name))fingers[side].push(node)});
      this.anatomy={root:rig.root,bindPose:[],_Restore(){},unarmed:true,poseState:{sprint:0},fingerBones:fingers,
        bones:Object.fromEntries(['r','l'].map(side=>[side,Object.fromEntries(['hand','upperArm','forearm'].map(key=>[key,b[key+side.toUpperCase()]]))])),
        _FingerRoot:(side,index)=>fingers[side].find(node=>node.name.replace(/[^a-z0-9]/gi,'').toLowerCase().endsWith(side+'finger'+index)),
        contactWeight:{r:0,l:0},operationPose:{}};
      CaptureAnatomy(this.anatomy);
    }
    const pose=this.pose;pose.basis=actor.root;
    actor.root.updateWorldMatrix(true,true);
    for(const side of ['r','l']){
      for(const bone of this.anatomy.fingerBones[side])pose.Save(bone);
      this.anatomy.operationPose[side]={shape:'open',nextShape:'clip',shapeMix:side==='r'?this.frame.GripClosure.y:1};
    }
    ApplyAnatomicalFingers(this.anatomy);
    // World-space donor contacts respect each original skeleton's arm lengths.
    for(const side of ['L','R']){
      const point=this.frame[side==='R'?'DonorRight':'DonorLeft'];
      const target=pose.Local(point.x,point.y,point.z);
      pose.Chain(b['upperArm'+side],b['forearm'+side],b['hand'+side],target,pose.Local(side==='R'?.6:-.6,1.0,-.20));
    }
    rig.root.updateWorldMatrix(true,true);
    const eye=r.player.EyePosition;
    // Before contact use the fixed exchange direction so looking around never
    // rotates the giver or teleports the offered slice. After contact the
    // receiver smoothly brings the hand into their own current field of view.
    const gaze=Smooth((this.seconds-this.clip.transferSeconds)/.8);
    this.anchor.position.copy(eye);
    this.anchor.quaternion.identity().slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(r.player.pitch,r.player.yaw,0,'YXZ')),gaze);
    this.anchor.updateMatrixWorld(true);
    const received=this.seconds>=this.clip.transferSeconds;
    const donorGrip=b.handR.localToWorld(this.anatomy.anatomy.r.frame.position.clone());
    const desired=this.anchor.localToWorld(this.frame.ReceiverRight.clone());
    // Both hands meet the actual sampled donor contact, with a held contact
    // interval around transfer. No duplicated slice or snap between owners.
    const contact=Smooth((this.seconds-.55)/1.1)*(1-Smooth((this.seconds-2.2)/.9));
    desired.lerp(donorGrip,contact);
    const left=this.anchor.localToWorld(this.frame.ReceiverLeft.clone());
    r.viewmodel?.MealHands?.({right:desired,left,closure:this.frame.GripClosure.x,worldRotation:this.anchor.quaternion});
    this.owner=received?'receiver':'giver';
    const receiverGrip=r.viewmodel?.riggedArms?.gripNodes.r.getWorldPosition(new THREE.Vector3())||desired;
    this.slice.position.copy(received?receiverGrip:donorGrip);
    // Expose the thin, layered face to the recipient throughout the exchange.
    this.slice.quaternion.copy(this.anchor.quaternion);
    this.slice.rotateZ(-.10-.14*Smooth((this.seconds-2.2)/.8));
    this.slice.visible=this.seconds<this.clip.sliceHideSeconds;
    this.PlaceWhole(giver);
    this.contactError=received?receiverGrip.distanceTo(this.slice.position):donorGrip.distanceTo(this.slice.position);
    this.handSeparation=receiverGrip.distanceTo(donorGrip);
  }
  State(){return {active:!!this.active,seconds:this.seconds,owner:this.owner,sliceVisible:this.slice.visible,
    wholeVisible:this.whole.visible,contactError:this.contactError??0,handSeparation:this.handSeparation??null,
    slicePosition:this.slice.position.toArray(),source:this.clip.source}}
  Dispose(){this.Restore();this.root.traverse(node=>node.geometry?.dispose());this.root.removeFromParent()}
}
