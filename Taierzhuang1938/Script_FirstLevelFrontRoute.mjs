// Data_FirstLevelFrontRoute.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { FIELD_BEND, FRONT_SORTIE } from "./Data_FirstLevelFrontRoute.mjs";

export const FrontFieldBend=(i,x)=>{const [amp,phase,bias]=FIELD_BEND[i],w=.7*Math.sin(x/11.5+phase)+.3*Math.sin(x/5.3+phase*1.7);
  return bias?amp*(.5+.5*w):amp*w;};

export function SortieCrawlBlocked(position,next,stance){
  if(stance==='prone')return false;
  return FRONT_SORTIE.crawl.some(c=>{
    const Inside=p=>Math.abs(p.x-c.x)<c.w/2&&Math.abs(p.z-c.z)<c.d/2+FRONT_SORTIE.crawlEntryMarginM;
    return Inside(next)&&(!Inside(position)||Math.abs(next.z-c.z)<Math.abs(position.z-c.z));
  });
}
