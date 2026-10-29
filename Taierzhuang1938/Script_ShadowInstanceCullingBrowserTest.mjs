// Three native directional maps, real PCF/cutouts, scheduled-map and type gates.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
const root = path.resolve(import.meta.dirname, ".."), server = await ServeRoot(root, 0), browser = await LaunchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } }), errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text().slice(0, 900)); });
  await page.route("**/_check_ShadowInstanceCulling.html", (route) => route.fulfill({ contentType: "text/html", body: '<!doctype html><script type="importmap">{"imports":{"three":"./vendor/three/build/three.module.js"}}</script><body></body>' }));
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/_check_ShadowInstanceCulling.html`);
  const report = await page.evaluate(async () => {
    const T = await import("three"), { ShadowInstanceCulling, InstallShadowInstanceCulling } = await import("./Script_ShadowInstanceCulling.mjs"), { AttachShadowDepth } = await import("./Script_ShadowDepth.mjs"), { StaticInstanceCulling } = await import("./Script_StaticInstanceCulling.mjs");
    const renderer = new T.WebGLRenderer({ antialias: false }); renderer.setSize(320, 240, false); renderer.shadowMap.enabled = true; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.type = T.PCFShadowMap; document.body.appendChild(renderer.domElement);
    const scene = new T.Scene(); scene.background = new T.Color(.04, .04, .04); scene.add(new T.AmbientLight(0xffffff, .1));
    const lights = [[0, 20, 2], [10, 18, -2], [-9, 16, 4]].map((position, i) => {
      const light = new T.DirectionalLight(0xffffff, .6); light.position.set(...position); light.target.position.set(0, 0, -8); light.castShadow = true;
      light.shadow.mapSize.set(256, 256); light.shadow.autoUpdate = false; Object.assign(light.shadow.camera, { left: -11 - i, right: 11 + i, top: 11 + i, bottom: -11 - i, near: .1, far: 80 });
      light.shadow.camera.updateProjectionMatrix(); scene.add(light, light.target); return light;
    });
    const ground = new T.Mesh(new T.PlaneGeometry(70, 70), new T.MeshStandardMaterial({ color: 0xbebebe, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.z = -8; ground.receiveShadow = true; scene.add(ground);
    const geometry = new T.BoxGeometry(2, 4, 2), material = new T.MeshStandardMaterial({ color: 0x8f6849, roughness: 1, side: T.DoubleSide });
    const source = new T.InstancedMesh(geometry, material, 8), matrix = new T.Matrix4(); source.count = 5; source.castShadow = true; source.frustumCulled = false; source.position.x = .3; source.rotation.y = .04; AttachShadowDepth(source); scene.add(source);
    const SetInstance = (i, x, z = -8) => source.setMatrixAt(i, matrix.makeTranslation(x, 2, z));
    [0, 4, -4, 40, -40].forEach((x, i) => { SetInstance(i, x); source.setColorAt(i, new T.Color(.8 + i * .02, .7, .6)); }); source.instanceMatrix.needsUpdate = true; source.instanceColor.needsUpdate = true;
    const camera = new T.PerspectiveCamera(48, 4 / 3, .1, 100); camera.position.set(15, 22, 27); camera.lookAt(0, 0, -8);
    const culler = new ShadowInstanceCulling({ minTriangles: 0, maxInstances: 8 }); InstallShadowInstanceCulling(renderer, culler);
    let shadowTriangles = 0, shadowCalls = 0, nativeCalls = 0;
    const original = renderer.shadowMap.render;
    renderer.shadowMap.render = function(...args) {
      const before = renderer.info.render.triangles, calls = renderer.info.render.calls; nativeCalls += 1;
      try { return original.apply(this, args); } finally { shadowTriangles = renderer.info.render.triangles - before; shadowCalls = renderer.info.render.calls - calls; }
    };
    const output = new T.WebGLRenderTarget(320, 240), depthOutput = new T.WebGLRenderTarget(256, 256), packScene = new T.Scene(), packCamera = new T.Camera();
    const packMaterial = new T.ShaderMaterial({ uniforms: { depthMap: { value: null } }, depthTest: false, depthWrite: false,
      vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
      fragmentShader: "#include <packing>\nuniform sampler2D depthMap;varying vec2 vUv;void main(){gl_FragColor=packDepthToRGBA(texture2D(depthMap,vUv).r);}" }); packScene.add(new T.Mesh(new T.PlaneGeometry(2, 2), packMaterial));
    const ReadMap = (light) => {
      const gl = renderer.getContext(), texture = light.shadow.map.depthTexture, handle = renderer.properties.get(texture).__webglTexture, compare = texture.compareFunction !== null;
      const Sampling = (restore) => { const bound = gl.getParameter(gl.TEXTURE_BINDING_2D); gl.bindTexture(gl.TEXTURE_2D, handle); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, restore && compare ? gl.COMPARE_REF_TO_TEXTURE : gl.NONE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, restore && compare ? gl.LINEAR : gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, restore && compare ? gl.LINEAR : gl.NEAREST); gl.bindTexture(gl.TEXTURE_2D, bound); };
      Sampling(false); packMaterial.uniforms.depthMap.value = texture; renderer.setRenderTarget(depthOutput); renderer.render(packScene, packCamera); Sampling(true);
      const pixels = new Uint8Array(256 * 256 * 4); renderer.readRenderTargetPixels(depthOutput, 0, 0, 256, 256, pixels); return pixels;
    };
    const Read = (scheduled = [true, true, true]) => {
      lights.forEach((light, i) => { light.shadow.needsUpdate = scheduled[i]; }); renderer.shadowMap.needsUpdate = true;
      renderer.setRenderTarget(output); renderer.render(scene, camera);
      const image = new Uint8Array(320 * 240 * 4); renderer.readRenderTargetPixels(output, 0, 0, 320, 240, image);
      const triangles = shadowTriangles, calls = shadowCalls, stats = structuredClone(culler.lastRender), pending = lights.map((light) => light.shadow.needsUpdate), globalPending = renderer.shadowMap.needsUpdate;
      const depths = lights.map(ReadMap); return { image, depths, triangles, calls, stats, pending, globalPending };
    };
    const Diff = (a, b) => a.reduce((sum, value, i) => sum + (value !== b[i] ? 1 : 0), 0), cases = [];
    const Snapshot = () => JSON.stringify({ matrix: Array.from(source.instanceMatrix.array), color: Array.from(source.instanceColor.array), count: source.count, matrixVersion: source.instanceMatrix.version, colorVersion: source.instanceColor.version, world: source.matrixWorld.elements, visible: source.visible, cast: source.castShadow });
    let normalScope = null;
    const Case = (label, scheduled = [true, true, true]) => {
      scene.updateMatrixWorld(true); const before = Snapshot(); culler.bypass = true; const native = Read(scheduled); culler.bypass = false;
      const restoreNormal = normalScope?.Begin(scene, camera); let compact;
      try { compact = Read(scheduled); } finally { restoreNormal?.(); }
      cases.push({ label, depthDiffs: native.depths.map((depth, i) => Diff(depth, compact.depths[i])), pcfDiff: Diff(native.image, compact.image), nativeTriangles: native.triangles, compactTriangles: compact.triangles, nativeCalls: native.calls, compactCalls: compact.calls, stats: compact.stats, normalStats: normalScope ? { ...normalScope.stats } : null, pending: compact.pending, globalPending: compact.globalPending, scheduled, unchanged: before === Snapshot(), restored: source.visible && !culler.root.visible, depthUnique: native.depths.map((depth) => new Set(depth).size) });
      return compact;
    };
    Case("threeDirections");
    const pixels = new Uint8Array([255, 255, 255, 255, 255, 255, 255, 0, 255, 255, 255, 0, 255, 255, 255, 255]), alpha = new T.DataTexture(pixels, 2, 2, T.RGBAFormat); alpha.needsUpdate = true; alpha.magFilter = T.NearestFilter; alpha.minFilter = T.NearestFilter; material.map = alpha; material.alphaTest = .5; material.needsUpdate = true; source.customDepthMaterial.needsUpdate = true;
    Case("cutout"); material.side = T.FrontSide; material.shadowSide = null; material.needsUpdate = true; source.customDepthMaterial.needsUpdate = true; Case("nativeBackSide");
    material.side = T.BackSide; material.shadowSide = T.FrontSide; material.needsUpdate = true; source.customDepthMaterial.needsUpdate = true; Case("explicitFrontSide");
    material.side = T.DoubleSide; material.shadowSide = null; material.needsUpdate = true; source.customDepthMaterial.needsUpdate = true;
    SetInstance(0, 30); SetInstance(3, 1, -6); source.instanceMatrix.needsUpdate = true; Case("instanceMatrixMutation");
    source.count = 4; source.position.x = -1; source.updateMatrixWorld(true); Case("countAndWorld");
    source.geometry = new T.BoxGeometry(2.5, 4, 2); Case("geometryReplacement");
    lights[1].shadow.camera.setViewOffset(2, 2, .15, .2, 1.4, 1.25); Case("croppedCascade");
    const beforeSchedule = lights.map(ReadMap); const only = Case("oneScheduledCascade", [false, true, false]);
    const unscheduledDiffs = [0, 2].map((i) => Diff(beforeSchedule[i], only.depths[i]));
    Case("twoScheduledCascades", [true, false, true]);
    // Warm native type transitions must stay one whole call so ALL existing
    // maps are recreated. The following steady pass then resumes compaction.
    const transitions = [];
    for (const type of [T.BasicShadowMap, T.PCFShadowMap]) {
      const before = lights.map((light) => light.shadow.map); renderer.shadowMap.type = type; culler.bypass = false; const changed = Read();
      transitions.push({ type, recreated: lights.map((light, i) => light.shadow.map !== before[i]), scopes: changed.stats.lights.length, samplers: lights.map((light) => light.shadow.map.depthTexture.compareFunction) });
      Case(type === T.BasicShadowMap ? "steadyBasicAfterTransition" : "steadyPcfAfterTransition");
    }
    source.count = 5; SetInstance(4, 9); source.instanceMatrix.needsUpdate = true; source.userData.staticPropBatch = true; source.instanceMatrix.setUsage(T.StaticDrawUsage);
    camera.fov = 20; camera.updateProjectionMatrix();
    normalScope = new StaticInstanceCulling(renderer, { tuning: { enabled: true, minTriangles: 0, maxInstances: 8, maxObjects: 64 } });
    Case("normalScopeRestoresOffscreenShadowCasters"); normalScope.Dispose(); normalScope = null;
    const visibleShadow = cases[0].depthUnique.every((count) => count > 8);
    source.removeFromParent(); Read(); const staleRecords = culler.records.size, gl = renderer.getContext().getError(); culler.Dispose();
    const sharedAlive = geometry.attributes.position.count === 24 && material.map === alpha; renderer.dispose();
    return { cases, transitions, unscheduledDiffs, visibleShadow, staleRecords, sharedAlive, gl, nativeCalls };
  });
  const out = path.join(root, "tmp", "ShadowInstanceCulling"); await fs.mkdir(out, { recursive: true }); await fs.writeFile(path.join(out, "Data_Report.json"), JSON.stringify({ ...report, errors }, null, 2));
  for (const test of report.cases) {
    assert.deepEqual(test.depthDiffs, [0, 0, 0], `${test.label}: every native directional map must match byte-for-byte`); assert.equal(test.pcfDiff, 0, `${test.label}: native PCF receiver output must match`);
    assert.ok(test.nativeTriangles > test.compactTriangles, `${test.label}: actual scheduled shadow triangles must decrease`);
    assert.equal(test.stats.lights.length, test.scheduled.filter(Boolean).length); assert.deepEqual(test.pending, [false, false, false]); assert.equal(test.globalPending, false); assert.ok(test.unchanged && test.restored);
  }
  for (const transition of report.transitions) { assert.ok(transition.recreated.every(Boolean)); assert.equal(transition.scopes, 0); }
  assert.ok(report.cases.find((test) => test.normalStats)?.normalStats.culledInstances > 0, "combined normal scope must actually exclude source instances from the main view");
  assert.deepEqual(report.unscheduledDiffs, [0, 0]); assert.ok(report.visibleShadow && report.sharedAlive); assert.equal(report.staleRecords, 0); assert.equal(report.gl, 0); assert.deepEqual(errors, []);
  console.log("PASS ShadowInstanceCullingBrowserTest", JSON.stringify({ cases: report.cases.length, depthDifferences: 0, pcfDifferences: 0, transitions: report.transitions.length, triangles: report.cases.map((test) => [test.label, test.nativeTriangles, test.compactTriangles]), gl: report.gl }));
} finally { await browser.close(); server.close(); }
