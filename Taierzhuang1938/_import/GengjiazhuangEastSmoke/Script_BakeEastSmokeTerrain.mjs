// Rebuild only the heightfield. The scene JSON is the source for placement, paint and camera.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EncodeSceneHeights } from "../../Script_SceneDoc.mjs";

const sceneDir = new URL("../../Scenes/GengjiazhuangEastSmoke/", import.meta.url);
const roadSections = [
  [0.0, -6.2, 3.65], [2.55, -3.75, 3.75], [3.72, -.55, 3.9],
  [5.55, 2.45, 4.3], [8.2, 4.65, 4.1], [12, 6.58, 3.7],
  [21, 11.7, 3.1], [34, 20.45, 2.8], [44, 26.1, 2.65],
  [61, 31, 2.6], [96, 43, 2.4], [140, 54, 2.2],
];

function Smooth(t) {
  const n = Math.max(0, Math.min(1, t));
  return n * n * (3 - 2 * n);
}

function Mix(a, b, k) { return a + (b - a) * k; }

export function RoadSection(depth) {
  const next = roadSections.findIndex(([d]) => d > depth);
  if (next === 0) return roadSections[0].slice(1);
  if (next === -1) return roadSections.at(-1).slice(1);
  const [a, b] = roadSections.slice(next - 1, next + 1);
  const before = roadSections[Math.max(0, next - 2)], after = roadSections[Math.min(roadSections.length - 1, next + 1)];
  const length = b[0] - a[0], t = (depth - a[0]) / length;
  const m0 = (b[1] - before[1]) / (b[0] - before[0]) * length;
  const m1 = (after[1] - a[1]) / (after[0] - a[0]) * length;
  const bankX = a[1] + m0 * t + (3 * (b[1] - a[1]) - 2 * m0 - m1) * t * t
    + (2 * (a[1] - b[1]) + m0 + m1) * t * t * t;
  return [bankX, Mix(a[2], b[2], t)];
}

export function GroundAt(x, z) {
  const depth = -z;
  const [bankX, width] = RoadSection(depth);
  const wobble = .16 * Math.sin(z * 1.7) + .09 * Math.sin(4.1 * z + .6);
  const left = bankX + wobble, right = bankX + width + Math.max(0, 3.4 - depth) * 2.6;
  const floorInfluence = Smooth((x - left + .10) / .97) * Smooth((right - x + .45) / .89);
  const leftShoulder = Math.exp(-((x - left + .33) ** 2) / .75);
  const rolls = .062 * Math.sin(x * .85 + z * 1.19) + .045 * Math.sin(x * 1.67 - z * .57);
  const furrows = .038 * Math.sin(z * 5.1 + .54 * Math.sin(x * .56));
  const rough = .042 * Math.sin(x * 6.1 + z * 5.31) + .025 * Math.sin(x * 8.7 - z * 5.7);
  const nearBankDrop = .21 * Smooth((12 - depth) / 8.4) * (1 - Smooth((x - .8) / 3.7));
  const base = .78 - .54 * Smooth((depth - 5.0) / 37) - nearBankDrop;
  const shoulder = base + rolls + furrows + rough + leftShoulder * (.09 + .055 * Math.sin(x * 3.7));
  const inside = (x - left) / (right - left);
  const rut = Math.exp(-((inside - .32) ** 2) / .012) + Math.exp(-((inside - .72) ** 2) / .012);
  const floor = -.18 + .47 * Smooth((depth - 4) / 47) - .032 * rut + .028 * Math.sin(x * 2.47 + z * 1.94);
  return Mix(shoulder, floor, floorInfluence * (1 - .82 * Smooth((depth - 21) / 27)));
}

function BakeHeightfield() {
  const doc = JSON.parse(readFileSync(new URL("Scene_GengjiazhuangEastSmoke.json", sceneDir), "utf8"));
  const { file, minX, minZ, cellM, cols, rows } = doc.terrain;
  const heights = new Float32Array((cols + 1) * (rows + 1));
  for (let row = 0; row <= rows; row++) {
    const z = minZ + row * cellM;
    for (let col = 0; col <= cols; col++) heights[row * (cols + 1) + col] = GroundAt(minX + col * cellM, z);
  }
  const encoded = Buffer.from(EncodeSceneHeights(heights));
  const url = new URL(file, sceneDir);
  if (process.argv.includes("--check")) {
    if (!encoded.equals(readFileSync(url))) throw new Error(`Heightfield differs from ${file}`);
    console.log(`Heightfield verified: ${cols + 1} × ${rows + 1}`);
  } else {
    writeFileSync(url, encoded);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) BakeHeightfield();
