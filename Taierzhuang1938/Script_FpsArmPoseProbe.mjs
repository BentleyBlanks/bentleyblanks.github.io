// Developer calibration probe: derive the weapon-local palm frame produced by
// the natural source skeleton after analytic position IK, without wrist forcing.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const server = await ServeRoot(rootDir, 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?shot=1&phase=2&quality=medium&scale=small`,
  { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => window.Taierzhuang?.state?.ready, null, { timeout: 180000 });

const onlyWeapon = process.argv[2] || null;
const result = await page.evaluate(async (onlyWeapon) => {
  const THREE = await import("./vendor/three/build/three.module.js");
  const { FPS_ARM_POSES } = await import("./Data_FpsArmPoses.mjs");
  const T = window.Taierzhuang;
  T.player.health = 100;
  T.player.spawnGrace = 999;
  for (const soldier of T.ai.soldiers) if (soldier.side === "ija") soldier.position.x += 500;
  const vm = T.viewmodel;
  const arms = vm.riggedArms;
  const LocalMarkerQuaternion = (side) => {
    const parent = vm.rig.group;
    const marker = arms.gripNodes[side];
    parent.updateWorldMatrix(true, false);
    marker.updateWorldMatrix(true, false);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    new THREE.Matrix4().copy(parent.matrixWorld).invert().multiply(marker.matrixWorld)
      .decompose(position, quaternion, scale);
    return quaternion.normalize();
  };
  const Input = (state) => ({ ads: state === "ads" ? 1 : 0, sprint: state === "sprint" ? 1 : 0,
    moveSpeed: state === "sprint" ? 4 : 0, grounded: true, crouch: 0, strafe: 0,
    lookDeltaYaw: 0, lookDeltaPitch: 0, elapsed: 0, lowAmmo: false });
  const entries = {};
  for (const weapon of Object.keys(FPS_ARM_POSES).filter((id) => !onlyWeapon || id === onlyWeapon)) {
    entries[weapon] = {};
    for (const state of ["hip", "ads", "sprint"]) {
      vm.Equip(weapon);
      for (let frame = 0; frame < 90; frame += 1) vm.Update(1 / 60, Input(state));
      const targets = { r: vm.gripContactRight, l: vm.gripContactLeft };
      for (let iteration = 0; iteration < 16; iteration += 1) {
        for (const side of ["r", "l"]) targets[side].quaternion.copy(LocalMarkerQuaternion(side));
        for (let frame = 0; frame < 4; frame += 1) arms.Update();
      }
      const sides = {};
      for (const side of ["r", "l"]) {
        const quaternion = targets[side].quaternion;
        const euler = new THREE.Euler().setFromQuaternion(quaternion, "YXZ");
        sides[side] = {
          rotation: [euler.x, euler.y, euler.z].map((value) => +value.toFixed(5)),
          residualM: arms.gripError[side], reachRatio: arms.reachRatio[side],
        };
      }
      entries[weapon][state] = sides;
    }
  }
  return entries;
}, onlyWeapon);

console.log(JSON.stringify(result, null, 2));
await browser.close();
server.close();
