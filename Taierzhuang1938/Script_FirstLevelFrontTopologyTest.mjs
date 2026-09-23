// 第一关 01–06 空间门禁（纯 Node）。2026-09-23 空间重排：docs/Data_FirstLevelSpace0106_20260923.md。
// 量尺在 Script_FirstLevelSpaceProbe（共享地面采样器 + 体块 + 场景态 + 铁丝网包络）；这里只钉阈值。
// 关键帧 K1–K11 的「看得见 / 看不见」、战车路（净空、hull-down、路弯遮挡、先压阵位再封口、稳定射界、
// 坎线以北、侧后攻击位、路障）、路线胶囊净空、暴露节奏、每个敌人初始有掩体、预算、视线外入口、
// 取弹沟不连通背坡、01 进场通道 30 m 规则，以及 03–06 既有的撤退/夺点/分批判定。
import assert from "node:assert/strict";
import {BatchRecovered,AssaultWindow,FrontEntryRoute} from "./Script_FirstLevelFrontBattle.mjs";
import {MISSION_STAGES} from "./Data_FirstLevelMission.mjs";
import {MISSION_ROUTES as R} from "./Data_FirstLevelMissionLayout.mjs";
import {MISSION_STAGE_ROUTES as SR} from "./Data_FirstLevelMissionTopology.mjs";
import {FRONT_SORTIE as S,FRONT_SPACE as SP,FRONT_TANK_PATH as TP,FrontTankIndex} from "./Data_FirstLevelFrontRoute.mjs";
import {FRONT_BATTLE_TUNING as B} from "./Data_Tuning_FirstLevelFront.mjs";
import {FRONT_BREAKABLES,FRONT_UNBREAKABLE} from "./Data_FirstLevelFrontBreakables.mjs";
import {MISSION_LAYOUT as L} from "./Data_FirstLevelMissionLayout.mjs";
import {SampleMissionTerrain as G,SampleMissionNaturalHeight as N} from "./Data_FirstLevelMissionTerrain.mjs";
import {ProbeKeyframes,ProbeTank,ProbeRoutes,ProbeExposure,ProbeEnemyCover,ProbeCounts,ProbeEntries,ProbeSeparation,
  ProbeEngagement,RouteClearance,Sight,Eye,D,RouteLength,ProbeWireLanes} from "./Script_FirstLevelSpaceProbe.mjs";

// ---------------------------------------------------------------- K1–K11 (+K1i/K2b)
const keyframes=ProbeKeyframes();
for(const k of keyframes){
  for(const r of k.rows)assert.ok(r.pass,`${k.id} ${k.label}: ${r.name} ${r.mustHide?"must be hidden":"must be seen"} (${r.vis}/${r.of}, ${r.blockers.join("|")||"clear"})`);
  if(k.frameDeg)assert.ok(k.spanDeg<=k.frameDeg,`${k.id} fits one frame: ${k.spanDeg} deg > ${k.frameDeg}`);
}
assert.deepEqual(["K1","K2","K3","K4","K5","K6","K7","K8","K9","K10","K11"].filter(id=>!keyframes.some(k=>k.id===id)),[],"all eleven contract keyframes are measured");
console.log("ok keyframes "+keyframes.map(k=>`${k.id}${k.frameDeg?`(${k.spanDeg}deg)`:""}`).join(" "));

