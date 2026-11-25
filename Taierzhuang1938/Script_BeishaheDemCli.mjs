#!/usr/bin/env node
// 滕县北沙河真实 SRTM 30 m 高程图生成与校验 CLI（零第三方依赖）。
// 数据源：Mapzen Terrain Tiles (AWS Open Data) N35E117.hgt.gz，中心对标 OSM 核验的京沪铁路北沙河桥 (35.145029°N, 117.106797°E)。
//
// 用法：
//   node Taierzhuang1938/Script_BeishaheDemCli.mjs generate
//   node Taierzhuang1938/Script_BeishaheDemCli.mjs verify

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const heightmapDir = path.join(projectDir, "Heightmap");
const rawDir = path.join(heightmapDir, "_raw");
const rawPath = path.join(rawDir, "Data_SourceN35E117.hgt.gz");
const texturePath = path.join(heightmapDir, "Texture_BeishaheDem.png");
const dataPath = path.join(heightmapDir, "Data_BeishaheDem.mjs");

const DEFAULTS = Object.freeze({
  sourceUrl: "https://s3.amazonaws.com/elevation-tiles-prod/skadi/N35/N35E117.hgt.gz",
  sourceRegistry: "https://registry.opendata.aws/terrain-tiles/",
  attribution: "SRTM terrain data courtesy of the U.S. Geological Survey; tiles hosted by Mapzen on AWS Open Data",
  retrievedOn: "2026-11-25",
  // docs/Data_BeishaheBridge.md: 现代京沪铁路跨北沙河中点 (35.145029N, 117.106797E)
  centerLat: 35.145029,
  centerLon: 117.106797,
  centerLabel: "滕州北沙河铁路桥（OSM 核验，docs/Data_BeishaheBridge.md）",
  tileSouth: 35,
  tileWest: 117,
  // 覆盖 12.288 km × 12.288 km（与 Encounter Designer 四叉树半径 6144 m 一致，格距 48 m）
  minX: -6144,
  maxX: 6144,
  minZ: -6144,
  maxZ: 6144,
  width: 257,
  height: 257,
});

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

async function EnsureRaw(force = false) {
  if (!force && fs.existsSync(rawPath)) return fs.readFileSync(rawPath);
  fs.mkdirSync(rawDir, { recursive: true });
  const response = await fetch(DEFAULTS.sourceUrl, { headers: { "user-agent": "Taierzhuang1938-BeishaheDemCli/1.0" } });
  if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(rawPath, buffer);
  return buffer;
}

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
      return (h00 + (h10 - h00) * tc) * (1 - tr) + (h01 + (h11 - h01) * tc) * tr;
    },
  };
}

function Crc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
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

function EncodeGray16Png(width, height, values, metadata) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 16; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = 1 + width * 2;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < width; x++) {
      raw.writeUInt16BE(values[y * width + x], y * stride + 1 + x * 2);
    }
  }
  const chunks = [
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    PngChunk("IHDR", ihdr),
    ...Object.entries(metadata).map(([k, v]) => PngChunk("tEXt", Buffer.from(`${k}\0${v}`, "latin1"))),
    PngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    PngChunk("IEND", Buffer.alloc(0)),
  ];
  return Buffer.concat(chunks);
}

