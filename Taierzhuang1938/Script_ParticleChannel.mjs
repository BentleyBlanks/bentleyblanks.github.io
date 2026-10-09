import {EvaluateCurve} from './Script_ParticleModules.mjs';

// Production emitters can submit explicit birth parameters, as with Unity's
// EmitParams. This facade owns no clocks, trajectories or rendering resources.
export class ParticleChannel {
 constructor(effects,id,profile){this.effects=effects;this.particleId=id;this.profile=profile;this.cachedSystem=effects.Get(id).system;this.cachedBatch=effects.renderer.streams.get(this.cachedSystem);}
 get system(){return this.effects.systems.get(this.particleId)?.system||this.cachedSystem;}
 get batch(){return this.effects.renderer.streams.get(this.system)||this.cachedBatch;}
 Detach(){this.cachedSystem=this.system;this.cachedBatch=this.batch;}
 get capacity(){return this.batch.capacity;}
 get config(){return this.batch.config;}
 get cursor(){return this.batch.cursor;} set cursor(v){this.batch.cursor=v;}
 get arrays(){return this.batch.arrays;}
 get attributes(){return this.batch.attributes;}
 get geometry(){return this.batch.geometry;}
 get material(){return this.batch.material;}
 get mesh(){return this.batch.mesh;}
 get deathTime(){return this.batch.deathTime;}
 get dirtyMin(){return this.batch.dirtyMin;} set dirtyMin(v){this.batch.dirtyMin=v;}
 get dirtyMax(){return this.batch.dirtyMax;} set dirtyMax(v){this.batch.dirtyMax=v;}
 Time(){return this.system.time;}
 Spawn(input,worldTime){
   if(!this.effects.systems.has(this.particleId))return -1;
   if(this.effects.Get(this.particleId).restartPending)this.effects.Play(this.particleId);
   if(this.config.renderer==='mesh')return this.SpawnMesh(input,worldTime);
   const system=this.system,m=system.modules;
   if(system.state!=='playing')return -1;
   const random=system.random(),phase=(system.time%m.main.duration)/m.main.duration;
   const scale=EvaluateCurve(m.main.startSize,phase,random),speed=EvaluateCurve(m.main.startSpeed,phase,random);
   const s={...input,colorA:[...input.colorA],colorB:[...input.colorB],emitterColor:[...m.main.startColor]};
   s.life*=EvaluateCurve(m.main.startLifetime,phase,random);
   s.sizeStart*=scale;s.sizeEnd*=scale;s.vx*=speed;s.vy*=speed;s.vz*=speed;
   s.ay-=9.81*m.main.gravityModifier;
   if(m.forceOverLifetime.enabled){s.ax+=m.forceOverLifetime.x;s.ay+=m.forceOverLifetime.y;s.az+=m.forceOverLifetime.z;s.drag+=m.forceOverLifetime.drag;}
   if(m.main.simulationSpace==='local'){s.x-=system.position[0];s.y-=system.position[1];s.z-=system.position[2];}
   s.angle+=EvaluateCurve(m.main.startRotation,phase,random);
   const birth=system.time+(worldTime-(this.effects.shared.uTime?.value??worldTime));
   return system.EmitRecord({birth,life:s.life,seed:s.seed,size:s.sizeStart,rotation:s.angle,color:[...s.colorA.map((n,i)=>n*m.main.startColor[i]),s.opacity*m.main.startColor[3]],
     origin:[s.x,s.y,s.z],velocity:[s.vx,s.vy,s.vz],force:[s.ax,s.ay,s.az],drag:Math.max(.05,s.drag),packed:s});
 }
 SpawnMesh(input,worldTime){
   const system=this.system,m=system.modules;if(system.state!=='playing')return -1;
   const random=system.random(),phase=(system.time%m.main.duration)/m.main.duration;
   const scale=EvaluateCurve(m.main.startSize,phase,random),speed=EvaluateCurve(m.main.startSpeed,phase,random);
   const s={...input,color:input.color.map((n,i)=>n*m.main.startColor[i])};
   s.opacity=m.main.startColor[3];
   s.sx*=scale;s.sy*=scale;s.sz*=scale;s.vx*=speed;s.vy*=speed;s.vz*=speed;s.life*=EvaluateCurve(m.main.startLifetime,phase,random);
   const f=m.forceOverLifetime;s.force=[f.enabled?f.x:0,(f.enabled?f.y:0)-9.81*m.main.gravityModifier,f.enabled?f.z:0];
   if(f.enabled)s.drag+=f.drag;s.initialRotation=EvaluateCurve(m.main.startRotation,phase,random);
   if(m.main.simulationSpace==='local'){s.x-=system.position[0];s.y-=system.position[1];s.z-=system.position[2];}
   return system.EmitRecord({birth:system.time+(worldTime-(this.effects.shared.uTime?.value??worldTime)),life:s.life,seed:s.seed,size:Math.max(s.sx,s.sy,s.sz),rotation:s.initialRotation,
     color:[...s.color,m.main.startColor[3]],origin:[s.x,s.y,s.z],velocity:[s.vx,s.vy,s.vz],force:s.force,drag:Math.max(.05,s.drag),packed:s});
 }
 Kill(slot){if(slot<0)return;this.system.Kill(slot);this.deathTime[slot]=0;this.arrays.iSpawnLife[slot*2+1]=0;this.dirtyMin=Math.min(this.dirtyMin,slot);this.dirtyMax=Math.max(this.dirtyMax,slot);}
 Flush(){if(!this.effects.systems.has(this.particleId))return;this.effects.renderer.Sync(this.system);this.batch.Flush(this.system.time);}
 Clear(){if(!this.effects.systems.has(this.particleId))return;this.system.Clear();this.Flush();}
 Dispose(){if(this.effects.systems.has(this.particleId))this.effects.Remove(this.particleId);}
}
