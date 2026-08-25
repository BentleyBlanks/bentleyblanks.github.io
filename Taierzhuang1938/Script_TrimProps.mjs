// tzm 饰件层 —— 把 ≤400 三角的 .tzm.json 小件（信号机/站灯/窗花/门五金…）
// 以运行时实例摆进战斗关卡。工作包 E1 专属文件（骨架由主会话插桩）。
//
// 为什么不并进 Script_ExternalProps（GLB 装饰层）：
//   ① Script_BootTest 对那一层有逐关硬编码计数；② Script_PhysicsTest 要求那一层
//   每件贴地 ±0.15 m 且有碰撞 —— 墙挂窗花、门五金、4 m 高的信号臂全都过不了；
//   ③ Script_ExternalPropAssetTest 直接扫那个模块的源码。饰件层的物理契约不同
//  （多数无碰撞、可以悬空安装），所以平行开一层，自用 userData.trimProps 标记。
//
// 渲染契约：InstantiateModel 产的静态 Mesh 对深度-法线预通道天然安全
//（不许 SkinnedMesh 的规矩不受影响）；只有做透明/发光件时才需要 MarkNoPrepass。
// 材质：MESHES[id].materials → ResolveTengxianMaterial，全部用已登记名。
// 破坏：饰件默认不登记碰撞、不参与破坏；要挡子弹的件显式给 solid 字段。
//
// 调用时机：Script_Main.BuildField 里与 AddExternalProps 并排的异步槽位
//（城市生成器 drain 之后、BuildPhysics 之前）。带碰撞的件由调用方并进
// field.colliders 并重跑 BuildCollisionGrid（与 ExternalProps 同一套注意事项）。

import * as THREE from "three";
import { MESHES, MeshUrl } from "./Data_Meshes.mjs";
import { LoadDocument, InstantiateModel } from "./Script_MeshLoad.mjs";
import { ResolveTengxianMaterial } from "./Script_TengxianCity.mjs";

/**
 * 资产表：tzm 模型 id → 摆放语义。
 *   { model: MESHES 的 id, solid?: [hx,hy,hz]（要挡子弹才给，中心=模型原点上方 hy）, tag?: 破坏档 }
 * E1 在此登记新件（SemaphoreSignal / StationLamp / ChurchTracery / CellDoorIron / CrossingSign…）
 * 与复用件（Dougong / RidgeBeast / WindowLattice / DoorPier）。
 */
export const TRIM_ASSETS = Object.freeze({
  SemaphoreSignal: { model: "SemaphoreSignal" },
  StationLamp: { model: "StationLamp" },
  ChurchTracery: { model: "ChurchTracery" },
  CellDoorIron: { model: "CellDoorIron" },
  CrossingSign: { model: "CrossingSign" },
  // 复用件：门楼四件里的两件。斗拱补在**程序化檐下斗拱带够不到的地方**
  //（县署大门正面、龙王庙山门的两个侧面 —— AddEaveBand 只排正面那一条），
  // 脊兽补在县署大门与大堂的正脊两端（AddHardMountainRoof 出的是一条素脊，
  // 没有吻兽；庙宇的 AddTempleRoof 自带鸱吻，所以**不往庙脊上加**，会撞）。
  Dougong: { model: "Dougong" },
  RidgeBeast: { model: "RidgeBeast" },
});

// ---------------------------------------------------------------------------
// 落点常量：**全部从 Data_Tengxian 的地标数据推导后写死**，本文件不 import 数据
//（构建器契约禁 import Data_Tengxian；这一层虽然不是构建器，但同一条纪律照用 ——
//  运行时再算一遍会把「饰件跟着地标走」的假象做实，而实际上落点是照几何算的，
//  地标尺寸一改这些数就得重算，写常量才逼得后来人回到这张表上核对）。
//
// 推导过程逐条注明。改了哪个地标的尺寸，就回来重算对应那一段。
// ---------------------------------------------------------------------------

// —— 西关车站（WEST_SUBURB.station {x:-458,z:-82,w:34,d:12} + railway.x=-480）——
// Script_Landmark_Station：y0 = OuterHeight(-458,-82) = 0（OUTER_PADS.Station 垫平），
// 站台面 yB = y0 + 0.75；站台 x∈[-476.4,-464]（边缘离轨心 3.6）、z∈[-112,-52]（长 60）；
// 雨棚柱列在 x=-470.2。灯柱取 x=-474.8：离站台边缘 1.6 m、离雨棚柱 4.6 m，两头都不打架。
const PLATFORM_Y = 0.75;
const LAMP_X = -474.8;
const LAMP_Z = [-107, -97, -87, -77, -67, -57];
// 信号机立在道砟坡脚外 2 m（碰撞盒实测道砟半宽 4.65 → x=-486.5 是净地），
// 南北各一座、卡在站界两头。y 取 battlefield.GroundHeight 实测值再压 0.05 m：
// 那一带是 OUTER_PADS.Station 的羽化带，地面不是 0 而是 -0.12 / -0.14（E1 探针取证）。
const SEMAPHORE = [
  { x: -486.5, y: -0.17, z: -100 },
  { x: -486.5, y: -0.19, z: -64 },
];
// 平交道口（railway.crossings=[0]）：道口土面碰撞盒 x∈[-490,-470] z∈[-4.8,4.8]。
// 道口标摆在土面外、道砟外，路的两侧各一块，各自朝着来车的方向。
const CROSSING = [
  { x: -472, y: -1.54, z: -6.0, ry: Math.PI / 2 },   // 东侧来车（往西看）
  { x: -488, y: -1.56, z: 6.0, ry: -Math.PI / 2 },   // 西侧来车（往东看）
];

