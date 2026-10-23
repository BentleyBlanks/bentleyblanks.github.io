// 单被的布料模拟（2026-10-21，用户：拖冬瓜的被子接一个比较基础的布料模拟，用资产已有的骨骼绑定）。
//
// 资产（Model_SingleBlanket.glb，docs/Data_SingleBlanket.md）：216 根变形骨排成纵 18 行 × 横 12 列，全部直接挂在
// Blanket_Root 下，静止姿势平铺、旋转为单位阵；每个顶点是相邻四根骨的精确双线性权重。所以这里**一根骨 = 一个质点**：
// 在世界空间里模拟这 216 个点，再把每根骨摆到它的质点上、朝向取该点处布面的切线标架（法线跟着转，光照对）。
// 顶点由 GPU 蒙皮按双线性插出来，不改几何、不逐顶点上传。骨格间距 12.7 × 11.2 cm，比这更细的褶子出不来——够白盒用。
//
// 求解：位置动力学（PBD），固定子步 1/90 s、每子步 12 轮约束。约束三种：相邻（不许拉长、压短很软，布能堆起来）、
// 对角（抗剪）、隔一根（抗弯，很弱：薄棉布）；外加从攥着的被角出发的长程系绳（2026-10-23，拳头附近不被拉成尖角）。碰撞：地面（外部给的高度函数，每帧每点采一次；一下子高出 0.3 m 以上的实心块
// 不认，台阶按 1 m/s 渐进抬），身体胶囊（躺在被子上的人、拖的人的腿）：身体正下方的点按住在地上并跟着身体走（被压住、
// 静摩擦），其余从胶囊里推出去。头端两角可以钉到目标点上（拽被角的手），钉上时以有限速度挪过去，不瞬移。没有自碰撞。
// PBD 的速度 = 子步位移 / h：被身体推开、被地面顶起的那一下限速（不然 0.3 m 的推开就是 27 m/s，布会被弹上天），
// 整体再限 5 m/s；重新铺下时先 Settle 空推一会儿、每步压一次速度。
//
// 坐标：质点与目标都是世界坐标。资产空间：头端 +Z、L 角在 +X（列 c0），行 r0 在头端。

import * as THREE from "three";

