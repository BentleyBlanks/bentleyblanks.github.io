// Dialogue-sized acting on the original production skeleton. The director owns
// roots, blocking and contact beats; this layer owns attention and free gestures.
import { Quaternion, Vector3 } from "three";
import { OpeningActorAnatomy, SolveOpeningActorArm, CurlOpeningActorFingers, OpeningActorPalm } from "./Script_OpeningFirstPerson.mjs";
import { SpeakerLookAngles } from "./Script_SpeakerHeadLayer.mjs";
import { OPENING_STORYBOARDS } from "./Data_OpeningStoryboards.mjs";

const Clamp=(value,low=0,high=1)=>Math.max(low,Math.min(high,value));
const Smooth=value=>{value=Clamp(value);return value*value*(3-2*value);};
const ContactClips=new Set(["LuoPickUpRifleSling","LuoRescueDrag","LuoHandRifle","DuckBlast","BayonetClearWood","CollarDrag","ButtThreat","DadaoAmbush","RifleDeflect","PullComrade","KickRifle","ShotCollapse","CaptiveStandToKneel",
  // 2026-09-23 library: every paired, contact or violent beat keeps its authored timing and
  // hands (no dialogue gestures or idle substitution on top of them).
  "WoundedRiseWall","BlastSlamBuried","BlastDazedStir","IjaDragCollarFromDirt","IjaPullArm","CaptiveDraggedFromDirt","CaptiveWallBrace",
  "IjaShoveToWall","IjaHairGrabPull","CaptiveHeadPulledBack","IjaDrawBayonet","IjaThroatSlash","CaptiveThroatCut",
  "CaptiveClutchThroat","CaptiveWallSlideTwitch","IjaWipeSheathBayonet","IjaReadyRifle","IjaSlingRifle","IjaCollarDragSnag",
  "IjaKickBeam","IjaButtStrike","IjaHoldCollarUp","InterpreterGrabCollar","InterpreterFlee","LuoDadaoChopRear",
  "IjaChoppedFallWall","HeDadaoParryChop","IjaParriedChoppedFall","LuoDragToCover","HeSwapDadaoRifle","LuoKneelCheck",
  "BanterPatRifle","IjaKickPrisoner","IjaShoveForward","CaptiveKneelFlinch","CaptiveShovedStumble",
  // 2026-09-25 storyboard round: the face is aimed at the first-person eye inside the clip (a
  // dialogue head turn on top would take it off the camera).
  "IjaButtStrikeCollar","IjaDragByForearm","IjaLookBackLow","IjaStartleTurn","IjaGuardPort",
  // 2026-09-27: over the fallen roof timber in and out, and the haul out from under it (the face on the eye).
  "IjaVaultTimberIn","IjaVaultTimberOut","IjaHaulForearmUnder",
  // 2026-09-27 pinned rescue: the jeering walk (upper body), the find, the hair hold and the slaps (the face on the pinned
  // eye inside the clip), He heaving the roof timber (hands on it).
  "IjaTauntWalk","IjaFoundLook","IjaCrouchHairHold","IjaSlapForehand","IjaSlapBackhand","IjaSlapRaise","HeLiftTimber",
  // 2026-09-29: the release and the sheathe after the throat cut (hands on the hair, the knife and the scabbard)
  "IjaReleaseSheathe",
  // hands on the post, the rifle or held out to Shunzi, faces aimed inside the clip: no dialogue gestures or the
  // Banter/Orders MessengerReport substitution on top (the runner and Yaowa talk in those phases)
  "LuoKneelReach","RunnerLeanPostCall","InterpreterHurryReach","YaowaSitLoad",
  // SB05A alternative to IjaChoppedFallWall (the dadao cut and the fall backwards keep their authored timing)
  "IjaChoppedFallBack"]);
// Clips whose face is aimed at the first-person eye inside the clip (listed with ContactClips above) or whose
// hands follow Shunzi's body track: held-pose life keeps their head nearly where the clip put it.
const FaceAimedClips=new Set(["IjaButtStrikeCollar","IjaDragByForearm","IjaLookBackLow","IjaStartleTurn","IjaGuardPort",
  "IjaVaultTimberIn","IjaVaultTimberOut","IjaHaulForearmUnder","LuoKneelReach","RunnerLeanPostCall","InterpreterHurryReach","YaowaSitLoad",
  "IjaCollarDragSnag","IjaKickBeam","IjaButtStrike","IjaDragByForearm","IjaHoldCollarUp","LuoDragToCover","InterpreterCrouchAsk","InterpreterGrabCollar"]);
