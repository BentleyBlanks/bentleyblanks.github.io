import * as THREE from 'three';
import {FallingSoilSimulation,NormalizeFallingSoil,RotateSoilVector} from './Script_FallingSoilRules.mjs';
import {FALLING_SOIL_PRESETS as PRESETS,FALLING_SOIL_LIMITS as LIMITS} from './Data_Tuning_FallingSoil.mjs';

// A composite production effect owned by the existing ParticleEffects instance.
// GPU sand/dust use ParticleSystem records and shared curves/clocks. Only the
// bounded opaque clods are ordinary Meshes, so Prepass records real motion.
export class FallingSoilEffects{
  constructor(particles){this.particles=particles;this.entries=new Map();this.nextId=1;this.eye=new THREE.Vector3();this.defaultHost={};this.remainder=0;this.births=0;
    // VfxRoot deliberately disappears during the normal/depth pass. Opaque
    // clods must be siblings of it, under the same effect lifetime owner.
    this.solidRoot=new THREE.Group();this.solidRoot.name='FallingSoilSolidRoot';(particles.parent.parent||particles.parent).add(this.solidRoot);}
  Presets(){return Object.entries(PRESETS).map(([id,{label,note}])=>({id,label,note}));}
  Get(id){const e=this.entries.get(id);if(!e)throw new Error('Unknown falling soil emitter: '+id);return e;}
  SetSurface(host={}){this.defaultHost=host;}
  Count(layer){let count=0;for(const e of this.entries.values())count+=e.simulation?.[layer].length||0;return count;}
  Create({preset='SoilCeilingShake',config={},play=true}={},host={}){
    if(this.entries.size>=LIMITS.emitters)throw new Error('Falling soil emitter budget exhausted');
    const e={id:'FallingSoil'+this.nextId++,preset,config:NormalizeFallingSoil(config,preset),host,ids:[],meshes:new Map(),freeMeshes:[]};
    this.entries.set(e.id,e);try{this.Build(e);if(!play)this.Pause(e.id);}catch(error){this.Remove(e.id);throw error;}
    return {id:e.id,...this.Inspect(e.id)};
  }
  Build(e){
    const api=this.particles,c=e.config,stem='FallingSoil/'+e.preset;
    if(!api.profiles.has('soilGrain'))api.profiles.set('soilGrain',{name:'soilGrain',capacity:LIMITS.grainsPerEmitter,
      config:{shape:'soilgrain',orient:'stretch',lit:true,aerial:true,renderOrder:6,softRange:0,fadeOutStart:.98,hideWhenIdle:true,quality:api.quality}});
    if(!api.profiles.has('soilDeposit'))api.profiles.set('soilDeposit',{name:'soilDeposit',capacity:2048,
      config:{shape:'soildeposit',orient:'normal',litSurface:true,aerial:true,renderOrder:4,softRange:0,polygonOffset:true,fadeOutStart:.85,hideWhenIdle:true,quality:api.quality}});
    if(!api.profiles.has('soilVeil'))api.profiles.set('soilVeil',{name:'soilVeil',capacity:LIMITS.dust,
      config:{shape:'soilveil',orient:'billboard',lit:true,aerial:true,renderOrder:5,softRange:.15,fadeOutStart:.95,hideWhenIdle:true,quality:api.quality}});
    // Explicit composite births use the composite clock. Inheriting FireSmoke's
    // prewarm advances the child by 4 s and kills short-lived dust at birth.
    const main={duration:120,loop:true,prewarm:false,startDelay:0,startLifetime:1,startSize:1,startSpeed:0,gravityModifier:0,simulationSpace:'world',randomSeed:c.emitter.seed};
    const Create=(key,definition)=>{const id=api.Create({...definition,play:false}).id;e.ids.push(id);api.Get(id).editorKey='soil:'+key;return id;};
    e.ids=[];
    const grains=Create('grains',{profile:'soilGrain',name:stem+'/细土流',modules:{main:{...main,maxParticles:Math.max(1,c.grains.maxParticles)},emission:{enabled:false},
      renderer:{aspect:c.grains.aspect},rotationOverLifetime:{enabled:true,angularVelocity:c.grains.spin},
      noise:{enabled:true,strength:c.motion.turbulence*c.grains.noiseScale,frequency:c.motion.frequency,scrollSpeed:1}}});
    const deposits=Create('deposits',{profile:'soilDeposit',name:stem+'/留存细土',modules:{main:{...main,maxParticles:Math.max(1,Math.min(c.grains.maxDeposits,c.grains.maxParticles))},emission:{enabled:false},
      renderer:{aspect:1},noise:{enabled:false},sizeOverLifetime:{enabled:false},colorOverLifetime:{enabled:false}}});
    for(const id of [grains,deposits])api.renderer.streams.get(api.Get(id).system).material.uniforms.uSoilArt.value.set(c.grains.lightGain,c.grains.shutter,c.grains.minPixel,c.grains.trailOpacity);
    const volumetric=c.dust.volumetric&&api.quality!=='low';
    const DustModules=impact=>({main:{...main,maxParticles:Math.max(1,c.dust.maxParticles)},emission:{enabled:false},
      renderer:{mode:volumetric?'volume':'smoke',densityStyle:c.dust.densityStyle,aspect:impact?c.dust.impactAspect:c.dust.aspect,softRange:.12,density:Math.max(.01,c.dust.density),nearFade:c.dust.nearFade},
      sizeOverLifetime:{enabled:true,curve:[[0,impact?.5:.65],[.18,1],[1,impact?c.dust.impactDiffusion:c.dust.diffusion]]},
      colorOverLifetime:{enabled:true,gradient:[[0,[1,1,1,0]],[Math.max(.001,c.dust.fadeIn),[1,1,1,1]],[c.dust.fadeOut,[1,1,1,.72]],[1,[1,1,1,0]]]},
      rotationOverLifetime:{enabled:true,angularVelocity:c.dust.spin},noise:{enabled:true,strength:c.motion.turbulence*c.dust.noiseScale,frequency:c.motion.frequency,scrollSpeed:1}});
    const fallModules=DustModules(false);if(c.dust.veil){fallModules.renderer.mode='material';fallModules.rotationOverLifetime.enabled=false;}
    const dustFall=Create('dustFall',{...(c.dust.veil?{profile:'soilVeil'}:{preset:'FireSmoke'}),name:stem+'/下落尘体',modules:fallModules});
    if(c.dust.veil)api.renderer.streams.get(api.Get(dustFall).system).material.uniforms.uSoilArt.value.set(c.dust.lightGain,c.dust.flowDetail,c.dust.flowSoftness,c.dust.flowSpeed);
    const dustImpact=Create('dustImpact',{preset:'FireSmoke',name:stem+'/贴地起尘',modules:DustModules(true)});
    e.layerIds={grains,deposits,dustFall,dustImpact};
    e.root=new THREE.Group();e.root.name=stem+'/实体土块';this.solidRoot.add(e.root);
    // Reuse production clod geometry rather than inventing a second rock asset.
    e.geometry=(api.profiles.get('clod')?.config.shape||new THREE.IcosahedronGeometry(.5,0)).clone();
    const positions=e.geometry.attributes.position;e.supportVertices=Array.from({length:positions.count},(_,i)=>[positions.getX(i),positions.getY(i),positions.getZ(i)]);
    e.material=new THREE.MeshStandardMaterial({color:new THREE.Color().fromArray(c.clods.color),roughness:c.clods.roughness,metalness:0,flatShading:true,
      opacity:c.clods.color[3],transparent:c.clods.color[3]<1,depthWrite:c.clods.color[3]>=1});
    const host={...this.defaultHost,...e.host,
      clodRadiusScale:Math.max(...e.supportVertices.map(v=>Math.hypot(...v))),
      clodSupport:(p,normal)=>{let support=0;for(const vertex of e.supportVertices){const v=RotateSoilVector(vertex.map((n,i)=>n*c.clods.aspect[i]*p.size),p.angles);support=Math.max(support,-v.reduce((sum,n,i)=>sum+n*normal[i],0));}return support;},
      qualityScale:LIMITS.quality[api.quality]??1,
      distanceTo:p=>this.eye.distanceTo(new THREE.Vector3(...p)),
      allow:layer=>this.Count(layer)<LIMITS[layer]&&this.births<LIMITS.birthsPerStep,
      allowRay:priority=>{if(this.rays>=LIMITS.raysPerStep-(priority?0:this.Count('clods')))return false;this.rays++;return true;},
      onReset:()=>{for(const id of e.ids){const s=api.Get(id).system;s.onClear(s);s.Reset();s.Play();}for(const mesh of e.meshes.values()){mesh.visible=false;e.freeMeshes.push(mesh);}e.meshes.clear();},
      onEmit:(layer,p)=>{
        if(layer==='clods'){this.births++;return true;}
        const id=layer==='grains'?(p.settled?deposits:grains):(p.impact?dustImpact:dustFall),s=api.Get(id).system;
        const record={...p,color:[...p.color]};
        if(layer==='dust'&&!p.impact&&c.dust.veil)record.rotation=0;
        if(layer==='dust')record.color[3]*=c.dust.density===0?0:(volumetric&&(p.impact||!c.dust.veil))?1:c.dust.density;
        if(p.settled)record.packed={x:p.origin[0],y:p.origin[1],z:p.origin[2],vx:0,vy:0,vz:0,ax:0,ay:0,az:0,life:p.life,sizeStart:p.size,sizeEnd:p.size,
          colorA:p.color.slice(0,3),colorB:p.color.slice(0,3),opacity:p.color[3],fadeIn:0,drag:.05,angle:p.rotation,spin:0,stretch:0,flicker:0,groundY:-9999,frame:0,minPx:0,seed:p.seed,
          nx:p.normal[0],ny:p.normal[1],nz:p.normal[2]};
        const accepted=s.EmitRecord(record)!==-1;if(accepted)this.births++;return accepted;
      },
    };
    e.simulation=new FallingSoilSimulation(c,host,e.preset);this.SyncMeshes(e);api.renderer.Flush();
  }
  SyncMeshes(e){
    const live=new Set(e.simulation.clods.map(p=>p.id));
    for(const [id,mesh]of e.meshes)if(!live.has(id)){mesh.visible=false;e.freeMeshes.push(mesh);e.meshes.delete(id);}
    for(const p of e.simulation.clods){
      let mesh=e.meshes.get(p.id);
      if(!mesh){mesh=e.freeMeshes.pop()||new THREE.Mesh(e.geometry,e.material);mesh.name='FallingSoilClod';mesh.castShadow=false;mesh.receiveShadow=true;
        mesh.userData.fallingSoilClod=true;e.root.add(mesh);e.meshes.set(p.id,mesh);}
      mesh.visible=true;mesh.position.fromArray(p.position);mesh.rotation.set(...p.angles);
      const fade=Math.min(1,Math.max(0,(p.birth+p.life-e.simulation.time)/e.config.clods.fadeOutS));
      mesh.scale.fromArray(e.config.clods.aspect).multiplyScalar(p.size*fade);
    }
  }
  Release(e){for(const id of e.ids)if(this.particles.systems.has(id))this.particles.Remove(id);e.ids=[];
    e.root?.removeFromParent();e.geometry?.dispose();e.material?.dispose();e.meshes.clear();e.freeMeshes=[];}
  Configure(id,patch){const e=this.Get(id),time=e.simulation.time,paused=e.simulation.paused;
    e.simulation.Configure(patch);e.config=e.simulation.config;this.Release(e);this.Build(e);this.Seek(id,time);if(!paused)this.Play(id);return this.Inspect(id);}
  Move(id,position,rotation=null){const e=this.Get(id);e.config=e.simulation.Move(position,rotation);return this.Inspect(id);}
  Seek(id,seconds){if(!Number.isFinite(seconds)||seconds<0||seconds>120)throw new Error('Falling soil seek must be 0–120 seconds');
    const e=this.Get(id);e.simulation.Reset();const steps=Math.floor(seconds/LIMITS.step+1e-8);
    for(let i=0;i<steps;i++){this.rays=0;this.births=0;e.simulation.Update(LIMITS.step);for(const particleId of e.ids)this.particles.Get(particleId).system.Update(LIMITS.step);}
    this.Pause(id);this.SyncMeshes(e);this.particles.renderer.Flush();return this.Inspect(id);}
  Pause(id){const e=this.Get(id);e.simulation.Pause();for(const particleId of e.ids)this.particles.Pause(particleId);return this.Inspect(id);}
  Play(id,{restart=false}={}){const e=this.Get(id);if(restart||!e.simulation.Active)this.Seek(id,0);e.simulation.Play();for(const particleId of e.ids){const s=this.particles.Get(particleId).system;s.state='playing';s.emitting=true;s.started=true;}return this.Inspect(id);}
  Stop(id,options){const e=this.Get(id);e.simulation.Stop(options);e.simulation.paused=false;for(const particleId of e.ids)this.particles.Get(particleId).system.state='draining';this.SyncMeshes(e);return this.Inspect(id);}
  Samples(id,layer='clods',limit=16){if(!['clods','grains','dust'].includes(layer)||!Number.isInteger(limit)||limit<0||limit>256)throw new Error('Invalid soil sample request');return this.Get(id).simulation.Samples(layer,limit);}
  Inspect(id){if(!id)return {entries:[...this.entries.keys()].map(key=>this.Inspect(key)),limits:LIMITS,live:Object.fromEntries(['grains','clods','dust'].map(layer=>[layer,this.Count(layer)]))};
    const e=this.Get(id);return {id,preset:e.preset,...e.simulation.Inspect(),particleIds:[...e.ids],renderLayers:Object.fromEntries(Object.entries(e.layerIds||{}).map(([key,id])=>[key,{id,time:this.particles.Get(id).system.time,count:this.particles.Get(id).system.particles.length}])),meshes:e.meshes.size,allocatedMeshes:e.meshes.size+e.freeMeshes.length};}
  Export(id){const e=this.Get(id);return {version:1,kind:'TengxianFallingSoil',preset:e.preset,config:JSON.parse(JSON.stringify(e.config))};}
  Import(data,host={}){if(data?.version!==1||data.kind!=='TengxianFallingSoil')throw new Error('Unsupported falling soil data');return this.Create(data,host);}
  Remove(id){const e=this.Get(id);this.Release(e);this.entries.delete(id);return true;}
  Clear(){for(const id of [...this.entries.keys()])this.Remove(id);this.remainder=0;}
  Update(dt,eye=null){if(eye)this.eye.copy(eye);this.remainder+=dt;
    // Global collision budgets are per simulation step, not per displayed frame.
    // Advance all emitters together so a 10 Hz host and timeline seek agree.
    while(this.remainder+1e-9>=LIMITS.step){this.rays=0;this.births=0;
      for(const e of this.entries.values()){e.simulation.Update(LIMITS.step);
        if(!e.simulation.Active&&!e.simulation.paused)for(const id of e.ids){const s=this.particles.Get(id).system;if(s.emitting)s.Stop();}}
      this.remainder=Math.max(0,this.remainder-LIMITS.step);
    }
    for(const e of this.entries.values())this.SyncMeshes(e);
  }
  Dispose(){this.Clear();this.solidRoot.removeFromParent();}
}
