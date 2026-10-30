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
// ===========================================================================

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NormalizeBlockout, BLOCKOUT_SCHEMA } from "./Script_EditorBlockoutConfig.mjs";
import {
  BLOCKOUT_PLAY, BLOCKOUT_PLAY_SCHEMA, ValidateBlockoutPlay, NormalizeBlockoutPlay, PlayStepPlan, PlayStepCleared, PlayRange,
  FormatPlayTime, UnitCanFight, PlayWeaponFor, NamedIn,
} from "./Script_EditorBlockoutPlayPlan.mjs";

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
  assert.ok(files.includes("FirstLevel0105.play.json"));
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

console.log(`EditorBlockoutPlayPlanTest 通过：${checks} 组检查`);
