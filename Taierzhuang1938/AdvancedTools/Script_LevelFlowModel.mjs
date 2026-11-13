import { FLOW_BEATS, FLOW_STAGES, FLOW_WAVES, FLOW_GROUND, FLOW_TANK_TRACKS, FLOW_OPENING, FLOW_OPENING_RETREAT, FLOW_OPENING_RESCUE, FLOW_CAMP_DEFENSE, FLOW_CAMP_LOADING, FLOW_DRAG_REARGUARD, FLOW_YAOWA_RETURN } from "./Data_LevelFlow.mjs";

import { Clamp, Lerp, Distance, SampleRoute, SampleBeatRoute } from "./Script_LevelFlowGeometry.mjs";
import { CreateEncounterDocument, CompileEncounters, SampleEncounters } from "./Script_LevelFlowEncounter.mjs";
import { L0610_LANE, L0610_SOUTH_LANE } from "../Data_EditorBlockoutFirstLevel0610Space.mjs";
export { Clamp, Lerp, Distance, SampleRoute } from "./Script_LevelFlowGeometry.mjs";

let elapsed = 0;
export const FLOW_TIMELINE = FLOW_BEATS.map((beat) => {
  const entry = { ...beat, start: elapsed, end: elapsed + beat.duration };
  elapsed = entry.end;
  return entry;
});
export const FLOW_DURATION = elapsed;
export const BeatById = (id) => FLOW_TIMELINE.find((beat) => beat.id === id);
export const STAGE_TIMELINE = FLOW_STAGES.map((stage) => {
  const beats = FLOW_TIMELINE.filter((beat) => beat.stage === stage.id);
  return { ...stage, start: beats[0].start, end: beats.at(-1).end, beats };
});

function Track(points, time) {
  if (time <= points[0][0]) return points[0].slice(1);
  for (let index = 1; index < points.length; index++) {
    if (time > points[index][0]) continue;
    const a = points[index - 1], b = points[index];
    const progress = Clamp((time - a[0]) / Math.max(0.001, b[0] - a[0]), 0, 1);
    return [Lerp(a[1], b[1], progress), Lerp(a[2], b[2], progress)];
  }
  return points.at(-1).slice(1);
}

// Each authored path is expanded to absolute keys once. Seeking never replays
// spawn events or mutates state, so backward seeks produce the same frame.
function Keys(entries) {
  return entries.map(([id, fraction, x, z]) => [BeatById(id).start + BeatById(id).duration * fraction, x, z]);
}

const winterKeys = Keys([
  ["01a",0,67.8,64], ["01e",1,62,64], ["02a",1,61.8,64], ["02i",1,62.2,64.6],
  ["03a",1,47.2,65.6], ["03b",1,47.2,65.6], ["03c",1,31.2,66.8],
  ["03e",1,31.2,66.8], ["03f",1,24.7,67.2], ["03g",1,24.7,67.2],
  ["03h",0.1,26,75], ["03h",0.22,30,84], ["03h",0.32,30,84], ["03h",0.5,32.5,99], ["03h",0.6,32.5,99],
  ["03h",0.68,35,114], ["03h",0.86,35,129], ["03h",1,35,140],
  ["04a",1,48,150], ["04b",1,48,150], ["04c",1,48,150],
  ["04d",1,60,157], ["05a",0.2,72,158.6], ["05a",0.45,83,163],
  ["05a",0.7,83,178], ["05a",1,80,201], ["05b",1,84.5,216], ["05c",1,86.5,227],
  ["06a",1,87,239], ["06b",0.25,87,239], ["06b",1,93.2,243], ["06c",1,93.2,243],
  ["06d",0.25,92,247], ["06d",0.5,87,261], ["06d",0.75,93,277], ["06d",1,97,292],
  ["06h",1,97,292], ["06i",0.6,97.5,300], ["06i",1,96,314],
  ["07a",1,95,328], ["07b",1,97,338], ["07c",1,100,352],
  ["08a",1,115,380], ["09j",1,115,380],
  ["10a",1,109,380], ["10b",1,100,430], ["10c",1,100,462],
  ["10d",0.25,111,465], ["10d",0.6,109,493], ["10d",1,113.25,505],
  ["10e",1,117,527], ["10f",1,117,545], ["10j",1,117,552],
]);
const cartRoute=[[55,155],...L0610_LANE.line.map(point=>[point.x,point.z]),[104.6,379.3],
  [100,380],[100,385],[100,458],[105,465],...L0610_SOUTH_LANE.line.map(point=>[point.x,point.z]),[117,552]];
const cartLengths=[0];
for(let index=1;index<cartRoute.length;index++) cartLengths.push(cartLengths.at(-1)+Distance(cartRoute[index-1],cartRoute[index]));

function LaneAtZ(z) {
  const line=L0610_LANE.line;
  for(let index=1;index<line.length;index++) if(line[index].z>=z) {
    const a=line[index-1],b=line[index],fraction=Clamp((z-a.z)/Math.max(0.001,b.z-a.z),0,1);
    return [Lerp(a.x,b.x,fraction),z];
  }
  return [line.at(-1).x,z];
}

