// First-level whitebox, 06–10. Notion concept sheet 06/06B: a sheltered
// casualty assembly area; 07/07B: communication route opening into a village;
// 08/08B and Topology_09: ruined street, physical obstruction and the kitchen on the right
// when facing south; 09/09B: roofed kitchen–connected-house passage;
// 10/10B: enclosed yard, south gate and a return to the original street.
// DoorAmbush09/Stage_09_C/D are the current 09 concepts: a low roof and thick
// doorway frame the room. Their choreography is not authored in this module.
// These are spatial masses, not a replacement art kit. Keep the established
// doors, actor posts, east-window firing lane and 0.9 m street squeeze.
// The caller supplies the shared terrain sampler; this module has no imports.
export function BuildVillageWhitebox(groundAt) {
  const blocks = [];
  const replaceBlockIds = ["KitchenRoof", "ConnectedHouseRoof", "ConnectedHouseBoards",
    "ConnectedHouseRidge", "MachineGunHouseRoof", "CourtyardEast"];
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
  // Stepped roof volumes convey ridge/eaves using the same axis-aligned boxes
  // as the field collider. The ridge is closed: first-person rooms must have
  // a real ceiling rather than retaining the old overhead-view cutaway.
  function Roof(id, x, z, w, d, height = 2.95) {
    const floor = groundAt(x, z);
    // Continuous internal soffit closes the riser gaps too: overlapping roof
    // projections alone still let an oblique first-person view see the sky.
    Block(`${id}Soffit`, x, z, w * 1.08, .32, d + .9,
      "roof", { y: floor + height + .16 });
    for (const side of [-1, 1]) {
      Block(`${id}Eave${side}`, x + side * w * .39, z, w * .3, .25, d + .9,
        "roof", { y: floor + height + .125 });
      Block(`${id}Slope${side}`, x + side * w * .2, z, w * .22, .3, d + .5,
        "roof", { y: floor + height + .44 });
      Block(`${id}Ridge${side}`, x + side * .8, z, .8, .35, d + .2,
        "roof", { y: floor + height + .77 });
    }
    Block(`${id}RidgeCap`, x, z, 1.6, .35, d + .2,
      "roof", { y: floor + height + .77 });
  }
  function HouseMass(id, x, z, w, d, h) {
    Bank(`${id}Body`, x, z, w, h, d, "plaster");
    Roof(id, x, z, w, d, h);
  }

  // 06: wrap the existing northern reverse slope around the west side of the
  // same assembly pad. All litter, borrower and relief-route positions stay.
  Bank("CollectionWestReturn", -48, -105.5, 2.2, 2.5, 16);
  Bank("CollectionWestFoot", -49.5, -103.5, 3, 1.35, 20);

  // 07: earth shoulders define the southbound communication line at the
  // village approach. The centre route and its existing excavation stay open.
  Bank("SouthVillageBankWest", 17, -29.4, 12, 1.7, 2.4);
  Bank("SouthVillageBankEast", 33.5, -17.5, 11, 1.55, 2.2);

  // 07B/08: a compact north edge, not isolated freestanding street walls.
  // The north passage z=-20 remains wide enough for the entire waiting party.
  HouseMass("VillageNorthWestHouse", 39.5, -8.5, 14, 14, 3.3);
  HouseMass("VillageNorthEastHouse", 80, -33, 17, 12, 3.45);
  Bank("VillageNorthWestYard", 29, -10, .75, 2.3, 17, "plaster");

  // 08: the window now belongs to a real room. Its west wall/window is the
  // existing StreetEastWindow*, and its south opening remains the east alley.
  Bank("EastWindowHouseNorth", 87.4, -.8, 10.1, 3.15, .65, "plaster");
  Bank("EastWindowHouseEast", 92.1, 3.1, .7, 3.15, 8.4, "plaster");
  Roof("EastWindowHouse", 87.2, 3.3, 10.3, 8.5, 3.2);
  // Taller masses behind the long street frontages read as a damaged block.
  HouseMass("StreetEastSouthHouse", 105, 28, 11.5, 11, 3.6);
  HouseMass("VillageWestCourtWing", 30, 23, 4, 18, 3.3);

  // 09: close the two-metre gap between kitchen and connected house with a
  // narrow roofed link; the established north/south doors remain 3.8 m wide.
  Roof("Kitchen", 58, -9, 12, 15);
  Roof("ConnectedHouse", 58, 8, 12, 15);
  Roof("MachineGunHouse", 43, 8, 12, 15);
  Bank("KitchenLinkWest", 52, -.5, .6, 2.9, 2, "plaster");
  Bank("KitchenLinkEast", 64, -.5, .6, 2.9, 2, "plaster");
  Block("KitchenLinkCeiling", 58, -.5, 12, .24, 2.2, "timber",
    { y: groundAt(58, -.5) + 3.02 });
  // Door depth and the projecting eaves mark the alternative entrance from
  // the street without an arrow, a sign or a new interaction.
  for (const x of [55.6, 60.4])
    Bank(`KitchenEntryJamb${x}`, x, -16.6, .34, 2.85, 1.1, "timber");
  Block("KitchenEntryLintel", 58, -16.85, 5.15, .25, 1.2, "timber",
    { y: groundAt(58, -16.5) + 2.8 });

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
  Roof("SideRoom", 68, 11.8, 8, 13.2);

  // 10: the street-front wing stands on the street side of the court wall.
  // The yard's entire east strip is a working area, including litter carrier
  // ends beyond x=69; filling it with a house would trap the real column.
  Bank("CourtyardStreetWing", 73.65, 26, 2.6, 3.2, 13.8, "plaster");
  Roof("CourtyardStreetWing", 73.65, 26, 3, 14.1, 3.2);
  // A covered gateway makes the release threshold legible. Its 5 m opening
  // and gate collider are owned by the original layout and are unchanged.
  Block("CourtyardGateHeader", 53, 34, 7.5, .6, 1.5, "timber",
    { y: groundAt(53, 34) + 2.75 });
  Block("CourtyardGateCap", 53, 34, 8.2, .3, 2, "roof",
    { y: groundAt(53, 34) + 3.15 });

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
  return { replaceBlockIds, blocks };
}
