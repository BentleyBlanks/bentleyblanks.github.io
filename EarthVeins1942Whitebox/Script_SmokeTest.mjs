import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { levelDefinitions, roleDefinitions, buildOptions } from "./Data_WhiteboxCampaign.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const Read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const Assert = (condition, message) => { if (!condition) throw new Error(message); };
const html = Read("index.html");
const css = Read("Style_Whitebox.css");
const game = Read("Script_Whitebox.mjs");
const data = Read("Data_WhiteboxCampaign.mjs");

Assert(levelDefinitions.length === 3, "必须正好包含三个关卡");
Assert(levelDefinitions.map((level) => level.id).join(",") === "undergroundWall,ensemble,mindGame", "三个关卡 ID 或顺序错误");
Assert(levelDefinitions.map((level) => level.phases.length).join(",") === "4,4,3", "三个循环阶段数应为 4/4/3");
Assert(!data.includes("campaignData") && !data.includes("cinematicSequences"), "旧七章线性战役导出仍存在");
Assert(!game.includes("campaignData") && !game.includes("chapterIndex"), "运行脚本仍引用旧线性战役");

const wall = levelDefinitions[0];
const buildActions = wall.actions.filter((action) => action.buildSlot !== undefined);
Assert(buildActions.length === 3 && new Set(buildActions.map((action) => action.buildSlot)).size === 3, "第一关必须有三个独立建造槽");
Assert(buildOptions.length === 3, "第一关必须有三种机关方案");
const collected = wall.actions.reduce((total, action) => {
  for (const [key, value] of Object.entries(action.resource || {})) total[key] = (total[key] || 0) + value;
  return total;
}, {});
const feasible = [];
for (const a of buildOptions) for (const b of buildOptions) for (const c of buildOptions) {
  const options = [a, b, c];
  const wood = options.reduce((sum, option) => sum + option.cost.wood, 0);
  const iron = options.reduce((sum, option) => sum + option.cost.iron, 0);
  const ventilation = options.reduce((sum, option) => sum + option.ventilation, 0);
  const defense = options.reduce((sum, option) => sum + option.defense, 0);
  if (wood <= collected.wood && iron <= collected.iron && ventilation >= 3 && defense >= 4) feasible.push(options.map((option) => option.id).join("+"));
}
Assert(feasible.length >= 2, "第一关采集量必须支持至少两种合格建造组合");
Assert(wall.actions.some((action) => action.phaseGate) && wall.actions.filter((action) => action.triggerSlot !== undefined).length === 3, "第一关缺少迎敌门槛或三机关结算");

const ensemble = levelDefinitions[1];
Assert(ensemble.roleIds.length === 5, "第二关必须有五个可切换角色");
for (const roleId of ensemble.roleIds) {
  Assert(roleDefinitions[roleId], `角色 ${roleId} 未定义`);
  Assert(ensemble.actions.some((action) => action.role === roleId), `角色 ${roleId} 没有专属动作`);
}
Assert(ensemble.actions.filter((action) => action.rescue).length === 3, "第二关必须转移伤员、粮食、联络员三项");
Assert(ensemble.actions.filter((action) => action.memory && action.optional).length === 2, "第二关必须有两件不阻塞流程的记忆物");
Assert(game.includes("CycleRole") && game.includes("需要${roleDefinitions[action.role].name}"), "第二关缺少角色切换或错角色反馈");

const mindGame = levelDefinitions[2];
const tricks = mindGame.actions.filter((action) => action.trick);
Assert(tricks.length >= 5, "第三关至少需要五种诡计");
Assert(tricks.every((action) => Number.isFinite(action.alert) && action.alert > 0 && Number.isFinite(action.morale) && action.morale < 0), "每种诡计都必须有警觉与士气因果");
Assert(mindGame.actions.filter((action) => action.panicStep).length === 3, "第三关必须有三步恐慌连锁");
Assert(game.includes("state.tricks.size >= 3") && game.includes("state.morale <= 55"), "恐慌断点没有按诡计种类和士气双条件实现");
Assert(game.includes("撤回安全支洞") && game.includes("已完成的诡计仍保留"), "警觉满后的非惩罚性撤退规则缺失");

