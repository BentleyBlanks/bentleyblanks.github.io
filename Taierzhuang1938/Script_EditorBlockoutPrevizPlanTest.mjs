// Script_EditorBlockoutPrevizPlanTest.mjs —— 预演规则（Script_EditorBlockoutPrevizPlan，§14.1）的纯 node 测试。
// 跑法：node Taierzhuang1938/Script_EditorBlockoutPrevizPlanTest.mjs
// 钉住：校验器正反例（中文路径）、归一化、演员取样（位置键 = 到达时刻、途经点、move、朝向、阶跃字段、片段秒数 / 停帧）、
// 镜头取样（eye 与 from/look、ease、空档沿用）、序列时长、遮罩与信号；仓库里有预演文件时它要过校验。

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BLOCKOUT_PREVIZ_SCHEMA, ValidateBlockoutPreviz, NormalizeBlockoutPreviz, SamplePrevizActor, SamplePrevizCamera,
  PrevizSequenceDuration, PrevizOverlays, PrevizActiveLines, PrevizSignalsAt, PREVIZ_MOVE_SPEED, PREVIZ_EYE_HEIGHT, PrevizShakeOffset,
  BlockStandSampler,
} from "./Script_EditorBlockoutPrevizPlan.mjs";
import { NormalizeBlockout } from "./Script_EditorBlockoutConfig.mjs";

const ReadText = (file) => readFileSync(file, "utf8");
const projectDir = path.dirname(fileURLToPath(import.meta.url));
let passed = 0;
function Test(name, fn) {
  try { fn(); passed++; console.log(`ok   ${name}`); }
  catch (error) { console.log(`FAIL ${name}\n     ${error.message}`); process.exitCode = 1; }
}
const Near = (a, b, eps = 1e-6, what = "") => assert.ok(Math.abs(a - b) <= eps, `${what} ${a} ≠ ${b}（±${eps}）`);

const config = NormalizeBlockout({
  schema: "tengxian-blockout/1", level: "Test", title: "t",
  keyframes: [
    { id: "01-1", stage: 1, name: "a", player: { x: 0, z: 0, yawDeg: 0 }, units: [
      { id: "Luo", side: "nra", x: 0, z: 0, yawDeg: 90, stance: "stand" },
      { id: "Dong", side: "nra", x: 5, z: 0, yawDeg: 0, stance: "crouch" },
    ] },
    { id: "01-2", stage: 1, name: "b", player: { x: 10, z: 0 }, units: [] },
  ],
});
const voice = { schema: "tengxian-blockout-voice/1", scenes: [{ id: "S", lines: [{ id: "S.01", who: "luo", speaker: "罗班长", subtitle: "走！", durationS: 1.5 }] }] };
const goodDoc = {
  schema: BLOCKOUT_PREVIZ_SCHEMA, level: "Test", voice: "./v.json",
  sequences: [{
    keyframe: "01-1", title: "测试", then: "next",
    camera: [
      { t: 0, dur: 2, eye: { stance: "crouch", yawDeg: 0, toYawDeg: 90 } },
      { t: 3, dur: 2, from: { x: 0, z: 10, h: 2 }, to: { x: 10, z: 10, h: 2 }, look: { actor: "Luo", offset: [0, 1, 0] }, fov: 40, ease: "linear" },
    ],
    actors: [
      { id: "Luo", keys: [{ t: 1, faceTo: "player" }, { t: 10, x: 0, z: -7, move: "walk" }] },
      { id: "Dong", keys: [{ t: 0, clip: "WoundedSitRifleIdle", clipFrom: 0.5 }, { t: 2, stance: "prone", clip: "ShotCollapse", clipHold: true }] },
      { id: "Extra", spawn: { side: "nra", kind: "soldier", x: 3, z: 3 }, keys: [{ t: 0, visible: false }, { t: 4, visible: true }] },
    ],
    lines: [{ t: 1.2, line: "S.01", actor: "Luo" }],
    events: [
      { t: 6, type: "flash", dur: 0.5 }, { t: 6.1, type: "signal", name: "DugoutCollapsed", on: true },
      { t: 6.2, type: "black", dur: 4, fade: 0.2 }, { t: 7, type: "sfx", name: "tinnitus" }, { t: 7, type: "caption", text: "（耳鸣）", dur: 2 },
    ],
  }],
};

