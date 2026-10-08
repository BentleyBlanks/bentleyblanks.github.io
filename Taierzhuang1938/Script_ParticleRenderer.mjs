import * as THREE from 'three';
import { MarkNoPrepass } from './Script_Post.mjs';
import { EvaluateCurve, EvaluateGradient, IntegrateCurve } from './Script_ParticleModules.mjs';
import { PARTICLE_LIMITS } from './Data_Tuning_Particles.mjs';

const VERTEX=/*glsl*/`
attribute vec4 iBirth;
attribute vec3 iOrigin;
attribute vec3 iVelocity;
attribute vec4 iForce;
attribute vec4 iSize;
attribute vec4 iColor;
uniform sampler2D uParticleCurves;
uniform sampler2D uParticleSystems;
uniform vec2 uCurveDimensions;
uniform float uSystemCount;
varying vec2 vUv;
varying vec4 vColor;
varying vec4 vShape;
varying float vDepth;
varying float vDistance;
vec4 Curve(float row,float age){
 float x=clamp(age,0.,1.)*(uCurveDimensions.x-1.);
 vec2 a=vec2((floor(x)+.5)/uCurveDimensions.x,(iBirth.z*6.+row+.5)/uCurveDimensions.y);
 return mix(texture2D(uParticleCurves,a),texture2D(uParticleCurves,a+vec2(1./uCurveDimensions.x,0.)),fract(x));
}
void main(){
 vec4 system=texture2D(uParticleSystems,vec2(.25,(iBirth.z+.5)/uSystemCount));
 vec4 info=texture2D(uParticleSystems,vec2(.75,(iBirth.z+.5)/uSystemCount));
 float age=system.x-iBirth.x,t=clamp(age/iBirth.y,0.,1.);
 if(iBirth.y<=0.||age<0.||age>=iBirth.y){gl_Position=vec4(2.,2.,2.,1.);return;}
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
 float angle=iSize.y+parameters.y*iBirth.y,cs=cos(angle),sn=sin(angle);
 vec2 corner=vec2(position.x*cs-position.y*sn,position.x*sn+position.y*cs);
 float size=iSize.x*parameters.x;
 vec4 view=modelViewMatrix*vec4(world,1.);
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
#ifdef PARTICLE_FLAME
 // Attached sheet stretches vertically. Independent eddies carry heat upward;
 // the base stays broad while the ragged tips split and cool before vanishing.
 float flow=Fbm(vec2(uv.x*3.3+seed,uv.y*3.4-age*3.2));
 float detail=Noise(vec2(uv.x*8.1+seed,uv.y*7.5-age*5.8));
 float bend=(flow-.5)*(.12+uv.y*.28);
 vec2 flameUv=uv+vec2(bend,(flow-.5)*.09);
 if(vShape.x>.5)flameUv.x=1.-flameUv.x;
 // Production masks are uploaded with flipY=false (top row first).
 flameUv.y=1.-flameUv.y;
 float authored=texture2D(uParticleFireMap,clamp(flameUv,0.,1.)).r;
 float envelope=exp(-pow((uv.x-.5+bend)*2.2,2.))*(1.-smoothstep(.35,1.,uv.y));
 float fuel=mix(envelope,authored,uParticleFireReady);
 float fissure=smoothstep(.17,.64,fuel*.65+flow*.33+detail*.22);
 mask=fuel*fissure*smoothstep(0.,.045,uv.y)*(1.-smoothstep(.9,1.,uv.y));
 float heat=clamp(fuel*.65+flow*.23+detail*.12,0.,1.);
 color*=mix(vec3(.4,.12,.025),vec3(1.2,1.1,.92),smoothstep(.22,.87,heat));
#elif defined(PARTICLE_SMOKE)
 vec2 p=uv*2.-1.;float n=Fbm(p*2.+vec2(seed,age*.12));
 float density=(1.-smoothstep(.13,.98,length(p)+(.5-n)*.38))*(.45+n*.65);
 mask=density*density;
 color*=uSkyColor+uSunColor*(.24+.36*n);
#else
 vec2 p=uv*2.-1.;mask=exp(-dot(p,p)*4.)*(1.-smoothstep(.65,1.,length(p)));
#endif
 float alpha=mask*vColor.a*uGlobalFade;
 if(uDepthValid>.5){
   float depth=texture2D(uNormalDepth,gl_FragCoord.xy/uResolution).w;
   if(depth>0.)alpha*=clamp((depth-vDepth)/max(vShape.w,.001),0.,1.);
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
   this.root=root;this.shared=shared;this.pools={};this.slots=new Map();this.nextSlot=0;this.freeSlots=[];
   this.curveData=new Float32Array(PARTICLE_LIMITS.curveSamples*PARTICLE_LIMITS.systems*6*4);
   this.systemData=new Float32Array(PARTICLE_LIMITS.systems*8);
   this.curves=FloatTexture(this.curveData,PARTICLE_LIMITS.curveSamples,PARTICLE_LIMITS.systems*6);
   this.systems=FloatTexture(this.systemData,2,PARTICLE_LIMITS.systems);
   const budgets=PARTICLE_LIMITS[quality]||PARTICLE_LIMITS.high;
   for(const mode of ['flame','smoke','ember']) {
     const capacity=budgets[mode],geometry=new THREE.InstancedBufferGeometry();
     geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3));geometry.setIndex([0,1,2,0,2,3]);geometry.instanceCount=0;
     const arrays={},attributes={};
     for(const [name,size]of Object.entries({iBirth:4,iOrigin:3,iVelocity:3,iForce:4,iSize:4,iColor:4})) {
       arrays[name]=new Float32Array(capacity*size);attributes[name]=new THREE.InstancedBufferAttribute(arrays[name],size).setUsage(THREE.DynamicDrawUsage);geometry.setAttribute(name,attributes[name]);
     }
     const material=new THREE.ShaderMaterial({vertexShader:VERTEX,fragmentShader:FRAGMENT,defines:{['PARTICLE_'+mode.toUpperCase()]:''},
       uniforms:{...shared,uParticleCurves:{value:this.curves},uParticleSystems:{value:this.systems},uCurveDimensions:{value:new THREE.Vector2(PARTICLE_LIMITS.curveSamples,PARTICLE_LIMITS.systems*6)},uSystemCount:{value:PARTICLE_LIMITS.systems}},
       transparent:true,depthWrite:false,depthTest:true,blending:THREE.CustomBlending,blendSrc:THREE.SrcAlphaFactor,blendDst:THREE.OneMinusSrcAlphaFactor,
       blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor,blendEquation:THREE.AddEquation,blendEquationAlpha:THREE.AddEquation,side:THREE.DoubleSide});
     material.userData.preserveTargetAlpha=true;MarkNoPrepass(material);
     const mesh=new THREE.Mesh(geometry,material);mesh.name='ParticleSystem_'+mode;mesh.frustumCulled=false;mesh.renderOrder=mode==='smoke'?21:mode==='ember'?23:20;
     mesh.userData.skipNormalDepth=true;mesh.matrixAutoUpdate=false;root.add(mesh);
     this.pools[mode]={capacity,geometry,material,mesh,arrays,attributes,cursor:0,owners:new Array(capacity).fill(null),dirty:false,dropped:0};
   }
 }
 Register(system) {
   const slot=this.freeSlots.length?this.freeSlots.pop():this.nextSlot++;
   if(slot>=PARTICLE_LIMITS.systems){this.nextSlot--;throw new Error('Particle system capacity exhausted');}
   this.slots.set(system,slot);this.Configure(system);return slot;
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
 }
 Sync(system) {
   const slot=this.slots.get(system);if(slot===undefined)return;
   const m=system.modules;
   this.systemData.set([system.time,...system.position,m.main.simulationSpace==='local'?1:0,m.noise.frequency,m.noise.scrollSpeed,0],slot*8);
   this.systems.needsUpdate=true;
 }
 Spawn(particle,system) {
   const pool=this.pools[system.modules.renderer.mode],slot=this.slots.get(system);
   let index=-1;
   for(let offset=0;offset<pool.capacity;offset++) {
     const i=(pool.cursor+offset)%pool.capacity,owner=pool.owners[i];
     if(!owner||pool.arrays.iBirth[i*4]+pool.arrays.iBirth[i*4+1]<=owner.time){index=i;break;}
   }
   if(index<0){pool.dropped++;return;}
   pool.cursor=(index+1)%pool.capacity;pool.owners[index]=system;
   const a=pool.arrays,m=system.modules,p=particle;
   a.iBirth.set([p.birth,p.life,slot,p.seed],index*4);a.iOrigin.set(p.origin,index*3);a.iVelocity.set(p.velocity,index*3);
   a.iForce.set([...p.force,p.drag],index*4);a.iSize.set([p.size,p.rotation,m.renderer.aspect,m.renderer.softRange],index*4);
   a.iColor.set(p.color,index*4);
   pool.dirty=true;
 }
 Clear(system) {
   for(const pool of Object.values(this.pools))for(let i=0;i<pool.capacity;i++)if(!system||pool.owners[i]===system) {
     pool.owners[i]=null;pool.arrays.iBirth[i*4+1]=0;pool.dirty=true;
   }
 }
 Remove(system) {this.Clear(system);const slot=this.slots.get(system);if(slot!==undefined)this.freeSlots.push(slot);this.slots.delete(system);}
 Flush() {
   for(const system of this.slots.keys())this.Sync(system);
   for(const pool of Object.values(this.pools)) {
     if(pool.dirty){for(const attribute of Object.values(pool.attributes))attribute.needsUpdate=true;pool.dirty=false;}
     let last=-1;
     for(let i=pool.capacity-1;i>=0;i--) {const owner=pool.owners[i];if(owner&&pool.arrays.iBirth[i*4]+pool.arrays.iBirth[i*4+1]>owner.time){last=i;break;}}
     pool.geometry.instanceCount=last+1;
   }
 }
 Inspect() {return {systems:this.slots.size,pools:Object.fromEntries(Object.entries(this.pools).map(([name,p])=>[name,{capacity:p.capacity,instances:p.geometry.instanceCount,dropped:p.dropped}]))};}
 Dispose() {for(const pool of Object.values(this.pools)){pool.mesh.removeFromParent();pool.geometry.dispose();pool.material.dispose();}this.curves.dispose();this.systems.dispose();this.slots.clear();}
}