// —— 城内天主堂（LANDMARKS.CatholicChurchInner {x:36,z:238,ry:π,nave:[11,24]}）——
// Script_Landmark_ChurchSchool.BuildChurch：eave = 5.0 + 11×0.22 = 7.42；
// bays = round(24/4.6) = 5；cellZ = 4.8；openW = min(1.5, 4.8×0.34) = 1.5；
// sillY = eave×0.34 = 2.5228；winH = eave×0.35 = 2.597；archH = eave×0.12 = 0.8904
//   —— 窗花模型就是照这三个数建的（1.50 / 2.60 / 0.89），所以 scale = 1。
// 落位：ry=π ⇒ 世界 x = 36 − lx、z = 238 − lz。窗心 lx = ±5.5（中厅两侧长墙的墙心）、
// lz = −9.6 / −4.8 / 0 / 4.8 / 9.6。窗花摆在**墙心平面**上（墙厚 0.55，窗洞是真洞、
// 内衬 dark 已被 A7 撤掉），所以 x 直接取墙心。
const CHURCH_SILL_Y = 2.5228;
const CHURCH_WALL_X = [30.5, 41.5];          // s=+1（西墙心）/ s=−1（东墙心）
const CHURCH_WIN_Z = [247.6, 242.8, 238, 233.2, 228.4];

// —— 监狱牢房（CITY_FEATURES.CountyJail {x:162,z:-192,ry:0,w:44,d:36}）——
// Script_Landmark_Prison.BuildPrison：hd=18 → dutyZ=11.5、dutyD=5 → yardFront=6.5；
// cellW = min(44−10,33) = 33、cellD = 5.6；前排 rowAZ = 6.5−4.2−2.8 = −0.5、
// 后排 rowBZ = −0.5−5.6−2.8 = −8.9；两排都 facing=+1 ⇒ 正立面 frontZ = lz + 2.8。
// AddCellRow：bays = round(33/2.2) = 15、bayW = 2.2、牢门在 b%5===2（b=2/7/12）
// ⇒ off = −16.5 + 2.2×(b+0.5) = −11 / 0 / +11。
// 门板贴在 frontZ + (t/2 − 0.02)（t=0.42），板厚 0.11 ⇒ 外表面 = frontZ + 0.245。
// 门扇底边 y = 0.05（门板中心 (doorH−0.06)/2 + 0.05）。
// 后排 b=2 是 openCell（半开的那一间，AddOpenLeaf 出的斜板）——**不给它挂五金**，
// 五金是照关着的门板算的，挂到斜着的门板上就是一副悬在门洞里的铁活。
const CELL_DOOR_Y = 0.05;
const CELL_DOORS = [
  { x: 151, z: -189.455 }, { x: 162, z: -189.455 }, { x: 173, z: -189.455 },  // 前排 b=2/7/12
  { x: 162, z: -197.855 }, { x: 173, z: -197.855 },                            // 后排 b=7/12
];

// —— 县公署（LANDMARKS.Yamen {x:128,z:-118,ry:0,w:62,d:54}）——
// Script_Landmark_Yamen：A(lx,s) = (128+lx, −91−s)。
// 大门：gateW = clamp(62×0.21,11,15) = 13.02、gateD = clamp(54×0.12,5.5,8) = 6.48、
//   sGate = 3.24 ⇒ 门脸（南面）在 z = −91、门中在 z = −94.24；gateEave = 4.2、
//   腰檐 ridgeY = 5.7 ⇒ 正脊压顶顶面 = 5.7 + 0.16（AddHardMountainRoof 的脊块
//   中心 ridgeY+0.06、厚 0.2）。硬山山墙在 x = 128±6.51，脊兽往里收 0.2。
// 大堂：platD = clamp(54×0.24,10.5,14) = 12.96、hallW = clamp(62×0.33,16,22) = 20.46、
//   hallD = 12.96−3 = 9.96、sPlat0 = 54×0.575 = 31.05、sHall = 31.05+3+4.98 = 39.03
//   ⇒ 大堂中心 z = −130.03；eaveY = 1.0+4.8 = 5.8、ridgeY = 5.8 + 4.98×0.52 = 8.3896
//   ⇒ 脊顶 8.5496。山墙在 x = 128±10.23。
const YAMEN_GATE = { z: -91.00, faceZ: -90.90, eaveY: 4.20, ridgeZ: -94.24, ridgeY: 5.86, halfX: 6.31 };
// 大堂前檐：frontS = 39.03 − 4.98 + 0.3 = 34.35 ⇒ 檐柱/额枋外皮 z = −125.13；
// 额枋（PaintRedOfficial，0.5 高）中心 eaveY−0.42 ⇒ 顶面 5.63 —— 斗拱本来就该坐在额枋上。
const YAMEN_HALL = {
  ridgeZ: -130.03, ridgeY: 8.55, halfX: 10.03,
  architraveZ: -125.05, architraveY: 5.63, bayX: [-8.184, -4.092, 0, 4.092, 8.184],
};

