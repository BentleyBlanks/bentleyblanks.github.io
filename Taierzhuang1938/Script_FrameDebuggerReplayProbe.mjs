// Frame Debugger replay-fidelity probe (docs/Data_FrameDebugger.md, 回放保真度).
// Loads the real game like FrameDebuggerTest (editor window → its capture
// button), then captures more frames. For every capture it compares the live
// backbuffer with the one after EndRender's timing replay. While capturing, each
// render target's output is copied GPU-side (blit, no readPixels stall) when the
// draw target switches (and every --every=K events); on a mismatch the first copy
// that differs from Replay() of the same event is reported with a pixel diff.
// It also reports texture uploads whose texture was sampled earlier in the frame
// (the replay starts with end-of-frame texture contents).
//
//   node Taierzhuang1938/Script_FrameDebuggerReplayProbe.mjs --runs=3 --captures=4
//     --every=4              finer snapshots          --snapshots=none  hashes only
//     --angle=swiftshader    deterministic software GPU (bit-reproducible)
//     --plain=30             no Frame Debugger: re-render the frozen scene for 30 s
//                            and print when the float output changes
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LaunchBrowser } from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import { ServeRoot } from './Script_DevServer.mjs';

const Arg = (name, fallback) => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const runs = Number(Arg('runs', 3)), captures = Number(Arg('captures', 4)), quality = Arg('quality', 'whitebox'), step = Number(Arg('step', 3));
const snapshots = Arg('snapshots', 'gpu'), every = Number(Arg('every', 0)), angle = Arg('angle', ''), plain = Number(Arg('plain', 0));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await ServeRoot(root, 0);
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await LaunchBrowser({ extraArgs: angle ? [`--use-angle=${angle}`, '--enable-unsafe-swiftshader'] : [] });
let failures = 0, total = 0;
try {
  for (let run = 0; run < runs; run++) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    page.on('pageerror', error => console.log('pageerror', String(error)));
    await page.goto(`${base}/Taierzhuang1938/?shot=1&manual=1&whitebox=p012&quality=${quality}&scale=small`, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction(() => window.Tengxian?.editor, null, { timeout: 300000 });
    if (plain) {
      const timeline = await page.evaluate(async ({ step, seconds }) => {
        await Tengxian.Debug.FirstLevelJump(step); Tengxian.StepFrames(4);
        const THREE = await import(new URL('/Taierzhuang1938/vendor/three/build/three.module.js', location.href).href);
        const renderer = Tengxian.renderer, gl = renderer.getContext(), width = 1100, height = 760;
        const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType });
        const data = new Float32Array(width * height * 4), ids = new Map(), changes = [];
        const start = performance.now(); let previous = null, renders = 0;
        while (performance.now() - start < seconds * 1000) {
          renderer.setRenderTarget(target); renderer.render(Tengxian.scene, Tengxian.camera);
          gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, data); renderer.setRenderTarget(null); renders++;
          let hash = 2166136261; for (const byte of new Uint8Array(data.buffer)) hash = Math.imul(hash ^ byte, 16777619);
          if (!ids.has(hash)) ids.set(hash, String.fromCharCode(65 + ids.size));
          if (ids.get(hash) !== previous) { previous = ids.get(hash); changes.push(`${Math.round(performance.now() - start)}ms:${previous}`); }
          await new Promise(resolve => setTimeout(resolve, 30));
        }
        return `${renders} renders, ${ids.size} distinct: ${changes.join(' ')}`;
      }, { step, seconds: plain });
      total++; if (!timeline.includes(' 1 distinct')) failures++;
      console.log(`run ${run} plain`, timeline);
      await page.context().close();
      continue;
    }
    await page.evaluate(async step => { await Tengxian.Debug.FirstLevelJump(step); Tengxian.StepFrames(4); Tengxian.editor.ToggleOverlay('frameDebugger'); }, step);
    const popup = page.context().pages().find(candidate => candidate !== page);
    await page.evaluate(async ({ base, snapshots, every }) => {
      const { ReadOutput, CopyAttachment, SaveGlState } = await import(`${base}/Taierzhuang1938/Script_FrameDebugGl.mjs`);
      const d = Tengxian.FrameDebugger, gl = Tengxian.renderer.getContext();
      const EVENT = /^(drawArrays|drawElements|drawRangeElements)(Instanced)?$|^multiDraw|^clear$|^clearBuffer|^blitFramebuffer$|^copyTex|^generateMipmap$/;
      const BINDINGS = { [gl.TEXTURE_2D]: gl.TEXTURE_BINDING_2D, [gl.TEXTURE_2D_ARRAY]: gl.TEXTURE_BINDING_2D_ARRAY, [gl.TEXTURE_3D]: gl.TEXTURE_BINDING_3D, [gl.TEXTURE_CUBE_MAP]: gl.TEXTURE_BINDING_CUBE_MAP };
      const Hash = bytes => { let h = 2166136261; for (const byte of bytes) h = Math.imul(h ^ byte, 16777619); return h >>> 0; };
      const Screen = () => {
        const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
        const previous = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previous);
        return Hash(pixels);
      };
      const Attachment = event => event._target.attachments.find(row => !row.stencil);
      let copies = [], uploads = [];
      const Snapshot = event => {
        const a = Attachment(event); if (!a || copies.at(-1)?.index === event.index) return;
        const single = { ...a, samples: 0 };
        const copy = d._Inspect(() => { const restore = SaveGlState(gl); try { return CopyAttachment(gl, event._target.framebuffer, single); } finally { restore(); } });
        copies.push({ index: event.index, copy, attachment: { ...single, point: a.depth ? a.point : gl.COLOR_ATTACHMENT0, sourcePoint: a.depth ? a.point : gl.COLOR_ATTACHMENT0 } });
      };
      const call = d._Call;
      d._Call = function (name, original, args, receiver) {
        if (this.state === 'capturing' && !this._mute) {
          if (/^(tex(Sub)?Image|copyTex|compressedTex|generateMipmap)/.test(name)) {
            const target = args[0] >= gl.TEXTURE_CUBE_MAP_POSITIVE_X && args[0] <= gl.TEXTURE_CUBE_MAP_NEGATIVE_Z ? gl.TEXTURE_CUBE_MAP : args[0];
            uploads.push({ name, texture: gl.getParameter(BINDINGS[target]), events: this._events.length, command: this._commands.length });
          }
          if (snapshots === 'gpu' && EVENT.test(name)) {
            const previous = this._events.at(-1);
            if (previous && (previous._target.framebuffer !== gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) || every && previous.index % every === 0)) Snapshot(previous);
          }
        }
        return call.call(this, name, original, args, receiver);
      };
      const end = d.EndRender;
      d.EndRender = function (...args) {
        if (this.state !== 'capturing') return end.apply(this, args);
        if (snapshots === 'gpu' && this._events.length) Snapshot(this._events.at(-1));
        const before = Screen();
        const sampledBeforeUpload = uploads.filter(upload => this._events.some(event => event.index < upload.events && event._textureHandles?.includes(upload.texture)))
          .map(upload => `${upload.name}@cmd${upload.command}`);
        uploads = [];
        end.apply(this, args);
        const report = { before, after: Screen(), events: this._events?.length, state: this.state, error: this.error, sampledBeforeUpload };
        if (this.frozen && report.before !== report.after) {
          report.snapshots = copies.length;
          for (const [slot, { index, copy, attachment }] of copies.entries()) {
            const event = this._events[index];
            const live = ReadOutput(gl, copy.framebuffer, attachment, { width: 4096 });
            this.Replay(index);
            const replayed = ReadOutput(gl, event._target.framebuffer, Attachment(event), { width: 4096 });
            if (Hash(live.pixels) === Hash(replayed.pixels)) continue;
            const diff = { pixels: 0, maxDelta: 0, box: [Infinity, Infinity, -1, -1], samples: [] };
            for (let p = 0; p < live.pixels.length; p += 4) {
              let delta = 0; for (let c = 0; c < 4; c++) delta = Math.max(delta, Math.abs(live.pixels[p + c] - replayed.pixels[p + c]));
              if (!delta) continue;
              const x = (p / 4) % live.width, y = Math.floor(p / 4 / live.width);
              diff.pixels++; diff.maxDelta = Math.max(diff.maxDelta, delta);
              diff.box = [Math.min(diff.box[0], x), Math.min(diff.box[1], y), Math.max(diff.box[2], x), Math.max(diff.box[3], y)];
              if (diff.samples.length < 4) diff.samples.push([x, y, [...live.pixels.slice(p, p + 4)], [...replayed.pixels.slice(p, p + 4)]]);
            }
            const from = copies[slot - 1]?.index ?? -1;
            report.diverged = { index, previousMatch: from, target: event.target, diff,
              events: this._events.slice(from + 1, index + 1).map(row => `${row.index} ${row.kind} ${row.label} [${row.shaderName || row.details?.material || ''}]`) };
            break;
          }
        }
        for (const { copy } of copies) d._Inspect(() => copy.Dispose());
        copies = [];
        window.ProbeReports.push(report);
      };
      window.ProbeReports = [];
    }, { base, snapshots, every });
    const Record = (label, report) => { total++; if (report?.before !== report?.after) failures++; console.log(`run ${run} ${label}`, JSON.stringify(report)); };
    if (popup) {
      await popup.locator('#capture').click();
      Record('editor', await page.evaluate(() => { Tengxian.StepFrames(1); return ProbeReports.at(-1); }));
      await page.evaluate(() => { Tengxian.FrameDebugger.Resume(); Tengxian.StepFrames(1); });
    } else console.log('no editor window');
    for (let i = 0; i < captures; i++) Record(i, await page.evaluate(frames => {
      const d = Tengxian.FrameDebugger;
      d.RequestCapture(); Tengxian.StepFrames(1);
      const report = ProbeReports.at(-1); d.Resume(); Tengxian.StepFrames(frames);
      return report;
    }, 1 + (i % 3)));
    await page.context().close();
  }
  console.log(`ReplayProbe ${failures}/${total} mismatches`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
process.exitCode = failures ? 1 : 0;
