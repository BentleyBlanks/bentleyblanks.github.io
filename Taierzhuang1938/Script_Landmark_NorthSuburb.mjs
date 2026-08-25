// 北关：坝墙（圩子）+ 两处圩门 + 北关大街 + 北庙 + 沿街村屋。工作包 C2 专属文件。
// 契约见 Script_LandmarkRegistry.mjs 头注。spec = Data_Tengxian.NORTH_SUBURB 整块。
//
// 这一带是第六关（北门突围）的第一程：玩家从望阙门 (-145, -305) 出城、过濠上木桥，
// 沿北关大街往北跑进城北麦地。所以本文件里有两样东西是**玩法件**而不是布景：
//   ① 桥头引道 —— 濠外岸顶（y=0）与濠外原野（y=-1.2）之间有一道 1.2 m 的直坎，
//      桥的碰撞顶面也在 y=0。Rapier 的自动抬腿只有 0.55 m，没有引道玩家出了北门
//      就是往下跳一米二、回头再也上不来（西关那一头 WP-B4 已经踩过同一个坑）。
//   ② 两处圩门 —— 门洞里**不许有任何碰撞体**，净宽必须是数据给的 3.2 / 2.8 m。
//      门柱一律排在门洞净宽之外，过木、门楣填充、门头小瓦顶全部不登记 Solid。
//
// 三条高程/坐标上的坑（前两批踩出来的，这里逐条对上）：
//   ① 濠外原野压在 y=-1.2，而 AddWall / AddRoomBlock / AddHardMountainRoof / AddCompound
//      **全部从 y=0 起砌、没有 baseY 参数**。北关脚下没有 OUTER_PADS 垫地
//      （`NorthMission` 那一块在 x∈[-140,20] z∈[-475,-365]，只擦到街的东侧），
//      所以本文件的每一件构件都自己吃 baseY，一件都不复用那几个从 y=0 起砌的构件。
//      能直接用的只有带 baseY 的：AddPoplar / AddCypress / AddYardWear / AddRoadWear /
//      AddVillageLife / AddStalkStack / AddWattleFence。
//   ② 局部坐标一律用 **PlaceGeometry 那一套**：ry=0 时局部 +z = 世界 +z（南）。
//      AddCompound / AddRoomBlock 的门脸排在局部 -z，差 180°，两套不许混。
//      北庙 ry=0 = 山门开在南面 = 坐北朝南。
//   ③ 数据里 `street.toZ = -328` 正压在濠槽的外岸线上。**北门这一段的护城河
//      没有外凸**（GATE_BULGE 只在 |x|≤26 处生效，而北门在 x=-145 —— 见
//      NORTH_MOAT_OUTER 的长注），濠槽实测在 z∈[-318, -328.5]、槽底 -4.80；
//      而北门的桥被摆到了 (0, -339.25)，离门 145 m 且落在濠外的旱地上。
//      这两条都在共享文件里，本包绕开：街停在濠外岸前 1.5 m，
//      桥头引道改成「探到 tag=bridge 的碰撞体才建」（FindBridge）。
//
// 分区（SetSector）：派发处只给了 farSink 一个分区键，660 m 的坝墙全挤在一格里
// 视锥剔除等于没有。本文件按 150 m 自己切格（NorthSector，镜像 Script_TengxianCity
// 的 SectorKey），退出前把两个 sink 的分区都复位成 ""（派发处紧接着也是这么做的）。

import * as THREE from "three";
import { MakeBox, MergeGeometries, PlaceGeometry, TILE_METERS, BRICK_UV_GRID } from "./Script_Geo.mjs";
import { Mulberry32, HashString } from "./Script_Noise.mjs";
import { AddPoplar, AddCypress } from "./Script_World.mjs";
import {
  AddRoadWear, AddYardWear, AddVillageLife, AddStalkStack, AddWattleFence,
} from "./Script_LivedInProps.mjs";

// ---------------------------------------------------------------------------
// 镜像常量
//
// 契约禁止 import Data_Tengxian / Script_TengxianCity，下面这几个数是从
// CITY.platformEdge(318) / GATE_BULGE(16) / MOAT.width(10.5) 与 BuildMoat 的桥几何
// 算出来的。那几个数一旦变了这里要跟着改（算式写在各行后面）。
// ---------------------------------------------------------------------------

/**
 * 北门外的濠外岸 z = -(platformEdge 318 + MOAT.width 10.5) = **-328.5，没有外凸**。
 *
 * 这里跟西关不一样，值得写清楚：`MoatBulge(along)` 的 along 是
 * `SideAndAlong` 给的**绝对坐标**（北边 = x），只在 |along| ≤ 26 时才让濠外凸 16 m。
 * 而北门在 x=-145 —— 于是**北门这一段的护城河根本没有外凸**，
 * 濠槽实测就在 z∈[-318, -328.5]（本包实测：z=-321…-326 槽底 -4.80）。
 * 外凸出现在 x≈0，也就是北墙的正中间，那儿并没有门。
 *
 * 连带的：`BuildMoat` 的桥按 `cx = dirX * (rIn + MOAT.width/2)` 落位，北门 dirX=0
 * ⇒ **桥被摆在 (0, -339.25)，离北门 145 m**，而且摆在濠外的旱地上。
 * 也就是说今天的北门外是「一条 4.8 m 深的干壕、没有桥」。
 * 这两条都在共享文件里，本包只能绕开：桥头引道改成**探到桥才建**（见 FindBridge），
 * 探不到就把街停在濠外岸前 1.5 m。整件事已写进交付报告的「需主会话改共享文件」。
 */
const NORTH_MOAT_OUTER = -328.5;
/** = Script_TengxianCity.SECTOR_SIZE。只用来切合批分区，对不齐也只是分区键不同。 */
const SECTOR_SIZE = 150;

/**
 * 路面比田面高这么多。
 *
 * 不是为了好看：BuildMarchGround 的返青麦垄是 0.3 m 厚的水平板，在起伏地上
 * 会浮到局部地面上方 0.4—0.5 m，而它的豁免表里**只有铁路走廊与西关大街**
 * （Script_TengxianCity.BuildMarchGround），北关大街没有 —— 麦垄照样铺在街上。
 * 正解是给那张表补一行（已写进交付报告），**补完之后这里应当降回 0.10 左右**，
 * 并可以删掉 RoadRibbon 里的路基碰撞盒。
 */
const ROAD_CROWN = 0.22;

/** 沿街村屋。side = -1 街西 / +1 街东；straw = 草顶（最穷的一间）。 */
const HOUSES = Object.freeze([
  // 街西两间：脚下在 NorthMission 垫地的过渡带边缘（地面抬起约 0.2 m），台明吃得住
  { z: -400, side: -1, w: 11.5, d: 6.0, straw: false, openBay: 1 },
  { z: -434, side: -1, w: 9.5, d: 5.6, straw: true, openBay: -1 },
  // 街东一间：z=-505 已出垫地的 feather，脚下是干净的原野
  { z: -505, side: 1, w: 10.5, d: 5.8, straw: false, openBay: 0 },
]);

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

/** 局部 → 世界（PlaceGeometry 那一套：局部 +x=(cos,-sin)，局部 +z=(sin,cos)）。 */
function Frame(x, z, ry) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  return (lx, lz) => ({ x: x + cos * lx + sin * lz, z: z - sin * lx + cos * lz });
}

/** 一块方料。size = [w,h,d]，pose 直接透给 PlaceGeometry。 */
function Put(sink, material, size, tile, seed, pose, grid = null) {
  sink.Add(material, PlaceGeometry(MakeBox(size[0], size[1], size[2], tile, seed, grid), pose));
}

/** 合批分区键。镜像 Script_TengxianCity.SectorKey。 */
function NorthSector(x, z) {
  return `S${Math.floor(x / SECTOR_SIZE)}_${Math.floor(z / SECTOR_SIZE)}`;
}

/**
 * 一片四边形。**顶点顺序 = 法线朝向，写反了整片是隐形的**（WP-B4 用一整条
 * 西关大街的失踪换来的教训）。mode 决定 UV 怎么投：
 *   "xz" 水平面（俯视投影）；"zy" 竖直面且沿线方向是 z（南北向路的裙边）。
 */
