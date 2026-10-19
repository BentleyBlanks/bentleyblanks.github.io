import * as THREE from 'three';
import { PRONE_CRAWL } from './Data_Tuning_ProneCrawl.mjs';
export { PRONE_CRAWL } from './Data_Tuning_ProneCrawl.mjs';

let libraryPromise;
const skinProbeCache=new WeakMap();
const skinPackCache=new WeakMap();
/** Probe vertices as flat arrays (bind-space position, 4 influences, region) — shared per geometry. */
function SkinProbePack(geometry,vertices) {
  let pack=skinPackCache.get(geometry);
  if(pack)return pack;
  const position=geometry.attributes.position,indices=geometry.attributes.skinIndex,weights=geometry.attributes.skinWeight;
  const count=vertices.length,used=new Set();
  pack={geometry,count,pos:new Float64Array(count*3),skin:new Uint16Array(count*4),weight:new Float64Array(count*4),region:new Int8Array(count),used:null};
  vertices.forEach(({index,region},i)=>{
    pack.pos[i*3]=position.getX(index);pack.pos[i*3+1]=position.getY(index);pack.pos[i*3+2]=position.getZ(index);
    for(let k=0;k<4;k++){
      const w=weights.getComponent(index,k);pack.weight[i*4+k]=w;pack.skin[i*4+k]=indices.getComponent(index,k);
      if(w!==0)used.add(pack.skin[i*4+k]);
    }
    pack.region[i]=region;
  });
  pack.used=Uint16Array.from(used);
  skinPackCache.set(geometry,pack);
  return pack;
}
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
    this.solveV=Array.from({length:7},()=>new THREE.Vector3());
    this.hingeV=Array.from({length:4},()=>new THREE.Vector3());
    this.hingeQ=Array.from({length:4},()=>new THREE.Quaternion());
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
      for(const l of this.limbs)if(l.part==='arm'&&!l.restHinge){
        const skeleton=mesh.skeleton,ia=skeleton.bones.indexOf(l.a),ib=skeleton.bones.indexOf(l.b);
        if(ia<0||ib<0)continue;
        const upper=skeleton.boneInverses[ia].clone().invert(),lower=skeleton.boneInverses[ib].clone().invert();
        const q=new THREE.Quaternion();upper.decompose(new THREE.Vector3(),q,new THREE.Vector3());
        // TengxianHumanoidV1 bind arms extend sideways, and flex toward source
        // +Z. Store the SIGNED hinge in the upper arm, not a world-space pole.
        l.restHinge=new THREE.Vector3().setFromMatrixPosition(lower).sub(new THREE.Vector3().setFromMatrixPosition(upper))
          .normalize().cross(new THREE.Vector3(0,0,1)).normalize().applyQuaternion(q.invert());
        const ic=skeleton.bones.indexOf(l.c);
        if(ic>=0){
          l.restWrist=new THREE.Quaternion();
          skeleton.boneInverses[ib].clone().multiply(skeleton.boneInverses[ic].clone().invert())
            .decompose(new THREE.Vector3(),l.restWrist,new THREE.Vector3());
        }
      }
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
      this.skin.push({mesh,vertices,pack:SkinProbePack(mesh.geometry,vertices),boneN:new Float64Array(mesh.skeleton.bones.length*16)});
    });
  }
  // Lowest skinned probe (minus floor) per region. Same sum as SkinnedMesh.getVertexPosition
  // (every non-zero influence, bindMatrix → bone → bindMatrixInverse → matrixWorld), but with
  // per-bone matrices folded once per pass: ~1.5–2k probes per soldier made three's per-vertex
  // path the whole cost of a prone squad (07-4 blockout, 29 prone ≈ 47 ms/frame).
  _SkinLows(lows,floorAt) {
    const m=this.m4||=new THREE.Matrix4(),w=this.w4||=new THREE.Matrix4(),p=this.v[9];
    for(const {mesh,vertices,pack,boneN} of this.skin){
      const morph=mesh.geometry.morphAttributes.position&&mesh.morphTargetInfluences?.some(v=>v!==0);
      if(morph||pack.geometry!==mesh.geometry||boneN.length<mesh.skeleton.bones.length*16){
        for(const {index,region} of vertices){
          mesh.getVertexPosition(index,p).applyMatrix4(mesh.matrixWorld);
          const id=region<0?4:region;lows[id]=Math.min(lows[id],p.y-floorAt(p.x,p.z));
        }
        continue;
      }
      const bones=mesh.skeleton.bones,inverses=mesh.skeleton.boneInverses;
      for(const j of pack.used){m.multiplyMatrices(bones[j].matrixWorld,inverses[j]).multiply(mesh.bindMatrix);boneN.set(m.elements,j*16);}
      const e=w.multiplyMatrices(mesh.matrixWorld,mesh.bindMatrixInverse).elements;
      const {count,pos,skin,weight,region}=pack;
      for(let i=0;i<count;i++){
        const x=pos[i*3],y=pos[i*3+1],z=pos[i*3+2];
        let sx=0,sy=0,sz=0;
        for(let k=i*4,end=k+4;k<end;k++){
          const wk=weight[k];if(wk===0)continue;
          const o=skin[k]*16;
          sx+=wk*(boneN[o]*x+boneN[o+4]*y+boneN[o+8]*z+boneN[o+12]);
          sy+=wk*(boneN[o+1]*x+boneN[o+5]*y+boneN[o+9]*z+boneN[o+13]);
          sz+=wk*(boneN[o+2]*x+boneN[o+6]*y+boneN[o+10]*z+boneN[o+14]);
        }
        const wx=e[0]*sx+e[4]*sy+e[8]*sz+e[12],wy=e[1]*sx+e[5]*sy+e[9]*sz+e[13],wz=e[2]*sx+e[6]*sy+e[10]*sz+e[14];
        const id=region[i]<0?4:region[i];lows[id]=Math.min(lows[id],wy-floorAt(wx,wz));
      }
    }
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
    // Transport the authored bend plane. The old exact-height circle chose one
    // of two roots every solve, flipping elbows/knees near a straight limb.
    const [start,middle,end,axis,centre,bend,knee]=this.solveV;
    l.a.getWorldPosition(start);l.b.getWorldPosition(middle);l.c.getWorldPosition(end);
    const upper=start.distanceTo(middle),lower=middle.distanceTo(end);
    axis.subVectors(target,start);
    const distance=THREE.MathUtils.clamp(axis.length(),Math.abs(upper-lower)+.002,upper+lower-.006);
    axis.normalize();
    const along=(upper*upper-lower*lower+distance*distance)/(2*distance);
    centre.copy(start).addScaledVector(axis,along);
    const radius=Math.sqrt(Math.max(0,upper*upper-along*along));
    bend.subVectors(pole,start).addScaledVector(axis,-bend.dot(axis));
    if(bend.lengthSq()<1e-6){
      bend.copy(l.authoredBend).addScaledVector(axis,-bend.dot(axis));
    }
    bend.normalize();
    knee.copy(centre).addScaledVector(bend,radius);
    this.rig.locomotion.Aim(l.a,l.b,knee);this.rig.locomotion.Aim(l.b,l.c,target);
    if(l.restHinge){
      // Transport the anatomical bend axis after each terrain solve. Keeping
      // the elbow position continuous does not prevent a backwards elbow:
      // upper-arm roll must follow the signed shoulder/elbow/wrist plane too.
      const [u,v,hinge,want]=this.hingeV,[upperQ,lowerQ,rollQ,parentQ]=this.hingeQ;
      l.a.getWorldPosition(start);l.b.getWorldPosition(middle);l.c.getWorldPosition(end);
      u.subVectors(middle,start).normalize();v.subVectors(end,middle).normalize();want.crossVectors(u,v);
      if(want.lengthSq()>1e-5){
        want.normalize();l.a.getWorldQuaternion(upperQ);l.b.getWorldQuaternion(lowerQ);
        hinge.copy(l.restHinge).applyQuaternion(upperQ);
        const angle=Math.atan2(u.dot(v.crossVectors(hinge,want)),hinge.dot(want));
        upperQ.premultiply(rollQ.setFromAxisAngle(u,angle));
        l.a.quaternion.copy(l.a.parent.getWorldQuaternion(parentQ).invert().multiply(upperQ));
        // Preserve forearm pronation and the hand; this roll changes neither
        // endpoints nor lengths, and does not transfer the error into the wrist.
        l.b.quaternion.copy(l.b.parent.getWorldQuaternion(parentQ).invert().multiply(lowerQ));
      }
    }
  }
  OrientEnd(l,rotation) {
    if(l.part==='arm'&&l.side==='R'&&l.restWrist&&this.rig.currentId==='ProneCrawl'){
      // The carrying palm has an authored world orientation. Let the forearm
      // take its pronation, while preserving its solved direction, instead of
      // leaving terrain-induced roll at the wrist.
      const [desired,parent,relative,align]=this.hingeQ,[axis,want,start,end]=this.hingeV;
      desired.copy(rotation).multiply(relative.copy(l.restWrist).invert());
      axis.copy(l.c.position).normalize().applyQuaternion(desired);
      l.b.getWorldPosition(start);l.c.getWorldPosition(end);want.subVectors(end,start).normalize();
      desired.premultiply(align.setFromUnitVectors(axis,want));
      l.b.quaternion.copy(l.b.parent.getWorldQuaternion(parent).invert().multiply(desired));
    }
    l.c.quaternion.copy(l.c.parent.getWorldQuaternion(this.q[0]).invert().multiply(rotation));
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
    const targets=this.limbs.map(l=>{
      const end=l.c.getWorldPosition(new THREE.Vector3()),pole=l.b.getWorldPosition(new THREE.Vector3());
      l.authoredBend ||= new THREE.Vector3();l.authoredBend.copy(pole).sub(l.a.getWorldPosition(this.v[7]));
      return {l,end,pole,rotation:l.c.getWorldQuaternion(new THREE.Quaternion())};
    });
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
      if(normal&&l.part==='arm'&&l.side==='L'){
        const n=this.v[7].fromArray(normal).normalize();
        if(n.y>.5)rotation.premultiply(this.q[1].setFromUnitVectors(this.v[8].set(0,1,0),n));
      }
      this.OrientEnd(l,rotation);
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
      this.OrientEnd(l,rotation);
    }
    // Clothing is not identical across the shared skeleton. Correct against this
    // actor's visible skin, so a thicker puttee cannot sink into the same pose.
    // state.proneSkinFit === false (distant crowds) keeps the contact fit above, skips this.
    if(state.proneSkinFit===false){this.active=true;return;}
    // Surface i as [x, z, y, n0, n2, max(.5, n1)] — flat, since floorAt runs once per skin probe.
    const surfaces=this.surfaces||=new Float64Array(9*6);
    [centre,...targets.flatMap(t=>[t.end,t.pole])].forEach((point,i)=>{
      const hit=probe(point.x,point.z,rootY),n=hit?.normal||[0,1,0];
      surfaces.set([point.x,point.z,hit?.y??rootY,n[0],n[2],Math.max(.5,n[1])],i*6);
    });
    const floorAt=(px,pz)=>{
      // A continuous field avoids jumping between nearest tangent planes on
      // small humps, which previously fed discontinuous height into the IK.
      let height=0,total=0;
      for(let o=0;o<surfaces.length;o+=6){
        const dx=px-surfaces[o],dz=pz-surfaces[o+1],t=dx*dx+dz*dz+.025,w=1/(t*t*t);
        height+=w*(surfaces[o+2]-(surfaces[o+3]*dx+surfaces[o+4]*dz)/surfaces[o+5]);total+=w;
      }
      return height/total;
    };
    const lows=this.lows||=new Float64Array(5);
    for(let pass=0;pass<2;pass++){
      rig.root.updateWorldMatrix(true,false);rig.root.updateMatrixWorld(true);
      lows.fill(Infinity);
      this._SkinLows(lows,floorAt);
      const bodyLift=Math.max(0,PRONE_CRAWL.clearanceM-lows[4]);
      if(bodyLift>0){pelvis.getWorldPosition(centre);centre.y+=Math.min(.08,bodyLift);pelvis.position.copy(pelvis.parent.worldToLocal(this.v[10].copy(centre)));}
      let lifted=bodyLift>0;
      for(let i=0;i<targets.length;i++){
        const {l,end,pole,rotation}=targets[i],lift=Math.min(.08,Math.max(0,PRONE_CRAWL.clearanceM-lows[i]));
        if(!lift&&!bodyLift)continue;
        lifted=true;
        end.y+=lift;pole.y+=lift;
        this.Solve(l,end,pole);
        this.OrientEnd(l,rotation);
      }
      // Nothing moved: a second measurement would read the same lows.
      if(!lifted)break;
    }
    this.active=true;
  }
}
