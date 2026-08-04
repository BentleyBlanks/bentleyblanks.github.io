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
        this.smoke[i] = Math.min(1.6, this.smoke[i] + smoke * f);
        this.water[i] = Math.min(1.6, this.water[i] + water * f);
        this.vx[i] += vx * f;
        this.vy[i] += vy * f;
      }
    }
  }

  Advect(dst, src, dt) {
    const { cols, rows } = this;
    const dtx = dt / this.cellW;
    const dty = dt / this.cellH;
    for (let r = 1; r < rows - 1; r += 1) {
      for (let c = 1; c < cols - 1; c += 1) {
        const i = this.Index(c, r);
        if (this.solid[i]) { dst[i] = 0; continue; }
        let x = c - dtx * this.vx[i];
        let y = r - dty * this.vy[i];
        x = Clamp(x, 0.5, cols - 1.5);
        y = Clamp(y, 0.5, rows - 1.5);
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
          let sum = 0, cnt = 0;
          for (const j of [this.Index(c - 1, r), this.Index(c + 1, r), this.Index(c, r - 1), this.Index(c, r + 1)]) {
            if (this.solid[j]) continue;      // 固体边界：不参与压力传播
            sum += this.p[j];
            cnt += 1;
          }
          if (cnt) this.p[i] = (this.div[i] + sum) / cnt;
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

  Step(dt) {
    this.time += dt;
    const { cols, rows } = this;
    const dtc = Math.min(0.05, dt);

    // 力：烟有浮力往上、水受重力往下；涡量约束保住翻滚的细节
    for (let r = 1; r < rows - 1; r += 1) {
      for (let c = 1; c < cols - 1; c += 1) {
        const i = this.Index(c, r);
        if (this.solid[i]) continue;
        this.vy[i] += this.smoke[i] * 3.2 * dtc;       // 浮力
        this.vy[i] -= this.water[i] * 9.0 * dtc;       // 重力
        // 洞顶阻尼：烟贴顶爬行
        this.vx[i] *= 0.995;
        this.vy[i] *= 0.992;
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

    this.Project();

    this.vx0.set(this.vx); this.vy0.set(this.vy);
    this.Advect(this.vx, this.vx0, dtc);
    this.Advect(this.vy, this.vy0, dtc);
    this.Project();

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
          this.smoke[i] *= 0.90;
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

    // 轻微耗散
    for (let i = 0; i < this.n; i += 1) {
      this.smoke[i] *= 0.9985;
      if (this.smoke[i] < 0.002) this.smoke[i] = 0;
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
          px[o] = 96; px[o + 1] = 78; px[o + 2] = 50;
          px[o + 3] = Math.min(255, wt * 235);
        } else if (sm > 0.01) {
          const v = 150 + sm * 60;
          px[o] = v; px[o + 1] = v - 6; px[o + 2] = v - 18;
          px[o + 3] = Math.min(240, sm * 210);
        } else {
          px[o + 3] = 0;
        }
      }
    }
  }
}

export function CreateTunnelFluid(options) { return new TunnelFluid(options); }
