// 牛马车压过尸体：车轮滚上尸体顶面 → 每只轮子一根软弹簧 → 车身起伏 / 俯仰 / 侧倾。
//
// 纯规则，不依赖 three（命中体、实例矩阵、几何都按鸭子类型读），node 里直接测。
// 数值在 Data_Tuning_FirstLevelMid.cartCorpseBump；口径见 docs/Data_FirstLevelMid20260919.md
// 「牛马车压过尸体」一节。
//
// 尸体两路来源，合成同一个「这一点的尸体顶面有多高」：
//   · 静态战场尸体（MissionAftermath 的实例）开机烘成 CorpseTopField —— 世界格子里存绝对顶面 Y；
//   · 战斗中倒下的人（AI 尸体、MissionPeople 里的死者）按命中体胶囊现算（CorpseSegments）。
// 车是两轮大车：轮轴在局部 z=axleZ，车辕前端搭在牲口身上（hitchZ）当支点。
// 两只轮子各自抬升 → 车身姿态：
//   heave  局部原点（cartRoot 枢轴）的抬升
//   pitch  绕局部 X，正值车头抬起（轮子被垫高、辕头不动 → 车头往下，值为负）
//   roll   绕局部 Z，正值右侧（+X）抬起
// 三个量写在 cart.bumpHeave / bumpPitch / bumpRoll 上，渲染（车模、车上担架）与
// 坐车的眼位（TransferCart）都从 CartDeckLift 取，保证一致。
import { MID_TUNING as MID } from "./Data_Tuning_FirstLevelMid.mjs";

const B = MID.cartCorpseBump;
const KEY_OFFSET = 32768;

/** 世界格子：每格存落在里面的尸体表面最高点（绝对 Y）。 */
export class CorpseTopField {
  constructor(cellM = B.fieldCellM) {
    this.cellM = cellM;
    this.cells = new Map();
    this.bodies = 0;
    this.buildMs = 0;
  }
  Key(x, z) {
    return (Math.floor(x / this.cellM) + KEY_OFFSET) * 65536 + (Math.floor(z / this.cellM) + KEY_OFFSET);
  }
  Add(x, z, y) {
    const key = this.Key(x, z), old = this.cells.get(key);
    if (old === undefined || y > old) this.cells.set(key, y);
  }
  Top(x, z) {
    const top = this.cells.get(this.Key(x, z));
    return top === undefined ? -Infinity : top;
  }
}

/**
 * 把 MissionAftermath 的全部实例烘进顶面格子。每个姿势原型先在自己的局部空间按
 * localCellM 取顶面点（几何本来就是躺平的静息姿势），再乘各实例矩阵落到世界。
 * @param {{prototypes: Map<string,{parts:Array<{tiers:Array<object>}>,members:Array<{matrix:{elements:number[]}}>}>}} aftermath
 */
