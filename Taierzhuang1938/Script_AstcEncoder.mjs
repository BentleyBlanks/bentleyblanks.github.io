// 手机版贴图的 ASTC 编码（Pages 发布专用，docs/Data_TextureImporter.md「手机版贴图」，2026-10-26）。
//
// Basis（桌面那套 KTX2）在 iPhone 上只能转成 ASTC 4×4，转不出 6×6；所以手机版直接用 ARM 官方的 astcenc
// 压成原生 ASTC 块，装进 KTX2（vkFormat = ASTC_6x6 / ASTC_4x4，zstd 超压缩），three 的 KTX2Loader 走 raw 路径直接上传。
//
//   AstcEncoderInfo(cacheDir)  按平台下载固定版本的 astcenc 发行包（curl；本机 node fetch 不认代理）、核对 SHA-256、
//                              解压进 cacheDir/astcenc-<版本>；CI 与本机同一份。也可设 ASTCENC_PATH 指向现成的可执行文件。
//   EncodeAstcKtx2(rgba, w, h, options) → KTX2 字节：自带 mip 链（逐级缩小后逐级编码），可选上下翻转、法线重新归一。
//
// 编码参数写在 MOBILE_TEXTURE（Data_AssetPublish.mjs），这里只管怎么编。
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import zlib from "node:zlib";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import {
  createDefaultContainer, write as WriteKtx,
  KHR_DF_MODEL_ASTC, KHR_DF_PRIMARIES_BT709, KHR_DF_TRANSFER_SRGB, KHR_DF_TRANSFER_LINEAR,
  KHR_SUPERCOMPRESSION_ZSTD, KHR_SUPERCOMPRESSION_NONE,
  VK_FORMAT_ASTC_6x6_SRGB_BLOCK, VK_FORMAT_ASTC_6x6_UNORM_BLOCK, VK_FORMAT_ASTC_4x4_SRGB_BLOCK, VK_FORMAT_ASTC_4x4_UNORM_BLOCK,
} from "./vendor/three/examples/jsm/libs/ktx-parse.module.js";
import { NormalizeImportNormals } from "./Script_TextureImportPixels.mjs";

const require = createRequire(import.meta.url), run = promisify(execFile);
const Hash = (value) => createHash("sha256").update(value).digest("hex");

/** 固定的 astcenc 发行版（github.com/ARM-software/astc-encoder，5.7.0，2026-07-31）。换版本要同时换 SHA-256。 */
export const ASTCENC = Object.freeze({
  version: "5.7.0",
  builds: Object.freeze({
    "linux-x64": { zip: "astcenc-5.7.0-linux-x64.zip", sha256: "6c6b299b17608e1ee74db9c491cdc793b12b2b104a4b52222e358d78ae0662a9" },
    "win32-x64": { zip: "astcenc-5.7.0-windows-x64.zip", sha256: "cbde7c78adcc90d0d90ecf10f32d03f3340fbe1720cb6d6c892147d625e74d2d" },
    "darwin-arm64": { zip: "astcenc-5.7.0-macos-universal.zip", sha256: "374b2f0aea1d3ab5f849784666d6ece6e27b4bc1f945e5c90d6eeabf00e955f8" },
    "darwin-x64": { zip: "astcenc-5.7.0-macos-universal.zip", sha256: "374b2f0aea1d3ab5f849784666d6ece6e27b4bc1f945e5c90d6eeabf00e955f8" },
  }),
});

async function Exists(file) { try { await fs.access(file); return true; } catch { return false; } }
async function FindFile(dir, test) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { const hit = await FindFile(full, test); if (hit) return hit; }
    else if (test(entry.name)) return full;
  }
  return null;
}

