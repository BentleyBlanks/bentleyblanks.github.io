// 测试场登记表 / 插件 / 玩法时钟的门禁（docs/Data_SandboxRanges.md，纯 Node，秒级）。
//
// 守四件事：
//   1. 登记表每一行都有插件（关卡表、场地类、Create），关卡 id 不重；开机路由与菜单认的开关就是这张表。
//   2. 玩法时钟：按 order 先后叠加、可撤、能返回 0（暂停）与固定步长（单步），realDt 原样留着。
//   3. Script_Main 不再认识「插件化」的那六个测试场：不出现它们的运行时类、场地类、关卡常量与旧开关名。
//   4. 插件实例只接它声明过的钩子（没声明的装配层一律不调）。

import assert from "node:assert/strict";
import fs from "node:fs";
import { SANDBOX_RANGES, SANDBOX_RANGE_KEYS, SandboxRangeFromParams } from "./Data_SandboxRanges.mjs";
import { SANDBOX_PLUGINS, SandboxPluginFor, SandboxForPhase, SandboxWorldClasses, SandboxDebugStubs } from "./Script_SandboxRanges.mjs";
import { GameClock, CLOCK_ORDER } from "./Script_GameClock.mjs";
import { IsMenuStartup, SandboxUrl } from "./Data_StartupRouting.mjs";

let checks = 0;
const Check = (ok, message) => { assert.ok(ok, message); checks += 1; };

// 1. 登记表 ↔ 插件
const ids = SANDBOX_RANGES.map((r) => r.id);
Check(new Set(ids).size === ids.length, "登记表 id 不重");
Check(SANDBOX_PLUGINS.length === SANDBOX_RANGES.length, "每一行都有插件");
const phaseIds = new Set();
for (const plugin of SANDBOX_PLUGINS) {
  Check(plugin.phase && typeof plugin.phase.id === "string", `${plugin.id}: 有关卡表`);
  Check(!phaseIds.has(plugin.phase.id), `${plugin.id}: 关卡 id ${plugin.phase.id} 不与别的测试场重`);
  phaseIds.add(plugin.phase.id);
  Check(typeof plugin.World === "function", `${plugin.id}: 有场地类`);
  Check(typeof plugin.Create === "function", `${plugin.id}: 有 Create`);
  Check(SandboxForPhase(plugin.phase) === plugin, `${plugin.id}: 按关卡认得回插件`);
  Check(SandboxWorldClasses()[plugin.phase.id] === plugin.World, `${plugin.id}: 场地类表里有它`);
  Check(SandboxPluginFor(plugin.entry) === plugin, `${plugin.id}: 按登记行认得回插件`);
  const params = new URLSearchParams(`${plugin.id}=1`);
  Check(SandboxRangeFromParams(params)?.id === plugin.id, `${plugin.id}: ?${plugin.id}=1 选中它`);
  Check(!IsMenuStartup(params), `${plugin.id}: 带这个开关不进正式菜单`);
  Check(new URL(SandboxUrl("http://x/T/?cloth=1&phase=2", plugin.id)).searchParams.get(plugin.id) === "1", `${plugin.id}: 菜单生成的网址打开它`);
}
Check(SandboxRangeFromParams(new URLSearchParams("gore=0")) === null, "?gore=0 是断肢总闸，不是断肢测试场");
Check(SANDBOX_RANGE_KEYS.join() === ids.join(), "开机路由用的开关就是登记表顺序");
Check(IsMenuStartup(new URLSearchParams("")), "什么都不带进正式菜单");

// 2. 玩法时钟
{
  const clock = new GameClock();
  Check(clock.Step(0.016) === 0.016, "没登记缩放器 = 原样");
  const order = [];
  clock.Add("editor", (dt) => { order.push("editor"); return dt * 0.5; }, CLOCK_ORDER.editor);
  clock.Add("meleeQte", (dt) => { order.push("meleeQte"); return dt * 0.25; }, CLOCK_ORDER.meleeQte);
  clock.Add("sandbox", (dt) => { order.push("sandbox"); return dt; }, CLOCK_ORDER.sandbox);
  Check(Math.abs(clock.Step(0.016) - 0.016 * 0.25 * 0.5) < 1e-12, "倍率相乘");
  Check(order.join() === "meleeQte,sandbox,editor", "按 order 先后：白刃 QTE → 测试场 → 编辑器（同原 Frame 开头那五行）");
  Check(clock.realDt === 0.016, "真实时间原样留着（QTE 按键窗口用）");
  clock.Add("sandbox", () => 0, CLOCK_ORDER.sandbox);
  Check(clock.Step(0.016) === 0 && clock.State().scalers.length === 3, "同名重登记替换旧的；能暂停");
  clock.Add("sandbox", () => 1 / 60, CLOCK_ORDER.sandbox);
  Check(Math.abs(clock.Step(0.001) - (1 / 60) * 0.5) < 1e-12, "单步：测试场给固定步长，后面的编辑器照样再乘");
  const remove = clock.Add("tmp", (dt) => dt * 3, 99);
  remove();
  clock.Remove("sandbox"); clock.Remove("meleeQte"); clock.Remove("editor");
  Check(clock.Step(0.02) === 0.02 && !clock.Has("tmp"), "撤销后回到原样");
}

