// Deterministic, body-clear local walking. Route vertices describe obstacles,
// not compulsory footprints: a visible destination is approached directly.
const indices = new WeakMap();
function Nearby(blocks, from, to, radius) {
  let grid=indices.get(blocks);
  if(!grid){
    grid=new Map();
    for(const box of blocks){
      if(box.solid===false)continue;
      const c=Math.abs(Math.cos(box.ry||0)),s=Math.abs(Math.sin(box.ry||0));
      const hx=(box.w*c+box.d*s)/2,hz=(box.w*s+box.d*c)/2;
      for(let x=Math.floor((box.x-hx)/8);x<=Math.floor((box.x+hx)/8);x++)
        for(let z=Math.floor((box.z-hz)/8);z<=Math.floor((box.z+hz)/8);z++){
          const key=`${x},${z}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(box);
        }
    }
    indices.set(blocks,grid);
  }
  const result=new Set();
  for(let x=Math.floor((Math.min(from.x,to.x)-radius)/8);x<=Math.floor((Math.max(from.x,to.x)+radius)/8);x++)
    for(let z=Math.floor((Math.min(from.z,to.z)-radius)/8);z<=Math.floor((Math.max(from.z,to.z)+radius)/8);z++)
      for(const box of grid.get(`${x},${z}`)||[])result.add(box);
  return result;
}
export function P012SegmentClear(blocks,from,to,radius=.42,{ignoredIds=[]}={}) {
  if(!from||!to)return false;
  const foot=Math.min(from.y||0,to.y||0);
  for(const box of Nearby(blocks,from,to,radius)){
    if(ignoredIds.includes(box.id)||box.y+box.h/2<=foot+.05||box.y-box.h/2>foot+1.8)continue;
    const c=Math.cos(box.ry||0),s=Math.sin(box.ry||0);
    const ax=(from.x-box.x)*c-(from.z-box.z)*s,az=(from.x-box.x)*s+(from.z-box.z)*c;
    const dx=(to.x-from.x)*c-(to.z-from.z)*s,dz=(to.x-from.x)*s+(to.z-from.z)*c;
    let lo=0,hi=1;
    for(const [a,d,h] of [[ax,dx,box.w/2+radius],[az,dz,box.d/2+radius]]){
      if(Math.abs(d)<1e-8){if(Math.abs(a)>=h){hi=-1;break;}continue;}
      const t1=(-h-a)/d,t2=(h-a)/d;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));
    }
    if(hi>=lo)return false;
  }
  return true;
}
export function P012RouteProjection(route,at) {
  let nearest={along:0,index:0,distance:Infinity},along=0;
  for(let index=1;index<route.length;index++){
    const a=route[index-1],b=route[index],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
    const t=Math.max(0,Math.min(1,((at.x-a.x)*dx+(at.z-a.z)*dz)/(len*len||1)));
    const distance=Math.hypot(at.x-a.x-dx*t,at.z-a.z-dz*t);
    if(distance<nearest.distance)nearest={along:along+t*len,index,distance};along+=len;
  }
  return {...nearest,length:along};
}
export function P012RoutePoint(route,distance,lateral=0) {
  for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
    if(distance<=len||i===route.length-1){const t=Math.max(0,Math.min(1,distance/(len||1)));
      return {x:a.x+dx*t-dz/(len||1)*lateral,z:a.z+dz*t+dx/(len||1)*lateral};}
    distance-=len;
  }
  return {...route[0]};
}
export function P012NextVisiblePoint(blocks,from,route,cursor=0,radius=.42) {
  for(let index=route.length-1;index>=cursor;index--)
    if(P012SegmentClear(blocks,from,route[index],radius))return {point:route[index],index};
  return {point:from,index:cursor,blocked:true};
}
export class FirstLevelP012March {
  constructor(blocks,route){this.blocks=blocks;this.route=route;this.members=new Map();}
  Plan(actorId,at,leader,slot,time) {
    const projection=P012RouteProjection(this.route,leader),self=P012RouteProjection(this.route,at);
    let lag=[1.6,2.1,4.5,5.1,7.5,8.4][slot%6];
    const widthCenter=P012RoutePoint(this.route,Math.max(0,projection.along-lag));
    const narrow=[-.95,.95].some(offset=>!P012SegmentClear(this.blocks,widthCenter,P012RoutePoint(this.route,Math.max(0,projection.along-lag),offset),.46));
    if(narrow)lag=1.6+(slot%6)*1.2;
    const progress=Math.max(0,projection.along-lag);
    const lateral=[-.78,.72,-.58,.82,-.86,.5][slot%6]+Math.sin(time*.23+slot*1.7)*.12;
    const target=P012RoutePoint(this.route,progress,narrow?0:lateral);
    const center=P012RoutePoint(this.route,progress);
    const end=P012SegmentClear(this.blocks,center,target,.46)?target:center;
    const waypoints=[];let along=0;
    for(let i=1;i<this.route.length;i++){
      along+=Math.hypot(this.route[i].x-this.route[i-1].x,this.route[i].z-this.route[i-1].z);
      if(along>self.along+.15&&along<progress)waypoints.push(this.route[i]);
    }
    waypoints.push(end);
    let chosen=P012NextVisiblePoint(this.blocks,at,waypoints,0,.46);
    if(chosen.blocked&&P012SegmentClear(this.blocks,at,center,.46))chosen={point:center,index:0};
    const distance=Math.hypot(chosen.point.x-at.x,chosen.point.z-at.z);
    const base=[3.16,2.94,3.28,3.04,2.85,3.22][slot%6];
    const speed=distance<.6?0:Math.min(5.246,base+Math.max(0,distance-4)*.38,distance*1.8);
    const plan={point:chosen.point,speed,lag,lateral,progress,blocked:!!chosen.blocked};
    this.members.set(actorId,plan);return plan;
  }
}
