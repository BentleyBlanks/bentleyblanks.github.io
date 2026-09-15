// 屋内伏击动画库的保真闸门：清单/哈希/帧数/骨骼名/四元数（纯 Node），
// 再用真实 GLB + 生产骨架在真浏览器里把六条 clip 都播一遍，量脚底、朝向、
// 刺刀尖高度、伤员手够不够得着肚子，并给每条 clip 出一张 1280x720 截图。
//
// 截图不是装饰：数值全绿但四肢穿过躯干、枪口朝后、伤员浮在担架上方的 clip 不算通过，
// 所以每条 clip 的接触表都要人看过。证据留在 _shots/RoomAmbush/C/（已忽略目录）。
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ServeRoot } from './Script_DevServer.mjs';
import { LaunchBrowser } from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import { CHARACTER_MODEL_VARIANTS_BY_KIND } from './Data_CharacterSelection.mjs';

const project = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(project, '_shots', 'RoomAmbush', 'C');
const folder = path.join(project, 'Animation', 'FirstLevelAmbush');
const FPS = 24;
const Normalize = name => name.toLowerCase().replace(/[^a-z0-9]/g, '');

// Type 38 + fixed bayonet, from Model/Model_Type38.tzm.json (gripR at the origin,
// gripL at (0,-0.012,-0.443), muzzle at (0,0.035,-1.029)) and
// Model/Model_BayonetType38.tzm.json (socket (0,0.02,0.004), blade to z=-0.4).
const RIFLE = {
  gripFront: [0, -0.012, -0.443],
  tip: [0, 0.0126, -1.421],
  muzzle: [0, 0.035, -1.029],
  butt: 0.255,
};

const config = JSON.parse(await fs.readFile(path.join(folder, 'Data_FirstLevelAmbushAnimation.json'), 'utf8'));
const characters = JSON.parse(await fs.readFile(
  path.join(project, 'Model', 'Character', 'Data_LugouCharacterManifest.json'), 'utf8'));

// ---------------------------------------------------------------------------
// 1. 清单
// ---------------------------------------------------------------------------
assert.equal(config.schema, 1);
assert.match(config.authoringTool, /Blender/);
assert.deepEqual(config.actorForward, [0, 0, -1]);
assert.equal(config.floorClearanceM, 0.003);
assert.deepEqual(Object.keys(config.clips).sort(), [
  'AmbushRise', 'BayonetStabDown', 'BayonetStabStanding',
  'BearerStabbed', 'PatientStabbed', 'PatientWoundedIdle']);
assert.equal(config.clips.PatientWoundedIdle.loop, true);
for (const [id, clip] of Object.entries(config.clips)) {
  if (id !== 'PatientWoundedIdle') assert.equal(clip.loop, false, id + ' must hold its last pose');
  assert.ok(clip.duration > 0.5 && clip.duration <= 4, id + ' duration');
}

// 只能出现在选模清单允许的外观上。
const allowed = new Set([
  ...CHARACTER_MODEL_VARIANTS_BY_KIND.ija.map(i => 'LugouIja' + String(i + 1).padStart(2, '0')),
  ...CHARACTER_MODEL_VARIANTS_BY_KIND.nra.map(i => 'LugouNra' + String(i + 1).padStart(2, '0')),
]);
assert.deepEqual(config.models.map(m => m.id).sort(), [...allowed].sort(),
  'library must cover exactly the approved appearances');

function GlbNodes(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
}

