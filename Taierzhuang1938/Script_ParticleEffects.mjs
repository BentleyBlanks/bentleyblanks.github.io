import * as THREE from 'three';
import {ParticleSystem, PARTICLE_MODULES, MergeParticleModules, NormalizeParticleModules, EvaluateCurve, EvaluateGradient, IntegrateCurve} from './Script_ParticleModules.mjs';
import {ParticleRenderer} from './Script_ParticleRenderer.mjs';
import {PARTICLE_PRESETS, BurningParticleModules} from './Data_Tuning_Particles.mjs';
import {ParticleChannel} from './Script_ParticleChannel.mjs';

// The production interface is also the agent interface. All inputs/outputs are JSON.
export class ParticleEffects {
 constructor(root,shared,quality='high') {
   this.parent=root;this.shared=shared;this.quality=quality;this.root=new THREE.Group();
   this.root.name='ModularParticleSystems';root.add(this.root);
   this.renderer=new ParticleRenderer(this.root,shared,quality);this.systems=new Map();this.profiles=new Map();this.channels=new Map();this.presetOverrides=new Map();this.nextId=1;this.disposed=false;this.wind={x:.35,z:-.15};
 }
 Presets() {return Object.keys(PARTICLE_PRESETS);}
 Profiles() {return [...this.profiles].map(([name,p])=>({name,capacity:p.capacity,renderer:p.config.renderer||'billboard',shape:p.config.renderer==='mesh'?p.config.geometryName:p.config.shape,orientation:p.config.orient}));}
 Channel(profile,capacity,config) {
   this.profiles.set(profile,{name:profile,capacity,config:{...config,quality:this.quality}});
   const id=this.Create({profile,name:'Runtime/'+profile}).id,channel=new ParticleChannel(this,id,profile);
   this.channels.set(profile,channel);this.Get(id).channel=channel;return channel;
 }
 Modules() {return {modules:[...PARTICLE_MODULES],curves:['constant','twoConstants','curve','twoCurves'],
   shapes:['point','circle','cone','sphere','box','beam'],renderers:['flame','smoke','ember','mote','windowMote','volume','material'],profiles:this.Profiles(),simulationSpace:['world','local'],
   defaults:NormalizeParticleModules(),controls:['Create','Play','Pause','Stop','Clear','Emit','Simulate','Move','Configure','Inspect','GetParticles','Export','Import','Remove'],
   unsupported:['collisionModule','trails','subEmitters','textureSheetAnimationModule','arbitraryMeshAssets','localRotationAndScale']};}
 Get(id) {const entry=this.systems.get(id);if(!entry)throw new Error(`Particle system not found: ${id}`);return entry;}
 Create({preset='FireTongue',profile=null,modules={},position=[0,0,0],name='',play=true}={}) {
   if(this.disposed)throw new Error('Particle effects disposed');
   const binding=profile?this.profiles.get(profile):null;
   if(profile&&!binding)throw new Error('Unknown particle renderer profile: '+profile);
   if(!profile&&!PARTICLE_PRESETS[preset])throw new Error('Unknown particle preset: '+preset);
   const base=binding?{main:{startLifetime:1,startSpeed:1,startSize:1,maxParticles:binding.capacity,gravityModifier:binding.config.renderer==='mesh'?1:0},emission:{enabled:false},
     sizeOverLifetime:{enabled:false},colorOverLifetime:{enabled:false},renderer:{mode:'material',aspect:1,softRange:binding.config.softRange??.35}}:PARTICLE_PRESETS[preset];
   let normalized=MergeParticleModules(NormalizeParticleModules(base),modules);
   if(!profile&&this.presetOverrides.has(preset))normalized=MergeParticleModules(normalized,this.presetOverrides.get(preset));
   if(normalized.renderer.mode==='material'&&!binding)throw new Error('Material particles require a registered profile');
   const system=new ParticleSystem(normalized,{position,
     onEmit:(particle,owner)=>this.renderer.Spawn(particle,owner),onClear:owner=>this.renderer.Clear(owner),onChange:owner=>this.renderer.Configure(owner),onRetire:(particle,owner)=>this.renderer.Retire(particle,owner)});
   system.Move(position);this.renderer.Register(system,binding);
   const id='Particle'+this.nextId++;this.systems.set(id,{system,preset:profile?null:preset,profile,name:name||profile||preset});
   if(play)system.Play();this.renderer.Flush();return {id,...this.Inspect(id)};
 }
 Burning(source,spawnScale=1) {
   const origin=source.firePosition||source.position,position=[origin.x,origin.y,origin.z];
   return BurningParticleModules(source,spawnScale).map(({preset,modules})=>{
     const wind=source.wind||this.wind;
     modules.velocityOverLifetime={enabled:true,x:[[0,0],[1,wind.x*.45]],z:[[0,0],[1,wind.z*.45]]};
     const id=this.Create({preset,modules,position,name:`Burning/${source.seed}/${preset}`}).id;
     this.Get(id).followsWind=!source.wind;return id;
   });
 }
 Motes(bounds,count){
   const id=this.Create({preset:'DustMote',name:'Ambient/Dust',modules:{main:{maxParticles:count},emission:{rateOverTime:count/30},shape:{box:bounds},renderer:{bounds}}}).id;
   return {particleId:id,count,mesh:this.renderer.pools.mote.mesh,Move:position=>{const {system}=this.Get(id);system.Move(position);this.renderer.Sync(system)},
     Dispose:()=>{if(this.systems.has(id))this.Remove(id)}};
 }
 SetWind(wind) {
   if(!Number.isFinite(wind?.x)||!Number.isFinite(wind?.z))throw new Error('wind: finite x,z required');
   if(wind.x===this.wind.x&&wind.z===this.wind.z)return;
   this.wind={x:wind.x,z:wind.z};
   for(const entry of this.systems.values())if(entry.followsWind)entry.system.Configure({velocityOverLifetime:{x:[[0,0],[1,wind.x*.45]],z:[[0,0],[1,wind.z*.45]]}});
   this.renderer.Flush();
 }
 Configure(id,patch) {const {system}=this.Get(id);const previous=system.modules;
   const modules=MergeParticleModules(previous,patch);
   const stream=this.renderer.streams.get(system);
   if(stream&&modules.main.maxParticles>stream.capacity)throw new Error('maxParticles exceeds channel capacity; create an emitter with the requested capacity');
   if(this.renderer.streams.has(system)&&modules.renderer.mode!=='material')throw new Error('Create a new emitter to change a material renderer profile');
   if(!this.renderer.streams.has(system)&&modules.renderer.mode==='material')throw new Error('Material particles require a registered profile');
   // Existing particles retain their spawn properties; shape/renderer migration
   // needs a clear to prevent old particles interpreting the new coordinate space.
   if(modules.renderer.mode!==previous.renderer.mode||modules.main.simulationSpace!==previous.main.simulationSpace)system.Clear();
   system.Configure(patch);this.renderer.Flush();return this.Inspect(id);
 }
 Play(id,options) {const e=this.Get(id);e.restartPending=false;e.system.Play(options);this.renderer.Flush();return this.Inspect(id);}
 Pause(id) {const e=this.Get(id);e.restartPending=false;e.system.Pause();return this.Inspect(id);}
 Stop(id,options) {const e=this.Get(id);e.restartPending=false;e.system.Stop(options);this.renderer.Flush();return this.Inspect(id);}
 Clear(id) {this.Get(id).system.Clear();this.renderer.Flush();return this.Inspect(id);}
 Emit(id,count=1) {this.Get(id).system.Emit(count);this.renderer.Flush();return this.Inspect(id);}
 Simulate(id,seconds,options) {this.Get(id).system.Simulate(seconds,options);this.renderer.Flush();return this.Inspect(id);}
 Move(id,position) {this.Get(id).system.Move(position);this.renderer.Flush();return this.Inspect(id);}
 Inspect(id) {
   if(id){const e=this.Get(id);return {id,name:e.name,preset:e.preset,profile:e.profile,...e.system.Inspect()};}
   return {version:1,...this.renderer.Inspect(),entries:[...this.systems.keys()].map(key=>this.Inspect(key))};
 }
 GetParticles(id,{limit=32}={}) {
   if(!Number.isInteger(limit)||limit<0||limit>256)throw new Error('particle sample limit: integer 0–256 required');
   const entry=this.Get(id),{system}=entry,m=system.modules,binding=this.profiles.get(entry.profile);
   return system.particles.slice(0,limit).map(p=>{
     const age=system.time-p.birth,t=Math.max(0,Math.min(1,age/p.life)),k=p.drag;
     const position=p.origin.map((n,i)=>n+(k>.001?(p.velocity[i]-p.force[i]/k)*(1-Math.exp(-k*age))/k+p.force[i]*age/k:p.velocity[i]*age+p.force[i]*age*age*.5)
       +(m.main.simulationSpace==='local'?system.position[i]:0)+(m.velocityOverLifetime.enabled?IntegrateCurve(m.velocityOverLifetime[['x','y','z'][i]],t,p.seed)*p.life:0));
     if(m.noise.enabled) {
       const strength=EvaluateCurve(m.noise.strength,t,p.seed),phase=p.seed*31,clock=age*m.noise.scrollSpeed*m.noise.frequency;
       position[0]+=(Math.sin(clock+phase)-Math.sin(phase))*strength;
       position[2]+=(Math.sin(clock*1.37+phase*1.9)-Math.sin(phase*1.9))*strength*.7;
     }
     if(p.packed&&(binding?.config.renderer==='mesh'||binding?.config.bounce)){
       const ground=p.packed.groundY,below=Math.max(0,ground-position[1]);
       if(below>0)position[1]=ground+below*(p.packed.bounce??.34)*Math.exp(-below*2.2);
     }
     if(m.renderer.mode==='mote')for(let i=0;i<3;i++){const b=m.renderer.bounds[i],c=system.position[i];position[i]=((position[i]-c+b*.5)%b+b)%b-b*.5+c;}
     return {position,age,remainingLifetime:p.life-age,startLifetime:p.life,seed:p.seed,
       size:p.size*(m.sizeOverLifetime.enabled?EvaluateCurve(m.sizeOverLifetime.curve,t,p.seed):1),
       color:(m.colorOverLifetime.enabled?EvaluateGradient(m.colorOverLifetime.gradient,t):[1,1,1,1]).map((n,i)=>n*p.color[i])};
   });
 }
 Export(id) {const entry=this.Get(id);return {version:1,preset:entry.preset,profile:entry.profile,name:entry.name,position:[...entry.system.position],modules:JSON.parse(JSON.stringify(entry.system.modules))};}
 Import(data) {if(data?.version!==1)throw new Error('Unsupported particle preset version');return this.Create(data);}
 Remove(id) {const {system,channel}=this.Get(id);channel?.Detach();system.Stop({clear:true});this.renderer.Remove(system);this.systems.delete(id);this.renderer.Flush();return true;}
 Update(dt) {for(const {system}of this.systems.values())system.Update(dt);this.renderer.Flush();}
 Restart() {for(const entry of this.systems.values()){const {system}=entry;entry.restartPending=entry.restartPending||(system.started&&system.emitting&&system.state==='playing');system.onClear(system);system.Reset();}this.renderer.Flush();}
 Resume() {for(const entry of this.systems.values())if(entry.restartPending){entry.restartPending=false;entry.system.Play();}}
 Fork() {const fork=new ParticleEffects(this.parent,this.shared,this.quality);fork.SetWind(this.wind);for(const [name,p]of this.profiles){const channel=fork.Channel(name,p.capacity,p.config),original=this.channels.get(name);if(original&&this.systems.has(original.particleId))fork.Configure(channel.particleId,original.system.modules);}fork.presetOverrides=new Map(this.presetOverrides);return fork;}
 Dispose() {if(this.disposed)return;this.renderer.Dispose();this.root.removeFromParent();this.systems.clear();this.channels.clear();this.profiles.clear();this.disposed=true;}
}
