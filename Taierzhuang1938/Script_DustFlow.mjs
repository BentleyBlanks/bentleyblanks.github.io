// 一次落地爆炸的贴地尘流（2026-10-20）。纯 JS、零 three，node 里能直接测（Script_DustFlowTest）。
// 数值表：Data_Tuning_GroundImpact.GROUND_IMPACT_DUST；口径：docs/Data_ShellImpactDust.md。
//
// ## 为什么不是「播一段固定形状的体积」
// 预烘的流体序列形状是死的：炸在沟里、炸在沟沿、炸在空地上长得一模一样。
// 用户要的是「起始形态和壕沟形状一致」—— 尘得知道脚下的地形。
// 于是每次落点在炸点周围铺一张局部网格（格距 ~0.4 m，沟底宽 2–3 m 能分出五六格），
// 在上面跑两层很便宜的模型：
//
//   贴地尘浪（地面固定网格）  厚度 H、光学深度 Sg，交错网格上的面速度 Ux / Uz。
//     · 气浪：从炸点沿地面往外吹的风，只吹到「撞墙」为止。撞墙按 48 个方向从炸点平着量
//       （离地 0.55 m，地面高出 0.3 m 就算墙）：沟里炸，横着两三米就撞上沟壁，
//       顺着沟能一直吹到下一个拐角 —— 这正是壕沟修成锯齿形的原因（每一段只挨一段的爆风）。
//       被夹住的能量挤给通畅的方向和竖直方向（boost），所以沟里炸出来的是顺沟两头喷 + 更高的土柱。
//     · 重力：尘层按「自己的表面高度」往低处流（约化重力 g'），灌进沟、被抛土垄挡住、顺坡淌。
//       墙的规则只有一条：尘面没有高过邻格地面，就过不去。
//     · 一边走一边卷进空气变厚，一边被卷起来变成悬浮尘云，一边落回地面。
//   悬浮尘云（跟着风平移的网格）  每格一段竖直的尘：光学量 M、底 Zb、顶 Zt、上升速度 R。
//     · 中心土柱一开始就在这里（快速冲高，随后一部分重土回落成尘浪 —— 土柱塌下来往四周 / 顺沟滚）；
//     · 尘浪卷起来的尘落进这里，往上走、上下扩、水平扩散、随风飘、整体缓慢胀大、慢慢落掉。
//   两层都记「新鲜度」F：刚掀起来的湿土 + 炸药烟是黑的，散开后褪成灰黄（只管颜色）。
//
// 网格只在建立后的第一次 Step 才采地面：那时弹坑已经挖好（Combat.Blast 先画特效再挖坑）。

import { GROUND_IMPACT_DUST as DEFAULT_DUST, GROUND_IMPACT_SURFACES, GROUND_IMPACT_BURSTS } from "./Data_Tuning_GroundImpact.mjs";

