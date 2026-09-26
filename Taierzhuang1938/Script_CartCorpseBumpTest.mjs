// 牛马车压过尸体的纯规则回归（纯 Node，秒级）：Script_CartCorpseBump。
//   · 轮子滚过障碍的抬升曲线：正上方最高、一个轮半径外为零、两侧对称；
//   · 顶面格：原型点乘实例矩阵落到世界（含 90° 偏航），取最高点；
//   · 命中体 → 胶囊段（capsule / sphere / ellipsoid），胶囊表面高度；
//   · 车沿直线压过一具横躺的尸体：真的抬起来、有封顶、过后还软软地弹、最后回零、不陷地；
//   · 只垫右轮 → 右侧抬起（roll>0）；两轮都垫 → 车头往下（pitch<0），辕头那点不动；
//   · 30 fps 与 120 fps 的弹簧走出来的曲线一致（子步积分）。
import {
  BuildAftermathTopField, CartDeckLift, CartPoseFromWheels, CartSuspension, CorpseSegments,
  CorpseTopField, SegmentTop, WheelLift,
} from "./Script_CartCorpseBump.mjs";
import { MID_TUNING } from "./Data_Tuning_FirstLevelMid.mjs";

const B = MID_TUNING.cartCorpseBump;
let failures = 0;
function Check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
const Near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// --- 轮子抬升曲线 ---------------------------------------------------------
{
  const block = (x) => (Math.abs(x) <= 0.2 ? 0.25 : 0); // 沿 x 方向一条 0.4 m 宽、0.25 m 高的横梁
  const at = (cx) => WheelLift(cx, 0, 1, 0, (x) => block(x));
  const top = at(0), far = at(B.wheelRadiusM + 0.25), left = at(-0.4), right = at(0.4);
  Check("wheel lift peaks on top of the obstacle", Near(top, 0.25, 1e-9), `top=${top.toFixed(3)}`);
  Check("wheel lift is zero a radius away", far === 0, `far=${far}`);
  Check("wheel lift is symmetric and smaller on the approach", Near(left, right, 1e-9) && left > 0 && left < top,
    `left=${left.toFixed(3)} right=${right.toFixed(3)}`);
}

// --- 顶面格：原型点乘实例矩阵 --------------------------------------------
{
  // 一条沿局部 X 躺着的「身体」：x∈[-0.8,0.8]、顶面 0.3。
  const xs = [], ys = [], zs = [];
  for (let x = -0.8; x <= 0.8; x += 0.02) for (let z = -0.2; z <= 0.2; z += 0.02) { xs.push(x); ys.push(0.3); zs.push(z); xs.push(x); ys.push(0); zs.push(z); }
  const position = { count: xs.length, getX: (i) => xs[i], getY: (i) => ys[i], getZ: (i) => zs[i] };
  // 偏航 90°（局部 +X → 世界 -Z），摆在 (10, 5, 20)，列主序。
  const matrix = { elements: [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 10, 5, 20, 1] };
  const aftermath = { prototypes: new Map([["p", { parts: [{ tiers: [{ attributes: { position } }] }], members: [{ matrix }] }]]) };
  const field = BuildAftermathTopField(aftermath, new CorpseTopField());
  Check("top field keeps the upper surface", Near(field.Top(10, 20), 5.3, 1e-6), `top=${field.Top(10, 20)}`);
  Check("top field follows the instance yaw", field.Top(10, 20.7) > 5 && field.Top(10.7, 20) === -Infinity,
    `along=${field.Top(10, 20.7)} across=${field.Top(10.7, 20)}`);
  Check("top field counts bodies", field.bodies === 1);
}

// --- 命中体 → 胶囊段 ------------------------------------------------------
{
  const v = (x, y, z) => ({ x, y, z });
  const segments = CorpseSegments([
    { start: v(0, 0.15, 0), end: v(0.6, 0.15, 0), worldRadius: 0.14 },
    { center: v(1, 0.1, 0), worldRadius: 0.1 },
    { center: v(2, 0.1, 0), worldRadii: v(0.2, 0.1, 0.15) },
    { center: v(3, 0.1, 0), worldRadius: 0 },
  ]);
  Check("hitboxes become three segments", segments.length === 3, `n=${segments.length}`);
  Check("capsule surface height", Near(SegmentTop(segments[0], 0.3, 0), 0.29, 1e-9)
    && SegmentTop(segments[0], 0.3, 0.2) === -Infinity, `mid=${SegmentTop(segments[0], 0.3, 0)}`);
}

