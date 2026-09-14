// Pure soft-boundary evaluator: never moves the player or changes mission facts.
const Distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
export function NearestMissionRoutePoint(position, route) {
  let nearest=null, distance=Infinity;
  for(let i=0;i<route.length;i++) {
    const a=route[i],b=route[i+1]||a,dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((position.x-a.x)*dx+(position.z-a.z)*dz)/(dx*dx+dz*dz||1)));
    const point={x:a.x+dx*t,z:a.z+dz*t},d=Distance(position,point);
    if(d<distance){nearest=point;distance=d;}
  }
  return {point:nearest,distance};
}
export class MissionReturn {
  constructor(tuning) { this.tuning=tuning; this.Reset(); }
  Reset() { this.stage=null; this.elapsed=0; this.outsideS=0; this.active=false; this.result=null; }
  Update(dt, spec) {
    if(!spec || spec.suspended){this.Reset();return null;}
    const r=this.tuning;
    if(this.stage!==spec.stage){this.Reset();this.stage=spec.stage;}
    this.elapsed+=Math.max(0,dt);
    const nearest=NearestMissionRoutePoint(spec.position,spec.route);
    if(!nearest.point){this.Reset();return null;}
    const margin=this.active?r.hysteresisM:0;
    const targetNear=spec.target && Distance(spec.position,spec.target)<r.targetSafeM;
    const routeOutside=!targetNear && nearest.distance>r.corridorM-margin;
    const squadDistance=spec.squad?Distance(spec.position,spec.squad):0;
    const squadOutside=!targetNear && squadDistance>r.squadM-margin;
    const personDistance=spec.person?Distance(spec.position,spec.person):0;
    const personOutside=personDistance>r.personM-margin;
    const b=spec.bounds,p=spec.position;
    const edgeDistance=b?Math.min(p.x-b.minX,b.maxX-p.x,p.z-b.minZ,b.maxZ-p.z):Infinity;
    const edgeOutside=edgeDistance<r.edgeM+(this.active?r.edgeHysteresisM:0);
    const outside=routeOutside || squadOutside || personOutside || edgeOutside;
    this.outsideS=outside?this.outsideS+Math.max(0,dt):0;
    this.active=outside && this.elapsed>=r.stageGraceS && (this.active || this.outsideS>=r.enterDelayS);
    if(!this.active){this.result=null;return null;}
    const reason=edgeOutside?'boundary':routeOutside?'route':personOutside?'person':'squad';
    // Return to the authored route before pointing onward through buildings.
    const target=routeOutside?nearest.point:personOutside?spec.person:squadOutside?spec.squad:spec.target||nearest.point;
    const urgent=(personOutside && personDistance>r.personUrgentM) || (routeOutside && nearest.distance>r.urgentM)
      || (squadOutside && squadDistance>r.squadUrgentM) || edgeDistance<r.edgeUrgentM;
    this.result={reason,urgent,target:{x:target.x,z:target.z},label:spec.label,
      distance:Distance(p,target),angle:(Math.atan2(target.x-p.x,p.z-target.z)+(spec.yaw||0))*180/Math.PI};
    return this.result;
  }
}
