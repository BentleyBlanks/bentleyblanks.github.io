// Pure, reusable rendezvous rule. Neither actor identity nor a chapter is built in.
// Remove only redundant straight-line samples. Every bend, reversal and authored
// metadata gate survives; the physical polyline is unchanged.
export function CompactGuideRoute(route,epsilon) {
  const out=[],protectedPoint=p=>Object.keys(p).some(key=>key!=="x"&&key!=="z");
  for(const point of route){
    while(out.length>=2){
      const a=out.at(-2),b=out.at(-1);
      if(protectedPoint(b))break;
      const ux=b.x-a.x,uz=b.z-a.z,vx=point.x-b.x,vz=point.z-b.z;
      if(ux*vx+uz*vz<0||Math.abs(ux*vz-uz*vx)>epsilon*Math.max(1,Math.hypot(ux+vx,uz+vz)))break;
      out.pop();
    }
    out.push(point);
  }
  return out;
}

export function GuideProjection(route, point) {
  let nearest = Infinity, progress = 0, traveled = 0, projected=null, nextIndex=0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i-1], b = route[i], dx = b.x-a.x, dz = b.z-a.z, length = Math.hypot(dx,dz);
    const t = Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/(length*length||1)));
    const distance = Math.hypot(point.x-a.x-dx*t,point.z-a.z-dz*t);
    if (distance < nearest) { nearest = distance; progress = traveled+length*t; projected={x:a.x+dx*t,z:a.z+dz*t};nextIndex=i; }
    traveled += length;
  }
  return {distance:nearest, progress,point:projected,nextIndex};
}
export class NpcMissionGuide {
  constructor(tuning) { this.tuning = tuning; this.Reset([]); }
  Reset(route) { this.route = route.map(p=>({...p})); this.released = new Set(); this.waiting = null; this.events = []; }
  CanLeave(point, player, visible) {
    const id = point.guideCheckpoint;
    if (id == null || this.released.has(id)) return true;
    const current = GuideProjection(this.route,player), stop = GuideProjection(this.route,point);
    const near = Math.hypot(point.x-player.x,point.z-player.z) <= this.tuning.rejoinM && visible;
    const passed = current.progress > stop.progress + this.tuning.arrivalM && current.distance <= this.tuning.passedCorridorM;
    if (near || passed) {
      this.released.add(id); this.waiting = null; this.Log("rejoin",id); return true;
    }
    if(this.waiting !== id) { this.waiting = id; this.Log("wait",id); }
    return false;
  }
  Log(kind,id) { this.events.push({kind,id}); if(this.events.length>64)this.events.shift(); }
  Snapshot() { return {waiting:this.waiting,released:[...this.released],events:[...this.events],stops:this.route.filter(p=>p.guideCheckpoint!=null)}; }
}