const cartKeys = Keys([
  ["01a",0,55,155], ["04d",0,55,155], ["04d",1,64,158],
  ["05a",0.3,80,159], ["05a",0.6,83,180], ["05a",1,83,211],
  ["05b",1,87,229], ["05c",1,88,241], ["06a",1,94,274],
  ["06b",1,97,292], ["06h",1,97,292], ["06i",0.6,97.5,300],
  ["06i",1,96,314], ["07a",1,95,328], ["07b",1,97,338], ["07c",1,100,352],
  ["08a",1,104.6,379.3], ["09j",1,104.6,379.3],
  ["10a",1,100,385], ["10b",1,100,430], ["10c",1,103,462.2],
  ["10d",0.25,109,470], ["10d",0.6,109,493], ["10d",1,113.25,505],
  ["10e",1,117,527], ["10f",1,117,545], ["10j",1,117,552],
]).map(([time,x,z])=>[time,...(z>=161&&z<=378?LaneAtZ(z):[x,z])]);
// Project authored timing anchors to a forward-only arc length. Interpolation
// then follows every road bend instead of drawing chords between time keys.
let previousCartDistance=0;
const cartDistanceKeys=cartKeys.map(([time,x,z])=>{
  let best={error:Infinity,distance:previousCartDistance};
  for(let index=1;index<cartRoute.length;index++) {
    const a=cartRoute[index-1],b=cartRoute[index],length=cartLengths[index]-cartLengths[index-1];
    const fraction=Clamp(((x-a[0])*(b[0]-a[0])+(z-a[1])*(b[1]-a[1]))/(length*length),0,1);
    const distance=cartLengths[index-1]+fraction*length;
    if(distance<previousCartDistance-0.001) continue;
    const error=Distance([x,z],[Lerp(a[0],b[0],fraction),Lerp(a[1],b[1],fraction)]);
    if(error<best.error) best={error,distance};
  }
  previousCartDistance=best.distance;return [time,best.distance,0];
});

function CartAt(time) {
  const distance=Track(cartDistanceKeys,time)[0],total=cartLengths.at(-1);
  const point=SampleRoute(cartRoute,distance/total);
  const before=SampleRoute(cartRoute,(distance-0.6)/total),after=SampleRoute(cartRoute,(distance+0.6)/total);
  return {point,heading:Math.atan2(after[0]-before[0],-(after[1]-before[1]))};
}
const loadingCart=CartAt(BeatById("06d").start),loadingStart=Track(winterKeys,BeatById("06c").start);
const winterLoadingRoute=[loadingStart,LaneAtZ(loadingStart[1]),
  ...L0610_LANE.line.filter(point=>point.z>loadingStart[1]&&point.z<loadingCart.point[1]).map(point=>[point.x,point.z]),
  [loadingCart.point[0]-Math.sin(loadingCart.heading)*0.1,loadingCart.point[1]+Math.cos(loadingCart.heading)*0.1]];
const tankKeys = Keys(FLOW_TANK_TRACKS.tank1);
const secondTankKeys = Keys(FLOW_TANK_TRACKS.tank2);

function MarchTime(seconds) {
  const cycle=FLOW_GROUND.tankMoveS+FLOW_GROUND.tankWaitS;
  return Math.floor(seconds/cycle)*FLOW_GROUND.tankMoveS+Math.min(FLOW_GROUND.tankMoveS,seconds%cycle);
}

function TankTrack(keys,time) {
  const end=keys.findIndex((key)=>key[0]>time);
  if(end<=0) return Track(keys,time);
  const a=keys[end-1],b=keys[end],duration=b[0]-a[0],age=time-a[0];
  return SampleRoute([a.slice(1),b.slice(1)],MarchTime(age)/MarchTime(duration));
}

function TankState(keys,time) {
  const position=TankTrack(keys,time),next=TankTrack(keys,time+0.02);
  const moving=Distance(position,next)>0.001;
  // A stationary track retains the direction of its current leg.
  const end=keys.findIndex((key)=>key[0]>time);
  const a=keys[Math.max(0,end-1)],b=keys[end<0?keys.length-1:end];
  const heading=Distance(a.slice(1),b.slice(1))>0.01?Math.atan2(b[1]-a[1],-(b[2]-a[2])):Math.PI;
  return {p:position,moving,heading,status:moving?"地面推进":"停驶掩护，等待步兵"};
}

function Actor(id, name, side, kind, p, pose = "stand", extra = {}) {
  return { id, name, side, kind, p, pose, ...extra };
}

function RouteLength(route) {
  return route.slice(1).reduce((total, point, index) => total + Distance(route[index], point), 0);
}

