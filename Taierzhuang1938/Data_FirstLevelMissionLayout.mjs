import { FRONT_SORTIE as Sortie } from "./Data_FirstLevelFrontRoute.mjs";
import { MISSION_REAR_ANCHORS, MISSION_REAR_ROUTES, MISSION_RECEPTION_SPACE, MISSION_SOUTH_BRIDGE, MISSION_RAIL_BRIDGE, MISSION_STAGE_ANCHORS, MISSION_STAGE_ROUTES, MISSION_NORTH_RIVER, RiverProfileAt, RiverCutAt } from "./Data_FirstLevelMissionTopology.mjs";
import { MISSION_TRENCH_COVER as TC } from "./Data_FirstLevelMissionTrenchCover.mjs";
import { OPENING } from "./Data_FirstLevelOpening.mjs";
import { MISSION_DEFENSE_POSTS } from "./Data_FirstLevelMissionFortifications.mjs";
import { MISSION_TERRAIN, SampleMissionTerrain, SampleMissionNaturalHeight, MissionPathDistance, SampleMissionGroundColor, SampleMissionGroundSurface, TrenchPlanFor } from "./Data_FirstLevelMissionTerrain.mjs";
import { PlanTrenchDressing } from "./Script_TrenchPlan.mjs";
// 2026.09.19 第二波：这一关的**边界**。军列与车站下线之后，旧的 z 到 743
// （进站跑道尽头）有一半是空地 —— 地形高度场每格点都要烘，纯白烧。
// z 北到 -232：最北的实体是弹药屋北墙 z=-219.3，北侧那道 3.1 m 地形墙在
//   z −202…−184 之间爬满，进攻出生线在 z≈−199，都留在里面。
// z 南到 370：夜景北门片最南一件是门楼 z=349.5，行军终点锚点 z=352。
// x **不收**：−205 / 137 正是东西两道地形墙各自爬满的那条线
//   （Data_FirstLevelMissionTerrain.SampleMissionNaturalHeight），再往里收就把墙削了。
const MISSION_BOUNDS = Object.freeze({ minX: -205, maxX: 137, minZ: -232, maxZ: 370 });
// 铁路桥（18）南北引道的一段低轨：两根钢轨坐在枕木上、枕木坐在跟着共享高度场
// 走的浅道砟上。Script_RoadSpline 照这份 spec 建（白盒场与场景样条编辑器共用），
// 没有绝对高度的轨道盒。轨顶高出土面约 0.3 m。
export const MISSION_RAILWAY = Object.freeze({
  id: "MissionRailway",
  // 北端停在 3 m 田埂脚下（z < -184）当远景，不往上爬；南端到桥南 z=185 就收 ——
  // 再往南是接收院与撤离线那一片，铺下去只是一条没人用的路基。
  points: Object.freeze([[-77, -186], [-77, 185]]),
  gauge: 1.435,
  // Ballast top: soil smoothed over +/-24 m, then kept 0.06-0.18 m above the local soil.
  crown: Object.freeze({ step: 4, smooth: 6, lift: 0.1, clampLo: 0.06, clampHi: 0.18 }),
  // 道砟/枕木/钢轨在铁路桥那一段断开。弧长 = z - 起点 z（这条线是一条直线，
  // s 与 z 一一对应）。不断开的话 crown 被 clampHi 钉在本地地面 +0.18，整条轨
  // 会跟着河槽栽到 -4 m 去；桥面上的两段直轨在下面的 RailBridge* 里单摆。
  sleeperGaps: Object.freeze([MISSION_RAIL_BRIDGE.gapZ.map((z) => z + 186)]),
  railGaps: Object.freeze([MISSION_RAIL_BRIDGE.gapZ.map((z) => z + 186)]),
  bed: Object.freeze({ material: "railBallast", topHalf: 1.7, slope: 1.6, embed: 0.25, step: 4, chunkLen: 48,
    gaps: Object.freeze([MISSION_RAIL_BRIDGE.gapZ.map((z) => z + 186)]) }),
  sleeper: Object.freeze({ material: "timber", along: 0.22, h: 0.14, length: 2.5, lift: 0.02,
    spacing: 0.75, jitter: 0.03, ryJitter: 0.02 }),
  // Rail foot rests on the sleeper top (crown + 0.09).
  rail: Object.freeze({ material: "metal", w: 0.08, h: 0.13, lift: 0.155, segLen: 12 }),
});
const blocks = [],
  gates = [],
  surfaces = [];
function Block(id, x, z, w, h, d, semantic = "structure", extra = {}) {
  const block = {
    id,
    x,
    z,
    w,
    h,
    d,
    y: SampleMissionTerrain(x, z) + h / 2,
    semantic,
    tag: "whiteboxWall",
    ...extra,
  };
  blocks.push(block);
  return block;
}
function Wall(id, x, z, w, h, d) {
  return Block(id, x, z, w, h, d, "cover", { cover: { faceX: 0, faceZ: -1 } });
}
function GroundedWall(id,x,z,w,h,d){
  const wall=Wall(id,x,z,w,h,d),top=wall.y+wall.h/2;
  const base=Math.min(...[-1,0,1].flatMap(a=>[-1,0,1].map(b=>SampleMissionTerrain(x+a*w/2,z+b*d/2))))-.1;
  wall.y=(top+base)/2;wall.h=top-base;return wall;
}
/**
 * 同样贴地的体块，但**不登记 cover 面**。背坡土坎、河岸土堤这类东西高 3 m，
 * 按 cover 登记会让 AI 把整道坡当成一排射击位（DeriveCoversFromColliders 照旧
 * 会从实体盒里推出该有的那些）。
 */
function GroundedBlock(id,x,z,w,h,d,semantic="earthDark",extra={}){
  const top=SampleMissionTerrain(x,z)+h;
  const base=Math.min(...[-1,0,1].flatMap(a=>[-1,0,1].map(b=>SampleMissionTerrain(x+a*w/2,z+b*d/2))))-.1;
  return Block(id,x,z,w,top-base,d,semantic,{y:(top+base)/2,...extra});
}
function DoorWall(id, x, z, w, h, opening = 3.8) {
  const side = (w - opening) / 2;
  Wall(`${id}Left`, x - (w + opening) / 4, z, side, h, 0.6);
  Wall(`${id}Right`, x + (w + opening) / 4, z, side, h, 0.6);
  Block(`${id}Lintel`, x, z, opening, 0.45, 0.6, "structure", { y: SampleMissionTerrain(x, z) + h - 0.225 });
}
function Room(id, x, z, w, d, { southDoor = true, northDoor = true, eastWindow = false } = {}) {
  if (southDoor) DoorWall(`${id}South`, x, z + d / 2, w, 2.9);
  else Wall(`${id}South`, x, z + d / 2, w, 2.9, 0.6);
  if (northDoor) DoorWall(`${id}North`, x, z - d / 2, w, 2.9);
  else Wall(`${id}North`, x, z - d / 2, w, 2.9, 0.6);
  Wall(`${id}West`, x - w / 2, z, 0.6, 2.9, d);
  if (eastWindow) {
    Wall(`${id}EastFront`, x + w / 2, z - d * 0.36, 0.6, 2.9, d * 0.28);
    Wall(`${id}EastBack`, x + w / 2, z + d * 0.36, 0.6, 2.9, d * 0.28);
    Wall(`${id}WindowSill`, x + w / 2, z, 0.6, 0.82, d * 0.44);
    Block(`${id}WindowTop`, x + w / 2, z, 0.6, 0.5, d * 0.44, "structure", {
      y: SampleMissionTerrain(x + w / 2, z) + 2.65,
    });
  } else Wall(`${id}East`, x + w / 2, z, 0.6, 2.9, d);
  // Cut-away whitebox roof leaves rooms legible while retaining actual cover.
  Block(`${id}Roof`, x - w * 0.28, z, w * 0.4, 0.22, d, "structure", { y: SampleMissionTerrain(x,z) + 3.05 });
}
/**
 * 檩条与一段望板。屋内伏击那一拍玩家是**躺在地板上仰头**看的
 *（docs/Data_FirstLevelRoomAmbush.md）：白盒剖面屋顶（`<id>Roof` 只盖西侧四成）
 * 留下的那一大片天空正好落在视野正中，躺在屋里却看见白天的天。
 *
 * 这里补一套梁与板，**不整个封死** —— 剖面屋顶的可读性（俯视能看进屋里）要留着，
 * 中间那道窄缝也正好给一束天光。全部在墙顶（2.9 m）之上，不影响走位与碰撞。
 */
function Rafters(id, x, z, w, d) {
  const ground = SampleMissionTerrain(x, z);
  // 脊檩：南北向，压在两扇门的中线上。
  Block(`${id}Ridge`, x, z, 0.34, 0.34, d + 0.6, "timber", { y: ground + 3.26 });
  // 横梁：每 1.85 m 一根，东西向跨满整间屋。
  const step = 1.85, count = Math.floor((d - 1.2) / step);
  for (let i = 0; i <= count; i += 1)
    Block(`${id}Rafter${i}`, x, z - d / 2 + 0.9 + i * step, w, 0.16, 0.24, "timber", { y: ground + 3.02 });
  // 东侧那半边补一段望板：剖面屋顶盖的是西侧，躺在地上仰头看的正是这一片。
  Block(`${id}Boards`, x + w * 0.26, z, w * 0.46, 0.14, d, "timber", { y: ground + 3.16 });
}

// 2026.09.19 第二波：三节车厢、蒸汽机车、三扇车门 gate、卸车月台那一套
// （SupplyTable / UnloadingShed / BrokenStationWall / Apron*/TrenchMouth*/RailLock*/
//  FlankLockBank / 水塔 / StationSupply / StationMedical / stationCasualties /
//  MISSION_SUPPLIES.Unloading / derailCar）随军列开场一起下线 —— 运行时早已不装它们。
// 归档夹具 `?whitebox=p012-archive`（Data_FirstLevelP012Station 的同名件）原样保留，
// Script_FirstLevelWhiteboxField 的 IsP012TrainBlock / SetTrainOffset / SetCarDerailment
// 仍归它用。git history 里能取回旧摆法，这里不留注释墓碑。
// Rally behind the eastern earth traverse while the player clears the breach.
const trenchRallyWall=GroundedWall("TrenchRallyEast",-42.3,33,.65,2,15);
trenchRallyWall.cover={faceX:1,faceZ:0,
  points:[27,29,31,33,35,37,39].map(z=>({x:trenchRallyWall.x,z}))};
