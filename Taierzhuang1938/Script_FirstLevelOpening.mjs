import { OPENING as C } from "./Data_FirstLevelOpening.mjs";
import { MISSION_TUNING as R, OPENING_PERCEPTION as P } from "./Data_Tuning_FirstLevel.mjs";
import { MISSION_ANCHORS as A, MISSION_PLACEMENT as Place } from "./Data_FirstLevelMissionLayout.mjs";
import { CLOSE_RANGE } from "./Data_Tuning_AiShooting.mjs";
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
  /** 被木架压住的位置（两根压梁之间），与被拖出来之后站定的位置。 */
  get TrappedPoint(){return {x:Place.bunker.player.x,z:Place.bunker.player.z};}
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
    r.Say("BunkerBanter");
  }
  /**
   * 门外那两名失去抵抗能力的川军（无武器、不还手）与落在几米外的两支步枪。
   * 摆位与整拍行刑归 Front 玩法包的 `Script_FirstLevelBunker`，这里只转发。
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
    const age=r.time-bunker.started;
    if(bunker.blastAt==null&&age>=R.bunkerBanterFallbackS)this.BunkerBlast();
    if(bunker.blastAt==null)return;
    r.frontShow?.bunker.UpdateBunker(bunker);
  }

  // --- 02 获救 --------------------------------------------------------------
  RescueElapsed(){return this.rescueAt==null?0:this.r.time-this.rescueAt;}
  RescueSampleTime(){return this.RescueElapsed();}
  RescueLift(){
    return this.rescueAt==null?0:Smooth((this.RescueSampleTime()-C.rescuePullSeconds)/(C.rescueStandSeconds-C.rescuePullSeconds));
  }
  UpdateRescue(){
    const r=this.r;
    if(r.Has("luoRescueComplete")||this.rescueAt!=null)return;
    const luo=r.companion.Handle("luo");
    if(!luo?.alive)return;
    const reach=this.TrappedPoint;
    // 走到空间包给的掀架位（luoLift）—— 从后壁破口挤进来那一步靠它，不再随手估一个点。
    if(Distance(luo.position,reach)>C.rescueReachM){r.MoveActor(luo,Place.bunker.luoLift,R.walkSpeedMps);return;}
    // 掀木架的同时幺娃要在另一头拉背包（Notion 02）。两个人都到位（或等满兜底）才起接管。
    this.rescueGatherAt??=r.time;
    if(r.frontShow&&!r.frontShow.bunker.RescueGatherReady(this.rescueGatherAt))return;
    this.rescueAt=r.time;
    this.rescueDuration=R.bunkerRescueSeconds;
    r.BeginControl("rescue",this.rescueDuration);
    r.Say("RescueLift");
    r.Record("playerDraggedFromWreck",{from:{...r.player.position},to:this.RescueEnd});
  }
  /** 受困与被拖出来那两段的身体位置（BeforePlayer 每帧调）。 */
  PlacePlayer(){
    const r=this.r;
    if(r.Has("luoRescueComplete"))return;
    const from=this.TrappedPoint,to=this.RescueEnd,t=this.RescueLift();
    const x=from.x+(to.x-from.x)*t,z=from.z+(to.z-from.z)*t;
    const y=r.battlefield.GroundHeight(x,z);
    r.player.position.set(x,y,z);r.player.body?.Teleport(x,y,z);r.player.velocity.set(0,0,0);
  }
  /** 感知（眼皮 + 恍惚 + 耳鸣）。整关只有这一处重击，曲线与旧开场逐字相同。 */
  ApplyCamera(){
    const r=this.r;
    this.eyeClosure=0;this.concussion=null;this.blackout=0;
    if(this.blastAt==null)return;
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
      // 何有田从后侧交通壕开火逼日兵转身。
      if(r.controls?.kind==="trapped"){const kind=r.controls.kind;r.controls=null;r.Control?.(false,kind);}
      r.Say("RescueCall");
    }
    if(stage==="Support"){
      r.rifleStartShots=r.Inventory().shots;
      this.SpawnZhou();
    }
  }
  SpawnZhou(){
    const r=this.r;
    if(this.zhou)return;
    this.zhou=r.ai.Spawn("nra",C.zhouGunSeat.x,C.zhouGunSeat.z,{weapon:"Zb26",squadId:"MissionZhouGun"});
    if(!this.zhou)return; // A temporarily unavailable physical spawn retries next frame.
    this.zhou.missionId=r.column.zhou.id;this.zhou.castId="zhou";
    this.zhou.scriptEssential=true;
    r.PlaceActor(this.zhou,C.zhouGunSeat);
    r.Defend(this.zhou,C.zhouGunSeat,0,R.companionCoverSlackM);r.ai.SetStance(this.zhou,1,.5,true);
    r.emplacement.NpcOccupy(r.gunId,this.zhou);
  }
  SpawnMessenger(id,route,weapon){
    const r=this.r,actor=r.ai.Spawn("nra",route[0].x,route[0].z,{weapon,scriptedNoncombatant:true,squadId:id});
    if(!actor)return null;
    actor.missionId=id;actor.scriptEssential=true;
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
      const hearing=Curve(C.hearing,recoveryAge);
      if(hearing!==this.hearingAmount)r.audio.SetConcussion?.(hearing,C.hearingLowHz);
      this.hearingAmount=hearing;
      const b=C.breath;
      if(age>=b.start&&recoveryAge<b.end&&(this.nextBreathAt==null||age>=this.nextBreathAt)){
        this.breathVoice=r.audio.Play("breathHeavy",{volume:b.volume*(1-.45*Smooth((recoveryAge-b.start)/(b.end-b.start))),priority:true});
        this.nextBreathAt=age+b.interval;
      }
    }
    if(OPENING_FAILURE_STAGES.includes(stage)&&!r.Has("gunOccupied")){
      const lost=r.squad.find(a=>!a.alive&&C.requiredSquadCast.includes(a.castId));
      if(lost){r.Record("openingSquadLost",{castId:lost.castId});r.OnPlayerDown();r.MissionFailure?.(lost.castId);return;}
    }
    if(stage==="Trapped")this.UpdateBunker();
    if(stage==="BunkerRescue")this.UpdateRescue();
    if(stage==="Support")this.SpawnZhou();
    this.FireWindows();
    this.UpdateZhou();
  }
  UpdateZhou(){
    const r=this.r,a=this.zhou;
    if(!a||r.Has("zhouGunWounded"))return;
    if(!a.alive){
      r.Record("zhouGunKilled",{actorId:a.id});r.OnPlayerDown();r.MissionFailure?.("zhou");return;
    }
    if(a.lastFire>0)r.Record("zhouCoverFired");
    // The gunner owns a separate opening script, outside UpdateSquad. Give
    // him the same real cover/escape response while the gun is still his;
    // actual injury continues into the existing wounded handover below.
    if(a.health>=C.zhouWoundThreshold){
      const shelter=r.RespondToGrenade(a)||r.RespondToContact(a);
      if(!shelter)r.Defend(a,C.zhouGunSeat,0,R.companionCoverSlackM);
    }
    if(a.health>=C.zhouWoundThreshold&&(!r.Has("frontRifleDefense")||!r.Has("rifleWithdrawalResolved")))return;
    if(a.health>=C.zhouWoundThreshold&&(!this.zhouShellSent||r.time-this.zhouShellAt>=C.zhouShell.retryAfterS)){
      const correcting=!!this.zhouShellSent;
      this.zhouShellSent=true;this.zhouShellAt=r.time;
      const spec=C.zhouShell,target=r.Point({x:a.position.x+spec.offsetX,z:a.position.z},.65);
      // A real dodge or parapet can defeat the first round. Re-range from a
      // steeper trajectory; only observed injury releases the handover gate.
      const from=correcting?{x:target.x+spec.retryFromOffset.x,z:target.z+spec.retryFromOffset.z}:spec.from;
      r.combat.FireShell(r.Point(from,spec.height),target,{...spec,kind:"Shell75",
        OnImpact:()=>r.Record("zhouGunBlast",{x:target.x,z:target.z})});
    }
    if(a.health>=C.zhouWoundThreshold)return;
    r.emplacement.NpcVacate(r.gunId,"wounded");
    a.scriptedNoncombatant=true;r.ai.SetStance(a,1,.3,true);
    if(Distance(a.position,C.zhouRest)>C.zhouExitRadiusM){r.MoveActor(a,C.zhouRest,R.walkSpeedMps);return;}
    // The same narrative casualty continues on the existing litter. Switch
    // representation only at his observed position after the real hit and move.
    Object.assign(r.column.zhou,{x:a.position.x,z:a.position.z,health:Math.max(0,a.health),visible:true,state:"waiting",yaw:a.yaw});
    r.Record("zhouGunWounded",{actorId:a.id,health:a.health,alive:a.alive,fired:a.lastFire>0});
    r.ai.Remove(a);
  }
  Dispose(){
    this.eyeClosure=0;this.blackout=0;this.concussion=null;
    this.r.audio.SetConcussion?.(0);
    if(this.breathVoice)this.r.audio.StopVoice?.(this.breathVoice,.15);
  }
  FireWindows(){
    const r=this.r,active=FIRE_WINDOW_STAGES.includes(r.flow.stage.id);
    const candidates=[];
    let visible=0;
    for(const a of r.enemies.values()){
      if(a.lastFire>0&&a.lastFire!==this.fireSeen.get(a.id)){
        this.fireSeen.set(a.id,a.lastFire);
        this.fireEvents.push({at:r.time,id:a.missionId,encounter:a.missionEncounter,player:!!a.target?.isPlayer});
        this.shotCount++;if(a.target?.isPlayer)this.playerShotCount++;
        if(this.fireEvents.length>256)this.fireEvents.shift();
      }
      a.missionFireHold=false;
      a.missionSurfaceRest=false;
      if(!active||!a.alive||a.scriptedNoncombatant)continue;
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
