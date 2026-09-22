// Notion 2026-09-22: one breach, three independent routes. X east, Z south, metres.
const Point=(x,z)=>Object.freeze({x,z});
export const FRONT_SORTIE=Object.freeze({
  approach:[Point(6,-124),Point(14,-116),Point(22,-119),Point(22,-129),Point(22,-138),Point(27,-141)],
  nest:Point(27,-142), seat:Point(27,-141),leaderCover:Point(24,-142), rear:Point(27,-127),
  rearRoute:[Point(27,-141),Point(26,-138),Point(22,-138),Point(22,-129),Point(27,-127)],
  route:[Point(27,-127),Point(27,-119),Point(29,-101),Point(34,-101),Point(34,-108)],
  attackRoute:[Point(27,-127),Point(35,-127),Point(38,-134),Point(39,-140)],
  house:Point(34,-110),bundle:Point(35.5,-110),keeper:Point(31.8,-111),
  throw:Point(39,-140),orders:Point(-34,-99),
  leftGun:Point(-31,-151),leftSeat:Point(-31,-150),
  leftRoute:[Point(6,-124),Point(-20,-124),Point(-28,-133),Point(-31,-141),Point(-31,-150)],
  gap:Point(-8,-139),lastCover:Point(-8,-148),
  guardRoute:[Point(-8,-148),Point(-8,-143),Point(-8,-139),Point(-8,-132),Point(-17,-127),Point(-17,-124)],
  // Exposure at the damaged lip rewards crouching; there is no artificial ceiling.
  crawl:[],damagedLip:Point(27,-119),
  crawlClearanceM:.96,crawlRoofM:1.1,crawlRadiusM:3.8,crawlEntryMarginM:.75,
  checkpointRadiusM:3.2,supplierRangeM:7,leaderArrivalM:3,leaderWaitM:10,leaderCrawlMps:1.1,
  trenchBottomM:3.8,trenchDepthM:1.85,trenchBankM:1.6,
  enemies:[{id:'BundleBendA',x:44,z:-125,hold:false},{id:'BundleBendB',x:44,z:-120,hold:false}],
  // Fixed road: progress never follows the player backwards.
  road:[Point(65,-200),Point(59,-181),Point(50,-164),Point(47,-153),Point(44,-146),Point(44,-145),Point(47,-116)],
  tankPreviewIndex:1,tankPressureIndex:3,tankBlockIndex:4,tankEndIndex:5,
  tankRoadX:44,tankNorthZ:-200,tankSouthZ:-140,tankLeadM:6,
  retreatCasualtyFraction:.5,retreatSuppression:.72,retreatSuppressionS:3,
  retreatDistanceM:12,retreatArrivalM:2,
});
export function SortieCrawlBlocked(position,next,stance){
  if(stance==='prone')return false;
  return FRONT_SORTIE.crawl.some(c=>{
    const Inside=p=>Math.abs(p.x-c.x)<c.w/2&&Math.abs(p.z-c.z)<c.d/2+FRONT_SORTIE.crawlEntryMarginM;
    return Inside(next)&&(!Inside(position)||Math.abs(next.z-c.z)<Math.abs(position.z-c.z));
  });
}
