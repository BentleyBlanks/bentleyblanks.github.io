// ===========================================================================
// Script_PublishMobileAssetsTest.mjs —— 手机版贴图（1024 + ASTC 6×6 / 法线 4×4，2026-10-26）的闸门
//
// 跑法：node Taierzhuang1938/Script_PublishMobileAssetsTest.mjs   （第一次会下载 astcenc 发行包，约 2–4 MB）
// 口径：docs/Data_TextureImporter.md「手机版贴图」。
//   node：用真资产（2048 颜色图、2048 法线图、1536×768 ORM、第一人称身体模型）做一次小打包：
//     · 最长边 ≤ 1024、比例不变、整条 mip 链、zstd；颜色图 sRGB 6×6，ORM 线性 6×6，法线线性 4×4；
//     · 把 KTX2 第 0 级解回像素（astcenc 解码）跟原图缩到同尺寸比：每个通道平均误差 < 6 ——
//       逐通道缩放写错时（四个通道变成同一个灰度，2026-10-26 实测过）这里直接红；翻转版 = 不翻转版上下颠倒；
//     · 模型：嵌入图换成 image/ktx2 + KHR_texture_basisu，几何 / 骨骼 / 材质 JSON 不变，法线图走 4×4；
//     · 电脑版对照表里没有任何手机版文件；手机版对照表三张图、一个模型都在。
//   浏览器（SwiftShader，认 ASTC）：?mobileAssets=1 时项目自己的贴图加载器与模型加载器拿到的是 ASTC 6×6 / 4×4、尺寸 1024，
//     渲染无 GL 错误；?mobileAssets=0 时照旧是电脑版（不是 ASTC）。
// ===========================================================================
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import fss from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { BuildPublishAssets } from "./Script_BuildPublishAssets.mjs";
import { AstcEncoderInfo } from "./Script_AstcEncoder.mjs";
import { read as ReadKtx, KHR_SUPERCOMPRESSION_ZSTD, VK_FORMAT_ASTC_6x6_SRGB_BLOCK, VK_FORMAT_ASTC_6x6_UNORM_BLOCK, VK_FORMAT_ASTC_4x4_UNORM_BLOCK }
  from "./vendor/three/examples/jsm/libs/ktx-parse.module.js";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";

