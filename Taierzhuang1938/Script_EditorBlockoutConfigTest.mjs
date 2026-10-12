// ===========================================================================
// Script_EditorBlockoutConfigTest.mjs —— 白盒关卡编辑器：配置格式、生成器与提交的配置（纯 node，docs/Data_EditorBlockout.md §10 第 1 行）
//
//   node Taierzhuang1938/Script_EditorBlockoutConfigTest.mjs
//
// 覆盖：
//   1. ValidateBlockout / ValidateBlockoutScene 正反例
//   2. NormalizeBlockout 的缺省值与 yaw 换算（yawDeg / faceTo / 都没有，三种来源各一例），
//      以及生成器读的三种游戏表口径（MISSION_PLACEMENT「0 朝 +z 南」、相机表的度、END_TUNING 的演员弧度）
//   3. PlanTransition：move / stay / appear / vanish、短挪动拉长到 minS、整段快进 playbackRate、路径采样
//   4. 提交的 Blockout/*.json 通过校验；第一关 44 个关键帧与 §8 表一一对应、信号按 §5.4
//   5. 生成器两次输出除 generatedAt 外逐字相同；CLI 不带 --force 不覆盖已有文件
//   6. 每个关键帧的玩家点在关卡边界内、不在实心块里（第一关 = MISSION_LAYOUT 块 + 该关键帧场景态的块 + 关着的门）
//   7. 单位落在实心块里只报警告并列出（不算失败）
//   8. 第一关（判失败）：
//      - 相邻关键帧过渡（PlanTransition 的每条路线，取自归一化后的提交配置）身体不穿高墙：半径 0.3 m、离地 0.5–1.4 m、
//        只算高过 1.6 m 的块、扎进去超过 0.12 m 才算，块取两帧信号并集下的 FirstLevelSolidBlocks；放行名单 TRANSITION_CROSSING_ALLOW
//        每条必须写原因（现在是空的）
//      - 玩家站位放得下一个站着的人（半径 0.3 m、离地 0.35–1.6 m，碰任何实心块都不行）
//      - 摆位间距：人离玩家 ≥ 1 m（倒地的 ≥ 0.5 m）、人离担架中心 ≥ 1.3 m、人离抬担架的人站的那一段 ≥ 0.6 m、
//        任意两个单位 ≥ 0.8 m；下一步目标离玩家不到 2 m 的只写文字
//      - 军官是 kind officer（拔刀军官、桥头军官）；床位上的老周担架 bearers 0、不是 down；Litter6 的抬担架的人倒了还是 down
// ===========================================================================

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BLOCKOUT_SCHEMA, BLOCKOUT_SCENE_SCHEMA, BLOCKOUT_LEVEL_KEYS, ValidateBlockout, ValidateBlockoutScene, NormalizeBlockout,
  PlanTransition, SampleTransitionUnit, SampleTransition, SamplePath, PathLength, ForwardFromYawDeg, YawDegFromTo, DefaultArc,
  BLOCKOUT_TRANSITION, BLOCKOUT_DEFAULT_SPEED,
} from "./Script_EditorBlockoutConfig.mjs";
import { FIRST_LEVEL_BLOCKOUT_STATIONS } from "./Data_EditorBlockoutFirstLevelStations.mjs";
import {
  BuildFirstLevelBlockoutConfig, FirstLevelSolidBlocks, SolidBlockAt, FirstLevelSignalsFor,
  YawDegFromActorRad, YawDegFromPlacementRad, YawDegFromCameraDeg,
  BodyBlockAt, RouteSolidCrossings, FirstLevelSpacingIssues, FirstLevelBlockoutIssues, BLOCKOUT_ROUTE_BODY, BLOCKOUT_PLAYER_BODY, BLOCKOUT_SPACING,
} from "./Script_EditorBlockoutFirstLevel.mjs";
import { MID_TUNING } from "./Data_Tuning_FirstLevelMid.mjs";
import { BuildSecondLevelConfig, SecondLevelZhaiWallBlocks, SecondLevelCourtyardBlocks, DecodeHeightAt, SECOND_LEVEL_BOUNDS } from "./Script_EditorBlockoutSecondLevel.mjs";
import { Main as CliMain, StringifyBlockout } from "./Script_EditorBlockoutCli.mjs";
import { MISSION_PLACEMENT as P, MISSION_ANCHORS as A, MISSION_LAYOUT } from "./Data_FirstLevelMissionLayout.mjs";
import { WHITEBOX_0518_CAMERA_BY_ID } from "./Data_FirstLevelWhitebox0518Cameras.mjs";
import { END_TUNING } from "./Data_Tuning_FirstLevelEnd.mjs";
import { MISSION_SCENARIO_SIGNALS } from "./Data_FirstLevelMissionGates.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BLOCKOUT_DIR = path.join(HERE, "Blockout");
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const ReadJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
let checks = 0;
function Check(name, fn) { fn(); checks++; console.log(`ok  ${name}`); }

// ---------------------------------------------------------------------------
// 1. 校验器

function MinimalDoc() {
  return {
    schema: BLOCKOUT_SCHEMA, level: "FirstLevel", title: "t",
    keyframes: [
      { id: "01-1", stage: 1, name: "a", player: { x: 0, z: 0, yawDeg: 0 }, what: "x", next: { text: "y", x: 1, z: 2 },
        units: [{ id: "u1", side: "ija", x: 1, z: 1, yawDeg: 10 }], pois: [{ id: "p", name: "p", kind: "poi", x: 0, z: 0 }] },
      { id: "01-2", stage: 1, name: "b", player: { x: 5, z: 0, faceTo: { x: 5, z: -10 } } },
    ],
  };
}

