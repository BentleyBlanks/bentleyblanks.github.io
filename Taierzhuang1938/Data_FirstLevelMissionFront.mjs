import { MISSION_TUNING as FIRST_LEVEL_TUNING } from "./Data_Tuning_FirstLevel.mjs";
import { MISSION_TRAIN } from "./Data_FirstLevelMissionTrain.mjs";
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
    Object.freeze({id:"Bank", line:-187,   z:-185.3, w:1.5, h:1.06, d:.6}),
    Object.freeze({id:"Mound",line:-175.5, z:-173,   w:1.6, h:1.02, d:.6}),
    Object.freeze({id:"Ridge",line:-166,   z:-164,   w:1.5, h:.94,  d:.6}),
    Object.freeze({id:"Stub", line:-159.5, z:-158,   w:1.7, h:1.08, d:.6}),
  ]),
  columns:Object.freeze([
    // NorthFarm stands on the Bank row here, so only the three southern rows are built.
    Object.freeze({id:"WestFarm",  x:Object.freeze([-60.5,-42.5]),rows:Object.freeze(["Mound","Ridge","Stub"])}),
    Object.freeze({id:"WestGrave", x:Object.freeze([-40.5,-33.5]),rows:null}),
    // FieldRuin0 already fills the western half of this column's Ridge row.
    Object.freeze({id:"Ruin",      x:Object.freeze([-31.5,-16.9]),rows:null}),
    Object.freeze({id:"CenterWest",x:Object.freeze([-12.5,-7]),   rows:null}),
    Object.freeze({id:"Center",    x:Object.freeze([-2.6,2.6]),   rows:null}),
    Object.freeze({id:"CenterEast",x:Object.freeze([7.3,12.8]),   rows:null}),
    // FieldRuin1 already fills the eastern half of this column's Stub row.
    Object.freeze({id:"East",      x:Object.freeze([17.4,28.9]),  rows:null}),
    // coverX is the build span, narrower than the lane span: the tank's advance from tankStart to
    // tankFirstFireZ leans east when it tracks a target near the grenade-bundle anchor, and it
    // moves by interpolation with no collision response, so nothing may stand in that swing.
    Object.freeze({id:"FarEast",   x:Object.freeze([39.8,47]),    rows:null, coverX:Object.freeze([42,47])}),
    // NorthRuin: a building east of the assault span, no authored cover of its own.
    Object.freeze({id:"NorthRuin", x:Object.freeze([50,68]),      rows:Object.freeze([])}),
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
  {id:"FrontGunner",x:25,z:-161,weapon:"Type11",hold:true},
  {id:"FrontRifleA",x:-18,z:-159},
  {id:"FrontRifleB",x:-9,z:-164},
  {id:"FrontRifleC",x:14,z:-154},
  {id:"FrontRifleD",x:30,z:-151},
  {id:"FrontRifleE",x:-29,z:-171},
  {id:"FrontRifleF",x:-22,z:-178},
  {id:"FrontRifleG",x:-10,z:-180},
  {id:"FrontRifleH",x:2,z:-177},
  {id:"FrontRifleI",x:9,z:-170},
  {id:"FrontRifleJ",x:20,z:-179},
  {id:"FrontSupportGunner",x:33,z:-181,weapon:"Type11",hold:true},
]);
/** Every man the front stages put on this field. The cover rows never build on one of these
 *  firing positions - a bank standing on a man is a man standing in a bank. */
