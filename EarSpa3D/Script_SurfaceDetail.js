import * as THREE from 'three';

// Millimetre material coordinates stay attached to the surface through deformation/cuts.
// Screen derivatives remove unresolved relief instead of letting it sparkle at distance.
export const SURFACE_GLSL = `
float SurfaceHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float SurfaceNoise(vec3 p){
  vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(mix(SurfaceHash(i),SurfaceHash(i+vec3(1,0,0)),f.x),mix(SurfaceHash(i+vec3(0,1,0)),SurfaceHash(i+vec3(1,1,0)),f.x),f.y),
    mix(mix(SurfaceHash(i+vec3(0,0,1)),SurfaceHash(i+vec3(1,0,1)),f.x),mix(SurfaceHash(i+vec3(0,1,1)),SurfaceHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
vec3 SurfaceNormal(vec3 n,float h,vec3 p){
  vec3 sx=dFdx(p),sy=dFdy(p),rx=cross(sy,n),ry=cross(n,sx);
  float determinant=dot(sx,rx);
  return normalize(abs(determinant)*n-sign(determinant)*(dFdx(h)*rx+dFdy(h)*ry));
}
float SurfaceFilter(vec3 p,float scale){return 1.0-smoothstep(.22,.7,max(length(dFdx(p)),length(dFdy(p)))*scale);}
`;

export function PrepareWaxGeometry(geometry){
  const p=geometry.attributes.position;
  if(!geometry.attributes.waxRest)geometry.setAttribute('waxRest',p.clone());
  if(!geometry.attributes.waxResponse){
    const response=new Float32Array(p.count*3);
    for(let i=0;i<p.count;i++)response[i*3]=.035;
    geometry.setAttribute('waxResponse',new THREE.BufferAttribute(response,3).setUsage(THREE.DynamicDrawUsage));
  }
  if(!geometry.attributes.waxCap)geometry.setAttribute('waxCap',new THREE.Float32BufferAttribute(new Float32Array(p.count),1));
}

export function BindWaxAppearance(shader,{type,pale}){
  shader.vertexShader='attribute vec3 waxRest;attribute vec3 waxResponse;attribute float waxCap;varying vec3 waxLocal;varying vec3 waxState;varying float waxCut;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nwaxLocal=waxRest;waxState=waxResponse;waxCut=waxCap;');
  shader.fragmentShader='varying vec3 waxLocal;varying vec3 waxState;varying float waxCut;\n'+SURFACE_GLSL+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    float waxRenderWet=waxWet*earWetQuality;
    float waxRenderSoft=waxSoft*earWetQuality;
    float waxMottle=SurfaceNoise(waxLocal*4.7);
    float waxGrain=SurfaceNoise(waxLocal*38.0);
    float waxTexture=clamp(pow(max(.001,dot(diffuseColor.rgb,vec3(.299,.587,.114))),.32),0.0,1.0);
    vec3 waxLow=${pale?'vec3(.48,.275,.105)':type==='impacted'?'vec3(.105,.036,.009)':'vec3(.30,.105,.022)'};
    vec3 waxHigh=${pale?'vec3(.90,.72,.40)':type==='impacted'?'vec3(.39,.19,.048)':'vec3(.72,.38,.105)'};
    diffuseColor.rgb=mix(waxLow,waxHigh,clamp(waxTexture*.65+waxMottle*.35,0.0,1.0));
    float waxLoad=smoothstep(.025,.19,waxState.y);
    float waxDamage=clamp(waxState.z,0.0,1.0);
    float waxFissure=(1.0-smoothstep(.025,.10,abs(waxGrain-.46)))*waxDamage;
    diffuseColor.rgb*=1.0-waxFissure*.30*earSurfaceDetail;
    diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.22,1.15,1.04),waxCut*.6);
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
    float waxLamella=sin(waxLocal.y*63.0+SurfaceNoise(waxLocal*7.0)*9.0);
    float waxRelief=earSurfaceDetail*(1.0-waxRenderSoft*.65)*(
      (earDetailLayers>0?(waxMottle-.5)*.009*SurfaceFilter(waxLocal,5.0):0.0)+
      (earDetailLayers>1?waxLamella*.0016*(.4+waxLoad)*SurfaceFilter(waxLocal,63.0):0.0)+
      (earDetailLayers>2?(waxGrain-.5)*.002*SurfaceFilter(waxLocal,38.0):0.0));
    normal=SurfaceNormal(normal,waxRelief,-vViewPosition);
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
    roughnessFactor=mix(${type==='wet'?'.27':type==='impacted'?'.53':'.62'},.24,waxRenderWet);
    roughnessFactor=clamp(roughnessFactor+(waxMottle-.5)*.13+waxCut*.11+waxLoad*.055,.19,.83);
  `);
  // Broad transmission only from incident diffuse light. Thin sheets glow at the rim,
  // thick plugs stay opaque; no emissive tint or view-dependent alpha sorting.
  shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
    float waxThin=exp(-max(.006,waxState.x)*12.0);
    float waxRim=pow(1.0-abs(dot(normal,geometryViewDir)),2.0);
    reflectedLight.directDiffuse*=vec3(1.0)+vec3(.44,.23,.075)*waxThin*(.25+waxRim)*earWetQuality;
  `);
}
