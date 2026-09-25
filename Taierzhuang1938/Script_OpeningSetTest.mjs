// Script_OpeningSetTest.mjs —— 01–03 过场分镜布景（Set 包）的纯 Node 门禁。
//
//   node Taierzhuang1938/Script_OpeningSetTest.mjs
//
// 1. 数据合法：契约 §4.5 的道具 id 都在、数值有限、种类认得、贴图文件在、外部模型 id 在；
// 2. 道具不压导演的站位与路线（读 Data_OpeningStoryboards；近爆之后才出现的道具只对近爆之后的标记算；
//    DESIGNED_CONTACTS 里写明的有意接触除外）。契约要 Dir 包挪走的旧标记（BASE）**只在 Dir 包还没合进来时**只报不判：
//    Dir 一合进来（shunzi.trap 不再是基线值），BASE 里还留着基线值、又压着本包道具的，一律判红——包括不在 Dir 任务书里的
//    withdraw.lane（本包给了替代折线 WITHDRAW_LANE_SET，这里断言它走得通）；
// 3. 洞口塌土改形：SB03 眼位看审问组与右侧沟底不被塌土挡；还权坐位西侧有靠背、看得见岔口 J；
//    SB03/03A 眼位看审问组也不被本包的布景挡（布景只是外观，Space 的视线探针看不见它们，这里单独量）；
//    SB03 看旗面（离地 2.4–2.8 m）与画面右四分之一的沟纵深不被本包布景挡；SB03 画面里没有塌顶木（它到 Reach 才塌下来），
//    左上角有那根斜断木；SB03A 上沿那条塌顶木真在画面上沿；
//    还权位对折角 F：契约 v1.1 §8 第 1 条定为「F 可见，由还权迟疑保护」：断言 K2b 把 F 记为 need、迟疑 >= 3 s / 40 m、战役驾驶器在断言它；
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
  SMOKE_POOL_SHARE, SmokeShare, FLYOVER_TRIGGER, FlyoverPose, FRONT_PROPS, FRONT_SET_STAGES, BRICK } from "./Data_OpeningSet0103.mjs";
import { OpeningSet, OvercastPreset, BreakableTops } from "./Script_OpeningSet.mjs";
import { FRONT_BREAKABLES } from "./Data_FirstLevelFrontBreakables.mjs";
import { OpeningBlastFx } from "./Script_OpeningBlastFx.mjs";
import { VfxSystem } from "./Script_Vfx.mjs";
import { AircraftFlight } from "./Script_Aircraft.mjs";
import { SKY_PRESETS } from "./Script_Sky.mjs";
import { OPENING_STORYBOARDS as C } from "./Data_OpeningStoryboards.mjs";
import { SampleMissionTerrain as G } from "./Data_FirstLevelMissionTerrain.mjs";
import { CreateP012Terrain } from "./Data_FirstLevelP012Terrain.mjs";
import { MISSION_LAYOUT as L } from "./Data_FirstLevelMissionLayout.mjs";
import { FRONT_SPACE as SP } from "./Data_FirstLevelFrontRoute.mjs";
import { Sight, Eye, RouteClearance } from "./Script_FirstLevelSpaceProbe.mjs";
import { SPACE_KEYFRAMES } from "./Data_FirstLevelSpaceKeyframes.mjs";

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
  // 土皮抄的体块尺寸和 Layout 里的 Space 体块一致（Data 不引 Layout，这里对账）。
  for (const prop of PROPS.filter((p) => p.kind === "earthSkin")) {
    const block = L.scenario.states.find((s) => s.id === "BunkerCollapsed").blocks.find((b) => b.id === prop.block);
    assert.ok(block && ["x", "z", "w", "d", "h"].every((k) => Math.abs(block[k] - prop.box[k]) < 1e-6), `${prop.id}.box matches the Space block ${prop.block}`);
  }
  // 契约 §4.5 的 flagSkyline*：没单独做——SB03/03A 天际线上那面旗由 flagTrench 承担（插在南沟沿、杆 2.8 m）；报告里提请改契约。
  assert.ok(!ids.some((id) => id.startsWith("flagSkyline")) && ids.includes("flagTrench"), "flagSkyline* is carried by flagTrench (reported)");
  // 洞内陈设以洞底为参考地面：取样点必须真在洞底。
  assert.ok(Math.abs(G(FLOOR.x, FLOOR.z) + 1.93) < 0.05, `FLOOR samples the dugout floor: ${G(FLOOR.x, FLOOR.z).toFixed(2)}`);
  console.log(`ok data: ${PROPS.length} props, contract ids present, textures and external assets found`);
}