// 3. Script_Main 与每帧系统（Script_FrameModes / Script_FrameSteps*）不再认识插件化的那六个测试场
{
  const frameFiles = ["Script_Main.mjs", "Script_FrameModes.mjs", "Script_FrameStepsPlayer.mjs", "Script_FrameStepsWorld.mjs", "Script_FrameStepsRules.mjs", "Script_FrameStepsPresent.mjs"];
  const main = frameFiles.map((file) => fs.readFileSync(new URL(`./${file}`, import.meta.url), "utf8")).join("\n");
  const modes = fs.readFileSync(new URL("./Script_FrameModes.mjs", import.meta.url), "utf8");
  const banned = [
    "ClothRange", "GoreRange", "ShellImpactRange", "BattleReactionRange", "MovementRange", "ExplosionRange", "WeaponRangeRuntime",
    "ClothRangeField", "GoreRangeField", "ShellImpactRangeField", "MovementRangeField", "ExplosionRangeField", "WeaponRangeField",
    "CLOTH_TEST", "GORE_TEST", "IMPACT_TEST", "REACTION_TEST", "MOVEMENT_RANGE", "EXPLOSION_TEST",
    "clothRange", "goreRange", "impactRange", "reactionRange", "movementRange", "weaponRange", "explosionRange",
    "CLOTH_RANGE_ID", "GORE_RANGE_ID", "SHELL_IMPACT_RANGE_ID", "BATTLE_REACTION_RANGE_ID", "MOVEMENT_RANGE_ID", "EXPLOSION_RANGE_ID",
  ];
  for (const name of banned) Check(!new RegExp(`\\b${name}\\b`).test(main), `Script_Main 与每帧系统不再出现 ${name}（接线在 Script_SandboxRanges）`);
  Check(/dt = ctx\.clock\.Step\(realDt\)/.test(modes), "帧头（Script_FrameModes.BeginFrame）只向玩法时钟要这一帧的时间");
  Check(!/\bdt\s*=\s*[\w.]+\.ScaleDt\(dt\)|\bdt\s*\*=/.test(main), "Script_Main 与每帧系统里不再有各自改 dt 的那几行");
}

// 4. 只接声明过的钩子；常驻取证口
{
  let current = null;
  const stubs = SandboxDebugStubs(() => current);
  Check(stubs.Explosions.State() === null, "不在爆炸场时 Debug.Explosions.State() 是 null");
  current = { id: "explosions", api: { State: () => ({ ok: 1 }), GoTo: () => "went", Reset: () => "reset" } };
  Check(stubs.Explosions.State().ok === 1 && stubs.Explosions.GoTo("a") === "went", "在爆炸场时转给插件");
  const hooks = { cloth: ["UpdateCamera"], impacts: ["ScaleDt", "CapturesInput", "ApplyCamera"], reactions: ["ScaleDt"], gore: ["ScaleDt"] };
  const source = fs.readFileSync(new URL("./Script_SandboxRanges.mjs", import.meta.url), "utf8");
  for (const plugin of SANDBOX_PLUGINS) {
    const body = source.slice(source.indexOf(`  ${plugin.id}: {`), source.indexOf("\n  },", source.indexOf(`  ${plugin.id}: {`)));
    for (const hook of ["ScaleDt", "CapturesInput", "ApplyCamera", "UpdateCamera"]) {
      const declared = new RegExp(`\\b${hook}:`).test(body);
      Check(declared === (hooks[plugin.id] || []).includes(hook), `${plugin.id}: ${declared ? "接" : "不接"} ${hook}（与改造前装配层调用的一致）`);
    }
  }
}

console.log(`[sandbox] 测试场登记表 / 插件 / 玩法时钟：${checks} 条全过（${SANDBOX_PLUGINS.length} 个测试场）`);
