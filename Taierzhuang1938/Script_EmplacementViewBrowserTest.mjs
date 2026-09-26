// 接管机枪的第一人称（docs/Data_FirstPersonEmbodiment.md「架设机枪」）：真浏览器、第一关 04 的那挺枪。
//
// 守的是「手看得见、而且握在枪上」这件事本身，不只是几个开关：
//   · 视图模型换成这挺枪的 `<id>@mounted`，世界模型让位；双臂 IK 残差在 FPS_ARM_LIMITS 内；
//   · 十个指腹离枪面 ≤ 4 mm（与 FpsHandContactTest 同一把尺）；
//   · 把双臂涂成品红直接渲一帧数像素 —— visible=true 不等于画面里有（见 AGENTS 验收口径）；
//   · 视图模型那挺枪与世界模型同位（枪钉在工事上，动的是眼睛），开镜照门落在屏幕正中；
//   · 连发与换弹板时枪不离座（换匣只动右手）、准星上跳不经 cameraKick 记账；小卡拉枪机时右手去拉机柄；
//   · 按 F 离位：步枪、双臂姿势、FOV 补偿与眼位全部还原。
// 用法：node Taierzhuang1938/Script_EmplacementViewBrowserTest.mjs    截图在 _shots/EmplacementView/
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { FRONT_SORTIE } from "./Data_FirstLevelFrontRoute.mjs";
import { FPS_ARM_LIMITS } from "./Data_FpsArmPoses.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "_shots", "EmplacementView");
await fs.mkdir(out, { recursive: true });
const server = await ServeRoot(path.resolve(here, ".."), 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const receipts = {};
const PAD_LIMIT_M = 0.004;

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&missionStage=4&quality=medium&scale=small`,
    { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 300000 });
  // 站到座位后方一步、端着步枪，再像玩家那样接管（Debug.Emplacement.Occupy 走的就是 F 那条 Occupy）。
  receipts.before = await page.evaluate(({ seat }) => {
    const g = window.Tengxian;
    g.StepFrames(120);
    g.player.Spawn(seat.x - 0.4, seat.z + 1.1, 0);
    g.StepFrames(30, 1 / 60, true);
    return { weapon: g.viewmodel.weaponId, pose: g.viewmodel.armPoseKey, compensation: g.viewmodel.compensation.toArray() };
  }, { seat: FRONT_SORTIE.seat });
  await page.evaluate(() => { const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime(); g.Debug.Emplacement.Occupy(r.gunId); });
  receipts.glide = [];
  for (let f = 0; f < 30; f++) {
    receipts.glide.push(await page.evaluate(() => {
      const g = window.Tengxian; g.StepFrames(1, 1 / 60, true);
      return g.camera.position.toArray();
    }));
  }
  await page.screenshot({ path: path.join(out, "Scene_MountedHip.png") });

  // ---- A 手在枪上 ----------------------------------------------------------
  receipts.mounted = await page.evaluate(async ({ padLimit }) => {
    const THREE = await import("./vendor/three/build/three.module.js");
    const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime(), vm = g.viewmodel, arms = vm.riggedArms;
    const gun = g.emplacement.Emplacement(r.gunId), world = g.scene.getObjectByName(`Emplacement_${r.gunId}`);
    vm.root.updateMatrixWorld(true);
    arms.root.traverse((m) => { if (m.isSkinnedMesh) m.skeleton.update(); });
    const G = vm.rig.group, inv = G.matrixWorld.clone().invert();
    const tris = [];
    G.traverse((o) => {
      if (!o.isMesh || o.isSkinnedMesh) return;
      for (let q = o; q && q !== G.parent; q = q.parent) if (!q.visible) return;
      const p = o.geometry.attributes.position, index = o.geometry.index, m = inv.clone().multiply(o.matrixWorld);
      for (let i = 0; i < (index?.count || p.count); i += 3) tris.push(new THREE.Triangle(...[0, 1, 2].map((j) =>
        new THREE.Vector3().fromBufferAttribute(p, index ? index.getX(i + j) : i + j).applyMatrix4(m))));
    });
    const pads = [];
    for (const side of ["r", "l"]) for (let digit = 0; digit < 5; digit++) {
      const bone = arms.anatomy[side].curls.find((c) => c.bone.name.toLowerCase().endsWith(`finger${digit}2`)).bone, pts = [];
      arms.root.traverse((mesh) => {
        if (!mesh.isSkinnedMesh) return;
        const geo = mesh.geometry, index = mesh.skeleton.bones.indexOf(bone);
        for (let i = 0; i < geo.attributes.position.count; i++) {
          let w = 0; for (let j = 0; j < 4; j++) if (geo.attributes.skinIndex.getComponent(i, j) === index) w += geo.attributes.skinWeight.getComponent(i, j);
          if (w > .95) pts.push(bone.worldToLocal(mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld)));
        }
      });
      const box = new THREE.Box3().setFromPoints(pts);
      const pad = bone.localToWorld(new THREE.Vector3(box.max.x * .78, box.max.y * (digit ? .9 : .75), (box.min.z + box.max.z) * .5)).applyMatrix4(inv);
      let d = Infinity; const c = new THREE.Vector3();
      for (const t of tris) { t.closestPointToPoint(pad, c); d = Math.min(d, pad.distanceTo(c)); }
      pads.push({ side, digit, mm: +(d * 1000).toFixed(2), ok: d <= padLimit });
    }
    // 视图模型那挺枪与世界模型：枪口同位（世界模型此刻藏着，但节点照常跟着射界转）。
    world.updateMatrixWorld(true);
    const worldMuzzle = world.getObjectByName("muzzle")?.getWorldPosition(new THREE.Vector3());
    const vmMuzzle = vm.MuzzleWorld(new THREE.Vector3());
    // 眼位：枪局部原点落在相机空间的架设腰射位置上。
    const hip = vm.MountedEyeOffsets().hip;
    const origin = new THREE.Vector3(gun.position.x, gun.position.y + gun.kind.sightRiseM, gun.position.z);
    const inCam = g.camera.worldToLocal(origin.clone());
    return {
      mounted: g.emplacement.MountedId, weapon: vm.weaponId, gunWeapon: gun.kind.weaponId, pose: vm.armPoseKey,
      vmVisible: vm.root.visible, worldVisible: world.visible, mountSet: !!vm.mount, compensation: vm.compensation.toArray(),
      reach: arms.reachable, grip: arms.gripError, rot: arms.rotationError, pads,
      muzzleGapM: worldMuzzle ? worldMuzzle.distanceTo(vmMuzzle) : null,
      eyeErrorM: inCam.distanceTo(hip),
    };
  }, { padLimit: PAD_LIMIT_M });
  const m = receipts.mounted;
  assert.equal(m.mounted, "MissionGun");
  assert.equal(m.weapon, m.gunWeapon, "the viewmodel holds the mounted gun itself");
  assert.equal(m.pose, `${m.gunWeapon}@mounted`, "arms use the mounted pose");
  assert.ok(m.vmVisible && m.mountSet, "first-person hands are shown while mounted");
  assert.ok(!m.worldVisible, "the world model yields to the first-person gun (no double gun)");
  assert.deepEqual(m.compensation, [1, 1, 1], "no fake-depth squash on a gun that rests on the parapet");
  assert.ok(m.reach.r && m.reach.l, "both arms reach their grips " + JSON.stringify(m.reach));
  assert.ok(m.grip.r <= FPS_ARM_LIMITS.positionResidualM && m.grip.l <= FPS_ARM_LIMITS.positionResidualM, "palm residual " + JSON.stringify(m.grip));
  assert.ok(m.pads.every((p) => p.ok), "every finger pad touches the gun " + JSON.stringify(m.pads));
  assert.ok(m.muzzleGapM !== null && m.muzzleGapM < 0.01, "viewmodel gun coincides with the emplaced gun: " + m.muzzleGapM);
  assert.ok(m.eyeErrorM < 0.005, "camera sits at the mounted eye behind the gun: " + m.eyeErrorM);
  const glideStep = receipts.glide.slice(1).map((p, i) => Math.hypot(p[0] - receipts.glide[i][0], p[1] - receipts.glide[i][1], p[2] - receipts.glide[i][2]));
  assert.ok(Math.max(...glideStep) < 0.12, "the eye glides onto the gun instead of snapping: " + Math.max(...glideStep).toFixed(3));

  // ---- B 涂色数像素：画面里真的有两只手 ---------------------------------------
  receipts.pixels = await page.evaluate(async () => {
    const THREE = await import("./vendor/three/build/three.module.js");
    const g = window.Tengxian, vm = g.viewmodel, renderer = g.renderer;
    const swapped = [], paint = new THREE.MeshBasicMaterial({ color: 0xff00ff }), gunPaint = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    vm.riggedArms.root.traverse((o) => { if (o.isMesh) { swapped.push([o, o.material]); o.material = paint; } });
    vm.rig.group.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && o.visible) { swapped.push([o, o.material]); o.material = gunPaint; } });
    const size = renderer.getDrawingBufferSize(new THREE.Vector2()), gl = renderer.getContext();
    renderer.setRenderTarget(null); renderer.render(g.scene, g.camera);
    const px = new Uint8Array(size.x * size.y * 4); gl.readPixels(0, 0, size.x, size.y, gl.RGBA, gl.UNSIGNED_BYTE, px);
    for (const [o, mat] of swapped) o.material = mat;
    paint.dispose(); gunPaint.dispose();
    let arms = 0, gun = 0, left = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i] > 200 && px[i + 1] < 70 && px[i + 2] > 200) { arms++; if ((i / 4) % size.x < size.x / 2) left++; }
      else if (px[i] < 70 && px[i + 1] > 200 && px[i + 2] < 70) gun++;
    }
    const total = size.x * size.y;
    return { arms: arms / total, armsLeftHalf: left / total, gun: gun / total };
  });
  assert.ok(receipts.pixels.arms > 0.02, "hands and forearms are on screen: " + JSON.stringify(receipts.pixels));
  assert.ok(receipts.pixels.armsLeftHalf > 0.004, "the support arm is on screen too: " + JSON.stringify(receipts.pixels));
  assert.ok(receipts.pixels.gun > 0.01, "the gun is on screen: " + JSON.stringify(receipts.pixels));

  // ---- C 开火：枪与手一起跳，枪不离座，准心上跳不走 cameraKick -------------------
  receipts.fire = await page.evaluate(async () => {
    const THREE = await import("./vendor/three/build/three.module.js");
    const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime(), vm = g.viewmodel, gun = g.emplacement.Emplacement(r.gunId);
    const before = { shots: gun.roundsFired, vmShots: vm.shotIndex };
    let maxKick = 0, maxOffset = 0; const wm = new THREE.Vector3(), base = new THREE.Vector3();
    g.Debug.Mouse(0, true);
    for (let f = 0; f < 40; f++) {
      g.StepFrames(1, 1 / 60, true);
      maxKick = Math.max(maxKick, Math.abs(vm.recoilKick.value));
      vm.rig.group.getWorldPosition(wm);
      base.set(gun.position.x, gun.position.y + gun.kind.sightRiseM, gun.position.z);
      maxOffset = Math.max(maxOffset, wm.distanceTo(base));
    }
    g.Debug.Mouse(0, false);
    return { shots: gun.roundsFired - before.shots, vmShots: vm.shotIndex - before.vmShots, maxKick, maxOffsetM: maxOffset,
      cameraKick: vm.cameraKick.toArray() };
  });
  await page.screenshot({ path: path.join(out, "Scene_MountedFire.png") });
  assert.ok(receipts.fire.shots > 0 && receipts.fire.vmShots === receipts.fire.shots, "every round also fires the first-person gun " + JSON.stringify(receipts.fire));
  assert.ok(receipts.fire.maxKick > 0, "the gun visibly kicks");
  assert.ok(receipts.fire.maxOffsetM < 0.06, "recoil shakes the gun on its rest but never lifts it off " + receipts.fire.maxOffsetM);
  assert.deepEqual(receipts.fire.cameraKick, [0, 0], "mounted recoil is not banked into the rifle's camera kick");

  // ---- D 开镜：照门落在屏幕正中 ------------------------------------------------
  receipts.ads = await page.evaluate(async () => {
    const THREE = await import("./vendor/three/build/three.module.js");
    const g = window.Tengxian, vm = g.viewmodel;
    g.StepFrames(40, 1 / 60, false); g.Debug.Mouse(2, true); g.StepFrames(45, 1 / 60, true);
    vm.rig.group.updateMatrixWorld(true);
    const ndc = vm.rig.group.localToWorld(vm.rig.sight.clone()).project(g.camera);
    return { x: ndc.x, y: ndc.y, fov: g.camera.fov };
  });
  await page.screenshot({ path: path.join(out, "Scene_MountedAds.png") });
  await page.evaluate(() => { const g = window.Tengxian; g.Debug.Mouse(2, false); g.StepFrames(30, 1 / 60, false); });
  assert.ok(Math.abs(receipts.ads.x) < 0.02 && Math.abs(receipts.ads.y) < 0.02, "ADS puts the rear sight on the screen centre " + JSON.stringify(receipts.ads));

  // ---- E 换弹板：枪不动，只动右手 ------------------------------------------------
  receipts.reload = await page.evaluate(async () => {
    const THREE = await import("./vendor/three/build/three.module.js");
    const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime(), vm = g.viewmodel, gun = g.emplacement.Emplacement(r.gunId);
    gun.rounds = 0;
    g.Debug.Key("KeyR", true); g.StepFrames(1, 1 / 60, false); g.Debug.Key("KeyR", false);
    let maxOffset = 0, reloading = false, maxRightHand = 0; const wm = new THREE.Vector3(), base = new THREE.Vector3();
    const handHome = vm.handRight.group.position.clone();
    for (let f = 0; f < 60 * 5; f++) {
      g.StepFrames(1, 1 / 60, f % 20 === 0);
      reloading ||= vm.action?.kind === "reload";
      vm.rig.group.getWorldPosition(wm);
      base.set(gun.position.x, gun.position.y + gun.kind.sightRiseM, gun.position.z);
      maxOffset = Math.max(maxOffset, wm.distanceTo(base));
      maxRightHand = Math.max(maxRightHand, vm.handRight.group.position.distanceTo(handHome));
    }
    return { reloading, rounds: gun.rounds, beltRounds: gun.kind.beltRounds, maxOffsetM: maxOffset, rightHandTravelM: maxRightHand };
  });
  assert.ok(receipts.reload.reloading, "a belt/magazine change plays the first-person reload");
  assert.equal(receipts.reload.rounds, receipts.reload.beltRounds, "the reload completes");
  assert.ok(receipts.reload.maxOffsetM < 0.01, "the gun stays on its rest while reloading " + receipts.reload.maxOffsetM);
  assert.ok(receipts.reload.rightHandTravelM > 0.05, "the right hand actually leaves the grip to swap the magazine");

  // ---- E2 小卡：按 R 拉枪机，右手真的去拉机柄，机柄真的往后走 --------------------------
  receipts.charge = await page.evaluate(() => {
    const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime(), vm = g.viewmodel, gun = g.emplacement.Emplacement(r.gunId);
    gun.jam = { kind: "minor", pulls: 0, t: 0, need: 1 };
    const pulls = g.emplacement.stats.pulls, handHome = vm.handRight.group.position.clone();
    g.Debug.Key("KeyR", true); g.StepFrames(1, 1 / 60, false);
    let charging = false, maxBolt = 0, maxHand = 0;
    for (let f = 0; f < 90; f++) {
      g.StepFrames(1, 1 / 60, false);
      charging ||= vm.action?.kind === "charge";
      maxBolt = Math.max(maxBolt, vm.rig.parts.bolt?.position.z || 0);
      maxHand = Math.max(maxHand, vm.handRight.group.position.distanceTo(handHome));
    }
    g.Debug.Key("KeyR", false); g.StepFrames(30, 1 / 60, true);
    return { pulls: g.emplacement.stats.pulls - pulls, charging, maxBoltM: maxBolt, travel: vm.rig.boltTravel,
      handTravelM: maxHand, cleared: !gun.jam, idle: !vm.action };
  });
  assert.ok(receipts.charge.pulls === 1 && receipts.charge.charging, "a bolt pull plays the charging-handle action " + JSON.stringify(receipts.charge));
  assert.ok(receipts.charge.maxBoltM > receipts.charge.travel * 0.9, "the charging handle travels back");
  assert.ok(receipts.charge.handTravelM > 0.03, "the right hand leaves the grip for the handle");
  assert.ok(receipts.charge.cleared && receipts.charge.idle, "holding R clears the jam and the hand returns");

  // ---- F 离位：全部还原 ----------------------------------------------------------
  receipts.after = await page.evaluate(() => {
    const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime();
    g.Debug.Key("KeyF", true); g.StepFrames(1, 1 / 60, false); g.Debug.Key("KeyF", false);
    g.StepFrames(40, 1 / 60, true);
    const vm = g.viewmodel, world = g.scene.getObjectByName(`Emplacement_${r.gunId}`), eye = g.player.EyePosition;
    return { mounted: g.emplacement.MountedId, weapon: vm.weaponId, pose: vm.armPoseKey, mountSet: !!vm.mount,
      worldVisible: world.visible, compensation: vm.compensation.toArray(), eyeGapM: g.camera.position.distanceTo(eye) };
  });
  await page.screenshot({ path: path.join(out, "Scene_Dismounted.png") });
  const a = receipts.after;
  assert.equal(a.mounted, null);
  assert.equal(a.weapon, receipts.before.weapon, "the rifle comes back");
  assert.equal(a.pose, receipts.before.weapon, "with its own arm pose");
  assert.ok(!a.mountSet && a.worldVisible, "the emplaced gun is a world model again");
  assert.ok(a.compensation[0] < 1 || receipts.before.compensation[0] === 1, "rifle FOV compensation is restored");
  assert.ok(a.eyeGapM < 0.02, "the eye is back on the player: " + a.eyeGapM);
  assert.deepEqual(errors, []);
  console.log("PASS mounted-gun hands: grips, pixels, coincident gun, ADS centre, fire/reload stay on the rest, clean dismount");
} finally {
  await fs.writeFile(path.join(out, "Data_EmplacementView.json"), JSON.stringify({ receipts, errors }, null, 1));
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
