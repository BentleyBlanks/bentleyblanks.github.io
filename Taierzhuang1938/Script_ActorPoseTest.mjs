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
  await page.waitForFunction(() => window.Taierzhuang?.actorFactory, null, { timeout: 300000 });

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

    // 军人可见人体已全部换成卢沟桥资产的蒙皮 GLB；程序化骨架仍只作为动作编辑器
    // 的独立模式和既有挂点 API 兼容层，不得重新成为正式军人外观。
    const checkRiggedSoldier = (candidate, faction) => {
      check(candidate.meshSource.startsWith(`glb:Lugou${faction}`),
        `${faction} should use a Lugou skinned GLB, got ${candidate.meshSource}`);
      check(candidate.characterRig?.clipById?.size === 16,
        `${candidate.meshSource} did not expose all 16 imported actions`);
      let skinnedMeshes = 0;
      candidate.characterRig.root.traverse((item) => {
        if (item.isSkinnedMesh && item.visible) skinnedMeshes += 1;
      });
      check(skinnedMeshes > 0, `${candidate.meshSource} has no visible SkinnedMesh`);
      const hitboxes = candidate.GetBoneHitboxes();
      check(hitboxes.length === 11
        && hitboxes.some((shape) => shape.part === "head")
        && hitboxes.some((shape) => shape.part === "torso")
        && hitboxes.some((shape) => shape.part === "limb"),
      `${candidate.meshSource} bone hitboxes are incomplete`);
    };
    checkRiggedSoldier(actor, "Nra");
    const ija = factory.Create("ija", { seed: 90215, weapon: null });
    checkRiggedSoldier(ija, "Ija");
    const protagonist = factory.Create("nra", { seed: "player", protagonist: true, weapon: null });
    check(protagonist.modelId === "LugouNra01",
      `protagonist should use LugouNra01, got ${protagonist.modelId}`);
    protagonist.Dispose();
    for (const [kind, prefix] of [["nra", "LugouNra"], ["ija", "LugouIja"]]) {
      const variants = [];
      for (let modelVariant = 0; modelVariant < 4; modelVariant += 1) {
        const candidate = factory.Create(kind, { seed: `${kind}:${modelVariant}`, modelVariant, weapon: null });
        variants.push(candidate.modelId);
        candidate.Dispose();
      }
      check(variants.join(",") === [1, 2, 3, 4].map((n) => `${prefix}0${n}`).join(","),
        `${kind} four-soldier lineup mismatch: ${variants.join(",")}`);
      const officer = factory.Create(`${kind}Officer`, { seed: `${kind}:officer`, modelVariant: 4, weapon: null });
      check(officer.modelId === `${prefix}05`, `${kind} officer model mismatch: ${officer.modelId}`);
      officer.Dispose();
    }

    // 百姓：男女两个分身各查一遍。这个 kind 是最后一个从 GLB 搬过来的
    //（2026-08-26），而它原来的毛病恰恰是「脚整个不存在、人陷在地下 11 cm」，
    // 所以鞋底那一条对它比对士兵更要紧。
    const civilianVariants = new Map();
    for (let seed = 7000; seed < 7040 && civilianVariants.size < 2; seed += 1) {
      const one = factory.Create("civilian", { seed });
      if (!civilianVariants.has(one.variant)) civilianVariants.set(one.variant, one);
      else one.Dispose();
    }
    check(civilianVariants.size === 2 && civilianVariants.has("male") && civilianVariants.has("female"),
      `civilian variants missing: ${[...civilianVariants.keys()].join(",")}`);
    for (const [variant, civilian] of civilianVariants) {
      check(civilian.meshSource === "model",
        `civilian ${variant} fell back to ${civilian.meshSource} instead of the tzm model`);
      const hitboxes = civilian.GetBoneHitboxes();
      check(hitboxes.length === 13 && hitboxes.some((shape) => shape.id === "head")
        && hitboxes.some((shape) => shape.id === "footL") && hitboxes.some((shape) => shape.id === "footR"),
      `civilian ${variant} does not expose its segmented bullet proxies`);
      civilian.root.updateMatrixWorld(true);
      const joints = {
        hips: civilian.hips, chest: civilian.chest, neck: civilian.neck,
        armL: civilian.arms.L.shoulder, foreL: civilian.arms.L.elbow,
        armR: civilian.arms.R.shoulder, foreR: civilian.arms.R.elbow,
        thighL: civilian.legs.L.thigh, shinL: civilian.legs.L.knee, footL: civilian.legs.L.ankle,
        thighR: civilian.legs.R.thigh, shinR: civilian.legs.R.knee, footR: civilian.legs.R.ankle,
      };
      for (const [key, node] of Object.entries(joints)) {
        let visible = 0;
        for (const child of node.children) if (child.isMesh && child.visible) visible += 1;
        check(visible > 0, `civilian ${variant} joint ${key} has no visible geometry`);
      }
      // 鞋底贴地：旧 GLB 百姓的腿到脚踝就断了，包围盒下沿在地面下 0.11 m。
      const box = new THREE.Box3();
      civilian.root.traverse((node) => { if (node.isMesh && node.visible) box.expandByObject(node); });
      const sole = box.min.y - civilian.root.position.y;
      check(sole > -0.02 && sole < 0.02, `civilian ${variant} sole off the ground: ${sole}`);
      // 男女不是同一个模型、也不是同一个个头
      check(civilian.usingModel && civilian.height > 1.4 && civilian.height < 1.75,
        `civilian ${variant} height out of range: ${civilian.height}`);
    }
    // 两个分身必须真的取到两个不同的 tzm 文档。只比身高是不够的：
    // 个体差 ±4% 会让男女的身高区间叠上，同一个模型也可能"看着不一样高"。
    check(factory.KindGeometry("civilian", "male").meshId === "CivilianMale"
      && factory.KindGeometry("civilian", "female").meshId === "CivilianFemale",
    "civilian variants resolve to the wrong tzm models");
    for (const civilian of civilianVariants.values()) civilian.Dispose();

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
    for (const item of [actor, armed, ija, baselineA, baselineB, seatTest, seatedArmed]) item.Dispose();
    return "10 套军人蒙皮 GLB, 16 动作, 11 骨骼命中体, 主角国军 01, 程序化动作兼容, 百姓男女分身, seated legs, weapon-palm clearance";
  });
  console.log(`ActorPoseTest: PASS (${result})`);
} finally {
  if (page) await page.close().catch(() => {});
  await browser.close().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
}