function BuildOpeningRetreat(index) {
  const group = FLOW_OPENING_RESCUE.groups.find(entry => entry.members.includes(index));
  const member = group.members.indexOf(index);
  const departure = BeatById("01c").start + index * FLOW_OPENING.departureInterval;
  const heard = BeatById("02b").start + group.responseDelay + member * FLOW_OPENING_RESCUE.memberResponseInterval;
  const origin = [64 + index % 3 * 0.65, 63.5 + Math.floor(index / 3) * 0.35];
  const route = [origin, ...FLOW_OPENING.retreatRoute];
  const total = RouteLength(route);
  const distance = Math.min(total, (heard - departure) * FLOW_OPENING.retreatSpeed);
  const turn = SampleRoute(route, distance / total);

  // Preserve every traversed traffic-trench bend before the two lanes split.
  let traveled = 0;
  const traversed = [];
  for (let point = 1; point < route.length; point++) {
    traveled += Distance(route[point - 1], route[point]);
    if (traveled < distance && point >= 8) traversed.push(route[point]);
  }
  const rim = group.positions[member], landing = group.landings[member];
  const centerline = [turn, ...traversed.reverse(), ...group.route, rim];
  const laneOffset = FLOW_OPENING_RESCUE.memberLaneOffsets[member];
  const returning = centerline.map((point, pointIndex) => {
    if (pointIndex === 0 || pointIndex === centerline.length - 1) return point;
    const before = centerline[pointIndex - 1], after = centerline[pointIndex + 1];
    const length = Distance(before, after);
    return [point[0] - (after[1] - before[1]) / length * laneOffset,
      point[1] + (after[0] - before[0]) / length * laneOffset];
  });
  const arrival = BeatById("02e").start + group.arrivalOffset + member * FLOW_OPENING_RESCUE.memberArrivalInterval;
  const halts = returning.map((point, pointIndex) => pointIndex === 0 || pointIndex === returning.length - 1
    ? 0 : FLOW_OPENING_RESCUE.haltSeconds[(index + pointIndex) % FLOW_OPENING_RESCUE.haltSeconds.length]);
  const movingSeconds = arrival - heard - halts.reduce((sum, seconds) => sum + seconds, 0);
  const speed = RouteLength(returning) / movingSeconds;
  const keys = [[heard, ...turn]], pauses = [];
  let clock = heard;
  for (let point = 1; point < returning.length; point++) {
    clock += Distance(returning[point - 1], returning[point]) / speed;
    keys.push([clock, ...returning[point]]);
    if (halts[point] > 0) {
      pauses.push([clock, clock + halts[point]]);
      clock += halts[point];
      keys.push([clock, ...returning[point]]);
    }
  }
  return {departure, heard, route, total, rim, landing, arrival, keys, pauses,
    rescueLane: group.lane, rescueGroup: group.id};
}

const openingRetreatPlans = Array.from({length: FLOW_OPENING.retreatCount}, (_, index) => BuildOpeningRetreat(index));
const openingMeleePlans = FLOW_OPENING_RETREAT.meleeAllies.map((ally, slot) => {
  const retreat = FLOW_OPENING_RETREAT;
  const contact = BeatById(retreat.meleeBeat).start + retreat.contactDelay + slot * retreat.memberInterval;
  const enemyPosition = retreat.meleePositions[slot];
  const allyPosition = [enemyPosition[0] - retreat.meleeDistance, enemyPosition[1]];
  const route = [enemyPosition, retreat.junction, retreat.rally];
  const escape = contact + retreat.contactSeconds;
  return {ally, enemyPosition, allyPosition, contact, escape, route,
    approach: contact - retreat.approachSeconds,
    arrival: escape + RouteLength(route) / retreat.escapeSpeed};
});

function OpeningRetreat(time, index) {
  const plan = openingRetreatPlans[index];
  const {departure, heard, route, total, rim, landing, arrival, keys, pauses} = plan;
  if (time < heard) return {p: SampleRoute(route, Math.max(0, time - departure) * FLOW_OPENING.retreatSpeed / total),
    pose: time > departure ? "walk" : "stand"};
  const identity = {rescueLane: plan.rescueLane, rescueGroup: plan.rescueGroup};
  if (time < arrival) return {p: Track(keys, time),
    pose: pauses.some(([start, end]) => time >= start && time < end) ? "kneel" : "walk", ...identity};
  const jump = BeatById("02f").start + 3 + index * 0.08;
  if (time < jump) return {p: rim, pose: "kneel", ...identity};
  if (time < BeatById("02f").end) return {p: SampleRoute([rim, landing], (time - jump) / (BeatById("02f").end - jump)), pose: "run", ...identity};
  const melee = openingMeleePlans.find(plan => plan.ally === index);
  if (melee) {
    const extra = {...identity, heading: Math.PI / 2, meleePartnerId: `opening${6 + openingMeleePlans.indexOf(melee)}`};
    if (time < melee.contact) return {p: SampleRoute([landing, melee.allyPosition],
      (time - BeatById("02g").start) / (melee.contact - BeatById("02g").start)), pose: "run", ...extra};
    return {p: melee.allyPosition, pose: time < melee.escape ? "melee" : index < 10 ? "dead" : "wounded", ...extra};
  }
  let pose = "stand";
  if (index >= 3 && time >= BeatById("02h").start) pose = index < 10 ? "dead" : "wounded";
  return {p: landing, pose, ...identity};
}

function OpeningGunTeam(time, index) {
  const origin = index === 1 ? [63,64.5] : [65 + index * 0.35,65];
  const route = [origin, ...FLOW_OPENING.gunRoute.slice(0, -1), [index * 0.65,-7]];
  const departure = BeatById("01c").start + index * FLOW_OPENING.gunInterval;
  const distance = Math.max(0, time - departure) * FLOW_OPENING.gunSpeed;
  const total = RouteLength(route);
  const p = SampleRoute(route, distance / total);
  return {p, pose: time > departure && distance < total ? "run" : "stand"};
}

