// Data_FirstLevelMissionFortifications.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { MISSION_DEFENSE_POSTS } from "./Data_FirstLevelMissionFortifications.mjs";

// Existing human-scale solid envelopes become layered bags, retaining their cover/route contract.
// Every block the layout means as sandbags belongs here - a sandbag drawn any other way (a blue box
// with painted seams, a canvas strip, a procedural bag) is not allowed (docs/Data_SandbagStandard.md).
export function IsMissionSandbagBlock(id) {
  if(id.includes("BagSeam"))return false;
  // 沟沿上的射击位是 PCG 摆的（Script_TrenchPlan 的 bays 通道），id 是
  // `<段名>TrenchBay<n>` —— 段名在前，所以这条不能锚在开头。
  if(/TrenchBay\d+$/.test(id))return true;
  return /^(FrontParapet|FrontTraverseCover|MachineGunSideCover|MachineGunRest$|RightNestFrontRest$|LeftGunRest$|BundleParapet$|FlankParapet$|WithdrawCover|GuardWaitingCover|GuardWaitingWing|VillageRoadBlock$|VillageApproachCover$|TransferEastCover$|TransferCorner$|TransferRoadFootBags\d+$|TransferWestCover$|DrainCorner$|RearExitCover$|FinalAlleyCover$|GapLastCover$|ObservationParapet$|ReceptionSecondCover$|ReceptionGateSandbags$)/.test(id)
    || MISSION_DEFENSE_POSTS.some(post=>post.id===id);
}
