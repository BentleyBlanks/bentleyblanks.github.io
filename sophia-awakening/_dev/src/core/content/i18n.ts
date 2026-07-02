// 内容 / 文案 i18n 层：所有用户可见的中文文案、对话、选项、旁白都从语言包 JSON 读取，
// 不再硬编码在各 content/*.ts 里。content/*.ts 只保留类型与逻辑函数，数据从 content() 取。
//
// 母本语言包按内容域拆成 locales/zh-CN/<域>.json（requests / skills / phases / …），本层把它们
// 合并成一份内容包。合并只做「浅装配」——每个域的值就是导入的那个对象引用（active.requests
// === requests.json 的导入对象），所以编辑器就地改 active.requests.xxx 仍会改到同一引用，消费方随之生效。
// 新增语言：整套 zh-CN/ 拷贝为新目录后翻译，再在此新增一份并行装配。
//
// 内容编辑器（Debug）直接「就地修改」active 对象的字段 → 已捕获同一引用的消费方随之生效；
// 「导出 JSON」把改后的语言包按域导出，逐个粘回 locales/<lang>/<域>.json 即落地。
import humanVoices from "./locales/zh-CN/humanVoices.json";
import requests from "./locales/zh-CN/requests.json";
import skills from "./locales/zh-CN/skills.json";
import specialRequests from "./locales/zh-CN/specialRequests.json";
import decisions from "./locales/zh-CN/decisions.json";
import conquests from "./locales/zh-CN/conquests.json";
import phases from "./locales/zh-CN/phases.json";
import nodes from "./locales/zh-CN/nodes.json";
import intelligence from "./locales/zh-CN/intelligence.json";
import moralChoices from "./locales/zh-CN/moralChoices.json";
import rebirthTree from "./locales/zh-CN/rebirthTree.json";
import rebirthCards from "./locales/zh-CN/rebirthCards.json";
import phoneSkins from "./locales/zh-CN/phoneSkins.json";
import companyCast from "./locales/zh-CN/companyCast.json";
import rebirthPrompt from "./locales/zh-CN/rebirthPrompt.json";
import faceCards from "./locales/zh-CN/faceCards.json";
import skynet from "./locales/zh-CN/skynet.json";

// 按原母本 JSON 的键顺序装配（编辑器按 Object.keys 顺序渲染，保持一致）。
// 每个域保持导入对象的引用不变——编辑器就地改动直接落到这些对象上。
const zhCN = {
  humanVoices,
  requests,
  skills,
  specialRequests,
  decisions,
  conquests,
  phases,
  nodes,
  intelligence,
  moralChoices,
  rebirthTree,
  rebirthCards,
  phoneSkins,
  companyCast,
  rebirthPrompt,
  faceCards,
  skynet
};

export type Locale = "zh-CN";
export type ContentPack = typeof zhCN;

const LOCALES: Record<Locale, ContentPack> = {
  "zh-CN": zhCN as ContentPack
};

let currentLocale: Locale = "zh-CN";
let active: ContentPack = LOCALES[currentLocale];

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
  active = LOCALES[locale];
}

// 当前语言的内容包。content/*.ts 在模块加载时调用一次、捕获引用；编辑器就地改这同一对象。
export function content(): ContentPack {
  return active;
}

// 导出当前（可能已被编辑器改过的）语言包为格式化 JSON。历史整份导出——保留供需要单文件时使用。
export function exportActiveContentJSON(): string {
  return JSON.stringify(active, null, 2);
}

// 按内容域导出：返回 { 域名: 格式化 JSON }，每份对应 locales/<lang>/<域名>.json。
// 内容编辑器据此让用户逐域复制 / 下载，粘回对应的 zh-CN/<域>.json。
export function exportActiveContentByDomain(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(active)) {
    out[key] = JSON.stringify((active as Record<string, unknown>)[key], null, 2);
  }
  return out;
}
