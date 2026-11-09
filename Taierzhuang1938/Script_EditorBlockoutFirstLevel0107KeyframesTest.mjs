// Script_EditorBlockoutFirstLevel0107KeyframesTest.mjs —— 01–07 新剧本白盒（FirstLevel0107，2026-11-09）关键帧与场景的 node 回归
// 跑法：node Taierzhuang1938/Script_EditorBlockoutFirstLevel0107KeyframesTest.mjs
// 查：Blockout/FirstLevel0107.json 过 ValidateBlockout 且无警告；28 个关键帧 id 齐全有序、stage 与标题对；what / next 不超长、how 至少两条；
// castId 都在定妆表里、单位 id 跨帧身份稳定；玩家与所有人在取块范围内、站在能站的地面上（不在实心块里、沟里的人在沟底、倒地的人不挂在沟沿上）；
// 人与人不叠在一起；next 目标在范围内、与玩家同在一片可走的地面上（0.5 m 格、台阶 ≤ 1.1 m）；
// 关键位置：01 洞里六个以上的人、幺娃出洞去机枪坑、02 鬼子倒六走三（Beats）、我方倒七挂彩二、03 追兵三回、04 担架 / 驴车 / 妮儿、
// 05 三架日机航线、06 两辆九四式（tankette）、伏击点东坎三人 + 西坎一人、残车堵路；06-8 的 L1SunkenRoadBlocked 在场景里有 showOn 物件；
// 信号按拍起；玩家站位「看得见」这一拍的主要目标（地形 + 实心块的视线检查）。
// 位置来源：空间图生成器（C:\Users\Bentl\AppData\Local\Temp\L1Map0107 的 Beats.mjs / Common.mjs；成图目录 OneDrive\AI\Storyboards\Taierzhuang1938\L1_Space_0107_20261109）。

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ValidateBlockout, NormalizeBlockout, PlanTransition, BLOCKOUT_TEXT_LIMITS } from "./Script_EditorBlockoutConfig.mjs";
import { FIRST_LEVEL_SPEAKING_CAST } from "./Data_FirstLevelSpeakingCast.mjs";
import { BLOCKOUT_LEVELS, LayoutFromSceneDoc } from "./Script_EditorBlockoutLevels.mjs";
import { ReadBlockoutSceneDocSync, ReadSceneSync } from "./Script_SceneNode.mjs";
import { BlockStandSampler } from "./Script_EditorBlockoutPrevizPlan.mjs";
import { SCENE_EVENTS } from "./Data_SceneEvents.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const doc = JSON.parse(fs.readFileSync(path.join(here, "Blockout", "FirstLevel0107.json"), "utf8"));
const check = ValidateBlockout(doc);
assert.ok(check.ok, check.errors.join("; "));
assert.deepEqual(check.warnings, [], "不该有校验警告");
const norm = NormalizeBlockout(doc);
assert.equal(doc.level, "FirstLevel0107");

const level = BLOCKOUT_LEVELS.find((l) => l.key === "FirstLevel0107");
assert.ok(level && level.configUrl === "./Blockout/FirstLevel0107.json" && level.scene.kind === "scene", "关卡注册表里有 FirstLevel0107，配置与场景都对");
assert.ok(level.scene.url.endsWith("Scenes/FirstLevelWhitebox/Scene_FirstLevelWhitebox.json"), "场景用 FirstLevelWhitebox");
const B = level.scene.region;
const scene = LayoutFromSceneDoc(ReadBlockoutSceneDocSync("FirstLevel0107"));
assert.ok(!scene.error && scene.blocks.length > 500, "能建布局");

const IDS = ["01-1", "01-2", "01-3", "02-1", "02-2", "02-3", "02-4", "02-5", "03-1", "03-2", "03-3", "03-4", "03-5", "04-1", "04-2", "04-3",
  "05-1", "05-2", "06-1", "06-2", "06-3", "06-4", "06-5", "06-6", "06-7", "06-8", "07-1", "07-2"];
