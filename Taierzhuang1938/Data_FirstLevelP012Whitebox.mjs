// P0/P1/P2 独立场景白盒的章节适配。纯数据，不 import three。
// CH1 内容身份不变；P2 北正Z在Layout适配为仓库南正Z。旧 ?whitebox=1 完全不读本文件。
import { CHAPTER as FIRST_CHAPTER } from "./Data_MissionCh1.mjs";
import { VOICE_LINES as PROLOGUE_VOICE_LINES } from "./Data_MissionCh0.mjs";
import { FIRST_LEVEL_P012_LAYOUT, P012_ZONES, P012_SEMANTIC_COLORS,
  P012_ANCHORS, P012_ROUTES, P012_ENEMY_LANES,
  P012_BLUEPRINT_ANCHORS, P012_BLUEPRINT_ROUTES } from "./Data_FirstLevelP012Layout.mjs";
import { P012MapPoints, P012RailPoint, P012StationPoint } from "./Data_FirstLevelP012Space.mjs";
import { openingActivities, openingStoryBeats } from "./Data_FirstLevelP012Opening.mjs";
import { trainColumn } from "./Data_FirstLevelP012TrainColumn.mjs";
export { FIRST_LEVEL_P012_LAYOUT, P012_SEMANTIC_COLORS };
export const FIRST_LEVEL_P012_WHITEBOX_LEVEL_ID = "FirstLevelP012Whitebox";

// Preserve the authored polyline while keeping scripted moves below the AI's
// long-range navigation threshold. Coarse destination quantisation must not
// pull a soldier into the room on the other side of a swept, clear corridor.
function SubdivideRoute(points, maxLegM = 10) {
  const route = [points[0]];
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1], b = points[index];
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / maxLegM);
    for (let step = 1; step <= steps; step++) route.push(Object.freeze({
      x: a.x + (b.x - a.x) * step / steps, z: a.z + (b.z - a.z) * step / steps,
    }));
  }
  return Object.freeze(route);
}

const aliases = { Z05: "C1_Railbed", Z06: "C1_Village", Z07: "C1_SouthRoad",
  Z08: "C1_Ditch", Z09: "C1_Fallback", Z10: "C1_BackToWall" };
const zones = Object.freeze(P012_ZONES.map((zone) => Object.freeze({ ...zone,
  contentZoneId: aliases[zone.id],
  contentZoneIds: zone.id === "Z06" ? ["C1_Village", "C1_Culvert"] : undefined,
})));

// 剧情对白仍取正式 CH1。自主时刻兜底在这个模式关闭，关键事实必须由现场系统 Signal。
// 对白只认现场动作信号与阶段门；首敌时刻由实际玩法验收，不用绝对计时门锁玩家。
const voiceGate = { ch1_luo_01: 5, ch1_yaowa_01: 5, ch1_luo_02: 6,
  ch1_luo_03: 6, ch1_zhaodegui_01: 8, ch1_luo_04: 9, ch1_luo_06: 10 };
