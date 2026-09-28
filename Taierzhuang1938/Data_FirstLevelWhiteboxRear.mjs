// First-level whitebox, stages 15–18. Rev 2026-09-27 against the Notion concept frames
// 15_1…18_2 (docs/Data_FirstLevelWhitebox0518Gap.md §1 15–18, region D). Rev 2026-09-24
// (Stage_15…Stage_18_B) built the lane walls, ward roof and night-gate silhouette.
//   15_1  lane after the square turn: left a 1.35 m stone wall with tile coping and a
//         sunken garden beyond it (terrain LaneHollowEast), right a one-storey mud house
//         (WallPathTurnWest is its street wall), the gatehouse ahead.
//   15_2  the ordinary yard gate becomes a tiled gatehouse; sandbags on one side of the
//         door, broken brick on the other, a trampled forecourt in front.
//   16–17 the 12×18 m ward is split by an internal bay wall (z 238): the south bay is the
//         5 m deep treatment room (cots, shelf, west window, 2.8 m door, porch posts);
//         the north bay keeps the litter slots. Yard gains side rooms, lying wounded,
//         clutter and ruined houses beyond the south wall.
//   18_1  the south bank has an earthen crest (terrain) and the firing walls wear earth
//         skins; the railway bridge gets stone piers (non-colliding).
//   18_2  (NightGate only) houses front the approach street, ammunition stacks line it.
// Frozen: every anchor/route/placement, the 15B lane members, gate 4.0 m, ward threshold,
// bedside tolerances, bridge four states, blast stand-off, night gate/wall sizes.
// Litter lines from wardEntry (-26,240) to MISSION_RECEPTION_SPACE.litterOrigin slots and
// Data_Tuning_FirstLevelEnd.nextLitterRoute cross the bay wall inside its 4.5 m opening.
// Non-solid details over 0.55 m count in Script_FirstLevelReception's walk graph: keep them
// off the receptionApproach/wallPath/reception node lines.
// "Skins" are non-solid shells 0.1 m proud of a Layout wall (15B lane walls, gate walls,
// bridge parapets): they restyle it without touching the measured solid.
// Pure BuildSink geometry, no imports; the caller supplies the shared terrain sampler.

