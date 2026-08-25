// 监狱 + 看守所（城防示意图东北隅）。工作包 A1 专属文件。
// 契约见 Script_LandmarkRegistry.mjs 头注：Build<Kind>(host, f, ctx)，
// 只 import Script_World / Script_Geo / Script_Noise / Script_LivedInProps / three，
// 一切几何相对 f.x/f.z/f.w/f.d/ctx.ry 落位，尺寸不另起炉灶。
//
// ---------------------------------------------------------------------------
// 为什么它不能长成民居
// ---------------------------------------------------------------------------
// 城防示意图上「监狱」「看守所」只有图注和位置，形制、尺寸一概无资料（全部 PRESUMED）。
// 但羁押设施在俯瞰和街景里必须一眼与四合院分开，靠的是四条**几何**特征，不是贴图：
//
//   ① 围墙比民居院墙高一档：民居 2.0—2.5 m（成年人踮脚能扒，见 Data_HistoryMaterial），
//      监狱取 4.6 m、看守所 3.8 m —— 越过民居屋脊（4.0—4.8 m）的只有监狱那一道。
//   ② 外墙面连续无窗：四面墙是整段的、匀质的、带条石碱脚和瓦压顶的实墙，
//      没有民居那种被门楼/影壁/厢房打断的参差轮廓。
//   ③ 统一的窄开间铁窗节奏：牢房排屋开间 2.2 m（民居 3.0—3.6 m），
//      每间一樘 0.55×0.75 m 的高窗，窗台一律 1.55 m（够不着），三根竖铁栅。
//      一排十五樘同样大小、同样高度的小窗 = 羁押；参差的格子窗 = 住家。
//   ④ 转角岗楼高出围墙一倍（约 9 m 到顶），带枪眼，是天际线上唯一的竖向物。
//
// 另外两条是"过程"上的：单一重门（净宽 1.3 m，窄于民居院门 1.5 m）、
// 门内还有一道二门 —— 进出要过两次门，这是监狱与办公院落的分界。
//
// 铁栅一律用几何做（三根方料），不动 tzm 贴图管线。
//
// ---------------------------------------------------------------------------
// 第二轮（WP-D2）：内部空间与攒尖顶
// ---------------------------------------------------------------------------
// 第一轮交出来的是一座「只能绕着走」的监狱：围墙、岗楼、铁窗全对，但每一间
// 屋子都是实心的 —— 牢房排屋整排登记成**一个**碰撞盒，值房是通用办公房。
// 这一轮补三件事，口径如下：
//
//   ① 一进值房（西侧那一块）改成**牢头值房**：门半开、屋里有桌案、锁具架、名牌墙。
//      三件都是「这是管人的屋子」的物证 —— 桌案上是册子不是饭碗，
//      架子上挂的是锁与镣不是农具，墙上钉的是一格一格的名牌不是年画。
//   ② 两排牢房里**靠甬道口的那一间**（后排 rowB 的西头一间）改成可进：
//      碰撞盒从「一整排实心」拆成「实心段 + 隔墙 + 这一间的四壁」，
//      门半开，屋里是通铺木板、瓦罐、草席。其余牢房照旧封闭 —— 一间就够了，
//      玩家进过一间之后，剩下十几樘同样的铁窗后面是什么，他自己会补完。
//   ③ 岗楼的四坡顶从「四块斜板」换成真攒尖（WP-A1 遗留 5）：四条垂脊交于一点，
//      顶角没有能看见天光的缝。用四棱锥（ConeGeometry radialSegments=4）做，
//      面数反而比四块板少 —— 板是六面体，锥面是三角形。
//   ④ 看守所押房同样开一间（同一套 openCell 参数）。
//
// 岗楼**仍然不可上人**：本作没有爬梯系统（Data_Ladder/PlanClimb 是另一套），
// 内侧那架木梯是形制交代不是可攀爬体。
//
// 内部空间的三条硬约束（共用任务书「内部空间契约」）：
//   · 门洞必可走 —— 门板一律不登记碰撞，碰撞留在门洞两侧的填墙上；
//   · 家具一律走 sink 几何（合批 + 破坏一致），材质只用已登记名，tag 只用 prop/furniture；
//   · 内部没有独立光源，靠门窗洞采光 —— 所以可进的那一间**必须**把窗洞里那块
//     深色挡板去掉（封闭牢房才留挡板，它读作「里面是暗的」；可进的屋里再留就是一堵黑墙）。

import * as THREE from "three";
import {
  AddLoopholes, AddDoorReveal, AddRoomBlock, AddWell,
} from "./Script_World.mjs";
import {
  MakeBox, MergeGeometries, PlaceGeometry, TILE_METERS, BRICK_UV_GRID,
} from "./Script_Geo.mjs";
import { Mulberry32, HashString, Clamp } from "./Script_Noise.mjs";
import { AddYardWear } from "./Script_LivedInProps.mjs";

// ---------------------------------------------------------------------------
// 推定尺寸（全部为 PRESUMED，依据见报告 WP_A1.md）
// ---------------------------------------------------------------------------
const JAIL = {
  wallHeight: 4.6,        // 监狱围墙高：民居院墙 2.0—2.5 的一倍强，仍低于城墙 10.3
  wallThick: 0.75,
  gateOpenW: 1.3,         // 重门净宽（AddGatehouse 的普通院门是 1.5）
  gateOpenH: 2.6,
  innerGateW: 1.1,        // 二门
  towerShaft: 5.2,        // 岗楼砖身高（顶到 ≈9.0 m）
};
const DETENTION = {
  wallHeight: 3.8,        // 看守所围墙：同族矮一档，仍明显高于民居院墙
  wallThick: 0.6,
  gateOpenW: 1.2,
  gateOpenH: 2.5,
  innerGateW: 1.0,
};
const CELL = {
  bay: 2.2,               // 牢房开间（民居单开间 3.0—3.6）
  eave: 2.9,              // 檐口（民居 2.4—2.8，牢房略高以便高窗）
  slope: 0.50,            // 硬山坡度 tan ≈ 26.6°
  winW: 0.55,
  winH: 0.75,
  sill: 1.55,             // 窗台高：站在牢里够不着的高度
  // 牢门净宽 1.0 m：仍比民居屋门 1.25 窄一档（「一个人侧身进去」的形制），
  // 但玩家胶囊直径 0.68（STANCE.stand.radius 0.34），0.92 只剩 0.12 m/侧 ——
  // 一扇「可进」的门不能让人卡在门框上（WP-D2 洪水填充实测）。
  doorW: 1.0,
  doorH: 1.95,
};

// 内部空间（全部 PRESUMED，依据见报告 WP_D2.md）
const ROOM = {
  wallT: 0.42,            // 牢房隔墙／端墙厚（同排屋外墙）
  partT: 0.30,            // 一间与一间之间的隔墙：比外墙薄一档
  bunkH: 0.44,            // 通铺木板铺面高（比板凳 0.48 略低，是「铺」不是「床」）
  bunkD: 1.95,            // 通铺进深：躺下 1.8 m + 一点富余
  deskH: 0.78,            // 牢头桌案面高（民居条案 0.73，办公桌案略高）
  ceilingY: 0.16,         // 顶棚（苇箔）离檐口的下沉量
};

/** 圆锥／圆柱面的 UV 按世界米数重算：默认 0..1 会把瓦垄拉成一整片。 */
function ScaleRadialUv(geometry, uScale, vScale) {
  const uv = geometry.attributes.uv;
  if (!uv) return geometry;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * uScale, uv.getY(i) * vScale);
  uv.needsUpdate = true;
  return geometry;
}

/** 局部坐标 → 世界。+x 沿面阔，+z 指向大门那一面（与 PlaceGeometry 的 ry 同一套右手系）。 */
function Frame(x0, z0, ry) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  return (lx, lz) => ({ x: x0 + cos * lx + sin * lz, z: z0 - sin * lx + cos * lz });
}

/** 局部方向 → 世界方向（给 sink.Cover 的朝向用）。 */
function Dir(ry, nx, nz) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  return [cos * nx + sin * nz, -sin * nx + cos * nz];
}

// ---------------------------------------------------------------------------
// 围墙：整段的、匀质的高墙
// ---------------------------------------------------------------------------
/**
 * 一道直墙。分段是为了让墙头随战损参差，不是为了贴图变化 ——
 * 段长取 9.5 m（民居 AddWall 是 0.85 m 一片），监狱墙就该读作"一整片"。
 *
 * @param {object} spec axis "x"=沿局部 x 展开，"z"=沿局部 z 展开；outward 局部外法线
 */
