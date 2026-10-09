import * as THREE from 'three';
import {MarkNoPrepass} from './Script_Post.mjs';
import {LoadParticleVolume} from './Script_ParticleVolumeAsset.mjs';
import {CreateParticleVolumeMaterial} from './Script_ParticleVolumeMaterial.mjs';
import {PARTICLE_VOLUME_ASSETS,PARTICLE_VOLUME_QUALITY} from './Data_ParticleVolumeAssets.mjs';

const assets=new Map();
function Acquire(id){
 let cached=assets.get(id);
 if(!cached){cached={references:0,promise:LoadParticleVolume(new URL(PARTICLE_VOLUME_ASSETS[id].url,import.meta.url))};assets.set(id,cached);}
 cached.references++;return cached.promise;
}
function Release(id){const cached=assets.get(id);if(cached&&--cached.references===0)assets.delete(id);}
const ATTRIBUTES={iBirth:4,iOrigin:3,iVelocity:3,iForce:4,iSize:4,iColor:4,iBounds:4,iVolume:4,iPhase:1};

// One instanced cube batch per simulation asset. ParticleSystem remains the
// owner of clocks and birth records; the vertex shader resolves all motion.
export class ParticleVolumeRenderer {
 constructor(root,shared,moduleUniforms,quality){this.root=root;this.shared=shared;this.moduleUniforms=moduleUniforms;this.quality=PARTICLE_VOLUME_QUALITY[quality]||PARTICLE_VOLUME_QUALITY.high;this.pools=new Map();this.disposed=false;}
 Pool(id){
   if(!PARTICLE_VOLUME_ASSETS[id])throw new Error('Unknown particle volume asset: '+id);
   if(this.pools.has(id))return this.pools.get(id);
   const capacity=this.quality.capacity,source=new THREE.BoxGeometry(1,1,1),geometry=new THREE.InstancedBufferGeometry();
   geometry.setAttribute('position',source.getAttribute('position').clone());geometry.setIndex(source.index.clone());source.dispose();geometry.instanceCount=0;
   const arrays={},attributes={};for(const [name,size]of Object.entries(ATTRIBUTES)){arrays[name]=new Float32Array(capacity*size);attributes[name]=new THREE.InstancedBufferAttribute(arrays[name],size).setUsage(THREE.DynamicDrawUsage);geometry.setAttribute(name,attributes[name]);}
   const placeholder=new THREE.MeshBasicMaterial({visible:false});MarkNoPrepass(placeholder);
   const mesh=new THREE.Mesh(geometry,placeholder);mesh.name='ParticleVolume_'+id;mesh.frustumCulled=false;mesh.visible=false;mesh.renderOrder=id==='Campfire'?20:5;mesh.matrixAutoUpdate=false;mesh.userData.skipNormalDepth=true;this.root.add(mesh);
   const pool={id,capacity,geometry,mesh,placeholder,arrays,attributes,owners:new Array(capacity).fill(null),records:new Array(capacity),cursor:0,dropped:0,dirty:false,asset:null,material:null,error:null};this.pools.set(id,pool);
   pool.ready=Acquire(id).then(asset=>{
     if(this.disposed)return;pool.asset=asset;
     const light={};if(this.shared.uSunDirection)light.uLightDirection=this.shared.uSunDirection;if(this.shared.uSunColor)light.uLightColor=this.shared.uSunColor;if(this.shared.uSkyColor)light.uAmbientColor=this.shared.uSkyColor;
     const material=CreateParticleVolumeMaterial(asset,{instanced:true,albedo:PARTICLE_VOLUME_ASSETS[id].albedo,steps:this.quality.steps,shadowSteps:this.quality.shadowSteps,shared:{...this.shared,...this.moduleUniforms,...light}});
     MarkNoPrepass(material);pool.material=mesh.material=material;pool.placeholder.dispose();pool.placeholder=null;mesh.visible=true;
   }).catch(error=>{pool.error=String(error);throw error;});
   pool.ready.catch(()=>{});return pool;
 }
 Spawn(p,system,slot){
   const pool=this.Pool(system.modules.renderer.volumeAsset);let index=-1;
   for(let offset=0;offset<pool.capacity;offset++){const i=(pool.cursor+offset)%pool.capacity,owner=pool.owners[i];if(!owner||pool.arrays.iBirth[i*4]+pool.arrays.iBirth[i*4+1]<=owner.time){index=i;break;}}
   if(index<0){pool.dropped++;return -1;}
   pool.cursor=(index+1)%pool.capacity;pool.owners[index]=system;pool.records[index]=p;if(pool.material)pool.mesh.visible=true;const a=pool.arrays;
   const m=system.modules,phaseSeed=m.main.maxParticles===1&&m.renderer.volumeLoop?((m.main.randomSeed>>>0)*.61803398875)%1:p.seed;
   a.iPhase[index]=phaseSeed;a.iBirth.set([p.birth,p.life,slot,p.seed],index*4);a.iOrigin.set(p.origin,index*3);a.iVelocity.set(p.velocity,index*3);a.iForce.set([...p.force,p.drag],index*4);
   a.iSize.set([p.size,p.rotation,0,0],index*4);a.iColor.set(p.color,index*4);this.WriteLook(pool,index,system);pool.dirty=true;return index;
 }
 WriteLook(pool,index,system){const r=system.modules.renderer,v=pool.records[index]?.volume;
   pool.arrays.iSize[index*4+2]=r.volumeYaw;
   pool.arrays.iSize[index*4+3]=v?.fadeIn??0;
   pool.arrays.iBounds.set([...(v?r.bounds.map((n,i)=>n*v.bounds[i]):r.bounds),r.volumeSpeed*(v?.speed??1)],index*4);
   pool.arrays.iVolume.set([v?.density??1,r.emissionStrength*(v?.emission??1),r.flameExtinction*(v?.flameExtinction??1),(v?.loop??r.volumeLoop)?1:0],index*4);
 }
 Configure(system){for(const pool of this.pools.values())for(let i=0;i<pool.capacity;i++)if(pool.owners[i]===system){this.WriteLook(pool,i,system);pool.dirty=true;}}
 Clear(system){for(const pool of this.pools.values()){
   for(let i=0;i<pool.capacity;i++)if(!system||pool.owners[i]===system){pool.owners[i]=null;pool.records[i]=null;pool.arrays.iBirth[i*4+1]=0;pool.dirty=true;}
   if(!pool.owners.some(Boolean))pool.cursor=0;
 }}
 Retire(p,system){for(const pool of this.pools.values())if(pool.owners[p.slot]===system){pool.owners[p.slot]=null;pool.arrays.iBirth[p.slot*4+1]=0;pool.dirty=true;}}
 Flush(){for(const pool of this.pools.values()){
   if(pool.dirty){for(const attribute of Object.values(pool.attributes))attribute.needsUpdate=true;pool.dirty=false;}
   let last=-1;for(let i=pool.capacity-1;i>=0;i--){const owner=pool.owners[i];if(owner&&pool.arrays.iBirth[i*4]+pool.arrays.iBirth[i*4+1]>owner.time){last=i;break;}}
   pool.geometry.instanceCount=last+1;
 }}
 Ready(){return Promise.all([...this.pools.values()].map(pool=>pool.ready));}
 Inspect(){return [...this.pools.values()].map(p=>({asset:p.id,capacity:p.capacity,instances:p.geometry.instanceCount,
   live:p.owners.reduce((n,owner,i)=>n+(owner&&p.arrays.iBirth[i*4]+p.arrays.iBirth[i*4+1]>owner.time?1:0),0),
   dropped:p.dropped,ready:!!p.material,error:p.error,gpuBytes:p.asset?.data.byteLength||0,frames:p.asset?.metadata.frames||0}));}
 Dispose(){if(this.disposed)return;this.disposed=true;for(const pool of this.pools.values()){pool.mesh.removeFromParent();pool.geometry.dispose();pool.material?.dispose();pool.placeholder?.dispose();Release(pool.id);}this.pools.clear();}
}
