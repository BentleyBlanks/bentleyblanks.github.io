// Finite physical passengers. The train owns translation; AI owns walking after the doors open.
import { MISSION_TRAIN as C } from "./Data_FirstLevelMissionTrain.mjs";
const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
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
    const side = Math.sign(seat.x - C.centerX), seated = Math.abs(seat.x - C.centerX) > 1.2;
    const animation=seated?this.host.PrepareAnimation?.(actor):null;
    const aboard = { ...seat, z: seat.z + this.host.Offset() };
    if(animation){
      const offset=animation.SeatOffset(),yaw=side*Math.PI/2;
      aboard.x+=Math.cos(yaw)*offset.x+Math.sin(yaw)*offset.z;
      aboard.z+=-Math.sin(yaw)*offset.x+Math.cos(yaw)*offset.z;
    }
    this.host.Place(actor, aboard);
    this.host.Hold(actor);
    actor.missionUnloaded = false;
    actor.missionTrainPassenger = true;
    actor.p012OnMovingTrain = true;
    const kinds = ['Talk', 'Rest', 'Gear', 'Eat', 'Lookout'];
    const kind = {yaowa:'ShareFood', liuwencai:'CountAmmo', heyoutian:'Talk', luo:'Lookout'}[actor.castId]
      || kinds[(slot + car.carIndex * 3 + kinds.length) % kinds.length];
    actor.missionTrainLife = { kind, seated, phase: ((slot + 2 + car.carIndex * 13) * .61803398875) % 1,
      weight: 1, brace: 0, yaw: seated ? side * Math.PI / 2 : (slot % 2 ? -.3 : Math.PI - .3),
      animationEnabled:!!animation,seat:{...seat},deckY:actor.position.y,riseSeconds:0 };
    if (!recruit) actor.missionTrainLife.yaw = Math.PI / 2;
    actor.yaw = actor.missionTrainLife.yaw;
    const steps = [ { x: C.centerX, z: seat.z }, ...car.exit ];
    if (!recruit) steps.splice(0, 2); // Luo already stands in the door pocket.
    const muster = recruit ? car.muster[slot] : C.guideMuster;
    steps.push({ x: C.apronLaneX, z: car.z }, { x: C.apronLaneX, z: muster.z }, muster);
    this.entries.push({ actor, animation, carIndex: car.carIndex, slot, recruit, steps, index: 0, exited: false, arrived: false });
  }
  Translate(delta) {
    if (Math.abs(delta) < 1e-9) return;
    for (const e of this.entries) if (!e.exited) {
      const a = e.actor;
      a.position.z += delta;
      a.goal.z += delta;
      a.body?.Teleport(a.position.x, a.position.y, a.position.z);
      a.actor?.root.position.copy(a.position);
    }
  }
  Update(dt, open, shelling = false) {
    this.open = open;
    if(open)this.openSeconds=(this.openSeconds||0)+Math.max(0,dt);
    for (const e of this.entries) {
      const a = e.actor;
      a.p012OnMovingTrain = !open;
      a.missionTrainLife.brace += ((shelling ? 1 : 0) - a.missionTrainLife.brace) * Math.min(1, dt * 3);
      if (!a.alive || e.arrived) continue;
      if (!open) { this.host.Hold(a); continue; }
      // Stand at the same fixed physical anchor, staggered across seats. The
      // existing door queue below still exclusively grants permission to walk.
      if(e.animation){
        e.rise=Math.min(e.animation.duration,Math.max(0,this.openSeconds-Math.max(0,e.slot)*e.animation.config.riseStaggerSeconds));
        a.missionTrainLife.riseSeconds=e.rise;
        const pose=e.animation.State(e.rise);
        a.missionTrainLife.weight=pose.weight;
        a.missionTrainLife.gestureWeight=pose.gestureWeight;
      }
      const p = a.position;
      if (!e.exited) {
        const previous = this.entries.findLast(other => other.carIndex === e.carIndex && other.slot < e.slot && other.actor.alive);
        if (previous && !previous.exited && previous.actor.position.x < C.doorClearX) {
          this.host.Hold(a); continue;
        }
      }
      // Finish the visible stand-up before the same physical body starts walking.
      if(!e.animation){
        e.rise = Math.min(C.life.standSeconds, (e.rise || 0) + dt);
        const rise = e.rise / C.life.standSeconds;
        a.missionTrainLife.weight = 1 - rise * rise * (3 - 2 * rise);
      }
      if (e.rise < (e.animation?.duration??C.life.standSeconds)) { this.host.Hold(a); continue; }
      while (e.index < e.steps.length && Distance(p, e.steps[e.index]) < C.routeArrivalRadiusM) e.index++;
      // Crossing the stair foot is a real body event, independent of the player's stage.
      if (!e.exited && p.x > C.stairFootX) { e.exited = true; a.missionUnloaded = true; this.host.Exited(a); }
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
        life: { ...e.actor.missionTrainLife }, alive: e.actor.alive, exited: e.exited, arrived: e.arrived, index: e.index, target: e.steps[e.index],
        position: { x: e.actor.position.x, y: e.actor.position.y, z: e.actor.position.z } })) };
  }
}
