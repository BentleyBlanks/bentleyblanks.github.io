import * as THREE from 'three';
import { PRONE_CRAWL } from './Data_Tuning_ProneCrawl.mjs';
export { PRONE_CRAWL } from './Data_Tuning_ProneCrawl.mjs';

let libraryPromise;
const skinProbeCache=new WeakMap();
export function LoadProneCrawl() {
  return libraryPromise ||= fetch(`./Animation/ProneCrawl/Animation_TengxianHumanoidV1ProneCrawl.json?v=${PRONE_CRAWL.version}`)
    .then(r=>{if(!r.ok)throw new Error(`ProneCrawl HTTP ${r.status}`);return r.json();})
    .then(json=>THREE.AnimationClip.parse(json));
}

// Authored motion supplies the reach/recovery. This layer fits the body and each
// limb to the SAME collision sampler used by movement; it never translates the capsule.
export class ProneGroundContact {
  constructor(rig) {
    this.rig=rig;this.saved=[];this.snapshots=new Map();this.active=false;
    this.v=Array.from({length:12},()=>new THREE.Vector3());
    this.q=Array.from({length:4},()=>new THREE.Quaternion());
    this.solveV=Array.from({length:8},()=>new THREE.Vector3());
    this.limbs=['L','R'].flatMap(side=>[
      {a:rig.bones['thigh'+side],b:rig.bones['calf'+side],c:rig.bones['foot'+side],side,part:'leg'},
      {a:rig.bones['upperArm'+side],b:rig.bones['forearm'+side],c:rig.bones['hand'+side],side,part:'arm'},
    ]);
    this.skin=null;
  }
  PrepareSkin() {
    if(this.skin)return;
    this.skin=[];
    this.rig.root.traverse(mesh=>{
      if(!mesh.isSkinnedMesh)return;
      let vertices=skinProbeCache.get(mesh.geometry);
      if(!vertices){
      vertices=[];const indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
      const positions=mesh.geometry.attributes.position,groups=new Map();
      // Extremes per skin influence pair bound cost independently of mesh density.
      // Mixed calf/ankle seams get their own probes, not just the ankle pivot.
      const directions=[-1,0,1].flatMap(x=>[-1,0,1].flatMap(y=>[-1,0,1].map(z=>[x,y,z]))).filter(v=>v.some(Boolean));
      const regions=mesh.skeleton.bones.map(bone=>this.limbs.findIndex(l=>new RegExp(`[ _]${l.side}[ _]`).test(bone.name) && (l.part==='leg'?/Thigh|Calf|Foot|Toe/.test(bone.name):/UpperArm|Forearm|Hand|Finger/.test(bone.name))));
      for(let i=0;i<indices.count;i++){
        const influences=[];
        for(let k=0;k<4;k++)if(weights.getComponent(i,k)>.12)influences.push({bone:indices.getComponent(i,k),weight:weights.getComponent(i,k)});
        influences.sort((a,b)=>b.weight-a.weight);if(!influences.length)continue;
        const region=regions[influences[0].bone];
        const key=influences.slice(0,2).map(v=>v.bone).sort().join(':')+':'+Math.floor(influences[0].weight*4);
        if(!groups.has(key))groups.set(key,directions.map(()=>({score:-Infinity,index:0,region})));
        const extrema=groups.get(key),x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
        for(let d=0;d<directions.length;d++){
          const [dx,dy,dz]=directions[d],score=x*dx+y*dy+z*dz;
          if(score>extrema[d].score)Object.assign(extrema[d],{score,index:i,region});
        }
      }
      const unique=new Map();for(const entries of groups.values())for(const entry of entries)unique.set(entry.index,{index:entry.index,region:entry.region});
      vertices=[...unique.values()];
      skinProbeCache.set(mesh.geometry,vertices);
      }
      this.skin.push({mesh,vertices});
    });
  }
  Restore() {
    for(const {bone,p,q} of this.saved){bone.position.copy(p);bone.quaternion.copy(q);}
    this.saved.length=0;this.active=false;
  }
  Remember(bone) {
    let saved=this.snapshots.get(bone);
    if(!saved){saved={bone,p:new THREE.Vector3(),q:new THREE.Quaternion()};this.snapshots.set(bone,saved);}
    saved.p.copy(bone.position);saved.q.copy(bone.quaternion);this.saved.push(saved);
  }
  Solve(l,target,pole) {
    // The middle joint has a height constraint, not merely a bend-direction hint.
    // A hint can still put a knee under a slope after the ankle is grounded.
    const [start,middle,end,axis,centre,up,across,knee]=this.solveV;
    l.a.getWorldPosition(start);l.b.getWorldPosition(middle);l.c.getWorldPosition(end);
    const upper=start.distanceTo(middle),lower=middle.distanceTo(end);
    axis.subVectors(target,start);
    const distance=THREE.MathUtils.clamp(axis.length(),Math.abs(upper-lower)+.0001,upper+lower-.0001);
    axis.normalize();
    const along=(upper*upper-lower*lower+distance*distance)/(2*distance);
    centre.copy(start).addScaledVector(axis,along);
    const radius=Math.sqrt(Math.max(0,upper*upper-along*along));
    up.set(0,1,0).addScaledVector(axis,-axis.y).normalize();
    if(up.y<.01){this.rig.locomotion.Solve({thigh:l.a,calf:l.b,foot:l.c,target,pole});return;}
    across.crossVectors(axis,up).normalize();
    const cosine=THREE.MathUtils.clamp((pole.y-centre.y)/Math.max(.00001,radius*up.y),-1,1);
    const sine=Math.sqrt(Math.max(0,1-cosine*cosine));
    const sign=across.dot(end.subVectors(pole,centre))<0?-1:1;
    knee.copy(centre).addScaledVector(up,radius*cosine).addScaledVector(across,radius*sine*sign);
    this.rig.locomotion.Aim(l.a,l.b,knee);this.rig.locomotion.Aim(l.b,l.c,target);
  }
  Apply(state) {
    const rig=this.rig,actor=rig.actor,probe=actor?.factory?.groundProbe;
    if(!probe||actor.allowFootIk===false||!actor.root.visible||!(state.prone>.45)
      ||state.grounded===false||state.dead||actor.ragdollState||rig.forcedClip||rig.authoredPose||state.carryRole||state.meleeCombat){for(const l of this.limbs)l.supporting=false;return;}
    if(!['ProneCrawl','StandFireCrouch'].includes(rig.currentId)){for(const l of this.limbs)l.supporting=false;return;}
    const pelvis=rig.bones.pelvis,rootY=actor.root.getWorldPosition(this.v[0]).y;
    if(!pelvis)return;
    this.PrepareSkin();
    const sample=p=>{
      const hit=probe(p.x,p.z,rootY);
      return Number.isFinite(hit?.y)?hit.y:rootY;
    };
    // Two separated torso samples give pitch; lateral samples retain cross-slope roll.
    const centre=pelvis.getWorldPosition(this.v[1]);
    const front=rig.bones.chest.getWorldPosition(this.v[2]);
    const dy=sample(front)-sample(centre), span=Math.hypot(front.x-centre.x,front.z-centre.z);
    const forward=this.v[3].subVectors(front,centre);forward.y=0;forward.normalize();
    const right=this.v[4].set(forward.z,0,-forward.x);
    const leftPoint=this.v[5].copy(centre).addScaledVector(right,-.25);
    const rightPoint=this.v[6].copy(centre).addScaledVector(right,.25);
    const pitch=THREE.MathUtils.clamp(Math.atan2(dy,Math.max(.1,span)),-PRONE_CRAWL.maximumSlopeRad,PRONE_CRAWL.maximumSlopeRad);
    const roll=THREE.MathUtils.clamp(Math.atan2(sample(rightPoint)-sample(leftPoint),.5),-PRONE_CRAWL.maximumSlopeRad,PRONE_CRAWL.maximumSlopeRad);
    // Keep each authored contact's height above the original flat support plane.
    const targets=this.limbs.map(l=>({l,end:l.c.getWorldPosition(new THREE.Vector3()),pole:l.b.getWorldPosition(new THREE.Vector3()),rotation:l.c.getWorldQuaternion(new THREE.Quaternion())}));
    this.Remember(pelvis);
    const delta=this.q[0].setFromAxisAngle(right,-pitch).multiply(this.q[1].setFromAxisAngle(forward,roll));
    pelvis.getWorldQuaternion(this.q[2]).premultiply(delta);
    pelvis.quaternion.copy(pelvis.parent.getWorldQuaternion(this.q[3]).invert().multiply(this.q[2]));
    centre.y+=THREE.MathUtils.clamp(sample(centre)-rootY,-PRONE_CRAWL.maximumGroundDeltaM,PRONE_CRAWL.maximumGroundDeltaM);
    pelvis.position.copy(pelvis.parent.worldToLocal(this.v[10].copy(centre)));
    const crawl=rig.currentId==='ProneCrawl',phase=rig.currentAction.time/rig.currentAction.getClip().duration;
    for(const {l,end,pole,rotation} of targets) {
      for(const bone of [l.a,l.b,l.c])this.Remember(bone);
      const p=(phase+(l.side==='R'?.5:0)+(l.part==='arm'?.5:0))%1;
      const contact=crawl&&p<PRONE_CRAWL.stance&&!(l.part==='arm'&&l.side==='R')
        &&state.locomotionTracked&&!rig.locomotion.discontinuity;
      if(contact){
        if(!l.supporting||p<(l.contactPhase||0)||!l.anchor)l.anchor=end.clone();
        const dx=l.anchor.x-end.x,dz=l.anchor.z-end.z;
        if(Math.hypot(dx,dz)<PRONE_CRAWL.maximumAnchorM){
          const weight=Math.min(1,p/PRONE_CRAWL.contactBlendPhase,(PRONE_CRAWL.stance-p)/PRONE_CRAWL.contactBlendPhase)*rig.currentAction.getEffectiveWeight();
          end.x+=dx*weight;end.z+=dz*weight;pole.x+=dx*weight;pole.z+=dz*weight;
        }else l.anchor.copy(end);
      }
      l.supporting=contact;l.contactPhase=p;
      end.y+=THREE.MathUtils.clamp(sample(end)-rootY,-PRONE_CRAWL.maximumGroundDeltaM,PRONE_CRAWL.maximumGroundDeltaM);
      pole.y+=THREE.MathUtils.clamp(sample(pole)-rootY,-PRONE_CRAWL.maximumGroundDeltaM,PRONE_CRAWL.maximumGroundDeltaM);
      this.Solve(l,end,pole);
      const hit=probe(end.x,end.z,rootY),normal=hit?.normal;
      if(normal){
        const n=this.v[7].fromArray(normal).normalize();
        if(n.y>.5)rotation.premultiply(this.q[1].setFromUnitVectors(this.v[8].set(0,1,0),n));
      }
      l.c.quaternion.copy(l.c.parent.getWorldQuaternion(this.q[0]).invert().multiply(rotation));
    }
    for(let pass=0;pass<4;pass++){
      let shifted=false;
      for(const {l,end} of targets){
      const a=l.a.getWorldPosition(this.v[7]),b=l.b.getWorldPosition(this.v[8]),c=l.c.getWorldPosition(this.v[9]);
      const reach=a.distanceTo(b)+b.distanceTo(c)-.001;
      const dx=end.x-a.x,dz=end.z-a.z,dy=end.y-a.y,horizontal=Math.hypot(dx,dz);
      const allowed=Math.sqrt(Math.max(.001,reach*reach-dy*dy));
      if(horizontal>allowed){
        shifted=true;const shift=Math.min(.06,horizontal-allowed);
        pelvis.getWorldPosition(centre);centre.x+=dx/horizontal*shift;centre.z+=dz/horizontal*shift;
        pelvis.position.copy(pelvis.parent.worldToLocal(this.v[10].copy(centre)));
      }
      }
      if(!shifted)break;
    }
    for(const {l,end,pole,rotation} of targets){
      this.Solve(l,end,pole);
      l.c.quaternion.copy(l.c.parent.getWorldQuaternion(this.q[0]).invert().multiply(rotation));
    }
    // Clothing is not identical across the shared skeleton. Correct against this
    // actor's visible skin, so a thicker puttee cannot sink into the same pose.
    const surfaces=[centre,...targets.flatMap(t=>[t.end,t.pole])].map(point=>{
      const hit=probe(point.x,point.z,rootY),n=hit?.normal||[0,1,0];
      return {x:point.x,z:point.z,y:hit?.y??rootY,n};
    });
    const floorAt=p=>{
      let near=surfaces[0],distance=Infinity;
      for(const s of surfaces){const d=(p.x-s.x)**2+(p.z-s.z)**2;if(d<distance){distance=d;near=s;}}
      return near.y-(near.n[0]*(p.x-near.x)+near.n[2]*(p.z-near.z))/Math.max(.5,near.n[1]);
    };
    for(let pass=0;pass<2;pass++){
      rig.root.updateWorldMatrix(true,false);rig.root.updateMatrixWorld(true);
      const lows=[Infinity,Infinity,Infinity,Infinity,Infinity];
      for(const {mesh,vertices} of this.skin){mesh.skeleton.update();for(const {index,region} of vertices){
        const p=mesh.getVertexPosition(index,this.v[9]).applyMatrix4(mesh.matrixWorld);
        const id=region<0?4:region;lows[id]=Math.min(lows[id],p.y-floorAt(p));
      }}
      const bodyLift=Math.max(0,PRONE_CRAWL.clearanceM-lows[4]);
      if(bodyLift>0){pelvis.getWorldPosition(centre);centre.y+=Math.min(.08,bodyLift);pelvis.position.copy(pelvis.parent.worldToLocal(this.v[10].copy(centre)));}
      for(let i=0;i<targets.length;i++){
        const {l,end,pole,rotation}=targets[i],lift=Math.min(.08,Math.max(0,PRONE_CRAWL.clearanceM-lows[i]));
        if(!lift&&!bodyLift)continue;
        end.y+=lift;pole.y+=lift;
        this.Solve(l,end,pole);
        l.c.quaternion.copy(l.c.parent.getWorldQuaternion(this.q[0]).invert().multiply(rotation));
      }
    }
    this.active=true;
  }
}
