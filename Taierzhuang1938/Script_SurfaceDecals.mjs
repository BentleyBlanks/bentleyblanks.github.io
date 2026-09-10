// Instanced box projection onto the CURRENT opaque depth/normal buffer.
// No floating quads, copied terrain formula, extra frame-graph pass or Three addon.
// Each layer is one draw; persistent dressing and transient impacts own separate slots.
import * as THREE from "three";
import { MarkNoPrepass } from "./Script_Post.mjs";
import { SUN_SHADOW_GLSL, BindSunShadowUniforms } from "./Script_Light.mjs";
import { BLOOD_SURFACE as C } from "./Data_Tuning_Blood.mjs";

const VERT = /* glsl */`
attribute vec3 iCenter;
attribute vec3 iTangent;
attribute vec3 iBitangent;
attribute vec3 iNormal;
attribute vec4 iShape; // radius x/y, projection depth, seeded texture offset
attribute vec4 iState; // birth, pre-age, kind (pool=1, splash=0), opacity
varying vec3 vCenter;
varying vec3 vTangent;
varying vec3 vBitangent;
varying vec3 vNormal;
varying vec4 vShape;
varying vec4 vState;
void main() {
  vCenter=iCenter;vTangent=iTangent;vBitangent=iBitangent;vNormal=iNormal;
  vShape=iShape;vState=iState;
  vec3 world=iCenter+iTangent*position.x*iShape.x
    +iBitangent*position.y*iShape.y+iNormal*position.z*iShape.z;
  gl_Position=projectionMatrix*viewMatrix*vec4(world,1.0);
}`;
const FRAG = /* glsl */`
uniform sampler2D uNormalDepth;
uniform sampler2D uBloodTexture;
uniform vec2 uResolution;
uniform mat4 uBloodInverseProjection;
uniform mat4 uBloodCameraWorld;
uniform float uDepthValid;
uniform float uBloodTextureReady;
uniform float uTime;
uniform float uGlobalFade;
uniform float uPersistent;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uBloodFresh;
uniform vec3 uBloodDry;
varying vec3 vCenter;
varying vec3 vTangent;
varying vec3 vBitangent;
varying vec3 vNormal;
varying vec4 vShape;
varying vec4 vState;
${SUN_SHADOW_GLSL}
float Hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float Noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(Hash(i),Hash(i+vec2(1,0)),f.x),mix(Hash(i+vec2(0,1)),Hash(i+1.0),f.x),f.y);}
void main(){
  if(uDepthValid<.5||vState.w<=0.0)discard;
  vec2 screenUv=gl_FragCoord.xy/uResolution;
  vec4 nd=texture2D(uNormalDepth,screenUv);
  if(nd.w<=0.0)discard;
  // Linear view depth, not device Z. Inverse projection includes this frame's TAA jitter.
  vec4 ray=uBloodInverseProjection*vec4(screenUv*2.0-1.0,1.0,1.0);
  vec3 view=ray.xyz*(nd.w/max(-ray.z,1e-6));
  vec3 world=(uBloodCameraWorld*vec4(view,1.0)).xyz;
  vec3 delta=world-vCenter;
  vec3 local=vec3(dot(delta,vTangent)/vShape.x,dot(delta,vBitangent)/vShape.y,
    dot(delta,vNormal)/vShape.z);
  if(any(greaterThan(abs(local),vec3(1.0))))discard;
  vec3 normal=normalize(mat3(uBloodCameraWorld)*nd.xyz);
  float facing=dot(normal,vNormal);
  if(facing<${C.normalReject})discard;
  float age=max(0.0,uTime-vState.x),dry=clamp((age+vState.y)/${C.drySeconds.toFixed(1)},0.0,1.0);
  float pool=vState.z;
  float grow=vState.y>0.0?1.0:mix(.32,1.0,1.0-exp(-age/${C.growSeconds}));
  vec2 p=local.xy/mix(1.0,grow,pool);
  vec2 offset=vec2(vShape.w*7.3,vShape.w*13.1);
  float noise=Noise(p*4.8+offset),fine=Noise(p*35.0+offset);
  vec4 authored=texture2D(uBloodTexture,p*.36+.5+offset);
  float detail=mix(fine,authored.a,uBloodTextureReady);
  // Multiple pooled lobes, capillary fringe, isolated satellite drops. No disc/ring mask.
  vec2 warp=p+vec2(Noise(p*3.1+offset),Noise(p*3.1+offset.yx))*.24-.12;
  float radius=length(warp),edge=.59+(noise-.5)*.29;
  float core=1.0-smoothstep(edge-.08,edge+.055,radius);
  float fringe=(1.0-smoothstep(edge,edge+.22,radius))*detail*.58;
  float footprint=1.0-smoothstep(.67,.99,length(p));
  float splash=max(detail*footprint*mix(.42,1.0,noise),core*.48*(.35+.65*detail));
  float alpha=mix(splash,max(core,fringe),pool)*vState.w;
  alpha*=smoothstep(${C.normalReject},.85,facing);
  alpha*=uGlobalFade*(uPersistent>.5?1.0:1.0-smoothstep(${C.lifeSeconds-20}.0,${C.lifeSeconds}.0,age));
  if(alpha<.008)discard;
  vec3 albedo=mix(uBloodFresh,uBloodDry,dry)*mix(.72,1.13,detail);
  // Thin liquid dielectric: roughness increases as the film dries. GGX direct light + CSM.
  float rough=mix(${C.roughnessWet},${C.roughnessDry},dry);
  vec3 eye=normalize(cameraPosition-world),light=normalize(uSunDirection),halfway=normalize(eye+light);
  float nl=max(dot(normal,light),0.0),nv=max(dot(normal,eye),.001),nh=max(dot(normal,halfway),0.0);
  float a2=pow(rough,4.0),den=nh*nh*(a2-1.0)+1.0;
  float distribution=a2/max(3.14159265*den*den,1e-5);
  float k=pow(rough+1.0,2.0)/8.0;
  float geometry=(nl/(nl*(1.0-k)+k))*(nv/(nv*(1.0-k)+k));
  float fresnel=.025+.975*pow(1.0-max(dot(eye,halfway),0.0),5.0);
  float spec=distribution*geometry*fresnel/max(4.0*nl*nv,.001);
  float shadow=SunShadowVisibility(world,normal);
  vec3 color=albedo*uSkyColor+(albedo+vec3(spec*3.14159265))*uSunColor*nl*shadow;
  gl_FragColor=vec4(color,alpha);
}`;

