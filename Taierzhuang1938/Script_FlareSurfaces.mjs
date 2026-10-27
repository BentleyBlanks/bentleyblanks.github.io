// Read-only queries of roof-bearing batches, including tiles and wall caps.
// Structural tags select batches; ALL their visible triangles can support cloth.
// No new gameplay colliders or draws.
// Roof holes use the same fracture data and current cut uniforms as rendering.
import * as THREE from 'three';
import {FRACTURE_PATTERNS,FRACTURE_SEGMENT_COUNT} from './Data_FracturePatterns.mjs';

function CutAt(p,u){
 if(!u||u.enabled.value<.5)return false;
 for(let i=0;i<u.count.value;i++){
  const c=u.centers.value[i],h=u.halves.value[i],m=u.metas.value[i];
  const dx=p.x-c.x,dy=p.y-c.y,dz=p.z-c.z,x=dx*c.w-dz*h.w,z=dx*h.w+dz*c.w;
  let a,b,d,half;
  if(m.x<.5){a=z/Math.max(h.z,.0001);b=dy/Math.max(h.y,.0001);d=x;half=h.x;}
  else if(m.x<1.5){a=x/Math.max(h.x,.0001);b=z/Math.max(h.z,.0001);d=dy;half=h.y;}
  else{a=x/Math.max(h.x,.0001);b=dy/Math.max(h.y,.0001);d=z;half=h.z;}
  if(Math.abs(d)>half)continue;
  const pattern=FRACTURE_PATTERNS[Math.max(0,Math.round(m.y))];let radius=.85;
  if(pattern){let s=((Math.atan2(b,a)-pattern.angleOffset)/(Math.PI*2)%1+1)%1*FRACTURE_SEGMENT_COUNT;
   const k=Math.floor(s),f=s-k,w=f*f*(3-2*f);radius=pattern.radii[k]*(1-w)+pattern.radii[(k+1)%FRACTURE_SEGMENT_COUNT]*w;}
  if(Math.hypot(a,b)<=radius)return true;
 }return false;
}