const Guards=new Set(["ijaA","ijaB","guard","heyoutian","liuwencai"]);
const Hash=value=>[...String(value)].reduce((sum,char)=>(sum*31+char.charCodeAt(0))>>>0,7);
const HandClips=new Set(["ButtThreat","InterrogateCrouch","InterpreterPoint","MessengerReport","PointBlockade"]);
// Phases in which the interpreter questions a prisoner (01 comrade, 02 Shunzi), 09.23 phase table.
const Interrogating=new Set(["CaptiveWall","Interrogation","Slash","Taunt","Hold","Ask"]);

export function SettleOpeningCaptive(soldier,pose){
  if(soldier.alive!==false||pose?.clip!=="ShotCollapse")return;
  const weight=Smooth((pose.seconds-.7)/.9);if(!weight)return;
  const actor=soldier.actor,character=actor.characterRig,bones=character.bones;
  const spine=bones.spine||bones.chest?.parent,anatomy=OpeningActorAnatomy(actor);
  if(!spine||!bones.pelvis||!bones.head||!anatomy)return;
  const Pos=bone=>bone.getWorldPosition(new Vector3());
  const pelvis=Pos(bones.pelvis),forward=Pos(bones.head).sub(pelvis).setY(0).normalize();
  const right=new Vector3().crossVectors(forward,new Vector3(0,1,0)).normalize();
  const targets=["l","r"].map(side=>({side,palm:OpeningActorPalm(anatomy,side)}));
  // The source ends with the arms braced and the chest held above the ground.
  // Relax the lower back into the prone rest while preserving the authored
  // pelvis, planted legs and actor root. Spread/fold the arms as support gives.
  const axis=new Vector3().crossVectors(forward,new Vector3(0,-1,0));
  axis.applyQuaternion(spine.parent.getWorldQuaternion(new Quaternion()).invert());
  spine.quaternion.premultiply(new Quaternion().setFromAxisAngle(axis,.3*weight));
  spine.updateMatrixWorld(true);
  for(const {side,palm} of targets){
    const chain=anatomy.bones[side],arm=[chain.upperArm,chain.forearm,chain.hand];
    const source=arm.map(bone=>bone.quaternion.clone());
    const shoulder=Pos(chain.upperArm),pole=shoulder.clone().addScaledVector(right,side==="l"?-.4:.4).addScaledVector(forward,-.15);
    pole.y=actor.root.position.y+.07;
    SolveOpeningActorArm(anatomy,side,shoulder,palm,forward,new Vector3(0,1,0),pole);
    for(let i=0;i<arm.length;i++)arm[i].quaternion.copy(source[i].slerp(arm[i].quaternion,weight));
    chain.upperArm.updateMatrixWorld(true);
  }
  character.root.updateMatrixWorld(true);
}

/** Contact animation still determines where and when the palms arrive. Fix the
 * source wrist's 180-degree roll using the same bind-calibrated anatomical chain
 * as the player, without moving the shoulder or changing the impact clock. */
