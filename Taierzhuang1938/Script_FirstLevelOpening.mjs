import { OPENING as C } from "./Data_FirstLevelOpening.mjs";
import { MISSION_TUNING as R, OPENING_PERCEPTION as P } from "./Data_Tuning_FirstLevel.mjs";
import { MISSION_ANCHORS as A, MISSION_PLACEMENT as Place, MISSION_LAYOUT as Layout } from "./Data_FirstLevelMissionLayout.mjs";
import { SampleMissionTerrain as Ground } from "./Data_FirstLevelMissionTerrain.mjs";
import { CLOSE_RANGE } from "./Data_Tuning_AiShooting.mjs";
import { SpeakingCastOptions } from "./Data_FirstLevelSpeakingCast.mjs";
import { FRONT_SORTIE } from "./Data_FirstLevelFrontRoute.mjs";
import { OPENING_STORYBOARDS as Storyboard } from "./Data_OpeningStoryboards.mjs";
const Distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const Smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)};
// 一条 [[秒, 值], ...] 曲线在 t 处的取样：段内 smoothstep，两端夹住。
export const SamplePerceptionCurve=(rows,t)=>{
  const next=rows.findIndex(([at])=>at>t);
  if(next<0)return rows.at(-1)[1];if(next===0)return rows[0][1];
  const [a,x]=rows[next-1],[b,y]=rows[next];return x+(y-x)*Smooth((t-a)/(b-a));
};
const Curve=SamplePerceptionCurve;
// Keep the impact onset at its authored time; stretch only recovery after the peak.
export const OpeningRecoveryTime=(elapsed,onset)=>elapsed<=onset?elapsed:onset+(elapsed-onset)/R.openingRecoveryScale;

// A pure mission-clock sample: pause, re-render and different frame rates all
// produce the same recovery. No accumulated post-process animation time.
export function SampleOpeningPerception(elapsed){
  const age=OpeningRecoveryTime(elapsed,P.onsetS);
  return {
    eyeClosure:Curve(C.blinks,OpeningRecoveryTime(elapsed,C.blinks.find(([,value])=>value===1)[0])),
    amount:Curve(P.intensity,age),focus:Curve(P.focus,age),
    pitch:Curve(P.pitch,age),roll:Curve(P.roll,age),
  };
}

const SegmentDistance=(p,a,b)=>{
  const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);
};
/**
 * The wounded gunner's way back (2026-09-23 space §10.2): the way He came in, as the access-trench
 * polyline FRONT_SORTIE.zhouExit (left gun access -> support sap -> SJ -> collection rest), which
 * Script_FirstLevelSpaceTest checks for capsule clearance and a climbable slope. A gunner displaced
 * off the seat joins it after the leg nearest to him instead of walking back to the seat first -- but
 * only over a clear first leg (a capsule of `radius` against the solid blocks, the SpaceTest rule): a
 * gunner pushed off the line by the AI steps back to the earlier corner first instead of cutting a wall.
 * A corner he already stands on is behind him (the 04 checkpoint puts him on zhouExit[2]: he walks on from [3]).
 * The runtime walk is Script_FirstLevelFrontBattle.UpdateZhou (both the 03 hand-over and the 04 checkpoint).
 */
const ZHOU_ON_CORNER_M=.05;
const ZHOU_SOLIDS=Layout.blocks.filter(block=>block.solid!==false&&!(Layout.walkableSurfaces||[]).some(surface=>surface.id===block.id));
function ZhouLegClear(a,b,radius){
  const length=Distance(a,b);
  // From one radius out: where he already stands is not a new obstruction.
  for(let d=Math.min(radius,length);d<=length;d+=.2){
    const t=length?d/length:0,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=Ground(x,z);
    for(const box of ZHOU_SOLIDS){
      const c=Math.cos(box.ry||0),s=Math.sin(box.ry||0),dx=x-box.x,dz=z-box.z;
      if(Math.abs(dx*c-dz*s)<box.w/2+radius&&Math.abs(dx*s+dz*c)<box.d/2+radius&&box.y+box.h/2>y+.3&&box.y-box.h/2<y+1.7)return false;
    }
  }
  return true;
}
export function ZhouGunExitRoute(start,radius=.34){
  const route=FRONT_SORTIE.zhouExit;
  let join=1,best=Infinity;
  for(let i=1;i<route.length;i++){const d=SegmentDistance(start,route[i-1],route[i]);if(d<best-1e-9){best=d;join=i;}}
  while(join<route.length-1&&Distance(start,route[join])<ZHOU_ON_CORNER_M)join++;
  // Blocked straight to the join point: go back along the polyline to a corner he can reach.
  while(join>0&&!ZhouLegClear(start,route[join],radius))join--;
  return route.slice(Math.max(0,join)).map(point=>({x:point.x,z:point.z}));
}