// L-shaped whitebox shelters sit inside the excavated trench, with a 2.4 m
// centre gap between opposite front faces. Both visible arms have real solids.
for(const station of [...TC.rally,...TC.approach,...TC.support]){
  const x=station.x+station.side*TC.wallOffsetM;
  GroundedWall(`TrenchBound${station.id}Front`,x,station.z,TC.wallWidthM,TC.wallHeightM,TC.wallDepthM);
  const wing=GroundedWall(`TrenchBound${station.id}Wing`,station.x+station.side*TC.wingOffsetM,
    station.z+TC.wingLengthM/2,TC.wingDepthM,TC.wallHeightM,TC.wingLengthM);
  wing.cover={faceX:station.side,faceZ:0,points:TC.postRearM.map(rear=>({x:wing.x,z:station.z+rear}))};
}
// Roofed dressing recess and two solid traverses shelter the private exchange.
Block("OpeningShelterRoof",-32,-20,7,.25,11,"timber",{y:1.05});
GroundedWall("OpeningShelterSouth",-32,-15.5,7,2.4,.8);
GroundedWall("OpeningShelterNorth",-32,-26,7,2.4,.8);
GroundedWall("OpeningShelterEast",-28,-18,.8,2.4,5);
GroundedWall("OpeningShelterEastNorth",-28,-25.5,.8,2.4,2);
GroundedWall("OpeningShelterWest",-36,-17,.8,2.4,4);
GroundedWall("OpeningShelterWestNorth",-36,-24,.8,2.4,4);
// Defensive parapets are small sandbag stacks above genuine excavated soil.
for (const x of [-25, 0, 15]) {
  Wall(`FrontParapet${x}`, x, -131, 6, 0.55, 0.9);
  Wall(`FrontTraverseCover${x}`, x + 3.6, -119.4, 0.8, 0.65, 2);
}
// 06 背坡伤员集结处的那道反坡（2026.09.19 契约 §3）。不是「掩体」是地形：
// 集结处在它南边，站在担架旁边看不见机枪位、看不见掩蔽部门外、看不见北边来敌。
// 缺口留在 x -44..-40（rearCorner 的折角），02 的队伍从那儿穿过去。
GroundedBlock("CollectionBackslopeWest",-50,-115.5,12,3,2.5);
GroundedBlock("CollectionBackslopeEast",-27,-115.5,26,3,2.5);
// 集结处南缘的低土壁：担架排在它北边，老周就靠这堵墙等担架（06 的借火戏）。
// 不往东摆第二道：那边是 02/05→06 进出集结处的走廊。
GroundedWall("CollectionLitterWall",-40,-95,9,1.1,0.7);
Room("BundleSupplyHouse",Sortie.house.x,Sortie.house.z,9,10,{northDoor:false});
Block("BundleCrate",Sortie.bundle.x,Sortie.bundle.z,1.2,.5,.8,"missionRoute");
for(const crawl of Sortie.crawl){
  const ground=SampleMissionTerrain(crawl.x,crawl.z);
  Block(`BundleCrawl${crawl.id}Roof`,crawl.x,crawl.z,crawl.w,Sortie.crawlRoofM,crawl.d,"timber",
    {y:ground+Sortie.crawlClearanceM+Sortie.crawlRoofM/2});
  for(const side of [-1,1])GroundedWall(`BundleCrawl${crawl.id}Side${side}`,crawl.x+side*crawl.w/2,
    crawl.z,.4,2.4,crawl.d+2);
}
// Traverse walls face the tank road and interrupt long fire lanes. Open ends lead around each bend.
for(const [i,x,z,d] of [[0,45,-131,9],[1,53,-143,8],[2,45,-161,9],[3,51.5,-177,8]])
  GroundedWall(`BundleTankScreen${i}`,x,z,.7,2.6,d);
// A traverse stops the tank from firing lengthwise down the full front trench.
GroundedWall("FrontTraverseBlastScreen",25.1,-124.5,.7,3.75,5.5);
GroundedWall("BundleParapet",13,-118.9,5.2,1.65,.7);
GroundedWall("FlankParapet",23,-112.6,5.4,1.5,.75);
// The forward weapon belongs to its real gunner; no suspended placeholder mesh.
// Side protection sits behind the muzzle so the documented firing arc stays usable.
for (const side of [-1, 1]) GroundedWall(`MachineGunSideCover${side}`, side * 2.8, -126.7, 0.65, 1.8, 4);
// The authored ZB-26 minimum is 0.12294 m below its model origin.
const gunRestTop=SampleMissionTerrain(0,-128)+1.45+.08-.12294;
const gunRestHeight=gunRestTop-SampleMissionTerrain(0,-128.55);
Block("MachineGunRest",0,-128.55,1.18,gunRestHeight,1.0,"cover");
// A timber firing step carries the shooter's feet even after nearby shelling
// deforms the soil. The gun and the shooter share a stable physical foundation.
Block("MachineGunFiringStep",0,-127.5,2.2,.18,1.9,"timber",
  {y:SampleMissionTerrain(0,-127.4)-.09});
for (const [i, x, z, w] of [
  [0, -26, -164, 10],
  [1, 28, -158, 9],
  [2, 62, -144, 10],
  [3, 35, -82, 14],
])
  Wall(`FieldRuin${i}`, x, z, w, i<2?.75:1.3, 0.7);
for(const x of [-28,-23,-18,-13,-8,-3,2,7])Wall(`WithdrawCover${x}`,x,-150,3.8,.88,.65);
// The three 0.62 m EnemyForwardCover slabs that used to sit alone on z=-173 are gone: they were
// below the crouch-and-hide band and one 4.2 m slab only ever registered a single cover point.
// The FRONT_COVER rows at the end of this file rebuild that row across the whole front.
// Real shelter for the waiting pairs; south-facing withdrawal paths remain open.
for(const [i,post] of FRONT_GUARD_POSTS.entries()) {
  GroundedWall(`GuardWaitingCover${i}`,post.x,post.z-1.25,5.8,1,.65);
  for(const side of [-1,1])GroundedWall(`GuardWaitingWing${i}_${side}`,post.x+side*2.7,post.z,.5,1,3.8);
}
for(const [i,x,z] of [[0,-16,-149.5],[1,-8,-151.5],[2,12,-151.5],[3,23,-151.5],[4,-32,-153.5],[5,-6,-158.5]])
  Wall("AssaultApproachCover"+i,x,z,2.6,.58,.6);
// The village route passes through a kitchen, inner courtyard and connected rooms.
Room("Kitchen", 58, -9, 12, 15, { northDoor: true, southDoor: true });
Room("ConnectedHouse", 58, 8, 12, 15, { northDoor: true, southDoor: true, eastWindow: true });
// A real cupboard wall hides the bayonet soldier from the kitchen approach.
// The passage at x=58 remains open, and a player who flanks can still shoot him early.
Wall("MeleeAlcoveScreen", 61, 2.2, 4, 1.9, 0.35);
// Two more hide spots for the room ambush (docs/Data_FirstLevelRoomAmbush.md).
// The west screen runs north-south beside the west wall, so (53.6, 2.4) and (53.6, 4.6)
// are behind it both from the north door (58, 0.5) and from the trigger point (58, 6).
// The south-east crate stack covers (62.4, 14.3) from the same two eyes. Neither piece
// touches the x=58 stretcher lane, the north door or the south door opening.
Wall("AmbushWestScreen", 54.6, 3.5, 0.35, 1.9, 4.2);
// 货箱堆要留得出一个人真的站得下的角落：南面到墙内侧 1.8 m，东面到墙内侧 0.3 m。
// 留窄了出生点会被物理挤出屋外（实拍把侧翼那个顶到了 (60.5,16.5)）。
Block("AmbushCornerCrates", 61.9, 12.6, 3, 1.7, 1.6, "cover");
// 被砸倒之后是躺着仰头看的：这间屋子的头顶上必须有东西（见 Rafters 的注释）。
Rafters("ConnectedHouse", 58, 8, 12, 15);
// 连屋东墙通东巷的那扇门（09：melee 组从那边进来，不再预埋伏击位）。
// Room() 的窗下槛是一整条 6.6 m，这里把它在 z 8.0..9.2 断开 1.2 m —— 门是
// 落地的，人直接走进来，不用翻 0.82 m 的窗台。
{
  const sill = blocks.find((block) => block.id === "ConnectedHouseWindowSill");
  const south = sill.z + sill.d / 2;                      // 11.3
  sill.d = 8.0 - (sill.z - sill.d / 2); sill.z = 8.0 - sill.d / 2;   // z 4.7..8.0
  Wall("ConnectedHouseEastDoorSill", sill.x, (9.2 + south) / 2, 0.6, 0.82, south - 9.2);
  Block("ConnectedHouseEastDoorLintel", sill.x, 8.6, 0.6, 0.5, 1.2, "structure",
    { y: SampleMissionTerrain(sill.x, 8.6) + 2.65 });
}
Room("MachineGunHouse", 43, 8, 12, 15, { northDoor: true, southDoor: true, eastWindow: true });
Wall("CourtyardWest", 33, 25, 0.7, 2.5, 19);
Wall("CourtyardEast", 72, 20, 0.7, 2.5, 28);
DoorWall("CourtyardExit", 53, 34, 39, 2.5, 5);
gates.push({
  id: "MissionCourtyardGate",
  x: 53,
  y: 1.3,
  z: 34,
  w: 5,
  h: 2.6,
  d: 0.4,
  semantic: "missionRoute",
  signal: "MissionCourtyardGateOpen",
});
Wall("VillageRoadBlock", 36, -10, 10, 1.15, 0.7);
Wall("EastLaneRuin", 95, 6, 0.7, 2.1, 23);
Wall("VillageApproachCover", 28, -30, 9, 1.05, 0.6);
// ---------------------------------------------------------------------------
// 08—10 主街、东巷、绕回短巷（2026.09.19 契约 §3）
// ---------------------------------------------------------------------------
// 主街是内院东墙（CourtyardEast, x=72）与新的东侧临街墙（x=82）之间那条
// 9.3 m 宽的南北巷。担架队原本要从这儿直下桥头；08 把它堵上。
GroundedWall("StreetWestWallNorth",72,-8,0.7,2.6,28);
GroundedWall("StreetWestWallSouthA",72,36,0.7,2.6,4);
GroundedWall("StreetWestWallSouthB",72,49,0.7,2.6,6);   // 缺口 z 38..46 是 10 的绕回巷接口
GroundedWall("StreetEastWallNorth",82,-10,0.7,2.6,24);
// 东侧那户人家的窗：正对主街障碍**北侧**，日军占住它就封死整条街。
Wall("StreetEastWindowSill",82,5,0.7,0.85,6);
Block("StreetEastWindowTop",82,5,0.7,0.5,6,"structure",{y:SampleMissionTerrain(82,5)+2.55});
// 东巷口在 z 8..14；z 35..45 再留一个口 —— 内院追兵（MISSION_TACTICS 的
// CourtyardPursuerA/B/C）就是从村东沿这条线压过来的，堵死等于把 10 的追击掐了。
GroundedWall("StreetEastWallSouthA",82,24.5,0.7,2.6,21);
GroundedWall("StreetEastWallSouthB",82,48.5,0.7,2.6,7);
// 障碍：倒下的院墙 + 横倒的大车，中间只剩 0.9 m 的人缝。
// 0.9 而不是契约写的「≤0.8」：玩家胶囊半径 0.34（Script_Physics.MakeCharacter），
// 0.8 只剩每侧 0.06 m，真走会卡；0.9 留 0.11 m，而担架队 1.25 m 的通行宽仍过不去。
GroundedWall("StreetBlockFallenWall",74.3,20,3.85,1.35,2);
Block("StreetBlockCart",79.4,20,4.55,1.6,2.6,"timber");
Block("StreetBlockCartWheel",77.4,18.4,0.3,1.2,1.2,"timber",{solid:false});
// 担架队等待的可靠遮挡：从障碍与东窗两个方向过来的射线都被它切断。
GroundedWall("LitterHoldCover",66,-16.5,10,1.5,0.8);
// 东巷：日军从村东突入的那条；与连屋相通（连屋东墙的窗下槛断开 1.2 m 是那扇门）。
GroundedWall("EastAlleyNorthWall",87.5,2,11,2.6,0.7);
GroundedWall("EastAlleySouthWall",89,20,14,2.6,0.7);
GroundedWall("EastAlleyEastStub",94,-4,0.7,2.6,12);
// 10 的绕回短巷：内院门 → 南 → 东 → 主街障碍南侧。北侧就是内院南墙。
// 南墙到 x=68 为止：再往东就压在内院追兵切进来的那条线上（CourtyardPursuerB/C）。
GroundedWall("RejoinAlleySouth",59,44,18,2.6,0.7);
GroundedWall("RejoinAlleyWest",50,39,0.7,2.6,10);
// Ground-level transfer yard, queue lane and two loading bays.
for (const x of [64, 88])
  for (const z of [109, 129]) Block(`TransferPost${x}_${z}`, x, z, 0.4, 3.5, 0.4, "structure");