const assets = new Map();
for (const model of config.models) {
  const bytes = await fs.readFile(path.join(folder, model.file));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), model.sha256, model.id + ' asset hash');
  const original = await fs.readFile(path.join(project, 'Model', 'Character', 'Model_' + model.id + '.glb'));
  assert.equal(createHash('sha256').update(original).digest('hex'), model.originalModelSha256,
    model.id + ' was baked against a different GLB');
  const data = JSON.parse(bytes);
  assets.set(model.id, data);
  assert.equal(data.modelId, model.id);
  assert.equal(data.fps, FPS);
  assert.equal(data.stride, 7);
  assert.match(data.authoringTool, /Blender/);
  assert.deepEqual(model.clipIds.slice().sort(), Object.keys(data.clips).sort());

  // 骨骼名必须真是这个 GLB 的骨头。GLTFLoader 把 `Bip001 L Forearm` 变成
  // `Bip001_L_Forearm` 并删掉点号，所以两边都规范化之后比。
  const document = GlbNodes(original);
  const joints = new Set((document.skins || []).flatMap(skin => skin.joints)
    .map(index => Normalize(document.nodes[index].name || '')));
  assert.ok(data.bones.length >= 50, model.id + ' bone count ' + data.bones.length);
  const normalized = data.bones.map(Normalize);
  assert.equal(new Set(normalized).size, normalized.length, model.id + ' bone names collide once normalized');
  const nodeNames = new Set(document.nodes.map(node => Normalize(node.name || '')));
  for (const [index, name] of normalized.entries()) {
    assert.ok(nodeNames.has(name), model.id + ' bone not in the GLB: ' + data.bones[index]);
    assert.ok(!data.bones[index].includes('.'), model.id + ' dotted bone name survives to the runtime');
  }
  const missing = [...joints].filter(name => !normalized.includes(name));
  assert.deepEqual(missing, [], model.id + ' skin joints missing from the library');

  for (const id of model.clipIds) {
    const clip = data.clips[id];
    assert.equal(clip.duration, config.clips[id].duration, model.id + ' ' + id + ' duration');
    assert.equal(clip.loop, config.clips[id].loop, model.id + ' ' + id + ' loop');
    assert.equal(clip.frameCount, Math.round(clip.duration * FPS) + 1, model.id + ' ' + id + ' frameCount');
    assert.equal(clip.values.length, clip.frameCount * data.bones.length * 7,
      model.id + ' ' + id + ' value count');
    assert.ok(clip.values.every(Number.isFinite), model.id + ' ' + id + ' has a non-finite sample');
    // 源骨架是 Max Biped，物体缩放 0.01，所以骨骼局部位移是「百分之一米」那套单位
    // （小腿 0.3949 m 写成 39.49）。除盆骨外每根骨头的位移都必须原样保留：这些 clip
    // 只写旋转，一旦位移变了就是把人抻长了。盆骨是唯一承载位移的骨头。
    const sources = Object.fromEntries(document.nodes.filter(node => node.name)
      .map(node => [Normalize(node.name), node.translation || [0, 0, 0]]));
    const stride = data.bones.length * 7;
    let worstQuaternion = 0, worstStretch = 0, worstPelvis = 0;
    for (let frame = 0; frame < clip.frameCount; frame++) {
      for (let bone = 0; bone < data.bones.length; bone++) {
        const at = frame * stride + bone * 7;
        const [x, y, z, w] = clip.values.slice(at + 3, at + 7);
        worstQuaternion = Math.max(worstQuaternion, Math.abs(Math.hypot(x, y, z, w) - 1));
        const source = sources[normalized[bone]];
        const drift = Math.max(...[0, 1, 2].map(i => Math.abs(clip.values[at + i] - source[i])));
        if (/pelvis$/.test(normalized[bone])) worstPelvis = Math.max(worstPelvis, drift);
        else worstStretch = Math.max(worstStretch, drift);
      }
    }
    assert.ok(worstQuaternion < 1e-5, model.id + ' ' + id + ' unnormalised quaternion ' + worstQuaternion);
    assert.ok(worstStretch < .05, model.id + ' ' + id + ' stretches a bone by ' + worstStretch
      + ' source units — only the pelvis may carry translation');
    assert.ok(worstPelvis < 200, model.id + ' ' + id + ' pelvis travels ' + worstPelvis
      + ' source units (2 m); the clip must not walk the actor');
    if (clip.loop) {
      const stride = data.bones.length * 7, last = (clip.frameCount - 1) * stride;
      let seam = 0;
      for (let i = 0; i < stride; i++) seam = Math.max(seam, Math.abs(clip.values[i] - clip.values[last + i]));
      assert.ok(seam < 1e-4, model.id + ' ' + id + ' loop seam ' + seam);
    }
  }
}
console.log('MANIFEST ok', JSON.stringify({
  version: config.version,
  models: config.models.map(m => m.id),
  clips: Object.keys(config.clips).length,
  bones: assets.get(config.models[0].id).bones.length,
}));