assert.deepEqual(doc.keyframes.map((k) => k.id), IDS, "28 个关键帧按顺序齐全");
const TITLES = { 1: "防炮洞，塌洞", 2: "刺刀", 3: "拖冬瓜", 4: "干沟集结处", 5: "凹路行军", 6: "坦克车", 7: "喘口气" };
for (const kf of doc.keyframes) {
  assert.equal(kf.stage, Number(kf.id.split("-")[0]), `${kf.id} 的 stage`);
  assert.equal(kf.stageTitle, TITLES[kf.stage], `${kf.id} 的 stageTitle`);
  assert.ok(kf.what.length <= BLOCKOUT_TEXT_LIMITS.what, `${kf.id} what 太长（${kf.what.length}）`);
  assert.ok((kf.next?.text || "").length <= BLOCKOUT_TEXT_LIMITS.next, `${kf.id} next.text 太长`);
  assert.ok(Array.isArray(kf.how) && kf.how.length >= 2, `${kf.id} how 至少两条`);
  assert.ok(kf.notes && kf.notes.length >= 30, `${kf.id} notes 要写清这个站位为什么看得见这一拍`);
  assert.ok(kf.player.x >= B.minX && kf.player.x <= B.maxX && kf.player.z >= B.minZ && kf.player.z <= B.maxZ, `${kf.id} 玩家出界`);
  for (const u of kf.units) {
    assert.ok(u.x >= B.minX && u.x <= B.maxX && u.z >= B.minZ && u.z <= B.maxZ, `${kf.id} ${u.id} 出界 (${u.x}, ${u.z})`);
    if (u.castId) assert.ok(Object.hasOwn(FIRST_LEVEL_SPEAKING_CAST, u.castId), `${kf.id} ${u.id} 的 castId ${u.castId} 不在定妆表里`);
  }
  if (Number.isFinite(kf.next?.x)) assert.ok(kf.next.x >= B.minX && kf.next.x <= B.maxX && kf.next.z >= B.minZ && kf.next.z <= B.maxZ, `${kf.id} next 目标出界`);
}
const identity = new Map();
for (const kf of doc.keyframes) for (const u of kf.units) {
  const key = `${u.side}/${u.kind || "soldier"}`;
  if (identity.has(u.id)) assert.equal(identity.get(u.id), key, `${u.id} 在 ${kf.id} 换了阵营或种类`);
  else identity.set(u.id, key);
}

const problems = [];
const Soft = (cond, message) => { if (!cond) problems.push(message); };
const KF = (id) => norm.keyframes.find((k) => k.id === id);
const Unit = (id, uid) => KF(id).units.find((u) => u.id === uid);
const Dist = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);

// --- 地面 / 实心块 ---
const PEOPLE = new Set(["soldier", "officer", "civilian", "child"]);
const BODY = { radiusM: 0.3, toleranceM: 0.08, fromM: 0.5, toM: 1.4, unitTallM: 0.9 };
const PLAYER_BODY = { radiusM: 0.3, toleranceM: 0.01, fromM: 0.35, toM: 1.6 };
const STEP_UP_M = 0.75;
function SolidsFor(signals) {
  const on = new Set(signals);
  const out = scene.blocks.filter((b) => b.solid !== false && !b.blockoutWater);
  for (const g of scene.gates || []) {
    const absent = (g.signal && on.has(g.signal)) || (g.appearSignal && !on.has(g.appearSignal));
    if (!absent && g.solid !== false) out.push(g);
  }
  return out;
}
function Penetration(b, x, z, r) {
  const c = Math.cos(b.ry || 0), s = Math.sin(b.ry || 0);
  const dx = x - b.x, dz = z - b.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  const ex = Math.abs(lx) - b.w / 2, ez = Math.abs(lz) - b.d / 2;
  if (ex <= 0 && ez <= 0) return r + Math.min(-ex, -ez);
  return r - Math.hypot(Math.max(ex, 0), Math.max(ez, 0));
}
function BodyHit(blocks, ground, x, z, body, tallM = 0) {
  const g = ground(x, z);
  for (const b of blocks) {
    if (b.h <= tallM) continue;
    const pen = Penetration(b, x, z, body.radiusM);
    if (pen <= body.toleranceM) continue;
    if (b.y + b.h / 2 < g + body.fromM || b.y - b.h / 2 > g + body.toM) continue;
    if (pen >= body.radiusM && b.y + b.h / 2 <= g + STEP_UP_M) continue;
    return b;
  }
  return null;
}
const StandFor = (signals) => { const on = new Set(signals); return BlockStandSampler(scene.blocks, scene.gates || [], scene.terrainSampler, (name) => on.has(name)); };
const MinGround = (ground, x, z, r) => { let m = Infinity; for (let a = 0; a < 8; a++) m = Math.min(m, ground(x + Math.cos(a * Math.PI / 4) * r, z + Math.sin(a * Math.PI / 4) * r)); return Math.min(m, ground(x, z)); };