Block("TransferCanopy", 76, 119, 25, 0.25, 22, "structure", { y: 3.65 });
Wall("TransferEastCover", 98, 104, 0.75, 1.1, 11);
Wall("TransferCorner", 95, 96, 8, 1.1, 0.7);
Wall("TransferWestCover", 53, 121, 0.75, 1.1, 10);
Block("TriageDesk", 66, 116, 2, 0.85, 1, "missionRoute");
Block("TransferCrates", 93, 111, 2, 1.15, 3, "cover");
// 12 的第二处威胁：侧巷。两道院墙夹出 7.3 m 净宽的东西向巷子，巷口朝**西**
// 正对装载区的车位与牛马车的出场道（cartRide 沿 x≈76–86 往北走）。
// 2026.09.19 第二波挪回装载区**东南侧**：Notion 的口径是「村东突入部队沿既有
// 东巷追出」，第二处威胁就该从东／东南压过来。第一波之所以摆在西侧，是因为
// 东侧 x 94–112 被 transferFlank/transferLast/transferRear 与 MISSION_PURSUIT_ROUTE
// 占着 —— 那三组已随新版下线（12 只剩 transfer 与 transferAlley 两处），
// 追兵线 MISSION_PURSUIT_ROUTE 走 z=120.5 的北沿，从巷口北边擦过去，不打架。
// 北墙比南墙短 4 m（x 102..112 对 98..112）：空袭后的村东追兵（MISSION_ENCOUNTERS.air
// → MISSION_PURSUIT_ROUTE）正是沿 x≈100 这条线南下再转西的，一道齐头的北墙会把
// 他们整组顶死在墙根上（实测 AirPursuerA–D 四条线全撞 SideAlleyNorthWall）。
// 让开之后巷口朝西北张开，机枪的射界也顺带罩住装载区那一侧。
// 集成复核：AirPursuerC 从 (115,100) 直插追兵线 (100,120.5) 时擦过北墙西端（102.2,117.4），再收 1.5 m（x 103.5..112）。
GroundedWall("SideAlleyNorthWall", 107.75, 118, 8.5, 2.6, 0.7);
GroundedWall("SideAlleySouthWall", 105, 126, 14, 2.6, 0.7);
// 巷子东头封口，火力位只能从西边那个口出来（不然它就是一片开阔地不是巷子）。
GroundedWall("SideAlleyEastStub", 112, 122, 0.7, 2.6, 8);
// 旧西侧那两道墙改成装载区西缘的一段普通院墙：车位与人群那一侧要有个边，
// 但不再夹出巷子。让开 ditchMouth (53,114) 与 evacuation 的起手一段。
GroundedWall("TransferYardWestWall", 50, 131, 0.7, 2.6, 12);
// 11—12 玩家守村路的低墙：装载区**北**缘、桥头路西肩的一段矮墙，趴在它后面
// 正对村落方向来的路。东边不再加第二段 —— x 79–92 是村东追兵（TransferRear*）
// 上来的线；也不能往南挪进 z 88–111，那整片是接运人群横向分流的通道
// （MISSION_CROWD_AREAS.transfer 的 entryZ=88 / exitZ=111）。
GroundedWall("TransferVillageWallWest", 66.5, 84, 13, 1.2, 0.8);
// ---------------------------------------------------------------------------
// 北沙河两座桥（2026.09.19 契约 §3）
// ---------------------------------------------------------------------------
// 路桥：河槽从「1.8 m 深的排水沟」变成 28.4 m 宽、4.2 m 深的河槽之后，旧的
// 8x7 甲板两头都悬在坡上。甲板加长到 32 m（z 137..169，河口在 138.8..167.2），
// 下面加两排排架墩。gate 生命周期一个字不改：信号到了甲板消失、可走面撤掉，
// MissionBridgeWreck 顶上来。
const bridge = Block("TemporaryBridge", MISSION_SOUTH_BRIDGE.deck.x, MISSION_SOUTH_BRIDGE.deck.z,
  MISSION_SOUTH_BRIDGE.deck.w, MISSION_SOUTH_BRIDGE.deckH, MISSION_SOUTH_BRIDGE.deck.d,
  "structure", { y: MISSION_SOUTH_BRIDGE.deckY, dynamic: true });
surfaces.push(bridge);
gates.push({ ...bridge, walkableId: bridge.id, signal: "MissionBridgeDestroyed" });
gates.push(MISSION_SOUTH_BRIDGE.wreck);
{
  const deckBottom = MISSION_SOUTH_BRIDGE.deckY - MISSION_SOUTH_BRIDGE.deckH / 2;
  for (const px of MISSION_SOUTH_BRIDGE.pierRows) for (const pz of MISSION_SOUTH_BRIDGE.pierZ) {
    const foot = SampleMissionTerrain(px, pz) - 0.2;
    Block(`TemporaryBridgePier${px}_${pz}`, px, pz, 0.55, deckBottom - foot, 0.55, "timber",
      { y: (deckBottom + foot) / 2 });
  }
}
// 铁路桥（18）。完好件全部是 gate（signal），残骸件是 appearSignal —— 桥被破坏
// 之后甲板连同可走面一起撤掉，人再也过不去（河槽底在 -4.2）。
{
  const B = MISSION_RAIL_BRIDGE, deckBottom = B.deckTopY - B.deckH;
  const deck = Block("RailBridgeDeck", B.x, B.z, B.deckW, B.deckH, B.deckHalfD * 2, "structure",
    { y: B.deckTopY - B.deckH / 2, dynamic: true });
  surfaces.push(deck);
  gates.push({ ...deck, walkableId: deck.id, signal: B.signal });
  for (const side of [-1, 1]) {
    // 桁架：甲板两侧的主梁，站在桥上视线被它夹住，从南岸看得见桥的轮廓。
    gates.push({ id: `RailBridgeTruss${side < 0 ? "West" : "East"}`, x: B.x + side * B.trussOffsetX,
      y: B.deckTopY + B.trussH / 2, z: B.z, w: B.trussW, h: B.trussH, d: B.deckHalfD * 2 - 2,
      semantic: "metal", signal: B.signal });
    // 桥面直轨：道砟与轨在 gapZ 断开，这两段把轨接过河。
    gates.push({ id: `RailBridgeRail${side < 0 ? "West" : "East"}`, x: B.x + side * B.railGaugeHalf,
      y: B.deckTopY + 0.065, z: B.z, w: 0.08, h: 0.13, d: B.deckHalfD * 2 - 1,
      semantic: "metal", signal: B.signal });
  }
  // 桥台做成两侧的翼墙而不是一整道：桥面下的实心盒会被路线净空判成「挡住尾队」
  // （可走面只豁免甲板本身），翼墙让开 x=-77 的中线。
  for (const [i, az] of B.abutmentZ.entries()) for (const side of [-1, 1]) {
    const ax = B.x + side * (B.abutmentW / 2 - 1);
    const foot = SampleMissionTerrain(ax, az) - 0.3;
    Block(`RailBridgeAbutment${i ? "South" : "North"}${side < 0 ? "West" : "East"}`, ax, az, 2,
      deckBottom - foot, B.abutmentD, "structure", { y: (deckBottom + foot) / 2 });
  }
  const floor = SampleMissionTerrain(B.x, B.z);
  gates.push({ id: "RailBridgeWreckSpan", x: B.x, y: floor + 0.7, z: B.z, w: B.deckW, h: 1.4, d: 16,
    semantic: "structure", appearSignal: B.signal });
  gates.push({ id: "RailBridgeWreckTruss", x: B.x - 2.4, y: floor + 1.5, z: B.z - 6, w: 0.6, h: 3, d: 12,
    semantic: "metal", appearSignal: B.signal });
  // 北桥头的断板：炸完之后堵在引道上，人走到这儿就到头了（不是「走过去掉下河」）。
  gates.push({ id: "RailBridgeWreckStub", x: B.x, y: deckBottom + 0.75, z: B.z - B.deckHalfD + 3.5,
    w: B.deckW, h: 1.5, d: 3, semantic: "earthDark", appearSignal: B.signal });
}
// ---------------------------------------------------------------------------
// 北沙河的水面（2026.09.19 第二波）
// ---------------------------------------------------------------------------
/**
 * 河槽原来只是一道凹地 —— 站在桥上往下看是一条土沟，读不出「这是一条河」。
 * 这里沿槽底铺一层**示意水面**：`solid:false`，不进碰撞、不挡子弹、不进
 * PlanTrenchDressing 的 keepOut，净空与视线断言也都按 `solid !== false` 过滤，
 * 所以它挡不住任何一条路线、也挡不住任何一条射线。
 *
 * 水位取槽底以上 `LEVEL` = 1.2 m（契约要的 1.0–1.4）。三月枯水，河面比槽窄：
 * 平槽底半宽 11 m，水面只铺 7.5 m 半宽，两侧各留 3.5 m 干滩。
 * 浅滩（WestDitchFord，x≈47）那一段断面只有 1.05 m 深 —— 1.2 m 的水位会顶到
 * 自然地面之上，所以 `depth < 3` 的 x 一律不铺：撤离线过河踩的就是那片露出来的
 * 滩地，`floorHalfW` 一路收窄，水面在进浅滩之前先变窄、再断开。
 * 两座桥下连续：路桥甲板底在 +0.0、铁路桥甲板底在 +0.11，水面在 −3 m 上下。
 */
{
  const RIVER = MISSION_NORTH_RIVER, SEG = 6, LEVEL = 1.2;
  for (let x = -192; x <= 132; x += SEG) {
    const profile = RiverProfileAt(x, RIVER);
    if (profile.depth < 3) continue;                       // 浅滩：露滩地，不铺水
    const halfW = Math.min(7.5, profile.floorHalfW - 3.5);
    if (halfW < 1) continue;
    Block(`NorthRiverWater${Math.round(x) < 0 ? "W" : "E"}${Math.abs(Math.round(x))}`,
      x, RIVER.z, SEG + 0.2, 0.14, halfW * 2, "water",
      { y: SampleMissionTerrain(x, RIVER.z) + LEVEL, solid: false });
  }
  // 水边的芦苇丛：给河一条读得出来的边。踩在水线外 0.6 m 的干滩上、顶过水面
  // 0.6 m（不然一丛比水面还矮的草在水边读不出来）。不带碰撞。
  for (const [i, x] of [-150, -108, -60, 18, 66, 92, 118].entries()) for (const side of [-1, 1]) {
    const halfW = Math.min(7.5, RiverProfileAt(x, RIVER).floorHalfW - 3.5);
    const z = RIVER.z + side * (halfW + 0.6);
    Detail(`NorthRiverReeds${i}${side < 0 ? "N" : "S"}`, x, z, 3.4, 1.9, 1.2, "foliage",
      { y: SampleMissionTerrain(x, z) + 0.95 });
  }
}
// 南岸遮挡（18 的射位）：中间留 x -77..-69 的缺口，爆破安全区从那儿看得见桥。
GroundedWall("BridgeSouthCoverWest", -82.5, 177.6, 9, 1.3, 0.8);
GroundedWall("BridgeSouthCoverEast", -64.5, 178.4, 9, 1.45, 0.8);
// 北岸土坎：敌军火力位（bridgeEnemy 在它北边，隔着土坎对射）。铁路那一段留缺口。
GroundedWall("BridgeNorthRidgeWest", -87, 132.2, 10, 1.45, 1.2);
GroundedWall("BridgeNorthRidgeEast", -66, 132.2, 12, 1.45, 1.2);
// 爆破安全区的遮挡：离桥心 48 m，站姿眼高 1.6 刚好越过它看见桥面。
GroundedWall("BlastSafeBank", -66, 197.5, 7, 1.35, 0.9);
// Three separate rearguard pockets turn south after the western ditch mouth.
GroundedWall("DrainCorner",28,134,4,1.2,.7);
GroundedWall("DrainSightBreak",44,160,9,2.8,1);
GroundedWall("RearWallGapWest",45,184,16,2.8,.7);
GroundedWall("RearWallGapEast",65,184,14,2.8,.7);
GroundedWall("RearWallSightBreak",38,199,16,2.8,1);
GroundedWall("BackyardWall",21.5,224,7,2.8,.7);
Room("RearCourtyardHouse",27,232,13,12,{eastWindow:true});
// One reception compound: street room, ward, second cover and an actual west back door.
Room("ReceptionStreetRoom",-5,229,10,14,{eastWindow:true});
Room("ReceptionWard",-26,234,14,18,{eastWindow:true});
Wall("ReceptionNorth",-22,218,37,2.8,.7);
DoorWall("ReceptionSouth",-22,252,37,2.8,5);
Wall("ReceptionWestNorth",-41,229.75,.7,2.8,23.5);
Wall("ReceptionWestSouth",-41,249.25,.7,2.8,5.5);
Block("ReceptionRearLintel",-41,244,.7,.45,5,"structure",{y:2.575});
Block("ReceptionMedicine",-31,236,1,.7,1,"missionRoute");
Wall("ReceptionSecondCover",-32,242,4,1.05,.7);
Wall("RearExitCover",-43,235,4,1.05,.7);
Wall("FinalAlleyCover",-60,210,.7,1.2,12);
// ---------------------------------------------------------------------------
// 15B—16（2026.09.19 契约 §3）
// ---------------------------------------------------------------------------
// 靠院墙的夹道（15B）：北侧 2.8 m 连续院墙、南侧 1.1 m 矮墙，净宽 2.8 m；
// 西端左拐向南，途中一处 0.22 m 的坎（「前头有坎，抬高点」「前头往左拐」）。
// 这就是 MISSION_REAR_ROUTES.evacuation 的尾段本身 —— 沟到 (56,207) 为止。
GroundedWall("WallPathYardWall",25,209.5,22,2.8,0.7);
GroundedWall("WallPathLowWall",27,213,18,1.1,0.7);
Block("WallPathBump",24,211.25,1.2,0.22,2.8,"step",
  {y:SampleMissionTerrain(24,211.25)+0.11});