// ---------------------------------------------------------------- tank path
{
  const kinds=new Set(TP.map(w=>w.kind));
  for(const kind of ["cruise","hullDown","firePoint","block","squeeze"])assert.ok(kinds.has(kind),`tank path has a ${kind} waypoint`);
  for(const w of TP)for(const key of ["faceTo","turretTo"])if(w[key])assert.ok(SP.tankTargets[w[key]],`${w.id}.${key} names a FRONT_SPACE.tankTargets entry`);
  assert.equal(new Set(TP.map(w=>w.id)).size,TP.length,"tank waypoint ids are unique");
  // Old keys keep their meaning and resolve by id (integration decision: never renumber by hand).
  assert.equal(S.tankPreviewIndex,FrontTankIndex("HullDown"));assert.equal(S.tankPressureIndex,FrontTankIndex("Pressure"));
  assert.equal(S.tankBlockIndex,FrontTankIndex("Block"));assert.equal(S.tankEndIndex,FrontTankIndex("Squeeze"));
  assert.equal(TP[S.tankPreviewIndex].kind,"hullDown");assert.equal(TP[S.tankPressureIndex].kind,"firePoint");
  assert.equal(TP[S.tankBlockIndex].kind,"block");assert.equal(TP[S.tankEndIndex].kind,"squeeze");
  assert.ok(S.tankPressureIndex<S.tankBlockIndex,"the tank presses the nest before it seals the gap");
  assert.deepEqual(S.road.slice(0,TP.length),TP.map(w=>({x:w.x,z:w.z})),"the terrain road is the tank path");
  const t=ProbeTank();
  assert.deepEqual(t.footprintHits,[],"the 5.75 x 2.18 m hull never touches a block or a wire belt");
  assert.ok(t.maxPitchDeg<=8,`the road is drivable: ${t.maxPitchDeg} deg`);
  const wp=Object.fromEntries(t.waypoints.map(w=>[w.id,w]));
  assert.ok(!wp.Start.turretSeen&&!wp.Start.hullSeen,"the tank starts out of sight of the nest seat");
  assert.ok(wp.HullDown.turretSeen&&!wp.HullDown.hullSeen,"HullDown shows the turret only");
  assert.ok(!wp.Bend.turretSeen,"the bend is behind NorthRuin");
  assert.ok(wp.BendExit.hullSeen&&wp.Pressure.hullSeen,"the tank comes out of the bend in full view");
  const hidden=t.turretTransitions.find(x=>!x.seen),back=t.turretTransitions.find(x=>x.seen&&x.s>(hidden?.s??0));
  assert.ok(hidden&&back&&back.s-hidden.s>=20,`the ruin hides the tank for a real stretch of road: ${JSON.stringify(t.turretTransitions)}`);
  assert.equal(t.gapLast21m.seen,t.gapLast21m.n,"the gun holds the gap over the last 21 m of the path (a stable lane, not one edge)");
  assert.ok(t.gapGridBlock.ok>=6&&t.gapGridSqueeze.ok>=6,`Block/Squeeze see the gap over ±1 m x 4 heights: ${t.gapGridBlock.ok}/${t.gapGridSqueeze.ok} of 12`);
  assert.ok(t.blockNorthOfCrestM>=5&&t.squeezeNorthOfCrestM>=5,"the tank stops north of the berm line, never in our depth");
  assert.ok(t.pressureSeesSeat,"from the pressure point the gun reaches the nest seat");
  for(const [id,d] of Object.entries(t.denies)){
    for(const key of ["rearJunctionStanding","safeZone","lastCoverCrouched","throwCrouched","damagedLipCrouched"])
      assert.equal(d[key],false,`${id}: the gun must not see ${key}`);
    assert.ok(d.seat,`${id}: the gun still covers the nest seat`);
  }
  assert.ok(t.denies.Block.damagedLipStanding,"standing up at the damaged lip shows you to the tank (K8 is a choice)");
  assert.ok(t.throwRelDeg>=90,`the attack position is behind the hull's beam: ${t.throwRelDeg} deg off the nose`);
  assert.equal(t.tailHullMg.inArc,0,"hull MG (±26 deg on the gap) does not reach the attack tail: that is the turret's job");
  assert.ok(t.tailTurret.Block>=t.tailTurret.n/2&&t.tailTurret.Squeeze>=t.tailTurret.n/2,
    `the turret MG covers the attack branch's last 4.7 m (risk window): ${JSON.stringify(t.tailTurret)}`);
  assert.ok(t.roadblock.length===2&&t.roadblock.every(b=>b.roadDistM<=3),"the cart and the felled pole sit across the south road");
  assert.ok(t.roadblockCraterDepth>=1,"the roadblock crater cuts the south road");
  console.log(`ok tank path ${t.lengthM} m: hidden start, hull-down at ${wp.HullDown.seatDist} m, ruin hides ${back.s-hidden.s} m, `
    +`gap lane ${t.gapLast21m.seen}/${t.gapLast21m.n}, block ${t.blockNorthOfCrestM} m north of the crest, rear quarter ${t.throwRelDeg} deg`);
}

