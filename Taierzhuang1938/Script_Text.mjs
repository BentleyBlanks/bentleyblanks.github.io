// Script_Text.mjs — 玩家可见文本的唯一出口（字符串表运行时）。纯规则，不 import three。
//
// 规矩（docs/Data_TextAndTuning.md 是完整口径）：
//   · 代码里**不写玩家能看见的中文**。HUD 提示、目标、菜单、交互标签、系统字幕一律
//     `T("domain.key")`；带变量用 `T("key", { n: 3 })`，模板里写 `{n}`。
//   · 表在 Data_Text_<Domain>.mjs（按系统分文件），由 Data_Locale_zhCN.mjs 拼成一套语言；
//     加语言 = 再写一份 Data_Locale_<id>.mjs，键相同、值翻译，代码一行不改。
//   · 内容层（章节台词、过场分镜、史料卡、口令）本体仍写在各 Data_Mission*/Data_Cutscene*
//     文件里 —— 那是考据过的原稿，不搬家。它们走 `Localize(id, text)`：
//     当前语言表里有 `content.<id>` 就用译文，没有就原样返回原稿。翻译人员只需要
//     `node Script_TextGather.mjs` 导出的清单，不需要碰任何 .mjs。
//   · 缺键不抛：返回键本身并记进 Missing()，Script_TextTest 静态查一遍，运行时也看得出来。
//   · 开发者诊断（console.warn / throw / 编辑器面板）不走这里 —— 那不是玩家文本。
import { LOCALE as ZH_CN } from "./Data_Locale_zhCN.mjs";

const locales = new Map();
let active = null;
let fallback = null;
const missing = new Set();

/** 登记一套语言；同 id 重复登记以后者为准（热替换用）。 */
export function RegisterLocale(locale) {
  if (!locale || typeof locale.id !== "string" || !locale.strings) {
    throw new Error("RegisterLocale：locale 需要 { id, name, strings }");
  }
  locales.set(locale.id, locale);
  if (!fallback) fallback = locale;
  if (!active) active = locale;
  return locale;
}

/** 切换当前语言。未登记的 id 返回 false 且不改动当前语言。 */
export function SetLocale(id) {
  const next = locales.get(id);
  if (!next) return false;
  active = next;
  return true;
}

export function CurrentLocale() { return active?.id ?? null; }
export function Locales() { return [...locales.values()].map(({ id, name }) => ({ id, name })); }

/**
 * 把 `{name}` 占位符换成 params 里的值。未提供的占位符原样保留（便于在画面上一眼看出）。
 * 不做复数、性别等 ICU 规则 —— 本作两种语言都用不上；需要时在这里扩，不在调用点拼。
 */
export function Format(template, params) {
  if (!params) return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (whole, name) => {
    const value = params[name];
    return value === undefined || value === null ? whole : String(value);
  });
}

/** 查一条文本。缺键返回键本身（不抛），并记入 Missing()。 */
export function T(key, params) {
  const text = active?.strings[key] ?? fallback?.strings[key];
  if (text === undefined) {
    missing.add(key);
    return key;
  }
  return params ? Format(text, params) : text;
}

/** 有没有这条键（不记 missing）。 */
export function HasText(key) {
  return (active?.strings[key] ?? fallback?.strings[key]) !== undefined;
}

/**
 * 内容层本地化：原稿写在数据文件里（台词 / 分镜 / 史料卡），当前语言表里若有
 * `content.<id>` 就替换，否则返回原稿。id 由调用方按「稳定且全局唯一」的口径给
 *（章节台词用 voice key，过场用 `<cutId>.<shot>.<n>`，见 Script_TextGather 的取法）。
 */
export function Localize(id, text) {
  if (!id) return text;
  const key = `content.${id}`;
  const hit = active?.strings[key];
  if (hit !== undefined) return hit;
  return text;
}

/** 到目前为止查过而没找到的键（取证口；测试与 Debug 面板用）。 */
export function Missing() { return [...missing]; }
export function ClearMissing() { missing.clear(); }

RegisterLocale(ZH_CN);
