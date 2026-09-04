// P012 outer geography only. World coordinates, never pass through P012Point.
// Layout consumes these exports after compiling its tactical blocks. No assets,
// texture, NPC, timing or gameplay-route changes belong in this module.
// The low continuous earth lip is the visible physical safety boundary; broken
// stepped mesas and farm silhouettes interrupt it, rather than four tall walls.
import { TRAVERSAL } from "./Data_Traversal.mjs";

export const P012_HORIZON_BOUNDS = Object.freeze({minX:-330,maxX:450,minZ:-420,maxZ:360});
export const P012_HORIZON_GROUND = Object.freeze({
  x:60,z:-30,w:780,d:780,h:.5,y:-.25,semantic:"ground",
});
export const P012_HORIZON_REMOVE_IDS = Object.freeze([
  "WestBoundary","EastBoundary","NorthBoundary","SouthBoundary",
  "DepthWestTerrace","DepthWestOutbuildings",
]);

function Box(id,x,z,w,d,h,semantic="boundary",extra={}) {
  return Object.freeze({id:`Horizon${id}`,x,z,w,d,h,y:h/2,ry:0,
    solid:true,cover:null,tag:`p012_${semantic}`,semantic,...extra});
}
const blocks=[];
const lipHeight=TRAVERSAL.mantleMax+.7;
// Broad earthen banks, not thin perimeter walls. Overlapping 40 m pieces have
// differing inner edges; their outer faces terminate exactly at the ground.
// No foothold sits against the inner face: the lip remains above mantleMax.
for(let i=0;i<20;i++) {
  const length=Math.min(40,780-i*40);
  const along=-420+i*40+length/2;
  const width=8+(i%3)*3;
  blocks.push(Box(`WestLip${i}`,-330+width/2,along,width,length,lipHeight),
    Box(`EastLip${i}`,450-width/2,along,width,length,lipHeight));
  const across=-330+i*40+length/2;
  blocks.push(Box(`NorthLip${i}`,across,-420+width/2,length,width,lipHeight),
    Box(`SouthLip${i}`,across,360-width/2,length,width,lipHeight));
}
// Discontinuous large landforms create a varied skyline. All footprints are
// outside the old tactical rectangle; even the lowest tier is untraversable.
// Nested upper tiers are contained by their base, not invisible collision ramps.
const hills=[
  ["WestNorth",-278,-292,70,100,7], ["WestMiddle",-302,-104,42,82,5],
  ["WestSouth",-277,196,78,68,6], ["NorthWest",-186,-375,90,62,8],
  ["NorthMiddle",22,-388,100,48,6], ["NorthEast",264,-373,112,70,9],
  ["EastNorth",400,-261,72,104,8], ["EastMiddle",419,-53,44,82,6],
  ["EastSouth",391,207,92,84,7], ["SouthWest",-194,318,92,56,6],
  ["SouthMiddle",90,319,110,54,7], ["SouthEast",274,326,92,42,5],
];
for(const [id,x,z,w,d,h] of hills) {
  blocks.push(Box(`${id}Base`,x,z,w,d,h,"structure"),
    Box(`${id}Crown`,x+w*.09,z-d*.08,w*.61,d*.62,h*.68,"structure",{y:h+h*.34}));
}
// Farm clusters read as separated roofs/walls from the station, not a solid
// village-wide cuboid. No door-sized promises or mission markers in the horizon.
for(const [cluster,x,z] of [["West",-218,38],["North",113,-310],["East",315,86],["South",-8,273]]) {
  for(let i=0;i<5;i++) {
    const px=x+(i%3)*16,pz=z+Math.floor(i/3)*24+(i%2)*4;
    const h=3.5+(i%3)*.8;
    blocks.push(Box(`${cluster}Farm${i}`,px,pz,8+i%2*3,11,h,"structure"),
      Box(`${cluster}Roof${i}`,px,pz,9+i%2*3,12,.45,"structure",{y:h+.225}));
  }
}
// Match Station's ground-level axis/gauge and exact z=-190..185 endpoints.
// The elevated return spur stays untouched. Track vanishes into a remote earth
// cutting, never a ground hole or a sudden raised embankment.
for(const [id,from,to] of [["North",-412,-190],["South",185,352]]) {
  blocks.push(Box(`Rail${id}Bed`,-66,(from+to)/2,5.6,to-from,.06,"ground",{y:.015,solid:false}));
  for(const x of [-66.75,-65.25]) blocks.push(Box(`Rail${id}${x< -66?"West":"East"}`,
    x,(from+to)/2,.13,to-from,.14,"boundary",{y:.07,solid:false}));
  for(let z=from+1,index=0;z<to;z+=3.6,index++) {
    blocks.push(Box(`Rail${id}Sleeper${index}`,-66,z,3.3,.28,.08,"boundary",{y:.04,solid:false}));
  }
  for(let z=from+12,i=0;z<to-4;z+=36,i++) {
    blocks.push(Box(`Rail${id}Post${i}`,-77,z,.35,.35,6.3),
      Box(`Rail${id}Crossarm${i}`,-77,z,.35,4,.3,"boundary",{y:5.8}));
  }
}
// Distant physical earth cuts seal the track before the outer ground edge.
blocks.push(Box("NorthRailCut",-66,-412,24,16,lipHeight+.2,"structure"),
  Box("SouthRailCut",-66,352,24,16,lipHeight+.2,"structure"));

export const P012_HORIZON_BLOCKS=Object.freeze(blocks);