function AddSlabWall(sink, {
  L, ry, cx, cz, length, axis, height, thick, seed,
  ruin = 0, mat = "PrisonWall", tileMat = "RoofTile", outward = [0, 1], segLen = 9.5,
}) {
  if (length <= 0.05) return;
  const count = Math.max(1, Math.round(length / segLen));
  const step = length / count;
  const rnd = Mulberry32(HashString(seed));
  const [fx, fz] = Dir(ry, outward[0], outward[1]);
  for (let i = 0; i < count; i += 1) {
    const off = -length / 2 + step * (i + 0.5);
    const lx = axis === "x" ? cx + off : cx;
    const lz = axis === "x" ? cz : cz + off;
    const bite = ruin * (0.2 + 0.8 * rnd());
    const h = Math.max(1.3, height * (1 - bite));
    const p = L(lx, lz);
    const along = step * 1.01;
    const bw = axis === "x" ? along : thick;
    const bd = axis === "x" ? thick : along;
    sink.Add(mat, PlaceGeometry(
      MakeBox(bw, h, bd, TILE_METERS.brick, `${seed}:b${i}`, BRICK_UV_GRID),
      { x: p.x, y: h / 2, z: p.z, ry }));
    // 条石碱脚：旧砖墙下面那两三皮总是深色的条石，缺了这一笔墙就"浮"着
    sink.Add("Stone", PlaceGeometry(
      MakeBox(axis === "x" ? along : thick + 0.1, 0.55, axis === "x" ? thick + 0.1 : along,
        TILE_METERS.stone, `${seed}:p${i}`),
      { x: p.x, y: 0.275, z: p.z, ry }));
    // 瓦压顶：墙头一条连续的深色线，是"围墙"而不是"挡土墙"的读法
    if (bite < 0.06) {
      sink.Add(tileMat, PlaceGeometry(
        MakeBox(axis === "x" ? along : thick + 0.28, 0.13, axis === "x" ? thick + 0.28 : along,
          TILE_METERS.roof, `${seed}:c${i}`),
        { x: p.x, y: h + 0.065, z: p.z, ry }));
    }
    sink.Solid(p.x, h / 2, p.z,
      axis === "x" ? step / 2 : thick / 2, h / 2, axis === "x" ? thick / 2 : step / 2, "prisonWall", ry);
    sink.Cover(p.x, p.z, h, fx, fz);
  }
}

// ---------------------------------------------------------------------------
// 真攒尖顶
// ---------------------------------------------------------------------------
/**
 * 攒尖顶（四角）。四条垂脊交于**一个**顶点，所以顶角不会有缝。
 *
 * 为什么不接着用四块斜板（`AddAlarmTower` / 第一版岗楼的做法）：
 * 四块板互相搭不上，顶上永远留一个约 0.3 m 的方口；远景看不出，
 * 近景（WP-A1 的 `A1_JailTowerSE`）能从那个口里看见天。而正四棱锥
 * 天生就是闭合的 —— 而且**更省**：一块斜板是六面体 12 个三角，
 * 一整个锥体连底面才 8 个。
 *
 * 檐口另加一圈 0.14 m 的瓦厚（fascia）：没有它，屋面在檐口收成一条刀刃，
 * 逆光下岗楼顶会读成一张纸片。
 *
 * @param {object} spec x,z 中轴；y 檐口标高；side 瞭望间边长；height 举高
 */
function AddHipRoof(sink, {
  x, y, z, ry, side, height, seed, mat = "RoofTile", overhang = 0.42, knob = true,
}) {
  const rFace = side / 2 + overhang;         // 檐口到中轴（正四棱锥的内切半径）
  const r = rFace * Math.SQRT2;              // 角点半径（转 45° 后角在对角线上）
  const uSpan = (rFace * 8) / TILE_METERS.roof;

  const fascia = new THREE.CylinderGeometry(r, r, 0.14, 4, 1, true);
  ScaleRadialUv(fascia, uSpan, 0.14 / TILE_METERS.roof);
  sink.Add(mat, PlaceGeometry(fascia, { x, y: y + 0.07, z, ry: ry + Math.PI / 4 }));

  const cone = new THREE.ConeGeometry(r, height, 4, 1, false);
  ScaleRadialUv(cone, uSpan, Math.hypot(rFace, height) / TILE_METERS.roof);
  sink.Add(mat, PlaceGeometry(cone, { x, y: y + 0.14 + height / 2, z, ry: ry + Math.PI / 4 }));

  // 宝顶：攒尖的收头。没有它顶点太尖，读成帐篷不是瓦顶
  if (knob) {
    sink.Add(mat, PlaceGeometry(
      MakeBox(0.30, 0.28, 0.30, TILE_METERS.roof, `${seed}:knob`),
      { x, y: y + 0.14 + height + 0.10, z, ry: ry + Math.PI / 4 }));
  }
}

// ---------------------------------------------------------------------------
// 半开的门板
// ---------------------------------------------------------------------------
/**
 * 一扇半开的门板。**不登记碰撞** —— 门洞必须能走，碰撞留在门洞两侧的填墙上。
 *
 * 「可进的屋子」在出图里靠的不是碰撞，是这一扇板：门板贴在洞里 = 关着，
 * 门板斜插进屋里 = 开着。两者的碰撞完全一样，读法天差地别。
 *
 * @param {object} spec hinge -1/+1 门轴在洞口的哪一侧；swing -1/+1 往局部 ±z 开
 */
function AddOpenLeaf(sink, {
  L, ry, lx, lz, openW, openH, seed, hinge = 1, swing = -1, angle = 1.12,
  thick = 0.11, bands = 2, mat = "WoodDoor",
}) {
  const leafW = openW - 0.06;
  const leafH = openH - 0.06;
  const dx = -hinge * Math.cos(angle);
  const dz = swing * Math.sin(angle);
  const p = L(lx + hinge * (openW / 2) + dx * (leafW / 2), lz + dz * (leafW / 2));
  // 局部 +x 在多转 θ 之后指向 (cosθ, -sinθ)，要它指向 (dx,dz) 就得 θ = -atan2(dz,dx)
  const leafRy = ry - Math.atan2(dz, dx);
  sink.Add(mat, PlaceGeometry(
    MakeBox(leafW, leafH, thick, TILE_METERS.wood, `${seed}:leaf`),
    { x: p.x, y: leafH / 2 + 0.06, z: p.z, ry: leafRy }));
  for (let i = 0; i < bands; i += 1) {
    sink.Add("IronPlate", PlaceGeometry(
      MakeBox(leafW * 0.94, 0.10, thick + 0.05, TILE_METERS.wood, `${seed}:band${i}`),
      { x: p.x, y: 0.5 + i * (leafH * 0.46), z: p.z, ry: leafRy }));
  }
}

// ---------------------------------------------------------------------------
// 岗楼
// ---------------------------------------------------------------------------
/**
 * 转角岗楼：条石台基 + 砖身 + 挑出的腰檐 + 四面开枪眼的瞭望间 + 四坡小顶。
 * 到顶约 9 m —— 围墙 4.6、民居脊高 4.0—4.8，所以它是这一片天际线上唯一的竖向物。
 * 内侧靠一架木梯（"可瞭望"的交代；不做可攀爬体，攀爬另有 Data_Ladder 一套）。
 */
function AddGuardTower(sink, {
  L, ry, lx, lz, seed, damage = 0, mat = "PrisonWall", tileMat = "RoofTile",
  inward = [1, 1], shaftH = JAIL.towerShaft,
}) {
  const p = L(lx, lz);
  const footH = 0.6, bandH = 0.34, cabH = 2.05;
  const shaftS = 2.9, cabS = 3.15;
  const shaftTop = footH + shaftH;
  const bandTop = shaftTop + bandH;
  const cabMid = bandTop + cabH / 2;
  const roofY = bandTop + cabH;

  sink.Add("Stone", PlaceGeometry(
    MakeBox(shaftS + 0.6, footH, shaftS + 0.6, TILE_METERS.stone, `${seed}:foot`),
    { x: p.x, y: footH / 2, z: p.z, ry }));
  sink.Add(mat, PlaceGeometry(
    MakeBox(shaftS, shaftH, shaftS, TILE_METERS.brick, `${seed}:shaft`, BRICK_UV_GRID),
    { x: p.x, y: footH + shaftH / 2, z: p.z, ry }));
  sink.Add("Stone", PlaceGeometry(
    MakeBox(cabS + 0.3, bandH, cabS + 0.3, TILE_METERS.stone, `${seed}:band`),
    { x: p.x, y: shaftTop + bandH / 2, z: p.z, ry }));
  sink.Add(mat, PlaceGeometry(
    MakeBox(cabS, cabH, cabS, TILE_METERS.brick, `${seed}:cab`, BRICK_UV_GRID),
    { x: p.x, y: cabMid, z: p.z, ry }));
  sink.Solid(p.x, (footH + shaftH) / 2, p.z, shaftS / 2 + 0.3, (footH + shaftH) / 2,
    shaftS / 2 + 0.3, "prisonWall", ry);
  sink.Solid(p.x, cabMid, p.z, cabS / 2, cabH / 2, cabS / 2, "prisonWall", ry);

  // 攒尖小顶（WP-D2 换掉第一版的四块斜板，顶角不再有缝）。
  // 举高 1.15 m：与旧版四块板的最高点（≈ +1.07 m）齐平，天际线不变。
  AddHipRoof(sink, {
    x: p.x, y: roofY, z: p.z, ry, side: cabS, height: 1.15,
    seed: `${seed}:hip`, mat: tileMat, overhang: 0.44,
  });

  // 枪眼：瞭望间四面各两个，砖身朝外两面各一个
  for (let k = 0; k < 4; k += 1) {
    AddLoopholes(sink, {
      x: p.x, z: p.z, ry: ry + (k * Math.PI) / 2, ys: [cabMid + 0.05], count: 2,
      spread: 1.6, seed: `${seed}:cl${k}`, wallFace: cabS / 2 + 0.04, size: 0.22,
    });
  }
  // 砖身朝外的两面各一个（局部方向 → AddLoopholes 的 ry 偏角：+z→0、+x→π/2、-z→π、-x→-π/2）
  const outAlpha = [
    inward[0] > 0 ? -Math.PI / 2 : Math.PI / 2,
    inward[1] > 0 ? Math.PI : 0,
  ];
  outAlpha.forEach((alpha, k) => {
    AddLoopholes(sink, {
      x: p.x, z: p.z, ry: ry + alpha,
      ys: [footH + shaftH * 0.62], count: 1, spread: 0, seed: `${seed}:sl${k}`,
      wallFace: shaftS / 2 + 0.04, size: 0.22,
    });
  });

  // 内侧木梯：两根帮 + 七级横档（贴在朝院那一面）
  const ladderTop = shaftTop - 0.1;
  const lp = L(lx, lz + inward[1] * (shaftS / 2 + 0.16));
  for (const s of [-1, 1]) {
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.09, ladderTop, 0.09, TILE_METERS.wood, `${seed}:lr${s}`),
      { x: lp.x + s * 0.22 * Math.cos(ry), y: ladderTop / 2, z: lp.z - s * 0.22 * Math.sin(ry), ry }));
  }
  for (let i = 1; i <= 7; i += 1) {
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.52, 0.06, 0.06, TILE_METERS.wood, `${seed}:lg${i}`),
      { x: lp.x, y: (ladderTop * i) / 8, z: lp.z, ry }));
  }
  void damage;
}