const require = createRequire(import.meta.url), sharp = require("sharp"), run = promisify(execFile);
const projectDir = path.dirname(fileURLToPath(import.meta.url));
const results = [];
function Check(name, ok, detail = "") { results.push({ name, ok: !!ok }); console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`); }
const J = (v) => JSON.stringify(v);

const TEXTURES = {
  "Texture_Type89ArmorBase.webp": { block: "6x6", vk: VK_FORMAT_ASTC_6x6_SRGB_BLOCK, linear: false },
  "Texture_Zb26VeteranSteelNormal.webp": { block: "4x4", vk: VK_FORMAT_ASTC_4x4_UNORM_BLOCK, linear: true },
  "Texture_GrenadeOrm.webp": { block: "6x6", vk: VK_FORMAT_ASTC_6x6_UNORM_BLOCK, linear: true },
};
const MODEL = "Model/Model_FirstPersonBody.glb";

const temp = await fs.mkdtemp(path.join(os.tmpdir(), "TengxianMobilePublish-"));
const out = path.join(temp, "Taierzhuang1938"), cache = path.join(temp, "cache");
const encoder = await AstcEncoderInfo(process.env.ASTCENC_CACHE || path.join(os.tmpdir(), "TengxianAstcencTest"));

/** KTX2 第 level 级 → RGBA8（astcenc 解码；线性 -dl，sRGB -ds）。 */
async function DecodeLevel(bytes, level = 0) {
  const doc = ReadKtx(new Uint8Array(bytes)), lv = doc.levels[level];
  const blocks = doc.supercompressionScheme === KHR_SUPERCOMPRESSION_ZSTD ? zlib.zstdDecompressSync(lv.levelData) : Buffer.from(lv.levelData);
  const w = Math.max(1, doc.pixelWidth >> level), h = Math.max(1, doc.pixelHeight >> level);
  const bw = doc.dataFormatDescriptor[0].texelBlockDimension[0] + 1, bh = doc.dataFormatDescriptor[0].texelBlockDimension[1] + 1;
  const head = Buffer.alloc(16); head.writeUInt32LE(0x5ca1ab13, 0); head[4] = bw; head[5] = bh; head[6] = 1;
  head.writeUIntLE(w, 7, 3); head.writeUIntLE(h, 10, 3); head.writeUIntLE(1, 13, 3);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "TengxianAstcDecode-"));
  try {
    await fs.writeFile(path.join(dir, "in.astc"), Buffer.concat([head, blocks]));
    const srgb = doc.dataFormatDescriptor[0].transferFunction === 2;
    await run(encoder.executable, [srgb ? "-ds" : "-dl", path.join(dir, "in.astc"), path.join(dir, "out.png")], { windowsHide: true });
    return { data: await sharp(path.join(dir, "out.png")).ensureAlpha().raw().toBuffer(), width: w, height: h, doc };
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}
/** 原图缩到 w×h（线性逐通道；与打包同一种缩法，但这里用最朴素的写法，不复用被测代码）。 */
async function Reference(bytes, w, h, linear) {
  const { data, info } = await sharp(bytes).toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (!linear) return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).resize(w, h, { fit: "fill", kernel: "lanczos3" }).raw().toBuffer();
  const outBuf = Buffer.alloc(w * h * 4);
  for (let c = 0; c < 4; c++) {
    const plane = Buffer.alloc(info.width * info.height); for (let i = 0; i < plane.length; i++) plane[i] = data[i * 4 + c];
    const small = await sharp(plane, { raw: { width: info.width, height: info.height, channels: 1 } }).resize(w, h, { fit: "fill", kernel: "lanczos3" }).toColourspace("b-w").raw().toBuffer();
    for (let i = 0; i < w * h; i++) outBuf[i * 4 + c] = small[i];
  }
  return outBuf;
}
const ChannelError = (a, b) => [0, 1, 2].map((c) => { let s = 0; for (let i = c; i < a.length; i += 4) s += Math.abs(a[i] - b[i]); return +(s / (a.length / 4)).toFixed(2); });

let server = null, browser = null;
try {
  // ---- 打包 ----
  await fs.mkdir(path.join(out, "Texture"), { recursive: true });
  await fs.mkdir(path.join(out, "Model"), { recursive: true });
  await fs.writeFile(path.join(out, "index.html"), '<script type="importmap">{"imports":{}}</script>');
  const report = await BuildPublishAssets(projectDir, out, { cacheDir: cache, textureFiles: Object.keys(TEXTURES), modelFiles: [],
    mobileModelFiles: [MODEL], log: () => {} });
  const mobile = report.mobile;
  Check("手机版：三张图、一个模型都出了，没有跳过", mobile.textures.length === 3 && mobile.models.length === 1 && !mobile.skipped.length, J(mobile.summary));

  for (const [file, want] of Object.entries(TEXTURES)) {
    const row = mobile.textures.find((t) => t.file === "Texture/" + file);
    const bytes = await fs.readFile(path.join(out, row.output)), doc = ReadKtx(new Uint8Array(bytes));
    const meta = await sharp(path.join(projectDir, "Texture", file)).metadata();
    const scale = Math.min(1, 1024 / Math.max(meta.width, meta.height));
    const levels = Math.floor(Math.log2(Math.max(doc.pixelWidth, doc.pixelHeight))) + 1;
    Check(`${file}：最长边 ≤ 1024 且比例不变，${want.block}、${want.linear ? "线性" : "sRGB"}、整条 mip、zstd`,
      doc.pixelWidth === Math.round(meta.width * scale) && doc.pixelHeight === Math.round(meta.height * scale) && doc.vkFormat === want.vk
      && doc.levels.length === levels && doc.supercompressionScheme === KHR_SUPERCOMPRESSION_ZSTD && row.block === want.block,
      J({ size: [doc.pixelWidth, doc.pixelHeight], vk: doc.vkFormat, levels: doc.levels.length }));
    const decoded = await DecodeLevel(bytes, 0);
    const ref = await Reference(await fs.readFile(path.join(projectDir, "Texture", file)), decoded.width, decoded.height, want.linear);
    // 打包时翻转版是上下颠倒的；参考图也颠倒过来再比
    const flippedRef = await sharp(ref, { raw: { width: decoded.width, height: decoded.height, channels: 4 } }).flip().raw().toBuffer();
    const err = ChannelError(decoded.data, flippedRef);
    Check(`${file}：解回来的像素和原图一致（每通道平均误差 < 6）`, err.every((e) => e < 6), J(err));
    const noFlip = await DecodeLevel(await fs.readFile(path.join(out, row.unflipped)), 0);
    Check(`${file}：不翻转版 = 原图方向`, ChannelError(noFlip.data, ref).every((e) => e < 6), J(ChannelError(noFlip.data, ref)));
  }

  // 模型
  const model = mobile.models[0], glb = await fs.readFile(path.join(out, model.output));
  const len = glb.readUInt32LE(12), doc = JSON.parse(glb.subarray(20, 20 + len));
  const src = await fs.readFile(path.join(projectDir, MODEL)), srcDoc = JSON.parse(src.subarray(20, 20 + src.readUInt32LE(12)));
  Check("模型：嵌入图全换成 image/ktx2 + KHR_texture_basisu，法线图 4×4、其余 6×6",
    doc.images.every((i) => i.mimeType === "image/ktx2") && doc.extensionsRequired.includes("KHR_texture_basisu")
    && model.images.some((i) => i.use === "normal" && i.block === "4x4") && model.images.filter((i) => i.use !== "normal").every((i) => i.block === "6x6"),
    J(model.images.map((i) => [i.use, i.block, i.width])));
  Check("模型：几何、骨骼、材质 JSON 一个字不变", ["nodes", "meshes", "skins", "accessors", "materials"].every((k) => J(doc[k]) === J(srcDoc[k])));

  const tableOf = async (file) => JSON.parse((await fs.readFile(path.join(out, file), "utf8")).match(/=\s*([\s\S]*);\s*$/)[1]);
  const desktopTex = await tableOf("Data_TextureImportRuntime.mjs"), desktopModels = await tableOf("Data_AssetPublishRuntime.mjs"), mobileTable = await tableOf("Data_MobileAssetRuntime.mjs");
  Check("电脑版对照表里没有手机版文件；手机版对照表齐全", !J(desktopTex).includes("_Mobile") && !J(desktopModels).includes("_Mobile")
    && Object.keys(mobileTable.textures).length === 3 && mobileTable.models[MODEL] === model.output);

  // ---- 浏览器：发布目录叠在项目上 ----
  const MIME = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".wasm": "application/wasm", ".webp": "image/webp", ".png": "image/png", ".glb": "model/gltf-binary", ".ktx2": "image/ktx2", ".json": "application/json" };
  server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "").replace(/^Taierzhuang1938\//, "");
    const file = [path.join(out, rel), path.join(projectDir, rel)].find((f) => fss.existsSync(f) && fss.statSync(f).isFile());
    if (!file) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    fss.createReadStream(file).pipe(res);
  }).listen(0);
  const port = server.address().port;
  await fs.writeFile(path.join(out, "_MobileHarness.html"), `<!doctype html><meta charset="utf-8"><canvas id="c" width="64" height="64"></canvas>
<script type="importmap">{"imports":{"three":"./vendor/three/build/three.module.js","three/addons/":"./vendor/three/examples/jsm/"}}</script>
<script type="module">
import * as T from "three";
import { ManagedTextureLoader, SetTextureImportRenderer, MobileAssetsActive } from "./Script_TextureImports.mjs";
import { ManagedGLTFLoader } from "./Script_ModelImports.mjs";
const r = new T.WebGLRenderer({ canvas: document.getElementById("c") }); SetTextureImportRenderer(r);
const name = (t) => t?.format === T.RGBA_ASTC_6x6_Format ? "ASTC6" : t?.format === T.RGBA_ASTC_4x4_Format ? "ASTC4" : String(t?.format);
const Tex = (url) => new Promise((ok, no) => new ManagedTextureLoader().load(url, ok, undefined, no));
const base = await Tex("./Texture/Texture_Type89ArmorBase.webp"), normal = await Tex("./Texture/Texture_Zb26VeteranSteelNormal.webp");
const gltf = await new ManagedGLTFLoader().loadAsync("./${MODEL}");
let mat = null; gltf.scene.traverse((o) => { if (o.material && o.material.normalMap && !mat) mat = o.material; });
const scene = new T.Scene(); scene.add(new T.Mesh(new T.PlaneGeometry(), new T.MeshStandardMaterial({ map: base, normalMap: normal }))); scene.add(gltf.scene);
const cam = new T.PerspectiveCamera(); cam.position.z = 3; r.render(scene, cam);
window.__out = { active: MobileAssetsActive(), astc: r.extensions.has("WEBGL_compressed_texture_astc"), base: [name(base), base.image?.width ?? base.mipmaps?.[0]?.width, base.colorSpace],
  normal: [name(normal), normal.mipmaps?.[0]?.width ?? normal.image?.width], glbMap: name(mat?.map), glbNormal: name(mat?.normalMap), glbMapWidth: mat?.map?.mipmaps?.[0]?.width ?? mat?.map?.image?.width, glError: r.getContext().getError() };
</script>`);
  browser = await LaunchBrowser({ extraArgs: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  for (const mode of ["1", "0"]) {
    await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/_MobileHarness.html?mobileAssets=${mode}`);
    await page.waitForFunction(() => window.__out, null, { timeout: 120000 });
    const o = await page.evaluate(() => window.__out);
    if (mode === "1") Check("?mobileAssets=1：贴图加载器拿到 ASTC 6×6（sRGB，1024）/ 法线 ASTC 4×4，模型里也是 ASTC，无 GL 错误",
      o.astc && o.active && o.base[0] === "ASTC6" && o.base[1] === 1024 && o.base[2] === "srgb" && o.normal[0] === "ASTC4" && o.normal[1] === 1024
      && o.glbMap === "ASTC6" && o.glbNormal === "ASTC4" && o.glbMapWidth === 1024 && o.glError === 0, J(o));
    else Check("?mobileAssets=0：照旧是电脑版（不是 ASTC 6×6）", !o.active && o.base[0] !== "ASTC6" && o.glbMap !== "ASTC6" && o.glError === 0, J(o));
  }
  Check("浏览器里没有未捕获错误", errors.length === 0, errors.join(" | "));
} finally {
  await browser?.close();
  server?.close();
  await fs.rm(temp, { recursive: true, force: true });
}
const failed = results.filter((r) => !r.ok);
console.log(`PublishMobileAssetsTest: ${results.length - failed.length}/${results.length} passed`);
assert.equal(failed.length, 0, failed.map((r) => r.name).join("; "));
