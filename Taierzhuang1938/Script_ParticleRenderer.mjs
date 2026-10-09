import * as THREE from 'three';
import { MarkNoPrepass } from './Script_Post.mjs';
import { EvaluateCurve, EvaluateGradient, IntegrateCurve } from './Script_ParticleModules.mjs';
import { PARTICLE_LIMITS,PARTICLE_VOLUME } from './Data_Tuning_Particles.mjs';
import { ParticleBatch, ParticleMeshBatch } from './Script_ParticleBatch.mjs';
import {AcquireParticleDensity,PARTICLE_DENSITY_GLSL} from './Script_ParticleDensity.mjs';
import {PARTICLE_GPU_MODULES} from './Script_ParticleGpuModules.mjs';
import {ParticleVolumeRenderer} from './Script_ParticleVolumeRenderer.mjs';

const VERTEX=/*glsl*/`
${PARTICLE_GPU_MODULES}
attribute vec4 iBirth;
attribute vec3 iOrigin;
attribute vec3 iVelocity;
attribute vec4 iForce;
attribute vec4 iSize;
attribute vec4 iColor;
varying vec2 vUv;
varying vec4 vColor;
varying vec4 vShape;
varying float vDepth;
varying float vDistance;
#ifdef PARTICLE_WINDOWMOTE
uniform vec2 uResolution;
varying vec3 vWorldPoint;
#endif
#ifdef PARTICLE_VOLUME
varying vec3 vRight;
varying vec3 vUp;
varying vec3 vToward;
varying vec3 vVolume;
#endif
vec4 Curve(float row,float age){
 return ParticleCurve(iBirth.z,row,age);
}
void main(){
 vec4 system=ParticleState(iBirth.z),info=ParticleNoise(iBirth.z);
 float age=system.x-iBirth.x,t=clamp(age/iBirth.y,0.,1.);
 if(iBirth.y<=0.||age<0.||age>=iBirth.y||info.w<.5){gl_Position=vec4(2.,2.,2.,1.);return;}
 vec4 parameters=mix(Curve(2.,t),Curve(3.,t),iBirth.w);
 vec3 motion=mix(Curve(4.,t),Curve(5.,t),iBirth.w).xyz*iBirth.y;
 vec3 world=iOrigin;
 float k=iForce.w;
 if(k>.001)world+=(iVelocity-iForce.xyz/k)*(1.-exp(-k*age))/k+iForce.xyz*age/k;
 else world+=iVelocity*age+iForce.xyz*age*age*.5;
 world+=motion+system.yzw*info.x;
 float phase=iBirth.w*31.,clock=age*info.z;
 world.x+=(sin(clock*info.y+phase)-sin(phase))*parameters.z;
 world.z+=(sin(clock*info.y*1.37+phase*1.9)-sin(phase*1.9))*parameters.z*.7;
#ifdef PARTICLE_WINDOWMOTE
 world.y+=(sin(clock*info.y*.63+phase*3.)-sin(phase*3.))*parameters.z*.6;
 vWorldPoint=world;
#endif
#ifdef PARTICLE_MOTE
 vec3 bounds=ParticleBounds(iBirth.z).xyz;
 world=mod(world-system.yzw+bounds*.5,bounds)-bounds*.5+system.yzw;
#endif
 float angle=iSize.y+parameters.y*iBirth.y,cs=cos(angle),sn=sin(angle);
 vec2 corner=vec2(position.x*cs-position.y*sn,position.x*sn+position.y*cs);
 float size=iSize.x*parameters.x;
#ifdef PARTICLE_VOLUME
 vRight=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);
 vUp=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
 vToward=normalize(cameraPosition-world+vec3(1e-6));
 vec4 look=ParticleAppearance(iBirth.z);vVolume=vec3(size,look.x,look.y);
#endif
 vec4 view=modelViewMatrix*vec4(world,1.);
#ifdef PARTICLE_WINDOWMOTE
 float worldPixel=max(.1,-view.z)/max(1.,uResolution.y)/projectionMatrix[1][1];
 size=clamp(size,worldPixel*.6,worldPixel*2.6);
#endif
 view.xy+=corner*vec2(size,size*iSize.z);
#ifdef PARTICLE_FLAME
 view.y+=size*iSize.z*.8;
#endif
 vUv=position.xy*.5+.5;
 vColor=mix(Curve(0.,t),Curve(1.,t),iBirth.w)*iColor;
 vShape=vec4(iBirth.w,age,t,iSize.w);vDepth=-view.z;vDistance=length(cameraPosition-world);
 gl_Position=projectionMatrix*view;
}`;
const FRAGMENT=/*glsl*/`
#ifdef PARTICLE_WINDOWMOTE
uniform sampler2D uParticleLightDepth;
uniform mat4 uParticleLightMatrix;
uniform float uParticleLightBias;
uniform float uParticleLightTexel;
uniform float uParticleLightValid;
varying vec3 vWorldPoint;
float DustLight(vec3 p){
 if(uParticleLightValid<.5)return 1.;
 vec4 q=uParticleLightMatrix*vec4(p,1.);vec3 uv=q.xyz/q.w*.5+.5;
 if(any(lessThan(uv,vec3(0.)))||any(greaterThan(uv,vec3(1.))))return 0.;
 float lit=0.;for(int y=0;y<2;y++)for(int x=0;x<2;x++){
  vec2 d=(vec2(float(x),float(y))-.5)*uParticleLightTexel;
  lit+=step(uv.z-uParticleLightBias,texture2D(uParticleLightDepth,uv.xy+d).r);
 }return lit*.25;
}
#endif
#if defined(PARTICLE_VOLUME) || defined(PARTICLE_FLAME)
${PARTICLE_DENSITY_GLSL}
#endif
#ifdef PARTICLE_VOLUME
uniform vec3 uSmokeLighting;
uniform vec3 uSunDirection;
varying vec3 vRight;
varying vec3 vUp;
varying vec3 vToward;
varying vec3 vVolume;
#endif
uniform sampler2D uNormalDepth;
uniform vec2 uResolution;
uniform float uDepthValid;
uniform float uGlobalFade;
uniform float uFogDensity;
uniform float uFogMax;
uniform vec3 uFogColorSky;
uniform vec3 uSkyColor;
uniform vec3 uSunColor;
uniform sampler2D uParticleFireMap;
uniform float uParticleFireReady;
varying vec2 vUv;
varying vec4 vColor;
varying vec4 vShape;
varying float vDepth;
varying float vDistance;
float Hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float Noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(Hash(i),Hash(i+vec2(1,0)),f.x),mix(Hash(i+vec2(0,1)),Hash(i+vec2(1,1)),f.x),f.y);}
float Fbm(vec2 p){return Noise(p)*.57+Noise(p*2.03+7.1)*.29+Noise(p*4.07+13.2)*.14;}
void main(){
 vec2 uv=vUv;float seed=vShape.x*23.,age=vShape.y;
 vec3 color=vColor.rgb;float mask=0.;
#ifdef PARTICLE_VOLUME
 vec2 p=uv*2.-1.;if(dot(p,p)>=1.)discard;
 float span=sqrt(max(0.,1.-dot(p,p))),sceneDepth=uDepthValid>.5?texture2D(uNormalDepth,gl_FragCoord.xy/uResolution).w:0.;
 float fade=smoothstep(vVolume.z*.4,max(.001,vVolume.z),vDistance);
 vec3 light=normalize(uSunDirection+vec3(0.,.1,0.));vec4 sum=vec4(0.);
 for(int j=0;j<PARTICLE_VOLUME_STEPS;j++){
   float z=span*(1.-2.*(float(j)+.5)/float(PARTICLE_VOLUME_STEPS));
   vec3 q=vRight*p.x+vUp*p.y+vToward*z;
   float density=ParticleDensity(q,vShape.x,age);
   if(sceneDepth>0.)density*=smoothstep(0.,max(.05,vShape.w),sceneDepth-(vDepth-z*vVolume.x));
   float along=dot(q,light),path=max(0.,sqrt(max(0.,along*along+1.-dot(q,q)))-along);
   float shadow=ParticleDensity(q+light*path*.45,vShape.x,age);
   float transmittance=exp(-shadow*path*uSmokeLighting.z);
   vec3 lit=uSkyColor*uSmokeLighting.x+uSunColor*uSmokeLighting.y*(.16+.84*transmittance);
   float a=1.-exp(-density*span*vVolume.y*vColor.a*fade*2./float(PARTICLE_VOLUME_STEPS));
   sum.rgb+=(1.-sum.a)*a*lit;sum.a+=(1.-sum.a)*a;
 }
 color*=sum.rgb/max(sum.a,.001);mask=sum.a;
#elif defined(PARTICLE_FLAME)
 // Attached sheet stretches vertically. Independent eddies carry heat upward;
 // the base stays broad while the ragged tips split and cool before vanishing.
 vec3 field=vec3(uv.x*.8+seed*1.37,uv.y*1.1-age*.9,seed*.19);
 vec2 eddy=texture(uParticleDensity,field).rg;
 float flow=clamp((eddy.r-.28)*1.8,0.,1.);
 float detail=texture(uParticleDensity,field*1.73+vec3(0.,-age*.25,0.)).g;
 float bend=(flow-.5)*(.1+uv.y*.3)+sin(uv.y*9.-age*4.+seed)*.035*uv.y;
 vec2 flameUv=uv+vec2(bend,(eddy.g-.5)*.22);
 if(vShape.x>.5)flameUv.x=1.-flameUv.x;
 // Production masks are uploaded with flipY=false (top row first).
 flameUv.y=1.-flameUv.y;
 float authored=texture2D(uParticleFireMap,clamp(flameUv,0.,1.)).r;
 float width=.46*(1.-uv.y*.7);
 float envelope=(1.-smoothstep(width*.3,width,abs(uv.x-.5+bend)))*(1.-smoothstep(.6,1.,uv.y));
 float fuel=mix(envelope,authored*(.55+flow*.7)+envelope*.25,uParticleFireReady);
 float fissure=smoothstep(.14+uv.y*.23,.62+uv.y*.12,fuel+(detail-.5)*.38);
 mask=clamp(fuel,0.,1.)*fissure*smoothstep(0.,.035,uv.y)*(1.-smoothstep(.88,1.,uv.y));
 mask*=1.-smoothstep(.45,.8,vShape.z);
 float heat=clamp(fuel*.7+envelope*.3-uv.y*.25,0.,1.);
 color*=mix(vec3(.3,.14,.03),vec3(.75,.78,.62),smoothstep(.15,.8,heat));
#elif defined(PARTICLE_SMOKE)
 vec2 p=uv*2.-1.;float n=Fbm(p*2.+vec2(seed,age*.12));
 float density=(1.-smoothstep(.13,.98,length(p)+(.5-n)*.38))*(.45+n*.65);
 mask=density*density;
 color*=uSkyColor+uSunColor*(.24+.36*n);
#elif defined(PARTICLE_MOTE)
 vec2 p=uv*2.-1.;mask=exp(-dot(p,p)*3.5)*(1.-smoothstep(.6,1.,length(p)));
 color*=uSkyColor*.5+uSunColor*.4;
#elif defined(PARTICLE_WINDOWMOTE)
 vec2 p=uv*2.-1.;float r=length(p);
 mask=exp(-dot(p,p)*4.5)*(1.-smoothstep(.56,1.,r));
 mask*=(.45+.55*vShape.x)*smoothstep(.25,.7,vDepth)*(1.-smoothstep(5.,8.,vDepth))*DustLight(vWorldPoint);
#else
 vec2 p=uv*2.-1.;mask=exp(-dot(p,p)*4.)*(1.-smoothstep(.65,1.,length(p)));
#endif
 float alpha=mask*vColor.a*uGlobalFade;
#ifdef PARTICLE_VOLUME
 alpha=mask*uGlobalFade;
#endif
 if(uDepthValid>.5){
   float depth=texture2D(uNormalDepth,gl_FragCoord.xy/uResolution).w;
   if(depth>0.){if(vShape.w>0.)alpha*=clamp((depth-vDepth)/max(vShape.w,.001),0.,1.);}
   else color=mix(color,uFogColorSky,min(uFogMax,1.-exp(-uFogDensity*vDistance*.55)));
 }
 if(alpha<.002)discard;
 gl_FragColor=vec4(color,alpha);
}`;
function FloatTexture(data,width,height) {
 const texture=new THREE.DataTexture(data,width,height,THREE.RGBAFormat,THREE.FloatType);
 texture.needsUpdate=true;texture.magFilter=texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;return texture;
}
export class ParticleRenderer {
 constructor(root,shared,quality='high') {
   this.root=root;this.shared=shared;this.pools={};this.slots=new Map();this.streams=new Map();this.nextSlot=0;this.freeSlots=[];
   this.releaseDensity=AcquireParticleDensity(shared);
   this.curveData=new Float32Array(PARTICLE_LIMITS.curveSamples*PARTICLE_LIMITS.systems*6*4);
   this.systemData=new Float32Array(PARTICLE_LIMITS.systems*16);
   this.curves=FloatTexture(this.curveData,PARTICLE_LIMITS.curveSamples,PARTICLE_LIMITS.systems*6);
   this.systems=FloatTexture(this.systemData,4,PARTICLE_LIMITS.systems);
   this.volumes=new ParticleVolumeRenderer(root,shared,{uParticleCurves:{value:this.curves},uParticleSystems:{value:this.systems},
     uCurveDimensions:{value:new THREE.Vector2(PARTICLE_LIMITS.curveSamples,PARTICLE_LIMITS.systems*6)},uSystemCount:{value:PARTICLE_LIMITS.systems}},quality);
   const budgets=PARTICLE_LIMITS[quality]||PARTICLE_LIMITS.high;
   for(const mode of ['flame','smoke','ember','mote','windowMote','volume']) {
     const capacity=budgets[mode],geometry=new THREE.InstancedBufferGeometry();
     geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3));geometry.setIndex([0,1,2,0,2,3]);geometry.instanceCount=0;
     const arrays={},attributes={};
     for(const [name,size]of Object.entries({iBirth:4,iOrigin:3,iVelocity:3,iForce:4,iSize:4,iColor:4})) {
       arrays[name]=new Float32Array(capacity*size);attributes[name]=new THREE.InstancedBufferAttribute(arrays[name],size).setUsage(THREE.DynamicDrawUsage);geometry.setAttribute(name,attributes[name]);
     }
     const material=new THREE.ShaderMaterial({vertexShader:VERTEX,fragmentShader:FRAGMENT,defines:{['PARTICLE_'+mode.toUpperCase()]:'',PARTICLE_VOLUME_STEPS:PARTICLE_VOLUME.steps[quality]||8},
       uniforms:{uParticleLightDepth:{value:null},uParticleLightMatrix:{value:new THREE.Matrix4()},uParticleLightValid:{value:0},uParticleLightBias:{value:0},uParticleLightTexel:{value:0},...shared,uSmokeLighting:{value:new THREE.Vector3(.85,1,PARTICLE_VOLUME.shadow)},uParticleCurves:{value:this.curves},uParticleSystems:{value:this.systems},uCurveDimensions:{value:new THREE.Vector2(PARTICLE_LIMITS.curveSamples,PARTICLE_LIMITS.systems*6)},uSystemCount:{value:PARTICLE_LIMITS.systems}},
       transparent:true,depthWrite:false,depthTest:true,blending:THREE.CustomBlending,blendSrc:THREE.SrcAlphaFactor,blendDst:mode==='mote'||mode==='flame'||mode==='ember'?THREE.OneFactor:THREE.OneMinusSrcAlphaFactor,
       blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor,blendEquation:THREE.AddEquation,blendEquationAlpha:THREE.AddEquation,side:THREE.DoubleSide});
     material.userData.preserveTargetAlpha=true;MarkNoPrepass(material);
     const mesh=new THREE.Mesh(geometry,material);mesh.name='ParticleSystem_'+mode;mesh.frustumCulled=false;mesh.renderOrder=mode==='smoke'?21:mode==='ember'?23:20;
     if(mode==='volume')mesh.renderOrder=5;
     mesh.userData.skipNormalDepth=true;mesh.matrixAutoUpdate=false;root.add(mesh);
     this.pools[mode]={capacity,geometry,material,mesh,arrays,attributes,cursor:0,owners:new Array(capacity).fill(null),dirty:false,dropped:0};
   }
 }
 Register(system,profile=null) {
   const slot=this.freeSlots.length?this.freeSlots.pop():this.nextSlot++;
   if(slot>=PARTICLE_LIMITS.systems){this.nextSlot--;throw new Error('Particle system capacity exhausted');}
   this.slots.set(system,slot);
   if(profile){
     const uniforms={
       uTime:{value:system.time},uParticleSlot:{value:slot},uParticleCurves:{value:this.curves},uParticleSystems:{value:this.systems},
       uCurveDimensions:{value:new THREE.Vector2(PARTICLE_LIMITS.curveSamples,PARTICLE_LIMITS.systems*6)},uSystemCount:{value:PARTICLE_LIMITS.systems},
     };
     const batch=profile.config.renderer==='mesh'?new ParticleMeshBatch(system.modules.main.maxParticles,this.shared,profile.config,uniforms)
       :new ParticleBatch(system.modules.main.maxParticles,profile.config,this.shared,uniforms);
     batch.mesh.name='ParticleChannel_'+profile.name;this.root.add(batch.mesh);this.streams.set(system,batch);
   }
   this.Configure(system);return slot;
 }
 Configure(system) {
   const slot=this.slots.get(system),m=system.modules,n=PARTICLE_LIMITS.curveSamples;
   for(let i=0;i<n;i++)for(let choice=0;choice<2;choice++) {
     const t=i/(n-1),color=m.colorOverLifetime.enabled?EvaluateGradient(m.colorOverLifetime.gradient,t):[1,1,1,1];
     this.curveData.set(color,((slot*6+choice)*n+i)*4);
     this.curveData.set([m.sizeOverLifetime.enabled?EvaluateCurve(m.sizeOverLifetime.curve,t,choice):1,
       m.rotationOverLifetime.enabled?IntegrateCurve(m.rotationOverLifetime.angularVelocity,t,choice):0,
       m.noise.enabled?EvaluateCurve(m.noise.strength,t,choice):0,0],((slot*6+2+choice)*n+i)*4);
     this.curveData.set([...['x','y','z'].map(axis=>m.velocityOverLifetime.enabled?IntegrateCurve(m.velocityOverLifetime[axis],t,choice):0),0],((slot*6+4+choice)*n+i)*4);
   }
   this.curves.needsUpdate=true;this.Sync(system);
   if(m.renderer.mode==='bakedVolume')this.volumes.Pool(m.renderer.volumeAsset);
   this.volumes.Configure(system);
   const stream=this.streams.get(system);if(stream){if(stream.material.uniforms.uSoftRange)stream.material.uniforms.uSoftRange.value=m.renderer.softRange;stream.material.uniforms.uParticleAspect.value=m.renderer.aspect;if(stream.material.uniforms.uParticleVolume)stream.material.uniforms.uParticleVolume.value.x=m.renderer.density;}
 }
 Sync(system) {
   const slot=this.slots.get(system);if(slot===undefined)return;
   const m=system.modules;
   this.systemData.set([system.time,...system.position,m.main.simulationSpace==='local'?1:0,m.noise.frequency,m.noise.scrollSpeed,m.renderer.enabled?1:0,...m.renderer.bounds,0,m.renderer.density,m.renderer.nearFade,m.renderer.aspect,m.renderer.softRange],slot*16);
   this.systems.needsUpdate=true;
   const stream=this.streams.get(system);if(stream){stream.material.uniforms.uTime.value=system.time;stream.enabled=m.renderer.enabled;}
 }
 Spawn(particle,system) {
   if(system.modules.renderer.mode==='bakedVolume')return this.volumes.Spawn(particle,system,this.slots.get(system));
   const stream=this.streams.get(system);
   if(stream){
     if(stream.config.renderer==='mesh'){
       const p=particle,d=p.packed||{x:p.origin[0],y:p.origin[1],z:p.origin[2],vx:p.velocity[0],vy:p.velocity[1],vz:p.velocity[2],
         life:p.life,sx:p.size,sy:p.size,sz:p.size,rx:0,ry:1,rz:0,color:p.color.slice(0,3),opacity:p.color[3],drag:p.drag,groundY:-9999,bounce:0,seed:p.seed,force:p.force,initialRotation:p.rotation};
       return stream.Spawn(d,p.birth);
     }
     const p=particle,s=p.packed||{x:p.origin[0],y:p.origin[1],z:p.origin[2],vx:p.velocity[0],vy:p.velocity[1],vz:p.velocity[2],
       ax:p.force[0],ay:p.force[1],az:p.force[2],life:p.life,sizeStart:p.size,sizeEnd:p.size,angle:p.rotation,spin:0,
       colorA:p.color.slice(0,3),colorB:p.color.slice(0,3),opacity:p.color[3],fadeIn:0,drag:p.drag,seed:p.seed,
       stretch:0,flicker:0,groundY:-9999,frame:0,minPx:0,nx:0,ny:1,nz:0};
     return stream.Spawn(s,p.birth);
   }
   const pool=this.pools[system.modules.renderer.mode],slot=this.slots.get(system);
   let index=-1;
   for(let offset=0;offset<pool.capacity;offset++) {
     const i=(pool.cursor+offset)%pool.capacity,owner=pool.owners[i];
     if(!owner||pool.arrays.iBirth[i*4]+pool.arrays.iBirth[i*4+1]<=owner.time){index=i;break;}
   }
   if(index<0){pool.dropped++;return -1;}
   pool.cursor=(index+1)%pool.capacity;pool.owners[index]=system;
   const a=pool.arrays,m=system.modules,p=particle;
   a.iBirth.set([p.birth,p.life,slot,p.seed],index*4);a.iOrigin.set(p.origin,index*3);a.iVelocity.set(p.velocity,index*3);
   a.iForce.set([...p.force,p.drag],index*4);a.iSize.set([p.size,p.rotation,m.renderer.aspect,m.renderer.softRange],index*4);
   a.iColor.set(p.color,index*4);
   pool.dirty=true;
   return index;
 }
 Clear(system) {
   this.volumes.Clear(system);
   const stream=this.streams.get(system);if(stream){stream.Clear();return;}
   for(const pool of Object.values(this.pools))for(let i=0;i<pool.capacity;i++)if(!system||pool.owners[i]===system) {
     pool.owners[i]=null;pool.arrays.iBirth[i*4+1]=0;pool.dirty=true;
   }
 }
 Retire(particle,system){
   if(system.modules.renderer.mode==='bakedVolume'){this.volumes.Retire(particle,system);return;}
   const stream=this.streams.get(system),slot=particle.slot;if(!Number.isInteger(slot))return;
   if(stream){stream.deathTime[slot]=0;stream.arrays.iSpawnLife[slot*2+1]=0;stream.dirtyMin=Math.min(stream.dirtyMin,slot);stream.dirtyMax=Math.max(stream.dirtyMax,slot);return;}
   const pool=this.pools[system.modules.renderer.mode];
   if(pool?.owners[slot]===system){pool.owners[slot]=null;pool.arrays.iBirth[slot*4+1]=0;pool.dirty=true;}
 }
 Remove(system) {this.Clear(system);const stream=this.streams.get(system);if(stream){stream.mesh.removeFromParent();stream.Dispose();this.streams.delete(system);}const slot=this.slots.get(system);if(slot!==undefined)this.freeSlots.push(slot);this.slots.delete(system);}
 Flush() {
   for(const system of this.slots.keys())this.Sync(system);
   for(const [system,stream]of this.streams)stream.Flush(system.time);
   this.volumes.Flush();
   for(const pool of Object.values(this.pools)) {
     if(pool.dirty){for(const attribute of Object.values(pool.attributes))attribute.needsUpdate=true;pool.dirty=false;}
     let last=-1;
     for(let i=pool.capacity-1;i>=0;i--) {const owner=pool.owners[i];if(owner&&pool.arrays.iBirth[i*4]+pool.arrays.iBirth[i*4+1]>owner.time){last=i;break;}}
     pool.geometry.instanceCount=last+1;
   }
 }
 Inspect() {return {systems:this.slots.size,volumes:this.volumes.Inspect(),pools:Object.fromEntries(Object.entries(this.pools).map(([name,p])=>[name,{capacity:p.capacity,instances:p.geometry.instanceCount,dropped:p.dropped}])),
   channels:[...this.streams].map(([s,p])=>({name:p.mesh.name,capacity:p.capacity,instances:p.geometry.instanceCount,time:s.time,live:s.particles.length,emitted:s.emitted,dropped:s.dropped}))};}
 Dispose() {this.volumes.Dispose();for(const stream of this.streams.values()){stream.mesh.removeFromParent();stream.Dispose();}this.streams.clear();for(const pool of Object.values(this.pools)){pool.mesh.removeFromParent();pool.geometry.dispose();pool.material.dispose();}this.curves.dispose();this.systems.dispose();this.slots.clear();this.releaseDensity();}
}
