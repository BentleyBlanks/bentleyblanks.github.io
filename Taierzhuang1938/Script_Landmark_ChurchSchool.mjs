// 天主堂（church）+ 学校（school：书院小学 / 滕文中学旧址）。工作包 A7 专属文件。
// 契约见 Script_LandmarkRegistry.mjs 头注。
//
// —— 史实纪律 ——
// 天主堂：`[信史]`（JACAR C11111170200 №1472 + 姜克实注）只给出「城内靠近内城墙的德国
// 天主堂」这一件事；中方记载另有「南关天主教堂防空洞」。两说并列，Data_Tengxian 已各
// 建一处（CatholicChurchInner / CatholicChurchSouth），本文件不合并、不加戏。
// **形制、规模、有无钟楼、几进院落一概无资料**（docs/Data_TengxianCity.md uncertainties），
// 所以这里做的是「最保守的单钟塔小堂」：一个单中厅 + 一座贴山面的方钟塔。
// 搜索引擎会把青岛圣弥厄尔（双塔 56 m、堂高 18 m）串成滕县的答案 —— 那是另一座城的教堂，
// 绝不照抄：这里的塔高一律取 f.towerH（16 / 12 m），中厅只有 11 / 9 m 宽。
// 德国教产的立面语言只留三条最低限度的：清水砖砌体 + 浅色抹面线脚（ChurchPlaster）+
// 尖券窗的开间节奏；屋面用筒瓦，因为鲁南的施工队只有这一种瓦。
//
// 学校：书院小学、滕文中学旧址两处都来自城防示意图（source:"diagram"），
// 只有位置与占地可读，**形制无资料**。做成民国县城学校最没有争议的那一种：
// 一圈围墙 + 挂匾的门楼 + 一进（或两进）横长教室 + 操场旗杆。
// 教室与民居的分野只用一条可辨认的：**连续大窗**（民居对外不开窗、朝院窗 1.05 m；
// 教室朝院一面是 1.5 m 宽、间距 3.4 m 的连排窗）。滕文中学 66 m 比书院小学多一进。
//
// —— 第二轮（WP-D4）：内部空间 ——
// 上一轮这两处都是封闭盒子（A7 遗留 5、遗留 8）。本轮各开一处可进入的内部：
//   · 天主堂中厅：塔下门道 → 山墙券口 → 中厅。两列长椅 + 尽端圣坛（台/桌/十字架）+
//     沿墙根的**难民铺盖卷/包袱/水罐**。那一带铺盖是「外国権益擁護」那条剧情线在
//     画面上的落点：日军 16 日不敢炸这座房子，于是城里的人往这儿躲。
//   · 学校：临操场那一排的当中一间教室（门所在的三个开间，两道隔墙划出来），
//     课桌凳五排 + 讲台 + 黑板。别的开间仍是暗盒 —— 只做一间，省三角也省歧义。
// 三条硬约束（共用任务书「内部空间契约」）：
//   ① 门洞必须真的可走：塔基从整块方台改成被门道劈开的两块（原来 1.0 m 高的石台
//      正好把门槛顶到半人高），塔身 ±z 两片墙各开洞，中厅山墙当中留口，
//      沿途一个碰撞盒都不许落在门道净宽里（自测用轴线采样探针，0—1.8 m 全空）。
//   ② 家具一律走 sink（合批 + 破坏一致），tag 用已注册的 furniture/householdCrock。
//   ③ 内部没有独立光源，全靠门窗洞采光 —— 所以中厅侧窗与教室那三个开间的
//      `Charred` 暗内衬要撤掉（那本来是「防止从窗洞看穿到对面天空」的补丁，
//      有了内部空间它就变成了一块堵死采光的黑板）。其余开间的暗内衬保留。

import * as THREE from "three";
import { AddWall, AddHardMountainRoof, AddDoorReveal } from "./Script_World.mjs";
import { MakeBox, PlaceGeometry, TILE_METERS, BRICK_UV_GRID } from "./Script_Geo.mjs";
import { Mulberry32, HashString, Clamp } from "./Script_Noise.mjs";

// ---------------------------------------------------------------------------
// 局部坐标系
//
// 本文件统一用**与 PlaceGeometry 的 ry 一致**的那一套：
//   局部 +x → 世界 (cos ry, -sin ry)，局部 +z → 世界 (sin ry, cos ry)
// 也就是 Script_World.AddChurch / AddDoorReveal 用的那一套（three 的 rotateY 语义）。
// 注意 AddCompound / AddRoomBlock / AddFeatureRoom 用的是 z 取反的另一套 —— 本文件
// 不调用它们，避免两套约定混用后房子朝向被镜像。
// 约定：局部 +z 是**正面**（ry=0 时朝世界 +z，即城南方向；坐北朝南）。
// ---------------------------------------------------------------------------
export function MakeFrame(x, z, ry) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  return (lx, lz) => ({ x: x + cos * lx + sin * lz, z: z - sin * lx + cos * lz });
}

/**
 * 尖券窗一扇。
 *
 * 做成「真开洞 + 深色内衬」而不是往墙上贴一块石头：窗洞两侧是砖墩、上下是砖带，
 * 洞里退进去 一片暗（Charred），石套（窗台 + 两侧线脚 + 两根斜券石）骑在墙厚上
 * 微微出挑。斜券石在暗面上切出那个尖 —— 「尖券」这三个字全靠这两根石条，
 * 不靠贴图。内衬不能省：中厅是个封闭盒子，没有内衬就会从窗洞一眼看穿到对面天空。
 *
 * @param {object} sink BuildSink
 * @param {object} spec cx/cz 洞口中心的世界坐标；rot 该面墙的走向（ry 或 ry+PI/2）
 */
function AddLancetWindow(sink, {
  cx, cz, rot, sillY, openW, winH, archH, thickness, seed,
  stone = "CrossStone", dark = "Charred",
}) {
  const along = { x: Math.cos(rot), z: -Math.sin(rot) };
  const at = (off) => ({ x: cx + along.x * off, z: cz + along.z * off });
  // 洞里的暗：退到墙心，前后都留出洞口进深。
  // dark=null 表示这面墙后头是**做了内部空间的中厅** —— 那时这块暗盒就不是
  // 「挡穿透」而是「堵采光」，必须撤掉，让窗洞变成真正透光的洞。
  const darkH = winH + archH * 0.62;
  if (dark) {
    sink.Add(dark, PlaceGeometry(
      MakeBox(openW - 0.26, darkH, thickness * 0.42, TILE_METERS.stone, `${seed}:dk`),
      { x: cx, y: sillY + darkH / 2, z: cz, ry: rot }));
  }
  // 窗台石
  sink.Add(stone, PlaceGeometry(
    MakeBox(openW + 0.36, 0.17, thickness + 0.26, TILE_METERS.stone, `${seed}:sill`),
    { x: cx, y: sillY - 0.085, z: cz, ry: rot }));
  // 两侧石套
  for (const s of [-1, 1]) {
    const p = at(s * (openW / 2 - 0.07));
    sink.Add(stone, PlaceGeometry(
      MakeBox(0.15, winH + 0.2, thickness + 0.12, TILE_METERS.stone, `${seed}:jm${s}`),
      { x: p.x, y: sillY + (winH + 0.2) / 2, z: p.z, ry: rot }));
  }
  // 斜券石：左半上抬（rz>0），右半下压（rz<0），在洞口顶上交成一个尖
  for (const s of [-1, 1]) {
    const p = at(s * openW * 0.23);
    sink.Add(stone, PlaceGeometry(
      MakeBox(openW * 0.62, 0.19, thickness + 0.1, TILE_METERS.stone, `${seed}:ar${s}`),
      { x: p.x, y: sillY + winH + archH * 0.30, z: p.z, ry: rot, rz: -s * 0.68 }));
  }
}

/**
 * 一处难民铺位：一床摊开的旧棉被 + 卷起来当枕头的那一头 + 一只包袱（+ 有时一只水罐）。
 *
 * 这是本包的**剧情落点**，不是装饰：日军 16 日受「外国権益擁護」限制没炸这座房子，
 * 所以城里的人往这儿躲。要让玩家进门第一眼看见的是「有人在这儿住过」而不是空长椅，
 * 铺位就得压在墙根、挨着长椅排开、并且高度全部在 0.25 m 以下 —— 不挡路、不挡枪，
 * 只挡视线里的那一点空。
 *
 * @param {number} axis 铺盖长向：0 = 沿局部 x，1 = 沿局部 z
 * @param {number} wallSide 墙在铺位的哪一侧（-1 / +1）。水罐永远贴墙那一边、
 *        包袱永远在朝屋里那一边 —— 摆反了水罐就伸进过道，探针会当场撞上。
 */
