// Metres relative to the existing bunker/traffic-trench ground sampler.
// Composition follows Notion 01–03, 03–07 V2 and 08–09A V3 (2026-09-21).
export const OPENING_STORYBOARDS = Object.freeze({
  version:"20260923OpeningStoryboardsV3", animationBase:"./Animation/OpeningStoryboards/",
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
  fps:24, fov:65, fadeInS:1.8, wakeS:5.0, strikeBlackS:1.4,
  discoverS:3.6, clearWoodS:1.6, dragS:2.8, buttS:1.4, buttContactS:.85,
  ambushS:1.1, bladeContactS:.56, deflectS:1.0, pullS:2.4, kickS:1.2, kickContactS:.48,
  walkMps:2.3, turnRps:4.5, poseBlendS:.28, cameraBlendS:.65, cameraTurnRps:3.5,
  // After releasing the hands, pass the player's east side before the kick.
  // The direct pullEnd -> luoPull chord crosses the rescued player's body.
  pullReturnWaypoints:[{x:-38.95,z:-125.55},{x:-38.95,z:-127.25}],
  strikeBlood:{holdS:1.3,fadeS:8,opacity:.92},
  // Local counterattack: the same four vanguard soldiers must fall before the pull.
  vanguardIds:["BunkerExecutionerA","BunkerExecutionerB","BunkerFollowA","BunkerFollowB"],
  coverPosts:{heyoutian:{x:-41,z:-126.5},liuwencai:{x:-37.6,z:-132.5}},
  // Pass the shared door axis before spreading out; neither the partition nor
  // the collapsed west corner is a traversable shortcut from the rear room.
  coverRoutes:{
    heyoutian:[{x:-40,z:-122.25},{x:-40,z:-125.4},{x:-41,z:-126.5}],
    liuwencai:[{x:-40,z:-122.25},{x:-40,z:-127.9},{x:-37.6,z:-132.5}],
  },
  coverWaypointArrivalM:.25, coverArrivalM:.7, counterattackHoldM:.4,
  // Close counterattack has deliberate aimed fire, above the distant battle's suppression tuning.
  counterattackAccuracyScale:2,
  firstPerson:{shoulderBackM:.14,shoulderDropM:.22,shoulderHalfWidthM:.18},
  positions:{
    seated:{x:-40,z:-126.0}, trapped:{x:-40,z:-126.4}, interrogated:{x:-40,z:-129.25}, rescued:{x:-40,z:-126.1},
    yaowa:{x:-40.9,z:-127.15}, luoOrder:{x:-39.1,z:-128.2}, runner:{x:-40,z:-131.3},
    captive:{x:-40.9,z:-131.5}, controller:{x:-41.15,z:-132.25}, interpreter:{x:-38.8,z:-131.4},
    captiveStart:{x:-40.9,z:-134.5},
    guard:{x:-38.5,z:-133}, discover:{x:-40,z:-127.2}, interrogator:{x:-40.55,z:-130.1},
    interpreterNear:{x:-39.35,z:-130.3}, guardNear:{x:-40.1,z:-132.15},
    luoRear:{x:-41.5,z:-123}, luoHidden:{x:-42,z:-130.0}, luoAmbush:{x:-40.65,z:-132.7}, luoDeflect:{x:-41.35,z:-130.35},
    luoCover:{x:-42,z:-130},
    luoPull:{x:-39.5,z:-127.8}, heRear:{x:-40.7,z:-122.25}, heCover:{x:-42.65,z:-129.5},
    pullStart:{x:-39.9,z:-128.8}, pullEnd:{x:-39.9,z:-125.65},
    rifleStart:{x:-39.2,z:-127.6}, rifleEnd:{x:-39.6,z:-127.15},
    interpreterExit:{x:-37.8,z:-142.8}, blast:{x:-36.0,z:-130.5},
    march:[{x:-40.6,z:-146},{x:-39.1,z:-149},{x:-39.2,z:-135}],
  },
  shots:["Supply","Orders","Blast","Advance","Captive","Discover","Drag","Butt","Interrogate","Creep","Ambush","Deflect","Pull","Kick","Released"],
});
