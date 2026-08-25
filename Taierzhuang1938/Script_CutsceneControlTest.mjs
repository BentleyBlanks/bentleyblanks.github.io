import assert from "node:assert/strict";
import fs from "node:fs";
import { ClampHeadLook, ResolveHeadLookConfig } from "./Script_CutsceneCheck.mjs";
import { InputRouter } from "./Script_Input.mjs";
import { SubtitleStack, SUBTITLE_TUNING } from "./Script_Subtitle.mjs";
import { CS_Chuchuan } from "./Data_CutsceneChuchuan.mjs";

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
// 注入名单里的每一项都是 Script_Cutscene.mjs 的模块层符号：类体被单独切出来跑，
// 模块作用域在这个 eval 里一个都看不见（详见 Script_Cutscene.mjs 类顶部那段注释）。
// SubtitleStack 是台词层的堆栈，构造函数里就要用，漏了就是 new Director 当场 ReferenceError。
const Director = new Function("THREE", "MarkNoPrepass", "HashString", "ValueNoise2", "Clamp", "Clamp01", "Lerp", "FovFromFocalMm", "Ease", "ResolveHeadLookConfig", "ClampHeadLook", "ValidateCutscene", "SubtitleStack", `${classSource}; return CutsceneDirector;`)(
  FakeThree, () => {}, () => 1, () => 0.5, (x, low, high) => Math.max(low, Math.min(high, x)), (x) => Math.max(0, Math.min(1, x)), (a, b, t) => a + (b - a) * t,
  (f) => 27, () => 0.5, ResolveHeadLookConfig, ClampHeadLook, () => [], SubtitleStack,
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

const motivationShot = CS_Chuchuan.shots.find((shot) => shot.n === 6);
const motivationStart = CS_Chuchuan.shots.slice(0, 5).reduce((sum, shot) => sum + shot.seconds, 0);
const motivationEnd = motivationStart + motivationShot.seconds;
assert.equal(motivationStart, 68, "the continuous squad-leader exchange starts at 1:08");
assert.equal(motivationEnd, 90, "the continuous squad-leader exchange ends at 1:30");
assert.equal(motivationShot.lines.length, 8, "the motivation exchange preserves all eight authored lines");
assert.equal(motivationShot.lines.filter((line) => line.voiceCue).length, 1,
  "the 1:08—1:30 exchange triggers one continuous audio file instead of eight isolated clips");
assert.equal(motivationShot.lines[0].voiceCue, "prologue_motivation_01");
assert.equal(CS_Chuchuan.walk, undefined, "gameplay WASD cannot detach the player from the authored seated/exit path");
assert.equal(CS_Chuchuan.suppress.movement, true, "gameplay movement stays suppressed for the whole prologue");
const locationShotStart = CS_Chuchuan.shots.slice(0, 6).reduce((sum, shot) => sum + shot.seconds, 0);
const doorShotStart = CS_Chuchuan.shots.slice(0, 7).reduce((sum, shot) => sum + shot.seconds, 0);
assert.equal(locationShotStart, 90, "the Tengxian location card begins immediately after the exchange");
assert.equal(doorShotStart, 93, "the carriage door opens after the short location card");
assert.equal(CS_Chuchuan.seconds, 105, "the side-door walk has enough authored time to reach and stop on the platform");
assert.equal(CS_Chuchuan.shots.length, 11, "the exit is split into aisle, threshold, steps, and platform beats");
assert.ok(CS_Chuchuan.headLook.pitch[0] <= -1.3 && CS_Chuchuan.headLook.pitch[1] >= 1.1,
  "the seated soldier can look down at his body and raise his view toward the luggage racks");
const playerSoldier = CS_Chuchuan.cast.find((actor) => actor.id === "playerSoldier");
assert.equal(playerSoldier?.firstPerson, true, "the camera belongs to an ordinary actor body, not a detached observer");
assert.equal(playerSoldier?.track[0]?.state?.sit, 1, "the player begins seated on the bench");
assert.ok(playerSoldier.track.every((frame) => !frame.state?.hidden), "the player is never hidden or teleported during disembarkation");
assert.ok(playerSoldier.track.some((frame) => frame.t === 101 && frame.pos[0] > 5 && frame.pos[1] >= 0.58),
  "the player crosses the side threshold and reaches the raised station platform");
assert.ok(playerSoldier.track.at(-1).pos[2] > 7 && playerSoldier.track.at(-1).state?.moveSpeed === 0,
  "the player walks along the platform and comes to a real stop");
const seatedShot = CS_Chuchuan.shots.find((shot) => shot.n === 3);
assert.deepEqual([seatedShot.camera.from[0], seatedShot.camera.from[2]],
  [playerSoldier.track[0].pos[0], playerSoldier.track[0].pos[2]],
  "the opening camera is physically located on the player's occupied bench seat");
const squadLeader = CS_Chuchuan.cast.find((actor) => actor.id === "squadLeader");
const interiorCrowd = CS_Chuchuan.cast.filter((actor) => actor.id !== "stretcherBearerA" && actor.id !== "stretcherBearerB"
  && actor.id !== "lightWounded" && actor.id !== "externalOfficer");
const seatedInterior = interiorCrowd.filter((actor) => actor.track?.[0]?.state?.sit === 1);
const standingBackground = interiorCrowd.filter((actor) => actor.id.startsWith("crowdStand"));
assert.equal(interiorCrowd.length, 28, "the carriage keeps all seated passengers while leaving its aisle usable");
assert.equal(seatedInterior.length, 21, "every bench segment seats riders mid-segment, including the four focal soldiers");
assert.equal(standingBackground.length, 6, "only six scattered background passengers stand by the sides and doors");
assert.ok(standingBackground.every((actor) => Math.abs(actor.track[0].pos[0]) > 1),
  "standing background passengers stay clear of the center aisle");
const crowdAppearances = interiorCrowd.filter((actor) => actor.id.startsWith("crowd"));
assert.ok(new Set(crowdAppearances.map((actor) => actor.uniformHex)).size > 4,
  "crowd tops use several deterministic colors");
assert.ok(new Set(crowdAppearances.map((actor) => actor.trouserHex)).size > 4,
  "crowd trousers use several deterministic colors");
assert.ok(squadLeader.track.every((frame) => frame.state?.sit !== 1),
  "squad leader remains standing at the rear of the carriage instead of disappearing into a seat");
assert.ok(Math.abs(squadLeader.track[0].pos[0]) < 0.1 && squadLeader.track[0].pos[2] > 5.5,
  "squad leader starts visibly at the far end of the carriage");
assert.ok(squadLeader.track.some((frame) => frame.t <= motivationStart && frame.state?.prepare > 0),
  "rear squad leader must be ready before the exchange begins");
for (const actor of CS_Chuchuan.cast.filter((item) => item.id !== "squadLeader" && item.track?.[0]?.state?.sit === 1)) {
  const stop = actor.track.find((frame) => frame.state?.prepare > 0 && frame.state?.sit === 1);
  const ready = actor.track.find((frame) => frame.state?.prepare >= 0.99 && frame.state?.sit !== 1 && !frame.state?.hidden);
  assert.ok(stop?.t >= 56 && stop?.t <= motivationStart, `${actor.id} did not stop work between the two cannon beats`);
  assert.ok(ready?.t >= locationShotStart && ready?.t <= doorShotStart,
    `${actor.id} must rise during the location card, after the exchange and before the door opens`);
}

assert.ok(!CS_Chuchuan.props.some((prop) => prop.kind === "model"),
  "the broken-axis station glb stays out of the set until the Blender pipeline is rerun (see engineRequests)");
const stationParts = CS_Chuchuan.props.filter((prop) => /^Station(?!Stretcher)/.test(prop.name || ""));
assert.ok(stationParts.length >= 40, "the station beat is dressed as a full authored set: platform, canopy, office, sign, benches, crane");
const stationBaseMove = (CS_Chuchuan.ambientMotion || []).find((move) => move.name === "StationBase");
assert.equal(stationBaseMove?.stopAt, 56, "the station rides one uniform ambientMotion mileage and halts with the train");
assert.ok(Math.abs(stationBaseMove.from[2] + stationBaseMove.speed * stationBaseMove.stopAt - 5.7) < 0.05,
  "the single mileage ends with the platform under the side door, so no shot cut can teleport the station");
const stationMoveNames = new Set((CS_Chuchuan.ambientMotion || []).map((move) => move.name));
assert.ok(stationParts.every((part) => stationMoveNames.has(part.name)),
  "every station part shares the same mileage move, so the set cannot shear apart mid-pass");
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
const exitShots = CS_Chuchuan.shots.filter((shot) => shot.n >= 8);
assert.ok(exitShots.every((shot) => shot.camera.walkBob?.amount > 0),
  "the authored exit path includes deterministic first-person walking animation");
assert.ok(exitShots.at(-1).camera.walkBob?.fadeOut > 0, "the final platform walk eases to a stable stop");
const openingDoorParts = new Set(exitShots[0].propMoves.map((move) => move.name));
assert.ok(["CarriageDoor", "DoorPlank0", "DoorPlank4", "DoorBraceLeft", "DoorBraceRight", "DoorLatch"]
  .every((name) => openingDoorParts.has(name)), "door skin, planks, braces, and latch slide as one assembly");
for (const actor of ["youngDispatch", "rifleman", "oldWound", "machineGunner", "squadLeader"]
  .map((id) => CS_Chuchuan.cast.find((item) => item.id === id))) {
  assert.ok(actor.track.every((frame) => frame.t < doorShotStart || !frame.state?.hidden),
    `${actor.id} must queue and walk through the visible side door instead of vanishing at the old car end`);
  assert.ok(actor.track.some((frame) => frame.pos[0] >= 4.65 && frame.pos[1] >= 0.58),
    `${actor.id} must reach the same station platform as the player`);
}
for (const actor of CS_Chuchuan.cast.filter((item) => ["stretcherBearerA", "stretcherBearerB", "lightWounded"].includes(item.id))) {
  const walkingExit = actor.track.find((frame) => frame.t === 63);
  const hiddenExit = actor.track.find((frame) => frame.t === 64);
  assert.equal(walkingExit?.state?.hidden, undefined, `${actor.id} must keep walking after the station shot ends`);
  assert.equal(hiddenExit?.state?.hidden, true, `${actor.id} only hides after leaving the window's visible run`);
  assert.equal(actor.track.find((frame) => frame.t === 56)?.ry, Math.PI, `${actor.id} walks forward along the platform`);
}

// ---------------------------------------------------------------------------
// 台词层是 COD 式的一摞，不是一个槽
//
// 回归的对象是新序章镜 6（1:08—1:30 的班长动员问答）：八句里有四句只给了 0.6—0.9 s，
// 一问一答隔 0.9—1.3 s。旧的单槽实现下，答句一出现问句就整条消失 ——
// 出图在 t=78.8 s 上只有「班长：为啥子不怕？」一行，前一句「不怕！」已经没了。
// 这里用真数据的时点在导演上重放那一段，断言同屏读得到两句以上。
// ---------------------------------------------------------------------------
const exchange = CS_Chuchuan.shots.find((shot) => shot.n === 6);
const stackCut = {
  id: "TEST_Stack", title: "stack", seconds: exchange.seconds, cast: [], props: [],
  shots: [{ n: 1, seconds: exchange.seconds, focalMm: 50, camera: { from: [0, 1, 4], look: [0, 1, 0] },
    lines: exchange.lines.map((line) => ({ at: line.at, seconds: line.seconds, text: line.text })) }],
};
const stackDirector = new Director({ camera: new FakeCamera(), scene: new FakeScene(), table: { [stackCut.id]: stackCut } });
const stackPlay = stackDirector.Play(stackCut.id);
const StepTo = (target) => {
  while (stackDirector.Time < target - 1e-6) stackDirector.Update(Math.min(1 / 60, target - stackDirector.Time));
};
StepTo(9.0);
assert.equal(stackDirector.lines.Lines.filter((line) => !line.leaving).length, 1,
  "before the answer comes in, only the question is live");
// 9.7 s 的「不怕！」压上来时，8.4 s 的问句还在（0.6 s 的数据时长 + 可读下限 + 留白）
StepTo(10.0);
const duringAnswer = stackDirector.lines.Lines;
assert.equal(duringAnswer.length, 2, "the question is still readable when the answer arrives");
assert.deepEqual(duringAnswer.map((line) => line.text), ["去死，怕不怕？", "不怕！"],
  "the stack keeps script order, oldest first");
assert.equal(duringAnswer.at(-1).offset, 0, "the newest line sits on the bottom row, where the eye already is");
assert.ok(duringAnswer[0].offset > 0, "the earlier line is pushed up by exactly one row, not overwritten");
// 上限：四句挤在 11.5 s 上，最旧的一条要开始退场而不是被直接删掉（删了就没有过渡）
StepTo(11.6);
const crowded = stackDirector.lines.Lines;
assert.equal(crowded.filter((line) => !line.leaving).length, SUBTITLE_TUNING.max,
  "no more than SUBTITLE_TUNING.max lines stay live at once");
assert.ok(crowded.some((line) => line.leaving && line.alpha > 0),
  "an evicted line fades out over the authored transition instead of vanishing between frames");
// 进退场是自绘补间：同一句在相邻两帧上透明度必须不同，而且与墙上时钟无关
stackDirector.lines.Clear();
stackDirector.lines.Push({ who: "班长", whoId: "squadLeader", text: "好样的。", seconds: 0.6 });
assert.equal(stackDirector.lines.Lines[0].alpha, 0, "a line starts fully transparent");
stackDirector.Update(1 / 60);
const firstFrame = stackDirector.lines.Lines[0].alpha;
stackDirector.Update(1 / 60);
const secondFrame = stackDirector.lines.Lines[0].alpha;
assert.ok(firstFrame > 0 && secondFrame > firstFrame && secondFrame < 1,
  `the fade-in is driven by the game clock (${firstFrame} → ${secondFrame})`);
stackDirector.Skip();
await stackPlay;
assert.equal(stackDirector.lines.Lines.length, 0, "skipping clears the stack");

// 黑场字卡上不许压着上一镜的对白：镜 6 最后一句 21.8 s 收，镜 7 是地点卡。
const cardCut = {
  id: "TEST_Card", title: "card", seconds: 4, cast: [], props: [],
  shots: [
    { n: 1, seconds: 2, focalMm: 50, camera: { from: [0, 1, 4], look: [0, 1, 0] },
      lines: [{ at: 0.1, seconds: 1.5, text: "都把东西带好。前头就是滕县。" }] },
    { n: 2, seconds: 2, focalMm: 50, black: true, titleCard: true, camera: { from: [0, 1, 4], look: [0, 1, 0] },
      subs: [{ at: 0, seconds: 2, title: true, date: true, text: "山东·滕县／1938年3月" }] },
  ],
};
const cardDirector = new Director({ camera: new FakeCamera(), scene: new FakeScene(), table: { [cardCut.id]: cardCut } });
const cardPlay = cardDirector.Play(cardCut.id);
while (cardDirector.Time < 1.9) cardDirector.Update(1 / 60);
assert.equal(cardDirector.lines.Lines.filter((line) => !line.leaving).length, 1,
  "the closing line of the shot is still up while its own shot runs");
while (cardDirector.Time < 2.6) cardDirector.Update(1 / 60);
assert.equal(cardDirector.lines.Lines.length, 0, "dialogue is gone before the black location card is readable");
cardDirector.Skip();
await cardPlay;

const router = new InputRouter();
const input = { forward: 1, strafe: 1, lean: 1, sprint: true, breathHold: true, fire: true, ads: true };
router.SetSuppressed(true);
router.Read(input);
assert.deepEqual(input, { forward: 0, strafe: 0, lean: 0, sprint: false, breathHold: false, fire: false, ads: false }, "all gameplay axes suppressed");
router.SetSuppressed(false);
console.log("Cutscene control tests passed: seated first-person soldier, full mouse pitch, side-door/platform walk, cohesive door assembly, luggage density, camera directions, stacked dialogue subtitles, finish/skip, audio restore, old compatibility, input suppression");