// ---------------------------------------------------------------- routes (players, NPCs, enemies)
{
  const routes=ProbeRoutes();
  for(const [name,r] of Object.entries(routes)){
    assert.deepEqual(r.hits,[],`${name}: capsule clearance`);
    assert.deepEqual(r.slopes,[],`${name}: climbable (52 deg)`);
  }
  const retreat=RouteLength(SR.rearTrench);
  assert.ok(retreat>=40&&retreat<=60,`02 retreat is 40-60 m (contract §4): ${retreat.toFixed(1)}`);
  assert.ok(D(SR.rearTrench.at(-1),R.support[0])<1,"02 ends at the casualty collection (06 same place)");
  // No single straight leg of the 03 approach runs longer than 10 m.
  const longest=Math.max(...S.approach.slice(1).map((p,i)=>D(p,S.approach[i])));
  assert.ok(longest<=10,`03 approach legs stay short (cover rhythm): ${longest.toFixed(1)} m`);
  console.log(`ok ${Object.keys(routes).length} routes clear a 0.35 m capsule and climb under 52 deg; 02 retreat ${retreat.toFixed(1)} m`);
}

// ---------------------------------------------------------------- exposure rhythm
{
  const e=ProbeExposure();
  assert.equal(e.support03.crouchedExposed,0,"03 support sap: crouched is covered from every threat");
  assert.ok(e.rightTrenchVsNest.longestCrouchedRunM<=4,`03 right low trench: the nest can see a crouched man for at most 4 m running: ${e.rightTrenchVsNest.longestCrouchedRunM}`);
  assert.ok(e.fireSteps[0].standingSees.filter(id=>id.endsWith("@last")).length>=3,"fire step 0 engages the flank group's last line");
  assert.ok(e.fireSteps[1].standingSees.includes("RightNestGunner"),"fire step 1 engages the nest gunner over the low west wall");
  assert.ok(e.fireSteps.every(f=>f.crouchedSeen.length===0),"crouched on a fire step nobody in the nest sees you");
  assert.equal(e.retreat02FromFold.sswLegStandingExposed,0,"02: the fold F cannot shoot down the intact south-south-west leg");
  assert.ok(/[CS]/.test(e.retreat02FromFold.profile.slice(0,10)),"02: the low-wall stretch right after the return spot is briefly exposed to the fold");
  assert.ok(e.retreat02.longestCrouchedRunM<=5,`02 retreat exposure is short: ${e.retreat02.longestCrouchedRunM} m`);
  assert.ok(e.attackTail4m.exposed>=e.attackTail4m.samples/2,`05 attack branch: its last 4 m are a real risk window: ${e.attackTail4m.exposed}/${e.attackTail4m.samples}`);
  assert.ok(e.attack05.longestCrouchedRunM<=4,`05 attack branch before the tail keeps cover beats: ${e.attack05.longestCrouchedRunM} m`);
  assert.ok(e.rearRoute04.longestCrouchedRunM<=8,`04 short withdrawal exposure: ${e.rearRoute04.longestCrouchedRunM} m`);
  console.log(`ok exposure: 03 sap 0 m, right trench ${e.rightTrenchVsNest.longestCrouchedRunM} m, 02 ${e.retreat02.longestCrouchedRunM} m, 05 tail ${e.attackTail4m.exposed}/${e.attackTail4m.samples}`);
}

// ---------------------------------------------------------------- lanes the runtime raycasts (wire stakes/strands are ray colliders)
{
  const lanes=ProbeWireLanes();
  for(const l of lanes)assert.equal(l.blocker,null,`${l.name}: clear of every block, terrain and wire roll (blocked by ${l.blocker})`);
  console.log(`ok runtime gap lanes clear of wire: ${lanes.length}`);
}

