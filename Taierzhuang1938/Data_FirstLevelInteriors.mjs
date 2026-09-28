// 第一关室内遮蔽体：哪几间屋子「屋里比屋外暗」，光从哪几个口子进来。
// 纯数据 + 纯函数，零 three 依赖（契约 2）。消费方 Script_InteriorSkyOcclusion（屏幕空间，
// 把室内天光可见度乘进 GTAO 的 AO 图，只压间接光 —— 契约 6）。
//
// ## 为什么要有它
// 参考图（概念 09 / 09_B / 16 / 17、分镜 01 掩蔽部）里屋里明显暗于屋外、光从门窗进来、
// 深处发黑；实机（Gap3A_Before 09_2 / 16_1 / SB01）屋里屋外一样亮。原因是间接光只有
// 一张天空 IBL + Global SH，都没有位置概念；GTAO 只管一两米内的接触遮蔽，管不了
// 「头顶整块是屋顶」。探针体 GI（Script_Gi）能管，但它拿碰撞盒当代理体，而第一关的屋顶
// 檐以上是非实心的（碰撞表里没有屋顶），探针照样看得见天 —— 所以这里直接写明「屋子」。
//
// ## 一间屋子怎么写
//   box   墙**中线**围成的矩形（与白盒 Room / Roof 调用的 x,z,w,d 同口径），世界米。
//   ceil  屋内净高（地面到顶棚底），米。floor 取共享地面在屋子中心的高度，
//         或显式 floorY（掩蔽部是挖在地里的坑，地面不是自然地面）。
//   wall  墙厚（缺省 0.6）；内框 = box 各边往里收半个墙厚。
//   dark  屋子最深处的天光可见度（0–1）。口子贡献的光在它之上叠加。
//   portals（可选）显式开口；不写就按布局体块在墙中线上自动找缺口（门、窗、敞口）。
// 自动找缺口只认 MISSION_LAYOUT.blocks（含非实心细节：门扇、帘子、窗棂都挡光），
// 不认 "…Void"（画在墙外皮上的假窗洞）；缺口外侧紧挨着另一间屋子的，是屋与屋之间的门，
// 不算采光口。
import { MISSION_LAYOUT } from "./Data_FirstLevelMissionLayout.mjs";
import { SampleMissionNaturalHeight } from "./Data_FirstLevelMissionTerrain.mjs";

const BUNKER_FLOOR = SampleMissionNaturalHeight(-0.8, -125.8) - 2.0;

export const FIRST_LEVEL_INTERIORS = Object.freeze({
  layoutId: "FirstLevelMissionSeptember19",
  rooms: Object.freeze([
    // 09 灶屋与连屋（Village Roof("Kitchen"/"ConnectedHouse"), 中间一段有顶的过道）
    { id: "Kitchen", box: { x: 58, z: -9, w: 12, d: 15 }, ceil: 2.95, dark: 0.10 },
    { id: "KitchenLink", box: { x: 58, z: -0.5, w: 12, d: 2 }, ceil: 2.9, dark: 0.10 },
    { id: "ConnectedHouse", box: { x: 58, z: 8, w: 12, d: 15 }, ceil: 2.95, dark: 0.10 },
    { id: "MachineGunHouse", box: { x: 43, z: 8, w: 12, d: 15 }, ceil: 2.95, dark: 0.10 },
    // 09_3 侧间：朝街一面是带柱的敞口，采光比灶屋好得多
    { id: "SideRoom", box: { x: 68, z: 10.65, w: 8, d: 10.3 }, ceil: 2.95, dark: 0.12, wall: 0.65 },
    // 16–17 厢房（Rear Gable("ReceptionWard")），南门 + 西窗 + 东侧敞口
    { id: "ReceptionWard", box: { x: -26, z: 234, w: 14, d: 18 }, ceil: 2.9, dark: 0.10 },
    // 01 掩蔽部：坑底 = 自然地面 − 2.0 m，顶是 BunkerRoof（底面在自然地面 −0.15）。
    // 三面是坑壁（地形，不在体块表里），只有东面的洞口采光，所以口子写死。
    // dark 0.38：坑只有 4 m 见方、洞口 3 m 宽，洞外晒着的沟底把光弹进来。SB01 坐在坑底往洞口看，
    // 0.08 / 0.15 / 0.22 三版整幅均值 31–33（分镜 49），洞口两根门柱的内侧与顶板压到 sRGB < 5 的有 8–12%。
    { id: "Bunker", box: { x: -1.15, z: -126.0, w: 4.1, d: 4.2 }, wall: 0, floorY: BUNKER_FLOOR,
      ceil: 1.85, dark: 0.38,
      portals: [{ face: "E", from: -127.4, to: -124.4, bottom: 0, top: 1.73 }] },
  ].map((room) => Object.freeze(room))),
});

