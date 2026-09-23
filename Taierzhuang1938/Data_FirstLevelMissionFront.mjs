import { MISSION_TUNING as FIRST_LEVEL_TUNING } from "./Data_Tuning_FirstLevel.mjs";
import { MISSION_TRAIN } from "./Data_FirstLevelMissionTrain.mjs";
import { FRONT_SORTIE as Sortie, FRONT_SPACE as Space, FRONT_TANK_PATH } from "./Data_FirstLevelFrontRoute.mjs";
import { OPENING } from "./Data_FirstLevelOpening.mjs";
// Authored squads and persistent aftermath. Historical dead do not affect live combat counts.
// 2026-09-09: the Center squad's fifth man moved 12,-188 -> 12,-190. At -188 he was inside the
// one-metre slack of the first bound line, so he skipped it and rushed straight through the Bank
// cover row behind it; two metres further north he bounds at -187 with the rest of the wave.
export const FRONT_SECTIONS = Object.freeze([
  {id:"West",points:[[-49,-169],[-53,-177],[-42,-182],[-64,-175],[-38,-174],[-61,-172]]},
  {id:"Center",points:[[-16,-187],[-24,-195],[-5,-190],[4,-197],[12,-190],[-35,-185]]},
  {id:"East",points:[[47,-165],[54,-176],[44,-184],[61,-185],[56,-157],[68,-173]]},
]);
// One light machine gun per section stays as a fire base (hold); every rifleman bounds forward (FrontAssaultLane).
export const FRONT_REINFORCEMENTS=FRONT_SECTIONS.flatMap((section,group)=>section.points.map(([x,z],i)=>({
  id:"Front"+section.id+i,x,z,weapon:i===1?"Type11":"Type38",hold:i===1,
})));
// ---------------------------------------------------------------------------
// Front cover rows and rush corridors (2026-09-09, docs/Data_FrontCover.md)
// ---------------------------------------------------------------------------
// The bound lines used to run across bare field. Live capture 20 s into Support: of the 31 alive
// Japanese in the 46-74 m band only **2** had a cover point inside `assaultCoverSearchM` (9 m),
// so the rest knelt in the open and the far half of the front read as idle.
//
// `columns` are the x spans that carry cover; the gaps between them are the rush corridors.
// Every column gets a broken field bank / grave mound / wall stub on each row (built in
// `Data_FirstLevelMissionLayout`), 1.6-2.5 m **south** of its line - south is between the man and
// the Chinese line, which is the only side `AiCover.Query` accepts (betweenSlackM).
//
// Why columns and not one long bank: the AI has no vault on the rush path, so a bank that crosses
// a lane is a wall. A rush between two bounds moves at most `2 x lateralM` (4.8 m) in x, so a
// column at least `minColumnM` (4.9 m) wide can never be straddled - `ClearLaneX` pushes a man to
// one side of it and every later bound of his lands on that same side.
// `blockedX` is derived from `columns`, so the cover and the lane rule cannot drift apart.
export const FRONT_COVER=Object.freeze({
  /** Cover point spacing inside a column. > COVER.minAllySpacingM (2.0) so a squad line can hold
   *  neighbouring points without the ally-spacing penalty pushing one of them back into the open. */
  pitchM:2.1,
  /** Block edge to column edge. A lane pushed 0.6 m clear of the column then keeps 1.15 m to the
   *  nearest block face, well past the 0.35 m capsule margin the route check uses. */
  insetM:.55,
  minColumnM:4.9,
  /** Heights sit between TRAVERSAL.stepMax (0.55, walked straight over) and COVER.tallM (1.55,
   *  hides a standing man): a kneeling man is covered, a standing one is not, which is exactly the
   *  "crouch to hide, kneel up to fire" band. d stays 0.6 like every other authored cover wall -
   *  COVER.standoffM (0.65) is measured from the registered point, i.e. the block centre. */
  rows:Object.freeze([
    // 2026-09-23 proposal A: everything 6 m north with the berm (crest z=-160); the last row sits
    // 1 m north of the berm's north foot, 4.5 m short of the crest.
    // Bank/Mound sit on the rising ground: taller so a man kneeling uphill of them is still covered.
    Object.freeze({id:"Bank", line:-193,   z:-191.2, w:1.5, h:1.35, d:.6}),
    Object.freeze({id:"Mound",line:-181.5, z:-179.3, w:1.6, h:1.15, d:.6}),
    Object.freeze({id:"Ridge",line:-173,   z:-171,   w:1.5, h:.94,  d:.6}),
    Object.freeze({id:"Stub", line:-166.5, z:-164.6, w:1.7, h:1.08, d:.6}),
  ]),
  columns:Object.freeze([
    // NorthFarm stands on the Bank row here, so only the three southern rows are built.
    Object.freeze({id:"WestFarm",  x:Object.freeze([-60.5,-42.5]),rows:Object.freeze(["Ridge","Stub"])}),
    Object.freeze({id:"WestGrave", x:Object.freeze([-40.5,-33.5]),rows:null}),
    // FieldRuin0 already fills the western half of this column's Ridge row.
    Object.freeze({id:"Ruin",      x:Object.freeze([-31.5,-16.9]),rows:null}),
    Object.freeze({id:"CenterWest",x:Object.freeze([-12.5,-7]),   rows:null}),
    Object.freeze({id:"Center",    x:Object.freeze([-2.6,2.6]),   rows:null}),
    Object.freeze({id:"CenterEast",x:Object.freeze([7.3,12.8]),   rows:null}),
    // FieldRuin1 already fills the eastern half of this column's Stub row.
    // The East column's two southern rows would stand in the flank group's lane and in the tank's
    // sight lane past the berm's east end; the berm-end craters and FieldRuin1 replace them.
    Object.freeze({id:"East",      x:Object.freeze([17.4,28.9]),  rows:Object.freeze(["Bank","Mound"])}),
    // FarEast / NorthRuin columns are gone: x 30..70 is the tank road, its escorts and the flank
    // group's approach (docs/Data_FirstLevelLayoutProposalA.md §4).
  ]),
});
// The corridor left open between East and FarEast carries the field road (x 33-37 across these
// rows) and the tank's advance from tankStart (36,-173) down to tankFirstFireZ; no cover goes in
// it on any row. The other corridors are the infantry lanes.
// The second front wave and the two support gunners, authored here rather than beside the
// encounter table: the cover rows and the bounding lanes are both derived from **every** man who
// starts on this field, and a roster split across two files drifts. `Data_FirstLevelMission`
// spreads this straight into MISSION_ENCOUNTERS.front.
export const FRONT_RIFLEMEN=Object.freeze([
  // Fire base (火力基地): holds on the rising ground 34-40 m north of the berm, behind the
  // FireBaseRuin* walls, never bounds. Suppresses the crest; after 03 capture, the nest.
  {id:"FrontGunner",x:10,z:-193.8,weapon:"Type11",hold:true,role:"fireBase"},
  {id:"FrontSupportGunner",x:-24,z:-193.8,weapon:"Type11",hold:true,role:"fireBase"},
  {id:"FrontRifleG",x:-9.8,z:-193.8,hold:true,role:"fireBase"},
  {id:"FrontRifleH",x:23,z:-193.8,hold:true,role:"fireBase"},
  // Bounding group (跃进组): two teams of three, crater to crater down the corridors between
  // the cover columns, last line 6.5 m short of the crest (under Zhou's enfilade).
  // They start on the first bound line (z -193.4), kneeling behind the Bank row, and bound three times.
  {id:"FrontRifleA",x:-34.9,z:-192.6,role:"bound"},{id:"FrontRifleB",x:-29.4,z:-192.6,role:"bound"},
  {id:"FrontRifleC",x:-18.9,z:-192.6,role:"bound"},{id:"FrontRifleD",x:-3.6,z:-192.6,role:"bound"},
  {id:"FrontRifleE",x:3.6,z:-192.6,role:"bound"},{id:"FrontRifleF",x:18.9,z:-192.6,role:"bound"},
]);
/** Every man the front stages put on this field. The cover rows never build on one of these
 *  firing positions - a bank standing on a man is a man standing in a bank. */