// ---------------------------------------------------------------------------
// 重门
// ---------------------------------------------------------------------------
/**
 * 监狱大门：门洞净宽比民居院门更窄，两侧门墩比围墙高出一头，石过梁 + 门额，
 * 一扇门板半开（**必须留可走开口**：门板本身不登记碰撞，门洞两侧才是实体）。
 *
 * cabin=true 时门上加一间带枪眼的警戒室 —— 看守所不设转角岗楼，靠门楼加强。
 */
function AddHeavyGate(sink, {
  L, ry, lx, lz, openW, openH, wallH, thick, seed,
  damage = 0, mat = "PrisonWall", tileMat = "RoofTile", pierW = 1.6, cabin = false,
}) {
  const bodyH = wallH + 0.9;
  const jamb = thick + 0.55;
  for (const s of [-1, 1]) {
    const p = L(lx + s * (openW / 2 + pierW / 2), lz);
    sink.Add(mat, PlaceGeometry(
      MakeBox(pierW, bodyH, jamb, TILE_METERS.brick, `${seed}:pier${s}`, BRICK_UV_GRID),
      { x: p.x, y: bodyH / 2, z: p.z, ry }));
    sink.Solid(p.x, bodyH / 2, p.z, pierW / 2, bodyH / 2, jamb / 2, "wall", ry);
    const q = L(lx + s * (openW / 2 + 0.26), lz + jamb / 2 + 0.26);
    sink.Add("Stone", PlaceGeometry(
      MakeBox(0.46, 0.62, 0.46, TILE_METERS.stone, `${seed}:dun${s}`),
      { x: q.x, y: 0.31, z: q.z, ry }));
  }
  const c = L(lx, lz);
  // 石过梁：门洞上一条横贯的亮线
  sink.Add("Stone", PlaceGeometry(
    MakeBox(openW + pierW * 2, 0.46, jamb + 0.08, TILE_METERS.stone, `${seed}:lintel`),
    { x: c.x, y: openH + 0.23, z: c.z, ry }));
  // 洞上补墙：不登记碰撞，人从门洞底下走得过去
  const upH = bodyH - openH - 0.46;
  if (upH > 0.2) {
    sink.Add(mat, PlaceGeometry(
      MakeBox(openW, upH, jamb - 0.06, TILE_METERS.brick, `${seed}:up`, BRICK_UV_GRID),
      { x: c.x, y: openH + 0.46 + upH / 2, z: c.z, ry }));
  }
  // 门额匾
  const plaque = L(lx, lz + jamb / 2 + 0.04);
  sink.Add("Stone", PlaceGeometry(
    MakeBox(1.5, 0.44, 0.09, TILE_METERS.stone, `${seed}:plaque`),
    { x: plaque.x, y: openH + 0.94, z: plaque.z, ry }));

  // 门板：一扇闭一扇半开。两扇都不登记碰撞 —— 门洞必须能走人。
  const leafW = openW / 2 - 0.02;
  const leafH = openH - 0.12;
  for (const s of [-1, 1]) {
    const ang = s < 0 ? 0.0 : 1.22;           // 右扇半开约 70°
    const pivotX = lx + s * (openW / 2);
    const dx = -s * Math.cos(ang), dz = -Math.sin(ang);
    const cxL = pivotX + dx * (leafW / 2);
    const czL = lz + dz * (leafW / 2);
    const lp = L(cxL, czL);
    const leafRy = ry + (s < 0 ? 0 : Math.PI - ang);
    sink.Add("WoodDoor", PlaceGeometry(
      MakeBox(leafW, leafH, 0.13, TILE_METERS.wood, `${seed}:leaf${s}`),
      { x: lp.x, y: leafH / 2 + 0.08, z: lp.z, ry: leafRy }));
    // 铁箍：三条横带，把门板读成"包铁的重门"而不是一块木板
    for (let i = 0; i < 3; i += 1) {
      sink.Add("IronPlate", PlaceGeometry(
        MakeBox(leafW * 0.96, 0.12, 0.17, TILE_METERS.wood, `${seed}:band${s}${i}`),
        { x: lp.x, y: 0.42 + i * (leafH * 0.32), z: lp.z, ry: leafRy }));
    }
  }
  // 门槛石 + 门道墁地 + 木门框（局部 +z 指向"里"，故转 180°）
  AddDoorReveal(sink, {
    x: c.x, z: c.z, ry: ry + Math.PI, openW, openH, depth: jamb + 1.3,
    seed: `${seed}:rv`, paving: "Stone", sill: "Stone",
  });

  if (cabin) {
    // 门上警戒室：看守所不设转角岗楼，就靠这一间把"有人在上头看着"交代掉
    const cabH = 2.0, cabW = openW + pierW * 2 - 0.5, cabD = jamb + 0.5;
    sink.Add(mat, PlaceGeometry(
      MakeBox(cabW, cabH, cabD, TILE_METERS.brick, `${seed}:cab`, BRICK_UV_GRID),
      { x: c.x, y: bodyH + cabH / 2, z: c.z, ry }));
    sink.Solid(c.x, bodyH + cabH / 2, c.z, cabW / 2, cabH / 2, cabD / 2, "wall", ry);
    for (const k of [0, 2]) {
      AddLoopholes(sink, {
        x: c.x, z: c.z, ry: ry + (k * Math.PI) / 2, ys: [bodyH + cabH * 0.6], count: 2,
        spread: cabW * 0.5, seed: `${seed}:cl${k}`, wallFace: cabD / 2 + 0.04, size: 0.22,
      });
    }
    for (const s of [-1, 1]) {
      sink.Add(tileMat, PlaceGeometry(
        MakeBox(cabW + 0.7, 0.12, cabD * 0.78, TILE_METERS.roof, `${seed}:crf${s}`),
        { x: c.x + Math.sin(ry) * s * cabD * 0.26, y: bodyH + cabH + 0.28,
          z: c.z + Math.cos(ry) * s * cabD * 0.26, ry, rx: s * 0.52 }));
    }
  } else {
    // 门楼小瓦顶：两坡 + 一条脊
    for (const s of [-1, 1]) {
      sink.Add(tileMat, PlaceGeometry(
        MakeBox(openW + pierW * 2 + 0.8, 0.12, (jamb + 0.9) * 0.62, TILE_METERS.roof, `${seed}:rf${s}`),
        { x: c.x + Math.sin(ry) * s * (jamb + 0.9) * 0.24, y: bodyH + 0.34,
          z: c.z + Math.cos(ry) * s * (jamb + 0.9) * 0.24, ry, rx: s * 0.55 }));
    }
    sink.Add(tileMat, PlaceGeometry(
      MakeBox(openW + pierW * 2 + 0.9, 0.16, 0.3, TILE_METERS.roof, `${seed}:ridge`),
      { x: c.x, y: bodyH + 0.62, z: c.z, ry }));
  }
  void damage;
}

// ---------------------------------------------------------------------------
// 牢房排屋
// ---------------------------------------------------------------------------
/**
 * 窄开间牢房排屋。**三面完全无窗**，只有朝院的一面开一排等高等大的铁窗。
 *
 * `openCell` 指定**一扇牢门的开间号**，那一间（从这扇门往两边到隔壁牢门的中线为止）
 * 会被掏成可进的屋子：门半开、窗洞不再堵深色挡板、整排的实心碰撞盒拆成
 * 「实心段 + 隔墙 + 这一间的四壁」。传 -1 就是第一轮的行为：整排实心、全部封闭。
 *
 * @param {object} spec facing +1 = 铁窗那面朝局部 +z；-1 = 朝局部 -z
 */
