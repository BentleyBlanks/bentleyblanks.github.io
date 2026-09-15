// 关中过场「川军被俘」十条作者动作：原皮实播、朝向、贴地、根不动、还原精确，
// 加上 `perform` 契约本身（t0 起播 / loop / once 末帧 / 拖时间轴确定性 / 未知 id 回退）。
//
// 跑法：node Taierzhuang1938/Script_MachineGunCaptivesAnimationTest.mjs
// 联系图：Taierzhuang1938/_shots/MachineGunCaptives/（忽略目录，不提交）
//
// 量的是**骨骼世界坐标与真实蒙皮顶点**，不是清单自报的数：烘焙侧的贴地补偿一旦写错，
// 自报数照样漂亮（docs/Data_CutsceneRedo.md §1.3 与 CutscenePoseTest 的抬头记着那次事故）。
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { ServeRoot } from "./Script_DevServer.mjs";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { CS_MachineGunCaptives } from "./Data_CutsceneMachineGunCaptives.mjs";

const project = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(project, "_shots", "MachineGunCaptives");
const folder = path.join(project, "Animation", "MachineGunCaptives");
const config = JSON.parse(await fs.readFile(path.join(folder, "Data_MachineGunCaptivesAnimation.json"), "utf8"));
const manifest = JSON.parse(await fs.readFile(path.join(project, "Model", "Character", "Data_LugouCharacterManifest.json"), "utf8"));

// ---------------------------------------------------------------------------
// 1. 清单与资产（纯 Node）
// ---------------------------------------------------------------------------
const CAPTIVE_CLIPS = ["CaptiveHandsUpWalk", "CaptiveHandsUpStand", "CaptiveStandToKneel",
  "CaptiveKneelHandsHead", "CaptiveKneelPlead", "CaptiveKneelFlinch",
  "CaptiveStruckDown", "CaptiveStabbedCollapse"];
const GUARD_CLIPS = ["IjaBayonetGuard", "IjaTauntGesture", "IjaKickPrisoner",
  "IjaRifleButtStrike", "IjaBayonetDownThrust"];
const COVERAGE = {
  LugouNra02: CAPTIVE_CLIPS, LugouNra05: CAPTIVE_CLIPS,
  LugouIja01: GUARD_CLIPS, LugouIja02: GUARD_CLIPS, LugouIja03: GUARD_CLIPS,
};
const DURATIONS = {
  CaptiveHandsUpWalk: [1.8, true],
  CaptiveHandsUpStand: [4, true], CaptiveStandToKneel: [1, false],
  CaptiveKneelHandsHead: [4, true], CaptiveKneelPlead: [4, true], CaptiveKneelFlinch: [0.8, false],
  CaptiveStruckDown: [1.6, false], CaptiveStabbedCollapse: [2, false],
  IjaBayonetGuard: [4, true], IjaTauntGesture: [4, true], IjaKickPrisoner: [1.2, false],
  IjaRifleButtStrike: [1.4, false], IjaBayonetDownThrust: [1.6, false],
};
assert.deepEqual(config.actorForward, [0, 0, -1]);
assert.equal(config.models.length, 5);
assert.deepEqual(Object.keys(config.clips).sort(), Object.keys(DURATIONS).sort());
for (const [id, [duration, loop]] of Object.entries(DURATIONS)) {
  assert.equal(config.clips[id].duration, duration, `${id} duration`);
  assert.equal(config.clips[id].loop, loop, `${id} loop`);
}
assert.ok(config.floorClearanceM > 0 && config.floorClearanceM < 0.02);
for (const model of config.models) {
  assert.deepEqual(model.clipIds, COVERAGE[model.id], `${model.id} coverage`);
  const bytes = await fs.readFile(path.join(folder, model.file));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), model.sha256, `${model.id} sha256`);
  const original = await fs.readFile(path.join(project, "Model", "Character", `Model_${model.id}.glb`));
  assert.equal(createHash("sha256").update(original).digest("hex"), model.originalModelSha256,
    `${model.id} original GLB untouched`);
  const data = JSON.parse(bytes);
  assert.equal(data.modelId, model.id);
  assert.equal(data.fps, 24);
  assert.equal(data.stride, 7);
  assert.equal(data.bones.length, 53, `${model.id} original 53-bone rig`);
  for (const id of model.clipIds) {
    const clip = data.clips[id];
    assert.ok(clip, `${model.id} ${id}`);
    assert.equal(clip.frameCount, Math.ceil(clip.duration * 24) + 1);
    assert.equal(clip.values.length, clip.frameCount * data.bones.length * 7);
    assert.ok(clip.values.every(Number.isFinite), `${model.id} ${id} finite samples`);
    assert.equal(clip.duration, config.clips[id].duration);
    assert.equal(clip.weaponHold, config.clips[id].weaponHold);
    assert.equal(clip.referenceSpeedMps ?? null, config.clips[id].referenceSpeedMps ?? null,
      `${model.id} ${id} referenceSpeedMps`);
    // 循环接缝：loop clip 的**烘出来的**首尾两帧必须逐比特相同。运行时取样按
    // `at % duration` 回绕，所以一条非整数倍谐波的抖动永远不会让那个回绕测试翻红 ——
    // 它只是每个周期在画面上顿一下。这一条是量烘焙产物本身。
    if (clip.loop) {
      const stride = data.bones.length * 7;
      const tail = clip.values.length - stride;
      let seam = 0;
      for (let i = 0; i < stride; i += 1) seam = Math.max(seam, Math.abs(clip.values[i] - clip.values[tail + i]));
      assert.ok(seam === 0, `${model.id} ${id} 循环接缝 ${seam}（首尾帧必须相同，抖动项要用整数倍谐波）`);
    }
  }
  // 过渡 clip 的交接帧：末帧（或首末两帧）必须就是它交给的那条循环的第 0 帧，
  // 0.12 s 淡入才会是一次空操作。这两条是「跪下没有过程 / 挨打没反应」那两项
  // 改动的接缝，写错了就是原地一跳。
  if (model.id.startsWith("LugouNra")) {
    const Frame = (id, index) => {
      const clip = data.clips[id];
      const stride = data.bones.length * 7;
      return clip.values.slice(index * stride, (index + 1) * stride);
    };
    const Diff = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
    const kneelStart = Frame("CaptiveKneelHandsHead", 0);
    const standStart = Frame("CaptiveHandsUpStand", 0);
    const toKneel = data.clips.CaptiveStandToKneel;
    assert.ok(Diff(Frame("CaptiveStandToKneel", 0), standStart) === 0,
      `${model.id} CaptiveStandToKneel 首帧必须是举手站姿的第 0 帧`);
    assert.ok(Diff(Frame("CaptiveStandToKneel", toKneel.frameCount - 1), kneelStart) === 0,
      `${model.id} CaptiveStandToKneel 末帧必须是抱头跪姿的第 0 帧`);
    const flinch = data.clips.CaptiveKneelFlinch;
    assert.ok(Diff(Frame("CaptiveKneelFlinch", 0), kneelStart) === 0,
      `${model.id} CaptiveKneelFlinch 首帧必须是抱头跪姿的第 0 帧`);
    assert.ok(Diff(Frame("CaptiveKneelFlinch", flinch.frameCount - 1), kneelStart) === 0,
      `${model.id} CaptiveKneelFlinch 末帧必须回到抱头跪姿的第 0 帧`);
  }
}