function ReturnFromPit(actors, time) {
  const plan = FLOW_YAOWA_RETURN;
  const start = BeatById(plan.startBeat).start;
  const join = BeatById(plan.joinBeat).start;
  const end = BeatById(plan.exitBeat).start;
  if (time >= end) return;
  const distance = Math.max(0, time - start) * plan.speed;
  const total = RouteLength(plan.route);
  const yao = actors.find(actor => actor.id === "yao");
  if (time >= start && time < join) {
    yao.p = SampleRoute(plan.route, distance / total);
    yao.pose = distance < total ? "run" : "kneel";
  }
  for (const [index, member] of plan.survivors.entries()) {
    let actor = actors.find(entry => entry.id === member.id);
    if (!actor) {
      actor = Actor(member.id, member.name, "friend", "person", [...member.origin]);
      actors.push(actor);
    }
    if (time < start) continue;
    const route = [member.origin, ...plan.route.slice(1)];
    const length = RouteLength(route);
    let p = SampleRoute(route, Math.max(0, Math.min(distance, length) - member.gap) / length);
    if (time >= join) {
      const last = SampleRoute(route, (length-member.gap)/length);
      const retreat = Keys(plan.retreatKeys).map(([stamp,x,z]) => [stamp+index*plan.retreatInterval,x,z]);
      p = Track([[join,...last],...retreat,...Keys(member.evacuationKeys)],time);
    }
    Object.assign(actor, {name: member.name, p:[p[0]+member.offset*Clamp(distance/5,0,1),p[1]], pose:"walk",
      wounded:true, alive:true, status:"负伤撤退", groupId:"PitSurvivors"});
  }
}

let companionTracks = null;
const campDefenseTracks = FLOW_CAMP_DEFENSE.map(plan => ({...plan, track: Keys(plan.keys)}));
const dragRearguardTracks = FLOW_DRAG_REARGUARD.map(plan => ({...plan,track:Keys(plan.keys),
  fall:BeatById(plan.fallBeat).start+BeatById(plan.fallBeat).duration*plan.fallFraction}));

function CampActors(actors, time) {
  if (time < BeatById("04b").start || time > BeatById("05a").start) return;
  for (const plan of campDefenseTracks) {
    const actor = actors.find(entry => entry.id === plan.id);
    actor.p = Track(plan.track, time);
    const moving = Distance(actor.p, Track(plan.track, time + 0.02)) > 0.001;
    const deployed = time >= BeatById("04b").start + BeatById("04b").duration * plan.readyFraction;
    Object.assign(actor, {pose: moving ? "run" : deployed ? "shoot" : "stand",
      firing: deployed && !moving, heavy: plan.heavy === true && deployed && !moving,
      status: moving ? "转移阵位" : deployed ? "前沿阻击" : "准备前出"});
  }
  const loading = FLOW_CAMP_LOADING;
  if (time >= BeatById(loading.finishBeat).start) return;
  const loadingStart = BeatById(loading.startBeat).start;
  for (const [index, member] of loading.members.entries()) {
    const {id, name, route} = member;
    const finishStart = BeatById(loading.finishBeat).start - loading.finishSeconds;
    const cycle = ((Math.min(time, finishStart) - loadingStart + index * loading.memberDelaySeconds) % loading.cycleSeconds) / loading.cycleSeconds;
    const carrying = cycle < 0.5;
    const actor = actors.find(entry => entry.id === id);
    let p = SampleRoute(route, carrying ? cycle * 2 : (1 - cycle) * 2);
    if (time >= finishStart) p = SampleRoute([p, actor?.p ?? member.end], (time - finishStart) / loading.finishSeconds);
    const state = {p, pose: carrying ? "carry" : "walk", carryingAmmo: carrying,
      status: time >= finishStart ? "装车收尾" : carrying ? "搬弹药到车边" : "返回弹药堆"};
    if (actor) Object.assign(actor, state);
    else actors.push(Actor(id, name, "civilian", "person", p, state.pose, state));
  }
}

