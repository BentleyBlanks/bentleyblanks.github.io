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
// SB04 (contract §5): ijaA's butt strike, IjaButtStrikeCollar: squatting over him with the left fist in his collar, the
// rifle swung up one-handed butt first; the clip's own apex loop (0.55-1.05 s) is the pause at the top (>= 0.4 s) and the
// director lets go of it at letGoS (pose.holdUntil). The blow lands at the clip's strike contact (strikeS: the manifest's
// IjaButtStrikeCollar contacts[strike].t, Script_OpeningStoryboardsTest checks they agree) + holdS (the loop held longer
// than one pass). The Butt hand keys and the director's strike both read these. bootsAfterS: Boots starts that long after
// the blow, inside the knock-out (ija.knockOut), so the rifle's swing back is not shown.
const BUTT = Object.freeze({ yawDeg:0, letGoS:1.05, holdS:0, strikeS:1.375, bootsAfterS:.3 });
// Wave 1 (contract §3): BunkerSouthRevetment (Data_FirstLevelMissionLayout shell, x -2.8..0.8, z -123.95..-123.55,
// 2.2 m) stands where 02's circle closes (shunzi.dragged) and across SB04A's drag. Until it is opened in the collapsed
// state (pendingWiring SB04A/SB05, owner to be named by the integrator) the three places that must look past it name it
// through this one constant: storyboardShots SB04A behindOk, Data_FirstLevelSpaceKeyframes K2 ignore and
// Script_OpeningStoryboardsTest's sight/drag checks. Wave 2 sets wave1Allowances.revetment to null.
const REVETMENT = "BunkerSouthRevetment";
export const OPENING_STORYBOARDS = Object.freeze({
  version:"20260926OpeningStoryboardsV8Stunned", animationBase:"./Animation/OpeningStoryboards/",
  // Contract §3/§7.2: wave 1 = each package alone (stand-ins listed in pendingWiring); wave 2 = wired. Set to 2 by the
  // wave-2 wiring: Script_OpeningStoryboardsTest then requires pendingWiring empty and no wave-1 allowance left
  // (wave1Allowances null, no behindOk / coverOk / headOptional in storyboardShots).
  wave:1,
  wave1Allowances:Object.freeze({ revetment:REVETMENT }),
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
      "HeSwapDadaoRifle","LuoKneelCheck",
      // 2026-09-25 storyboard round (Data_FirstLevelStoryboard0103Contract.md §4.1).
      "IjaButtStrikeCollar","IjaDragByForearm","IjaLookBackLow","IjaStartleTurn","IjaGuardPort",
      "LuoKneelReach","RunnerLeanPostCall","InterpreterHurryReach",
      // §4.1 optional, made (Anim report 2026-09-25: the kneeling ClipLoad does not read as sitting from SB01;
      // IjaChoppedFallWall reads as crumpling into the wall from Shunzi's eye, not as going over backwards in SB05A)
      "YaowaSitLoad","IjaChoppedFallBack"],
    // Not in §5.4: IjaShoveToWall for the draft's "日兵甲把他推到沟壁上" pair (reported to the integrator);
    // BlastDazedStir, the comrade stunned in the heap from the black to the drag (docs/Data_OpeningComradeStunned20260927.md).
    added:["IjaShoveToWall","BlastDazedStir"],
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
  blackoutRecovery:Object.freeze({ fadeS:5.2, eyelidS:4.2, closeS:.16 }),
  interpreterClearanceM:.72,
  walkMps:2.3, turnRps:4.5, poseBlendS:.28, cameraBlendS:.65, cameraTurnRps:3.5,
  // The eye travels at most this fast (m/s): ijaA's yank at the collar peaks at 8.7 m/s on the 12 fps
  // player track (09-24 probe, 0.145 m in one frame); capped, the drag reads as a pull, not a cut.
  cameraMoveMps:7.5,
  // Kept for the dadao ambush adapter in Script_OpeningStoryboardAnimation (legacy DadaoHeavy).
  ambushS:1.1,
  // Move speeds of the director's walks along trench polylines (m/s).
  // dragOut: ijaA hauling Shunzi out of the mouth by the collar (01); drag: Luo's haul to cover (02; 1.25 until 09-26).
  speed:Object.freeze({ walk:1.5, brisk:2.3, creep:1.15, run:3.2, drag:1.55, dragOut:1.7, flee:3.4, stroll:1.1 }),
  arriveM:.12,
  culledHeadM:1.4,     // head height used for an actor the AI has culled (its bones are not updated)
  shotRiseM:1.4,       // a squad rifleman's scripted shot leaves at least this high over his feet (he rises to fire)
  // Hard timeouts (s since the phase began, or since the named wait began). A timeout never
  // skips a physical beat that the flow needs: it forces the beat (a late walker runs, a
  // missed shot is fired again by another man, a contact that did not kill is made lethal).
  timeouts:Object.freeze({
    banterExtraS:8, runnerArriveS:9, ordersExitS:9, blastEventS:3.5, blackS:3.0, wakeS:5.8,
    frontPassS:14, walkInS:12, interrogationExtraS:10, tauntExtraS:8, reachS:3.4, foundWalkS:10,
    dragOutS:9, bootsS:8, holdLineS:8, glimpseGateS:2.2, luoArriveS:7, heArriveS:7, fleeS:3.2,
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
    look:Object.freeze({ digPitch:-.45, clawPitch:-.8, reachPitch:-.28, pushUpM:.13, dragRollRad:.025,
      // Parry: the eye steps this far aside from ijaA's back so He (behind ijaA) is seen, and holds the
      // duel this long after the cut before following the interpreter.
      duelAsideM:.25, duelHoldS:.45 }),
    // 「弹装起！往后沟撤！跟紧！」 (09-26 review: he sat on, then stood still with the rifle flat across the frame).
    // From Luo's order (clock: flags.exitAt) through Incoming he finishes loading on his feet while following the
    // others slowly to the mouth: stands (standS), thumbs the charger's rounds down into the magazine, closes the
    // bolt (which throws the empty charger out), turns the rifle over once to look it over, then carries it and
    // looks up at the men going out. Walk: shunzi.seat -> shunzi.followTo at walkMps from walkAtS (eased in over
    // walkRampS, out over the last stopEaseM). pitch: extra look pitch (rad) while his eyes are on the rifle.
    // rifle: [t, left palm (camera-local m), muzzle, top of the rifle (camera-local directions)]; the left hand holds
    // it at grip (rifle-local, HanYang canonical: muzzle -z, top +y, bolt side +x). right: [t, point on the rifle,
    // fingers, back of the hand (rifle-local), curl]. charger: the clip stands in the guide at chargerAt and goes
    // down pressM over press (s) while the thumb works it (thumbM at thumbHz); the bolt strips it at chargerOffS.
    followUp:Object.freeze({
      standS:1.2, walkAtS:1.1, walkMps:.24, walkRampS:.8, stopEaseM:.25, bobM:.016, stepHz:1.6, swayRad:.01,
      pitch:Object.freeze([[0,0],[.6,-.42],[3.9,-.42],[4.8,-.04]]),
      grip:Object.freeze([0,-.03,-.2]),
      rifle:Object.freeze([
        [0,[-.13,-.18,-.35],[-1,0,0],[0,1,0]],
        [.7,[-.15,-.07,-.36],[-.85,.35,-.25],[.05,.75,.65]],
        [1.8,[-.15,-.07,-.36],[-.85,.35,-.25],[.05,.75,.65]],
        [2.3,[-.15,-.09,-.35],[-.9,.25,-.2],[0,.7,.7]],
        [2.9,[-.12,-.06,-.36],[-.75,.3,-.55],[.35,.55,.75]],
        [3.6,[-.15,-.08,-.33],[-.9,.35,.1],[-.25,.7,.65]],
        [4.4,[-.15,-.16,-.33],[-.8,.45,-.2],[0,.5,.85]],
      ].map(Object.freeze)),
      left:Object.freeze({ f:[.2,.68,.55], n:[-1,-.3,0], curl:[45,67,37] }),
      right:Object.freeze([
        [0,[.1,-.05,.12],[.2,.68,-.3],[-1,-.3,0],[39,51,31]],
        [.55,[.03,.075,.06],[-.3,0,-.95],[.5,.85,0],[45,60,45]],
        [1.75,[.03,.075,.06],[-.3,0,-.95],[.5,.85,0],[45,60,45]],
        [1.95,[.06,.05,.03],[.3,-.2,-.9],[-.3,.9,-.1],[50,64,42]],
        [2.1,[.06,.05,-.04],[.3,-.2,-.9],[-.3,.9,-.1],[50,64,42]],
        [2.25,[.07,.02,-.04],[.3,-.2,-.9],[-.3,.9,-.1],[50,64,42]],
        [2.6,[.02,-.02,.1],[0,-.3,-.95],[.9,.4,0],[55,70,45]],
      ].map(Object.freeze)),
      charger:Object.freeze({ at:Object.freeze([0,.085,-.027]), pressM:.036, press:Object.freeze([.6,1.75]), thumbM:.01, thumbHz:2.2, offS:2.05 }),
    }),
    hands:Object.freeze({
      poses:Object.freeze({
        rest:H("cam",[.18,-.46,-.15],[0,-.4,-1],[.25,.65,.1],[14,24,14]),
        flat:H("ground",[.17,.025,-.25],[.1,-.25,-1],[0,1,0],[12,20,12]),          // palm on the mud
        // SB03 (contract §5 「右手摊在泥里在右下」): flat pushed forward and in, lifted off the mud so the lying eye
        // (0.26 m, pitch +5) sees it in the lower right; on the mud itself a palm in reach is under the frame.
        flatFwd:H("ground",[.13,.14,-.38],[.05,-.3,-1],[0,1,0],[12,20,12]),
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
      // Seated inspection: the charger rests in the left palm, the rifle on the thighs.
      // Orders' exit signal (Luo's order) hands over to followUp's stand / load / bolt / look-over in OpeningFirstPerson.
      beats:Object.freeze({
        Banter:Object.freeze({keys:Object.freeze([[0,"palmClip","rest"],[1.1,"palmClipTilt","rest"],[2.5,"palmClip","rest"]]),legs:"sitForward",props:Object.freeze(["palmClipProp","loadingRifleOnLegs"])}),
        // Still at it while the runner reports: the charger turned in the palm and back (not a frozen hand).
        Orders:Object.freeze({keys:Object.freeze([[0,"palmClip","rest"],[1.3,"palmClipTilt","rest"],[2.8,"palmClip","rest"],[4.2,"palmClipTilt","rest"],[5.8,"palmClip","rest"]]),
          legs:"sitForward",props:Object.freeze(["palmClipProp","loadingRifleOnLegs"])}),
        Blast:K([0,"protect","protect"],[.4,"protect","protect"],[.8,"limp","limp"]),
        Black:K([0,"limp","limp"]),
        // 「他试着撑起身体。背包带一下绷紧……又落回地面。手指在泥里抓出一道痕。」
        Wake:K([0,"limp","limp"],[1.05,"flat","flat"],[1.2,"push","push"],[1.8,"push","push"],[2,"flat","flat"],[2.2,"flat","clawIn"],[3,"flat","clawOut"]),
        FrontPass:K([0,"flat","clawOut"],[.6,"flat","flat"]),
        // SB03: the right hand slides forward into the lower right of the picture while he is dragged (flatFwd).
        CaptiveDragged:K([0,"flat","flat"],[1.2,"flat","flatFwd"]), CaptiveWall:K([0,"flat","flatFwd"]), Interrogation:K([0,"flat","flatFwd"]),
        Slash:K([0,"flat","flatFwd"]), Taunt:K([0,"flat","flatFwd"]), Wipe:K([0,"flat","flatFwd"]),
        // SB03A: the LEFT hand reaches for the rifle (the storyboard's arm comes in from the lower left).
        Reach:K([0,"flat","flatFwd"],[.6,"flat","flat"],[1.9,"reach","flat"],[2.05,"reach","push"],[2.35,"reach","flat"],[3.2,"reachCurl","flat"]),
        Found:K([0,"reachCurl","flat"],[1.2,"flat","flat"]),
        // 「一只手本能地抓住勒紧的衣领，另一只手撑着泥地」 (on ijaA's hand while he pulls in place; at his own
        // collar once he walks off with it, where ijaA's grip is solved onto the same point); chest and knees on the mud.
        // (Drag: flat while he slings the rifle, the fist goes to his hand as it takes the collar.)
        Drag:K([0,"flat","flat"],[.45,"flat","push"],[.8,"grasp","push"]), Snag:K([0,"grasp","push"]), KickBeam:K([0,"grasp","push"]), DragOut:K([0,"collar","scrape"]),
        // 「刚想撑起身体，枪托突然砸过来」: the blow lands BUTT.strikeS + BUTT.holdS after buttAt (after the pause at the
        // top); the hands let go of the push 0.18 s later.
        Butt:KC("buttAt",[-1,"flat","flat"],[0,"push","push"],[BUTT.strikeS+BUTT.holdS,"push","push"],[BUTT.strikeS+BUTT.holdS+.18,"rest","rest"]),
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
    // 02 (contract §5 SB05): Hold/Ask/KickShunzi <= 0.45, the glimpse keeps a light ghost (~0.55, 「翻译的脸还是重影」),
    // SB05A/SB06 clean. fallRps brings the butt strike's 0.88 down to the circle's 0.45 in under 2 s.
    base:Object.freeze({ Banter:0, Orders:0, Incoming:0, Blast:.95, Black:.95, Wake:.9, FrontPass:.74, CaptiveDragged:.68,
      CaptiveWall:.64, Interrogation:.6, Slash:.6, Taunt:.58, Wipe:.56, Reach:.6, Found:.62, Drag:.66, Snag:.7, KickBeam:.7,
      DragOut:.72, Butt:.8, Boots:.88, Hold:.45, Ask:.42, KickShunzi:.42, Glimpse:.55, Collar:.48, Chop:.4, Parry:.4, Flee:.4,
      DragCover:.42, LongShot:.4, Check:.36, KickRifle:.34, Released:.32 }),
    riseRps:.8, fallRps:.25,
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
    // (SB01), stands and follows the others slowly toward the mouth, working the rifle (after the order, through
    // Incoming), is knocked down by the near miss (SB02) and wakes pinned in the mouth itself, the fallen timber on
    // his pack (SB03–SB04). The Space's MISSION_PLACEMENT.bunker.player (-1.3,-126.2) stays the dugout's anchor
    // (A.bunker); the director's Shunzi marks are these.
    seat:P(-1.95,-126.25,-93*Math.PI/180),   // SB01 eye: back of the dugout, the mouth x 0.30–0.74 of the frame
    followTo:P(-.45,-126.02),                // after the order: he follows the others slowly this far (firstPerson.followUp)
    blastFall:P(-.9,-126.0),                 // SB02: where the eye has dropped to at the end of the fall (thrown back)
    trap:P(.1,-125.45,-Math.PI/2),           // Wake → KickBeam: lying in the mouth, looking east down the trench
    // The lying eye (contract §2.1: Wake→Found eye (0.25–0.35,−125.2), 0.18–0.26 m over the mud), a little ahead of
    // the pinned body with the chin in the mud: SB03 holds witnessEye, the reach (SB03A) sinks to reachEye.
    // Lean into the trench opening while reaching so the fallen man's face clears the timber post.
    witnessEye:P(.35,-125.15), reachEye:P(.25,-125.05),
    seatEyeM:.95, standEyeM:1.32, lieEyeM:.26, reachEyeM:.18,
    // SB04 (contract §2.5): ijaA drags him out of the mouth to the trench edge east of the mouth rubble (where the
    // fallen lintel lies) and brings the butt down on him there. SB04A (§2.7): he drags him on by the forearm, south
    // of the rubble, into the north mouth of the SSW leg, where 02's circle closes round him (§2.6).
    butt:P(2.3,-124.4),
    dragged:P(.6,-123.9),
    // SB06 (contract §2.9): the hand-back seat on the trench floor east of the mouth rubble, his back to it, facing east
    // down the front trench (J in view: its man is down by then; F in view too -- see rescue.handbackHoldFireS).
    cover:P(2.4,-125.2,-94*Math.PI/180),
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
    // SB02 mirrored (contract §2.2): the shell lands at fallStartS (FireShell flight); the eye drops to eyeM and turns
    // to yaw/pitch with the head rolled to the left by fallEndS; the eyes close at eyesCloseS; Black at phaseS.
    // pitchDeg -6 (contract -14, ±8): at -14 the lintel was above the frame and the north post's top half hung over the
    // bank of the trench outside (09-25 review); at -6 post and lintel frame the mouth on the right (tmp/fix trials).
    blastShot:Object.freeze({ fallStartS:.22, fallEndS:.65, eyeM:.75, yawDeg:-66, pitchDeg:-6, rollDeg:17, eyesCloseS:.84, phaseS:1.0 }),
    // The runner comes down the SSW leg, round the bend and in along the north wall to the inside of the north post.
    runnerRoute:Route([-1,-118.5],[1.2,-120.6],[3.0,-121.6],[3.3,-123.6],[2.2,-126.0],[.72,-127.0]),
    // Everyone who leaves after the order goes out of the mouth, down the SSW leg to RC and on west.
    exitRoute:Route([2.1,-125.2],[3.4,-123.6],[3.1,-121.6],[1.2,-120.6],[-1,-118.5],[-4,-113],[-9,-111.3]),
    hide:Object.freeze({ luo:P(-12.5,-112.2), yaowa:P(-16,-112), he:P(-10.4,-111.6), liu:P(-14.6,-112.3), runner:P(-19,-111) }),
    comradeBlast:P(3.6,-125.85,-Math.PI/2),   // R0: just outside the mouth; the heap lies on the real bank below the planks (clip BANK_RAMP)
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
    // 2026-09-26 integration (Set x Dir, Script_OpeningSetTest §2): he walks back along the south side of the trench
    // floor and turns in at the mouth south of the broken board (Data_OpeningSet0103 brokenBoardNW hangs to 0.55 m at
    // z -125.62) and west of the hand-back backrest's spot (rubbleMoundBack, shown from 02): the old line at z -125.3
    // ran across both.
    foundRoute:Route([2.9,-124.75],[1.75,-124.8],[1.42,-125.28]),
    // Pace of the find -> drag-out chain (2026-09-26 review: 「太拖节奏」, ~21 s from the find to the circle): he comes back
    // at foundSpeed, clears the wood and slings the rifle at these clip rates, says his line (ShunziFound) from the start of
    // the clearing and starts to sling foundLeadS before its end.
    pace:Object.freeze({ foundSpeed:2.3, clearWoodRate:1.3, slingRate:1.35, foundLeadS:1.6 }),
    // Drag / Snag / KickBeam: the eye is at his collar and ijaA squats over his head, so looking at the face means looking
    // straight up (67-77 deg, the face upside down, 09-26 review). The look goes toward him at pitchDeg, capped at
    // maxPitchDeg: the fist at the collar, his knees and chest, the face at the top edge.
    snagShot:Object.freeze({ pitchDeg:24, maxPitchDeg:30 }),
    // ijaA drags Shunzi out of the mouth -- south of the broken board, clear of the fallen lintel (lateral >= 0.5 m) --
    // then east-south-east past the mouth rubble to the trench edge. The last leg is aimed through shunzi.butt, so
    // Shunzi, 0.62 m behind him, ends on it (2026-09-26: the old middle point (2.15,-125.0) stood on the backrest's spot).
    dragOutRoute:Route([1.4,-125.3],[1.55,-124.8],[2.85,-124.11]),
    // SB04 (contract §5): ijaA stands over his head on the side yawDeg (yaw convention: 0 = north of him), coming
    // round the east side (approach). The camera (buttShot) looks up past him at the north wall's timber door with
    // the dead comrade right of it. Wave 1 plays the existing IjaButtStrike (it stands straight) with its clip time
    // held at raiseTopS for holdS (the pause at the top, >= 0.4 s) before the blow (pendingWiring SB04).
    butt:Object.freeze({ ...BUTT, approach:Route([3.0,-124.55]) }),
    // The blow knocks him senseless: the eyes shut closeS after it and open again openAtS after it, over openS -- ijaA
    // takes his forearm and turns round to haul him meanwhile (PhaseBoots swing), and the picture comes back already dragged.
    knockOut:Object.freeze({ closeS:.07, openAtS:.72, openS:.3 }),
    // pitchDeg 22 (contract ~30, ±8): at 30 the north rim sat mid-frame, half the picture sky (SB04 wants <= 40 %).
    buttShot:Object.freeze({ eyeM:.35, yawDeg:-18, pitchDeg:22, rollDeg:-4 }),
    // SB04A (contract §2.7, §5; Boots from 0.6 s after the blow): ijaA drags him by the forearm from shunzi.butt along
    // route -- back past the mouth north of its rubble (BunkerMouthRubbleS, the spoil south of it walls off the way
    // between) and south into the SSW leg's north mouth (shunzi.dragged) -- at speedMps after catchS, backing leadM
    // ahead of him along the same line and facing him (he ends south of him, where 02's circle has him). Turning
    // into the leg the camera looks up at his face yawOffsetDeg aside: the mouth's south post and rubble on the left,
    // the SSW leg with the interpreter and ijaB running up it on the right (the storyboard's sides). The boots close
    // in over the last closeS (Boots' old low shot).
    // 2026-09-26: IjaDragByForearm (its own ten steps, 2.0 m of root motion). The old way back past the mouth ran the eye
    // and ijaA through the roof timber's south support (x 0.6-1.05, z -124.82..-124.42) and under the timber; this one goes
    // west along the strip between the mouth rubble and the spoil. `route` is Shunzi's eye (from shunzi.butt to
    // shunzi.dragged), walked at the clip's own haul (its player head track); `face` is where ijaA's back points at the
    // same fraction (he stands the clip's hold distance from the eye toward it, facing him) and ends in the SSW leg.
    // swingS: before the haul the root turns about the eye from the SB04 side (north) to the drag side, eyes shut
    // (knockOut). closeS: the boots close in over that long after the haul.
    dragAway:Object.freeze({ route:Route([1.95,-123.85],[1.0,-123.8]), face:Route([1.66,-123.8],[1.3,-123.66],[.95,-123.6],[.66,-123.3],[.55,-122.97]),
      holdM:.93,
      swingS:.42, closeS:.5 }),
    // headAboveDeg: his head that far above the centre of the picture (the storyboard's face in the upper third).
    dragShot:Object.freeze({ yawOffsetDeg:-8, pitchDeg:8, maxPitchDeg:26, headAboveDeg:14, rollDeg:-8 }),
    interpreterEnter:Route([23.5,-130],[20.1,-128],[18.7,-126.8],[17.45,-126.2],[16,-125.65],[14.2,-125.75],[13.2,-125.65],[12,-124.75],[8,-124.05],[6,-123.85],[4.9,-124.05]),
    // Flee "往前沟逃去" (contract §2.8): he turns from the circle to fleeYawDeg (InterpreterFlee carries him 1.3 m back
    // from his facing, ENE along the strip between the mouth rubble and the spoil), then east down the front trench,
    // out of the left of SB05A's picture, into the depth sap; removed out of sight.
    interpreterFleeYawDeg:100,
    interpreterFlee:Route([2.6,-123.7],[6.2,-124.4],[10,-124.1],[14,-124.6],[15.2,-118.5],[17.5,-111]),
  }),
  // ---- 01 comrade chain ----------------------------------------------------------------
  // Offsets are the manifest stages (anchor frame +x right, -z forward). The interrogation
  // extras stand where the chain leaves room (the comrade kneels back to the north wall).
  interrogation:Object.freeze({ ijaAHold:Object.freeze([-.04,-.28,180]),
    // SB03 (contract §5): the interpreter crouches side-on to the comrade east of the group (he no longer kneels
    // between the camera and the comrade), ijaB stands behind him; world marks (yaw radians).
    interpreterAt:P(4.9,-124.05,25*Math.PI/180), ijaBAt:P(6.05,-125.0,55*Math.PI/180),
    // SB03 camera from shunzi.witnessEye (lieEyeM): the group left of centre, the trench's depth right.
    witnessShot:Object.freeze({ yawDeg:-80, pitchDeg:5, rollDeg:4 }),
    // 2026-09-26: cut away when the interpreter enters; return to Shunzi for Reach.
    cinematic:Object.freeze({
      CaptiveDragged:{id:"captiveDrag",eye:P(1.7,-124.05),height:1.2,target:P(4.1,-125.55),targetH:.8,fov:44},
      CaptiveWall:{id:"captiveGroup",eye:P(2.1,-123.7),height:1.45,target:P(4.7,-125.2),targetH:1.0,fov:54},
      Interrogation:{id:"captiveGroup",eye:P(2.1,-123.7),height:1.45,target:P(4.7,-125.2),targetH:1.0,fov:54},
      Slash:{id:"captiveCut",eye:P(5.6,-124.6),height:1.3,target:P(4.1,-125.65),targetH:1.05,fov:46},
      Taunt:{id:"captiveCut",eye:P(5.6,-124.6),height:1.3,target:P(4.1,-125.65),targetH:1.05,fov:46},
      Wipe:{id:"captiveAftermath",eye:P(3,-124.8),height:1.65,target:P(9.4,-122.4),targetH:2.0,fov:58},
    }),
    // Contract §2.7: backOffAfterS into Wipe the interpreter, then ijaB (backOffStaggerS later), go back down the SSW
    // leg -- over the crater step like the withdrawal lane (the gap between the mouth rubble and the spoil is too
    // narrow to walk) -- leaving SB03's picture on the right (out of SB03A's); from the blow they come running back up
    // it (hurryMps, from Boots hurryAfterS) -- SB04A's men in the depth.
    backOffAfterS:2.5, backOffStaggerS:.8,
    backOffRoute:Route([3.3,-124.2],[3.3,-122.2],[3.1,-121.3],[1.4,-120.8],[-.6,-120.4]),
    backOff:Object.freeze({ interpreter:P(-1.6,-118.4), ijaB:P(-2.2,-117.3) }),
    hurryMps:2.0, hurryAfterS:.8 }),
  // ---- 02 rescue circle (contract §2.6, §5 SB05–SB06) -------------------------------------
  // The circle closes in the SSW leg's north mouth (shunzi.dragged) and Shunzi looks south down the straight 11 m leg:
  // ijaA crouched just ahead holding his collar (left of centre), the interpreter at the left edge by the spoil's corner,
  // ijaB in the leg, and Luo and He creeping up it along the west wall (right of the frame) from the rear corner RC.
  // Floor strip at the mouth: x 0.4–0.8 between the west slope and BunkerMouthSpoil (x 0.8–2.2, z -123.3..-121.9).
  rescue:Object.freeze({
    // SB05 / SB05A camera from shunzi.dragged (eye over the ground; the collar pulls him up to eyeM; chopEyeM once
    // ijaA lets go). yaw 184: the leg's vanishing point on the right third; the kick adds its 0.12 rad roll.
    // yaw 184 (contract; it was 180 while ijaA stood 0.5 m ahead and filled the left): with ijaAStandoffM he is 0.8 m off
    // and ijaB's head clears his shoulder on the right.
    // SB05A: at the cut the eye sinks to chopEyeM and slips chopAsideM west, turned to chopYawDeg, past ijaA's body.
    // Flee: after the duel the eye rises over the mouth rubble in line with the strip (fleeEye) to follow the interpreter.
    circleShot:Object.freeze({ eyeM:.75, yawDeg:184, pitchDeg:3, chopEyeM:.62, chopDropS:.3, chopAsideM:.25, chopYawDeg:185,
      fleeEye:P(.65,-123.6), fleeEyeM:.85, fleeLookS:.5 }),
    // ijaA's IjaHoldCollarUp root is solved so the clip's player head track is at shunzi.dragged; the bearing (deg,
    // yaw convention from Shunzi) places him in the floor strip. The chopParry stage puts He 1.35 m behind his left:
    // at 5° that is the leg floor (0.5,-122.05); from 10° on it is inside BunkerMouthSpoil.
    ijaAHoldBearingDeg:5,
    // SB05 (review 09-25): IjaHoldCollarUp's head track keeps Shunzi's head 0.5 m from ijaA's face, so his cap filled 20–85 %
    // of the picture and covered ijaB (the storyboard has him ~0.7–0.9 m off). His root stands this much further out along
    // the bearing, the eye keeps to the head track minus it (still pulled with him): 0.8 m, the head at x ~0.42, ijaB
    // clear (tmp/fix trial T05_s30). He's chopParry mark moves with him (0.53,-121.75), still on the leg floor.
    ijaAStandoffM:.3,
    interpreter:P(.97,-123.42,36*Math.PI/180),   // squatting side-on at the spoil's north-west corner (left edge)
    interpreterReturn:Route([-.1,-122.4],[.05,-123.54],[1.3,-123.54]), // around the collar-holder, then into the corner
    interpreterClearanceM:.44, // close crouching contact; entry uses the wider standing-body margin
    ijaBGuard:P(.04,-119.94,-8*Math.PI/180),      // standing in the leg 4 m off, rifle levelled at him (SB05)
    // The kick (「日兵乙不耐烦地朝顺子踢了一脚」): up the leg's west side to kickM from him on kickBearingDeg (clear of
    // ijaA), then back to ijaBWatch -- the chopRear stage's anchor, Luo then lands at (0.04,-120.42) on the floor.
    kickM:.62, kickBearingDeg:-35,
    // x 0.2 (contract 0.31): SB05's ijaB clears ijaA's cap and shoulder on the right (09-25 shots: at 0.31 his head sat
    // behind ijaA's shoulder). Luo's chopRear mark moves with it.
    ijaBWatch:P(.2,-121.12,-.96),
    // Where ijaB's rifle ends after the cut (IjaChoppedFallWall weaponLost): 1.4 m ahead, right of centre, stock toward
    // the eye (prop yaw: the muzzle along (-sin yaw, -cos yaw)).
    // x 0.2 (contract 0.55): the chop eye has slipped chopAsideM west and turned to chopYawDeg, so a rifle at x 0.55 lay
    // left of centre; at x 0.2 it is right of centre, ~1.3 m off (contract SB05A 「画面中偏右下 ~1.4 m」).
    ijaBRifleDrop:P(.2,-122.55,Math.PI-.4), ijaBRifleDropS:.35,
    // They wait out of the leg's picture (x <= -8 at z -112, behind the RC frame and the rear trench's wall) and set off when
    // the questioning starts (askAt; holdLineS at the latest): Luo creeps round RC and down the west wall, He heLagS
    // behind; Luo is at the SB05 mark (-3.1,-116.9) about when Shunzi looks up (Glimpse).
    luoStart:P(-8.2,-112.0), heStart:P(-9.3,-111.7), liuStart:P(-10.4,-111.5),
    goAfterAskS:1.5, heLagS:1.4, liuLagS:3.2,
    luoRoute:Route([-4.2,-113.1],[-3.1,-116.9],[-1.6,-119.0]),
    // He follows along the west wall to heWait (at Luo's right-rear when the first cut lands, SB05A), and only then runs
    // round to his chopParry mark behind ijaA.
    heRoute:Route([-4.2,-113.1],[-4.3,-114.6],[-2.6,-117.9]),
    heWait:P(-.7,-119.9),
    heTrailM:1.5,                        // He closes up (brisk) when he is this much further from his mark than Luo from his
    liuRoute:Route([-4.2,-113.1],[-1.6,-117.2]),
    liuShot:P(-1,-121,2.0),               // bunker.liuwencaiShot: 15.4 m down the trench to J
    // SB06: after the long shot Liu goes over the crater step to the trench edge east of the seat and aims east (right
    // centre); He, after the parry and the swap, kneels with the rifle at the right edge (heCover).
    liuCoverRoute:Route([1.4,-120.8],[3.1,-121.3],[3.3,-122.2],[4.3,-123.25]),
    liuCover:P(5.47,-123.52,-Math.PI/2),
    heCoverRoute:Route([.3,-121.2],[1.4,-120.8],[3.1,-121.3],[3.3,-122.2],[3.3,-123.5]),
    heCover:P(3.6,-124.3,-1.3),
    // DragCover: Luo walks this line (Shunzi trails him by 0.55 m). 2026-09-26 integration: after the near miss the
    // mouth is choked (Data_OpeningSet0103: the fallen lintel, the roof timber on its rubble supports, the broken board),
    // so the drag no longer goes back in through it. From the leg's north mouth Luo goes east along the 0.75 m strip
    // between the mouth rubble and the spoil (the Set's SB06_DRAG_COVER_SET line), turns north only once Shunzi is past
    // the spoil's east end (a trailing body swings inward on a turn), and comes up the trench floor east of the backrest
    // (rubbleMoundBack); the last short leg ends 0.55 m north of the seat, so Shunzi stops on shunzi.cover.
    dragCoverRoute:Route([1.2,-123.7],[2.8,-123.72],[2.85,-124.1],[2.58,-124.9],[2.43,-125.4],[2.4,-125.75]),
    // DragCover camera: the eye (eyeM) stays on the line to the junction (junctionH, LongShot's height), where Flee
    // leaves it and LongShot takes it up; Luo running up to the grab is followed at most asideDeg off that line (pitch
    // -10..luoMaxPitchDeg, the look at the dragger in 01), from grabLookS after the grab back onto it over releaseS.
    // 2026-09-27: it looked back down the way (away from Luo) -- with the look at Luo before the grab, the route's turn
    // north and LongShot's junction the eye turned a full circle in 4 s (582 deg swept, 347 net).
    dragShot:Object.freeze({ eyeM:.55, junctionH:1.2, asideDeg:35, luoMaxPitchDeg:24, grabLookS:.4, releaseS:.6 }),
    // SB06: Luo kneels at his left front, 0.9 m off, facing him (CheckRoot).
    luoCheck:P(3.12,-125.73),
    // SB06 camera from shunzi.cover: forward down the trench with Luo at the left; the kick brings the eye down to the
    // rifle to kickPitchDeg and the hand-back keeps that (Released: pitch in -15..+5, contract §2.9).
    checkShot:Object.freeze({ eyeM:.72, yawDeg:-94, pitchDeg:-8, kickPitchDeg:-13 }),
    // 01 prop: stock toward Shunzi, muzzle to the south-east in the mud of the mouth, out of reach (SB03: left of
    // centre, low). Prop yaw: the muzzle points along (-sin yaw, -cos yaw) (survey A, checked in picture).
    // x 1.43 (was 1.25): just outside the posts, clear of the roof timber's north rubble support and the broken board
    // hanging in the mouth (Data_OpeningSet0103), so Luo can reach it in 02 without standing in the collapse.
    rifleMouth:P(1.43,-125.75,-125*Math.PI/180),
    // 「罗班长看见旁边的汉阳造，一脚把枪踢过来。枪托滑过泥地，停在顺子手边。」 The rifle still lies in the mouth mud behind
    // his left shoulder. 2026-09-26 integration: Luo no longer steps back into the choked mouth (the old kickFrom
    // (0.88,-126.15) stood on the fallen lintel's end and the roof timber's support); he goes round behind the seat
    // to the trench floor north of the rifle (kickFrom, 0.5 m off, facing south) and kicks it south along the posts;
    // it glances off the low mouth rubble at `via` and slides east past Shunzi's right side (south of the backrest,
    // clear of his legs) to stop ahead of his right hand, stock toward him, muzzle north-east (SB06: centre-low,
    // ~0.85 m). The pickup follows the prop.
    kickFrom:P(1.45,-126.25),
    rifleKickVia:P(1.45,-124.85),
    rifleKicked:P(3.2,-124.85,-.6),
    // 「还权后 3 s 内玩家不掉血」 (contract §2.9). The seat looks east down the front trench and sees the fold F as well as J:
    // from (2.4,-125.2) J is at -93.0° and F at -88.5°, and no seat within the contract's ±0.6 m hides F and keeps J
    // (09-25 grid probe with Script_FirstLevelSpaceProbe.Sight, eye 0.72 and 1.0, 0.1 m grid over x 1.6-4.6, z -126.2..-123.6: 0 of 837 spots), so rubble cannot mask
    // F without masking J. The exposure is kept and covered here: at the hand-back every live Japanese within
    // handbackHoldFireM holds his fire this long (the AI's hesitation: no fire, no move); Script_FirstLevelCampaignOpening
    // asserts every one of them was covered for at least 3 s and that nobody hit the player in those 3 s; K2b records F
    // as seen.
    handbackHoldFireS:3.5, handbackHoldFireM:40,
    // Flee: how long the camera stays on the fleeing interpreter's back before DragCover (the clip is 1.6 s).
    fleeFollowS:2.3,
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
    // The post's base stands on the bank (0.23 m over the dugout floor): postNBase is 0.3 m over the ground at its south
    // face, lintelN the lintel's underside near its north end (1.75 m over the floor).
    Object.freeze({ id:"SB02", storyboard:"Storyboard_02_NearMissBlast.png", phase:"Blast", age:.7,
      judge:{ camera:{ eyeM:[.6,.95], pitchDeg:[-20,-2], rollDeg:[12,26], yawDeg:[-78,-54] }, eyeClosure:[0,.2],
        points:{ postNBase:{ at:[1.05,.3,-127.33], x:[.3,.6], y:[.25,.75] }, lintelN:{ at:[1.05,1.75,-126.9], x:[.4,.8], y:[0,.3] } } } }),
    // Current film coverage (2026-09-26); the prone-witness reference is historical.
    Object.freeze({id:"SB03_Drag",when:"s.phase==='CaptiveDragged'&&r.time-s.flags.dragStart>=2.25",
      judge:{cinematic:true,camera:{eyeM:[1.19,1.21],fovV:[43.9,44.1],absRollDeg:[0,.1]},actors:{comrade:{x:[.25,.65],y:[.1,.55]}}}}),
    Object.freeze({id:"SB03",phase:"Interrogation",age:3,
      judge:{cinematic:true,camera:{eyeM:[1.44,1.46],fovV:[53.9,54.1],absRollDeg:[0,.1]},
        actors:{ijaA:{x:[.15,.6]},comrade:{x:[.15,.6]},interpreter:{x:[.45,.98],distM:[2,4]},ijaB:{x:[.4,.9]}}}}),
    Object.freeze({id:"SB03_Slash",phase:"Slash",age:2.3,
      judge:{cinematic:true,camera:{eyeM:[1.29,1.31],fovV:[45.9,46.1],absRollDeg:[0,.1]},actors:{comrade:{x:[.5,.85]},ijaA:{x:[.4,.8]}}}}),
    Object.freeze({id:"SB03_FlagKick",when:"s.flags.flagKickAt!=null&&r.time-s.flags.flagKickAt>=.3",
      judge:{cinematic:true,flagProgress:[0,.1],actors:{DepthIjaA:{x:[.35,.75],y:[.2,.65],clip:["IjaKickPrisoner"]}},
        points:{flagTop:{at:[10.5,2.65,-121.8],x:[.3,.7],y:[.1,.5]}}}}),
    Object.freeze({id:"SB03_FlagDown",when:"s.flags.flagKickAt!=null&&r.time-s.flags.flagKickAt>=1.6",
      judge:{cinematic:true,flagProgress:[.99,1],actors:{DepthIjaA:{x:[.35,.8],y:[.2,.65]}}}}),
    // SB03A: the reach; ijaA turned round by the timber's noise right of centre, the dead comrade left of centre at
    // the wall, the interpreter and ijaB gone down the SSW leg, Japanese going away down the trench.
    Object.freeze({ id:"SB03A", storyboard:"Storyboard_03A_ReachRifle.png", phase:"Reach", age:3.1,
      judge:{ camera:{ eyeM:[.12,.26], pitchDeg:[-2,9], rollDeg:[0,7], yawDeg:[-90,-74] },
        actors:{ comrade:{ x:[.2,.52] }, ijaA:{ x:[.55,.88], distM:[3.8,5.6] } }, absent:["interpreter","ijaB"],
        inFrameAtLeast:[{ roles:["DepthIja"], count:1, minDistM:5 }], rifle:{ x:[.3,.65], y:[.55,1] } } }),
    // SB04: at the top of the swing (held), looking up past ijaA at the north wall's door with the comrade right of
    // it, the rim of the wall above the middle (sky <= 40 %). IjaButtStrikeCollar squats over him: his head is in frame.
    Object.freeze({ id:"SB04", storyboard:"Storyboard_04_Discovered.png",
      when:"s.phase==='Butt'&&s.flags.buttAt!=null&&r.time-s.flags.buttAt>=.55",
      judge:{ camera:{ eyeM:[.28,.42], pitchDeg:[21.5,36], rollDeg:[-8,-1], yawDeg:[-28,-8] }, absent:["interpreter"],
        actors:{ ijaA:{ x:[.22,.5], distM:[.3,1] }, comrade:{ x:[.6,.98] } },
        points:{ facadeDoor:{ at:[3.3,.9,-126.3], x:[.4,.75] }, northRim:{ at:[3.3,0,-127.3], y:[0,.42] } } } }),
    // SB04A: dragged by the forearm into the SSW leg: ijaA's face close, the mouth's south post and rubble left, the
    // SSW leg with the interpreter and ijaB running up it right (contract §2.7).
    Object.freeze({ id:"SB04A", storyboard:"Storyboard_04A_DraggedIntoTrench.png", phase:"Boots", age:2.1,
      // pitchDeg: IjaDragByForearm bends him over, his face is framed looking up 8-26° (dragShot).
      judge:{ camera:{ eyeM:[.2,.4], rollDeg:[-12,-4], pitchDeg:[5,26] },
        // behindOk: BunkerSouthRevetment still stands between the pocket and the leg (pendingWiring SB04A);
        // coverOk: the upright stand-in ijaA fills the low upward view over them (pendingWiring SB04A, Anim).
        actors:{ ijaA:{ x:[.3,.65], distM:[.4,1.1] },
          interpreter:{ x:[.5,1], distM:[1.8,6.5], behindOk:REVETMENT, coverOk:"ijaA" },
          ijaB:{ distM:[2,8], behindOk:REVETMENT, coverOk:"ijaA" } } } }),
    // (2026-09-26: no mouthPostS on the left any more -- the drag no longer comes down past the post, which ran it through
    // the roof timber's support; it comes west along the strip south of the rubble, the post behind the eye by 2.1 s.)
    // SB05: Shunzi looks up (Glimpse): ijaA's face close on the left, the interpreter at the left edge, ijaB in the leg,
    // Luo creeping up the west wall about 8 m off on the right, the leg running straight away; light concussion.
    Object.freeze({ id:"SB05", storyboard:"Storyboard_05_Interrogation.png", phase:"Glimpse", age:1,
      // ijaB at 2.4–3.4 m, not the contract's ~4 m: after the kick he steps back only to ijaBWatch (2.8 m), the chopRear
      // anchor -- at his guard mark (4 m) Luo's chop mark (0.5 m north of him) would be between him and Shunzi.
      judge:{ camera:{ eyeM:[.62,.9], pitchDeg:[-5,10], yawDeg:[170,192] }, perception:[0,.62],
        actors:{ ijaA:{ x:[.3,.47], distM:[.6,1.05] }, interpreter:{ x:[0,.25] }, ijaB:{ x:[.48,.7], distM:[2.4,3.4] },
          luo:{ x:[.68,.88], distM:[6,9.6] } } } }),
    // SB05A: the cut (Chop 0.25–0.45 s): ijaA side-on at the left front, Luo cutting ijaB down right of centre 2.5–3.5 m,
    // He behind Luo.
    Object.freeze({ id:"SB05A", storyboard:"Storyboard_05A_Counterattack.png", phase:"Chop", age:.35,
      judge:{ camera:{ eyeM:[.5,.8], pitchDeg:[-5,10], yawDeg:[170,192] },
        actors:{ ijaA:{ x:[0,.48], distM:[.3,1.2] }, luo:{ x:[.52,.9], distM:[2.4,4] }, ijaB:{ x:[.5,.9], distM:[2,3.8] },
          heyoutian:{ x:[.52,1], distM:[2.4,6] } } } }),
    // SB05A: ijaB's rifle has left his hands (DropGuardRifle, ijaBRifleDropS after the cut): in the mud right of centre, low.
    Object.freeze({ id:"SB05A_Rifle", storyboard:"Storyboard_05A_Counterattack.png", when:"s.flags.guardRifleDropped!=null&&r.time-s.flags.guardRifleDropped>=.1",
      judge:{ guardRifle:{ x:[.5,.8], y:[.6,1], distM:[1,1.6] } } }),
    // SB05A (contract §2.8): after the duel the camera follows the interpreter's back east down the front trench.
    Object.freeze({ id:"SB05A_Flee", storyboard:"Storyboard_05A_Counterattack.png", phase:"Flee", age:2,
      judge:{ actors:{ interpreter:{ x:[.2,.8], distM:[2,14] } } } }),
    // SB06: Check (「还能打不？」): forward down the front trench from the seat east of the mouth rubble, Luo kneeling at the
    // left, Liu right of centre, He at the right edge.
    Object.freeze({ id:"SB06", storyboard:"Storyboard_06_RifleReturned.png",
      when:"s.phase==='Check'&&s.flags.kneelAt!=null&&r.time-s.flags.kneelAt>=1.5",
      judge:{ camera:{ eyeM:[.6,.85], pitchDeg:[-14,-2], yawDeg:[-104,-84] },
        // Wave 1: LuoKneelCheck kneels upright and He stands (pendingWiring SB06: LuoKneelReach leans in low, He kneels):
        // their heads may be above the frame.
        // ijaD: 「J 处被击倒的日兵在正中远」 -- down on the trench floor, not standing (his pelvis near the ground).
        actors:{ luo:{ x:[0,.3], distM:[.6,1.3], headOptional:true }, liuwencai:{ x:[.55,.85], distM:[2.6,4.6] },
          heyoutian:{ x:[.7,1], distM:[.8,2.2], headOptional:true }, ijaD:{ x:[.35,.65], distM:[9,15], pelvisM:[null,.3], corpse:true } } } }),
    // SB06 after the kick: the rifle has stopped at his hand, centre-low, ~0.85 m off.
    Object.freeze({ id:"SB06_Kick", storyboard:"Storyboard_06_RifleReturned.png",
      when:"s.phase==='KickRifle'&&s.flags.kickRifleAt!=null&&r.time-s.flags.kickRifleAt>=1",
      judge:{ camera:{ eyeM:[.6,.85], pitchDeg:[-16,-6], yawDeg:[-104,-84] }, rifle:{ x:[.35,.8], y:[.6,.97] } } }),
    // SB06 at the hand-back (the player's crouched view from here on): about level, not at the ground (contract §2.9).
    Object.freeze({ id:"SB06_Released", storyboard:"Storyboard_06_RifleReturned.png", when:"s.phase==='Released'",
      judge:{ camera:{ pitchDeg:[-15,5], yawDeg:[-104,-84] } } }),
  ]),
  // Wave 1 stand-ins (contract §3): where a clip, hand pose, lens effect, set piece or blast effect of another
  // package belongs, the director uses the nearest existing one and lists it here. Wave 2 wires each entry to
  // the named replacement and removes it; the list must then be empty (Script_OpeningStoryboardsTest).
  pendingWiring:Object.freeze([
    // SB01 (Banter / Orders)
    // 2026-09-26 user: the runner reports to Luo, not to Shunzi -- he faces Luo (PhaseOrders). RunnerLeanPostCall is
    // baked facing into the room (yaw 80 deg = at the camera); wiring it needs a take aimed at Luo in the mouth.
    {shot:"SB01", what:"the runner leans on the north post and calls to Luo",
      now:"MessengerReport at runnerRoute's end facing Luo (PhaseOrders)", wave2:"RunnerLeanPostCall holdLoop with its post contact (Anim), re-aimed at Luo"},
    {shot:"SB01", what:"Luo kneels in the mouth looking out down the trench",
      now:"LuoKneelCheck held at banter.luoKneelS (its kneel loop; the reach arm shows) in Tableau/PhaseOrders", wave2:"a native kneel (KneelHold/RifleIdle, contract §4.1): needs an Anim-owned hook -- a director request that passes kneel:1 through Script_OpeningStoryboardAnimation's Move state (now forced to 0) and is exempt from ResolveOpeningActorPose's Banter/Orders Luo substitution"},
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
      now:"flatFwd (the flat palm pushed forward and lifted 0.14 m off the mud so it is in the frame, storyboardShots SB03 hands.r) in beats.CaptiveDragged..Wipe", wave2:"Eye's sleeve/arm and legs with it (LEG_POSES.lieSide); if Eye adds a prone forward palm to EXTRA_HAND_POSES, use it in place of flatFwd and keep the SB03 hands.r check"},
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
    {shot:"SB04", what:"ijaA snarls from Found to the end of the blow",
      now:"neutral face", wave2:"CharacterFacial.SetExpression(ijaA rig, {snarl:1}) Found..Butt (Face)"},
    {shot:"SB04", what:"white flash when the butt lands",
      now:"Deafen, strike roll and the blood layer only", wave2:"lens.flash on the buttHit event (Eye)"},
    {shot:"SB04", what:"Shunzi's right hand grips ijaA's forearm at his collar",
      now:"push hand keys (beats.Butt)", wave2:"EXTRA_HAND_POSES.gripForearm on ijaA in beats.Butt (Eye)"},
    {shot:"SB04", what:"broken planks in the foreground by the butt spot; the timber door behind",
      now:"nothing", wave2:"OpeningSet plankDebrisButt, trenchFacadeN (Set)"},
    // SB04A (Boots)
    {shot:"SB04A", what:"the interpreter hurrying up the SSW leg with one arm out",
      now:"InterpreterPoint as upperBody on the run (PhaseBoots Hurry)", wave2:"InterpreterHurryReach (Anim)"},
    {shot:"SB04A", what:"Shunzi's hand holds ijaA's sleeve",
      now:"rest hand keys (beats.Boots)", wave2:"EXTRA_HAND_POSES.gripSleeve on ijaA in beats.Boots (Eye)"},
    {shot:"SB04A", what:"dizzy softening, desaturation, blood edge about 0.3",
      now:"concussion blur/ghost; the story blood layer settles to strikeBlood.settle 0.3", wave2:"OpeningLens LOOKS for Boots (Eye)"},
    {shot:"SB04A", what:"plank revetment and duckboards down the SSW leg",
      now:"bare earth", wave2:"OpeningSet revetmentSSW, duckboardsSSW (Set)"},
    {shot:"SB04A", what:"the SSW leg open from the dugout mouth's south pocket (the drag ends at shunzi.dragged (0.6,-123.9) and 02 looks down the leg from there)",
      now:"BunkerSouthRevetment (x -2.8..0.8, z -123.95..-123.55, 2.2 m) walls the pocket off from the leg: shunzi.dragged lies inside it and ijaA backs through it; Survey B's SB05 trial saw through it from inside", wave2:"needs an owner (not in contract §3/§4.5; integrator to decide, the Set package owns the layout's mouth blocks): in the collapsed state open BunkerSouthRevetment's east end (x <= 0) so the mouth pocket and the leg join -- moving the circle south out of it instead is blocked by BunkerMouthSpoil (the interpreter and ijaA have no floor left there). Then set wave1Allowances.revetment to null: that drops SB04A's behindOk, K2's ignore and the test's sight/drag exemptions in one place"},
    // SB05 (Hold .. Collar)
    {shot:"SB05", what:"02's eye in the SSW leg's north mouth looks out of BunkerSouthRevetment (the SB05/SB05A camera and DragCover's first 0.4 m are inside it; unseen from inside, the K2 probe ignores it)",
      now:"shunzi.dragged (0.6,-123.9) as contract §2.6; wave1Allowances.revetment (K2 ignore, test sight/drag exemptions)", wave2:"the revetment's east end opened (entry above); wave1Allowances.revetment null"},
    {shot:"SB05", what:"ijaA holds the collar with his face up, leaning in, snarling at the eye",
      now:"IjaHoldCollarUp as baked (head down under the cap) + the performance layer's head look at the camera (UpdatePerformances), stood off rescue.ijaAStandoffM 0.3 m (0.8 m from the eye, his grip short of the collar, under the frame)", wave2:"IjaHoldCollarUp re-baked with the head up (Anim, contract §4.1) -- with its head track about 0.8 m out, so ijaAStandoffM goes back to 0 and the grip meets the collar -- and expression.snarl 1 Hold..Collar (Face)"},
    {shot:"SB05", what:"ijaB stands in the leg with the rifle levelled at the waist, pointed at Shunzi",
      now:"IjaReadyRifle held on its last frame (GuardHold)", wave2:"IjaGuardPort (Anim) in GuardHold, in ContactClips if it needs to be"},
    {shot:"SB05", what:"both hands at the bottom edge gripping ijaA's forearm at the collar",
      now:"collar/rest hand keys (beats.Hold..Collar)", wave2:"EXTRA_HAND_POSES.gripForearm on ijaA in beats.Hold..Collar (Eye)"},
    {shot:"SB05", what:"duckboards down the SSW leg, log revetment on its east wall (left), a flag beyond RC",
      now:"bare earth", wave2:"OpeningSet duckboardsSSW, revetmentSSW, flagRC (Set)"},
    // SB05A (Chop, Parry, Flee)
    {shot:"SB05A", what:"ijaA lets go and snaps round to his right-rear, shocked",
      now:"IjaHoldCollarUp with the head look turned to Luo (UpdatePerformances, Chop), then IjaParriedChoppedFall", wave2:"IjaStartleTurn (Anim) at the cut (its last frame = IjaParriedChoppedFall's first, same root) + expression.shock (Face), in ContactClips"},
    {shot:"SB05A", what:"right hand on ijaA's arm as he turns",
      now:"collar/rest hand keys (beats.Chop)", wave2:"EXTRA_HAND_POSES.gripArm on ijaA in beats.Chop (Eye)"},
    {shot:"SB05A", what:"two black smoke columns left of centre down the leg",
      now:"clear sky", wave2:"Data_OpeningSet0103.SMOKE for stage 02 (Set)"},
    // SB06 (Check, KickRifle, Released)
    {shot:"SB06", what:"Luo kneels, leans in and reaches toward Shunzi (「还能打不？」)",
      now:"LuoKneelCheck at CheckRoot (rescue.luoCheck, 0.9 m): he kneels upright, the head above the frame (SB06 judge headOptional) and the grip lands 0.35 m short", wave2:"LuoKneelReach (Anim) in PhaseCheck (its last frame = LuoKneelCheck's first), in ContactClips; drop headOptional from storyboardShots SB06"},
    {shot:"SB06", what:"Liu kneels aiming east at the trench edge; He kneels at the right edge with his rifle",
      now:"standing at liuCover / heCover while the director poses them (the director's Move hands the native layer kneel:0; He's head may leave the frame, SB06 judge headOptional); kneeling (AI stance 1) from the hand-back", wave2:"the Anim-owned kneel hook for director poses (as SB01's Luo) for Liu and He from their arrival; drop He's headOptional"},
    {shot:"SB06", what:"his own legs and boots at the lower right; the left hand toward Luo, the right hand toward the rifle",
      now:"sit/brace/rifle hand keys (beats.Check/KickRifle), no legs", wave2:"LEG_POSES.sitCover and the swapped hands in beats.Check/KickRifle (Eye)"},
    {shot:"SB06", what:"distant smoke columns and a fire down the trench",
      now:"clear", wave2:"Data_OpeningSet0103.SMOKE for stage 02 (Set)"},
  ].map(Object.freeze)),
  // ---- 02 pursuit (bunkerPursuit, contract §5.8) -----------------------------------------
  // The roster's delayS (Space) are scaled so the three followers are in the trench the player just left
  // while he looks back from the rear corner (review 09-24: at delayS as authored one man showed, 12 m off).
  pursuit:Object.freeze({ delayScale:.35, speedMps:3.2, retireMps:3, retireMaxS:40 }),
  // ---- 02 withdrawal (RearTrench) --------------------------------------------------------
  withdraw:Object.freeze({
    // The way out: seat -> crater step (exposed to F) -> SSW leg -> RC. lane[0] is Luo's (he comes from kickFrom round
    // the north of the seat, past Shunzi's feet); the player (Script_FirstLevelCampaignOpening) walks from lane[1], which
    // sits on the straight line from the seat to the crater step: a first point further east (3.35,-124.9) walked him
    // into the open front trench, the pursuers took his last seen spot there (behind the spoil from RC) and the campaign's
    // look-back from RC saw none of them (09-26 run).
    // 2026-09-26 integration: the old start in the mouth, (0.3,-125.1) -> (1.7,-125.3), ran through the fallen lintel,
    // the roof timber and the backrest (Script_OpeningSetTest §2). lane[3] (the crater step) and lane[6] (luoCover) keep
    // their indices: heBackRoute / liuBackRoute and the campaign's look-back read them.
    lane:Route([3.3,-125.65],[3.05,-124.5],[3.3,-124.2],[3.3,-122.2],[3.1,-121.3],[1.4,-120.8],[-.6,-120.4],[-1,-118.5],[-4,-113]),
    luoCover:P(-.6,-120.4),                // first intact wall past the low section, turned back to cover
    luoCorner:P(-7.2,-111.8),              // beyond RC, waiting for the player
    heBound:Route([-.2,-121.9],[-1.2,-118.2]),
    // From their SB06 posts back over the crater step: He down to the first intact wall, Liu from the end of
    // rescue.liuCoverRoute down the SSW leg to RC (the tail is lane[3..8]; Script_OpeningStoryboardsTest checks both).
    heBackRoute:Route([3.3,-122.2],[3.1,-121.3],[1.4,-120.8],[-.6,-120.4]),
    liuBackRoute:Route([4.3,-123.25],[3.3,-122.2],[3.1,-121.3],[1.4,-120.8],[-.6,-120.4],[-1,-118.5],[-4,-113]),
    liuBound:Route([-1,-121],[-5.3,-112.4]),   // the second bound is round the corner, off the look-back line up the leg
    pursuitBaseFaceTo:P(-.2,-122.2),
  }),
});
