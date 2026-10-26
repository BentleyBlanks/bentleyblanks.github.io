import {MakeVolumetricNoiseTexture} from './Script_PostVolumetrics.mjs';
const fields=new WeakMap();
export const PARTICLE_DENSITY_GLSL=/*glsl*/`
precision highp sampler3D;
uniform sampler3D uParticleDensity;
float ParticleDensity(vec3 p,float seed,float clock){
 vec3 flow=vec3(seed*7.7,seed*13.1-clock*.06,seed*3.7);
 p.xy+=sin(p.yx*3.+seed*19.+clock*.35)*.11;
 vec2 n=texture(uParticleDensity,p*.48+flow).rg;
 float body=1.-dot(p,p);
 float lobes=body*(.35+n.r*1.65)+(n.g-.53)*1.2-.2;
 return smoothstep(-.08,.58,lobes)*(1.-smoothstep(.48,1.,dot(p,p)));
}
// Fines dispersed through air have a continuous soft envelope and fine-scale
// variation. Smoke's cut-out lobes and upward curling are the wrong silhouette.
float ParticleSoilDensity(vec3 p,float seed,float clock){
 vec3 flow=vec3(seed*7.7,seed*13.1+clock*.12,seed*3.7);
 p.xy+=sin(p.yx*2.7+seed*19.)*.025;
 vec2 coarse=texture(uParticleDensity,p*.85+flow).rg;
 float fine=texture(uParticleDensity,p*3.4+flow*1.7).b;
 float envelope=1.-smoothstep(.05,1.,dot(p,p));
 return envelope*(.55+.45*coarse.r)*(.82+.18*fine)*.75;
}
`;
export function AcquireParticleDensity(shared){
 let field=fields.get(shared);
 if(!field){const texture=MakeVolumetricNoiseTexture();field={texture,references:0,uniform:{value:texture}};fields.set(shared,field);shared.uParticleDensity=field.uniform;}
 field.references++;
 return ()=>{if(--field.references===0){field.texture.dispose();fields.delete(shared);if(shared.uParticleDensity===field.uniform)delete shared.uParticleDensity;}};
}