function AddCellRow(sink, {
  L, ry, lx, lz, width, depth, seed, damage = 0, facing = 1,
  mat = "PrisonWall", tileMat = "RoofTile", doorEvery = 5, openCell = -1,
}) {
  const bays = Math.max(3, Math.round(width / CELL.bay));
  const bayW = width / bays;
  const eave = CELL.eave;
  const ridge = eave + (depth / 2) * CELL.slope;
  const t = 0.42;
  const halfD = depth / 2;
  const frontZ = lz + facing * halfD;
  const backZ = lz - facing * halfD;
  const faceOut = Dir(ry, 0, facing);
  // 可进的那一间横跨的开间号：从这扇门往两边各摊到与隔壁牢门的中线
  const hasOpen = openCell >= 0 && openCell < bays;
  const openA = hasOpen ? Math.max(0, openCell - 2) : 1;
  const openB = hasOpen ? Math.min(bays - 1, openCell + doorEvery - 3) : -1;

  // --- 背立面与两山：连续实墙，一个洞都没有（这一条比铁窗更能说明是牢房）---
  sink.Add(mat, PlaceGeometry(
    MakeBox(width, eave, t, TILE_METERS.brick, `${seed}:back`, BRICK_UV_GRID),
    { x: L(lx, backZ).x, y: eave / 2, z: L(lx, backZ).z, ry }));
  sink.Add("Stone", PlaceGeometry(
    MakeBox(width + 0.06, 0.42, t + 0.1, TILE_METERS.stone, `${seed}:backpl`),
    { x: L(lx, backZ).x, y: 0.21, z: L(lx, backZ).z, ry }));
  for (const s of [-1, 1]) {
    const p = L(lx + s * (width / 2), lz);
    sink.Add(mat, PlaceGeometry(
      MakeBox(t, eave, depth, TILE_METERS.brick, `${seed}:end${s}`, BRICK_UV_GRID),
      { x: p.x, y: eave / 2, z: p.z, ry }));
  }

  // --- 朝院一面：等间距的窄铁窗 + 每五间一扇牢门 ---
  const pierW = (bayW - CELL.winW) / 2;
  const upperH = Math.max(0.2, eave - CELL.sill - CELL.winH);
  for (let b = 0; b < bays; b += 1) {
    const off = -width / 2 + bayW * (b + 0.5);
    const isDoor = b % doorEvery === 2;
    const inOpen = b >= openA && b <= openB;
    const p = L(lx + off, frontZ);
    if (isDoor) {
      // 牢门：两侧填墙 + 木过梁 + 门槛 + 一扇厚门板
      const fill = (bayW - CELL.doorW) / 2;
      for (const s of [-1, 1]) {
        const q = L(lx + off + s * (CELL.doorW / 2 + fill / 2), frontZ);
        sink.Add(mat, PlaceGeometry(
          MakeBox(fill, eave, t, TILE_METERS.brick, `${seed}:df${b}${s}`, BRICK_UV_GRID),
          { x: q.x, y: eave / 2, z: q.z, ry }));
      }
      sink.Add("WoodBeam", PlaceGeometry(
        MakeBox(CELL.doorW + 0.3, 0.18, t + 0.06, TILE_METERS.wood, `${seed}:dl${b}`),
        { x: p.x, y: CELL.doorH + 0.09, z: p.z, ry }));
      const overH = Math.max(0.15, eave - CELL.doorH - 0.18);
      sink.Add(mat, PlaceGeometry(
        MakeBox(CELL.doorW, overH, t, TILE_METERS.brick, `${seed}:do${b}`, BRICK_UV_GRID),
        { x: p.x, y: CELL.doorH + 0.18 + overH / 2, z: p.z, ry }));
      const sillP = L(lx + off, frontZ + facing * (t / 2 + 0.12));
      sink.Add("Stone", PlaceGeometry(
        MakeBox(CELL.doorW + 0.34, 0.14, 0.42, TILE_METERS.stone, `${seed}:dsl${b}`),
        { x: sillP.x, y: 0.07, z: sillP.z, ry }));
      if (b === openCell) {
        // 可进的那一间：门半开（板斜插进屋里），门道做出进深
        AddOpenLeaf(sink, {
          L, ry, lx: lx + off, lz: frontZ, openW: CELL.doorW, openH: CELL.doorH,
          seed: `${seed}:od${b}`, hinge: 1, swing: -facing, angle: 1.25,
        });
        AddDoorReveal(sink, {
          x: p.x, z: p.z, ry: ry + (facing > 0 ? Math.PI : 0),
          openW: CELL.doorW, openH: CELL.doorH, depth: t + 0.9,
          seed: `${seed}:orv${b}`, paving: "Stone", sill: "Stone",
        });
        continue;
      }
      const leafP = L(lx + off, frontZ + facing * (t / 2 - 0.02));
      sink.Add("WoodDoor", PlaceGeometry(
        MakeBox(CELL.doorW - 0.05, CELL.doorH - 0.06, 0.11, TILE_METERS.wood, `${seed}:dd${b}`),
        { x: leafP.x, y: (CELL.doorH - 0.06) / 2 + 0.05, z: leafP.z, ry }));
      for (let i = 0; i < 2; i += 1) {
        sink.Add("IronPlate", PlaceGeometry(
          MakeBox(CELL.doorW - 0.1, 0.11, 0.15, TILE_METERS.wood, `${seed}:db${b}${i}`),
          { x: leafP.x, y: 0.55 + i * 0.86, z: leafP.z, ry }));
      }
      continue;
    }
    // 窗下墙 + 窗上墙 + 两侧窗间墙
    sink.Add(mat, PlaceGeometry(
      MakeBox(bayW, CELL.sill, t, TILE_METERS.brick, `${seed}:lo${b}`, BRICK_UV_GRID),
      { x: p.x, y: CELL.sill / 2, z: p.z, ry }));
    sink.Add(mat, PlaceGeometry(
      MakeBox(bayW, upperH, t, TILE_METERS.brick, `${seed}:hi${b}`, BRICK_UV_GRID),
      { x: p.x, y: CELL.sill + CELL.winH + upperH / 2, z: p.z, ry }));
    for (const s of [-1, 1]) {
      const q = L(lx + off + s * (CELL.winW / 2 + pierW / 2), frontZ);
      sink.Add(mat, PlaceGeometry(
        MakeBox(pierW, CELL.winH, t, TILE_METERS.brick, `${seed}:pi${b}${s}`, BRICK_UV_GRID),
        { x: q.x, y: CELL.sill + CELL.winH / 2, z: q.z, ry }));
    }
    // 洞里的暗：一块深色挡板退到墙厚里侧（同 AddDugout 的做法，读作"里面是暗的"）。
    // 可进的那一间**不能**有这块板 —— 屋里没有独立光源，全靠这几个窗洞进光，
    // 堵上就是站在屋里对着一堵黑墙（共用任务书「内部空间契约」第四条）。
    if (!inOpen) {
      const backP = L(lx + off, frontZ - facing * (t / 2 + 0.06));
      sink.Add("Charred", PlaceGeometry(
        MakeBox(CELL.winW + 0.06, CELL.winH + 0.04, 0.1, TILE_METERS.stone, `${seed}:wd${b}`),
        { x: backP.x, y: CELL.sill + CELL.winH / 2, z: backP.z, ry }));
    }
    // 三根竖铁栅（几何做，不动 tzm 贴图管线）
    const barP = L(lx + off, frontZ + facing * (t / 2 + 0.01));
    for (let i = 0; i < 3; i += 1) {
      sink.Add("IronPlate", PlaceGeometry(
        MakeBox(0.045, CELL.winH + 0.06, 0.09, TILE_METERS.wood, `${seed}:bar${b}${i}`),
        { x: barP.x + Math.cos(ry) * (-0.17 + i * 0.17), y: CELL.sill + CELL.winH / 2,
          z: barP.z - Math.sin(ry) * (-0.17 + i * 0.17), ry }));
    }
    // 窗台石：一条挑出的亮线，是"窗"而不是"墙上的斑"的读法
    const sp = L(lx + off, frontZ + facing * (t / 2 + 0.06));
    sink.Add("Stone", PlaceGeometry(
      MakeBox(CELL.winW + 0.34, 0.1, 0.3, TILE_METERS.stone, `${seed}:sl${b}`),
      { x: sp.x, y: CELL.sill - 0.05, z: sp.z, ry }));
  }

  // --- 硬山瓦顶 ---
  const rise = ridge - eave;
  const slopeLen = Math.hypot(halfD, rise);
  const overhang = 0.34;
  for (const s of [-1, 1]) {
    const p = L(lx, lz + s * (halfD / 2));
    sink.Add(tileMat, PlaceGeometry(
      MakeBox(width + overhang * 2, 0.12, slopeLen + overhang, TILE_METERS.roof, `${seed}:rs${s}`),
      { x: p.x, y: eave + rise / 2, z: p.z, ry, rx: s * Math.atan2(rise, halfD) }));
  }
  const rp = L(lx, lz);
  sink.Add(tileMat, PlaceGeometry(
    MakeBox(width + overhang * 2, 0.18, 0.34, TILE_METERS.roof, `${seed}:ridge`),
    { x: rp.x, y: ridge + 0.06, z: rp.z, ry }));
  // 硬山两端高出屋面的山墙
  for (const s of [-1, 1]) {
    const parts = [];
    const steps = 4;
    for (let i = 0; i < steps; i += 1) {
      const t0 = i / steps, t1 = (i + 1) / steps;
      const hh = eave + rise * (1 - Math.abs(t0 + t1 - 1));
      const segD = depth / steps;
      parts.push(PlaceGeometry(
        MakeBox(0.3, hh, segD, TILE_METERS.brick, `${seed}:g${s}${i}`),
        { x: 0, y: hh / 2, z: -depth / 2 + segD * (i + 0.5) }));
    }
    const p = L(lx + s * (width / 2 + 0.14), lz);
    sink.Add(mat, PlaceGeometry(MergeGeometries(parts), { x: p.x, y: 0, z: p.z, ry }));
  }

  const c = L(lx, lz);
  if (!hasOpen) {
    // 全封闭：整排一个实心盒（第一轮的行为，最省 collider）
    sink.Solid(c.x, eave / 2, c.z, width / 2 + 0.2, eave / 2, halfD, "wall", ry);
  } else {
    // 掏空一间：碰撞拆成「背墙 + 两山 + 这一间以外的实心段 + 隔墙 + 这一间的正立面」。
    // 每一块都比整排那一个盒子小，但加起来还是把除这一间以外的地方全填死。
    const bp = L(lx, backZ);
    sink.Solid(bp.x, eave / 2, bp.z, width / 2 + 0.2, eave / 2, t / 2 + 0.1, "wall", ry);
    for (const s of [-1, 1]) {
      const p = L(lx + s * (width / 2), lz);
      sink.Solid(p.x, eave / 2, p.z, t / 2 + 0.1, eave / 2, halfD, "wall", ry);
    }
    const edgeA = -width / 2 + bayW * openA;
    const edgeB = -width / 2 + bayW * (openB + 1);
    for (const [x0, x1] of [[-width / 2 - 0.2, edgeA], [edgeB, width / 2 + 0.2]]) {
      if (x1 - x0 <= 0.4) continue;                     // 只剩端墙那一点，端墙自己已经登记了
      const p = L(lx + (x0 + x1) / 2, lz);
      sink.Solid(p.x, eave / 2, p.z, (x1 - x0) / 2, eave / 2, halfD, "wall", ry);
    }
    // 隔墙：把这一间与隔壁隔开。撞到排屋端头时不用做 —— 那里本来就是山墙
    for (const [edge, inner, need] of [
      [edgeA, 1, openA > 0], [edgeB, -1, openB < bays - 1],
    ]) {
      if (!need) continue;
      const p = L(lx + edge, lz);
      sink.Add(mat, PlaceGeometry(
        MakeBox(ROOM.partT, eave, depth - t, TILE_METERS.brick, `${seed}:pt${inner}`, BRICK_UV_GRID),
        { x: p.x, y: eave / 2, z: p.z, ry }));
      sink.Solid(p.x, eave / 2, p.z, ROOM.partT / 2, eave / 2, (depth - t) / 2, "wall", ry);
    }
    // 这一间的正立面：窗间墙整开间实心，牢门只有两侧填墙实心 —— 门洞留空
    for (let b = openA; b <= openB; b += 1) {
      const off = -width / 2 + bayW * (b + 0.5);
      if (b === openCell) {
        const fill = (bayW - CELL.doorW) / 2;
        for (const s of [-1, 1]) {
          const q = L(lx + off + s * (CELL.doorW / 2 + fill / 2), frontZ);
          sink.Solid(q.x, eave / 2, q.z, fill / 2, eave / 2, t / 2 + 0.1, "wall", ry);
        }
      } else {
        const q = L(lx + off, frontZ);
        sink.Solid(q.x, eave / 2, q.z, bayW / 2, eave / 2, t / 2 + 0.1, "wall", ry);
      }
    }
    AddCellInterior(sink, {
      L, ry, seed: `${seed}:in`,
      x0: lx + edgeA + (openA > 0 ? ROOM.partT / 2 : t / 2),
      x1: lx + edgeB - (openB < bays - 1 ? ROOM.partT / 2 : t / 2),
      zBack: backZ + facing * (t / 2),
      zFront: frontZ - facing * (t / 2),
      facing, eave,
    });
  }
  const fc = L(lx, frontZ);
  sink.Cover(fc.x, fc.z, eave, faceOut[0], faceOut[1]);
  void damage;
}