function AddRefugeeBedding(sink, {
  x, z, ry, seed, axis = 1, jar = false, damage = 0, wallSide = -1,
}) {
  const rnd = Mulberry32(HashString(seed));
  const long = 1.62 + rnd() * 0.26;
  const wide = 0.62 + rnd() * 0.14;
  const tilt = (rnd() - 0.5) * 0.18;
  const rot = ry + (axis ? 0 : Math.PI / 2) + tilt;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const At = (lx, lz) => ({ x: x + cos * lx + sin * lz, z: z - sin * lx + cos * lz });
  // 苇席打底。第一版只有一块灰布板贴在地上，出图读成「地上摆了块水泥板」——
  // 一床铺盖之所以认得出是铺盖，靠的是**席子的暖黄压在冷灰石地上**这个对比，
  // 不是被子本身的形状。Wicker 是已登记的竹柳编材质，正好是苇席那个色。
  sink.Add("Wicker", PlaceGeometry(
    MakeBox(wide + 0.28, 0.05, long + 0.22, TILE_METERS.wood, `${seed}:mat`),
    { x, y: 0.045, z, ry: rot }));
  // 摊开的被褥：厚一档才有布的体积
  sink.Add("HouseholdCloth", PlaceGeometry(
    MakeBox(wide, 0.19, long * 0.82, TILE_METERS.wood, `${seed}:quilt`),
    { x: At(0, long * 0.07).x, y: 0.16, z: At(0, long * 0.07).z, ry: rot }));
  // 叠起来的一床压在上头（两层才不像一块板）
  sink.Add("HouseholdCloth", PlaceGeometry(
    MakeBox(wide * 0.78, 0.16, long * 0.34, TILE_METERS.wood, `${seed}:fold`),
    {
      x: At(0, long * 0.24).x, y: 0.33, z: At(0, long * 0.24).z,
      ry: rot + 0.14, rz: 0.05,          // 两层被子的边不平行，才不是一块板
    }));
  // 卷起的那一头（枕头）：轴转到局部 x 向，再随 rot 一起转
  {
    const roll = new THREE.CylinderGeometry(0.19, 0.19, wide * 0.9, 8);
    roll.rotateZ(Math.PI / 2);
    const p = At(0, -long / 2 + 0.24);
    sink.Add("HouseholdCloth", PlaceGeometry(roll, { x: p.x, y: 0.24, z: p.z, ry: rot }));
  }
  // 包袱：走 Wicker（竹柳编的暖褐）而不是 HouseholdCloth ——
  // HouseholdCloth 底材是 ClothNra 的冷灰，一床被子加一只包袱全是同一个灰，
  // 出图上整堆铺盖读成「地上码了几块混凝土」。暖褐的包袱是这一堆里唯一的色差。
  {
    const p = At(-wallSide * wide * 0.72, -long / 2 + 0.42);
    sink.Add("Wicker", PlaceGeometry(
      MakeBox(0.44, 0.30, 0.46, TILE_METERS.wood, `${seed}:bundle`),
      { x: p.x, y: 0.15, z: p.z, ry: rot + rnd() * 0.5 }));
    sink.Add("HouseholdCloth", PlaceGeometry(
      MakeBox(0.13, 0.11, 0.13, TILE_METERS.stone, `${seed}:knot`),
      { x: p.x, y: 0.35, z: p.z, ry: rot }));
  }
  if (jar) {
    const p = At(wallSide * wide * 0.62, -long / 2 + 0.6);
    const body = new THREE.CylinderGeometry(0.15, 0.19, 0.40, 8);
    sink.Add("HouseholdCeramic", PlaceGeometry(body, { x: p.x, y: 0.20, z: p.z, ry: rot }));
    sink.Solid(p.x, 0.20, p.z, 0.19, 0.20, 0.19, "householdCrock", rot);
  }
  if (damage > 0.14) {
    // 掉在被子边上的一只碗口大的瓦片：屋面被震过一回
    const p = At(-wide * 0.5, long * 0.32);
    sink.Add("TubeTile", PlaceGeometry(
      MakeBox(0.28, 0.05, 0.2, TILE_METERS.roof, `${seed}:shard`),
      { x: p.x, y: 0.03, z: p.z, ry: rot + rnd() * 2.2 }));
  }
}

/**
 * 中厅内部。
 *
 * 尺寸全部从 nave 推：南关那座 9×18 的小堂用同一段代码，长椅自动短一截、排数自动少几排
 * （`pewLen` 与排数都是算出来的，没有第二套常数）。
 * 中轴留 1.8 m 过道 —— 玩家半径 0.35 m，两边各留半米余量，进门到圣坛一条直线不许被挡。
 */
export function AddChurchInterior(sink, {
  L, ry, naveW, naveD, wallT, eave, tw, towerLz, passW, seed, damage,
}) {
  const inW = naveW - wallT;
  const inD = naveD - wallT;
  const half = inW / 2;
  const rnd = Mulberry32(HashString(`${seed}:nave`));

  // --- 地面：石板墁地。厚 0.12、顶面 +0.06，不登记碰撞（它是地不是坎）---
  // 用 WallPaving 不用 CrossStone：CrossStone 是近白的条石色（0xfbfaf6），
  // 铺满 10×23 m 一整片之后整间屋子亮得像雪地，长椅与铺盖全被它压没了。
  {
    const p = L(0, 0);
    sink.Add("WallPaving", PlaceGeometry(
      MakeBox(inW, 0.12, inD, TILE_METERS.stone, `${seed}:flr`),
      { x: p.x, y: 0, z: p.z, ry }));
    // 塔下门道那一段（山墙与塔基之间 1 m 多没人铺，进门第一步会踩空）
    const v = L(0, towerLz);
    sink.Add("WallPaving", PlaceGeometry(
      MakeBox(passW + 0.6, 0.12, tw + 1.2, TILE_METERS.stone, `${seed}:vest`),
      { x: v.x, y: 0, z: v.z, ry }));
  }

  // --- 尽端圣坛：两级台 + 祭桌 + 十字架 ---
  const sancD = Math.min(4.2, inD * 0.2);
  const sancZ = -inD / 2 + sancD / 2;
  const sancW = Math.min(inW - 1.3, 7.6);
  {
    const p = L(0, sancZ);
    sink.Add("CrossStone", PlaceGeometry(
      MakeBox(sancW, 0.34, sancD, TILE_METERS.stone, `${seed}:sanc`),
      { x: p.x, y: 0.17, z: p.z, ry }));
    const s = L(0, sancZ + sancD / 2 + 0.26);
    sink.Add("CrossStone", PlaceGeometry(
      MakeBox(sancW, 0.17, 0.52, TILE_METERS.stone, `${seed}:sancstep`),
      { x: s.x, y: 0.085, z: s.z, ry }));
    // 祭桌：石台面 + 木桌身
    const a = L(0, sancZ - 0.25);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(2.0, 0.84, 0.76, TILE_METERS.wood, `${seed}:altbody`),
      { x: a.x, y: 0.34 + 0.42, z: a.z, ry }));
    sink.Add("CrossStone", PlaceGeometry(
      MakeBox(2.34, 0.13, 0.98, TILE_METERS.stone, `${seed}:alttop`),
      { x: a.x, y: 0.34 + 0.90, z: a.z, ry }));
    sink.Solid(a.x, 0.34 + 0.48, a.z, 1.17, 0.48, 0.49, "furniture", ry);
    // 十字架位：贴圣坛端山墙立一座，竖杆 2.0 m
    const c = L(0, -inD / 2 + 0.42);
    sink.Add("CrossStone", PlaceGeometry(
      MakeBox(0.6, 0.26, 0.4, TILE_METERS.stone, `${seed}:crbase`),
      { x: c.x, y: 0.34 + 0.13, z: c.z, ry }));
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.15, 2.0, 0.15, TILE_METERS.wood, `${seed}:crv`),
      { x: c.x, y: 0.34 + 0.26 + 1.0, z: c.z, ry }));
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(1.05, 0.15, 0.15, TILE_METERS.wood, `${seed}:crh`),
      { x: c.x, y: 0.34 + 0.26 + 1.44, z: c.z, ry }));
  }

  // --- 圣坛栏杆：两段，中间留 1.4 m 让人上得去 ---
  {
    const railZ = sancZ + sancD / 2 + 0.86;
    const segW = (sancW - 1.4) / 2;
    if (segW > 0.8) {
      for (const side of [-1, 1]) {
        const c = L(side * (0.7 + segW / 2), railZ);
        sink.Add("WoodBeam", PlaceGeometry(
          MakeBox(segW, 0.09, 0.13, TILE_METERS.wood, `${seed}:rail${side}`),
          { x: c.x, y: 0.86, z: c.z, ry }));
        for (const u of [-1, 1]) {
          const p = L(side * (0.7 + segW / 2) + u * (segW / 2 - 0.08), railZ);
          sink.Add("WoodBeam", PlaceGeometry(
            MakeBox(0.1, 0.86, 0.12, TILE_METERS.wood, `${seed}:rp${side}${u}`),
            { x: p.x, y: 0.43, z: p.z, ry }));
        }
        sink.Solid(c.x, 0.45, c.z, segW / 2, 0.45, 0.09, "furniture", ry);
      }
    }
  }

  // --- 两列长椅：中轴 1.8 m 过道，靠门那一头空出 restD 给难民铺位 ---
  const aisle = 1.8;
  const restD = Math.min(6.0, inD * 0.26);
  const pewLen = Math.min(3.3, (inW - aisle) / 2 - 1.15);
  const z0 = sancZ + sancD / 2 + 1.9;
  const z1 = inD / 2 - restD;
  const pitch = 1.05;
  const pewRows = Math.max(0, Math.floor((z1 - z0) / pitch));
  if (pewLen > 1.2) {
    for (let i = 0; i < pewRows; i += 1) {
      const lz = z0 + pitch * (i + 0.5);
      for (const side of [-1, 1]) {
        const lx = side * (aisle / 2 + pewLen / 2);
        const c = L(lx, lz);
        // 座板
        sink.Add("WoodBeam", PlaceGeometry(
          MakeBox(pewLen, 0.07, 0.34, TILE_METERS.wood, `${seed}:pw${i}${side}`),
          { x: c.x, y: 0.51, z: c.z, ry }));
        // 靠背：在座板的 +z 一侧。人朝圣坛（局部 -z）坐，背在身后 ——
        // 摆到 -z 去就成了「整堂人背对圣坛」，出图上一眼能看出不对。
        const b = L(lx, lz + 0.19);
        sink.Add("WoodBeam", PlaceGeometry(
          MakeBox(pewLen, 0.34, 0.06, TILE_METERS.wood, `${seed}:pb${i}${side}`),
          { x: b.x, y: 0.80, z: b.z, ry }));
        // 两端木腿
        for (const u of [-1, 1]) {
          const p = L(lx + u * (pewLen / 2 - 0.09), lz);
          sink.Add("WoodBeam", PlaceGeometry(
            MakeBox(0.08, 0.48, 0.32, TILE_METERS.wood, `${seed}:pl${i}${side}${u}`),
            { x: p.x, y: 0.24, z: p.z, ry }));
        }
        sink.Solid(c.x, 0.44, c.z, pewLen / 2, 0.44, 0.24, "furniture", ry);
      }
    }
  }

  // --- 屋架：五道横过中厅的木梁。没有它，抬头是一片没有尺度的瓦背 ---
  {
    const ties = 5;
    for (let i = 0; i < ties; i += 1) {
      const lz = -inD / 2 + inD * ((i + 0.5) / ties);
      const p = L(0, lz);
      sink.Add("WoodBeam", PlaceGeometry(
        MakeBox(naveW - 0.2, 0.17, 0.19, TILE_METERS.wood, `${seed}:tie${i}`),
        { x: p.x, y: eave - 0.12, z: p.z, ry }));
    }
  }

  // --- 难民铺位：沿两侧墙根一路排到门口，门口那一片再摊三处 ---
  {
    const wallX = half - 0.72;
    const n = Math.max(3, Math.round(inD / 4.0));
    let k = 0;
    for (let i = 0; i < n; i += 1) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const lz = -inD / 2 + 1.8 + (inD - 3.6) * t;
      const a = L(-wallX, lz);
      AddRefugeeBedding(sink, {
        x: a.x, z: a.z, ry, seed: `${seed}:bedL${i}`, axis: 1,
        jar: i % 3 === 0, damage, wallSide: -1,
      });
      k += 1;
      if (i % 2 === 0) {
        const b = L(wallX, lz + 0.55);
        AddRefugeeBedding(sink, {
          x: b.x, z: b.z, ry, seed: `${seed}:bedR${i}`, axis: 1,
          jar: i % 4 === 0, damage, wallSide: 1,
        });
        k += 1;
      }
    }
    // 门口的空场：横着摊几处，让「进门就是难民营」这一眼成立。
    // **中轴那一列必须空着** —— 第一版在 lx=0 摆了一处带水罐的铺位，
    // 探针立刻在进堂主轴上撞出 11 个阻挡点：进门第一步就踢翻人家的水缸。
    const rear = z1 + restD * 0.42;
    const rearX = [-half * 0.72, -half * 0.34, half * 0.34, half * 0.72];
    for (let i = 0; i < rearX.length; i += 1) {
      const p = L(rearX[i], rear + (i % 2) * 1.35 + rnd() * 0.3);
      AddRefugeeBedding(sink, {
        x: p.x, z: p.z, ry, seed: `${seed}:bedC${i}`, axis: 0,
        jar: i === 0 || i === 3, damage,
      });
      k += 1;
    }
    return k;
  }
}

