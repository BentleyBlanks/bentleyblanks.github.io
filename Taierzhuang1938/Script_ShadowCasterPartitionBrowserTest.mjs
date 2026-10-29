// Isolated native shadow depth A/B: local chunks versus the same whole batch,
// plus independent source meshes. No game assets, frame timing, or screenshots.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const root = path.resolve(import.meta.dirname, ".."), out = path.join(root, "tmp", "ShadowCasterPartition");
await fs.mkdir(out, { recursive: true });
await fs.writeFile(path.join(out, "Index.html"), `<!doctype html><meta charset="utf-8"><script type="importmap">{"imports":{"three":"/Taierzhuang1938/vendor/three/build/three.module.js"}}</script><canvas></canvas>`);
const server = await ServeRoot(root, 0), browser = await LaunchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } }), errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text().slice(0, 900)); });
  await page.goto(`http://127.0.0.1:${server.address().port}/tmp/ShadowCasterPartition/Index.html`, { waitUntil: "domcontentloaded" });
  const report = await page.evaluate(async () => {
    const T = await import("three");
    const { ShadowCasterBatch, InstallShadowCasterBatch } = await import("/Taierzhuang1938/Script_ShadowCasterBatch.mjs");
    const { ApplyPatches, MakeDestructionPatch } = await import("/Taierzhuang1938/Script_MaterialPatches.mjs");
    const { CloneShadedMaterial } = await import("/Taierzhuang1938/Script_Materials.mjs");
    const { MakeDestructionUniforms } = await import("/Taierzhuang1938/Script_Destruction.mjs");
    const renderer = new T.WebGLRenderer({ canvas: document.querySelector("canvas"), antialias: false });
    renderer.setSize(320, 180, false); renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.BasicShadowMap;
    renderer.debug.checkShaderErrors = true;
    const scene = new T.Scene(), camera = new T.PerspectiveCamera(60, 320 / 180, .1, 500);
    camera.position.set(2000, 50, 80); camera.lookAt(2000, 0, 0);
    const material = new T.MeshBasicMaterial(), geometry = new T.BoxGeometry(192, .5, 192, 48, 1, 48);
    const roof = new T.Mesh(geometry, material); roof.castShadow = true;
    roof.position.set(2000, 12, 0); roof.rotation.set(.015, .173, -.021); roof.scale.set(1.03, 1.2, .97); scene.add(roof);
    const damage = MakeDestructionUniforms(1); damage.count.value = 1;
    damage.centers.value[0].set(2000, 12, 0, 1); damage.halves.value[0].set(14, 8, 10, 0); damage.metas.value[0].set(1, 0, 0, 0);
    const depth = new T.MeshDepthMaterial(); ApplyPatches(depth, [MakeDestructionPatch(damage)]);
    const tuning = { enabled: true, settleFrames: 30, cooldownFrames: 240, rescanFrames: 60, joinBudgetMs: 1.5,
      minInstanceCapacity: 1, minVertexCapacity: 1, reserveScale: 1, localChunkSize: 48, localChunkMinTriangles: 1024 };
    const batch = new ShadowCasterBatch(scene, { tuning, cloneDepthMaterial: CloneShadedMaterial });
    batch.DisposeWarmProxy(batch.WarmProxy([depth])); InstallShadowCasterBatch(renderer, batch);
    // Basic native shadows keep comparison disabled, so a regular texture fetch
    // copies the actual hardware depth into RGBA32F without quantizing it to bytes.
    const target = new T.WebGLRenderTarget(256, 256, { type: T.FloatType, format: T.RGBAFormat, minFilter: T.NearestFilter, magFilter: T.NearestFilter, depthBuffer: false });
    const copyMaterial = new T.ShaderMaterial({ uniforms: { map: { value: null } }, depthTest: false, depthWrite: false,
      vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
      fragmentShader: "uniform sampler2D map;varying vec2 vUv;void main(){float d=texture2D(map,vUv).r;gl_FragColor=vec4(d,d,d,1.);}" });
    const copyScene = new T.Scene(), copyCamera = new T.Camera(); copyScene.add(new T.Mesh(new T.PlaneGeometry(2, 2), copyMaterial));
    const Read = (light) => {
      renderer.setRenderTarget(null); renderer.render(scene, camera);
      copyMaterial.uniforms.map.value = light.shadow.map.depthTexture;
      renderer.setRenderTarget(target); renderer.render(copyScene, copyCamera);
      const data = new Float32Array(256 * 256 * 4); renderer.readRenderTargetPixels(target, 0, 0, 256, 256, data);
      renderer.setRenderTarget(null); return data;
    };
    const Compare = (a, b) => {
      let changed = 0, maxDelta = 0, coverageChanged = 0, covered = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (a[i] !== b[i]) changed += 1;
        maxDelta = Math.max(maxDelta, Math.abs(a[i] - b[i]));
        if ((a[i] < 1) !== (b[i] < 1)) coverageChanged += 1;
        if (a[i] < 1) covered += 1;
      }
      return { changed, maxDelta, coverageChanged, covered };
    };
    const cases = [];
    for (const kind of ["orthographic", "perspective", "orthographic-edge"]) {
      const orthographic = kind.startsWith("orthographic"), edge = kind.endsWith("edge");
      damage.centers.value[0].set(edge ? 2070 : 2000, 12, edge ? 70 : 0, 1);
      const light = orthographic ? new T.DirectionalLight() : new T.SpotLight(0xffffff, 1, 300, .9);
      light.position.set(edge ? 2081 : 2011, 110, edge ? 91 : 21); light.target.position.set(edge ? 2070 : 2000, 0, edge ? 70 : 0); scene.add(light, light.target); light.castShadow = true;
      light.shadow.mapSize.set(256, 256); light.shadow.camera.near = 1; light.shadow.camera.far = 300;
      if (orthographic) { const extent = edge ? 50 : 115; Object.assign(light.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent }); }
      light.shadow.camera.updateProjectionMatrix();
      for (const mode of ["front", "back", "double", "hole"]) {
        material.side = mode === "back" ? T.BackSide : mode === "double" || mode === "hole" ? T.DoubleSide : T.FrontSide;
        material.shadowSide = mode === "back" ? T.FrontSide : null; material.needsUpdate = true;
        roof.customDepthMaterial = mode === "hole" ? depth : undefined;
        batch.SetEnabled(false); tuning.localChunkSize = 0; batch.SetEnabled(true); scene.updateMatrixWorld(); batch.Prime();
        const whole = Read(light), wholeIds = batch.records.get(roof).instanceIds.length;
        batch.SetEnabled(false); tuning.localChunkSize = 48; batch.SetEnabled(true); scene.updateMatrixWorld(); batch.Prime();
        const chunks = Read(light), chunkIds = batch.records.get(roof).instanceIds.length;
        batch.bypass = true; const source = Read(light); batch.bypass = false;
        const identity = Compare(chunks, whole), sourceComparison = Compare(chunks, source), baselineSourceComparison = Compare(whole, source);
        let filled = null;
        if (mode === "hole") { damage.count.value = 0; filled = Compare(Read(light), chunks); damage.count.value = 1; }
        const group = batch.records.get(roof).group;
        group.mesh.onBeforeShadow(renderer, null, camera, light.shadow.camera, group.mesh.geometry, group.mesh.customDepthMaterial);
        const submittedIndices = Array.from(group.mesh._multiDrawCounts).slice(0, group.mesh._multiDrawCount).reduce((sum, count) => sum + count, 0);
        cases.push({ kind, mode, wholeIds, chunkIds, identity, sourceComparison, baselineSourceComparison, submittedIndices, originalIndices: geometry.index.count, filled });
      }
      light.removeFromParent(); light.target.removeFromParent(); light.dispose();
    }
    const gl = renderer.getContext().getError(); batch.Dispose(); target.dispose(); copyMaterial.dispose(); geometry.dispose(); material.dispose(); depth.dispose(); renderer.dispose();
    return { cases, gl };
  });
  await fs.writeFile(path.join(out, "Data_Report.json"), JSON.stringify({ ...report, errors }, null, 2));
  assert.deepEqual(errors, []); assert.equal(report.gl, 0);
  for (const test of report.cases) {
    const label = `${test.kind}/${test.mode}`;
    assert.equal(test.wholeIds, 1, label); assert.ok(test.chunkIds > 1, label);
    assert.ok(test.identity.covered > 1000 && test.identity.covered < 256 * 256, `${label}: native depth must contain roof and clear pixels`);
    assert.equal(test.identity.changed, 0, `${label}: partition depth must match the whole batch exactly`);
    // Source Mesh uses CPU-composed modelViewMatrix; batching composes model /
    // view in GLSL. The pre-existing rounding remains exactly the same as the
    // whole-batch baseline, including thin roof-edge slopes at world x=2000.
    assert.equal(test.sourceComparison.coverageChanged, 0, `${label}: standalone coverage must match`);
    assert.deepEqual(test.sourceComparison, test.baselineSourceComparison, `${label}: standalone difference must be identical to the existing whole batch`);
    if (test.kind.endsWith("edge")) assert.ok(test.submittedIndices > 0 && test.submittedIndices < test.originalIndices, `${label}: exact native depth while rejecting out-of-frustum chunks`);
    if (test.filled) assert.ok(test.filled.changed > 200, `${label}: live shared damage uniforms must actually open the hole`);
  }
  console.log("PASS ShadowCasterPartitionBrowserTest", JSON.stringify({ cases: report.cases.length,
    changedDepthPixels: report.cases.reduce((sum, test) => sum + test.identity.changed, 0),
    edgeSubmittedIndices: report.cases.find((test) => test.kind.endsWith("edge")).submittedIndices,
    sourceIndices: report.cases[0].originalIndices, gl: report.gl, report: path.join(out, "Data_Report.json") }));
} finally { await browser.close(); server.close(); }
