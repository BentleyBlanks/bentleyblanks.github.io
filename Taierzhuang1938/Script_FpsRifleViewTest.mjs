// Reference framing and FOV regression through the actual production viewmodel.
// Targets are measured in the user's 16:9 COD WWII Type 38 reference frame.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const project = path.dirname(fileURLToPath(import.meta.url));
const server = await ServeRoot(path.resolve(project, ".."), 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
const out = path.join(project, "_shots", "FpsRifleView");
await fs.mkdir(out, { recursive: true });
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?weapons=1&shot=1&manual=1&quality=high&scale=small`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang?.state?.ready, null, { timeout: 240000 });
  const report = await page.evaluate(async () => {
    const T = window.Taierzhuang, vm = T.viewmodel, camera = T.camera;
    const THREE = await import("./vendor/three/build/three.module.js");
    const rows = [];
    const Step = (count, state = {}) => {
      for (let i = 0; i < count; i++) vm.Update(1 / 60, {
        ads: 0, sprint: 0, moveSpeed: 0, grounded: true, crouch: 0,
        strafe: 0, lookDeltaYaw: 0, lookDeltaPitch: 0, elapsed: 0, ammo: 5, ...state,
      });
      camera.updateMatrixWorld(true); vm.root.updateWorldMatrix(true, true);
    };
    const Project = point => {
      const p = vm.rig.group.localToWorld(new THREE.Vector3(...point)).project(camera);
      return [(p.x + 1) / 2, (1 - p.y) / 2];
    };
    // Physical landmarks on the rear bolt face, independent of presentation data.
    const landmarks = {
      Type38: { rear: [0, .044, -.073], radius: .014 },
      HanYang: { rear: [-.004, .044, -.075], radius: .012 },
      ZhongZheng: { rear: [0, .035, -.050], radius: .009 },
    };
    vm.SetBayonetFixed(false);
    for (const [weapon, marker] of Object.entries(landmarks)) {
      vm.Equip(weapon, 0, { instant: true });
      for (const fov of [40, 55, 75, 90]) {
        camera.fov = fov; camera.updateProjectionMatrix(); Step(180);
        const left = [...marker.rear], right = [...marker.rear];
        left[0] -= marker.radius; right[0] += marker.radius;
        rows.push({ weapon, state: "hip", fov, muzzle: Project(vm.rig.muzzle.toArray()),
          rear: Project(marker.rear), rearWidth: Math.abs(Project(right)[0] - Project(left)[0]),
          projectionScale: vm.compensation.z / vm.compensation.x,
          gripError: { ...vm.riggedArms.gripError } });
      }
      camera.fov = 55; camera.updateProjectionMatrix(); Step(180);
      camera.fov = 55 * (vm.weapon.adsFovScale ?? .75); camera.updateProjectionMatrix();
      Step(180, { ads: 1 });
      rows.push({ weapon, state: "ads", framingPosition: vm.rifleViewPivot.position.toArray(),
        framingAngle: vm.rifleViewPivot.quaternion.angleTo(new THREE.Quaternion()),
        gripError: { ...vm.riggedArms.gripError } });
      camera.fov = 55; camera.updateProjectionMatrix(); Step(180, { sprint: 1, moveSpeed: 4 });
      rows.push({ weapon, state: "sprint", framingPosition: vm.rifleViewPivot.position.toArray(),
        framingAngle: vm.rifleViewPivot.quaternion.angleTo(new THREE.Quaternion()) });
      Step(180);
      vm.TriggerReload({ remainingRounds: 0 });
      let maximumFeedStep = 0, previous = null;
      const feed = [], feedLocal = vm.rig.group.getObjectByName("feedMouth").position.toArray();
      for (let frame = 0; frame < 600 && vm.action; frame++) {
        Step(1);
        const point = Project(feedLocal);
        if (previous) maximumFeedStep = Math.max(maximumFeedStep, Math.hypot(point[0]-previous[0], point[1]-previous[1]));
        previous = point;
        if (vm.action?.t > .16 && vm.action.t < .82) feed.push(point);
      }
      Step(180);
      rows.push({ weapon, state: "reload", feed, maximumFeedStep,
        returnedRear: Project(marker.rear), completed: !vm.action });
    }
    vm.Equip("Zb26", 0, { instant: true }); Step(180);
    rows.push({ weapon: "Zb26", state: "unaffected", framingPosition: vm.rifleViewPivot.position.toArray(),
      framingAngle: vm.rifleViewPivot.quaternion.angleTo(new THREE.Quaternion()) });
    return rows;
  });
  await fs.writeFile(path.join(out, "Data_FpsRifleView.json"), JSON.stringify({ report, errors }, null, 2));
  for (const weapon of ["Type38", "HanYang", "ZhongZheng"]) {
    const hips = report.filter(row => row.weapon === weapon && row.state === "hip");
    for (const row of hips) {
      assert.ok(row.muzzle[0] > .51 && row.muzzle[0] < .61, `${weapon} muzzle lateral framing`);
      assert.ok(row.muzzle[1] > .44 && row.muzzle[1] < .61, `${weapon} muzzle height`);
      assert.ok(row.rear[0] > .75 && row.rear[0] < .94, `${weapon} receiver should fill lower-right foreground`);
      assert.ok(row.rear[1] > .62 && row.rear[1] < .90, `${weapon} receiver height`);
      assert.ok(row.rearWidth > (weapon === "Type38" ? .075 : .045), `${weapon} receiver visibility`);
      // Perspective matrix prediction, checked against the live geometry projection.
      const expected = Math.tan(52 * Math.PI / 360) / Math.tan(row.fov * Math.PI / 360);
      assert.ok(Math.abs(row.projectionScale - expected) < 1e-9, `${weapon} exact weapon FOV`);
      for (const key of ["muzzle", "rear"]) for (let axis = 0; axis < 2; axis++)
        assert.ok(Math.abs(row[key][axis] - hips[0][key][axis]) < .001, `${weapon} framing must stay stable as world FOV changes`);
    }
  }
  for (const row of report.filter(row => row.state === "reload")) {
    assert.ok(row.completed && row.feed.length > 30, `${row.weapon} complete reload sampled`);
    assert.ok(row.feed.every(([x,y]) => x > .35 && x < .90 && y > .16 && y < .88),
      `${row.weapon} loading port must remain visible during operation`);
    assert.ok(row.maximumFeedStep < .045, `${row.weapon} continuous loading-camera transition`);
    const hip = report.find(sample => sample.weapon === row.weapon && sample.fov === 55);
    assert.ok(Math.hypot(...row.returnedRear.map((v,i) => v-hip.rear[i])) < .002, `${row.weapon} return to hip framing`);
  }
  for (const row of report.filter(row => ["ads", "sprint", "unaffected"].includes(row.state))) {
    assert.ok(Math.hypot(...row.framingPosition) < .0001 && row.framingAngle < .0001,
      `${row.weapon}/${row.state}: hip framing must release completely`);
  }
  assert.deepEqual(errors, []);
  console.log(`ok rifle framing: three rifles, four world FOVs, ADS/sprint release, visible reload ports and other-weapon isolation (${report.length} samples)`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