const movedVoices = new Set(["ch1_luo_01", "ch1_heyoutian_01", "ch1_shunzi_01", "ch1_luo_05"]);
// Scene-critical voices bypass only this whitebox's sequential backlog. Expired
// observations are discarded, never replayed over a later aircraft manoeuvre.
const aircraftCues = [
  ["ch1_junguan_01", "P012EscortRequestOpen", null, null],
  ["ch1_shunzi_02", "P012EscortRequested", null, null],
  ["ch1_luo_08", "P012EscortRequested", null, null],
  ["ch1_luo_09", "EscortCall", null, null],
  ["ch1_yaowa_05", "P012AircraftApproach", "P012AircraftRailFire", 4],
  ["ch1_luo_13", "P012AircraftApproach", "P012AircraftRailFire", 6],
  ["ch1_liuwencai_02", "P012AircraftRailFire", "P012AircraftRailExit", 0.4],
  ["ch1_danjiayuan_04", "P012AircraftRailExit", "P012AircraftCrowdFire", 2.5],
  ["ch1_yaowa_06", "P012AircraftCrowdFire", null, 3],
  ["ch1_luo_16", "StretcherHandoff", null, null],
  ["ch1_luo_17", "StretcherHandoff", null, null],
  ...["ch1_heyoutian_06", "ch1_heyoutian_07", "ch1_shangbing_02", "ch1_luo_14", "ch1_luo_15"]
    .map((key) => [key, "P012StretcherLifted", null, 50]),
  ["ch1_zhaodegui_03", "P012AircraftPlayerFire", "P012AircraftCrowdFire", 0.4],
  ["ch1_luo_23", "SouthCut", null, 8],
  ["ch1_luo_24", "SouthCut", null, 12],
  ["ch1_shunzi_05", "P012RetreatCover0", null, 8],
  ["ch1_shunzi_06", "P012RetreatCover1", null, 8],
  ["ch1_luo_25", "P012HubRevisited", null, 10],
  ["ch1_luo_26", "P012RetreatCover0", null, 12],
  ["ch1_luo_27", "P012RetreatCover2", null, 12],
  ["ch1_shangbing_04", "P012RegripReady", null, null],
  ["ch1_shunzi_07", "P012Regripped", null, null],
  ["ch1_heyoutian_08", "P012RetreatAmmoLow", null, 5],
  // Only an actual right-side threat may call this; no timed phantom pursuers.
  ["ch1_yaowa_10", "P012RetreatRightThreat", null, 3],
].map(([key, event, until, maxAgeS]) => Object.freeze({
  ...FIRST_CHAPTER.beats.find((beat) => beat.voice === key),
  at: `event:${event}`, p012Immediate: Object.freeze({ event, until, maxAgeS }),
  ...(key === "ch1_luo_08" ? { p012CompleteSignal: "P012EscortApproved" } : {}),
  ...(["ch1_junguan_01", "ch1_shunzi_02", "ch1_luo_08"].includes(key) ? { p012SubtitleSeconds: 2 } : {}),
}));
for (const cue of aircraftCues) movedVoices.add(cue.voice);
function ExistingPrologueVoice(key, event) {
  const line = PROLOGUE_VOICE_LINES.find((entry) => entry.key === key);
  return Object.freeze({ at: `event:${event}`, type: line.delivery === "shout" ? "shout" : "line",
    who: line.who, voice: key, text: line.text, tier: "虚构" });
}
function MovedFirstChapterVoice(key, event) {
  return Object.freeze({ ...FIRST_CHAPTER.beats.find((beat) => beat.voice === key), at: `event:${event}` });
}
// Speak only on the guide's actual arrival, not on a remote objective change.
// Audition subtitles only: no new recording or autonomous soldier chatter.
const guidanceCues = Object.freeze([
  ["Wounded", "P012GuideAtWounded", "先停一下，伤员在这里。你帮他挪进掩蔽部，我在前头看着路。"],
  ["FlankEntry", "P012GuideAtFlankEntry", "靠我这边的胸墙过来。别走正面，从这个拐角绕到破屋侧面，我在这里接应。"],
  ["Smoke", "P012GuideAtSmoke", "烟幕在这儿。点上，等烟起来，咱们带着担架走西边的沟。"],
  ["SmokeHandoff", "P012GuideSmokeHandoff", "沿西沟往回走。前后照应着担架，别落下伤员。"],
].map(([id,event,text])=>Object.freeze({at:`event:${event}`,type:"line",who:"luo",text,tier:"虚构",
  voice:`p012_text_Guide${id}`,p012SubtitleOnly:true,p012SubtitleSeconds:5.5,
  p012Immediate:Object.freeze({event,maxAgeS:12})})));
