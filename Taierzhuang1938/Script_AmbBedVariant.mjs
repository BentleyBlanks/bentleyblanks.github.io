// 战场远景床（battleFar）的选择与装载计划。纯函数，不碰 DOM、不碰 three，node 里能直接断言。
//
// 背景（2026-09-29）：旧的 battleFar 是英语战斗人群录音，用户听成「奇奇怪怪的人声」。
// 无人声候选 A–E 在 Audio/Amb/Data_AmbManifest.json 的 `bedVariants` 里（不在 `beds` 里：
// 放进 beds 开机会把五条全下载）。用户听完五条后定的方案（同日原话）：
// 「整体A长期存在，B和C交替的随机叠加出现；E在玩家进入巷道/半室内阶段再播放（作为替换偶尔的B和C）」。
// 这里决定「这一局装哪些、哪些开机阻塞下载、哪些开机之后后台下载」；叠加什么时候出声是 Script_BattleBedLayers 的事。
//
//   优先级：URL 参数 ?ambBed=  >  Data_Tuning_Audio.BATTLE_BED_VARIANT  >  默认（layered）
//   取值：  layered = A 底床 + B/C 偶尔叠加（巷道里换 E），**默认**；null / 缺省 / 认不出 = layered
//           legacy  = 旧的英语战斗人群录音（对比用）
//           A–E     = 只放这一条、不叠加（大小写都行）
//           none    = 不放这一层
//
// 装载计划只换 `battleFar` 这一个床名：底床（或被选中的那一条）被登记成同名床，所有预设
//（AMBIENCE_PRESETS 与 OPENING_AMBIENCE_PRESETS 的每一层 `{ bed: "battleFar" }`）不用改一个字。
// 被换掉的旧床不进计划，也就不会被请求（预取与解码都按计划走）。
// 叠加用的 B / C / E 进 plan.overlay：不进阻塞装载（不在 beds 里、不进 AmbFilesToFetch），开机之后由引擎后台下载。

import { BATTLE_BED_LAYERS } from "./Data_Tuning_Audio.mjs";

/** 被候选替换的床名。 */
export const REPLACED_BED = "battleFar";
export const CHOICE_LAYERED = "layered";
export const CHOICE_LEGACY = "legacy";
export const CHOICE_NONE = "none";