// ---------------------------------------------------------------- 2. 不压导演的站位与路线
// 两套标记：
//  · 契约 §5 的目标站位（本轮各镜的起点数，硬断言）；
//  · Data_OpeningStoryboards 里的现行标记与路线。契约 §2 第 1/5/6/9 条要 Dir 包挪走的那些（BASE 的指纹），
//    **只在 Dir 包还没合进来时**（shunzi.trap 还是基线 b33e30951 的值）只报不判；Dir 合进来以后按现值照常判——
//    还压着本包道具的（不管在不在 Dir 任务书里），就是合并后没接好的线，判红。
// 近爆之后才出现的道具（show:"collapsed"）只对近爆之后的标记算。
const P2 = (x, z) => ({ x, z });
const SB06_DRAG_COVER_SET = [P2(0.6, -123.9), P2(1.2, -123.68), P2(2.2, -123.72), P2(2.62, -124.5), P2(2.4, -125.2)];
const SB06_DRAG_COVER_SURVEY = [P2(0.6, -123.9), P2(0.7, -124.9), P2(1.6, -125.3), P2(2.4, -125.2)];
const WITHDRAW_LANE_SET = [P2(3.12, -125.73), ...C.withdraw.lane.slice(2)];          // 罗：跪位 -> (3.3,-124.2) -> 现行折线
const WITHDRAW_PLAYER_SET = [P2(2.4, -125.2), P2(3.3, -124.2)];                        // 玩家：坐位 -> 汇入点（战役驾驶器 WITHDRAW_ROUTE 的起点）
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
  // 02 撤出（withdraw.lane）：现行折线从洞口里 (0.3,-125.1) 起跑，穿过近爆后塌下的门楣、塌顶木与坐位靠背（审查 09-25）。
  // 契约 §2 第 9 条把罗班长与顺子都挪到洞口外（罗跪 (3.12,-125.73)、顺子坐 (2.40,-125.20)），撤出不必再从洞里起跑。
  // 本包给 Dir 的替代折线：罗从跪位起、玩家从坐位起，汇到 (3.3,-124.2) 以后沿用现行折线。
  ["withdraw.laneSet", WITHDRAW_LANE_SET, true], ["withdraw.playerSet", WITHDRAW_PLAYER_SET, true],
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
/** Dir 包合进来了没有：契约 §2 第 1 条一定会改 shunzi.trap。 */
const DIR_MERGED = Print([C.shunzi.trap]) !== BASE["shunzi.trap"];
/** BASE 里不在 Dir 任务书（契约 §2 第 1/5/6/9 条）里的：合并后要集成负责人另外派。 */
const NOT_IN_DIR_BRIEF = new Set(["withdraw.lane"]);
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
      // 土皮只算它比 Space 体块多长出来的那一圈：本来就贴着体块的站位（SB05 日兵甲、翻译贴着 BunkerMouthSpoil 北面）是 Space/Dir 的事。
      const Bare = (b, p) => b.block && Clash({ x: b.block.x, z: b.block.z, w: b.block.w, d: b.block.d, ry: 0, y0: 0, y1: b.block.h }, p);
      const hit = Samples(mark.route).find((p) => boxes.some((b) => Clash(b, p) && !Bare(b, p)));
      if (!hit) continue;
      const line = `${prop.id} x ${mark.name} at (${hit.x.toFixed(2)},${hit.z.toFixed(2)})`;
      if (!mark.contract && !DIR_MERGED && BASE[mark.name] === Print(mark.route)) pending.push(NOT_IN_DIR_BRIEF.has(mark.name) ? `${line} [not in the Dir brief: WITHDRAW_LANE_SET]` : line);
      else clashes.push(line);
    }
  }
  const surveyRoute = PROPS.filter((p) => p.show === "collapsed" || true).flatMap((prop) => {
    const boxes = PropFootprints(prop).filter((b) => !b.walkable), hit = Samples(SB06_DRAG_COVER_SURVEY).find((p) => boxes.some((b) => Clash(b, p)));
    return hit && !(DESIGNED_CONTACTS[prop.id]?.marks || []).includes("SB06.seat") ? [`${prop.id} at (${hit.x.toFixed(2)},${hit.z.toFixed(2)})`] : [];
  });
  report.surveyDragCoverClashes = surveyRoute;
  report.markClashes = clashes; report.pendingDir = pending; report.dirMerged = DIR_MERGED;
  assert.deepEqual(clashes, [], "set dressing stands clear of the contract §5 marks and the director's current marks/routes (capsule r 0.28, 0.3–1.7 m)");
  console.log(`   survey SB06 drag-cover line (reported, Dir picks the route): ${JSON.stringify(surveyRoute)}`);
  console.log(`ok marks: ${PROPS.length} props x ${MARKS.length} marks/routes (${CONTRACT_MARKS.length} contract §5), no clash; `
    + (DIR_MERGED ? "Dir package merged: base values judged like any other mark" : `Dir package not merged yet, ${pending.length} clashes only with base values (red once Dir lands): ${JSON.stringify(pending)}`));
}