Test("校验：合法文件通过（带配置与清单）", () => {
  const r = ValidateBlockoutPreviz(goodDoc, { config, voice });
  assert.ok(r.ok, r.errors.join("；"));
});

Test("校验：错误带中文路径", () => {
  const bad = JSON.parse(JSON.stringify(goodDoc));
  bad.sequences[0].actors[0].keys[1].t = -1;
  bad.sequences[0].actors[0].keys.push({ t: 3, x: 1 });
  bad.sequences[0].camera[1].look = { actor: "Nobody" };
  bad.sequences[0].lines[0].line = "S.99";
  bad.sequences[0].events.push({ t: 1, type: "boom" });
  bad.sequences[0].then = "99-9";
  bad.sequences.push({ keyframe: "01-1" });
  bad.sequences.push({ keyframe: "77-7" });
  const r = ValidateBlockoutPreviz(bad, { config, voice });
  const all = r.errors.join("\n");
  assert.ok(!r.ok);
  for (const want of ["sequences[0].actors[0].keys[1].t", "sequences[0].actors[0].keys[2] 的 x / z 要同时给", "sequences[0].camera[1].look.actor",
    "sequences[0].lines[0].line 在台词清单里找不到", "sequences[0].events[5].type", "sequences[0].then 在配置里找不到", "sequences[1].keyframe 重复",
    "sequences[2].keyframe 在配置里找不到"]) assert.ok(all.includes(want), `缺：${want}\n${all}`);
});

Test("校验：没 spawn 的生人报错、spawn 重名报错、未知音效别名只是警告", () => {
  const bad = JSON.parse(JSON.stringify(goodDoc));
  bad.sequences[0].actors.push({ id: "Ghost", keys: [] }, { id: "Dong2", spawn: { x: 1, z: 1 }, keys: [] });
  bad.sequences[0].actors[1].spawn = { x: 0, z: 0 };
  bad.sequences[0].events.push({ t: 1, type: "sfx", name: "kazoo" });
  const r = ValidateBlockoutPreviz(bad, { config });
  assert.ok(r.errors.some(e => e.includes("actors[3].id 在关键帧 01-1 里找不到")), r.errors.join("\n"));
  assert.ok(r.errors.some(e => e.includes("actors[1].spawn 的 id 与关键帧里的单位重名")), r.errors.join("\n"));
  assert.ok(r.warnings.some(w => w.includes("kazoo")));
});

Test("归一化：按 t 排序、then 缺省 next、fov / ease 缺省", () => {
  const doc = JSON.parse(JSON.stringify(goodDoc));
  delete doc.sequences[0].then;
  doc.sequences[0].events.reverse();
  doc.sequences[0].camera[0].fov = undefined;
  const n = NormalizeBlockoutPreviz(doc);
  const seq = n.sequences[0];
  assert.equal(seq.then, "next");
  assert.deepEqual(seq.events.map(e => e.t), [6, 6.1, 6.2, 7, 7].sort((a, b) => a - b));
  assert.equal(seq.camera[0].fov, 60);
  assert.equal(seq.camera[0].ease, "inOut");
  assert.equal(seq.camera[1].ease, "linear");
  assert.equal(n.voice, "./v.json");
});

const seq = NormalizeBlockoutPreviz(goodDoc).sequences[0];
const base = (id) => config.keyframes[0].units.find(u => u.id === id);
const resolve = (id) => (id === "player" ? { x: 0, z: 5 } : base(id));

