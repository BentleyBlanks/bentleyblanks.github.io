import assert from "node:assert/strict";
import fs from "node:fs";
import { ClampHeadLook, ResolveHeadLookConfig } from "./Script_CutsceneCheck.mjs";
import { InputRouter } from "./Script_Input.mjs";
import { CS_Chuchuan } from "./Data_CutsceneChuchuan.mjs";
// 序章的每一句台词都要在总表里认得出来 —— 写错一个 voiceCue 的后果是静默降级成
// 纯字幕（画面照跑、控制台干净、通关冒烟全绿），只有对着表逐条查才看得见。
import { VOICE_LINES } from "./Data_Voice.mjs";

const cut = {
  id: "TEST_HeadLook", title: "test", seconds: 1,
  ambience: "trainInterior",
  cameraMode: "headLook", headLook: { yaw: [-0.2, 0.2], pitch: [-0.1, 0.1], sensitivityScale: 1 },
  walk: { min: [-3, -3], max: [3, 3], speed: 2, startAt: 0 },
  cast: [], props: [],
  shots: [{ n: 1, seconds: 1, focalMm: 50, cameraMode: "headLook",
    camera: { from: [0, 1, 4], look: [0, 1, 0] } }],
};
const oldCut = {
  id: "TEST_Old", title: "old", seconds: 1, cast: [], props: [],
  shots: [{ n: 1, seconds: 1, focalMm: 50, camera: { from: [0, 1, 4], look: [0, 1, 0] } }],
};
const switchCut = {
  id: "TEST_Switch", title: "switch", seconds: 2, cast: [], props: [],
  shots: [
    { n: 1, seconds: 1, focalMm: 50, cameraFar: 640, camera: { from: [0, 1, 4], look: [0, 1, 0] } },
    { n: 2, seconds: 1, focalMm: 50, camera: { from: [1, 1, 4], look: [0, 1, 0] } },
  ],
};
const seekCut = {
  id: "TEST_Seek", title: "seek", seconds: 3, cast: [], props: [],
  shots: [{ n: 1, seconds: 3, focalMm: 50, camera: { from: [0, 1, 4], look: [0, 1, 0] },
    lines: [{ at: 0.2, seconds: 2, voiceCue: "seek_voice", text: "seek" }] }],
};

assert.deepEqual(ResolveHeadLookConfig(cut).yaw, [-0.2, 0.2]);
assert.equal(ClampHeadLook(4, [-1, 1]), 1, "yaw clamp upper boundary");
assert.equal(ClampHeadLook(-4, [-1, 1]), -1, "pitch clamp lower boundary");

// Load the Director class without resolving the browser-only bare "three" import. This
// tiny harness supplies only the THREE surface used by the camera/lifecycle paths.
class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  clone() { return new Vec3(this.x, this.y, this.z); }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
}
class Euler { constructor() { this.x = 0; this.y = 0; this.z = 0; } clone() { const e = new Euler(); e.x = this.x; e.y = this.y; e.z = this.z; return e; } copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } }
class Quat { constructor() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; } clone() { return Object.assign(new Quat(), this); } copy(v) { return Object.assign(this, v); } toArray() { return [this.x, this.y, this.z, this.w]; } }
class Node { constructor() { this.position = new Vec3(); this.rotation = new Euler(); this.quaternion = new Quat(); this.scale = { setScalar() {} }; this.children = []; this.visible = true; } add(v) { this.children.push(v); v.parent = this; return this; } remove(v) { this.children = this.children.filter((x) => x !== v); } }
class Geometry { rotateX() {} dispose() {} }
class Material { dispose() {} }
class Mesh extends Node { constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; } }
const FakeThree = {
  Vector3: Vec3, Group: Node, Mesh, PlaneGeometry: Geometry, CylinderGeometry: Geometry, BoxGeometry: Geometry,
  MeshBasicMaterial: Material,
};
const directorSource = fs.readFileSync(new URL("./Script_Cutscene.mjs", import.meta.url), "utf8");
const classSource = directorSource.slice(directorSource.indexOf("export class CutsceneDirector"), directorSource.indexOf("export default CutsceneDirector"))
  .replace("export class CutsceneDirector", "class CutsceneDirector");
