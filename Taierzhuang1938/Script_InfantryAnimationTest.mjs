// Actual game factory, both factions/all eight skins, contact and playback integration.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { LaunchBrowser } from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import { ServeRoot } from './Script_DevServer.mjs';
import { LoadGlb, PoseScene, BuildSkin, MinSkinnedY, Multiply } from './_import/Script_LugouGlbPose.mjs';
const project = path.dirname(fileURLToPath(import.meta.url));
const folder = path.join(project, 'Model/Character');
const catalog = JSON.parse(fs.readFileSync(path.join(folder, 'Data_InfantryAnimations.json')));
function Points(scene, skin) {
  const points = [];
  for (const part of skin) {
    const matrices = part.joints.map((joint, j) => {
      const matrix = new Float64Array(16);
      Multiply(matrix, scene.world[joint], part.inverseBind.slice(j * 16, j * 16 + 16)); return matrix;
    });
    for (let v = 0; v < part.count; v++) {
      const p = [0, 0, 0], raw = part.position.slice(v * 3, v * 3 + 3), weights = { L: 0, R: 0 };
      for (let k = 0; k < 4; k++) {
        const j = part.jointIndex[v * 4 + k], weight = part.weight[v * 4 + k], m = matrices[j];
        for (let c = 0; c < 3; c++) p[c] += weight * (m[c] * raw[0] + m[c + 4] * raw[1] + m[c + 8] * raw[2] + m[c + 12]);
        for (const side of ['L', 'R']) if (new RegExp(` ${side} (Foot|Toe0)$`).test(scene.nodes[part.joints[j]].name)) weights[side] += weight;
      }
      points.push({ p, weights });
    }
  }
  return points;
}
let maximumPlantedDrift = 0;
// Use the original mesh/skin with the library's animation samplers, independently of its bake audit.
for (const record of catalog.models) {
  const original = LoadGlb(path.join(folder, `Model_${record.id}.glb`));
  const library = LoadGlb(path.join(folder, record.file));
  assert.equal(library.json.meshes, undefined, 'animation library must not duplicate characters');
  const scene = new PoseScene(library), skin = BuildSkin(original);
  for (let a = 0; a < scene.animations.length; a++) {
    const clip = scene.animations[a];
    assert.ok(clip.duration > .8);
    for (let i = 0; i <= 32; i++) {
      scene.Apply(a, clip.duration * i / 32);
      const floor = MinSkinnedY(scene, skin);
      assert.ok(floor >= -.002 && floor < .008, `${record.id}/${clip.name} sole=${floor}`);
    }
  }
  const gait = scene.AnimationIndex('RifleCrouchAdvance'), speed = record.clips.find(c => c.id === 'RifleCrouchAdvance').referenceSpeedMps;
  for (const [side, start] of [['L', 46], ['R', 151]]) {
    scene.Apply(gait, ((start + 10) % 210) / 60);
    const points = Points(scene, skin);
    const sole = Math.min(...points.filter(p => p.weights[side] > .55).map(p => p.p[1]));
    const front = Math.max(...points.filter(p => p.weights[side] > .55 && p.p[1] < sole + .018).map(p => p.p[2]));
    const markers = points.map((p, i) => p.weights[side] > .55 && p.p[1] < sole + .018 && p.p[2] > front - .035 ? i : -1).filter(i => i >= 0);
    assert.ok(markers.length, `${record.id}/${side}: no actual sole markers`);
    let anchor;
    for (let step = 10; step <= 120; step += 5) {
      const at = start + step; scene.Apply(gait, (at % 210) / 60);
      const frame = Points(scene, skin), point = [0, 0, speed * at / 60];
      for (const i of markers) for (let c = 0; c < 3; c++) point[c] += frame[i].p[c] / markers.length;
      if (!anchor) anchor = point;
      const drift = Math.hypot(point[0] - anchor[0], point[2] - anchor[2]);
      maximumPlantedDrift = Math.max(maximumPlantedDrift, drift);
      assert.ok(drift < .006, `${record.id}/${side}: planted sole slides ${drift} m`);
    }
  }
}
const server = await ServeRoot(path.resolve(project, '..'), 0);
const browser = await LaunchBrowser();
const output = process.env.INFANTRY_TEST_OUTPUT || path.join(project, '_shots/InfantryIntegration');
fs.mkdirSync(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', error => errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?poseTest=1`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang?.actorFactory, null, { timeout: 300000 });
  const result = await page.evaluate(async () => {
    const THREE = await import('/Taierzhuang1938/vendor/three/build/three.module.js');
    const { INFANTRY_ANIMATION_IDS } = await import('/Taierzhuang1938/Script_InfantryAnimation.mjs');
    const check = (v, message) => { if (!v) throw new Error(message); };
    const factory = window.Taierzhuang.actorFactory;
    const actors = [], stats = [];
    for (const kind of ['nra', 'ija']) for (let modelVariant = 0; modelVariant < 4; modelVariant++) {
      const actor = factory.Create(kind, { seed: 41938, modelVariant }); const rig = actor.characterRig;
      check(rig?.asset.infantry, `${kind}/${modelVariant}: missing library`);
      for (const id of INFANTRY_ANIMATION_IDS) {
        check(rig.clipById.has(id), `${rig.modelId}: missing ${id}`);
        actor.PlayImportedAnimation(id); actor.Update(.2, {});
        const firstTime = rig.currentAction.time;
        actor.PlayImportedAnimation(id); actor.Update(.1, {});
        check(rig.currentAction.time > firstTime, 'editor reasserting a clip restarts one-shot playback');
        for (let i = 1; i <= 12; i++) {
          rig.currentAction.time = rig.currentAction.getClip().duration * i / 13;
          actor.Update(0, {}); actor.root.updateWorldMatrix(true, true);
          const p = actor.weaponGroup.getWorldPosition(new THREE.Vector3());
          const helper = rig.infantryProps.rifle.getWorldPosition(new THREE.Vector3());
          check(p.distanceTo(helper) < .0001, `${rig.modelId}/${id}: weapon origin mismatch`);
          const scale = actor.weaponGroup.getWorldScale(new THREE.Vector3());
          check(Math.abs(scale.x - 1) < .0001, 'weapon physical size changed');
          check(p.distanceTo(actor.root.position) < 2, `${id}: flying weapon`);
        }
        if (id === 'GrenadeThrow') {
          rig.currentAction.time = 2.1; actor.Update(0, {});
          check(actor.grenadeGroup.visible, 'grenade missing before release');
          rig.currentAction.time = 2.2; actor.Update(0, {});
          check(!actor.grenadeGroup.visible, 'grenade returned after release');
        }
      }
      actor.ClearImportedAnimation(); rig.Play('AdvanceFire', 0);
      actor.Update(1 / 60, { crouch: 1 });
      check(rig.currentId === 'StandToKneel', 'no descent transition');
      for (let i = 0; i < 130; i++) actor.Update(1 / 60, { crouch: 1 });
      check(rig.currentId === 'KneelHold', 'descent did not settle');
      actor.Update(1 / 60, {}); check(rig.currentId === 'KneelToStand', 'no ascent transition');
      for (let i = 0; i < 120; i++) actor.Update(1 / 60, {});
      check(rig.currentId === 'AdvanceFire', 'ascent did not return to idle');
      actor.Update(.2, { crouch: 1, moveSpeed: .26, moveSpeedMps: .7 });
      check(rig.currentId === 'RifleCrouchAdvance', 'moving crouch still kneels in place');
      const referenceSpeed = kind === 'nra' ? .2554529916490837 : .23864468053263868;
      const scale = rig.root.getWorldScale(new THREE.Vector3()).y;
      check(Math.abs(rig.currentAction.getEffectiveTimeScale() * referenceSpeed * scale - .7) < 1e-5, 'gait does not match travel');
      actor.Update(.1, { crouch: 1, moveSpeed: .26, moveSpeedMps: 0 });
      check(rig.currentAction.getEffectiveTimeScale() === 0, 'blocked actor still slides feet');
      actor.Update(.2, { prone: 1, throwing: 1 });
      check(rig.currentId === 'StandFireCrouch', 'throw overrides prone');
      actor.Update(.2, {});
      let released = 0, releaseTime = null;
      check(actor.BeginGrenadeThrow(() => { released++; releaseTime = rig.currentAction.time; }), 'cannot queue volley throw');
      for (let i = 0; i < 350; i++) actor.Update(1 / 60, { throwing: i < 20 ? 1 : 0 });
      check(released === 1 && releaseTime >= 2.15 && releaseTime < 2.18, `release count/time ${released}/${releaseTime}`);
      check(!actor.grenadeGroup.visible && !actor.pendingGrenadeThrow, 'throw latch did not clear');
      // Continuous state transitions, including return to the legacy breathing pose.
      rig.Play('AdvanceFire', 0);
      let transitionFloor = Infinity;
      for (let frame = 0; frame < 450; frame++) {
        const t = frame / 30;
        actor.Update(1 / 30, t < 3 ? { crouch: 1, moveSpeed: .2, moveSpeedMps: .4 }
          : t >= 4 && t < 7.3 ? { crouch: 1 } : { throwing: t >= 9.7 && t < 9.8 ? 1 : 0 });
        if (frame % 5 !== 0) continue;
        actor.root.updateWorldMatrix(true, false); actor.root.updateMatrixWorld(true);
        const point = new THREE.Vector3();
        rig.root.traverse(mesh => {
          if (!mesh.isSkinnedMesh) return;
          mesh.skeleton.update();
          for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
            mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
            transitionFloor = Math.min(transitionFloor, point.y);
            check(point.y >= -.002, `${rig.modelId} transition frame ${frame} ${rig.currentId}: surface ${point.y}`);
          }
        });
      }
      stats.push({ model: rig.modelId, releaseTime, transitionFloor, clips: INFANTRY_ANIMATION_IDS.length }); actors.push(actor);
    }
    // The chapter's real VolleyThrow host must wait for the animation before creating a projectile.
    const { ai, combat, setpieces, player } = window.Taierzhuang;
    const soldier = ai.Spawn('nra', 400, 400, { weapon: 'ZhongZheng', modelVariant: 0 });
    const target = { x: soldier.position.x + .1, z: soldier.position.z, radius: .2, max: 1 };
    const before = combat.projectiles.length;
    check(setpieces.host.VolleyThrow(target) === 1, 'chapter volley did not queue a throw');
    check(combat.projectiles.length === before, 'chapter volley bypassed the windup');
    check(setpieces.host.VolleyThrow(target) === 0, 'duplicate volley queued the same soldier twice');
    const start = soldier.position.clone();
    let firstRelease = null;
    for (let frame = 0; frame < 260; frame++) {
      ai.Act(soldier, 1 / 60, player);
      check(Math.hypot(soldier.position.x - start.x, soldier.position.z - start.z) < .002, 'throwing AI kept moving');
      if (combat.projectiles.length > before && firstRelease === null) firstRelease = frame / 60;
    }
    check(firstRelease >= 2.13 && firstRelease < 2.2, `chapter volley released at ${firstRelease}`);
    check(combat.projectiles.length === before + 1, 'chapter volley did not create exactly one projectile');
    check(!soldier.actor.pendingGrenadeThrow && !soldier.actor.characterRig.infantry.IsThrowing(), 'AI throw did not finish');
    // Render actual game actors/weapons under neutral light for visual review.
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x272e35);
    scene.add(new THREE.HemisphereLight(0xd9e9ff, 0x6e6659, 2.3));
    const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(-3, 7, -4); scene.add(light);
    light.castShadow = true; light.shadow.mapSize.set(2048, 2048);
    Object.assign(light.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 }); light.shadow.bias = -.0001;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), new THREE.MeshStandardMaterial({ color: 0x53585a, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -.008; floor.receiveShadow = true; scene.add(floor);
    scene.add(new THREE.GridHelper(20, 40, 0x868e93, 0x626c74));
    actors.forEach((actor, i) => {
      actor.root.position.set((i % 4 - 1.5) * 1.55, 0, i < 4 ? -1.4 : 1.1);
      actor.PlayImportedAnimation(['RifleCrouchAdvance','StandToKneel','KneelHold','GrenadeThrow'][i % 4]);
      actor.Update(.2, {}); actor.characterRig.currentAction.time = i % 4 === 3 ? 1.9 : .85;
      actor.Update(0, {}); scene.add(actor.root);
    });
    const camera = new THREE.PerspectiveCamera(34, 1440 / 900, .01, 60);
    camera.position.set(-4.1, 3.4, -8.8); camera.lookAt(0, .75, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(1440, 900); renderer.setPixelRatio(1); renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.style.cssText = 'position:fixed;inset:0;z-index:999999'; document.body.append(renderer.domElement);
    renderer.render(scene, camera);
    window.InfantryTestScene = { scene, camera, renderer, actors };
    return stats;
  });
  await page.screenshot({ path: path.join(output, 'Preview_InfantryInGame.png') });
  await page.evaluate(() => {
    const { actors, renderer, scene, camera } = window.InfantryTestScene;
    actors.forEach(actor => { actor.PlayImportedAnimation('RifleIdle'); actor.Update(.3, {}); });
    renderer.render(scene, camera);
  });
  await page.screenshot({ path: path.join(output, 'Preview_InfantryLegacyComparison.png') });
  if (process.env.INFANTRY_PREVIEW === '1') {
    const frames = path.join(output, '_PreviewFrames'); fs.mkdirSync(frames, { recursive: true });
    await page.evaluate(() => {
      const { actors, renderer, scene, camera } = window.InfantryTestScene;
      actors.forEach((actor, i) => {
        if (i !== 0 && i !== 4) scene.remove(actor.root);
        actor.ClearImportedAnimation(); actor.characterRig.Play('AdvanceFire', 0);
        actor.root.position.set(i === 0 ? -1 : 1, 0, 0);
      });
      renderer.setSize(960, 640); camera.aspect = 1.5;
      camera.position.set(-3.4, 2.1, -5.8); camera.lookAt(0, .7, -.4); camera.updateProjectionMatrix();
      window.InfantryPreviewFloor = Infinity;
    });
    for (let frame = 0; frame < 450; frame++) {
      const png = await page.evaluate(frame => {
        const { actors, renderer, scene, camera } = window.InfantryTestScene;
        const time = frame / 30;
        const state = time < 3 ? { crouch: 1, moveSpeed: .2, moveSpeedMps: .4 }
          : time >= 4 && time < 7.3 ? { crouch: 1 } : { throwing: time >= 9.7 && time < 9.8 ? 1 : 0 };
        for (const actor of [actors[0], actors[4]]) {
          if (time < 3) actor.root.position.z -= .4 / 30;
          actor.Update(1 / 30, state);
          if (frame % 5 === 0) {
            actor.root.updateWorldMatrix(true, true);
            actor.root.updateMatrixWorld(true);
            actor.characterRig.root.traverse(mesh => {
              if (!mesh.isSkinnedMesh) return;
              mesh.skeleton.update(); const point = actor.root.position.clone();
              for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
                mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
                if (point.y < window.InfantryPreviewFloor) {
                  window.InfantryPreviewFloor = point.y;
                  window.InfantryPreviewFloorContext = { frame, model: actor.characterRig.modelId,
                    clip: actor.characterRig.currentId, weight: actor.characterRig.currentAction.getEffectiveWeight(),
                    time: actor.characterRig.currentAction.time, offset: actor.characterRig.infantryFloorOffset,
                    rootPosition: actor.characterRig.root.position.toArray(), modelScale: actor.characterRig.modelScale };
                }
              }
            });
          }
        }
        renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png').split(',')[1];
      }, frame);
      fs.writeFileSync(path.join(frames, `Frame_${String(frame).padStart(4, '0')}.png`), Buffer.from(png, 'base64'));
    }
    const floor = await page.evaluate(() => ({ minimumSurfaceHeightMeters: window.InfantryPreviewFloor,
      context: window.InfantryPreviewFloorContext }));
    fs.writeFileSync(path.join(output, 'Data_TransitionFloor.json'), JSON.stringify(floor));
    assert.ok(floor.minimumSurfaceHeightMeters >= -.002, `continuous preview penetrates floor: ${JSON.stringify(floor)}`);
    const encoded = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', '30', '-i',
      path.join(frames, 'Frame_%04d.png'), '-c:v', 'libx264', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      path.join(output, 'Preview_InfantryGameplaySequence.mp4')], { stdio: 'pipe', windowsHide: true });
    assert.equal(encoded.status, 0, String(encoded.stderr));
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, 'Data_IntegrationValidation.json'), JSON.stringify(result, null, 2));
  console.log('PASS InfantryAnimationTest: 8 game models, 40 clips, transitions, props, velocity and one-shot release; max sole drift', maximumPlantedDrift, output);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
