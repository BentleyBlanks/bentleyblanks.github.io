// 可见块体使用薄壳，细微颗粒保留低成本刚体；两者共用工具和附着接口。
import {BindWaxSurface,GripWaxSurface,UngripWaxSurface,StepWaxSurface,WriteWaxSurface} from './Script_SoftWaxPhysics.mjs?v=ear018-body-bending-20260912';
export {BindWaxSurface as BindPeelSurface,WriteWaxSurface as WritePeelSurface};
const Add=(a,b)=>a.map((x,i)=>x+b[i]);
const Sub=(a,b)=>a.map((x,i)=>x-b[i]);
const Mul=(a,s)=>a.map(x=>x*s);
const Dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const Length=a=>Math.hypot(...a);
const Cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const Unit=a=>Mul(a,1/(Length(a)||1));
const Cap=(a,max)=>Length(a)>max?Mul(Unit(a),max):a;
const Clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
function Product(a,b){return[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];}
function Rotate(q,v){const r=Product(Product(q,[...v,0]),[-q[0],-q[1],-q[2],q[3]]);return r.slice(0,3);}
function World(body,local){return Add(body.position,Rotate(body.rotation,local));}
const PROFILES={dry:{stiffness:55,strength:.22,damping:2.8},wet:{stiffness:20,strength:.65,damping:2.0},impacted:{stiffness:105,strength:.37,damping:3.5}};

export function CreatePeelBody({position,rotation,normal,size,type='dry',footprint=null,anchorCount=5}){
  const body={position:[...position],rotation:[...rotation],origin:[...position],restRotation:[...rotation],normal:Unit(normal),size,type,
    velocity:[0,0,0],spin:[0,0,0],grip:null,detached:false,strain:0,force:0,contact:false,softness:0,steps:0};
  body.anchors=Array.from({length:anchorCount},(_,i)=>{
    const a=(i/anchorCount)*Math.PI*2;
    const local=[Math.cos(a)*(footprint?.[0]||size)*.63,Math.sin(a)*(footprint?.[1]||size)*.7,0];
    return{local,rest:World(body,local),alive:true,strain:0};
  });
  return body;
}

export function GripPeelBody(body,point){
  if(body.surface){GripWaxSurface(body,point);return;}
  body.grip=Rotate([-body.rotation[0],-body.rotation[1],-body.rotation[2],body.rotation[3]],Sub(point,body.position));
}
export function UngripPeelBody(body){body.grip=null;if(body.surface)UngripWaxSurface(body);}
export function GetGripPoint(body){return World(body,body.grip||[0,0,0]);}
export function MovePeelBody(body,position){
  const delta=Sub(position,body.position);
  if(body.surface)for(const point of body.surface.points)for(let k=0;k<3;k++)point[k]+=delta[k];
  body.position=position.slice();body.velocity=[0,0,0];
}

export function StepPeelBody(body,{target=null,softness=0,efficiency=1,supportRotation=null,adhesion=1,minAnchors=0}={},dt=1/60){
  if(body.surface)return StepWaxSurface(body,{target,softness,efficiency,supportRotation,adhesion,minAnchors},dt);
  const count=Math.max(1,Math.ceil(Math.min(.05,dt)*240)),h=Math.min(.05,dt)/count;
  const profile=PROFILES[body.type]||PROFILES.dry;
  const soft=Clamp(softness);
  body.softness=soft;
  for(let step=0;step<count;step++){
    let force=[0,0,0],torque=[0,0,0];body.strain=0;
    function Apply(point,f){force=Add(force,f);torque=Add(torque,Cross(Sub(point,body.position),f));}
    if(body.grip&&target){
      const point=World(body,body.grip),arm=Sub(point,body.position);
      const speed=Add(body.velocity,Cross(body.spin,arm));
      const handForce=Cap(Sub(Mul(Sub(target,point),150*efficiency),Mul(speed,15)),135);
      Apply(point,handForce);body.force=Length(handForce);
    }else body.force=0;
    for(const anchor of body.anchors){
      if(!anchor.alive)continue;
      const point=World(body,anchor.local),displacement=Sub(point,anchor.rest);
      const opening=Math.max(0,Dot(displacement,body.normal));
      const slide=Length(Sub(displacement,Mul(body.normal,Dot(displacement,body.normal))));
      const strength=profile.strength*(1-soft*.48)*Math.sqrt(adhesion);
      anchor.strain=(opening+slide*.26)/strength;
      body.strain=Math.max(body.strain,anchor.strain);
      // 裂开由局部受力决定：反复小幅空划、停在原处都不会积累“完成进度”。
      if(anchor.strain>1&&body.anchors.filter(a=>a.alive).length>minAnchors){anchor.alive=false;continue;}
      const speed=Add(body.velocity,Cross(body.spin,Sub(point,body.position)));
      Apply(point,Sub(Mul(displacement,-profile.stiffness*(1-soft*.48)*adhesion*5/body.anchors.length),Mul(speed,profile.damping*5/body.anchors.length)));
    }
    body.detached=body.anchors.every(a=>!a.alive);
    if(body.detached&&body.grip&&supportRotation){
      // 勺面/夹爪提供角向支撑，松脱后不会像绳子吊着那样翻滚穿过工具。
      const delta=Product(supportRotation,[-body.rotation[0],-body.rotation[1],-body.rotation[2],body.rotation[3]]);
      const sign=delta[3]<0?-1:1;
      torque=Add(torque,Sub(Mul(delta.slice(0,3),sign*32),Mul(body.spin,5)));
    }
    body.velocity=Cap(Mul(Add(body.velocity,Mul(force,h)),Math.exp(-h*5.5)),24);
    body.spin=Cap(Mul(Add(body.spin,Mul(torque,h/(.16+body.size*body.size*.5))),Math.exp(-h*8)),12);
    body.position=Add(body.position,Mul(body.velocity,h));
    const angle=Length(body.spin)*h;
    if(angle>1e-7){const axis=Unit(body.spin);body.rotation=Product([...Mul(axis,Math.sin(angle/2)),Math.cos(angle/2)],body.rotation);body.rotation=Mul(body.rotation,1/Math.hypot(...body.rotation));}
    // 内壁是实体支撑面，工具把块体往皮肤里推时会受到反力。
    let penetration=0;
    for(const anchor of body.anchors){penetration=Math.max(penetration,-Dot(Sub(World(body,anchor.local),body.origin),body.normal));}
    body.contact=penetration>.0001;
    if(penetration>0){body.position=Add(body.position,Mul(body.normal,penetration));const inward=Dot(body.velocity,body.normal);if(inward<0)body.velocity=Sub(body.velocity,Mul(body.normal,inward));}
    body.steps++;
  }
  return{detached:body.detached,remaining:body.anchors.filter(a=>a.alive).length,strain:Clamp(body.strain),force:body.force,contact:body.contact};
}
