#!/usr/bin/env node
// 台儿庄真实高程图下载、生成与布设贴地 CLI。零第三方依赖。
//
// 常用命令：
//   node Taierzhuang1938/Script_HeightmapCli.mjs download
//   node Taierzhuang1938/Script_HeightmapCli.mjs info
//   node Taierzhuang1938/Script_HeightmapCli.mjs sample --x=0 --z=-1470
//   node Taierzhuang1938/Script_HeightmapCli.mjs match --input=placements.json --output=matched.json
//   node Taierzhuang1938/Script_HeightmapCli.mjs verify

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const heightmapDir = path.join(projectDir, "Heightmap");
const rawDir = path.join(heightmapDir, "_raw");
const rawPath = path.join(rawDir, "Data_SourceN34E117.hgt.gz");
const texturePath = path.join(heightmapDir, "Texture_TaierzhuangHeightmap.png");
const dataPath = path.join(heightmapDir, "Data_TaierzhuangHeightmap.mjs");

const DEFAULTS = Object.freeze({
  sourceUrl: "https://s3.amazonaws.com/elevation-tiles-prod/skadi/N34/N34E117.hgt.gz",
  sourceRegistry: "https://registry.opendata.aws/terrain-tiles/",
  attribution: "SRTM terrain data courtesy of the U.S. Geological Survey; tiles hosted by Mapzen on AWS Open Data",
  retrievedOn: "2026-08-20",
  centerLat: 34.5582572,
  centerLon: 117.7396218,
  centerLabel: "台儿庄古城（OpenStreetMap Nominatim）",
  tileSouth: 34,
  tileWest: 117,
  minX: -1250,
  maxX: 1250,
  minZ: -2200,
  maxZ: -380,
  width: 257,
  height: 193,
  referenceX: 0,
  referenceZ: -1470,
});

function ParseArgs(argv) {
  const command = argv.find((arg) => !arg.startsWith("--")) || "help";
  const options = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const index = arg.indexOf("=");
    if (index < 0) options[arg.slice(2)] = true;
    else options[arg.slice(2, index)] = arg.slice(index + 1);
  }
  return { command, options };
}

function NumberOption(options, name, fallback) {
  if (options[name] === undefined) return fallback;
  const value = Number(options[name]);
  if (!Number.isFinite(value)) throw new Error(`--${name} 不是有效数字：${options[name]}`);
  return value;
}

function Sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function MetersPerDegree(lat) {
  const rad = lat * Math.PI / 180;
  return {
    lat: 111132.92 - 559.82 * Math.cos(2 * rad) + 1.175 * Math.cos(4 * rad),
    lon: 111412.84 * Math.cos(rad) - 93.5 * Math.cos(3 * rad),
  };
}

