// Exercise the real component-library UI and GLB loader. Media stays in _shots.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(projectDir, "_shots", "TrainLibrary");
fs.mkdirSync(outputDir, { recursive: true });
const server = await ServeRoot(path.resolve(projectDir, ".."), 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const requests = [], errors = [], reports = [];
page.on("request", (request) => {
  if (/TrainReference\/Model_.*\.glb/.test(request.url())) requests.push(request.url());
});
page.on("pageerror", (error) => errors.push(error.message));

// 构件库预览 2026-11-25 拆成控制中心里的独立只读页面（AdvancedTools/Tool_PropLibrary.html），不再走游戏编辑器。
const Ready = (selectedId) => page.waitForFunction((key) => window.PropLibrary?.ready && window.PropLibrary.selected === key
  && document.getElementById("view").dataset.state === "ready", selectedId, { timeout: 120000 });

async function SelectModel(label, id) {
  await page.locator(".prop-row").filter({ hasText: label }).click();
  await Ready(`External_${id}`);
  await page.evaluate(() => window.PropLibrary.stage.Settle());
}

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/AdvancedTools/Tool_PropLibrary.html`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.PropLibrary?.ready && document.getElementById("view").dataset.state === "ready", null, { timeout: 120000 });
  await page.locator("#categoryFilter .filter-chip").filter({ hasText: /^模型/ }).click();
  await page.evaluate(() => window.PropLibrary.Select(window.PropLibrary.visible[0]));
  await Ready("Model_ZhongZheng");
  assert.deepEqual(errors, [], "The model category's default TZM must resolve its steel/wood materials");
  assert.equal(requests.length, 0, "Opening the catalog must not preload trains");
  console.log("ok Train GLBs are lazy-loaded, outside the boot payload");

  for (const spec of [
    { id: "trainReferenceLocomotive", label: "蒸汽机车", root: "Model_LocomotiveRoot", wheels: 12, triangles: 78348 },
    { id: "trainReferenceGondola", label: "木制敞车", root: "Model_GondolaRoot", wheels: 4, triangles: 32269 },
  ]) {
    await SelectModel(spec.label, spec.id);
    const report = await page.evaluate(async (spec) => {
      const THREE = await import("three");
      const { CreateTrainRig } = await import("./Model/TrainReference/Script_TrainRig.mjs");
      const { InstantiateExternalProp } = await import("./Script_ExternalProps.mjs");
      const manifest = await (await fetch("./Model/TrainReference/Data_TrainRig.json")).json();
      const library = window.PropLibrary, stage = library.stage, root = stage.model.root;
      const entry = library.entries.find((item) => item.id === library.selected);
      const assetRoot = root.getObjectByName(spec.root);
      const box = new THREE.Box3().setFromObject(root);
      const meshes = [], materials = new Set();
      root.traverse((node) => {
        if (!node.isMesh) return;
        meshes.push(node);
        for (const material of [node.material].flat()) materials.add(material);
      });
      const textured = [...materials].filter((material) => material.map);
      const rig = CreateTrainRig(root, manifest);
      rig.SetTravelMeters(1.37);
      const wheelRecords = manifest.wheels.filter((record) => record.root === spec.root);
      const rollingError = Math.max(...wheelRecords.map((record) => Math.abs(
        root.getObjectByName(record.name).rotation.z + 1.37 / record.radius + record.phase)));
      // A second loader clone must retain its independent rest pose.
      const other = await InstantiateExternalProp(spec.id, stage.library);
      const firstWheel = root.getObjectByName(wheelRecords[0].name);
      const otherWheel = other.getObjectByName(wheelRecords[0].name);
      const isolated = firstWheel !== otherWheel && Math.abs(firstWheel.rotation.z - otherWheel.rotation.z) > 0.1;
      rig.SetTravelMeters(0);
      await stage.Settle();
      const canvasRect = stage.canvas.getBoundingClientRect();
      const screenCorners = [];
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          const projected = new THREE.Vector3(x, y, z).project(stage.camera);
          screenCorners.push(canvasRect.left + (projected.x + 1) * canvasRect.width / 2);
        }
      }
      return {
        id: spec.id, root: !!assetRoot, category: entry.cat,
        meshes: meshes.length,
        triangles: meshes.reduce((sum, mesh) => sum + (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3, 0),
        dimensions: box.getSize(new THREE.Vector3()).toArray(), floor: box.min.y,
        texturedMaterials: textured.length,
        pbrPreserved: textured.length > 0 && textured.every((material) =>
          material.map.colorSpace === THREE.SRGBColorSpace && material.normalMap && material.roughnessMap
          && material.metalnessMap && material.normalMap.colorSpace === THREE.NoColorSpace
          && material.roughnessMap.colorSpace === THREE.NoColorSpace),
        wheels: rig.wheelCount, rods: rig.rodCount, rollingError, isolated,
        source: entry.credit,
        colliders: document.getElementById("propColliders").textContent,
        solid: entry.solid,
        glError: stage.renderer.getContext().getError(),
        clearOfPanel: Math.min(...screenCorners) > canvasRect.left && Math.max(...screenCorners) < canvasRect.right,
      };
    }, spec);
    assert.ok(report.root && report.category === "模型", `${spec.id}: model hierarchy is present`);
    assert.equal(report.triangles, spec.triangles, `${spec.id}: final geometry`);
    assert.equal(report.wheels, spec.wheels, `${spec.id}: all wheel pivots survive loading`);
    assert.ok(report.pbrPreserved, `${spec.id}: native base/normal/ORM and color spaces`);
    assert.ok(report.rollingError < 1e-12 && report.isolated, `${spec.id}: rotation and cache isolation`);
    assert.ok(report.dimensions[0] > 7 && report.dimensions[0] < 18 && Math.abs(report.floor) < 1e-5,
      `${spec.id}: metre scale, +X length and grounded preview`);
    assert.equal(report.glError, 0, `${spec.id}: WebGL renders without errors`);
    assert.ok(report.clearOfPanel, `${spec.id}: the entire model is framed clear of the library panel`);
    // The simplified editor keeps provenance in its catalog and shows collision
    // behaviour in the panel; do not require the retired implementation label.
    assert.ok(report.source.includes("本项目 GLB"), `${spec.id}: catalog retains correct attribution`);
    assert.equal(report.colliders, report.solid ? "运行时按包围盒登记" : "仅视觉", `${spec.id}: catalog collision status`);
    reports.push(report);
    await page.screenshot({ path: path.join(outputDir, `Texture_${spec.root}Library.png`) });
    console.log(`ok ${spec.label}: ${report.triangles} triangles, ${report.wheels} wheels, native PBR, isolated rig`);
  }
  await SelectModel("蒸汽机车", "trainReferenceLocomotive");
  assert.equal(requests.length, 2, "Switching back reuses cached GLBs");
  assert.deepEqual(errors, [], "No uncaught browser errors");
  fs.writeFileSync(path.join(outputDir, "Data_TrainLibraryValidation.json"), JSON.stringify({ reports, requests, errors }, null, 2));
  console.log("PASS TrainLibraryTest: both final models selectable and rendered in the standalone component library");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