Check("ValidateBlockout 正例与反例", () => {
  const good = ValidateBlockout(MinimalDoc());
  assert.equal(good.ok, true, good.errors.join("; "));
  const cases = [
    [(d) => { d.schema = "x"; }, "schema"],
    [(d) => { d.level = "bad level"; }, "level"],
    [(d) => { d.keyframes = []; }, "keyframes"],
    [(d) => { d.keyframes[1].id = "01-1"; }, "重复"],
    [(d) => { d.keyframes[0].id = "a b"; }, ".id"],
    [(d) => { d.keyframes[0].stage = 0; }, ".stage"],
    [(d) => { d.keyframes[0].player = { x: "1", z: 0 }; }, ".player"],
    [(d) => { d.keyframes[0].units[0].side = "usa"; }, ".side"],
    [(d) => { d.keyframes[0].units[0].kind = "plane"; }, ".kind"],
    [(d) => { d.keyframes[0].units.push({ id: "u1", side: "nra", x: 0, z: 0 }); }, "重复：u1"],
    [(d) => { d.keyframes[0].units[0].arc = { halfDeg: 200, rangeM: 5 }; }, ".arc"],
    [(d) => { d.keyframes[0].units[0].path = [{ x: 1 }]; }, ".path[0]"],
    [(d) => { d.keyframes[0].next = { text: "t", x: 1 }; }, ".next"],
    [(d) => { d.keyframes[0].signals = [""]; }, ".signals"],
    [(d) => { d.keyframes[0].pois[0].kind = "boss"; }, ".kind"],
  ];
  for (const [mutate, needle] of cases) {
    const doc = MinimalDoc();
    mutate(doc);
    const r = ValidateBlockout(doc);
    assert.equal(r.ok, false, `应当不通过：${needle}`);
    assert.ok(r.errors.some((e) => e.includes(needle)), `错误里应提到 ${needle}：${r.errors.join("; ")}`);
  }
  const long = MinimalDoc();
  long.keyframes[0].what = "字".repeat(81);
  const r = ValidateBlockout(long);
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.includes(".what")), "what 超 80 字只报警告");
  const backward = MinimalDoc();
  backward.keyframes[1].stage = 0;
  backward.keyframes[0].stage = 2; backward.keyframes[1].stage = 1;
  assert.ok(ValidateBlockout(backward).warnings.some((w) => w.includes("阶段号")), "阶段号倒退只报警告");
});

Check("ValidateBlockoutScene 正例与反例", () => {
  const cols = 2, rows = 3;
  const data = Buffer.alloc((cols + 1) * (rows + 1) * 2).toString("base64");
  const scene = { schema: BLOCKOUT_SCENE_SCHEMA, level: "SecondLevel", bounds: { minX: 0, maxX: 2, minZ: 0, maxZ: 3 }, spawn: { x: 1, z: 1 },
    terrain: { kind: "heightmap", minX: 0, minZ: 0, cellM: 1, cols, rows, encoding: "int16-cm-base64", data },
    blocks: [{ id: "b", x: 1, z: 1, w: 1, d: 1, h: 1, semantic: "structure" }] };
  assert.equal(ValidateBlockoutScene(scene).ok, true, ValidateBlockoutScene(scene).errors.join("; "));
  const bad = [
    (s) => { s.terrain.data = Buffer.alloc(4).toString("base64"); },
    (s) => { s.terrain.encoding = "float"; },
    (s) => { s.bounds.maxX = -1; },
    (s) => { s.blocks.push({ ...s.blocks[0] }); },
    (s) => { s.blocks[0].h = 0; },
    (s) => { s.blocks[0].semantic = ""; },
  ];
  for (const mutate of bad) {
    const s = structuredClone(scene);
    mutate(s);
    assert.equal(ValidateBlockoutScene(s).ok, false);
  }
});

// ---------------------------------------------------------------------------
// 2. 归一化与朝向口径

Check("NormalizeBlockout：三种朝向来源与缺省值", () => {
  const doc = MinimalDoc();
  doc.keyframes[0].units = [
    { id: "yaw", side: "ija", x: 0, z: 0, yawDeg: 45 },
    { id: "face", side: "nra", x: 0, z: 0, faceTo: { x: 10, z: 0 } },
    { id: "none", side: "civ", x: 0, z: 0 },
    { id: "mg", side: "ija", x: 0, z: 0, weapon: "Type11" },
    { id: "tank", side: "ija", kind: "tank", x: 0, z: 0 },
    { id: "litter", side: "nra", kind: "litter", x: 0, z: 0 },
    { id: "rifle", side: "nra", x: 0, z: 0, aim: true, stance: "crouch" },
  ];
  doc.keyframes[1].units = [{ id: "rifle", side: "nra", x: 6, z: 8, path: [{ x: 6, z: 0 }] }];
  const n = NormalizeBlockout(doc);
  const u = Object.fromEntries(n.keyframes[0].units.map((x) => [x.id, x]));
  assert.equal(u.yaw.yawDeg, 45, "yawDeg 原样");
  assert.equal(u.face.yawDeg, -90, "faceTo 东 = −90");
  assert.equal(u.face.faceTo, undefined, "faceTo 换成 yawDeg 后删掉");
  assert.equal(u.none.yawDeg, 0, "都没有 = 0（朝北）");
  assert.equal(n.keyframes[1].player.yawDeg, 0, "玩家 faceTo 正北 = 0");
  assert.deepEqual([u.yaw.kind, u.yaw.stance, u.yaw.state, u.yaw.weapon], ["soldier", "stand", "alive", "Type38"]);
  assert.equal(u.face.weapon, "HanYang");
  assert.equal(u.none.weapon, null);
  assert.equal(u.tank.weapon, null);
  assert.equal(u.yaw.speedMps, BLOCKOUT_DEFAULT_SPEED.ija);
  assert.equal(u.face.speedMps, BLOCKOUT_DEFAULT_SPEED.nra);
  assert.equal(u.none.speedMps, BLOCKOUT_DEFAULT_SPEED.civ);
  assert.equal(u.litter.speedMps, BLOCKOUT_DEFAULT_SPEED.litter);
  assert.equal(u.tank.speedMps, BLOCKOUT_DEFAULT_SPEED.tank);
  assert.deepEqual(u.mg.arc && [u.mg.arc.halfDeg, u.mg.arc.rangeM, u.mg.arc.source], [25, 70, "default"]);
  assert.deepEqual(u.tank.arc && [u.tank.arc.halfDeg, u.tank.arc.rangeM], [20, 90]);
  assert.equal(u.rifle.arc, null, "缺省档只给机枪与战车");
  assert.deepEqual(NormalizeBlockout(doc, { arcMode: "all" }).keyframes[0].units.find((x) => x.id === "rifle").arc.halfDeg, 30);
  assert.equal(NormalizeBlockout(doc, { arcMode: "off" }).keyframes[0].units.find((x) => x.id === "mg").arc, null);
  assert.equal(DefaultArc({ kind: "soldier", weapon: "Zb26" }).halfDeg, 25);
  // 自动去向：下一关键帧里换了位置 → 取下一关键帧的 path（含终点）。
  assert.deepEqual(u.rifle.intent, [{ x: 6, z: 0 }, { x: 6, z: 8 }]);
  assert.equal(u.rifle.intentAuto, true);
  assert.equal(n.keyframes[0].next.radiusM, 3, "next.radiusM 缺省 3");
  assert.equal(n.keyframes[1].next, null);
});