// ---------------------------------------------------------------- enemies: cover, roles, budget, hidden entries
{
  const c=ProbeEnemyCover();
  assert.deepEqual(c.uncovered,[],"every enemy start (and every bound's last line) has real cover or is dug in");
  for(const f of c.flankGap){
    assert.ok(f.seesGap,`${f.id}'s last line sees the gap`);
    assert.ok(f.dist>=15&&f.dist<=35,`${f.id} last line is 15-35 m from the gap: ${f.dist}`);
    assert.ok(f.seatDist>=9,`${f.id} last line leaves the captured gun room to fire: ${f.seatDist}`);
  }
  for(const g of c.nestFaces){
    assert.equal(g.onApproach,false,`${g.id} guards the nest, not the player's approach trench`);
    assert.ok(g.faceBearing!==null,`${g.id} has an authored facing`);
  }
  for(const row of c.rows)assert.ok(row.role,`${row.group}/${row.id} carries a role`);
  const n=ProbeCounts();
  assert.ok(n.cumulative<=55,`01-05 cumulative enemies <= 55: ${n.cumulative}`);
  assert.ok(n.alive04<=30&&n.alive05<=30,`03-05 worst-case alive <= 30: ${n.alive04}/${n.alive05}`);
  for(const e of ProbeEntries()){
    const seen=e.rows.filter(r=>r.visible&&r.dist<60);
    assert.deepEqual(seen.map(r=>`${r.from}@${r.dist}`),[],`${e.id} enters out of sight (>= 60 m or hidden)`);
    if(/^MachineGunAttack|^waveCentre|^NorthWestPlateau/.test(e.id))
      assert.deepEqual(e.rows.filter(r=>r.visible).map(r=>r.from),[],`${e.id} is inside the jump-off trench, hidden from every friendly post`);
  }
  console.log(`ok enemies: ${c.rows.length} starts covered, flank last line sees the gap, cumulative ${n.cumulative}, alive ${n.alive04}/${n.alive05}`);
}

// ---------------------------------------------------------------- separation, 01 corridor, flood fill, engagement
{
  const s=ProbeSeparation();
  assert.ok(s.ammoVsBackslopeM>=30,`the ammo sap stays far from the backslope: ${s.ammoVsBackslopeM}`);
  assert.ok(s.ammoVsRightTrenchM>=8,`the ammo sap and the approach trench are separate: ${s.ammoVsRightTrenchM}`);
  assert.ok(s.corridor01.minFriendlyM>=30&&s.corridor01.mutualWithin30.length===0,
    `01 break-in corridor is >= 30 m from the firing line and unseen: ${JSON.stringify(s.corridor01)}`);
  for(const [key,value] of Object.entries(s.backslopeFlood))if(key.startsWith("reaches"))
    assert.equal(value,false,`without the gap the backslope must not connect: ${key}`);
  const g=ProbeEngagement();
  assert.ok(g.in15to60/g.n>=0.5,`the main engagement band is 15-60 m: ${g.in15to60}/${g.n} ${JSON.stringify(g.bands)}`);
  console.log(`ok separation: ammo/backslope ${s.ammoVsBackslopeM} m, 01 corridor ${s.corridor01.minFriendlyM} m unseen, engagement bands ${JSON.stringify(g.bands)}`);
}

// ---------------------------------------------------------------- breakable cover (data for the Tank package mechanism)
{
  const Block=id=>L.blocks.find(b=>b.id===id);
  for(const id of FRONT_UNBREAKABLE)assert.ok(Block(id),"unbreakable "+id+" exists");
  for(const b of FRONT_BREAKABLES){
    assert.ok(b.hits>=1&&b.stages.length===b.hits,b.id+": one stage per hit");
    if(b.block){
      const block=Block(b.block);assert.ok(block,b.id+" names a real block "+b.block);
      assert.ok(!FRONT_UNBREAKABLE.includes(b.block),b.id+" is not on the unbreakable list");
      let top=block.y+block.h/2-G(block.x,block.z);
      for(const stage of b.stages){assert.ok(stage.topM<top,b.id+" goes down a stage at a time");top=stage.topM;}
    } else {
      let depth=N(b.terrain.x,b.terrain.z)-G(b.terrain.x,b.terrain.z);
      for(const stage of b.stages){assert.ok(stage.depthM<depth,b.id+" gets shallower a stage at a time");depth=stage.depthM;}
    }
  }
  for(const id of ["RightNestRearWest","RightNestRearEast","GapLastCover","RoadsideRuin"])assert.ok(FRONT_UNBREAKABLE.includes(id),id+" never breaks");
  assert.equal(FRONT_BREAKABLES.filter(b=>/^RightNest/.test(b.block||"")).length,3,"three nest front parapet sections break");
  assert.ok(FRONT_BREAKABLES.find(b=>b.block==="NorthRuinGable")?.visualOnly,"the bend occluder only changes its look");
  console.log("ok breakables: "+FRONT_BREAKABLES.map(b=>b.id).join(",")+"; "+FRONT_UNBREAKABLE.length+" never break");
}