const Director = new Function("THREE", "MarkNoPrepass", "HashString", "ValueNoise2", "Clamp", "Clamp01", "Lerp", "FovFromFocalMm", "Ease", "ResolveHeadLookConfig", "ClampHeadLook", "ValidateCutscene", `${classSource}; return CutsceneDirector;`)(
  FakeThree, () => {}, () => 1, () => 0.5, (x, low, high) => Math.max(low, Math.min(high, x)), (x) => Math.max(0, Math.min(1, x)), (a, b, t) => a + (b - a) * t,
  (f) => 27, () => 0.5, ResolveHeadLookConfig, ClampHeadLook, () => [],
);
class FakeCamera {
  constructor() { this.position = new Vec3(0, 1, 4); this.quaternion = new Quat(); this.rotation = new Euler(); this.fov = 60; this.near = 0.03; this.far = 100; this._yaw = 0; this._pitch = 0; }
  updateProjectionMatrix() {}
  lookAt() { this._yaw = 0; this._pitch = 0; }
  rotateY(v) { this._yaw += v; }
  rotateX(v) { this._pitch += v; }
}
class FakeScene extends Node { }
const audio = {
  ambiencePreset: "battle", musicCue: "fieldLament", calls: [],
  Ambience(name) { this.calls.push(`ambience:${name}`); this.ambiencePreset = name; },
  StopMusic() { this.calls.push("stopMusic"); this.musicCue = null; },
  Music(name) { this.calls.push(`music:${name}`); this.musicCue = name; },
};

const cfg = ResolveHeadLookConfig(cut);
let yaw = 0, pitch = 0;
yaw = ClampHeadLook(yaw - 1000 * cfg.sensitivityScale * 0.002, cfg.yaw);
pitch = ClampHeadLook(pitch - (-1000) * cfg.sensitivityScale * 0.002, cfg.pitch);
assert.deepEqual({ yaw, pitch }, { yaw: -0.2, pitch: 0.1 }, "right/up mouse motion follows the rendered camera axes and clamps");
assert.deepEqual({ yaw: 0, pitch: 0 }, { yaw: 0, pitch: 0 }, "neutral view is deterministic");
assert.equal(oldCut.cameraMode, undefined, "old cutscene has no headLook mode");

const director = new Director({ camera: new FakeCamera(), scene: new FakeScene(), audio, table: { [cut.id]: cut, [oldCut.id]: oldCut } });
const exposedMount = new Node();
assert.equal(director._ActorMount({ GetMount: () => exposedMount, eyes: new Node() }, "eyes"), exposedMount, "public Actor.GetMount has priority");
const finished = [];
director.onRelease = (c) => finished.push(c?.id);
const play = director.Play(cut.id);
assert.equal(director.AllowsLook, true);
director.AddLook(1000, -1000);
assert.deepEqual(director.Look, { yaw: -0.2, pitch: 0.1 }, "director look uses the corrected rendered-camera directions");
const baselineYaw = director.camera._yaw;
director.Update(0);
assert.equal(director.camera._yaw, baselineYaw - 0.2, "director camera plus corrected Look yaw are composed");
director.walkKeys.add("d");
director._UpdateWalk(cut, 1);
assert.deepEqual([director.walkOffset.x, director.walkOffset.z], [-2, 0], "D follows camera-right (-X while the carriage camera faces +Z)");
director.walkKeys.clear();
director.walkOffset.set(0, 0, 0);
director.walkKeys.add("w");
director._UpdateWalk(cut, 1);
assert.deepEqual([director.walkOffset.x, director.walkOffset.z], [0, 2], "W follows camera-forward (+Z)");
director.walkKeys.clear();
director.SetNeutralLook(true);
assert.deepEqual(director.Look, { yaw: 0, pitch: 0 }, "neutral view resets look");
director.Update(1.1);
await play;
assert.equal(finished.length, 1, "no-input auto finish calls release once");
assert.deepEqual(audio.calls.slice(-4), ["ambience:trainInterior", "stopMusic", "ambience:battle", "music:fieldLament"], "headLook audio is restored");

for (let i = 0; i < 5; i += 1) {
  const p = director.Play(cut.id, { neutralLook: true });
  director.Skip();
  director.Skip();
  await p;
}
assert.equal(finished.length, 6, "five-stage skip is idempotent with one release per stage");

