// 壕沟样条的**预览几何**（three）。契约：docs/Data_TrenchSpline.md §3.3。
//
// ## 这一层只画，不算
// 沟怎么挖、挖多宽、护壁摆哪儿，全在 Script_TrenchPlan（纯数学、零 three、Node 可测）。
// 本文件拿到编译好的 `plan` 之后只干一件事：把它**摆成看得见的面**。
// 为什么要分这一刀 —— 壕沟最后是烘进高度场的，运行时根本没有「壕沟网格」这种东西；
// 编辑器要看的那张皮是临时的、只在面板开着的时候存在，不许混进正片管线。
//
// ## 画的是 plan.Apply，不是另一份剖面
// 横断面每个点的高度都走 `plan.Apply(x, z, natural, natural)` —— 也就是烘高度场时
// 逐格点调的那一个函数。这样「面板上看到的沟底」与「玩家踩到的沟底」是同一个数，
// 而不是「预览里 2 m 深、进游戏 1.7 m」这种只能靠实拍才发现的偏差。
// 抛土堆、并集、位置噪声也因此天然对上：它们都在 Apply 里面。
//
// ## 为什么是 7 点横断面
//   −(halfTop+bermW)  −halfTop  −halfFloor  0  +halfFloor  +halfTop  +(halfTop+bermW)
// 沟沿（halfTop）与沟底边（halfFloor）是剖面上仅有的两处折线；抛土堆外沿是第三处。
// 少于这 7 点，坡面会在三角化时把折角抹平（看着像个碗）；多于这 7 点纯属浪费 ——
// 中间那些都是直的。拐角与三岔口的连续性由 plan 的 stations 保证，不归这一层管。

import * as THREE from "three";

/** 预览配色：编辑器与任何别的消费者读同一份，别各调各的。 */
export const TRENCH_PREVIEW_COLORS = Object.freeze({
  trench: 0x8a7034,          // 土黄偏暗 —— 与 KIND_COLOR.trench 同一个数
  trenchJunction: 0xff9a40,  // 三岔口标记：橙，唯一在土色里跳出来的颜色
  trenchBlock: 0xb9a27a,     // 护壁/踏板这类 solid:false 的布设件
  trenchCover: 0xd4c08a,     // 射击位沙袋（solid:true）
  trenchPlacement: 0x7fa8c0, // 外部模型占位
});

const MIN_STATIONS = 2;
const SECTION_POINTS = 7;

function Segment(plan, segmentId) {
  if (!plan || !Array.isArray(plan.segments)) return null;
  return plan.segments.find((s) => s.id === segmentId) || null;
}

/** 站点的横断面偏移（沿法向 n，米）。berm 宽度取段的标称值。 */
function SectionOffsets(station, bermW) {
  const halfFloor = Math.max(0.05, station.halfFloor || 0);
  const halfTop = halfFloor + Math.max(0.05, station.bank || 0);
  const outer = halfTop + Math.max(0, bermW);
  return [-outer, -halfTop, -halfFloor, 0, halfFloor, halfTop, outer];
}

/**
 * 选中段的横断面带。
 *
 * @param {{Add:(material:string, geometry:THREE.BufferGeometry)=>void}} collector
 * @param {object} plan   Script_TrenchPlan.CompileTrenchNetwork 的结果
 * @param {string} segmentId
 * @param {{natural:(x:number,z:number)=>number, lift?:number, stride?:number}} options
 *   natural  自然地面高（第一关传 SampleMissionNaturalHeight）
 *   lift     预览抬升，默认 0.04 m（与道路/围墙预览同一条：抬一点点 + polygonOffset）
 *   stride   每隔几站取一个横断面（站点是 1 m 一个；长沟没必要 1 m 一片）
 * @returns {null|{stations:number, vertices:number, triangles:number, junctions:number,
 *                 length:number, minDepth:number, maxDepth:number}}
 */
