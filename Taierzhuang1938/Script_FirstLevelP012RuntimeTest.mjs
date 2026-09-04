// Runtime adapter regression: real actor handles, finite budgets, warning-before-impact.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { FirstLevelP012Runtime } from "./Script_FirstLevelP012Runtime.mjs";
import { SETPIECES, EscortColumn, LastLitterArrived } from "./Script_MissionSetpieces.mjs";
import P012Phase from "./Data_FirstLevelP012Whitebox.mjs";
{
 const {Vector3}=await import(`data:text/javascript;base64,${Buffer.from(readFileSync(new URL("./vendor/three/build/three.core.js",import.meta.url),"utf8")).toString("base64")}`);
 const source=readFileSync(new URL("./Script_Player.mjs",import.meta.url),"utf8");
 const movement=source.slice(source.indexOf("    let speed = target.speed;"),source.indexOf("    this.MoveWithCollision(dt);")+"    this.MoveWithCollision(dt);".length);
 const Step=vm.runInNewContext(`(function(dt,input,target){${movement}})`,{UP:new Vector3(0,1,0),GRAVITY_MPS2:19.6,Clamp:(n,a,b)=>Math.max(a,Math.min(b,n)),Clamp01:n=>Math.max(0,Math.min(1,n))});
 function Travel(diveSpeedMps,forward,wall=false){
  const p={stance:"prone",health:20.267,suppression:1,ads:1,sprint:0,carrySpeedScale:1,debug:{},yaw:0,grounded:true,velocity:new Vector3(),position:new Vector3(),_forward:new Vector3(),_right:new Vector3(),_tmp:new Vector3(),LegPenalty:()=>.72*.72,MoveWithCollision(dt){if(!wall)this.position.addScaledVector(this.velocity,dt);this.position.y=0;this.velocity.y=0;}};
  for(let i=0;i<132;i++)Step.call(p,1/60,{forward,diveSpeedMps},{speed:.72});
  return Math.hypot(p.position.x,p.position.z);
 }
 assert.ok(Travel(undefined,1)<.8,"low health, injured suppressed crawl cannot clear original distance gate");
 assert.ok(Travel(1.2,1)>.8,"production movement integration permits real low-health dive inside 2.2s");
 assert.equal(Travel(1.2,0),0,"no directional input never moves");
 assert.equal(Travel(1.2,1,true),0,"collision remains authoritative, blocked dive cannot succeed");
 const r=new FirstLevelP012Runtime({},{});r.beat=19;
 assert.equal(r.DiveSpeed({player:{open:true}}),undefined,"no intent no impulse");
 r.RecordDodgeIntent({x:0,z:0});assert.equal(r.DiveSpeed({player:{open:true}}),1.2);
 assert.equal(r.DiveSpeed({player:{open:false}}),undefined,"closed window immediately removes impulse");
 r.beat=18;assert.equal(r.DiveSpeed({player:{open:true}}),undefined,"other phases retain normal speed");
}
const guide = { x: 0, z: 0 }, actors = [], moves = [], impacts = [], signals = new Set();
{
 const column=new EscortColumn({}, {followRouteBodies:true,members:[]});
 assert.deepEqual(column._Slot(8,{role:"civilian",routeSlot:{back:.95,lateral:.8}}),{back:.95,lateral:.8});
 assert.deepEqual(column._Slot(8,{role:"civilian"}),{back:17.6,lateral:-.35},"existing formations retain original slots unless explicitly configured");
}
{
 const living={x:0,z:0,alive:true,lastFire:0},dead={x:0,z:0,alive:false},untouched={alive:true},orders=[],events=[];
 let visible=false;
 const r=new FirstLevelP012Runtime({Alive:a=>a.alive,Position:a=>a,CombatTime:()=>10,PursuitGoal:(a,p)=>orders.push({a,p}),Firing:()=>true,ThreatensEscort:()=>visible,Visible:()=>false,Signal:n=>events.push(n)},
 {activities:{retreatPursuitRoutes:[[{x:0,z:0},{x:1,z:0},{x:2,z:0}],[{x:0,z:0},{x:1,z:0}]]}});
 r.far=[living,dead,untouched,untouched];r.beat=23;r.StepRetreatPursuit();assert.equal(orders.length,0,"no real smoke no pursuit");
 r.smoke={};r.StepRetreatPursuit();assert.equal(orders.length,1);assert.equal(r.pursuit[0].index,1);assert.equal(r.pursuit[1].index,0,"dead actor never moves or respawns");
 r.StepRetreatPursuit();assert.equal(r.pursuit[0].index,1,"cannot skip an unreached corner");
 living.x=1;living.lastFire=11;r.StepRetreatPursuit();assert.equal(events.length,0,"unseen fire does not claim visible right threat");
 visible=true;r.StepRetreatPursuit();r.StepRetreatPursuit();assert.deepEqual(events,["P012RetreatRightThreat"]);
 assert.ok(orders.every(order=>order.a===living));assert.equal(r.far.length,4,"same finite budget");
 living.x=2;r.StepRetreatPursuit();assert.equal(r.pursuit[0].index,2,"finite endpoint does not pursue beyond route");
}
{
 let restored=null;const load={serial:17,x:44,z:60};
 const opening=new FirstLevelP012Runtime({RestorePlayer:p=>{restored=p;return true;}},{anchors:{trainSpawn:{x:-66,z:65}}});
 opening.failed=true;assert.equal(opening.RetryPlayer(),true);assert.equal(restored.id,"Start");assert.deepEqual([restored.x,restored.z],[-66,65]);
 const r=new FirstLevelP012Runtime({RestorePlayer:p=>{restored=p;return true;}},{});
 r.SaveSafePoint("CP03",{x:99,z:99});assert.equal(r.RetryPlayer(),false);
 r.failed=true;assert.equal(r.RetryPlayer(),true);assert.deepEqual([restored.x,restored.z],[30,10]);
 r.SaveSafePoint("CP05",{x:99,z:99});assert.equal(r.safePoint.stance,"prone");
 r.failed=true;r.retryAtLoad={x:load.x,z:load.z,stance:"prone"};const before=JSON.stringify(load);
 r.RetryPlayer();assert.deepEqual([restored.x,restored.z],[44,60]);assert.equal(JSON.stringify(load),before,"retry does not move or duplicate the active payload");
 assert.equal(r.completed,undefined,"failure retry is not completion");
}
{
 let visible=true;const events=new Set();
 const r=new FirstLevelP012Runtime({Signalled:n=>events.has(n),Signal:n=>events.add(n),VisibleAircraft:()=>visible},{});
 const eye={x:0,y:1,z:0},aim={x:0,y:0,z:-1},view={active:true,aircraft:{x:0,y:1,z:-100}};
 r.beat=15;assert.equal(r.RecordAircraftShot(eye,aim,view),false);
 r.beat=16;assert.equal(r.RecordAircraftShot(eye,{x:1,y:0,z:0},view),false);
 visible=false;assert.equal(r.RecordAircraftShot(eye,aim,view),false,"occluded airplane cannot trigger reaction");
 visible=true;assert.equal(r.RecordAircraftShot(eye,aim,null),false);
 assert.equal(r.RecordAircraftShot(eye,aim,view),true);assert.ok(events.has("P012AircraftPlayerFire"));
 assert.equal(r.RecordAircraftShot(eye,aim,view),false,"one reaction per actual aircraft encounter");
}
{
 const guard={x:45,z:24,alive:true};const orders=[];let released=false;
 const r=new FirstLevelP012Runtime({GuideActor:()=>null,Position:a=>a,Signalled:()=>false,FriendlyActors:()=>[guard],Defend:(actor,point,doctrine)=>orders.push({point:{...point},doctrine}),ReleaseDefense:()=>released=true},{activities:{frontlineDoctrine:{accuracyScale:.22,fireIntervalScale:2.5}}});
 r.Guide({beat:14,route:[]});r.Update(.1);
 assert.deepEqual(orders[0].point,guard,"ambush guards hold their real escort positions, not a room assault goal");
 assert.deepEqual(orders[0].doctrine,{accuracyScale:.22,fireIntervalScale:2.5,holdRadiusM:2},"escort uses the same configured covering-fire discipline as frontline");
 r.Update(.1);assert.equal(orders.length,1,"defense anchor must not drift as actor moves");
 r.Guide({beat:15,route:[]});r.Update(.1);assert.ok(released,"cleared ambush releases escort guard to continue route");
 for(const beat of [20,21]){r.Guide({beat,route:[]});r.Update(.1);assert.equal(r.defenders.length,1);}
 let point={x:0,z:1};const discipline=[];
 r.config.returnWaypoints=[{x:0,z:0},{x:0,z:100}];r.host.RetreatPosition=()=>point;r.host.FireDiscipline=(actor,d)=>discipline.push(d);
 r.Guide({beat:23,route:[]});r.Update(.1);assert.equal(r.defenders,null,"retreat does not retain stationary defense");assert.equal(discipline.at(-1).accuracyScale,.22);
 point={x:0,z:51};r.Update(.1);assert.equal(discipline.at(-1),null,"actual route midpoint releases covering-fire limits");
}
{
 const actor={x:0,z:0,alive:true,health:1,order:"advance"};let released=0;
 const r=new FirstLevelP012Runtime({GuideActor:()=>actor,Position:a=>a,Alive:a=>a.alive,Move(){},Signalled:()=>false,ReleaseDefense:()=>released++},{});
 r.defenders=[actor];r.Guide({beat:11,startIndex:0,route:[{x:0,z:0},{x:0,z:8},{x:8,z:8}],speed:1});r.Update(.1);
 assert.equal(released,1,"casualty retrieval releases frontline defense");
 const index=r.guide.index;r.Guide({beat:12,route:[{x:8,z:8}],WaitAt:()=>true});
 assert.equal(r.guide.route.length,3);assert.equal(r.guide.index,index,"B12 retains unfinished physical safe route");
 assert.equal(r.guide.WaitAt(1),false);assert.equal(r.guide.WaitAt(2),true);
 assert.equal(r.Sample().guideAlive,true);assert.equal(r.Sample().guideHealth,1);
 actor.alive=false;assert.equal(r.Sample().guideAlive,false);
}
const runtime = new FirstLevelP012Runtime({
  GuideActor: () => guide, Position: (actor) => actor, Alive: (actor) => actor.alive,
  Firing: (actor) => actor.firing, Signalled: (name) => signals.has(name),
  Visible: (actor) => !!actor.visible,
  Move: (actor, point, speed) => moves.push({ point, speed }),
  TrafficActor: (side, slot, point) => ({ ...point, alive: true, side, slot }),
  SpawnEnemy: (spec) => { const actor = { ...spec, alive: true }; actors.push(actor); return actor; },
  WarnShell: (point) => ({ ...point }), ImpactShell: (point) => impacts.push(point),
}, {});
runtime.Guide({ route: [{ x: 0, z: 0 }, { x: 0, z: 8 }], speed: 0.9 });
runtime.Update(0.1); assert.equal(moves[0].speed, 0.9); assert.equal(actors.length, 0);
const near = runtime.SpawnEnemy({ p012Near: true }); near.alive = false;
assert.equal(runtime.Sample().nearEnemyDeaths, 1);
signals.add("P012SouthVerified"); for (let i = 0; i < 20; i++) runtime.Update(0.1);
assert.equal(runtime.far.length, 4); runtime.far[0].alive = false;
assert.equal(runtime.Sample().blockadeVisible, false, "alive outside LOS is not seen");
runtime.far[1].visible = true; assert.equal(runtime.Sample().blockadeVisible, true);
for (let i = 0; i < 20; i++) runtime.Update(0.1);
assert.equal(runtime.far.length, 4); assert.equal(runtime.Sample().nearEnemyDeaths, 1);
runtime.Shelling({ x: 3, z: 4 }); runtime.Update(1.5); assert.equal(impacts.length, 0);
runtime.Update(0.11); assert.equal(impacts.length, 1); assert.equal(runtime.Sample().mortarImpactCount, 1);
runtime.Update(10); assert.equal(impacts.length, 1);
runtime.Guide({ beat: 2, route: [{ x: 0, z: 0 }, { x: 0, z: 8 }, { x: 0, z: 16 }], speed: 1 });
assert.equal(runtime.traffic.length, 6); runtime.Update(0.1);
assert.equal(runtime.Sample().trafficReady, true);
assert.equal(runtime.traffic.filter((walker) => walker.side === 0).length, 3);
assert.equal(new Set(runtime.traffic.map(w=>`${w.parking.x},${w.parking.z}`)).size,6,"every walker has a separate terminal parking slot");
runtime.Guide({ beat: 2, route: [{ x: 0, z: 0 }], speed: 1 });
assert.equal(runtime.traffic.length, 6, "repeated Guide does not duplicate traffic");
{
 const walkers=[];
 const trafficRun=new FirstLevelP012Runtime({GuideActor:()=>null,Position:actor=>actor,Signalled:()=>false,
  TrafficActor:(side,slot,p)=>{const actor={...p,side,slot};walkers.push(actor);return actor;},
  ReleaseGuide:actor=>{if(actor)actor.released=true;},
  Move:(actor,p,speed)=>{const d=Math.hypot(p.x-actor.x,p.z-actor.z);if(d<=1.2)return;const k=Math.min(1,speed*0.1/d);actor.x+=(p.x-actor.x)*k;actor.z+=(p.z-actor.z)*k;}
 },{});
 trafficRun.Guide({beat:2,route:[{x:0,z:0},{x:0,z:15},{x:12,z:25}],speed:1});
 for(let frame=0;frame<1000;frame++){
  trafficRun.Update(0.1);
  for(let i=0;i<walkers.length;i++)for(let j=i+1;j<walkers.length;j++)assert.ok(Math.hypot(walkers[i].x-walkers[j].x,walkers[i].z-walkers[j].z)>1.2,"traffic bodies must never collapse onto one goal");
 }
 assert.ok(trafficRun.traffic.every(w=>w.arrived),"six walkers reach six separate parking places");
 trafficRun.Guide({beat:3,route:[],speed:1});trafficRun.Update(.1);
 assert.ok(trafficRun.traffic.filter(w=>w.side===0).every(w=>w.retired&&w.actor.released&&!w.actor.scriptedNoncombatant),"parked northbound soldiers return to normal AI after village beat");
 assert.ok(trafficRun.traffic.filter(w=>w.side===1).every(w=>!w.retired&&w.actor.scriptedNoncombatant),"southbound civilians remain noncombatants");
}
const ai = readFileSync(new URL("./Script_Ai.mjs", import.meta.url), "utf8");
assert.match(ai,/s\.scriptArrivalRadius\) : 1\.2/ ,"ordinary traffic retains production AI stopping radius");
assert.match(ai, /if \(Number\.isFinite\(s\.scriptMoveSpeedMps\)\) speed = Math\.min/);
const main = readFileSync(new URL("./Script_Main.mjs", import.meta.url), "utf8");
{
 const body=main.match(/EnemyStaging: \(soldier, staging\) => \{([\s\S]*?)\n    \},/)[1];
 const Stage=vm.runInNewContext(`(soldier,staging)=>{${body}}`),soldier={alive:true,health:38,ammo:2,target:{},targetVisible:true,cover:{},state:"fire"};
 Stage(soldier,true);assert.equal(soldier.scriptedNoncombatant,true);assert.equal(soldier.target,null);assert.equal(soldier.state,"advance");
 Stage(soldier,false);assert.equal(soldier.scriptedNoncombatant,false);assert.equal(soldier.health,38);assert.equal(soldier.ammo,2);
 soldier.alive=false;Stage(soldier,true);assert.equal(soldier.alive,false,"staging never resurrects an actor");
}
{
 const source=main.match(/function AirColumnEnteredRoad\(column, position\) \{[\s\S]*?\n\}/)[0];
 const Check=vm.runInNewContext(`(${source})`),members=Array.from({length:4},()=>({handle:{alive:true,position:{x:50,z:60}}}));
 const column={litters:[{front:members[0],rear:members[1]},{front:members[2],rear:members[3]}],HeadPosition:()=>({x:50,z:66})};
 assert.equal(Check(column,{x:54,z:57}),true);members[3].handle.position.z=59.99;assert.equal(Check(column,{x:54,z:57}),false);
 members[3].handle.position.z=60;members[3].handle.alive=false;assert.equal(Check(column,{x:54,z:57}),false);
 members[3].handle.alive=true;assert.equal(Check(column,{x:70,z:57}),false);
}
{
 const body=main.match(/ThreatensEscort: \(actor\) => \{([\s\S]*?)\n    \},/)[1];
 const Check=vm.runInNewContext(`actor=>{${body}}`,{player:{position:{x:0,z:0}},setpieces:null});
 assert.equal(Check({targetVisible:true,target:{isPlayer:true,position:{x:0,z:0}}}),true,"real visible target does not depend on player camera facing");
 assert.equal(Check({targetVisible:true,target:{ref:{side:"nra"},position:{x:40,z:0}}}),false,"unrelated distant firefight is not escort threat");
 assert.equal(Check({targetVisible:false,target:{isPlayer:true,position:{x:0,z:0}}}),false,"blocked LOS cannot trigger warning");
}
{
  const body = main.match(/GiveBandages: \(request\) => \{([\s\S]*?)\n    \},/)[1];
  const patient = { bandages: 0, health: 27, bleeding: 2.8 }, hints = [];
  const Give = vm.runInNewContext(`(request)=>{${body}}`, {player:patient,hud:{Hint:(text)=>hints.push(text)}});
  assert.equal(Give(1),1); assert.equal(patient.bandages,1);
  assert.equal(patient.health,27); assert.equal(patient.bleeding,2.8);
  assert.equal(Give(-1),0); assert.equal(Give(NaN),0); assert.equal(patient.bandages,1);
  assert.equal(hints.length,1); assert.match(hints[0],/按 B/);
}
assert.match(main,/if \(\(MENU_ON \|\| FIRST_LEVEL_P012_WHITEBOX\) && menuRoot\)/,"P012 shot mode still constructs the completion/retry menu");
assert.match(main,/state\.playerShots \+= 1;\s*p012Runtime\?\.RecordAircraftShot/ ,"aircraft reaction occurs only after successful ammunition consumption");
assert.doesNotMatch(main,/story\.fired\s*=\s*\[\.\.\.sample\.p012Story\.fired\]/,"P012 rewind must not shorten the live setpiece event ledger");
assert.match(main,/story\.P012Restore\?\.\(sample\.p012Story\.immediate\)/,"P012 immediate cue ledger is restored separately");
assert.match(main, /p012Flow && interact\?\.Query\(player\)\?\.point\?\.id === "p012_ammoDrop"/);
{
  const runs = [], emitted = [], moved = []; let rewinds = 0, aborted = 0, ready = false;
  const context = {
    phase: { whitebox: { p012: true } }, mem: { crowdTurnDone: 1, carryStartedAt: 1 },
    d: { host: { Story: () => ({ Signalled: (name) => name === "P012CarryReady" && ready }), MoveProp: (id, at) => moved.push({ id, ...at }) } },
    strafe: { StrafeRun: (spec) => runs.push(spec), Abort: () => aborted++ },
    carry: { ForceRelease() {} }, checkpoint: { Rewind: () => rewinds++ },
    Time: () => 30, PlayerPos: () => ({ x: 0, z: 0 }), Spoken: () => false,
    Signal: (name) => emitted.push(name), Hint() {},
  };
  SETPIECES.CH1_NanLu.Update(context, 0.1); assert.equal(runs.length, 0, "standing twenty seconds does not arm dive");
  ready = true; SETPIECES.CH1_NanLu.Update(context, 0.1); assert.equal(runs.length, 1);
  runs[0].OnPlayerHit(); assert.equal(rewinds, 1); assert.ok(!emitted.includes("P012Dived"));
  SETPIECES.CH1_NanLu.Update(context, 0.1); assert.equal(aborted, 1); assert.equal(runs.length, 2);
  context.mem.p012CarriedLitter = { propLitter: "litter", propBody: "body" };
  runs[1].OnDodge(); assert.ok(emitted.includes("P012Dived"));
  assert.ok(moved.some((entry) => entry.id === "litter" && entry.rotationZ > 1));
  const front = { role: "bearer", slot: { back: 0 }, handle: { alive: true, position: { x: 1.2, z: -0.9 } } };
  const rear = { role: "bearer", slot: { back: 2.2 }, handle: { alive: false } };
  const guard = { role: "guard", handle: { alive: true, position: { x: 20, z: 20 }, actor: { SetWeapon: (value) => { guard.hiddenWeapon = value === null; } } } };
  Object.assign(context.mem.p012CarriedLitter, { front, rear, dropped: true });
  context.mem.column = { Update() {}, Alive: [front, guard] };
  context.d.host.PositionOf = (actor) => actor.position;
  context.d.host.SetGoal = () => {};
  SETPIECES.CH1_NanLu.Update(context, 0.1);
  assert.equal(guard.handle.scriptedNoncombatant, true); assert.equal(guard.handle.unarmed, true);
  assert.equal(guard.handle.scriptEssential,true,"same surviving replacement is protected from incidental lethal fire");
  assert.equal(guard.hiddenWeapon, true); assert.ok(!context.mem.p012LitterRecovered, "remote guard cannot instantly recover litter");
  guard.handle.position = { x: 1.2, z: 0.9 };
  SETPIECES.CH1_NanLu.Update(context, 0.1); assert.equal(context.mem.p012LitterRecovered, true);
}
console.log("PASS P012 runtime finite actors, guide speed, shell warning, delivery input routing");
{
  let impact;
  const runtime = new FirstLevelP012Runtime({ GuideActor: () => null, Position: () => null,
    WarnShell: (point, damaging, callback) => { impact = callback; return { x: point.x + 1, z: point.z }; } }, {});
  runtime.Shelling({ x: 5, z: 6 }, true);
  assert.deepEqual(runtime.Sample().mortarWarningPosition, { x: 6, z: 6 });
  runtime.time = 20;
  assert.equal(runtime.Sample().mortarImpactCount, 0, "elapsed time alone cannot report a damaging impact");
  impact({ x: 6, z: 6 }); impact({ x: 6, z: 6 });
  assert.equal(runtime.Sample().mortarImpactCount, 1);
  assert.equal(runtime.Sample().mortarWarningActive, false);
  const combat = readFileSync(new URL("./Script_Combat.mjs", import.meta.url), "utf8");
  assert.match(combat, /this\.Blast\(shell\.at,[\s\S]*?shell\.OnImpact\?\.\(shell\.at\)/);
}
{
  const front = { handle: { alive: true, position: { x: 0, z: 0 } } };
  const rear = { handle: { alive: true, position: { x: 0, z: 10 } } };
  const column = { arrived: true, waypoints: [{ x: 0, z: 0 }], litters: [{ front, rear }] };
  assert.equal(LastLitterArrived(column), false, "front bearer alone cannot finish retreat");
  rear.handle.position.z = 1.5; assert.equal(LastLitterArrived(column), true);
  const runtime = new FirstLevelP012Runtime({ DeploySmoke: () => 1 }, {});
  assert.equal(runtime.DeployRetreatSmoke({ x: 0, z: 0 }), true);
  assert.equal(runtime.BlocksSight({ x: -10, y: 1, z: 0 }, { x: 10, y: 1, z: 0 }), true);
  assert.equal(runtime.BlocksSight({ x: -10, y: 1, z: 15 }, { x: 10, y: 1, z: 15 }), false);
  runtime.time = 126; assert.equal(runtime.BlocksSight({ x: -10, y: 1, z: 0 }, { x: 10, y: 1, z: 0 }), false);
}
{
  let dodges = 0, released = 0;
  const runtime = new FirstLevelP012Runtime({ Dodge: () => { dodges++; return true; }, ReleaseForDodge: () => released++ }, { anchors: { strafeSlots: [{ x: 2, z: 0 }] } });
  runtime.RecordDodgeIntent({ x: 0, z: 0 }, { player: { open: false } }, "stretcher"); assert.equal(released, 0);
  runtime.RecordDodgeIntent({ x: 0, z: 0 }, { player: { open: true } }, "stretcher"); assert.equal(released, 1); assert.equal(dodges, 0);
  assert.equal(runtime.TryDitchDodge({ x: 2, z: 0 }, "prone", { player: { open: false } }), false);
  assert.equal(runtime.TryDitchDodge({ x: 0, z: 0 }, "prone", { player: { open: true } }), false);
  assert.equal(runtime.TryDitchDodge({ x: 20, z: 0 }, "prone", { player: { open: true } }), false);
  assert.equal(runtime.TryDitchDodge({ x: 2, z: 0 }, "prone", { player: { open: true } }), true);
  assert.equal(dodges, 1);
}
{
  let time = 0, column; const actors = [];
  const host = { Time: () => time, PlayerPos: () => column.HeadPosition(),
    SpawnActor: ({ x, z }) => { const actor = { alive: true, position: { x, z }, goal: { x, z } }; actors.push(actor); return actor; },
    PositionOf: (actor) => actor.position, Alive: (actor) => actor.alive,
    SetGoal: (actor, x, z) => { actor.goal = { x, z }; },
  };
  column = new EscortColumn(host, { waypoints: P012Phase.whitebox.routes.retreat, followRouteBodies: true,
    tuning: { columnSpeedMS: P012Phase.whitebox.activities.retreatColumnSpeedMps }, members: [{ role: "bearer" }, { role: "bearer" }] });
  column.Start(); const finish = column.waypoints.at(-1);
  for (; time < 140; time += 0.1) {
    column.Update(0.1);
    for (const actor of actors) { const dx = actor.goal.x - actor.position.x, dz = actor.goal.z - actor.position.z, distance = Math.hypot(dx, dz);
      if (distance > 1.2) { const step = Math.min(distance - 1.2, actor.scriptMoveSpeedMps * 0.1); actor.position.x += dx / distance * step; actor.position.z += dz / distance * step; } }
    if (column.arrived && Math.hypot(actors[0].position.x - finish.x, actors[0].position.z - finish.z) < 8) break;
  }
  assert.ok(time >= 90 && time <= 120, `physical column retreat ${time.toFixed(1)}s`);
  assert.ok(Math.abs(column.members[0].slot.lateral) < 0.5);
  console.log(`PASS P012 physical body retreat ${time.toFixed(1)}s without teleport`);
}