Check("生成器读的三种游戏表朝向口径（钉死）", () => {
  // MISSION_PLACEMENT（块头注释「0 朝 +z 南」）：掩蔽部门外两个日兵 yaw −π/2，往西走向刺杀处。
  const ija = P.bunker.ijaStart[0];
  const placement = YawDegFromPlacementRad(ija.yaw);
  assert.ok(near(placement, 90), `ijaStart −π/2 → +90（朝西），现在 ${placement}`);
  const f1 = ForwardFromYawDeg(placement);
  assert.ok(f1.x < -0.99, "前方朝 −X");
  assert.ok((A.bunkerKilling.x - ija.x) * f1.x + (A.bunkerKilling.z - ija.z) * f1.z > 0, "前方指向刺杀处");
  // 相机表：yawDeg 已是 0 = 北、+90 = 西；前方指向 look。
  const cam = WHITEBOX_0518_CAMERA_BY_ID.G03_1;
  const camYaw = YawDegFromCameraDeg(cam.yawDeg);
  assert.ok(near(camYaw, cam.yawDeg, 1e-9), "相机表 yawDeg 原样（只回绕）");
  const f2 = ForwardFromYawDeg(camYaw), lx = cam.look.x - cam.camera.x, lz = cam.look.z - cam.camera.z, ll = Math.hypot(lx, lz);
  assert.ok((f2.x * lx + f2.z * lz) / ll > 0.999, "相机表 yawDeg 的前方就是 look 方向");
  // END_TUNING（演员口径，EAST = −π/2）：沟口警戒兵朝东。
  const picket = END_TUNING.picketPosts[0];
  const endYaw = YawDegFromActorRad(picket.yaw);
  assert.ok(near(endYaw, -90), `END EAST → −90，现在 ${endYaw}`);
  assert.ok(ForwardFromYawDeg(endYaw).x > 0.99, "前方朝 +X（东）");
  assert.ok(near(YawDegFromActorRad(Math.PI), 180) && near(YawDegFromPlacementRad(0), 180), "两种弧度口径对南的读法");
});

// ---------------------------------------------------------------------------
// 3. 过渡

function Kf(units) { return NormalizeBlockout({ schema: BLOCKOUT_SCHEMA, level: "FirstLevel", keyframes: [{ id: "a", stage: 1, name: "a", player: { x: 0, z: 0 }, units }] }).keyframes[0]; }