// ===========================================================================
// 天主堂
// ===========================================================================

export function BuildChurch(host, f, ctx) {
  const sink = host.sink;
  const [naveW, naveD] = f.nave || [11, 24];
  const towerH = f.towerH || 16;
  const ry = ctx.ry || 0;
  const seed = `map:${f.id || "church"}`;
  // 教堂是这场仗里唯一一处「日军 16 日不敢炸」的建筑（外国権益擁護）——
  // 它必须比周围街坊完整一档，否则那条剧情线在画面上就没有落点。
  const damage = Math.min(ctx.damage ?? 0.12, 0.18);
  const L = MakeFrame(f.x, f.z, ry);

  const eave = 5.0 + naveW * 0.22;          // 中厅檐口：11 m 宽 → 7.4 m
  const ridge = eave + naveW * 0.42;        // 约 40° 陡坡（西式坡顶，不是硬山）
  const wallT = 0.55;
  // 塔与门道的尺寸提前算：山墙要按 passW 留口，所以不能等到造塔那一节才定。
  const tw = Clamp(naveW * 0.42, 3.6, 5.2);
  const passW = Clamp(tw - 1.5, 1.8, 2.8);  // 塔下门道净宽 = 山墙券口净宽
  const naveDoorH = 3.2;                    // 山墙券口净高

  // --- 开间节奏：n 个尖券窗，窗洞之间是砖墩，砖墩外面顶一道扶壁 ---
  const bays = Clamp(Math.round(naveD / 4.6), 3, 7);
  const cellZ = naveD / bays;
  const openW = Math.min(1.5, cellZ * 0.34);
  const pierW = cellZ - openW;
  const sillY = eave * 0.34;
  const winH = eave * 0.35;
  const archH = eave * 0.12;
  const headY = sillY + winH + archH;       // 窗券之上的过梁带

  // --- 中厅两侧长墙 ---
  for (const s of [-1, 1]) {
    const rot = ry + Math.PI / 2;
    // 窗台以下：整条实墙（碰撞与碱脚都在这一段）
    const low = L(s * naveW / 2, 0);
    AddWall(sink, "HouseBrick", {
      x: low.x, z: low.z, length: naveD, height: sillY, thickness: wallT, ry: rot,
      ruin: damage * 0.35, seed: `${seed}:lw${s}`, plinth: "CrossStone",
    });
    // 窗券以上：整条过梁带（不落地，不用碰撞）
    const head = L(s * naveW / 2, 0);
    sink.Add("HouseBrick", PlaceGeometry(
      MakeBox(naveD, eave - headY, wallT, TILE_METERS.brick, `${seed}:hb${s}`, BRICK_UV_GRID),
      { x: head.x, y: headY + (eave - headY) / 2, z: head.z, ry: rot }));
    // 砖墩 + 扶壁
    for (let k = 0; k <= bays; k += 1) {
      const end = (k === 0 || k === bays);
      const pw = end ? pierW / 2 : pierW;
      const lz = -naveD / 2 + cellZ * k + (k === 0 ? pierW / 4 : (k === bays ? -pierW / 4 : 0));
      const p = L(s * naveW / 2, lz);
      sink.Add("HouseBrick", PlaceGeometry(
        MakeBox(pw, eave - sillY, wallT, TILE_METERS.brick, `${seed}:pr${s}${k}`, BRICK_UV_GRID),
        { x: p.x, y: sillY + (eave - sillY) / 2, z: p.z, ry: rot }));
      sink.Solid(p.x, eave / 2, p.z, wallT / 2, eave / 2, pw / 2, "wall", ry);
      // 扶壁：0.85 m 出挑 + 一块斜的压顶石。它是「这不是中式房子」的第一提示。
      // 高度必须顶到檐口底下（0.93×檐口）。第一版做到 0.78×檐口，压顶石正好落在
      // 窗券头的高度上 —— 出图上一排白色斜块读成了「每扇窗上一个小雨篷」。
      const proj = 0.85;
      const bh = eave * 0.93;
      const bp = L(s * (naveW / 2 + proj / 2 - 0.08), lz);
      sink.Add("HouseBrick", PlaceGeometry(
        MakeBox(proj, bh, Math.min(0.9, pw * 0.9), TILE_METERS.brick, `${seed}:bt${s}${k}`, BRICK_UV_GRID),
        { x: bp.x, y: bh / 2, z: bp.z, ry }));
      sink.Solid(bp.x, bh / 2, bp.z, proj / 2, bh / 2, Math.min(0.45, pw * 0.45), "wall", ry);
      sink.Add("CrossStone", PlaceGeometry(
        MakeBox(proj + 0.16, 0.18, Math.min(1.0, pw * 0.95), TILE_METERS.stone, `${seed}:bc${s}${k}`),
        { x: bp.x, y: bh + 0.08, z: bp.z, ry, rz: -s * 0.42 }));
    }
    // 尖券窗
    for (let k = 0; k < bays; k += 1) {
      const lz = -naveD / 2 + cellZ * (k + 0.5);
      const p = L(s * naveW / 2, lz);
      AddLancetWindow(sink, {
        cx: p.x, cz: p.z, rot, sillY, openW, winH, archH, thickness: wallT,
        seed: `${seed}:win${s}${k}`,
        dark: null,                         // 中厅有内部空间，暗内衬撤掉换采光
      });
    }
  }

  // --- 两端山墙（北=圣坛端，南=钟塔端）---
  const gableSeg = (naveW - passW) / 2;
  for (const s of [-1, 1]) {
    const p = L(0, s * naveD / 2);
    // 山墙顶的找平层。AddWall 的 ruin 把每一段墙头咬掉一截（这里 ruin 只有 0.08，
    // 但也够咬掉半米），而山尖是从 y=eave 整齐起坡的 —— 缺口正好通到外面。
    // 从中厅里往上看，那一排缺口是一条横贯山墙顶的**漏光白带**（第一版出图抓到）。
    const lvl = 0.7;
    if (s === 1) {
      for (const side of [-1, 1]) {
        const q = L(side * (passW / 2 + gableSeg / 2), naveD / 2);
        sink.Add("HouseBrick", PlaceGeometry(
          MakeBox(gableSeg, lvl, wallT, TILE_METERS.brick, `${seed}:gl${side}`, BRICK_UV_GRID),
          { x: q.x, y: eave - lvl / 2, z: q.z, ry }));
      }
    } else {
      sink.Add("HouseBrick", PlaceGeometry(
        MakeBox(naveW, lvl, wallT, TILE_METERS.brick, `${seed}:gl0`, BRICK_UV_GRID),
        { x: p.x, y: eave - lvl / 2, z: p.z, ry }));
    }
    if (s === 1) {
      // 钟塔端：当中留 passW 的券口，人从塔下门道一直穿进中厅。
      // 这一口不许有碰撞盒 —— 它是整条进堂路线上最窄的一处。
      const segLen = gableSeg;
      for (const side of [-1, 1]) {
        const q = L(side * (passW / 2 + segLen / 2), naveD / 2);
        AddWall(sink, "HouseBrick", {
          x: q.x, z: q.z, length: segLen, height: eave, thickness: wallT, ry,
          ruin: damage * 0.45, seed: `${seed}:gw${s}${side}`, plinth: "CrossStone",
        });
      }
      const hd = eave - naveDoorH;
      sink.Add("HouseBrick", PlaceGeometry(
        MakeBox(passW, hd, wallT, TILE_METERS.brick, `${seed}:gwhd`, BRICK_UV_GRID),
        { x: p.x, y: naveDoorH + hd / 2, z: p.z, ry }));
      sink.Solid(p.x, naveDoorH + hd / 2, p.z, passW / 2, hd / 2, wallT / 2, "wall", ry);
      // 券口的两根斜券石：和侧窗、大门用的是同一句形制
      for (const t of [-1, 1]) {
        const along = { x: Math.cos(ry), z: -Math.sin(ry) };
        const q = { x: p.x + along.x * t * passW * 0.24, z: p.z + along.z * t * passW * 0.24 };
        sink.Add("CrossStone", PlaceGeometry(
          MakeBox(passW * 0.6, 0.18, wallT + 0.12, TILE_METERS.stone, `${seed}:gwar${t}`),
          { x: q.x, y: naveDoorH + 0.24, z: q.z, ry, rz: -t * 0.66 }));
      }
    } else {
      AddWall(sink, "HouseBrick", {
        x: p.x, z: p.z, length: naveW, height: eave, thickness: wallT, ry,
        ruin: damage * 0.45, seed: `${seed}:gw${s}`, plinth: "CrossStone",
      });
    }
    // 山尖：浅色抹面的三角，分六段砌成。德国教产的外墙是清水砖，
    // 但山尖、线脚、塔上段习惯抹一层浅灰白灰浆 —— 这一层是它在灰青街坊里的识别色。
    const rise = ridge - eave;
    const steps = 10;                       // 6 段时坡面读成明显的阶梯，10 段才是一条斜线
    for (let i = 0; i < steps; i += 1) {
      const t0 = i / steps, t1 = (i + 1) / steps;
      const lx = -naveW / 2 + naveW * (t0 + t1) * 0.5;
      const hh = Math.max(0.2, rise * (1 - Math.abs((t0 + t1) - 1)));
      const g = L(lx, s * naveD / 2);
      sink.Add("ChurchPlaster", PlaceGeometry(
        MakeBox(naveW / steps, hh, wallT + 0.06, TILE_METERS.adobe, `${seed}:gb${s}${i}`),
        { x: g.x, y: eave + hh / 2, z: g.z, ry }));
    }
  }
  // 圣坛端山墙上的一扇尖券窗（唯一的东西向采光）
  {
    const p = L(0, -naveD / 2);
    AddLancetWindow(sink, {
      cx: p.x, cz: p.z, rot: ry, sillY: sillY + 0.6, openW, winH, archH,
      thickness: wallT, seed: `${seed}:apse`, dark: null,
    });
  }

  // --- 屋面：陡坡两坡，脊沿中厅长向（不是硬山，所以不走 AddHardMountainRoof）---
  {
    const rise = ridge - eave;
    const half = naveW / 2;
    const slope = Math.hypot(half, rise);
    const angle = Math.atan2(rise, half);
    const over = 0.55;
    for (const s of [-1, 1]) {
      const cx2 = s * half * (1 + over / slope) * 0.5;
      const cy = (ridge + eave - rise * over / slope) * 0.5;
      const p = L(cx2, 0);
      sink.Add("TubeTile", PlaceGeometry(
        MakeBox(slope + over, 0.16, naveD + 0.6, TILE_METERS.roof, `${seed}:rf${s}`),
        { x: p.x, y: cy, z: p.z, ry, rz: -s * angle }));
    }
    const rp = L(0, 0);
    sink.Add("TubeTile", PlaceGeometry(
      MakeBox(0.55, 0.24, naveD + 0.7, TILE_METERS.roof, `${seed}:rdg`),
      { x: rp.x, y: ridge + 0.08, z: rp.z, ry }));
  }

  // --- 钟塔：单塔、贴南山面。塔身空心（四片墙），钟层的券洞才读得出进深 ---
  const towerLz = naveD / 2 + tw / 2 - 0.4;
  const tp = L(0, towerLz);
  const belfryY = towerH - tw * 0.72;
  const baseH = 0.42;
  const doorW = Math.min(1.9, passW);
  const doorH = 3.0;
  // 塔基：从「整块 1.0 m 高的方台」改成「被门道劈开的两块 0.42 m 高石座」。
  // 原来那块方台是塔进不去的真正原因 —— 门槛石在 0.07 m，方台顶面在 1.0 m，
  // 门洞正对着一堵石墙。现在门道是平地，两侧的石座正好接上外面三级台阶的最高一级（0.42）。
  {
    const baseW = tw + 0.9;
    const gap = passW + 0.24;
    const sideW = (baseW - gap) / 2;
    for (const s of [-1, 1]) {
      const p = L(s * (gap / 2 + sideW / 2), towerLz);
      sink.Add("CrossStone", PlaceGeometry(
        MakeBox(sideW, baseH, baseW, TILE_METERS.stone, `${seed}:tbase${s}`),
        { x: p.x, y: baseH / 2, z: p.z, ry }));
    }
  }
  {
    const shaftH = belfryY - baseH;
    const t = 0.5;
    // ±x 两片：整片实墙（碰撞按真实的薄片登记，不再是一个塞满塔身的实心方块）
    for (const s of [-1, 1]) {
      const p = L(s * (tw - t) / 2, towerLz);
      sink.Add("HouseBrick", PlaceGeometry(
        MakeBox(t, shaftH, tw - t * 2, TILE_METERS.brick, `${seed}:ts${s}`, BRICK_UV_GRID),
        { x: p.x, y: baseH + shaftH / 2, z: p.z, ry }));
      sink.Solid(p.x, towerH / 2, p.z, t / 2, towerH / 2, (tw - t * 2) / 2, "wall", ry);
    }
    // ±z 两片：各开一个洞。+z 是临街大门（1.9×3.0，与 AddDoorReveal 同口径），
    // -z 是通中厅的券口（与山墙那一口同宽同高，两口对齐才读得出一条门道）。
    const holes = [
      { sz: 1, w: doorW, h: doorH, key: "in" },
      { sz: -1, w: passW, h: naveDoorH, key: "out" },
    ];
    for (const o of holes) {
      const pw = (tw - o.w) / 2;
      const lz = towerLz + o.sz * (tw - t) / 2;
      for (const side of [-1, 1]) {
        const p = L(side * (o.w / 2 + pw / 2), lz);
        sink.Add("HouseBrick", PlaceGeometry(
          MakeBox(pw, shaftH, t, TILE_METERS.brick, `${seed}:tp${o.key}${side}`, BRICK_UV_GRID),
          { x: p.x, y: baseH + shaftH / 2, z: p.z, ry }));
        sink.Solid(p.x, towerH / 2, p.z, pw / 2, towerH / 2, t / 2, "wall", ry);
      }
      const hd = belfryY - o.h;
      const c = L(0, lz);
      sink.Add("HouseBrick", PlaceGeometry(
        MakeBox(o.w, hd, t, TILE_METERS.brick, `${seed}:th${o.key}`, BRICK_UV_GRID),
        { x: c.x, y: o.h + hd / 2, z: c.z, ry }));
      sink.Solid(c.x, (o.h + towerH) / 2, c.z, o.w / 2, (towerH - o.h) / 2, t / 2, "wall", ry);
    }
    // 塔身中段的浅色抹面束带 —— 把 16 m 的塔切成两段，不然是一根光砖柱子
    const band = L(0, towerLz);
    sink.Add("ChurchPlaster", PlaceGeometry(
      MakeBox(tw + 0.24, 0.34, tw + 0.24, TILE_METERS.adobe, `${seed}:tband`),
      { x: band.x, y: baseH + shaftH * 0.58, z: band.z, ry }));
    // 钟层檐下的挑檐线脚
    sink.Add("ChurchPlaster", PlaceGeometry(
      MakeBox(tw + 0.34, 0.32, tw + 0.34, TILE_METERS.adobe, `${seed}:tcor`),
      { x: band.x, y: belfryY - 0.16, z: band.z, ry }));
  }
  // 钟层：四角砖墩 + 四面券洞（洞后是一只暗盒，挡住穿透）
  {
    const bh = towerH - belfryY;
    const pier = 0.78;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const p = L(sx * (tw / 2 - pier / 2), towerLz + sz * (tw / 2 - pier / 2));
        sink.Add("HouseBrick", PlaceGeometry(
          MakeBox(pier, bh, pier, TILE_METERS.brick, `${seed}:bp${sx}${sz}`, BRICK_UV_GRID),
          { x: p.x, y: belfryY + bh / 2, z: p.z, ry }));
      }
    }
    const core = L(0, towerLz);
    sink.Add("Charred", PlaceGeometry(
      MakeBox(tw - pier * 1.6, bh - 0.3, tw - pier * 1.6, TILE_METERS.stone, `${seed}:bcore`),
      { x: core.x, y: belfryY + bh / 2, z: core.z, ry }));
    // 四面各开**一对**尖券洞：中间一根小柱把整面分成两扇。
    // 第一版一面只开一个大洞，出图上钟楼读成「四面镂空的方盒子」而不是钟楼；
    // 中柱 + 成对券头是钟层最省的识别特征。
    // 券石沿洞口所在墙面的走向排开：±x 两面沿局部 z（rot = ry + PI/2），
    // ±z 两面沿局部 x（rot = ry）。
    const arcW = tw - pier * 2;
    const mullion = 0.44;
    const openW2 = (arcW - mullion) / 2;
    const off = tw / 2 - 0.12;
    const faceSpecs = [
      { lx: off, lz: 0, rot: ry + Math.PI / 2 },
      { lx: -off, lz: 0, rot: ry + Math.PI / 2 },
      { lx: 0, lz: off, rot: ry },
      { lx: 0, lz: -off, rot: ry },
    ];
    for (let i = 0; i < faceSpecs.length; i += 1) {
      const { rot } = faceSpecs[i];
      const p = L(faceSpecs[i].lx, towerLz + faceSpecs[i].lz);
      const along = { x: Math.cos(rot), z: -Math.sin(rot) };
      sink.Add("HouseBrick", PlaceGeometry(
        MakeBox(mullion, bh - 0.5, 0.42, TILE_METERS.brick, `${seed}:bm${i}`, BRICK_UV_GRID),
        { x: p.x, y: belfryY + (bh - 0.5) / 2, z: p.z, ry: rot }));
      for (const half of [-1, 1]) {
        const cx2 = half * (mullion / 2 + openW2 / 2);
        for (const s of [-1, 1]) {
          const t = cx2 + s * openW2 * 0.23;
          sink.Add("CrossStone", PlaceGeometry(
            MakeBox(openW2 * 0.62, 0.15, 0.26, TILE_METERS.stone, `${seed}:ba${i}${half}${s}`),
            {
              x: p.x + along.x * t, y: towerH - 0.72, z: p.z + along.z * t,
              ry: rot, rz: -s * 0.72,
            }));
        }
      }
    }
    sink.Add("ChurchPlaster", PlaceGeometry(
      MakeBox(tw + 0.5, 0.3, tw + 0.5, TILE_METERS.adobe, `${seed}:tcap`),
      { x: core.x, y: towerH + 0.15, z: core.z, ry }));
  }
  // 锥顶 + 顶上的十字架
  {
    const spireH = tw * 1.55;
    const spire = new THREE.ConeGeometry(tw * 0.74, spireH, 4);
    const uv = spire.attributes.uv;
    for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 3);
    sink.Add("TubeTile", PlaceGeometry(spire,
      { x: tp.x, y: towerH + 0.3 + spireH / 2, z: tp.z, ry: ry + Math.PI / 4 }));
    const top = towerH + 0.3 + spireH;
    sink.Add("CrossStone", PlaceGeometry(
      MakeBox(0.15, 1.55, 0.15, TILE_METERS.stone, `${seed}:cx1`),
      { x: tp.x, y: top + 0.75, z: tp.z, ry }));
    sink.Add("CrossStone", PlaceGeometry(
      MakeBox(0.92, 0.15, 0.15, TILE_METERS.stone, `${seed}:cx2`),
      { x: tp.x, y: top + 1.05, z: tp.z, ry }));
  }

  // --- 入口：三级台阶 + 有进深的门洞 ---
  {
    const doorLz = towerLz + tw / 2 - 0.02;
    const dp = L(0, doorLz);
    AddDoorReveal(sink, {
      x: dp.x, z: dp.z, ry: ry + Math.PI, openW: 1.9, openH: 3.0, depth: 1.5,
      seed: `${seed}:door`, paving: "CrossStone", sill: "CrossStone",
    });
    // 尖券门头：门洞上方两根斜券石
    for (const s of [-1, 1]) {
      const along = { x: Math.cos(ry), z: -Math.sin(ry) };
      const q = { x: dp.x + along.x * s * 0.46, z: dp.z + along.z * s * 0.46 };
      sink.Add("CrossStone", PlaceGeometry(
        MakeBox(1.25, 0.2, 0.3, TILE_METERS.stone, `${seed}:da${s}`),
        { x: q.x, y: 3.32, z: q.z, ry, rz: -s * 0.62 }));
    }
    for (let i = 0; i < 3; i += 1) {
      const sp = L(0, doorLz + 0.42 + i * 0.36);
      const h = 0.42 - i * 0.14;
      sink.Add("CrossStone", PlaceGeometry(
        MakeBox(3.4, h, 0.42, TILE_METERS.stone, `${seed}:st${i}`),
        { x: sp.x, y: h / 2, z: sp.z, ry }));
    }
  }

  // --- 中厅内部（长椅 / 圣坛 / 难民铺位）---
  AddChurchInterior(sink, {
    L, ry, naveW, naveD, wallT, eave, tw, towerLz, passW,
    seed: `${seed}:int`, damage,
  });

  // --- 院墙：一圈 2.1 m 的砖墙 + 南面一个 3 m 的可走门洞 ---
  {
    const hw = naveW / 2 + 10;
    const hd = naveD / 2 + 9;
    const wallH = 2.1;
    const gateW = 3.0;
    const sides = [
      { lx: 0, lz: -hd, len: hw * 2, rot: ry, gate: false },
      { lx: 0, lz: hd, len: hw * 2, rot: ry, gate: true },
      { lx: -hw, lz: 0, len: hd * 2, rot: ry + Math.PI / 2, gate: false },
      { lx: hw, lz: 0, len: hd * 2, rot: ry + Math.PI / 2, gate: false },
    ];
    sides.forEach((s, i) => {
      const p = L(s.lx, s.lz);
      const hx = s.rot === ry ? s.len / 2 : 0.3;
      const hz = s.rot === ry ? 0.3 : s.len / 2;
      if (host.OnStreet(p.x, p.z, hx, hz)) return;
      if (!s.gate) {
        AddWall(sink, "HouseBrick", {
          x: p.x, z: p.z, length: s.len, height: wallH, thickness: 0.35, ry: s.rot,
          ruin: damage * 0.8, seed: `${seed}:yw${i}`, plinth: "CrossStone",
        });
        return;
      }
      const segLen = (s.len - gateW - 1.8) / 2;
      for (const side of [-1, 1]) {
        const q = L(s.lx + side * (gateW / 2 + 0.9 + segLen / 2), s.lz);
        AddWall(sink, "HouseBrick", {
          x: q.x, z: q.z, length: segLen, height: wallH, thickness: 0.35, ry: s.rot,
          ruin: damage * 0.8, seed: `${seed}:yw${i}${side}`, plinth: "CrossStone",
        });
        // 门垛
        const g = L(s.lx + side * (gateW / 2 + 0.45), s.lz);
        sink.Add("HouseBrick", PlaceGeometry(
          MakeBox(0.9, 2.9, 0.7, TILE_METERS.brick, `${seed}:gp${side}`, BRICK_UV_GRID),
          { x: g.x, y: 1.45, z: g.z, ry: s.rot }));
        sink.Solid(g.x, 1.45, g.z, 0.45, 1.45, 0.35, "wall", s.rot);
      }
      // 门额石正好压在两根门垛上：宽度 = 净宽 + 两根 0.9 m 的垛，多一寸就悬空
      const lin = L(s.lx, s.lz);
      sink.Add("CrossStone", PlaceGeometry(
        MakeBox(gateW + 1.8, 0.32, 0.78, TILE_METERS.stone, `${seed}:glin`),
        { x: lin.x, y: 3.04, z: lin.z, ry: s.rot }));
    });
    // 门到堂前台阶的一条石板路
    const pathLen = hd - (naveD / 2 + tw + 1.2);
    if (pathLen > 2) {
      const pp = L(0, hd - pathLen / 2 - 0.2);
      sink.Add("CrossStone", PlaceGeometry(
        MakeBox(2.4, 0.12, pathLen, TILE_METERS.stone, `${seed}:path`),
        { x: pp.x, y: -0.02, z: pp.z, ry }));
    }
  }
}

