// Notion 2026-09-24: 11–12 transfer topology; concept Stage_11/11_B/12/12_B,
// Stage_13/13_B/14/14_B. The adopted text controls adjacency and direction.
// North village fire -> covered sorting yard -> open south cart road. The west
// ditch is a separate pedestrian escape after the same cart stops in stage 13.
// Keep authored crowd pockets, four cart bays, firing posts, supply and routes.
// This factory is pure data; Layout supplies the shared terrain sampler and all
// geometry is consumed by the existing whitebox BuildSink/collision pipeline.
//
// 2026-09-27 concept pass (05–18 whitebox, region C; terrain in
// Data_FirstLevelWhiteboxTerrainTransfer). Both sides of the x76 road dip ~1 m
// in the south half of the yard (back to grade before the river lip, which is
// Topology's), so the road reads as an embankment at bridge-deck height.
// Round 2: the road is lined with broken brick walls at x 71 / x 80 whose
// segments and gaps come from MID_TUNING.transferEvac — the same table the
// stage-13 scatter (roadside cover behind the walls) and the 15A retreat lanes
// (through the west-wall gaps to the ditch mouth) walk. South of z 110 the east
// side stays open: cart bays, the loading stand (80,120) and every departing
// cart's straight run to the bridge cross it. The west terrace scarp stands
// behind the farm store; an east levee ridge by the river carries the concept's
// left-hand high ground. Non-solid dressing is allowed anywhere.
//
// 2026-09-30 C2 pass (12–18 whitebox, docs/Data_FirstLevelMid20260919.md §6): z 118.5–136.4 of the road is now a
// walled lane (west: 3.7 m brick with coping, pilasters and one window; east: 3 m rammed earth with one window),
// a drainage ditch runs along the west wall foot (terrain table), the river-lip balustrade runs west to x 55.6,
// windowed ruin walls at the bay row (x 100.4) and the ditch's east lip. Wall extents and gaps are still
// MID_TUNING.transferEvac.walls (westTall / eastTall); standing convoy carts are runtime props (transferConvoy).
import { MID_TUNING } from "./Data_Tuning_FirstLevelMid.mjs";

