// ===========================================================================
// Script_EditorBlockoutPlayPlanTest.mjs —— 白盒试玩的纯规则与提交的试玩编排（纯 node，docs/Data_EditorBlockout.md §17）
//
//   node Taierzhuang1938/Script_EditorBlockoutPlayPlanTest.mjs
//
// 覆盖：
//   1. ValidateBlockoutPlay 正反例（schema、mode、clear、push / keep、mortar、ranges 的起止）
//   2. PlayStepPlan：不写 mode 时的推断（fight / move / watch）、谁变 AI（掷弹筒组 / 翻译 / 倒地 / 战车 / keep 不变）、
//      push 按 id 与 group 认、打死的人不复活、fresh 复活、bayonet、上限、第一步不 approach、clear 的缺省
//   3. PlayStepCleared：kill all / kill n / reach / time，一个人都没放的 fight 步不卡
//   4. PlayRange、FormatPlayTime
//   5. 提交的 Blockout/*.play.json：通过校验、零警告；01–05 的五段预设都成立，打的几步都放得出人
//   6. 按键提示 hint（2026-11-02）：校验正反例、归一化、PlayHintStep 出 / 收的时机；提交的编排里 action 都在游戏键位表里；
//      06–10 巷子那一步只放窗 A、窗 B 两个、不报位置、提示是蹲下
// ===========================================================================

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NormalizeBlockout, BLOCKOUT_SCHEMA } from "./Script_EditorBlockoutConfig.mjs";
import {
  BLOCKOUT_PLAY, BLOCKOUT_PLAY_SCHEMA, ValidateBlockoutPlay, NormalizeBlockoutPlay, PlayStepPlan, PlayStepCleared, PlayRange,
  FormatPlayTime, UnitCanFight, PlayWeaponFor, NamedIn, NormalizePlayHint, PlayHintStep,
} from "./Script_EditorBlockoutPlayPlan.mjs";
import { KEYMAP, MOUSEMAP } from "./Script_Input.mjs";
import { L0610_ALLEY_WINDOWS } from "./Data_EditorBlockoutFirstLevel0610Space.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let checks = 0;
function Check(name, fn) { fn(); checks++; console.log(`ok  ${name}`); }

function Config() {
  return NormalizeBlockout({
    schema: BLOCKOUT_SCHEMA, level: "Test",
    keyframes: [
      { id: "a", stage: 1, name: "看戏", player: { x: 0, z: 0 }, units: [{ id: "Nra1", side: "nra", x: 2, z: 0 }] },
      { id: "b", stage: 1, name: "走", player: { x: 0, z: 10 }, next: { text: "去那边", x: 0, z: 30 }, units: [] },
      {
        id: "c", stage: 2, name: "打", player: { x: 0, z: 30 }, next: { text: "打回去", x: 0, z: 60 },
        units: [
          { id: "E1", side: "ija", x: 0, z: 60, group: "front" },
          { id: "E2", side: "ija", x: 4, z: 60, group: "front", role: "machineGun" },
          { id: "E3", side: "ija", x: 8, z: 60, role: "bayonet" },
          { id: "Mortar", side: "ija", x: 0, z: 120, role: "mortar" },
          { id: "Terp", side: "ija", x: 1, z: 61, role: "interpreter" },
          { id: "Dead", side: "ija", x: 2, z: 58, state: "down" },
          { id: "Tank", side: "ija", kind: "tank", x: 30, z: 70 },
          { id: "Ally", side: "nra", x: 1, z: 31 },
        ],
      },
      { id: "d", stage: 2, name: "再打", player: { x: 0, z: 40 }, units: [{ id: "E1", side: "ija", x: 0, z: 70, group: "front" }] },
    ],
  });
}

const PLAY = {
  schema: BLOCKOUT_PLAY_SCHEMA, level: "Test",
  ranges: [{ id: "fight", label: "打", from: "b", to: "d" }],
  steps: {
    a: { mode: "watch" },
    c: { push: ["front"], keep: ["E3"], mortar: { from: ["Mortar"], everyS: 5 } },
    d: { fresh: true, bayonet: true, clear: { kill: 1, time: 20 } },
  },
};

