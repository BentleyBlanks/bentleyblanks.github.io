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
//    离开 01–03 后场景零残留、几何与自有材质全部 dispose（03 前沿那一份活到 06，离开前沿各步再收）；
// 5. Step 2：近爆定向喷土（方向对着 SB02 机位、时序 0.22–0.9 s、只喷一次）、烟柱火点（按步骤挂与收、粒子预算）、
//    03 开头两架飞机（航线在 SB07 画面上部、触发与交还、AircraftFlight 能同时摆两架）、阴天开关（默认关、不改雾、
//    01–03 套用、离开还原）、03 前沿布景（砖壳包住阵位体块、机枪破口不加高、倒墙不挡阵位看缺口里的守军、弹药箱不挡人）。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { PROPS, SET_STAGES, SMOKE, FLYOVER, sky, DESIGNED_CONTACTS, PropFootprints, FLOOR, BLAST, SmokeOptions, SMOKE_PARTICLE_BUDGET,
  FLYOVER_TRIGGER, FlyoverPose, FRONT_PROPS, FRONT_SET_STAGES, BRICK } from "./Data_OpeningSet0103.mjs";
import { OpeningSet, OvercastPreset, BreakableTops } from "./Script_OpeningSet.mjs";
import { FRONT_BREAKABLES } from "./Data_FirstLevelFrontBreakables.mjs";
import { OpeningBlastFx } from "./Script_OpeningBlastFx.mjs";
import { VfxSystem } from "./Script_Vfx.mjs";
import { AircraftFlight } from "./Script_Aircraft.mjs";
import { SKY_PRESETS } from "./Script_Sky.mjs";
import { OPENING_STORYBOARDS as C } from "./Data_OpeningStoryboards.mjs";
import { SampleMissionTerrain as G } from "./Data_FirstLevelMissionTerrain.mjs";
import { MISSION_LAYOUT as L } from "./Data_FirstLevelMissionLayout.mjs";
import { FRONT_SPACE as SP } from "./Data_FirstLevelFrontRoute.mjs";
import { Sight, Eye, RouteClearance } from "./Script_FirstLevelSpaceProbe.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEG = Math.PI / 180;
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
  assert.ok(mound.peak <= 0.36 && mound.peak >= report.rubbleTopM, `the mound over it is a low heap (<= 0.36 m) that covers the block: ${mound.peak}`);
  // 体块四角处的土厚（最坏的起伏往下压）盖得住体块顶：不然实拍里方块的角从土包里露出来。
  const cornerX = Math.abs(rubble.x - mound.x) + rubble.w / 2, cornerZ = Math.abs(rubble.z - mound.z) + rubble.d / 2;
  const cornerLift = mound.peak * Math.sqrt(1 - (cornerX / mound.rx) ** 2 - (cornerZ / mound.rz) ** 2) * (1 - (mound.bump ?? 0.22) / 2 * 1.4) - (mound.sink ?? 0.04);
  assert.ok(cornerLift + G(mound.x, mound.z) >= rubble.y + rubble.h / 2 - 0.005, `the mound covers the block corners: ${cornerLift.toFixed(3)} vs top ${report.rubbleTopM}`);
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
  // 03 起还装着前沿那一份（阵位破砖墙、缺口倒墙；04–06 还在那儿打），它单独一个根节点，下面第 5 节另算。
  set.Update(0.016, "Support", null, { collapsed: true, blastAge: 30 });
  const frontRoot = set.front?.root;
  assert.ok(set.Active && frontRoot?.parent === scene, "03 shows both the 01–03 set and the front dressing");
  set.Update(0.016, "MachineGun", null, { collapsed: true, blastAge: 30 });
  assert.ok(frontRoot && set.front?.root === frontRoot, "the front dressing built in 03 stays through 04 (same root)");
  assert.deepEqual(scene.children.map((o) => o.name), ["Existing", "OpeningSet0103_Front"], "leaving 01–03 removes the whole 01–03 set; only the front dressing stays");
  set.Update(0.016, "South", null, { collapsed: true, blastAge: 30 });
  let nodes = 0; scene.traverse(() => nodes++);
  assert.equal(scene.children.length, 1, "leaving the front stages removes the front dressing too");
  assert.equal(nodes, 2, "no stray node is left behind");
  assert.equal(disposedGeometry, geometries.size, `every set geometry is disposed (${disposedGeometry}/${geometries.size})`);
  assert.equal(disposedOwned, owned.length, "every material the set created is disposed");
  assert.equal(disposedShared, 0, "shared library materials are not disposed");
  assert.equal(set.Active, false);
  // 回跳到 02：重新装载；整关拆除 Exit() 也拆干净。
  set.Enter("BunkerRescue");
  assert.ok(set.Active && scene.children.length === 2 && !set.front, "jumping back to 02 rebuilds the set (the front dressing waits for 03)");
  set.Exit();
  assert.equal(scene.children.length, 1, "Exit() removes it again");
  console.log(`ok lifecycle: ${report.stats.meshes} meshes / 1 light in 01–03, lintel falls 0.25–0.6 s, lantern only in 01, zero residue after 03`);
}