// The approach sections cover the communication trench;
// the remaining twelve enter the front battle when the player reaches its last bend.
export const FRONT_FIELD_MEN=Object.freeze([...FRONT_RIFLEMEN]);
// Five platoons spread behind the first line. Every man is spawned at Support entry;
// release delays change movement, never the simultaneous population or damage rules.
export const FRONT_RESERVES=Object.freeze(Array.from({length:FIRST_LEVEL_TUNING.frontReserveCount},(_,i)=>({
  id:`FrontReserve${i}`,x:-39+(i%11)*7.6,z:-207-Math.floor(i/11)*4.2,
  weapon:i%FIRST_LEVEL_TUNING.frontReservePlatoonSize===0?"Type11":"Type38",
  reserve:true,releaseDelayS:Math.floor(i/FIRST_LEVEL_TUNING.frontReservePlatoonSize)*FIRST_LEVEL_TUNING.frontReserveReleaseGapS,
})));
// Supporting rows advance without crossing the first assault bank or collapsing their depth.
export const FrontReserveLane=(x,z)=>[{x,z:z+FIRST_LEVEL_TUNING.frontReserveAdvanceM}];
// Bounding assault geometry (2026-09-08). Lines are bound positions north of the traverse trench
// (z=-124; withdrawal posts at -142..-148); each sits 1.6-2.5 m behind a cover row so kneeling
// there never intersects it. blockedX are the cover columns a straight rush between lines would
// cut through; lanes are pushed out of them (the AI has no vault on the rush path).
// waveCentersX are the rotating squad drop points on the northern edge for reinforcement waves.
export const FRONT_ASSAULT=Object.freeze({
  lines:[-193,-181.5,-173,-166.5],
  xRange:[-63,28],
  blockedX:FRONT_COVER.columns.map(column=>column.x),
  lateralM:2.4,
  // Replacement waves and the 04 push start in the two exit saps of the north jump-off trench
  // (FRONT_SPACE.jumpOff): 20 m behind the north crest, 1.9 m deep, out of sight of Zhou's gun, the
  // observation step, the backslope and the nest seat. Rows at -219/-221.5 stay inside the exit
  // saps; the saps ramp up at the crest, so every bound leaves them on foot.
  spawnZ:-219,
  waveCentersX:[-36,-14,-36,-14,-36,-14],
});
// A separate finite attack enters only at the machine-gun handover. Rifle-stage
// casualties cannot spend it early; its starts share the validated reinforcement lanes.
export const FRONT_MACHINE_GUN_ATTACK=Object.freeze(FRONT_ASSAULT.waveCentersX.slice(0,2).flatMap((cx,squad)=>
  Array.from({length:2},(_,i)=>Object.freeze({id:`MachineGunAttack${squad}_${i}`,team:`Gun${squad}`,
    x:cx+((i%3)-1)*3.2+(i>=3?1.6:0),z:FRONT_ASSAULT.spawnZ-(i>=3?2.5:0),
    weapon:i===0?"Type11":"Type38",bayonet:true,role:"push"}))));
