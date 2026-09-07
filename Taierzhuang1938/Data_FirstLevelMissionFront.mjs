// Authored squads and persistent aftermath. Historical dead do not affect live combat counts.
export const FRONT_SECTIONS = Object.freeze([
  {id:"West",points:[[-49,-169],[-53,-177],[-42,-182],[-64,-175],[-38,-174],[-61,-172]]},
  {id:"Center",points:[[-16,-187],[-24,-195],[-5,-190],[4,-197],[12,-188],[-35,-185]]},
  {id:"East",points:[[47,-165],[54,-176],[44,-184],[61,-185],[56,-157],[68,-173]]},
]);
// One light machine gun per section stays as a fire base (hold); every rifleman bounds forward (FrontAssaultLane).
export const FRONT_REINFORCEMENTS=FRONT_SECTIONS.flatMap((section,group)=>section.points.map(([x,z],i)=>({
  id:"Front"+section.id+i,x,z,weapon:i===1?"Type11":"Type38",hold:i===1,
})));
// Bounding assault geometry (2026-09-08). Lines are bound positions north of the traverse trench
// (z=-124; withdrawal posts at -142..-148); each sits 1.5-2.5 m behind a cover row so kneeling
// there never intersects it. blockedX are the cover columns a straight rush between lines would
// cut through; lanes are pushed out of them (the AI has no vault on the rush path).
// waveCentersX are the rotating squad drop points on the northern edge for reinforcement waves.
export const FRONT_ASSAULT=Object.freeze({
  lines:[-187,-175.5,-166,-159.5],
  xRange:[-63,49],
  // Cover columns (EnemyForwardCover / FieldRuin0) and the two farm footprints (NorthFarm, NorthRuin).
  blockedX:[[-60.5,-42.5],[-31.5,-16.9],[-2.6,2.6],[17.4,22.6],[50,68]],
  lateralM:2.4,
  spawnZ:-199,
  waveCentersX:[-36,12,38,-18,44,-6],
});
const LaneRandom=(x,z)=>{let s=(Math.round(x*7+z*13)*2654435761)>>>0;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};};
// Push a lane point out of a blocked column, always towards the side the lane's base x is on:
// consecutive bounds pushed to opposite sides would rush straight through the cover between them.
const ClearLaneX=(x,baseX)=>{
  x=Math.max(FRONT_ASSAULT.xRange[0],Math.min(FRONT_ASSAULT.xRange[1],x));
  for(const [a,b] of FRONT_ASSAULT.blockedX)if(x>a&&x<b)x=baseX<=(a+b)/2?a-.6:b+.6;
  return Math.max(FRONT_ASSAULT.xRange[0],Math.min(FRONT_ASSAULT.xRange[1],x));
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
export const FRONT_GUARD_POSTS=[[-29,-146],[-22,-142],[-12,-148],[-4,-144],[7,-147.6],[14,-146],[21,-143],[28,-147]]
  .map(([x,z])=>({x,z}));
export const FRONT_BREACHES=[{x:-43,z:25,radius:10,depth:.65},{x:-24,z:-39,radius:9,depth:.6},{x:-8,z:-94,radius:8,depth:.65}];
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
export const MISSION_AFTERMATH=clusters.flatMap(([x,z,count,ijaShare,spread],group)=>Array.from({length:count},(_,i)=>{
  const angle=Random()*Math.PI*2,r=Math.sqrt(Random())*spread;
  const ija=Random()<ijaShare;
  // Every fourth body of a dense cluster lies across another: piles read as 尸山, not a carpet.
  const pile=count>=15&&i%4===3?.18+Random()*.2:0;
  return {id:"Aftermath"+group+"_"+i,x:x+Math.cos(angle)*r,z:z+Math.sin(angle)*r,
    yaw:Random()*Math.PI*2,side:ija?"ija":"nra",pose:i%4,
    pile,scale:.94+Random()*.12,blood:.6+Random()*.75};
}));
