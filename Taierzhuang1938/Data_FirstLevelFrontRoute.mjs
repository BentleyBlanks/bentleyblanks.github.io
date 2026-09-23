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
  Way(110,-227,"cruise",{note:"start: plateau road cutting, 118 m from the nest seat, behind NorthRuin's sector"}),
  Way(104,-212,"cruise"),
  Way(92,-200,"hullDown",{faceTo:"nest",holdS:15,note:"03 preview (K5): 2.2 m cutting, turret above the lip, hull below it"}),
  Way(66,-189,"cruise",{note:"the bend, behind NorthRuin (seen from the seat the ruin covers bearings 33-53 deg)"}),
  Way(58,-178,"cruise",{note:"04 emerges from the bend (K6); the blocked south road forks here"}),
  Way(51,-172.5,"firePoint",{faceTo:"nest",holdS:14,note:"04 pressure: HE + hull MG on the nest front seat, 31 m"}),
  Way(44.5,-169,"cruise"),
  Way(38,-167.5,"block",{faceTo:"gap",holdS:0,note:"04-05 blockade, 7.5 m north of the berm line"}),
  Way(35.5,-167,"squeeze",{faceTo:"gap",holdS:0,note:"05 push, +2.6 m"}),
]);
const T=FRONT_TANK_PATH;
export const FRONT_SORTIE=Object.freeze({
  // 03: collection/support junction -> support sap -> observation step -> fold -> gap junction ->
  // right low trench -> nest west door. The first point is the support junction SJ.
  approach:[Point(-29,-110),Point(-30,-118),Point(-27,-127),Point(-18,-134),Point(-8,-140),
    Point(0,-141.5),Point(7,-143.5),Point(13,-144.2),Point(19,-146.8),Point(25.8,-150.3),Point(25.9,-153.9)],
  nest:Point(24.9,-153.9), seat:Point(25.9,-153.9),leaderCover:Point(28.4,-151.6), rear:Point(29.7,-141.5),
  // 04 short withdrawal: seat -> rear-wall door -> rear junction (behind the never-breakable rear wall).
  rearRoute:[Point(25.9,-153.9),Point(29.6,-149.5),Point(29.7,-145.6),Point(29.7,-141.5)],
  // 05 ammo sap: rear junction -> damaged lip (road view) -> yard gate -> house back door.
  route:[Point(29.7,-141.5),Point(34,-136),Point(41,-129.5),Point(41.5,-123),Point(40.8,-117.5),Point(42.4,-111)],
  // 05 attack branch = the upper link sap the 01 Japanese came down: rear junction -> road-side ruin.
  attackRoute:[Point(29.7,-141.5),Point(35,-142.5),Point(39.5,-147),Point(41.5,-153),Point(43.6,-159.6)],
  house:Point(47.5,-109),bundle:Point(49,-110.2),keeper:Point(46.2,-106.4),
  throw:Point(43.6,-159.6),orders:Point(-34,-99),
  leftGun:Point(-33.8,-157.6),leftSeat:Point(-33.6,-156.4),
  // He / relief / Zhou use the support sap's first leg and then the left gun access trench.
  leftRoute:[Point(-29,-110),Point(-30,-118),Point(-27,-127),Point(-31,-137),Point(-34,-147),Point(-33.6,-156.4)],
  gap:Point(-8,-150),lastCover:Point(-8,-155.2),
  // Backslope scrape -> the one gap -> gap junction -> fold -> safe zone behind the fold.
  guardRoute:[Point(-8,-155.2),Point(-8,-150),Point(-8,-144.5),Point(-8,-140),Point(-18,-134),Point(-22.5,-131)],
  // Exposure at the damaged lip rewards crouching; there is no artificial ceiling.
  crawl:[],damagedLip:Point(41,-129.5),
  crawlClearanceM:.96,crawlRoofM:1.1,crawlRadiusM:3.8,crawlEntryMarginM:.75,
  checkpointRadiusM:3.2,supplierRangeM:7,leaderArrivalM:3,leaderWaitM:10,leaderCrawlMps:1.1,
  trenchBottomM:3.8,trenchDepthM:1.85,trenchBankM:1.6,
  // 05 cut-in pair: from the blocked south road through the road link into the ammo sap ahead of the player.
  enemies:[{id:'BundleBendA',x:63,z:-133,hold:false},{id:'BundleBendB',x:62,z:-138,hold:false}],
  // Terrain road polyline = the tank path plus a 5 m dead-end stub at the berm-end crater.
  road:[...T.map(p=>Point(p.x,p.z)),Point(31,-166.4)],
  tankPreviewIndex:2,tankPressureIndex:5,tankBlockIndex:7,tankEndIndex:8,
  tankRoadX:38,tankNorthZ:-228,tankSouthZ:-166,tankLeadM:6,
  retreatCasualtyFraction:.5,retreatSuppression:.72,retreatSuppressionS:3,
  retreatDistanceM:12,retreatArrivalM:2,
});
// Everything else the proposal places (single source for the map, the sight script and the doc).
export const FRONT_SPACE=Object.freeze({
  supportJunction:Point(-29,-110),          // 02 end / 03 start (the collection is 9 m south-west)
  rearCorner:Point(-4,-113),               // "后交通壕折角": Luo appears here in K2; He holds it in 03
  observation:Point(-26.4,-127.6),          // 03 observation fire step (K3)
  observationStepDepthM:.62,
  fold:Point(-18,-134),                     // support sap fold: the guards' safe zone is behind it
  safeZone:Point(-22.5,-131),
  gapJunction:Point(-8,-140),
  westDoor:Point(25.8,-150.5),
  rearDoor:Point(29.7,-145.6),
  roadMouth:Point(46.5,-163.5),             // where the link sap meets the road (01 entry, 05 cut-in seen)
  roadLink:[Point(62,-129),Point(55,-126.5),Point(47.5,-124.5),Point(41.5,-123)],
  southRoad:[Point(58,-178),Point(62,-162),Point(63,-140),Point(61,-120),Point(58,-100),Point(55,-84)],
  yard:Object.freeze({minX:38.8,maxX:54,minZ:-119,maxZ:-100}),
  bermEndCraters:[Point(17.5,-158.2),Point(20.5,-161.5),Point(15.5,-162.8)],
});
export function SortieCrawlBlocked(position,next,stance){
  if(stance==='prone')return false;
  return FRONT_SORTIE.crawl.some(c=>{
    const Inside=p=>Math.abs(p.x-c.x)<c.w/2&&Math.abs(p.z-c.z)<c.d/2+FRONT_SORTIE.crawlEntryMarginM;
    return Inside(next)&&(!Inside(position)||Math.abs(next.z-c.z)<Math.abs(position.z-c.z));
  });
}
