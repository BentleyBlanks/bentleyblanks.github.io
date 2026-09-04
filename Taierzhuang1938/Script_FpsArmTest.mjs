// 第一人称共享双臂的人体闸：覆盖全部逐枪姿势、状态和机械动作。

import path from "node:path";
import { WEAPONS } from "./Data_Weapons.mjs";
const onlyIds = process.argv.find((arg) => arg.startsWith("--only="))?.slice(7).split(",") || null;
const expectedIds = Object.values(WEAPONS).filter((weapon) => (weapon.ammo && weapon.magazine) || ["throwable", "melee"].includes(weapon.kind)).map((weapon) => weapon.id);
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const server = await ServeRoot(rootDir, 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?shot=1&phase=2&quality=medium&scale=small`,
  { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => window.Taierzhuang?.state?.ready, null, { timeout: 180000 });

const report = await page.evaluate(async (onlyIds) => {
  const THREE = await import("./vendor/three/build/three.module.js");
  const { FPS_ARM_POSES, FPS_ARM_LIMITS } = await import("./Data_FpsArmPoses.mjs");
  const T = window.Taierzhuang;
  T.player.health = 100;
  T.player.spawnGrace = 999;
  for (const soldier of T.ai.soldiers) if (soldier.side === "ija") soldier.position.x += 500;
  const vm = T.viewmodel;
  const arms = vm.riggedArms;
  const src = document.getElementById("view");
  const canvas = document.createElement("canvas");
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = canvas.getContext("2d");
  const red = new THREE.MeshBasicMaterial({ color: 0xff0000, skinning: true });
  const Input = (state = {}) => ({
    ads: state.ads || 0, sprint: state.sprint || 0,
    moveSpeed: state.sprint ? 4 : 0, grounded: true, crouch: 0,
    strafe: 0, lookDeltaYaw: 0, lookDeltaPitch: 0, elapsed: 0, lowAmmo: false,
  });
  const Step = (frames, state = {}) => {
    for (let frame = 0; frame < frames; frame += 1) vm.Update(1 / 60, Input(state));
  };
  const Equip = (weapon) => { vm.SetBayonetFixed(false); vm.Equip(weapon); };
  const PaintedFraction = () => {
    const swapped = [];
    arms.root.traverse((node) => { if (node.isMesh) swapped.push([node, node.material]); });
    for (const [node] of swapped) node.material = red;
    T.StepFrames(3);
    ctx.drawImage(src, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let seen = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 60 && data[i] - data[i + 1] > 40 && data[i] - data[i + 2] > 40) seen += 1;
    }
    for (const [node, material] of swapped) node.material = material;
    return seen / (canvas.width * canvas.height);
  };
  const SkinMaxEdgeM = () => {
    arms.anchor.updateWorldMatrix(true, false);
    arms.root.updateWorldMatrix(true, true);
    const inverseAnchor = new THREE.Matrix4().copy(arms.anchor.matrixWorld).invert();
    let maximum = 0;
    arms.root.traverse((node) => {
      if (!node.isSkinnedMesh || !node.geometry?.attributes?.position) return;
      const positions = node.geometry.attributes.position;
      const indices = node.geometry.index;
      const toAnchor = new THREE.Matrix4().copy(inverseAnchor).multiply(node.matrixWorld);
      const deformed = Array.from({ length: positions.count }, (_, index) => {
        const point = new THREE.Vector3().fromBufferAttribute(positions, index);
        node.applyBoneTransform(index, point);
        return point.applyMatrix4(toAnchor);
      });
      const Edge = (a, b) => { maximum = Math.max(maximum, deformed[a].distanceTo(deformed[b])); };
      if (indices) {
        for (let offset = 0; offset < indices.count; offset += 3) {
          const a = indices.getX(offset); const b = indices.getX(offset + 1); const c = indices.getX(offset + 2);
          Edge(a, b); Edge(b, c); Edge(c, a);
        }
      } else {
        for (let offset = 0; offset < positions.count; offset += 3) {
          Edge(offset, offset + 1); Edge(offset + 1, offset + 2); Edge(offset + 2, offset);
        }
      }
    });
    return +maximum.toFixed(4);
  };
  const Metrics = (weapon, state, painted = null) => ({
    weapon, state, painted,
    gripError: { ...arms.gripError }, rotationError: { ...arms.rotationError },
    handTranslation: { ...arms.handTranslation }, stretch: { ...arms.stretch },
    reachRatio: { ...arms.reachRatio }, reachable: { ...arms.reachable },
    jointTwist: structuredClone(arms.jointTwist), contactWeight: { ...arms.contactWeight },
    skinMaxEdgeM: SkinMaxEdgeM(),
  });
  const out = {
    reloadCases: [],
    cases: [], weaponIds: Object.keys(FPS_ARM_POSES), limits: FPS_ARM_LIMITS,
    source: arms?.report?.source, chains: arms?.report?.chains, bones: arms?.report?.bones,
    skinnedMeshes: arms?.report?.skinnedMeshes, profiles: arms?.report?.profiles || [],
  };
  for (const weapon of out.weaponIds.filter((id) => !onlyIds || onlyIds.includes(id))) {
    for (const [state, input] of [["hip", {}], ["ads", { ads: 1 }], ["sprintIn", { sprint: 1 }]]) {
      Equip(weapon);
      Step(90, input);
      const entry = Metrics(weapon, state);
      entry.painted = +PaintedFraction().toFixed(4);
      out.cases.push(entry);
    }
    Step(35, {});
    out.cases.push(Metrics(weapon, "sprintOut"));
    const spec = FPS_ARM_POSES[weapon];
    if (!["throwable", "melee"].includes(spec.family)) {
      Equip(weapon); Step(35); vm.TriggerFire(); Step(4);
      out.cases.push(Metrics(weapon, "fireRecoil"));
    }
    for (const action of Object.keys(spec.actions)) {
      Equip(weapon); Step(35);
      if (action === "bayonet") vm.TriggerFixBayonet(true);
      else if (action === "bolt") vm.TriggerBolt();
      else if (action === "reload") vm.TriggerReload();
      else if (action === "melee") vm.TriggerMelee();
      else if (action === "throw") vm.TriggerThrow(1);
      let guard = 0;
      while (vm.action && vm.action.t < 0.5 && guard++ < 150) Step(1);
      out.cases.push(Metrics(weapon, action));
    }
    if (spec.actions.reload) for (const adsEntry of [0, 1]) {
      Equip(weapon); Step(90, { ads: adsEntry }); vm.TriggerReload();
      const support = spec.actions.reload.family === "boxMag" ? "right" : "left";
      const working = support === "right" ? "left" : "right";
      for (const targetT of [0.18, 0.40, 0.62, 0.90]) {
        let guard = 0;
        while (vm.action && vm.action.t < targetT && guard++ < 300) Step(1, { ads: adsEntry });
        vm.root.updateWorldMatrix(true, true);
        const hand = support === "right" ? vm.handRight.group : vm.handLeft.group;
        const actual = vm.statePivot.worldToLocal(hand.getWorldPosition(new THREE.Vector3()));
        // Compare against this frame's unchanged holding pose; ADS suppression
        // may legitimately move the base, but rotating about the camera may not.
        const expected = vm.handBase[support].clone().applyMatrix4(vm.rig.group.matrix)
          .applyMatrix4(vm.swingPivot.matrix).applyMatrix4(vm.weaponMount.matrix)
          .applyMatrix4(vm.recoilPivot.matrix);
        const workingHand = working === "right" ? vm.handRight.group : vm.handLeft.group;
        out.reloadCases.push({ weapon, adsEntry, t: targetT,
          supportTravelM: actual.distanceTo(expected),
          cameraLayerRotation: Math.hypot(vm.actionPivot.rotation.x, vm.actionPivot.rotation.y, vm.actionPivot.rotation.z),
          workingHandTravelM: workingHand.position.distanceTo(vm.handBase[working]),
          supportWeight: arms.contactWeight[support === "right" ? "r" : "l"],
          action: vm.action?.kind, pivotRotation: vm.reloadPivot
            ? Math.hypot(vm.reloadPivot.rotation.x, vm.reloadPivot.rotation.y, vm.reloadPivot.rotation.z) : 0,
        });
      }
      Step(180, { ads: adsEntry });
      out.reloadCases.push({ weapon, adsEntry, t: 1, action: vm.action?.kind || null,
        neutral: !!vm.reloadPivot && vm.reloadPivot.position.length() < 1e-8
          && Math.abs(vm.reloadPivot.quaternion.w - 1) < 1e-8 });
    }
  }
  red.dispose();
  return out;
}, onlyIds);

const checks = [];
checks.push(["完整逐枪姿势数据", report.weaponIds.length === expectedIds.length && expectedIds.every((id) => report.weaponIds.includes(id)), `${report.weaponIds.length} 件装备`]);
checks.push(["国军 01 骨骼双臂接入", report.source === "LugouNra01Skeletal" && report.chains === 2
  && report.skinnedMeshes === 1 && report.bones >= 45, `${report.bones} bones / ${report.chains} chains`]);
checks.push(["五类源动作只提供手指基础姿态", ["rifle", "lmg", "pistol", "throwable", "melee"]
  .every((profile) => report.profiles.includes(profile)), report.profiles.join(", ")]);
for (const entry of report.cases) {
  const label = `${entry.weapon} ${entry.state}`;
  const staticContact = entry.contactWeight.r > 0.99 && entry.contactWeight.l > 0.99;
  if (entry.painted != null) checks.push([`${label} 玩家相机轮廓可读`, entry.painted >= 0.003 && entry.painted <= 0.22,
    `${(entry.painted * 100).toFixed(1)}%`]);
  checks.push([`${label} 无骨段拉伸`, entry.stretch.r <= report.limits.maxStretchRatio
    && entry.stretch.l <= report.limits.maxStretchRatio, JSON.stringify(entry.stretch)]);
  checks.push([`${label} 蒙皮无撕裂长三角`, entry.skinMaxEdgeM <= 0.18,
    `max triangle edge ${(entry.skinMaxEdgeM * 1000).toFixed(1)} mm`]);
  checks.push([`${label} Hand 仅毫米级闭合`, entry.handTranslation.r <= report.limits.handClosureM
    && entry.handTranslation.l <= report.limits.handClosureM,
  `${(entry.handTranslation.r * 1000).toFixed(2)} / ${(entry.handTranslation.l * 1000).toFixed(2)} mm`]);
  checks.push([`${label} 目标在人体可达域`, entry.reachable.r && entry.reachable.l
    && entry.reachRatio.r <= report.limits.maxReachRatio && entry.reachRatio.l <= report.limits.maxReachRatio,
  `reach=${JSON.stringify(entry.reachRatio)} reachable=${JSON.stringify(entry.reachable)}`]);
  if (staticContact) checks.push([`${label} 掌心接触 residual`, entry.gripError.r <= report.limits.positionResidualM
    && entry.gripError.l <= report.limits.positionResidualM
    && entry.rotationError.r <= report.limits.rotationResidualDeg
    && entry.rotationError.l <= report.limits.rotationResidualDeg,
  `pos=${JSON.stringify(entry.gripError)} rot=${JSON.stringify(entry.rotationError)}`]);
  for (const side of ["r", "l"]) {
    const twist = entry.jointTwist[side];
    const total = Object.values(twist).reduce((sum, value) => sum + Math.abs(value), 0);
    checks.push([`${label} ${side} 腕 twist 有限且不集中`, Math.abs(twist.hand) <= report.limits.handTwistDeg + 0.01
      && (total < 1 || Math.abs(twist.hand) <= total * 0.5), JSON.stringify(twist)]);
  }
}
checks.push(["页面无运行时错误", errors.length === 0, errors.slice(0, 2).join(" | ")]);
for (const entry of report.reloadCases) {
  const label = `${entry.weapon} ${entry.adsEntry ? "ADS" : "hip"} reload ${entry.t}`;
  if (entry.t === 1) {
    checks.push([`${label} 动作完整收回`, entry.action === null && entry.neutral, JSON.stringify(entry)]);
    continue;
  }
  checks.push([`${label} 支撑手不随相机轴横飞`, entry.supportTravelM < 0.11
    && entry.cameraLayerRotation < 1e-8 && entry.supportWeight > 0.99,
  `travel=${entry.supportTravelM.toFixed(4)}m cameraRotation=${entry.cameraLayerRotation.toFixed(4)}`]);
  checks.push([`${label} 保留真实取弹动作`, entry.action === "reload" && entry.pivotRotation > 0.01
    && (entry.t !== 0.62 || entry.workingHandTravelM > 0.015),
  `hand=${entry.workingHandTravelM.toFixed(4)}m tilt=${entry.pivotRotation.toFixed(4)}`]);
}

let failed = 0;
for (const [name, ok, detail] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
console.log(`\n第一人称骨骼双臂：${checks.length - failed}/${checks.length} 过`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
