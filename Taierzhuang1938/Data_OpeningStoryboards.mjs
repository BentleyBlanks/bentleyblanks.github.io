// 01–02 opening director data (docs/Data_FirstLevelOpeningSource20260923.md, contract
// docs/Data_FirstLevel0105Refactor20260923Contract.md §5.3–§5.5, space docs/Data_FirstLevelSpace0106_20260923.md §2.1/§3).
// World metres (X east, Z south); yaw in radians, three.js actor convention (0 faces -Z / north,
// +PI/2 faces west). Every director wait has a timeout here: the show never waits forever.
const P = (x, z, yaw) => Object.freeze(yaw == null ? { x, z } : { x, z, yaw });
const Route = (...points) => Object.freeze(points.map(([x, z]) => P(x, z)));
/** A first-person hand pose: frame, position, finger direction, back-of-hand normal, finger curl (deg). */
const H = (frame, p, f, n, c, extra = {}) => Object.freeze({ in: frame, p: Object.freeze(p), f: Object.freeze(f), n: Object.freeze(n), c: Object.freeze(c), ...extra });
/** Hand keys of one phase: [t, leftPose, rightPose], eased with smoothstep; `clock` names a director flag. */
const K = (...keys) => Object.freeze({ keys: Object.freeze(keys.map((k) => Object.freeze(k))) });
const KC = (clock, ...keys) => Object.freeze({ clock, keys: Object.freeze(keys.map((k) => Object.freeze(k))) });
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
  speed:Object.freeze({ walk:1.5, brisk:2.3, creep:1.15, run:3.2, drag:1.25, flee:3.4, stroll:1.1 }),
  arriveM:.12,
  // Hard timeouts (s since the phase began, or since the named wait began). A timeout never
  // skips a physical beat that the flow needs: it forces the beat (a late walker runs, a
  // missed shot is fired again by another man, a contact that did not kill is made lethal).
  timeouts:Object.freeze({
    banterExtraS:8, runnerArriveS:9, ordersExitS:9, blastEventS:3.5, blackS:2.6, wakeS:3.2,
    frontPassS:14, walkInS:12, interrogationExtraS:10, tauntExtraS:8, reachS:3.4, foundWalkS:10,
    dragOutS:9, bootsS:6, holdLineS:8, glimpseGateS:2.2, luoArriveS:7, heArriveS:7, fleeS:2.4,
    longShotRetryS:4, longShotForceS:8, checkS:9, kickRifleS:3, contactKillS:.35,
    // 02 -> 03: Yaowa catches up (else the scene starts where he is), the guard's run up the sap.
    collectionMeetS:8, guardArriveS:10,
  }),
  strikeBlood:{holdS:1.3,fadeS:8,opacity:.92},
  // ---- first person (Opening package item 2) -------------------------------------------
  // Shoulders sit behind the eye (the hidden sleeve roots). Poses are the RIGHT hand; the left hand
  // mirrors x. Frames: "cam" camera-local (x right, y up, +z back), "body" the eye with yaw-only axes,
  // "ground" body axes with y measured up from the ground under the hand. A lying eye is 0.42 m up
  // and the arm reaches ~0.5 m from a shoulder 0.14 m behind it, so hands on the ground stay within
  // 0.3 m in front of the eye; the shot pitches down (look.*) while a hand beat is the subject.
  firstPerson:Object.freeze({
    shoulderBackM:.14, shoulderDropM:.22, shoulderHalfWidthM:.18,
    // 「玩家只能小幅转头」: mouse look layered on the director's shot within ±maxRad (the runtime's
    // trapped clamp, Data_Tuning_FirstLevel.trappedLookRadians). Outside the listed phases (key
    // compositions: the cut, the find, the drag, K2) the look eases back to centre over returnS.
    headLook:Object.freeze({ maxRad:.14, returnS:.6,
      free:Object.freeze(["Wake","FrontPass","CaptiveDragged","CaptiveWall","Interrogation","Taunt","Wipe","Reach","Boots","Hold","Ask","LongShot"]) }),
    // Shot pitch (rad, + up) while a hand beat is the subject; the push-up lift of the lying eye (m).
    look:Object.freeze({ digPitch:-.45, boltPitch:-.2, clawPitch:-.8, reachPitch:-.28, grabPitch:-.24, pushUpM:.13, dragRollRad:.025,
      grabLeanM:.1, grabEyeM:.62, grabLookRifle:.5 }),     // 「抓住枪」: he leans over the rifle as it stops at his hand
    hands:Object.freeze({
      poses:Object.freeze({
        rest:H("cam",[.18,-.46,-.15],[0,-.4,-1],[.25,.65,.1],[14,24,14]),
        flat:H("ground",[.17,.025,-.25],[.1,-.25,-1],[0,1,0],[12,20,12]),          // palm on the mud
        push:H("ground",[.2,.03,-.19],[.3,-.2,-1],[0,1,.1],[6,10,6]),              // pressing up, fingers spread
        clawIn:H("ground",[.13,.02,-.27],[0,-.3,-1],[0,1,0],[22,30,20]),           // 「手指在泥里抓出一道痕」
        clawOut:H("ground",[.14,.02,-.15],[0,-.45,-1],[0,1,0],[58,72,46]),
        reach:H("ground",[.1,.15,-.29],[.05,-.12,-1],[0,1,0],[6,8,6]),             // 「手慢慢往前伸。够不到。」
        reachCurl:H("ground",[.1,.1,-.28],[.05,-.3,-1],[0,1,0],[40,55,35]),
        collar:H("body",[.04,-.17,-.12],[-.3,.7,-.6],[0,0,-1],[50,70,45]),         // own collar, pulled off the neck
        // 「伸手往外掏」 (layered on the loading hand in Banter): up under the chin, then out in front of the
        // face with the dirt (camera frame, so it is in view while the head is down).
        digCollar:H("cam",[.05,-.21,-.13],[-.3,.7,-.6],[0,0,-1],[50,70,45]),
        dig:H("cam",[.13,-.06,-.27],[-.2,.7,-.5],[0,-.3,1],[60,74,50]),         // raised off the rifle, dirt in the fist
        // The bolt keeps the loading hand's orientation (fingers round the knob): only the hand travels,
        // while the left hand brings the rifle in (boltRifle) so the knob is within the right arm's reach.
        boltGrip:H("cam",[.04,-.11,-.29],[-.3,.68,-.2],[0,-.3,1],[50,64,42]),
        boltPush:H("cam",[.04,-.1,-.33],[-.3,.68,-.2],[0,-.3,1],[50,64,42]),
        boltDown:H("cam",[.06,-.14,-.32],[-.3,.68,-.2],[0,-.3,1],[50,64,42]),
        boltRifle:H("cam",[-.02,-.2,-.3],[.55,.68,-.2],[0,-.3,1],[45,67,37]),
        protect:H("cam",[.24,-.11,-.28],[0,.7,-.6],[0,0,1],[11,23,15]),            // flung up by the blast
        limp:H("ground",[.25,.02,-.06],[.3,-.2,-1],[0,1,0],[25,35,20]),
        grasp:H("cam",[.12,-.14,-.3],[0,0,-1],[0,1,0],[44,66,42],{grasp:true}),    // on the dragging hand (left only)
        scrape:H("ground",[.21,.03,-.16],[.3,-.2,-1],[0,1,.1],[20,30,18],{osc:Object.freeze([.06,1.6])}),
        trail:H("body",[.22,-.4,-.12],[.3,-.5,-.8],[0,1,0],[25,35,20],{osc:Object.freeze([.05,1.6])}), // dragged backwards (eye .55)
        // Sitting against the spoil (eye .62–.72): hands on the thighs, one pushed down beside the hip.
        sit:H("body",[.2,-.45,-.12],[.2,-.4,-1],[0,1,0],[20,30,20]),
        brace:H("body",[.28,-.5,-.06],[.6,-.3,-.8],[0,1,0],[8,12,8]),             // 「伸手撑住地面」
        rifle:H("ground",[.2,.05,-.3],[.3,-.3,-1],[0,1,0],[46,62,40],{to:"rifle"}),// 「抓住枪」
      }),
      // Banter / Orders / Incoming hold the loading rifle (code); Blast throws it out of his hands.
      beats:Object.freeze({
        Blast:K([0,"protect","protect"],[.4,"protect","protect"],[.8,"limp","limp"]),
        Black:K([0,"limp","limp"]),
        // 「他试着撑起身体。背包带一下绷紧……又落回地面。手指在泥里抓出一道痕。」
        Wake:K([0,"limp","limp"],[1.05,"flat","flat"],[1.2,"push","push"],[1.8,"push","push"],[2,"flat","flat"],[2.2,"flat","clawIn"],[3,"flat","clawOut"]),
        FrontPass:K([0,"flat","clawOut"],[.6,"flat","flat"]),
        CaptiveDragged:K([0,"flat","flat"]), CaptiveWall:K([0,"flat","flat"]), Interrogation:K([0,"flat","flat"]),
        Slash:K([0,"flat","flat"]), Taunt:K([0,"flat","flat"]), Wipe:K([0,"flat","flat"]),
        Reach:K([0,"flat","flat"],[.6,"flat","flat"],[1.9,"flat","reach"],[2.05,"push","reach"],[2.35,"flat","reach"],[3.2,"flat","reachCurl"]),
        Found:K([0,"flat","reachCurl"],[1.2,"flat","flat"]),
        // 「一只手本能地抓住勒紧的衣领，另一只手撑着泥地」 (on ijaA's hand while he pulls in place; at his own
        // collar once he walks off with it, where ijaA's grip is solved onto the same point); chest and knees on the mud.
        Drag:K([0,"grasp","push"]), Snag:K([0,"grasp","push"]), KickBeam:K([0,"grasp","push"]), DragOut:K([0,"collar","scrape"]),
        // 「刚想撑起身体，枪托突然砸过来」 (the strike lands 0.42 s after buttAt).
        Butt:KC("buttAt",[-1,"flat","flat"],[0,"push","push"],[.42,"push","push"],[.75,"rest","rest"]),
        Boots:K([0,"rest","rest"]),
        // 「日兵甲抓住他的前襟，把上身从泥里拽起来」: the left hand at his own collar until it is let go.
        Hold:K([0,"rest","rest"],[1,"collar","rest"]), Ask:K([0,"collar","rest"]), KickShunzi:K([0,"collar","rest"]),
        Glimpse:K([0,"collar","rest"]), Collar:K([0,"collar","rest"]), Chop:K([0,"collar","rest"]),
        Parry:KC("collarReleasedAt",[-1,"collar","rest"],[0,"collar","rest"],[.6,"flat","flat"]),
        Flee:K([0,"flat","flat"]),
        DragCover:K([0,"flat","flat"],[.4,"trail","trail"]),
        LongShot:K([0,"sit","sit"]),
        Check:KC("checkLineAt",[-1,"sit","sit"],[.2,"sit","sit"],[.7,"sit","brace"]),
        KickRifle:KC("kickRifleAt",[-1,"sit","brace"],[.6,"sit","brace"],[1.1,"sit","rifle"]),
      }),
    }),
  }),
  // ---- concussion (Opening package item 2) -------------------------------------------------
  // A standing level per phase eased at riseRps / fallRps, with the near-miss curve
  // (Data_Tuning_FirstLevel.OPENING_PERCEPTION, sampled from the blast) and the same curve replayed
  // for the butt strike (× strike) laid over it, so nothing steps at a phase change. `amount` drives
  // the post blur/ghost and the hearing muffle (× hearing); after the hand-back the residue fades
  // over releaseDecayS while the player is in control. Imbalance = a slow irregular sway × amount.
  perception:Object.freeze({
    base:Object.freeze({ Banter:0, Orders:0, Incoming:0, Blast:.95, Black:.95, Wake:.9, FrontPass:.74, CaptiveDragged:.68,
      CaptiveWall:.64, Interrogation:.6, Slash:.6, Taunt:.58, Wipe:.56, Reach:.6, Found:.62, Drag:.66, Snag:.7, KickBeam:.7,
      DragOut:.72, Butt:.8, Boots:.88, Hold:.8, Ask:.76, KickShunzi:.76, Glimpse:.66, Collar:.64, Chop:.6, Parry:.6, Flee:.56,
      DragCover:.58, LongShot:.54, Check:.5, KickRifle:.46, Released:.44 }),
    riseRps:.8, fallRps:.1,
    focusScale:.3,
    strike:.85, kick:.22, kickFadeS:.45,
    releaseDecayS:16,
    hearing:.55,
    wobble:Object.freeze({ rollRad:.02, pitchRad:.011, yawRad:.008, hz:Object.freeze([.19,.31,.53]) }),
  }),
  // ---- 02 -> 03 at the casualty collection (RearTrench Collection / SupportOrder) ------------
  // Marks are arc-length offsets (m) along MISSION_STAGE_ROUTES.rearTrench from the player's
  // projection when the collection comes into view; + is toward the collection, - back toward RC.
  collection:Object.freeze({
    luoLeadM:6,                       // after the corner Luo keeps this far ahead on the lane
    luoAheadM:1.8, guardAheadM:3.1, yaowaBackM:1.3, yaowaSideM:.55, yaowaAsideM:1.05, heBackM:4.2, liuBackM:5.6,
    // The reporting guard comes up the support sap from the front (south) to SJ, then along the lane.
    guardRun:Route([-26.5,-126],[-30,-118]),
    sapMouth:P(-30,-118),             // where Luo points: 「何有田守后头！顺子，跟老子走！」
    reportAfterS:.45,                 // the guard catches his breath at the wall before the first line
    dragFurrows:Route([-29,-110],[-33,-106],[-36.5,-101.5]),   // 「有人拖着伤员往后走，靴子在泥里划出两道长痕」
    restPost:P(-31,-95.4),            // after the report the guard falls back to the collection (collection.runner)
  }),
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
    dirtS:2.3, lineAfterDirtS:.9,         // dirt into the collar once the fade-in (fadeInS) is up; 「妈卖批」 while he digs
  }),
  // ---- 01 Japanese ---------------------------------------------------------------------
  ija:Object.freeze({
    // ijaA/ijaB come down the link sap to J, then west along the trench to the buried comrade.
    walkIn:Route([23.5,-130],[18.2,-125.6],[14,-124.6],[9,-124.8]),
    walkInDelayS:Object.freeze({ ijaA:2.2, ijaB:3.0 }),   // after the eyes open (Wake)
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
    luoStart:P(-4.6,-112.8), heStart:P(-5.9,-112.3), liuStart:P(-7.2,-111.8),   // just round the rear corner
    liuRoute:Route([-4,-113],[-1.6,-117.2]),
    liuShot:P(-1,-121,2.0),               // bunker.liuwencaiShot: 15.4 m down the trench to J
    heCover:P(.05,-121.45),               // behind the mouth spoil's west face after the swap
    // Luo drags Shunzi (backwards) from the circle round the rubble into the mouth, behind the post.
    dragCoverRoute:Route([3.2,-124.25],[2.3,-124.95],[1.35,-125.05]),
    luoCheck:P(.5,-125.05),
    rifleMouth:P(1.4,-125.6,.3),          // bunker.rifleMouth: stock half-buried in the mouth (01 prop)
    rifleKicked:P(.66,-124.64,1.1),       // at his hand after Luo's kick (0.36 m, a seated reach); the pickup follows the prop
    kickFrom:P(1.85,-125.55),
  }),
  // ---- 02 withdrawal (RearTrench) --------------------------------------------------------
  withdraw:Object.freeze({
    // The player's way out: mouth -> bend -> crater step (exposed to F) -> SSW leg -> RC.
    lane:Route([.3,-125.1],[1.7,-125.3],[3.3,-124.2],[3.3,-122.2],[3.1,-121.3],[1.4,-120.8],[-.6,-120.4],[-1,-118.5],[-4,-113]),
    luoCover:P(-.6,-120.4),                // first intact wall past the low section, turned back to cover
    luoCorner:P(-7.2,-111.8),              // beyond RC, waiting for the player
    heBound:Route([-.2,-121.9],[-1.2,-118.2]),
    liuBound:Route([-1,-121],[-3.3,-114.6]),
    pursuitBaseFaceTo:P(-.2,-122.2),
  }),
});
