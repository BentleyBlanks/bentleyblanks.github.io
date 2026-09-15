// 屋内伏击（第一关 Melee 段）的 Blender 原骨架轨道。与 FirstLevelCarriage 同一套
// 契约：只写骨骼局部位移/旋转，从不碰 Soldier / Actor 的世界根；鞋底与支撑面
// （地面或担架床面 deckY）的比较、过渡插值、Restore 全部复用车厢那一版的实现。
//
// 与车厢版的三处差别：
//   1. 入口接受 Actor 或 Soldier 两种宿主（伏击里的担架员/伤员是 MissionPeople
//      造出来的裸 Actor，没有 Soldier 外壳）。
//   2. 默认支撑面不读 missionTrainLife.deckY；躺在担架上的人由调用方显式传 deckY。
//   3. 清单允许某个模型 clipIds 为空（该模型这一轮没有烘焙内容）：Prepare 返回 null，
//      调用方按「没有伏击动作」处理，不抛错。
import { FirstLevelCarriageAnimation } from "./Script_FirstLevelCarriageAnimation.mjs";

export const FIRST_LEVEL_AMBUSH_VERSION = "20260916AmbushV2";

// Node 侧测试与 Package A 的编排都读这张表，不必先 fetch 清单。
// 它必须与 Animation/FirstLevelAmbush/Data_FirstLevelAmbushAnimation.json 的 clips 一致。
export const FIRST_LEVEL_AMBUSH_CLIPS = Object.freeze({
  AmbushRise: Object.freeze({ duration: 0.7, loop: false }),
  BayonetStabStanding: Object.freeze({ duration: 1.2, loop: false }),
  BayonetStabDown: Object.freeze({ duration: 1.4, loop: false }),
  // 枪托横扫：起手与收势都是白刃预备，顶点在 0.42 s（枪托到 1.52 m、身前 0.93 m）。
  RifleButtStrike: Object.freeze({ duration: 1, loop: false }),
  // 压制反杀：首帧就是白刃库 IJA `BayonetPressure` 的第 0 帧（QTE 玩家赢下的那一帧），
  // 末帧是可以直接当尸体停住的姿势。0.30 s 之后他手里没有枪了 —— 见文档「交接」一节。
  PressureStabbed: Object.freeze({ duration: 1.3, loop: false }),
  BearerStabbed: Object.freeze({ duration: 2.2, loop: false }),
  PatientStabbed: Object.freeze({ duration: 2.6, loop: false }),
  PatientWoundedIdle: Object.freeze({ duration: 3, loop: true }),
});

let pending, library;

/** 已经拉下来的库（没调用过 Load 时是 null）。测试与诊断用。 */
export function FirstLevelAmbushAnimationLibrary() { return library || null; }

export function LoadFirstLevelAmbushAnimation(base = "./Animation/FirstLevelAmbush/") {
  return pending ||= (async () => {
    const response = await fetch(base + "Data_FirstLevelAmbushAnimation.json?v=" + FIRST_LEVEL_AMBUSH_VERSION);
    if (!response.ok) throw Error("Ambush animation manifest HTTP " + response.status);
    const config = await response.json();
    const records = await Promise.all((config.models || []).map(async record => {
      // 空 clipIds 的模型不占一次请求：它这一轮没有内容。
      if (!record.clipIds?.length) return [record.id, null];
      const file = await fetch(base + record.file + "?v=" + record.sha256);
      if (!file.ok) throw Error("Ambush animation HTTP " + file.status + " " + record.id);
      return [record.id, await file.json()];
    }));
    library = { config, models: new Map(records.filter(entry => entry[1])) };
    return library;
  })();
}

/**
 * @param {object} host Actor（有 characterRig）或 Soldier（有 actor.characterRig）。
 * @param {(x:number,z:number)=>number} [groundAt] 支撑面高度采样；躺在担架上的人由
 *   Sample 的 deckY 覆盖。
 * @returns {FirstLevelAmbushAnimation|null} 该模型没有烘焙内容时返回 null。
 */
export function PrepareFirstLevelAmbushAnimation(host, groundAt) {
  const actor = host?.characterRig ? host : host?.actor;
  const rig = actor?.characterRig;
  const record = library?.models.get(rig?.modelId);
  if (!rig || rig.disposed || !record || !Object.keys(record.clips || {}).length) return null;
  const animation = rig.firstLevelAmbushAnimation
    ||= new FirstLevelAmbushAnimation(actor, record, library.config);
  animation.groundAt = groundAt;
  return animation;
}

export class FirstLevelAmbushAnimation extends FirstLevelCarriageAnimation {
  constructor(actor, record, config) {
    // 车厢那一版从 soldier.actor.characterRig 取装备、从 soldier.position 取地面采样点，
    // 并把 missionTrainLife.deckY 当默认支撑面。这里造一个不带 missionTrainLife 的壳，
    // 默认支撑面就回落到 groundAt。
    super({ actor: { root: actor.root, characterRig: actor.characterRig }, position: actor.root.position },
      record, config);
    this.host = actor;
  }
  ClipDuration(clipId) {
    const clip = this.record.clips[clipId];
    if (!clip) throw Error("Missing ambush clip " + this.record.modelId + " " + clipId);
    return clip.duration;
  }
  Sample(clipId, seconds, options = {}) {
    if (!this.record.clips[clipId]) throw Error("Missing ambush clip " + this.record.modelId + " " + clipId);
    return super.Sample(clipId, seconds, options);
  }
}
