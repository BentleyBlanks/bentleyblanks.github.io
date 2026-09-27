// First-level whitebox, 08–10 plus the 07 village mouth (06/07 masses live in
// Data_FirstLevelWhiteboxFront). Notion「第一关｜游戏概念参考图」07_2 … 10_2:
//   07_2 sunken village road, rubble wall and haystack, a gable with door steps;
//   08_1/08_2 narrow street of 1.5-storey houses, fallen wall + rubble + cart, a
//        two-storey window house, the kitchen door (≈2 m) with threshold;
//   09_1/09_2 the kitchen cut into three rooms by partitions (hearth, woodpile,
//        exposed beams), a house wall across the lane outside the north door;
//   09_3 the side room's gunner framed by a window in the connected house;
//   10_1/10_2 the yard ringed by buildings (west wing, south shed, gatehouse
//        roof and step) and a 3.8 m coped-wall lane back to the street.
// The whole Village box (x20…120, z−30…75) is filled as a village: rows of
// houses, yard walls with coping, lanes, woodpiles, jars, rubble, poles, trees.
// Gap list, frozen constraints and regional ownership:
// docs/Data_FirstLevelWhitebox0518Gap.md. Things that must not move here: the
// 0.9 m street man-gap (x 76.225…77.125 stays empty), the east window and side
// room firing lanes, the 1.25 m litter corridor of village/courtyardBypass, the
// courtyard crowd sweep (z 16.72…18 and every pocket column, x>69 work strip),
// the pursuers' way in from the east (z 35…45 through x=72/82), the 08 litter
// hold (x 60.5…70.5, z −26.5…−17) and every CivilianAftermath house's
// <id>West/<id>East(Front) walls. Low rubble (top ≤ 0.28 m) may lie anywhere;
// taller detail keeps ≥ 0.9 m off routes. Roof tiers above the soffit are
// non-solid on new houses (the soffit closes the top; fewer colliders).
// The caller supplies the shared terrain sampler; this module has no imports.
export function BuildVillageWhitebox(groundAt) {
  const blocks = [];
  const replaceBlockIds = ["KitchenRoof", "ConnectedHouseRoof", "ConnectedHouseBoards",
    "ConnectedHouseRidge", "MachineGunHouseRoof", "CourtyardEast",
    // 09_3: the connected house's east back wall gets a window onto the side room.
    "ConnectedHouseEastBack",
    "AmbushCornerCrates",
    // 07_2: the north shoulder becomes a rubble wall on a berm.
    "SouthWalkShoulder9",
    // 10: the west wing now fills the yard's west strip; its stores/bench move out.
    "CourtyardBench", ...["00", "01", "10", "11"].flatMap(k =>
      [`CourtStores${k}`, `CourtStoresStrap${k}-1`, `CourtStoresStrap${k}1`])];
  // House/compound walls that Layout builds as blue `cover` whitebox walls are
  // re-emitted here with identical geometry (same Wall / GroundedWall formula,
  // same cover face) but plaster, so the village reads as brick-and-plaster
  // houses. [id, x, z, w, h, d, grounded] with Layout's original arguments.
  const RESKIN = [
    ...["Kitchen", "ConnectedHouse", "MachineGunHouse"].flatMap((room) => {
      const x = room === "MachineGunHouse" ? 43 : 58, z = room === "Kitchen" ? -9 : 8;
      return [[`${room}SouthLeft`, x - 3.95, z + 7.5, 4.1, 2.9, .6], [`${room}SouthRight`, x + 3.95, z + 7.5, 4.1, 2.9, .6],
        [`${room}NorthLeft`, x - 3.95, z - 7.5, 4.1, 2.9, .6], [`${room}NorthRight`, x + 3.95, z - 7.5, 4.1, 2.9, .6],
        [`${room}West`, x - 6, z, .6, 2.9, 15]];
    }),
    ["KitchenEast", 64, -9, .6, 2.9, 15], ["ConnectedHouseEastFront", 64, 2.6, .6, 2.9, 4.2],
    ["ConnectedHouseWindowSill", 64, 6.35, .6, .82, 3.3], ["ConnectedHouseEastDoorSill", 64, 10.25, .6, .82, 2.1],
    ["MachineGunHouseEastFront", 49, 2.6, .6, 2.9, 4.2], ["MachineGunHouseEastBack", 49, 13.4, .6, 2.9, 4.2],
    ["MachineGunHouseWindowSill", 49, 8, .6, .82, 6.6],
    ["MeleeAlcoveScreen", 61, 2.2, 4, 1.9, .35], ["AmbushWestScreen", 54.6, 3.5, .35, 1.9, 4.2],
    ["CourtyardWest", 33, 25, .7, 2.5, 19], ["CourtyardExitLeft", 42, 34, 17, 2.5, .6],
    ["CourtyardExitRight", 64, 34, 17, 2.5, .6], ["StreetEastWindowSill", 82, 5, .7, .85, 6],
    ...[["StreetWestWallNorth", 72, -8, .7, 2.6, 28], ["StreetWestWallSouthA", 72, 36, .7, 2.6, 4],
      ["StreetWestWallSouthB", 72, 49, .7, 2.6, 6], ["StreetEastWallNorth", 82, -10, .7, 2.6, 24],
      ["StreetEastWallSouthA", 82, 24.5, .7, 2.6, 21], ["StreetEastWallSouthB", 82, 48.5, .7, 2.6, 7],
      ["EastAlleyNorthWall", 87.5, 2, 11, 2.6, .7], ["EastAlleySouthWall", 89, 20, 14, 2.6, .7],
      ["EastAlleyEastStub", 94, -4, .7, 2.6, 12], ["RejoinAlleySouth", 59, 44, 18, 2.6, .7],
      ["RejoinAlleyWest", 50, 39, .7, 2.6, 10], ["StreetBlockFallenWall", 74.3, 20, 3.85, 1.35, 2],
      ["LitterHoldCover", 66, -16.5, 10, 1.5, .8]].map((row) => [...row, true]),
    ["EastLaneRuin", 95, 6, .7, 2.1, 23],
  ];
  replaceBlockIds.push(...RESKIN.map(([id]) => id));
  function Block(id, x, z, w, h, d, semantic = "plaster", extra = {}) {
    const block = { id, x, z, w, h, d, y: groundAt(x, z) + h / 2,
      semantic, tag: "whiteboxWall", ...extra };
    blocks.push(block);
    return block;
  }
  const Detail = (id, x, z, w, h, d, semantic = "timber", extra = {}) =>
    Block(id, x, z, w, h, d, semantic, { solid: false, ...extra });
  function Bank(id, x, z, w, h, d, semantic = "earthDark", extra = {}) {
    const top = groundAt(x, z) + h;
    const base = Math.min(...[-1, 0, 1].flatMap(a => [-1, 0, 1].map(b =>
      groundAt(x + a * w / 2, z + b * d / 2)))) - .12;
    return Block(id, x, z, w, top - base, d, semantic, { y: (top + base) / 2, ...extra });
  }
  // Deterministic scatter (Park–Miller); the layout must be identical every build.
  let seed = 90827;
  const Rand = () => (seed = seed * 16807 % 2147483647, (seed - 1) / 2147483646);

  // Stepped roof volumes convey ridge/eaves using the same axis-aligned boxes
  // as the field collider. The ridge is closed: first-person rooms must have
  // a real ceiling rather than retaining the old overhead-view cutaway.
  // alongX turns the ridge east–west; pitch scales the tier rise (1 = the old
  // shallow roof); ns makes the tiers above the soffit non-solid.
  function Roof(id, x, z, w, d, height = 2.95, alongX = false, pitch = 1, ns = false) {
    const floor = groundAt(x, z), span = alongX ? d : w, len = alongX ? w : d;
    const R = (sid, off, across, h, along, y, solid = true) => (alongX
      ? Block(sid, x, z + off, along, h, across, "roof", { y, ...(solid ? {} : { solid: false }) })
      : Block(sid, x + off, z, across, h, along, "roof", { y, ...(solid ? {} : { solid: false }) }));
    // Continuous internal soffit closes the riser gaps too: overlapping roof
    // projections alone still let an oblique first-person view see the sky.
    R(`${id}Soffit`, 0, span * 1.08, .32, len + .9, floor + height + .16);
    for (const side of [-1, 1]) {
      R(`${id}Eave${side}`, side * span * .39, span * .3, .25 * pitch, len + .9,
        floor + height + .125 * pitch, !ns);
      R(`${id}Slope${side}`, side * span * .2, span * .22, .3 * pitch, len + .5,
        floor + height + .44 * pitch, !ns);
      R(`${id}Ridge${side}`, side * .8, .8, .35 * pitch, len + .2, floor + height + .77 * pitch, !ns);
    }
    R(`${id}RidgeCap`, 0, 1.6, .35 * pitch, len + .2, floor + height + .77 * pitch, !ns);
  }

  // Facade helpers. A face is the outside plane of a body: N/S planes are
  // z = const (axis "z"), W/E planes are x = const (axis "x"); dir points out.
  function Face(x, z, w, d, face) {
    if (face === "N") return { axis: "z", plane: z - d / 2, dir: -1, c: x };
    if (face === "S") return { axis: "z", plane: z + d / 2, dir: 1, c: x };
    if (face === "W") return { axis: "x", plane: x - w / 2, dir: -1, c: z };
    return { axis: "x", plane: x + w / 2, dir: 1, c: z };
  }
  // A thin box standing on the facade: `at` along the face, pushed out by `out`,
  // `depthOut` thick away from the wall.
  function OnFace(id, f, at, len, y0, h, semantic, t = .06, out = 0, solid = false, depthOut = t) {
    const n = f.plane + f.dir * (out + depthOut / 2), along = f.c + at;
    const gx = f.axis === "x" ? f.plane : along, gz = f.axis === "x" ? along : f.plane;
    const [x, z, w, d] = f.axis === "x" ? [n, along, depthOut, len] : [along, n, len, depthOut];
    return Block(id, x, z, w, h, d, semantic, { y: groundAt(gx, gz) + y0 + h / 2,
      ...(solid ? {} : { solid: false }) });
  }
  function Door(id, f, at, width = 1.1, height = 2.1, steps = 1) {
    OnFace(`${id}Void`, f, at, width, 0, height, "roof", .05);
    for (const s of [-1, 1])
      OnFace(`${id}Jamb${s}`, f, at + s * (width / 2 + .07), .14, 0, height + .12, "timber", .1);
    OnFace(`${id}Head`, f, at, width + .44, height, .18, "timber", .12);
    // Stone steps: the lowest one reaches furthest out.
    for (let k = 1; k <= steps; k++)
      OnFace(`${id}Step${k}`, f, at, width + .5, 0, .15 * k, "structure", 0, 0, true,
        .34 * (steps - k + 1));
  }
  function Window(id, f, at, width = .95, sill = 1.05, height = .85, bars = true) {
    OnFace(`${id}Void`, f, at, width, sill, height, "roof", .05);
    OnFace(`${id}Sill`, f, at, width + .2, sill - .08, .08, "timber", .12);
    OnFace(`${id}Head`, f, at, width + .2, sill + height, .1, "timber", .1);
    if (bars) for (const b of [-1, 0, 1])
      OnFace(`${id}Bar${b}`, f, at + b * width * .28, .05, sill, height, "timber", .08);
  }
  // A house: grounded body, darker plinth band, pitched roof with eaves
  // overhanging the long sides, optional doors/windows per face.
  function House(id, x, z, w, d, h, o = {}) {
    const { alongX = false, overhang = .45, pitch = 1.5, doors = [], windows = [],
      semantic = "plaster" } = o;
    Bank(`${id}Body`, x, z, w, h, d, semantic);
    Detail(`${id}Plinth`, x, z, w + .08, .5, d + .08, "earthDark", { y: groundAt(x, z) + .2 });
    Roof(id, x, z, alongX ? w + .2 : w + 2 * overhang, alongX ? d + 2 * overhang : d + .2,
      h, alongX, pitch, true);
    for (const [i, [face, at, width, height, steps]] of doors.entries())
      Door(`${id}Door${i}`, Face(x, z, w, d, face), at, width, height, steps);
    for (const [i, [face, at, width, sill, height, bars]] of windows.entries())
      Window(`${id}Win${i}`, Face(x, z, w, d, face), at, width, sill, height, bars);
  }
  function HouseMass(id, x, z, w, d, h) {
    House(id, x, z, w, d, h);
  }
  function Coping(id, x, z, w, d, top) {
    Detail(`${id}Coping`, x, z, w + .22, .16, d + .3, "roof", { y: top + .08 });
    Detail(`${id}CopingRidge`, x, z, w > d ? w + .1 : .14, .1, w > d ? .14 : d + .1, "roof",
      { y: top + .21 });
  }
  // Yard wall with a tile coping (压顶) that overhangs both faces.
  function YardWall(id, x, z, w, d, h = 2.4, cover = null) {
    const wall = Bank(id, x, z, w, h, d, "plaster", cover ? { cover } : {});
    Coping(id, x, z, w, d, wall.y + wall.h / 2);
    return wall;
  }
  // Low loose rubble (top ≤ maxH): brick bats and stones along a wall foot.
  function RubbleStrip(id, x0, z0, x1, z1, count, maxH = .28, spread = .35) {
    for (let i = 0; i < count; i++) {
      const t = (i + .2 + Rand() * .6) / count;
      const x = x0 + (x1 - x0) * t + (Rand() - .5) * spread;
      const z = z0 + (z1 - z0) * t + (Rand() - .5) * spread;
      const w = .22 + Rand() * .42, d = .18 + Rand() * .36, h = .1 + Rand() * (maxH - .1);
      Detail(`${id}${i}`, x, z, w, h, d, Rand() < .55 ? "earthDark" : "plaster",
        { ry: Rand() * Math.PI, y: groundAt(x, z) + h / 2 - .03 });
    }
  }
  // Stone/brick pieces of a broken low wall (each a real, low cover box).
  function RubbleWall(id, x0, z0, x1, z1, pieces, hMin = .8, hMax = 1.15, depth = .7) {
    const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0);
    const faceX = Math.round(Math.cos(ry)), faceZ = -Math.round(Math.sin(ry));
    for (let i = 0; i < pieces; i++) {
      const t = (i + .5) / pieces, l = len / pieces * (.72 + Rand() * .22);
      const h = hMin + Rand() * (hMax - hMin);
      const x = x0 + (x1 - x0) * t + (Rand() - .5) * .18, z = z0 + (z1 - z0) * t + (Rand() - .5) * .18;
      Bank(`${id}${i}`, x, z, depth * (.85 + Rand() * .3), h, l, i % 2 ? "earthDark" : "structure",
        { ry: ry + (Rand() - .5) * .1, cover: { faceX, faceZ } });
    }
  }
  function Jar(id, x, z, s = 1) {
    Block(id, x, z, .72 * s, .78 * s, .72 * s, "earthDark");
    Detail(`${id}Rim`, x, z, .8 * s, .08, .8 * s, "earthDark", { y: groundAt(x, z) + .8 * s });
  }
  const Basket = (id, x, z, s = 1) => Block(id, x, z, .62 * s, .5 * s, .62 * s, "timber");
  function Woodpile(id, x, z, w, d, h = 1.1) {
    Block(id, x, z, w, h, d, "timber");
    // Loose top logs lying on the stack.
    const along = w > d;
    for (let i = 0; i < 3; i++) {
      const off = (i - 1) * (along ? d : w) * .3, l = (along ? w : d) * (.55 + Rand() * .3);
      Detail(`${id}Log${i}`, along ? x + (Rand() - .5) * .4 : x + off, along ? z + off : z + (Rand() - .5) * .4,
        along ? l : .16, .16, along ? .16 : l, "timber", { y: groundAt(x, z) + h + .08, ry: (Rand() - .5) * .12 });
    }
  }
  function Haystack(id, x, z, r = 1.2, h = 1.9) {
    Block(id, x, z, r * 2, h * .55, r * 2, "canvas");
    Detail(`${id}Mid`, x, z, r * 1.6, h * .3, r * 1.6, "canvas", { y: groundAt(x, z) + h * .7 });
    Detail(`${id}Top`, x, z, r * .9, h * .2, r * .9, "canvas", { y: groundAt(x, z) + h * .95 });
  }
  // Bare tree: trunk plus radiating branches, all non-solid (it only reads).
  function DeadTree(id, x, z, h = 6.5) {
    const g = groundAt(x, z);
    Detail(`${id}Trunk`, x, z, .3, h * .72, .3, "timber");
    // Two forked leaders carry the crown; branches spiral up with twigs that
    // climb from their tips, so the silhouette reads as a tree, not a pole.
    for (const s of [-1, 1])
      Detail(`${id}Leader${s}`, x + s * .22, z - s * .12, .16, h * .38, .16, "timber",
        { y: g + h * .62 + h * .19 });
    for (let i = 0; i < 8; i++) {
      const a = i * 2.4 + Rand() * .8, l = .9 + Rand() * 1.3, y = g + h * (.42 + i * .07);
      Detail(`${id}Branch${i}`, x + Math.sin(a) * l * .45, z + Math.cos(a) * l * .45, .07, .07, l,
        "timber", { ry: a, y });
      const tl = .5 + Rand() * .9;
      Detail(`${id}Twig${i}`, x + Math.sin(a) * l * .8, z + Math.cos(a) * l * .8, .04, tl, .04,
        "timber", { y: y + tl / 2 });
      Detail(`${id}Sprig${i}`, x + Math.sin(a) * l * .55, z + Math.cos(a) * l * .55, .04, tl * .7, .04,
        "timber", { y: y + tl * .35 });
    }
  }
  // Telegraph pole with a cross-arm; wires are drawn between named poles.
  const poles = [];
  function Pole(id, x, z, h = 6.8) {
    Block(id, x, z, .22, h, .22, "timber");
    Detail(`${id}Arm`, x, z, 1.4, .1, .1, "timber", { y: groundAt(x, z) + h - .35 });
    poles.push({ id, x, z, top: groundAt(x, z) + h - .3 });
  }
  function Wires(from, to) {
    const a = poles.find(p => p.id === from), b = poles.find(p => p.id === to);
    const len = Math.hypot(b.x - a.x, b.z - a.z), ry = Math.atan2(b.x - a.x, b.z - a.z);
    for (const s of [-.5, .5])
      Detail(`${from}Wire${to}${s}`, (a.x + b.x) / 2 + Math.cos(ry) * s, (a.z + b.z) / 2 - Math.sin(ry) * s,
        .03, .03, len, "metal", { ry, y: (a.top + b.top) / 2 - .35 });
  }

  for (const [id, x, z, w, h, d, grounded] of RESKIN) {
    const wall = Block(id, x, z, w, h, d, "plaster", { cover: { faceX: 0, faceZ: -1 } });
    if (!grounded) continue;
    const top = wall.y + wall.h / 2;
    const base = Math.min(...[-1, 0, 1].flatMap(a => [-1, 0, 1].map(b =>
      groundAt(x + a * w / 2, z + b * d / 2)))) - .1;
    wall.y = (top + base) / 2;
    wall.h = top - base;
  }

  // 06/07 (collection west return, southbound banks) moved to
  // Data_FirstLevelWhiteboxFront.mjs on 2026-09-27 (05–18 regional split).

  // ---------------------------------------------------------------------------
  // 07_2 village mouth: the sunken road (terrain table) runs between a rubble
  // wall on a berm (north) and the gable of the first house with door steps.
  // ---------------------------------------------------------------------------
  House("VillageNorthWestHouse", 39.5, -8.5, 14, 14, 3.3, {
    doors: [["N", 2, 1.2, 2.15, 3]], windows: [["N", -3.6, .9, 1.15, .8], ["N", 5.2, .8, 1.2, .7],
      ["E", -3, 1, 1.1, .85]] });
  HouseMass("VillageNorthEastHouse", 80, -33, 17, 12, 3.45);
  YardWall("VillageNorthWestYard", 29, -10, .75, 17, 2.3);
  RubbleWall("VillageMouthRubbleWall", 36.6, -25.9, 46.8, -25.2, 5, .75, 1.15);
  RubbleStrip("VillageMouthRubbleFoot", 36.8, -24.9, 46.6, -24.3, 9);
  Haystack("VillageMouthHaystack", 33.6, -26.9, 1.25, 2.1);
  Haystack("VillageMouthHaystackSmall", 31.4, -27.9, .8, 1.3);
  RubbleStrip("VillageMouthGableFoot", 33.5, -16.2, 45.8, -16.1, 8);
  Pole("VillagePole0", 46.6, -23.1);
  Pole("VillagePole1", 62.2, -27.25);
  Pole("VillagePole2", 73.2, -24.7);
  Wires("VillagePole0", "VillagePole1");
  Wires("VillagePole1", "VillagePole2");
  DeadTree("VillageMouthTree0", 49.6, -17.9, 7.2);
  DeadTree("VillageMouthTree1", 37.8, -28.4, 6.2);
  DeadTree("VillageMouthTree2", 68.6, -29.3, 7.6);

  // 08_2 / 09_1: a house across the lane from the kitchen's north door. It
  // stops west of the two walker slots (x 58.1/59.5, z −21.2) and 1.5 m clear
  // of the village route; the litter hold behind it keeps its full depth.
  House("KitchenLaneHouse", 52.2, -24.85, 10, 6.7, 3.3, { alongX: true,
    doors: [["S", -2, 1.1, 2.05, 1]], windows: [["S", 2.3, 1.0, 1.1, .85], ["S", -4.1, .7, 1.2, .6]] });
  YardWall("LitterHoldBackWall", 64.25, -28, 14.1, .6, 2.3);
  Woodpile("LitterHoldWoodpile", 66.3, -27.25, 3.2, .8, 1.15);
  Jar("LitterHoldJar", 58.2, -27.3);
  // Kitchen north wall: barred windows either side of the door; brick bats along its foot.
  {
    const f = { axis: "z", plane: -16.8, dir: -1, c: 0 };
    Window("KitchenNorthWin0", f, 53.5, .9, 1.15, .8);
    Window("KitchenNorthWin1", f, 62.6, .9, 1.7, .7);
    RubbleStrip("KitchenNorthFoot", 52.3, -17.15, 55.8, -17.25, 6);
  }

  // ---------------------------------------------------------------------------
  // 08 street. Street-front houses push their fronts into the old 9.3 m lane:
  // west front x=74.0 (z −15.4…3.6), east front x=80.2 (z −24…−1.3), eaves
  // over the street. At the obstacle the frontage stays the measured walls.
  // ---------------------------------------------------------------------------
  House("StreetWestHouse", 69.175, -5.9, 9.65, 19, 3.5, { overhang: .7,
    doors: [["E", -4.2, 1.2, 2.2, 2]], windows: [["E", -8.8, .9, 1.2, .8], ["E", 1.2, 1, 1.15, .85],
      ["E", 6.3, .9, 1.2, .8]] });
  House("StreetEastNorthHouse", 84.25, -12.65, 8.1, 22.7, 4.2, { overhang: .7, pitch: 1.6,
    doors: [["W", 4.6, 1.3, 2.3, 1]], windows: [["W", -7.5, 1, 1.15, .85], ["W", -1.8, 1, 1.15, .85],
      ["W", 8.9, .9, 1.2, .8], ["W", -4.6, .8, 2.9, .6, false], ["W", 5.9, .8, 2.9, .6, false]] });
  // The east window belongs to a two-storey house: ground-floor ceiling at
  // 2.95 m, upper storey to 5.9 m, the sentry still at the ground window.
  Bank("EastWindowHouseNorth", 87.4, -.8, 10.1, 5.9, .65, "plaster");
  Bank("EastWindowHouseEast", 92.1, 3.1, .7, 5.9, 8.4, "plaster");
  Block("EastWindowHouseUpperWest", 82, 3.35, .7, 3.35, 8.9, "plaster",
    { y: groundAt(82, 3.35) + 2.55 + 3.35 / 2 });
  Block("EastWindowHouseUpperSouth", 87.2, 7.6, 10.4, 3, .5, "plaster",
    { y: groundAt(87.2, 7.6) + 2.9 + 1.5 });
  Block("EastWindowHouseFloor", 87.2, 3.35, 9.5, .2, 8.1, "timber",
    { y: groundAt(87.2, 3.35) + 3.05 });
  Roof("EastWindowHouse", 87.2, 3.3, 11.2, 9.2, 5.9, false, 1.5, true);
  {
    const f = { axis: "x", plane: 81.65, dir: -1, c: 0 };
    Window("EastWindowUpper0", f, .6, 1, 3.7, 1.05);
    Window("EastWindowUpper1", f, 5.6, 1, 3.7, 1.05);
    // Mid-height frame on the real ground-floor window (StreetEastWindow*, z 2…8).
    OnFace("EastWindowFrameN", f, 2.05, .14, .85, 1.45, "timber", .1);
    OnFace("EastWindowFrameS", f, 7.95, .14, .85, 1.45, "timber", .1);
  }
  // Behind the south east frontage: a narrow house whose front is StreetEastWallSouthA.
  // South of the cart the east front steps out to x=80.2 (street 5.25 m to the
  // court wing); StreetEastWallSouthA stays inside it as the measured frontage.
  House("StreetEastMidHouse", 83.2, 28.1, 6, 11, 3.6, { overhang: .6,
    doors: [["W", 4.5, 1.1, 2.1, 1]], windows: [["W", -4.1, .9, 1.2, .8], ["W", 1.7, .9, 1.2, .8]] });
  // North of the cart a corner house closes the street between the alley
  // mouth (z 8…14, the east alley route at z=11) and the cart.
  House("StreetEastCornerHouse", 83.4, 16.95, 6.2, 5.3, 3.5, { overhang: .6,
    doors: [["N", .6, 1.0, 2.05, 1]], windows: [["W", -1.2, .9, 1.2, .8]] });
  // Side room's street entrance reads as a doorway: posts, head beam, threshold.
  for (const z of [7.62, 12.38])
    Block(`SideRoomStreetPost${z}`, 72, z, .36, 2.8, .22, "timber");
  Block("SideRoomStreetHead", 72, 10, .4, .26, 5, "timber", { y: groundAt(72, 10) + 2.72 });
  Block("SideRoomStreetSill", 72.55, 10, .7, .12, 4.5, "structure");
  // A lean-to along the court wall north of the obstacle, stacked with stores.
  for (const z of [13.1, 18.3]) Block(`StreetLeanToPost${z}`, 73.45, z, .18, 2.55, .18, "timber");
  Block("StreetLeanToRoof", 72.95, 15.7, 1.5, .14, 6.2, "roof", { y: groundAt(73, 15.7) + 2.62 });
  Basket("StreetLeanToBasket0", 72.8, 13.9);
  Basket("StreetLeanToBasket1", 72.85, 14.55, .9);
  Detail("StreetLeanToBasket2", 72.8, 14.2, .55, .45, .55, "timber", { y: groundAt(72.8, 14.2) + .72 });
  Woodpile("StreetLeanToFaggots", 72.85, 15.75, .8, 1.5, 1.0);
  Jar("StreetEastJar0", 79.6, 16.9);
  Basket("StreetEastBasket0", 79.75, 15.9);
  Jar("StreetWestHouseJar", 74.45, -12.2, .9);
  Basket("StreetWestHouseBasket", 74.4, -7.9, .9);
  Woodpile("StreetEastNorthFaggots", 79.65, -15.8, .9, 2.4, 1.0);

  // 08 obstacle. Rubble slopes north and south of the fallen wall and the cart
  // (never across x 76.225…77.125), the cart gets wheels and spilled baskets.
  for (const [i, x, z, w, h, d] of [
    [0, 73.3, 18.35, 1.8, .75, 1.3], [1, 75.0, 18.5, 1.5, .5, 1.0], [2, 73.0, 17.2, 1.3, .3, 1.0],
    [3, 74.6, 17.55, 1.0, .22, .8], [4, 75.55, 21.6, 1.0, .55, 1.2], [5, 78.4, 18.1, 1.4, .4, .9],
    [6, 79.3, 21.95, 1.6, .45, .9], [7, 80.95, 22.1, .9, .3, .8],
  ]) Bank(`StreetObstacleRubble${i}`, x, z, w, h, d, i % 2 ? "earthDark" : "plaster");
  RubbleStrip("StreetObstacleBats", 72.6, 16.4, 75.3, 17.0, 6);
  RubbleStrip("StreetObstacleBatsSouth", 78.0, 22.8, 81.2, 23.1, 5);
  for (const x of [78.3, 80.7])
    Detail(`StreetCartWheel${x}`, x, 18.62, 1.25, 1.25, .12, "timber");
  Basket("StreetCartBasket0", 79.7, 23.4);
  Detail("StreetCartBasket1", 79.7, 18.3, .6, .5, .6, "timber", { y: groundAt(80.1, 18.1) + 1.85, ry: .5 });
  // 08 debris stays inside the existing obstruction. Nothing consumes its
  // human-sized opening x=76.225..77.125, nor the north observation corridor.
  for (const [i, x, z, w, h, d] of [
    [0, 73, 19.9, 1.2, .45, 1.5], [1, 74.5, 20.25, 1.1, .7, 1.1],
    [2, 75.5, 19.85, .8, .35, 1.4],
  ]) Block(`StreetFallenWallBreak${i}`, x, z, w, h, d, "plaster",
    { y: groundAt(x, z) + 1.35 + h / 2 });
  for (const z of [19.3, 20.7]) {
    Block(`StreetCartRail${z}`, 79.45, z, 4.4, .24, .18, "timber",
      { y: groundAt(79.45, z) + 1.74 });
    Block(`StreetCartAxle${z}`, 79.45, z, .22, .2, 2.5, "timber",
      { y: groundAt(79.45, z) + 1.25 });
  }
  // Brick bats along every street wall foot (low, never a step).
  RubbleStrip("StreetWestFoot", 74.25, -15, 74.3, 3.2, 10);
  RubbleStrip("StreetEastFoot", 79.95, -23.5, 79.9, -1.8, 11);
  RubbleStrip("StreetWingFoot", 75.25, 22.8, 75.3, 32.6, 6);
  RubbleStrip("StreetEastSouthFoot", 79.95, 24.0, 79.95, 33.2, 6);

  // ---------------------------------------------------------------------------
  // 09 kitchen and connected house. Outer walls/doorways belong to Layout
  // Room(); the 3.8 m doorways are narrowed to ≈2 m with infill + frames
  // (village/courtyardBypass 1.25 m corridor at x=58 intact) and the 12 m
  // hall becomes three rooms: west store (stove, VillageCorner), 4.2 m
  // centre room (hearth with pots, woodpile, beams), east room (table, kang).
  // ---------------------------------------------------------------------------
  Roof("Kitchen", 58, -9, 12, 15, 2.95, false, 1.4);
  Roof("ConnectedHouse", 58, 8, 12, 15, 2.95, false, 1.4);
  Roof("MachineGunHouse", 43, 8, 12, 15, 2.95, false, 1.4);
  // 09: close the two-metre gap between kitchen and connected house with a
  // narrow roofed link.
  Bank("KitchenLinkWest", 52, -.5, .6, 2.9, 2, "plaster");
  Bank("KitchenLinkEast", 64, -.5, .6, 2.9, 2, "plaster");
  Block("KitchenLinkCeiling", 58, -.5, 12, .24, 2.2, "timber",
    { y: groundAt(58, -.5) + 3.02 });
  // Doorway infill + frame + threshold; the north door gets two open leaves.
  for (const [door, z] of [["KitchenNorthDoor", -16.5], ["KitchenSouthDoor", -1.5]]) {
    const g = groundAt(58, z);
    for (const s of [-1, 1]) {
      Block(`${door}Infill${s}`, 58 + s * 1.5, z, .8, 2.445, .6, "plaster", { y: g + 1.2225 });
      Block(`${door}Jamb${s}`, 58 + s * 1.1, z, .16, 2.3, .72, "timber", { y: g + 1.15 });
    }
    Block(`${door}Head`, 58, z, 2.36, .2, .72, "timber", { y: g + 2.3 });
    Block(`${door}Threshold`, 58, z, 2.04, .12, .72, "structure", { y: g + .06 });
  }
  for (const s of [-1, 1])
    Detail(`KitchenNorthDoorLeaf${s}`, 58 + s * .99, -15.62, .06, 2.0, 1.05, "timber",
      { y: groundAt(58, -15.6) + 1.05 });
  // Partitions (height to the soffit) with 2 m doors near the north end.
  const kg = groundAt(58, -9);
  for (const [id, x, z0, z1] of [
    ["KitchenPartitionWestN", 55.6, -16.2, -13.9], ["KitchenPartitionWestS", 55.6, -11.9, -1.8],
    ["KitchenPartitionEastN", 60, -16.2, -14.6], ["KitchenPartitionEastS", 60, -12.6, -1.8],
  ]) Block(id, x, (z0 + z1) / 2, .24, 2.95, z1 - z0, "plaster", { y: kg + 1.475 });
  Block("KitchenPartitionWestHead", 55.6, -12.9, .24, .75, 2, "plaster", { y: kg + 2.575 });
  Block("KitchenPartitionEastHead", 60, -13.6, .24, .75, 2, "plaster", { y: kg + 2.575 });
  // Exposed beams under the soffit.
  for (const z of [-14.2, -10.6, -7, -3.4])
    Detail(`KitchenBeam${z}`, 58, z, 11.4, .2, .24, "timber", { y: kg + 2.78 });
  // Centre room: hearth (0.8 m, two pots and a flue) on the west side, woodpile east.
  Block("KitchenHearth", 56.17, -7.7, .9, .8, 2.2, "earthDark");
  Detail("KitchenHearthPot0", 56.17, -8.3, .64, .26, .64, "metal", { y: kg + .93 });
  Detail("KitchenHearthPot1", 56.17, -7.1, .52, .2, .52, "metal", { y: kg + .9 });
  Block("KitchenHearthFlue", 55.95, -8.9, .4, 2.15, .4, "earthDark", { y: kg + .8 + 1.075 });
  Woodpile("KitchenWoodpile", 59.42, -10, .85, 3.2, 1.15);
  Jar("KitchenWaterJar", 56.25, -15.55, .9);
  Detail("KitchenHangingBasket", 59.4, -15.4, .5, .3, .5, "timber", { y: kg + 1.9 });
  Detail("KitchenHangingCord", 59.4, -15.4, .03, .75, .03, "timber", { y: kg + 2.42 });
  // East room: a kang-bed; the old table and stores already stand here.
  Block("KitchenKang", 62.8, -3.9, 1.6, .6, 3.6, "earthDark");
  Detail("KitchenKangMat", 62.8, -3.9, 1.5, .06, 3.4, "canvas", { y: kg + .63 });
  // 09_3: the connected house's east back wall opens a window onto the side
  // room, so its gunner reads "in the window"; the doorway z 8…9.2 is unchanged.
  {
    const g = groundAt(64, 12);
    Block("ConnectedHouseEastBackSill", 64, 12, .6, .9, 1.4, "plaster",
      { y: g + .45, cover: { faceX: 0, faceZ: -1 } });
    Block("ConnectedHouseEastBackHead", 64, 12, .6, .95, 1.4, "structure", { y: g + 2.425 });
    Block("ConnectedHouseEastBack", 64, 14.1, .6, 2.9, 2.8, "plaster",
      { y: g + 1.45, cover: { faceX: 0, faceZ: -1 } });
    Detail("ConnectedHouseEastBackBars", 64, 12, .08, 1.0, .05, "timber", { y: g + 1.4 });
  }
  // The corner crates stay where Layout put them; only their colour changes.
  Block("AmbushCornerCrates", 61.9, 12.6, 3, 1.7, 1.6, "timber");
  for (const x of [60.9, 62.9]) Detail(`AmbushCornerCratesSeam${x}`, x, 12.6, .05, 1.72, 1.62, "earthDark");
  Block("ConnectedHouseRoundStove", 61.0, 10.7, .9, .75, .9, "earthDark");
  Detail("ConnectedHouseRoundStovePot", 61.0, 10.7, .66, .16, .66, "metal", { y: groundAt(61, 10.7) + .83 });
  Basket("ConnectedHouseBasket", 62.85, 10.4);

  // ---------------------------------------------------------------------------
  // 10 inner yard. The seven litter pockets span x 39…68.5, so the yard can
  // not shrink to 12 m; it is ringed instead: a west wing (x 33.35…37.3), the
  // houses north, the street wing east, a shed and a house behind the south
  // wall. A well, a mill, a handcart and a bench sit between pocket columns.
  // ---------------------------------------------------------------------------
  // Topology_09 explicitly joins the east alley to a side room and then the
  // connected house. The old continuous CourtyardEast wall sealed that link.
  // Keep its southern section/id (also the street obstacle's west edge), and
  // leave a 5 m east entrance opposite the existing connected-house east door.
  Bank("CourtyardEast", 72, 23.25, .7, 2.5, 21.5, "plaster");
  Bank("SideRoomEastNorth", 72, 6.75, .7, 2.9, 1.5, "plaster");
  Bank("SideRoomNorth", 68, 5.5, 8, 2.9, .6, "plaster");
  // The court stages its litter teams along z=18 before spreading out;
  // the leading/rear carriers sweep as far north as z=16.72. This doorway
  // therefore ends at z=16.1, leaving that whole transverse arrival clear.
  Bank("SideRoomSouthWest", 64.8, 15.8, 1.6, 2.9, .6, "plaster");
  Bank("SideRoomSouthEast", 70.8, 15.8, 2.4, 2.9, .6, "plaster");
  Roof("SideRoom", 68, 11.8, 8, 13.2, 2.95, false, 1.4);
  // 10: the street-front wing stands on the street side of the court wall.
  // The yard's entire east strip is a working area, including litter carrier
  // ends beyond x=69; filling it with a house would trap the real column.
  Bank("CourtyardStreetWing", 73.65, 26, 2.6, 3.2, 13.8, "plaster");
  Roof("CourtyardStreetWing", 73.65, 26, 3, 14.1, 3.2, false, 1.4);
  House("CourtyardWestWing", 35.325, 24.925, 3.95, 17.45, 3.1, { overhang: .5,
    doors: [["E", -4.4, 1.1, 2.1, 1], ["E", 4.1, 1.1, 2.1, 1]], windows: [["E", -.2, 1, 1.1, .8], ["E", 7.4, .9, 1.1, .8]] });
  for (const z of [20.2, 23.3, 26.4, 29.5]) Block(`CourtWestWingPost${z}`, 38.1, z, .16, 2.55, .16, "timber");
  Detail("CourtWestWingVeranda", 37.8, 24.85, 1.1, .12, 10.2, "roof", { y: groundAt(37.8, 24.85) + 2.6 });
  Basket("CourtWestWingBasket0", 37.75, 21.9, .8);
  Basket("CourtWestWingBasket1", 37.75, 22.55, .7);
  Jar("CourtWestWingJar", 37.75, 27.9, .8);
  House("CourtSouthWestHouse", 41.75, 37.65, 15.5, 6.7, 3.2, { alongX: true,
    doors: [["S", -3, 1.1, 2.1, 1]], windows: [["S", 3.5, 1, 1.1, .8]] });
  // South shed: its north wall is CourtyardExitRight, its south face lines the lane.
  House("CourtSouthShed", 64.075, 35.8, 15.15, 3, 3.0, { alongX: true, overhang: .3,
    windows: [["S", -3.5, .8, 1.3, .6], ["S", 4.5, .8, 1.3, .6]], doors: [["S", 1.2, 1.0, 2.0, 1]] });
  {
    const f = { axis: "z", plane: 33.7, dir: -1, c: 0 };
    Window("CourtSouthShedYardWin0", f, 60.4, .9, 1.2, .75);
    Window("CourtSouthShedYardWin1", f, 67.2, .9, 1.2, .75);
  }
  // A covered gateway makes the release threshold legible. Its 5 m opening
  // and gate collider are owned by the original layout and are unchanged.
  Block("CourtyardGateHeader", 53, 34, 7.5, .6, 1.5, "timber",
    { y: groundAt(53, 34) + 2.75 });
  Block("CourtyardGateCap", 53, 34, 8.2, .3, 2, "roof",
    { y: groundAt(53, 34) + 3.15 });
  for (const [s, x] of [["W", 49.95], ["E", 56.05]])
    Bank(`CourtyardGatePier${s}`, x, 34, .9, 3.1, 1.2, "plaster");
  Roof("CourtyardGateRoof", 53, 34, 8.8, 2.6, 3.3, true, 1.3, true);
  // Visual only: a solid 0.14 m step here stalled the real Rapier capsule under
  // the gate lintel (TopologyBrowserTest courtyardBypass forward).
  Detail("CourtyardGateStep", 53, 34.72, 4.8, .12, .64, "structure");
  // Yard furniture between the pocket columns (x 39/44.2/47.3/49/58.5/63.4/66.3/68.3).
  Block("CourtWell", 45.7, 24.6, 1.2, .75, 1.2, "structure");
  for (const s of [-1, 1]) Detail(`CourtWellPost${s}`, 45.7 + s * .5, 24.6, .1, 1.8, .1, "timber");
  Detail("CourtWellBeam", 45.7, 24.6, 1.1, .1, .1, "timber", { y: groundAt(45.7, 24.6) + 1.75 });
  Block("CourtMill", 50.8, 27.2, 1.3, .5, 1.3, "structure");
  Detail("CourtMillStone", 50.8, 27.2, .9, .3, .9, "structure", { y: groundAt(50.8, 27.2) + .65 });
  Block("CourtHandcart", 60.9, 24.5, 1.1, .8, 2.2, "timber");
  for (const s of [-1, 1]) Detail(`CourtHandcartWheel${s}`, 60.9 + s * .62, 24.9, .1, .9, .9, "timber");
  Block("CourtBench", 45.75, 29.2, .5, .45, 2.2, "timber");
  // The carriers swing round each pocket corner (radius 1.28 about (x, 18)).
  Jar("CourtJar0", 51.3, 16.3, .85);
  Woodpile("CourtWoodpile", 61.0, 16.25, 2.6, .8, .9);

  // 10_2 lane back to the street: shed face (z 37.3) north, a coped wall
  // (z 41.1) south → 3.8 m for x 55.9…59.9; east of that it widens to the
  // Layout wall z=44 because the pursuers come in there.
  YardWall("BypassSouthWall", 55.125, 41.4, 9.55, .6, 2.6, { faceX: 0, faceZ: -1 });
  Coping("RejoinAlleySouth", 59, 44, 18, .7, groundAt(59, 44) + 2.65);
  Coping("LitterHoldCover", 66, -16.5, 10, .8, groundAt(66, -16.5) + 1.5);
  Coping("RejoinAlleyWest", 50, 39, .7, 10, groundAt(50, 39) + 2.67);
  Coping("CourtyardExitLeft", 42, 34, 17, .6, groundAt(42, 34) + 2.54);
  RubbleStrip("BypassLaneFoot", 56.2, 40.8, 59.5, 40.75, 5);
  RubbleStrip("BypassLaneFootN", 56.4, 37.62, 71.2, 37.65, 10);
  Door("BypassSouthWallGate", { axis: "z", plane: 41.1, dir: -1, c: 0 }, 57.6, 1.0, 1.95, 0);

  // ---------------------------------------------------------------------------
  // The rest of the Village box: rows of houses, yard walls, lanes, stores.
  // ---------------------------------------------------------------------------
  // Behind the rejoin lane (south of z=44), along the southTraffic road.
  House("AlleySouthHouseA", 55.2, 48.15, 9.2, 6.5, 3.2, { alongX: true,
    doors: [["S", 1.5, 1.1, 2.1, 1]], windows: [["S", -2.4, 1, 1.1, .8]] });
  House("AlleySouthHouseB", 66.1, 48.45, 11, 7.1, 3.4, { alongX: true,
    doors: [["S", -2.5, 1.1, 2.1, 1]], windows: [["S", 2, 1, 1.1, .8], ["E", 0, .9, 1.2, .8]] });
  Woodpile("AlleySouthWoodpile", 57, 52.3, 3, .8, 1.1);
  DeadTree("AlleySouthTree", 60.6, 56.4, 7.0);
  // East frontage of the southern street and the road out of the village.
  House("StreetEastSouthRowA", 86.45, 51, 8.1, 10, 3.4, {
    doors: [["W", 2.5, 1.2, 2.2, 1]], windows: [["W", -2.2, 1, 1.15, .85]] });
  House("StreetEastSouthRowB", 86.7, 62.5, 8.6, 8, 3.3, {
    doors: [["W", -1.2, 1.2, 2.2, 1]], windows: [["W", 2.4, 1, 1.15, .85]] });
  House("VillageRoadWestHouse", 68.5, 61.5, 8.6, 8, 3.3, { alongX: true,
    doors: [["E", 1, 1.1, 2.1, 1]], windows: [["S", -1.5, 1, 1.15, .8], ["S", 2.4, .9, 1.2, .7]] });
  House("VillageRoadEastHouse", 87.5, 70.4, 9, 5, 3.1, { alongX: true,
    windows: [["S", -2, 1, 1.15, .8], ["S", 2, 1, 1.15, .8]] });
  // South village gate (门楼) over the x76 road, visible from 12_1's low wall:
  // 4.2 m clear between piers, beam at 2.85 m, tiled roof; wing walls.
  for (const [s, x] of [["W", 74.7], ["E", 79.7]]) Bank(`VillageSouthGatePier${s}`, x, 70.5, .8, 3.0, 1.6, "plaster");
  Block("VillageSouthGateBeam", 77.2, 70.5, 6.2, .4, .5, "timber", { y: groundAt(77.2, 70.5) + 3.05 });
  Roof("VillageSouthGateRoof", 77.2, 70.5, 7.6, 2.6, 3.25, true, 1.3, true);
  YardWall("VillageSouthGateWingW", 72.2, 70.5, 4.2, .5, 2.2);
  YardWall("VillageSouthGateWingE", 81.6, 70.5, 3.0, .5, 2.2);
  Pole("VillagePole3", 80.9, 57.6);
  Pole("VillagePole4", 81.3, 67.2);
  Wires("VillagePole3", "VillagePole4");
  Pole("VillagePole5", 96.6, 47.5);
  Wires("VillagePole5", "VillagePole3");
  // West lane between the gun house and the southTraffic road.
  House("WestLaneHouse", 32.4, 6.9, 5.6, 11.8, 3.1, {
    doors: [["E", 2.5, 1.0, 2.0, 1]], windows: [["W", -2.5, .9, 1.2, .8], ["W", 2.8, .9, 1.2, .8]] });
  Woodpile("WestLaneWoodpile", 29.0, 4.2, .8, 3.2, 1.1);
  DeadTree("WestLaneTree", 26.5, -4.8, 6.8);
  Pole("VillagePole6", 25.4, -15.8);
  Wires("VillagePole6", "VillagePole0");
  // South-west: a row behind the rear house, a ruin and a threshing yard.
  House("RearRowHouse", 51, 65.25, 9, 7.5, 3.2, { alongX: true,
    doors: [["N", 1.2, 1.1, 2.1, 1]], windows: [["N", -2.6, 1, 1.15, .8]] });
  Bank("SouthWestRuinBody", 26, 53.5, 7, 2.2, 7, "plaster");
  Bank("SouthWestRuinGable", 26, 50.3, 7, 3.3, .6, "plaster");
  Detail("SouthWestRuinBeam0", 25, 54.5, 7.6, .2, .24, "timber", { y: groundAt(25, 54.5) + 2.35, ry: .12 });
  Detail("SouthWestRuinBeam1", 27, 52.2, .24, .2, 6.4, "timber", { y: groundAt(27, 52.2) + 2.3, ry: .2 });
  RubbleStrip("SouthWestRuinFoot", 22.2, 57.6, 29.8, 57.5, 9);
  Haystack("SouthWestHaystack0", 24.6, 61.2, 1.4, 2.2);
  Haystack("SouthWestHaystack1", 28.3, 62.6, 1.0, 1.6);
  DeadTree("SouthWestTree", 27.2, 47.0, 6.4);
  // East side: two rows of farm houses with yard walls between them.
  House("EastRowA", 102, -21.5, 9, 9, 3.3, { alongX: true,
    doors: [["S", -1.5, 1.1, 2.1, 1]], windows: [["S", 2.4, 1, 1.15, .8]] });
  House("EastRowB", 112.25, -19.5, 7.5, 9, 3.1, {
    doors: [["W", 1.5, 1.1, 2.1, 1]], windows: [["S", 0, 1, 1.15, .8]] });
  House("EastRowC", 102.25, -4, 9.5, 10, 3.4, {
    doors: [["W", 1.8, 1.1, 2.1, 1]], windows: [["W", -2.6, 1, 1.15, .8], ["N", 0, 1, 1.15, .8]] });
  House("EastRowD", 103, 10.35, 9, 9.7, 3.2, { alongX: true,
    doors: [["N", 2.2, 1.1, 2.1, 1]], windows: [["N", -2, 1, 1.15, .8]] });
  YardWall("EastRowYardWall", 111.8, -12.3, 8.6, .5, 2.2);
  YardWall("EastRowYardWallSouth", 112.5, 3, .5, 16, 2.2);
  Woodpile("EastRowWoodpile", 97.8, 10.2, .8, 3.4, 1.1);
  Haystack("EastRowHaystack", 110.2, -4.5, 1.3, 2.1);
  DeadTree("EastRowTree0", 100.6, 19.4, 7.4);
  DeadTree("EastRowTree1", 114.5, -27.2, 6.6);
  Pole("VillagePole7", 96.6, -13.2);
  Pole("VillagePole8", 110.8, 20.2);
  Wires("VillagePole7", "VillagePole8");
  House("EastSouthRowA", 103.5, 54, 9, 8, 3.2, { alongX: true,
    doors: [["N", 1.5, 1.1, 2.1, 1]], windows: [["N", -2.5, 1, 1.15, .8]] });
  House("EastSouthRowB", 107, 66, 10, 8, 3.3, {
    doors: [["W", -1, 1.1, 2.1, 1]], windows: [["W", 2.5, 1, 1.15, .8]] });
  DeadTree("EastSouthTree", 94.2, 58.2, 6.9);
  Haystack("EastSouthHaystack", 97, 68.5, 1.1, 1.8);
  // Taller masses behind the long street frontages read as a damaged block.
  HouseMass("StreetEastSouthHouse", 105, 28, 11.5, 11, 3.6);
  HouseMass("VillageWestCourtWing", 30, 23, 4, 18, 3.3);

  return { replaceBlockIds, blocks };
}
