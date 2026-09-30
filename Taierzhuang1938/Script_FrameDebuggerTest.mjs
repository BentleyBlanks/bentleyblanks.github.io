// GPU regression: real draw events, temporal/MRT replay, instancing, query
// ownership, resource/hook restoration, and the actual game's editor popup.
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { LaunchBrowser } from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import { ServeRoot } from './Script_DevServer.mjs';

const quality = process.argv.find(arg => arg.startsWith('--quality='))?.slice(10) || 'whitebox';
const samples = Number(process.argv.find(arg => arg.startsWith('--samples='))?.slice(10) || 0);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'tmp', 'FrameDebugger'); await fs.mkdir(output, { recursive: true });
const external = process.argv.find(arg => arg.startsWith('--url='))?.slice(6);
const server = external ? null : await ServeRoot(root, 0);
const base = external || `http://127.0.0.1:${server.address().port}`;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const errors = [];
if (process.argv.includes('--trace')) page.on('console', msg => { if (msg.type() === 'warning') console.log(msg.text().slice(0, 700)); });
page.on('pageerror', error => errors.push(String(error)));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text().slice(0, 500)); });
try {
  // Same-origin blank page. A 404 lands on Chrome's error page, whose late
  // navigation races setContent ("Execution context was destroyed").
  await page.route(`${base}/__frameDebuggerBlank`, route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
  await page.goto(`${base}/__frameDebuggerBlank`, { waitUntil: 'load' });
  await page.setContent(`<html><head><script type="importmap">{"imports":{"three":"${base}/Taierzhuang1938/vendor/three/build/three.module.js"}}</script></head><body></body></html>`);
  const result = await page.evaluate(async ({ base, samples }) => {
    const THREE = await import('three');
    const { FrameDebugger } = await import(`${base}/Taierzhuang1938/Script_FrameDebugger.mjs`);
    const { FrameProfiler } = await import(`${base}/Taierzhuang1938/Script_Profiler.mjs`);
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(128, 96); document.body.append(renderer.domElement);
    const gl = renderer.getContext();
    const original = { draw: gl.drawElements, render: renderer.renderBufferDirect, target: renderer.setRenderTarget };
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-2, 2, 1.5, -1.5, 0.1, 10); camera.position.z = 3;
    const target = new THREE.WebGLRenderTarget(128, 96, { count: 2, samples, type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(128, 96) });
    target.textures[0].name = 'TestColor'; target.textures[1].name = 'TestMrt';
    const MakeMaterial = color => new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: { tint: { value: new THREE.Color(color) }, palette: { value: [new THREE.Vector3(1, 2, 3), new THREE.Vector3(4, 5, 6)] } },
      vertexShader: '#include <batching_pars_vertex>\nvoid main(){\n#include <batching_vertex>\nvec4 p=vec4(position,1.);\n#ifdef USE_BATCHING\np=batchingMatrix*p;\n#endif\n#ifdef USE_INSTANCING\np=instanceMatrix*p;\n#endif\ngl_Position=projectionMatrix*modelViewMatrix*p;}',
      fragmentShader: 'uniform vec3 tint;uniform vec3 palette[2];layout(location=0) out vec4 a;layout(location=1) out vec4 b;void main(){a=vec4(tint+palette[0]*.00001+palette[1]*.00002,1.);b=vec4(vec3(1.)-tint,1.);}' });
    const geometry = new THREE.PlaneGeometry(2.4, 2.4);
    const left = new THREE.Mesh(geometry, MakeMaterial(0xff4030)); left.position.x = -0.6; left.name = 'Left red'; scene.add(left);
    const right = new THREE.Mesh(geometry, MakeMaterial(0x2080ff)); right.position.x = 0.6; right.position.z = 0.1; right.name = 'Right blue'; scene.add(right);
    const tiny = new THREE.PlaneGeometry(0.3, 0.3), matrix = new THREE.Matrix4();
    const instances = new THREE.InstancedMesh(tiny, MakeMaterial(0x40ff80), 2); instances.name = 'Instances';
    instances.setMatrixAt(0, matrix.makeTranslation(-1, 1, 0.3)); instances.setMatrixAt(1, matrix.makeTranslation(1, 1, 0.3)); scene.add(instances);
    const batch = new THREE.BatchedMesh(4, 32, 48, MakeMaterial(0xffdd20)); batch.name = 'Multi draw batch';
    const geom = batch.addGeometry(tiny);
    batch.setMatrixAt(batch.addInstance(geom), matrix.makeTranslation(-1, -1, 0.3));
    batch.setMatrixAt(batch.addInstance(geom), matrix.makeTranslation(1, -1, 0.3)); scene.add(batch);
    // Unnamed transparent mesh under a named group: exercises ancestor naming
    // and the DrawOpaqueObjects / DrawTransparentObjects split.
    const effects = new THREE.Group(); effects.name = 'Effects'; scene.add(effects);
    const fadeMaterial = MakeMaterial(0x808080); fadeMaterial.transparent = true;
    const fade = new THREE.Mesh(geometry, fadeMaterial); fade.position.z = 0.5; effects.add(fade);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(4, 3)), quadScene = new THREE.Scene(); quadScene.add(quad);
    const idleTarget = new THREE.WebGLRenderTarget(16, 16);
    const contact = { name: 'contact', composeMaterial: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      Idle() { quad.material = this.composeMaterial; renderer.setRenderTarget(idleTarget); renderer.render(quadScene, camera); }, Render() {} };
    const outputScene = new THREE.Scene();
    const outputMaterial = new THREE.MeshBasicMaterial({ map: target.textures[0], depthTest: false, depthWrite: false });
    outputScene.add(new THREE.Mesh(new THREE.PlaneGeometry(4, 3), outputMaterial));
    const post = { targets: { normalDepth: target }, blitter: { mesh: quad }, passes: [
      { name: 'main', Render() { renderer.setRenderTarget(target); renderer.render(scene, camera); } },
      contact,
      { name: 'output', Render() { renderer.setRenderTarget(null); renderer.render(outputScene, camera); } },
    ] };
    const Render = () => post.passes.forEach(pass => pass === contact ? pass.Idle() : pass.Render());
    const PixelHash = bytes => { let h = 2166136261; for (const byte of bytes) h = Math.imul(h ^ byte, 16777619); return h >>> 0; };
    const Screen = () => { const pixels = new Uint8Array(128 * 96 * 4); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 128, 96, gl.RGBA, gl.UNSIGNED_BYTE, pixels); return PixelHash(pixels); };
    Render(); const baseline = Screen();
    const profiler = new FrameProfiler(renderer, { post, scene }); profiler.Enable();
    const debug = new FrameDebugger(renderer, { post, profiler });
    debug.RequestCapture(); debug.BeginRender(); Render(); const beforeReplay = Screen(); debug.EndRender();
    const captured = Screen();
    const info = debug.Inspect();
    const first = info.events.find(event => event.draw && event.details?.object === 'Left red').index;
    const last = info.events.length - 1;
    const organized = {
      real: info.passes.filter(pass => !pass.synthetic).map(pass => pass.name),
      mainChildren: info.passes.filter(pass => pass.parent === info.passes.find(row => row.name === 'main').id).map(pass => pass.name),
      loose: info.events.filter(event => event.pass == null).length,
      fade: info.events.find(event => event.details?.objectId === fade.id)?.label,
      fadePath: info.events.find(event => event.details?.objectId === fade.id)?.path,
      idle: info.events.filter(event => event.path === 'contact.Idle' && event.draw).map(event => `${event.kind}|${event.label}`),
      clear: info.events.find(event => event.kind === 'Clear')?.label,
      named: info.events.find(event => event.details?.object === 'Left red')?.label,
    };
    const outputDraw = info.events.findLast(event => event.draw);
    const sampled = debug.TexturePreview(outputDraw.index, outputDraw.textures.findIndex(texture => texture.name === 'TestColor'), { width: 32 });
    const sampledLit = sampled.pixels.some((value, i) => i % 4 !== 3 && value > 0);
    const a = debug.Preview(first, 0, { width: 128 });
    const b = debug.Preview(last, 0, { width: 128 });
    const c = debug.Preview(first, 0, { width: 128 });
    const mrt = debug.Preview(first, 1, { width: 128 });
    const depth = debug.Preview(first, 2, { width: 128 });
    for (let i = 0; i < 100 && debug.capture.gpuStatus === 'pending'; i++) { await new Promise(resolve => setTimeout(resolve, 20)); debug.Poll(); }
    const timing = debug.Inspect();
    const profilerPaused = !profiler.recording;
    debug.Resume(); Render(); const resumed = Screen();
    const profilerResumed = profiler.recording;
    const multi = info.events.find(event => event.drawInfo?.batch), instanced = info.events.find(event => event.api === 'drawElementsInstanced');
    debug._timer = null; debug.RequestCapture(); debug.BeginRender(); Render(); debug.EndRender();
    const unsupported = debug.Inspect(); debug.Resume();
    const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    let disjoint = null;
    if (timer) {
      debug._timer = timer; debug.RequestCapture(); debug.BeginRender(); Render();
      const getParameter = gl.getParameter;
      gl.getParameter = function (key) { return key === timer.GPU_DISJOINT_EXT ? true : getParameter.call(gl, key); };
      debug.EndRender(); disjoint = debug.Inspect(); gl.getParameter = getParameter; debug.Resume();
    }
    debug.RequestCapture(); debug.BeginRender(); Render(); debug.EndRender();
    debug.Present(debug.Preview(last));
    const presented = !!document.querySelector('#frameDebuggerGameView');
    renderer.setSize(128, 96);
    const resizeReleased = debug.state === 'idle' && !document.querySelector('#frameDebuggerGameView') && debug._copies.length === 0;
    debug.RequestCapture(); debug.BeginRender(); debug._Budget = () => { throw new Error('Injected budget rejection'); }; Render(); debug.EndRender();
    const rejected = debug.state === 'error' && debug._hooks.length === 0 && debug._copies.length === 0;
    profiler.Disable();
    const restored = original.draw === gl.drawElements && original.render === renderer.renderBufferDirect && original.target === renderer.setRenderTarget;
    const glError = gl.getError(); debug.Dispose(); renderer.dispose();
    return { baseline, captured, beforeReplay, resumed, restored, glError, events: info.events.length, draws: info.events.filter(event => event.draw).length,
      multiDraw: multi?.drawInfo, hasMultiDraw: !!gl.getExtension('WEBGL_multi_draw'), instanced: instanced?.drawInfo,
      unsupported: { status: unsupported.gpuStatus, total: unsupported.gpuMs },
      disjoint: disjoint ? { status: disjoint.gpuStatus, total: disjoint.gpuMs } : null, rejected, profilerPaused, profilerResumed, presented, resizeReleased,
      passes: info.passes.map(pass => pass.name), organized, sampledLit, sampledSize: [sampled.width, sampled.height],
      groupTiming: timing.passes.filter(pass => pass.synthetic).map(pass => pass.gpuMs), firstHash: PixelHash(a.pixels), lastHash: PixelHash(b.pixels), repeatedHash: PixelHash(c.pixels),
      mrtHash: PixelHash(mrt.pixels), depthRange: [Math.min(...depth.pixels), Math.max(...depth.pixels)],
      timing: { status: timing.gpuStatus, total: timing.gpuMs, values: timing.events.map(event => event.gpuMs) },
      uniforms: info.events[first].uniforms.length, uniformArray: info.events[first].uniforms.find(uniform => uniform.name === 'palette[0]')?.value, programSources: info.programs.length };
  }, { base, samples });
  console.log(JSON.stringify(result, null, 2));
  assert.equal(result.glError, 0, 'capture and reverse replay must not create GL errors');
  assert.equal(result.baseline, result.captured, 'capture changes pixels');
  assert.equal(result.beforeReplay, result.captured, 'timing replay must preserve the captured pixels');
  assert.equal(result.baseline, result.resumed, 'resume changes pixels');
  assert.equal(result.firstHash, result.repeatedHash, 'backward replay is not deterministic');
  assert.notEqual(result.firstHash, result.lastHash, 'stepping must change the image');
  assert.notEqual(result.firstHash, result.mrtHash, 'MRT attachment selection must change the image');
  assert.ok(result.draws >= 5); assert.ok(result.restored); assert.ok(result.uniforms > 0);
  assert.deepEqual(result.uniformArray, [[1, 2, 3], [4, 5, 6]], 'uniform arrays must include every element');
  if (result.hasMultiDraw) assert.equal(result.multiDraw.subDraws, 2);
  assert.equal(result.instanced.parts[0].instances, 2);
  assert.deepEqual(result.unsupported, { status: 'unavailable', total: null });
  if (result.disjoint) assert.deepEqual(result.disjoint, { status: 'disjoint', total: null });
  assert.ok(result.rejected && result.profilerPaused && result.profilerResumed);
  assert.ok(result.presented && result.resizeReleased, 'resource mutation must release the capture and synchronized game preview');
  assert.deepEqual(result.organized.real, ['main', 'contact.Idle', 'output'], 'Idle draws get their own scope; empty hooks leave no node');
  assert.deepEqual(result.organized.mainChildren, ['DrawOpaqueObjects', 'DrawTransparentObjects']);
  assert.equal(result.organized.loose, 0, 'every event belongs to a group');
  assert.equal(result.organized.fade, 'Effects › PlaneGeometry');
  assert.equal(result.organized.fadePath, 'main/DrawTransparentObjects');
  assert.deepEqual(result.organized.idle, ['Draw Fullscreen|contact.composeMaterial']);
  assert.match(result.organized.clear, /^\((Color|Depth|Stencil)( (Depth|Stencil))*\)$/);
  assert.equal(result.organized.named, 'Left red');
  assert.ok(result.sampledLit, 'a sampled texture must read back as the draw sees it');
  assert.deepEqual(result.sampledSize, [32, 24]);
  if (result.timing.status === 'ready') assert.ok(result.groupTiming.every(value => Number.isFinite(value) && value >= 0), 'synthetic groups must receive GPU time');
  if (result.timing.status === 'ready') assert.ok(result.timing.values.every(value => Number.isFinite(value) && value >= 0));
  else assert.equal(result.timing.total, null, 'unsupported GPU timing must never report zero');
  if (!process.argv.includes('--core-only')) {
    if (process.argv.includes('--bundle')) {
      const { BuildBrowserBundle } = await import('./Script_BuildBrowserBundle.mjs');
      const bundle = await BuildBrowserBundle();
      await page.route('**/Taierzhuang1938/?*', route => route.fulfill({ contentType: 'text/html', body: bundle.html }));
      await page.route('**/Script_BrowserBundle.mjs?*', route => route.fulfill({ contentType: 'text/javascript', body: bundle.code }));
      console.log('Production bundle', bundle.version, bundle.inputs);
    }
    await page.goto(`${base}/Taierzhuang1938/?shot=1&manual=1&whitebox=p012&quality=${quality}&scale=small`, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction(() => window.Tengxian?.editor, null, { timeout: 300000 });
    await page.evaluate(async () => { await Tengxian.Debug.FirstLevelJump(3); Tengxian.StepFrames(4); Tengxian.editor.ToggleOverlay('frameDebugger'); });
    const popup = page.context().pages().find(candidate => candidate !== page);
    assert.ok(popup, 'Frame Debugger must open from the existing editor');
    popup.on('pageerror', error => errors.push(String(error)));
    popup.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text().slice(0, 500)); });
    await page.evaluate(() => {
      const d = Tengxian.FrameDebugger, end = d.EndRender.bind(d), gl = Tengxian.renderer.getContext();
      const Screen = () => {
        const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
        const previous = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previous);
        let hash = 2166136261; for (const byte of pixels) hash = Math.imul(hash ^ byte, 16777619); return hash >>> 0;
      };
      d.EndRender = (...args) => { const before = Screen(); end(...args); window.FrameDebuggerPixelCheck = { before, after: Screen() }; };
    });
    await popup.locator('#capture').click();
    await page.evaluate(() => Tengxian.StepFrames(1));
    await popup.waitForFunction(() => document.querySelector('#events [data-event]'), null, { timeout: 60000 });
    const actual = await page.evaluate(() => { const d = Tengxian.FrameDebugger; const elapsed = Tengxian.state.elapsed; Tengxian.StepFrames(3); return { state: d.state, error: d.error, events: d.capture?.events.length, frozenClock: elapsed === Tengxian.state.elapsed }; });
    console.log('Game', JSON.stringify(actual)); assert.equal(actual.state, 'frozen'); assert.ok(actual.frozenClock); assert.ok(actual.events > 0);
    const pixelCheck = await page.evaluate(() => window.FrameDebuggerPixelCheck);
    console.log('Game pixel replay', JSON.stringify(pixelCheck)); assert.equal(pixelCheck.before, pixelCheck.after);
    await page.waitForFunction(() => Tengxian.FrameDebugger.capture.gpuStatus !== 'pending', null, { timeout: 20000 });
    assert.ok(await page.locator('#frameDebuggerGameView').isVisible(), 'selected event output must appear in the game view');
    await page.screenshot({ path: path.join(output, 'FrameDebugger_Synchronized.png'), fullPage: true });
    await popup.screenshot({ path: path.join(output, 'FrameDebugger_Game.png'), fullPage: true });
    const firstDraw = await page.evaluate(() => Tengxian.FrameDebugger._events.find(event => event.draw)?.index);
    await popup.locator('#index').fill(String(firstDraw + 1)); await popup.locator('#index').press('Enter');
    await popup.locator('#view').selectOption('mesh');
    await popup.screenshot({ path: path.join(output, 'FrameDebugger_Mesh.png'), fullPage: true });
    assert.equal(await popup.locator('#previewError').textContent(), '');
    await popup.locator('#resume').click();
    assert.equal(await page.evaluate(() => Tengxian.FrameDebugger.state), 'idle');
    assert.equal(await page.locator('#frameDebuggerGameView').count(), 0);
    const editorReleased = await page.evaluate(() => {
      const d = Tengxian.FrameDebugger;
      Tengxian.StepFrames(2); d.RequestCapture(); Tengxian.StepFrames(1);
      const frozen = d.frozen; Tengxian.editor.Open('graphics');
      const released = d.state === 'idle' && d._copies.length === 0;
      Tengxian.editor.Close(); Tengxian.editor.CloseOverlay('frameDebugger');
      return frozen && released;
    });
    assert.ok(editorReleased, 'switching editors must release captured GPU resources before editing');
  }
  assert.deepEqual(errors, [], 'browser errors');
  console.log('FrameDebuggerTest PASS');
} finally { await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }
