// ===========================================================================
// Script_RailBridgeTest.mjs —— 北沙河铁路桥模型 + 18 毁桥时间线的门禁（纯 Node，秒级）
//
//   node Taierzhuang1938/Script_RailBridgeTest.mjs
//
// 口径：docs/Data_RailBridge.md。三层：
//   1. 烘焙产物：GLB 节点 / 动画 / 材质与 Data_RailBridge.json 件表对得上，地形快照没过期，
//      起爆器摆在爆破手撤出的终点前面，残骸都落在地上（不悬空、不钻地）；
//   2. 运行时：真 GLTFLoader 解析真 GLB，RailBridgeSet 用替身宿主真跑一遍起爆 ——
//      两个半孔真的动了（2026-09-28 踩过两次「只有一块碎件在动 / 动作被 three 暂停后钉死」）、
//      时间线每一条都触发、残骸合批、回跳还原、读档直接是残骸、夜里收烟；
//   3. 特效预算：高画质一次起爆往烟池里生的片数留在池子一半以内。
// ===========================================================================
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { registerHooks } from "node:module";

const here = new URL("./", import.meta.url);
const vendor = new URL("./vendor/three/", import.meta.url);
const hooks = registerHooks({
  resolve(id, context, next) {
    if (id === "three") return { url: new URL("build/three.module.js", vendor).href, shortCircuit: true };
    return next(id, context);
  },
  load(url, context, next) {
    if (url.startsWith(vendor.href) && url.endsWith(".js"))
      return { format: "module", source: fs.readFileSync(new URL(url), "utf8"), shortCircuit: true };
    return next(url, context);
  },
});
const THREE = await import("three");
const { GLTFLoader } = await import("./vendor/three/examples/jsm/loaders/GLTFLoader.js");
const { RailBridgeSet } = await import("./Script_RailBridgeSet.mjs");
const { RAIL_BRIDGE_MODEL: M, RAIL_BRIDGE_BLAST: FX } = await import("./Data_RailBridgeDemolition.mjs");
const { MISSION_LAYOUT, MISSION_PLACEMENT: P } = await import("./Data_FirstLevelMissionLayout.mjs");
const { MISSION_RAIL_BRIDGE: B, MISSION_STAGE_ANCHORS: A } = await import("./Data_FirstLevelMissionTopology.mjs");
const { END_TUNING: E } = await import("./Data_Tuning_FirstLevelEnd.mjs");
const { MISSION_TUNING: R } = await import("./Data_Tuning_FirstLevel.mjs");
const { SampleMissionTerrain } = await import("./Data_FirstLevelMissionTerrain.mjs");
hooks.deregister();

let checks = 0;
const Check = (ok, label, detail = "") => { checks += 1; assert.ok(ok, `${label}${detail ? `: ${detail}` : ""}`); };
const File = (url) => new URL(url.replace(/\?.*$/, ""), here);

// ---------------------------------------------------------------------------
// 1. 烘焙产物
// ---------------------------------------------------------------------------
const glbBytes = fs.readFileSync(File(M.url));
const data = JSON.parse(fs.readFileSync(File(M.dataUrl), "utf8"));
const jsonLength = glbBytes.readUInt32LE(12);
const gltfJson = JSON.parse(glbBytes.subarray(20, 20 + jsonLength).toString("utf8"));
const pieces = new Map(data.pieces.map((piece) => [piece.name, piece]));
Check(glbBytes.readUInt32LE(0) === 0x46546c67, "Model_RailBridge.glb 是 GLB");
// 三孔：中孔与北孔共用一份网格（同一个 glTF mesh 两个节点），所以 32.8 k 三角的整座桥只有 1.4 MB。
Check(glbBytes.length < 1.8e6, "GLB 在 1.8 MB 以内（线上是后台懒载；三孔）", `${glbBytes.length} B`);
Check(data.triangles < 45000 && data.triangles === data.pieces.reduce((sum, piece) => sum + piece.triangles, 0),
  "件表三角数自洽且在四万五以内（三孔）", String(data.triangles));
