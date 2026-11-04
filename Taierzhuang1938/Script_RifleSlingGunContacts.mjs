// Small, cached cross-section collider for the two terminal sections of a slung gun.
// It uses the actual visible gun geometry. Body-only contacts otherwise let the cord
// reach the swivel from the opposite side by passing through the wooden stock.
import * as THREE from 'three';
const profiles=new WeakMap();
const fractions=[.25,.5,.75];
const point=new THREE.Vector3(),relative=new THREE.Matrix4(),inverse=new THREE.Matrix4();

export function SlingPinPosition(spec,out=new THREE.Vector3()){
  out.fromArray(spec.position);
  if(spec.throat){out.x+=spec.throat[0];out.y+=spec.throat[1];out.z+=spec.throat[2];}
  return out;
}

function GunProfile(root){
  const meshes=[];root.traverse(o=>{if(o.isMesh&&!o.isSkinnedMesh&&o.geometry?.attributes.position)meshes.push(o);});
  const key=meshes[0]?.geometry;if(!key)return null;
  if(profiles.has(key))return profiles.get(key);
  const vertices=[];inverse.copy(root.matrixWorld).invert();let minZ=Infinity,maxZ=-Infinity;
  for(const mesh of meshes){
    relative.multiplyMatrices(inverse,mesh.matrixWorld);const p=mesh.geometry.attributes.position;
    for(let i=0;i<p.count;i++){
      point.fromBufferAttribute(p,i).applyMatrix4(relative);vertices.push(point.x,point.y,point.z);
      minZ=Math.min(minZ,point.z);maxZ=Math.max(maxZ,point.z);
    }
  }
  const count=Math.max(2,Math.ceil((maxZ-minZ)/.025)),step=(maxZ-minZ)/count,bounds=Array.from({length:count},()=>[Infinity,Infinity,-Infinity,-Infinity]);
  for(let i=0;i<vertices.length;i+=3){const at=Math.min(count-1,Math.floor((vertices[i+2]-minZ)/step)),b=bounds[at];b[0]=Math.min(b[0],vertices[i]);b[1]=Math.min(b[1],vertices[i+1]);b[2]=Math.max(b[2],vertices[i]);b[3]=Math.max(b[3],vertices[i+1]);}
  const sections=new Float64Array(count*4);
  for(let i=0;i<count;i++){
    let b=bounds[i];
    if(!Number.isFinite(b[0])){
      let before=i-1,after=i+1;while(before>=0&&!Number.isFinite(bounds[before][0]))before--;while(after<count&&!Number.isFinite(bounds[after][0]))after++;
      const a=bounds[Math.max(0,before)],c=bounds[Math.min(count-1,after)];b=a.map((v,k)=>Number.isFinite(v)&&Number.isFinite(c[k])?(v+c[k])*.5:Number.isFinite(v)?v:c[k]);
    }
    sections.set([(b[0]+b[2])*.5,(b[1]+b[3])*.5,Math.max(.002,(b[2]-b[0])*.5),Math.max(.002,(b[3]-b[1])*.5)],i*4);
  }
  const profile={minZ,maxZ,step,count,sections};profiles.set(key,profile);return profile;
}

export class RifleSlingGunContacts {
  constructor(root){this.root=root;this.profile=GunProfile(root);this.toGun=new THREE.Matrix4();this.fromGun=new THREE.Matrix4();this.local=new Float64Array(6);}
  SetFrame(frame){this.fromGun.copy(frame).invert().multiply(this.root.matrixWorld);this.toGun.copy(this.fromGun).invert();}
  Collide(rope){
    const shape=this.profile;if(!shape)return;
    const p=rope.p,m=this.toGun.elements,out=this.fromGun.elements,q=this.local,padding=rope.cfg.ropeRadiusM+.001;
    for(let end=0;end<2;end++)for(let part=0;part<3;part++){
      const i=end===0?part:rope.count-2-part,a=i*3,b=a+3;
      for(let k=0;k<2;k++){const at=k?b:a,x=p[at],y=p[at+1],z=p[at+2];q[k*3]=m[0]*x+m[4]*y+m[8]*z+m[12];q[k*3+1]=m[1]*x+m[5]*y+m[9]*z+m[13];q[k*3+2]=m[2]*x+m[6]*y+m[10]*z+m[14];}
      const endpoint=end===0?i+1:i;if(endpoint===0||endpoint===rope.count-1)continue;
      const offset=end===0?3:0;
      let changed=false;
      for(const t of fractions){
        const x=q[0]*(1-t)+q[3]*t,y=q[1]*(1-t)+q[4]*t,z=q[2]*(1-t)+q[5]*t;
        if(z<shape.minZ||z>shape.maxZ)continue;
        const at=Math.min(shape.count-1,Math.floor((z-shape.minZ)/shape.step))*4,S=shape.sections;
        const rx=S[at+2]+padding,ry=S[at+3]+padding,nx=(x-S[at])/rx,ny=(y-S[at+1])/ry;
        if(nx*nx+ny*ny>=1)continue;
        const weight=end===0?t:1-t;
        // Near the side, slide round that side. A single downward plane overconstrains
        // the cord between the stock and a body and falsely stretches its last span.
        if(Math.abs(nx)>.35){
          const sign=nx<0?-1:1,target=S[at]+sign*rx*Math.sqrt(Math.max(.01,1-ny*ny));
          q[offset]+=THREE.MathUtils.clamp((target-x+sign*.0005)/weight,-.02,.02);
        }else{
          const target=S[at+1]-ry*Math.sqrt(Math.max(.01,1-nx*nx));
          q[offset+1]+=Math.max(-.02,(target-y-.0005)/weight);
        }
        changed=true;
      }
      if(!changed)continue;
      const x=q[offset],y=q[offset+1],z=q[offset+2],at=endpoint*3;
      p[at]=out[0]*x+out[4]*y+out[8]*z+out[12];p[at+1]=out[1]*x+out[5]*y+out[9]*z+out[13];p[at+2]=out[2]*x+out[6]*y+out[10]*z+out[14];
    }
  }
}