export const FRONT_FIELD_MEN=Object.freeze([...FRONT_REINFORCEMENTS.filter((spec,i)=>i%6<2),...FRONT_RIFLEMEN]);
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
  lines:[-187,-175.5,-166,-159.5],
  xRange:[-63,49],
  blockedX:FRONT_COVER.columns.map(column=>column.x),
  lateralM:2.4,
  spawnZ:-199,
  waveCentersX:[-36,12,38,-18,44,-6],
});
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
  ...FRONT_FIELD_MEN.filter(spec=>!spec.hold).map(({id,x,z})=>Object.freeze({id,x,z})),
  ...FRONT_ASSAULT.waveCentersX.flatMap((cx,squad)=>Array.from({length:FIRST_LEVEL_TUNING.waveSquadSize},(_,i)=>
    Object.freeze({id:`Wave${squad}_${i}`,x:cx+((i%3)-1)*3.2+(i>=3?1.6:0),z:FRONT_ASSAULT.spawnZ-(i>=3?2.5:0)}))),
].filter(start=>FrontAssaultLane(start.x,start.z).length));
/** Does the straight bounding lane from `start` pass through the footprint of this cover block?
 *  Same capsule slack the route check in `Script_FirstLevelMissionTest` uses, plus a little, so a
 *  bank is dropped before the gate can fail on it. */
export function FrontAssaultLaneCuts(x,z,w,d,slackM=.4){
  for(const start of FRONT_ASSAULT_STARTS){
    const route=[start,...FrontAssaultLane(start.x,start.z)];
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
export const FRONT_APPROACH_ENEMIES=[
  {id:"ApproachWestGunner",x:-68,z:-17,weapon:"Type11",hold:true},
  {id:"ApproachWestA",x:-61,z:-27},{id:"ApproachWestB",x:-74,z:-35},
  {id:"ApproachEastGunner",x:19,z:-75,weapon:"Type11",hold:true},
  {id:"ApproachEastA",x:22,z:-88},{id:"ApproachEastB",x:31,z:-98},
];
export const FRONT_DEFENDERS=[
  [-54,15,"HanYang"],[-49,6,"Zb26"],[-52,-3,"HanYang"],[-43,-19,"HanYang"],
  [-21,-54,"HanYang"],[-13,-63,"Zb26"],[-19,-70,"HanYang"],
  [-38,-133,"HanYang"],[-31,-138,"Zb26"],[-23,-131,"HanYang"],[-17,-137,"HanYang"],
  [-9,-134,"HanYang"],[5,-138,"HanYang"],[19,-135,"Zb26"],[25,-140,"HanYang"],
].map(([x,z,weapon],i)=>({id:"FrontDefender"+i,x,z,weapon,stance:i%4===0?2:1}));
export const FRONT_GUARD_POSTS=[[-29,-145],[-22,-145],[-12,-145],[-4,-145],[7,-145],[14,-145],[21,-145],[28,-145]]
  .map(([x,z])=>({x,z}));
export const FRONT_BREACHES=[{x:-22,z:8,radius:4,depth:1.05}];
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
  // Traverse trench and the withdrawal covers: mixed dead where the line was held.
  [-28,-137,24,.5,6.5],[-10,-144,27,.55,7],[9,-145,30,.55,7.5],[30,-144,24,.5,6.5],[-20,-128,12,.2,4],[14,-127,12,.2,4],
  // The killing ground north of the trench: assault waves that never reached it.
  [-36,-163,24,.85,6.5],[4,-170,27,.85,7],[46,-169,21,.8,6],[-14,-158,21,.9,5.5],[22,-160,21,.9,5.5],
  [-30,-176,18,.9,5.5],[10,-182,18,.9,5.5],[38,-178,15,.9,5],[-6,-190,15,.95,5],[26,-192,12,.95,4.5],
  // Approach fire positions and the village fight.
  [10,-79,12,.6,4],[1,-37,9,.6,3.5],[15,3,9,.5,3.5],[34,28,15,.5,5],[48,-30,12,.7,4],[60,-2,12,.6,4],[70,20,12,.55,4],
  // Transfer shed, the western ditch and the reception yard.
  [96,96,15,.4,5],[108,110,12,.6,4],[60,112,12,.4,4],[24,110,12,.35,4],[-20,92,12,.35,4],[-60,78,12,.35,4],[-100,44,12,.4,4],[-128,36,9,.4,3.5],
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
