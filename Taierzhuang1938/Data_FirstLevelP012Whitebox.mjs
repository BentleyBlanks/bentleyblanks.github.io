// P0/P1/P2 独立场景白盒的章节适配。纯数据，不 import three。
// CH1 内容身份不变；P2 北正Z在Layout适配为仓库南正Z。旧 ?whitebox=1 完全不读本文件。
import { CHAPTER as FIRST_CHAPTER } from "./Data_MissionCh1.mjs";
import { VOICE_LINES as PROLOGUE_VOICE_LINES } from "./Data_MissionCh0.mjs";
import { FIRST_LEVEL_P012_LAYOUT, P012_ZONES, P012_SEMANTIC_COLORS,
  P012_ANCHORS, P012_ROUTES, P012_ENEMY_LANES } from "./Data_FirstLevelP012Layout.mjs";
export { FIRST_LEVEL_P012_LAYOUT, P012_SEMANTIC_COLORS };
export const FIRST_LEVEL_P012_WHITEBOX_LEVEL_ID = "FirstLevelP012Whitebox";

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
const storyBeats = Object.freeze([
  ...aircraftCues,
  ExistingPrologueVoice("ch0_junguan_04", "P012Arrival"),
  ExistingPrologueVoice("ch0_luo_11", "P012TrainDoor"),
  ExistingPrologueVoice("ch0_luo_08", "P012WeaponReceived"),
  MovedFirstChapterVoice("ch1_luo_01", "P012AmmoIssued"),
  ...["ch1_heyoutian_01", "ch1_shunzi_01", "ch1_luo_05"].map((key) => MovedFirstChapterVoice(key, "P012AmmoTask")),
  ...FIRST_CHAPTER.beats.filter((beat) => !movedVoices.has(beat.voice)
  && !(beat.type === "env" && (["event:AtDitch", "event:AircraftTurnCrowd", "event:SouthCut"].includes(beat.at)
    || beat.text.startsWith("枪声退远了") || beat.text.startsWith("阵地入口就在前头")))
  && !["objective", "title", "narration", "end"].includes(beat.type)).map((beat) => Object.freeze({
    ...beat,
    ...(voiceGate[beat.voice] !== undefined ? { p012Beat: voiceGate[beat.voice] } : {}),
  }))]);

