import * as THREE from 'three';
// 管壁半径与 Blender 的内表面使用同一 profile、平滑窗口和微起伏。
// 对完整器具的表面采样做位置投影；输入扫掠限制跨帧穿越，接触时允许切向滑动。
export function CreateToolContact(profile) {
  const rows=profile.map((f,i)=>({...f,center:new THREE.Vector3().fromArray(f.center),up:new THREE.Vector3().fromArray(f.up),right:new THREE.Vector3().fromArray(f.right),radii:f.radii.map((_,j)=>{let sum=0,n=0;for(let k=Math.max(0,i-3);k<=Math.min(profile.length-1,i+3);k++){sum+=profile[k].radii[j];n++;}return sum/n;})}));
  const v=new THREE.Vector3(),axis=new THREE.Vector3(),nearest=new THREE.Vector3(),normal=new THREE.Vector3();
  // 中心线包围盒层次只裁剪不可能更近的线段，保持精确最近点并减少纤维查询成本。
  function BuildBounds(start,end){const box=new THREE.Box3();for(let i=start;i<=end;i++)box.expandByPoint(rows[i].center);const node={start,end,box};if(end-start>4){const mid=Math.floor((start+end)/2);node.left=BuildBounds(start,mid);node.right=BuildBounds(mid,end);}return node;}
  const bounds=BuildBounds(0,rows.length-1);
  function BoundDistance(node,p){const b=node.box,dx=Math.max(b.min.x-p.x,0,p.x-b.max.x),dy=Math.max(b.min.y-p.y,0,p.y-b.max.y),dz=Math.max(b.min.z-p.z,0,p.z-b.max.z);return dx*dx+dy*dy+dz*dz;}
  function Surface(point){
    let distance=Infinity,index=0,blend=0;
    function Visit(node){
      if(BoundDistance(node,point)>distance)return;
      if(node.left){const leftFirst=BoundDistance(node.left,point)<=BoundDistance(node.right,point);Visit(leftFirst?node.left:node.right);Visit(leftFirst?node.right:node.left);return;}
      for(let i=node.start;i<node.end;i++){
        axis.subVectors(rows[i+1].center,rows[i].center);const t=THREE.MathUtils.clamp(v.subVectors(point,rows[i].center).dot(axis)/axis.lengthSq(),0,1);
        nearest.copy(rows[i].center).addScaledVector(axis,t);const d=nearest.distanceToSquared(point);
        if(d<distance||(d===distance&&i<index)){distance=d;index=i;blend=t;}
      }
    }Visit(bounds);
    const a=rows[index],b=rows[index+1],t=blend;
    axis.subVectors(b.center,a.center).normalize();nearest.copy(a.center).lerp(b.center,t);
    const axial=v.subVectors(point,nearest).dot(axis);
    if((index===0&&t===0&&axial<-.03)||(index===rows.length-2&&t===1&&axial>.05))return {clearance:Infinity,normal:new THREE.Vector3(),depth:-1};
    const u=a.up.clone().lerp(b.up,t).normalize(),r=a.right.clone().lerp(b.right,t).normalize();
    const radial=v.subVectors(point,nearest),angle=(Math.atan2(radial.dot(r),radial.dot(u))+Math.PI*2)%(Math.PI*2),k=angle/(Math.PI*2)*64,lo=Math.floor(k),f=k-lo;
    const radiusAt=row=>row.radii[lo]*(1-f)+row.radii[(lo+1)%64]*f;
    const radius=radiusAt(a)*(1-t)+radiusAt(b)*t+.012*Math.sin(angle*11+(index+t)*.18)*Math.sin((index+t)*.41+angle*3);
    normal.copy(radial).addScaledVector(axis,-axial).negate().normalize();
    const slope=(radiusAt(b)-radiusAt(a))/b.center.distanceTo(a.center);normal.addScaledVector(axis,slope).normalize();
    return {clearance:radius-Math.sqrt(Math.max(0,distance-axial*axial)),normal:normal.clone(),depth:index+t};
  }
  const sampleCache=new WeakMap();
  function Samples(group){
    group.updateMatrixWorld(true);const samples=[];
    for(const part of group.children){
      if(part.userData.softFiber)continue;
      const p=part.geometry?.attributes.position;if(!p)continue;
      const cached=sampleCache.get(part);if(cached&&cached.geometry===part.geometry&&cached.version===p.version&&cached.matrix.equals(part.matrix)){samples.push(...cached.points);continue;}
      // 各轴向薄片分二十四个周向扇区保留最外顶点。头部与爪端使用更密采样。
      const bins=new Map();
      for(let i=0;i<p.count;i++){
        const point=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(part.matrix);
        const band=Math.floor(point.y/(point.y<3?.06:.20)),sector=Math.floor((Math.atan2(point.z,point.x)+Math.PI)*12/Math.PI),key=band+':'+sector;
        const old=bins.get(key);if(!old||point.x*point.x+point.z*point.z>old.x*old.x+old.z*old.z)bins.set(key,point);
      }
      const points=[...bins.values()];sampleCache.set(part,{geometry:part.geometry,version:p.version,matrix:part.matrix.clone(),points});samples.push(...points);
    }return samples;
  }
  const transformed=new THREE.Vector3();let last=null,report={contact:false,clearance:1,correction:0,samples:0,blocked:false};
  function Clearance(position,rotation,samples){let minimum=Infinity,hitNormal=null;for(const local of samples){transformed.copy(local).applyQuaternion(rotation).add(position);const hit=Surface(transformed);if(hit.clearance<minimum){minimum=hit.clearance;hitNormal=hit.normal;}}return{minimum,normal:hitNormal};}
  function Project(position,rotation,samples){
    const out=position.clone();let contact=false;
    for(let i=0;i<14;i++){const hit=Clearance(out,rotation,samples);if(hit.minimum>=.045)break;out.addScaledVector(hit.normal,Math.min(.45,.048-hit.minimum));contact=true;}
    return{position:out,contact,...Clearance(out,rotation,samples)};
  }
  function Solve(desired,rotation,samples,{sweep=true,lockPivot=false}={}){
    if(lockPivot&&last){let q=last.rotation.clone(),blocked=false,rotationFraction=0;const count=Math.max(1,Math.ceil(q.angleTo(rotation)/.025));for(let i=1;i<=count;i++){const next=last.rotation.clone().slerp(rotation,i/count);if(Clearance(desired,next,samples).minimum<.018){blocked=true;break;}q.copy(next);rotationFraction=i/count;}const hit=Clearance(desired,q,samples);report={contact:blocked,clearance:hit.minimum,correction:0,samples:samples.length,blocked,rotationFraction};last={position:desired.clone(),rotation:q.clone()};return{position:desired.clone(),rotation:q,...report};}
    let pose=Project(desired,rotation,samples),blocked=pose.minimum<-.01;
    if(sweep&&last){
      const distance=last.position.distanceTo(pose.position),steps=Math.max(1,Math.min(96,Math.max(Math.ceil(distance/.08),Math.ceil(last.rotation.angleTo(rotation)/.035))));let safe={position:last.position.clone(),rotation:last.rotation.clone()};
      for(let i=1;i<=steps;i++){
        const q=last.rotation.clone().slerp(rotation,i/steps),p=last.position.clone().lerp(pose.position,i/steps),step=Project(p,q,samples);
        if(step.minimum<-.01){blocked=true;break;}safe={position:step.position,rotation:q};
      }
      pose.position=safe.position;rotation=safe.rotation;
    }
    if(blocked&&last){pose.position.copy(last.position);rotation=last.rotation.clone();}
    const hit=Clearance(pose.position,rotation,samples);
    report={contact:pose.contact||blocked,clearance:Number.isFinite(hit.minimum)?hit.minimum:99,correction:pose.position.distanceTo(desired),samples:samples.length,blocked};
    if(hit.minimum>=-.01)last={position:pose.position.clone(),rotation:rotation.clone()};
    return{position:pose.position,rotation, ...report};
  }
  return {Surface,Samples,Solve,Clearance,Reset(){last=null;},Probe(){return{...report};}};
}
