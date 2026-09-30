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
// Rev 2026-09-28 guidance round (docs/Data_FirstLevelGuidance20260928.md §5 D; cameras G15_*…G18_*):
//   Layout's blue legend walls in 15–18 are re-emitted as plaster / stone / earth (RESKIN, same
//   geometry); a lantern pole marks the 15B square turn; a stone garden wall closes the lane exit's
//   forecourt so it opens only on the gatehouse; the yard's unused south gate is shut and barred,
//   the back door stands open (the ward flag pole was removed 2026-09-30, no source). Trodden paths live in the
//   terrain table (Data_FirstLevelWhiteboxTerrainRear.paths).
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
  // 2026-09-28 guidance round (docs/Data_FirstLevelGuidance20260928.md): Layout builds the compound,
  // lane and bank walls as blue `cover` legend walls; at 1/8 scale the blue was the loudest thing in
  // every 15–18 frame. Same pattern as the village RESKIN: re-emit each with Layout's own formula
  // (Wall / GroundedWall, same cover face, same id), only the semantic changes, so the doorways and
  // the lit yard read first. [id, x, z, w, h, d, grounded, semantic] with Layout's arguments.
  // Measured members (15B lane walls, gate piers, bridge parapets, north ridge) keep every number.
  const Door = (id, x, z, w, h, opening = 3.8) => {
    const side = (w - opening) / 2;
    return [[`${id}Left`, x - (w + opening) / 4, z, side, h, .6], [`${id}Right`, x + (w + opening) / 4, z, side, h, .6]];
  };
  const Room = (id, x, z, w, d, { south = true, north = true } = {}) => [
    ...(south ? Door(`${id}South`, x, z + d / 2, w, 2.9) : []), ...(north ? Door(`${id}North`, x, z - d / 2, w, 2.9) : []),
    ...(id === "ReceptionWard" ? [] : [[`${id}West`, x - w / 2, z, .6, 2.9, d]]),
    [`${id}EastFront`, x + w / 2, z - d * .36, .6, 2.9, d * .28], [`${id}EastBack`, x + w / 2, z + d * .36, .6, 2.9, d * .28],
    [`${id}WindowSill`, x + w / 2, z, .6, .82, d * .44]];
  const RESKIN = [
    ...[...Room("ReceptionWard", -26, 234, 14, 18, { south: false }), ...Room("ReceptionStreetRoom", -5, 229, 10, 14),
      ...Room("RearCourtyardHouse", 27, 232, 13, 12), ["ReceptionNorth", -22, 218, 37, 2.8, .7],
      ...Door("ReceptionSouth", -22, 252, 37, 2.8, 5),
      ["ReceptionWestNorth", -41, 229.75, .7, 2.8, 23.5], ["ReceptionWestSouth", -41, 249.25, .7, 2.8, 5.5]]
      .map((row) => [...row, false, "plaster"]),
    ...[["WallPathYardWall", 25, 209.5, 22, 2.8, .7], ["WallPathTurnWest", 13.25, 216.5, .7, 2.8, 10],
      ["ReceptionEastNorth", 2, 228, .7, 2.8, 20], ["ReceptionEastSouth", 2, 243.5, .7, 2.8, 3],
      ["BackyardWall", 21.5, 224, 7, 2.8, .7], ["RearWallSightBreak", 38, 199, 16, 2.8, 1],
      ["RearWallGapWest", 45, 184, 16, 2.8, .7], ["RearWallGapEast", 65, 184, 14, 2.8, .7],
      ["DrainSightBreak", 44, 160, 9, 2.8, 1]].map((row) => [...row, true, "plaster"]),
    ...[["WallPathLowWall", 27, 213, 18, 1.1, .7, true, "railBallast"],
      ["BridgeSouthCoverWest", -82.5, 177.6, 9, 1.3, .8, true, "earthDark"],
      ["BridgeSouthCoverEast", -64.5, 178.4, 9, 1.45, .8, true, "earthDark"],
      ["BlastSafeBank", -66, 197.5, 7, 1.35, .9, true, "earthDark"],
      ["BridgeNorthRidgeWest", -87, 132.2, 10, 1.45, 1.2, true, "earthDark"],
      ["BridgeNorthRidgeEast", -66, 132.2, 12, 1.45, 1.2, true, "earthDark"]],
  ];
  replaceBlockIds.push(...RESKIN.map(([id]) => id));
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
  // D pack 2026-09-30: window holes on the +x-local face of a wall made by Along() (timber frame with a dark
  // recess proud of the face). `at` = metres along the wall from its centre.
  function LaneWindows(id, wall, at, { w = .95, h = 1.05, y = 1.55 } = {}) {
    const c = Math.cos(wall.ry), s = Math.sin(wall.ry);
    for (const [i, t] of at.entries()) {
      for (const [k, off, thick, sw, sh, sem] of [["Frame", .3, .1, w + .3, h + .28, "timber"], ["Void", .34, .06, w, h, "void"]]) {
        const x = wall.x + t * s + off * c, z = wall.z + t * c - off * s;
        Detail(`${id}${k}${i}`, x, z, thick, sh, sw, sem, { y: groundAt(x, z) + y, ry: wall.ry });
      }
    }
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
  // Re-emit the reskinned Layout walls first (same geometry, Layout's grounding formula).
  for (const [id, x, z, w, h, d, grounded, semantic] of RESKIN) {
    const wall = Box(blocks, id, x, z, w, h, d, semantic, { cover: { faceX: 0, faceZ: -1 } });
    if (!grounded) continue;
    const top = wall.y + wall.h / 2;
    const base = Math.min(...[-1, 0, 1].flatMap(a => [-1, 0, 1].map(b => groundAt(x + a * w / 2, z + b * d / 2)))) - .1;
    wall.y = (top + base) / 2;
    wall.h = top - base;
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
  // Guidance 09-28: from the ditch floor the lane mouth is a narrow gap behind the low wall's end and
  // the turn's lantern pole is hidden by the outbuilding, so a signpost on the ramp top, just past
  // the yard wall's east end, points its board west down the lane (2 m clear of the ditch route end).
  {
    // Board along the lane's first leg (56,207)→(36,211): local x = (cos ry, -sin ry) = (0.98, -0.2).
    const x = 57.35, z = 209.4, g = groundAt(x, z), ry = Math.atan2(4, 20);
    Grounded("LaneMouthSignPost", x, z, .14, 2.35, .14, "timber");
    Detail("LaneMouthSignBoard", x - .6, z + .12, 1.25, .3, .05, "canvas", { y: g + 1.95, ry });
  }
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
  // D pack 2026-09-30, 15_3 (concept C "rally in the west ditch"): ruined houses on both lips of the
  // evacuation ditch south of the river (retreatB (56,184); floor x 54…58 at z 170…205, lips ~0.2 m).
  // East lip: a one-storey ruin with a doorway facing the ditch; west lip: a tall brick house wall with
  // two returns. Both keep >= 3 m off the ditch axis (x 56) and clear of the z=184 gap walls.
  // The wounded lying on the ditch floor are MISSION_PLACEMENT.groundStretchers RearDitchWounded*.
  // ---------------------------------------------------------------------------
  Grounded("RearDitchRuinENorth", 67.25, 188, 7.5, 2.7, .55, "plaster");
  Grounded("RearDitchRuinEEast", 71, 193.5, .55, 3, 11, "plaster");
  Grounded("RearDitchRuinESouth", 68, 198.5, 6, 1.5, .55, "plaster");
  Grounded("RearDitchRuinEWestA", 63.7, 189.7, .55, 2.5, 3.4, "plaster");
  Grounded("RearDitchRuinEWestB", 63.7, 196.9, .55, 1.2, 3.2, "plaster");
  Detail("RearDitchRuinEBeamA", 67.4, 190.6, 7.6, .22, .26, "timber", { y: groundAt(67.4, 190.6) + 2.55 });
  Detail("RearDitchRuinEBeamB", 67.2, 194.4, 6.4, .2, .24, "timber", { y: groundAt(67.2, 194.4) + 2.25, ry: .12 });
  Rubble("RearDitchRuinESpill", 65.8, 193.8, 10, 1.7, 3.6, .5);
  Grounded("RearDitchRuinWFront", 49.4, 192.4, .6, 4.2, 9.2, "plaster");
  Grounded("RearDitchRuinWNorth", 46.4, 187.6, 6.2, 3.4, .6, "plaster");
  Grounded("RearDitchRuinWSouth", 46.4, 197, 6.2, 2.0, .6, "plaster");
  Coping("RearDitchRuinWFront", 49.4, 192.4, 9.2, .6, 4.2);
  Rubble("RearDitchRuinWFoot", 51.2, 192.5, 9, .6, 4, .4, "railBallast", .7);
  for (const [i, z] of [190.2, 194.6].entries()) {
    Detail(`RearDitchRuinWWindowFrame${i}`, 49.94, z, .1, 1.3, 1.1, "timber", { y: groundAt(49.9, z) + 2.5 });
    Detail(`RearDitchRuinWWindowVoid${i}`, 50, z, .06, 1.0, .82, "void", { y: groundAt(49.9, z) + 2.5 });
  }
  // Slumped earth on the ditch's inner lip and a couple of sandbags at the east foot (non-solid).
  Rubble("RearDitchLipSpoilW", 52.6, 197, 8, .5, 5, .3, "earthDark", .9);
  Rubble("RearDitchLipSpoilE", 59.6, 196.5, 8, .5, 5, .3, "earthDark", .9);

  // ---------------------------------------------------------------------------
  // 15_1: after the square turn (route x=16 → (12,230) → gate)
  // ---------------------------------------------------------------------------
  // Left (east): stone wall with tile coping, 1.35 m, 1.65 m off the route centre; it joins
  // the low wall's west end and bends parallel to the (16,220)→(12,230) leg.
  // 2026-09-30 D pack, round 2 (integrator review of 15_1 / 15_4): the lane after the turn is a ~3.4 m path.
  // The stone wall moves 0.33 m toward the lane (x 17.65 → 17.325, inner face 17.05; Layout's WallPathTurnWest
  // face is 13.6, so 3.45 m clear), drops to 1.1 m (tile coping on top, you look over it) and the ground
  // outside it is cut 1.8 m (terrain LaneHollowEast). The bend follows the axis (15.55,221)→(10.75,231.5) that
  // both the wallPath and the evacuation line stay within ±0.8 m of, 1.7 m off it on each side.
  Grounded("RearLaneStoneWall", 17.325, 217.05, .55, 1.1, 8.7, "railBallast");
  Coping("RearLaneStoneWall", 17.325, 217.05, 8.7, .55, 1.1);
  // Fills the 0.4 m slot between this wall and the low wall's west end (x 18.0).
  Grounded("RearLaneStoneWallJoin", 17.8, 213, .5, 1.1, .7, "railBallast");
  {
    const wall = Along("RearLaneStoneWallBend", 17.325, 221.4, 12.6, 231.9, 0, 1.1, "railBallast", .55);
    Coping("RearLaneStoneWallBend", wall.x, wall.z, wall.d, .55, 1.1, wall.ry);
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
  // 2026-09-30 D pack: the garden wall becomes the lane's right-hand mud wall (2.5 m, tile coping, window
  // holes) so 15_1 / 15_4 read as "a 3 m mud wall on the right all the way to the gate".
  {
    // Round 2: continues Layout's WallPathTurnWest line (x 13.25) and stays 1.7 m off the lane axis
    // (was 2.3 m off the route); ends at (8.975,230.7), 3 m short of the x=6 walk.
    // Round 3: it now ends at z 226.2 (was 230.7): from the lane a sight line to the gate (2,240) crosses this
    // wall's inner face at z 227.4, so a longer wall hid everything of the gate below its roof; with the wall
    // ending here the gatehouse stands at the lane's far end in both 15_1 and 15_4.
    const wall = Along("RearLaneWestGardenWall", 13.25, 221.4, 11.05, 226.2, 0, 2.5, "plaster", .5);
    Coping("RearLaneWestGardenWall", wall.x, wall.z, wall.d, .5, 2.5, wall.ry);
    LaneWindows("RearLaneWestGardenWindow", wall, [-1.5, 1.1]);
  }
  // The same window holes on the lane face of Layout's WallPathTurnWest (x 13.25, its skin's east face x 13.7).
  for (const [i, z] of [214.2, 218.6].entries()) {
    const g = groundAt(13.7, z);
    Detail(`LaneTurnWindowFrame${i}`, 13.74, z, .1, 1.3, 1.05, "timber", { y: g + 1.62 });
    Detail(`LaneTurnWindowVoid${i}`, 13.8, z, .06, 1.0, .78, "void", { y: g + 1.62 });
  }
  // Guidance 09-28: a 6 m lantern pole on the inner (south-east) corner of the square turn. From
  // the ditch mouth and down the westward lane the end looks like a dead end at the mud house;
  // the pole stands over the low wall on the left exactly where the lane turns.
  {
    const x = 18.45, z = 213.85, g = groundAt(x, z);
    Grounded("LaneTurnLanternPole", x, z, .2, 6, .2, "timber");
    Detail("LaneTurnLanternArm", x - .6, z, 1.3, .1, .1, "timber", { y: g + 5.35 });
    Detail("LaneTurnLantern", x - 1.1, z, .4, .6, .4, "canvas", { y: g + 4.9 });
    Detail("LaneTurnLanternCap", x - 1.1, z, .5, .08, .5, "roof", { y: g + 5.24 });
    Detail("LaneTurnPennant", x + .05, z + .5, .04, .5, .9, "danger", { y: g + 5.55 });
  }
  // Chips along both wall feet inside the turn leg (x 13.7–14.2 / 16.95–17.35).
  Rubble("LaneTurnWestFoot", 13.95, 216.5, 6, .08, 4.3, .3, "railBallast", .6);
  Rubble("LaneTurnEastFoot", 16.85, 217, 5, .04, 3.6, .28, "railBallast", .5);
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
    Grounded(`ReceptionGatePier${side}`, 2, z, 1.05, 3.65, .8, "structure");
  // 2026-09-30 D pack: gatehouse 3.25 → 3.65 m to the eave, a deeper beam and a longer tiled roof (top ~4.3 m):
  // from the lane's far end (15_1 / 15_4) it must read as a roofed gate, not a gap in a wall.
  Box(blocks, "ReceptionGateBeam", 2, 240, 1.05, .85, 5.6, "timber",
    { y: groundAt(2, 240) + 2.8 + .425 });
  Gable(blocks, "ReceptionGateHouse", 2, 240, 2.8, 6.8, 3.63, { tiers: 3 });
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
  // D pack: a heaped brick pile against the wall north of the door (concept 15_2 right foreground), all <= 0.5 m
  // and non-solid, 1.4 m clear of the x=6 walk line.
  for (const [i, x, z, w, d, h, ry] of [[0, 3.7, 231.6, 1.5, .9, .32, .3], [1, 3.9, 232.5, 1.1, .8, .46, -.4],
    [2, 3.6, 230.7, .9, .7, .26, .9], [3, 4.4, 233.6, .8, .6, .2, .1], [4, 3.5, 235.8, 1.2, .8, .34, .6]])
    Detail(`ReceptionGateBrickPile${i}`, x, z, w, h, d, "railBallast", { y: groundAt(x, z) + h / 2 - .02, ry });
  Rubble("ReceptionForecourt", 8.2, 226.5, 8, 1.6, 2.4, .3, "earthDark");
  Detail("ReceptionGateBrokenCart", 11.3, 234.4, 2.8, .55, 1.2, "timber",
    { y: groundAt(11.3, 234.4) + .32, ry: -.5 });
  // Guidance 09-28: the lane's exit opened on the left onto one field running south-east to the
  // horizon (G15_3). A 1.15 m stone garden wall carries on from the lane's stone bend (14.3,229.7)
  // south to z 247 and back west to the south-east outhouse, so the forecourt's only way on is the
  // gatehouse. Clear of wallPath, the evacuation queue (9,233)→(9,240), the x=6 walk, the runner.
  for (const [id, x, z, w, d] of [["RearForecourtEastWall", 14.55, 238.5, .5, 17.1],
    ["RearForecourtSouthWall", 8.2, 247.2, 13.2, .5]]) {
    Grounded(id, x, z, w, 1.15, d, "railBallast");
    Coping(id, x, z, Math.max(w, d), .5, 1.15, w > d ? Math.PI / 2 : 0);
  }
  Rubble("RearForecourtEastFoot", 13.9, 239.5, 7, .12, 6.5, .32, "railBallast", .6);
  Detail("RearForecourtCartWheel", 13.95, 244.2, .16, 1.2, 1.2, "timber",
    { y: groundAt(13.95, 244.2) + .6, ry: .15 });

  // ---------------------------------------------------------------------------
  // 16–17: the ward, split into a south treatment bay and a north litter bay
  // ---------------------------------------------------------------------------
  {
    const wall = (id, x, z, w, h, d) =>
      Box(blocks, id, x, z, w, h, d, "plaster", { cover: { faceX: 0, faceZ: -1 } });
    // D pack 2026-09-30: a run of wall along x (alongX) or z with paper-window holes cut in
    // (sill 0.95 m, head from 2.3 m). windows = [[centre, width], …] sorted along the run.
    const WallRun = (id, alongX, fixed, start, end, windows, thick = .6) => {
      const put = (sid, a, b, h, y0, semantic, cover) => {
        if (b - a < .05) return;
        const c = (a + b) / 2, x = alongX ? c : fixed, z = alongX ? fixed : c;
        Box(blocks, `${id}${sid}`, x, z, alongX ? b - a : thick, h, alongX ? thick : b - a, semantic,
          { y: groundAt(x, z) + y0 + h / 2, ...(cover ? { cover: { faceX: 0, faceZ: -1 } } : {}) });
      };
      let cursor = start;
      windows.forEach(([c, w], i) => {
        put(`Pier${i}`, cursor, c - w / 2, 2.9, 0, "plaster", true);
        put(`Sill${i}`, c - w / 2, c + w / 2, .95, 0, "plaster", true);
        put(`Head${i}`, c - w / 2, c + w / 2, .6, 2.3, "structure", false);
        cursor = c + w / 2;
      });
      put("PierEnd", cursor, end, 2.9, 0, "plaster", true);
    };
    // Paper window on a wall face: frame bars, a cross of muntins and a pale paper panel on the wall's
    // centre plane. face = interior side offset from the wall axis (signed, along the wall's normal).
    const PaperWindow = (id, alongX, fixed, c, w, { h = 1.35, sill = .95, face = 0 } = {}) => {
      const P = (sid, a, y, sw, sh, sd, sem = "timber") => {
        const x = alongX ? a : fixed + face, z = alongX ? fixed + face : a;
        Detail(`${id}${sid}`, x, z, alongX ? sw : sd, sh, alongX ? sd : sw, sem, { y: groundAt(x, z) + y });
      };
      P("Paper", c, sill + h / 2, w - .1, h - .1, .03, "canvas");
      P("Top", c, sill + h - .04, w, .08, .07); P("Bottom", c, sill + .04, w, .08, .07);
      P("Left", c - w / 2 + .04, sill + h / 2, .08, h, .07); P("Right", c + w / 2 - .04, sill + h / 2, .08, h, .07);
      P("MuntinV", c, sill + h / 2, .05, h, .05);
      for (const [i, f] of [1 / 3, 2 / 3].entries()) P(`MuntinH${i}`, c, sill + h * f, w, .05, .05);
    };
    // South wall (z 243): two paper windows either side of the 2.8 m door (door jambs x -27.4 / -24.6).
    // Round 2: the south wall is 0.4 m thick (was 0.6) and the old 0.7 m deep door posts are gone, so the door
    // no longer reads as a tunnel from outside; Layout's 0.7 m WardThreshold now sticks out as a stone sill.
    WallRun("ReceptionWardSouthWest", true, 243, -33, -27.4, [[-30.7, 1.6]], .4);
    WallRun("ReceptionWardSouthEast", true, 243, -24.6, -19, [[-21.6, 1.6]], .4);
    PaperWindow("ReceptionWardSouthWinW", true, 243, -30.7, 1.6, { face: -.23 });
    PaperWindow("ReceptionWardSouthWinE", true, 243, -21.6, 1.6, { face: -.23 });
    Box(blocks, "ReceptionWardSouthDoorHead", -26, 243, 2.8, .5, .4, "structure",
      { y: groundAt(-26, 243) + 2.65 });
    // West wall with a window into the treatment bay (opening z 238.9…240.9, 0.95…2.3 m).
    // D pack: two more paper windows in the north bay's west wall (z 225…238.9 run).
    WallRun("ReceptionWardWestNorth", false, -33, 225, 238.9, [[228.8, 1.6], [233.8, 1.6]]);
    for (const [i, z] of [228.8, 233.8].entries()) PaperWindow(`ReceptionWardWestWin${i}`, false, -33, z, 1.6, { face: .3 });
    PaperWindow("ReceptionWardWestWinS", false, -33, 239.9, 2, { face: .3 });
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
    // D pack 2026-09-30, round 2 (integrator: "the ward is still one big empty hall"): every wall gets its
    // own row of things (2-3+ per wall: beds, benches, crate stacks, shelves, vats, hanging clothes), the
    // middle keeps only the litter corridor. Stay out of: the litter slots (x -30…-23.4, z 229 / 232.8) and
    // their bearers (z 227.3…234.5), x -29.6…-23.3 at z 238…243 (bay opening, door, wardEntry (-26,240)),
    // the surgeon spots (-27.4,241.2) (-27.1,240.6) (-26.6,241.6), zhouPlaced (-26,239.4), Yaowa (-23.1,241.5).
    // Interior wall faces: north z 225.3, west x -32.7, east x -19.3, south z 242.8, bay z 237.85 / 238.15.
    {
      const fl = (x, z) => groundAt(x, z);
      const Vat = (id, x, z, h = .7) => {
        Box(blocks, id, x, z, .62, h, .62, "earthDark");
        Detail(`${id}Rim`, x, z, .7, .06, .7, "earthDark", { y: fl(x, z) + h + .03 });
      };
      // rows of supply crates, stacked; turn = long side along z (for east / west walls)
      const Crates = (id, x, z, rows, turn = false, cols = 1) => {
        for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
          const cx = turn ? x : x + c * .9, cz = turn ? z + c * .9 : z;
          Box(blocks, `${id}${c}${r}`, cx, cz, .84, .5, .66, "timber",
            { y: fl(cx, cz) + .25 + r * .51, ...(turn ? { ry: Math.PI / 2 } : {}) });
        }
      };
      // bench: one solid seat block 0.45 m high; alongX = long side along x
      const Bench = (id, x, z, len, alongX = false) =>
        Box(blocks, id, x, z, alongX ? len : .4, .45, alongX ? .4 : len, "timber");
      // medicine shelf on a wall (face = +1 / -1 along z: the side the boards face), 1.9 m high, 0.5 m deep
      const Shelf = (id, x, z, w, face) => {
        Box(blocks, id, x, z, w, 1.9, .5, "timber");
        for (const [i, y] of [.55, 1.05, 1.55].entries()) {
          Detail(`${id}Board${i}`, x, z + face * .27, w, .04, .12, "timber", { y: fl(x, z) + y });
          Detail(`${id}Jars${i}`, x + (i - 1) * .5, z + face * .27, Math.max(.4, w * .4 - i * .15), .22, .1, "canvas",
            { y: fl(x, z) + y + .13 });
        }
      };
      // hanging clothes / blankets / bandoliers on a wall face (non-solid panels 0.5 x 1.0, hung at 1.3 m)
      const Hang = (id, x, z, alongX, count, step = .7) => {
        for (let i = 0; i < count; i++) {
          const a = i * step, px = alongX ? x + a : x, pz = alongX ? z : z + a;
          Detail(`${id}${i}`, px, pz, alongX ? .5 : .06, 1.0 - (i % 2) * .25, alongX ? .06 : .5, i % 2 ? "canvas" : "earthDark",
            { y: fl(px, pz) + 1.75 - (i % 2) * .12 });
        }
      };
      // -- north wall (z 225.3): vat, crates, a cabinet + crates that close the (unused) north door, shelf ---
      Vat("ReceptionWardVatN", -30.9, 225.75);
      Crates("ReceptionWardCrateN0", -29.15, 225.75, 2);
      Crates("ReceptionWardCrateN1", -27.45, 225.75, 2);
      Box(blocks, "ReceptionWardNorthCabinet", -26, 225.6, 2, 2.0, .55, "timber");
      Detail("ReceptionWardNorthCabinetDoors", -26, 225.9, 1.9, 1.8, .04, "timber", { y: fl(-26, 225.9) + 1.05 });
      Crates("ReceptionWardCrateN2", -24.55, 225.75, 2);
      Shelf("ReceptionWardShelfN", -21.9, 225.6, 2.2, 1);
      Hang("ReceptionWardHangN", -32.2, 225.34, true, 4, .6);
      // -- west wall (x -32.7): 2 cots + a stretcher already; bench, vat, clothes over the cots --
      Bench("ReceptionWardBenchW", -32.45, 236.5, 1.6);
      Vat("ReceptionWardVatW", -32.35, 232.45);
      Hang("ReceptionWardHangW0", -32.66, 226.6, false, 3, .55);
      Hang("ReceptionWardHangW1", -32.66, 235.6, false, 2, .6);
      // -- east wall (x -19.3): cot NE already; along the sill of the east opening, clothes over the cot --
      Bench("ReceptionWardBenchE", -19.85, 231.4, 1.8);
      Crates("ReceptionWardCrateE", -19.8, 233.4, 2, true);
      Vat("ReceptionWardVatE", -19.75, 235.4);
      Hang("ReceptionWardHangE0", -19.34, 226.7, false, 3, .55);
      // -- bay wall, north face (z 237.85): a shelf on the west block, crates and a vat on the east one --
      Shelf("ReceptionWardShelfB", -31.2, 237.6, 2.2, -1);
      Crates("ReceptionWardCrateB", -23.2, 237.5, 2, false, 2);
      Vat("ReceptionWardVatB", -20.75, 237.5);
      // -- south bay -----------------------------------------------------------------------------------
      // west corner: medicine table with bottles, crates under the window, a stool
      Box(blocks, "ReceptionWardMedicineTable", -32.15, 238.62, .9, .78, .6, "timber");
      for (const [i, dx, h] of [[0, -.3, .2], [1, -.08, .14], [2, .16, .24], [3, .32, .12]])
        Detail(`ReceptionWardMedicineJar${i}`, -32.15 + dx, 238.62, .09, h, .09, i % 2 ? "earthDark" : "canvas",
          { y: fl(-32.15, 238.62) + .78 + h / 2 });
      Crates("ReceptionWardCrate", -32.15, 242.3, 2, false, 2);
      Box(blocks, "ReceptionWardCrate02", -32.15, 242.3, .84, .5, .66, "timber", { y: fl(-32.15, 242.3) + .25 + 2 * .51 });
      Detail("ReceptionWardCrateTarp", -31.2, 242.3, 1.0, .06, .7, "canvas", { y: fl(-31.2, 242.3) + 1.02 + .03 });
      Detail("ReceptionWardStool", -29.9, 241.7, .36, .42, .36, "timber", { y: fl(-29.9, 241.7) + .21 });
      // right of the door (west): a table with medicine jars and a lit hand lantern (16_3, door on the left)
      Box(blocks, "ReceptionWardLanternTable", -28.6, 242.35, 1.0, .78, .6, "timber");
      for (const [i, dx, h] of [[0, -.32, .2], [1, -.16, .14], [2, .32, .22]])
        Detail(`ReceptionWardLanternTableJar${i}`, -28.6 + dx, 242.35, .09, h, .09, i % 2 ? "earthDark" : "canvas",
          { y: fl(-28.6, 242.35) + .78 + h / 2 });
      Detail("ReceptionWardTableLamp", -28.5, 242.3, .2, .34, .2, "metal", { y: fl(-28.5, 242.3) + .78 + .17 });
      Detail("ReceptionWardTableLampGlass", -28.5, 242.3, .14, .24, .14, "canvas", { y: fl(-28.5, 242.3) + .78 + .17 });
      // left of the door (east): a straw bed on the floor (frame, straw, blanket, pillow), 16_3's lower left
      {
        const bx = -23.9, bz = 241.6, g = fl(bx, bz);
        for (const [i, dx, dz, w, d] of [[0, 0, -.7, 2.4, .1], [1, 0, .7, 2.4, .1], [2, -1.25, 0, .1, 1.5], [3, 1.25, 0, .1, 1.5]])
          Detail(`ReceptionWardStrawBedFrame${i}`, bx + dx, bz + dz, w, .18, d, "timber", { y: g + .09 });
        Detail("ReceptionWardStrawBedThatch", bx, bz, 2.3, .14, 1.3, "thatch", { y: g + .07 });
        Detail("ReceptionWardStrawBedBlanket", bx + .3, bz, 1.2, .07, 1.05, "canvas", { y: g + .175, ry: .06 });
        Detail("ReceptionWardStrawBedPillow", bx - .9, bz, .4, .1, .8, "canvas", { y: g + .19 });
      }
      // south wall, east half: bench, vat and crates under / beside the window; east wall: crates, clothes
      Bench("ReceptionWardBenchS", -22.5, 242.55, 1.7, true);
      Vat("ReceptionWardVatS", -20.95, 242.35);
      Crates("ReceptionWardCrateSE", -19.8, 242.2, 2, true);
      Hang("ReceptionWardHangE1", -19.34, 241.0, false, 2, .6);
      Hang("ReceptionWardHangS", -24.3, 242.76, true, 3, .6);
    }
    // Straw: big continuous thin mats (0.05 m), never scattered bits: under both litter rows, the cots and the
    // stretchers lying in the strips beside them.
    // (round 3: the two 8.6 m carpets read as a white floor in the grid; now three 6.9 m runners, one under each litter column.)
    for (const [id, x, z, w, d] of [["RunnerW", -30, 231, 1.7, 6.9], ["RunnerC", -26.7, 231, 1.7, 6.9],
      ["RunnerE", -23.4, 231, 1.7, 6.9], ["CotNW", -31.9, 227.2, 1.5, 2.6],
      ["CotMW", -31.9, 234.1, 1.5, 2.6], ["CotNE", -20.1, 227.2, 1.5, 2.6], ["CotW", -31.8, 240, 1.6, 2.6],
      ["CotE", -20.05, 239.95, 1.6, 2.6], ["WestStretcher", -31.9, 230.7, 1.4, 2.8], ["EastStretcherA", -21.9, 230.5, 1.4, 2.8],
      ["EastStretcherB", -21.9, 234.7, 1.4, 2.8]])
      Detail(`ReceptionWardStrawThatchMat${id}`, x, z, w, .05, d, "thatch", { y: groundAt(x, z) + .025 });
    // North bay: cots against the walls, clear of the six litter slots and their bearers.
    Cot("ReceptionWardCotNorthWest", -31.9, 227.2, true);
    Cot("ReceptionWardCotMiddleWest", -31.9, 234.1, false);
    Cot("ReceptionWardCotNorthEast", -20.1, 227.2, true);
    // A hanging curtain in the north door keeps the bay dim (nothing routes through that door).
    Detail("ReceptionWardNorthCurtain", -26, 225.36, 3.7, 2.3, .05, "canvas", { y: groundAt(-26, 225.4) + 1.2 });
    // Closed tiled roof over both bays (soffit 2.9 m) and ceiling beams.
    Gable(blocks, "ReceptionWard", -26, 234, 14, 18, 2.9, { tiers: 5 });
    // D pack 2026-09-30 (concept 16_4 / 17_x "露梁"): tie beams 0.36 m deep hanging under the roof stack
    // (bottom 2.54 m; walk graph ignores h <= 0.55, capsule and 1.9 m route ceiling never touch them),
    // seven of them, and five purlins along z hung under those (bottom 2.38 m), so the ceiling reads as
    // a timber frame instead of one flat soffit. Lamps hang from the beam/purlin crossings.
    const wardG = groundAt(-26, 234);
    for (const [i, z] of [227, 231, 235, 240.4, 225.7, 229, 233, 242.2].entries())
      Box(blocks, `ReceptionWardCeilingBeam${i}`, -26, z, 13.6, .36, .3, "timber",
        { y: wardG + 2.72 });
    for (const [i, x] of [-31.5, -28.75, -26, -23.25, -20.5].entries())
      Detail(`ReceptionWardPurlin${i}`, x, 234, .16, .16, 17.4, "timber", { y: wardG + 2.46 });
    for (const [i, x, z] of [[0, -28.75, 231], [1, -23.25, 235], [2, -26, 240.4], [3, -31.5, 240.4],
      [4, -20.5, 240.4], [5, -23.25, 227], [6, -28.75, 227]]) {
      // Round 2: the lamp body hangs at 2.0…2.34 m (was 1.9…2.2 and read as a small block up on the ceiling),
      // a big lantern (0.3 x 0.34) with a lit glass core and a cap, on a short hook off the purlin.
      Detail(`ReceptionWardLampRope${i}`, x, z, .03, .08, .03, "metal", { y: wardG + 2.34 });
      Detail(`ReceptionWardLamp${i}`, x, z, .3, .34, .3, "metal", { y: wardG + 2.17 });
      Detail(`ReceptionWardLampGlass${i}`, x, z, .22, .26, .22, "canvas", { y: wardG + 2.17 });
      Detail(`ReceptionWardLampCap${i}`, x, z, .38, .05, .38, "roof", { y: wardG + 2.365 });
    }
    // Porch along the south front: eave and posts, the wide open bay east of the door.
    Box(blocks, "ReceptionWardPorchRoof", -26, 244.2, 14.8, .18, 2.6, "roof",
      { y: groundAt(-26, 234) + 2.8 });
    Detail("ReceptionWardPorchBeam", -26, 245.1, 13, .2, .2, "timber", { y: groundAt(-26, 245.1) + 2.6 });
    // D pack 2026-09-30 (concept 16_3 / 17_4 "高门槛 + 门前石阶"): a timber sill board on the 0.15 m
    // threshold (visual only: the solid stays Layout's WardThreshold, 0.12–0.18 m SpaceTest口径), two
    // low stone steps down the porch in front of the door, and a stone porch strip along the front.
    {
      const tg = groundAt(-26, 243);
      // Round 2: a thicker timber sill board (0.12 m on the 0.15 m solid) so the threshold reads as a step.
      Detail("ReceptionWardThresholdBoard", -26, 243, 2.8, .12, .36, "timber", { y: tg + .15 + .06 });
      Detail("ReceptionWardPorchStep0", -26, 243.75, 3.4, .09, .55, "step", { y: groundAt(-26, 243.75) + .045 });
      Detail("ReceptionWardPorchStep1", -26, 244.3, 3.6, .05, .55, "step", { y: groundAt(-26, 244.3) + .025 });
      Detail("ReceptionWardPorchStrip", -26, 244.2, 14.4, .04, 2.3, "step", { y: groundAt(-26, 244.2) + .02 });
      // Round 2: a slim timber door frame (two 0.2 m posts and ONE lintel beam, only 0.05 m proud of the 0.4 m wall,
      // inside the wall's own x range so the 2.8 m opening is untouched) and two door leaves swung fully open and
      // laid flat against the outside face of the wall (no deep boxes, no tunnel look from the porch).
      for (const [side, x, lx] of [["West", -27.5, -28.1], ["East", -24.5, -23.3]]) {
        Detail(`ReceptionWardDoorFrame${side}`, x, 243, .2, 2.4, .5, "timber", { y: tg + 1.2 });
        Detail(`ReceptionWardDoorLeaf${side}`, lx, 243.28, 1.4, 2.3, .07, "timber", { y: tg + 1.15 });
      }
      Detail("ReceptionWardDoorFrameHead", -26, 243, 3.0, .24, .5, "timber", { y: tg + 2.52 });
    }
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
  // Guidance 09-28 (16–18: which door). The yard had three open doors: the ward's south door (16
  // goal), the 5 m south gate in ReceptionSouth (x -24.5…-19.5, straight across from the ward door,
  // no route uses it) and the 5 m back door in the west wall (18 goal). The south gate is shut and
  // barred; the back door's leaves stand swung open against the outer face; the ward flies a red-cross
  // flag at its south-east corner, seen over the yard from the gate.
  for (const [side, x] of [["West", -23.24], ["East", -20.76]])
    Box(blocks, `ReceptionSouthGateLeaf${side}`, x, 252, 2.46, 2.3, .12, "timber");
  Detail("ReceptionSouthGateBar", -22, 251.87, 4.9, .16, .12, "timber", { y: groundAt(-22, 251.9) + 1.25 });
  for (const [i, dx] of [-1.8, -.6, .6, 1.8].entries())
    Detail(`ReceptionSouthGateBatten${i}`, -22 + dx, 251.9, .14, 2.1, .06, "timber",
      { y: groundAt(-22 + dx, 251.9) + 1.15 });
  for (const [side, z] of [["North", 240.25], ["South", 247.75]])
    Detail(`ReceptionRearDoorLeaf${side}`, -41.46, z, .08, 2.3, 2.38, "timber", { y: groundAt(-41.46, z) + 1.17 });
  // 2026-09-30: the ward's red-cross flag pole (east wall, (-18.35,242.8)) was removed — no historical source for it.
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
  // The rail bridge is a single-span truss now (Model_RailBridge, docs/Data_RailBridge.md):
  // no river piers. The old non-colliding pier details were removed with the whitebox look.

  // ---------------------------------------------------------------------------
  // 18_2 NightGate only: street houses, ammunition stacks, arch haunches, flag poles.
  // The 4 m barbican door / 3.8 m city gate and 9 m walls stay Layout's; the column walks x=-160.
  // ---------------------------------------------------------------------------
  const n = groundAt(-160, 334);
  function Night(id, x, z, w, h, d, semantic, base, extra = {}) {
    return Box(nightBlocks, id, x, z, w, h, d, semantic, { y: n + base + h / 2, ...extra });
  }
  // D pack 2026-09-30 (concept 18_2 / 18_4): the gate tower becomes a two-storey pavilion with two tiled
  // eaves (top 18.75 m above the wall base) so it reads as a silhouette from a long way off, the city
  // wall runs on past the Layout ends (x -205...-195 and -128...-104, same 9 m, inside MISSION_BOUNDS), and
  // the gates get real stepped arches instead of two small haunches.
  Night("NightGateRoofLower", -160, 344, 20, .5, 13.4, "roof", 13.5);
  Night("NightGateRoofLower2", -160, 344, 16.6, .35, 11.4, "roof", 14);
  Night("NightGateStorey", -160, 344.5, 11.4, 3.3, 7.4, "timber", 14.35);
  for (const [i, x] of [-163.6, -160, -156.4].entries()) {
    Night(`NightGateStoreyWindowFrame${i}`, x, 340.72, 1.5, 1.5, .1, "timber", 14.9, { solid: false });
    Night(`NightGateStoreyWindowVoid${i}`, x, 340.66, 1.1, 1.1, .06, "void", 15.1, { solid: false });
  }
  Night("NightGateRoofUpper", -160, 344.5, 15.6, .5, 10.6, "roof", 17.65);
  Night("NightGateRoofUpper2", -160, 344.5, 12.6, .45, 8, "roof", 18.15);
  Night("NightGateRoofRidge", -160, 344.5, 9.6, .4, .55, "timber", 18.6);
  Night("NightWallFarWest", -199.9, 340, 9.8, 9, 5, "plaster", 0);
  Night("NightWallFarEast", -116, 340, 24, 9, 5, "plaster", 0);
  for (const [side, start, end] of [["West", -204, -164], ["East", -156, -105]]) {
    for (let x = start, i = 0; x <= end; x += 3.2, i++)
      Night(`NightCityMerlon${side}${i}`, x, 337.7, 1.6, 1.05, .8, "plaster", 9);
  }
  for (const [side, start, end] of [["West", -177, -164], ["East", -156, -143]]) {
    for (let x = start, i = 0; x <= end; x += 3.2, i++)
      Night(`NightBarbicanMerlon${side}${i}`, x, 320.2, 1.5, .85, .8, "plaster", 7);
  }
  // Stepped arches (semicircle of radius halfW springing at `spring`): each layer fills the corner between
  // the jamb and the circle, so the visible opening narrows toward the crown; the crown meets Layout's
  // lintel bottom (barbican 4 m door: 3.0 + 2.0 = 5.0; city gate 3.8 m: 3.7 + 1.9 = 5.6). All above 3 m,
  // so the ground-level openings (4.0 / 3.8) and head clearance are untouched.
  function Arch(prefix, cz, zThick, halfW, spring, layers = 6) {
    const dh = halfW / layers;
    for (const [side, s] of [["West", -1], ["East", 1]])
      for (let k = 0; k < layers; k++) {
        const dy = (k + .5) * dh, p = halfW - Math.sqrt(Math.max(halfW * halfW - dy * dy, 0));
        if (p < .06) continue;
        Night(`${prefix}${side}${k}`, -160 + s * (halfW - p / 2), cz, p, dh, zThick, "plaster", spring + k * dh);
      }
  }
  Arch("NightBarbicanHaunch", 322, 4, 2, 3.0);
  Arch("NightGateHaunch", 340, 5, 1.9, 3.7);
  // Paper lanterns: a bracket arm, the lantern and its cap (all non-solid).
  function Lantern(id, x, z, y0, arm = 0) {
    Night(`${id}Body`, x, z, .42, .58, .42, "canvas", y0, { solid: false });
    Night(`${id}Cap`, x, z, .54, .07, .54, "roof", y0 + .58, { solid: false });
    if (arm) Night(`${id}Arm`, x, z + arm / 2, .1, .1, Math.abs(arm) + .2, "timber", y0 + .65, { solid: false });
  }
  for (const [i, x] of [-163.7, -156.3].entries()) {
    Lantern(`NightBarbicanLantern${i}`, x, 317.4, 3.1, .55);
    Lantern(`NightGateFaceLantern${i}`, x, 336.9, 3.3, .6);
  }
  Lantern("NightGateArchLantern", -160, 339.4, 4.4);
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
    ["NightStreetHouseW1", -168.4, 309.6, 6.4, 9.6, 3.6],
    ["NightStreetHouseW2", -168.4, 317.4, 6.4, 4.2, 2.8],
    ["NightStreetHouseE1", -151.7, 308.8, 6.6, 9.4, 3],
    ["NightStreetHouseE2", -151.7, 317.1, 6.6, 4.6, 3.4]]) {
    Night(`${id}Body`, x, z, w, h, d, "plaster", 0);
    Gable(nightBlocks, id, x, z, w, d, h, { base: n, tiers: 3 });
    const face = x < -160 ? x + w / 2 + .05 : x - w / 2 - .05;
    Night(`${id}Door`, face, z, .1, 2.1, 1.1, "timber", 0, { solid: false });
    // D pack: a lantern beside each door, on a bracket over the street.
    Lantern(`${id}Lantern`, face + (x < -160 ? .42 : -.42), z - 1.15, 1.95);
  }
  // Ammunition stacks on the west side of the street (the marching right hand, as in 18_2;
  // east faces >= 1.2 m off the column's x -162 files).
  for (const [s, z, rows] of [[0, 298.2, 2], [1, 305.4, 3], [2, 313.2, 2]]) {
    for (let r = 0; r < rows; r++) for (let c = 0; c < 2; c++)
      Night(`NightAmmoStack${s}${r}${c}`, -164.2, z + c * .9 - .45, .84, .5, .66, "timber", r * .51);
  }
  Night("NightAmmoTarp", -164.4, 309.4, 1.3, 1.25, 2.4, "canvas", 0);
  // D pack: a handcart with a tarped load and a tarped crate pile on the east (left-hand) side; both stay
  // >= 1.5 m off the column's x -158.2 file and off the -160 gate axis.
  Night("NightHandcartBed", -155.6, 302.6, 1.0, .12, 2.0, "timber", .55, { solid: false });
  Night("NightHandcartLoad", -155.6, 302.4, .9, .5, 1.5, "canvas", .67, { solid: false });
  for (const [i, dz] of [-.7, .7].entries())
    Night(`NightHandcartWheel${i}`, -156.15, 302.6 + dz, .08, .8, .8, "timber", 0, { solid: false });
  Night("NightEastCrates", -156.3, 313.6, 1.5, 1.0, 1.1, "timber", 0);
  Night("NightEastCratesTarp", -156.3, 313.6, 1.7, .12, 1.3, "canvas", 1.0, { solid: false });
  for (let i = 0; i < 6; i++)
    Night(`NightStreetRubble${i}`, i % 2 ? -155.5 : -156.4, 296 + i * 4.1, .5 + (i % 3) * .15, .25, .45,
      "earthDark", 0, { solid: false, ry: i * .8 });
  return { replaceBlockIds, blocks, nightBlocks };
}
