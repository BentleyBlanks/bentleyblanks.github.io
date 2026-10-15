// 第一人称共享双臂的人体闸：覆盖全部逐枪姿势、状态和机械动作。

import path from "node:path";
import fs from "node:fs";
import { WEAPONS, SHELVED_WEAPONS } from "./Data_Weapons.mjs";
const onlyIds = process.argv.find((arg) => arg.startsWith("--only="))?.slice(7).split(",") || null;
// 姿势数据仍要逐枪齐全（expectedIds 不排除停用武器）；但停用的手枪不再装上去逐状态量握持。
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
const acceptanceFile = path.join(projectDir, "_shots", "FpsArm", "Data_FpsArmAcceptance.json");
let acceptanceReport = null;
const checks = [];
const SaveAcceptance = (phase, extra = {}) => {
  fs.mkdirSync(path.dirname(acceptanceFile), { recursive: true });
  fs.writeFileSync(acceptanceFile, JSON.stringify({ phase, onlyIds, report: acceptanceReport, checks, errors,
    ...extra }, null, 2));
};
SaveAcceptance("started");

try {
// The production firearm range has the same player/viewmodel host and avoids
// loading an unrelated campaign battlefield for an arm/contact regression.
await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?weapons=1&shot=1&manual=1&quality=medium&scale=small`,
  { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => window.Taierzhuang?.state?.ready, null, { timeout: 180000 });

const report = await page.evaluate(async ({ onlyIds, shelved }) => {
  const THREE = await import("./vendor/three/build/three.module.js");
  const { FPS_ARM_POSES, FPS_ARM_LIMITS } = await import("./Data_FpsArmPoses.mjs");
  const T = window.Taierzhuang;
  T.player.health = 100;
  T.player.spawnGrace = 999;
  for (const soldier of T.ai.soldiers) if (soldier.side === "ija") soldier.position.x += 500;
  const vm = T.viewmodel;
  let arms = vm.riggedArms;
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
  const Equip = (weapon) => { vm.SetBayonetFixed(false); vm.Equip(weapon); arms=vm.riggedArms; };
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
        const point = node.getVertexPosition(index, new THREE.Vector3());
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
    weapon, state, painted, fixedRestLengths: arms.fixedRestLengths,
    gripError: { ...arms.gripError }, rotationError: { ...arms.rotationError },
    handTranslation: { ...arms.handTranslation }, stretch: { ...arms.stretch },
    reachRatio: { ...arms.reachRatio }, reachable: { ...arms.reachable },
    jointTwist: structuredClone(arms.jointTwist), contactWeight: { ...arms.contactWeight },
    gripCorrectives: CorrectiveWeights(arms),
    skinMaxEdgeM: SkinMaxEdgeM(),
  });
  const morphProbeCache = new WeakMap();
  const CorrectiveWeights = rig => rig.gripCorrectives.map(({ mesh, index, name, weaponId, side }) => {
    const data = mesh._fpsGripCorrectiveData, gpu = mesh.geometry.morphAttributes;
    return { name, weaponId, side, weight: mesh.morphTargetInfluences[index],
      evaluation: data ? "cpu-attributes" : "gpu-morph",
      gpuMorphPositionCount: gpu.position?.length || 0,
      gpuMorphTargetSlots: Object.values(gpu).reduce((sum, channels) => sum + channels.length, 0),
      evaluatedVertexCount: mesh.geometry.attributes.position.count,
      originalBasisAttributes: Object.fromEntries(["position", "normal", "tangent"].map(semantic =>
        [semantic, data?.basisAttributes?.[semantic]?.count || 0])),
      originalMorphAttributes: Object.fromEntries(["position", "normal", "tangent"].map(semantic =>
        [semantic, { targets: data?.morphAttributes?.[semantic]?.length || 0,
          vertices: data?.morphAttributes?.[semantic]?.[index]?.count || 0 }])),
    };
  });
  // Keep the current bones fixed. Compare the real evaluated skin with its
  // Basis and full corrective, rather than reproducing the controller curve.
  const MorphGeometry = () => {
    arms.anchor.updateWorldMatrix(true, false); arms.root.updateWorldMatrix(true, true);
    const inverse = arms.anchor.matrixWorld.clone().invert();
    return arms.gripCorrectives.filter(c => c.weaponId === arms.weaponId).map(c => {
      let cached = morphProbeCache.get(c.mesh);
      if (!cached) { cached = new Map(); morphProbeCache.set(c.mesh, cached); }
      let probes = cached.get(c.index);
      if (!probes) {
        const data = c.mesh._fpsGripCorrectiveData;
        const target = (data?.morphAttributes || c.mesh.geometry.morphAttributes).position?.[c.index];
        const basis = (data?.basisAttributes || c.mesh.geometry.attributes).position;
        const relative = data?.relative ?? c.mesh.geometry.morphTargetsRelative;
        const ranked = target ? Array.from({ length: target.count }, (_, i) => {
          const delta = new THREE.Vector3().fromBufferAttribute(target, i);
          if (!relative) delta.sub(new THREE.Vector3().fromBufferAttribute(basis, i));
          return { index: i, length: delta.length() };
        }).filter(p => p.length > 1e-8).sort((a, b) => b.length - a.length) : [];
        probes = ranked.slice(0, 24).map(p => p.index); cached.set(c.index, probes);
      }
      const influences = c.mesh.morphTargetInfluences, saved = influences.slice();
      const toAnchor = inverse.clone().multiply(c.mesh.matrixWorld);
      const Read = () => probes.map(i => c.mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(toAnchor));
      const Refresh = () => c.mesh._RefreshFpsGripGeometry?.();
      try {
        // Read the actual runtime geometry before changing logical weights.
        // CPU baking must already have synchronized it during the real update.
        const actual = Read(); influences.fill(0); Refresh(); const basis = Read();
        influences[c.index] = 1; Refresh(); const full = Read();
        const currentDistances = actual.map((p, i) => p.distanceTo(basis[i]));
        const fullDistances = full.map((p, i) => p.distanceTo(basis[i]));
        const sum = values => values.reduce((a, b) => a + b, 0);
        return { name: c.name, side: c.side, probeCount: probes.length, weight: saved[c.index],
          currentMaximumM: Math.max(0, ...currentDistances), fullMaximumM: Math.max(0, ...fullDistances),
          actualToFullRatio: sum(currentDistances) / Math.max(sum(fullDistances), 1e-20) };
      } finally { saved.forEach((value, i) => { influences[i] = value; }); Refresh(); }
    });
  };
  const MorphState = (label, extra = {}) => ({ label, weapon: vm.weaponId, t: vm.action?.t ?? null,
    activeAction: vm.action?.kind || null,
    action: vm.action ? { kind: vm.action.kind, offhand: !!vm.action.offhand, t: vm.action.t } : null,
    operation: Object.fromEntries(["r", "l"].map(side => [side, arms.operationPose[side] ? {
      shape: arms.operationPose[side].shape || null, nextShape: arms.operationPose[side].nextShape || null,
      source: arms.operationPose[side].source || null,
    } : null])),
    contactWeight: { ...arms.contactWeight }, weights: CorrectiveWeights(arms), geometry: MorphGeometry(), ...extra });
  const out = {
    morphLifecycle: [], morphPool: [],
    reloadCases: [],
    reloadMotion: [],
    cases: [], weaponIds: Object.keys(FPS_ARM_POSES), limits: FPS_ARM_LIMITS,
    source: arms?.report?.source, chains: arms?.report?.chains, bones: arms?.report?.bones,
    skinnedMeshes: arms?.report?.skinnedMeshes, profiles: arms?.report?.profiles || [],
  };
  for (const weapon of out.weaponIds.filter((id) => (!onlyIds || onlyIds.includes(id)) && !shelved.includes(id))) {
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
      Equip(weapon); Step(90, { ads: adsEntry }); vm.TriggerReload(weapon==="Type11"?{remainingRounds:0}:undefined);
      const support = spec.actions.reload.family === "boxMag" ? "right" : "left";
      const working = support === "right" ? "left" : "right";
      const rifle = ["ZhongZheng", "HanYang", "Type38"].includes(weapon);
      const traceMotion = rifle || ["Zb26", "Type11"].includes(weapon);
      const motion = { weapon, adsEntry, maxHandStepM: 0, maxHandTurnDeg: 0, maxGunTurnDeg: 0,
        midSupportTravelM: 0, midFrames: 0, longestStillS: 0, stillS: 0 };
      let previous = null;
      const TraceStep = () => {
        Step(1, { ads: adsEntry });
        if (!traceMotion) return;
        const hand = vm.handRight.group, gun = vm.reloadPivot;
        const current = { t: vm.action?.t ?? 1, hand: hand.position.clone(), rotation: hand.quaternion.clone(),
          leftHand:vm.handLeft.group.position.clone(),leftRotation:vm.handLeft.group.quaternion.clone(),
          gun: gun.position.clone(), gunRotation: gun.quaternion.clone() };
        if (previous) {
          const handStep = Math.max(current.hand.distanceTo(previous.hand),
            weapon === "Type11" ? current.leftHand.distanceTo(previous.leftHand) : 0);
          if (handStep > motion.maxHandStepM) motion.handStepAt = current.t;
          motion.maxHandStepM = Math.max(motion.maxHandStepM, handStep);
          motion.maxHandTurnDeg = Math.max(motion.maxHandTurnDeg, THREE.MathUtils.radToDeg(current.rotation.angleTo(previous.rotation)));
          if(weapon === "Type11")motion.maxHandTurnDeg=Math.max(motion.maxHandTurnDeg,THREE.MathUtils.radToDeg(current.leftRotation.angleTo(previous.leftRotation)));
          const gunTurn = current.gunRotation.angleTo(previous.gunRotation), gunStep = current.gun.distanceTo(previous.gun);
          motion.maxGunTurnDeg = Math.max(motion.maxGunTurnDeg, THREE.MathUtils.radToDeg(gunTurn));
          if (previous.t >= 0.30 && current.t <= 0.80) {
            motion.midFrames += 1;
            motion.midSupportTravelM += gunStep;
            motion.stillS = gunStep < 0.00002 && gunTurn < 0.0002 ? motion.stillS + 1 / 60 : 0;
            motion.longestStillS = Math.max(motion.longestStillS, motion.stillS);
          }
        }
        previous = current;
      };
      for (const targetT of [0.18, 0.40, 0.62, 0.90]) {
        let guard = 0;
        while (vm.action && vm.action.t < targetT && guard++ < 300) TraceStep();
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
          supportOperation: arms.operationPose[support === "right" ? "r" : "l"]?.shape,
          supportNextOperation: arms.operationPose[support === "right" ? "r" : "l"]?.nextShape,
          action: vm.action?.kind, pivotRotation: vm.reloadPivot
            ? Math.hypot(vm.reloadPivot.rotation.x, vm.reloadPivot.rotation.y, vm.reloadPivot.rotation.z) : 0,
        });
      }
      let guard = 0;
      while (vm.action && guard++ < 300) TraceStep();
      if (traceMotion) out.reloadMotion.push(motion);
      Step(180, { ads: adsEntry });
      out.reloadCases.push({ weapon, adsEntry, t: 1, action: vm.action?.kind || null,
        neutral: !!vm.reloadPivot && vm.reloadPivot.position.length() < 1e-8
          && Math.abs(vm.reloadPivot.quaternion.w - 1) < 1e-8 });
    }
  }
  const runBundleMorph = (!onlyIds || onlyIds.includes("GrenadeBundle")) && !shelved.includes("GrenadeBundle");
  const runOperationMorph = runBundleMorph || ((!onlyIds || onlyIds.includes("Zb26")) && !shelved.includes("Zb26"));
  out.morphExpected = { bundle: runBundleMorph, operation: runOperationMorph };
  let heldBundleRig = null;
  if (runBundleMorph) {
    Equip("GrenadeBundle"); Step(90); out.morphLifecycle.push(MorphState("bundleHeld"));
    vm.TriggerThrow(1);
    const intermediate = []; let guard = 0;
    while (vm.action && vm.action.t < .60 && guard++ < 240) {
      Step(1);
      const keys = CorrectiveWeights(arms).filter(c => c.weaponId === "GrenadeBundle");
      if (keys.length === 2 && keys.every(c => c.weight > .02 && c.weight < .98))
        intermediate.push(MorphState("bundleIntermediate"));
    }
    if (intermediate.length) out.morphLifecycle.push({ ...intermediate[0], label: "bundleMidEarly" },
      { ...intermediate[intermediate.length - 1], label: "bundleMidLate" });
    while (vm.action && vm.action.t < .65 && guard++ < 300) Step(1);
    out.morphLifecycle.push(MorphState("bundleReleased", { actionStillRunning: !!vm.action }));
    // Begin switching with nonzero keys, so Detach cannot pass vacuously after release.
    Equip("GrenadeBundle"); Step(60); heldBundleRig = arms;
    const before = CorrectiveWeights(heldBundleRig);
    Equip("Zb26"); Step(60);
    out.morphPool.push({ label: "bundleToZb", weapon: "Zb26", before, oldDetached: !heldBundleRig.root.parent,
      oldWeights: CorrectiveWeights(heldBundleRig), activeWeights: CorrectiveWeights(arms),
      independentInfluences: heldBundleRig.gripCorrectives.every(old => arms.gripCorrectives.some(current =>
        current.name === old.name && current.mesh.morphTargetInfluences !== old.mesh.morphTargetInfluences)) });
  }
  if (runOperationMorph) {
    if (!runBundleMorph) { Equip("Zb26"); Step(60); }
    vm.TriggerReload(); let reloadGuard = 0;
    while (vm.action && !(arms.contactWeight.r < .001 && arms.contactWeight.l > .999) && reloadGuard++ < 300) Step(1);
    out.morphLifecycle.push(MorphState("reloadLeftSupport"));
    while (vm.action && reloadGuard++ < 600) Step(1);
    Step(60);
    out.morphLifecycle.push(MorphState("operationHeld")); vm.TriggerThrow(1); let guard = 0;
    // Zb magazine work is done by the right hand; the left keeps supporting it.
    // Its real offhand throw releases the left hand and therefore its left key.
    while (vm.action && !(arms.contactWeight.l < .001 && vm.action.kind === "throw" && vm.action.offhand === true) && guard++ < 300) Step(1);
    out.morphLifecycle.push(MorphState("operationReleased", { operation: arms.operationPose.l?.shape
      || arms.operationPose.l?.nextShape || arms.operationPose.l?.source
      || (vm.action?.kind === "throw" && vm.action.offhand === true ? "offhandThrow" : null),
      actionStillRunning: !!vm.action, operationSampleActionStillRunning: !!vm.action, operationSampleGuard: guard,
      operationSampleNextShape: arms.operationPose.l?.nextShape || null, operationSampleSource: arms.operationPose.l?.source || null }));
    while (vm.action && guard++ < 600) Step(1);
    Step(90); out.morphLifecycle.push(MorphState("operationRecovered", { actionFinished: !vm.action }));
  }
  if (heldBundleRig) {
    Equip("GrenadeBundle"); Step(60);
    out.morphPool.push({ label: "bundleReused", weapon: "GrenadeBundle", reusedSameRig: arms === heldBundleRig,
      activeWeights: CorrectiveWeights(arms) });
    out.morphLifecycle.push(MorphState("bundleReused"));
  }
  red.dispose();
  return out;
}, { onlyIds, shelved: SHELVED_WEAPONS });

acceptanceReport = report;
SaveAcceptance("evaluated");
const morphStates = new Map(report.morphLifecycle.map(entry => [entry.label, entry]));
const ExpectMorphState = label => {
  const entry = morphStates.get(label);
  checks.push([`${label} 生命周期采样存在`, !!entry, entry ? `t=${entry.t}` : "missing"]);
  return entry;
};
for (const entry of report.morphLifecycle) {
  checks.push([`${entry.label} 只启用当前装备修形`, entry.weights.every(c => c.weaponId === entry.weapon || c.weight < 1e-6),
    JSON.stringify(entry.weights)]);
  checks.push([`${entry.label} 读取真实非零皮面修形`, entry.geometry.length === (entry.weapon === "Zb26" ? 1 : 2)
    && entry.geometry.every(c => c.probeCount > 0 && c.fullMaximumM > .00002), JSON.stringify(entry.geometry)]);
}
if (report.morphExpected.bundle) {
  for (const label of ["bundleHeld", "bundleReused"]) {
    const entry = ExpectMorphState(label);
    if (entry) checks.push([`${label} 真实皮面完整重新握持`, entry.geometry.every(c => c.weight > .999 && c.actualToFullRatio > .98), JSON.stringify(entry.geometry)]);
  }
  const early = ExpectMorphState("bundleMidEarly"), late = ExpectMorphState("bundleMidLate");
  if (early && late) checks.push(["集束弹释放中皮面连续退形", late.t > early.t && early.geometry.every(a => {
    const b = late.geometry.find(c => c.name === a.name);
    return b && a.weight > .02 && a.weight < .98 && b.weight > .02 && b.weight < .98
      && a.actualToFullRatio > .02 && a.actualToFullRatio < .98 && b.actualToFullRatio > .02
      && b.actualToFullRatio < a.actualToFullRatio - .01;
  }), JSON.stringify({ early, late })]);
  const released = ExpectMorphState("bundleReleased");
  if (released) checks.push(["集束弹完全释放时同骨皮面回到Basis", released.actionStillRunning && released.t >= .6
    && released.geometry.every(c => released.contactWeight[c.side] < .001 && c.weight < 1e-6 && c.currentMaximumM < 1e-8), JSON.stringify(released)]);
  checks.push(["切枪与复用均覆盖武器池", report.morphPool.length === 2, JSON.stringify(report.morphPool)]);
}
if (report.morphExpected.operation) {
  const support = ExpectMorphState("reloadLeftSupport"), held = ExpectMorphState("operationHeld"),
    released = ExpectMorphState("operationReleased"), recovered = ExpectMorphState("operationRecovered");
  if (support) checks.push(["Zb右手换匣时左承托实际修形持续启用", support.action?.kind === "reload"
    && support.contactWeight.r < .001 && support.contactWeight.l > .999
    && support.geometry.every(c => c.side === "l" && c.weight > .999 && c.actualToFullRatio > .98), JSON.stringify(support)]);
  if (held) checks.push(["工作手离枪前真实修形启用", held.geometry.every(c => c.weight > .999 && c.actualToFullRatio > .98), JSON.stringify(held.geometry)]);
  if (released) checks.push(["副手投弹离枪时同骨皮面回到Basis", released.actionStillRunning
    && released.action?.kind === "throw" && released.action.offhand === true && released.contactWeight.l < .001
    && released.geometry.every(c => c.weight < 1e-6 && c.currentMaximumM < 1e-8), JSON.stringify(released)]);
  if (recovered) checks.push(["操作完成后实际皮面重新握持", recovered.actionFinished
    && recovered.geometry.every(c => c.weight > .999 && c.actualToFullRatio > .98), JSON.stringify(recovered.geometry)]);
}
for (const entry of report.morphPool) {
  checks.push([`${entry.label} 当前rig修形不串装备`, entry.activeWeights.every(c =>
    c.weaponId === entry.weapon ? c.weight > .999 : c.weight < 1e-6), JSON.stringify(entry.activeWeights)]);
  if (entry.label === "bundleToZb") checks.push(["Detach清空有形变的旧rig且池权重数组独立",
    entry.before.filter(c => c.weaponId === "GrenadeBundle").every(c => c.weight > .999)
      && entry.oldDetached && entry.oldWeights.every(c => c.weight < 1e-6) && entry.independentInfluences, JSON.stringify(entry)]);
  if (entry.label === "bundleReused") checks.push(["集束弹复用原池对象后重新隔离", entry.reusedSameRig, String(entry.reusedSameRig)]);
}
checks.push(["完整逐枪姿势数据", report.weaponIds.length === expectedIds.length && expectedIds.every((id) => report.weaponIds.includes(id)), `${report.weaponIds.length} 件装备`]);
checks.push(["国军 01 骨骼双臂接入", report.source === "LugouNra01Skeletal" && report.chains === 2
  && report.skinnedMeshes === 1 && report.bones >= 45, `${report.bones} bones / ${report.chains} chains`]);
checks.push(["五类源动作只提供手指基础姿态", ["rifle", "lmg", "pistol", "throwable", "melee"]
  .every((profile) => report.profiles.includes(profile)), report.profiles.join(", ")]);
for (const entry of report.cases) {
  const label = `${entry.weapon} ${entry.state}`;
  if (["ZhongZheng", "HanYang", "Type38", "Grenade", "GrenadeBundle", "Dadao", "Zb26", "Type11"].includes(entry.weapon)) checks.push([`${label} 使用重做的固定骨段裸手`, entry.fixedRestLengths === true, String(entry.fixedRestLengths)]);
  const staticContact = entry.contactWeight.r > 0.99 && entry.contactWeight.l > 0.99;
  if (entry.gripCorrectives.length) checks.push([`${label} 修形使用CPU几何且不占GPU morph槽`,
    entry.gripCorrectives.every(c => c.evaluation === "cpu-attributes" && c.gpuMorphPositionCount === 0 && c.gpuMorphTargetSlots === 0
      && ["position", "normal", "tangent"].every(semantic => c.originalBasisAttributes[semantic] === c.evaluatedVertexCount
        && c.originalMorphAttributes[semantic].targets > 0 && c.originalMorphAttributes[semantic].vertices === c.evaluatedVertexCount)),
    JSON.stringify(entry.gripCorrectives)]);
  for (const corrective of entry.gripCorrectives) {
    if (entry.weapon !== corrective.weaponId || entry.contactWeight[corrective.side] < .001) checks.push([`${label} ${corrective.name} 不泄露到其它握持`,
      corrective.weight < 1e-6, String(corrective.weight)]);
    else if (entry.contactWeight[corrective.side] > .999) checks.push([`${label} ${corrective.name} 使用源工程指腹修形`,
      corrective.weight > .999, String(corrective.weight)]);
  }
  if (["Zb26","Dadao","GrenadeBundle"].includes(entry.weapon)) checks.push([`${label} 装备专用指腹修形齐全`,
    entry.gripCorrectives.filter(c=>c.weaponId===entry.weapon).length === (entry.weapon==="Zb26"?1:2), JSON.stringify(entry.gripCorrectives)]);
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
  if(entry.weapon === "Type11") {
    // The spring follower needs a real hand throughout loading. Finger pads
    // against its mesh are independently checked by FpsHandContactTest.
    checks.push([`${label} 左手扶压弹板或抓握操作柄`, entry.cameraLayerRotation < 1e-8
      && entry.supportWeight < .01 && entry.supportOperation === (entry.t<.84?"hopperFollower":"type11Charge"),
    `operation=${entry.supportOperation} weight=${entry.supportWeight}`]);
  } else checks.push([`${label} 支撑手不随相机轴横飞`, entry.supportTravelM < 0.11
      && entry.cameraLayerRotation < 1e-8 && entry.supportWeight > 0.99,
    `travel=${entry.supportTravelM.toFixed(4)}m cameraRotation=${entry.cameraLayerRotation.toFixed(4)}`]);
  checks.push([`${label} 保留真实取弹动作`, entry.action === "reload" && entry.pivotRotation > 0.01
    && (entry.t !== 0.62 || entry.workingHandTravelM > 0.015),
  `hand=${entry.workingHandTravelM.toFixed(4)}m tilt=${entry.pivotRotation.toFixed(4)}`]);
}
for (const entry of report.reloadMotion) {
  const label = `${entry.weapon} ${entry.adsEntry ? "ADS" : "hip"} reload motion`;
  checks.push([`${label} 连续回手和转腕`, entry.maxHandStepM < 0.055 && entry.maxHandTurnDeg < 20
    && entry.maxGunTurnDeg < 6,
  `hand=${(entry.maxHandStepM * 1000).toFixed(1)}mm at ${entry.handStepAt.toFixed(3)} turn=${entry.maxHandTurnDeg.toFixed(1)}° gun=${entry.maxGunTurnDeg.toFixed(1)}°/frame`]);
  // Cover the entire middle half at 60 Hz, allowing two boundary frames.
  // A shorter authored reload contains fewer frames, not less test coverage.
  const minimumFrames = Math.floor(WEAPONS[entry.weapon].reloadTimeS * 60 * .5)-2;
  checks.push([`${label} 装填发力带动支撑手`, entry.midFrames > minimumFrames && entry.midSupportTravelM > 0.025
    && entry.longestStillS < 0.25,
  `travel=${(entry.midSupportTravelM * 1000).toFixed(1)}mm longest hold=${entry.longestStillS.toFixed(3)}s`]);
}

let failed = 0;
for (const [name, ok, detail] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const failures = checks.filter(([, ok]) => !ok).map(([name, , detail]) => ({ name, detail }));
SaveAcceptance("completed", { failed, failures });
console.log(`\n第一人称骨骼双臂：${checks.length - failed}/${checks.length} 过`);
console.log(`完整报告：${acceptanceFile}`);
if (failures.length) {
  console.error(`\nFpsArmTest 失败摘要（${failures.length}）：`);
  for (const failure of failures) console.error(`FAIL ${failure.name} — ${failure.detail || ""}`);
}
process.exitCode = failed ? 1 : 0;
} catch (error) {
  SaveAcceptance("exception", { exception: error.stack || String(error) });
  console.error(`FAIL FpsArmTest exception — ${error.message}; 完整报告：${acceptanceFile}`);
  throw error;
} finally {
  await browser.close();
  server.close();
}