const nodeNames = gltfJson.nodes.map((node) => node.name).sort();
Check(JSON.stringify(nodeNames) === JSON.stringify([...pieces.keys()].sort()), "GLB 节点与件表逐一对应");
const nodeMesh = (name) => gltfJson.nodes.find((node) => node.name === name).mesh;
Check(nodeMesh("SpanMid") !== undefined && nodeMesh("SpanMid") === nodeMesh("SpanNorth"), "中孔与北孔共用同一份网格（体积不翻倍）");
const animated = new Map();
for (const animation of gltfJson.animations || []) for (const channel of animation.channels) {
  const name = gltfJson.nodes[channel.target.node].name, input = gltfJson.accessors[animation.samplers[channel.sampler].input];
  if (!animated.has(name)) animated.set(name, new Set());
  animated.get(name).add(channel.target.path);
  Check(Math.abs(input.max[0] - data.duration) < 1e-3 && input.count === data.frames, `${name} 的动画铺满 ${data.duration} s`);
}
for (const piece of data.pieces) {
  const moving = piece.kind === "span" || piece.kind === "debris";
  const paths = animated.get(piece.name);
  // 北半孔绕固定铰转，导出器把恒定的位移轨省掉了：动的件至少要有转动轨，碎件两条都要有。
  const ok = !moving ? !paths : piece.kind === "span" ? paths?.has("rotation") : paths?.has("translation") && paths?.has("rotation");
  Check(ok, `${piece.name}（${piece.kind}）${moving ? "有" : "没有"}坍塌动画`);
}
const materialNames = new Set(gltfJson.materials.map((material) => material.name));
for (const name of materialNames) Check(name.startsWith("RailBridge") && M.materials[name.slice(10)], `材质 ${name} 在映射表里`);
const recipeText = fs.readFileSync(new URL("./Script_TexBake.mjs", here), "utf8");
const recipes = new Set([...recipeText.slice(recipeText.indexOf("export const RECIPES")).matchAll(/^ {2}([A-Z][A-Za-z0-9]+):/gm)].map((m) => m[1]));
for (const [key, spec] of Object.entries(M.materials)) Check(recipes.has(spec.recipe), `${key} 用的配方 ${spec.recipe} 存在`);
Check(recipes.has(M.fallbackRecipe), "兜底配方存在");
Check(!Object.values(M.materials).some((spec) => spec.recipe === "Steel"),
  "桥上不用枪械发蓝钢 Steel（底图均值 45/255、满金属度，这条管线里一片黑）");

// 地形快照：Blender 读的那一份必须就是现在的游戏地形。
const terrainText = fs.readFileSync(new URL("./_blender/Data_RailBridgeTerrain.json", here), "utf8");
const terrain = JSON.parse(terrainText);
// 按 LF 算：仓库开着 autocrlf，另一份检出里这个文件可能是 CRLF（Blender 那边同样先归一再算）。
Check(data.terrainSha256 === crypto.createHash("sha256").update(terrainText.replace(/\r\n/g, "\n")).digest("hex"),
  "模型烘自当前这份地形快照（改了快照要重烘）");
let worst = 0;
for (let iz = 0; iz < terrain.heights.length; iz += 3) for (let ix = 0; ix < terrain.heights[0].length; ix += 3) {
  const x = B.x + terrain.grid.x0 + ix * terrain.grid.step, z = B.z + terrain.grid.z0 + iz * terrain.grid.step;
  worst = Math.max(worst, Math.abs(SampleMissionTerrain(x, z) - terrain.heights[iz][ix]));
}
Check(worst < 0.01, "地形快照与游戏地形一致（地形改了先重跑 Script_ExportRailBridgeTerrain）", `最大差 ${worst.toFixed(3)} m`);
Check(data.origin.x === B.x && data.origin.z === B.z && M.origin.x === B.x && M.origin.z === B.z, "桥原点就是 MISSION_RAIL_BRIDGE");
Check(Math.abs(data.deckTopY - B.deckTopY) < 1e-6 && Math.abs(data.trussX - B.trussOffsetX) < 1e-6,
  "桥面板顶与桁架中面对齐白盒碰撞（可走面 / 桁架挡板不动）");
Check(Math.abs(terrain.exploder.x + B.x - E.exploderAt.x) < 1e-3 && Math.abs(terrain.exploder.z + B.z - E.exploderAt.z) < 1e-3
  && Math.abs(data.exploder.x + B.x - E.exploderAt.x) < 1e-3 && Math.abs(data.exploder.z + B.z - E.exploderAt.z) < 1e-3,
  "模型里的起爆器就摆在 E.exploderAt");