Check("校验：提交样例通过、零警告", () => {
  const r = ValidateBlockoutPlay(PLAY, { config: Config() });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
});

Check("校验：坏字段报错", () => {
  const config = Config();
  const bad = (patch) => ValidateBlockoutPlay({ ...PLAY, ...patch }, { config });
  assert.equal(bad({ schema: "x" }).ok, false);
  assert.equal(bad({ level: "Other" }).ok, false);
  assert.equal(bad({ steps: { c: { mode: "fly" } } }).ok, false);
  assert.equal(bad({ steps: { c: { clear: {} } } }).ok, false);
  assert.equal(bad({ steps: { c: { clear: { kill: 0 } } } }).ok, false);
  assert.equal(bad({ steps: { c: { clear: { reach: { x: 1 } } } } }).ok, false);
  assert.equal(bad({ steps: { c: { clear: { time: -1 } } } }).ok, false);
  assert.equal(bad({ steps: { c: { clear: { wait: 3 } } } }).ok, false);
  assert.equal(bad({ steps: { c: { push: "front" } } }).ok, false);
  assert.equal(bad({ steps: { c: { mortar: { from: [] } } } }).ok, false);
  assert.equal(bad({ steps: { c: { fresh: "yes" } } }).ok, false);
  assert.equal(bad({ steps: { zz: { mode: "fight" } } }).ok, false, "不存在的关键帧");
  assert.equal(bad({ ranges: [{ id: "r", label: "r", from: "d", to: "b" }] }).ok, false, "to 在 from 前面");
  assert.equal(bad({ ranges: [{ id: "r", label: "r", from: "a", to: "nope" }] }).ok, false);
  assert.equal(bad({ defaults: { previz: 1 } }).ok, false);
  // 点名对不上只警告
  const warn = bad({ steps: { c: { push: ["Nobody"] } } });
  assert.equal(warn.ok, true);
  assert.equal(warn.warnings.length, 1);
});

Check("按键提示：校验与归一化", () => {
  const config = Config();
  const withHint = (hint) => ValidateBlockoutPlay({ ...PLAY, steps: { ...PLAY.steps, b: { hint } } }, { config });
  assert.deepEqual(withHint({ action: "crouch", text: "蹲下", until: "crouch" }).errors, []);
  assert.deepEqual(withHint({ keys: "C", text: "蹲下", at: { x: 0, z: 12, r: 4 }, showS: 5 }).errors, []);
  assert.equal(withHint("蹲下").ok, false, "要是对象");
  assert.equal(withHint({ action: "crouch" }).ok, false, "没有字");
  assert.equal(withHint({ text: "蹲下" }).ok, false, "action / keys 都没有");
  assert.equal(withHint({ action: "", keys: "C", text: "蹲下" }).ok, false, "action 空串");
  assert.equal(withHint({ action: "crouch", text: "蹲下", until: "sit" }).ok, false);
  assert.equal(withHint({ action: "crouch", text: "蹲下", at: { x: 1 } }).ok, false);
  assert.equal(withHint({ action: "crouch", text: "蹲下", at: { x: 1, z: 2, r: 0 } }).ok, false);
  assert.equal(withHint({ action: "crouch", text: "蹲下", showS: -1 }).ok, false);
  assert.equal(withHint({ action: "crouch", text: "蹲下", when: "now" }).ok, false, "不认识的字段");
  assert.equal(NormalizePlayHint(null), null);
  assert.equal(NormalizePlayHint({ text: "x" }), null);
  assert.deepEqual(NormalizePlayHint({ action: "crouch", text: " 蹲下 ", at: { x: 1, z: 2 } }),
    { action: "crouch", keys: null, text: "蹲下", at: { x: 1, z: 2, r: BLOCKOUT_PLAY.reachM }, until: null, showS: BLOCKOUT_PLAY.hintS });
  const plan = PlayStepPlan(config, 1, NormalizeBlockoutPlay({ ...PLAY, steps: { b: { hint: { keys: "C", text: "蹲下" } } } }));
  assert.equal(plan.hint.keys, "C");
  assert.equal(PlayStepPlan(config, 1, NormalizeBlockoutPlay(PLAY)).hint, null, "不写就没有");
});

