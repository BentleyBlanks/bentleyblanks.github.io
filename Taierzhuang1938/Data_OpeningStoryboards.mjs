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
  // The eye travels at most this fast (m/s): ijaA's yank at the collar peaks at 8.7 m/s on the 12 fps
  // player track (09-24 probe, 0.145 m in one frame); capped, the drag reads as a pull, not a cut.
  cameraMoveMps:7.5,
  // Kept for the dadao ambush adapter in Script_OpeningStoryboardAnimation (legacy DadaoHeavy).
  ambushS:1.1,
  // Move speeds of the director's walks along trench polylines (m/s).
  speed:Object.freeze({ walk:1.5, brisk:2.3, creep:1.15, run:3.2, drag:1.25, flee:3.4, stroll:1.1 }),
  arriveM:.12,
  culledHeadM:1.4,     // head height used for an actor the AI has culled (its bones are not updated)
  shotRiseM:1.4,       // a squad rifleman's scripted shot leaves at least this high over his feet (he rises to fire)
  // Hard timeouts (s since the phase began, or since the named wait began). A timeout never
  // skips a physical beat that the flow needs: it forces the beat (a late walker runs, a
  // missed shot is fired again by another man, a contact that did not kill is made lethal).
  timeouts:Object.freeze({
    banterExtraS:8, runnerArriveS:9, ordersExitS:9, blastEventS:3.5, blackS:2.6, wakeS:3.2,
    frontPassS:14, walkInS:12, interrogationExtraS:10, tauntExtraS:8, reachS:3.4, foundWalkS:10,
    dragOutS:9, bootsS:8, holdLineS:8, glimpseGateS:2.2, luoArriveS:7, heArriveS:7, fleeS:2.4,
    longShotRetryS:4, longShotForceS:8, checkS:9, kickRifleS:3, contactKillS:.35,
    // 02 -> 03: Yaowa catches up (else the scene starts where he is), the guard's run up the sap.
    collectionMeetS:8, guardArriveS:10,
  }),
  // The butt strike's blood layer: opacity for holdS, settling to `settle` over settleS (SB04A 「血层约 0.3」, contract §4.4),
  // then fading out over fadeS.
  strikeBlood:{holdS:.2,opacity:.92,settleS:1.1,settle:.3,fadeS:8},
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
      grabLeanM:.1, grabEyeM:.62, grabLookRifle:.5,     // 「抓住枪」: he leans over the rifle as it stops at his hand
      // K2 「视线越过他的肩膀」: the interpreter crouches on the crater step 0.6 m above Shunzi's knees, square
      // between him and the SSW leg; the head comes up and leans aside so the leg (Luo) clears his shoulder
      // (09-24 composition probe: 0.25 m aside, eye 1.0 m keeps the interpreter's face at the right third).
      glimpseAsideM:.25, glimpseEyeM:1.0, glimpseInterpreterPull:.15,
      // LongShot: lean [dx, dz] (m) from the cover seat past the south mouth post, eye height over the rubble.
      longShotLean:Object.freeze([.05,-.34]), longShotEyeM:.8,
      // Check: sit back from Luo's kneel, eye no lower than this, look at his eyes rather than the chin.
      checkBackM:.14, checkEyeM:.8, checkLookUpM:.06,
      // Parry: the eye steps this far aside from ijaA's back so He (behind ijaA) is seen, and holds the
      // duel this long after the cut before following the interpreter.
      duelAsideM:.4, duelHoldS:.45 }),
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
        // SB03A: the LEFT hand reaches for the rifle (the storyboard's arm comes in from the lower left).
        Reach:K([0,"flat","flat"],[.6,"flat","flat"],[1.9,"reach","flat"],[2.05,"reach","push"],[2.35,"reach","flat"],[3.2,"reachCurl","flat"]),
        Found:K([0,"reachCurl","flat"],[1.2,"flat","flat"]),
        // 「一只手本能地抓住勒紧的衣领，另一只手撑着泥地」 (on ijaA's hand while he pulls in place; at his own
        // collar once he walks off with it, where ijaA's grip is solved onto the same point); chest and knees on the mud.
        Drag:K([0,"grasp","push"]), Snag:K([0,"grasp","push"]), KickBeam:K([0,"grasp","push"]), DragOut:K([0,"collar","scrape"]),
        // 「刚想撑起身体，枪托突然砸过来」 (the strike lands 0.42 s after buttAt).
        // The blow lands at the clip's strike + ija.butt.holdS (the pause at the top): .42 + .45 s after buttAt.
        Butt:KC("buttAt",[-1,"flat","flat"],[0,"push","push"],[.87,"push","push"],[1.05,"rest","rest"]),
        Boots:K([0,"rest","rest"]),
        // 「日兵甲抓住他的前襟，把上身从泥里拽起来」: the left hand at his own collar until it is let go.
        Hold:K([0,"rest","rest"],[1,"collar","rest"]), Ask:K([0,"collar","rest"]), KickShunzi:K([0,"collar","rest"]),
        Glimpse:K([0,"collar","rest"]), Collar:K([0,"collar","rest"]), Chop:K([0,"collar","rest"]),
        Parry:KC("collarReleasedAt",[-1,"collar","rest"],[0,"collar","rest"],[.75,"collar","rest"],[1.15,"flat","flat"]),
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
    // 2026-09-25 storyboard round (contract §2.1): he sits at the back of the dugout for the talk and the order
    // (SB01), stands and steps toward the mouth after the others (Incoming), is knocked down by the near miss
    // (SB02) and wakes pinned in the mouth itself, the fallen timber on his pack (SB03–SB04). The Space's
    // MISSION_PLACEMENT.bunker.player (-1.3,-126.2) stays the dugout's anchor (A.bunker); the director's
    // Shunzi marks are these.
    seat:P(-1.95,-126.25,-93*Math.PI/180),   // SB01 eye: back of the dugout, the mouth x 0.30–0.74 of the frame
    incomingStep:P(-1.15,-126.1),            // Incoming: stood up and a step toward the mouth when the shell lands
    blastFall:P(-.9,-126.0),                 // SB02: where the eye has dropped to at the end of the fall
    trap:P(.1,-125.45,-Math.PI/2),           // Wake → KickBeam: lying in the mouth, looking east down the trench
    // The lying eye (contract §2.1: Wake→Found eye (0.25–0.35,−125.2), 0.18–0.26 m over the mud), a little ahead of
    // the pinned body with the chin in the mud: SB03 holds witnessEye, the reach (SB03A) sinks to reachEye.
    witnessEye:P(.35,-125.15), reachEye:P(.25,-125.25),
    seatEyeM:.95, standEyeM:1.32, lieEyeM:.26, reachEyeM:.18,
    // SB04 (contract §2.5): ijaA drags him out of the mouth to the trench edge east of the mouth rubble (where the
    // fallen lintel lies) and brings the butt down on him there. SB04A (§2.7): he drags him on by the forearm, south
    // of the rubble, into the north mouth of the SSW leg, where 02's circle closes round him (§2.6).
    butt:P(2.3,-124.4),
    dragged:P(.6,-123.9),
    cover:P(.45,-124.35),               // behind the south mouth post + mouth rubble: J and F are both masked (post shadow)
    lieCollarBackM:.16,                 // collar sits this far behind the lying eye
  }),
  // Banter tableau inside the intact dugout (seated Shunzi at the pit's west end).
  banter:Object.freeze({
    // SB01 (contract §5): Yaowa low against the north wall side-on to the camera, Luo kneeling in the mouth with his
    // back to the camera looking east, the wounded comrade against the south wall with his face turned to the room.
    yaowa:P(-.55,-127.35,-150*Math.PI/180), comradeSeat:P(.35,-124.35,30*Math.PI/180), luo:P(1.75,-125.7,-Math.PI/2),
    he:P(4.6,-125.3), liu:P(6.1,-124.4), shouter:P(8.6,-122.9),
    // Luo's kneel until his order (LuoKneelCheck held inside its kneel loop, pendingWiring SB01). Why he stood before:
    // in Banter/Orders ResolveOpeningActorPose (Script_OpeningActorPerformance) turns a stationary Luo's pose into
    // MessengerReport / PointBlockade (standing) unless the clip is in ContactClips, and the director's Move hands the
    // native layer kneel:0 (Script_OpeningStoryboardAnimation). LuoKneelCheck is a contact clip, so it is kept.
    luoKneelS:1.6,
    // SB01 camera (eye = shunzi.seat) and the talk's head turn toward whoever speaks (clamped, eased).
    seatShot:Object.freeze({ yawDeg:-93, pitchDeg:-15, speakerTurnRad:.14, turnRps:2 }),
    // Incoming: standing, the step toward the mouth takes this long; the look is at the comrade outside.
    incomingStepS:1.2,
    // SB02 mirrored (contract §2.2): the shell lands at fallStartS (FireShell flight); the eye drops to eyeM and turns
    // to yaw/pitch with the head rolled to the left by fallEndS; the eyes close at eyesCloseS; Black at phaseS.
    blastShot:Object.freeze({ fallStartS:.22, fallEndS:.65, eyeM:.75, yawDeg:-66, pitchDeg:-14, rollDeg:17, eyesCloseS:.95, phaseS:1.0 }),
    // The runner comes down the SSW leg, round the bend and in along the north wall to the inside of the north post.
    runnerRoute:Route([-1,-118.5],[1.2,-120.6],[3.0,-121.6],[3.3,-123.6],[2.2,-126.0],[.72,-127.0]),
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
    // At the far call (CaptiveTaunt.04) ijaB turns to the front (east) where he stands, then backs off (interrogation.backOff).
    ijaBWatchYaw:-Math.PI/2,
    // SB03A (contract §5): after the wipe ijaA walks off east-south-east toward the front and is at lookBack (facing
    // away, north-east) when the pinning timber shifts (Reach beamShift); he stops and turns back to the mouth --
    // the root to lookBackOffDeg short of facing the eye (the head layer adds the rest, clamped for a guard) --
    // and looks for at least lookBackS before he walks back (foundRoute). SB03A camera: reachShot from reachEye.
    lookBack:P(4.9,-124.45,-60*Math.PI/180), lookBackOffDeg:45, lookBackTurnS:.35, lookBackS:.6,
    reachShot:Object.freeze({ yawDeg:-82, pitchDeg:4, rollDeg:3, dipDeg:-12 }),
    // Found: ijaA's path from lookBack back to the mouth, where Shunzi lies (the snag root is inside the posts).
    foundRoute:Route([2.6,-125.3],[1.6,-125.35]),
    // ijaA drags Shunzi out of the mouth, round the north-east corner of the mouth rubble and south-south-east to the
    // trench edge; Shunzi, 0.62 m behind him, ends at shunzi.butt.
    dragOutRoute:Route([1.3,-125.4],[2.15,-125.0],[2.49,-123.81]),
    // SB04 (contract §5): ijaA stands over his head on the side yawDeg (yaw convention: 0 = north of him), coming
    // round the east side (approach). The camera (buttShot) looks up past him at the north wall's timber door with
    // the dead comrade right of it. Wave 1 plays the existing IjaButtStrike (it stands straight) with its clip time
    // held at raiseTopS for holdS (the pause at the top, >= 0.4 s) before the blow (pendingWiring SB04).
    butt:Object.freeze({ yawDeg:0, approach:Route([3.0,-124.55]), raiseTopS:.3, holdS:.45 }),
    // pitchDeg 22 (contract ~30, ±8): at 30 the north rim sat mid-frame, half the picture sky (SB04 wants <= 40 %).
    buttShot:Object.freeze({ eyeM:.35, yawDeg:-18, pitchDeg:22, rollDeg:-4 }),
    // SB04A (contract §2.7, §5; Boots from 0.6 s after the blow): ijaA drags him by the forearm from shunzi.butt along
    // route -- back past the mouth north of its rubble (BunkerMouthRubbleS, the spoil south of it walls off the way
    // between) and south into the SSW leg's north mouth (shunzi.dragged) -- at speedMps after catchS, backing leadM
    // ahead of him along the same line and facing him (he ends south of him, where 02's circle has him). Turning
    // into the leg the camera looks up at his face yawOffsetDeg aside: the mouth's south post and rubble on the left,
    // the SSW leg with the interpreter and ijaB running up it on the right (the storyboard's sides). The boots close
    // in over the last closeS (Boots' old low shot).
    dragAway:Object.freeze({ route:Route([1.55,-124.95],[.62,-124.95],[.6,-124.45]), leadM:.65, speedMps:1.1, catchS:.35, closeS:.9 }),
    // headAboveDeg: his head that far above the centre of the picture (the storyboard's face in the upper third).
    dragShot:Object.freeze({ eyeM:.3, yawOffsetDeg:-8, pitchDeg:12, maxPitchDeg:38, headAboveDeg:14, rollDeg:-8 }),
    interpreterEnter:Route([23.5,-130],[18.2,-125.6],[14,-124.6],[8,-124.6]),
    // Flee "往前沟逃去": east down the trench, into the depth sap, removed out of sight.
    interpreterFlee:Route([6.2,-123.6],[10,-124.1],[14,-124.6],[15.2,-118.5],[17.5,-111]),
  }),
  // ---- 01 comrade chain ----------------------------------------------------------------
  // Offsets are the manifest stages (anchor frame +x right, -z forward). The interrogation
  // extras stand where the chain leaves room (the comrade kneels back to the north wall).
  interrogation:Object.freeze({ ijaAHold:Object.freeze([-.04,-.28,180]),
    // SB03 (contract §5): the interpreter crouches side-on to the comrade east of the group (he no longer kneels
    // between the camera and the comrade), ijaB stands behind him; world marks (yaw radians).
    interpreterAt:P(4.75,-124.85,50*Math.PI/180), ijaBAt:P(5.0,-124.86,30*Math.PI/180),
    // SB03 camera from shunzi.witnessEye (lieEyeM): the group left of centre, the trench's depth right.
    witnessShot:Object.freeze({ yawDeg:-80, pitchDeg:5, rollDeg:4 }),
    // Contract §2.7: backOffAfterS into Wipe the interpreter, then ijaB (backOffStaggerS later), go back down the SSW
    // leg -- over the crater step like the withdrawal lane (the gap between the mouth rubble and the spoil is too
    // narrow to walk) -- leaving SB03's picture on the right (out of SB03A's); from the blow they come running back up
    // it (hurryMps, from Boots hurryAfterS) -- SB04A's men in the depth.
    backOffAfterS:2.5, backOffStaggerS:.8,
    backOffRoute:Route([3.3,-124.2],[3.3,-122.2],[3.1,-121.3],[1.4,-120.8],[-.6,-120.4]),
    backOff:Object.freeze({ interpreter:P(-1.6,-118.4), ijaB:P(-2.2,-117.3) }),
    hurryMps:2.0, hurryAfterS:.8 }),
  // ---- 02 rescue circle (anchored at shunzi.dragged, facing `rescueFacing`) --------------
  rescue:Object.freeze({
    facing:P(-1,-118.5),                 // Shunzi looks up the SSW leg past the interpreter (K2)
    facingOffsetDeg:10,
    interpreter:Object.freeze([.28,-.95,180]),
    // ijaA crouches east of him holding the front collar; He comes in behind ijaA. At 70° He's chopParry
    // mark fell 0.9 m up the south trench wall (inside its mesh: the parry was never seen, 09-24 probe);
    // at 115° it is on the trench floor (5.6, -123.8).
    ijaAHoldBearingDeg:115,
    ijaBGuard:Object.freeze([-.55,-1.25]),  // ijaB aims at him from the left front, then kicks
    ijaBWatch:P(5.25,-125.82,-.96),       // ...then turns to the front at the north wall (wall 0.7 m on his left)
    kickM:.62,
    // Luo and He creep from RC down the SSW leg, over the crater step, to their marks.
    luoRoute:Route([-4,-113],[-1,-118.5],[1.2,-120.4],[3.1,-121.3],[4.7,-122.6],[5.25,-123.7]),
    heRoute:Route([-4,-113],[-1,-118.5],[1.2,-120.4],[3.1,-121.3],[4.9,-121.9]),
    luoStart:P(-4.6,-112.8), heStart:P(-5.9,-112.3), liuStart:P(-7.2,-111.8),   // just round the rear corner
    heTrailM:1.5,                        // He closes up (brisk) when he is this much further from his mark than Luo from his
    liuRoute:Route([-4,-113],[-1.6,-117.2]),
    liuShot:P(-1,-121,2.0),               // bunker.liuwencaiShot: 15.4 m down the trench to J
    heCover:P(.05,-121.45),               // behind the mouth spoil's west face after the swap
    // Luo drags Shunzi (backwards) from the circle round the rubble into the mouth, behind the post.
    dragCoverRoute:Route([3.2,-124.25],[2.3,-124.95],[1.35,-125.05]),
    luoCheck:P(.5,-125.05),
    // 01 prop: stock toward Shunzi, muzzle to the south-east in the mud of the mouth, out of reach (SB03: left of
    // centre, low). Prop yaw: the muzzle points along (-sin yaw, -cos yaw) (survey A, checked in picture).
    rifleMouth:P(1.25,-125.75,-125*Math.PI/180),
    // At his hand after Luo's kick (0.34 m, a seated reach); muzzle to the west into the dugout, clear of the south
    // post and the mouth rubble (turned east, its muzzle lay inside BunkerMouthRubbleS). The pickup follows the prop.
    rifleKicked:P(.3,-124.66,1.1+Math.PI),
    kickFrom:P(1.85,-125.55),
  }),
  // ---- storyboard shots (contract docs/Data_FirstLevelStoryboard0103Contract.md §5, read by
  // Script_OpeningStoryboardShots.mjs) ----------------------------------------------------------
  // Each shot: the moment in the real 01–02 flow (phase + age, or a `when` expression over the director s,
  // the runtime r and window.Tengxian g), the storyboard picture (REL/附件/storyboard, not in the repository)
  // and the part of its picture criteria that the staging and the camera decide: screen x / y are 0..1 of
  // the 1280×720 frame (left -> right, top -> bottom), head points; points = world landmarks [x, h over
  // ground, z]; absent = roles that must be out of the picture; inFrameAtLeast = how many of a group are seen.
  storyboardShots:Object.freeze([
    // SB01: the order comes in (BunkerOrders.01): mouth x 0.30–0.74, Yaowa left third, the runner at the
    // north post left of centre, Luo's back in the middle, the wounded comrade right, men going away down the trench.
    Object.freeze({ id:"SB01", storyboard:"Storyboard_01_CaveResupply.png",
      when:"s.phase==='Orders'&&s.flags['scene:BunkerOrders']!=null&&r.time-s.flags['scene:BunkerOrders']>1.2",
      judge:{ camera:{ eyeM:[.85,1.05], pitchDeg:[-20,-9], yawDeg:[-101,-85] }, horizonY:[.16,.34],
        points:{ mouthPostN:{ at:[1.05,1.0,-127.5], x:[.2,.4] }, mouthPostS:{ at:[1.05,1.0,-124.3], x:[.64,.84] } },
        actors:{ yaowa:{ x:[0,.34] }, runner:{ x:[.2,.5] }, luo:{ x:[.4,.64] }, comrade:{ x:[.64,1] } },
        inFrameAtLeast:[{ roles:["DepthNra"], count:2, minDistM:8 }], rifleHidden:true } }),
    // SB02: the near miss, mirrored (contract §2.2): tilted ≥ 12° head to the left, low, the north post and the
    // dugout's north wall on the left, the mouth and the blast on the right; the eyes still open.
    Object.freeze({ id:"SB02", storyboard:"Storyboard_02_NearMissBlast.png", phase:"Blast", age:.7,
      judge:{ camera:{ eyeM:[.6,.95], pitchDeg:[-24,-4], rollDeg:[12,26], yawDeg:[-78,-54] }, eyeClosure:[0,.2],
        points:{ mouthPostN:{ at:[1.05,1.2,-127.5], x:[.25,.6] } } } }),
    // SB03: the questioning seen from the mouth mud: the group left of centre with the north wall's door (Set's
    // trenchFacadeN, x 2.7–3.9) behind it, the trench's depth right, the rifle low left of centre out of reach.
    Object.freeze({ id:"SB03", storyboard:"Storyboard_03_ProneWitness.png", phase:"Interrogation", age:3,
      judge:{ camera:{ eyeM:[.2,.32], pitchDeg:[1,10], rollDeg:[1,8], yawDeg:[-88,-72] },
        actors:{ ijaA:{ x:[.25,.58] }, comrade:{ x:[.25,.58] }, interpreter:{ x:[.4,.75], distM:[3.5,5.5] }, ijaB:{ x:[.4,.8] } },
        points:{ facadeDoor:{ at:[3.3,.9,-126.3], x:[.25,.6] } }, rifle:{ x:[.2,.55], y:[.62,1] } } }),
    // SB03A: the reach; ijaA turned round by the timber's noise right of centre, the dead comrade left of centre at
    // the wall, the interpreter and ijaB gone down the SSW leg, Japanese going away down the trench.
    Object.freeze({ id:"SB03A", storyboard:"Storyboard_03A_ReachRifle.png", phase:"Reach", age:3.1,
      judge:{ camera:{ eyeM:[.12,.26], pitchDeg:[-2,9], rollDeg:[0,7], yawDeg:[-90,-74] },
        actors:{ comrade:{ x:[.2,.52] }, ijaA:{ x:[.55,.88], distM:[3.8,5.6] } }, absent:["interpreter","ijaB"],
        inFrameAtLeast:[{ roles:["DepthIja"], count:1, minDistM:5 }], rifle:{ x:[.3,.65], y:[.55,1] } } }),
    // SB04: at the top of the swing (held), looking up past ijaA at the north wall's door with the comrade right of
    // it, the rim of the wall above the middle (sky <= 40 %). Wave 1: IjaButtStrike stands straight, so his head
    // may be above the frame (pendingWiring SB04 restores the head check).
    Object.freeze({ id:"SB04", storyboard:"Storyboard_04_Discovered.png",
      when:"s.phase==='Butt'&&s.flags.buttAt!=null&&r.time-s.flags.buttAt>=.55",
      judge:{ camera:{ eyeM:[.28,.42], pitchDeg:[20,36], rollDeg:[-8,-1], yawDeg:[-28,-8] },
        actors:{ ijaA:{ x:[.22,.5], distM:[.3,1], headOptional:true }, comrade:{ x:[.6,.98] } },
        points:{ facadeDoor:{ at:[3.3,.9,-126.3], x:[.4,.75] }, northRim:{ at:[3.3,0,-127.3], y:[0,.42] } } } }),
    // SB04A: dragged by the forearm into the SSW leg: ijaA's face close, the mouth's south post and rubble left, the
    // SSW leg with the interpreter and ijaB running up it right (contract §2.7).
    Object.freeze({ id:"SB04A", storyboard:"Storyboard_04A_DraggedIntoTrench.png", phase:"Boots", age:2.1,
      judge:{ camera:{ eyeM:[.2,.4], rollDeg:[-12,-4] },
        actors:{ ijaA:{ x:[.3,.65], distM:[.4,1.1] }, interpreter:{ x:[.5,1], distM:[1.8,6.5] }, ijaB:{ distM:[2,8] } },
        points:{ mouthPostS:{ at:[1.05,1.0,-124.3], x:[0,.4] } } } }),
  ]),
  // Wave 1 stand-ins (contract §3): where a clip, hand pose, lens effect, set piece or blast effect of another
  // package belongs, the director uses the nearest existing one and lists it here. Wave 2 wires each entry to
  // the named replacement and removes it; the list must then be empty (Script_OpeningStoryboardsTest).
  pendingWiring:Object.freeze([
    // SB01 (Banter / Orders)
    {shot:"SB01", what:"Yaowa sits low against the north wall loading clips, side-on to the camera",
      now:"ClipLoad (legacy kneeling load) at banter.yaowa, Tableau/Tableau2", wave2:"YaowaSitLoad (Anim, optional in contract §4.1) if built; else keep ClipLoad"},
    {shot:"SB01", what:"the runner leans on the north post and calls in to the room",
      now:"MessengerReport at runnerRoute's end (PhaseOrders)", wave2:"RunnerLeanPostCall holdLoop with its post contact (Anim)"},
    {shot:"SB01", what:"Luo kneels in the mouth looking out down the trench",
      now:"LuoKneelCheck held at banter.luoKneelS (its kneel loop; the reach arm shows) in Tableau/PhaseOrders", wave2:"a native kneel (KneelHold/RifleIdle, contract §4.1): needs an Anim-owned hook -- a director request that passes kneel:1 through Script_OpeningStoryboardAnimation's Move state (now forced to 0) and is exempt from ResolveOpeningActorPose's Banter/Orders Luo substitution"},
    {shot:"SB01", what:"first person: clip on the left palm, rifle across the thighs, legs in view",
      now:"supply hands holding the loading rifle across the view (Script_OpeningFirstPerson)", wave2:"EXTRA_HAND_POSES.palmClip, FP_PROPS.loadingRifleOnLegs and LEG_POSES.sitForward in beats.Banter/Orders (Eye)"},
    {shot:"SB01", what:"north-wall crate stack, foreground crate, duckboards and revetment of the front trench",
      now:"nothing (bare earth)", wave2:"OpeningSet props bunkerCrateStackN, bunkerCrateFront, duckboardsFront, revetmentFront (Set)"},
    // SB02 (Blast)
    {shot:"SB02", what:"mud, clods and splinters blown into the dugout from the south lip of the mouth, on the right",
      now:"FireShell at banter.shellAt only (the crater, not seen from inside) in Blast()", wave2:"OpeningBlastFx.DirectionalBlast((1.2,-124.5) toward the north-west) at blastShot.fallStartS (Set)"},
    {shot:"SB02", what:"the lintel's south end falls in the mouth 0.25–0.6 s and stays",
      now:"nothing falls; the loose beam appears on his pack from Black (PhaseBlack PlaceBeam)", wave2:"OpeningSet.FallLintel(progress) / fallenLintel over Blast (Set)"},
    {shot:"SB02", what:"strong chromatic aberration, radial edge blur, heavier vignette",
      now:"the existing concussion blur/ghost only", wave2:"OpeningLens.Evaluate(phase, age, events) into Perception().lens (Eye)"},
    {shot:"SB02", what:"right hand flung open toward the mouth, the loading rifle sliding out of the foreground, legs in view",
      now:"protect/limp hand keys (beats.Blast); the loading rifle vanishes at 0.12 s; the mission rifle is hidden until Black (ApplyCamera)", wave2:"EXTRA_HAND_POSES.flingOpen, FP_PROPS.loadingRifleOnLegs.rifleSlide and LEG_POSES.sprawl in beats.Blast (Eye)"},
    {shot:"SB02", what:"sandbag wall, poster, lit lantern and crates on the dugout's north wall (left of the frame)",
      now:"nothing (bare earth)", wave2:"OpeningSet props bunkerSandbagWallN, bunkerPoster, bunkerLantern, bunkerCrateStackN (Set)"},
    // SB03 (CaptiveDragged .. Wipe, witnessShot)
    {shot:"SB03", what:"the timber door in the north wall behind the group, the fallen lintel upper left, flag, sandbags and stakes, lower mouth rubble",
      now:"bare north wall; the loose beam only; BunkerMouthRubbleS as built", wave2:"OpeningSet trenchFacadeN, fallenLintel, flagTrench, sandbagStakesSouth, revetmentFront and the lowered mouth rubble (Set)"},
    {shot:"SB03", what:"three black smoke columns in the sky",
      now:"clear sky", wave2:"Data_OpeningSet0103.SMOKE for stages 01-02 (Set)"},
    {shot:"SB03", what:"blood-red corner vignette, shallow depth of field (near blur), mud specks on the lens",
      now:"the existing concussion blur/ghost only", wave2:"OpeningLens.Evaluate LOOKS for CaptiveDragged..Wipe into Perception().lens (Eye)"},
    {shot:"SB03", what:"right hand spread in the mud at the lower right (screen about 0.62, 0.75), arm reaching forward",
      now:"flat hand keys (beats.CaptiveDragged..Wipe): the palms are just below the frame", wave2:"a forward prone palm pose from the Eye package in beats.CaptiveDragged..Wipe (Eye)"},
    {shot:"SB03", what:"blood on the comrade's face",
      now:"none", wave2:"CharacterFacial.SetFaceBlood(comrade rig, ~0.8) from CaptiveDragged (Face)"},
    // SB03A (Reach -> Found)
    {shot:"SB03A", what:"ijaA stops and looks back low over his shoulder at the mouth, rifle held low, the snarl starting",
      now:"GuardTurn at ija.lookBack, root turned to lookBackOffDeg short of the eye + head lookAt the camera (LookBack, UpdatePerformances)", wave2:"IjaLookBackLow (Anim) in LookBack(), in ContactClips; expression.snarl rising (Face)"},
    {shot:"SB03A", what:"a whole timber across the top edge (the fallen roof), dead trees on the rim, the flag",
      now:"nothing", wave2:"OpeningSet roofTimberDown, deadTreeRim*, flagTrench (Set)"},
    {shot:"SB03A", what:"the left hand stops about 0.15 m short of the rifle's stock; the pack strap at the left edge",
      now:"the left hand's reach/reachCurl (0.29 m ahead)", wave2:"EXTRA_HAND_POSES.reachLeft and FP_PROPS.packStrap in beats.Reach (Eye)"},
    {shot:"SB03A", what:"dark, low contrast, weaker red edge, mud specks",
      now:"the existing concussion blur/ghost only", wave2:"OpeningLens LOOKS for Reach/Found (Eye)"},
    // SB04 (Butt)
    {shot:"SB04", what:"ijaA bent over Shunzi, left hand at his collar, rifle held butt-up over his head, pause at the top, one-handed blow",
      now:"IjaButtStrike (stands straight, both hands) with its clip time held at ija.butt.raiseTopS for holdS (ButtClipTime); the SB04 judge lets his head be out of frame (headOptional)", wave2:"IjaButtStrikeCollar (Anim) with holdUntil and its buttHit event for the strike; drop headOptional from storyboardShots SB04"},
    {shot:"SB04", what:"ijaA snarls from Found to the end of the blow",
      now:"neutral face", wave2:"CharacterFacial.SetExpression(ijaA rig, {snarl:1}) Found..Butt (Face)"},
    {shot:"SB04", what:"white flash when the butt lands",
      now:"Deafen, strike roll and the blood layer only", wave2:"lens.flash on the buttHit event (Eye)"},
    {shot:"SB04", what:"Shunzi's right hand grips ijaA's forearm at his collar",
      now:"push hand keys (beats.Butt)", wave2:"EXTRA_HAND_POSES.gripForearm on ijaA in beats.Butt (Eye)"},
    {shot:"SB04", what:"broken planks in the foreground by the butt spot; the timber door behind",
      now:"nothing", wave2:"OpeningSet plankDebrisButt, trenchFacadeN (Set)"},
    // SB04A (Boots)
    {shot:"SB04A", what:"ijaA bent over, backing, dragging him by the right forearm, rifle low in the other hand",
      now:"IjaHoldCollarUp held in its loop and carried backward on DragAway's lead (PhaseBoots)", wave2:"IjaDragByForearm (Anim) in PhaseBoots, with its forearmR player track"},
    {shot:"SB04A", what:"the interpreter hurrying up the SSW leg with one arm out",
      now:"InterpreterPoint as upperBody on the run (PhaseBoots Hurry)", wave2:"InterpreterHurryReach (Anim)"},
    {shot:"SB04A", what:"Shunzi's hand holds ijaA's sleeve",
      now:"rest hand keys (beats.Boots)", wave2:"EXTRA_HAND_POSES.gripSleeve on ijaA in beats.Boots (Eye)"},
    {shot:"SB04A", what:"dizzy softening, desaturation, blood edge about 0.3",
      now:"concussion blur/ghost; the story blood layer settles to strikeBlood.settle 0.3", wave2:"OpeningLens LOOKS for Boots (Eye)"},
    {shot:"SB04A", what:"plank revetment and duckboards down the SSW leg",
      now:"bare earth", wave2:"OpeningSet revetmentSSW, duckboardsSSW (Set)"},
    {shot:"SB04A", what:"the SSW leg open from the dugout mouth's south pocket (the drag ends at shunzi.dragged (0.6,-123.9) and 02 looks down the leg from there)",
      now:"BunkerSouthRevetment (x -2.8..0.8, z -123.95..-123.55, 2.2 m) walls the pocket off from the leg: shunzi.dragged lies inside it and ijaA backs through it; Survey B's SB05 trial saw through it from inside", wave2:"Set: in the collapsed state shorten BunkerSouthRevetment's east end to x <= 0 (or open it) so the pocket and the leg join; then add it to the drag clearance check in Script_OpeningStoryboardsTest"},
  ].map(Object.freeze)),
  // ---- 02 pursuit (bunkerPursuit, contract §5.8) -----------------------------------------
  // The roster's delayS (Space) are scaled so the three followers are in the trench the player just left
  // while he looks back from the rear corner (review 09-24: at delayS as authored one man showed, 12 m off).
  pursuit:Object.freeze({ delayScale:.35, speedMps:3.2, retireMps:3, retireMaxS:40 }),
  // ---- 02 withdrawal (RearTrench) --------------------------------------------------------
  withdraw:Object.freeze({
    // The player's way out: mouth -> bend -> crater step (exposed to F) -> SSW leg -> RC.
    lane:Route([.3,-125.1],[1.7,-125.3],[3.3,-124.2],[3.3,-122.2],[3.1,-121.3],[1.4,-120.8],[-.6,-120.4],[-1,-118.5],[-4,-113]),
    luoCover:P(-.6,-120.4),                // first intact wall past the low section, turned back to cover
    luoCorner:P(-7.2,-111.8),              // beyond RC, waiting for the player
    heBound:Route([-.2,-121.9],[-1.2,-118.2]),
    liuBound:Route([-1,-121],[-5.3,-112.4]),   // the second bound is round the corner, off the look-back line up the leg
    pursuitBaseFaceTo:P(-.2,-122.2),
  }),
});
