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
function MakeFrame(x, z, ry) {
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
  // 洞里的暗：退到墙心，前后都留出洞口进深
  const darkH = winH + archH * 0.62;
  sink.Add(dark, PlaceGeometry(
    MakeBox(openW - 0.26, darkH, thickness * 0.42, TILE_METERS.stone, `${seed}:dk`),
    { x: cx, y: sillY + darkH / 2, z: cz, ry: rot }));
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
      });
    }
  }

  // --- 两端山墙（北=圣坛端，南=钟塔端）---
  for (const s of [-1, 1]) {
    const p = L(0, s * naveD / 2);
    AddWall(sink, "HouseBrick", {
      x: p.x, z: p.z, length: naveW, height: eave, thickness: wallT, ry,
      ruin: damage * 0.45, seed: `${seed}:gw${s}`, plinth: "CrossStone",
    });
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
      thickness: wallT, seed: `${seed}:apse`,
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
  const tw = Clamp(naveW * 0.42, 3.6, 5.2);
  const towerLz = naveD / 2 + tw / 2 - 0.4;
  const tp = L(0, towerLz);
  const belfryY = towerH - tw * 0.72;
  sink.Add("CrossStone", PlaceGeometry(
    MakeBox(tw + 0.9, 1.0, tw + 0.9, TILE_METERS.stone, `${seed}:tbase`),
    { x: tp.x, y: 0.5, z: tp.z, ry }));
  sink.Solid(tp.x, towerH / 2, tp.z, tw / 2 + 0.45, towerH / 2, tw / 2 + 0.45, "wall", ry);
  {
    const shaftH = belfryY - 1.0;
    const t = 0.5;
    const faces = [
      [0, (tw - t) / 2, tw, t], [0, -(tw - t) / 2, tw, t],
      [(tw - t) / 2, 0, t, tw - t * 2], [-(tw - t) / 2, 0, t, tw - t * 2],
    ];
    for (let i = 0; i < faces.length; i += 1) {
      const [lx, lz, bw, bd] = faces[i];
      const p = L(lx, towerLz + lz);
      sink.Add("HouseBrick", PlaceGeometry(
        MakeBox(bw, shaftH, bd, TILE_METERS.brick, `${seed}:ts${i}`, BRICK_UV_GRID),
        { x: p.x, y: 1.0 + shaftH / 2, z: p.z, ry }));
    }
    // 塔身中段的浅色抹面束带 —— 把 16 m 的塔切成两段，不然是一根光砖柱子
    const band = L(0, towerLz);
    sink.Add("ChurchPlaster", PlaceGeometry(
      MakeBox(tw + 0.24, 0.34, tw + 0.24, TILE_METERS.adobe, `${seed}:tband`),
      { x: band.x, y: 1.0 + shaftH * 0.58, z: band.z, ry }));
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
function AddClassroomRow(sink, {
  x, z, ry, width, depth, eaveY, ridgeY, seed, damage = 0, burnt = false, bays = 9,
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
      const dback = L(lx, depth / 2 - 0.18);
      sink.Add("Charred", PlaceGeometry(
        MakeBox(openW - 0.16, doorH, 0.14, TILE_METERS.stone, `${seed}:dk${k}`),
        { x: dback.x, y: doorH / 2, z: dback.z, ry }));
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
    const back = L(lx, depth / 2 - 0.16);
    sink.Add("Charred", PlaceGeometry(
      MakeBox(openW - 0.1, winH, 0.14, TILE_METERS.stone, `${seed}:wd${k}`),
      { x: back.x, y: sillY + winH / 2, z: back.z, ry }));
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
  for (let i = 0; i < rows.length; i += 1) {
    const p = L(0, rows[i]);
    if (host.OnStreet(p.x, p.z, rowW / 2, rowD / 2)) continue;
    AddClassroomRow(sink, {
      x: p.x, z: p.z, ry, width: rowW, depth: rowD, eaveY, ridgeY,
      seed: `${seed}:cls${i}`, damage, burnt, bays,
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
      // 旗杆：操场北端正中。9.5 m，比周围任何一间教室都高 —— 俯瞰与街景的双重路标
      const fp = L(0, front + 1.2);
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