export function CorrectOpeningActorGrips(soldier,pose){
  const actor=soldier.actor,character=actor.characterRig;
  if(!HandClips.has(pose?.clip)||pose.nativeArms||(!soldier.id&&!soldier.missionId)){character.openingActorGripState=null;return;}
  const rig=OpeningActorAnatomy(actor);
  if(!rig){character.openingActorGripState=null;return;}
  const rootQ=actor.root.getWorldQuaternion(new Quaternion());
  const right=new Vector3(1,0,0).applyQuaternion(rootQ),forward=new Vector3(0,0,-1).applyQuaternion(rootQ);
  const result={clip:pose.clip,hands:{}};
  const targets=["l","r"].map(side=>{
    const chain=rig.bones[side],Pos=bone=>bone.getWorldPosition(new Vector3());
    const shoulder=Pos(chain.upperArm),wrist=Pos(chain.hand),elbow=Pos(chain.forearm);
    return {side,shoulder,palm:OpeningActorPalm(rig,side),direction:wrist.sub(elbow).normalize(),
      dorsal:right.clone().multiplyScalar(side==="l"?-1:1),
      pole:shoulder.clone().addScaledVector(right,side==="l"?-.38:.38).addScaledVector(forward,.08).add(new Vector3(0,-.38,0))};
  });
  const gestures=[];
  for(const target of targets){
    const {side,shoulder,palm,direction,dorsal,pole}=target;
    // The gesture hand keeps its authored finger shape, including the extended
    // index finger. Only the rifle grip closes around the stock/fore-end.
    const fingerPose=rig.fingerBones[side].map(bone=>bone.quaternion.clone());
    const solved=SolveOpeningActorArm(rig,side,shoulder,palm,direction,dorsal,pole);
    if(actor.weaponId&&pose.clip!=="InterrogateCrouch"&&(side==="r"||pose.clip==="ButtThreat"))CurlOpeningActorFingers(rig,side,[58,76,42]);
    else gestures.push({side,fingerPose});
    result.hands[side]={wristBend:solved.wristBend,contactError:solved.contactError,reachRatio:solved.reachRatio};
  }
  for(const {side,fingerPose} of gestures)for(let i=0;i<rig.fingerBones[side].length;i++)rig.fingerBones[side][i].quaternion.copy(fingerPose[i]);
  character.root.updateMatrixWorld(true);character.openingActorGripState=result;
}

/** Refresh after Mark, and for 02–03 free actors while dialogue is active.
 * role/speaker use the dialogue's who IDs. clock is the monotonic mission clock;
 * lineSeconds is elapsed within the audible line, not the entire cue. lookAt is
 * a world point at the speaker's head. No body root or AI state is written here.
 */
export function SetOpeningActorPerformance(soldier,context){
  if(soldier)soldier.openingActorPerformance={...context};
}
export function ClearOpeningActorPerformance(soldier){
  if(!soldier)return;
  soldier.openingActorPerformance=null;
  soldier.actor?.characterRig?.openingActorPerformance?.Reset();
}

/** Select meaningful existing clips, while leaving native combat and every
 * authored contact/death segment under their original timing authority. */
export function ResolveOpeningActorPose(soldier,pose,clock,record){
  const context=soldier.openingActorPerformance;
  if(!context||soldier.alive===false||ContactClips.has(pose?.clip))return pose;
  const speaking=context.speaker===context.role;
  const stationary=(soldier.openingStoryboardTravel||0)<.1;
  // 2026-09-23 director phases (Data_OpeningStoryboards.phases): Banter/Orders are the dugout talk.
  const opening=["Banter","Orders"].includes(context.phase);
  let resolved=pose;
  if(opening&&stationary&&context.role==="luo")resolved={clip:speaking?"PointBlockade":"MessengerReport",seconds:clock};
  if(opening&&stationary&&context.role==="runner")resolved={clip:"MessengerReport",seconds:clock};
  if(context.phase==="Captive"&&stationary&&context.role==="captiveHelper"&&speaking
      &&record?.clips.CaptiveKneelPlead)resolved={clip:"CaptiveKneelPlead",seconds:clock};
  if(!resolved)return null;
  const clip=record?.clips[resolved.clip];
  // Only IJA rigs contain IjaBayonetGuard. NRA idle used to request this missing
  // clip and then suppress its own native breathing, producing frozen extras.
  if(!clip&&resolved.clip!=="DadaoAmbush"){
    if(stationary&&Guards.has(context.role)&&record?.clips.MessengerReport)
      return {clip:"MessengerReport",seconds:clock+(Hash(context.role)%997)/211,nativeArms:true,weaponHold:"twoHand"};
    return null;
  }
  // Long-lived holds must keep sampling after a line/phase changes. Contact
  // clips above continue to use their exact director-provided playback time.
  if(clip?.loop)resolved={...resolved,seconds:clock+(Hash(context.role)%997)/211};
  return resolved;
}