Check("PlanTransition：四种 mode、短挪动夹到 minS、整段快进", () => {
  const prev = Kf([
    { id: "walker", side: "nra", x: 0, z: 0 },
    { id: "stay", side: "nra", x: 5, z: 5, yawDeg: 30 },
    { id: "short", side: "ija", x: 10, z: 0 },
    { id: "goneWalk", side: "ija", x: 20, z: 0, intent: [{ x: 20, z: -6 }] },
    { id: "gone", side: "ija", x: 30, z: 0 },
  ]);
  const next = Kf([
    { id: "walker", side: "nra", x: 0, z: -10, stance: "crouch", yawDeg: 90 },
    { id: "stay", side: "nra", x: 5, z: 5, yawDeg: 30 },
    { id: "short", side: "ija", x: 10.3, z: 0 },
    { id: "walkIn", side: "ija", x: 40, z: 0, path: [{ x: 40, z: -5 }] },
    { id: "popIn", side: "civ", x: 50, z: 0 },
  ]);
  const plan = PlanTransition(prev, next);
  const by = Object.fromEntries(plan.units.map((u) => [u.id, u]));
  assert.equal(by.walker.mode, "move");
  assert.ok(near(by.walker.endS, 10 / BLOCKOUT_DEFAULT_SPEED.nra, 1e-9), "按自然速度走");
  assert.equal(by.stay.mode, "stay");
  assert.equal(by.stay.endS, 0);
  assert.equal(by.short.mode, "move");
  assert.ok(near(by.short.endS, BLOCKOUT_TRANSITION.minS), "很短的挪动拉长到 minS");
  assert.equal(by.walkIn.mode, "appear"); assert.equal(by.walkIn.walkIn, true);
  assert.ok(near(by.walkIn.length, 5));
  assert.equal(by.popIn.mode, "appear"); assert.equal(by.popIn.walkIn, false); assert.equal(by.popIn.endS, 0);
  assert.equal(by.goneWalk.mode, "vanish"); assert.equal(by.goneWalk.walkOut, true);
  assert.equal(by.gone.mode, "vanish"); assert.equal(by.gone.walkOut, false);
  assert.equal(plan.playbackRate, 1, "8 s 以内不快进");
  assert.ok(near(plan.durationS, Math.max(...plan.units.map((u) => u.endS))));
  // 中途：位置连续、行进朝向、蹲着走、终点转到目标朝向。
  const mid = SampleTransitionUnit(by.walker, by.walker.endS / 2);
  assert.ok(near(mid.x, 0, 1e-3) && near(mid.z, -5, 1e-3), `走一半在 (0,−5)，现在 (${mid.x},${mid.z})`);
  assert.ok(near(mid.yawDeg, 0, 1e-6), "朝行进方向（北）");
  assert.equal(mid.stance, "crouch", "目标是蹲 → 蹲着走");
  assert.equal(mid.moving, true);
  const end = SampleTransitionUnit(by.walker, by.walker.endS + 1);
  assert.deepEqual([end.x, end.z, end.yawDeg, end.done, end.moving], [0, -10, 90, true, false]);
  const gone = SampleTransition(plan, plan.durationS + 1).find((u) => u.id === "gone");
  assert.equal(gone.visible, false, "消失的人过渡结束后不可见");
  // 整段超过 maxS：不提速，快进。
  const far = PlanTransition(Kf([{ id: "w", side: "nra", x: 0, z: 0 }]), Kf([{ id: "w", side: "nra", x: 0, z: -40 }]));
  assert.ok(near(far.durationS, 40 / 2.4, 1e-9));
  assert.ok(near(far.playbackRate, far.durationS / BLOCKOUT_TRANSITION.maxS, 1e-9));
  assert.ok(near(far.wallS, BLOCKOUT_TRANSITION.maxS, 1e-9));
  assert.ok(near(far.units[0].speedMps, 2.4), "单人速度不变（快进而不是冲刺）");
});

Check("SamplePath / PathLength", () => {
  const pts = [{ x: 0, z: 0 }, { x: 0, z: -4 }, { x: -3, z: -4 }];
  assert.equal(PathLength(pts), 7);
  const a = SamplePath(pts, 2);
  assert.deepEqual([a.x, a.z, a.headingYawDeg, a.done], [0, -2, 0, false]);
  const b = SamplePath(pts, 5.5);
  assert.ok(near(b.x, -1.5) && near(b.z, -4) && near(b.headingYawDeg, 90), "第二段朝西");
  const c = SamplePath(pts, 99);
  assert.deepEqual([c.x, c.z, c.done], [-3, -4, true]);
  assert.ok(near(YawDegFromTo({ x: 0, z: 0 }, { x: 1, z: 0 }), -90) && near(YawDegFromTo({ x: 0, z: 0 }, { x: 0, z: 1 }), 180));
});

// ---------------------------------------------------------------------------
// 4. 提交的文件

const COMMITTED = Object.fromEntries(BLOCKOUT_LEVEL_KEYS.map((level) => [level, ReadJson(path.join(BLOCKOUT_DIR, `${level}.json`))]));
const SECOND_SCENE = ReadJson(path.join(BLOCKOUT_DIR, "SecondLevel.scene.json"));

Check("提交的配置与场景文件通过校验、2 空格 JSON + 末尾换行", () => {
  for (const level of BLOCKOUT_LEVEL_KEYS) {
    const r = ValidateBlockout(COMMITTED[level]);
    assert.equal(r.ok, true, `${level}: ${r.errors.join("; ")}`);
    assert.equal(COMMITTED[level].level, level);
    // core.autocrlf=true 的检出会把换行变成 CRLF（仓库里存的是 LF）：比较前统一成 LF。
    const text = fs.readFileSync(path.join(BLOCKOUT_DIR, `${level}.json`), "utf8").replace(/\r\n/g, "\n");
    assert.equal(text, StringifyBlockout(JSON.parse(text)), `${level}.json 要是 JSON.stringify(doc, null, 2) + "\\n"`);
  }
  const s = ValidateBlockoutScene(SECOND_SCENE);
  assert.equal(s.ok, true, s.errors.join("; "));
  assert.deepEqual(SECOND_SCENE.bounds, SECOND_LEVEL_BOUNDS);
  assert.deepEqual([SECOND_SCENE.terrain.cols, SECOND_SCENE.terrain.rows, SECOND_SCENE.terrain.cellM], [240, 310, 1]);
});