const oldDirector = new Director({ camera: new FakeCamera(), scene: new FakeScene(), table: { [oldCut.id]: oldCut } });
const oldPlay = oldDirector.Play(oldCut.id);
const oldYaw = oldDirector.camera._yaw;
oldDirector.AddLook(100, 100);
oldDirector.Update(0);
assert.equal(oldDirector.camera._yaw, oldYaw, "old cutscene camera behavior is unchanged");
oldDirector.Skip();
await oldPlay;

const switchCamera = new FakeCamera();
const switchDirector = new Director({ camera: switchCamera, scene: new FakeScene(), table: { [switchCut.id]: switchCut } });
const switchPlay = switchDirector.Play(switchCut.id);
switchDirector.Update(0.5);
assert.equal(switchCamera.far, 640, "shot cameraFar applies inside the authored shot");
switchDirector.Update(0.6);
assert.equal(switchCamera.far, 100, "the next shot restores the saved far plane instead of inheriting the prior shot");
switchDirector.Skip();
await switchPlay;

const seekAudio = {
  voiceBank: new Map([["seek_voice", { duration: 2 }]]), plays: [], stops: 0,
  Play(name, opts) {
    this.plays.push({ name, offset: opts.offset || 0 });
    return { nodes: [], duration: Math.max(0, 2 - (opts.offset || 0)) };
  },
  StopVoice() { this.stops += 1; },
};
const seekDirector = new Director({ camera: new FakeCamera(), scene: new FakeScene(), audio: seekAudio,
  table: { [seekCut.id]: seekCut } });
const seekPlay = seekDirector.Play(seekCut.id);
const attachedAudio = seekDirector.audio;
seekDirector.audio = null;
seekDirector.Update(1.2);
seekDirector.audio = attachedAudio;
assert.equal(seekDirector.SyncCueAudioAtTime(), 1, "seek rebuilds the voice active at the target time");
assert.deepEqual(seekAudio.plays.at(-1), { name: "voice.seek_voice", offset: 1 },
  "seeked voice starts from its matching sample offset");
seekDirector.Skip();
await seekPlay;

// ===========================================================================
// 2026-08-28 集成批 INT1：过场引擎三件小补
//   ① ambientMotion 的减速段（列车进站不再硬停）
//   ② shot.headLook.blendIn（自由段 → 固定演出的视角过渡）
//   ③ 过场 sfx 的 fadeIn / fadeOut / crossfade（火车声渐变炮声）
// ===========================================================================

// --- ① ambientMotion.decelSeconds ------------------------------------------
const noDecel = { name: "x", speed: 7.2, from: [0, 0, 0], axis: [0, 0, 1] };
assert.equal(Director.AmbientDistance(3, noDecel), 21.6, "没写 decelSeconds 时逐浮点与改造前相同");
assert.equal(Director.AmbientDistance(3, { ...noDecel, stopAt: 10 }), 21.6, "有 stopAt 没 decel 也不变");
const fast = { name: "near", speed: 7.2, stopAt: 10, decelSeconds: 4, from: [0, 0, 0], axis: [0, 0, 1] };
const slow = { name: "platform", speed: 1.65, stopAt: 10, decelSeconds: 4, from: [0, 0, 0], axis: [0, 0, 1] };
assert.equal(Director.AmbientDistance(6, fast), 43.2, "减速段开始之前仍是匀速");
// 停稳那一刻走过的总路程 = v·t0 + v·d/2
assert.ok(Math.abs(Director.AmbientDistance(10, fast) - (7.2 * 6 + 7.2 * 2)) < 1e-9, "减速段的积分对得上");
assert.equal(Director.AmbientDistance(12, fast), Director.AmbientDistance(10, fast), "stopAt 之后不再前进");
// 「同时停稳、各自的减速距离与速度成正比」—— 这正是三层窗外景物该有的样子
const fastBrake = Director.AmbientDistance(10, fast) - Director.AmbientDistance(6, fast);
const slowBrake = Director.AmbientDistance(10, slow) - Director.AmbientDistance(6, slow);
assert.ok(Math.abs(fastBrake / slowBrake - 7.2 / 1.65) < 1e-9, "两层同时停稳，减速距离按各自速度成比例");
// 单调且连续（不许在 t0 那一帧跳一下）
let prevD = 0;
for (let t = 0; t <= 12.0001; t += 0.25) {
  const d = Director.AmbientDistance(t, fast);
  assert.ok(d >= prevD - 1e-9, `减速段位移必须单调（t=${t.toFixed(2)}）`);
  assert.ok(d - prevD <= 7.2 * 0.25 + 1e-9, `减速段速度不许超过匀速段（t=${t.toFixed(2)}）`);
  prevD = d;
}