export function BuildRearWhitebox(groundAt) {
  const blocks = [], nightBlocks = [];
  const replaceBlockIds = ["ReceptionWardRoof", "ReceptionStreetRoomRoof", "RearCourtyardHouseRoof",
    // The ward's south door narrows to 2.8 m and its west wall gains a window.
    "ReceptionWardSouthLeft", "ReceptionWardSouthRight", "ReceptionWardSouthLintel", "ReceptionWardWest"];
  function Box(list, id, x, z, w, h, d, semantic = "plaster", extra = {}) {
    const block = { id, x, z, w, h, d, y: groundAt(x, z) + h / 2,
      semantic, tag: "whiteboxWall", ...extra };
    list.push(block);
    return block;
  }
  const Detail = (id, x, z, w, h, d, semantic = "timber", extra = {}) =>
    Box(blocks, id, x, z, w, h, d, semantic, { solid: false, ...extra });
  function Grounded(id, x, z, w, h, d, semantic = "plaster", ry = 0, extra = {}) {
    const c = Math.cos(ry), s = Math.sin(ry);
    const base = Math.min(...[-1, 0, 1].flatMap(a => [-1, 0, 1].map(b =>
      groundAt(x + a * w / 2 * c + b * d / 2 * s,
        z - a * w / 2 * s + b * d / 2 * c)))) - .1;
    const top = groundAt(x, z) + h;
    return Box(blocks, id, x, z, w, top - base, d, semantic, { y: (top + base) / 2, ry, ...extra });
  }
  function Along(id, ax, az, bx, bz, offset, h, semantic, w = .65) {
    const length = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
    return Grounded(id, (ax + bx) / 2 + (bz - az) / length * offset,
      (az + bz) / 2 - (bx - ax) / length * offset, w, h, length + .5, semantic, ry);
  }
  // Closed stepped tile roof (a solid stack, no sky between tiers). `w` spans across the
  // ridge, `d` runs along it; the ridge runs along z unless alongX. Tier 0 overhangs 0.5 m.
  function Gable(list, id, x, z, w, d, eave, { alongX = false, base = groundAt(x, z), tiers = 4 } = {}) {
    const rise = Math.min(.5 * w / 2, 2.1), step = rise / tiers;
    const Put = (sid, span, h, len, bottom, semantic) => Box(list, `${id}${sid}`, x, z,
      alongX ? len : span, h, alongX ? span : len, semantic, { y: base + bottom + h / 2 });
    for (let k = 0; k < tiers; k++)
      Put(`Roof${k}`, (w + 1) * (1 - k / tiers), step, d + 1 - k * .1, eave + k * step, "roof");
    Put("RidgeCap", .34, .2, d + .8, eave + rise, "roof");
    return eave + rise;
  }
  // A solid one-storey mass (not enterable) with a closed roof.
  function HouseMass(id, x, z, w, d, h, opts = {}) {
    Grounded(`${id}Body`, x, z, w, h, d, "plaster");
    Gable(blocks, id, x, z, opts.alongX ? d : w, opts.alongX ? w : d, h, opts);
  }
  // Tile coping on a wall top (non-solid): a slab that overhangs both faces and a ridge.
  function Coping(id, x, z, len, thick, top, ry = 0) {
    const g = groundAt(x, z);
    Detail(`${id}Coping`, x, z, thick + .26, .12, len + .1, "coping", { y: g + top + .06, ry });
    Detail(`${id}CopingRidge`, x, z, .22, .1, len + .1, "coping", { y: g + top + .17, ry });
  }
  // Deterministic scatter of small broken brick / stone / earth pieces (non-solid).
  let seed = 1518;
  const Rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  function Rubble(id, x, z, count, sx, sz, maxH = .42, semantic = "railBallast", size = 1) {
    for (let i = 0; i < count; i++) {
      const px = x + (Rand() - .5) * 2 * sx, pz = z + (Rand() - .5) * 2 * sz;
      const w = (.2 + Rand() * .42) * size, d = (.18 + Rand() * .36) * size, h = .1 + Rand() * (maxH - .1);
      Detail(`${id}${i}`, px, pz, w, h, d, i % 3 ? semantic : "earthDark",
        { y: groundAt(px, pz) + h / 2 - .03, ry: Rand() * Math.PI });
    }
  }
  // Solid cot: a raised board over legs, blanket and pillow; top at 0.52 m (walk graph ignores it).
  function Cot(id, x, z, occupied = false) {
    const w = .84, d = 2, g = groundAt(x, z);
    Box(blocks, `${id}Board`, x, z, w, .1, d, "timber", { y: g + .47 });
    for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]])
      Detail(`${id}Leg${a < 0 ? "W" : "E"}${b < 0 ? "N" : "S"}`, x + a * (w / 2 - .07), z + b * (d / 2 - .07),
        .07, .42, .07, "timber", { y: g + .21 });
    Detail(`${id}Blanket`, x, z + .2, .7, .08, 1.3, "canvas", { y: g + .56 });
    Detail(`${id}Pillow`, x, z - .75, .5, .1, .3, "canvas", { y: g + .57 });
    if (occupied) Detail(`${id}Body`, x, z + .15, .4, .2, 1.5, "earthDark", { y: g + .66 });
  }

  // ---------------------------------------------------------------------------
  // 15A/15B: ditch tail and the westward lane (15B members stay Layout's; only skins here)
  // ---------------------------------------------------------------------------
  // The western ditch rises into a wall-side route. These two walls join the existing
  // 2.8 m lane without changing its route or placing a barrier across it.
  Along("RearLaneDiagonalYardWall", 55.5, 207.1, 36, 211, 1.72, 2.8, "plaster");
  Along("RearLaneDiagonalLowWall", 54, 207.4, 37, 210.8, -1.82, 1.05, "earthDark");
  // Outbuilding behind the lane wall, now with a closed tiled roof.
  Grounded("RearLaneOutbuildingWest", 31, 200, .6, 2.7, 10);
  Grounded("RearLaneOutbuildingEast", 41, 200, .6, 2.7, 10);
  Grounded("RearLaneOutbuildingNorth", 36, 195, 10, 2.7, .6);
  Grounded("RearLaneOutbuildingSouth", 36, 205, 10, 2.7, .6);
  Gable(blocks, "RearLaneOutbuilding", 36, 200, 10.6, 10.6, 2.7, { alongX: true });
  Gable(blocks, "RearCourtyardHouse", 27, 232, 13, 12, 2.9);
  // Telegraph line along the ditch's east lip (14_2 / 15A: poles above the trench).
  for (const [i, z] of [174, 202].entries()) {
    Box(blocks, `RearDitchPole${i}`, 63.5, z, .22, 6, .22, "timber");
    Detail(`RearDitchPoleArm${i}`, 63.5, z, 1.8, .12, .14, "timber", { y: groundAt(63.5, z) + 5.4 });
  }
  Rubble("RearDitchLipRubble", 61.5, 191, 7, 1.2, 5, .38, "earthDark");
  // 15B lane wall skins: plaster yard wall and a stone low wall with tile coping. They wrap
  // Layout's WallPathYardWall (25,209.5 22×0.7) / WallPathLowWall (27,213 18×0.7).
  {
    const yardTop = groundAt(25, 209.5) + 2.8, lowTop = groundAt(27, 213) + 1.1;
    Detail("WallPathYardWallSkin", 25, 209.5, 22, 3.1, .9, "plaster", { y: yardTop - 1.53 });
    Coping("WallPathYardWall", 25, 209.5, 22, .7, 2.84, Math.PI / 2);
    Detail("WallPathLowWallSkin", 27, 213, 18, 1.4, .9, "railBallast", { y: lowTop - .68 });
    Coping("WallPathLowWall", 27, 213, 18, .7, 1.14, Math.PI / 2);
  }
  // Chips at the lane's south foot, >= 0.9 m off the z=211 centre line.
  Rubble("WallPathSouthFootChips", 29, 212.3, 5, 5.5, .05, .16, "railBallast", .5);

  // ---------------------------------------------------------------------------
  // 15_1: after the square turn (route x=16 → (12,230) → gate)
  // ---------------------------------------------------------------------------
  // Left (east): stone wall with tile coping, 1.35 m, 1.65 m off the route centre; it joins
  // the low wall's west end and bends parallel to the (16,220)→(12,230) leg.
  Grounded("RearLaneStoneWall", 17.65, 216.95, .55, 1.35, 8.5, "railBallast");
  Coping("RearLaneStoneWall", 17.65, 216.95, 8.5, .55, 1.35);
  {
    const wall = Along("RearLaneStoneWallBend", 17.65, 221.2, 14.4, 229.5, 0, 1.3, "railBallast", .55);
    Coping("RearLaneStoneWallBend", wall.x, wall.z, wall.d, .55, 1.3, wall.ry);
  }
  // Right (west): a one-storey mud house whose street wall is Layout's WallPathTurnWest
  // (13.25,216.5, 2.8 m). It keeps x<6.7 free: the (-1,216)→(6,216)→(6,240) walk around the
  // compound's north-east corner (Data_Tuning_FirstLevelEnd.receptionApproach).
  Grounded("LaneHouseNorth", 10.2, 211.5, 6.6, 2.95, .6);
  Grounded("LaneHouseWest", 7.2, 216.5, .6, 2.95, 10.6);
  Grounded("LaneHouseSouth", 10.2, 221.5, 6.6, 2.95, .6);
  Detail("LaneHouseStreetWallSkin", 13.25, 216.5, .9, 3.3, 10, "plaster",
    { y: groundAt(13.25, 216.5) + 2.95 - 1.65 });
  Gable(blocks, "LaneHouse", 10.4, 216.5, 6.8, 10.6, 2.95);
  Detail("LaneHouseWindowFrame", 7.2, 217.4, .75, .9, 1.1, "timber", { y: groundAt(7.2, 217.4) + 1.55 });
  Detail("LaneHouseDoorFrame", 10.2, 221.5, 1.1, 2.05, .75, "timber", { y: groundAt(10.2, 221.5) + 1.02 });
  // Past the house the forecourt keeps a low garden wall on the right, so the lane still
  // funnels to the gate; its west end stops 1.8 m short of the x=6 walk around the compound.
  {
    const wall = Along("RearLaneWestGardenWall", 12.9, 222.3, 8.0, 230.2, 0, 1.15, "railBallast", .5);
    Coping("RearLaneWestGardenWall", wall.x, wall.z, wall.d, .5, 1.15, wall.ry);
  }
  // Chips along both wall feet inside the turn leg (x 13.7–14.2 / 16.95–17.35).
  Rubble("LaneTurnWestFoot", 13.95, 216.5, 6, .08, 4.3, .3, "railBallast", .6);
  Rubble("LaneTurnEastFoot", 17.15, 217, 5, .04, 3.6, .28, "railBallast", .5);
  // Beyond the stone wall: the sunken garden (terrain LaneHollowEast) with an old cart,
  // a pile of broken brick and some scrub, so it reads as a drop, not an empty pit.
  Grounded("LaneHollowCartBed", 26.5, 219, 3.2, .7, 1.5, "timber", .35);
  Detail("LaneHollowCartWheel", 25.3, 220.1, 1.3, 1.3, .16, "timber",
    { y: groundAt(25.3, 220.1) + .55, ry: .35 });
  Rubble("LaneHollowBrick", 31, 218, 9, 2.6, 2.2, .5);
  for (const [i, x, z, s] of [[0, 21.2, 216.6, 1.1], [1, 34.5, 221.1, 1.4], [2, 22.8, 221.8, .9]])
    Detail(`LaneHollowScrub${i}`, x, z, s, s * .7, s, "foliage", { y: groundAt(x, z) + s * .3 });

  // ---------------------------------------------------------------------------
  // 15_2: gatehouse at (2,240). The 4.0 m opening and ReceptionEastNorth/South stay Layout's.
  // ---------------------------------------------------------------------------
  for (const [side, z] of [["North", 237.6], ["South", 242.4]])
    Grounded(`ReceptionGatePier${side}`, 2, z, 1.05, 3.25, .8, "structure");
  Box(blocks, "ReceptionGateBeam", 2, 240, 1.05, .42, 5.6, "timber",
    { y: groundAt(2, 240) + 2.8 + .21 });
  Gable(blocks, "ReceptionGateHouse", 2, 240, 2.6, 6.2, 3.23, { tiers: 3 });
  // Door leaves swung back flat against the yard face of the wall; a stone sill across the gate.
  for (const [side, z] of [["North", 237.05], ["South", 242.95]])
    Detail(`ReceptionGateLeaf${side}`, 1.52, z, .08, 2.3, 1.85, "timber", { y: groundAt(1.52, z) + 1.2 });
  Box(blocks, "ReceptionGateSill", 2, 240, .45, .1, 4, "structure");
  // Wall skins either side of the gate (Layout ReceptionEastNorth 2,228 20 m / EastSouth 2,243.5 3 m).
  Detail("ReceptionEastNorthSkin", 2, 228.1, .9, 3.05, 19.8, "plaster", { y: groundAt(2, 228) + 1.33 });
  Coping("ReceptionEastNorth", 2, 228.1, 19.8, .7, 2.84);
  Detail("ReceptionEastSouthSkin", 2, 243.5, .9, 3.05, 2.9, "plaster", { y: groundAt(2, 243.5) + 1.33 });
  // Forecourt: sandbag breastwork south of the door (1.0 m, 3 m), broken brick north of it.
  // The block is only the solid/cover envelope: IsMissionSandbagBlock fills it with the standard
  // sandbag model (docs/Data_SandbagStandard.md); the old canvas course strips are gone with it.
  Box(blocks, "ReceptionGateSandbags", 3.55, 244.75, .9, 1, 3.1, "earthDark",
    { cover: { faceX: 1, faceZ: 0 } });
  Rubble("ReceptionGateBrick", 3.5, 234.2, 9, 1, 1.4, .5);
  Rubble("ReceptionForecourt", 8.2, 226.5, 8, 1.6, 2.4, .3, "earthDark");
  Detail("ReceptionGateBrokenCart", 11.3, 234.4, 2.8, .55, 1.2, "timber",
    { y: groundAt(11.3, 234.4) + .32, ry: -.5 });

  // ---------------------------------------------------------------------------
  // 16–17: the ward, split into a south treatment bay and a north litter bay
  // ---------------------------------------------------------------------------
  {
    const wall = (id, x, z, w, h, d) =>
      Box(blocks, id, x, z, w, h, d, "cover", { cover: { faceX: 0, faceZ: -1 } });
    // South door 3.8 → 2.8 m (x -27.4…-24.6); head bottom 2.4 m. Threshold stays Layout's.
    wall("ReceptionWardSouthWest", -30.2, 243, 5.6, 2.9, .6);
    wall("ReceptionWardSouthEast", -21.8, 243, 5.6, 2.9, .6);
    Box(blocks, "ReceptionWardSouthDoorHead", -26, 243, 2.8, .5, .6, "structure",
      { y: groundAt(-26, 243) + 2.65 });
    for (const [side, x] of [["West", -27.33], ["East", -24.67]])
      Detail(`ReceptionWardDoorPost${side}`, x, 243, .14, 2.4, .7, "timber", { y: groundAt(x, 243) + 1.2 });
    // West wall with a window into the treatment bay (opening z 238.9…240.9, 0.95…2.3 m).
    wall("ReceptionWardWestNorth", -33, 231.95, .6, 2.9, 13.9);
    wall("ReceptionWardWestSouth", -33, 241.95, .6, 2.9, 2.1);
    wall("ReceptionWardWestSill", -33, 239.9, .6, .95, 2);
    Box(blocks, "ReceptionWardWestHead", -33, 239.9, .6, .6, 2, "structure", { y: groundAt(-33, 239.9) + 2.6 });
    for (const [i, z] of [239.4, 239.9, 240.4].entries())
      Detail(`ReceptionWardWestMullion${i}`, -33, z, .08, 1.35, .06, "timber", { y: groundAt(-33, z) + 1.625 });
    // Bay wall at z 238 with a 5.3 m framed opening (x -29.3…-24.0): the litter lines (0.65 m
    // half-corridor) to the north-bay slots and the 17 next-litter tail pass it with >= 0.2 m spare.
    Box(blocks, "ReceptionWardBayWallWest", -31, 238, 3.4, 2.9, .3, "plaster");
    Box(blocks, "ReceptionWardBayWallEast", -21.65, 238, 4.7, 2.9, .3, "plaster");
    Box(blocks, "ReceptionWardBayBeam", -26.65, 238, 5.5, .5, .36, "timber", { y: groundAt(-26.75, 238) + 2.65 });
    for (const [side, x] of [["West", -29.25], ["East", -24.05]])
      Box(blocks, `ReceptionWardBayPost${side}`, x, 238, .22, 2.4, .36, "timber");
    // Treatment bay: two occupied cots, a medicine shelf, a wash table.
    Cot("ReceptionWardCotWest", -31.8, 240, true);
    Cot("ReceptionWardCotEast", -20.05, 239.95, true);
    Box(blocks, "ReceptionWardShelf", -21.8, 238.45, 2.2, 1.9, .5, "timber");
    for (const [i, y] of [.55, 1.05, 1.55].entries()) {
      Detail(`ReceptionWardShelfBoard${i}`, -21.8, 238.66, 2.2, .04, .12, "timber", { y: groundAt(-21.8, 238.45) + y });
      Detail(`ReceptionWardShelfJars${i}`, -21.8 + (i - 1) * .5, 238.66, .9 - i * .15, .22, .1, "canvas",
        { y: groundAt(-21.8, 238.45) + y + .13 });
    }
    Box(blocks, "ReceptionWardWashTable", -29.9, 238.85, .9, .75, .6, "timber");
    Detail("ReceptionWardBasin", -29.9, 238.85, .5, .12, .45, "metal", { y: groundAt(-29.9, 238.85) + .81 });
    // North bay: cots against the walls, clear of the six litter slots and their bearers.
    Cot("ReceptionWardCotNorthWest", -31.9, 227.2, true);
    Cot("ReceptionWardCotMiddleWest", -31.9, 234.1, false);
    Cot("ReceptionWardCotNorthEast", -20.1, 227.2, true);
    // A hanging curtain in the north door keeps the bay dim (nothing routes through that door).
    Detail("ReceptionWardNorthCurtain", -26, 225.36, 3.7, 2.3, .05, "canvas", { y: groundAt(-26, 225.4) + 1.2 });
    // Closed tiled roof over both bays (soffit 2.9 m) and ceiling beams.
    Gable(blocks, "ReceptionWard", -26, 234, 14, 18, 2.9, { tiers: 5 });
    for (const [i, z] of [227, 231, 235, 240.4].entries())
      Box(blocks, `ReceptionWardCeilingBeam${i}`, -26, z, 13.6, .22, .28, "timber",
        { y: groundAt(-26, 234) + 2.79 });
    // Porch along the south front: eave and posts, the wide open bay east of the door.
    Box(blocks, "ReceptionWardPorchRoof", -26, 244.2, 14.8, .18, 2.6, "roof",
      { y: groundAt(-26, 234) + 2.8 });
    Detail("ReceptionWardPorchBeam", -26, 245.1, 13, .2, .2, "timber", { y: groundAt(-26, 245.1) + 2.6 });
    // No post in x -25.4…-20.8: runner route and walk line cross the eave there.
    for (const [side, x] of [["West", -32.2], ["West2", -29.9], ["West3", -27.6], ["East", -19.8]]) {
      Box(blocks, `ReceptionWardPorchPost${side}`, x, 245.1, .24, 2.72, .24, "timber");
      Detail(`ReceptionWardPorchPlinth${side}`, x, 245.1, .38, .12, .38, "structure");
    }
  }
  Gable(blocks, "ReceptionStreetRoom", -5, 229, 10, 14, 2.9);

  // Yard: side rooms, the waiting shelter, lying wounded and clutter.
  // North-west side room (solid mass, door and window facing the yard).
  HouseMass("ReceptionNorthWestRoom", -38.15, 223.6, 4.4, 10.4, 2.9);
  Detail("ReceptionNorthWestRoomDoor", -35.93, 224.6, .12, 2.05, 1.1, "timber", { y: groundAt(-35.9, 224.6) + 1.03 });
  Detail("ReceptionNorthWestRoomWindow", -35.93, 221.2, .12, .8, 1.1, "timber", { y: groundAt(-35.9, 221.2) + 1.5 });
  // South-east outhouse closes the open corner between the gate wall and the south wall's
  // east end (x -3.5). It stays south of the gate→(-13,249) walk lines.
  HouseMass("ReceptionSouthEastRoom", -.9, 249.1, 5, 5.1, 2.9, { alongX: true });
  Detail("ReceptionSouthEastRoomDoor", -1.6, 246.53, 1.05, 2.05, .12, "timber", { y: groundAt(-1.6, 246.55) + 1.03 });
  // North-east lean-to woodshed east of the street room's north door.
  for (const [i, x] of [-2.9, -.7].entries())
    Box(blocks, `ReceptionWoodshedPost${i}`, x, 221.2, .18, 2.25, .18, "timber");
  Box(blocks, "ReceptionWoodshedRoof", -1.8, 219.8, 3, .14, 3.2, "roof", { y: groundAt(-1.8, 219.8) + 2.3 });
  Box(blocks, "ReceptionWoodpile", -1.8, 219.2, 2.3, 1.2, 1, "timber");
  // The waiting shelter and receiving table from 09-24.
  Box(blocks, "ReceptionWaitingRoof", -13.2, 221.5, 8.5, .18, 5, "timber",
    { y: groundAt(-13.2, 221.5) + 2.8 });
  for (const [i, x, z] of [[0, -17.1, 223.6], [1, -9.3, 223.6]])
    Box(blocks, `ReceptionWaitingPost${i}`, x, z, .22, 2.8, .22, "timber");
  Box(blocks, "ReceptionWaitingBench", -13.2, 220, 5.6, .44, .6, "timber");
  Box(blocks, "ReceptionReceivingTable", -16.2, 226, 1.7, .78, .8, "timber");
  // 空担架摞：这块只留碰撞（visual:false），画面由 MissionView 用担架模型码两列三层
  // （MISSION_PLACEMENT.receptionYard.emptyLitterStack）。原西北角让给 05–18 重做的西北厢房。
  Box(blocks, "ReceptionEmptyLitterStack", -38.5, 233, 1.5, .48, 2.9, "timber", { visual: false });
  // Casualties waiting on litters beside the ward and in the west strip behind it are the real
  // stretcher model with a baked patient: MISSION_PLACEMENT.groundStretchers.
  // Clutter against walls: water vats, baskets, a brick pile, firewood.
  for (const [i, x, z, h] of [[0, -34.2, 245.35, .7], [1, -11.3, 236.95, .6], [2, -39.9, 250.8, .65]]) {
    Box(blocks, `ReceptionVat${i}`, x, z, .62, h, .62, "earthDark");
    Detail(`ReceptionVatRim${i}`, x, z, .7, .06, .7, "earthDark", { y: groundAt(x, z) + h + .03 });
  }
  for (const [i, x, z] of [[0, -10.4, 237.1], [1, -40.1, 249.6], [2, -18.6, 250.9]])
    Detail(`ReceptionBasket${i}`, x, z, .5, .45, .5, "timber", { y: groundAt(x, z) + .22 });
  Rubble("ReceptionYardSouthFoot", -30, 251.1, 8, 7, .3, .35);
  Rubble("ReceptionYardNorthFoot", -26, 218.9, 6, 6, .3, .3, "earthDark");
  // Beyond the south wall: two ruined houses and spill, seen through the ward door (17).
  HouseMass("ReceptionSouthRuinA", -32.5, 258.5, 9, 6.5, 3.2, { alongX: true });
  Grounded("ReceptionSouthRuinAGable", -36.2, 258.5, .6, 4.5, 6.5, "plaster");
  {
    const g = groundAt(-16, 259.5);
    Grounded("ReceptionSouthRuinBNorth", -16.4, 256.6, 8.2, 2.4, .6, "plaster");
    Grounded("ReceptionSouthRuinBWest", -20.2, 259.5, .6, 3, 6.2, "plaster");
    Grounded("ReceptionSouthRuinBEast", -12.6, 259.2, .6, 1.4, 5.6, "plaster");
    Detail("ReceptionSouthRuinBBeam", -16.6, 259.4, 7, .24, .3, "timber", { y: g + 2.35, ry: .12 });
  }
  Rubble("ReceptionSouthRuinSpill", -16, 256.5, 10, 3.5, 1.2, .55);
  // North of the compound, west of the river slope: a row of houses closes the open field
  // seen over the north wall. South faces z <= 213: the (-25,216)→(-1,216) walk stays open.
  HouseMass("ReceptionNorthRowA", -34.5, 207.8, 9, 8, 3.1, { alongX: true });
  HouseMass("ReceptionNorthRowB", -21.5, 208.6, 8, 7, 3.4);
  Grounded("ReceptionNorthRowYardWall", -28, 212.8, 4.2, 2.2, .5, "plaster");
  Rubble("ReceptionNorthRowSpill", -27.8, 214.4, 6, 3, .4, .35);

  // ---------------------------------------------------------------------------
  // 18: south bank firing pocket, blast-safe cover, bridge piers
  // ---------------------------------------------------------------------------
  Grounded("BridgeSouthCoverWestWing", -87.35, 180.8, .8, 1.6, 6.4, "earthDark");
  Grounded("BridgeSouthCoverEastWing", -59.6, 181.2, .8, 1.6, 6, "earthDark");
  Grounded("BlastSafeEastReturn", -58.5, 201, .8, 1.55, 6, "earthDark");
  Box(blocks, "BridgeDemolitionStores", -89, 187, 2, .8, 1.4, "timber");
  // Earth skins over Layout's firing walls (BridgeSouthCoverWest -82.5,177.6 9×0.8, h 1.3;
  // BridgeSouthCoverEast -64.5,178.4; BlastSafeBank -66,197.5). Non-solid: the measured
  // parapets, their crouch cut and the five standing lines are unchanged.
  for (const [id, x, z, w, d, h] of [["BridgeSouthCoverWest", -82.5, 177.6, 9, .8, 1.3],
    ["BridgeSouthCoverEast", -64.5, 178.4, 9, .8, 1.45], ["BlastSafeBank", -66, 197.5, 7, .9, 1.35]]) {
    const top = groundAt(x, z) + h;
    Detail(`${id}EarthSkin`, x, z, w + .3, h + .5, d + .5, "earthDark", { y: top + .03 - (h + .5) / 2 });
    // Stepped earth on the shooter's side so the parapet reads as a heaped bank, not a slab.
    Detail(`${id}Shoulder`, x + .2, z + d / 2 + .45, w - .2, h * .62, .5, "earthDark",
      { y: groundAt(x, z + d / 2 + .45) + h * .31 - .05 });
    Detail(`${id}Apron`, x - .3, z + d / 2 + .85, w - .9, h * .3, .5, "earthDark",
      { y: groundAt(x, z + d / 2 + .85) + h * .15 - .05 });
    for (let i = 0; i < 4; i++) {
      const lx = x - w / 2 + 1 + i * (w - 2) / 3;
      Detail(`${id}Clod${i}`, lx, z - .1, .7 + (i % 2) * .4, .12 + (i % 3) * .05, .55, "earthDark",
        { y: top + .08 + (i % 3) * .025, ry: i * .7 });
    }
  }
  Rubble("BridgeBankStones", -90, 174.6, 8, 5, .6, .4);
  for (const [i, x, z, s] of [[0, -93.5, 175.4, 1.2], [1, -85.6, 175.9, .9], [2, -66, 176.6, 1.1], [3, -60.5, 177.1, .8]])
    Detail(`BridgeBankGrass${i}`, x, z, s, s * .6, s * .8, "foliage", { y: groundAt(x, z) + s * .3 });
  // Stone piers under the span (river floor to deck bottom 0.11 m), non-colliding details:
  // they stand under the deck, off every line of sight above it, and survive the demolition.
  for (const [side, z] of [["North", 148.6], ["South", 157.4]]) {
    const floor = groundAt(-77, z), top = .11;
    Detail(`RailBridgePier${side}`, -77, z, 3.4, top - floor + .3, 1.7, "structure", { y: (top + floor - .3) / 2 });
    Detail(`RailBridgePierCap${side}`, -77, z, 4.2, .3, 2.1, "structure", { y: top - .15 });
    Detail(`RailBridgePierCutwater${side}`, -77, z - .85, 1.2, top - floor - .4, 1.2, "structure",
      { y: (top - .4 + floor) / 2, ry: Math.PI / 4 });
  }

  // ---------------------------------------------------------------------------
  // 18_2 NightGate only: street houses, ammunition stacks, arch haunches, flag poles.
  // The 4 m barbican door / 3.8 m city gate and 9 m walls stay Layout's; the column walks x=-160.
  // ---------------------------------------------------------------------------
  const n = groundAt(-160, 334);
  function Night(id, x, z, w, h, d, semantic, base, extra = {}) {
    return Box(nightBlocks, id, x, z, w, h, d, semantic, { y: n + base + h / 2, ...extra });
  }
  Night("NightGateRoofLower", -160, 344, 20, .5, 13.4, "roof", 13.5);
  Night("NightGateRoofUpper", -160, 344, 15.5, .6, 10.2, "roof", 14);
  Night("NightGateRoofRidge", -160, 344, 12, .45, .55, "timber", 14.6);
  for (const [side, start, end] of [["West", -193, -164], ["East", -156, -129]]) {
    for (let x = start, i = 0; x <= end; x += 3.2, i++)
      Night(`NightCityMerlon${side}${i}`, x, 337.7, 1.6, 1.05, .8, "plaster", 9);
  }
  for (const [side, start, end] of [["West", -177, -164], ["East", -156, -143]]) {
    for (let x = start, i = 0; x <= end; x += 3.2, i++)
      Night(`NightBarbicanMerlon${side}${i}`, x, 320.2, 1.5, .85, .8, "plaster", 7);
  }
  // Arch haunches soften the square door heads (above 3.8 m; openings at ground unchanged).
  for (const [side, dx] of [["West", -1.62], ["East", 1.62]]) {
    Night(`NightBarbicanHaunch${side}`, -160 + dx, 322, .76, 1.2, 4, "plaster", 3.8);
    Night(`NightGateHaunch${side}`, -160 + dx * .95, 340, .72, 1.1, 5, "plaster", 4.5);
  }
  for (const [side, x] of [["West", -166.5], ["East", -153.5]]) {
    Night(`NightBarbicanFlagPole${side}`, x, 321, .12, 3.2, .12, "timber", 7);
    Night(`NightBarbicanFlag${side}`, x + .7, 321, 1.3, .9, .04, "canvas", 9.2, { solid: false });
    Night(`NightGateLantern${side}`, -160 + (side === "West" ? -2.6 : 2.6), 323.9, .34, .5, .34, "canvas", 4.2,
      { solid: false });
  }
  Night("NightSupplyShedRoof", -171, 349.5, 8, .22, 8, "roof", 3.05);
  for (const [i, x, z] of [[0, -174.5, 346], [1, -167.5, 346], [2, -174.5, 353]])
    Night(`NightSupplyShedPost${i}`, x, z, .25, 3.05, .25, "timber", 0);
  Night("NightSupplyCrates", -172.3, 351, 3, 1.1, 2.2, "timber", 0);
  Night("NightEastGuardRoom", -145, 350.5, 8, 3.1, 7, "plaster", 0);
  Night("NightEastGuardRoof", -145, 350.5, 8.8, .32, 7.8, "roof", 3.1);
  // Back row beyond the approach walls (x -172 / -148).
  Night("NightApproachHouseWest", -179, 307, 11, 3.5, 15, "plaster", 0);
  Night("NightApproachRoofWest", -179, 307, 12, .35, 16, "roof", 3.5);
  Night("NightApproachHouseEast", -140.5, 310, 13, 3.4, 12, "plaster", 0);
  Night("NightApproachRoofEast", -140.5, 310, 14, .35, 13, "roof", 3.4);
  // Front row fronting a 10 m street (faces x -165.2 / -155.0) between the approach walls.
  for (const [id, x, z, w, d, h] of [
    ["NightStreetHouseW0", -168.4, 299.2, 6.4, 8.6, 3.2], ["NightStreetHouseW1", -168.4, 309.6, 6.4, 9.6, 3.6],
    ["NightStreetHouseW2", -168.4, 317.4, 6.4, 4.2, 2.8],
    ["NightStreetHouseE0", -151.7, 298.7, 6.6, 8, 3.3], ["NightStreetHouseE1", -151.7, 308.8, 6.6, 9.4, 3],
    ["NightStreetHouseE2", -151.7, 317.1, 6.6, 4.6, 3.4]]) {
    Night(`${id}Body`, x, z, w, h, d, "plaster", 0);
    Gable(nightBlocks, id, x, z, w, d, h, { base: n, tiers: 3 });
    const face = x < -160 ? x + w / 2 + .05 : x - w / 2 - .05;
    Night(`${id}Door`, face, z, .1, 2.1, 1.1, "timber", 0, { solid: false });
  }
  // Ammunition stacks on the west side of the street (the marching right hand, as in 18_2;
  // east faces >= 1.2 m off the column's x -162 files).
  for (const [s, z, rows] of [[0, 298.2, 2], [1, 305.4, 3], [2, 313.2, 2]]) {
    for (let r = 0; r < rows; r++) for (let c = 0; c < 2; c++)
      Night(`NightAmmoStack${s}${r}${c}`, -164.2, z + c * .9 - .45, .84, .5, .66, "timber", r * .51);
  }
  Night("NightAmmoTarp", -164.4, 309.4, 1.3, 1.25, 2.4, "canvas", 0);
  for (let i = 0; i < 6; i++)
    Night(`NightStreetRubble${i}`, i % 2 ? -155.5 : -156.4, 296 + i * 4.1, .5 + (i % 3) * .15, .25, .45,
      "earthDark", 0, { solid: false, ry: i * .8 });
  return { replaceBlockIds, blocks, nightBlocks };
}