const normal=new THREE.Vector3(),tangent=new THREE.Vector3(),bitangent=new THREE.Vector3(),guide=new THREE.Vector3();
export class SurfaceDecalLayer {
  constructor(parent, {capacity=256,shared,lights=null,persistent=false,name="BloodSurfaceDecals"}) {
    this.capacity=Math.max(1,capacity|0);this.cursor=0;this.count=0;this.records=[];this.disposed=false;
    this.lights=lights;
    const box=new THREE.BoxGeometry(2,2,2),g=new THREE.InstancedBufferGeometry();
    g.index=box.index.clone();g.setAttribute("position",box.attributes.position.clone());box.dispose();
    this.attributes={};
    for(const [key,size] of [["iCenter",3],["iTangent",3],["iBitangent",3],["iNormal",3],["iShape",4],["iState",4]]){
      const attr=new THREE.InstancedBufferAttribute(new Float32Array(this.capacity*size),size);
      attr.setUsage(THREE.DynamicDrawUsage);g.setAttribute(key,attr);this.attributes[key]=attr;
    }
    g.instanceCount=0;this.geometry=g;
    const uniforms={...shared,uPersistent:{value:persistent?1:0},
      uBloodFresh:{value:new THREE.Color(C.fresh)},uBloodDry:{value:new THREE.Color(C.dry)}};
    BindSunShadowUniforms(uniforms,lights);
    this.material=new THREE.ShaderMaterial({uniforms,vertexShader:VERT,fragmentShader:FRAG,
      transparent:true,depthTest:false,depthWrite:false,side:THREE.BackSide,
      blending:THREE.CustomBlending,blendSrc:THREE.SrcAlphaFactor,blendDst:THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor});
    this.material.userData.preserveTargetAlpha=true;MarkNoPrepass(this.material);
    this.mesh=new THREE.Mesh(g,this.material);this.mesh.name=name;
    this.mesh.frustumCulled=false;this.mesh.renderOrder=3;this.mesh.matrixAutoUpdate=false;parent.add(this.mesh);
    this.mesh.onBeforeRender=(_renderer,_scene,camera)=>{
      shared.uBloodInverseProjection.value.copy(camera.projectionMatrixInverse);
      shared.uBloodCameraWorld.value.copy(camera.matrixWorld);
    };
  }
  Add(position,surfaceNormal,radius,{now=0,age=0,pool=false,opacity=.86,seed=.5,aspect=1,merge=false}={}){
    if(this.disposed||!Number.isFinite(position.x+position.y+position.z)||!(radius>0))return null;
    normal.copy(surfaceNormal);if(normal.lengthSq()<1e-8)normal.set(0,1,0);normal.normalize();
    if(merge){
      for(const rec of this.records){
        if(rec&&rec.pool&&now-rec.now<C.drySeconds&&rec.position.distanceToSquared(position)<C.mergeDistance**2&&rec.normal.dot(normal)>.9){
          rec.radius=Math.min(C.mergeMaxRadius,Math.sqrt(rec.radius**2+radius**2*C.mergeAreaScale));
          this.attributes.iShape.setXY(rec.index,rec.radius,rec.radius*rec.aspect);
          this.attributes.iShape.needsUpdate=true;return rec;
        }
      }
    }
    const i=this.cursor;this.cursor=(i+1)%this.capacity;this.count=Math.min(this.capacity,this.count+1);
    radius=Math.max(C.minRadius,Math.min(C.maxRadius,radius));
    guide.set(Math.abs(normal.y)>.9?1:0,Math.abs(normal.y)>.9?0:1,0);
    tangent.crossVectors(guide,normal).normalize().applyAxisAngle(normal,seed*Math.PI*2);
    bitangent.crossVectors(normal,tangent);
    const a=this.attributes;
    a.iCenter.setXYZ(i,position.x,position.y,position.z);
    a.iNormal.setXYZ(i,normal.x,normal.y,normal.z);
    a.iTangent.setXYZ(i,tangent.x,tangent.y,tangent.z);
    a.iBitangent.setXYZ(i,bitangent.x,bitangent.y,bitangent.z);
    a.iShape.setXYZW(i,radius,radius*aspect,C.depth,seed);
    a.iState.setXYZW(i,now,age,pool?1:0,opacity);
    for(const attr of Object.values(a))attr.needsUpdate=true;
    this.geometry.instanceCount=this.count;
    return this.records[i]={index:i,position:new THREE.Vector3().copy(position),normal:normal.clone(),radius,aspect,pool,now};
  }
  Clear(){this.cursor=0;this.count=0;this.records.length=0;this.geometry.instanceCount=0;}
  Dispose(){if(this.disposed)return;this.disposed=true;this.mesh.removeFromParent();this.geometry.dispose();
    this.lights?.UnregisterShadowUniforms(this.material.uniforms);this.material.dispose();this.records.length=0;}
}
