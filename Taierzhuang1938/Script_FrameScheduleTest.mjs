// 每帧调度表的门禁（docs/Data_FrameSchedule.md，纯 Node，秒级）。
//
// 守六件事：
//   1. FRAME_PLAY_STEPS 的步骤名不重；FRAME_ORDER_RULES 的每一条先后都成立（原 Frame 注释里那些「必须排在谁前面」）。
//   2. 每一步在某个 Script_FrameSteps* 里有 PlayStep<Id>(ctx, f)，并且只登记在一组 <组>_STEPS 里；Script_Main 把四组合进 PLAY_STEP_FUNCS。
//   3. 每个模式都有 FrameMode<Id>（Script_FrameModes）并登记进 FRAME_MODE_STEPS。
//   4. Frame 本身只剩冻结判断、帧头、按模式分派（不许再长回去）。
//   5. 步骤里不许出现裸 `return;`：结束这一帧要 `return STOP;`（出画那一步除外）。
//   6. 工具箱：步骤与模式文件不 import Script_Main；用到的每个 ctx.<名字> 都在 Script_Main 的 ctx 里登记过。

import assert from "node:assert/strict";
import fs from "node:fs";
import { FRAME_MODES, FRAME_PLAY_STEPS, FRAME_ORDER_RULES } from "./Data_FrameSchedule.mjs";

let checks = 0;
const Check = (ok, message) => { assert.ok(ok, message); checks += 1; };
const Pascal = (id) => id[0].toUpperCase() + id.slice(1);
const Read = (file) => fs.readFileSync(new URL(`./${file}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const Body = (text, header) => {
  const at = text.indexOf(header);
  if (at < 0) return null;
  const lines = text.slice(at).split("\n");
  let end = 1; while (end < lines.length && lines[end] !== "}") end++;
  return lines.slice(1, end).join("\n");
};
const main = Read("Script_Main.mjs");
const modes = Read("Script_FrameModes.mjs");
const STEP_FILES = ["Script_FrameStepsPlayer.mjs", "Script_FrameStepsWorld.mjs", "Script_FrameStepsRules.mjs", "Script_FrameStepsPresent.mjs"];
const stepTexts = Object.fromEntries(STEP_FILES.map((file) => [file, Read(file)]));

// 1. 表本身
const ids = FRAME_PLAY_STEPS.map((s) => s.id);
Check(new Set(ids).size === ids.length, "步骤名不重");
Check(ids.at(-1) === "render", "出画是最后一步");
for (const rule of FRAME_ORDER_RULES) {
  const a = ids.indexOf(rule.before), b = ids.indexOf(rule.after);
  Check(a >= 0 && b >= 0, `规则里的步骤都在表里：${rule.before} → ${rule.after}`);
  Check(a < b, `${rule.before} 必须排在 ${rule.after} 前面：${rule.why}`);
}

// 2. 步骤函数：每步正好登记在一组里，函数就在那组的文件里
const registered = new Map();
const groupNames = [];
for (const [file, text] of Object.entries(stepTexts)) {
  const group = text.match(/^export const (\w+_STEPS) = \{\n([\s\S]*?)\n\};/m);
  Check(!!group, `${file} 导出一组 <组>_STEPS`);
  groupNames.push(group[1]);
  for (const m of group[2].matchAll(/^\s+(\w+): PlayStep(\w+),$/gm)) {
    Check(Pascal(m[1]) === m[2], `${group[1]}.${m[1]} 指向 PlayStep${Pascal(m[1])}`);
    Check(!registered.has(m[1]), `${m[1]} 只登记在一组里（${registered.get(m[1])} / ${file}）`);
    registered.set(m[1], file);
  }
}
Check(registered.size === ids.length && ids.every((id) => registered.has(id)), `四组合起来正好是调度表那 ${ids.length} 步`);
const funcs = main.match(/const PLAY_STEP_FUNCS = \{\n([\s\S]*?)\n\};/);
Check(!!funcs, "Script_Main 有 PLAY_STEP_FUNCS");
Check(groupNames.every((g) => new RegExp(`^\\s+\\.\\.\\.${g},$`, "m").test(funcs[1])), `PLAY_STEP_FUNCS 合进了 ${groupNames.join(" / ")}`);
for (const id of ids) {
  const file = registered.get(id);
  const body = Body(stepTexts[file], `export function PlayStep${Pascal(id)}(ctx, f) {`);
  Check(body !== null, `${file} 定义了 PlayStep${Pascal(id)}(ctx, f)`);
  if (id === "render") continue;
  const bare = body.split("\n").filter((line) => /^\s{2,4}(?:if\b[^;]*\)\s*)?return;\s*$/.test(line) || /\{\s*return;\s*\}/.test(line));
  Check(bare.length === 0, `PlayStep${Pascal(id)} 不用裸 return 结束这一帧（用 return STOP）：${bare.join(" | ")}`);
}

// 3. 模式
const modeMap = main.match(/const FRAME_MODE_STEPS = \{([^}]*)\};/);
Check(!!modeMap, "Script_Main 有 FRAME_MODE_STEPS");
for (const { id } of FRAME_MODES) {
  Check(new RegExp(`\\b${id}: FrameMode${Pascal(id)}\\b`).test(modeMap[1]), `FRAME_MODE_STEPS 登记 ${id}`);
  Check(new RegExp(`^export function FrameMode${Pascal(id)}\\(ctx\\b`, "m").test(modes), `Script_FrameModes 定义了 FrameMode${Pascal(id)}(ctx…)`);
  Check(new RegExp(`return "${id}";`).test(Body(modes, "export function FrameMode(ctx) {") || ""), `FrameMode() 能选中 ${id}`);
}

// 4. Frame 本身
const frame = Body(main, "function Frame(dt, render = true) {");
const statements = frame.split("\n").filter((line) => line.trim() && !line.trim().startsWith("//"));
Check(statements.length <= 4, `Frame 只剩冻结判断、帧头、按模式分派（现在 ${statements.length} 行）`);

// 6. 工具箱
const ctxBlock = main.match(/^const ctx = \{\n([\s\S]*?)\n\};/m);
Check(!!ctxBlock, "Script_Main 有工具箱 ctx");
const ctxKeys = new Set([...ctxBlock[1].matchAll(/^\s+(?:get |set )?(\w+)(?:\(\))?/gm)].map((m) => m[1]));
for (const [file, text] of [["Script_FrameModes.mjs", modes], ...Object.entries(stepTexts)]) {
  Check(!/from "\.\/Script_Main\.mjs"/.test(text), `${file} 不 import Script_Main（从 ctx 拿）`);
  const missing = [...new Set([...text.matchAll(/\bctx\.(\w+)/g)].map((m) => m[1]))].filter((name) => !ctxKeys.has(name));
  Check(missing.length === 0, `${file} 用到的 ctx.<名字> 都在工具箱里登记过：缺 ${missing.join(", ")}`);
}

console.log(`[frame] 每帧调度表：${checks} 条全过（${FRAME_MODES.length} 个模式、${ids.length} 步、${FRAME_ORDER_RULES.length} 条先后规则、工具箱 ${ctxKeys.size} 项）`);