export const BLANKET_CLOTH = Object.freeze({
  substepS: 1 / 90,
  /** 一帧最多推这么多个子步；更长的帧（卡顿 / 快进）只推这么多，布慢下来但不炸。 */
  maxSubsteps: 6,
  iterations: 12,
  gravity: 9.81,
  /** 空气阻尼（每秒衰减率）。 */
  airDamping: 1.2,
  /**
   * 约束刚度（每轮投影的比例）：拉长、压短、对角、隔一根。2026-10-23 压短 / 抗弯 / 抗剪调软（原 0.3 / 0.06 / 0.5）：
   * PBD 的实际刚度随轮数涨（0.3 跑 10 轮 ≈ 0.97），布几乎压不短、堆不出褶，一大片光滑地卷着，像皮。
   */
  stretch: 1, compress: 0.02, shear: 0.3, bend: 0.008,
  /** 质点离地（防闪；网格在骨间是直线插值，坑洼地上还会再低一点）。 */
  groundOffsetM: 0.012,
  /** 贴地时每子步损失的水平速度比例（土布在土上）。 */
  groundFriction: 0.3,
  /** 被身体压住的点：每子步水平速度向身体速度靠的比例。 */
  bodyCarry: 0.6,
  /** 被身体压住的点：每轮把水平位置拉回「跟着身体走」的位置的比例（1 = 完全不滑）。 */
  bodyHold: 0.8,
  /** 胶囊外再留的厚度（网格在骨间是弦，会切进圆弧里）。 */
  bodyMarginM: 0.03,
  /** 被角挪到手上的最大速度。 */
  grabSpeedMps: 3,
  /**
   * 长程系绳（2026-10-23，用户：拖起来像一张皮）：每个硬钉的点到其余各点的距离不许超过静止距离 × tetherSlack，
   * 超了按 tether 的比例往钉点拉。只靠相邻约束 10 轮收不住，钉点旁的一格会被拉长到 1.5 倍（尖角、像拉开的胶皮）。
   */
  tether: 1, tetherSlack: 1.02,
  /**
   * 离钉点远处放松（2026-10-23）：静止距离从 tetherNearM 到 tetherFarM，允许的拉长从 tetherSlack 线性放到 tetherSlackFar。
   * 拖人片段的拳头比被头远约 1 m（Data_EditorBlockout §5.6、拖人站位），完全不可拉长时整床被子会从冬瓜身下被抽走；
   * 拉长只许出在远离拳头、平铺在身下的那段，拳头附近（看得最清楚的尖角）不拉长。
   */
  tetherNearM: 0.4, tetherFarM: 1.9, tetherSlackFar: 1.5,
  /**
   * 拳头攥一把（2026-10-23）：被角旁边沿侧边的 gatherSide 个点也软钉到拳头下方（第 m 个低 gatherDropM × m），
   * 刚度 gatherK —— 布被攥成一团，从拳头往下散出褶子，不是被一个尖角挑起来。
   */
  gatherSide: 1, gatherK: 0.15, gatherDropM: 0.06,
  /** 被子一帧挪这么远 = 跳了（预演跳时间、关键帧切换）：重新铺。 */
  resetJumpM: 1.2,
  /** 重新铺之后先空推这么久（被角从平铺的位置挪到手上、布落定），每步速度乘 settleDamp。 */
  settleS: 0.9, settleDamp: 0.85,
  /** 被角钉到手上的刚度（1 = 硬钉，被角一定在手里；< 1 软钉，布够不着时停在半路）。 */
  pinK: 1,
  /** 脚下地面一下子比质点高出这么多 = 撞上了箱子 / 墙这类实心块（站人的地面把块顶也算进去）：不当地面、不往上蹦。 */
  maxStepUpM: 0.3,
  /**
   * 质点速度上限（m/s）。PBD 的速度 = 这一子步的位移 / h，身体一下子把布推出去 0.3 m 就是 27 m/s，布会被弹上天；
   * 拖着走 1.2 m/s、手摆动也就 2–3 m/s。
   */
  maxSpeedMps: 5,
  /** 被身体推开 / 被地面顶起的点：这一下的位移不算成速度——推开的点限到这么快，顶起的点往上不超过 contactLiftMps。 */
  contactSpeedMps: 2, contactLiftMps: 0.5,
  /** 脚下地面变高（拖上台阶）时，地面按这个速度往上抬（布顺着台阶沿滑上去），不一下子把一排点顶起 0.2 m、把旁边的点拽飞。 */
  groundRiseMps: 1,
});

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _one = new THREE.Vector3(1, 1, 1);

/**
 * 布料网格本身（与 three 骨头无关，Node 里也能跑）。
 * rest：资产空间里各质点的静止位置（Float32Array，rows × cols × 3，行优先，r0 头端、c0 在 +X）。
 */
