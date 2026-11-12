import { FLOW_RENDERING } from "../Data_Tuning_LevelFlow.mjs";

function Mix(a,b,t) {
  const channels=[1,3,5].map(index=>{
    const from=parseInt(a.slice(index,index+2),16),to=parseInt(b.slice(index,index+2),16);
    return Math.round(from+(to-from)*t);
  });
  return `rgb(${channels.join(",")})`;
}

export function DrawEncounterSky(context,width,height,view) {
  const sky=FLOW_RENDERING.sky,gradient=context.createLinearGradient(0,0,0,height);
  const orthographic=view.type==="oblique"&&!view.freeCamera;
  for(let index=0;index<=16;index++) {
    const y=height*index/16,offset=orthographic?0:-(y-height*0.49)/view.focal;
    const elevation=(view.forward[1]+view.up[1]*offset)/Math.hypot(1,offset);
    const color=elevation>=0?Mix(sky.horizon,sky.zenith,Math.pow(elevation,0.45)):Mix(sky.horizon,sky.below,Math.min(1,-elevation*2));
    gradient.addColorStop(index/16,color);
  }
  context.fillStyle=gradient;context.fillRect(0,0,width,height);
  const direction=sky.sunDirection,length=Math.hypot(...direction);
  const position=view.eye.map((value,axis)=>value+direction[axis]/length*view.far*0.9);
  const sun=view.Vertex(position);
  if(sun.depth<=0||sun.x<-50||sun.x>width+50||sun.y<-50||sun.y>height+50) return;
  const radius=Math.max(12,width*0.035),glow=context.createRadialGradient(sun.x,sun.y,0,sun.x,sun.y,radius);
  glow.addColorStop(0,sky.sun+"bb");glow.addColorStop(0.12,sky.sun+"66");glow.addColorStop(1,sky.sun+"00");
  context.fillStyle=glow;context.fillRect(sun.x-radius,sun.y-radius,radius*2,radius*2);
}