function Quad(a, b, c, d, tile = TILE_METERS.ground, mode = "xz") {
  const g = new THREE.BufferGeometry();
  const pts = [a, b, c, a, c, d];
  const pos = new Float32Array(18);
  const uv = new Float32Array(12);
  for (let i = 0; i < 6; i += 1) {
    pos[i * 3] = pts[i][0]; pos[i * 3 + 1] = pts[i][1]; pos[i * 3 + 2] = pts[i][2];
    if (mode === "zy") {
      uv[i * 2] = pts[i][2] / tile;
      uv[i * 2 + 1] = pts[i][1] / tile;
    } else {
      uv[i * 2] = pts[i][0] / tile;
      uv[i * 2 + 1] = pts[i][2] / tile;
    }
  }
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/**
 * 关卡切片过滤。编辑器的平地替身没有 InBounds，一律按「在」处理。
 *
 * pad 一律用 260 —— 与派发处 `InBounds(street.x, stockade.z, 260)` 同一个数：
 * 派发是**整块**过的，本包要么整块在（L4 / L6）要么整块不在，逐件再收窄
 * 只会造出「有墙没路」「有庙没树」这种半拉子北关。今天这一层其实一件都没裁掉，
 * 留着是为了 bounds 改动时不至于把 660 m 的墙整条建进一个只到 z=-200 的切片。
 */
const VIEW_PAD = 260;
function MakeInView(host) {
  return (x, z, pad = VIEW_PAD) => (
    typeof host.InBounds === "function" ? host.InBounds(x, z, pad) : true);
}

// ---------------------------------------------------------------------------
// 坝墙（圩子）
// ---------------------------------------------------------------------------

/**
 * 夯土圩子：高 2.2 / 顶宽 0.5 / 底宽 1.1（数据给死，不许另起炉灶）。
 *
 * 做法照 Script_World.AddZhaiWall，但**不能直接调它** —— 那个函数只有一个
 * 标量 baseY，而这道墙横跨 660 m 的起伏原野（濠外 ±0.55 m 的噪声）。
 * 一个 baseY 的话半条墙悬空、半条墙埋进土里。所以这里逐段采 OuterHeight，
 * 并且每段往地里多埋 0.5 m，让相邻两段的高差不至于在墙脚漏出缝。
 *
 * 战损：1938 年 3 月这圈外郭早已衰败（志载明正德七年筑郭护四关，到 1938 年
 * 只剩矮土寨墙，日方实测东侧那一段高 2 m、顶宽 0.4 m）。三处塌口按种子摆，
 * 一律避开圩门 14 m —— 玩法上圩门才是通道，塌口只是「这墙拦不住谁」的说明。
 */
function Stockade(host, s, gates, ctx) {
  const rnd = Mulberry32(HashString("north:zhai"));
  const inView = MakeInView(host);
  const damage = ctx.damage ?? 0.3;
  const height = s.height, thick = (s.topWidth + s.baseWidth) / 2;
  const z = s.z;

  // 塌口：位置在整条墙上按种子撒，避开圩门
  const breaches = [];
  for (let i = 0; i < 3; i += 1) {
    for (let tries = 0; tries < 12; tries += 1) {
      const bx = s.fromX + 24 + rnd() * (s.toX - s.fromX - 48);
      if (gates.some((g) => Math.abs(bx - g.x) < g.width / 2 + 14)) continue;
      breaches.push({ at: bx, width: 9 + rnd() * 7 });
      break;
    }
  }

  const segLen = 3.0;
  const total = s.toX - s.fromX;
  const segs = Math.max(4, Math.round(total / segLen));
  const step = total / segs;
  const near = [];                     // 圩门左右各 22 m：进 host.sink（要投影子）
  const farBySector = new Map();       // 其余：进 host.farSink，按 150 m 切格

  for (let i = 0; i < segs; i += 1) {
    const cx = s.fromX + step * (i + 0.5);
    // 圩门那一段整段让开：门垛自己把缺口填上（见 StockadeGate 的 clearSpan）
    if (gates.some((g) => Math.abs(cx - g.x) < g.clearSpan / 2)) continue;
    if (!inView(cx, z, 260)) continue;
    let h = height;
    for (const b of breaches) {
      const d = Math.abs(cx - b.at);
      if (d < b.width / 2) {
        h = Math.min(h, height * (0.10 + 0.90 * Math.pow(d / (b.width / 2), 1.5)));
      }
    }
    // 土墙顶本来就是参差的，再叠一档破损档位
    h *= 0.93 + rnd() * 0.13 - damage * 0.06;
    const baseY = host.OuterHeight(cx, z);
    const buried = 0.5;                // 往地里埋半米：相邻段高差不在墙脚漏缝
    // 墙面往前后各错开一点点：一条 660 m 的完美平面在出图上读成三合板围挡，
    // 不是夯的土（第一版实拍 C2_Stockade_Breach.png 的主要问题）。
    const zJit = (rnd() - 0.5) * 0.16;
    const parts = [
      PlaceGeometry(MakeBox(step * 1.04, h + buried, thick, TILE_METERS.adobe, `north:zhai${i}`),
        { x: cx, y: baseY + (h - buried) / 2, z: z + zJit }),
      // 墙脚的护坡土：夯土圩子不是一块立起来的板，脚下总堆着塌下来的土。
      // 它同时把「每段各自采地高」留下的墙脚缝盖住。
      PlaceGeometry(MakeBox(step * 1.06, 0.9, s.baseWidth * (1.7 + rnd() * 0.5),
        TILE_METERS.adobe, `north:zhaiFoot${i}`),
      { x: cx, y: baseY - 0.44 + Math.min(0.30, h * 0.16), z: z + zJit * 0.6 }),
    ];
    const geo = MergeGeometries(parts);
    const nearGate = gates.some((g) => Math.abs(cx - g.x) < 22);
    if (nearGate) {
      near.push(geo);
    } else {
      const key = NorthSector(cx, z);
      if (!farBySector.has(key)) farBySector.set(key, []);
      farBySector.get(key).push(geo);
    }
    if (h > height * 0.55) {
      host.sink.Solid(cx, baseY + h / 2, z, step / 2, h / 2, s.baseWidth / 2, "zhaiWall");
      // 掩体点每三段一个（≈9 m）：一道 660 m 的墙每 3 m 插一个掩体点，
      // AI 的掩体表会被这一道墙灌满两百多条，其他地方的掩体全被挤到后面去。
      if (i % 3 === 0) host.sink.Cover(cx, z, baseY + h, 0, 1);
    }
  }

  if (near.length) {
    host.sink.SetSector(NorthSector(gates[0].x, z));
    host.sink.Add("ZhaiEarth", MergeGeometries(near));
    host.sink.SetSector("");
  }
  for (const [key, list] of farBySector) {
    host.farSink.SetSector(key);
    host.farSink.Add("ZhaiEarth", MergeGeometries(list));
  }
  host.farSink.SetSector("");
}

/**
 * 圩门：两座土坯门垛 + 木门框 + 门头小瓦顶 + 门枕石，门洞里空无一物。
 *
 * **净宽 = 数据给的 g.width，一分不许少**：门柱排在净宽之外（内侧面正好压在
 * ±width/2 上），过木 / 门楣填充 / 小瓦顶一律不登记 Solid —— 登记了导航位图
 * 就把整个门洞当成实体，玩家在门口撞空气。
 *
 * 形制一档：村圩子的门是「两个土垛夹一副木门」，不是城门楼。门垛比墙高 1.2 m，
 * 门头压一顶两坡小青瓦，够在剪影上把「门」和「墙」分开就行。
 */
function StockadeGate(host, s, g, ctx) {
  const sink = host.sink;
  const z = s.z;
  const open = g.width;
  const wing = 2.6;                     // 门垛宽
  const pierH = s.height + 1.2;         // 3.4 m：比墙高一档，剪影上认得出
  const depth = 1.5;                    // 门垛沿 z 的厚度（比墙厚，门口本来就加厚）
  const openH = 2.55;                   // 门洞净高
  const seed = `north:gate${g.x}`;
  const rnd = Mulberry32(HashString(seed));
  const baseY = host.OuterHeight(g.x, z);
  const damage = ctx.damage ?? 0.3;

  // --- 门垛 ---
  for (const side of [-1, 1]) {
    const px = g.x + side * (open / 2 + wing / 2);
    Put(sink, "ZhaiEarth", [wing, pierH + 0.6, depth], TILE_METERS.adobe,
      `${seed}:pier${side}`, { x: px, y: baseY + (pierH - 0.6) / 2, z });
    sink.Solid(px, baseY + pierH / 2, z, wing / 2, pierH / 2, depth / 2, "zhaiWall");
    sink.Cover(px, z, baseY + pierH, 0, 1);
    // 门垛外皮的条石碱脚：村圩子唯一舍得用石头的地方就是门口
    Put(sink, "Stone", [wing + 0.16, 0.44, depth + 0.16], TILE_METERS.stone,
      `${seed}:plinth${side}`, { x: px, y: baseY + 0.14, z });
    // 门枕石（朝城内那一侧）
    const kx = g.x + side * (open / 2 + 0.28);
    Put(sink, "Stone", [0.50, 0.42, 0.56], TILE_METERS.stone,
      `${seed}:dun${side}`, { x: kx, y: baseY + 0.21, z: z + depth / 2 + 0.18 });
  }

  // --- 木门框：门柱内侧面正好压在净宽上，门洞一分不占 ---
  for (const side of [-1, 1]) {
    const jx = g.x + side * (open / 2 + 0.13);
    Put(sink, "WoodBeam", [0.26, openH + 0.30, 0.30], TILE_METERS.wood,
      `${seed}:jamb${side}`, { x: jx, y: baseY + (openH + 0.30) / 2, z });
    sink.Solid(jx, baseY + (openH + 0.3) / 2, z, 0.13, (openH + 0.3) / 2, 0.15, "villagePost");
  }
  // 过木 + 门楣填充：**不登记 Solid**
  Put(sink, "WoodBeam", [open + 0.9, 0.30, 0.36], TILE_METERS.wood,
    `${seed}:lintel`, { x: g.x, y: baseY + openH + 0.15, z });
  Put(sink, "ZhaiEarth", [open + 0.5, pierH - openH - 0.30, depth * 0.8], TILE_METERS.adobe,
    `${seed}:infill`, { x: g.x, y: baseY + openH + 0.30 + (pierH - openH - 0.30) / 2, z });

  // --- 门头小瓦顶（两坡，无起翘无脊兽：村圩门不是庙门也不是城门楼）---
  const roofW = open + wing * 2 + 0.9;
  const roofD = depth + 1.5;
  const rise = 0.62;
  const slope = Math.atan2(rise, roofD / 2);
  for (const sd of [-1, 1]) {
    Put(sink, "RoofTile", [roofW, 0.12, Math.hypot(roofD / 2, rise) + 0.35], TILE_METERS.roof,
      `${seed}:roof${sd}`, { x: g.x, y: baseY + pierH + rise / 2, z: z + sd * roofD / 4, rx: sd * slope });
  }
  Put(sink, "RoofTile", [roofW, 0.20, 0.34], TILE_METERS.roof,
    `${seed}:ridge`, { x: g.x, y: baseY + pierH + rise + 0.06, z });

  // --- 门板：一扇歪着挂在门轴上、一扇早被卸走。突围那一夜这门是敞着的 ---
  if (damage < 0.8) {
    const leafW = open / 2 - 0.08;
    Put(sink, "WoodDoor", [leafW, openH - 0.12, 0.08], TILE_METERS.wood,
      `${seed}:leaf`, {
        x: g.x - open / 2 + leafW * 0.28, y: baseY + (openH - 0.12) / 2,
        z: z + depth / 2 + 0.42, ry: 1.05 + rnd() * 0.2,
      });
  }

  // --- 门里门外各一片被踩实的地：一座门有没有人走，全靠这两片说话 ---
  for (const sd of [-1, 1]) {
    AddYardWear(sink, {
      x: g.x, z: z + sd * 4.6, baseY: host.OuterHeight(g.x, z + sd * 4.6) + 0.02,
      seed: `${seed}:wear${sd}`, radius: Math.min(open * 1.1, 3.6),
    });
  }
}

// ---------------------------------------------------------------------------
// 北关大街
// ---------------------------------------------------------------------------

/**
 * 南北向土路：贴地的带子 + 两侧裙边 + 车辙。
 *
 * 铺成带子而不是一块块方板：濠外原野有 ±0.55 m 起伏，加上 NorthMission 垫地
 * （弘道院那一块）的过渡带，一段一段的平板会在过渡带里读成台阶。
 */
function RoadRibbon(host, { x, fromZ, toZ, width, seed }) {
  const half = width / 2;
  const span = toZ - fromZ;
  const steps = Math.max(2, Math.round(span / 4));
  const top = [], skirt = [];
  const drop = 0.65;
  let prev = null;
  for (let i = 0; i <= steps; i += 1) {
    const z = fromZ + (span * i) / steps;
    const y = host.OuterHeight(x, z) + ROAD_CROWN;
    const node = { z, y };
    if (prev) {
      // 顶面：按 +x → -x 排，叉积朝上（写反了整条路背面剔除掉，只剩车辙浮在田里）
      top.push(Quad(
        [x + half, prev.y, prev.z], [x - half, prev.y, prev.z],
        [x - half, node.y, node.z], [x + half, node.y, node.z]));
      // 东裙边（法线 +x）
      skirt.push(Quad(
        [x + half, prev.y, prev.z], [x + half, node.y, node.z],
        [x + half, node.y - drop, node.z], [x + half, prev.y - drop, prev.z],
        TILE_METERS.ground, "zy"));
      // 西裙边（法线 -x）
      skirt.push(Quad(
        [x - half, node.y, node.z], [x - half, prev.y, prev.z],
        [x - half, prev.y - drop, prev.z], [x - half, node.y - drop, node.z],
        TILE_METERS.ground, "zy"));
    }
    prev = node;
  }
  host.sink.Add("DirtRoad", MergeGeometries(top));
  host.sink.Add("DirtRoad", MergeGeometries(skirt));
  // 路基碰撞：贴地面板本来不登记碰撞（走解析地形），但这条路垫了 ROAD_CROWN，
  // 不登记的话人是踩在路面以下走的、车辙比脚面还高。
  //
  // **盒长必须跟着路面的采样步长走（4 m），不能图省事拉到 10 m**：盒顶是平的，
  // 相邻两盒的落差 = 这一段地面的落差。北关大街正好横穿 NorthMission 垫地
  // （弘道院那一块）的过渡带 —— 1.2 m 摊在 18 m 上，10.5 m 一盒时 z≈-486
  // 处两盒之间是一道 0.79 m 的直坎（实测），超过 autostep 0.55，
  // 玩家往回走要卡住。4 m 一盒之后同一处只剩 0.27 m。
  const solids = Math.max(1, Math.round(span / 4));
  for (let i = 0; i < solids; i += 1) {
    const cz = fromZ + (span * (i + 0.5)) / solids;
    const cy = host.OuterHeight(x, cz) + ROAD_CROWN;
    host.sink.Solid(x, cy - 0.24, cz, half, 0.24, (span / solids) / 2, "embankment");
  }
  // 车辙、脚迹：分段各按本段地高给 baseY
  const chunks = Math.max(2, Math.round(span / 60));
  for (let c = 0; c < chunks; c += 1) {
    const cz = fromZ + (span * (c + 0.5)) / chunks;
    AddRoadWear(host.sink, {
      x, z: cz, ry: Math.PI / 2, length: span / chunks, width,
      baseY: host.OuterHeight(x, cz) + ROAD_CROWN + 0.015, seed: `${seed}:wear${c}`,
    });
  }
}

/**
 * 街轴上到底有没有桥。
 *
 * 不能照抄一份桥的坐标常量：北门的桥今天根本不在门轴上（见 NORTH_MOAT_OUTER 的注释），
 * 照常量建引道的话，会在濠外一百多米的空地上凭空堆起一座土坡（本包第一版实测：
 * z=-350 处 topAt 抬到 -0.21，四周是 -1.1 的平地）。
 * 桥的碰撞体是 BuildMoat 登记的（tag "bridge"），而 BuildMoat 在 BuildOutskirts
 * 之前跑 —— 所以这里直接去 sink 里问一句「这条轴上有桥吗」，比抄坐标可靠得多：
 * 哪天主会话把桥摆回门轴上，引道自动就跟着回来了。
 */
function FindBridge(host, x, zMin, zMax) {
  const list = (host.sink && host.sink.colliders) || [];
  let best = null;
  for (const b of list) {
    if (b.tag !== "bridge") continue;
    if (x < b.min[0] - 1.5 || x > b.max[0] + 1.5) continue;
    if (b.max[2] < zMin || b.min[2] > zMax) continue;
    if (!best || b.max[1] > best.max[1]) best = b;
  }
  return best;
}

/**
 * 桥头引道。
 *
 * 濠上木桥的碰撞顶面在 y=0（可见桥面 -0.16），濠外原野在 -1.2 —— 中间是一道
 * 一米二的直坎，而过了桥就是第六关玩家出城的第一步。这里砌一段夯土引道：
 * 四五级踏步，每级 ≤0.30 m，面宽从街宽收到桥宽。既是形制（桥头本来就有引道），
 * 也是**玩法修复**：没有它，出了城是往下跳，回身就再也上不来（西关那一头同理）。
 *
 * @returns {number|null} 引道北端的 z（街的南端停在这里）；轴上没桥就返回 null
 */
function BridgeApproach(host, { x, width, seed }) {
  const bridge = FindBridge(host, x, -400, -320);
  if (!bridge) return null;                 // 轴上没桥：别在空地上堆土坡
  const deckY = bridge.max[1] - 0.16;       // 碰撞顶比可见桥面高 0.16
  const northZ = bridge.min[2];
  const groundY = host.OuterHeight(x, northZ - 3);
  const rise = (deckY - 0.05) - groundY;
  if (rise < 0.3) return northZ;            // 编辑器平地替身：没有濠，也没有坎
  const steps = Math.max(3, Math.ceil(rise / 0.30));
  const run = 1.55;
  const startZ = northZ - steps * run;
  for (let i = 0; i < steps; i += 1) {
    const topY = groundY + (rise * (i + 1)) / steps;
    const w = width - (width - 4.6) * ((i + 1) / steps);
    const h = topY - (groundY - 0.6);
    const cz = northZ - run * (i + 0.5);
    Put(host.sink, "DirtRoad", [w, h, run * 1.04], TILE_METERS.ground,
      `${seed}:step${i}`, { x, y: topY - h / 2, z: cz });
    host.sink.Solid(x, topY - h / 2, cz, w / 2, h / 2, run * 0.52, "embankment");
  }
  // 桥头护坡石一对：把引道的边收住
  for (const sd of [-1, 1]) {
    Put(host.sink, "Stone", [0.44, 0.5, 2.4], TILE_METERS.stone,
      `${seed}:kerb${sd}`, { x: x + sd * 2.7, y: deckY - 0.32, z: northZ + 1.3 });
  }
  return startZ;
}

// ---------------------------------------------------------------------------
// 沿街村屋 / 铺面
// ---------------------------------------------------------------------------

/**
 * 一间土坯村屋（临街的那几间兼做铺面）。
 *
 * 不走 AddRoomBlock / AddHardMountainRoof：那两个都从 y=0 起砌，而这几间站在
 * y≈-1.2 的濠外原野上。条石台明往地里埋 0.55 m，把四角高差与散水一起吃掉 ——
 * 北关这一带正好压在 NorthMission 垫地的过渡带上，四角能差出三四十公分。
 *
 * 「临街」的识别语言只有两条：整间可拆的排门板，与檐下挑出的幌子。
 * 关厢是残响不是连排店面，所以只有 openBay >= 0 的那间做排门板，其余是民居窗。
 */
function VillageHouse(host, {
  x, z, ry, width, depth, seed, damage = 0.25, straw = false, openBay = -1,
}) {
  const sink = host.sink;
  const rnd = Mulberry32(HashString(seed));
  const At = Frame(x, z, ry);
  const sin = Math.sin(ry), cos = Math.cos(ry);
  // 四角取**中值**起砌（不是最高的那一角）：街西那两间正压在 NorthMission 垫地的
  // 过渡带上，四角实测差 0.44 m。按最高角起砌的话，低的那一角要迈 0.44+0.26=0.70 m
  // 才上得了台明 —— 超过 autostep 0.55，门口成了看得见上不去的台子。
  // 取中值之后最大只剩 0.46 m；高的那一角由台明 1.10 m 的埋深吃掉。
  let hi = -1e9, lo = 1e9;
  for (const lx of [-width / 2, width / 2]) {
    for (const lz of [-depth / 2, depth / 2]) {
      const p = At(lx, lz);
      const y = host.OuterHeight(p.x, p.z);
      hi = Math.max(hi, y); lo = Math.min(lo, y);
    }
  }
  const baseY = (hi + lo) / 2;
  const floorY = baseY + 0.24;                      // 地坪不低于街（路冠 0.22）
  const eave = 2.44 + rnd() * 0.26;                 // 檐口 2.4—2.8（Data_HistoryMaterial）
  const rise = depth * 0.5 * 0.52;                  // 硬山坡 ~27.5°
  const bays = Math.max(2, Math.round(width / 3.3));// 开间 3.0—3.6
  const bayW = width / bays;

  // --- 台明：条石一圈，埋 0.55 m ---
  Put(sink, "Stone", [width + 0.8, 1.10, depth + 1.2], TILE_METERS.stone,
    `${seed}:podium`, { x, y: floorY - 0.55, z, ry });
  sink.Solid(x, floorY - 0.55, z, (width + 0.8) / 2, 0.55, (depth + 1.2) / 2,
    "villageFoundation", ry);

  // --- 后檐墙 ---
  const back = At(0, -depth / 2 + 0.2);
  Put(sink, "Adobe", [width, eave, 0.40], TILE_METERS.adobe,
    `${seed}:back`, { x: back.x, y: floorY + eave / 2, z: back.z, ry });
  sink.Solid(back.x, floorY + eave / 2, back.z, width / 2, eave / 2, 0.20, "wall", ry);
  sink.Cover(back.x, back.z, floorY + eave * (1 - damage * 0.3), -sin, -cos);

  // --- 两山墙 + 五级硬山 ---
  //
  // 山墙必须**排在屋面的外沿上**，不能排在墙心线上：硬山的意思就是山墙把屋面
  // 两端封死、再高出去一点点。第一版把山墙摆在 ±(width/2-0.2)、屋面却宽出
  // width+0.9，于是那五级台阶从瓦面**中间**戳出来，出图上读成「屋顶上撒了一排小方块」
  // 而不是一道山墙线（实拍取证 C2_Houses.png 第一版）。
  // 现在：山墙外皮 = width/2+0.34 = 屋面半宽，两者正好收在同一条边上。
  const gableOff = width / 2 + 0.17;
  const roofW = width + 0.68;
  for (const s of [-1, 1]) {
    const p = At(s * gableOff, 0);
    Put(sink, "Adobe", [0.40, eave, depth], TILE_METERS.adobe,
      `${seed}:gw${s}`, { x: p.x, y: floorY + eave / 2, z: p.z, ry });
    sink.Solid(p.x, floorY + eave / 2, p.z, 0.20, eave / 2, depth / 2, "wall", ry);
    const stepsN = 5, segD = depth / stepsN, parts = [];
    for (let i = 0; i < stepsN; i += 1) {
      const t = (i + 0.5) / stepsN;
      const h = rise * (1 - Math.abs(t * 2 - 1)) + 0.14;
      parts.push(PlaceGeometry(
        MakeBox(0.34, h, segD * 1.02, TILE_METERS.adobe, `${seed}:gb${s}${i}`),
        { x: 0, y: h / 2, z: -depth / 2 + segD * (i + 0.5) }));
    }
    sink.Add("Adobe", PlaceGeometry(MergeGeometries(parts),
      { x: p.x, y: floorY + eave, z: p.z, ry }));
  }

  // --- 前檐：柱础 + 檐柱 + 檐枋 ---
  const postLz = depth / 2 - 0.14;
  for (let i = 0; i <= bays; i += 1) {
    const p = At(-width / 2 + bayW * i, postLz);
    Put(sink, "Stone", [0.32, 0.22, 0.32], TILE_METERS.stone,
      `${seed}:pb${i}`, { x: p.x, y: floorY + 0.11, z: p.z, ry });
    Put(sink, "WoodBeam", [0.16, eave - 0.22, 0.16], TILE_METERS.wood,
      `${seed}:po${i}`, { x: p.x, y: floorY + 0.22 + (eave - 0.22) / 2, z: p.z, ry });
    sink.Solid(p.x, floorY + eave / 2, p.z, 0.12, eave / 2, 0.12, "villagePost", ry);
  }
  const lintel = At(0, postLz);
  Put(sink, "WoodBeam", [width + 0.3, 0.24, 0.20], TILE_METERS.wood,
    `${seed}:lintel`, { x: lintel.x, y: floorY + eave - 0.12, z: lintel.z, ry });

  // --- 门脸 ---
  for (let b = 0; b < bays; b += 1) {
    const lx = -width / 2 + bayW * (b + 0.5);
    const p = At(lx, depth / 2 - 0.07);
    if (b === openBay) {
      // 卸了板的那一间：门槛石 + 斜靠柱子的门板，玩家能走进去（不摆碰撞）
      const sill = At(lx, depth / 2 - 0.06);
      Put(sink, "Stone", [bayW - 0.5, 0.15, 0.44], TILE_METERS.stone,
        `${seed}:sill${b}`, { x: sill.x, y: floorY + 0.075, z: sill.z, ry });
      const lean = At(lx + bayW * 0.34, depth / 2 + 0.34);
      Put(sink, "WoodDoor", [0.36, 1.90, 0.06], TILE_METERS.wood,
        `${seed}:lean${b}`, { x: lean.x, y: floorY + 0.95, z: lean.z, ry, rx: 0.13 });
      continue;
    }
    if (openBay >= 0) {
      // 上了板的间：一排竖木板（板宽 ~0.52，一间三米多排六七块）
      const planks = Math.max(4, Math.round(bayW / 0.52));
      const inner = bayW - 0.36;
      const pw = inner / planks;
      const stack = [];
      for (let k = 0; k < planks; k += 1) {
        stack.push(PlaceGeometry(
          MakeBox(pw * 0.94, eave - 0.28, 0.055, TILE_METERS.wood, `${seed}:pk${b}${k}`),
          { x: -inner / 2 + pw * (k + 0.5), y: 0 }));
      }
      sink.Add("WoodDoor", PlaceGeometry(MergeGeometries(stack),
        { x: p.x, y: floorY + 0.06 + (eave - 0.28) / 2, z: p.z, ry }));
      sink.Solid(p.x, floorY + eave / 2, p.z, bayW / 2, eave / 2, 0.09, "door", ry);
      continue;
    }
    // 纯民居的门脸：明间板门，次间槛墙 + 直棂窗（窗背板挡住黑洞）
    const isDoor = b === Math.floor(bays / 2);
    if (isDoor) {
      Put(sink, "WoodDoor", [Math.min(bayW - 0.6, 1.5), eave - 0.35, 0.09], TILE_METERS.wood,
        `${seed}:door${b}`, { x: p.x, y: floorY + (eave - 0.35) / 2, z: p.z, ry });
      Put(sink, "Adobe", [bayW, 0.42, 0.38], TILE_METERS.adobe,
        `${seed}:over${b}`, { x: p.x, y: floorY + eave - 0.20, z: p.z, ry });
      sink.Solid(p.x, floorY + eave / 2, p.z, bayW / 2, eave / 2, 0.19, "door", ry);
    } else {
      const sillH = 1.0;
      Put(sink, "Adobe", [bayW, sillH, 0.38], TILE_METERS.adobe,
        `${seed}:sw${b}`, { x: p.x, y: floorY + sillH / 2, z: p.z, ry });
      const winH = eave - sillH - 0.42;
      const win = At(lx, depth / 2 - 0.24);
      Put(sink, "WoodBeam", [bayW - 0.42, winH, 0.06], TILE_METERS.wood,
        `${seed}:pane${b}`, { x: win.x, y: floorY + sillH + winH / 2, z: win.z, ry });
      const bars = [];
      for (let m = 0; m < 4; m += 1) {
        bars.push(PlaceGeometry(
          MakeBox(0.07, winH, 0.08, TILE_METERS.wood, `${seed}:bar${b}${m}`),
          { x: (m / 3 - 0.5) * (bayW - 0.68) }));
      }
      sink.Add("WoodBeam", PlaceGeometry(MergeGeometries(bars),
        { x: p.x, y: floorY + sillH + winH / 2, z: p.z, ry }));
      Put(sink, "Adobe", [bayW, 0.42, 0.38], TILE_METERS.adobe,
        `${seed}:hd${b}`, { x: p.x, y: floorY + eave - 0.21, z: p.z, ry });
      sink.Solid(p.x, floorY + eave / 2, p.z, bayW / 2, eave / 2, 0.19, "wall", ry);
    }
  }

  // --- 幌子（只有铺面才挑）---
  if (openBay >= 0) {
    const arm = At(width / 2 - 0.45, depth / 2 + 0.40);
    Put(sink, "WoodBeam", [0.09, 0.09, 1.05], TILE_METERS.wood,
      `${seed}:arm`, { x: arm.x, y: floorY + eave - 0.28, z: arm.z, ry });
    const sign = At(width / 2 - 0.45, depth / 2 + 0.86);
    Put(sink, "WoodDoor", [0.42, 1.16, 0.05], TILE_METERS.wood,
      `${seed}:sign`, { x: sign.x, y: floorY + eave - 0.92, z: sign.z, ry });
  }

  // --- 屋面 ---
  const slopeLen = Math.hypot(depth / 2, rise);
  const angle = Math.atan2(rise, depth / 2);
  const roofMat = straw ? "VillageStraw" : "RoofTile";
  for (const s of [-1, 1]) {
    const p = At(0, s * (depth / 4));
    Put(sink, roofMat, [roofW, straw ? 0.22 : 0.12, slopeLen + 0.5],
      straw ? TILE_METERS.ground : TILE_METERS.roof,
      `${seed}:rs${s}`, { x: p.x, y: floorY + eave + rise / 2, z: p.z, ry, rx: s * angle });
  }
  Put(sink, roofMat, [roofW, straw ? 0.26 : 0.20, 0.36],
    straw ? TILE_METERS.ground : TILE_METERS.roof,
    `${seed}:ridge`, { x, y: floorY + eave + rise + 0.07, z, ry });

  // --- 门前踩实地 ---
  const apron = At(0, depth / 2 + 1.5);
  AddYardWear(sink, {
    x: apron.x, z: apron.z, ry, baseY: host.OuterHeight(apron.x, apron.z) + 0.02,
    seed: `${seed}:apron`, radius: Math.min(width * 0.42, 3.2),
  });
  return { baseY, floorY, eave };
}

// ---------------------------------------------------------------------------
// 北庙
// ---------------------------------------------------------------------------

/**
 * 北关村庙：一进小院 + 一座单殿。
 *
 * **比城里的街庙矮一档，这是形制不是省事**：城里的龙王庙 / 火神庙是官修街庙
 * （院墙 2.7 m、大殿脊高 5.6 m、筒瓦、正脊起翘带鸱吻、斗拱、幡杆），
 * 而北关这座是关厢外的村庙 —— 院墙 2.2 m、大殿脊高 4.4 m、小青瓦、平直正脊、
 * 没有斗拱没有鸱吻没有幡杆。庙的「红」只剩前檐四根柱子和抱框那一点，
 * 但那一点红在一片灰土里仍然是路标。
 *
 * 全部构件自吃 baseY（濠外原野 -1.2，脚下没有垫地）。院心铺一层 0.14 m 的
 * 踩实土：既是形制（庙院的地是扫出来的，不是野地），也顺手把 BuildMarchGround
 * 那块可能飘进来的麦垄板压在下面。
 */
function NorthTemple(host, t, ctx) {
  const sink = host.sink;
  const ry = 0;                        // 坐北朝南：山门开在局部 +z = 世界南
  const At = Frame(t.x, t.z, ry);
  const seed = "north:temple";
  const rnd = Mulberry32(HashString(seed));
  const damage = ctx.damage ?? 0.25;
  const w = t.w, d = t.d;

  let baseY = -1e9;
  for (const lx of [-w / 2, w / 2]) {
    for (const lz of [-d / 2, d / 2]) {
      const p = At(lx, lz);
      baseY = Math.max(baseY, host.OuterHeight(p.x, p.z));
    }
  }

  // --- 院心地坪 ---
  Put(sink, "RoadWear", [w, 0.30, d], TILE_METERS.ground,
    `${seed}:floor`, { x: t.x, y: baseY - 0.01, z: t.z });
  sink.Solid(t.x, baseY - 0.01, t.z, w / 2, 0.15, d / 2, "embankment");

  // --- 院墙一圈（南面留门）---
  const wallH = 2.2, wallT = 0.40;
  const openW = 2.2, wing = 1.7, gateDepth = 1.3;
  const gateSpan = openW + wing * 2 + 0.4;
  const runs = [
    { lx: 0, lz: -d / 2, len: w, rot: 0 },
    { lx: -w / 2, lz: 0, len: d, rot: Math.PI / 2 },
    { lx: w / 2, lz: 0, len: d, rot: Math.PI / 2 },
  ];
  for (const [i, run] of runs.entries()) {
    const p = At(run.lx, run.lz);
    const rr = ry + run.rot;
    // 墙身：分 5 段，墙头参差（土坯院墙不是一条水平线）
    const segN = Math.max(4, Math.round(run.len / 3.4));
    const segL = run.len / segN;
    const parts = [];
    for (let k = 0; k < segN; k += 1) {
      const h = wallH * (0.94 + rnd() * 0.10 - damage * 0.10);
      parts.push(PlaceGeometry(
        MakeBox(segL * 1.03, h + 0.4, wallT, TILE_METERS.adobe, `${seed}:w${i}${k}`),
        { x: -run.len / 2 + segL * (k + 0.5), y: (h - 0.4) / 2 }));
    }
    sink.Add("HouseBrick", PlaceGeometry(MergeGeometries(parts),
      { x: p.x, y: baseY + 0.14, z: p.z, ry: rr }));
    // 压顶瓦
    Put(sink, "RoofTile", [run.len, 0.10, wallT + 0.22], TILE_METERS.roof,
      `${seed}:cope${i}`, { x: p.x, y: baseY + 0.14 + wallH, z: p.z, ry: rr });
    sink.Solid(p.x, baseY + 0.14 + wallH / 2, p.z, run.len / 2, wallH / 2, wallT / 2, "wall", rr);
    sink.Cover(p.x, p.z, baseY + 0.14 + wallH,
      Math.sin(rr), Math.cos(rr));
  }
  // 南墙两段夹门
  const segLen = Math.max(1.0, (w - gateSpan) / 2);
  for (const s of [-1, 1]) {
    const p = At(s * (gateSpan / 2 + segLen / 2), d / 2);
    Put(sink, "HouseBrick", [segLen, wallH + 0.4, wallT], TILE_METERS.brick,
      `${seed}:ws${s}`, { x: p.x, y: baseY + 0.14 + (wallH - 0.4) / 2, z: p.z, ry });
    Put(sink, "RoofTile", [segLen, 0.10, wallT + 0.22], TILE_METERS.roof,
      `${seed}:wsc${s}`, { x: p.x, y: baseY + 0.14 + wallH, z: p.z, ry });
    sink.Solid(p.x, baseY + 0.14 + wallH / 2, p.z, segLen / 2, wallH / 2, wallT / 2, "wall", ry);
  }

  // --- 山门（村庙一档：两个砖垛夹一副木门，门头一顶小瓦，一方石匾）---
  const gateLz = d / 2 - gateDepth / 2 - 0.1;
  const gateH = 3.0, gOpenH = 2.45;
  for (const s of [-1, 1]) {
    const p = At(s * (openW / 2 + wing / 2), gateLz);
    Put(sink, "HouseBrick", [wing, gateH, gateDepth], TILE_METERS.brick,
      `${seed}:gp${s}`, { x: p.x, y: baseY + 0.14 + gateH / 2, z: p.z, ry }, BRICK_UV_GRID);
    sink.Solid(p.x, baseY + 0.14 + gateH / 2, p.z, wing / 2, gateH / 2, gateDepth / 2, "wall", ry);
    sink.Cover(p.x, p.z, baseY + 0.14 + gateH, 0, 1);
    // 红抱框：村庙唯一的红
    const j = At(s * (openW / 2 - 0.10), gateLz + gateDepth / 2 - 0.09);
    Put(sink, "PaintRed", [0.26, gOpenH + 0.22, 0.30], TILE_METERS.wood,
      `${seed}:gj${s}`, { x: j.x, y: baseY + 0.14 + (gOpenH + 0.22) / 2, z: j.z, ry });
    const k = At(s * (openW / 2 + 0.24), gateLz + gateDepth / 2 + 0.16);
    Put(sink, "Stone", [0.46, 0.40, 0.50], TILE_METERS.stone,
      `${seed}:gk${s}`, { x: k.x, y: baseY + 0.14 + 0.20, z: k.z, ry });
  }
  // 门楣填充与石匾：不登记 Solid（门洞必须能走）
  const gc = At(0, gateLz);
  Put(sink, "HouseBrick", [openW + 0.4, gateH - gOpenH - 0.22, gateDepth], TILE_METERS.brick,
    `${seed}:glin`, { x: gc.x, y: baseY + 0.14 + gOpenH + 0.22 + (gateH - gOpenH - 0.22) / 2, z: gc.z, ry },
    BRICK_UV_GRID);
  const gq = At(0, gateLz + gateDepth / 2 + 0.06);
  Put(sink, "Stone", [Math.min(openW + 0.4, 2.4), 0.62, 0.12], TILE_METERS.stone,
    `${seed}:plq`, { x: gq.x, y: baseY + 0.14 + gOpenH + 0.42, z: gq.z, ry });
  // 门头小瓦（两坡、平脊，没有起翘）
  const gRoofW = openW + wing * 2 + 0.7, gRoofD = gateDepth + 1.0, gRise = 0.5;
  const gSlope = Math.atan2(gRise, gRoofD / 2);
  for (const s of [-1, 1]) {
    const p = At(0, gateLz + s * gRoofD / 4);
    Put(sink, "RoofTile", [gRoofW, 0.11, Math.hypot(gRoofD / 2, gRise) + 0.3], TILE_METERS.roof,
      `${seed}:gr${s}`, { x: p.x, y: baseY + 0.14 + gateH + gRise / 2, z: p.z, ry, rx: s * gSlope });
  }
  Put(sink, "RoofTile", [gRoofW, 0.18, 0.30], TILE_METERS.roof,
    `${seed}:grr`, { x: gc.x, y: baseY + 0.14 + gateH + gRise + 0.05, z: gc.z, ry });
  // 一扇歪着的门板
  if (damage < 0.75) {
    const dl = At(-openW / 4, gateLz + gateDepth / 2 - 0.10);
    Put(sink, "WoodDoor", [openW / 2 - 0.06, gOpenH - 0.10, 0.08], TILE_METERS.wood,
      `${seed}:gd`, { x: dl.x, y: baseY + 0.14 + (gOpenH - 0.10) / 2, z: dl.z, ry: ry - 0.42 });
  }

  // --- 大殿：三开间，台基 0.45，檐口 3.05，脊高 4.40（自地坪算）---
  const hallW = Math.min(w * 0.42, 11.0);
  const hallD = Math.min(d * 0.34, 6.6);
  const hallLz = -d / 2 + hallD / 2 + 1.7;
  const podH = 0.45, hEave = 3.05, hRidge = 4.40;
  const hallY = baseY + 0.14;                    // 院心地坪面
  const bays = 3, bayW = hallW / bays;
  const hc = At(0, hallLz);
  const podW = hallW + 1.5, podD = hallD + 1.4;
  // 台基（往下多埋 0.5 让它压住院心地坪的边）
  Put(sink, "Stone", [podW, podH + 0.5, podD], TILE_METERS.stone,
    `${seed}:pod`, { x: hc.x, y: hallY + (podH - 0.5) / 2, z: hc.z, ry });
  sink.Solid(hc.x, hallY + podH / 2, hc.z, podW / 2, podH / 2, podD / 2, "villageFoundation", ry);
  // 踏跺（朝南）：两级，人上得去
  for (let i = 0; i < 2; i += 1) {
    const th = (podH * (i + 1)) / 2;
    const p = At(0, hallLz + podD / 2 + 0.42 * (1.5 - i));
    Put(sink, "Stone", [Math.min(hallW * 0.5, 4.4), th + 0.3, 0.44], TILE_METERS.stone,
      `${seed}:st${i}`, { x: p.x, y: hallY + (th - 0.3) / 2, z: p.z, ry });
    sink.Solid(p.x, hallY + th / 2, p.z, Math.min(hallW * 0.5, 4.4) / 2, th / 2, 0.22, "prop", ry);
  }
  const floorY = hallY + podH;
  const hRise = hRidge - hEave;
  // 后墙 + 两山墙
  const hb = At(0, hallLz - hallD / 2 + 0.2);
  Put(sink, "HouseBrick", [hallW, hEave, 0.40], TILE_METERS.brick,
    `${seed}:hback`, { x: hb.x, y: floorY + hEave / 2, z: hb.z, ry });
  sink.Solid(hb.x, floorY + hEave / 2, hb.z, hallW / 2, hEave / 2, 0.20, "wall", ry);
  // 山墙排在屋面外沿上（±hallW/2+0.17，屋面半宽 hallW/2+0.34）——
  // 排在墙心线上的话七级台阶从瓦面中间戳出来，见 VillageHouse 里同一条注释。
  const hGableOff = hallW / 2 + 0.17;
  const hRoofW = hallW + 0.68;
  for (const s of [-1, 1]) {
    const p = At(s * hGableOff, hallLz);
    Put(sink, "HouseBrick", [0.40, hEave, hallD], TILE_METERS.brick,
      `${seed}:hgw${s}`, { x: p.x, y: floorY + hEave / 2, z: p.z, ry });
    sink.Solid(p.x, floorY + hEave / 2, p.z, 0.20, hEave / 2, hallD / 2, "wall", ry);
    // 硬山山墙：7 段（殿身进深大，5 段在剪影上读成楼梯）
    const stepsN = 7, segD = hallD / stepsN, parts = [];
    for (let i = 0; i < stepsN; i += 1) {
      const tt = (i + 0.5) / stepsN;
      const h = hRise * (1 - Math.abs(tt * 2 - 1)) + 0.16;
      parts.push(PlaceGeometry(
        MakeBox(0.34, h, segD * 1.02, TILE_METERS.brick, `${seed}:hgb${s}${i}`),
        { x: 0, y: h / 2, z: -hallD / 2 + segD * (i + 0.5) }));
    }
    sink.Add("HouseBrick", PlaceGeometry(MergeGeometries(parts),
      { x: p.x, y: floorY + hEave, z: p.z, ry }));
  }
  // 前檐：四根红柱 + 明间板门 + 次间槛墙直棂窗
  const frontLz = hallLz + hallD / 2 - 0.16;
  for (let i = 0; i <= bays; i += 1) {
    const p = At(-hallW / 2 + bayW * i, frontLz);
    Put(sink, "Stone", [0.36, 0.20, 0.36], TILE_METERS.stone,
      `${seed}:hpb${i}`, { x: p.x, y: floorY + 0.10, z: p.z, ry });
    Put(sink, "PaintRed", [0.30, hEave - 0.20, 0.30], TILE_METERS.wood,
      `${seed}:hcol${i}`, { x: p.x, y: floorY + 0.20 + (hEave - 0.20) / 2, z: p.z, ry });
    sink.Solid(p.x, floorY + hEave / 2, p.z, 0.18, hEave / 2, 0.18, "villagePost", ry);
  }
  // 檐下一道红额枋（村庙没有斗拱，只有这一根）
  const hl = At(0, frontLz + 0.10);
  Put(sink, "PaintRed", [hallW + 0.4, 0.36, 0.26], TILE_METERS.wood,
    `${seed}:harch`, { x: hl.x, y: floorY + hEave - 0.40, z: hl.z, ry });
  const openH = 2.30;
  for (let b = 0; b < bays; b += 1) {
    const lx = -hallW / 2 + bayW * (b + 0.5);
    const p = At(lx, frontLz);
    if (b === 1) {
      // 明间板门：**两扇都朝里敞开**（第一版是关着的，理由是「开着就是一块纯黑」——
      // 现在殿里有神台香案了，理由不成立，关着反而把内景整个封死）。
      // 每扇绕自己的外沿转 78°，贴在明间两侧的檐柱上；门板本来就不登记 Solid，
      // 明间那一档也不登记墙（else 分支才登记）—— 所以这道门是真能走进去的。
      const leafW = bayW * 0.44, swing = 1.36;
      for (const s of [-1, 1]) {
        const hingeLx = lx + s * (bayW / 2 - 0.17);
        const dx = -s * Math.cos(swing), dz = -Math.sin(swing);
        const dp = At(hingeLx + dx * leafW * 0.5, frontLz + dz * leafW * 0.5 - 0.05);
        Put(sink, "WoodDoor", [leafW, openH, 0.08], TILE_METERS.wood,
          `${seed}:hleaf${s}`, {
            x: dp.x, y: floorY + openH / 2, z: dp.z, ry: ry + Math.atan2(-dz, dx),
          });
      }
      // 高门槛：庙门的门槛是形制，也顺手把「进殿」这件事说清楚。
      // 0.22 m 低于 autostep 0.55，抬腿过得去。
      const sillp = At(lx, frontLz + 0.02);
      Put(sink, "Stone", [bayW - 0.34, 0.22, 0.26], TILE_METERS.stone,
        `${seed}:hthr`, { x: sillp.x, y: floorY + 0.11, z: sillp.z, ry });
      Put(sink, "HouseBrick", [bayW - 0.4, hEave - openH, 0.38], TILE_METERS.brick,
        `${seed}:hover`, { x: p.x, y: floorY + openH + (hEave - openH) / 2, z: p.z, ry });
    } else {
      const sillH = 1.0;
      Put(sink, "HouseBrick", [bayW - 0.42, sillH, 0.38], TILE_METERS.brick,
        `${seed}:hsill${b}`, { x: p.x, y: floorY + sillH / 2, z: p.z, ry });
      const winH = hEave - sillH - 0.5;
      // **窗背板拆了**：第一版在直棂后面钉了一块通长的木板，因为殿里是空的、
      // 开着就是一个黑洞。现在殿里有东西，这两樘次间窗是大殿唯一的侧光来源
      // （明间门朝南，进深 6.6 m 的殿光只到一半）—— 板一拆，光就进来了。
      // 拆板的同时把直棂加密：5 根棂子间距 0.7 m，读作「一个洞插了几根棍」，
      // 不是直棂窗；0.135 m 一根才是。
      const barN = Math.max(8, Math.round((bayW - 0.66) / 0.135));
      const bars = [];
      for (let m = 0; m < barN; m += 1) {
        bars.push(PlaceGeometry(
          MakeBox(0.055, winH, 0.075, TILE_METERS.wood, `${seed}:hbar${b}${m}`),
          { x: (m / (barN - 1) - 0.5) * (bayW - 0.66) }));
      }
      sink.Add("WoodBeam", PlaceGeometry(MergeGeometries(bars),
        { x: p.x, y: floorY + sillH + winH / 2, z: p.z, ry }));
      Put(sink, "HouseBrick", [bayW - 0.42, 0.5, 0.38], TILE_METERS.brick,
        `${seed}:hhd${b}`, { x: p.x, y: floorY + hEave - 0.25, z: p.z, ry });
      sink.Solid(p.x, floorY + hEave / 2, p.z, (bayW - 0.42) / 2, hEave / 2, 0.19, "wall", ry);
    }
  }
  // 屋面：小青瓦两坡 + 平直正脊（村庙没有鸱吻脊兽）
  const hSlopeLen = Math.hypot(hallD / 2, hRise);
  const hAngle = Math.atan2(hRise, hallD / 2);
  // 椽头的高度必须按**屋面斜板在那个 z 上的实际高度**算，不能拿檐口高当近似：
  // 斜板绕自己的中心转，外沿比檐口低 0.13—0.2 m，照檐口摆的话一排椽头
  // 全从瓦面上戳出来（第一版实拍：读成屋顶上撒的一排白方块）。
  const rafterDz = hallD / 2 + 0.16;
  const rafterY = floorY + hEave + hRise - rafterDz * (hRise / (hallD / 2)) - 0.17;
  for (const s of [-1, 1]) {
    const p = At(0, hallLz + s * (hallD / 4));
    Put(sink, "RoofTile", [hRoofW, 0.13, hSlopeLen + 0.7], TILE_METERS.roof,
      `${seed}:hrs${s}`, { x: p.x, y: floorY + hEave + hRise / 2, z: p.z, ry, rx: s * hAngle });
    // 檐口椽头：一排小方料，檐下才有那条横向阴影
    const n = Math.max(6, Math.round(hallW / 0.85));
    for (let i = 0; i < n; i += 1) {
      const rp = At(-hallW / 2 + (i + 0.5) * (hallW / n), hallLz + s * rafterDz);
      Put(sink, "WoodBeam", [0.08, 0.09, 0.56], TILE_METERS.wood,
        `${seed}:hrf${s}${i}`, { x: rp.x, y: rafterY, z: rp.z, ry, rx: s * hAngle * 0.9 });
    }
  }
  Put(sink, "RoofTile", [hRoofW, 0.24, 0.40], TILE_METERS.roof,
    `${seed}:hridge`, { x: hc.x, y: floorY + hEave + hRise + 0.08, z: hc.z, ry });

  // --- 殿内：神台 / 香案 / 签筒 ---
  //
  // **村庙一档的朴素**，和外面是同一条尺子：没有藻井、没有彩画、没有斗拱，
  // 神台是砖砌的不是须弥座，案是素木不是雕花供桌，唯一的一点亮色是台前那幅红帷幔
  // （PaintRed 已经是庙这个分区里的桶，山门抱框与檐柱都用它 —— 屋里的红不多花一个 draw call）。
  //
  // **不做神像**：一尊泥塑是人形件，属于饰件轮不属于场景轮；而且滕县这座庙供的是谁
  // 无载。台上摆三方**净几何木牌位**（不刻字，与山门石匾、A7 匾额同一口径）——
  // 牌位本来就是鲁南村庙的常见做法，比猜一尊像稳。
  {
    const backIn = hallLz - hallD / 2 + 0.40;      // 后檐墙内皮
    const frontIn = frontLz - 0.19;               // 前檐槛墙内皮
    const rich = damage < 0.62;

    // 方砖墁地（用 HouseBrick：庙的墙已经是这个桶，殿里不另开地面材质）
    {
      const p = At(0, (backIn + frontIn) / 2);
      Put(sink, "HouseBrick", [hallW - 0.1, 0.07, frontIn - backIn], TILE_METERS.brick,
        `${seed}:hfloor`, { x: p.x, y: floorY + 0.035, z: p.z, ry });
    }
    // 两道梁：三开间小殿抬头看得见的就是这两根
    for (const s of [-1, 1]) {
      const p = At(0, hallLz + s * (hallD / 5));
      Put(sink, "WoodBeam", [hallW - 0.2, 0.24, 0.20], TILE_METERS.wood,
        `${seed}:hbeam${s}`, { x: p.x, y: floorY + hEave - 0.22, z: p.z, ry });
    }

    // --- 神台：靠后墙一道砖砌台 + 石台面 ---
    const altW = Math.min(hallW * 0.55, 6.2), altD = 1.15, altH = 0.92;
    const altLz = backIn + altD / 2;
    {
      const p = At(0, altLz);
      Put(sink, "HouseBrick", [altW, altH, altD], TILE_METERS.brick,
        `${seed}:altar`, { x: p.x, y: floorY + altH / 2, z: p.z, ry }, BRICK_UV_GRID);
      Put(sink, "Stone", [altW + 0.18, 0.08, altD + 0.12], TILE_METERS.stone,
        `${seed}:altartop`, { x: p.x, y: floorY + altH + 0.04, z: p.z, ry });
      sink.Solid(p.x, floorY + (altH + 0.1) / 2, p.z, (altW + 0.26) / 2, (altH + 0.1) / 2,
        (altD + 0.16) / 2, "villageFoundation", ry);
      sink.Cover(p.x, p.z, floorY + altH, 0, 1);
      if (rich) {
        // 红桌围 + 横楣：庙里唯一的一块颜色。
        // **只挂上半截**（0.50 m），下面留砖台露出来 —— 第一版从台面一路挂到地，
        // 6 m × 0.74 m 的一整片 PaintRed 在近景里读成一堵粉墙，不是一块布。
        const f = At(0, altLz + altD / 2 + 0.04);
        Put(sink, "PaintRed", [altW - 0.1, 0.50, 0.05], TILE_METERS.wood,
          `${seed}:valance`, { x: f.x, y: floorY + altH - 0.32, z: f.z, ry });
        Put(sink, "PaintRed", [altW + 0.2, 0.15, 0.10], TILE_METERS.wood,
          `${seed}:pelmet`, { x: f.x, y: floorY + altH - 0.04, z: f.z, ry });
      }
    }
    // 台上三方牌位（中间高、两边低），净牌不刻字
    if (rich) {
      const topY = floorY + altH + 0.08;
      // 供器：两只素瓷碗夹中间那方牌位、两端一对木花瓶。
      // 不为好看 —— 6 m 长的石台面上只摆三块小牌位，近景里是一条空白的白板。
      for (const s of [-1, 1]) {
        const b = At(s * 0.78, altLz + 0.16);
        Put(sink, "Stone", [0.20, 0.13, 0.20], TILE_METERS.stone,
          `${seed}:bowl${s}`, { x: b.x, y: topY + 0.065, z: b.z, ry });
        const v = At(s * 2.35, altLz - 0.02);
        Put(sink, "WoodBeam", [0.13, 0.30, 0.13], TILE_METERS.wood,
          `${seed}:vase${s}`, { x: v.x, y: topY + 0.15, z: v.z, ry });
      }
      for (const [lx, hgt, wid] of [[-1.6, 0.42, 0.20], [0, 0.58, 0.25], [1.6, 0.42, 0.20]]) {
        const p = At(lx, altLz - 0.05);
        Put(sink, "Stone", [wid + 0.12, 0.09, 0.17], TILE_METERS.stone,
          `${seed}:tbase${lx}`, { x: p.x, y: topY + 0.045, z: p.z, ry });
        Put(sink, "WoodDoor", [wid, hgt, 0.05], TILE_METERS.wood,
          `${seed}:tablet${lx}`, { x: p.x, y: topY + 0.09 + hgt / 2, z: p.z, ry });
      }
    }

    // --- 香案：素木一张，摆在神台前一步 ---
    const tabLz = altLz + altD / 2 + 0.85;
    const tabW = 1.85, tabD = 0.74, tabH = 0.84;
    {
      const p = At(0, tabLz);
      Put(sink, "WoodBeam", [tabW, 0.08, tabD], TILE_METERS.wood,
        `${seed}:tabtop`, { x: p.x, y: floorY + tabH, z: p.z, ry });
      const ap = At(0, tabLz + tabD / 2 - 0.04);
      Put(sink, "WoodBeam", [tabW - 0.1, 0.14, 0.05], TILE_METERS.wood,
        `${seed}:tabapron`, { x: ap.x, y: floorY + tabH - 0.15, z: ap.z, ry });
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const q = At(sx * (tabW / 2 - 0.13), tabLz + sz * (tabD / 2 - 0.12));
          Put(sink, "WoodBeam", [0.09, tabH - 0.04, 0.09], TILE_METERS.wood,
            `${seed}:tableg${sx}${sz}`, { x: q.x, y: floorY + (tabH - 0.04) / 2, z: q.z, ry });
        }
      }
      sink.Solid(p.x, floorY + tabH / 2, p.z, tabW / 2, tabH / 2, tabD / 2, "furniture", ry);
    }
    if (rich) {
      const deck = floorY + tabH + 0.04;
      // 香炉：石的（村庙买不起铜的），炉里插三炷香
      const cp = At(0, tabLz - 0.04);
      Put(sink, "Stone", [0.38, 0.24, 0.30], TILE_METERS.stone,
        `${seed}:censer`, { x: cp.x, y: deck + 0.12, z: cp.z, ry });
      for (let i = 0; i < 3; i += 1) {
        const q = At((i - 1) * 0.07, tabLz - 0.04);
        Put(sink, "WoodBeam", [0.02, 0.36, 0.02], TILE_METERS.wood,
          `${seed}:josh${i}`, { x: q.x, y: deck + 0.40, z: q.z, ry, rz: (i - 1) * 0.09 });
      }
      // 烛台一对
      for (const s of [-1, 1]) {
        const q = At(s * 0.66, tabLz - 0.02);
        Put(sink, "Stone", [0.10, 0.26, 0.10], TILE_METERS.stone,
          `${seed}:cand${s}`, { x: q.x, y: deck + 0.13, z: q.z, ry });
      }
      // --- 签筒：一只竹筒 + 一把签，签头散开 ---
      // 求签是村庙唯一「玩家看得懂在干什么」的物件，也是这一档庙的功能证据。
      // 筒粗一档、签短一档、扇开小一档：第一版 6 根 0.018 的细签扇到 ±0.34 rad，
      // 近景里挤成一个黑锥子，看不出是签。
      const sp = At(0.44, tabLz + 0.14);
      Put(sink, "WoodBeam", [0.19, 0.30, 0.19], TILE_METERS.wood,
        `${seed}:lotpot`, { x: sp.x, y: deck + 0.15, z: sp.z, ry });
      for (let i = 0; i < 5; i += 1) {
        const t = (i / 4 - 0.5);
        const q = At(0.44 + t * 0.13, tabLz + 0.14 + (i % 2 ? 0.045 : -0.045));
        Put(sink, "WoodBeam", [0.026, 0.26, 0.026], TILE_METERS.wood,
          `${seed}:lot${i}`, { x: q.x, y: deck + 0.38, z: q.z, ry, rz: t * 0.20 });
      }
      // 蒲团一对：草编的，摆在案前
      for (const s of [-1, 1]) {
        const q = At(s * 0.62, tabLz + 0.95);
        Put(sink, "VillageStraw", [0.52, 0.11, 0.52], TILE_METERS.ground,
          `${seed}:mat${s}`, { x: q.x, y: floorY + 0.11, z: q.z, ry: ry + rnd() * 0.4 });
      }
    }
  }

  // --- 甬路：山门 → 大殿。俯瞰时这条亮线把庙院从野地里拉出来 ---
  const pathFrom = gateLz - gateDepth / 2 - 0.3, pathTo = hallLz + podD / 2;
  const pathC = At(0, (pathFrom + pathTo) / 2);
  Put(sink, "Stone", [2.0, 0.14, Math.abs(pathFrom - pathTo)], TILE_METERS.stone,
    `${seed}:path`, { x: pathC.x, y: baseY + 0.18, z: pathC.z, ry });

  // --- 石香炉：中轴上唯一的家什 ---
  const cn = At(0, d * 0.10);
  Put(sink, "Stone", [1.30, 0.30, 1.30], TILE_METERS.stone,
    `${seed}:cb`, { x: cn.x, y: baseY + 0.29, z: cn.z, ry });
  Put(sink, "Stone", [0.88, 0.76, 0.88], TILE_METERS.stone,
    `${seed}:cy`, { x: cn.x, y: baseY + 0.82, z: cn.z, ry });
  Put(sink, "RoofTile", [1.08, 0.18, 1.08], TILE_METERS.roof,
    `${seed}:cl`, { x: cn.x, y: baseY + 1.29, z: cn.z, ry });
  sink.Solid(cn.x, baseY + 0.72, cn.z, 0.7, 0.6, 0.7, "prop", ry);
  sink.Cover(cn.x, cn.z, baseY + 1.38, 0, 1);

  // --- 庙祝房：西厢一间土坯草顶小屋（村庙都有一个看庙的） ---
  const cell = At(-w / 2 + 2.9, d * 0.12);
  const cellRy = ry + Math.PI / 2;            // 面阔沿南北，门朝东开向院心
  const cellY = baseY + 0.14, cellW = 5.0, cellD = 4.0, cellEave = 2.30;
  Put(sink, "Adobe", [cellW, cellEave, cellD], TILE_METERS.adobe,
    `${seed}:cell`, { x: cell.x, y: cellY + cellEave / 2, z: cell.z, ry: cellRy });
  sink.Solid(cell.x, cellY + cellEave / 2, cell.z, cellW / 2, cellEave / 2, cellD / 2, "wall", cellRy);
  // 两坡草顶（第一版是一块平板，出图上读成一只集装箱）
  const cellRise = cellD * 0.5 * 0.5;
  const cellAngle = Math.atan2(cellRise, cellD / 2);
  const cellSlope = Math.hypot(cellD / 2, cellRise);
  const cellAt = Frame(cell.x, cell.z, cellRy);
  for (const s of [-1, 1]) {
    const cp = cellAt(0, s * (cellD / 4));
    Put(sink, "VillageStraw", [cellW + 0.5, 0.24, cellSlope + 0.4], TILE_METERS.ground,
      `${seed}:cellrs${s}`, { x: cp.x, y: cellY + cellEave + cellRise / 2, z: cp.z, ry: cellRy, rx: s * cellAngle });
  }
  Put(sink, "VillageStraw", [cellW + 0.5, 0.26, 0.34], TILE_METERS.ground,
    `${seed}:cellridge`, { x: cell.x, y: cellY + cellEave + cellRise + 0.08, z: cell.z, ry: cellRy });
  const cellDoor = cellAt(0, cellD / 2 - 0.05);
  Put(sink, "WoodDoor", [1.0, 1.82, 0.07], TILE_METERS.wood,
    `${seed}:celldoor`, { x: cellDoor.x, y: cellY + 0.91, z: cellDoor.z, ry: cellRy });

  // --- 侧柏一对：三月唯一成片不透光的墨绿竖影，庙的第二个识别信号 ---
  for (const s of [-1, 1]) {
    const p = At(s * (w * 0.28), d * 0.28 + (rnd() - 0.5) * 1.4);
    AddCypress(sink, {
      x: p.x, z: p.z, seed: `${seed}:cyp${s}`,
      height: 5.6 + rnd() * 1.6, baseY: baseY + 0.14,
    });
  }
  // --- 门外一小片打谷场：庙前的空场是村里唯一的公共空间 ---
  const yardOut = At(0, d / 2 + 4.6);
  AddYardWear(sink, {
    x: yardOut.x, z: yardOut.z, ry, baseY: host.OuterHeight(yardOut.x, yardOut.z) + 0.02,
    seed: `${seed}:threshing`, radius: 4.6,
  });
  const roller = At(3.4, d / 2 + 5.4);
  Put(sink, "Stone", [1.05, 0.62, 0.62], TILE_METERS.stone,
    `${seed}:roller`, { x: roller.x, y: host.OuterHeight(roller.x, roller.z) + 0.31, z: roller.z, ry: 0.4 });
  sink.Solid(roller.x, host.OuterHeight(roller.x, roller.z) + 0.31, roller.z, 0.55, 0.31, 0.33, "prop", 0.4);
}

