// 远景地形 —— 一份连续高度函数，网格与道具落地共用。
//
// **纯 JS，不许 import three**：出图脚本、数据文件（Data_CutsceneChuchuan 的村庄
// 与树行要落在地上）和渲染网格（Script_Cutscene 的 heightTerrain）三边必须问
// 同一个函数。以前是「网格自己算一遍、数据里再手抄一张 5×9 的高度表」，
// 地形一动那张表就悄悄过期，道具整片浮空 —— 这个模块就是来消灭那张表的。
//
// ── 高度是怎么叠出来的 ────────────────────────────────────────────────────
//   1. **基底**：台儿庄真实 SRTM DEM（Script_JieheHeight），1:1 米制，不纵向夸张。
//      鲁南这一带是黄泛平原，2.5 km 内总落差只有 8 m —— 光有它，天际线就是
//      一条直线，这正是「远景一片白板」的一半原因。
//   2. **起伏 relief**：缓坡 rolls + 线状山脊 ridges + 独立山头 peaks。
//      **离铁路 fadeIn[0] 米以内恒等于 0** —— 月台、门外田块、土路那一片的落地
//      高度是照旧网格烘死的，一厘米都不许动，所以起伏只在既有布设之外长出来。
//   3. 山脊与山头都按「到线段/点的距离」做 smootherstep，山脊线本身再叠一层
//      value noise 让脊线不是一条数学曲线。
//
// ── 农田马赛克 ────────────────────────────────────────────────────────────
// 三月的鲁南平原从车窗看出去是一块块颜色不同的地：返青的冬麦、翻过的黑土、
// 去年的麦茬、休耕的黄土。这里不摆几何、不贴照片，而是按一套**带角度、带抖动
// 的地块划分**给地形顶点上色（顶点色乘在 Ground 贴图上）。地块尺度 80—140 m，
// 到 400 m 外一块地在画面里还有二三十像素，正好是「远处有农田」这条信息的
// 最小可读单位；山坡上自动退回自然地色，不会把麦田种到山顶去。

import { SampleJieheBaseHeight } from "./Script_JieheHeight.mjs";
import { Clamp01, SmoothStep, ValueNoise2, HashString } from "./Script_Noise.mjs";

const TWO_PI = Math.PI * 2;