// —— 龙王庙（CITY_FEATURES.DragonKingTemple {x:52,z:-172,ry:0,w:42,d:30}）——
// Script_Landmark_Temple.BuildTemple：openW=2.4、wing=2.3、gateDepth=2.0 ⇒ 山门面阔 7.0；
// gateLz = 15 − 1 − 0.22 = 13.78 ⇒ 门中 z = −158.22、门脸 z = −157.22、门背 z = −159.22；
// 山门 height = 4.3。AddEaveBand 只在**正面**排斗拱，两个侧面是空的 —— 补在那儿。
// AddEaveBand 只在**正面**排斗拱，山门的**背面**（院内一侧，局部 −z ⇒ 世界 z=−159.22）
// 是空的 —— 补在那儿。侧面看着也空，但那是硬山山墙（AddTempleRoof 把 0.34 厚的
// 山墙压在 lx = ±(width/2+0.17) = ±3.97，比门身的 ±3.5 还往外 0.3 m），
// 硬山端头本来就没有出檐，斗拱挂上去既没处坐、又会整只藏在山墙后面（出图取证）。
const TEMPLE_GATE = { backZ: -159.32, y: 4.10, x: [49.3, 51.1, 52.9, 54.7] };

/**
 * 落点表：phaseId → [{ asset, x, y, z, ry, scale? }]。
 * y 是**绝对世界高度**（饰件多数不落地：窗台、门楣、灯柱顶……由 E1 按安装面写死）。
 * 坐标一律从 Data_Tengxian 的地标数据推导后写常量，注明来源。
 */

/** 西关铁路带（只有 L1 的 bounds 覆盖 x≈−480）。 */
function RailwayTrim() {
  const out = [];
  for (const s of SEMAPHORE) out.push({ asset: "SemaphoreSignal", ...s, ry: 0 });
  for (const z of LAMP_Z) out.push({ asset: "StationLamp", x: LAMP_X, y: PLATFORM_Y, z });
  for (const c of CROSSING) out.push({ asset: "CrossingSign", ...c });
  return out;
}

/**
 * 天主堂尖券窗花十扇。
 * 模型平面的法线是 ±z，中厅长墙的法线是 ±x ⇒ ry = ±π/2；窗花前后对称，取哪个都行。
 */
function ChurchTrim() {
  const out = [];
  for (const x of CHURCH_WALL_X) {
    for (const z of CHURCH_WIN_Z) {
      out.push({ asset: "ChurchTracery", x, y: CHURCH_SILL_Y, z, ry: Math.PI / 2 });
    }
  }
  return out;
}

/** 监狱牢门五金（ry=0：模型的 +z 就是门外，牢房正立面朝世界 +z）。 */
function JailTrim() {
  return CELL_DOORS.map((d) => ({ asset: "CellDoorIron", x: d.x, y: CELL_DOOR_Y, z: d.z, ry: 0 }));
}

/**
 * 县署 + 龙王庙的既有件复用。
 *
 * 脊兽朝向：模型的下颌朝**局部 −z**（BuildRidgeBeast 里 jaw 摆在 z=−0.100），
 * 而正脊沿 x 走 ⇒ 东端要 ry=−π/2（−z→+x）、西端要 ry=+π/2。
 * 斗拱朝向：拱臂沿局部 x，正面朝局部 +z ⇒ 贴朝南的墙面用 ry=0，
 * 贴朝东/朝西的墙面用 ry=±π/2。
 */