Test("演员：位置键的 t 是到达时刻，按 walk 速度倒推出发", () => {
  const luo = seq.actors[0];
  const travel = 7 / PREVIZ_MOVE_SPEED.walk;   // 5 s
  const depart = 10 - travel;
  const before = SamplePrevizActor(luo, depart - 0.01, base("Luo"), { resolve });
  Near(before.x, 0); Near(before.z, 0); assert.equal(before.moving, false);
  const mid = SamplePrevizActor(luo, depart + travel / 2, base("Luo"), { resolve });
  Near(mid.z, -3.5, 1e-6, "中途 z"); assert.equal(mid.moving, true); Near(mid.speedMps, PREVIZ_MOVE_SPEED.walk, 1e-6, "速度");
  Near(mid.yawDeg, 0, 1e-6, "走动朝行进方向（北）");
  const end = SamplePrevizActor(luo, 11, base("Luo"), { resolve });
  Near(end.z, -7); assert.equal(end.moving, false);
});

Test("演员：faceTo player 转过去（0.4 s 转身），之前是布设朝向", () => {
  const luo = seq.actors[0];
  Near(SamplePrevizActor(luo, 0.5, base("Luo"), { resolve }).yawDeg, 90);
  // player 在 (0,5)：正南 = 180
  Near(Math.abs(SamplePrevizActor(luo, 2, base("Luo"), { resolve }).yawDeg), 180);
  const turning = SamplePrevizActor(luo, 1.2, base("Luo"), { resolve }).yawDeg;
  assert.ok(turning > 90 && turning < 180, `转身中 ${turning}`);
});

Test("演员：窗口不够时从上一个位置键起匀速赶到；途经点；cut 瞬移；drag 倒着走", () => {
  const entry = { id: "Luo", keys: [{ t: 0, x: 0, z: 0 }, { t: 2, x: 10, z: 0, move: "run", path: [{ x: 0, z: 10 }, { x: 10, z: 10 }] }, { t: 3, x: 50, z: 50, move: "cut" }] };
  const a = SamplePrevizActor(entry, 1, base("Luo"));
  Near(a.x, 5); Near(a.z, 10, 1e-6, "走了一半（30 m 路走 15 m，在第二段途经边中点）");
  Near(a.speedMps, 15);
  assert.equal(a.move, "run");
  const b = SamplePrevizActor(entry, 2.99, base("Luo"));
  Near(b.x, 10); Near(b.z, 0);
  const c = SamplePrevizActor(entry, 3, base("Luo"));
  Near(c.x, 50); Near(c.z, 50);
  const drag = { id: "Luo", keys: [{ t: 4, x: 0, z: -4, move: "drag" }] };
  const d = SamplePrevizActor(drag, 3, base("Luo"));
  assert.equal(d.moving, true);
  Near(Math.abs(d.yawDeg), 180, 1e-6, "倒拖：朝向与行进相反");
  const crawl = { id: "Luo", keys: [{ t: 20, x: 0, z: -1, move: "crawl" }] };
  assert.equal(SamplePrevizActor(crawl, 19, base("Luo")).stance, "prone");
});

Test("演员：阶跃字段、片段秒数 = t − 键 t + clipFrom，clipHold 停最后一帧，不停的播完回原生", () => {
  const dong = seq.actors[1];
  const a = SamplePrevizActor(dong, 1, base("Dong"), { clipDuration: () => 3 });
  assert.equal(a.stance, "crouch"); assert.equal(a.clip, "WoundedSitRifleIdle"); Near(a.clipSeconds, 1.5);
  const b = SamplePrevizActor(dong, 2.5, base("Dong"), { clipDuration: (c) => (c === "ShotCollapse" ? 1.6 : 3) });
  assert.equal(b.stance, "prone"); assert.equal(b.clip, "ShotCollapse"); Near(b.clipSeconds, 0.5); assert.equal(b.clipHold, true);
  const c = SamplePrevizActor(dong, 9, base("Dong"), { clipDuration: () => 1.6 });
  Near(c.clipSeconds, 1.6);
  const once = { id: "Dong", keys: [{ t: 0, clip: "X" }] };
  assert.equal(SamplePrevizActor(once, 5, base("Dong"), { clipDuration: () => 2 }).clip, null);
  const extra = seq.actors[2];
  assert.equal(SamplePrevizActor(extra, 1, null).visible, false);
  const e = SamplePrevizActor(extra, 5, null);
  assert.equal(e.visible, true); Near(e.x, 3); Near(e.z, 3);
});

