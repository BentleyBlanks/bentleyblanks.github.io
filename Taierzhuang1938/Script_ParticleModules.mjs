// Serializable Unity-style modules. Pure rules: no renderer or browser dependency.
export const PARTICLE_STEP = 1 / 60;
export const PARTICLE_MODULES = Object.freeze(['main', 'emission', 'shape', 'velocityOverLifetime',
  'forceOverLifetime', 'sizeOverLifetime', 'colorOverLifetime', 'rotationOverLifetime', 'noise', 'renderer']);
const Clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const Clone = value => JSON.parse(JSON.stringify(value));
export function EvaluateCurve(curve, time, random = .5) {
  if (typeof curve === 'number') return curve;
  if (Array.isArray(curve)) {
    if (!curve.length) return 0;
    if (time <= curve[0][0]) return curve[0][1];
    for (let i = 1; i < curve.length; i++) {
      const a = curve[i - 1], b = curve[i];
      if (time <= b[0]) return a[1] + (b[1] - a[1]) * Clamp((time - a[0]) / (b[0] - a[0]), 0, 1);
    }
    return curve.at(-1)[1];
  }
  if (curve?.mode === 'twoConstants') return curve.min + (curve.max - curve.min) * random;
  if (curve?.mode === 'twoCurves') return (EvaluateCurve(curve.min, time) * (1 - random) + EvaluateCurve(curve.max, time) * random) * (curve.multiplier ?? 1);
  return EvaluateCurve(curve?.curve ?? 0, time, random) * (curve?.multiplier ?? 1);
}
export function EvaluateGradient(keys, time) {
  return [0, 1, 2, 3].map(channel => EvaluateCurve(keys.map(key => [key[0], key[1][channel]]), time));
}
export function IntegrateCurve(curve, time, random = .5) {
  // Lifetime LUT compilation only; trapezoids preserve piecewise-linear authored keys.
  const nodes = new Set([0, Clamp(time, 0, 1)]);
  function Collect(value) {
    if (Array.isArray(value)) {for (const [t] of value) if (t > 0 && t < time) nodes.add(t);}
    else if (value && typeof value === 'object') { Collect(value.curve); Collect(value.min); Collect(value.max); }
  }
  Collect(curve);
  const sorted = [...nodes].sort((a,b)=>a-b);
  let sum = 0;
  for (let i=1;i<sorted.length;i++) sum += (sorted[i]-sorted[i-1]) * (EvaluateCurve(curve,sorted[i],random)+EvaluateCurve(curve,sorted[i-1],random))*.5;
  return sum;
}
const DEFAULTS = {
  main: {duration:5, loop:true, prewarm:false, startDelay:0, startLifetime:1, startSpeed:1,
    startSize:.25, startRotation:0, startColor:[1,1,1,1], gravityModifier:0, maxParticles:128,
    simulationSpeed:1, simulationSpace:'world', randomSeed:1938},
  emission: {enabled:true, rateOverTime:10, rateOverDistance:0, bursts:[]},
  shape: {enabled:true, type:'cone', radius:.3, angle:12, box:[1,1,1],direction:[0,0,1]},
  velocityOverLifetime: {enabled:false, x:0, y:0, z:0},
  forceOverLifetime: {enabled:false, x:0, y:0, z:0, drag:0},
  sizeOverLifetime: {enabled:true, curve:[[0,.4],[.3,1],[1,0]]},
  colorOverLifetime: {enabled:true, gradient:[[0,[1,1,1,0]],[.12,[1,1,1,1]],[.65,[1,1,1,.8]],[1,[1,1,1,0]]]},
  rotationOverLifetime: {enabled:false, angularVelocity:0},
  noise: {enabled:false, strength:0, frequency:1.5, scrollSpeed:1},
  renderer: {enabled:true,mode:'flame', aspect:1.8, softRange:.35,bounds:[30,12,30],density:2.8,nearFade:.8},
};
function NumberIn(value, path, low, high) {
  if (!Number.isFinite(value) || value < low || value > high) throw new RangeError(`${path}: expected finite number in [${low}, ${high}]`);
}
function CheckCurve(curve, path, low=-1000, high=1000) {
  if (typeof curve === 'number') {NumberIn(curve,path,low,high);return;}
  if (Array.isArray(curve)) {
    if (curve.length < 2 || curve.length > 32) throw new Error(`${path}: 2–32 curve keys required`);
    let previous=-1;
    for (const key of curve) {
      if (!Array.isArray(key)||key.length!==2) throw new Error(`${path}: expected [time,value] keys`);
      NumberIn(key[0],path+'.time',0,1);NumberIn(key[1],path+'.value',low,high);
      if(key[0]<=previous)throw new Error(`${path}: key times must increase`);previous=key[0];
    }
    return;
  }
  if (curve?.mode === 'twoConstants') {NumberIn(curve.min,path+'.min',low,high);NumberIn(curve.max,path+'.max',low,high);if(curve.min>curve.max)throw new Error(`${path}: inverted range`);return;}
  if (curve?.mode === 'curve'||curve?.mode === 'twoCurves') {
    const multiplier=curve.multiplier??1;NumberIn(multiplier,path+'.multiplier',0,100);
    if(multiplier===0)NumberIn(0,path,low,high);
    for(const value of curve.mode==='curve'?[curve.curve]:[curve.min,curve.max])CheckCurve(value,path,multiplier?low/multiplier:low,multiplier?high/multiplier:high);
    return;
  }
  throw new Error(`${path}: unknown curve mode`);
}
export function NormalizeParticleModules(input={}) {
  for(const key of Object.keys(input)) if(!PARTICLE_MODULES.includes(key))throw new Error(`Unsupported particle module: ${key}`);
  const modules=Clone(DEFAULTS);
  for(const [key,values] of Object.entries(input)) {
    if(!values||typeof values!=='object'||Array.isArray(values))throw new Error(`${key}: expected module object`);
    for(const field of Object.keys(values))if(!Object.hasOwn(modules[key],field))throw new Error(`Unsupported particle property: ${key}.${field}`);
    Object.assign(modules[key],Clone(values));
  }
  const m=modules.main;
  for(const [key,low,high] of [['duration',.05,120],['startDelay',0,120],['maxParticles',1,4096],['simulationSpeed',0,8],['gravityModifier',-10,10],['randomSeed',0,4294967295]])NumberIn(m[key],'main.'+key,low,high);
  if(!Number.isInteger(m.maxParticles)||!Number.isInteger(m.randomSeed))throw new Error('main: maxParticles and randomSeed must be integers');
  for(const [key,low,high] of [['startLifetime',.02,120],['startSpeed',0,100],['startSize',.001,50],['startRotation',-100,100]])CheckCurve(m[key],'main.'+key,low,high);
  if(!['world','local'].includes(m.simulationSpace))throw new Error('main.simulationSpace: expected world or local');
  if(!Array.isArray(m.startColor)||m.startColor.length!==4)throw new Error('main.startColor: expected linear RGBA');
  m.startColor.forEach((n,i)=>NumberIn(n,'main.startColor',0,i===3?1:32));
  CheckCurve(modules.emission.rateOverTime,'emission.rateOverTime',0,1000);
  NumberIn(modules.emission.rateOverDistance,'emission.rateOverDistance',0,1000);
  if(!Array.isArray(modules.emission.bursts)||modules.emission.bursts.length>32)throw new Error('emission.bursts: expected at most 32 bursts');
  for(const burst of modules.emission.bursts) {
    for(const key of Object.keys(burst))if(!['time','count','cycles','repeatInterval'].includes(key))throw new Error('Unsupported burst property: '+key);
    NumberIn(burst.time,'burst.time',0,m.duration);CheckCurve(burst.count,'burst.count',0,4096);
    NumberIn(burst.cycles??1,'burst.cycles',1,100);NumberIn(burst.repeatInterval??0,'burst.repeatInterval',0,120);
  }
  if(!['cone','sphere','box','point','circle','beam'].includes(modules.shape.type))throw new Error('shape.type: unsupported shape');
  if(!Array.isArray(modules.shape.direction)||modules.shape.direction.length!==3||!modules.shape.direction.every(Number.isFinite)||Math.hypot(...modules.shape.direction)<1e-6)throw new Error('shape.direction: nonzero finite vector required');
  NumberIn(modules.shape.radius,'shape.radius',0,50);NumberIn(modules.shape.angle,'shape.angle',0,90);
  if(!Array.isArray(modules.shape.box)||modules.shape.box.length!==3)throw new Error('shape.box: expected three dimensions');
  modules.shape.box.forEach(n=>NumberIn(n,'shape.box',0,100));
  for(const axis of ['x','y','z']) {
    CheckCurve(modules.velocityOverLifetime[axis],'velocityOverLifetime.'+axis);
    NumberIn(modules.forceOverLifetime[axis],'forceOverLifetime.'+axis,-100,100);
  }
  NumberIn(modules.forceOverLifetime.drag,'forceOverLifetime.drag',0,20);
  CheckCurve(modules.sizeOverLifetime.curve,'sizeOverLifetime.curve',0,20);
  CheckCurve(modules.rotationOverLifetime.angularVelocity,'rotationOverLifetime.angularVelocity',-100,100);
  CheckCurve(modules.noise.strength,'noise.strength',0,20);
  NumberIn(modules.noise.frequency,'noise.frequency',.01,20);NumberIn(modules.noise.scrollSpeed,'noise.scrollSpeed',0,20);
  const gradient=modules.colorOverLifetime.gradient;
  if(!Array.isArray(gradient)||gradient.length<2||gradient.length>32)throw new Error('colorOverLifetime.gradient: 2–32 keys required');
  let last=-1;
  for(const [time,color] of gradient) {
    NumberIn(time,'gradient.time',0,1);if(time<=last)throw new Error('gradient times must increase');last=time;
    if(!Array.isArray(color)||color.length!==4)throw new Error('gradient: linear RGBA required');
    color.forEach((n,i)=>NumberIn(n,'gradient.color',0,i===3?1:32));
  }
  if(!['flame','smoke','ember','mote','windowMote','volume','material'].includes(modules.renderer.mode))throw new Error('renderer.mode: unsupported renderer');
  NumberIn(modules.renderer.density,'renderer.density',.01,32);NumberIn(modules.renderer.nearFade,'renderer.nearFade',0,30);
  if(!Array.isArray(modules.renderer.bounds)||modules.renderer.bounds.length!==3)throw new Error('renderer.bounds: three box dimensions required');
  modules.renderer.bounds.forEach(value=>NumberIn(value,'renderer.bounds',.01,1000));
  NumberIn(modules.renderer.aspect,'renderer.aspect',.1,10);NumberIn(modules.renderer.softRange,'renderer.softRange',0,5);
  for(const [key,module]of Object.entries(modules))if('enabled'in module&&typeof module.enabled!=='boolean')throw new Error(`${key}.enabled: expected boolean`);
  for(const key of ['loop','prewarm'])if(typeof m[key]!=='boolean')throw new Error(`main.${key}: expected boolean`);
  return modules;
}
export function MergeParticleModules(current, patch) {
  const merged=Clone(current);for(const [key,value] of Object.entries(patch)) {
    if(!PARTICLE_MODULES.includes(key))throw new Error('Unsupported particle module: '+key);
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`${key}: expected module object`);
    merged[key]={...merged[key],...value};
  }
  return NormalizeParticleModules(merged);
}
function RandomGenerator(seed) {
  let state=seed>>>0;
  return ()=>{state=(state+0x6D2B79F5)>>>0;let n=state;n=Math.imul(n^(n>>>15),n|1);n^=n+Math.imul(n^(n>>>7),n|61);return ((n^(n>>>14))>>>0)/4294967296;};
}
export class ParticleSystem {
  constructor(modules, {position=[0,0,0], onEmit=()=>{}, onClear=()=>{}, onChange=()=>{},onRetire=()=>{}}={}) {
    this.modules=NormalizeParticleModules(modules);this.Move(position);this.previousPosition=[...position];
    this.onEmit=onEmit;this.onClear=onClear;this.onChange=onChange;this.onRetire=onRetire;this.Reset();
  }
  Reset() {this.previousPosition=[...this.position];this.time=0;this.remainder=0;this.accumulator=0;this.distanceAccumulator=0;this.particles=[];this.emitted=0;this.dropped=0;this.random=RandomGenerator(this.modules.main.randomSeed);this.state='stopped';this.emitting=false;this.started=false;}
  Configure(patch) {this.modules=MergeParticleModules(this.modules,patch);while(this.particles.length>this.modules.main.maxParticles)this.onRetire(this.particles.shift(),this);this.onChange(this);return this.Inspect();}
  Move(position) {if(!Array.isArray(position)||position.length!==3||position.some(n=>!Number.isFinite(n)))throw new Error('position: finite [x,y,z] required');this.position=[...position];}
  Play({restart=false}={}) {
    if(restart||(this.started&&this.state==='stopped')){this.onClear(this);this.Reset();}
    if(!this.started&&this.modules.main.prewarm&&this.modules.main.loop) {
      this.started=true;this.state='playing';this.emitting=true;
      this.Advance(this.modules.main.startDelay);this.Advance(this.modules.main.duration);
    }
    this.started=true;this.state='playing';this.emitting=true;return this.Inspect();
  }
  Pause() {this.state='paused';return this.Inspect();}
  Stop({clear=false}={}) {this.emitting=false;this.state=clear?'stopped':'draining';if(clear)this.Clear();return this.Inspect();}
  Clear() {this.particles=[];this.onClear(this);this.accumulator=0;this.distanceAccumulator=0;return this.Inspect();}
  Update(dt) {if(this.state==='playing'||this.state==='draining')this.Advance(dt*this.modules.main.simulationSpeed);}
  Simulate(seconds,{restart=true}={}) {
    NumberIn(seconds,'simulate.seconds',0,120);
    if(restart){this.onClear(this);this.Reset();this.started=true;this.emitting=true;}
    this.Advance(seconds);this.state='paused';return this.Inspect();
  }
  Advance(dt) {
    if(!Number.isFinite(dt)||dt<0||dt>120)throw new Error('particle dt: expected 0–120 seconds');
    this.remainder+=dt;
    const distance=Math.hypot(...this.position.map((n,i)=>n-this.previousPosition[i]));
    if(this.emitting&&this.modules.emission.enabled)this.distanceAccumulator+=distance*this.modules.emission.rateOverDistance;
    this.previousPosition=[...this.position];
    while(this.remainder+1e-10>=PARTICLE_STEP){this.Tick(PARTICLE_STEP);this.remainder=Math.max(0,this.remainder-PARTICLE_STEP);}
  }
  Tick(dt) {
    const previous=this.time;this.time+=dt;
    this.particles=this.particles.filter(p=>p.birth+p.life>this.time);
    const {main,emission}=this.modules;
    const start=previous-main.startDelay,end=this.time-main.startDelay;
    if(this.emitting&&emission.enabled&&end>=-1e-9) {
      const activeStart=Math.max(0,start),activeEnd=main.loop?end:Math.min(main.duration,end);
      if(activeEnd>activeStart) {
        this.accumulator+=EvaluateCurve(emission.rateOverTime,((activeStart+activeEnd)*.5%main.duration)/main.duration)*(activeEnd-activeStart);
        const count=Math.floor(this.accumulator+1e-9),distanceCount=Math.floor(this.distanceAccumulator);
        this.accumulator-=count;this.distanceAccumulator-=distanceCount;
        for(let i=0;i<count+distanceCount;i++)this.Emit(1,{birth:previous+dt*(i+.5)/(count+distanceCount)});
      }
      for(const burst of emission.bursts) {
        const firstCycle=Math.max(0,Math.floor(Math.max(0,start)/main.duration));
        const lastCycle=main.loop?Math.floor((end+1e-9)/main.duration):0;
        for(let cycle=firstCycle;cycle<=lastCycle;cycle++)for(let repeat=0;repeat<(burst.cycles??1);repeat++) {
          const at=cycle*main.duration+burst.time+repeat*(burst.repeatInterval??0);
          if(at>cycle*main.duration+main.duration)continue;
          if((at>start+1e-9||at===0&&previous===0)&&at<=end+1e-9)this.Emit(Math.floor(EvaluateCurve(burst.count,0,this.random())),{birth:at+main.startDelay});
        }
      }
    }
    if(!main.loop&&end>=main.duration){this.emitting=false;this.state='draining';}
    if(!this.emitting&&this.particles.length===0)this.state='stopped';
  }
  Emit(count=1,{birth=this.time}={}) {
    NumberIn(count,'emit.count',0,4096);if(!Number.isInteger(count))throw new Error('emit.count: integer required');
    const {main,shape,forceOverLifetime:force}=this.modules;
    for(let i=0;i<count;i++) {
      if(this.particles.length>=main.maxParticles){this.dropped++;continue;}
      const random=this.random,seed=random(),phase=(Math.max(0,birth-main.startDelay)%main.duration)/main.duration;
      const life=EvaluateCurve(main.startLifetime,phase,random()),speed=EvaluateCurve(main.startSpeed,phase,random());
      const size=EvaluateCurve(main.startSize,phase,random()),rotation=EvaluateCurve(main.startRotation,phase,random());
      const angle=random()*Math.PI*2,r=Math.sqrt(random())*shape.radius;
      let offset=[0,0,0],direction=[0,1,0];
      if(shape.enabled) {
        if(shape.type==='box')offset=shape.box.map(n=>(random()-.5)*n);
        if(shape.type==='beam'){const length=Math.hypot(...shape.direction),along=(.06+random()*.9)*shape.box[2];direction=shape.direction.map(n=>n/length);offset=[(random()-.5)*shape.box[0]+direction[0]*along,(random()-.5)*shape.box[1]+direction[1]*along,direction[2]*along];}
        if(shape.type==='circle'||shape.type==='cone')offset=[Math.cos(angle)*r,0,Math.sin(angle)*r];
        if(shape.type==='cone') {const theta=shape.angle*Math.PI/180*Math.sqrt(random());direction=[Math.cos(angle)*Math.sin(theta),Math.cos(theta),Math.sin(angle)*Math.sin(theta)];}
        if(shape.type==='sphere') {const y=random()*2-1,q=Math.sqrt(1-y*y),radius=shape.radius*Math.cbrt(random());direction=[q*Math.cos(angle),y,q*Math.sin(angle)];offset=direction.map(n=>n*radius);}
      }
      const origin=offset.map((n,j)=>n+(main.simulationSpace==='world'?this.position[j]:0));
      const particle={birth,life,seed,size,rotation,color:[...main.startColor],origin,velocity:direction.map(n=>n*speed),
        force:[force.enabled?force.x:0,(force.enabled?force.y:0)-9.81*main.gravityModifier,force.enabled?force.z:0],drag:force.enabled?force.drag:0};
      this.EmitRecord(particle);
    }
    if(count>0&&this.state==='stopped'&&this.particles.length>0)this.state='draining';
    return this.Inspect();
  }
  EmitRecord(particle) {
    // Explicit emission parameters share the same ownership, clock and lifetime
    // as module-generated particles. Render slots are handles, not a second simulation.
    NumberIn(particle.life,'particle.life',.001,100000);
    for(const value of [particle.birth,particle.size,particle.rotation,particle.drag,...particle.origin,...particle.velocity,...particle.force,...particle.color])
      if(!Number.isFinite(value))throw new Error('particle emission parameters must be finite');
    const slot=this.onEmit(particle,this);
    if(slot===-1){this.dropped++;return -1;}
    if(Number.isInteger(slot))this.particles=this.particles.filter(p=>p.slot!==slot);
    if(this.particles.length>=this.modules.main.maxParticles)this.onRetire(this.particles.shift(),this);
    particle.slot=slot;this.particles.push(particle);this.emitted++;
    if(this.state==='stopped')this.state='draining';
    return slot;
  }
  Kill(slot) {this.particles=this.particles.filter(p=>p.slot!==slot);}
  Inspect() {return {time:this.time,state:this.state,isEmitting:this.emitting&&this.state==='playing',isAlive:this.emitting||this.particles.length>0,particleCount:this.particles.length,emitted:this.emitted,dropped:this.dropped,randomSeed:this.modules.main.randomSeed,position:[...this.position]};}
}

