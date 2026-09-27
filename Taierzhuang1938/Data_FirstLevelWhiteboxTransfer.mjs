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
// The west terrace scarp stands behind the farm store. Everything solid added here sits on the yard's
// edges, never inside x 60–95 / z 108–138: stage 13 pushes everybody within
// 9 m of the road out to x 67 / x 85 (ScatterFromRoad) and StartRetreat then
// walks every litter and walker due west to x 60 at its own z before turning
// for the ditch mouth (54,114). A north–south wall anywhere in that band would
// be walked through, which is why the concept's road-side walls (12_2/13_1)
// live only as the yard's west house wall, the bridgehead piers and an
// east–west ruin by the river. Non-solid dressing is allowed in the band.
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
  // cover facing north. The east run keeps one unbroken stone over x 79.5–84.6
  // where the crouched post's line to the gunner (113,80) crosses it.
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
  // Crates, a basket and a cart wheel along the screen, clear of pocket (59,105).
  Detail("TransferScreenCrate0", 55.7, 91.2, .8, .6, .6);
  Detail("TransferScreenBasket", 55.6, 92.6, .55, .5, .55, "canvas");
  Detail("TransferScreenWheel", 54.55, 101.5, .12, 1.1, 1.1, "timber");
  Detail("TransferScreenCrate1", 55.8, 107.3, .8, .6, .6, "timber", { ry: .3 });
  // 11 foreground: the sorting yard is all crowd lanes (lateral at z 88/111,
  // straight down each pocket's x), so only non-solid litter between them:
  // a dropped stretcher, crates, a wheel and a basket.
  Detail("TransferYardStretcher", 62.2, 97.5, .62, .22, 2.1, "canvas", { ry: .2 });
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
  const leanTop = groundAt(50.65, 126.8) + 3.3;
  [[56.65, 0.3], [59.75, 0.5], [62.8, 0.7]].forEach(([x, drop], i) =>
    At(`TransferShelterCanvas${i}`, x, 126.75, 3.2, .12, 8.7, leanTop - drop, "canvas"));
  for (const z of [123, 130.5]) {
    const g = groundAt(64, z) - .1;
    At(`TransferShelterPost64_${z}`, 64, z, 0.3, leanTop - .7 - g, 0.3, g, "timber");
  }
  Detail("TransferShelterStretcher0", 57.6, 125.0, .62, .22, 2.1, "canvas");
  Detail("TransferShelterStretcher1", 58.3, 128.9, .62, .22, 2.1, "canvas", { ry: .08 });
  Detail("TransferShelterCrate0", 56.2, 124.0, .8, .6, .6);
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
  House("TransferThatchShed", 99.1, 130.8, 4.2, 5.2, 2.6, { wall: "earthDark", roof: "canvas" });
  Detail("TransferThatchShedDoor", 96.96, 130.4, .12, 1.8, 1.0, "timber");
  Detail("TransferShedBasket", 96.4, 131.2, .55, .5, .55, "canvas");
  Detail("TransferShedJar", 96.5, 129.6, .55, .7, .55, "earthDark");
  // Preserve the established open west-facing alley and its northern pursuit
  // gap. Add a real building mass only south/east of its walls and gun sight.
  Block("TransferAlleyStoreSouth", 108.5, 133, 14, 3.2, 0.7);
  Block("TransferAlleyStoreEast", 115.5, 129.5, 0.7, 3.2, 7);
  Roof("TransferAlleyStoreRoof", 111, 130, 9, 6.5, 3.4);

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
