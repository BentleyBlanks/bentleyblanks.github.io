// Point-source angular PSF approximation. The emitting body's physical size and
// direct surface illumination are not enlarged to create observer-space glare.
import {FLARE_GLARE as G} from './Data_Tuning_FlareEffects.mjs';
import {FlareAngularGain} from './Script_FlareOptics.mjs';
const Radians=degrees=>degrees*Math.PI/180;

export function FlareGlareIncident(source,eye){
 const intensity=source.currentIntensity??source.base??0;
 if(!(intensity>0)||!Number.isFinite(intensity))return [0,0,0];
 const dx=eye.x-source.position.x,dy=eye.y-source.position.y,dz=eye.z-source.position.z;
 const distance2=dx*dx+dy*dy+dz*dz,distance=Math.sqrt(distance2);
 const emission=source.emission,d=emission?.direction;
 const cosine=d&&distance>1e-8?(dx*d.x+dy*d.y+dz*d.z)/distance:1;
 const gain=d?FlareAngularGain(cosine,emission.floor,emission.power):1;
 const irradiance=intensity*gain/Math.max(G.minDistanceM*G.minDistanceM,distance2);
 const color=source.currentColor||source.color;
 return [color.r*irradiance,color.g*irradiance,color.b*irradiance];
}

export function FlareGlareProfile(angleRad,pixelAngleRad=0){
 const support=Radians(G.supportDeg);
 if(angleRad>=support)return 0;
 const footprint=pixelAngleRad*pixelAngleRad/12;
 const Gaussian=degrees=>{const variance=Radians(degrees)**2+footprint;return Math.exp(-angleRad*angleRad/(2*variance))/(2*Math.PI*variance);};
 const edge=Math.max(0,Math.min(1,(angleRad-support*.9)/(support*.1)));
 return (G.narrowWeight*Gaussian(G.narrowSigmaDeg)+(1-G.narrowWeight)*Gaussian(G.wideSigmaDeg))*(1-edge*edge*(3-2*edge));
}

// Existing lens pass already samples normalDepth; no additional texture unit.
// Test source visibility once per halo pixel only inside its angular support.
export const FLARE_GLARE_GLSL=`
uniform vec4 uEmitterSource[${G.slots}]; // uv, linear view depth, active
uniform vec3 uEmitterIncident[${G.slots}];
uniform vec2 uEmitterProjScale;
uniform vec2 uEmitterDepthOffset;
uniform vec2 uEmitterDepthTexel;
uniform vec2 uEmitterResolution;
float FlareGlareVisibility(vec4 source){
 vec2 center=source.xy+uEmitterDepthOffset;
 if(any(lessThan(center,vec2(0.)))||any(greaterThan(center,vec2(1.))))return 0.;
 vec2 radius=max(uEmitterDepthTexel*.5,${G.sourceRadiusM.toFixed(6)}*uEmitterProjScale/(2.*source.z));
 float open=0.;
 for(int tap=0;tap<5;tap++){
  vec2 delta=tap==0?vec2(0.):tap==1?vec2(radius.x,0.):tap==2?vec2(-radius.x,0.):tap==3?vec2(0.,radius.y):vec2(0.,-radius.y);
  vec2 uv=center+delta;
  if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))continue;
  float depth=texture2D(uNormalDepth,uv).w;
  float visible=(depth<=.0001||depth+${G.depthBiasM.toFixed(6)}>=source.z)?1.:0.;
  // A visible neighbour must never resurrect an occluded source centre.
  if(tap==0&&visible<.5)return 0.;
  open+=visible;
 }
 return open*.2;
}
vec3 FlareGlareRadiance(vec2 uv){
 vec3 ray=normalize(vec3((uv*2.-1.)/uEmitterProjScale,-1.));
 float pixelAngle=2./max(uEmitterProjScale.y*uEmitterResolution.y,1.);
 float footprint=pixelAngle*pixelAngle/12.;
 float narrowVariance=${(Radians(G.narrowSigmaDeg)**2).toFixed(12)}+footprint;
 float wideVariance=${(Radians(G.wideSigmaDeg)**2).toFixed(12)}+footprint;
 vec3 result=vec3(0.);
 for(int i=0;i<${G.slots};i++){
  vec4 source=uEmitterSource[i];if(source.w<=0.)continue;
  vec3 sourceRay=normalize(vec3((source.xy*2.-1.)/uEmitterProjScale,-1.));
  float angle=atan(length(cross(ray,sourceRay)),dot(ray,sourceRay));
  if(angle>=${Radians(G.supportDeg).toFixed(9)})continue;
  float kernel=${G.narrowWeight.toFixed(6)}*exp(-angle*angle/(2.*narrowVariance))/(6.28318530718*narrowVariance)
   +${(1-G.narrowWeight).toFixed(6)}*exp(-angle*angle/(2.*wideVariance))/(6.28318530718*wideVariance);
  kernel*=1.-smoothstep(${(Radians(G.supportDeg)*.9).toFixed(9)},${Radians(G.supportDeg).toFixed(9)},angle);
  vec3 radiance=uEmitterIncident[i]*(kernel*FlareGlareVisibility(source));
  radiance*=min(1.,${G.radianceMax.toFixed(1)}/max(max(radiance.r,max(radiance.g,radiance.b)),.0001));
  result+=radiance;
 }
 return result;
}`;
