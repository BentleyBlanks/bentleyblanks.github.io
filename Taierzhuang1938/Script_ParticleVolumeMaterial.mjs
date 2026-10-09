import * as THREE from 'three';
import {PARTICLE_GPU_MODULES} from './Script_ParticleGpuModules.mjs';

const textureCache=new WeakMap();

// World-space ray integration of an animated simulation field. This is also
// used by the local reference inspection scene; no camera-facing smoke mask.
export const PARTICLE_VOLUME_SAMPLE=/*glsl*/`
precision highp sampler3D;
uniform sampler3D uVolume;
uniform vec3 uVolumeDimensions;
uniform vec3 uVolumeTiles;
uniform float uVolumeFrames;
uniform float uVolumeDuration;
uniform float uVolumeTime;
uniform float uVolumeLoop;
#ifdef PARTICLE_VOLUME_INSTANCED
varying float vVolumeTime;
varying vec4 vVolumeLook;
#endif
vec2 VolumeFrame(vec3 uv,float frame){
 if(any(lessThan(uv,vec3(0.)))||any(greaterThan(uv,vec3(1.))))return vec2(0.);
 vec3 tile=vec3(mod(frame,uVolumeTiles.x),mod(floor(frame/uVolumeTiles.x),uVolumeTiles.y),floor(frame/(uVolumeTiles.x*uVolumeTiles.y)));
 vec3 halfTexel=.5/uVolumeDimensions;
 vec2 value=texture(uVolume,(clamp(uv,halfTexel,1.-halfTexel)+tile)/uVolumeTiles).rg;
 return value*value;
}
vec2 VolumeAtTime(vec3 uv,float seconds){
 float frame=clamp(seconds/uVolumeDuration,0.,.999999)*(uVolumeFrames-1.);
 float first=floor(frame);return mix(VolumeFrame(uv,first),VolumeFrame(uv,min(first+1.,uVolumeFrames-1.)),fract(frame));
}
vec2 VolumeSample(vec3 uv){
 float clock=uVolumeTime,loop=uVolumeLoop;
#ifdef PARTICLE_VOLUME_INSTANCED
 clock=vVolumeTime;loop=vVolumeLook.w;
#endif
 if(loop<.5)return VolumeAtTime(uv,clock);
 // Forward-only overlap: both halves keep the original simulation motion.
 float blendSeconds=uVolumeDuration*.16,period=uVolumeDuration-blendSeconds;
 float t=mod(max(0.,clock),period);
 vec2 first=VolumeAtTime(uv,t+blendSeconds);
 if(t<period-blendSeconds)return first;
 return mix(first,VolumeAtTime(uv,t-(period-blendSeconds)),smoothstep(period-blendSeconds,period,t));
}
`;

