// Authored squads and persistent aftermath. Historical dead do not affect live combat counts.
export const FRONT_SECTIONS = Object.freeze([
  {id:"West",points:[[-49,-169],[-53,-177],[-42,-182],[-64,-175],[-38,-174],[-61,-172]]},
  {id:"Center",points:[[-16,-187],[-24,-195],[-5,-190],[4,-197],[12,-188],[-35,-185]]},
  {id:"East",points:[[47,-165],[54,-176],[44,-184],[61,-185],[56,-157],[68,-173]]},
]);
export const FRONT_REINFORCEMENTS=FRONT_SECTIONS.flatMap((section,group)=>section.points.map(([x,z],i)=>({
  id:"Front"+section.id+i,x,z,weapon:i===1?"Type11":"Type38",hold:i===1,
  route:i===1?null:{delay:8+group*13+i*7,points:[{x:x*.88,z:z+9},...(group===1&&i===5?[{x:-34,z:-164},{x:-33,z:-160}]:[]),
    ...(group===2?[{x:Math.max(35,x*.75),z:-155}]:[]),{x:x*.68,z:group===2?-154+(i%3)*1.3:-158+(i%3)*2.3}]},
})));
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
const clusters=[
  [-65,60,5],[-52,46,5],[-39,32,6],[-48,13,5],[-35,0,6],[-28,-23,5],[-18,-41,6],
  [-30,-56,5],[-15,-72,7],[-4,-92,6],[-13,-107,6],[-24,-119,5],
  [-28,-137,8],[-10,-144,9],[9,-145,10],[30,-144,8],[-36,-163,8],[4,-170,9],[46,-169,7],
  [10,-79,4],[1,-37,3],[15,3,3],[34,28,5],
];
let seed=19380907; const Random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
export const MISSION_AFTERMATH=clusters.flatMap(([x,z,count],group)=>Array.from({length:count},(_,i)=>{
  const angle=Random()*Math.PI*2,r=Math.sqrt(Random())*(group<12?2.5:4.2);
  return {id:"Aftermath"+group+"_"+i,x:x+Math.cos(angle)*r,z:z+Math.sin(angle)*r,
    yaw:Random()*Math.PI*2,side:group>11&&group<19&&i%3!==0?"ija":"nra",pose:i%4,
    pile:i>3&&i%3===0?.18+Random()*.17:0,scale:.94+Random()*.12,blood:.55+Random()*.65};
}));
