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

    // 导入 GLB 只负责躯干与头部；手、膝、脚保留同一套已经过 IK 验证的
    // 程序化关节几何，不能再被有破洞的刚性 FBX 分段替换。
    check(actor.meshSource === "rigged" && actor.riggedSkin?.segmentMode,
      "NRA rigged segment skin is not active");
    check(!actor.riggedSkin.segmentMeshes.some((item) => /Segment_(arm|fore|thigh|shin|foot)/.test(item.name)),
      "rigged limb segment bypass was not applied");
    const footOffset = (leg, mountName) => {
      const segment = leg.ankle;
      const mount = actor.GetMount(mountName);
      check(segment.children.some((item) => item.isMesh && item.visible),
        `missing visible procedural ${mountName}`);
      actor.root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(segment);
      const ankle = mount.getWorldPosition(new THREE.Vector3());
      return [
        box.min.x - ankle.x, box.min.y - ankle.y, box.min.z - ankle.z,
        box.max.x - ankle.x, box.max.y - ankle.y, box.max.z - ankle.z,
      ];
    };
    const footL = footOffset(actor.legs.L, "footL");
    const footR = footOffset(actor.legs.R, "footR");
    check(footL[1] < -0.05 && footL[4] <= 0.01 && footR[1] < -0.05 && footR[4] <= 0.01,
      `NRA feet no longer sit immediately below their ankle pivots: L=${footL} R=${footR}`);
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
    seatTest.Update(0.016, { elapsed: 1.3, sit: 0, seatLift: 0.13 });
    check(Math.abs(seatTest.hips.position.y - hipWithoutSeatLift) > 0.05,
      "seat lift leaked into standing pose");
    for (const item of [actor, armed, baselineA, baselineB, seatTest]) item.Dispose();
    return "6 states × 3 levels, invalid values, mounts, default regression, armed blend";
  });
  console.log(`ActorPoseTest: PASS (${result})`);
} finally {
  if (page) await page.close().catch(() => {});
  await browser.close().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
}
