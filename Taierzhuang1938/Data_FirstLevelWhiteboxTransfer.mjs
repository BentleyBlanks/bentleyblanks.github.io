// Notion 2026-09-24: 11–12 transfer topology; concept Stage_11/11_B/12/12_B,
// Stage_13/13_B/14/14_B. The adopted text controls adjacency and direction.
// North village fire -> covered sorting yard -> open south cart road. The west
// ditch is a separate pedestrian escape after the same cart stops in stage 13.
// Keep authored crowd pockets, four cart bays, firing posts, supply and routes.
// This factory is pure data; Layout supplies the shared terrain sampler and all
// geometry is consumed by the existing whitebox BuildSink/collision pipeline.
export function BuildTransferWhitebox(groundAt) {
  const blocks = [];
  function Block(id, x, z, w, h, d, semantic = "plaster", extra = {}) {
    const top = groundAt(x, z) + h;
    const base = Math.min(...[-1, 0, 1].flatMap(a => [-1, 0, 1].map(b =>
      groundAt(x + a * w / 2, z + b * d / 2)))) - 0.12;
    blocks.push({ id, x, z, w, h: top - base, d, y: (top + base) / 2,
      semantic, tag: "whiteboxWall", ...extra });
  }
  function Roof(id, x, z, w, d, height) {
    blocks.push({ id, x, z, w, h: 0.2, d, y: groundAt(x, z) + height,
      semantic: "timber", tag: "whiteboxWall" });
  }
  function Cover(id, x, z, w, h, d) {
    Block(id, x, z, w, h, d, "cover", { cover: { faceX: 0, faceZ: -1 } });
  }

  // The village-facing low wall leaves the actual x76 road open. Arrivals fan
  // into the existing yard south of z88; no walls cross those lateral motions.
  Cover("TransferVillageWallWest", 66.5, 84, 13, 1.2, 0.8);
  Cover("TransferVillageWallEast", 87, 84, 15, 1.05, 0.8);
  Block("TransferYardNorthWestReturn", 55, 86, 0.7, 2.6, 4);
  Block("TransferYardWestScreenNorth", 54, 92, 0.7, 2.6, 6);
  Block("TransferYardWestScreenSouth", 54, 104, 0.7, 2.6, 10);
  // The corner is the established player/squad firing position. Its east wall
  // remains low so that the player can still engage the southeast alley mouth.
  Cover("TransferCorner", 95, 96, 8, 1.1, 0.7);
  Cover("TransferEastCover", 98, 104, 0.75, 1.1, 11);

  // A small farm store outside the occupied yard gives the west perimeter a
  // inhabited village silhouette without turning the transfer point into a
  // large hospital. Its cut-away roof and east doorway remain readable.
  Block("TransferStoreWest", 43, 96, 0.7, 3.1, 15);
  Block("TransferStoreNorth", 48.5, 88.5, 11, 3.1, 0.7);
  Block("TransferStoreSouth", 48.5, 103.5, 11, 3.1, 0.7);
  Roof("TransferStoreRoof", 46, 96, 6.6, 15.8, 3.3);
  // Side-positioned temporary shelter replaces the old 25x22 m canopy over
  // the road. All posts are outside sorting pockets and the west escape strip.
  for (const x of [56, 64]) for (const z of [123, 130.5])
    Block(`TransferShelterPost${x}_${z}`, x, z, 0.3, 3, 0.3, "timber");
  Roof("TransferShelterRoof", 60, 126.75, 9, 8.5, 3.2);
  Block("TransferShelterBack", 54.8, 127, 0.65, 2.65, 9);
  // There is no southern gate across the cart lane. Two short shoulders frame
  // the halt and unloading pocket; the southwest diagonal to the ditch stays
  // open, including the bearers beside the unload point (72.6,135).
  Cover("TransferRoadEastShoulder", 84, 135, 0.7, 0.85, 5);
  Cover("TransferRoadWestShoulder", 67, 134, 0.7, 1.05, 4);
  Cover("TransferDitchNorthLip", 49, 109, 10, 1.4, 0.8);
  // Preserve the established open west-facing alley and its northern pursuit
  // gap. Add a real building mass only south/east of its walls and gun sight.
  Block("TransferAlleyStoreSouth", 108.5, 133, 14, 3.2, 0.7);
  Block("TransferAlleyStoreEast", 115.5, 129.5, 0.7, 3.2, 7);
  Roof("TransferAlleyStoreRoof", 111, 130, 9, 6.5, 3.4);

  return {
    replaceBlockIds: ["TransferCanopy", "TransferPost64_109", "TransferPost64_129",
      "TransferPost88_109", "TransferPost88_129", "TransferVillageWallWest",
      "TransferCorner", "TransferEastCover", "TransferWestCover", "TransferYardWestWall"],
    blocks,
  };
}