/** 院内的一道矮隔墙 + 一扇窄门（二门／放风院的分格墙）。 */
function AddInnerGate(sink, {
  L, ry, lx, lz, length, axis, height, openW, seed, mat = "PrisonWall", tileMat = "RoofTile",
  thick = 0.42, ruin = 0,
}) {
  const segLen = (length - openW) / 2;
  for (const s of [-1, 1]) {
    const off = s * (openW / 2 + segLen / 2);
    AddSlabWall(sink, {
      L, ry, cx: axis === "x" ? lx + off : lx, cz: axis === "x" ? lz : lz + off,
      length: segLen, axis, height, thick, seed: `${seed}:w${s}`, ruin, mat, tileMat,
      outward: axis === "x" ? [0, 1] : [1, 0], segLen: 7,
    });
  }
  const c = L(lx, lz);
  const openH = Math.min(2.15, height - 0.5);
  sink.Add("WoodBeam", PlaceGeometry(
    MakeBox(openW + 0.5, 0.2, thick + 0.12, TILE_METERS.wood, `${seed}:lintel`),
    { x: c.x, y: openH + 0.1, z: c.z, ry: axis === "x" ? ry : ry + Math.PI / 2 }));
  const overH = Math.max(0.1, height - openH - 0.2);
  sink.Add(mat, PlaceGeometry(
    MakeBox(axis === "x" ? openW : thick, overH, axis === "x" ? thick : openW,
      TILE_METERS.brick, `${seed}:over`, BRICK_UV_GRID),
    { x: c.x, y: openH + 0.2 + overH / 2, z: c.z, ry }));
  AddDoorReveal(sink, {
    x: c.x, z: c.z, ry: ry + (axis === "x" ? Math.PI : -Math.PI / 2),
    openW, openH, depth: thick + 0.9, seed: `${seed}:rv`, paving: "Stone", sill: "Stone",
  });
}

// ---------------------------------------------------------------------------
// 内部陈设
// ---------------------------------------------------------------------------
/** 瓦罐／水缸。屋里唯一的圆东西 —— 一屋子直线里有一件圆的，屋子才不像模型。 */
function AddCrock(sink, { L, ry, lx, lz, seed, scale = 1, tag = "prop" }) {
  const p = L(lx, lz);
  const body = new THREE.CylinderGeometry(0.23 * scale, 0.29 * scale, 0.44 * scale, 10);
  ScaleRadialUv(body, 1.6, 0.5);
  sink.Add("HouseholdCeramic", PlaceGeometry(body, { x: p.x, y: 0.22 * scale, z: p.z, ry }));
  const neck = new THREE.CylinderGeometry(0.15 * scale, 0.23 * scale, 0.15 * scale, 10);
  ScaleRadialUv(neck, 1.6, 0.2);
  sink.Add("HouseholdCeramic", PlaceGeometry(neck,
    { x: p.x, y: 0.51 * scale, z: p.z, ry: ry + (HashString(seed) % 13) * 0.05 }));
  sink.Solid(p.x, 0.29 * scale, p.z, 0.26 * scale, 0.29 * scale, 0.26 * scale, tag, ry);
}

/**
 * 顶棚（苇箔）+ 三根梁。
 *
 * 两条不显眼但一错就穿帮的规矩：
 *   ① 顶棚要**盖过墙头**（w/d 传外皮尺寸而不是净空），否则战损削低的那几片墙
 *      会从顶棚外侧露出天光 —— 屋里抬头看见一排白牙（第一版实拍就是这样）；
 *   ② 梁在顶棚**底下**，不是上面。苇箔是搭在梁上的。
 */
function AddCeiling(sink, { L, ry, xc, zc, w, d, y, seed }) {
  const p = L(xc, zc);
  sink.Add("Wicker", PlaceGeometry(
    MakeBox(w, 0.05, d, TILE_METERS.cloth, `${seed}:cl`),
    { x: p.x, y, z: p.z, ry }));
  for (let i = 0; i < 3; i += 1) {
    const q = L(xc + (i - 1) * (w / 3.4), zc);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.14, 0.16, d * 0.99, TILE_METERS.wood, `${seed}:bm${i}`),
      { x: q.x, y: y - 0.11, z: q.z, ry }));
  }
}

/**
 * 可进的那一间牢房：通铺木板 + 草席 + 瓦罐 + 一地烂草。
 *
 * 陈设的口径是「**没有一件是私产**」：铺是公家的板，席是发的，罐是公用的，
 * 除此之外一件属于个人的东西都没有 —— 这一条比铁窗更能说明这里关的是人。
 * 所以不摆箱笼、不摆碗筷、不摆衣物，也不摆稻草人式的「生活感」。
 */