// 1 号墩脚下：爆破手蹲在墩东头干沙地上，木药箱堆在他们与墩之间，导线从墩顶翻下墩身、沿沙地拉向起爆器。
{
  const posts = P.bridge.demolition, pier1 = B.piers[0];
  const dry = (x, z) => SampleMissionTerrain(x, z) > data.water.top + 0.1;
  const rectGap = (b, x, z) => Math.hypot(Math.max(Math.abs(x - b.x) - b.w / 2, 0), Math.max(Math.abs(z - b.z) - b.d / 2, 0));
  const solids = MISSION_LAYOUT.blocks.filter((b) => b.solid !== false && /^RailBridge/.test(b.id));
  for (const [index, post] of posts.entries()) {
    const d = Math.hypot(post.x - B.x, post.z - pier1.z);
    Check(d > 3.5 && d < 8 && dry(post.x, post.z), `爆破手 ${index} 蹲在 1 号墩东头的干沙地上（离墩心 ${d.toFixed(1)} m）`);
    Check(solids.every((b) => rectGap(b, post.x, post.z) >= 0.5), `爆破手 ${index} 离白盒桥体碰撞 ≥ 0.5 m`);
    const start = E.demolitionPullback[index][0];
    Check(Math.hypot(start.x - post.x, start.z - post.z) < 9, `爆破手 ${index} 的撤出折线从他脚下出发`);
  }
  const crates = pieces.get("Crates");
  Check(crates?.kind === "charges", "木药箱在药包那一组（只在 18 前三步露面）");
  const cc = [0, 2].map((i) => (crates.bounds.min[i] + crates.bounds.max[i]) / 2);
  const nearest = Math.min(...posts.map((post) => Math.hypot(post.x - B.x - cc[0], post.z - B.z - cc[1])));
  Check(nearest > 0.8 && nearest < 4, "药箱堆就在爆破手身边", `${nearest.toFixed(1)} m`);
  const cable = pieces.get("CableGround").bounds;
  Check(cable.min[2] < data.layout.piers.Pier1 + 1.5 && cable.max[2] > data.exploder.z - 0.7, "地面导线从墩脚一路拉到起爆器");
  const pierCharges = data.charges.filter((c) => c.z > 10);
  Check(pierCharges.length === 2 && pierCharges.every((c) => Math.abs(c.x) === B.trussOffsetX && c.groundY < data.water.top + 0.5 && c.groundY > data.water.top),
    "1 号墩顶两个药包落在沙滩上（groundY 在水面之上）");
  Check(data.charges.filter((c) => c.z < 1).every((c) => c.groundY === data.water.top), "跨中药包的地面是河面");
  Check(pieces.get("SouthSpan").final.position[2] < data.layout.piers.Pier1 - 2, "南半孔滑出了 1 号墩顶");
  const caps = data.pieces.filter((p) => /^Pier1Cap/.test(p.name));
  Check(caps.length >= 8 && caps.every((p) => p.kind === "debris"), "1 号墩的帽石层逐块成件、起爆时被掀飞");
  Check(data.pieces.filter((p) => /^Pier1Shoe/.test(p.name)).length === 2, "1 号墩的两副支座是碎件");
}
const kneel = E.demolitionPullback[1].at(-1);
Check(Math.hypot(kneel.x - E.exploderAt.x, kneel.z - E.exploderAt.z) < 1.2 && kneel.z > E.exploderAt.z,
  "东边爆破手撤到起爆器后面（面朝北、朝桥）");

// 白盒：模型接管外观的闸门件都在；桥台碰撞盒埋在料石桥座下面。
const gates = new Map(MISSION_LAYOUT.gates.map((gate) => [gate.id, gate]));
for (const id of M.replacesGates) Check(gates.has(id), `模型接管的闸门件 ${id} 存在`);
for (const block of MISSION_LAYOUT.blocks.filter((b) => /^RailBridgeAbutment/.test(b.id)))
  Check(block.y + block.h / 2 <= B.abutmentTopY + 1e-6 && B.abutmentTopY < -0.47, `${block.id} 顶在桥座面以下`);
