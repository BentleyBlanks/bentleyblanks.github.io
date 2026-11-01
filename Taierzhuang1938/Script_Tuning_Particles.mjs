// Data_Tuning_Particles.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { PARTICLE_PRESETS } from "./Data_Tuning_Particles.mjs";

export function BurningParticleModules(source, scale=1) {
  const size=Math.max(.2,Math.min(3,source.fire??1)),radius=Math.max(.1,source.radius??.6);
  return ['FireTongue','FireEmber'].map((preset,index)=>{
    const modules=JSON.parse(JSON.stringify(PARTICLE_PRESETS[preset]));
    modules.main.randomSeed=((source.backdrop?.seed??source.seed??1938)+index*7919)>>>0;
    if(preset==='FireTongue'){
      const width=Math.max(.35,radius*2.05),height=(source.fireShape==='ground'?1.35:2.15)*Math.sqrt(size);
      modules.renderer.bounds=[width,height,width*.95];modules.main.startRotation=(modules.main.randomSeed%360)*Math.PI/180;
      return {preset,modules};
    }
    modules.main.startSize.min*=size;modules.main.startSize.max*=size;
    modules.main.startSpeed.min*=Math.sqrt(size);modules.main.startSpeed.max*=Math.sqrt(size);
    modules.emission.rateOverTime*=scale*Math.min(1.8,Math.sqrt(size));
    modules.shape.radius=radius*(index===0?.78:.55);
    return {preset,modules};
  });
}