function AddCellInterior(sink, { L, ry, seed, x0, x1, zBack, zFront, facing, eave, wallT = 0.42 }) {
  const wIn = x1 - x0;
  const dIn = Math.abs(zFront - zBack);
  if (wIn < 1.4 || dIn < 1.4) return;
  const xc = (x0 + x1) / 2;
  const zc = (zBack + zFront) / 2;
  const rnd = Mulberry32(HashString(`${seed}:cell`));

  // 夯土地坪：不铺的话屋里露出的是院外那层带草的地面
  const fp = L(xc, zc);
  sink.Add("YardEarth", PlaceGeometry(
    MakeBox(wIn, 0.08, dIn, TILE_METERS.ground, `${seed}:floor`),
    { x: fp.x, y: 0.0, z: fp.z, ry }));
  AddCeiling(sink, {
    L, ry, xc, zc, w: wIn + wallT, d: dIn + wallT,
    y: eave - ROOM.ceilingY, seed: `${seed}:ceil`,
  });

  // --- 通铺：砖墩 + 两根托梁 + 一排木板，顺背墙一通到底 ---
  const bunkLen = Math.max(1.6, wIn - 0.5);
  const bunkZ = zBack + facing * (ROOM.bunkD / 2);
  const piers = Math.max(2, Math.round(bunkLen / 2.6));
  for (let i = 0; i <= piers; i += 1) {
    for (const s of [-1, 1]) {
      const px = xc - bunkLen / 2 + (bunkLen * i) / piers;
      const pz = bunkZ + facing * s * (ROOM.bunkD / 2 - 0.28);
      const q = L(Clamp(px, xc - bunkLen / 2 + 0.16, xc + bunkLen / 2 - 0.16), pz);
      sink.Add("PrisonWall", PlaceGeometry(
        MakeBox(0.32, ROOM.bunkH - 0.09, 0.3, TILE_METERS.brick, `${seed}:pier${i}${s}`, BRICK_UV_GRID),
        { x: q.x, y: (ROOM.bunkH - 0.09) / 2, z: q.z, ry }));
    }
  }
  for (const s of [-1, 1]) {
    const q = L(xc, bunkZ + facing * s * (ROOM.bunkD / 2 - 0.28));
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(bunkLen, 0.09, 0.14, TILE_METERS.wood, `${seed}:bear${s}`),
      { x: q.x, y: ROOM.bunkH - 0.045, z: q.z, ry }));
  }
  const planks = Math.max(3, Math.round(bunkLen / 0.55));
  for (let i = 0; i < planks; i += 1) {
    const px = xc - bunkLen / 2 + (bunkLen / planks) * (i + 0.5);
    const q = L(px, bunkZ);
    sink.Add("WoodDoor", PlaceGeometry(
      MakeBox((bunkLen / planks) * 0.93, 0.05, ROOM.bunkD, TILE_METERS.wood, `${seed}:pk${i}`),
      { x: q.x, y: ROOM.bunkH + 0.025, z: q.z, ry: ry + (rnd() - 0.5) * 0.012 }));
  }
  sink.Solid(L(xc, bunkZ).x, ROOM.bunkH / 2, L(xc, bunkZ).z,
    bunkLen / 2, ROOM.bunkH / 2, ROOM.bunkD / 2, "furniture", ry);

  // --- 草席：铺开的几张 + 卷起来靠墙的一卷 ---
  // 席面走 VillageStraw（枯草的黄褐）。三个都试过，这是最不坏的一个：
  //   · Wicker 压在 Sandbag 配方上，近景是**发亮的橙木板**，与身下的铺板分不开；
  //   · HouseholdCloth（ClothNra）实拍偏冷灰，一床草席读成一床铁皮；
  //   · VillageStraw 是纯色无贴图，室内直射下发白 —— 但「浅黄的席 / 深褐的板」
  //     这一层对比是对的。调色目标见报告（建议压到 0x6f5c3c）。
  const mats = Math.max(2, Math.min(4, Math.round(bunkLen / 3.0)));
  for (let i = 0; i < mats; i += 1) {
    const px = xc - bunkLen / 2 + (bunkLen / mats) * (i + 0.5) + (rnd() - 0.5) * 0.2;
    const q = L(px, bunkZ + facing * (rnd() - 0.5) * 0.18);
    sink.Add("VillageStraw", PlaceGeometry(
      MakeBox(0.86, 0.035, 1.72, TILE_METERS.cloth, `${seed}:mat${i}`),
      { x: q.x, y: ROOM.bunkH + 0.07, z: q.z, ry: ry + (rnd() - 0.5) * 0.09 }));
  }
  const roll = new THREE.CylinderGeometry(0.12, 0.12, 1.66, 8);
  ScaleRadialUv(roll, 1.2, 1.5);
  const rp = L(xc + bunkLen / 2 - 0.35, bunkZ);
  sink.Add("VillageStraw", PlaceGeometry(roll,
    { x: rp.x, y: ROOM.bunkH + 0.14, z: rp.z, ry, rz: Math.PI / 2 }));

  // --- 瓦罐：一只水罐一只便桶，摆在离铺最远的那个角 ---
  AddCrock(sink, { L, ry, lx: x1 - 0.5, lz: zFront - facing * 0.55, seed: `${seed}:cr0` });
  AddCrock(sink, { L, ry, lx: x1 - 1.05, lz: zFront - facing * 0.45, seed: `${seed}:cr1`, scale: 0.78 });

  // --- 地上的烂草：从铺上掉下来的那点，别铺满，三五处就够 ---
  for (let i = 0; i < 5; i += 1) {
    const px = x0 + 0.5 + rnd() * Math.max(0.2, wIn - 1.0);
    const pz = zBack + facing * (ROOM.bunkD + 0.25 + rnd() * Math.max(0.2, dIn - ROOM.bunkD - 0.6));
    const q = L(px, pz);
    sink.Add("VillageStraw", PlaceGeometry(
      MakeBox(0.34 + rnd() * 0.3, 0.03, 0.22 + rnd() * 0.24, TILE_METERS.cloth, `${seed}:st${i}`),
      { x: q.x, y: 0.05, z: q.z, ry: ry + rnd() * 3.1 }));
  }
}

/**
 * 牢头值房内部：桌案、锁具架、名牌墙。
 *
 * 这三件是 WP-A1 遗留 6 点名的。为什么偏偏是它们：值房与民居厢房的外壳一模一样
 * （同样的砖、同样的三开间、同样的格子窗），**只有屋里的东西能分开这两件事**。
 * 桌案上是册子不是饭碗；架子上挂的是锁与镣不是农具；墙上钉的是一格一格的名牌
 * 不是年画 —— 名牌墙尤其重要，它把「关着多少人」这个数量摆在墙上。
 *
 * @param {object} spec cx,cz 屋子中心（局部）；w,d 面阔进深；doorLx 门洞局部 x
 */
