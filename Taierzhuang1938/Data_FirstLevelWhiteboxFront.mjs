// First-level whitebox, 05–07: tank approach (05), casualty collection on the
// reverse slope (06) and the southbound communication line to the village (07).
// Concept references: Notion「第一关｜游戏概念参考图」05/05B, 06/06B, 07/07B;
// gap list and regional ownership: docs/Data_FirstLevelWhitebox0518Gap.md.
// Split out of Data_FirstLevelWhiteboxVillage on 2026-09-27 so the 05–07 and
// 08–10 packages can be edited in parallel; Layout merges this package first.
// 05's established pieces (RoadsideRuin, old yard, sap revetments) still live in
// Data_FirstLevelMissionLayout / the trench network; new 05 masses go here.
//
// 2026-09-27 concept pass (region A). The ground itself is shaped by
// Data_FirstLevelWhiteboxTerrainFront (06 sunken hollow, 07 dug trench); the
// masses here finish what terrain cannot: the stone revetments at the foot of the
// 06 back slopes, the 06B courtyard wall and shed, the brick house on the 07 rim,
// the 05 wall corner beside the throw spot, and the small stuff (crates, stones,
// spare litters, rubble) along wall feet. Everything stays at least 0.9 m clear of
// the frozen routes and the litter corridor (checked by the space/whitebox gates).
// The caller supplies the shared terrain sampler; this module has no imports.
export function BuildFrontWhitebox(groundAt) {
  const blocks = [];
  // Field stone reads darker than plaster walls and lighter than earth: the rail ballast grey.
  const STONE = "railBallast";
  // The shoulders Layout lays along southWalk sat on the open field; the 07 trench
  // walls and spoil now do that job, and three of them would stand on its rim.
  const replaceBlockIds = ["SouthWalkShoulder0", "SouthWalkShoulder2", "SouthWalkShoulder3"];
  function Block(id, x, z, w, h, d, semantic = "plaster", extra = {}) {
    const block = { id, x, z, w, h, d, y: groundAt(x, z) + h / 2,
      semantic, tag: "whiteboxWall", ...extra };
    blocks.push(block);
    return block;
  }
  function Bank(id, x, z, w, h, d, semantic = "earthDark") {
    const top = groundAt(x, z) + h;
    const base = Math.min(...[-1, 0, 1].flatMap(a => [-1, 0, 1].map(b =>
      groundAt(x + a * w / 2, z + b * d / 2)))) - .12;
    return Block(id, x, z, w, top - base, d, semantic, { y: (top + base) / 2 });
  }
  // Lowest ground under a (rotated) footprint: walls on a slope foot are measured
  // from the low side, so a revetment at the foot of a 3 m back slope keeps its
  // stated height above the hollow floor instead of above the slope.
  function Low(x, z, w, d, ry = 0) {
    const c = Math.cos(ry), s = Math.sin(ry);
    let low = Infinity;
    for (const a of [-1, -.5, 0, .5, 1]) for (const b of [-1, -.5, 0, .5, 1])
      low = Math.min(low, groundAt(x + (a * w / 2) * c + (b * d / 2) * s, z - (a * w / 2) * s + (b * d / 2) * c));
    return low;
  }
  /** Solid mass standing `h` above the lowest ground under it (foot sunk 0.1 m). */
  function Footed(id, x, z, w, h, d, semantic = STONE, extra = {}) {
    const base = Low(x, z, w, d, extra.ry || 0) - .1;
    return Block(id, x, z, w, h + .1, d, semantic, { ...extra, y: base + (h + .1) / 2 });
  }
  /** Mass whose top is `top` above the ground at its own centre (foot to the lowest corner). */
  function Topped(id, x, z, w, top, d, semantic = "plaster", extra = {}) {
    const t = groundAt(x, z) + top, base = Low(x, z, w, d, extra.ry || 0) - .1;
    return Block(id, x, z, w, t - base, d, semantic, { ...extra, y: (t + base) / 2 });
  }
  /** Non-colliding surface dressing resting on the ground (stones, crates, bags, rubble); `extra.y` places it explicitly. */
  function Detail(id, x, z, w, h, d, semantic = "timber", extra = {}) {
    const base = Low(x, z, w, d, extra.ry || 0) - .04;
    return Block(id, x, z, w, h + .04, d, semantic, { solid: false, ...extra, y: extra.y ?? base + (h + .04) / 2 });
  }
  // Wall along a segment a→b (length from the points, thickness t), standing h above its low side.
  function WallAlong(id, a, b, t, h, semantic = STONE, extra = {}) {
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    return Footed(id, (a.x + b.x) / 2, (a.z + b.z) / 2, t, h, len, semantic, { ry: Math.atan2(dx, dz), ...extra });
  }
  // Same roof as the Village package (closed soffit, eaves, stepped slopes, ridge),
  // ridge along z. Floor is the ground at the centre.
  function Roof(id, x, z, w, d, height) {
    const floor = groundAt(x, z);
    Block(`${id}Soffit`, x, z, w * 1.08, .32, d + .9, "roof", { y: floor + height + .16 });
    for (const side of [-1, 1]) {
      Block(`${id}Eave${side}`, x + side * w * .39, z, w * .3, .25, d + .9, "roof", { y: floor + height + .125 });
      Block(`${id}Slope${side}`, x + side * w * .2, z, w * .22, .3, d + .5, "roof", { y: floor + height + .44 });
      Block(`${id}Ridge${side}`, x + side * .8, z, .8, .35, d + .2, "roof", { y: floor + height + .77 });
    }
    Block(`${id}RidgeCap`, x, z, 1.6, .35, d + .2, "roof", { y: floor + height + .77 });
  }
  function Tree(id, x, z, trunkH, crownW, crownH) {
    Block(`${id}Trunk`, x, z, .3, trunkH, .32, "timber");
    const g = groundAt(x, z);
    Block(`${id}Crown`, x, z, crownW, crownH, crownW * .9, "foliage", { solid: false, y: g + trunkH + crownH * .35 });
    Block(`${id}CrownTop`, x + .2, z - .1, crownW * .6, crownH * .5, crownW * .55, "foliage",
      { solid: false, y: g + trunkH + crownH * .95 });
  }
  // A spare bamboo litter lying on the ground (two poles and the canvas), long axis along ry.
  function Litter(id, x, z, ry) {
    const c = Math.cos(ry), s = Math.sin(ry);
    for (const side of [-1, 1]) Detail(`${id}Pole${side}`, x + side * .28 * c, z - side * .28 * s, .06, .06, 2.3, "timber", { ry });
    Detail(`${id}Canvas`, x, z, .5, .05, 1.8, "canvas", { ry });
  }

  // One-storey brick house knocked open: four walls with broken tops (tops[] per
  // wall N,E,S,W above the ground at the centre), the south wall split by a door
  // gap, a surviving gable pier and two roof beams. Axis-aligned, centre (x,z).
  function RuinHouse(id, x, z, w, d, tops, { door = 1.4, t = .45, gable = 1 } = {}) {
    const [n, e, sTop, wTop] = tops;
    Topped(`${id}North`, x, z - d / 2 + t / 2, w, n, t, "plaster");
    Topped(`${id}East`, x + w / 2 - t / 2, z, t, e, d - 2 * t, "plaster");
    Topped(`${id}West`, x - w / 2 + t / 2, z, t, wTop, d - 2 * t, "plaster");
    const side = (w - door) / 2;
    Topped(`${id}SouthA`, x - w / 2 + side / 2, z + d / 2 - t / 2, side, sTop, t, "plaster");
    Topped(`${id}SouthB`, x + w / 2 - side / 2, z + d / 2 - t / 2, side, sTop * .7, t, "plaster");
    Topped(`${id}Gable`, x + gable * (w / 2 - t / 2), z, t, Math.max(e, wTop) + 1.3, d * .3, "plaster");
    const g = groundAt(x, z);
    for (const [i, dz, ry] of [[0, -d * .18, .1], [1, d * .12, -.14]])
      Detail(`${id}Beam${i}`, x, z + dz, w - .2, .16, .18, "timber", { y: g + Math.min(n, e, wTop) - .1, ry });
    Detail(`${id}Rubble`, x - w * .15, z + d * .15, w * .4, .45, d * .3, "plaster", { ry: .3 });
  }
  // A leafless tree: trunk and three bare branches.
  function DeadTree(id, x, z, h) {
    Block(`${id}Trunk`, x, z, .34, h, .34, "timber");
    const g = groundAt(x, z);
    for (const [i, dx, dz, y, len, ry] of [[0, .5, .1, .62, 1.8, .5], [1, -.4, -.2, .78, 1.4, -.8], [2, .1, -.3, .9, 1.2, 1.5]])
      Detail(`${id}Branch${i}`, x + dx, z + dz, len, .14, .16, "timber", { y: g + h * y, ry });
  }

  // ── 05 tank approach ──────────────────────────────────────────────────────
  // Concept 05: the player hugs a brick wall corner while the tank stands on the
  // road ahead. The throw spot, RoadsideRuin (its cover face), the K8 view from
  // the damaged lip, K9 from the throw spot and the tank's turret MG onto the
  // attack branch's last 4.7 m all cross the ground west and north of the throw
  // spot, so the corner stands on the pit's east side: a brick wall rising from
  // the pit floor 1.2 m east of the throw spot (3 m above the floor, 1.5 m above
  // the field) with a lower return along the pit's north-east lip.
  {
    const top = (x, z, above) => above - groundAt(x, z); // top given relative to the open field (0 m)
    Topped("RoadsideCornerWall", 45.05, -160.3, .5, top(45.05, -160.3, 1.5), 2.2, "plaster");
    Topped("RoadsideCornerReturn", 45.95, -161.6, 1.4, top(45.95, -161.6, 1.1), .5, "plaster");
    Detail("RoadsideCornerCap", 45.1, -160.7, .45, .2, .9, "plaster", { y: 1.6, ry: .15 });
  }
  for (const [i, x, z, w, h, d, ry] of [[0, 44.45, -159.2, .5, .3, .45, .4], [1, 44.5, -161.0, .45, .22, .4, -.3],
    [2, 46.3, -160.2, .6, .28, .45, .9], [3, 40.6, -161.7, .6, .2, .4, .2], [4, 41.9, -162.9, .55, .25, .5, 1.1]])
    Detail(`RoadsideCornerRubble${i}`, x, z, w, h, d, "plaster", { ry });

  // Behind the stopped tank, seen from the throw spot (concept 05: a row of
  // broken one-storey houses, a dead tree): two ruins north of the road's west
  // end, clear of the escort craters (z −171…−172), the body field north-east of
  // them and the backslope LMG pair's fire points (x ≤ 17).
  RuinHouse("TankRoadRuinWest", 22.5, -177, 6, 5, [2.7, 2.2, 1.6, 2.9]);
  RuinHouse("TankRoadRuinEast", 28.4, -179.3, 4.4, 4.2, [2.3, 1.7, 1.3, 2.4], { gable: -1, door: 1.2 });
  DeadTree("TankRoadDeadTree", 19.4, -172.6, 5.2);
  // Concept 05B: looking back down the attack branch, the south road on the left
  // has a wrecked cart and a roadside ruin.
  RuinHouse("SouthRoadRuin", 52.5, -136.5, 6, 5, [2.6, 2.9, 1.5, 2.1], { door: 1.6 });
  Footed("SouthRoadWreckBed", 49.2, -143.6, 1.5, .55, 3.2, "timber", { ry: .5 });
  for (const [i, dx, dz] of [[0, .9, -1.0], [1, -.2, 1.3]])
    Detail(`SouthRoadWreckWheel${i}`, 49.2 + dx, -143.6 + dz, .14, 1.1, 1.1, "timber", { ry: .5 });
  Detail("SouthRoadWreckShaft", 50.3, -145.6, .12, .12, 2.4, "timber", { ry: .9 });

  // ── 06 casualty collection: the sunken hollow ─────────────────────────────
  // Stone revetments along the foot of the west, north and east walls (the lower
  // half of the 3 m back slope in 06B), then the upper half is earth.
  WallAlong("CollectionWestRevetA", { x: -45.8, z: -107.2 }, { x: -45.8, z: -103.2 }, .6, 1.6);
  WallAlong("CollectionWestRevetB", { x: -45.75, z: -103.2 }, { x: -45.75, z: -99.3 }, .6, 1.3);
  WallAlong("CollectionWestRevetC", { x: -45.8, z: -99.3 }, { x: -45.8, z: -95.3 }, .6, 1.7);
  WallAlong("CollectionNorthRevetA", { x: -45.5, z: -107.2 }, { x: -41, z: -107.2 }, .6, 1.5);
  WallAlong("CollectionNorthRevetB", { x: -41, z: -107.15 }, { x: -36.8, z: -107.15 }, .6, 1.25);
  WallAlong("CollectionEastRevet", { x: -27.25, z: -101.3 }, { x: -27.25, z: -97.7 }, .5, 1.5);
  // …and on round the hollow's south-east corner up the exit ramp's left side, where it
  // meets the lane revetment below: one continuous stone retaining wall (06B left).
  // Tops are given against the open field (0 m) because the foot climbs with the ramp.
  for (const [id, a, b, top] of [["CollectionEastRevetTurn", { x: -27.25, z: -97.7 }, { x: -26.25, z: -95.96 }, -.25],
    ["CollectionRampRevet", { x: -26.25, z: -95.96 }, { x: -23.23, z: -93.47 }, .45]]) {
    const m = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, len = Math.hypot(b.x - a.x, b.z - a.z);
    Topped(id, m.x, m.z, .5, top - groundAt(m.x, m.z), len, STONE, { ry: Math.atan2(b.x - a.x, b.z - a.z) });
  }
  // North foot: ammunition boxes, packs and stones (06 concept: crates and stretchers at the slope foot).
  for (const [i, x, z, w, h, d, sem, ry] of [
    [0, -44.6, -106.3, .8, .5, .6, "timber", .1], [1, -43.4, -106.4, .6, .42, .55, STONE, .5],
    [2, -40.2, -106.35, .9, .5, .55, "timber", 0], [3, -39.2, -106.45, .7, .45, .5, "timber", .25],
    [4, -37.9, -106.4, .55, .35, .5, STONE, .8],
  ]) Detail(`CollectionNorthFoot${i}`, x, z, w, h, d, sem, { ry });
  // One crate on top of another at the north foot.
  Detail("CollectionNorthFootStack", -40.2, -106.35, .75, .42, .5, "timber", { y: Low(-40.2, -106.35, .9, .55) + .5 + .21 });
  // West foot: two spare litters and a row of packs.
  Litter("CollectionSpareLitterA", -44.9, -104.9, 0);
  Litter("CollectionSpareLitterB", -44.95, -97.6, 0);
  for (const [i, z] of [[0, -101.8], [1, -100.9], [2, -100.1]])
    Detail(`CollectionWestPack${i}`, -45.05, z, .45, .38, .35, "canvas", { ry: i * .4 });
  // 06B: a litter set down at the foot of the east revetment.
  Litter("CollectionEastLitter", -28.05, -99.4, 0);
  Detail("CollectionEastStones", -27.9, -101.9, .6, .3, .5, STONE, { ry: .6 });
  // Stones scattered on the hollow floor, clear of litters, bearers and the routes.
  for (const [i, x, z, w, h, d] of [[0, -44.2, -95.9, .5, .25, .4], [1, -30.6, -105.4, .45, .22, .4],
    [2, -42.8, -96.0, .35, .2, .3]])
    Detail(`CollectionFloorStone${i}`, x, z, w, h, d, STONE, { ry: i });

  // Ruined farmhouse on the west back slope's crest ("high ground with ruins" in 06).
  RuinHouse("CollectionWestRuin", -54.5, -101.5, 5, 6.5, [2.9, 2.3, 1.8, 2.6], { gable: -1 });

  // Trees on the east high ground behind the 06B retaining wall.
  Tree("CollectionEastTreeA", -21.5, -100.5, 3.4, 3.2, 3.4);
  Tree("CollectionEastTreeB", -19.2, -94.5, 2.8, 2.6, 2.8);

  // 06B: the right-hand courtyard wall with a lean-to shed, parallel to the
  // southWalk leg (−26,−92)→(−16,−76) and 4.6 m right (west) of it. The shed
  // posts stand 2.6 m off the route line (litter corridor 0.65 + capsule 0.35 clear).
  {
    const A = { x: -26, z: -92 }, B = { x: -16, z: -76 };
    const dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
    const rx = -uz, rz = ux; // right-hand (west) side of travel
    const At = (t, off) => ({ x: A.x + dx * t + rx * off, z: A.z + dz * t + rz * off });
    const ry = Math.atan2(dx, dz);
    WallAlong("CollectionYardWallA", At(.06, 4.6), At(.3, 4.6), .45, 1.8, "plaster");
    WallAlong("CollectionYardWallB", At(.37, 4.6), At(.62, 4.6), .45, 1.75, "plaster");
    for (const [n, t0, t1] of [["A", .06, .3], ["B", .37, .62]]) {
      const m = At((t0 + t1) / 2, 4.6), len2 = (t1 - t0) * len;
      Detail(`CollectionYardWallCap${n}`, m.x, m.z, .7, .14, len2 + .2, "roof",
        { ry, y: Low(m.x, m.z, .45, len2, ry) - .1 + 1.9 + .07 });
    }
    // Gate posts either side of the gap.
    for (const [n, t] of [["A", .305], ["B", .365]]) {
      const p = At(t, 4.6);
      Footed(`CollectionYardGatePost${n}`, p.x, p.z, .5, 2.1, .5, "plaster", { ry });
    }
    // Shed: two posts on the lane side, a slab roof from the wall top down to 2.1 m.
    for (const [n, t] of [["A", .42], ["B", .58]]) {
      const p = At(t, 2.6);
      Footed(`CollectionShedPost${n}`, p.x, p.z, .18, 2.1, .18, "timber", { ry });
    }
    {
      const m = At(.5, 3.55), g = groundAt(m.x, m.z);
      Block("CollectionShedRoof", m.x, m.z, 2.4, .12, .2 * len + .6, "timber", { ry, y: g + 2.12 });
      Block("CollectionShedRoofUpper", At(.5, 4.25).x, At(.5, 4.25).z, 1.0, .12, .2 * len + .6, "timber", { ry, y: g + 2.3 });
    }
    for (const [i, t, off, w, h, d] of [[0, .45, 3.8, .8, .5, .6], [1, .53, 3.9, .7, .55, .6], [2, .5, 3.85, .6, .35, .5]])
      Detail(`CollectionShedCrate${i}`, At(t, off).x, At(t, off).z, w, h, d, "timber",
        { ry: ry + i * .3, ...(i === 2 ? { y: Low(At(.45, 3.8).x, At(.45, 3.8).z, .8, .6) + .5 + .17 } : {}) });
    // Retaining wall on the lane's left (east) side, at the foot of the east high ground.
    const L = (t, off) => At(t, -off);
    WallAlong("CollectionLaneRevet", L(.02, 3.1), L(.3, 3.1), .55, 1.35);
    for (const [i, t, off] of [[0, .12, 2.55], [1, .26, 2.6], [2, .4, 2.7]])
      Detail(`CollectionLaneStone${i}`, L(t, off).x, L(t, off).z, .45, .25, .38, STONE, { ry: i * .7 });
  }

  // ── 07 the southbound communication trench ────────────────────────────────
  // Centre line of Data_FirstLevelWhiteboxTerrainFront.SouthWalkCut (duplicated,
  // this module has no imports): floor 1.7 m down, 3.4 m wide.
  const TRENCH = [{ x: -16, z: -76 }, { x: -16, z: -69.5 }, { x: -15.8, z: -52.5 }, { x: -10.05, z: -41.2 }, { x: -7.2, z: -34.2 }];
  {
    // Stones and fallen earth along both wall feet, 1.35–1.55 m off the centre line.
    const segs = [];
    let acc = 0;
    for (let i = 1; i < TRENCH.length; i++) {
      const a = TRENCH[i - 1], b = TRENCH[i], l = Math.hypot(b.x - a.x, b.z - a.z);
      segs.push({ a, b, l, s0: acc }); acc += l;
    }
    let k = 0;
    for (let s = 8; s < acc - 7; s += 3.7, k++) {
      const g = segs.find((q) => s <= q.s0 + q.l) || segs.at(-1), t = (s - g.s0) / g.l;
      const ux = (g.b.x - g.a.x) / g.l, uz = (g.b.z - g.a.z) / g.l, side = k % 2 ? 1 : -1, off = 1.35 + (k % 3) * .1;
      const x = g.a.x + (g.b.x - g.a.x) * t - uz * side * off, z = g.a.z + (g.b.z - g.a.z) * t + ux * side * off;
      const size = [.5, .35, .42, .28][k % 4];
      Detail(`SouthTrenchStone${k}`, x, z, size, size * .6, size * .8, k % 3 ? STONE : "earthDark", { ry: k * 1.3 });
    }
    // A dropped crate and a broken plank on the trench floor edge.
    Detail("SouthTrenchCrate", -17.35, -60.5, .7, .45, .55, "timber", { ry: .2 });
    Detail("SouthTrenchPlank", -14.55, -64.2, .25, .06, 2.2, "timber", { ry: .1 });
  }
  // Concept 07: a brick house on the left (east) rim above the trench wall,
  // 3.6 m off the trench centre line, gable to the trench.
  {
    const x = -9.4, z = -57, w = 5.6, d = 8, h = 3.2;
    Bank("SouthRimHouseBody", x, z, w, h, d, "plaster");
    Roof("SouthRimHouse", x, z, w, d, h);
    const g = groundAt(x, z);
    // Dark window and door insets on the trench-side (west) wall.
    for (const [i, dz, y, hh] of [[0, -2.2, 1.55, 1.0], [1, 2.1, 1.55, 1.0]])
      Block(`SouthRimHouseWindow${i}`, x - w / 2 - .03, z + dz, .08, hh, .9, "timber", { solid: false, y: g + y });
    Block("SouthRimHouseDoor", x + w / 2 + .03, z + 1.5, .08, 2.0, 1.0, "timber", { solid: false, y: g + 1.0 });
  }
  // A broken wall line on the west rim near the south exit, and the loose
  // brick it shed; the rim sits 4.2 m off the trench centre line.
  for (const [i, x, z, len, top] of [[0, -16.25, -44.1, 2.6, 1.3], [1, -17.3, -46.2, 1.8, .8]])
    Topped(`SouthRimRuin${i}`, x, z, .5, top, len, "plaster", { ry: Math.atan2(.453, .891) });
  Detail("SouthRimRuinRubble", -17.6, -43.2, 1.2, .35, .9, "plaster", { ry: .5 });
  // Trees: one beyond the south exit (the end of the trench view), one by the east road.
  Tree("SouthExitTree", -9.5, -30.6, 4.2, 3.4, 4.0);
  Tree("SouthRoadTree", -5.2, -47.5, 3.6, 2.8, 3.4);

  // 07: earth shoulders define the southbound communication line at the
  // village approach. The centre route and its existing excavation stay open.
  Bank("SouthVillageBankWest", 17, -29.4, 12, 1.7, 2.4);
  Bank("SouthVillageBankEast", 33.5, -17.5, 11, 1.55, 2.2);

  return { replaceBlockIds, blocks };
}
