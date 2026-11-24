// 资产导出规范的判定规则（纯函数，零 import；浏览器配置器、本机存盘口与 Node 门禁共用）。
//
// 规范本身是 AssetPipeline/Data_AssetStandards.json（唯一真相）。这里的函数都把那份文档 spec 当第一个参数，
// 不持有任何全局状态：配置器改了数在内存里重算合规，门禁读盘上那份，结果走同一套公式。
// 游戏运行时代码不 import 这个目录（AssetStandardsTest 守）。

/** 规范文件相对仓库根的路径（存盘口只写这一个文件）。 */
export const ASSET_STANDARDS_REPO_PATH = "Taierzhuang1938/AssetPipeline/Data_AssetStandards.json";
export const ASSET_STANDARDS_SCHEMA = "tengxian.assetStandards";
export const ASSET_STANDARDS_VERSION = 1;
/** 有源 TZM 资产可选的分组（程序化、外部 GLB、贴图是视图，不是 sourceAssets 的 group）。 */
export const SOURCE_GROUP_IDS = Object.freeze(["firearm", "assembly", "melee", "vehicle"]);
export const EXTERNAL_POLICIES = Object.freeze(["source", "target"]);

export function TriangleRuleFor(spec, record) {
  return record?.group === "vehicle" ? spec.triangleRules.vehicle : spec.triangleRules.weapon;
}

export function ThresholdTriangleTarget(spec, sourceTriangles, limit) {
  if (!Number.isFinite(sourceTriangles) || sourceTriangles <= 0) return null;
  const target = Math.min(sourceTriangles, limit);
  return (sourceTriangles - target) / sourceTriangles <= spec.minDecimationReduction ? sourceTriangles : target;
}

export function ReductionPercent(sourceTriangles, actualTriangles) {
  if (!Number.isFinite(sourceTriangles) || sourceTriangles <= 0 || !Number.isFinite(actualTriangles)) return null;
  return (1 - actualTriangles / sourceTriangles) * 100;
}

/** 有源 TZM 的目标：{ value, kind }，kind ∈ special | reduce | keep5 | within。源缺席时 value 取分类上限。 */
export function SourceTarget(spec, id, record) {
  const special = spec.specialTriangleTargets[id];
  if (special != null) return { value: special, kind: "special" };
  const { limit } = TriangleRuleFor(spec, record);
  const target = ThresholdTriangleTarget(spec, record.sourceTriangles, limit);
  if (target == null) return { value: limit, kind: "within" };
  if (target === record.sourceTriangles && record.sourceTriangles > limit) return { value: target, kind: "keep5" };
  return target < record.sourceTriangles ? { value: target, kind: "reduce" } : { value: limit, kind: "within" };
}

export function ComplianceFor(spec, id, actualTriangles) {
  const record = spec.sourceAssets[id];
  if (!record) return { label: "程序化 / 独立预算", tone: "" };
  if (!Number.isFinite(record.sourceTriangles)) return { label: "源文件待复核", tone: "warn" };
  if (!Number.isFinite(actualTriangles)) return { label: "构建产物缺失", tone: "bad" };
  const special = spec.specialTriangleTargets[id];
  if (special != null) {
    const close = actualTriangles <= special && actualTriangles >= special * 0.97;
    return { label: close ? "特例达标" : "偏离特例目标", tone: close ? "good" : "bad" };
  }
  const rule = TriangleRuleFor(spec, record);
  if (record.repair && actualTriangles > record.sourceTriangles) return { label: "原模保留 + 补件", tone: "good" };
  const target = ThresholdTriangleTarget(spec, record.sourceTriangles, rule.limit);
  if (target === record.sourceTriangles) {
    const close = actualTriangles <= record.sourceTriangles * 1.001 && actualTriangles >= record.sourceTriangles * 0.97;
    return { label: close ? "原始拓扑保留" : "阈值内却明显减面", tone: close ? "good" : "bad" };
  }
  if (record.sourceTriangles > rule.limit) {
    const close = actualTriangles <= target && actualTriangles >= target * 0.97;
    return { label: close ? "阈值达标" : "偏离分类阈值", tone: close ? "good" : "bad" };
  }
  if (actualTriangles > rule.limit) return { label: "超过分类阈值", tone: "bad" };
  return { label: "原始拓扑保留", tone: "good" };
}

export function ExternalComplianceFor(spec, record) {
  const selected = record.selectedGameSourceTriangles;
  const zero = record.exportRemovedZeroAreaTriangles ?? 0;
  const triangulationZero = record.exportTriangulationZeroAreaTriangles ?? 0;
  const enclosed = record.exportRemovedWhollyEnclosedTriangles ?? 0;
  const visible = record.selectedGameVisibleSourceTriangles ?? selected - enclosed;
  const retained = Number.isFinite(selected) && visible === selected - enclosed && visible > record.targetTriangles
    && ThresholdTriangleTarget(spec, visible, record.targetTriangles) === visible
    && [zero, triangulationZero, enclosed].every((value) => Number.isInteger(value) && value >= 0)
    && record.actualTriangles === selected - zero - triangulationZero - enclosed;
  const close = record.actualTriangles <= record.targetTriangles * 1.001
    && record.actualTriangles >= record.targetTriangles * .97;
  return {
    label: retained ? "5% 免减面" : close ? (record.policy === "source" ? "原始拓扑保留" : "指定目标达标") : "偏离登记目标",
    tone: retained || close ? "good" : "bad", retained,
  };
}

