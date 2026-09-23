// Notion 2026-09-22 + 2026-09-23 topology. X east, Z south, metres.
// 2026-09-23 space proposal A (combat-space first, docs/Data_FirstLevelLayoutProposalA.md):
// the front moved 6 m north (berm crest z=-160, x -30..12), the right nest sits at the berm's
// east end, the ammo yard is south-east of it on the friendly side, and the tank road comes from
// the north-east plateau, bends behind NorthRuin and runs west along the front to a stop point
// north of the berm line. Every key below is still the one the 03-05 code reads.
const Point=(x,z)=>Object.freeze({x,z});
// Semantic tank waypoints (contract §5.7). holdS=0 on block = hold until disabled.
const Way=(x,z,kind,extra={})=>Object.freeze({x,z,kind,...extra});
export const FRONT_TANK_PATH=Object.freeze([
  Way(112,-229,"cruise",{note:"start: plateau road cutting, 114 m from the nest seat, inside NorthRuin's shadow sector"}),
  Way(106,-214,"cruise"),
  Way(97,-205,"hullDown",{faceTo:"nest",holdS:15,note:"03 preview (K5): the road runs across the view here, the 2.2 m cutting's lip hides the hull, the turret shows"}),
  Way(81,-204,"cruise",{note:"leaves the preview westward, already inside NorthRuin's shadow sector"}),
  Way(64,-189.5,"cruise",{note:"the bend, behind NorthRuin (seen from the seat the ruin covers bearings 31-50 deg)"}),
  Way(60,-177,"cruise",{note:"04 emerges from the bend (K6); the blocked south road forks here"}),
  Way(51,-172.5,"firePoint",{faceTo:"nest",holdS:14,note:"04 pressure: HE + hull MG on the nest front seat, 31 m"}),
  Way(44.5,-169,"cruise"),
  Way(38,-167.5,"block",{faceTo:"gap",holdS:0,note:"04-05 blockade, 7.5 m north of the berm line"}),
  Way(35.5,-167,"squeeze",{faceTo:"gap",holdS:0,note:"05 push, +2.6 m"}),
]);
const T=FRONT_TANK_PATH;
export const FRONT_SORTIE=Object.freeze({
  // 03: collection/support junction -> support sap -> observation step -> fold -> gap junction ->
  // right low trench -> nest west door. The first point is the support junction SJ.
  // The support sap zigzags: every leg is at least 25 deg off the east-north-east fire axis of the
  // nest and the tank's stop point, so neither can shoot along it (docs §4.2).
  approach:[Point(-29,-110),Point(-30,-118),Point(-26.5,-126),Point(-20.4,-126.8),Point(-19.2,-133.2),
    Point(-10.4,-134.2),Point(-9.4,-138.6),Point(-8,-140.6),
    Point(0,-141.6),Point(7,-143.5),Point(13,-144.2),Point(19,-146.8),Point(22.2,-149.6),Point(25.8,-150.4),Point(25.9,-153.9)],
  nest:Point(24.9,-153.9), seat:Point(25.9,-153.9),leaderCover:Point(28.4,-151.6), rear:Point(29.7,-141.5),
  // 04 short withdrawal: seat -> rear-wall door -> rear junction (behind the never-breakable rear wall).
  rearRoute:[Point(25.9,-153.9),Point(29.6,-149.5),Point(29.7,-145.6),Point(29.7,-141.5)],
  // 05 ammo sap: rear junction -> damaged lip (road view) -> yard gate -> house back door.
  // ... up out of the sap through the yard's north gate (2-3 m in the tank's view at 50 m), left
  // behind the cart screen and along the house's west side to the back door.
  route:[Point(29.7,-141.5),Point(34,-136.4),Point(40.6,-130.6),Point(44.6,-125.6),Point(41.6,-120.8),Point(41.2,-118.6),
    Point(39.6,-117.4),Point(39.6,-114.2),Point(41.4,-112.6),Point(42.4,-111)],
  // 05 attack branch = the upper link sap the 01 Japanese came down: rear junction -> road-side ruin.
  attackRoute:[Point(29.7,-141.5),Point(35,-142.5),Point(39.4,-144.2),Point(39.8,-150),Point(41.8,-154.8),Point(43.6,-159.6)],
  house:Point(47.5,-109),bundle:Point(49,-110.2),keeper:Point(46.2,-106.4),
  throw:Point(43.6,-159.6),orders:Point(-34,-99),
  leftGun:Point(-33.8,-157.6),leftSeat:Point(-33.6,-156.4),
  // He / relief / Zhou use the support sap's first leg and then the left gun access trench.
  leftRoute:[Point(-29,-110),Point(-30,-118),Point(-26.5,-126),Point(-31,-136),Point(-34,-147),Point(-33.6,-156.4)],
  gap:Point(-8,-150),lastCover:Point(-8,-155.2),
  // Backslope scrape -> the one gap -> gap junction -> fold -> safe zone behind the fold.
  guardRoute:[Point(-8,-155.2),Point(-8,-150),Point(-8,-145),Point(-8,-140.6),Point(-9.4,-138.6),Point(-10.4,-134.2),
    Point(-19.2,-133.2),Point(-20.4,-126.8),Point(-21.6,-126.6)],
  // Exposure at the damaged lip rewards crouching; there is no artificial ceiling.
  crawl:[],damagedLip:Point(40.6,-130.6),
  crawlClearanceM:.96,crawlRoofM:1.1,crawlRadiusM:3.8,crawlEntryMarginM:.75,
  checkpointRadiusM:3.2,supplierRangeM:7,leaderArrivalM:3,leaderWaitM:10,leaderCrawlMps:1.1,
  trenchBottomM:3.8,trenchDepthM:1.85,trenchBankM:1.6,
  // 05 cut-in pair: from the blocked south road through the road link into the ammo sap ahead of the player.
  // They slipped into the road link sap from the blocked south road during 04 (dug in, out of sight).
  enemies:[{id:'BundleBendA',x:59.6,z:-128.4,hold:false},{id:'BundleBendB',x:56.8,z:-127.4,hold:false}],
  // Terrain road polyline = the tank path plus a 5 m dead-end stub at the berm-end crater.
  road:[...T.map(p=>Point(p.x,p.z)),Point(31,-166.4)],
  tankPreviewIndex:2,tankPressureIndex:6,tankBlockIndex:8,tankEndIndex:9,
  tankRoadX:38,tankNorthZ:-228,tankSouthZ:-166,tankLeadM:6,
  retreatCasualtyFraction:.5,retreatSuppression:.72,retreatSuppressionS:3,
  retreatDistanceM:12,retreatArrivalM:2,
});
// Everything else the proposal places (single source for the map, the sight script and the doc).
export const FRONT_SPACE=Object.freeze({
  supportJunction:Point(-29,-110),          // 02 end / 03 start (the collection is 9 m south-west)
  rearCorner:Point(-4,-113),               // "后交通壕折角": Luo appears here in K2; He holds it in 03
  observation:Point(-23.2,-129.2),          // 03 observation bay at the end of a 0.95 m spur (K3)
  observationSpur:[Point(-23.4,-126.5),Point(-23.2,-129.4)],
  fold:Point(-19.2,-133.2),                 // support sap fold: the guards' safe zone is behind it
  safeZone:Point(-21.6,-126.6),            // hidden from the nest, the flank group's last line and every tank waypoint
  gapJunction:Point(-8,-140.6),
  westDoor:Point(25.8,-150.5),
  rearDoor:Point(29.7,-145.6),
  roadMouth:Point(46.5,-163.5),             // where the link sap meets the road (01 entry, 05 cut-in seen)
  roadLink:[Point(62,-129),Point(55,-126.8),Point(48.5,-125.8),Point(44.6,-125.6)],
  southRoad:[Point(60,-177),Point(62,-162),Point(63,-140),Point(61,-120),Point(58,-100),Point(55,-84)],
  yard:Object.freeze({minX:38.8,maxX:54,minZ:-119,maxZ:-100}),
  // Around the berm's east end: the flank group's last line is on the SOUTH side of the end, where the
  // gap shows along the backslope; the two northern craters are its approach.
  bermEndCraters:[Point(16.2,-158.4),Point(20.5,-161.5),Point(15.5,-162.8),Point(21.8,-165.2),Point(14.6,-157.6),Point(12.6,-156.9),Point(18.4,-159.6)],
  // Last-line craters for the two bounding corridors whose line-4 point has no cover row.
  boundCraters:[Point(16.8,-165.3),Point(-5.2,-165.4),Point(4.7,-165.4)],
  // Flank group craters (they kneel in them; craters never block a rush) and escort-slot craters.
  flankCraters:[[40.6,-181.6,2.2],[40.4,-185.4,1.6],[31.6,-174.6,2.2],[32.8,-178.4,1.8],[24.2,-169,2.2],[26,-171.9,1.6]].map(([x,z,r])=>Object.freeze({x,z,r})),
  escortCraters:[[31.8,-163.8,1.4],[37.4,-163,1.3],[36.8,-172.4,1.3]].map(([x,z,r])=>Object.freeze({x,z,r})),
});
export function SortieCrawlBlocked(position,next,stance){
  if(stance==='prone')return false;
  return FRONT_SORTIE.crawl.some(c=>{
    const Inside=p=>Math.abs(p.x-c.x)<c.w/2&&Math.abs(p.z-c.z)<c.d/2+FRONT_SORTIE.crawlEntryMarginM;
    return Inside(next)&&(!Inside(position)||Math.abs(next.z-c.z)<Math.abs(position.z-c.z));
  });
}
