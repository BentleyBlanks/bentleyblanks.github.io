// ===========================================================================
// Script_PontoonBridgeTest.mjs —— 北沙河浮桥模型 + 18 毁桥时间线的门禁（纯 Node，秒级）
//
//   node Taierzhuang1938/Script_PontoonBridgeTest.mjs
//
// 口径：docs/Data_PontoonBridge.md。三层：
//   1. 烘焙产物：GLB 节点 / 动画 / 材质与 Data_PontoonBridge.json 件表对得上，地形快照没过期，
//      起爆器摆在爆破手撤出的终点前面，药箱在爆破手身边，炸飞的船在被炸段里、沉的邻船真的沉下去、
//      北截只是缓缓摆开，漂在河面的木件都在水面上、落在岸上的都落在地上；
//   2. 运行时：真 GLTFLoader 解析真 GLB，PontoonBridgeSet 用替身宿主真跑一遍起爆 ——
//      炸飞的船体碎块真的飞了、沉的邻船真的动了、北截真的在摆（铁路桥 2026-09-28 踩过两次
//      「只有一块碎件在动 / 动作被 three 暂停后钉死」）、时间线每一条都触发、残骸合批、回跳还原、
//      读档直接是残骸、夜里收烟；
//   3. 特效预算：高画质一次起爆往烟池里生的片数留在池子六成以内。
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
const { PontoonBridgeSet } = await import("./Script_PontoonBridgeSet.mjs");
const { PONTOON_BRIDGE_MODEL: M, PONTOON_BRIDGE_BLAST: FX } = await import("./Data_PontoonBridgeDemolition.mjs");
const { MISSION_LAYOUT, MISSION_PLACEMENT: P } = await import("./Data_FirstLevelMissionLayout.mjs");
const { MISSION_PONTOON_BRIDGE: B, PONTOON_HEADS, MISSION_STAGE_ANCHORS: A, RiverWaterAt, MISSION_NORTH_RIVER } = await import("./Data_FirstLevelMissionTopology.mjs");
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
Check(glbBytes.readUInt32LE(0) === 0x46546c67, "Model_PontoonBridge.glb 是 GLB");
Check(glbBytes.length < 1.6e6, "GLB 在 1.6 MB 以内（线上是后台懒载）", `${glbBytes.length} B`);
Check(data.triangles < 50000 && data.triangles === data.pieces.reduce((sum, piece) => sum + piece.triangles, 0),
  "件表三角数自洽且在五万以内", String(data.triangles));
const nodeNames = gltfJson.nodes.map((node) => node.name).sort();
Check(JSON.stringify(nodeNames) === JSON.stringify([...pieces.keys()].sort()), "GLB 节点与件表逐一对应");
const animated = new Map();
for (const animation of gltfJson.animations || []) for (const channel of animation.channels) {
  const name = gltfJson.nodes[channel.target.node].name, input = gltfJson.accessors[animation.samplers[channel.sampler].input];
  if (!animated.has(name)) animated.set(name, new Set());
  animated.get(name).add(channel.target.path);
  Check(Math.abs(input.max[0] - data.duration) < 1e-3 && input.count === data.frames, `${name} 的动画铺满 ${data.duration} s`);
}
Check(animated.size <= 60 && animated.size >= 30, `动画节点 ${animated.size} 个（≤ 60，够多才读得出「炸散」）`);
for (const piece of data.pieces) {
  const moving = piece.kind === "span" || piece.kind === "debris";
  const paths = animated.get(piece.name);
  // 北截绕固定铰转（导出器可能把恒定的位移轨省掉）：动的件至少要有转动轨，碎件两条都要有。
  const ok = !moving ? !paths : piece.kind === "span" ? paths?.has("rotation") : paths?.has("translation") && paths?.has("rotation");
  Check(ok, `${piece.name}（${piece.kind}）${moving ? "有" : "没有"}坍塌动画`);
}
const materialNames = new Set(gltfJson.materials.map((material) => material.name));
for (const name of materialNames) Check(name.startsWith("PontoonBridge") && M.materials[name.slice(13)], `材质 ${name} 在映射表里`);
const recipeText = fs.readFileSync(new URL("./Script_TexBake.mjs", here), "utf8");
const recipes = new Set([...recipeText.slice(recipeText.indexOf("export const RECIPES")).matchAll(/^ {2}([A-Z][A-Za-z0-9]+):/gm)].map((m) => m[1]));
for (const [key, spec] of Object.entries(M.materials)) Check(recipes.has(spec.recipe), `${key} 用的配方 ${spec.recipe} 存在`);
Check(M.materials[M.fallbackRecipe] && recipes.has(M.materials[M.fallbackRecipe].recipe), "兜底配方存在");
Check(!Object.values(M.materials).some((spec) => spec.recipe === "Steel"),
  "桥上不用枪械发蓝钢 Steel（底图均值 45/255、满金属度，这条管线里一片黑）");

