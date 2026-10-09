import {ParticleEffects} from './Script_ParticleEffects.mjs';
import {BattleSmokeModules} from './Data_ParticleSmoke.mjs';

export const BATTLE_SMOKE_LOBES=Object.freeze({low:1,medium:1,high:1,ultra:1});
export function BattleSmokeParticleBudget(sources,quality='high'){
 return [...sources].filter(source=>source.backdrop).length;
}

// Only scene-source bindings live here. Emission, prewarm, clocks, curves,
// visibility and GPU storage belong to the same ParticleEffects as combat FX.
export class BattleSmoke {
 constructor({root,shared,quality='high',particles=null}){
   this.quality=quality;this.sources=new Map();this.handles=new Map();this.disposed=false;
   this.ownsParticles=!particles;this.particles=particles||new ParticleEffects(root,shared,quality);
   this.pool=this.particles.renderer.volumes.Pool('ChimneySmoke');
   this.mesh=this.pool.mesh;
 }
 get texture(){return this.pool.material?.uniforms.uVolume.value??null;}
 get geometry(){return this.mesh.geometry;}
 get material(){return this.mesh.material;}
 PoolFor(handle){const id=this.handles.get(handle)?.[0];return id?this.particles.renderer.volumes.Pool(this.particles.Get(id).system.modules.renderer.volumeAsset):null;}
 Meshes(){return [...new Set([...this.handles.keys()].map(handle=>this.PoolFor(handle)?.mesh).filter(Boolean))];}
 Set(handle,source){
   const specs=BattleSmokeModules(source,this.quality),existing=this.handles.get(handle);
   this.sources.set(handle,source);
   if(existing){for(let i=0;i<existing.length;i++)if(this.particles.systems.has(existing[i]))this.particles.Move(existing[i],specs[i].position);return;}
   const ids=specs.map(spec=>this.particles.Create(spec).id);this.handles.set(handle,ids);source.smokeParticleHandles=ids;
 }
 Remove(handle){for(const id of this.handles.get(handle)||[])if(this.particles.systems.has(id))this.particles.Remove(id);this.handles.delete(handle);this.sources.delete(handle);}
 ClearParticles(){if(this.ownsParticles)this.particles.Restart();for(const mesh of this.Meshes())mesh.visible=false;}
 Update(dt=0){if(this.ownsParticles){this.particles.Resume();this.particles.Update(dt);}for(const mesh of this.Meshes())mesh.visible=!!mesh.material&&mesh.geometry.instanceCount>0;}
 Dispose(){if(this.disposed)return;for(const handle of [...this.handles.keys()])this.Remove(handle);if(this.ownsParticles)this.particles.Dispose();this.disposed=true;}
}
