// Pure WORLD-space, finite stage-zero village vignettes. Never transform again.
const Point=(x,z)=>Object.freeze({x,z});
export const P012_VILLAGE_LIFE_PEOPLE=Object.freeze([
 {id:"VillageWaitingWoundedA",kind:"nra",x:-39.6,z:59,yaw:-Math.PI/2,role:"wounded"},
 {id:"VillageWaitingWoundedB",kind:"nra",x:-39.6,z:61,yaw:-Math.PI/2,role:"wounded"},
 {id:"VillageDoorWorkerA",kind:"nra",x:-37.6,z:55.1,yaw:0,role:"worker"},
 {id:"VillageDoorWorkerB",kind:"nra",x:-36.2,z:55.1,yaw:0,role:"worker"},
 {id:"VillageTelephoneSoldier",kind:"nra",x:-31.5,z:79,yaw:0,role:"telephone"},
].map(spec=>Object.freeze({...spec,weapon:null,bodyRadius:.42})));
export const P012_VILLAGE_LIFE_BLOCKS=Object.freeze([
 ...[-39.6].flatMap(x=>[59,61].map((z,index)=>({id:`VillageWoundedSeat${index}`,x,z,w:.6,d:.55,h:.5,y:.25,solid:true,semantic:"structure"}))),
 {id:"VillageDoorFrameLeft",x:-38.05,z:53.5,w:.16,d:.22,h:2.3,y:1.15,solid:true,semantic:"structure"},
 {id:"VillageDoorFrameRight",x:-35.75,z:53.5,w:.16,d:.22,h:2.3,y:1.15,solid:true,semantic:"structure"},
 {id:"VillageDoorFrameTop",x:-36.9,z:53.5,w:2.45,d:.22,h:.16,y:2.3,solid:true,semantic:"structure"},
].map(Object.freeze));
export const P012_VILLAGE_LIFE=Object.freeze({
 door:Point(-36.9,53.7),doorSeconds:12,
 telephoneRoute:Object.freeze([Point(-31.5,79),Point(-31.5,62),Point(-35.5,46),Point(-31.5,30),Point(-31.5,18),Point(-18,10),Point(-2,-2)]),
 muleRoute:Object.freeze([Point(-30,88),Point(-30,80),Point(-30,62),Point(-34,46),Point(-30,30),Point(-30,19),Point(-17,12),Point(0,0)]),
 telephoneSpeed:1.15,muleSpeed:1.05,familyId:"VillageFamily2",familySlot:6,
});