const storyBeats = Object.freeze([
  ...openingStoryBeats,
  ...guidanceCues,
  ...aircraftCues,
  ExistingPrologueVoice("ch0_luo_08", "P012WeaponReceived"),
  ...["ch1_heyoutian_01", "ch1_shunzi_01", "ch1_luo_05"].map((key) => MovedFirstChapterVoice(key, "P012AmmoTask")),
  ...FIRST_CHAPTER.beats.filter((beat) => !movedVoices.has(beat.voice)
  && !(beat.type === "env" && (["event:AtDitch", "event:AircraftTurnCrowd", "event:SouthCut"].includes(beat.at)
    || beat.text.startsWith("枪声退远了") || beat.text.startsWith("阵地入口就在前头")))
  && !["objective", "title", "narration", "end"].includes(beat.type)).map((beat) => Object.freeze({
    ...beat,
    ...(voiceGate[beat.voice] !== undefined ? { p012Beat: voiceGate[beat.voice] } : {}),
  }))]);

// Station records are compiled explicitly, once. Moving the station does not
// move the village hub, north tactical island or wounded coming from the east.
const stationActivities = P012MapPoints({
  openingCastParking:Array.from({length:6},(_,slot)=>({x:-30-slot*3,z:48})),
  weaponReceivePosition:{x:-57.2,z:45.8},weaponReceiveAnchor:{x:-57.2,z:44.75},
  weaponIssuePosition:{x:-57,z:35.7},weaponIssueAnchor:{x:-57,z:34.6},
  weaponInspectPosition:{x:-47,z:37.5},
  weaponGuideRoute:[{x:-55,z:43},{x:-55,z:33}],
  weaponGuideFacing:[{x:-57.2,z:44},{x:-57,z:34}],
}, P012StationPoint);