function CoreActors(beat, time, player, progress, tankStart=BeatById("03h").start+BeatById("03h").duration*0.5) {
  const cartState=CartAt(time),cart=cartState.point,heading=cartState.heading;
  const CartOffset=(side,forward)=>[cart[0]+Math.cos(heading)*side+Math.sin(heading)*forward,cart[1]+Math.sin(heading)*side-Math.cos(heading)*forward];
  const loadingProgress=Clamp((time-BeatById("06c").start)/BeatById("06c").duration,0,1);
  const aboard=time>=BeatById("06d").start;
  const winter=aboard?CartOffset(0,-0.1):time>=BeatById("06c").start?SampleRoute(winterLoadingRoute,loadingProgress):Track(winterKeys,time);
  const actors = [Actor("player", "顺子", "player", "person", player, beat.cover?"kneel":beat.pose)];
  const winterPose = time < BeatById("02b").start ? "kneel" : "wounded";
  actors.push(Actor("winter", "冬瓜", "friend", "quilt", winter, winterPose,
    aboard?{parentId:"cart",elevation:1.05,heading}:loadingProgress>0?{elevation:1.05*Clamp((loadingProgress-0.85)/0.15,0,1),heading}:{}));
  const atCamp = beat.stage === "04", village = Number(beat.stage) >= 8;
  const offset = (x, z) => [player[0] + x, player[1] + z];
  let luo = offset(-1.4, -2.5), he = offset(1.1, 0), liu = offset(-0.7, -4), yao = offset(-2, 1);

  if (beat.stage === "03" && beat.id < "03g") yao = [0,-7];
  if (beat.pose === "drag") he = offset(0,0.95);
  if (beat.id === "03g") { luo = [22,69.5]; yao = [24,73]; }
  if (atCamp) { luo = [57,150]; he = [49,152]; liu = [52,150]; yao = [50,149]; }
  if (beat.stage === "06" && ["06g","06h"].includes(beat.id)) yao = [81,278];
  if (village && beat.stage !== "10") {
    luo = Track(Keys([["08a",0,98,348],["08a",1,102,383],["08e",1,110,386.6],
      ["08f",1,108.3,400.5],["09a",1,104.75,411.6],["09b",1,104.75,436.4],["09c",1,104.8,441.4],
      ["09i",1,105.8,456.5],["09j",1,106.5,460.5]]),time);
    he=[luo[0]+1,luo[1]+1.2];
    yao=time<BeatById("08a").end?offset(-2,1):[100,384];
  }
  actors.push(Actor("luo", "罗班长", "friend", "person", luo, beat.id === "03g" ? "shoot" : "stand"));
  actors.push(Actor("he", "何有田", "friend", "person", he, beat.pose === "drag" ? "drag" : "stand"));
  actors.push(Actor("liu", "刘文财", "friend", "person", liu, beat.stage === "03" ? "shoot" : "stand"));
  actors.push(Actor("yao", "幺娃", "friend", "person", yao, ["06g","06h"].includes(beat.id) ? "shoot" : "stand"));
  if (Number(beat.stage) >= 4) {
    actors.push(Actor("cart", "老耿的车", "civilian", "cart", cart, "stand",{heading}));
    actors.push(Actor("donkey", "毛驴", "civilian", "donkey", CartOffset(0,2.3), "walk",{heading}));
    actors.push(Actor("geng", "老耿", "civilian", "person", CartOffset(-0.95,1.2), "stand"));
    let nier = CartOffset(1,0.6);
    if(beat.id === "08g") nier=SampleRoute([[104.6,379.3],[99,380],[80,382],[80,392]],progress);
    if(beat.stage === "09") nier=offset(-0.8,1.2);
    if(beat.id === "09h") nier=SampleRoute([[90.7,484.6],[90.7,473],[93.3,473],[94,484.6]],progress);
    if(beat.stage === "10" && time < BeatById("10d").end) nier=Track(Keys([["10a",0,101,478],["10b",1,108,483],["10c",1,109,465],["10d",1,113.25,505]]),time);
    actors.push(Actor("nier", "妮儿", "civilian", "child", nier, "stand"));
  }
  if (time >= tankStart) {
    const burned = time >= BeatById("06h").start + BeatById("06h").duration * 0.8;
    const tankTime=time-tankStart+BeatById("03h").start+BeatById("03h").duration*0.5;
    const first=TankState(tankKeys,tankTime),second=TankState(secondTankKeys,tankTime);
    const disabled=time>=BeatById("06g").start;
    if(disabled) {first.moving=false;first.status=burned?"焚毁":"履带损毁";}
    if(time>=BeatById("06i").start) second.status="倒车撤离";
    const tankPosition=first.p;
    const turretTarget=["06g","06h"].includes(beat.id)?yao:player;
    const turret=Math.atan2(turretTarget[0]-tankPosition[0],-(turretTarget[1]-tankPosition[1]))+Math.sin(time*0.8)*0.15;
    actors.push(Actor("tank1", "九四式 · 头车", "enemy", "tank", tankPosition, burned ? "burn" : "stand",
      { ...first, surface:"ground", turret, disabled }));
    if (time < BeatById("07a").start) actors.push(Actor("tank2", "九四式 · 后车", "enemy", "tank", second.p, "stand", { ...second, surface:"ground", heading: Math.PI, turret: Math.PI }));
  }
  if (time >= BeatById("04c").start && time < BeatById("06c").start) {
    const down = beat.id === "06b";
    const pose = down ? "dead" : beat.id === "04c" ? "carry" : "walk";
    actors.push(Actor("carrier1", "抬担架的老乡", "civilian", "person", [winter[0],winter[1]-1.7], pose));
    actors.push(Actor("carrier2", "抬担架的老乡", "civilian", "person", [winter[0],winter[1]+1.7], pose));
  }
  if (beat.id === "06c") actors.push(Actor("veteran", "抱捆老兵", "friend", "person", SampleRoute([[94,264],[96,263],[101,263],[101,257]], Math.min(1,progress*2)), progress > 0.5 ? "dead" : "run"));
  if(beat.stage === "10") {
    for(let index=0;index<12;index++) {
      const cross=BeatById("10a").start+32+index*13.5;
      const p=Track([[cross-110,115,380],[cross-95,100,383],[cross-12,100,458],
        [cross,111,465],[cross+16,109,493],[cross+30,113.25,505],[cross+55,117,527],[cross+80,117,552]],time);
      actors.push(Actor(`stretcher${index}`,`担架 ${index+1}`,"civilian","quilt",p,"wounded"));
    }
    if(beat.id >= "10h") actors.push(Actor("platoon","负伤排长","friend","person",offset(-1,-3),"drag"));
  }
  if(companionTracks) for(const actor of actors) {
    if(companionTracks[actor.id]) actor.p=Track(companionTracks[actor.id],time);
  }
  CampActors(actors, time);
  if(time>=BeatById("03a").start && time<BeatById("04a").end) {
    for(const plan of dragRearguardTracks) {
      const p=Track(plan.track,Math.min(time,plan.fall));
      const dead=time>=plan.fall;
      const moving=!dead && Distance(p,Track(plan.track,time+0.02))>0.001;
      actors.push(Actor(plan.id,plan.name,"friend","person",p,dead?"dead":moving?"run":"shoot",
        {groupId:"DragRearguard",target:"enemy",fall:plan.fall,firing:!dead&&!moving,status:dead?"掩护撤退时牺牲":moving?"交替撤退":"殿后掩护"}));
    }
  }
  if (Number(beat.stage) <= 2) {
    for (const [index, id] of ["luo", "he", "liu"].entries()) Object.assign(actors.find(actor => actor.id === id), OpeningRetreat(time, index));
    Object.assign(actors.find(actor => actor.id === "yao"), OpeningGunTeam(time, 0));
  }
  if (time < BeatById("04a").start) {
    for (let index = 3; index < FLOW_OPENING.retreatCount; index++) actors.push(Actor(`openingAlly${index}`, `川军 ${index - 2}`, "friend", "person", [], "stand", OpeningRetreat(time, index)));
  }
  if (time < BeatById("04a").start) {
    for (const [index, name] of ["传令兵", "机枪手", "机枪副手"].entries()) {
      const state = OpeningGunTeam(time, index + 1);
      if (index === 1 && time >= BeatById("02c").start) state.pose = "dead";
      if (index === 0 && time < BeatById("01c").start) {
        state.p = Track(Keys([["01a",0,30,66.8],["01b",0,46,65.6],["01b",1,63,64.5]]), time);
        state.pose = "run";
      }
      actors.push(Actor(`openingGun${index}`, name, "friend", "person", [], "stand", state));
    }
  }
  ReturnFromPit(actors, time);
  if(aboard&&actors.some(actor=>actor.id==="nier")&&(time>=BeatById("10d").end||Number(beat.stage)<8)) actors.find(actor=>actor.id==="nier").p=CartOffset(1,0.6);
  return actors;
}