// ---------------------------------------------------------------- 5. Step 2：喷土、烟火、飞机、阴天、03 前沿布景
// vfx 在 node 里建不起来（要 document），用一个假的：只录下生了什么，锥形速度借真的 _ConeVelocity。
function FakeVfx() {
  let seed = 7;
  const log = { smoke: [], debris: [], sources: new Map(), removed: [], next: 1 };
  return {
    log, time: 0, spawnScale: 1, wind: { x: 0.35, z: -0.15 },
    random: () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; },
    _ConeVelocity: VfxSystem.prototype._ConeVelocity,
    _SpawnDebris(x, y, z, vx, vy, vz, sx, sy, sz, color, life, groundY) { log.debris.push({ x, y, z, vx, vy, vz, sx, sy, sz, life, groundY }); },
    pools: { smoke: { Spawn: (s) => log.smoke.push({ ...s }) } },
    SmokeSource(position, opts) { const id = log.next++; log.sources.set(id, { position: { ...position }, opts }); return id; },
    RemoveSmokeSource(id) { log.removed.push(id); log.sources.delete(id); },
  };
}
{
  // ---- 5a. 近爆喷土：数据、时序、方向
  const eye = { x: -0.6, z: -125.95 };                       // SB02 镜像机位
  const dir = new THREE.Vector3(BLAST.dir.x, BLAST.dir.y, BLAST.dir.z).normalize();
  const toEye = new THREE.Vector3(eye.x - BLAST.at.x, 0, eye.z - BLAST.at.z).normalize();
  const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();
  report.blastAimDeg = +(flat.angleTo(toEye) / DEG).toFixed(1);
  assert.ok(report.blastAimDeg < BLAST.spreadRad * 1.2 / DEG, `SB02: the mirrored camera sits inside the mud-spray cone (${report.blastAimDeg} deg off axis)`);
  // 喷口在 SB02 画面外（右边 69°）：主轴要横穿画面，不然整锥土一直贴着画框外沿扑过来、画面里看不见（step2 实拍）。
  // 沿主轴 1.5 m 与 2.5 m 处都要在镜头水平视场（半角约 48°）以内（3 m 处正好出左边框，北壁在 3.5 m）。
  const camFwd = new THREE.Vector3(-Math.sin(-66 * DEG), 0, -Math.cos(-66 * DEG));
  report.blastSweepDeg = [1.5, 2.5].map((m) => +(new THREE.Vector3(BLAST.at.x + flat.x * m - eye.x, 0, BLAST.at.z + flat.z * m - eye.z)
    .normalize().angleTo(camFwd) / DEG).toFixed(1));
  assert.ok(report.blastSweepDeg.every((a) => a < 48), `SB02: the spray axis sweeps across the mirrored frame (${report.blastSweepDeg} deg off the view axis)`);
  assert.ok(dir.x < 0 && dir.z < 0 && dir.y > 0, "the spray goes north-west into the dugout, slightly up");
  assert.ok(Math.hypot(BLAST.at.x - 1.05, BLAST.at.z - -124.3) < 0.35, "the spray starts at the south edge of the mouth (south post)");
  assert.ok(BLAST.atS >= 0.2 && BLAST.atS <= 0.25 && BLAST.atS + BLAST.seconds <= 0.95, "0.22–0.9 s after the blast (contract §5 SB02)");
  assert.ok(BLAST.clods >= 12 && BLAST.clods <= 18 && BLAST.splinters > 0 && BLAST.dust > 0, "about fifteen clods, splinters and dust");
  const vfx = FakeVfx(), fx = new OpeningBlastFx({ vfx });
  fx.DirectionalBlast({ x: BLAST.at.x, y: 0, z: BLAST.at.z }, BLAST.dir, { groundY: -2 });
  const counts = () => ({ debris: vfx.log.debris.length, smoke: vfx.log.smoke.length });
  let t = 0, head = null;
  while (t < BLAST.seconds + 0.2) { fx.Update(1 / 60); t += 1 / 60; if (head == null && t >= BLAST.burst.headS) head = counts(); }
  const total = counts(), stats = fx.Stats();
  report.blast = { head, total, active: stats.active };
  assert.equal(total.debris, BLAST.clods + BLAST.splinters, "every clod and splinter is spawned");
  assert.equal(total.smoke, BLAST.spray + BLAST.dust, "every spray and dust puff is spawned");
  assert.ok(head.debris >= 0.65 * total.debris, `most of the burst is out by ${BLAST.burst.headS} s: ${JSON.stringify(head)}`);
  assert.equal(stats.active, 0, "the emitter retires after its seconds");
  const cone = Math.cos(BLAST.spreadRad * 1.8 + 0.25);
  const aligned = vfx.log.debris.filter((d) => new THREE.Vector3(d.vx, d.vy, d.vz).normalize().dot(dir) > cone).length;
  assert.ok(aligned >= 0.9 * vfx.log.debris.length, `debris flies along the cone (${aligned}/${vfx.log.debris.length})`);
  assert.ok(vfx.log.debris.every((d) => d.groundY === -2), "debris lands on the given floor");
  // Set 自动触发：炮弹落地（0.22 s）那一帧喷一次，之后不再喷；选章进来（早过了）不补喷；重试（blastAge 回 null）重新计。
  const scene = new THREE.Scene(), v2 = FakeVfx();
  const set = new OpeningSet({ scene, library: null, groundAt: (x, z) => G(x, z), vfx: v2 });
  set.Enter("Trapped");
  set.Update(0.016, "Trapped", "Blast", { collapsed: true, blastAge: 0.1 });
  assert.equal(set.Stats().blast.fired, 0, "no spray before the shell lands");
  set.Update(0.016, "Trapped", "Blast", { collapsed: true, blastAge: 0.23 });
  set.Update(0.016, "Trapped", "Blast", { collapsed: true, blastAge: 0.5 });
  assert.equal(set.Stats().blast.fired, 1, "one spray when the shell lands");
  set.Update(0.016, "Trapped", "Banter", { collapsed: false, blastAge: null });
  set.Update(0.016, "Trapped", "Blast", { collapsed: true, blastAge: 3 });
  assert.equal(set.Stats().blast.fired, 1, "a retry that comes back after the blast does not replay the spray");
  set.Exit();
  console.log(`ok blast: aim ${report.blastAimDeg} deg off the SB02 camera, ${JSON.stringify(report.blast)}`);
}
{
  // ---- 5b. 烟柱与火点：按步骤挂、按步骤收，预算
  const ids = SMOKE.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, "smoke ids are unique");
  const stageBudget = {};
  for (const stage of ["Trapped", "BunkerRescue", "RearTrench", "Support"]) {
    stageBudget[stage] = +SMOKE.filter((r) => r.stages.includes(stage)).reduce((sum, r) => { const o = SmokeOptions(r); return sum + o.rate * o.life; }, 0).toFixed(0);
    assert.ok(stageBudget[stage] <= SMOKE_PARTICLE_BUDGET, `${stage}: live smoke puffs ${stageBudget[stage]} <= ${SMOKE_PARTICLE_BUDGET}`);
  }
  for (const r of SMOKE) {
    assert.ok(r.stages.every((s) => SET_STAGES.includes(s)), `${r.id} only in 01–03`);
    const o = SmokeOptions(r);
    assert.ok(o.light === false && o.kind === "black" && o.rate > 0 && o.life > 0, `${r.id} is a lightless black source`);
  }
  // 契约 §5 / 任务书点名的位置都在（调研坐标，逐镜截图核对）。
  // 任务书允许「不像就调」：SB05A 左边那股 (18,-45) 被洞壁挡住，挪进了画面右半的天（见 Data SMOKE 的注释），这里按挪后的 (4.5,-49) 查。
  for (const [x, z] of [[60, -112], [85, -140], [110, -120], [45, -135], [70, -118], [60, -150], [32, -126], [4.5, -49], [-8, -40], [59.8, -167.4],
    [-20, -175], [5, -182], [30, -178], [-35, -190], [40, -195]]) {
    const near = SMOKE.find((r) => Math.hypot(r.x - x, r.z - z) < 12);
    assert.ok(near, `a smoke/fire source near (${x},${z})`);
  }
  const vfx = FakeVfx(), scene = new THREE.Scene(), set = new OpeningSet({ scene, library: null, groundAt: (x, z) => G(x, z), vfx });
  const live = () => [...vfx.log.sources.keys()].length;
  set.Update(0.016, "Trapped", "Banter", {});
  assert.equal(live(), SMOKE.filter((r) => r.stages.includes("Trapped")).length, "01 lights its columns");
  set.Update(0.016, "BunkerRescue", "Hold", {});
  assert.equal(live(), SMOKE.filter((r) => r.stages.includes("BunkerRescue")).length, "02 adds the SB05A columns");
  set.Update(0.016, "Support", null, {});
  assert.deepEqual(set.Stats().smoke.sort(), SMOKE.filter((r) => r.stages.includes("Support")).map((r) => r.id).sort(), "03 swaps to the front columns");
  set.Update(0.016, "MachineGun", null, {});
  assert.equal(live(), 0, "leaving 01–03 removes every smoke source");
  set.Update(0.016, "Support", null, {});
  set.Exit();
  assert.equal(live(), 0, "Exit removes every smoke source");
  report.smokeBudget = stageBudget;
  console.log(`ok smoke: ${SMOKE.length} sources, live puffs per step ${JSON.stringify(stageBudget)} (<= ${SMOKE_PARTICLE_BUDGET}), all removed after 03`);
}
{
  // ---- 5c. 03 开头两架飞机
  assert.equal(FLYOVER.length, 2, "two aircraft");
  assert.equal(new Set(FLYOVER.map((r) => r.aircraft)).size, 2, "two different airframes");
  const eye = { x: FLYOVER_TRIGGER.at.x, y: G(FLYOVER_TRIGGER.at.x, FLYOVER_TRIGGER.at.z) + 1.62, z: FLYOVER_TRIGGER.at.z };
  const View = (p) => ({ bearing: Math.atan2(-(p.x - eye.x), -(p.z - eye.z)) / DEG, elev: Math.atan2(p.y - eye.y, Math.hypot(p.x - eye.x, p.z - eye.z)) / DEG,
    dist: Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z) });
  const lead = FLYOVER[0], mid = View(FlyoverPose(lead, lead.delayS + lead.passS));
  report.flyover = { midBearing: +mid.bearing.toFixed(1), midElev: +mid.elev.toFixed(1), midDist: Math.round(mid.dist) };
  assert.ok(mid.bearing > -66 && mid.bearing < -46, `SB07: at mid-pass the lead is just right of the default view yaw -50: ${mid.bearing.toFixed(1)}`);
  assert.ok(mid.elev > 12 && mid.elev < 22, `upper part of the frame (55 deg vertical fov): ${mid.elev.toFixed(1)} deg up`);
  for (const row of FLYOVER) for (let t = row.delayS; t <= row.delayS + row.seconds; t += 0.5)
    assert.ok(View(FlyoverPose(row, t)).dist < 640, `${row.id} stays inside the 650 m camera far plane`);
  const first = View(FlyoverPose(lead, lead.delayS)), last = View(FlyoverPose(lead, lead.delayS + lead.seconds));
  assert.ok(first.bearing > -35 && last.bearing < -80, `the pass crosses the view left to right: ${first.bearing.toFixed(0)} -> ${last.bearing.toFixed(0)}`);
  // 触发、放飞、交还（假的 aircraft）；再用真的 AircraftFlight 核对两架能同时摆。
  const calls = [];
  const aircraft = { SetManualPose: (id, pose) => calls.push([id, pose ? 1 : 0]) };
  const set = new OpeningSet({ scene: new THREE.Scene(), library: null, groundAt: (x, z) => G(x, z), aircraft });
  const far = { x: -8, z: -150 };
  set.Update(0.5, "Support", null, { player: far });
  assert.equal(calls.length, 0, "no flight before the trigger");
  set.Update(0.1, "Support", null, { player: { x: 6, z: -144 } });
  set.Update(0.7, "Support", null, { player: { x: 6, z: -144 } });
  assert.deepEqual([...new Set(calls.filter((c) => c[1]).map((c) => c[0]))].sort(), FLYOVER.map((r) => r.aircraft).sort(), "both aircraft fly once the player reaches the wall");
  for (let i = 0; i < 40; i++) set.Update(0.5, "Support", null, { player: far });
  const released = calls.filter((c) => !c[1]).map((c) => c[0]).sort();
  assert.deepEqual(released, FLYOVER.map((r) => r.aircraft).sort(), "both aircraft are released after the pass");
  calls.length = 0;
  const late = new OpeningSet({ scene: new THREE.Scene(), library: null, groundAt: (x, z) => G(x, z), aircraft });
  for (let i = 0; i < Math.ceil(FLYOVER_TRIGGER.fallbackS / 0.5) + 3; i++) late.Update(0.5, "Support", null, { player: far });
  assert.ok(calls.some((c) => c[1]), "the flight also happens by the fallback time if the player never reaches the wall");
  late.Update(0.016, "MachineGun", null, {});
  assert.ok(calls.at(-1)[1] === 0 && calls.filter((c) => !c[1]).length === 2, "leaving 03 mid-flight releases both aircraft");
  const flight = new AircraftFlight(new THREE.Scene());
  for (const row of FLYOVER) { const root = new THREE.Object3D(); flight.forms.push({ spec: { id: row.aircraft }, root }); }
  flight.SetPhase({ bounds: { minX: 0, maxX: 1, minZ: 0, maxZ: 1 }, whitebox: { p012: true } });
  flight.SetManualPose(FLYOVER[0].aircraft, FlyoverPose(FLYOVER[0], 5));
  flight.SetManualPose(FLYOVER[1].aircraft, FlyoverPose(FLYOVER[1], 5));
  flight.Update(1);
  assert.ok(flight.forms.every((f) => f.root.visible && f.root.position.y > 100), "AircraftFlight holds two manual poses at once");
  flight.SetManualPose(FLYOVER[0].aircraft, null); flight.Update(1.1);
  assert.ok(!flight.forms[0].root.visible && flight.forms[1].root.visible, "releasing one aircraft leaves the other flying");
  assert.equal(flight.manualPose?.id, FLYOVER[1].aircraft, "the legacy single manualPose getter still answers");
  console.log(`ok flyover: ${JSON.stringify(report.flyover)}, trigger at the wall or ${FLYOVER_TRIGGER.fallbackS} s, released after the pass / on leaving 03`);
}
{
  // ---- 5d. 阴天开关
  assert.equal(sky.overcast, false, "overcast defaults off (contract §2 item 15)");
  const preset = OvercastPreset();
  assert.deepEqual(preset.fog, SKY_PRESETS[sky.fogFrom].fog, "the overcast preset keeps the level's own fog");
  assert.ok(preset.saturation < 0.85 && preset.sunIntensity <= SKY_PRESETS.overcast.sunIntensity, "overcast: low saturation, diffuse sun");
  const calls = [];
  const set = new OpeningSet({ scene: new THREE.Scene(), library: null, groundAt: (x, z) => G(x, z),
    applySky: (name) => { calls.push(["apply", name]); return true; }, restoreSky: () => calls.push(["restore"]) });
  set.Update(0.016, "Trapped", "Banter", {});
  assert.equal(calls.length, 0, "switch off: the sky is not touched");
  set.SetOvercast(true);
  assert.deepEqual(calls, [["apply", sky.preset]], "switching on in 01 applies the overcast preset once");
  assert.ok(SKY_PRESETS[sky.preset], "the preset is registered by name for the host's ApplySkyPreset");
  set.Update(0.016, "BunkerRescue", "Hold", {});
  set.Update(0.016, "Support", null, {});
  assert.equal(calls.length, 1, "stays applied through 01–03");
  set.Update(0.016, "MachineGun", null, {});
  assert.deepEqual(calls.at(-1), ["restore"], "leaving 01–03 restores the level sky");
  set.Exit();
  assert.equal(calls.length, 2, "nothing else touched the sky");
  console.log("ok overcast: off by default, overcast preset with the level's fog, applied in 01–03 and restored after");
}
{
  // ---- 5e. 03 前沿布景：砖壳包住阵位体块、破口处不加高、倒墙不挡阵位看缺口里的人、弹药箱不挡人
  const ids = FRONT_PROPS.map((p) => p.id);
  for (const id of ["nestBrickWallWestHigh", "nestBrickWallRearWest", "nestBrickWallEastGable", "gapWallCollapsed", "gapRevetment", "nestAmmoBoxes"])
    assert.ok(ids.includes(id), `front prop ${id} (contract §4.5)`);
  assert.deepEqual(FRONT_SET_STAGES, ["Support", "MachineGun", "Tank", "Orders"], "front dressing lives through the stages fought at the nest");
  const set = new OpeningSet({ scene: new THREE.Scene(), library: null, groundAt: (x, z) => G(x, z) });
  const Capture = () => { const list = []; return { list, SetSector() {}, Add: (key, g) => { g.computeBoundingBox(); list.push({ key, box: g.boundingBox.clone() }); } }; };
  report.shells = {};
  for (const prop of FRONT_PROPS.filter((p) => p.kind === "brickShell")) {
    const block = L.blocks.find((b) => b.id === prop.block), sink = Capture();
    set.BuildBrickShell(prop, sink);
    const [core, ...bricks] = sink.list, top = block.y + block.h / 2;
    // 体块（可能斜着，ry）外扩 skin 后的四个角都在砖壳芯的外廓里（PlaceGeometry 约定：局部 +x → (cos, -sin)）。
    const c = Math.cos(block.ry || 0), s = Math.sin(block.ry || 0);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
      const lx = a * (block.w / 2 + BRICK.skinM * 0.99), lz = b * (block.d / 2 + BRICK.skinM * 0.99);
      return { x: block.x + lx * c + lz * s, z: block.z - lx * s + lz * c };
    });
    assert.ok(corners.every((p) => p.x >= core.box.min.x - 1e-3 && p.x <= core.box.max.x + 1e-3 && p.z >= core.box.min.z - 1e-3 && p.z <= core.box.max.z + 1e-3)
      && core.box.max.y >= top && core.box.min.y <= block.y - block.h / 2 + 1e-3, `${prop.id} wraps ${prop.block} on every side (no invisible wall)`);
    const jagTop = Math.max(top, ...bricks.map((b) => b.box.max.y));
    assert.ok(jagTop - top <= prop.extraM + 0.12, `${prop.id}: the ragged top grows at most ${prop.extraM} m (+1 course) over the collider`);
    if (prop.breach) {
      const inBreach = bricks.filter((b) => { const c = (b.box.min.z + b.box.max.z) / 2; return c > prop.breach.from && c < prop.breach.to && b.box.min.y > top - 0.05; });
      assert.deepEqual(inBreach, [], `${prop.id}: nothing sits on the wall in the gun breach`);
    }
    report.shells[prop.id] = { bricks: bricks.length, jagM: +(jagTop - top).toFixed(2) };
  }
  // 西矮墙在守机枪（04）时不挡坐位看 30 m 外：坐位眼高约 1.77 m、离墙 1.9 m 的视线在墙处高于墙头锯齿。
  {
    const low = FRONT_PROPS.find((p) => p.id === "nestBrickWallWestLow"), block = L.blocks.find((b) => b.id === low.block);
    const seatEye = G(25.9, -153.9) + 0.12 + 1.65, wallTop = block.y + block.h / 2 + low.extraM + BRICK.courseM / 2;
    const lineAtWall = seatEye - (seatEye - (G(-8, -150) + 1.0)) * (25.9 - 24) / (25.9 - -8);
    assert.ok(lineAtWall > wallTop, `seat -> gap sightline passes over the ragged low wall (${lineAtWall.toFixed(2)} > ${wallTop.toFixed(2)})`);
  }
  // SB08：阵位（玩家 (25.6,-155.2) 站在射击台上）看缺口段沟里的守军。倒墙与护壁只是外观，但玩家的眼睛看得见它们：
  // 基线里看得见头的点（Space 探针只算体块与地形），加了本包的布景以后还得看得见。倒墙南头 z > -143.8 那一截除外。
  {
    const eyeP = { x: 25.6, z: -155.2 }, eyeY = G(eyeP.x, eyeP.z) + 0.12 + 1.62;
    const guardRoute = (await import("./Data_FirstLevelFrontRoute.mjs")).FRONT_SORTIE.guardRoute;
    const pts = Samples(guardRoute.slice(0, 4)).filter((p, i) => i % 5 === 0 && p.z <= -143.8);
    const boxes = FRONT_PROPS.filter((p) => ["collapsedWall", "revetment", "sandbagStakes"].includes(p.kind))
      .flatMap((p) => PropFootprints(p).map((box) => ({ id: p.id, box })));
    const Inside = ({ box }, x, y, z) => {
      const c = Math.cos(box.ry), sn = Math.sin(box.ry), dx = x - box.x, dz = z - box.z, lx = dx * c - dz * sn, lz = dx * sn + dz * c;
      if (Math.abs(lx) > box.w / 2 || Math.abs(lz) > box.d / 2) return false;
      const g = G(box.x, box.z);
      return y > g + box.y0 && y < g + box.y1;
    };
    let baseline = 0; const blocked = [];
    for (const p of pts) {
      const head = G(p.x, p.z) + 1.55, eye = { x: eyeP.x, y: eyeY, z: eyeP.z }, to = { x: p.x, y: head, z: p.z };
      if (Sight(eye, to, { state: "BunkerCollapsed" }) != null) continue;
      baseline += 1;
      const n = Math.ceil(Math.hypot(to.x - eye.x, to.z - eye.z) / 0.05);
      for (let k = 1; k < n; k++) {
        const t = k / n, x = eye.x + (to.x - eye.x) * t, y = eye.y + (to.y - eye.y) * t, z = eye.z + (to.z - eye.z) * t;
        const hit = boxes.find((b) => Inside(b, x, y, z));
        if (hit) { blocked.push(`${hit.id} hides (${p.x.toFixed(1)},${p.z.toFixed(1)})`); break; }
      }
    }
    report.sb08 = { points: pts.length, baselineVisible: baseline, blockedBySet: blocked.length };
    assert.ok(baseline >= 3, `SB08 baseline: guards' heads visible from the nest at >= 3 route points: ${baseline}`);
    assert.deepEqual(blocked, [], "SB08: the collapsed wall and the gap revetment hide none of the guards the nest could see");
  }
  // 弹药箱：不压坐位、SB08 站位与机枪托架。
  {
    const box = PropFootprints(FRONT_PROPS.find((p) => p.id === "nestAmmoBoxes"))[0];
    for (const [name, p] of [["seat", { x: 25.9, z: -153.9 }], ["SB08 stand", { x: 25.6, z: -155.2 }]])
      assert.ok(!Clash(box, p), `nestAmmoBoxes clear of the ${name}`);
    const rest = L.blocks.find((b) => b.id === "RightNestFrontRest");
    assert.ok(Math.abs(box.z - rest.z) > box.d / 2 + rest.d / 2, "nestAmmoBoxes beside the gun rest, not inside it");
  }
  // 守军撤回路线（guardRoute）不被前沿布景的实体（≥ 0.3 m 高）压住。
  {
    const guardRoute = (await import("./Data_FirstLevelFrontRoute.mjs")).FRONT_SORTIE.guardRoute;
    const clashes = FRONT_PROPS.flatMap((prop) => PropFootprints(prop).filter((b) => !b.walkable)
      .flatMap((b) => Samples(guardRoute).filter((p) => Clash(b, p)).slice(0, 1).map((p) => `${prop.id} at (${p.x.toFixed(1)},${p.z.toFixed(1)})`)));
    assert.deepEqual(clashes, [], "front dressing stays off the guards' withdrawal route");
  }
  // 能被战车打塌的墙：每一级一份砖壳，跟着 FrontBreakables 的当前级只显示那一份（打塌以后砖不会还立着）。
  {
    const scene3 = new THREE.Scene(), fs3 = new OpeningSet({ scene: scene3, library: null, groundAt: (x, z) => G(x, z) });
    fs3.Enter("Support");
    const entries = fs3.front.breakables;
    const wrapped = FRONT_PROPS.filter((p) => p.kind === "brickShell" && FRONT_BREAKABLES.some((b) => b.block === p.block));
    assert.ok(wrapped.length >= 3 && entries.length === wrapped.length, `every breakable wall under a brick shell has per-stage shells (${entries.length})`);
    report.breakableShells = {};
    for (const entry of entries) {
      const br = FRONT_BREAKABLES.find((b) => b.id === entry.id), block = L.blocks.find((b) => b.id === entry.block);
      assert.equal(entry.groups.length, br.stages.length + 1, `${entry.id}: one shell per stage`);
      assert.deepEqual(entry.groups.map((g) => g.visible), entry.groups.map((g, k) => k === 0), `${entry.id}: only the intact shell shows before the tank`);
      const tops = BreakableTops(block, br, G);
      report.breakableShells[entry.id] = entry.groups.map((group, k) => {
        const box = new THREE.Box3().setFromObject(group);
        assert.ok(box.max.y >= tops[k] - 1e-3, `${entry.id} stage ${k}: the shell covers the stage-${k} wall (top ${tops[k].toFixed(2)})`);
        if (k > 0) assert.ok(box.max.y <= tops[k] + 0.02 + 0.2 + BRICK.courseM + 0.06, `${entry.id} stage ${k}: the broken shell is no taller than the broken wall + two courses (${box.max.y.toFixed(2)} vs ${tops[k].toFixed(2)})`);
        return +(box.max.y - tops[k]).toFixed(2);
      });
    }
    const first = entries[0];
    fs3.SyncBreakables({ items: [{ spec: { block: first.block }, stage: 1 }] });
    assert.deepEqual(first.groups.map((g) => g.visible), first.groups.map((g, k) => k === 1), "the shell follows the wall's current stage");
    assert.ok(entries.slice(1).every((e) => e.groups[0].visible), "the other walls stay intact");
    fs3.Update(1 / 60, "Tank", null, { breakables: { items: [{ spec: { block: first.block }, stage: 99 }] } });
    assert.ok(first.groups[first.groups.length - 1].visible, "04–06 (no 01–03 set loaded) still follow the walls; stage clamps to the last shell");
    fs3.Exit();
    assert.equal(scene3.children.length, 0, "Exit removes the per-stage shells");
  }
  const scene = new THREE.Scene(), fs2 = new OpeningSet({ scene, library: null, groundAt: (x, z) => G(x, z) });
  fs2.Enter("Support");
  report.frontMeshes = fs2.Stats().frontMeshes;
  assert.ok(report.frontMeshes <= 8, `front dressing is a handful of batched meshes: ${report.frontMeshes}`);
  assert.ok(fs2.Stats().meshes + report.frontMeshes <= 60, "01–03 + front new draw calls <= 60 (contract §6)");
  fs2.Suspend(true);
  assert.equal(scene.children.length, 0, "Suspend (A/B off) takes everything out");
  fs2.Suspend(false);
  assert.equal(scene.children.length, 2, "Suspend(false) puts both back");
  fs2.Exit();
  assert.equal(scene.children.length, 0, "Exit removes the front dressing");
  console.log(`ok front: shells ${JSON.stringify(report.shells)}, per-stage ${JSON.stringify(report.breakableShells)}, SB08 ${JSON.stringify(report.sb08)}, ${report.frontMeshes} meshes`);
}

console.log(`OpeningSetTest ok ${JSON.stringify({ timberBand: report.timberBand, rubbleTopM: report.rubbleTopM, backrest: report.backrest, seatF: report.seatF, meshes: report.stats.meshes })}`);