const LaneRandom=(x,z)=>{let s=(Math.round(x*7+z*13)*2654435761)>>>0;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};};
// Push a lane point out of a blocked column, always towards the side the lane's base x is on:
// consecutive bounds pushed to opposite sides would rush straight through the cover between them.
// A column that runs past the end of xRange is the one exception - clamping the push back inside
// would drop the man into the column he was just pushed out of, so he leaves on the other side.
// That flip depends only on the column, not on the jitter, so all of his bounds still agree.
// Exported for the runtime's lateral bound shift (docs/Data_EnemyAi.md §15): a man who has held the last
// line long enough sidesteps 3-6 m along it instead of standing there for eleven seconds, and that new x
// has to obey the same cover-column rule as the authored lanes. One rule, one place.
export const ClearLaneX=(x,baseX)=>{
  const [minX,maxX]=FRONT_ASSAULT.xRange;
  x=Math.max(minX,Math.min(maxX,x));
  for(const [a,b] of FRONT_ASSAULT.blockedX){
    if(x<=a||x>=b)continue;
    const west=baseX<=(a+b)/2,out=west?a-.6:b+.6;
    x=out<minX||out>maxX?(west?b+.6:a-.6):out;
  }
  return Math.max(minX,Math.min(maxX,x));
};
/** Bound points for a rifleman starting at (x,z): every line still south of him, laterally jittered but out of cover columns. Deterministic in (x,z). */
export function FrontAssaultLane(x,z){
  const Random=LaneRandom(x,z),points=[];
  for(const line of FRONT_ASSAULT.lines){
    if(line<=z+1)continue;
    points.push({x:ClearLaneX(x+(Random()*2-1)*FRONT_ASSAULT.lateralM,x),z:line});
  }
  // Men already south of the last line keep their authored cover position (no lane).
  return points;
}
/** Every point a bounding lane can start from: the authored front riflemen plus the rotating wave
 *  drop points on the northern edge. `Data_FirstLevelMissionLayout` keeps the cover rows out of
 *  these lanes with it and `Script_FirstLevelMissionTest` walks them; `Script_FirstLevelMissionRuntime`
 *  spawns each wave from the same formula. One list, so the three cannot drift apart. */