Check("face：这一步放兵时改朝向，不动关键帧", () => {
  const config = Config();
  const doc = { ...PLAY, steps: { ...PLAY.steps, c: { ...PLAY.steps.c, face: { E1: -90 } } } };
  assert.deepEqual(ValidateBlockoutPlay(doc, { config }).errors, []);
  const c = PlayStepPlan(config, 2, NormalizeBlockoutPlay(doc));
  assert.equal(c.ai.find(a => a.id === "E1").yawDeg, -90);
  assert.equal(c.ai.find(a => a.id === "E2").yawDeg, 0, "没写的照关键帧");
  assert.equal(config.keyframes[2].units.find(u => u.id === "E1").yawDeg ?? 0, 0, "关键帧没被改");
  assert.equal(ValidateBlockoutPlay({ ...doc, steps: { c: { face: { E1: "east" } } } }, { config }).ok, false);
  assert.equal(ValidateBlockoutPlay({ ...doc, steps: { c: { face: [90] } } }, { config }).ok, false);
  assert.equal(ValidateBlockoutPlay({ ...doc, steps: { c: { face: { Nobody: 0 } } } }, { config }).warnings.length, 1, "点名对不上只警告");
});

Check("按键提示：出 / 收的时机", () => {
  const at = (x, z) => ({ x, z });
  const D = BLOCKOUT_PLAY.hintDoneS, M = BLOCKOUT_PLAY.hintMinS;
  assert.ok(M > D, "至少出的秒数要比「蹲够」长，不然蹲着开打的人只看到一闪");
  // 不写 at：开打才出；until 的姿势摆好够 hintDoneS、出满 hintMinS 才收；中间站起来重新数
  const crouch = NormalizePlayHint({ action: "crouch", text: "蹲下", until: "crouch" });
  let s = { phase: "wait" };
  assert.equal(PlayHintStep(crouch, s, { dt: 0.1, engaged: false, player: at(0, 0), stance: "stand" }), false, "approach 段不出");
  assert.equal(PlayHintStep(crouch, s, { dt: 0.1, engaged: true, player: at(0, 0), stance: "stand" }), true);
  assert.equal(PlayHintStep(crouch, s, { dt: D * 0.6, engaged: true, stance: "crouch" }), true, "刚蹲下还留着");
  assert.ok(s.doneT > 0, "蹲下了：「对了」");
  assert.equal(PlayHintStep(crouch, s, { dt: 0.1, engaged: true, stance: "stand" }), true, "又站起来");
  assert.equal(s.doneT, 0, "站起来重新数");
  assert.equal(PlayHintStep(crouch, s, { dt: M, engaged: true, stance: "stand" }), true, "一直站着就一直出");
  PlayHintStep(crouch, s, { dt: D * 0.6, engaged: true, stance: "crouch" });
  assert.equal(PlayHintStep(crouch, s, { dt: D * 0.6, engaged: true, stance: "crouch" }), false, "蹲够了收");
  assert.equal(s.phase, "off");
  assert.equal(PlayHintStep(crouch, s, { dt: 0.1, engaged: true, stance: "stand" }), false, "一步只出一次");
  // 一开打就蹲着（关键帧把人摆成蹲姿）：照样出，出满 hintMinS 才收
  s = { phase: "wait" };
  assert.equal(PlayHintStep(crouch, s, { dt: 0.1, engaged: true, stance: "crouch" }), true, "蹲着开打也出");
  assert.equal(PlayHintStep(crouch, s, { dt: D + 0.1, engaged: true, stance: "crouch" }), true, "蹲够了但没出满还留着");
  assert.equal(PlayHintStep(crouch, s, { dt: M, engaged: true, stance: "crouch" }), false, "出满收");
  // 写了 at：走进那一圈才出（approach 段也算）；不写 until 就出 showS 秒
  const area = NormalizePlayHint({ keys: "G", text: "扔", at: { x: 10, z: 0, r: 2 }, showS: 3 });
  s = { phase: "wait" };
  assert.equal(PlayHintStep(area, s, { dt: 0.1, engaged: true, player: at(0, 0), stance: "stand" }), false, "圈外不出");
  assert.equal(PlayHintStep(area, s, { dt: 0.1, engaged: false, player: at(9, 0), stance: "stand" }), true, "approach 段走进圈也出");
  assert.equal(PlayHintStep(area, s, { dt: 2.5, engaged: true, player: at(0, 0), stance: "stand" }), true, "出了就不看人在哪");
  assert.equal(PlayHintStep(area, s, { dt: 0.5, engaged: true, player: at(0, 0), stance: "stand" }), false, "showS 到了收");
  assert.equal(PlayHintStep(null, { phase: "wait" }, { dt: 0.1, engaged: true }), false);
});