Check("第一关：44 个关键帧与 §8 表一一对应，文字原样", () => {
  const doc = COMMITTED.FirstLevel;
  assert.equal(FIRST_LEVEL_BLOCKOUT_STATIONS.length, 44);
  assert.equal(doc.keyframes.length, FIRST_LEVEL_BLOCKOUT_STATIONS.length);
  FIRST_LEVEL_BLOCKOUT_STATIONS.forEach((st, i) => {
    const kf = doc.keyframes[i];
    assert.equal(kf.id, st.id);
    assert.equal(kf.stage, st.stage);
    assert.equal(kf.name, st.name);
    assert.equal(kf.what, st.what, `${st.id}.what 原样`);
    assert.equal(kf.next.text, st.nextText, `${st.id}.next.text 原样`);
    assert.deepEqual(kf.how, [...st.how]);
    if (st.notes) assert.ok(kf.notes.includes(st.notes), `${st.id} 的对照备注要写进 notes`);
  });
  for (const id of ["05-1", "05-2", "11-1", "12-2", "12-3", "15-1", "18-2"])
    assert.ok(FIRST_LEVEL_BLOCKOUT_STATIONS.find((s) => s.id === id).notes, `${id} 必须带对照备注`);
  // 03-2 的机位就是契约 §3 示例（K3 观察射台）。
  const k32 = doc.keyframes.find((k) => k.id === "03-2").player;
  assert.deepEqual([k32.x, k32.z, k32.yawDeg, k32.pitchDeg], [-23, -131, -33.6, -2.7]);
  // 单位 id 在关卡内稳定：同一个 id 不换阵营 / 种类。
  const identity = new Map();
  for (const kf of doc.keyframes) for (const u of kf.units) {
    const key = `${u.side}/${u.kind || "soldier"}`;
    if (identity.has(u.id)) assert.equal(identity.get(u.id), key, `${u.id} 在 ${kf.id} 换了阵营或种类`);
    else identity.set(u.id, key);
  }
  // END_TUNING 的朝向在生成结果里也是 −90（沟口警戒兵）。
  const picket = doc.keyframes.find((k) => k.id === "15-1").units.find((u) => u.id === "Picket0");
  assert.equal(picket.yawDeg, -90);
});

Check("第一关信号按 §5.4（名字以 MISSION_SCENARIO_SIGNALS 与门表为准）", () => {
  const doc = COMMITTED.FirstLevel;
  const known = new Set([...Object.keys(MISSION_SCENARIO_SIGNALS), ...MISSION_LAYOUT.gates.flatMap((g) => [g.signal, g.appearSignal]).filter(Boolean)]);
  const index = (id) => doc.keyframes.findIndex((k) => k.id === id);
  doc.keyframes.forEach((kf, i) => {
    for (const s of kf.signals) assert.ok(known.has(s), `${kf.id} 的信号 ${s} 不认识`);
    assert.equal(kf.signals.includes("BunkerCollapsed"), i >= index("01-2"), `${kf.id} BunkerCollapsed`);
    assert.equal(kf.signals.includes("MissionCourtyardGateOpen"), i >= index("10-1"), `${kf.id} MissionCourtyardGateOpen`);
    assert.equal(kf.signals.includes("MissionBridgeDestroyed"), i >= index("13-2"), `${kf.id} MissionBridgeDestroyed`);
    assert.equal(kf.signals.includes("RailBridgeDestroyed"), i >= index("18-3"), `${kf.id} RailBridgeDestroyed`);
    assert.equal(kf.signals.includes("NightGateShown"), kf.id === "18-4", `${kf.id} NightGateShown`);
    assert.deepEqual(kf.signals, FirstLevelSignalsFor(kf.id, kf.stage));
  });
});

// ---------------------------------------------------------------------------
// 5. 生成器确定性与 CLI

Check("生成器两次输出除 generatedAt 外逐字相同", () => {
  const a = BuildFirstLevelBlockoutConfig({ commit: "c", generatedAt: "2026-01-01T00:00:00Z" });
  const b = BuildFirstLevelBlockoutConfig({ commit: "c", generatedAt: "2026-02-02T00:00:00Z" });
  assert.notEqual(a.source.generatedAt, b.source.generatedAt);
  b.source.generatedAt = a.source.generatedAt;
  assert.equal(StringifyBlockout(a), StringifyBlockout(b));
  assert.equal(ValidateBlockout(a).ok, true);
  const s1 = BuildSecondLevelConfig({ commit: "c", generatedAt: "x" }), s2 = BuildSecondLevelConfig({ commit: "c", generatedAt: "x" });
  assert.equal(StringifyBlockout(s1), StringifyBlockout(s2));
});

{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "blockout-cli-"));
  try {
    const out = path.join(tmp, "FirstLevel.json");
    await CliMain(["export", "FirstLevel", `--out=${out}`, "--commit=abc", "--generated-at=2026-10-13T00:00:00Z"]);
    const first = fs.readFileSync(out, "utf8");
    fs.writeFileSync(out, "hand edited\n");
    await assert.rejects(() => CliMain(["export", "FirstLevel", `--out=${out}`]), /--force/);
    assert.equal(fs.readFileSync(out, "utf8"), "hand edited\n", "不带 --force 一个字节都不动");
    await CliMain(["export", "FirstLevel", `--out=${out}`, "--force", "--commit=abc", "--generated-at=2026-10-13T00:00:00Z"]);
    assert.equal(fs.readFileSync(out, "utf8"), first);
    assert.equal(fs.readdirSync(tmp).filter((f) => f.endsWith(".tmp")).length, 0, "不留 .tmp");
    checks++; console.log("ok  CLI export：不带 --force 拒绝覆盖，带 --force 原子写");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 6–7. 玩家点与单位 vs 实心块

/** 场景文件的块：脚落在中心与四角中最低的地面上（§2.2）。 */
function SceneSolids(scene) {
  const t = scene.terrain;
  const H = (x, z) => {
    const ix = Math.max(0, Math.min(t.cols, Math.round((x - t.minX) / t.cellM)));
    const iz = Math.max(0, Math.min(t.rows, Math.round((z - t.minZ) / t.cellM)));
    return DecodeHeightAt(t, ix, iz);
  };
  return {
    ground: H,
    blocks: scene.blocks.filter((b) => b.solid !== false).map((b) => {
      const c = Math.cos(b.ry || 0), s = Math.sin(b.ry || 0);
      const corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => {
        const lx = sx * b.w / 2, lz = sz * b.d / 2;
        return H(b.x + lx * c + lz * s, b.z - lx * s + lz * c);
      });
      const foot = Math.min(H(b.x, b.z), ...corners);
      return { ...b, y: foot + b.h / 2 };
    }),
  };
}
function InSceneSolid(solids, x, z, fromM = 0.35, toM = 1.6) {
  const g = solids.ground(x, z);
  for (const b of solids.blocks) {
    const c = Math.cos(b.ry || 0), s = Math.sin(b.ry || 0), dx = x - b.x, dz = z - b.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) > b.w / 2 || Math.abs(lz) > b.d / 2) continue;
    if (b.y + b.h / 2 < g + fromM || b.y - b.h / 2 > g + toM) continue;
    return b;
  }
  return null;
}
const InBounds = (b, p) => p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ;
const unitWarnings = [];
const UnitBand = (u) => (u.stance === "prone" || u.state === "down" ? [0.15, 0.45] : [0.35, 1.6]);

