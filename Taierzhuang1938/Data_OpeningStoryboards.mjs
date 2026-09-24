// 01–02 opening director data (docs/Data_FirstLevelOpeningSource20260923.md, contract
// docs/Data_FirstLevel0105Refactor20260923Contract.md §5.3–§5.5, space docs/Data_FirstLevelSpace0106_20260923.md §2.1/§3).
// World metres (X east, Z south); yaw in radians, three.js actor convention (0 faces -Z / north,
// +PI/2 faces west). Every director wait has a timeout here: the show never waits forever.
const P = (x, z, yaw) => Object.freeze(yaw == null ? { x, z } : { x, z, yaw });
const Route = (...points) => Object.freeze(points.map(([x, z]) => P(x, z)));
export const OPENING_STORYBOARDS = Object.freeze({
  version:"20260923OpeningStoryboardsV4", animationBase:"./Animation/OpeningStoryboards/",
  // 2026-09-23 action library (contract §5.4). Names are frozen; per-clip metadata (role,
  // contacts, stages, props, root motion, holdLoop, next) is in the manifest `clips`.
  clips:{
    reused:["ClipLoad","MessengerReport","CollarControl","CollarDrag","BayonetClearWood","ButtThreat","CreepDadao",
      "DadaoHeavy","RifleDeflect","DadaoParry","KickRifle","GuardTurn","PointBlockade","InterrogateCrouch","InterpreterPoint",
      "DeathCollapseA","DeathCollapseB","DeathCollapseC","DeathCollapseD",
      "IjaKickPrisoner","IjaShoveForward","IjaTauntGesture","CaptiveKneelFlinch","CaptiveShovedStumble"],
    authored:["WoundedSitRifleIdle","BanterLaugh","BanterLookShoulder","BanterPatRifle","WoundedRiseWall","BlastSlamBuried",
      "IjaDragCollarFromDirt","IjaPullArm","CaptiveDraggedFromDirt","CaptiveKneelMud","CaptiveWallBrace",
      "IjaHairGrabPull","CaptiveHeadPulledBack","IjaDrawBayonet","IjaThroatSlash","CaptiveThroatCut","CaptiveClutchThroat",
      "CaptiveWallSlideTwitch","IjaWipeSheathBayonet","IjaReadyRifle","IjaCornerFire","IjaJunctionPeek","IjaSlingRifle",
      "IjaCollarDragSnag","IjaKickBeam","IjaButtStrike","IjaHoldCollarUp","InterpreterCrouchAsk","InterpreterGrabCollar",
      "InterpreterFlee","LuoDadaoChopRear","IjaChoppedFallWall","HeDadaoParryChop","IjaParriedChoppedFall","LuoDragToCover",
      "HeSwapDadaoRifle","LuoKneelCheck"],
    // Not in §5.4, added for the draft's "日兵甲把他推到沟壁上" pair (reported to the integrator).
    added:["IjaShoveToWall"],
  },
  // Contract §5.3: the director's phases, in order. Each is recorded in `beats` when it really starts.
  phases:Object.freeze({
    Trapped:Object.freeze(["Banter","Orders","Incoming","Blast","Black","Wake","FrontPass","CaptiveDragged","CaptiveWall",
      "Interrogation","Slash","Taunt","Wipe","Reach","Found","Drag","Snag","KickBeam","DragOut","Butt","Boots"]),
    BunkerRescue:Object.freeze(["Hold","Ask","KickShunzi","Glimpse","Collar","Chop","Parry","Flee","DragCover","LongShot",
      "Check","KickRifle","Released"]),
    RearTrench:Object.freeze(["Withdraw","Corner","Collection","SupportOrder"]),
  }),
  fps:24, fov:65, fadeInS:1.8,
  walkMps:2.3, turnRps:4.5, poseBlendS:.28, cameraBlendS:.65, cameraTurnRps:3.5,
  // Kept for the dadao ambush adapter in Script_OpeningStoryboardAnimation (legacy DadaoHeavy).
  ambushS:1.1,
  // Move speeds of the director's walks along trench polylines (m/s).
  speed:Object.freeze({ walk:1.5, creep:1.15, run:3.2, drag:1.25, flee:3.4, stroll:1.1 }),
  arriveM:.12,
  // Hard timeouts (s since the phase began, or since the named wait began). A timeout never
  // skips a physical beat that the flow needs: it forces the beat (a late walker runs, a
  // missed shot is fired again by another man, a contact that did not kill is made lethal).
  timeouts:Object.freeze({
    banterExtraS:8, runnerArriveS:9, ordersExitS:9, blastEventS:3.5, blackS:2.6, wakeS:3.2,
    frontPassS:14, walkInS:12, interrogationExtraS:10, tauntExtraS:8, reachS:3.4, foundWalkS:10,
    dragOutS:9, bootsS:6, holdLineS:8, glimpseGateS:2.2, luoArriveS:7, heArriveS:7, fleeS:2.4,
    longShotRetryS:4, longShotForceS:8, checkS:9, kickRifleS:3, contactKillS:.35,
  }),
  strikeBlood:{holdS:1.3,fadeS:8,opacity:.92},
  firstPerson:{shoulderBackM:.14,shoulderDropM:.22,shoulderHalfWidthM:.18},
  // The vanguard that must really be down before Check / KickRifle (contract §2.1): ijaA and
  // ijaB by the dadao, ijaD (the junction) by Liu Wencai. ijaC (the fold) may live.
  vanguardIds:["BunkerExecutionerA","BunkerExecutionerB","BunkerFollowB"],
  cast:Object.freeze({ ijaA:"BunkerExecutionerA", ijaB:"BunkerExecutionerB", ijaC:"BunkerFollowA", ijaD:"BunkerFollowB" }),
  // ---- 01 marks ------------------------------------------------------------------------
  shunzi:Object.freeze({
    trap:P(-1.3,-126.2,-Math.PI/2),     // bunker.player: pinned in the dugout pit, looking east out of the mouth (K1)
    seatEyeM:.9, standEyeM:1.32, lieEyeM:.42,
    dragged:P(3.8,-123.2),              // bunker.dragged = K2 eye (kneeling); ijaA drags him here
    cover:P(.45,-124.35),               // behind the south mouth post + mouth rubble: J and F are both masked (post shadow)
    lieCollarBackM:.16,                 // collar sits this far behind the lying eye
  }),
  // Banter tableau inside the intact dugout (seated Shunzi at the pit's west end).
  banter:Object.freeze({
    yaowa:P(-.35,-127.05), comradeSeat:P(.35,-124.35,0), luo:P(1.35,-125.95), he:P(4.6,-125.3), liu:P(6.1,-124.4),
    shouter:P(8.6,-122.9),
    runnerRoute:Route([-1,-118.5],[1.2,-120.6],[3.0,-121.6],[3.4,-123.4],[2.25,-124.95]),
    // Everyone who leaves after the order goes out of the mouth, down the SSW leg to RC and on west.
    exitRoute:Route([2.1,-125.2],[3.4,-123.6],[3.1,-121.6],[1.2,-120.6],[-1,-118.5],[-4,-113],[-9,-111.3]),
    hide:Object.freeze({ luo:P(-12.5,-112.2), yaowa:P(-16,-112), he:P(-10.4,-111.6), liu:P(-14.6,-112.3), runner:P(-19,-111) }),
    comradeBlast:P(3.6,-125.85,-Math.PI/2),   // R0: just outside the mouth, north wall 0.55 m on his left (BlastSlamBuried env)
    shellFrom:P(9,-116), shellAt:P(2.8,-120.4), // near miss on the bend's inner corner = the crater step
  }),
  // ---- 01 Japanese ---------------------------------------------------------------------
  ija:Object.freeze({
    // ijaA/ijaB come down the link sap to J, then west along the trench to the buried comrade.
    walkIn:Route([23.5,-130],[18.2,-125.6],[14,-124.6],[9,-124.8]),
    walkInDelayS:Object.freeze({ ijaA:3.5, ijaB:4.4 }),
    // After the throat cut ijaB turns to the front (east) until the Found drag begins.
    ijaBWatch:P(6.4,-125.1),
    // Found: ijaA's path from the kill spot back in through the mouth to Shunzi.
    foundRoute:Route([2.4,-125.55],[1.1,-125.9]),
    // ijaA drags Shunzi out of the pit, past the comrade, to the trench edge.
    dragOutRoute:Route([.3,-126.05],[1.6,-125.7],[2.9,-125.1],[3.9,-124.2],[4.3,-123.35]),
    interpreterEnter:Route([23.5,-130],[18.2,-125.6],[14,-124.6],[8,-124.6]),
    // Flee "往前沟逃去": east down the trench, into the depth sap, removed out of sight.
    interpreterFlee:Route([6.2,-123.6],[10,-124.1],[14,-124.6],[15.2,-118.5],[17.5,-111]),
  }),
  // ---- 01 comrade chain ----------------------------------------------------------------
  // Offsets are the manifest stages (anchor frame +x right, -z forward). The interrogation
  // extras stand where the chain leaves room (the comrade kneels back to the north wall).
  interrogation:Object.freeze({ interpreter:Object.freeze([.62,-.95,160]), ijaB:Object.freeze([-.95,-1.05,-150]),
    ijaAHold:Object.freeze([-.04,-.28,180]) }),
  // ---- 02 rescue circle (anchored at shunzi.dragged, facing `rescueFacing`) --------------
  rescue:Object.freeze({
    facing:P(-1,-118.5),                 // Shunzi looks up the SSW leg past the interpreter (K2)
    facingOffsetDeg:10,
    interpreter:Object.freeze([.28,-.95,180]),
    ijaAHoldBearingDeg:70,               // ijaA crouches east of him holding the front collar (He comes from behind ijaA)
    ijaBGuard:Object.freeze([-.55,-1.25]),  // ijaB aims at him from the left front, then kicks
    ijaBWatch:P(5.25,-125.82,-.96),       // ...then turns to the front at the north wall (wall 0.7 m on his left)
    kickM:.62,
    // Luo and He creep from RC down the SSW leg, over the crater step, to their marks.
    luoRoute:Route([-4,-113],[-1,-118.5],[1.2,-120.4],[3.1,-121.3],[4.7,-122.6],[5.25,-123.7]),
    heRoute:Route([-4,-113],[-1,-118.5],[1.2,-120.4],[3.1,-121.3],[4.9,-121.9]),
    luoStart:P(-5.6,-112.2), heStart:P(-6.6,-111.7), liuStart:P(-7.8,-111.4),
    liuRoute:Route([-4,-113],[-1.6,-117.2]),
    liuShot:P(-1,-121,2.0),               // bunker.liuwencaiShot: 15.4 m down the trench to J
    heCover:P(.05,-121.45),               // behind the mouth spoil's west face after the swap
    // Luo drags Shunzi (backwards) from the circle round the rubble into the mouth, behind the post.
    dragCoverRoute:Route([3.2,-124.25],[2.3,-124.95],[1.35,-125.05]),
    luoCheck:P(.5,-125.05),
    rifleMouth:P(1.4,-125.6,.3),          // bunker.rifleMouth: stock half-buried in the mouth (01 prop)
    rifleKicked:P(.78,-124.8,1.1),        // at his hand after Luo's kick; the pickup interaction follows the prop
    kickFrom:P(1.85,-125.55),
  }),
  // ---- 02 withdrawal (RearTrench) --------------------------------------------------------
  withdraw:Object.freeze({
    // The player's way out: mouth -> bend -> crater step (exposed to F) -> SSW leg -> RC.
    lane:Route([.3,-125.1],[1.7,-125.3],[3.3,-124.2],[3.3,-122.2],[3.1,-121.3],[1.4,-120.8],[-.3,-120.6],[-1,-118.5],[-4,-113]),
    luoCover:P(-.6,-120.4),                // first intact wall past the low section, turned back to cover
    luoCorner:P(-7.2,-111.8),              // beyond RC, waiting for the player
    heBound:Route([-.2,-121.9],[-1.2,-118.2]),
    liuBound:Route([-1,-121],[-3.3,-114.6]),
    pursuitBaseFaceTo:P(-.2,-122.2),
  }),
});
