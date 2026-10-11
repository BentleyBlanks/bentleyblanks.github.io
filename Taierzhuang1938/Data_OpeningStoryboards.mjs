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
  version:"20261011OpeningStoryboardsV24Redraft", animationBase:"./Animation/OpeningStoryboards/",
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
      "IjaReleaseSheathe",
      // 2026-09-30 「日军的动作有问题」: the questioning at the collar (was the legacy CollarControl: the rifle in his hand, the fist a hand's breadth off the collar).
      "IjaCollarQuestion",
      // 2026-09-30 self rescue (docs/Data_OpeningSelfRescue20260930.md): the three shot in the arm by the volley, Luo snatching up
      // the rifle and shoving it into Shunzi's hands.
      "IjaShotStaggerAway","IjaShotDropRifle","InterpreterShotStagger","LuoGrabRifleShove",
      // 2026-10-11 redraft, AnimA (docs/Data_OpeningRedraft20261011Contract.md §4.2 row A, P0): the dugout six, the sweep's third
      // body, the rifle / badge / thumb beats at the captive wall.
      "YaowaCrouchCatchEat","ComradeEatBreadToss","ComradePourRoundsLaugh","ComradeCatchDropPick","HeHelmetSleepSitUp",
      "LiuDivideAmmoToss","IjaStompStabTwist","CorpseStabbedClaw","IjaInspectRifleBoltToss","IjaTearBadge",
      "IjaThumbWoundTwist","CaptiveArchCaught",
      // ... and P1: Liu shoulders the crate, the walking stab, the corner grenade, the three drops into the trench, the machine-gun pair.
      "LiuBoxUpGo","IjaWalkStabProne","IjaGrenadeKnockThrow","IjaDropInKneel","IjaDropInStand","IjaDropInPoint",
      "IjaProneLmgOnCorpse","IjaKneelLoadLmg",
      // 2026-10-11 redraft, AnimB (docs/Data_OpeningRedraft20261011Contract.md §4.2 B rows): the bayonet practice, the throat cut from
      // behind with the knee, the wipe and the bayonet fixed, the finishing stabs, the boot on Shunzi's hand, the recruit's cut across
      // his cheek and the levelled rifle, ijaA biting the grenade's pin.
      "IjaSlapRecruit","IjaRecruitSlapped","IjaRecruitChargeThrust","CaptiveStabbedCurl","IjaHairLiftKneeBack","CaptiveCurledPulledUp",
      "IjaThroatCutKneeShove","CaptiveThroatCutForward","IjaWipeBandageFixBayonet","IjaFinishWalkStab","IjaBootOnHand",
      "IjaRecruitCheekCut","IjaRecruitLevelRifle","IjaGrenadeBitePin"],
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
  // 2026-09-30 (docs/Data_OpeningSelfRescue20260930.md; replaces the 09-29 haul by Luo): Charge = a volley wounds the three
  // over him (arms hanging, no rifle raised again), Melee = Luo and two of the company cut them down; Lift = He heaves the
  // timber up and Shunzi heaves himself out onto his knees; Check = Luo, standing over him, asks 「还能打不？」, at the nod
  // snatches up the rifle lying there and shoves it into his hands, and he gets up; the hand-back is standing with it.
  // 2026-10-11 Notion redraft (docs/Data_OpeningRedraft20261011Contract.md §2, the one table): 01 opens in the black on Yaowa
  // counting the shells (Count) and fades up on the dugout; after the blast the vanguard drops into the front trench off its
  // north rim (DropIn), ijaB bayonets the bodies down the trench (Sweep), the comrade is questioned with the machine gun set up
  // behind them (CaptiveWall), given to the recruit to practise on (Practice) and finished by ijaA (Slash), who walks on
  // bayoneting the dead to the mouth (Finish) and treads on Shunzi's hand (Found). FrontPass and Taunt are retired.
  phases:Object.freeze({
    Trapped:Object.freeze(["Count","Banter","Orders","Incoming","Blast","Black","Wake","DropIn","Sweep","CaptiveDragged","CaptiveWall",
      "Interrogation","Practice","Slash","Finish","Found"]),
    BunkerRescue:Object.freeze(["Hold","Ask","Blade","Charge","Melee","Lift","Check","Released"]),
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
    // 2026-10-11 redraft: ordersExitS now runs from the clips thrown (clipsThrown: the gear-up starts there), exitTossS from Luo's
    // order to the toss forced; countExtraS past Count's estimated length; dropInS the vanguard on its posts and the fold cleared;
    // sweepS ijaB at his stop; draggedS / wallS / practiceS / slashS / finishS / foundS each phase's own beats forced to the end.
    countExtraS:6, banterExtraS:8, runnerArriveS:16, ordersSlackS:3, exitTossS:9, ordersExitS:9, blastEventS:3.5, blackS:3.0, wakeS:5.8,
    dropInS:16, sweepS:24, draggedS:22, wallS:20, practiceS:26, slashS:24, finishS:16, foundS:8,
    // interpreterCallS: from ijaB's call (InterpreterCall) until the drag may start without it having ended.
    walkInS:12, interpreterCallS:6, interrogationExtraS:10, foundWalkS:10,
    // holdLineS: the questioning's lines (each gate); askS: the whole questioning; chargeS: the rescuers reach their marks
    // (a late man is put there); meleeS: the cuts landed; liftS: Luo's walk, the rifle pickup and the haul done (a stalled
    // clip is played out); checkS: the question and the nod before the hand-over goes on without them.
    // 2026-10-11: bladeWalkS the recruit's walk to the pinned man (a late walker is put there); bladeS the whole Blade phase
    // (the cut, 「说话！」 and his three steps back) before the charge breaks in anyway.
    holdLineS:8, askS:24, bladeWalkS:3.5, bladeS:14, chargeS:4.5, meleeS:7, liftS:16, luoArriveS:7, heArriveS:7,
    longShotRetryS:4, longShotForceS:8, checkS:9, contactKillS:.35,
    // 02 -> 03: Yaowa catches up (else the scene starts where he is), the guard's run up the sap.
    collectionMeetS:8, guardArriveS:10,
  }),
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
    // 2026-10-11 redraft (contract §2): Wake through Ask, every new phase among them, and 02's Blade.
    headLook:Object.freeze({ maxRad:.14, returnS:.6,
      free:Object.freeze(["Wake","DropIn","Sweep","CaptiveDragged","CaptiveWall","Interrogation","Practice","Slash","Finish","Found","Hold","Ask","Blade"]),
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
    // 2026-10-11 「冬瓜扶着墙起身，冲顺子伸手……顺子把压好的两夹丢过去」 (Orders, before the gear-up): both arms leave the fill clip
    // over `weight` (s: in, out) on the clock flags.tossAt, through `keys` [t, pose] (both hands; the left mirrors), and the two
    // chargers leave the palms at releaseS (flags.clipsThrownAt = tossAt + releaseS) toward the comrade's reaching hand; one is
    // caught, the other falls short at his feet (clipFlight). Pending wiring: a baked first-person throw (N04).
    // (weight in over 0.7 s: at 0.25 s the left palm turned 15 deg a frame leaving the clip, over the 12 deg continuity gate.)
    toss:Object.freeze({ weight:Object.freeze([.7,.55]), releaseS:.88, endS:1.85,
      keys:Object.freeze([Object.freeze([0,"tossHold"]),Object.freeze([.62,"tossHold"]),Object.freeze([.88,"tossThrow"]),Object.freeze([1.3,"tossThrow"])]) }),
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
        // 2026-10-11 redraft, 01 (Dir01). 「顺子把压好的两夹丢过去」 (Orders, firstPerson.toss, laid over the seated fill clip): both
        // fists come up off the charger to the chest holding a clip each (tossHold), then fling open toward the comrade at the
        // right front (tossThrow, mirrored: the two hands part, as in storyboard N04).
        tossHold:H("cam",[.11,-.27,-.31],[-.2,.15,-1],[.3,.9,.1],[55,70,50]),
        tossThrow:H("body",[.27,-.2,-.5],[.3,.12,-1],[0,1,0],[6,8,6]),
        // 「军靴落下来，踩住顺子伸在泥里的那只手……手指自己抽了一下」 (Found): flat on the mud where flatFwd hovered (the look is
        // pitched down at it then), the fingers spread; the flinch curls them for a beat.
        flatPinned:H("ground",[.13,.02,-.38],[.05,-.25,-1],[0,1,0],[8,14,8]),
        flatPinnedFlinch:H("ground",[.13,.025,-.37],[.05,-.3,-1],[0,1,0],[42,56,36]),
      }),
      // Seated (Banter, Orders until Luo's order): the whole body plays the baked fill clip (`fill`, BlenderMCP:
      // _import/Script_OpeningStoryboardClips.py ShunziSitFillCharger) on an ammo crate at the seat -- the rounds one by one
      // from the belt pouch into the charger in the left hand, the rifle across the lap -- one clock from Banter on, so the hands never
      // stop at a phase change (09-27 review: the two held palm poses read as frozen hands). Orders' exit signal hands
      // over to the gear-up (Data_OpeningFirstPersonGear) in OpeningFirstPerson.
      beats:Object.freeze({
        // 2026-10-11: the count in the black already sits on the fill clip (one clock from the first seated frame on).
        Count:Object.freeze({fill:"ShunziSitFillCharger",props:Object.freeze(["fillCharger","fillRound","fillRifle","fillSeat","packRest"])}),
        Banter:Object.freeze({fill:"ShunziSitFillCharger",props:Object.freeze(["fillCharger","fillRound","fillRifle","fillSeat","packRest"])}),
        Orders:Object.freeze({fill:"ShunziSitFillCharger",props:Object.freeze(["fillCharger","fillRound","fillRifle","fillSeat","packRest"])}),
        Blast:K([0,"protect","protect"],[.4,"protect","protect"],[.8,"limp","limp"]),
        Black:K([0,"limp","limp"]),
        // 「他试着撑起身体。背包带一下绷紧……又落回地面。手指在泥里抓出一道痕。」
        Wake:K([0,"limp","limp"],[1.05,"flat","flat"],[1.2,"push","push"],[1.8,"push","push"],[2,"flat","flat"],[2.2,"flat","clawIn"],[3,"flat","clawOut"]),
        // 2026-10-11: the vanguard drops in; the clawing hand goes still and slides forward into the lower right (N07-N16).
        DropIn:K([0,"flat","clawOut"],[.6,"flat","flat"],[2.2,"flat","flatFwd"]),
        Sweep:K([0,"flat","flatFwd"]),
        CaptiveDragged:K([0,"flat","flatFwd"]), CaptiveWall:K([0,"flat","flatFwd"]), Interrogation:K([0,"flat","flatFwd"]),
        Practice:K([0,"flat","flatFwd"]), Slash:K([0,"flat","flatFwd"]),
        // Shamming dead from the moment ijaA sets off (rescue.playDead, flags.playDeadAt): the hands lie still in the mud.
        Finish:K([0,"flat","flatFwd"]),
        // 「军靴落下来，踩住顺子伸在泥里的那只手，鞋跟往下一碾……手指自己抽了一下」: clock flags.bootStepAt (the boot comes
        // down); the right hand flat on the mud under it, the fingers flinch once and lie still again through the grind.
        Found:KC("bootStepAt",[-1,"flat","flatFwd"],[-.35,"flat","flatPinned"],[0,"flat","flatPinned"],[.08,"flat","flatPinnedFlinch"],[.3,"flat","flatPinned"]),
        // Held up by the hair (ijaA's left fist), pinned at the hips: still shamming, the hands lie where they are until the
        // first slap wakes him (wokenAt); then both hands strain against the mud, the fingers clawing (a hand held up to
        // ijaA's forearm sat 0.2 m off the lens and filled a third of the picture).
        Hold:KC("wokenAt",[-1,"flat","flatFwd"],[0,"push","clawIn"],[.35,"push","push"]),
        Ask:K([0,"push","push"],[1.6,"push","clawIn"],[2.6,"clawIn","push"],[4,"push","push"]),
        // 2026-10-11 Blade (clock: the cut, flags['cut:cheek']): straining against the mud as the blade comes to his cheek, the
        // fingers clawing into it on the cut, then pushing again.
        Blade:KC("cut:cheek",[-1,"push","push"],[0,"push","clawIn"],[.35,"clawIn","clawIn"],[1.6,"push","push"]),
        // The charge: he is dropped (hair let go; ijaA is shot at rescue.wound .48 s) and the hands go flat in the mud, then claw
        // as he tries to see.
        Charge:K([0,"push","push"],[.55,"flat","flat"],[1.7,"flat","clawIn"]),
        Melee:K([0,"flat","clawIn"],[.8,"flat","flat"]),
        // 2026-09-30 (docs/Data_OpeningSelfRescue20260930.md), clock on the heave (rescue.heave): straining against the mud
        // while He gets the timber up, braced on both hands, the lunge forward onto them, clawing a pull, pushing up onto his
        // knees; up on his knees (rest) -- from the hand-over the hands are on the rifle (OpeningStoryboards.HeldRifle, not a beat).
        Lift:KC("heaveAt",[-1,"flat","clawIn"],[0,"push","push"],[.55,"push","push"],[.75,"flatFwd","flatFwd"],[1.1,"clawIn","clawIn"],
          [1.4,"push","push"],[2.0,"push","push"],[2.4,"rest","rest"]),
        Check:KC("handAt",[0,"rest","rest"]),
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
    // 2026-10-11 (contract §2): Count 0, DropIn .8, Sweep .7, Practice .48, Finish .5 (01, Dir01); Blade .46 (02, Dir02).
    base:Object.freeze({ Count:0, Banter:0, Orders:0, Incoming:0, Blast:.95, Black:.95, Wake:.9, DropIn:.8, Sweep:.7, CaptiveDragged:.6,
      CaptiveWall:.55, Interrogation:.5, Practice:.48, Slash:.42, Finish:.5, Found:.5, Hold:.48, Ask:.46, Blade:.46, Charge:.42, Melee:.4,
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
  // The vanguard that must really be down before the hand-back. 2026-10-11 (docs/Data_OpeningRedraft20261011Contract.md §1.12,
  // 「还权前确认甲、丁、翻译、岔口的乙、折角的丙和机枪组两人均已死亡」): ijaA by Luo's dadao, ijaB at the junction by Liu Wencai,
  // ijaC at the fold by the rifles on the crater step, ijaD (the recruit) and the machine-gun crew by the volley. The
  // interpreter is checked apart (rescue.cuts). A man missing from the enemy table is let pass (Release `absent`).
  vanguardIds:["BunkerExecutionerA","BunkerExecutionerB","BunkerFollowA","BunkerFollowB","BunkerGunner","BunkerLoader"],
  // 2026-10-11: the machine-gun pair (bunkerAssault BunkerGunner / BunkerLoader, contract §1.7) and the man who shams dead in
  // the front trench (victim: the director's own NRA spawn, cast id SweepVictim, not in a roster).
  cast:Object.freeze({ ijaA:"BunkerExecutionerA", ijaB:"BunkerExecutionerB", ijaC:"BunkerFollowA", ijaD:"BunkerFollowB",
    gunner:"BunkerGunner", loader:"BunkerLoader", victim:"SweepVictim" }),
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
    // 2026-10-11 redraft (contract §1.2, §1.19, §5.1; storyboards N01-N03): six men in the dugout, everyone's mark the
    // director's (Set keeps it clear). Why each:
    //   yaowa  (-1.0,-125.35) crouched hugging his rifle at Shunzi's south side, facing north-east (yaw 45 deg, toward the
    //          bread): the right foreground of N01/N02 (head x ~0.9 of the seat's picture, inside a metre).
    //   comradeSeat (unchanged) against the south wall facing the room (north-west): N01 x ~0.72 / N02 x ~0.88.
    //   he     (-0.6,-127.35) curled on his side along the north wall in front of the crate stack, his helmet over his face,
    //          facing east: the left edge of N01 (x ~0.1). Contract §5.1's (-2.4,-127.1) is west of the seat, 118 deg to the left
    //          of its look: out of N01's picture altogether (measured 2026-10-11, head x -0.64); moved here, off every exit line
    //          until he sits up, 0.3 m clear of bunkerCrateStackN's front.
    //   luo    (unchanged root) STANDING in the mouth, his back to the room, looking down the front trench (east): N01 x ~0.41.
    //   liu    (1.1,-124.9) crouched at Luo's feet, beside the ammo box on his right hand, facing west into the room (to
    //          throw the clip to Shunzi): N01 x ~0.5, nearer than Luo.
    // The old north-wall Yaowa and the He / Liu marks out in the trench (4.6 / 6.1) are retired.
    yaowa:P(-1.0,-125.35,45*Math.PI/180), comradeSeat:P(.35,-124.35,30*Math.PI/180), luo:P(1.75,-125.7,-Math.PI/2),
    he:P(-.6,-127.35,-Math.PI/2), liu:P(1.1,-124.9,Math.PI/2), shouter:P(8.6,-122.9),
    // Out of the dugout after the order (contract §1 / source 「刘文财啪地扣上弹药箱，扛起来就走；何有田抓起钢盔扣在头上，
    // 第一个钻出洞口；班长、传令兵、幺娃跟着撤出」): He from the far corner along the north side (clear of the seat and of
    // Yaowa) to the mouth, then exitRoute; Yaowa round the seat's east side. [id, delay s after the order, speed key, lead-in].
    exitOrder:Object.freeze([
      Object.freeze({ id:"he", delayS:0, speed:"run", via:Route([.2,-126.85],[.9,-126.1]) }),
      Object.freeze({ id:"liu", delayS:.9, speed:"walk", via:Route([1.6,-125.0]) }),
      Object.freeze({ id:"luo", delayS:1.4, speed:"walk", via:Route() }),
      Object.freeze({ id:"runner", delayS:1.6, speed:"run", via:Route() }),
      Object.freeze({ id:"yaowa", delayS:2.0, speed:"walk", via:Route([-.3,-125.45],[.9,-125.7]) }),
    ]),
    // Liu's clip in the black before the first line (event liuToss: from his right hand to Shunzi's lap, flightS), the bread
    // corner (breadToss after BunkerBanter.04: comrade's right hand -> Yaowa's right hand), the near shell (nearShell
    // nearShellAfterS after .06: the dugout jumps, the roof sheds dirt into his collar), He's roll (heRoll after .12),
    // the comrade's rounds poured at Shunzi's feet (pour heRollToPourS after it), his laugh (comradeLaugh after Ledger.06).
    beats:Object.freeze({ liuTossS:1.5, liuLineAfterS:.55, flightS:.55, breadFlightS:.6, nearShellAfterS:1.5, nearShellDirtS:.15,
      heRollAfterS:.5, heRollToPourS:1.2, laughAfterS:.15, banterEndAfterS:1.2,
      jolt:Object.freeze({ dropM:.05, rollRad:.035, decayS:.55, hz:11 }) }),
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
    dirtS:2.3, lineAfterDirtS:.9,         // (until 2026-10-11) dirt into the collar once the fade-in is up; now on nearShell
  }),
  // ---- 2026-10-11 redraft, 01 (Dir01; docs/Data_OpeningRedraft20261011Contract.md, Notion 2026-10-11) -----------------
  // Count (contract §1.3): the black before the picture. Far guns at farGunsS (s into Count, from the far-gun points), the
  // scene BunkerCount from sceneS; between its .01 and .02 a near one drops dirt from the roof (shellDirt dirtAfterLine1S after
  // .01 ends). The picture comes up (fadeInS, from Banter's start) once .03 has ended + fadeAfterS.
  count:Object.freeze({ sceneS:.9, farGunsS:Object.freeze([.15,4.4]), farGunAt:Object.freeze([P(160,-260),P(-140,-330)]),
    dirtAfterLine1S:.35, fadeAfterS:.3 }),
  // Orders after Luo's order (source 「冬瓜扶着墙起身，冲顺子伸手……顺子把压好的两夹丢过去。冬瓜单手接住一夹，另一夹掉在地上，
  // 他弯腰捡起来，往洞口挤」): the comrade rises riseAfterS after the order (WoundedRiseWall), reaches out (exitReach) at its end;
  // the toss starts tossAfterLineS after BunkerExit.01 (firstPerson.toss); one clip lands in his hand (catch: from the left
  // palm), the other falls by his feet (drop) and he stoops for it pickS; he squeezes out to comradeBlast at walkMps after .03,
  // timed to be outside as Shunzi gets to the mouth. The gear-up starts gearAfterThrowS after the clips leave the hands.
  exit:Object.freeze({ riseAfterS:.4, tossAfterLineS:.15, catchS:.45, dropAt:Object.freeze([.15,-.35]), pickS:1.1, gearAfterThrowS:.35,
    walkMps:1.5, handOffsetM:Object.freeze([0,1.05,.35]) }),
  // DropIn (contract §1.4, §5.3 dropIn.*; N07/N08): the shell going over toward the rear trench (overShell: from, to, flight s)
  // just before; whistleShort whistleS into the phase; the three on the north rim from rimS (bayonets up), then each jumps
  // (jumpS per role, fallS) from the rim to his landing. The rim and landing points are Set's (marks.dropInLip / dropInLand, 1.95 m down). ijaA points at F (pointS[0]) then J (pointS[1]); ijaC runs to F, knocks the grenade (knockS after arriving), throws
  // (throwS after the knock) over the corner; the blast at foldBlast blastAfterThrowS later; he peeks (peekS) and
  // reports (event grenadeBlast). ijaD goes to J; ijaB comes down the link sap to J from bS (walkIn's last two legs).
  dropIn:Object.freeze({ overShell:Object.freeze({ from:P(36,-150), to:P(-6.5,-112.5), flightS:1.6, beforeEndS:1.9 }),
    whistleS:.5, rimS:.75, jumpS:Object.freeze({ ijaC:1.35, ijaD:1.75, ijaA:2.25 }), fallS:.42,
    pointS:Object.freeze([2.95,3.75]), runAfterLandS:.4, knockS:.55, throwS:.75, blastAfterThrowS:1.2, peekS:1.4,
    bS:3.6, bRoute:Route([20.1,-128.0],[18.2,-125.6],[14,-124.6]),
    // ijaC at the corner facing east round it; ijaD at J facing the depth sap's mouth; ijaA's standing mark after the
    // pointing (between the landings, watching west).
    // ijaAPost against the north wall, off the eye's line to the fold (N08: the fold man not behind him).
    foldPost:P(18.2,-125.6,-Math.PI/2), junctionPost:P(14,-124.6,-2.2), ijaAPost:P(8.8,-126.0,Math.PI/2),
    grenadeFlightS:.7,
    // The look from the pinned eye down the trench at the rim they come off (N07: pitched up so the rim is under the sky).
    shot:Object.freeze({ yawDeg:-87, pitchDeg:8 }) }),
  // Sweep (contract §1.5; N09): ijaB walks west from J along the floor bayoneting the three face-down men (sweep.bodies, §5.3;
  // [2] is the live SweepVictim) at walkMps, stabMps while the downward thrust plays (stabContactS into it, stand-in
  // IjaBayonetDownThrust over the walk); at [2] he stops, the man cries out and claws (clawS), ijaB stomps (stompAfterS) and
  // stabs again, twisting (twistS) -> stab9; he stops at stopX (5 m from the eye). The thrust lands standOffM short of a body
  // (east of it, coming from J).
  sweep:Object.freeze({ walkMps:1.15, stabMps:.35, stabContactS:.55, thrustS:1.15, standOffM:.55, clawS:1.2, stompAfterS:.35,
    secondStabS:.5, twistS:.35, stopX:6.9, askAfterLine1S:2.2,
    // N09: the look follows ijaB down the trench at most followDeg off its line, pitched over the floor.
    shot:Object.freeze({ yawDeg:-92, pitchDeg:6, followDeg:14, pitchMinDeg:2, pitchMaxDeg:16 }) }),
  // CaptiveDragged (contract §1.6; N10): ijaB walks from his stop to the heap and raises his rifle to stab (raiseS) -- ijaA
  // stops him with a raised hand (haltB) -- 「这个是活的。拖出来。」; ijaB calls the interpreter (InterpreterCall, from .01's
  // end); the drag (the three 09-23 clips) dragAfterCallS after the call begins; at the wall the shove, the kneel (kneeled),
  // and the comrade's look straight at the eye for gazeS (gazeAfterKneelS in) before he looks away.
  dragged:Object.freeze({ approachMps:1.1, raiseS:.9, haltAfterS:.25, dragAfterCallS:.9, kneelAfterWallS:1.1, gazeAfterKneelS:2.4, gazeS:.6 }),
  // CaptiveWall (contract §1.7; N11/N12): ijaB to the comrade's rifle (comradeRifle, §5.2 (3.9,-125.0)), picks it up
  // (pickS), opens the bolt (boltOpen boltS after) and laughs, flings the bolt out over the south rim (tossS after the bolt
  // opens; boltTo), drops the rifle back in the mud (dropS); ijaA tears the badge (tearS into the phase, clothRip). The
  // machine-gun pair comes up from the depth sap south of J (crewFrom; enterS into the phase) dragging nothing yet (pending: the bodies are placed),
  // gets down (setupS) and fires the first burst; then a burst every burstS [min, max] s (seeded; dialogue does not stop it),
  // two rounds each, at the rear trench (burstAt), the top body jolting jolthM.
  // (2026-10-11 Set: the pair starts in the depth sap south of J, crewFrom = marks.mgDragFrom[0], and climbs the south bank to
  // the gun; they aim at marks.mgAimAt, burstAt[0].)
  wall:Object.freeze({ pickS:.9, boltS:.9, tossS:1.3, dropS:1.0, boltTo:P(5.6,-121.9), tearS:2.2, enterS:.6, crewFrom:P(14.6,-121.4),
    crewVia:Route([14.2,-122.7],[12,-123.4],[8.6,-123.3]), setupS:1.0, burstS:Object.freeze([3,6]), burstRounds:2, burstAt:Object.freeze([P(-4,-113),P(-14,-111.5),P(-2.5,-116)]),
    joltM:.02, seed:1938, endAfterBurstS:1.2 }),
  // Interrogation (contract §1 / N13): the interpreter squats in front of the comrade; ijaB presses his thumb into the shoulder
  // wound (woundPress pressAfterLine3S after .03 ends; the comrade arches archS); ijaA looks back at the rear trench now and
  // then (lookBackEveryS, lookBackS).
  // ijaAStand: ijaA standing back at the right while the interpreter questions (N13: right of the picture, x ~0.78), facing
  // the comrade.
  // He gets there by standVia and on to the practice's `aside` by asideVia, both clear of the interpreter's squat by 0.75 m+
  // (the campaign's interpreter clearance, interpreterClearanceM).
  interrogate:Object.freeze({ pressAfterLine3S:.4, archS:1.4, lookBackEveryS:6, lookBackS:1.1, ijaBPress:Object.freeze([.42,-.28,170]),
    ijaAStand:P(4.0,-123.15), standVia:Route([3.75,-124.6]), asideVia:Route([5.9,-123.4]) }),
  // Practice (contract §1.8; N14/N15): ijaA looks back (lookBackS) and says it; ijaB goes to J (relieving ijaD); ijaD trots in to
  // stand facing the comrade (front, in the comrade's frame), holds the rifle without moving (hesitateS), backhand slap
  // (slapS after he stops; recruitSlapped at the contact), 「扎。」, three steps back to `back` (backS), the charge (chargeS) and
  // two thrusts (stab1 / stab2 at stabS), the comrade collapses curled and howls (CaptiveHowl, looped), ijaD stands panting
  // pantS (recruitPant).
  practice:Object.freeze({ lookBackS:1.2, // recruitFront: the recruit before the comrade, east of him along the trench facing him (N14: right of him in the picture, not
    // between him and the eye); ijaAAside: ijaA at the recruit's right rear, facing him.
    recruitFront:P(5.0,-125.6), ijaAAside:P(5.6,-124.85),
    hesitateS:1.2, slapS:.4, backS:1.3, chargeS:.55, stabS:Object.freeze([.15,1.25]), pantS:1.5,
    recruitBack:P(6.26,-125.75), recruitWait:P(3.9,-124.3,Math.PI/2), howlEveryS:2.2 }),
  // Slash (contract §1.8; N16/N17): ijaA shoves ijaD aside (shoveS), draws the bayonet, lifts the comrade by the hair
  // (hairLifted), cuts (cutStart at the draw's end; the cut at IjaThroatSlash's contact), shoves him forward with the knee
  // (shove shoveAfterCutS after the cut), wipes the blade twice (wipe1/wipe2) and fixes it on his rifle (fix -> bayonetFixed);
  // ijaD nods (recruitNod nodAfterLine7S after .07 ends).
  slash:Object.freeze({ shoveS:1.0, shoveAfterCutS:.9, wipeS:Object.freeze([.35,.85]), fixS:.55, nodAfterLine7S:.3 }),
  // Finish (contract §1.9; N18): ijaA with his rifle, bayonet down, from the comrade along the floor bayoneting the two at the
  // mouth (finish.bodies, walkMps; the downward thrust as in the sweep) to where Shunzi lies; the interpreter moves to the
  // squat 02 starts from (rescue.interpreter).
  // interpreterVia: the interpreter's way from his questioning mark to rescue.interpreter round the south of the recruit
  // (practice.recruitWait), 0.85 m+ off him (straight through rescue.interpreterReturn he was held up behind him, 2026-10-11).
  finish:Object.freeze({ walkMps:1.0, stabMps:.3, standOffM:.5, maxPitchDeg:12, interpreterVia:Route([4.4,-123.3],[3.2,-123.6]) }),
  // Found (contract §1.9; N19): he stands over the eye at `stand` (the bayonet tip a hand's breadth over his back: hover),
  // the right boot comes down on the right hand (step stepS in; flags.bootStepAt), the heel grinds grindS (bootGrind at its
  // end), 「……这个是活的。留着，问。」, and he squats at the head (ija.crouch, IjaCrouchHairHold) crouchAfterLineS after it.
  // stand: his right foot (to his right = north, facing west) on the right hand (flatPinned, ~(2.23,-125.12)): N19's boot.
  found:Object.freeze({ stand:P(2.3,-124.98,Math.PI/2), hoverS:.5, stepS:1.1, grindS:.6, grindShake:.35, crouchAfterLineS:.35,
    // N19: the eyes on the right hand in the mud at the lower right while the boot is on it (until he squats at the head).
    look:Object.freeze({ yawDeg:-100, pitchDeg:-22 }) }),
  // Marks of contract §5.3 as the Set package delivered them (2026-10-11, branch worktree-agent-a6280523e5c9e4005, Report_set.md;
  // owned by Set's Data_OpeningSet0103 -- the director reads this copy until the integration points it at Set's). x, z; yaw
  // where the body's head points (the stand-in bodies only). Set moved sweep [0] / [1] to the south half of the floor (clear of
  // walkIn / interpreterEnter), kept one finish body ([1], at the eye, deleted), put the machine gun's rest bodies on top of the
  // south rim with the pair dragging them from the depth sap (mgDragFrom), and shaped the north rim for the jumps (dropInLip ->
  // dropInLand, 1.95 m down).
  marks:Object.freeze({
    sweepBodies:Object.freeze([P(11.3,-123.4,105*Math.PI/180),P(9.4,-123.1,Math.PI/2),P(7.4,-124.8,Math.PI/2)]),
    finishBodies:Object.freeze([P(3.3,-124.55,Math.PI/2)]),
    mgCorpseLower:P(6.9,-121.2,0), mgCorpseUpper:P(7.0,-121.25,.2), mgDragFrom:Object.freeze([P(14.6,-121.4),P(15.0,-119.6)]),
    mgGunner:P(6.75,-121.95,Math.PI), mgLoader:P(7.75,-121.7,Math.PI), mgAimAt:P(-4,-113),
    dropInLip:Object.freeze([P(10.0,-127.2),P(11.5,-127.2),P(9.0,-127.25)]),
    dropInLand:Object.freeze([P(10.0,-125.75),P(11.5,-125.75),P(9.0,-125.8)]),
    foldBlast:P(20.4,-127.9), grenadeStop:P(2.2,-125.1), comradeRifle:P(3.95,-125.25,-Math.PI/2),
  }),
  // Stand-ins until the other packages' pieces land (each listed in pendingWiring): bodies -- dead NRA actors posed on ShotCollapse's
  // last frame stand in for Set's static corpses (sweep [0..1], finish [0..1], the two machine-gun rests).
  standIns:Object.freeze({ bodies:true }),
  // Estimated takes of this round's new / rewritten scenes (contract §3), used while the recorded scene is not this round's
  // (the voice layer's take has another line count or other speakers: the 2026-09 recordings): who, estimated seconds, and
  // the director event the voice direction waits on (Brief Voice item 4; `afterS` past it) or the gap after the line before.
  // With the recording in (Voice package), the real handle times everything and this table is not read.
  lines:Object.freeze({
    BunkerCount:Object.freeze([["yaowa",2.6],["yaowa",1.9,{gapS:1.5}],["luo",1.3,{gapS:.5}]]),
    BunkerBanter:Object.freeze([["liuwencai",1.6],["shunzi",2.2],["liuwencai",2.4],["comrade",1.7],["yaowa",1.4,{gapS:1.9}],["comrade",2.6],
      ["shunzi",3.0,{wait:"nearShell",afterS:1.7}],["yaowa",1.9],["shunzi",.9],["heyoutian",1.4,{gapS:.9}],["liuwencai",1.0],["heyoutian",2.2]]),
    BunkerLedger:Object.freeze([["comrade",2.8,{wait:"pour",afterS:.4}],["shunzi",1.3],["comrade",2.3],["shunzi",2.6],["comrade",1.0],["shunzi",3.4],["comrade",1.6,{gapS:.6}]]),
    BunkerExit:Object.freeze([["comrade",1.1,{wait:"exitReach",afterS:.1}],["shunzi",1.3,{wait:"clipsThrown",afterS:.3}],["comrade",1.2]]),
    BunkerSweep:Object.freeze([["ijaC",1.3,{wait:"grenadeBlast",afterS:.05}],["ijaC",1.0,{gapS:2.2}],["ijaB",.8,{wait:"stab7",afterS:.25}],
      ["ijaB",.8,{wait:"stab8",afterS:.25}],["ijaC",1.2],["ijaB",1.8],["ijaB",1.1,{wait:"stab9",afterS:.6}]]),
    CaptiveDragged:Object.freeze([["ijaA",1.6,{wait:"haltB",afterS:.15}],["comrade",1.9,{wait:"dragLanded",afterS:.1}],["ijaA",.8,{wait:"kneeled",afterS:.1}],
      ["comrade",1.9],["ijaB",1.0,{wait:"boltOpen",afterS:.1}]]),
    CaptiveInterrogation:Object.freeze([["ijaA",3.2],["interpreter",.6],["interpreter",4.2],["interpreter",2.4,{wait:"woundPress",afterS:.8}],
      ["comrade",1.6],["interpreter",1.6],["comrade",3.0],["ijaA",1.2],["interpreter",1.8]]),
    CaptiveWoundTwist:Object.freeze([["comrade",1.2,{wait:"woundPress"}]]),
    BayonetPractice:Object.freeze([["ijaA",1.6],["ijaA",2.0,{gapS:.9}],["ijaA",.6,{wait:"recruitSlapped",afterS:.25}],["ijaA",2.4,{wait:"recruitPant"}],
      ["ijaA",.6,{wait:"hairLifted"}],["ijaA",1.8,{wait:"cutStart"}],["ijaA",2.4,{wait:"bayonetFixed"}],["ijaB",1.6,{wait:"recruitNod"}],["ijaA",1.2,{gapS:.5}]]),
    RecruitCharge:Object.freeze([["ijaD",1.1]]),
    CaptiveHowl:Object.freeze([["comrade",4.0]]),
    ShunziFound:Object.freeze([["ijaA",2.2,{wait:"bootGrind"}]]),
  }),
  // Contract §6 cues the Sfx package adds: the director calls them by name and, while the cue is not in the audio engine yet
  // (Script_Audio SOUND_NAMES), plays the stand-in named here (pendingWiring lists each).
  sfxStandIns:Object.freeze({ whistleShort:"whistle", grenadeKnock:"impactMetal", bayonetStabBody:"impactFlesh", bayonetTwist:"impactFlesh",
    stompMud:"footstepMud", boltRattle:"bolt", boltToss:"impactDirt", rifleTossMud:"impactDirt", clothRip:"clothMove",
    bayonetFixClick:"magIn", bootGrind:"footstepMud", shellDirt:"debrisFall", throatCut:"impactFlesh" }),
  // The wordless voice scenes (contract §3) while they are not recorded: a procedural cue from the speaker's head instead.
  voiceStandIns:Object.freeze({ CaptiveWoundTwist:"painMoan", CaptiveHowl:"execScream", RecruitCharge:"hitGrunt" }),
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
    // 2026-09-30 (user: 「应该是一转身就看到了主角，而不是原地罚站了一会儿才动手」): he used to reach `found` 4.8 s after the cut
    // and stand there 6.2 s until ijaB's 「蠢货。」 and the far call were over, then squat and wait 2.4 s more. Now the walk is
    // paced (tauntWalkMps..tauntWalkMaxMps) to end as his own last jeer (tauntLastLine) does; he turns from it straight
    // onto the pinned man (Found), and the taunt's lines still to come (ijaB's, the far call) are dropped.
    // tauntLineOffsetS: CaptiveTaunt.01 starts this long after the cut (Data_FirstLevelDialogueDirection offsetS).
    // 2026-10-11 redraft: the taunt walk is retired (tauntHoldS ... tauntWalk); he now bayonets his way to the mouth (Finish)
    // and stands over the eye (found.stand). `crouch` is still where he squats at the head for 02 (the hand-over to Dir02).
    crouch:P(2.45,-125.22,Math.PI/2),
    // 2026-10-11: past the man shamming dead in the trench (sweep.bodies[2] (7.4,-124.8)) on his south side, 0.9 m off him (Set:
    // the old line ran 0.19 m from that body).
    interpreterEnter:Route([23.5,-130],[20.1,-128],[18.7,-126.8],[17.45,-126.2],[16,-125.65],[14.2,-125.75],[13.2,-125.65],[12,-124.75],[8.4,-123.6],[6.6,-123.55],[5.5,-123.8],[4.9,-124.05]),
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
  // ijaAHold: his collar hold through the questioning (IjaCollarQuestion, manifest stage collarQuestion). 2026-09-30: at arm's
  // length from the comrade's front collar (0.5 m; the 09-27 mark, 0.86 m off it, was out of reach), a few cm short of the throat
  // cut's stance at his left shoulder (manifest stage slashGrab), which he takes before the grab (PhaseSlash).
  interrogation:Object.freeze({ ijaAHold:Object.freeze([-.26,-.17,-150]),
    // SB03 (contract §5): the interpreter crouches side-on to the comrade east of the group, ijaB behind him; world marks.
    interpreterAt:P(4.9,-124.05,25*Math.PI/180), ijaBAt:P(6.05,-125.0,55*Math.PI/180),
    // 2026-09-27 rework: first person all through (user: 「保持第一人称，不在切换视角」). From the pinned eye the group is
    // 2.3-4.2 m off, bearing -74..-111 deg; the heads stand 20-30 deg over the low eye.
    // 2026-10-11 (N10-N16): the comrade at the left of the picture (x ~0.2), the men round him and the machine gun on the
    // south rim spread to the right: the look turns ~10 deg further south than the 09-27 -88.
    witnessShot:Object.freeze({ yawDeg:-98, pitchDeg:12, rollDeg:2 }),
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
    // 2026-09-30 (user: 「一看到主角主角就闭眼假装装死，眼睛开了一个小缝，随后被一巴掌扇眩晕+睁眼」): closeAtS into Found (ijaA has
    // turned onto him) the eyes shut over closeS to a slit (eyeClosure `squint`; the lids meet at the picture's sides, a
    // band in the lower middle stays open) with a faint tremor, the hands go still, and they stay so while he is grabbed
    // and hauled up by the hair; the first slap snaps them open over openS (no flinch on that one) -- the daze after it
    // as before. `slitAboveDeg`: the slit sits below the middle of the picture (0.62 of the height down at a 65 deg fov), so
    // while he shams the look is on ijaA's face pitched up this much and the face falls into it.
    playDead:Object.freeze({ closeAtS:.3, closeS:.14, squint:.84, tremor:.012, tremorHz:7, openS:.08, slitAboveDeg:9 }),
    // The interpreter squats at Shunzi's right front, 1.3 m from the eye, facing him; ijaB keeps watch east down the
    // trench 3.4 m off (「快点！」 over his shoulder).
    // 2026-10-11: south of the Set's finish.bodies[0] (3.3,-124.55, head west, 1.7 m long east), facing the eye (was (2.92,-124.5), 56 deg).
    interpreter:P(2.95,-124.0,41*Math.PI/180),
    interpreterReturn:Route([4.2,-124.25]),
    interpreterClearanceM:.44,
    // (until 2026-10-11 ijaB kept watch here, 3.4 m off; the redraft has him at the junction J -- vanguardPosts.ijaB)
    ijaBGuard:P(5.2,-124.7,-Math.PI/2),
    // ---- 2026-10-11 redraft (docs/Data_OpeningRedraft20261011Contract.md §1.10–1.12; Dir02 brief 「起点状态」) ----------
    // Where Dir01's Found leaves the vanguard and where 02 holds them until the charge: ijaB guarding the junction J facing east
    // (「快点！」 is shouted from there, 12 m off), ijaC at the fold F facing east, ijaD the recruit at practice.recruitWait facing
    // west with his rifle at the ready (a debug start into 02 puts them there, StageRescue).
    vanguardPosts:Object.freeze({ ijaB:P(14,-124.6,-Math.PI/2), ijaC:P(18.2,-125.6,-Math.PI/2), ijaD:P(3.9,-124.3,Math.PI/2) }),
    // The machine-gun crew Dir01 brings down (BunkerGunner castId gunner prone at Set mg.gunner, BunkerLoader castId loader
    // kneeling at mg.loader, facing south over the south lip). Until they are in the roster (Data_FirstLevelMission bunkerAssault)
    // the director makes stand-ins of them on 02's first frame (EnsureMgCrew, pendingWiring N22) with these ids, so the hand-back
    // waits for them and the volley has them to shoot. stance: the AI's (2 prone, 1 kneel).
    mgCrew:Object.freeze({
      // The Set's final marks (Report_set: mg.gunner / mg.loader on top of the south lip by the corpse rest (6.9,-121.2)).
      gunner:Object.freeze({ id:"BunkerGunner", at:P(6.75,-121.95,Math.PI), weapon:"Type11", stance:2 }),
      loader:Object.freeze({ id:"BunkerLoader", at:P(7.75,-121.7,Math.PI), weapon:"Type38", stance:1 }),
    }),
    // Blade (「丁端着刺刀走过来……把刀尖抵在顺子脸颊上，往下一压，划开一道口子。手还有点抖，这回甲没催他。」): startLine's end
    // (ijaB's 「快点！」) + afterLineS, the recruit walks from his wait (vanguardPosts.ijaD) to recruitAt at the eye's LEFT front
    // (the brief had him at the right front, (2.75,-124.75); from the lifted eye ijaA's own arm, the fist in the hair, covers the
    // whole upper right of the picture and the interpreter squats there, so the recruit was never seen -- and the contract has
    // the point come in from the left of the picture onto the left cheek), leans in and lays the bloody point on the LEFT cheek
    // (`touch`, touchS after he is there), presses it down and cuts
    // (`cut`, cutS; the tip draws pressM down the cheek over pressS with a tremor of shakeM at shakeHz), holds there until
    // releaseS and takes it off over liftS. thenLine (「说话！」) waits thenAfterS after the cut; backAfterLineS after it ends he
    // backs off three steps to levelAt (backS) and levels the rifle at the eye (the muzzle aimed, levelS to come up); the charge
    // breaks in chargeAfterLevelS after that. clip / levelClip: the frozen AnimB clips (contract §4.2); until they are baked the
    // stand-ins are standInClip (his rifle laid from his right hand onto the cheek by the director, RecruitRifle) and
    // levelStandIn walked backwards (pendingWiring N21). recruitFall: where the volley's chest shot drops him (east of the
    // heave, 「倒向东、不压在挣出的路线上」: Script_OpeningStoryboardsTest keeps it 0.9 m+ off the heave's path).
    blade:Object.freeze({ startLine:"RescueInterrogation.05", afterLineS:.15, recruitAt:P(2.8,-125.95),
      clip:"IjaRecruitCheekCut", standInClip:"IjaReadyRifle", touchS:.9, cutS:1.5, pressS:.25, pressM:.035, shakeM:.004, shakeHz:9,
      releaseS:2.3, liftS:.4, thenLine:"RescueInterrogation.06", thenAfterS:.55, backAfterLineS:.2, backS:1.3,
      levelAt:P(4.6,-125.75), levelClip:"IjaRecruitLevelRifle", levelStandIn:"IjaReadyRifle", levelS:.45, chargeAfterLevelS:.5,
      recruitFall:P(5.3,-125.8) }),
    // The cut on the cheek, first person: the head flinches flinchDeg away from it (to the right) over flinchS and comes back over
    // recoverS; the cheekCut sound (Sfx package, contract §6) -- `sound` until it is registered (pendingWiring N21); the lens look
    // is Data_OpeningLens `cheek` on the cut's clock (events.cheekAt).
    cheek:Object.freeze({ flinchDeg:6, flinchS:.08, recoverS:.8, cue:"cheekCut", sound:"bayonetHit", volume:.55 }),
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
      // 2026-09-30: the grab now comes during 「还藏着一个，支那混蛋。」; the first blow waits for its words
      // (afterLine: no earlier than afterLineS from the line's end -- its tail is a giggle) and wakes him (rescue.playDead).
      blows:Object.freeze([
        Object.freeze({ at:"grab", delayS:.75, afterLine:"ShunziFound", afterLineS:-.55, side:1, then:"RescueInterrogation.01", thenAfterS:.4 }),
        Object.freeze({ line:"RescueInterrogation.03", afterEndS:1.1, side:1, then:"RescueInterrogation.04", thenAfterS:.6 }),
      ]),
      // 2026-10-11 (「这回甲没催他」): no third raised hand any more -- 「说话！」 (.06) comes after the recruit's cut (rescue.blade)
      // and ijaA keeps his fist in the hair; the charge breaks in once the recruit has backed off and levelled his rifle.
      raiseLine:null }),
    // The rescuers wait out of sight in the SSW leg just behind the spoil and the crater step; on the charge they come
    // over the step (chargeRoute) into the front trench at runMps, staggered by `delayS`, once the volley has wounded the
    // three over him (rescue.wound). Luo, ChargeA and ChargeD go in for the cuts (rescue.cuts), He runs on to the roof timber
    // (lift.heLift), Liu stops on the step (liuShot) and shoots the junction man, the others run on east down the trench.
    luoStart:P(1.0,-120.55), heStart:P(.45,-120.35), liuStart:P(-.2,-120.1),
    chargeRoute:Route([1.4,-120.8],[3.1,-121.3],[3.3,-122.2],[3.3,-123.5]),
    runMps:4.2,
    // They burst out of cover (C.pace's 4 m/s² took 2.2 m to reach runMps: the charge came over the step at a jog);
    // the men going in for a cut reach the chop mark still running, the others pull up on theirs.
    runPace:Object.freeze({ accelMps2:10, decelMps2:6, minMps:.3 }),
    strikePace:Object.freeze({ accelMps2:10, decelMps2:6, minMps:2.4 }),
    // Luo leads (he starts 0.58 m further down the route; going second he ran inside He, 8 cm apart), He behind him.
    // 2026-09-30: all of them after the volley's three hits (rescue.wound.shots, the last at 0.7 s). 2026-10-11: ChargeB is the
    // first down the step (rescue.extras), Luo right behind him.
    delayS:Object.freeze({ luo:.7, he:1.0, liu:1.2 }),
    // Liu's shot at the junction man: no earlier than liuEarliestS into the charge (after the cuts: 「刘文财在台阶处举枪，击倒岔口
    // 回身举枪的乙」 comes after the interpreter is cut down).
    liuShot:P(3.3,-122.4,-1.45), liuEarliestS:3.6,
    // After the junction shot Liu goes down into the front trench and aims east from the south wall (SB06: right of centre, far enough east that He's head, swaying on his held pose, does not cover his).
    liuCover:P(5.92,-123.52,-Math.PI/2),
    // 「一大帮人」: more men of the company with dadao (NRA02 / NRA05 bodies, the rigs the opening clips are baked on). ChargeA
    // cuts down the wounded interpreter (rescue.cuts: LuoDadaoChopRear needs the NRA05 body, modelVariant 4).
    // 2026-10-11 (「丙在折角原地转身，跪着朝台阶开枪，冲在最前面的一名川军弟兄身子一歪，滚下台阶，摔在顺子旁边，眼睛还睁着」;
    // 「丙随后被台阶上的枪打倒」): ChargeB runs first, down the step and on toward the pinned man (`post`), and the fold man's shot
    // drops him there (`foldTarget`, rescue.fold) -- he lies at rescue.fallenComrade; ChargeC and ChargeE carry rifles, stop on
    // the step (`post`) and fire at the fold man (`shootsFold`). ChargeD runs on east down the trench.
    extras:Object.freeze([
      Object.freeze({ id:"ChargeA", start:P(-.8,-119.6), modelVariant:4, delayS:.85 }),
      Object.freeze({ id:"ChargeB", start:P(.15,-120.05), modelVariant:1, delayS:.3, post:P(2.4,-124.6,Math.PI/2), foldTarget:true }),
      Object.freeze({ id:"ChargeC", start:P(-1.8,-118.2), modelVariant:1, delayS:1.6, weapon:"HanYang", post:P(2.75,-121.55,-1.3), shootsFold:true }),
      Object.freeze({ id:"ChargeD", start:P(-2.3,-117.5), modelVariant:4, delayS:1.05, post:P(10.8,-125.3) }),
      Object.freeze({ id:"ChargeE", start:P(-2.8,-116.8), modelVariant:1, delayS:2.1, weapon:"HanYang", post:P(3.75,-121.95,-1.3), shootsFold:true }),
    ]),
    // The fold man (ijaC at F) once the volley goes: he turns round where he stands from turnAtS (he was facing east, away), and
    // as soon as the first man down the step (foldTarget) is within fireWithinM of his post -- at the latest fireForceS into the
    // charge -- kneels into IjaCornerFire facing him; its shot (the clip's `fire` event) drops him. The rifles on the step
    // (shootsFold) fire at him from returnFireS into the charge; one with a clear line takes him, longShotForceS (timeouts) +.5 the
    // timeout does.
    fold:Object.freeze({ turnAtS:.15, fireWithinM:1.0, fireForceS:3.2, fireS:.1, returnFireS:4.2, returnFireGapS:.45 }),
    // Where ChargeB lies once the fold man's shot has dropped him (「摔在顺子旁边」: 1 m south of the eye); the heave keeps off him.
    fallenComrade:P(1.85,-124.25),
    // The depth Japanese who went off down the trench after the killing hold here, watching east (the volley shoots him dead there).
    // (2026-10-11: off the Set's sweep.bodies[1] (9.4,-123.1); was (9.4,-123.75).)
    depthPost:Object.freeze({ DepthIjaB:P(9.8,-124.7,-Math.PI/2) }),
    // 2026-09-30 (user: 「应该是队友们先开枪击伤日军，日军手已经抬不起来拿枪了，再是班长和队友冲上来一刀砍死了这几个审问的日军和翻译」):
    // the charge opens with a volley from the crater step. `at` s into Charge a shot from `from` (1.5 m over its ground)
    // hits `role` in `bone` (part `part`, `damage` -- not lethal: narrative protection holds until the cut); he plays `clip`
    // from there (the arm hangs dead, the other hand on the wound) and stands on its hold loop, his root moved by the
    // clip's root motion (standIn [right, back, turn deg] until it is baked). `lethal`: shot dead where he stands.
    // 2026-10-11 (contract §1.11, 「没有号声。台阶上先响了一排枪。第一排枪先打沟沿上的机枪组」): five aimed shots, no bugle --
    // the gunner dead over his corpse rest, the loader dead off the lip, the recruit in the chest (on his back, east of the
    // heave: rescue.blade.recruitFall), ijaA and the interpreter in the left arm; the depth man as before.
    wound:Object.freeze({ damage:30, shots:Object.freeze([
      Object.freeze({ role:"gunner", at:0, from:P(2.6,-121.1), bone:"chest", part:"torso", lethal:true }),
      Object.freeze({ role:"loader", at:.12, from:P(-.6,-120.2), bone:"chest", part:"torso", lethal:true }),
      Object.freeze({ role:"ijaD", at:.30, from:P(.9,-120.7), bone:"chest", part:"torso", lethal:true }),
      Object.freeze({ role:"ijaA", at:.48, from:P(1.0,-120.7), bone:"upperArmL", part:"arm", clip:"IjaShotStaggerAway", standIn:Object.freeze([.1,1.5,180]) }),
      Object.freeze({ role:"interpreter", at:.66, from:P(2.6,-121.1), bone:"upperArmL", part:"arm", clip:"InterpreterShotStagger", standIn:Object.freeze([.75,1.12,-146]) }),
      Object.freeze({ role:"DepthIjaB", at:.9, from:P(2.6,-121.1), bone:"chest", part:"torso", lethal:true }),
    ]) }),
    // ...then 「罗班长从右后方抢上来，一刀劈在他后颈」 / 「一名冲锋弟兄砍倒想跑的翻译」: each wounded man is cut down from his
    // right rear (stage chopRear round his wounded root) by `by` leaving `delayS` after the charge began; the blade kills at the
    // clip's cut contact and he falls the way the blow drives him (docs/Data_HitReaction.md). `after` / `gapS`: this cut starts
    // no earlier than gapS after the named victim's cut has landed. `fleeM`: the interpreter gets up and runs fleeM east (two
    // steps, at fleeMps) from where his wounded clip left him as the cut starts -- the blade takes him on the second step.
    cuts:Object.freeze([
      Object.freeze({ by:"luo", victim:"ijaA" }),
      Object.freeze({ by:"ChargeA", victim:"interpreter", after:"ijaA", gapS:.35, fleeM:1.0, fleeMps:3.0 }),
    ]),
    // 「甲用右手摸出手榴弹，牙咬掉保险销，正要往钢盔上磕」 (IjaGrenadeBitePin from the wounded hold; until it is baked the hold of
    // IjaShotStaggerAway with the grenade in his right hand): the grenade shows drawS after his hit, the pin goes at biteS,
    // and Luo's cut lands no earlier than readyS after the hit. The cut drops it (「那颗没磕响的手榴弹滚到顺子脸前停住」): it
    // falls from the hand, bounces (bounceH up, bounceS later; grenadeBounce each), rolls rollS and lies at `stop` (Set
    // finish.grenadeStop, 0.35 m east of the eye) until 01–02 is left; it never goes off. Prop: Set's `grenade` (Type 91,
    // radiusM / lengthM) -- the director's own cylinder until Set wires it (pendingWiring N23).
    grenade:Object.freeze({ drawS:1.0, biteS:1.7, readyS:2.6, bounceH:.12, bounceS:.24, rollS:.8, stop:P(2.2,-125.1),
      radiusM:.025, lengthM:.095, pin:"grenadePin", bounce:"grenadeBounce" }),
    // 「手榴弹滚到顺子脸前停住」: the look goes down onto it as it comes to rest, for grenadeLookS (from 0.3 s before it stops).
    grenadeLookS:.6,
    // 「枪炮声四起」: rifle reports from the SSW leg and the crater step at `rifles` (s into Charge), shells landing out in
    // the fields (feedback only, no damage) at `shells`; 「杀喊声四起（全都是四川话）」: `yells` [s, voice key, x, z].
    noise:Object.freeze({
      // The crowd's war cry (Script_SeedAudioChargeBake: a whole trenchful of Sichuan voices yelling 「杀——」) from behind
      // the spoil where the men wait, at crowd[0] s.
      crowd:Object.freeze([.05,.4,-120.6]),
      rifles:Object.freeze([0,.12,.30,.48,.66,.9,1.3,1.75,2.3,2.9]),
      riflesFrom:Route([-.6,-120.2],[.9,-120.7],[2.6,-121.1],[-1.8,-118.5]),
      shells:Object.freeze([[.25,12,-117.5],[.95,-3,-131],[2.1,17,-130.5]]),
      // 2026-10-11 (「冲锋时只有短促的喊杀，此起彼伏，不成句」; contract §3 squad bark library): yell_sha / yell_kan / yell_chong,
      // and one 「杀！」 each in Luo's, He's and Liu's own voices. Until the Voice package delivers them, `yellStandIn` plays the
      // existing rally_* barks in their place (pendingWiring N23); the integrator removes the table when they are wired.
      yells:Object.freeze([[.1,"yell_sha",.9,-120.6],[.35,"yell_sha@luo",1.0,-120.55],[.6,"yell_chong",-.5,-119.8],
        [.85,"yell_sha@heyoutian",.45,-120.35],[1.15,"yell_kan",-1.5,-118.9],[1.5,"yell_sha@liuwencai",-.2,-120.1],
        [1.9,"yell_sha",3.2,-122.4],[2.4,"yell_kan",5.5,-124.3],[3.1,"yell_chong",7.5,-124.2]]),
      yellStandIn:Object.freeze({ yell_sha:"rally_dadao", yell_kan:"rally_follow", yell_chong:"rally_charge",
        "yell_sha@luo":"rally_charge@luo", "yell_sha@heyoutian":"rally_charge@heyoutian", "yell_sha@liuwencai":"rally_charge@liuwencai" }),
    }),
    // Charge / Melee view (2026-09-30, user: 「现在一个镜头直接切过去很不自然，完全可以镜头不动，但是前面的翻译或者日军被砍死倒下吧」):
    // the eye stays on ijaA (his upper body: ijaChestDropM under the head, pitch capped at maxPitchDeg) -- shot, up off him and
    // staggering away -- while the men run in from the right; on each cut the look is between the cutter and the cut man for
    // cutHoldS. The look point follows with a lookS time constant (no whip when the subject changes).
    // grenadeMinPitchDeg / grenadeLookS: how far down and how quickly (time constant) the look goes onto the grenade rolling to
    // his face (rescue.grenadeLookS: how long it stays on it once at rest).
    chargeView:Object.freeze({ ijaChestDropM:.3, maxPitchDeg:30, cutHoldS:1.3, lookS:.28, grenadeMinPitchDeg:-50, grenadeLookS:.12 }),
    // Blade's view (2026-10-11, N21): from the hair-holder's face (Hold / Ask) over toward the recruit leaning in (weight
    // atRecruit, his head dropM lower), eased with lookS.
    bladeView:Object.freeze({ atRecruit:.75, recruitDropM:.15, lookS:.3 }),
    // Melee: once the cuts have landed and the vanguard is down (vanguardIds, the interpreter) the view holds on the trench
    // (meleeHoldS) before the heave.
    meleeHoldS:1.0,
    // Lift: He lifts the timber off his hips (Set PoseRoofTimber toward its hang, raise .. of it) standing at heLift.
    // HeLiftTimber: his hands under the timber at gripS, the heave over raiseS; he holds it (the clip's hold loop) until the
    // boots are out (rescue.heave.dropPastM) and lets it drop, letting go of it letGoS after that.
    lift:Object.freeze({ heLift:P(1.45,-124.7,1.2), raise:.55, gripS:.3, raiseS:.5, letGoS:.9 }),
    // 2026-09-30 (user: 「不要班长把玩家拖出来了，直接玩家自己往前用力一声腾挪就出来就行」): once He has the timber up
    // (lift.gripS + raiseS) Shunzi heaves himself out: braced on both hands, a grunt (RescueHeave from gruntS: the take's first
    // catch of breath as the timber shifts, its strain 0.9 s in, on the lunge), a lunge forward on them, a
    // second pull that brings the knees under him, up onto his knees facing east down the trench. `body`: his eye / look /
    // head-up and body points on the director's clock (HeaveRoot: the pinned eye facing east; +x his right, -z ahead, runtime
    // metres over the ground; gaze / crown as directions from the eye). He drops the timber once both heels are dropPastM
    // past its east face (timberEastX).
    heave:Object.freeze({ timberEastX:.95, dropPastM:.3, durationS:2.5, gruntS:-.5, body:Object.freeze({
      eye:[[0,[0,.28,0]],[.3,[0,.23,.05]],[.6,[0,.42,-.38]],[.85,[0,.36,-.58]],[1.1,[0,.31,-.66]],[1.4,[0,.44,-.86]],[1.8,[0,.66,-.82]],
        [2.15,[0,.98,-.64]],[2.5,[0,1.12,-.60]]],
      gaze:[[0,[0,.1,-1]],[.3,[0,-.45,-.9]],[.6,[0,-.05,-1]],[1.1,[0,-.35,-.94]],[1.4,[0,-.15,-1]],[1.8,[0,-.12,-1]],[2.15,[0,.02,-1]],[2.5,[0,0,-1]]],
      crown:[[0,[0,1,0]],[.6,[.07,1,0]],[1.1,[0,1,0]],[1.4,[-.06,1,0]],[1.8,[0,1,0]]],
      chest:[[0,[0,.12,.35]],[.6,[0,.22,.05]],[1.1,[0,.16,-.2]],[1.4,[0,.26,-.4]],[1.8,[0,.5,-.5]],[2.5,[0,.88,-.52]]],
      pelvis:[[0,[0,.13,.9]],[.3,[0,.13,.9]],[.6,[0,.16,.55]],[1.1,[0,.14,.28]],[1.4,[0,.18,.02]],[1.8,[0,.48,-.22]],[2.15,[0,.52,-.42]],[2.5,[0,.52,-.48]]],
      kneeL:[[0,[-.11,.07,1.4]],[.6,[-.11,.07,1.05]],[1.1,[-.11,.07,.75]],[1.4,[-.11,.08,.5]],[1.8,[-.11,.1,-.25]],[2.5,[-.11,.08,-.45]]],
      kneeR:[[0,[.11,.07,1.4]],[.6,[.11,.07,1.05]],[1.1,[.11,.07,.75]],[1.4,[.11,.08,.5]],[1.8,[.11,.1,-.25]],[2.5,[.11,.08,-.45]]],
      heelL:[[0,[-.12,.12,1.85]],[.3,[-.12,.12,1.85]],[.6,[-.12,.1,1.5]],[1.1,[-.12,.08,1.2]],[1.4,[-.12,.08,.95]],[1.8,[-.12,.12,.25]],[2.15,[-.12,.1,.02]],[2.5,[-.12,.1,0]]],
      heelR:[[0,[.12,.12,1.85]],[.3,[.12,.12,1.85]],[.6,[.12,.1,1.5]],[1.1,[.12,.08,1.2]],[1.4,[.12,.08,.95]],[1.8,[.12,.12,.25]],[2.15,[.12,.1,.02]],[2.5,[.12,.1,0]]],
    }) }),
    // 2026-09-30 (user: 「班长太磨叽了，眼珠子也不知道在动什么，就直接询问，得到肯定的点头以后，班长就地捡起一把枪，就塞给玩家」):
    // Luo walks from his cut to stand frontM in front of the kneeling man, facing him (HandRoot), and plays LuoGrabRifleShove:
    // the dadao into his belt, a short hold loop leaning in over him -- 「还能打不？」 lineDelayS into it, eyes on his face (the
    // speaker binder's gaze is pinned to the player's eye) -- the nod (nodS after the line) lets it go: he snatches up the rifle
    // lying at his right front (rescue.rifleMouth: the clip's rifle prop at its first frame) and shoves it into Shunzi's hands.
    // The palms reach for it from reachS before "handed"; carryS: the taken rifle comes from where Luo held it to the gear-up's
    // end (Data_OpeningFirstPersonGear: the rifle at the ready in both hands). From "handed" he gets up (rise: eye keys on the
    // clock since handed, HeaveRoot frame) and the hand-back follows once he stands and Luo's clip has played out
    // (releaseGraceS more for a vanguard man missing from the enemy table). standIn: the clip's timing before it is baked.
    // waitSide: until the knees come under him (heave stepInS) Luo stands aside, off the line he heaves himself out along
    // (09-30 run: waiting in front of him his legs filled the whole lunge) -- [left, back] of HandRoot, facing him.
    hand:Object.freeze({ frontM:.95, waitSide:Object.freeze([.6,0]), stepInS:1.7, lineDelayS:.1, nodS:.15, reachS:.3, carryS:.8, releaseGraceS:1,
      standIn:Object.freeze({ durationS:3.167, offerS:2.25, handedS:2.417, holdLoop:Object.freeze([.5,1.5]) }),
      rise:Object.freeze({ durationS:.9, eye:[[0,[0,1.12,-.6]],[.12,[0,1.08,-.62]],[.55,[0,1.4,-.56]],[.9,[0,1.62,-.52]]] }) }),
    // He goes to the trench edge east of the hand-back with his rifle once he has let the timber drop (Aftercut), along the
    // north side (heCoverVia): straight there he brushed past the kneeling man at 0.8 m (2026-09-30).
    heCover:P(4.7,-124.25,-1.3), heCoverVia:Route([2.2,-124.3],[3.4,-124.2]),
    // The director's framing in Check: the look on Luo's face (luoFaceDropM under his head, at most atLuoMaxDeg up, weight
    // atLuo) while he asks; on his hands as he stoops for the rifle and swings it up (atHands, no lower than handsMinDeg: the
    // grab is seen, not the mud under it); down at the rifle as it is shoved over (atRifle, no lower than rifleMinDeg, from
    // just before "offered" to handed + .5); level ahead as he stands. The look trails what it follows by lookS.
    view:Object.freeze({ atLuo:.85, luoFaceDropM:.1, atLuoMaxDeg:35, atHands:.75, handsMinDeg:-25, atRifle:.6, rifleMinDeg:-30, lookS:.25 }),
    // The mission rifle lies in the mud at his right front, out of reach while he is pinned; Luo snatches it up for him
    // (LuoGrabRifleShove's prop starts where it lies: its first frame in HandRoot's frame, +x Luo's right, -z ahead, is
    // (+.40, .04, -.28), the muzzle toward (+.8, 0, +.6)). Prop yaw: the muzzle points along (-sin yaw, -cos yaw).
    rifleMouth:P(3.12,-125.65,-36.87*Math.PI/180),
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
    // 2026-10-11 redraft, 01 (Dir01): N01-N19 (contract §8; pictures REL/附件/storyboard/Storyboard_N*.png, judged parts from
    // REL/附件/briefs/Storyboard_Shots_20261011.md, "导演还原判据"). Shots run in flow order. Seat shots: the player's free look
    // is left at the seat's own look (the shot tool does not move the mouse). Ranges are the storyboard's ±0.1-0.15 of the
    // picture where the frozen marks allow it; where a frozen mark cannot reach the drawing's spot the range says what the marks
    // give (noted per shot).
    // N01 the dugout once the picture is up (Banter's start, before Liu's toss).
    Object.freeze({ id:"N01", storyboard:"Storyboard_N01_CaveTableau.png", when:"s.phase==='Banter'&&s.Age>=2.0",
      judge:{ camera:{ eyeM:[.6,1.05], pitchDeg:[-22,-6], yawDeg:[-101,-85] },
        actors:{ yaowa:{ x:[.75,1], distM:[.5,1.8] }, comrade:{ x:[.6,.95], distM:[1.8,3.4] }, luo:{ x:[.35,.65] }, liuwencai:{ x:[.42,.78], distM:[2.6,3.8] },
          heyoutian:{ x:[0,.3], distM:[.5,2] } }, absent:["runner"], rifleHidden:true } }),
    // N02 the corner of bread in the air between the comrade and Yaowa.
    Object.freeze({ id:"N02", storyboard:"Storyboard_N02_BreadToss.png", when:"s.flags['ev:breadToss']!=null&&r.time-s.flags['ev:breadToss']>=.3",
      judge:{ camera:{ eyeM:[.6,1.05] }, actors:{ yaowa:{ x:[.6,1] }, comrade:{ x:[.6,1] }, luo:{ x:[.3,.66] } } } }),
    // N03 the runner reporting outside the mouth (BunkerOrders 2.2 s in, as SB01 was), Luo standing in the mouth, Liu and He
    // getting ready inside.
    Object.freeze({ id:"N03", storyboard:"Storyboard_N03_RunnerReport.png",
      when:"s.phase==='Orders'&&s.flags['scene:BunkerOrders']!=null&&r.time-s.flags['scene:BunkerOrders']>2.2",
      judge:{ camera:{ eyeM:[.6,1.05], yawDeg:[-101,-85] }, actors:{ runner:{ x:[.5,.8], distM:[4.5,6.2] }, luo:{ x:[.35,.68] }, liuwencai:{ x:[.35,.8] },
        heyoutian:{ x:[0,.35] }, comrade:{ x:[.62,1] } }, actorSeparation:{ roles:["luo","runner"], headXMin:.04, rootMMin:1.2 } } }),
    // N04 the two clips thrown: the comrade risen against the south wall reaching out (the second clip falls at his feet).
    Object.freeze({ id:"N04", storyboard:"Storyboard_N04_ClipsThrown.png", when:"s.flags.clipsThrownAt!=null&&r.time-s.flags.clipsThrownAt>=.22",
      judge:{ camera:{ eyeM:[.6,1.1] }, actors:{ comrade:{ x:[.5,.95], distM:[1.2,3.2] } } } }),
    // N05 the near miss (SB02's criteria: mirrored, the head rolled left, the post and lintel framing the mouth on the right).
    Object.freeze({ id:"N05", storyboard:"Storyboard_N05_NearMiss.png", phase:"Blast", age:.7,
      judge:{ camera:{ eyeM:[.6,.95], pitchDeg:[-20,-2], rollDeg:[12,26], yawDeg:[-78,-54] }, eyeClosure:[0,.2],
        points:{ postNBase:{ at:[1.05,.3,-127.33], x:[.3,.6], y:[.25,.75] }, lintelN:{ at:[1.05,1.75,-126.9], x:[.4,.8], y:[0,.3] } } } }),
    // N06 waking under the timber: nobody in the trench yet, the rifle half buried at the right front.
    Object.freeze({ id:"N06", storyboard:"Storyboard_N06_WakeRifle.png", phase:"Wake", age:4.2,
      judge:{ camera:{ eyeM:[.15,.45] }, rifle:{ x:[.55,1] }, absent:["ijaA","ijaB","ijaC","ijaD"] } }),
    // N07 the drop-in: ijaA standing on the floor pointing at the fold, ijaC down, ijaD down. The frozen landing marks are 8-10 m
    // off within a 1.3 m wide band, so the three stand closer together in the picture than drawn (x 0.40 / 0.58 / 0.78).
    Object.freeze({ id:"N07", storyboard:"Storyboard_N07_DropIn.png", when:"s.flags.dropInAt!=null&&r.time-s.flags.dropInAt>=3.05",
      judge:{ camera:{ eyeM:[.15,.45], pitchDeg:[0,16] }, actors:{ ijaA:{ x:[.3,.85], distM:[6,10] }, ijaC:{ x:[.3,.9], distM:[6,11] }, ijaD:{ x:[.3,.95], distM:[7,12] } } } }),
    // N08 ijaC at the fold, the grenade knocked on his helmet, held a beat.
    Object.freeze({ id:"N08", storyboard:"Storyboard_N08_GrenadeCorner.png", when:"s.flags.knockAt!=null&&r.time-s.flags.knockAt>=.15",
      judge:{ camera:{ eyeM:[.15,.45] }, actors:{ ijaC:{ x:[.4,.8], distM:[14,19] } } } }),
    // N09 ijaB coming down the trench at the second body, the instant before the thrust; the first already passed, ijaC far
    // off with his back to us.
    Object.freeze({ id:"N09", storyboard:"Storyboard_N09_SweepStab.png", when:"s.flags['stabDue:8']!=null&&r.time>=s.flags['stabDue:8']-.3",
      // (Set moved the bodies to the south half of the floor: following ijaB there the look turns south and the fold man sits
      // left of the drawing's x 0.67.)
      judge:{ camera:{ eyeM:[.15,.45] }, actors:{ ijaB:{ x:[.3,.7], distM:[7,10.5] }, ijaC:{ x:[.3,.9] } } } }),
    // N10 the comrade knelt against the north wall looking straight at the eye, ijaA and ijaB over him.
    Object.freeze({ id:"N10", storyboard:"Storyboard_N10_PulledOut.png", when:"s.flags.gazeAt!=null&&r.time-s.flags.gazeAt>=.25",
      judge:{ camera:{ eyeM:[.2,.45] }, actors:{ comrade:{ x:[.08,.45], distM:[1.8,2.9], woundMin:10, faceBloodMin:.9 }, ijaA:{ x:[.12,.7] }, ijaB:{ x:[.3,.9] } } } }),
    // N11 ijaB flinging the bolt out over the south rim, ijaA tearing the badge.
    Object.freeze({ id:"N11", storyboard:"Storyboard_N11_RifleBadge.png", when:"s.flags.boltTossAt!=null&&r.time-s.flags.boltTossAt>=.2",
      judge:{ camera:{ eyeM:[.2,.45] }, actors:{ comrade:{ x:[.08,.45] }, ijaA:{ x:[.12,.7] }, ijaB:{ x:[.3,.95] } } } }),
    // N12 the machine gun on the south rim firing its first burst over the bodies, the questioners not looking round.
    Object.freeze({ id:"N12", storyboard:"Storyboard_N12_CorpseGun.png", when:"s.flags.firstBurstAt!=null&&r.time-s.flags.firstBurstAt>=.06",
      judge:{ camera:{ eyeM:[.2,.45] }, actors:{ comrade:{ x:[.05,.45] }, gunner:{ x:[.45,1], distM:[4,8] }, loader:{ x:[.45,1] } } } }),
    // N13 the interpreter at the comrade's face, ijaB's thumb in the wound, ijaA watching.
    Object.freeze({ id:"N13", storyboard:"Storyboard_N13_ThumbWound.png", when:"s.flags['ev:woundPress']!=null&&r.time-s.flags['ev:woundPress']>=.3",
      judge:{ camera:{ eyeM:[.2,.45] }, actors:{ comrade:{ x:[.05,.42] }, ijaB:{ x:[.1,.6] }, interpreter:{ x:[.3,.85], distM:[2.5,4.2] }, ijaA:{ x:[.3,1] } } } }),
    // N14 the recruit slapped (backhand) in front of the comrade.
    Object.freeze({ id:"N14", storyboard:"Storyboard_N14_RecruitSlapped.png", when:"s.flags['ev:recruitSlapped']!=null&&r.time-s.flags['ev:recruitSlapped']>=.08",
      judge:{ camera:{ eyeM:[.2,.45] }, actors:{ comrade:{ x:[.05,.42] }, ijaD:{ x:[.2,.7] }, ijaA:{ x:[.35,.95] } } } }),
    // N15 the recruit's charge, the instant before the first thrust.
    Object.freeze({ id:"N15", storyboard:"Storyboard_N15_RecruitThrust.png", when:"s.flags['stabDue:1']!=null&&r.time>=s.flags['stabDue:1']-.12",
      judge:{ camera:{ eyeM:[.2,.45] }, actors:{ ijaD:{ x:[.2,.8] }, ijaA:{ x:[.4,1] } } } }),
    // N16 the comrade hauled up by the hair, the knee in his back, the blade at his throat: the beat before the cut.
    Object.freeze({ id:"N16", storyboard:"Storyboard_N16_KneeAndBlade.png", when:"s.flags.slashCutDue!=null&&r.time>=s.flags.slashCutDue-.08",
      judge:{ camera:{ eyeM:[.2,.45] }, actors:{ comrade:{ x:[.1,.62] }, ijaA:{ x:[.05,.65] }, ijaD:{ x:[.3,1] } } } }),
    // N17: the blood on the north wall, the blade wiped on the shoulder bandage, the rifle in his hand for the bayonet; ijaD pale
    // behind him; ijaB at the junction 10 m+ off. (The flag in the picture's distance is not ours.) The comrade (x ~0.25) and J
    // (x ~0.85) are 17 deg apart from the pinned eye: they stand closer in the picture than drawn.
    Object.freeze({ id:"N17", storyboard:"Storyboard_N17_WipeFix.png", when:"s.flags.wipeAt!=null&&r.time-s.flags.wipeAt>=.3",
      judge:{ camera:{ eyeM:[.2,.45] }, actors:{ ijaA:{ x:[.2,.7], distM:[1.5,3.2] }, ijaD:{ x:[.45,1] }, ijaB:{ x:[.45,1], distM:[10,14] } } } }),
    Object.freeze({id:"SB03_FlagKick",when:"s.flags.flagKickAt!=null&&r.time-s.flags.flagKickAt>=.3",judge:{flagProgress:[0,.1]}}),
    Object.freeze({id:"SB03_FlagDown",when:"s.flags.flagKickAt!=null&&r.time-s.flags.flagKickAt>=1.6",judge:{flagProgress:[.99,1]}}),
    // N18: through the slit, ijaA walking up with the bayonet down having just stabbed the body at the lower right (finish.bodies[0],
    // south-east of the eye). (The helmet by the body in the picture is not ours: the body is a Sichuan soldier.)
    Object.freeze({ id:"N18", storyboard:"Storyboard_N18_FinishWalk.png", when:"s.flags['ev:finishStab1']!=null&&r.time-s.flags['ev:finishStab1']>=.15",
      judge:{ camera:{ eyeM:[.15,.45], pitchDeg:[-4,16] }, eyeClosure:[.55,.97], actors:{ ijaA:{ x:[.35,.85], distM:[1.2,4] } } } }),
    // N19: the right hand flat in the mud at the lower right (x 0.55-0.75), the boot on it grinding, his leg up the right; the butt
    // and the bayonet tip above (one rifle, not two pieces as drawn). Through the shammed slit (contract §1.9).
    Object.freeze({ id:"N19", storyboard:"Storyboard_N19_BootOnHand.png", when:"s.flags.bootStepAt!=null&&r.time-s.flags.bootStepAt>=.3",
      judge:{ camera:{ eyeM:[.15,.45], pitchDeg:[-40,0] }, eyeClosure:[.55,.97], hands:{ r:{ pose:"flatPinned", x:[.5,1], y:[.5,1] } } } }),
    // ---- 02, 2026-10-11 redraft (contract docs/Data_OpeningRedraft20261011Contract.md §8 N20–N25; Dir02). The storyboard
    // pictures were not drawn yet when these were set (Lovart credits ran out): the judges are the contract's text and the old
    // SB05/SB06 frames, to be checked again against REL/附件/storyboard/Storyboard_N2x_*.png at integration.
    // N20 「甲蹲在头边左手揪着头发把头提起来、右手高举过肩要扇；翻译蹲在右前逼问；画面一侧发晕重影」: the second slap's wind-up
    // (the hand high over his shoulder, 0.28 s before it lands), then the blow itself (_Slap: the left of the picture swimming,
    // the view flung right).
    // (The interpreter is judged on the held frame, N20_Held: through the wind-up the look follows ijaA's head up and left.)
    Object.freeze({ id:"N20", storyboard:"Storyboard_N20_HairSlap.png", when:"s.slaps?.length>1&&r.time>=s.slaps[1].at-.28",
      judge:{ camera:{ eyeM:[.3,.55], pitchDeg:[5,45] }, actors:{ ijaA:{ x:[.2,.75], distM:[.3,1] } } } }),
    Object.freeze({ id:"N20_Held", storyboard:"Storyboard_N20_HairSlap.png", phase:"Ask", age:1,
      judge:{ camera:{ eyeM:[.3,.55], pitchDeg:[5,42] }, actors:{ ijaA:{ x:[.25,.7], distM:[.3,1] }, interpreter:{ x:[.45,1], distM:[.8,1.8] } } } }),
    Object.freeze({ id:"N20_Slap", storyboard:"Storyboard_N20_HairSlap.png", when:"s.slaps?.length>1&&s.slaps[1].landed&&r.time-s.slaps[1].at>=.12",
      judge:{ camera:{ eyeM:[.25,.55] } } }),
    // N21 「丁俯身，刀尖带血抵在左脸颊上往下压（刀尖从画面左侧贴脸进来，占画面一角）；甲在后面看着没催」: the recruit's point
    // laid on the cheek (_Touch) and the cut (0.1 s in: the white sting on the left, the streak starting at the lower left).
    // The point itself is judged by eye in the picture (it is not an actor); the recruit leans over at the right front.
    Object.freeze({ id:"N21_Touch", storyboard:"Storyboard_N21_CheekCut.png", when:"s.flags['touch:cheek']!=null&&r.time-s.flags['touch:cheek']>=.3",
      judge:{ camera:{ eyeM:[.3,.55] }, actors:{ ijaD:{ x:[.25,.7], bodyDistM:[.6,1.6], coverOk:"ijaA" }, ijaA:{ x:[.45,1], distM:[.3,1] } } } }),
    Object.freeze({ id:"N21", storyboard:"Storyboard_N21_CheekCut.png", when:"s.flags['cut:cheek']!=null&&r.time-s.flags['cut:cheek']>=.1",
      judge:{ camera:{ eyeM:[.3,.55] }, actors:{ ijaD:{ x:[.25,.7], bodyDistM:[.6,1.6], coverOk:"ijaA" } } } }),
    // 「丁退开三步，端平了枪」: levelled at the eye from rescue.blade.levelAt, the moment before the volley.
    Object.freeze({ id:"N21_Level", storyboard:"Storyboard_N21_CheekCut.png", when:"s.flags.levelAt!=null&&r.time-s.flags.levelAt>=.4&&s.phase==='Blade'",
      judge:{ camera:{ eyeM:[.3,.55] }, actors:{ ijaD:{ x:[0,.75], bodyDistM:[1.6,3.6], coverOk:"ijaA" } } } }),
    // N22 「台阶那边一排枪口闪光：沟沿上的机枪手趴在尸体上不动了，副射手翻下沟沿；丁胸口中弹枪脱手仰面倒；甲左臂中弹踉跄转开」:
    // the recruit 0.25 s after his chest shot (the crew already hit), ijaA hit and turning away (_Arm).
    Object.freeze({ id:"N22", storyboard:"Storyboard_N22_Volley.png", when:"s.flags['hit:ijaD']!=null&&r.time-s.flags['hit:ijaD']>=.25",
      judge:{ camera:{ eyeM:[.2,.55] }, actors:{ ijaA:{ x:[.1,.9], distM:[.3,1.2], headOptional:true } } } }),
    Object.freeze({ id:"N22_Arm", storyboard:"Storyboard_N22_Volley.png", when:"s.flags['hit:ijaA']!=null&&r.time-s.flags['hit:ijaA']>=.5",
      judge:{ camera:{ eyeM:[.2,.5] }, actors:{ ijaA:{ distM:[.3,2.2] } } } }),
    // N23 「罗班长带弟兄提大刀冲下弹坑台阶；甲右手举着手榴弹……罗从他右后方一刀劈向后颈；一名冲在最前的川军弟兄中弹滚在台阶下；
    // 远处弟兄砍向逃跑的翻译」: the men down the step (N23), Luo's cut a moment before its contact (_Chop), and the grenade come to
    // rest at the face (_Grenade: the look down on it).
    Object.freeze({ id:"N23", storyboard:"Storyboard_N23_ChargeChop.png", phase:"Charge", age:2.2,
      judge:{ camera:{ eyeM:[.2,.45] }, inFrameAtLeast:[{ roles:["luo","heyoutian","Charge"], count:1 }] } }),
    Object.freeze({ id:"N23_Chop", storyboard:"Storyboard_N23_ChargeChop.png", when:"s.flags['cut:ijaA']!=null&&r.time-s.flags['cut:ijaA']>=.35",
      judge:{ actors:{ luo:{ distM:[.8,3] } } } }),
    Object.freeze({ id:"N23_Grenade", storyboard:"Storyboard_N23_ChargeChop.png", when:"s.flags.grenadeStopAt!=null&&r.time-s.flags.grenadeStopAt>=.25",
      judge:{ camera:{ eyeM:[.2,.45], pitchDeg:[-55,-15] } } }),
    // N24 「何有田抓住塌顶木抬起，第一人称双手撑在泥里往前挣，膝盖在泥地拖出两道痕」 (rescue.heave, unchanged since 09-30).
    Object.freeze({ id:"N24", storyboard:"Storyboard_N24_HeaveOut.png", when:"s.flags.heaveAt!=null&&r.time-s.flags.heaveAt>=.7", judge:{ camera:{ eyeM:[.25,.6] } } }),
    Object.freeze({ id:"N24_Kneel", storyboard:"Storyboard_N24_HeaveOut.png", when:"s.flags.heaveAt!=null&&r.time-s.flags.heaveAt>=2.45", judge:{ camera:{ eyeM:[.95,1.3] } } }),
    // N25 「跪在沟底：罗班长俯身看着镜头问，一手已抓起右前方泥里的汉阳造横端起来塞过来，背景何有田、刘文财各守一侧」 (Check,
    // unchanged since 09-30): Luo leaning in asking, the rifle in his hands (_Hand), the hand-back standing (_Released: about
    // level, facing east down the trench where he got up; Luo turned off to the crater step on his left).
    Object.freeze({ id:"N25", storyboard:"Storyboard_N25_RifleShoved.png",
      when:"s.phase==='Check'&&s.flags.handAt!=null&&r.time-s.flags.handAt>=1.0",
      judge:{ camera:{ eyeM:[.95,1.3], pitchDeg:[-5,40] }, actors:{ luo:{ bodyDistM:[.6,1.3], x:[.25,.75] } } } }),
    Object.freeze({ id:"N25_Hand", storyboard:"Storyboard_N25_RifleShoved.png",
      when:"s.flags.handedAt!=null&&r.time-s.flags.handedAt>=.4", judge:{ camera:{ eyeM:[1,1.75] } } }),
    Object.freeze({ id:"N25_Released", storyboard:"Storyboard_N25_RifleShoved.png", when:"s.releaseAt!=null",
      judge:{ camera:{ pitchDeg:[-15,5], yawDeg:[-125,-55], eyeM:[1.5,1.75] } } }),
  ]),
  // Wave 1 stand-ins (contract §3): where a clip, hand pose, lens effect, set piece or blast effect of another
  // package belongs, the director uses the nearest existing one and lists it here. Wave 2 wires each entry to
  // the named replacement and removes it; the list must then be empty (Script_OpeningStoryboardsTest).
  pendingWiring:Object.freeze([
    // ---- 2026-10-11 redraft, 01 (Dir01): every stand-in for another package's new clip / voice / prop / cue / mark --------------
    // N01-N03 (Count, Banter, Orders)
    {shot:"N01", what:"this round's takes of BunkerCount / BunkerBanter / BunkerLedger / BunkerExit / BunkerSweep / CaptiveDragged / CaptiveInterrogation / BayonetPractice / ShunziFound (Voice)",
      now:"the director's estimated timeline (lines table) while the recorded scene is the 09 take (other line count or speakers: no audio, no subtitles, no mouths); ShunziFound plays its 09-30 take", wave2:"the Voice package's recordings: the director then takes the voice layer's handle (FirstLevelBunkerShow.Talk) and the lines table is unused"},
    {shot:"N01", what:"Yaowa crouched hugging his rifle, eyes on the bread, catching the corner and eating it (YaowaCrouchCatchEat, event catch)",
      now:"YaowaSitLoad at banter.yaowa; the bread corner flies to his right hand (procedural stand-in prop, OpeningFlyers)", wave2:"YaowaCrouchCatchEat (AnimA) from breadToss, its catch on the prop track"},
    {shot:"N01", what:"the comrade nibbling half a flatbread (ComradeEatBreadToss, bread / breadPiece) and pouring rounds at Shunzi's feet, laughing, leaning back with his eyes shut (ComradePourRoundsLaugh)",
      now:"WoundedSitRifleIdle with BanterLaugh / BanterPatRifle additives at breadToss, pour and comradeLaugh; no bread in his hand; the rounds are not shown", wave2:"ComradeEatBreadToss / ComradePourRoundsLaugh (AnimA) and Set's bread / breadPiece props"},
    {shot:"N01", what:"He asleep curled on his side with his helmet over his face, rolling over (heRoll), throwing the helmet off and sitting up (sitUp) (HeHelmetSleepSitUp)",
      now:"lying on ShotCollapse's last frame at banter.he, its last 0.6 s replayed at heRoll, WoundedSitRifleIdle from sitUp; the helmet stays on his head", wave2:"HeHelmetSleepSitUp (AnimA), the helmet prop over his face"},
    {shot:"N01", what:"Liu crouched at the ammo box counting out clips and tossing one onto Shunzi's leg (LiuDivideAmmoToss, ammoBox)",
      now:"ClipLoad loop at banter.liu; the clip is a procedural charger flown from his right hand to Shunzi's left thigh at liuToss; no box", wave2:"LiuDivideAmmoToss (AnimA), Set's ammoBox (Model_MilitaryCrateSet) at his right hand"},
    {shot:"N01", what:"north-wall crate stack, foreground crate, duckboards and revetment of the front trench",
      now:"nothing (bare earth)", wave2:"OpeningSet props bunkerCrateStackN, bunkerCrateFront, duckboardsFront, revetmentFront (Set)"},
    {shot:"N02", what:"the near shell: the dugout jumps, dirt pours from the roof into his collar (BunkerRoofDust, shellDirt)",
      now:"a dirt impact over the seat and in the mouth, debrisFall + explosionMid, the view jolted (banter.beats.jolt); in the black, debrisFall for shellDirt", wave2:"Set's BunkerRoofDust, Sfx shellDirt"},
    {shot:"N03", what:"the runner, out of breath, calls to Luo outside the mouth (after the far call)",
      now:"MessengerReport at runnerRoute's end (3.05,-124.5) facing Luo (PhaseOrders, BunkerRunnerCall before it)", wave2:"an Anim take of him bent over catching his breath and calling to Luo (RunnerLeanPostCall was baked leaning on a door post, facing the room)"},
    {shot:"N03", what:"Liu slams the box shut and shoulders it (LiuBoxUpGo); He grabs his helmet and is first out",
      now:"ClipLoad played out, then the native walk out (exitOrder); He from WoundedSitRifleIdle straight into the native run", wave2:"LiuBoxUpGo (AnimA, P1) with Set's ammoBox; HeHelmetSleepSitUp's helmet"},
    {shot:"N04", what:"the comrade, risen, reaches out, catches one clip, the other falls, he stoops and picks it up (ComradeCatchDropPick, clipA / clipB)",
      now:"WoundedRiseWall's last frame held reaching (exitReach), the two clips procedural chargers flown from the palms (one to his hand, one to the floor), no stoop", wave2:"ComradeCatchDropPick (AnimA) on the clips' prop tracks (Set clipA / clipB)"},
    // N05 (Blast), carried over from SB02
    {shot:"N05", what:"mud, clods and splinters blown into the dugout from the south lip of the mouth, on the right",
      now:"FireShell at banter.shellAt only (the crater, not seen from inside) in Blast()", wave2:"OpeningBlastFx.DirectionalBlast((1.2,-124.5) toward the north-west) at blastShot.fallStartS (Set)"},
    {shot:"N05", what:"the lintel's south end falls in the mouth 0.25–0.6 s and stays",
      now:"nothing falls", wave2:"OpeningSet.FallLintel(progress) / fallenLintel over Blast (Set)"},
    {shot:"N05", what:"strong chromatic aberration, radial edge blur, heavier vignette",
      now:"the existing concussion blur/ghost only", wave2:"OpeningLens.Evaluate(phase, age, events) into Perception().lens (Eye)"},
    {shot:"N05", what:"right hand flung open toward the mouth, the loading rifle sliding out of the foreground, legs in view",
      now:"protect/limp hand keys (beats.Blast); the loading rifle vanishes at 0.12 s; the mission rifle is hidden until Black (ApplyCamera)", wave2:"EXTRA_HAND_POSES.flingOpen, FP_PROPS.loadingRifleOnLegs.rifleSlide and LEG_POSES.sprawl in beats.Blast (Eye)"},
    {shot:"N05", what:"sandbag wall, poster, lit lantern and crates on the dugout's north wall (left of the frame)",
      now:"nothing (bare earth)", wave2:"OpeningSet props bunkerSandbagWallN, bunkerPoster, bunkerLantern, bunkerCrateStackN (Set)"},
    // N06-N09 (Wake, DropIn, Sweep)
    {shot:"N06", what:"the comrade's Hanyang by the spoil (comradeRifle, contract §5.2 (3.9,-125.0)) and the marks of §5.3 (sweep / finish bodies, machine gun, drop-in lips, fold blast, grenade stop)",
      now:"the comrade's own weapon dropped by BlastSlamBuried's weapon track; the marks are the director's copy (Data_OpeningStoryboards.marks)", wave2:"Set's comradeRifle prop; the director reads Data_OpeningSet0103's marks"},
    {shot:"N07", what:"three on the north rim with bayonets up, jumping down: ijaC to a knee aiming at F, ijaD standing aiming at J, ijaA pointing F then J (IjaDropInKneel / IjaDropInStand / IjaDropInPoint); the lip shaped for the jump (Set)",
      now:"IjaReadyRifle held standing on the rim (marks.dropInLip), the drop is the root eased down over fallS onto marks.dropInLand, PointBlockade (upper body) twice for ijaA; whistleShort -> whistle", wave2:"the three DropIn clips (AnimA, P1), Set's lip terrain (Data_FirstLevelMissionLayout), Sfx whistleShort"},
    {shot:"N08", what:"ijaC knocks the Type 91 on his helmet, holds it a beat and throws it round the fold (IjaGrenadeKnockThrow, grenade); the blast beyond the fold (Script_OpeningBlastFx)",
      now:"IjaReadyRifle held at the fold, a procedural grenade (cylinder) from his right hand at the knock, flown over the corner at the throw; at foldBlast an explosionMid with a dirt impact; grenadeKnock -> impactMetal; IjaJunctionPeek for the look", wave2:"IjaGrenadeKnockThrow (AnimA, P1), Set's grenade prop and OpeningBlastFx at dropIn.foldBlast, Sfx grenadeKnock"},
    {shot:"N09", what:"ijaB bayoneting the face-down men as he walks (IjaWalkStabProne); the bodies (Set's static corpses)",
      now:"IjaBayonetDownThrust (MachineGunCaptives) over the native walk (upper body); the bodies are dead NRA actors on ShotCollapse's last frame (standIns.bodies); bayonetStabBody -> impactFlesh", wave2:"IjaWalkStabProne (AnimA, P1), Set's static corpses (standIns.bodies false), Sfx bayonetStabBody"},
    {shot:"N09", what:"the third man cries out and claws the mud (CorpseStabbedClaw), ijaB stamps on his back, stabs again and twists (IjaStompStabTwist; stompMud, bayonetTwist)",
      now:"SweepVictim on ShotCollapse's last frame replays its last 0.6 s as the claw (painMoan for the cry), ijaB's second IjaBayonetDownThrust; footstepMud / impactFlesh", wave2:"CorpseStabbedClaw + IjaStompStabTwist (AnimA), Sfx stompMud / bayonetTwist"},
    // N10-N13 (CaptiveDragged, CaptiveWall, Interrogation)
    {shot:"N11", what:"ijaB picks up the comrade's rifle, opens the bolt, laughs, flings the bolt out of the trench and drops the rifle (IjaInspectRifleBoltToss; rifleBolt; boltRattle / boltToss / rifleTossMud)",
      now:"he walks to the rifle and holds IjaReadyRifle with his own Type 38 (the comrade's rifle hidden in between), a procedural bolt flown over the south rim; bolt / impactDirt", wave2:"IjaInspectRifleBoltToss (AnimA) with Set's comradeRifle / rifleBolt, Sfx boltRattle / boltToss / rifleTossMud"},
    {shot:"N11", what:"ijaA tears the badge off the comrade's chest and pockets it (IjaTearBadge, chestBadge, clothRip)",
      now:"IjaCollarQuestion (hand at the chest) at the comrade's left front; clothMove at the tear; no badge", wave2:"IjaTearBadge (AnimA), Set's chestBadge, Sfx clothRip"},
    {shot:"N12", what:"the machine-gun pair drag two bodies to the south wall and heave them onto the rim (IjaDragByForearm, IjaHeaveCorpseLip), the gunner prone with the bipod on the top body (IjaProneLmgOnCorpse), the loader kneeling (IjaKneelLoadLmg)",
      now:"the two bodies are on the rim from the black on (dead NRA actors, standIns.bodies), the pair walk in from J; the gunner IjaCornerFire's kneel (no native prone under a director pose), the loader ClipLoad", wave2:"IjaHeaveCorpseLip / IjaProneLmgOnCorpse / IjaKneelLoadLmg (AnimA, P1), Set's static corpses on mg.corpseLower / mg.corpseUpper"},
    {shot:"N13", what:"ijaB's thumb in the shoulder wound, twisted; the comrade arches, the cry stuck in his throat (IjaThumbWoundTwist + CaptiveArchCaught; CaptiveWoundTwist)",
      now:"CollarControl at the comrade's left shoulder; CaptiveHeadPulledBack for the arch; painMoan for the cry while CaptiveWoundTwist is not recorded", wave2:"IjaThumbWoundTwist + CaptiveArchCaught (AnimA), the CaptiveWoundTwist take (Voice)"},
    // N14-N17 (Practice, Slash)
    {shot:"N14", what:"ijaA backhands the recruit standing; the recruit's head snaps aside, the helmet knocked crooked (IjaSlapRecruit + IjaRecruitSlapped)",
      now:"IjaSlapBackhand (the crouched take over the pinned man) standing, ijaD's head turned away by the acting layer for 0.8 s; slap", wave2:"IjaSlapRecruit + IjaRecruitSlapped (AnimB; baked on Ija03 while ijaD wears IJA02 -- the integrator picks the rig)"},
    {shot:"N15", what:"the recruit backs off three steps, charges shouting, thrusts into the shoulder, then the belly; the comrade curls up in the mud howling (IjaRecruitChargeThrust + CaptiveStabbedCurl; RecruitCharge, CaptiveHowl looped)",
      now:"the native walk back and run in, IjaBayonetDownThrust twice, CaptiveStabbedCollapse (MachineGunCaptives); hitGrunt / execScream (looped) while the voices are not recorded", wave2:"IjaRecruitChargeThrust + CaptiveStabbedCurl (AnimB), RecruitCharge / CaptiveHowl takes (Voice)"},
    {shot:"N16", what:"ijaA lifts the curled man by the hair, knee in his back, pulls him back, cuts and shoves him forward with the knee (IjaHairLiftKneeBack + CaptiveCurledPulledUp, IjaThroatCutKneeShove + CaptiveThroatCutForward; throatCut)",
      now:"IjaHairGrabPull + CaptiveHeadPulledBack (the curled man is put back on his knees at the grab), IjaThroatSlash + CaptiveThroatCut, CaptiveWallSlideTwitch after; throatCut -> impactFlesh", wave2:"the four AnimB clips, Sfx throatCut"},
    {shot:"N17", what:"the blade wiped twice on the shoulder bandage and clicked onto the rifle (IjaWipeBandageFixBayonet; bayonetFixClick); the bayonet then on his muzzle",
      now:"IjaReleaseSheathe (wipe1 / wipe2 at slash.wipeS) then IjaSlingRifle backwards (the rifle off his back into his hands), fix at its end; magIn; his rifle shows no bayonet", wave2:"IjaWipeBandageFixBayonet (AnimB), the bayonet mounted on ijaA's rifle from `fix`, Sfx bayonetFixClick"},
    // N18-N19 (Finish, Found)
    {shot:"N18", what:"ijaA walking along the floor with the bayonet down, stabbing each body without stopping (IjaFinishWalkStab)",
      now:"IjaBayonetDownThrust over the native walk (upper body) at finish.bodies, the bodies dead NRA actors (standIns.bodies)", wave2:"IjaFinishWalkStab (AnimB), Set's static corpses"},
    {shot:"N19", what:"he stands over Shunzi, the bayonet a hand's breadth over his back, the right boot on Shunzi's right hand, the heel grinding (IjaBootOnHand, player track handR; bootGrind)",
      now:"the native stand with IjaReadyRifle held at found.stand (his right foot beside the hand, not on it), the hand flat and flinching (beats.Found); bootGrind -> footstepMud", wave2:"IjaBootOnHand (AnimB) with the foot on the hand, Sfx bootGrind"},
    // ---- 02, 2026-10-11 redraft (Dir02; contract §7: stand-ins until the other packages' pieces are wired) ----
    // N21 (Blade)
    {shot:"N21", what:"the recruit leans over and lays his bloody bayonet point on the left cheek, presses and cuts (IjaRecruitCheekCut, player track cheekL, events touch / cut)",
      now:"he holds IjaReadyRifle's last frame at rescue.blade.recruitAt and the director lays his rifle from his right hand onto the eye's left cheek (RecruitRifle: turned about the hand, slid along the barrel), touch / cut on rescue.blade touchS / cutS", wave2:"IjaRecruitCheekCut (AnimB) with its root placed so cheekL meets the eye's left cheek; its events in place of touchS / cutS; RecruitRifle off"},
    {shot:"N21", what:"the recruit backs off three steps and levels his rifle at the eye (IjaRecruitLevelRifle, root motion -1.8 m, hold loop)",
      now:"walked backwards to rescue.blade.levelAt at the native gait holding IjaReadyRifle, the rifle aimed at the eye by RecruitRifle", wave2:"IjaRecruitLevelRifle (AnimB) from recruitAt (its root.end = levelAt), its hold loop until the volley"},
    {shot:"N21", what:"the recruit seen past ijaA (N21 draws him in front, ijaA crouched behind on the right; here ijaA holds the hair 0.6 m from the eye, so the recruit at the left front shows over his shoulder)",
      now:"N21 judges the recruit with coverOk ijaA", wave2:"IjaRecruitCheekCut leaning him down into the picture past ijaA; drop coverOk"},
    {shot:"N21", what:"the cheekCut sound on the cut",
      now:"rescue.cheek.sound (bayonetHit, quieter)", wave2:"the Sfx package's cheekCut cue (Data_SfxSources); drop rescue.cheek.sound"},
    {shot:"N21", what:"the recruit's bayonet bloody from the practice (01 Practice, Dir01)",
      now:"a dark red smear the director puts on his bayonet's point at Blade (RecruitBlood)", wave2:"whatever 01's practice leaves on the blade (Dir01); RecruitBlood off"},
    // N22 (Charge, the volley)
    {shot:"N22", what:"ijaA's head in the picture as the volley takes the recruit (he is rising off the pinned man: his head goes out of the top of the frame)",
      now:"N22 judges him with headOptional", wave2:"look again with the N22 picture at integration (the look on his upper body, rescue.chargeView)"},
    {shot:"N22", what:"the machine-gun crew BunkerGunner / BunkerLoader on the south lip (prone on the corpse rest / kneeling), bursting every 3-6 s until the volley",
      now:"EnsureMgCrew: two IJA made by the director at rescue.mgCrew marks (AI stance prone / kneel, scripted noncombatant, entered in r.enemies under the roster ids), no bursts, no corpse rest", wave2:"Dir01's roster men (Data_FirstLevelMission bunkerAssault), IjaProneLmgOnCorpse / IjaKneelLoadLmg on the Set's mg marks and corpses, Dir01's burst loop; EnsureMgCrew finds them and makes nothing"},
    {shot:"N22", what:"the loader goes over the lip and down into the trench when shot",
      now:"the hit reaction's directional death where he kneels (it may not carry him off the lip)", wave2:"a directional death taken over the lip, or an authored fall (AnimA / Dir01)"},
    {shot:"N22", what:"ChargeB, first down the step, shot by the fold man: tumbles down and lies on his back 1 m south of the eye with his eyes open (NraShotTumbleSteps)",
      now:"the hit reaction's directional death at rescue.extras ChargeB post (falls west toward rescue.fallenComrade); the face layer's DeadSlack half-closes the lids", wave2:"NraShotTumbleSteps (AnimB P1) ending at rescue.fallenComrade, and a dead-eyes-open flag on the face layer (Script_CharacterFacialAnimation)"},
    // N23 (Melee)
    {shot:"N23", what:"ijaA, shot in the left arm, draws a grenade with his right hand, bites the pin out and raises it to his helmet (IjaGrenadeBitePin, event bite)",
      now:"IjaShotStaggerAway's hold loop with the grenade in his right hand from rescue.grenade.drawS, the pin sound at biteS", wave2:"IjaGrenadeBitePin (AnimB) chained from IjaShotStaggerAway's end, its `grenade` prop and bite event"},
    {shot:"N23", what:"the Type 91 grenade prop (in his hand, falling, rolling to finish.grenadeStop and lying there)",
      now:"the director's own olive cylinder (RescueGrenade, radiusM / lengthM), rolled to rescue.grenade.stop", wave2:"Set's `grenade` prop (Script_OpeningProps) and Data_OpeningSet0103 finish.grenadeStop in place of rescue.grenade.stop"},
    {shot:"N23", what:"short Sichuan yells only: yell_sha / yell_kan / yell_chong and one 「杀！」 each by Luo, He, Liu",
      now:"rescue.noise.yellStandIn plays the rally_* barks under those names", wave2:"the Voice package's squad bark keys; remove yellStandIn"},
    // N25 (Check, Released)
    {shot:"N25", what:"Liu kneels aiming east at the trench edge; He kneels at the right edge with his rifle",
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
    // 2026-10-11: lane[1..2] go round the Set's finish.bodies[0] (3.3,-124.55, head west, lying east) to the crater step's foot
    // (were (3.05,-124.5), (3.3,-124.2)).
    lane:Route([3.3,-125.65],[2.7,-124.35],[3.0,-123.75],[3.3,-122.2],[3.1,-121.3],[1.4,-120.8],[-.6,-120.4],[-1,-118.5],[-4,-113]),
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
