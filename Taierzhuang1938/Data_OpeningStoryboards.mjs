// Metres relative to the existing bunker/traffic-trench ground sampler.
// Composition follows Notion 01–03, 03–07 V2 and 08–09A V3 (2026-09-21).
export const OPENING_STORYBOARDS = Object.freeze({
  version:"20260922OpeningStoryboardsV1", animationBase:"./Animation/OpeningStoryboards/",
  fps:24, fov:65, fadeInS:1.8, wakeS:5.0, strikeBlackS:1.4,
  discoverS:1.6, dragS:2.2, buttS:1.4, ambushS:.85, deflectS:.8, pullS:2, kickS:1.2,
  positions:{
    seated:{x:-40,z:-126.0}, trapped:{x:-40,z:-126.4}, interrogated:{x:-40,z:-129.25}, rescued:{x:-40,z:-126.1},
    yaowa:{x:-40.9,z:-127.15}, luoOrder:{x:-39.1,z:-128.2}, runner:{x:-40,z:-131.3},
    captive:{x:-40.9,z:-131.5}, controller:{x:-41.15,z:-132.25}, interpreter:{x:-38.8,z:-131.4},
    guard:{x:-38.5,z:-133}, discover:{x:-40,z:-127.2}, interrogator:{x:-40.55,z:-130.1},
    interpreterNear:{x:-39.35,z:-130.3}, guardNear:{x:-40.1,z:-132.15},
    luoRear:{x:-41.5,z:-123}, luoHidden:{x:-42,z:-130.0}, luoAmbush:{x:-40.65,z:-132.7}, luoDeflect:{x:-40.7,z:-130.35},
    luoPull:{x:-39.5,z:-127.8}, heCover:{x:-42.65,z:-129.5},
    pullStart:{x:-39.5,z:-128.55}, pullEnd:{x:-39.5,z:-125.4},
    rifleStart:{x:-39.2,z:-127.6}, rifleEnd:{x:-39.6,z:-127.15},
    interpreterExit:{x:-37.8,z:-142.8}, blast:{x:-36.0,z:-130.5},
    march:[{x:-40.6,z:-146},{x:-39.1,z:-149},{x:-39.2,z:-135}],
  },
  shots:["Supply","Orders","Blast","Advance","Captive","Discover","Drag","Butt","Interrogate","Creep","Ambush","Deflect","Pull","Kick","Released"],
});