// ---------------------------------------------------------------- 03–06 entry, capture and batch logic
{
  // 02 ends at the collection; the companions pick up the 03 route from wherever they stand on the rear trench.
  for(const [name,start] of Object.entries({rearCorner:{x:-4.2,z:-113.6},rearTrench:{x:-16.5,z:-111.3},supportJunction:{x:-28.6,z:-110.2}})){
    const entry=FrontEntryRoute(start,R.support);
    assert.ok(entry.some(p=>p.x===SP.supportJunction.x&&p.z===SP.supportJunction.z),name+" goes through the support junction");
    const c=RouteClearance([start,...entry],{state:"BunkerCollapsed",descendOnly:true});
    assert.deepEqual(c.hits,[],name+" entry capsule clearance");assert.deepEqual(c.slopes,[],name+" entry climbable");
  }
  const initialized=FrontEntryRoute(R.support[0],R.support);
  assert.deepEqual(initialized.map(({x,z})=>({x,z})),R.support,"03 initialization at collection never retraces the rear exit");
  const advanced=FrontEntryRoute(R.support[1],R.support);
  assert.deepEqual(advanced.map(({x,z})=>({x,z})),R.support.slice(1),"an advanced companion keeps its actual route progress");
  const see=(a,ah,b,bh)=>Sight(Eye(a,ah),Eye(b,bh))===null;
  assert.ok(see(S.seat,1.65,S.gap,1.2),"captured position can see the rescued men cross the breach");
  assert.ok(see(S.nest,1.45,S.gap,1.2),"the right gun actually controls the breach before capture");
  assert.ok(D(S.leaderCover,S.seat)-B.arrivalM-.4>=1.5,"leader cover stays separate from the player seat even with arrival and cover allowances");
  assert.ok(D(S.leaderCover,S.nest)+B.arrivalM<=B.captureRadiusM,"arriving at the separate leader post still completes physical capture");
  assert.ok(see(S.leaderCover,1.2,S.gap,1.2),"the crouching leader retains a real firing lane to the breach");
  const lead=RouteClearance([...R.support.slice(0,-1),S.leaderCover]);
  assert.deepEqual([...lead.hits,...lead.slopes],[],"the leader's capture leg reaches his post");
  assert.deepEqual(R.bundleReturn,[...R.bundle].reverse(),"return is the same branch");
  assert.deepEqual(S.attackRoute[0],S.rear);assert.deepEqual(S.route[0],S.rear);
  // Old ammo yard: south-east of the nest behind the line, west of the (blocked) south road, entered from its back door.
  assert.ok(S.house.z>S.rear.z+20&&S.house.x>S.seat.x,"ammo house is south-east of the nest, on our side");
  assert.ok(S.house.x<Math.min(...SP.southRoad.map(p=>p.x)),"ammo house stays west of the road");
  assert.ok(S.route.at(-1).x<S.house.x,"the ammo route ends at the house's west (back) door");
  assert.notDeepEqual(S.throw,S.seat,"throw does not return to MG seat");
  assert.ok(D(S.throw,S.house)>20&&D(S.throw,S.seat)>10,"attack position, ammo house and firing seat are three different places");
  const guard=(alive,safe,progress=4)=>({actor:{alive},safe,progress,route:Array(4)});
  assert.equal(BatchRecovered([]),false);assert.equal(BatchRecovered([guard(false,true)]),false);
  assert.equal(BatchRecovered([guard(true,false)]),false,'running is not recovered');
  assert.equal(BatchRecovered([guard(true,true,3)]),false,'a flag cannot replace completed travel');
  assert.equal(BatchRecovered([guard(true,true),guard(false,false)]),true,'surviving batch reaches safety');
  const assault=[{alive:false},{alive:false},{alive:false},{alive:true},{alive:true}];
  assert.equal(AssaultWindow(assault,true,false),true,'finite threshold does not require battlefield wipe');
  assert.equal(AssaultWindow(assault,true,true),false,'direct fire still closes the window');
  assert.equal(AssaultWindow(assault,false,false),false,'capture is required');
  const requirements=id=>MISSION_STAGES.find(s=>s.id===id).requirements;
  for(const fact of ['tankImmobilized','tankFireDisabled','attackRetreated','lastGuardsWithdrawn','reliefInPosition','collectionReturned'])assert.ok(requirements('Tank').includes(fact));
  assert.ok(requirements('MachineGun').includes('rightRearReached'));assert.ok(requirements('Support').includes('rifleWithdrawalResolved'));
}
console.log("ok 01–06 space: keyframes, tank lane, routes, exposure rhythm, covered starts, hidden entries, separation and 03–06 gates");
