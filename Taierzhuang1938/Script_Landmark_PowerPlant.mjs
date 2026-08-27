// 西关电灯厂 —— 烟囱是西关天际线的关键剪影，在西城门楼直瞄射程内。工作包 B2 专属文件。
// 契约见 Script_LandmarkRegistry.mjs 头注。f = WEST_SUBURB.powerPlant（w30 d18 chimneyH22）。
//
// —— 史实纪律 ——
// docs/Data_TengxianCity.md §5.4 只给三件事，全部是 `[主流记载]`：
//   ① 滕县有电灯厂，在西关外、西门通往火车站的路上；
//   ② 王铭章的师司令部原设在城外的电灯厂，3 月 16 日才迁入城内；
//   ③ 王铭章缒城后奔车站，「刚到西关电灯厂附近」被**西城门楼上的日兵**发现遭扫射阵亡。
// 同一份 docs 的 uncertainties 又明写：「西关电灯厂的规模、厂房形制、烟囱高度、
// 与西门的确切距离，均无资料」。所以本文件做的是**能被城楼机枪压住的那一小片工业剪影**，
// 不是一座发电厂的复原：厂房两跨 + 一根烟囱 + 变电小院 + 煤堆 + 一圈厂墙，此外一律不加。
//
// 形制推定的三条依据（全部登记进 WP_B2 报告的 PRESUMED 候选表）：
//   · 1930 年代县城级电灯厂 = 一台往复式蒸汽机 + 一两台火管锅炉，装机几十到二百千瓦。
//     对应的房子就是**两跨**：锅炉房（矮、烟囱端）与机器房（高、跨度大）。
//   · 工业建筑与民居的唯一「一眼可辨」分界是**高侧窗采光带**：民居对外不开窗、
//     朝院窗台 0.92 m；这里是窗台 3.0/3.6 m、洞高 2.4/3.3 m 的一整条连续窗带，
//     窗芯是钢窗格（AntennaSteel）不是木棂。远看就是「一长条房子上半截全是窗」。
//   · 烟囱 22 m 由 f.chimneyH 给死（数据文件不归本包改）。基座 + 检修爬梯是砖烟囱的通例，
//     爬梯朝**东**（对着城墙）——这一面是玩家从城头看过去的那一面。
//
// 坐标系：本文件统一用与 PlaceGeometry 的 ry 一致的那一套（局部 +z 在 ry=0 时指世界 +z=南），
// 与 A7 相同。**不调用** AddCompound / AddRoomBlock / AddFeatureRoom（它们是 z 取反的另一套）。
// 地坪：Script_TengxianCity.OUTER_PADS 的 "PowerPlant" 把 46×34 一块地找平到 y=0，
// 本文件的一切构件（含厂墙 hw=22.5 / hd=16.5）都压在这块垫地内，所以一律以 y=0 起砌。
//
// 材质预算：StationBrick / ChimneyBrick / RoofTile / Stone / WoodBeam / Charred / AntennaSteel
// 共 7 种（目标 6，超 1）。代价与理由见 WP_B2 报告「材质预算」一节。

import * as THREE from "three";
import { AddWall } from "./Script_World.mjs";
import { MakeBox, PlaceGeometry, TILE_METERS, BRICK_UV_GRID } from "./Script_Geo.mjs";
import { Mulberry32, HashString } from "./Script_Noise.mjs";
import { AddYardWallRing } from "./Script_YardWall.mjs";

const WALL_T = 0.5;          // 厂房外墙：比民居的 0.36 厚一档（工业砌体 + 吃屋架推力）
const YARD_HW = 22.5;        // 厂墙半宽/半深：贴着 OUTER_PADS 的 46×34 内边，出界就掉进 -1.2 的原野
const YARD_HD = 16.5;

/** 局部坐标系：+x → 世界 (cos, -sin)，+z → 世界 (sin, cos)；ry=0 时 +z 指南。 */
function MakeFrame(x, z, ry) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  return (lx, lz) => ({ x: x + cos * lx + sin * lz, z: z - sin * lx + cos * lz });
}

/**
 * 高侧窗采光带的一整面长墙。
 *
 * 「工业建筑」这四个字全靠这一面墙：砖墩按 3.3 m 一档排开，墩间从窗台一直开到檐下
 * 是一条不断的窗带，窗芯是四竖三横的钢窗格。民居的窗是 1.05 m 宽、三开间才一扇、
 * 木棂井字 —— 两者摆在一起，隔一百米也分得开。
 *
 * @param {object} spec lz 墙面所在的局部 z；inward 室内在墙的哪一侧（+1 / -1）
 */
function AddClerestoryWall(sink, L, ry, {
  lz, inward, len, eave, sillY, headY, bays, brick, seed, damage, doorBay = -1,
  doorW = 1.9, doorH = 2.55,
}) {
  const cell = len / bays;
  const openW = Math.min(2.0, cell * 0.58);
  const pierW = cell - openW;

  // 碱脚：整条一根，不逐墩摆（逐墩摆是 10 个盒子换同一条线）
  const pl = L(0, lz);
  sink.Add("Stone", PlaceGeometry(
    MakeBox(len + 0.12, 0.42, WALL_T + 0.1, TILE_METERS.stone, `${seed}:plinth`),
    { x: pl.x, y: 0.21, z: pl.z, ry }));

  // 砖墩（承重 + 碰撞都在这里）
  for (let k = 0; k <= bays; k += 1) {
    const end = (k === 0 || k === bays);
    const pw = end ? pierW / 2 + 0.3 : pierW;
    const lx = -len / 2 + cell * k + (k === 0 ? pw / 2 : (k === bays ? -pw / 2 : 0));
    const p = L(lx, lz);
    sink.Add(brick, PlaceGeometry(
      MakeBox(pw, eave, WALL_T, TILE_METERS.brick, `${seed}:pr${k}`, BRICK_UV_GRID),
      { x: p.x, y: eave / 2, z: p.z, ry }));
    sink.Solid(p.x, eave / 2, p.z, pw / 2, eave / 2, WALL_T / 2, "wall", ry);
  }

  // 窗洞（与当中那一扇门）
  const winH = headY - sillY;
  for (let k = 0; k < bays; k += 1) {
    const lx = -len / 2 + cell * (k + 0.5);
    const p = L(lx, lz);
    const inn = L(lx, lz + inward * (WALL_T / 2 - 0.08));
    const out = L(lx, lz - inward * (WALL_T / 2 + 0.04));

    if (k === doorBay) {
      // 门：地坪直上，不摆 Solid —— 这是玩家进厂房的口子
      sink.Add("Charred", PlaceGeometry(
        MakeBox(doorW, doorH, 0.16, TILE_METERS.stone, `${seed}:ddk${k}`),
        { x: inn.x, y: doorH / 2, z: inn.z, ry }));
      sink.Add("Stone", PlaceGeometry(
        MakeBox(doorW + 0.4, 0.2, WALL_T + 0.16, TILE_METERS.stone, `${seed}:dlin${k}`),
        { x: p.x, y: doorH + 0.1, z: p.z, ry }));
      // 门上到檐下：整块砖（窗带在这一档让给门）
      const upH = eave - doorH - 0.2;
      sink.Add(brick, PlaceGeometry(
        MakeBox(openW, upH, WALL_T, TILE_METERS.brick, `${seed}:dup${k}`, BRICK_UV_GRID),
        { x: p.x, y: doorH + 0.2 + upH / 2, z: p.z, ry }));
      // 门楣以上这块砖要有碰撞（底面 2.75 m，高过 1.6 m 净空线，门口照旧走得通）
      sink.Solid(p.x, doorH + 0.2 + upH / 2, p.z, openW / 2, upH / 2, WALL_T / 2, "wall", ry);
      sink.Add("Stone", PlaceGeometry(
        MakeBox(doorW + 0.7, 0.14, 0.95, TILE_METERS.stone, `${seed}:dstep${k}`),
        { x: out.x, y: 0.07, z: out.z, ry }));
      continue;
    }

    // 窗台以下 / 窗券以上的两条砖带。
    // 这两条**过去一只碰撞盒都没有**：碰撞只登记在砖墩上，于是墩与墩之间
    // 从地坪到檐口整整一格是空的 —— 人直接从厂房外墙走进去，子弹也照穿。
    // 窗带那一段（窗台到窗券）才是真洞，别的都得砌实。
    sink.Add(brick, PlaceGeometry(
      MakeBox(openW, sillY, WALL_T, TILE_METERS.brick, `${seed}:sb${k}`, BRICK_UV_GRID),
      { x: p.x, y: sillY / 2, z: p.z, ry }));
    sink.Solid(p.x, sillY / 2, p.z, openW / 2, sillY / 2, WALL_T / 2, "wall", ry);
    const upH = eave - headY - 0.18;
    if (upH > 0.1) {
      sink.Add(brick, PlaceGeometry(
        MakeBox(openW, upH, WALL_T, TILE_METERS.brick, `${seed}:hb${k}`, BRICK_UV_GRID),
        { x: p.x, y: headY + 0.18 + upH / 2, z: p.z, ry }));
      sink.Solid(p.x, headY + 0.18 + upH / 2, p.z, openW / 2, upH / 2, WALL_T / 2, "wall", ry);
    }
    // 洞里的暗：厂房是个封闭大空间，没有内衬就一眼看穿到对面天空
    sink.Add("Charred", PlaceGeometry(
      MakeBox(openW - 0.1, winH, 0.16, TILE_METERS.stone, `${seed}:dk${k}`),
      { x: inn.x, y: sillY + winH / 2, z: inn.z, ry }));
    // 石窗台 + 石过梁
    sink.Add("Stone", PlaceGeometry(
      MakeBox(openW + 0.26, 0.13, WALL_T + 0.22, TILE_METERS.stone, `${seed}:sl${k}`),
      { x: p.x, y: sillY - 0.065, z: p.z, ry }));
    sink.Add("Stone", PlaceGeometry(
      MakeBox(openW + 0.3, 0.18, WALL_T + 0.14, TILE_METERS.stone, `${seed}:li${k}`),
      { x: p.x, y: headY + 0.09, z: p.z, ry }));
    // 钢窗格：四竖三横。窗芯是钢不是木 —— 这是电灯厂与学校连排窗的分界
    if (damage < 0.6) {
      for (let m = 1; m <= 3; m += 1) {
        sink.Add("AntennaSteel", PlaceGeometry(
          MakeBox(openW - 0.12, 0.05, 0.07, TILE_METERS.stone, `${seed}:mh${k}${m}`),
          { x: out.x, y: sillY + winH * (m / 4), z: out.z, ry }));
      }
      for (let m = 0; m <= 3; m += 1) {
        const off = (-0.5 + m / 3) * (openW - 0.12);
        const q = L(lx + off, lz - inward * (WALL_T / 2 + 0.04));
        sink.Add("AntennaSteel", PlaceGeometry(
          MakeBox(0.05, winH - 0.06, 0.07, TILE_METERS.stone, `${seed}:mv${k}${m}`),
          { x: q.x, y: sillY + winH / 2, z: q.z, ry }));
      }
    }
  }
}

export function BuildPowerPlant(host, f, ctx) {
  const sink = host.sink;
  const ry = ctx.ry || 0;
  const damage = ctx.damage ?? 0.2;
  const burnt = !!ctx.burnt;
  const seed = `map:${f.id || "powerPlant"}`;
  const rnd = Mulberry32(HashString(`${seed}:pp`));
  const L = MakeFrame(f.x, f.z, ry);
  // 烧过的厂房走 ChimneyBrick（BrickWallSooty 底材），不新开一种材质
  const brick = burnt ? "ChimneyBrick" : "StationBrick";

  const hallW = f.w;                       // 30：厂房通面阔（东西向）
  const hallD = f.d;                       // 18：两跨合计进深
  const boilerD = 7.5;                     // 锅炉房跨（北，靠烟囱一端矮）
  const machineD = hallD - boilerD;        // 10.5：机器房跨（南，蒸汽机 + 发电机）
  const boilerCz = -hallD / 2 + boilerD / 2;
  const machineCz = hallD / 2 - machineD / 2;
  const partyLz = -hallD / 2 + boilerD;    // 两跨之间的隔墙
  const boilerEave = 6.4;
  const machineEave = 8.4;                 // 机器房比锅炉房高两米：两跨的高差是「两跨」的证据
  const boilerRidge = boilerEave + boilerD / 2 * 0.40;      // ≈7.9，压在隔墙 8.4 之下
  const machineRidge = machineEave + machineD / 2 * 0.40;   // ≈10.5

  // =========================================================================
  // 一、厂房两跨
  // =========================================================================

  // 北面（锅炉房外墙，朝厂门）：窗带 + 当中一扇人行门
  AddClerestoryWall(sink, L, ry, {
    lz: -hallD / 2, inward: 1, len: hallW, eave: boilerEave,
    sillY: 3.0, headY: 5.4, bays: 9, brick, seed: `${seed}:nw`, damage, doorBay: 4,
  });
  // 南面（机器房外墙）：窗带更高更长 + 一扇后门
  AddClerestoryWall(sink, L, ry, {
    lz: hallD / 2, inward: -1, len: hallW, eave: machineEave,
    sillY: 3.6, headY: 6.9, bays: 9, brick, seed: `${seed}:sw`, damage, doorBay: 4,
  });

  // --- 两跨的四片山墙端 + 山尖 ---
  const spans = [
    { cz: boilerCz, d: boilerD, eave: boilerEave, ridge: boilerRidge, tag: "b" },
    { cz: machineCz, d: machineD, eave: machineEave, ridge: machineRidge, tag: "m" },
  ];
  for (const sp of spans) {
    for (const sx of [-1, 1]) {
      const p = L(sx * hallW / 2, sp.cz);
      // 西山墙（朝铁路那一面）各开一个运煤/进料的大门洞；东山墙是实墙（烟囱在这一头）
      const door = (sx < 0)
        ? { w: sp.tag === "b" ? 3.2 : 2.6, h: sp.tag === "b" ? 4.0 : 3.2 }
        : null;
      if (!door) {
        sink.Add(brick, PlaceGeometry(
          MakeBox(WALL_T, sp.eave, sp.d, TILE_METERS.brick, `${seed}:ew${sp.tag}${sx}`, BRICK_UV_GRID),
          { x: p.x, y: sp.eave / 2, z: p.z, ry }));
        sink.Solid(p.x, sp.eave / 2, p.z, WALL_T / 2, sp.eave / 2, sp.d / 2, "wall", ry);
      } else {
        const segD = (sp.d - door.w) / 2;
        for (const side of [-1, 1]) {
          const q = L(sx * hallW / 2, sp.cz + side * (door.w / 2 + segD / 2));
          sink.Add(brick, PlaceGeometry(
            MakeBox(WALL_T, sp.eave, segD, TILE_METERS.brick, `${seed}:ew${sp.tag}${side}`, BRICK_UV_GRID),
            { x: q.x, y: sp.eave / 2, z: q.z, ry }));
          sink.Solid(q.x, sp.eave / 2, q.z, WALL_T / 2, sp.eave / 2, segD / 2, "wall", ry);
        }
        const upH = sp.eave - door.h - 0.24;
        sink.Add(brick, PlaceGeometry(
          MakeBox(WALL_T, upH, door.w, TILE_METERS.brick, `${seed}:ewu${sp.tag}`, BRICK_UV_GRID),
          { x: p.x, y: door.h + 0.24 + upH / 2, z: p.z, ry }));
        sink.Add("Stone", PlaceGeometry(
          MakeBox(WALL_T + 0.18, 0.24, door.w + 0.4, TILE_METERS.stone, `${seed}:ewl${sp.tag}`),
          { x: p.x, y: door.h + 0.12, z: p.z, ry }));
        // 门里的暗（大门洞后面是厂房的进深，正面直射时不该是一块亮天）
        const inn = L(sx * (hallW / 2 - 0.34), sp.cz);
        sink.Add("Charred", PlaceGeometry(
          MakeBox(0.16, door.h, door.w - 0.12, TILE_METERS.stone, `${seed}:ewd${sp.tag}`),
          { x: inn.x, y: door.h / 2, z: inn.z, ry }));
      }
      // 檐上的山尖：只补三角，不重砌下面那片墙。
      // 每一级取**两条边里矮的那个**（不是中点）——取中点时每级都有半格高出瓦面，
      // 从西北斜看过去，屋脊上排出一行砖色小方块（第一版出图抓到）。
      const rise = sp.ridge - sp.eave;
      const steps = 14;
      for (let i = 0; i < steps; i += 1) {
        const t0 = i / steps, t1 = (i + 1) / steps;
        const outer = Math.max(Math.abs(t0 * 2 - 1), Math.abs(t1 * 2 - 1));
        const hh = rise * (1 - outer);
        const t = (i + 0.5) / steps;
        if (hh < 0.14) continue;
        const g = L(sx * hallW / 2, sp.cz - sp.d / 2 + sp.d * t);
        sink.Add(brick, PlaceGeometry(
          MakeBox(WALL_T + 0.08, hh, sp.d / steps, TILE_METERS.brick, `${seed}:gb${sp.tag}${sx}${i}`, BRICK_UV_GRID),
          { x: g.x, y: sp.eave + hh / 2, z: g.z, ry }));
      }
    }

    // --- 屋面：低坡两坡 + 一条脊。工业跨不做椽头（30 m 面阔排椽是纯浪费） ---
    const rise = sp.ridge - sp.eave;
    const half = sp.d / 2;
    const slope = Math.hypot(half, rise);
    const angle = Math.atan2(rise, half);
    const over = 0.5;
    for (const s of [-1, 1]) {
      const cz = s * (half / 2);
      const p = L(0, sp.cz + cz);
      sink.Add(burnt ? "Charred" : "RoofTile", PlaceGeometry(
        MakeBox(hallW + over * 2, 0.14, slope + over, TILE_METERS.roof, `${seed}:rf${sp.tag}${s}`),
        { x: p.x, y: sp.eave + rise / 2, z: p.z, ry, rx: s * angle }));
    }
    const rp = L(0, sp.cz);
    sink.Add(burnt ? "Charred" : "RoofTile", PlaceGeometry(
      MakeBox(hallW + over * 2, 0.2, 0.42, TILE_METERS.roof, `${seed}:rdg${sp.tag}`),
      { x: rp.x, y: sp.ridge + 0.07, z: rp.z, ry }));
  }

  // --- 两跨之间的隔墙（顶到机器房檐口）+ 当中一个可走的洞 ---
  {
    const openW = 1.8, openH = 2.6;
    const segLen = (hallW - openW) / 2;
    for (const side of [-1, 1]) {
      const q = L(side * (openW / 2 + segLen / 2), partyLz);
      sink.Add(brick, PlaceGeometry(
        MakeBox(segLen, machineEave, 0.42, TILE_METERS.brick, `${seed}:pw${side}`, BRICK_UV_GRID),
        { x: q.x, y: machineEave / 2, z: q.z, ry }));
      sink.Solid(q.x, machineEave / 2, q.z, segLen / 2, machineEave / 2, 0.21, "wall", ry);
    }
    const c = L(0, partyLz);
    const upH = machineEave - openH - 0.2;
    sink.Add(brick, PlaceGeometry(
      MakeBox(openW, upH, 0.42, TILE_METERS.brick, `${seed}:pwu`, BRICK_UV_GRID),
      { x: c.x, y: openH + 0.2 + upH / 2, z: c.z, ry }));
    sink.Add("Stone", PlaceGeometry(
      MakeBox(openW + 0.4, 0.2, 0.56, TILE_METERS.stone, `${seed}:pwl`),
      { x: c.x, y: openH + 0.1, z: c.z, ry }));
  }

  // --- 机器房里的机座：两台机组的混凝土台 + 钢机身。厂房是可进入的，里面不能是空盒子 ---
  for (let i = 0; i < 2; i += 1) {
    const lx = -6.5 + i * 13;
    const p = L(lx, machineCz + 0.6);
    sink.Add("Stone", PlaceGeometry(
      MakeBox(5.2, 0.55, 2.6, TILE_METERS.stone, `${seed}:mb${i}`),
      { x: p.x, y: 0.275, z: p.z, ry }));
    sink.Add("AntennaSteel", PlaceGeometry(
      MakeBox(3.6, 1.35, 1.5, TILE_METERS.stone, `${seed}:mm${i}`),
      { x: p.x, y: 0.55 + 0.675, z: p.z, ry }));
    // 飞轮：立着的一枚大轮子，是「这里是机器房」最省的一笔
    const fw = L(lx + 2.5, machineCz + 0.6);
    const wheel = new THREE.CylinderGeometry(1.15, 1.15, 0.3, 12);
    sink.Add("AntennaSteel", PlaceGeometry(wheel,
      { x: fw.x, y: 1.5, z: fw.z, ry, rz: Math.PI / 2 }));
    sink.Solid(p.x, 1.0, p.z, 2.6, 1.0, 1.3, "prop", ry);
  }
  // 锅炉房里的两台火管锅炉（卧式圆筒）
  for (let i = 0; i < 2; i += 1) {
    const p = L(-4.5 + i * 9, boilerCz);
    const drum = new THREE.CylinderGeometry(1.05, 1.05, 5.0, 10);
    sink.Add("AntennaSteel", PlaceGeometry(drum,
      { x: p.x, y: 1.35, z: p.z, ry, rz: Math.PI / 2 }));
    sink.Add("Stone", PlaceGeometry(
      MakeBox(5.4, 0.6, 2.4, TILE_METERS.stone, `${seed}:bb${i}`),
      { x: p.x, y: 0.3, z: p.z, ry }));
    sink.Solid(p.x, 1.2, p.z, 2.7, 1.2, 1.2, "prop", ry);
  }

  // =========================================================================
  // 二、烟囱 —— 这一包的灵魂。22 m 由 f.chimneyH 给死
  // =========================================================================
  const chimH = f.chimneyH || 22;
  const chLx = hallW / 2 + 3.2;            // 贴着东山墙外 3.2 m，站在锅炉房轴线上
  const chLz = boilerCz;
  const ch = L(chLx, chLz);
  {
    // 基座三段：石台 → 砖墩 → 收口。少了这一段，22 m 的筒子直接从地里长出来
    sink.Add("Stone", PlaceGeometry(
      MakeBox(4.0, 0.5, 4.0, TILE_METERS.stone, `${seed}:chb0`),
      { x: ch.x, y: 0.25, z: ch.z, ry }));
    sink.Add("ChimneyBrick", PlaceGeometry(
      MakeBox(3.3, 3.2, 3.3, TILE_METERS.brick, `${seed}:chb1`, BRICK_UV_GRID),
      { x: ch.x, y: 2.1, z: ch.z, ry }));
    sink.Add("ChimneyBrick", PlaceGeometry(
      MakeBox(2.6, 0.5, 2.6, TILE_METERS.brick, `${seed}:chb2`, BRICK_UV_GRID),
      { x: ch.x, y: 3.95, z: ch.z, ry }));
    sink.Solid(ch.x, 2.1, ch.z, 1.65, 2.1, 1.65, "wall", ry);

    // 筒身：收分的砖筒。UV 沿高度拉长，砖缝才不会糊成一片
    const capH = 0.7;
    const shaftBase = 4.2;
    const shaftH = chimH - shaftBase - capH;
    const rBot = 1.15, rTop = 0.72;
    const shaft = new THREE.CylinderGeometry(rTop, rBot, shaftH, 12, 1, true);
    const uv = shaft.attributes.uv;
    for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * 3.4, uv.getY(i) * shaftH / 1.2);
    sink.Add("ChimneyBrick", PlaceGeometry(shaft,
      { x: ch.x, y: shaftBase + shaftH / 2, z: ch.z }));
    sink.Solid(ch.x, shaftBase + shaftH / 2, ch.z, 1.05, shaftH / 2, 1.05, "wall", ry);
    // 囱口：比筒身略挑出的一圈砖箍 + 一圈黑口
    sink.Add("ChimneyBrick", PlaceGeometry(
      new THREE.CylinderGeometry(0.9, 0.86, capH, 12),
      { x: ch.x, y: chimH - capH / 2, z: ch.z }));
    sink.Add("Charred", PlaceGeometry(
      new THREE.CylinderGeometry(0.66, 0.66, 0.24, 10),
      { x: ch.x, y: chimH - 0.12, z: ch.z }));
    // 三道加固铁箍：把 18 m 的光筒子切成四段，逆光时它才有尺度
    for (let i = 1; i <= 3; i += 1) {
      const t = i / 4;
      const yb = shaftBase + shaftH * t;
      const r = rBot + (rTop - rBot) * t;
      sink.Add("AntennaSteel", PlaceGeometry(
        new THREE.CylinderGeometry(r + 0.05, r + 0.05, 0.16, 12, 1, true),
        { x: ch.x, y: yb, z: ch.z }));
    }

    // 检修爬梯：朝东（对着城墙）。踏棍随筒身收分一路收进去，不是一条直梯贴在斜面上
    const step = 0.5;
    const y0 = 4.5, y1 = chimH - 1.0;
    const count = Math.floor((y1 - y0) / step);
    for (let i = 0; i <= count; i += 1) {
      const yy = y0 + i * step;
      const t = (yy - shaftBase) / shaftH;
      const r = rBot + (rTop - rBot) * Math.max(0, Math.min(1, t));
      const q = L(chLx + r + 0.30, chLz);
      sink.Add("AntennaSteel", PlaceGeometry(
        MakeBox(0.06, 0.05, 0.62, TILE_METERS.stone, `${seed}:lr${i}`),
        { x: q.x, y: yy, z: q.z, ry }));
      if (i === count) continue;
      for (const s of [-1, 1]) {
        const rr = L(chLx + r + 0.30, chLz + s * 0.29);
        sink.Add("AntennaSteel", PlaceGeometry(
          MakeBox(0.06, step * 1.04, 0.06, TILE_METERS.stone, `${seed}:ls${i}${s}`),
          { x: rr.x, y: yy + step / 2, z: rr.z, ry }));
      }
    }

    // 烟道：锅炉房东山墙到烟囱基座的一段砖套管
    const flue = L(hallW / 2 + 1.6, chLz);
    sink.Add("ChimneyBrick", PlaceGeometry(
      MakeBox(2.6, 2.2, 1.9, TILE_METERS.brick, `${seed}:flue`, BRICK_UV_GRID),
      { x: flue.x, y: 1.1, z: flue.z, ry }));
    sink.Solid(flue.x, 1.1, flue.z, 1.3, 1.1, 0.95, "wall", ry);
    sink.Cover(flue.x, flue.z, 2.2, Math.sin(ry), Math.cos(ry));
  }

  // =========================================================================
  // 三、变电小院（院内东南角）：矮墙 + 瓷瓶横担架线柱 + 变压器台
  //
  // 摆在东南而不是西侧，是被两件事挤出来的：西山墙那两个运煤/进料大门洞必须留出车道，
  // 而架空线要往**东**（城里）去 —— 电灯厂供的就是城内的电灯。
  // =========================================================================
  const subCx = 9.0, subCz = 13.0, subHw = 7.0, subHd = 2.5;
  {
    const h = 1.6;
    // 样条围墙 PCG：闭环矮墙，朝厂院的一面（局部 -z）留 2.4 m 的口子。
    // 本文件的 L 是 +lz 指南的那一套，而口子开在 -lz 一侧 —— frame 里把 lz
    // 取反，让管线约定的「+lz = 开口那一面」对上。
    AddYardWallRing(sink, {
      frame: (lx, lz) => L(subCx + lx, subCz - lz),
      hw: subHw, hd: subHd, preset: "landmarkYardPlain",
      material: brick, height: h, thickness: 0.3,
      seed: `${seed}:sub`, ruin: damage * 0.8,
      gates: [{ side: "s", offset: 0, openW: 2.4 }],
      plinth: { material: "Stone", height: 0.42, grow: 0.06, out: 0.07 },
    });
    // 变压器台：石台 + 铁壳 + 两只套管
    const tp = L(subCx + 2.5, subCz + 1.2);
    sink.Add("Stone", PlaceGeometry(
      MakeBox(2.4, 0.45, 2.0, TILE_METERS.stone, `${seed}:trb`),
      { x: tp.x, y: 0.225, z: tp.z, ry }));
    sink.Add("AntennaSteel", PlaceGeometry(
      MakeBox(1.7, 1.5, 1.3, TILE_METERS.stone, `${seed}:trt`),
      { x: tp.x, y: 1.2, z: tp.z, ry }));
    for (const s of [-1, 1]) {
      const q = L(subCx + 2.5 + s * 0.45, subCz + 1.2);
      sink.Add("Stone", PlaceGeometry(
        new THREE.CylinderGeometry(0.11, 0.14, 0.5, 6),
        { x: q.x, y: 2.2, z: q.z }));
    }
    sink.Solid(tp.x, 0.95, tp.z, 1.2, 0.95, 1.0, "prop", ry);
  }

  // --- 架线柱：院内三根 + 院外一根出线柱。瓷瓶（Stone 小柱）压在横担上 ---
  const poleLxs = [subCx - 5.0, subCx, subCx + 5.0, subCx + 10.8];
  const poleH = 8.2;
  const armY = [poleH - 1.2, poleH - 0.5];
  function AddLinePole(lx, lz, tag) {
    const p = L(lx, lz);
    sink.Add("WoodBeam", PlaceGeometry(
      new THREE.CylinderGeometry(0.11, 0.17, poleH, 8), { x: p.x, y: poleH / 2, z: p.z }));
    for (let a = 0; a < armY.length; a += 1) {
      sink.Add("WoodBeam", PlaceGeometry(
        MakeBox(0.13, 0.12, 2.3, TILE_METERS.wood, `${seed}:arm${tag}${a}`),
        { x: p.x, y: armY[a], z: p.z, ry }));
      for (let m = -1; m <= 1; m += 1) {
        const q = L(lx, lz + m * 0.95);
        sink.Add("Stone", PlaceGeometry(
          new THREE.CylinderGeometry(0.095, 0.125, 0.26, 6),
          { x: q.x, y: armY[a] + 0.19, z: q.z }));
      }
      // 斜撑
      for (const s of [-1, 1]) {
        const q = L(lx, lz + s * 0.6);
        sink.Add("AntennaSteel", PlaceGeometry(
          MakeBox(0.05, 1.0, 0.05, TILE_METERS.stone, `${seed}:br${tag}${a}${s}`),
          { x: q.x, y: armY[a] - 0.45, z: q.z, ry, rx: s * 0.62 }));
      }
    }
    sink.Solid(p.x, poleH / 2, p.z, 0.2, poleH / 2, 0.2, "prop", ry);
    return p;
  }
  for (let i = 0; i < poleLxs.length; i += 1) AddLinePole(poleLxs[i], subCz, `p${i}`);
  // 导线：相邻柱之间每层三根，沿局部 +x（往城门方向）。线是细长盒，中点略压低当作垂度
  for (let i = 0; i < poleLxs.length - 1; i += 1) {
    const span = poleLxs[i + 1] - poleLxs[i];
    for (let a = 0; a < armY.length; a += 1) {
      for (let m = -1; m <= 1; m += 1) {
        const q = L((poleLxs[i] + poleLxs[i + 1]) / 2, subCz + m * 0.95);
        sink.Add("AntennaSteel", PlaceGeometry(
          MakeBox(span, 0.04, 0.04, TILE_METERS.stone, `${seed}:wire${i}${a}${m}`),
          { x: q.x, y: armY[a] + 0.28 - Math.min(0.35, span * 0.035), z: q.z, ry }));
      }
    }
  }

  // =========================================================================
  // 四、煤堆 / 渣堆 / 煤渣地面
  // =========================================================================
  {
    const cx = -13.5, cz = -12.4, cw = 12.0, cd = 5.6, chgt = 2.5;
    const base = L(cx, cz);
    // 底铺：两头比煤块窄一档（让煤块盖住它的直边），前后压到石坎底下
    sink.Add("Charred", PlaceGeometry(
      MakeBox(cw * 0.86, 0.45, cd + 0.8, TILE_METERS.stone, `${seed}:coal0`),
      { x: base.x, y: 0.225, z: base.z, ry }));
    // 堆形：块子小、数量多、高度按到中心的距离衰减。
    // 第一版是十四个 2—4 m 的大盒子，出图上读成「一摞黑板子」不是一堆煤。
    for (let i = 0; i < 26; i += 1) {
      const u = rnd() * 2 - 1, v = rnd() * 2 - 1;
      const radial = Math.max(Math.abs(u), Math.abs(v));
      const lx = cx + u * cw * 0.42;
      const lz = cz + v * cd * 0.36;
      const w = 0.75 + rnd() * 1.15;
      const h = (0.45 + 1.85 * (1 - radial)) * (0.7 + rnd() * 0.55);
      const p = L(lx, lz);
      sink.Add("Charred", PlaceGeometry(
        MakeBox(w, Math.min(h, chgt), w * (0.7 + rnd() * 0.6), TILE_METERS.stone, `${seed}:coal${i}`),
        {
          x: p.x, y: 0.4 + Math.min(h, chgt) / 2, z: p.z,
          ry: ry + rnd() * 1.2, rx: (rnd() - 0.5) * 0.3, rz: (rnd() - 0.5) * 0.3,
        }));
    }
    // 煤堆挡墙：两条石坎，把散煤圈住（也给 AI 一处 1 m 掩体）
    for (const s of [-1, 1]) {
      const p = L(cx, cz + s * (cd / 2 + 0.3));
      sink.Add("Stone", PlaceGeometry(
        MakeBox(cw + 0.6, 0.85, 0.4, TILE_METERS.stone, `${seed}:coalk${s}`),
        { x: p.x, y: 0.425, z: p.z, ry }));
    }
    sink.Solid(base.x, 1.1, base.z, cw / 2, 1.1, cd / 2 + 0.4, "embankment", ry);
    sink.Cover(base.x, base.z, 2.0, Math.sin(ry), Math.cos(ry));

    // 渣堆：烟囱脚下一小堆炉灰
    const ap = L(hallW / 2 + 6.5, boilerCz + 5.2);
    for (let i = 0; i < 5; i += 1) {
      const p = L(hallW / 2 + 6.5 + (rnd() - 0.5) * 2.6, boilerCz + 5.2 + (rnd() - 0.5) * 2.2);
      const h = 0.4 + rnd() * 0.7;
      sink.Add("Charred", PlaceGeometry(
        MakeBox(1.4 + rnd(), h, 1.2 + rnd() * 0.8, TILE_METERS.stone, `${seed}:ash${i}`),
        { x: p.x, y: h / 2, z: p.z, ry: ry + rnd() }));
    }
    void ap;

    // 煤渣硬地：厂门 → 锅炉房门 的一条黑道。电灯厂的院子不是黄土，是煤渣
    const road = L(-2.0, -12.6);
    sink.Add("Charred", PlaceGeometry(
      MakeBox(5.0, 0.06, 7.2, TILE_METERS.stone, `${seed}:cinder0`),
      { x: road.x, y: 0.03, z: road.z, ry }));
    const road2 = L(-8.0, -10.6);
    sink.Add("Charred", PlaceGeometry(
      MakeBox(13.0, 0.06, 3.2, TILE_METERS.stone, `${seed}:cinder1`),
      { x: road2.x, y: 0.03, z: road2.z, ry }));
  }

  // =========================================================================
  // 五、厂墙 + 厂门 + 值班房
  // =========================================================================
  {
    const h = 2.2, gateW = 4.4, gateLx = -2.0;
    // 一圈厂墙走样条围墙 PCG。厂门开在局部 -z 那一面（临街），frame 取反 lz。
    // 门洞净宽两侧各让 1.0 m 给门垛。
    AddYardWallRing(sink, {
      frame: (lx, lz) => L(lx, -lz),
      hw: YARD_HW, hd: YARD_HD, preset: "landmarkYardPlain",
      material: brick, height: h, thickness: 0.35,
      seed: `${seed}:yw`, ruin: damage * 0.8,
      gates: [{ side: "s", offset: -gateLx, openW: gateW + 2.0 }],
      plinth: { material: "Stone", height: 0.42, grow: 0.06, out: 0.07 },
      onStreet: (x, z, ex, ez) => host.OnStreet(x, z, ex, ez),
    });
    {
      // 门垛 + 门额石（无字：1938 年 3 月的厂名字样无资料）
      for (const side of [-1, 1]) {
        const q = L(gateLx + side * (gateW / 2 + 0.5), -YARD_HD);
        sink.Add(brick, PlaceGeometry(
          MakeBox(1.0, 3.3, 0.9, TILE_METERS.brick, `${seed}:gp${side}`, BRICK_UV_GRID),
          { x: q.x, y: 1.65, z: q.z, ry }));
        sink.Solid(q.x, 1.65, q.z, 0.5, 1.65, 0.45, "wall", ry);
      }
      const c = L(gateLx, -YARD_HD);
      sink.Add("Stone", PlaceGeometry(
        MakeBox(gateW + 2.0, 0.34, 1.0, TILE_METERS.stone, `${seed}:glin`),
        { x: c.x, y: 3.15, z: c.z, ry }));
      const plq = L(gateLx, -YARD_HD - 0.56);
      sink.Add("Stone", PlaceGeometry(
        MakeBox(2.0, 0.55, 0.14, TILE_METERS.stone, `${seed}:plaque`),
        { x: plq.x, y: 2.55, z: plq.z, ry }));
    }

    // 值班房：门里东侧一间小屋（5.4×4.4，檐口 2.9）。厂区的人的尺度参照
    const gx = 5.6, gz = -13.4, gw = 5.4, gd = 4.4, geave = 2.9;
    const gp = L(gx, gz);
    if (!host.OnStreet(gp.x, gp.z, gw / 2, gd / 2)) {
      const faces = [
        { lx: 0, lz: -gd / 2, len: gw, rot: ry },
        { lx: -gw / 2, lz: 0, len: gd, rot: ry + Math.PI / 2 },
        { lx: gw / 2, lz: 0, len: gd, rot: ry + Math.PI / 2 },
      ];
      for (let i = 0; i < faces.length; i += 1) {
        const p = L(gx + faces[i].lx, gz + faces[i].lz);
        AddWall(sink, brick, {
          x: p.x, z: p.z, length: faces[i].len, height: geave, thickness: 0.34, ry: faces[i].rot,
          ruin: damage * 0.7, seed: `${seed}:gh${i}`, plinth: "Stone",
        });
      }
      // 南面：门 + 一扇窗
      const doorW = 1.0, winW = 1.2;
      const segLen = (gw - doorW - winW) / 2;
      for (const side of [-1, 1]) {
        const q = L(gx + side * (gw / 2 - segLen / 2), gz + gd / 2);
        AddWall(sink, brick, {
          x: q.x, z: q.z, length: segLen, height: geave, thickness: 0.34, ry,
          ruin: damage * 0.7, seed: `${seed}:ghf${side}`, plinth: "Stone",
        });
      }
      const dp = L(gx - (doorW + winW) / 2 + doorW / 2 + 0.0, gz + gd / 2);
      sink.Add("Charred", PlaceGeometry(
        MakeBox(doorW, 2.1, 0.16, TILE_METERS.stone, `${seed}:ghd`),
        { x: dp.x, y: 1.05, z: dp.z, ry }));
      sink.Add(brick, PlaceGeometry(
        MakeBox(doorW, geave - 2.25, 0.34, TILE_METERS.brick, `${seed}:ghdu`, BRICK_UV_GRID),
        { x: dp.x, y: 2.25 + (geave - 2.25) / 2, z: dp.z, ry }));
      const wp = L(gx + (doorW + winW) / 2 - winW / 2, gz + gd / 2);
      sink.Add("Charred", PlaceGeometry(
        MakeBox(winW, 1.15, 0.16, TILE_METERS.stone, `${seed}:ghw`),
        { x: wp.x, y: 1.55, z: wp.z, ry }));
      sink.Add(brick, PlaceGeometry(
        MakeBox(winW, 0.98, 0.34, TILE_METERS.brick, `${seed}:ghwl`, BRICK_UV_GRID),
        { x: wp.x, y: 0.49, z: wp.z, ry }));
      sink.Add(brick, PlaceGeometry(
        MakeBox(winW, geave - 2.15, 0.34, TILE_METERS.brick, `${seed}:ghwu`, BRICK_UV_GRID),
        { x: wp.x, y: 2.15 + (geave - 2.15) / 2, z: wp.z, ry }));
      for (let m = 0; m <= 2; m += 1) {
        const q = L(gx + (doorW + winW) / 2 - winW / 2 + (-0.5 + m * 0.5) * (winW - 0.1), gz + gd / 2 + 0.03);
        sink.Add("WoodBeam", PlaceGeometry(
          MakeBox(0.06, 1.1, 0.08, TILE_METERS.wood, `${seed}:ghm${m}`),
          { x: q.x, y: 1.55, z: q.z, ry }));
      }
      // 硬山小瓦顶（脊沿 x）
      const gridge = geave + gd / 2 * 0.52;
      const grise = gridge - geave;
      const gslope = Math.hypot(gd / 2, grise);
      const gangle = Math.atan2(grise, gd / 2);
      for (const s of [-1, 1]) {
        const p = L(gx, gz + s * (gd / 4));
        sink.Add(burnt ? "Charred" : "RoofTile", PlaceGeometry(
          MakeBox(gw + 0.9, 0.12, gslope + 0.45, TILE_METERS.roof, `${seed}:ghr${s}`),
          { x: p.x, y: geave + grise / 2, z: p.z, ry, rx: s * gangle }));
      }
      sink.Add(burnt ? "Charred" : "RoofTile", PlaceGeometry(
        MakeBox(gw + 1.0, 0.16, 0.3, TILE_METERS.roof, `${seed}:ghrdg`),
        { x: gp.x, y: gridge + 0.06, z: gp.z, ry }));
    }
  }
}