// 三孔：三个白盒桥墩（碰撞）、模型里三个长圆料石墩的墩心对齐；碰撞盒 3.4 × 3.6 整个埋在长圆墩（半径 1.8、直边半长 1.9）里。
const pierBlocks = MISSION_LAYOUT.blocks.filter((b) => /^RailBridgePier/.test(b.id));
Check(pierBlocks.length === 3 && B.piers.every((p, i) => Math.abs(pierBlocks.find((b) => b.id === `RailBridge${p.id}`).z - p.z) < 1e-6
  && Math.abs(data.layout.piers[p.id] - (p.z - B.z)) < 1e-6), "三个白盒桥墩与模型的墩心对齐");
Check(B.pierW / 2 < data.layout.pierHalfLength + data.layout.pierRadius && B.pierD / 2 <= data.layout.pierRadius * 2 / 2 + 0.01,
  "白盒桥墩碰撞盒整个埋在长圆料石墩里");
Check(Math.abs(data.layout.spanCentres.SpanSouth - 0) < 1e-6 && Math.abs(data.layout.spanCentres.SpanMid + 24) < 1e-6
  && Math.abs(data.layout.spanCentres.SpanNorth + 48) < 1e-6, "三孔中心对上 MISSION_RAIL_BRIDGE 的 spans（被炸孔在原点）");

// 残骸：都落在地上 / 河底，不悬空、不钻地。
for (const piece of data.pieces.filter((p) => p.kind === "debris")) {
  const gap = piece.final.lowest[1] - piece.final.groundBelowLowest;
  Check(gap > -0.1 && gap < 1.6, `${piece.name} 落稳了`, `离地 ${gap.toFixed(2)} m`);
}
const south = pieces.get("SouthSpan").final, north = pieces.get("NorthSpan").final;
Check(south.position[1] < -3 && south.lowest[1] < data.water.top, "南半孔整孔落进河槽（从南岸看得出来：门架沉下去了）");
Check(data.solved.northFinal > 0.25 && data.solved.northFinal < 0.6 && north.lowest[1] < data.water.top,
  "北半孔绕北桥台折进河里（V 的一条臂）", String(data.solved.northFinal));
const events = data.events;
Check(events.every((e, i) => i === 0 || events[i - 1].t <= e.t), "事件按时间排好");
Check(events.filter((e) => e.type === "slam").length >= 3, "两个半孔都有砸底 / 砸滩");
Check(events.filter((e) => e.type === "water").every((e) => Math.abs(e.z - data.water.riverZ) < data.water.halfW + 0.01),
  "入水事件都在水面范围里");
Check(data.charges.filter((c) => c.main && c.t === 0).length === 2 && data.charges.every((c) => c.t <= 0.2),
  "跨中两团主药包同时起爆，其余 0.2 s 内跟上");

// 编排节奏：军官那句在桥身砸进河之后；压杆动画在起爆前走完。
Check(E.marchOrderDelayS > Math.max(data.solved.northHit, data.solved.southHit) + 1 && E.marchOrderDelayS < data.duration + 3,
  "「往滕县！」在两个半孔都砸进河之后才喊");
Check(E.exploderPressLeadS >= 0.18 && E.blastGazeWaitS <= 5 && E.blastGazeHalfAngleDeg <= 45,
  "压杆先于起爆、等玩家看桥最多几秒");
Check(R.bridgeBlastRadiusM * 1.9 * 3.2 > Math.hypot(A.blastSafe.x - A.railBridge.x, A.blastSafe.z - A.railBridge.z),
  "安全区也感觉得到爆破的震动（共用感知入口的震感外沿够得到 blastSafe）");

// ---------------------------------------------------------------------------
// 3. 特效预算（高画质 spawnScale 1，烟池 = 4000 × 0.22 = 880 片）
// ---------------------------------------------------------------------------
let smoke = 2 * FX.waterColumn.count;
for (const e of events) {
  if (e.type === "water") smoke += Math.min(FX.splash.max, Math.max(FX.splash.min, e.size * FX.splash.perSize));
  if (e.type === "land") smoke += FX.landPuff.count * Math.min(1.6, 0.6 + e.size / 3);
  if (e.type === "slam") smoke += 2 * Math.max(FX.splash.max, FX.landPuff.count * 1.6);
}
Check(smoke < 0.6 * 880, "一次起爆往烟池里生的片数留在高画质烟池六成以内", `${Math.round(smoke)} 片`);

