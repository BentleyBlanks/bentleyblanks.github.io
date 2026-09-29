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
// Wave 1 (contract §3): BunkerSouthRevetment (Data_FirstLevelMissionLayout shell, x -2.8..0.8, z -123.95..-123.55,
// 2.2 m) stands where 02's circle closes (shunzi.dragged) and across SB04A's drag. Until it is opened in the collapsed
// state (pendingWiring SB04A/SB05, owner to be named by the integrator) the three places that must look past it name it
// through this one constant: storyboardShots SB04A behindOk, Data_FirstLevelSpaceKeyframes K2 ignore and
// Script_OpeningStoryboardsTest's sight/drag checks. Wave 2 sets wave1Allowances.revetment to null.
const REVETMENT = "BunkerSouthRevetment";
// Everyone who leaves after Luo's order (banter.exitRoute; the runner's own is the same without its first point).
const BANTER_EXIT = Route([2.1,-125.2],[3.4,-123.6],[3.1,-121.6],[1.2,-120.6],[-1,-118.5],[-4,-113],[-9,-111.3]);
export const OPENING_STORYBOARDS = Object.freeze({
  version:"20260929OpeningStoryboardsV20PullCutSheathe", animationBase:"./Animation/OpeningStoryboards/",
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
    added:["IjaShoveToWall","BlastDazedStir",
      // 2026-09-27 review 「日军从外面走进来怎么能直接进的，至少有个翻越动作吧。拖动的动作也还是很奇怪」: ijaA vaults the
      // fallen roof timber into the pit and back out, and hauls Shunzi out from under it by the wrist
      // (ija.vaultIn / ija.dragOutRoute, docs/Data_OpeningVaultHaul20260927.md).
      "IjaVaultTimberIn","IjaVaultTimberOut","IjaHaulForearmUnder",
      // 2026-09-27 review 「主角应该在给自己的弹夹装弹，手上的动作是自然延续的而不是僵住的」: the first-person body sits
      // filling a charger round by round through Banter / Orders (firstPerson.hands.beats, firstPerson.fill).
      "ShunziSitFillCharger",
      // 2026-09-27 pinned rescue (docs/Data_OpeningPinnedRescue20260927.md): ijaA walks off jeering, finds the pinned Shunzi,
      // lifts his head by the hair and slaps him; He heaves the roof timber off him.
      "IjaTauntWalk","IjaFoundLook","IjaCrouchHairHold","IjaSlapForehand","IjaSlapBackhand","IjaSlapRaise","HeLiftTimber",
      // 2026-09-29 Luo's rescue: he picks the rifle up and slings it, hauls Shunzi out by the armpits (`player` = his body) and hands him the rifle
      // kneeling (Animation/OpeningStoryboards, docs/Data_OpeningClipLibrary20260923.md; the director wires them).
      "LuoPickUpRifleSling","LuoRescueDrag","LuoHandRifle",
      // 2026-09-29 「朝着玩家走过来的时候没有收起来的小刀」: he lets go and sheathes the bayonet before he walks off.
      "IjaReleaseSheathe"],
  },
  // The NRA02 comrade is clean in SB01; the shell that buries him wounds him, and he is bloodied from the
  // black after it through the drag and the interrogation (2026-09-27 review: 「应该是在爆炸后才变得伤痕累累」).
  // Body stains are placed on the speaking rig's outer uniform in bind space on the seated pose and follow every
  // authored pose; hidden until the black, each then starts wet at its ageS (a few seconds apart: all from the
  // one blast). The face has its own procedural streaks under the cap (CharacterFacial.SetFaceBlood).
  comradeBlood:Object.freeze({face:1,wounds:Object.freeze([
    Object.freeze({from:"chest",to:"chest",t:0,part:"torso",side:.9,frontM:.20,radiusM:.33,ageS:4}),
    Object.freeze({from:"chest",to:"chest",t:0,part:"torso",side:-.9,frontM:.20,radiusM:.28,ageS:9}),
    Object.freeze({from:"pelvis",to:"chest",t:.58,part:"torso",side:.8,frontM:.20,radiusM:.28,ageS:5}),
    Object.freeze({from:"pelvis",to:"chest",t:.4,part:"torso",side:-.7,frontM:.20,radiusM:.26,ageS:12}),
    Object.freeze({from:"upperArmL",to:"forearmL",t:.34,part:"arm",frontM:.12,radiusM:.19,ageS:3}),
    Object.freeze({from:"upperArmR",to:"forearmR",t:.72,part:"arm",frontM:.12,radiusM:.18,ageS:7}),
    Object.freeze({from:"forearmL",to:"handL",t:.56,part:"arm",frontM:.08,radiusM:.13,ageS:10}),
    Object.freeze({from:"thighR",to:"calfR",t:.32,part:"leg",frontM:.15,radiusM:.25,ageS:2}),
    Object.freeze({from:"thighL",to:"calfL",t:.24,part:"leg",frontM:.15,radiusM:.23,ageS:11}),
    Object.freeze({from:"calfR",to:"footR",t:.35,part:"leg",frontM:.09,radiusM:.15,ageS:6}),
  ])}),
  // Contract §5.3: the director's phases, in order. Each is recorded in `beats` when it really starts.
  // 2026-09-27 rework (docs/Data_OpeningPinnedRescue20260927.md): Shunzi lies pinned under the roof timber in the
  // doorway with his chest and head outside, all of it first person (no cut-away camera). The throat cut is followed at
  // once by the taunt, ijaA walks off toward the mouth taunting and finds him there (Found); he is questioned where he
  // lies with slaps (no drag-out, no butt strike), until the charge breaks in (Charge / Melee) and Luo and He lift the
  // timber off him (Lift).
  // 2026-09-29 (docs/Data_OpeningRescueHandover20260929.md): Lift = Luo picks the rifle up and slings it, rolls him onto
  // his back and drags him out under the arms (the eye looks down his own body at his boots coming out from under the
  // timber); Check = he gets up onto his knees, Luo hands him the rifle (「还能打不？」) and hauls him to his feet; the
  // hand-back is standing with the rifle in his hands (KickRifle and the rifle pickup are gone).
  phases:Object.freeze({
    Trapped:Object.freeze(["Banter","Orders","Incoming","Blast","Black","Wake","FrontPass","CaptiveDragged","CaptiveWall",
      "Interrogation","Slash","Taunt","Found"]),
    BunkerRescue:Object.freeze(["Hold","Ask","Charge","Melee","Lift","Check","Released"]),
    RearTrench:Object.freeze(["Withdraw","Corner","Collection","SupportOrder"]),
  }),
  fps:24, fov:65, fadeInS:1.8,
  blackoutRecovery:Object.freeze({ fadeS:5.2, eyelidS:4.2, closeS:.16 }),
  interpreterClearanceM:.72,
  walkMps:2.3, turnRps:4.5, poseBlendS:.28, cameraBlendS:.65, cameraTurnRps:3.5,
  // A shot on a clip's player track (Luo's rescue: rolled over, hauled, got up) is already smooth: its turn limit only
  // catches a hand-over between shots (the rolled-over head coming forward over the top turns ~5.6 rad/s).
  trackTurnRps:9,
  // A man going from an authored pose into native combat (handed back and raising his rifle) blends this fast.
  combatBlendS:.12,
  // Free walks (a Move with no clip: the native or relaxed gait) set off and pull up instead of stepping from a
  // stand straight to full pace and stopping dead on the mark: pace changes by at most accelMps2 / decelMps2 and
  // slows into the last mark of a route (sqrt(2 a d)), never below minMps short of it. Turns speed up at
  // turnAccelRps2 to turnRps and ease into the facing instead of starting and stopping at full rate.
  pace:Object.freeze({ accelMps2:4, decelMps2:4, minMps:.3 }), turnAccelRps2:24,
  // Held-pose life (Script_OpeningActorPerformance.OpeningHeldLife): a man the director holds on a still frame
  // (Luo kneeling at the mouth through all of Banter, ijaB on the ready through 02's Hold, a collar held on a hold
  // loop) with no dialogue acting on him breathes, sways and lets his eyes wander instead of standing as a statue.
  // Starts once the pose's watched bones turn slower than stillRadS, fades in over inS and out over outS as soon as
  // the clip moves again. Radians and hertz; the head's share is cut to faceAimedShare on clips whose face is aimed
  // at the first-person eye inside the clip.
  heldLife:Object.freeze({ stillRadS:.35, inS:.6, outS:.12,
    breathRad:.018, breathHz:.28, swayRad:.012, swayHz:.11,
    headYawRad:.12, headYawHz:[.07,.19], headPitchRad:.03, headPitchHz:.13, neckShare:.5, faceAimedShare:.25 }),
  // Eye closure at and over which the view is not eased or rate-limited but put on the shot (unseen).
  cameraShutSnap:.95,
  // The look up at a man over the lying eye (01 Found to DragOut, LookAtBody): the bearing is his hips', his head's
  // counting up to headWeight (against the hips' 1) as it comes down into the picture from headInDeg of elevation over
  // fadeDeg. 2026-09-27: on the head alone a few cm of it right over the eye swung the view 30-60 deg back and forth.
  bodyLook:Object.freeze({ headWeight:.5, headInDeg:60, fadeDeg:20 }),
  // The eye travels at most this fast (m/s): ijaA's yank at the collar peaks at 8.7 m/s on the 12 fps
  // player track (09-24 probe, 0.145 m in one frame); capped, the drag reads as a pull, not a cut.
  cameraMoveMps:7.5,
  // Kept for the dadao ambush adapter in Script_OpeningStoryboardAnimation (legacy DadaoHeavy).
  ambushS:1.1,
  // Move speeds of the director's walks along trench polylines (m/s).
  // drag: Luo's haul to cover (02; 1.25 until 09-26). (01's haul out of the mouth is IjaHaulForearmUnder's own root motion.)
  // 2026-09-26 relaxed gait (Script_RelaxedGait; switch walk/run at Data_Tuning_ActorLocomotion.RELAXED_GAIT):
  // amble: a man strolling with the rifle slung (ijaA / ijaB walked in at it until 09-27; before that brisk);
  // 2026-09-27 the vanguard (ijaA / ijaB) comes in at trot, upright, rifle in both hands (alert gait, IjaAlertTrot);
  // trot: the interpreter jogging over when ijaB calls him (InterpreterCall; was walk).
  speed:Object.freeze({ walk:1.5, brisk:2.3, creep:1.15, run:3.2, drag:1.55, flee:3.4, stroll:1.1, amble:1.65, trot:2.4 }),
  arriveM:.12,
  culledHeadM:1.4,     // head height used for an actor the AI has culled (its bones are not updated)
  shotRiseM:1.4,       // a squad rifleman's scripted shot leaves at least this high over his feet (he rises to fire)
  // Hard timeouts (s since the phase began, or since the named wait began). A timeout never
  // skips a physical beat that the flow needs: it forces the beat (a late walker runs, a
  // missed shot is fired again by another man, a contact that did not kill is made lethal).
  timeouts:Object.freeze({
    // ordersSlackS: past the runner's arrival timeout plus the whole BunkerOrders take, the squad leaves anyway.
    // runnerArriveS: seconds into Orders (2026-09-29: the runner starts 23 m out and calls on the way, 9 -> 16).
    banterExtraS:8, runnerArriveS:16, ordersSlackS:3, ordersExitS:9, blastEventS:3.5, blackS:3.0, wakeS:5.8,
    // interpreterCallS: from ijaB's call (InterpreterCall) until the drag may start without it having ended.
    frontPassS:14, walkInS:12, interpreterCallS:6, interrogationExtraS:10, tauntExtraS:8, foundWalkS:10,
    // holdLineS: the questioning's lines (each gate); askS: the whole questioning; chargeS: the rescuers reach their marks
    // (a late man is put there); meleeS: the cuts landed; liftS: Luo's walk, the rifle pickup and the haul done (a stalled
    // clip is played out); checkS: the question and the nod before the hand-over goes on without them.
    holdLineS:8, askS:24, chargeS:4.5, meleeS:7, liftS:16, luoArriveS:7, heArriveS:7,
    longShotRetryS:4, longShotForceS:8, checkS:9, contactKillS:.35,
    // 02 -> 03: Yaowa catches up (else the scene starts where he is), the guard's run up the sap.
    collectionMeetS:8, guardArriveS:10,
  }),
  // The slap's blood layer (a split lip): opacity for holdS, settling to `settle` over settleS, then fading out over fadeS.
  strikeBlood:{holdS:.15,opacity:.55,settleS:.9,settle:.2,fadeS:6},
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
      free:Object.freeze(["Wake","FrontPass","CaptiveDragged","CaptiveWall","Interrogation","Taunt","Hold","Ask"]),
      // 2026-09-27 review 「给到自由视角即可，听队友聊天不需要帮玩家主动切镜头方向」: sitting in the dugout (Banter, and
      // Orders until Luo's order) the player looks round freely: yaw either side of the seat's shot, pitch [down, up]
      // from it (rad; the seat shot is pitched seatShot.pitchDeg). The mission runtime's trapped clamp widens to the same
      // limits (FirstLevelBunkerShow.LookLimits). After the order the look eases back to the follow shot over returnS.
      seated:Object.freeze({ yawRad:1.75, pitchRad:Object.freeze([-.95,1.15]), returnS:1.1 }) }),
    // Shot pitch (rad, + up) while a hand beat is the subject; the push-up lift of the lying eye (m).
    look:Object.freeze({ clawPitch:-.8, reachPitch:-.28, pushUpM:.13, dragRollRad:.025,
      // Parry: the eye steps this far aside from ijaA's back so He (behind ijaA) is seen, and holds the
      // duel this long after the cut before following the interpreter.
      duelAsideM:.25, duelHoldS:.45 }),
    // 「弹装起！往后沟撤！跟紧！」: from Luo's order (clock: flags.exitAt) through Incoming he gears up and hurries to the mouth --
    // stands with the rifle, finishes loading, turns round to the pack at the west wall, puts it on, takes the rifle up again and runs
    // to shunzi.followTo (2026-09-29, user: 「主角收拾装备增加一个转身背起自己的背包拿起枪然后匆匆往门口赶，不然现在的设定走的太慢了」;
    // before, firstPerson.followUp walked the 1.5 m at 0.24 m/s). The whole action -- eye path, rifle, pack, both hands, sounds -- is
    // Data_OpeningFirstPersonGear (evaluated by Script_OpeningFirstPersonGear; docs/Data_OpeningFirstPersonGear20260929.md).
    // The seated fill clip (hands.beats Banter / Orders `fill`): the body root stands at the seat facing shunzi.seat.yaw,
    // shifted once so the clip's eye is over shunzi.seat; the eye is the head bone plus eyeFromHeadM (body frame: x right,
    // y up, -z forward; the clip keeps the head bowed over the charger, eye to head measured in the bake, 09-27).
    fill:Object.freeze({ eyeFromHeadM:Object.freeze([0,.024,-.127]) }),
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
      // Seated (Banter, Orders until Luo's order): the whole body plays the baked fill clip (`fill`, BlenderMCP:
      // _import/Script_OpeningStoryboardClips.py ShunziSitFillCharger) on an ammo crate at the seat -- the rounds one by one
      // from the belt pouch into the charger in the left hand, the rifle across the lap -- one clock from Banter on, so the hands never
      // stop at a phase change (09-27 review: the two held palm poses read as frozen hands). Orders' exit signal hands
      // over to the gear-up (Data_OpeningFirstPersonGear) in OpeningFirstPerson.
      beats:Object.freeze({
        Banter:Object.freeze({fill:"ShunziSitFillCharger",props:Object.freeze(["fillCharger","fillRound","fillRifle","fillSeat","packRest"])}),
        Orders:Object.freeze({fill:"ShunziSitFillCharger",props:Object.freeze(["fillCharger","fillRound","fillRifle","fillSeat","packRest"])}),
        Blast:K([0,"protect","protect"],[.4,"protect","protect"],[.8,"limp","limp"]),
        Black:K([0,"limp","limp"]),
        // 「他试着撑起身体。背包带一下绷紧……又落回地面。手指在泥里抓出一道痕。」
        Wake:K([0,"limp","limp"],[1.05,"flat","flat"],[1.2,"push","push"],[1.8,"push","push"],[2,"flat","flat"],[2.2,"flat","clawIn"],[3,"flat","clawOut"]),
        FrontPass:K([0,"flat","clawOut"],[.6,"flat","flat"]),
        // SB03: the right hand slides forward into the lower right of the picture while he is dragged (flatFwd).
        CaptiveDragged:K([0,"flat","flat"],[1.2,"flat","flatFwd"]), CaptiveWall:K([0,"flat","flatFwd"]), Interrogation:K([0,"flat","flatFwd"]),
        Slash:K([0,"flat","flatFwd"]), Taunt:K([0,"flat","flatFwd"]),
        // 2026-09-27 rework: ijaA walks up; the hands claw at the mud, pushing against the timber on his back.
        Found:K([0,"flat","flatFwd"],[.8,"push","push"],[1.6,"flat","clawIn"]),
        // Held up by the hair (ijaA's left fist), pinned at the hips: both hands strain against the mud, the fingers
        // clawing (a hand held up to ijaA's forearm sat 0.2 m off the lens and filled a third of the picture).
        Hold:KC("holdGripAt",[-1,"flat","clawIn"],[0,"push","clawIn"],[.35,"push","push"]),
        Ask:K([0,"push","push"],[1.6,"push","clawIn"],[2.6,"clawIn","push"],[4,"push","push"]),
        // The charge: he is dropped (hair let go) and the hands go flat in the mud, then claw as he tries to see.
        Charge:K([0,"push","push"],[.25,"flat","flat"],[1.4,"flat","clawIn"]),
        Melee:K([0,"flat","clawIn"],[.8,"flat","flat"]),
        // 2026-09-29 (docs/Data_OpeningRescueHandover20260929.md), clocks on LuoRescueDrag / LuoHandRifle: pinned, straining
        // until the haul; rolled onto his back the arms fall loose, then both hands take hold of Luo's forearms under his
        // armpits for the haul (gripLuoArms) and let go when he is set down. Getting up: flat, onto all fours (push), up on
        // his knees (rest) -- from the hand-over the hands are on the rifle (OpeningStoryboards.HeldRifle, not a beat).
        Lift:KC("dragAt",[-1,"push","push"],[0,"flat","flat"],[.5,"flat","flat"],[1.3,"limp","limp"],[1.65,"gripLuoArms","gripLuoArms"],
          [4.4,"gripLuoArms","gripLuoArms"],[4.75,"limp","limp"]),
        Check:KC("handAt",[0,"limp","limp"],[.5,"flat","flat"],[1.0,"push","push"],[1.5,"rest","rest"]),
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
    // 2026-09-27: the witness phases stay dazed but readable (first person all through: the throat cut must read).
    base:Object.freeze({ Banter:0, Orders:0, Incoming:0, Blast:.95, Black:.95, Wake:.9, FrontPass:.72, CaptiveDragged:.6,
      CaptiveWall:.55, Interrogation:.5, Slash:.42, Taunt:.45, Found:.5, Hold:.48, Ask:.46, Charge:.42, Melee:.4,
      Lift:.42, Check:.34, Released:.32 }),
    riseRps:.8, fallRps:.25,
    focusScale:.3,
    // strike: the slap's share of the near-miss curve (it replays the curve from the slap, lighter than the blast);
    // kick: a short spike on each slap on top of it.
    strike:.55, kick:.3, kickFadeS:.6,
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
  // The vanguard that must really be down before the hand-back (contract §2.1): ijaA and
  // ijaB by the dadao, ijaD (the junction) by Liu Wencai. ijaC (the fold) may live.
  vanguardIds:["BunkerExecutionerA","BunkerExecutionerB","BunkerFollowB"],
  cast:Object.freeze({ ijaA:"BunkerExecutionerA", ijaB:"BunkerExecutionerB", ijaC:"BunkerFollowA", ijaD:"BunkerFollowB" }),
  // ---- 01 marks ------------------------------------------------------------------------
  shunzi:Object.freeze({
    // 2026-09-25 storyboard round (contract §2.1): he sits at the back of the dugout for the talk and the order
    // (SB01), then (after the order, through Incoming) gears up -- rifle, pack -- and hurries to the mouth
    // (Data_OpeningFirstPersonGear), and is knocked down by the near miss (SB02). The Space's MISSION_PLACEMENT.bunker.player (-1.3,-126.2)
    // stays the dugout's anchor (A.bunker); the director's Shunzi marks are these.
    seat:P(-1.95,-126.25,-93*Math.PI/180),   // SB01 eye: back of the dugout, the mouth x 0.30–0.74 of the frame
    followTo:P(.35,-125.75),                 // after the order he gears up and runs here, just inside the mouth (Data_OpeningFirstPersonGear)
    blastFall:P(-.9,-126.0),                 // SB02: where the eye has dropped to at the end of the fall (thrown back)
    // 2026-09-27 rework (user: 「主角变成压在房梁下，半个身子在外面」, 「那个川兵应该离主角再近一点」): from the black on he
    // lies face down across the doorway, the fallen roof timber (Data_OpeningSet0103 roofTimberDown, down from the black)
    // on his hips at pinnedHips, the legs inside the dugout, chest and head out on the trench floor looking east. The
    // lying eye (witnessEye, lieEyeM) is 2.3 m from the kneeling comrade (R3); it used to be 3.8 m, inside the mouth.
    trap:P(1.72,-125.28,-Math.PI/2),
    pinnedHips:P(.95,-125.3),
    witnessEye:P(1.85,-125.25),
    seatEyeM:.95, standEyeM:1.32,   // seatEyeM: only without the fill clip (its eye is the clip's, ~0.7 m)
    lieEyeM:.28,
    // SB06 until 2026-09-28: the seat he was hauled onto (his back to the mouth, facing east down the front trench). Since
    // 09-29 he gets up where Luo sets him down (rescue.drag); kept as the hand-back's fallback spot and the mark the
    // hand-back hold-fire radius (rescue.handbackHoldFireM) and the Set's backrest are measured from.
    cover:P(2.4,-125.2,-94*Math.PI/180),
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
    // SB01 camera: the seat's look (eye = the fill clip's eye, set over shunzi.seat). The player's own look is laid over
    // it (firstPerson.headLook.seated); the head no longer turns to whoever speaks (09-27 review). Pitched so the charger
    // in his hands is in the lower third.
    seatShot:Object.freeze({ yawDeg:-93, pitchDeg:-18 }),
    // SB02 mirrored (contract §2.2): the shell lands at fallStartS (FireShell flight); the eye drops to eyeM and turns
    // to yaw/pitch with the head rolled to the left by fallEndS; the eyes close at eyesCloseS; Black at phaseS.
    // pitchDeg -6 (contract -14, ±8): at -14 the lintel was above the frame and the north post's top half hung over the
    // bank of the trench outside (09-25 review); at -6 post and lintel frame the mouth on the right (tmp/fix trials).
    // debrisS: the dirt and timber raining on him after the explosion (debrisFall; was played on the trigger frame, i.e.
    // before the shell landed -- 「先断木板，再出现炮弹的声音」, user 09-27).
    blastShot:Object.freeze({ fallStartS:.22, fallEndS:.65, eyeM:.75, yawDeg:-66, pitchDeg:-6, rollDeg:17, eyesCloseS:.84, phaseS:1.0, debrisS:.38 }),
    // 2026-09-29 user: 「传令兵应该是老远就喊话（玩家就能听到），然后在地道门外就和班长可以说话了，而不是一定要走到屋里才说话」.
    // He no longer runs into the dugout. He starts in the rear trench 23 m from the seat (west-south-west, behind the dugout's
    // south wall: never in the shot), runs the rear trench and the SSW leg calling out (BunkerRunnerCall), comes into the
    // mouth's view from the right round the bend (3.3,-123.6) and stops OUTSIDE the mouth on the trench floor at the last
    // point (the report post: 1.8 m south-east of Luo's kneel at b.luo, 1.7 m from He, off the exit line's first metre),
    // facing Luo; BunkerOrders.01 is shouted there. Every point is on the trench floor (ground -1.9 m, clear; the crater step
    // from (1.2,-120.6) to (3.0,-121.6) is the route Luo, He and Liu already run).
    runnerRoute:Route([-19,-110.7],[-14,-112.6],[-4,-113],[-1,-118.5],[1.2,-120.6],[3.0,-121.6],[3.3,-123.6],[3.05,-124.5]),
    // BunkerRunnerCall (Data_FirstLevelDialogueDirection): line 1 opens afterS into Orders (Banter's last line has just
    // ended; the runner runs from the first frame of Orders); line 2 opens once he is within secondWithinM of the seat;
    // BunkerOrders.01 waits for him at the post, and for line 2 to end, but not longer than holdMaxS after he arrives.
    // The three front-bound men (Data_FirstLevelBackdropSquads.OPENING_DEPTH_WALKERS) set off delayS after line 2 opens (or after
    // the runner arrives, if that comes first): they used to be under way 3 s before the report, which line 2 -> arrival keeps.
    runnerCall:Object.freeze({ afterS:.5, secondWithinM:12.5, holdMaxS:1.5 }),
    // Everyone who leaves after the order goes out of the mouth, down the SSW leg to RC and on west.
    exitRoute:BANTER_EXIT,
    // The runner leaves from his post outside the mouth: the same way, without the first point (behind Luo's kneel).
    runnerExitRoute:Route(...BANTER_EXIT.slice(1).map(p=>[p.x,p.z])),
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
    // 2026-09-26: once the first of them is this close to his mark (the buried man in sight), ijaB shouts back up the
    // sap for the interpreter (InterpreterCall); the interpreter sets off at a trot on his answer (line .02).
    interpreterCallM:5,
    // At the far call (CaptiveTaunt.04) ijaB turns to the front (east) where he stands.
    ijaBWatchYaw:-Math.PI/2,
    // 2026-09-27 rework (user: 「一割马上就嚣张的说了那些台词；然后边说边走，看到了被木头压住的主角」): the taunt starts
    // on the cut; ijaA holds the dying man up by the hair for tauntHoldS (CaptiveTaunt.01), lets him drop and walks off
    // west toward the mouth along tauntWalk (slowly, a swagger: .02 and ijaB's .03 on the way), taunting over his shoulder -- and stops dead
    // at `found`, the pinned Shunzi 1.1 m ahead of him (ShunziFound). He steps up and squats at his head (`crouch`,
    // facing west onto him) for the questioning (02).
    // 2026-09-29 (「朝着玩家走过来的时候没有收起来的小刀」): the hold ends on IjaThroatSlash's hold-loop start (2.0 s = the cut
    // 0.24 + tauntHoldS; he wipes the blade on the dying man's shoulder in it), and he sheathes it where he stands
    // (IjaReleaseSheathe, 1.33 s) before he walks off with his hands free.
    tauntHoldS:1.76, tauntWalkMps:.75,
    tauntWalk:Route([3.6,-125.28],[3.2,-125.22]),
    found:P(2.98,-125.2,Math.PI/2),
    crouch:P(2.45,-125.22,Math.PI/2),
    // He looks down at him this long before the line (ShunziFound) and before he squats.
    foundLookS:.7,
    interpreterEnter:Route([23.5,-130],[20.1,-128],[18.7,-126.8],[17.45,-126.2],[16,-125.65],[14.2,-125.75],[13.2,-125.65],[12,-124.75],[8,-124.05],[6,-123.85],[4.9,-124.05]),
    // 「翻译踉跄着退开」 (Charge): turned to face west (onto the pinned man) InterpreterFlee carries him 1.3 m back east,
    // then he runs east down the north side of the front trench (between the dead comrade and ijaB, away from the crater
    // step the charge comes down), into the depth sap past J, and is removed out of sight.
    // fleeRate: InterpreterFlee sped up so he is out of the charge's way (09-27 run: at the full 1.6 s Luo coming down the
    // step passed 0.52 m from him).
    interpreterFleeYawDeg:90, interpreterFleeRate:1.4,
    interpreterFlee:Route([4.4,-125.15],[5.4,-125.3],[6.2,-125.1],[10,-124.3],[13.6,-123.8],[15.2,-118.5],[17.5,-111]),
  }),
  // ---- 01 comrade chain ----------------------------------------------------------------
  // Offsets are the manifest stages (anchor frame +x right, -z forward). The interrogation
  // extras stand where the chain leaves room (the comrade kneels back to the north wall).
  // ijaAHold: his collar hold through the questioning. 2026-09-27: at the comrade's left front, a step short of the throat
  // cut's stance at his left shoulder (manifest stage slashGrab), which he takes before the grab (PhaseSlash).
  interrogation:Object.freeze({ ijaAHold:Object.freeze([-.4,-.45,-150]),
    // SB03 (contract §5): the interpreter crouches side-on to the comrade east of the group, ijaB behind him; world marks.
    interpreterAt:P(4.9,-124.05,25*Math.PI/180), ijaBAt:P(6.05,-125.0,55*Math.PI/180),
    // 2026-09-27 rework: first person all through (user: 「保持第一人称，不在切换视角」). From the pinned eye the group is
    // 2.3-4.2 m off, bearing -74..-111 deg; the heads stand 20-30 deg over the low eye.
    witnessShot:Object.freeze({ yawDeg:-88, pitchDeg:12, rollDeg:2 }),
    // The cut and the taunt: the look follows the comrade's head (throat) at most followDeg off witnessShot's yaw.
    slashShot:Object.freeze({ followDeg:18, pitchMinDeg:4, pitchMaxDeg:26 }),
    // The throat cut read from 2.3 m (user: 「现在看不出来是割喉」): from the grab the view narrows to `scale` of the fov over
    // inS (the eye fixing on it -- still first person, no cut) and widens again over outS once ijaA walks off.
    fixate:Object.freeze({ scale:.7, inS:.8, outS:1.2 }),
    hurryMps:2.0 }),
  // ---- 02 questioning where he lies, the charge, the haul out (2026-09-27 rework) ----------------
  // User: 「日军也不再拖出主角，直接在原地审问，把从枪托改成扇巴掌（被扇的单边的屏幕有眩晕效果）……在主角被审问了几句之后，
  // 附近忽然枪炮声四起，杀喊声四起（全都是四川话）然后班长等一大帮人提着大刀冲上去和现存日军部队白刃战」;
  // 「主角从废墟中出来也就自然的改成是班长拖出来的了」.
  rescue:Object.freeze({
    // Hold/Ask camera: ijaA's left fist lifts the head by the hair: the eye rises liftM over liftS and tips up at his face
    // (pitch capped at maxPitchDeg, the face a little above centre: headAboveDeg).
    holdShot:Object.freeze({ liftM:.16, liftS:.45, maxPitchDeg:40, headAboveDeg:6, backM:.04 }),
    // The interpreter squats at Shunzi's right front, 1.3 m from the eye, facing him; ijaB keeps watch east down the
    // trench 3.4 m off (「快点！」 over his shoulder).
    interpreter:P(2.92,-124.5,56*Math.PI/180),
    interpreterReturn:Route([4.2,-124.25]),
    interpreterClearanceM:.44,
    ijaBGuard:P(5.2,-124.7,-Math.PI/2),
    // Slaps (ijaA, crouched, the left fist in the hair): the right hand goes up high over raiseS (IjaSlapForehand /
    // IjaSlapBackhand play from their first frame: raiseS = the clip's contact), cracks down at hitS; the head is flung
    // yawDeg / rollDeg away from the blow (and shiftM sideways, dropM down), hangs there hangS and eases back over
    // recoverS -- the aim stays on where ijaA's face was at the blow, so the whole turn is the head's; the struck side of
    // the picture swims (lens `slap`, Data_OpeningLens) for dizzyS. `side` +1: struck on the left cheek (forehand, the
    // view flung right); -1: backhand on the right cheek.
    // 2026-09-29 (user: 「应该是看见我了就扇巴掌，等翻译问了一句主角还没说话就再来了一巴掌」): the first blow as soon as
    // he has the head up by the hair (`grab`: delayS after the Hold begins, the hold clip at its loop start), and
    // 「这个也问！」 waits for it; the second in the silence after the interpreter's first question (`line` .03: hit
    // afterEndS after the line ends) and 「听见没有？」 (.04) waits for it. `then` / `thenAfterS`: the line held back
    // until thenAfterS after the blow lands.
    slap:Object.freeze({ sound:"slap", raiseS:.58, hitS:.58, yawDeg:44, rollDeg:12, pitchDeg:-7, dropM:.06, shiftM:.05,
      hangS:.35, recoverS:1.2, dizzyS:2.4,
      blows:Object.freeze([
        Object.freeze({ at:"grab", delayS:.75, side:1, then:"RescueInterrogation.01", thenAfterS:.4 }),
        Object.freeze({ line:"RescueInterrogation.03", afterEndS:1.1, side:1, then:"RescueInterrogation.04", thenAfterS:.6 }),
      ]),
      // 「说话！」 (.06): the hand goes up for a third -- and the charge breaks in before it lands.
      raiseLine:"RescueInterrogation.06", raiseAfterS:.2, chargeAfterRaiseS:.55 }),
    // The rescuers wait out of sight in the SSW leg just behind the spoil and the crater step; on the charge they come
    // over the step (chargeRoute) into the front trench at runMps, staggered by `delayS`. Luo and He go for ijaB and
    // ijaA (the chopRear / chopParry stages round their roots), Liu stops on the step (liuShot) and shoots the junction
    // man, the others run on east down the trench (the depth Japanese, the fold), yelling.
    luoStart:P(1.0,-120.55), heStart:P(.45,-120.35), liuStart:P(-.2,-120.1),
    chargeRoute:Route([1.4,-120.8],[3.1,-121.3],[3.3,-122.2],[3.3,-123.5]),
    runMps:4.2,
    // They burst out of cover (C.pace's 4 m/s² took 2.2 m to reach runMps: the charge came over the step at a jog);
    // the men going in for a cut (He, Luo, ChargeA) reach the chop mark still running, the others pull up on theirs.
    runPace:Object.freeze({ accelMps2:10, decelMps2:6, minMps:.3 }),
    strikePace:Object.freeze({ accelMps2:10, decelMps2:6, minMps:2.4 }),
    // Luo leads (he starts 0.58 m further down the route; going second he ran inside He, 8 cm apart), He 1.4 m behind.
    delayS:Object.freeze({ luo:.3, he:.5, liu:.8 }),
    liuShot:P(3.3,-122.4,-1.45),
    // After the junction shot Liu goes down into the front trench and aims east from the south wall (SB06: right of centre, far enough east that He's head, swaying on his held pose, does not cover his).
    liuCover:P(5.92,-123.52,-Math.PI/2),
    // He's parry-and-cut (chopParry) is staged round ijaA's root turned parryTurnDeg from his crouch (he comes up turning
    // to his left, toward the crater step): He then arrives just off the step, right of ijaA from the pinned eye (on the
    // crouch root itself He stood straight behind ijaA's back from the eye, 10 deg off, and was hidden).
    parryTurnDeg:-50,
    // ...and ijaA meets the charge there: startled (IjaStartleTurn) he springs up off Shunzi and runs to parryMeet toward the
    // crater step, so the duel -- and his body, which the chop drops round its root -- is 1.5 m down the trench, not on
    // the pinned man's face, his way out from under the timber or the hand-back seat (09-27 run: the corpse lay on all three).
    parryMeet:P(3.15,-124.55),
    // 「一大帮人」: more men of the company with dadao (NRA02 / NRA05 bodies, the rigs the opening clips are baked on).
    // `victim`: a depth Japanese he cuts down on the chopRear stage (his clip LuoDadaoChopRear needs the NRA05 body).
    extras:Object.freeze([
      Object.freeze({ id:"ChargeA", start:P(-.8,-119.6), modelVariant:4, delayS:.5, victim:"DepthIjaB" }),
      Object.freeze({ id:"ChargeB", start:P(-1.3,-118.9), modelVariant:1, delayS:.9, post:P(12.6,-124.2) }),
      Object.freeze({ id:"ChargeC", start:P(-1.8,-118.2), modelVariant:1, delayS:1.2, post:P(14.8,-124.9) }),
      Object.freeze({ id:"ChargeD", start:P(-2.3,-117.5), modelVariant:4, delayS:1.5, post:P(10.6,-123.5) }),
      Object.freeze({ id:"ChargeE", start:P(-2.8,-116.8), modelVariant:1, delayS:1.9, post:P(8.2,-124.6) }),
    ]),
    // The depth Japanese who went off down the trench after the killing hold here, watching east (the chopRear anchor).
    depthPost:Object.freeze({ DepthIjaB:P(9.4,-123.75,-Math.PI/2) }),
    // 「枪炮声四起」: rifle reports from the SSW leg and the crater step at `rifles` (s into Charge), shells landing out in
    // the fields (feedback only, no damage) at `shells`; 「杀喊声四起（全都是四川话）」: `yells` [s, voice key, x, z].
    noise:Object.freeze({
      // The crowd's war cry (Script_SeedAudioChargeBake: a whole trenchful of Sichuan voices yelling 「杀——」) from behind
      // the spoil where the men wait, at crowd[0] s.
      crowd:Object.freeze([.05,.4,-120.6]),
      rifles:Object.freeze([0,.18,.42,.61,.9,1.3,1.75,2.3,2.9]),
      riflesFrom:Route([-.6,-120.2],[.9,-120.7],[2.6,-121.1],[-1.8,-118.5]),
      shells:Object.freeze([[.25,12,-117.5],[.95,-3,-131],[2.1,17,-130.5]]),
      yells:Object.freeze([[.1,"rally_dadao",.9,-120.6],[.35,"rally_charge@luo",1.0,-120.55],[.6,"rally_follow",-.5,-119.8],
        [.85,"rally_charge@heyoutian",.45,-120.35],[1.15,"rally_dadao",-1.5,-118.9],[1.5,"rally_charge@liuwencai",-.2,-120.1],
        [1.9,"rally_noretreat",3.2,-122.4],[2.4,"rally_dadao",5.5,-124.3],[3.1,"rally_charge",7.5,-124.2]]),
    }),
    // Melee: once both cuts have landed the view holds on the trench (meleeHoldS) before the haul.
    meleeHoldS:1.4,
    // Lift: He lifts the timber off his hips (Set PoseRoofTimber toward its hang, raise .. of it) standing at heLift.
    // HeLiftTimber: his hands under the timber at gripS, the heave over raiseS; he holds it (the clip's hold loop) until the
    // boots are out (rescue.drag.dropPastM) and lets it drop, letting go of it letGoS after that.
    lift:Object.freeze({ heLift:P(1.45,-124.7,1.2), raise:.55, gripS:.3, raiseS:.5, letGoS:.9 }),
    // 2026-09-29 (user: 「完全可以让我仰头被拉出来啊，看到自己的脚从倒塌的房子里被拖出来」; docs/Data_OpeningRescueHandover20260929.md):
    // Luo stands startBackM east of the pinned eye facing him (DragRoot), picks the rifle up out of the mud and slings it
    // (LuoPickUpRifleSling), then rolls him onto his back and drags him out under the arms 1.45 m (LuoRescueDrag, rootMotion,
    // player track). He drops the timber once both heels are dropPastM out past its east face (timberEastX).
    // standIn: the contract the clips were baked to (clip root frame: +x Luo's right, -z in front of him, runtime metres;
    // gaze / crown as directions from the eye), played while a clip is not in the manifest.
    drag:Object.freeze({ startBackM:.70, timberEastX:.95, dropPastM:.3,
      standIn:Object.freeze({ pickS:1.8, dragS:5.0, body:Object.freeze({
        eye:[[0,[0,.28,-.70]],[.5,[0,.28,-.70]],[1.3,[0,.22,-.66]],[1.9,[0,.55,-.95]],[2.45,[0,.58,-.62]],[3.0,[0,.55,-.30]],[3.55,[0,.58,.02]],
          [4.1,[0,.55,.50]],[4.6,[0,.35,.65]],[5,[0,.33,.67]]],
        gaze:[[0,[0,.26,.97]],[.5,[0,.26,.97]],[.9,[0,.5,.87]],[1.3,[0,.77,.64]],[1.6,[0,.77,.64]],[1.85,[0,1,.05]],[2.1,[0,-.5,-.87]],
          [4.1,[0,-.45,-.89]],[4.6,[0,-.34,-.94]]],
        crown:[[0,[0,.97,-.26]],[.5,[0,.97,-.26]],[.9,[-1,0,-.1]],[1.3,[0,-.64,.77]],[1.6,[0,-.64,.77]],[1.85,[0,-.05,1]],[2.1,[0,.87,-.5]],
          [4.1,[0,.89,-.45]],[4.6,[0,.94,-.34]]],
        chest:[[0,[0,.12,-.98]],[1.3,[0,.14,-.95]],[1.9,[0,.31,-1.27]],[2.45,[0,.31,-.94]],[3.0,[0,.31,-.62]],[3.55,[0,.31,-.30]],[4.1,[0,.31,.18]],[4.6,[0,.2,.22]]],
        pelvis:[[0,[0,.13,-1.60]],[1.9,[0,.12,-1.60]],[2.45,[0,.12,-1.27]],[3.0,[0,.12,-.95]],[3.55,[0,.12,-.63]],[4.1,[0,.12,-.15]]],
        kneeL:[[0,[.11,.07,-2.08]],[.5,[.11,.07,-2.08]],[1.3,[-.11,.10,-2.08]],[1.9,[-.11,.12,-2.08]],[2.45,[-.11,.12,-1.75]],[3.0,[-.11,.12,-1.43]],
          [3.55,[-.11,.12,-1.11]],[4.1,[-.11,.12,-.63]]],
        kneeR:[[0,[-.11,.07,-2.08]],[.5,[-.11,.07,-2.08]],[1.3,[.11,.10,-2.08]],[1.9,[.11,.12,-2.08]],[2.45,[.11,.12,-1.75]],[3.0,[.11,.12,-1.43]],
          [3.55,[.11,.12,-1.11]],[4.1,[.11,.12,-.63]]],
        heelL:[[0,[.12,.12,-2.55]],[.5,[.12,.12,-2.55]],[1.3,[-.12,.05,-2.55]],[1.9,[-.12,.05,-2.55]],[2.45,[-.12,.05,-2.22]],[3.0,[-.12,.05,-1.90]],
          [3.55,[-.12,.05,-1.58]],[4.1,[-.12,.05,-1.10]]],
        heelR:[[0,[-.12,.12,-2.55]],[.5,[-.12,.12,-2.55]],[1.3,[.12,.05,-2.55]],[1.9,[.12,.05,-2.55]],[2.45,[.12,.05,-2.22]],[3.0,[.12,.05,-1.90]],
          [3.55,[.12,.05,-1.58]],[4.1,[.12,.05,-1.10]]],
      }) }),
      // The first person shows his legs (and jacket) from legsFromS of the haul on (the head coming forward to look down
      // his body) and into the hand-over until legsUntilS (the head tipping back to look at Luo).
      legsFromS:1.7, legsUntilS:.3,
      // The first person's neck sits downM under the eye and backM behind it along the level look (the spine hangs from
      // it: the jacket's cut collar stays out of the lens, the chest ~0.17 m under it looking down the body).
      neck:Object.freeze({ downM:.20, backM:.16 }) }),
    // 2026-09-29 (user: 「在这里直接做一个班长把枪递交到我手上然后直接开打的动作……而不是要我自己还要捡起来」「结束动画的时候玩家
    // 应该是站立的而不是半蹲」): LuoHandRifle (HandRoot = the haul's root chained onto it). 「还能打不？」 starts lineDelayS after the
    // clip's "offered" event, he nods for nodS after it and the hold loop lets go; the palms reach for the rifle from reachS
    // before "handed"; the hand-back follows the clip's end (releaseGraceS more for a vanguard man missing from the enemy
    // table). standIn: as rescue.drag.standIn (its root is the haul's root while neither clip is baked).
    // carryS: the taken rifle comes from where Luo held it to the gear-up's end (Data_OpeningFirstPersonGear: the rifle at the
    // ready in both hands), about where the game's own rifle comes up at the hand-back, so the swap at Released does not throw
    // the gun across the picture.
    hand:Object.freeze({ lineDelayS:.2, nodS:.8, reachS:.3, carryS:.8, releaseGraceS:1,
      standIn:Object.freeze({ durationS:4.8, offerS:1.9, handedS:3.1, holdLoop:Object.freeze([1.9,2.9]), body:Object.freeze({
        eye:[[0,[0,.33,.67]],[.25,[0,.33,.67]],[.5,[0,.36,.67]],[1.2,[0,.62,.62]],[1.7,[0,1.10,.55]],[3.3,[0,1.10,.55]],[4.2,[0,1.62,.52]]],
        gaze:[[0,[0,-.34,-.94]],[.25,[0,1,-.05]],[.5,[0,.7,.71]],[.85,[0,.45,.89]],[1.2,[0,.1,1]],[1.7,[0,0,1]],[3.3,[0,-.1,1]],[4.2,[0,-.05,1]]],
        crown:[[0,[0,.94,-.34]],[.25,[0,.05,1]],[.5,[0,-.71,.7]],[.85,[-1,0,0]],[1.2,[0,1,-.1]],[1.7,[0,1,0]]],
        chest:[[0,[0,.2,.22]]], pelvis:[[0,[0,.12,-.15]]],
        kneeL:[[0,[-.11,.12,-.63]]], kneeR:[[0,[.11,.12,-.63]]], heelL:[[0,[-.12,.05,-1.10]]], heelR:[[0,[.12,.05,-1.10]]],
        rifle:[[0,[.4,1.2,1.3]],[1.9,[0,.85,1.0]],[3.1,[0,.85,.95]],[4.2,[0,1.2,.9]]],
        rifleMuzzle:[[0,[.8,1.27,1.3]],[1.9,[.4,.92,1.0]],[3.1,[.4,.92,.95]],[4.2,[.4,1.27,.9]]],
        rifleUp:[[0,[.4,1.3,1.3]],[1.9,[0,.95,1.0]],[3.1,[0,.95,.95]],[4.2,[0,1.3,.9]]],
      }) }) }),
    // He goes to the trench edge east of the hand-back with his rifle once he has let the timber drop (Aftercut). 2026-09-29:
    // 1.1 m further east than for the old seat -- the hand-back now stands at x ~3.3, and at (3.6,-124.3) He's raised rifle
    // was across the right of the first view.
    heCover:P(4.7,-124.25,-1.3),
    // The director's framing over the rescue clips' player track (OpeningStoryboards.RescueView). lookWarp: [t, clip time]
    // for the gaze and crown only (the eye stays on the clip): the drag's look back up at Luo and over the top to the boots
    // goes by 1.75 s instead of 2.1 (Luo leans in 0.12 m over the lens to hook the arms at 1.8); the hand-over's head tipping
    // back and the roll onto all fours by 0.7 s instead of 1.2 (up under Luo standing there). upAtLuo: the look lifts toward
    // Luo's chest (luoChestDropM under his head, at most upAtLuoMaxDeg up) while Shunzi gets up onto his knees; atRifle: down
    // at the rifle held out and taken; haulBackM: the eye eased back while Luo stoops in to haul him up by the strap (his
    // head came to 0.2 m).
    view:Object.freeze({ dragLookWarp:Object.freeze([[1.3,1.3],[1.75,2.1],[2.1,2.1]]),
      handLookWarp:Object.freeze([[0,0],[.3,.5],[.7,1.2],[1.2,1.2]]),
      upAtLuo:.7, upAtLuoS:Object.freeze([.6,1.0]), upAtLuoMaxDeg:35, luoChestDropM:.35, atRifle:.6, haulBackM:.14 }),
    // The mission rifle lies in the mud at his left front, out of reach while he is pinned (stock toward him); Luo picks it
    // up on his way to the haul (LuoPickUpRifleSling's prop starts where it lies). Prop yaw: the muzzle points along
    // (-sin yaw, -cos yaw).
    rifleMouth:P(2.6,-125.95,-120*Math.PI/180),
    // 「还权后 3 s 内玩家不掉血」 (contract §2.9): at the hand-back every live Japanese within handbackHoldFireM holds his fire
    // this long (the AI's hesitation: no fire, no move); Script_FirstLevelCampaignOpening asserts it.
    handbackHoldFireS:3.5, handbackHoldFireM:40,
    // The charging men who ran on east are removed out of sight (or at the latest this long after the hand-back).
    extrasRetireS:30,
  }),
  // ---- storyboard shots (contract docs/Data_FirstLevelStoryboard0103Contract.md §5, read by
  // Script_OpeningStoryboardShots.mjs) ----------------------------------------------------------
  // Each shot: the moment in the real 01–02 flow (phase + age, or a `when` expression over the director s,
  // the runtime r and window.Tengxian g), the storyboard picture (REL/附件/storyboard, not in the repository)
  // and the part of its picture criteria that the staging and the camera decide: screen x / y are 0..1 of
  // the 1280×720 frame (left -> right, top -> bottom), head points; points = world landmarks [x, h over
  // ground, z]; absent = roles that must be out of the picture; inFrameAtLeast = how many of a group are seen.
  storyboardShots:Object.freeze([
    // SB01 at the far call (BunkerRunnerCall.01 has been going 0.8 s; 2026-09-29): the runner is 20+ m off in the rear trench,
    // out of the picture, heard and not seen; the dugout as in SB01 (the men who go up to the front still stand in the trench
    // behind Luo, covered by him: not judged here). Shots are taken in flow order: this one first.
    Object.freeze({ id:"SB01_Call", storyboard:"Storyboard_01_CaveResupply.png",
      when:"s.phase==='Orders'&&s.flags.runnerCallAt!=null&&r.time-s.flags.runnerCallAt>=.8&&s.flags['scene:BunkerOrders']==null",
      judge:{ camera:{ eyeM:[.85,1.05], pitchDeg:[-20,-9], yawDeg:[-101,-85] }, horizonY:[.16,.34],
        points:{ mouthPostN:{ at:[1.05,1.0,-127.5], x:[.2,.4] }, mouthPostS:{ at:[1.05,1.0,-124.3], x:[.64,.84] } },
        actors:{ yaowa:{ x:[0,.34] }, luo:{ x:[.4,.64] }, comrade:{ x:[.64,1],woundMax:0,faceBloodMax:0 } },
        absent:["runner"], rifleHidden:true } }),
    // SB01: the order comes in (BunkerOrders.01): mouth x 0.30–0.74, Yaowa left third, Luo's back in the middle, the wounded
    // comrade right, men going away down the trench. 2026-09-29 (user: 「在地道门外就和班长可以说话了，而不是一定要走到屋里才说话」):
    // the runner reports from OUTSIDE the mouth, on the trench floor at banter.runnerRoute's end (3.05,-124.5), 5.3 m from the
    // eye, to the right of Luo (x 0.55–0.75, was 0.2–0.5 at the north post inside), clear of Luo's head (0.543) and of the south
    // post (0.77); he faces Luo. Taken 2.2 s into BunkerOrders.01 (was 1.2 s): the men going up to the front set off on his
    // second call, and only from about 2 s into the report do two of them show past Luo's back (1 s in, they are lined up
    // behind each other and behind him: measured at 0.3–3.0 s, tmp plan, 09-29).
    Object.freeze({ id:"SB01", storyboard:"Storyboard_01_CaveResupply.png",
      when:"s.phase==='Orders'&&s.flags['scene:BunkerOrders']!=null&&r.time-s.flags['scene:BunkerOrders']>2.2",
      judge:{ camera:{ eyeM:[.85,1.05], pitchDeg:[-20,-9], yawDeg:[-101,-85] }, horizonY:[.16,.34],
        points:{ mouthPostN:{ at:[1.05,1.0,-127.5], x:[.2,.4] }, mouthPostS:{ at:[1.05,1.0,-124.3], x:[.64,.84] } },
        actors:{ yaowa:{ x:[0,.34] }, runner:{ x:[.55,.75], distM:[4.5,6.2] }, luo:{ x:[.4,.64] }, comrade:{ x:[.64,1],woundMax:0,faceBloodMax:0 } },
        actorSeparation:{ roles:["luo","runner"], headXMin:.06, rootMMin:1.2 },
        inFrameAtLeast:[{ roles:["DepthNra"], count:2, minDistM:8 }], rifleHidden:true } }),
    // SB02: the near miss, mirrored (contract §2.2): tilted ≥ 12° head to the left, low, the north post and the
    // dugout's north wall on the left, the mouth and the blast on the right; the eyes still open.
    // The post's base stands on the bank (0.23 m over the dugout floor): postNBase is 0.3 m over the ground at its south
    // face, lintelN the lintel's underside near its north end (1.75 m over the floor).
    Object.freeze({ id:"SB02", storyboard:"Storyboard_02_NearMissBlast.png", phase:"Blast", age:.7,
      judge:{ camera:{ eyeM:[.6,.95], pitchDeg:[-20,-2], rollDeg:[12,26], yawDeg:[-78,-54] }, eyeClosure:[0,.2],
        points:{ postNBase:{ at:[1.05,.3,-127.33], x:[.3,.6], y:[.25,.75] }, lintelN:{ at:[1.05,1.75,-126.9], x:[.4,.8], y:[0,.3] } } } }),
    // 2026-09-27 rework: first person from the pinned eye (shunzi.witnessEye) through the whole questioning of the
    // comrade and the throat cut (no cut-away camera any more).
    Object.freeze({id:"SB03_Drag",when:"s.phase==='CaptiveDragged'&&r.time-s.flags.dragStart>=2.25",
      judge:{camera:{eyeM:[.2,.36],yawDeg:[-104,-72]},actors:{comrade:{x:[.2,.8],distM:[1.6,3]}}}}),
    Object.freeze({id:"SB03",phase:"Interrogation",age:3,
      judge:{camera:{eyeM:[.2,.36],yawDeg:[-104,-72]},
        actors:{ijaA:{x:[.2,.8]},comrade:{x:[.15,.7],distM:[1.8,2.9],woundMin:10,faceBloodMin:.9},interpreter:{x:[.4,1],distM:[2.5,4.2]}}}}),
    // The blade across the throat, seen from his side (the throat turned toward the eye).
    Object.freeze({id:"SB03_Blade",when:"s.flags.slashCutDue!=null&&r.time>=s.flags.slashCutDue-.06",
      judge:{camera:{eyeM:[.2,.36]},actors:{comrade:{x:[.2,.8],woundMin:10,faceBloodMin:.9},ijaA:{x:[.15,.85]}}}}),
    Object.freeze({id:"SB03_Slash",when:"s.flags.throatCut!=null&&r.time-s.flags.throatCut>=.3",
      judge:{camera:{eyeM:[.2,.36]},actors:{comrade:{x:[.2,.8],woundMin:10,faceBloodMin:.9},ijaA:{x:[.15,.85]}}}}),
    Object.freeze({id:"SB03_FlagKick",when:"s.flags.flagKickAt!=null&&r.time-s.flags.flagKickAt>=.3",judge:{flagProgress:[0,.1]}}),
    Object.freeze({id:"SB03_FlagDown",when:"s.flags.flagKickAt!=null&&r.time-s.flags.flagKickAt>=1.6",judge:{flagProgress:[.99,1]}}),
    // 「还藏着一个」: ijaA walking off from the kill stops over the pinned man.
    Object.freeze({id:"SB04_Found",when:"s.flags.foundAt!=null&&r.time-s.flags.foundAt>=.5",
      judge:{camera:{eyeM:[.2,.4]},actors:{ijaA:{x:[.25,.75],distM:[.6,1.6]}}}}),
    // The first slap (2026-09-29: the moment the head is up in his fist, before 「这个也问！」): the view flung to the
    // right, the left of the picture swimming.
    Object.freeze({id:"SB05_Slap",when:"s.flags.slapAt!=null&&r.time-s.flags.slapAt>=.12",judge:{camera:{eyeM:[.25,.55]}}}),
    // Held up by the hair: ijaA's face close above the middle, the interpreter squatting at the right.
    Object.freeze({id:"SB05_Held",phase:"Ask",age:1,
      judge:{camera:{eyeM:[.3,.55],pitchDeg:[5,42]},actors:{ijaA:{x:[.25,.7],distM:[.3,1]},interpreter:{x:[.45,1],distM:[.8,1.8]}}}}),
    // The charge over the crater step (right of the picture).
    Object.freeze({id:"SB05A_Charge",phase:"Charge",age:1.6,judge:{camera:{eyeM:[.2,.45]},inFrameAtLeast:[{ roles:["luo","heyoutian","Charge"], count:2 }]}}),
    // He's parry and cut on ijaA beside him.
    Object.freeze({id:"SB05A_HeChop",when:"s.flags.heChopAt!=null&&r.time-s.flags.heChopAt>=.8",judge:{actors:{heyoutian:{distM:[.6,3]}}}}),
    // 2026-09-29: rolled onto his back, up at Luo upside down as he hooks his arms under the armpits (no judge: the picture
    // is looked at).
    Object.freeze({id:"SB05B_RolledOver",when:"s.flags.dragAt!=null&&r.time-s.flags.dragAt>=1.45",judge:{camera:{eyeM:[.12,.6]}}}),
    // Hauled out under the arms: down his own body at his boots coming out from under the timber He holds up.
    Object.freeze({id:"SB05B_Haul",when:"s.flags.dragAt!=null&&r.time-s.flags.dragAt>=3.0",judge:{camera:{pitchDeg:[-50,-12],eyeM:[.35,.75]}}}),
    // SB06 (Check, 「还能打不？」): up on his knees facing Luo, who holds the rifle out across him (the look down at it:
    // rescue.view.atRifle).
    Object.freeze({ id:"SB06", storyboard:"Storyboard_06_RifleReturned.png",
      when:"s.phase==='Check'&&s.flags.handAt!=null&&r.time-s.flags.handAt>=2.3",
      judge:{ camera:{ eyeM:[.85,1.3], pitchDeg:[-35,8] }, actors:{ luo:{ distM:[.35,1.3], headOptional:true } } } }),
    // The rifle in his hands, being hauled up.
    Object.freeze({ id:"SB06_Hand", storyboard:"Storyboard_06_RifleReturned.png",
      when:"s.flags.handedAt!=null&&r.time-s.flags.handedAt>=.4", judge:{ camera:{ eyeM:[.9,1.75] } } }),
    // The hand-back: standing, about level, facing east down the trench (contract §2.9; 2026-09-29 standing, not crouched).
    Object.freeze({ id:"SB06_Released", storyboard:"Storyboard_06_RifleReturned.png", when:"s.releaseAt!=null",
      judge:{ camera:{ pitchDeg:[-15,5], yawDeg:[-110,-70], eyeM:[1.5,1.75] } } }),
  ]),
  // Wave 1 stand-ins (contract §3): where a clip, hand pose, lens effect, set piece or blast effect of another
  // package belongs, the director uses the nearest existing one and lists it here. Wave 2 wires each entry to
  // the named replacement and removes it; the list must then be empty (Script_OpeningStoryboardsTest).
  pendingWiring:Object.freeze([
    // SB01 (Banter / Orders)
    // 2026-09-26 user: the runner reports to Luo, not to Shunzi -- he faces Luo (PhaseOrders). RunnerLeanPostCall is
    // baked facing into the room (yaw 80 deg = at the camera); wiring it needs a take aimed at Luo in the mouth.
    // 2026-09-29: he reports from outside the mouth, out in the open on the trench floor 1.8 m from Luo: there is no post at his
    // mark for RunnerLeanPostCall's hand, so the entry is now a take of him catching his breath and calling to Luo in the open.
    {shot:"SB01", what:"the runner, out of breath, calls to Luo outside the mouth (after the far call)",
      now:"MessengerReport at runnerRoute's end (3.05,-124.5) facing Luo (PhaseOrders, BunkerRunnerCall before it)", wave2:"an Anim take of him bent over catching his breath and calling to Luo (RunnerLeanPostCall was baked leaning on a door post, facing the room)"},
    {shot:"SB01", what:"Luo kneels in the mouth looking out down the trench",
      now:"LuoKneelCheck held at banter.luoKneelS (its kneel loop; the reach arm shows) in Tableau/PhaseOrders", wave2:"a native kneel (KneelHold/RifleIdle, contract §4.1): needs an Anim-owned hook -- a director request that passes kneel:1 through Script_OpeningStoryboardAnimation's Move state (now forced to 0) and is exempt from ResolveOpeningActorPose's Banter/Orders Luo substitution"},
    {shot:"SB01", what:"north-wall crate stack, foreground crate, duckboards and revetment of the front trench",
      now:"nothing (bare earth)", wave2:"OpeningSet props bunkerCrateStackN, bunkerCrateFront, duckboardsFront, revetmentFront (Set)"},
    // SB02 (Blast)
    {shot:"SB02", what:"mud, clods and splinters blown into the dugout from the south lip of the mouth, on the right",
      now:"FireShell at banter.shellAt only (the crater, not seen from inside) in Blast()", wave2:"OpeningBlastFx.DirectionalBlast((1.2,-124.5) toward the north-west) at blastShot.fallStartS (Set)"},
    {shot:"SB02", what:"the lintel's south end falls in the mouth 0.25–0.6 s and stays",
      now:"nothing falls", wave2:"OpeningSet.FallLintel(progress) / fallenLintel over Blast (Set)"},
    {shot:"SB02", what:"strong chromatic aberration, radial edge blur, heavier vignette",
      now:"the existing concussion blur/ghost only", wave2:"OpeningLens.Evaluate(phase, age, events) into Perception().lens (Eye)"},
    {shot:"SB02", what:"right hand flung open toward the mouth, the loading rifle sliding out of the foreground, legs in view",
      now:"protect/limp hand keys (beats.Blast); the loading rifle vanishes at 0.12 s; the mission rifle is hidden until Black (ApplyCamera)", wave2:"EXTRA_HAND_POSES.flingOpen, FP_PROPS.loadingRifleOnLegs.rifleSlide and LEG_POSES.sprawl in beats.Blast (Eye)"},
    {shot:"SB02", what:"sandbag wall, poster, lit lantern and crates on the dugout's north wall (left of the frame)",
      now:"nothing (bare earth)", wave2:"OpeningSet props bunkerSandbagWallN, bunkerPoster, bunkerLantern, bunkerCrateStackN (Set)"},
    // SB06 (Check, Released)
    {shot:"SB06", what:"Liu kneels aiming east at the trench edge; He kneels at the right edge with his rifle",
      now:"standing while the director poses them (the director's Move hands the native layer kneel:0); kneeling (AI stance 1) from the hand-back", wave2:"the Anim-owned kneel hook for director poses (as SB01's Luo) for Liu and He from their arrival"},
  ].map(Object.freeze)),
  // ---- 02 pursuit (bunkerPursuit, contract §5.8) -----------------------------------------
  // The roster's delayS (Space) are scaled so the three followers are in the trench the player just left
  // while he looks back from the rear corner (review 09-24: at delayS as authored one man showed, 12 m off).
  pursuit:Object.freeze({ delayScale:.35, speedMps:3.2, retireMps:3, retireMaxS:40 }),
  // ---- 02 withdrawal (RearTrench) --------------------------------------------------------
  withdraw:Object.freeze({
    // The way out: seat -> crater step (exposed to F) -> SSW leg -> RC. lane[0] is Luo's (he comes from the hand-over round
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
