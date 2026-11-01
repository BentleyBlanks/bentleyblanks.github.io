// 给按源码查「每帧先后」的静态测试用（纯 Node）：把 Script_FrameModes 与 Script_FrameSteps* 按调度表的顺序
// 拼回一段「平铺的 Frame」，去掉 ctx. / f. 前缀、return STOP 写回 return，嵌回 Script_Main 原来 Frame 的位置。
// 先后仍以 Data_FrameSchedule 为准（FrameScheduleTest 守）；这里只是让「A 的那句在 B 前面」这类旧断言照样读得懂。
import fs from "node:fs";
import { FRAME_MODES, FRAME_PLAY_STEPS } from "./Data_FrameSchedule.mjs";

const Read = (file) => fs.readFileSync(new URL(`./${file}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const STEP_FILES = ["Script_FrameStepsPlayer.mjs", "Script_FrameStepsWorld.mjs", "Script_FrameStepsRules.mjs", "Script_FrameStepsPresent.mjs"];
const Pascal = (id) => id[0].toUpperCase() + id.slice(1);

function Body(text, header) {
  const at = text.indexOf(header);
  if (at < 0) throw new Error(`FrameFlatSource: missing ${header}`);
  const lines = text.slice(at).split("\n");
  let end = 1; while (end < lines.length && lines[end] !== "}") end++;
  return lines.slice(1, end).join("\n");
}
const Unwrap = (body) => body
  .replace(/^\s*const (?:\w+ = f\.\w+(?:, )?)+;\n/gm, "") // 步骤开头取 dt / realDt / render 的那一行：平铺版里本来就有
  .replace(/\bctx\./g, "")
  .replace(/\bf\.(dt|realDt|render|weapon|phase)\b/g, "$1")
  .replace(/\breturn STOP;/g, "return;");

/** 平铺的 Frame 函数体：冻结判断 → 帧头 → 各模式（if 块）→ 正常游戏各步（按 FRAME_PLAY_STEPS）。 */
export function FlatFrameBody() {
  const modes = Read("Script_FrameModes.mjs");
  const steps = STEP_FILES.map(Read).join("\n");
  const parts = [
    Unwrap(Body(modes, "export function FrameFrozen(ctx, dt, render) {")).replace(/return true;/g, "return;").replace(/\n\s*return false;/g, ""),
    Unwrap(Body(modes, "export function BeginFrame(ctx, f, dt, render) {")),
  ];
  for (const { id } of FRAME_MODES) {
    if (id === "play") continue;
    const header = new RegExp(`export function FrameMode${Pascal(id)}\\(ctx(?:, f)?\\) \\{`).exec(modes)?.[0];
    if (!header) throw new Error(`FrameFlatSource: missing FrameMode${Pascal(id)}`);
    parts.push(`  if (/* mode */ "${id}") {\n${Unwrap(Body(modes, header))}\n  }`);
  }
  for (const { id } of FRAME_PLAY_STEPS) parts.push(Unwrap(Body(steps, `export function PlayStep${Pascal(id)}(ctx, f) {`)));
  return parts.join("\n");
}

/** Script_Main 的源码，只是 Frame 的函数体换成平铺版（给旧的按源码断言用）。 */
export function FlatMainSource() {
  const main = Read("Script_Main.mjs");
  const header = "function Frame(dt, render = true) {";
  const at = main.indexOf(header);
  const end = main.indexOf("\n}\n", at);
  if (at < 0 || end < 0) throw new Error("FrameFlatSource: Script_Main has no Frame");
  return `${main.slice(0, at + header.length)}\n${FlatFrameBody()}${main.slice(end)}`;
}
