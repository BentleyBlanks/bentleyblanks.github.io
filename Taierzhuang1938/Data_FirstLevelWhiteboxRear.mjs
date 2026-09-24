// First-level whitebox, Notion adopted spatial topology 2026-09-24, stages 15–18.
// Concept references visually inspected: Stage_15.png / Stage_15_B.png (wall lane /
// ordinary reception yard), Stage_16.png / Stage_16_B.png and Stage_17.png /
// Stage_17_B.png (roofed side room with continuing reception), Stage_18.png / Stage_18_B.png
// (south-bank cover / north-gate night march). The topology text takes precedence
// over image scale. All frozen anchors, litter routes and bridge sightlines stay put.
// Pure BuildSink geometry: roofs are real overhead solids; no new actor or story logic.

export function BuildRearWhitebox(groundAt) {
  const blocks = [], nightBlocks = [];
  const replaceBlockIds = ["ReceptionWardRoof", "ReceptionStreetRoomRoof", "RearCourtyardHouseRoof"];
  function Box(list, id, x, z, w, h, d, semantic = "plaster", extra = {}) {
    const block = { id, x, z, w, h, d, y: groundAt(x, z) + h / 2,
      semantic, tag: "whiteboxWall", ...extra };
    list.push(block);
    return block;
  }
  function Grounded(id, x, z, w, h, d, semantic = "plaster", ry = 0) {
    const c = Math.cos(ry), s = Math.sin(ry);
    const base = Math.min(...[-1, 0, 1].flatMap(a => [-1, 0, 1].map(b =>
      groundAt(x + a * w / 2 * c + b * d / 2 * s,
        z - a * w / 2 * s + b * d / 2 * c)))) - .1;
    const top = groundAt(x, z) + h;
    return Box(blocks, id, x, z, w, top - base, d, semantic, { y: (top + base) / 2, ry });
  }
  function Along(id, ax, az, bx, bz, offset, h, semantic) {
    const length = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
    return Grounded(id, (ax + bx) / 2 + (bz - az) / length * offset,
      (az + bz) / 2 - (bx - ax) / length * offset, .65, h, length + .5, semantic, ry);
  }
  function Roof(id, x, z, w, d, top = 3.12) {
    const y = groundAt(x, z);
    Box(blocks, `${id}Roof`, x, z, w + .8, .24, d + .8, "roof", { y: y + top });
    Box(blocks, `${id}RoofUpper`, x, z, w * .66, .32, d + .25, "roof", { y: y + top + .28 });
    Box(blocks, `${id}Ridge`, x, z, .4, .28, d + .4, "timber", { y: y + top + .58 });
    for (const side of [-1, 1]) Box(blocks, `${id}Eave${side < 0 ? "West" : "East"}`,
      x + side * (w / 2 + .2), z, .22, .32, d + 1, "timber", { y: y + top - .12 });
  }

  // The western ditch rises into a wall-side route. The missing diagonal shoulder
  // used to leave the final twenty metres in open ground. These two walls join the
  // existing 2.8 m lane without changing its route or placing a barrier across it.
  Along("RearLaneDiagonalYardWall", 55.5, 207.1, 36, 211, 1.72, 2.8, "plaster");
  Along("RearLaneDiagonalLowWall", 54, 207.4, 37, 210.8, -1.82, 1.05, "earthDark");
  // A short return wall makes the receiving yard appear after the final turn.
  // Its east face stays clear of both the scripted litter route and the leader path.
  Grounded("RearLaneTurnReturn", 19.8, 217, .7, 2.6, 7);
  // Ordinary courtyard rooflines sit behind the lane wall, away from the walking lane.
  Grounded("RearLaneOutbuildingWest", 31, 200, .6, 2.7, 10);
  Grounded("RearLaneOutbuildingEast", 41, 200, .6, 2.7, 10);
  Grounded("RearLaneOutbuildingNorth", 36, 195, 10, 2.7, .6);
  Grounded("RearLaneOutbuildingSouth", 36, 205, 10, 2.7, .6);
  Roof("RearLaneOutbuilding", 36, 200, 10, 10, 2.94);
  Roof("RearCourtyardHouse", 27, 232, 13, 12);

  // The ward is the west wing of a normal rural compound, not a hospital hall.
  // Both doors remain at x=-26; its north door continues to serve background traffic.
  Roof("ReceptionWard", -26, 234, 14, 18);
  Roof("ReceptionStreetRoom", -5, 229, 10, 14);
  for (const [i, z] of [227, 231, 235, 239, 242].entries())
    Box(blocks, `ReceptionWardCeilingBeam${i}`, -26, z, 13.6, .22, .28, "timber",
      { y: groundAt(-26, 234) + 2.88 });
  // An eave over the south threshold gives a covered handover transition. The
  // litter travels x=-26 while the courtyard's x=-13 circulation lane stays open.
  Box(blocks, "ReceptionWardPorchRoof", -26, 244.1, 14.8, .18, 2.5, "roof",
    { y: groundAt(-26, 234) + 2.89 });
  for (const [side, x] of [["West", -32.2], ["East", -19.8]]) {
    Box(blocks, `ReceptionWardPorchPost${side}`, x, 245.1, .24, 2.8, .24, "timber");
  }
  // A modest north-side receiving shelter and benches give ongoing arrivals a
  // distinct waiting pocket, leaving the gate -> yard -> ward -> rear-exit loop free.
  Box(blocks, "ReceptionWaitingRoof", -13.2, 221.5, 8.5, .18, 5, "timber",
    { y: groundAt(-13.2, 221.5) + 2.8 });
  for (const [i, x, z] of [[0, -17.1, 223.6], [1, -9.3, 223.6]])
    Box(blocks, `ReceptionWaitingPost${i}`, x, z, .22, 2.8, .22, "timber");
  Box(blocks, "ReceptionWaitingBench", -13.2, 220, 5.6, .44, .6, "timber");
  Box(blocks, "ReceptionReceivingTable", -16.2, 226, 1.7, .78, .8, "timber");
  Box(blocks, "ReceptionEmptyLitterStack", -37.6, 221.5, 1.5, .48, 2.9, "timber");
  // Gate hood is intentionally small: this is an ordinary yard pressed into service.
  Box(blocks, "ReceptionGateHood", 2, 240, 2.6, .22, 5.6, "roof",
    { y: groundAt(2, 240) + 2.94 });

  // Solid lateral protection defines a south-bank firing pocket without occupying
  // the returning column's x=-77 passage or the demolition crew's withdrawal.
  Grounded("BridgeSouthCoverWestWing", -87.35, 180.8, .8, 1.6, 6.4, "earthDark");
  Grounded("BridgeSouthCoverEastWing", -59.6, 181.2, .8, 1.6, 6, "earthDark");
  // Blast-safe cover has a side return, not a taller front: standing players retain
  // the authored sightline from (-66,201) to the bridge, 48 metres to the north.
  Grounded("BlastSafeEastReturn", -58.5, 201, .8, 1.55, 6, "earthDark");
  Box(blocks, "BridgeDemolitionStores", -89, 187, 2, .8, 1.4, "timber");

  // Separate scenario-only silhouette. The day map must not acquire city walls.
  // Crenellations and a stepped gatehouse roof make the distant gate readable while
  // retaining the 4 m barbican opening / 3.8 m city gate and existing marching actors.
  const n = groundAt(-160, 334);
  function Night(id, x, z, w, h, d, semantic, base) {
    return Box(nightBlocks, id, x, z, w, h, d, semantic, { y: n + base + h / 2 });
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
  // Side working bays imply the preparations beyond the gate without narrowing
  // the central formation or the carriers' existing routes in the barbican.
  Night("NightSupplyShedRoof", -171, 349.5, 8, .22, 8, "roof", 3.05);
  for (const [i, x, z] of [[0, -174.5, 346], [1, -167.5, 346], [2, -174.5, 353]])
    Night(`NightSupplyShedPost${i}`, x, z, .25, 3.05, .25, "timber", 0);
  Night("NightSupplyCrates", -172.3, 351, 3, 1.1, 2.2, "timber", 0);
  Night("NightEastGuardRoom", -145, 350.5, 8, 3.1, 7, "plaster", 0);
  Night("NightEastGuardRoof", -145, 350.5, 8.8, .32, 7.8, "roof", 3.1);
  Night("NightApproachHouseWest", -179, 307, 11, 3.5, 15, "plaster", 0);
  Night("NightApproachRoofWest", -179, 307, 12, .35, 16, "roof", 3.5);
  Night("NightApproachHouseEast", -140.5, 310, 13, 3.4, 12, "plaster", 0);
  Night("NightApproachRoofEast", -140.5, 310, 14, .35, 13, "roof", 3.4);
  return { replaceBlockIds, blocks, nightBlocks };
}