// ===========================================================================
// 学校
// ===========================================================================

/**
 * 一排横长教室。
 *
 * 与民居的分野只做一条，但要做足：**朝院一面是连排大窗**。
 * 民居 AddRoomBlock 的窗是 1.05 m 宽、窗台 0.92、三开间才一扇；教室是 1.5 m 宽、
 * 3.4 m 一间、一排十几扇，窗台压到 0.85（学生坐着要能看见外面）。
 * 从街对面看过去，「一长条房子上有一整排一样大的窗」就是学校，不需要挂牌子。
 */
/**
 * 一间可进的教室（长排里当中那一间，门就在它的正面）。
 *
 * 只做一间：两道隔墙把门所在的三个开间划出来，别的开间仍是暗盒。
 * 讲台与黑板贴在**靠里那道隔墙**上（山墙一侧），课桌五排朝它排开 ——
 * 门与连排大窗都在学生的右手边，这是民国小学最常见的那一种平面。
 * 进门那一侧留 1.6 m 以上的通道：从门口到讲台一条直线不许被课桌挡住。
 */
export function AddClassroomInterior(sink, {
  L, ry, depth, eaveY, cellX, doorBay, width, seed, damage = 0, burnt = false,
}) {
  const brick = burnt ? "BrickWallSooty" : "SchoolBrick";
  const left = -width / 2 + cellX * (doorBay - 1);
  const right = -width / 2 + cellX * (doorBay + 2);
  const inD = depth - 0.72;
  const wallH = Math.max(2.4, eaveY - 0.1);

  // --- 两道隔墙 ---
  // ruin 压到 0.25 档、再加一道通长找平层：隔墙是**室内**墙，被 ruin 咬出的
  // 那一排垛口会直接把屋面下的天光漏进来（第一版出图上是一条锯齿状的白边）。
  for (const lx of [left, right]) {
    const p = L(lx, 0);
    AddWall(sink, brick, {
      x: p.x, z: p.z, length: inD, height: wallH, thickness: 0.24, ry: ry + Math.PI / 2,
      ruin: damage * 0.25, seed: `${seed}:pt${lx > 0 ? "r" : "l"}${Math.round(lx * 10)}`,
    });
    sink.Add(brick, PlaceGeometry(
      MakeBox(0.24, 0.5, inD, TILE_METERS.brick, `${seed}:ptl${Math.round(lx * 10)}`, BRICK_UV_GRID),
      { x: p.x, y: wallH - 0.25, z: p.z, ry }));
  }
  // --- 后墙（临街那面）在这一间范围内的找平层 ---
  // 长排的后墙 ruin 是 damage*0.8，墙头被咬掉半米多；从屋里看，那一排缺口
  // 是贴着屋面的一条锯齿白光。只在可进的这一间上头补平，别的开间照旧破着。
  {
    const p = L((left + right) / 2, -depth / 2);
    sink.Add(brick, PlaceGeometry(
      MakeBox(right - left, 0.78, 0.36, TILE_METERS.brick, `${seed}:bklvl`, BRICK_UV_GRID),
      { x: p.x, y: eaveY - 0.39, z: p.z, ry }));
  }

  // --- 屋架：三道横梁。抬头有梁，这间屋子才有高度 ---
  for (let i = 0; i < 3; i += 1) {
    const p = L(left + (right - left) * ((i + 0.5) / 3), 0);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.15, 0.16, inD, TILE_METERS.wood, `${seed}:tie${i}`),
      { x: p.x, y: eaveY - 0.11, z: p.z, ry }));
  }

  // --- 黑板：Charred 板面 + 木框，挂在靠里那道隔墙上 ---
  {
    const bx = left + 0.16;
    const by = 1.52;
    const bw = Math.min(2.9, inD - 1.6);
    const p = L(bx, 0);
    sink.Add("Charred", PlaceGeometry(
      MakeBox(0.05, 1.12, bw, TILE_METERS.stone, `${seed}:bb`),
      { x: p.x, y: by, z: p.z, ry }));
    for (const u of [-1, 1]) {
      const q = L(bx + 0.02, u * (bw / 2 + 0.05));
      sink.Add("WoodBeam", PlaceGeometry(
        MakeBox(0.07, 1.24, 0.1, TILE_METERS.wood, `${seed}:bbv${u}`),
        { x: q.x, y: by, z: q.z, ry }));
      const r = L(bx + 0.02, 0);
      sink.Add("WoodBeam", PlaceGeometry(
        MakeBox(0.07, 0.1, bw + 0.2, TILE_METERS.wood, `${seed}:bbh${u}`),
        { x: r.x, y: by + u * 0.61, z: r.z, ry }));
    }
    // 粉笔槽
    const c = L(bx + 0.06, 0);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.12, 0.06, bw, TILE_METERS.wood, `${seed}:chalk`),
      { x: c.x, y: by - 0.62, z: c.z, ry }));
  }

  // --- 讲台：一方矮台 + 台上一张条桌 ---
  {
    const px = left + 1.05;
    const pd = Math.min(3.2, inD - 1.2);
    const p = L(px, 0);
    sink.Add("Stone", PlaceGeometry(
      MakeBox(1.35, 0.16, pd, TILE_METERS.stone, `${seed}:dais`),
      { x: p.x, y: 0.08, z: p.z, ry }));
    const t = L(px + 0.1, 0);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.62, 0.06, 1.35, TILE_METERS.wood, `${seed}:desktop`),
      { x: t.x, y: 0.16 + 0.78, z: t.z, ry }));
    for (const u of [-1, 1]) {
      const q = L(px + 0.1, u * 0.58);
      sink.Add("WoodBeam", PlaceGeometry(
        MakeBox(0.5, 0.75, 0.07, TILE_METERS.wood, `${seed}:deskleg${u}`),
        { x: q.x, y: 0.16 + 0.41, z: q.z, ry }));
    }
    sink.Solid(t.x, 0.55, t.z, 0.33, 0.42, 0.7, "furniture", ry);
  }

  // --- 课桌凳：五排 × 三列，朝黑板（局部 -x）---
  {
    const rows = 5;
    const cols = 3;
    const rowPitch = 1.24;
    // 讲台边留 1.6 m、窗门那一侧留 1.75 m：两条过道都要过得去一个半径 0.35 m 的人。
    // 这两个数是探针逼出来的 —— 第一版课桌离讲台只剩 0.62 m，从门口走不到讲台前。
    const x0 = left + 3.25;
    const aisleZ = 1.75;
    const colPitch = Math.min(1.45, (inD - 0.9 - aisleZ) / cols);
    const z0 = -inD / 2 + 0.45;
    for (let r = 0; r < rows; r += 1) {
      const lx = x0 + r * rowPitch;
      if (lx > right - 1.0) break;
      for (let c = 0; c < cols; c += 1) {
        const lz = z0 + colPitch * (c + 0.5);
        // 课桌：桌面 + 两块侧板
        const d = L(lx, lz);
        sink.Add("WoodBeam", PlaceGeometry(
          MakeBox(0.5, 0.05, 1.02, TILE_METERS.wood, `${seed}:dt${r}${c}`),
          { x: d.x, y: 0.72, z: d.z, ry }));
        for (const u of [-1, 1]) {
          const q = L(lx, lz + u * 0.44);
          sink.Add("WoodBeam", PlaceGeometry(
            MakeBox(0.44, 0.68, 0.05, TILE_METERS.wood, `${seed}:dl${r}${c}${u}`),
            { x: q.x, y: 0.35, z: q.z, ry }));
        }
        // 长凳：坐在课桌后面（局部 +x 一侧）
        const b = L(lx + 0.62, lz);
        sink.Add("WoodBeam", PlaceGeometry(
          MakeBox(0.26, 0.05, 0.98, TILE_METERS.wood, `${seed}:bs${r}${c}`),
          { x: b.x, y: 0.42, z: b.z, ry }));
        for (const u of [-1, 1]) {
          const q = L(lx + 0.62, lz + u * 0.4);
          sink.Add("WoodBeam", PlaceGeometry(
            MakeBox(0.2, 0.4, 0.05, TILE_METERS.wood, `${seed}:bl${r}${c}${u}`),
            { x: q.x, y: 0.2, z: q.z, ry }));
        }
        const g = L(lx + 0.31, lz);
        sink.Solid(g.x, 0.36, g.z, 0.56, 0.36, 0.52, "furniture", ry);
      }
    }
  }
}

