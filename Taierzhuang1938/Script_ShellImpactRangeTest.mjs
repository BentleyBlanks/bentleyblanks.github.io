// 炮击扬尘测试场（?impacts=1）的纯 Node 回归：数据、地形、壕沟网络、布景净空、弹道几何、文本表。
// 浏览器那一半（场地起得来、弹种能发、挖得出坑、时间控制、相机、选点、清空）在 Script_ShellImpactRangeBrowserTest.mjs。
// 用法：node Taierzhuang1938/Script_ShellImpactRangeTest.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SHELL_IMPACT_RANGE_ID, SHELL_IMPACT_ORIGIN, SHELL_IMPACT_WORLD, SHELL_IMPACT_TARGETS, SHELL_IMPACT_MUNITIONS,
  SHELL_IMPACT_PROPS, SHELL_IMPACT_DRUMS, SHELL_IMPACT_MG, SHELL_IMPACT_TREES, SHELL_IMPACT_TANKS, SHELL_IMPACT_CAMERAS,
  SHELL_IMPACT_RANGE_PHASE, SHELL_IMPACT_TRENCH_SEGMENTS, SHELL_IMPACT_BARRAGE, SHELL_IMPACT_TIME_SCALES,
  ORIGIN_RISE_M, LobFlightS, ArrivalAngleDeg, DropPlan, SHELL_GRAVITY,
} from "./Data_ShellImpactRange.mjs";
import {
  SampleImpactTerrain, SampleImpactNaturalHeight, ImpactTrenchPlan, BuildShellImpactLayout, SHELL_IMPACT_TERRAIN,
} from "./Data_ShellImpactRangeTerrain.mjs";
import { MISSION_TERRAIN, SampleMissionTerrain } from "./Data_FirstLevelMissionTerrain.mjs";
import { EXPLOSIVES } from "./Data_Explosives.mjs";
import { TEXT, GATED_MODULES } from "./Data_Text_ShellImpact.mjs";
import { EXPLOSION_RANGE_PHASE } from "./Data_ExplosionRange.mjs";
import { GORE_RANGE_WORLD } from "./Data_GoreRange.mjs";
import { MOVEMENT_RANGE_WORLD } from "./Data_MovementRange.mjs";
import { WEAPON_RANGE_PHASE } from "./Data_WeaponRange.mjs";
import { RANGE_PHASE } from "./Data_Range.mjs";
import { TOOLS_HOME_WORLD } from "./Data_ToolsHome.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
let checks = 0;
const Check = (fn, label) => { fn(); checks++; if (label) console.log(`ok  ${label}`); };
const O = SHELL_IMPACT_ORIGIN;
const Rel = (x, z) => SampleImpactTerrain(x, z) - SampleImpactNaturalHeight(x, z);

Check(() => {
  assert.equal(SHELL_IMPACT_RANGE_ID, "ShellImpactRange");
  assert.equal(SHELL_IMPACT_RANGE_PHASE.id, SHELL_IMPACT_RANGE_ID);
  assert.equal(SHELL_IMPACT_RANGE_PHASE.sandboxKey, "impacts");
  assert.equal(SHELL_IMPACT_RANGE_PHASE.groundImpactDust, true, "phase 字段驱动扬尘开关（Script_Main 通用接线）");
  assert.ok(SHELL_IMPACT_RANGE_PHASE.externalPlacements === SHELL_IMPACT_PROPS);
}, "相位字段：id / 沙盒键 / 扬尘开关 / 外部摆位表");