/** smoothstep 的五次版本：山脚与山顶都不留折线（三次版在山脊顶会露出一道棱）。 */
function Smoother(t) {
  const x = Clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function DistanceToSegment(x, z, from, to) {
  const dx = to[0] - from[0], dz = to[1] - from[1];
  const len2 = dx * dx + dz * dz || 1;
  const t = Clamp01(((x - from[0]) * dx + (z - from[1]) * dz) / len2);
  return Math.hypot(x - (from[0] + dx * t), z - (from[1] + dz * t));
}

/**
 * 起伏高度（米）。x 是**有符号**的离铁路距离（负 = 西/左窗外），z 沿铁路。
 * 有符号是关键：左右两侧看到的必须是同一片连续大地的两半，而不是互为镜像的
 * 同一座山（DEM 基底按 |x| 采样，天生左右对称，只靠它两边永远长一个样）。
 */
export function ReliefHeight(x, z, relief) {
  if (!relief) return 0;
  // 两道闸，缺一不可：
  //   · fadeIn 按**到车厢的直线距离**淡入 —— 只按 |x| 淡入的话，沿铁路方向
  //     （x 小、z 大）那一整条楔形永远是平的，而下车后镜 10/11 正好朝那边看，
  //     远景又变回一条直线（实拍 t=99 抓到的）。
  //   · corridor 按**离铁路的横向距离**淡入 —— 路基、电杆、护路桩、中景村舍
  //     全是沿 z 铺到 −742 m 的**定高**道具，路基底下的地一起伏就把它们埋了。
  //     真实的铁路本来也是走平整路基，两侧才是起伏的地。
  const [fadeFrom, fadeTo] = relief.fadeIn || [0, 0];
  const [corridorFrom, corridorTo] = relief.corridor || [0, 0];
  const radius = Math.hypot(x, z);
  const fade = (fadeTo > fadeFrom ? Smoother((radius - fadeFrom) / (fadeTo - fadeFrom)) : 1)
    * (corridorTo > corridorFrom
      ? Smoother((Math.abs(x) - corridorFrom) / (corridorTo - corridorFrom)) : 1);
  if (fade <= 0) return 0;
  let h = 0;
  for (const roll of relief.rolls || []) {
    h += roll.amp
      * Math.sin(TWO_PI * x / roll.lx + roll.phase)
      * Math.cos(TWO_PI * z / roll.lz + roll.phase * 1.7 + 0.4);
  }
  for (const ridge of relief.ridges || []) {
    const d = DistanceToSegment(x, z, ridge.from, ridge.to);
    if (d >= ridge.width) continue;
    // 脊线宽度自己也起伏，山脊才不是一条等宽的土埂
    const wobble = 1 + (ValueNoise2(x / 260, z / 260, ridge.seed || 7) - 0.5) * (ridge.rough ?? 0.55);
    h += ridge.height * Smoother(1 - d / (ridge.width * wobble));
  }
  for (const peak of relief.peaks || []) {
    const d = Math.hypot(x - peak.at[0], z - peak.at[1]);
    if (d >= peak.radius) continue;
    h += peak.height * Math.pow(Smoother(1 - d / peak.radius), peak.sharp ?? 1.6);
  }
  return h * fade;
}

/** 网格顶点用的采样映射：局部 (x,z) → DEM 采样点。两侧共用（DEM 按 |x| 取）。 */
function BaseHeight(x, z, terrain) {
  const near = Math.max(3, Number(terrain.near) || 4);
  const far = Math.max(near + 1, Number(terrain.far) || 100);
  const minZ = Number(terrain.minZ) || -80;
  const maxZ = Number(terrain.maxZ) || 80;
  const [sourceMinX, sourceMaxX, sourceMinZ, sourceMaxZ] = terrain.sourceBounds || [-1250, 1250, -2200, -380];
  const [referenceX, referenceZ] = terrain.sourceReference || [0, -1470];
  const u = Clamp01((Math.abs(x) - near) / (far - near));
  const v = Clamp01((z - minZ) / (maxZ - minZ));
  const sampleX = sourceMinX + (sourceMaxX - sourceMinX) * u;
  const sampleZ = sourceMinZ + (sourceMaxZ - sourceMinZ) * v;
  // 取**纯 DEM**（SampleJieheBaseHeight）而不是界河那关的最终地面：后者还叠着
  // L0 的战术土岗、排水沟与界河下切河槽。远景铺到 2.9 km 之后，那条河槽会在
  // 离铁路 800—1700 m 处横切出一道笔直的沟，而且因为 DEM 按 |x| 采样，它会
  // 左右各来一条，一眼露出镜像。门外布设那一带两者逐点相等（已验证），
  // 所以这一换对既有道具的落地高度是零影响。
  return (Number(terrain.baseY) || 0) + SampleJieheBaseHeight(sampleX, sampleZ)
    - SampleJieheBaseHeight(referenceX, referenceZ);
}

/** 连续地面高度：网格顶点就摆在这个值上。 */
export function FarLandY(x, z, terrain) {
  return BaseHeight(x, z, terrain) + ReliefHeight(x, z, terrain.relief);
}

/**
 * **画出来的那张网格**在 (x,z) 处的高度。
 *
 * 远景网格列距近 29 m、行距 26 m，连续函数与三角面之间差得出几十厘米；村舍按
 * 连续函数落地就会半悬空。这里把点吸附到格子上做双线性，村子才真的坐在地上。
 */
export function FarGridY(x, z, terrain) {
  const near = Math.max(3, Number(terrain.near) || 4);
  const far = Math.max(near + 1, Number(terrain.far) || 100);
  const minZ = Number(terrain.minZ) || -80;
  const maxZ = Number(terrain.maxZ) || 80;
  const columns = Math.max(2, Math.floor(terrain.columns || 40));
  const rows = Math.max(2, Math.floor(terrain.rows || 56));
  const side = x < 0 ? -1 : 1;
  const u = Clamp01((Math.abs(x) - near) / (far - near)) * (columns - 1);
  const v = Clamp01((z - minZ) / (maxZ - minZ)) * (rows - 1);
  const c0 = Math.min(columns - 2, Math.floor(u)), cf = u - c0;
  const r0 = Math.min(rows - 2, Math.floor(v)), rf = v - r0;
  const NodeX = (col) => side * (near + (far - near) * (col / (columns - 1)));
  const NodeZ = (row) => minZ + (maxZ - minZ) * (row / (rows - 1));
  const h00 = FarLandY(NodeX(c0), NodeZ(r0), terrain);
  const h10 = FarLandY(NodeX(c0 + 1), NodeZ(r0), terrain);
  const h01 = FarLandY(NodeX(c0), NodeZ(r0 + 1), terrain);
  const h11 = FarLandY(NodeX(c0 + 1), NodeZ(r0 + 1), terrain);
  return (h00 * (1 - cf) + h10 * cf) * (1 - rf) + (h01 * (1 - cf) + h11 * cf) * rf;
}

/**
 * 地表顶点色（乘在 Ground 贴图上，1,1,1 = 原样）。两件事：
 *   · 平原上按地块给农田色（返青冬麦／麦茬／翻耕黑土……）；
 *   · 抬起来的地方换成山坡色（灌木与裸岩），麦田不许种到山顶去。
 * `lift` 是该点相对平原抬起了多少米。
 */
export function FarmlandTint(x, z, farmland, lift = 0, out = [1, 1, 1]) {
  out[0] = 1; out[1] = 1; out[2] = 1;
  if (!farmland) return out;
  const seed = farmland.seed ?? 1938;
  const angle = farmland.angle ?? 0.2;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rx = x * cos - z * sin;
  const rz = x * sin + z * cos;
  // 和 ReliefHeight 同样两道闸：径向淡入（沿铁路那条楔形也要有地块）
  // + 路基走廊留白（路基与道砟那一条不种麦子）。
  const distance = Math.hypot(x, z);
  const blend = farmland.blend ?? 90;
  const from = farmland.from ?? 150;
  const to = farmland.to ?? 1400;
  const [corridorFrom, corridorTo] = farmland.corridor || [0, 0];
  const reach = SmoothStep(from, from + blend, distance)
    * (1 - SmoothStep(to - blend * 3, to, distance))
    * (corridorTo > corridorFrom ? SmoothStep(corridorFrom, corridorTo, Math.abs(x)) : 1);
  const hill = SmoothStep(farmland.hillFrom ?? 5, farmland.hillTo ?? 16, lift);
  const tint = [1, 1, 1];
  let weight = 0;
  if (hill < 0.998 && reach > 0.002) {
    const cellX = farmland.cellX ?? 96;
    const cellZ = farmland.cellZ ?? 138;
    const jitter = farmland.jitter ?? 0.32;
    // 地块边界抖一抖：正交网格一眼就是棋盘，抖过之后才像一块块自然长出来的地
    const jx = (ValueNoise2(rz / 210, 4.3, seed) - 0.5) * cellX * jitter;
    const jz = (ValueNoise2(rx / 265, 9.1, seed + 17) - 0.5) * cellZ * jitter;
    const ix = Math.floor((rx + jx) / cellX);
    const iz = Math.floor((rz + jz) / cellZ);
    const palette = farmland.palette || [[1, 1, 1]];
    const field = palette[HashString(`${seed}|${ix}|${iz}`) % palette.length];
    for (let i = 0; i < 3; i += 1) tint[i] = field[i];
    weight = (farmland.strength ?? 0.9) * reach * (1 - hill);
  }
  if (hill > 0.002 && farmland.hillPalette) {
    // 山坡：灌木、荒草与裸土交错。**必须给它上色** —— 不上色的山头是一块和
    // 天空同色的淡影，读成雾，不读成山。
    const list = farmland.hillPalette;
    const hx = Math.floor(rx / (farmland.hillCell ?? 210));
    const hz = Math.floor(rz / (farmland.hillCell ?? 210));
    const shade = list[HashString(`${seed}h|${hx}|${hz}`) % list.length];
    const hillWeight = (farmland.hillStrength ?? 0.95) * hill;
    const total = weight + hillWeight || 1;
    for (let i = 0; i < 3; i += 1) tint[i] = (tint[i] * weight + shade[i] * hillWeight) / total;
    weight = Math.min(1, weight + hillWeight);
  }
  if (weight <= 0.002) return out;
  // 同一块地里再给一点点明暗，整块地不至于是一片死平的纯色
  const grain = 1 + (ValueNoise2(rx / 46, rz / 46, seed + 3) - 0.5) * (farmland.grain ?? 0.10);
  for (let i = 0; i < 3; i += 1) {
    out[i] = 1 + (tint[i] * grain - 1) * weight;
  }
  return out;
}
