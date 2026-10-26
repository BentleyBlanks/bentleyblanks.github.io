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
// Dust has porous, advected density rather than a solid spherical core or
// smoke's rising lobes. Reuse the same two noise reads and sampler budget.
float ParticleSoilDensity(vec3 p,float seed,float clock){
 vec3 flow=vec3(seed*7.7,seed*13.1+clock*.12,seed*3.7);
 p.xy+=sin(p.yx*2.7+seed*19.)*.025;
 vec2 coarse=texture(uParticleDensity,p*.85+flow).rg;
 float fine=texture(uParticleDensity,p*3.4+flow*1.7).b;
 vec3 warped=p+vec3(coarse.g-.5,0.,coarse.r-.5)*.18;
 float envelope=1.-smoothstep(.02,1.,dot(warped,warped));
 float pores=smoothstep(.32,.68,coarse.r+(fine-.5)*.3);
 return envelope*pores*(.45+.55*fine)*1.1;
}
`;
export function AcquireParticleDensity(shared){
 let field=fields.get(shared);
 if(!field){const texture=MakeVolumetricNoiseTexture();field={texture,references:0,uniform:{value:texture}};fields.set(shared,field);shared.uParticleDensity=field.uniform;}
 field.references++;
 return ()=>{if(--field.references===0){field.texture.dispose();fields.delete(shared);if(shared.uParticleDensity===field.uniform)delete shared.uParticleDensity;}};
}