// 左拐外侧的那堵墙。南边不再补第二道：后院追兵（MISSION_TACTICS.YardPursuer*）
// 从 (26,215) 斜切到 retreatC，第二道墙正好横在他们那条线上。
GroundedWall("WallPathTurnWest",13.25,216.5,0.7,2.8,10);
// 接收院院门（15C 守军盘问处）：院子东墙上 4 m 净宽的门洞，担架抬得进去。
// 旧的 evacuation 路线本来就从 (9,240)→(-13,240) 横穿这里，现在它走的是一道真门。
// 南边那垛只做 3 m 的门垛：再往南是 ReceptionRifleB 沿 z=247 切进院子的线。
GroundedWall("ReceptionEastNorth",2,228,0.7,2.8,20);
GroundedWall("ReceptionEastSouth",2,243.5,0.7,2.8,3);
Block("ReceptionGateLintel",2,240,0.7,0.45,4,"structure",
  {y:SampleMissionTerrain(2,240)+2.575});
// 16 的门槛：厢房南门。0.15 m，低于 TRAVERSAL.stepMax(0.55)，走得过去但会颠一下。
Block("WardThreshold",MISSION_RECEPTION_SPACE.wardThreshold.x,MISSION_RECEPTION_SPACE.wardThreshold.z,
  3.8,0.15,0.7,"step",
  {y:SampleMissionTerrain(MISSION_RECEPTION_SPACE.wardThreshold.x,MISSION_RECEPTION_SPACE.wardThreshold.z)+0.075});
for(const post of MISSION_DEFENSE_POSTS)GroundedWall(post.id,post.x,post.z,post.w,post.h,post.d);
// Human-scale work areas, connected landmarks and trench construction remain pure geometry.
// Small surface details have no separate collision; functional furniture and walls do.
function Detail(id, x, z, w, h, d, semantic = "timber", extra = {}) {
  return Block(id, x, z, w, h, d, semantic, {solid:false, ...extra});
}
function SupplyStack(id, x, z, rows = 2) {
  for (let row = 0; row < rows; row++) for (let col = 0; col < 2; col++) {
    const cx = x + col * .95, y = SampleMissionTerrain(cx,z) + .25 + row * .51;
    Block(id+row+col,cx,z,.84,.5,.66,"timber",{y});
    for (const side of [-1,1]) Detail(id+'Strap'+row+col+side,cx+side*.27,z,.055,.51,.68,"metal",{y});
  }
}
for (const [id,x,z,rows] of [
  ["KitchenStores",61,-12,2],["CourtStores",37,22,2],["TransferStores",66,124,3],
  ["ReceptionStores",-35,221,2]]) SupplyStack(id,x,z,rows);
