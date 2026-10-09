import {ParticleEffects} from './Script_ParticleEffects.mjs';
import {BattleSmokeModules} from './Data_ParticleSmoke.mjs';
import {BATTLE_SMOKE_QUALITY,BATTLE_SMOKE_ROOT} from './Data_Tuning_BattleSmoke.mjs';

export const BATTLE_SMOKE_LOBES=Object.freeze(Object.fromEntries(Object.entries(BATTLE_SMOKE_QUALITY).map(([name,q])=>[name,q.lobes])));
export function BattleSmokeParticleBudget(sources,quality='high'){
 const count=BATTLE_SMOKE_LOBES[quality]||BATTLE_SMOKE_LOBES.high;
 return [...sources].reduce((n,source)=>n+(source.backdrop?count+(source.backdrop.ignition?BATTLE_SMOKE_ROOT.lobes:0):0),0);
}

// Only scene-source bindings live here. Emission, prewarm, clocks, curves,
// visibility and GPU storage belong to the same ParticleEffects as combat FX.
export class BattleSmoke {
 constructor({root,shared,quality='high',particles=null}){
   this.quality=quality;this.sources=new Map();this.handles=new Map();this.disposed=false;
   this.ownsParticles=!particles;this.particles=particles||new ParticleEffects(root,shared,quality);
   this.texture=shared.uParticleDensity.value;
   this.mesh=this.particles.renderer.pools.volume.mesh;this.mesh.name='BattleSmokeBackdrop';
 }
 get geometry(){return this.mesh.geometry;}
 get material(){return this.mesh.material;}
 Set(handle,source){
   const specs=BattleSmokeModules(source,this.quality),existing=this.handles.get(handle);
   this.sources.set(handle,source);
   if(existing){for(let i=0;i<existing.length;i++)if(this.particles.systems.has(existing[i]))this.particles.Move(existing[i],specs[i].position);return;}
   const ids=specs.map(spec=>this.particles.Create(spec).id);this.handles.set(handle,ids);source.smokeParticleHandles=ids;
 }
 Remove(handle){for(const id of this.handles.get(handle)||[])if(this.particles.systems.has(id))this.particles.Remove(id);this.handles.delete(handle);this.sources.delete(handle);}
 ClearParticles(){if(this.ownsParticles)this.particles.Restart();this.mesh.visible=false;}
 Update(dt=0){if(this.ownsParticles){this.particles.Resume();this.particles.Update(dt);}this.mesh.visible=this.geometry.instanceCount>0;}
 Dispose(){if(this.disposed)return;for(const handle of [...this.handles.keys()])this.Remove(handle);if(this.ownsParticles)this.particles.Dispose();this.disposed=true;}
}
