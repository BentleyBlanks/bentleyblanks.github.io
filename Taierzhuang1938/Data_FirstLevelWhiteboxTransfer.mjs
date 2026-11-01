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
// Round 2: the road is lined with broken brick walls at x 71 / x 80 whose
// segments and gaps come from MID_TUNING.transferEvac — the same table the
// stage-13 scatter (roadside cover behind the walls) and the 15A retreat lanes
// (through the west-wall gaps to the ditch mouth) walk. South of z 110 the east
// side stays open: cart bays, the loading stand (80,120) and every departing
// cart's straight run to the bridge cross it. The west terrace scarp stands
// behind the farm store; an east levee ridge by the river carries the concept's
// left-hand high ground. Non-solid dressing is allowed anywhere.
//
// 2026-09-30 C2 pass (12–18 whitebox, docs/Data_FirstLevelMid20260919.md §6): z 118.5–136.4 of the road is now a
// walled lane (west: 3.7 m brick with coping, pilasters and one window; east: 3 m rammed earth with one window),
// a drainage ditch runs along the west wall foot (terrain table), the river-lip balustrade runs west to x 55.6,
// windowed ruin walls at the bay row (x 100.4) and the ditch's east lip. Wall extents and gaps are still
// MID_TUNING.transferEvac.walls (westTall / eastTall); standing convoy carts are runtime props (transferConvoy).