function AddDutyInterior(sink, {
  L, ry, cx, cz, w, d, eave, doorLx, seed, wallT = 0.36, facing = 1,
}) {
  // 净空 = 外皮 − **一个**墙厚（AddRoomBlock 的墙以 ±w/2 为中线、厚 wallT）。
  // 第一版按两个墙厚算，屋里所有靠墙的东西都离墙 0.18 m 浮着 —— 名牌墙成了一块
  // 飘在半空的板，钉在上面的名牌全被自己的底板挡掉。
  const wIn = w - wallT;
  const dIn = d - wallT;
  if (wIn < 2.5 || dIn < 2.5) return;
  const rnd = Mulberry32(HashString(`${seed}:duty`));
  const zBack = cz - facing * (dIn / 2);          // 背墙内表面（门在 +facing 那一面）
  const zFront = cz + facing * (dIn / 2);

  const fp = L(cx, cz);
  sink.Add("YardEarth", PlaceGeometry(
    MakeBox(wIn, 0.08, dIn, TILE_METERS.ground, `${seed}:floor`),
    { x: fp.x, y: 0.0, z: fp.z, ry }));
  AddCeiling(sink, {
    L, ry, xc: cx, zc: cz, w: wIn + wallT, d: dIn + wallT,
    y: eave - 0.30, seed: `${seed}:ceil`,
  });

  // --- ① 牢头桌案：正对门口，背靠名牌墙 ---
  const deskX = cx + Clamp(doorLx - cx, -wIn / 2 + 1.2, wIn / 2 - 1.2);
  const deskZ = zBack + facing * 1.15;
  const dp = L(deskX, deskZ);
  sink.Add("WoodDoor", PlaceGeometry(
    MakeBox(1.62, 0.07, 0.74, TILE_METERS.wood, `${seed}:top`),
    { x: dp.x, y: ROOM.deskH, z: dp.z, ry }));
  sink.Add("WoodDoor", PlaceGeometry(
    MakeBox(1.5, 0.22, 0.05, TILE_METERS.wood, `${seed}:apron`),
    { x: L(deskX, deskZ + facing * 0.34).x, y: ROOM.deskH - 0.21,
      z: L(deskX, deskZ + facing * 0.34).z, ry }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const q = L(deskX + sx * 0.72, deskZ + sz * 0.29);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.09, ROOM.deskH - 0.04, 0.09, TILE_METERS.wood, `${seed}:leg${sx}${sz}`),
      { x: q.x, y: (ROOM.deskH - 0.04) / 2, z: q.z, ry }));
  }
  sink.Solid(dp.x, ROOM.deskH / 2, dp.z, 0.81, ROOM.deskH / 2, 0.37, "furniture", ry);
  // 案上：两摞册子 + 一方砚 + 一盏油灯。摆得偏一侧，中间空出写字的地方
  for (let i = 0; i < 2; i += 1) {
    const q = L(deskX - 0.52 + i * 0.30, deskZ - facing * 0.08);
    sink.Add("HouseholdCloth", PlaceGeometry(
      MakeBox(0.24, 0.07 + i * 0.04, 0.32, TILE_METERS.cloth, `${seed}:book${i}`),
      { x: q.x, y: ROOM.deskH + 0.04 + (0.07 + i * 0.04) / 2, z: q.z, ry: ry + (rnd() - 0.5) * 0.2 }));
  }
  const inkP = L(deskX + 0.42, deskZ - facing * 0.1);
  sink.Add("Charred", PlaceGeometry(
    MakeBox(0.17, 0.04, 0.13, TILE_METERS.stone, `${seed}:ink`),
    { x: inkP.x, y: ROOM.deskH + 0.055, z: inkP.z, ry }));
  const lampP = L(deskX + 0.66, deskZ + facing * 0.12);
  sink.Add("IronPlate", PlaceGeometry(
    MakeBox(0.13, 0.05, 0.13, TILE_METERS.wood, `${seed}:lampbase`),
    { x: lampP.x, y: ROOM.deskH + 0.06, z: lampP.z, ry }));
  sink.Add("IronPlate", PlaceGeometry(
    MakeBox(0.06, 0.16, 0.06, TILE_METERS.wood, `${seed}:lampstem`),
    { x: lampP.x, y: ROOM.deskH + 0.16, z: lampP.z, ry }));
  // 条凳：在案子里侧（牢头坐着面朝门）
  const benchP = L(deskX, deskZ - facing * 0.62);
  sink.Add("WoodDoor", PlaceGeometry(
    MakeBox(1.1, 0.1, 0.3, TILE_METERS.wood, `${seed}:benchseat`),
    { x: benchP.x, y: 0.46, z: benchP.z, ry }));
  for (const s of [-1, 1]) {
    const q = L(deskX + s * 0.42, deskZ - facing * 0.62);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.09, 0.41, 0.22, TILE_METERS.wood, `${seed}:benchleg${s}`),
      { x: q.x, y: 0.205, z: q.z, ry }));
  }

  // --- ② 锁具架：贴一侧山墙，两根立柱 + 两道横杆 + 挂着的锁与镣 ---
  const rackX = cx - wIn / 2 + 0.22;
  const rackZ = cz - facing * 0.2;
  // 架子后面钉一块深色板：铁器与青砖都是冷灰，不垫底板近景根本分不出来
  const backP = L(rackX - 0.10, rackZ);
  sink.Add("WoodBeam", PlaceGeometry(
    MakeBox(0.05, 1.30, 1.92, TILE_METERS.wood, `${seed}:rback`),
    { x: backP.x, y: 1.50, z: backP.z, ry }));
  for (const s of [-1, 1]) {
    const q = L(rackX, rackZ + s * 0.88);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.10, 1.96, 0.10, TILE_METERS.wood, `${seed}:rp${s}`),
      { x: q.x, y: 0.98, z: q.z, ry }));
    sink.Solid(q.x, 0.98, q.z, 0.08, 0.98, 0.08, "furniture", ry);
  }
  for (let i = 0; i < 2; i += 1) {
    const q = L(rackX, rackZ);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.08, 0.08, 1.84, TILE_METERS.wood, `${seed}:rb${i}`),
      { x: q.x, y: 1.22 + i * 0.56, z: q.z, ry }));
  }
  // 挂着的铁锁：上下两排交错，够密才读得出「一屋子的锁」
  for (let i = 0; i < 8; i += 1) {
    const q = L(rackX + 0.09, rackZ - 0.78 + i * 0.22);
    const row = i % 2;
    sink.Add("IronPlate", PlaceGeometry(
      MakeBox(0.13, 0.22, 0.16, TILE_METERS.wood, `${seed}:lock${i}`),
      { x: q.x, y: 1.22 + row * 0.56 - 0.18, z: q.z, ry }));
  }
  // 两副脚镣：环 + 链，挂在上排横杆上
  for (let i = 0; i < 2; i += 1) {
    const ring = new THREE.TorusGeometry(0.13, 0.028, 4, 8);
    ring.rotateY(Math.PI / 2);
    const q = L(rackX + 0.10, rackZ + 0.44 + i * 0.34);
    sink.Add("IronPlate", PlaceGeometry(ring, { x: q.x, y: 1.60, z: q.z, ry }));
    sink.Add("IronPlate", PlaceGeometry(
      MakeBox(0.05, 0.34, 0.05, TILE_METERS.wood, `${seed}:chain${i}`),
      { x: q.x, y: 1.42, z: q.z, ry }));
  }

  // --- ③ 名牌墙：钉在背墙上的一块底板 + 一格一格的木牌（缺几块、歪几块）---
  // 底板贴墙、名牌钉在底板**朝屋里**那一面（+facing）—— 方向弄反就整面墙空白
  const boardW = Math.min(2.9, wIn - 1.0);
  const bp = L(deskX, zBack + facing * 0.03);
  sink.Add("WoodBeam", PlaceGeometry(
    MakeBox(boardW, 1.18, 0.06, TILE_METERS.wood, `${seed}:board`),
    { x: bp.x, y: 1.66, z: bp.z, ry }));
  const cols = Math.max(5, Math.round(boardW / 0.30));
  for (let r = 0; r < 3; r += 1) {
    for (let cIdx = 0; cIdx < cols; cIdx += 1) {
      if (rnd() < 0.14) continue;                       // 空出来的那几格：人不在了
      const q = L(deskX - boardW / 2 + (boardW / cols) * (cIdx + 0.5),
        zBack + facing * 0.085);
      // 名牌走 HouseholdCloth（浅暖色）而不是木色：木牌钉在木底板上，
      // 近景是一整片木头，「一格一格」这层意思就没了 —— 要的是深底浅牌的对比
      sink.Add("HouseholdCloth", PlaceGeometry(
        MakeBox((boardW / cols) * 0.58, 0.22, 0.02, TILE_METERS.cloth, `${seed}:tag${r}${cIdx}`),
        { x: q.x, y: 2.08 - r * 0.38, z: q.z, ry, rz: rnd() < 0.16 ? (rnd() - 0.5) * 0.55 : 0 }));
    }
  }

  // 屋角一只水罐：值房也是有人整天坐着的地方
  AddCrock(sink, { L, ry, lx: cx + wIn / 2 - 0.45, lz: zBack + facing * 0.5, seed: `${seed}:crock` });
  void zFront;
}

/**
 * `AddRoomBlock` 的门板是它内部 `rnd() < 0.55` 抽出来的：抽中就在 1.25 m 的门洞里
 * 糊上两扇 0.60 m 的板，**视觉上完全堵死**（碰撞照旧是通的 —— 人穿板而过）。
 * 牢头值房要读作「可进」，所以在这里挑一个抽不中的 seed，再自己摆一扇半开的门板。
 * 换 seed 只改砖面 UV 噪声与山墙口眼的有无，形制尺寸一个字不变。
 *
 * 正解是让 `AddRoomBlock` 收一个 `doorLeaf` 参数，但那是共享文件 —— 见报告。
 */
function SeedWithoutDoorLeaves(base) {
  for (const suffix of ["", "a", "b", "c", "d", "e", "f", "g", "h"]) {
    if (Mulberry32(HashString(`${base}${suffix}:rb`))() >= 0.55) return `${base}${suffix}`;
  }
  return base;
}