async function Generate() {
  const gz = await EnsureRaw(false);
  const raw = zlib.gunzipSync(gz);
  const sampler = CreateHgtSampler(raw, DEFAULTS.tileSouth, DEFAULTS.tileWest);
  const mpd = MetersPerDegree(DEFAULTS.centerLat);
  const { width, height, minX, maxX, minZ, maxZ } = DEFAULTS;
  const referenceElev = Number(sampler.sample(DEFAULTS.centerLat, DEFAULTS.centerLon).toFixed(2));

  const dm = new Int16Array(width * height);
  let minM = Infinity, maxM = -Infinity;
  for (let iz = 0; iz < height; iz++) {
    const z = minZ + (maxZ - minZ) * (iz / (height - 1));
    const lat = DEFAULTS.centerLat - z / mpd.lat;
    for (let ix = 0; ix < width; ix++) {
      const x = minX + (maxX - minX) * (ix / (width - 1));
      const lon = DEFAULTS.centerLon + x / mpd.lon;
      const elev = sampler.sample(lat, lon);
      if (elev < minM) minM = elev;
      if (elev > maxM) maxM = elev;
      dm[iz * width + ix] = Math.round(elev * 10);
    }
  }

  const span = Math.max(0.1, maxM - minM);
  const gray16 = new Uint16Array(width * height);
  for (let i = 0; i < dm.length; i++) {
    gray16[i] = Math.max(0, Math.min(65535, Math.round(((dm[i] / 10 - minM) / span) * 65535)));
  }

  const meta = {
    id: "BeishaheSrtmN35E117",
    width,
    height,
    unit: "decimeter",
    worldBounds: { minX, maxX, minZ, maxZ },
    geoBounds: {
      north: DEFAULTS.centerLat - minZ / mpd.lat,
      south: DEFAULTS.centerLat - maxZ / mpd.lat,
      west: DEFAULTS.centerLon + minX / mpd.lon,
      east: DEFAULTS.centerLon + maxX / mpd.lon,
    },
    center: { lat: DEFAULTS.centerLat, lon: DEFAULTS.centerLon, label: DEFAULTS.centerLabel },
    reference: { x: 0, z: 0, elevationMeters: referenceElev },
    elevationMinMeters: Number(minM.toFixed(1)),
    elevationMaxMeters: Number(maxM.toFixed(1)),
    processing: "SRTM HGT 3x3 median, bilinear resample, 1:1 metric elevation",
    source: {
      url: DEFAULTS.sourceUrl,
      registry: DEFAULTS.sourceRegistry,
      tile: "N35E117",
      hgtSamples: sampler.size,
      compressedSha256: Sha256(gz),
      rawSha256: Sha256(raw),
      retrievedOn: DEFAULTS.retrievedOn,
      attribution: DEFAULTS.attribution,
    },
  };

  fs.mkdirSync(heightmapDir, { recursive: true });
  const png = EncodeGray16Png(width, height, gray16, {
    Source: DEFAULTS.sourceUrl,
    Center: `${DEFAULTS.centerLat},${DEFAULTS.centerLon}`,
    ElevationMinM: String(meta.elevationMinMeters),
    ElevationMaxM: String(meta.elevationMaxMeters),
  });
  fs.writeFileSync(texturePath, png);

  const bytes = Buffer.alloc(dm.length * 2);
  for (let i = 0; i < dm.length; i++) bytes.writeInt16LE(dm[i], i * 2);
  const b64 = bytes.toString("base64");
  const lines = [];
  for (let i = 0; i < b64.length; i += 100) lines.push(`  "${b64.slice(i, i + 100)}"${i + 100 < b64.length ? " +" : ";"}`);

  const moduleSource = [
    "// 由 Script_BeishaheDemCli.mjs 从真实 AWS Open Data SRTM N35E117 生成，不要手改。",
    "// 高程单位：0.1 m；行序：相对北沙河桥的局部 z 从北（minZ=-6144）到南（maxZ=6144），x 从西到东。",
    "",
    `export const BEISHAHE_DEM = Object.freeze(${JSON.stringify(meta, null, 2)});`,
    "",
    "const HEIGHTS_BASE64 =",
    ...lines,
    "",
    "function DecodeHeights() {",
    "  let bytes;",
    "  if (typeof Buffer !== \"undefined\") bytes = Uint8Array.from(Buffer.from(HEIGHTS_BASE64, \"base64\"));",
    "  else {",
    "    const raw = atob(HEIGHTS_BASE64);",
    "    bytes = Uint8Array.from(raw, (ch) => ch.charCodeAt(0));",
    "  }",
    "  const heights = new Int16Array(bytes.length / 2);",
    "  for (let i = 0; i < heights.length; i += 1) {",
    "    let value = bytes[i * 2] | (bytes[i * 2 + 1] << 8);",
    "    if (value & 0x8000) value -= 0x10000;",
    "    heights[i] = value;",
    "  }",
    "  return heights;",
    "}",
    "",
    "export const BEISHAHE_DEM_HEIGHTS_DM = DecodeHeights();",
    "",
    "/** 返回相对北沙河铁路桥中心的 SRTM 真实海拔（米）。dx 向东、dz 向南。 */",
    "export function SampleBeishaheDem(dx, dz) {",
    "  const m = BEISHAHE_DEM;",
    "  const u = Math.max(0, Math.min(1, (dx - m.worldBounds.minX) / (m.worldBounds.maxX - m.worldBounds.minX)));",
    "  const v = Math.max(0, Math.min(1, (dz - m.worldBounds.minZ) / (m.worldBounds.maxZ - m.worldBounds.minZ)));",
    "  const px = u * (m.width - 1), pz = v * (m.height - 1);",
    "  const x0 = Math.floor(px), z0 = Math.floor(pz);",
    "  const x1 = Math.min(m.width - 1, x0 + 1), z1 = Math.min(m.height - 1, z0 + 1);",
    "  const tx = px - x0, tz = pz - z0;",
    "  const row0 = z0 * m.width, row1 = z1 * m.width;",
    "  const north = BEISHAHE_DEM_HEIGHTS_DM[row0 + x0] * (1 - tx) + BEISHAHE_DEM_HEIGHTS_DM[row0 + x1] * tx;",
    "  const south = BEISHAHE_DEM_HEIGHTS_DM[row1 + x0] * (1 - tx) + BEISHAHE_DEM_HEIGHTS_DM[row1 + x1] * tx;",
    "  return (north * (1 - tz) + south * tz) / 10;",
    "}",
    "",
  ].join("\n");
  fs.writeFileSync(dataPath, moduleSource, "utf8");
  console.log("Generated:", path.relative(projectDir, dataPath), path.relative(projectDir, texturePath));
  console.log("Range:", meta.elevationMinMeters, "..", meta.elevationMaxMeters, "m (bridge ref:", meta.reference.elevationMeters, "m)");
}

const cmd = process.argv[2] || "generate";
if (cmd === "generate" || cmd === "download") await Generate();
else if (cmd === "verify") {
  const { BEISHAHE_DEM, SampleBeishaheDem } = await import("./Heightmap/Data_BeishaheDem.mjs");
  const ref = SampleBeishaheDem(0, 0);
  const ne = SampleBeishaheDem(3500, -5500);
  const sw = SampleBeishaheDem(-4500, 4500);
  if (!(ne > ref + 15 && sw < ref - 5)) throw new Error(`DEM relief sanity check failed: ref=${ref}, ne=${ne}, sw=${sw}`);
  console.log("OK Beishahe DEM verified:", { id: BEISHAHE_DEM.id, ref, ne, sw, min: BEISHAHE_DEM.elevationMinMeters, max: BEISHAHE_DEM.elevationMaxMeters });
}