// 护壁 / 踏板 / 射击位 / 杂物不再在这里手写：见文件末尾 MISSION_TRENCH_PLACEMENTS
// 那一段（沿编译好的中心线 PCG，要等 MISSION_ROUTES / MISSION_PLACEMENT 定义完）。
// Repeated sandbag seams provide scale without changing the proven solid envelope.
for (const wall of blocks.filter(b=>b.semantic==='cover' && b.h<1.21 && b.w>2 && b.d<1)) {
  for (let x=wall.x-wall.w/2+.25,i=0;x<wall.x+wall.w/2-.2;x+=.65,i++)
    Detail(wall.id+'BagSeam'+i,x,wall.z-.01,.035,wall.h+.018,wall.d+.024,'earthDark');
}
// 铁路沿线的电线杆：跟着新的轨道范围走（z −184…185），落在北沙河槽里的那一根跳过
// —— 河槽把地面切到 −4.2，杆子会长在河床上。水塔随车站一起下线。
for (let z=-184;z<=182;z+=28) {
  if (RiverCutAt(-86, z) > 0.5) continue;
  Block('TelegraphPole'+z,-86,z,.22,6,.22,'timber');
  Detail('TelegraphCrossarm'+z,-86,z,2.6,.14,.16,'timber',{y:SampleMissionTerrain(-86,z)+5.35});
  for(const side of [-1,1]) Detail('TelegraphWire'+z+side,-86+side*.9,z+14,.018,.018,28,'metal',
    {y:SampleMissionTerrain(-86,z)+5.48});
}
function FarmSilhouette(id,x,z,w,d,h=3.8) {
  Room(id,x,z,w,d);
  const ground=SampleMissionTerrain(x,z);
  Block(id+'Gable',x,z,w*.36,h-2.6,d,'plaster',{y:ground+3.1+(h-2.6)/2});
  Detail(id+'RoofRidge',x,z,.3,.28,d+.6,'roof',{y:ground+h+.4});
  for(const side of [-1,1]) Detail(id+'RoofEave'+side,x+side*w*.42,z,w*.18,.25,d+.7,'roof',{y:ground+3.25});
}
FarmSilhouette('NorthFarm',-51,-184,15,11,4.3);
FarmSilhouette('NorthRuin',59,-192,16,9,4);
FarmSilhouette('EastFarm',110,-169,17,12,5);
FarmSilhouette('VillageEdgeHouse',106,40,16,12,4.4);
FarmSilhouette('VillageRearHouse',39,65,13,11,4);
FarmSilhouette('RearFarm',-66,27,13,11,4.1);
FarmSilhouette('TransferFieldStore',120,126,13,12,4.6);
FarmSilhouette('WestFieldHouse',-113,99,15,10,4.2);
FarmSilhouette('SouthFieldHouse',60,-60,12,9,4);
FarmSilhouette('RearOrchardHouse',-120,-20,13,11,4.1);
// Poplar rows mark the field edge and break long empty sightlines without closing combat lanes.
for(const [row,points] of [
  ['East',[-180,-151,-116,-81,-43,-5,36,71,104,142,167].map((z,i)=>({x:125+(i%3)*2,z}))],
  ['West',[-165,-131,-97,-63,-29,6,84,122,151].map((z,i)=>({x:-117-(i%2)*5,z}))],
  ['SouthRoad',[-83,-51,-20,12,43,71].map((z,i)=>({x:18+(i%2)*3,z}))],
  // 铁路南引道（桥南）：旧的一列一路排到进站跑道尽头 z=743，其中东侧那一半
  // （x=-47）还压在接收院与撤离线那一带。新范围只跟到 bounds 的南界，两列都
  // 让开 x -62…1 的接收院／撤离走廊。
  ['RailApproach',[200,224,248,272,296,320,344].map((z,i)=>({x:i%2?-105:-92,z}))],
]) for(const [i,p] of points.entries()) {
  // 河槽里不长树：断面在这儿把地面切下去 4.2 m，树会立在河床上。
  if (RiverCutAt(p.x, p.z) > 0.5) continue;
  const id='FieldPoplar'+row+i, ground=SampleMissionTerrain(p.x,p.z),height=6+(i%3)*.7;
  Block(id+'Trunk',p.x,p.z,.28,height*.65,.3,'timber');
  Detail(id+'Crown',p.x,p.z,1.8,height*.6,1.6,'foliage',{y:ground+height*.75});
  Detail(id+'CrownTip',p.x+.15,p.z,1.1,1.2,1,'foliage',{y:ground+height*1.06});
}
// Interior props sit beside movement lanes and identify kitchen, ward and sorting station.
Block('KitchenStove',54,-10,1.6,1.05,1.2,'earthDark');
Detail('KitchenFlue',53.6,-10,.36,1.8,.4,'earthDark',{y:2});
Block('KitchenTable',61,-5,1.6,.8,.8,'timber');
Block('CourtyardBench',36,27,1,.45,3.4,'timber');
for(const x of [65,68]) {
  Block('TriageBench'+x,x,119,1.5,.45,.6,'timber');
  Detail('TriageBlankets'+x,x,119,1.2,.18,.55,'canvas',{y:.61});
}
for(const z of [111,114,117]) {
  Detail('SortingRailPost'+z,70,z,.12,1.1,.12,'timber');
  Detail('SortingRope'+z,70,z+1.4,.035,.035,2.8,'canvas',{y:.95});
}
for(const x of [-28,-25,-22]) {
  Block('WardShelf'+x,x,225.8,2,.8,.55,'timber');
  Detail('WardMedicalRoll'+x,x,225.8,1.3,.25,.42,'canvas',{y:1.02});
}
// Field boundaries and split fence sections leave the tank and infantry corridors open.
for(const [id,x,z,length] of [['WestFieldFence',-58,-120,36],['VillageFieldFence',12,43,22],
  ['SouthFieldFence',102,151,26]]) {
  for(let i=0;i<length;i+=3) {
    Block(id+'Post'+i,x,z+i,.14,1.05,.14,'timber');
    Detail(id+'Rail'+i,x,z+i+1.35,.09,.12,2.7,'timber',{y:SampleMissionTerrain(x,z+i)+.72});
  }
}
// ---------------------------------------------------------------------------
// Front assault cover rows (docs/Data_FrontCover.md)
// ---------------------------------------------------------------------------
// One row of broken field banks, grave mounds and wall stubs 1.6-2.5 m south of each
// FRONT_ASSAULT bound line, so a man who reaches a line has something to kneel behind instead of
// bare field. Segments only ever go inside a FRONT_COVER column, which is exactly the x span the
// rush lanes are pushed out of, so no bank can ever stand across a bound. Anything that would
// land inside an existing building, ruin or authored firing position is dropped - NorthFarm,
// FieldRuin0 and FieldRuin1 are the cover on those stretches already.
function FieldCover(id, x, z, w, h, d) {
  const top = SampleMissionTerrain(x, z) + h;
  let base = Infinity;
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1])
    base = Math.min(base, SampleMissionTerrain(x + a * w / 2, z + b * d / 2));
  base -= 0.06;
  // The foot is dug to the lowest corner so no bank floats over a field swell; h is therefore the
  // registered cover height (0.06 m taller than the authored clear height, still inside the band).
  // faceZ points south, at the Chinese line: Script_AiCover reads a cover normal as an unsigned
  // wall axis (its header), so the sign documents intent and only |dot| ever scores.
  return Block(id, x, z, w, top - base, d, "cover", { y: (top + base) / 2, cover: { faceX: 0, faceZ: 1 } });
}
{
  const existing = blocks.slice();
  const Taken = (x, z, w, d) => existing.some((block) => block.solid !== false
      && Math.abs(block.x - x) < (block.w + w) / 2 + 0.45
      && Math.abs(block.z - z) < (block.d + d) / 2 + 0.45
      && block.y + block.h / 2 > SampleMissionTerrain(x, z) + 0.3)
    || FRONT_FIELD_MEN.some((man) => Math.abs(man.x - x) < w / 2 + 0.9 && Math.abs(man.z - z) < d / 2 + 0.9);
  for (const row of FRONT_COVER.rows) for (const column of FRONT_COVER.columns) {
    if (column.rows && !column.rows.includes(row.id)) continue;
    const build = column.coverX || column.x;
    const span = build[1] - build[0] - FRONT_COVER.insetM * 2;
    const count = Math.max(1, Math.floor((span - row.w) / FRONT_COVER.pitchM) + 1);
    const used = (count - 1) * FRONT_COVER.pitchM + row.w;
    const first = build[0] + FRONT_COVER.insetM + (span - used) / 2 + row.w / 2;
    for (let i = 0; i < count; i++) {
      const x = first + i * FRONT_COVER.pitchM;
      // A man authored inside the one-metre slack of a bound line skips that line and rushes
      // straight through the row behind it. Columns cannot help there - the lane runs down the
      // column - so the bank gives way instead of the route gate failing on it.
      if (Taken(x, row.z, row.w, row.d) || FrontAssaultLaneCuts(x, row.z, row.w, row.d)) continue;
      if(MissionPathDistance({x,z:row.z},Sortie.route)<row.w/2+1.0)continue;
      FieldCover(`FrontCover${row.id}${column.id}${i}`, x, row.z, row.w, row.h, row.d);
    }
  }
}
export const MISSION_ANCHORS = Object.freeze({
  // `train` / `unload` 两个锚点随军列下线（2026.09.19 第三波）：`unload` 最后一个
  // 消费者是 Script_EditorFullScene 的「军列卸载」巡场机位，那个机位已经换成
  // 掩蔽部与伤员集结处（按 `collection` 取点）。
  front: { x: 0, z: -124 },
  orders: Sortie.orders,
  gun: { x: 0, z: -128 },
  bundle: Sortie.bundle,
  throw: { x: 30, z: -117 },
  village: { x: 55, z: -20 },
  melee: { x: 58, z: 6 },
  transferSupply: { x: 93, z: 110 },
  forwardNest: { x: -24, z: -130 },
  gate: { x: 53, z: 34 }, courtCover: { x: 67, z: 24 },
  transfer: { x: 95, z: 103 }, queue: { x: 74, z: 111 },
  ...MISSION_REAR_ANCHORS,
  ...MISSION_STAGE_ANCHORS,
});
export const MISSION_ROUTES = Object.freeze({
  flank: [
    { x: 69, z: -139 },
    { x: 80, z: -90 },
    { x: 89, z: -45 },
    { x: 91, z: -10 },
  ],
  opening: OPENING.approachRoute,
  // The rebuilt 03 entry comes from the casualty collection point. Keep only
  // that live communication-trench leg; the station-side head is retired.
  support: MISSION_STAGE_ROUTES.rearTrench.slice(4),
  bundle: Sortie.route,
  bundleReturn: Sortie.route.slice(3).reverse(),
  // 2026.09.19：orders 锚点迁到背坡伤员集结处，所以这两条返程线不再停在前沿的
  // (14,-110)，而是沿交通壕退回集结处（= collectionReturn 的后半段）。
  orders: [Sortie.throw,...MISSION_STAGE_ROUTES.collectionReturn.slice(1)],
  // The tank can be immobilized anywhere along the return trench, so the rally
  // leg starts wherever the bundle run is; the squad already walks it this way.
  ordersRejoin: [...Sortie.route.slice(3).reverse(),...MISSION_STAGE_ROUTES.collectionReturn.slice(1)],
  // 2026.09.19 第二波：旧 `south` 与 07 的 `southWalk` 合成一条。
  // 旧线从前沿 (-36,-124) 起手、走的是已经取消的那两个大折返；新版 06 的后送队
  // 是从**背坡伤员集结处**起行的（columnDeparted），和玩家走同一条线才对得上
  // 「队伍沿交通线南下」。担架队（Script_FirstLevelMissionColumn）与罗班长带路
  // 都读这个键，这里指同一个数组，不再各走各的。
  south: MISSION_STAGE_ROUTES.southWalk,
  // 2026.09.19：内院门出来之后不再斜着切到 (64,52) —— 那条线现在压在绕回短巷的
  // 南墙上。走 courtyardBypass 的巷子，在主街障碍南侧 streetRejoin 接回主街再南下。
  village: [
    { x: 48, z: -20 },
    { x: 58, z: -20 },
    ...MISSION_STAGE_ROUTES.courtyardBypass,
    { x: 78, z: 60 },
    { x: 76, z: 85 },
    { x: 74, z: 111 },
  ],
  southTraffic: [
    { x: 8, z: -119 },
    { x: 8, z: -90 },
    { x: 4, z: -66 },
    { x: -4, z: -35 },
    { x: 2, z: -8 },
    { x: 22, z: 8 },
    { x: 27, z: 40 },
    { x: 55, z: 57 },
    { x: 76, z: 85 },
    { x: 76, z: 170 },
  ],
  ...MISSION_REAR_ROUTES,
  // 2026.09.19 契约路线。沿线几何已建好、0.35 m 胶囊净空由 Script_FirstLevelSpaceTest
  // 与 Script_FirstLevelMissionTest 两道一起看着。
  ...MISSION_STAGE_ROUTES,
});
import { FRONT_GUARD_POSTS, FRONT_COVER, FRONT_FIELD_MEN, FrontAssaultLaneCuts, APPROACH_TACTICS } from "./Data_FirstLevelMissionFront.mjs";
export const MISSION_PLACEMENT = Object.freeze({
  squadFrontPositions:[{x:-1.7,z:-129},{x:1.7,z:-128.7},{x:14,z:-129},{x:16,z:-127.5}],
  reliefApproach: [...MISSION_ROUTES.support,{x:6,z:-123}],
  reliefPositions: [{x:-30,z:-123.4},{x:-26,z:-124.9},{x:-21,z:-122.8},{x:-17,z:-125},{x:-10,z:-124.3},{x:4,z:-123.2},{x:11,z:-125},{x:20,z:-124.6}],
  // First arrivals move furthest down the communication trench; the mouth stays open.
  guardWithdrawalRoutes: Array.from({length:8},(_,i)=>[
    FRONT_GUARD_POSTS[i],
    {x:FRONT_GUARD_POSTS[i].x,z:-140},
    {x:-20+i*.45,z:-137+i*.35},
    {x:-20+i*.35,z:-124+i*.2},
    {x:6,z:-124},
    {x:-8,z:-112},
    {x:-8+(i%2?1:-1),z:-92-Math.floor(i/2)*2.8},
  ]),
  kitchenInterior: {minX:53,maxX:63,minZ:-15,maxZ:-2},
  // ConnectedHouse（58,8，12×15）的可站区域：墙心 x 52/64、z 0.5/15.5，墙厚 0.6。
  // 伏击那一拍用它判断「班里人进屋了没有」。
  roomInterior: {minX:52.6,maxX:63.4,minZ:1,maxZ:15},
  // 罗班长、何有田、刘文财在灶屋北门内侧的掩护位（北墙 z=-16.5），让开 x=58 的担架通道。
  // 贴着门口而不是门外十米：挣脱之后他们要在顺子被四个人围死之前跑进屋（实拍量过）。
  ambushSquadPosts: [{x:55,z:-14.2},{x:61,z:-14.2},{x:58,z:-15.4}],
  // 幺娃跟着担架，停在屋门口西侧。
  ambushYaowaPost: {x:56.4,z:0.6},
  // 挣脱之后三个人从灶屋穿进屋里的落点（都在 roomInterior 里，让开 x=58 的担架）。
  ambushSquadEntry: [{x:56.4,z:4.6},{x:60.2,z:4.2},{x:57.4,z:8.6}],
  // 从灶屋门口穿屋门进屋的折线；两道门都在 x 56.1–59.9 的开口上。
  // 每个人再按 ambushSquadLanesM 错开一点，免得三个人在门口挤成一堆。
  ambushSquadRoute: [{x:58,z:-8},{x:58,z:-3},{x:58,z:-0.4}],
  ambushSquadLanesM: [-0.7,0.7,0],
  wardInterior: MISSION_RECEPTION_SPACE.ward,
  tankStart: { x: 36, z: -173 },
  tankTargets: [
    { x: -24, z: -130 },
    { x: 16, z: -131 },
    { x: 2, z: -132 },
  ],
  // 车位挪到装载区东半边，排成两列：旧的 (86,141) 落在北沙河的北坡上，(86,132)
  // 也贴着河口。**四个车位全在 cartRide 的出场道以东** —— 牛车的碰撞盒是
  // 3 x 5.8 m（Script_FirstLevelMissionView 的 "cart" 几何），一辆停着的车能把
  // 相邻的车道整条封死（实拍：胶囊卡在 (82,128.26)，正是停在 (82,125) 那辆车的车尾）。
  cartBays: [
    { x: 88, z: 113 },
    { x: 88, z: 121 },
    { x: 94, z: 118 },
    { x: 94, z: 126 },
  ],
  // -------------------------------------------------------------------------
  // 2026.09.19 新区的摆位（玩法包用；每点 {x,z,yaw?}，yaw 是弧度、0 朝 +z 南）
  // -------------------------------------------------------------------------
  // 01—02 掩蔽部。玩家侧躺在后半间，视线穿中隔墙缺口与前门低处破口看门外 8.5 m 的刺杀处。
  // 2026-09-20 演出打磨：整间从 8.5 × 12 收到 7 × 7，屋里屋外的摆位全部跟着前移。
  bunker: {
    player: { x: -40, z: -126, yaw: 0 },    // 面朝北，近入口的地面视角
    playerEyeM: 0.42,
    // 够不到：离玩家 2.6 m。离东墙、后墙的内表面都留出约 0.8 m，让同源 HanYang
    // 地枪模型完整躺在屋内，不把枪身插进墙里。
    rifle: { x: -39.6, z: -127.15, yaw: 0.15 },
    pinnedFrame: [{ x: -41.15, z: -123.4 }, { x: -38.85, z: -123.6 }],
    // 门外这一片全部落在破口的射影里：眼睛 (-40,-123.4,+0.42) 穿 x −41.4…−38.6
    // 那道 2.8 m 的缝，8.5 m 处开出 x −42.59…−37.41，当中门框立柱再挡掉
    // −38.80…−38.24 一条。四个人（两名川军、两名日兵）都摆在主缝里。
    captives: [
      { id: "captiveWounded", x: -40.9, z: -131.3, yaw: 0.3 },
      { id: "captiveHelper", x: -39.8, z: -132.0, yaw: 2.6 },
    ],
    // 缴下来的两支枪落在两人**几米外**（Notion：「已经落在数米外」），而且都还在破口的
    // 射影里；踢开那一支往门口这边滑，滑完也不许被门垛吃掉。
    captiveRifles: [{ x: -42.0, z: -133.6 }, { x: -37.9, z: -132.9 }],
    // A 去右侧的 ijaKill[1]、B 去左侧的 ijaKill[0]：起点同侧且离落点 3–4 m，
    // 近爆黑视的 4.6 s 内能走到，不再交叉相撞后隔空触发第一拍。
    ijaStart: [{ x: -38.4, z: -135.8, yaw: Math.PI }, { x: -41.2, z: -136.0, yaw: Math.PI }],
    ijaKill: [{ x: -40.8, z: -132.4, yaw: Math.PI }, { x: -39.9, z: -133.2, yaw: Math.PI }],
    ijaDoor: [{ x: -40.3, z: -130.3, yaw: Math.PI }, { x: -38.9, z: -130.6, yaw: Math.PI }],
    luoEntry: { x: -40, z: -119.6, yaw: Math.PI },  // 从后壁破口挤进来
    luoLift: { x: -40.5, z: -122.3, yaw: Math.PI },
    yaowaLift: { x: -39.5, z: -122.2, yaw: Math.PI },
    // 绕过掩蔽部西墙，射线到刺杀处（西墙现在只到 z=−128，线从它北边过去）。
    heyoutianFire: { x: -42.65, z: -129.5, yaw: 0 },
  },
  // 06 背坡伤员集结处。
  collection: {
    litters: [{ x: -40.5, z: -99.2, yaw: 0 }, { x: -38, z: -98.6, yaw: 0 },
      { x: -35.5, z: -99.4, yaw: 0 }, { x: -33, z: -98.8, yaw: 0 }],
    wounded: [{ x: -43, z: -102.4 }, { x: -42.2, z: -105 }, { x: -30.6, z: -103.2 },
      { x: -29.4, z: -100.2 }, { x: -33.8, z: -105.8 }],
    // 2026-09-20 演出打磨：原来 (-37.2,-97) 与 (-34.2,-97.2) 两个搬运人员正好堵在
    // 玩家来向（集结处锚点 (-37,-101)）与老周 (-36.4,-95.9) 之间 —— 实拍里借火那一拍
    // 整个画面是两张后背，老周根本不在画里。四个人都退到担架那一侧，
    // 离老周最近的也有 4.3 m，`borrowClearRadiusM` 那条门守着这个距离。
    bearers: [{ x: -42.6, z: -98.2, yaw: 0 }, { x: -42.0, z: -96.6, yaw: 0 },
      { x: -33.4, z: -100.6, yaw: 0 }, { x: -31.0, z: -98.6, yaw: 0 }],
    // 抬老周那两个：对白期间在 4.2–4.3 m 外等（`bearerWait`，都让开玩家→老周那条轴线
    // 3.8 m 以上），ZhouLift 催的时候才走上来（`bearerClose`，在老周北侧左右分开站，
    // 不站进土壁里）。
    bearerWait: [{ x: -40.3, z: -97.6, yaw: 0 }, { x: -32.4, z: -97.4, yaw: 0 }],
    bearerClose: [{ x: -37.9, z: -96.6, yaw: 0 }, { x: -35.0, z: -96.8, yaw: 0 }],
    zhouWall: { x: -36.4, z: -95.9, yaw: Math.PI },  // 靠 CollectionLitterWall 的土壁等担架
    // 玩家过来借火站的地方：老周正北 2.6 m，两个人中间空着，火柴与纸烟读得出来。
    borrowStand: { x: -36.5, z: -98.5 },
    runner: { x: -31, z: -95.4, yaw: Math.PI },
  },
  // 08 主街障碍。
  streetBlock: {
    gap: { x: 76.65, z: 20 },
    // 喊话的前队站在**玩家来向（北口）与障碍之间**，一个回头朝北喊「后头莫挤！街堵了！」、
    // 一个还盯着堵死的街口。两个都让开街心 x=76.65 那条线（望障碍的视线门走那条线）。
    frontParty: [{ x: 74.6, z: 9.4, yaw: Math.PI }, { x: 79.2, z: 13.2, yaw: 0 }],
    withdrawnGuards: [{ x: 74.2, z: 8.4, yaw: 0 }, { x: 79.8, z: 7.2, yaw: 0 }],
    litterWait: [{ x: 64.6, z: -19.4, yaw: 0 }, { x: 67.4, z: -20.6, yaw: 0 },
      { x: 62.4, z: -21.2, yaw: 0 }],
    windowShooter: { x: 83.2, z: 5, yaw: -1.57 },   // 东侧那户人家的窗后
  },
  // 12 牛车。座位是相对车体的偏移（+x 右、+z 车尾）。
  cartRide: {
    playerSeat: { dx: 0.62, dz: 0.95 },
    zhouSeat: { dx: -0.55, dz: -0.15 },
    drover: { dx: 0, dz: -1.55 },
  },
  // 15B 掉队的步行伤员，沿夹道摆。
  wallPath: {
    stragglers: [{ x: 31, z: 213, yaw: -1.57 }, { x: 22.6, z: 213.6, yaw: -1.57 },
      { x: 12.6, z: 219, yaw: 0 }],
  },
  // 15C—17 接收院。
  receptionYard: {
    gateGuard: [{ x: 3.4, z: 237.6, yaw: -1.57 }, { x: 3.2, z: 242.4, yaw: -1.57 }],
    receiver: { x: -4.6, z: 239.2, yaw: -1.57 },
    surgeon: { x: -27.4, z: 241.2, yaw: 0 },
    // 幺娃留在老周担架东侧，但让开顺子后抬手的胶囊和第一人称镜头通道。
    // 到 zhouDrop 1.96 m，仍在死亡段整理覆盖物的 2.4 m 距离门内。
    yaowaBedside: { x: -23.1, z: 241.5, yaw: 1.83 },
    zhouPlaced: { x: -26, z: 239.4, yaw: 0 },
    nextLitterEntry: { x: -13, z: 243.4, yaw: -1.57 },
  },
  // 18 铁路桥。
  bridge: {
    rearColumnForm: [{ x: -77, z: 122 }, { x: -79.4, z: 125.6 }, { x: -74.6, z: 126.4 }],
    rearColumnGroups: [[{ x: -77, z: 128 }], [{ x: -78.2, z: 131.4 }], [{ x: -75.8, z: 131.8 }]],
    officer: { x: -73.4, z: 173.6, yaw: Math.PI },
    demolition: [{ x: -80.4, z: 172.2, yaw: Math.PI }, { x: -74.2, z: 171.4, yaw: Math.PI }],
    luoCover: { x: -79.4, z: 180.2, yaw: Math.PI },
    heyoutianCover: { x: -84.2, z: 179, yaw: Math.PI },
    enemyRidge: [{ x: -68, z: 130.5, yaw: 0 }, { x: -63.4, z: 131, yaw: 0 },
      { x: -85.6, z: 130.8, yaw: 0 }, { x: -89.2, z: 131.2, yaw: 0 }],
  },
  // 关尾北门夜景（NightGateShown 之前这一片根本不存在）。
  night: {
    column: [{ x: -161.4, z: 300 }, { x: -158.6, z: 302.4 }, { x: -160.2, z: 306.2 },
      { x: -162, z: 310.4 }, { x: -158.2, z: 312.6 }, { x: -160.6, z: 316 },
      { x: -159, z: 320.8 }, { x: -161.2, z: 325.4 }],
    carriers: [{ x: -166.4, z: 330.2, yaw: 0 }, { x: -154.2, z: 331.6, yaw: 0 },
      { x: -167.8, z: 336.4, yaw: 0 }, { x: -153.4, z: 335.2, yaw: 0 }],
    sectorAssigners: [{ x: -156.4, z: 346.2, yaw: Math.PI }, { x: -163.8, z: 347.4, yaw: Math.PI }],
    usher: { x: -159.2, z: 344.4, yaw: Math.PI },
    braziers: [{ x: -166, z: 326.6 }, { x: -154, z: 327.2 }, { x: -165.4, z: 344.8 },
      { x: -154.6, z: 345.4 }],
  },
});
// The mission view and scripted routes share this physical footprint. Keeping
// it here prevents a visible crate from gaining a different collision size in
// the renderer and in route-clearance checks.
export const MISSION_SUPPLY_COLLIDER = Object.freeze({w:.96,h:.5,d:.64});
export const MISSION_SUPPLIES = Object.freeze([
  // 2026-09-15: the shelter corner is now a fight of its own, between the trench
  // and the front crates. Kept on the recess floor, clear of its entry lane and posts.
  {id:"Shelter",x:-34.2,z:-18.3,supportHeight:null},
  {id:"Front",x:-2.2,z:-124,supportHeight:null},
  {id:"Orders",x:Sortie.orders.x-1.5,z:Sortie.orders.z,supportHeight:null},
  {id:"Courtyard",x:50,z:33.05,supportHeight:null},
  {id:"Transfer",x:93,z:110,supportHeight:1.15},
  {id:"Retreat",x:53.8,z:184,supportHeight:null},
  {id:"Reception",x:-7.8,z:231,supportHeight:null},
]);
// 在沟里走、但线写在**别的文件**里的那几条。本文件不能 import
// Data_FirstLevelMission（它 import 本文件，反过来读就是一个求值期的环），
// 所以只能照抄那一小段。看守是 Script_FirstLevelMissionTest 的路线净空断言：
// 那边改了线、这边没跟，它会指名道姓地红。
const TRENCH_TRAFFIC_LANES = [
  // 增援班从交通壕口沿 z=-123 散开到各自的射击位（测试里的 Relief<i> 路线）。
  // 这条腿整段躺在 FrontTraverse 的沟里，偏中线 1 m 左右。
  ...MISSION_PLACEMENT.reliefPositions.map((point) => [
    MISSION_PLACEMENT.reliefApproach.at(-1), { x: point.x, z: -123 }, point]),
  // 后院那三个追兵贴着撤离壕 (26,215) 的拐角外侧下来
  //（Data_FirstLevelMission.MISSION_TACTICS.YardPursuerA/B/C，三条同线）。
  [{ x: 27, z: 224 }, MISSION_REAR_ROUTES.evacuation[7], MISSION_REAR_ANCHORS.retreatC],
];
// ---------------------------------------------------------------------------
// 07 南行沿线的路肩（2026.09.19 第二波）
// ---------------------------------------------------------------------------
/**
 * 新的 `southWalk` 比旧线短 53 m（188 → 135），代价是它在 FrontCommunication 的
 * 沟身里只走得到一小段，后面几段是开阔田地 —— 走起来读不出「沿交通线南下」。
 * 这里沿路肩摆一排**断续**的低土坎：每段 8.5 m、左右交替、离中线 3.6 m
 *（担架队 1.25 m 通行宽 + 0.35 胶囊都在净空之外）。不连成一堵墙：那会把这条线
 * 变成一条走廊，也会横在别人的线上。
 *
 * 所以摆在这里而不是上面那些 Wall() 旁边：要先有 MISSION_ROUTES / MISSION_PLACEMENT
 * 才能逐件躲开**别人的**路线。三道筛子：
 *   1. 脚下已经被挖过或压平过（沟、路、场坪）的不摆 —— 那是别人的通道，
 *      而且土坎会一头扎进沟里长成 3 m 高（实测 SouthWalkShoulder0 曾是 3.43 m）；
 *   2. 离任何一条非 07 的路线／战术折线近于 5.5 m 的不摆；
 *   3. 已经被别的实心件占了的地方不摆（第一版有一段正好长在 FieldPoplarSouthRoad2
 *      那棵白杨身上）。
 * 语义取 earthDark 不取 cover：这是地形不是工事，射击位交给
 * DeriveCoversFromColliders 从实体盒里推（见 GroundedBlock 的注释）。
 */
{
  const line = MISSION_STAGE_ROUTES.southWalk;
  const placed = blocks.filter((block) => block.solid !== false);
  const others = [
    ...Object.entries(MISSION_ROUTES).filter(([name]) => name !== "south" && name !== "southWalk")
      .map(([, route]) => route),
    MISSION_PLACEMENT.reliefApproach, ...MISSION_PLACEMENT.guardWithdrawalRoutes,
    ...TRENCH_TRAFFIC_LANES, ...Object.values(APPROACH_TACTICS).map((plan) => plan.points),
    OPENING.woundedRoute, OPENING.runnerRoute, OPENING.trenchContactRoute,
  ];
  const Bank = (id, x, z, w, h, d, ry) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    let base = Infinity;
    for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1])
      base = Math.min(base, SampleMissionTerrain(x + (a * w / 2) * c + (b * d / 2) * s,
        z - (a * w / 2) * s + (b * d / 2) * c));
    base -= 0.1;
    const top = SampleMissionTerrain(x, z) + h;
    return Block(id, x, z, w, top - base, d, "earthDark", { y: (top + base) / 2, ry });
  };
  // [路线第几段, 段内位置 0–1, 摆在哪一侧, 露出地面多高]
  for (const [i, [leg, t, side, h]] of [
    [2, 0.30, 1, 1.25], [2, 0.74, -1, 1.05],
    [3, 0.28, 1, 1.15], [3, 0.72, -1, 1.3],
    [4, 0.32, -1, 1.1], [4, 0.78, 1, 1.25],
    [5, 0.35, -1, 1.2], [5, 0.80, 1, 1.05],
    [6, 0.30, -1, 1.15], [6, 0.70, 1, 1.25],
  ].entries()) {
    const a = line[leg], b = line[leg + 1], len = Math.hypot(b.x - a.x, b.z - a.z);
    const ry = Math.atan2(b.x - a.x, b.z - a.z);
    const x = a.x + (b.x - a.x) * t + ((b.z - a.z) / len) * side * 3.6;
    const z = a.z + (b.z - a.z) * t - ((b.x - a.x) / len) * side * 3.6;
    if (SampleMissionNaturalHeight(x, z) - SampleMissionTerrain(x, z) > 0.5) continue;
    if (others.some((route) => MissionPathDistance({ x, z }, route) < 5.5)) continue;
    // 两个世界 AABB 相隔 0.8 m 以上才摆（外接圆太狠：8.5 m 长的件对上一整间屋子，
    // 半径一加就把整条路肩清光）。
    const hx = Math.abs(Math.cos(ry)) * 0.375 + Math.abs(Math.sin(ry)) * 4.25;
    const hz = Math.abs(Math.sin(ry)) * 0.375 + Math.abs(Math.cos(ry)) * 4.25;
    if (placed.some((box) => {
      const bc = Math.abs(Math.cos(box.ry || 0)), bs = Math.abs(Math.sin(box.ry || 0));
      return Math.abs(box.x - x) < hx + (bc * box.w + bs * box.d) / 2 + 0.8
        && Math.abs(box.z - z) < hz + (bs * box.w + bc * box.d) / 2 + 0.8;
    })) continue;
    Bank(`SouthWalkShoulder${i}`, x, z, 0.75, h, 8.5, ry);
  }
}
// 壕沟布设：沿编译好的中心线自动摆护壁、踏板、射击位沙袋和杂物
// （Script_TrenchPlan.PlanTrenchDressing，参数在 TRENCH_PRESETS）。
// 旧写法是「每 5 m 两侧各一根桩 + 3 条横板」的双重循环，间距、根数、倾斜全是
// 常数 —— 那正是这一轮要去掉的「工业化」。
// 为什么在这里而不是在上面那些 Detail() 旁边：它要吃 MISSION_ROUTES /
// MISSION_PLACEMENT（就定义在上面几十行）和**当时已经摆好的全部实心体块**。
// 下面那张老清理网留着当第二道保险（它只认 id 里的 `Revetment`）。
//
// 布设跑两遍：**沟里的路线就是沟的中心线**。opening/support 是 FrontCommunication、
// bundle 是 BundleApproach、evacuation 是 WestEvacuation，连担架、通信兵、追兵那几条
// 也都顺着沟底走。护壁摆在沟壁上（离中线 1.4 m 开外），只有横穿的路线才碰得到它，
// 所以第一遍照常吃全部路线；踏板和杂物摆在沟底中线附近，吃同一套路线的结果是
// **一件都不剩** —— 而踏板本来就是给人踩的，杂物是不带碰撞的箱子。
// 两遍用同一个种子，件的位置逐位相同，差的只是筛掉了哪些。
export const MISSION_TRENCH_PLACEMENTS = (() => {
  const shared = { groundAt: SampleMissionTerrain, laneCuts: FrontAssaultLaneCuts };
  const handPlaced = blocks.filter((block) => block.solid !== false)
    .map((block) => ({ x: block.x, z: block.z, w: block.w, d: block.d, ry: block.ry || 0 }));
  // 手挖的凹地也算占了地：机枪踏步、补给屋的地板。件摆在它们的过渡带上，中心与
  // 端点会差半米高 —— 症状是沙袋一头埋进土里、踏板一头翘在半空。
  // 半径乘几：PlanTrenchDressing 自己还要按件的尺寸再外扩（3.5 m 长的护壁是
  // 2.25 m，2.4 m 的踏板是 1.7 m）。护壁贴在沟壁上、离踏步还有一堵墙，写 ×1 就够；
  // 踏板躺在沟底，和踏步的斜面是同一片地，要 ×2 才躲得开。照直径给护壁写，整条
  // 射击壕的护壁会被清光。
  const StepBoxes = (scale) => MISSION_TERRAIN.steps.map((step) => ({
    x: step.x, z: step.z, w: step.radius * scale, d: step.radius * scale, ry: 0 }));
  const guarded = PlanTrenchDressing(TrenchPlanFor(MISSION_TERRAIN), {
    ...shared,
    keepOut: [...handPlaced, ...StepBoxes(1)],
    avoidRoutes: [
      ...Object.values(MISSION_ROUTES),
      MISSION_PLACEMENT.reliefApproach,
      ...MISSION_PLACEMENT.guardWithdrawalRoutes,
      // 沟里活动的那几条：担架、通信兵、缺口进来的敌人、追到拐角的那一股
      OPENING.woundedRoute, OPENING.runnerRoute, OPENING.trenchContactRoute,
      ...Object.values(OPENING.intruderRoutes),
      ...Object.values(OPENING.shelterPursuerRoutes).map((route) => route.points),
      ...TRENCH_TRAFFIC_LANES,
    ],
  });
  const floor = PlanTrenchDressing(TrenchPlanFor(MISSION_TERRAIN), {
    ...shared, keepOut: [...handPlaced, ...StepBoxes(2)] });
  const OnFloor = (id) => /Duckboard\d+$/.test(id);
  for (const piece of [...guarded.blocks.filter((b) => !OnFloor(b.id)),
    ...floor.blocks.filter((b) => OnFloor(b.id))]) {
    const { id, x, z, w, h, d, semantic, ...extra } = piece;
    (piece.solid === false ? Detail : Block)(id, x, z, w, h, d, semantic, extra);
  }
  return Object.freeze(floor.placements);
})();
// Leave continuous openings wherever a return route or stretcher corridor crosses a revetment.
for (let i = blocks.length - 1; i >= 0; i--) {
  const block = blocks[i];
  if (!block.id.includes('Revetment')) continue;
  const c = Math.cos(block.ry||0), s = Math.sin(block.ry||0);
  if(block.id.startsWith('BundleApproachRevetment') && FrontAssaultLaneCuts(block.x,block.z,
    Math.abs(c)*block.w+Math.abs(s)*block.d,Math.abs(s)*block.w+Math.abs(c)*block.d,.8)){
    blocks.splice(i,1);continue;
  }
  const crosses = [...Object.values(MISSION_ROUTES), MISSION_PLACEMENT.reliefApproach, ...MISSION_PLACEMENT.guardWithdrawalRoutes, ...MISSION_TERRAIN.trenches.map(t=>t.points)].some(route => route.slice(1).some((b,index) => {
    const a=route[index], length=Math.hypot(b.x-a.x,b.z-a.z);
    for(let d=0;d<=length;d+=.5) {
      const x=a.x+(b.x-a.x)*d/length-block.x, z=a.z+(b.z-a.z)*d/length-block.z;
      if(Math.abs(x*c-z*s)<block.w/2+.9 && Math.abs(x*s+z*c)<block.d/2+.9)return true;
    }
    return false;
  }));
  if(crosses)blocks.splice(i,1);
}
// ---------------------------------------------------------------------------
// scenario：同一处空间的两种状态（Script_FirstLevelWhiteboxField.SetScenarioState）
// ---------------------------------------------------------------------------
/**
 * 三个状态是**线性**的（SyncScenario 取「最后一个信号已满足」的那个），正好对上
 * 关卡时间轴：完好掩蔽部 → 01 近爆之后的坍塌掩蔽部 → 18 关尾的夜景片。
 * 夜景那一片写在最后一个状态里，所以 `NightGateShown` 之前它既不画也不进碰撞
 * —— 白天那一带就是一块空地。
 *
 * 为什么不进 `blocks`：坍塌/完好两套墙同时存在没有意义，而 gate 是「一块一个网格」，
 * 四十块各自一个 draw call。scenario 走 BuildSink 合批，切态只重建这一个 sink。
 */
