// 战场远景床（battleFar）候选的选择与装载计划。纯函数，不碰 DOM、不碰 three，node 里能直接断言。
//
// 背景（2026-09-29）：现行 battleFar 是英语战斗人群录音，用户听成「奇奇怪怪的人声」。
// 无人声候选 A–E 在 Audio/Amb/Data_AmbManifest.json 的 `bedVariants` 里（不在 `beds` 里：
// 放进 beds 开机会把五条全下载）。这里决定「这一局装哪一条」：
//
//   优先级：URL 参数 ?ambBed=  >  Data_Tuning_Audio.BATTLE_BED_VARIANT  >  默认（现行 battleFar）
//   取值：  A / B / C / D / E（大小写都行）= 用对应候选；none = 不放这一层；null / 缺省 = 现行
//
// 装载计划只换 `battleFar` 这一个床名：候选被登记成同名床，所有预设（AMBIENCE_PRESETS 与
// OPENING_AMBIENCE_PRESETS 的每一层 `{ bed: "battleFar" }`）不用改一个字。
// 被换掉的旧床不进计划，也就不会被请求（预取与解码都按计划走）。

/** 被候选替换的床名。 */
export const REPLACED_BED = "battleFar";

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
  if (/^none$/i.test(text)) return { choice: "none", bad: false };
  const key = text.toUpperCase();
  if (keys.includes(key)) return { choice: key, bad: false };
  return { choice: null, bad: true };
}

/**
 * 决定用哪一条。
 * @param {{search?: string, tuning?: string|null, keys?: string[]}} input keys = 清单里 bedVariants 的键
 * @returns {{choice: null|"none"|string, source: "default"|"tuning"|"url", ignored: string|null}}
 *   ignored：给了但认不出的值（原样返回，调用方 warn 一声；认不出就退回下一级，绝不因为拼错静音）
 */
export function ResolveBattleBedChoice({ search = "", tuning = null, keys = [] } = {}) {
  const fromUrl = ParseAmbBedParam(search);
  const url = Normalize(fromUrl, keys);
  if (url.choice) return { choice: url.choice, source: "url", ignored: null };
  const tuned = Normalize(tuning, keys);
  if (tuned.choice) return { choice: tuned.choice, source: "tuning", ignored: url.bad ? fromUrl : null };
  return { choice: null, source: "default", ignored: url.bad ? fromUrl : (tuned.bad ? String(tuning) : null) };
}

/**
 * 把清单变成床的装载计划。
 * @returns {{beds: {bed: string, file: string, variant?: string}[], variant: string|null, replaced: boolean, dropped: boolean}}
 *   beds 顺序与清单一致；候选顶替 battleFar 的位置。
 */
export function BedLoadPlan(manifest, choice = null) {
  const entries = Object.entries(manifest?.beds || {}).filter(([, entry]) => entry && entry.file);
  const variants = manifest?.bedVariants || {};
  const plan = { beds: [], variant: null, replaced: false, dropped: false };
  const variant = choice && choice !== "none" ? variants[choice] : null;
  for (const [bed, entry] of entries) {
    if (bed !== REPLACED_BED || !choice) { plan.beds.push({ bed, file: entry.file }); continue; }
    if (choice === "none") { plan.dropped = true; continue; }
    if (variant && variant.file) {
      plan.beds.push({ bed: REPLACED_BED, file: variant.file, variant: choice });
      plan.variant = choice;
      plan.replaced = true;
    } else {
      plan.beds.push({ bed, file: entry.file });        // 清单里没有这条候选：退回现行，别静音
    }
  }
  return plan;
}

/** 预取用：按计划列出要下载的全部音频文件名（床 + 一次性音）。 */
export function AmbFilesToFetch(manifest, choice = null) {
  const files = BedLoadPlan(manifest, choice).beds.map((b) => b.file);
  for (const entry of Object.values(manifest?.cues || {})) {
    for (const file of entry.files || (entry.file ? [entry.file] : [])) files.push(file);
  }
  return files;
}