export function BuildTransferWhitebox(groundAt) {
  const blocks = [];
  function Block(id, x, z, w, h, d, semantic = "plaster", extra = {}) {
    const top = groundAt(x, z) + h;
    const base = Math.min(...[-1, 0, 1].flatMap(a => [-1, 0, 1].map(b =>
      groundAt(x + a * w / 2, z + b * d / 2)))) - 0.12;
    const block = { id, x, z, w, h: top - base, d, y: (top + base) / 2,
      semantic, tag: "whiteboxWall", ...extra };
    blocks.push(block);
    return block;
  }
  // Absolute placement: bottom at `bottom` (world y).
  function At(id, x, z, w, h, d, bottom, semantic = "plaster", extra = {}) {
    const block = { id, x, z, w, h, d, y: bottom + h / 2, semantic, tag: "whiteboxWall", ...extra };
    blocks.push(block);
    return block;
  }
  function Roof(id, x, z, w, d, height) {
    blocks.push({ id, x, z, w, h: 0.2, d, y: groundAt(x, z) + height,
      semantic: "timber", tag: "whiteboxWall" });
  }
  function Cover(id, x, z, w, h, d, extra = {}) {
    return Block(id, x, z, w, h, d, "cover", { cover: { faceX: 0, faceZ: -1 }, ...extra });
  }
  // Small props: no collision, slightly sunk so they never float on a slope.
  function Detail(id, x, z, w, h, d, semantic = "timber", extra = {}) {
    const bottom = Math.min(groundAt(x - w / 2, z - d / 2), groundAt(x + w / 2, z + d / 2), groundAt(x, z)) - 0.05;
    return At(id, x, z, w, h, d, bottom, semantic, { solid: false, ...extra });
  }
  // Closed stepped roof (same profile as the Village package's Roof()): soffit,
  // eaves, slopes and ridge, so a first-person look up never finds the sky.
  function HouseRoof(id, x, z, w, d, height, alongX = false, semantic = "roof") {
    const floor = groundAt(x, z), across = alongX ? d : w, along = alongX ? w : d;
    const Piece = (suffix, offset, a, h, l, rise) => At(`${id}${suffix}`,
      alongX ? x : x + offset, alongX ? z + offset : z,
      alongX ? l : a, h, alongX ? a : l, floor + height + rise - h / 2, semantic);
    Piece("Soffit", 0, across * 1.08, .32, along + .9, .16);
    for (const side of [-1, 1]) {
      Piece(`Eave${side}`, side * across * .39, across * .3, .25, along + .9, .125);
      Piece(`Slope${side}`, side * across * .2, across * .22, .3, along + .5, .44);
      Piece(`Ridge${side}`, side * .8, .8, .35, along + .2, .77);
    }
    Piece("RidgeCap", 0, 1.6, .35, along + .2, .77);
  }
  function House(id, x, z, w, d, h, { alongX = false, wall = "plaster", roof = "roof" } = {}) {
    Block(`${id}Body`, x, z, w, h, d, wall);
    HouseRoof(id, x, z, w, d, h, alongX, roof);
  }
  function Pole(id, x, z, h = 6.8) {
    const g = groundAt(x, z);
    At(`${id}Post`, x, z, .24, h + .4, .24, g - .4, "timber");
    At(`${id}Arm`, x, z, 1.5, .1, .1, g + h - .45, "timber", { solid: false });
  }

  // ---------------------------------------------------------------------
  // 12_1 / 12_3: the village-facing low wall is dry-laid rubble in three staggered
  // courses, not a slab (2026-09-30 rebuild for the 12_3 "照门瞄准" concept). Courses
  // one and two (tops 0.36 / 0.70 m, faces stepping back) are 0.5–1.0 m stones laid on
  // the joints; the top course is 0.5–1.0 m stones, flat-topped at 1.0–1.1 (the old 1.2 m
  // envelope). Second round (integrator review): the wall runs straight across the whole
  // lane mouth (x 60–77.6), the post (transferWall 75.7,86.0) stands on the lane axis 2 m
  // behind it and looks due north, so the wall only fills the bottom third of the frame;
  // the 0.65 m firing notch (top 0.7 = the two lower courses only) is front-left of the post,
  // out of the line to the lane gunner. The 2.9 m passage (x 78.1–81.0) between two 1.3 m piers
  // on the east side (the west one starts at x 77.6, just outside the right edge of the 12_3
  // frame) is how the litter column, the crowd and the passing carts enter the yard.
  // Every top stone is an AI cover facing north. This is the squad's line (12 holds
  // the road back into the village): a crouched player at the post loses the lane
  // gunner behind these stones, a standing one engages him over them (TransferTest).
  const Hash = (n) => { const s = Math.sin(n * 12.9898 + 7.7) * 43758.5453; return s - Math.floor(s); };
  const courseTops = [.36, .70];
  // Random joints between x0 and x1 (steps of stepMin…stepMax, the last one absorbs the remainder).
  function Joints(x0, x1, seed, stepMin, stepMax) {
    const edges = [x0];
    for (let x = x0, k = 0; x < x1 - 1e-6; k++) {
      let next = Math.min(x + stepMin + Hash(seed + k) * (stepMax - stepMin), x1);
      if (x1 - next < stepMin * .7) next = x1;
      edges.push(+next.toFixed(2)); x = next;
    }
    return edges;
  }
  // z0: wall centre line; cTops: tops of the two lower courses; dMul: thickness scale (yard walls are thinner).
  function CourseWall(prefix, x0, x1, { notch = null, seed = 0, capTops = [], topRange = [.92, 1.18],
    z0 = 84.05, cTops = courseTops, dMul = 1, face = { faceX: 0, faceZ: -1 } } = {}) {
    // Courses one and two run under the notch too.
    for (const [c, d, s] of [[0, .92 * dMul, 0], [1, .82 * dMul, 300]]) {
      const top = cTops[c];
      const edges = Joints(x0, x1, seed + s, .55, 1.05);
      edges.forEach((b, i) => {
        if (!i) return;
        const a = edges[i - 1], x = (a + b) / 2, z = z0 + (Hash(seed + s + 40 + i) - .5) * .08;
        const bottomH = c ? cTops[0] - .02 : 0, h = top - bottomH;
        const bottom = groundAt(x, z) + bottomH;
        if (c) At(`${prefix}B${i - 1}`, x, z, b - a, h, d, bottom, "structure", { ry: (Hash(seed + s + 80 + i) - .5) * .06 });
        else Block(`${prefix}A${i - 1}`, x, z, b - a, h, d, "structure", { ry: (Hash(seed + s + 80 + i) - .5) * .06 });
      });
    }
    const runs = notch ? [[x0, notch[0]], [notch[1], x1]] : [[x0, x1]];
    let n = 0;
    runs.forEach(([ra, rb], r) => {
      const edges = Joints(ra, rb, seed + 500 + r * 50, .55, 1.0);
      edges.forEach((b, i) => {
        if (!i) return;
        const a = edges[i - 1], x = (a + b) / 2, z = z0 + (Hash(seed + 120 + n) - .5) * .1;
        const top = topRange[0] + Hash(seed + 160 + n) * (topRange[1] - topRange[0]);
        At(`${prefix}${n}`, x, z, b - a, top - cTops[1] + .03, .7 * dMul, groundAt(x, z) + cTops[1] - .03, "cover",
          { ry: (Hash(seed + 200 + n) - .5) * .07, cover: face });
        n++;
      });
    });
    // Capstones: solid, tops 1.08–1.2 above the ground, sitting on the top course.
    capTops.forEach(([x, w, h, base, ry], i) =>
      At(`${prefix}Cap${i}`, x, z0 - .03, w, h, .55 * dMul, groundAt(x, z0) + base, "cover", { ry }));
  }
  CourseWall("TransferVillageWallWest", 60.0, 77.6,
    { notch: [74.4, 75.05], seed: 11, topRange: [1.0, 1.06], dMul: .8 });
  CourseWall("TransferVillageWallEast", 81.8, 94.5,
    { seed: 71, topRange: [.96, 1.06], dMul: .8 });
  // Rubble at the foot of the wall, a crate stack, a basket and a water jar on
  // the player's side (12_1 foreground), kept off the z=88 arrival lane.
  for (const [i, x, z, w, h, d, ry] of [
    [0, 62.5, 82.95, .55, .32, .45, .4], [1, 69.8, 83.05, .7, .28, .5, -.3], [2, 72.35, 82.85, .45, .35, .4, .9],
    [3, 88.2, 82.95, .6, .3, .45, .2], [4, 60.6, 85.0, .5, .25, .45, -.6],
    [5, 66.5, 82.95, .6, .26, .5, .7], [6, 64.3, 83.1, .5, .3, .45, -.4], [7, 90.5, 83.0, .55, .28, .45, 1.1],
  ]) Detail(`TransferWallRubble${i}`, x, z, w, h, d, "earthDark", { ry });
  Detail("TransferWallCrateA", 61.3, 85.75, .8, .6, .6, "timber", { ry: .1 });
  Detail("TransferWallCrateB", 61.35, 85.75, .7, .5, .55, "timber", { ry: -.2, y: groundAt(61.3, 85.75) + .82 });
  Detail("TransferWallBasket", 63.3, 85.3, .6, .5, .6, "canvas");
  Detail("TransferWallJar", 69.4, 85.15, .6, .75, .6, "earthDark");
  // Outside the wall (z 75–84, region B meets C at z 75): road-side stones and
  // the first telegraph pole of the line that runs past the yard.
  for (const [i, x, z, w, h, d] of [[0, 74.3, 76.8, .5, .35, .4], [1, 73.6, 80.6, .6, .3, .45],
    [2, 79.3, 77.6, .45, .4, .4], [3, 80.0, 81.9, .55, .3, .5]])
    Detail(`TransferRoadStoneNorth${i}`, x, z, w, h, d, "earthDark", { ry: i * .7 });
  Pole("TransferPoleNorth", 81.2, 79.2);
  // 路边的碎砖、断瓦（不实心）：房前墙脚与路肩一路撒到路口，眼睛顺着碎料走到胸墙；两棵秃树
  // （概念图两侧各一棵）站在房后的院子里，离路线 3 m 以上。
  for (const [i, x, z, w, h, d, ry] of [[0, 73.5, 60.2, .5, .22, .4, .3], [1, 79.4, 61.0, .45, .2, .4, -.5], [2, 73.4, 63.4, .6, .18, .45, .8],
    [3, 79.5, 66.3, .5, .24, .4, .2], [4, 73.6, 67.6, .55, .2, .4, -.7], [5, 79.3, 69.2, .45, .22, .35, 1.1],
    [6, 73.7, 71.2, .5, .16, .4, .4], [7, 79.6, 73.4, .6, .2, .45, -.3], [8, 73.8, 74.6, .45, .22, .4, .9],
    [9, 78.8, 75.9, .5, .18, .4, .6], [10, 78.9, 80.3, .55, .2, .4, -.8], [11, 74.2, 82.2, .5, .24, .4, .2]])
    Detail(`TransferLaneBrick${i}`, x, z, w, h, d, i % 2 ? "plaster" : "earthDark", { ry });
  Detail("TransferLaneTreeEast", 87.4, 70.2, .3, 6.4 * .72, .3, "timber", { treeModel: { heightM: 6.4, region: "VillageAuthored" } });
  Detail("TransferLaneTreeWest", 60.8, 69.2, .3, 6.9 * .72, .3, "timber", { treeModel: { heightM: 6.9, region: "VillageAuthored" } });

  // ---------------------------------------------------------------------
  // 11/12_2: broken brick walls lining the x76 road (1.6–2.5 m, segments of
  // 4–6 m). Gaps are the scatter/retreat openings in MID_TUNING.transferEvac;
  // each segment is two courses of different height plus a fallen-brick step.
  const RoadWalls = MID_TUNING.transferEvac.walls;
  const courseHeights = [2.3, 1.75, 2.5, 1.9, 2.15, 1.6, 2.4, 2.0];
  // 2026-09-28 引导轮（docs/Data_FirstLevelGuidance20260928.md §5 C）：东墙北头那一截原先 2.5 m，
  // 正好挡在「过了低墙路口往左拐进装载区」的视线上（G11_2）。塌成齐腰的墙头：从路口看得见
  // 墙后的担架、车与人流，拐角读成装载区的入口；13 躲在它背后的遮挡点（EastWallA）仍有 1.9 m 那一截。
  const courseOverride = { East0_0: 1.05 };
  let course = 0;
  for (const [side, x, list] of [["West", RoadWalls.westX, RoadWalls.westLow], ["East", RoadWalls.eastX, RoadWalls.eastLow]])
    list.forEach(([z0, z1], i) => {
      const split = z0 + (z1 - z0) * (.45 + .1 * (i % 2));
      for (const [k, a, b] of [[0, z0, split], [1, split, z1]]) {
        const h = courseOverride[`${side}${i}_${k}`] ?? courseHeights[course % courseHeights.length];
        course++;
        Block(`TransferRoadWall${side}${i}_${k}`, x, (a + b) / 2, RoadWalls.thickM, h, b - a, "earthDark");
      }
      // Fallen-brick step at one end, flush with the wall faces: a proud corner
      // snags scripted movers sliding along the wall (14 rescuers, 2026-09-27 run).
      const stepZ = i % 2 ? z0 + .45 : z1 - .45;
      Block(`TransferRoadWall${side}${i}_Step`, x, stepZ, RoadWalls.thickM, 1.0, .8, "earthDark");
      // Brick rubble at the outer foot (non-solid), never in the gaps.
      Detail(`TransferRoadWall${side}${i}_Rubble`, x + (side === "West" ? -.8 : .8), (z0 + z1) / 2, .6, .3, 1.4, "earthDark", { ry: .2 });
    });
  Pole("TransferPoleNorthWest", 57.6, 82.6);

  // ---------------------------------------------------------------------
  // 2026-09-30 夹道高墙（12–18 白盒 C2 包，概念 13_3「两道长墙夹着一条车路」、13_1、12_2 / 12_4；墙段、门洞与
  // 疏散遮挡点、撤退通道同表：MID_TUNING.transferEvac.walls 的 westTall / eastTall / westDoor / eastGate）。
  //   · 西侧（路右，13_3 近处那道）：青砖高墙 3.7 m + 瓦压顶 + 壁柱，z 103.6–129.6，只在 z 108.0–112.95 留一个
  //     4.95 m 的门洞（两侧门垛），窗洞在 z 123.4–124.8（窗台 1.1、窗顶 2.3）；墙脚 z 118.4–130.8 是 0.75 m 深的路沟
  //     （地形表 RoadSideDitchWest）。墙身底部沉进路沟 / 路堤坡下（y −0.8），顶高是相对路面（y≈0）的 3.7。
  //   · 东侧（路左）：夯土高墙 3 m，x 81.7、z 117.85–136.4，北头是砖门垛，门垛以北到低墙端（z 104.2）是 13.65 m 的
  //     院门式开口（cartRide 与 bay 车进路、追兵 / 撤退的口子都在里头，无门楣：车路上方开天）；窗洞在 z 129.2–130.6。
  //     顶上是塌了一角的土冠。侧巷机枪 B 的射线要穿过 x 81.7 处 z 107–110.4，所以那一段不能砌墙（见 walls 注释）。
  //   · 墙内皮净距 81.35 − 71.35 = 10.0 m（概念 8–10 m）。
  {
    const wx = RoadWalls.westX, ex = RoadWalls.eastTallX, t = RoadWalls.thickTallM, et = RoadWalls.eastThickTallM;
    const [[wn0, wn1], [ws0, ws1]] = RoadWalls.westTall, [[es0, es1]] = RoadWalls.eastTall;
    const foot = -0.8, top = 3.7, winZ0 = 123.4, winZ1 = 124.8, sillTop = 1.1, headBottom = 2.3;
    const WestBody = (id, z0, z1, y0, y1) => At(id, wx, (z0 + z1) / 2, t, y1 - y0, z1 - z0, y0, "structure");
    WestBody("TransferRoadWestWallN", wn0, wn1, foot, top);
    WestBody("TransferRoadWestWallA", ws0, winZ0, foot, top);
    WestBody("TransferRoadWestWallSill", winZ0, winZ1, foot, sillTop);
    WestBody("TransferRoadWestWallLintel", winZ0, winZ1, headBottom, top);
    WestBody("TransferRoadWestWallB", winZ1, ws1, foot, top);
    // 壁柱：路一侧凸出 0.3 m（离墙脚 WestFoot* 的蹲位 x 72.6 还有 ≥ 0.9 m）。
    [104.6, 106.4, 116.0, 119.5, 122.7, 125.9, 128.9].forEach((z, i) =>
      At(`TransferRoadWestWallPilaster${i}`, wx + .4, z, .5, top + .15 - foot, .9, foot, "structure"));
    // 门垛：宽 0.95、比墙身高 0.35，两侧各凸出 0.12，垛帽是瓦压顶。门洞净宽 = 门垛内皮之间。
    for (const [id, zc] of [["N", wn1 - .45], ["S", ws0 + .45]]) {
      At(`TransferRoadWestDoorPier${id}`, wx, zc, .95, top + .35 - foot, .9, foot, "structure");
      Detail(`TransferRoadWestDoorPierCap${id}`, wx, zc, 1.25, .18, 1.2, "coping", { y: top + .35 + .09 });
    }
    for (const [id, z0, z1] of [["N", wn0, wn1], ["S", ws0, ws1]]) {
      const zc = (z0 + z1) / 2, len = z1 - z0;
      Detail(`TransferRoadWestWallCoping${id}`, wx, zc, t + .36, .22, len + .3, "coping", { y: top + .11 });
      Detail(`TransferRoadWestWallCopingRidge${id}`, wx, zc, .22, .12, len + .2, "coping", { y: top + .28 });
    }
    // 窗洞里的窗棂：两根竖的（不碰撞）。
    for (const z of [winZ0 + .45, winZ0 + .95]) At(`TransferRoadWestWallBar${z.toFixed(2)}`, wx, z, .1, headBottom - sillTop, .1, sillTop, "timber", { solid: false });

    // 东墙：夯土，三段（北头 / 院门以南 / 窗洞两边）+ 院门两侧的砖门垛。
    const eastWinZ0 = 129.2, eastWinZ1 = 130.6, eastTop = 3.05;
    for (const [id, z0, z1, y0, y1] of [
      ["TransferRoadEastWallTallA", es0, eastWinZ0, -0.8, eastTop],
      ["TransferRoadEastWallTallSill", eastWinZ0, eastWinZ1, -0.8, 1.0], ["TransferRoadEastWallTallLintel", eastWinZ0, eastWinZ1, 2.2, eastTop],
      ["TransferRoadEastWallTallB", eastWinZ1, es1, -0.8, 2.75]])
      At(id, ex, (z0 + z1) / 2, et, y1 - y0, z1 - z0, y0, "earthDark");
    for (const [id, zc] of [["GateS", es0 + .45]]) {
      At(`TransferRoadEast${id}Pier`, ex, zc, .95, 3.95 - foot, .9, foot, "structure");
      Detail(`TransferRoadEast${id}PierCap`, ex, zc, 1.25, .18, 1.2, "coping", { y: 3.95 + .09 });
    }
    // 土冠：几处高低不一的隆起（夯土墙顶被雨冲、被草根拱出来的样子），不碰撞。
    [[1, 121.6, 2.2, .38], [2, 126.7, 1.9, .3], [3, 129.4, 2.4, .42], [4, 132.6, 1.6, .28], [5, 135.0, 1.9, .36]].forEach(([i, z, l, h]) =>
      Detail(`TransferRoadEastWallCrown${i}`, ex, z, et + .1, h, l, "earthDark", { y: (z < 131 ? eastTop : 2.75) + h / 2 - .02 }));
    // 墙脚碎土（路一侧，不碰撞）。
    [[1, 124.4], [2, 127.4], [3, 130.4], [4, 134.3]].forEach(([i, z]) => Detail(`TransferRoadEastWallFoot${i}`, ex - .95, z, .7, .28, .9, "earthDark", { ry: i * .7 }));
    // 东墙脚（路一侧）码两垛袋子（标准沙袋模型，Data_FirstLevelMissionFortifications.IsMissionSandbagBlock 认 id）：
    // 离 cartRide 车身（z 128–132 处 x ≤ 77.9）≥ 2 m，朝西挡。西墙脚被侧翻残车 ConvoyWreck 和两个蹲位占了。
    Block("TransferRoadFootBags0", 80.85, 128.6, .9, .9, 1.6, "cover", { cover: { faceX: -1, faceZ: 0 } });
    Block("TransferRoadFootBags1", 80.85, 132.6, .9, .9, 1.6, "cover", { cover: { faceX: -1, faceZ: 0 } });
  }

  // ---------------------------------------------------------------------
  // 12 村口残垣（2026-09-27 掩护装载重做，docs/Data_FirstLevelTransferCover20260927.md）。
  // 守线 = 这道低墙 + 两头的残墙；墙外门楼前那片空场是追兵顺来时的主街、东西两条巷子
  // 穿出来之后逐段跃进的开阔地。原先墙外两栋整屋塌成残屋：西北那栋是西巷绕过来的人
  // 钻进去打侧面的地方，东北那栋是东巷（右边）那一拨占的巷口。
  // 日军在 12 只认手工的 cover 块（碰撞盒派生的掩体只给国军，Data_Tuning_AiCover），
  // 所以空场与残屋里给他们躲的每一件都带 cover；法线是无符号的轴，躲的一侧由威胁方向定。
  const Face = (faceX, faceZ) => ({ cover: { faceX, faceZ } });
  // 西北残屋（原 TransferNorthWestHouse 的 7 x 5.5 m 屋基）：北墙东头塌出一道 1.3 m 的口，西巷
  // 绕过来的人从这里进屋；南墙留一扇窗和东南角的塌口，正对低墙西段 —— 屋里的人从这两处
  // 打守线，玩家也能从东南塌口冲进去清屋。屋顶整个塌了，只剩两根烧黑的梁。
  Block("TransferNorthWestRuinNorth0", 59.9, 76.25, 3.8, 2.9, .5);
  Block("TransferNorthWestRuinNorth1", 62.5, 76.25, 1.4, 2.05, .5);
  Block("TransferNorthWestRuinWest", 58.25, 78.75, .5, 2.75, 5.5);
  Block("TransferNorthWestRuinEast0", 64.75, 76.85, .5, 2.45, 1.7);
  Block("TransferNorthWestRuinEastSill", 64.75, 78.6, .5, .9, 1.8, "plaster", Face(1, 0));
  Block("TransferNorthWestRuinEast1", 64.75, 80.0, .5, 1.95, 1.0);
  Block("TransferNorthWestRuinSouth0", 59.45, 81.25, 2.9, 2.35, .5, "plaster", Face(0, -1));
  Block("TransferNorthWestRuinSouthSill", 61.4, 81.25, 1.0, 1.0, .5, "plaster", Face(0, -1));
  At("TransferNorthWestRuinSouthHead", 61.4, 81.25, 1.0, .3, .5, groundAt(61.4, 81.25) + 2.0, "plaster", { solid: false });
  Block("TransferNorthWestRuinSouth1", 62.6, 81.25, 1.4, 2.1, .5, "plaster", Face(0, -1));
  // 东南塌口：外沿一块矮碎砖（< 台阶高，跨得过去），其余是踩得过去的碎砖。
  Block("TransferNorthWestRuinCornerLip", 64.55, 81.2, .8, .38, .6, "earthDark");
  for (const [i, x, z, w, h, d, ry] of [[0, 63.8, 80.9, .9, .3, .7, .4], [1, 64.2, 81.8, .7, .22, .6, -.5],
    [2, 63.4, 81.6, .5, .18, .45, 1.1], [3, 64.9, 80.4, .6, .26, .5, .7], [4, 60.1, 77.6, 1.4, .45, 1.1, .2],
    [5, 61.3, 78.4, .8, .3, .7, -.6], [6, 63.4, 76.9, .9, .35, .6, .3], [7, 59.0, 80.2, .7, .28, .6, 1.2]])
    Detail(`TransferNorthWestRuinRubble${i}`, x, z, w, h, d, i % 2 ? "plaster" : "earthDark", { ry });
  for (const [i, x, z, ry, rise] of [[0, 61.6, 78.1, .18, 2.55], [1, 60.4, 79.9, -.12, 2.45]])
    At(`TransferNorthWestRuinBeam${i}`, x, z, 6.4, .2, .24, groundAt(x, z) + rise, "timber", { solid: false, ry });
  // 东北残屋（原 TransferNorthEastHouse 的屋基）：东巷口那一拨的落脚处。北墙中间塌出
  // 进屋的口，西墙南段和西南角塌了、南墙留一扇窗 —— 屋里的人隔着低墙东段打守线右翼。
  // 草垛挪在空场偏西（x 86.4–89.2）：东巷机枪 (94.3,67.15) 往车位与桥头路的射线从它东边过。
  Block("TransferNorthEastRuinNorth0", 95.55, 75.85, 3.1, 2.3, .5);
  Block("TransferNorthEastRuinNorth1", 99.85, 75.85, 2.3, 2.7, .5);
  Block("TransferNorthEastRuinEast", 100.75, 78.0, .5, 2.65, 4.8);
  Block("TransferNorthEastRuinWest", 94.25, 76.3, .5, 2.1, 1.4);
  Block("TransferNorthEastRuinWestLip", 94.3, 79.5, .6, .55, 1.0, "earthDark", Face(1, 0));
  Block("TransferNorthEastRuinSouth0", 97.65, 80.15, 1.5, 1.85, .5, "plaster", Face(0, -1));
  Block("TransferNorthEastRuinSouthSill", 98.9, 80.15, 1.0, 1.0, .5, "plaster", Face(0, -1));
  Block("TransferNorthEastRuinSouth1", 100.2, 80.15, 1.6, 1.85, .5, "plaster", Face(0, -1));
  Block("TransferNorthEastRuinCorner", 95.6, 80.1, 1.2, .6, .6, "earthDark", Face(0, -1));
  for (const [i, x, z, w, h, d, ry] of [[0, 94.9, 78.3, .9, .3, .8, .5], [1, 95.1, 80.9, .7, .25, .6, -.4],
    [2, 96.6, 79.3, 1.1, .35, .9, .2], [3, 100.0, 76.7, .9, .4, .8, -.3], [4, 95.6, 76.9, .6, .22, .5, .9]])
    Detail(`TransferNorthEastRuinRubble${i}`, x, z, w, h, d, i % 2 ? "plaster" : "earthDark", { ry });
  At("TransferNorthEastRuinBeam", 98.0, 78.3, .24, .2, 5.4, groundAt(98, 78.3) + 2.3, "timber", { solid: false, ry: .15 });

  // 村路南段（z 75–84，2026-09-30 一夫当关，第二轮）：村南门楼在 z 47.6，顺子站在夹道中线 (76.2,86.2)，
  // 正北看下去是一条 x 72.5–80.1 的笔直村路。路西一排房前墙贴到 x 72.5（RoadEast 对面：Village 包的
  // VillageRoadWestHouse / VillageLaneWestHouse，本包补最南一栋 TransferLaneWestHouse，z 75–80.5：再往南不砌，
  // 西北残屋那条侧翼的视线要从它南边过，不然第一拨甲钻进残屋后谁也看不见他），路东依次是 RowB 房、
  // 3.6 m 的大草垛（z 67.85–71.35，贴着路边）、RoadEast 房（z 72.6–77.6）和最南一栋房（退到 x 82.6，给通行口让路）。
  // 路西两栋房之间 z 74.4–77.6 的 3.2 m 巷口是过路车（southTraffic）横穿夹道的地方。追兵在这一段
  // 逐件躲：每件的「藏身点」在它北侧 0.65 m，MISSION_TACTICS 的中间折点就钉在那里（折点离掩体超过
  // 0.9 m 会被拽回去，敌军 AI §19）。路西：路心偏西一堆塌下来的墙土；路东：大草垛（掩体点在它北侧，
  // 夹在 RowB 南墙与草垛之间 0.7 m 的缝里）。
  House("TransferLaneWestHouse", 70.0, 77.75, 5.0, 5.5, 3.0);
  Detail("TransferLaneWestHouseDoor", 72.56, 77.3, .12, 2.0, 1.1, "timber");
  Detail("TransferLaneWestHouseWindow", 72.56, 79.3, .12, .8, .9, "void");
  Detail("TransferLaneWestHouseWindowB", 72.56, 76.3, .12, .8, .9, "void");
  // 屋檐下挂的玉米串和晾着的布（不实心），把整面山墙外的东墙分出节奏。
  for (const [i, z, w, h, y] of [[0, 75.6, .3, .9, 1.9], [1, 78.3, .6, 1.0, 1.7], [2, 80.0, .3, .8, 1.9]])
    Detail(`TransferLaneWestHouseHang${i}`, 72.62, z, .1, h, w, "canvas", { y: groundAt(72.6, z) + y });
  Block("TransferPlazaRubbleWest", 74.6, 81.2, 1.6, .88, .8, "earthDark", { ry: -.12, ...Face(0, -1) });
  // 西边那一拨（乙）的落脚：西北残屋东墙与路西最南一栋房之间的夹缝里，一截塌了的院墙。从低墙西段（刘文财）
  // 和射口都看得见、打得到（甲钻进残屋，靠东南塌口那道缝露头）；不留它，乙躲在西巷碎砖堆后谁也看不见。
  Block("TransferWestStub", 65.0, 82.95, 1.6, .9, .5, "earthDark", { ry: -.06, ...Face(0, -1) });
  Block("TransferPlazaHaystack", 81.9, 69.6, 3.6, 1.7, 3.6, "canvas",
    { cover: { faceX: 0, faceZ: -1, points: [{ x: 81.0, z: 67.15 }, { x: 82.9, z: 67.15 }] } });
  Detail("TransferPlazaHaystackMid", 81.9, 69.6, 2.9, 1.0, 2.9, "canvas", { y: groundAt(81.9, 69.6) + 2.2 });
  Detail("TransferPlazaHaystackTop", 81.9, 69.6, 1.5, .7, 1.5, "canvas", { y: groundAt(81.9, 69.6) + 3.05 });
  // 第二拨（东巷）的落脚：RoadEast 房东南角与最南一栋房之间的小院里一截塌了的院墙。东巷那一拨沿房东墙
  // 摸过来躲在它后头，从低墙东段 (91.5,85.6) 看得见、打得到 —— 逼玩家沿墙往右挪，而不是钻到草垛后面
  // 去（草垛北侧被 RoadEast 房挡着，东段看不见；2026-09-30 整段实跑里第二拨乙躲在那儿，420 s 没打掉）。
  Block("TransferAlleyStub", 90.7, 80.4, 1.8, .9, .6, "earthDark", { ry: .08, ...Face(0, -1) });
  for (const [i, x, z, w, h, d, ry] of [[0, 89.6, 81.0, .5, .2, .4, .5], [1, 91.8, 81.1, .55, .24, .45, -.6], [2, 91.2, 79.0, .4, .18, .35, .9]])
    Detail(`TransferAlleyStubRubble${i}`, x, z, w, h, d, "earthDark", { ry });
  // 路东最南一栋房（TransferLaneEastHouse，x 82.6–88.6）二轮实跑后拆了：何有田追东巷那拨时会翻过东段低墙，
  // 到墙北这块空地上，回射位接岗的直线（MidTransferWalkRoute，没有寻路）要穿过这栋房，卡在房墙上，
  // 「这边我看着！去搭把手！」永远等不到。空着，路口东侧由 RoadEast 房与草垛围。
  for (const [i, x, z, w, h, d, ry] of [[0, 70.2, 77.3, .5, .25, .4, .3], [1, 73.8, 76.2, .6, .2, .5, -.8],
    [2, 79.1, 79.8, .5, .22, .4, 1.3], [3, 88.6, 82.2, .45, .2, .4, .2], [4, 65.2, 80.8, .6, .24, .45, -.4],
    [5, 78.9, 82.2, .4, .18, .35, .9], [6, 75.6, 82.4, .55, .16, .4, .6], [7, 92.0, 82.6, .5, .22, .45, -.2]])
    Detail(`TransferPlazaStone${i}`, x, z, w, h, d, "earthDark", { ry });

  // 守线两头的残墙与路口砖垛：低墙本身不动（TransferTest 的 ≤ 1.2 m 包络），
  // 西头接着场院西北角那段墙、东头接成一个塌了半截的墙角，路口两边各一根砖垛。
  // 第二轮：胸墙横跨整个夹道路口，通行口 x 78.1–81.0（净宽 2.9 m）夹在两根 1.3 m 的砖垛之间，
  // village 路线的担架走廊（0.625 m 半宽）、southTraffic 过路车都从这里进场院。
  Block("TransferWallWestRuin0", 56.3, 84.05, 1.8, 2.45, .5);
  Block("TransferWallWestRuinSill", 57.75, 84.05, 1.1, 1.1, .5);
  Block("TransferWallWestRuin1", 59.15, 84.05, 1.7, 1.85, .5);
  Block("TransferWallPierWest", 77.85, 84.1, .5, 1.3, .9);
  Block("TransferWallPierEast", 81.4, 84.1, .8, 1.3, .9);
  Block("TransferWallEastRuin0", 95.3, 84.0, 1.6, 2.2, .5);
  Block("TransferWallEastRuin1", 96.85, 84.0, 1.5, 1.45, .5);
  Block("TransferWallEastRuinStub", 97.35, 85.45, .5, 1.7, 2.4);
  for (const [i, x, z, w, h, d, ry] of [[0, 56.9, 84.9, .6, .3, .5, .3], [1, 77.4, 85.0, .5, .25, .45, -.6],
    [2, 82.0, 85.1, .55, .28, .5, .8], [3, 96.2, 84.8, .7, .3, .55, .2], [4, 95.7, 83.2, .6, .25, .5, -.4]])
    Detail(`TransferWallFootRubble${i}`, x, z, w, h, d, "earthDark", { ry });

  // ---------------------------------------------------------------------
  // 11: west perimeter. The yard's west screen and the farm store stay; the
  // store's back wall now stands against the 2.2 m terrace scarp (terrain).
  Block("TransferYardNorthWestReturn", 55, 86, 0.7, 2.6, 4);
  Block("TransferYardWestScreenNorth", 54, 92, 0.7, 2.6, 6);
  Block("TransferYardWestScreenSouth", 54, 104, 0.7, 2.6, 10);
  Block("TransferStoreWest", 43, 96, 0.7, 3.1, 15);
  Block("TransferStoreNorth", 48.5, 88.5, 11, 3.1, 0.7);
  Block("TransferStoreSouth", 48.5, 103.5, 11, 3.1, 0.7);
  Roof("TransferStoreRoof", 46, 96, 6.6, 15.8, 3.3);
  // 沟口北沿的土埂（仍是 AI 掩体、朝北）。原先是蓝色 cover 语义块：从卸人处（G13_1）看过去，
  // 下沟口正后方横着一道蓝墙，眯眼看最显眼的是它、而且像「此路不通」。换成抛土色，读成沟沿的土埂。
  Block("TransferDitchNorthLip", 49, 109, 10, 1.4, 0.8, "earthDark", { cover: { faceX: 0, faceZ: -1 } });
  House("TransferScreenHouse", 49.3, 106.25, 8.6, 4.1, 2.9, { alongX: true });
  // Crates, a basket and a cart wheel along the screen, clear of pocket (59,105).
  Detail("TransferScreenCrate0", 55.7, 91.2, .8, .6, .6);
  Detail("TransferScreenBasket", 55.6, 92.6, .55, .5, .55, "canvas");
  Detail("TransferScreenWheel", 54.55, 101.5, .12, 1.1, 1.1, "timber");
  Detail("TransferScreenCrate1", 55.8, 107.3, .8, .6, .6, "timber", { ry: .3 });
  // 11 foreground: the sorting yard is all crowd lanes (lateral at z 88/111,
  // straight down each pocket's x), so only non-solid litter between them:
  // crates, a wheel and a basket (the dropped stretchers are MISSION_PLACEMENT.groundStretchers).
  Detail("TransferYardCrate0", 62.8, 102.4, .8, .6, .6, "timber", { ry: -.35 });
  Detail("TransferYardCrate1", 63.1, 101.6, .6, .45, .5, "timber", { ry: .5, y: groundAt(62.8, 102.4) + .75 });
  Detail("TransferYardWheel", 79.2, 95.4, 1.1, .12, 1.1, "timber", { ry: .6 });
  Detail("TransferYardAxle", 78.9, 99.8, .2, .18, 2.2, "timber", { ry: -.4 });
  Detail("TransferYardBasket", 79.4, 104.3, .55, .5, .55, "canvas");
  Detail("TransferYardSack", 90.6, 92.1, .8, .45, .55, "canvas", { ry: .3 });
  Detail("TransferTriageCrate", 63.1, 113.5, .8, .6, .6, "timber", { ry: -.2 });
  Detail("TransferTriageBasket", 62.7, 117.6, .55, .5, .55, "canvas");

  // 11/13_2/14: a real brick house on the ditch's east lip carries the canvas
  // lean-to (concept: brick house with an awning, right of the road). Its east
  // wall is the yard's west wall at x 55.1 — no stage-14 retreat line from
  // (60,z) to the ditch mouth reaches it. Back wall 5 m from the ditch lip.
  House("TransferDitchHouse", 50.65, 126.8, 8.9, 10.8, 3.3);
  Detail("TransferDitchHouseDoor", 50.65, 121.33, 1.1, 2.0, .12, "timber");
  for (const z of [124.4, 129.2])
    At(`TransferDitchHouseWindow${z}`, 46.14, z, .12, .8, 1.0, groundAt(46.2, z) + 1.2, "timber", { solid: false });
  // A narrow house right on the ditch's east lip (14_2 left): back wall 3.7 m
  // from the lip at z 128 and 5.7 m at z 132, just outside the lip berm.
  House("TransferDitchLipHouse", 43.5, 130.5, 4, 6, 3.0, { alongX: true });
  At("TransferDitchLipHouseWindow", 41.46, 130.5, .12, .7, .9, groundAt(41.6, 130.5) + 1.25, "timber", { solid: false });
  House("TransferBankHouse", 50.6, 136, 6, 4.8, 2.9, { alongX: true });
  Detail("TransferBankHouseDoor", 50.6, 133.54, 1.0, 1.9, .12, "timber");
  // Lean-to: posts only on the outer edge (x 64); the old inner posts at x 56
  // stood in the retreat fan. Canvas steps down in three strips (no tilt in
  // the block format) from the house eaves to the posts.
  // Posts at x 62.2 stay clear of the retreat lanes (Middle z 120.8, South
  // (64.6,125)->(54,114)) and of the WestWall D/E/Dip cover paths.
  const leanTop = groundAt(50.65, 126.8) + 3.3;
  [[56.35, 0.3], [58.8, 0.5], [61.25, 0.7]].forEach(([x, drop], i) =>
    At(`TransferShelterCanvas${i}`, x, 128.3, 2.5, .12, 4.6, leanTop - drop, "canvas"));
  // z 126.6 also keeps the post 1.8 m off the unload->ditch carry (TransferTest).
  for (const z of [126.6, 130.0]) {
    const g = groundAt(62.2, z) - .1;
    At(`TransferShelterPost62_${z}`, 62.2, z, 0.3, leanTop - .7 - g, 0.3, g, "timber");
  }
  Detail("TransferShelterCrate0", 56.2, 126.6, .8, .6, .6);
  Detail("TransferShelterCrate1", 56.1, 130.2, .7, .55, .6, "timber", { ry: .25 });
  // 12_4（备选 D「车尾回看」）：车位那一排东边一段带窗洞的无顶残砖墙（南北向，x 100.4、z 122.8–128.2）。
  // 牛车起步（(88,113) → 西）时从车尾回看，它在装载区尽头。离车位 (94,126) 车盒 ≥ 3.4 m、离追兵线
  // MISSION_PURSUIT_ROUTE 起点 (100,120.5) 2.3 m、离草房 (98.2,132) 4 m。
  Block("TransferBayRuinA", 100.4, 124.1, .5, 3.0, 2.6, "structure");
  Block("TransferBayRuinSill", 100.4, 126.0, .5, 1.0, 1.2, "structure");
  At("TransferBayRuinHead", 100.4, 126.0, .5, .45, 1.2, groundAt(100.4, 126.0) + 2.3, "structure");
  Block("TransferBayRuinB", 100.4, 127.5, .5, 2.2, 1.8, "structure");
  for (const [i, x, z, w, h, d, ry] of [[0, 99.5, 124.9, .8, .3, .6, .3], [1, 101.3, 127.2, .7, .25, .5, -.6],
    [2, 99.6, 127.9, .6, .22, .5, .9], [3, 101.0, 123.3, .5, .2, .4, .2]])
    Detail(`TransferBayRuinRubble${i}`, x, z, w, h, d, i % 2 ? "plaster" : "earthDark", { ry });
  // 14_1 / 14_2 / 14_4（2026-09-30 C2 包）：概念里沟沿外紧挨着残破砖房山墙、带窗。东沿这一带原来是空场，
  // 站在沟底 / 沟口往左看只有天。沿沟东沿外 2.4 m（离抛土 ≥ 1.3 m，PlanTrenchDressing 的护壁 keepOut 之外）
  // 补一段无顶的砖房山墙 z 119.6–127（x 42.9，3.3 / 2.6 m 两截、中间一扇 1.4 m 窗洞），墙脚碎砖；
  // 沟口南侧 TransferDitchHouse 朝沟的北墙补两扇窗洞与窗框。
  {
    const rx = 42.9;
    Block("TransferDitchLipRuinA", rx, 121.1, .5, 3.3, 3.0, "structure");
    Block("TransferDitchLipRuinSill", rx, 123.3, .5, 1.0, 1.4, "structure");
    At("TransferDitchLipRuinHead", rx, 123.3, .5, .5, 1.4, groundAt(rx, 123.3) + 2.3, "structure");
    Block("TransferDitchLipRuinB", rx, 125.5, .5, 2.6, 3.0, "structure");
    Block("TransferDitchLipRuinC", rx, 127.35, .5, 1.5, 0.7, "structure");
    for (const [i, x, z, w, h, d, ry] of [[0, 43.7, 120.4, .9, .3, .7, .4], [1, 42.2, 123.9, .7, .25, .6, -.5],
      [2, 43.6, 126.3, 1.0, .35, .8, .2], [3, 42.4, 119.4, .6, .22, .5, 1.0], [4, 43.5, 122.4, .5, .2, .45, .8]])
      Detail(`TransferDitchLipRuinRubble${i}`, x, z, w, h, d, i % 2 ? "plaster" : "earthDark", { ry });
    At("TransferDitchLipRuinBeam", rx - .5, 122.6, .2, .18, 4.4, groundAt(rx, 122.6) + 2.75, "timber", { solid: false, ry: .12 });
    for (const [i, x] of [[0, 47.8], [1, 53.3]])
      At(`TransferDitchHouseNorthWindow${i}`, x, 121.36, 1.0, 1.0, .12, groundAt(x, 121.4) + 1.3, "void", { solid: false });
    for (const [i, x] of [[0, 47.8], [1, 53.3]])
      At(`TransferDitchHouseNorthSill${i}`, x, 121.28, 1.3, .12, .3, groundAt(x, 121.4) + 1.2, "timber", { solid: false });
  }
  // 14_2：沿沟底往西南看，左前（东沿）该有一截高些的山墙压在沟上。TransferDitchLipHouse（3 m）南边补一段东西向的
  // 无顶残山墙（z 134.6，x 40.6–45.4，4.2 / 3.2 m 两截，中间一扇窗洞），离沟沿抛土 ≥ 3.5 m。
  Block("TransferDitchLipGableA", 41.6, 134.6, 2.0, 4.2, .5, "structure");
  Block("TransferDitchLipGableSill", 43.25, 134.6, 1.3, 1.0, .5, "structure");
  At("TransferDitchLipGableHead", 43.25, 134.6, 1.3, .5, .5, groundAt(43.25, 134.6) + 2.4, "structure");
  Block("TransferDitchLipGableB", 44.7, 134.6, 1.6, 3.2, .5, "structure");
  // 14: telegraph poles over the ditch and loose stones on its east lip.
  Pole("TransferPoleDitchHouse", 45.3, 120.9);
  Pole("TransferPoleDitchWest", 28.8, 126.8);
  Pole("TransferPoleTerrace", 30.8, 113.6);
  for (const [i, x, z, w, h, d] of [[0, 43.6, 123.2, .5, .3, .45], [1, 42.4, 129.8, .6, .35, .5],
    [2, 41.6, 134.8, .45, .28, .4], [3, 44.4, 131.6, .4, .3, .35]])
    Detail(`TransferDitchLipStone${i}`, x, z, w, h, d, "earthDark", { ry: i * .9 });

  // ---------------------------------------------------------------------
  // 13→14 引导（2026-09-28，docs/Data_FirstLevelGuidance20260928.md §5 C）：空袭后停车处的人
  // 被迫往西北 28 m 抬进下沟口 ditchMouth (54,114)。原先从卸人处看过去沟口只是一条橘色抛土边，
  // 沟在地面以下看不见。两样东西让它读成「唯一的路」：
  //   · 入口：南边一根齐胸石栏柱（像河口石栏断开的一个口子），北边由沟沿土埂收住，两者之间就是下沟的坡。
  //   · 路：担架队踩出来的泥路 —— 场院整片在 MISSION_TERRAIN.pads 的铺路层里（track 已经是 1），
  //     地形表的 paths 在这里画不出任何东西，所以用贴地的深色泥块（不碰撞）沿 South 撤退通道
  //     （transferEvac.lanes 第三条：路西缺口 → (64.6,125) → 下沟口）铺一条，洼地最湿那段垫几块跳板，
  //     路边掉着担架杆与绷带。全部 solid:false：担架走廊、撤退通道、散开点的扫测都不看它们。
  // 曾在沟口东北角立过一根挂红十字旗的高杆做地标，2026-09-30 撤掉：查不到「前线救护点用高杆挂旗做标志」
  // 的史料，旗面颜色（深底）也与日内瓦公约的白底红十字对不上。
  // 石栏柱离每条撤退通道、westDirect 斜线、TransferTest 的卸人→沟口走廊都 ≥ 1.3 m。
  // 北侧不立柱：坡道北沿 x 51–54.2、z 108–112.4 是 15A 赶车人丢下那辆车的位置（END_TUNING.droverCart，
  // 运行时摆的道具），东边紧贴着刘文财 14 从低墙西头直奔沟口的直线（MidTest，0.35 m 胶囊）和 North 通道
  // 最后一段 —— 北边由沟沿土埂收住，南边一根石栏柱 + 半截倒下的栏板。
  Block("TransferDitchMouthPostS", 53.1, 117.9, .55, 1.25, .55, "plaster");
  At("TransferDitchMouthPostCapS", 53.1, 117.9, .72, .14, .72, groundAt(53.1, 117.9) + 1.25, "plaster", { solid: false });
  Detail("TransferDitchMouthSlabS", 51.7, 118.35, 1.9, .3, .3, "plaster", { ry: .3 });
  {
    // 泥路：沿折线每 ~1.05 m 一块踩烂的泥，长 0.75（坡上 0.4）、宽 0.9–1.25，左右错开一点、偶尔断一块；
    // 块底取五个采样点的最低处，块顶取中心与四角均值里高的那个 +3 cm —— 平地上只露 5 cm，
    // 坡上高的一头略埋、低的一头露不到 10 cm（第一版取最高处，坡上一块块像台阶）。
    const trail = [{ x: 73.4, z: 134.2 }, { x: 72.8, z: 133.4 }, { x: 64.6, z: 125 }, { x: 55.2, z: 115.2 }];
    const Hash = (n) => { const s = Math.sin(n * 12.9898 + 4.1) * 43758.5453; return s - Math.floor(s); };
    let n = 0;
    for (let leg = 1; leg < trail.length; leg++) {
      const a = trail[leg - 1], b = trail[leg], length = Math.hypot(b.x - a.x, b.z - a.z);
      const dx = (b.x - a.x) / length, dz = (b.z - a.z) / length;
      for (let s = leg === 1 ? 0 : .5; s < length; s += 1.05, n++) {
        if (n > 2 && Hash(n + 170) > .86) continue;
        const j = (Hash(n) - .5) * .45, cx = a.x + dx * s - dz * j, cz = a.z + dz * s + dx * j;
        const slope = Math.abs(groundAt(cx + dx * .5, cz + dz * .5) - groundAt(cx - dx * .5, cz - dz * .5));
        const L = slope > .08 ? .4 : .75, W = .9 + Hash(n + 50) * .35, ry = Math.atan2(-dz, dx) + (Hash(n + 90) - .5) * .3;
        const c = Math.cos(ry), sn = Math.sin(ry), hs = [];
        for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]])
          hs.push(groundAt(cx + c * u * L / 2 + sn * v * W / 2, cz - sn * u * L / 2 + c * v * W / 2));
        const mid = groundAt(cx, cz), lo = Math.min(mid, ...hs) - .02;
        const hi = Math.max(mid, hs.reduce((sum, h) => sum + h, 0) / 4) + .03;
        At(`TransferDitchTrail${n}`, cx, cz, L, hi - lo, W, lo, "earthDark", { solid: false, ry });
      }
    }
    // 洼地底（平的、最湿的那一段）垫了几块门板 / 跳板，横着铺，担架队从上面过。
    for (const [i, t] of [[0, .62], [1, .72], [2, .82], [3, .92]]) {
      const a = trail[1], b = trail[2], x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      At(`TransferDitchTrailBoard${i}`, x, z, .3, .06, 1.5, groundAt(x, z) + .01, "timber",
        { solid: false, ry: Math.atan2(-(b.z - a.z), b.x - a.x) + (i % 2 ? .08 : -.06) });
    }
    Detail("TransferDitchTrailPole", 61.4, 123.2, 2.3, .06, .06, "timber", { ry: .55 });
    Detail("TransferDitchTrailBandage0", 67.9, 127.4, .5, .05, .35, "canvas", { ry: .4 });
    Detail("TransferDitchTrailBandage1", 57.6, 117.9, .45, .05, .3, "canvas", { ry: -.7 });
  }

  // ---------------------------------------------------------------------
  // 11/12: east perimeter. The corner and east cover are the established
  // squad firing posts (Mid defencePosts); only dressing is added around them.
  Cover("TransferCorner", 95, 96, 8, 1.1, 0.7);
  Cover("TransferEastCover", 98, 104, 0.75, 1.1, 11);
  Detail("TransferCornerWheel", 93.4, 96.75, 1.1, 1.1, .12, "timber");
  Detail("TransferEastCoverCrate", 96.9, 101.6, .8, .6, .6, "timber", { ry: .15 });
  Pole("TransferPoleEast", 97.4, 112.2);
  // Thatched shed (11_1 left): south of the side alley's sight fan, north of
  // the bolting team's run (94,134)->(119,169), west of the alley store.
  House("TransferThatchShed", 98.2, 132, 3.8, 4.8, 2.6, { wall: "earthDark", roof: "canvas" });
  Detail("TransferThatchShedDoor", 96.26, 132.4, .12, 1.8, 1.0, "timber");
  Detail("TransferShedBasket", 95.6, 133.9, .55, .5, .55, "canvas");
  Detail("TransferShedJar", 95.7, 129.9, .55, .7, .55, "earthDark");
  // 界（2026-09-28 引导轮）：场院东边 x 104–137 原先是一整片平地，一路缓升到关卡边界，从场院、
  // 停车处看都像「还能往那边走」。沿 x 121.5 砌一道连续的夯土院墙（z 76.5–137.5，河口之前收住），
  // 墙外靠两间棚。追兵 air 组出生在 x 106–115（墙内），往西压过来的折线与 MISSION_PURSUIT_ROUTE
  // 都在墙西边，不受影响；墙本身不带 cover（不是给谁躲的，是这片地的边）。
  {
    const wallX = 121.5;
    const runs = [[76.5, 82.8, 2.55], [82.6, 89.4, 2.3], [89.2, 95.1, 2.7], [94.9, 101.6, 2.4], [101.4, 107.3, 2.6],
      [107.1, 113.8, 2.25], [113.6, 119.9, 2.65], [119.7, 126.2, 2.35], [126.0, 131.6, 2.5], [131.4, 137.5, 2.2]];
    runs.forEach(([z0, z1, h], i) =>
      Block(`TransferEastFieldWall${i}`, wallX + (i % 3 - 1) * .06, (z0 + z1) / 2, .6, h, z1 - z0, "earthDark"));
    for (const [i, z] of [[0, 88.6], [1, 108.6], [2, 128.4]])
      Block(`TransferEastFieldWallButt${i}`, wallX - .55, z, .6, 1.2, .9, "earthDark");
    // 墙外（东）靠墙两间棚，只露出屋顶：墙线不至于一整条平顶。
    House("TransferEastFieldShedA", wallX + 1.9, 97.5, 3.2, 6.2, 2.6, { wall: "earthDark" });
    House("TransferEastFieldShedB", wallX + 1.9, 118.8, 3.2, 5.4, 2.5, { wall: "earthDark", roof: "canvas" });
  }
  // The old alley store (x 101.5–115.5, z 126–133) gave way to the east levee
  // ridge (terrain, x 100–113, z 130.5–138.8): from the 11_1 entrance the
  // ridge is the high ground on the left the concept shows, and its crest must
  // clear the side alley's 2.6 m south wall in that view.

  // ---------------------------------------------------------------------
  // 12_2/13: the bridgehead. The road is an embankment at deck height; both
  // sides fall towards the river (terrain). Road-edge stones, shrubs on the
  // east slope (13_1 left), a broken cart and wheel, all non-solid.
  for (const [i, x, z, w, h, d] of [[0, 81.3, 121.6, .45, .3, .4], [1, 81.6, 124.9, .55, .35, .45],
    [2, 81.2, 128.3, .4, .28, .4], [3, 81.7, 131.5, .6, .32, .5], [4, 82.0, 134.3, .5, .3, .4]])
    Detail(`TransferRoadStoneEast${i}`, x, z, w, h, d, "earthDark", { ry: i * .6 });
  for (const [i, x, z, w, h, d] of [[0, 73.9, 122.4, .5, .3, .45], [1, 74.2, 125.8, .45, .35, .4],
    [2, 73.6, 131.8, .55, .28, .5]])
    Detail(`TransferRoadStoneWest${i}`, x, z, w, h, d, "earthDark", { ry: i * .8 });
  for (const [i, x, z, w, h, d] of [[0, 84.4, 131.2, 1.3, 1.2, 1.0], [1, 86.6, 134.6, 1.6, 1.4, 1.1],
    [2, 83.9, 136.9, 1.1, 1.0, .8], [3, 90.2, 137.2, 1.5, 1.3, 1.0]])
    Detail(`TransferEastShrub${i}`, x, z, w, h, d, "foliage");
  Detail("TransferBrokenCartBed", 88.8, 135.6, 1.3, .35, 2.6, "timber", { ry: .5 });
  Detail("TransferBrokenCartWheel", 87.2, 133.9, .12, 1.1, 1.1, "timber", { ry: .5 });
  // Brick piers beside the bridge deck's north end (deck z 137, x 72–80):
  // outside the cart lane and 2.4 m south of the unload point (72.6,135).
  // 2026-09-28 引导轮：原先 2.3 m 的灰泥墩从门楼（65 m 外）看不出来，桥面是贴着地的一块板，
  // 11 那句「正前方向南是桥头」没有东西撑着。改成 3.1 m 砖墩 + 收分的墩帽，顶到 4.1 m 左右，
  // 从门楼、场院北口看都高过河南岸的房顶、衬在天上；深色，和浅色天空拉开。
  // （试过 3.6 m：停车处 13_2 机位左边一根柱子占掉半屏。）
  // 过路车 / 牛车只走 x 72–80 的桥面，墩子在两边；桥炸断后墩子留着，路口就是两根墩夹着的断头。
  for (const x of [71.3, 80.7]) {
    Block(`TransferBridgeheadPier${x}`, x, 137.4, .9, 3.1, .9, "earthDark");
    const top = groundAt(x, 137.4) + 3.1;
    At(`TransferBridgeheadPierNeck${x}`, x, 137.4, .7, .55, .7, top, "earthDark", { solid: false });
    At(`TransferBridgeheadPierCap${x}`, x, 137.4, 1.05, .18, 1.05, top + .55, "plaster", { solid: false });
    At(`TransferBridgeheadPierFinial${x}`, x, 137.4, .36, .3, .36, top + .73, "earthDark", { solid: false });
  }
  // East–west ruin on the east bank lip (13_1 left, 12_2 ahead): a broken
  // brick wall with a window; parallel to every retreat line, south of all
  // unload targets and west of the bolting team's run.
  const ruinZ = 137.6, ruinG = groundAt(87, ruinZ);
  Block("TransferBankRuinWest", 85.4, ruinZ, 1.8, 2.6, .5);
  Block("TransferBankRuinSill", 86.9, ruinZ, 1.2, .9, .5);
  At("TransferBankRuinHead", 86.9, ruinZ, 1.2, .55, .5, ruinG + 2.0);
  Block("TransferBankRuinEast", 88.5, ruinZ, 2.0, 1.9, .5);
  Block("TransferBankRuinStep", 89.7, ruinZ, .6, 1.1, .5);
  // 13_2: stone balustrade along the north lip of the river, west of the road,
  // over the 4.2 m channel (the lip z 138.8 itself is Topology's, untouched).
  const railZ = 138.45, railPosts = [55.6, 58.1, 60.6, 63.1, 65.6, 68.1, 70.6];
  for (const x of railPosts) {
    Block(`TransferBankRailPost${x}`, x, railZ, .4, 1.15, .4, "plaster");
    Detail(`TransferBankRailPostCap${x}`, x, railZ, .58, .13, .58, "coping", { y: groundAt(x, railZ) + 1.15 + .065 });
  }
  for (let i = 1; i < railPosts.length; i++) {
    const x = (railPosts[i - 1] + railPosts[i]) / 2;
    Block(`TransferBankRailSlab${i}`, x, railZ, 2.1, .9, .28, "plaster");
  }
  for (const [i, x, z, w, h, d] of [[0, 62.2, 138.1, .5, .3, .45], [1, 66.9, 138.3, .6, .35, .5],
    [2, 69.4, 137.9, .45, .3, .4]])
    Detail(`TransferBankRailStone${i}`, x, z, w, h, d, "earthDark", { ry: i });

  return {
    replaceBlockIds: ["TransferCanopy", "TransferPost64_109", "TransferPost64_129",
      "TransferPost88_109", "TransferPost88_129", "TransferVillageWallWest",
      "TransferCorner", "TransferEastCover", "TransferWestCover", "TransferYardWestWall"],
    blocks,
  };
}