// ---------------------------------------------------------------------------
// 街景（村屋 / 柴垛 / 篱笆 / 杨树）
// ---------------------------------------------------------------------------

function NorthStreetLife(host, street, stockade, ctx) {
  const sink = host.sink;
  const inView = MakeInView(host);
  const rnd = Mulberry32(HashString("north:life"));
  const half = street.width / 2;

  for (const h of HOUSES) {
    if (!inView(street.x, h.z, 260)) continue;
    // 退让：OnStreet 的街面半宽是 width/2 + 1.2 m。房子往外再让 1.9 m，
    // 免得贴到退让带上整间不生成（WP-A5 的哨位第一版就是这么全军覆没的）。
    const hx = street.x + h.side * (half + 1.9 + h.d / 2);
    // 街西的房子朝东（ry=π/2：局部 +z → 世界 +x）；街东的朝西
    const ry = h.side < 0 ? Math.PI / 2 : -Math.PI / 2;
    if (host.OnStreet(hx, h.z, h.d / 2, h.w / 2)) continue;
    sink.SetSector(NorthSector(hx, h.z));
    VillageHouse(host, {
      x: hx, z: h.z, ry, width: h.w, depth: h.d,
      seed: `north:house${h.z}`, damage: ctx.damage ?? 0.25,
      straw: h.straw, openBay: h.openBay,
    });
    // 屋后的院子：柴垛 / 秸秆垛 / 篱笆一段
    const backX = hx + h.side * (h.d / 2 + 3.4);
    AddVillageLife(sink, {
      x: backX, z: h.z + 1.2, ry, baseY: host.OuterHeight(backX, h.z + 1.2),
      seed: `north:yard${h.z}`,
    });
    AddWattleFence(sink, {
      x: backX, z: h.z - h.w / 2 - 0.6, ry: Math.PI / 2, length: 7.0,
      y: host.OuterHeight(backX, h.z - h.w / 2 - 0.6), seed: `north:fence${h.z}`,
    });
    sink.SetSector("");
  }

  // 圩门里侧、贴着圩子墙根的一处场院：篱笆一角 + 家什 + 秸秆垛。
  //
  // 第一版这里只摆了一座 AddStalkStack，出图（C2_GateWest_In 夜景）上它读成
  // 「空地上插了一把棍子」—— 那件构件是给院子里、垛旁有别的东西时用的，
  // 单独摆在旷野里没有参照物。现在给它一个院角：篱笆把它围进「有人住」的语境里。
  const yardX = street.x + 11.5, yardZ = stockade.z + 9.5;
  if (inView(yardX, yardZ, 260)) {
    sink.SetSector(NorthSector(yardX, yardZ));
    AddVillageLife(sink, {
      x: yardX, z: yardZ, ry: Math.PI, baseY: host.OuterHeight(yardX, yardZ),
      seed: "north:gateYard",
    });
    AddStalkStack(sink, {
      x: yardX - 4.2, z: yardZ + 1.2, ry: 0.3,
      y: host.OuterHeight(yardX - 4.2, yardZ + 1.2), seed: "north:stack", scale: 0.95,
    });
    for (const [fx, fz, fry, flen] of [
      [yardX - 2.0, yardZ + 4.6, 0, 11.0],          // 南面（朝村里）
      [yardX + 0.2, yardZ + 1.2, Math.PI / 2, 7.5], // 东面
    ]) {
      AddWattleFence(sink, {
        x: fx, z: fz, ry: fry, length: flen,
        y: host.OuterHeight(fx, fz), seed: `north:gateFence${fry}`,
      });
    }
    sink.SetSector("");
  }

  // 沿街杨树：华北平原的行道树，三月全是光杆。街肩外 5.4 m —— 退让带是 4.2，
  // 差一点就整棵不生成，所以留 1.2 m 的余量。
  //
  // 只栽 7 棵：一棵无叶杨树是 ~1000 三角（枝网是真的圆柱段），是本包里
  // 单价最高的构件。稀疏本来也是对的 —— 关厢是残响，不是林荫道。
  // 分区必须设在 **farSink** 上（树进的是 farSink）：设错 sink 的话
  // 这几棵树会掉进全城共用的空分区桶里，把那一桶的包围盒拉到城北 560 m 外。
  const poplars = 7;
  for (let i = 0; i < poplars; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const tz = street.fromZ + 18 + i * ((street.toZ - street.fromZ - 38) / (poplars - 1))
      + (rnd() - 0.5) * 5;
    const tx = street.x + side * 5.4;
    if (!inView(tx, tz, 260)) continue;
    if (host.OnStreet(tx, tz, 0.5, 0.5)) continue;
    // 避开房子与庙
    if (HOUSES.some((h) => Math.abs(tz - h.z) < h.w / 2 + 3 && h.side === side)) continue;
    host.farSink.SetSector(NorthSector(tx, tz));
    AddPoplar(host.farSink, {
      x: tx, z: tz, seed: `north:poplar${i}`,
      height: 9.0 + rnd() * 2.6, baseY: host.OuterHeight(tx, tz),
    });
    host.farSink.SetSector("");
  }
}