function BuildCompanionTracks() {
  const tracks=Object.fromEntries(["luo","he","liu","yao","nier"].map((id)=>[id,[]]));
  for(const beat of FLOW_TIMELINE) {
    const positions=Object.fromEntries(Object.keys(tracks).map((id)=>[id,[]]));
    for(let index=0;index<=10;index++) {
      const progress=index/10;
      const actors=CoreActors(beat,beat.start+beat.duration*progress,SampleBeatRoute(beat,progress),progress);
      for(const id of Object.keys(tracks)) {
        const actor=actors.find((entry)=>entry.id===id);
        if(actor) positions[id].push(actor.p);
      }
    }
    for(const id of Object.keys(tracks)) {
      if(!positions[id].length) continue;
      const previous=tracks[id].at(-1);
      const points=previous?[previous.slice(1),...positions[id]]:positions[id];
      const lengths=points.slice(1).map((point,index)=>Distance(points[index],point));
      const total=lengths.reduce((sum,length)=>sum+length,0);
      const stationary=positions[id].every((point)=>Distance(point,positions[id][0])<0.01);
      const travelDuration=stationary?Math.min(beat.duration,total/1.8):beat.duration;
      if(!previous) tracks[id].push([beat.start,...points[0]]);
      let traveled=0;
      for(let index=1;index<points.length;index++) {
        traveled+=lengths[index-1];
        if(lengths[index-1]>0) tracks[id].push([beat.start+travelDuration*traveled/total,...points[index]]);
      }
      tracks[id].push([beat.end,...points.at(-1)]);
    }
  }
  return tracks;
}

companionTracks=BuildCompanionTracks();