Check("推断：watch / move / fight", () => {
  const config = Config(), play = NormalizeBlockoutPlay(null);
  assert.equal(PlayStepPlan(config, 0, play).mode, "watch");
  assert.equal(PlayStepPlan(config, 1, play).mode, "move");
  const c = PlayStepPlan(config, 2, play);
  assert.equal(c.mode, "fight");
  assert.deepEqual(c.clear, { kill: "all", reach: null, time: null });
  const b = PlayStepPlan(config, 1, play);
  assert.deepEqual(b.clear.reach, { x: 0, z: 30, r: 3 });
});

Check("谁变 AI：掷弹筒组 / 翻译 / 倒地 / 战车 / 友军 / keep 不变", () => {
  const config = Config(), play = NormalizeBlockoutPlay(PLAY);
  const c = PlayStepPlan(config, 2, play);
  assert.deepEqual(c.ai.map(a => a.id), ["E1", "E2"]);
  assert.equal(c.ai[0].order, "advance", "push 按 group 认");
  assert.equal(c.ai[1].weapon, "Type11", "机枪手给十一式");
  assert.equal(c.ai[0].weapon, "Type38");
  assert.equal(c.mortar.everyS, 5);
  assert.equal(c.mortar.firstS, BLOCKOUT_PLAY.mortarFirstS);
  assert.ok(c.aiIds.has("E1") && !c.aiIds.has("E3"));
  assert.equal(UnitCanFight(config.keyframes[2].units.find(u => u.id === "Mortar")), false);
  assert.equal(UnitCanFight(config.keyframes[2].units.find(u => u.id === "Tank")), false);
  assert.equal(UnitCanFight(config.keyframes[2].units.find(u => u.id === "Dead")), false);
  assert.equal(UnitCanFight(config.keyframes[2].units.find(u => u.id === "Ally")), false);
  assert.equal(NamedIn(["E1"], { id: "E1" }), true);
  assert.equal(NamedIn(["front"], { id: "X", group: "front" }), true);
  assert.equal(PlayWeaponFor({ weapon: "HanYang" }), "Type38", "国军的枪不给日军 AI");
});

Check("打死的不复活；fresh 复活；bayonet；第一步不 approach", () => {
  const config = Config(), play = NormalizeBlockoutPlay(PLAY);
  const killed = new Set(["E1", "E2"]);
  assert.deepEqual(PlayStepPlan(config, 2, play, { killed }).ai.map(a => a.id), []);
  const d = PlayStepPlan(config, 3, play, { killed });
  assert.deepEqual(d.ai.map(a => a.id), ["E1"], "fresh 步照样放");
  assert.equal(d.ai[0].bayonet, true);
  assert.deepEqual(d.clear, { kill: 1, reach: null, time: 20 });
  assert.equal(PlayStepPlan(config, 2, play, { first: true }).approach, false);
  assert.equal(PlayStepPlan(config, 2, play).approach, true);
  // 打的人都死光、又只有 kill 条件：直接过，不卡住
  const empty = PlayStepPlan(config, 2, NormalizeBlockoutPlay(null), { killed: new Set(["E1", "E2", "E3"]) });
  assert.equal(empty.clear.kill, 0);
  assert.equal(PlayStepCleared(empty.clear, { kills: 0, spawned: 0, alive: 0, elapsedS: 0, player: { x: 0, z: 0 } }), "kill");
});