export class ClothGrid {
  constructor(rest, rows, cols, options = {}) {
    this.rows = rows; this.cols = cols;
    this.n = rows * cols;
    this.cfg = { ...BLANKET_CLOTH, ...options };
    this.rest = Float32Array.from(rest);
    this.x = new Float32Array(this.n * 3);        // 当前位置（世界）
    this.p = new Float32Array(this.n * 3);        // 子步开始时的位置
    this.v = new Float32Array(this.n * 3);
    this.inv = new Float32Array(this.n).fill(1);  // 0 = 钉住（运动学）
    this.groundY = new Float32Array(this.n);      // 这一子步用的地面（往上按 groundRiseMps 追 groundTarget）
    this.groundTarget = new Float32Array(this.n);
    this.pressed = new Uint8Array(this.n);
    this.pushed = new Uint8Array(this.n);         // 这一子步被身体胶囊推开过
    this.lifted = new Uint8Array(this.n);         // 这一子步被地面往上顶过
    this.contact = new Uint8Array(this.n);
    this.pins = new Map();                        // 质点号 → { target, anchor: Vector3, grabbed, k }
    this.colliders = [];                          // { ax, ay, az, bx, by, bz, r, carry: [vx, vz] | null }
    this.ready = false;
    const constraints = [];
    const Add = (i, j, kind) => {
      const L = Math.hypot(rest[i * 3] - rest[j * 3], rest[i * 3 + 1] - rest[j * 3 + 1], rest[i * 3 + 2] - rest[j * 3 + 2]);
      constraints.push([i, j, L, kind]);
    };
    const Id = (r, c) => r * cols + c;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (c + 1 < cols) Add(Id(r, c), Id(r, c + 1), 0);
      if (r + 1 < rows) Add(Id(r, c), Id(r + 1, c), 0);
      if (r + 1 < rows && c + 1 < cols) { Add(Id(r, c), Id(r + 1, c + 1), 1); Add(Id(r, c + 1), Id(r + 1, c), 1); }
      if (c + 2 < cols) Add(Id(r, c), Id(r, c + 2), 2);
      if (r + 2 < rows) Add(Id(r, c), Id(r + 2, c), 2);
    }
    // 静止距离表（长程系绳用）：216 × 216
    this.restDist = new Float32Array(this.n * this.n);
    for (let i = 0; i < this.n; i++) for (let j = 0; j < this.n; j++)
      this.restDist[i * this.n + j] = Math.hypot(rest[i * 3] - rest[j * 3], rest[i * 3 + 1] - rest[j * 3 + 1], rest[i * 3 + 2] - rest[j * 3 + 2]);
    // 打平成数组（热循环里不碰对象）
    this.ci = new Uint16Array(constraints.length * 2);
    this.cl = new Float32Array(constraints.length);
    this.ck = new Uint8Array(constraints.length);
    constraints.forEach(([i, j, L, k], n) => { this.ci[n * 2] = i; this.ci[n * 2 + 1] = j; this.cl[n] = L; this.ck[n] = k; });
  }

  Index(r, c) { return r * this.cols + c; }

  /** 按资产空间 → 世界的矩阵 world 把质点铺成 pose（缺省静止平铺），速度清零。 */
  Reset(world, pose = this.rest) {
    for (let i = 0; i < this.n; i++) {
      _a.fromArray(pose, i * 3).applyMatrix4(world);
      _a.toArray(this.x, i * 3); _a.toArray(this.p, i * 3);
    }
    this.v.fill(0);
    this.pins.clear();
    this.inv.fill(1);
    this.ready = true;
  }

  /**
   * 钉住 / 放开一个质点（target = null 放开）。k = 1 硬钉（质点跟着锚点走）；k < 1 软钉（每轮往锚点拉 k，布够不着时停在半路）。
   * 锚点从质点当前位置以 grabSpeedMps 挪向目标（刚抓上时不瞬移）。gather = 攥进拳头的那几个点（不当系绳的起点、不算「两角」）。
   */
  SetPin(i, target, k = 1, gather = false) {
    if (!target) {
      if (this.pins.has(i)) { this.pins.delete(i); this.inv[i] = 1; }
      return;
    }
    let pin = this.pins.get(i);
    if (!pin) { pin = { target: new THREE.Vector3(), anchor: new THREE.Vector3().fromArray(this.x, i * 3), grabbed: false, k, gather }; this.pins.set(i, pin); }
    pin.target.copy(target);
    pin.k = k; pin.gather = gather;
    this.inv[i] = k >= 1 ? 0 : 1;
  }

  /**
   * 每帧开头：按当前位置采一次地面高度。比质点高出 maxStepUpM 以上的（箱子、墙这类实心块的顶）不认，沿用上一帧的地面：
   * 台阶一级级上得去，路边的弹药箱不会把布一下子顶上去。first = 刚铺下（全都认）。
   */
  SampleGround(groundAt, first = false) {
    const off = this.cfg.groundOffsetM, step = this.cfg.maxStepUpM;
    for (let i = 0; i < this.n; i++) {
      const y = groundAt(this.x[i * 3], this.x[i * 3 + 2]);
      const g = (Number.isFinite(y) ? y : 0) + off;
      if (first || g - this.x[i * 3 + 1] <= step) this.groundTarget[i] = g;
      else this.groundTarget[i] = Math.min(this.groundTarget[i], this.x[i * 3 + 1]);
      if (first || this.groundTarget[i] < this.groundY[i]) this.groundY[i] = this.groundTarget[i];
    }
  }

  /** 速度乘一个系数。 */
  Damp(k) { for (let i = 0; i < this.v.length; i++) this.v[i] *= k; }

  /**
   * 重新铺下之后空推 seconds 秒，让被角挪到手上、布落定：每步先 before()（钉被角、采地面），步长 2 个子步，每步速度 × settleDamp
   * （铺下时和身体交叠、被一下子推开的那股劲压掉，不把布弹起来）。
   */
  Settle(seconds, before) {
    const h = this.cfg.substepS * 2;
    for (let t = 0; t < seconds; t += h) { before?.(); this.Step(h); this.Damp(this.cfg.settleDamp); }
  }

  /** 推 dt 秒（按固定子步，最多 maxSubsteps 步）。 */
  Step(dt) {
    if (!this.ready || !(dt > 0)) return 0;
    const cfg = this.cfg;
    const steps = Math.min(cfg.maxSubsteps, Math.max(1, Math.round(dt / cfg.substepS)));
    const h = Math.min(dt / steps, cfg.substepS * 1.5);
    for (let s = 0; s < steps; s++) this._Substep(h);
    return steps;
  }

  _Substep(h) {
    const cfg = this.cfg, x = this.x, p = this.p, v = this.v, inv = this.inv, n = this.n;
    const damp = Math.exp(-cfg.airDamping * h);
    // 地面往上追（台阶），往下直接到
    const rise = cfg.groundRiseMps * h, gy = this.groundY, gt = this.groundTarget;
    for (let i = 0; i < n; i++) gy[i] = gt[i] > gy[i] ? Math.min(gt[i], gy[i] + rise) : gt[i];
    // 预测
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      p[o] = x[o]; p[o + 1] = x[o + 1]; p[o + 2] = x[o + 2];
      if (inv[i] === 0) continue;
      v[o + 1] -= cfg.gravity * h;
      v[o] *= damp; v[o + 1] *= damp; v[o + 2] *= damp;
      x[o] += v[o] * h; x[o + 1] += v[o + 1] * h; x[o + 2] += v[o + 2] * h;
    }
    // 锚点：以有限速度挪向目标，到了就贴住；硬钉的点直接放在锚点上
    const maxMove = cfg.grabSpeedMps * h;
    for (const [i, pin] of this.pins) {
      const a = pin.anchor;
      _a.subVectors(pin.target, a);
      const d = _a.length();
      if (pin.grabbed || d <= maxMove) { a.copy(pin.target); pin.grabbed = true; }
      else a.addScaledVector(_a, maxMove / d);
      if (pin.k >= 1) { const o = i * 3; x[o] = a.x; x[o + 1] = a.y; x[o + 2] = a.z; }
    }
    this.pressed.fill(0); this.pushed.fill(0); this.lifted.fill(0);
    const ci = this.ci, cl = this.cl, ck = this.ck, m = cl.length;
    const kStretch = cfg.stretch, kCompress = cfg.compress, kShear = cfg.shear, kBend = cfg.bend;
    for (let it = 0; it < cfg.iterations; it++) {
      for (let c = 0; c < m; c++) {
        const i = ci[c * 2], j = ci[c * 2 + 1];
        const wi = inv[i], wj = inv[j], w = wi + wj;
        if (w === 0) continue;
        const oi = i * 3, oj = j * 3;
        const dx = x[oj] - x[oi], dy = x[oj + 1] - x[oi + 1], dz = x[oj + 2] - x[oi + 2];
        const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (L < 1e-9) continue;
        const kind = ck[c];
        const err = L - cl[c];
        const k = kind === 0 ? (err > 0 ? kStretch : kCompress) : kind === 1 ? (err > 0 ? kShear : kShear * 0.5) : kBend;
        const s = k * err / (L * w);
        x[oi] += dx * s * wi; x[oi + 1] += dy * s * wi; x[oi + 2] += dz * s * wi;
        x[oj] -= dx * s * wj; x[oj + 1] -= dy * s * wj; x[oj + 2] -= dz * s * wj;
      }
      for (const [i, pin] of this.pins) {
        if (pin.k >= 1) continue;
        const o = i * 3, a = pin.anchor, k = pin.k;
        x[o] += (a.x - x[o]) * k; x[o + 1] += (a.y - x[o + 1]) * k; x[o + 2] += (a.z - x[o + 2]) * k;
      }
      if (cfg.tether > 0) this._Tether(cfg);
      this._Collide(it === cfg.iterations - 1, h);
    }
    // 速度 = 位移 / h（限速；被推开 / 顶起的那一下不算成速度）；贴地的摩擦、被身体压住的跟着身体走
    const fr = 1 - cfg.groundFriction, carry = cfg.bodyCarry, vmax2 = cfg.maxSpeedMps * cfg.maxSpeedMps;
    const vPush2 = cfg.contactSpeedMps * cfg.contactSpeedMps, vLift = cfg.contactLiftMps;
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      if (inv[i] === 0) { v[o] = (x[o] - p[o]) / h; v[o + 1] = (x[o + 1] - p[o + 1]) / h; v[o + 2] = (x[o + 2] - p[o + 2]) / h; continue; }
      v[o] = (x[o] - p[o]) / h; v[o + 1] = (x[o + 1] - p[o + 1]) / h; v[o + 2] = (x[o + 2] - p[o + 2]) / h;
      const sp2 = v[o] * v[o] + v[o + 1] * v[o + 1] + v[o + 2] * v[o + 2], cap2 = this.pushed[i] ? Math.min(vmax2, vPush2) : vmax2;
      if (sp2 > cap2) { const k = Math.sqrt(cap2 / sp2); v[o] *= k; v[o + 1] *= k; v[o + 2] *= k; }
      if (this.lifted[i] && v[o + 1] > vLift) v[o + 1] = vLift;
      const body = this.pressed[i] ? this.colliders[this.pressed[i] - 1] : null;
      if (body?.carry) {
        v[o] += (body.carry[0] - v[o]) * carry; v[o + 2] += (body.carry[1] - v[o + 2]) * carry;
        if (v[o + 1] > 0) v[o + 1] = 0;
      } else if (this.contact[i]) {
        v[o] *= fr; v[o + 2] *= fr;
        if (v[o + 1] < 0) v[o + 1] = 0;
      }
    }
  }

  /** 长程系绳：离硬钉点比静止距离（× slack）远的点往钉点拉（文件头 / BLANKET_CLOTH.tether）。 */
  _Tether(cfg) {
    const x = this.x, inv = this.inv, n = this.n, D = this.restDist, k = cfg.tether;
    const near = cfg.tetherNearM, span = Math.max(1e-6, cfg.tetherFarM - near), s0 = cfg.tetherSlack, s1 = cfg.tetherSlackFar;
    for (const [p, pin] of this.pins) {
      if (pin.k < 1 || pin.gather) continue;
      const op = p * 3, ax = x[op], ay = x[op + 1], az = x[op + 2], row = p * n;
      for (let i = 0; i < n; i++) {
        if (inv[i] === 0) continue;
        const o = i * 3, dx = x[o] - ax, dy = x[o + 1] - ay, dz = x[o + 2] - az;
        const r = D[row + i], f = r <= near ? 0 : r >= near + span ? 1 : (r - near) / span;
        const d2 = dx * dx + dy * dy + dz * dz, L = r * (s0 + (s1 - s0) * f);
        if (d2 <= L * L) continue;
        const d = Math.sqrt(d2), s = k * (d - L) / d;
        x[o] -= dx * s; x[o + 1] -= dy * s; x[o + 2] -= dz * s;
      }
    }
  }

  /** 身体胶囊 + 地面。身体正下方（在胶囊轴下面、水平离轴不到半径）的点按在地上（pressed），其余推出胶囊。 */
  _Collide(last, h) {
    const x = this.x, p = this.p, inv = this.inv, gy = this.groundY, n = this.n, margin = this.cfg.bodyMarginM, hold = this.cfg.bodyHold;
    const cols = this.colliders;
    if (last) this.contact.fill(0);
    for (let i = 0; i < n; i++) {
      if (inv[i] === 0) continue;
      const o = i * 3;
      for (let k = 0; k < cols.length; k++) {
        const b = cols[k];
        const R = b.r + margin;
        const px = x[o], py = x[o + 1], pz = x[o + 2];
        if (px < b.minX - R || px > b.maxX + R || pz < b.minZ - R || pz > b.maxZ + R || py > b.maxY + R) continue;
        const abx = b.bx - b.ax, aby = b.by - b.ay, abz = b.bz - b.az;
        const len2 = abx * abx + aby * aby + abz * abz;
        let t = len2 > 1e-9 ? ((px - b.ax) * abx + (py - b.ay) * aby + (pz - b.az) * abz) / len2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = b.ax + abx * t, cy = b.ay + aby * t, cz = b.az + abz * t;
        const dx = px - cx, dy = py - cy, dz = pz - cz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= R * R) continue;
        const flat = Math.sqrt(dx * dx + dz * dz);
        if (b.press && dy < 0 && flat < b.r * 0.85) {
          // 压在身子底下：贴地、不许往上钻；水平方向按 bodyHold 跟着身体走（静摩擦，被子不从人身下抽出来）
          this.pressed[i] = k + 1;
          if (py > gy[i]) x[o + 1] = gy[i];
          if (hold > 0 && b.carry) {
            x[o] += (p[o] + b.carry[0] * h - x[o]) * hold;
            x[o + 2] += (p[o + 2] + b.carry[1] * h - x[o + 2]) * hold;
          }
          continue;
        }
        const d = Math.sqrt(d2);
        this.pushed[i] = 1;
        if (d < 1e-6) { x[o + 1] = cy + R; continue; }
        const s = R / d;
        x[o] = cx + dx * s; x[o + 1] = cy + dy * s; x[o + 2] = cz + dz * s;
      }
      if (x[o + 1] < gy[i]) {
        this.lifted[i] = 1;
        x[o + 1] = gy[i];
        if (last) this.contact[i] = 1;
      }
      else if (last && x[o + 1] < gy[i] + 0.004) this.contact[i] = 1;
    }
  }

  /** 设这一帧的身体胶囊：[{ a: Vector3, b: Vector3, r, press, carry: [vx, vz] | null }]。 */
  SetColliders(list) {
    this.colliders = list.map(({ a, b, r, press = false, carry = null }) => ({
      ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, r, press, carry,
      minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z), maxY: Math.max(a.y, b.y),
    }));
  }

  /** 第 i 个点处布面的切线标架（世界）：x 沿资产 +X（列号减小的方向）、y 法线、z 沿资产 +Z（行号减小）。→ Quaternion */
  Frame(i, out = new THREE.Quaternion(), fallback = null) {
    const r = Math.floor(i / this.cols), c = i % this.cols, x = this.x;
    const l = this.Index(r, Math.max(0, c - 1)), rr = this.Index(r, Math.min(this.cols - 1, c + 1));
    const u = this.Index(Math.max(0, r - 1), c), d = this.Index(Math.min(this.rows - 1, r + 1), c);
    _a.set(x[l * 3] - x[rr * 3], x[l * 3 + 1] - x[rr * 3 + 1], x[l * 3 + 2] - x[rr * 3 + 2]);   // 资产 +X
    _b.set(x[u * 3] - x[d * 3], x[u * 3 + 1] - x[d * 3 + 1], x[u * 3 + 2] - x[d * 3 + 2]);     // 资产 +Z
    _c.crossVectors(_b, _a);                                                                   // +Z × +X = +Y
    if (_c.lengthSq() < 1e-10 || _a.lengthSq() < 1e-10) return fallback ? out.copy(fallback) : out.identity();
    _c.normalize();
    _a.addScaledVector(_c, -_a.dot(_c)).normalize();
    _d.crossVectors(_a, _c);
    _m.makeBasis(_a, _c, _d);
    return out.setFromRotationMatrix(_m);
  }

  /** 取证：最高点、两头角的高度、最大拉长 / 压短比例、多少点贴地 / 被压住。 */
  Stats() {
    const x = this.x, n = this.n;
    let top = -Infinity, low = Infinity, maxStretch = 0, minRatio = Infinity, contact = 0, pressed = 0;
    for (let i = 0; i < n; i++) {
      top = Math.max(top, x[i * 3 + 1] - this.groundY[i]); low = Math.min(low, x[i * 3 + 1] - this.groundY[i]);
      contact += this.contact[i]; pressed += this.pressed[i] ? 1 : 0;
    }
    for (let c = 0; c < this.cl.length; c++) {
      if (this.ck[c] !== 0) continue;
      const i = this.ci[c * 2] * 3, j = this.ci[c * 2 + 1] * 3;
      const ratio = Math.hypot(x[j] - x[i], x[j + 1] - x[i + 1], x[j + 2] - x[i + 2]) / this.cl[c];
      maxStretch = Math.max(maxStretch, ratio); minRatio = Math.min(minRatio, ratio);
    }
    return { topM: top, lowM: low, maxStretch, minRatio, contact, pressed };
  }
}

