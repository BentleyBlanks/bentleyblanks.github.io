// Data_Locale_zhCN.mjs — 简体中文（基准语言）。把各系统的 Data_Text_*.mjs 拼成一套。
//
// 这是**基准语言**：所有键在这里必须齐全。其他语言（Data_Locale_<id>.mjs）只需
// 覆盖翻译过的键，缺的自动回落到这里（见 Script_Text.T）。
// 新系统加表：新建 Data_Text_<Domain>.mjs、在下面 import 并加进 TABLES；
// 键前缀用小写域名（hud. / menu. / p012. / …），同一前缀只归一个文件，避免两处写同一键。
// 重复键在拼表时直接抛 —— 宁可开机红，也不要两处文案互相覆盖而没人知道。
import { TEXT as HUD } from "./Data_Text_Hud.mjs";
import { TEXT as MENU } from "./Data_Text_Menu.mjs";
import { TEXT as INPUT } from "./Data_Text_Input.mjs";
import { TEXT as BOOT } from "./Data_Text_Boot.mjs";
import { TEXT as GAMEPLAY } from "./Data_Text_Gameplay.mjs";
import { TEXT as INTERACT } from "./Data_Text_Interact.mjs";
import { TEXT as P012 } from "./Data_Text_P012.mjs";
import { TEXT as SETPIECES } from "./Data_Text_Setpieces.mjs";
import { TEXT as STORY } from "./Data_Text_Story.mjs";
import { TEXT as RANGE } from "./Data_Text_Range.mjs";

const TABLES = [
  ["Data_Text_Hud", HUD],
  ["Data_Text_Menu", MENU],
  ["Data_Text_Input", INPUT],
  ["Data_Text_Boot", BOOT],
  ["Data_Text_Gameplay", GAMEPLAY],
  ["Data_Text_Interact", INTERACT],
  ["Data_Text_P012", P012],
  ["Data_Text_Setpieces", SETPIECES],
  ["Data_Text_Story", STORY],
  ["Data_Text_Range", RANGE],
];

/** 拼表；重复键抛错并点名两份来源。导出给测试与其他语言的拼表复用。 */
export function MergeTables(tables) {
  const strings = Object.create(null);
  const owner = new Map();
  for (const [name, table] of tables) {
    for (const [key, value] of Object.entries(table)) {
      if (owner.has(key)) throw new Error(`文本键重复：${key}（${owner.get(key)} 与 ${name}）`);
      if (typeof value !== "string") throw new Error(`文本值不是字符串：${name}.${key}`);
      owner.set(key, name);
      strings[key] = value;
    }
  }
  return Object.freeze(strings);
}

export const TABLE_SOURCES = Object.freeze(TABLES.map(([name]) => name));

export const LOCALE = Object.freeze({
  id: "zh-CN",
  name: "简体中文",
  strings: MergeTables(TABLES),
});