/** 渲染侧上限（uniform 数组长度），Script_InteriorSkyOcclusion 的 GLSL 与之同值。 */
export const INTERIOR_LIMITS = Object.freeze({ rooms: 12, portals: 40 });

const FACES = {
  N: { axis: "z", sign: -1 }, S: { axis: "z", sign: 1 },
  W: { axis: "x", sign: -1 }, E: { axis: "x", sign: 1 },
};

function Contains(block, x, y, z, pad = 0.02) {
  const dx = x - block.x, dz = z - block.z, dy = y - (block.y ?? 0);
  const ry = block.ry || 0;
  const c = Math.cos(ry), s = Math.sin(ry);
  // 体块局部系：three 的 rotation.y = ry，局部 → 世界是 (x c + z s, −x s + z c)
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) <= block.w / 2 + pad && Math.abs(lz) <= block.d / 2 + pad
    && Math.abs(dy) <= block.h / 2 + pad;
}

function InnerBox(room, groundAt) {
  const { x, z, w, d } = room.box;
  const half = (room.wall ?? 0.6) / 2;
  const floorY = room.floorY ?? groundAt(x, z);
  return {
    floorY,
    min: [x - w / 2 + half, floorY - 0.6, z - d / 2 + half],
    max: [x + w / 2 - half, floorY + room.ceil, z + d / 2 - half],
  };
}

/** 在一面墙的中线上按体块找缺口。返回 [{ from, to, bottom, top }]（沿墙坐标，高度相对地面）。 */
function FindOpenings(room, face, blocks, groundAt, rooms) {
  const f = FACES[face];
  const { x, z, w, d } = room.box;
  const along = f.axis === "z" ? "x" : "z";
  const plane = f.axis === "z" ? z + f.sign * d / 2 : x + f.sign * w / 2;
  const lo = (along === "x" ? x - w / 2 : z - d / 2) + 0.25;
  const hi = (along === "x" ? x + w / 2 : z + d / 2) - 0.25;
  const heights = [0.35, 0.9, 1.5, 2.1].filter((h) => h < room.ceil - 0.2);
  const step = 0.1;
  const columns = [];
  for (let a = lo; a <= hi + 1e-6; a += step) {
    const px = along === "x" ? a : plane, pz = along === "x" ? plane : a;
    const g = groundAt(px, pz);
    // 墙中线与往里 0.4 m 各探一次：门帘、内侧挂的门板贴着墙里皮，也挡光
    const ix = px - (f.axis === "x" ? f.sign * 0.4 : 0), iz = pz - (f.axis === "z" ? f.sign * 0.4 : 0);
    const open = heights.filter((h) => !blocks.some((b) => Contains(b, px, g + h, pz) || Contains(b, ix, g + h, iz)));
    // 缺口外侧是另一间屋子（屋与屋之间的门）就不算采光口
    const ox = px + (f.axis === "x" ? f.sign * 1.2 : 0), oz = pz + (f.axis === "z" ? f.sign * 1.2 : 0);
    const intoRoom = rooms.some((other) => other !== room
      && Math.abs(ox - other.box.x) < other.box.w / 2 && Math.abs(oz - other.box.z) < other.box.d / 2);
    columns.push({ a, open: intoRoom ? [] : open });
  }
  const openings = [];
  let run = null, gap = 0;
  for (const col of columns) {
    if (col.open.length) {
      if (!run) run = { from: col.a - step / 2, to: col.a + step / 2, hs: new Set() };
      run.to = col.a + step / 2;
      col.open.forEach((h) => run.hs.add(h));
      gap = 0;
    } else if (run && ++gap > 2) {   // 窗棂之类 ≤ 0.2 m 的遮挡不断开一个口子
      openings.push(run); run = null; gap = 0;
    }
  }
  if (run) openings.push(run);
  return openings.map((o) => {
    const hs = [...o.hs].sort((p, q) => p - q);
    return { from: o.from, to: o.to,
      bottom: Math.max(0, hs[0] - 0.3), top: Math.min(room.ceil, hs[hs.length - 1] + 0.3) };
  }).filter((o) => (o.to - o.from) * (o.top - o.bottom) >= 0.25);
}

