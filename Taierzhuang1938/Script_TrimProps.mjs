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
  // 示例（E1 替换）：WindowLattice: { model: "WindowLattice" },
});

/**
 * 落点表：phaseId → [{ asset, x, y, z, ry, scale? }]。
 * y 是**绝对世界高度**（饰件多数不落地：窗台、门楣、灯柱顶……由 E1 按安装面写死）。
 * 坐标一律从 Data_Tengxian 的地标数据推导后写常量，注明来源。
 */
export const TRIM_PLACEMENTS = Object.freeze({
  L0_Jiehe: [],
  L1_Beishahe: [],
  L2_Dongguan: [],
  L3_Fanji: [],
  L4_Chengqiang: [],
  L5_Shizijie: [],
  L6_Beimen: [],
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