// 2026.09.19 重构（docs/Data_FirstLevelRebuild20260919Contract.md §2）：
// 开场从「军列遭炮击」换成「掩蔽部被近失弹埋了」。这个模块管 01/02 两步的演出
// （黑屏对白 → 近爆 → 受困 → 门外行刑 → 日兵转向门内 → 班长把人拖出来），
// 以及 03/04 沿用的机枪手老周与开火窗口轮转。
// 坐标、名单与时刻全在数据表里；AI 照旧拥有走位、瞄准、压制、弹药与伤害。
export class FirstLevelOpening {
  constructor(runtime){this.r=runtime;this.peakPlayerShooters=0;this.fireSeen=new Map();this.fireEvents=[];this.shotCount=0;this.playerShotCount=0;this.peakVisible=0;
    this.pack={id:"ShunziPack",contents:["CivilianClothes"],carried:true};
    // `captives` 是取 Front 包那一份的只读视图（见下面的 getter）。
    this.reducedMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');}

  // --- 空间：掩蔽部一带的固定点（全部取 MISSION_PLACEMENT.bunker，空间包改摆位这里跟着走） --
  /**
   * 班里人在掩蔽部与它后侧交通壕里的位置（PlaceSquad 用）。顺序与
   * `PlaceSquad` 的名单一致：罗班长 / 幺娃 / 何有田 / 刘文财。
   * 前两个是 02 掀木架、拉背包的那两位（`luoEntry` 还在后壁破口外，掀架时才挤进来）；
   * 何有田在西边的后交通壕开火逼日兵转身；刘文财跟在他旁边。
   */
  BunkerPost(slot){
    const b=Place.bunker;
    const posts=[b.luoEntry,b.yaowaLift,b.heyoutianFire,{x:b.heyoutianFire.x+2.2,z:b.heyoutianFire.z-1.4}];
    return posts[slot]||posts.at(-1);
  }
  /** 分镜控制段的起始位置与获救位置。 */
  // 2026-09-25 storyboard round: pinned in the dugout mouth (director shunzi.trap), not the dugout anchor.
  get TrappedPoint(){return {x:Storyboard.shunzi.trap.x,z:Storyboard.shunzi.trap.z};}
  get RescueEnd(){
    const b=Place.bunker;
    return {x:(b.luoLift.x+b.yaowaLift.x)/2,z:(b.luoLift.z+b.yaowaLift.z)/2};
  }

  // --- 01 受困 --------------------------------------------------------------
  BeginBunker(){
    const r=this.r;
    if(this.bunker)return;
    this.bunker={started:r.time,blastAt:null,killAt:null,killed:0,searchAt:null};
    r.BeginControl("trapped",R.trappedMaxS,{lookAt:r.Point(A.bunkerDoor,1.1),lookSeconds:R.deathLookSeconds});
    r.player.stance="prone";
    this.SpawnCaptives();
  }
  /**
   * 当前唯一俘虏、翻译与先头兵由分镜导演管理。
   * 摆位与事件归 `Script_OpeningStoryboards`，这里只转发。
   */
  SpawnCaptives(){
    this.r.frontShow?.bunker.Begin();
  }
  get captives(){return this.r.frontShow?.bunker.captives || [];}
  /** 近爆（黑屏对白末句被打断处；没有音频时按 bunkerBlastAtS 兜底）。 */
  BunkerBlast(){
    const r=this.r;
    if(!this.bunker||this.bunker.blastAt!=null)return;
    this.bunker.blastAt=r.time;
    this.blastAt=r.time;
    r.player.Suppress?.(.9);
    r.audio.Deafen?.(1.1);
    r.Record("bunkerCollapsed",{x:A.bunker.x,z:A.bunker.z});
    r.frontShow?.bunker.Blast();
  }
  /** 检查点重试落在 01：整拍重来。 */
  ResetBunker(){
    const r=this.r;
    for(const id of ["bunkerCollapsed","captivesKilled","doorSearchStarted"])r.flow.facts.delete(id);
    r.flow.log=r.flow.log.filter(entry=>!(entry.kind==="fact"&&["bunkerCollapsed","captivesKilled","doorSearchStarted"].includes(entry.id)));
    r.frontShow?.bunker.Reset();
    this.bunker=null;this.blastAt=null;
    this.BeginBunker();
  }
  /**
   * 受困段每帧。近爆兜底留在这里（它是感知曲线的起点）；门外的行刑、踢枪、
   * 转向门内与后侧清理坍塌物的声音全在 Front 包的 `FirstLevelBunkerShow`。
   */
  UpdateBunker(){
    const r=this.r,bunker=this.bunker;
    if(!bunker)return;
    // 2026-09-23: the opening director owns the near miss. BunkerIncoming.01 is cut by it (voice
    // event BunkerBlast) and the director fires it itself when that event is late
    // (Data_OpeningStoryboards.timeouts.blastEventS). Only a runtime without a director keeps the
    // old banter-length fallback.
    if(!r.frontShow?.bunker&&bunker.blastAt==null&&r.time-bunker.started>=R.bunkerBanterFallbackS)this.BunkerBlast();
    if(bunker.blastAt==null)return;
    r.frontShow?.bunker.UpdateBunker(bunker);
  }

  // --- 02 获救 --------------------------------------------------------------
  RescueElapsed(){return this.rescueAt==null?0:this.r.time-this.rescueAt;}
  RescueSampleTime(){return this.RescueElapsed();}
  UpdateRescue(){ /* Storyboard director owns this performance. */ }
  /** 受困与被拖出来那两段的身体位置（BeforePlayer 每帧调）：开场导演按 phase 摆。 */
  PlacePlayer(){
    const r=this.r;
    if(r.Has("luoRescueComplete"))return;
    if(r.frontShow?.bunker){r.frontShow.bunker.PlacePlayer();return;}
    const at=this.TrappedPoint,y=r.battlefield.GroundHeight(at.x,at.z);
    r.player.position.set(at.x,y,at.z);r.player.body?.Teleport(at.x,y,at.z);r.player.velocity.set(0,0,0);
  }
  /** 感知（眼皮 + 恍惚 + 耳鸣）。整关只有这一处重击，曲线与旧开场逐字相同。 */
  ApplyCamera(){
    const r=this.r;
    this.eyeClosure=0;this.concussion=null;this.blackout=0;
    if(r.frontShow?.bunker.ApplyCamera())return;
    // After the hand-back the director's concussion residue fades out while the player is in control.
    const residue=r.frontShow?.bunker?.ReleasedPerception?.();
    if(residue){this.concussion=residue;return;}
    if(this.blastAt==null||r.frontShow?.bunker)return;
    const elapsed=r.time-this.blastAt;
    const perception=SampleOpeningPerception(elapsed);
    this.eyeClosure=perception.eyeClosure;
    this.concussion=perception;
    this.blackout=perception.eyeClosure>=.99?1:0;
    const cam=r.player.camera;
    if(cam&&!this.reducedMotion?.matches){
      cam.rotation.x+=perception.pitch;
      cam.rotation.z+=perception.roll;
      cam.updateMatrixWorld(true);
    }
  }

  Enter(stage){
    const r=this.r;
    if(stage==="Trapped")this.BeginBunker();
    if(stage==="BunkerRescue"){
      if(!r.controls)r.BeginControl("trapped",R.trappedMaxS);
    }
    if(stage==="Support"){
      r.rifleStartShots=r.Inventory().shots;
      this.SpawnZhou();
    }
  }
  SpawnZhou(){
    const r=this.r;
    if(this.zhou)return;
    this.zhou=r.ai.Spawn("nra",C.zhouGunSeat.x,C.zhouGunSeat.z,{weapon:"Zb26",squadId:"MissionZhouGun",...SpeakingCastOptions("zhou")});
    if(!this.zhou)return; // A temporarily unavailable physical spawn retries next frame.
    this.zhou.missionId=r.column.zhou.id;this.zhou.castId="zhou";
    this.zhou.scriptEssential=true;
    r.PlaceActor(this.zhou,C.zhouGunSeat);
    r.Defend(this.zhou,C.zhouGunSeat,0,R.companionCoverSlackM);r.ai.SetStance(this.zhou,1,.5,true);
    r.emplacement.NpcOccupy(r.leftGunId,this.zhou);
    r.view.BandageZhou(this.zhou);
  }
  SpawnMessenger(id,route,weapon,role="runner"){
    const r=this.r,actor=r.ai.Spawn("nra",route[0].x,route[0].z,{weapon,scriptedNoncombatant:true,squadId:id,...SpeakingCastOptions(role)});
    if(!actor)return null;
    actor.missionId=id;actor.scriptEssential=true;actor.speakerRole=role;
    r.MoveActor(actor,actor.position,0);return {actor,route,index:1};
  }
  Messenger(entry,speed){
    if(!entry?.actor.alive)return;
    const r=this.r,{actor,route}=entry;
    while(entry.index<route.length&&Distance(actor.position,route[entry.index])<.6)entry.index++;
    r.MoveActor(actor,route[entry.index]||actor.position,entry.index<route.length?speed:0);
    if(entry.index===route.length)r.ai.SetStance(actor,1,1,true);
  }
  Update(dt){
    const r=this.r,stage=r.flow.stage.id;
    if(this.blastAt!=null){
      const age=r.time-this.blastAt;
      const recoveryAge=OpeningRecoveryTime(age,C.hearing.find(([,value])=>value===1)[0]);
      // The near-miss curve, held up by the director's continuous concussion (「耳鸣还没有完全消失」)
      // through 01–02 and faded after the hand-back.
      const hearing=Math.max(Curve(C.hearing,recoveryAge),r.frontShow?.bunker?.HearingAmount?.()||0);
      if(hearing!==this.hearingAmount)r.audio.SetConcussion?.(hearing,C.hearingLowHz);
      this.hearingAmount=hearing;
      // Heavy breathing after the near miss, and again after the butt strike (「呼吸急促」).
      const strikeAt=r.frontShow?.bunker?.strikeAt,anchor=strikeAt!=null&&strikeAt>this.blastAt?strikeAt:this.blastAt;
      const b=C.breath,breathAge=r.time-anchor,breathRecovery=OpeningRecoveryTime(breathAge,C.hearing.find(([,value])=>value===1)[0]);
      if(anchor!==this.breathAnchor){this.breathAnchor=anchor;this.nextBreathAt=null;}
      if(breathAge>=b.start&&breathRecovery<b.end&&(this.nextBreathAt==null||breathAge>=this.nextBreathAt)){
        this.breathVoice=r.audio.Play("breathHeavy",{volume:b.volume*(1-.45*Smooth((breathRecovery-b.start)/(b.end-b.start))),priority:true});
        this.nextBreathAt=breathAge+b.interval;
      }
    }
    if(OPENING_FAILURE_STAGES.includes(stage)&&!r.Has("gunOccupied")){
      const lost=r.squad.find(a=>!a.alive&&C.requiredSquadCast.includes(a.castId));
      if(lost){r.Record("openingSquadLost",{castId:lost.castId});r.OnPlayerDown();r.MissionFailure?.(lost.castId);return;}
    }
    if(stage==="Trapped")this.UpdateBunker();
    if(stage==="BunkerRescue")this.UpdateRescue();
    // 老周本来在 03 上枪位。可是 04 有自己的起点（选章 / Debug.FirstLevelJump(4)）：
    // 从那儿开局的话 SpawnZhou 一次都没跑过，UpdateZhou 里 this.zhou 是空的，
    // 「老周腿伤恶化退出枪位」永远记不下来，04 也就永远过不去（2026-09-20 实测：
    // 打到只剩 zhouGunWounded 一条，人在枪位上活活打死）。SpawnZhou 自己带幂等闸。
    if(stage==="Support"||stage==="MachineGun")this.SpawnZhou();
    this.FireWindows();
    this.UpdateZhou();
  }
  UpdateZhou(){this.r.frontBattle.UpdateZhou();}
  Dispose(){
    this.eyeClosure=0;this.blackout=0;this.concussion=null;
    this.r.audio.SetConcussion?.(0);
    if(this.breathVoice)this.r.audio.StopVoice?.(this.breathVoice,.15);
  }
  FireWindows(){
    const r=this.r,active=FIRE_WINDOW_STAGES.includes(r.flow.stage.id),captive=r.frontShow?.bunker?.CameraActive===true;
    const candidates=[];
    let visible=0;
    for(const a of r.enemies.values()){
      if(a.lastFire>0&&a.lastFire!==this.fireSeen.get(a.id)){
        this.fireSeen.set(a.id,a.lastFire);
        this.fireEvents.push({at:r.time,id:a.missionId,encounter:a.missionEncounter,player:!!a.target?.isPlayer});
        this.shotCount++;if(a.target?.isPlayer)this.playerShotCount++;
        if(this.fireEvents.length>256)this.fireEvents.shift();
      }
      // Live enemies fight the rescuers while the captive has no control.
      a.missionFireHold=captive;
      a.missionFireSuppressOnly=false;
      a.missionSurfaceRest=false;
      if(captive||!active||!a.alive||a.scriptedNoncombatant)continue;
      a.missionFireHold=true;
      const projected=a.position.clone();projected.y+=1;projected.project(r.player.camera);
      if(Math.abs(projected.x)<=1&&Math.abs(projected.y)<=1&&projected.z>=-1&&projected.z<=1&&
        !r.BlocksSight(r.player.EyePosition,r.Point(a.position,1)))visible++;
      if(Distance(a.position,r.player.position)<90 && !r.BlocksSight(r.Point(a.position,a.stance===2?.35:a.stance===1?.85:1.3),r.player.EyePosition))candidates.push(a);
    }
    const shift=Math.floor(r.time/C.fireSlotSeconds);
    candidates.sort((a,b)=>a.id-b.id);
    if(candidates.length)candidates.push(...candidates.splice(0,shift%candidates.length));
    // Keep the rotating distant fire windows, but give immediate threats first
    // refusal. The authored shooter cap still applies.
    candidates.sort((a,b)=>{
      const da=Distance(a.position,r.player.position),db=Distance(b.position,r.player.position);
      return (da<=CLOSE_RANGE.priorityM?da:Infinity)-(db<=CLOSE_RANGE.priorityM?db:Infinity)||0;
    });
    const chosen=candidates.filter(a=>Distance(a.position,r.player.position)<=CLOSE_RANGE.priorityM).slice(0,C.playerFireLimit);
    const groups=new Set(chosen.map(a=>a.missionFireGroup).filter(Boolean));
    // When both flanking teams can see the player, each gets a firing lane.
    for(const a of candidates){
      if(chosen.length>=C.playerFireLimit)break;
      if(a.missionFireGroup&&!groups.has(a.missionFireGroup)&&!chosen.includes(a)){
        chosen.push(a);groups.add(a.missionFireGroup);
      }
    }
    for(const a of candidates)if(chosen.length<C.playerFireLimit&&!chosen.includes(a))chosen.push(a);
    for(const a of chosen)a.missionFireHold=false;
    // Held shooters may still lay suppressing fire: those shots never resolve a
    // hit and never take a firing token, so the authored aimed-shooter cap and
    // the player TTK budget are unchanged.
    let suppressors=0;
    for(const a of candidates){
      if(suppressors>=C.playerSuppressLimit)break;
      if(chosen.includes(a))continue;
      a.missionFireSuppressOnly=true;suppressors+=1;
    }
    this.playerShooters=chosen.map(a=>a.missionId);
    this.peakPlayerShooters=Math.max(this.peakPlayerShooters,this.playerShooters.length);
    this.visible=visible;this.peakVisible=Math.max(this.peakVisible,visible);
  }
  State(){return {blastAt:this.blastAt??null,bunker:this.bunker?{...this.bunker}:null,
    blackout:this.blackout||0,eyeClosure:this.eyeClosure||0,concussion:this.concussion,hearingAmount:this.hearingAmount||0,
    rescueAt:this.rescueAt??null,rescueDuration:this.rescueDuration??null,rescueSampleTime:this.RescueSampleTime(),
    pack:this.pack,
    captives:this.captives.map(actor=>({id:actor.missionId,alive:actor.alive,x:actor.position.x,z:actor.position.z})),
    playerShooters:this.playerShooters||[],peakPlayerShooters:this.peakPlayerShooters,
    visible:this.visible||0,peakVisible:this.peakVisible,shots:this.shotCount,playerShots:this.playerShotCount,
    recentFire:this.fireEvents.slice(-12),
    zhou:this.zhou?{position:{...this.zhou.position},health:this.zhou.health,lastFire:this.zhou.lastFire}:null,
    wounded:this.wounded?{position:{...this.wounded.actor.position},alive:this.wounded.actor.alive,index:this.wounded.index}:null,
    runner:this.runner?{position:{...this.runner.actor.position},alive:this.runner.actor.alive,index:this.runner.index}:null};}
}
// 叙事必需的班里人在这几步阵亡＝任务失败（普通队员阵亡不判失败）。
const OPENING_FAILURE_STAGES=Object.freeze(["Trapped","BunkerRescue","RearTrench","Support","MachineGun"]);
// 轮转开火窗口只在前沿那一场生效。
const FIRE_WINDOW_STAGES=Object.freeze(["BunkerRescue","RearTrench","Support","MachineGun"]);
