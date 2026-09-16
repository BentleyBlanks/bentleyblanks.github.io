// 2026-09-10 opening rebuild. Gameplay reconstruction of a local flank breach;
// these coordinates are not claims about surveyed 1938 positions.
export const OPENING = Object.freeze({
  // Only these authored companions are required by later dialogue and rescue.
  // Membership of a squad alone never makes an ordinary soldier a failure target.
  requiredSquadCast: Object.freeze(["luo","yaowa","heyoutian","liuwencai"]),
  derailCar: 1,
  derailPivot: {x:-74.6,y:.75},
  derailRollRad: -Math.PI/2,
  derailSeconds: 2.4,
  // User-approved carriage sequence; the authored Blender performance must finish
  // its failed first rise and second recovery before Luo reaches for Shunzi.
  nearShellFlightS: 1.4,
  // Start the whole failed rise only after the player's actual eyelid sample
  // exposes enough of the scene; sensory recovery keeps its independent curve.
  luoRecoveryMaxEyeClosure: .45,
  luoRecoverySeconds: 4.8,
  rescueSeconds: 4.4,
  rescueGripSeconds: 1.25,
  rescuePullSeconds: 2.1,
  rescueStandSeconds: 3.55,
  rescueDialogueLines: {reach:0,grip:1,steady:1},
  rescueGripFraction: .3,
  dialogueActions: {
    TrainMeal:{heyoutian:"HeReplyTalk",luo:"LuoBriefing"},
    TrainBanter:{liuwencai:"LiuCountTalk",heyoutian:"HeReplyTalk"},
    TrainBriefing:{luo:"LuoBriefing"},
    TrainShelling:{},
    WreckImpact:{yaowa:"YaowaAlarmCrouch"},
  },
  barrage: {
    firstFlightS: .45, shellFlightS: 1.2, shellRadiusM: 5,
    shellSourceOffset:{x:25,z:-18}, shellSourceHeightM:28,
    // All ranging impacts land beside the moving train. Only the separately
    // cued near hit overturns the player's carriage.
    shells: [
      {at:0,x:-62,z:-12},{at:.55,x:-88,z:8},{at:1.3,x:-63,z:17},
      {at:2.1,x:-87,z:-16},{at:3.4,x:-61,z:-4},{at:4.7,x:-89,z:12},
      {at:6.1,x:-62,z:-20},{at:7.4,x:-88,z:2},{at:9,x:-60,z:16},
      {at:10.5,x:-87,z:-10},{at:12,x:-62,z:5},{at:13.8,x:-89,z:18},
    ],
    shotIntervalS:.12, burstShots:6, burstRestS:.42, maxSeconds:20,
    tracerSpeedMps:680, shotSourceX:-42, shotSourceHeightM:3.8,
    passHeightM:3.02, wallHeightM:2.3, sourceLeadM:26,
    targetX:-94, sourceLanes:3, sourceSpacingM:4,
    targetStrideM:7, targetSpanM:17, targetCenterM:8,
    heightSteps:4, heightStepM:.11,
    shotCue:"type11", nearCue:"bulletCrack", impactCue:"ricochet",
    shotVolume:.9, nearVolume:.7, impactVolume:.55,
  },
  playerFall: {x:-73.25,z:88,eyeM:.38},
  // Luo braces beside the pull corridor. The player's 1.60m path stays at
  // least 1.10m from his root even when he does not take a backward step.
  rescueEnd: {x:-71.65,z:88},
  // The whole standing/crouching capsule must clear the last station step;
  // sampling the ground beneath the root alone misses its rounded lower edge.
  rescueGuide: {x:-72.1,z:89.1},
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
  // Yaowa must stand beside the player for ShelterAid; the other posts go by arrival order.
  shelterYaowaPost: 1,
  // Clear the middle of the trench for the player and late-arriving companions.
  trenchCoverPosts: [{x:-43.55,z:36.15},{x:-46.45,z:32.15},{x:-43.55,z:37.85},{x:-46.45,z:33.85}],
  trenchContactRoute: [{x:-66,z:66},{x:-62,z:64},{x:-45,z:41},{x:-45,z:24},{x:-37,z:24},{x:-37,z:18}],
  frontPosts: [{x:-4,z:-124},{x:4,z:-122},{x:12,z:-124},{x:16,z:-124}],
  zhouGunSeat: {x:0,z:-127.4},
  zhouRest: {x:2.1,z:-124.6},
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
  // User 2026-09-15: the Shelter step said "hold the corner" while nobody came
  // near it. A finite section follows the wounded man down the northern
  // communication trench and must be stopped at the bend before the breather.
  // They start beyond the (-24,-60) bend, out of sight of the roofed recess and
  // entirely in front of the player; nothing refills behind the cleared breach.
  shelterCorner: {x:-25.4,z:-24.6},
  shelterPursuers: [
    {id:"CornerPursuerA",x:-20.7,z:-63.7,weapon:"Type38",bayonet:true},
    {id:"CornerPursuerB",x:-18.7,z:-66,weapon:"Type38",bayonet:true},
    {id:"CornerPursuerC",x:-16.7,z:-68.2,weapon:"Type38",bayonet:true},
    {id:"CornerPursuerD",x:-14.7,z:-70.5,weapon:"Type38",bayonet:true},
    {id:"CornerPursuerE",x:-12.7,z:-72.7,weapon:"Type38",bayonet:true},
  ],
  shelterPursuerGrenades:1,
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
  // The last man rushes the corner instead of hiding in the loop or behind a bay
  // wall: a live run left one unseen for 90 s. Once this many remain, or after
  // afterS, survivors finish their own trench route to an open point short of the
  // bend. Two at once reached point-blank together and bled out a crouched player.
  shelterPush: {remaining:1, afterS:55, point:{x:-24.5,z:-28}, radiusM:1.5, coverSlackM:1, arrivalM:1.2, speedMps:2.8},
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