export function BuildTrenchPreview(collector, plan, segmentId, {
  natural = null, lift = 0.04, stride = 1,
} = {}) {
  const segment = Segment(plan, segmentId);
  if (!segment) return null;
  const all = segment.stations || [];
  if (all.length < MIN_STATIONS) return null;
  const step = Math.max(1, Math.round(stride));
  const stations = [];
  for (let i = 0; i < all.length; i += step) stations.push(all[i]);
  if (stations[stations.length - 1] !== all[all.length - 1]) stations.push(all[all.length - 1]);
  if (stations.length < MIN_STATIONS) return null;

  const Natural = typeof natural === "function" ? natural : () => 0;
  const bermW = segment.nominal?.bermW ?? 1.6;
  const rows = stations.length;
  const count = rows * SECTION_POINTS;
  const position = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let minDepth = Infinity;
  let maxDepth = -Infinity;

  for (let i = 0; i < rows; i += 1) {
    const st = stations[i];
    const offsets = SectionOffsets(st, bermW);
    // 法向：站点自带就用站点的（plan 已经在拐角处做过平均）；没有才从切向转 90°。
    // 旋向必须跟 Script_TrenchPlan 一致（n = (−tz, tx)，不是契约初稿写的 (tz, −tx)）——
    // 转反了断面本身看不出来（它对称），但 bermSide 会整条堆到敌我相反的那一侧。
    const nx = Number.isFinite(st.nx) ? st.nx : -(st.tz ?? 0);
    const nz = Number.isFinite(st.nz) ? st.nz : (st.tx ?? 0);
    for (let k = 0; k < SECTION_POINTS; k += 1) {
      const o = offsets[k];
      const x = st.x + nx * o;
      const z = st.z + nz * o;
      const ground = Natural(x, z);
      const y = plan.Apply(x, z, ground, ground);
      const at = (i * SECTION_POINTS + k) * 3;
      position[at] = x;
      position[at + 1] = y + lift;
      position[at + 2] = z;
      uv[(i * SECTION_POINTS + k) * 2] = x / 2;
      uv[(i * SECTION_POINTS + k) * 2 + 1] = z / 2;
      if (k === 3) {
        const depth = ground - y;
        if (depth < minDepth) minDepth = depth;
        if (depth > maxDepth) maxDepth = depth;
      }
    }
  }

  const index = new Uint32Array((rows - 1) * (SECTION_POINTS - 1) * 6);
  let write = 0;
  for (let i = 0; i < rows - 1; i += 1) {
    for (let k = 0; k < SECTION_POINTS - 1; k += 1) {
      const a = i * SECTION_POINTS + k;
      const b = a + 1;
      const c = a + SECTION_POINTS;
      const d = c + 1;
      // n = (-tz, tx): advancing across the section before along it faces up.
      index[write] = a; index[write + 1] = b; index[write + 2] = c;
      index[write + 3] = b; index[write + 4] = d; index[write + 5] = c;
      write += 6;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  collector.Add("trench", geometry);

  const junctions = BuildTrenchJunctionMarkers(collector, plan, segmentId, { natural: Natural, lift });
  return {
    stations: rows,
    vertices: count,
    triangles: index.length / 3,
    junctions,
    length: segment.path?.length ?? 0,
    minDepth: Number.isFinite(minDepth) ? minDepth : 0,
    maxDepth: Number.isFinite(maxDepth) ? maxDepth : 0,
  };
}

/**
 * 三岔口标记：一根小柱 + 柱顶一只小球。
 *
 * 为什么要标出来：接口处两条沟的开挖并集是**平的**，站在沟里根本看不出
 * 「这里是 T 口」—— 但布设要在这里让开、抛土堆要在这里断。调参时看不见接口，
 * 就只能靠「为什么这一段护壁少了三根」去猜。
 *
 * @param {string|null} segmentId  给了就只标与该段有关的接口；null = 全网
 * @returns {number} 标出来的接口数
 */
export function BuildTrenchJunctionMarkers(collector, plan, segmentId = null, {
  natural = null, lift = 0.04, postH = 2.6, radius = 0.42,
} = {}) {
  const list = plan?.junctions || [];
  if (!list.length) return 0;
  const Natural = typeof natural === "function" ? natural : () => 0;
  let made = 0;
  for (const junction of list) {
    if (segmentId && !(junction.members || []).some((m) => m.id === segmentId)) continue;
    const ground = Natural(junction.x, junction.z);
    const floor = plan.Apply(junction.x, junction.z, ground, ground) + lift;
    const post = new THREE.CylinderGeometry(0.07, 0.07, postH, 6, 1);
    post.translate(junction.x, floor + postH / 2, junction.z);
    collector.Add("trenchJunction", post);
    const ball = new THREE.SphereGeometry(radius, 10, 8);
    ball.translate(junction.x, floor + postH, junction.z);
    collector.Add("trenchJunction", ball);
    made += 1;
  }
  return made;
}

/**
 * 布设预览：PlanTrenchDressing 的结果摆成半透明盒子。
 *
 * blocks 里的 y 已经由规划层按烘完的地面算好了，这一层**不许再贴一次地** ——
 * 再贴一次就是拿编辑器里的地面（可能带着面板上的临时改动）去覆盖规划层的账，
 * 面板上看着贴合、进游戏浮空。只抬 lift 防 z-fight。
 *
 * @returns {{blocks:number, placements:number}}
 */
export function BuildTrenchDressingPreview(collector, dressing, {
  lift = 0.02, groundAt = null, filter = null,
} = {}) {
  let blocks = 0;
  let placements = 0;
  for (const block of dressing?.blocks || []) {
    if (filter && !filter(block)) continue;
    const geometry = new THREE.BoxGeometry(
      Math.max(0.02, block.w || 0.1),
      Math.max(0.02, block.h || 0.1),
      Math.max(0.02, block.d || 0.1));
    if (block.ry) geometry.rotateY(block.ry);
    geometry.translate(block.x, (block.y ?? 0) + lift, block.z);
    collector.Add(block.solid ? "trenchCover" : "trenchBlock", geometry);
    blocks += 1;
  }
  for (const item of dressing?.placements || []) {
    if (filter && !filter(item)) continue;
    const size = 0.55 * (item.scale || 1);
    const geometry = new THREE.BoxGeometry(size, size, size);
    if (item.ry) geometry.rotateY(item.ry);
    const y = Number.isFinite(item.y) ? item.y
      : (groundAt ? groundAt(item.x, item.z) : 0);
    geometry.translate(item.x, y + size / 2 + lift, item.z);
    collector.Add("trenchPlacement", geometry);
    placements += 1;
  }
  return { blocks, placements };
}

/**
 * 中心线折线（世界点），给「叠加显示全部路线」画别的段用。
 * 走 plan 的 stations 而不是控制点 —— 圆角过的拐角在这里才看得出来。
 */
export function TrenchCenterlinePoints(plan, segmentId, { natural = null, lift = 0.5, stride = 3 } = {}) {
  const segment = Segment(plan, segmentId);
  if (!segment) return [];
  const stations = segment.stations || [];
  if (stations.length < MIN_STATIONS) return [];
  const Natural = typeof natural === "function" ? natural : () => 0;
  const step = Math.max(1, Math.round(stride));
  const out = [];
  for (let i = 0; i < stations.length; i += step) {
    const st = stations[i];
    const ground = Natural(st.x, st.z);
    out.push(new THREE.Vector3(st.x, plan.Apply(st.x, st.z, ground, ground) + lift, st.z));
  }
  const last = stations[stations.length - 1];
  const ground = Natural(last.x, last.z);
  out.push(new THREE.Vector3(last.x, plan.Apply(last.x, last.z, ground, ground) + lift, last.z));
  return out;
}

export default BuildTrenchPreview;
