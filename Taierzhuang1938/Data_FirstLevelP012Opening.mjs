// Opening-only world-space traffic and escort tuning. No scaled people or clocks.
import { P012StationPoint } from "./Data_FirstLevelP012Space.mjs";
import { P012_ROUTES } from "./Data_FirstLevelP012Layout.mjs";
const Point = (x,z) => ({x,z});
const soldiers=[0,1,2].map(slot=>({side:0,slot,role:"soldier",speedMps:3.05,releaseBeat:0,pauseIndex:1,
  route:[P012StationPoint(-54,66-slot*3),P012StationPoint(-54,49-slot*3),P012StationPoint(-54,40),
    ...P012_ROUTES.village.map(point=>Point(point.x-1.4,point.z)),Point(0,-15-slot*3)]}));
// A finite, sparse rearward column along the village road. Nobody uses the
// military unloading platform or gun/ammo queue as a civilian thoroughfare.
const southbound=[Point(1.4,-6),...P012_ROUTES.village.slice(2).reverse().map(point=>Point(point.x+1.4,point.z)),
  ...P012_ROUTES.villageEvacuation.slice(1)];
export const openingFamilies=Object.freeze([
 {id:"VillageFamily0",adultSlots:[0,1,2],guardianSlot:0,speedMps:1.05,startZ:2},
 {id:"VillageFamily1",adultSlots:[3,4,5],guardianSlot:3,speedMps:1.22,startZ:24},
 {id:"VillageFamily2",adultSlots:[6,7,8],guardianSlot:6,speedMps:1.12,startZ:46},
 {id:"VillageFamily3",adultSlots:[9,10],guardianSlot:9,speedMps:1.32,startZ:70},
].map(family=>Object.freeze({...family,adultSlots:Object.freeze(family.adultSlots)})));
function CivilianEntry(slot,family,memberIndex,child=false){
  const z=family.startZ-memberIndex*1.35;
  const next=southbound.findIndex(point=>point.z>z),a=southbound[Math.max(0,next-1)],b=southbound[next];
  const start=Point(a.x+(b.x-a.x)*(z-a.z)/(b.z-a.z),z);
  return {side:1,slot,role:"civilian",actorKind:"civilian",variant:child?(slot===11?"childBoy":"childGirl"):slot%2?"female":"male",child,releaseBeat:0,
    familyId:family.id,guardianSlot:family.guardianSlot,memberIndex,speedMps:family.speedMps,
    lateralM:memberIndex%2?.45:-.45,spacingM:child?1.0:1.35,
    bodyRadius:child?.24:.42,bodyHeight:child?1.12:1.78,
    // Runtime may spread only after sweeping this candidate. At narrow corners
    // converge smoothly onto this certified centre route; never snap sideways.
    retireWhenHidden:family.guardianSlot<7,
    route:[start,...southbound.slice(next,-1),Point(-18,155+family.guardianSlot*2.8-memberIndex*1.35)]};
}
const civilians=openingFamilies.flatMap(family=>family.adultSlots.map((slot,index)=>CivilianEntry(slot,family,index)));
const children=[CivilianEntry(11,openingFamilies[0],3,true),CivilianEntry(12,openingFamilies[2],3,true)];
export const openingActivities=Object.freeze({
  civilianRoute:[...southbound.slice(0,-1),Point(-18,190)],
  openingGuideWalkMps:3.05,openingGuideCatchupMps:5.246,openingGuideWaitDistanceM:10,
  openingUrgentGuideMps:3.8,civilianAlarmSpeedScale:1.85,
  // Finite salvos advance with the player along the northbound road, never a camera-relative blast.
  approachShells:Object.freeze([
    {stage:"distant",gateZ:110,delayS:0,point:Point(-36,-24)},
    {stage:"distant",gateZ:110,delayS:3.8,point:Point(25,-27)},
    {stage:"village",gateZ:70,delayS:0,point:Point(-27,25)},
    {stage:"village",gateZ:70,delayS:2.8,point:Point(24,15)},
    {stage:"approaching",gateZ:40,delayS:0,point:Point(-21,0)},
    {stage:"approaching",gateZ:40,delayS:2.1,point:Point(23,-10)},
    {stage:"near",gateZ:12,delayS:0,point:Point(-25,-22)},
    {stage:"near",gateZ:12,delayS:1.8,point:Point(25,-34)},
  ].map(Object.freeze)),
  // Fixed world impact ahead of both a walking and sprinting approach after the
  // incoming shell's flight, west of the real ditch bank. Never camera-anchored.
  northNearMissImpactPosition:Point(-19,-40),
  northAmbientShells:Object.freeze([
    {delayS:2.8,point:Point(-28,-54)}, {delayS:5.2,point:Point(19,-62)},
    {delayS:8.6,point:Point(-31,-87)}, {delayS:12.5,point:Point(28,-99)},
  ].map(Object.freeze)),
  northShelterPosition:Point(-12,-38),northShelterRadiusM:2.4,
  traffic:[...soldiers,...civilians,...children,...[0,1].map(index=>({side:1,slot:13+index,role:"walking",releaseBeat:3,
    proximityRelease:{index:0,beat:3,radius:22,requireVisible:true},
    route:[Point(16+index*2,8+index*2),Point(16,20),Point(16,35),Point(16,50+index*3)]}))],
});
// New audition text only: no generated or existing recording is requested.
export const openingStoryBeats=Object.freeze([
  ["MusterCall","P012AmmoIssued","luo","领好枪弹的，到我这边来。咱们班点一下人。",null,5,"P012MusterCalled"],
  ["BriefingMission","P012BriefingStarted","luo","北边阵地缺人，咱们班过去接防。我带路，穿过这片村子就到北口。",null,6.5,"P012BriefingComplete"],
  ["BriefingRoute","P012BriefingComplete","luo","进村靠右走，给乡亲和伤员让路。前后照应，别掉队；有事就叫我。",null,6,"P012BriefingRouteExplained"],
  ["BriefingReply","P012BriefingRouteExplained","heyoutian","听见了。幺娃，跟我旁边走。后头的，跟上！",null,4,"P012BriefingWalkingReply"],
  ["VillageCheck0","P012VillageCheck0","luo","后头都跟上了？别挤着乡亲，咱们从院墙这边过。",9,4.5],
  ["VillageCheck1","P012VillageCheck1","luo","前面就是村口。过了路口再去北边阵地，先别散开。",9,4.5],
  ["VillageCheck2","P012VillageCheck2","luo","都跟着。前面过村口，我带你们进沟接防。",9,4],
  ["Traffic", "P012VillageTrafficSeen", "luo", "让一让，别挡着往回走的乡亲。咱们沿这边过去。", 6],
  ["Village", "P012VillageRoad", "yaowa", "顺哥，这一路你在记啥子呢？", null,3.4,"P012BackRouteQuestion"],
  ["VillageReply", "P012BackRouteQuestion", "shunzi", "认路。", null,2,"P012BackRouteReply"],
  ["VillageAhead", "P012BackRouteReply", "yaowa", "前头才是我们去的地方。", null,3.4,"P012BackRouteAhead"],
  ["VillageRetort", "P012BackRouteAhead", "shunzi", "老子又没说不去。", null,3],
  ["ApproachAlarm", "P012ApproachShellImpact", "luo", "炮火顺着路压过来了！拉开些，跟紧我，前头有沟！", 6,4],
  ["NorthDeparture", "P012VillageNorthDeparture", "luo", "前头还在挨炮。跟上，穿过北口进沟！", 8, 2.8],
  ["Chat", "P012NorthApproachChat", "heyoutian", "刚领的子弹捂好，别一跑全撒路上。", 8],
  ["ChatReply", "P012NorthApproachChat", "yaowa", "这点家当，我攥得比命还紧。", 10],
  ["Impact", "P012NorthNearMissImpact", "luo", "卧倒！进沟！别站在路中央！", 6],
  ["RegroupCall", "P012NorthSquadRegrouped", "luo", "靠沟收拢，沿沟继续。何有田，照应后头！", null,4,"P012NorthContinue"],
  ["RegroupCheck", "P012NorthContinue", "heyoutian", "顺子、幺娃都在，后头也跟上来了。", null,4,"P012NorthNamesChecked"],
  ["RegroupAnswer", "P012NorthNamesChecked", "yaowa", "一个不少，都在！", null,3,"P012NorthCounted"],
  ["AmmoDogleg", "P012AmmoDoglegEntered", "luo", "弹药箱走狗腿沟，贴着沟壁跟我转。", 8,3.2],
  ["AmmoGunline", "P012AmmoGunlineNear", "luo", "前头就是机枪位，送到枪眼后边。", 8,3.2],
].map(([id,event,who,text,maxAgeS,seconds,completeSignal])=>Object.freeze({
  at:`event:${event}`,type:"line",who,text,tier:"虚构",voice:`p012_text_${id}`,
  p012SubtitleOnly:true,p012SubtitleSeconds:seconds||(id==="Chat"?2.8:3.4),
  ...(completeSignal?{p012CompleteSignal:completeSignal}:{}),
  p012Immediate:Object.freeze({event,maxAgeS,
    interruptSubtitle:id.endsWith("Alarm")||id==="Chat"||id==="Impact"||id==="MusterCall",
    until:id.endsWith("Alarm")?"P012NorthNearMissImpact":id==="Impact"||id.startsWith("Regroup")?undefined:id.startsWith("Chat")?"P012NorthNearMissImpact":"P012NorthApproachChat"}),
})));
