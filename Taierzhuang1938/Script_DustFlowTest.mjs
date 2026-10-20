// 落地扬尘的规则层回归（纯 node，零 three）：Script_DustFlow 在一条合成壕沟上的形状。
// 用户硬要求：「起始形态上一个长得和壕沟形状一致的尘土」—— 这里守的就是这条：
//   1. 沟里炸：被沟壁夹住（confined 高），尘顺着沟走得远、横着几乎出不去；
//   2. 平地炸：四个方向差不多（不会凭空偏）；
//   3. 斜着砸进去：下游一侧多；
//   4. 不凭空造尘、全是有限非负数、两次一模一样、最后会收工。
import assert from "node:assert/strict";
import { DustFlowField, ImpactScale } from "./Script_DustFlow.mjs";

const Smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
// 一条沿 x 走的射击壕（深 2 m、沟底宽 2.6 m、坡宽 1.1 m），x = ±12 m 处折向（traverse），沟外两侧 0.35 m 弃土垄。
const LINE = [[-40, -6], [-12, -6], [-8, 0], [8, 0], [12, -6], [40, -6]];
function Dist(x, z) {
  let best = Infinity;
  for (let i = 1; i < LINE.length; i++) {
    const [ax, az] = LINE[i - 1], [bx, bz] = LINE[i];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}
const TrenchGround = (x, z) => {
  const d = Dist(x, z);
  return -2 * (1 - Smooth((d - 1.3) / 1.1)) + 0.35 * Math.exp(-(((d - 3.3) / 0.8) ** 2));
};
const FlatGround = () => 0;

function Run(options, seconds, dt = 1 / 60) {
  const field = new DustFlowField(options);
  let t = 0;
  while (t < seconds - 1e-9) { field.Step(dt); t += dt; }
  return field;
}
const Shell75 = 0.81;

// --- 1) 沟里炸 -------------------------------------------------------------
const trench = Run({ x: 0, z: 0, chargeKg: Shell75, groundAt: TrenchGround }, 1.0);
const ti = trench.Inspect();
assert.ok(ti.confined > 0.45, `in-trench burst is confined (${ti.confined})`);
assert.ok(ti.boost > 1.3, `blocked blast is redirected along the trench (${ti.boost})`);
let along = 0, across = 0;
for (const s of [-1, 1]) for (const d of [5, 6, 7]) {
  along += trench.SurgeAt(s * d, 0).s;          // 沟底，顺沟
  across += trench.SurgeAt(0, s * d).s;          // 同样距离，横出去（沟外地面）
}
assert.ok(along > 0.05, `dust travels along the trench (${along.toFixed(3)})`);
assert.ok(along > 3 * across, `along-trench dust ≫ across (${along.toFixed(3)} vs ${across.toFixed(3)})`);
// 整体形状：看得见的尘浪覆盖区的二阶矩，顺沟（x）方向的展开要明显大于横向（z）—— 一条沿沟的尘带，不是一个圆
const Spread = (f) => {
  let w = 0, xx = 0, zz = 0;
  for (let j = 0; j < f.N; j++) for (let i = 0; i < f.N; i++) {
    if (f.Sg[j * f.N + i] < 0.15) continue;      // 看得见的那片（光学深度 0.15 以上）的形状，不按尘量加权
    const x = f.minX + (i + 0.5) * f.cell - f.cx, z = f.minZ + (j + 0.5) * f.cell - f.cz;
    w += 1; xx += x * x; zz += z * z;
  }
  return Math.sqrt(xx / zz);
};
const early = Run({ x: 0, z: 0, chargeKg: Shell75, groundAt: TrenchGround }, 0.4);
const elongEarly = Spread(early), elong = Spread(trench);
assert.ok(elongEarly > 1.6, `0.4 s: the dust is a band along the trench (along/across spread ${elongEarly.toFixed(2)})`);
assert.ok(elong > 1.5, `1.0 s: still elongated along the trench (${elong.toFixed(2)})`);
// 沟里那一层要贴着沟底：在沟里取到的尘浪底面就是沟底（2 m 深）
assert.ok(trench.SurgeAt(6, 0).ground < -1.5, "surge sits on the trench floor");
// 土柱：沟里炸比平地高
const flat = Run({ x: 0, z: 0, chargeKg: Shell75, groundAt: FlatGround }, 1.0);
const fi = flat.Inspect();
assert.ok(fi.confined < 0.1, `open-ground burst is not confined (${fi.confined})`);
assert.ok(ti.columnHeight > fi.columnHeight * 1.15, "a trench burst throws a taller column");
const round = Spread(flat);
assert.ok(round > 0.85 && round < 1.18, `open ground footprint is round (${round.toFixed(2)})`);

// --- 2) 平地炸：四向对称 ---------------------------------------------------
const q = (f, x, z) => f.SurgeAt(x, z).s;
const east = q(flat, 4, 0) + q(flat, 5, 0), west = q(flat, -4, 0) + q(flat, -5, 0);
const south = q(flat, 0, 4) + q(flat, 0, 5), north = q(flat, 0, -4) + q(flat, 0, -5);
for (const [a, b, label] of [[east, west, "east/west"], [south, north, "south/north"], [east, south, "east/south"]]) {
  assert.ok(a > 0 && b > 0, `open ground spreads ${label}`);
  assert.ok(a / b > 0.7 && a / b < 1.43, `open ground is isotropic ${label} (${(a / b).toFixed(2)})`);
}

// --- 3) 斜着砸进去：下游多 ---------------------------------------------------
const oblique = Run({ x: 0, z: 0, chargeKg: Shell75, groundAt: FlatGround, incoming: { x: 200, y: -60, z: 0 } }, 1.0);
const down = q(oblique, 4, 0) + q(oblique, 5, 0), up = q(oblique, -4, 0) + q(oblique, -5, 0);
assert.ok(down > up * 1.3, `downrange side receives more ejecta (${down.toFixed(3)} vs ${up.toFixed(3)})`);

// --- 4) 守恒、有限、可复现、收工 ---------------------------------------------
for (const f of [trench, flat, oblique]) {
  for (const arr of [f.H, f.Sg, f.FS, f.M, f.MZb, f.MZt, f.MR, f.MF]) {
    for (const v of arr) assert.ok(Number.isFinite(v) && v >= 0 || (arr === f.MZb || arr === f.MZt) && Number.isFinite(v), "fields stay finite");
  }
  const made = f.injectedSurge + f.columnQ;
  assert.ok(f.TotalSurge() + f.TotalLoft() <= made * 1.001 + 1e-6, "no dust is created from nothing");
}
const a = Run({ x: 0, z: 0, chargeKg: Shell75, groundAt: TrenchGround, wind: { x: 1.2, z: 0.4 } }, 2.5);
const b = Run({ x: 0, z: 0, chargeKg: Shell75, groundAt: TrenchGround, wind: { x: 1.2, z: 0.4 } }, 2.5);
const pa = [new Float32Array(a.N * a.N * 4), new Float32Array(a.N * a.N * 4)], pb = [new Float32Array(b.N * b.N * 4), new Float32Array(b.N * b.N * 4)];
const ia = a.Pack(...pa), ib = b.Pack(...pb);
assert.deepEqual(ia, ib, "pack metadata is deterministic");
assert.ok(pa[0].every((v, i) => v === pb[0][i]) && pa[1].every((v, i) => v === pb[1][i]), "simulation is bit-identical run to run");
assert.ok(ia.maxY > ia.minY + 3 && ia.maxX > ia.minX, "render box encloses the cloud");
// 悬浮尘随风走：8 s 后悬浮网格整体往下风方向挪
const drift = Run({ x: 0, z: 0, chargeKg: Shell75, groundAt: FlatGround, wind: { x: 2, z: 0 } }, 8);
assert.ok(drift.loftX - drift.minX > 5, `lofted cloud drifts downwind (${(drift.loftX - drift.minX).toFixed(2)} m)`);
const life = new DustFlowField({ x: 0, z: 0, chargeKg: 0.165, groundAt: FlatGround });
let steps = 0;
while (life.Step(0.1) && steps < 2000) steps++;
assert.ok(life.finished && steps < 2000, "a field retires on its own");

// --- 5) 尺度律：装药越大越大，按立方根 ---------------------------------------
const g = ImpactScale(0.165), s = ImpactScale(0.81), bomb = ImpactScale(100);
assert.ok(g.columnH < s.columnH && s.columnH < bomb.columnH && bomb.columnH / s.columnH < 6, "column height scales with cube root");
assert.ok(new DustFlowField({ x: 0, z: 0, chargeKg: 100, groundAt: FlatGround }).N <= 96, "grid stays within budget for a 250 kg bomb");

console.log(`PASS DustFlowTest: trench confined ${ti.confined} boost ${ti.boost}, along/across ${(along / Math.max(1e-6, across)).toFixed(1)}x, spread ${elongEarly.toFixed(2)}@0.4s ${elong.toFixed(2)}@1s, `
  + `open ground isotropic, downrange ${(down / Math.max(1e-6, up)).toFixed(2)}x, deterministic, drift, retire`);
