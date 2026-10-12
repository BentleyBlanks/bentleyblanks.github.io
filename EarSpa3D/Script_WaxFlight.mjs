// Millimetre presentation dynamics after the final wall bond releases. Cleaning
// mass is an accounting quantity, never replaced with this area/thickness ratio.
const Clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Scene coordinates are millimetres and time is seconds: 9.81 m/s² is 9810 mm/s².
export const WaxGravityMm=9810;
export function CreateWaxFlight({positions,rotation,velocity=[0,0,0],spin=[0,0,0],type='dry',thickness=.04}){
  let x=0,y=0;const count=positions.length/3;
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(let i=0;i<positions.length;i+=3){x+=positions[i];y+=positions[i+1];minX=Math.min(minX,positions[i]);maxX=Math.max(maxX,positions[i]);minY=Math.min(minY,positions[i+1]);maxY=Math.max(maxY,positions[i+1]);}
  const radius=Math.max(.03,Math.sqrt((maxX-minX)*(maxY-minY))*.5);
  const lightness=Clamp(.075/Math.max(.012,thickness),.22,2.2);
  return {rotation:Array.from(rotation),velocity:Array.from(velocity),spin:Array.from(spin),offset:[x/count/radius,y/count/radius],radius,
    drag:(type==='dry'?7.5:type==='wet'?4.0:2.2)*lightness,angularDrag:5.5,steps:0};
}

export function StepWaxFlight(flight,position,dt,{gravity=WaxGravityMm,rotate=true,onSubstep=null}={}){
  const duration=Clamp(dt,0,.05);
  if(!duration)return flight;
  const count=Math.max(1,Math.ceil(duration*240)),h=duration/count;
  const v=flight.velocity,q=flight.rotation,w=flight.spin;
  for(let step=0;step<count;step++){
    // Local sheet normal. Air resistance is strongest broadside, letting an
    // asymmetric flake bank and drift without injecting a sine-wave force.
    const nx=2*(q[0]*q[2]+q[3]*q[1]),ny=2*(q[1]*q[2]-q[3]*q[0]),nz=1-2*(q[0]*q[0]+q[1]*q[1]);
    const normalSpeed=v[0]*nx+v[1]*ny+v[2]*nz,normalGravity=-gravity*ny;
    // Integrate dv/dt = gravity - drag * velocity exactly for this orientation.
    // Gravity accelerates every free piece equally; thickness affects air drag.
    // Exact position integration also avoids an extra full-substep gravity drop.
    const normalDrag=flight.drag,tangentDrag=flight.drag*.13;
    const normalDecay=Math.exp(-normalDrag*h),tangentDecay=Math.exp(-tangentDrag*h);
    const normalTime=normalDrag>1e-8?-Math.expm1(-normalDrag*h)/normalDrag:h;
    const tangentTime=tangentDrag>1e-8?-Math.expm1(-tangentDrag*h)/tangentDrag:h;
    const normalAccelerationTime=normalDrag>1e-8?(h-normalTime)/normalDrag:h*h*.5;
    const tangentAccelerationTime=tangentDrag>1e-8?(h-tangentTime)/tangentDrag:h*h*.5;
    const normalDistance=normalSpeed*normalTime+normalGravity*normalAccelerationTime;
    const nextNormalSpeed=normalSpeed*normalDecay+normalGravity*normalTime;
    const normal=[nx,ny,nz];
    for(let k=0;k<3;k++){
      const tangentSpeed=v[k]-normal[k]*normalSpeed;
      const tangentGravity=(k===1?-gravity:0)-normal[k]*normalGravity;
      position[k]+=tangentSpeed*tangentTime+tangentGravity*tangentAccelerationTime+normal[k]*normalDistance;
      v[k]=tangentSpeed*tangentDecay+tangentGravity*tangentTime+normal[k]*nextNormalSpeed;
    }
    if(rotate){
      // Drag through the measured asymmetric planform creates a small torque;
      // angular damping and capped acceleration keep tiny fragments stable.
      const ox=flight.offset[0],oy=flight.offset[1];
      const rx=(1-2*(q[1]*q[1]+q[2]*q[2]))*ox+2*(q[0]*q[1]-q[3]*q[2])*oy;
      const ry=2*(q[0]*q[1]+q[3]*q[2])*ox+(1-2*(q[0]*q[0]+q[2]*q[2]))*oy;
      const rz=2*(q[0]*q[2]-q[3]*q[1])*ox+2*(q[1]*q[2]+q[3]*q[0])*oy;
      const torque=Clamp(-nextNormalSpeed*flight.drag/Math.max(.2,flight.radius),-24,24),damping=Math.exp(-flight.angularDrag*h);
      w[0]=(w[0]+(ry*nz-rz*ny)*torque*h)*damping;
      w[1]=(w[1]+(rz*nx-rx*nz)*torque*h)*damping;
      w[2]=(w[2]+(rx*ny-ry*nx)*torque*h)*damping;
      const speed=Math.hypot(...w),angle=Math.min(6,speed)*h,scale=speed>1e-10?Math.sin(angle*.5)/speed:0;
      const ax=w[0]*scale,ay=w[1]*scale,az=w[2]*scale,c=Math.cos(angle*.5),[qx,qy,qz,qw]=q;
      q[0]=c*qx+ax*qw+ay*qz-az*qy;q[1]=c*qy-ax*qz+ay*qw+az*qx;
      q[2]=c*qz+ax*qy-ay*qx+az*qw;q[3]=c*qw-ax*qx-ay*qy-az*qz;
      const length=Math.hypot(...q);for(let k=0;k<4;k++)q[k]/=length;
    }
    // Contact belongs to the scene's real geometry. Resolve it at 240 Hz so a
    // fast natural fall cannot skip straight through a wall between frames.
    if(onSubstep)onSubstep(flight,position,h);
    flight.steps++;
  }
  return flight;
}
