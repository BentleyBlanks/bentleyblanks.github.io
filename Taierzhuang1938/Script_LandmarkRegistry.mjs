// 地标构建器注册表 —— kind → Build 函数。
//
// 这张表是「照城防示意图补全地标」并行制作的防冲突机制：
//   · 每个 kind 的几何都住在自己的 Script_Landmark_*.mjs 里，一个工作包只改一个文件；
//   · 本文件在脚手架落地后**冻结**：并行制作期间不许再改（新增 kind 由主会话统一加）。
//
// 构建器契约（所有 Script_Landmark_*.mjs 必须遵守）：
//   Build<Kind>(host, f, ctx)
//     host —— TengxianCity 实例（或 MakeFeatureHost 的编辑器替身），可用成员：
//             host.sink / host.farSink（BuildSink）、host.OnStreet(x,z,hx,hz)、
//             host.AddFeatureRoom(f, ry, lx, lz, w, d, spec)、host.OuterHeight(x,z)
//     f    —— Data_Tengxian 里的那一条数据（x/z/w/d/ry/id/label…），尺寸不许另起炉灶
//     ctx  —— { damage, burnt, ry }：破损档位与朝向都已算好
//   只许 import Script_World / Script_Geo / Script_Noise / Script_LivedInProps / three；
//   **严禁 import Script_TengxianCity（循环依赖）与 Data_Tengxian（尺寸走 f）**。
//   碰撞：一律经 sink.Solid（tag 见 Data_Destruction.TAG_PROFILE，未注册默认 masonry）。
//
// 批次A 用血踩出来的三条坑（后续工作包必读）：
//   ① 两套局部坐标系相差 180°：`PlaceGeometry(ry)` / `AddDoorReveal` 的局部 +z 在
//      ry=0 时指世界 +z（南）；而 `AddCompound` / `AddRoomBlock` / `AddFeatureRoom`
//      内部把「门脸」排在局部 -z ⇒ ry=0 时它们的门开在世界**北**面。
//      要「坐北朝南对着街」，要么传 ry+π，要么像 A6/A7 那样自己排门脸，两套别混用。
//   ② `OnStreet` 的街面半宽是 width/2 **+ 1.2 m 退让带**——门口摆件差 0.1 m
//      压进退让带就整个不生成（A5 的哨位第一版全军覆没）。贴门摆件要写「往里收
//      几档再试」，不要一票否决。
//   ③ 每一关只生成 bounds 里那一片城（Data_Battle.TUNING[i].bounds）：
//      phase=5 只有 x[-325,285] z[-190,140]，北城/南城拍图要用 phase=4。

import { AddRoomBlock } from "./Script_World.mjs";
import { BuildPrison, BuildDetention } from "./Script_Landmark_Prison.mjs";
import { BuildGarrison, BuildPolice } from "./Script_Landmark_Garrison.mjs";
import { BuildYamen } from "./Script_Landmark_Yamen.mjs";
import { BuildGuild, BuildPawnshop, BuildOffice } from "./Script_Landmark_Commerce.mjs";
import { BuildHq, BuildBillet } from "./Script_Landmark_Headquarters.mjs";
import { BuildTemple, BuildConfucianTemple } from "./Script_Landmark_Temple.mjs";
import { BuildChurch, BuildSchool } from "./Script_Landmark_ChurchSchool.mjs";
import { BuildStation } from "./Script_Landmark_Station.mjs";
import { BuildPowerPlant } from "./Script_Landmark_PowerPlant.mjs";
import { BuildCommunications, BuildExchange } from "./Script_Landmark_WestSuburb.mjs";
import { BuildDivision122 } from "./Script_Landmark_Division122.mjs";
import { BuildNorthSuburb } from "./Script_Landmark_NorthSuburb.mjs";
import { BuildEastSuburbFeatures } from "./Script_Landmark_EastSuburb.mjs";
import {
  BuildDistrictOffice, BuildShrine, BuildShop, BuildPagodaLandmark,
  BuildSquareFortLandmark, BuildSilhouetteCluster, BuildHollowFort,
} from "./Script_Landmark_Misc.mjs";

export const LANDMARK_BUILDERS = Object.freeze({
  // 城内（CITY_FEATURES / LANDMARKS 的 kind）
  prison: BuildPrison,
  detention: BuildDetention,
  garrison: BuildGarrison,
  police: BuildPolice,
  yamen: BuildYamen,
  guild: BuildGuild,
  pawnshop: BuildPawnshop,
  office: BuildOffice,
  hq: BuildHq,
  billet: BuildBillet,
  temple: BuildTemple,
  confucianTemple: BuildConfucianTemple,
  church: BuildChurch,
  school: BuildSchool,
  // 城外西关（WEST_SUBURB 各字段，由 BuildOutskirts 派发）
  station: BuildStation,
  powerPlant: BuildPowerPlant,
  communications: BuildCommunications,
  exchange: BuildExchange,
  division122: BuildDivision122,
  // 城外北关 / 东关（整块数据派发）
  northSuburb: BuildNorthSuburb,
  eastSuburbFeatures: BuildEastSuburbFeatures,
  // 第二轮 D6 杂项占位升级（Script_Landmark_Misc.mjs）
  districtOffice: BuildDistrictOffice,
  shrine: BuildShrine,
  shop: BuildShop,
  pagoda: BuildPagodaLandmark,
  squareFort: BuildSquareFortLandmark,
  silhouetteCluster: BuildSilhouetteCluster,
  hollowFort: BuildHollowFort,
});

/**
 * 编辑器调色板用的最小 host：没有城，就没有街面判断与濠外地形，
 * 全部按「平地、无街」处理。游戏内生成一律传真正的 TengxianCity。
 */
export function MakeFeatureHost(sink) {
  return {
    sink,
    farSink: sink,
    OnStreet: () => false,
    OuterHeight: () => 0,
    AddFeatureRoom(f, ry, lx, lz, width, depth, spec) {
      const cos = Math.cos(ry), sin = Math.sin(ry);
      AddRoomBlock(sink, {
        x: f.x + cos * lx - sin * lz, z: f.z - sin * lx - cos * lz, ry, width, depth,
        eaveY: spec.eaveY, ridgeY: spec.ridgeY,
        seed: spec.seed, damage: spec.damage, burnt: spec.burnt,
        facing: spec.facing, bays: spec.bays,
      });
    },
  };
}
