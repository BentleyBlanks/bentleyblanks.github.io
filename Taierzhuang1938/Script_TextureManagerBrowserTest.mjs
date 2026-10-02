import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import sharp from "sharp";
import { HandleTextureImportRequest } from "./Script_TextureImportServer.mjs";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
const here = import.meta.dirname, root = path.dirname(here), temp = await fs.mkdtemp(path.join(os.tmpdir(), "TengxianTextureUi-"));
const out = path.join(here, "_shots", "TextureManager"); await fs.mkdir(out, { recursive: true });
await fs.mkdir(path.join(temp, "Taierzhuang1938"));
await fs.cp(path.join(here, "Texture"), path.join(temp, "Taierzhuang1938", "Texture"), { recursive: true });
await fs.writeFile(path.join(temp, "Taierzhuang1938", "Data_TextureImportSettings.json"), '{"version":1,"textures":{}}\n');
const mime = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg" };
const server = http.createServer(async (req, res) => {
  if (req.url.startsWith("/__textures/")) return HandleTextureImportRequest(req, res, temp);
  const name = decodeURIComponent(req.url.split("?")[0]), file = path.resolve(root, "." + name);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try { const data = await fs.readFile(file); res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" }).end(data); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`, browser = await LaunchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 940 } }), errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.goto(`${origin}/Taierzhuang1938/TextureManager.html`);
  await page.waitForFunction(() => document.querySelectorAll(".asset").length > 250 && document.querySelector("canvas"));
  assert.equal(await page.locator("#list .asset").count(), 267);
  await page.locator("#maxSize").selectOption("128");
  await page.locator("#format").selectOption("webp-lossless");
  await page.locator("#mipmaps").selectOption("false");
  await page.locator("#preview").click();
  await page.waitForFunction(() => document.querySelectorAll(".preview-card").length === 2, null, { timeout: 60000 });
  assert.match(await page.locator("#result").textContent(), /128 × 128/);
  await page.screenshot({ path: path.join(out, "Image_FileImport.png") });
  await page.locator("#save").click(); await page.waitForFunction(() => document.querySelector("#status").textContent.includes("已保存到仓库"));
  const saved = JSON.parse(await fs.readFile(path.join(temp, "Taierzhuang1938", "Data_TextureImportSettings.json"), "utf8"));
  assert.equal(saved.textures["Texture_WeaponSteelV2Base.webp"].maxSize, 128);
  assert.equal(saved.textures["Texture_WeaponSteelV2Base.webp"].mipmaps, false);
  await page.reload(); await page.waitForFunction(() => document.querySelector("#maxSize").value === "128");
  await page.locator("#format").selectOption("ktx2-uastc");
  await page.locator("#mipmaps").selectOption("true");
  await page.locator("#preview").click();
  await page.waitForFunction(() => document.querySelectorAll(".preview-card").length === 2, null, { timeout: 60000 });
  assert.match(await page.locator("#result").textContent(), /ktx2-uastc/);
  assert.match(await page.locator(".caption").last().textContent(), /8 层 mip/);
  await page.screenshot({ path: path.join(out, "Image_GpuImport.png") });
  await page.locator("#procedural").click();
  assert.equal(await page.locator("#list .asset").count(), 52);
  await page.waitForFunction(() => document.querySelectorAll(".preview-card").length === 3, null, { timeout: 60000 });
  assert.equal(await page.locator("#settings").isVisible(), false);
  await page.locator("#channel").selectOption("a");
  await page.screenshot({ path: path.join(out, "Image_ProceduralPreview.png") });
  await page.locator('[data-name="SkinLut"]').click();
  await page.waitForFunction(() => document.querySelector("canvas")?.width === 128 && document.querySelector("canvas")?.height === 32);
  const state = await (await fetch(origin + "/__textures/status")).json();
  const conflict = await fetch(origin + "/__textures/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document: state.document, revision: "stale" }) });
  assert.equal(conflict.status, 409);
  const foreign = await fetch(origin + "/__textures/save", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://other.invalid" }, body: JSON.stringify({ document: state.document, revision: state.revision }) });
  assert.equal(foreign.status, 400);
  // Exercise the production loading path with a real published lookup table:
  // dynamically constructed URLs, both UV conventions, and GPU mip settings.
  const file = "Texture_WeaponSteelV2Base.webp";
  const Encode = async format => (await fetch(origin + "/__textures/preview", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file, settings: { maxSize: 64, format, quality: 100, mipmaps: false } }) })).json();
  const gpu = await Encode("ktx2-uastc"), png = await Encode("png");
  assert.ok(gpu.filename && png.filename);
  const ormFile = "Texture_WoodCrateOrm.webp";
  const ormSource = path.join(temp, "Taierzhuang1938", "Texture", ormFile);
  const EncodeOrm = async green => {
    await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 255, g: green, b: 0, alpha: 1 } } })
      .webp({ lossless: true }).toFile(ormSource);
    return (await fetch(origin + "/__textures/preview", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: ormFile, settings: { maxSize: 64, format: "ktx2-uastc", quality: 100, mipmaps: true } }) })).json();
  };
  const dryOrm = await EncodeOrm(224), wetOrm = await EncodeOrm(40);
  assert.ok(dryOrm.filename && wetOrm.filename);
  const probe = await browser.newPage();
  const entry = { ...gpu, output: gpu.filename }, ormEntry = { ...dryOrm, output: dryOrm.filename };
  const table = { [file]: entry, [gpu.filename]: entry, [ormFile]: ormEntry, [dryOrm.filename]: ormEntry };
  await probe.route("**/Data_TextureImportRuntime.mjs*", route => route.fulfill({ contentType: "text/javascript", body: `export const TEXTURE_IMPORT_RUNTIME = ${JSON.stringify(table)};` }));
  await probe.route("**/Texture/*_Import*", async route => { const name = new URL(route.request().url()).pathname.split("/").at(-1);
    await route.fulfill({ contentType: "image/ktx2", body: await fs.readFile(path.join(temp, "tmp", "TextureImportPreview", name)) }); });
  await probe.route("**/TextureProbe.html", route => route.fulfill({ contentType: "text/html", body: '<script type="importmap">{"imports":{"three":"./vendor/three/build/three.module.js"}}</script>' }));
  await probe.goto(origin + "/Taierzhuang1938/TextureProbe.html");
  const runtime = await probe.evaluate(async ({ file, reference, ormFile, wetUrl }) => {
    const THREE = await import("three"), { MaterialLibrary } = await import("./Script_Materials.mjs");
    const { SetTextureImportRenderer, ManagedTextureLoader } = await import("./Script_TextureImports.mjs");
    const renderer = new THREE.WebGLRenderer(); SetTextureImportRenderer(renderer);
    const library = new MaterialLibrary(renderer), target = new THREE.WebGLRenderTarget(64, 64);
    target.texture.colorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2); camera.position.z = 1;
    const geometry = new THREE.PlaneGeometry(2, 2), material = new THREE.MeshBasicMaterial({ toneMapped: false }); scene.add(new THREE.Mesh(geometry, material));
    const Render = texture => { material.map = texture; material.needsUpdate = true; renderer.setRenderTarget(target); renderer.render(scene, camera); const bytes = new Uint8Array(64 * 64 * 4); renderer.readRenderTargetPixels(target, 0, 0, 64, 64, bytes); return bytes; };
    const MeanError = (a, b) => a.reduce((n, value, i) => n + Math.abs(value - b[i]), 0) / a.length;
    const original = await new THREE.TextureLoader().loadAsync(reference); original.colorSpace = THREE.SRGBColorSpace;
    const expected = Render(original), texture = await library._LoadExternalImage(`./Texture/${file}?v=dynamic`, true, 30000, true);
    const regular = await new ManagedTextureLoader().loadAsync(`./Texture/${file}`);
    const result = { compressed: texture.isCompressedTexture, size: texture.image.width, mips: texture.mipmaps.length,
      minFilter: texture.minFilter, linearFilter: THREE.LinearFilter, error: MeanError(expected, Render(texture)), managedError: MeanError(expected, Render(regular)) };
    original.flipY = false; original.needsUpdate = true;
    const noFlipExpected = Render(original), noFlip = await library._LoadExternalImage(`./Texture/${file}`, true, 30000, false);
    const noFlipLoader = await new ManagedTextureLoader(undefined, { flipY: false }).loadAsync(`./Texture/${file}`);
    result.noFlipError = MeanError(noFlipExpected, Render(noFlip)); result.noFlipLoaderError = MeanError(noFlipExpected, Render(noFlipLoader));
    await library.LoadExternalSet("DryProbe", { albedo: `./Texture/${file}`, normal: `./Texture/${file}`, orm: `./Texture/${ormFile}` });
    const drySet = library.baked.get("DryProbe"); result.dryRoughMin = drySet.roughMin;
    result.targetRestored = renderer.getRenderTarget() === target;
    // A smooth region only in the last mip must still retain SSR. Use genuine
    // encoded blocks of the same format so the base level remains entirely dry.
    const { LoadKtxTexture } = await import("./Script_TextureImports.mjs");
    const wet = await LoadKtxTexture(wetUrl);
    drySet.orm.mipmaps.at(-1).data = wet.mipmaps.at(-1).data;
    drySet.orm.needsUpdate = true;
    const loadExternal = library._LoadExternalImage;
    library._LoadExternalImage = async () => drySet.orm;
    await library.LoadExternalSet("MipProbe", { albedo: "", normal: "", orm: "" });
    library._LoadExternalImage = loadExternal;
    result.mipRoughMin = library.baked.get("MipProbe").roughMin;
    result.glError = renderer.getContext().getError();
    for (const owned of [drySet.albedo, drySet.normal, drySet.orm, wet]) owned.dispose();
    for (const owned of [original, texture, regular, noFlip, noFlipLoader]) owned.dispose();
    material.dispose(); geometry.dispose(); target.dispose(); renderer.dispose(); renderer.forceContextLoss(); return result;
  }, { file, reference: origin + png.url, ormFile, wetUrl: origin + wetOrm.url });
  assert.equal(runtime.compressed, true); assert.equal(runtime.size, 64); assert.equal(runtime.mips, 1); assert.equal(runtime.minFilter, runtime.linearFilter);
  for (const key of ["error", "managedError", "noFlipError", "noFlipLoaderError"]) assert.ok(runtime[key] < 3, `${key}: ${JSON.stringify(runtime)}`);
  assert.ok(Math.abs(runtime.dryRoughMin - 224 / 255) < 2 / 255, JSON.stringify(runtime));
  assert.ok(Math.abs(runtime.mipRoughMin - 40 / 255) < 2 / 255, JSON.stringify(runtime));
  assert.equal(runtime.targetRestored, true); assert.equal(runtime.glError, 0);
  await probe.close();
  assert.deepEqual(errors, []);
  console.log("PASS TextureManagerBrowserTest: previews, save/reload, worker, conflict protection and actual runtime GPU sampling", JSON.stringify(runtime));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); await fs.rm(temp, { recursive: true, force: true }); }