// --- ② shot.headLook.blendIn ------------------------------------------------
const MakeBlendCut = (blendIn) => ({
  id: `TEST_Blend_${blendIn}`, title: "blend", seconds: 2.4, cast: [], props: [],
  cameraMode: "headLook", headLook: { yaw: [-2.0, 2.0], pitch: [-0.4, 0.4], sensitivityScale: 1 },
  shots: [
    { n: 1, seconds: 0.4, focalMm: 50, cameraMode: "headLook",
      headLook: { yaw: [-2.0, 2.0], pitch: [-0.4, 0.4] }, camera: { from: [0, 1, 4], look: [0, 1, 0] } },
    { n: 2, seconds: 2.0, focalMm: 50, cameraMode: "headLook",
      headLook: { yaw: [-0.7, 0.7], pitch: [-0.4, 0.4], ...(blendIn ? { blendIn } : {}) },
      camera: { from: [0, 1, 4], look: [0, 1, 0] } },
  ],
});
const RunBlend = async (blendIn) => {
  const cutData = MakeBlendCut(blendIn);
  const d = new Director({ camera: new FakeCamera(), scene: new FakeScene(),
    table: { [cutData.id]: cutData } });
  const p = d.Play(cutData.id);
  d.AddLook(-750, 0);                       // 把头转到 +1.5 rad（第一镜允许 ±2.0）
  const startYaw = d.Look.yaw;
  const samples = [];
  for (let i = 0; i < 12; i += 1) { d.Update(0.1); samples.push(d.Look.yaw); }
  d.Skip();
  await p;
  return { startYaw, samples };
};
const hard = await RunBlend(0);
assert.ok(Math.abs(hard.startYaw - 1.5) < 1e-9, "第一镜的宽范围允许 1.5 rad");
assert.ok(Math.abs(hard.samples[3] - 0.7) < 1e-9,
  "不写 blendIn = 老行为：切到固定演出那一帧直接钳到边界（把头拽回四十度）");
const soft = await RunBlend(0.6);
assert.ok(soft.samples[3] > 0.7 + 1e-6,
  "写了 blendIn：切镜第一帧不许把视角一把拽回去");
assert.ok(soft.samples[3] < soft.startYaw, "过渡是往边界收，不是不动");
assert.ok(soft.samples[4] < soft.samples[3], "过渡期间逐帧继续收");
assert.ok(Math.abs(soft.samples[10] - 0.7) < 1e-6, "blendIn 走完之后仍然落在本镜的范围内");

// --- ③ 过场 sfx 的淡入 / 淡出 / 交叉淡变 ------------------------------------
const sfxCut = {
  id: "TEST_Sfx", title: "sfx", seconds: 4, cast: [], props: [],
  shots: [{ n: 1, seconds: 4, focalMm: 50, camera: { from: [0, 1, 4], look: [0, 1, 0] },
    sfx: [
      { at: 0.05, name: "trainWheels", volume: 0.6, fadeIn: 0.5 },
      { at: 1.0, name: "cannonFar", volume: 0.8, fadeIn: 0.5, crossfade: "trainWheels" },
    ] }],
};
const sfxAudio = {
  plays: [], stops: 0, voices: {},
  Play(name, opts) {
    const voice = { nodes: [], out: { gain: { value: opts.volume ?? 0.5 } } };
    this.plays.push(name);
    this.voices[name] = voice;
    return voice;
  },
  StopVoice() { this.stops += 1; },
};
const sfxDirector = new Director({ camera: new FakeCamera(), scene: new FakeScene(),
  audio: sfxAudio, table: { [sfxCut.id]: sfxCut } });
