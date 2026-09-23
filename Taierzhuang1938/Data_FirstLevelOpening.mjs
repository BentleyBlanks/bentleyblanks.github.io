// 2026-09-10 opening rebuild. Gameplay reconstruction of a local flank breach;
// these coordinates are not claims about surveyed 1938 positions.
import { FRONT_SORTIE as Sortie } from "./Data_FirstLevelFrontRoute.mjs";
import { MISSION_FRONT_COLLECTION_ROUTE } from "./Data_FirstLevelMissionTopology.mjs";

export const OPENING = Object.freeze({
  // Only these authored companions are required by later dialogue and rescue.
  // Membership of a squad alone never makes an ordinary soldier a failure target.
  requiredSquadCast: Object.freeze(["luo","yaowa","heyoutian","liuwencai"]),
  rescuePullSeconds: 2.1,
  rescueStandSeconds: 3.55,
  // One impact closure, held blackout, then a continuous reopening. Focus and
  // hearing recover separately; repeated shutter beats made the wreck theatrical.
  blinks: [[0,0],[1.72,0],[1.95,1],[2.6,1],[3.15,.52],[3.65,.18],[4.25,0]],
  hearing: [[0,0],[.15,0],[.3,1],[2.8,1],[4.1,.72],[6.5,.42],[10.5,0]],
  hearingLowHz:650,
  breath: {start:2.6,end:11,interval:2.4,volume:.95},
  dizzySeconds: 4,
  rescueReachM: 2.1,
  trenchEntry: {x:-45,z:41},
  breach: {x:-22,z:8},
  // A clear local trench, two successive traverses and friendly posts protect
  // the exchange. No scripted damage immunity or global ceasefire in this area.
  approachRoute: [{x:-66,z:66},{x:-62,z:64},{x:-45,z:41},{x:-45,z:24},
    {x:-37,z:24},{x:-37,z:6},{x:-45,z:6},{x:-45,z:-20},{x:-32,z:-20}],
  // The tail is also the 03/06 player route. FrontCommunication is excavated from
  // this array, so both directions get a real ramp instead of a one-way trench wall.
  supportRoute: [{x:-32,z:-20},{x:-32,z:-23},{x:-24,z:-23},{x:-24,z:-60},
    ...MISSION_FRONT_COLLECTION_ROUTE],
  woundedRoute: [{x:-24,z:-56},{x:-24,z:-23},{x:-32,z:-23},{x:-32,z:-21}],
  runnerRoute: [{x:-24,z:-60},{x:-24,z:-23},{x:-31,z:-23},{x:-31,z:-24}],
  shelterPosts: [{x:-32,z:-24},{x:-32,z:-21},{x:-40,z:-20},{x:-37,z:-20}],
  // Clear the middle of the trench for the player and late-arriving companions.
  trenchCoverPosts: [{x:-43.55,z:36.15},{x:-46.45,z:32.15},{x:-43.55,z:37.85},{x:-46.45,z:33.85}],
  trenchContactRoute: [{x:-66,z:66},{x:-62,z:64},{x:-45,z:41},{x:-45,z:24},{x:-37,z:24},{x:-37,z:18}],
  // 2026-09-23 proposal A: nest leader post, collection, left gun, rear corner (He/Liu hold it).
  frontPosts: [{x:28.4,z:-151.6},{x:-25,z:-100},Sortie.leftSeat,{x:-4.6,z:-112.8}],
  zhouGunSeat: Sortie.leftSeat,
  zhouRest: {x:-36,z:-99},
  // The front supply crate sits between the firing step and the rest point.
  // A wounded gunner can end up on either side of it, so the handover
  // follows the open south edge of the traverse instead of cutting through
  // the crate with one diagonal move.
  zhouExitBypass: [{x:-3.8,z:-122.5},{x:1.2,z:-122.5}],
  zhouExitWaypointRadiusM:.5,
  zhouWoundThreshold:95,
  zhouExitRadiusM:.65,
  zhouShell: {from:{x:18,z:-210},height:30,flight:1.8,radius:3,damage:55,offsetX:1.1,
    retryAfterS:12,retryFromOffset:{x:8,z:-12}},
  // Finite attacking sections on both sides of the march, staggered by local contact.
  surface: [
    {id:"FlankLockGunner",x:-35,z:58,weapon:"Type11",hold:true,team:"Flank"},
    {id:"FlankLockA",x:-33,z:49,team:"Flank",firePhaseS:1.1},
    {id:"FlankLockB",x:-26,z:57,team:"Flank",firePhaseS:2.2},
    {id:"RailLockGunner",x:-93,z:43,weapon:"Type11",hold:true,team:"Rail",firePhaseS:3.8},
    {id:"RailLockA",x:-96,z:34,team:"Rail",firePhaseS:4.9},
    {id:"RailLockB",x:-89,z:30,team:"Rail",firePhaseS:6},
    {id:"FlankAdvanceA",advance:true,x:-24,z:43,team:"Flank",bayonet:true},
    {id:"FlankAdvanceB",advance:true,x:-21,z:37,team:"Flank",bayonet:true},
    {id:"FlankAdvanceC",advance:true,x:-17,z:47,team:"Flank",bayonet:true},
    {id:"RailAdvanceA",advance:true,x:-70,z:46,team:"Rail",bayonet:true},
    {id:"RailAdvanceB",advance:true,x:-70,z:39,team:"Rail",bayonet:true},
    {id:"RailAdvanceC",advance:true,x:-69,z:34,team:"Rail",bayonet:true},
  ],
  intruderRoutes: {
    TrenchIntruderA:[{x:-37,z:18}],
    TrenchIntruderB:[{x:-37,z:8},{x:-37,z:13}],
    TrenchIntruderC:[{x:-32,z:8},{x:-37,z:8}],
    TrenchIntruderD:[{x:-27,z:8},{x:-32,z:8}],
  },
  // Three come straight down the main trench; two use the short north loop and
  // rejoin it at (-24,-44). Every route ends in the main trench, visible from the corner.
  shelterPursuerRoutes: {
    CornerPursuerA:{delay:0,points:[{x:-24,z:-58},{x:-23.6,z:-53},{x:-23.4,z:-39},{x:-24,z:-31}]},
    CornerPursuerB:{delay:2,points:[{x:-23,z:-60.5},{x:-23.2,z:-54.5},{x:-24.4,z:-44},{x:-24.4,z:-34}]},
    CornerPursuerC:{delay:4,points:[{x:-24.2,z:-59},{x:-24,z:-56},{x:-23.8,z:-47}]},
    CornerPursuerD:{delay:5,points:[{x:-26,z:-58.9},{x:-31,z:-55},{x:-31,z:-49.5},{x:-26,z:-45.1}]},
    // The loop's sandbag line (CommunicationBendDefense, x -29) stays on the east hand.
    CornerPursuerE:{delay:8,points:[{x:-27,z:-58.6},{x:-31.2,z:-56},{x:-31.2,z:-51},{x:-30.5,z:-48},{x:-25.2,z:-44.6}]},
  },
  playerFireLimit: 3,
  // 压制档的人数（2026-09-23）。瞄准档（playerFireLimit）已经由射击令牌与轮转窗口
  // 封顶在 3 人，那是**会命中**的那一档，玩家的 TTK 账全在它身上。这一档不同：
  // 被禁火的人向玩家的压制点射击，命中恒 false、不占令牌，只制造近失弹与压制感，
  // 所以**不进 TTK 账**。3 个人 ≈ 一个班的火力感，再多就成了「打不中的弹幕」。
  // 其余被禁火的人只许看、进掩体、探头、举枪，一发不打。
  playerSuppressLimit: 3,
  fireSlotSeconds: 3.5,
  rifleGuardCount: 2,
  frontReachRadiusM: 9,
});
