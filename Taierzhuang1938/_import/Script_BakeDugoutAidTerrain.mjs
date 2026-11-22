// Continuous height grid for the shelter cut, foreground berm, and the field beyond.
// Only the height file is baked. Scene placements remain editable in SceneEditor.
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { EncodeSceneHeights } from "../Script_SceneDoc.mjs";

const sceneUrl = new URL("../Scenes/DugoutAidOpenFields/Scene_DugoutAidOpenFields.json", import.meta.url);

function Smooth(lo, hi, value) {
  const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

export function DugoutHeight(x, z) {
  const field = 0.48 + 0.065 * Math.sin(x * 0.061 - z * 0.103) + 0.04 * Math.sin(z * 0.23 + x * 0.087);
  const toField = Smooth(1.6, 8.7, -z);
  const near = 1 - Smooth(1.5, 8, -z);
  const floor = -0.06 + 0.035 * Math.sin(x * 3.7 - z * 2.1) + 0.024 * Math.cos(x * 7.2 + z * 4.35);
  const leftShoulder = 0.85 * Smooth(1.15, 3.65, -x) * Smooth(-1.2, 3.65, z);
  const rightShoulder = 0.90 * Smooth(2.05, 3.90, x) * Smooth(-2.9, 0.32, z);
  const ridgeZ = 3.48 + 0.39 * Math.min(2, Math.max(-2.5, x)) + 0.06 * Math.sin(x * 3.7);
  const ridgeHeight = 0.52 + 0.25 * Smooth(0.02, 1.25, -x) - 0.18 * Smooth(0.05, 1.4, x);
  const berm = ridgeHeight * Math.exp(-((z - ridgeZ) ** 2) / (z < ridgeZ ? 0.39 : 1.36));
  return field * toField + floor * (1 - toField) + near * (leftShoulder + rightShoulder + berm);
}

export function DugoutHeightFile(terrain) {
  const { cols, rows, minX, minZ, cellM } = terrain;
  const heights = new Float32Array((cols + 1) * (rows + 1));
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= cols; col++) {
      heights[row * (cols + 1) + col] = DugoutHeight(minX + col * cellM, minZ + row * cellM);
    }
  }
  return EncodeSceneHeights(heights);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { terrain } = JSON.parse(fs.readFileSync(sceneUrl, "utf8"));
  const path = new URL(terrain.file, sceneUrl);
  const bytes = DugoutHeightFile(terrain);
  if (process.argv.includes("--check")) {
    if (!fs.readFileSync(path).equals(bytes)) throw new Error("Dugout height file is out of date");
  } else fs.writeFileSync(path, bytes);
  console.log(`${terrain.file}: ${bytes.length} bytes`);
}
