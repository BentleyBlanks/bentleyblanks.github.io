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

const motivationShot = CS_Chuchuan.shots.find((shot) => shot.n === 6);
const motivationStart = CS_Chuchuan.shots.slice(0, 5).reduce((sum, shot) => sum + shot.seconds, 0);
const motivationEnd = motivationStart + motivationShot.seconds;
assert.equal(motivationStart, 68, "the continuous squad-leader exchange starts at 1:08");
assert.equal(motivationEnd, 90, "the continuous squad-leader exchange ends at 1:30");
assert.equal(motivationShot.lines.length, 8, "the motivation exchange preserves all eight authored lines");
assert.equal(motivationShot.lines.filter((line) => line.voiceCue).length, 1,
  "the 1:08—1:30 exchange triggers one continuous audio file instead of eight isolated clips");
assert.equal(motivationShot.lines[0].voiceCue, "prologue_motivation_01");
assert.equal(CS_Chuchuan.walk, undefined, "the observer cannot walk around the carriage");
assert.equal(CS_Chuchuan.suppress.movement, true, "gameplay movement stays suppressed for the whole prologue");
const locationShotStart = CS_Chuchuan.shots.slice(0, 6).reduce((sum, shot) => sum + shot.seconds, 0);
const doorShotStart = CS_Chuchuan.shots.slice(0, 7).reduce((sum, shot) => sum + shot.seconds, 0);
assert.equal(locationShotStart, 90, "the Tengxian location card begins immediately after the exchange");
assert.equal(doorShotStart, 93, "the carriage door opens after the short location card");
const squadLeader = CS_Chuchuan.cast.find((actor) => actor.id === "squadLeader");
const leaderSit = squadLeader.track.find((frame) => frame.state?.sit === 1 && frame.t > 60);
const leaderStand = squadLeader.track.find((frame) => frame.state?.sit === 0);
assert.ok(leaderSit && leaderStand, "squad leader has explicit seated and standing keyframes");
assert.ok(leaderSit.t >= CS_Chuchuan.ambientMotion[0].stopAt,
  "train must stop before the squad leader begins rising");
assert.ok(leaderStand.t <= motivationStart,
  "squad leader must finish rising before the exchange begins");
for (const actor of CS_Chuchuan.cast.filter((item) => item.id !== "squadLeader" && item.track?.[0]?.state?.sit === 1)) {
  const stop = actor.track.find((frame) => frame.state?.prepare > 0 && frame.state?.sit === 1);
  const ready = actor.track.find((frame) => frame.state?.prepare >= 0.99 && frame.state?.sit !== 1 && !frame.state?.hidden);
  assert.ok(stop?.t >= 56 && stop?.t <= motivationStart, `${actor.id} did not stop work between the two cannon beats`);
  assert.ok(ready?.t >= locationShotStart && ready?.t <= doorShotStart,
    `${actor.id} must rise during the location card, after the exchange and before the door opens`);
}

const router = new InputRouter();
const input = { forward: 1, strafe: 1, lean: 1, sprint: true, breathHold: true, fire: true, ads: true };
router.SetSuppressed(true);
router.Read(input);
assert.deepEqual(input, { forward: 0, strafe: 0, lean: 0, sprint: false, breathHold: false, fire: false, ads: false }, "all gameplay axes suppressed");
router.SetSuppressed(false);
console.log("Cutscene control tests passed: real camera directions, fixed observer, continuous motivation cue, neutral, finish/skip, audio restore, old compatibility, input suppression");