let encoderPromise = null;
/** → { executable, sha256, version, binary }。 */
export function AstcEncoderInfo(cacheDir = null) {
  return encoderPromise ??= (async () => {
    if (process.env.ASTCENC_PATH) {
      const bytes = await fs.readFile(process.env.ASTCENC_PATH);
      return { executable: process.env.ASTCENC_PATH, sha256: Hash(bytes), version: "ASTCENC_PATH", binary: path.basename(process.env.ASTCENC_PATH) };
    }
    const build = ASTCENC.builds[`${process.platform}-${process.arch}`];
    if (!build) throw new Error(`astcenc unavailable on ${process.platform}/${process.arch}; set ASTCENC_PATH`);
    const root = path.join(cacheDir || path.join(os.tmpdir(), "TengxianAstcenc"), `astcenc-${ASTCENC.version}`);
    const zip = path.join(root, build.zip), unpacked = path.join(root, "unpacked");
    await fs.mkdir(root, { recursive: true });
    if (!(await Exists(zip)) || Hash(await fs.readFile(zip)) !== build.sha256) {
      const url = `https://github.com/ARM-software/astc-encoder/releases/download/${ASTCENC.version}/${build.zip}`;
      await run("curl", ["-fsSL", "--retry", "3", "-o", zip, url], { timeout: 180000, windowsHide: true });
      const got = Hash(await fs.readFile(zip));
      if (got !== build.sha256) { await fs.rm(zip, { force: true }); throw new Error(`astcenc download SHA-256 mismatch: ${got}`); }
    }
    if (!(await Exists(unpacked))) {
      const temp = unpacked + ".tmp";
      await fs.rm(temp, { recursive: true, force: true }); await fs.mkdir(temp, { recursive: true });
      // Linux runners carry unzip; Windows 10+ tar (bsdtar) reads zip; macOS has both.
      // Windows 上点名系统自带的 bsdtar：PATH 里若先找到 Git 带的 GNU tar，它会把「C:」当成远程主机名
      if (process.platform === "win32") await run(path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe"), ["-xf", zip, "-C", temp], { windowsHide: true });
      else await run("unzip", ["-q", "-o", zip, "-d", temp]);
      await fs.rename(temp, unpacked);
    }
    // 优先 AVX2（CI 的 x64 机器都有），再 SSE4.1；Windows 不探 CPU，直接用 SSE4.1。
    const avx2 = process.platform === "linux" && /^flags\s*:.*\bavx2\b/m.test(await fs.readFile("/proc/cpuinfo", "utf8").catch(() => ""));
    const wanted = process.platform === "darwin" ? ["astcenc"] : avx2 ? ["astcenc-avx2", "astcenc-sse4.1"] : ["astcenc-sse4.1", "astcenc-sse2"];
    let executable = null;
    for (const name of wanted) { executable = await FindFile(unpacked, (file) => file === name || file === name + ".exe"); if (executable) break; }
    if (!executable) throw new Error("astcenc executable not found in " + unpacked);
    if (process.platform !== "win32") await fs.chmod(executable, 0o755);
    const bytes = await fs.readFile(executable);
    return { executable, sha256: Hash(bytes), version: ASTCENC.version, binary: path.basename(executable) };
  })();
}

/** 编码流程版本：改了缩放 / mip / 归一 / 打包任何一步就加一，旧缓存随之作废（2：修数据图逐通道缩放，2026-10-26）。 */
export const ASTC_PIPELINE = 2;

const BLOCKS = Object.freeze({
  "6x6": { w: 6, h: 6, srgb: VK_FORMAT_ASTC_6x6_SRGB_BLOCK, linear: VK_FORMAT_ASTC_6x6_UNORM_BLOCK },
  "4x4": { w: 4, h: 4, srgb: VK_FORMAT_ASTC_4x4_SRGB_BLOCK, linear: VK_FORMAT_ASTC_4x4_UNORM_BLOCK },
});

/** ASTC 块数据量（字节）：每块 16 字节，向上取整到整块。 */
export function AstcLevelBytes(width, height, block = "6x6") {
  const b = BLOCKS[block];
  return Math.ceil(width / b.w) * Math.ceil(height / b.h) * 16;
}

/** 最长边夹到 maxSize（保持比例，不放大）。 */
export function MobileDimensions(width, height, maxSize) {
  const ratio = Math.min(1, maxSize / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}

/** RGBA8 → 指定尺寸。线性数据图逐通道缩（不让 sharp 当颜色混通道 / 预乘 alpha），颜色图整体缩。 */
async function Resize(rgba, width, height, toW, toH, linear) {
  const sharp = require("sharp"), raw = { width, height, channels: 4 };
  if (width === toW && height === toH) return Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  if (!linear) return sharp(rgba, { raw }).resize(toW, toH, { fit: "fill", kernel: "lanczos3" }).raw().toBuffer();
  // 先把通道单独取成一张单通道图，再缩：同一条 sharp 管线里写 extractChannel().resize()，sharp 按它自己的固定顺序执行，
  // 四个通道出来全是同一个灰度值（法线图变成 146,146,146，2026-10-26 实测）。
  const channels = await Promise.all([0, 1, 2, 3].map(async (c) => {
    const plane = await sharp(rgba, { raw }).extractChannel(c).raw().toBuffer();
    // 不写 toColourspace("b-w") 的话，sharp 会把单通道结果又展成三通道输出
    return sharp(plane, { raw: { width, height, channels: 1 } }).resize(toW, toH, { fit: "fill", kernel: "lanczos3" }).toColourspace("b-w").raw().toBuffer();
  }));
  const out = Buffer.alloc(toW * toH * 4);
  for (let i = 0; i < toW * toH; i++) for (let c = 0; c < 4; c++) out[i * 4 + c] = channels[c][i];
  return out;
}

/**
 * RGBA8 像素 → ASTC KTX2 字节。
 * options: { colorSpace: "srgb"|"linear", block: "6x6"|"4x4", normal, flipY, mipmaps, maxSize, preset, zstdLevel, encoder }
 * 返回 { bytes, width, height, levels, gpuBytes, vkFormat }。
 */
export async function EncodeAstcKtx2(rgba, width, height, {
  colorSpace = "srgb", block = "6x6", normal = false, flipY = false, mipmaps = true, maxSize = 1024,
  preset = "-medium", zstdLevel = 19, encoder,
} = {}) {
  const sharp = require("sharp"), b = BLOCKS[block];
  if (!b) throw new Error("Unsupported ASTC block " + block);
  if (!encoder?.executable) throw new Error("EncodeAstcKtx2 needs AstcEncoderInfo()");
  const linear = colorSpace === "linear";
  const size = MobileDimensions(width, height, maxSize);
  let base = await Resize(rgba, width, height, size.width, size.height, linear);
  if (flipY) base = await sharp(base, { raw: { width: size.width, height: size.height, channels: 4 } }).flip().raw().toBuffer();
  const levels = [];
  let w = size.width, h = size.height;
  for (;;) {
    const data = levels.length === 0 ? Buffer.from(base) : await Resize(base, size.width, size.height, w, h, linear);
    if (normal) NormalizeImportNormals(data);
    levels.push({ data, width: w, height: h });
    if (!mipmaps || (w === 1 && h === 1)) break;
    w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
  }
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "TengxianAstc-"));
  const encoded = [];
  try {
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i], png = path.join(temp, `L${i}.png`), out = path.join(temp, `L${i}.astc`);
      await sharp(level.data, { raw: { width: level.width, height: level.height, channels: 4 } }).png({ compressionLevel: 1 }).toFile(png);
      // -cs：sRGB 颜色（GPU 端按 sRGB 解）；-cl：线性 LDR（法线、ORM、高度）。法线不走 -normal（那会换成 RRRG 布局，three 的法线贴图要 RGB）。
      await run(encoder.executable, [linear ? "-cl" : "-cs", png, out, block, preset, "-silent"], { timeout: 300000, windowsHide: true, maxBuffer: 4 << 20 });
      const astc = await fs.readFile(out);
      if (astc.readUInt32LE(0) !== 0x5ca1ab13) throw new Error("astcenc output is not an .astc file");
      const blocks = astc.subarray(16);
      if (blocks.length !== AstcLevelBytes(level.width, level.height, block)) throw new Error("ASTC level size mismatch");
      encoded.push(blocks);
    }
  } finally { await fs.rm(temp, { recursive: true, force: true }); }

  const container = createDefaultContainer();
  const vkFormat = linear ? b.linear : b.srgb;
  const zstd = zstdLevel > 0 && typeof zlib.zstdCompressSync === "function";
  container.vkFormat = vkFormat;
  container.typeSize = 1;
  container.pixelWidth = size.width; container.pixelHeight = size.height; container.pixelDepth = 0;
  container.layerCount = 0; container.faceCount = 1; container.levelCount = encoded.length;
  container.supercompressionScheme = zstd ? KHR_SUPERCOMPRESSION_ZSTD : KHR_SUPERCOMPRESSION_NONE;
  container.levels = encoded.map((blocks) => ({
    levelData: zstd ? new Uint8Array(zlib.zstdCompressSync(blocks, { params: { [zlib.constants.ZSTD_c_compressionLevel]: zstdLevel } })) : new Uint8Array(blocks),
    uncompressedByteLength: blocks.length,
  }));
  const dfd = container.dataFormatDescriptor[0];
  dfd.colorModel = KHR_DF_MODEL_ASTC;
  dfd.colorPrimaries = KHR_DF_PRIMARIES_BT709;
  dfd.transferFunction = linear ? KHR_DF_TRANSFER_LINEAR : KHR_DF_TRANSFER_SRGB;
  dfd.flags = 0;
  dfd.texelBlockDimension = [b.w - 1, b.h - 1, 0, 0];
  dfd.bytesPlane = [zstd ? 0 : 16, 0, 0, 0, 0, 0, 0, 0];
  dfd.samples = [{ bitOffset: 0, bitLength: 127, channelType: 0, samplePosition: [0, 0, 0, 0], sampleLower: 0, sampleUpper: 0xffffffff }];
  container.keyValue = { KTXwriter: `Tengxian mobile publish (astcenc ${encoder.version})` };
  const bytes = Buffer.from(WriteKtx(container));
  return { bytes, width: size.width, height: size.height, levels: encoded.length, vkFormat, block,
    gpuBytes: encoded.reduce((n, x) => n + x.length, 0) };
}
