// 资产导出规范的 Node 读取口：门禁与离线脚本从这里拿盘上那份 Data_AssetStandards.json（只读、冻结）。
// 浏览器配置器自己 fetch 同一份文件，不经过这里；判定公式在 Script_AssetStandards.mjs，两边共用。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ComplianceFor as SpecComplianceFor, ExternalComplianceFor as SpecExternalComplianceFor } from "./Script_AssetStandards.mjs";

export const ASSET_STANDARDS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "Data_AssetStandards.json");

function DeepFreeze(value) {
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) DeepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

export const ASSET_STANDARDS = DeepFreeze(JSON.parse(fs.readFileSync(ASSET_STANDARDS_FILE, "utf8")));
export const TRIANGLE_RULES = ASSET_STANDARDS.triangleRules;
export const MIN_DECIMATION_REDUCTION = ASSET_STANDARDS.minDecimationReduction;
export const SCENE_RENDER_LIMITS = ASSET_STANDARDS.sceneRenderLimits;
export const SPECIAL_TRIANGLE_TARGETS = ASSET_STANDARDS.specialTriangleTargets;
export const SOURCE_ASSET_STANDARDS = ASSET_STANDARDS.sourceAssets;
export const EXTERNAL_GLB_STANDARDS = ASSET_STANDARDS.externalGlb;
export const ASSET_STANDARD_GROUPS = ASSET_STANDARDS.groups;

export const ComplianceFor = (id, actualTriangles) => SpecComplianceFor(ASSET_STANDARDS, id, actualTriangles);
export const ExternalComplianceFor = (record) => SpecExternalComplianceFor(ASSET_STANDARDS, record);