export const FRONT_ASSAULT_STARTS=Object.freeze([
  ...FRONT_MACHINE_GUN_ATTACK,
  ...FRONT_FIELD_MEN.filter(spec=>!spec.hold).map(({id,x,z})=>Object.freeze({id,x,z})),
  ...FRONT_ASSAULT.waveCentersX.flatMap((cx,squad)=>Array.from({length:FIRST_LEVEL_TUNING.waveSquadSize},(_,i)=>
    Object.freeze({id:`Wave${squad}_${i}`,x:cx+((i%3)-1)*3.2+(i>=3?1.6:0),z:FRONT_ASSAULT.spawnZ-(i>=3?2.5:0)}))),
].filter(start=>FrontAssaultLane(start.x,start.z).length));
/** Does the straight bounding lane from `start` pass through the footprint of this cover block?
 *  Same capsule slack the route check in `Script_FirstLevelMissionTest` uses, plus a little, so a
 *  bank is dropped before the gate can fail on it. */
export function FrontAssaultLaneCuts(x,z,w,d,slackM=.4){
  // The flank group's and the officer's authored lanes are kept clear by the same rule
  // (graft from space proposal C: placement steps out of every lane automatically).
  for(const route of [...FRONT_ASSAULT_STARTS.map(start=>[start,...FrontAssaultLane(start.x,start.z)]),
    ...FrontExplicitLanes()]){
    for(let i=1;i<route.length;i++){
      const a=route[i-1],b=route[i],length=Math.hypot(b.x-a.x,b.z-a.z);
      for(let travelled=0;travelled<=length;travelled+=.25){
        const t=travelled/length;
        if(Math.abs(a.x+(b.x-a.x)*t-x)<w/2+slackM&&Math.abs(a.z+(b.z-a.z)*t-z)<d/2+slackM)return true;
      }
    }
  }
  return false;
}
/** Authored (non-derived) front lanes: the flank group and the officer, start point first. */
export function FrontExplicitLanes(){
  return [...FRONT_FLANK_GROUP,FRONT_OFFICER].map(spec=>[{x:spec.x,z:spec.z},...spec.lane]);
}
// The rebuilt 03 entry runs from the casualty collection point to the traverse
// trench. Keep a finite north / north-east screen on that live leg; the retired
// station-side west/east teams were never encountered after the 2026.09.19 cut.
export const FRONT_APPROACH_ENEMIES=[
  {id:"RightNestGunner",...Sortie.nest,weapon:"Type11",hold:true,team:"Nest",role:"nestGun",faceTo:Sortie.gap},
  // Guards hold the compound and its link, not the player's approach trench: two face the west door
  // and the right low trench (south-west) from real cover, one holds the rear junction. hold keeps
  // them on their posts (peek/hide only); 03 capture is "take the compound", not "chase the guards".
  {id:"RightNestGuard",x:33.2,z:-149.2,hold:true,team:"Nest",role:"nestGuard",faceTo:Space.westDoor},
  {id:"RightEntryGuard",x:26.6,z:-146.8,hold:true,team:"Nest",role:"nestGuard",faceTo:Space.westDoor},
  // The link guard holds the rear junction: the link sap the vanguard used and the ammo sap mouth.
  {id:"RightLinkGuard",x:32.3,z:-140.2,hold:true,team:"Nest",role:"linkGuard",faceTo:{x:23.5,z:-130}},
];
// Bounded approach routes end at the trench lip; shared tactical AI closes on observed targets.
export const APPROACH_TACTICS=Object.fromEntries([
  ...OPENING.surface.filter(s=>s.advance).map((s,i)=>[s.id,{
    near:{x:-52,z:50},nearM:18,delay:(i%3)*2,
    points:[{x:s.x+(s.team==="Rail"?8:-6),z:s.z},{x:s.x+(s.team==="Rail"?14:-12),z:s.z}],
  }]),
  ...Sortie.enemies.map((s,i)=>[s.id,{near:Sortie.damagedLip,nearM:22,delay:i*2.5,
    points:[Space.roadLink[0],Space.roadLink[1],{x:47.5-i*1.6,z:-124.5}]}]),
]);
export const FRONT_DEFENDERS=[[-7.5,-112.4,"HanYang"],[-12,-111.8,"HanYang"]]
  .map(([x,z,weapon],i)=>({id:"FrontDefender"+i,x,z,weapon,stance:1}));
