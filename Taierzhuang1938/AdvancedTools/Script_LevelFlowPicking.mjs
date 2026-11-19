const Dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const Minus=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];

// Return the first entry along a unit ray, including when the near plane
// already lies inside the body. The end spheres also handle parallel rays.
function CapsuleEntry(origin,dir,a,b,r) {
  const axis=Minus(b,a),start=Minus(origin,a);
  const length2=Dot(axis,axis),along=Dot(axis,start),slope=Dot(axis,dir);
  const t=length2?Math.max(0,Math.min(1,along/length2)):0;
  const closest=start.map((v,i)=>v-axis[i]*t);
  if(Dot(closest,closest)<=r*r) return 0;
  let entry=Infinity;
  const aa=length2-slope*slope,bb=length2*Dot(dir,start)-along*slope;
  const cc=length2*(Dot(start,start)-r*r)-along*along,disc=bb*bb-aa*cc;
  if(aa>1e-10&&disc>=0) {
    const d=(-bb-Math.sqrt(disc))/aa,h=along+d*slope;
    if(d>=0&&h>=0&&h<=length2) entry=d;
  }
  for(const cap of [a,b]) {
    const delta=Minus(origin,cap),offset=Dot(delta,dir),discriminant=offset*offset-Dot(delta,delta)+r*r;
    if(discriminant<0) continue;
    const d=-offset-Math.sqrt(discriminant);
    if(d>=0) entry=Math.min(entry,d);
  }
  return entry;
}

const longBodies={tank:[.86,.83,.83],cart:[.67,.65,.75],donkey:[.32,.45,.74],quilt:[.25,.65,.12]};
function Body(actor,ground) {
  const [x,z]=actor.p,y=(actor.surfaceY??ground(actor.p))+(actor.elevation||0);
  if(Object.hasOwn(longBodies,actor.kind)) {
    const [r,half,lift]=longBodies[actor.kind];
    const dx=Math.sin(actor.heading||0)*half,dz=-Math.cos(actor.heading||0)*half;
    return [[x-dx,y+lift,z-dz],[x+dx,y+lift,z+dz],r];
  }
  if(actor.pose==="dead"&&actor.fallProgress===undefined) return [[x-.38,y+.12,z],[x+.38,y+.12,z],.2];
  const crouching=actor.heavy||["kneel","drag","down","crouch"].includes(actor.pose);
  const height=(actor.kind==="child"?1.05:1.65)*(crouching ? .65 : 1);
  const radius=Math.min(.30,height*.23),angle=(actor.fallProgress||0)*Math.PI/2;
  const Point=h=>[x,y+(actor.fallProgress!==undefined ? .1 : 0)+h*Math.cos(angle),z-h*Math.sin(angle)];
  return [Point(radius),Point(height-radius),radius];
}
export function PickEncounterBody(view,origin,dir) {
  const cosine=Dot(dir,view.forward);
  if(cosine<=0) return null;
  const start=origin.map((v,i)=>v+dir[i]*view.near/cosine);
  let nearest=(view.far-view.near)/cosine,winner=null;
  for(const actor of view.frame.actors) {
    if(!view.VisibleActor(actor)) continue;
    const distance=CapsuleEntry(start,dir,...Body(actor,p=>view.Ground(p)));
    if(distance<nearest) {nearest=distance;winner=actor;}
  }
  return winner;
}
