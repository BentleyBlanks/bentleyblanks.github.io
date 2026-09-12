// Same sequential XPBD projections in contiguous, body-owned scratch storage.
// Public nodes, velocities and material topology remain the authoritative state.
export function ProjectSlimeConstraints(body,{edgeAlpha,volumeAlpha,adhesion,efficiency,h2,gripTarget,planes,supports,floor}){
 const s=body.gel,mass=s.points.length;
 const cache=s.projection||(s.projection={points:new Float64Array(mass*3),edges:new Float64Array(s.edges.length*5),tets:new Float64Array(s.tetrahedra.length*6)});
 const p=cache.points,edges=cache.edges,tets=cache.tets;
 for(let i=0;i<mass;i++){const q=s.points[i];p[i*3]=q[0];p[i*3+1]=q[1];p[i*3+2]=q[2];}
 for(let i=0;i<s.edges.length;i++){const c=s.edges[i],j=i*5;edges[j]=c.i*3;edges[j+1]=c.j*3;edges[j+2]=c.memory;edges[j+3]=0;edges[j+4]=edgeAlpha*(s.bite&&(s.bite.mask[c.i]||s.bite.mask[c.j])?8:1);}
 for(let i=0;i<s.tetrahedra.length;i++){const c=s.tetrahedra[i],j=i*6;tets[j]=c.ids[0]*3;tets[j+1]=c.ids[1]*3;tets[j+2]=c.ids[2]*3;tets[j+3]=c.ids[3]*3;tets[j+4]=c.rest;tets[j+5]=0;}
 const anchorAlpha=2e-6/Math.max(.05,adhesion)/h2,gripAlpha=.0015/Math.max(.03,efficiency)/h2,cap=90*h2;
 for(let iteration=0;iteration<(s.coating?16:8);iteration++){
  Edges(p,edges,mass);Tetrahedra(p,tets,volumeAlpha,mass);
  for(const a of body.anchors)if(a.alive){const id=a.node*3;for(let k=0;k<3;k++){const dl=(-(p[id+k]-a.rest[k])-anchorAlpha*a.lambda[k])/(mass+anchorAlpha);a.lambda[k]+=dl;p[id+k]+=dl*mass;}}
  if(gripTarget)Grip(p,s.grip,gripTarget,gripAlpha,mass,cap);
  if(planes){for(let i=0;i<mass;i++){const plane=planes[i],j=i*3,q=plane.point,n=plane.normal,depth=plane.clearance+((p[j]-q[0])*n[0]+(p[j+1]-q[1])*n[1]+(p[j+2]-q[2])*n[2])-.012;if(depth<0){p[j]-=n[0]*depth;p[j+1]-=n[1]*depth;p[j+2]-=n[2]*depth;body.contact=true;}}}
  else if(supports&&!body.detached){const n=body.normal;for(let i=0;i<mass;i++){const j=i*3,q=supports[i],depth=(p[j]-q[0])*n[0]+(p[j+1]-q[1])*n[1]+(p[j+2]-q[2])*n[2];if(depth<0){p[j]-=n[0]*depth;p[j+1]-=n[1]*depth;p[j+2]-=n[2]*depth;body.contact=true;}}}
  if(floor!==null)for(let j=1;j<p.length;j+=3)if(p[j]<floor){p[j]=floor;body.contact=true;}
 }
 for(let i=0;i<mass;i++){const q=s.points[i];q[0]=p[i*3];q[1]=p[i*3+1];q[2]=p[i*3+2];}
 for(let i=0;i<s.edges.length;i++)s.edges[i].lambda=edges[i*5+3];
 for(let i=0;i<s.tetrahedra.length;i++)s.tetrahedra[i].lambda=tets[i*6+5];
}
function Edges(p,edges,mass){
 for(let j=0;j<edges.length;j+=5){
  const a=edges[j],b=edges[j+1],x=p[a]-p[b],y=p[a+1]-p[b+1],z=p[a+2]-p[b+2],length=Math.sqrt(x*x+y*y+z*z);if(length<1e-9)continue;
  const alpha=edges[j+4],dl=(-(length-edges[j+2])-alpha*edges[j+3])/(2*mass+alpha);edges[j+3]+=dl;const k=dl*mass/length;
  p[a]+=x*k;p[a+1]+=y*k;p[a+2]+=z*k;p[b]-=x*k;p[b+1]-=y*k;p[b+2]-=z*k;
 }
}
function Tetrahedra(p,tets,alpha,mass){
 for(let j=0;j<tets.length;j+=6){
  const a=tets[j],b=tets[j+1],c=tets[j+2],d=tets[j+3],bx=p[b]-p[a],by=p[b+1]-p[a+1],bz=p[b+2]-p[a+2],cx=p[c]-p[a],cy=p[c+1]-p[a+1],cz=p[c+2]-p[a+2],dx=p[d]-p[a],dy=p[d+1]-p[a+1],dz=p[d+2]-p[a+2];
  const gbx=(cy*dz-cz*dy)/6,gby=(cz*dx-cx*dz)/6,gbz=(cx*dy-cy*dx)/6,gcx=(dy*bz-dz*by)/6,gcy=(dz*bx-dx*bz)/6,gcz=(dx*by-dy*bx)/6,gdx=(by*cz-bz*cy)/6,gdy=(bz*cx-bx*cz)/6,gdz=(bx*cy-by*cx)/6,gax=-gbx-gcx-gdx,gay=-gby-gcy-gdy,gaz=-gbz-gcz-gdz;
  const volume=bx*gbx+by*gby+bz*gbz,weight=(gax*gax+gay*gay+gaz*gaz+gbx*gbx+gby*gby+gbz*gbz+gcx*gcx+gcy*gcy+gcz*gcz+gdx*gdx+gdy*gdy+gdz*gdz)*mass,dl=(-(volume-tets[j+4])-alpha*tets[j+5])/(weight+alpha),correction=dl*mass;tets[j+5]+=dl;
  p[a]+=gax*correction;p[a+1]+=gay*correction;p[a+2]+=gaz*correction;p[b]+=gbx*correction;p[b+1]+=gby*correction;p[b+2]+=gbz*correction;p[c]+=gcx*correction;p[c+1]+=gcy*correction;p[c+2]+=gcz*correction;p[d]+=gdx*correction;p[d+1]+=gdy*correction;p[d+2]+=gdz*correction;
 }
}
function Grip(p,g,target,alpha,mass,cap){
 const {ids,weights,lambda}=g;let x=0,y=0,z=0,w=0;
 for(let j=0;j<ids.length;j++){const id=ids[j]*3,weight=weights[j];w+=weight*weight*mass;x+=p[id]*weight;y+=p[id+1]*weight;z+=p[id+2]*weight;}
 let nx=lambda[0]+(-(x-target[0])-alpha*lambda[0])/(w+alpha),ny=lambda[1]+(-(y-target[1])-alpha*lambda[1])/(w+alpha),nz=lambda[2]+(-(z-target[2])-alpha*lambda[2])/(w+alpha);
 const length=Math.sqrt(nx*nx+ny*ny+nz*nz);if(length>cap){const scale=cap/length;nx*=scale;ny*=scale;nz*=scale;}
 const dx=nx-lambda[0],dy=ny-lambda[1],dz=nz-lambda[2];lambda[0]=nx;lambda[1]=ny;lambda[2]=nz;
 for(let j=0;j<ids.length;j++){const id=ids[j]*3,scale=weights[j]*mass;p[id]+=dx*scale;p[id+1]+=dy*scale;p[id+2]+=dz*scale;}
}