function CivicTrim() {
  const out = [];
  // 县署大门正面：四朵斗拱骑在檐口下。避开门匾（x∈[126.55,129.45]，顶 4.17）。
  for (const lx of [-5.2, -3.0, 3.0, 5.2]) {
    out.push({ asset: "Dougong", x: 128 + lx, y: YAMEN_GATE.eaveY - 0.20, z: YAMEN_GATE.faceZ, ry: 0 });
  }
  // 县署大门腰檐正脊两端 + 大堂正脊两端
  for (const s of [-1, 1]) {
    out.push({
      asset: "RidgeBeast", x: 128 + s * YAMEN_GATE.halfX, y: YAMEN_GATE.ridgeY,
      z: YAMEN_GATE.ridgeZ, ry: -s * Math.PI / 2,
    });
    out.push({
      asset: "RidgeBeast", x: 128 + s * YAMEN_HALL.halfX, y: YAMEN_HALL.ridgeY,
      z: YAMEN_HALL.ridgeZ, ry: -s * Math.PI / 2,
    });
  }
  // 县署大堂前檐：五间各一朵，坐在额枋顶面上（大堂全套只有额枋没有斗拱）
  for (const lx of YAMEN_HALL.bayX) {
    out.push({
      asset: "Dougong", x: 128 + lx, y: YAMEN_HALL.architraveY,
      z: YAMEN_HALL.architraveZ, ry: 0,
    });
  }
  // 龙王庙山门背面（院内一侧）四朵：正面那一条由 AddEaveBand 出，别重复
  for (const x of TEMPLE_GATE.x) {
    out.push({ asset: "Dougong", x, y: TEMPLE_GATE.y, z: TEMPLE_GATE.backZ, ry: Math.PI });
  }
  return out;
}

// 一处地标只在**它所在切片被生成的那几关**摆饰件：摆到没生成城的关里，
// 就是一排铁活悬在麦田上空（Data_Battle.TUNING[*].bounds 是唯一判据）。
//   车站/道口 x≈−480 ⇒ 只有 L1；
//   天主堂 z=238 ⇒ 只有 L4（L5 的 z 上限 140、L6 的 200 都够不着）；
//   监狱 z≈−192 ⇒ L4 与 L6（L5 的 z 下限 −190 会把后排那两扇门切掉）；
//   县署 / 龙王庙 ⇒ L4 / L5 / L6 都在。
const CIVIC = CivicTrim();
const JAIL_TRIM = JailTrim();

export const TRIM_PLACEMENTS = Object.freeze({
  L0_Jiehe: [],
  L1_Beishahe: RailwayTrim(),
  L2_Dongguan: [],
  L3_Fanji: [],
  L4_Chengqiang: [...ChurchTrim(), ...JAIL_TRIM, ...CIVIC],
  L5_Shizijie: [...CIVIC],
  L6_Beimen: [...JAIL_TRIM, ...CIVIC],
});

const docCache = new Map();

export function ClearTrimProps(scene) {
  const stale = [];
  scene.traverse((node) => { if (node.userData && node.userData.trimProps) stale.push(node); });
  for (const node of stale) node.parent?.remove(node);
}

/**
 * @returns {Promise<{count:number, failed:string[], colliders:object[]}>}
 */
export async function AddTrimProps({ scene, library, phaseId }) {
  ClearTrimProps(scene);
  const placements = TRIM_PLACEMENTS[phaseId] || [];
  if (!placements.length) return { count: 0, failed: [], colliders: [] };
  const ids = [...new Set(placements.map((p) => TRIM_ASSETS[p.asset]?.model).filter(Boolean))];
  const docs = new Map();
  await Promise.all(ids.map(async (id) => { docs.set(id, await LoadDocument(MeshUrl(id))); }));

  const group = new THREE.Group();
  group.name = `TrimProps_${phaseId}`;
  group.userData.trimProps = true;
  const failed = [];
  const colliders = [];
  let count = 0;
  for (const p of placements) {
    const spec = TRIM_ASSETS[p.asset];
    const doc = spec && docs.get(spec.model);
    const meta = spec && MESHES[spec.model];
    if (!doc || !meta) { failed.push(p.asset); continue; }
    const materials = {};
    for (const name of meta.materials) materials[name] = ResolveTengxianMaterial(name, library);
    const built = InstantiateModel(doc, { materials });
    built.root.position.set(p.x, p.y, p.z);
    built.root.rotation.y = p.ry || 0;
    if (p.scale) built.root.scale.setScalar(p.scale);
    group.add(built.root);
    count += 1;
    if (spec.solid) {
      const [hx, hy, hz] = spec.solid;
      const s = p.scale || 1;
      colliders.push({
        c: [p.x, p.y + hy * s, p.z], h: [hx * s, hy * s, hz * s],
        ry: p.ry || 0, tag: spec.tag || "prop",
        min: [p.x - Math.max(hx, hz) * s, p.y, p.z - Math.max(hx, hz) * s],
        max: [p.x + Math.max(hx, hz) * s, p.y + hy * 2 * s, p.z + Math.max(hx, hz) * s],
      });
    }
  }
  scene.add(group);
  return { count, failed, colliders };
}
