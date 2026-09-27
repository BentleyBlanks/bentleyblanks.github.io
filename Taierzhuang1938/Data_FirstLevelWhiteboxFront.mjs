// First-level whitebox, 05–07: tank approach (05), casualty collection on the
// reverse slope (06) and the southbound communication line to the village (07).
// Concept references: Notion「第一关｜游戏概念参考图」05/05B, 06/06B, 07/07B;
// gap list and regional ownership: docs/Data_FirstLevelWhitebox0518Gap.md.
// Split out of Data_FirstLevelWhiteboxVillage on 2026-09-27 so the 05–07 and
// 08–10 packages can be edited in parallel; the four masses below are byte-for-byte
// the former Village entries and Layout merges this package first, so the final
// MISSION_LAYOUT.blocks order is unchanged.
// 05's established pieces (RoadsideRuin, old yard, sap revetments) still live in
// Data_FirstLevelMissionLayout / the trench network; new 05 masses go here.
// The caller supplies the shared terrain sampler; this module has no imports.
export function BuildFrontWhitebox(groundAt) {
  const blocks = [];
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

  // 06: wrap the existing northern reverse slope around the west side of the
  // same assembly pad. All litter, borrower and relief-route positions stay.
  Bank("CollectionWestReturn", -48, -105.5, 2.2, 2.5, 16);
  Bank("CollectionWestFoot", -49.5, -103.5, 3, 1.35, 20);

  // 07: earth shoulders define the southbound communication line at the
  // village approach. The centre route and its existing excavation stay open.
  Bank("SouthVillageBankWest", 17, -29.4, 12, 1.7, 2.4);
  Bank("SouthVillageBankEast", 33.5, -17.5, 11, 1.55, 2.2);

  return { replaceBlockIds: [], blocks };
}