// 地形快照：Blender 读的那一份必须就是现在的游戏地形。
const terrainText = fs.readFileSync(new URL("./_blender/Data_PontoonBridgeTerrain.json", here), "utf8");
const terrain = JSON.parse(terrainText);
// 按 LF 算：仓库开着 autocrlf，另一份检出里这个文件可能是 CRLF（Blender 那边同样先归一再算）。
Check(data.terrainSha256 === crypto.createHash("sha256").update(terrainText.replace(/\r\n/g, "\n")).digest("hex"),
  "模型烘自当前这份地形快照（改了快照要重烘）");
let worst = 0;
for (let iz = 0; iz < terrain.heights.length; iz += 3) for (let ix = 0; ix < terrain.heights[0].length; ix += 3) {
  const x = B.x + terrain.grid.x0 + ix * terrain.grid.step, z = B.z + terrain.grid.z0 + iz * terrain.grid.step;
  worst = Math.max(worst, Math.abs(SampleMissionTerrain(x, z) - terrain.heights[iz][ix]));
}
Check(worst < 0.01, "地形快照与游戏地形一致（地形改了先重跑 Script_ExportPontoonBridgeTerrain）", `最大差 ${worst.toFixed(3)} m`);
Check(data.origin.x === B.x && data.origin.z === B.z && M.origin.x === B.x && M.origin.z === B.z, "桥原点就是 MISSION_PONTOON_BRIDGE 的被炸段中心");
Check(Math.abs(data.deckTopY - B.deckTopY) < 1e-6, "桥面板顶对齐白盒碰撞（可走面不动）");
const water = RiverWaterAt(B.x, MISSION_NORTH_RIVER);
Check(Math.abs(data.water.z0 - (water.z0 - B.z)) < 0.01 && Math.abs(data.water.z1 - (water.z1 - B.z)) < 0.01, "件表的南北水线就是游戏里的水线");
Check(Math.abs(data.layout.heads.south - (PONTOON_HEADS.south - B.z)) < 0.01 && Math.abs(data.layout.heads.north - (PONTOON_HEADS.north - B.z)) < 0.01,
  "两头桥头对上 PONTOON_HEADS（模型的木栈从桥头搭到第一 / 最后一条船）");
Check(data.layout.boats.length === B.boats.count && data.layout.boats.every((boat, i) => Math.abs(boat.z - (B.boats.firstZ - i * B.boats.pitchZ - B.z)) < 0.01),
  "21 条船的位置对上 MISSION_PONTOON_BRIDGE.boats（0 号最南，间距 3 m）");
Check(JSON.stringify(data.layout.blasted) === JSON.stringify(Array.from({ length: B.boats.blasted[1] - B.boats.blasted[0] + 1 }, (_, k) => B.boats.blasted[0] + k)) && JSON.stringify(data.layout.sinking) === JSON.stringify(B.boats.sinking),
  "被炸的 5 条船与倾斜下沉的 4 条船对上");
Check(Math.abs(terrain.exploder.x + B.x - E.exploderAt.x) < 1e-3 && Math.abs(terrain.exploder.z + B.z - E.exploderAt.z) < 1e-3
  && Math.abs(data.exploder.x + B.x - E.exploderAt.x) < 1e-3 && Math.abs(data.exploder.z + B.z - E.exploderAt.z) < 1e-3,
  "模型里的起爆器就摆在 E.exploderAt");