// ---------------------------------------------------------------------------
// 2. 真浏览器：生产骨架 + 真 GLB
// ---------------------------------------------------------------------------
const IJA_TIMES = {
  AmbushRise: [0, .18, .35, .52, .7],
  BayonetStabStanding: [0, .22, .36, .5, .62, .94, 1.2],
  BayonetStabDown: [0, .26, .44, .62, .8, 1.08, 1.4],
};
const NRA_TIMES = {
  BearerStabbed: [0, .16, .42, .78, 1.12, 1.52, 1.86, 2.2],
  PatientStabbed: [0, .22, .6, 1.1, 1.65, 2.15, 2.6],
  PatientWoundedIdle: [0, .5, 1, 1.5, 2, 2.5, 3],
};
// Litter deck the two supine clips are authored against (see the doc): bed top 0.86 m.
const DECK_Y = 0.86;
// Script_Actor.KIND_SPEC: an IJA soldier is 1.62 m tall in game and an NRA soldier 1.66 m,
// so LugouCharacterRig scales the 1.76-1.82 m source rigs down by about 8 percent.  Every
// height below is the height the player sees, not the height authored in Blender.
const IJA_HEIGHT_M = 1.62;
// 只有仰卧那两条躺在担架床面上；抬担架的人和日军都站在地上。
const DeckFor = id => (id.startsWith('Patient') ? DECK_Y : 0);
const NRA_HEIGHT_M = 1.66;
// 一张放大的定格，专门用来看手指握点、枪线与躯干的前后关系——接触表太小，
// 「刀穿过大腿」这种错误在 416 px 宽的格子里看不出来。
const DETAIL_TIME = {
  AmbushRise: .70, BayonetStabStanding: .50, BayonetStabDown: .62,
  BearerStabbed: 1.60, PatientStabbed: .90, PatientWoundedIdle: 1.00,
};
const SHEET_TIMES = {
  AmbushRise: [0, .16, .3, .44, .58, .7],
  BayonetStabStanding: [0, .24, .38, .5, .66, 1.05],
  BayonetStabDown: [0, .26, .44, .62, .8, 1.15],
  BearerStabbed: [0, .2, .5, 1.1, 1.6, 2.2],
  PatientStabbed: [0, .22, .5, .9, 1.6, 2.6],
  PatientWoundedIdle: [0, .5, 1, 1.5, 2, 2.6],
};

await fs.mkdir(out, { recursive: true });
await fs.writeFile(path.join(out, '_check_AmbushAnimation.html'), `<!doctype html><meta charset="utf-8">
<style>body{margin:0;background:#15181b;color:#e8e6e0;font:14px system-ui;overflow:hidden}
#sheet{display:grid;grid-template-columns:repeat(3,416px);gap:5px;padding:6px}
.cell{position:relative}.cell img{width:416px;display:block;background:#23272b}
.cell p{position:absolute;left:6px;bottom:4px;margin:0;font:12px ui-monospace,monospace;color:#cfd8e0}
h1{margin:6px 10px 0;font:600 15px system-ui;letter-spacing:.04em}</style>
<h1 id="title"></h1><div id="sheet"></div>
<script type="importmap">{"imports":{"three":"../../../vendor/three/build/three.module.js"}}</script>
<script type="module">
import * as T from 'three';
import { GLTFLoader } from '../../../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { LugouCharacterRig } from '../../../Script_CharacterModel.mjs';
import { FirstLevelAmbushAnimation, FIRST_LEVEL_AMBUSH_CLIPS, FIRST_LEVEL_AMBUSH_VERSION }
  from '../../../Script_FirstLevelAmbushAnimation.mjs';
window.AmbushCheck = { T, loader: new GLTFLoader(), LugouCharacterRig, FirstLevelAmbushAnimation,
  FIRST_LEVEL_AMBUSH_CLIPS, FIRST_LEVEL_AMBUSH_VERSION };
</script>`);