export class OpeningActorPerformance {
  constructor(soldier){
    this.soldier=soldier;this.actor=soldier.actor;this.rig=this.actor.characterRig;
    this.saved=new Map();this.pool=[];this.clock=0;this.speech=0;this.lookYaw=0;this.lookPitch=0;this.still=null;
    this.rootQ=new Quaternion();this.parentQ=new Quaternion();this.turnQ=new Quaternion();
    this.axis=new Vector3();this.right=new Vector3();this.forward=new Vector3();this.up=new Vector3(0,1,0);
    this.origin=new Vector3();this.target=new Vector3();this.local=new Vector3();this.lookAngles={yaw:0,pitch:0};
    this.phase=(Hash(soldier.missionId||soldier.id||this.rig.modelId)%997)/157;
  }
  Restore(){for(const [bone,q] of this.saved){bone.quaternion.copy(q);this.pool.push(q);}this.saved.clear();}
  Reset(){this.Restore();this.speech=0;this.lookYaw=0;this.lookPitch=0;this.still=null;this.rig.openingActorPerformanceState=null;}
  Turn(bone,axis,angle){
    if(!bone?.parent||Math.abs(angle)<1e-6)return;
    if(!this.saved.has(bone))this.saved.set(bone,(this.pool.pop()||new Quaternion()).copy(bone.quaternion));
    bone.parent.getWorldQuaternion(this.parentQ).invert();
    this.axis.copy(axis).applyQuaternion(this.parentQ).normalize();
    this.turnQ.setFromAxisAngle(this.axis,angle);bone.quaternion.premultiply(this.turnQ);
    bone.updateMatrixWorld(true);
  }
  Apply(dt,state,pose){
    this.clock+=Math.max(0,dt);
    const context=this.soldier.openingActorPerformance,bones=this.rig.bones;
    if(!context||state.dead||this.soldier.alive===false||this.soldier.openingStoryboardHidden){this.rig.openingActorPerformanceState=null;return;}
    const talking=context.role===context.speaker;
    const protectedBeat=ContactClips.has(pose?.clip)||state.meleeCombat?.state==="attack";
    const meleeActive=state.meleeCombat?.state==="attack"||state.meleeCombat?.state==="bind";
    const nativeCombat=this.soldier.openingStoryboardTravel==null&&(state.firing||state.fire>0||state.aim>.6||meleeActive);
    // The seated loading clip owns both hands and the rifle, but Yaowa must
    // still acknowledge his spoken lines. Keep its body/contact pose intact.
    const loadingSpeech=pose?.clip==="YaowaSitLoad"&&talking&&!meleeActive;
    const headOnly=nativeCombat&&talking||loadingSpeech;
    if(protectedBeat&&!loadingSpeech||nativeCombat&&!talking){this.rig.openingActorPerformanceState={role:context.role,protected:true};return;}
    const time=(Number.isFinite(context.clock)?context.clock:this.clock)+this.phase;
    const lineAge=Math.max(0,context.lineSeconds||0);
    const voice=Number.isFinite(context.speechLevel) ? .35+.65*Clamp(context.speechLevel) : 1;
    const desired=talking?Smooth(lineAge/.22)*voice:0;
    this.speech+=(desired-this.speech)*(1-Math.exp(-dt*9));
    const moving=(this.soldier.openingStoryboardTravel||Math.abs(state.moveSpeed||0)*4.2)>.1;
    // Standing still as a weight (about 0.3 s to change): the free-hand gestures and the full chest turns ease
    // out as a man sets off and back in as he stops, instead of dropping in one frame (a 17-33 deg upper-arm jump).
    this.still=this.still==null?(moving?0:1):this.still+((moving?0:1)-this.still)*(1-Math.exp(-dt*7));
    const still=this.still;
    // The wounded comrade is "comrade" in the 09.23 cast (captiveHelper was the 09.21 name).
    const guard=Guards.has(context.role),captive=context.role==="captiveHelper"||context.role==="comrade";
    const interrogating=Interrogating.has(context.phase);
    const breath=Math.sin(time*(captive?3.4:2.1));
    const sway=Math.sin(time*.93)*Math.sin(time*.37);
    // Faces with a rig nod on the stressed syllables of their face track; the
    // synthetic beat remains only for bodies without a face.
    const emphasis=(this.rig.facial?(this.rig.facial.stress||0):(.5-.5*Math.cos(lineAge*4.6)))*this.speech;
    this.actor.root.getWorldQuaternion(this.rootQ);
    this.right.set(1,0,0).applyQuaternion(this.rootQ);
    this.forward.set(0,0,-1).applyQuaternion(this.rootQ);
    const chest=bones.chest||bones.spine,neck=bones.neck||bones.head;
    // Spine-only weight redistribution keeps both authored soles exactly where
    // they were. Actors in motion retain their existing gait and arm swing.
    if(!headOnly){
      this.Turn(chest,this.right,(.016*breath-.035*emphasis)*(.45+.55*still));
      this.Turn(chest,this.forward,.027*sway*(.3+.7*still));
    }
    let yaw=guard?.22*Math.sin(time*.57):.075*Math.sin(time*.69);
    let pitch=.02*breath;
    if(context.lookAt&&bones.head){
      bones.head.getWorldPosition(this.origin);
      this.target.set(context.lookAt.x,context.lookAt.y??this.origin.y,context.lookAt.z);
      // Shared look math (Script_SpeakerHeadLayer): forward hemisphere only.
      ({yaw,pitch}=SpeakerLookAngles(this.rootQ,this.origin,this.target,this.lookAngles,this.local));
      if(guard&&!talking)yaw=Clamp(yaw*.35+.18*Math.sin(time*.57),-.38,.38);
    }
    const gazeMix=1-Math.exp(-dt*4);
    this.lookYaw+=(yaw-this.lookYaw)*gazeMix;this.lookPitch+=(pitch-this.lookPitch)*gazeMix;
    if(headOnly){
      // A gunner can call out while keeping both hands and the gun on target.
      // Some Biped clavicles descend from Neck, so rotate Head only here.
      this.Turn(bones.head,this.up,Clamp(this.lookYaw,-.14,.14));
      this.Turn(bones.head,this.right,Clamp(this.lookPitch,-.10,.10)-.065*emphasis+.012*breath);
    }else{
      this.Turn(neck,this.up,this.lookYaw*.65);
      this.Turn(bones.head,this.up,this.lookYaw*.35);
      this.Turn(bones.head,this.right,this.lookPitch-.10*emphasis+.025*breath);
    }
    // Free hands give the line a beginning, emphasis and release. Rifle hands
    // stay attached; their entire chest/weapon follows the same breathing turn.
    if(still>.001&&!headOnly){
      const G=(bone,axis,angle)=>this.Turn(bone,axis,angle*still);
      if(context.role==="yaowa"&&["Banter","Orders"].includes(context.phase)){
        G(bones.upperArmR,this.right,-.16+.32*emphasis);
        G(bones.forearmR,this.forward,.10*this.speech*Math.sin(lineAge*2.4));
      }else if(context.role==="interpreter"&&interrogating){
        G(bones.upperArmR,this.right,-.58*(1-this.speech)+.22*emphasis);
        G(bones.upperArmR,this.up,.10*this.speech*Math.sin(lineAge*2.2));
        G(bones.forearmR,this.right,.12*emphasis);
        G(chest,this.right,-.065*this.speech-.02*emphasis);
      }else if(captive&&interrogating&&talking){
        // The kneeling comrade pleads with his free left hand while he answers (「我不晓得……」), on top of the kneel.
        G(bones.upperArmL,this.right,-.42*this.speech+.2*emphasis);
        G(bones.forearmL,this.right,-.25*this.speech);
        G(chest,this.right,-.04*this.speech);
      }else if(context.role==="ijaA"&&pose?.clip==="InterrogateCrouch"){
        G(bones.upperArmR,this.right,-.32*(1-this.speech)+.24*emphasis);
        G(chest,this.right,-.055*emphasis);
      }else if(context.role==="luo"&&pose?.clip==="PointBlockade"){
        G(bones.upperArmL,this.right,-.30+.34*emphasis);
        G(bones.upperArmL,this.up,.12*Math.sin(lineAge*2)*this.speech);
      }else if(context.role==="runner"&&pose?.clip==="MessengerReport"){
        G(chest,this.right,-.04-.025*breath);
        G(bones.upperArmL,this.right,.45*this.speech+.22*emphasis);
        G(bones.upperArmL,this.forward,-.22*this.speech);
      }
    }
    this.rig.root.updateMatrixWorld(true);
    this.rig.openingActorPerformanceState={role:context.role,phase:context.phase,cue:context.cue,line:context.line,
      speaking:talking,speech:this.speech,emphasis,clock:time,lookYaw:this.lookYaw,lookPitch:this.lookPitch,
      clip:pose?.clip||"Native",moving,headOnly,protected:false};
  }
}

