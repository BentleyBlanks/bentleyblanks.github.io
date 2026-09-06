// Font/Script_FontChars.mjs — 打包字体到底要裁哪些字，唯一真相。
//
// 两个消费者共用这一份，所以「烘出来的字体」和「闸门检查的字表」不可能走偏：
//   · Script_FontSubset.py  照它裁 woff2；
//   · Script_TextTest.mjs   照它和已烘的清单对账，少一个字就红。
//
// 直接跑会把两张字表打成 JSON 打到 stdout（Python 那边就是这么读的）：
//   node Taierzhuang1938/Font/Script_FontChars.mjs
//
// **新增「会出现在界面上」的数据模块要登记进 UI_MODULES。** 漏登记不会报错，
// 只会让那几个字在真机上悄悄回退到系统字体 —— 正文里一两个字长得不一样，
// 比标题难看出得多，所以宁可多登记。
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(here, "..");

/** 供界面取字的纯数据模块（都不许 import three，Node 里要能直接 import）。 */
const UI_MODULES = [
  "Data_Locale_zhCN.mjs",   // 语言表：绝大多数界面文案的家
  "Data_TengxianScript.mjs", // 标题 / 关于页 / 七章的名字、地点与简报
  "Data_Menu.mjs",           // 主菜单机位说明
  "Data_History.mjs",        // 史实注记页
  "Data_Levels.mjs",         // 关卡名与目标
  "Data_Range.mjs",          // 靶场工位说明
];

/** 界面里一定会出现、但不一定写在数据表里的字符（数字、按键名、标点）。 */
const ALWAYS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
  + " ·—…、。，：；！？（）「」《》%+-/×↑↓←→";

/** 深走一棵纯数据导出，把所有字符串摘出来。 */
function Walk(value, out, seen = new Set()) {
  if (typeof value === "string") { out.push(value); return; }
  if (typeof value === "function" || value === null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  for (const item of Array.isArray(value) ? value : Object.values(value)) Walk(item, out, seen);
}

async function CollectStrings(files) {
  const strings = [];
  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(projectDir, file)).href);
    Walk({ ...mod }, strings);
  }
  return strings;
}

const Charset = (strings) => {
  const set = new Set();
  for (const s of strings) for (const ch of s) if (ch.codePointAt(0) > 31) set.add(ch);
  return [...set].sort().join("");
};

/** 大标题字体（Font_Title.woff2）只排这三处文本，字表刻意留得很小。 */
export async function TitleChars() {
  const { MENU } = await import(pathToFileURL(path.join(projectDir, "Data_TengxianScript.mjs")).href);
  const { TEXT } = await import(pathToFileURL(path.join(projectDir, "Data_Text_Menu.mjs")).href);
  return Charset([MENU.title, MENU.subtitle, TEXT["menu.title.paused"] ?? ""]);
}

/** 界面字体（Font_UiSans_*.woff2）要覆盖菜单 / 加载 / 编辑器 / HUD 的全部文案。 */
export async function UiChars() {
  return Charset([...await CollectStrings(UI_MODULES), ALWAYS]);
}

/**
 * 拉丁字体（Font_UiLatin_*.woff2）**只装 ASCII**：字母、数字与半角标点。
 *
 * 别按「码位小于 CJK 区」来切 —— 破折号（—）、间隔号（·）、省略号（…）、箭头、
 * 圈码这些码位都在拉丁区，但在中文行里必须是全角的。让 Barlow 接管它们，
 * 「一九三八年三月十四日 — 十八日」那一横会瘦成拉丁破折号，夹在汉字中间一眼就别扭。
 * 留给思源黑排，全角宽度才对。
 */
export const LatinOf = (chars) => [...chars]
  .filter((ch) => { const c = ch.codePointAt(0); return c >= 0x20 && c <= 0x7e; })
  .join("");

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const ui = await UiChars();
  process.stdout.write(JSON.stringify({ title: await TitleChars(), ui, latin: LatinOf(ui) }));
}