// ---------------------------------------------------------------------------
// kind 入口
// ---------------------------------------------------------------------------

/**
 * 北关整块：坝墙 + 两处圩门 + 北关大街（含桥头引道）+ 北庙 + 沿街村屋。
 *
 * spec 是 Data_Tengxian.NORTH_SUBURB 整块（不是单条 feature），
 * 所以尺寸一律读 spec.stockade / spec.street / spec.temple，本文件不另起炉灶。
 */
export function BuildNorthSuburb(host, spec, ctx = {}) {
  const s = spec.stockade;
  const street = spec.street;
  const inView = MakeInView(host);

  // 圩门：数据里字段名是 width（老桩写过 w，两个都认一下）
  const gates = (s.gates || []).map((g) => {
    const width = g.width ?? g.w ?? 3.0;
    return { x: g.x, width, clearSpan: width + 2.6 * 2 + 0.3 };
  });

  // --- 坝墙 + 圩门 ---
  Stockade(host, s, gates, ctx);
  for (const g of gates) {
    if (!inView(g.x, s.z, 260)) continue;
    host.sink.SetSector(NorthSector(g.x, s.z));
    StockadeGate(host, s, g, ctx);
    host.sink.SetSector("");
  }

  // --- 北关大街 ---
  // 街南端：数据给的 toZ=-328 落在濠槽的外岸线上（濠在 -318…-328.5，见 NORTH_MOAT_OUTER）
  // —— 差一点点就把路面铺到岸坡上。这里钳到「岸前 1.5 m」；
  // 轴上真有桥的话（今天没有）就一路铺到桥头引道的起点。
  // 街北端往圩门外多铺 9 m —— 一座门要看起来有人走，门外那一截路省不得。
  if (inView(street.x, (street.fromZ + street.toZ) / 2, 260)) {
    host.sink.SetSector(NorthSector(street.x, -420));
    const approachZ = BridgeApproach(host, {
      x: street.x, width: street.width, seed: "north:appr",
    });
    const roadSouth = Math.min(street.toZ, approachZ ?? (NORTH_MOAT_OUTER - 1.5));
    RoadRibbon(host, {
      x: street.x, fromZ: street.fromZ - 9, toZ: roadSouth,
      width: street.width, seed: "north:street",
    });
    host.sink.SetSector("");
  }

  // --- 北庙 ---
  const t = spec.temple;
  if (t && inView(t.x, t.z, 260)) {
    host.sink.SetSector(NorthSector(t.x, t.z));
    NorthTemple(host, t, ctx);
    host.sink.SetSector("");
  }

  // --- 沿街村屋与街景 ---
  NorthStreetLife(host, street, s, ctx);

  // 分区复位（派发处紧接着也会复位，这里不留脏状态给下一个构建器）
  host.sink.SetSector("");
  host.farSink.SetSector("");
}