/**
 * 把 ClothGrid 接到单被的骨头上。root = CloneSkinnedRig 出来的单被（里面一只 SkinnedMesh + 217 骨）。
 * 按逆绑定矩阵读每根骨的静止位置排成格子（不靠名字），Blanket_Root（不变形）当父骨。
 */
export class BlanketClothRig {
  constructor(root, options = {}) {
    let skinned = null;
    root.traverse((o) => { if (!skinned && o.isSkinnedMesh) skinned = o; });
    if (!skinned) throw new Error("单被里没有 SkinnedMesh");
    this.root = root;
    this.mesh = skinned;
    const skeleton = skinned.skeleton;
    const heads = skeleton.boneInverses.map(m => new THREE.Vector3().setFromMatrixPosition(_m.copy(m).invert()));
    // 不变形的根骨：名字是 Blanket_Root；找不到就取父骨
    let rootIndex = skeleton.bones.findIndex(b => /Blanket_Root$/.test(b.name));
    if (rootIndex < 0) rootIndex = skeleton.bones.findIndex(b => skeleton.bones.includes(b.parent) === false);
    const grid = skeleton.bones.map((bone, k) => ({ bone, head: heads[k], k })).filter(e => e.k !== rootIndex);
    const xs = [...new Set(grid.map(e => +e.head.x.toFixed(4)))].sort((a, b) => b - a);
    const zs = [...new Set(grid.map(e => +e.head.z.toFixed(4)))].sort((a, b) => b - a);
    if (xs.length * zs.length !== grid.length) throw new Error(`单被骨格不是整齐的格子：${zs.length} 行 × ${xs.length} 列 ≠ ${grid.length}`);
    this.rows = zs.length; this.cols = xs.length;
    this.bones = new Array(grid.length);
    const rest = new Float32Array(grid.length * 3);
    for (const e of grid) {
      const r = zs.indexOf(+e.head.z.toFixed(4)), c = xs.indexOf(+e.head.x.toFixed(4)), i = r * this.cols + c;
      this.bones[i] = e.bone;
      e.head.toArray(rest, i * 3);
    }
    this.restRotations = this.bones.map((bone, i) => {
      const k = skeleton.bones.indexOf(bone);
      const q = new THREE.Quaternion();
      _m.copy(skeleton.boneInverses[k]).invert().decompose(_a, q, _b);
      return q;
    });
    this.cloth = new ClothGrid(rest, this.rows, this.cols, options);
    this.corners = {
      headL: this.cloth.Index(0, 0), headR: this.cloth.Index(0, this.cols - 1),
      tailL: this.cloth.Index(this.rows - 1, 0), tailR: this.cloth.Index(this.rows - 1, this.cols - 1),
    };
    /** 攥被角时一起攥进拳头的点：沿侧边往被尾数（BLANKET_CLOTH.gatherSide），近的在前。 */
    this.gathers = {
      headL: Array.from({ length: this.rows - 1 }, (_, m) => this.cloth.Index(m + 1, 0)),
      headR: Array.from({ length: this.rows - 1 }, (_, m) => this.cloth.Index(m + 1, this.cols - 1)),
    };
    this.frames = this.bones.map(() => new THREE.Quaternion());
    this.lastRoot = null;
  }