Check("一步放 AI 有上限", () => {
  const units = [];
  for (let i = 0; i < BLOCKOUT_PLAY.maxAiPerStep + 5; i++) units.push({ id: `E${i}`, side: "ija", x: i, z: 50 });
  const config = NormalizeBlockout({ schema: BLOCKOUT_SCHEMA, level: "T", keyframes: [{ id: "a", stage: 1, name: "a", player: { x: 0, z: 0 }, units }] });
  assert.equal(PlayStepPlan(config, 0, NormalizeBlockoutPlay(null)).ai.length, BLOCKOUT_PLAY.maxAiPerStep);
});

Check("过关判断", () => {
  const at = (x, z) => ({ x, z });
  assert.equal(PlayStepCleared({ kill: "all" }, { kills: 2, spawned: 3, alive: 1, elapsedS: 5, player: at(0, 0) }), null);
  assert.equal(PlayStepCleared({ kill: "all" }, { kills: 3, spawned: 3, alive: 0, elapsedS: 5, player: at(0, 0) }), "kill");
  assert.equal(PlayStepCleared({ kill: 2 }, { kills: 2, spawned: 5, alive: 3, elapsedS: 5, player: at(0, 0) }), "kill");
  assert.equal(PlayStepCleared({ kill: null, reach: { x: 10, z: 0, r: 2 } }, { kills: 0, spawned: 0, alive: 0, elapsedS: 0, player: at(8.5, 0) }), "reach");
  assert.equal(PlayStepCleared({ kill: null, reach: { x: 10, z: 0, r: 2 } }, { kills: 0, spawned: 0, alive: 0, elapsedS: 0, player: at(7, 0) }), null);
  assert.equal(PlayStepCleared({ kill: null, time: 30 }, { kills: 0, spawned: 4, alive: 4, elapsedS: 30.1, player: at(0, 0) }), "time");
  assert.equal(PlayStepCleared({ kill: "all", time: 30 }, { kills: 1, spawned: 4, alive: 3, elapsedS: 12, player: at(0, 0) }), null);
});

Check("段落与时间格式", () => {
  const config = Config();
  assert.deepEqual(PlayRange(config, "b", "d"), [1, 2, 3]);
  assert.deepEqual(PlayRange(config, 2), [2, 3]);
  assert.deepEqual(PlayRange(config, "d", "b"), []);
  assert.deepEqual(PlayRange(config, "zz"), []);
  assert.equal(FormatPlayTime(65.4), "1:05");
  assert.equal(FormatPlayTime(0), "0:00");
});

Check("提交的试玩编排：通过校验、零警告，预设都成立，打的几步放得出人", () => {
  const dir = path.join(HERE, "Blockout");
  const files = fs.readdirSync(dir).filter(name => name.endsWith(".play.json"));
  assert.ok(files.includes("FirstLevel0105.play.json") && files.includes("FirstLevel0107.play.json"));
  for (const name of files) {
    const level = name.replace(/\.play\.json$/, "");
    const config = NormalizeBlockout(JSON.parse(fs.readFileSync(path.join(dir, `${level}.json`), "utf8")));
    const doc = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    const check = ValidateBlockoutPlay(doc, { config });
    assert.deepEqual(check.errors, [], `${name} 有错`);
    assert.deepEqual(check.warnings, [], `${name} 有警告`);
    const play = NormalizeBlockoutPlay(doc);
    for (const range of play.ranges) assert.ok(PlayRange(config, range.from, range.to).length > 0, `${name} 的 ${range.id}`);
    for (const [id, step] of Object.entries(play.steps)) {
      const index = config.keyframes.findIndex(k => k.id === id);
      const plan = PlayStepPlan(config, index, play);
      if (step.mode === "fight") assert.ok(plan.ai.length > 0, `${name} ${id} 是 fight 但一个 AI 都没有`);
      if (plan.clear.reach) assert.ok(Number.isFinite(plan.clear.reach.x), `${name} ${id} 的 reach 有坐标`);
    }
  }
  // 01–05：每个关键帧都写了怎么打
  const config = NormalizeBlockout(JSON.parse(fs.readFileSync(path.join(dir, "FirstLevel0105.json"), "utf8")));
  const play = NormalizeBlockoutPlay(JSON.parse(fs.readFileSync(path.join(dir, "FirstLevel0105.play.json"), "utf8")));
  assert.deepEqual(config.keyframes.map(k => k.id).filter(id => !play.steps[id]), []);
  const pit = PlayStepPlan(config, config.keyframes.findIndex(k => k.id === "03-3"), play);
  assert.ok(pit.ai.length >= 20, `03-3 放 ${pit.ai.length} 个`);
  assert.ok(pit.ai.every(a => !/Mortar/.test(a.id)), "掷弹筒组不变 AI");
  assert.ok(pit.mortar, "03-3 有掷弹筒");
});

