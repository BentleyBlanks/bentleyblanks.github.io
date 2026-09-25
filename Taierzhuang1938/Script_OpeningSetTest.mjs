// Script_OpeningSetTest.mjs —— 01–03 过场分镜布景（Set 包）的纯 Node 门禁。
//
//   node Taierzhuang1938/Script_OpeningSetTest.mjs
//
// 1. 数据合法：契约 §4.5 的道具 id 都在、数值有限、种类认得、贴图文件在、外部模型 id 在；
// 2. 道具不压导演的站位与路线（读 Data_OpeningStoryboards；近爆之后才出现的道具只对近爆之后的标记算；
//    DESIGNED_CONTACTS 里写明的有意接触除外）；
// 3. 洞口塌土改形：SB03 眼位看审问组与右侧沟底不被塌土挡；还权坐位西侧有靠背、看得见岔口 J；
//    SB03/03A 眼位看审问组也不被本包的布景挡（布景只是外观，Space 的视线探针看不见它们，这里单独量）；
//    SB03A 上沿那条塌顶木真在画面上沿；
//    还权位对折角 F 的通视只量不判（见文末说明与报告）；
// 4. Script_OpeningSet 的生命周期：进 01–03 装载，近爆后塌方组出现、门楣落下，马灯只在 01 亮；
//    离开 01–03 后场景零残留、几何与自有材质全部 dispose。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { PROPS, SET_STAGES, SMOKE, FLYOVER, sky, DESIGNED_CONTACTS, PropFootprints, FLOOR } from "./Data_OpeningSet0103.mjs";
import { OpeningSet } from "./Script_OpeningSet.mjs";
import { OPENING_STORYBOARDS as C } from "./Data_OpeningStoryboards.mjs";
import { SampleMissionTerrain as G } from "./Data_FirstLevelMissionTerrain.mjs";
import { MISSION_LAYOUT as L } from "./Data_FirstLevelMissionLayout.mjs";
import { FRONT_SPACE as SP } from "./Data_FirstLevelFrontRoute.mjs";
import { Sight, Eye, RouteClearance } from "./Script_FirstLevelSpaceProbe.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const report = {};

// ---------------------------------------------------------------- 1. 数据合法
{
  const ids = PROPS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, "prop ids are unique");
  const contract = ["bunkerSandbagWallN", "bunkerPoster", "bunkerLantern", "bunkerCrateStackN", "bunkerCrateFront", "fallenLintel",
    "roofTimberDown", "trenchFacadeN", "duckboardsFront", "duckboardsSSW", "revetmentFront", "revetmentSSW", "sandbagStakesSouth",
    "flagTrench", "flagRC", "plankDebrisButt"];
  assert.deepEqual(contract.filter((id) => !ids.includes(id)), [], "every contract §4.5 01–02 prop id is in PROPS");
  assert.ok(ids.some((id) => id.startsWith("deadTreeRim")), "deadTreeRim* exists");
  assert.deepEqual(SET_STAGES, ["Trapped", "BunkerRescue", "RearTrench", "Support"], "the set lives in 01–03 only");
  assert.ok(Array.isArray(SMOKE) && Array.isArray(FLYOVER) && sky.overcast === false, "SMOKE/FLYOVER tables exist and overcast defaults off");
  const Finite = (value, where) => {
    if (typeof value === "number") assert.ok(Number.isFinite(value), `${where} is finite`);
    else if (Array.isArray(value)) value.forEach((v, i) => Finite(v, `${where}[${i}]`));
    else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) Finite(v, `${where}.${k}`);
  };
  for (const prop of PROPS) {
    Finite(prop, prop.id);
    const boxes = PropFootprints(prop);
    assert.ok(boxes.length > 0, `${prop.id} has a footprint`);
    for (const b of boxes) assert.ok(b.w > 0 && b.d > 0 && b.y1 > b.y0, `${prop.id} footprint is a real box`);
    if (prop.show) assert.ok(["collapsed", "rescue"].includes(prop.show), `${prop.id}.show is known`);
    if (prop.texture) assert.ok(fs.existsSync(path.join(HERE, prop.texture)), `${prop.id} texture ${prop.texture} exists`);
  }
  const externalSource = fs.readFileSync(path.join(HERE, "Script_ExternalProps.mjs"), "utf8");
  for (const prop of PROPS.filter((p) => p.kind === "external"))
    assert.ok(new RegExp(`\\b${prop.asset}\\s*:`).test(externalSource), `${prop.id}: external asset ${prop.asset} is registered`);
  for (const id of Object.keys(DESIGNED_CONTACTS)) assert.ok(ids.includes(id), `designed contact ${id} names a prop`);
  // 洞内陈设以洞底为参考地面：取样点必须真在洞底。
  assert.ok(Math.abs(G(FLOOR.x, FLOOR.z) + 1.93) < 0.05, `FLOOR samples the dugout floor: ${G(FLOOR.x, FLOOR.z).toFixed(2)}`);
  console.log(`ok data: ${PROPS.length} props, contract ids present, textures and external assets found`);
}