export const FIRST_LEVEL_P012_WHITEBOX_PHASE = Object.freeze({
  id: FIRST_LEVEL_P012_WHITEBOX_LEVEL_ID, contentId: FIRST_CHAPTER.id,
  sandbox: true, sandboxKey: "firstLevelP012Whitebox", sandboxGlyph: "012",
  date: "P0/P1/P2 场景白盒", label: "第一关 · P0/P1/P2 场景白盒",
  place: "铁路兵站", sky: "p012WhiteboxDay", ambience: "smokyDay", music: null, minutes: 26,
  brief: Object.freeze(["跟随罗班长下车，领取枪弹后随队出发。",
    "灰：地面；黄：跨过；橙：翻越；紫：攀爬；蓝：掩体；黑：边界；红：危险；绿：任务路；青：担架路。"]),
  metaText: Object.freeze(["颜色语义白盒", "正式第一章人物与玩法", "节奏校准中"]),
  level: FIRST_CHAPTER, roster: FIRST_CHAPTER.roster, mechanics: FIRST_CHAPTER.mechanics,
  objectives: Object.freeze(zones.map((zone) => zone.name)), mechanic: "跟随小队，完成当前行动。",
  // Luo and the actual squad lead the route. Internal targets remain available
  // to rules/tests, but this scene never paints a floating destination or metres.
  hud: Object.freeze({ objectiveMarkers: false, targetDistance: false }),
  nraPool: FIRST_CHAPTER.pool.start, poolGain: 0, ijaPool: 37, ijaPressure: 0.72,
  ijaSpawn: FIRST_CHAPTER.tuning.ijaSpawn, ijaSupport: [],
  ijaForce: FIRST_CHAPTER.tuning.ijaForce,
  loadoutOverride:Object.freeze({primary:null,secondary:null,melee:null,
    throwables:Object.freeze({Grenade:0,GrenadeBundle:0}),spareClips:0}),
  bounds: FIRST_LEVEL_P012_LAYOUT.bounds, cameraFar: 1100, zones,
  spawn: Object.freeze({ ...P012_ANCHORS.trainSpawn, ry: 0 }),
  whitebox: Object.freeze({
    p012: true, arrival: true, triggerAimBeforeRecoil: true, layout: FIRST_LEVEL_P012_LAYOUT, anchors: P012_ANCHORS, routes: P012_ROUTES,
    enemyLanes: P012_ENEMY_LANES, friendlyLimit: 12,
    // Activity lengths are calibration inputs, never mandatory waiting clocks.
    activities: Object.freeze({...P012MapPoints({
      guideSpeedMps: 3.05, guideRangeM: 12, routeRadiusM: 3, ambushRouteRadiusM: 0.6, observationConeRad: 0.42,
      guideSpeedByBeat: Object.freeze({ 0: 3.05, 2: 3.05, 4: 3.05, 5: 1.1, 11: 2 }),
      frontlineDoctrine: Object.freeze({ accuracyScale: 0.22, fireIntervalScale: 2.5, holdRadiusM: 2 }),
      frontlineSupply: Object.freeze({
        approach: Object.freeze([{x:5,z:-60},{x:10,z:-61}]),
        positions: Object.freeze([{x:11,z:-62},{x:15,z:-63},{x:19,z:-64}]),
        arrivalRadiusM:.3, holdRadiusM:.4,
      }),
      frontlineAmmo: Object.freeze({ stockClips: 12, carryCapClips: 4, takeSeconds: 2.4 }),
      observationSeconds: 6.5, shellObservationSeconds: 3, shellGuideRangeM: 6,
      orientations: Object.freeze([]),
      shellCoverRoute: Object.freeze([{ x: 0, z: -22 }, { x: 3, z: -30 }, { x: 5, z: -38 }, { x: 5, z: -42 }]),
      ammoRoute: Object.freeze([{ x: -7, z: -52 }, { x: 0, z: -52 }, { x: 5, z: -46 }, { x: 5, z: -59 }, { x: 5, z: -65 }]),
      roadWoundedPosition: { x: 50, z: 47 }, regripPosition: { x: -7, z: -37 },
      airRoadRoute: Object.freeze([{ x: 54, z: 57 }, { x: 50, z: 68 }, { x: 47, z: 74 }]),
      airRoadSprintMinM: 4,
      airCoverRoute: Object.freeze([{ x: 44, z: 66 }, { x: 44, z: 62 }]),
      ambushProneSegments: Object.freeze([
        { minX: 56.5, maxX: 58.7, minZ: 23.8, maxZ: 24.5, afterGroup: -1 },
        { minX: 67.3, maxX: 68.7, minZ: 23.8, maxZ: 24.2, afterGroup: 0 },
        { minX: 67.8, maxX: 72.2, minZ: 23.8, maxZ: 24.2, afterGroup: 1 },
        { minX: 71.8, maxX: 72.2, minZ: 23.8, maxZ: 43.2, afterGroup: 1 },
      ]),
      ambushProneApproaches: Object.freeze([
        { minX: 55.5, maxX: 56.5, minZ: 23.8, maxZ: 24.7 },
      ]),
      woundedDragFrom: { x: 5, z: -65 }, woundedDragTo: { x: -7, z: -52 },
      woundedDragRoute: Object.freeze([{ x: 5, z: -65 }, { x: 5, z: -59 }, { x: 5, z: -46 }, { x: 0, z: -52 }, { x: -7, z: -52 }]),
      woundedDragMinM: 10, stretcherCarryTo: { x: 44, z: 60 }, stretcherCarryMinM: 10,
      woundedGuideRoute: Object.freeze([P012_BLUEPRINT_ANCHORS.gunports[0], P012_BLUEPRINT_ANCHORS.gunports[1],
        { x: 5, z: -59 }, { x: 5, z: -46 }, { x: 0, z: -52 }, { x: -7, z: -52 }]),
      // All six exist before the flank begins: different wall/door sightlines,
      // never late pop-in beside a player who has already crossed the room.
      ambushGroups: Object.freeze([
        { routeIndex: 0, cover: { x: 39, z: 25.5 }, label: "从蓝色胸墙后起身观察道路，压制拦路火力",
          positions: [{ x: 58, z: 39 }, { x: 57, z: 41 }] },
        { routeIndex: 2, cover: { x: 68, z: 24 }, label: "注意屋内侧窗，清除室内射手再继续侧绕",
          positions: [{ x: 68, z: 34 }, { x: 70, z: 36 }] },
        { routeIndex: 5, cover: { x: 72, z: 43 }, label: "观察屋南出口，清除阻断回队道路的日军",
          positions: [{ x: 67, z: 49 }, { x: 70, z: 49 }] },
      ]),
      ambushEntryRoute: Object.freeze([{ x: 42.5, z: 24 }, { x: 39, z: 25.5 }]),
      ambushColumnCoverRoute: Object.freeze([{ x: 32, z: 14.4 }, { x: 34, z: 18.8 }]),
      closeFightRoute: Object.freeze([{ x: 44, z: 62 }]),
      closeFightGroups: Object.freeze([
        [{ x: 58, z: 52 }, { x: 62, z: 55 }],
        [{ x: 58, z: 58 }, { x: 62, z: 62 }],
        [{ x: 58, z: 65 }, { x: 61, z: 69 }],
      ].map((positions, group) => ({ routeIndex: 0, cover: { x: 44, z: 62 },
        label: "守住伤员所在路沟，注意东北与东南两路逼近",
        positions, spawns: positions.map((_, index) => {
          const slot = group * 2 + index;
          return { x: 72, z: slot < 3 ? 28 + slot * 2 : 61.5 + (slot - 3) * 2.5 };
        }),
        relocations: [[{ x: 56, z: 52 }, { x: 60, z: 55 }],
          [{ x: 56, z: 58 }, { x: 60, z: 62 }], [{ x: 56, z: 65 }, { x: 63, z: 69 }]][group],
        stagingStopIndices: positions.map((_, index) => group * 2 + index < 3 ? 2 : -1),
        approaches: positions.map((_, index) => {
          const slot = group * 2 + index;
          return slot < 3 ? [{ x: 74, z: 30 }, { x: 74, z: 38 }, { x: 74, z: 45 + slot * 1.5 },
            ...(slot < 2 ? [{ x: 74, z: 48 }] : []), { x: 66.5, z: 48 }, { x: 59, z: 48 },
            ...(slot ? [{ x: 58, z: 54 }] : [])]
            : [{ x: 69, z: 73 }, { x: 64, z: 73 }, { x: 64, z: 67 }];
        }),
      }))),
      southFightGroups: Object.freeze([
        { routeIndex: 2, cover: { x: 42, z: 94 }, label: "从路沟掩体清除南路道路火力",
          relocations: [{ x: 51, z: 103 }, { x: 55, z: 108 }],
          positions: [{ x: 49, z: 104 }, { x: 53, z: 108 }] },
        { routeIndex: 4, cover: { x: 41, z: 100 }, label: "绕过院墙，在胸墙后清除屋外射手",
          relocations: [{ x: 26, z: 97.5 }, { x: 32.5, z: 98 }],
          positions: [{ x: 28, z: 97 }, { x: 34.5, z: 99 }] },
        { routeIndex: 7, cover: { x: 34, z: 105 }, label: "从门口掩护位置观察室内，清除残敌再进屋",
          relocations: [{ x: 29, z: 109 }, { x: 31, z: 109.5 }],
          positions: [{ x: 27, z: 109 }, { x: 33, z: 109.5 }] },
      ]),
      stretcherCarryRoute: Object.freeze([{ x: 44, z: 66 }, { x: 44, z: 60 }]),
      southGrenadeSupply: { x: 42, z: 94 }, southGrenadeStock: 2,
      southRoom: { x: 30, z: 105 }, southGrenadeAim: { x: 49, z: 104 }, southSupplyRouteIndex: 2,
      southRoomRoute: Object.freeze([{ x: 44, z: 66 }, { x: 47, z: 80 }, { x: 42, z: 94 }, { x: 41, z: 98 }, { x: 41, z: 100 }, { x: 41, z: 104.4 },
        { x: 34, z: 104.4 }, { x: 34, z: 105 }, { x: 30, z: 105 }]),
      southAssemblyRoute: Object.freeze([{ x: 34, z: 105 }, { x: 34, z: 104.4 },
        { x: 41, z: 104.4 }, { x: 41, z: 98 }, { x: 42, z: 94 }]),
      retreatSmokeUse: { x: 28, z: 96 }, retreatSmokeAt: { x: 40, z: 99 },
      finalCarryMinM: 10, retreatCoverIndices: Object.freeze([2, 5, 8]), farEnemyBudget: 4,
      retreatColumnSpeedMps: 2.05,
      retreatRejoinEnterM: 20, retreatRejoinExitM: 10,
      retreatPursuitRoutes: Object.freeze([
        [[66,114],[62,108],[57,99],[47,93],[37,89.5],[35,89.5],[35,87]],
        [[70,115],[64,108],[59,99],[49,93],[39,90],[35,90],[33,88],[25,80]],
      ].map(route => Object.freeze(route.map(([x,z]) => ({x,z}))))),
      evacStagingPosition:{x:30,z:10}, airAttackStartPosition:{x:50,z:60}, airColumnReadyPosition:{x:50,z:68},
      southAssemblyPosition:{x:42,z:94}, airCoverEntryPosition:{x:44,z:66},
      ditchContinuationRoute:[{x:44,z:66},{x:47,z:80},{x:42,z:94}],
    }),
      ...stationActivities,
      ...openingActivities,
      openingMarch:true,
      openingMarchRoute:Object.freeze([{x:-51,z:90},{x:-43,z:94},...P012_ROUTES.village.slice(1),
        ...P012_ROUTES.approach,{x:5,z:-92},{x:5,z:-99},{x:5,z:-104}]),
      openingMarchDefensePositions:Object.freeze([
        {x:-17,z:-103},{x:-13,z:-103},{x:-9,z:-103},{x:-5,z:-103},{x:-1,z:-103},{x:9,z:-102},
      ]),
      openingMarchHoldRadiusM:.4,
      trainColumn,
      briefing:Object.freeze({position:{x:-51,z:90},route:[{x:-55,z:93},{x:-51,z:93},{x:-51,z:90}],playerRadiusM:8,readyCount:2}),
      villageInspections:Object.freeze([{index:3,event:"P012VillageCheck0"},{index:5,event:"P012VillageCheck1"},{index:7,event:"P012VillageCheck2"}]),
      initialEquipment:Object.freeze({weapon:"HanYang",clips:3,grenades:6}),
      openingIssue:Object.freeze({
        spawns:Object.freeze(Array.from({length:6},(_,slot)=>P012StationPoint(-67.2,62+slot*1.7))),
        exitRoute:Object.freeze([P012StationPoint(-66,61),P012StationPoint(-60,61),
          P012StationPoint(-55,55),P012StationPoint(-55,44)]),
        weaponPoint:P012StationPoint(-55,44),ammoPoint:P012StationPoint(-55,34),
        musterRoute:Object.freeze([P012StationPoint(-51,34),P012StationPoint(-51,48)]),
        musterPoints:stationActivities.openingCastParking,weaponSeconds:1,ammoSeconds:.8,
      }),
      arrivalGuideStart:Object.freeze({x:-65.8,z:122.1}),arrivalGatePoint:Object.freeze({x:-63.6,z:121}),
      trainRoute:Object.freeze(P012_ROUTES.trainExit.map((point,index)=>index===1?Object.freeze({x:-64.4,z:121}):point)),
      villageRoute:Object.freeze([{x:-51,z:90},{x:-43,z:94},...P012_ROUTES.village.slice(1)]),
      openingCastRoute:Object.freeze([P012StationPoint(-29,48),P012StationPoint(-29,40),
        ...P012_ROUTES.village.slice(1).map(point=>({x:point.x-1.4,z:point.z}))]),
      shellCoverRoute:P012_ROUTES.approach,
      northApproachChatPosition:P012_ROUTES.approach[0], northNearMissAfterM:10,
      shellObservationIndices:Object.freeze([3,4,5,6]),
      // The squad leader knows the route; there is no look-direction minigame.
      orientations: Object.freeze([]),
      // Pursuers follow the newly connected physical return road; they do not
      // run to the coordinates of the removed compact-map western ditch.
      retreatPursuitRoutes:Object.freeze([
        [{x:126,z:114},{x:117,z:99},{x:108,z:94},{x:102,z:94},{x:102,z:98},{x:85,z:83},{x:68,z:68}],
        [{x:130,z:115},{x:119,z:99},{x:110,z:92},{x:100,z:92},{x:100,z:96},{x:87,z:85},{x:70,z:68}]
      ].map(route=>SubdivideRoute(route))),
      retreatSmokeUse:{x:85,z:83},retreatSmokeAt:{x:100,z:99},retreatCoverIndices:Object.freeze([2,4,6]),
    }),
    storyBeats, actualEventsOnly: true,
    firstContact: Object.freeze({ atS: 285, fullWaveAtS: 330,
      scoutSearch: Object.freeze(P012MapPoints({ speedMps: 0.65, approachSpeedMps: 0.9,
        entries: [
          { spawn: {x:14,z:-118}, points: [{x:5,z:-118},{x:-2,z:-118}] },
          { spawn: {x:14,z:-120}, points: [{x:5,z:-120},{x:-4,z:-120}] },
        ] })),
      scout: Object.freeze({ ...P012_ANCHORS.scout, weapon: "Type38" }),
      wave: Object.freeze({ minDistanceM: 45, maxDistanceM: 60, lateralSpanM: 18, deepShare: 0 }) }),
    timing: Object.freeze({ targetMinutes: [23,26], combatShare: 0.55, escortShare: 0.45,
      firstShotWindowS: [270,330], pressureIntervalS: [30,50], maxPureWaitS: 8, z10DurationS: [90,120] }),
    escortWaypoints: P012_ROUTES.south.slice(0,-1), returnWaypoints: P012_ROUTES.retreat,
    aircraftRoutes: Object.freeze({
      // Rail fire stays west at x=-72; its exit is two metres beyond z110.
      // A continuous five-second turn approaches the crowd from the south,
      // then sweeps north along the road; this is not same-direction pursuit.
      railPass: Object.freeze({ from: P012_ANCHORS.railPassFrom, to: P012_ANCHORS.railPassTo,
        approachM: 160, exitM: 120, altitudeM: 34, entryAltM: 45, exitAltM: 42 }),
      crowdTurn: Object.freeze({ from: P012_ANCHORS.crowdTurnFrom, to: P012_ANCHORS.crowdTurnTo,
        aircraftId: "MitsubishiKi30",
        approachM: 140, leadM: 55, fireFromS: 5, entryAltM: 42, altitudeM: 28,
        turnFrom: P012RailPoint(-72,112), turnControl: P012RailPoint(-72,185), turnControl2: { x: 110, z: 210 } }),
      divePress: Object.freeze({ from: P012_ANCHORS.diveFrom, to: P012_ANCHORS.diveTo,
        aircraftId: "MitsubishiKi30",
        speed: 32, approachM: 160, entryAltM: 38, altitudeM: 24,
        player: { windowS: 2.2, atS: 6.52 } }),
    }),
    barkPolicy: Object.freeze({ suppressAutonomousUntilSignal: "P012Complete",
      preserveScriptedVoices: true, preserveTacticalPrompts: true }),
  }),
});
export default FIRST_LEVEL_P012_WHITEBOX_PHASE;