function OpeningActors(time) {
  const retreat = FLOW_OPENING_RETREAT;
  if (time < BeatById("01c").start || time >= BeatById(retreat.endBeat).end) return [];
  const defeated = time >= BeatById("02g").start;
  return Array.from({ length: 9 }, (_,index) => {
    const route = [...FLOW_OPENING.enemyRoutes[index < 2 ? 0 : index < 6 ? 1 : 2], FLOW_OPENING.enemyPositions[index]];
    const born = BeatById("01c").start + index * 0.4;
    const arrival = born + RouteLength(route) / FLOW_OPENING.enemySpeed;
    let p = SampleRoute(route, (time - born) / (arrival - born));
    if (time < born || index < 6 && time >= BeatById(retreat.blockBeat).start) return null;
    const melee = openingMeleePlans[index - 6];
    if (melee && time >= melee.approach && time < melee.escape) {
      p = SampleRoute([FLOW_OPENING.enemyPositions[index], melee.enemyPosition],
        (time - melee.approach) / (melee.contact - melee.approach));
      return Actor(`opening${index}`, "日军", "enemy", "person", p, time < melee.contact ? "run" : "melee",
        {born,arrival,heading:-Math.PI / 2,meleePartnerId:`openingAlly${melee.ally}`});
    }
    if (melee && time >= melee.escape) {
      const rally = BeatById(retreat.rallyBeat);
      const approaching = time < rally.end;
      const spread = Clamp((time - melee.escape) / (melee.arrival - melee.escape), 0, 1);
      p = time < rally.start
        ? SampleRoute(melee.route, spread)
        : SampleRoute([retreat.rally,retreat.junction,retreat.block], (time-rally.start)/rally.duration);
      p = [p[0],p[1]+(index-7)*0.65*spread];
      const end = BeatById(retreat.endBeat);
      const fall = end.start+end.duration*retreat.fallFractions[index-6];
      const dead = time >= fall;
      const moving = time < rally.start ? time < melee.arrival : approaching;
      return Actor(`opening${index}`, "退逃日军", "enemy", "person", p, dead ? "dead" : moving ? "run" : approaching ? "kneel" : "shoot",
        {groupId:"OpeningSurvivors",firing:!dead&&!approaching,fall,born,arrival});
    }
    const pose = defeated && index < 6 ? "dead" : time < arrival ? "run" : "stand";
    return Actor(`opening${index}`, index < 2 ? "北沿机枪组" : index === 4 ? "丙" : "日军", "enemy", "person", p, pose, {born,arrival});
  }).filter(Boolean);
}

function Effects(beat, time, progress, actors) {
  const effects = [], player = actors[0];
  const winter = actors.find((actor) => actor.id === "winter");
  const tank = actors.find((actor) => actor.id === "tank1");
  const AddArc = (a,b,t0,length) => {
    const phase = (time-t0)/length;
    if (phase>=0 && phase<=1) effects.push({ kind: "grenade", a,b, phase });
    if (phase>1 && phase<1.7) effects.push({ kind: "blast", p:b, age:(phase-1)*length });
  };
  if (beat.fx === "rescue") {
    AddArc(actors.find(actor=>actor.id === "luo").p,[54.5,61.4],beat.start,2.5);
    AddArc(actors.find(actor=>actor.id === "he").p,[57.5,61.2],beat.start+0.4,2.5);
  }
  if (beat.fx === "returnGrenade") {
    AddArc(beat.grenadeFrom??[21,61],[winter.p[0],winter.p[1]],beat.start,2.2);
    AddArc(winter.p,beat.grenadeFrom??[21,61],beat.start+4,2.1);
  }
  if (["trackBlast","engineBlast","collapse"].includes(beat.fx)) {
    const age = time - (beat.start + beat.duration * 0.8);
    if (age >= 0 && age < 5) effects.push({ kind: "blast", p: tank?.p ?? player.p, age });
  }
  const targets = actors.filter((actor) => actor.side === "enemy" && actor.pose !== "dead" && actor.kind !== "tank" && actor.pose !== "run");
  const blockers = actors.filter((actor) => actor.groupId === "OpeningSurvivors" && actor.firing);
  for (const actor of blockers) effects.push({kind:"fire",a:actor.p,b:player.p,side:"enemy",phase:(time*2.3+actor.p[1])%1});
  if (blockers.length) for (const id of ["luo","liu"]) {
    const defender = actors.find((actor) => actor.id === id);
    effects.push({kind:"fire",a:defender.p,b:blockers[0].p,side:"friend",phase:(time*2.1+defender.p[0])%1});
  }
  for (const defender of actors.filter(actor => actor.firing && campDefenseTracks.some(plan => plan.id === actor.id))) {
    const target = targets.reduce((nearest, enemy) => !nearest || Distance(defender.p, enemy.p) < Distance(defender.p, nearest.p) ? enemy : nearest, null);
    if (target) effects.push({kind:"fire",a:defender.p,b:target.p,side:"friend",heavy:defender.heavy,phase:(time*3+defender.p[0])%1});
  }
  if (["shoot","retreat"].includes(beat.pose) && targets.length) {
    const target = targets[Math.floor(time/3) % targets.length];
    effects.push({ kind: "fire", a:player.p, b:target.p, side:"player", phase:(time*1.2)%1 });
  }
  if ((beat.fire === "tank" || ["03h","05a","05b","05c"].includes(beat.id)) && tank && tank.pose !== "burn") {
    const target = ["06g","06h"].includes(beat.id) ? actors.find((actor)=>actor.id === "yao").p : player.p;
    effects.push({ kind:"fire", a:tank.p, b:target, side:"enemy", heavy:true, phase:(time*5)%1 });
  }
  if (["crossfire","north"].includes(beat.fire) && beat.stage === "02") {
    const gunner = actors.find(actor => actor.id === "opening0");
    const leader = actors.find(actor => actor.id === "luo");
    if (time >= gunner.arrival) {
      effects.push({kind:"fire",a:gunner.p,b:leader.p,side:"enemy",phase:(time*6)%1,heavy:true});
      if (time < BeatById("02b").start) effects.push({kind:"fire",a:leader.p,b:gunner.p,side:"friend",phase:(time*3)%1});
    }
    const westGun = actors.find(actor => actor.id === "openingGun1");
    if (beat.fire === "crossfire" && westGun.pose !== "run") effects.push({kind:"fire",a:westGun.p,b:gunner.p,side:"friend",phase:(time*3)%1,heavy:true});
  }
  if (beat.id === "03g") effects.push({kind:"fire",a:[22,69.5],b:[12,44],side:"friend",phase:(time*5)%1,heavy:true});
  if (["06g","06h"].includes(beat.id)) effects.push({kind:"fire",a:[81,278],b:tank.p,side:"friend",phase:(time*5)%1});
  if (beat.fx === "planes") {
    for (let index=0;index<3;index++) effects.push({kind:"plane",p:[105+(index-1)*9,180+progress*150-index*6],height:35});
  }
  if(beat.fx === "mortar") {
    const cycle=Math.floor((time-beat.start)/12),phase=((time-beat.start)%12)/3;
    const landing=[[127,467],[120,466],[113,474],[113,465]][Math.min(cycle,3)];
    if(phase<=1) effects.push({kind:"grenade",a:[199,449],b:landing,phase});
    else if(phase<1.7) effects.push({kind:"blast",p:landing,age:(phase-1)*2});
  }
  if(beat.fx === "artillery") {
    const age=(time-beat.start)%5;
    const behind=[player.p[0]+Math.sin(Math.floor(time/5))*4,player.p[1]-5];
    effects.push({kind:"blast",p:behind,age});
  }
  if(beat.fx === "yardBlast") {
    const age=(time-beat.start)%12;
    if(age<3) {effects.push({kind:"blast",p:[111,465],age});effects.push({kind:"blast",p:[116,464],age:age+0.4});}
  }
  if(beat.fx === "runner") effects.push({kind:"runner",p:SampleRoute([[110,465],[180,465],[230,465]],progress)});
  if(beat.fx === "column") for(let index=0;index<14;index++) effects.push({kind:"column",p:[225+index*2-progress*10,330+index*3+progress*10]});
  return effects;
}