Assert(!html.includes('id="observeButton"') && !html.includes('data-input="observe"'), "正式玩家操作仍存在观察按钮");
Assert(html.includes('data-input="left"') && html.includes('data-input="right"') && html.includes('data-input="switch"') && html.includes('data-input="crouch"') && html.includes('data-input="depth"') && html.includes('data-input="action"'), "移动端六个操作不完整");
Assert(css.includes("user-select: none") && css.includes("-webkit-touch-callout: none") && css.includes("touch-action: none"), "移动端长按防文本选择保护不完整");
Assert(game.includes("setPointerCapture") && game.includes("pointercancel") && game.includes("lostpointercapture"), "移动端长按移动缺少 Pointer Capture 清理");
Assert(game.includes("touchCrouchLatched") && game.includes("ToggleTouchCrouch") && game.includes("SetTouchCrouch"), "移动端蹲伏没有实现可保持开关");
Assert(!game.includes(`document.querySelectorAll('[data-input="left"], [data-input="right"], [data-input="crouch"]')`), "移动端蹲伏仍错误绑定为按住态");
Assert(html.includes('data-input="crouch" type="button" aria-pressed="false"') && css.includes('[data-input="crouch"][aria-pressed="true"]'), "蹲伏开关缺少可访问状态或视觉反馈");
Assert(game.includes("function DrawSurfaceVegetation") && !game.includes("context.moveTo(x, height)"), "仍存在贯穿整个土层的前景竖线");
Assert(game.includes("qaMode") && game.includes("EarthVeinsWhiteboxQa") && game.includes("DrawQa"), "QA 标尺或只读状态入口缺失");
Assert(html.includes('id="qaPanel"') && html.includes('id="qaPhaseButtons"') && game.includes("QaJumpToPhase") && game.includes("jumpToPhase"), "DEBUG 跳关面板或阶段跳转 API 缺失");
Assert(game.includes('Object.assign(state.resources, { wood: 6, iron: 4, powder: 2, medicine: 1, grain: 2 })') && game.includes('state.buildSlots = ["flipGate", "smokeBaffle", "floodGate"]'), "DEBUG 跳关没有补齐夜间收集或建造前置状态");
Assert(game.includes("const profile = actorProfiles.soldier") && game.match(/const scale = Math\.min\(width, 1100\) \/ 26 \* \.038/g)?.length >= 2, "敌兵与主角未共用人物尺度换算");
Assert(css.includes("#touchControls { left: 8px; right: 8px; bottom: 7px; opacity: 1; }") && css.includes("rgba(10,17,19,.94)"), "低高度移动端触控键未强制高对比显示");

const forbiddenRuntime = [/three(?:\.min)?\.js/i, /<img\b/i, /new\s+Image\s*\(/, /AudioContext/i, /https?:\/\//i];
for (const pattern of forbiddenRuntime) {
  Assert(!pattern.test(html + "\n" + game + "\n" + data), `白盒出现禁止的外部运行时/素材：${pattern}`);
}
const cssVersion = html.match(/Style_Whitebox\.css\?v=([^"']+)/)?.[1];
const scriptVersion = html.match(/Script_Whitebox\.mjs\?v=([^"']+)/)?.[1];
Assert(cssVersion && cssVersion === scriptVersion, "HTML 的 CSS/JS cache-bust 不一致");

for (const name of ["Data_WhiteboxCampaign.mjs", "Script_Whitebox.mjs", "Script_SmokeTest.mjs"]) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, name)], { encoding: "utf8" });
  Assert(result.status === 0, `${name} 语法错误：${result.stderr}`);
}

console.log(JSON.stringify({
  ok: true,
  levels: levelDefinitions.map((level) => ({ id: level.id, phases: level.phases.length, actions: level.actions.length })),
  feasibleBuilds: feasible,
  mobileInputs: 6,
  cacheVersion: cssVersion
}, null, 2));