function AddClassroomRow(sink, {
  x, z, ry, width, depth, eaveY, ridgeY, seed, damage = 0, burnt = false, bays = 9,
  interior = false,
}) {
  const L = MakeFrame(x, z, ry);
  const brick = burnt ? "BrickWallSooty" : "SchoolBrick";
  const cellX = width / bays;
  const openW = Math.min(1.6, cellX * 0.46);
  const pierW = cellX - openW;
  const sillY = 0.85;
  const winH = 1.78;
  const headY = sillY + winH;
  const doorBay = Math.floor(bays / 2);
  const doorH = 2.25;

  // 背面 + 两山：实墙（教室对街那一面照鲁南规矩不开窗）
  const back = L(0, -depth / 2);
  AddWall(sink, brick, {
    x: back.x, z: back.z, length: width, height: eaveY, thickness: 0.36, ry,
    ruin: damage * 0.8, seed: `${seed}:back`, plinth: "Stone",
  });
  for (const s of [-1, 1]) {
    const p = L(s * width / 2, 0);
    AddWall(sink, brick, {
      x: p.x, z: p.z, length: depth, height: eaveY, thickness: 0.36, ry: ry + Math.PI / 2,
      ruin: damage * 0.8, seed: `${seed}:end${s}`, plinth: "Stone",
    });
  }

  // 朝院一面：砖墩 + 连排大窗 + 当中一扇门
  for (let k = 0; k <= bays; k += 1) {
    const end = (k === 0 || k === bays);
    const pw = end ? pierW / 2 + 0.2 : pierW;
    const lx = -width / 2 + cellX * k
      + (k === 0 ? pw / 2 : (k === bays ? -pw / 2 : 0));
    const p = L(lx, depth / 2);
    AddWall(sink, brick, {
      x: p.x, z: p.z, length: pw, height: eaveY, thickness: 0.36, ry,
      ruin: damage * 0.7, seed: `${seed}:pr${k}`, plinth: "Stone",
    });
  }
  for (let k = 0; k < bays; k += 1) {
    const lx = -width / 2 + cellX * (k + 0.5);
    const p = L(lx, depth / 2);
    if (k === doorBay) {
      // 做了内部空间的那一排，门洞里的暗盒要撤掉 —— 不然门口挂着一块黑板，
      // 人走得进去但看上去是堵死的。
      if (!interior) {
        const dback = L(lx, depth / 2 - 0.18);
        sink.Add("Charred", PlaceGeometry(
          MakeBox(openW - 0.16, doorH, 0.14, TILE_METERS.stone, `${seed}:dk${k}`),
          { x: dback.x, y: doorH / 2, z: dback.z, ry }));
      }
      sink.Add("WoodBeam", PlaceGeometry(
        MakeBox(openW + 0.3, 0.18, 0.46, TILE_METERS.wood, `${seed}:dl${k}`),
        { x: p.x, y: doorH + 0.09, z: p.z, ry }));
      sink.Add(brick, PlaceGeometry(
        MakeBox(openW, eaveY - doorH - 0.18, 0.36, TILE_METERS.brick, `${seed}:dh${k}`, BRICK_UV_GRID),
        { x: p.x, y: doorH + 0.18 + (eaveY - doorH - 0.18) / 2, z: p.z, ry }));
      sink.Add("Stone", PlaceGeometry(
        MakeBox(openW + 0.6, 0.16, 0.9, TILE_METERS.stone, `${seed}:ds${k}`),
        { x: p.x, y: 0.08, z: p.z, ry }));
      continue;
    }
    // 窗下墙 + 窗上过梁带
    sink.Add(brick, PlaceGeometry(
      MakeBox(openW, sillY, 0.36, TILE_METERS.brick, `${seed}:sb${k}`, BRICK_UV_GRID),
      { x: p.x, y: sillY / 2, z: p.z, ry }));
    sink.Add(brick, PlaceGeometry(
      MakeBox(openW, eaveY - headY - 0.16, 0.36, TILE_METERS.brick, `${seed}:hb${k}`, BRICK_UV_GRID),
      { x: p.x, y: headY + 0.16 + (eaveY - headY - 0.16) / 2, z: p.z, ry }));
    // 洞里的暗（教室是封闭盒子，没有内衬会一眼看穿）。
    // 必须退到墙里侧：第一版把它摆在墙心，0.14 厚的暗盒正好把 0.10 厚的木棂整个吞掉，
    // 出图上一排窗全是空洞的黑方块，一根窗棂都看不见。
    // 可进的那一间（门所在的三个开间）撤掉暗内衬：这间屋子唯一的光就从这排窗进来。
    if (!(interior && Math.abs(k - doorBay) <= 1)) {
      const back = L(lx, depth / 2 - 0.16);
      sink.Add("Charred", PlaceGeometry(
        MakeBox(openW - 0.1, winH, 0.14, TILE_METERS.stone, `${seed}:wd${k}`),
        { x: back.x, y: sillY + winH / 2, z: back.z, ry }));
    }
    // 木过梁 + 窗台石
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(openW + 0.28, 0.16, 0.44, TILE_METERS.wood, `${seed}:wl${k}`),
      { x: p.x, y: headY + 0.08, z: p.z, ry }));
    sink.Add("Stone", PlaceGeometry(
      MakeBox(openW + 0.24, 0.12, 0.5, TILE_METERS.stone, `${seed}:ws${k}`),
      { x: p.x, y: sillY - 0.06, z: p.z, ry }));
    // 木棂：两横三竖。教室窗是大玻璃/糊纸的方格，比民居的井字窗疏
    if (damage < 0.55) {
      const face = L(lx, depth / 2 + 0.03);
      for (let m = 1; m <= 2; m += 1) {
        sink.Add("WoodBeam", PlaceGeometry(
          MakeBox(openW - 0.14, 0.07, 0.1, TILE_METERS.wood, `${seed}:wh${k}${m}`),
          { x: face.x, y: sillY + winH * (m / 3), z: face.z, ry }));
      }
      for (let m = 0; m <= 2; m += 1) {
        const off = (-0.5 + m * 0.5) * (openW - 0.14);
        const q = L(lx + off, depth / 2 + 0.03);
        sink.Add("WoodBeam", PlaceGeometry(
          MakeBox(0.07, winH, 0.1, TILE_METERS.wood, `${seed}:wv${k}${m}`),
          { x: q.x, y: sillY + winH / 2, z: q.z, ry }));
      }
    }
  }

  AddHardMountainRoof(sink, {
    x, z, width, depth, eaveY, ridgeY, ry, seed: `${seed}:roof`,
    ruined: damage > 0.62, burnt,
    // 椽子按 0.42 m 一根排：54 m 的长教室两坡就是 258 块方料（约 3 千三角），
    // 而这个距离上根本分不出椽头。超过 42 m 的长排关掉，短排照排。
    rafters: width < 42,
  });

  if (interior) {
    AddClassroomInterior(sink, {
      L, ry, depth, eaveY, cellX, doorBay, width,
      seed: `${seed}:room`, damage, burnt,
    });
  }
}

