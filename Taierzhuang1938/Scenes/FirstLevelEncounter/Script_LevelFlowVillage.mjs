import { FLOW_VILLAGE_STEALTH as PLAN } from "./Data_LevelFlow.mjs";
import { Clamp, Distance, Lerp, SampleBeatRoute, SampleRoute } from "./Script_LevelFlowGeometry.mjs";

function Actor(id, name, kind, p, pose, extra = {}) {
  return { id, name, kind, p, pose, side: "civilian", ...extra };
}

export function VillageStealthAt(time, timeline) {
  const Beat = id => timeline.find(beat => beat.id === id);
  const pull = Beat(PLAN.pullBeat);
  const age = time - pull.start;
  const active = time >= Beat(PLAN.fromBeat).start && time < Beat(PLAN.attackBeat).start;
  const pulling = active && age >= 0 && age < PLAN.pullSeconds - 1e-7;
  const pullProgress=Clamp((age-PLAN.pullLeadSeconds)/(PLAN.pullSeconds-PLAN.pullLeadSeconds),0,1);
  return {
    active, pulling, locked: pulling, allowAim: !pulling,
    pullProgress,
    objective: active ? PLAN.objective : null,
    checkpoint: time < Beat(PLAN.checkpointBeat).start ? Beat(PLAN.fromBeat).start : Beat(PLAN.checkpointBeat).start,
    failure: PLAN.failure,
    eyeHeight: pulling ? Lerp(1.6, 0.95, pullProgress) : 0.95,
    handVisible: pulling,
    patrolCleared: age >= PLAN.patrolClearSeconds,
  };
}

// The playable director supplies actual sight confirmation and weapon events.
// A brief glimpse clears when the player gets behind cover again.
export class VillageStealthRules {
  constructor(timeline) {
    this.timeline = timeline;
    this.Reset();
  }
  Reset() {
    this.exposure = 0;
    this.alarmAge = 0;
    this.reason = null;
  }
  Step({ time, dt, fired = false, grenade = false, detected = false }) {
    const state = VillageStealthAt(time, this.timeline);
    if (!state.active && !this.reason) {
      this.Reset();
      return { ...state, suspicion: 0, alarm: false, failed: false };
    }
    this.exposure = state.active && detected ? this.exposure + Math.max(0, dt) : 0;
    if (state.active && !this.reason && (fired || grenade || this.exposure >= PLAN.exposureGraceSeconds)) {
      this.reason = fired ? "shot" : grenade ? "grenade" : "spotted";
    }
    if (this.reason) this.alarmAge += Math.max(0, dt);
    return { ...state, suspicion: Clamp(this.exposure / PLAN.exposureGraceSeconds, 0, 1),
      alarm: !!this.reason, failed: !!this.reason && this.alarmAge >= PLAN.alarmSeconds,
      reason: this.reason };
  }
}

export function StageVillageActors(actors, time, timeline, crossings) {
  const Beat = id => timeline.find(beat => beat.id === id);
  const start = Beat("08a").start;
  const release = Beat("10a").start;
  if (time < start || time >= Beat("10j").end) return;
  const settled = Beat("08c").start;
  const tieStart = Beat("08b").start + 4;
  const tied = time >= tieStart + 5 && time < release + 5;
  const cart = actors.find(actor => actor.id === "cart");
  const donkey = actors.find(actor => actor.id === "donkey");
  const geng = actors.find(actor => actor.id === "geng");
  const atMouth = time >= Beat("08a").end && time < release;
  if (atMouth) {
    const parking = Clamp((time-Beat("08b").start)/4,0,1);
    cart.heading = Lerp(cart.heading,Math.PI/2,parking);
    donkey.p = [cart.p[0]+Math.sin(cart.heading)*2.3,cart.p[1]-Math.cos(cart.heading)*2.3];
    donkey.heading = cart.heading;
    donkey.pose = "stand";
    donkey.status = tied ? "已拴好，等开路信号" : "老耿正在安顿";
    cart.status = tied ? "车轮垫好，原地隐蔽" : "靠沟内藏车";
    const returnToWounded = Clamp((time-tieStart-5)/4,0,1);
    geng.p = time < tieStart ? geng.p.map((value,axis)=>Lerp(value,[107.3,379.6][axis],parking))
      : [Lerp(107.3,103.2,returnToWounded),Lerp(379.6,379.3,returnToWounded)];
    geng.pose = time < tieStart ? "walk" : time < tieStart+5 ? "carry" : returnToWounded<1 ? "walk" : "kneel";
    geng.status = time < tieStart ? "牵驴靠沟沿" : time < tieStart + 5 ? "拴绳、垫车轮" : "守着车与伤员，等信号";
  }
  if (time >= release && time < release + 5) {
    const approach = Clamp((time-release)/2,0,1);
    geng.p = [Lerp(103.2,107.3,approach),Lerp(379.3,379.6,approach)];
    geng.pose = approach<1 ? "walk" : "carry";
    geng.status = "解绳、移开垫轮木，招呼抬架";
  }
  if (time >= release+5 && time < release+9) {
    const rejoin = (time-release-5)/4;
    geng.p = geng.p.map((value,axis)=>Lerp([107.3,379.6][axis],value,rejoin));
    geng.pose = "walk";
  }
  if (tied) donkey.tetherTo = [...PLAN.tether];
  const shelters = PLAN.shelters.flat();
  for (const [index, x] of shelters.entries()) {
    const id = `stretcher${index}`;
    let stretcher = actors.find(actor => actor.id === id);
    const arrivalRoute = [[100,365 - index * 1.4],[100,380],[x,380]];
    const departure = Math.max(release + 5 + index * 0.6, crossings[index] - 102);
    const route = [[x,380],[100,380],[100,383],[100,461],[104,465],[109,469],[109,472],
      [109,493],[109,495],[113.25,495],[113.25,505],[117,527],[117,552]];
    const Length = points => points.slice(1).reduce((sum,p,i)=>sum+Distance(points[i],p),0);
    const length = Length(route), beforeCrossing = Length(route.slice(0,7));
    const Sample = (stamp,offset=0) => {
      if (stamp < settled) {
        const arrival = Clamp((stamp-start-index*0.3)/(settled-start-index*0.3),0,1);
        return SampleRoute(arrivalRoute,arrival+offset/Length(arrivalRoute));
      }
      if (stamp < departure) return [x+offset,380];
      const distance = stamp < crossings[index] ? beforeCrossing*Clamp((stamp-departure)/(crossings[index]-departure),0,1)
        : beforeCrossing+(stamp-crossings[index])*1.5;
      return SampleRoute(route,(distance+offset)/length);
    };
    const p = Sample(time);
    if (!stretcher) { stretcher = Actor(id, `担架 ${index + 1}`, "quilt", p, "wounded"); actors.push(stretcher); }
    stretcher.p = p;
    const ahead = Sample(time,0.2), behind = Sample(time,-0.2);
    stretcher.heading = Math.atan2(ahead[0]-behind[0],-(ahead[1]-behind[1]));
    stretcher.status = time < settled ? "沿路沟转入隐蔽点" : time < departure ? "靠南沿隐蔽，等开路信号" : "抬架起行，接南巷通道";
    const waiting = time >= settled && time < departure;
    for (const end of [-1,1]) actors.push(Actor(`stretcherCarrier${index}_${end < 0 ? 0 : 1}`, "抬担架的老乡", "person",
      Sample(time,end*1.4),
      waiting ? "kneel" : "carry", { groupId: "VillageEvacuation", status: waiting ? "守在伤员旁" : "抬架" }));
  }
  StageVillageCompanions(actors,time,timeline);
}