// 南岸浮桥头：爆破手蹲在木栈起点东侧的泥地上，药箱摞在他们身边，导线从药包沿桥面拉到栈头、沿泥地拉向起爆器。
{
  const posts = P.bridge.demolition;
  const dry = (x, z) => SampleMissionTerrain(x, z) > data.water.top + 0.3;
  const rectGap = (b, x, z) => Math.hypot(Math.max(Math.abs(x - b.x) - b.w / 2, 0), Math.max(Math.abs(z - b.z) - b.d / 2, 0));
  const solids = MISSION_LAYOUT.blocks.filter((b) => b.solid !== false && /^Pontoon/.test(b.id));
  for (const [index, post] of posts.entries()) {
    const d = Math.hypot(post.x - B.x, post.z - PONTOON_HEADS.south);
    Check(d > 3 && d < 10.5 && dry(post.x, post.z), `爆破手 ${index} 蹲在南栈头东侧的干泥地上（离栈头 ${d.toFixed(1)} m）`);
    Check(solids.every((b) => rectGap(b, post.x, post.z) >= 0.5), `爆破手 ${index} 离白盒桥体碰撞 ≥ 0.5 m`);
    const start = E.demolitionPullback[index][0];
    Check(Math.hypot(start.x - post.x, start.z - post.z) < 9, `爆破手 ${index} 的撤出折线从他脚下出发`);
  }
  const crates = pieces.get("Crates");
  Check(crates?.kind === "static", "药箱 / 铁丝网卷 / 绳圈一直在（起爆后也在）");
  const cc = [0, 2].map((i) => (crates.bounds.min[i] + crates.bounds.max[i]) / 2);
  const nearest = Math.min(...posts.map((post) => Math.hypot(post.x - B.x - cc[0], post.z - B.z - cc[1])));
  Check(nearest > 0.8 && nearest < 6.5, "药箱堆就在爆破手身边", `${nearest.toFixed(1)} m`);
  const cable = pieces.get("CableGround").bounds;
  Check(cable.max[2] > data.exploder.z - 1.2 && cable.min[2] < PONTOON_HEADS.south - B.z + 1, "地面导线从栈头一路拉到起爆器");
  Check(pieces.get("CableBridge")?.kind === "charges", "桥面导爆索跟药包同一组（只在 18 前三步露面）");
}
const kneel = E.demolitionPullback[1].at(-1);
Check(Math.hypot(kneel.x - E.exploderAt.x, kneel.z - E.exploderAt.z) < 1.2 && kneel.z > E.exploderAt.z,
  "东边爆破手撤到起爆器后面（面朝北、朝桥）");

// 白盒：模型接管外观的闸门件都在。
const gates = new Map(MISSION_LAYOUT.gates.map((gate) => [gate.id, gate]));
for (const id of M.replacesGates) Check(gates.has(id), `模型接管的闸门件 ${id} 存在`);

// 药包：被炸的 5 条船上各一包，中间三包是主药包，0.2 s 内全响。
{
  const boatZ = (i) => B.boats.firstZ - i * B.boats.pitchZ - B.z;
  Check(data.charges.length === 5 && data.charges.filter((c) => c.main).length === 3, "5 个药包、3 个主药包");
  const zs = data.charges.map((c) => c.z).sort((a, b) => a - b);
  const want = Array.from({ length: B.boats.blasted[1] - B.boats.blasted[0] + 1 }, (_, k) => B.boats.blasted[0] + k).map(boatZ).sort((a, b) => a - b);
  Check(zs.every((z, i) => Math.abs(z - want[i]) < 0.6), "药包落在被炸的 5 条船上", JSON.stringify(zs));
  Check(data.charges.every((c) => c.t <= 0.2 && c.groundY === data.water.top && c.y > data.water.top && c.y < B.deckTopY - B.z * 0 + 0.3),
    "药包在水面与桥面之间、0.2 s 内全响、地面取河面");
  Check(data.charges.filter((c) => c.t === 0).every((c) => c.main), "第一响是主药包");
}