/** 程序化 TZM 的分类预算（无外部原始模型可比）。 */
export function ProceduralBudget(spec, category) {
  if (category === "vehicle") return spec.triangleRules.vehicle.limit;
  return spec.proceduralBudgets[category] ?? spec.triangleRules.weapon.limit;
}

/** 规则卡文字里的 {sceneRenderLimits.triangles} 一类占位换成当前数值。 */
export function FillRuleText(spec, text) {
  return String(text ?? "").replace(/\{([A-Za-z]+)\.([A-Za-z]+)\}/g, (match, head, key) => {
    const value = spec[head]?.[key];
    return Number.isFinite(value) ? value.toLocaleString("en-US") : match;
  });
}

export function FormatAssetStandardsJson(doc) {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

const IsCount = (value) => Number.isInteger(value) && value > 0;
const IsText = (value) => typeof value === "string" && value.trim().length > 0;
const IsObject = (value) => value && typeof value === "object" && !Array.isArray(value);
const ID_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/** 存盘前的结构校验：{ ok, errors, warnings }。只看规范自己的形状，不碰盘上的模型。 */
export function ValidateAssetStandards(doc) {
  const errors = [];
  const warnings = [];
  const Need = (ok, message) => { if (!ok) errors.push(message); };
  if (!IsObject(doc)) return { ok: false, errors: ["规范必须是对象"], warnings };
  Need(doc.schema === ASSET_STANDARDS_SCHEMA, `schema 必须是 ${ASSET_STANDARDS_SCHEMA}`);
  Need(doc.version === ASSET_STANDARDS_VERSION, `version 必须是 ${ASSET_STANDARDS_VERSION}`);
  for (const key of ["weapon", "vehicle"]) {
    const rule = doc.triangleRules?.[key];
    Need(IsObject(rule) && IsCount(rule.limit) && IsText(rule.label), `triangleRules.${key} 需要 label 与正整数 limit`);
  }
  Need(typeof doc.minDecimationReduction === "number" && doc.minDecimationReduction >= 0 && doc.minDecimationReduction < 1,
    "minDecimationReduction 必须在 [0, 1) 内");
  Need(IsCount(doc.sceneRenderLimits?.drawCalls) && IsCount(doc.sceneRenderLimits?.triangles), "sceneRenderLimits 需要正整数 drawCalls / triangles");
  Need(IsObject(doc.proceduralBudgets) && Object.values(doc.proceduralBudgets).every(IsCount), "proceduralBudgets 的每一项都要是正整数");
  Need(IsObject(doc.specialTriangleTargets) && Object.entries(doc.specialTriangleTargets).every(([id, value]) => ID_RE.test(id) && IsCount(value)),
    "specialTriangleTargets 是 资产编号 → 正整数");
  Need(Array.isArray(doc.groups) && doc.groups.every((group) => IsText(group?.id) && IsText(group?.label)), "groups 是 { id, label } 列表");
  if (IsObject(doc.sourceAssets)) {
    for (const [id, record] of Object.entries(doc.sourceAssets)) {
      const at = `sourceAssets.${id}`;
      Need(ID_RE.test(id), `${at}：编号只能用字母、数字与下划线`);
      if (!IsObject(record)) { errors.push(`${at} 必须是对象`); continue; }
      Need(IsText(record.name), `${at}.name 不能为空`);
      Need(SOURCE_GROUP_IDS.includes(record.group), `${at}.group 只能是 ${SOURCE_GROUP_IDS.join(" / ")}`);
      Need(record.sourceTriangles === null || IsCount(record.sourceTriangles), `${at}.sourceTriangles 是正整数或 null（源缺席）`);
      if (record.sourceTriangles === null) warnings.push(`${at}：源模型缺席，合规状态记为待复核`);
    }
    for (const id of Object.keys(doc.specialTriangleTargets || {})) {
      if (!doc.sourceAssets[id]) warnings.push(`specialTriangleTargets.${id} 没有对应的 sourceAssets 登记`);
    }
  } else errors.push("sourceAssets 必须是 编号 → 登记 的对象");
  if (Array.isArray(doc.externalGlb)) {
    const seen = new Set();
    doc.externalGlb.forEach((record, index) => {
      const at = `externalGlb[${index}]${record?.id ? `（${record.id}）` : ""}`;
      if (!IsObject(record)) { errors.push(`${at} 必须是对象`); return; }
      Need(ID_RE.test(record.id ?? ""), `${at}.id 只能用字母、数字与下划线`);
      Need(!seen.has(record.id), `${at}.id 重复`);
      seen.add(record.id);
      Need(IsText(record.name), `${at}.name 不能为空`);
      Need(IsText(record.pack), `${at}.pack 不能为空`);
      for (const key of ["sourceTriangles", "actualTriangles", "targetTriangles"]) Need(IsCount(record[key]), `${at}.${key} 必须是正整数`);
      Need(EXTERNAL_POLICIES.includes(record.policy), `${at}.policy 只能是 ${EXTERNAL_POLICIES.join(" / ")}`);
    });
  } else errors.push("externalGlb 必须是列表");
  Need(IsObject(doc.otherRules) && Object.values(doc.otherRules).every((list) => Array.isArray(list)
    && list.every((rule) => IsText(rule?.name))), "otherRules 是 分组 → 规则卡列表，每张卡要有 name");
  return { ok: errors.length === 0, errors, warnings };
}