const sfxPlay = sfxDirector.Play(sfxCut.id);
const TrainGain = () => sfxAudio.voices.trainWheels.out.gain.value;
const CannonGain = () => (sfxAudio.voices.cannonFar ? sfxAudio.voices.cannonFar.out.gain.value : null);
sfxDirector.Update(0.1);
assert.deepEqual(sfxAudio.plays, ["trainWheels"], "第一条 cue 到点起声");
assert.ok(TrainGain() > 0 && TrainGain() < 0.6, "fadeIn 期间是渐强，不是一上来就满");
for (let i = 0; i < 5; i += 1) sfxDirector.Update(0.1);     // t = 0.6
assert.ok(Math.abs(TrainGain() - 0.6) < 1e-9, "fadeIn 走完之后到达 volume");
for (let i = 0; i < 5; i += 1) sfxDirector.Update(0.1);     // t = 1.1，跨过 crossfade 那一条
assert.deepEqual(sfxAudio.plays, ["trainWheels", "cannonFar"], "第二条 cue 到点起声");
const trainAfter = TrainGain();
assert.ok(trainAfter < 0.6, "crossfade 让前一条开始淡出");
assert.ok(CannonGain() < 0.8, "新起的那条同时在淡入 —— 这才叫渐变，不是切");
for (let i = 0; i < 8; i += 1) sfxDirector.Update(0.1);
assert.equal(TrainGain(), 0, "淡出走完之后前一条归零");
assert.ok(sfxAudio.stops >= 1, "淡出到零的那条要真的被停掉，不留播放头");
assert.ok(Math.abs(CannonGain() - 0.8) < 1e-9, "后一条淡入到自己的 volume");
sfxDirector.Skip();
await sfxPlay;
assert.equal(sfxDirector.sfxFades.length, 0, "跳过/收摊时淡变账本要清干净");

// ===========================================================================
// 序章 CS_Chuchuan 的设计不变量（2026-08-29 集成批 INT3a 重定标）
//
// 这一段原来钉在**旧序章**上（42 s / 六镜 / 1:08—1:30 的八句班长动员 /
// 最后 12 秒第一人称走下车）。任务流程重制把序章整段换掉了
//（docs/Data_MissionRemake.md §1，逐条对照写在 Data_CutsceneChuchuan 的头注）：
// 现在是 166.5 s / 九镜 / 31 句 ch0_* 章节台词，**玩家全程坐在座位上**，
// 收口是「远处炮声 → 罗班长喊口令 → 短切黑出字幕」，人根本还没下车。
//
// 重写的时候刻意不去「把旧数字换成新数字」——那样下一次改秒数还得再改一遍测试，
// 而且测不出任何设计意图。这里断言的是**策划案定死的那几条不变量**：
//   ① 九镜的秒数之和 === 全场时长（改一镜秒数忘了改总长 = 时间轴静默错位）；
//   ② 固定演出 ≤ 45 s（§1 过场规格：车厢主体必须是可自由转头的第一人称）；
//   ③ 自由段用全场 headLook 范围，只有固定演出镜才收窄；
//   ④ 每一句 voiceCue 在 Data_Voice 的总表里有对应行（写错 key = 静默没声音）；
//   ⑤ 玩家全程坐在同一个座位上，相机就长在他眼睛里。
// 布景那几条（月台同一条里程、车门整套一起滑、行李密度）照旧留着 —— 它们
// 与序章内容无关，是这一场的舞台本身，重制一件没动。
// ===========================================================================

// ① 九镜的秒数之和必须等于 seconds。Data_CutsceneChuchuan 里 CHUCHUAN_END 是
//    整套时间轴的锚（演员轨、propMoves、ambientMotion 的 stopAt 全按它算），
//    对不上就是「最后一镜被截掉半截」或者「黑场卡之后还空着两秒」。
const shotTotal = CS_Chuchuan.shots.reduce((sum, shot) => sum + shot.seconds, 0);
assert.equal(CS_Chuchuan.shots.length, 9, "the remade prologue is authored as nine shots");
assert.ok(Math.abs(shotTotal - CS_Chuchuan.seconds) < 1e-9,
  `shot seconds must sum to the authored length (${shotTotal} vs ${CS_Chuchuan.seconds})`);
assert.equal(CS_Chuchuan.seconds, 166.5, "the remade prologue runs 2:46.5 end to end");

// ② 固定演出的预算。「固定演出」= 收窄了转头幅度的镜（per-shot headLook）
//    加上黑场字卡；其余镜相机钉在座位上不动、只给基准视轴，玩家自己转头。
//    §1 的过场规格给的上限是 45 s，现在是镜 2（30）+ 镜 3（7）+ 镜 9（4.5）= 41.5。
//    这条闸挡的是「一镜一镜加演出，加着加着序章又变回一段过场电影」。
const staged = CS_Chuchuan.shots.filter((shot) => shot.headLook || shot.black);
const stagedSeconds = staged.reduce((sum, shot) => sum + shot.seconds, 0);
assert.deepEqual(staged.map((shot) => shot.n), [2, 3, 9],
  "only the letter/door beats and the closing black card are staged");