// 残骸：漂在河面的木件都在水面上下、落在岸上的落在地上、没有钻地的。
for (const piece of data.pieces.filter((p) => p.kind === "debris")) {
  const gap = piece.final.lowest[1] - piece.final.groundBelowLowest;
  Check(gap > -0.1, `${piece.name} 没钻进地里`, `离地 ${gap.toFixed(2)} m`);
  if (piece.final.wet) Check(piece.final.lowest[1] < data.water.top + 0.3 && piece.final.position[2] > data.water.z0 && piece.final.position[2] < data.water.z1,
    `${piece.name} 落在河里（漂着或沉了）`);
  else Check(gap < 1.6, `${piece.name} 落岸上落稳了`, `离地 ${gap.toFixed(2)} m`);
}
{
  const sunkIdx = [...B.boats.sinking];
  const sunk = sunkIdx.map((i) => pieces.get(`SinkBoat${i}`));
  Check(sunk.every((p) => p?.kind === "debris" && p.final.wet), "四条邻船是逐件节点、末态在水里");
  for (const i of sunkIdx) Check(data.solved.sinkFinal[i].deckMeanY < data.water.top - 0.2, `${i} 号船沉下去了（桥面均值在水面下）`, String(data.solved.sinkFinal[i].deckMeanY));
  const northQ = pieces.get("NorthSection").final.quaternion, swing = 2 * Math.asin(Math.min(1, Math.abs(northQ[1]))) * 180 / Math.PI;
  Check(pieces.get("NorthSection").kind === "span" && swing > 2 && swing < 6, "北截缓缓向下游摆开 2°–6°", swing.toFixed(2));
  Check(pieces.get("SouthSection").kind === "static" && pieces.get("BankSouth").kind === "static" && pieces.get("BankNorth").kind === "static", "南截与两岸的栈永久不动");
  const blasted = data.pieces.filter((p) => new RegExp(`^Boat(${Array.from({ length: B.boats.blasted[1] - B.boats.blasted[0] + 1 }, (_, k) => B.boats.blasted[0] + k).join("|")})(Bow|Stern|Keel)$`).test(p.name));
  Check(blasted.length === 15 && blasted.every((p) => p.kind === "debris"), "被炸的 5 条船各掰成三块", String(blasted.length));
  Check(data.pieces.filter((p) => /^Deck/.test(p.name)).length >= 8, "桥面板成簇飞散");
}
const events = data.events;
Check(events.every((e, i) => i === 0 || events[i - 1].t <= e.t), "事件按时间排好");
Check(events.length >= 15 && events.length <= 40, "事件数在预算里（≤ 40，烟池撑得住）", String(events.length));
Check(events.filter((e) => e.type === "water").every((e) => e.z > data.water.z0 - 0.01 && e.z < data.water.z1 + 0.01), "入水事件都在水面范围里");
Check(events.every((e) => e.t >= 0 && e.t <= data.duration), "事件都在时间线里");

// 编排节奏：军官那句在木件都落水之后；压杆动画在起爆前走完。
const lastEvent = Math.max(...events.map((e) => e.t));
Check(E.marchOrderDelayS > lastEvent + 1 && E.marchOrderDelayS < data.duration + 3, "「往滕县！」在最后一块木头落水之后才喊", String(lastEvent));
Check(E.exploderPressLeadS >= 0.18 && E.blastGazeWaitS <= 5 && E.blastGazeHalfAngleDeg <= 45,
  "压杆先于起爆、等玩家看桥最多几秒");
Check(R.bridgeBlastRadiusM * 1.9 * 3.2 > Math.hypot(A.blastSafe.x - A.railBridge.x, A.blastSafe.z - A.railBridge.z) * 0.9,
  "安全区也感觉得到爆破的余震（共用感知入口的震感外沿够得到 blastSafe 的九成）");

// ---------------------------------------------------------------------------
// 3. 特效预算（高画质 spawnScale 1，烟池 = 4000 × 0.22 = 880 片）
// ---------------------------------------------------------------------------
let smoke = data.charges.length * FX.waterColumn.count;
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
const set = new PontoonBridgeSet({ scene, library, battlefield: { gates: gateMeshes }, vfx, audio, player });
set.Build(gltf, data);
Check(set.state === "intact" && set.root.parent === scene, "装好就是完好态、挂进场景");
Check([...gateMeshes.values()].every(({ mesh }) => !mesh.parent) && set.detached.length === M.replacesGates.length,
  "白盒桥的外观件全部摘掉（碰撞不归它管）");
Check(recipesAsked.every(([recipe, options]) => options.tag?.startsWith("PontoonBridge") && recipe !== "Steel"),
  "每种桥材各要一份自己的库材质实例");
Check(set.actions.length === gltfJson.animations.length && set.animatedNodes.size === animated.size,
  "每一段导出的动画都挂上了（导出器按物体各出一段）");
const Draws = (group) => { let n = 0; group.traverse((o) => { if (o.isMesh) n += 1; }); return n; };
Check(Draws(set.groups.intact) <= 8 && Draws(set.groups.static) <= 8 && Draws(set.groups.wreck) <= 8,
  "完好桥身 / 岸栈与南截 / 残骸各合成按材质的几份（平时不按件出 draw call）");
