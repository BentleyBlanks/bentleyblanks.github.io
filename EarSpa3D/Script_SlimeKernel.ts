// f64 XPBD kernels. Keep projection order and arithmetic identical to the JS fallback.
// Rebuild: node EarSpa3D/Script_SlimeKernelBuild.mjs
@inline function Read(base:usize,index:i32):f64{return load<f64>(base+usize(index)*8);}
@inline function Write(base:usize,index:i32,value:f64):void{store<f64>(base+usize(index)*8,value);}
// Anchor: node offset, rest xyz, lambda xyz. Plane: point xyz, normal xyz,
// clearance. Grip: target xyz, lambda xyz, then (node offset, weight) pairs.
export function Project(p:usize,edges:usize,edgeEnd:i32,tets:usize,tetEnd:i32,anchors:usize,anchorEnd:i32,planes:usize,hasPlanes:i32,grip:usize,gripCount:i32,mass:i32,iterations:i32,volumeAlpha:f64,anchorAlpha:f64,gripAlpha:f64,cap:f64,floor:f64,hasFloor:i32):i32{
 let contact:i32=0;
 for(let iteration=0;iteration<iterations;iteration++){
  Edges(p,edges,edgeEnd,f64(mass));Tetrahedra(p,tets,tetEnd,volumeAlpha,f64(mass));
  for(let j=0;j<anchorEnd;j+=7){const id=i32(Read(anchors,j));for(let k=0;k<3;k++){
   const dl=(-(Read(p,id+k)-Read(anchors,j+1+k))-anchorAlpha*Read(anchors,j+4+k))/(f64(mass)+anchorAlpha);
   Write(anchors,j+4+k,Read(anchors,j+4+k)+dl);Write(p,id+k,Read(p,id+k)+dl*f64(mass));
  }}
  if(gripCount){
   let x:f64=0,y:f64=0,z:f64=0,w:f64=0;
   for(let j=0;j<gripCount;j++){const id=i32(Read(grip,6+j*2)),weight=Read(grip,7+j*2);w+=weight*weight*f64(mass);x+=Read(p,id)*weight;y+=Read(p,id+1)*weight;z+=Read(p,id+2)*weight;}
   let nx=Read(grip,3)+(-(x-Read(grip,0))-gripAlpha*Read(grip,3))/(w+gripAlpha),ny=Read(grip,4)+(-(y-Read(grip,1))-gripAlpha*Read(grip,4))/(w+gripAlpha),nz=Read(grip,5)+(-(z-Read(grip,2))-gripAlpha*Read(grip,5))/(w+gripAlpha);
   const length=Math.sqrt(nx*nx+ny*ny+nz*nz);if(length>cap){const scale=cap/length;nx*=scale;ny*=scale;nz*=scale;}
   const dx=nx-Read(grip,3),dy=ny-Read(grip,4),dz=nz-Read(grip,5);Write(grip,3,nx);Write(grip,4,ny);Write(grip,5,nz);
   for(let j=0;j<gripCount;j++){const id=i32(Read(grip,6+j*2)),scale=Read(grip,7+j*2)*f64(mass);Write(p,id,Read(p,id)+dx*scale);Write(p,id+1,Read(p,id+1)+dy*scale);Write(p,id+2,Read(p,id+2)+dz*scale);}
  }
  if(hasPlanes)for(let i=0;i<mass;i++){
   const j=i*3,q=i*7,nx=Read(planes,q+3),ny=Read(planes,q+4),nz=Read(planes,q+5);
   const depth=Read(planes,q+6)+((Read(p,j)-Read(planes,q))*nx+(Read(p,j+1)-Read(planes,q+1))*ny+(Read(p,j+2)-Read(planes,q+2))*nz)-(hasPlanes==1?.012:0);
   if(depth<0){Write(p,j,Read(p,j)-nx*depth);Write(p,j+1,Read(p,j+1)-ny*depth);Write(p,j+2,Read(p,j+2)-nz*depth);contact=1;}
  }
  if(hasFloor)for(let j=1;j<mass*3;j+=3)if(Read(p,j)<floor){Write(p,j,floor);contact=1;}
 }
 return contact;
}
export function Edges(p:usize,edges:usize,end:i32,mass:f64):void{
 for(let j:i32=0;j<end;j+=5){
  const a=i32(Read(edges,j)),b=i32(Read(edges,j+1)),x=Read(p,a)-Read(p,b),y=Read(p,a+1)-Read(p,b+1),z=Read(p,a+2)-Read(p,b+2),length=Math.sqrt(x*x+y*y+z*z);if(length<1e-9)continue;
  const alpha=Read(edges,j+4),dl=(-(length-Read(edges,j+2))-alpha*Read(edges,j+3))/(2*mass+alpha);Write(edges,j+3,Read(edges,j+3)+(dl));const k=dl*mass/length;
  Write(p,a,Read(p,a)+(x*k));Write(p,a+1,Read(p,a+1)+(y*k));Write(p,a+2,Read(p,a+2)+(z*k));Write(p,b,Read(p,b)-(x*k));Write(p,b+1,Read(p,b+1)-(y*k));Write(p,b+2,Read(p,b+2)-(z*k));
 }
}
export function Tetrahedra(p:usize,tets:usize,end:i32,alpha:f64,mass:f64):void{
 for(let j:i32=0;j<end;j+=6){
  const a=i32(Read(tets,j)),b=i32(Read(tets,j+1)),c=i32(Read(tets,j+2)),d=i32(Read(tets,j+3)),bx=Read(p,b)-Read(p,a),by=Read(p,b+1)-Read(p,a+1),bz=Read(p,b+2)-Read(p,a+2),cx=Read(p,c)-Read(p,a),cy=Read(p,c+1)-Read(p,a+1),cz=Read(p,c+2)-Read(p,a+2),dx=Read(p,d)-Read(p,a),dy=Read(p,d+1)-Read(p,a+1),dz=Read(p,d+2)-Read(p,a+2);
  const gbx=(cy*dz-cz*dy)/6,gby=(cz*dx-cx*dz)/6,gbz=(cx*dy-cy*dx)/6,gcx=(dy*bz-dz*by)/6,gcy=(dz*bx-dx*bz)/6,gcz=(dx*by-dy*bx)/6,gdx=(by*cz-bz*cy)/6,gdy=(bz*cx-bx*cz)/6,gdz=(bx*cy-by*cx)/6,gax=-gbx-gcx-gdx,gay=-gby-gcy-gdy,gaz=-gbz-gcz-gdz;
  const volume=bx*gbx+by*gby+bz*gbz,weight=(gax*gax+gay*gay+gaz*gaz+gbx*gbx+gby*gby+gbz*gbz+gcx*gcx+gcy*gcy+gcz*gcz+gdx*gdx+gdy*gdy+gdz*gdz)*mass,dl=(-(volume-Read(tets,j+4))-alpha*Read(tets,j+5))/(weight+alpha),correction=dl*mass;Write(tets,j+5,Read(tets,j+5)+(dl));
  Write(p,a,Read(p,a)+(gax*correction));Write(p,a+1,Read(p,a+1)+(gay*correction));Write(p,a+2,Read(p,a+2)+(gaz*correction));Write(p,b,Read(p,b)+(gbx*correction));Write(p,b+1,Read(p,b+1)+(gby*correction));Write(p,b+2,Read(p,b+2)+(gbz*correction));Write(p,c,Read(p,c)+(gcx*correction));Write(p,c+1,Read(p,c+1)+(gcy*correction));Write(p,c+2,Read(p,c+2)+(gcz*correction));Write(p,d,Read(p,d)+(gdx*correction));Write(p,d+1,Read(p,d+1)+(gdy*correction));Write(p,d+2,Read(p,d+2)+(gdz*correction));
 }
}