// ---------------------------------------------------------------- 2. 不压导演的站位与路线
// 两套标记：
//  · 契约 §5 的目标站位（本轮各镜的起点数，硬断言）；
//  · Data_OpeningStoryboards 里的现行标记与路线。契约 §2 第 1/5/6/9 条要 Dir 包挪走的那些，在它们还是
//    基线 b33e30951 的旧值时只报不判（下面 BASE 的指纹）；Dir 一改值，指纹对不上，就按新值照常判。
// 近爆之后才出现的道具（show:"collapsed"）只对近爆之后的标记算。
const P2 = (x, z) => ({ x, z });
const SB06_DRAG_COVER_SET = [P2(0.6, -123.9), P2(1.2, -123.68), P2(2.2, -123.72), P2(2.62, -124.5), P2(2.4, -125.2)];
const SB06_DRAG_COVER_SURVEY = [P2(0.6, -123.9), P2(0.7, -124.9), P2(1.6, -125.3), P2(2.4, -125.2)];
const CONTRACT_MARKS = [
  ["SB01.yaowa", P2(-0.55, -127.35), false], ["SB01.runner", P2(0.72, -127.0), false], ["SB01.luo", P2(1.75, -125.7), false],
  ["SB01.comrade", P2(0.35, -124.35), false], ["SB01.eye", P2(-1.95, -126.25), false],
  ["SB02.trap", P2(0.1, -125.45), true], ["SB03.eye", P2(0.35, -125.15), true], ["SB03A.eye", P2(0.25, -125.25), true],
  ["SB03.ijaA", P2(4.10, -125.63), true], ["SB03.captive", P2(4.06, -125.90), true], ["SB03.ijaB", P2(5.0, -124.86), true],
  ["SB03.interpreter", P2(4.75, -124.85), true], ["SB03A.ijaA", P2(4.9, -124.45), true], ["SB03A.captive", P2(4.06, -125.88), true],
  ["SB04.buttSpot", P2(2.3, -124.4), true], ["SB04A.dragged", P2(0.6, -123.9), true],
  ["SB05.ijaA", P2(0.77, -123.30), true], ["SB05.interpreter", P2(1.19, -123.29), true], ["SB05.ijaB", P2(0.04, -119.94), true],
  ["SB05.luo", P2(-3.10, -116.90), true], ["SB05.he", P2(-4.30, -114.60), true],
  ["SB05A.ijaB", P2(0.31, -121.12), true], ["SB05A.luo", P2(0.04, -120.42), true], ["SB05A.he", P2(-0.70, -119.90), true],
  ["SB05A.rifle", P2(0.55, -122.55), true],
  ["SB06.seat", P2(2.40, -125.20), true], ["SB06.luo", P2(3.12, -125.73), true], ["SB06.kickFrom", P2(3.9, -125.6), true],
  ["SB06.rifle", P2(3.20, -124.85), true], ["SB06.liu", P2(5.47, -123.52), true], ["SB06.he", P2(3.23, -124.07), true],
  // 拖进遮挡：契约/调研推断的折线 S'→(0.7,-124.9)→(1.6,-125.3)→坐位 从西边穿过洞口内侧，正好压在塌顶木、
  // 落下的门楣与坐位靠背上（靠背在坐位西侧，从西边拖进去必然压上它）。本包给 Dir 的替代折线：
  // 从 S' 沿南侧塌土与洞口塌土之间的 0.7 m 过道往东，再从东南绕进坐位（Space 胶囊 r 0.35 也走得通，见 §3）。
  ["SB06.dragCoverSet", SB06_DRAG_COVER_SET, true],
].map(([name, at, after]) => ({ name, route: Array.isArray(at) ? at : [at], after, contract: true }));
// 基线 b33e30951 的旧值（契约要 Dir 包挪走的）：值还没变就只报不判。
const BASE = {
  "shunzi.trap": "-1.3,-126.2", "shunzi.cover": "0.45,-124.35", "shunzi.dragged": "3.8,-123.2",
  "ija.foundRoute": "2.4,-125.55|1.1,-125.9", "ija.dragOutRoute": "0.3,-126.05|1.6,-125.7|2.9,-125.1|3.9,-124.2|4.3,-123.35",
  "rescue.dragCoverRoute": "3.2,-124.25|2.3,-124.95|1.35,-125.05", "rescue.luoCheck": "0.5,-125.05", "rescue.rifleMouth": "1.4,-125.6",
  "rescue.kickFrom": "1.85,-125.55", "rescue.rifleKicked": "0.3,-124.66",
  "withdraw.lane": "0.3,-125.1|1.7,-125.3|3.3,-124.2|3.3,-122.2|3.1,-121.3|1.4,-120.8|-0.6,-120.4|-1,-118.5|-4,-113",
};
const Print = (route) => route.map((p) => `${+p.x.toFixed(3)},${+p.z.toFixed(3)}`).join("|");
const MARKS = (() => {
  const out = [];
  const Add = (name, value, after) => {
    if (!value) return;
    if (Array.isArray(value) && value.length && value[0].x != null) out.push({ name, route: value, after });
    else if (value.x != null && value.z != null) out.push({ name, route: [value], after });
  };
  for (const [k, v] of Object.entries(C.banter)) Add(`banter.${k}`, v, k === "comradeBlast");
  for (const [k, v] of Object.entries(C.shunzi)) Add(`shunzi.${k}`, v, true);
  for (const [k, v] of Object.entries(C.ija)) Add(`ija.${k}`, v, true);
  for (const [k, v] of Object.entries(C.rescue)) Add(`rescue.${k}`, v, true);
  for (const [k, v] of Object.entries(C.withdraw)) Add(`withdraw.${k}`, v, true);
  return [...CONTRACT_MARKS, ...out];
})();
const RADIUS = 0.28, BAND = [0.3, 1.7];
function Clash(box, p) {
  const c = Math.cos(box.ry), s = Math.sin(box.ry), dx = p.x - box.x, dz = p.z - box.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  if (Math.abs(lx) > box.w / 2 + RADIUS || Math.abs(lz) > box.d / 2 + RADIUS) return false;
  if (box.ellipse && (lx / (box.w / 2 + RADIUS)) ** 2 + (lz / (box.d / 2 + RADIUS)) ** 2 > 1) return false;
  let y0 = box.y0, y1 = box.y1;
  if (box.sloped) {                                   // 斜木：按投影位置插值高度
    const { a, b, half } = box.sloped, len2 = (b.x - a.x) ** 2 + (b.z - a.z) ** 2;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / len2));
    const h = a.lift + (b.lift - a.lift) * t; y0 = h - half; y1 = h + half;
  }
  return y1 > BAND[0] && y0 < BAND[1];
}
const Samples = (route) => {
  if (route.length === 1) return [route[0]];
  const out = [];
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1));
    for (let k = 0; k <= n; k++) out.push({ x: a.x + (b.x - a.x) * k / n, z: a.z + (b.z - a.z) * k / n });
  }
  return out;
};
{
  const clashes = [], pending = [];
  for (const prop of PROPS) {
    const boxes = PropFootprints(prop).filter((b) => !b.walkable);
    const allowed = new Set(DESIGNED_CONTACTS[prop.id]?.marks || []);
    for (const mark of MARKS) {
      if (prop.show && !mark.after) continue;          // 近爆之后 / 02 起才出现的道具
      if (allowed.has(mark.name)) continue;
      const hit = Samples(mark.route).find((p) => boxes.some((b) => Clash(b, p)));
      if (!hit) continue;
      const line = `${prop.id} x ${mark.name} at (${hit.x.toFixed(2)},${hit.z.toFixed(2)})`;
      if (!mark.contract && BASE[mark.name] === Print(mark.route)) pending.push(line);
      else clashes.push(line);
    }
  }
  const surveyRoute = PROPS.filter((p) => p.show === "collapsed" || true).flatMap((prop) => {
    const boxes = PropFootprints(prop).filter((b) => !b.walkable), hit = Samples(SB06_DRAG_COVER_SURVEY).find((p) => boxes.some((b) => Clash(b, p)));
    return hit && !(DESIGNED_CONTACTS[prop.id]?.marks || []).includes("SB06.seat") ? [`${prop.id} at (${hit.x.toFixed(2)},${hit.z.toFixed(2)})`] : [];
  });
  report.surveyDragCoverClashes = surveyRoute;
  report.markClashes = clashes; report.pendingDir = pending;
  assert.deepEqual(clashes, [], "set dressing stands clear of the contract §5 marks and the director's current marks/routes (capsule r 0.28, 0.3–1.7 m)");
  console.log(`   survey SB06 drag-cover line (reported, Dir picks the route): ${JSON.stringify(surveyRoute)}`);
  console.log(`ok marks: ${PROPS.length} props x ${MARKS.length} marks/routes (${CONTRACT_MARKS.length} contract §5), no clash; `
    + `${pending.length} clashes only with base values the Dir package moves: ${JSON.stringify(pending)}`);
}