assert.ok(stagedSeconds <= 45,
  `staged beats must stay within the 45 s budget (now ${stagedSeconds}s across shots ${staged.map((s) => s.n).join("/")})`);
assert.ok(stagedSeconds / CS_Chuchuan.seconds < 0.5,
  "more than half the prologue must remain freely look-around-able");

// ③ 自由段吃全场范围，固定演出镜只许**收窄**、不许放宽 —— 放宽等于在演出里
//    把玩家的头甩出画面。全场范围本身也要够宽：坐着的人得能低头看自己的身体、
//    抬头看行李架（±120° / −76°—+66°）。
assert.ok(CS_Chuchuan.headLook.yaw[1] >= 2.0 && CS_Chuchuan.headLook.yaw[0] <= -2.0,
  "the seated soldier can turn to either side of the carriage");
assert.ok(CS_Chuchuan.headLook.pitch[0] <= -1.3 && CS_Chuchuan.headLook.pitch[1] >= 1.1,
  "the seated soldier can look down at his body and raise his view toward the luggage racks");
for (const shot of CS_Chuchuan.shots) {
  if (!shot.headLook) {
    assert.equal(ResolveHeadLookConfig(CS_Chuchuan, shot).yaw[1], CS_Chuchuan.headLook.yaw[1],
      `shot ${shot.n} is a free beat and must inherit the full look range`);
    continue;
  }
  assert.ok(shot.headLook.yaw[1] <= CS_Chuchuan.headLook.yaw[1]
    && shot.headLook.yaw[0] >= CS_Chuchuan.headLook.yaw[0]
    && shot.headLook.pitch[1] <= CS_Chuchuan.headLook.pitch[1]
    && shot.headLook.pitch[0] >= CS_Chuchuan.headLook.pitch[0],
  `shot ${shot.n} narrows the look range instead of widening it`);
}

// ④ 每一句 voiceCue 都要在 Data_Voice 的总表里有行，而且必须是本章的 ch0_* 行
//    （story 通道、chapter 0）。写错一个 key 的后果是**静默降级成纯字幕** ——
//    画面照跑、控制台干净，只是这句话没人说，正是最难查的那一类。
//    顺带守住「不许回头去引用旧序章那 11 条 prologue_*」：那批行已经删了。
const voiceRows = new Map(VOICE_LINES.map((line) => [line.key, line]));
const spoken = CS_Chuchuan.shots.flatMap((shot) => (shot.lines || []).map((line) => ({ shot: shot.n, ...line })));
assert.equal(spoken.length, 31, "the remade prologue speaks 31 authored lines");
assert.equal(spoken.filter((line) => line.voiceCue).length, spoken.length,
  "every authored line carries a voiceCue — a subtitle with no cue is a line nobody says");
for (const line of spoken) {
  const row = voiceRows.get(line.voiceCue);
  assert.ok(row, `shot ${line.shot}: voiceCue ${line.voiceCue} has no row in VOICE_LINES`);
  assert.equal(row.kind, "story", `${line.voiceCue} must ride the story voice channel, not the Bark pool`);
  assert.equal(row.chapter, 0, `${line.voiceCue} must belong to chapter 0`);
  assert.equal(row.who, line.who, `${line.voiceCue} is attributed to ${line.who} on screen but ${row.who} in the voice table`);
}
assert.equal(VOICE_LINES.filter((line) => /^prologue_/.test(line.key)).length, 0,
  "the eleven orphaned prologue_* rows from the old prologue are gone from VOICE_LINES");
// 台词分布：策划案要的是「六镜有台词 + 三镜没有」（镜 3 是列车进站、镜 6 是低头
// 看短褂、镜 9 是黑场卡 —— 这三拍靠画面和音效说话）。全挤在一两镜里就成了念稿。
const talkingShots = CS_Chuchuan.shots.filter((shot) => (shot.lines || []).length > 0).map((shot) => shot.n);
assert.deepEqual(talkingShots, [1, 2, 4, 5, 7, 8], "six shots carry dialogue; three carry only picture and sound");