export const FIRST_LEVEL_P012_WHITEBOX_PHASE = Object.freeze({
  id: FIRST_LEVEL_P012_WHITEBOX_LEVEL_ID, contentId: FIRST_CHAPTER.id,
  sandbox: true, sandboxKey: "firstLevelP012Whitebox", sandboxGlyph: "012",
  date: "P0/P1/P2 场景白盒", label: "第一关 · P0/P1/P2 场景白盒",
  place: "临时兵站", sky: "p012WhiteboxDay", ambience: "smokyDay", music: null, minutes: 26,
  brief: Object.freeze(["跟随罗班长下车，领取子弹并检查步枪。",
    "灰：地面；黄：跨过；橙：翻越；紫：攀爬；蓝：掩体；黑：边界；红：危险；绿：任务路；青：担架路。"]),
  metaText: Object.freeze(["颜色语义白盒", "正式第一章人物与玩法", "节奏校准中"]),
  level: FIRST_CHAPTER, roster: FIRST_CHAPTER.roster, mechanics: FIRST_CHAPTER.mechanics,
  objectives: Object.freeze(zones.map((zone) => zone.name)), mechanic: "跟随小队，完成当前行动。",
  nraPool: FIRST_CHAPTER.pool.start, poolGain: 0, ijaPool: 37, ijaPressure: 0.72,
  ijaSpawn: FIRST_CHAPTER.tuning.ijaSpawn, ijaSupport: [],
  ijaForce: FIRST_CHAPTER.tuning.ijaForce, loadoutOverride: FIRST_CHAPTER.tuning.loadoutOverride,
  bounds: FIRST_LEVEL_P012_LAYOUT.bounds, cameraFar: 330, zones,
  spawn: Object.freeze({ ...P012_ANCHORS.trainSpawn, ry: 0 }),
  whitebox: Object.freeze({
    p012: true, layout: FIRST_LEVEL_P012_LAYOUT, anchors: P012_ANCHORS, routes: P012_ROUTES,
    enemyLanes: P012_ENEMY_LANES, friendlyLimit: 12,
    // Activity lengths are calibration inputs, never mandatory waiting clocks.
    activities: Object.freeze({
      traffic: Object.freeze([
        ...[0,1,2].map(slot=>({side:0,slot,role:"soldier",releaseBeat:0,
          proximityRelease:slot===0?{index:3,beat:2,radius:18}:undefined,
          route:[{x:-54,z:66-slot*3},{x:-54,z:49-slot*3},{x:-54,z:40},{x:-43,z:38},{x:-34,z:38},{x:-32,z:30},{x:-32,z:18-slot*3}],pauseIndex:1})),
        ...[0,1,2].map(slot=>({side:1,slot,role:"civilian",variant:slot===1?"female":"male",releaseBeat:0,
          route:[{x:-59,z:20+slot*3},{x:-59,z:46+slot*3},{x:-59,z:58},{x:-56,z:62},{x:-52,z:62+slot*3}],pauseIndex:1})),
        ...[0,1].map(slot=>({side:1,slot:3+slot,role:"walking",releaseBeat:1,
          proximityRelease:slot===0?{index:1,beat:2,radius:18}:undefined,
          route:[{x:-28,z:19+slot*3},{x:-28,z:30},{x:-34,z:40},{x:-43,z:42},{x:-50,z:42},{x:-50,z:52},{x:-52,z:54},{x:-52,z:56+slot*3}]})),
      ]),
      guideSpeedMps: 1.3, guideRangeM: 12, routeRadiusM: 3, ambushRouteRadiusM: 0.6, observationConeRad: 0.42,
      guideSpeedByBeat: Object.freeze({ 0: 0.6, 2: 0.685, 4: 0.85, 5: 0.85, 11: 2 }),
      frontlineDoctrine: Object.freeze({ accuracyScale: 0.22, fireIntervalScale: 2.5, holdRadiusM: 2 }),
      frontlineAmmo: Object.freeze({ stockClips: 12, carryCapClips: 4, takeSeconds: 2.4 }),
      weaponReceivePosition: { x: -57.2, z: 45.8 }, weaponReceiveAnchor: { x: -57.2, z: 44.75 },
      weaponIssuePosition: { x: -57, z: 35.7 }, weaponIssueAnchor: { x: -57, z: 34.6 },
      weaponInspectPosition: { x: -47, z: 37.5 },
      weaponGuideRoute: [{x:-55,z:43},{x:-55,z:33},{x:-45,z:35}],
      weaponGuideFacing: [{x:-57.2,z:44},{x:-57,z:34},{x:-47,z:36}],
      observationSeconds: 6.5, shellObservationSeconds: 3, shellGuideRangeM: 6,
      trainRoute: P012_ROUTES.trainExit, villageRoute: P012_ROUTES.north.slice(2, 8),
      orientations: Object.freeze([
        { position: { x: 7, z: 6 }, lookAt: { x: -30, z: 30 }, label: "辨认西南侧兵站后路",
          visibleTarget: { id: "SouthStation", blockId: "StationWindowSill", point: { x: -63.3, y: 0.7, z: 51 } } },
        { position: { x: 2, z: -12 }, lookAt: { x: 5, z: -65 }, label: "观察北面的阵地入口",
          visibleTarget: { id: "NorthFrontline", blockId: "Gunport1Cover", point: { x: 5, y: 0.7, z: -67 } } },
        { position: { x: -3, z: 0 }, lookAt: { x: -72, z: 0 }, label: "看向西侧铁路路基",
          visibleTarget: { id: "WestRailway", blockId: "RailEmbankment", point: { x: -68.5, y: 1.6, z: 0 } } },
        { position: { x: 16, z: 5 }, via: { x: 0, z: 0 }, lookAt: { x: 30, z: 10 }, label: "记住东南侧的伤员后送道路",
          visibleTarget: { id: "EvacuationEntrance", blockId: "EvacEastCourtyard", point: { x: 37.5, y: 1.4, z: 9 },
            points: [3,6,12,15].map(z=>({x:37.5,y:1.4,z})),
            requiredPoints: [{x:28,z:9.3},{x:29,z:9.65},{x:30,z:10},{x:31,z:12.2}]
              .flatMap(point=>[-.6,0,.6].map(offset=>({x:point.x+offset,y:.06,z:point.z}))) } },
      ]),
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
      woundedGuideRoute: Object.freeze([P012_ANCHORS.gunports[0], P012_ANCHORS.gunports[1],
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
        stagingStopIndices: positions.map((_, index) => group * 2 + index < 3 ? 1 : -1),
        approaches: positions.map((_, index) => {
          const slot = group * 2 + index;
          return slot < 3 ? [{ x: 74, z: 30 }, { x: 74, z: 45 + slot * 1.5 },
            ...(slot < 2 ? [{ x: 74, z: 48 }] : []), { x: 59, z: 48 },
            ...(slot ? [{ x: 58, z: 54 }] : [])]
            : [{ x: 69, z: 73 }, { x: 64, z: 73 }, { x: 64, z: 67 }];
        }),
      }))),
      southFightGroups: Object.freeze([
        { routeIndex: 2, cover: { x: 42, z: 94 }, label: "从路沟掩体清除南路道路火力",
          relocations: [{ x: 51, z: 103 }, { x: 55, z: 108 }],
          positions: [{ x: 49, z: 104 }, { x: 53, z: 108 }] },
        { routeIndex: 5, cover: { x: 41, z: 104.4 }, label: "注意民房北侧，清除屋外射手",
          relocations: [{ x: 26, z: 96 }, { x: 33, z: 98 }],
          positions: [{ x: 28, z: 97 }, { x: 35, z: 99 }] },
        { routeIndex: 6, cover: { x: 34, z: 105 }, label: "从门口掩护位置观察室内，清除残敌再进屋",
          relocations: [{ x: 29, z: 109 }, { x: 31, z: 109.5 }],
          positions: [{ x: 27, z: 109 }, { x: 33, z: 109.5 }] },
      ]),
      stretcherCarryRoute: Object.freeze([{ x: 44, z: 66 }, { x: 44, z: 60 }]),
      southGrenadeSupply: { x: 42, z: 94 }, southGrenadeStock: 2,
      southRoom: { x: 30, z: 105 }, southGrenadeAim: { x: 49, z: 104 }, southSupplyRouteIndex: 2,
      southRoomRoute: Object.freeze([{ x: 44, z: 66 }, { x: 47, z: 80 }, { x: 42, z: 94 }, { x: 41, z: 98 }, { x: 41, z: 104.4 },
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
    }),
    storyBeats, actualEventsOnly: true,
    firstContact: Object.freeze({ atS: 285, fullWaveAtS: 330,
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
        turnFrom: { x: -72, z: 112 }, turnControl: { x: -72, z: 185 }, turnControl2: { x: 50, z: 210 } }),
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