Check("第一关：每个关键帧的玩家点在边界内、不在实心块里", () => {
  const doc = COMMITTED.FirstLevel, bounds = MISSION_LAYOUT.bounds;
  const cache = new Map();
  for (const kf of doc.keyframes) {
    assert.ok(InBounds(bounds, kf.player), `${kf.id} 玩家点出了边界`);
    const key = kf.signals.join(",");
    if (!cache.has(key)) cache.set(key, FirstLevelSolidBlocks(kf.signals));
    const blocks = cache.get(key);
    const hit = SolidBlockAt(blocks, kf.player.x, kf.player.z);
    assert.equal(hit, null, `${kf.id} 玩家点 (${kf.player.x},${kf.player.z}) 落在实心块 ${hit?.id} 里`);
    if (Number.isFinite(kf.next?.x)) assert.ok(InBounds(bounds, kf.next), `${kf.id} 下一步目标出了边界`);
    for (const u of kf.units) {
      assert.ok(InBounds(bounds, u), `${kf.id} ${u.id} 出了边界`);
      const [fromM, toM] = UnitBand(u);
      const b = SolidBlockAt(blocks, u.x, u.z, { fromM, toM });
      if (b) unitWarnings.push(`FirstLevel ${kf.id} ${u.id} (${u.x},${u.z}) 在 ${b.id} 里`);
    }
  }
  // 场景态与门：关键帧的信号真的改了实心块（夜景北门 / 浮桥被炸段 / 内院门）。
  const before = FirstLevelSolidBlocks(["BunkerCollapsed"]), after = FirstLevelSolidBlocks(["BunkerCollapsed", "MissionCourtyardGateOpen", "RailBridgeDestroyed", "NightGateShown"]);
  assert.ok(before.some((b) => b.id === "MissionCourtyardGate") && !after.some((b) => b.id === "MissionCourtyardGate"), "内院门随 MissionCourtyardGateOpen 打开");
  assert.ok(!before.some((b) => b.id === "NightWallWest") && after.some((b) => b.id === "NightWallWest"), "北门夜景块随 NightGateShown 出现");
  assert.ok(!before.some((b) => b.id === "PontoonBridgeCutWallNorth") && after.some((b) => b.id === "PontoonBridgeCutWallNorth"), "浮桥断口随 RailBridgeDestroyed 出现");
});

// ---------------------------------------------------------------------------
// 8. 第一关：过渡不穿墙、玩家站得下、摆位间距、军官与担架（判失败）

/**
 * 过渡穿墙的放行名单：键 "<前一帧>→<后一帧> <单位 id>"，值写清楚为什么可以穿（例如「游戏里这一段是黑屏传送」）。
 * 没写原因、或者已经不穿了的条目本身算失败。现在是空的：2026-10-13 修完是 0 条。
 */
const TRANSITION_CROSSING_ALLOW = Object.freeze({});

Check("身体穿墙的取样口径（真墙：穿过判出、贴着走不判、扎进 0.12 m 以内不判、矮墙不判；玩家站位矮墙也算）", () => {
  const blocks = FirstLevelSolidBlocks(["BunkerCollapsed"]);
  const ids = (points) => RouteSolidCrossings(blocks, points).map((h) => h.id);
  // 灶屋西墙 KitchenWest：x 51.7–52.3、z −16.5…−1.5、高 2.9 m。
  assert.ok(ids([{ x: 50.5, z: -9 }, { x: 54, z: -9 }]).includes("KitchenWest"), "横穿灶屋西墙要判出来");
  assert.deepEqual(ids([{ x: 50.5, z: -12 }, { x: 50.5, z: -6 }]), [], "西侧夹道里贴着墙走（离墙面 1.2 m）不算");
  const face = 51.7, r = BLOCKOUT_ROUTE_BODY.radiusM, tol = BLOCKOUT_ROUTE_BODY.toleranceM;
  assert.deepEqual(ids([{ x: face - r + tol - 0.03, z: -12 }, { x: face - r + tol - 0.03, z: -6 }]), [], "身体扎进墙不到 0.12 m 不算");
  assert.ok(ids([{ x: face - r + tol + 0.03, z: -12 }, { x: face - r + tol + 0.03, z: -6 }]).includes("KitchenWest"), "扎进超过 0.12 m 算");
  // 右侧阵位北墙西段 RightNestNorthLow 只有齐腰高（高 1.29 m）：翻过去不算穿墙，但玩家站在墙根算碰到。
  assert.deepEqual(ids([{ x: 28, z: -155 }, { x: 28, z: -158.5 }]), [], "翻矮墙不算穿墙");
  assert.equal(BodyBlockAt(blocks, 28, -156.2, BLOCKOUT_PLAYER_BODY)?.id, "RightNestNorthLow", "玩家站位贴着矮墙算碰到");
  assert.equal(BodyBlockAt(blocks, 28, -155.5, BLOCKOUT_PLAYER_BODY), null, "离矮墙 0.95 m 站得下");
});