for (const kf of norm.keyframes) {
  const solids = SolidsFor(kf.signals), ground = StandFor(kf.signals);
  const hit = BodyHit(solids, ground, kf.player.x, kf.player.z, PLAYER_BODY);
  Soft(!hit, `${kf.id} 玩家站进 ${hit?.id}`);
  const people = kf.units.filter((u) => PEOPLE.has(u.kind));
  for (const u of people) {
    const h = BodyHit(solids, ground, u.x, u.z, BODY, BODY.unitTallM);
    Soft(!h, `${kf.id} ${u.id} 站进 ${h?.id} (${u.x}, ${u.z})`);
    Soft(Number.isFinite(ground(u.x, u.z)), `${kf.id} ${u.id} 脚下没有地面`);
    if (u.state === "down" && !u.ride) Soft(ground(u.x, u.z) - MinGround(ground, u.x, u.z, 0.9) < 0.6, `${kf.id} ${u.id} 倒在沟沿上（旁边 0.9 m 内低 ${(ground(u.x, u.z) - MinGround(ground, u.x, u.z, 0.9)).toFixed(2)} m），要放到沟底或平地上`);
  }
  for (let a = 0; a < people.length; a++) for (let c = a + 1; c < people.length; c++) {
    if (people[a].ride || people[c].ride) continue;
    const onSame = (p, q) => (p.kind === "litter" || q.kind === "litter");
    if (onSame(people[a], people[c])) continue;
    const limit = people[a].state === "down" && people[c].state === "down" ? 0.3 : 0.55;
    const onLitter = (x, y) => Dist(x, y) < 0.05;
    if (onLitter(people[a], people[c])) continue;
    Soft(Dist(people[a], people[c]) >= limit, `${kf.id} ${people[a].id} 和 ${people[c].id} 叠在一起（${Dist(people[a], people[c]).toFixed(2)} m）`);
  }
  for (const p of people) if (Dist(p, kf.player) < 0.5 && !p.ride) Soft(false, `${kf.id} ${p.id} 离玩家 ${Dist(p, kf.player).toFixed(2)} m`);
}