// ---------------------------------------------------------------------------
// 2. 运行时：真 GLB、真时间线
// ---------------------------------------------------------------------------
const gltf = await new Promise((resolve, reject) =>
  new GLTFLoader().parse(glbBytes.buffer.slice(glbBytes.byteOffset, glbBytes.byteOffset + glbBytes.byteLength), "", resolve, reject));
const scene = new THREE.Scene();
const gateMeshes = new Map(M.replacesGates.map((id) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  scene.add(mesh);
  return [id, { mesh }];
}));
const recipesAsked = [];
const library = { Get: (recipe, options) => { recipesAsked.push([recipe, options]); return new THREE.MeshStandardMaterial(); } };
const log = { explosions: [], sources: new Map(), removed: 0, audio: [], spawns: 0, rings: 0, streaks: 0 };
let serial = 0;
const Pool = (key) => ({ Spawn: () => { log[key] += 1; } });
const vfx = {
  spawnScale: 1, time: 0, random: Math.random, wind: new THREE.Vector3(0.35, 0, -0.15),
  pools: { smoke: Pool("spawns"), ring: Pool("rings"), streak: Pool("streaks") },
  Explosion: (at, options) => log.explosions.push({ at: at.clone(), ...options }),
  SmokeSource: (at, options) => { serial += 1; log.sources.set(serial, { at: at.clone(), options }); return serial; },
  RemoveSmokeSource: (id) => { if (log.sources.delete(id)) log.removed += 1; },
};
const player = { position: new THREE.Vector3(A.blastSafe.x, 0.6, A.blastSafe.z), yaw: 0, Alive: true,
  get EyePosition() { return this.position.clone().setY(2.2); }, shake: { hits: 0, Explosion() { this.hits += 1; return 0.1; } } };
player.yaw = Math.atan2(-(A.railBridge.x - A.blastSafe.x), -(A.railBridge.z - A.blastSafe.z));
const audio = { Play: (cue, options) => { log.audio.push({ cue, ...options }); return {}; } };
const set = new RailBridgeSet({ scene, library, battlefield: { gates: gateMeshes }, vfx, audio, player });
set.Build(gltf, data);
Check(set.state === "intact" && set.root.parent === scene, "装好就是完好态、挂进场景");
Check([...gateMeshes.values()].every(({ mesh }) => !mesh.parent) && set.detached.length === M.replacesGates.length,
  "白盒桥的外观件全部摘掉（碰撞不归它管）");
Check(recipesAsked.every(([recipe, options]) => options.tag?.startsWith("RailBridge") && recipe !== "Steel"),
  "每种桥材各要一份自己的库材质实例");
Check(set.actions.length === gltfJson.animations.length && set.animatedNodes.size === animated.size,
  "每一段导出的动画都挂上了（导出器按物体各出一段）");
const Draws = (group) => { let n = 0; group.traverse((o) => { if (o.isMesh) n += 1; }); return n; };
Check(Draws(set.groups.intact) <= 5 && Draws(set.groups.static) <= 5 && Draws(set.groups.wreck) <= 5,
  "完好桥身 / 桥台 / 残骸各合成按材质的几份（平时不按件出 draw call）");
const Snapshot = (name) => { const node = set.nodes.get(name); return { p: node.position.clone(), q: node.quaternion.clone() }; };
const northRest = Snapshot("NorthSpan"), southRest = Snapshot("SouthSpan"), braceRest = Snapshot("CentreBracing");

// 18 前三步：药包与导线在；起爆器从接令起一直在。
set.Update(1 / 60, "BridgeCover", { destroyed: false });
Check(set.groups.charges.visible && set.groups.exploder.visible, "18 桥上看得见药包与导线、安全区有起爆器");
set.Update(1 / 60, "Death", { destroyed: false });
Check(!set.groups.charges.visible && !set.groups.exploder.visible, "18 之前没有药包、没有起爆器");