// Backslope scrapes (0.55 m) at the berm's south foot; the first two are the ones nearest the gap.
export const FRONT_GUARD_POSTS=[[-11,-156.3],[-5,-156.3],[-14.5,-156.4],[-1.5,-156.3],[-18,-156.4],[2,-156.2],[-22,-156.5],[-26,-156.5]]
  .map(([x,z])=>({x,z}));
// Breaches only ever RAISE a dug floor toward (natural - depth). Gap: the sap is shallowed to 0.5 m
// for ~6 m (the one exposed crossing). Damaged lip: 1.1 m for ~6 m - crouched (eye 1.05) is below the
// natural ground and hidden from the tank, standing shows the road and the turret (graft from B's K8).
// Attack tail: the last 4 m of the attack branch are 0.75 m (the risk window). Right low trench fire
// steps: two 1.05 m platforms against the trench's north wall, 1.3 m off the walking line -
// crouch-walking the 1.85 m trench is hidden, stepping up and standing engages the nest guards
// (graft from B: forced exposure becomes chosen exposure). Jump-off ramps: see FRONT_SPACE.jumpOff.
// Step 0 (1.5,-143.4) looks over the berm end at the flank group's last two lines (16-24 m); step 1
// (14.9,-146.4) also sees the nest gunner over the low west wall (10 m). Crouched on either, nobody in the
// nest team sees the player (Script_FirstLevelSpaceProbe exposure.fireSteps).
export const FRONT_FIRE_STEPS=Object.freeze([{x:1.5,z:-143.4,radius:1.4,depth:1.05},{x:14.9,z:-146.4,radius:1.4,depth:1.05}]);
export const FRONT_BREACHES=[{x:-22,z:8,radius:4,depth:1.05},{...Sortie.gap,radius:3,depth:.5},
  {...Sortie.damagedLip,radius:3,depth:1.1},{x:43.2,z:-158.4,radius:2.2,depth:.75},
  ...FRONT_FIRE_STEPS,...Space.jumpOff.ramps];
// ---------------------------------------------------------------------------
// 2026-09-23 proposal A: enemy layers that are not bounding riflemen (docs/Data_FirstLevelLayoutProposalA.md §5)
// ---------------------------------------------------------------------------
/** Flank group (侧翼组 = the designated assault group of 03): from behind NorthRuin's west wall,
 *  crater to crater toward the berm's east end. Their last line is around the end, where the
 *  gap is visible along the berm's south side; the captured nest enfilades it at 8-14 m. */
export const FRONT_FLANK_GROUP=Object.freeze([
  {id:"FrontFlankA",x:50,z:-192.4,role:"flank",lane:[{x:45.4,z:-192.8},{x:40,z:-181.5},{x:31.5,z:-173.6},{x:24.5,z:-168.4},{x:20.5,z:-161.5},{x:16.2,z:-158.4}]},
  {id:"FrontFlankB",x:53,z:-192.6,role:"flank",lane:[{x:45.2,z:-193.4},{x:38,z:-183.2},{x:29.6,z:-176.2},{x:22.6,z:-168.8},{x:21.8,z:-165.2},{x:14.6,z:-157.6}]},
  {id:"FrontFlankC",x:56,z:-192.4,role:"flank",lane:[{x:45.6,z:-194},{x:42,z:-183.5},{x:33.5,z:-177.4},{x:26.4,z:-170.2},{x:15.5,z:-162.8},{x:12.6,z:-156.9}]},
  {id:"FrontFlankD",x:59,z:-192.6,role:"flank",lane:[{x:45.8,z:-194.6},{x:41,z:-186},{x:32.2,z:-179},{x:25.6,z:-172.2},{x:18.4,z:-159.6}]},
].map(Object.freeze));
/** One officer (IJA01, sword prop, pistol shelved). Leads the flank group one bound behind it. */
export const FRONT_OFFICER=Object.freeze({id:"FrontOfficer",x:54.5,z:-193.6,modelVariant:1,sword:true,role:"officer",
  lane:[{x:45.8,z:-193.6},{x:41,z:-186.5},{x:33,z:-178.5},{x:27.4,z:-172.6}]});