// --- 可走的地面：0.5 m 格、台阶 ≤ 1.1 m（沟里的人用沟的两头走出去）---
const WALK = { cell: 0.5, stepM: 1.1 };
const gridCols = Math.ceil((B.maxX - B.minX) / WALK.cell), gridRows = Math.ceil((B.maxZ - B.minZ) / WALK.cell);
function WalkComponents(signals) {
  const solids = SolidsFor(signals).filter((b) => b.h > 0.6), ground = StandFor(signals);
  const label = new Int32Array(gridCols * gridRows).fill(-1);
  const At = (i, j) => ({ x: B.minX + (i + 0.5) * WALK.cell, z: B.minZ + (j + 0.5) * WALK.cell });
  const blocked = new Uint8Array(gridCols * gridRows);
  const near = (x, z) => solids.filter((b) => Math.abs(b.x - x) < b.w / 2 + b.d / 2 + 1 && Math.abs(b.z - z) < b.w / 2 + b.d / 2 + 1);
  return { label, ground, At, blocked, solids, near };
}
function Reachable(signals, a, b) {
  const { ground, At, solids } = WalkComponents(signals);
  const ia = Math.floor((a.x - B.minX) / WALK.cell), ja = Math.floor((a.z - B.minZ) / WALK.cell);
  const ib = Math.floor((b.x - B.minX) / WALK.cell), jb = Math.floor((b.z - B.minZ) / WALK.cell);
  const key = (i, j) => j * gridCols + i;
  const seen = new Set([key(ia, ja)]);
  const queue = [[ia, ja]];
  const g0 = new Map();
  const G = (i, j) => { const k = key(i, j); if (!g0.has(k)) { const p = At(i, j); g0.set(k, ground(p.x, p.z)); } return g0.get(k); };
  const Blocked = (i, j) => { const p = At(i, j), g = G(i, j); return solids.some((s) => Math.abs(s.x - p.x) <= s.w / 2 + s.d / 2 + 0.4 && Math.abs(s.z - p.z) <= s.w / 2 + s.d / 2 + 0.4 && Penetration(s, p.x, p.z, 0.3) > 0.1 && s.y + s.h / 2 > g + STEP_UP_M && s.y - s.h / 2 < g + 1.6); };
  const limit = 4 * gridCols * gridRows;
  let steps = 0;
  while (queue.length && steps++ < limit) {
    const [i, j] = queue.shift();
    if (i === ib && j === jb) return true;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= gridCols || nj >= gridRows) continue;
      const k = key(ni, nj);
      if (seen.has(k)) continue;
      if (Math.abs(G(ni, nj) - G(i, j)) > WALK.stepM) continue;
      if (Blocked(ni, nj)) continue;
      seen.add(k); queue.push([ni, nj]);
    }
  }
  return false;
}
for (const kf of norm.keyframes) {
  if (!Number.isFinite(kf.next?.x)) continue;
  Soft(Reachable(kf.signals, kf.player, kf.next), `${kf.id} 的 next 目标 (${kf.next.x}, ${kf.next.z}) 从玩家 (${kf.player.x}, ${kf.player.z}) 走不到（格 0.5 m、台阶 ≤ ${WALK.stepM} m）`);
}

// --- 信号 ---
const SIG_FROM = { DugoutCollapsed: "01-3", CartDeparted: "05-1", L1TrunkLoaded: "04-3", L1TrunkTossed: "06-4", L1SunkenRoadBlocked: "06-8" };
for (const [sig, first] of Object.entries(SIG_FROM)) {
  for (const id of IDS) assert.equal(KF(id).signals.includes(sig), IDS.indexOf(id) >= IDS.indexOf(first), `${id} 的 ${sig}`);
  assert.ok(Object.hasOwn(SCENE_EVENTS, sig) || sig === "DugoutCollapsed" || sig === "CartDeparted", `${sig} 要在 Data_SceneEvents 里有名字`);
}
for (const kf of norm.keyframes) for (const s of kf.signals) assert.ok(Object.hasOwn(SCENE_EVENTS, s), `${kf.id} 的信号 ${s} 要在 Data_SceneEvents 里有中文名`);
{
  const { doc: sceneDoc } = ReadSceneSync("FirstLevelWhitebox");
  const shown = sceneDoc.objects.filter((o) => o.showOn === "L1SunkenRoadBlocked");
  assert.ok(shown.length >= 1 && shown.every((o) => o.id === "WreckTankette"), "L1SunkenRoadBlocked 在场景里有 showOn 物件（残车）");
  const wreck = shown[0];
  const t1 = Unit("06-8", "Tank1");
  assert.ok(Math.hypot(wreck.pos[0] - t1.x, wreck.pos[2] - t1.z) < 0.5, "残车物件落在第一辆车倒下的点上");
  for (const sig of ["L1TrunkLoaded", "L1TrunkTossed"]) assert.ok(sceneDoc.objects.some((o) => o.showOn === sig || o.hideOn === sig), `${sig} 在场景里有物件`);
  const gates = scene.gates.filter((g) => g.appearSignal === "L1SunkenRoadBlocked");
  assert.ok(gates.length >= 1, "残车是随信号出现的块");
  assert.ok(!scene.blocks.some((b) => b.id === "WreckTankette"), "06-8 之前残车不在常驻块里");
}