// ---------------------------------------------------------------- 3. 洞口塌土改形（纯 node 视线）
{
  const collapsed = L.scenario.states.find((s) => s.id === "BunkerCollapsed").blocks;
  const rubble = collapsed.find((b) => b.id === "BunkerMouthRubbleS");
  const floor = G(rubble.x, rubble.z);
  report.rubbleTopM = +(rubble.y + rubble.h / 2 - floor).toFixed(2);
  assert.ok(report.rubbleTopM <= 0.36, `SB03: the south mouth rubble is a low heap (<= 0.36 m): ${report.rubbleTopM}`);
  assert.ok(rubble.solid !== false, "the south mouth rubble keeps its collider");
  assert.ok(!collapsed.some((b) => b.id === "BunkerMouthLintel"), "collapsed: the whole lintel box is replaced by the Set's fallen lintel");
  const stub = collapsed.find((b) => b.id === "BunkerMouthLintelN"), lintelSpec = PROPS.find((p) => p.id === "fallenLintel");
  assert.ok(stub && Math.abs(stub.z + stub.d / 2 - lintelSpec.breakZ) < 0.01 && Math.abs(stub.z - stub.d / 2 - (lintelSpec.intact.z - lintelSpec.intact.d / 2)) < 0.01,
    "collapsed: the lintel's north half stays on the north post as a Space block (the mouth keeps it after 03)");
  const mound = PROPS.find((p) => p.id === "rubbleMoundS");
  // SB03 眼高 0.26：土包顶（含起伏）要比眼睛低，不然在画面右下拱过地平线（审查 09-25）。
  assert.ok(report.rubbleTopM <= 0.15, `the rubble block is ankle high: ${report.rubbleTopM}`);
  assert.ok(mound.peak * (1 + (mound.bump ?? 0.22) / 2 * 1.4) <= 0.26 - 0.04 && mound.peak >= report.rubbleTopM,
    `the mound stays under the SB03 eye (0.26 m) and covers the block: ${mound.peak}`);
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
  // 折角 F：契约 §2 第 9 条原写「还权位只遮 F、不遮 J」（K2b）。几何冲突（Set 报告）：
  //  · F 与 J 在同一条东西向沟里，从坐位看只差 4.4°，挡 F 的东西落在追兵 F→J、BunkerPursuitC F→(9.6,-125.1) 的路上；
  //  · 契约 §2 第 1 条把 01 受困眼位挪到洞口 (0.25–0.35,-125.2)，K1 要这个眼位看得见 F（need 2）：它和坐位看 F 的两条线
  //    在平面上几乎重合（x 10 处只差约 2 cm），受困眼更低（0.22 vs 0.72）。地上任何土堆挡住坐位眼的线，必然也挡住受困眼的线。
  //    下面把两条线在 x 10 处的离地高度算出来放进报告。
  // 契约 v1.1（docs/Data_FirstLevelStoryboard0103Contract.md §8 第 1 条，集成负责人拍板）：坐位对 F **可见**，由「还权迟疑」保护
  // （40 m 内每名日军在还权后至少 3 s 不开火，战役驾驶器断言）。下面的断言按 v1.1 改成：F 在 K2b 里记为 need（看得见），
  // 迟疑的数值够 3 s / 40 m，战役驾驶器真的在断言它——不再要求坐位遮住 F。
  report.seatF = [1.6, 1.2].map((h) => Sight(seatEye, Eye(SP.bunkerFold, h), { state: "BunkerCollapsed" }));
  {
    const trapEye = Eye({ x: 0.3, z: -125.2 }, 0.22), at = 10;
    const LineAt = (from, to) => { const t = (at - from.x) / (to.x - from.x); return { z: +(from.z + (to.z - from.z) * t).toFixed(3), liftM: +(from.y + (to.y - from.y) * t - G(at, from.z + (to.z - from.z) * t)).toFixed(2) }; };
    report.seatFConflict = Object.fromEntries([1.6, 1.2].map((h) => [`F${h}`, { seat: LineAt(seatEye, Eye(SP.bunkerFold, h)), trappedK1: LineAt(trapEye, Eye(SP.bunkerFold, h)),
      trappedSees: Sight(trapEye, Eye(SP.bunkerFold, h), { state: "BunkerCollapsed" }) == null }]));
    // 冲突本身是真的：坐位眼的线在 x 10 处比受困眼的线高、平面位置几乎重合。
    for (const row of Object.values(report.seatFConflict)) assert.ok(row.seat.liftM > row.trappedK1.liftM && Math.abs(row.seat.z - row.trappedK1.z) < 0.1, "seat->F runs just above trapped->F (geometry note)");
  }
  // 契约 v1.1 §8 第 1 条：F 可见、由还权迟疑保护。
  {
    const k2b = SPACE_KEYFRAMES.find((k) => k.id === "K2b"), rowF = k2b?.targets.find((t) => Math.hypot(t.at.x - SP.bunkerFold.x, t.at.z - SP.bunkerFold.z) < 0.01);
    assert.ok(rowF && rowF.need === rowF.heights.length, "contract v1.1 §8 item 1: K2b records the fold F as seen from the hand-back seat (need = every height)");
    const R = C.rescue;
    assert.ok(R.handbackHoldFireS >= 3 && R.handbackHoldFireM >= 40,
      `contract v1.1 §8 item 1: every Japanese within 40 m holds his fire >= 3 s after the hand-back (${R.handbackHoldFireS} s, ${R.handbackHoldFireM} m)`);
    const driver = fs.readFileSync(path.join(HERE, "Script_FirstLevelCampaignOpening.mjs"), "utf8");
    const safeS = +(driver.match(/const HANDBACK_SAFE_S\s*=\s*([\d.]+)/)?.[1] ?? NaN);
    assert.ok(safeS >= 3 && /handbackHoldFireM/.test(driver) && /holds his fire/.test(driver),
      "contract v1.1 §8 item 1: the campaign driver (Script_FirstLevelCampaignOpening) asserts the hold-fire of every Japanese near the seat for >= 3 s");
    report.seatFHoldFire = { k2bNeed: rowF.need, holdFireS: R.handbackHoldFireS, holdFireM: R.handbackHoldFireM, driverSafeS: safeS };
  }
  // SB03（Interrogation）与 SB03A（Found）眼位：01 里看得见的布景（常驻组 + 塌方组）不挡审问组。
  // 射线逐 2 cm 步进，落进任一件道具的占地盒（高度按盒子自己的参考地面算，斜木按投影插值）就算挡住。
  // SB03（Interrogation）时塌顶木还卡在洞顶下（hang），到 Reach 才塌下来：两套盒子。
  const visible01 = PROPS.filter((p) => !p.show || p.show === "collapsed");
  const Boxes = (hung) => visible01.flatMap((prop) => PropFootprints(hung && prop.hang ? { ...prop, ...prop.hang, supports: [] } : prop).map((box) => ({ prop: prop.id, box,
    ground: prop.ground ? G(prop.ground.x, prop.ground.z) : null })));
  const boxesHung = Boxes(true), boxesDown = Boxes(false);
  let boxes01 = boxesDown;
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
    boxes01 = shot === "SB03" ? boxesHung : boxesDown;
    report.setSight[shot] = spec.targets.flatMap(([name, at, heights]) => heights.map((h) => ({ name, h, blocker: SetBlocker(spec.eye, spec.h, at, h) })));
    const blocked = report.setSight[shot].filter((row) => row.blocker);
    assert.deepEqual(blocked, [], `${shot}: the set dressing does not hide the interrogation group`);
  }
  // 塌顶木的下沿在 SB03/03A 画面里的位置（1280×720、竖直视场 65°，沿镜头正前方量）：SB03A 要「上沿一整条黑木料」，
  // SB03 不能再被它框住（门柱过梁不再框住画面）。
  const timberData = PROPS.find((p) => p.id === "roofTimberDown"), tanHalf = Math.tan(32.5 * Math.PI / 180);
  report.timberBand = {};
  for (const [shot, spec] of Object.entries(groups)) {
    const timber = shot === "SB03" ? { ...timberData, ...timberData.hang } : timberData;
    const yaw = spec.yawDeg * Math.PI / 180, dir = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
    // 木料在眼睛上方：挡住的下边界是它的远端下棱（东面那条棱）。
    const dist = (timber.a.x + timber.w / 2 - spec.eye.x) / dir.x, z = spec.eye.z + dir.z * dist;
    const t = (z - timber.a.z) / (timber.b.z - timber.a.z), bottom = timber.a.lift + (timber.b.lift - timber.a.lift) * t - timber.h / 2;
    const eyeY = G(spec.eye.x, spec.eye.z) + spec.h, floor = G(FLOOR.x, FLOOR.z);
    const elev = Math.atan2(floor + bottom - eyeY, dist) - spec.pitchDeg * Math.PI / 180;
    report.timberBand[shot] = +(0.5 - Math.tan(elev) / (2 * tanHalf)).toFixed(3);   // 木料下沿在画面的纵向位置（0 = 上沿）
  }
  assert.ok(report.timberBand.SB03A > 0.06 && report.timberBand.SB03A < 0.25, `SB03A: the fallen roof timber is a band along the top: ${report.timberBand.SB03A}`);
  assert.ok(report.timberBand.SB03 < 0, `SB03: the roof timber still hangs under the roof, out of the frame (it drops at Reach): ${report.timberBand.SB03}`);
  assert.equal(timberData.settle.phase, "Reach", "the roof timber drops at Reach (SB03A), after the SB03 interrogation");
  // 相机投影（1280×720、竖直视场 65°、三轴 YXZ）：SB03 看旗面、右四分之一的沟纵深、左上角的斜断木。
  const Camera = (spec) => {
    const cam = new THREE.PerspectiveCamera(65, 16 / 9, 0.05, 400);
    cam.position.set(spec.eye.x, G(spec.eye.x, spec.eye.z) + spec.h, spec.eye.z);
    cam.rotation.set(spec.pitchDeg * DEG, spec.yawDeg * DEG, (spec.rollDeg || 0) * DEG, "YXZ"); cam.updateMatrixWorld(true);
    return cam;
  };
  const Screen = (cam, x, y, z) => { const v = new THREE.Vector3(x, y, z).project(cam); return { x: +((v.x + 1) / 2).toFixed(3), y: +((1 - v.y) / 2).toFixed(3), front: v.z < 1 }; };
  const sb03 = { ...groups.SB03, rollDeg: 4 }, cam03 = Camera(sb03);
  boxes01 = boxesHung;
  // 旗面（杆顶往下 0.46 m，离地 2.4–2.8）不被本包道具挡（Space 的通视在上面 targets 里量过）。
  const flag = PROPS.find((p) => p.id === "flagTrench");
  report.sb03Flag = [2.45, 2.62, 2.78].map((h) => ({ h, blocker: SetBlocker(sb03.eye, sb03.h, flag, h), at: Screen(cam03, flag.x, G(flag.x, flag.z) + h, flag.z) }));
  assert.deepEqual(report.sb03Flag.filter((r) => r.blocker && r.blocker !== flag.id), [], `SB03: the set hides no part of the flag cloth: ${JSON.stringify(report.sb03Flag)}`);
  assert.ok(report.sb03Flag.every((r) => r.at.front && r.at.x > 0.5 && r.at.x < 1 && r.at.y > 0 && r.at.y < 0.6), "SB03: the flag is in the right half of the frame");
  // 画面右四分之一（x 0.78–0.96、地平线上下）朝外 3 m 以内没有本包立着的道具（贴地的断板不算）：近处不挡，沟的纵深露着
  // （审查 09-25：上一版土包与塌顶木的垫块占掉右下 30%；3 m 外是沟两壁的护壁与沙袋，本来就是分镜里的纵深）。
  report.sb03Right = [];
  for (const sx of [0.78, 0.87, 0.96]) for (const sy of [0.42, 0.5, 0.58, 0.66]) {
    const dir = new THREE.Vector3(sx * 2 - 1, 1 - sy * 2, 0.5).unproject(cam03).sub(cam03.position).normalize();
    let hit = null;
    for (let d = 0.1; d < 3 && !hit; d += 0.02) {
      const p = cam03.position.clone().addScaledVector(dir, d);
      hit = boxes01.find((entry) => !entry.box.walkable && Inside(entry, p.x, p.y, p.z))?.prop || null;
    }
    report.sb03Right.push({ sx, sy, hit });
  }
  assert.deepEqual(report.sb03Right.filter((r) => r.hit), [], `SB03: nothing of the set in the right quarter of the frame: ${JSON.stringify(report.sb03Right.filter((r) => r.hit))}`);
  // 左上角的斜断木（分镜 03 左上前景）：下端在画面左上三分之一里，上端出左上角。
  const board = PROPS.find((p) => p.id === "brokenBoardNW"), boardFloor = G(board.ground.x, board.ground.z);
  report.sb03Board = { low: Screen(cam03, board.b.x, boardFloor + board.b.lift, board.b.z), high: Screen(cam03, board.a.x, boardFloor + board.a.lift, board.a.z) };
  assert.ok(report.sb03Board.low.front && report.sb03Board.low.x > 0.05 && report.sb03Board.low.x < 0.4 && report.sb03Board.low.y > 0.05 && report.sb03Board.low.y < 0.4,
    `SB03: the broken board's hanging end is in the upper-left of the frame: ${JSON.stringify(report.sb03Board)}`);
  assert.ok(report.sb03Board.high.x < report.sb03Board.low.x + 0.05 && report.sb03Board.high.y < report.sb03Board.low.y, "SB03: it runs from the upper-left corner down to the right");
  // SB02 镜像机位（真实流程 Blast 的镜头：眼 (-0.6,-125.95) 离地 0.75、yaw -66、pitch -13.3、roll +15）：标语的字与马灯在画框里。
  const cam02 = Camera({ eye: { x: -0.6, z: -125.95 }, h: 0.75, yawDeg: -65.9, pitchDeg: -13.3, rollDeg: 15 });
  const poster = PROPS.find((p) => p.id === "bunkerPoster"), lamp = PROPS.find((p) => p.id === "bunkerLantern"), floor01 = G(FLOOR.x, FLOOR.z);
  const textTop = poster.lift + poster.h / 2 - poster.textBand[0] * poster.h, textBottom = poster.lift + poster.h / 2 - poster.textBand[1] * poster.h;
  report.sb02Text = [[-0.2, textTop], [0.2, textTop], [-0.2, textBottom], [0.2, textBottom]].map(([u, lift]) => Screen(cam02, poster.x + u * poster.w, floor01 + lift, poster.z));
  report.sb02Lantern = Screen(cam02, lamp.x, floor01 + lamp.lift, lamp.z);
  assert.ok(report.sb02Text.every((p) => p.front && p.x > 0.02 && p.x < 0.98 && p.y > 0.02 && p.y < 0.98), `SB02: the slogan's characters are inside the Blast frame: ${JSON.stringify(report.sb02Text)}`);
  const sandTop = PROPS.find((p) => p.id === "bunkerSandbagWallN"), sandLift = sandTop.layers * sandTop.layerM;
  assert.ok(textBottom >= sandLift - 0.01, `SB02: the characters sit above the sandbag wall (${textBottom.toFixed(2)} >= ${sandLift.toFixed(2)})`);
  assert.ok(report.sb02Lantern.front && report.sb02Lantern.y > 0.03 && report.sb02Lantern.y < 0.5 && report.sb02Lantern.x > 0.02 && report.sb02Lantern.x < 0.6, `SB02: the lantern is in the left half of the Blast frame: ${JSON.stringify(report.sb02Lantern)}`);
  console.log(`ok rubble: heap ${report.rubbleTopM} m, SB03 group, flag and right-hand trench in view, broken board ${JSON.stringify(report.sb03Board)}, `
    + `backrest ${JSON.stringify(report.backrest)}, seat sees J; seat->F ${JSON.stringify(report.seatF)} ${DIR_MERGED ? "(asserted)" : "(Dir not merged: reported)"} ${JSON.stringify(report.seatFConflict)}; `
    + `SB02 text ${JSON.stringify(report.sb02Text.map((p) => [p.x, p.y]))} lantern ${JSON.stringify([report.sb02Lantern.x, report.sb02Lantern.y])}`);
}