export function StageVillageCompanions(actors,time,timeline) {
  const stealth = VillageStealthAt(time, timeline);
  const beat = timeline.find(entry => time < entry.end) || timeline.at(-1);
  if (stealth.active) {
    const player = actors.find(actor => actor.id === "player");
    Object.assign(player, { eyeHeight: stealth.eyeHeight, controlLocked: stealth.pulling,
      status: stealth.pulling ? "文财拉低身体" : "保持隐蔽，禁止开火" });
    const liu = actors.find(actor => actor.id === "liu");
    const nier = actors.find(actor => actor.id === "nier");
    if (beat.id === "09a" || beat.id === "09b") {
      const progress = Clamp((time - beat.start) / beat.duration, 0, 1);
      const lagScale=beat.id==="09b"?Clamp((1-progress)*2,0,1):1;
      // Follow the same bends, not a constant world offset through the walls.
      liu.p = SampleBeatRoute(beat, Clamp(progress + (beat.id==="09a"?1.3:-1.3*lagScale) / beat.duration, 0, 1));
      nier.p = SampleBeatRoute(beat, Clamp(progress - 2.6*lagScale / beat.duration, 0, 1));
      liu.pose = nier.pose = "kneel";
      if (beat.id==="09a" && progress>=0.9) {
        const approach=Clamp((progress-0.9)/0.1,0,1);
        const liuStart=SampleBeatRoute(beat,0.9+1.3/beat.duration);
        const nierStart=SampleBeatRoute(beat,0.9-2.6/beat.duration);
        liu.p=SampleRoute([liuStart,[80,424.8],[80,426],PLAN.liuCover],approach);
        nier.p=SampleRoute([nierStart,[76.7,423.8],[76.7,424.8],[79.8,424.8],PLAN.nierCover],approach);
        if(progress>=0.97) {
          player.eyeHeight=Lerp(0.95,1.6,(progress-0.97)/0.03);
          player.pose="stand";
        }
      }
      if (beat.id===PLAN.pullBeat && time>=beat.start+PLAN.patrolClearSeconds) {
        const departure=Clamp((time-beat.start-PLAN.patrolClearSeconds)/3,0,1);
        liu.p=SampleRoute([PLAN.liuCover,PLAN.playerCover,[PLAN.playerCover[0],liu.p[1]],liu.p],departure);
        nier.p=SampleRoute([PLAN.nierCover,PLAN.playerCover,[PLAN.playerCover[0],nier.p[1]],nier.p],departure);
      }
    }
    if (beat.id === PLAN.pullBeat && time < beat.start + PLAN.patrolClearSeconds) {
      liu.p = [...PLAN.liuCover];
      liu.pose = stealth.pulling ? "carry" : "kneel";
      liu.status = stealth.pulling ? "伸手拉顺子蹲下" : "盯住殿门，等搜巷兵走远";
      nier.p = [...PLAN.nierCover];
      nier.pose = "kneel";
      nier.status = "看文财手势，缩在墙后";
      player.lookAt = [...PLAN.lookAt];
      const facing=stealth.pulling?player.p:PLAN.lookAt;
      liu.heading=Math.atan2(facing[0]-liu.p[0],-(facing[1]-liu.p[1]));
    }
  }
}
