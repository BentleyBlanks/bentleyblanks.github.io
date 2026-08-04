// 《地道里的光》 —— 剖面里的烟与水（2D 网格流体解算）。
//
// 日军往地道里灌烟、灌水，是大纲里最有画面的两件事。这里做的是真解算，
// 不是贴图平移：半拉格朗日平流 + 雅可比压力投影 + 涡量约束，
// 固体边界直接取地道剖面（土是墙，掏出来的洞是流场）。
//   烟：有浮力，贴着洞顶往前爬，遇到通风眼会被抽走；
//   水：受重力，沿洞底流淌积深，先淹低处。

const Clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class TunnelFluid {
  constructor({ x0, x1, yBottom, yTop, cols = 190, rows = 26 }) {
    this.x0 = x0; this.x1 = x1;
    this.yBottom = yBottom; this.yTop = yTop;
    this.cols = cols; this.rows = rows;
    const n = cols * rows;
    this.n = n;
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.vx0 = new Float32Array(n);
    this.vy0 = new Float32Array(n);
    this.p = new Float32Array(n);
    this.div = new Float32Array(n);
    this.smoke = new Float32Array(n);
    this.smoke0 = new Float32Array(n);
    this.water = new Float32Array(n);
    this.water0 = new Float32Array(n);
    this.solid = new Uint8Array(n);
    this.cellW = (x1 - x0) / cols;
    this.cellH = (yTop - yBottom) / rows;
    this.vents = [];
    this.time = 0;
  }

  Index(c, r) { return r * this.cols + c; }
  ColOf(worldX) { return Clamp((worldX - this.x0) / (this.x1 - this.x0) * (this.cols - 1), 0, this.cols - 1); }
  RowOf(worldY) { return Clamp((worldY - this.yBottom) / (this.yTop - this.yBottom) * (this.rows - 1), 0, this.rows - 1); }
  WorldX(c) { return this.x0 + (c / (this.cols - 1)) * (this.x1 - this.x0); }
  WorldY(r) { return this.yBottom + (r / (this.rows - 1)) * (this.yTop - this.yBottom); }

  /** 用空气矩形定义流场：矩形内可流动，其余是土 */
  SetAirRects(rects) {
    this.solid.fill(1);
    for (const a of rects) {
      const c0 = Math.floor(this.ColOf(a.x0)), c1 = Math.ceil(this.ColOf(a.x1));
      const r0 = Math.floor(this.RowOf(a.y0)), r1 = Math.ceil(this.RowOf(a.y1));
      for (let r = r0; r <= r1; r += 1) {
        for (let c = c0; c <= c1; c += 1) {
          if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
          this.solid[this.Index(c, r)] = 0;
        }
      }
    }
    // 四周封死
    for (let c = 0; c < this.cols; c += 1) {
      this.solid[this.Index(c, 0)] = 1;
      this.solid[this.Index(c, this.rows - 1)] = 1;
    }
    for (let r = 0; r < this.rows; r += 1) {
      this.solid[this.Index(0, r)] = 1;
      this.solid[this.Index(this.cols - 1, r)] = 1;
    }
  }

  /** 通风眼：把烟往上抽走 */
  SetVents(xs) { this.vents = xs.map((x) => Math.round(this.ColOf(x))); }

  Emit(worldX, worldY, { smoke = 0, water = 0, vx = 0, vy = 0, radius = 1.2 } = {}) {
    const c0 = Math.round(this.ColOf(worldX));
    const r0 = Math.round(this.RowOf(worldY));
    const rc = Math.max(1, Math.round(radius / this.cellW));
    const rr = Math.max(1, Math.round(radius / this.cellH));
    for (let r = r0 - rr; r <= r0 + rr; r += 1) {
      for (let c = c0 - rc; c <= c0 + rc; c += 1) {
        if (c < 1 || r < 1 || c >= this.cols - 1 || r >= this.rows - 1) continue;
        const i = this.Index(c, r);
        if (this.solid[i]) continue;
        const d = Math.hypot((c - c0) / rc, (r - r0) / rr);
        if (d > 1) continue;
        const f = 1 - d;
        this.smoke[i] = Math.min(2.4, this.smoke[i] + smoke * f);
        this.water[i] = Math.min(2.4, this.water[i] + water * f);
        this.vx[i] += vx * f;
        this.vy[i] += vy * f;
      }
    }
  }

  // velX/velY：回溯用的速度场。速度自平流必须用快照，否则会读到
  // 正在被覆盖的同一个数组（别名），数值会滚雪球式爆掉。
  Advect(dst, src, dt, velX = this.vx, velY = this.vy) {
    const { cols, rows } = this;
    const dtx = dt / this.cellW;
    const dty = dt / this.cellH;
    for (let r = 1; r < rows - 1; r += 1) {
      for (let c = 1; c < cols - 1; c += 1) {
        const i = this.Index(c, r);
        if (this.solid[i]) { dst[i] = 0; continue; }
        let x = c - dtx * velX[i];
        let y = r - dty * velY[i];
        if (!Number.isFinite(x) || !Number.isFinite(y)) { dst[i] = 0; continue; }
        x = Clamp(x, 0.5, cols - 1.5);
        y = Clamp(y, 0.5, rows - 1.5);
        // 回溯点落进土里就退回原格，避免质量被固体吞掉
        if (this.solid[this.Index(Math.round(x), Math.round(y))]) { dst[i] = src[i]; continue; }
        const c0 = Math.floor(x), r0 = Math.floor(y);
        const s1 = x - c0, s0 = 1 - s1;
        const t1 = y - r0, t0 = 1 - t1;
        dst[i] = s0 * (t0 * src[this.Index(c0, r0)] + t1 * src[this.Index(c0, r0 + 1)])
          + s1 * (t0 * src[this.Index(c0 + 1, r0)] + t1 * src[this.Index(c0 + 1, r0 + 1)]);
      }
    }
  }

  Project(iterations = 18) {
    const { cols, rows } = this;
    this.div.fill(0);
    this.p.fill(0);
    for (let r = 1; r < rows - 1; r += 1) {
      for (let c = 1; c < cols - 1; c += 1) {
        const i = this.Index(c, r);
        if (this.solid[i]) continue;
        this.div[i] = -0.5 * (
          (this.vx[this.Index(c + 1, r)] - this.vx[this.Index(c - 1, r)]) / this.cellW
          + (this.vy[this.Index(c, r + 1)] - this.vy[this.Index(c, r - 1)]) / this.cellH);
      }
    }
    for (let k = 0; k < iterations; k += 1) {
      for (let r = 1; r < rows - 1; r += 1) {
        for (let c = 1; c < cols - 1; c += 1) {
          const i = this.Index(c, r);
          if (this.solid[i]) continue;
          // 分母固定为 4：若按"流体邻居数"取，细长走廊里大量格子只有一个
          // 流体邻居，全 Neumann 边界下该迭代发散 → Infinity → 相减成 NaN，
          // 整片场会被平流污染。固定分母略损精度但稳定。
          let sum = 0;
          for (const j of [this.Index(c - 1, r), this.Index(c + 1, r), this.Index(c, r - 1), this.Index(c, r + 1)]) {
            if (this.solid[j]) continue;      // 固体边界：视作 p=0，不传播
            sum += this.p[j];
          }
          this.p[i] = (this.div[i] + sum) / 4;
        }
      }
    }
    for (let r = 1; r < rows - 1; r += 1) {
      for (let c = 1; c < cols - 1; c += 1) {
        const i = this.Index(c, r);
        if (this.solid[i]) { this.vx[i] = 0; this.vy[i] = 0; continue; }
        this.vx[i] -= 0.5 * (this.p[this.Index(c + 1, r)] - this.p[this.Index(c - 1, r)]) / this.cellW;
        this.vy[i] -= 0.5 * (this.p[this.Index(c, r + 1)] - this.p[this.Index(c, r - 1)]) / this.cellH;
      }
    }
  }

  /** 数值卫生：非有限值就地归零。解算里一个 NaN 会顺着平流污染整片场 */
  Sanitize(tag) {
    let bad = 0;
    for (let i = 0; i < this.n; i += 1) {
      if (!Number.isFinite(this.vx[i])) { this.vx[i] = 0; bad += 1; }
      if (!Number.isFinite(this.vy[i])) { this.vy[i] = 0; bad += 1; }
      if (!Number.isFinite(this.smoke[i])) { this.smoke[i] = 0; bad += 1; }
      if (!Number.isFinite(this.water[i])) { this.water[i] = 0; bad += 1; }
    }
    if (bad) this.lastBad = { tag, bad };
    return bad;
  }

  Step(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.time += dt;
    const { cols, rows } = this;
    const dtc = Math.min(0.05, dt);

    // 力：烟有浮力往上、水受重力往下；涡量约束保住翻滚的细节
    for (let r = 1; r < rows - 1; r += 1) {
      for (let c = 1; c < cols - 1; c += 1) {
        const i = this.Index(c, r);
        if (this.solid[i]) continue;
        this.vy[i] += this.smoke[i] * 1.15 * dtc;       // 浮力
        this.vy[i] -= this.water[i] * 9.0 * dtc;       // 重力
        // 洞顶阻尼：烟贴顶爬行
        this.vx[i] *= 0.9985;
        this.vy[i] *= 0.997;
        // 限幅：一帧内位移不超过约一格，平流采样才稳
        const maxVX = this.cellW / Math.max(1e-3, dtc) * 0.9;
        const maxVY = this.cellH / Math.max(1e-3, dtc) * 0.9;
        this.vx[i] = Clamp(this.vx[i], -maxVX, maxVX);
        this.vy[i] = Clamp(this.vy[i], -maxVY, maxVY);
        // 无穿透边界：贴着土的那一面不许有指向土里的速度分量。
        // 少了这一条，浮力会把烟顶进洞顶的固体格，而平流会把进入固体的
        // 量直接清零 —— 烟就是这么被"洞顶吃掉"的。
        if (this.solid[this.Index(c, r + 1)] && this.vy[i] > 0) this.vy[i] = 0;
        if (this.solid[this.Index(c, r - 1)] && this.vy[i] < 0) this.vy[i] = 0;
        if (this.solid[this.Index(c + 1, r)] && this.vx[i] > 0) this.vx[i] = 0;
        if (this.solid[this.Index(c - 1, r)] && this.vx[i] < 0) this.vx[i] = 0;
      }
    }
    // 涡量约束
    for (let r = 2; r < rows - 2; r += 1) {
      for (let c = 2; c < cols - 2; c += 1) {
        const i = this.Index(c, r);
        if (this.solid[i]) continue;
        const curl = (this.vy[this.Index(c + 1, r)] - this.vy[this.Index(c - 1, r)]) / (2 * this.cellW)
          - (this.vx[this.Index(c, r + 1)] - this.vx[this.Index(c, r - 1)]) / (2 * this.cellH);
        this.vx[i] += curl * 0.10 * dtc;
        this.vy[i] += Math.abs(curl) * 0.04 * dtc;
      }
    }

    this.Sanitize("force");
    this.Project();
    this.Sanitize("project1");

    this.vx0.set(this.vx); this.vy0.set(this.vy);
    this.Advect(this.vx, this.vx0, dtc, this.vx0, this.vy0);
    this.Advect(this.vy, this.vy0, dtc, this.vx0, this.vy0);
    this.Project();

    this.Sanitize("advectV");
    this.smoke0.set(this.smoke);
    this.Advect(this.smoke, this.smoke0, dtc);
    this.water0.set(this.water);
    this.Advect(this.water, this.water0, dtc);

    // 通风眼抽烟
    for (const vc of this.vents) {
      for (let r = rows - 6; r < rows - 1; r += 1) {
        for (let c = vc - 2; c <= vc + 2; c += 1) {
          if (c < 1 || c >= cols - 1) continue;
          const i = this.Index(c, r);
          if (this.solid[i]) continue;
          this.smoke[i] *= 0.965;
          this.vy[i] += 2.4 * dtc;
        }
      }
    }

    // 水往低处铺：向下渗与横向摊平
    for (let r = 1; r < rows - 1; r += 1) {
      for (let c = 1; c < cols - 1; c += 1) {
        const i = this.Index(c, r);
        if (this.solid[i] || this.water[i] <= 0.001) continue;
        const below = this.Index(c, r - 1);
        if (!this.solid[below] && this.water[below] < 1.4) {
          const move = Math.min(this.water[i], (1.4 - this.water[below])) * 0.42;
          this.water[i] -= move;
          this.water[below] += move;
        } else {
          for (const j of [this.Index(c - 1, r), this.Index(c + 1, r)]) {
            if (this.solid[j]) continue;
            const diff = (this.water[i] - this.water[j]) * 0.18;
            if (diff > 0) { this.water[i] -= diff; this.water[j] += diff; }
          }
        }
      }
    }

    this.Sanitize("advectS");
    // 轻微耗散
    for (let i = 0; i < this.n; i += 1) {
      this.smoke[i] *= 0.99965;
      if (this.smoke[i] < 0.0015) this.smoke[i] = 0;
    }
  }

  /** 烟的前锋（最西端还有烟的世界 x），玩法层用它判断"烟到哪了" */
  SmokeFrontX() {
    for (let c = 1; c < this.cols - 1; c += 1) {
      for (let r = 1; r < this.rows - 1; r += 1) {
        if (this.smoke[this.Index(c, r)] > 0.12) return this.WorldX(c);
      }
    }
    return this.x1;
  }

  WaterDepthAt(worldX) {
    const c = Math.round(this.ColOf(worldX));
    let depth = 0;
    for (let r = 1; r < this.rows - 1; r += 1) {
      if (this.water[this.Index(c, r)] > 0.25) depth = this.WorldY(r) - this.yBottom;
    }
    return depth;
  }

  /** 画到 ImageData：烟是灰白，水是浑黄 */
  Paint(imageData) {
    const px = imageData.data;
    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.cols; c += 1) {
        const i = this.Index(c, r);
        // 贴图 y 向下
        const o = ((this.rows - 1 - r) * this.cols + c) * 4;
        const sm = Clamp(this.smoke[i], 0, 1);
        const wt = Clamp(this.water[i], 0, 1);
        if (wt > 0.02) {
          // 浑水：泥汤色，越深越暗；表层薄水偏亮，像刚漫过来的一层
          const d = Math.min(1, wt * 1.6);
          px[o] = 92 - d * 34; px[o + 1] = 70 - d * 28; px[o + 2] = 40 - d * 18;
          px[o + 3] = Math.min(242, 120 + d * 122);
        } else if (sm > 0.02) {
          const d = Math.min(1, sm * 1.5);
          const v = 148 + d * 66;
          px[o] = v; px[o + 1] = v - 8; px[o + 2] = v - 24;
          px[o + 3] = Math.min(230, 40 + d * 190);
        } else {
          px[o + 3] = 0;
        }
      }
    }
  }
}

export function CreateTunnelFluid(options) { return new TunnelFluid(options); }