Check("第一关：相邻关键帧的过渡路线不穿高墙（PlanTransition 每条路线取样，块按两帧信号的并集）", () => {
  const doc = NormalizeBlockout(COMMITTED.FirstLevel);
  for (const [key, why] of Object.entries(TRANSITION_CROSSING_ALLOW)) assert.ok(typeof why === "string" && why.trim().length >= 4, `放行名单 ${key} 没写原因`);
  const cache = new Map(), bad = [], allowedHit = new Set();
  let routes = 0, metres = 0;
  for (let i = 1; i < doc.keyframes.length; i++) {
    const a = doc.keyframes[i - 1], b = doc.keyframes[i];
    const signals = [...new Set([...a.signals, ...b.signals])].sort();
    const key = signals.join(",");
    if (!cache.has(key)) cache.set(key, FirstLevelSolidBlocks(signals));
    // 原地不动 / 原地出现的人路线只有一个点：照样取样（站的地方本身不能扎进高墙里）。
    for (const entry of PlanTransition(a, b).units) {
      routes++; metres += entry.length;
      const hits = RouteSolidCrossings(cache.get(key), entry.route);
      if (!hits.length) continue;
      const id = `${a.id}→${b.id} ${entry.id}`;
      if (TRANSITION_CROSSING_ALLOW[id]) { allowedHit.add(id); continue; }
      bad.push(`${id}（${entry.mode}）穿过 ${hits.map((h) => `${h.id}@(${h.x},${h.z})`).join("、")}`);
    }
  }
  assert.ok(routes > 300, `取样的路线太少（${routes}），过渡计划可能没算出来`);
  const stale = Object.keys(TRANSITION_CROSSING_ALLOW).filter((id) => !allowedHit.has(id));
  assert.deepEqual(stale, [], `放行名单里这些已经不穿墙了，删掉：${stale.join("、")}`);
  assert.equal(bad.length, 0, `${bad.length} 条过渡路线穿墙：\n  ${bad.join("\n  ")}`);
  console.log(`    ${routes} 条路线、共 ${Math.round(metres)} m 每 ${BLOCKOUT_ROUTE_BODY.stepM} m 取样：穿高墙 0 条（放行 ${Object.keys(TRANSITION_CROSSING_ALLOW).length}）`);
});

Check("第一关：每个玩家站位放得下一个站着的人（半径 0.3 m、离地 0.35–1.6 m，任何实心块）", () => {
  for (const kf of COMMITTED.FirstLevel.keyframes) {
    const hit = BodyBlockAt(FirstLevelSolidBlocks(kf.signals), kf.player.x, kf.player.z, BLOCKOUT_PLAYER_BODY);
    assert.equal(hit, null, `${kf.id} 玩家站位 (${kf.player.x},${kf.player.z}) 碰到 ${hit?.id}`);
  }
});

Check("第一关：摆位间距（人离玩家 / 担架 / 抬担架的人，单位不叠）；下一步目标不落在玩家脚下", () => {
  // 口径先用合成关键帧钉住。
  const S = BLOCKOUT_SPACING;
  const kf = (units, next = null) => NormalizeBlockout({ schema: BLOCKOUT_SCHEMA, level: "FirstLevel", keyframes: [{ id: "a", stage: 1, name: "a",
    player: { x: 0, z: 0 }, what: "", next: next || { text: "t" }, units }] }).keyframes[0];
  const litter = { id: "L", side: "nra", kind: "litter", x: 0, z: -10, yawDeg: 0 };   // 朝北：前头抬的人在 (0, −11.6)，后头 (0, −8.4)
  assert.deepEqual(FirstLevelSpacingIssues(kf([litter, { id: "p", side: "nra", x: 2, z: -10 }])), [], "担架边上 2 m 没问题");
  assert.equal(FirstLevelSpacingIssues(kf([{ id: "p", side: "nra", x: 0.5, z: 0.5 }])).length, 1, "离玩家 0.7 m 要报");
  assert.deepEqual(FirstLevelSpacingIssues(kf([{ id: "d", side: "nra", x: 0.6, z: 0, state: "down" }])), [], "倒地的人可以躺在玩家脚边");
  assert.equal(FirstLevelSpacingIssues(kf([litter, { id: "p", side: "nra", x: 0.2, z: -11.6 }])).length, 1, "站在前头抬的人身上要报");
  assert.equal(FirstLevelSpacingIssues(kf([{ ...litter, bearers: 1 }, { id: "p", side: "nra", x: 0.2, z: -8.2 }])).length, 0, "bearers 1：后头没人，站后抬杆处（老耿）不报");
  assert.equal(FirstLevelSpacingIssues(kf([{ ...litter, bearers: 0 }, { id: "p", side: "nra", x: 0, z: -11.6 }])).length, 0, "bearers 0：没人抬");
  assert.equal(FirstLevelSpacingIssues(kf([{ id: "a", side: "ija", x: 5, z: 5 }, { id: "b", side: "ija", x: 5.5, z: 5.3 }])).length, 1, "两个单位 0.58 m 要报");
  assert.equal(FirstLevelSpacingIssues(kf([], { text: "t", x: 1, z: 1 })).length, 1, "下一步目标离玩家 1.4 m 要报");
  // 提交的配置。
  const doc = NormalizeBlockout(COMMITTED.FirstLevel);
  const bad = doc.keyframes.flatMap((k) => FirstLevelSpacingIssues(k).map((line) => `${k.id} ${line}`));
  assert.equal(bad.length, 0, `${bad.length} 处摆位间距不够：\n  ${bad.join("\n  ")}`);
  for (const k of COMMITTED.FirstLevel.keyframes) {
    if (!Number.isFinite(k.next?.x)) continue;
    assert.ok(Math.hypot(k.next.x - k.player.x, k.next.z - k.player.z) >= S.nextM, `${k.id} 下一步目标离玩家不到 ${S.nextM} m，应只写文字`);
  }
  // 12-1：要守的是排队道（追兵机枪扫的那一点），不是玩家自己站的低墙射位。
  const k121 = COMMITTED.FirstLevel.keyframes.find((k) => k.id === "12-1");
  assert.deepEqual([k121.next.x, k121.next.z], [MID_TUNING.loadingThreatPoint.x, MID_TUNING.loadingThreatPoint.z]);
  // CLI validate / export 报的问题清单与上面同口径，也是空的。
  assert.deepEqual(FirstLevelBlockoutIssues(COMMITTED.FirstLevel), []);
});

