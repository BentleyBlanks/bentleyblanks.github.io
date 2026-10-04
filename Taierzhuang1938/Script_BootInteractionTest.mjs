// Real loading-page input, plus worker byte parity and drag cancellation recovery.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "tmp/BootPaper");
await fs.mkdir(output, { recursive: true });
const server = await ServeRoot(root, 0);
const browser = await LaunchBrowser();
const base = `http://127.0.0.1:${server.address().port}/Taierzhuang1938/`;
const errors = [];
const Percentile = (values, q) => values.toSorted((a, b) => a - b)[Math.floor((values.length - 1) * q)];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on("pageerror", error => errors.push(String(error)));
  const html = await fs.readFile(path.join(import.meta.dirname, "index.html"), "utf8");
  await page.route("**/_check_BootInteraction.html", route => route.fulfill({
    contentType: "text/html", body: `${html.match(/<script type="importmap">[\s\S]*?<\/script>/)[0]}
      <div id="wrap"><img id="paper"></div>`,
  }));
  await page.goto(base + "_check_BootInteraction.html");
  const fixture = await page.evaluate(async () => {
    const { MaterialLibrary } = await import("./Script_Materials.mjs");
    const { BootPaper } = await import("./Script_BootPaper.mjs");
    const Make = () => new MaterialLibrary(null, { textureSize: 128,
      shading: { detailNormalMap: { value: null }, skinLut: { value: null } } });
    const sync = Make(), asyncLibrary = Make();
    const names = ["WoodDoor", "ClothNra", "SteelHelmet"];
    const expected = [...sync.PrepareSteps(names)];
    const actual = [];
    let ticks = 0;
    const timer = setInterval(() => ticks++, 8);
    try { for await (const name of asyncLibrary.PrepareStepsAsync(names)) actual.push(name); }
    finally { clearInterval(timer); }
    const EqualTexture = (a, b) => {
      const x = a.image.data, y = b.image.data;
      return x.length === y.length && x.every((value, i) => value === y[i])
        && ["colorSpace", "flipY", "wrapS", "wrapT", "generateMipmaps", "minFilter", "magFilter"]
          .every(key => a[key] === b[key]);
    };
    const same = names.every(name => ["albedo", "normal", "orm"].every(channel =>
      EqualTexture(sync.baked.get(name)[channel], asyncLibrary.baked.get(name)[channel])))
      && ["detailNormalMap", "skinLut"].every(key => EqualTexture(sync.shading[key].value, asyncLibrary.shading[key].value));
    const { TextureBaker } = await import("./Script_TextureBaker.mjs");
    const NativeWorker = window.Worker;
    window.Worker = class { constructor() { throw new Error("fixture: worker unavailable"); } };
    const recovery = new TextureBaker();
    let recovered;
    try { recovered = await recovery.Bake("ClothNra", 128); }
    finally { recovery.Dispose(); window.Worker = NativeWorker; }
    const recoverySame = recovered.albedo.every((value, i) => value === sync.baked.get("ClothNra").albedo.image.data[i]);
    const wrap = document.querySelector("#wrap");
    const paper = new BootPaper({ img: document.querySelector("#paper"), wrap });
    const releases = [];
    for (const kind of ["pointerup", "pointercancel", "lostpointercapture", "outside", "blur", "hidden", "hide", "dispose"]) {
      paper.shown = true;
      wrap.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 7, button: 0 }));
      let resolved = false;
      const waiting = paper.WaitForIdle().then(() => { resolved = true; });
      await Promise.resolve();
      if (resolved) throw new Error("Drag did not hold loading");
      if (kind === "blur") window.dispatchEvent(new Event("blur"));
      else if (kind === "outside") window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 7 }));
      else if (kind === "hidden") {
        Object.defineProperty(document, "hidden", { configurable: true, value: true });
        document.dispatchEvent(new Event("visibilitychange"));
        delete document.hidden;
      }
      else if (kind === "hide") paper.Hide();
      else if (kind === "dispose") paper.Dispose();
      else wrap.dispatchEvent(new PointerEvent(kind, { pointerId: 7 }));
      await waiting;
      releases.push(resolved && paper.pointerId === null && !wrap.classList.contains("dragging"));
    }
    return { expected, actual, same, ticks, recoverySame, releases };
  });
  assert.deepEqual(fixture.actual, fixture.expected, "async baking preserves step order");
  assert.ok(fixture.same && fixture.recoverySame, "worker and recovery preserve every texture byte and sampler setting");
  assert.ok(fixture.ticks >= 3, "UI task queue runs while the worker bakes");
  assert.ok(fixture.releases.every(Boolean), "all drag termination paths release loading");
  console.log("PASS worker parity, UI heartbeat, recovery and drag lifecycle", fixture.ticks);

  await page.addInitScript(() => {
    window.bootProbe = { frames: [], inputs: [] };
    let last = null;
    const Frame = time => {
      if (document.querySelector("#bootPaperWrap.dragging")) {
        if (last !== null) window.bootProbe.frames.push(time - last);
        last = time;
      } else last = null;
      requestAnimationFrame(Frame);
    };
    requestAnimationFrame(Frame);
    addEventListener("pointermove", event => {
      if (document.querySelector("#bootPaperWrap.dragging")) window.bootProbe.inputs.push(performance.now() - event.timeStamp);
    });
  });
  await page.goto(base, { waitUntil: "commit" });
  await page.waitForFunction(() => document.querySelector("#bootPaper.on"), null, { timeout: 60000 });
  const reports = [];
  for (const stage of ["bake", "scene", "shaders"]) {
    await page.waitForFunction(stage => {
      const text = document.querySelector("#bootStep")?.textContent || "";
      return stage === "bake" ? text.includes("烘贴图") : stage === "scene" ? /东关|城内院落/.test(text) : /着色器|预热材质/.test(text);
    }, stage, { timeout: 120000, polling: "raf" });
    const bounds = await page.locator("#bootPaperWrap").boundingBox();
    const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    assert.ok(await page.locator("#bootPaperWrap").evaluate(el => el.classList.contains("dragging")), `${stage}: real pointer captured`);
    await page.evaluate(() => { window.bootProbe.frames = []; window.bootProbe.inputs = []; });
    for (let i = 0; i < 45; i++) {
      await page.mouse.move(x + Math.sin(i * 0.1) * 110, y + Math.cos(i * 0.1) * 60);
      await new Promise(resolve => setTimeout(resolve, 16));
    }
    const result = await page.evaluate(() => ({ ...window.bootProbe,
      dragging: document.querySelector("#bootPaperWrap").classList.contains("dragging"),
      yaw: document.querySelector("#bootPaperWrap").style.getPropertyValue("--bootPaperYaw"),
      loading: document.querySelector("#bootStart").disabled }));
    await page.screenshot({ path: path.join(output, `Drag_${stage}.png`) });
    await page.mouse.up();
    assert.ok(result.dragging && result.loading && Math.abs(parseFloat(result.yaw)) > 1, `${stage}: paper actually tilts during loading`);
    assert.ok(result.frames.length >= 20 && result.inputs.length >= 40, `${stage}: sufficient real input and frame samples`);
    const report = { stage, frames: result.frames.length, frameP95: Percentile(result.frames, .95),
      inputP95: Percentile(result.inputs, .95), inputMax: Math.max(...result.inputs), frameMax: Math.max(...result.frames) };
    reports.push(report);
    assert.ok(report.frameP95 < 34 && report.inputP95 < 34, `${stage}: 30 fps drag budget ${JSON.stringify(report)}`);
    console.log("PASS loading drag", JSON.stringify(report));
  }
  await page.waitForFunction(() => window.Tengxian?.state.ready && !document.querySelector("#bootStart").disabled,
    null, { timeout: 180000 });
  assert.deepEqual(errors, [], "no page errors");
  await fs.writeFile(path.join(output, "InteractionReport.json"), JSON.stringify({ fixture, reports }, null, 2));
  console.log("PASS loading resumes and reaches ready");
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