Check(() => {
  for (const file of ["Data_ShellImpactRange.mjs", "Data_ShellImpactRangeTerrain.mjs", "Data_Text_ShellImpact.mjs"]) {
    const source = fs.readFileSync(path.join(here, file), "utf8");
    assert.ok(!/from\s+["']three["']/.test(source), `${file} 必须零 three（契约 2）`);
    assert.ok(!/Math\.random/.test(source.replace(/\/\/.*$/gm, "")), `${file} 不许 Math.random`);
  }
  for (const file of ["Script_ShellImpactRange.mjs", "Script_ShellImpactLab.mjs", "Script_ShellImpactRangeField.mjs"]) {
    const source = fs.readFileSync(path.join(here, file), "utf8");
    assert.ok(!/Math\.random/.test(source.replace(/\/\/.*$/gm, "")), `${file} 不许 Math.random`);
  }
}, "纯数据层零 three、全模块零 Math.random");

Check(() => {
  const w = SHELL_IMPACT_WORLD;
  const others = [
    ["爆炸", EXPLOSION_RANGE_PHASE.bounds], ["枪械", WEAPON_RANGE_PHASE.bounds], ["靶场", RANGE_PHASE.bounds],
    ["断肢", GORE_RANGE_WORLD], ["操作", MOVEMENT_RANGE_WORLD], ["工具首页", TOOLS_HOME_WORLD],
  ];
  for (const [name, b] of others) {
    const overlap = w.minX < b.maxX && w.maxX > b.minX && w.minZ < b.maxZ && w.maxZ > b.minZ;
    assert.ok(!overlap, `与${name}测试场不重叠`);
  }
  // 远离第一关（x −260…200 / z −250…900）。
  assert.ok(w.minX > 1500 && w.minZ > 1500);
}, "场地边界不与其它测试场 / 第一关重叠");

Check(() => {
  assert.deepEqual(SHELL_IMPACT_MUNITIONS.map((m) => m.id),
    ["Grenade", "GrenadeBundle", "Shell50", "Shell37", "Shell57", "Shell82", "Shell75", "Shell105", "Shell150", "Bomb50kg", "Bomb250kg"]);
  for (const m of SHELL_IMPACT_MUNITIONS) {
    assert.ok(EXPLOSIVES[m.explosiveId], `${m.id} 的 explosiveId 在 Data_Explosives 有登记`);
    assert.equal(m.explosiveId, m.id, "explosiveId 一律传弹种自己的（扬尘靠它定装药量）");
    assert.equal(m.fillingKg, EXPLOSIVES[m.explosiveId].fillingKg, `${m.id} 装药读 Data_Explosives`);
    assert.ok(m.fillingKg > 0 && m.radiusM > 0 && m.damage > 0);
    assert.ok(["hand", "lob", "field", "direct", "drop"].includes(m.delivery));
    assert.ok(["grenade", "tank", "shell", "bomb"].includes(m.blastKind), `${m.id} blastKind 取 Combat 现有的`);
    assert.ok(TEXT[`shellImpact.munition.${m.id}`], `${m.id} 在文本表里有名字`);
  }
  const by = Object.fromEntries(SHELL_IMPACT_MUNITIONS.map((m) => [m.id, m]));
  assert.equal(by.Grenade.blastKind, "grenade"); assert.equal(by.GrenadeBundle.blastKind, "tank");
  assert.equal(by.Bomb250kg.blastKind, "bomb"); assert.equal(by.Shell150.blastKind, "shell");
  // 装药单调：同类弹越大越多。
  assert.ok(by.Shell75.fillingKg < by.Shell105.fillingKg && by.Shell105.fillingKg < by.Shell150.fillingKg);
  assert.ok(by.Bomb50kg.fillingKg < by.Bomb250kg.fillingKg);
}, "11 个弹种：装药读 Data_Explosives、explosiveId 传对、blastKind 取 Combat 现有的");

Check(() => {
  // 高抛 / 野炮：反推的飞行时间代回落角公式 = 名义落角（同一条抛物线）。
  for (const m of SHELL_IMPACT_MUNITIONS.filter((spec) => spec.delivery === "lob" || spec.delivery === "field")) {
    const flight = LobFlightS(m.rangeM, m.angleDeg);
    const angle = ArrivalAngleDeg(m.rangeM, ORIGIN_RISE_M, flight);
    assert.ok(Math.abs(angle - m.angleDeg) < 0.01, `${m.id} 落角 ${angle.toFixed(3)}° ≈ ${m.angleDeg}°`);
    // 数值积分核对：按 FireShell 的初速（(to-from)/T + g·T/2）飞一遍，命中点速度方向的夹角。
    const horizontal = m.rangeM / flight, vy0 = -ORIGIN_RISE_M / flight + SHELL_GRAVITY * flight / 2;
    const vyEnd = vy0 - SHELL_GRAVITY * flight;
    const simAngle = Math.atan2(-vyEnd, horizontal) * 180 / Math.PI;
    assert.ok(Math.abs(simAngle - m.angleDeg) < 0.01, `${m.id} 积分落角 ${simAngle.toFixed(3)}°`);
    assert.ok(flight > 1.5 && flight < 8, `${m.id} 飞行时间 ${flight.toFixed(2)} s 在可观察范围`);
  }
  // 航空炸弹：近乎垂直（75–90°），落角等于名义值。
  for (const m of SHELL_IMPACT_MUNITIONS.filter((spec) => spec.delivery === "drop")) {
    const plan = DropPlan(m.altitudeM, m.angleDeg);
    const angle = Math.atan2(plan.impactVy, plan.horizontalSpeed) * 180 / Math.PI;
    assert.ok(Math.abs(angle - m.angleDeg) < 0.01 && m.angleDeg >= 75 && m.angleDeg <= 90, `${m.id} 落角 ${angle.toFixed(2)}°`);
    assert.ok(Math.abs(plan.offsetM) < m.altitudeM * 0.4, "投下点水平偏移不到高度的 0.4 倍（近乎垂直下落）");
  }
  // 战车炮平射：落角很浅（< 5°），不是高抛。
  for (const m of SHELL_IMPACT_MUNITIONS.filter((spec) => spec.delivery === "direct")) {
    const tank = SHELL_IMPACT_TANKS[m.tankId];
    assert.ok(tank, `${m.id} 的战车 ${m.tankId} 有发射阵地`);
    const horizontal = Math.hypot(tank.x - SHELL_IMPACT_TARGETS[0].x, tank.z - SHELL_IMPACT_TARGETS[0].z);
    assert.ok(horizontal > 100 && horizontal < 200, `阵地离落点约 150 m（${horizontal.toFixed(0)} m）`);
    assert.ok(ArrivalAngleDeg(horizontal, 1.6, m.flightS) < 5);
  }
}, "弹道几何：落角 = 名义值（高抛 / 野炮 / 航弹 / 平射）");

Check(() => {
  const plan = ImpactTrenchPlan();
  assert.deepEqual(plan.segments.map((s) => s.id), ["FireLine", "CommTrench", "RearTrench", "ListeningSap"]);
  assert.equal(SHELL_IMPACT_TRENCH_SEGMENTS.length, 4);
  // 三个 junction：交通壕接射击壕、交通壕接后方横沟（三岔口）、短支沟接射击壕。
  const keys = plan.junctions.map((j) => j.members.map((m) => m.id).sort().join("+")).sort();
  assert.deepEqual(keys, ["CommTrench+FireLine", "CommTrench+RearTrench", "FireLine+ListeningSap"]);
  // 射击壕锯齿形：横贯 ≥ 90 m，折角 ≥ 3 个（拐角的护墙段）。
  const fire = plan.segments.find((s) => s.id === "FireLine");
  const xs = fire.control.map((p) => p.x);
  assert.ok(Math.max(...xs) - Math.min(...xs) >= 90, "射击壕横贯 ≥ 90 m");
  assert.ok(fire.corners.length >= 4, `射击壕折角 ${fire.corners.length} 个`);
  // 地形与计划是同一份：沟底 ≈ −2 m，沟外弃土垄 > 0.5 m。
  for (const [id, expectDeep] of [["TrenchStraight", true], ["TrenchCorner", true], ["CommTrench", true], ["Junction", true]]) {
    const t = SHELL_IMPACT_TARGETS.find((target) => target.id === id);
    assert.ok(Rel(t.x, t.z) < -1.5 === expectDeep, `${id} 在沟里（相对自然地面 ${Rel(t.x, t.z).toFixed(2)} m）`);
  }
  const berm = SHELL_IMPACT_TARGETS.find((t) => t.id === "BermCrest");
  assert.ok(Rel(berm.x, berm.z) > 0.5, `沟沿弃土垄顶高 ${Rel(berm.x, berm.z).toFixed(2)} m`);
  for (const id of ["OpenFront20", "OpenRear8", "BunkerSide"]) {
    const t = SHELL_IMPACT_TARGETS.find((target) => target.id === id);
    assert.ok(Math.abs(Rel(t.x, t.z)) < 0.2, `${id} 在平地上`);
    assert.ok(!plan.Corridor(t.x, t.z)?.inCut, `${id} 不在任何沟的开挖范围里`);
  }
  // 沟前开阔地 20 m：离最近一段射击壕边约 20 m；沟后空地 8 m。
  const Near = (t) => { let best = Infinity; for (const s of fire.stations) best = Math.min(best, Math.hypot(s.x - t.x, s.z - t.z)); return best; };
  assert.ok(Near(SHELL_IMPACT_TARGETS.find((t) => t.id === "OpenFront20")) > 14, "沟前开阔地离射击壕 ≥ 14 m");
}, "壕沟网络：4 段 / 3 个 junction（含三岔口）/ 锯齿形射击壕 / 沟底 −2 m / 弃土垄");

Check(() => {
  const plan = ImpactTrenchPlan();
  const clear = (x, z, label, margin = 0.3) => {
    const c = plan.Corridor(x, z);
    // 沟沿弃土垄（halfTop … halfTop + bermWidth）上也不摆：件脚踩在斜坡上会半悬空。
    assert.ok(!c || !(c.inCut || c.d < c.halfTop + (margin < 0 ? 0 : c.bermWidth) + margin), `${label} 压在壕沟或弃土垄上（${JSON.stringify(c && { d: +c.d.toFixed(2), halfTop: +c.halfTop.toFixed(2), bermW: +c.bermWidth.toFixed(2) })}）`);
  };
  for (const p of SHELL_IMPACT_PROPS) {
    const radius = p.asset === "battlefieldPillbox" ? 4.1 : 0.5;
    // 机枪位的沙袋故意摆在沟沿（弃土垄）上：只要求不在开挖范围里。
    const margin = /^battlefieldSandbag/.test(p.asset) ? -1 : 0.3;
    for (const [dx, dz] of [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]]) clear(p.x + dx, p.z + dz, `${p.asset}@${p.x - O.x},${p.z - O.z}`, margin);
  }
  for (const d of SHELL_IMPACT_DRUMS) clear(d.x, d.z, d.id);
  for (const t of SHELL_IMPACT_TREES) clear(t.x, t.z, t.id, 2);
  clear(SHELL_IMPACT_MG.x, SHELL_IMPACT_MG.z, "MG", -1.5);     // 机枪位在沟沿（弃土垄上），不在沟里
  const mg = plan.Corridor(SHELL_IMPACT_MG.x, SHELL_IMPACT_MG.z);
  assert.ok(mg && !mg.inCut && mg.d < mg.halfTop + 4, "机枪架在射击壕沟沿上");
  const w = SHELL_IMPACT_WORLD, inside = (p) => p.x > w.minX + 3 && p.x < w.maxX - 3 && p.z > w.minZ + 3 && p.z < w.maxZ - 3;
  for (const p of [...SHELL_IMPACT_PROPS, ...SHELL_IMPACT_DRUMS, ...SHELL_IMPACT_TREES, SHELL_IMPACT_MG, ...Object.values(SHELL_IMPACT_TANKS)]) assert.ok(inside(p), "布景在场地内");
  assert.equal(SHELL_IMPACT_PROPS.filter((p) => p.asset === "battlefieldPillbox").length, 2, "两座碉堡");
  assert.ok(SHELL_IMPACT_DRUMS.length >= 10 && SHELL_IMPACT_TREES.length >= 5);
  const assets = new Set(SHELL_IMPACT_PROPS.map((p) => p.asset));
  for (const need of ["battlefieldPillbox", "battlefieldCompartmentCrate", "battlefieldShellStack", "battlefieldSupplyBox"]) assert.ok(assets.has(need), `布景含 ${need}`);
  assert.ok([...assets].some((a) => /^battlefieldSandbag0[1-3]$/.test(a)), "沙袋走标准沙袋资产");
}, "布景净空：不压壕沟、都在场地内、机枪在沟沿");

Check(() => {
  const layout = BuildShellImpactLayout();
  assert.equal(layout.id, SHELL_IMPACT_RANGE_ID);
  assert.equal(layout.terrain, "P012Heightfield");
  assert.equal(layout.terrainSpec, SHELL_IMPACT_TERRAIN);
  assert.equal(layout.ground.terrainLayers, "MissionPlain", "地面是第一关那套分层土壤 PBR，不是白盒灰");
  assert.equal(layout.fortifications, false); assert.equal(layout.materialLooks, false);
  assert.equal(layout.bounds.minX, SHELL_IMPACT_WORLD.minX);
  assert.equal(layout.ground.w, SHELL_IMPACT_WORLD.maxX - SHELL_IMPACT_WORLD.minX);
  assert.ok(typeof layout.SampleGroundSurface === "function");
  const color = [0, 0, 0], weights = [0, 0, 0, 1];
  layout.SampleGroundSurface(O.x + 80, O.z + 60, color, weights);
  assert.ok(color.every(Number.isFinite) && weights.every(Number.isFinite), "地表图层权重可取");
  layout.SampleGroundSurface(O.x - 17, O.z - 19, color, weights);
  assert.ok(weights[1] > 0.5, `沟底翻土层权重 ${weights[1].toFixed(2)}`);
}, "布局：分层土壤图层 / 无第一关工事 / 地表权重可取");

Check(() => {
  // 第一关不受影响：MISSION_TERRAIN 没有 naturalHeight 钩子，默认 spec 的采样与显式传 MISSION_TERRAIN 逐位相同。
  assert.equal(MISSION_TERRAIN.naturalHeight, undefined);
  for (const [x, z] of [[0, -125], [10, -150], [30, -120], [-40, 8], [50, 90], [70, 120]]) {
    assert.equal(SampleMissionTerrain(x, z), SampleMissionTerrain(x, z, MISSION_TERRAIN));
  }
  // 我们自己的 spec：平地 ±0.2 m 内起伏，没有第一关的东 / 西 / 北土坎。
  for (let z = -140; z <= 140; z += 20) for (const x of [-140, 140]) assert.ok(Math.abs(SampleImpactNaturalHeight(O.x + x, O.z + z)) < 0.25);
}, "第一关地形不变（naturalHeight 钩子默认不生效）/ 自己的自然地面是平地");

Check(() => {
  assert.equal(SHELL_IMPACT_TARGETS.length, 8);
  assert.deepEqual(SHELL_IMPACT_TARGETS.map((t) => t.id),
    ["TrenchStraight", "TrenchCorner", "CommTrench", "Junction", "BermCrest", "OpenFront20", "OpenRear8", "BunkerSide"]);
  const w = SHELL_IMPACT_WORLD;
  for (const t of SHELL_IMPACT_TARGETS) {
    assert.ok(t.x > w.minX && t.x < w.maxX && t.z > w.minZ && t.z < w.maxZ);
    assert.ok(TEXT[`shellImpact.target.${t.id}`], `${t.id} 在文本表里有名字`);
  }
  // 碉堡旁：落点离某座碉堡 ≤ 10 m。
  const bunker = SHELL_IMPACT_TARGETS.find((t) => t.id === "BunkerSide");
  const near = SHELL_IMPACT_PROPS.filter((p) => p.asset === "battlefieldPillbox").map((p) => Math.hypot(p.x - bunker.x, p.z - bunker.z));
  assert.ok(Math.min(...near) < 10, `碉堡旁 ${Math.min(...near).toFixed(1)} m`);
  assert.ok(SHELL_IMPACT_BARRAGE.count >= 3 && SHELL_IMPACT_BARRAGE.count <= 5, "齐射 3–5 发");
  assert.deepEqual([...SHELL_IMPACT_TIME_SCALES], [0.1, 0.25, 0.5, 1]);
  assert.deepEqual(SHELL_IMPACT_CAMERAS.map((c) => c.id), ["reference", "trenchLow", "overhead"]);
  const ref = SHELL_IMPACT_CAMERAS[0];
  assert.ok(ref.from.h >= 8 && ref.from.h <= 12, "参考机位抬高约 8–12 m");
  const dist = Math.hypot(ref.at.x - ref.from.x, ref.at.z - ref.from.z);
  assert.ok(dist >= 40 && dist <= 80, `参考机位隔沟看 ${dist.toFixed(0)} m`);
  for (const c of SHELL_IMPACT_CAMERAS) assert.ok(TEXT[`shellImpact.camera.${c.id}`], `${c.id} 机位名在文本表里`);
}, "落点 / 机位 / 齐射 / 倍速档位");

Check(() => {
  for (const key of Object.keys(TEXT)) assert.ok(key.startsWith("shellImpact."));
  assert.equal(GATED_MODULES.length, 3);
  for (const file of GATED_MODULES) {
    const source = fs.readFileSync(path.join(here, file), "utf8");
    assert.ok(!/[一-鿿]/.test(source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")), `${file} 里没有玩家可见的中文字面量（契约 10）`);
  }
}, "文本表：前缀 / 闸门模块零中文字面量");

console.log(`ShellImpactRangeTest: ${checks} groups passed`);