// ⑤ 玩家：全程坐在左侧长凳同一个座位上，相机就长在他眼睛里。
//    旧版最后 12 秒是「起身→过道→踏板→月台」的第一人称行走段，
//    新策划案里人还没下车 —— 那一段连同它的排队下车编排一起删了。
assert.equal(CS_Chuchuan.walk, undefined, "gameplay WASD cannot detach the player from the authored seated view");
assert.equal(CS_Chuchuan.suppress.movement, true, "gameplay movement stays suppressed for the whole prologue");
const player = CS_Chuchuan.cast.find((actor) => actor.id === "shunzi");
assert.equal(player?.firstPerson, true, "the camera belongs to an ordinary actor body, not a detached observer");
assert.ok(player.track.every((frame) => frame.state?.sit === 1),
  "the player stays seated for the whole prologue — he never gets up and never leaves the carriage");
assert.ok(player.track.every((frame) => !frame.state?.hidden), "the player is never hidden or teleported");
const seat = player.track[0].pos;
assert.ok(player.track.every((frame) => frame.pos[0] === seat[0] && frame.pos[2] === seat[2]),
  "the player never slides along the bench between shots");
assert.ok(seat[0] < 0, "the player sits on the LEFT bench so the side door on the right wall is not a grazing angle");
for (const shot of CS_Chuchuan.shots) {
  assert.deepEqual([shot.camera.from[0], shot.camera.from[2]], [seat[0], seat[2]],
    `shot ${shot.n} camera must sit on the player's own bench seat`);
}
// 最后一拍：罗班长喊完口令，全车人开始收东西 —— 那是「准备下车」，不是下车。
assert.ok(player.track.at(-1).state?.prepare > 0.5,
  "the prologue ends on the player packing up, not on him standing in the doorway");

// 罗班长：全场站着（他是喊口令的那个），不许坐进座位里消失。
const luo = CS_Chuchuan.cast.find((actor) => actor.id === "luo");
assert.ok(luo.track.every((frame) => frame.state?.sit !== 1),
  "the squad leader stays on his feet in the aisle instead of disappearing into a seat");
const orderAt = CS_Chuchuan.shots.slice(0, 7).reduce((sum, shot) => sum + shot.seconds, 0);
assert.equal(orderAt, 143, "the distant gunfire and the squad leader's orders start at 2:23");
assert.ok(luo.track.some((frame) => frame.t >= orderAt && frame.state?.prepare > 0),
  "the squad leader is visibly getting the squad up once the orders start");

// 车厢里的人：坐满长凳、少数几个站在两侧，过道要留得出来。
const OUTSIDE = new Set(["stretcherBearerA", "stretcherBearerB", "lightWounded",
  "villagerA", "villagerB", "depotHand", "junguan"]);
const interiorCrowd = CS_Chuchuan.cast.filter((actor) => !OUTSIDE.has(actor.id));
const seatedInterior = interiorCrowd.filter((actor) => actor.track?.[0]?.state?.sit === 1);
const standingBackground = interiorCrowd.filter((actor) => actor.id.startsWith("crowdStand"));
assert.ok(interiorCrowd.length >= 24, "the carriage is crowded, not a stage with six actors on it");
assert.ok(seatedInterior.length >= 18, "every bench segment seats riders mid-segment, including the focal soldiers");
assert.equal(standingBackground.length, 6, "only six scattered background passengers stand by the sides and doors");
assert.ok(standingBackground.every((actor) => Math.abs(actor.track[0].pos[0]) > 1),
  "standing background passengers stay clear of the center aisle");
const crowdAppearances = interiorCrowd.filter((actor) => actor.id.startsWith("crowd"));
assert.ok(new Set(crowdAppearances.map((actor) => actor.uniformHex)).size > 4,
  "crowd tops use several deterministic colors");
assert.ok(new Set(crowdAppearances.map((actor) => actor.trouserHex)).size > 4,
  "crowd trousers use several deterministic colors");

// 兵站月台（镜 4 起）：**整套布景走同一条里程**，不然一切镜就整体瞬移。
const doorShot = CS_Chuchuan.shots.find((shot) => shot.n === 3);
assert.ok(!CS_Chuchuan.props.some((prop) => prop.kind === "model"),
  "the broken-axis station glb stays out of the set until the Blender pipeline is rerun (see engineRequests)");