// 船舱里的水面遮挡片（BuildHullWaterMasks）：只写深度、藏出预通道、三态各挂各的，
// 截面贴着舱内壁 —— 拿 GLB 真船壳在遮挡片高度切一刀，逐站核对「不出内壁、也不留出一条水缝」。
{
  const masks = set.hullMasks, lift = M.hullWaterMask.lift, level = data.water.top + lift;
  const southCount = Math.min(...B.boats.sinking), northFirst = Math.max(...B.boats.sinking) + 1;
  const Boats = (mesh) => mesh.userData.hullWaterMask.boats.join(",");
  const Range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i).join(",");
  Check(masks && Boats(masks.static) === Range(0, southCount) && Boats(masks.intact) === Range(southCount, B.boats.count)
    && Boats(masks.wreck) === Range(northFirst, B.boats.count) && Boats(masks.pieces) === Range(northFirst, B.boats.count),
  "船舱遮挡片：南截一直在、完好桥身管其余各船、北截在残骸与坍塌里各一份（下沉 / 炸飞的船不遮）");
  const all = [masks.static, masks.intact, masks.wreck, masks.pieces];
  Check(all.every((mesh) => mesh.material.colorWrite === false && mesh.material.depthWrite && mesh.material.allowOverride === false
    && mesh.userData.skipNormalDepth === true && mesh.renderOrder >= 900 && !mesh.castShadow),
  "遮挡片只写深度、在不透明物最后画、藏出预通道、不投影");
  Check(masks.static.parent === set.groups.static && masks.intact.parent === set.groups.intact
    && masks.wreck.parent === set.groups.wreck && masks.pieces.parent === set.nodes.get("NorthSection"), "三态各挂各的组");
  masks.wreck.geometry.computeBoundingBox();
  const wreckBox = masks.wreck.geometry.boundingBox;
  Check(Math.abs(wreckBox.min.y - level) < 0.01 && Math.abs(wreckBox.max.y - level) < 0.01,
    "北截残骸那一份按末帧位姿放回到水面上方 lift", `${wreckBox.min.y.toFixed(3)}..${wreckBox.max.y.toFixed(3)} vs ${level.toFixed(3)}`);
  // 船壳在 y = level 处与竖线 x = const 的交点（z 值）
  const Crossings = (mesh, x) => {
    const pos = mesh.geometry.attributes.position, index = mesh.geometry.index;
    const count = index ? index.count : pos.count, out = [];
    const V = (i) => new THREE.Vector3().fromBufferAttribute(pos, index ? index.getX(i) : i);
    for (let t = 0; t < count; t += 3) {
      const tri = [V(t), V(t + 1), V(t + 2)], cut = [];
      for (let e = 0; e < 3; e += 1) {
        const a = tri[e], b = tri[(e + 1) % 3];
        if ((a.y - level) * (b.y - level) > 0 || a.y === b.y) continue;
        const k = (level - a.y) / (b.y - a.y);
        cut.push([a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k]);
      }
      if (cut.length < 2) continue;
      const [[x0, z0], [x1, z1]] = cut;
      if ((x0 - x) * (x1 - x) > 0 || x0 === x1) continue;
      out.push(z0 + ((z1 - z0) * (x - x0)) / (x1 - x0));
    }
    return out;
  };
  // 炸飞的那几条（9…13）中段船壳在桥面底下本来就是参差低舷（Blender 的 hm_keel），不在这里量
  const blastedZ = data.layout.boats.filter((b) => b.i >= B.boats.blasted[0] && b.i <= B.boats.blasted[1]).map((b) => b.z);
  let stations = 0, worstOut = -Infinity, worstGap = -Infinity, worstAt = "";
  for (const [mask, hullName] of [[masks.static, "PontoonBridgeSet_Static_Hull"], [masks.intact, "PontoonBridgeSet_Intact_Hull"]]) {
    const hull = set.root.getObjectByName(hullName);
    const pos = mask.geometry.attributes.position;
    // 遮挡片每条船是一串 (x, z−half)/(x, z+half) 顶点对；按 x 在站间线性插值，逐 5 cm 量
    const boats = new Map();
    for (let i = 0; i < pos.count; i += 2) {
      const zc = Math.round(((pos.getZ(i) + pos.getZ(i + 1)) / 2) * 100) / 100;
      if (!boats.has(zc)) boats.set(zc, []);
      boats.get(zc).push([pos.getX(i), (pos.getZ(i + 1) - pos.getZ(i)) / 2]);
    }
    for (const [zc, rows] of boats) {
      if (blastedZ.some((z) => Math.abs(z - zc) < 0.01)) continue;
      for (let x = -2.6; x <= 2.6 + 1e-6; x += 0.05) {   // 两头舱底翘出水面，那一段遮不遮都一样
        const k = rows.findIndex((row, j) => j + 1 < rows.length && row[0] <= x && rows[j + 1][0] >= x);
        const [x0, h0] = rows[k], [x1, h1] = rows[k + 1];
        const half = h0 + ((h1 - h0) * (x - x0)) / (x1 - x0);
        const near = Crossings(hull, x).map((z) => z - zc).filter((dz) => Math.abs(dz) > 0.25 && Math.abs(dz) < 1.3);
        const inner = Math.min(...near.filter((dz) => dz > 0), ...near.filter((dz) => dz < 0).map((dz) => -dz));
        stations += 1;
        if (half - inner > worstOut) worstAt = `x ${x.toFixed(2)} z ${zc.toFixed(1)} inner ${inner.toFixed(3)} half ${half.toFixed(3)}`;
        worstOut = Math.max(worstOut, half - inner);
        worstGap = Math.max(worstGap, inner - half);
      }
    }
  }
  Check(stations > 1000 && worstOut < 0 && worstGap < 0.03,
    "遮挡片截面在舱内壁里面、离内壁不到 3 cm（不露水缝）", `${stations} 站，最多出壁 ${worstOut.toFixed(4)} m（${worstAt}），最大缝 ${worstGap.toFixed(4)} m`);
}
const Snapshot = (name) => { const node = set.nodes.get(name); return { p: node.position.clone(), q: node.quaternion.clone() }; };
const northRest = Snapshot("NorthSection"), boatRest = Snapshot("Boat11Bow"), sinkRest = Snapshot("SinkBoat8"), deckRest = Snapshot("Deck11_1");