const TAU = Math.PI * 2;
const EPS_H = 0.004;
function Smooth(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const BURST_TUNING = new Map();
/**
 * 起爆方式（Data_Explosives 的 burst，如手榴弹的 "surface"）对应的整张数值表：在 GROUND_IMPACT_DUST 上按
 * GROUND_IMPACT_BURSTS 的倍率改几项（土柱 / 尘浪 / 尘量 / 震起的细尘 / 寿命）。没有这一档返回原表。结果缓存、冻结。
 */
export function DustTuningFor(burst, T = DEFAULT_DUST) {
  const B = burst ? GROUND_IMPACT_BURSTS[burst] : null;
  if (!B || T !== DEFAULT_DUST) return T;
  if (BURST_TUNING.has(burst)) return BURST_TUNING.get(burst);
  const tuned = Object.freeze({
    ...T,
    scale: Object.freeze({ ...T.scale, columnK: T.scale.columnK * B.column, surgeK: T.scale.surgeK * B.surge }),
    mass: Object.freeze({ ...T.mass, columnQ: T.mass.columnQ * B.mass, surgeQ: T.mass.surgeQ * B.mass }),
    shock: Object.freeze({ ...T.shock, radiusK: T.shock.radiusK * B.shockRadius, center: T.shock.center * B.shockDepth,
      edge: T.shock.edge * B.shockDepth, decayS: T.shock.decayS * B.shockDecay }),
    loft: Object.freeze({ ...T.loft, life: T.loft.life * B.loftLife, fadeS: T.loft.fadeS * B.loftLife,
      fallFineS: T.loft.fallFineS * B.loftLife }),
    surge: Object.freeze({ ...T.surge, life: T.surge.life * B.surgeLife, settleFineS: T.surge.settleFineS * B.loftLife,
      capPad: T.surge.capPad * (B.surgeCap ?? 1) }),
    burst,
  });
  BURST_TUNING.set(burst, tuned);
  return tuned;
}

/** 尺度律：全部按装药立方根。返回米 / 秒 / 米每秒。 */
export function ImpactScale(chargeKg, T = DEFAULT_DUST) {
  const w = Math.max(0.02, Number(chargeKg) || 0);
  const cube = Math.cbrt(w), root = Math.sqrt(cube), S = T.scale;
  return {
    chargeKg: w, cube,
    craterR: S.craterK * cube,
    columnH: S.columnK * cube,
    surgeR: S.surgeK * cube,
    blastV: S.blastV * root,
    blastTau: S.blastTauS * cube,
    riseTau: S.columnTauS * root,
    columnQ: T.mass.columnQ * w,
    surgeQ: T.mass.surgeQ * w,
  };
}

export class DustFlowField {
  /**
   * @param {object} o
   *   x, z        炸点（米）；y 可选（炸点高度，空炸判断由调用方做）
   *   chargeKg    装药（kg TNT 当量）
   *   groundAt    (x, z) => 地面高（含弹坑形变）
   *   incoming    弹的来向速度（{x,y,z}，可选）：斜着砸进去的弹，下游多抛
   *   wind        {x, z}（m/s）
   *   surface     GROUND_IMPACT_SURFACES 的键
   *   massScale   额外倍率（budget 摊薄时 < 1）
   */
  constructor({ x, y = null, z, chargeKg, groundAt, incoming = null, wind = null, surface = "loess",
    massScale = 1, tuning = DEFAULT_DUST } = {}) {
    if (typeof groundAt !== "function") throw new Error("DustFlowField needs groundAt(x, z)");
    this.T = tuning;
    this.scale = ImpactScale(chargeKg, tuning);
    this.surfaceId = GROUND_IMPACT_SURFACES[surface] ? surface : "loess";
    this.surface = GROUND_IMPACT_SURFACES[this.surfaceId];
    this.groundAt = groundAt;
    this.cx = x; this.cz = z; this.cy = y;
    const G = tuning.grid, sc = this.scale;
    const extent = 2 * (G.extentK * sc.surgeR + G.extentPad);
    const N = Math.max(G.minN, Math.min(G.maxN, Math.ceil(extent / G.targetCellM)));
    this.N = N; this.cell = extent / N; this.extent = extent;
    this.minX = x - extent / 2; this.minZ = z - extent / 2;
    const n2 = N * N;
    // 贴地尘浪（地面固定）
    this.B = new Float32Array(n2);
    this.H = new Float32Array(n2);
    this.Sg = new Float32Array(n2);
    this.FS = new Float32Array(n2);           // F·Sg（新鲜度按光学量加权，跟着一起输运）
    this.Ux = new Float32Array((N + 1) * N);  // x 面：第 j 行第 i 个面在 (i-1,j) 与 (i,j) 之间
    this.Uz = new Float32Array(N * (N + 1));  // z 面：第 j 个面在 (i,j-1) 与 (i,j) 之间
    this.blastX = new Float32Array((N + 1) * N);  // 每个面的气浪权重（含方向、距离衰减、撞墙遮罩）
    this.blastZ = new Float32Array(N * (N + 1));
    this.out = new Float32Array(n2);
    this.dH = new Float32Array(n2); this.dS = new Float32Array(n2); this.dF = new Float32Array(n2);
    // 悬浮尘云（随风平移、后期胀大的网格）
    this.M = new Float32Array(n2);
    this.MZb = new Float32Array(n2);           // M·Zb、M·Zt、M·R、M·F：按光学量加权的广延量，混合与扩散都直接加
    this.MZt = new Float32Array(n2);
    this.MR = new Float32Array(n2);
    this.MF = new Float32Array(n2);
    this.tmp = new Float32Array(n2);
    this.loftX = this.minX; this.loftZ = this.minZ; this.loftCell = this.cell;
    // 震起的地面尘：每格一份竖直光学深度 K，底面永远贴着地面（渲染时按地面高现取），跟着风平移、慢慢晕开
    this.K = new Float32Array(n2);
    this.skinX = this.minX; this.skinZ = this.minZ;
    this.wind = { x: wind?.x || 0, z: wind?.z || 0 };
    // 来向：水平分量的方向与占比（垂直砸下 = 0，平射 = 1）
    const ix = incoming?.x || 0, iy = incoming?.y || 0, iz = incoming?.z || 0, il = Math.hypot(ix, iy, iz);
    const ih = Math.hypot(ix, iz);
    this.downX = ih > 1e-6 ? ix / ih : 0; this.downZ = ih > 1e-6 ? iz / ih : 0;
    this.horizontal = il > 1e-6 ? ih / il : 0;
    const mass = Math.max(0, massScale) * (this.surface.massScale ?? 1);
    this.massScale = mass;
    this.pendingSurge = sc.surgeQ * mass;
    this.columnQ = sc.columnQ * mass;
    this.injectedSurge = 0;
    this.time = 0;
    this.ready = false;
    this.surgeActive = true;
    this.finished = false;
    this.stats = { substeps: 0, cfl: 0 };
  }

  // --- 地面 ------------------------------------------------------------------

  Index(i, j) { return j * this.N + i; }

  /** 地面网格的双线性插值（格心采样）。越界夹到边。 */
  SampleB(x, z) {
    const N = this.N, gx = (x - this.minX) / this.cell - 0.5, gz = (z - this.minZ) / this.cell - 0.5;
    const i0 = Math.max(0, Math.min(N - 1, Math.floor(gx))), j0 = Math.max(0, Math.min(N - 1, Math.floor(gz)));
    const i1 = Math.min(N - 1, i0 + 1), j1 = Math.min(N - 1, j0 + 1);
    const u = Math.max(0, Math.min(1, gx - i0)), v = Math.max(0, Math.min(1, gz - j0));
    const B = this.B;
    return (B[j0 * N + i0] * (1 - u) + B[j0 * N + i1] * u) * (1 - v) + (B[j1 * N + i0] * (1 - u) + B[j1 * N + i1] * u) * v;
  }

  _Init() {
    const N = this.N, c = this.cell, B = this.B;
    let minY = Infinity, maxY = -Infinity;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const y = this.groundAt(this.minX + (i + 0.5) * c, this.minZ + (j + 0.5) * c);
      const v = Number.isFinite(y) ? y : 0;
      B[j * N + i] = v; if (v < minY) minY = v; if (v > maxY) maxY = v;
    }
    this.baseY = minY; this.groundMaxY = maxY;
    const g0 = this.groundAt(this.cx, this.cz);
    this.groundY = Number.isFinite(g0) ? g0 : this.SampleB(this.cx, this.cz);
    this._Confinement();
    // 被夹住的那份能量不往天上去，顺沟走：土柱的一部分尘量改给沟里的尘浪
    // 沟里的爆风推得久一点（管道里的压力降得慢）
    this.blastTau = this.scale.blastTau * (1 + this.T.confinement.channelDurationK * this.confined);
    const shift = this.T.confinement.channelShift * this.confined * this.columnQ;
    this.columnQ -= shift; this.pendingSurge += shift;
    this._BlastWeights();
    this._InjectColumn();
    this._InjectShockSkin();
    this.ready = true;
  }

  /**
   * 震起的地面尘：炸点半径 R 以内整片地面扬起一层贴地的尘。中间多、边上少；
   * 坡陡（沟壁）与凸起（沟沿、土垄顶、坑沿）的地方多 —— 一开始这层尘把地形的轮廓原样描出来。
   */
  _InjectShockSkin() {
    const N = this.N, c = this.cell, B = this.B, K = this.K, S = this.T.shock, sc = this.scale;
    const R = Math.min(S.radiusK * sc.cube, this.extent / 2 - 2 * c);
    this.shockR = R;
    // 花瓣形外沿：几组不同频率的正弦叠起来（每次落点相位不同），外沿忽远忽近
    const ph = [this.cx * 0.37 + this.cz * 0.11, this.cx * 0.13 - this.cz * 0.41, this.cx * 0.29 + this.cz * 0.23];
    const Edge = (a) => 1 + S.lobeAmp * (0.55 * Math.sin(S.lobes * a + ph[0]) + 0.3 * Math.sin((S.lobes + 4) * a + ph[1])
      + 0.15 * Math.sin((2 * S.lobes + 3) * a + ph[2]));
    let total = 0;
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      const q = j * N + i;
      const dx = this.minX + (i + 0.5) * c - this.cx, dz = this.minZ + (j + 0.5) * c - this.cz;
      const r = Math.hypot(dx, dz), Rl = Math.min(R, R * Edge(Math.atan2(dz, dx)));
      if (r >= Rl) continue;
      const u = 1 - r / Rl;
      const amp = (S.edge + (S.center - S.edge) * Math.pow(u, S.falloff)) * (1 - Smooth(0.6 * Rl, Rl, r));
      const gx = (B[q + 1] - B[q - 1]) / (2 * c), gz = (B[q + N] - B[q - N]) / (2 * c);
      const slope = Math.min(1.5, Math.hypot(gx, gz));
      const convex = Math.max(0, Math.min(1, -(B[q + 1] + B[q - 1] + B[q + N] + B[q - N] - 4 * B[q]) / c));
      K[q] = amp * (1 + S.slopeK * slope + S.convexK * convex) * this.massScale;
      total += K[q];
    }
    this.shockQ0 = total * c * c;
  }

  /** 按方向量「通畅长度」：气浪平着往外走多远会撞上高出来的地面（沟壁、土坎）。 */
  _Confinement() {
    const C = this.T.confinement, sc = this.scale, n = C.rays, c = this.cell;
    // 量墙的高度随弹坑变：250 kg 航弹的坑比沟还宽，2 m 深的沟夹不住它的气浪。
    const y0 = this.groundY + C.jetLiftM + C.jetLiftK * sc.craterR, top = y0 + C.jetClimbM;
    const maxL = this.extent / 2 - c;
    this.jet = new Float32Array(n);
    let open = 0;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU, dx = Math.cos(a), dz = Math.sin(a);
      let L = maxL;
      for (let s = c * 0.5; s <= maxL; s += c * 0.5) {
        if (this.SampleB(this.cx + dx * s, this.cz + dz * s) > top) { L = s; break; }
      }
      this.jet[k] = L;
      // 两米外就撞墙的方向不算通（沟壁）；能吹满尘浪半径的才算全通。
      open += Smooth(1.5 * sc.craterR, sc.surgeR, L);
    }
    open /= n;
    this.openFraction = open;
    this.confined = 1 - open;
    this.boost = Math.min(C.maxBoost, Math.pow(Math.max(C.minOpen, open), -C.boostExp));
  }

  /** 方向 a（弧度）上的通畅长度，相邻两条射线线性插值。 */
  JetLength(a) {
    const n = this.jet.length;
    let f = (a / TAU) * n; f -= Math.floor(f / n) * n;
    const k0 = Math.floor(f) % n, k1 = (k0 + 1) % n, t = f - Math.floor(f);
    return this.jet[k0] * (1 - t) + this.jet[k1] * t;
  }

  /** 方向偏置：斜着砸进去的弹，下游一侧抛得多。 */
  Bias(dx, dz) {
    return 1 + this.T.downrangeBias * this.horizontal * (dx * this.downX + dz * this.downZ);
  }

  /**
   * 气浪的「沿沟路程」：从炸点出发、只走气浪平着能过去的低处（同 _Confinement 的墙高判据），
   * Dijkstra 算每格的路程 D。平地上 D 就是直线距离；沟里炸，D 顺着沟走、拐过折角。
   */
  _ChannelDistance() {
    const N = this.N, c = this.cell, C = this.T.confinement, sc = this.scale, B = this.B;
    // 风只在沟底与坡脚走（比量墙的高度低）：不然爆风把尘一路推上沟壁、翻过土垄，沟形就没了
    const top = this.groundY + C.windPassM + C.jetLiftK * sc.craterR;
    const D = new Float32Array(N * N).fill(Infinity);
    const ci = Math.max(0, Math.min(N - 1, Math.floor((this.cx - this.minX) / c)));
    const cj = Math.max(0, Math.min(N - 1, Math.floor((this.cz - this.minZ) / c)));
    const crater2 = (sc.craterR + c) ** 2;
    const Pass = (q) => {
      if (B[q] <= top) return true;
      const i = q % N, j = (q - i) / N;     // 弹坑里一律能过（坑沿被炸开了）
      return (this.minX + (i + 0.5) * c - this.cx) ** 2 + (this.minZ + (j + 0.5) * c - this.cz) ** 2 < crater2;
    };
    // 二叉堆（下标堆，值 = D）
    const heap = new Int32Array(N * N * 8); let size = 0;
    const Push = (q) => {
      let k = size++; heap[k] = q;
      while (k > 0) { const p = (k - 1) >> 1; if (D[heap[p]] <= D[heap[k]]) break; const t = heap[p]; heap[p] = heap[k]; heap[k] = t; k = p; }
    };
    const Pop = () => {
      const top = heap[0]; heap[0] = heap[--size]; let k = 0;
      for (;;) { const l = 2 * k + 1, r = l + 1; let m = k;
        if (l < size && D[heap[l]] < D[heap[m]]) m = l; if (r < size && D[heap[r]] < D[heap[m]]) m = r;
        if (m === k) break; const t = heap[m]; heap[m] = heap[k]; heap[k] = t; k = m; }
      return top;
    };
    const start = cj * N + ci;
    D[start] = Math.hypot(this.minX + (ci + 0.5) * c - this.cx, this.minZ + (cj + 0.5) * c - this.cz);
    Push(start);
    const maxD = this.extent / 2;
    const steps = [[1, 0, c], [-1, 0, c], [0, 1, c], [0, -1, c], [1, 1, c * Math.SQRT2], [1, -1, c * Math.SQRT2], [-1, 1, c * Math.SQRT2], [-1, -1, c * Math.SQRT2]];
    const done = new Uint8Array(N * N);
    while (size > 0) {
      const q = Pop();
      if (done[q]) continue; done[q] = 1;
      if (D[q] > maxD) continue;
      const i = q % N, j = (q - i) / N;
      for (const [di, dj, w] of steps) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const nq = nj * N + ni;
        if (done[nq] || !Pass(nq)) continue;
        if (di && dj && (!Pass(j * N + ni) || !Pass(nj * N + i))) continue;   // 不许斜着钻墙角
        const nd = D[q] + w;
        if (nd < D[nq]) { D[nq] = nd; if (size < heap.length) Push(nq); }
      }
    }
    this.channelD = D;
  }

  /**
   * 预算每个面的气浪权重。方向 = 沿沟路程 D 增加的方向（平地上就是径向，沟里顺着沟、拐过折角）；
   * 大小按路程衰减，绕得越远（D 比直线距离多出来的部分）衰减越快 —— 护墙挡掉大半，余下的拐过去。
   * 只有两边都能通的面才有风；撞墙那一面为零。
   */
  _BlastWeights() {
    this._ChannelDistance();
    const N = this.N, N1 = N + 1, c = this.cell, sc = this.scale, r0 = sc.craterR;
    const p = this.T.scale.blastFalloff * (1 - this.T.confinement.channelFalloff * this.confined);
    const D = this.channelD, detour = this.T.confinement.detourLoss, reach = this.extent / 2 - 1.5 * c;
    // 炸点直线看得到的地方（在该方向的通畅长度以内）用直线距离与径向方向；看不到的（拐角后面）才用沿沟路程。
    // 八邻域 Dijkstra 的路程等高线是八角形，平地上全用它会让尘浪沿 22.5° 的几条线起放射状条纹。
    const Weight = (a, b, px, pz, nx, nz) => {
      const da = D[a], db = D[b];
      if (!Number.isFinite(da) || !Number.isFinite(db)) return 0;
      const dx = px - this.cx, dz = pz - this.cz, r = Math.hypot(dx, dz);
      if (r < 1e-4) return 0;
      const ux = dx / r, uz = dz / r;
      const sight = 1 - Smooth(this.JetLength(Math.atan2(dz, dx)) - c, this.JetLength(Math.atan2(dz, dx)) + 2 * c, r);
      const gradD = Math.max(-1, Math.min(1, (db - da) / c));
      const grad = sight * (ux * nx + uz * nz) + (1 - sight) * gradD;
      const d = 0.5 * (da + db), eff = sight * r + (1 - sight) * (d + detour * Math.max(0, d - r));
      if (eff > reach) return 0;
      return Math.pow(r0 / (eff + r0), p) * (1 - Smooth(reach * 0.8, reach, eff)) * this.Bias(ux, uz) * grad;
    };
    for (let j = 0; j < N; j++) for (let i = 1; i < N; i++) {
      this.blastX[j * N1 + i] = Weight(j * N + i - 1, j * N + i, this.minX + i * c, this.minZ + (j + 0.5) * c, 1, 0);
    }
    for (let j = 1; j < N; j++) for (let i = 0; i < N; i++) {
      this.blastZ[j * N + i] = Weight((j - 1) * N + i, j * N + i, this.minX + (i + 0.5) * c, this.minZ + j * c, 0, 1);
    }
  }

  /** 中心土柱：一开始就是一段贴着弹坑的竖直尘，带着很大的上升速度（冲到 columnH 附近）。 */
  _InjectColumn() {
    const sc = this.scale, N = this.N, c = this.cell, T = this.T;
    const height = sc.columnH * (1 + T.confinement.columnBoost * this.confined);
    // 沟里炸：土柱更高也更窄（侧面被沟壁收住）
    const radius = T.mass.columnRadiusK * sc.columnH * (1 - 0.35 * this.confined) + c;
    const v0 = height / sc.riseTau;
    let weight = 0;
    const cells = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = this.minX + (i + 0.5) * c, z = this.minZ + (j + 0.5) * c;
      const r = Math.hypot(x - this.cx, z - this.cz) / radius;
      if (r >= 1) continue;
      const w = (1 - r * r);
      cells.push(j * N + i, w); weight += w;
    }
    if (!weight) { cells.push(this.Index(N >> 1, N >> 1), 1); weight = 1; }
    const area = c * c;
    for (let k = 0; k < cells.length; k += 2) {
      const idx = cells[k], w = cells[k + 1], m = this.columnQ * w / weight / area;
      const g = this.B[idx];
      // 穹顶：边上那圈冲得没中心高（w = 1 − r²）
      const rise = v0 * (1 - T.mass.columnDome * (1 - w));
      this.M[idx] += m; this.MZb[idx] += m * g; this.MZt[idx] += m * (g + 0.6);
      this.MR[idx] += m * rise; this.MF[idx] += m;   // 土柱是最新鲜的黑土
    }
    this.columnHeight = height;
  }

  // --- 悬浮层坐标 --------------------------------------------------------------

  /** 世界坐标 → 悬浮网格的格号（最近格）；出界返回 -1。 */
  LoftIndexAt(x, z) {
    const i = Math.floor((x - this.loftX) / this.loftCell), j = Math.floor((z - this.loftZ) / this.loftCell);
    if (i < 0 || j < 0 || i >= this.N || j >= this.N) return -1;
    return j * this.N + i;
  }

  /** 往悬浮层加一份尘（按光学量加权混合底 / 顶 / 上升速度 / 新鲜度）。 */
  _Deposit(x, z, m, zb, zt, rise, fresh) {
    const idx = this.LoftIndexAt(x, z);
    if (idx < 0 || m <= 0) return;
    this.M[idx] += m; this.MZb[idx] += m * zb; this.MZt[idx] += m * zt;
    this.MR[idx] += m * rise; this.MF[idx] += m * fresh;
  }

  // --- 推进 ------------------------------------------------------------------

  /** 推进 dt 秒（内部按 CFL 自动细分）。返回这张网格还在不在。 */
  Step(dt) {
    if (this.finished) return false;
    if (!this.ready) this._Init();
    const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
    if (step <= 0) return true;
    const S = this.T.surge;
    if (this.surgeActive) {
      // CFL：面速度 × dt ≤ 0.45 格。早期气浪 30+ m/s 时一帧要细分三四次，后面一次就够。
      const vmax = Math.max(this._MaxFaceSpeed(), this.scale.blastV * this.boost * Math.exp(-this.time / this.blastTau));
      const n = Math.max(1, Math.min(6, Math.ceil(step * vmax / (0.45 * this.cell))));
      const sub = step / n;
      for (let k = 0; k < n; k++) { this._StepSurge(sub, this.time + sub * k); this.stats.substeps++; }
      this._SmoothSurge(step);
      if (this.time > S.life) this._EndSurge();
    }
    this._StepLoft(step);
    this._StepSkin(step);
    this.time += step;
    const L = this.T.loft;
    if (this.time > L.life || (this.time > 3 && this.TotalLoft() + this.TotalSurge() + this.TotalSkin() < this.T.emptyQ * 10)) {
      this.finished = true;
    }
    return !this.finished;
  }

  _MaxFaceSpeed() {
    let m = 0;
    for (let k = 0; k < this.Ux.length; k++) { const v = Math.abs(this.Ux[k]); if (v > m) m = v; }
    for (let k = 0; k < this.Uz.length; k++) { const v = Math.abs(this.Uz[k]); if (v > m) m = v; }
    return m;
  }

  /** 有尘的格子的包围框（外扩 2 格）：早期尘只在炸点附近，循环不必扫整张网格。 */
  _WetBox() {
    const N = this.N, H = this.H;
    let i0 = N, i1 = -1, j0 = N, j1 = -1;
    for (let j = 0; j < N; j++) {
      const row = j * N;
      for (let i = 0; i < N; i++) if (H[row + i] >= EPS_H) {
        if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j;
      }
    }
    if (i1 < 0) return null;
    return [Math.max(0, i0 - 2), Math.min(N - 1, i1 + 2), Math.max(0, j0 - 2), Math.min(N - 1, j1 + 2)];
  }

  _StepSurge(dt, t) {
    const N = this.N, N1 = N + 1, c = this.cell, S = this.T.surge, sc = this.scale;
    const B = this.B, H = this.H, Sg = this.Sg, FS = this.FS, Ux = this.Ux, Uz = this.Uz;
    const BX = this.blastX, BZ = this.blastZ;
    const g = S.gReduced, damp = Math.exp(-S.drag * dt), relax = 1 - Math.exp(-dt / S.relaxS);
    const blast = sc.blastV * this.boost * Math.exp(-t / this.blastTau);
    const vcap = 0.45 * c / dt, gk = g / c * dt;
    // 下游已经堆到七成封顶厚度就不再往里推（路程场的死角会把尘一格格挤成黑疙瘩）
    const pushH = 0.7 * (S.maxHK * sc.cube + 1);
    const box = this._WetBox();
    if (box) {
      const [i0, i1, j0, j1] = box;
      // 1) 面速度：重力（表面高差）+ 气浪（只推不刹）+ 阻尼；尘面低过邻格地面的方向一律不通。
      //    包围框外的面一律清零（那里没有尘，速度没有意义）。
      for (let j = j0; j <= j1; j++) {
        const row = j * N1, cellRow = j * N;
        for (let i = Math.max(1, i0); i <= Math.min(N - 1, i1 + 1); i++) {
          const a = cellRow + i - 1, b = a + 1, Ha = H[a], Hb = H[b];
          let u = 0;
          if (Ha >= EPS_H || Hb >= EPS_H) {
            const Sa = B[a] + Ha, Sb = B[b] + Hb;
            u = Ux[row + i] - gk * (Sb - Sa);
            // 爆风只推不刹，但推不上坡：下游尘面比上游高出半米就不推了（否则在路程场汇聚处一格格往上堆）
            const target = blast * BX[row + i];
            if (target > 0 ? (u < target && Sb < Sa + 0.5 && Hb < pushH) : (u > target && Sa < Sb + 0.5 && Ha < pushH)) u += (target - u) * relax;
            u *= damp;
            if (u > 0) { if (Ha < EPS_H || Sa < B[b] + 0.02) u = 0; else if (u > vcap) u = vcap; }
            else if (u < 0) { if (Hb < EPS_H || Sb < B[a] + 0.02) u = 0; else if (u < -vcap) u = -vcap; }
          }
          Ux[row + i] = u;
        }
        Ux[row] = Math.min(0, Ux[row + 1]);           // 边界只许流出
        Ux[row + N] = Math.max(0, Ux[row + N - 1]);
      }
      for (let j = Math.max(1, j0); j <= Math.min(N - 1, j1 + 1); j++) {
        const row = j * N;
        for (let i = i0; i <= i1; i++) {
          const a = row - N + i, b = row + i, Ha = H[a], Hb = H[b];
          let u = 0;
          if (Ha >= EPS_H || Hb >= EPS_H) {
            const Sa = B[a] + Ha, Sb = B[b] + Hb;
            u = Uz[row + i] - gk * (Sb - Sa);
            const target = blast * BZ[row + i];
            if (target > 0 ? (u < target && Sb < Sa + 0.5 && Hb < pushH) : (u > target && Sa < Sb + 0.5 && Ha < pushH)) u += (target - u) * relax;
            u *= damp;
            if (u > 0) { if (Ha < EPS_H || Sa < B[b] + 0.02) u = 0; else if (u > vcap) u = vcap; }
            else if (u < 0) { if (Hb < EPS_H || Sb < B[a] + 0.02) u = 0; else if (u < -vcap) u = -vcap; }
          }
          Uz[row + i] = u;
        }
      }
      for (let i = i0; i <= i1; i++) { Uz[i] = Math.min(0, Uz[N + i]); Uz[N * N + i] = Math.max(0, Uz[(N - 1) * N + i]); }

      // 2) 输运：迎风格按比例搬走，单格一步最多搬走 95%（保正）。
      const out = this.out, k = dt / c;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) out[j * N + i] = 0;
      for (let j = j0; j <= j1; j++) {
        const row = j * N1, cellRow = j * N;
        for (let i = i0; i <= i1 + 1; i++) {
          const u = Ux[row + i];
          if (u > 0) { if (i > 0) out[cellRow + i - 1] += u * k; }
          else if (u < 0 && i < N) out[cellRow + i] -= u * k;
        }
      }
      for (let j = j0; j <= j1 + 1; j++) {
        const row = j * N;
        for (let i = i0; i <= i1; i++) {
          const u = Uz[row + i];
          if (u > 0) { if (j > 0) out[row - N + i] += u * k; }
          else if (u < 0 && j < N) out[row + i] -= u * k;
        }
      }
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const q = j * N + i, o = out[q];
        out[q] = o > 0.95 ? 0.95 / o : 1;
      }
      const dH = this.dH, dS = this.dS, dF = this.dF;
      const lo = Math.max(0, j0 - 1) * N, hi = Math.min(N - 1, j1 + 1) * N + N;
      dH.fill(0, lo, hi); dS.fill(0, lo, hi); dF.fill(0, lo, hi);
      for (let j = j0; j <= j1; j++) {
        const row = j * N1, cellRow = j * N;
        for (let i = i0; i <= i1 + 1; i++) {
          const u = Ux[row + i];
          let from = -1, to = -1, frac = 0;
          if (u > 0 && i > 0) { from = cellRow + i - 1; to = i < N ? from + 1 : -1; frac = u * k * out[from]; }
          else if (u < 0 && i < N) { from = cellRow + i; to = i > 0 ? from - 1 : -1; frac = -u * k * out[from]; }
          if (from < 0) continue;
          const h = H[from] * frac, sv = Sg[from] * frac, f = FS[from] * frac;
          dH[from] -= h; dS[from] -= sv; dF[from] -= f;
          if (to >= 0) { dH[to] += h; dS[to] += sv; dF[to] += f; }
        }
      }
      for (let j = j0; j <= j1 + 1; j++) {
        const row = j * N;
        for (let i = i0; i <= i1; i++) {
          const u = Uz[row + i];
          let from = -1, to = -1, frac = 0;
          if (u > 0 && j > 0) { from = row - N + i; to = j < N ? from + N : -1; frac = u * k * out[from]; }
          else if (u < 0 && j < N) { from = row + i; to = j > 0 ? from - N : -1; frac = -u * k * out[from]; }
          if (from < 0) continue;
          const h = H[from] * frac, sv = Sg[from] * frac, f = FS[from] * frac;
          dH[from] -= h; dS[from] -= sv; dF[from] -= f;
          if (to >= 0) { dH[to] += h; dS[to] += sv; dF[to] += f; }
        }
      }
      // 厚度封顶：挤成一堆的尘变浓、不变高（贴地层不该比土柱还高）
      const capH = S.maxHK * sc.cube + 1;
      for (let q = lo; q < hi; q++) {
        if (dH[q] === 0 && dS[q] === 0) continue;
        const h = H[q] + dH[q], sv = Sg[q] + dS[q], f = FS[q] + dF[q];
        H[q] = h > 0 ? (h < capH ? h : capH) : 0; Sg[q] = sv > 0 ? sv : 0; FS[q] = f > 0 ? f : 0;
      }
    }

    // 3) 源：炸点持续冒尘（源格堆到 capH 就先存着，下一步再冒）。
    if (this.pendingSurge > 0 && t < S.injectS * 3) {
      const want = Math.min(this.pendingSurge, (this.scale.surgeQ / S.injectS) * dt);
      const done = this._InjectSurge(want);
      this.pendingSurge -= done; this.injectedSurge += done;
    }
    // 4) 土柱回落：中心一带的悬浮土落回来变成尘浪（重的黑土先下来）。
    const fb = this.T.column.fallbackS;
    if (t >= fb[0] && t < fb[1]) this._Fallback(-Math.log(1 - this.T.column.fallback) / (fb[1] - fb[0]) * dt);
    // 5) 卷吸变厚、被卷起、落回地面、褪色。
    const wet = this._WetBox();
    if (!wet) return;
    // 沟里炸：被夹住的气浪在沟里打着旋往上翻，早期卷起得更快 —— 从沟里冒出一道沿沟的尘墙
    const lift0 = S.lift[0] + S.confinedLift * this.confined;
    const liftRate = lift0 + Math.max(0, S.lift[1] - lift0) * Smooth(S.liftRampS[0], S.liftRampS[1], t);
    const maxH = S.maxHK * sc.cube + 1;
    const fresh = Math.exp(-dt / this.T.freshTauS);
    const sigma = this.T.mass.surgeSigma, ent = S.entrain * dt, liftH = liftRate * dt;
    const kHeavy = dt / S.settleHeavyS, kFine = dt / S.settleFineS;
    for (let j = wet[2]; j <= wet[3]; j++) for (let i = wet[0]; i <= wet[1]; i++) {
      const q = j * N + i;
      if (H[q] < EPS_H) { if (H[q] > 0 || Sg[q] > 0) { H[q] = 0; Sg[q] = 0; FS[q] = 0; } continue; }
      const speed = 0.5 * (Math.abs(Ux[j * N1 + i]) + Math.abs(Ux[j * N1 + i + 1])
        + Math.abs(Uz[j * N + i]) + Math.abs(Uz[(j + 1) * N + i]));
      if (H[q] < maxH) { const h = H[q] + ent * speed; H[q] = h < maxH ? h : maxH; }
      const F = Sg[q] > 1e-6 ? Math.min(1, FS[q] / Sg[q]) : 0;
      const lift = Sg[q] * liftH;
      if (lift > 0) {
        const b = B[q], h = H[q];
        this._Deposit(this.minX + (i + 0.5) * c, this.minZ + (j + 0.5) * c, lift, b + 0.15 * h,
          b + 1.1 * h + 0.4 + S.confinedTopM * this.confined, S.liftRise + S.confinedRise * this.confined, F);
        Sg[q] -= lift; FS[q] -= lift * F; H[q] -= h * liftH;
      }
      const settle = Math.exp(-(F * kHeavy + (1 - F) * kFine));
      Sg[q] *= settle; FS[q] *= settle * fresh;
      H[q] *= Math.sqrt(settle);
      // 光学量太少的尘层不再撑厚度（否则一层看不见的「空尘」还在用重力推别人）
      if (Sg[q] < 0.02 * sigma * H[q]) H[q] *= 0.9;
    }
  }

  /** 贴地层的数值扩散（×∛W）：粗网格（大炸弹 1.6 m 一格）上尘浪来回振荡，会在画面上留下一圈圈等高线似的纹。 */
  _SmoothSurge(dt) {
    const a = Math.min(0.2, this.T.surge.smoothK * this.scale.cube * dt / (this.cell * this.cell));
    const box = a > 1e-4 ? this._WetBox() : null;
    if (!box) return;
    for (const field of [this.H, this.Sg, this.FS]) this._Diffuse(field, a, box);
  }

  /** 往炸点附近的源格注入光学量 want（m²）。返回实际注入了多少（被 capH 卡住的留着下次）。 */
  _InjectSurge(want) {
    const N = this.N, c = this.cell, sc = this.scale, S = this.T.surge;
    // 沟里炸：源头先别堆得高过沟沿太多，让尘先顺沟走（漫出沟沿的那部分晚一点、少一点）
    const radius = sc.craterR + 1.5 * c, capH = (S.capK * sc.cube + S.capPad) * (1 - S.confinedCap * this.confined), sigma = this.T.mass.surgeSigma;
    if (!this.sourceCells) {
      const cells = []; let total = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = this.minX + (i + 0.5) * c, z = this.minZ + (j + 0.5) * c, dx = x - this.cx, dz = z - this.cz;
        const r = Math.hypot(dx, dz);
        if (r >= radius) continue;
        const w = (1 - (r / radius) ** 2) * (r > 1e-4 ? this.Bias(dx / r, dz / r) : 1);
        cells.push(j * N + i, w); total += w;
      }
      if (!cells.length) { cells.push(this.Index(N >> 1, N >> 1), 1); total = 1; }
      this.sourceCells = cells; this.sourceWeight = total;
    }
    const area = c * c, cells = this.sourceCells;
    let done = 0;
    for (let k = 0; k < cells.length; k += 2) {
      const q = cells[k];
      let s = want * cells[k + 1] / this.sourceWeight / area;     // 光学深度
      const room = Math.max(0, capH - this.H[q]) * sigma;
      if (s > room) s = room;
      if (s <= 0) continue;
      this.Sg[q] += s; this.FS[q] += s; this.H[q] += s / sigma;
      done += s * area;
    }
    return done;
  }

  _Fallback(rate) {
    const N = this.N, c = this.cell, sigma = this.T.mass.surgeSigma;
    const maxH = this.T.surge.maxHK * this.scale.cube + 1;
    const ratio = (this.loftCell * this.loftCell) / (c * c);
    if (!this.fallbackCells) {
      const radius = (this.T.mass.columnRadiusK * this.scale.columnH + c) * 1.3, cells = [];
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        if (Math.hypot(this.minX + (i + 0.5) * c - this.cx, this.minZ + (j + 0.5) * c - this.cz) < radius) cells.push(j * N + i);
      }
      this.fallbackCells = cells;
    }
    for (const q of this.fallbackCells) {
      const i = q % N, j = (q - i) / N;
      const x = this.minX + (i + 0.5) * c, z = this.minZ + (j + 0.5) * c;
      const L = this.LoftIndexAt(x, z);
      if (L < 0 || this.M[L] <= 1e-6) continue;
      // 一格悬浮层可能盖住好几格地面层（后期胀大）；早期两张网格重合，ratio = 1。
      // 沟里炸：塌下来的重土多半落回沟里（沟沿上那几格少落一些，留在空中），尘浪于是先顺沟走
      const low = this.B[q] <= this.groundY + 0.6 ? 1 : 1 - 0.6 * this.confined;
      const take = Math.min(this.M[L], this.M[L] * rate * low / Math.max(1, ratio));
      const f = this.MF[L] / this.M[L], k = take / this.M[L];
      this.M[L] -= take; this.MZb[L] *= 1 - k; this.MZt[L] *= 1 - k; this.MR[L] *= 1 - k; this.MF[L] -= take * f;
      const s = take * ratio;
      // 厚度封顶（只加浓度）：不封的话炸点那一两格会被堆成三十多米高的一根细尘柱
      this.Sg[q] += s; this.FS[q] += s * f; this.H[q] = Math.min(maxH, this.H[q] + s / sigma);
    }
  }

  /** 尘浪这一层收工：剩下的全部卷进悬浮层。 */
  _EndSurge() {
    const N = this.N, c = this.cell;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const q = j * N + i;
      if (this.Sg[q] <= 1e-5) continue;
      const F = Math.min(1, this.FS[q] / this.Sg[q]), b = this.B[q], h = this.H[q];
      this._Deposit(this.minX + (i + 0.5) * c, this.minZ + (j + 0.5) * c, this.Sg[q], b + 0.1 * h, b + h + 0.3, this.T.loft.riseInf, F);
    }
    this.H.fill(0); this.Sg.fill(0); this.FS.fill(0); this.Ux.fill(0); this.Uz.fill(0);
    this.surgeActive = false;
  }

  _StepLoft(dt) {
    const L = this.T.loft, N = this.N, t = this.time, sc = this.scale;
    // 1) 随风平移（刚炸开时尘跟着气浪走，渐渐才随风）
    const ramp = Smooth(0, L.windRampS, t) * L.windFactor;
    this.loftX += this.wind.x * ramp * dt; this.loftZ += this.wind.z * ramp * dt;
    // 2) 后期整体胀大：绕网格中心放大格距，光学深度按面积摊薄
    if (t > L.expandStartS) {
      const k = 1 + L.expand * dt, half = N * 0.5;
      const cx = this.loftX + half * this.loftCell, cz = this.loftZ + half * this.loftCell;
      this.loftCell *= k; this.loftX = cx - half * this.loftCell; this.loftZ = cz - half * this.loftCell;
      const a = 1 / (k * k);
      for (let q = 0; q < this.M.length; q++) {
        if (this.M[q] <= 0) continue;
        this.M[q] *= a; this.MZb[q] *= a; this.MZt[q] *= a; this.MR[q] *= a; this.MF[q] *= a;
      }
    }
    // 3) 上升、上下扩、离地、落掉、褪色
    const baseFrac = this.T.column.baseLift + L.baseLift * Smooth(0, L.baseLiftS, t);
    const riseDecay = Math.exp(-dt / sc.riseTau), fresh = Math.exp(-dt / this.T.freshTauS);
    const M = this.M, MZb = this.MZb, MZt = this.MZt, MR = this.MR, MF = this.MF;
    let i0 = N, i1 = -1, j0 = N, j1 = -1;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const q = j * N + i, m = M[q];
      if (m <= 1e-6) { if (m !== 0) { M[q] = 0; MZb[q] = 0; MZt[q] = 0; MR[q] = 0; MF[q] = 0; } continue; }
      if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j;
      let zb = MZb[q] / m, zt = MZt[q] / m, r = MR[q] / m, f = Math.min(1, MF[q] / m);
      r = L.riseInf + (r - L.riseInf) * riseDecay;
      zt += (r + L.spreadZ) * dt;
      zb += (r * baseFrac - L.spreadZ * 0.35) * dt;
      const ground = this.SampleB(this.loftX + (i + 0.5) * this.loftCell, this.loftZ + (j + 0.5) * this.loftCell);
      if (zb < ground - 0.15) zb = ground - 0.15;
      if (zt < zb + 0.5) zt = zb + 0.5;
      const keep = Math.exp(-dt * (f / L.fallHeavyS + (1 - f) / L.fallFineS));
      const nm = m * keep;
      M[q] = nm; MZb[q] = nm * zb; MZt[q] = nm * zt; MR[q] = nm * r; MF[q] = nm * f * fresh;
    }
    // 4) 水平扩散（显式五点，系数 ≤ 0.2 保稳定）：只扫有尘的包围框外扩一格
    const a = Math.min(0.2, L.diffuse * dt / (this.loftCell * this.loftCell));
    if (a > 1e-4 && i1 >= 0) {
      const box = [Math.max(0, i0 - 1), Math.min(N - 1, i1 + 1), Math.max(0, j0 - 1), Math.min(N - 1, j1 + 1)];
      for (const field of [M, MZb, MZt, MR, MF]) this._Diffuse(field, a, box);
    }
  }

  _StepSkin(dt) {
    const S = this.T.shock, N = this.N, K = this.K, t = this.time;
    if (t > S.windDelayS) {
      const ramp = Smooth(S.windDelayS, S.windDelayS + 2, t) * S.windFactor;
      this.skinX += this.wind.x * ramp * dt; this.skinZ += this.wind.z * ramp * dt;
    }
    const keep = Math.exp(-dt / S.decayS);
    let i0 = N, i1 = -1, j0 = N, j1 = -1;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const q = j * N + i;
      if (K[q] <= 1e-5) { K[q] = 0; continue; }
      K[q] *= keep;
      if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j;
    }
    const a = Math.min(0.2, S.diffuse * dt / (this.cell * this.cell));
    if (i1 >= 0 && a > 1e-4) this._Diffuse(K, a, [Math.max(0, i0 - 1), Math.min(N - 1, i1 + 1), Math.max(0, j0 - 1), Math.min(N - 1, j1 + 1)]);
  }

  /** 震起的地面尘此刻的厚度与离地高度（米）：全场一个数，底面贴着各处的地面。 */
  SkinShape() {
    const S = this.T.shock, t = this.time, root = Math.sqrt(this.scale.cube);
    // 大炸弹震起的尘带更高（×√∛W）：75 mm 一两米，250 kg 四五米
    return {
      h: (S.h0 + S.grow * (1 - Math.exp(-t / 0.9)) + S.growLate * t) * root,
      lift: S.lift * Math.max(0, t - S.liftDelayS) * root,
    };
  }

  _Diffuse(field, a, [i0, i1, j0, j1]) {
    const N = this.N, tmp = this.tmp;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const q = j * N + i, v = field[q];
      const l = i > 0 ? field[q - 1] : 0, r = i < N - 1 ? field[q + 1] : 0;
      const d = j > 0 ? field[q - N] : 0, u = j < N - 1 ? field[q + N] : 0;
      tmp[q] = v + a * (l + r + d + u - 4 * v);
    }
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const q = j * N + i; field[q] = tmp[q] > 0 ? tmp[q] : 0; }
  }

  // --- 读数 ------------------------------------------------------------------

  /** 贴地层总光学量（m²）。 */
  TotalSurge() { let s = 0; for (let q = 0; q < this.Sg.length; q++) s += this.Sg[q]; return s * this.cell * this.cell; }
  /** 震起的地面尘总光学量（m²）。 */
  TotalSkin() { let s = 0; for (let q = 0; q < this.K.length; q++) s += this.K[q]; return s * this.cell * this.cell; }
  /** 悬浮层总光学量（m²）。 */
  TotalLoft() { let s = 0; for (let q = 0; q < this.M.length; q++) s += this.M[q]; return s * this.loftCell * this.loftCell; }

  /** 世界坐标处贴地层的光学深度与厚度（最近格）。 */
  SurgeAt(x, z) {
    const i = Math.floor((x - this.minX) / this.cell), j = Math.floor((z - this.minZ) / this.cell);
    if (i < 0 || j < 0 || i >= this.N || j >= this.N) return { s: 0, h: 0, ground: NaN };
    const q = j * this.N + i;
    return { s: this.Sg[q], h: this.H[q], ground: this.B[q] };
  }

  /** 世界坐标处悬浮层的光学深度 / 底 / 顶（最近格）。 */
  LoftAt(x, z) {
    const q = this.LoftIndexAt(x, z);
    if (q < 0 || this.M[q] <= 0) return { m: 0, zb: NaN, zt: NaN };
    return { m: this.M[q], zb: this.MZb[q] / this.M[q], zt: this.MZt[q] / this.M[q] };
  }

  /** 整体淡出系数（寿命最后 fadeS 秒线性收掉）。 */
  Fade() {
    const L = this.T.loft;
    return 1 - Smooth(L.life - L.fadeS, L.life, this.time);
  }

  /**
   * 打包给渲染：两张 N×N 的 RGBA 浮点图。按光学量预乘（线性过滤在空格与有尘格之间插值时，
   * 底 / 顶 / 新鲜度才是按尘的多少加权的，不会被空格的 0 拖到地面上）：
   *   surge  [地面 − baseY, 厚度 H, 光学深度 Sg, Sg·新鲜度]
   *   loft   [光学深度 M, M·(底 − baseY), M·(顶 − baseY), M·新鲜度]
   * 返回 AABB 与两张图的世界矩形。
   */
  Pack(surge, loft, skin = null) {
    const N = this.N, base = this.baseY;
    let top = this.groundMaxY;
    for (let q = 0; q < N * N; q++) {
      const o = q * 4, h = this.H[q], s = this.Sg[q];
      surge[o] = this.B[q] - base; surge[o + 1] = h; surge[o + 2] = s; surge[o + 3] = Math.min(s, this.FS[q]);
      if (h > EPS_H && this.B[q] + h > top) top = this.B[q] + h;
      const m = this.M[q];
      if (m > 1e-5) {
        const zt = this.MZt[q] / m;
        loft[o] = m; loft[o + 1] = this.MZb[q] - m * base; loft[o + 2] = this.MZt[q] - m * base; loft[o + 3] = Math.min(m, this.MF[q]);
        if (zt > top) top = zt;
      } else { loft[o] = 0; loft[o + 1] = 0; loft[o + 2] = 0; loft[o + 3] = 0; }
      if (skin) { skin[o] = this.K[q]; skin[o + 1] = 0; skin[o + 2] = 0; skin[o + 3] = 0; }
    }
    const shape = this.SkinShape();
    if (this.ready) top = Math.max(top, this.groundMaxY + shape.lift + shape.h + 0.5);
    const loftSize = N * this.loftCell;
    return {
      baseY: base,
      minY: base - 0.3, maxY: top + 1.2,
      minX: Math.min(this.minX, this.loftX, this.skinX), maxX: Math.max(this.minX + this.extent, this.loftX + loftSize, this.skinX + this.extent),
      minZ: Math.min(this.minZ, this.loftZ, this.skinZ), maxZ: Math.max(this.minZ + this.extent, this.loftZ + loftSize, this.skinZ + this.extent),
      surgeRect: [this.minX, this.minZ, this.extent, this.extent],
      loftRect: [this.loftX, this.loftZ, loftSize, loftSize],
      skinRect: [this.skinX, this.skinZ, this.extent, this.extent],
      skinH: shape.h, skinLift: shape.lift, shockR: this.shockR || 0, shockV: this.T.shock.frontV,
      impact: [this.cx, this.cz],
      fade: this.Fade(),
    };
  }

  /** 取证：给测试与 Debug 面板。 */
  Inspect() {
    return {
      N: this.N, cell: +this.cell.toFixed(3), extent: +this.extent.toFixed(2), time: +this.time.toFixed(3),
      chargeKg: this.scale.chargeKg, cube: +this.scale.cube.toFixed(3),
      confined: this.ready ? +this.confined.toFixed(3) : null, boost: this.ready ? +this.boost.toFixed(3) : null,
      columnHeight: this.ready ? +this.columnHeight.toFixed(2) : null,
      surgeQ: +this.TotalSurge().toFixed(2), loftQ: +this.TotalLoft().toFixed(2), skinQ: +this.TotalSkin().toFixed(2),
      shockR: this.ready ? +this.shockR.toFixed(2) : null,
      injected: +this.injectedSurge.toFixed(2), surgeActive: this.surgeActive, finished: this.finished,
      substeps: this.stats.substeps,
    };
  }
}