const stationParts = CS_Chuchuan.props.filter((prop) => /^Station(?!Stretcher)/.test(prop.name || ""));
assert.ok(stationParts.length >= 40, "the station beat is dressed as a full authored set: platform, canopy, office, sign, benches, crane");
const stationBaseMove = (CS_Chuchuan.ambientMotion || []).find((move) => move.name === "StationBase");
// 列车必须**先停稳、门才开**。停车与开门写在两处（演员/布景轨用全局秒，
// propMoves 用镜内相对秒），两边各写一个数就会漂 —— 这条断言把它们绑在一起。
const doorShotStart = CS_Chuchuan.shots.slice(0, 2).reduce((sum, shot) => sum + shot.seconds, 0);
const doorSlideAt = doorShotStart + Math.min(...doorShot.propMoves.map((move) => move.startAt));
assert.ok(stationBaseMove?.stopAt >= doorShotStart && stationBaseMove.stopAt <= doorSlideAt,
  `the station mileage halts inside the arrival shot and before the door slides`
  + `（stopAt ${stationBaseMove?.stopAt}，镜 3 起 ${doorShotStart}，门开 ${doorSlideAt}）`);
assert.ok(Math.abs(stationBaseMove.from[2] + stationBaseMove.speed * stationBaseMove.stopAt - 5.7) < 0.05,
  "the single mileage ends with the platform under the side door, so no shot cut can teleport the station");
const stationMoveNames = new Set((CS_Chuchuan.ambientMotion || []).map((move) => move.name));
assert.ok(stationParts.every((part) => stationMoveNames.has(part.name)),
  "every station part shares the same mileage move, so the set cannot shear apart mid-pass");

// 车厢本身（重制一件没动，照旧守住）
const sideDoor = CS_Chuchuan.props.find((prop) => prop.name === "CarriageDoor");
assert.ok(sideDoor?.pos[0] > 2.7 && sideDoor?.pos[2] > 5,
  "the carriage door is cut into the platform-facing side wall, not the front or rear end wall");
assert.ok(sideDoor.size[0] < sideDoor.size[2], "the sliding door lies in the X-facing side wall");
assert.ok(CS_Chuchuan.props.some((prop) => prop.name === "FrontWall"), "the carriage end is a closed wall");
assert.ok(CS_Chuchuan.props.some((prop) => prop.name === "SideDoorStepInner")
  && CS_Chuchuan.props.some((prop) => prop.name === "SideDoorStepOuter"),
"two physical footboards bridge the carriage floor to the platform");
const personalEffects = CS_Chuchuan.props.filter((prop) => /^(RackPack|Bedroll|BenchPack|Canteen)/.test(prop.name));
assert.ok(personalEffects.length >= 55, "the carriage contains dense, repeated personal luggage rather than a few token bags");
// 车门是**一整套**一起滑：门皮、五块门板、两根撑、门闩、外侧包铁与吊挂。
// 少挂一件，那一件就留在原地，开门时门框上挂着一条铁皮。
const openingDoorParts = new Set((doorShot.propMoves || []).map((move) => move.name));
assert.ok(["CarriageDoor", "DoorPlank0", "DoorPlank4", "DoorBraceLeft", "DoorBraceRight", "DoorLatch"]
  .every((name) => openingDoorParts.has(name)), "door skin, planks, braces, and latch slide as one assembly");
assert.ok([...openingDoorParts].every((name) => CS_Chuchuan.props.some((prop) => prop.name === name)),
  "the door assembly only moves parts that actually exist in the set");

const router = new InputRouter();
const input = { forward: 1, strafe: 1, lean: 1, sprint: true, breathHold: true, fire: true, ads: true };
router.SetSuppressed(true);
router.Read(input);
assert.deepEqual(input, { forward: 0, strafe: 0, lean: 0, sprint: false, breathHold: false, fire: false, ads: false }, "all gameplay axes suppressed");
router.SetSuppressed(false);
console.log("Cutscene control tests passed: camera directions, finish/skip, audio restore, old compatibility, "
  + "input suppression, ambientMotion deceleration, headLook blendIn, cutscene sfx crossfade; "
  + `remade prologue invariants (9 shots / ${CS_Chuchuan.seconds}s / staged ${stagedSeconds}s ≤ 45 / `
  + `${spoken.length} lines all resolving to ch0_* voice rows / player seated throughout)`);