Check("提交的试玩编排：按键提示的动作都在键位表里；06–10 巷子那一步是潜行", () => {
  const dir = path.join(HERE, "Blockout");
  const actions = new Set([...KEYMAP, ...MOUSEMAP].map(row => row.action));
  for (const name of fs.readdirSync(dir).filter(n => n.endsWith(".play.json"))) {
    const doc = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    for (const [id, step] of Object.entries(doc.steps || {})) {
      if (step.hint?.action) assert.ok(actions.has(step.hint.action), `${name} ${id} 的 hint.action ${step.hint.action} 不在键位表里`);
    }
  }
  const config = NormalizeBlockout(JSON.parse(fs.readFileSync(path.join(dir, "FirstLevel0610.json"), "utf8")));
  const play = NormalizeBlockoutPlay(JSON.parse(fs.readFileSync(path.join(dir, "FirstLevel0610.play.json"), "utf8")));
  const alley = PlayStepPlan(config, config.keyframes.findIndex(k => k.id === "09-1"), play);
  assert.equal(alley.mode, "fight");
  assert.deepEqual(alley.ai.map(a => a.id).sort(), ["NextDoorIja1", "NextDoorIja2"], "只放窗 A、窗 B 里那两个");
  assert.ok(alley.ai.every(a => a.order === "hold"), "守在屋里，不往外压");
  assert.equal(alley.alert, false, "不报位置：得自己看见");
  assert.equal(alley.hint?.action, "crouch");
  assert.equal(alley.hint.until, "crouch");
  assert.ok(alley.clear.reach && alley.clear.kill === null, "走到豁口就过，不用打");
  // 豁口在两扇窗南边：从巷子口走过去一定经过两扇窗
  const windows = alley.ai.map(a => config.keyframes.find(k => k.id === "09-1").units.find(u => u.id === a.id));
  const start = config.keyframes.find(k => k.id === "09-1").player;
  for (const w of windows) assert.ok(w.z > start.z && w.z < alley.clear.reach.z + 1, `${w.id} 在巷子口和豁口之间`);
  // 两个人都看着自己那扇窗（AI 的正面 = (−sin yaw, −cos yaw)，同关键帧口径）：不看窗，站着走过去也没人发现，「蹲下」就教不成
  for (const [unitId, win] of [["NextDoorIja2", L0610_ALLEY_WINDOWS.A], ["NextDoorIja1", L0610_ALLEY_WINDOWS.B]]) {
    const a = alley.ai.find(x => x.id === unitId), yaw = a.yawDeg * Math.PI / 180;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), hx = win.x - a.x, hz = win.z - a.z, hl = Math.hypot(hx, hz);
    const deg = Math.acos((fx * hx + fz * hz) / hl) * 180 / Math.PI;
    assert.ok(deg < 30, `${unitId} 朝向偏开窗 ${win.id} ${deg.toFixed(0)}°`);
  }
});

console.log(`EditorBlockoutPlayPlanTest 通过：${checks} 组检查`);
