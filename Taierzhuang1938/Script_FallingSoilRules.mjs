// Deterministic bounded emission / contact rules. No Three or DOM dependency.
import {EvaluateCurve,NormalizeParticleModules} from './Script_ParticleModules.mjs';
import {Mulberry32} from './Script_Noise.mjs';
import {FALLING_SOIL_DEFAULTS as D,FALLING_SOIL_PRESETS as P,FALLING_SOIL_SCHEMA as S,FALLING_SOIL_LIMITS as L,FALLING_SOIL_STAGE} from './Data_Tuning_FallingSoil.mjs';
const Clone=value=>JSON.parse(JSON.stringify(value));
const Clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const Vec=a=>({x:a[0],y:a[1],z:a[2]});
const Dot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0);
const Length=a=>Math.hypot(...a);
const Normal=a=>{const n=Length(a);return n>1e-8?a.map(v=>v/n):[0,1,0]};
export function NormalizeSoilPreview(data=FALLING_SOIL_STAGE){
  const result=Clone(FALLING_SOIL_STAGE),limits={groundY:[-3,3],y:[.1,6],x:[-4,4],z:[-4,4],width:[.1,6],depth:[.05,2],height:[.03,.6]};
  function Apply(target,patch){if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new Error('Invalid falling soil preview');
    for(const [key,value]of Object.entries(patch)){
      if(!Object.hasOwn(target,key))throw new Error('Unknown soil preview field: '+key);
      if(typeof target[key]==='object'){Apply(target[key],value);continue;}
      if(typeof value!==typeof target[key]||typeof value==='number'&&(!Number.isFinite(value)||value<limits[key][0]||value>limits[key][1]))throw new Error('Invalid soil preview field: '+key);
      target[key]=value;
    }}
  Apply(result,data);return result;
}
export function NormalizeFallingSoil(config={},preset='SoilCeilingShake'){
  if(!Object.hasOwn(P,preset))throw new Error('Unknown falling soil preset: '+preset);
  const result=Clone(D);
  for(const patch of [P[preset].config,config]){
    if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new Error('Falling soil config must be an object');
    for(const [group,fields]of Object.entries(patch)){
      if(!Object.hasOwn(S,group)||!fields||typeof fields!=='object'||Array.isArray(fields))throw new Error('Unknown falling soil group: '+group);
      for(const [key,value]of Object.entries(fields)){
        const schema=S[group].fields[key];if(!Object.hasOwn(S[group].fields,key))throw new Error('Unknown falling soil field: '+group+'.'+key);
        const error=()=>{throw new Error('Invalid falling soil field: '+group+'.'+key)};
        if(schema.type==='boolean'&&typeof value!=='boolean')error();
        if(schema.type==='number'&&(!Number.isFinite(value)||value<schema.min||value>schema.max||schema.step===1&&!Number.isInteger(value)))error();
        if(schema.type==='enum'&&!Object.hasOwn(schema.options,value))error();
        if(schema.type==='vector'&&(!Array.isArray(value)||value.length!==3||value.some(n=>!Number.isFinite(n)||n<schema.min||n>schema.max)))error();
        if(schema.type==='color'&&(!Array.isArray(value)||value.length!==4||value.some((n,i)=>!Number.isFinite(n)||n<0||n>(i===3?1:4))))error();
        if(schema.type==='curve'){
          // Reuse the production module curve validator (including key order).
          NormalizeParticleModules({velocityOverLifetime:{x:value}});
          const times=new Set([0,1]),Collect=curve=>{if(Array.isArray(curve))for(const [time]of curve)times.add(time);else if(curve&&typeof curve==='object'){Collect(curve.curve);Collect(curve.min);Collect(curve.max);}};
          Collect(value);for(const time of times)for(const random of [0,1]){const n=EvaluateCurve(value,time,random);if(n<schema.min||n>schema.max)error();}
        }
        result[group][key]=Clone(value);
      }
    }
  }
  return result;
}
export function RotateSoilVector(v,r){
  const [x,y,z]=r;let [a,b,c]=v;
  [a,b]=[a*Math.cos(z)-b*Math.sin(z),a*Math.sin(z)+b*Math.cos(z)];
  [a,c]=[a*Math.cos(y)+c*Math.sin(y),-a*Math.sin(y)+c*Math.cos(y)];
  [b,c]=[b*Math.cos(x)-c*Math.sin(x),b*Math.sin(x)+c*Math.cos(x)];return [a,b,c];
}
export function SoilTrajectory(p,age){
  const k=Math.max(.05,p.drag),e=Math.exp(-k*age);
  const position=p.origin.map((n,i)=>n+(p.velocity[i]-p.force[i]/k)*(1-e)/k+p.force[i]*age/k);
  const velocity=p.velocity.map((n,i)=>n*e+p.force[i]*(1-e)/k);
  if(p.noise){const phase=p.seed*31,clock=age*p.noise.frequency,a=p.noise.strength;
    position[0]+=(Math.sin(clock+phase)-Math.sin(phase))*a;
    position[2]+=(Math.sin(clock*1.37+phase*1.9)-Math.sin(phase*1.9))*a*.7;}
  return {position,velocity};
}
export class FallingSoilSimulation{
  constructor(config={},host={},preset='SoilCeilingShake'){
    this.preset=preset;this.config=NormalizeFallingSoil(config,preset);this.host=host;this.initialEmitter=Clone(this.config.emitter);this.moves=[];this.Reset();
  }
  Reset(){this.time=0;this.remainder=0;this.emitting=true;this.paused=false;this.nextId=0;this.random=Mulberry32(this.config.emitter.seed);
    this.grains=[];this.clods=[];this.dust=[];this.contacts=[];this.cache=new Map();this.eventAccumulator=0;this.settledCount=0;this.accumulator={grains:0,clods:0,dust:0};
    this.stats={emitted:{grains:0,clods:0,dust:0},dropped:{grains:0,clods:0,dust:0},impacts:0,grainImpacts:0,dustImpacts:0,deposited:0,fragments:0,rays:0,groundSamples:0,probeFallbacks:0,skippedClodChecks:0};
    this.intensityRandom=Mulberry32(this.config.emitter.seed^0x6a85)();
    const random=Mulberry32(this.config.emitter.seed^0x73524),count=this.config.emitter.streams;
    this.streams=Array.from({length:count},(_,i)=>[(i+.2+random()*.6)/count-.5,random()-.5,random()]);
    this.host.onReset?.();return this;
  }
  Configure(patch){this.config=NormalizeFallingSoil({...this.config,...Object.fromEntries(Object.entries(patch).map(([key,value])=>[key,{...this.config[key],...value}]))},this.preset);if(patch.emitter){this.initialEmitter=Clone(this.config.emitter);this.moves=[];}return this.config;}
  Move(position,rotation=null){
    this.config=NormalizeFallingSoil({...this.config,emitter:{...this.config.emitter,position,...(rotation?{rotation}:{})}},this.preset);
    this.moves=this.moves.filter(move=>move.at<this.time);this.moves.push({at:this.time,emitter:Clone(this.config.emitter)});return this.config;
  }
  Stop({clear=false}={}){this.emitting=false;if(clear){this.grains=[];this.clods=[];this.dust=[];this.settledCount=0;this.contacts=[];this.host.onReset?.();}return this;}
  Pause(){this.paused=true;return this;}
  Play(){this.paused=false;this.emitting=true;return this;}
  get Active(){return this.emitting||this.grains.length+this.clods.length+this.dust.length>0;}
  Update(dt){if(!Number.isFinite(dt)||dt<0||dt>L.maxCatchup)throw new Error('Falling soil dt must be 0–120 seconds');if(this.paused||!this.Active)return;
    this.remainder+=dt;while(this.remainder+1e-9>=L.step&&this.Active){this.Tick(L.step);this.remainder=Math.max(0,this.remainder-L.step);}}
  Pose(time){let e=this.initialEmitter;for(const move of this.moves)if(move.at<=time+1e-9)e=move.emitter;else break;
    const h=this.host.transformAt?.(time);
    if(!h)return {position:e.position,rotation:e.rotation};
    const rotation=h.rotation||[0,0,0],offset=RotateSoilVector(e.position,rotation);
    return {position:offset.map((n,i)=>n+(h.position?.[i]||0)),rotation:e.rotation,hostRotation:rotation};
  }
  Source(time,random=this.random,extraSpread=0){
    const e=this.config.emitter,pose=this.Pose(time);let x=random()-.5,z=random()-.5;
    const period=this.config.timing.pulseOn+this.config.timing.pulseOff;
    if(e.distribution==='streams'||e.distribution==='segments'){
      let index;
      if(e.distribution==='segments')index=Math.floor(Math.max(0,time-this.config.timing.delay)/period)%e.streams;
      else {const weights=this.streams.map(s=>1-e.densityVariation+s[2]*e.densityVariation*2),total=weights.reduce((sum,n)=>sum+n,0);let weight=random()*total;index=weights.length-1;for(let i=0;i<weights.length;i++){weight-=weights[i];if(weight<=0){index=i;break;}}}
      const stream=this.streams[index%this.streams.length];
      x=e.distribution==='segments'?(index+.5)/e.streams-.5:stream[0];z=stream[1];
      x+=(random()-.5)*e.streamWidth/Math.max(.001,e.width);z+=(random()-.5)*e.streamWidth/Math.max(.001,e.length);
    }else if(e.distribution==='edge'){
      if(random()<e.edgeBias){if(random()<.5)x=(random()<.5?-1:1)*.49;else z=(random()<.5?-1:1)*.49;}
    }
    if(extraSpread>0){x+=(random()-.5)*extraSpread/e.width;z+=(random()-.5)*extraSpread/e.length;}
    let offset=e.shape==='point'?[0,0,0]:[Clamp(x,-.5,.5)*e.width,0,Clamp(z,-.5,.5)*e.length];
    offset=RotateSoilVector(offset,pose.rotation);if(pose.hostRotation)offset=RotateSoilVector(offset,pose.hostRotation);
    return {position:offset.map((n,i)=>n+pose.position[i]),pose};
  }
  NewParticle(layer,birth,source=null,impact=false){
    const c=this.config,m=c[layer],random=this.random,phase=Clamp((birth-c.timing.delay)/c.timing.duration,0,1),seed=random();
    source||=this.Source(birth,random,layer==='dust'?m.sourceSpread:0);const speed=EvaluateCurve(m.speed,phase,random()),size=EvaluateCurve(m.size,phase,random());
    let velocity=[(random()-.5)*m.spread,-speed,(random()-.5)*m.spread];
    velocity=RotateSoilVector(velocity,source.pose.rotation);if(source.pose.hostRotation)velocity=RotateSoilVector(velocity,source.pose.hostRotation);
    const drift=layer==='dust'?m.drift:1,drag=m.drag;
    let down=RotateSoilVector([0,-1,0],source.pose.rotation);if(source.pose.hostRotation)down=RotateSoilVector(down,source.pose.hostRotation);
    const p={id:++this.nextId,layer,birth,life:EvaluateCurve(m.life,phase,random()),size,seed,rotation:random()*Math.PI*2,
      origin:source.position.map((n,i)=>n+down[i]*(impact?0:c.emitter.clearance)),velocity,force:c.motion.wind.map((n,i)=>n*drag*drift-(i===1?c.motion.gravity*m.gravity:0)),drag,
      color:[...m.color],noise:{strength:c.motion.turbulence*(m.noiseScale??1),frequency:c.motion.frequency}};
    if(layer==='grains')p.color=p.color.map((n,i)=>i===3?n:n*(1+(seed*2-1)*m.colorVariation));
    if(layer==='dust'&&!impact)p.origin[1]-=p.size*m.aspect*.65;
    if(layer==='clods')Object.assign(p,{position:[...p.origin],angles:[p.rotation,random()*6.28,random()*6.28],
      spin:Array.from({length:3},()=>EvaluateCurve(m.spin,phase,random())),radius:size*Math.max(...m.aspect)*(this.host.clodRadiusScale??.55),bounces:0,resting:false,slowTime:0,generation:0});
    if(layer==='clods'){p.origin=p.origin.map((n,i)=>n+down[i]*p.radius);p.position=[...p.origin];}
    return p;
  }
  Add(layer,p){
    const cap=Math.min(this.config[layer].maxParticles,L[layer]);
    if(!this.config[layer].enabled||this[layer].length>=cap||this.host.allow?.(layer)===false){this.stats.dropped[layer]++;return false;}
    if(this.host.onEmit?.(layer,p)===false){this.stats.dropped[layer]++;return false;}
    this[layer].push(p);this.stats.emitted[layer]++;return true;
  }
  Ground(x,z){this.stats.groundSamples++;const n=this.host.groundAt?.(x,z);return Number.isFinite(n)?n:null;}
  Hit(from,to,radius=0,ray=true,priority=false){
    const delta=to.map((n,i)=>n-from[i]),distance=Length(delta);let best=null;
    if(ray&&distance>1e-7&&this.host.raycast&&this.checks<this.config.budget.rayChecks&&this.host.allowRay?.(priority)!==false){
      this.checks++;this.stats.rays++;const dir=delta.map(n=>n/distance),h=this.host.raycast(Vec(from),Vec(dir),distance+radius);
      if(h&&Number.isFinite(h.t)&&h.t>=0&&h.t<=distance+radius){const normal=Normal(Array.isArray(h.normal)?h.normal:[h.normal.x,h.normal.y,h.normal.z]);
        const t=Clamp((h.t-radius/Math.max(.15,Math.abs(Dot(dir,normal))))/distance,0,1);
        best={fraction:t,position:from.map((n,i)=>n+delta[i]*t+normal[i]*L.contactEpsilon),normal};}
    }else if(ray&&this.host.raycast)this.stats.probeFallbacks++;
    const g=this.Ground(to[0],to[2]);
    if(g!==null&&to[1]-radius<=g&&delta[1]<=0){
      let low=0,high=1;
      for(let i=0;i<8;i++){const t=(low+high)*.5,q=from.map((n,j)=>n+delta[j]*t),height=this.Ground(q[0],q[2]);if(height!==null&&q[1]-radius<=height)high=t;else low=t;}
      if(!best||high<best.fraction){const q=from.map((n,i)=>n+delta[i]*high),height=this.Ground(q[0],q[2]);
        const a=this.Ground(q[0]-.05,q[2])??height,b=this.Ground(q[0]+.05,q[2])??height,d=this.Ground(q[0],q[2]-.05)??height,e=this.Ground(q[0],q[2]+.05)??height;
        best={fraction:high,position:[q[0],height+radius+L.contactEpsilon,q[2]],normal:Normal([(a-b)/.1,1,(d-e)/.1])};}
    }
    return best;
  }
  PredictGrain(p){
    const b=this.config.budget;if(p.layer==='grains'?(!b.grainCollision||!this.config.grains.collision):!this.config.dust.collision)return;
    const key=p.layer+'/'+[...p.origin,...p.velocity].map((n,i)=>Math.round(n/(i<3?b.contactCell:.5))).join(',');
    const cached=this.cache.get(key);let hit=cached&&this.time-cached.time<=b.contactCacheS?cached.hit:undefined;
    if(hit===undefined){let previous=p.origin;hit=null;
      for(let i=1;i<=b.probeSegments;i++){const age=p.life*i/b.probeSegments,next=SoilTrajectory(p,age).position,h=this.Hit(previous,next,0,true);
        if(h){hit={age:p.life*(i-1+h.fraction)/b.probeSegments,normal:h.normal,point:h.position};break;}previous=next;}
      this.cache.set(key,{time:this.time,hit});
    }
    if(hit){
      // Chord casts find a surface, then solve against its tangent plane using
      // the exact same damped/noisy trajectory as the GPU, not the chord time.
      const Side=age=>Dot(SoilTrajectory(p,age).position.map((n,i)=>n-hit.point[i]),hit.normal);
      if(Side(0)>0&&Side(p.life)<=0){let low=0,high=p.life;for(let i=0;i<12;i++){const mid=(low+high)*.5;if(Side(mid)>0)low=mid;else high=mid;}
        if(high>.001){p.life=high;p.contact={at:p.birth+p.life,position:SoilTrajectory(p,p.life).position,normal:hit.normal};}}
    }
  }
  ImpactDust(position,normal,strength,birth){
    const d=this.config.dust;if(!d.enabled||strength<=0)return;
    this.accumulator.impact=(this.accumulator.impact||0)+strength*d.impactAmount;
    const count=Math.min(24,Math.floor(this.accumulator.impact));this.accumulator.impact-=count;
    for(let i=0;i<count;i++){
      const p=this.NewParticle('dust',birth,{position,pose:{rotation:[0,0,0]}},true),r=this.random;
      p.origin=p.origin.map((n,j)=>n+normal[j]*.035);p.size*=d.impactSize;
      p.velocity=[(r()-.5)*d.spread*d.impactSpread+normal[0]*d.impactLift,normal[1]*d.impactLift,(r()-.5)*d.spread*d.impactSpread+normal[2]*d.impactLift];
      // A brief puff settles and drifts; no sustained buoyancy/upward fire plume.
      p.drag=d.impactDrag;p.life=EvaluateCurve(d.impactLife,0,r());
      p.force=this.config.motion.wind.map((n,i)=>n*p.drag*d.drift-(i===1?this.config.motion.gravity*d.impactGravity:0));
      p.impact=true;this.Add('dust',p);
    }
  }
  Deposit(p){
    const g=this.config.grains;if(!g.deposit||this.settledCount>=g.maxDeposits||this.random()>g.depositChance)return;
    const h=p.contact,q={...p,id:++this.nextId,birth:h.at,life:g.depositLifetime,size:p.size*g.depositSize,rotation:this.random()*Math.PI*2,
      origin:h.position.map((n,i)=>n+h.normal[i]*L.contactEpsilon),velocity:[0,0,0],force:[0,0,0],drag:.05,noise:null,
      settled:true,normal:[...h.normal],contact:undefined};
    if(this.Add('grains',q)){this.stats.deposited++;this.settledCount++;}
  }
  MoveClods(dt){
    const m=this.config.clods,fragments=[];
    for(const p of this.clods){
      if(p.resting||this.time<p.birth)continue;
      const age=Math.min(dt,this.time-p.birth),next=SoilTrajectory({...p,origin:p.position},age);
      let hit=null;
      if(m.collision){
        // Give real clods priority over the sparse predictive grain probes.
        if(this.host.raycast&&this.checks>=this.config.budget.rayChecks){this.stats.skippedClodChecks++;continue;}
        hit=this.Hit(p.position,next.position,p.radius,true,true);
      }
      p.position=hit?hit.position:next.position;p.velocity=next.velocity;
      for(let i=0;i<3;i++)p.angles[i]+=p.spin[i]*age;
      if(!hit)continue;
      // Sweep with a conservative bound, then put the actual rotated geometry
      // on the surface. A bounding sphere alone leaves thin clods floating.
      const support=this.host.clodSupport?.(p,hit.normal)??p.radius;
      p.position=p.position.map((n,i)=>n+hit.normal[i]*(support-p.radius));
      const vn=Dot(p.velocity,hit.normal),impact=Math.max(0,-vn);if(impact>Math.max(.1,m.stopSpeed))p.bounces++;this.stats.impacts++;
      if(impact>m.stopSpeed)this.ImpactDust(p.position,hit.normal,m.impactDust*(p.size/.065),this.time);
      if(p.generation<L.maxFragmentGeneration&&impact>=m.fragmentThreshold&&this.random()<m.fragmentChance&&(m.response==='fragment'||m.response==='bounce')){
        for(let i=0;i<m.fragmentCount;i++){
          const q=this.NewParticle('clods',this.time,{position:p.position,pose:{rotation:[0,0,0]}});
          q.size=p.size*m.fragmentScale;q.radius=q.size*Math.max(...m.aspect)*(this.host.clodRadiusScale??.55);q.generation=p.generation+1;
          q.position=q.position.map((n,j)=>n+hit.normal[j]*(q.radius+L.contactEpsilon));q.origin=[...q.position];
          q.velocity=hit.normal.map(n=>n*m.fragmentSpeed+(this.random()-.5)*m.fragmentSpeed);fragments.push(q);
        }
        if(m.response==='fragment')p.life=this.time-p.birth;
      }
      const tangent=p.velocity.map((n,i)=>n-hit.normal[i]*vn);
      p.velocity=tangent.map((n,i)=>n*(1-m.friction)-Math.min(0,vn)*m.restitution*hit.normal[i]);
      p.spin=p.spin.map(n=>n*(1-m.friction));p.slowTime=Length(p.velocity)<m.stopSpeed?p.slowTime+dt:0;
      if(m.response==='stop'||p.bounces>=m.maxBounces||Length(p.velocity)<m.stopSpeed&&p.slowTime+1e-9>=m.settleTime){p.resting=true;p.velocity=[0,0,0];p.spin=[0,0,0];}
    }
    for(const q of fragments)if(this.Add('clods',q))this.stats.fragments++;
  }
  Tick(dt){
    this.time+=dt;this.checks=0;
    for(const p of this.grains)if(p.contact&&p.contact.at<=this.time){this.ImpactDust(p.contact.position,p.contact.normal,this.config.grains.impactDust,p.contact.at);this.Deposit(p);delete p.contact;this.stats.grainImpacts++;}
    for(const p of this.dust)if(p.contact&&p.contact.at<=this.time){this.ImpactDust(p.contact.position,p.contact.normal,this.config.dust.fallImpactDust,p.contact.at);delete p.contact;this.stats.dustImpacts++;}
    for(const layer of ['grains','dust','clods'])this[layer]=this[layer].filter(p=>p.birth+p.life>this.time);
    this.settledCount=this.grains.reduce((count,p)=>count+(p.settled?1:0),0);
    this.MoveClods(dt);
    for(const [key,value]of this.cache)if(this.time-value.time>Math.max(.1,this.config.budget.contactCacheS))this.cache.delete(key);
    const c=this.config,t=c.timing,age=this.time-t.delay,phase=Clamp(age/t.duration,0,1);
    if(t.mode==='once'&&age>=t.duration)this.emitting=false;
    const pulse=t.mode!=='pulse'||(age%(t.pulseOn+t.pulseOff))<t.pulseOn;
    if(!this.emitting||age<0||!pulse)return;
    const pose=this.Pose(this.time),distance=this.host.distanceTo?.(pose.position)??0,b=c.budget;
    if(distance>=b.distance)return;
    const distanceScale=b.fadeDistance?Clamp((b.distance-distance)/b.fadeDistance,0,1):1;
    this.eventAccumulator+=t.frequency*dt;const events=Math.floor(this.eventAccumulator+1e-9);this.eventAccumulator-=events;
    if(!events)return;
    const strength=EvaluateCurve(t.intensity,t.mode==='once'?phase:(age%t.duration)/t.duration,this.intensityRandom)*events*t.quantity*b.qualityScale*(this.host.qualityScale??1)*distanceScale;
    for(const layer of ['clods','grains','dust']){
      const m=c[layer];if(!m.enabled||!m.maxParticles)continue;
      this.accumulator[layer]+=strength*m.amount;const count=Math.min(4096,Math.floor(this.accumulator[layer]));this.accumulator[layer]-=count;
      for(let i=0;i<count;i++){
        if(this[layer].length>=Math.min(m.maxParticles,L[layer])||this.host.allow?.(layer)===false){this.stats.dropped[layer]+=count-i;break;}
        const p=this.NewParticle(layer,this.time-dt*.5);if(layer==='grains'||layer==='dust')this.PredictGrain(p);
        if(!this.Add(layer,p)){this.stats.dropped[layer]+=count-i-1;break;}}
    }
  }
  Inspect(){return {preset:this.preset,time:this.time,paused:this.paused,emitting:this.emitting,active:this.Active,
    live:{grains:this.grains.length,clods:this.clods.length,dust:this.dust.length},fallingGrains:this.grains.length-this.settledCount,settledGrains:this.settledCount,
    fallingDust:this.dust.filter(p=>!p.impact).length,impactDust:this.dust.filter(p=>p.impact).length,...Clone(this.stats),
    surface:{ground:!!this.host.groundAt,obstacles:!!this.host.raycast,movingSource:!!this.host.transformAt}};}
  Samples(layer='clods',limit=16){return this[layer].slice(0,limit).map(p=>({id:p.id,position:layer==='clods'?[...p.position]:SoilTrajectory(p,this.time-p.birth).position,
    origin:[...p.origin],velocity:[...p.velocity],size:p.size,age:this.time-p.birth,life:p.life,settled:!!p.settled,impact:!!p.impact,resting:p.resting,angles:p.angles?[...p.angles]:undefined,generation:p.generation}));}
}