// ---------------------------------------------------------------- 3. 洞口塌土改形（纯 node 视线）
{
  const collapsed = L.scenario.states.find((s) => s.id === "BunkerCollapsed").blocks;
  const rubble = collapsed.find((b) => b.id === "BunkerMouthRubbleS");
  const floor = G(rubble.x, rubble.z);
  report.rubbleTopM = +(rubble.y + rubble.h / 2 - floor).toFixed(2);
  assert.ok(report.rubbleTopM <= 0.36, `SB03: the south mouth rubble is a low heap (<= 0.36 m): ${report.rubbleTopM}`);
  assert.ok(rubble.solid !== false, "the south mouth rubble keeps its collider");
  assert.ok(!collapsed.some((b) => b.id === "BunkerMouthLintel"), "collapsed: the lintel box is replaced by the Set's fallen lintel");
  const mound = PROPS.find((p) => p.id === "rubbleMoundS");
  assert.ok(mound.peak <= 0.4 && mound.peak >= report.rubbleTopM, `the mound over it is a low heap (<= 0.4 m) that covers the block: ${mound.peak}`);
  // SB03 眼位 (0.35,-125.15) 离地 0.26：审问组（按契约 §5 的站位）与右侧沟底都看得见。
  const eye = Eye({ x: 0.35, z: -125.15 }, 0.26);
  const targets = [["ijaA head", { x: 4.10, z: -125.63 }, 1.55], ["captive head (kneeling)", { x: 4.06, z: -125.90 }, 0.85],
    ["ijaB head", { x: 5.0, z: -124.86 }, 1.55], ["interpreter head (crouched)", { x: 4.75, z: -124.85 }, 1.0],
    ["trench floor right of frame (yaw -118)", { x: 2.6, z: -123.6 }, 0.6], ["south lip flag", { x: 10.5, z: -121.8 }, 2.4]];
  report.sb03 = targets.map(([name, p, h]) => ({ name, blocker: Sight(eye, Eye(p, h), { state: "BunkerCollapsed" }) }));
  for (const row of report.sb03) assert.equal(row.blocker, null, `SB03 eye sees ${row.name} (blocked by ${row.blocker})`);
  // 同一条线在旧的 0.7 m 塌土方块下是挡住的：右侧那 1/4 画面就是它占的。
  const oldTop = floor + 0.7;
  const t = (rubble.x - eye.x) / (2.6 - eye.x), yAt = eye.y + (Eye({ x: 2.6, z: -123.6 }, 0.6).y - eye.y) * t;
  assert.ok(yAt < oldTop, "control: the old 0.7 m block would have hidden the right-hand trench floor");
  // 还权坐位 (2.40,-125.20)：西侧 0.3–0.7 m 有靠背（塌土包，峰高 0.35–0.6 m），坐姿眼高 0.72 看得见岔口 J（SB06 正中远）。
  const seat = { x: 2.40, z: -125.20 }, back = PROPS.find((p) => p.id === "rubbleMoundBack");
  const gap = seat.x - (back.x + back.rx);
  report.backrest = { gapM: +gap.toFixed(2), peakM: back.peak, spanZ: [+(back.z - back.rz).toFixed(2), +(back.z + back.rz).toFixed(2)] };
  assert.ok(gap >= 0.05 && gap <= 0.4 && back.peak >= 0.35 && back.peak <= 0.6 && Math.abs(back.z - seat.z) < 0.2,
    `the hand-back seat has a backrest just west of it: ${JSON.stringify(report.backrest)}`);
  const seatEye = Eye(seat, 0.72);
  report.seatJ = [1.6, 1.2].map((h) => Sight(seatEye, Eye(SP.bunkerJunction, h), { state: "BunkerCollapsed" }));
  assert.deepEqual(report.seatJ, [null, null], "SB06: the seat sees the junction J (the man Liu shot lies there)");
  // 本包给 Dir 的拖进遮挡替代折线，真实胶囊（r 0.35，塌方态体块）走得通。起点 S' (0.60,-123.90) 本身不算：
  // 它离南护壁 BunkerSouthRevetment（x ≤ 0.8）与南门柱不到 0.35 m（契约 §2 第 6 条的点，报告里交 Dir），
  // 从 (1.2,-123.68) 起量：南侧塌土与洞口塌土之间是 0.75 m 的过道。
  report.dragCoverSetClearance = RouteClearance(SB06_DRAG_COVER_SET.slice(1), { state: "BunkerCollapsed" });
  report.dragCoverSetStartHits = RouteClearance(SB06_DRAG_COVER_SET.slice(0, 2), { state: "BunkerCollapsed" }).hits;
  assert.deepEqual([report.dragCoverSetClearance.hits, report.dragCoverSetClearance.slopes], [[], []], "the suggested SB06 drag-cover line clears the collapsed-state blocks (capsule r 0.35)");
  // 折角 F：只量不判。F 与 J 在同一条东西向沟里，从坐位看两者只差 4.4°；任何挡 F 的东西都落在
  // 追兵从 F 走到 J 的路线上（BunkerPursuitA/C、ijaD、背景兵），或同样挡住 01 受困眼位看 F（K1）。
  report.seatF = [1.6, 1.2].map((h) => Sight(seatEye, Eye(SP.bunkerFold, h), { state: "BunkerCollapsed" }));
  // SB03（Interrogation）与 SB03A（Found）眼位：01 里看得见的布景（常驻组 + 塌方组）不挡审问组。
  // 射线逐 2 cm 步进，落进任一件道具的占地盒（高度按盒子自己的参考地面算，斜木按投影插值）就算挡住。
  const visible01 = PROPS.filter((p) => !p.show || p.show === "collapsed");
  const boxes01 = visible01.flatMap((prop) => PropFootprints(prop).map((box) => ({ prop: prop.id, box,
    ground: prop.ground ? G(prop.ground.x, prop.ground.z) : null })));
  const Inside = ({ box, ground }, x, y, z) => {
    const c = Math.cos(box.ry), sn = Math.sin(box.ry), dx = x - box.x, dz = z - box.z;
    const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
    if (Math.abs(lx) > box.w / 2 || Math.abs(lz) > box.d / 2) return false;
    if (box.ellipse && (lx / (box.w / 2)) ** 2 + (lz / (box.d / 2)) ** 2 > 1) return false;
    const g = ground ?? G(x, z);
    let y0 = box.y0, y1 = box.y1;
    if (box.sloped) {
      const { a, b, half } = box.sloped, len2 = (b.x - a.x) ** 2 + (b.z - a.z) ** 2;
      const t = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z)) / len2));
      const h = a.lift + (b.lift - a.lift) * t; y0 = h - half; y1 = h + half;
    }
    return y > g + y0 && y < g + y1;
  };
  const SetBlocker = (from, fromH, to, toH) => {
    const a = { x: from.x, y: G(from.x, from.z) + fromH, z: from.z }, b = { x: to.x, y: G(to.x, to.z) + toH, z: to.z };
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.02);
    for (let k = 1; k < n; k++) {
      const t = k / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
      const hit = boxes01.find((entry) => Inside(entry, x, y, z));
      if (hit) return hit.prop;
    }
    return null;
  };
  const groups = {
    SB03: { eye: { x: 0.35, z: -125.15 }, h: 0.26, pitchDeg: 5, yawDeg: -80, targets: [["ijaA", { x: 4.10, z: -125.63 }, [1.55, 0.9, 0.35]],
      ["captive (sitting)", { x: 4.06, z: -125.90 }, [0.85, 0.5]], ["ijaB", { x: 5.0, z: -124.86 }, [1.55, 0.9, 0.35]],
      ["interpreter (crouched)", { x: 4.75, z: -124.85 }, [1.0, 0.6]]] },
    SB03A: { eye: { x: 0.25, z: -125.25 }, h: 0.18, pitchDeg: 4, yawDeg: -82, targets: [["captive (sitting)", { x: 4.06, z: -125.88 }, [0.85, 0.5]],
      ["ijaA looking back", { x: 4.9, z: -124.45 }, [1.55, 0.9, 0.35]]] },
  };
  report.setSight = {};
  for (const [shot, spec] of Object.entries(groups)) {
    report.setSight[shot] = spec.targets.flatMap(([name, at, heights]) => heights.map((h) => ({ name, h, blocker: SetBlocker(spec.eye, spec.h, at, h) })));
    const blocked = report.setSight[shot].filter((row) => row.blocker);
    assert.deepEqual(blocked, [], `${shot}: the set dressing does not hide the interrogation group`);
  }
  // 塌顶木的下沿在 SB03/03A 画面里的位置（1280×720、竖直视场 65°，沿镜头正前方量）：SB03A 要「上沿一整条黑木料」，
  // SB03 不能再被它框住（门柱过梁不再框住画面）。
  const timber = PROPS.find((p) => p.id === "roofTimberDown"), tanHalf = Math.tan(32.5 * Math.PI / 180);
  report.timberBand = {};
  for (const [shot, spec] of Object.entries(groups)) {
    const yaw = spec.yawDeg * Math.PI / 180, dir = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
    // 木料在眼睛上方：挡住的下边界是它的远端下棱（东面那条棱）。
    const dist = (timber.a.x + timber.w / 2 - spec.eye.x) / dir.x, z = spec.eye.z + dir.z * dist;
    const t = (z - timber.a.z) / (timber.b.z - timber.a.z), bottom = timber.a.lift + (timber.b.lift - timber.a.lift) * t - timber.h / 2;
    const eyeY = G(spec.eye.x, spec.eye.z) + spec.h, floor = G(FLOOR.x, FLOOR.z);
    const elev = Math.atan2(floor + bottom - eyeY, dist) - spec.pitchDeg * Math.PI / 180;
    report.timberBand[shot] = +(0.5 - Math.tan(elev) / (2 * tanHalf)).toFixed(3);   // 木料下沿在画面的纵向位置（0 = 上沿）
  }
  assert.ok(report.timberBand.SB03A > 0.06 && report.timberBand.SB03A < 0.25, `SB03A: the fallen roof timber is a band along the top: ${report.timberBand.SB03A}`);
  assert.ok(report.timberBand.SB03 < 0.3, `SB03: the fallen roof timber takes less than the top 30%: ${report.timberBand.SB03}`);
  console.log(`ok rubble: heap ${report.rubbleTopM} m, SB03 group and right-hand trench in view, backrest ${JSON.stringify(report.backrest)}, seat sees J; seat->F ${JSON.stringify(report.seatF)} (reported, not asserted)`);
}