Test("演员：同一 t 两次取样结果一样（确定性）", () => {
  for (const t of [0, 1.234, 5.5, 9.99]) assert.deepEqual(SamplePrevizActor(seq.actors[0], t, base("Luo"), { resolve }), SamplePrevizActor(seq.actors[0], t, base("Luo"), { resolve }));
});

const camResolve = (a) => {
  if (a.actor === "player") return { x: 0, y: (a.offset?.[1] ?? 0), z: 0, yawDeg: 0, pitchDeg: 0 };
  if (a.actor) { const u = base(a.actor); return { x: u.x + (a.offset?.[0] ?? 0), y: (a.offset?.[1] ?? 0), z: u.z + (a.offset?.[2] ?? 0) }; }
  return { x: a.x, y: a.h ?? 1.6, z: a.z };
};

Test("镜头：eye 按姿态定眼高、这一条里转头（ease inOut）", () => {
  const a = SamplePrevizCamera(seq.camera, 0, camResolve);
  Near(a.position.y, PREVIZ_EYE_HEIGHT.crouch); Near(a.yawDeg, 0); assert.equal(a.eye, true);
  Near(SamplePrevizCamera(seq.camera, 1, camResolve).yawDeg, 45, 1e-6, "中点（smoothstep 0.5 = 0.5）");
  Near(SamplePrevizCamera(seq.camera, 0.5, camResolve).yawDeg, 90 * 0.15625, 1e-6, "inOut 前段慢");
});

Test("镜头：空档沿用上一条最后一帧；from/to + look，linear；fov", () => {
  const gap = SamplePrevizCamera(seq.camera, 2.5, camResolve);
  Near(gap.yawDeg, 90);
  const b = SamplePrevizCamera(seq.camera, 4, camResolve);
  Near(b.position.x, 5); Near(b.position.y, 2); Near(b.position.z, 10);
  Near(b.fov, 40); assert.equal(b.index, 1);
  // 看向罗班长 (0,1,0)：从 (5,2,10) 看过去，dx=-5 dz=-10 → yaw = atan2(5,10)
  Near(b.yawDeg, Math.atan2(5, 10) * 180 / Math.PI, 1e-6, "朝向");
  assert.ok(b.pitchDeg < 0, "俯视");
  const after = SamplePrevizCamera(seq.camera, 99, camResolve);
  Near(after.position.x, 10);
  assert.equal(SamplePrevizCamera([], 1, camResolve), null);
});

Test("时长：durationS 优先；否则取各轨最晚结束（台词按清单时长）", () => {
  assert.equal(PrevizSequenceDuration({ ...seq, durationS: 41.5 }), 41.5);
  Near(PrevizSequenceDuration(seq, { lineDuration: () => 1.5 }), 10.2, 1e-9, "black 6.2 + 4");
  Near(PrevizSequenceDuration({ camera: [], actors: [], lines: [{ t: 3, line: "a" }], events: [] }, { lineDuration: () => 5 }), 8);
});

