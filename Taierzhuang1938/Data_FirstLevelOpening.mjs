// 2026-09-10 opening rebuild. Gameplay reconstruction of a local flank breach;
// these coordinates are not claims about surveyed 1938 positions.
export const OPENING = Object.freeze({
  derailCar: 1,
  derailPivot: {x:-74.6,y:.75},
  derailRollRad: -Math.PI/2,
  derailSeconds: 2.4,
  rescueSeconds: 3.2,
  playerFall: {x:-73.25,z:88,eyeM:.38},
  rescueEnd: {x:-70.5,z:88},
  rescueGuide: {x:-72.15,z:88},
  blackout: {start:1.65,close:.35,hold:.65,open:1.1},
  // One impact closure, held blackout, then a continuous reopening. Focus and
  // hearing recover separately; repeated shutter beats made the wreck theatrical.
  blinks: [[0,0],[1.72,0],[1.95,1],[2.6,1],[3.15,.52],[3.65,.18],[4.25,0]],
  hearing: [[0,0],[.15,0],[.3,1],[2.8,1],[4.1,.72],[6.5,.42],[10.5,0]],
  hearingLowHz:650,
  breath: {start:2.6,end:11,interval:2.4,volume:.95},
  escapeBreath: {interval:4.2,volume:.55},
  // Finite ranging salvo along the railway/apron. Fixed impacts stay outside
  // the covered walking lane; entering the open impact areas is still dangerous.
  escapePressure: {
    intervalS:4.5, flightS:1.6, radiusM:5.5, damage:70,
    origin:{x:35,z:20}, originHeightM:38,
    shells:[
      {id:"WreckRear",after:3.2,impact:{x:-84,z:89}},
      {id:"WreckAhead",after:8.8,impact:{x:-82,z:73}},
      {id:"OpenApron",after:14.6,impact:{x:-53,z:83}},
      {id:"ApronAdvance",after:20.4,impact:{x:-54,z:67}},
      {id:"TrenchLip",after:10,near:{x:-65,z:67},nearM:12,impact:{x:-48,z:64}},
      {id:"TrenchApproach",after:10,near:{x:-51,z:49},nearM:10,impact:{x:-34,z:35}},
    ],
    smoke:[
      {point:{x:-78,z:87},height:1.3,kind:"black",rate:6,radius:.6,rise:1.8,sizeStart:.65,sizeEnd:3.4,life:5,opacity:.42},
      {point:{x:-77,z:76},height:1.1,kind:"dust",rate:4,radius:.8,rise:.65,sizeStart:.7,sizeEnd:2.6,life:4,opacity:.28},
    ],
  },
  dizzySeconds: 4,
  rescueReachM: 2.1,
  spillRetreat: {postX:-65.5,columnM:1.5},
  shelter: {x:-32,z:-20},
  trenchEntry: {x:-45,z:41},
  breach: {x:-22,z:8},
  shelterRadiusM: 2.2,
  shelterWitnessM: 14,
  // A clear local trench, two successive traverses and friendly posts protect
  // the exchange. No scripted damage immunity or global ceasefire in this area.
  approachRoute: [{x:-66,z:66},{x:-62,z:64},{x:-45,z:41},{x:-45,z:24},
    {x:-37,z:24},{x:-37,z:6},{x:-45,z:6},{x:-45,z:-20},{x:-32,z:-20}],
  supportRoute: [{x:-32,z:-20},{x:-32,z:-23},{x:-24,z:-23},{x:-24,z:-60},
    {x:-8,z:-78},{x:-8,z:-112},{x:6,z:-124}],
  woundedRoute: [{x:-24,z:-56},{x:-24,z:-23},{x:-32,z:-23},{x:-32,z:-21}],
  runnerRoute: [{x:-24,z:-60},{x:-24,z:-23},{x:-31,z:-23},{x:-31,z:-24}],
  shelterPosts: [{x:-32,z:-24},{x:-32,z:-21},{x:-40,z:-20},{x:-37,z:-20}],
  // Clear the middle of the trench for the player and late-arriving companions.
  trenchCoverPosts: [{x:-46.35,z:32},{x:-43.65,z:34},{x:-46.35,z:36},{x:-43.65,z:38}],
  trenchContactRoute: [{x:-66,z:66},{x:-62,z:64},{x:-45,z:41},{x:-45,z:24},{x:-37,z:24},{x:-37,z:18}],
  frontPosts: [{x:-4,z:-124},{x:4,z:-122},{x:12,z:-124},{x:16,z:-124}],
  zhouGunSeat: {x:0,z:-127.4},
  zhouRest: {x:2.1,z:-124.6},
  zhouWoundThreshold:95,
  zhouExitRadiusM:.65,
  zhouShell: {from:{x:18,z:-210},height:30,flight:1.8,radius:3,damage:55,offsetX:1.1},
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
  intruders: [
    {id:"TrenchIntruderA",x:-38,z:15,weapon:"Type38",bayonet:true},
    {id:"TrenchIntruderB",x:-34,z:8,weapon:"Type38",bayonet:true},
    {id:"TrenchIntruderC",x:-27,z:8,weapon:"Type38",bayonet:true},
    {id:"TrenchIntruderD",x:-22,z:8,weapon:"Type38",bayonet:true},
  ],
  intruderGrenades:1,
  intruderRoutes: {
    TrenchIntruderA:[{x:-37,z:18}],
    TrenchIntruderB:[{x:-37,z:8},{x:-37,z:13}],
    TrenchIntruderC:[{x:-32,z:8},{x:-37,z:8}],
    TrenchIntruderD:[{x:-27,z:8},{x:-32,z:8}],
  },
  surfaceBurstSeconds: 3.6,
  // These teams seal the unloading apron. They do not all turn north to chase
  // closer friendlies already deep in the communication trench.
  surfaceSector: {minX:-85,maxX:-52,minZ:60,maxZ:112,selfDefenseM:12},
  surfaceRestSeconds: 2.2,
  playerFireLimit: 3,
  fireSlotSeconds: 3.5,
  rifleGuardCount: 2,
  frontReachRadiusM: 9,
});