const server = await ServeRoot(path.dirname(project), 0);
const browser = await LaunchBrowser();
const errors = [];
const results = [];
const shots = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', event => errors.push(String(event.message ?? event)));
  page.on('console', event => { if (event.type() === 'error') errors.push('console: ' + event.text()); });
  await page.goto('http://127.0.0.1:' + server.address().port
    + '/Taierzhuang1938/_shots/RoomAmbush/C/_check_AmbushAnimation.html');
  await page.waitForFunction(() => window.AmbushCheck);

  const exported = await page.evaluate(() => ({
    clips: JSON.parse(JSON.stringify(AmbushCheck.FIRST_LEVEL_AMBUSH_CLIPS)),
    version: AmbushCheck.FIRST_LEVEL_AMBUSH_VERSION,
  }));
  assert.equal(exported.version, config.version, 'module version stamp vs manifest');
  assert.deepEqual(exported.clips, JSON.parse(JSON.stringify(config.clips)),
    'FIRST_LEVEL_AMBUSH_CLIPS must mirror the manifest');

  for (const record of config.models) {
    const ija = record.id.startsWith('LugouIja');
    const result = await page.evaluate(async ({ record, config, assetRecord, times, rifle, deckY, ija, targetHeight }) => {
      const { T, loader, LugouCharacterRig, FirstLevelAmbushAnimation } = AmbushCheck;
      const [gltf, data] = await Promise.all([
        loader.loadAsync('../../../Model/Character/Model_' + record.id + '.glb'),
        fetch('../../../Animation/FirstLevelAmbush/' + record.file).then(r => r.json()),
      ]);
      const actor = { root: new T.Group(), body: new T.Group() };
      actor.body.position.y = .85;
      actor.root.add(actor.body);
      const variantIndex = Number(record.id.slice(-2)) - 1;
      const rig = new LugouCharacterRig({ record: assetRecord, gltf },
        { kind: ija ? 'ija' : 'nra', targetHeight, seed: 'RoomAmbush', variantIndex });
      rig.Attach(actor);
      actor.characterRig = rig;
      const scene = new T.Scene();
      scene.add(actor.root);
      const sampler = new FirstLevelAmbushAnimation(actor, data, config);
      const nodes = sampler.bones;
      const Snapshot = () => nodes.flatMap(n => [...n.position, ...n.quaternion, ...n.scale]);
      const Point = node => node.getWorldPosition(new T.Vector3());
      // 「脑袋掉了」这种错误在小图里看不清，也不会被包围盒抓到：头部顶点的重心
      // 必须一直跟着头骨走。收集主权重是头/脖子的顶点，每次采样比一次重心。
      const headProbes = [];
      rig.root.traverse(mesh => {
        if (!mesh.isSkinnedMesh) return;
        const indices = mesh.geometry.attributes.skinIndex;
        const weights = mesh.geometry.attributes.skinWeight;
        const picked = [];
        for (let i = 0; i < indices.count; i++) {
          let influence = 0;
          for (let k = 0; k < 4; k++) {
            const bone = mesh.skeleton.bones[indices.getComponent(i, k)];
            if (/Head$/.test(bone?.name || '')) influence += weights.getComponent(i, k);
          }
          if (influence > .8) picked.push(i);
        }
        if (picked.length) headProbes.push({ mesh, picked });
      });
      const HeadSkin = () => {
        const centre = new T.Vector3();
        const v = new T.Vector3();
        let count = 0;
        for (const probe of headProbes) {
          for (const index of probe.picked) {
            probe.mesh.getVertexPosition(index, v).applyMatrix4(probe.mesh.matrixWorld);
            centre.add(v); count++;
          }
        }
        return count ? { centre: centre.multiplyScalar(1 / count), count } : null;
      };
      const Bounds = () => {
        const min = new T.Vector3(Infinity, Infinity, Infinity);
        const max = new T.Vector3(-Infinity, -Infinity, -Infinity);
        const v = new T.Vector3();
        rig.root.traverse(mesh => {
          if (!mesh.isSkinnedMesh) return;
          for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
            mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld);
            min.min(v); max.max(v);
          }
        });
        return { min: min.toArray(), max: max.toArray() };
      };
      // 复刻 Actor._UpdateRiggedWeaponMount：枪挂在右手握点，枪身轴线指向左手握点，
      // 滚转跟着躯干的上方向。刺刀尖就是这套基里的一个定点。
      const srcAxis = new T.Vector3(...rifle.gripFront).normalize();
      const srcUp = new T.Vector3(0, 1, 0).addScaledVector(srcAxis, -srcAxis.y).normalize();
      const srcRight = new T.Vector3().crossVectors(srcUp, srcAxis).normalize();
      const sourceBasis = new T.Matrix4().makeBasis(srcRight, srcUp, srcAxis);
      const WeaponFrame = () => {
        const gripR = Point(rig.grips.weaponR), gripL = Point(rig.grips.weaponL);
        const axis = gripL.clone().sub(gripR).normalize();
        const up = Point(rig.bones.neck).sub(Point(rig.bones.pelvis));
        up.addScaledVector(axis, -up.dot(axis)).normalize();
        const right = new T.Vector3().crossVectors(up, axis).normalize();
        const target = new T.Matrix4().makeBasis(right, up, axis);
        const quaternion = new T.Quaternion().setFromRotationMatrix(
          target.clone().multiply(sourceBasis.clone().invert()));
        return { gripR, gripL, axis, up, quaternion, span: gripL.distanceTo(gripR) };
      };
      const TipOf = frame => new T.Vector3(...rifle.tip).applyQuaternion(frame.quaternion).add(frame.gripR);

      const clips = [];
      let maxRestoreError = 0, maxRootDrift = 0;
      const Deck = id => (id.startsWith('Patient') ? deckY : 0);
      const originalRoot = actor.root.matrixWorld.clone();
      for (const id of record.clipIds) {
        const clip = data.clips[id];
        const samples = [];
        let maxMotion = 0, firstPose = null;
        for (const time of times[id]) {
          sampler.Restore();
          rig.Update(0, { reach: 1 });
          actor.root.updateWorldMatrix(true, true);
          const baseline = Snapshot();
          sampler.Sample(id, time, { loop: false, deckY: Deck(id), transitionSeconds: 0 });
          const pose = Snapshot();
          firstPose ||= pose;
          for (let i = 0; i < pose.length; i++) maxMotion = Math.max(maxMotion, Math.abs(pose[i] - firstPose[i]));
          const bounds = Bounds();
          const pelvis = Point(rig.bones.pelvis), chest = Point(rig.bones.chest);
          const handL = Point(rig.bones.handL), handR = Point(rig.bones.handR);
          const toe = nodes.find(n => /L_?Toe0$/.test(n.name));
          const front = toe ? Point(toe).sub(Point(rig.bones.footL)).normalize().toArray() : null;
          const belly = pelvis.clone().lerp(chest, .45);
          const sample = {
            time, bounds, front,
            sole: sampler.FootFloor(),
            head: Point(rig.bones.head).y,
            pelvisY: pelvis.y,
            bellyReach: Math.max(handL.distanceTo(belly), handR.distanceTo(belly)),
            handL: handL.toArray(), handR: handR.toArray(),
          };
          const skin = HeadSkin();
          sample.headVertices = skin ? skin.count : 0;
          sample.headSkinOffset = skin ? skin.centre.distanceTo(Point(rig.bones.head)) : -1;
          if (ija) {
            const frame = WeaponFrame();
            sample.gripSpan = frame.span;
            sample.tip = TipOf(frame).toArray();
            sample.muzzle = new T.Vector3(...rifle.muzzle).applyQuaternion(frame.quaternion).add(frame.gripR).toArray();
            // 枪口必须在人前面（局部 -Z），不能反着指。
            sample.tipForward = -(sample.tip[2] - Point(rig.bones.chest).z);
            sample.gripR = frame.gripR.toArray();
            sample.gripL = frame.gripL.toArray();
            sample.axis = frame.axis.toArray();
            sample.up = frame.up.toArray();
            sample.modelScale = rig.modelScale;
          }
          samples.push(sample);
          const matrix = actor.root.matrixWorld.elements;
          for (let i = 0; i < 16; i++) maxRootDrift = Math.max(maxRootDrift, Math.abs(matrix[i] - originalRoot.elements[i]));
          sampler.Restore();
          const restored = Snapshot();
          for (let i = 0; i < baseline.length; i++) {
            maxRestoreError = Math.max(maxRestoreError, Math.abs(restored[i] - baseline[i]));
          }
        }
        // 循环 clip 的接缝在真骨架上再看一次。
        let loopSeam = 0;
        if (clip.loop) {
          sampler.Restore(); rig.Update(0, { reach: 1 });
          sampler.Sample(id, 0, { loop: false, deckY: Deck(id), transitionSeconds: 0 });
          const a = Snapshot();
          sampler.Restore(); rig.Update(0, { reach: 1 });
          sampler.Sample(id, clip.duration, { loop: false, deckY: Deck(id), transitionSeconds: 0 });
          const b = Snapshot();
          for (let i = 0; i < a.length; i++) loopSeam = Math.max(loopSeam, Math.abs(a[i] - b[i]));
          sampler.Restore();
        }
        clips.push({ id, duration: clip.duration, loop: clip.loop, maxMotion, loopSeam, samples });
      }
      sampler.Restore();
      window.AmbushStage = { T, actor, rig, sampler, data, scene, WeaponFrame, ija, deckY };
      return { modelId: record.id, maxRestoreError, maxRootDrift, clips };
    }, {
      record, config, assetRecord: characters.models.find(m => m.id === record.id),
      times: ija ? IJA_TIMES : NRA_TIMES, rifle: RIFLE, deckY: ija ? 0 : DECK_Y, ija,
      targetHeight: ija ? IJA_HEIGHT_M : NRA_HEIGHT_M,
    });
    results.push(result);
    console.log('MODEL', result.modelId, JSON.stringify({
      restore: result.maxRestoreError, rootDrift: result.maxRootDrift,
      clips: result.clips.map(c => ({
        id: c.id, motion: +c.maxMotion.toFixed(4), seam: +c.loopSeam.toFixed(6),
        sole: [Math.min(...c.samples.map(s => s.sole)), Math.max(...c.samples.map(s => s.sole))]
          .map(v => +v.toFixed(4)),
        floor: +Math.min(...c.samples.map(s => s.bounds.min[1])).toFixed(4),
      })),
    }));

    if (process.env.AMBUSH_DEBUG) {
      for (const clip of result.clips) for (const sample of clip.samples) {
        console.log('DBG', result.modelId, clip.id, sample.time,
          JSON.stringify({ scale: sample.modelScale, gripR: sample.gripR, gripL: sample.gripL,
            axis: sample.axis, up: sample.up, tip: sample.tip, sole: sample.sole }));
      }
    }
    assert.ok(result.maxRestoreError < 1e-12, result.modelId + ' Restore drift ' + result.maxRestoreError);
    assert.equal(result.maxRootDrift, 0, result.modelId + ' moved the actor root');
    for (const clip of result.clips) {
      const support = DeckFor(clip.id);
      assert.ok(clip.maxMotion > .02, result.modelId + ' ' + clip.id + ' barely moves');
      if (clip.loop) assert.ok(clip.loopSeam < 1e-6, result.modelId + ' ' + clip.id + ' loop seam ' + clip.loopSeam);
      const supine = clip.id.startsWith('Patient');
      for (const sample of clip.samples) {
        const where = result.modelId + ' ' + clip.id + ' t=' + sample.time;
        assert.ok(Math.abs(sample.sole - (support + config.floorClearanceM)) < 1e-4,
          where + ' sole solved to ' + sample.sole + ' instead of ' + (support + config.floorClearanceM));
        assert.ok(sample.bounds.min[1] > support - .045, where + ' skin sinks to ' + sample.bounds.min[1]);
        assert.ok(sample.headVertices > 200, where + ' found no head-weighted vertices to check');
        assert.ok(sample.headSkinOffset < .16, where + ' head skin sits ' + sample.headSkinOffset
          + ' m from the head bone — the head has come off');
        assert.ok(sample.bounds.max[1] < support + (supine ? .75 : 1.95), where + ' skin top ' + sample.bounds.max[1]);
        const size = [0, 2].map(i => sample.bounds.max[i] - sample.bounds.min[i]);
        assert.ok(Math.max(...size) < 2.3, where + ' footprint ' + JSON.stringify(size)
          + ' — original bone-frame conversion is off');
        // 脚尖朝向只在脚还踩在地上的那段成立：跪下去之后脚背贴地、脚尖朝后，
        // 躺在担架上的人脚尖朝天，拿它当朝向判据会把正确的姿势判红。
        const planted = ija || sample.time <= 1.2;
        if (!supine && planted && sample.front) {
          assert.ok(sample.front[2] < -.45, where + ' faces ' + JSON.stringify(sample.front) + ' not -Z');
        }
      }
    }
    if (ija) {
      // 上刀的三八式：两手必须落在真实握距上，枪口朝前，不是反着背在身后。
      for (const clip of result.clips) {
        for (const sample of clip.samples) {
          const where = result.modelId + ' ' + clip.id + ' t=' + sample.time;
          // 在游戏尺度上量：人物被缩到 1.62 m，枪没有跟着缩，所以两手的实际间距
          // 必须是步枪护木挂点的真实距离 0.4432 m，不是烘焙时的那个数。
          assert.ok(Math.abs(sample.gripSpan - .4432) < .022,
            where + ' grip span ' + sample.gripSpan + ' m does not fit the fore-end (0.4432 m)');
          assert.ok(sample.tipForward > .55, where + ' bayonet points backwards (' + sample.tipForward + ')');
        }
      }
      const standing = result.clips.find(c => c.id === 'BayonetStabStanding');
      const apex = standing.samples.filter(s => s.time >= .45 && s.time <= .7);
      assert.ok(apex.length >= 2);
      for (const sample of apex) {
        assert.ok(sample.tip[1] > .95 && sample.tip[1] < 1.05,
          result.modelId + ' standing thrust apex tip at ' + sample.tip[1] + ' m, want 0.95-1.05');
        assert.ok(-sample.tip[2] > 1.35, result.modelId + ' standing thrust only reaches ' + (-sample.tip[2]) + ' m');
      }
      const down = result.clips.find(c => c.id === 'BayonetStabDown');
      const downApex = down.samples.filter(s => s.time >= .55 && s.time <= .85);
      for (const sample of downApex) {
        assert.ok(sample.tip[1] > .90 && sample.tip[1] < 1.02,
          result.modelId + ' litter thrust apex tip at ' + sample.tip[1] + ' m, want 0.90-1.02');
      }
      // 起身收在白刃预备附近：末帧站直、枪尖抬到胸口以上。
      const rise = result.clips.find(c => c.id === 'AmbushRise');
      const start = rise.samples[0], end = rise.samples.at(-1);
      assert.ok(end.head - start.head > .35, result.modelId + ' AmbushRise does not actually stand up');
      assert.ok(end.tip[1] > 1.08, result.modelId + ' AmbushRise ends with the blade too low');
    } else {
      // 被捅的人：手要抓到肚子上。
      for (const clip of result.clips) {
        const window = clip.id === 'BearerStabbed' ? s => s.time >= .6
          : clip.id === 'PatientStabbed' ? s => s.time >= .8 : () => true;
        const held = clip.samples.filter(window);
        assert.ok(held.length >= 3, result.modelId + ' ' + clip.id + ' has no belly-hold window');
        for (const sample of held) {
          assert.ok(sample.bellyReach < .40, result.modelId + ' ' + clip.id + ' t=' + sample.time
            + ' hands are ' + sample.bellyReach.toFixed(3) + ' m from the belly');
        }
      }
      // 担架伤员：背贴在床面上，不悬空也不陷进去。
      for (const clip of result.clips.filter(c => c.id.startsWith('Patient'))) {
        for (const sample of clip.samples) {
          assert.ok(sample.bounds.min[1] > DECK_Y - .045 && sample.bounds.min[1] < DECK_Y + .035,
            result.modelId + ' ' + clip.id + ' t=' + sample.time + ' back sits at '
            + sample.bounds.min[1] + ', deck is ' + DECK_Y);
          assert.ok(sample.pelvisY > DECK_Y + .05 && sample.pelvisY < DECK_Y + .30,
            result.modelId + ' ' + clip.id + ' t=' + sample.time + ' pelvis ' + sample.pelvisY);
        }
      }
      const stabbed = result.clips.find(c => c.id === 'BearerStabbed');
      assert.ok(stabbed.samples[0].head - stabbed.samples.at(-1).head > .9,
        result.modelId + ' BearerStabbed never goes down');
      // 起手是抬担架的握姿：两手都在身前（局部 -Z），这也是朝向的第二个判据。
      const carry = stabbed.samples[0];
      for (const hand of [carry.handL, carry.handR]) {
        assert.ok(hand[2] < -.12, result.modelId + ' BearerStabbed does not start on the poles: '
          + JSON.stringify(hand));
      }
      assert.ok(carry.handL[0] - carry.handR[0] < -.3,
        result.modelId + ' BearerStabbed carry grip is not shoulder wide / is mirrored');
    }

    // 接触表：每条 clip 一张 1280x720，用真骨架实拍。
    for (const id of record.clipIds) {
      await page.evaluate(async ({ id, times, label }) => {
        const { T, actor, rig, sampler, scene, WeaponFrame, ija, deckY } = window.AmbushStage;
        const sheet = document.querySelector('#sheet');
        document.querySelector('#title').textContent = label;
        sheet.textContent = '';
        if (!window.AmbushRenderer) {
          const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
          renderer.setSize(416, 316);
          renderer.outputColorSpace = T.SRGBColorSpace;
          window.AmbushRenderer = renderer;
          scene.background = new T.Color(0x23272b);
          scene.add(new T.HemisphereLight(0xe6edff, 0x554737, 2.1));
          const key = new T.DirectionalLight(0xffe9cf, 3.1);
          key.position.set(-3, 5, -4);
          scene.add(key);
          const floor = new T.Mesh(new T.BoxGeometry(4, .04, 4),
            new T.MeshStandardMaterial({ color: 0x3d4347, roughness: 1 }));
          floor.position.y = -.02;
          scene.add(floor);
          rig.root.traverse(n => {
            if (!n.isMesh) return;
            for (const m of Array.isArray(n.material) ? n.material : [n.material]) { m.metalness = 0; m.roughness = .8; }
            if (!n.isSkinnedMesh) n.visible = false;
          });
          if (!ija) {
            const bed = new T.Mesh(new T.BoxGeometry(.58, .06, 1.95),
              new T.MeshStandardMaterial({ color: 0x6d5a3f, roughness: 1 }));
            bed.position.set(0, deckY - .03, 0);
            bed.visible = false;
            bed.name = 'AmbushLitter';
            scene.add(bed);
          }
          const rifle = new T.Group();
          rifle.name = 'AmbushRifleProxy';
          const wood = new T.Mesh(new T.BoxGeometry(.042, .062, 1.284),
            new T.MeshStandardMaterial({ color: 0x5a4028, roughness: .85 }));
          wood.position.z = .255 - 1.284 / 2;
          const blade = new T.Mesh(new T.BoxGeometry(.016, .026, .514),
            new T.MeshStandardMaterial({ color: 0xc9ced3, roughness: .35, metalness: .2 }));
          blade.position.z = -1.421 + .514 / 2;
          blade.position.y = .0126;
          rifle.add(wood, blade);
          rifle.visible = false;
          scene.add(rifle);
          window.AmbushProps = { rifle, bed: scene.getObjectByName('AmbushLitter') };
        }
        const renderer = window.AmbushRenderer;
        const { rifle, bed } = window.AmbushProps;
        const supine = id.startsWith('Patient');
        rifle.visible = ija;
        if (bed) bed.visible = supine;
        // 三分之一侧前方，看得见枪线与两只手的握点；仰卧那两条从担架斜上方看。
        const camera = new T.PerspectiveCamera(30, 416 / 316, .05, 40);
        for (const time of times) {
          sampler.Restore();
          rig.Update(0, { reach: 1 });
          sampler.Sample(id, time, { loop: false, deckY: supine ? deckY : 0, transitionSeconds: 0 });
          if (ija) {
            const frame = WeaponFrame();
            rifle.position.copy(frame.gripR);
            rifle.quaternion.copy(frame.quaternion);
          }
          const focus = supine ? new T.Vector3(0, deckY + .12, 0) : new T.Vector3(0, .95, -.55);
          if (supine) camera.position.set(2.30, deckY + 1.60, -1.80);
          else camera.position.set(3.55, 1.45, -2.85);
          camera.lookAt(focus);
          renderer.render(scene, camera);
          const cell = document.createElement('div');
          cell.className = 'cell';
          const image = document.createElement('img');
          image.src = renderer.domElement.toDataURL('image/png');
          const caption = document.createElement('p');
          caption.textContent = time.toFixed(2) + ' s';
          cell.append(image, caption);
          sheet.append(cell);
        }
        sampler.Restore();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }, { id, times: SHEET_TIMES[id], label: record.id + ' — ' + id });
      const file = path.join(out, 'Texture_Ambush_' + record.id + '_' + id + '.png');
      await page.screenshot({ path: file });
      shots.push(file);
      if (record.id === 'LugouIja01' || record.id === 'LugouNra02') {
        await page.evaluate(async ({ id, time, label }) => {
          const { T, rig, sampler, scene, WeaponFrame, ija, deckY } = window.AmbushStage;
          const sheet = document.querySelector('#sheet');
          document.querySelector('#title').textContent = label;
          sheet.textContent = '';
          sheet.style.gridTemplateColumns = '1264px';
          const renderer = window.AmbushRenderer;
          renderer.setSize(1264, 690);
          const camera = new T.PerspectiveCamera(26, 1264 / 690, .05, 40);
          const supine = id.startsWith('Patient');
          sampler.Restore();
          rig.Update(0, { reach: 1 });
          const supineDetail = id.startsWith('Patient');
          if (window.AmbushProps.bed) window.AmbushProps.bed.visible = supineDetail;
          window.AmbushProps.rifle.visible = ija;
          sampler.Sample(id, time, { loop: false, deckY: supineDetail ? deckY : 0, transitionSeconds: 0 });
          if (ija) {
            const frame = WeaponFrame();
            window.AmbushProps.rifle.position.copy(frame.gripR);
            window.AmbushProps.rifle.quaternion.copy(frame.quaternion);
          }
          const focus = supine ? new T.Vector3(0, deckY + .12, 0) : new T.Vector3(0, .92, -.55);
          // 仰卧那两条用贴近床面的低机位：头、脖子和手放在肚子上的位置，
          // 从上往下看是看不出接缝的。
          if (supine) camera.position.set(2.70, deckY + .70, -.05);
          else camera.position.set(2.95, 1.38, -2.25);
          camera.lookAt(focus);
          renderer.render(scene, camera);
          const cell = document.createElement('div');
          cell.className = 'cell';
          const image = document.createElement('img');
          image.src = renderer.domElement.toDataURL('image/png');
          image.style.width = '1264px';
          const caption = document.createElement('p');
          caption.textContent = time.toFixed(2) + ' s';
          cell.append(image, caption);
          sheet.append(cell);
          renderer.setSize(416, 316);
          sheet.style.gridTemplateColumns = 'repeat(3,416px)';
          sampler.Restore();
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }, { id, time: DETAIL_TIME[id], label: record.id + ' — ' + id + ' (detail)' });
        const detail = path.join(out, 'Texture_AmbushDetail_' + record.id + '_' + id + '.png');
        await page.screenshot({ path: detail });
        shots.push(detail);
      }
    }
    await page.evaluate(() => { delete window.AmbushStage; delete window.AmbushRenderer; delete window.AmbushProps; });
  }

  assert.deepEqual(errors, [], 'browser errors');
  await fs.writeFile(path.join(out, 'Data_AmbushAnimationValidation.json'),
    JSON.stringify({ version: config.version, results, shots, errors }, null, 2));
  console.log(JSON.stringify({
    ok: true, version: config.version,
    models: results.map(r => ({ id: r.modelId, clips: r.clips.length })),
    shots: shots.map(file => path.relative(project, file)),
  }));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
