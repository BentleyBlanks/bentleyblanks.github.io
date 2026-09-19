// User revision, 2026-09-14: the northern supply house is reached under tank fire.
// Pure shared geometry: terrain, mission, guidance and collision audits read this route.
const Point=(x,z)=>({x,z});
export const FRONT_SORTIE=Object.freeze({
  route:[Point(6,-124),Point(15,-111),Point(25,-110),Point(30,-117),
    Point(49,-117),Point(49,-135),Point(55,-135),Point(55,-152),
    Point(49,-152),Point(49,-170),Point(55,-170),Point(55,-184),
    Point(45,-184),Point(45,-203),Point(40,-203),Point(40,-213)],
  house:Point(40,-214),bundle:Point(41.8,-215),keeper:Point(37.8,-215),
  throw:Point(30,-117),
  // 2026.09.19 契约 §3：接令点迁到背坡伤员集结处（与 MISSION_STAGE_ANCHORS.collection
  // 同一片场坪），不再是前沿沟里的 (14,-110)。键名不变。
  orders:Point(-34,-99),
  crawl:[{id:'First',x:49,z:-127,w:4.6,d:5},{id:'Second',x:55,z:-177,w:4.6,d:5}],
  crawlClearanceM:.96, crawlRoofM:1.1, crawlRadiusM:3.8,crawlEntryMarginM:.75,
  checkpointRadiusM:3.2, supplierRangeM:7, leaderArrivalM:4,leaderWaitM:12,leaderCrawlMps:1.1,
  trenchBottomM:3.6,trenchDepthM:2,trenchBankM:1.3,
  // Finite defenders hold two bends, separate from the frontal attack at 04.
  enemies:[{id:'BundleBendA',x:61,z:-155,hold:true},{id:'BundleBendB',x:62,z:-188,hold:true},
    {id:'BundleHouseGuard',x:34,z:-204,hold:true}],
  tankRoadX:35,tankNorthZ:-194,tankSouthZ:-123,tankLeadM:12,
  retreatCasualtyFraction:.5,retreatSuppression:.72,retreatSuppressionS:3,
  retreatDistanceM:12,retreatArrivalM:2,
});
// 旧的「向南」黑屏转场随 2026.09.19 重构下线（07 改成真走一段）。
// 关尾夜行军的字幕走 Data_Text_FirstLevel + MISSION_TUNING.nightTransition。

// An analytic terrain floor can snap a crouched capsule into a low ceiling after
// Rapier slides it downwards. Stop at the authored entrance before that overlap.
export function SortieCrawlBlocked(position,next,stance){
  if(stance==='prone')return false;
  return FRONT_SORTIE.crawl.some(c=>{
    const Inside=p=>Math.abs(p.x-c.x)<c.w/2 && Math.abs(p.z-c.z)<c.d/2+FRONT_SORTIE.crawlEntryMarginM;
    return Inside(next) && (!Inside(position)||Math.abs(next.z-c.z)<Math.abs(position.z-c.z));
  });
}
