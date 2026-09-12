// Finite physical passengers. The train owns translation; AI owns walking after the doors open.
import { MISSION_TRAIN as C } from "./Data_FirstLevelMissionTrain.mjs";
const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const Clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
const Smooth = v => { v=Clamp(v,0,1);return v*v*(3-2*v); };
export class FirstLevelMissionTrain {
  constructor(host) { this.host = host; this.entries = []; this.open = false; }
  Initialize() {
    if (this.entries.length) return;
    const originals = this.host.Originals();
    for (const car of C.cars) {
      if (car.carIndex === C.mainCar) this.Add(this.host.Guide(), C.guide, car, -1, false);
      for (const [slot, seat] of car.seats.entries()) {
        const original = car.carIndex === C.mainCar && slot < originals.length;
        const actor = original ? originals[slot] : this.host.Spawn(car, slot);
        if (!actor) throw new Error('Missing mission train passenger ' + car.carIndex + ':' + slot);
        this.Add(actor, seat, car, slot, true);
      }
    }
  }
  Add(actor, seat, car, slot, recruit) {
    if (!actor) throw new Error('Missing mission train guide');
    const side = Math.sign(seat.x - C.centerX), wall = Math.abs(seat.x - C.centerX) > 1.2;
    const animation=this.host.PrepareAnimation?.(actor);
    const aboard = { ...seat, z: seat.z + this.host.Offset() };
    this.host.Place(actor, aboard);
    this.host.Hold(actor);
    actor.missionUnloaded = false;
    actor.missionTrainPassenger = true;
    actor.p012OnMovingTrain = true;
    const kinds = ['Rest', 'Rest', 'Gear', 'Rest', 'Lookout', 'Eat', 'Rest', 'Talk'];
    const kind = {yaowa:'ShareFood', liuwencai:'CountAmmo', heyoutian:'Talk', luo:'Lookout'}[actor.castId]
      || kinds[(slot + car.carIndex * 3 + kinds.length) % kinds.length];
    const posture=wall && slot%3===0 ? 'crouch' : 'stand';
    actor.missionTrainLife = { kind, seated:false,wall,posture,basePosture:posture,
      phase: ((slot + 2 + car.carIndex * 13) * .61803398875) % 1,
      weight: 1, gestureWeight:1,brace: 0, yaw: wall ? side * Math.PI / 2 : Math.PI,
      action:posture==='crouch'?'WallCrouchIdle':'WallStandIdle',actionSeconds:0,clock:0,
      animationEnabled:!!animation,animationPending:!animation,seat:{...seat},deckY:actor.position.y,riseSeconds:0 };
    if (!recruit) actor.missionTrainLife.yaw = Math.PI / 2;
    actor.yaw = actor.missionTrainLife.yaw;
    const steps = [ { x: C.centerX, z: seat.z }, ...car.exit ];
    if (!recruit) steps.splice(0, 2); // Luo already stands in the door pocket.
    const muster = recruit ? car.muster[slot] : C.guideMuster;
    steps.push({ x: C.apronLaneX, z: car.z }, { x: C.apronLaneX, z: muster.z }, muster);
    this.entries.push({ actor, animation, carIndex: car.carIndex, slot, recruit, steps, index: 0, exited: false, arrived: false });
  }
  // Cue source time owns speech performance. Repeated calls seek the same authored clip;
  // absence of another cue returns the actor to its own, independently phased idle.
  SetDialogueAction(who,clipId,seconds=0,{duration=null,loop=false}={}) {
    const entry=this.entries.find(e=>e.actor.castId===who);
    if(!entry)return false;
    const life=entry.actor.missionTrainLife;
    if(!clipId){life.dialogueAction=null;return true;}
    life.dialogueAction={clipId,seconds:Math.max(0,seconds),duration:duration??entry.animation?.ClipDuration(clipId)??0,loop};
    return true;
  }
  UpdateLife(entry,dt,shelling,canExit) {
    const a=entry.actor,life=a.missionTrainLife;
    if(!life)return;
    if(!entry.animation)entry.animation=this.host.PrepareAnimation?.(a);
    life.animationEnabled=!!entry.animation;life.animationPending=!entry.animation;
    life.clock+=Math.max(0,dt);
    if(life.dialogueAction){
      life.dialogueAction.seconds+=Math.max(0,dt);
      if(life.dialogueAction.duration>0&&life.dialogueAction.seconds>=life.dialogueAction.duration)life.dialogueAction=null;
    }
    if(a.missionTrainImpact||canExit)return;
    const reacts=shelling&&this.barrageSeconds>=C.life.braceDelayS+life.phase*C.life.braceSpreadS;
    if(reacts&&life.duckStartedAt==null)life.duckStartedAt=life.clock;
    life.brace+=((reacts?1:0)-life.brace)*Math.min(1,dt*C.life.braceRate);
    life.posture=reacts?'crouch':life.basePosture;
    const duckSeconds=entry.animation?.ClipDuration('AlarmDropCrouch')||C.life.duckSeconds;
    const duckTime=life.clock-(life.duckStartedAt??life.clock);
    if(reacts&&life.basePosture==='stand'&&duckTime<duckSeconds){
      life.action='AlarmDropCrouch';life.actionSeconds=duckTime;life.actionLoop=false;
    }else{
      life.action=life.posture==='crouch'?'WallCrouchIdle':'WallStandIdle';
      life.actionSeconds=life.clock+life.phase*C.life.gesturePeriodS;life.actionLoop=true;
    }
    life.gestureWeight=1-life.brace;
    this.host.Stance?.(a,life.posture==='crouch'?1:0);
  }
  Translate(delta) {
    if (Math.abs(delta) < 1e-9) return;
    for (const e of this.entries) if (!e.exited || e.actor.missionTrainImpact && !this.open) {
      const a = e.actor;
      a.position.z += delta;
      a.goal.z += delta;
      a.body?.Teleport(a.position.x, a.position.y, a.position.z);
      a.actor?.root.position.copy(a.position);
    }
  }
  Update(dt, open, shelling = false, lifeSeconds = null, closeImpact = shelling) {
    this.open = open;
    this.lifeSeconds=lifeSeconds??((this.lifeSeconds||0)+Math.max(0,dt));
    if(shelling)this.barrageSeconds=(this.barrageSeconds||0)+Math.max(0,dt);
    if(closeImpact)this.impactSeconds=(this.impactSeconds||0)+Math.max(0,dt);
    if(open)this.openSeconds=(this.openSeconds||0)+Math.max(0,dt);
    for (const e of this.entries) {
      const a = e.actor;
      if(a.missionRescueTarget)continue;
      const canExit=open||(a.missionTrainImpact&&e.exited&&this.host.Stopped?.()&&a.castId!=="luo");
      this.UpdateLife(e,dt,shelling,canExit);
      if(a.missionTrainImpact&&!canExit){this.host.Hold(a);continue;}
      if(a.missionTrainImpact&&e.exited&&!a.missionUnloaded){a.missionUnloaded=true;this.host.Exited(a);}
      a.p012OnMovingTrain = !canExit;
      if (!a.alive || e.arrived) continue;
      if (!canExit) {
        a.missionTrainWalkSpeed=0;
        const activity=!shelling&&C.activities[a.castId]?.findLast(step=>step.at<=this.lifeSeconds);
        if(activity){
          const target={x:activity.x,z:activity.z+this.host.Offset()},distance=Distance(a.position,target);
          const clear=this.entries.every(other=>other===e||!other.actor.alive||Distance(other.actor.position,target)>C.bodySpacingM);
          if(distance>C.arrivalRadiusM&&clear){
            a.missionTrainWalkSpeed=Math.min(activity.speed,distance/Math.max(.001,dt));
            a.missionTrainLife.weight=0;
            this.host.Move(a,target,a.missionTrainWalkSpeed);
          }else{
            a.missionTrainLife.weight=1;
            a.missionTrainLife.wall=!!activity.wall;
            this.host.Hold(a);
            const face=activity.face;
            if(face){a.missionTrainLife.yaw=Math.atan2(a.position.x-face.x,a.position.z-face.z-this.host.Offset());a.yaw=a.missionTrainLife.yaw;}
          }
        }else {a.missionTrainLife.weight=1;this.host.Hold(a);}
        continue;
      }
      a.missionTrainWalkSpeed=0;
      // Reverse the authored crouch at the same physical anchor. A finished rider
      // keeps the authored standing idle while the physical door queue is occupied.
      const life=a.missionTrainLife;
      e.rise=a.missionTrainImpact?C.life.standSeconds:Math.min(C.life.standSeconds,Math.max(0,(this.openSeconds||0)-Math.max(0,e.slot)*C.life.riseStaggerSeconds));
      life.riseSeconds=e.rise;life.dialogueAction=null;
      const rise=Clamp(e.rise/C.life.standSeconds,0,1);
      const crouched=life.posture==='crouch'&&!a.missionTrainImpact;
      life.action=crouched&&rise<1?'AlarmDropCrouch':'WallStandIdle';
      life.actionSeconds=crouched&&rise<1?(e.animation?.ClipDuration('AlarmDropCrouch')||C.life.duckSeconds)*(1-rise):life.clock+life.phase*C.life.gesturePeriodS;
      life.actionLoop=!(crouched&&rise<1);
      life.brace=0;life.gestureWeight=0;
      const p = a.position;
      if (!e.exited) {
        const previous = this.entries.findLast(other => other.carIndex === e.carIndex && other.slot < e.slot && other.actor.alive);
        if (previous && !previous.exited && previous.actor.position.x < C.doorClearX) {
          this.host.Hold(a); continue;
        }
      }
      if (e.rise < C.life.standSeconds) { this.host.Hold(a); continue; }
      e.releaseSeconds=a.missionTrainImpact?C.life.releaseSeconds:(e.releaseSeconds||0)+Math.max(0,dt);
      life.weight=1-Smooth(e.releaseSeconds/C.life.releaseSeconds);
      if(life.weight>0){this.host.Hold(a);continue;}
      life.posture='stand';
      while (e.index < e.steps.length && Distance(p, e.steps[e.index]) < C.routeArrivalRadiusM) e.index++;
      // Crossing the stair foot is a real body event, independent of the player's stage.
      if (!e.exited && p.x > C.stairFootX) { e.exited = true; a.missionUnloaded = true; this.host.Exited(a); }
      if(e.exited&&a.castId){e.arrived=true;a.missionTrainReady=true;continue;}
      if (e.index === e.steps.length) {
        e.arrived = true; a.missionTrainReady = true; this.host.Hold(a); continue;
      }
      const goal = e.steps[e.index], d = Distance(p, goal), ux = (goal.x-p.x)/d, uz = (goal.z-p.z)/d;
      let travel = Math.min(d, C.speedMps * dt);
      const obstacles = [...this.entries.filter(o => o !== e && o.actor.alive).map(o => o.actor.position), this.host.Player()];
      for (const body of obstacles) {
        const dx = body.x-p.x, dz = body.z-p.z, along = dx*ux+dz*uz, across = dx*uz-dz*ux;
        if (along > 0 && Math.abs(across) < C.bodySpacingM)
          travel = Math.min(travel, Math.max(0, along-Math.sqrt(C.bodySpacingM**2-across**2)-0.01));
      }
      this.host.Move(a, goal, dt > 0 ? travel/dt : 0);
    }
  }
  State() {
    return { total: C.total, open: this.open,
      counts: C.cars.map(car => this.entries.filter(e => e.recruit && e.carIndex === car.carIndex).length),
      exited: this.entries.filter(e => e.recruit && e.exited).length,
      entries: this.entries.map(e => ({ id: e.actor.id, carIndex: e.carIndex, slot: e.slot, recruit: e.recruit,
        life: { ...e.actor.missionTrainLife }, alive: e.actor.alive, health:e.actor.health, essential:!!e.actor.scriptEssential, exited: e.exited, arrived: e.arrived, index: e.index, target: e.steps[e.index],
        position: { x: e.actor.position.x, y: e.actor.position.y, z: e.actor.position.z } })) };
  }
}