Test("遮罩：白光渐退、黑场渐入渐出、说明字、震屏偏移确定；台词窗口；信号", () => {
  Near(PrevizOverlays(seq, 6).flash, 1); Near(PrevizOverlays(seq, 6.25).flash, 0.5);
  Near(PrevizOverlays(seq, 6.3).black, 0.5); Near(PrevizOverlays(seq, 8).black, 1); Near(PrevizOverlays(seq, 10.1).black, 0.5);
  assert.deepEqual(PrevizOverlays(seq, 7.5).captions, ["（耳鸣）"]);
  assert.deepEqual(PrevizShakeOffset(0.5, 3.3), PrevizShakeOffset(0.5, 3.3));
  const L = (id) => (id === "S.01" ? 1.5 : 2);
  assert.equal(PrevizActiveLines(seq, 1.1, L).length, 0);
  assert.equal(PrevizActiveLines(seq, 2.5, L)[0].line, "S.01");
  assert.equal(PrevizActiveLines(seq, 3.1, L).length, 0);
  assert.equal(PrevizSignalsAt(seq, 6).size, 0);
  assert.equal(PrevizSignalsAt(seq, 6.1).get("DugoutCollapsed"), true);
});

Test("站人取地：高度场 + 一步能踩上的实心块顶面（按 ry 判脚印），高块 / 不在场的 gate / 非实心不算", () => {
  const base = () => -1.24;
  const blocks = [
    { id: "PitFireStep", x: 0, z: -9, w: 7.1, d: 1.1, h: 0.7, y: -1.24 + 0.35, solid: true },
    { id: "Roof", x: 10, z: 0, w: 4, d: 4, h: 0.4, y: 1.2, solid: true },            // 顶面 1.4，比地面高 2.64：不算
    { id: "Rot", x: 20, z: 0, w: 4, d: 0.5, h: 0.5, ry: Math.PI / 2, solid: true },   // 转 90°：脚印沿 z 方向 4 m
    { id: "Ghost", x: 30, z: 0, w: 2, d: 2, h: 0.5, solid: false },
  ];
  const gates = [{ id: "Lip", x: 40, z: 0, w: 2, d: 2, h: 0.5, solid: true, signal: "PitShelled" },
    { id: "Wreck", x: 50, z: 0, w: 2, d: 2, h: 0.5, solid: true, appearSignal: "TankDisabled" }];
  let on = new Set();
  const at = BlockStandSampler(blocks, gates, base, (n) => on.has(n));
  Near(at(0.8, -9.2), -0.54, 1e-9, "甲位站在射击台上"); Near(at(0.8, -10), -1.24, 1e-9, "台子外是坑底");
  Near(at(10, 0), -1.24, 1e-9, "洞顶不算"); Near(at(20, 1.8), -0.74, 1e-9, "转过的块按脚印"); Near(at(21.8, 0), -1.24, 1e-9, "转过的块外面");
  Near(at(30, 0), -1.24); Near(at(40, 0), -0.74, 1e-9, "坑沿没炸前算（没写 y：高度场 + h）"); Near(at(50, 0), -1.24, 1e-9, "残骸没出现前不算");
  on = new Set(["PitShelled", "TankDisabled"]);
  Near(at(40, 0), -1.24, 1e-9, "坑沿炸了不算"); Near(at(50, 0), -0.74, 1e-9, "残骸出现后算");
});

