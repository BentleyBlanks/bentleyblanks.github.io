// 车厢生活动作的 Node 可运行冒烟测试（在 Chromium 中加载本地模块）。
// 用法：node Taierzhuang1938/Script_ActorPoseTest.mjs

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const server = await ServeRoot(rootDir, 0);
const browser = await LaunchBrowser();
let page;
try {
  page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?poseTest=1`, {
    waitUntil: "load", timeout: 120000,
  });
  await page.waitForFunction(() => window.Taierzhuang?.actorFactory, { timeout: 300000 });

  const result = await page.evaluate(async () => {
    const fail = (message) => { throw new Error(message); };
    const THREE = await import("/Taierzhuang1938/vendor/three/build/three.module.js");
    const { LIFE_POSE_NAMES, NormalizeLifePose } = await import("/Taierzhuang1938/Script_Actor.mjs");
    const factory = window.Taierzhuang.actorFactory;
    const nearly = (a, b, epsilon = 1e-7) => Math.abs(a - b) <= epsilon;
    const euler = (value) => [value.x, value.y, value.z];
    const snapshot = (actor) => ({
      body: actor.body.position.toArray().concat(euler(actor.body.rotation)),
      hips: actor.hips.position.toArray().concat(euler(actor.hips.rotation)),
      chest: euler(actor.chest.rotation), neck: euler(actor.neck.rotation),
    });
    const same = (a, b) => a.every((value, index) => nearly(value, b[index]));
    const check = (condition, message) => { if (!condition) fail(message); };

    check(JSON.stringify(LIFE_POSE_NAMES) === JSON.stringify([
      "sit", "repairShoe", "cleanRifle", "sleep", "checkAmmo", "prepare",
    ]), "life pose names changed");
    const midpoint = NormalizeLifePose({ sit: 0.5, cleanRifle: 0.25, prepare: 2 });
    check(midpoint.sit === 0.5 && midpoint.cleanRifle === 0.25 && midpoint.prepare === 1,
      "midpoint or endpoint clamp failed");
    const invalid = NormalizeLifePose({ sit: -2, repairShoe: Number.NaN, sleep: Infinity, checkAmmo: "bad" });
    check(Object.values(invalid).every((value) => value === 0), "invalid value handling failed");
    check(NormalizeLifePose({ lifePose: { sit: 0.4 } }).sit === 0.4, "nested lifePose failed");

    const actor = factory.Create("nra", { seed: 90210, weapon: null });
    const armed = factory.Create("nra", { seed: 90211, weapon: "ZhongZheng" });
    for (const name of ["handL", "handR", "back", "kneeL", "kneeR", "footL", "footR", "footEdgeL", "eyes"]) {
      const first = actor.GetMount(name);
      check(first && first === actor.GetMount(name.toUpperCase()) && first === actor.GetMount(` ${name} `),
        `unstable or missing mount ${name}`);
    }
    check(actor.GetMount("hand") === actor.GetMount("handR"), "hand alias failed");
    check(actor.GetMount("noSuchMount") === null, "unknown mount failed");

    // 士兵一律用程序化 tzm 模型（Model/SoldierNra.tzm.json），**不许**再退回
    // Model_NraSoldier.glb 那套 13 个刚体分段：那套分段之间没有交叠余量，
    // 肩/肘/腕/胯/膝/踝一转就开缝，手掌与小腿整段飘在空中，躯干还是一张薄板。
    // 判据写成「meshSource 是 model 且 13 根骨头下面都挂着可见几何」——
    // 换回 GLB 皮会把这些几何整片藏起来，这一条立刻红。
    check(actor.meshSource === "model" && !actor.riggedSkin,
      `NRA should use the procedural tzm model, got ${actor.meshSource}`);
    const jointNodes = {
      hips: actor.hips, chest: actor.chest, neck: actor.neck,
      armL: actor.arms.L.shoulder, foreL: actor.arms.L.elbow,
      armR: actor.arms.R.shoulder, foreR: actor.arms.R.elbow,
      thighL: actor.legs.L.thigh, shinL: actor.legs.L.knee, footL: actor.legs.L.ankle,
      thighR: actor.legs.R.thigh, shinR: actor.legs.R.knee, footR: actor.legs.R.ankle,
    };
    for (const [key, node] of Object.entries(jointNodes)) {
      let visible = 0;
      for (const child of node.children) if (child.isMesh && child.visible) visible += 1;
      check(visible > 0, `joint ${key} has no visible geometry`);
    }
    const footOffset = (leg, mountName) => {
      const segment = leg.ankle;
      const mount = actor.GetMount(mountName);
      actor.root.updateMatrixWorld(true);
      // GLTFLoader 会把多材质分段实例化为 Group + 子 Mesh，可见几何要递归找；
      // 被隐藏的旧程序化脚网格仍挂在踝下，量包围盒时必须排除。
      const box = new THREE.Box3();
      let visibleMeshes = 0;
      segment.traverse((item) => {
        if (!item.isMesh || !item.visible) return;
        visibleMeshes += 1;
        box.expandByObject(item);
      });
      check(visibleMeshes > 0, `missing visible ${mountName} geometry`);
      const ankle = mount.getWorldPosition(new THREE.Vector3());
      return {
        ankleY: ankle.y - actor.root.position.y,
        offset: [
          box.min.x - ankle.x, box.min.y - ankle.y, box.min.z - ankle.z,
          box.max.x - ankle.x, box.max.y - ankle.y, box.max.z - ankle.z,
        ],
      };
    };
    const { offset: footL, ankleY: ankleL } = footOffset(actor.legs.L, "footL");
    const { offset: footR, ankleY: ankleR } = footOffset(actor.legs.R, "footR");
    // 2026-08-25 资产修复后鞋底烘在世界 0.010 m（对齐 Ija 的 0.009）；
    // 这里锁「贴地不悬空、不沉地、不脱离踝」。
    const soleL = ankleL + footL[1];
    const soleR = ankleR + footR[1];
    check(soleL > -0.02 && soleL < 0.02 && soleR > -0.02 && soleR < 0.02,
      `NRA soles drifted from the ground plane: L=${soleL} R=${soleR}`);
    check(footL[1] < -0.005 && footL[4] <= 0.2 && footR[1] < -0.005 && footR[4] <= 0.2,
      `NRA feet detached from their ankle pivots: L=${footL} R=${footR}`);
    const footSymmetry = [
      footL[0] + footR[3], footL[3] + footR[0], // X 轴镜像
      footL[1] - footR[1], footL[4] - footR[4], // 高度一致
      footL[2] - footR[2], footL[5] - footR[5], // 鞋尖同向
    ];
    check(footSymmetry.every((value) => Math.abs(value) < 0.004),
      `NRA left/right foot segment mismatch: L=${footL} R=${footR}`);

    const baselineA = factory.Create("nra", { seed: 90212, weapon: null });
    const baselineB = factory.Create("nra", { seed: 90212, weapon: null });
    const state = { moveSpeed: 0, elapsed: 0.25 };
    baselineA.Update(0.016, state);
    baselineB.Update(0.016, { ...state, lifePose: {
      sit: 0, repairShoe: 0, cleanRifle: 0, sleep: 0, checkAmmo: 0, prepare: 0,
    } });
    for (const key of ["body", "hips", "chest", "neck"]) {
      check(same(snapshot(baselineA)[key], snapshot(baselineB)[key]), `default regression ${key}`);
    }

    for (const name of LIFE_POSE_NAMES) {
      actor.Update(0.016, { elapsed: 0.5, [name]: 0 });
      check(actor.lifePose[name] === 0, `${name} endpoint 0`);
      actor.Update(0.016, { elapsed: 0.75, [name]: 0.5 });
      check(actor.lifePose[name] === 0.5, `${name} midpoint`);
      actor.Update(0.016, { elapsed: 1.0, [name]: 1 });
      check(actor.lifePose[name] === 1, `${name} endpoint 1`);
      actor.root.traverse((node) => {
        for (const value of [node.position.x, node.position.y, node.position.z,
          node.rotation.x, node.rotation.y, node.rotation.z]) {
          check(Number.isFinite(value), `${name} produced non-finite transform`);
        }
      });
    }
    armed.Update(0.016, {
      elapsed: 1.2, sit: 0.8, repairShoe: 0.6, cleanRifle: 1,
      sleep: 0.25, checkAmmo: 0.75, prepare: 0.5,
    });
    check(armed.lifePose.cleanRifle === 1 && Number.isFinite(armed.GetMount("weaponMount").position.y),
      "armed blend failed");
    const seatTest = factory.Create("nra", { seed: 90213, weapon: null });
    seatTest.Update(0.016, { elapsed: 1.3, sit: 1 });
    const hipWithoutSeatLift = seatTest.hips.position.y;
    seatTest.Update(0.016, { elapsed: 1.3, sit: 1, seatLift: 0.13 });
    check(Math.abs(seatTest.hips.position.y - hipWithoutSeatLift - 0.13) < 1e-5,
      "seat lift no longer raises the seated hips above the bench");
    check(seatTest.legs.L.thigh.rotation.x > 1.2 && seatTest.legs.R.thigh.rotation.x > 1.2
      && seatTest.legs.L.knee.rotation.x < -1.2 && seatTest.legs.R.knee.rotation.x < -1.2,
    "seated legs no longer keep the bench-clipping standing IK pose");
    seatTest.Update(0.016, { elapsed: 1.3, sit: 0, seatLift: 0.13 });
    check(Math.abs(seatTest.hips.position.y - hipWithoutSeatLift) > 0.05,
      "seat lift leaked into standing pose");
    const seatedArmed = factory.Create("nra", { seed: 90214, weapon: "ZhongZheng" });
    seatedArmed.Update(0.016, { elapsed: 1.4, sit: 1 });
    seatedArmed.weaponMount.updateMatrix();
    const rightGripCenter = new THREE.Vector3().applyMatrix4(seatedArmed.weaponMount.matrix);
    const leftGripCenter = seatedArmed.weaponGripFront.clone().multiplyScalar(seatedArmed.weaponScale)
      .applyMatrix4(seatedArmed.weaponMount.matrix);
    check(seatedArmed.gripR.distanceTo(rightGripCenter) > 0.025
      && seatedArmed.gripL.distanceTo(leftGripCenter) > 0.025,
    "seated weapon palms no longer clear the gun centerline");
    for (const item of [actor, armed, baselineA, baselineB, seatTest, seatedArmed]) item.Dispose();
    return "6 states × 3 levels, tzm 模型 13 关节几何, sole clearance, seated legs, weapon-palm clearance, invalid values, mounts, default regression, armed blend";
  });
  console.log(`ActorPoseTest: PASS (${result})`);
} finally {
  if (page) await page.close().catch(() => {});
  await browser.close().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
}