export class FlareSurfaceIndex {
 constructor(scene,library){this.scene=scene;this.library=library;this.cellSize=8;this.ray=new THREE.Ray();this.a=new THREE.Vector3();this.b=new THREE.Vector3();this.c=new THREE.Vector3();this.hit=new THREE.Vector3();this.normal=new THREE.Vector3();this.edge=new THREE.Vector3();this.Clear();}
 Clear(){this.signature='';this.meshes=[];this.grid=new Map();this.data=new Float32Array();this.owners=new Uint32Array();this.sides=new Uint8Array();this.stamps=new Uint32Array();this.serial=0;this.queries=0;this.buildMs=0;}
 Visible(mesh){for(let o=mesh;o;o=o.parent){if(!o.visible)return false;if(o===this.scene)return true;}return false;}
 Refresh(){
  const started=performance.now();
  const meshes=[];
  this.scene.traverseVisible(o=>{if(o.isMesh&&!o.isInstancedMesh&&!o.isBatchedMesh&&o.geometry?.userData.effectSurfaceRanges)meshes.push(o);});
  for(const mesh of meshes)mesh.updateWorldMatrix(true,false);
  const signature=meshes.map(o=>[o.id,o.geometry.id,o.geometry.attributes.position.version,...(Array.isArray(o.material)?o.material:[o.material]).map(m=>m?.side??0),...o.matrixWorld.elements].join(',')).join('|');
  if(signature===this.signature)return;this.Clear();this.signature=signature;this.meshes=meshes;
  const count=meshes.reduce((n,m)=>n+Math.floor((m.geometry.index?.count??m.geometry.attributes.position.count)/3),0);
  const rows=new Float32Array(count*15),owners=new Uint32Array(count),sides=new Uint8Array(count);let cursor=0;
  for(let mi=0;mi<meshes.length;mi++){
   const mesh=meshes[mi],g=mesh.geometry,p=g.attributes.position,flipped=mesh.matrixWorld.determinant()<0;
   for(let n=0;n<(g.index?.count??p.count);n+=3){
    this.a.fromBufferAttribute(p,g.index?g.index.getX(n):n).applyMatrix4(mesh.matrixWorld);
    this.b.fromBufferAttribute(p,g.index?g.index.getX(n+1):n+1).applyMatrix4(mesh.matrixWorld);
    this.c.fromBufferAttribute(p,g.index?g.index.getX(n+2):n+2).applyMatrix4(mesh.matrixWorld);
    const minX=Math.min(this.a.x,this.b.x,this.c.x),maxX=Math.max(this.a.x,this.b.x,this.c.x),minZ=Math.min(this.a.z,this.b.z,this.c.z),maxZ=Math.max(this.a.z,this.b.z,this.c.z);
    const index=cursor++,o=index*15;owners[index]=mi;
    const material=Array.isArray(mesh.material)?mesh.material[g.groups.find(group=>n>=group.start&&n<group.start+group.count)?.materialIndex??0]:mesh.material;
    const side=material?.side??THREE.FrontSide;
    sides[index]=flipped&&side!==THREE.DoubleSide?(side===THREE.FrontSide?THREE.BackSide:THREE.FrontSide):side;
    rows[o]=this.a.x;rows[o+1]=this.a.y;rows[o+2]=this.a.z;rows[o+3]=this.b.x;rows[o+4]=this.b.y;rows[o+5]=this.b.z;
    rows[o+6]=this.c.x;rows[o+7]=this.c.y;rows[o+8]=this.c.z;rows[o+9]=minX;rows[o+10]=maxX;
    rows[o+11]=Math.min(this.a.y,this.b.y,this.c.y);rows[o+12]=Math.max(this.a.y,this.b.y,this.c.y);rows[o+13]=minZ;rows[o+14]=maxZ;
    for(let x=Math.floor(minX/this.cellSize);x<=Math.floor(maxX/this.cellSize);x++)for(let z=Math.floor(minZ/this.cellSize);z<=Math.floor(maxZ/this.cellSize);z++){
      const key=x+':'+z;let list=this.grid.get(key);if(!list){list=[];this.grid.set(key,list);}list.push(index);
    }
   }
  }this.data=rows;this.owners=owners;this.sides=sides;this.stamps=new Uint32Array(count);
  for(const [key,list]of this.grid)this.grid.set(key,new Uint32Array(list));
  this.buildMs=performance.now()-started;
 }
 TraceSegment(from,to){
  if(!this.data.length)return null;this.queries++;
  const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z,length=Math.hypot(dx,dy,dz);if(length<1e-7)return null;
  this.ray.origin.set(from.x,from.y,from.z);this.ray.direction.set(dx/length,dy/length,dz/length);
  const minY=Math.min(from.y,to.y),maxY=Math.max(from.y,to.y);let best=null,bestDistance=length+.0001;
  const minX=Math.min(from.x,to.x),maxX=Math.max(from.x,to.x),minZ=Math.min(from.z,to.z),maxZ=Math.max(from.z,to.z);
  this.serial++;if(this.serial>=0xffffffff){this.stamps.fill(0);this.serial=1;}
  for(let x=Math.floor(Math.min(from.x,to.x)/this.cellSize);x<=Math.floor(Math.max(from.x,to.x)/this.cellSize);x++)for(let z=Math.floor(Math.min(from.z,to.z)/this.cellSize);z<=Math.floor(Math.max(from.z,to.z)/this.cellSize);z++){
   for(const index of this.grid.get(x+':'+z)||[]){
    if(this.stamps[index]===this.serial)continue;this.stamps[index]=this.serial;const i=index*15,d=this.data;
    if(d[i+12]<minY||d[i+11]>maxY||d[i+10]<minX||d[i+9]>maxX||d[i+14]<minZ||d[i+13]>maxZ||!this.Visible(this.meshes[this.owners[index]]))continue;
    this.a.fromArray(d,i);this.b.fromArray(d,i+3);this.c.fromArray(d,i+6);
    // Match the actual material's visible winding. Treating every triangle as
    // double-sided let invisible tile backs support candles above the roof.
    const side=this.sides[index];
    const hit=side===THREE.BackSide?this.ray.intersectTriangle(this.c,this.b,this.a,true,this.hit)
      :this.ray.intersectTriangle(this.a,this.b,this.c,side!==THREE.DoubleSide,this.hit);
    if(!hit)continue;
    const distance=this.hit.distanceTo(this.ray.origin);if(distance>bestDistance||CutAt(this.hit,this.library?.destruction))continue;
    this.normal.subVectors(this.b,this.a).cross(this.edge.subVectors(this.c,this.a)).normalize();if(this.normal.dot(this.ray.direction)>0)this.normal.negate();
    bestDistance=distance;best={fraction:Math.min(1,distance/length),point:{x:this.hit.x,y:this.hit.y,z:this.hit.z},normal:this.normal.toArray(),surface:'solid'};
   }
  }return best;
 }
 Inspect(){let bytes=this.data.byteLength+this.owners.byteLength+this.sides.byteLength+this.stamps.byteLength;for(const list of this.grid.values())bytes+=list.byteLength;return {meshes:this.meshes.length,triangles:this.owners.length,cells:this.grid.size,queries:this.queries,bytes,buildMs:this.buildMs};}
}