// ---------------------------------------------------------------- 4. 生命周期：装载、塌方、马灯、收走
{
  const scene = new THREE.Scene();
  const keep = new THREE.Object3D(); keep.name = "Existing"; scene.add(keep);
  const shared = new Map();
  const library = { Get: (name) => { if (!shared.has(name)) shared.set(name, new THREE.MeshStandardMaterial({ name })); return shared.get(name); } };
  const set = new OpeningSet({ scene, library, groundAt: (x, z) => G(x, z) });
  assert.equal(set.Enter("Wake"), false, "an unknown / later stage does not build the set");
  assert.equal(scene.children.length, 1, "nothing built outside 01–03");
  assert.equal(set.Enter("Trapped"), true);
  let stats = set.Stats();
  report.stats = stats;
  assert.ok(stats.meshes >= 8 && stats.meshes <= 40, `01 builds the set in a few batched meshes (draw-call budget 60): ${stats.meshes}`);
  assert.equal(stats.lights, 1, "one point light (the lantern)");
  set.Update(0.016, "Trapped", "Banter", { collapsed: false, blastAge: null });
  stats = set.Stats();
  assert.equal(stats.collapsedVisible, false, "before the blast the collapse group is hidden");
  assert.equal(stats.rescueVisible, false, "the 02 group is hidden in 01");
  assert.ok(set.lantern.light.visible && set.lantern.light.intensity > 1, "the lantern is lit in 01");
  // 近爆：0.1 s 门楣还在原位，0.45 s 正在落，1.0 s 落定（搁在塌顶木上）。
  set.Update(0.016, "Trapped", "Blast", { collapsed: true, blastAge: 0.1 });
  assert.equal(set.Stats().lintelProgress, 0, "the lintel starts to fall only after 0.25 s");
  set.Update(0.016, "Trapped", "Blast", { collapsed: true, blastAge: 0.45 });
  const mid = set.Stats().lintelProgress;
  assert.ok(mid > 0.1 && mid < 0.9, `mid-fall at 0.45 s: ${mid}`);
  set.Update(0.016, "Trapped", "Blast", { collapsed: true, blastAge: 1.2 });
  assert.equal(set.Stats().lintelProgress, 1, "the lintel is down by 1.2 s");
  assert.equal(set.Stats().collapsedVisible, true, "after the blast the collapse group shows");
  assert.equal(set.Stats().rescueVisible, false, "the hand-back backrest stays hidden through 01 (it would hide the SB03 group)");
  // 断头落在 rest 点上（世界坐标核对 FallLintel 的朝向）。
  const spec = PROPS.find((p) => p.id === "fallenLintel"), piece = set.lintel.mesh;
  piece.updateMatrixWorld(true);
  const tip = new THREE.Vector3(0, 0, -Math.hypot(spec.rest.x - spec.pivot.x, spec.rest.lift - spec.pivot.lift, spec.rest.z - spec.pivot.z)).applyMatrix4(piece.matrixWorld);
  const floor = G(spec.ground.x, spec.ground.z);
  assert.ok(tip.distanceTo(new THREE.Vector3(spec.rest.x, floor + spec.rest.lift, spec.rest.z)) < 0.02, `the fallen lintel's broken end rests on its mark: ${tip.toArray().map((v) => v.toFixed(2))}`);
  // 选章 / 回跳直接进 02：没见过近爆＝已经落定；马灯灭。
  // 任务步骤在 Found 前后就切到 BunkerRescue，导演还在演 01 的拍：靠背仍藏着（SB03A/SB04 的画面）。
  set.Update(0.016, "BunkerRescue", "Found", { collapsed: true, blastAge: null });
  assert.equal(set.Stats().rescueVisible, false, "the backrest stays hidden while the director still plays 01 beats under the BunkerRescue step");
  set.Update(0.016, "BunkerRescue", "Hold", { collapsed: true, blastAge: null });
  assert.equal(set.Stats().lintelProgress, 1, "entering 02 without a blast shows the lintel already down");
  assert.ok(!set.lantern.light.visible && set.lantern.light.intensity === 0, "the lantern is out after 01");
  assert.equal(set.Stats().rescueVisible, true, "the hand-back backrest shows from 02 on");
  // 离开 01–03：场景零残留，几何与自有材质全部 dispose，共享库材质不碰。
  const geometries = new Set(), owned = [...set.ownedMaterials];
  set.root.traverse((o) => { if (o.geometry) geometries.add(o.geometry); });
  let disposedGeometry = 0, disposedOwned = 0, disposedShared = 0;
  for (const g of geometries) g.addEventListener("dispose", () => disposedGeometry++);
  for (const m of owned) m.addEventListener("dispose", () => disposedOwned++);
  for (const m of shared.values()) m.addEventListener("dispose", () => disposedShared++);
  set.Update(0.016, "MachineGun", null, { collapsed: true, blastAge: 30 });
  let nodes = 0; scene.traverse(() => nodes++);
  assert.equal(scene.children.length, 1, "leaving 01–03 removes the whole set from the scene");
  assert.equal(nodes, 2, "no stray node is left behind");
  assert.equal(disposedGeometry, geometries.size, `every set geometry is disposed (${disposedGeometry}/${geometries.size})`);
  assert.equal(disposedOwned, owned.length, "every material the set created is disposed");
  assert.equal(disposedShared, 0, "shared library materials are not disposed");
  assert.equal(set.Active, false);
  // 回跳到 02：重新装载；整关拆除 Exit() 也拆干净。
  set.Enter("BunkerRescue");
  assert.ok(set.Active && scene.children.length === 2, "jumping back to 02 rebuilds the set");
  set.Exit();
  assert.equal(scene.children.length, 1, "Exit() removes it again");
  console.log(`ok lifecycle: ${report.stats.meshes} meshes / 1 light in 01–03, lintel falls 0.25–0.6 s, lantern only in 01, zero residue after 03`);
}

console.log(`OpeningSetTest ok ${JSON.stringify({ timberBand: report.timberBand, rubbleTopM: report.rubbleTopM, backrest: report.backrest, seatF: report.seatF, meshes: report.stats.meshes })}`);