// ---------------------------------------------------------------- 4. 生命周期：装载、塌方、马灯、收走
{
  const scene = new THREE.Scene();
  const keep = new THREE.Object3D(); keep.name = "Existing"; scene.add(keep);
  // 假材质库只认真库里有的配方（名字写错要抛出来，不许静默退回纯色：契约「不许静默退回」，审查 09-25）。
  const shared = new Map(), KNOWN = new Set(["Sandbag", "WoodBeam", "WoodCrate", "GroundRubble", "CityWallBrickPbr"]);
  const library = { Get: (name) => {
    if (!KNOWN.has(name)) throw new Error(`unknown material recipe ${name}`);
    if (!shared.has(name)) shared.set(name, new THREE.MeshStandardMaterial({ name })); return shared.get(name);
  } };
  {
    const broken = new OpeningSet({ scene: new THREE.Scene(), library: { Get: (name) => { throw new Error(`unknown material recipe ${name}`); } }, groundAt: (x, z) => G(x, z) });
    assert.throws(() => broken.Enter("Trapped"), /unknown material recipe/, "a missing recipe with a real library throws (no silent flat-colour fallback)");
    assert.throws(() => broken.Enter("Support"), /unknown material recipe/, "the front dressing too");
  }
  const set = new OpeningSet({ scene, library, groundAt: (x, z) => G(x, z) });
  assert.equal(set.Enter("Wake"), false, "an unknown / later stage does not build the set");
  assert.equal(scene.children.length, 1, "nothing built outside 01–03");
  assert.equal(set.Enter("Trapped"), true);
  // 前沿布景 01 进场时就建好、藏着（02→03 那一帧不现建，审查 09-25）；03 起才显示。
  assert.ok(set.front && set.front.root.parent === scene && set.front.root.visible === false && set.Stats().frontMeshes === 0, "01: the front dressing is prebuilt and hidden (no draw)");
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
  assert.equal(set.roofTimber.progress, 0, "after the blast the roof timber hangs under the roof");
  assert.equal(set.roofTimber.supports.visible, false, "its rubble supports come down with it, not before");
  set.Update(0.016, "Trapped", "Blast", { collapsed: true, blastAge: 0.45 });
  const mid = set.Stats().lintelProgress;
  assert.ok(mid > 0.1 && mid < 0.9, `mid-fall at 0.45 s: ${mid}`);
  set.Update(0.016, "Trapped", "Blast", { collapsed: true, blastAge: 1.2 });
  assert.equal(set.Stats().lintelProgress, 1, "the lintel is down by 1.2 s");
  assert.equal(set.Stats().collapsedVisible, true, "after the blast the collapse group shows");
  assert.equal(set.Stats().rescueVisible, false, "the hand-back backrest stays hidden through 01 (it would hide the SB03 group)");
  // 塌顶木：SB03（Interrogation）还卡在洞顶下，Reach 那一拍 0.32 s 塌下来、垫块跟着出现；落定后两头在数据的 a/b 上。
  set.Update(0.016, "Trapped", "Interrogation", { collapsed: true, blastAge: 20 });
  assert.equal(set.roofTimber.progress, 0, "SB03 (Interrogation): the roof timber still hangs, out of the frame");
  set.Update(0.016, "Trapped", "Reach", { collapsed: true, blastAge: 30 });
  const settling = set.roofTimber.progress;
  for (let i = 0; i < 40; i++) set.Update(1 / 60, "Trapped", "Reach", { collapsed: true, blastAge: 30 + i / 60 });
  assert.ok(settling < 0.2 && set.roofTimber.progress === 1 && set.roofTimber.supports.visible, `SB03A (Reach): it drops within the beat: ${settling} -> ${set.roofTimber.progress}`);
  {
    const spec = PROPS.find((p) => p.id === "roofTimberDown"), mesh = set.roofTimber.mesh, floor = G(spec.ground.x, spec.ground.z);
    const len = Math.hypot(spec.b.x - spec.a.x, spec.b.lift - spec.a.lift, spec.b.z - spec.a.z);
    const endB = new THREE.Vector3(0, 0, len / 2).applyMatrix4(mesh.matrixWorld);
    assert.ok(endB.distanceTo(new THREE.Vector3(spec.b.x, floor + spec.b.lift, spec.b.z)) < 0.02, "the settled roof timber lies on its SB03A mark");
  }
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
  assert.equal(set.roofTimber.progress, 1, "Found (and anything after Reach) has the roof timber down");
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
  assert.ok(set.Active && scene.children.length === 3 && set.front && !set.front.root.visible, "jumping back to 02 rebuilds the set (the front dressing is built but hidden until 03)");
  set.Exit();
  assert.equal(scene.children.length, 1, "Exit() removes it again");
  console.log(`ok lifecycle: ${report.stats.meshes} meshes / 1 light in 01–03, lintel falls 0.25–0.6 s, lantern only in 01, zero residue after 03`);
}
{
  // ---- 4b. 真几何视线：SB03 / SB03A / SB04 看人物的头，不被本包**真正建出来的网格**挡（第 3 节只按占地盒、按契约站位
  // 的「头在脚正上方」量，漏掉了 SB03 实拍的红：跪着的川军往后靠，头在脚后 0.39 m、比竖直板墙还靠北 7 cm，
  // 正好顶在第一口东门柱上——Script_OpeningStoryboardShots 报「comrade head not behind scenery: …|WoodBeam」）。
  // 头的位置是真实流程里量的（2026-09-26，Script_OpeningStoryboardShots 抓帧时读骨骼：CaptiveKneelMud / CaptiveWallSlideTwitch /
  // 日兵甲），写成离人脚下地面的高度；镜头是那三镜实拍的眼位。**地面用游戏里的高度场**（Data_FirstLevelP012Terrain，0.75 m 格，
  // 宿主的 groundAt 就是它）：北壁坡脚在高度场里被抹缓，立面底比解析地形 SampleMissionTerrain 高 0.3 m 左右，
  // 拿解析地形建立面量出来是通的、游戏里照样挡（09-26 第一版修法就栽在这）。射线打本包建出的网格（三角面、按材质正面），跟抓帧工具同一口径。
  const P012 = CreateP012Terrain(L), GG = (x, z) => P012.SampleHeight(x, z);
  const shared = new Map(), KNOWN = new Set(["Sandbag", "WoodBeam", "WoodCrate", "GroundRubble", "CityWallBrickPbr"]);
  const library = { Get: (name) => { if (!KNOWN.has(name)) throw new Error(`unknown material recipe ${name}`);
    if (!shared.has(name)) shared.set(name, new THREE.MeshStandardMaterial({ name })); return shared.get(name); } };
  const set = new OpeningSet({ scene: new THREE.Scene(), library, groundAt: GG });
  set.Enter("Trapped");
  const At = (x, z, h) => new THREE.Vector3(x, GG(x, z) + h, z), AtRoot = (x, z, root, h) => new THREE.Vector3(x, GG(root.x, root.z) + h, z);
  const comradeRoot = { x: 4.057, z: -125.905 }, deadRoot = { x: 4.061, z: -125.88 };
  const shots = [
    { shot: "SB03", phase: "Interrogation", eye: At(0.35, -125.15, 0.26), targets: [
      ["comrade head (kneeling, leaning back on the north wall)", AtRoot(4.068, -126.29, comradeRoot, 0.870)],
      ["ijaA head", AtRoot(4.097, -125.712, { x: 4.097, z: -125.625 }, 1.359)]] },
    { shot: "SB03A", phase: "Reach", settle: true, eye: At(0.25, -125.25, 0.18), targets: [
      ["dead comrade head (slid down the wall)", AtRoot(3.793, -126.21, deadRoot, 0.735)],
      ["ijaA head (looking back)", AtRoot(4.879, -124.46, { x: 4.9, z: -124.45 }, 1.356)]] },
    { shot: "SB04", phase: "Butt", eye: At(2.3, -124.4, 0.35), targets: [
      ["dead comrade head right of the door", AtRoot(3.793, -126.21, deadRoot, 0.735)]] },
  ];
  const ray = new THREE.Raycaster();
  const Shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const FirstHit = (root, eye, target) => {
    root.updateMatrixWorld(true);
    const dir = target.clone().sub(eye), far = dir.length() - 0.12;
    ray.set(eye, dir.normalize()); ray.near = 0.05; ray.far = far;
    const hit = ray.intersectObject(root, true).find((h) => h.object.isMesh && Shown(h.object));
    return hit ? `${hit.object.name || hit.object.parent?.name} at ${hit.point.toArray().map((v) => v.toFixed(2))}` : null;
  };
  report.setHeads = {};
  for (const s of shots) {
    set.Update(0.016, "Trapped", s.phase, { collapsed: true, blastAge: 20 });
    if (s.settle) for (let i = 0; i < 40; i++) set.Update(1 / 60, "Trapped", s.phase, { collapsed: true, blastAge: 20 + i / 60 });
    report.setHeads[s.shot] = s.targets.map(([name, target]) => ({ name, blocker: FirstHit(set.root, s.eye, target) }));
    assert.deepEqual(report.setHeads[s.shot].filter((r) => r.blocker), [], `${s.shot}: the built set hides no judged head`);
  }
  // 对照：改之前的立面（竖直、第一口 x 2.7–3.9）真挡 SB03 川军的头——这条检查抓得住那次红。
  {
    const facade = PROPS.find((p) => p.id === "trenchFacadeN"), old = { ...facade, x0: 2.6, lean: null,
      openings: [{ x0: 2.7, x1: 3.9, h: 1.7 }, { x0: 4.9, x1: 5.5, h: 1.45 }] };
    const group = new THREE.Group(), material = new THREE.MeshStandardMaterial();
    set.BuildFacade(old, { Add: (key, geometry) => group.add(new THREE.Mesh(geometry, material)) }, new Map([["OpeningSetVoid", material]]));
    report.setHeadsControl = FirstHit(group, shots[0].eye, shots[0].targets[0][1]);
    assert.ok(report.setHeadsControl, "control: the pre-fix upright facade hides the SB03 comrade head (the check can see that red)");
    group.traverse((o) => o.geometry?.dispose());
  }
  set.Exit();
  console.log(`ok set vs heads (real geometry): ${JSON.stringify(report.setHeads)}; control (old upright facade) ${report.setHeadsControl}`);
}
{
  // 正片里马灯走 LightRig 的火光池（簇光）：场景里一盏 three PointLight 都不放，01 进场、01→02 灭灯都不改 NUM_POINT_LIGHTS
  // （不然整座城的材质各重编译一次，Script_ClusteredLights 文件头）。
  const fires = new Map(); let next = 1;
  const rig = { AddFire: (p, o) => { const h = next++; fires.set(h, { p: { ...p }, ...o }); return h; },
    UpdateFire: (h, o) => { if (!fires.has(h)) return false; Object.assign(fires.get(h), o); return true; }, RemoveFire: (h) => { fires.delete(h); } };
  const scene = new THREE.Scene(), set = new OpeningSet({ scene, library: null, groundAt: (x, z) => G(x, z), vfx: { ...FakeVfx(), lights: rig } });
  set.Enter("Trapped");
  set.Update(0.016, "Trapped", "Banter", {});
  let pointLights = 0; scene.traverse((o) => { if (o.isLight) pointLights += 1; });
  assert.equal(pointLights, 0, "with a LightRig the lantern adds no three PointLight (no NUM_POINT_LIGHTS change)");
  assert.equal(fires.size, 1, "the lantern takes one fire-pool slot");
  const fire = [...fires.values()][0], lamp = PROPS.find((p) => p.id === "bunkerLantern");
  assert.ok(fire.intensity > 1 && fire.radius === lamp.light.distanceM && fire.flicker === false, "lit in 01 through the fire pool (our own flicker)");
  assert.ok(Math.abs(fire.p.x - lamp.x) < 1e-6 && Math.abs(fire.p.z - lamp.z) < 1e-6, "the fire sits in the lantern");
  set.Update(0.016, "BunkerRescue", "Hold", { collapsed: true });
  assert.equal(fires.size, 0, "out after 01: the fire-pool slot goes back at once (not held until 03 ends)");
  set.Update(0.016, "Trapped", "Banter", {});
  assert.equal(fires.size, 1, "jumping back to 01 lights it again");
  set.Update(0.016, "Tank", null, {});
  assert.equal(fires.size, 0, "leaving 01–03 hands the fire slot back");
  set.Exit();
  console.log("ok lantern: fire-pool light in the game (no three PointLight), lit only in 01, slot returned after 03");
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
    _SpawnDebris(x, y, z, vx, vy, vz, sx, sy, sz, color, life, groundY) { log.debris.push({ x, y, z, vx, vy, vz, sx, sy, sz, life, groundY, t: this.time }); },
    pools: { smoke: { Spawn: (s, time) => log.smoke.push({ ...s, t: time }) } },
    SmokeSource(position, opts) { const id = log.next++; log.sources.set(id, { position: { ...position }, opts }); return id; },
    RemoveSmokeSource(id) { log.removed.push(id); log.sources.delete(id); },
  };
}
{
  // ---- 5a. 近爆喷土：数据、时序、方向
  const eye = { x: -0.6, z: -125.95 };                       // SB02 镜像机位
  const dir = new THREE.Vector3(BLAST.dir.x, BLAST.dir.y, BLAST.dir.z).normalize();
  const toEye = new THREE.Vector3(eye.x - BLAST.at.x, 0, eye.z - BLAST.at.z).normalize();
  const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize(), sprayFlat = new THREE.Vector3(BLAST.sprayDir.x, 0, BLAST.sprayDir.z).normalize();
  report.blastAimDeg = +(sprayFlat.angleTo(toEye) / DEG).toFixed(1);
  // 镜头在泥雾锥（×1.2）的外沿以内（×1.6）：正对镜头会让整锥土贴着画框外沿走（step2 实拍）。
  assert.ok(report.blastAimDeg < BLAST.spreadRad * 1.6 / DEG, `SB02: the mirrored camera sits at the rim of the mud-spray cone (${report.blastAimDeg} deg off axis)`);
  // 喷口在 SB02 画面外（右边 69°）：主轴要横穿画面，不然整锥土一直贴着画框外沿扑过来、画面里看不见（step2 实拍）。
  // 沿主轴 1.5 m 与 2.5 m 处都要在镜头水平视场（半角约 48°）以内（3 m 处正好出左边框，北壁在 3.5 m）。
  const camFwd = new THREE.Vector3(-Math.sin(-66 * DEG), 0, -Math.cos(-66 * DEG));
  report.blastSweepDeg = [1.5, 2.5].map((m) => +(new THREE.Vector3(BLAST.at.x + flat.x * m - eye.x, 0, BLAST.at.z + flat.z * m - eye.z)
    .normalize().angleTo(camFwd) / DEG).toFixed(1));
  assert.ok(report.blastSweepDeg.every((a) => a < 48), `SB02: the spray axis sweeps across the mirrored frame (${report.blastSweepDeg} deg off the view axis)`);
  // 放平（审查 09-25：上一版抬 11°、喷口离地 0.5–1.5，镜头俯 13°，土全从画面上沿以外飞过去）。
  assert.ok(dir.x < 0 && dir.z < 0 && Math.abs(dir.y) <= 0.1 && BLAST.liftM[1] <= 1.15, "the spray goes north-west into the dugout, level and low");
  assert.ok(Math.hypot(BLAST.at.x - 1.05, BLAST.at.z - -124.3) < 0.45 && BLAST.at.z > -125, "the spray starts at the south edge of the mouth (inside the south post)");
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
  // 真实流程的 Blast 镜头（眼 (-0.6,-125.95) 离地 0.75、yaw -66、pitch -13.3、roll +15、竖直视场 65°）里，喷发粒子在 blastAge
  // 0.30 / 0.40 s（喷后 0.08 / 0.18 s）落在画面右三分之一里（审查 09-25：上一版三帧里一块土都看不见）。
  // 这里按弹道（重力，泥雾按它自己的 ay/drag 近似）把 Set 真正喷出去的每一颗投到画面上数；浏览器里的像素占比见报告。
  {
    const v3 = FakeVfx(), set3 = new OpeningSet({ scene: new THREE.Scene(), library: null, groundAt: (x, z) => G(x, z), vfx: v3 });
    set3.SprayBlast();
    for (let k = 0; k < 60; k++) { v3.time += 1 / 60; set3.blastFx.Update(1 / 60); }
    const cam = new THREE.PerspectiveCamera(65, 16 / 9, 0.05, 100);
    cam.position.set(eye.x, G(eye.x, eye.z) + 0.75, eye.z);
    cam.rotation.set(-13.3 * DEG, -65.9 * DEG, 15 * DEG, "YXZ"); cam.updateMatrixWorld(true);
    const At = (p, age, g, drag = 0) => {
      const k = drag > 0 ? (1 - Math.exp(-drag * age)) / drag : age;
      return new THREE.Vector3(p.x + p.vx * k, p.y + (p.vy ?? 0) * k + 0.5 * g * age * age, p.z + p.vz * k);
    };
    report.blastFrame = {};
    for (const since of [0.08, 0.18]) {
      const out = { clodsInFrame: 0, rightThird: 0, alive: 0 };
      for (const d of v3.log.debris) {
        const age = since - d.t; if (age < 0) continue;
        out.alive += 1;
        const s = At(d, age, -9.8).project(cam);
        if (s.z < 1 && Math.abs(s.x) < 1 && Math.abs(s.y) < 1) { out.clodsInFrame += 1; if ((s.x + 1) / 2 > 2 / 3) out.rightThird += 1; }
      }
      for (const p of v3.log.smoke) {
        const age = since - p.t; if (age < 0 || age > p.life) continue;
        out.alive += 1;
        const s = At({ ...p, vx: p.vx, vy: p.vy, vz: p.vz }, age, p.ay || 0, p.drag || 0).project(cam);
        if (s.z < 1 && Math.abs(s.x) < 1 && Math.abs(s.y) < 1 && (s.x + 1) / 2 > 2 / 3) out.rightThird += 1;
      }
      report.blastFrame[since] = out;
    }
    assert.ok(report.blastFrame[0.18].rightThird >= 0.3 * report.blastFrame[0.18].alive && report.blastFrame[0.18].clodsInFrame >= 5,
      `SB02 (blastAge 0.40): the spray fills the right third of the Blast frame and clods fly through it: ${JSON.stringify(report.blastFrame)}`);
    assert.ok(report.blastFrame[0.08].rightThird >= 5, `SB02 (blastAge 0.30): the first of it is already in the right third: ${JSON.stringify(report.blastFrame)}`);
    set3.Exit();
  }
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
  console.log(`ok blast: aim ${report.blastAimDeg} deg off the SB02 camera, ${JSON.stringify(report.blast)}, in the Blast frame ${JSON.stringify(report.blastFrame)}`);
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
  // 画质档 × 战场规模的真实池容量（审查 09-25：原预算只按 high/4000 算）。数从 Script_Vfx / Data_Battle 的源码里读，对不上就红。
  const vfxSource = fs.readFileSync(path.join(HERE, "Script_Vfx.mjs"), "utf8"), battleSource = fs.readFileSync(path.join(HERE, "Data_Battle.mjs"), "utf8");
  const tiers = Object.fromEntries(["low", "medium", "high", "ultra"].map((q) => {
    const m = vfxSource.match(new RegExp(`\\b${q}: \\{ budget: ([\\d.]+), spawn: ([\\d.]+)`));
    assert.ok(m, `Script_Vfx QUALITY_PRESETS.${q} found`);
    return [q, { budget: +m[1], spawn: +m[2] }];
  }));
  const share = +vfxSource.match(/sourceSmoke: ([\d.]+),/)[1];
  const scales = Object.fromEntries(["small", "medium", "large"].map((s) => [s, +battleSource.match(new RegExp(`\\b${s}: \\{[^}]*vfxBudget: (\\d+)`))[1]]));
  report.smokeTiers = {};
  for (const [scale, maxParticles] of Object.entries(scales)) for (const [q, tier] of Object.entries(tiers)) {
    const capacity = Math.max(48, Math.round(Math.max(200, Math.round(maxParticles * tier.budget)) * share));
    for (const stage of ["Trapped", "BunkerRescue", "Support"]) {
      const rows = SMOKE.filter((r) => r.stages.includes(stage)), k = SmokeShare(rows, tier.spawn, capacity);
      const live = rows.reduce((sum, r) => { const o = SmokeOptions(r); return sum + o.rate * o.life; }, 0) * tier.spawn * k;
      assert.ok(live <= SMOKE_POOL_SHARE * capacity + 0.5, `${scale}/${q}/${stage}: live smoke ${live.toFixed(0)} <= ${SMOKE_POOL_SHARE} x pool ${capacity}`);
      (report.smokeTiers[`${scale}/${q}`] ??= {})[stage] = +k.toFixed(2);
    }
  }
  assert.equal(report.smokeTiers["medium/high"].Trapped, 1, "default settings (medium scale, high quality): 01 columns at full rate");
  // Set 真的按池子压 rate（已经在冒的也改）。
  {
    const cap = 100, fake = FakeVfx();
    fake.pools.sourceSmoke = { capacity: cap };
    fake.smokeSources = new Map();
    const baseSource = fake.SmokeSource.bind(fake);
    fake.SmokeSource = (position, opts) => { const id = baseSource(position, opts); fake.smokeSources.set(id, { rate: opts.rate * fake.spawnScale }); return id; };
    const s2 = new OpeningSet({ scene: new THREE.Scene(), library: null, groundAt: (x, z) => G(x, z), vfx: fake });
    s2.Update(0.016, "Trapped", "Banter", {});
    s2.Update(0.016, "BunkerRescue", "Hold", {});
    const rows = SMOKE.filter((r) => r.stages.includes("BunkerRescue"));
    const live = [...fake.smokeSources.entries()].filter(([id]) => fake.log.sources.has(id))
      .reduce((sum, [id, src]) => sum + src.rate * SmokeOptions(rows.find((r) => s2.smoke.get(r.id) === id)).life, 0);
    assert.ok(live <= SMOKE_POOL_SHARE * cap + 0.5, `the set scales every live column to the pool (${live.toFixed(0)} <= ${SMOKE_POOL_SHARE * cap})`);
    s2.Exit();
  }
  console.log(`ok smoke: ${SMOKE.length} sources, live puffs per step ${JSON.stringify(stageBudget)} (<= ${SMOKE_PARTICLE_BUDGET}), rate share by scale/quality ${JSON.stringify(report.smokeTiers)}, all removed after 03`);
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
  // **契约例外**：§4.5/§6 字面写「01–03 之外全部收走」。前沿砖壳是阵位的世界外观，04（守机枪）、05（战车）、06（撤收）玩家还在
  // 那儿打，03 一过就收会把阵位打回蓝色白盒；所以活到 06（Orders）。已在报告里提请集成负责人把契约改成「03 前沿外观活到 06」。
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
