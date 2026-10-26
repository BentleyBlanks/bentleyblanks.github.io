// Script_EditorBlockoutPrevizPlanTest.mjs —— 预演规则（Script_EditorBlockoutPrevizPlan，§14.1）的纯 node 测试。
// 跑法：node Taierzhuang1938/Script_EditorBlockoutPrevizPlanTest.mjs
// 钉住：校验器正反例（中文路径）、归一化、演员取样（位置键 = 到达时刻、途经点、move、朝向、阶跃字段、片段秒数 / 停帧）、
// 镜头取样（eye 与 from/look、ease、空档沿用）、序列时长、遮罩与信号；仓库里有预演文件时它要过校验。
// 2026-10-18 第三轮：演员键 throw（校验、抡的窗口、出手点 → 落点的抛物线）、爆炸事件 h。

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BLOCKOUT_PREVIZ_SCHEMA, ValidateBlockoutPreviz, NormalizeBlockoutPreviz, SamplePrevizActor, SamplePrevizCamera, PrevizFreeLookSegment,
  PrevizSequenceDuration, PrevizOverlays, PrevizActiveLines, PrevizSignalsAt, PREVIZ_MOVE_SPEED, PREVIZ_EYE_HEIGHT, PrevizShakeOffset,
  BlockStandSampler, PREVIZ_THROW, PrevizThrows, SampleThrowFlight,
  PREVIZ_AIRCRAFT, SamplePrevizAircraft, PrevizStrafeImpacts, PREVIZ_SLOWMO, PrevizTimeScale, PrevizWallTime, PrevizTimeFromWall,
  PREVIZ_SFX_ALIASES,
} from "./Script_EditorBlockoutPrevizPlan.mjs";
import { INFANTRY_RELEASE_SECONDS } from "./Script_InfantryAnimation.mjs";
import { AIRCRAFT_ASSETS } from "./Data_AircraftAssets.mjs";
import { NormalizeBlockout } from "./Script_EditorBlockoutConfig.mjs";

const ReadText = (file) => readFileSync(file, "utf8");
const PREVIZ_DEFAULTS_POINT_H = 1.6;   // 点不写 h 时按 PREVIZ_DEFAULTS.pointH
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