const BUNKER_GROUND = SampleMissionTerrain(-40, -124.5);
const NIGHT_GROUND = SampleMissionTerrain(-160, 334);
function ScenarioBlock(id, x, z, w, h, d, semantic, y, extra = {}) {
  return { id, x, y, z, w, h, d, semantic, tag: "whiteboxWall", ...extra };
}
const MISSION_SCENARIO = (() => {
  const g = BUNKER_GROUND, n = NIGHT_GROUND;
  const B = (id, x, z, w, h, d, semantic, top) =>
    ScenarioBlock(id, x, z, w, h, d, semantic, g + top - h / 2);
  // 2026-09-20 演出打磨：Notion 写的是「前沿交通壕旁的**小型**掩蔽部」，而原来这间
  // 8.5 × 12 m 的屋子把行刑处顶到 13.5 m 外 —— 720p 下门外的人只有约 70 像素高，
  // 「必须让玩家清楚看懂」读不出来。现在整间收成 7 × 7 m（外廓 x −43.5…−36.5、
  // z −128…−121），前后两间各 3.5 m：受困位 (−40,−123.4) 到前门 4.6 m、到行刑处 8.5 m。
  //
  // 两态共用的壳：西/东侧墙、前墙两垛、后墙两垛、中隔墙两垛。
  // 前门缺口 x −41.4…−38.6（2.8 m）、中隔墙缺口与后壁缺口都是 x −41.6…−38.4（3.2 m）
  // —— 三道口子**同轴**，躺在后半间正对着看出去，门外那一片不会被中隔墙裁掉。
  const shell = [
    // 2026.09.21 storyboard: a covered recess off a timber-revetted trench.
    // Banks hide the surface battlefield from the ground-level opening camera.
    ...Array.from({length:10},(_,i)=>{
      const z=-129.4-i*2,ground=SampleMissionTerrain(-40,z);
      return [-1,1].flatMap(side=>{
        const x=-40+side*4.35,h=1.8+(i%3)*.11;
        return [ScenarioBlock(`OpeningBank${side}_${i}`,x,z,1.8,h,2.1,"OpeningEarth",ground+h/2),
          ...[.35,.72,1.09,1.46].map((rise,j)=>ScenarioBlock(`OpeningRevetment${side}_${i}_${j}`,x-side*.91,z,.14,.22,2.06,"OpeningWood",ground+rise)),
          ScenarioBlock(`OpeningPost${side}_${i}`,x-side*1.03,z-.87,.18,1.7,.2,"OpeningWood",ground+.85)];
      });
    }).flat(),
    B("BunkerWest", -43.25, -124.5, 0.5, 2.2, 7, "earthDark", 2.2),
    B("BunkerEast", -36.75, -124.5, 0.5, 2.2, 7, "earthDark", 2.2),
    B("BunkerFrontWest", -43, -128, 1, 2.2, 0.5, "earthDark", 2.2),
    B("BunkerFrontEast", -37, -128, 1, 2.2, 0.5, "earthDark", 2.2),
    B("BunkerRearWest", -42.55, -121, 1.9, 2.2, 0.5, "earthDark", 2.2),
    B("BunkerRearEast", -37.45, -121, 1.9, 2.2, 0.5, "earthDark", 2.2),
    B("BunkerPartitionWest", -42.55, -124.5, 1.9, 2.2, 0.5, "timber", 2.2),
    B("BunkerPartitionEast", -37.45, -124.5, 1.9, 2.2, 0.5, "timber", 2.2),
  ];
  const intact = [...shell,
    B("BunkerDoorLintel", -40, -128, 5, 0.2, 0.5, "timber", 2.2),
    B("BunkerRearLintel", -40, -121, 3.2, 0.2, 0.5, "timber", 2.2),
    B("BunkerPartitionLintel", -40, -124.5, 3.2, 0.2, 0.5, "timber", 2.2),
    B("BunkerRoof", -40, -124.5, 7, 0.3, 7, "timber", 2.5),
  ];
  // 坍塌态：前半间塌了，前门只剩 0–1.35 m 的低处破口。躺姿眼高 0.35–0.50 m
  // 从后半间 (-40,-123.4) 看出去，门外 2–12 m 一个站着的人（头顶 1.75）整个在视野里：
  // 破口上沿 1.35 m 在 4.6 m 处，射到 8.5 m 的头顶那条线只走到 1.14 m，从沿下过去。
  // 门槛的碎砖与门框立柱各遮住一部分，创口仍由门框、尘土与人物身体挡着。
  const collapsed = [...shell,
    B("BunkerFrontLintel", -40, -128, 5, 0.2, 0.5, "timber", 2.2),
    B("BunkerDoorRubble", -37.7, -128, 0.9, 0.22, 0.7, "earthDark", 0.22),
    B("BunkerDoorPost", -42.5, -128, 0.25, 2.2, 0.45, "timber", 2.2),
    B("BunkerPartitionSill", -40, -124.5, 3.2, 0.18, 0.5, "earthDark", 0.18),
    B("BunkerRoofRear", -40, -122.75, 7, 0.3, 3.5, "timber", 2.5),
    // 塌下来的顶板悬在前半间当中：底面 1.35 m，正好压在破口上沿那条线上，
    // 从躺姿看过去它在视线**上方**（3 m 处那条线才 0.89 m），只把天光压掉。
    B("BunkerRoofSlab", -40, -125.6, 7, 0.3, 3.2, "timber", 2.5),
    // 前半间两角的塌方堆。都退到破口射影之外（4.3 m 处那条锥只有 x −41.31…−38.69），
    // 不许啃掉门外那一片的左右边。
    B("BunkerRubbleA", -42.3, -126.4, 1.4, 1.1, 2.6, "earthDark", 1.1),
    B("BunkerRubbleB", -37.7, -126.8, 1.4, 0.85, 1.8, "earthDark", 0.85),
    B("BunkerBeamPinWest", -41.15, -123.4, 0.7, 0.55, 0.9, "timber", 0.55),
    B("BunkerBeamPinEast", -38.85, -123.6, 0.6, 0.5, 0.8, "timber", 0.5),
    // 杂物堆靠西墙放。原来摆在 x=-40，正好压在后壁破口那道 3.2 m 门里：
    // 两边各只剩 0.7 m，人的胶囊（直径 0.84）过不去 —— 罗班长进不来、玩家也出不去，
    // 实拍出来是「02 永远不开始」。scenario 的体块不在 MISSION_LAYOUT.blocks 里，
    // 所有既有的净空检查都扫不到它，所以 Script_FirstLevelMissionTest 另加了一条。
    // 屋子收小之后它也跟着收：x −42.95…−41.85，整块留在后壁缺口（x −41.6 起）以西。
    B("BunkerClutter", -42.4, -122, 1.1, 0.5, 0.8, "timber", 0.5),
  ];
  const N = (id, x, z, w, h, d, semantic, top) =>
    ScenarioBlock(id, x, z, w, h, d, semantic, n + top - h / 2);
  // 关尾北门：城墙 9 m（Data_Tengxian.CITY 的实测是 11.5，白盒取低一档）、门洞净宽
  // 3.8（对 Data_Tengxian.BARBICAN.innerGateW）、半圆瓮城简化成方瓮城体块。
  // 不 import 城池生成器：这只是一片夜景，不是滕县。
  const night = [...collapsed,
    N("NightWallWest", -178.45, 340, 33.1, 9, 5, "plaster", 9),
    N("NightWallEast", -143.05, 340, 30.1, 9, 5, "plaster", 9),
    N("NightGateLintel", -160, 340, 3.8, 3.4, 5, "plaster", 9),
    N("NightGateTower", -160, 344, 17, 4.5, 11, "timber", 13.5),
    N("NightBarbicanSideWest", -178, 331, 4, 7, 18, "plaster", 7),
    N("NightBarbicanSideEast", -142, 331, 4, 7, 18, "plaster", 7),
    N("NightBarbicanFrontWest", -171, 322, 18, 7, 4, "plaster", 7),
    N("NightBarbicanFrontEast", -149, 322, 18, 7, 4, "plaster", 7),
    N("NightBarbicanLintel", -160, 322, 4, 2, 4, "plaster", 7),
    N("NightApproachWallWest", -172, 308, 0.7, 1.8, 28, "cover", 1.8),
    N("NightApproachWallEast", -148, 308, 0.7, 1.8, 28, "cover", 1.8),
  ];
  for (const [i, p] of [[-166, 326.6], [-154, 327.2], [-165.4, 344.8], [-154.6, 345.4]].entries())
    night.push(ScenarioBlock(`NightBrazier${i}`, p[0], p[1], 0.8, 0.7, 0.8, "metal",
      SampleMissionTerrain(p[0], p[1]) + 0.35));
  return Object.freeze({
    replaceBlockIds: [],
    states: [
      { id: "BunkerIntact", signal: null, blocks: intact },
      { id: "BunkerCollapsed", signal: "BunkerCollapsed", blocks: collapsed },
      { id: "NightGate", signal: "NightGateShown", blocks: night },
    ],
  });
})();
export const MISSION_NIGHT_GATE_BLOCK_IDS = Object.freeze(
  MISSION_SCENARIO.states[2].blocks
    .filter((block) => !MISSION_SCENARIO.states[1].blocks.some((prior) => prior.id === block.id))
    .map((block) => block.id));

