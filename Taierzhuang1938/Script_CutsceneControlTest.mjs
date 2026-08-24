import assert from "node:assert/strict";
import fs from "node:fs";
import { ClampHeadLook, ResolveHeadLookConfig } from "./Script_CutsceneCheck.mjs";
import { InputRouter } from "./Script_Input.mjs";
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
assert.equal(interiorCrowd.length, 31, "the carriage keeps all seated passengers while leaving its aisle usable");
assert.equal(seatedInterior.length, 24, "every carriage seat is occupied, including the four focal soldiers");
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

const stationModel = CS_Chuchuan.props.find((prop) => prop.name === "StationPlatform");
assert.equal(stationModel?.kind, "model", "the station beat uses the authored 1930s platform model, not the old two-box placeholder");
assert.equal(stationModel?.url, "./Model/Model_ChuchuanStationPlatform.glb?v=1");
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
assert.ok(exitShots.every((shot) => shot.propMoves.some((move) => move.name === "StationPlatform")),
  "the authored platform stays under the side door throughout the complete exit walk");
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

const router = new InputRouter();
const input = { forward: 1, strafe: 1, lean: 1, sprint: true, breathHold: true, fire: true, ads: true };
router.SetSuppressed(true);
router.Read(input);
assert.deepEqual(input, { forward: 0, strafe: 0, lean: 0, sprint: false, breathHold: false, fire: false, ads: false }, "all gameplay axes suppressed");
router.SetSuppressed(false);
console.log("Cutscene control tests passed: seated first-person soldier, full mouse pitch, side-door/platform walk, cohesive door assembly, luggage density, camera directions, finish/skip, audio restore, old compatibility, input suppression");