// ---------------------------------------------------------------------------
// 1b. 三次打击的接触几何（从过场数据反推，实测在浏览器里对）
//
// 站位对不对，不能靠「俯视误差在触及之内」这种话 —— 受击者不是一个点，跪着的人在
// 打击那个方位上的皮离他自己的原点 0.14–0.19 m。这里从 Data_CutsceneMachineGunCaptives
// 的轨道取接触那一刻两个人的实际坐标，算出距离与**受击者本地坐标下的来袭方位**，
// 浏览器那边按同一个方位量真皮的伸出距离，最后核对刺入深度。
// ---------------------------------------------------------------------------
const CastTrack = (id) => {
  const actor = CS_MachineGunCaptives.cast.find((entry) => entry.id === id);
  assert.ok(actor, `过场里没有 ${id}`);
  return actor.track;
};
const TrackAt = (id, time) => {
  const track = CastTrack(id);
  let index = track.length - 1;
  for (let k = 0; k < track.length - 1; k += 1) if (time < track[k + 1].t) { index = k; break; }
  const a = track[index];
  const b = track[index + 1] || a;
  const span = Math.max(1e-6, b.t - a.t);
  const k = Math.max(0, Math.min(1, (time - a.t) / span));
  return {
    x: a.pos[0] + (b.pos[0] - a.pos[0]) * k,
    z: a.pos[2] + (b.pos[2] - a.pos[2]) * k,
    ry: (a.ry || 0) + ((b.ry || 0) - (a.ry || 0)) * k,
    state: a.state || {},
  };
};
const CONTACTS = [
  { name: "踢", attacker: "ija_hei", victim: "captive_old", at: 14.66, clipTime: 0.46,
    attackClip: "IjaKickPrisoner", victimClip: "CaptiveKneelHandsHead", band: [0.58, 0.68],
    reach: "boot", depth: [-0.03, 0.05] },
  { name: "枪托砸", attacker: "ija_bing", victim: "captive_young", at: 28.45, clipTime: 0.85,
    attackClip: "IjaRifleButtStrike", victimClip: "CaptiveKneelPlead", band: [0.60, 0.70],
    reach: "butt", depth: [-0.03, 0.05] },
  { name: "下刺可见", attacker: "ija_bing", victim: "captive_young", at: 34.16, clipTime: 0.76,
    attackClip: "IjaBayonetDownThrust", victimClip: "CaptiveKneelHandsHead", band: [0.74, 0.84],
    reach: "tip", depth: [0.08, 0.16] },
  { name: "下刺黑场", attacker: "ija_ding", victim: "captive_third", at: 35.36, clipTime: 0.74,
    attackClip: "IjaBayonetDownThrust", victimClip: "CaptiveKneelHandsHead", band: [0.74, 0.84],
    reach: "tip", depth: [0.08, 0.16] },
];
const BEARINGS = {};
for (const contact of CONTACTS) {
  const a = TrackAt(contact.attacker, contact.at);
  const v = TrackAt(contact.victim, contact.at);
  contact.distance = Math.hypot(a.x - v.x, a.z - v.z);
  // 世界 delta → 受击者本地（local = Ry(−ry)·world；本地 −Z 是正面，+Z 是背后）
  const cos = Math.cos(v.ry);
  const sin = Math.sin(v.ry);
  const dx = a.x - v.x;
  const dz = a.z - v.z;
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  const length = Math.hypot(lx, lz) || 1;
  contact.ux = lx / length;
  contact.uz = lz / length;
  assert.ok(contact.uz > 0.4,
    `${contact.name}：施动者必须在受击者的身后半边（本地 z ${contact.uz.toFixed(3)}）`);
  // 受击者那一刻真的在播这条 clip 吗（拍表与站位表是两处，写岔了就白算）
  const playing = TrackAt(contact.victim, contact.at - 0.001).state.perform;
  assert.equal(playing, contact.victimClip,
    `${contact.name}：接触前一帧 ${contact.victim} 在播 ${playing}，不是 ${contact.victimClip}`);
  (BEARINGS[contact.victimClip] ||= []).push([contact.band[0], contact.band[1], contact.ux, contact.uz]);
  contact.bearingIndex = BEARINGS[contact.victimClip].length - 1;
}
// 押解进场：三名俘虏必须走同一段距离（同一条 clip 只带一个 referenceSpeedMps），
// 而且那三帧上真的写着 CaptiveHandsUpWalk。
const marchSpeeds = ["captive_old", "captive_young", "captive_third"].map((id) => {
  const track = CastTrack(id);
  assert.equal(track[0].state.perform, "CaptiveHandsUpWalk", `${id} 进场必须播举手走`);
  const travel = Math.hypot(track[2].pos[0] - track[0].pos[0], track[2].pos[2] - track[0].pos[2]);
  return { id, track: travel / track[2].t, move: track[0].state.moveSpeed * 4.2 };
});
for (const row of marchSpeeds) {
  assert.ok(Math.abs(row.track - row.move) < 0.03,
    `${row.id} 进场轨道 ${row.track.toFixed(3)} m/s 与 moveSpeed×4.2 ${row.move.toFixed(3)} 对不上`);
}
assert.ok(Math.max(...marchSpeeds.map((r) => r.track)) - Math.min(...marchSpeeds.map((r) => r.track)) < 0.01,
  "三名俘虏的进场速度必须一致（同一条走路 clip，速率按起播帧的 moveSpeed 定）");
const MARCH_SPEED = marchSpeeds[0].track;

// 引擎接线：过场逐帧更新必须真的走这一层，SampleTrack 必须把字符串当段内常量。
const cutsceneSource = await fs.readFile(path.join(project, "Script_Cutscene.mjs"), "utf8");
assert.match(cutsceneSource, /PerformCutsceneActor\(item, dt, now, \(\) => item\.actor\.Update\(dt, state\)\)/,
  "Script_Cutscene._ApplyActors 必须通过 PerformCutsceneActor 调 actor.Update");
assert.match(cutsceneSource, /typeof va === "string" \|\| typeof vb === "string"/,
  "SampleTrack 必须把字符串 state 字段按段内常量取，不插值成 NaN");

