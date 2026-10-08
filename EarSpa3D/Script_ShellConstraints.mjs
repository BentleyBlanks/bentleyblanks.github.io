// Allocation-free inner constraints. Each hinge owns its scratch gradients;
// bodies never borrow another body's solver state.
export function ShellDistance(points,c,alpha,inverseMass){
  const a=points[c.a],b=points[c.b],x=a[0]-b[0],y=a[1]-b[1],z=a[2]-b[2];
  const length=Math.hypot(x,y,z);if(length<1e-10)return;
  const lambda=(-(length-c.rest)-alpha*c.lambda)/(2*inverseMass+alpha);
  c.lambda+=lambda;const scale=lambda*inverseMass/length;
  a[0]+=x*scale;a[1]+=y*scale;a[2]+=z*scale;
  b[0]-=x*scale;b[1]-=y*scale;b[2]-=z*scale;
}

export function ShellDihedral(points,ids,result={angle:0,gradients:null},withGradients=true){
  const a=points[ids[0]],b=points[ids[1]],c=points[ids[2]],d=points[ids[3]];
  const ex=b[0]-a[0],ey=b[1]-a[1],ez=b[2]-a[2];
  const cx=c[0]-a[0],cy=c[1]-a[1],cz=c[2]-a[2];
  const dx=d[0]-a[0],dy=d[1]-a[1],dz=d[2]-a[2];
  const n0x=ey*cz-ez*cy,n0y=ez*cx-ex*cz,n0z=ex*cy-ey*cx;
  const n1x=dy*ez-dz*ey,n1y=dz*ex-dx*ez,n1z=dx*ey-dy*ex;
  const length=Math.hypot(ex,ey,ez),sq0=n0x*n0x+n0y*n0y+n0z*n0z,sq1=n1x*n1x+n1y*n1y+n1z*n1z;
  if(length<1e-8||sq0<1e-14||sq1<1e-14){result.angle=0;result.valid=false;return result;}
  // The common normal normalization cancels in atan2.
  result.angle=Math.atan2(((n0y*n1z-n0z*n1y)*ex+(n0z*n1x-n0x*n1z)*ey+(n0x*n1y-n0y*n1x)*ez)/length,n0x*n1x+n0y*n1y+n0z*n1z);
  result.valid=true;
  if(!withGradients)return result;
  const q=result.gradients??=Array.from({length:4},()=>[0,0,0]);
  const s0=-length/sq0,s1=-length/sq1,invLength2=1/(length*length);
  q[2][0]=n0x*s0;q[2][1]=n0y*s0;q[2][2]=n0z*s0;
  q[3][0]=n1x*s1;q[3][1]=n1y*s1;q[3][2]=n1z*s1;
  const u=((c[0]-b[0])*ex+(c[1]-b[1])*ey+(c[2]-b[2])*ez)*invLength2;
  const v=((d[0]-b[0])*ex+(d[1]-b[1])*ey+(d[2]-b[2])*ez)*invLength2;
  for(let k=0;k<3;k++){q[0][k]=q[2][k]*u+q[3][k]*v;q[1][k]=-(q[0][k]+q[2][k]+q[3][k]);}
  return result;
}

export function ShellBend(points,c,alpha,inverseMass){
  const result=ShellDihedral(points,c.ids,c.scratch??={angle:0,gradients:null});
  if(!result.valid)return;
  let error=result.angle-c.rest;if(error>Math.PI)error-=2*Math.PI;if(error<-Math.PI)error+=2*Math.PI;
  const gradients=result.gradients;let weight=0;
  for(let j=0;j<4;j++){const q=gradients[j];weight+=(q[0]*q[0]+q[1]*q[1]+q[2]*q[2])*inverseMass;}
  const lambda=(-error-alpha*c.lambda)/(weight+alpha);c.lambda+=lambda;
  for(let j=0;j<4;j++){const p=points[c.ids[j]],q=gradients[j];for(let k=0;k<3;k++)p[k]+=q[k]*lambda*inverseMass;}
}
