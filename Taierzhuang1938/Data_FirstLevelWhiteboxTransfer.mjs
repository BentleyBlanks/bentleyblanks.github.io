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
  // 12_1: the village-facing low wall is dry-laid rubble, not a slab. Stones
  // 1.6–2.3 m long with tops 0.98–1.2 (the old 1.2 m envelope), a 0.6 m
  // firing notch between the post (66.5,86) and the 12_1 eye (68,85.4); a few
  // loose capstones break the line of the top without leaving the envelope. Every stone is an AI
  // cover facing north. Since the 2026-09-27 cover rebuild this is the squad's line (12 holds
  // the road back into the village): a crouched player at the notch loses the south-gate gunner
  // (79.2,65.85) behind these stones, a standing one engages him over them (TransferTest).
  const westEdges = [60.0, 61.9, 64.0, 66.2, 67.9, 68.5, 70.3, 71.9, 73.0];
  const westStones = [[1.0, 84.05, .8, .03], [.86, 83.95, .85, -.02], [1.12, 84.1, .8, .04],
    [.98, 84.0, .8, -.04], [.7, 84.15, .7, 0], [1.05, 83.95, .85, -.03], [.9, 84.05, .8, .02], [.98, 84.1, .75, -.05]];
  westStones.forEach(([h, z, d, ry], i) => {
    const a = westEdges[i], b = westEdges[i + 1];
    Cover(`TransferVillageWallWest${i}`, (a + b) / 2, z, b - a, h, d, { ry });
  });
  // Capstones: solid, tops 1.08–1.2 above the ground, sitting on the lower stones.
  for (const [i, x, z, w, h, d, base, ry] of [[0, 62.4, 84.0, .9, .3, .6, .86, .15], [1, 63.4, 83.95, .7, .25, .55, .86, -.3],
    [2, 66.9, 84.0, .6, .2, .55, .98, .2], [3, 71.0, 84.05, .85, .28, .55, .9, .25]])
    At(`TransferVillageWallCap${i}`, x, z, w, h, d, groundAt(x, z) + base, "cover", { ry });
  const eastEdges = [79.5, 84.6, 89.4, 94.5];
  [[1.06, 84.0, .8, 0], [1.12, 84.1, .8, .02], [.98, 83.95, .75, -.03]].forEach(([h, z, d, ry], i) => {
    const a = eastEdges[i], b = eastEdges[i + 1];
    Cover(`TransferVillageWallEast${i}`, (a + b) / 2, z, b - a, h, d, { ry });
  });
  // Rubble at the foot of the wall, a crate stack, a basket and a water jar on
  // the player's side (12_1 foreground), kept off the z=88 arrival lane.
  for (const [i, x, z, w, h, d, ry] of [
    [0, 62.5, 82.95, .55, .32, .45, .4], [1, 69.8, 83.05, .7, .28, .5, -.3], [2, 72.35, 82.85, .45, .35, .4, .9],
    [3, 88.2, 82.95, .6, .3, .45, .2], [4, 60.6, 85.0, .5, .25, .45, -.6],
  ]) Detail(`TransferWallRubble${i}`, x, z, w, h, d, "earthDark", { ry });
  Detail("TransferWallCrateA", 61.3, 85.75, .8, .6, .6, "timber", { ry: .1 });
  Detail("TransferWallCrateB", 61.35, 85.75, .7, .5, .55, "timber", { ry: -.2, y: groundAt(61.3, 85.75) + .82 });
  Detail("TransferWallBasket", 63.3, 85.3, .6, .5, .6, "canvas");
  Detail("TransferWallJar", 70.6, 85.15, .6, .75, .6, "earthDark");
  // Outside the wall (z 75–84, region B meets C at z 75): road-side stones and
  // the first telegraph pole of the line that runs past the yard.
  for (const [i, x, z, w, h, d] of [[0, 74.3, 76.8, .5, .35, .4], [1, 73.6, 80.6, .6, .3, .45],
    [2, 79.3, 77.6, .45, .4, .4], [3, 80.0, 81.9, .55, .3, .5]])
    Detail(`TransferRoadStoneNorth${i}`, x, z, w, h, d, "earthDark", { ry: i * .7 });
  Pole("TransferPoleNorth", 81.0, 77.2);

  // ---------------------------------------------------------------------
  // 11/12_2: broken brick walls lining the x76 road (1.6–2.5 m, segments of
  // 4–6 m). Gaps are the scatter/retreat openings in MID_TUNING.transferEvac;
  // each segment is two courses of different height plus a fallen-brick step.
  const RoadWalls = MID_TUNING.transferEvac.walls;
  const courseHeights = [2.3, 1.75, 2.5, 1.9, 2.15, 1.6, 2.4, 2.0];
  let course = 0;
  for (const [side, x, list] of [["West", RoadWalls.westX, RoadWalls.west], ["East", RoadWalls.eastX, RoadWalls.east]])
    list.forEach(([z0, z1], i) => {
      const split = z0 + (z1 - z0) * (.45 + .1 * (i % 2));
      for (const [k, a, b] of [[0, z0, split], [1, split, z1]])
        Block(`TransferRoadWall${side}${i}_${k}`, x, (a + b) / 2, RoadWalls.thickM, courseHeights[course++ % courseHeights.length], b - a, "earthDark");
      // Fallen-brick step at one end, flush with the wall faces: a proud corner
      // snags scripted movers sliding along the wall (14 rescuers, 2026-09-27 run).
      const stepZ = i % 2 ? z0 + .45 : z1 - .45;
      Block(`TransferRoadWall${side}${i}_Step`, x, stepZ, RoadWalls.thickM, 1.0, .8, "earthDark");
      // Brick rubble at the outer foot (non-solid), never in the gaps.
      Detail(`TransferRoadWall${side}${i}_Rubble`, x + (side === "West" ? -.8 : .8), (z0 + z1) / 2, .6, .3, 1.4, "earthDark", { ry: .2 });
    });
  Pole("TransferPoleNorthWest", 57.6, 82.6);

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

  // 门楼前空场（z 75–83）里追兵跃进时躲的东西。每件的「藏身点」在它北侧 0.65 m，
  // MISSION_TACTICS 的中间折点就钉在那里（折点离掩体超过 0.9 m 会被拽回去，敌军 AI §19）。
  // 路西：一段断墙被过路大车压出一道豁口（southTraffic 车辙从两截中间斜穿过去，
  // MissionTest 按 0.35 m 扫着）、车辙东边路口旁一堆塌下来的墙土；路东：一辆翻倒的大车、一个草垛。
  Block("TransferPlazaWallWest0", 66.4, 75.6, 1.7, 1.05, .7, "structure", Face(0, -1));
  Block("TransferPlazaWallWest1", 70.9, 75.7, 1.5, .92, .65, "earthDark", { ry: .06, ...Face(0, -1) });
  Block("TransferPlazaRubbleWest", 74.6, 79.3, 1.6, .88, .8, "earthDark", { ry: -.12, ...Face(0, -1) });
  Block("TransferPlazaCartBed", 84.9, 76.5, 2.6, 1.1, .45, "timber", Face(0, -1));
  // 车轮与车轴翻在南侧（车底朝守线），北侧车板后头是躲人的地方。
  Detail("TransferPlazaCartWheel", 86.0, 77.05, 1.1, 1.1, .12, "timber");
  Detail("TransferPlazaCartAxle", 84.9, 77.05, 2.4, .16, .16, "timber", { y: groundAt(84.9, 77.05) + .55 });
  Detail("TransferPlazaCartShaft0", 82.6, 77.4, .12, .12, 2.6, "timber", { ry: .5 });
  Detail("TransferPlazaCartShaft1", 83.3, 78.1, .12, .12, 2.4, "timber", { ry: .35 });
  Block("TransferPlazaHaystack", 87.8, 79.6, 2.8, 1.3, 2.8, "canvas",
    { cover: { faceX: 0, faceZ: -1, points: [{ x: 87.2, z: 78.2 }, { x: 88.5, z: 78.2 }] } });
  Detail("TransferPlazaHaystackMid", 87.8, 79.6, 2.2, .75, 2.2, "canvas", { y: groundAt(87.8, 79.6) + 1.65 });
  Detail("TransferPlazaHaystackTop", 87.8, 79.6, 1.2, .5, 1.2, "canvas", { y: groundAt(87.8, 79.6) + 2.25 });
  for (const [i, x, z, w, h, d, ry] of [[0, 70.2, 77.3, .5, .25, .4, .3], [1, 73.8, 76.2, .6, .2, .5, -.8],
    [2, 81.2, 79.8, .5, .22, .4, 1.3], [3, 87.4, 81.6, .45, .2, .4, .2], [4, 66.9, 80.6, .6, .24, .45, -.4],
    [5, 78.9, 82.2, .4, .18, .35, .9], [6, 75.0, 79.3, .55, .16, .4, .6], [7, 92.0, 82.6, .5, .22, .45, -.2]])
    Detail(`TransferPlazaStone${i}`, x, z, w, h, d, "earthDark", { ry });

  // 守线两头的残墙与路口砖垛：低墙本身不动（TransferTest 的 ≤ 1.2 m 包络），
  // 西头接着场院西北角那段墙、东头接成一个塌了半截的墙角，路口两边各一根砖垛。
  // 路口净宽 4.85 m（village 路线 0.625 m 担架走廊、southTraffic 车道都在里面）。
  Block("TransferWallWestRuin0", 56.3, 84.05, 1.8, 2.45, .5);
  Block("TransferWallWestRuinSill", 57.75, 84.05, 1.1, 1.1, .5);
  Block("TransferWallWestRuin1", 59.15, 84.05, 1.7, 1.85, .5);
  Block("TransferWallPierWest", 73.45, 84.1, .8, 1.75, .9);
  Block("TransferWallPierEast", 79.1, 84.1, .8, 2.05, .9);
  Block("TransferWallEastRuin0", 95.3, 84.0, 1.6, 2.2, .5);
  Block("TransferWallEastRuin1", 96.85, 84.0, 1.5, 1.45, .5);
  Block("TransferWallEastRuinStub", 97.35, 85.45, .5, 1.7, 2.4);
  for (const [i, x, z, w, h, d, ry] of [[0, 56.9, 84.9, .6, .3, .5, .3], [1, 73.5, 85.0, .5, .25, .45, -.6],
    [2, 79.3, 85.1, .55, .28, .5, .8], [3, 96.2, 84.8, .7, .3, .55, .2], [4, 95.7, 83.2, .6, .25, .5, -.4]])
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
  Cover("TransferDitchNorthLip", 49, 109, 10, 1.4, 0.8);
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
  // 14: telegraph poles over the ditch and loose stones on its east lip.
  Pole("TransferPoleDitchHouse", 45.3, 120.9);
  Pole("TransferPoleDitchWest", 28.8, 126.8);
  Pole("TransferPoleTerrace", 30.8, 113.6);
  for (const [i, x, z, w, h, d] of [[0, 43.6, 123.2, .5, .3, .45], [1, 42.4, 129.8, .6, .35, .5],
    [2, 41.6, 134.8, .45, .28, .4], [3, 44.4, 131.6, .4, .3, .35]])
    Detail(`TransferDitchLipStone${i}`, x, z, w, h, d, "earthDark", { ry: i * .9 });

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
  for (const [i, x, z, w, h, d] of [[0, 71.6, 122.4, .5, .3, .45], [1, 71.9, 125.8, .45, .35, .4],
    [2, 71.5, 131.8, .55, .28, .5]])
    Detail(`TransferRoadStoneWest${i}`, x, z, w, h, d, "earthDark", { ry: i * .8 });
  for (const [i, x, z, w, h, d] of [[0, 84.4, 131.2, 1.3, 1.2, 1.0], [1, 86.6, 134.6, 1.6, 1.4, 1.1],
    [2, 83.9, 136.9, 1.1, 1.0, .8], [3, 90.2, 137.2, 1.5, 1.3, 1.0]])
    Detail(`TransferEastShrub${i}`, x, z, w, h, d, "foliage");
  Detail("TransferBrokenCartBed", 88.8, 135.6, 1.3, .35, 2.6, "timber", { ry: .5 });
  Detail("TransferBrokenCartWheel", 87.2, 133.9, .12, 1.1, 1.1, "timber", { ry: .5 });
  // Brick piers beside the bridge deck's north end (deck z 137, x 72–80):
  // outside the cart lane and 2.4 m south of the unload point (72.6,135).
  for (const x of [71.3, 80.7]) Block(`TransferBridgeheadPier${x}`, x, 137.4, .7, 2.3, .7, "plaster");
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
  const railZ = 138.45, railPosts = [60.6, 63.1, 65.6, 68.1, 70.6];
  for (const x of railPosts) Block(`TransferBankRailPost${x}`, x, railZ, .4, 1.15, .4, "plaster");
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
