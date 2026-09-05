// P012 WORLD-space roadside rests. No three, assets, random placement or route
// mutation. Actor.PoseSeatedLegs is authored for a 0.50m seat: root feet stay at
// groundAt, never at seatTop. The host must not FindFreeSpot against its own seat.
const Person=(id,x,z,variant,yaw,group,activity,phaseOffset,lookYaw)=>Object.freeze({id,x,z,variant,yaw,group,activity,phaseOffset,lookYaw,
  kind:"civilian",weapon:null,seatId:`${id}Seat`,seatTop:.5,bodyRadius:.42,
  lifePose:Object.freeze({sit:1,[activity]:activity==='repairShoe'?.8:activity==='warmHands'?.55:0})});
export const P012_RESTING_PEOPLE=Object.freeze([
 Person("VillageRestEast",-25,58,"female",Math.PI/2,"EastRest","warmHands",1.7,-.3),
 Person("VillageRestPairA",-38,37,"male",Math.PI/2,"WestPair","repairShoe",5.3,0),
 Person("VillageRestPairB",-39.6,37,"female",-Math.PI/2,"WestPair","rest",9.1,.25),
]);
export const P012_RESTING_BLOCKS=Object.freeze(P012_RESTING_PEOPLE.map(person=>Object.freeze({
 id:person.seatId,x:person.x+Math.sin(person.yaw)*.1,z:person.z+Math.cos(person.yaw)*.1,
 w:.65,d:.48,h:.5,y:.25,ry:person.yaw,solid:true,cover:false,semantic:"structure",tag:person.seatId,
})));
export const P012_RESTING_REACTION=Object.freeze({event:"P012NorthNearMissImpact",radiusM:36,blendPerSecond:2});