// 2026-10-18：lie（倒地怎么躺）与 weapon（手里换武器）是阶跃键
Test("lie / weapon 键：校验、阶跃、缺省", () => {
  const bad = ValidateBlockoutPreviz({ schema: BLOCKOUT_PREVIZ_SCHEMA, level: "Test", sequences: [{ keyframe: "01-1",
    actors: [{ id: "Luo", keys: [{ t: 0, lie: "across" }, { t: 1, weapon: 3 }, { t: 2, weapon: "" }] }] }] }, { config });
  assert.ok(bad.errors.some(e => e.includes("keys[0].lie")), bad.errors.join("; "));
  assert.ok(bad.errors.some(e => e.includes("keys[1].weapon")) && bad.errors.some(e => e.includes("keys[2].weapon")), bad.errors.join("; "));
  const ok = ValidateBlockoutPreviz({ schema: BLOCKOUT_PREVIZ_SCHEMA, level: "Test", sequences: [{ keyframe: "01-1",
    actors: [{ id: "Luo", keys: [{ t: 0, lie: "along", weapon: "Dadao" }, { t: 1, weapon: null }, { t: 2, lie: null, weapon: "HanYang" }] }] }] }, { config });
  assert.ok(ok.ok, ok.errors.join("; "));
  const entry = { id: "Luo", keys: [{ t: 1, weapon: "Dadao", state: "down", lie: "along" }, { t: 3, weapon: "HanYang" }, { t: 4, lie: null }] };
  const base = config.keyframes[0].units[0];
  const S = (t) => SamplePrevizActor(entry, t, base);
  assert.equal(S(0.5).weapon, undefined, "没写过 weapon 前是 undefined（用造人时那把，不回填缺省武器）");
  assert.equal(S(0.5).lie, null);
  assert.equal(S(1).weapon, "Dadao"); assert.equal(S(2.9).weapon, "Dadao"); assert.equal(S(3).weapon, "HanYang");
  assert.equal(S(1.5).lie, "along"); assert.equal(S(4.2).lie, null);
  // 关键帧单位写了 lie:"along"，没键时沿用
  const down = { ...base, state: "down", lie: "along" };
  assert.equal(SamplePrevizActor({ id: "Luo", keys: [] }, 1, down).lie, "along");
  // 配置：lie 校验与归一化（只认 along，不写不加）
  const cfg = NormalizeBlockout({ schema: "tengxian-blockout/1", level: "T", title: "t", keyframes: [{ id: "a", stage: 1, name: "a", player: { x: 0, z: 0 },
    units: [{ id: "A", side: "nra", x: 0, z: 0, state: "down", lie: "along" }, { id: "B", side: "nra", x: 1, z: 0, state: "down" }] }] });
  assert.equal(cfg.keyframes[0].units[0].lie, "along");
  assert.ok(!("lie" in cfg.keyframes[0].units[1]), "没写 lie 的单位归一化后也没有 lie");
});

// 仓库里有预演文件时（预演数据包写的），它要对着配置与清单过校验
for (const level of ["FirstLevel0105", "FirstLevel", "SecondLevel"]) {
  const file = path.join(projectDir, "Blockout", `${level}.previz.json`);
  let text = null;
  try { text = await fs.readFile(file, "utf8"); } catch { /* 没有 = 这关没有预演 */ }
  if (text === null) continue;
  Test(`仓库里的 Blockout/${level}.previz.json 过校验`, () => {
    const doc = JSON.parse(text);
    const cfg = NormalizeBlockout(JSON.parse(ReadText(path.join(projectDir, "Blockout", `${level}.json`))));
    let v = null;
    if (doc.voice) v = JSON.parse(ReadText(path.join(projectDir, doc.voice.replace(/^\.\//, ""))));
    const r = ValidateBlockoutPreviz(doc, { config: cfg, voice: v });
    assert.ok(r.ok, r.errors.slice(0, 12).join("\n"));
    if (r.warnings.length) console.log(`     （${r.warnings.length} 条提醒：${r.warnings.slice(0, 3).join("；")}）`);
    const n = NormalizeBlockoutPreviz(doc);
    for (const s of n.sequences) {
      const kf = cfg.keyframes.find(k => k.id === s.keyframe);
      for (const a of s.actors) for (let t = 0; t < 60; t += 0.5) {
        const st = SamplePrevizActor(a, t, kf.units.find(u => u.id === a.id) || null);
        assert.ok(Number.isFinite(st.x) && Number.isFinite(st.z) && Number.isFinite(st.yawDeg), `${s.keyframe}/${a.id} @${t}`);
      }
    }
  });
}

console.log(`EditorBlockoutPrevizPlanTest: ${passed} passed${process.exitCode ? "，有失败" : ""}`);
assert.ok(!process.exitCode);