/** Life on a held pose (Data_OpeningStoryboards.heldLife). The director holds men on still frames for long stretches
 * (Luo kneeling at the mouth for 53 s of Banter, ijaB on the ready for 10 s of 02's Hold, a collar held on a hold
 * loop), and a contact clip there carries no dialogue acting, so they stood as statues. Once the pose's watched
 * bones have gone still this adds breathing, a slow sway and a wandering look on the spine, neck and head; it
 * fades out in a few frames as soon as the clip moves again. Hands follow the chest by millimetres. */
export class OpeningHeldLife {
  constructor(soldier){
    this.soldier=soldier;this.rig=soldier.actor.characterRig;this.weight=0;this.clock=0;this.primed=false;
    this.phase=(Hash(soldier.missionId||soldier.id||this.rig.modelId)%997)/61;
    const b=this.rig.bones;
    this.watch=[b.pelvis,b.spine,b.chest,b.neck,b.head,b.upperArmL,b.upperArmR,b.thighL,b.thighR].filter(Boolean);
    this.previous=this.watch.map(()=>new Quaternion());
    this.saved=new Map();this.pool=[];this.rootQ=new Quaternion();this.parentQ=new Quaternion();this.turnQ=new Quaternion();
    this.axis=new Vector3();this.right=new Vector3();this.forward=new Vector3();this.up=new Vector3(0,1,0);
  }
  Restore(){for(const [bone,q] of this.saved){bone.quaternion.copy(q);this.pool.push(q);}this.saved.clear();}
  Turn(bone,axis,angle){return OpeningActorPerformance.prototype.Turn.call(this,bone,axis,angle);}
  /** active: nothing else animates this man's spine and head this frame (no dialogue acting, alive, not in melee). */
  Apply(dt,pose,active){
    const L=OPENING_STORYBOARDS.heldLife,step=Math.max(0,dt);
    let motion=0;
    for(let i=0;i<this.watch.length;i++){motion=Math.max(motion,this.watch[i].quaternion.angleTo(this.previous[i]));this.previous[i].copy(this.watch[i].quaternion);}
    const still=active&&this.primed&&step>0&&motion/step<L.stillRadS;
    this.primed=true;this.clock+=step;
    if(step>0)this.weight+=((still?1:0)-this.weight)*(1-Math.exp(-step/(still?L.inS:L.outS)));
    if(!active)this.weight=0;
    if(this.weight<.001)return false;
    const b=this.rig.bones,chest=b.chest||b.spine,neck=b.neck||b.head,w=this.weight,t=this.clock+this.phase,Tau=Math.PI*2;
    const face=FaceAimedClips.has(pose?.clip)?L.faceAimedShare:1;
    this.soldier.actor.root.getWorldQuaternion(this.rootQ);
    this.right.set(1,0,0).applyQuaternion(this.rootQ);this.forward.set(0,0,-1).applyQuaternion(this.rootQ);
    const breath=Math.sin(Tau*L.breathHz*t),sway=Math.sin(Tau*L.swayHz*t)*Math.sin(Tau*.043*t+1.3);
    const yaw=L.headYawRad*(.65*Math.sin(Tau*L.headYawHz[0]*t)+.35*Math.sin(Tau*L.headYawHz[1]*t+2.1))*face;
    const pitch=L.headPitchRad*Math.sin(Tau*L.headPitchHz*t+.7)*face;
    this.Turn(chest,this.right,L.breathRad*breath*w);
    this.Turn(chest,this.forward,L.swayRad*sway*w);
    this.Turn(neck,this.up,yaw*L.neckShare*w);
    this.Turn(b.head,this.up,yaw*(1-L.neckShare)*w);
    this.Turn(b.head,this.right,(pitch-.4*L.breathRad*breath)*w);
    this.rig.root.updateMatrixWorld(true);
    return true;
  }
}
