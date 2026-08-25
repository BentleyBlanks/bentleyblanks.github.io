// 城内「每家每户」外部道具布设的注册表。
//
// 与 Script_ExternalProps.PLACEMENTS（按关卡 id 写死的那几组）不同：这一层的
// 摆位按**世界坐标**登记一次，运行时由 AddExternalProps 按当前关卡的
// TUNING.bounds 过滤 —— 同一只米袋在 L4 / L5 / L6 三关里出现在同一个位置，
// 城是同一座城，不因换关而搬家。
//
// 【并行工作包纪律】（照 Script_LandmarkRegistry 的规矩）：
//   · 一个工作包只写自己的 Data_Dressing_*.mjs 区域文件；
//   · 本文件与 Script_ExternalProps / Script_TengxianCity / 各测试只由主会话动；
//   · 区域文件必须过 `node Taierzhuang1938/Script_TownDressingTest.mjs` 的硬规则
//     （不压街心、不进院墙、不挡目标连线、不越区 —— 规则全文见那边文件头）。
//
// 摆位条目：{ asset, x, z, ry?, scale?, note? }
//   asset  Script_ExternalProps.ASSETS 里的 id；
//   note   这一件属于哪家哪户的什么生活情景（运行时不读，验收与后人读）。

import { REGION as NE_REGION, PLACEMENTS as NE } from "./Data_Dressing_NortheastQuarter.mjs";
import { REGION as SE_REGION, PLACEMENTS as SE } from "./Data_Dressing_SoutheastQuarter.mjs";
import { REGION as NW_REGION, PLACEMENTS as NW } from "./Data_Dressing_NorthwestQuarter.mjs";
import { REGION as SW_REGION, PLACEMENTS as SW } from "./Data_Dressing_SouthwestQuarter.mjs";
import { REGION as MS_REGION, PLACEMENTS as MS } from "./Data_Dressing_MainStreets.mjs";
import { REGION as DF_REGION, PLACEMENTS as DF } from "./Data_Dressing_Defenses.mjs";

export const TOWN_DRESSING_REGIONS = Object.freeze([
  { region: NE_REGION, placements: NE },
  { region: SE_REGION, placements: SE },
  { region: NW_REGION, placements: NW },
  { region: SW_REGION, placements: SW },
  { region: MS_REGION, placements: MS },
  { region: DF_REGION, placements: DF },
]);

export const TOWN_DRESSING = Object.freeze(
  TOWN_DRESSING_REGIONS.flatMap((entry) => entry.placements),
);

/** 当前关卡切片内的城内布设。bounds 不给（独立场景等）就一件不出。 */
export function TownDressingFor(bounds) {
  if (!bounds) return [];
  return TOWN_DRESSING.filter((p) => p.x >= bounds.minX && p.x <= bounds.maxX
    && p.z >= bounds.minZ && p.z <= bounds.maxZ);
}
