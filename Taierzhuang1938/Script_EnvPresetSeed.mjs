// 第一关两个场景的环境预设种子（docs/Data_Environment.md §7，2026-11-02 一次性生成，留着重放 / 对照）。
//
// 用户 2026-11-02：白盒场景与正式场景各配一个兜底区域（fallback volume）+ 一份配套的环境预设，
// 预设里配好白天 / 黄昏 / 晚上三套表现，其他时段自然插值，方便后续编排。
//   白天 12:00 = firstLevelBattleDay（白盒编辑器原来的天，默认时刻打开和以前一模一样）
//   黄昏 18:00 = dusk（城里那几关标定过的黄昏），云层不整个撤掉：留一层暖色层积云，免得 12→18 点之间云凭空消失
//   晚上 22:00 与 04:00 = firstLevelNight（第一关关尾的阴云夜）；两帧同一套（tag 联动），夜里那段不会被插成半个白天
//
// **生成完以后预设文件就是唯一真相**：编辑器 / agent 直接改 Environment/EnvPreset_<Id>.json，别回头重跑这个脚本
//（重跑要带 --write --force，会把手改的覆盖掉）。
//   node Taierzhuang1938/Script_EnvPresetSeed.mjs            只打印会写什么
//   node Taierzhuang1938/Script_EnvPresetSeed.mjs --write    写还不存在的文件
//   node Taierzhuang1938/Script_EnvPresetSeed.mjs --write --force   覆盖

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SKY_PRESETS } from "./Script_Sky.mjs";
import {
  EnvPresetFromLooks, FormatEnvJson, NewSceneEnv, ValidateEnvPreset, ValidateSceneEnv,
} from "./Script_EnvPreset.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const write = process.argv.includes("--write");
const force = process.argv.includes("--force");

/** 黄昏：dusk 原样，只补一层暖色层积云（firstLevelBattleDay 的云盘，云底偏暖、银边亮一点）。 */
function FirstLevelDusk() {
  return {
    ...SKY_PRESETS.dusk,
    cloudShape: [3.2, 0.30, 0.68, 0.25],
    cloudDeck: { structure: 0.75, underside: 0.45, gap: 1.6, silver: 0.6,
      scale: 1.1, coverage: 0.52, softness: 0.55, warp: 0.35, shade: [0.62, 0.44, 0.33] },
  };
}

const LOOKS = [
  { id: "day", label: "白天", hours: [12], legacy: SKY_PRESETS.firstLevelBattleDay, name: "firstLevelBattleDay" },
  { id: "dusk", label: "黄昏", hours: [18], legacy: FirstLevelDusk(), name: "dusk" },
  { id: "night", label: "晚上", hours: [22, 4], legacy: SKY_PRESETS.firstLevelNight, name: "firstLevelNight" },
];

const SCENES = [
  { scene: "FirstLevelWhitebox", preset: "FirstLevelWhitebox", title: "第一关白盒 · 昼夜（白天 / 黄昏 / 晚上）" },
  { scene: "FirstLevel", preset: "FirstLevel", title: "第一关正式场景 · 昼夜（白天 / 黄昏 / 晚上）" },
];

const plans = [];
for (const entry of SCENES) {
  const preset = EnvPresetFromLooks(entry.preset, entry.title, LOOKS);
  const check = ValidateEnvPreset(preset);
  if (!check.ok) throw new Error(`${entry.preset} 预设不合规：${check.errors.join("；")}`);
  plans.push({ file: `Taierzhuang1938/Environment/EnvPreset_${entry.preset}.json`, text: FormatEnvJson(preset) });
  const sceneEnv = NewSceneEnv(entry.scene, entry.preset);
  const sceneCheck = ValidateSceneEnv(sceneEnv, { presetIds: new Set([entry.preset]) });
  if (!sceneCheck.ok) throw new Error(`${entry.scene} 区域文件不合规：${sceneCheck.errors.join("；")}`);
  plans.push({ file: `Taierzhuang1938/Scenes/${entry.scene}/Environment_${entry.scene}.json`, text: FormatEnvJson(sceneEnv) });
}

for (const plan of plans) {
  const abs = path.join(repo, plan.file);
  const exists = fs.existsSync(abs);
  if (!write) { console.log(`${exists ? "已有" : "会写"}  ${plan.file}（${plan.text.length} 字节）`); continue; }
  if (exists && !force) { console.log(`跳过（已有，覆盖要 --force）  ${plan.file}`); continue; }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, plan.text);
  console.log(`写了  ${plan.file}`);
}