const VERTEX=/*glsl*/`
varying vec3 vWorld;
#ifdef PARTICLE_VOLUME_INSTANCED
${PARTICLE_GPU_MODULES}
attribute vec4 iBirth;
attribute vec3 iOrigin;
attribute vec3 iVelocity;
attribute vec4 iForce;
attribute vec4 iSize;
attribute vec4 iColor;
attribute vec4 iBounds;
attribute vec4 iVolume;
attribute float iPhase;
uniform vec3 uVolumeAnchor;
uniform float uVolumeDuration;
varying vec3 vCenter;
varying vec3 vScale;
varying vec2 vRotation;
varying float vVolumeTime;
varying vec4 vVolumeLook;
varying vec4 vVolumeTint;
vec3 Rotate(vec3 p,vec2 r){return vec3(p.x*r.x+p.z*r.y,p.y,-p.x*r.y+p.z*r.x);}
#endif
void main(){
#ifdef PARTICLE_VOLUME_INSTANCED
 vec4 system=ParticleState(iBirth.z),noise=ParticleNoise(iBirth.z),look=ParticleAppearance(iBirth.z);
 float age=system.x-iBirth.x,t=clamp(age/max(.001,iBirth.y),0.,1.);
 if(iBirth.y<=0.||age<0.||age>=iBirth.y||noise.w<.5){gl_Position=vec4(2.,2.,2.,1.);return;}
 vec4 parameters=mix(ParticleCurve(iBirth.z,2.,t),ParticleCurve(iBirth.z,3.,t),iBirth.w);
 vec3 motion=mix(ParticleCurve(iBirth.z,4.,t),ParticleCurve(iBirth.z,5.,t),iBirth.w).xyz*iBirth.y;
 vec3 root=iOrigin+system.yzw*noise.x+motion;float k=iForce.w;
 if(k>.001)root+=(iVelocity-iForce.xyz/k)*(1.-exp(-k*age))/k+iForce.xyz*age/k;
 else root+=iVelocity*age+iForce.xyz*age*age*.5;
 float phase=iBirth.w*31.,clock=age*noise.z;
 root.x+=(sin(clock*noise.y+phase)-sin(phase))*parameters.z;
 root.z+=(sin(clock*noise.y*1.37+phase*1.9)-sin(phase*1.9))*parameters.z*.7;
 float angle=iSize.y+iSize.z+parameters.y*iBirth.y;vRotation=vec2(cos(angle),sin(angle));
 vScale=max(vec3(.001),iBounds.xyz*iSize.x*parameters.x);
 vCenter=root+Rotate((vec3(.5)-uVolumeAnchor)*vScale,vRotation);
 vWorld=vCenter+Rotate(position*vScale,vRotation);
 vVolumeTime=(iVolume.w>.5?system.x:age)*iBounds.w+(iVolume.w>.5?iPhase*uVolumeDuration:0.);
 vVolumeLook=vec4(look.x*iVolume.x,iVolume.y,iVolume.z,iVolume.w);
 vVolumeTint=mix(ParticleCurve(iBirth.z,0.,t),ParticleCurve(iBirth.z,1.,t),iBirth.w)*iColor;
 if(iSize.w>0.)vVolumeTint.a*=smoothstep(0.,iSize.w,age)*(1.-smoothstep(.85,1.,t));
 gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);
#else
 vec4 p=modelMatrix*vec4(position,1.);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;
#endif
}
`;
const FRAGMENT=/*glsl*/`
${PARTICLE_VOLUME_SAMPLE}
uniform mat4 uWorldToVolume;
uniform vec3 uLightDirection;
uniform vec3 uLightColor;
uniform vec3 uAmbientColor;
uniform vec3 uAlbedo;
uniform float uExtinction;
uniform float uEmission;
uniform float uFlameExtinction;
uniform float uStepCount;
uniform float uShadowCount;
uniform float uPhaseG;
uniform sampler2D uNormalDepth;
uniform vec2 uResolution;
uniform float uDepthValid;
uniform float uGlobalFade;
uniform float uFogDensity;
uniform float uFogMax;
uniform vec3 uFogColorSky;
varying vec3 vWorld;
#ifdef PARTICLE_VOLUME_INSTANCED
varying vec3 vCenter;
varying vec3 vScale;
varying vec2 vRotation;
varying vec4 vVolumeTint;
vec3 LocalDirection(vec3 p){return vec3(p.x*vRotation.x-p.z*vRotation.y,p.y,p.x*vRotation.y+p.z*vRotation.x)/vScale;}
#endif
vec2 BoxHit(vec3 ro,vec3 rd){
 vec3 safe=sign(rd+vec3(1e-12))*max(abs(rd),vec3(1e-7));
 vec3 a=(-.5-ro)/safe,b=(.5-ro)/safe;
 vec3 near=min(a,b),far=max(a,b);return vec2(max(max(near.x,near.y),near.z),min(min(far.x,far.y),far.z));
}
float Phase(float cosine,float g){return (1.-g*g)/pow(max(.05,1.+g*g-2.*g*cosine),1.5);}
vec3 FireRadiance(float heat,float emission){
 // The source exports a flames field, not Kelvin. Map it explicitly to an
 // authored temperature interval; Planck ratios provide the spectral color.
 float kelvin=mix(1050.,1950.,pow(clamp(heat,0.,1.),.32));
 vec3 wavelength=vec3(0.65,0.55,0.45);
 vec3 planck=1./(pow(wavelength,vec3(5.))*(exp(14387.77/(wavelength*kelvin))-1.));
 return planck/max(planck.r,1e-8)*pow(kelvin/1800.,4.)*pow(max(heat,0.),.65)*emission;
}
void main(){
 vec3 ray=normalize(vWorld-cameraPosition),light=normalize(uLightDirection);
 vec3 ro=(uWorldToVolume*vec4(cameraPosition,1.)).xyz,rd=(uWorldToVolume*vec4(ray,0.)).xyz;
 vec3 lightLocal=(uWorldToVolume*vec4(light,0.)).xyz;
 float extinction=uExtinction,emission=uEmission,flameExtinction=uFlameExtinction,opacityScale=1.;vec3 tint=vec3(1.);
#ifdef PARTICLE_VOLUME_INSTANCED
 ro=LocalDirection(cameraPosition-vCenter);rd=LocalDirection(ray);lightLocal=LocalDirection(light);
 extinction=vVolumeLook.x;emission=vVolumeLook.y;flameExtinction=vVolumeLook.z;opacityScale=vVolumeTint.a;tint=vVolumeTint.rgb;
#endif
 vec2 hit=BoxHit(ro,rd);float start=max(0.,hit.x),end=hit.y;if(end<=start)discard;
 float sceneDepth=uDepthValid>.5?texture2D(uNormalDepth,gl_FragCoord.xy/uResolution).w:0.;
 if(sceneDepth>0.)end=min(end,sceneDepth/max(.001,-(viewMatrix*vec4(ray,0.)).z));
 if(end<=start)discard;
 float lod=1.;
#ifdef PARTICLE_VOLUME_INSTANCED
 float projectedHeight=max(vScale.x,max(vScale.y,vScale.z))/max(.1,length(vCenter-cameraPosition))*uResolution.y;
 lod=clamp(projectedHeight/260.,.25,1.);
#endif
 float steps=clamp(ceil(uStepCount*lod),8.,96.),shadowSteps=uShadowCount>0.?max(2.,ceil(uShadowCount*lod)):0.,ds=(end-start)/steps;
 // ray points camera -> sample and light points sample -> sun. Looking toward
 // the sun is forward scattering (positive cosine), not back scattering.
 float scatteringPhase=Phase(dot(ray,light),uPhaseG);
 vec3 radiance=vec3(0.);float transmission=1.;
 for(int i=0;i<96;i++){
  if(float(i)>=steps||transmission<.005)break;
  vec3 p=ro+rd*(start+(float(i)+.5)*ds),uv=p+.5;
  vec2 field=VolumeSample(uv);float sigma=(field.r*extinction+field.g*flameExtinction)*opacityScale;
  if(sigma<.0001&&field.g<.0001)continue;
  float lightDistance=max(0.,BoxHit(p,lightLocal).y),tau=0.;
  for(int j=0;j<6;j++){
   if(float(j)>=shadowSteps)break;
   float t=(float(j)+.5)/shadowSteps;
   tau+=VolumeSample(uv+lightLocal*lightDistance*t).r*extinction*opacityScale*lightDistance/shadowSteps;
  }
  vec3 incident=uAmbientColor+uLightColor*exp(-tau)*scatteringPhase;
  float next=exp(-sigma*ds),alpha=1.-next;
  radiance+=transmission*tint*(uAlbedo*incident*alpha+FireRadiance(field.g,emission)*opacityScale*(sigma>.0001?alpha/sigma:ds));
  transmission*=next;
 }
 float opacity=1.-transmission;
 // The scene composite already fogs opaque backgrounds. Supply the missing
 // atmospheric attenuation only where this depth-excluded effect faces sky.
 if(uDepthValid>.5&&sceneDepth<=0.)radiance=mix(radiance,uFogColorSky*opacity,min(uFogMax,1.-exp(-uFogDensity*(start+end)*.275)));
 if(opacity<.001&&max(radiance.r,max(radiance.g,radiance.b))<.001)discard;
 // Premultiplied radiance + transmittance, preserving the destination HDR alpha.
 gl_FragColor=vec4(radiance*uGlobalFade,opacity*uGlobalFade);
}
`;
export function CreateParticleVolumeMaterial(asset,{time=0,extinction=3,emission=0,flameExtinction=12,albedo=[.45,.43,.40],steps=64,shadowSteps=5,instanced=false,shared={}}={}){
 const {metadata:m,size,data}=asset;let cached=textureCache.get(asset);
 if(!cached){const texture=new THREE.Data3DTexture(data,...size);
  texture.format=m.channels===1?THREE.RedFormat:THREE.RGFormat;texture.type=THREE.UnsignedByteType;
  texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.unpackAlignment=1;texture.generateMipmaps=false;texture.needsUpdate=true;
  cached={texture,references:0};textureCache.set(asset,cached);}
 cached.references++;const texture=cached.texture;
 const material=new THREE.ShaderMaterial({vertexShader:VERTEX,fragmentShader:FRAGMENT,
  defines:instanced?{PARTICLE_VOLUME_INSTANCED:''}:{},
  uniforms:{uVolume:{value:texture},uVolumeDimensions:{value:new THREE.Vector3(...m.dimensions)},uVolumeTiles:{value:new THREE.Vector3(...m.atlasTiles)},
   uVolumeAnchor:{value:new THREE.Vector3(...m.anchor)},uNormalDepth:{value:null},uDepthValid:{value:0},uResolution:{value:new THREE.Vector2(1,1)},uGlobalFade:{value:1},
   uFogDensity:{value:0},uFogMax:{value:0},uFogColorSky:{value:new THREE.Vector3()},
   uVolumeFrames:{value:m.frames},uVolumeDuration:{value:m.duration},uVolumeTime:{value:time},uVolumeLoop:{value:1},uWorldToVolume:{value:new THREE.Matrix4()},
   uLightDirection:{value:new THREE.Vector3(-.6,.8,.4).normalize()},uLightColor:{value:new THREE.Vector3(1.7,1.6,1.45)},uAmbientColor:{value:new THREE.Vector3(.13,.16,.20)},
   uAlbedo:{value:new THREE.Vector3(...albedo)},uExtinction:{value:extinction},uEmission:{value:emission},uFlameExtinction:{value:flameExtinction},uStepCount:{value:steps},uShadowCount:{value:shadowSteps},uPhaseG:{value:.25},...shared},
  side:THREE.BackSide,transparent:true,depthTest:false,depthWrite:false,blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor,blendEquation:THREE.AddEquation,blendEquationAlpha:THREE.AddEquation});
 material.name='ParticleVolume_'+m.asset;material.userData.preserveTargetAlpha=true;
 material.addEventListener('dispose',()=>{if(--cached.references===0){texture.dispose();textureCache.delete(asset);}});return material;
}