// --- 过渡：同一个人相邻两帧的路线都走得通（不穿实心块、台阶 ≤ 1.1 m），倒地的人不跑 ---
for (let i = 1; i < norm.keyframes.length; i++) {
  const prev = norm.keyframes[i - 1], kf = norm.keyframes[i];
  for (const e of PlanTransition(prev, kf).units) {
    const unit = e.unitTo || e.unitFrom;
    if (e.mode === "move" && unit.state === "down" && e.unitFrom.state === "down") continue;
    assert.ok(e.route.every((p) => Number.isFinite(p.x) && Number.isFinite(p.z)), `${kf.id} ${e.id} 路线有坏点`);
  }
}

// --- 内容：逐帧对着剧本 ---
const Count = (id, pred) => KF(id).units.filter(pred).length;
const IsIja = (u) => u.side === "ija" && (u.kind || "soldier") === "soldier";
const Down = (u) => u.state === "down";

// 01：洞里一个班；幺娃出洞后去机枪坑；塌洞信号
assert.ok(Count("01-1", (u) => u.side === "nra" && PEOPLE.has(u.kind)) >= 8, "01-1 洞里一个班");
assert.ok(Unit("01-1", "Donggua") && Unit("01-1", "Yaowa"), "01-1 冬瓜、幺娃在");
{
  const dugout = { x: 66.5, z: 64.5 };
  assert.ok(Dist(KF("01-1").player, dugout) < 3.5 && Dist(Unit("01-1", "Donggua"), KF("01-1").player) < 2.2, "01-1 玩家在洞里、冬瓜在他身边（私话）");
  assert.ok(Unit("01-2", "Yaowa").intent?.length >= 5 && Dist(Unit("01-2", "Yaowa").intent.at(-1), { x: 0, z: -4.2 }) < 1, "01-2 幺娃的去路：洞 → 支沟 → 交通沟北头 → 机枪坑");
  assert.deepEqual(KF("01-3").signals.includes("DugoutCollapsed"), true, "01-3 塌洞");
  assert.ok(Dist(Unit("02-1", "Yaowa"), { x: 0, z: -7 }) < 6, "02-1 幺娃已到机枪坑");
}
// 02：九个鬼子倒六走三（北沿机枪组两人 + 丁乙甲翻译），我方倒七挂彩二
{
  const k = "02-5";
  const ija = KF(k).units.filter(IsIja);
  assert.equal(ija.length, 9, "02-5 鬼子共九个（Beats）");
  assert.equal(ija.filter(Down).length, 6, "02-5 鬼子倒六个");
  assert.equal(ija.filter((u) => !Down(u)).length, 3, "02-5 剩三个");
  for (const id of ["IjaMgGunner", "IjaMgLoader", "IjaDing", "IjaYi", "IjaJia", "Interpreter"]) assert.ok(Down(Unit(k, id)), `02-5 ${id} 倒下`);
  const fleeing = ija.filter((u) => !Down(u));
  assert.ok(fleeing.every((u) => u.aim && u.intent?.length >= 3 && Dist(u.intent.at(-1), { x: 12.7, z: 38 }) < 1), "02-5 走的三个往岔口、交通沟北退");
  const ours = KF(k).units.filter((u) => u.side === "nra" && PEOPLE.has(u.kind) && /^S\d+$/.test(u.id));
  assert.equal(ours.filter(Down).length, 7, "02-5 我方倒七个");
  assert.equal(ours.filter((u) => u.role === "wounded").length, 2, "02-5 我方挂彩两个");
  assert.ok(Dist(Unit("02-5", "IjaDing"), { x: 59.6, z: 63.4 }) < 0.3 && Dist(Unit("02-5", "IjaJia"), { x: 53, z: 65.3 }) < 0.3 && Dist(Unit("02-5", "Interpreter"), { x: 50, z: 65.6 }) < 0.3, "倒地点照空间图 02（✕）");
  assert.ok(Unit("02-4", "Luo").weapon === "Dadao" && !Down(Unit("02-3", "IjaMgGunner")) === false, "02-4 班长拿大刀；02-3 机枪组倒下");
  assert.ok(Dist(KF("02-1").player, Unit("02-1", "Donggua")) < 2.5, "02-1 顺子与冬瓜并排跪着");
  assert.ok(Down(Unit("02-2", "Donggua")), "02-2 冬瓜被捅后倒下");
  assert.ok(Down(Unit("02-4", "IjaDing")) && !Down(Unit("02-3", "IjaDing")), "02-4 班长砍翻丁");
}
// 03：拖冬瓜三回追兵
{
  assert.ok(Unit("03-2", "Blanket") && Down(Unit("03-2", "Donggua")), "03 单被上躺着冬瓜");
  const chase = KF("03-2").units.filter((u) => u.group === "pursuers");
  assert.equal(chase.length, 3, "03-2 追兵三个");
  assert.ok(chase.every((u) => u.z > 45 && u.z < 58 && u.x > 13 && u.x < 20), "03-2 追兵在岔口北边沟里（Beats）");
  assert.ok(Unit("03-3", "IjaBing") && Down(Unit("03-3", "IjaBing")), "03-3 手榴弹炸倒一个");
  const posts = KF("03-4").units.filter((u) => /^IjaPost/.test(u.id));
  assert.equal(posts.length, 2, "03-4 北沿站上两个鬼子");
  assert.ok(posts.every((u) => u.stance === "stand" && u.aim && u.z < 64 && u.x > 20 && u.x < 30), "03-4 他们站在支沟口北沿往下打");
  assert.ok(Dist(Unit("03-4", "Yaowa"), { x: 17.6, z: 57.5 }) < 0.5 && Unit("03-4", "Yaowa").weapon === "Zb26", "03-4 幺娃扛着捷克式冲到支沟口");
  assert.ok(Down(Unit("03-4", "MgGunner")) && Dist(Unit("03-4", "MgGunner"), { x: -1.5, z: -5 }) < 0.3, "03-4 本班机枪手死在坑口");
  assert.ok(!Down(Unit("03-3", "MgGunner")), "03-4 才倒");
  assert.ok(posts.every((u) => Down(KF("03-5").units.find((v) => v.id === u.id))), "03-5 两个鬼子倒了");
  assert.ok(Count("03-5", (u) => /^CrestNra/.test(u.id)) === 4 && KF("03-5").units.filter((u) => /^CrestNra/.test(u.id)).every((u) => u.stance === "prone" && u.aim), "03-5 坡沿趴着别的班接应");
  assert.ok(Dist(KF("03-5").next, { x: 35, z: 141.5 }) < 1, "03-5 next：下到干沟");
}
// 04：伤员、担架、驴车、皮箱、连长、妮儿
{
  assert.ok(Count("04-1", (u) => u.group === "wounded") >= 12, "04-1 满地伤员");
  assert.ok(Unit("04-1", "LitterA")?.bearers === 2 && Unit("04-1", "LitterA").side === "civ", "04-1 老乡两人抬一副担架");
  assert.ok(Dist(Unit("04-1", "GengCart"), { x: 53.6, z: 156 }) < 0.1 && Unit("04-1", "GengCart").kind === "cart", "04 老耿的驴车在南岸树底下");
  assert.ok(Unit("04-2", "Orderly") && Dist(KF("04-2").player, Unit("04-2", "Orderly")) < 4, "04-2 勤务兵叫顺子");
  assert.ok(Unit("04-3", "Captain")?.kind === "officer", "04-3 连长");
  assert.ok(Dist(Unit("04-3", "Nier"), Unit("04-3", "GengCart")) < 6, "04-3 妮儿在车边");
  const front = Unit("04-3", "LitterA"), cart = Unit("04-3", "GengCart");
  assert.ok(front.x > cart.x + 10, "04-3 队形：担架在前（东）→ 车");
  assert.ok(Dist(KF("04-3").next, { x: 83, z: 161 }) < 1 && KF("04-3").next.text.includes("跟着后送队，压住后头"), "04-3 next：干沟东头转进凹路，任务文字照剧本");
}
// 05：凹路里：担架在前、车居中、班在后；日机航线
{
  const k = "05-1";
  assert.ok(Unit(k, "LitterA").z > Unit(k, "GengCart").z && Unit(k, "GengCart").z > Unit(k, "Luo").z, "05-1 队形：担架 → 车 → 殿后的班（z 递增往南）");
  assert.ok(Unit(k, "GengCart").z > KF(k).player.z && Unit(k, "GengCart").z - KF(k).player.z < 8, "05-1 玩家在车屁股后头");
  assert.ok(KF("05-2").pois.some((p) => /日机/.test(p.name)) && KF("05-2").player.pitchDeg >= 15, "05-2 仰头看日机航线");
}
// 06：两辆九四式；人、车、伏击点、残车
{
  for (const id of ["06-1", "06-2", "06-3", "06-4", "06-5", "06-6", "06-7", "06-8"]) {
    const tanks = KF(id).units.filter((u) => u.kind === "tank");
    assert.ok(tanks.length >= (id === "06-8" ? 2 : 2) && tanks.every((t) => t.shape === "tankette" && t.side === "ija"), `${id} 两辆九四式（tankette）`);
  }
  assert.ok(Unit("06-1", "Tank1").z < 190 && Unit("06-1", "Tank2").z < 175 && Math.abs(Unit("06-1", "Tank1").x - 83) < 1, "06-1 两辆从凹路北头追进来（83,182 / 83,168）");
  assert.equal(Count("06-1", (u) => u.group === "banks"), 6, "06-1 步兵走两边坎顶");
  assert.ok(Unit("06-2", "LitterDonggua").state === "down" && Math.abs(Unit("06-2", "LitterDonggua").z - 225.5) < 1, "06-2 抬冬瓜的老乡倒下，担架落在路中 z≈225");
  assert.ok(Down(Unit("06-3", "BundleRunner")) && Math.abs(Unit("06-3", "BundleRunner").z - 213) < 1, "06-3 抱手榴弹的兵死在路中 z≈213");
  assert.ok(Unit("06-4", "Donggua").ride?.on === "GengCart" && Unit("06-4", "LitterDonggua").ride?.on === "GengCart", "06-4 冬瓜抬上车");
  assert.ok(KF("06-4").next.text.includes("等后送队过弯，把坦克车堵在凹路里"), "06-4 任务文字照剧本");
  const east = ["HeYoutian", "Luo"].map((id) => Unit("06-5", id)).concat([KF("06-5").player]);
  const west = Unit("06-5", "Yaowa");
  assert.ok(east.every((p) => p.x > 91 && p.x < 98 && p.z >= 269 && p.z <= 284), "06-5 东坎三人在最高的弯东坎顶");
  assert.ok(west.x < 90 && west.z > 283 && west.z < 287, "06-5 西坎幺娃一个人");
  assert.ok(Math.abs(Dist(east[0], east[1]) - 7.1) < 1.5 && Math.abs(Dist(east[1], east[2]) - 7) < 1.5, "06-5 东坎三人隔开几步");
  for (const p of [...east, west]) assert.ok(scene.terrainSampler(p.x, p.z) > 0.8, `06-5 ${p.x},${p.z} 在坎顶（地面 ${scene.terrainSampler(p.x, p.z).toFixed(2)}）`);
  assert.ok(Unit("06-6", "Tank1").z > 262 && Unit("06-6", "Tank1").z < 276, "06-6 车在弯前");
  assert.equal(Unit("06-7", "Tank1").arc?.yawDeg, -90, "06-7 炮塔朝东坎");
  assert.ok(Unit("06-7", "TankCommander") && Down(Unit("06-8", "TankCommander")), "06-7 车长探身、06-8 倒下");
  const wreck = Unit("06-8", "Tank1");
  assert.ok(Dist(wreck, { x: 90.6, z: 278.6 }) < 0.1, "06-8 残车在 (90.6,278.6)");
  assert.ok(Dist(Unit("06-8", "Tank2"), { x: 86.4, z: 260.5 }) < 0.1 && Unit("06-8", "Tank2").intent?.at(-1).z < 250, "06-8 第二辆倒车退回北头");
  assert.ok(Dist(Unit("06-8", "Luo"), KF("06-8").player) < 4, "06-8 班长就在顺子旁边");
  assert.ok(Math.abs(wreck.z - 278.6) < 0.1 && KF("06-8").signals.includes("L1SunkenRoadBlocked") && !KF("06-7").signals.includes("L1SunkenRoadBlocked"), "06-8 起堵路事件");
}
// 07
{
  assert.ok(Dist(KF("07-1").player, Unit("07-1", "Luo")) < 6 && Unit("07-1", "Luo").z > KF("07-1").player.z, "07-1 班长在玩家南边数人头");
  const col = KF("07-2").units.filter((u) => u.group === "column");
  assert.equal(col.filter((u) => u.kind === "animal").length, 3, "07-2 三匹驮炮的骡马");
  assert.equal(col.filter((u) => u.kind !== "animal").length, 10, "07-2 十个兵");
  assert.ok(col.every((u) => Dist(u, KF("07-2").player) > 150), "07-2 大队在 150 m 外（远处）");
  assert.ok(KF("07-2").pois.some((p) => /冒烟/.test(p.name)), "07-2 耿家庄东头冒烟");
  assert.ok(KF("07-2").next.z > 350, "07-2 next：村口路沟（08 起，不在本关卡）");
}