Test("clipRelease：校验（非负、要和 clip 同键）；取样带出、没写是 null、出口放完停末帧", () => {
  const bad = ValidateBlockoutPreviz({ schema: BLOCKOUT_PREVIZ_SCHEMA, level: "Test", sequences: [{ keyframe: "01-1",
    actors: [{ id: "Luo", keys: [{ t: 0, clip: "X", clipRelease: -1 }, { t: 1, clipRelease: 2 }] }] }] }, { config });
  assert.ok(bad.errors.some(e => e.includes("keys[0].clipRelease")), bad.errors.join("; "));
  assert.ok(bad.errors.some(e => e.includes("keys[1].clipRelease")), bad.errors.join("; "));
  const ok = ValidateBlockoutPreviz({ schema: BLOCKOUT_PREVIZ_SCHEMA, level: "Test", sequences: [{ keyframe: "01-1",
    actors: [{ id: "Luo", keys: [{ t: 0, clip: "X", clipHold: true, clipRelease: 2 }] }] }] }, { config });
  assert.ok(ok.ok, ok.errors.join("; "));
  const entry = { id: "Luo", keys: [{ t: 0, clip: "Pin" }, { t: 4, clip: "Pin", clipHold: true, clipRelease: 2 }] };
  const base = config.keyframes[0].units[0];
  const S = (t) => SamplePrevizActor(entry, t, base, { clipDuration: () => 3 });
  assert.equal(S(1).clipRelease, null, "没写 clipRelease 的键 = null（停住段照旧循环）");
  assert.equal(S(5).clipRelease, 2); Near(S(5).clipSeconds, 1); assert.equal(S(5).clipHold, true);
  Near(S(9).clipSeconds, 3, 1e-6, "clipHold：出口放完停在末帧");
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

Test("镜头切镜：运镜直接切到落幅；长且差得多的切成起幅 / 落幅两个定镜；keepMove 照原样", () => {
  const cam = NormalizeBlockoutPreviz({ schema: BLOCKOUT_PREVIZ_SCHEMA, level: "X", sequences: [{ keyframe: "01-1", camera: [
    { t: 0, dur: 1, eye: { x: 0, z: 0, stance: "crouch", yawDeg: 0, pitchDeg: 0, toYawDeg: 90 } },          // 短转头
    { t: 2, dur: 4, eye: { x: 0, z: 0, stance: "crouch", yawDeg: 90, pitchDeg: 0, toYawDeg: 100 } },       // 长但只转 10°
    { t: 6, dur: 4, from: { x: 0, z: 0 }, look: { x: 0, z: -10 }, to: { x: 0, z: -14 } },                  // 走 14 m
    { t: 10, dur: 2, eye: { x: 0, z: 0, yawDeg: 0, pitchDeg: 0, toYawDeg: 90 }, keepMove: true },
  ] }] }).sequences[0].camera;
  const C = (t) => SamplePrevizCamera(cam, t, camResolve, { cuts: true });
  Near(C(0).yawDeg, 90, 1e-6, "短转头：一开始就看过去"); assert.equal(C(0).cut, true);
  Near(C(0.5).yawDeg, 90); Near(C(1.5).yawDeg, 90, 1e-6, "空档沿用落幅");
  Near(C(2.1).yawDeg, 100, 1e-6, "长但差得少：只落幅一个定镜");
  Near(C(6.5).position.z, 0, 1e-6, "长且差得多：前半段起幅"); Near(C(7.9).position.z, 0);
  Near(C(8.1).position.z, -14, 1e-6, "后半段落幅"); Near(C(9.9).position.z, -14);
  Near(C(11).yawDeg, 45, 1e-6, "keepMove：照写的运镜（inOut 中点）"); assert.equal(C(11).cut, undefined);
  Near(SamplePrevizCamera(cam, 0.5, camResolve).yawDeg, 90 * 0.5, 1e-6, "缺省（不切镜）照旧插值");
  for (const t of [0.3, 4, 7, 8.5]) assert.deepEqual(C(t), C(t), "确定性");
  assert.ok(ValidateBlockoutPreviz({ schema: BLOCKOUT_PREVIZ_SCHEMA, level: "X", sequences: [{ keyframe: "01-1", camera: [{ t: 0, dur: 1, eye: {}, keepMove: "yes" }] }] })
    .errors.some(e => e.includes("keepMove")), "keepMove 要是布尔");
});

Test("镜头：eye 用锚点定默认视线（look / toLook，飞机锚每次取样重算）；eye.free 能转头不能走、紧挨着同位置的几条算一段", () => {
  const doc = { schema: BLOCKOUT_PREVIZ_SCHEMA, level: "X", sequences: [{ keyframe: "01-1",
    aircraft: [{ id: "A", path: [{ t: 0, x: 0, h: 100, z: -100 }, { t: 10, x: 0, h: 100, z: 100 }] }],
    camera: [
      { t: 0, dur: 2, eye: { x: 0, z: 0, stance: "crouch", free: true, look: { x: 0, z: -10, h: 1.05 }, toLook: { aircraft: "A" } } },
      { t: 2, dur: 2, eye: { x: 0, z: 0, stance: "crouch", free: true, look: { aircraft: "A" } } },
      { t: 4, dur: 2, eye: { x: 0, z: 0, stance: "crouch", yawDeg: 0 } },                       // 不 free：另一段
      { t: 6, dur: 2, eye: { x: 3, z: 0, stance: "crouch", free: true, yawDeg: 90 } },         // 位置不同：新的一段
    ] }] };
  const v = ValidateBlockoutPreviz(doc);
  assert.deepEqual(v.errors, [], v.errors.join("；"));
  const cam = NormalizeBlockoutPreviz(doc).sequences[0].camera;
  const plane = (t) => ({ x: 0, y: 100, z: -100 + 20 * t });
  const Res = (t) => (a) => (a.aircraft ? plane(t) : a.actor ? { x: 0, y: 1.05, z: 0 } : { x: a.x, y: a.h ?? 1.6, z: a.z });
  const a0 = SamplePrevizCamera(cam, 0, Res(0));
  Near(a0.yawDeg, 0, 1e-6, "起幅看正北的点"); Near(a0.pitchDeg, 0, 1e-6); assert.equal(a0.free, true); assert.equal(a0.eye, true);
  const a2 = SamplePrevizCamera(cam, 2, Res(2));   // 落幅 = 飞机：t=2 飞机在 (0,100,-60)，仰角 atan(100/60)
  Near(a2.pitchDeg, Math.atan2(100 - 1.05, 60) * 180 / Math.PI, 1e-6, "落幅跟着飞机（眼高 1.05）");
  const a3 = SamplePrevizCamera(cam, 3, Res(3));   // 第二条只写 look 飞机锚：视线一直跟着它（t=3 飞机在 z −40）
  Near(a3.pitchDeg, Math.atan2(100 - 1.05, 40) * 180 / Math.PI, 1e-6, "look 飞机锚每次取样重算");
  assert.equal(SamplePrevizCamera(cam, 5, Res(5)).free, false, "没写 free 的眼睛不能转");
  assert.equal(PrevizFreeLookSegment(cam, 0), 0); assert.equal(PrevizFreeLookSegment(cam, 1), 0, "紧挨着、同位置同姿态 → 同一段");
  assert.equal(PrevizFreeLookSegment(cam, 2), -1, "不 free → -1"); assert.equal(PrevizFreeLookSegment(cam, 3), 3, "位置不同 → 新的一段");
  const bad = ValidateBlockoutPreviz({ schema: BLOCKOUT_PREVIZ_SCHEMA, level: "X", sequences: [{ keyframe: "01-1", camera: [
    { t: 0, dur: 1, eye: { free: "yes", stance: "crouch" } }, { t: 1, dur: 1, eye: { free: true, stance: "crouch" } }, { t: 2, dur: 1, eye: { x: 0, z: 0, look: { aircraft: "Nope" } } }] }] });
  assert.ok(bad.errors.some(e => e.includes("eye.free 要是")), "free 要是布尔");
  assert.ok(bad.errors.some(e => e.includes("钉死位置")), "free 的眼睛要写 x / z");
  assert.ok(bad.errors.some(e => e.includes("eye.look.aircraft")), "eye.look 的飞机锚要在这一段的 aircraft 里");
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

// 2026-10-26：standOn 块（架空桥面）不受 1 m 台阶限制；没写的块逐位不变
Test("站人取地：standOn 的块比地面高多少都站得上；随信号消失后不算；没写 standOn 的高块照旧不算", () => {
  const base = () => -2.7;
  const blocks = [
    { id: "Walk", x: 0, z: 0, w: 2.4, d: 11, h: 0.04, y: 2.53, solid: true, standOn: true },   // 顶 2.55，比河床高 5.25
    { id: "Girder", x: 5, z: 0, w: 0.4, d: 11, h: 1.2, y: 1.8, solid: true },                  // 顶 2.4：太高，不算
    { id: "Ghost", x: 10, z: 0, w: 2, d: 2, h: 0.04, y: 2.53, solid: false, standOn: true },
  ];
  const gates = [{ id: "WalkBlown", x: 20, z: 0, w: 2.4, d: 11, h: 0.04, y: 2.53, solid: true, standOn: true, signal: "BridgeBlown" }];
  let on = new Set();
  const at = BlockStandSampler(blocks, gates, base, (n) => on.has(n));
  Near(at(0.5, 3), 2.55, 1e-9, "架空走道上"); Near(at(1.5, 3), -2.7, 1e-9, "走道外是河床"); Near(at(5, 0), -2.7, 1e-9, "钢梁没 standOn 照旧不算");
  Near(at(10, 0), -2.7, 1e-9, "非实心的 standOn 不算"); Near(at(20, 0), 2.55, 1e-9, "没炸前站在走道上");
  on = new Set(["BridgeBlown"]);
  Near(at(20, 0), -2.7, 1e-9, "炸了掉到河床");
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

Test("throw：校验正反例；脱手时刻与游戏投弹片段一致", () => {
  assert.equal(PREVIZ_THROW.releaseS, INFANTRY_RELEASE_SECONDS, "PREVIZ_THROW.releaseS 要等于 Script_InfantryAnimation.INFANTRY_RELEASE_SECONDS");
  const Doc = (key, ev = []) => ({ schema: BLOCKOUT_PREVIZ_SCHEMA, level: "Test", sequences: [{ keyframe: "01-1", actors: [{ id: "Luo", keys: [key] }], events: ev }] });
  assert.ok(ValidateBlockoutPreviz(Doc({ t: 1, throw: { x: 5, z: -4, h: 1.5, flightS: 0.9 } }), { config }).ok);
  const bad = [
    [{ t: 1, throw: { x: 5 } }, "throw 要是落点"],
    [{ t: 1, throw: { x: 5, z: 1, flightS: 9 } }, "flightS"],
    [{ t: 1, throw: { x: 5, z: 1 }, clip: "PointBlockade" }, "throw 与 clip"],
  ];
  for (const [key, want] of bad) {
    const r = ValidateBlockoutPreviz(Doc(key), { config });
    assert.ok(!r.ok && r.errors.some(e => e.includes(want)), `${JSON.stringify(key)} → ${r.errors.join("；")}`);
  }
  assert.ok(ValidateBlockoutPreviz(Doc({ t: 0 }, [{ t: 1, type: "explosion", x: 1, z: 2, h: 1.5 }]), { config }).ok, "爆炸 h");
  const r = ValidateBlockoutPreviz(Doc({ t: 0 }, [{ t: 1, type: "explosion", x: 1, z: 2, h: -1 }]), { config });
  assert.ok(!r.ok && r.errors.some(e => e.includes(".h")), r.errors.join("；"));
});

Test("throw：抡的窗口里给 seconds、clip 让位、站着；之后交还", () => {
  const entry = { id: "Luo", keys: [{ t: 0, stance: "crouch", clip: "PointBlockade" }, { t: 1, throw: { x: 0, z: -8 } }] };
  const base = config.keyframes[0].units[0];
  const before = SamplePrevizActor(entry, 0.5, base);
  assert.equal(before.throw, null); assert.equal(before.stance, "crouch"); assert.equal(before.clip, "PointBlockade");
  const mid = SamplePrevizActor(entry, 2.5, base);
  Near(mid.throw.seconds, 1.5, 1e-9, "抡了几秒");
  assert.equal(mid.clip, null); assert.equal(mid.stance, "stand");
  assert.deepEqual([mid.throw.x, mid.throw.z], [0, -8]);
  const after = SamplePrevizActor(entry, 1 + PREVIZ_THROW.clipS + 0.01, base);
  assert.equal(after.throw, null); assert.equal(after.stance, "crouch", "抡完回到之前的姿态");
  const seq = { actors: [entry], camera: [], lines: [], events: [] };
  Near(PrevizSequenceDuration(seq), 1 + PREVIZ_THROW.clipS, 1e-9, "序列时长算上抡完");
});

Test("throw：飞行从出手点到落点、两端时刻对、中间往上拱", () => {
  const seq = { actors: [{ id: "Luo", keys: [{ t: 1, throw: { x: 0, z: -8, h: 1.5, flightS: 0.9 } }] }], camera: [], lines: [], events: [] };
  const flights = PrevizThrows(seq, () => ({ x: 0, z: 0, yawDeg: 0 }), () => 0.5);
  assert.equal(flights.length, 1);
  const f = flights[0];
  Near(f.t0, 1 + PREVIZ_THROW.releaseS, 1e-9, "脱手"); Near(f.t1, 1 + PREVIZ_THROW.releaseS + 0.9, 1e-9, "落地");
  Near(f.from.y, 0.5 + PREVIZ_THROW.releaseH, 1e-9, "出手高"); Near(f.from.z, -PREVIZ_THROW.releaseFwd, 1e-9, "出手点往前（朝北 = −z）");
  Near(f.to.y, 2.0, 1e-9, "落点 = 地面 + h"); Near(f.to.z, -8, 1e-9);
  assert.equal(SampleThrowFlight(f, f.t0 - 0.01), null); assert.equal(SampleThrowFlight(f, f.t1 + 0.01), null);
  const mid = SampleThrowFlight(f, (f.t0 + f.t1) / 2);
  assert.ok(mid.y > (f.from.y + f.to.y) / 2 + 1, `中点要比两端连线高 1 m 以上：${mid.y}`);
  // 缺省飞行时间按距离、夹在上下限之间
  const g = PrevizThrows({ actors: [{ id: "A", spawn: { x: 0, z: 0, yawDeg: 0 }, keys: [{ t: 0, throw: { x: 0, z: -100 } }] }] }, () => null, () => 0)[0];
  Near(g.t1 - g.t0, PREVIZ_THROW.flightMaxS, 1e-9, "远处夹上限");
});

// 2026-10-19：飞机轨（aircraft）与慢动作（slowmo）
const PLANE = { id: "Ki30A", model: "MitsubishiKi30",
  path: [{ t: 2, x: 100, y: 120, z: 100 }, { t: 8, x: 100, y: 70, z: 400 }, { t: 12, x: 160, y: 90, z: 560 }, { t: 16, x: 300, h: 140, z: 600 }],
  strafe: [{ t0: 6, t1: 7.5, from: { x: 100, z: 300 }, to: { x: 100, z: 380 } }], sound: { diveT: 5.5 } };
const Doc = (seq) => ({ schema: BLOCKOUT_PREVIZ_SCHEMA, level: "Test", sequences: [{ keyframe: "01-1", ...seq }] });

Test("飞机：机型名单与 Data_AircraftAssets 一致；校验正反例（航点升序、y / h 二选一、strafe、sound、飞机锚）", () => {
  assert.deepEqual([...PREVIZ_AIRCRAFT.models].sort(), AIRCRAFT_ASSETS.map(a => a.id).sort());
  const ok = ValidateBlockoutPreviz(Doc({ aircraft: [PLANE], camera: [{ t: 0, dur: 3, from: { x: 0, z: 0, h: 2 }, look: { aircraft: "Ki30A", offset: [0, 0, 0] } }] }), { config });
  assert.ok(ok.ok, ok.errors.join("；"));
  const bad = ValidateBlockoutPreviz(Doc({ aircraft: [
    { id: "B", model: "Zero", path: [{ t: 3, x: 0, y: 1, z: 0 }, { t: 2, x: 1, z: 1 }, { t: 4, x: 1, y: 1, h: 1, z: 1 }], strafe: [{ t0: 1, t1: 0.5, from: { x: 0 } }], sound: { drone: "yes" } },
    { id: "B", path: [{ t: 0, x: 0, y: 1, z: 0 }, { t: 1, x: 1, y: 1, z: 0 }] },
  ], camera: [{ t: 0, dur: 1, from: { x: 0, z: 0 }, look: { aircraft: "Nope" } }] }), { config });
  const all = bad.errors.join("\n");
  for (const want of ["aircraft[0].model", "aircraft[0].path[1].t 要比上一个航点晚", "aircraft[0].path[1] 的 y（世界高）和 h（离地高）二选一", "aircraft[0].path[2] 的 y（世界高）和 h",
    "aircraft[0].strafe[0] 的 t0 / t1", "aircraft[0].strafe[0] 的 from / to", "aircraft[0].sound.drone", "aircraft[1].id 重复", "camera[0].look.aircraft 在这一段的 aircraft 里找不到"]) {
    assert.ok(all.includes(want), `缺：${want}\n${all}`);
  }
});

Test("飞机：取样纯函数——机头顺着速度方向、爬升角与高度变化一致、转弯带坡度（左转正）、首尾之外不可见、同一 t 两次一样", () => {
  const n = NormalizeBlockoutPreviz(Doc({ aircraft: [PLANE] })).sequences[0];
  const plane = n.aircraft[0];
  assert.equal(plane.model, "MitsubishiKi30"); assert.equal(plane.sound.drone, true); Near(plane.sound.diveT, 5.5);
  const groundAt = () => 10;
  const before = SamplePrevizAircraft(plane, 1, { groundAt }), start = SamplePrevizAircraft(plane, 2, { groundAt }), end = SamplePrevizAircraft(plane, 16, { groundAt }), after = SamplePrevizAircraft(plane, 17, { groundAt });
  assert.equal(before.visible, false); assert.equal(start.visible, true); assert.equal(end.visible, true); assert.equal(after.visible, false);
  Near(start.x, 100); Near(start.y, 120); Near(start.z, 100);
  Near(end.y, 150, 1e-6, "h 按地面 + 离地高");
  // 第一段直飞向南（+z）、往下降：机头 180、爬升为负；位置的有限差分与速度一致
  const a = SamplePrevizAircraft(plane, 4, { groundAt }), b = SamplePrevizAircraft(plane, 4.01, { groundAt });
  assert.ok(Math.abs(a.yawDeg) > 170, `向南 ${a.yawDeg}`); assert.ok(a.climb < 0, "下降");
  const fd = { x: (b.x - a.x) / 0.01, y: (b.y - a.y) / 0.01, z: (b.z - a.z) / 0.01 };
  const yawFd = Math.atan2(-fd.x, -fd.z) * 180 / Math.PI;
  assert.ok(Math.abs(((yawFd - a.yawDeg + 540) % 360) - 180) < 2, `机头 ${a.yawDeg} 与位移方向 ${yawFd} 一致`);
  assert.ok(Math.abs(Math.hypot(fd.x, fd.y, fd.z) - a.speedMps) < 1, `速度 ${a.speedMps} vs 差分 ${Math.hypot(fd.x, fd.y, fd.z)}`);
  // 8 → 16 s 从南转向东（在这套坐标里是左转）：坡度为正、不超上限
  const turn = SamplePrevizAircraft(plane, 12, { groundAt });
  assert.ok(turn.bank > 0.2 && turn.bank <= PREVIZ_AIRCRAFT.bankMax, `坡度 ${turn.bank}`);
  assert.ok(Math.abs(start.bank) < 1e-9 && Math.abs(end.bank) < 1e-9, "端点不压坡");
  assert.deepEqual(SamplePrevizAircraft(plane, 9.37, { groundAt }), SamplePrevizAircraft(plane, 9.37, { groundAt }));
  // 右转（东 → 南）坡度为负
  const right = { id: "R", path: [{ t: 0, x: 0, y: 50, z: 0 }, { t: 4, x: 200, y: 50, z: 0 }, { t: 8, x: 300, y: 50, z: 150 }, { t: 12, x: 300, y: 50, z: 400 }] };
  assert.ok(SamplePrevizAircraft(right, 6).bank < -0.1, `右转坡度 ${SamplePrevizAircraft(right, 6).bank}`);
});

Test("飞机：扫射弹着点按 hz 沿线落、在窗口里、横向散布不超限、每几发一声打土；序列时长算上航线", () => {
  const n = NormalizeBlockoutPreviz(Doc({ aircraft: [PLANE] })).sequences[0];
  const hits = PrevizStrafeImpacts(n.aircraft[0]);
  assert.equal(hits.length, Math.floor(1.5 * PREVIZ_AIRCRAFT.strafeHz));
  for (const h of hits) {
    assert.ok(h.t >= 6 && h.t < 7.5, `t ${h.t}`);
    assert.ok(h.z >= 300 - 1e-9 && h.z <= 380 + 1e-9, `沿线 z ${h.z}`);
    assert.ok(Math.abs(h.x - 100) <= PREVIZ_AIRCRAFT.strafeSpreadM + 1e-9, `横向 ${h.x}`);
  }
  assert.equal(hits.filter(h => h.dirt).length, Math.ceil(hits.length / PREVIZ_AIRCRAFT.strafeDirtEvery));
  assert.deepEqual(PrevizStrafeImpacts(n.aircraft[0]), hits);
  Near(PrevizSequenceDuration(n), 16, 1e-9, "最后一个航点");
});

Test("慢动作：校验（rate 范围、重叠、台词在窗口里只警告）、归一化夹值与 fade 缺省、时长算到窗口结束", () => {
  const bad = ValidateBlockoutPreviz(Doc({ slowmo: [{ t: 1, dur: 2, rate: 0.3 }, { t: 2, dur: 1, rate: 2 }, { t: 9, dur: 0, rate: 0.5 }, { t: 10, dur: 1, rate: 0.5, fade: -1 }], lines: [{ t: 1.5, line: "L" }] }), { config });
  const all = bad.errors.join("\n");
  for (const want of ["slowmo[1].rate", "slowmo[1] 与别的慢动作窗口重叠", "slowmo[2].dur", "slowmo[3].fade"]) assert.ok(all.includes(want), `缺：${want}\n${all}`);
  assert.ok(bad.warnings.some(w => w.includes("slowmo[0] 里排了台词 L")), bad.warnings.join("\n"));
  const ok = ValidateBlockoutPreviz(Doc({ slowmo: [{ t: 12, dur: 1.5, rate: 0.3, fade: 0.2 }] }), { config });
  assert.ok(ok.ok, ok.errors.join("；"));
  const n = NormalizeBlockoutPreviz(Doc({ slowmo: [{ t: 3, dur: 1, rate: 0.01 }, { t: 1, dur: 0.2, rate: 0.5 }] })).sequences[0];
  assert.deepEqual(n.slowmo, [{ t: 1, dur: 0.2, rate: 0.5, fade: 0.1 }, { t: 3, dur: 1, rate: PREVIZ_SLOWMO.rateMin, fade: PREVIZ_SLOWMO.fadeDefaultS }]);
  Near(PrevizSequenceDuration(n), 4, 1e-9, "慢动作窗口结束");
});

Test("慢动作：倍率在窗口外是 1、平台是 rate、渐变连续；预演时间 ↔ 墙上时间互为反函数且与数值积分一致", () => {
  const seq = NormalizeBlockoutPreviz(Doc({ slowmo: [{ t: 5, dur: 1.5, rate: 0.3, fade: 0.25 }] })).sequences[0];
  Near(PrevizTimeScale(seq, 4.99), 1); Near(PrevizTimeScale(seq, 5), 1); Near(PrevizTimeScale(seq, 5.125), 0.65); Near(PrevizTimeScale(seq, 5.25), 0.3);
  Near(PrevizTimeScale(seq, 6), 0.3); Near(PrevizTimeScale(seq, 6.375), 0.65); Near(PrevizTimeScale(seq, 6.5), 1); Near(PrevizTimeScale(seq, 7), 1);
  // 连续：每 1 ms 的变化不超过渐变斜率
  for (let t = 4.9; t < 6.6; t += 0.001) assert.ok(Math.abs(PrevizTimeScale(seq, t + 0.001) - PrevizTimeScale(seq, t)) < 0.7 / 0.25 * 0.001 + 1e-9, `跳变 @${t}`);
  Near(PrevizWallTime(seq, 5), 5); assert.ok(PrevizWallTime(seq, 7) > 7 + 1.5 * (1 / 0.3 - 1) * 0.6, "慢动作里墙上时间更长");
  let numeric = 0;
  for (let u = 0; u < 7; u += 0.0005) numeric += 0.0005 / PrevizTimeScale(seq, u + 0.00025);
  Near(PrevizWallTime(seq, 7), numeric, 2e-3, "与数值积分一致");
  for (const t of [0, 4.2, 5.1, 5.7, 6.4, 6.6, 9]) Near(PrevizTimeFromWall(seq, PrevizWallTime(seq, t)), t, 1e-5, `反函数 @${t}`);
  // 没有慢动作：两条时钟相同
  const plain = NormalizeBlockoutPreviz(Doc({})).sequences[0];
  Near(PrevizWallTime(plain, 3.3), 3.3); Near(PrevizTimeFromWall(plain, 3.3), 3.3); Near(PrevizTimeScale(plain, 1), 1);
});

// 2026-10-20：挂到车上（演员键 ride）与直接放文件的音效别名
Test("ride：合法键通过；on 找不到 / 不是车 / 自己 报错；挂着时写位置键只警告；SamplePrevizActor 的 ride 阶跃且沿用关键帧单位的", () => {
  const cfg = NormalizeBlockout({
    schema: "tengxian-blockout/1", level: "Test", title: "t",
    keyframes: [{ id: "k", stage: 1, name: "a", player: { x: 0, z: 0 }, units: [
      { id: "Cart", side: "civ", kind: "cart", x: 10, z: 10, yawDeg: -90 },
      { id: "Kid", side: "civ", kind: "child", x: 0, z: 0, ride: { on: "Cart", z: 1.2, y: 0.467, yawDeg: 180 } },
      { id: "Man", side: "nra", x: 2, z: 2 },
    ] }],
  });
  const Doc = (actors) => ({ schema: BLOCKOUT_PREVIZ_SCHEMA, level: "Test", sequences: [{ keyframe: "k", actors }] });
  const good = Doc([
    { id: "Man", keys: [{ t: 1, ride: { on: "Cart", x: 0.3, z: -0.5, y: 1.025 } }, { t: 8, ride: null }, { t: 9, x: 5, z: 5 }] },
    { id: "Kid", keys: [{ t: 3, ride: null }, { t: 6, x: 1, z: 1 }] },
    { id: "L", spawn: { side: "nra", kind: "litter", bearers: 0, x: 0, z: 0 }, keys: [{ t: 0, ride: { on: "Cart", y: 1.075 } }] },
    { id: "Man2", spawn: { side: "nra", x: 0, z: 0 }, keys: [{ t: 0, ride: { on: "L" } }] },   // 挂到 spawn 的担架上（校验按 spawn 的 kind）
  ]);
  const r = ValidateBlockoutPreviz(good, { config: cfg });
  assert.ok(r.ok, r.errors.join("；"));
  assert.equal(r.warnings.filter(w => w.includes("位置键不管用")).length, 0, r.warnings.join("；"));
  // 挂着时写位置键：警告（关键帧里就挂着的 Kid 没先写 ride:null 就走）
  const warned = ValidateBlockoutPreviz(Doc([{ id: "Kid", keys: [{ t: 2, x: 1, z: 1 }] }, { id: "Man", keys: [{ t: 0, ride: { on: "Cart" } }, { t: 1, x: 3, z: 3 }] }]), { config: cfg });
  assert.ok(warned.ok);
  assert.equal(warned.warnings.filter(w => w.includes("位置键不管用")).length, 2, warned.warnings.join("；"));
  const bad = ValidateBlockoutPreviz(Doc([
    { id: "Man", keys: [{ t: 0, ride: { on: "Nobody" } }, { t: 1, ride: { on: "Man" } }, { t: 2, ride: { on: "Kid" } }, { t: 3, ride: "Cart" }, { t: 4, ride: { on: "Cart", y: "x" } }] },
  ]), { config: cfg });
  const all = bad.errors.join("\n");
  for (const want of ["keys[0].ride.on 在关键帧 k 里找不到：Nobody", "keys[1].ride.on 不能是自己", "keys[2].ride.on 指的 Kid 是 child", "keys[3].ride 要是 { on", "keys[4].ride.y 要是有限数字"]) assert.ok(all.includes(want), `缺：${want}\n${all}`);
  // 取样：Man 1 s 起挂、8 s 下车；Kid 关键帧里就挂着、3 s 下车
  const n = NormalizeBlockoutPreviz(good).sequences[0];
  const man = n.actors[0], kid = n.actors[1];
  const baseOf = (id) => cfg.keyframes[0].units.find(u => u.id === id);
  assert.equal(SamplePrevizActor(man, 0.5, baseOf("Man")).ride, null);
  assert.deepEqual(SamplePrevizActor(man, 1, baseOf("Man")).ride, { on: "Cart", x: 0.3, z: -0.5, y: 1.025, yawDeg: 0 });
  assert.deepEqual(SamplePrevizActor(man, 7.9, baseOf("Man")).ride, { on: "Cart", x: 0.3, z: -0.5, y: 1.025, yawDeg: 0 });
  assert.equal(SamplePrevizActor(man, 8, baseOf("Man")).ride, null);
  assert.deepEqual(SamplePrevizActor(kid, 0, baseOf("Kid")).ride, { on: "Cart", x: 0, z: 1.2, y: 0.467, yawDeg: 180 });
  assert.equal(SamplePrevizActor(kid, 3, baseOf("Kid")).ride, null);
  // spawn 的 ride 也沿用
  assert.deepEqual(SamplePrevizActor(n.actors[3], 0, null).ride, { on: "L", x: 0, z: 0, y: 0, yawDeg: 0 });
});

// 2026-10-23：单被「玩家这一角不攥」（演员键 dragSolo，§5.6 / §14.1；1218 14-2 顺子松手后只剩妮儿攥着一个角）
Test("dragSolo：要是 true / false；取样阶跃、没写过是 undefined（用关键帧单位的）", () => {
  const cfg = NormalizeBlockout({
    schema: "tengxian-blockout/1", level: "Test", title: "t",
    keyframes: [{ id: "k", stage: 1, name: "a", player: { x: 0, z: 0 }, units: [{ id: "Blanket", side: "nra", kind: "litter", name: "冬瓜的单被", bearers: 0, x: 0, z: 0 }] }],
  });
  const Doc = (keys) => ({ schema: BLOCKOUT_PREVIZ_SCHEMA, level: "Test", sequences: [{ keyframe: "k", actors: [{ id: "Blanket", keys }] }] });
  const bad = ValidateBlockoutPreviz(Doc([{ t: 0, dragSolo: "yes" }]), { config: cfg });
  assert.ok(bad.errors.some(e => e.includes("keys[0].dragSolo 要是 true / false")), bad.errors.join("；"));
  const good = ValidateBlockoutPreviz(Doc([{ t: 2, dragSolo: true }, { t: 9, dragSolo: false }]), { config: cfg });
  assert.ok(good.ok, good.errors.join("；"));
  const entry = NormalizeBlockoutPreviz(Doc([{ t: 2, dragSolo: true }, { t: 9, dragSolo: false }])).sequences[0].actors[0];
  const base = cfg.keyframes[0].units[0];
  assert.equal(SamplePrevizActor(entry, 1, base).dragSolo, undefined, "没写过 = undefined（运行时回落到关键帧单位的 dragSolo）");
  assert.equal(SamplePrevizActor(entry, 2, base).dragSolo, true);
  assert.equal(SamplePrevizActor(entry, 8.9, base).dragSolo, true);
  assert.equal(SamplePrevizActor(entry, 9, base).dragSolo, false);
});

Test("音效别名：§14.3 的四个新别名在 PREVIZ_SFX_ALIASES 里；运行时 PREVIZ_SFX 两张表一致，新别名是 Audio/BlockoutPreviz 下的 url", () => {
  for (const name of ["babyCry", "cellarSob", "gateSmash", "jarShatter"]) assert.ok(PREVIZ_SFX_ALIASES.includes(name), name);
  const src = ReadText(path.join(projectDir, "Script_EditorBlockoutPreviz.mjs"));
  const table = src.slice(src.indexOf("export const PREVIZ_SFX = Object.freeze({"), src.indexOf("});", src.indexOf("export const PREVIZ_SFX = Object.freeze({")));
  for (const name of PREVIZ_SFX_ALIASES) assert.ok(new RegExp(`^\\s+${name}:\\s*\\{`, "m").test(table), `PREVIZ_SFX 里没有 ${name}`);
  const keys = [...table.matchAll(/^\s+([A-Za-z]+):\s*\{/gm)].map(m => m[1]);
  for (const k of keys) assert.ok(PREVIZ_SFX_ALIASES.includes(k), `PREVIZ_SFX_ALIASES 里没有 ${k}`);
  for (const [name, file] of [["babyCry", "Sfx_BabyCry"], ["cellarSob", "Sfx_CellarSob"], ["gateSmash", "Sfx_GateSmash"], ["jarShatter", "Sfx_JarShatter"]]) {
    assert.ok(new RegExp(`^\\s+${name}:\\s*\\{\\s*url:\\s*"\\./Audio/BlockoutPreviz/${file}\\.mp3"`, "m").test(table), `${name} 应当是 url ./Audio/BlockoutPreviz/${file}.mp3`);
  }
});

// 仓库里有预演文件时（预演数据包写的），它要对着配置与清单过校验
for (const level of ["FirstLevel0105", "FirstLevel0610", "FirstLevel1218", "FirstLevel", "SecondLevel"]) {
  const file = path.join(projectDir, "Blockout", `${level}.previz.json`);
  let text = null;
  try { text = await fs.readFile(file, "utf8"); } catch { /* 没有 = 这关没有预演 */ }
  if (text === null) continue;
  // 不许出现没头没脑的俯视镜头（10-23 用户）：机位不能悬在它看的那个点正上方，往下看不超过 60°。
  // 切镜按起幅和落幅各取一帧（切镜就是这两张画面），只看写死的点（演员、飞机锚跟着人动，另算）。
  Test(`Blockout/${level}.previz.json 没有朝正下方的镜头`, () => {
    const doc = JSON.parse(text), bad = [];
    for (const s of doc.sequences || []) for (const c of s.camera || []) {
      if (c.eye) continue;
      for (const [tag, at, look] of [["起幅", c.from, c.look], ["落幅", c.to || c.from, c.lookTo || c.look]]) {
        if (!at || !look || look.actor || look.aircraft || at.actor || at.aircraft) continue;
        const d = Math.hypot(at.x - look.x, at.z - look.z), dh = (look.h ?? PREVIZ_DEFAULTS_POINT_H) - (at.h ?? PREVIZ_DEFAULTS_POINT_H);
        const pitch = Math.atan2(dh, d) * 180 / Math.PI;
        if (d < 0.5 || pitch < -60) bad.push(`${s.keyframe} t${c.t} ${tag}：离看的点 ${d.toFixed(2)} m、往下 ${(-pitch).toFixed(0)}°`);
      }
    }
    assert.deepEqual(bad, [], "预演里有朝正下方的镜头");
  });
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
