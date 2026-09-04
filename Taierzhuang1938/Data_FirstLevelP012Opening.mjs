// Opening-only world-space traffic and escort tuning. No scaled people or clocks.
const Point = (x,z) => ({x,z});
const soldiers=[0,1,2].map(slot=>({side:0,slot,role:"soldier",speedMps:3.05,releaseBeat:0,pauseIndex:1,
  route:[Point(-54,66-slot*3),Point(-54,49-slot*3),Point(-54,40),Point(-43,38),
    Point(-34,38),Point(-32,30),Point(-32,18-slot*3),Point(-17,12),Point(0,0),Point(0,-15-slot*3)]}));
const civilians=Array.from({length:11},(_,slot)=>{
  const lane=slot%2,row=Math.floor(slot/2),start=Point(-59+lane*3,36+row*3);
  const retreat=slot<7;
  return {side:1,slot,role:"civilian",variant:slot%2?"female":"male",releaseBeat:0,
    retireWhenHidden:retreat,
    route:[start,Point(start.x,54),Point(-59,54),Point(-59,52),Point(-52,52),Point(-52,50),
      Point(-30,50),Point(-30,76),Point(-40-slot*2,76)]};
});
export const openingActivities=Object.freeze({
  openingGuideWalkMps:3.05,openingGuideCatchupMps:5.246,openingGuideWaitDistanceM:10,
  northNearMissImpactPosition:Point(-19,-29),
  northShelterPosition:Point(-12,-38),northShelterRadiusM:2.4,
  traffic:[...soldiers,...civilians,...[0,1].map(index=>({side:1,slot:12+index,role:"walking",releaseBeat:3,
    proximityRelease:{index:0,beat:3,radius:22,requireVisible:true},
    route:[Point(16+index*2,8+index*2),Point(16,20),Point(16,35),Point(16,50+index*3)]}))],
});
// New audition text only: no generated or existing recording is requested.
export const openingStoryBeats=Object.freeze([
  ["Traffic", "P012VillageTrafficSeen", "luo", "让一让，别挡着往回走的乡亲。咱们沿这边过去。", 6],
  ["Village", "P012VillageRoad", "yaowa", "人都往回走，咱们倒往炮声里去。", 6],
  ["VillageReply", "P012VillageRoad", "luo", "北边缺人，弹药也得往那送。把这条村路记住。", 12],
  ["Binoculars", "P012BinocularTaken", "luo", "北边进阵地的是咱们的人。再看看往南走的伤员。", 10],
  ["North", "P012NorthRecognized", "shunzi", "北边还在往上添人。", 10],
  ["South", "P012SouthRecognized", "shunzi", "伤员都往兵站那头走……", 10],
  ["Return", "P012BinocularReturned", "luo", "走，跟上前头那一班。", 8],
  ["Chat", "P012NorthApproachChat", "heyoutian", "刚领的子弹捂好，别一跑全撒路上。", 8],
  ["ChatReply", "P012NorthApproachChat", "yaowa", "这点家当，我攥得比命还紧。", 10],
  ["Impact", "P012NorthNearMissImpact", "luo", "卧倒！进沟！别站在路中央！", 6],
].map(([id,event,who,text,maxAgeS])=>Object.freeze({
  at:`event:${event}`,type:"line",who,text,tier:"虚构",voice:`p012_text_${id}`,
  p012SubtitleOnly:true,p012SubtitleSeconds:id==="Chat"?2.8:3.4,
  p012Immediate:Object.freeze({event,maxAgeS,
    interruptSubtitle:id==="Chat"||id==="Impact",
    until:id==="Impact"?undefined:id.startsWith("Chat")?"P012NorthNearMissImpact":"P012NorthApproachChat"}),
})));
