// The same lifetime curves and emitter state are consumed by every GPU material.
export const PARTICLE_GPU_MODULES = /*glsl*/`
uniform sampler2D uParticleCurves;
uniform sampler2D uParticleSystems;
uniform vec2 uCurveDimensions;
uniform float uSystemCount;
vec4 ParticleCurve(float slot,float row,float age){
 float x=clamp(age,0.,1.)*(uCurveDimensions.x-1.);
 vec2 a=vec2((floor(x)+.5)/uCurveDimensions.x,(slot*6.+row+.5)/uCurveDimensions.y);
 return mix(texture2D(uParticleCurves,a),texture2D(uParticleCurves,a+vec2(1./uCurveDimensions.x,0.)),fract(x));
}
vec4 ParticleState(float slot){return texture2D(uParticleSystems,vec2(.125,(slot+.5)/uSystemCount));}
vec4 ParticleNoise(float slot){return texture2D(uParticleSystems,vec2(.375,(slot+.5)/uSystemCount));}
vec4 ParticleBounds(float slot){return texture2D(uParticleSystems,vec2(.625,(slot+.5)/uSystemCount));}
vec4 ParticleAppearance(float slot){return texture2D(uParticleSystems,vec2(.875,(slot+.5)/uSystemCount));}
`;