// 压杆 → 起爆 → 坍塌。
set.Update(1 / 60, "BridgeWithdraw", { destroyed: false });
Check(set.Press(), "爆破手按下起爆器");
for (let i = 0; i < 12; i += 1) set.Update(1 / 60, "BridgeWithdraw", { destroyed: false });
Check(set.State().handleDown > 0.19, "起爆器压杆真的压下去了");
Check(set.Detonate() && set.state === "collapsing" && !set.groups.intact.visible && set.pieces.visible, "起爆：完好合批藏起、逐件登场");
Check(!set.Detonate(), "同一座桥只炸一次");
let fovMin = 1;
const Run = (seconds, flags = { destroyed: true }) => {
  for (let t = 0; t < seconds; t += 1 / 60) { set.Update(1 / 60, "BridgeWithdraw", flags); fovMin = Math.min(fovMin, set.FovScale(1 / 60)); }
};
Run(1.0);
const north1 = Snapshot("NorthSpan"), south1 = Snapshot("SouthSpan"), brace1 = Snapshot("CentreBracing");
Check(brace1.p.distanceTo(braceRest.p) > 3, "跨中碎件飞出去了");
Check(north1.q.angleTo(northRest.q) > 0.02, "北半孔在 1 s 时已经在往下折（动作没被 three 暂停）");
Check(south1.p.distanceTo(southRest.p) > 0.5, "南半孔在 1 s 时已经滑出桥座");
Run(data.duration - 0.9);
Check(set.state === "wreck" && set.groups.wreck.visible && !set.pieces.visible, "演完换成残骸合批");
Check(set.nodes.get("NorthSpan").quaternion.angleTo(northRest.q) === 0 || !set.pieces.visible, "逐件节点收起");
Check(set.cueIndex === set.cues.length, "时间线每一条都触发了", `${set.cueIndex}/${set.cues.length}`);
Check(log.explosions.length === data.charges.length + 1, "每个药包一团火、外加半空那一团最大的", String(log.explosions.length));
Check(set.stats.splashes >= 15 && set.stats.slams >= 3 && set.stats.lands >= 5, "入水、砸底、落地都演了", JSON.stringify(set.stats));
Check(player.shake.hits >= 3, "半孔砸底时安全区也有一记闷震");
Check(log.audio.some((a) => a.cue === "impactMetal") && !log.audio.some((a) => /^explosion/.test(a.cue)),
  "钢件轰响有，另外的爆炸声没有（爆炸声只走 Combat.BlastFeedback 一次）");
Check(fovMin < 0.8 && fovMin >= FX.focus.scale - 1e-3, "看着桥的那几秒视野收窄", fovMin.toFixed(3));
Check(log.spawns > 200 && log.spawns < 0.6 * 880 + 200, "烟池生成量合理", String(log.spawns));
Run(6);
Check(Math.abs(set.FovScale(1 / 60) - 1) < 0.02, "演完视野放回去");
const burning = [...log.sources.values()].filter((s) => s.options.fire > 0).length;
Check(log.sources.size >= 2 && burning >= 1, "断口一直在冒烟烧着", String(log.sources.size));
Check([...log.sources.values()].every((s) => s.options.kind !== "dust" || !s.options.untilS), "临时扬尘到点自己收");
set.Update(1 / 60, "NightMarch", { destroyed: true, night: true });
Check(log.sources.size === 0 && set.sources.length === 0, "夜景落位之后这边的烟火全部收掉");

// 回跳：清掉 bridgeDestroyed → 桥自己回来；读档到炸后 → 直接是残骸，不重演。
set.Update(1 / 60, "BridgeCover", { destroyed: false });
Check(set.state === "intact" && set.groups.intact.visible && !set.groups.wreck.visible && set.stats.resets === 1, "回跳到炸前：桥完好如初");
const cuesBefore = set.stats.cues;
set.Update(1 / 60, "NightMarch", { destroyed: true });
Check(set.state === "wreck" && set.stats.restoredWreck === 1 && set.stats.cues === cuesBefore, "读档到炸后：直接是残骸，一条特效都不重放");
set.Dispose();
Check(!set.root && [...gateMeshes.values()].every(({ mesh }) => mesh.parent === scene), "拆除时把白盒外观还回去");

console.log(`ok  北沙河铁路桥模型与毁桥时间线：${checks} 项`);