/**
 * 按布局把房间表展开成渲染侧要的遮蔽体。
 * @param {object} layout MISSION_LAYOUT（别的布局 id 对不上时返回空表 —— 旧白盒夹具不受影响）
 * @param {(x:number,z:number)=>number} groundAt 共享地面采样器（契约 5，不另写高度公式）
 * @returns {Array<{id, min:number[], max:number[], dark:number,
 *   portals:Array<{center:number[], normal:number[], area:number, width:number, height:number}>}>}
 */
export function BuildInteriorVolumes(layout = MISSION_LAYOUT, groundAt = SampleMissionNaturalHeight,
  spec = FIRST_LEVEL_INTERIORS) {
  if (!layout || layout.id !== spec.layoutId) return [];
  const volumes = [];
  for (const room of spec.rooms) {
    const inner = InnerBox(room, groundAt);
    const { x, z, w, d } = room.box;
    const near = layout.blocks.filter((b) => !/Void$/.test(b.id)
      && Math.abs(b.x - x) < w / 2 + Math.max(b.w, b.d) / 2 + 1
      && Math.abs(b.z - z) < d / 2 + Math.max(b.w, b.d) / 2 + 1);
    const portals = [];
    for (const face of ["N", "S", "W", "E"]) {
      const f = FACES[face];
      const explicit = room.portals?.filter((p) => p.face === face);
      const openings = room.portals ? explicit : FindOpenings(room, face, near, groundAt, spec.rooms);
      const plane = f.axis === "z" ? z + f.sign * d / 2 : x + f.sign * w / 2;
      for (const o of openings) {
        const mid = (o.from + o.to) / 2;
        const cx = f.axis === "z" ? mid : plane, cz = f.axis === "z" ? plane : mid;
        const base = room.floorY ?? groundAt(cx, cz);
        const width = o.to - o.from, height = o.top - o.bottom;
        portals.push({
          face, center: [cx, base + (o.bottom + o.top) / 2, cz],
          // 朝屋里的法线（与墙的外法线相反）
          normal: f.axis === "z" ? [0, 0, -f.sign] : [-f.sign, 0, 0],
          width: +width.toFixed(2), height: +height.toFixed(2), area: +(width * height).toFixed(3),
        });
      }
    }
    volumes.push({ id: room.id, min: inner.min, max: inner.max, dark: room.dark, portals });
  }
  return volumes;
}

const Smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/**
 * 室内天光可见度的 JS 镜像（与 Script_InteriorSkyOcclusion 的 GLSL **逐项同式**，改一边改另一边）。
 * 纯 Node 门禁用它量「屋子深处 / 门口 / 外墙面 / 屋面」的读数。
 * @param {ReturnType<typeof BuildInteriorVolumes>} volumes
 * @param {number[]} p 世界坐标 [x,y,z]
 * @param {typeof INTERIOR_SKY} tuning
 */
export function InteriorSkyVisibility(volumes, p, tuning) {
  let vis = 1;
  for (const room of volumes) {
    const qx = Math.max(room.min[0] - p[0], p[0] - room.max[0]);
    const qy = Math.max(room.min[1] - p[1], p[1] - room.max[1]);
    const qz = Math.max(room.min[2] - p[2], p[2] - room.max[2]);
    const inside = (1 - Smooth(0.02, tuning.featherH, Math.max(qx, qz))) * (1 - Smooth(0, tuning.featherTop, qy));
    if (inside <= 0) continue;
    let light = 0;
    for (const portal of room.portals) {
      const d = [p[0] - portal.center[0], p[1] - portal.center[1], p[2] - portal.center[2]];
      const d2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
      const len = Math.sqrt(d2) || 1;
      const cos = d2 < 1e-6 ? 1 : (d[0] * portal.normal[0] + d[1] * portal.normal[1] + d[2] * portal.normal[2]) / len;
      const facing = Math.max(0, cos * (1 - tuning.cosFloor) + tuning.cosFloor);
      light += tuning.gain * portal.area * facing / (Math.PI * (d2 + portal.area * tuning.soften));
    }
    const roomVis = Math.min(1, Math.max(room.dark, room.dark + light));
    vis = Math.min(vis, 1 + (roomVis - 1) * inside);
  }
  return 1 + (vis - 1) * tuning.strength;
}
