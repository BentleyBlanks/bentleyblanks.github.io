import * as THREE from 'three';
import {FallingSoilSimulation,NormalizeFallingSoil} from './Script_FallingSoilRules.mjs';
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
  SetVisible(on){for(const e of this.entries.values())if(e.material)e.material.visible=on;}
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
      config:{shape:'soilgrain',orient:'billboard',lit:true,aerial:true,renderOrder:6,softRange:0,hideWhenIdle:true,quality:api.quality}});
    const grains=api.Create({profile:'soilGrain',name:stem+'/细砂',modules:{main:{maxParticles:Math.max(1,c.grains.maxParticles),startSpeed:0},emission:{enabled:false},
      renderer:{aspect:c.grains.aspect},rotationOverLifetime:{enabled:true,angularVelocity:c.grains.spin},
      noise:{enabled:true,strength:c.motion.turbulence,frequency:c.motion.frequency,scrollSpeed:1}},play:false}).id;
    e.ids=[grains];
    const dust=api.Create({preset:'FireSmoke',name:stem+'/薄尘',modules:{main:{maxParticles:Math.max(1,c.dust.maxParticles),gravityModifier:0},
      emission:{enabled:false},renderer:{mode:'smoke',aspect:1,softRange:.12},
      sizeOverLifetime:{enabled:true,curve:[[0,1],[1,c.dust.diffusion]]},
      colorOverLifetime:{enabled:true,gradient:[[0,[1,1,1,0]],[Math.max(.001,c.dust.fadeIn),[1,1,1,1]],[c.dust.fadeOut,[1,1,1,.72]],[1,[1,1,1,0]]]},
      rotationOverLifetime:{enabled:true,angularVelocity:c.dust.spin},noise:{enabled:true,strength:c.motion.turbulence,frequency:c.motion.frequency,scrollSpeed:1}},play:false}).id;
    e.ids=[grains,dust];for(const [i,id]of e.ids.entries())api.Get(id).editorKey='soil:'+(i?'dust':'grains');
    e.root=new THREE.Group();e.root.name=stem+'/实体土块';this.solidRoot.add(e.root);
    // Reuse production clod geometry rather than inventing a second rock asset.
    e.geometry=(api.profiles.get('clod')?.config.shape||new THREE.IcosahedronGeometry(.5,0)).clone();
    e.material=new THREE.MeshStandardMaterial({color:new THREE.Color().fromArray(c.clods.color),roughness:c.clods.roughness,metalness:0,flatShading:true,
      opacity:c.clods.color[3],transparent:c.clods.color[3]<1,depthWrite:c.clods.color[3]>=1});
    const host={...this.defaultHost,...e.host,
      qualityScale:LIMITS.quality[api.quality]??1,
      distanceTo:p=>this.eye.distanceTo(new THREE.Vector3(...p)),
      allow:layer=>this.Count(layer)<LIMITS[layer]&&this.births<LIMITS.birthsPerStep,
      allowRay:priority=>{if(this.rays>=LIMITS.raysPerStep-(priority?0:this.Count('clods')))return false;this.rays++;return true;},
      onReset:()=>{for(const id of e.ids){const s=api.Get(id).system;s.onClear(s);s.Reset();s.Play();}for(const mesh of e.meshes.values()){mesh.visible=false;e.freeMeshes.push(mesh);}e.meshes.clear();},
      onEmit:(layer,p)=>{
        if(layer==='clods'){this.births++;return true;}
        const id=layer==='grains'?grains:dust,s=api.Get(id).system;
        const record={...p,color:[...p.color]};if(layer==='dust')record.color[3]*=c.dust.density;
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
    const e=this.Get(id);return {id,preset:e.preset,...e.simulation.Inspect(),particleIds:[...e.ids],meshes:e.meshes.size,allocatedMeshes:e.meshes.size+e.freeMeshes.length};}
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
