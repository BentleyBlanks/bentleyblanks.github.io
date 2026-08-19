// 《血战台儿庄》径向轮盘：按住一个键出盘、推鼠标指方向、松手执行。
//
// 为什么是径向盘而不是一条横排：ER2 的指挥手感来自"单手可达、不用看键"——
// 按住 Tab、鼠标一推、松手，一条命令就下出去了。原来这里是六行
// 「1跟我来 2向前 3固守…」的静态列表，选择只能靠数字键，眼睛必须离开战场。
//
// 有一条技术判断必须写清楚，因为它曾经被当成"轮盘做不了"的理由：
// **指针锁下拿不到 clientX/clientY，但 movementX/movementY 照常送达。**
// 轮盘只需要一个方向向量，不需要绝对坐标 —— 把每帧的 movement 累加进一个虚拟游标，
// 取 atan2 定扇区就够了。这是所有指针锁 FPS 的标准做法。
//
// 纯 Canvas 2D，零 3D 开销，零外部资源，不进渲染管线。

export class RadialWheel {
  /**
   * @param {HTMLElement} root HUD 的根节点
   * @param {object} options radius 盘半径（px）；deadzone 死区（px，盘中心不选任何一格）
   */
  constructor(root, { radius = 132, deadzone = 38 } = {}) {
    this.radius = radius;
    this.deadzone = deadzone;
    this.items = [];
    this.index = -1;
    this.open = false;
    this.cursorX = 0;
    this.cursorY = 0;

    const size = (radius + 46) * 2;
    const canvas = document.createElement("canvas");
    canvas.className = "hudWheel";
    canvas.width = size;
    canvas.height = size;
    // 样式写在这里而不是 CSS 里：这一层是自带外观的独立控件，
    // 少一处"改了 JS 忘了改 CSS"的耦合点
    canvas.style.cssText = "position:fixed;left:50%;top:50%;pointer-events:none;"
      + `margin-left:${-size / 2}px;margin-top:${-size / 2}px;opacity:0;`
      + "transition:opacity .12s ease-out;z-index:40";
    root.appendChild(canvas);
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.size = size;
  }

  /** 现在指着的那一格（没指着任何一格时是 null）。 */
  get Item() { return this.index >= 0 ? this.items[this.index] : null; }
  get Label() { return this.Item ? this.Item.label : null; }

  Open(items) {
    this.items = items || [];
    this.index = -1;
    this.cursorX = 0;
    this.cursorY = 0;
    this.open = true;
    this.canvas.style.opacity = "1";
    this.Draw();
  }

  /** 鼠标位移（指针锁下的 movementX/Y）。累进虚拟游标，再按角度定扇区。 */
  Move(dx, dy) {
    if (!this.open) return this.index;
    this.cursorX += dx;
    this.cursorY += dy;
    const len = Math.hypot(this.cursorX, this.cursorY);
    const max = this.radius * 1.15;
    if (len > max) {                    // 游标顶到盘边就停在边上，不许飞出屏幕
      this.cursorX *= max / len;
      this.cursorY *= max / len;
    }
    this.index = this._SectorAt(this.cursorX, this.cursorY);
    this.Draw();
    return this.index;
  }

  /** 数字键直选：轮盘的兜底通道，也是可访问性通道。 */
  Point(i) {
    if (!this.open || i < 0 || i >= this.items.length) return this.index;
    this.index = i;
    const a = this._AngleOf(i);
    this.cursorX = Math.sin(a) * this.radius * 0.8;
    this.cursorY = -Math.cos(a) * this.radius * 0.8;
    this.Draw();
    return this.index;
  }

  /** 取消这一次选择（数字键已经把命令下出去了，松手时不许再下一次）。 */
  ClearPick() {
    this.index = -1;
    if (this.open) this.Draw();
  }

  /** 松手。返回选中的那一格，没指着任何一格就返回 null。 */
  Close() {
    const picked = this.Item;
    this.open = false;
    this.canvas.style.opacity = "0";
    this.index = -1;
    return picked;
  }

  _AngleOf(i) {
    const n = Math.max(1, this.items.length);
    return (i / n) * Math.PI * 2;         // 0 = 正上方，顺时针
  }

  _SectorAt(x, y) {
    if (Math.hypot(x, y) < this.deadzone) return -1;
    const n = Math.max(1, this.items.length);
    let a = Math.atan2(x, -y);            // 屏幕上 y 向下，取负让 0 落在正上方
    if (a < 0) a += Math.PI * 2;
    return Math.round(a / (Math.PI * 2 / n)) % n;
  }

  Draw() {
    const ctx = this.ctx;
    const c = this.size / 2;
    const n = Math.max(1, this.items.length);
    const step = Math.PI * 2 / n;
    ctx.clearRect(0, 0, this.size, this.size);
    ctx.save();
    ctx.translate(c, c);

    for (let i = 0; i < n; i += 1) {
      const mid = this._AngleOf(i);
      // canvas 的角度零点在 +x，而我们的零点在正上方：差 90°
      const from = mid - step / 2 - Math.PI / 2;
      const to = mid + step / 2 - Math.PI / 2;
      const on = i === this.index;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, from + 0.012, to - 0.012);
      ctx.arc(0, 0, this.deadzone + 6, to - 0.012, from + 0.012, true);
      ctx.closePath();
      ctx.fillStyle = on ? "rgba(196,142,74,0.34)" : "rgba(12,12,14,0.52)";
      ctx.fill();
      ctx.strokeStyle = on ? "rgba(232,196,132,0.92)" : "rgba(210,200,180,0.20)";
      ctx.lineWidth = on ? 1.6 : 1;
      ctx.stroke();

      const lx = Math.sin(mid) * (this.radius * 0.70);
      const ly = -Math.cos(mid) * (this.radius * 0.70);
      ctx.fillStyle = on ? "#f6e6c8" : "rgba(226,216,196,0.78)";
      ctx.font = `${on ? 600 : 400} 15px "Noto Serif SC",serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this.items[i].label, lx, ly);
      ctx.font = "400 11px system-ui,sans-serif";
      ctx.fillStyle = "rgba(190,180,160,0.55)";
      ctx.fillText(String(i + 1), lx, ly + 15);
    }

    // 中心：指着哪一格就写哪一格的说明 —— 命令的代价必须在下之前看得见
    ctx.fillStyle = "rgba(246,230,200,0.86)";
    ctx.font = "400 12px system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const hint = this.Item ? (this.Item.hint || this.Item.label) : "推鼠标选，松开下令";
    const clipped = hint.length > 18 ? `${hint.slice(0, 17)}…` : hint;
    ctx.fillText(clipped, 0, 0);

    // 虚拟游标
    ctx.beginPath();
    ctx.arc(this.cursorX, this.cursorY, 3.4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(232,196,132,0.95)";
    ctx.fill();
    ctx.restore();
  }

  Dispose() {
    this.canvas.remove();
  }
}