/** Reinforcement entries (contract §2.8): all 60 m+ from the nest seat and the observation step,
 *  or hidden below a crest. The count is the budget per stage: 04 gets 2+2, 05 gets 1, so the
 *  worst case alive in 05 (nobody but the nest team dead in 03) is 30 = contract §6. */
export const FRONT_RESERVE_ENTRIES=Object.freeze([
  // slots: where each man stands when the entry releases him (inside the trench / the cutting);
  // slotStages: the stage that releases that slot (the budget per stage is the count per stage).
  {id:"NorthWestPlateau",x:-44,z:-222.2,hiddenBy:"west end of the 1.9 m north jump-off trench, 20 m behind the north crest",stages:{MachineGun:2,Tank:1},
    slots:[{x:-45.2,z:-221.7},{x:-42.6,z:-222.7},{x:-40,z:-221.7}],slotStages:["MachineGun","MachineGun","Tank"]},
  {id:"RoadCutting",x:104,z:-214,hiddenBy:"road cutting walls + NorthRuin sector + 98 m",stages:{MachineGun:2},
    slots:[{x:106.2,z:-217.4},{x:108.3,z:-221.2}],slotStages:["MachineGun","MachineGun"]},
].map(Object.freeze));
/** Tank escort slots at the block point (brain-owned, contract §5.7): two pairs in the road-side
 *  ditches, one pair 6-7 m ahead of the hull, one pair beside it. Shift with the tank's progress. */
export const FRONT_TANK_ESCORT_SLOTS=Object.freeze([
  {id:"TankEscortA",x:31.8,z:-164.2,role:"escort"},{id:"TankEscortB",x:31.2,z:-170.8,role:"escort"},
  {id:"TankEscortC",x:37.4,z:-163.4,role:"escort"},{id:"TankEscortD",x:36.8,z:-172,role:"escort"},
].map(Object.freeze));
/** Ambient-fire authorised points per stage (contract §2.9: never the player's live position,
 *  baseAccuracy 0, no TTK). y is metres above the shared ground at (x,z). gap:true points are
 *  switched off inside a withdrawal window. */