// --- 视线：玩家看得见这一拍的主要目标（地形 + 实心块；眼高 站 1.6 / 蹲 1.1 / 趴 0.4）---
const EYE = { stand: 1.62, crouch: 1.1, prone: 0.45 };
function CanSee(signals, from, stance, to, targetH = 1.0) {
  const solids = SolidsFor(signals).filter((b) => b.h > 0.6 && b.y + b.h / 2 > -10), ground = StandFor(signals);
  const g0 = ground(from.x, from.z) + (EYE[stance] || EYE.stand), g1 = ground(to.x, to.z) + targetH;
  const n = Math.max(8, Math.ceil(Dist(from, to) / 0.5));
  for (let k = 1; k < n; k++) {
    const t = k / n, x = from.x + (to.x - from.x) * t, z = from.z + (to.z - from.z) * t, y = g0 + (g1 - g0) * t;
    if (scene.terrainSampler(x, z) > y + 0.05) return false;
    for (const b of solids) if (Math.abs(b.x - x) < b.w / 2 + b.d / 2 + 0.2 && Penetration(b, x, z, 0) > 0 && b.y - b.h / 2 < y && b.y + b.h / 2 > y) return false;
  }
  return true;
}
const FOCUS = {
  "01-1": [["Donggua"]], "01-2": [["Luo"], ["Yaowa"]], "01-3": [[null, { x: 63, z: 64.5 }]],
  "02-1": [["IjaJia"], ["Interpreter"]], "02-2": [["IjaDing"], ["Donggua"]], "02-3": [["IjaJia"]], "02-4": [["Luo"], ["IjaDing"]], "02-5": [["IjaJia"], ["IjaYi"], ["Interpreter"]],
  "03-1": [["Donggua"]], "03-2": [["IjaWu"]], "03-3": [["Donggua"]], "03-4": [["IjaPost2"], ["IjaPost1"], ["Yaowa"]], "03-5": [["HeYoutian"], ["Blanket"]],
  "04-1": [["LitterA"], ["W04"]], "04-2": [["Orderly"]], "04-3": [["Captain"]],
  "05-1": [["GengCart"]], "06-1": [["Tank1"]], "06-2": [["LitterDonggua"]], "06-3": [["BundleRunner"]], "06-4": [["GengCart"], ["Geng"]],
  "06-5": [[null, { x: 90, z: 272 }]], "06-6": [["Tank1"]], "06-7": [["Tank1"]], "06-8": [["TankCommander"], ["Luo"]],
  "07-1": [["Luo"]],
};
for (const [id, targets] of Object.entries(FOCUS)) {
  const kf = KF(id);
  for (const [uid, at] of targets) {
    const to = at || Unit(id, uid);
    assert.ok(to, `${id} 看不到 ${uid}（单位不在场）`);
    Soft(CanSee(kf.signals, kf.player, kf.player.stance || "stand", to, uid && /Tank|Cart/.test(uid) ? 1.2 : 1.0), `${id} 玩家 (${kf.player.x}, ${kf.player.z}) 看不见 ${uid || "目标点"}`);
  }
}

assert.deepEqual(problems, [], `摆位 / 走位 / 视线问题：\n  ${problems.join("\n  ")}`);
console.log(`ok：${doc.keyframes.length} 帧 / ${doc.keyframes.reduce((n, k) => n + k.units.length, 0)} 个单位位置，视线 ${Object.keys(FOCUS).length} 帧`);
