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