export function BuildSchool(host, f, ctx) {
  const sink = host.sink;
  const ry = ctx.ry || 0;
  const w = f.w, d = f.d;
  const seed = `map:${f.id}`;
  const damage = ctx.damage ?? 0.24;
  const burnt = !!ctx.burnt;
  const rnd = Mulberry32(HashString(`${seed}:school`));
  const L = MakeFrame(f.x, f.z, ry);
  const wallMat = burnt ? "BrickWallSooty" : "BrickWall";

  // --- 围墙一圈 + 南面校门 ---
  const wallH = 2.2;
  const gateW = 3.4;
  {
    const sides = [
      { lx: 0, lz: -d / 2, len: w, rot: ry, gate: false },
      { lx: 0, lz: d / 2, len: w, rot: ry, gate: true },
      { lx: -w / 2, lz: 0, len: d, rot: ry + Math.PI / 2, gate: false },
      { lx: w / 2, lz: 0, len: d, rot: ry + Math.PI / 2, gate: false },
    ];
    sides.forEach((s, i) => {
      const p = L(s.lx, s.lz);
      const hx = s.rot === ry ? s.len / 2 : 0.3;
      const hz = s.rot === ry ? 0.3 : s.len / 2;
      if (host.OnStreet(p.x, p.z, hx, hz)) return;
      if (!s.gate) {
        AddWall(sink, wallMat, {
          x: p.x, z: p.z, length: s.len, height: wallH, thickness: 0.35, ry: s.rot,
          ruin: damage * 0.8, seed: `${seed}:yw${i}`, plinth: "Stone", cope: true,
        });
        return;
      }
      const segLen = (s.len - gateW - 2.6) / 2;
      for (const side of [-1, 1]) {
        const q = L(s.lx + side * (gateW / 2 + 1.3 + segLen / 2), s.lz);
        AddWall(sink, wallMat, {
          x: q.x, z: q.z, length: segLen, height: wallH, thickness: 0.35, ry: s.rot,
          ruin: damage * 0.8, seed: `${seed}:yw${i}${side}`, plinth: "Stone", cope: true,
        });
      }
    });
  }

  // --- 校门门楼：两墩 + 木过梁 + 挂匾位 + 小瓦顶。挂匾那块石板是「这是学校」的落款 ---
  {
    const gh = 4.1;
    for (const side of [-1, 1]) {
      const p = L(side * (gateW / 2 + 0.6), d / 2);
      sink.Add(wallMat, PlaceGeometry(
        MakeBox(1.2, gh, 1.15, TILE_METERS.brick, `${seed}:gpier${side}`, BRICK_UV_GRID),
        { x: p.x, y: gh / 2, z: p.z, ry }));
      sink.Solid(p.x, gh / 2, p.z, 0.6, gh / 2, 0.58, "wall", ry);
      const dun = L(side * (gateW / 2 + 0.1), d / 2 + 0.45);
      sink.Add("Stone", PlaceGeometry(
        MakeBox(0.46, 0.58, 0.46, TILE_METERS.stone, `${seed}:gdun${side}`),
        { x: dun.x, y: 0.29, z: dun.z, ry }));
    }
    const c = L(0, d / 2);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(gateW + 2.4, 0.34, 1.05, TILE_METERS.wood, `${seed}:glin`),
      { x: c.x, y: 3.0, z: c.z, ry }));
    sink.Add(wallMat, PlaceGeometry(
      MakeBox(gateW + 2.4, gh - 3.17, 0.9, TILE_METERS.brick, `${seed}:gup`, BRICK_UV_GRID),
      { x: c.x, y: 3.17 + (gh - 3.17) / 2, z: c.z, ry }));
    // 挂匾位：门额石。1938 年三月挂的是校名匾，字样无资料，只做石板不刻字。
    const plq = L(0, d / 2 + 0.52);
    sink.Add("Stone", PlaceGeometry(
      MakeBox(2.2, 0.6, 0.15, TILE_METERS.stone, `${seed}:plaque`),
      { x: plq.x, y: 3.56, z: plq.z, ry }));
    // 小瓦顶
    for (const s of [-1, 1]) {
      const rp = L(0, d / 2 + s * 0.5);
      sink.Add(burnt ? "BrickWallSooty" : "RoofTile", PlaceGeometry(
        MakeBox(gateW + 3.4, 0.12, 1.3, TILE_METERS.roof, `${seed}:grf${s}`),
        { x: rp.x, y: gh + 0.34, z: rp.z, ry, rx: s * 0.44 }));
    }
    sink.Add("RoofTile", PlaceGeometry(
      MakeBox(gateW + 3.5, 0.17, 0.28, TILE_METERS.roof, `${seed}:grdg`),
      { x: c.x, y: gh + 0.58, z: c.z, ry }));
    AddDoorReveal(sink, {
      x: c.x, z: c.z, ry: ry + Math.PI, openW: gateW, openH: 2.9, depth: 2.6,
      seed: `${seed}:grv`, jamb: false,
    });
  }

  // --- 教室：一进（书院小学）／两进（滕文中学 66 m）---
  const twoCourt = w >= 60;
  // 两进要在同一个 40 m 进深里塞下「后排 + 后院 + 前排 + 操场」，教室排必须收窄一档；
  // 第一版沿用一进的 8.8 m，两排的屋檐几乎贴在一起，出图上读成一栋分了缝的长房子。
  const rowD = twoCourt ? 7.6 : Math.min(9.0, Math.max(7.0, d * 0.24));
  const rowW = Math.min(w - 6.5, w * 0.82);
  const eaveY = 3.45;                                   // 教室檐口比民居高一档（2.4—2.8 → 3.45）
  const ridgeY = eaveY + rowD * 0.5 * 0.52;             // 约 27.5°
  const bays = Clamp(Math.round(rowW / 3.5), 5, 19);

  const rows = [];
  rows.push(-d / 2 + 1.5 + rowD / 2);
  let innerGateLz = null;
  if (twoCourt) {
    // 后院 9 m（二门居中）—— 一进院子至少要能站得下一队学生
    innerGateLz = rows[0] + rowD / 2 + 4.5;
    rows.push(innerGateLz + 4.5 + rowD / 2);
  }
  // 先筛一遍能落地的排，再把「可进的那一间」给**实际建起来的最后一排**（临操场那排）。
  // 直接写 rows[rows.length-1] 会踩空：那一排若压在街上就被 OnStreet 掐掉，
  // 内部空间跟着一起没了，而玩家看见的却是另一排的门。
  const built = [];
  for (let i = 0; i < rows.length; i += 1) {
    const p = L(0, rows[i]);
    if (host.OnStreet(p.x, p.z, rowW / 2, rowD / 2)) continue;
    built.push({ i, p });
  }
  for (let n = 0; n < built.length; n += 1) {
    const { i, p } = built[n];
    AddClassroomRow(sink, {
      x: p.x, z: p.z, ry, width: rowW, depth: rowD, eaveY, ridgeY,
      seed: `${seed}:cls${i}`, damage, burnt, bays,
      interior: n === built.length - 1,
    });
  }
  // 二门：把两进隔开的一道横墙，当中留可走门洞
  if (innerGateLz != null) {
    const openW2 = 3.0;
    const segLen = (w - 1.2 - openW2) / 2;
    for (const side of [-1, 1]) {
      const q = L(side * (openW2 / 2 + segLen / 2), innerGateLz);
      AddWall(sink, wallMat, {
        x: q.x, z: q.z, length: segLen, height: 2.3, thickness: 0.3, ry,
        ruin: damage * 0.9, seed: `${seed}:ig${side}`, plinth: "Stone", cope: true,
      });
      const g = L(side * (openW2 / 2 + 0.3), innerGateLz);
      sink.Add(wallMat, PlaceGeometry(
        MakeBox(0.6, 3.0, 0.6, TILE_METERS.brick, `${seed}:igp${side}`, BRICK_UV_GRID),
        { x: g.x, y: 1.5, z: g.z, ry }));
      sink.Solid(g.x, 1.5, g.z, 0.3, 1.5, 0.3, "wall", ry);
    }
    const lc = L(0, innerGateLz);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(openW2 + 1.4, 0.26, 0.6, TILE_METERS.wood, `${seed}:iglin`),
      { x: lc.x, y: 3.1, z: lc.z, ry }));
  }

  // --- 操场：前院。用石灰线圈出场地 + 旗杆 + 单杠，不铺新材质 ---
  {
    const front = rows[rows.length - 1] + rowD / 2 + 1.5;
    const back = d / 2 - 2.2;
    const playD = back - front;
    if (playD > 6) {
      const cz = (front + back) / 2;
      const px = Math.min(w * 0.72, rowW) / 2;
      const pz = playD * 0.38;
      // 石灰线：四条 0.22 m 的浅色边。俯瞰图上这个方框就是「操场」
      const lines = [
        [0, -pz, px * 2, 0.22], [0, pz, px * 2, 0.22],
        [-px, 0, 0.22, pz * 2], [px, 0, 0.22, pz * 2],
      ];
      for (let i = 0; i < lines.length; i += 1) {
        const [lx, lz, bw, bd] = lines[i];
        const p = L(lx, cz + lz);
        sink.Add("Stone", PlaceGeometry(
          MakeBox(bw, 0.07, bd, TILE_METERS.stone, `${seed}:line${i}`),
          { x: p.x, y: 0.02, z: p.z, ry }));
      }
      // 旗杆：操场北端正中。9.5 m，比周围任何一间教室都高 —— 俯瞰与街景的双重路标。
      // 离教室排 4.0 m 而不是 1.2 m：开间数总是奇数 ⇒ 教室门恒在局部 x=0，
      // 和旗杆同轴。1.2 m 时那根 9.5 m 的杆子正杵在唯一那扇门前两米半（探针撞到过）。
      const fp = L(0, front + 4.0);
      sink.Add("Stone", PlaceGeometry(
        MakeBox(1.5, 0.38, 1.5, TILE_METERS.stone, `${seed}:fbase`),
        { x: fp.x, y: 0.19, z: fp.z, ry }));
      const poleH = 9.5;
      sink.Add("WoodBeam", PlaceGeometry(
        new THREE.CylinderGeometry(0.08, 0.14, poleH, 8),
        { x: fp.x, y: 0.38 + poleH / 2, z: fp.z }));
      sink.Solid(fp.x, 0.38 + poleH / 2, fp.z, 0.2, 0.38 + poleH / 2, 0.2, "prop");
      // 单杠：民国学校操场的标配，两根立柱一根横杆
      for (const side of [-1, 1]) {
        if (rnd() < 0.2) continue;
        const bz = cz + pz * 0.55;
        for (const u of [-1, 1]) {
          const q = L(side * px * 0.72 + u * 1.15, bz);
          sink.Add("WoodBeam", PlaceGeometry(
            MakeBox(0.13, 2.05, 0.13, TILE_METERS.wood, `${seed}:bar${side}${u}`),
            { x: q.x, y: 1.02, z: q.z, ry }));
        }
        const bc = L(side * px * 0.72, bz);
        sink.Add("WoodBeam", PlaceGeometry(
          MakeBox(2.45, 0.11, 0.11, TILE_METERS.wood, `${seed}:barh${side}`),
          { x: bc.x, y: 2.0, z: bc.z, ry }));
        sink.Solid(bc.x, 1.0, bc.z, 1.3, 1.0, 0.12, "prop", ry);
      }
    }
  }
}
