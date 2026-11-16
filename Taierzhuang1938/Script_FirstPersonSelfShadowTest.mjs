// Exercise the production decoder and filter on the GPU. Shader compilation
// alone cannot catch a mismatch between packed-depth channel conventions.
import assert from "node:assert/strict";
import path from "node:path";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const server = await ServeRoot(path.resolve(import.meta.dirname, ".."), 0);
const browser = await LaunchBrowser();
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const base = `http://127.0.0.1:${server.address().port}/Taierzhuang1938/`;
  await page.goto(base + "vendor/three/package.json");
  await page.setContent(`<script type="importmap">${JSON.stringify({ imports: { three: base + "vendor/three/build/three.module.js" } })}</script>`);
  const result = await page.evaluate(async base => {
    const THREE = await import("three");
    const { FirstPersonSelfShadow } = await import(base + "Script_FirstPersonSelfShadow.mjs");
    const { ApplyPatches, MakePatch } = await import(base + "Script_MaterialPatches.mjs");
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(256, 256);
    const scene = new THREE.Scene(), root = new THREE.Group(); scene.add(root);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 3; camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
    const mode = { value: 0 }, material = new THREE.MeshStandardMaterial();
    ApplyPatches(material, [MakePatch({ key: "shadowGpuEvidence", uniforms: u => { u.uEvidenceMode = mode; },
      fragment: [["#include <common>", "uniform float uEvidenceMode;"],
        ["#include <dithering_fragment>", `
          float evidence = FirstPersonSelfShadow();
          if (uEvidenceMode > 0.5) evidence = FirstPersonPackedDepth(vec2(gl_FragCoord.x / 8.0, 0.5));
          gl_FragColor = vec4(vec3(evidence), 1.0);`]] })]);
    const receiver = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material); root.add(receiver);
    const caster = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.1), new THREE.MeshStandardMaterial());
    caster.position.set(0, 0, 0.2); root.add(caster);
    const shadow = new FirstPersonSelfShadow(renderer, scene, camera, root); shadow.SetEnabled(true);
    const target = new THREE.WebGLRenderTarget(256, 256), sun = new THREE.Vector3(0, 0, 1);
    const bytes = new Uint8Array(256 * 256 * 4), rows = [];
    for (const soft of [false, true]) {
      shadow.SetSoft(soft);
      for (const slope of [0, 0.6]) {
        receiver.rotation.x = slope; caster.visible = false; scene.updateMatrixWorld(true);
        shadow.Render(sun, 1 / 60);
        renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, camera);
        renderer.readRenderTargetPixels(target, 0, 0, 256, 256, bytes);
        let lit = 0, count = 0;
        for (let y = 48; y < 208; y++) for (let x = 48; x < 208; x++) {
          count++; if (bytes[(y * 256 + x) * 4] >= 250) lit++;
        }
        rows.push({ soft, slope, litFraction: lit / count });
      }
      receiver.rotation.x = 0; caster.visible = true; scene.updateMatrixWorld(true);
      shadow.Render(sun, 1 / 60); caster.visible = false;
      renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, 256, 256, bytes);
      rows.push({ soft, contact: bytes[(128 * 256 + 128) * 4] / 255,
        outside: bytes[(60 * 256 + 60) * 4] / 255 });
    }
    const penumbrae = [];
    target.setSize(1024, 256);
    const edgeBytes = new Uint8Array(1024 * 256 * 4);
    caster.scale.z = 0.1;
    for (const height of [0.01, 0.5]) {
      caster.position.z = height; caster.visible = true; scene.updateMatrixWorld(true);
      shadow.Render(sun, 1 / 60); caster.visible = false;
      renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, 1024, 256, edgeBytes);
      let partial = 0;
      for (let x = 256; x < 768; x++) {
        const factor = edgeBytes[(128 * 1024 + x) * 4] / 255;
        if (factor > 0.24 && factor < 0.98) partial++;
      }
      const previous = edgeBytes.slice();
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, 1024, 256, edgeBytes);
      penumbrae.push({ height, partial, stable: edgeBytes.every((value, index) => value === previous[index]) });
    }
    const depths = [0, 0.1, 0.25, 0.37, 0.5, 0.71, 0.9, 1];
    const packed = new THREE.WebGLRenderTarget(8, 1), encodedScene = new THREE.Scene();
    const encoder = new THREE.ShaderMaterial({ uniforms: { uDepths: { value: depths } },
      vertexShader: "void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: `#include <packing>
        uniform float uDepths[8];
        void main() { gl_FragColor = packDepthToRGBA(uDepths[int(gl_FragCoord.x)]); }` });
    encodedScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), encoder));
    renderer.setRenderTarget(packed); renderer.render(encodedScene, camera);
    shadow.uniforms.map.value = packed.texture; mode.value = 1; target.setSize(8, 1);
    renderer.setRenderTarget(target); renderer.render(scene, camera);
    const decoded = new Uint8Array(8 * 4);
    renderer.readRenderTargetPixels(target, 0, 0, 8, 1, decoded);
    const roundTrip = depths.map((expected, index) => ({ expected, actual: decoded[index * 4] / 255 }));
    const gl = renderer.getContext().getError();
    shadow.Dispose(); target.dispose(); packed.dispose(); encoder.dispose(); renderer.dispose();
    return { rows, roundTrip, penumbrae, gl };
  }, base);
  assert.deepEqual(errors, []);
  for (const row of result.roundTrip) assert(Math.abs(row.expected - row.actual) < 1 / 255 + 1e-6, JSON.stringify(row));
  for (const row of result.rows) {
    if (row.litFraction !== undefined) assert(row.litFraction > 0.995, `unoccluded receiver must stay lit ${JSON.stringify(row)}`);
    else assert(Math.abs(row.contact - 0.22) < 0.02 && row.outside > 0.98, `contact footprint ${JSON.stringify(row)}`);
  }
  assert(result.penumbrae[1].partial > result.penumbrae[0].partial, `contact hardening ${JSON.stringify(result.penumbrae)}`);
  assert(result.penumbrae.every(row => row.stable), "static shadows must remain pixel-stable");
  assert.equal(result.gl, 0); assert.deepEqual(errors, []);
  console.log("ok first-person shadow depth round trip, sloped acne rejection and contact shadows " + JSON.stringify(result));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