// --- 整车压过一具横躺的尸体 -------------------------------------------------
// 车沿 -Z 往前（yaw=0 → 车头 -Z），尸体横在 z=-6 处，躯干胶囊半径 0.15、离地 0.13。
const corpse = CorpseSegments([{ start: { x: -1.8, y: 0.13, z: -6 }, end: { x: 1.8, y: 0.13, z: -6 }, worldRadius: 0.15 }]);
const heightAt = (x, z) => Math.max(0, ...corpse.map((s) => SegmentTop(s, x, z)));
function Drive(fps, speed = 1.3, heightFn = heightAt) {
  const cart = { id: "C", x: 0, z: 0, yaw: 0 };
  const suspension = new CartSuspension(), dt = 1 / fps, trace = [];
  for (let t = 0; t < 14; t += dt) {
    cart.z = -speed * t;
    suspension.Step(cart, dt, heightFn);
    trace.push({ t, z: cart.z, heave: cart.bumpHeave, pitch: cart.bumpPitch, roll: cart.bumpRoll });
  }
  return trace;
}
{
  const trace = Drive(60);
  const peak = Math.max(...trace.map((e) => e.heave));
  const min = Math.min(...trace.map((e) => e.heave));
  const peakAt = trace.find((e) => e.heave === peak);
  // 过了尸体（轮轴 z < -6 - R）以后还有至少一次回弹的局部极大 —— 「软软的」。
  const after = trace.filter((e) => e.z < -6 - B.wheelRadiusM);
  let rebounds = 0;
  for (let i = 1; i + 1 < after.length; i++)
    if (after[i].heave > after[i - 1].heave && after[i].heave >= after[i + 1].heave && after[i].heave > 0.003) rebounds++;
  const end = trace.at(-1);
  Check("cart rises over the corpse", peak > 0.12 && peak <= B.maxLiftM * 1.35,
    `peak=${peak.toFixed(3)} at z=${peakAt.z.toFixed(2)}`);
  Check("cart pitches nose-down while the axle is lifted", peakAt.pitch < -0.01, `pitch=${peakAt.pitch.toFixed(4)}`);
  Check("both wheels hit together: no roll", Math.max(...trace.map((e) => Math.abs(e.roll))) < 1e-9);
  Check("never sinks into the ground", min >= 0, `min=${min}`);
  Check("soft rebound after rolling off", rebounds >= 1, `rebounds=${rebounds}`);
  Check("settles back to the ground", Math.abs(end.heave) < 1e-3, `end=${end.heave}`);
  const slow = Drive(30), fast = Drive(120);
  const slowPeak = Math.max(...slow.map((e) => e.heave)), fastPeak = Math.max(...fast.map((e) => e.heave));
  Check("frame rate independent", Math.abs(slowPeak - fastPeak) < 0.01, `30fps=${slowPeak.toFixed(4)} 120fps=${fastPeak.toFixed(4)}`);
}

// --- 封顶：两层尸堆 ------------------------------------------------------
{
  const pile = (x, z) => (Math.abs(z + 6) < 0.9 ? 0.62 : 0);
  const peak = Math.max(...Drive(60, 1.3, pile).map((e) => e.heave));
  const capHeave = CartPoseFromWheels(B.maxLiftM, B.maxLiftM).heave;
  Check("lift is capped on tall piles", peak <= capHeave * 1.4 && peak > capHeave * 0.8,
    `peak=${peak.toFixed(3)} capHeave=${capHeave.toFixed(3)}`);
}

// --- 只垫右轮 → 右侧抬起 -------------------------------------------------
{
  const rightOnly = (x, z) => (x > 0.8 ? heightAt(x, z) : 0);
  const trace = Drive(60, 1.3, rightOnly);
  const peak = trace.reduce((best, e) => (e.roll > best.roll ? e : best));
  const cart = { bumpHeave: peak.heave, bumpPitch: peak.pitch, bumpRoll: peak.roll };
  Check("right wheel on the corpse rolls the cart right-side up", peak.roll > 0.03, `roll=${peak.roll.toFixed(4)}`);
  Check("deck lifts more on the right than the left",
    CartDeckLift(cart, B.wheelHalfTrackM, B.axleZ) > CartDeckLift(cart, -B.wheelHalfTrackM, B.axleZ) + 0.05);
}

// --- 姿态 → 车板点的抬升 -------------------------------------------------
{
  const pose = CartPoseFromWheels(0.2, 0.2);
  const cart = { bumpHeave: pose.heave, bumpPitch: pose.pitch, bumpRoll: pose.roll };
  Check("axle points rise by the wheel lift", Near(CartDeckLift(cart, 0, B.axleZ), 0.2, 2e-3),
    `axle=${CartDeckLift(cart, 0, B.axleZ).toFixed(4)}`);
  Check("the hitch on the animal stays put", Math.abs(CartDeckLift(cart, 0, B.hitchZ)) < 2e-3,
    `hitch=${CartDeckLift(cart, 0, B.hitchZ).toFixed(4)}`);
  Check("an unbumped cart has zero deck lift", CartDeckLift({}, 1, 1) === 0);
}

// --- 翻倒的车不颠 ---------------------------------------------------------
{
  const cart = { id: "O", x: 0, z: -6, yaw: 0, overturned: true };
  new CartSuspension().Step(cart, 1 / 60, heightAt);
  Check("overturned cart ignores corpses", cart.bumpHeave === 0 && cart.bumpPitch === 0 && cart.bumpRoll === 0);
}

console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
process.exit(failures ? 1 : 0);