export const DEFAULT_ENCOUNTER_DOCUMENT = CreateEncounterDocument(FLOW_TIMELINE, FLOW_WAVES);
const compiledDocuments = new WeakMap();

export function EvaluateFlow(requestedTime, document = DEFAULT_ENCOUNTER_DOCUMENT) {
  const time = Clamp(Number.isFinite(requestedTime) ? requestedTime : 0, 0, FLOW_DURATION);
  const beat = FLOW_TIMELINE.find((entry) => time < entry.end) ?? FLOW_TIMELINE.at(-1);
  const stage = STAGE_TIMELINE.find((entry) => entry.id === beat.stage);
  const progress = Clamp((time - beat.start) / beat.duration, 0, 1);
  const player = SampleBeatRoute(beat, progress);
  if (!compiledDocuments.has(document)) compiledDocuments.set(document, CompileEncounters(document, FLOW_TIMELINE));
  const tankTrigger=compiledDocuments.get(document).triggers.find((trigger)=>trigger.id==="Trigger_TankEscort");
  const tankStart=tankTrigger?.firedAt??Infinity;
  const actors = CoreActors(beat,time,player,progress,tankStart);
  const encounter = SampleEncounters(compiledDocuments.get(document), time, actors, (sampleTime)=>{
    const sampleBeat=FLOW_TIMELINE.find((entry)=>sampleTime<entry.end)??FLOW_TIMELINE.at(-1);
    const sampleProgress=Clamp((sampleTime-sampleBeat.start)/sampleBeat.duration,0,1);
    return CoreActors(sampleBeat,sampleTime,SampleBeatRoute(sampleBeat,sampleProgress),sampleProgress,tankStart);
  });
  actors.push(...OpeningActors(time), ...encounter.actors);
  const effects = [...Effects(beat,time,progress,actors), ...encounter.effects];
  if (beat.id === "03h") {
    actors[0].pose = (progress >= 0.22 && progress < 0.32) || (progress >= 0.5 && progress < 0.6) ? "shoot" : "drag";
    const pursuer = encounter.actors.find(actor => actor.wave === "RearPursuit" && actor.pose !== "dead");
    if (pursuer) for (const id of ["luo", "liu", ...(actors[0].pose === "shoot" ? ["player"] : [])]) {
      const defender = actors.find(actor => actor.id === id);
      effects.push({kind:"fire", a:defender.p, b:pursuer.p, side:defender.side, phase:(time*3.2+defender.p[0])%1});
    }
  }
  const zone = beat.zone ? { p:beat.zone.slice(0,2), radius:beat.zone[2], condition:beat.gate, active:progress>=0.75 } : null;

  const nearest = actors.filter((actor)=>actor.side === "enemy" && actor.pose !== "dead")
    .reduce((value,actor)=>Math.min(value,Distance(player,actor.p)),Infinity);
  const stretchersPassed=beat.stage === "10" ? Clamp(Math.floor((time-BeatById("10a").start-32)/13.5)+1,0,12) : null;
  return {time,beat,stage,progress,player,actors,effects,spawns:encounter.groups,groups:encounter.groups,triggers:encounter.triggers,zone,nearest,stretchersPassed};
}

export function FormatFlowTime(time) {
  const seconds = Math.floor(time);
  return `${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;
}