export const MISSION_LAYOUT = Object.freeze({
  id: "FirstLevelMissionSeptember19",
  scenario: MISSION_SCENARIO,
  // 归档教学白盒的色标面板不进正片（Script_FirstLevelWhiteboxField.BuildLegend）。
  legend: false,
  fortifications: true,
  terrain: "P012Heightfield",
  terrainSpec: MISSION_TERRAIN,
  SampleGroundColor: SampleMissionGroundColor,
  // Layered terrain palette + splat weights; used only when ground.terrainLayers loads.
  SampleGroundSurface: SampleMissionGroundSurface,
  // 地块与 bounds 是同一个矩形：高度场按 ground 的 w/d 逐格烘（Data_FirstLevelP012Terrain），
  // 玩家位置按 bounds 夹（Script_FirstLevelWhiteboxField）。两边写不一样就会出现
  // 「能走到的地方没有地」或者「烘了一片谁也到不了的地」。
  bounds: MISSION_BOUNDS,
  ground: { x: (MISSION_BOUNDS.minX + MISSION_BOUNDS.maxX) / 2, z: (MISSION_BOUNDS.minZ + MISSION_BOUNDS.maxZ) / 2,
    w: MISSION_BOUNDS.maxX - MISSION_BOUNDS.minX, d: MISSION_BOUNDS.maxZ - MISSION_BOUNDS.minZ,
    h: 1, y: -0.5, semantic: "ground", pbr: "Ground", pbrOptions: { normalScale: .5, metalness: 0 }, terrainLayers: "MissionPlain" },
  railway: MISSION_RAILWAY,
  semanticColors: {
    railBallast: 0x5a5750,
    foliage: 0x68715f,
    timber: 0x746956,
    metal: 0x535b57,
    earthDark: 0x696452,
    plaster: 0xaaa69b,
    roof: 0x686c68,
    canvas: 0xa4a393,
    // 北沙河的示意水面。压得比天空暗一档（天穹在白天读出来接近 0x9fb0bb），
    // 不然从桥上往下看是一条亮带，反而比河槽更不像水。
    water: 0x5c6f78,
    ground: 0x86877d,
    structure: 0xc1bdb1,
    cover: 0x6d8b98,
    step: 0xc4a668,
    missionRoute: 0x759b83,
    stretcherRoute: 0x9caea5,
    danger: 0x915f51,
    boundary: 0x393d3c,
  },
  blocks,
  gates,
  // 壕沟里的外部模型件（箱/板条箱/帆布）。放在 layout 上而不是并进
  // MISSION_DEFENSE_OBJECTS：那张表在 Data_FirstLevelMissionFortifications 里，
  // 而这份布设要吃本文件的体块做 keepOut —— 反过来 import 就是一个求值期的环。
  trenchPlacements: MISSION_TRENCH_PLACEMENTS,
  walkableSurfaces: surfaces,
  zones: Object.entries(MISSION_ANCHORS).map(([id, p]) => ({ id, ...p, radius: 8 })),
});