// ---------------------------------------------------------------------------
// 2. 原皮实播（真浏览器）
// ---------------------------------------------------------------------------
await fs.mkdir(out, { recursive: true });
await fs.writeFile(path.join(out, "_check_MachineGunCaptives.html"), `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#1e2125;color:#eee;font:14px system-ui}#review{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;padding:10px}.card{background:#2c3136}.card img{width:100%;display:block}.card p{margin:6px 8px}</style><div id="review"></div><script type="importmap">{"imports":{"three":"../../vendor/three/build/three.module.js"}}</script><script type="module">
import * as T from 'three';import {GLTFLoader} from '../../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import {LugouCharacterRig} from '../../Script_CharacterModel.mjs';
import {LoadMachineGunCaptivesAnimation,MachineGunCaptivesLibrary,PerformCutsceneActor,ResolvePerform,ReleaseCutscenePerformer} from '../../Script_CutscenePerformance.mjs';
window.CaptivesCheck={T,loader:new GLTFLoader(),LugouCharacterRig,LoadMachineGunCaptivesAnimation,MachineGunCaptivesLibrary,PerformCutsceneActor,ResolvePerform,ReleaseCutscenePerformer};</script>`);

const server = await ServeRoot(path.dirname(project), 0);
const browser = await LaunchBrowser();
const errors = [];
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/_shots/MachineGunCaptives/_check_MachineGunCaptives.html`);
  await page.waitForFunction(() => window.CaptivesCheck);
  await page.evaluate(() => window.CaptivesCheck.LoadMachineGunCaptivesAnimation("../../Animation/MachineGunCaptives/"));

  for (const record of config.models) {
    const result = await page.evaluate(async ({ record, assetRecord, bayonetTipM, BEARINGS }) => {
      const C = window.CaptivesCheck;
      const T = C.T;
      const gltf = await C.loader.loadAsync(`../../Model/Character/Model_${record.id}.glb`);
      const actorRoot = new T.Group();
      const body = new T.Group();
      body.position.y = 0.85;
      actorRoot.add(body);
      const rig = new C.LugouCharacterRig({ record: assetRecord, gltf },
        { kind: record.id.startsWith("LugouIja") ? "ija" : "nra", targetHeight: 1.66, seed: "Captives", variantIndex: 1 });
      rig.Attach({ root: actorRoot, body });
      // 只有 characterRig / root 的最小演员：没有 _UpdateRiggedWeaponMount，
      // 表演层的补枪那一步会自己让开，这条测试量的是骨头不是挂点。
      const actor = { root: actorRoot, body, characterRig: rig };
      const Step = (entry, time) => C.PerformCutsceneActor(entry, 1 / 60, time, () => rig.Update(0, {}));

      const scene = new T.Scene();
      scene.background = new T.Color(0x2c3136);
      scene.add(actorRoot);
      const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setSize(260, 300);
      renderer.outputColorSpace = T.SRGBColorSpace;
      const camera = new T.PerspectiveCamera(36, 260 / 300, 0.01, 20);
      camera.position.set(-2.1, 1.35, -2.9);
      camera.lookAt(0, 0.7, 0);
      scene.add(new T.HemisphereLight(0xe6edff, 0x554737, 2));
      const key = new T.DirectionalLight(0xffe4c6, 3);
      key.position.set(-3, 5, -4);
      scene.add(key);
      const floor = new T.Mesh(new T.BoxGeometry(4, 0.04, 4), new T.MeshStandardMaterial({ color: 0x44494a, roughness: 1 }));
      floor.position.y = -0.02;
      scene.add(floor);
      const rifle = new T.Mesh(new T.BoxGeometry(0.05, 0.05, 1), new T.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.8 }));
      rifle.visible = false;
      scene.add(rifle);
      rig.root.traverse((node) => {
        if (!node.isMesh) return;
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
          material.metalness = 0; material.roughness = 0.78;
        }
        if (!node.isSkinnedMesh) node.visible = false;
      });

      const point = (node) => node.getWorldPosition(new T.Vector3());
      const Snapshot = () => {
        const values = [];
        rig.root.traverse((node) => values.push(...node.position, ...node.quaternion, ...node.scale));
        return values;
      };
      // 一次遍历量四件事（顶点是真蒙皮顶点，不是骨头）：整皮包围盒、手/脚的最低点
      // （趴姿贴地）、右靴的最远前伸（踢的触及 —— 趾**骨**的高度不是它的前伸，
      // 2026-09-15 那版就是把这两个数搞混了），以及跪着的人在若干打击方位上的体表
      // 距离（站位 = 触及 + 这一段）。
      const CORRIDOR = 0.09;
      const Measure = (bearings = []) => {
        const min = new T.Vector3(Infinity, Infinity, Infinity);
        const max = new T.Vector3(-Infinity, -Infinity, -Infinity);
        const low = { hand: Infinity, foot: Infinity };
        let bootFront = -Infinity;
        const support = bearings.map(() => -Infinity);
        const v = new T.Vector3();
        rig.root.traverse((mesh) => {
          if (!mesh.isSkinnedMesh) return;
          const names = mesh.skeleton.bones.map((bone) => bone.name || "");
          const skinIndex = mesh.geometry.attributes.skinIndex;
          const skinWeight = mesh.geometry.attributes.skinWeight;
          for (let i = 0; i < mesh.geometry.attributes.position.count; i += 1) {
            mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld);
            min.min(v); max.max(v);
            let best = 0;
            let bestWeight = -1;
            for (let k = 0; k < 4; k += 1) {
              const weight = skinWeight.getComponent(i, k);
              if (weight > bestWeight) { bestWeight = weight; best = skinIndex.getComponent(i, k); }
            }
            const name = names[best] || "";
            if (/(Hand|Finger)/.test(name)) low.hand = Math.min(low.hand, v.y);
            if (/(Foot|Toe)/.test(name)) {
              low.foot = Math.min(low.foot, v.y);
              // GLTFLoader 用 PropertyBinding.sanitizeNodeName 把空格换成下划线，
              // 所以运行时的骨名是 Bip002_R_Foot，不是源 GLB 里的「Bip002 R Foot」。
              if (/[_ ]R[_ ](Foot|Toe)/.test(name)) bootFront = Math.max(bootFront, -v.z);
            }
            for (let b = 0; b < bearings.length; b += 1) {
              const [lo, hi, ux, uz] = bearings[b];
              if (v.y < lo || v.y > hi) continue;
              if (Math.abs(v.x * uz - v.z * ux) > CORRIDOR) continue;
              support[b] = Math.max(support[b], v.x * ux + v.z * uz);
            }
          }
        });
        return {
          bounds: { min: min.toArray(), max: max.toArray() },
          low: { hand: Number.isFinite(low.hand) ? low.hand : null,
                 foot: Number.isFinite(low.foot) ? low.foot : null },
          bootFront: Number.isFinite(bootFront) ? bootFront : null,
          support: support.map((value) => (value > -1e8 ? value : null)),
        };
      };
      const toe = { L: null, R: null };
      rig.root.traverse((node) => {
        if (/L[_ ]?Toe0$/i.test(node.name)) toe.L = node;
        if (/R[_ ]?Toe0$/i.test(node.name)) toe.R = node;
      });
      // 与 Actor._UpdateRiggedWeaponMount 同一条规则：双手持枪沿两手连线，
      // 单手持枪沿前臂过腕的延长线。用错规则画出来的代枪会从脑袋里穿过去。
      const RifleLine = (hold) => {
        const gripR = rig.Grip("weaponR"), gripL = rig.Grip("weaponL");
        if (!gripR) return null;
        const a = point(gripR);
        const axis = hold === "oneHandRight"
          ? a.clone().sub(point(rig.bones.forearmR))
          : (gripL ? point(gripL).sub(a) : null);
        if (!axis || axis.length() < 1e-5) return null;
        axis.normalize();
        return {
          grip: a.toArray(),
          axis: axis.toArray(),
          tip: a.clone().addScaledVector(axis, bayonetTipM).toArray(),
          butt: a.clone().addScaledVector(axis, -0.255).toArray(),
        };
      };

      const originalRoot = actorRoot.matrixWorld.clone();
      const baseline = (() => { rig.Update(0, {}); actorRoot.updateMatrixWorld(true); return Snapshot(); })();
      let maxRootDrift = 0;
      let maxRestoreError = 0;
      const clips = [];
      for (const clipId of record.clipIds) {
        const duration = C.MachineGunCaptivesLibrary().config.clips[clipId].duration;
        const loop = C.MachineGunCaptivesLibrary().config.clips[clipId].loop;
        const t0 = 5;
        const entry = { actor, spec: { track: [
          { t: 0, pos: [0, 0, 0], state: {} },
          { t: t0, pos: [0, 0, 0], state: { perform: clipId } },
          { t: t0 + duration + 4, pos: [0, 0, 0], state: { perform: null } },
        ] } };
        // 一次性动作另加各自的关键时刻（蓄力 / 命中 / 抽回），否则均匀取样会正好
        // 跨过最用力的那一帧。
        const EXTRA = {
          IjaBayonetDownThrust: [0.40, 0.74, 0.76, 1.06], IjaRifleButtStrike: [0.28, 0.50, 0.68, 0.85, 1.02, 1.16],
          IjaKickPrisoner: [0.46, 0.50], CaptiveStruckDown: [0.16, 0.70], CaptiveStabbedCollapse: [0.22, 0.92],
          CaptiveStandToKneel: [0.5], CaptiveKneelFlinch: [0.09, 0.2],
        };
        const times = (loop
          ? [0, duration * 0.17, duration * 0.33, duration * 0.5, duration * 0.66, duration * 0.83, duration]
          : [0, duration * 0.2, duration * 0.4, duration * 0.6, duration * 0.8, duration, ...(EXTRA[clipId] || [])])
          .sort((a, b) => a - b);
        const samples = [];
        let motion = 0;
        let first = null;
        for (const at of times) {
          const before = Snapshot();
          const applied = Step(entry, t0 + at);
          if (!applied) throw new Error(`${record.id} ${clipId} did not play`);
          actorRoot.updateMatrixWorld(true);
          const pose = Snapshot();
          if (!first) first = pose;
          for (let i = 0; i < pose.length; i += 1) motion = Math.max(motion, Math.abs(pose[i] - first[i]));
          // 跪着的循环姿要额外量三个打击方位上的体表距离（bearings 由过场站位反推，
          // 见 Node 侧的 CONTACTS），其余 clip 只量包围盒与手脚贴地。
          const measured = Measure(BEARINGS[clipId] || []);
          const bounds = measured.bounds;
          // 朝向从骨盆的横轴与躯干轴算，不看脚尖：跪姿的脚是往后折的，趾骨方向
          // 恰好指着背面。立着的人 facing.z < 0（局部 -Z 正面），趴下的人 facing.y < 0
          // （胸口朝地），同一条式子把「有没有背对着镜头」和「是不是脸朝下倒的」一起量了。
          const hipLeft = point(rig.bones.thighL).sub(point(rig.bones.thighR)).normalize();
          const bodyUp = point(rig.bones.head).sub(point(rig.bones.pelvis)).normalize();
          const facing = hipLeft.clone().cross(bodyUp).normalize().toArray();
          const pelvisAt = point(rig.bones.pelvis);
          const torsoPitch = Math.acos(Math.min(1, Math.max(-1,
            point(rig.bones.chest).sub(pelvisAt).normalize().y))) * 180 / Math.PI;
          const armSpanR = point(rig.bones.handR).distanceTo(point(rig.bones.upperArmR));
          samples.push({
            t: at,
            head: point(rig.bones.head).y,
            pelvis: point(rig.bones.pelvis).y,
            kneeL: point(rig.bones.calfL).y,
            kneeR: point(rig.bones.calfR).y,
            toeL: toe.L ? point(toe.L).y : null,
            toeR: toe.R ? point(toe.R).y : null,
            wristL: point(rig.bones.handL).y,
            wristR: point(rig.bones.handR).y,
            bounds, facing, torsoPitch, armSpanR,
            low: measured.low, bootFront: measured.bootFront, support: measured.support,
            pelvisZ: pelvisAt.z,
            footLz: point(rig.bones.footL).z,
            footRz: point(rig.bones.footR).z,
            rifle: RifleLine(C.MachineGunCaptivesLibrary().config.clips[clipId].weaponHold),
          });
          const matrix = actorRoot.matrixWorld.elements;
          for (let i = 0; i < 16; i += 1) maxRootDrift = Math.max(maxRootDrift, Math.abs(matrix[i] - originalRoot.elements[i]));
          C.ReleaseCutscenePerformer(actor);
          const restored = Snapshot();
          for (let i = 0; i < before.length; i += 1) maxRestoreError = Math.max(maxRestoreError, Math.abs(restored[i] - before[i]));
        }
        // 联系图：循环两张、一次性三张，IJA 的镜头里画一根从枪托到刺刀尖的代枪。
        const shots = loop ? [duration * 0.0, duration * 0.5] : [duration * 0.35, duration * 0.62, duration];
        for (const at of shots) {
          Step(entry, t0 + at);
          actorRoot.updateMatrixWorld(true);
          const hold = C.MachineGunCaptivesLibrary().config.clips[clipId].weaponHold;
          const line = hold !== "free" ? RifleLine(hold) : null;
          rifle.visible = !!line;
          if (line) {
            const butt = new T.Vector3().fromArray(line.butt);
            const tip = new T.Vector3().fromArray(line.tip);
            rifle.position.copy(butt).add(tip).multiplyScalar(0.5);
            rifle.scale.set(1, 1, butt.distanceTo(tip));
            rifle.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), tip.clone().sub(butt).normalize());
          }
          renderer.render(scene, camera);
          const card = document.createElement("div");
          card.className = "card";
          const image = document.createElement("img");
          image.src = renderer.domElement.toDataURL("image/png");
          card.append(image);
          const caption = document.createElement("p");
          caption.textContent = `${record.id} ${clipId} ${at.toFixed(2)}s`;
          card.append(caption);
          document.querySelector("#review").append(card);
          C.ReleaseCutscenePerformer(actor);
        }
        clips.push({ clipId, duration, loop, motion, samples });
      }

      // ---- perform 契约 -----------------------------------------------------
      // 整秒时长的那条循环：`At(3 + duration)` 要能精确落回第 0 帧，而 3 + 1.8 − 3
      // 在双精度里是 1.7999999999999998，取样就插到倒数第二帧上去了（误差 3.5e-7）。
      // 走路那条的循环接缝由烘焙产物的首尾帧逐比特断言守着，不靠这一条。
      const loopClip = record.clipIds.find((id) => C.MachineGunCaptivesLibrary().config.clips[id].loop
        && Number.isInteger(C.MachineGunCaptivesLibrary().config.clips[id].duration));
      const onceClip = record.clipIds.find((id) => !C.MachineGunCaptivesLibrary().config.clips[id].loop);
      const loopDuration = C.MachineGunCaptivesLibrary().config.clips[loopClip].duration;
      const onceDuration = C.MachineGunCaptivesLibrary().config.clips[onceClip].duration;
      const track = [
        { t: 0, pos: [0, 0, 0], state: {} },
        { t: 3, pos: [0, 0, 0], state: { perform: loopClip } },
        { t: 5, pos: [0, 0, 0], state: { perform: loopClip } },
        { t: 9, pos: [0, 0, 0], state: { perform: onceClip } },
        { t: 14, pos: [0, 0, 0], state: { perform: null } },
      ];
      const entry = { actor, spec: { track } };
      const At = (time) => { Step(entry, time); actorRoot.updateMatrixWorld(true); return Snapshot(); };
      const contract = {};
      contract.resolveBefore = C.ResolvePerform(track, 2.9);
      contract.resolveMid = C.ResolvePerform(track, 6.0);
      contract.resolveOnce = C.ResolvePerform(track, 9.5);
      contract.resolveAfter = C.ResolvePerform(track, 14.5);
      // t0 起播：t=3 的姿势 = clip 的第 0 秒；t=4.5 = clip 的第 1.5 秒。
      const startPose = At(3);
      const laterPose = At(4.5);
      // loop：t0+duration 回到第 0 秒（同一条 clip 一路播过来，中间没有换段）。
      const wrapped = At(3 + loopDuration);
      contract.loopWrapError = Math.max(...startPose.map((v, i) => Math.abs(v - wrapped[i])));
      contract.startEqualsLater = Math.max(...startPose.map((v, i) => Math.abs(v - laterPose[i])));
      // once：播完保持末帧。
      const endPose = At(9 + onceDuration);
      const heldPose = At(9 + onceDuration + 2.5);
      contract.holdError = Math.max(...endPose.map((v, i) => Math.abs(v - heldPose[i])));
      // 拖时间轴：正着逐步推 vs 直接跳过去，必须逐比特相同。
      const probes = [3.05, 4.2, 6.7, 8.9, 9.4, 10.1, 13.9];
      const forward = [];
      for (let time = 3; time <= 14; time += 1 / 30) At(time);
      for (const time of probes) forward.push(At(time));
      const jumped = [];
      for (const time of [...probes].reverse()) jumped.unshift(At(time));
      contract.scrubError = Math.max(...probes.map((_, index) =>
        Math.max(...forward[index].map((v, i) => Math.abs(v - jumped[index][i])))));
      // 未知 clip id：回退到 POSE_CLIPS、warn 一次、不抛错。
      const warnings = [];
      const originalWarn = console.warn;
      console.warn = (...args) => warnings.push(args.join(" "));
      const unknownEntry = { actor, spec: { track: [
        { t: 0, pos: [0, 0, 0], state: {} },
        { t: 1, pos: [0, 0, 0], state: { perform: "NoSuchCaptivesClip" } },
      ] } };
      C.ReleaseCutscenePerformer(actor);
      const beforeUnknown = (() => { rig.Update(0, {}); actorRoot.updateMatrixWorld(true); return Snapshot(); })();
      contract.unknownApplied = Step(unknownEntry, 2) || Step(unknownEntry, 2.5);
      actorRoot.updateMatrixWorld(true);
      const afterUnknown = Snapshot();
      console.warn = originalWarn;
      contract.unknownWarnings = warnings.filter((line) => line.includes("NoSuchCaptivesClip")).length;
      contract.unknownDrift = Math.max(...beforeUnknown.map((v, i) => Math.abs(v - afterUnknown[i])));
      // perform:null 之后彻底还原到普通 POSE_CLIPS 姿势。
      C.ReleaseCutscenePerformer(actor);
      Step(entry, 15);
      actorRoot.updateMatrixWorld(true);
      const released = Snapshot();
      contract.releaseDrift = Math.max(...baseline.map((v, i) => Math.abs(v - released[i])));

      // ---- 押解走的滑步量 -----------------------------------------------
      // 支撑脚相对根的后移速度必须等于 clip 自报的 referenceSpeedMps × 演员缩放。
      // 逐 1/24 s 密取样（clips 那边七个点是 0.3 s 一跳，正好会跨过抬脚那一帧）。
      let walk = null;
      if (record.clipIds.includes("CaptiveHandsUpWalk")) {
        const info = C.MachineGunCaptivesLibrary().config.clips.CaptiveHandsUpWalk;
        const entry = { actor, spec: { track: [
          { t: 0, pos: [0, 0, 0], state: {} },
          { t: 5, pos: [0, 0, 0], state: { perform: "CaptiveHandsUpWalk" } },
          { t: 20, pos: [0, 0, 0], state: { perform: null } },
        ] } };
        let scale = 1;
        for (let node = rig.root; node; node = node.parent) scale *= node.scale.y || 1;
        const step = 1 / 24;
        const feet = [];
        for (let at = 0; at <= info.duration + 1e-9; at += step) {
          C.PerformCutsceneActor(entry, step, 5 + at, () => rig.Update(0, {}));
          actorRoot.updateMatrixWorld(true);
          feet.push([point(rig.bones.footL).z, point(rig.bones.footR).z]);
        }
        C.ReleaseCutscenePerformer(actor);
        // 演员正面是局部 −Z，所以站着不动的脚相对根往 +Z 走。两只脚里走得快的那只
        // 就是踩在地上的那只（另一只在往前甩，是负的）。
        const speeds = [];
        for (let i = 1; i < feet.length; i += 1) {
          speeds.push(Math.max(feet[i][0] - feet[i - 1][0], feet[i][1] - feet[i - 1][1]) / step);
        }
        walk = { scale, reference: info.referenceSpeedMps,
                 min: Math.min(...speeds), max: Math.max(...speeds) };
      }

      C.ReleaseCutscenePerformer(actor);
      renderer.dispose();
      return { modelId: record.id, maxRootDrift, maxRestoreError, clips, contract, walk };
    }, { record, assetRecord: manifest.models.find((m) => m.id === record.id),
      bayonetTipM: 1.663 - 0.255, BEARINGS });

    results.push(result);
    const faction = record.id.startsWith("LugouIja") ? "ija" : "nra";
    console.log(`MODEL ${result.modelId} rootDrift=${result.maxRootDrift} restore=${result.maxRestoreError.toExponential(2)}`);
    assert.equal(result.maxRootDrift, 0, `${record.id} 表演层不许动 Actor 世界根`);
    assert.ok(result.maxRestoreError < 1e-12, `${record.id} 还原漂移 ${result.maxRestoreError}`);

    // 押解走的滑步量。支撑脚相对根的后移速度 = clip 自报的 referenceSpeedMps × 演员
    // 缩放；运行时再按 moveSpeed×4.2 与它的比值调播放速率，于是脚与轨道同速。
    if (result.walk) {
      const want = result.walk.reference * result.walk.scale;
      const error = Math.max(Math.abs(result.walk.max - want), Math.abs(result.walk.min - want));
      const rate = MARCH_SPEED / want;
      console.log(`  walk 支撑脚 ${result.walk.min.toFixed(4)}..${result.walk.max.toFixed(4)} m/s`
        + ` 参考 ${want.toFixed(4)}（缩放 ${result.walk.scale.toFixed(4)}）`
        + ` 误差 ${(error / want * 100).toFixed(2)}% 速率 ${rate.toFixed(3)}`);
      assert.ok(error < want * 0.02,
        `${record.id} 举手走滑步 ${(error * 1000).toFixed(1)} mm/s（支撑脚要按 ${want.toFixed(3)} m/s 后移）`);
      assert.ok(rate > 0.25 && rate < 4,
        `${record.id} 进场速率 ${rate.toFixed(3)} 出了表演层 0.25–4 的夹取范围`);
    }

    for (const clip of result.clips) {
      const heads = clip.samples.map((s) => s.head);
      const lowest = Math.min(...clip.samples.map((s) => s.bounds.min[1]));
      const highestFloor = Math.max(...clip.samples.map((s) => s.bounds.min[1]));
      console.log(`  ${clip.clipId.padEnd(24)} head ${Math.min(...heads).toFixed(3)}-${Math.max(...heads).toFixed(3)}`
        + ` floor ${lowest.toFixed(4)}..${highestFloor.toFixed(4)} motion ${clip.motion.toFixed(3)}`);
      assert.ok(clip.motion > 0.004, `${record.id} ${clip.clipId} 必须是会动的 clip（实测 ${clip.motion}）`);
      for (const sample of clip.samples) {
        assert.ok(sample.bounds.min[1] > -0.006,
          `${record.id} ${clip.clipId} t=${sample.t} 整皮陷地 ${sample.bounds.min[1]}`);
        assert.ok(sample.bounds.min[1] < 0.035,
          `${record.id} ${clip.clipId} t=${sample.t} 整皮离地 ${sample.bounds.min[1]}`);
        assert.ok(sample.bounds.max[0] - sample.bounds.min[0] < 1.6
          && sample.bounds.max[2] - sample.bounds.min[2] < 2.1,
          `${record.id} ${clip.clipId} t=${sample.t} 原骨架帧换算失真`);
        if (sample.head > 0.8) {
          assert.ok(sample.facing[2] < -0.45,
            `${record.id} ${clip.clipId} t=${sample.t} 正面必须是局部 -Z（实测 ${sample.facing[2].toFixed(3)}）`);
        } else if (sample.head < 0.45) {
          assert.ok(sample.facing[1] < -0.35,
            `${record.id} ${clip.clipId} t=${sample.t} 必须是脸朝下趴倒（实测 ${sample.facing[1].toFixed(3)}）`);
        }
      }
      const At = (t) => clip.samples.reduce((best, s) => (Math.abs(s.t - t) < Math.abs(best.t - t) ? s : best));
      const min = (key) => Math.min(...clip.samples.map((s) => s[key]));
      const max = (key) => Math.max(...clip.samples.map((s) => s[key]));
      if (clip.clipId === "CaptiveHandsUpStand") {
        assert.ok(min("head") > 1.25 && max("head") < 1.45, `${record.id} 站姿头高 ${min("head")}`);
        const lift = Math.max(...clip.samples.map((s) => Math.max(s.wristL, s.wristR) - s.head));
        assert.ok(lift > 0.25, `${record.id} 举手必须过头顶（腕高于头骨 ${lift.toFixed(3)} m）`);
      }
      if (clip.clipId === "CaptiveKneelHandsHead" || clip.clipId === "CaptiveKneelPlead") {
        assert.ok(min("head") > 0.88 && max("head") < 1.06, `${record.id} ${clip.clipId} 跪姿头高 ${min("head")}`);
        assert.ok(min("pelvis") > 0.38 && max("pelvis") < 0.52, `${record.id} ${clip.clipId} 跪姿骨盆 ${min("pelvis")}`);
        const knee = Math.max(min("kneeL"), min("kneeR"));
        assert.ok(knee > 0.02 && knee < 0.15, `${record.id} ${clip.clipId} 两膝必须着地（膝骨 ${knee.toFixed(3)} m）`);
        const foot = Math.max(min("toeL"), min("toeR"));
        assert.ok(foot < 0.12, `${record.id} ${clip.clipId} 脚背必须贴地（趾骨 ${foot.toFixed(3)} m）`);
      }
      if (clip.clipId === "CaptiveKneelHandsHead") {
        const wrist = Math.min(...clip.samples.map((s) => Math.min(s.wristL, s.wristR) - s.head));
        assert.ok(wrist > -0.10, `${record.id} 抱后脑：手腕要在头骨附近（${wrist.toFixed(3)} m）`);
      }
      if (clip.clipId === "CaptiveStruckDown" || clip.clipId === "CaptiveStabbedCollapse") {
        // 趴姿末帧：手掌与脚背要贴在地上（±1 cm），躯干仍以大腿前面当最低接触点。
        const end = At(clip.duration);
        console.log(`    趴稳末帧 手 ${end.low.hand.toFixed(4)} 脚 ${end.low.foot.toFixed(4)}`
          + ` 整皮 ${end.bounds.min[1].toFixed(4)}`);
        assert.ok(end.low.hand > -0.004 && end.low.hand < 0.014,
          `${record.id} ${clip.clipId} 末帧手掌离地 ${(end.low.hand * 1000).toFixed(1)} mm（要 0–14）`);
        assert.ok(end.low.foot > -0.004 && end.low.foot < 0.014,
          `${record.id} ${clip.clipId} 末帧脚背离地 ${(end.low.foot * 1000).toFixed(1)} mm（要 0–14）`);
      }
      if (clip.clipId === "CaptiveStruckDown" || clip.clipId === "CaptiveStabbedCollapse") {
        const start = At(0), end = At(clip.duration);
        assert.ok(start.head > 0.88, `${record.id} ${clip.clipId} 起手必须是跪姿（${start.head.toFixed(3)}）`);
        assert.ok(end.head > 0.14 && end.head < 0.42, `${record.id} ${clip.clipId} 末帧必须趴稳（${end.head.toFixed(3)}）`);
        assert.ok(end.pelvis < 0.32, `${record.id} ${clip.clipId} 末帧骨盆 ${end.pelvis.toFixed(3)}`);
        assert.ok(start.head - end.head > 0.5, `${record.id} ${clip.clipId} 必须真的倒下去`);
      }
      if (faction === "ija") {
        assert.ok(min("head") > 1.10, `${record.id} ${clip.clipId} 日军全程站着（最低头高 ${min("head").toFixed(3)}）`);
        for (const sample of clip.samples) assert.ok(sample.rifle, `${record.id} ${clip.clipId} 缺持枪手`);
        const tipY = clip.samples.map((s) => s.rifle.tip[1]);
        const tipZ = clip.samples.map((s) => s.rifle.tip[2]);
        const buttZ = clip.samples.map((s) => s.rifle.butt[2]);
        const hit = clip.samples.reduce((best, s) => (s.rifle.butt[2] < best.rifle.butt[2] ? s : best));
        console.log(`    tip y ${Math.min(...tipY).toFixed(3)}..${Math.max(...tipY).toFixed(3)}`
          + ` z ${Math.min(...tipZ).toFixed(3)}..${Math.max(...tipZ).toFixed(3)}`
          + ` butt(z ${Math.min(...buttZ).toFixed(3)} y ${hit.rifle.butt[1].toFixed(3)} @t=${hit.t.toFixed(2)})`
          + ` torso ${hit.torsoPitch.toFixed(1)}° armR ${hit.armSpanR.toFixed(3)}`);
      }
      if (clip.clipId === "IjaBayonetGuard") {
        const tip = clip.samples.map((s) => s.rifle.tip);
        assert.ok(Math.max(...tip.map((p) => p[2])) < -0.85, `${record.id} 平端：刺刀尖必须前伸`);
        const height = tip.map((p) => p[1]);
        assert.ok(Math.min(...height) > 0.40 && Math.max(...height) < 0.90,
          `${record.id} 平端：刺刀尖指向前下方（${Math.min(...height).toFixed(3)}–${Math.max(...height).toFixed(3)} m）`);
      }
      if (clip.clipId === "IjaBayonetDownThrust") {
        const apex = clip.samples.reduce((best, s) => (s.rifle.tip[2] < best.rifle.tip[2] ? s : best));
        assert.ok(apex.rifle.tip[2] < -1.15, `${record.id} 刺出：刺刀尖前伸 ${(-apex.rifle.tip[2]).toFixed(3)} m`);
        assert.ok(apex.rifle.tip[1] > 0.55 && apex.rifle.tip[1] < 0.88,
          `${record.id} 刺出：刺刀尖高度 ${apex.rifle.tip[1].toFixed(3)} m（目标躯干 0.6–0.8）`);
        const back = Math.max(...clip.samples.map((s) => s.rifle.tip[2]));
        assert.ok(back - apex.rifle.tip[2] > 0.30,
          `${record.id} 刺击要有蓄力—刺出两段（行程 ${(back - apex.rifle.tip[2]).toFixed(3)} m）`);
        assert.ok(At(clip.duration).rifle.tip[2] - apex.rifle.tip[2] > 0.20, `${record.id} 刺完要抽回`);
      }
      if (clip.clipId === "IjaRifleButtStrike") {
        // 蓄力（约 0.5 s）：枪托甩到头顶后上方、枪口朝前下，两手一后一前分开握在枪身上。
        const wind = At(0.50);
        assert.ok(wind.rifle.butt[1] - wind.head > 0.15,
          `${record.id} 蓄力：枪托要高过头顶（比头骨高 ${(wind.rifle.butt[1] - wind.head).toFixed(3)} m）`);
        assert.ok(wind.rifle.butt[2] > 0.08,
          `${record.id} 蓄力：枪托要甩到身后（${wind.rifle.butt[2].toFixed(3)} m）`);
        assert.ok(wind.rifle.axis[1] < -0.35, `${record.id} 蓄力：枪口朝前下`);
        assert.ok(wind.wristR - wind.head > 0.05 && wind.wristL - wind.head < 0.02,
          `${record.id} 蓄力：右手在头上方、左手在胸前，不能两手都挤在脸前`
          + `（右 ${(wind.wristR - wind.head).toFixed(3)} / 左 ${(wind.wristL - wind.head).toFixed(3)}）`);
        // 砸击（约 0.85 s）：枪托落到跪着的人的头肩高度，躯干前倾，右臂伸出，重心到前脚。
        const hit = clip.samples.reduce((best, s) => (s.rifle.butt[2] < best.rifle.butt[2] ? s : best));
        assert.ok(hit.rifle.butt[2] < -0.75 && hit.rifle.butt[2] > -0.95,
          `${record.id} 砸击：枪托落点前伸 ${(-hit.rifle.butt[2]).toFixed(3)} m（要 0.75–0.95）`);
        assert.ok(hit.rifle.butt[1] > 0.55 && hit.rifle.butt[1] < 0.75,
          `${record.id} 砸击：枪托落点高度 ${hit.rifle.butt[1].toFixed(3)} m（要 0.55–0.75）`);
        assert.ok(hit.rifle.axis[1] > 0.35, `${record.id} 反握：砸的时候枪口朝上后方`);
        assert.ok(hit.torsoPitch > 20 && hit.torsoPitch < 30,
          `${record.id} 砸击：躯干前倾 ${hit.torsoPitch.toFixed(1)}°（要 20–30）`);
        assert.ok(hit.armSpanR > 0.40, `${record.id} 砸击：右臂要伸出去（肩到腕 ${hit.armSpanR.toFixed(3)} m）`);
        assert.ok(At(0).pelvisZ - hit.pelvisZ > 0.15,
          `${record.id} 砸击：重心要压到前脚（骨盆前移 ${(At(0).pelvisZ - hit.pelvisZ).toFixed(3)} m）`);
        assert.ok(hit.footLz < hit.pelvisZ && hit.footRz > hit.pelvisZ,
          `${record.id} 砸击：骨盆要落在前后脚之间、偏前脚`);
        // 收回（1.4 s）：回到正常持枪式（枪口朝前下、枪托在手后方）。
        const back = At(clip.duration);
        assert.ok(At(0).rifle.axis[1] < 0 && back.rifle.axis[1] < 0, `${record.id} 起手与收尾是正常持枪`);
        assert.ok(back.rifle.butt[2] > 0.15, `${record.id} 收尾：枪托回到手后方（${back.rifle.butt[2].toFixed(3)} m）`);
        assert.ok(Math.abs(back.rifle.butt[1] - At(0).rifle.butt[1]) < 0.02
          && Math.abs(back.torsoPitch - At(0).torsoPitch) < 1.5, `${record.id} 收尾必须回到起手那一式`);
      }
      if (clip.clipId === "IjaKickPrisoner") {
        const toeLift = Math.max(...clip.samples.map((s) => s.toeR));
        assert.ok(toeLift > 0.35, `${record.id} 踢腿脚尖离地 ${toeLift.toFixed(3)} m`);
        assert.ok(At(clip.duration).toeR < 0.09, `${record.id} 踢完收腿站稳`);
        const shift = Math.max(...clip.samples.map((s) => s.pelvis)) - Math.min(...clip.samples.map((s) => s.pelvis));
        assert.ok(shift > 0.02, `${record.id} 踢腿要有重心转移（骨盆起伏 ${shift.toFixed(3)} m）`);
      }
      if (clip.clipId === "IjaTauntGesture") {
        const reach = Math.min(...clip.samples.map((s) => s.rifle.tip[2]));
        const tipFloor = Math.min(...clip.samples.map((s) => s.rifle.tip[1]));
        assert.ok(reach < -0.6, `${record.id} 喝令时枪仍在手上并指向前方（${reach.toFixed(3)} m）`);
        assert.ok(tipFloor > 0.10, `${record.id} 单手持枪的刺刀尖不许插进地里（${tipFloor.toFixed(3)} m）`);
      }
    }

    const c = result.contract;
    console.log(`  contract ${JSON.stringify({ loopWrap: c.loopWrapError, hold: c.holdError, scrub: c.scrubError,
      release: c.releaseDrift, unknownWarn: c.unknownWarnings })}`);
    assert.equal(c.resolveBefore, null, `${record.id} perform 之前不该起播`);
    assert.ok(c.resolveMid && c.resolveMid.t0 === 3, `${record.id} t0 必须回到出现 perform 的那一帧`);
    assert.ok(c.resolveOnce && c.resolveOnce.t0 === 9 && c.resolveOnce.previous?.t0 === 3,
      `${record.id} 换 clip 从新关键帧起播，并记得上一段`);
    assert.equal(c.resolveAfter, null, `${record.id} perform:null 必须退回 POSE_CLIPS`);
    assert.ok(c.startEqualsLater > 0.004, `${record.id} t0 之后姿势要真的往前走`);
    assert.ok(c.loopWrapError < 1e-9, `${record.id} loop 必须整周回环（误差 ${c.loopWrapError}）`);
    assert.ok(c.holdError < 1e-12, `${record.id} once 必须保持末帧（误差 ${c.holdError}）`);
    assert.ok(c.scrubError < 1e-12, `${record.id} 拖时间轴必须确定性（误差 ${c.scrubError}）`);
    assert.equal(c.unknownApplied, false, `${record.id} 未知 clip id 必须回退`);
    assert.equal(c.unknownWarnings, 1, `${record.id} 未知 clip id 只警告一次（实测 ${c.unknownWarnings}）`);
    assert.ok(c.unknownDrift < 1e-12, `${record.id} 未知 clip id 不许改骨头`);
    assert.ok(c.releaseDrift < 1e-12, `${record.id} 退出表演必须精确还原（${c.releaseDrift}）`);
  }

  // ---- 三次打击的接触几何（跨骨架对） ----------------------------------------
  // 受击者的皮在 NRA 那两具上量，打击的最远伸展在 IJA 那三具上量，站位在过场数据里。
  // 刺入深度 = 触及 + 体表 − 站位距离。三个数分别来自三个地方，对不上就是有一处改了
  // 没同步 —— 这正是 2026-09-15 那版踢穿胸口的形状。
  const Support = (clipId, index) => Math.max(...results.flatMap((model) => model.clips
    .filter((clip) => clip.clipId === clipId)
    .map((clip) => clip.samples[0].support[index])).filter(Number.isFinite));
  const Reach = (clipId, kind, clipTime) => {
    const values = results.flatMap((model) => model.clips
      .filter((clip) => clip.clipId === clipId)
      .map((clip) => {
        const sample = clip.samples.reduce((best, s) =>
          (Math.abs(s.t - clipTime) < Math.abs(best.t - clipTime) ? s : best));
        if (kind === "boot") return sample.bootFront;
        return -sample.rifle[kind === "butt" ? "butt" : "tip"][2];
      }));
    return { min: Math.min(...values), max: Math.max(...values) };
  };
  console.log("接触几何（触及 + 体表 − 站位 = 刺入深度，米）：");
  for (const contact of CONTACTS) {
    const support = Support(contact.victimClip, contact.bearingIndex);
    const reach = Reach(contact.attackClip, contact.reach, contact.clipTime);
    const deep = { min: reach.min + support - contact.distance, max: reach.max + support - contact.distance };
    console.log(`  ${contact.name.padEnd(6)} 站位 ${contact.distance.toFixed(3)}`
      + ` 触及 ${reach.min.toFixed(3)}–${reach.max.toFixed(3)} 体表 ${support.toFixed(3)}`
      + ` → 刺入 ${deep.min.toFixed(3)}–${deep.max.toFixed(3)}`);
    assert.ok(Number.isFinite(support) && support > 0.08 && support < 0.30,
      `${contact.name} 体表距离 ${support} 不合理`);
    assert.ok(deep.min >= contact.depth[0],
      `${contact.name} 够不着：刺入 ${deep.min.toFixed(3)} m < ${contact.depth[0]}`);
    assert.ok(deep.max <= contact.depth[1],
      `${contact.name} 陷体：刺入 ${deep.max.toFixed(3)} m > ${contact.depth[1]}`);
  }

  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(out, "Texture_MachineGunCaptivesReview.png"), fullPage: true });
  await fs.writeFile(path.join(out, "Data_MachineGunCaptivesValidation.json"),
    JSON.stringify({ version: config.version, results, errors }, null, 2));
  console.log(JSON.stringify({
    ok: true, models: results.length,
    clips: results.reduce((n, r) => n + r.clips.length, 0),
    proof: path.join(out, "Texture_MachineGunCaptivesReview.png"),
  }));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
