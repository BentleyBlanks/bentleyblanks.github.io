// 内容 / 文案 i18n 层：所有用户可见的中文文案、对话、选项、旁白都从语言包 JSON 读取，
// 不再硬编码在各 content/*.ts 里。content/*.ts 只保留类型与逻辑函数，数据从 content() 取。
//
// 多语言：每种语言一份平行的 JSON（zh-CN.json 为母本，新增语言整份拷贝后翻译）。切换语言后
// 需重新加载页面生效（content/*.ts 在模块加载时捕获当前语言的引用）。
//
// 内容编辑器（Debug）直接「就地修改」active 对象的字段 → 已捕获同一引用的消费方随之生效；
// 「导出 JSON」把改后的整份语言包导出，粘回 locales/<lang>.json 即落地。
import zhCN from "./locales/zh-CN.json";

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

// 导出当前（可能已被编辑器改过的）语言包为格式化 JSON，供粘回源文件。
export function exportActiveContentJSON(): string {
  return JSON.stringify(active, null, 2);
}
