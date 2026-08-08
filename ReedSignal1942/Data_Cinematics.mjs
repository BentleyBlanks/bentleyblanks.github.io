function DeepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) DeepFreeze(child);
  return value;
}

// These sequences never alter historical outcomes or gameplay rewards. They
// only reframe state that the rules layer has already produced, keeping the
// story in the same continuous 3D space as play.
export const CinematicSequences = DeepFreeze({
  schoolOpening: {
    id: "schoolOpening",
    duration: 5.6,
    skippableAfter: 0.9,
    lockInput: 1.05,
    segments: [
      {
        from: 0,
        to: 1.65,
        camera: { anchorX: 330, viewDistance: 11.7, lift: 1.76, lookLift: 0.78, targetZ: -1.2 },
        actors: { player: "write" },
        caption: "纸会湿。名字要记在心里。",
        soundCue: "paper",
      },
      {
        from: 1.65,
        to: 3.65,
        camera: { anchorX: 470, viewDistance: 20.6, lift: 3.08, lookLift: 1.3, targetZ: -1.35 },
        actors: { player: "listen" },
        caption: "封锁线留下以后，教室先空了。",
        soundCue: "wind",
      },
      {
        from: 3.65,
        to: 5.6,
        camera: { anchorX: 680, viewDistance: 15.2, lift: 2.42, lookLift: 1.02, targetZ: -0.72 },
        actors: { player: "shield" },
        caption: "阿苇把点名簿贴在胸口，走进第一束灯。",
      },
    ],
  },
  blockadeOpening: {
    id: "blockadeOpening",
    duration: 4.8,
    skippableAfter: 0.8,
    lockInput: 0.9,
    segments: [
      {
        from: 0,
        to: 2.15,
        camera: { anchorX: 1450, viewDistance: 24.0, lift: 3.72, lookLift: 1.34, targetZ: -2.2 },
        actors: { player: "listen", followers: "peek" },
        caption: "沟、堤、岗楼，把村与村切成了几段。",
        soundCue: "water",
      },
      {
        from: 2.15,
        to: 4.8,
        camera: { anchorX: 360, viewDistance: 14.0, lift: 2.38, lookLift: 0.98, targetZ: -0.65 },
        actors: { player: "listen", followers: "shield" },
        caption: "阿苇不看灯，只看苇梢什么时候一起低头。",
        soundCue: "wind",
      },
    ],
  },
  tunnelOpening: {
    id: "tunnelOpening",
    duration: 4.7,
    skippableAfter: 0.8,
    lockInput: 1.0,
    segments: [
      {
        from: 0,
        to: 2.1,
        camera: { anchorX: 1520, viewDistance: 16.2, lift: 2.12, lookLift: 1.08, targetZ: -1.55 },
        actors: { player: "listen", followers: "peek" },
        caption: "土层很薄，烟却会顺着每条裂缝往下找人。",
        soundCue: "smoke",
      },
      {
        from: 2.1,
        to: 4.7,
        camera: { anchorX: 590, viewDistance: 11.9, lift: 1.68, lookLift: 0.92, targetZ: -0.35 },
        actors: { player: "lift", followers: "shield" },
        caption: "先给烟一条向上的路，再去找黑暗里的回声。",
      },
    ],
  },
  ferryOpening: {
    id: "ferryOpening",
    duration: 5.2,
    skippableAfter: 0.9,
    lockInput: 1.0,
    segments: [
      {
        from: 0,
        to: 2.35,
        camera: { anchorX: 2300, viewDistance: 24.5, lift: 3.82, lookLift: 1.38, targetZ: -3.0 },
        actors: { player: "count", followers: "count", mother: "listen" },
        caption: "远岸有船，南汊有灯，中间是六个名字。",
        soundCue: "water",
      },
      {
        from: 2.35,
        to: 5.2,
        camera: { anchorX: 520, viewDistance: 14.4, lift: 2.4, lookLift: 1.0, targetZ: -0.7 },
        actors: { player: "count", followers: "peek", mother: "listen" },
        caption: "点名不是数数，是确认每个人还在。",
        soundCue: "soft",
      },
    ],
  },
  tunnelRollCall: {
    id: "tunnelRollCall",
    duration: 4.9,
    skippableAfter: 1.0,
    lockInput: 1.25,
    blocksCompletion: true,
    segments: [
      {
        from: 0,
        to: 1.6,
        camera: { anchorX: 1620, viewDistance: 10.9, lift: 1.54, lookLift: 0.84, targetZ: -0.2 },
        actors: { player: "count", followers: "peek", followerStagger: 0.13 },
        caption: "杏花。小锁。春妮。石头。",
        soundCue: "soft",
      },
      {
        from: 1.6,
        to: 3.55,
        camera: { anchorX: 1760, viewDistance: 12.0, lift: 1.68, lookLift: 0.9, targetZ: -0.55 },
        actors: { player: "listen", followers: "count", followerStagger: 0.17 },
        caption: "黑暗里，四声轻轻的“到”。",
        soundCue: "knock",
      },
      {
        from: 3.55,
        to: 4.9,
        camera: { anchorX: 1980, viewDistance: 11.1, lift: 1.56, lookLift: 0.84, targetZ: -0.25 },
        actors: { player: "lift", followers: "shield" },
        caption: "第六个孩子没出声，只把手举了起来。",
      },
    ],
  },
  tunnelHandoff: {
    id: "tunnelHandoff",
    duration: 3.8,
    skippableAfter: 0.85,
    lockInput: 1.15,
    blocksCompletion: true,
    segments: [
      {
        from: 0,
        to: 2.25,
        camera: { anchorX: 2290, viewDistance: 10.8, lift: 1.48, lookLift: 0.82, targetZ: -0.08 },
        actors: { player: "pass", followers: "pass", followerStagger: 0.08 },
        caption: "井口伸下一双手。没有人问这孩子是哪一家的。",
        soundCue: "cloth",
      },
      {
        from: 2.25,
        to: 3.8,
        camera: { anchorX: 2350, viewDistance: 12.7, lift: 1.78, lookLift: 0.94, targetZ: -0.35 },
        actors: { player: "listen", followers: "peek" },
        caption: "手接住了，阿苇才松开。",
      },
    ],
  },
  motherHandoff: {
    id: "motherHandoff",
    duration: 3.8,
    skippableAfter: 0.85,
    lockInput: 1.1,
    blocksCompletion: true,
    segments: [
      {
        from: 0,
        to: 1.9,
        camera: { anchorX: 1900, viewDistance: 11.6, lift: 2.06, lookLift: 0.9, targetZ: -0.1 },
        actors: { player: "pass", followers: "peek", mother: "pass" },
        caption: "周禾只翻了一页。六个名字，一个不少。",
        soundCue: "paper",
      },
      {
        from: 1.9,
        to: 3.8,
        camera: { anchorX: 2040, viewDistance: 12.8, lift: 2.18, lookLift: 0.94, targetZ: -0.3 },
        actors: { player: "listen", followers: "count", mother: "signal" },
        caption: "“过河以后，再点一次。”",
        soundCue: "soft",
      },
    ],
  },
  motherSignal: {
    id: "motherSignal",
    duration: 4.7,
    skippableAfter: 0.95,
    lockInput: 1.2,
    blocksCompletion: true,
    segments: [
      {
        from: 0,
        to: 2.0,
        camera: { anchorX: 2070, viewDistance: 11.9, lift: 2.24, lookLift: 0.98, targetZ: -0.25 },
        actors: { player: "shield", followers: "shield", mother: "signal" },
        effects: { signalWind: [0.2, 1] },
        caption: "白布先吃住了风，马灯才转向南汊。",
        soundCue: "bell",
      },
      {
        from: 2.0,
        to: 4.7,
        camera: { anchorX: 2350, viewDistance: 17.8, lift: 2.86, lookLift: 1.08, targetZ: -1.5 },
        actors: { player: "peek", followers: "peek", mother: "listen" },
        effects: { signalWind: [1, 0.65] },
        caption: "灯跟着她走远。渡口这边，六个孩子开始向前。",
        soundCue: "wind",
      },
    ],
  },
  endingDeparture: {
    id: "endingDeparture",
    duration: 10.2,
    skippableAfter: 2.4,
    lockInput: "all",
    blocksCompletion: true,
    blocksEnding: true,
    segments: [
      {
        from: 0,
        to: 2.55,
        camera: { anchorX: 3230, viewDistance: 12.8, lift: 2.18, lookLift: 0.92, targetZ: 0.05 },
        actors: { player: "pass", followers: "board", followerStagger: 0.18, mother: "listen" },
        effects: { boarding: [0, 0.55], playerBoarding: 0, ferryDeparture: 0 },
        caption: "麦子。杏花。小锁。春妮。石头。栓儿。",
        soundCue: "plank",
      },
      {
        from: 2.55,
        to: 4.75,
        camera: { anchorX: 3290, viewDistance: 11.8, lift: 2.05, lookLift: 0.86, targetZ: 0.12 },
        actors: { player: "count", followers: "board", followerStagger: 0.15, mother: "listen" },
        effects: { boarding: [0.55, 1], playerBoarding: 0, ferryDeparture: 0 },
        caption: "六声“到”，先过了船板。",
        soundCue: "soft",
      },
      {
        from: 4.75,
        to: 6.65,
        camera: { anchorX: 3310, viewDistance: 12.6, lift: 2.18, lookLift: 0.9, targetZ: 0.08 },
        actors: { player: "board", followers: "count", mother: "signal" },
        effects: { boarding: 1, playerBoarding: [0, 1], ferryDeparture: [0, 0.08] },
        caption: "阿苇最后上船，仍把点名簿护在衣襟里。",
        soundCue: "rope",
      },
      {
        from: 6.65,
        to: 10.2,
        camera: { anchorX: 3460, viewDistance: 23.0, lift: 3.72, lookLift: 1.28, targetZ: -2.8 },
        actors: { player: "listen", followers: "huddle", mother: "listen" },
        effects: { boarding: 1, playerBoarding: 1, ferryDeparture: [0.08, 1] },
        caption: "船向北，灯向南。天快亮了。",
        soundCue: "water",
      },
    ],
  },
});

export const ChapterOpeningCinematics = DeepFreeze({
  school: "schoolOpening",
  blockade: "blockadeOpening",
  tunnel: "tunnelOpening",
  ferry: "ferryOpening",
});

export const ActionCinematics = DeepFreeze({
  findChildren: "tunnelRollCall",
  handShuanUp: "tunnelHandoff",
  meetMother: "motherHandoff",
  motherSignal: "motherSignal",
  boardFerry: "endingDeparture",
});

export function GetCinematicSequence(sequenceId) {
  return CinematicSequences[sequenceId] || null;
}

export function GetChapterOpeningCinematic(chapterId) {
  return ChapterOpeningCinematics[chapterId] || null;
}

export function GetActionCinematic(actionId) {
  return ActionCinematics[actionId] || null;
}