// 18 前三步：药包与导线在；起爆器从接令起一直在。
set.Update(1 / 60, "BridgeCover", { destroyed: false });
Check(set.groups.charges.visible && set.groups.exploder.visible, "18 桥上看得见药包与导爆索、栈头有起爆器");
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
const boat1 = Snapshot("Boat11Bow"), sink1 = Snapshot("SinkBoat8"), deck1 = Snapshot("Deck11_1");
Check(boat1.p.distanceTo(boatRest.p) > 2 || boat1.q.angleTo(boatRest.q) > 0.5, "炸飞的船体碎块 1 s 时已经飞出去了（动作没被 three 暂停）");
Check(deck1.p.distanceTo(deckRest.p) > 2, "桥面板簇 1 s 时已经飞散");
Check(sink1.q.angleTo(sinkRest.q) > 0.05 || sink1.p.distanceTo(sinkRest.p) > 0.1, "邻船在 1 s 时已经在倾斜下沉");
Run(2.0);
Check(Snapshot("NorthSection").q.angleTo(northRest.q) > 0.01, "北截在 3 s 时已经在向下游摆");
Run(data.duration - 2.9);
Check(set.state === "wreck" && set.groups.wreck.visible && !set.pieces.visible, "演完换成残骸合批");
Check(set.cueIndex === set.cues.length, "时间线每一条都触发了", `${set.cueIndex}/${set.cues.length}`);
Check(log.explosions.length === data.charges.length + 1, "每个药包一团火、外加半空那一团最大的", String(log.explosions.length));
Check(set.stats.splashes >= events.filter((e) => e.type === "water").length - 1, "每一条入水事件都演了水花", JSON.stringify(set.stats));
Check(log.audio.some((a) => a.cue === "impactWood") && log.audio.some((a) => a.cue === "debrisFall") && !log.audio.some((a) => /^explosion/.test(a.cue)),
  "木船折断与落水的撞击声有，另外的爆炸声没有（爆炸声只走 Combat.BlastFeedback 一次）");
Check(log.audio.filter((a) => a.cue === "debrisFall").length <= FX.splashAudio.maxPlays, "落水声不超过声部预算");
Check(fovMin < 0.8 && fovMin >= FX.focus.scale - 1e-3, "看着桥的那几秒视野收窄", fovMin.toFixed(3));
Check(log.spawns > 150 && log.spawns < 0.6 * 880 + 200, "烟池生成量合理", String(log.spawns));
Run(6);
Check(Math.abs(set.FovScale(1 / 60) - 1) < 0.02, "演完视野放回去");
const burning = [...log.sources.values()].filter((s) => s.options.fire > 0).length;
Check(log.sources.size >= 3 && burning >= 2, "两处断口一直在冒烟烧着", String(log.sources.size));
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

console.log(`ok  北沙河浮桥模型与毁桥时间线：${checks} 项`);
