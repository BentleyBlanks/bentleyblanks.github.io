// P012 blueprint-to-world compilation. Pure data: no three or runtime conversion.
// Compile each owned data package once at initialization; gameplay subsequently
// uses world coordinates only. Do not feed already compiled points back here.
// Tactical blocks move rigidly: heights, widths, depths, speeds and radii do not
// scale. Cross-region connections need explicit new world-space waypoints;
// transforming the two endpoints of an old connection does not design a road.
// Boundary points belong to their semantic region: use the explicit transforms
// below when automatic classification would select the neighbouring region.

export { P012_HORIZON_BOUNDS as P012_SPACE_BOUNDS } from "./Data_FirstLevelP012Horizon.mjs";

