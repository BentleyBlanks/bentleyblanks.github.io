import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sceneDir = new URL("../../Scenes/AircraftEvacuationDitch/", import.meta.url);
const { terrain } = JSON.parse(readFileSync(new URL("Scene_AircraftEvacuationDitch.json", sceneDir), "utf8"));
const { cols, rows, cellM, minX, minZ, file } = terrain;
const output = fileURLToPath(new URL(file, sceneDir));

function Smooth(from, to, value) {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

function Mound(x, z, centerX, centerZ, wide, long, height) {
  return height * Math.exp(-(((x - centerX) / wide) ** 2 + ((z - centerZ) / long) ** 2));
}

function Height(x, z) {
  const roadCenter = 0.18 + 3.9 * Smooth(-1, -38, z) + 0.52 * Math.sin(-z * .23);
  const right = x > roadCenter;
  const advance = Smooth(-3, -26, z);
  const side = Math.abs(x - roadCenter);
  const edge = (right ? 1.36 : 1.75) + advance * .71
    + .17 * Math.sin(z * .62 + (right ? .3 : 1.7)) + .11 * Math.sin(z * 1.57);
  const brokenLip = .13 * Math.sin(z * 2.37 + x * .85) + .11 * Math.sin(z * 1.17 - x * 4.2);
  const cut = Smooth(edge, edge + (right ? 1.12 : 1.45), side + brokenLip);
  const rise = (right ? 1.73 : 1.42) + (right ? .31 : .19) * Math.sin(-z * .56)
    + (right ? .14 : .10) * Math.sin(-z * 1.7);
  const roadCut = 1 - Smooth(-40, -76, z);
  const ditch = (cut - 1) * rise * roadCut;
  const yard = 1.30 + .13 * Math.sin(.168 * x - z * .09) + .16 * Math.cos(z * .16 + x * .05);
  const rightShoulder = Mound(x,z,7.8,-9.9,3.4,5.1,.23);
  const rubbleRidge = Mound(x,z,-.9,-28,2.5,4.8,1.02) + Mound(x,z,8.5,-43,6,11,.48);
  const distanceFade = 1 - .74 * Smooth(-20,-78,z);
  const ruts = -.048 * (Math.exp(-(((x-roadCenter-.69)/.25)**2)) + Math.exp(-(((x-roadCenter+.71)/.25)**2)));
  const floor = (1 - cut) * ((ruts + .043 * Math.sin(z*.69)) * roadCut);
  const ravel = (.075 + .085*cut * (1-cut)*4) * distanceFade
    * (.74*Math.sin(4.7*x + 3.1*z) + .45*Math.sin(10.14*z-2.61*x) + .34*Math.sin(12.21*x+13.31*z));
  const ground = yard + ditch + rightShoulder + rubbleRidge + floor + ravel;
  return ground * (1 - .66 * Smooth(-58,-188,z));
}

const bytes = Buffer.alloc((cols + 1) * (rows + 1) * 2);
for (let row = 0; row <= rows; row++) {
  for (let col = 0; col <= cols; col++) {
    const height = Height(minX + col * cellM, minZ + row * cellM);
    bytes.writeInt16LE(Math.round(height * 100), 2 * (row * (cols + 1) + col));
  }
}
if (process.argv.includes("--check")) {
  if (!bytes.equals(readFileSync(output))) throw new Error("Scene height field differs from the terrain recipe");
} else {
  writeFileSync(output, bytes);
}
console.log(`${cols + 1} × ${rows + 1} terrain samples · ${bytes.length} bytes · ${output}`);
