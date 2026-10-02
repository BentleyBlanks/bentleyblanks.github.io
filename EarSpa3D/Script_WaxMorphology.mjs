import {MakeRng} from './Script_Util.js';

const tau=Math.PI*2;
const Clamp=(value,low,high)=>Math.max(low,Math.min(high,value));

// Closed two-sided lamellae in millimetres. A star-shaped XY footprint lets the
// existing shell solver sample both faces; curls never fold back through the wall.
export function BuildWaxShape({seed=1,type='dry',radii=[1,1],micro=false,variant='flake'}={}){
  const rng=MakeRng(seed),segments=micro?24:48,rings=micro?3:7;
  const dry=type==='dry',curl=variant==='curl',crumb=variant==='crumb';
  const corners=micro?6:11,contour=Array.from({length:corners},()=>micro?.50+rng()*.50:.74+rng()*.26);
  const phase=rng()*tau,notch=rng()*tau,fold=rng()*tau;
  const skew=(rng()-.5)*.27,offset=(rng()-.5)*.20;
  const scale=Math.min(...radii),base=micro?scale*(crumb?.70:.15):dry?.043:type==='wet'?.15:.34;
  const positions=[],indices=[],uv=[],response=[];
  function Height(x,y,r){
    const ridge=Math.sin((x*Math.cos(fold)+y*Math.sin(fold))*5+phase);
    const lifted=Math.pow(Math.max(0,x*Math.cos(fold)+y*Math.sin(fold)),2.4);
    const ripple=Math.sin(y*9+x*3+phase)*Math.sin(x*5-y*2+phase);
    const bowl=dry?(micro?(curl?1.55:.38):.20)*scale*lifted:0;
    const bottom=.003+bowl+(dry?.009:.006)*scale*ridge*r*r;
    const dome=crumb?Math.sqrt(Math.max(0,1-r*r)):Math.pow(Math.max(0,1-r*r),.7);
    const thickness=base*(.26+(crumb?1.45:1.0)*dome)*
      (1+(dry?.24:.42)*ridge+(dry?.08:.20)*ripple);
    return [bottom,Math.max(micro?.003:.009,thickness)];
  }
  function Vertex(r,a,side){
    const sample=((a+phase)%tau)/tau*corners,k=Math.floor(sample),t=sample-k;
    // Piecewise edges and isolated bite marks, rather than a sinusoidal flower.
    const blend=dry?t:t*t*(3-2*t);
    const aRadius=contour[k],bRadius=contour[(k+1)%corners],sector=tau/corners;
    // Intersect a ray with actual polygon edges for broken chips. Interpolating
    // radii instead makes even a coarse polygon look like a rounded seed.
    const edge=micro?aRadius*bRadius*Math.sin(sector)/(bRadius*Math.sin((1-t)*sector)+aRadius*Math.sin(t*sector)):
      aRadius*(1-blend)+bRadius*blend;
    const distance=Math.atan2(Math.sin(a-notch),Math.cos(a-notch));
    const chip=dry?(micro?.18:.24)*Math.exp(-distance*distance/(micro?.06:.025)):.08*Math.exp(-distance*distance/.13);
    const radius=r*(edge-chip),x=Math.cos(a)*radius,y=Math.sin(a)*radius;
    const localX=x+skew*y+offset*r*r,localY=y*(1+.13*x);
    const [bottom,thickness]=Height(x,y,r);
    positions.push(localX*radii[0],localY*radii[1],bottom+(side===0?thickness:0));
    uv.push(.5+localX*.44,.5+localY*.44);
    response.push(thickness,0,0);
  }
  const layer=1+rings*segments;
  for(let side=0;side<2;side++){
    Vertex(0,0,side);
    for(let ring=1;ring<=rings;ring++)for(let j=0;j<segments;j++)Vertex(ring/rings,j/segments*tau,side);
    const offset=side*layer;
    const Face=(a,b,c)=>side===0?indices.push(offset+a,offset+b,offset+c):indices.push(offset+a,offset+c,offset+b);
    for(let j=0;j<segments;j++)Face(0,1+j,1+(j+1)%segments);
    for(let ring=1;ring<rings;ring++)for(let j=0;j<segments;j++){
      const a=1+(ring-1)*segments+j,b=1+ring*segments+j;
      const c=1+ring*segments+(j+1)%segments,d=1+(ring-1)*segments+(j+1)%segments;
      Face(a,b,c);Face(a,c,d);
    }
  }
  for(let j=0;j<segments;j++){
    const a=1+(rings-1)*segments+j,b=1+(rings-1)*segments+(j+1)%segments;
    indices.push(a,a+layer,b+layer,a,b+layer,b);
  }
  // A local tangential ridge creates a folded shaving without adding floating
  // decorations or disconnected surfaces to a deforming deposit.
  return {positions:new Float32Array(positions),indices:new Uint16Array(indices),uv:new Float32Array(uv),response:new Float32Array(response),variant};
}

export function BuildWaxDebris(rng,seed){
  const positions=[],indices=[],uv=[],response=[],grains=[];
  const detailRng=MakeRng(seed);
  for(let grain=0;grain<9;grain++){
    // Keep three draws per grain in the customer stream, so material-detail
    // changes do not move subsequent deposits or change the customer's seed.
    const size=.025+rng()*.06,x=(rng()-.5)*.62,y=(rng()-.5)*.75;
    const variant=['flake','curl','flake','crumb'][grain%4];
    const aspect=variant==='curl'?[.68,1.22]:variant==='crumb'?[.78,.85]:[1.15,.80];
    const shape=BuildWaxShape({seed:Math.floor(detailRng()*4294967295),radii:aspect.map(v=>v*size),micro:true,variant});
    const angle=detailRng()*tau,c=Math.cos(angle),s=Math.sin(angle),start=positions.length/3;
    const centerX=Clamp(x,-.38+size*1.55,.38-size*1.55),centerY=Clamp(y,-.42+size*1.55,.42-size*1.55);
    for(let i=0;i<shape.positions.length;i+=3){
      const px=shape.positions[i],py=shape.positions[i+1];
      positions.push(centerX+px*c-py*s,centerY+px*s+py*c,shape.positions[i+2]);
    }
    for(const index of shape.indices)indices.push(index+start);
    // Different atlas patches retain speck-to-speck mottling at close range.
    const u=detailRng()*.55,v=detailRng()*.55;
    for(let i=0;i<shape.uv.length;i+=2)uv.push(u+shape.uv[i]*.4,v+shape.uv[i+1]*.4);
    response.push(...shape.response);grains.push({variant,start,count:shape.positions.length/3});
  }
  return {positions:new Float32Array(positions),indices:new Uint16Array(indices),uv:new Float32Array(uv),response:new Float32Array(response),grains};
}