const Crest=(x)=>({x,z:-160.3,y:2.25});
export const FRONT_FIRE_POINTS=Object.freeze({
  Trapped:[{x:-4,z:-111.8,y:.3},{x:-26.5,z:-124.2,y:.3},{x:14,z:-126.6,y:-.6},{x:18.4,z:-127.3,y:-.6}],
  BunkerRescue:[{x:-4,z:-111.8,y:.3},{x:14,z:-126.6,y:-.6},{x:18.4,z:-127.3,y:-.6}],
  RearTrench:[{x:-4,z:-111.8,y:.3},{x:3,z:-126.2,y:-.4}],
  Support:[...[-26,-20,-14,-2,4,8].map(Crest),{x:-32.6,z:-158.7,y:.9},
    {x:-9.6,z:-150.3,y:.2,gap:true},{x:-6.4,z:-150.3,y:.2,gap:true},{x:-8,z:-142.3,y:.2,gap:true}],
  MachineGun:[...[-26,-14,-2,8].map(Crest),{x:27.5,z:-157.1,y:1.1},{x:24,z:-154,y:1.1},{x:37,z:-151.2,y:3.2},
    {x:-9.6,z:-150.3,y:.2,gap:true},{x:-6.4,z:-150.3,y:.2,gap:true}],
  Tank:[...[-20,-8,4].map(Crest),{x:27.5,z:-157.1,y:1.1},{x:45.3,z:-162.6,y:1.3},
    {x:-9.6,z:-150.3,y:.2,gap:true},{x:-6.4,z:-150.3,y:.2,gap:true}],
});
export { FRONT_TANK_PATH };
export const FRONT_SHELLS=[
  {trigger:{x:-46,z:37},impact:{x:-37,z:22}},
  {trigger:{x:-24,z:-28},impact:{x:-31,z:-45}},
  {trigger:{x:-8,z:-85},impact:{x:-1,z:-99}},
];
// Historical casualties along the whole route. Each cluster: [x, z, count, ijaShare, spreadM].
// 2026-09-08: tripled and extended (尸山血海). Bodies are static instanced bakes with distance
// tiers, so density is a content decision here, not a rendering budget elsewhere.
const clusters=[
  // Unloading yard and the first stretch of the communication trench.
  [-70,72,9,.1,4.5],[-65,60,15,.15,5],[-52,46,15,.2,5],[-39,32,18,.25,5.5],[-48,13,15,.3,5],[-35,0,18,.3,5.5],
  [-28,-23,15,.35,5],[-18,-41,18,.35,5.5],[-30,-56,15,.4,5],[-15,-72,21,.4,6],[-4,-92,18,.4,5.5],
  [-13,-107,18,.45,5.5],[-24,-119,15,.45,5],
  // 2026-09-23 space rebuild: the held line is now the backslope scrape at the berm's south foot
  // (z -156), the lost east end is the right nest compound, and the 01 dead lie along the link sap.
  // The observation step's foreground (z -126..-150, bearing 0-80 deg from it) is left empty: it is our side of the line.
  [-22,-155.5,18,.3,4],[-8.5,-147.5,15,.4,3.5],[7,-155.8,21,.5,4.5],[30.5,-151,18,.7,4],[-29.2,-116.5,6,.1,1.8],[22,-129.5,9,.6,2.5],
  // The killing ground north of the berm (moved 6 m north with it): assault waves that never reached it.
  [-36,-169,24,.85,6.5],[4,-176,27,.85,7],[43,-178,21,.8,5.5],[-14,-165,21,.9,5],[22,-167,21,.9,5],
  [-30,-182,18,.9,5.5],[10,-188,18,.9,5.5],[36,-184,15,.9,5],[-6,-196,15,.95,5],[26,-198,12,.95,4.5],
  // Approach fire positions and the village fight.
  [10,-79,12,.6,4],[1,-37,9,.6,3.5],[15,3,9,.5,3.5],[34,28,15,.5,5],[48,-30,12,.7,4],[60,-2,12,.6,4],[70,20,12,.55,4],
  // Transfer shed, the western ditch and the reception yard.
  [96,96,15,.4,5],[108,110,12,.6,4],[60,112,12,.4,4],[32,139,12,.35,4],[53,165,12,.35,4],[49,190,12,.35,4],[10,220,12,.4,4],[-3,236,9,.4,3.5],
];
let seed=19380907; const Random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
// Leave room for a full prone body around each living recruit's muster point.
// Filter after generation so every retained battlefield body keeps its original placement.
const musterBodyClearanceM=1.8;
const musterPoints=[MISSION_TRAIN.guideMuster,...MISSION_TRAIN.cars.flatMap(car=>car.muster)];
function OpeningRouteClear(body){
  for(const route of [OPENING.approachRoute,OPENING.supportRoute])for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((body.x-a.x)*dx+(body.z-a.z)*dz)/(dx*dx+dz*dz)));
    if(Math.hypot(body.x-a.x-dx*t,body.z-a.z-dz*t)<3.5)return false;
  }
  return true;
}
export const MISSION_AFTERMATH=clusters.flatMap(([x,z,count,ijaShare,spread],group)=>Array.from({length:count},(_,i)=>{
  const angle=Random()*Math.PI*2,r=Math.sqrt(Random())*spread;
  const ija=Random()<ijaShare;
  // Upper-layer ordering hint only. The load-time solver requires actual body
  // support underneath; this value must never become an unconditional Y offset.
  const pile=count>=15&&i%4===3?.18+Random()*.2:0;
  return {id:"Aftermath"+group+"_"+i,x:x+Math.cos(angle)*r,z:z+Math.sin(angle)*r,
    yaw:Random()*Math.PI*2,side:ija?"ija":"nra",pose:i%4,
    pile,scale:.94+Random()*.12,blood:.6+Random()*.75,opening:group<13};
})).filter(body=>(!body.opening||(+body.id.split("_")[1]<2&&OpeningRouteClear(body)))&&
  musterPoints.every(point=>Math.hypot(body.x-point.x,body.z-point.z)>=musterBodyClearanceM));
