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

// Banks exposed near the camera. The centre of each run follows its own
// downslope path and the broken shoulders soften into the original heightfield.
const NEAR_BANK_RELIEF = [
  [-2.34, -3.42, .47, .22, -.68, -.28],
  [-2.56, -3.09, .49, .20, -.50,  .13],
  [-2.43, -3.92, .48, .19, -.82, -.17],
  [-2.31, -4.72, .62, .27,  .45, -.21],
  [ 2.91, -4.86, .65, .24, -.77, -.28],
  [ 3.08, -4.54, .70, .19, -.66,  .13],
  [ 3.12, -4.31, .65, .18, -.69, -.22],
  [ 3.29, -3.84, .63, .26, -.87, -.17],
  [ 3.54, -3.63, .70, .27, -.65,  .13],
  [ 3.70, -4.73, .62, .31, -.66,  .16],
];

function Noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const tx = Smooth(ix, ix + 1, x), tz = Smooth(iz, iz + 1, z);
  const Sample = (gx, gz) => {
    const hash = Math.imul(gx + 5143, 374761393) ^ Math.imul(gz - 1823, 668265263);
    return (Math.imul(hash ^ (hash >>> 13), 1274126177) >>> 0) / 2147483648 - 1;
  };
  const front = Sample(ix, iz) * (1 - tx) + Sample(ix + 1, iz) * tx;
  const back = Sample(ix, iz + 1) * (1 - tx) + Sample(ix + 1, iz + 1) * tx;
  return front * (1 - tz) + back * tz;
}

function Height(x, z) {
  const roadCenter = 0.18 + 8.6 * Smooth(-5, -34, z) + 0.44 * Math.sin(-z * .23);
  const right = x > roadCenter;
  const advance = Smooth(-3, -26, z);
  const side = Math.abs(x - roadCenter);
  const shoulderOpening = right ? .32 * Math.exp(-(((z + 7.6) / 5.4) ** 2)) : 0;
  const edge = (right ? 1.49 : 1.75) + advance * .47 + shoulderOpening
    + .26 * Noise(right ? 7 : 4, z * .69) + .18 * Noise(right ? 2 : 5, z * 1.81);
  // Larger gullies continue down the bank from the same break in the lip.
  const channels = Noise(z * 1.62 + .44 * side, right ? 22 : 12);
  const brokenLip = .19 * channels + .10 * Noise(x * 2.4, z * 2.2);
  const shoulder = right ? 1.40 : 1.51;
  const distanceAcross = (side + brokenLip - edge) / shoulder;
  const toe = Smooth(0, .58, distanceAcross);
  const cut = Smooth(.23, 1, distanceAcross) * .77 + toe * .23;
  const rise = (right ? 1.73 : 1.42) + (right ? .31 : .19) * Math.sin(-z * .56)
    + (right ? .14 : .10) * Math.sin(-z * 1.7);
  const roadCut = 1 - Smooth(-40, -76, z);
  const ditch = (cut - 1) * rise * roadCut;
  const yard = 1.32 + .15 * Math.sin(.168 * x - z * .09) + .12 * Math.cos(z * .16 + x * .05);
  const rightShoulder = Mound(x,z,7.8,-9.9,3.4,5.1,.23);
  const shoulderCove = Mound(x,z,4.45,-9.12,1.46,4.7,-.20);
  const rubbleRidge = Mound(x,z,-.9,-28,2.5,4.8,1.02) + Mound(x,z,8.5,-43,6,11,.48)
    + Mound(x,z,-10.75,-12.35,1.6,1.4,.26);
  const distanceFade = 1 - .74 * Smooth(-20,-78,z);
  const rutSway = .12 * Noise(2.8, z * .66);
  const ruts = -.068 * (Math.exp(-(((x-roadCenter-.69-rutSway)/.23)**2))
    + Math.exp(-(((x-roadCenter+.71-rutSway)/.23)**2)));
  const floor = (1 - cut) * (ruts + .072 * Noise(x * 1.7, z * 1.2)) * roadCut;
  const face = 4 * cut * (1 - cut) * roadCut;
  const ravel = distanceFade * (
    .083 * Noise(x * 1.6, z * 1.45) + .045 * Noise(x * 4.1, z * 3.7)
    + face * (.18 * channels + .082 * Noise(z * .62, side * 3.5)));
  const erosion = NEAR_BANK_RELIEF.reduce((value, [cx, cz, width, length, angle, depth]) =>
    value + Mound(x,z,cx,cz + (x - cx) * angle,width,length,depth), 0);
  const ground = yard + ditch + rightShoulder + shoulderCove + rubbleRidge + floor + ravel + erosion;
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
