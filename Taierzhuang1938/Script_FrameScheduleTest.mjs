// 每帧调度表的门禁（docs/Data_FrameSchedule.md，纯 Node，秒级）。
//
// 守五件事：
//   1. FRAME_PLAY_STEPS 的步骤名不重；FRAME_ORDER_RULES 的每一条先后都成立（原 Frame 注释里那些「必须排在谁前面」）。
//   2. Script_Main 里每一步都有 PlayStep<Id>，PLAY_STEP_FUNCS 不多不少正好是这张表。
//   3. 每个模式都有 FrameMode<Id> 并登记进 FRAME_MODE_STEPS。
//   4. Frame 本身只剩冻结判断、帧头、按模式分派（不许再长回去）。
//   5. 步骤里不许出现裸 `return;`：拆开以后它只结束这一步，结束这一帧要 `return STOP;`（出画那一步除外）。

import assert from "node:assert/strict";
import fs from "node:fs";
import { FRAME_MODES, FRAME_PLAY_STEPS, FRAME_ORDER_RULES } from "./Data_FrameSchedule.mjs";

let checks = 0;
const Check = (ok, message) => { assert.ok(ok, message); checks += 1; };
const Pascal = (id) => id[0].toUpperCase() + id.slice(1);
const main = fs.readFileSync(new URL("./Script_Main.mjs", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const Body = (header) => {
  const at = main.indexOf(header);
  if (at < 0) return null;
  const lines = main.slice(at).split("\n");
  let end = 1; while (end < lines.length && lines[end] !== "}") end++;
  return lines.slice(1, end).join("\n");
};

// 1. 表本身
const ids = FRAME_PLAY_STEPS.map((s) => s.id);
Check(new Set(ids).size === ids.length, "步骤名不重");
Check(ids.at(-1) === "render", "出画是最后一步");
for (const rule of FRAME_ORDER_RULES) {
  const a = ids.indexOf(rule.before), b = ids.indexOf(rule.after);
  Check(a >= 0 && b >= 0, `规则里的步骤都在表里：${rule.before} → ${rule.after}`);
  Check(a < b, `${rule.before} 必须排在 ${rule.after} 前面：${rule.why}`);
}

// 2. 步骤函数
const funcs = main.match(/const PLAY_STEP_FUNCS = \{\n([\s\S]*?)\n\};/);
Check(!!funcs, "Script_Main 有 PLAY_STEP_FUNCS");
const mapped = [...funcs[1].matchAll(/^\s+(\w+): PlayStep(\w+),$/gm)].map((m) => {
  Check(Pascal(m[1]) === m[2], `PLAY_STEP_FUNCS.${m[1]} 指向 PlayStep${Pascal(m[1])}`);
  return m[1];
});
Check(mapped.length === ids.length && ids.every((id) => mapped.includes(id)), `PLAY_STEP_FUNCS 正好是调度表那 ${ids.length} 步`);
for (const id of ids) {
  const body = Body(`function PlayStep${Pascal(id)}(f) {`);
  Check(body !== null, `Script_Main 定义了 PlayStep${Pascal(id)}`);
  if (id === "render") continue;
  const bare = body.split("\n").filter((line) => /^\s{2,4}(?:if\b[^;]*\)\s*)?return;\s*$/.test(line) || /\{\s*return;\s*\}/.test(line));
  Check(bare.length === 0, `PlayStep${Pascal(id)} 不用裸 return 结束这一帧（用 return STOP）：${bare.join(" | ")}`);
}

// 3. 模式
const modeMap = main.match(/const FRAME_MODE_STEPS = \{([^}]*)\};/);
Check(!!modeMap, "Script_Main 有 FRAME_MODE_STEPS");
for (const { id } of FRAME_MODES) {
  Check(new RegExp(`\\b${id}: FrameMode${Pascal(id)}\\b`).test(modeMap[1]), `FRAME_MODE_STEPS 登记 ${id}`);
  Check(new RegExp(`^function FrameMode${Pascal(id)}\\(`, "m").test(main), `Script_Main 定义了 FrameMode${Pascal(id)}`);
  Check(new RegExp(`return "${id}";`).test(Body("function FrameMode() {") || ""), `FrameMode() 能选中 ${id}`);
}

// 4. Frame 本身
const frame = Body("function Frame(dt, render = true) {");
const statements = frame.split("\n").filter((line) => line.trim() && !line.trim().startsWith("//"));
Check(statements.length <= 4, `Frame 只剩冻结判断、帧头、按模式分派（现在 ${statements.length} 行）`);

console.log(`[frame] 每帧调度表：${checks} 条全过（${FRAME_MODES.length} 个模式、${ids.length} 步、${FRAME_ORDER_RULES.length} 条先后规则）`);