export function BuildAftermathTopField(aftermath, field = new CorpseTopField()) {
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();
  const cell = B.localCellM;
  for (const prototype of aftermath?.prototypes?.values?.() || []) {
    const tops = new Map();
    for (const part of prototype.parts || []) {
      // 用 5 cm 合点那一档（形状一样、点少十倍），没有就用原模。
      const geometry = part.tiers?.[1] || part.tiers?.[0] || part.geometry;
      const pos = geometry?.attributes?.position;
      if (!pos) continue;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const key = `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
        const old = tops.get(key);
        if (!old || y > old[1]) tops.set(key, [x, y, z]);
      }
    }
    const points = [...tops.values()];
    for (const member of prototype.members || []) {
      const e = member.matrix.elements;
      for (const [x, y, z] of points) {
        const w = e[3] * x + e[7] * y + e[11] * z + e[15] || 1;
        field.Add((e[0] * x + e[4] * y + e[8] * z + e[12]) / w,
          (e[2] * x + e[6] * y + e[10] * z + e[14]) / w,
          (e[1] * x + e[5] * y + e[9] * z + e[13]) / w);
      }
      field.bodies++;
    }
  }
  field.buildMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - start;
  return field;
}

/**
 * 一具倒下的人 → 平面胶囊段（命中体：capsule 用 start/end，sphere/ellipsoid 用 center）。
 * 命中体对象是运行时复用的，这里立刻抄成数字。
 */
export function CorpseSegments(hitboxes) {
  const segments = [];
  for (const shape of hitboxes || []) {
    if (shape.start && shape.end && shape.worldRadius > 0) {
      segments.push({ ax: shape.start.x, ay: shape.start.y, az: shape.start.z,
        bx: shape.end.x, by: shape.end.y, bz: shape.end.z, r: shape.worldRadius });
    } else if (shape.center) {
      const r = shape.worldRadii ? Math.max(shape.worldRadii.x, shape.worldRadii.y, shape.worldRadii.z) : shape.worldRadius;
      if (!(r > 0)) continue;
      segments.push({ ax: shape.center.x, ay: shape.center.y, az: shape.center.z,
        bx: shape.center.x, by: shape.center.y, bz: shape.center.z, r });
    }
  }
  return segments;
}

/** 胶囊段在平面点 (x,z) 正上方的表面高度（绝对 Y）；不在投影里返回 -Infinity。 */
export function SegmentTop(segment, x, z) {
  const dx = segment.bx - segment.ax, dz = segment.bz - segment.az, length = dx * dx + dz * dz;
  let t = length > 1e-9 ? ((x - segment.ax) * dx + (z - segment.az) * dz) / length : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = x - segment.ax - dx * t, pz = z - segment.az - dz * t, d2 = px * px + pz * pz;
  const r2 = segment.r * segment.r;
  if (d2 >= r2) return -Infinity;
  return segment.ay + (segment.by - segment.ay) * t + Math.sqrt(r2 - d2);
}

/**
 * 轮子（半径 R，接地点 (cx,cz)，前进方向 (fx,fz)）滚过障碍时轮心被抬起多少：
 * 前后一个轮半径内每一点的障碍高度 h(s)，轮心要高过 h(s) - (R - √(R²-s²))。
 * @param {(x:number,z:number)=>number} heightAt 尸体比地面高多少（≥0）
 */
export function WheelLift(cx, cz, fx, fz, heightAt, radius = B.wheelRadiusM, step = B.probeStepM) {
  let best = 0;
  const n = Math.floor(radius / step);
  for (let i = -n; i <= n; i++) {
    const s = i * step;
    const h = heightAt(cx + fx * s, cz + fz * s);
    if (!(h > 0)) continue;
    const lift = h - (radius - Math.sqrt(Math.max(0, radius * radius - s * s)));
    if (lift > best) best = lift;
  }
  return best;
}

/** 两只轮子的抬升 → 车身姿态（见文件头的符号约定）。 */
export function CartPoseFromWheels(left, right) {
  const span = B.axleZ - B.hitchZ, mean = (left + right) / 2;
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  return {
    heave: mean * (0 - B.hitchZ) / span,
    pitch: -Math.asin(clamp(mean / span)),
    roll: Math.asin(clamp((right - left) / (2 * B.wheelHalfTrackM))),
  };
}

/**
 * 车身局部点 (lx, lz)（三 的 YXZ 欧拉：Ry·Rx(pitch)·Rz(roll)）因颠簸多出的竖直位移。
 * 局部 x 向右、-z 向车头，与 CartSeatPoint 的 dx/dz 同一口径。
 */
export function CartDeckLift(cart, lx = 0, lz = 0) {
  const heave = cart?.bumpHeave || 0, pitch = cart?.bumpPitch || 0, roll = cart?.bumpRoll || 0;
  return heave + lx * Math.sin(roll) * Math.cos(pitch) - lz * Math.sin(pitch);
}

/** 每辆车两只轮子的弹簧状态；结果写回 cart.bumpHeave/bumpPitch/bumpRoll。 */
export class CartSuspension {
  constructor() { this.state = new Map(); }
  Reset() { this.state.clear(); }
  /**
   * @param {{id:string,x:number,z:number,yaw:number,overturned?:boolean}} cart
   * @param {number} dt
   * @param {(x:number,z:number)=>number} heightAt 尸体比地面高多少（≥0）
   */
  Step(cart, dt, heightAt) {
    let state = this.state.get(cart.id);
    if (!state) this.state.set(cart.id, state = { left: 0, right: 0, vLeft: 0, vRight: 0, targetLeft: 0, targetRight: 0 });
    if (cart.overturned) {
      Object.assign(state, { left: 0, right: 0, vLeft: 0, vRight: 0, targetLeft: 0, targetRight: 0 });
      cart.bumpHeave = cart.bumpPitch = cart.bumpRoll = 0;
      return state;
    }
    const c = Math.cos(cart.yaw || 0), s = Math.sin(cart.yaw || 0);
    const fx = -s, fz = -c; // 车头 = 局部 -Z
    const Wheel = (side) => {
      const lx = side * B.wheelHalfTrackM, lz = B.axleZ;
      const wx = cart.x + lx * c + lz * s, wz = cart.z - lx * s + lz * c;
      return Math.min(B.maxLiftM, WheelLift(wx, wz, fx, fz, heightAt) * B.softness);
    };
    state.targetLeft = Wheel(-1);
    state.targetRight = Wheel(1);
    const omega = 2 * Math.PI * B.springHz, damping = 2 * B.dampingRatio * omega;
    let remaining = Math.max(0, Math.min(0.1, Number.isFinite(dt) ? dt : 0));
    while (remaining > 1e-6) {
      const h = Math.min(B.maxSubstepS, remaining);
      remaining -= h;
      state.vLeft += (omega * omega * (state.targetLeft - state.left) - damping * state.vLeft) * h;
      state.vRight += (omega * omega * (state.targetRight - state.right) - damping * state.vRight) * h;
      state.left += state.vLeft * h;
      state.right += state.vRight * h;
    }
    // 轮子不会陷进地面以下：落回地面时按 groundRestitution 小弹一下。
    if (state.left < 0) { state.left = 0; if (state.vLeft < 0) state.vLeft *= -B.groundRestitution; }
    if (state.right < 0) { state.right = 0; if (state.vRight < 0) state.vRight *= -B.groundRestitution; }
    const pose = CartPoseFromWheels(state.left, state.right);
    cart.bumpHeave = pose.heave;
    cart.bumpPitch = pose.pitch;
    cart.bumpRoll = pose.roll;
    return state;
  }
}