  /** 资产空间 → 世界（= SkinnedMesh 的世界矩阵：网格和 Root 骨都是单位变换挂在单被根下）。 */
  AssetToWorld(out = new THREE.Matrix4()) {
    this.mesh.updateWorldMatrix(true, false);
    return out.copy(this.mesh.matrixWorld);
  }

  /** 资产空间的点 → 世界。 */
  AssetPoint(x, y, z, out = new THREE.Vector3()) { return out.set(x, y, z).applyMatrix4(this.AssetToWorld(_m2)); }

  /** 质点写回骨头：骨的世界矩阵 = 平移到质点 × 布面标架 × 静止朝向（静止时为单位阵）。 */
  Apply() {
    const cloth = this.cloth, x = cloth.x;
    const parent = this.bones[0].parent;
    parent.updateWorldMatrix(true, false);
    _m2.copy(parent.matrixWorld).invert();
    for (let i = 0; i < this.bones.length; i++) {
      const frame = cloth.Frame(i, this.frames[i], this.frames[i]);
      _q.copy(frame).multiply(this.restRotations[i]);
      _a.fromArray(x, i * 3);
      _m.compose(_a, _q, _one).premultiply(_m2);
      _m.decompose(this.bones[i].position, this.bones[i].quaternion, this.bones[i].scale);
    }
  }
}