// ---------------------------------------------------------------------------
// 监狱
// ---------------------------------------------------------------------------
export function BuildPrison(host, f, ctx) {
  const sink = host.sink;
  const ry = ctx.ry ?? 0;
  const damage = ctx.damage ?? 0;
  const burnt = !!ctx.burnt;
  const mat = burnt ? "BrickWallSooty" : "PrisonWall";
  const tileMat = burnt ? "BrickWallSooty" : "RoofTile";
  const seed = `map:${f.id}`;
  const L = Frame(f.x, f.z, ry);
  const hw = f.w / 2, hd = f.d / 2;
  const ruin = Clamp(damage * 0.5, 0, 0.5);
  const H = JAIL.wallHeight, T = JAIL.wallThick;

  // --- 围墙四面。大门在局部 +z 那一面，只此一处开口 ---
  const gateSpan = JAIL.gateOpenW + 3.2;
  const frontSeg = (f.w - gateSpan) / 2;
  for (const s of [-1, 1]) {
    AddSlabWall(sink, {
      L, ry, cx: s * (gateSpan / 2 + frontSeg / 2), cz: hd, length: frontSeg, axis: "x",
      height: H, thick: T, seed: `${seed}:fw${s}`, ruin, mat, tileMat, outward: [0, 1],
    });
  }
  AddSlabWall(sink, {
    L, ry, cx: 0, cz: -hd, length: f.w, axis: "x", height: H, thick: T,
    seed: `${seed}:bw`, ruin, mat, tileMat, outward: [0, -1],
  });
  for (const s of [-1, 1]) {
    AddSlabWall(sink, {
      L, ry, cx: s * hw, cz: 0, length: f.d, axis: "z", height: H, thick: T,
      seed: `${seed}:sw${s}`, ruin, mat, tileMat, outward: [s, 0],
    });
  }

  // --- 重门 ---
  AddHeavyGate(sink, {
    L, ry, lx: 0, lz: hd, openW: JAIL.gateOpenW, openH: JAIL.gateOpenH,
    wallH: H, thick: T, seed: `${seed}:gate`, damage, mat, tileMat,
  });
  // 门墩上的枪眼：巷战里这道门是要守的
  for (const s of [-1, 1]) {
    const p = L(s * 1.45, hd);
    AddLoopholes(sink, {
      x: p.x, z: p.z, ry, ys: [3.3], count: 1, spread: 0,
      seed: `${seed}:gl${s}`, wallFace: (T + 0.55) / 2 + 0.04, size: 0.22,
    });
  }

  // --- 转角岗楼：门口一座、对角一座，两座就能看住四面墙 ---
  AddGuardTower(sink, {
    L, ry, lx: hw - 1.4, lz: hd - 1.4, seed: `${seed}:twA`, damage, mat, tileMat,
    inward: [-1, -1],
  });
  AddGuardTower(sink, {
    L, ry, lx: -hw + 1.4, lz: -hd + 1.4, seed: `${seed}:twB`, damage, mat, tileMat,
    inward: [1, 1],
  });

  // --- 一进：门房／值房两块 + 二门；两侧再用实墙接到围墙，一进二进真正隔开 ---
  const dutyZ = hd - 6.5;             // 前院进深 6.5 m
  const dutyD = 5.0;
  const dutyW = Math.min(11, Math.max(6, hw - 6));
  const septumZ = dutyZ - dutyD / 2;
  const dutyBays = Math.max(2, Math.round(dutyW / 3.4));   // 值房是办公用房，开间照民居 3.0—3.6
  const dutyEave = 2.75;
  for (const s of [-1, 1]) {
    const dutyLx = s * (2.6 + dutyW / 2);
    const p = L(dutyLx, septumZ);
    // 西边那一块是**牢头值房**（门半开、屋里有陈设）；东边那一块照旧是关着门的办公房。
    // 两块外壳完全一样 —— 一开一闭本身就是「哪一间有人」的交代。
    const open = s < 0;
    AddRoomBlock(sink, {
      x: p.x, z: p.z, ry, width: dutyW, depth: dutyD,
      eaveY: dutyEave, ridgeY: dutyEave + dutyD * 0.5 * 0.5,
      seed: `${seed}:duty${s}`,
      doorLeaf: open ? "none" : "random",   // 共享文件已支持，替代挑 seed 的绕法
      damage, burnt, facing: -1, bays: dutyBays,
    });
    if (open) {
      // AddRoomBlock 的门在明间：局部 x 与本文件同向，局部 -z 面（= 这里的 +z）朝前院
      const doorLx = dutyLx - dutyW / 2 + (dutyW / dutyBays) * (Math.floor(dutyBays / 2) + 0.5);
      AddOpenLeaf(sink, {
        L, ry, lx: doorLx, lz: septumZ + dutyD / 2, openW: 1.25, openH: 2.0,
        seed: `${seed}:dutyleaf`, hinge: 1, swing: -1, angle: 1.18, thick: 0.06, bands: 0,
      });
      AddDutyInterior(sink, {
        L, ry, cx: dutyLx, cz: septumZ, w: dutyW, d: dutyD, eave: dutyEave,
        doorLx, seed: `${seed}:dutyin`, facing: 1,
      });
    }
    const flankStart = 2.6 + dutyW;
    const flankLen = hw - flankStart;
    if (flankLen > 0.6) {
      AddSlabWall(sink, {
        L, ry, cx: s * (flankStart + flankLen / 2), cz: septumZ, length: flankLen, axis: "x",
        height: 3.6, thick: 0.42, seed: `${seed}:sep${s}`, ruin: ruin * 0.7,
        mat, tileMat, outward: [0, 1], segLen: 7,
      });
    }
  }
  AddInnerGate(sink, {
    L, ry, lx: 0, lz: septumZ, length: 5.2, axis: "x", height: 3.6,
    openW: JAIL.innerGateW, seed: `${seed}:inner`, mat, tileMat, ruin: ruin * 0.6,
  });

  // --- 二进：放风院（分两格）+ 两排牢房，中间一条甬道 ---
  const yardFront = dutyZ - dutyD;            // 放风院前沿
  const cellW = Math.min(f.w - 10, 33);
  const cellD = 5.6;
  const rowAZ = yardFront - 4.2 - cellD / 2;  // 放风院进深 4.2
  const corridor = 2.8;                       // 两排牢房之间的甬道
  const rowBZ = rowAZ - cellD - corridor;

  AddSlabWall(sink, {
    L, ry, cx: 0, cz: (yardFront + (rowAZ + cellD / 2)) / 2, length: yardFront - (rowAZ + cellD / 2),
    axis: "z", height: 2.4, thick: 0.36, seed: `${seed}:pen`, ruin: ruin * 0.8,
    mat, tileMat, outward: [1, 0], segLen: 6,
  });
  for (const s of [-1, 1]) {
    const p = L(s * (cellW / 4), yardFront - 2.4);
    AddYardWear(sink, { x: p.x, z: p.z, ry, baseY: 0, seed: `${seed}:yard${s}`, radius: 3.6 });
  }

  AddCellRow(sink, {
    L, ry, lx: 0, lz: rowAZ, width: cellW, depth: cellD,
    seed: `${seed}:rowA`, damage, facing: 1, mat, tileMat,
  });
  // 后排西头那一间开着 —— 它的门正对甬道口（甬道从两排的端头绕进来），
  // 是玩家从放风院一路走进来第一个能推开的门。其余牢房照旧全封闭。
  AddCellRow(sink, {
    L, ry, lx: 0, lz: rowBZ, width: cellW, depth: cellD,
    seed: `${seed}:rowB`, damage, facing: 1, mat, tileMat, openCell: 2,
  });

  // --- 后院：伙房／杂房 + 一口井 ---
  const backZ = rowBZ - cellD / 2;            // 后排牢房的背墙
  const backRun = backZ + hd;                 // 背墙到围墙的净距
  if (backRun > 4.6) {
    const kitchenD = Math.min(4.2, backRun - 2.0);
    const kitchenZ = -hd + backRun / 2;
    const p = L(-hw + 8.0, kitchenZ);
    AddRoomBlock(sink, {
      x: p.x, z: p.z, ry, width: 11, depth: kitchenD,
      eaveY: 2.6, ridgeY: 2.6 + kitchenD * 0.5 * 0.5,
      seed: `${seed}:kitchen`, damage, burnt, facing: -1, bays: 2, roofRafters: false,
    });
    const w = L(hw - 6.0, kitchenZ);
    AddWell(sink, w.x, w.z);
  }
}

// ---------------------------------------------------------------------------
// 看守所：同族小一号
// ---------------------------------------------------------------------------
export function BuildDetention(host, f, ctx) {
  const sink = host.sink;
  const ry = ctx.ry ?? 0;
  const damage = ctx.damage ?? 0;
  const burnt = !!ctx.burnt;
  const mat = burnt ? "BrickWallSooty" : "PrisonWall";
  const tileMat = burnt ? "BrickWallSooty" : "RoofTile";
  const seed = `map:${f.id}`;
  const L = Frame(f.x, f.z, ry);
  const hw = f.w / 2, hd = f.d / 2;
  const ruin = Clamp(damage * 0.55, 0, 0.55);
  const H = DETENTION.wallHeight, T = DETENTION.wallThick;

  // --- 围墙：同样是连续无窗的实墙，只是矮一档 ---
  const gateSpan = DETENTION.gateOpenW + 3.0;
  const frontSeg = (f.w - gateSpan) / 2;
  for (const s of [-1, 1]) {
    AddSlabWall(sink, {
      L, ry, cx: s * (gateSpan / 2 + frontSeg / 2), cz: hd, length: frontSeg, axis: "x",
      height: H, thick: T, seed: `${seed}:fw${s}`, ruin, mat, tileMat, outward: [0, 1], segLen: 8,
    });
  }
  AddSlabWall(sink, {
    L, ry, cx: 0, cz: -hd, length: f.w, axis: "x", height: H, thick: T,
    seed: `${seed}:bw`, ruin, mat, tileMat, outward: [0, -1], segLen: 8,
  });
  for (const s of [-1, 1]) {
    AddSlabWall(sink, {
      L, ry, cx: s * hw, cz: 0, length: f.d, axis: "z", height: H, thick: T,
      seed: `${seed}:sw${s}`, ruin, mat, tileMat, outward: [s, 0], segLen: 8,
    });
  }

  // --- 门楼加强（无转角岗楼，警戒室做在门上）---
  AddHeavyGate(sink, {
    L, ry, lx: 0, lz: hd, openW: DETENTION.gateOpenW, openH: DETENTION.gateOpenH,
    wallH: H, thick: T, seed: `${seed}:gate`, damage, mat, tileMat, pierW: 1.4, cabin: true,
  });

  // --- 一进：值房横排，东端留过道通后院 ---
  const dutyD = 4.6;
  const dutyZ = hd - 4.5 - dutyD / 2;
  const dutyW = Math.min(f.w - 8.0, 14);
  const dutyLx = -(hw - 1.0 - dutyW / 2);        // 值房贴一侧围墙，另一端让出过道
  const dutyP = L(dutyLx, dutyZ);
  AddRoomBlock(sink, {
    x: dutyP.x, z: dutyP.z, ry, width: dutyW, depth: dutyD,
    eaveY: 2.7, ridgeY: 2.7 + dutyD * 0.5 * 0.5,
    seed: `${seed}:duty`, damage, burnt, facing: -1,
    bays: Math.max(2, Math.round(dutyW / 3.4)),
  });
  // 值房东端到围墙之间的过道，横一道二门（窄门，同监狱的形制）——
  // 值房 + 这道墙合起来就是把前院与押房院隔开的那一进。
  const laneStart = dutyLx + dutyW / 2;
  const laneLen = hw - laneStart;
  if (laneLen > DETENTION.innerGateW + 1.2) {
    AddInnerGate(sink, {
      L, ry, lx: laneStart + laneLen / 2, lz: dutyZ + dutyD / 2, length: laneLen, axis: "x",
      height: 3.0, openW: DETENTION.innerGateW, seed: `${seed}:inner`, mat, tileMat,
      ruin: ruin * 0.6,
    });
  }

  // --- 二进：押房 ---
  const cellW = Math.min(f.w - 7.0, 22);
  const cellD = 5.6;
  const cellZ = -hd + 3.4 + cellD / 2;
  // 押房也开一间（西头那一间，门正对院子）：看守所是「关几天等发落」的地方，
  // 一间开着、其余闭着，正好是它与监狱的分别 —— 监狱那间开在甬道深处，这间开在院里。
  AddCellRow(sink, {
    L, ry, lx: 0, lz: cellZ, width: cellW, depth: cellD,
    seed: `${seed}:cells`, damage, facing: 1, mat, tileMat, doorEvery: 4, openCell: 2,
  });
  const yp = L(0, cellZ + cellD / 2 + 2.2);
  AddYardWear(sink, { x: yp.x, z: yp.z, ry, baseY: 0, seed: `${seed}:yard`, radius: 3.2 });
}
