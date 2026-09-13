// Reusable two-team bounds. The host retains collision, combat and route ownership.
import { SQUAD_COVER_BOUNDS as C } from './Data_Tuning_SquadMarch.mjs';
const Distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function SquadCoverRoute(route,stations,slot,config){
  const result=[];
  for(let i=0;i<route.length;i++){
    const a=route[i-1],b=route[i];
    if(a)for(const [index,station] of stations.entries()){
      // Authored stations occupy straight northbound legs; other route shapes
      // can supply their own marked waypoints to the same bounds controller.
      if(index%2!==slot%2 || Math.abs(a.x-station.x)>.01 || Math.abs(b.x-station.x)>.01
        || a.z<station.z+config.postRearM.at(-1) || b.z>station.z)continue;
      const z=station.z+config.postRearM[Math.floor(slot/2)%config.postRearM.length];
      result.push({x:station.x,z,coverTransit:true},
        {x:station.x+station.side*config.postOffsetM,z,coverBound:index},
        {x:station.x,z,coverTransit:true});
    }
    result.push({...b});
  }
  return result;
}
export class SquadCoverBounds {
  constructor(stations,route){this.stations=stations;this.route=route;this.released=new Set();}
  Update(player,members){
    // Use path progress, not Euclidean proximity across a hairpin or trench bank.
    const Progress=point=>{
      let best=Infinity,along=0,total=0;
      for(let i=1;i<this.route.length;i++){
        const a=this.route[i-1],b=this.route[i],dx=b.x-a.x,dz=b.z-a.z,length=Distance(a,b);
        const t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/(length*length||1)));
        const gap=Math.hypot(point.x-a.x-dx*t,point.z-a.z-dz*t);
        if(gap<best){best=gap;along=total+t*length;}total+=length;
      }
      return {along,gap:best};
    };
    const progress=Progress(player);
    for(let index=0;index<this.stations.length;index++){
      if(this.released.has(index))continue;
      const here=members.filter(m=>m.alive!==false&&m.bounds.some(p=>p.coverBound===index));
      const covering=members.filter(m=>m.alive!==false&&m.bounds.some(p=>p.coverBound===index+1));
      const Ready=(member,bound)=>{
        const post=member.bounds.find(p=>p.coverBound===bound);
        return member.passed>bound || (Distance(member.position,post)<=C.arrivalM&&!member.evading);
      };
      if(here.length && here.every(m=>Ready(m,index)) && covering.every(m=>Ready(m,index+1))
        && progress.gap<=C.playerCorridorM && progress.along>=Progress(this.stations[index]).along-C.playerArrivalM)
        this.released.add(index);
    }
  }
  CanLeave(index){return this.released.has(index);}
}
