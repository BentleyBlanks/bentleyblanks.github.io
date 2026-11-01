// Data_FirstLevelMissionFront.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { MISSION_TUNING as FIRST_LEVEL_TUNING } from "./Data_Tuning_FirstLevel.mjs";
import { FRONT_ASSAULT_STARTS, FRONT_FLANK_GROUP, FRONT_OFFICER, FrontAssaultLane } from "./Data_FirstLevelMissionFront.mjs";

// Supporting rows advance without crossing the first assault bank or collapsing their depth.
export const FrontReserveLane=(x,z)=>[{x,z:z+FIRST_LEVEL_TUNING.frontReserveAdvanceM}];

/** Does the straight bounding lane from `start` pass through the footprint of this cover block?
 *  Same capsule slack the route check in `Script_FirstLevelMissionTest` uses, plus a little, so a
 *  bank is dropped before the gate can fail on it. */
export function FrontAssaultLaneCuts(x,z,w,d,slackM=.4){
  // The flank group's and the officer's authored lanes are kept clear by the same rule
  // (graft from space proposal C: placement steps out of every lane automatically).
  for(const route of [...FRONT_ASSAULT_STARTS.map(start=>[start,...FrontAssaultLane(start.x,start.z)]),
    ...FrontExplicitLanes()]){
    for(let i=1;i<route.length;i++){
      const a=route[i-1],b=route[i],length=Math.hypot(b.x-a.x,b.z-a.z);
      for(let travelled=0;travelled<=length;travelled+=.25){
        const t=travelled/length;
        if(Math.abs(a.x+(b.x-a.x)*t-x)<w/2+slackM&&Math.abs(a.z+(b.z-a.z)*t-z)<d/2+slackM)return true;
      }
    }
  }
  return false;
}

/** Authored (non-derived) front lanes: the flank group and the officer, start point first. */
export function FrontExplicitLanes(){
  return [...FRONT_FLANK_GROUP,FRONT_OFFICER].map(spec=>[{x:spec.x,z:spec.z},...spec.lane]);
}