/** 从查询串取 ?ambBed=。没给返回 null；给了空值也当没给。 */
export function ParseAmbBedParam(search) {
  if (typeof search !== "string" || !search) return null;
  const match = /(?:^|[?&])ambBed=([^&#]*)/i.exec(search);
  if (!match) return null;
  let raw = match[1];
  try { raw = decodeURIComponent(raw); } catch { /* 保留原样 */ }
  raw = raw.trim();
  return raw ? raw : null;
}

function Normalize(value, keys) {
  if (value == null || value === "") return { choice: null, bad: false };
  const text = String(value).trim();
  if (/^none$/i.test(text)) return { choice: CHOICE_NONE, bad: false };
  if (/^layered$/i.test(text)) return { choice: CHOICE_LAYERED, bad: false };
  if (/^legacy$/i.test(text)) return { choice: CHOICE_LEGACY, bad: false };
  const key = text.toUpperCase();
  if (keys.includes(key)) return { choice: key, bad: false };
  return { choice: null, bad: true };
}

/**
 * 决定用哪一档。
 * @param {{search?: string, tuning?: string|null, keys?: string[]}} input keys = 清单里 bedVariants 的键
 * @returns {{choice: "layered"|"legacy"|"none"|string, source: "default"|"tuning"|"url", ignored: string|null}}
 *   ignored：给了但认不出的值（原样返回，调用方 warn 一声；认不出就退回下一级，绝不因为拼错静音）
 */
export function ResolveBattleBedChoice({ search = "", tuning = null, keys = [] } = {}) {
  const fromUrl = ParseAmbBedParam(search);
  const url = Normalize(fromUrl, keys);
  if (url.choice) return { choice: url.choice, source: "url", ignored: null };
  const tuned = Normalize(tuning, keys);
  if (tuned.choice) return { choice: tuned.choice, source: "tuning", ignored: url.bad ? fromUrl : null };
  return { choice: CHOICE_LAYERED, source: "default", ignored: url.bad ? fromUrl : (tuned.bad ? String(tuning) : null) };
}

/**
 * 把清单变成床的装载计划。
 * @param {object} manifest Data_AmbManifest.json
 * @param {string|null} choice ResolveBattleBedChoice 的 choice；null = layered
 * @param {object} [layers] BATTLE_BED_LAYERS
 * @returns {{
 *   mode: "layered"|"legacy"|"variant"|"none",
 *   beds: {bed: string, file: string, variant?: string}[],
 *   overlay: {key: string, file: string, role: "open"|"enclosed"}[],
 *   variant: string|null, replaced: boolean, dropped: boolean, fellBack: boolean }}
 *   beds 顺序与清单一致，是**阻塞装载**的床；被选中的那一条 / 底床 A 顶替 battleFar 的位置。
 *   overlay 只有 layered 才有：叠加要用的 B / C / E（后台装载）。
 *   fellBack：要的东西清单里没有（旧清单），退回旧床，别静音。
 */
export function BedLoadPlan(manifest, choice = CHOICE_LAYERED, layers = BATTLE_BED_LAYERS) {
  const entries = Object.entries(manifest?.beds || {}).filter(([, entry]) => entry && entry.file);
  const variants = manifest?.bedVariants || {};
  const want = choice || CHOICE_LAYERED;
  const plan = { mode: CHOICE_LEGACY, beds: [], overlay: [], variant: null, replaced: false, dropped: false, fellBack: false };
  const Plain = () => entries.map(([bed, entry]) => ({ bed, file: entry.file }));
  const Swapped = (key) => entries.map(([bed, entry]) => (bed === REPLACED_BED
    ? { bed: REPLACED_BED, file: variants[key].file, variant: key } : { bed, file: entry.file }));

  if (want === CHOICE_LEGACY) { plan.beds = Plain(); return plan; }
  if (want === CHOICE_NONE) {
    plan.mode = CHOICE_NONE;
    plan.dropped = entries.some(([bed]) => bed === REPLACED_BED);
    plan.beds = Plain().filter((b) => b.bed !== REPLACED_BED);
    return plan;
  }
  if (want === CHOICE_LAYERED) {
    const base = layers?.base;
    if (!base || !variants[base]?.file) { plan.beds = Plain(); plan.fellBack = true; return plan; }
    plan.mode = CHOICE_LAYERED;
    plan.beds = Swapped(base);
    plan.variant = base;
    plan.replaced = true;
    const seen = new Set([base]);
    for (const [role, keys] of [["open", layers.open || []], ["enclosed", layers.enclosed || []]]) {
      for (const key of keys) {
        if (seen.has(key) || !variants[key]?.file) continue;      // 清单里没有这条：少一条叠加，不影响底床
        seen.add(key);
        plan.overlay.push({ key, file: variants[key].file, role });
      }
    }
    return plan;
  }
  // 单选一条：只放这一条、不叠加。
  if (!variants[want]?.file) { plan.beds = Plain(); plan.fellBack = true; return plan; }   // 清单里没有这条候选：退回旧床，别静音
  plan.mode = "variant";
  plan.beds = Swapped(want);
  plan.variant = want;
  plan.replaced = true;
  return plan;
}

/** 预取用：按计划列出开机要**阻塞**下载的全部音频文件名（床 + 一次性音）。叠加用的 B / C / E 不在里面。 */
export function AmbFilesToFetch(manifest, choice = CHOICE_LAYERED, layers = BATTLE_BED_LAYERS) {
  const files = BedLoadPlan(manifest, choice, layers).beds.map((b) => b.file);
  for (const entry of Object.values(manifest?.cues || {})) {
    for (const file of entry.files || (entry.file ? [entry.file] : [])) files.push(file);
  }
  return files;
}

/** 开机之后后台下载的文件名（叠加用的 B / C / E）。 */
export function OverlayFilesToFetch(manifest, choice = CHOICE_LAYERED, layers = BATTLE_BED_LAYERS) {
  return BedLoadPlan(manifest, choice, layers).overlay.map((o) => o.file);
}