async function Download(url, outputPath, force = false) {
  if (!force && fs.existsSync(outputPath)) return fs.readFileSync(outputPath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  console.log(`下载 ${url}`);
  const response = await fetch(url, { headers: { "user-agent": "Taierzhuang1938-HeightmapCli/1.0" } });
  if (!response.ok) throw new Error(`下载失败：HTTP ${response.status} ${response.statusText}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  return buffer;
}

/** HGT 是北到南、每格 big-endian int16；3×3 中值去掉孤立的树冠/建筑尖峰。 */
function CreateHgtSampler(raw, tileSouth, tileWest) {
  const size = Math.round(Math.sqrt(raw.length / 2));
  if (size * size * 2 !== raw.length) throw new Error(`HGT 字节数异常：${raw.length}`);
  const ReadCell = (row, column) => {
    const r = Math.max(0, Math.min(size - 1, row));
    const c = Math.max(0, Math.min(size - 1, column));
    return raw.readInt16BE((r * size + c) * 2);
  };
  const MedianCell = (row, column) => {
    const values = [];
    for (let rz = -1; rz <= 1; rz += 1) {
      for (let rx = -1; rx <= 1; rx += 1) {
        const value = ReadCell(row + rz, column + rx);
        if (value > -1000) values.push(value);
      }
    }
    values.sort((a, b) => a - b);
    return values.length ? values[Math.floor(values.length / 2)] : 0;
  };
  return {
    size,
    sample(lat, lon) {
      const row = (tileSouth + 1 - lat) * (size - 1);
      const column = (lon - tileWest) * (size - 1);
      const r0 = Math.floor(row), c0 = Math.floor(column);
      const tr = row - r0, tc = column - c0;
      const h00 = MedianCell(r0, c0), h10 = MedianCell(r0, c0 + 1);
      const h01 = MedianCell(r0 + 1, c0), h11 = MedianCell(r0 + 1, c0 + 1);
      const north = h00 + (h10 - h00) * tc;
      const south = h01 + (h11 - h01) * tc;
      return north + (south - north) * tr;
    },
  };
}

function Crc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function PngChunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const body = Buffer.concat([name, data]);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(Crc32(body), 8 + data.length);
  return chunk;
}

/** 16-bit 灰度 PNG。像素按 cropMin/cropMax 归一化，米制映射写进 tEXt。 */
function EncodeHeightPng(width, height, elevationsDm, minDm, maxDm, metadata) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 16;
  ihdr[9] = 0;
  const scanlines = Buffer.alloc(height * (1 + width * 2));
  const span = Math.max(1, maxDm - minDm);
  for (let row = 0; row < height; row += 1) {
    const offset = row * (1 + width * 2);
    scanlines[offset] = 0;
    for (let column = 0; column < width; column += 1) {
      const dm = elevationsDm[row * width + column];
      const value = Math.round((dm - minDm) / span * 65535);
      scanlines.writeUInt16BE(Math.max(0, Math.min(65535, value)), offset + 1 + column * 2);
    }
  }
  const chunks = [PngChunk("IHDR", ihdr)];
  for (const [key, value] of Object.entries(metadata)) {
    chunks.push(PngChunk("tEXt", Buffer.from(`${key}\0${value}`, "latin1")));
  }
  chunks.push(PngChunk("IDAT", zlib.deflateSync(scanlines, { level: 9 })));
  chunks.push(PngChunk("IEND", Buffer.alloc(0)));
  return Buffer.concat([signature, ...chunks]);
}

function BuildDataModule(meta, elevationsDm) {
  const bytes = Buffer.alloc(elevationsDm.length * 2);
  for (let i = 0; i < elevationsDm.length; i += 1) bytes.writeInt16LE(elevationsDm[i], i * 2);
  const base64 = bytes.toString("base64");
  return `// 由 Script_HeightmapCli.mjs 生成，不要手改。\n`
    + `// 高程单位：0.1 m；行序：世界 z 从北（minZ）到南（maxZ）。\n\n`
    + `export const TAIZHUANG_HEIGHTMAP = Object.freeze(${JSON.stringify(meta, null, 2)});\n\n`
    + `const HEIGHTS_BASE64 =\n  ${JSON.stringify(base64)};\n\n`
    + `function DecodeHeights() {\n`
    + `  let bytes;\n`
    + `  if (typeof Buffer !== "undefined") bytes = Uint8Array.from(Buffer.from(HEIGHTS_BASE64, "base64"));\n`
    + `  else {\n`
    + `    const raw = atob(HEIGHTS_BASE64);\n`
    + `    bytes = Uint8Array.from(raw, (ch) => ch.charCodeAt(0));\n`
    + `  }\n`
    + `  const heights = new Int16Array(bytes.length / 2);\n`
    + `  for (let i = 0; i < heights.length; i += 1) {\n`
    + `    let value = bytes[i * 2] | (bytes[i * 2 + 1] << 8);\n`
    + `    if (value & 0x8000) value -= 0x10000;\n`
    + `    heights[i] = value;\n`
    + `  }\n`
    + `  return heights;\n`
    + `}\n\n`
    + `export const TAIZHUANG_HEIGHTS_DM = DecodeHeights();\n\n`
    + `export function SampleTaierzhuangDem(x, z) {\n`
    + `  const m = TAIZHUANG_HEIGHTMAP;\n`
    + `  const u = Math.max(0, Math.min(1, (x - m.worldBounds.minX) / (m.worldBounds.maxX - m.worldBounds.minX)));\n`
    + `  const v = Math.max(0, Math.min(1, (z - m.worldBounds.minZ) / (m.worldBounds.maxZ - m.worldBounds.minZ)));\n`
    + `  const px = u * (m.width - 1), pz = v * (m.height - 1);\n`
    + `  const x0 = Math.floor(px), z0 = Math.floor(pz);\n`
    + `  const x1 = Math.min(m.width - 1, x0 + 1), z1 = Math.min(m.height - 1, z0 + 1);\n`
    + `  const tx = px - x0, tz = pz - z0;\n`
    + `  const north = TAIZHUANG_HEIGHTS_DM[z0 * m.width + x0] * (1 - tx)\n`
    + `    + TAIZHUANG_HEIGHTS_DM[z0 * m.width + x1] * tx;\n`
    + `  const south = TAIZHUANG_HEIGHTS_DM[z1 * m.width + x0] * (1 - tx)\n`
    + `    + TAIZHUANG_HEIGHTS_DM[z1 * m.width + x1] * tx;\n`
    + `  return (north * (1 - tz) + south * tz) / 10;\n`
    + `}\n`;
}

function SampleArray(elevationsDm, width, height, bounds, x, z) {
  const u = Math.max(0, Math.min(1, (x - bounds.minX) / (bounds.maxX - bounds.minX)));
  const v = Math.max(0, Math.min(1, (z - bounds.minZ) / (bounds.maxZ - bounds.minZ)));
  const px = u * (width - 1), pz = v * (height - 1);
  const x0 = Math.floor(px), z0 = Math.floor(pz);
  const x1 = Math.min(width - 1, x0 + 1), z1 = Math.min(height - 1, z0 + 1);
  const tx = px - x0, tz = pz - z0;
  const h00 = elevationsDm[z0 * width + x0], h10 = elevationsDm[z0 * width + x1];
  const h01 = elevationsDm[z1 * width + x0], h11 = elevationsDm[z1 * width + x1];
  return ((h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz) / 10;
}

async function Generate(options) {
  const config = {
    ...DEFAULTS,
    centerLat: NumberOption(options, "centerLat", DEFAULTS.centerLat),
    centerLon: NumberOption(options, "centerLon", DEFAULTS.centerLon),
    width: Math.round(NumberOption(options, "width", DEFAULTS.width)),
    height: Math.round(NumberOption(options, "height", DEFAULTS.height)),
  };
  const compressed = await Download(config.sourceUrl, rawPath, !!options.force);
  const raw = zlib.gunzipSync(compressed);
  const source = CreateHgtSampler(raw, config.tileSouth, config.tileWest);
  const meterScale = MetersPerDegree(config.centerLat);
  const bounds = { minX: config.minX, maxX: config.maxX, minZ: config.minZ, maxZ: config.maxZ };
  const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;
  const geoBounds = {
    north: config.centerLat - (bounds.minZ - centerZ) / meterScale.lat,
    south: config.centerLat - (bounds.maxZ - centerZ) / meterScale.lat,
    west: config.centerLon + bounds.minX / meterScale.lon,
    east: config.centerLon + bounds.maxX / meterScale.lon,
  };
  const elevationsDm = new Int16Array(config.width * config.height);
  let minDm = Infinity, maxDm = -Infinity;
  for (let row = 0; row < config.height; row += 1) {
    const v = row / (config.height - 1);
    const lat = geoBounds.north + (geoBounds.south - geoBounds.north) * v;
    for (let column = 0; column < config.width; column += 1) {
      const u = column / (config.width - 1);
      const lon = geoBounds.west + (geoBounds.east - geoBounds.west) * u;
      const dm = Math.round(source.sample(lat, lon) * 10);
      elevationsDm[row * config.width + column] = dm;
      minDm = Math.min(minDm, dm);
      maxDm = Math.max(maxDm, dm);
    }
  }
  const referenceElevationMeters = SampleArray(elevationsDm, config.width, config.height,
    bounds, config.referenceX, config.referenceZ);
  const meta = {
    id: "TaierzhuangSrtmN34E117",
    width: config.width,
    height: config.height,
    unit: "decimeter",
    worldBounds: bounds,
    geoBounds,
    center: { lat: config.centerLat, lon: config.centerLon, label: config.centerLabel },
    reference: { x: config.referenceX, z: config.referenceZ, elevationMeters: referenceElevationMeters },
    elevationMinMeters: minDm / 10,
    elevationMaxMeters: maxDm / 10,
    processing: "SRTM HGT 3x3 median, bilinear resample, no vertical exaggeration",
    source: {
      url: config.sourceUrl,
      registry: config.sourceRegistry,
      tile: "N34E117",
      hgtSamples: source.size,
      compressedSha256: Sha256(compressed),
      rawSha256: Sha256(raw),
      retrievedOn: config.retrievedOn,
      attribution: config.attribution,
    },
  };
  fs.mkdirSync(heightmapDir, { recursive: true });
  const png = EncodeHeightPng(config.width, config.height, elevationsDm, minDm, maxDm, {
    Title: "Taierzhuang SRTM Heightmap",
    Source: config.sourceUrl,
    Attribution: config.attribution,
    ElevationMinMeters: (minDm / 10).toFixed(1),
    ElevationMaxMeters: (maxDm / 10).toFixed(1),
    CenterLatLon: `${config.centerLat},${config.centerLon}`,
  });
  fs.writeFileSync(texturePath, png);
  fs.writeFileSync(dataPath, BuildDataModule(meta, elevationsDm), "utf8");
  console.log(JSON.stringify({
    texture: path.relative(projectDir, texturePath),
    data: path.relative(projectDir, dataPath),
    rawTile: path.relative(projectDir, rawPath),
    pngBytes: png.length,
    samples: `${config.width}x${config.height}`,
    elevationMeters: [minDm / 10, maxDm / 10],
    referenceElevationMeters,
    sourceSha256: meta.source.compressedSha256,
    geoBounds,
  }, null, 2));
}

async function LoadHeightModules() {
  if (!fs.existsSync(dataPath)) throw new Error("缺少生成数据；先运行 download");
  const stamp = `${Date.now()}_${process.pid}`;
  const dem = await import(`${pathToFileURL(dataPath).href}?v=${stamp}`);
  const finalPath = path.join(projectDir, "Script_JieheHeight.mjs");
  const final = fs.existsSync(finalPath)
    ? await import(`${pathToFileURL(finalPath).href}?v=${stamp}`) : null;
  return { dem, final };
}

async function Info() {
  const { dem } = await LoadHeightModules();
  console.log(JSON.stringify(dem.TAIZHUANG_HEIGHTMAP, null, 2));
}

async function Sample(options) {
  const x = NumberOption(options, "x", 0);
  const z = NumberOption(options, "z", -1470);
  const { dem, final } = await LoadHeightModules();
  const rawMeters = dem.SampleTaierzhuangDem(x, z);
  const result = { x, z, demElevationMeters: rawMeters };
  if (final) Object.assign(result, final.JieheHeightInfo(x, z));
  console.log(JSON.stringify(result, null, 2));
}

function MatchNode(value, sample, stats) {
  if (Array.isArray(value)) return value.map((item) => MatchNode(item, sample, stats));
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) out[key] = MatchNode(child, sample, stats);
  if (Number.isFinite(value.x) && Number.isFinite(value.z)) {
    const offset = Number.isFinite(value.groundOffset) ? value.groundOffset : 0;
    out.y = Math.round((sample(value.x, value.z) + offset) * 1000) / 1000;
    stats.matched += 1;
  }
  return out;
}

async function Match(options) {
  if (!options.input) throw new Error("match 需要 --input=placements.json");
  const inputPath = path.resolve(options.input);
  const document = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const { dem, final } = await LoadHeightModules();
  const mode = options.mode || "final";
  if (!final && mode !== "dem") throw new Error("缺少 Script_JieheHeight.mjs，不能匹配场景地面");
  const samplers = {
    dem: dem.SampleTaierzhuangDem,
    base: final?.SampleJieheBaseHeight,
    final: final?.SampleJieheHeight,
  };
  const sampler = samplers[mode];
  if (!sampler) throw new Error(`未知 --mode=${mode}；可选 dem/base/final`);
  const stats = { matched: 0 };
  const matched = MatchNode(document, sampler, stats);
  const json = `${JSON.stringify(matched, null, 2)}\n`;
  if (options.output) {
    const outputPath = path.resolve(options.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, json, "utf8");
    console.error(`贴地 ${stats.matched} 个布设点 → ${outputPath}`);
  } else process.stdout.write(json);
}

async function Verify() {
  const { dem, final } = await LoadHeightModules();
  const png = fs.readFileSync(texturePath);
  if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error("PNG 签名错误");
  }
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  const meta = dem.TAIZHUANG_HEIGHTMAP;
  if (width !== meta.width || height !== meta.height) {
    throw new Error(`PNG/Data 尺寸不一致：${width}x${height} vs ${meta.width}x${meta.height}`);
  }
  if (dem.TAIZHUANG_HEIGHTS_DM.length !== width * height) throw new Error("高程样本数量错误");
  const probes = [[0, -1470], [-620, -1620], [620, -900], [205, -1523]]
    .map(([x, z]) => ({ x, z, dem: dem.SampleTaierzhuangDem(x, z), sceneY: final?.SampleJieheHeight(x, z) }));
  console.log(JSON.stringify({ ok: true, width, height, samples: width * height, probes }, null, 2));
}

function Help() {
  console.log(`Taierzhuang1938 高度图 CLI\n\n`
    + `  download [--force] [--width=257 --height=193]  下载 SRTM 并生成 PNG/Data\n`
    + `  info                                          输出来源与地理元数据\n`
    + `  sample --x=0 --z=-1470                       查询 DEM 与最终场景高度\n`
    + `  match --input=a.json [--output=b.json]        给所有 {x,z} 布设补/更新 y\n`
    + `        [--mode=dem|base|final]                 dem=海拔；base=场景 DEM；final=含战术地形\n`
    + `  verify                                        核对 PNG/Data 与采样器\n`);
}

const { command, options } = ParseArgs(process.argv.slice(2));
try {
  if (command === "download") await Generate(options);
  else if (command === "info") await Info();
  else if (command === "sample") await Sample(options);
  else if (command === "match") await Match(options);
  else if (command === "verify") await Verify();
  else Help();
} catch (error) {
  console.error(`HeightmapCli: ${error.message || error}`);
  process.exit(1);
}