Check("第一关：军官是 kind officer；床位上的老周担架 bearers 0 不是 down；倒下的抬担架的人仍是 down", () => {
  const doc = COMMITTED.FirstLevel;
  const all = (id) => doc.keyframes.flatMap((k) => k.units.filter((u) => u.id === id).map((u) => [k.id, u]));
  for (const id of ["FrontOfficer", "bridgeOfficer"]) {
    const list = all(id);
    assert.ok(list.length > 0, `${id} 没出现`);
    for (const [k, u] of list) assert.equal(u.kind, "officer", `${k} ${id} 应是 kind officer`);
  }
  for (const k of ["17-1", "18-1"]) {
    const u = doc.keyframes.find((x) => x.id === k).units.find((x) => x.id === "Litter5");
    assert.equal(u.bearers, 0, `${k} 老周在床位上，担架没人抬`);
    assert.notEqual(u.state, "down", `${k} 老周的担架不是「抬的人倒了」`);
  }
  for (const k of ["13-2", "14-1", "14-2"]) {
    const u = doc.keyframes.find((x) => x.id === k).units.find((x) => x.id === "Litter6");
    assert.equal(u.state, "down", `${k} Litter6 抬的人被扫倒（检查点 fallen）`);
    assert.notEqual(u.bearers, 0, `${k} Litter6 down 的意思是抬的人倒了，得有人`);
  }
  for (const k of doc.keyframes) for (const u of k.units) {
    if (u.bearers !== undefined) assert.equal(u.kind, "litter", `${k.id} ${u.id} 只有担架有 bearers`);
    if (u.kind === "litter" && u.state === "down") assert.notEqual(u.bearers, 0, `${k.id} ${u.id}：没人抬的担架不能是 down`);
  }
});

Check("第二关：玩家点在边界内、不在实心块里；寨门 / 两处缺口 / 主路留空；高度对得上城区地面", () => {
  const solids = SceneSolids(SECOND_SCENE);
  for (const kf of COMMITTED.SecondLevel.keyframes) {
    assert.ok(InBounds(SECOND_SCENE.bounds, kf.player), `${kf.id} 玩家点出了边界`);
    const hit = InSceneSolid(solids, kf.player.x, kf.player.z);
    assert.equal(hit, null, `${kf.id} 玩家点落在 ${hit?.id} 里`);
    assert.equal(kf.units.length, 0, "第二关草稿不放单位");
    for (const id of ["zhaiGate", "breachNorth", "breachSouth", "gully", "eastGuangStreet"]) assert.ok(kf.pois.some((p) => p.id === id), `${kf.id} 缺 POI ${id}`);
    for (const u of kf.units) {
      const [fromM, toM] = UnitBand(u);
      const b = InSceneSolid(solids, u.x, u.z, fromM, toM);
      if (b) unitWarnings.push(`SecondLevel ${kf.id} ${u.id} 在 ${b.id} 里`);
    }
  }
  for (const [x, z, what] of [[540, -65, "寨门洞"], [540, -24, "北缺口"], [540, 52, "南缺口"], [470, -65, "主路"], [449, -150, "东关大街"]])
    assert.equal(InSceneSolid(solids, x, z), null, `${what} (${x},${z}) 应当走得通`);
  for (const [x, z] of [[540, -100], [540, 0]]) assert.ok(InSceneSolid(solids, x, z)?.id.startsWith("ZhaiWall"), `(${x},${z}) 应当是寨墙`);
  const wall = SecondLevelZhaiWallBlocks();
  assert.ok(wall.some((b) => b.id === "ZhaiGatePierNorth") && wall.some((b) => b.id === "ZhaiGatePierSouth"));
  for (const b of SecondLevelCourtyardBlocks()) {
    assert.ok(Math.abs(b.z + 65) >= b.d / 2 + 4.2 - 0.02, `${b.id} 压到了主路`);   // 坐标与尺寸取到厘米
    assert.ok(b.x + b.w / 2 <= 540 - 1.2 + 0.02, `${b.id} 越过了寨墙内侧`);
  }
  // r2 调查在 node 里采的城区地面值（z=0 一线）：网格节点解码回来对得上。
  const t = SECOND_SCENE.terrain;
  for (const [x, z, y] of [[540, 0, -0.21], [548, 0, -1.55], [552, 0, -3.4], [560, 0, -2.67], [520, -65, 0], [550, -65, -2.49]]) {
    const got = DecodeHeightAt(t, x - t.minX, z - t.minZ);
    assert.ok(Math.abs(got - y) <= 0.011, `(${x},${z}) 高度 ${got}，城区地面 ${y}`);
  }
});

console.log(unitWarnings.length ? `警告：${unitWarnings.length} 个单位落在实心块里（不算失败）：\n  ${unitWarnings.join("\n  ")}` : "单位都不在实心块里");
console.log(`EditorBlockoutConfigTest 通过：${checks} 组检查`);
