// 《地道里的光》 —— 2D 手绘风矢量美术库（Canvas 2D）。
// 目标：钢笔勾线 + 水彩填色的插画感（参考《勇敢的心》的 UbiArt 手绘质感），
// 而不是几何色块。所有形体用带抖动的贝塞尔路径绘制，抖动由 id 决定 —— 逐帧稳定，不闪。

// 梯子横档的落点表：画笔与爬梯骨架、Core 的一档一响共用一份（见 Data_Ladder 头注）
import { LadderHolds } from "./Data_Ladder.mjs";

// ---------------------------------------------------------------------------
// 调色：暖土黄的纸面基调 + 墨线
// ---------------------------------------------------------------------------
export const IN = {
  ink: "#2b1f16",
  inkSoft: "#4a382a",
  paper: "#e8d9b8",
};

export const PAL = {
  // 地表
  earthDay: ["#c8a86e", "#b08f56"],
  earthNight: ["#4a5568", "#39445a"],
  earthDawn: ["#b09a7a", "#96805f"],
  grass: "#7d8c4a",
  grassNight: "#3d4a44",
  // 建筑（1943 冀中平原的贫农村：土坯 + 麦秸泥 + 泥平顶，没有瓦、没有石灰）
  // **这一族的目标上屏值统一在 190~198**，见下面 Dim() 的反推表。
  // 老的 wallWarm/roofTile 已删——名字本身是陷阱，留着下一支笔就会理直气壮画瓦。
  adobe: "#8d7a5c",        // 土坯坯身
  adobeRender: "#9d8f72",  // 还没掉的麦秸泥抹面（比坯身亮不超过 12%）
  adobeDark: "#7d6c50",    // 补过的新泥：比坯身**暗**一档
  mudRoof: "#665940", mudRoofDark: "#4b4230",
  brickPlinth: "#4a4740", brickPlinthAlt: "#524d45",   // 旧青砖碱脚：略偏冷，但不许跳出来
  stalk: "#8a7a4e",        // 秫秸 / 苇箔 / 障子
  woodOld: "#6b5b46", woodOldDark: "#4e4234",          // 露天灰化的旧木
  indigo: "#3f4a5c", homespun: "#8f8168",              // 土布：靛蓝 / 本白
  wood: "#a8794a", woodDark: "#7a5433",
  burnt: "#4a423a", burntDark: "#332d27",
  // 自然
  tree: "#4e6038", treeDark: "#39482a",
  // 草垛分两面：迎风面被日晒风吹褪成灰白，背风面才留一点黄。
  // 一整垛同一个金色 = 刚打下来的新草，那是丰年。
  // **整体压了两档**（2026-08-10）：#a8904f 上屏比黄土路还亮，一垛草成了
  // 画面里最跳的一块（画布贴图没声明 sRGB 会被整体提亮，见 CanvasTexture）。
  // 这三个色只有 DrawHaystack 在用，调它不影响别处。
  hay: "#8a7440", hayWind: "#9a8550", hayDark: "#5f4f2c",
  crop: "#8a9a52",
  // 地下土层（从上到下的层理）
  soil: ["#8a6b45", "#7d5f3c", "#9a7850", "#6b4f33", "#5a4129"],
  tunnelAir: "#241a12",
  tunnelWall: "#7a5c3a",
  // 人物
  zhuzi: "#c8843c", zhuziDark: "#a2662a",
  sister: "#b8636e", sisterDark: "#934b56",
  // 娘穿靛蓝土布（华北农妇最常见的一身），爹穿土褐短褂——
  // 侧视白盒里认人主要靠色相，两个人都是褐色就永远分不出谁是谁
  mother: "#4e5c6b", motherDark: "#39434f", father: "#6d5340",
  militia: "#5a6b74", militiaDark: "#44535b",
  soldier: "#7a7448", soldierDark: "#5c5732",
  // 军官：将校呢比士兵的土黄卡其深一档、偏墨绿——审问那一拍是 6m 的近景，
  // 光靠帽子分不开，衣服的色阶才是三米外就读得出的那一档
  officer: "#333827", officerDark: "#20241a",
  puppet: "#8d8464", puppetDark: "#6d6549",
  villager: "#9a8d78", villagerDark: "#7a705c",
  skin: "#d8ab7c", skinDark: "#b98a5c",
  // 光
  lamp: "#ffbe5c", lampCore: "#ffe6a8",
  smoke: "#b8b4a8",
};

// ---------------------------------------------------------------------------
// 稳定随机（同一 id 每帧同一结果）
// ---------------------------------------------------------------------------
export function Hash(id) {
  let h = 2166136261;
  const s = String(id);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function Rnd(id, i) { return Hash(`${id}#${i}`); }
function Sym(id, i, amp) { return (Rnd(id, i) - 0.5) * 2 * amp; }

// ---------------------------------------------------------------------------
// 手绘路径：折线两端带抖动，笔触收尾略出头
// ---------------------------------------------------------------------------
// 沿边细分后逐点抖动：手绘的"线不直"，但转角还是转角（不会被磨成椭圆）
export function WobblyPath(ctx, pts, id, amp = 1.2, close = true) {
  ctx.beginPath();
  const n = pts.length;
  const corner = pts.map((p, i) => [p[0] + Sym(id, i * 2, amp * 0.6), p[1] + Sym(id, i * 2 + 1, amp * 0.6)]);
  ctx.moveTo(corner[0][0], corner[0][1]);
  const last = close ? n : n - 1;
  let seed = 0;
  for (let i = 0; i < last; i += 1) {
    const a = corner[i];
    const b = corner[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    // 每 ~16px 一个抖点，垂直于边方向偏移
    const steps = Math.max(1, Math.min(24, Math.round(len / 16)));
    const nx = len > 0.001 ? -dy / len : 0;
    const ny = len > 0.001 ? dx / len : 0;
    for (let s = 1; s <= steps; s += 1) {
      const t = s / steps;
      const bulge = s === steps ? 0 : Sym(id + "e", seed += 1, amp);
      ctx.lineTo(a[0] + dx * t + nx * bulge, a[1] + dy * t + ny * bulge);
    }
  }
  if (close) ctx.closePath();
}

// 闭合的 Catmull-Rom 样条：把几个控制点插成一圈密点（每段 segs 个），
// 交给 InkFill——头、帽子这类"应该是圆的"形体用它，多边形连线画出来全是折角
export function Spline(pts, segs = 5) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i += 1) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let s = 0; s < segs; s += 1) {
      const t = s / segs, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  return out;
}

export function InkFill(ctx, pts, id, fill, { amp = 1.2, line = IN.ink, lw = 2.2, close = true, shade = null, shadeAt = 0.55 } = {}) {
  WobblyPath(ctx, pts, id, amp, close);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (shade) {
    // 右下侧的一道暗部，做出体积
    ctx.save();
    ctx.clip();
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const y0 = Math.min(...ys), y1 = Math.max(...ys);
    ctx.fillStyle = shade;
    ctx.fillRect(x0 + (x1 - x0) * shadeAt, y0, (x1 - x0) * (1 - shadeAt) + 2, y1 - y0 + 2);
    ctx.restore();
    WobblyPath(ctx, pts, id, amp, close);
  }
  if (line && lw > 0) {
    ctx.strokeStyle = line;
    ctx.lineWidth = lw;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
  }
}

export function Rect(x, y, w, h) {
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

export function InkLine(ctx, x1, y1, x2, y2, id, { amp = 1, lw = 2, color = IN.ink } = {}) {
  ctx.beginPath();
  const mx = (x1 + x2) / 2 + Sym(id, 0, amp * 3);
  const my = (y1 + y2) / 2 + Sym(id, 1, amp * 3);
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(mx, my, x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.stroke();
}

// 排线阴影（斜向细线，插画感的关键）
export function Hatch(ctx, x, y, w, h, id, { spacing = 5, alpha = 0.16, angle = 0.7, color = IN.ink } = {}) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.1;
  const len = w + h;
  const dx = Math.cos(angle) * len, dy = Math.sin(angle) * len;
  for (let i = -h; i < w + h; i += spacing) {
    ctx.beginPath();
    ctx.moveTo(x + i + Sym(id, i, 1), y - 2);
    ctx.lineTo(x + i - dy * 0.2 + dx * 0.0 + (dy > 0 ? -h : h) * 0.7, y + h + 2);
    ctx.stroke();
  }
  ctx.restore();
}

// 颗粒点（土层/草垛的质感）
// ---------------------------------------------------------------------------
// 材质三件套（2026-08-17 用户："很多东西根本就不像，例如布料 焦木 灰 泥土"）
//
// 这三支是**材质**的通用笔，不是某一件东西的画法。共同的病根是老版把材质当
// 颜色画：布是一块多边形加两根直线、焦木是一根深色的线、灰是一个描了墨边的
// 半圆。可这三样东西之所以认得出来，靠的都不是颜色：
//   · 布靠**褶**——一道褶是从受力点拉出来的谷，谷心暗、旁边一条被绷亮的脊，
//     两头散掉；
//   · 焦木靠**龟裂**——烧过的木头表面炸成一格一格的鳞，缝里是灰白的；
//   · 灰靠**没有边**——它是倒着堆起来的粉，轮廓一描墨线就成了石头。
// ---------------------------------------------------------------------------

/** 一道布褶：谷心一条暗、背光侧一条被绷亮的脊，两头自己散掉。bow = 褶弯多少 */
export function ClothFold(ctx, x0, y0, x1, y1, w,
  { dark = "rgba(18,14,10,0.34)", lit = "rgba(255,246,224,0.26)", bow = 0 } = {}) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  const cx = (x0 + x1) / 2 + nx * bow, cy = (y0 + y1) / 2 + ny * bow;
  const band = (off, width, color) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.24, color);
    g.addColorStop(0.76, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.strokeStyle = g;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x0 + nx * off, y0 + ny * off);
    ctx.quadraticCurveTo(cx + nx * off, cy + ny * off, x1 + nx * off, y1 + ny * off);
    ctx.stroke();
  };
  ctx.save();
  band(w * 0.78, w * 0.6, lit);
  band(0, w, dark);
  ctx.restore();
}

/**
 * 烧焦的木面：**龟裂**。烧过的木头表面炸成一格一格发亮的黑鳞，缝里露出灰白的
 * 炭灰——这一格一格的网就是"焦"这个字唯一读得出来的地方。
 * 在已经填好底色的形状里调（调用处自己 clip），沿 (x0..x1, y0..y1) 铺网。
 */
export function CharScale(ctx, x0, y0, x1, y1, id, { cell = 7, fissure = "rgba(150,140,124,0.34)", plate = "rgba(10,8,6,0.5)" } = {}) {
  // 一格鳞至少要能塞进这块面里两三格。**格子跟形体一样宽就成了链条**
  //（第一版把它铺在五像素粗的椽子上，实拍读出来是三条挂着的铁链）
  const span = Math.min(Math.abs(x1 - x0), Math.abs(y1 - y0));
  if (span < 4) return;
  cell = Math.min(cell, span * 0.55);
  ctx.save();
  const cols = Math.max(1, Math.round((x1 - x0) / cell));
  const rows = Math.max(1, Math.round((y1 - y0) / cell));
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const px = x0 + (c + 0.5) * (x1 - x0) / cols + Sym(id + "cx", r * 40 + c, cell * 0.22);
      const py = y0 + (r + 0.5) * (y1 - y0) / rows + Sym(id + "cy", r * 40 + c, cell * 0.2);
      const w = cell * (0.34 + Rnd(id + "cw", r * 40 + c) * 0.16);
      const h = cell * (0.3 + Rnd(id + "ch", r * 40 + c) * 0.16);
      ctx.fillStyle = plate;
      ctx.beginPath();
      ctx.moveTo(px - w, py + Sym(id + "a", r * 40 + c, 0.8));
      ctx.lineTo(px + Sym(id + "b", r * 40 + c, 1.2), py - h);
      ctx.lineTo(px + w, py + Sym(id + "c", r * 40 + c, 0.8));
      ctx.lineTo(px + Sym(id + "d", r * 40 + c, 1.2), py + h);
      ctx.closePath();
      ctx.fill();
      // 裂缝里透出的炭灰：只给鳞的上沿一线，全描一圈就成了瓷砖
      ctx.strokeStyle = fissure;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(px - w, py);
      ctx.lineTo(px + Sym(id + "b", r * 40 + c, 1.2), py - h);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * 一堆草木灰。**不描外轮廓**——灰是倒出来堆着的粉，一描边就成了石头
 * （老版正是这么画的：一个 InkFill 的半圆，实拍读出来是路边一块灰石头）。
 * 它靠三样东西成立：крест上那一档发白的浮灰、底下越堆越沉的暗、
 * 以及埋在里头没烧透的**炭块与秫秸茬**——那才是"这是烧剩下的东西"。
 * 画在 (ax,ay)：ay 是接地线，hw/h 是半幅与高。
 */
export function DrawAshHeap(ctx, ax, ay, hw, h, id, { night = false, scoops = 0 } = {}) {
  const pale = night ? "#4b4d55" : "#787267";
  const mid = night ? "#33363d" : "#524d44";
  const deep = night ? "#1e2128" : "#332f29";
  // ① 摊在四周的一层浮灰：堆的脚是化开的，没有边
  ctx.save();
  const apron = ctx.createRadialGradient(ax, ay - 1, hw * 0.2, ax, ay - 1, hw * 1.5);
  apron.addColorStop(0, night ? "rgba(48,52,60,0.5)" : "rgba(104,98,88,0.46)");
  apron.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = apron;
  ctx.beginPath();
  ctx.ellipse(ax, ay - 1, hw * 1.5, Math.max(4, h * 0.34), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // ② 堆身：**低而阔、还塌了一边**。灰是倒出来自己摊平的，堆不成一个圆包——
  // 第一版给的是对称的半圆，实拍读出来是路边一块灰石头。所以顶上给两个高低
  // 不一样的包、中间塌下去一道，边沿带细齿
  const pts = [];
  const N = 26;
  const skew = Hash(id + "sk") * 0.5 + 0.25;
  for (let i = 0; i <= N; i += 1) {
    const t = i / N;
    const lobe = Math.exp(0 - ((t - skew) / 0.26) ** 2) * h
      + Math.exp(0 - ((t - (skew + 0.34)) / 0.20) ** 2) * h * 0.72;
    const bump = lobe * (1 - 0.12 * Math.sin(t * 12.7 + Hash(id + "w") * 6))
      + Math.sin(t * 23.3) * h * 0.05;
    pts.push([ax - hw + hw * 2 * t, ay - Math.max(0.6, bump * Math.sin(t * Math.PI) ** 0.28)]);
  }
  const bodyPath = () => {
    ctx.beginPath();
    ctx.moveTo(ax - hw * 1.06, ay + 1);
    for (const [px, py] of pts) ctx.lineTo(px, py);
    ctx.lineTo(ax + hw * 1.06, ay + 1);
    ctx.closePath();
  };
  const body = ctx.createLinearGradient(0, ay - h, 0, ay + 1);
  body.addColorStop(0, pale);
  body.addColorStop(0.45, mid);
  body.addColorStop(1, deep);
  // **边要虚**。灰没有轮廓——只要给它一条干净利落的边，人眼当场把它读成石头
  //（2026-08-17 实拍连着两轮都是"路边一块灰石头"）。所以堆身是**糊着填**的，
  // 硬的东西（炭块、秸秆茬）再压在上头，虚实的对比反过来说明这是粉
  ctx.save();
  ctx.filter = `blur(${Math.max(1.2, hw * 0.07)}px)`;
  bodyPath();
  ctx.fillStyle = body;
  ctx.fill();
  ctx.filter = "none";
  ctx.restore();
  ctx.save();
  bodyPath();
  ctx.clip();
  // 面上的粉：细密的亮点，一层一层往下稀
  Speckle(ctx, ax - hw, ay - h, hw * 2, h, id + "dust",
    { count: Math.round(hw * 1.6), alpha: night ? 0.16 : 0.26, size: 1.5, color: pale });
  Speckle(ctx, ax - hw, ay - h * 0.55, hw * 2, h * 0.6, id + "dk",
    { count: Math.round(hw * 0.5), alpha: 0.16, size: 1.4, color: deep });
  // 扒过的坑：一道月牙暗，坑沿一线亮
  for (let s = 0; s < scoops; s += 1) {
    const sx = ax + (Hash(id + "sx" + s) - 0.5) * hw * 1.2;
    const sy = ay - h * (0.25 + Hash(id + "sy" + s) * 0.4);
    const sr = hw * (0.2 + Hash(id + "sr" + s) * 0.14);
    ctx.fillStyle = "rgba(0,0,0,0.26)";
    ctx.beginPath();
    ctx.ellipse(sx, sy, sr, sr * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = night ? "rgba(92,98,108,0.4)" : "rgba(146,140,128,0.45)";
    ctx.beginPath();
    ctx.ellipse(sx, sy + sr * 0.42, sr * 0.9, sr * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // ③ 没烧透的炭块：**有棱有角**（灰是粉、炭是块，这一对比就是"烧剩下的"），
  // 半埋在灰里，向光的一棱带一线灰白
  const nC = Math.max(2, Math.round(hw / 13));
  for (let i = 0; i < nC; i += 1) {
    const t = 0.1 + Hash(id + "cx" + i) * 0.8;
    const cx = ax - hw + hw * 2 * t;
    const cy = ay - 1 - Hash(id + "cy" + i) * h * 0.62;
    const r = 1.3 + Hash(id + "cr" + i) * 1.9;
    const spin = Hash(id + "ca" + i) * 3;
    const poly = [];
    for (let a = 0; a < 5; a += 1) {
      const ang = (a / 5) * Math.PI * 2 + spin;
      const q = r * (0.66 + Hash(id + "cq" + i + a) * 0.6);
      poly.push([cx + Math.cos(ang) * q, cy + Math.sin(ang) * q * 0.78]);
    }
    ctx.save();
    ctx.fillStyle = night ? "#1b1e25" : "#2a231a";
    ctx.beginPath();
    ctx.moveTo(poly[0][0], poly[0][1]);
    for (const p of poly.slice(1)) ctx.lineTo(p[0], p[1]);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = night ? "rgba(96,102,112,0.45)" : "rgba(140,132,118,0.45)";
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(poly[0][0], poly[0][1]);
    ctx.lineTo(poly[1][0], poly[1][1]);
    ctx.lineTo(poly[2][0], poly[2][1]);
    ctx.stroke();
    ctx.restore();
  }
  // ④ 烧了一半的秫秸茬：从灰里斜插出来几根，梢上一点白
  for (let i = 0; i < Math.max(4, Math.round(hw / 5)); i += 1) {
    const t = 0.14 + Hash(id + "sk" + i) * 0.72;
    const sx = ax - hw + hw * 2 * t;
    const sy = ay - 1 - Hash(id + "sy2" + i) * h * 0.4;
    const len = 6 + Hash(id + "sl" + i) * h * 1.05;
    const lean = (Hash(id + "sa" + i) - 0.5) * 2.4;
    ctx.save();
    ctx.strokeStyle = night ? "#14161c" : "#221c14";
    ctx.lineWidth = 1.5 + Hash(id + "sw" + i) * 0.9;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(sx + lean * len * 0.3, sy - len * 0.6, sx + lean * len, sy - len);
    ctx.stroke();
    ctx.fillStyle = night ? "rgba(104,110,120,0.7)" : "rgba(154,146,132,0.7)";
    ctx.beginPath();
    ctx.ellipse(sx + lean * len, sy - len, 1.3, 1.0, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // ⑤ 接地那一线：只有这儿有暗，堆的上沿一笔墨都不许有
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(ax, ay + 0.5, hw * 1.1, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function Speckle(ctx, x, y, w, h, id, { count = 24, color = IN.ink, alpha = 0.18, size = 1.6 } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let i = 0; i < count; i += 1) {
    const px = x + Rnd(id, i * 3) * w;
    const py = y + Rnd(id, i * 3 + 1) * h;
    const s = size * (0.5 + Rnd(id, i * 3 + 2));
    ctx.beginPath();
    ctx.ellipse(px, py, s, s * 0.7, Rnd(id, i) * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 土坯建筑通用件（2026-08-10 用户退回："村庄一点都不像敌后战场照片里的
// 那么破"）。三件事被反复犯：①颜色没按 sRGB 反推压过，土墙比黄土路还亮；
// ②墙头是一条从头齐到尾的水平线——那是机器砌的；③一面墙一个平色。
// ---------------------------------------------------------------------------

/**
 * 按 ^2.2 压暗。CanvasTexture 没声明 sRGB，整套贴图上屏被整体提亮
 *（项目记忆 tunnellight-canvas-texture-washout），所以源色必须先压。
 * 反推表（目标上屏 → 源分量）：210→166 / 200→149 / 195→142 / 190→134 /
 * 180→119 / 170→105 / 160→91 / 150→79 / 140→68 / 120→49。
 * 土坯/夯土面**全街统一到上屏 190~198**，也就是 #8a7a5c 一族。
 */
export function Dim(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * 起伏的墙头。**全文件禁止再把 Rect() 直接当墙用**——土坯是一块块垒的、
 * 年年抹泥年年掉，没有一条直线；一条从头齐到尾的墙头是本作最出戏的一处。
 * 返回一串顶边采样点（从左到右），交给 InkFill 收口。
 */
export function RaggedTop(x0, x1, y, id, { sag = 5, n = 9, tiltR = 0 } = {}) {
  const pts = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    // 中段下坠（年年下沉）+ 一头更低 + 每点自己再抖
    const dip = Math.sin(t * Math.PI) * sag;
    pts.push([x0 + (x1 - x0) * t, y + dip + t * tiltR + Sym(id + "rt", i, 2.2)]);
  }
  return pts;
}

/**
 * 土坯墙面的风化：错缝坯层 + 还没掉的抹泥 + 补过的新泥 + 墙根泛碱 + 雨沟 + 裂缝。
 * 这一套原来只长在 DrawHouse 里，现在全街的墙共用——**"抹泥掉了才露出坯缝"
 * 这件事，缺了"还没掉的那几块"就不成立**，光有坯缝是一面赤裸的坯墙。
 * 层厚与砖长都要抖：精确等分的网格是烧结砖砌体，不是手托的坯。
 */
export function WeatherAdobe(ctx, x0, y0, w, h, id, {
  course = 13, alkali = 0.26, gullies = 5, cracks = 3, patches = 3,
  render = PAL.adobeRender, fresh = PAL.adobeDark, seam = 0.26,
} = {}) {
  // ① 还没掉的抹泥（先铺，坯缝压在它上面才有"底下露出来"的关系）
  ctx.save();
  for (let i = 0; i < patches; i += 1) {
    const pw = w * (0.18 + Rnd(id + "rd", i) * 0.26);
    const ph = h * (0.28 + Rnd(id + "rd2", i) * 0.36);
    const px = x0 + Rnd(id + "rd3", i) * (w - pw);
    const py = y0 + Rnd(id + "rd4", i) * (h - ph) * 0.85;
    ctx.globalAlpha = 0.30 + Rnd(id + "rd5", i) * 0.24;
    InkFill(ctx, [
      [px, py + Sym(id + "e" + i, 0, 3)], [px + pw, py + Sym(id + "e" + i, 1, 3)],
      [px + pw + Sym(id + "e" + i, 2, 3), py + ph], [px + Sym(id + "e" + i, 3, 3), py + ph],
    ], id + "rend" + i, render, { amp: 2.6, lw: 0, line: null });
  }
  ctx.restore();

  // ② 坯缝：层厚抖 ±15%、砖长抖 ±20%、错缝偏移随机
  ctx.save();
  ctx.globalAlpha = seam;
  ctx.strokeStyle = "#5e4c33";
  let yy = y0 + h;
  for (let ly = 1; yy > y0 + 4; ly += 1) {
    const ch = course * (0.85 + Rnd(id + "ch", ly) * 0.3);
    yy -= ch;
    if (yy < y0 + 2) break;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(x0 + 2, yy);
    for (let t = 0; t <= 12; t += 1) ctx.lineTo(x0 + (w * t) / 12, yy + Sym(id + "ly" + ly, t, 1.8));
    ctx.stroke();
    let vx = x0 + 6 + Rnd(id + "off", ly) * course * 2.2;
    while (vx < x0 + w - 4) {
      ctx.beginPath();
      ctx.moveTo(vx, yy);
      ctx.lineTo(vx + Sym(id + "v" + ly + vx, 0, 1.4), yy + ch);
      ctx.stroke();
      vx += course * (2.6 + Rnd(id + "bl" + ly, vx) * 1.6);
    }
  }
  ctx.restore();

  // ③ 补过的新泥：比坯身暗一档，抹子拖出来的圆弧边
  for (let i = 0; i < 2; i += 1) {
    const fw = w * (0.10 + Rnd(id + "fx", i) * 0.14);
    const fx = x0 + Rnd(id + "fx2", i) * (w - fw);
    const fy = y0 + h * (0.30 + Rnd(id + "fx3", i) * 0.42);
    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = fresh;
    ctx.beginPath();
    ctx.ellipse(fx + fw / 2, fy, fw / 2, fw * (0.30 + Rnd(id + "fx4", i) * 0.2),
      Sym(id + "fx5", i, 0.4), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ④ 墙根泛碱：盐碱地的墙根是**发白**的，不是返潮的深色
  ctx.save();
  const alk = ctx.createLinearGradient(0, y0 + h * (1 - alkali), 0, y0 + h);
  alk.addColorStop(0, "rgba(188,180,158,0)");
  alk.addColorStop(1, "rgba(188,180,158,0.40)");
  ctx.fillStyle = alk;
  ctx.fillRect(x0, y0 + h * (1 - alkali), w, h * alkali);
  ctx.restore();

  // ⑤ 雨水冲出来的竖沟
  for (let i = 0; i < gullies; i += 1) {
    const gx = x0 + 8 + Rnd(id + "gu", i) * (w - 16);
    const gh = h * (0.16 + Rnd(id + "gu2", i) * 0.28);
    InkLine(ctx, gx, y0 + h - gh, gx + Sym(id + "gu3", i, 3), y0 + h,
      id + "gully" + i, { lw: 1.6 + Rnd(id + "gu4", i) * 1.4, color: "rgba(112,90,62,0.30)", amp: 1.6 });
  }

  // ⑥ 裂缝：斜着往下走，越往下越散
  for (let i = 0; i < cracks; i += 1) {
    let cxk = x0 + w * (0.20 + i * 0.26 + Rnd(id + "cx", i) * 0.1);
    let cyk = y0 + h * (0.28 + Rnd(id + "ck", i) * 0.22);
    for (let seg = 0; seg < 4; seg += 1) {
      const nx = cxk + (Rnd(id + "ck2", i * 4 + seg) - 0.45) * 12;
      const ny = cyk + 10 + Rnd(id + "ck3", i * 4 + seg) * 10;
      if (ny > y0 + h - 4) break;
      InkLine(ctx, cxk, cyk, nx, ny, id + "crk" + i + seg,
        { lw: 1.5, color: "rgba(78,60,40,0.42)", amp: 1.2 });
      cxk = nx; cyk = ny;
    }
  }
}

/**
 * 旧青砖碱脚：2~5 皮半截砖乱砌，只铺 55~65% 宽，一头没入土里断掉。
 * **不许整圈、不许齐平、不许成片毛石**——那是太行山区的石砌房，本作是平原。
 */
export function BrickPlinth(ctx, x0, w, groundY, id, { rows = 3, cover = 0.6 } = {}) {
  const span = w * cover;
  const sx = x0 + Rnd(id + "pl", 0) * (w - span);
  const bh = 3.4;
  for (let r = 0; r < rows; r += 1) {
    const yy = groundY - (r + 1) * bh;
    // 越往上越短：砖被抠走的、塌掉的
    const rowW = span * (1 - r * (0.12 + Rnd(id + "rw", r) * 0.1));
    let bx = sx + Rnd(id + "bo", r) * 6;
    while (bx < sx + rowW) {
      const bw = 7 + Rnd(id + "bw" + r, bx) * 8;
      InkFill(ctx, [
        [bx, yy], [bx + bw, yy + Sym(id + "bt" + r, bx, 0.9)],
        [bx + bw, yy + bh], [bx, yy + bh],
      ], id + "bk" + r + bx, Rnd(id + "bc" + r, bx) > 0.5 ? PAL.brickPlinth : PAL.brickPlinthAlt,
      { amp: 1.0, lw: 1.2 });
      bx += bw + 1.4;
    }
  }
  // 砖顶与第一层土坯之间一道芦苇防碱层
  InkLine(ctx, sx, groundY - rows * bh - 0.6, sx + span * 0.9, groundY - rows * bh - 1.2,
    id + "reed", { lw: 1.4, color: "rgba(70,58,40,0.5)", amp: 0.8 });
}

// ---------------------------------------------------------------------------
// 人物：分层剪影（后腿/后臂/躯干/前腿/前臂/头），带走路与呼吸
// spec: {x, y, scale, facing(±1), kind, phase, crouch, carry, lamp, id}
// 坐标以脚底中心为原点，向上为负 y（屏幕坐标系）
// ---------------------------------------------------------------------------
const KIND_COLOR = {
  player: [PAL.zhuzi, PAL.zhuziDark],
  sister: [PAL.sister, PAL.sisterDark],
  family: [PAL.mother, PAL.motherDark],
  militia: [PAL.militia, PAL.militiaDark],
  soldier: [PAL.soldier, PAL.soldierDark],
  officer: [PAL.officer, PAL.officerDark],
  puppet: [PAL.puppet, PAL.puppetDark],
  villager: [PAL.villager, PAL.villagerDark],
};

export function DrawCharacter(ctx, spec) {
  const {
    x, y, scale: S = 1, facing = 1, kind = "villager", phase = 0,
    crouch = false, moving = false, breath = 0, id = kind, carry = false,
  } = spec;
  const [coat, coatDark] = kind === "father" ? [PAL.father, "#54402f"] : (KIND_COLOR[kind] || KIND_COLOR.villager);
  const H = 62 * S;                       // 立姿总高（像素）
  // 蹲：重心下沉、身体前倾；走：迈步幅度大
  const bodyH = crouch ? H * 0.70 : H;
  const stride = crouch ? 0.24 : 0.46;
  const swing = moving ? Math.sin(phase) * stride : Math.sin(breath * 0.6) * 0.045;
  const swing2 = moving ? Math.sin(phase + Math.PI) * stride : -Math.sin(breath * 0.6) * 0.045;
  const bob = moving ? Math.abs(Math.sin(phase)) * (crouch ? 0.9 : 1.8) * S : 0;
  // 呼吸：肩线起伏 + 极轻微的头部浮动
  const breathe = Math.sin(breath) * (crouch ? 0.45 : 0.85) * S;
  const lean = (moving ? (crouch ? 0.16 : 0.09) : 0) + (crouch ? 0.20 : 0) + (carry ? 0.06 : 0);

  ctx.save();
  ctx.translate(x, y - bob);
  ctx.scale(facing, 1);
  // 前倾：以脚为轴微转，走路和蹲伏的体态差别就出来了
  if (lean) ctx.transform(1, 0, -lean, 1, 0, 0);

  const hipY = -bodyH * 0.44;
  const shoulderY = -bodyH * 0.80 + breathe * 0.5;
  const headY = -bodyH * 0.90 + breathe * 0.7;
  const lw = Math.max(1.3, 2.1 * S);

  // 影子
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = IN.ink;
  ctx.beginPath();
  ctx.ellipse(0, 1.5, 11 * S, 3.2 * S, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 腿（后 / 前）
  const Leg = (sw, color, sid) => {
    const kneeX = Math.sin(sw) * 10 * S;
    const footX = Math.sin(sw) * 17 * S;
    const footLift = Math.max(0, Math.cos(sw)) * 3 * S * (crouch ? 0.3 : 1);
    InkFill(ctx, [
      [-3.4 * S, hipY], [3.4 * S, hipY],
      [kneeX + 3.2 * S, hipY * 0.42], [footX + 3.6 * S, -footLift],
      [footX - 3.4 * S, -footLift],
      [kneeX - 3.2 * S, hipY * 0.42],
    ], sid, color, { amp: 0.7 * S, lw, line: IN.ink });
    // 鞋
    InkFill(ctx, [
      [footX - 4.4 * S, -footLift], [footX + 5.4 * S, -footLift],
      [footX + 5.0 * S, -footLift + 3.4 * S], [footX - 4.6 * S, -footLift + 3.4 * S],
    ], sid + "shoe", "#4d3a28", { amp: 0.5 * S, lw: lw * 0.8 });
  };
  Leg(swing2, coatDark, id + "legB");

  // 后臂
  const Arm = (sw, color, sid, front) => {
    const elbowX = Math.sin(sw) * -8 * S;
    const handX = Math.sin(sw) * -14 * S;
    InkFill(ctx, [
      [-2.6 * S, shoulderY], [2.6 * S, shoulderY],
      [elbowX + 2.8 * S, shoulderY * 0.62], [handX + 2.8 * S, shoulderY * 0.30],
      [handX - 2.6 * S, shoulderY * 0.30], [elbowX - 2.8 * S, shoulderY * 0.62],
    ], sid, color, { amp: 0.7 * S, lw: lw * 0.9 });
    if (front) {
      ctx.fillStyle = PAL.skinDark;
      ctx.beginPath();
      ctx.arc(handX, shoulderY * 0.28, 2.6 * S, 0, Math.PI * 2);
      ctx.fill();
    }
    return { handX, handY: shoulderY * 0.30 };
  };
  Arm(swing, coatDark, id + "armB", false);

  // 躯干（短褂：肩宽下摆略散）
  InkFill(ctx, [
    [-7.2 * S, shoulderY], [7.2 * S, shoulderY],
    [8.4 * S, hipY + 3 * S], [9.2 * S, hipY - 1 * S],
    [-9.2 * S, hipY - 1 * S], [-8.4 * S, hipY + 3 * S],
  ], id + "torso", coat, { amp: 0.8 * S, lw, shade: "rgba(0,0,0,0.14)", shadeAt: 0.52 });
  // 腰带
  InkLine(ctx, -8.6 * S, hipY + 1 * S, 8.6 * S, hipY + 1 * S, id + "belt", { lw: lw * 1.1, color: "rgba(43,31,22,0.75)" });
  // 衣襟
  InkLine(ctx, 1.4 * S, shoulderY + 2 * S, 2.6 * S, hipY + 1 * S, id + "lapel", { lw: lw * 0.7, amp: 0.5 });

  // 前腿
  Leg(swing, coat, id + "legF");
  // 前臂（扛东西时两手举到肩上）
  const hand = carry
    ? (() => {
      InkFill(ctx, [
        [-2.6 * S, shoulderY], [2.6 * S, shoulderY],
        [4.2 * S, shoulderY - 5 * S], [1.6 * S, shoulderY - 7.4 * S],
        [-2.4 * S, shoulderY - 6.4 * S],
      ], id + "armC", coat, { amp: 0.7 * S, lw: Math.max(1.3, 2.1 * S) * 0.9 });
      ctx.fillStyle = PAL.skinDark;
      ctx.beginPath();
      ctx.arc(1.6 * S, shoulderY - 7.2 * S, 2.6 * S, 0, Math.PI * 2);
      ctx.fill();
      return { handX: 1.6 * S, handY: shoulderY - 7.2 * S };
    })()
    : Arm(swing2, coat, id + "armF", true);

  // 头 + 脖子
  InkLine(ctx, 0, shoulderY + 1 * S, 0, headY + 3 * S, id + "neck", { lw: lw * 2.4, color: PAL.skinDark, amp: 0.2 });
  InkFill(ctx, [
    [-5.6 * S, headY - 1 * S], [-2 * S, headY - 6.4 * S], [3.4 * S, headY - 6.6 * S],
    [6.2 * S, headY - 2.6 * S], [5.8 * S, headY + 3.4 * S], [-4.6 * S, headY + 3.6 * S],
  ], id + "head", PAL.skin, { amp: 0.5 * S, lw, shade: "rgba(0,0,0,0.10)", shadeAt: 0.6 });
  // 鼻梁（侧脸的关键识别）
  ctx.beginPath();
  ctx.moveTo(5.6 * S, headY - 1.6 * S);
  ctx.quadraticCurveTo(7.6 * S, headY - 0.4 * S, 5.4 * S, headY + 0.8 * S);
  ctx.strokeStyle = IN.inkSoft;
  ctx.lineWidth = lw * 0.7;
  ctx.stroke();
  // 眼（一点墨）
  ctx.fillStyle = IN.ink;
  ctx.beginPath();
  ctx.ellipse(3.0 * S, headY - 1.8 * S, 1.05 * S, 1.35 * S, 0, 0, Math.PI * 2);
  ctx.fill();

  // 头饰
  if (kind === "soldier" || kind === "officer") {
    // 日军兵的帽垂（军官戴大盖帽，没有这片布）——与骨架头部同一个语汇
    if (kind === "soldier") {
      InkFill(ctx, [
        [-6.4 * S, headY - 5.0 * S], [-1.6 * S, headY - 4.6 * S],
        [-2.0 * S, headY - 0.4 * S], [-3.0 * S, headY + 1.5 * S],
        [-4.4 * S, headY - 0.2 * S], [-5.8 * S, headY + 1.7 * S],
        [-7.0 * S, headY + 0.1 * S], [-7.8 * S, headY - 3.8 * S],
      ], id + "flap", "#494327", { amp: 0.5 * S, lw: lw * 0.85, shade: "rgba(0,0,0,0.2)", shadeAt: 0.5 });
    }
    InkFill(ctx, [
      [-6.4 * S, headY - 5.6 * S], [4.2 * S, headY - 8.2 * S], [7.4 * S, headY - 5.2 * S], [-6.0 * S, headY - 3.4 * S],
    ], id + "cap", "#5f5a30", { amp: 0.5 * S, lw: lw * 0.9 });
    InkFill(ctx, [
      [4.6 * S, headY - 5.4 * S], [10.2 * S, headY - 4.2 * S], [9.8 * S, headY - 2.8 * S], [4.6 * S, headY - 3.6 * S],
    ], id + "brim", "#4a461f", { amp: 0.4 * S, lw: lw * 0.8 });
    // 枪不画在这儿。它以前是烘死在身体贴图上的一根"背在身后"的棍子，
    // 于是抡枪托那一下胳膊在挥、枪还老老实实背在背上。现在它跟锯、锄头一样
    // 是真握在手里、跟着前臂转的物件（DrawCarry 的 "步枪" + World 的 alongArm）。
  } else if (kind === "puppet") {
    InkFill(ctx, [
      [-6.6 * S, headY - 4.6 * S], [0, headY - 8.4 * S], [7.0 * S, headY - 4.4 * S], [-6.2 * S, headY - 3.0 * S],
    ], id + "hat", "#3a352c", { amp: 0.6 * S, lw: lw * 0.9 });
  } else if (kind === "militia") {
    // 白毛巾（华北民兵的标志）
    InkFill(ctx, [
      [-6.6 * S, headY - 4.2 * S], [0.5 * S, headY - 8.0 * S], [7.2 * S, headY - 4.0 * S],
      [6.4 * S, headY - 1.6 * S], [-6.2 * S, headY - 2.0 * S],
    ], id + "towel", "#ddd6c2", { amp: 0.7 * S, lw: lw * 0.9, shade: "rgba(0,0,0,0.08)" });
    InkFill(ctx, [
      [-6.4 * S, headY - 3.4 * S], [-10.4 * S, headY + 0.6 * S], [-7.6 * S, headY + 1.4 * S], [-5.8 * S, headY - 1.8 * S],
    ], id + "towelTail", "#ccc4ae", { amp: 0.6 * S, lw: lw * 0.8 });
  } else if (kind === "sister") {
    // 麻花辫
    InkFill(ctx, [
      [-5.2 * S, headY - 5.6 * S], [1.5 * S, headY - 8.6 * S], [6.6 * S, headY - 4.6 * S], [-5.0 * S, headY - 3.2 * S],
    ], id + "hair", "#3a2a1f", { amp: 0.6 * S, lw: lw * 0.85 });
    ctx.save();
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.arc(-7.4 * S - i * 0.5 * S, headY - 1.4 * S + i * 3.2 * S, 2.3 * S, 0, Math.PI * 2);
      ctx.fillStyle = "#3a2a1f";
      ctx.fill();
      ctx.strokeStyle = IN.ink;
      ctx.lineWidth = lw * 0.6;
      ctx.stroke();
    }
    ctx.restore();
  } else {
    // 短发
    InkFill(ctx, [
      [-5.6 * S, headY - 5.2 * S], [1.2 * S, headY - 8.2 * S], [6.6 * S, headY - 4.4 * S], [-5.2 * S, headY - 2.8 * S],
    ], id + "hair", "#33251b", { amp: 0.6 * S, lw: lw * 0.85 });
  }

  ctx.restore();
  return { handX: x + hand.handX * facing, handY: y - bob + hand.handY, headTop: y - bodyH * 0.98 };
}

// ---------------------------------------------------------------------------
// 骨骼动画用的零件：每块骨头单独画一张，枢轴（关节）在画布的指定点。
// 渲染层把它们挂成层级，逐帧转关节 —— 真骨骼，不是烘死的帧。
// 所有函数按"枢轴在 (px, py)"绘制，单位是像素。
// ---------------------------------------------------------------------------
export const RIG_COLOR = (kind) => (kind === "father"
  ? [PAL.father, "#54402f"]
  : (KIND_COLOR[kind] || KIND_COLOR.villager));

// ---------------------------------------------------------------------------
// 军装（1942-43 华北）：三种兵的**剪影**必须一眼分得开
//
// 这套语汇沿用 TunnelBell1942 立过的人物规范（那边是 3D，这边是侧视手绘，
// 标志物一一对应）——用户的原话是「完全看不出来是日军」，根因就是三种人
// 只差一顶帽子的形状，衣服一个色系、腿脚一模一样：
//   日军  战斗帽 + **帽垂**（脑后垂布。侧视里最硬的一个标志，中国观众一眼认得）
//         立领 + 武装带 + 前腰两个弹药盒、**绑腿** + 短军靴
//   军官  大盖帽（硬檐）+ 深墨绿将校呢 + **马靴**（不打绑腿）+ 胯后挑一柄军刀
//   伪军  软布帽（既不是战斗帽也不是大盖帽）、**没有帽垂**、胯后一只挎包，
//         裤脚布鞋跟村民一样——剪影**卡在日军与村民中间**，这是他的人物设定，
//         不是偷懒（同 TunnelBell：他是本乡人，不做丑角）
// ---------------------------------------------------------------------------
export const UNIFORM = {
  soldier: { capFlap: true, puttee: true, pouches: true, collar: true },
  officer: { ridingBoot: true, sabre: true, collar: true, sam: true },
  puppet: { satchel: true },
};

// 小腿与脚：原来全场写死一副农民的土布裤脚 + 黑布鞋，当兵的也穿着它——
// 「看不出是日军」有一半出在这儿。按兵种分开取
const LEG = {
  soldier: { shinB: "#7b7346", shinF: "#8c8353", footB: "#332c1c", footF: "#3d3524" },
  officer: { shinB: "#2c2b1f", shinF: "#363426", footB: "#221f16", footF: "#2b2820" },
  puppet: { shinB: "#6a5a44", shinF: "#7b6a50", footB: "#3a2f22", footF: "#463829" },
};
export function RIG_LEG(kind) {
  return LEG[kind] || { shinB: "#6b5540", shinF: "#7d6349", footB: "#43331f", footF: "#4d3a28" };
}

// 小腿：农民是土布裤脚，日军是绑腿（一圈圈缠到膝下），军官是马靴
export function DrawShinPart(ctx, px, py, len, w0, w1, kind, id, { k = 1, back = false } = {}) {
  const leg = RIG_LEG(kind);
  DrawLimb(ctx, px, py, len, w0, w1, back ? leg.shinB : leg.shinF, id, { k });
  const u = UNIFORM[kind];
  if (u?.puttee) {
    for (let i = 0; i < 5; i += 1) {
      const t = 0.08 + i * 0.19;
      const w = w0 + (w1 - w0) * t;
      // 缠的方向是斜的：一圈压着一圈往上走，平行横线看着像穿了条袜子
      InkLine(ctx, px - w * 0.54, py + len * t, px + w * 0.54, py + len * (t - 0.055),
        id + "wrap" + i, { lw: 2.1 * k, color: "rgba(40,32,18,0.40)", amp: 0.7 * k });
    }
  } else if (u?.ridingBoot) {
    // 靴口那道折边：马靴与绑腿的分界就靠它（军官不打绑腿）
    InkLine(ctx, px - w0 * 0.58, py + len * 0.05, px + w0 * 0.58, py + len * 0.01,
      id + "cuff", { lw: 3 * k, color: "rgba(18,16,10,0.6)", amp: 0.8 * k });
  }
}

// 军装的零碎：武装带、弹药盒、立领、挎包、军刀。躯干贴图上这几笔小东西
// 才是三米外读得出"当兵的"的地方——衣服颜色在雾里全都差不多
function DrawUniformKit(ctx, px, py, w, h, kind, id, k) {
  const u = UNIFORM[kind];
  if (!u) return;
  const ink = (a) => `rgba(28,22,12,${a})`;
  if (u.collar) {
    // 立领：军装竖着的那圈硬领，配一小片领章（农民的对襟褂没有领子）
    InkFill(ctx, [
      [px - w * 0.26, py - h * 1.02], [px + w * 0.22, py - h * 1.02],
      [px + w * 0.26, py - h * 0.86], [px - w * 0.28, py - h * 0.86],
    ], id + "collar", "#4e4a2b", { amp: 1 * k, lw: 3 * k });
    InkFill(ctx, [
      [px + w * 0.04, py - h * 1.00], [px + w * 0.24, py - h * 0.98],
      [px + w * 0.24, py - h * 0.90], [px + w * 0.04, py - h * 0.90],
    ], id + "tab", "#8f3b2e", { amp: 0.6 * k, lw: 2 * k });
  }
  if (u.pouches || u.sam) {
    // 武装带：比农民那根布腰带宽一倍、深一档，还有个铜扣
    InkFill(ctx, [
      [px - w * 0.40, py - h * 0.30], [px + w * 0.38, py - h * 0.32],
      [px + w * 0.38, py - h * 0.18], [px - w * 0.40, py - h * 0.16],
    ], id + "belt", "#3d3020", { amp: 0.9 * k, lw: 2.6 * k });
    InkFill(ctx, [
      [px + w * 0.24, py - h * 0.31], [px + w * 0.38, py - h * 0.32],
      [px + w * 0.38, py - h * 0.19], [px + w * 0.24, py - h * 0.18],
    ], id + "buckle", "#9c8c5a", { amp: 0.5 * k, lw: 1.8 * k });
  }
  if (u.pouches) {
    // 前腰两个弹药盒（侧视只露得出靠镜头这一只半）+ 背带斜挂上肩
    InkFill(ctx, [
      [px + w * 0.10, py - h * 0.30], [px + w * 0.36, py - h * 0.31],
      [px + w * 0.36, py - h * 0.06], [px + w * 0.10, py - h * 0.05],
    ], id + "pouch", "#514027", { amp: 0.8 * k, lw: 2.4 * k, shade: "rgba(0,0,0,0.18)" });
    InkLine(ctx, px + w * 0.30, py - h * 0.32, px - w * 0.10, py - h * 0.96,
      id + "strap", { lw: 3.4 * k, color: ink(0.55), amp: 1.2 * k });
  }
  if (u.sam) {
    // 军官是斜挎的武装带（Sam Browne），肩上那条从右肩斜到左胯
    InkLine(ctx, px + w * 0.26, py - h * 0.30, px - w * 0.16, py - h * 0.94,
      id + "sam", { lw: 3.6 * k, color: ink(0.6), amp: 1.1 * k });
  }
  if (u.sabre) {
    // 胯后挑着的军刀：刀鞘斜指后下方。侧视里它是军官唯一一个"带兵器"的记号
    InkLine(ctx, px - w * 0.30, py - h * 0.26, px - w * 0.86, py + h * 0.06,
      id + "sabre", { lw: 4.2 * k, color: "#2a2820", amp: 0.8 * k });
    InkLine(ctx, px - w * 0.78, py + h * 0.02, px - w * 0.92, py + h * 0.09,
      id + "sabreTip", { lw: 3 * k, color: "#8d8a7a", amp: 0.6 * k });
  }
  if (u.satchel) {
    // 伪军：胯后一只挎包（他没有长枪，靠这只包和软帽跟日军分开）
    InkFill(ctx, [
      [px - w * 0.62, py - h * 0.34], [px - w * 0.28, py - h * 0.32],
      [px - w * 0.26, py - h * 0.02], [px - w * 0.64, py - h * 0.04],
    ], id + "satchel", "#5d5442", { amp: 1 * k, lw: 2.6 * k, shade: "rgba(0,0,0,0.18)" });
    InkLine(ctx, px - w * 0.44, py - h * 0.34, px + w * 0.06, py - h * 0.94,
      id + "satStrap", { lw: 3 * k, color: ink(0.5), amp: 1.2 * k });
  }
}

// 帽垂（军帽垂布）：脑后垂下的三片布，盖住后颈。**侧视里认日军最硬的一个
// 标志**——伪军和村民都没有这东西。画在帽子之前，让帽檐压住它的上沿。
// r 是头半径；ax 朝 -x 是脑后（贴图一律朝 +x 画，翻面由渲染层负责）
function DrawCapFlap(ctx, px, py, r, id, k) {
  // 布色要**比帽子深一档**。走过两次弯路：先用军帽同色（帽子、垂布、肩膀
  // 糊成一坨），改成晒白的浅布又更糟——这套白盒的 CanvasTexture 没声明 sRGB，
  // 全场颜色被提亮两档，浅布渲出来跟土墙一个亮度，照样等于没画。
  // 所以按仓库那条老规矩：配色往下压两档，深的才立得住（两版都是页内实拍看出来的）。
  // 下沿是**三片布尖**（缺口咬进去）——「屁帘」的形状全在这条锯齿上
  InkFill(ctx, [
    [px - r * 1.12, py - r * 1.06],   // 后上角（压在帽墙下）
    [px - r * 0.30, py - r * 1.00],   // 前上角（耳后）
    [px - r * 0.38, py - r * 0.22],   // 前缘垂到耳下
    [px - r * 0.52, py + r * 0.06],   // 第一片布尖（垂过后颈，盖到领子上）
    [px - r * 0.70, py - r * 0.18],   // 缺口
    [px - r * 0.90, py + r * 0.10],   // 第二片布尖
    [px - r * 1.08, py - r * 0.16],   // 缺口
    [px - r * 1.28, py + r * 0.12],   // 第三片布尖
    [px - r * 1.36, py - r * 0.82],   // 后缘收回帽墙
  ], id + "flap", "#494327", { amp: 1 * k, lw: 3.2 * k, shade: "rgba(0,0,0,0.22)", shadeAt: 0.5 });
}

/**
 * 一节肢体：从枢轴往下 len，上宽 w0、下宽 w1。
 *
 * 老版是一只**直角梯形**（四个点、两条笔直的斜边、两个方角）。四条边一直，
 * 关节处就是两块板拼在一起的硬角——上臂一块、前臂一块、当中一个折角，
 * 读出来是"用图钉别起来的纸片人"（2026-08-17 用户："关节都做的方块太丑了"）。
 *
 * 现在是**两头圆的锥体**，三件事一起给：
 *   ① 侧边中段略鼓（肌肉/衣褶），不是一条从头直到尾的斜线；
 *   ② **远端一个整圆帽**——它就是肘/膝/腕那颗关节球。前臂画在上臂之后，
 *      它的近端帽正好盖住上臂的远端帽，两节于是连成一条连续的胳膊；
 *   ③ **近端一个浅帽**，往上探进躯干/上一节里，接缝藏在里头。
 * 圆帽都在 BakePart 那 10·INK_K 的留边之内，不会被画布裁掉。
 */
export function DrawLimb(ctx, px, py, len, w0, w1, color, id,
  { lw = 3.1, k = 1, bow = 0.07, capTop = 0.5, capBot = 1.0 } = {}) {
  const r0 = w0 / 2, r1 = w1 / 2;
  const pts = [];
  const N = 6;
  const rAt = (t) => (r0 + (r1 - r0) * t) * (1 + bow * Math.sin(t * Math.PI));
  // 前缘往下
  for (let i = 0; i <= N; i += 1) pts.push([px + rAt(i / N), py + len * (i / N)]);
  // 远端的关节球
  for (let i = 1; i < 6; i += 1) {
    const a = (i / 6) * Math.PI;
    pts.push([px + Math.cos(a) * r1, py + len + Math.sin(a) * r1 * capBot]);
  }
  // 后缘往上
  for (let i = N; i >= 0; i -= 1) pts.push([px - rAt(i / N), py + len * (i / N)]);
  // 近端的浅帽（探进上一节里）
  for (let i = 1; i < 4; i += 1) {
    const a = Math.PI + (i / 4) * Math.PI;
    pts.push([px + Math.cos(a) * r0, py + Math.sin(a) * r0 * capTop]);
  }
  InkFill(ctx, pts, id, color, { amp: 0.9 * k, lw: lw * k, shade: null });
  // —— 精致度那两笔（2026-08-17 用户："给人物的关节、部件设计优化一下…精致度"）。
  // 老版的暗部是 InkFill 的 `shade`：一块压在右下角的方块，肢体因此读成一片剪纸。
  // 一条胳膊是个**圆柱**：暗在背光那一侧、沿着长边一路走；亮边贴着受光那一侧。
  ctx.save();
  ctx.beginPath();
  const wob = (t) => rAt(t);
  ctx.moveTo(px + wob(0), py);
  for (let i = 1; i <= 8; i += 1) ctx.lineTo(px + wob(i / 8), py + len * (i / 8));
  ctx.lineTo(px + Math.cos(Math.PI * 0.5) * r1, py + len + r1 * capBot);
  for (let i = 8; i >= 0; i -= 1) ctx.lineTo(px - wob(i / 8), py + len * (i / 8));
  ctx.closePath();
  ctx.clip();
  const gx = ctx.createLinearGradient(px - r0, 0, px + r0, 0);
  gx.addColorStop(0, "rgba(0,0,0,0.22)");        // 背光那一侧（身后）
  gx.addColorStop(0.42, "rgba(0,0,0,0.03)");
  gx.addColorStop(0.82, "rgba(255,246,226,0.10)");   // 受光那一侧（身前）
  gx.addColorStop(1, "rgba(0,0,0,0.10)");        // 边上再收一点，才是圆的
  ctx.fillStyle = gx;
  ctx.fillRect(px - r0 * 1.4, py - r0, r0 * 2.8, len + r1 * 2);
  // 关节处的一道衣褶：肘/膝一弯，布就在那儿堆一道。**只给一道**，多了成花纹
  ctx.strokeStyle = "rgba(0,0,0,0.16)";
  ctx.lineWidth = Math.max(1, 1.1 * k);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(px - r1 * 0.82, py + len * 0.80);
  ctx.quadraticCurveTo(px, py + len * 0.86, px + r1 * 0.82, py + len * 0.78);
  ctx.stroke();
  ctx.restore();
}

/**
 * 手：老版是 `ctx.arc` 一个圆片，袖口上顶着一颗肉色的球（实拍看就是两粒扣子）。
 * 侧视的手要读得出来只需要三样：**一个略扁的掌**、**一根翘起来的拇指**、
 * 以及**指根那一道分缝**。r ≈ 掌的半宽；手顺着前臂往下（+y），拇指朝身前（+x）。
 */
export function DrawHandPart(ctx, px, py, r, color, id, { k = 1, lw = 3, fist = 0 } = {}) {
  const grip = Math.max(0, Math.min(1, fist));
  const L = r * (2.0 - grip * 0.55);          // 攥起来的手更短更圆
  InkFill(ctx, [
    [px - r * 0.86, py - r * 0.30],           // 腕后
    [px - r * 0.96, py + L * 0.42],           // 小指侧
    [px - r * 0.62, py + L * 0.92],
    [px + r * 0.12, py + L],                  // 指尖（并拢的四指）
    [px + r * 0.78, py + L * 0.80],
    [px + r * 0.98, py + L * 0.34],           // 虎口下沿
    [px + r * 1.24, py + L * 0.12],           // 拇指尖
    [px + r * 1.02, py - r * 0.16],           // 拇指根
    [px + r * 0.70, py - r * 0.34],           // 腕前
  ], id, color, { amp: 0.7 * k, lw: lw * k, shade: "rgba(0,0,0,0.18)", shadeAt: 0.5 });
  // 指根那一道分缝 + 虎口：两笔就把"这是手"说清楚了
  InkLine(ctx, px - r * 0.62, py + L * 0.62, px + r * 0.72, py + L * 0.52,
    id + "knuck", { lw: 1.1 * k, color: "rgba(60,42,28,0.45)", amp: 0.5 * k });
  InkLine(ctx, px + r * 0.72, py + L * 0.28, px + r * 0.96, py + L * 0.10,
    id + "web", { lw: 1.1 * k, color: "rgba(60,42,28,0.4)", amp: 0.4 * k });
}

/**
 * 脚：布鞋/军靴的侧影。老版是一只平行四边形——脚后跟、脚背、鞋头一个都没有，
 * 读出来是钉在腿底下的一块木片。现在按真鞋的四段走：后跟（略往后探）、
 * 脚背（往上鼓）、鞋头（圆的、微微上翘）、鞋底（一条压深的边）。
 * len = 脚长，h = 鞋帮高；枢轴在踝（脚跟上方）。
 */
export function DrawFootPart(ctx, px, py, len, h, color, id, k = 1, { boot = false } = {}) {
  const heel = boot ? 0.86 : 0.66;
  InkFill(ctx, [
    [px - h * heel, py - h * (boot ? 0.5 : 0.12)],   // 后帮（靴子高一截）
    [px - h * (heel + 0.12), py + h * 0.66],         // 后跟
    [px - h * 0.34, py + h * 1.02],                  // 跟底
    [px + len * 0.52, py + h * 1.06],                // 鞋底中段
    [px + len * 0.90, py + h * 0.92],
    [px + len * 1.02, py + h * 0.52],                // 鞋头（圆、微翘）
    [px + len * 0.88, py + h * 0.14],
    [px + len * 0.44, py - h * 0.10],                // 脚背最高处
    [px + h * 0.10, py - h * (boot ? 0.5 : 0.14)],   // 踝前
  ], id, color, { amp: 0.8 * k, lw: 3.2 * k, shade: "rgba(0,0,0,0.2)" });
  // 鞋底：压深的一条，脚才"踩"在地上而不是浮着
  InkLine(ctx, px - h * 0.30, py + h * 0.9, px + len * 0.92, py + h * 0.78,
    id + "sole", { lw: 2.4 * k, color: "rgba(24,18,10,0.55)", amp: 0.5 * k });
  // 鞋口（布鞋那道白边 / 靴筒的折口）
  InkLine(ctx, px + h * 0.08, py - h * 0.04, px + len * 0.44, py + h * 0.02,
    id + "cuff", { lw: 1.6 * k, color: boot ? "rgba(20,16,10,0.5)" : "rgba(214,200,170,0.4)", amp: 0.5 * k });
}

// 躯干：枢轴在胯（底边中点），短褂下摆略散
// 躯干：枢轴在胯（底边中点）。
// 侧视轮廓按真人的比例走——肩略收、胸廓最厚、腰掐进去、褂子下摆再散开。
// 原来是一只"上窄下更宽"的木桶（通体 0.42m 厚，真人胸廓侧视才 0.24m 左右），
// 所以人看着像块板子。娘的大襟褂比爹的短褂长一截，下摆也更散。
export function DrawTorsoPart(ctx, px, py, w, h, kind, id, k = 1) {
  const [coat] = RIG_COLOR(kind);
  const longCoat = kind === "family" || kind === "sister";   // 大襟褂过胯
  const hem = longCoat ? 0.10 : 0.02;                        // 下摆探出胯多少（按 h 比例）
  const flare = longCoat ? 0.46 : 0.40;                      // 下摆散开的程度
  InkFill(ctx, [
    [px - w * 0.30, py - h * 0.94],          // 后肩
    [px - w * 0.16, py - h * 1.03],          // 肩头（**圆的**：一条平顶就是块板子）
    [px + w * 0.06, py - h * 1.04],
    [px + w * 0.24, py - h * 0.96],          // 前肩（略收，肩不是方的）
    [px + w * 0.38, py - h * 0.82],          // 肩到胸的斜面
    [px + w * 0.44, py - h * 0.66],          // 胸最厚处
    [px + w * 0.30, py - h * 0.26],          // 腰掐进去
    [px + w * flare, py + h * hem],          // 下摆（前）
    [px - w * (flare + 0.04), py + h * hem], // 下摆（后）
    [px - w * 0.34, py - h * 0.28],          // 腰（后）
    [px - w * 0.46, py - h * 0.70],          // 背最厚处
  ], id, coat, { amp: 1.8 * k, lw: 4.4 * k, shade: "rgba(0,0,0,0.15)", shadeAt: 0.54 });
  // 腰带（男的束在腰上；女的大襟褂不束腰，只压一道襟线）
  if (!longCoat) {
    InkLine(ctx, px - w * 0.36, py - h * 0.22, px + w * 0.34, py - h * 0.24, id + "belt",
      { lw: 5 * k, color: "rgba(43,31,22,0.8)", amp: 1.2 * k });
  }
  // 衣襟：从领口斜下来（大襟褂斜得更明显——这是女式的记号）
  InkLine(ctx, px + w * 0.06, py - h * 0.92, px + w * (longCoat ? 0.30 : 0.16), py - h * 0.2,
    id + "lapel", { lw: 3 * k, color: "rgba(43,31,22,0.55)", amp: 1.6 * k });
  // 布料褶皱
  for (let i = 0; i < 2; i += 1) {
    InkLine(ctx, px - w * 0.22 + i * w * 0.16, py - h * 0.60, px - w * 0.18 + i * w * 0.16, py - h * 0.22,
      id + "fold" + i, { lw: 2 * k, color: "rgba(43,31,22,0.3)", amp: 2 * k });
  }
  // 当兵的还要挂一身零碎（武装带/弹药盒/立领/挎包/军刀）
  DrawUniformKit(ctx, px, py, w, h, kind, id, k);
}

// 头：枢轴在脖根（底边中点）。
//
// 2026-08-17 第六稿。五稿都被退（「太抽象」→「不像人类」→「还是不太像人类」），
// 每一稿的动作都是**往脸上再加一样东西**：加了鼻根的凹、加了颧下的凹、加了腮红、
// 加了下颌的暗、加了下睑……放大看是一张拼贴画：黑豆眼浮在脸上、鼻子是另贴的一块喙、
// 腮上一坨橙的、下巴底下一坨灰的。
//
// **这一稿反过来做：砍。** 参考图（《勇敢的心》那个老兵）其实简单得不得了——
// 一块干净的浅色脸、两粒小小的眼、一个圆鼻子、一撮胡、一条软下颌，就这么几笔。
// "像人"来自**比例与剪影**，不来自解剖学的明暗。所以：
//   ① **鼻子回到轮廓上**（不再另画一块）。转过来那一下改由"两只眼一前一后"给：
//      远侧那只**也在眉弓这条前缘之内**，只是更靠鼻子、更窄。四稿把远侧眼摆到
//      脸前缘之外，才被迫把鼻子拆出去，从此一路歪。
//   ② **轮廓点少、间距匀、不许有两点挤在一处**——样条会把挤在一处的两点放大成
//      一个尖（五稿下颌那根刺就是这么来的）。嘴那一段一笔不留：一颗 110px 的头，
//      唇沟颏沟只有几个像素，画在轮廓上必被墨线吃掉，交给里头那条唇缝。
//   ③ **暗只留一处**：下颌到脖子那一片。颧下的凹、太阳穴、腮红全删。
//   ④ 五官：一粒杏仁眼＋一道上睑＋一道眉＋一条唇缝＋一粒鼻孔。到此为止。
// 日军与军官另走 `hard`：**面无表情**——唇缝是一条平直线，眉低而直往鼻侧压，
// 眼睛收成一道缝，帽檐底下压一片阴影，下颌更方、肤色更冷、一点血色都不给。
export function DrawHeadPart(ctx, px, py, r, kind, id, k = 1) {
  const lw = 2.0 * k;
  const child = kind === "sister";
  const young = kind === "player";
  const woman = kind === "family";
  const hard = kind === "soldier" || kind === "officer";
  // 比例（单位 r）：brow＝眉弓那条前缘、nose＝鼻尖、chin＝颏、jaw＝下颌角
  const F = child
    ? { crown: -2.00, back: -0.94, brow: 0.72, nose: 0.88, noseY: -0.80, chin: 0.70, jaw: -0.56, eyeK: 1.16 }
    : young
      ? { crown: -1.96, back: -0.96, brow: 0.76, nose: 0.94, noseY: -0.82, chin: 0.76, jaw: -0.60, eyeK: 1.06 }
      : woman
        ? { crown: -1.96, back: -0.96, brow: 0.78, nose: 0.96, noseY: -0.82, chin: 0.78, jaw: -0.60, eyeK: 1.02 }
        : { crown: -1.94, back: -0.94, brow: 0.80, nose: 1.00, noseY: -0.84, chin: 0.82, jaw: hard ? -0.68 : -0.62, eyeK: 1 };
  const P = (x, y) => [px + r * x, py + r * y];
  const skin = hard ? "#d0a074" : PAL.skin;

  // 脖子：斜的（胸锁乳突肌从耳后斜到锁骨）。竖直两条边是根柱子
  InkFill(ctx, [P(-0.34, 0.16), P(-0.26, -0.46), P(0.32, -0.50), P(0.46, 0.16)],
    id + "neck", PAL.skinDark, { amp: 0.6 * k, lw: 0, line: null });

  // ① 脸：一条软线，鼻子就在线上。**点少、间距匀、嘴那一段一笔不留**——
  // 一颗 55px 半径的头上，墨线本身就有 6px 粗，唇沟颏沟画在轮廓上必被它填死
  const face = Spline([
    P(0.44, 0.10),                        // 颈前根（被躯干盖住）
    P(F.chin - 0.10, -0.12),              // 下颌线
    P(F.chin, -0.34),                     // 颏（1.00H）
    P(F.chin + 0.04, -0.52),              // 上唇（很缓的一段）
    P(F.nose - 0.14, -0.68),              // 鼻底（0.72H）
    P(F.nose, F.noseY),                   // 鼻头（圆）
    P(F.nose - 0.04, F.noseY - 0.14),     // 鼻梁
    P(F.brow - 0.02, -1.04),              // 鼻根（一小凹）
    P(F.brow, -1.26),                     // 眉弓
    P(F.brow - 0.18, -1.52),              // 额
    P(0.24, -1.80),
    P(-0.28, F.crown),                    // 颅顶
    P(-0.78, -1.72),
    P(F.back, -1.24),                     // 枕骨
    P(-0.92, -0.72),
    P(F.jaw, -0.32),                      // 下颌角（耳下）
    P(-0.30, 0.04),                       // 颈后根
  ], 6);
  InkFill(ctx, face, id + "skull", skin, { amp: 0.28 * k, lw, shade: null });

  // 脸的剪影：明暗与五官一律剪在它里头
  const clipFace = () => {
    ctx.beginPath();
    ctx.moveTo(face[0][0], face[0][1]);
    for (const p of face.slice(1)) ctx.lineTo(p[0], p[1]);
    ctx.closePath();
    ctx.clip();
  };

  // ③ 暗只留一处：下颌到脖子那一片（剪在脸里）
  ctx.save();
  clipFace();
  ctx.globalAlpha = hard ? 0.24 : 0.18;
  ctx.fillStyle = hard ? "#6d4526" : "#8a5a34";
  ctx.beginPath();
  ctx.moveTo(px + r * (F.chin - 0.06), py - r * 0.24);
  ctx.quadraticCurveTo(px + r * 0.26, py + r * 0.04, px - r * 0.40, py - r * 0.10);
  ctx.lineTo(px - r * 0.36, py + r * 0.24);
  ctx.lineTo(px + r * (F.chin - 0.02), py + r * 0.24);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // ④ 五官：**耳、鼻、嘴、颏都画，眼睛让头发／帽檐挡住不画**
  //（2026-08-17 用户定：「耳朵怎么没有 画出来啊；每个人物的眼睛都可以假装被头发/
  // 帽子遮住而不画（参考勇敢的心的做法）」）。
  // 上一版是把脸整个留空——读出来是一张面具。《勇敢的心》的做法是**遮**不是**空**：
  // 刘海／帽檐压到眼线上，底下垫一片阴影，眼睛"在阴影里"——观众自己会补上那双眼，
  // 而且永远不会出现一整章不变的死表情。耳朵反而必须画：它是这颗头唯一的横向
  // 参照，少了它脸和后脑连成一块饼。
  ctx.save();
  clipFace();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // 嘴：一小截唇缝。自家人略弯，日军一条平直线（面无表情）
  const mw = r * (child ? 0.11 : 0.13);
  const mcx = px + r * (F.brow - 0.17), my = py - r * 0.40;
  ctx.strokeStyle = hard ? "rgba(58,34,28,0.9)" : "rgba(108,56,46,0.7)";
  ctx.lineWidth = (hard ? 1.3 : 1.1) * k;
  ctx.beginPath();
  ctx.moveTo(mcx - mw, my + r * 0.01);
  if (hard) ctx.lineTo(mcx + mw, my - r * 0.01);
  else ctx.quadraticCurveTo(mcx, my + r * 0.04, mcx + mw, my - r * 0.015);
  ctx.stroke();
  // 一粒鼻孔，点到为止
  ctx.fillStyle = "rgba(96,58,34,0.42)";
  ctx.beginPath();
  ctx.ellipse(px + r * (F.brow - 0.04), py + r * (F.noseY + 0.13), r * 0.05, r * 0.028, -0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 耳：颧弓后头、眼线到鼻底那一段（规范位置 0.50H~0.72H）。一小片软肉＋
  // 耳轮后上那半道折。**不许描一整圈**——两条同心的边就是一枚靶心
  ctx.save();
  const eax = px - r * 0.40, eay = py - r * 0.80;
  ctx.beginPath();
  ctx.moveTo(eax + r * 0.10, eay - r * 0.20);
  ctx.quadraticCurveTo(eax - r * 0.13, eay - r * 0.24, eax - r * 0.12, eay + r * 0.02);
  ctx.quadraticCurveTo(eax - r * 0.11, eay + r * 0.22, eax + r * 0.03, eay + r * 0.24);
  ctx.quadraticCurveTo(eax + r * 0.11, eay + r * 0.14, eax + r * 0.10, eay - r * 0.20);
  ctx.closePath();
  ctx.fillStyle = hard ? "#c2946b" : "#d09d69";
  ctx.fill();
  ctx.strokeStyle = "rgba(104,66,42,0.55)";
  ctx.lineWidth = 1.1 * k;
  ctx.stroke();
  ctx.beginPath();                       // 耳轮：只描后上那半道
  ctx.moveTo(eax + r * 0.04, eay - r * 0.14);
  ctx.quadraticCurveTo(eax - r * 0.07, eay - r * 0.16, eax - r * 0.065, eay + r * 0.06);
  ctx.stroke();
  ctx.restore();

  // ⑤ 头饰：最后画（帽子压住颅顶与鬓角；军官的卫生胡也在这一段，压在唇缝上）
  if (kind === "soldier") {
    DrawCapFlap(ctx, px, py, r, id, k);
    InkFill(ctx, Spline([P(-1.06, -1.26), P(-0.90, -1.74), P(-0.30, -2.04), P(0.36, -2.00),
      P(0.82, -1.72), P(0.98, -1.42), P(0.92, -1.10), P(-1.00, -0.98)], 4),
    id + "cap", "#5f5a30", { amp: 0.6 * k, lw: lw * 0.95, shade: "rgba(0,0,0,0.14)" });
    // 帽檐（同军官那笔的账）：老版是一条 0.74r 长、几乎水平的平行四边形，放大看
    // 是从帽子上支出去的一根棍。战斗帽的檐**短、带弧、往前下方压**——它的活是
    // 盖住眼睛（日军的帽檐压得比谁都低，那张冷脸就是这么来的），不是往前伸
    // 檐要**够大**才描得起一圈墨线：0.48r 那一版（第一次改完）在真线宽下被墨线
    // 填成一个疙瘩——同「五官小、线细」那条的反面，**小形体配全圈墨线＝一坨**。
    // 现在跟军官的帽檐一个量级，往前下方压，盖住眼线
    InkFill(ctx, Spline([
      P(0.88, -1.46), P(1.24, -1.42), P(1.52, -1.24),
      P(1.44, -1.08), P(1.10, -1.14), P(0.90, -1.28),
    ], 4), id + "brim", "#4a461f", { amp: 0.5 * k, lw: lw * 0.7 });
  } else if (kind === "officer") {
    // **卫生胡（方块胡）**：太君脸就靠这一撮认。横在人中上，鼻底与唇缝之间
    ctx.save();
    clipFace();
    InkFill(ctx, [
      P(F.brow - 0.33, -0.59), P(F.brow - 0.19, -0.63), P(F.brow - 0.06, -0.61),
      P(F.brow - 0.08, -0.48), P(F.brow - 0.20, -0.50), P(F.brow - 0.32, -0.47),
    ], id + "stache", "#241b12", { amp: 0.35 * k, lw: 1.1 * k });
    ctx.restore();
    // 大盖帽（九八式軍帽）重做（2026-08-17 用户："太君这个不太像"）。
    // 老版是一只圆头的碗＋一根平板帽檐，读出来是钢盔。真东西的四件：
    //   ① **帽顶是平的、而且比头宽**——前高后低往前压，帽顶与帽墙之间一道硬棱；
    //   ② **帽墙**（绯红）是一圈立着的硬边，不是一条描在碗上的线；
    //   ③ **帽檐是黑漆皮的**，往前下方斜切、带弧，上沿一道高光；
    //   ④ **颏带**：帽墙下横一条细带（压在帽檐根上）。
    // 再加两样"太君脸"的记号：圆片眼镜（正好套在被帽檐压暗的眼位上）＋卫生胡。
    // 帽顶（平顶、前高后低，往前探出头形一截）
    InkFill(ctx, [
      P(-1.16, -1.44), P(-1.10, -2.06), P(-0.52, -2.30),
      P(0.56, -2.34), P(1.10, -2.10), P(1.18, -1.52),
    ], id + "crown", "#4d5238", { amp: 0.4 * k, lw: lw * 0.95, shade: "rgba(0,0,0,0.16)", shadeAt: 0.45 });
    // 帽顶与帽墙之间那道硬棱
    InkLine(ctx, px - r * 1.14, py - r * 1.50, px + r * 1.16, py - r * 1.58,
      id + "welt", { lw: 1.3 * k, color: "rgba(18,20,12,0.6)", amp: 0.3 * k });
    // 帽墙：立着的一圈，绯红（1938 年式定色；按 sRGB 老账压两档）。
    // **下沿停在眉弓上头**（−1.26，见「帽子戴在眉上，不是眼上」）：老版给到 −1.12，
    // 正压在眼线（−1.14）上，整顶帽子扣在眼睛上、眼镜只好退到腮帮子上去
    InkFill(ctx, [P(-1.14, -1.50), P(1.16, -1.58), P(1.14, -1.30), P(-1.10, -1.24)],
      id + "band", "#5a2418", { amp: 0.35 * k, lw: lw * 0.8, shade: "rgba(0,0,0,0.2)" });
    // 帽墙正面一粒星徽（哑金，别亮）
    ctx.save();
    ctx.fillStyle = "#8f7f3c";
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {                     // 五角星，不是一个圆点
      const a2 = -Math.PI / 2 + i * Math.PI / 5;
      const q = i % 2 ? r * 0.045 : r * 0.10;
      const sx = px + r * 0.80 + Math.cos(a2) * q, sy = py - r * 1.37 + Math.sin(a2) * q;
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // 帽檐：黑漆皮，从帽墙下沿往前下方斜切、带弧。**探出去半个脸宽就够**——
    // 老版给到 2.02r（比整颗头还宽），放大看是一张鸭嘴；而它真正的活是**盖住眼线**
    // （−1.14），所以要的是往下压，不是往前伸
    InkFill(ctx, Spline([
      P(0.92, -1.36), P(1.30, -1.32), P(1.54, -1.18),
      P(1.46, -1.04), P(1.16, -1.06), P(0.94, -1.14),
    ], 4), id + "visor", "#1b1e14", { amp: 0.3 * k, lw: lw * 0.85, shade: null });
    // 漆皮的高光：上沿一条
    InkLine(ctx, px + r * 1.00, py - r * 1.32, px + r * 1.44, py - r * 1.19,
      id + "gloss", { lw: 1.2 * k, color: "rgba(196,200,180,0.42)", amp: 0.2 * k });
    // 颏带：帽墙底下一条细带，压在帽檐根上
    InkLine(ctx, px - r * 1.06, py - r * 1.28, px + r * 1.02, py - r * 1.34,
      id + "chin", { lw: 1.6 * k, color: "#20180f", amp: 0.25 * k });
    // 圆片眼镜：太君脸的第二个记号。镜片罩在被帽檐压暗的眼位上，
    // 镜腿往后勾到耳朵——**只描圈不填色**，填了就成了墨镜
    ctx.save();
    ctx.strokeStyle = "rgba(28,24,16,0.85)";
    ctx.lineWidth = 1.3 * k;
    ctx.lineCap = "round";
    // **镜片钉在眼线上**：眼线＝颅顶到颏的一半，这颗头上是 −1.14r。老版写 −0.96，
    // 差出去的 0.18r 在 55px 的头上就是十个像素——镜片整个落到腮帮子上，
    // 一颗孤零零的圈读出来是单片眼镜
    const gx2 = px + r * (F.brow - 0.22), gy2 = py - r * 1.13;
    ctx.beginPath();
    ctx.ellipse(gx2, gy2, r * 0.19, r * 0.165, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();                                     // 鼻梁上那道
    ctx.moveTo(gx2 + r * 0.19, gy2 + r * 0.01);
    ctx.lineTo(gx2 + r * 0.29, gy2 - r * 0.01);
    ctx.stroke();
    // 镜腿：**平着往后勾到耳朵上头**，不许从镜片朝斜上方支出去——老版的控制点
    // 给在 −1.02（比镜心还高），那条线从镜片翻过帽墙横到脑后，实拍是一根天线
    ctx.beginPath();
    ctx.moveTo(gx2 - r * 0.19, gy2 + r * 0.01);
    ctx.quadraticCurveTo(px + r * 0.02, py - r * 1.06, px - r * 0.32, py - r * 0.97);
    ctx.stroke();
    // 眼：镜片后头一道很窄的缝（面无表情、凶）。**它不是"眼窝上的阴影"**——
    // 遮它的是真压在那儿的帽檐与这片玻璃，一道缝只是让人知道底下有只眼睛
    ctx.save();
    clipFace();
    ctx.strokeStyle = "rgba(24,20,14,0.82)";
    ctx.lineWidth = 1.5 * k;
    ctx.beginPath();
    ctx.moveTo(gx2 - r * 0.10, gy2 + r * 0.015);
    ctx.lineTo(gx2 + r * 0.11, gy2 - r * 0.005);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "rgba(206,220,228,0.20)";            // 一片很淡的玻璃，压在眼上
    ctx.beginPath();
    ctx.ellipse(gx2, gy2, r * 0.18, r * 0.155, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (kind === "puppet") {
    InkFill(ctx, Spline([P(-1.06, -1.16), P(-0.96, -1.64), P(-0.38, -2.00), P(0.32, -1.98),
      P(0.86, -1.70), P(1.00, -1.36), P(0.90, -1.04), P(-0.96, -0.92)], 4),
    id + "hat", "#3a352c", { amp: 0.7 * k, lw: lw * 0.95, shade: "rgba(0,0,0,0.14)" });
  } else if (kind === "militia") {
    InkFill(ctx, Spline([P(-1.08, -1.12), P(-0.94, -1.66), P(-0.34, -1.98), P(0.32, -1.96),
      P(0.90, -1.68), P(1.04, -1.34), P(0.94, -1.02), P(-0.98, -0.90)], 4),
    id + "towel", "#ddd6c2", { amp: 0.8 * k, lw: lw * 0.95, shade: "rgba(0,0,0,0.08)" });
    InkFill(ctx, [P(-1.00, -1.08), P(-1.56, -0.58), P(-1.18, -0.42), P(-0.94, -0.84)],
      id + "tail", "#ccc4ae", { amp: 0.9 * k, lw: lw * 0.8 });
  } else if (kind === "villager") {
    // **大人包头巾**（2026-08-17 用户："村里人和主角团 部分可以包头巾来遮住眼睛"）。
    // 1943 年冀中的庄稼人男的裹条羊肚手巾、女的包块头巾，本来就是常态；
    // 顺手把"遮眼"这件事分成两路——孩子留刘海、大人包头巾，一屋子人不再一个样
    HeadScarf(ctx, px, py, r, kind, id, k, lw, F);
  } else {
    // 孩子（柱子/妹妹）：头发贴着颅骨长、刘海压到眼线上，见 HeadHair
    HeadHair(ctx, px, py, r, kind, id, k, lw, F);
  }
}

// 眼睛底下那圈渐变的阴影已整个删掉（2026-08-17 用户："你这眼部还有一圈阴影是啥
// 玩意儿啊，干掉，丑得一逼跟个僵尸一样"）。**遮眼靠的是遮挡物真的压在那儿**，
// 不是在眼窝上抹一层暗——抹了就是黑眼圈。别再加回来。

/**
 * 头上盘的那块布（2026-08-17 用户拿一张华北老乡的照片退回第一版：
 * 「你做的这什么玩意儿」——第一版是一整块光板扣在头上，读出来是顶浴帽/摩托头盔）。
 *
 * 照片里那东西的三个特征，缺一个就不是它：
 *   ① **一圈圈缠上去的**：看得见三四道叠着的箍，每一道都有自己的下沿与影子。
 *      一整块光板没有"缠"这个动作，所以怎么调都是帽子。
 *   ② **比脑袋高**：盘起来的布顶比颅顶还高出半个头，侧影是上宽下窄的一坨，
 *      而且**不规整**（每一道箍粗细不同、还错着位）。
 *   ③ **末端散着**：最后一圈的布头不塞进去，散成几绺从顶前支出来。
 * 下沿仍旧压在眉弓上——眼睛在它底下的阴影里（同刘海那一路）。
 * 男的裹本白的羊肚手巾，女的（娘）包一块靛蓝的、盘得低而紧，纂从巾底下露出来。
 */
function HeadScarf(ctx, px, py, r, kind, id, k, lw, F) {
  const woman = kind === "family";
  const cloth = woman ? "#59637a" : "#ddd6c1";
  const clothDim = woman ? "#414a5e" : "#bfb69f";
  const seam = woman ? "rgba(20,26,38,0.42)" : "rgba(104,94,74,0.42)";
  const P = (x, y) => [px + r * x, py + r * y];
  const edge = -1.06;                        // 布的下沿：眉弓下沿
  const coils = woman ? 2 : 3;               // 看得见几道缠痕
  const top = woman ? -1.86 : -2.26;         // 布顶：男的盘得高，比颅顶还高一截
  const backW = woman ? -1.06 : -1.18;       // 后缘最宽处
  // 娘的纂：先画（布压住它的上半，露出底下那一团）
  if (woman) {
    InkFill(ctx, Spline([P(-0.98, -0.98), P(-1.28, -1.04), P(-1.46, -0.80), P(-1.38, -0.52),
      P(-1.10, -0.44), P(-0.92, -0.62)], 4),
    id + "bun", "#2a1f18", { amp: 0.36 * k, lw: lw * 0.72, shade: "rgba(0,0,0,0.24)" });
  }
  // —— 布是**一整坨**，缠痕画在里头。第一版把每一道箍各画成一个描了边的圈，
  // 出来是一摞盘子（用户："你做的这什么玩意儿"）——同灰堆那条老账：
  // 一团东西只许有一条外轮廓，层次靠里头的缝去说
  const mass = Spline([
    P(F.brow - 0.10, edge),                  // 额前（下沿压在眉弓上）
    P(F.brow + 0.07, -1.34),                 // 前缘略往外鼓
    P(F.brow + 0.01, -1.74),
    P(0.60, top + 0.20),
    P(0.06, top),                            // 顶
    P(-0.52, top + 0.06),
    P(-1.00, top + 0.32),
    P(backW, -1.52),                         // 后缘最宽
    P(backW + 0.04, -1.14),
    P(-0.96, -0.94),                         // 后下角（落到项上）
    P(-0.50, -1.02),
    P(-0.16, edge - 0.05),                   // 下沿往前压（带一点起伏）
    P(0.06, edge + 0.02),
    P(0.30, edge - 0.03),
  ], 6);
  InkFill(ctx, mass, id + "cloth", cloth,
    { amp: 0.34 * k, lw: lw * 0.78, shade: "rgba(0,0,0,0.14)", shadeAt: 0.52 });
  // 缠痕：一道道从后缘绕到前缘的弧。每道给"暗缝＋上面一条亮脊"——
  // 那才是一圈布压着一圈布，而不是画了几条横线
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(mass[0][0], mass[0][1]);
  for (const q of mass.slice(1)) ctx.lineTo(q[0], q[1]);
  ctx.closePath();
  ctx.clip();
  ctx.lineCap = "round";
  for (let i = 0; i < coils; i += 1) {
    const cy = edge - (i + 1) * (edge - top) / (coils + 1) + Sym(id + "cy", i, 0.03);
    const sag = 0.10 + Hash(id + "cs" + i) * 0.06;
    const seamPath = (dy) => {
      ctx.beginPath();
      ctx.moveTo(px + r * (backW + 0.10), py + r * (cy + dy - 0.04));
      ctx.quadraticCurveTo(px + r * (-0.20), py + r * (cy + dy + sag),
        px + r * (F.brow + 0.04), py + r * (cy + dy - 0.02));
      ctx.stroke();
    };
    ctx.strokeStyle = seam;                  // 暗缝
    ctx.lineWidth = 1.6 * k;
    seamPath(0);
    ctx.strokeStyle = woman ? "rgba(150,164,190,0.34)" : "rgba(252,246,228,0.42)";
    ctx.lineWidth = 1.8 * k;                 // 缝上头那条亮脊
    seamPath(-0.055);
  }
  // 一道斜着压过去的：布是绕上去的，不是一圈圈平着摞的
  ctx.strokeStyle = seam;
  ctx.lineWidth = 1.3 * k;
  ctx.beginPath();
  ctx.moveTo(px + r * (backW + 0.16), py + r * (edge - 0.30));
  ctx.quadraticCurveTo(px + r * 0.10, py + r * (top + 0.52), px + r * (F.brow + 0.02), py + r * (top + 0.40));
  ctx.stroke();
  ctx.restore();
  // —— 散着的布头：最后一圈没塞进去，几绺从顶前支出来（照片里最跳的一笔）
  ctx.save();
  for (let i = 0; i < (woman ? 2 : 3); i += 1) {
    const t = i / Math.max(1, (woman ? 1 : 2));
    const bx = 0.04 + t * 0.44;
    const by = top + 0.14 + t * 0.14;
    const up = 0.15 + Hash(id + "tp" + i) * 0.13;
    const sw = 0.13 + Hash(id + "tw" + i) * 0.06;
    // 一绺布头：根宽梢尖、往外倒。四个方点连出来是三面小旗（上一版实拍）
    const lean2 = 0.10 + t * 0.22;
    InkFill(ctx, Spline([
      P(bx - sw, by + 0.03),
      P(bx - sw * 0.5 + lean2 * 0.35, by - up * 0.55),
      P(bx + lean2 - sw * 0.34, by - up),            // 梢（是片布角，不是针尖）
      P(bx + lean2 + sw * 0.40, by - up * 0.92),
      P(bx + sw * 0.7 + lean2 * 0.3, by - up * 0.48),
      P(bx + sw, by + 0.03),
    ], 4), id + "tip" + i, i % 2 ? cloth : clothDim,
    { amp: 0.26 * k, lw: lw * 0.6, shade: "rgba(0,0,0,0.1)" });
  }
  ctx.restore();
  // 脑后垂下来的一小截巾角
  InkFill(ctx, [P(-1.06, -0.98), P(-1.44, -0.50), P(-1.16, -0.34), P(-0.96, -0.78)],
    id + "tail", clothDim, { amp: 0.7 * k, lw: lw * 0.66, shade: "rgba(0,0,0,0.14)" });
  // 布底下那片阴影：眼睛在这儿
  // 额前露出来的一两绺头发（布不是裹在光头上）
  ctx.save();
  ctx.fillStyle = "#2e2119";
  for (let i = 0; i < 2; i += 1) {
    const bx = px + r * (0.18 + i * 0.32);
    ctx.beginPath();
    ctx.moveTo(bx - r * 0.08, py + r * (edge - 0.02));
    ctx.quadraticCurveTo(bx, py + r * (edge + 0.09), bx + r * 0.07, py + r * (edge - 0.02));
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/**
 * 头发：**贴着颅骨长的一层**，外沿＝颅骨轮廓往外 0.1r，内沿＝发际线
 *（额→鬓角→耳前→绕到耳后→项）。样条走，没有折角、没有横过颅顶的灰道子。
 */
function HeadHair(ctx, px, py, r, kind, id, k, lw, F) {
  const child = kind === "sister";
  // **长发**：娘（部分女士）与爹（少部分男士）不裹布，刘海照旧压到眼线上，
  // 发身一路落到肩——一屋子人于是有三种剪影：短发刘海（孩子）、长发（这两位）、
  // 盘头巾／毛巾（乡亲、民兵）
  const long = kind === "family" || kind === "father";
  const tone = kind === "family" ? "#2a1f18" : child ? "#3a2a1e" : "#31241a";
  const P = (x, y) => [px + r * x, py + r * y];
  // 刘海压到**眼线**上：眼睛就藏在它底下（《勇敢的心》的做法）。
  // 外沿＝颅骨往外一层，内沿＝**刘海的下缘**，从耳前一路往前压到眉弓前缘；
  // 耳朵在它底下、后头，所以露得出来
  const fringe = child ? -1.00 : -1.06;
  InkFill(ctx, Spline([
    P(F.brow - 0.12, fringe),                  // 刘海前下角（停在眉弓下沿，让开鼻梁）
    P(F.brow + 0.02, -1.26),                   // 沿眉弓往上（外沿）
    P(F.brow - 0.16, -1.54),
    P(0.32, -1.86),
    P(-0.20, F.crown - 0.10),                  // 颅顶外一层
    P(-0.74, -1.80),
    P(F.back - 0.10, -1.26),
    P(-1.02, -0.78),
    P(-0.84, -0.46),                           // 项（发脚）
    P(-0.66, -0.56),
    ...(long
      // 长发：从项后一路垂到肩，发梢参差（女的更长更齐，男的短一档更乱）
      ? [P(-1.06, -0.46), P(-1.16, 0.16), P(-1.00, 0.62), P(-0.78, 0.70),
        P(-0.68, 0.34), P(-0.62, -0.22), P(-0.58, -0.56)]
      : []),
    P(-0.62, -0.92),                           // 耳后（让开耳朵）
    P(-0.50, -1.08),                           // 绕过耳上
    P(-0.18, fringe - 0.06),                   // ← 刘海下缘往前压
    P(0.22, fringe - 0.02),
    P(0.50, fringe - 0.01),
  ], 6), id + "hair", tone, { amp: 0.36 * k, lw: lw * 0.72, shade: "rgba(0,0,0,0.18)", shadeAt: 0.5 });
  // 刘海底下那片阴影：眼睛在这儿
  // 两三根散下来的发丝，压在阴影上——刘海不是一块板
  ctx.save();
  ctx.fillStyle = tone;
  for (let i = 0; i < 4; i += 1) {
    const t = i / 3;
    const bx = px + r * (-0.06 + t * 0.80);
    const dp = r * (0.04 + Hash(id + "fr" + i) * 0.09);   // 每一绺长短差得开
    const hw2 = r * (0.09 + Hash(id + "fw" + i) * 0.04);
    ctx.beginPath();                                       // 圆头的一绺，不是尖齿
    ctx.moveTo(bx - hw2, py + r * (fringe - 0.03));
    ctx.quadraticCurveTo(bx - hw2 * 0.6, py + r * fringe + dp, bx, py + r * fringe + dp);
    ctx.quadraticCurveTo(bx + hw2 * 0.6, py + r * fringe + dp * 0.86, bx + hw2, py + r * (fringe - 0.03));
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  if (child) {
    // 妹妹：头顶偏后一只小抓髻（**扎进头发里**，别浮在头顶上）＋一根红头绳，
    // 颈后一小绺散下来的
    InkFill(ctx, Spline([P(-0.22, F.crown + 0.12), P(-0.02, F.crown - 0.24), P(-0.38, F.crown - 0.46),
      P(-0.74, F.crown - 0.28), P(-0.70, F.crown + 0.10)], 4),
    id + "bun", tone, { amp: 0.36 * k, lw: lw * 0.8, shade: "rgba(0,0,0,0.2)" });
    ctx.save();
    ctx.strokeStyle = "rgba(186,80,76,0.9)";
    ctx.lineWidth = 1.0 * k;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(px - r * 0.26, py + r * (F.crown + 0.08));
    ctx.quadraticCurveTo(px - r * 0.46, py + r * (F.crown - 0.08), px - r * 0.68, py + r * (F.crown + 0.06));
    ctx.stroke();
    ctx.restore();
    InkFill(ctx, Spline([P(-0.72, -0.62), P(-0.92, -0.38), P(-0.90, -0.06),
      P(-0.78, -0.10), P(-0.74, -0.38)], 4),
    id + "wisp", tone, { amp: 0.36 * k, lw: lw * 0.7 });
  } else if (kind === "family") {
    // 娘：长发在项后拿一根布绳松松系一道（挽成纂就看不出是长发了），
    // 侧视里这一道横绳就是"一眼认出是谁"最省的一笔
    ctx.save();
    ctx.strokeStyle = "rgba(184,164,116,0.9)";
    ctx.lineWidth = 1.6 * k;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(px - r * 1.10, py - r * 0.18);
    ctx.quadraticCurveTo(px - r * 0.86, py - r * 0.06, px - r * 0.64, py - r * 0.22);
    ctx.stroke();
    ctx.restore();
  } else if (kind === "__oldFamilyBun") {
    // （旧的纂画法：长发之后不用了，留着当参照）
    InkFill(ctx, Spline([P(-0.98, -1.08), P(-1.32, -1.16), P(-1.54, -0.90), P(-1.46, -0.58),
      P(-1.14, -0.48), P(-0.92, -0.70)], 4),
    id + "bun", tone, { amp: 0.36 * k, lw: lw * 0.8, shade: "rgba(0,0,0,0.24)" });
    ctx.save();
    ctx.strokeStyle = "rgba(184,164,116,0.85)";
    ctx.lineWidth = 1.0 * k;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(px - r * 1.60, py - r * 1.02);
    ctx.lineTo(px - r * 1.02, py - r * 0.60);
    ctx.stroke();
    ctx.restore();
  }
}

// 过肩镜头的前景剪影：只要头和肩，压成暗色，把画面"框"起来
// 以 (x, y) 为肩线中心；facing 指向画面内侧
export function DrawShoulder(ctx, x, y, S, kind, id) {
  // 过肩前景：后脑 + 双肩。关键比例——肩宽约等于 2.6 个头宽，肩线近乎水平
  // 只在两端向下收成三角肌；脖子从肩线正中升起，比头窄一圈。
  // 枢轴 (x,y) 在颈根。头在上，肩向左右铺开并被画框下缘切掉。
  const coat = "#3d2e22";
  const shade = "#2b2018";
  const hair = "#241a13";
  const rim = "rgba(250, 233, 190, 0.32)";
  const R = 54 * S;               // 头宽的一半

  ctx.save();
  ctx.translate(x, y);

  // —— 双肩：上缘几乎是水平的，两端落下去；下缘出画框
  InkFill(ctx, [
    [-R * 2.75, R * 3.6],
    [-R * 2.62, R * 1.55],        // 左三角肌
    [-R * 2.05, R * 0.86],
    [-R * 1.05, R * 0.52],        // 斜方肌接颈
    [-R * 0.40, R * 0.34],
    [R * 0.40, R * 0.34],
    [R * 1.05, R * 0.52],
    [R * 2.05, R * 0.86],
    [R * 2.62, R * 1.55],         // 右三角肌
    [R * 2.75, R * 3.6],
  ], id + "sh", coat, { amp: 1.8 * S, lw: 0, line: null });

  // 衣领：贴着颈根绕一圈，是"这是个人"最强的一条线
  ctx.beginPath();
  ctx.moveTo(-R * 1.02, R * 0.54);
  ctx.quadraticCurveTo(0, R * 0.16, R * 1.02, R * 0.54);
  ctx.strokeStyle = shade;
  ctx.lineWidth = 7.5 * S;
  ctx.lineCap = "round";
  ctx.stroke();
  // 后领口：一小块更暗，撑出厚度
  InkFill(ctx, [
    [-R * 0.72, R * 0.46], [0, R * 0.10], [R * 0.72, R * 0.46],
    [R * 0.52, R * 0.80], [-R * 0.52, R * 0.80],
  ], id + "collar", shade, { amp: 1.4 * S, lw: 0, line: null });

  // —— 脖子：短、比头窄
  InkFill(ctx, [
    [-R * 0.40, R * 0.42], [-R * 0.36, -R * 0.34],
    [R * 0.36, -R * 0.34], [R * 0.40, R * 0.42],
  ], id + "neck", shade, { amp: 1.2 * S, lw: 0, line: null });

  // —— 头：后脑饱满的椭圆，略比宽高一点；右侧收出下颌
  InkFill(ctx, [
    [-R * 0.96, -R * 0.34],
    [-R * 1.02, -R * 1.02],
    [-R * 0.66, -R * 1.62],
    [R * 0.06, -R * 1.82],
    [R * 0.74, -R * 1.48],
    [R * 0.98, -R * 0.86],
    [R * 0.88, -R * 0.30],
    [R * 0.48, -R * 0.36],
    [-R * 0.44, -R * 0.34],
  ], id + "head", coat, { amp: 1.6 * S, lw: 0, line: null });

  // 头发：盖住颅顶与后脑，留出耳与下颌
  InkFill(ctx, [
    [-R * 0.99, -R * 0.52],
    [-R * 1.02, -R * 1.06],
    [-R * 0.68, -R * 1.60],
    [R * 0.06, -R * 1.80],
    [R * 0.70, -R * 1.44],
    [R * 0.80, -R * 1.06],
    [R * 0.30, -R * 1.22],
    [-R * 0.34, -R * 1.16],
    [-R * 0.76, -R * 0.86],
  ], id + "hair", hair, { amp: 1.8 * S, lw: 0, line: null });

  // 耳：贴在头的中后部
  ctx.beginPath();
  ctx.ellipse(R * 0.52, -R * 0.86, R * 0.19, R * 0.28, -0.12, 0, Math.PI * 2);
  ctx.fillStyle = shade;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(R * 0.52, -R * 0.84, R * 0.08, R * 0.14, -0.12, 0, Math.PI * 2);
  ctx.strokeStyle = rim;
  ctx.lineWidth = 2.4 * S;
  ctx.stroke();

  // 颈后碎发
  // 发际线：一道贴着后脑落下来的弧，比排一串短线干净
  ctx.save();
  ctx.strokeStyle = hair;
  ctx.lineWidth = 3.4 * S;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-R * 0.86, -R * 0.92);
  ctx.quadraticCurveTo(-R * 0.62, -R * 0.44, -R * 0.30, -R * 0.36);
  ctx.stroke();
  ctx.restore();

  // 边光：左侧轮廓一道，从头顶顺到肩头
  ctx.save();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 4.4 * S;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-R * 0.98, -R * 0.40);
  ctx.quadraticCurveTo(-R * 1.10, -R * 1.20, R * 0.04, -R * 1.80);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-R * 1.10, R * 0.56);
  ctx.quadraticCurveTo(-R * 2.10, R * 0.80, -R * 2.66, R * 1.70);
  ctx.stroke();
  ctx.restore();

  // 头饰
  if (kind === "soldier" || kind === "officer") {
    InkFill(ctx, [
      [-R * 1.10, -R * 1.02], [R * 0.06, -R * 1.98], [R * 1.02, -R * 1.10],
      [R * 1.08, -R * 0.80], [-R * 1.14, -R * 0.72],
    ], id + "cap", "#1e1811", { amp: 1.8 * S, lw: 0, line: null });
  } else if (kind === "puppet") {
    InkFill(ctx, [
      [-R * 1.12, -R * 0.92], [R * 0.04, -R * 2.02], [R * 1.08, -R * 0.96], [-R * 1.14, -R * 0.70],
    ], id + "hat", "#241f18", { amp: 2.0 * S, lw: 0, line: null });
  } else if (kind === "militia") {
    // 白毛巾：贴着颅顶缠一圈，前低后高，脑后垂下一角
    InkFill(ctx, [
      [-R * 1.06, -R * 0.94], [-R * 0.98, -R * 1.44], [-R * 0.42, -R * 1.76],
      [R * 0.30, -R * 1.80], [R * 0.92, -R * 1.44], [R * 1.02, -R * 0.98],
      [R * 0.86, -R * 0.86], [R * 0.20, -R * 1.10], [-R * 0.50, -R * 1.06],
      [-R * 0.92, -R * 0.82],
    ], id + "towel", "#7d7566", { amp: 2.2 * S, lw: 0, line: null });
    InkFill(ctx, [
      [-R * 1.02, -R * 1.02], [-R * 1.46, -R * 0.52], [-R * 1.18, -R * 0.34], [-R * 0.94, -R * 0.78],
    ], id + "towelTail", "#6e6759", { amp: 2.0 * S, lw: 0, line: null });
  } else if (kind === "sister") {
    for (let k = 0; k < 5; k += 1) {
      ctx.beginPath();
      ctx.arc(-R * 1.02 - k * R * 0.04, -R * 0.30 + k * R * 0.40, R * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = hair;
      ctx.fill();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 手里的灯。之前"提灯"只是凭空一团光晕，看着像人在发光；
// 现在光有来处：一盏实物挂在手上，光晕从它的火心发出去。
//   kind = "lantern"   纸灯笼（挑在竹竿上带路的就是这个）
//   kind = "hurricane" 马灯（铁提梁 + 玻璃罩）
// ---------------------------------------------------------------------------
// 坐标约定：(x,y) 是手的握点，画布 y 向下（灯挂在手下面 = 正 y）
export function DrawHandLamp(ctx, x, y, S, kind = "hurricane") {
  ctx.save();
  ctx.translate(x, y);
  if (kind === "lantern") {
    // 竹竿从手里斜挑出去，灯笼吊在竿头
    InkLine(ctx, -9 * S, 4 * S, 8 * S, -9 * S, "lantPole", { lw: 1.6 * S, color: "#7a5c3a", amp: 0.6 });
    InkLine(ctx, 7 * S, -8 * S, 7 * S, -5 * S, "lantCord", { lw: 1 * S, color: "#5c4530", amp: 0.4 });
    // 纸罩：竖长的六边，上下两道木箍
    InkFill(ctx, [
      [3.9 * S, -5 * S], [2.9 * S, 1.5 * S], [3.9 * S, 8 * S],
      [10.1 * S, 8 * S], [11.1 * S, 1.5 * S], [10.1 * S, -5 * S],
    ], "lantPaper", "#e8b25c", { amp: 0.5 * S, lw: 1.5 * S, shade: "rgba(140,70,20,0.26)", shadeAt: 0.62 });
    InkLine(ctx, 3.9 * S, -5 * S, 10.1 * S, -5 * S, "lantHoopT", { lw: 1.4 * S, color: "#6b5034" });
    InkLine(ctx, 3.9 * S, 8 * S, 10.1 * S, 8 * S, "lantHoopB", { lw: 1.4 * S, color: "#6b5034" });
    const g = ctx.createRadialGradient(7 * S, 1.5 * S, 0, 7 * S, 1.5 * S, 6 * S);
    g.addColorStop(0, "rgba(255,246,220,0.95)");
    g.addColorStop(1, "rgba(255,190,92,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(7 * S, 1.5 * S, 6 * S, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // 马灯：提梁挂在手上，铁顶 + 玻璃罩 + 铁底座往下垂
    ctx.beginPath();
    ctx.moveTo(-4.2 * S, 5.6 * S);
    ctx.quadraticCurveTo(0, -1 * S, 4.2 * S, 5.6 * S);
    ctx.strokeStyle = "#4a4238";
    ctx.lineWidth = 1.5 * S;
    ctx.stroke();
    InkFill(ctx, Rect(-5 * S, 5 * S, 10 * S, 2.6 * S), "hurTop", "#5c5348", { amp: 0.4 * S, lw: 1.3 * S });
    InkFill(ctx, [
      [-4.4 * S, 7.6 * S], [4.4 * S, 7.6 * S], [3.8 * S, 15.6 * S], [-3.8 * S, 15.6 * S],
    ], "hurGlass", "#f0cf86", { amp: 0.35 * S, lw: 1.3 * S, shade: "rgba(150,90,20,0.22)", shadeAt: 0.62 });
    InkFill(ctx, Rect(-5 * S, 15.6 * S, 10 * S, 2.8 * S), "hurBase", "#544b40", { amp: 0.4 * S, lw: 1.3 * S });
    const g = ctx.createRadialGradient(0, 11.5 * S, 0, 0, 11.5 * S, 5.4 * S);
    g.addColorStop(0, "rgba(255,248,224,1)");
    g.addColorStop(0.45, "rgba(255,206,120,0.6)");
    g.addColorStop(1, "rgba(255,180,80,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 11.5 * S, 5.4 * S, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// 火心相对握点的偏移，与 DrawHandLamp 同一套坐标（未乘 S，y 向下）
export const HAND_LAMP_FLAME = {
  hurricane: { x: 0, y: 11.5 },
  lantern: { x: 7, y: 1.5 },
};

// 扛着的东西
export function DrawCarry(ctx, x, y, S, facing, label) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);
  if (label === "水桶" || label === "空水桶" || label === "桶") {
    InkFill(ctx, [[-7 * S, 0], [7 * S, 0], [5.4 * S, 11 * S], [-5.4 * S, 11 * S]], "bucket", "#9a7a4d",
      { amp: 0.5 * S, lw: 1.9 * S, shade: "rgba(0,0,0,0.16)" });
    InkLine(ctx, -7 * S, 2.4 * S, 7 * S, 2.4 * S, "bucketHoop", { lw: 1.5 * S, color: "#5c4530" });
    ctx.beginPath();
    ctx.moveTo(-6.6 * S, 0);
    ctx.quadraticCurveTo(0, -8 * S, 6.6 * S, 0);
    ctx.strokeStyle = IN.ink;
    ctx.lineWidth = 1.6 * S;
    ctx.stroke();
  } else if (label === "刨子") {
    // 木匠的刨子：一块矮墩墩的木身，斜插一柄刨刀，背上一道横楔
    InkFill(ctx, Rect(-11 * S, -4 * S, 22 * S, 8 * S), "planeBody", "#8d6236",
      { amp: 0.5 * S, lw: 1.8 * S, shade: "rgba(0,0,0,0.18)" });
    InkFill(ctx, [[-1.5 * S, -4 * S], [3 * S, -4 * S], [1.5 * S, -9.5 * S], [-2.5 * S, -9.5 * S]],
      "planeBlade", "#6b6f76", { amp: 0.35 * S, lw: 1.5 * S, shade: "rgba(0,0,0,0.2)" });
    InkLine(ctx, -9 * S, -1.2 * S, 9 * S, -1.2 * S, "planeGrain",
      { lw: 0.9 * S, color: "rgba(70,45,25,0.65)", amp: 1.1 });
  } else if (label === "步枪") {
    // 三八式。**握点（原点）在护木**——手真正握枪的地方，不是枪口。
    //
    // 老版把原点放在枪口、整支枪往"手往下"画到 +31.5u（≈0.98m）：兵垂手站着
    // 时手心离地才 0.7m 出头，于是枪托穿过地面戳进土里，枪管只在手上方露一小截
    // ——用户看到的"绑定点位错误"就是这个。三八式的握点离托底约 0.45m、
    // 离枪口约 0.83m（枪全长 1.28m，加刺刀 1.66m），所以枪身**大头在手上方**。
    //
    // 坐标：+y 是"手往下"（渲染层把它转到肘→手的方向），所以
    //   托在 +y 一小截、枪管与刺刀在 -y 一大截。垂手站着＝枪竖着提，
    //   托离地一拳；抡起来砸人时托跟着手甩到外侧，砸下来的仍是托。
    const BUTT = 13.4;      // 握点→枪托底（≈0.42m）
    const GRIP = 5.0;       // 机匣后端
    const WOOD = -13.0;     // 护木前端
    const MUZZLE = -26.6;   // 枪口（≈0.83m）
    const BAYO = -37.7;     // 刺刀尖（≈1.18m）
    // 粗细按实物折算，别按"看得见"折算：三八式枪管直径 ~2cm、护木宽 ~4.5cm、
    // 枪托侧视高 ~10cm。第一版按 0.85/1.7/2.6 画，出来是 5/10/16cm——
    // 侧视里护木跟人的躯干一样宽，枪托成了一块板子。
    // 枪管：细长的一根（≈2.5cm）
    InkFill(ctx, [[-0.42 * S, MUZZLE * S], [0.42 * S, MUZZLE * S], [0.5 * S, WOOD * S], [-0.5 * S, WOOD * S]],
      "rifleBarrel", "#4d4a44", { amp: 0.16 * S, lw: 0.7 * S });
    // 护木与机匣：手就握在这一段（原点落在它中间），≈5cm
    InkFill(ctx, [[-0.85 * S, WOOD * S], [0.85 * S, WOOD * S], [0.95 * S, GRIP * S], [-0.95 * S, GRIP * S]],
      "rifleBody", "#5b452e", { amp: 0.2 * S, lw: 0.8 * S, shade: "rgba(0,0,0,0.2)" });
    // 枪托：砸人的那头。往下渐宽到 ≈11cm，托底斜切（前低后高，枪托的招牌轮廓）
    InkFill(ctx, [[-0.95 * S, GRIP * S], [0.95 * S, GRIP * S], [1.5 * S, (BUTT - 2) * S],
      [1.4 * S, BUTT * S], [-0.9 * S, (BUTT - 0.6) * S]],
      "rifleButt", "#46351f", { amp: 0.24 * S, lw: 0.9 * S, shade: "rgba(0,0,0,0.26)" });
    // 刺刀：枪口再探出去一截寒光
    InkLine(ctx, 0, MUZZLE * S, 0, BAYO * S, "rifleBayo", { lw: 0.7 * S, color: "#9aa0a6" });
    // 背带：从护木前端垂到托后，一道松弛的弧——没有它就是一根光棍
    ctx.beginPath();
    ctx.moveTo(-0.8 * S, (WOOD + 3) * S);
    ctx.quadraticCurveTo(-3.4 * S, (GRIP - 1) * S, -0.9 * S, (BUTT - 2.5) * S);
    ctx.strokeStyle = "rgba(74,58,40,0.8)";
    ctx.lineWidth = 0.6 * S;
    ctx.stroke();
  } else if (label === "锯") {
    // 华北木匠的框锯：工字木框，一边绷锯条、一边绞麻绳。
    // 画的时候锯条顺着"手往下"的方向（局部 +y）——渲染层让它跟着前臂转，
    // 手一伸一屈，锯就一进一出。握点（原点）在近侧立柱上端。
    // 全长按"锯口落在案子上那块料上"倒推：握把离料面约 0.55m（见 Rig 的 sawing
    // 注释），锯再长，刃口就从案沿探出去凿空气了
    const L = 16;    // 锯全长（绘制单位，×S）≈0.57m
    InkLine(ctx, 0, -3 * S, 0, (L + 2) * S, "sawPostA", { lw: 1.15 * S, color: "#8d6236" });         // 近侧立柱（手握这根）
    InkLine(ctx, -7 * S, 1 * S, -7 * S, (L - 2) * S, "sawPostB", { lw: 1.0 * S, color: "#8d6236" }); // 远侧立柱
    InkLine(ctx, -7 * S, 4 * S, 0, 2 * S, "sawBeam", { lw: 1.1 * S, color: "#7a5433" });             // 横梁
    // 锯条：立柱下端之间绷直的一道铁色，带细齿
    ctx.strokeStyle = "#8d9298";
    ctx.lineWidth = 1.0 * S;
    ctx.beginPath(); ctx.moveTo(-7 * S, (L - 2) * S); ctx.lineTo(0, (L + 2) * S); ctx.stroke();
    for (let i = 0; i < 6; i += 1) {
      const tx = -6 * S + i * 1.1 * S;
      const ty = (L - 1.4 + i * 0.56) * S;
      InkLine(ctx, tx, ty, tx + 0.8 * S, ty + 1.2 * S, "sawTooth" + i, { lw: 0.9 * S, color: "#6b6f76" });
    }
    // 绞绳：横梁上方两立柱之间的一道麻色缠绕
    InkLine(ctx, -7 * S, 2 * S, 0, 0, "sawCord", { lw: 0.8 * S, color: "#9a7d4f", amp: 1.4 });
  } else if (label === "军刀") {
    // 军官的佩刀（连鞘）：不出鞘——他不亲自动手，刀是拎在手里的身份。
    // 顺前臂挂（ALONG_ARM），胳膊垂着刀就斜指地面。
    // **握点在刀鞘中段**，不在护手上：垂手站着时手心离地只有 0.56m，
    // 攥着护手的话 0.85m 的刀会整根拖在地上（实测过，鞘尖扎进土里）。
    // 攥中段之后柄从拳头上方探出来、鞘尖离地还有两拃——照片里就是这么拎的。
    InkFill(ctx, [
      [-0.9 * S, -8 * S], [1.5 * S, -8 * S], [2.9 * S, 2 * S], [3.4 * S, 10.6 * S],
      [1.6 * S, 11.1 * S], [0.9 * S, 2 * S],
    ], "sabreSheath", "#2b2d24", { amp: 0.5 * S, lw: 1.0 * S, shade: "rgba(0,0,0,0.22)" });
    // 护手与柄：都在握点**上方**（做功方向的后上方，同拟物交互规范）
    InkFill(ctx, [[-2.6 * S, -9.6 * S], [3.2 * S, -9.6 * S], [3.0 * S, -8.0 * S], [-2.4 * S, -8.0 * S]],
      "sabreGuard", "#5d5334", { amp: 0.4 * S, lw: 0.9 * S });
    InkLine(ctx, 0.3 * S, -15.5 * S, 0.3 * S, -9.4 * S, "sabreGrip", { lw: 1.9 * S, color: "#2b2620" });
    // 鞘口的两道箍
    InkLine(ctx, 1.0 * S, -2.6 * S, 2.7 * S, -2.6 * S, "sabreRing1", { lw: 0.8 * S, color: "#6d6244" });
    InkLine(ctx, 1.4 * S, 3.4 * S, 3.1 * S, 3.4 * S, "sabreRing2", { lw: 0.8 * S, color: "#6d6244" });
  } else if (label === "锄头") {
    // 长柄锄：木柄顺着"手往下"的方向（跟着前臂转——扬过肩、落进土都是它），
    // 柄端一块弯下去的铁锄板。握点（原点）在柄上三分之一处。
    InkLine(ctx, 0, -12 * S, 0, 25 * S, "hoeShaft", { lw: 1.15 * S, color: "#8d6236" });
    InkFill(ctx, [[-1.2 * S, 23.5 * S], [5.2 * S, 26.5 * S], [6.6 * S, 30.5 * S], [1.2 * S, 28 * S]],
      "hoeBlade", "#6b6f76", { amp: 0.4 * S, lw: 1.2 * S, shade: "rgba(0,0,0,0.25)" });
  } else if (label === "木槌") {
    // 短柄木槌：礅门轴用的。握点（原点）在柄中下段，槌头在柄梢——
    // 抡起来（swing 姿势）头朝上扬，落下去正砸在轴头上
    InkLine(ctx, 0, -4 * S, 0, 12 * S, "malletShaft", { lw: 1.3 * S, color: "#8d6236" });
    InkFill(ctx, Rect(-3.4 * S, 12 * S, 6.8 * S, 5.2 * S), "malletHead", "#6b4a2c",
      { amp: 0.5 * S, lw: 1.3 * S, shade: "rgba(0,0,0,0.25)" });
  } else if (label === "扫帚") {
    // 大扫帚：竹柄扎一蓬糜子苗，柄顺前臂、苗蹭着地。握点在柄上三分之一
    InkLine(ctx, 0, -10 * S, 0, 22 * S, "broomShaft", { lw: 1.7 * S, color: "#7a5433" });
    for (let i = 0; i < 6; i += 1) {
      const spread = (i - 2.5) * 1.9 * S;
      InkLine(ctx, 0, 21 * S, spread, 31 * S - Math.abs(i - 2.5) * 0.8 * S,
        "broomTwig" + i, { lw: 1.3 * S, color: i % 2 ? "#8f7a43" : "#6f5c35", amp: 1.1 });
    }
    InkLine(ctx, -1.8 * S, 21.5 * S, 1.8 * S, 21.5 * S, "broomBind", { lw: 1 * S, color: "#6b5136" });
  } else if (label === "满桶水" || label === "一桶水" || label === "空桶") {
    DrawCarry(ctx, 0, 0, S, 1, "水桶");
    if (label !== "空桶") {
      InkFill(ctx, [[-5 * S, 1.6 * S], [5 * S, 1.6 * S], [4.6 * S, 3.4 * S], [-4.6 * S, 3.4 * S]],
        "bucketWater", "#5a7a8c", { amp: 0.4 * S, lw: 1.2 * S });
    }
  } else if (label === "挂着包袱的空桶") {
    // 借还乡帮送东西那趟：空木桶照旧（复用"水桶"那支笔），桶沿上挂一坨
    // 扎起来的小包袱——土布色、结头在上。包袱贴着桶帮垂在外侧，
    // 桶还是那只桶，多出来的只有这一坨
    DrawCarry(ctx, 0, 0, S, 1, "水桶");
    InkFill(ctx, [[3.4 * S, 0.6 * S], [8.6 * S, 0.2 * S], [9.6 * S, 4.2 * S],
      [7.4 * S, 6.6 * S], [4.0 * S, 5.8 * S]],
      "bkBundle", "#6d5f45", { amp: 0.7 * S, lw: 1.4 * S, shade: "rgba(0,0,0,0.2)" });
    // 结头：两只布角在包袱顶上挽出来，朝两边翘
    InkFill(ctx, [[5.2 * S, 0.8 * S], [4.0 * S, -1.8 * S], [5.8 * S, -0.8 * S], [6.6 * S, -2.2 * S],
      [7.8 * S, -0.6 * S], [6.6 * S, 1.0 * S]],
      "bkBundleKnot", "#5e5138", { amp: 0.5 * S, lw: 1.1 * S });
    // 兜底那道被里头东西顶出来的痕
    InkLine(ctx, 4.6 * S, 3.8 * S, 8.6 * S, 3.4 * S, "bkBundleSag",
      { lw: 0.8 * S, color: "rgba(52,42,26,0.55)", amp: 0.8 });
  } else if (label === "挂着布兜的空桶") {
    // 八稿去井台那趟：空木桶照旧，桶沿上挂一只小布兜（妹妹的苦菜进的
    // 就是它）。兜比包袱小一号、口敞着，一两片叶子探出头
    DrawCarry(ctx, 0, 0, S, 1, "水桶");
    InkFill(ctx, [[3.8 * S, 0.8 * S], [8.2 * S, 0.4 * S], [8.8 * S, 5.0 * S],
      [6.4 * S, 6.8 * S], [4.2 * S, 5.6 * S]],
      "hbPouch", "#75664a", { amp: 0.6 * S, lw: 1.3 * S, shade: "rgba(0,0,0,0.2)" });
    // 挂绳：兜口两根小绳拴在桶沿上
    InkLine(ctx, 4.6 * S, 1.0 * S, 5.4 * S, -0.6 * S, "hbPouchStrA",
      { lw: 0.7 * S, color: "rgba(52,42,26,0.7)", amp: 0.4 });
    InkLine(ctx, 7.4 * S, 0.8 * S, 6.6 * S, -0.6 * S, "hbPouchStrB",
      { lw: 0.7 * S, color: "rgba(52,42,26,0.7)", amp: 0.4 });
    // 兜口探出来的苦菜叶（有了它才读得出"挖的野菜都搁这儿"）
    ctx.save();
    ctx.strokeStyle = "#5d7042";
    ctx.lineWidth = 0.9 * S;
    ctx.beginPath();
    ctx.moveTo(5.4 * S, 1.2 * S);
    ctx.quadraticCurveTo(5.0 * S, -0.8 * S, 6.0 * S, -1.6 * S);
    ctx.moveTo(6.6 * S, 1.2 * S);
    ctx.quadraticCurveTo(7.2 * S, -0.4 * S, 6.8 * S, -1.2 * S);
    ctx.stroke();
    ctx.restore();
  } else if (label === "碎布") {
    // 坛口那圈蓝底白花碎布：磨毛了边、只剩巴掌大的一小片，捏在手里
    InkFill(ctx, [[-3.4 * S, -1.8 * S], [3.2 * S, -2.2 * S], [4.0 * S, 1.2 * S],
      [1.8 * S, 2.8 * S], [-2.6 * S, 2.4 * S], [-4.0 * S, 0.6 * S]],
      "scrapCloth", "#2a3240", { amp: 0.9 * S, lw: 1.2 * S, shade: "rgba(0,0,0,0.22)" });
    // 磨毛的边：几根脱出来的线头
    ctx.save();
    ctx.strokeStyle = "rgba(120,130,146,0.5)";
    ctx.lineWidth = 0.5 * S;
    for (let i = 0; i < 4; i += 1) {
      const ex = (-3 + i * 2.2) * S;
      ctx.beginPath();
      ctx.moveTo(ex, 2.3 * S);
      ctx.lineTo(ex + 0.6 * S, 3.4 * S);
      ctx.stroke();
    }
    ctx.restore();
    // 两三点白花
    ctx.save();
    ctx.fillStyle = "rgba(160,168,182,0.4)";
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.arc((-2 + i * 2.1) * S, (-0.6 + (i % 2) * 1.4) * S, 0.55 * S, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else if (label === "整布") {
    // 娘那块没下过剪子的整布：对折又对折，方方正正抱在怀里，可布有分量——
    // 两侧边缘往下垂。靛蓝压暗（sRGB 老账），白花只隐约几点
    InkFill(ctx, [[-8.5 * S, -3.6 * S], [8.5 * S, -3.8 * S], [9.0 * S, 3.0 * S],
      [7.6 * S, 5.2 * S], [-7.4 * S, 5.4 * S], [-9.0 * S, 3.2 * S]],
      "wholeCloth", "#252c37", { amp: 0.8 * S, lw: 1.6 * S, shade: "rgba(0,0,0,0.24)" });
    // 对折的那道口：布边（织边）在上，一线略浅
    InkLine(ctx, -7.6 * S, -1.2 * S, 7.8 * S, -1.4 * S, "wholeClothFold",
      { lw: 0.9 * S, color: "rgba(120,130,146,0.4)", amp: 0.7 });
    InkLine(ctx, -7.2 * S, 1.6 * S, 7.4 * S, 1.4 * S, "wholeClothFold2",
      { lw: 0.8 * S, color: "rgba(10,12,16,0.5)", amp: 0.7 });
    // 隐约的白花点：三五簇，别亮——它是记号，不是装饰
    ctx.save();
    ctx.fillStyle = "rgba(150,158,172,0.34)";
    for (let i = 0; i < 5; i += 1) {
      const bx = (-6 + Hash("wcB" + i) * 12) * S;
      const by = (-2.6 + Hash("wcBy" + i) * 6.5) * S;
      for (let p2 = 0; p2 < 3; p2 += 1) {
        ctx.beginPath();
        ctx.ellipse(bx + Math.cos(p2 * 2.1) * 0.8 * S, by + Math.sin(p2 * 2.1) * 0.6 * S,
          0.55 * S, 0.4 * S, p2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  } else if (label === "铁皮桶") {
    InkFill(ctx, [[-8 * S, -12 * S], [8 * S, -12 * S], [7 * S, 10 * S], [-7 * S, 10 * S]], "tin", "#7d8188",
      { amp: 0.5 * S, lw: 1.9 * S, shade: "rgba(0,0,0,0.2)" });
    InkLine(ctx, -7.6 * S, -4 * S, 7.6 * S, -4 * S, "tinHoop1", { lw: 1.3 * S, color: "#4c5057" });
    InkLine(ctx, -7.3 * S, 4 * S, 7.3 * S, 4 * S, "tinHoop2", { lw: 1.3 * S, color: "#4c5057" });
  } else if (label === "石子") {
    InkFill(ctx, [[-4 * S, 2 * S], [-1 * S, -3.5 * S], [4 * S, -1.5 * S], [3 * S, 3 * S]], "stone1", "#8b857a",
      { amp: 0.4 * S, lw: 1.5 * S, shade: "rgba(0,0,0,0.22)" });
  } else if (label === "窝头") {
    InkFill(ctx, [[-5.5 * S, 3 * S], [-4 * S, -3.5 * S], [0, -6 * S], [4 * S, -3.5 * S], [5.5 * S, 3 * S]],
      "bun", "#c8a35c", { amp: 0.5 * S, lw: 1.6 * S, shade: "rgba(0,0,0,0.16)" });
  } else if (label === "红薯干") {
    // 粗布包着的一把红薯干：布角挽着，两三片干条从口上露出来
    InkFill(ctx, [[-5.5 * S, 3.5 * S], [-5 * S, -2.5 * S], [0, -4.5 * S], [5 * S, -2.5 * S], [5.5 * S, 3.5 * S]],
      "yamWrap", "#7a6a4c", { amp: 0.7 * S, lw: 1.5 * S, shade: "rgba(0,0,0,0.18)" });
    for (let i = 0; i < 3; i += 1) {
      InkLine(ctx, (-2.4 + i * 2.2) * S, -3.6 * S, (-1.6 + i * 2.4) * S, -6.4 * S,
        "yamStrip" + i, { lw: 1.6 * S, color: "#9a6a3c", amp: 0.5 * S });
    }
    InkLine(ctx, -3.4 * S, -2.6 * S, 3.4 * S, -2.8 * S, "yamTie", { lw: 1.0 * S, color: "#4e4234", amp: 0.4 * S });
  } else if (label === "半瓢水") {
    // 一只葫芦瓢：柄短口浅，水面一线亮
    InkFill(ctx, [[-6 * S, 0], [-4.5 * S, 3.5 * S], [4.5 * S, 3.5 * S], [6 * S, 0]],
      "ladle", "#a08a52", { amp: 0.5 * S, lw: 1.5 * S, shade: "rgba(0,0,0,0.18)" });
    InkLine(ctx, 5.6 * S, -0.4 * S, 9.6 * S, -2.4 * S, "ladleGrip", { lw: 2.0 * S, color: "#8a6f42", amp: 0.4 * S });
    InkFill(ctx, Rect(-4.2 * S, 0.2 * S, 8.4 * S, 1.6 * S), "ladleWater", "#4d6a78", { amp: 0.3 * S, lw: 0.8 * S });
  } else if (label === "水葫芦") {
    // 亚腰水葫芦：上小下大两个肚、腰上勒一圈绳、口上一截木塞。
    // 「倒过来——空的」那一下全指着它先被认出是水葫芦
    InkFill(ctx, [[-2.0 * S, -7.2 * S], [2.0 * S, -7.2 * S], [3.0 * S, -4.4 * S], [1.7 * S, -2.2 * S],
      [4.1 * S, 1.0 * S], [2.8 * S, 4.4 * S], [-2.8 * S, 4.4 * S], [-4.1 * S, 1.0 * S],
      [-1.7 * S, -2.2 * S], [-3.0 * S, -4.4 * S]],
      "gourd", "#8a6a3a", { amp: 0.6 * S, lw: 1.5 * S, shade: "rgba(0,0,0,0.2)" });
    InkLine(ctx, -1.9 * S, -2.2 * S, 1.9 * S, -2.2 * S, "gourdTie", { lw: 1.2 * S, color: "#4e4234", amp: 0.3 * S });
    InkFill(ctx, Rect(-0.9 * S, -9.0 * S, 1.8 * S, 2.0 * S), "gourdCork", "#6b5638", { amp: 0.3 * S, lw: 1.0 * S });
  } else if (label === "那件衣裳") {
    // 叠得整整齐齐抱在怀里的深色衣裳。渍色按 sRGB 老账压两档——
    // 是一角发暗的印子，不是清晰的血污（历史与叙事铁律：不做伤口特写）
    InkFill(ctx, [[-8 * S, 4 * S], [-7.5 * S, -3 * S], [7.5 * S, -3 * S], [8 * S, 4 * S]],
      "grief", "#4a4038", { amp: 0.8 * S, lw: 1.6 * S, shade: "rgba(0,0,0,0.22)" });
    InkLine(ctx, -6.5 * S, -0.5 * S, 6.5 * S, -0.2 * S, "griefFold", { lw: 0.9 * S, color: "rgba(28,22,18,0.6)", amp: 0.8 });
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#38201c";
    ctx.beginPath();
    ctx.ellipse(3.4 * S, 1.8 * S, 2.6 * S, 1.7 * S, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (label === "豁口碗") {
    // 窖里摞着的那只豁口粗陶碗（第一章夜里拿它刨坑）。碗口一拃（约 15cm），
    // 口沿缺一口——「豁口」就靠这一笔认
    InkFill(ctx, [[-3.6 * S, -0.6 * S], [-2.6 * S, 2.4 * S], [2.6 * S, 2.4 * S], [3.6 * S, -0.6 * S],
      [1.6 * S, -0.6 * S], [0.9 * S, 0.4 * S], [0.2 * S, -0.6 * S]],
      "chipBowl", "#57534a", { amp: 0.4 * S, lw: 1.3 * S, shade: "rgba(0,0,0,0.24)" });
    InkLine(ctx, -2.2 * S, 2.4 * S, 2.2 * S, 2.4 * S, "chipBowlFoot",
      { lw: 1.0 * S, color: "rgba(30,26,20,0.7)", amp: 0.3 });
  } else if (label === "破袄子") {
    // 妹妹递过来的那件破袄子（章末他抱着它站了很久）：叠成一卷抱在怀里，
    // 絮着棉——比"那件衣裳"厚一圈；一块补丁、一处开线露絮。
    // 整卷往手下方挂（+y），别对称压在挂点上——压在挂点上会把抱着它的人
    // 半张脸盖掉（实拍抓的）
    InkFill(ctx, [[-6.8 * S, 7.5 * S], [-6.4 * S, 1.0 * S], [-3.2 * S, -0.4 * S], [3.2 * S, -0.4 * S],
      [6.4 * S, 1.0 * S], [6.8 * S, 7.5 * S]],
      "wornCoat", "#4e4436", { amp: 0.9 * S, lw: 1.5 * S, shade: "rgba(0,0,0,0.22)" });
    InkLine(ctx, -5.2 * S, 3.4 * S, 5.2 * S, 3.7 * S, "wornCoatFold",
      { lw: 0.9 * S, color: "rgba(28,22,18,0.6)", amp: 0.9 });
    InkFill(ctx, Rect(1.4 * S, 4.4 * S, 2.2 * S, 1.9 * S), "wornCoatPatch", "#5c523f",
      { amp: 0.4 * S, lw: 0.9 * S });
    // 开线的那一口：露出一点发白的棉絮
    ctx.save();
    ctx.fillStyle = "rgba(190,182,164,0.7)";
    ctx.beginPath();
    ctx.ellipse(-3.8 * S, 6.2 * S, 1.1 * S, 0.7 * S, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (label === "麻绳") {
    // 一盘草绳：圈要小（真绳盘也就半尺），留一截绳头耷拉出来才读得出是绳。
    // 原先半径给到 (4+2×2.2)×S，落地物又按 S=2 画——地上躺一个磨盘大的甜甜圈
    ctx.strokeStyle = "#9a7d4f";
    // 线宽必须小于圈距（1.9×S），不然三圈糊成一块饼
    ctx.lineWidth = 1.1 * S;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.arc(0, 0, (2.2 + i * 1.9) * S, 0.3 + i * 0.5, Math.PI * 1.8 + i * 0.4);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(5.2 * S, 1.6 * S);
    ctx.quadraticCurveTo(8.2 * S, 3.4 * S, 9.4 * S, 6.6 * S);
    ctx.lineWidth = 1.4 * S;
    ctx.stroke();
  } else if (label === "铃铛") {
    InkFill(ctx, [[-4.5 * S, 2 * S], [-3.5 * S, -4 * S], [0, -5.5 * S], [3.5 * S, -4 * S], [4.5 * S, 2 * S]],
      "bell", "#a9915a", { amp: 0.35 * S, lw: 1.5 * S, shade: "rgba(0,0,0,0.2)" });
    ctx.fillStyle = IN.ink;
    ctx.beginPath(); ctx.arc(0, 3.4 * S, 1.3 * S, 0, Math.PI * 2); ctx.fill();
  } else if (label === "柴刀") {
    InkLine(ctx, -8 * S, 4 * S, -1 * S, 1 * S, "sickleHandle", { lw: 2.4 * S, color: "#7a5433" });
    ctx.strokeStyle = "#8d9298";
    ctx.lineWidth = 2.2 * S;
    ctx.beginPath();
    ctx.arc(2 * S, -2 * S, 6 * S, Math.PI * 0.15, Math.PI * 1.05);
    ctx.stroke();
  } else if (label === "花布巾") {
    // 叠起来的一方花布：洗得发白的底子，两道印花条
    InkFill(ctx, [[-7 * S, 3 * S], [-6 * S, -4 * S], [0, -6 * S], [6.5 * S, -3.5 * S], [7 * S, 3 * S], [0, 5 * S]],
      "clothFold", "#c9a9a0", { amp: 0.9 * S, lw: 1.5 * S, shade: "rgba(0,0,0,0.14)" });
    InkLine(ctx, -5 * S, -1 * S, 5.5 * S, -0.5 * S, "clothStripe1", { lw: 1.1 * S, color: "rgba(150,80,70,0.65)", amp: 1.2 });
    InkLine(ctx, -4.5 * S, 2 * S, 5 * S, 2.4 * S, "clothStripe2", { lw: 1.1 * S, color: "rgba(150,80,70,0.5)", amp: 1.2 });
  } else if (label === "鞭炮" || label === "一挂鞭炮") {
    for (let i = 0; i < 6; i += 1) {
      InkFill(ctx, Rect(-6 * S + (i % 2) * 6 * S, (-9 + i * 3) * S, 5 * S, 2.6 * S), "fc" + i, "#a8453a",
        { amp: 0.3 * S, lw: 1.1 * S });
    }
    InkLine(ctx, 0, -10 * S, 0, 9 * S, "fcString", { lw: 1 * S, color: "#6b5a3f", amp: 1.6 });
  } else if (label === "包袱布" || label === "榆钱包袱") {
    // 妹妹那个包袱：**旧衣襟改的**，不是花头巾（历史口径——补丁衣裤的孩子
    // 不会有装饰性的花布）。四角在上头挽一个结，兜底鼓着一小包榆钱。
    // 这件东西第十一场要被兵一把夺走、抖空——所以它得先在画面上是个"东西"
    const full = label === "包袱布";
    // 尺寸按实物量：一个孩子抱得住的小包袱，兜口一拃出头——**约 0.26m**，
    // 也就是半径 4.2 个绘制单位（S=1.5，PPM=48）。第一版按 8.5 画，上屏是
    // 直径半米多的一坨，比妹妹的脑袋还大
    const R = 4.2;
    if (full) {
      // 兜满榆钱：底下鼓成一个囊，四角在顶上挽成结
      InkFill(ctx, [[-R * S, -0.5 * S], [-0.64 * R * S, -2.7 * S], [0, -3.3 * S], [0.64 * R * S, -2.7 * S], [R * S, -0.5 * S],
        [0.82 * R * S, 2.7 * S], [0, 4.1 * S], [-0.82 * R * S, 2.7 * S]],
        "bundleCloth", "#b0a084", { amp: 0.6 * S, lw: 1.3 * S, shade: "rgba(0,0,0,0.2)" });
      // 榆钱把布顶出来的那几道起伏（不是圆点，是布面上的鼓包）
      for (let i = 0; i < 3; i += 1) {
        InkLine(ctx, (-2.4 + i * 1.7) * S, (1.2 + (i % 2) * 0.7) * S, (-1.2 + i * 1.7) * S, (2.2 + (i % 2) * 0.6) * S,
          "bundleBump" + i, { lw: 0.8 * S, color: "rgba(120,100,66,0.55)", amp: 1 });
      }
    } else {
      // 抖空之后：软塌塌一片，没有了兜
      InkFill(ctx, [[-R * S, -0.5 * S], [-0.6 * R * S, -2.3 * S], [0, -2.8 * S], [0.6 * R * S, -2.3 * S], [R * S, -0.5 * S],
        [0.6 * R * S, 1.1 * S], [0, 1.5 * S], [-0.6 * R * S, 1.1 * S]],
        "bundleLimp", "#b0a084", { amp: 0.8 * S, lw: 1.3 * S, shade: "rgba(0,0,0,0.16)" });
    }
    // 顶上挽的结：两个布角朝两边翘出去——这一笔是"包袱"与"一块布"的分界
    InkFill(ctx, [[-0.9 * S, -2.8 * S], [-3.2 * S, -5.2 * S], [-1.1 * S, -4.2 * S], [0, -5.3 * S],
      [1.1 * S, -4.2 * S], [3.2 * S, -5.2 * S], [0.9 * S, -2.8 * S]],
      "bundleKnot", "#a08e70", { amp: 0.5 * S, lw: 1.1 * S, shade: "rgba(0,0,0,0.14)" });
    // 旧衣襟的出身：一道原来的缝边 + 一块补丁
    InkLine(ctx, -3 * S, -1.1 * S, 3 * S, -0.8 * S, "bundleSeam", { lw: 0.7 * S, color: "rgba(96,78,52,0.5)", amp: 0.8 });
    InkFill(ctx, Rect(1.2 * S, -0.6 * S, 1.8 * S, 1.5 * S), "bundlePatch", "#98876a", { amp: 0.35 * S, lw: 0.8 * S });
  } else if (label === "旧门板") {
    // 拆下来的旧门板：一长条，带着横撑的榫痕和门轴那头的两个钉眼。
    // 从通用兜底（一条光板子）里拎出来单画，是因为它在第八场要被扛进地道、
    // 举起来顶住洞顶——观众得看得出那是**一扇门拆下来的**，不是一根方木
    InkFill(ctx, Rect(-26 * S, -3.4 * S, 52 * S, 6.8 * S), "oldPlank", "#a8794a",
      { amp: 0.6 * S, lw: 1.9 * S, shade: "rgba(0,0,0,0.16)" });
    InkLine(ctx, -24 * S, 0.2 * S, 24 * S, -0.2 * S, "oldPlankGrain",
      { lw: 0.9 * S, color: "rgba(90,60,35,0.7)", amp: 1.4 });
    for (let i = 0; i < 2; i += 1) {
      InkLine(ctx, (-14 + i * 28) * S, -3.4 * S, (-14 + i * 28) * S, 3.4 * S, "oldPlankTenon" + i,
        { lw: 1.3 * S, color: "rgba(60,40,20,0.55)", amp: 0.8 });
    }
    for (let i = 0; i < 2; i += 1) {
      ctx.beginPath();
      ctx.arc((-21 + i * 5) * S, 0, 1.1 * S, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(44,28,14,0.65)";
      ctx.fill();
    }
  } else if (label === "襁褓") {
    // 裹着的婴儿：一小卷布，一头略鼓（头）。补丁色——刘家的日子写在布上
    InkFill(ctx, [[-8 * S, 2 * S], [-9 * S, -2.6 * S], [-5 * S, -5 * S], [5 * S, -4.6 * S], [9 * S, -1 * S], [6 * S, 3.4 * S]],
      "swaddle", "#9a8468", { amp: 0.9 * S, lw: 1.6 * S, shade: "rgba(0,0,0,0.16)" });
    ctx.beginPath();
    ctx.arc(-5.4 * S, -1.4 * S, 2.6 * S, 0, Math.PI * 2);
    ctx.fillStyle = "#d8ab7c";
    ctx.fill();
    InkLine(ctx, -1 * S, -3.6 * S, 4 * S, 2 * S, "swBand", { lw: 1.1 * S, color: "rgba(90,70,50,0.7)", amp: 0.8 });
    InkLine(ctx, -3 * S, 3 * S, 3 * S, -2.4 * S, "swPatch", { lw: 1 * S, color: "rgba(120,90,60,0.5)", amp: 0.8 });
  } else if (label === "粮袋" || label === "种子粮") {
    // 一小袋种子粮：口用麻绳扎死。不大——正因为只剩这一点，才非藏不可
    InkFill(ctx, [[-6.6 * S, 8 * S], [-8 * S, -2 * S], [-4 * S, -8 * S], [4 * S, -8 * S], [8 * S, -2 * S], [6.6 * S, 8 * S]],
      "grainBag", "#9a8560", { amp: 1 * S, lw: 1.8 * S, shade: "rgba(0,0,0,0.2)" });
    InkLine(ctx, -4 * S, -8 * S, 4 * S, -8 * S, "bagTie", { lw: 1.6 * S, color: "#5c4530" });
    InkLine(ctx, -1 * S, -8 * S, 1.6 * S, -11 * S, "bagEar", { lw: 1.4 * S, color: "#5c4530" });
    InkLine(ctx, -4 * S, 1 * S, 4 * S, 2 * S, "bagFold", { lw: 0.9 * S, color: "rgba(90,70,45,0.5)", amp: 1 });
  } else if (label === "名册" || label === "保甲册") {
    // 伪保长夹着的保甲册：一摞纸夹在木板里
    InkFill(ctx, Rect(-6.6 * S, -4.6 * S, 13.2 * S, 9.2 * S), "roster", "#a89268",
      { amp: 0.5 * S, lw: 1.6 * S, shade: "rgba(0,0,0,0.12)" });
    InkFill(ctx, Rect(-7.2 * S, -5.2 * S, 13.2 * S, 2 * S), "rosterLid", "#6b4d2e", { amp: 0.5 * S, lw: 1.4 * S });
    for (let i = 0; i < 3; i += 1) {
      InkLine(ctx, -4.6 * S, -1.4 * S + i * 2.2 * S, 4.6 * S, -1.2 * S + i * 2.2 * S, "rosterLn" + i,
        { lw: 0.7 * S, color: "rgba(60,48,32,0.55)", amp: 0.6 });
    }
  } else if (label === "土筐") {
    // 装土的荆条筐：口宽底窄，沿口露出一层新土
    InkFill(ctx, [[-9 * S, -5 * S], [-6 * S, 8 * S], [6 * S, 8 * S], [9 * S, -5 * S]],
      "dirtBask", "#9a7d4f", { amp: 1 * S, lw: 1.8 * S, shade: "rgba(0,0,0,0.18)" });
    for (let i = 0; i < 2; i += 1) {
      InkLine(ctx, -7.6 * S + i * 1.2 * S, -1 * S + i * 4 * S, 7.6 * S - i * 1.2 * S, -1 * S + i * 4 * S,
        "baskWv" + i, { lw: 0.9 * S, color: "rgba(60,45,25,0.55)", amp: 1 });
    }
    InkFill(ctx, [[-8 * S, -5 * S], [-4 * S, -7.6 * S], [3 * S, -7.2 * S], [8 * S, -4.6 * S], [4 * S, -3.6 * S], [-4 * S, -3.8 * S]],
      "baskDirt", "#6e5738", { amp: 1.2 * S, lw: 1.2 * S });
  } else if (label === "木楔") {
    // 一小块木楔：三角，掌心大
    InkFill(ctx, [[-5 * S, 3 * S], [5.4 * S, 3 * S], [-3.4 * S, -4.6 * S]],
      "wedge", "#a8794a", { amp: 0.5 * S, lw: 1.6 * S, shade: "rgba(0,0,0,0.14)" });
  } else if (label === "棉被" || label === "湿棉被") {
    const wet = label === "湿棉被";
    InkFill(ctx, [[-10 * S, 4 * S], [-9 * S, -4 * S], [-3 * S, -7 * S], [6 * S, -6 * S], [10 * S, 1 * S], [4 * S, 6 * S]],
      "quiltRoll", wet ? "#5f6a70" : "#b8a284", { amp: 1.1 * S, lw: 1.8 * S, shade: "rgba(0,0,0,0.2)" });
    ctx.strokeStyle = wet ? "rgba(40,60,70,0.7)" : "rgba(120,95,65,0.7)";
    ctx.lineWidth = 1 * S;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.arc(-2 * S, 0, (3 + i * 2.4) * S, Math.PI * 0.3, Math.PI * 1.4);
      ctx.stroke();
    }
  } else if (label === "绳头") {
    // 攥在手里的那截绳头（长绳本体由渲染层的 verlet 带子画）。
    // 没有这一支的时候它落进最后那个兜底分支，被当成木料——玩家一路拽着
    // 一块半米长的板子去量地。绳头就该是：手心里绕两道，剩一小截毛茬耷出来。
    // 尺寸按拳头量：一截绳梢连着两道缠在手心的圈，通身不过十来厘米。
    // 画大了（第一版外径给到 0.3 米）它会盖住柱子整个脑袋——他才一米出头
    ctx.strokeStyle = "#9a7d4f";
    ctx.lineCap = "round";
    ctx.lineWidth = 1.5 * S;
    for (let i = 0; i < 2; i += 1) {
      ctx.beginPath();
      ctx.ellipse(0, (-0.6 + i * 1.5) * S, 2.0 * S, 1.0 * S, 0.15, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 耷出来的一小截，末端散成麻丝
    InkLine(ctx, 1.4 * S, 1.4 * S, 3.4 * S, 3.2 * S, "ropeTail", { lw: 1.4 * S, color: "#9a7d4f", amp: 0.5 });
    ctx.lineWidth = 0.6 * S;
    ctx.strokeStyle = "rgba(150,124,80,0.9)";
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(3.4 * S, 3.2 * S);
      ctx.lineTo((4.2 + i * 0.5) * S, (4.2 + i * 0.6) * S);
      ctx.stroke();
    }
  } else if (label === "小褂子") {
    // 缝好的小褂子抱在臂弯里（缝·改抱去枕边那一程）：暗红一小卷，
    // 一只袖口露出一截蓝底白花——色照 DrawMendedJacket 那族压暗。
    // 整卷再往手下方沉 4.5：坐着缝那几镜挂点高，不压住脸（二轮视觉审查）
    ctx.save();
    ctx.translate(0, 4.5 * S);
    InkFill(ctx, [[-7 * S, 6.5 * S], [-7.5 * S, 1.2 * S], [-4.5 * S, -1 * S], [3.5 * S, -0.8 * S],
      [6.8 * S, 1 * S], [7.2 * S, 6.2 * S], [0, 7.6 * S]],
    "mjkBody", "#4a262d", { amp: 0.8 * S, lw: 1.5 * S, shade: "rgba(0,0,0,0.24)" });
    // 叠痕一道
    InkLine(ctx, -5.4 * S, 3 * S, 5.4 * S, 2.7 * S, "mjkFold",
      { lw: 0.8 * S, color: "rgba(22,10,13,0.55)", amp: 0.8 });
    // 露出来的那只袖口：接的蓝底白花从臂弯里耷出一截
    InkFill(ctx, [[4.6 * S, 3.6 * S], [9.6 * S, 2.6 * S], [10.8 * S, 6 * S], [5.8 * S, 7 * S]],
      "mjkCuff", "#39434f", { amp: 0.6 * S, lw: 1.2 * S, shade: "rgba(0,0,0,0.2)" });
    // 米白小花两三点
    ctx.save();
    ctx.fillStyle = "rgba(200,206,216,0.55)";
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.ellipse((6.4 + i * 1.5) * S, (4.4 + (i % 2) * 1.2) * S, 0.7 * S, 0.5 * S, i, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // 接口的针脚一两针
    InkLine(ctx, 5.2 * S, 3.8 * S, 5.6 * S, 5.8 * S, "mjkStitch",
      { lw: 0.7 * S, color: "rgba(196,186,160,0.7)", amp: 0.4 });
    ctx.restore();
  } else {
    InkFill(ctx, Rect(-26 * S, -3.2 * S, 52 * S, 6.4 * S), "plank", "#a8794a",
      { amp: 0.6 * S, lw: 1.9 * S, shade: "rgba(0,0,0,0.14)" });
    InkLine(ctx, -24 * S, 0, 24 * S, 0, "plankGrain", { lw: 0.9 * S, color: "rgba(90,60,35,0.7)", amp: 1.4 });
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 伪透视：房子是个盒子，不是一张贴在天上的卡片
// （2026-08-17 用户退回门框：「门框的设计还是太抽象了 门框就应该在家里啊
//   你这个都不符合其他场景样式的透视效果，要么你把房子的四个面都做出来
//   伪造一下透视 然后再画一个贴合的门框还差不多」）
//
// 病根不在门框那三根木头，在**整栋房子只有一面**：一张正对镜头的平墙，
// 到头是一条竖直的裁边；门是墙上一个黑洞、洞没有厚度。于是那副门框无处可
// 依附——立在院子里就成了一座牌坊。
//
// 治法是把假想机位钉死，把**转过去的那几面**画进同一张贴图里：
//   ① 山墙（东头那一面）从墙角往里收；
//   ② 门洞与窗洞有 40cm 的洞壁（墙有多厚，洞口就有多厚）；
//   ③ 门槛看得见顶面（视平线 1.85m，门槛在脚底下）。
// 这不是"画得斜一点"，是**真透视、假机位**：假想机位钉在每栋房子东墙外
// EYE_OFF 米处，深度 d 上的一点按 D/(D+d) 朝灭点收——所以山墙的上下沿会朝
// 视平线收拢，洞壁的两条边也会。代价是镜头横移时这几面不跟着变；换来的是
// 「房子有体积、门开在墙上」，那才是画面上真读得出来的事。
//
// 灭点一律在**东边**（假想机位在房子东侧），全街统一：一条街上每栋房子各朝
// 一个方向收，比全平还乱。
// ---------------------------------------------------------------------------
export const PX_M = 48;        // 贴图像素 / 米（与 Data_Scenes 的 PPM 同一把尺）
export const EYE_M = 1.85;     // 玩法机位的视平线（Data_DepthSpec 的老账）
export const CAM_D = 9.3;      // 玩法机距
// 假想机位在东墙外多远。山墙那一面的**上屏宽度 = EYE_OFF × 进深/(机距+进深)**，
// 2.15 米折算出来是 0.75m ≈ 36px：够读出"这是个盒子"，又不至于在正墙旁边再摆
// 一整块板（首轮给 2.6 ＝0.91m，实拍下山墙跟正墙争画面）
export const EYE_OFF = 2.15;
export const WALL_T = 0.40;    // 土坯墙厚（洞壁就是这么厚）
export const HOUSE_D = 5.0;    // 屋子进深：山墙那面往里铺多远

/** 前平面上的一点（画布 px）按深度 d（米，往里为正）朝灭点收 */
export function Recede(px, py, d, vpx, vpy) {
  const k = CAM_D / (CAM_D + d);
  return [vpx + (px - vpx) * k, vpy + (py - vpy) * k];
}
/** 视平线在画布上的 y（groundY 是这张贴图里的地平线） */
export function EyeY(groundY) { return groundY - EYE_M * PX_M; }
/** 灭点的 x：假想机位钉在东墙外 EYE_OFF 米 */
export function VanishX(eastEdgePx) { return eastEdgePx + EYE_OFF * PX_M; }

// 门洞的尺寸（px）。**按人给，不按房子给**：这套骨架里大人实高 1.37m，
// 门净高 1.55m 正好是"进门不必低头、可也高不出多少"。全作只有这一副门框，
// 立面上的洞、门框那件道具、烧过之后剩下的那副，三处共用这一张表。
export const DOOR = {
  openW: 32,     // 净宽 0.66m
  openH: 74,     // 净高 1.55m
  jamb: 8,       // 立柱见方 0.17m（刻痕就刻在西边这根的正面上）
  lintel: 9,     // 门楣 0.19m
  sill: 7,       // 门槛 0.15m
};
/** 门框外沿的半宽 / 全高（立面上的洞按这个开，门框那件道具照这个画） */
export const DOOR_HALF = DOOR.openW / 2 + DOOR.jamb;
export const DOOR_TOP = DOOR.openH + DOOR.lintel;

/**
 * 洞壁：墙有厚度，洞口就有一圈往里收的侧壁。
 * 灭点在东边，所以看得见的是**西边那根立柱的内侧面**（站在门左边就看得见
 * 右边的门垛内壁，反过来也一样）——东侧那面背着镜头，一丝都不该画。
 * 底下那道是门槛的顶面（视平线在它上头，看得见顶）。
 * @param x0,x1 洞口在画布上的左右沿；yTop 洞顶；groundY 地平线
 */
function DoorReveal(ctx, x0, x1, yTop, groundY, id, { vpx, vpy, night = false, depth = WALL_T } = {}) {
  const [fx0, fy0] = Recede(x0, yTop, depth, vpx, vpy);
  const [fx1] = Recede(x1, yTop, depth, vpx, vpy);
  const [, fyb] = Recede(x0, groundY, depth, vpx, vpy);
  // 洞里那片暗：**不是死黑**——门后头是屋子，暗到什么程度由后面那层贴图说
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, yTop, x1 - x0, groundY - yTop);
  ctx.clip();
  const inner = ctx.createLinearGradient(0, yTop, 0, groundY);
  inner.addColorStop(0, night ? "rgba(14,12,10,0.86)" : "rgba(22,18,14,0.80)");
  inner.addColorStop(1, night ? "rgba(14,12,10,0.66)" : "rgba(26,21,16,0.52)");
  ctx.fillStyle = inner;
  ctx.fillRect(x0, yTop, x1 - x0, groundY - yTop);
  // 西侧洞壁：擦进来的光只舔得着这一面，所以它是洞口唯一亮的地方
  InkFill(ctx, [[x0, yTop], [fx0, fy0], [fx0, fyb], [x0, groundY]], id + "revW",
    night ? "#4e4133" : "#8a7757", { amp: 0.7, lw: 1.2, line: "rgba(40,30,20,0.5)" });
  const lit = ctx.createLinearGradient(x0, 0, fx0, 0);
  lit.addColorStop(0, night ? "rgba(190,170,130,0.10)" : "rgba(238,214,160,0.22)");
  lit.addColorStop(1, "rgba(40,30,20,0.28)");
  ctx.fillStyle = lit;
  ctx.fillRect(x0, yTop, fx0 - x0 + 0.6, groundY - yTop);
  // 门楣底面：门头几乎顶在视平线上，所以它只剩薄薄一条——有这一条，
  // 洞口才是"穿过一堵墙"，没有就是墙上贴了张黑纸
  InkFill(ctx, [[x0, yTop], [x1, yTop], [fx1, fy0], [fx0, fy0]], id + "revT",
    "rgba(28,22,16,0.92)", { amp: 0.5, lw: 0, line: null });
  ctx.restore();
  return { fx0, fx1, fy0 };
}

/**
 * 门槛：一条横在洞口底下的木/石坎。视平线在它上头 1.7 米，所以**顶面看得见**
 * ——那一小条正是"这道坎有厚度"的全部证据。
 */
function DoorSill(ctx, x0, x1, groundY, id, { vpx, vpy, night = false } = {}) {
  const h = DOOR.sill;
  const [bx0, by0] = Recede(x0 - 2, groundY - h, WALL_T, vpx, vpy);
  const [bx1, by1] = Recede(x1 + 2, groundY - h, WALL_T, vpx, vpy);
  // 顶面（往里收的那一片）
  InkFill(ctx, [[x0 - 2, groundY - h], [x1 + 2, groundY - h], [bx1, by1], [bx0, by0]],
    id + "sillTop", night ? "#584c3c" : "#8c7f68", { amp: 0.6, lw: 1.2, line: "rgba(40,32,22,0.45)" });
  // 正面（踢脚那一条，磨得发亮）
  InkFill(ctx, Rect(x0 - 2, groundY - h, x1 - x0 + 4, h), id + "sill",
    night ? "#463c30" : "#6b6152", { amp: 0.9, lw: 1.5, shade: "rgba(0,0,0,0.20)" });
  InkLine(ctx, x0, groundY - h + 1.4, x1, groundY - h + 1.2, id + "sillWear",
    { lw: 1.2, color: night ? "rgba(150,140,120,0.20)" : "rgba(226,206,166,0.34)", amp: 0.5 });
}

/**
 * 东山墙：从墙角往里收的那一面。**全画面唯一的大块暗部**——一排土房之所以
 * 有分量，靠的是这种整面的阴影，不是细节多（老版拿一道渐变假装它，读出来
 * 还是一张卡片的边）。
 * @param ex 墙角（东墙）在画布上的 x；top 墙头；groundY 地平线
 */
function EastGable(ctx, ex, top, groundY, id, {
  vpx, vpy, night = false, burnt = false, depth = HOUSE_D,
} = {}) {
  const [fxT, fyT] = Recede(ex, top, depth, vpx, vpy);
  const [fxB, fyB] = Recede(ex, groundY, depth, vpx, vpy);
  // 比正墙**暗两档**：太阳在西，这一面整天背着光。跟正墙同一个明度的话，
  // 转过去的那一下就读不出来，只剩"旁边又贴了一块板"
  const face = burnt ? "#453f38" : (night ? "#2d261e" : "#635740");
  InkFill(ctx, [[ex, top], [fxT, fyT], [fxB, fyB], [ex, groundY]], id + "gable", face,
    { amp: 1.6, lw: 2.2 });
  ctx.save();
  WobblyPath(ctx, [[ex, top], [fxT, fyT], [fxB, fyB], [ex, groundY]], id + "gable", 1.6, true);
  ctx.clip();
  // 越往里越暗（墙角那儿还擦得着一点光，深处什么也没有）
  const deep = ctx.createLinearGradient(ex, 0, fxT, 0);
  deep.addColorStop(0, "rgba(30,22,14,0.06)");
  deep.addColorStop(1, "rgba(24,18,12,0.42)");
  ctx.fillStyle = deep;
  ctx.fillRect(Math.min(ex, fxT) - 2, top - 4, Math.abs(fxT - ex) + 4, groundY - top + 8);
  // 抹泥的横茬：**跟着透视一起收**，不然这一面读回一块贴在旁边的平板
  for (let i = 0; i < 4; i += 1) {
    const t = 0.16 + i * 0.21 + Sym(id + "gr", i, 0.05);
    const y = top + (groundY - top) * t;
    const [rx, ry] = Recede(ex, y, depth * (0.35 + Rnd(id + "gr2", i) * 0.6), vpx, vpy);
    InkLine(ctx, ex + 1, y, rx, ry, id + "gtr" + i,
      { lw: 2.0 + Rnd(id + "gr3", i) * 3, amp: 1.4,
        color: i % 2 ? "rgba(52,40,26,0.10)" : "rgba(214,196,158,0.07)" });
  }
  // 墙根：往里那一头也得落在地上
  const foot = ctx.createLinearGradient(0, groundY, 0, groundY - (groundY - fyB) * 1.5);
  foot.addColorStop(0, "rgba(40,30,20,0.40)");
  foot.addColorStop(1, "rgba(40,30,20,0)");
  ctx.fillStyle = foot;
  ctx.fillRect(ex - 2, fyB - 4, fxT - ex + 6, groundY - fyB + 8);
  // 碱脚也转过去：墙根那两皮旧砖顺着地面斜进去。**这一条比墙面上任何花纹
  // 都管用**——它是唯一一处"地面在往里走"的证据
  if (!burnt) {
    for (let i = 0; i < 7; i += 1) {
      const t0 = i / 7, t1 = (i + 0.82) / 7;
      const ax0 = ex + (fxB - ex) * t0, ay0 = groundY + (fyB - groundY) * t0;
      const ax1 = ex + (fxB - ex) * t1, ay1 = groundY + (fyB - groundY) * t1;
      const bh = 7 * (1 - t0 * 0.4);
      InkFill(ctx, [[ax0, ay0], [ax1, ay1], [ax1, ay1 - bh], [ax0, ay0 - bh]],
        id + "gpl" + i, i % 2 ? PAL.brickPlinth : PAL.brickPlinthAlt,
        { amp: 0.7, lw: 1.0, line: "rgba(38,32,26,0.45)" });
    }
  }
  ctx.restore();
  // 墙角那条竖线：两面之间的那道棱，比别处都硬
  InkLine(ctx, ex, top + 1, ex + Sym(id + "cn", 0, 1.2), groundY, id + "corner",
    { lw: 2.0, color: "rgba(34,25,16,0.62)", amp: 0.8 });
  return { fxT, fyT, fxB, fyB };
}

/**
 * 山墙上头那条檐：屋顶挑出墙面的那一截转过去之后是**斜下去的一条**。
 * 单独一支笔，因为它必须画在屋顶之后——屋顶自己的东缘要压在山墙面之前，
 * 顺序反了，墙就长到屋顶上头去了。
 */
function GableEave(ctx, ex, top, id, { vpx, vpy, night = false, burnt = false, depth = HOUSE_D, rise = 6 } = {}) {
  const [fx, fy] = Recede(ex, top, depth, vpx, vpy);
  const [fxU, fyU] = Recede(ex, top - rise, depth, vpx, vpy);
  InkFill(ctx, [[ex, top - rise], [fxU, fyU], [fx, fy], [ex, top]], id + "gEave",
    burnt ? "#3b352d" : (night ? "#2b2419" : "#4b4230"), { amp: 1.2, lw: 1.8 });
}

// ---------------------------------------------------------------------------
// 建筑与道具
// ---------------------------------------------------------------------------
// 可进入的屋子的内里（剖面）：土墙面、炕、灶台、水缸、房梁。
// 立面淡出后看到的就是这一层——像蚂蚁农场一样把家剖开给你看。
export function DrawHomeInterior(ctx, x, groundY, w, h, id, { night = false } = {}) {
  const W = w, H = h;
  // 内墙面：比外墙暖一点、亮一点（烟火气熏出来的浅黄）
  InkFill(ctx, Rect(x - W / 2, groundY - H, W, H), id + "inWall", night ? "#4a4034" : "#b09c78",
    { amp: 1.4, lw: 2.4, shade: "rgba(60,45,30,0.16)", shadeAt: 0.7 });
  Speckle(ctx, x - W / 2, groundY - H, W, H, id + "inSp", { count: 22, alpha: 0.08, size: 1.6 });
  // 房梁：两根压在墙头
  InkLine(ctx, x - W / 2 + 4, groundY - H + 10, x + W / 2 - 4, groundY - H + 8, id + "beam1",
    { lw: 6, color: "#4a3826", amp: 1.6 });
  InkLine(ctx, x - W / 2 + 10, groundY - H + 24, x + W / 2 - 10, groundY - H + 22, id + "beam2",
    { lw: 4, color: "rgba(74,56,38,0.55)", amp: 1.8 });
  // 炕：西头一方土台，铺席、卷着被褥
  const kw = W * 0.42, kh = 26;
  InkFill(ctx, Rect(x - W / 2 + 8, groundY - kh, kw, kh), id + "kang", "#8a6f4c",
    { amp: 1.2, lw: 2.2, shade: "rgba(0,0,0,0.18)" });
  InkLine(ctx, x - W / 2 + 10, groundY - kh + 5, x - W / 2 + 6 + kw, groundY - kh + 5, id + "mat",
    { lw: 1.2, color: "rgba(60,45,25,0.5)", amp: 1.4 });
  InkFill(ctx, [[x - W / 2 + 14, groundY - kh], [x - W / 2 + 16, groundY - kh - 14],
    [x - W / 2 + 34, groundY - kh - 12], [x - W / 2 + 36, groundY - kh]],
    id + "quiltRoll", "#9a8468", { amp: 1.4, lw: 1.8, shade: "rgba(0,0,0,0.14)" });
  // 灶台：连着炕（炕灶相连是华北民居的常态），上面坐一口锅
  const zx = x - W / 2 + 12 + kw;
  InkFill(ctx, Rect(zx, groundY - 20, 30, 20), id + "stove", "#7a6248", { amp: 1.2, lw: 2 });
  ctx.strokeStyle = IN.ink;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(zx + 15, groundY - 20, 9, Math.PI, 0); ctx.stroke();
  InkFill(ctx, [[zx + 6, groundY - 20], [zx + 24, groundY - 20], [zx + 22, groundY - 26], [zx + 8, groundY - 26]],
    id + "pot", "#3d3a36", { amp: 0.8, lw: 1.6 });
  // 水缸：靠门那头
  InkFill(ctx, [[x + W / 2 - 30, groundY], [x + W / 2 - 33, groundY - 16], [x + W / 2 - 29, groundY - 26],
    [x + W / 2 - 13, groundY - 26], [x + W / 2 - 9, groundY - 16], [x + W / 2 - 12, groundY]],
    id + "vat", "#6e5b44", { amp: 1.2, lw: 2, shade: "rgba(0,0,0,0.22)" });
  // 小窗：西墙上一方纸窗，白天透一格亮
  InkFill(ctx, Rect(x - W / 2 + 14, groundY - H + 34, 22, 18), id + "win", night ? "#2c2822" : "#d8c9a2",
    { amp: 0.8, lw: 2 });
  InkLine(ctx, x - W / 2 + 25, groundY - H + 34, x - W / 2 + 25, groundY - H + 52, id + "winBar",
    { lw: 1.2, color: "rgba(70,50,30,0.7)" });
}

// 山墙内侧：屋子东/西两头那道墙，从后墙的墙角折过来、朝着镜头铺开的那一面。
//
// **为什么非有它不可**（2026-08-14 逐镜实拍抓的）：2.5D 的屋子只画了两片——
// 后墙（building −3.4）与立面（facade 0.4）。后墙那片按透视只占到画框的一小截：
// 序里「柱子。」那一镜（机位 x=30.88 z=1.96）后墙的东缘落在 NDC 0.60，右边那
// 两成画框已经在屋外了；而过场把第四堵墙整个撤掉，于是越过那条缝就直接望见
// 野地、地平线上的炮楼。老办法是躲——机距收到 1.96、右缘钉一块前景板挡住，
// 「抱她。」本该是娘和柱子的双人镜也只好退成单人镜。真实的屋子那两头本来
// 就有一道山墙，把它画出来，画框就有东西挡了，镜头也不必再躲。
//
// 三条落地约束，缺一条就露馅：
//   ① **远端必须冲出画布**：InkFill 是闭合描边，边落在画布里就是画面当中凭空
//      竖一根黑线。远端一律画到画布外让它被裁掉。
//   ② **墙角那条线不用自己描**——后墙那张贴图的外沿正好落在同一条世界线上，
//      它就是墙角。这里只补**墙角的暗部**：角落是暗的，有那一道，墙才读成
//      "折过来的一面"，而不是又一块拼在旁边的平贴。
//   ③ **顶沿与后墙同高**（groundY − H），两张贴图同一个带、同一条基线，
//      接缝才看不出来。檩条到这儿是断的，所以墙角上补两个檩头。
//
// side：+1 ＝ 东山墙（墙角在画布左边，墙面往右铺）；−1 ＝ 西山墙。
export function DrawRoomWing(ctx, x, groundY, w, h, id,
  { side = 1, night = false, feature = null } = {}) {
  const H = h;
  const cx = x - side * (w / 2);            // 墙角：与后墙的东/西缘同一条世界线
  const far = cx + side * (w + 40);         // 远端冲出画布（约束①）
  const xa = Math.min(cx, far), xb = Math.max(cx, far);
  const top = groundY - H;
  const Ink = (a, b) => (night ? a : b);

  // ① 墙面。**整片压在后墙之下一档**：后墙迎着西头那扇纸窗，这一面是折过去的，
  //    只吃得到从敞着的那一侧擦进来的光。两面同值就没有墙角，只有一张更宽的平贴
  InkFill(ctx, Rect(xa, top, xb - xa, H), id + "wing", Ink("#383026", "#8d7a55"),
    { amp: 1.4, lw: 2.4 });

  ctx.save();
  ctx.beginPath();
  ctx.rect(xa, top, xb - xa, H);
  ctx.clip();

  // ② 墙角的暗部（约束②）。**窄而深、外带一条长尾**：一道均匀摊开一米的灰
  //    读出来是"这面墙脏了"，不是"这儿是个角"——角是有接触阴影的
  const corner = ctx.createLinearGradient(cx, 0, cx + side * H * 0.62, 0);
  corner.addColorStop(0, "rgba(32,22,14,0.52)");
  corner.addColorStop(0.16, "rgba(32,22,14,0.26)");
  corner.addColorStop(0.5, "rgba(32,22,14,0.10)");
  corner.addColorStop(1, "rgba(32,22,14,0)");
  ctx.fillStyle = corner;
  ctx.fillRect(xa, top, xb - xa, H);

  // ②.2 越靠近敞开的那一侧越亮：光是从画框外那一头擦进来的
  const wash = ctx.createLinearGradient(cx + side * w * 0.35, 0, cx + side * w, 0);
  wash.addColorStop(0, "rgba(232,208,158,0)");
  wash.addColorStop(1, Ink("rgba(150,140,120,0.10)", "rgba(232,208,158,0.16)"));
  ctx.fillStyle = wash;
  ctx.fillRect(xa, top, xb - xa, H);

  // ③ 檐下：屋顶的秫秸泥背压在墙头上，那一条是屋里最暗的地方
  const eave = ctx.createLinearGradient(0, top, 0, top + H * 0.28);
  eave.addColorStop(0, "rgba(40,30,20,0.58)");
  eave.addColorStop(1, "rgba(40,30,20,0)");
  ctx.fillStyle = eave;
  ctx.fillRect(xa, top, xb - xa, H * 0.28);

  // ④ 墙根：土墙脚下常年扫不净的一道灰，墙有了它才落在地上
  const foot = ctx.createLinearGradient(0, groundY, 0, groundY - H * 0.14);
  foot.addColorStop(0, "rgba(48,36,24,0.34)");
  foot.addColorStop(1, "rgba(48,36,24,0)");
  ctx.fillStyle = foot;
  ctx.fillRect(xa, groundY - H * 0.14, xb - xa, H * 0.14);

  // ⑤ 抹泥的接茬：这面墙是拿抹子横着一道一道抹上去的，压不平的地方留一道痕。
  //    **不许等距等长**——那读出来是横格纸，不是墙（首轮实拍就是这么翻的）：
  //    行距随机、起止各不相同、宽窄不一，反差压到几乎看不见
  for (let i = 0; i < 5; i += 1) {
    const sy = top + H * (0.16 + i * 0.15 + Sym(id + "tr", i, 0.055));
    const sx0 = cx + side * (0.02 + Rnd(id + "tr2", i) * 0.5) * w;
    const sx1 = sx0 + side * (0.18 + Rnd(id + "tr3", i) * 0.5) * w;
    InkLine(ctx, sx0, sy, sx1, sy + Sym(id + "tr4", i, 4.5), id + "trowel" + i,
      { lw: 2.4 + Rnd(id + "tr5", i) * 5, amp: 2.6,
        color: i % 2 ? "rgba(60,45,28,0.055)" : "rgba(226,206,166,0.055)" });
  }

  // ⑥ 抹层脱落的坑洼：**轮廓不许有直边**（画笔通用毛病之二）。数量跟着墙面
  //    长度走，不然 6.5 米的墙上就散着三个点
  const patches = Math.max(4, Math.round(w / 42));
  for (let i = 0; i < patches; i += 1) {
    const px = cx + side * (0.04 + Rnd(id + "pt", i) * 0.92) * w;
    const py = top + H * (0.24 + Rnd(id + "pt2", i) * 0.56);
    const pw = 10 + Rnd(id + "pt3", i) * 20, ph = 8 + Rnd(id + "pt4", i) * 13;
    // **边必须是化开的**：平色一块（哪怕轮廓抖过、点给到十一个）在近景机位下
    // 还是一块贴在墙上的补丁——那一镜的墙放大了八倍，抖动量早被抹平了
    // （c1_count 那一镜实拍连退两轮）。抹泥的起伏本来就没有边界：形状交给
    // 抖过的轮廓，值交给一圈化到零的径向渐变，两个一起才读成"墙面不平"
    const pts = [];
    for (let k = 0; k < 11; k += 1) {
      const a = (k / 11) * Math.PI * 2;
      const rr = 0.66 + Rnd(id + "pr" + i, k) * 0.62;
      pts.push([px + Math.cos(a) * pw * rr, py + Math.sin(a) * ph * rr]);
    }
    const tone = i % 3 === 2
      ? Ink("18,14,10", "74,60,40")          // 掉了皮的：暗
      : Ink("150,140,124", "226,206,166");   // 新抹上去的：亮
    ctx.save();
    WobblyPath(ctx, pts, id + "patch" + i, 2.2, true);
    ctx.clip();
    const pg = ctx.createRadialGradient(px, py, 0, px, py, Math.max(pw, ph) * 1.08);
    pg.addColorStop(0, `rgba(${tone},0.115)`);
    pg.addColorStop(0.5, `rgba(${tone},0.070)`);
    pg.addColorStop(1, `rgba(${tone},0)`);
    ctx.fillStyle = pg;
    ctx.fillRect(px - pw * 1.8, py - ph * 1.8, pw * 3.6, ph * 3.6);
    ctx.restore();
  }
  Speckle(ctx, xa, top, xb - xa, H, id + "wsp", { count: Math.round(w / 9), alpha: 0.09, size: 1.7 });

  // ⑥ 檩头：后墙上那两根檩到这儿就断了（DrawHomeInterior 画到墙内 4px 为止），
  //    山墙上看见的是它们的头——从墙角探出来一小截
  const Stub = (yTop, len, thick, tag, color) => {
    const sx = side > 0 ? cx - 2 : cx - len + 2;
    InkFill(ctx, Rect(sx, yTop, len, thick), id + tag, color, { amp: 0.8, lw: 1.4 });
  };
  Stub(top + 6.5, 16, 6.5, "purlinA", Ink("#332a20", "#4a3826"));
  Stub(top + 21, 13, 4.6, "purlinB", Ink("#2f281f", "#57432e"));

  // ⑦ 这一头墙上的那一件东西。空墙是"半屏没内容"，可也不能堆杂物——
  //    一件就够，而且得是这面墙上本来就该有的
  // 摆位按**离墙角多远**给（不是按墙面长度的比例）：墙面铺多长是为了填满画框，
  // 可画框里十有八九只看得见靠墙角这一米——挂在墙中间等于没画
  const fx0 = cx + side * 52;
  if (feature === "niche") {
    // 灯窝：炕头这一头的墙上掏一个浅龛，晚上把油灯搁进去。**不许画成一个
    // 黑窟窿**——那在这套画里读作"墙上有个洞、外头是黑的"，正好把这道墙
    // 要办的事办反了。所以龛底留一道被灯烤亮的台沿，龛口上方一片熏黑
    const nx = fx0, ny = groundY - H * 0.52;
    const nw = 11, nh = 13;
    InkFill(ctx, Rect(nx - nw / 2, ny - nh, nw, nh), id + "niche", Ink("#2a241d", "#6b5c46"),
      { amp: 0.9, lw: 1.6 });
    // 龛底的台沿：常年搁灯，烤得比墙面亮
    InkFill(ctx, Rect(nx - nw / 2 - 1.5, ny - 2.4, nw + 3, 3.4), id + "nicheSill",
      Ink("#524739", "#ad9878"), { amp: 0.7, lw: 1.2 });
    // 熏黑：灯烟贴着墙往上爬。**不许画成一个上宽下窄的梯形**——那个形状在这套
    // 画里读作"一束光打上去"，正好把意思弄反（首轮实拍退回）。改成一叠越往上
    // 越大越淡的团，边缘自己就毛了
    // 一叠**很多很淡**的小团堆出来的：五个大团各自有边，画面上就是五个泡泡
    // （首轮实拍的第二次退回）。数量上去、单个压到看不见，边才自己毛掉
    ctx.save();
    ctx.fillStyle = "rgba(26,20,15,1)";
    ctx.globalAlpha = 0.042;
    for (let i = 0; i < 30; i += 1) {
      const t = Rnd(id + "sot", i);                 // 越往上越淡越散
      const r = 2.4 + (1 - t) * 3.4 + Rnd(id + "sor", i) * 2.2;
      ctx.beginPath();
      ctx.ellipse(nx + Sym(id + "sox", i, 2.4 + t * 7), ny - nh - 1 - t * 26,
        r, r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else if (feature === "peg") {
    // 木橛：楔进墙里挂东西的那种，这会儿空着。橛头一道亮、墙上一道影
    const gx = fx0, gy = groundY - H * 0.60, len = 13;
    InkFill(ctx, Rect(Math.min(gx, gx + side * len), gy - 2.8, len, 5.4), id + "peg",
      Ink("#3a3026", "#6d5738"), { amp: 0.7, lw: 1.4 });
    InkLine(ctx, gx + side * 2, gy + 3.2, gx + side * (len - 1), gy + 5.0, id + "pegSh",
      { lw: 2.2, color: "rgba(40,30,20,0.30)", amp: 0.6 });
  }
  ctx.restore();
}

export function DrawHouse(ctx, x, groundY, w, h, id,
  { burnt = false, night = false, door = false, slogan = null, doorAt = null } = {}) {
  const W = w, H = h;
  // 伪透视的两个数：灭点钉在东墙外（见上面「房子是个盒子」那一节）
  const vpx = VanishX(x + W / 2);
  const vpy = EyeY(groundY);
  if (burnt) {
    // 烧过的土坯房：**土坯不燃，火只吃木头和草**——所以四堵墙基本还立着、
    // 屋顶整个没了。老版画的"一堵墙立着其余塌成瓦砾"是砖石建筑的垮法。
    // 泥平顶（囤顶）没有三角尖山墙，失去屋顶保护后墙头被雨啃成圆钝的波浪边。
    const top = groundY - H * 0.72;
    const crest = RaggedTop(x - W / 2, x + W / 2, top, id + "burnTop", { sag: 7, n: 11 });
    InkFill(ctx, [...crest, [x + W / 2, groundY], [x - W / 2, groundY]],
      id, "#6b6154", { amp: 2.2, lw: 2.4, shade: "rgba(0,0,0,0.22)" });
    WeatherAdobe(ctx, x - W / 2, top, W, groundY - top, id + "bw",
      { course: 12, gullies: 7, cracks: 4, patches: 1, seam: 0.20 });
    // 东山墙：烧塌的也是一栋房子，四堵墙还立着——只有这一面转过去，
    // 才看得出"里头是空的"。没有它，残墙就是院子里立着的一块灰板
    EastGable(ctx, x + W / 2, top + 3, groundY, id + "bg", { vpx, vpy, night, burnt: true });
    // 门窗洞：烧空之后是这堵墙上最黑的两块，洞口正上方一道火舌形的熏黑
    const holes = [[x - W * 0.22, 40, 74], [x + W * 0.16, 46, 38]];
    for (let i = 0; i < holes.length; i += 1) {
      const hx = holes[i][0], hw = holes[i][1], hh = holes[i][2];
      InkFill(ctx, Rect(hx - hw / 2, groundY - hh, hw, hh), id + "hole" + i, "#1c1712",
        { amp: 1.8, lw: 2.0 });
      ctx.save();
      const lick = ctx.createLinearGradient(0, groundY - hh, 0, groundY - hh - 34);
      lick.addColorStop(0, "rgba(24,20,16,0.75)");
      lick.addColorStop(1, "rgba(24,20,16,0)");
      ctx.fillStyle = lick;
      ctx.beginPath();
      ctx.moveTo(hx - hw / 2, groundY - hh);
      ctx.lineTo(hx + hw / 2, groundY - hh);
      ctx.lineTo(hx + 3, groundY - hh - 34);
      ctx.lineTo(hx - 4, groundY - hh - 34);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // 檐口那一排椽头烧成炭桩，长短不齐地探在墙头上
    for (let i = 0; i * 24 < W - 14; i += 1) {
      const jx = x - W / 2 + 10 + i * 24 + Sym(id + "cs", i, 5);
      if (Rnd(id + "csk", i) < 0.28) continue;         // 缺几根：烧断掉下去了
      const ch = 5 + Rnd(id + "ch", i) * 9;
      InkFill(ctx, Rect(jx, top - ch, 5, ch + 3), id + "char" + i, "#241f1a", { amp: 1.4, lw: 1.4 });
    }
    // 屋顶的泥背连着秫秸苇箔坠进屋里：**堆在原来屋内的位置**，只到膝盖高
    for (let i = 0; i < 9; i += 1) {
      const rx = x - W * 0.36 + Rnd(id + "r", i) * W * 0.72;
      const rs = 5 + Rnd(id + "r2", i) * 8;
      InkFill(ctx, [[rx - rs, groundY], [rx - rs * 0.5, groundY - rs * 0.8],
        [rx + rs * 0.6, groundY - rs * 0.6], [rx + rs, groundY]],
      id + "rub" + i, i % 2 ? "#6e6252" : "#5c5244", { amp: 1.6, lw: 1.4 });
    }
    InkLine(ctx, x - 12, groundY - 3, x + 24, groundY - 19, id + "beam", { lw: 5, color: "#241f1a", amp: 2 });
    // 一年过去了，屋里长起半人高的蒿草，从洞口探出来
    for (let i = 0; i < 7; i += 1) {
      const gx = x - W * 0.3 + Rnd(id + "wd", i) * W * 0.6;
      InkLine(ctx, gx, groundY - 2, gx + Sym(id + "wd2", i, 5), groundY - 12 - Rnd(id + "wd3", i) * 12,
        id + "grass" + i, { lw: 1.1, color: night ? "#3a4034" : "#6b6b45", amp: 1.4 });
    }
    return;
  }
  // ---------------------------------------------------------------------------
  // 1942-43 年冀中平原贫农的住房（用户 2026-08-09 退回："大家实际上住的房子
  // 根本没那么好 都是很破很穷的"；2026-08-10 再退："一点都不像敌后战场
  // 照片里的村庄"）。真实的样子：
  //   · 土坯（晒干的泥砖）垒墙，外面抹一层麦秸泥，抹层一块块掉、露出坯缝
  //   · **平顶或极缓的泥顶**（要能上人晒粮食），不是瓦——瓦要烧要买，用不起
  //   · 泥顶压在秫秸上年年下沉，**屋面轮廓中间下垂**是这个形制唯一的识别特征
  //   · 碱脚是两三皮**旧青砖半截砖**（平原缺石头，整圈毛石是山区的语汇）
  //   · 窗是**木棂糊纸**，纸发黄，破了两格露出屋里的黑
  //   · **门窗洞口是画面上最黑的值**——照片里最先看见的就是这两个黑窟窿
  // ---------------------------------------------------------------------------
  const ADOBE = PAL.adobe;
  const MUD_ROOF = PAL.mudRoof;

  // ① 土坯墙身。**墙头不许是一条水平线**：中段下坠、一头更低
  const wallTop = RaggedTop(x - W / 2, x + W / 2, groundY - H, id + "top",
    { sag: 3.5, n: 9, tiltR: Sym(id + "tilt", 0, 3) });
  InkFill(ctx, wallTop.concat([[x + W / 2, groundY], [x - W / 2, groundY]]), id, ADOBE,
    { amp: 2.2, lw: 2.6, shade: "rgba(74,56,42,0.20)", shadeAt: 0.62 });
  Speckle(ctx, x - W / 2, groundY - H, W, H, id + "sp", { count: 54, alpha: 0.13, size: 2.2 });

  // ②③④⑤ 抹泥 / 坯缝 / 补丁 / 泛碱 / 雨沟 / 裂缝（全街共用一套）
  WeatherAdobe(ctx, x - W / 2, groundY - H, W, H, id + "wa", { course: 13 });

  // ⑥ 檐下压暗，墙才有厚度
  ctx.save();
  const eaveShade = ctx.createLinearGradient(0, groundY - H, 0, groundY - H * 0.74);
  eaveShade.addColorStop(0, "rgba(40,30,20,0.62)");
  eaveShade.addColorStop(1, "rgba(40,30,20,0)");
  ctx.fillStyle = eaveShade;
  ctx.fillRect(x - W / 2, groundY - H, W, H * 0.26);
  ctx.restore();

  // ⑥.2 东山墙：**真的转过去的一面**，不是画在正墙上的一道渐变（2026-08-17
  // 用户退回门框那一轮换掉的）。太阳在西，所以这一面整片在阴影里——
  // 全画面唯一的大块暗部。老版拿一道 16px 的渐变假装它，正墙到头还是一条
  // 竖直的裁边：房子仍然是一张卡片，门框也就无墙可依。
  EastGable(ctx, x + W / 2, groundY - H + 2, groundY, id + "eg", { vpx, vpy, night });

  // ⑥.5 墙根的溅泥带：雨从檐口砸下来把泥溅上墙，加上常年堆在根上的柴土——
  //      **照片里土墙最暗的一条就在这儿**。只有泛碱的浅色，墙就还是一张平板
  ctx.save();
  const splash = ctx.createLinearGradient(0, groundY - H * 0.20, 0, groundY);
  splash.addColorStop(0, "rgba(58,44,28,0)");
  splash.addColorStop(0.55, "rgba(58,44,28,0.20)");
  splash.addColorStop(1, "rgba(48,36,22,0.42)");
  ctx.fillStyle = splash;
  ctx.fillRect(x - W / 2, groundY - H * 0.20, W, H * 0.20);
  ctx.restore();
  Speckle(ctx, x - W / 2, groundY - H * 0.16, W, H * 0.16, id + "mud",
    { count: 40, alpha: 0.22, size: 1.8, color: "#3a2c1c" });

  // ⑦ 碱脚：旧青砖半截砖乱砌，只铺一段，一头没入土里
  BrickPlinth(ctx, x - W / 2, W, groundY, id + "pl", { rows: 2, cover: 0.46 });
  // 砖脚够不着的那一段：捡来的碎砖烂瓦垫一排，高低不平
  for (let i = 0, sx2 = x + W * 0.08; sx2 < x + W / 2 - 4; i += 1) {
    const sw = 8 + Rnd(id + "sc", i) * 9;
    const sh = 2 + Rnd(id + "sc2", i) * 4;
    InkFill(ctx, Rect(sx2, groundY - sh, sw, sh), id + "chip" + i,
      i % 2 ? "#6b6154" : "#5e564a", { amp: 1.4, lw: 1.2 });
    sx2 += sw + 2;
  }

  // ⑧ 屋顶：**泥顶**，中跨往下坠——年年下沉，这条下垂的轮廓是识别特征
  const rw = W + 16, rh = H * 0.13;
  const eaveY = groundY - H;
  const roofTop = [];
  for (let i = 0; i <= 8; i += 1) {
    const t = i / 8;
    // 中间坠 5px、右边 1/4 段整体再低 4px
    const droop = Math.sin(t * Math.PI) * 5 + (t > 0.72 ? (t - 0.72) * 16 : 0);
    roofTop.push([x - W * 0.42 + W * 0.82 * t, eaveY - rh + droop + Sym(id + "rt", i, 1.6)]);
  }
  InkFill(ctx, [[x - rw / 2, eaveY + 3]].concat(roofTop, [[x + rw / 2, eaveY + 2]]),
    id + "roof", MUD_ROOF, { amp: 2.6, lw: 2.6, shade: "rgba(0,0,0,0.14)" });
  // 每年"抹房"的补丁：今年新抹的最深最润，去年那块灰白起皮
  for (let i = 0; i < 3; i += 1) {
    const pw = W * (0.10 + Rnd(id + "rp", i) * 0.16);
    const px2 = x - W * 0.38 + Rnd(id + "rp2", i) * (W * 0.72 - pw);
    const py2 = eaveY - rh * (0.30 + Rnd(id + "rp3", i) * 0.5);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = i === 0 ? "#574c36" : "#7a7159";
    ctx.beginPath();
    ctx.ellipse(px2 + pw / 2, py2, pw / 2, rh * 0.38, Sym(id + "rp4", i, 0.3), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // 檐口的排水嘴（一段劈开的秫秸），嘴下墙上拖一条水渍——
  // **这一条比什么都能说明这是泥顶**
  {
    const spoutX = x - W * (0.14 + Rnd(id + "sp2", 0) * 0.2);
    InkFill(ctx, Rect(spoutX - 3, eaveY - 1, 12, 4), id + "spout", "#7d6a41", { amp: 1.0, lw: 1.4 });
    ctx.save();
    const stain = ctx.createLinearGradient(0, eaveY + 2, 0, groundY - H * 0.18);
    stain.addColorStop(0, "rgba(70,54,36,0.38)");
    stain.addColorStop(1, "rgba(70,54,36,0.04)");
    ctx.fillStyle = stain;
    ctx.fillRect(spoutX - 1, eaveY + 2, 6, H * 0.8);
    ctx.restore();
  }
  // 2026-08-10 用户退回整个屋顶：「你的楼顶画的是什么鬼 看都看不懂是什么玩意儿
  // 实在不行这类鬼东西删了得了」。屋顶原来堆了四样东西——放着碾泥的碌碡、
  // 塌角的黑洞、檐口一排椽头、烟道——每一样单看都有出处，可它们在**屋檐这条
  // 三四像素高的线上**各占一块，读出来是"一条深色带上摆着几个不明方块，
  // 底下串了一排珠子"。
  // 判据照旧：**这件东西在这个尺寸下认得出来吗？** 认不出来的一律删掉，
  // 屋顶只留两样真能读出来的东西——**烟囱**（唯一说明"这里头住着人、烧着火"
  // 的记号）和**顶上长的草**（说明这是抹泥的平顶）。
  // 顶上长的草：泥顶年年长草，没人去薅
  for (let i = 0; i < 5; i += 1) {
    const wx = x - W * 0.34 + Rnd(id + "wd", i) * W * 0.70;
    const wy = eaveY - rh * (0.45 + Rnd(id + "wd2", i) * 0.35);
    for (let b = 0; b < 3; b += 1) {
      InkLine(ctx, wx, wy, wx + (b - 1) * 3, wy - 4 - Rnd(id + "wd3", i * 3 + b) * 4,
        id + "weed" + i + b, { lw: 1, color: night ? "#333c31" : "#5d6440", amp: 1.1 });
    }
  }
  // 烟囱：泥抹的小墩坐在屋面上，上头扣半截破瓦罐挡雨，罐口熏黑。
  // **必须坐在屋脊线上、并且够高**（原先只有 13px 高、又压在檐口的一堆杂物
  // 中间，看着像屋顶上放了个盒子）。烟囱高一截，剪影上才是"烟囱"。
  {
    const cx2 = x - W * 0.30;
    // 高矮宽窄按真物件给：泥墩 0.4m 见方、连罐口一共 0.55m 上下。
    // 细长一根就成了工厂烟囱（画过一版 26px 高、14px 宽的，正是那样）
    const stackTop = eaveY - rh - 17;
    // 墩身：上窄下宽，坐进屋面里一点（底边压在屋面下方，不留缝）
    InkFill(ctx, [[cx2 - 10, eaveY - rh + 4], [cx2 + 10, eaveY - rh + 4],
      [cx2 + 8, stackTop], [cx2 - 8, stackTop]], id + "flue", "#6e6047",
    { amp: 1.3, lw: 2.0, shade: "rgba(0,0,0,0.18)" });
    // 扣着的破罐：罐口朝上敞着，侧面豁一块
    InkFill(ctx, [[cx2 - 10, stackTop + 1], [cx2 + 10, stackTop + 1],
      [cx2 + 8.5, stackTop - 7], [cx2 + 1, stackTop - 9], [cx2 - 8, stackTop - 6]],
    id + "crock", "#4a3f33", { amp: 1.4, lw: 1.8 });
    // 熏黑：只熏罐口一圈。上方那团悬空的淡晕已删——它飘在罐口上头半尺，
    // 远看就是一缕炊烟，把「家家烟囱都没冒烟」那句开场白当场拆台
    //（新剧本第一章的安静全指着这类"没有"）。烟真要冒，另走动效，不烙在贴图上
    ctx.save();
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = "#2b241c";
    ctx.beginPath();
    ctx.ellipse(cx2 + 1, stackTop - 8, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // 檐口：一道压在墙头上的暗边。原先这儿是一排画成椭圆的椽头，
  // 三四像素的圆点排一长溜，读出来是一串珠子——现在只留檐影，
  // "屋顶挑出墙面一截"这件事由这条影子交代
  ctx.save();
  ctx.globalAlpha = 0.30;
  ctx.fillStyle = "#2b2118";
  ctx.fillRect(x - rw / 2 + 4, eaveY + 2, rw - 8, 4);
  ctx.restore();

  // ⑧.5 山墙上头的檐：必须画在屋顶之后（屋顶自己的东缘要压在山墙面之前，
  //      顺序反了墙就长到屋顶上头去了）
  GableEave(ctx, x + W / 2, eaveY + 2, id + "eg", { vpx, vpy, night, rise: rh + 3 });

  // ⑨ 门：**一个有厚度的洞**，不是墙上一块黑色（2026-08-17 改）。
  // 尺寸按人给不按房子给（DOOR 表），三处共用：这儿开的洞、门框那件道具、
  // 烧过之后剩下的那副。
  if (door) {
    // 可进入的家：**立面只负责把洞开出来**，门框那三根木头由 doorframe 那件
    // 道具画（它得能单独留在画面上——第八章「门框还在」全指着它，而且刻痕
    // 要能就地重绘）。两张贴图同在行走线这个平面上（facade 带的位置 z 也是
    // 0），所以洞开成门框外沿那么大，木头就正好嵌在洞里，严丝合缝。
    // 洞口比门框外沿**小 1.5px**：两张贴图的手绘抖动不可能逐点对齐，让墙
    // 压住框一线，才不会在接缝上漏出一条透光的白缝。
    const dcx = x + (doorAt ?? (W / 2 - DOOR_HALF - 22));
    const hx0 = dcx - DOOR_HALF + 1.5, hx1 = dcx + DOOR_HALF - 1.5;
    const hyT = groundY - DOOR_TOP + 1.5;
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "#000";
    WobblyPath(ctx, Rect(hx0, hyT, hx1 - hx0, groundY - hyT), id + "cut", 0.8, true);
    ctx.fill();
    ctx.restore();
    // 洞沿：墙被掏开的地方要有一道墨线，不然是"贴图破了"
    WobblyPath(ctx, Rect(hx0, hyT, hx1 - hx0, groundY - hyT + 4), id + "cut", 0.8, true);
    ctx.strokeStyle = "rgba(40,30,20,0.55)";
    ctx.lineWidth = 2.0;
    ctx.stroke();
    // 洞口上方那块墙常年被门里冒出来的炊烟熏着
    ctx.save();
    const soot = ctx.createLinearGradient(0, hyT, 0, hyT - 26);
    soot.addColorStop(0, "rgba(34,26,18,0.34)");
    soot.addColorStop(1, "rgba(34,26,18,0)");
    ctx.fillStyle = soot;
    ctx.fillRect(hx0 - 4, hyT - 26, hx1 - hx0 + 8, 26);
    ctx.restore();
  } else {
    // 邻家：穷家的门洞连门框料都没有，泥墙自己就是洞壁；板门**钉在洞的里口**，
    // 所以门扇之外还看得见一圈墙的厚度。3~5 块厚板拼的，板缝开裂能透光，
    // 下沿泡烂发毛，不用合页
    const dcx = x - W * 0.28 + 14;
    const hx0 = dcx - DOOR.openW / 2, hx1 = dcx + DOOR.openW / 2;
    const rev = DoorReveal(ctx, hx0, hx1, groundY - DOOR.openH, groundY,
      id + "nd", { vpx, vpy, night });
    // 门扇：钉在洞的**里口**，所以整扇都在洞壁之后、跟着洞口一起往里收
    const dx3 = rev.fx0 + 1, dw = rev.fx1 - rev.fx0 - 2;
    const dTop = rev.fy0 + 2;
    InkFill(ctx, [[dx3, dTop], [dx3 + dw, dTop + 1], [dx3 + dw, groundY - 3], [dx3, groundY - 2]],
      id + "door", night ? "#4a4034" : PAL.woodOld,
      { amp: 1.6, lw: 2.0, shade: "rgba(0,0,0,0.30)" });
    for (let i = 1; i < 4; i += 1) {
      InkLine(ctx, dx3 + (dw * i) / 4, dTop + 3, dx3 + (dw * i) / 4 + Sym(id + "pk", i, 1.2), groundY - 5,
        id + "plank" + i, { lw: 1.3, color: "rgba(30,24,17,0.55)", amp: 1.0 });
    }
    // 下沿泡烂：贴地参差朽茬，更深发黑
    InkFill(ctx, [[dx3 + 2, groundY - 9], [dx3 + dw - 2, groundY - 7],
      [dx3 + dw - 2, groundY - 3], [dx3 + 2, groundY - 3]], id + "rotBase", PAL.woodOldDark,
    { amp: 2.2, lw: 1.2 });
    DoorSill(ctx, hx0, hx1, groundY, id + "nd", { vpx, vpy, night });
  }

  // ⑩ 窗：木棂糊纸，按米写死，下沿在炕沿高（坐在炕上正好平视出去）
  const ww = 50, wh = 41, wy0 = groundY - 41 - wh;
  const wx0 = x + W * 0.06;
  // 窗洞的厚度：跟门洞同一套算法——窗纸糊在**里口**，所以西边那道洞壁
  // 露出来一条（灭点在东，看得见的永远是西侧那一面）。老版只在外围描一圈
  // 深色边，那是"墙上贴了张纸"，不是"墙上掏了个洞"
  const [pwx, pwy] = Recede(wx0, wy0, WALL_T, vpx, vpy);
  const [pwx1] = Recede(wx0 + ww, wy0, WALL_T, vpx, vpy);
  const [, pwyb] = Recede(wx0, wy0 + wh, WALL_T, vpx, vpy);
  const pw = pwx1 - pwx, ph = pwyb - pwy;      // 里口那张窗纸的方框
  {
    InkFill(ctx, Rect(wx0 - 2, wy0 - 2, ww + 4, wh + 4), id + "winFrame", "#5c4a30", { amp: 1.4, lw: 1.6 });
    // 洞壁：西侧一片（受光）＋上沿一条（背光）
    InkFill(ctx, [[wx0, wy0], [pwx, pwy], [pwx, pwyb], [wx0, wy0 + wh]], id + "winRevW",
      night ? "#4a3f31" : "#93805f", { amp: 0.6, lw: 1.0, line: "rgba(45,34,22,0.45)" });
    InkFill(ctx, [[wx0, wy0], [wx0 + ww, wy0], [pwx1, pwy], [pwx, pwy]], id + "winRevT",
      "rgba(38,29,20,0.66)", { amp: 0.5, lw: 0, line: null });
    // 窗纸：糊在里口那一层，跟着洞口一起往里收
    InkFill(ctx, Rect(pwx, pwy, pw, ph), id + "winPaper",
      night ? "#a87f37" : "#8d8368", { amp: 0.9, lw: 0, line: null });
  }
  // 直棂窗：只有竖棂，间距粗细都不匀（精确等分是像样人家）
  {
    let mx = pwx + 4;
    let k = 0;
    while (mx < pwx + pw - 3) {
      InkLine(ctx, mx, pwy + 1, mx + Sym(id + "mv", k, 1.0), pwy + ph - 1,
        id + "mull" + k, { lw: 0.9 + Rnd(id + "mw", k) * 0.5, color: "#5c4a30", amp: 0.7 });
      mx += 6 + Rnd(id + "mg", k) * 7;
      k += 1;
    }
    InkLine(ctx, pwx + 1, pwy + ph * 0.55, pwx + pw - 1, pwy + ph * 0.55 + 1,
      id + "mullH", { lw: 1.2, color: "#4a3a25", amp: 0.7 });
  }
  // 破洞：撕裂形，一角卷起来的纸
  for (let i = 0; i < 2; i += 1) {
    const hx2 = pwx + 4 + Rnd(id + "tc", i) * (pw - 18);
    const hy2 = pwy + 4 + Rnd(id + "tr", i) * (ph - 15);
    const hs = 6 + Rnd(id + "ts", i) * 5;
    InkFill(ctx, [[hx2, hy2], [hx2 + hs, hy2 - 2], [hx2 + hs + 2, hy2 + hs * 0.7],
      [hx2 + hs * 0.4, hy2 + hs], [hx2 - 1, hy2 + hs * 0.5]],
    id + "torn" + i, "#241d15", { amp: 1.6, lw: 1.2 });
    InkLine(ctx, hx2 + hs, hy2 - 2, hx2 + hs + 4, hy2 - 5, id + "curl" + i,
      { lw: 1.4, color: "#b0a488", amp: 0.8 });
  }
  // 窗台下面一条水渍
  ctx.save();
  const wStain = ctx.createLinearGradient(0, wy0 + wh, 0, wy0 + wh + 26);
  wStain.addColorStop(0, "rgba(70,54,36,0.30)");
  wStain.addColorStop(1, "rgba(70,54,36,0)");
  ctx.fillStyle = wStain;
  ctx.fillRect(wx0 + 4, wy0 + wh, ww - 8, 26);
  ctx.restore();
  // 石灰标语：刷在檐下那一片整墙上（门窗以上，人够得着的最高一带）
  if (slogan) {
    const size = Math.min(30, W * 0.60 / (slogan.text.length * 1.22));
    DrawWallSlogan(ctx, x, groundY - H * 0.72, slogan.text, size, id + "sl", slogan);
  }
}

/**
 * 门框——**连着门垛一起画**（2026-08-17 重做）。
 *
 * 用户退回的原话：「门框的设计还是太抽象了 门框就应该在家里啊 你这个都不符合
 * 其他场景样式的透视效果，要么你把房子的四个面都做出来 伪造一下透视 然后再画
 * 一个贴合的门框还差不多」。老版是**两根柱子加一根横梁**，四条边全是直的、
 * 没有厚度，而且孤零零立在院子里——立面一淡出（屋里的戏、过场撤第四堵墙），
 * 它周围一堵墙都没有，读出来就是一座牌坊。
 *
 * 治法不是把这三根木头画细致，是**给它一堵墙**：
 *   · 门垛（洞两边那块墙）跟着门框一起画，西边化开、东边收在墙角上——
 *     立面淡出时它照旧在，门框于是永远长在墙上，不是立在空地上；
 *   · 洞有厚度：门框料是**一圈套在墙洞里的框**，所以西侧那根立柱看得见内侧面
 *     （灭点在东，见「房子是个盒子」那一节），门楣看得见底面，门槛看得见顶面；
 *   · 尺寸与立面上那个洞共用同一张 DOOR 表，两张贴图同在行走线这个平面上，
 *     木头正好嵌在墙洞里。
 *
 * 刻痕（marked/carved/tally）画在**西立柱的正面**上，世界坐标一寸没动：
 * 立柱的西沿＝门心 −0.50m，跟剧本里的 markX0/markX1（33.55~33.78）对得上。
 *
 * @param w,h 门垛的画布尺寸（px，来自 Data_Scenes 的 w/h）
 * @param corner 门心到东墙角有多远（米，来自 Data_Scenes；灭点按它算，
 *   所以这件道具与立面用的是同一个灭点）
 */
export function DrawDoorframe(ctx, x, groundY, w, h, id,
  { marked = false, carved = false, tally = 0, night = false, burnt = false, corner = 0.92 } = {}) {
  const H = DOOR.openH, W = DOOR.openW + DOOR.jamb * 2;
  const ex = x + corner * PX_M;          // 东墙角
  const wx = ex - w;                     // 门垛西沿（那儿墙化开，交给立面接着说）
  // 烧过的墙**要矮一截**：泥平顶没了以后墙头被雨啃塌，跟残墙一般高才叫废墟
  //（照原高画，门垛比整栋残房还高，读出来是"院里立着一座塔"）
  const ph = burnt ? h * 0.80 : h;
  const wallTopY = groundY - ph;
  const vpx = VanishX(ex), vpy = EyeY(groundY);
  const c0 = x - DOOR.openW / 2, c1 = x + DOOR.openW / 2;   // 净空左右沿
  const yTop = groundY - H;                                  // 门头
  const JX = c0 - DOOR.jamb;                                 // 西立柱的西沿（刻痕在这根上）

  // ① 门垛：这块墙跟房子的立面是同一堵，所以泥、坯缝、碱脚全照 DrawHouse 那套
  const crest = RaggedTop(wx, ex, wallTopY, id + "pTop",
    burnt ? { sag: 7, n: 11 } : { sag: 2.5, n: 7 });
  InkFill(ctx, crest.concat([[ex, groundY], [wx, groundY]]), id + "pier",
    burnt ? "#6b6154" : (night ? "#4b4235" : PAL.adobe),
    { amp: 2.0, lw: 2.4, shade: "rgba(74,56,42,0.18)", shadeAt: 0.66 });
  WeatherAdobe(ctx, wx, wallTopY, ex - wx, ph, id + "pwa",
    burnt ? { course: 11, gullies: 5, cracks: 4, patches: 1, seam: 0.2 } : { course: 13 });
  // 檐下那道压暗 + 墙根的溅泥（跟立面同款，两张贴图接缝处才看不出来）
  ctx.save();
  const pe = ctx.createLinearGradient(0, wallTopY, 0, wallTopY + ph * 0.26);
  pe.addColorStop(0, `rgba(40,30,20,${burnt ? 0.30 : 0.62})`);
  pe.addColorStop(1, "rgba(40,30,20,0)");
  ctx.fillStyle = pe;
  ctx.fillRect(wx, wallTopY, ex - wx, ph * 0.26);
  const pf = ctx.createLinearGradient(0, groundY - ph * 0.20, 0, groundY);
  pf.addColorStop(0, "rgba(58,44,28,0)");
  pf.addColorStop(1, "rgba(48,36,22,0.42)");
  ctx.fillStyle = pf;
  ctx.fillRect(wx, groundY - ph * 0.20, ex - wx, ph * 0.20);
  ctx.restore();
  // 碱脚从化开那一段之后才起（起在渐隐里，最西头那块砖会被擦掉半截，
  // 读出来是地上躺着一块孤零零的砖）
  BrickPlinth(ctx, wx + 32, ex - wx - 34, groundY, id + "ppl", { rows: 2, cover: 0.5 });
  // 檐口：一道压在墙头上的暗边。立面在的时候被屋顶盖着看不见，第四堵墙一撤，
  // 全靠它，墙头才不是一条生切口
  ctx.save();
  ctx.globalAlpha = burnt ? 0.18 : 0.34;
  ctx.fillStyle = "#2b2118";
  ctx.fillRect(wx, wallTopY + 1, ex - wx, 4);
  ctx.restore();
  // 烧过的门垛：火是从屋里舔出来的，所以**门洞上方那一片最黑**，越往两边越淡。
  // 只压暗、不描边——烟熏没有轮廓（同「灰靠没有边」那条）
  if (burnt) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(wx, wallTopY - 4, ex - wx, ph + 4);
    ctx.clip();
    const sm = ctx.createRadialGradient(x, groundY - H, 4, x, groundY - H, Math.max(46, w * 0.62));
    sm.addColorStop(0, "rgba(24,20,17,0.46)");
    sm.addColorStop(0.55, "rgba(26,22,18,0.24)");
    sm.addColorStop(1, "rgba(26,22,18,0)");
    ctx.fillStyle = sm;
    ctx.fillRect(wx, wallTopY - 4, ex - wx, ph + 4);
    // 火舌从洞口舔上墙：一叠很淡的小团，越往上越散（同灯窝那条熏黑的做法）
    ctx.fillStyle = "rgba(20,17,14,1)";
    ctx.globalAlpha = 0.05;
    for (let i = 0; i < 26; i += 1) {
      const t = Rnd(id + "sm", i);
      const r = 3.4 + (1 - t) * 5 + Rnd(id + "smr", i) * 3;
      ctx.beginPath();
      ctx.ellipse(x + Sym(id + "smx", i, 4 + t * 16), groundY - H - 2 - t * 40, r, r * 0.82, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  // 东墙角：墙到这儿**转过去**。转多少与立面那张贴图算的是同一笔（同一个灭点、
  // 同一个进深），只画贴着墙角的一截、往里化开——再往里是山墙内侧那张贴图
  // （过场撤第四堵墙那一档）的地盘，两张画满就打架了。
  // 有这一截，立面淡出时墙角才是"转过去了"，不是"切在这儿"
  {
    const seen = 20;                     // 只画墙角这 20px
    const [gx, gy] = Recede(ex, wallTopY, HOUSE_D, vpx, vpy);
    const [gbx, gby] = Recede(ex, groundY, HOUSE_D, vpx, vpy);
    const kx = Math.min(seen / Math.max(1, gx - ex), 1);
    const qx = ex + (gx - ex) * kx, qy = wallTopY + (gy - wallTopY) * kx;
    const qbx = ex + (gbx - ex) * kx, qby = groundY + (gby - groundY) * kx;
    ctx.save();
    InkFill(ctx, [[ex, wallTopY], [qx, qy], [qbx, qby], [ex, groundY]], id + "pierGable",
      burnt ? "#453f38" : (night ? "#2d261e" : "#635740"), { amp: 1.4, lw: 1.8 });
    // 往里那一头化开：它是"还没画完的墙"，不是一块断板
    ctx.globalCompositeOperation = "destination-out";
    const gf = ctx.createLinearGradient(ex + seen * 0.45, 0, ex + seen + 3, 0);
    gf.addColorStop(0, "rgba(0,0,0,0)");
    gf.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = gf;
    ctx.fillRect(ex + seen * 0.45, wallTopY - 10, seen + 8, ph + 20);
    ctx.restore();
  }
  ctx.save();
  const cg = ctx.createLinearGradient(ex - 14, 0, ex, 0);
  cg.addColorStop(0, "rgba(44,33,21,0)");
  cg.addColorStop(1, "rgba(44,33,21,0.42)");
  ctx.fillStyle = cg;
  ctx.fillRect(ex - 14, wallTopY, 14, ph);
  ctx.restore();
  InkLine(ctx, ex, wallTopY + 2, ex + Sym(id + "cn", 0, 1.0), groundY, id + "pierCorner",
    { lw: 2.0, color: "rgba(34,25,16,0.6)", amp: 0.8 });
  // 西沿**化开**：第四堵墙撤掉的时候，墙不该有一条切口——它是"没画的那一截"，
  // 不是"断在这儿"。渐隐的一段正好落在立面半隐的那 0.30 上，两张贴图接得住
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  const fade = ctx.createLinearGradient(wx, 0, wx + 30, 0);
  fade.addColorStop(0, "rgba(0,0,0,1)");
  fade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = fade;
  ctx.fillRect(wx - 4, wallTopY - 8, 34, ph + 12);
  ctx.restore();

  // ② 门洞：**有厚度的洞**。先把往里收的那一层（洞底）铺暗，再补三面洞壁
  const [fx0, fy0] = Recede(c0, yTop, WALL_T, vpx, vpy);
  const [fx1, fy1] = Recede(c1, yTop, WALL_T, vpx, vpy);
  // 只算西侧那条：东立柱的内侧面背着镜头（灭点在东），一丝都不该画
  const [fb0, fyb0] = Recede(c0, groundY, WALL_T, vpx, vpy);
  ctx.save();
  WobblyPath(ctx, [[c0, yTop], [c1, yTop], [c1, groundY], [c0, groundY]], id + "hole", 0.8, true);
  ctx.clip();
  // 洞里不是死黑：门后头是屋子，后面那层贴图要透一点出来
  const inner = ctx.createLinearGradient(0, yTop, 0, groundY);
  inner.addColorStop(0, night ? "rgba(12,10,8,0.88)" : "rgba(20,16,12,0.82)");
  inner.addColorStop(1, night ? "rgba(12,10,8,0.70)" : "rgba(24,19,14,0.56)");
  ctx.fillStyle = inner;
  ctx.fillRect(c0 - 2, yTop - 2, c1 - c0 + 4, groundY - yTop + 4);
  ctx.restore();
  // 西立柱的内侧面：擦进来的光只舔得着这一面——门洞里唯一亮的地方
  InkFill(ctx, [[c0, yTop], [fx0, fy0], [fb0, fyb0], [c0, groundY]], id + "revW",
    burnt ? "#3d332a" : (night ? "#4a3c2a" : "#93724a"), { amp: 0.6, lw: 1.0, line: "rgba(45,32,18,0.5)" });
  ctx.save();
  const lit = ctx.createLinearGradient(c0, 0, fx0, 0);
  lit.addColorStop(0, night ? "rgba(190,170,130,0.10)" : "rgba(238,214,160,0.20)");
  lit.addColorStop(1, "rgba(40,28,16,0.34)");
  ctx.fillStyle = lit;
  WobblyPath(ctx, [[c0, yTop], [fx0, fy0], [fb0, fyb0], [c0, groundY]], id + "revW", 0.6, true);
  ctx.clip();
  ctx.fillRect(c0 - 1, yTop - 1, fx0 - c0 + 2, groundY - yTop + 2);
  ctx.restore();
  // 门楣底面：门头几乎顶在视平线上，所以只剩薄薄一条。有这一条，洞口才是
  // "穿过一堵墙"；没有就是墙上贴了张黑纸
  InkFill(ctx, [[c0, yTop], [c1, yTop], [fx1, fy1], [fx0, fy0]], id + "revT",
    "rgba(30,23,16,0.94)", { amp: 0.5, lw: 0, line: null });

  // ③ 门框料：一圈套在墙洞里的框（立柱两根 + 门楣一根 + 门槛一道）
  const woodA = burnt ? "#4a4038" : PAL.wood;
  const woodB = burnt ? "#37302a" : PAL.woodDark;
  InkFill(ctx, Rect(JX, yTop, DOOR.jamb, H), id + "l", woodA,
    { amp: 1.1, lw: 2.4, shade: "rgba(0,0,0,0.15)" });
  InkFill(ctx, Rect(c1, yTop, DOOR.jamb, H), id + "r", woodA,
    { amp: 1.1, lw: 2.4, shade: "rgba(0,0,0,0.15)" });
  InkFill(ctx, Rect(JX - 4, yTop - DOOR.lintel, W + 8, DOOR.lintel + 1), id + "t", woodB,
    { amp: 1.1, lw: 2.4 });
  // 门槛：脚下那道坎。视平线在它上头一米七，所以**顶面看得见**——
  // 那一小条正是"这道坎有厚度"的全部证据
  {
    const s0 = JX + 1, s1 = c1 + DOOR.jamb - 1, sy = groundY - DOOR.sill;
    const [tx0, ty0] = Recede(s0, sy, WALL_T, vpx, vpy);
    const [tx1, ty1] = Recede(s1, sy, WALL_T, vpx, vpy);
    InkFill(ctx, [[s0, sy], [s1, sy], [tx1, ty1], [tx0, ty0]], id + "sillTop",
      burnt ? "#4e463c" : (night ? "#584c3c" : "#8c7f68"),
      { amp: 0.6, lw: 1.2, line: "rgba(40,32,22,0.45)" });
    InkFill(ctx, Rect(s0, sy, s1 - s0, DOOR.sill), id + "sill",
      burnt ? "#413a33" : (night ? "#463c30" : "#6b6152"),
      { amp: 0.9, lw: 1.6, shade: "rgba(0,0,0,0.20)" });
    InkLine(ctx, s0 + 2, sy + 1.6, s1 - 2, sy + 1.4, id + "sillWear",
      { lw: 1.2, color: night ? "rgba(150,140,120,0.20)" : "rgba(226,206,166,0.34)", amp: 0.5 });
  }
  // 烧过的门框。**立柱只有 8px 宽，不许铺龟裂的鳞**——CLAUDE.md 那条老账：
  // 格子跟形体一样宽，实拍读出来是挂着的铁链（首轮就是这样，一副门框成了
  // 铁栅栏）。细长件改用**横着的裂口**：一道道炸开的横缝 + 缝里的炭灰，
  // 外加烧得最狠的下半截压暗
  if (burnt) {
    const Char = (bx, by, bw, bh, tag) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(bx, by, bw, bh);
      ctx.clip();
      const n = Math.max(3, Math.round(bh / 13));
      for (let i = 0; i < n; i += 1) {
        // **不许排成等距的横杠**——那是梯子不是炭裂。位置要跳、长短要差得开，
        // 还得缺几道（首轮实拍：一副门框读成了铁栅栏）
        if (Rnd(tag + "k", i) < 0.34) continue;
        const cy = by + (i + 0.5) * (bh / n) + Sym(tag + "y", i, 6.5);
        const x0 = bx + Rnd(tag + "a", i) * bw * 0.5;
        const x1 = Math.min(bx + bw, x0 + bw * (0.35 + Rnd(tag + "b", i) * 0.6));
        InkLine(ctx, x0, cy, x1, cy + Sym(tag + "s", i, 1.2), tag + i,
          { lw: 0.8 + Rnd(tag + "w", i) * 1.3, color: "rgba(14,11,9,0.62)", amp: 0.5 });
        // 缝里的炭灰：**很淡**，它只是让裂口有个亮边
        if (Rnd(tag + "l", i) > 0.45) {
          InkLine(ctx, x0 + 0.6, cy + 1.3, x1 - 0.6, cy + 1.3, tag + "ash" + i,
            { lw: 0.6, color: "rgba(160,150,134,0.15)", amp: 0.4 });
        }
      }
      // 底下烧得最狠
      const g = ctx.createLinearGradient(0, by + bh, 0, by + bh * 0.35);
      g.addColorStop(0, "rgba(12,10,8,0.55)");
      g.addColorStop(1, "rgba(12,10,8,0)");
      ctx.fillStyle = g;
      ctx.fillRect(bx, by, bw, bh);
      ctx.restore();
    };
    Char(JX, yTop, DOOR.jamb, H, id + "chL");
    Char(c1, yTop, DOOR.jamb, H, id + "chR");
    Char(JX - 4, yTop - DOOR.lintel, W + 8, DOOR.lintel + 1, id + "chT");
  }
  // 木纹
  for (let i = 0; i < 3; i += 1) {
    InkLine(ctx, JX + 2, yTop + 12 + i * 20, JX + 2, yTop + 28 + i * 20,
      id + "g" + i, { lw: 0.9, color: "rgba(90,60,35,0.55)", amp: 1.6 });
  }
  // 爹刻的那道线：高度必须跟划线玩法的 markY 对上（1.28m×48ppm≈61px），
  // 否则玩家亲手划的线消失后，永久刻痕落在另一个高度上。
  // **必须等玩家真的划完才出现**（marked）——它以前是无条件画的，于是那一拍
  // 玩家攥着笔去划一条已经在木头上的线，整个交互当场失去意义。
  // 粗细跟玩家划出来的那道对齐（1.8px≈3.7cm），否则划完一瞬间线会突然变胖。
  // 去年的刻痕：**无条件画**——量身高那场戏的铺垫全指着它（爹收完家伙
  // 一抬眼撞见的就是这道）。风吹日晒一年，只剩一道发暗的凹槽；跟今年石笔
  // 划出来的亮线一对比，「长了多少」不用一个字。57px≈1.19m，比今年矮 9cm
  // 凿槽的画法：一道暗槽 + 槽下沿一线亮茬（新茬被晒旧后仍比木面浅）——
  // 单画一根半透明细线在晨雾里读不出来（实测过）
  // 正字模式下（tally>0，剧本新生一二章）这道旧凹槽要收掉：它没了下文
  //（量身那场戏已不存在），挂在道道正上方就会被玩家数进正字里
  if (!tally) {
    InkLine(ctx, JX + 0.5, groundY - 57, JX + 8, groundY - 57,
      id + "markOld", { lw: 2.6, color: "#2e2115", amp: 0.4 });
    InkLine(ctx, JX + 1, groundY - 55.2, JX + 7.4, groundY - 55.2,
      id + "markOldLip", { lw: 1.1, color: "rgba(238,222,180,0.6)", amp: 0.3 });
  }
  // 齐膝那些石笔道道再往上——**两道凿子刻的深痕**（第七稿：爹给她量身高刻的，
  // 去年一道、前年一道，今年的还没刻）。无条件画：它们是历史，早就在木头上。
  // 换算照本画笔的老账（48px/米，1.28m≈61px）：去年 68px≈1.42m、前年 62px≈1.29m，
  // 间距 6px——一年长半拃。凿痕跟石笔道道两个物种：深、粗、两端有崩出来的毛茬，
  // 石笔那种"暗底线+淡亮痕"的浅法在它旁边就读成小孩的涂道道
  // **短横刻线，不通到两边**：柱面宽 8px，刻线只占六成上下、两头都留着
  // 木面——通宽的粗填色带在实拍里读成环着立柱的两圈棕箍（首轮退回）。
  // 每道＝深色窄槽(2px) + 下缘亮茬(1px) + 两端一两根崩刺；
  // 去年那道长而深，前年那道短一截、也晒淡了——两道不许一个模子
  for (const [dy2, x0off, ln, gw, lipA, tag] of [
    [68, 1.5, 5.4, 2.0, 0.55, "Y1"],
    [62, 2.4, 4.5, 1.7, 0.40, "Y2"],
  ]) {
    const mx0 = JX + x0off, mx1 = mx0 + ln;
    // 凿槽本体：窄槽一道
    InkLine(ctx, mx0, groundY - dy2, mx1, groundY - dy2 + 0.5, id + "chis" + tag,
      { lw: gw, color: "#241809", amp: 0.4 });
    // 槽下缘的亮茬：凿出来的口子，晒旧了仍比木面浅
    InkLine(ctx, mx0 + 0.5, groundY - dy2 + 1.5, mx1 - 0.3, groundY - dy2 + 1.8, id + "chisLip" + tag,
      { lw: 1.0, color: `rgba(226,206,158,${lipA})`, amp: 0.3 });
    // 两端崩刺：起凿那头两根、收凿那头一根
    InkLine(ctx, mx0, groundY - dy2, mx0 - 1.0, groundY - dy2 - 1.4, id + "chisBurrA" + tag,
      { lw: 0.9, color: "#241809", amp: 0.3 });
    InkLine(ctx, mx0 + 0.4, groundY - dy2 + 0.6, mx0 - 0.8, groundY - dy2 + 1.4, id + "chisBurrA2" + tag,
      { lw: 0.8, color: "#241809", amp: 0.3 });
    InkLine(ctx, mx1, groundY - dy2 + 0.5, mx1 + 1.0, groundY - dy2 - 0.9, id + "chisBurrB" + tag,
      { lw: 0.9, color: "#241809", amp: 0.3 });
  }
  if (marked) {
    InkLine(ctx, JX + 1, groundY - 61, JX + 8, groundY - 61, id + "mark1", { lw: 1.8, color: "#f0e0b0", amp: 0.4 });
  }
  if (carved) {
    // 第八章给妹妹刻的：矮一头（1.08m）
    InkLine(ctx, JX + 1, groundY - 52, JX + 8, groundY - 52, id + "mark2", { lw: 1.8, color: "#fff0c8", amp: 0.4 });
  }
  // 妹妹的正字（剧本新生第一章）：爹娘走后一天一道，五道一个"正"。
  // 画在左立柱孩子够得着的高度（第一个字的中横 = 0.98m，与划线玩法的 markY
  // 对齐——玩家亲手划的就是这一笔，划完消失，这里长出永久的那道）。
  // 笔顺：横、竖、横、竖、横。当天新添的那道比前几天的亮一档。
  if (tally > 0) {
    // 道道收在柱面里侧（探到柱边就读成缠在柱子上的布条），笔画要细——
    // 特写下 1.7px 的白线已经是一根白鞋带了
    const jx0 = JX + 1.8, jx1 = JX + 6.9;
    const cxm = (jx0 + jx1) / 2;
    // 每一道都是「暗底线 + 亮痕」两笔：石笔的白痕淡，单画在浅木色上就是隐形
    //（c2 开场那一镜实拍过一版，一道都看不见）。暗线垫底，亮痕才立得住
    const strokeTwice = (x0, y0, x1, y1, s, fresh) => {
      InkLine(ctx, x0, y0 + 0.6, x1, y1 + 0.6, id + "tyd" + s,
        { lw: fresh ? 1.6 : 1.4, color: "rgba(52,38,22,0.5)", amp: 0.3 });
      InkLine(ctx, x0, y0, x1, y1, id + "ty" + s,
        { lw: fresh ? 1.15 : 0.95, color: fresh ? "#f6ead0" : "#e2d2ac", amp: 0.3 });
    };
    for (let s = 0; s < tally; s += 1) {
      const char = Math.floor(s / 5), st = s % 5;
      // 字距 13px：字身 7.6px 高，隔出多半道的空，两个字才数得开
      //（11px 时上下字只差 3px，十三道糊成一条梯子）；每个字整体
      // 歪那么一小下——孩子一天写一笔，三个字不会排成印刷体
      const jit = (Hash(id + "tj" + char) - 0.5) * 1.6;
      const cy = groundY - 47 + char * 13;
      const top = cy - 4, mid = cy, bot = cy + 3.6;
      const fresh = s === tally - 1;
      const a0 = jx0 + jit, a1 = jx1 + jit, cm = cxm + jit;
      if (st === 0) strokeTwice(a0, top, a1, top + 0.3, s, fresh);
      else if (st === 1) strokeTwice(cm, top, cm + 0.3, bot - 1, s, fresh);
      else if (st === 2) strokeTwice(a0, mid, a1, mid - 0.3, s, fresh);
      else if (st === 3) strokeTwice(a0 + 1.4, mid, a0 + 1.2, bot, s, fresh);
      else strokeTwice(a0, bot, a1, bot - 0.2, s, fresh);
    }
  }
}

// 门扇：三块竖板 + 两道横撑的木门，**从上轴那一点往下挂**。
// 画笔按 (ax, ay) = 上门轴 摆，整扇往下画——渲染层把它塞进一个挂在上轴上的
// Group 里，转 Group 就是转门（绕上轴摆），Art 这边不必知道角度。
//
// 为什么要单独有这么一扇：门框原来只有两根立柱加一根门楣，门扇根本没画。
// 玩家被要求"扶稳门扇"，画面上却没有门扇——那一下当然只能是按个按钮。
export const HUNG_DOOR_W = 24;    // px（≈0.50m）＝门框净空宽
export const HUNG_DOOR_H = 72;    // px（≈1.50m）＝门楣下沿到地面
export function DrawHungDoor(ctx, ax, ay, id, { loose = false } = {}) {
  const W = HUNG_DOOR_W, H = HUNG_DOOR_H;
  const x0 = ax - 3, y0 = ay;        // 上轴在门扇左上角往里一点
  // 三块竖板：板缝是这扇门最像门的地方
  for (let i = 0; i < 3; i += 1) {
    const bw = W / 3;
    InkFill(ctx, Rect(x0 + i * bw, y0, bw, H), id + "p" + i,
      i === 1 ? PAL.wood : PAL.woodDark,
      { amp: 1.0, lw: 2.0, shade: "rgba(0,0,0,0.16)" });
    InkLine(ctx, x0 + i * bw + bw * 0.5, y0 + 8, x0 + i * bw + bw * 0.5, y0 + H - 8,
      id + "pg" + i, { lw: 0.8, color: "rgba(80,52,30,0.4)", amp: 1.4 });
  }
  // 两道横撑
  for (const ty of [y0 + H * 0.22, y0 + H * 0.72]) {
    InkFill(ctx, Rect(x0 - 1, ty, W + 2, 7), id + "b" + Math.round(ty), "#8a6038",
      { amp: 0.9, lw: 2.0, shade: "rgba(0,0,0,0.18)" });
  }
  // 上轴（还在窝里）：一小截露出来的木轴头
  InkFill(ctx, Rect(x0 - 5, y0 - 2, 6, 7), id + "pivT", "#6b4a2c", { amp: 0.6, lw: 1.6 });
  // 下轴：门扇脚上那根要礅进臼窝的木轴头。**只画轴，不画臼窝**——
  // 臼窝（门枕石）是钉在地上的东西，画进这张贴图就会跟着门扇一起摆
  //（门歪 15° 时地上那块石头也跟着歪 15°，读出来就是"地面在晃"）。
  // 它现在自己一张静态贴图，见 DrawDoorSocket / World 的 doorSocketMesh。
  // 尺寸也放大了一档：原来 6×7px（≈0.13m）在 2.6m 的特写里也只有二十来个像素，
  // 「他在敲什么」全靠这一处说，太小就等于没画（用户 2026-08-10）。
  const pw = 9, ph = 15;
  InkFill(ctx, Rect(x0 - pw + 1, y0 + H - ph + 4, pw, ph), id + "pivB", "#5d3f22",
    { amp: 0.7, lw: 1.8, shade: "rgba(0,0,0,0.28)" });
  // 轴头磨出来的亮茬（转了几十年的那一圈）
  InkLine(ctx, x0 - pw + 2.5, y0 + H - 3, x0 - 1.5, y0 + H - 3, id + "pivWear",
    { lw: 1.6, color: "rgba(206,176,122,0.5)", amp: 0.6 });
  void loose;
}

// 门枕石与臼窝：**钉在地上的东西**，单独一张贴图，绝不跟着门扇摆。
//
// 这一拍要玩家看懂的就一件事：那根轴要礅进这个窝里。老版把空臼窝画进了门扇
// 的贴图里（跟着门一起转），下轴只有 6×7 像素，于是"爹在修什么"画面上从来
// 没说过（用户 2026-08-10：「我也看不出他是在修什么东西」）。
// seat = 0..1：礅进去多少。0 = 窝是空的、黑洞洞一个口；1 = 轴头填满、
// 石面上撒着刚礅出来的木屑。进度长在这块石头上，不在任何一根条上。
export function DrawDoorSocket(ctx, ax, ay, id, { seat = 0 } = {}) {
  const k = Math.max(0, Math.min(1, seat));
  // 石头本体：一块半埋在门槛里的方石，上面凿了个圆窝。
  // 尺寸按实物：门枕石一尺见方，≈0.42m 宽、0.19m 露在外头（20×9 绘制单位，
  // 48px/米）。第一版按 0.67m 画，摆到 obstacle 带上被近景透视再放大一档，
  // 成了一块挡住半个人的大石板
  InkFill(ctx, [[ax - 10, ay], [ax + 9, ay - 1], [ax + 10, ay - 6], [ax + 7, ay - 9],
    [ax - 8, ay - 8.4], [ax - 11, ay - 5]], id + "stone", "#6a604d",
  { amp: 0.9, lw: 1.9, shade: "rgba(0,0,0,0.3)" });
  // 石面的凿痕
  for (let i = 0; i < 3; i += 1) {
    InkLine(ctx, ax - 7 + i * 5.5, ay - 7.6, ax - 5 + i * 5.5, ay - 6.2, id + "chis" + i,
      { lw: 0.8, color: "rgba(38,34,26,0.42)", amp: 0.8 });
  }
  // 臼窝：凿在石面上的圆坑。没礅到底之前是个黑口子
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(ax - 0.5, ay - 7.6, 4.4, 2.1, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#1f1810";
  ctx.fill();
  ctx.strokeStyle = "rgba(26,20,12,0.8)";
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();
  // 礅进去的那截轴：越敲填得越满（k=1 时口子被木头塞死）
  if (k > 0.02) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(ax - 0.5, ay - 7.9, 3.7 * (0.45 + 0.55 * k), 1.7 * (0.45 + 0.55 * k), 0, 0, Math.PI * 2);
    ctx.fillStyle = "#5d3f22";
    ctx.fill();
    ctx.restore();
  }
  // 敲出来的木屑：一记一记攒在石面上（做功的痕迹留在物件上，不留在 HUD 上）
  const chips = Math.round(k * 5);
  for (let i = 0; i < chips; i += 1) {
    const cx = ax - 8 + Hash(id + "cp" + i) * 16;
    const cy = ay - 4.5 + Hash(id + "cq" + i) * 3.5;
    InkLine(ctx, cx, cy, cx + 1.8 + Hash(id + "cl" + i) * 1.6, cy - 1, id + "chip" + i,
      { lw: 1.2, color: "rgba(196,158,102,0.85)", amp: 0.4 });
  }
}

// 一根带锥度的枝：沿二次贝塞尔取样，两侧按半宽外扩成多边形。
// 树之所以不像树，八成是因为枝是等宽的直棍——真的枝越往梢越细、还带一点弓。
function Limb(ctx, x0, y0, x1, y1, w0, w1, id, fill, { bow = 0, lw = 2, shade = null, amp = 0.5 } = {}) {
  const cx = (x0 + x1) / 2 + bow;
  const cy = (y0 + y1) / 2;
  const N = 8;
  const left = [], right = [];
  for (let i = 0; i <= N; i += 1) {
    const t = i / N, mt = 1 - t;
    const px = mt * mt * x0 + 2 * mt * t * cx + t * t * x1;
    const py = mt * mt * y0 + 2 * mt * t * cy + t * t * y1;
    // 切线（贝塞尔导数），用来求法向
    const dx = 2 * mt * (cx - x0) + 2 * t * (x1 - cx);
    const dy = 2 * mt * (cy - y0) + 2 * t * (y1 - cy);
    const d = Math.hypot(dx, dy) || 1;
    const hw = (w0 + (w1 - w0) * t) / 2;
    left.push([px - dy / d * hw, py + dx / d * hw]);
    right.push([px + dy / d * hw, py - dx / d * hw]);
  }
  InkFill(ctx, [...left, ...right.reverse()], id, fill, { amp, lw, shade });
}

// 一团树叶。两头都是坑：起伏太深＝一片枫叶标本；起伏太浅＝一个圆饼。
// 上一版是后者——半径只在 0.90~1.06 之间抖，16 个点连出来就是正圆，
// 几个正圆并排贴上去，远看是西兰花（2026-08-10 用户："树太丑了"）。
// 现在起伏由 lobes 个真正的瓣决定（±20%），再叠一层小抖；墨线抖动量按团的
// 大小走（写死 1.6 的话，大树的团照样光溜溜）。
function LeafClump(ctx, cx, cy, r, id, fill, { line = null, lw = 0, squash = 0.82, lobes = 5 } = {}) {
  const n = 22;
  const ph = Hash(id + "ph") * Math.PI * 2;
  const pts = [];
  for (let a = 0; a < n; a += 1) {
    const ang = (a / n) * Math.PI * 2;
    const lobe = 1 + Math.sin(ang * lobes + ph) * 0.20;
    const rr = r * lobe * (0.92 + Rnd(id, a) * 0.15);
    pts.push([cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr * squash]);
  }
  InkFill(ctx, pts, id + "f", fill, { amp: Math.max(1.2, r * 0.075), lw, line });
}

// 树。**不许再画成棒棒糖**：一根等宽的棍上顶一个绿球，是这版被打回来的样子。
// 树的形是从下往上分出来的——根盘摊在土面上、主干带锥度、到腰上分叉、
// 每根枝的梢上才挂叶团；叶团分前后两层，后层压暗，树冠才有厚度。
export function DrawTree(ctx, x, groundY, id,
  { big = false, night = false, bare = false, stripped = false } = {}) {
  const H = big ? 150 : 104;
  const trunkW = big ? 15 : 9.5;
  const bark = night ? "#3e3427" : "#6b5136";
  const barkDark = night ? "#2e2820" : "#513d29";
  const forkY = groundY - H * 0.44;
  const forkX = x + Sym(id + "lean", 0, H * 0.05);

  // 脚下那圈土：没有它，树就是插在地上的一根柱子（"像被路遮住了一半"正是这么来的）
  ctx.save();
  ctx.globalAlpha = night ? 0.20 : 0.16;
  ctx.fillStyle = "#3a2c1c";
  ctx.beginPath();
  ctx.ellipse(x, groundY - 1, trunkW * 2.6, trunkW * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 根盘：干脚往两边摊开，还有两三条爬出土面的根
  const rw = trunkW * 1.9;
  InkFill(ctx, [
    [x - rw, groundY + 2], [x - rw * 0.6, groundY - 6],
    [x - trunkW * 0.66, groundY - 15], [x + trunkW * 0.66, groundY - 15],
    [x + rw * 0.62, groundY - 5], [x + rw, groundY + 2],
  ], id + "root", bark, { amp: 1.3, lw: 2.2, shade: "rgba(0,0,0,0.20)" });
  for (let i = 0; i < 3; i += 1) {
    const dir = i === 1 ? -1 : 1;
    const reach = rw * (0.9 + Rnd(id + "rt", i) * 0.8) * dir;
    InkLine(ctx, x + reach * 0.35, groundY - 5, x + reach, groundY + 1, id + "rr" + i,
      { lw: 2.6, color: barkDark, amp: 1.1 });
  }

  // 主干：往上收细，略带一道弓
  Limb(ctx, x, groundY - 9, forkX, forkY, trunkW * 1.25, trunkW * 0.72, id + "trunk", bark,
    { bow: Sym(id + "bow", 1, trunkW * 0.8), lw: 2.4, shade: "rgba(0,0,0,0.18)", amp: 0.9 });

  // 1943 春的村里，树是有主的、年年被薅的：
  //  · **树皮被整圈刮去吃掉**，刮到人踮脚够得着的高度（约 1.9m）戛然而止——
  //    那条分界线的高度本身就是这一笔的全部意思（stripped，给榆树）
  //  · 离地两三米以内的枝条年年砍去当柴，主干上只留一排砍平的枝桩截面
  // 2026-08-10 用户退回：「这个树上面是什么鬼」——干上那块**发白的板子**。
  // 两处硬伤，都是坐标算错，不是配色问题：
  //   ① 剥皮区是拿 ±1.1×trunkW 的方框裁的，而**主干半宽只有 0.62×trunkW**
  //      （`Limb` 收的是全宽），于是那块浅色比树干宽出将近一倍，两边直上直下
  //      地支出去——读出来就是一块钉在树上的白木板。
  //   ② 剥到 1.9m（91px）是按真事写的，可小树的分叉才在 0.95m 上，那块浅色
  //      整个盖过分叉爬进树冠里。剥皮只发生在**主干**上，到分叉就该停。
  // 颜色也只许比树皮亮一档：贴图上屏会被整体提亮（见 CanvasTexture 那条），
  // 亮两档的 #a89678 上屏就是纸白。
  const trunkAt = (k) => {
    const kk = Math.max(0, Math.min(1, k));
    return [x + (forkX - x) * kk, (groundY - 9) + (forkY - (groundY - 9)) * kk,
      (trunkW * 1.25 + (trunkW * 0.72 - trunkW * 1.25) * kk) / 2];
  };
  // 剥皮线（stub 的取舍也要用，所以挂在 stripped 外面算）：1.9m 或分叉，谁低取谁
  const stripKCut = Math.max(0.25, Math.min(0.92,
    ((groundY - 9) - Math.max(groundY - 91, forkY + 7)) / ((groundY - 9) - forkY)));
  if (stripped) {
    // 白茬占下半截**整周**：几乎整个干宽，两侧只留一线残皮。首轮退回的病：
    // 白茬只当中一条窄浅带、两侧的深色枝桩楔块读成一排蘑菇。
    const kCut = stripKCut;
    const edgeAt = (k) => {
      const [px, py, hw] = trunkAt(k);
      return [px, py, Math.max(1.2, hw - 0.55)];     // 两侧各只剩 ~1px 残皮
    };
    const L = [], R = [];
    for (let i = 0; i <= 6; i += 1) {
      const [px, py, w2] = edgeAt((i / 6) * kCut);
      L.push([px - w2, py]);
      R.push([px + w2, py]);
    }
    // 上缘发毛：撕皮不是一刀切的，锯齿一口深一口浅
    const [cxT, cyT, wT] = edgeAt(kCut);
    const topJag = [];
    for (let i = 1; i < 6; i += 1) {
      const fx = cxT + wT - (i / 6) * wT * 2;        // 从右往左，接在 R 顶点之后
      topJag.push([fx, cyT + (i % 2 ? 3.0 + Rnd(id + "jg", i) * 3.0 : -(1.6 + Rnd(id + "jg", i) * 2.2))]);
    }
    // 下缘也毛一手：贴着根盘的皮是烂着断的
    const [cxB, cyB, wB2] = edgeAt(0);
    const botJag = [[cxB - wB2 * 0.4, cyB + 2.6], [cxB + wB2 * 0.35, cyB + 1.8]];
    InkFill(ctx, [...botJag, ...R, ...topJag, ...L.slice().reverse()], id + "strip",
      night ? "#5c5240" : "#87693f", { amp: 1.0, lw: 0, line: null });
    // 白茬内两三道纵向浅刮痕：皮是一条条啃刮下去的，痕顺着干走。
    // 只亮一档会被 sRGB 提亮吃平、亮两档整块又成白木板（CanvasTexture 老账），
    // 所以亮的只有这几道窄痕，底下大面留过渡
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = night ? "rgba(148,136,108,0.42)" : "rgba(196,168,120,0.5)";
    for (let i = 0; i < 3; i += 1) {
      const off = -0.42 + i * 0.42 + Sym(id + "scOf", i, 0.08);
      const k0 = 0.05 + Rnd(id + "scA", i) * 0.10;
      const k1 = kCut - 0.06 - Rnd(id + "scB", i) * 0.14;
      const [x0, y0, w0] = edgeAt(k0);
      const [x1, y1, w1] = edgeAt(k1);
      ctx.lineWidth = 1.4 + Rnd(id + "scW", i) * 0.8;
      ctx.beginPath();
      ctx.moveTo(x0 + off * w0, y0);
      ctx.quadraticCurveTo((x0 + x1) / 2 + off * w0 + Sym(id + "scM", i, 1.6), (y0 + y1) / 2,
        x1 + off * w1, y1);
      ctx.stroke();
    }
    ctx.restore();
    // 与残皮的交界描墨线：两侧各一道，白茬才不糊回树干里
    for (const sd of [-1, 1]) {
      const q0 = edgeAt(0.03), q1 = edgeAt(kCut * 0.97);
      InkLine(ctx, q0[0] + sd * q0[2], q0[1], q1[0] + sd * q1[2], q1[1],
        id + "stripEdge" + sd, { lw: 1.2, color: "rgba(30,21,13,0.78)", amp: 1.2 });
    }
    // 上缘交界的墨线：抖动放大，跟着锯齿走
    InkLine(ctx, cxT - wT, cyT + 0.8, cxT + wT, cyT - 0.8, id + "peelEdge",
      { lw: 1.3, color: "rgba(30,21,13,0.78)", amp: 2.6 });
    // 剥口上翘起来的两三根皮毛刺
    for (let i = 0; i < 3; i += 1) {
      const jx = cxT - wT + (0.2 + i * 0.3) * wT * 2;
      InkLine(ctx, jx, cyT + Sym(id + "pk", i, 2.0), jx + 1.6, cyT - 3.4 - Rnd(id + "pk2", i) * 2.4,
        id + "peel" + i, { lw: 1.1, color: barkDark, amp: 0.6 });
    }
    // 裸干上的刀痕斧印：留两道浅的
    for (let i = 0; i < 2; i += 1) {
      const k = 0.16 + Rnd(id + "hk", i) * Math.max(0.1, kCut - 0.3);
      const [hx, hy, hw] = trunkAt(k);
      InkLine(ctx, hx - hw * 0.55, hy, hx + hw * 0.5, hy + Sym(id + "hk2", i, 2.2),
        id + "hack" + i, { lw: 1.1, color: "rgba(58,44,28,0.45)", amp: 0.7 });
    }
  }
  // 砍平的枝桩：0.44H 以下一根活枝都不留，树成了"剃头树"。
  // **桩子要长在树皮上**——原先钉在 ±0.95×trunkW，那是主干半宽的一倍半，
  // 四颗深色椭圆浮在树干外边，看着像钉在干上的一排扣子。
  // 而且光有一枚椭圆还是读成铆钉：得是**探出干外的一小截桩子＋朝外的浅色断面**
  //（2026-08-10 用户："树太丑了"）——年年砍、年年发白的那个砍口。
  for (let i = 0; i < 4; i += 1) {
    const k = 0.14 + i * 0.17 + Rnd(id + "sb", i) * 0.08;
    // 白茬段上不留桩：深色楔块+浅断面骑在浅色白茬上，实拍读成一排蘑菇
    //（首轮退回）。剥皮剥到哪儿，枝桩就只从哪儿往上留
    if (stripped && k < stripKCut + 0.05) continue;
    const [sx0, sy, hw] = trunkAt(k);
    const dir = i % 2 ? 1 : -1;
    const sw = trunkW * (0.24 + Rnd(id + "sw", i) * 0.10);      // 桩子粗细
    const out = trunkW * (0.38 + Rnd(id + "so", i) * 0.26);     // 探出多长
    const bx = sx0 + dir * (hw - 0.6);                          // 桩根落在树皮上
    InkFill(ctx, [
      [bx, sy - sw], [bx + dir * out, sy - sw * 0.72 - 1.2],
      [bx + dir * out, sy + sw * 0.72 - 1.2], [bx, sy + sw],
    ], id + "stub" + i, barkDark, { amp: 0.5, lw: 1.4 });
    // 断面：砍口朝外
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(bx + dir * out, sy - 1.2, 1.5, sw * 0.72, 0, 0, Math.PI * 2);
    ctx.fillStyle = night ? "#6b6252" : "#a8946f";
    ctx.fill();
    ctx.strokeStyle = IN.ink;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.restore();
  }
  // 树皮：顺着干的竖纹，不是横道
  const barkN = big ? 6 : 4;
  const baseY = groundY - 9;
  for (let i = 0; i < barkN; i += 1) {
    const t0 = 0.08 + (i / barkN) * 0.68;
    const off = Sym(id + "bk", i, trunkW * 0.32);
    const At = (t) => [x + (forkX - x) * t + off, baseY + (forkY - baseY) * t];
    const [bx0, by0] = At(t0);
    const [bx1, by1] = At(t0 + 0.17);
    InkLine(ctx, bx0, by0, bx1, by1, id + "bark" + i,
      { lw: 1.1, color: night ? "rgba(20,16,12,0.5)" : "rgba(50,36,24,0.5)", amp: 1.2 });
  }

  // 分枝：从分叉点扇出，梢上留坐标给叶团。
  // 张角/枝长/冠径这三个数是**贴着画布边算过的**（小树 150px 宽、大树 220px），
  // 再放大树冠就要越出画布被切一刀——切掉的那一下比棒棒糖还难看
  const nB = big ? 5 : 4;
  const tips = [];
  for (let i = 0; i < nB; i += 1) {
    // 骨架先按位次定，随机只做微调——全交给随机的话四根枝一样长，
    // 树冠就是一张平顶的饼（老版正是如此）。**中间的枝长、外侧的枝短**，
    // 冠自然拱成圆的；张角也收窄一档，让冠高大于冠宽
    const s = nB === 1 ? 0 : (i / (nB - 1)) * 2 - 1;            // −1..1
    const ang = -Math.PI / 2 + s * 0.62 + Sym(id + "ba", i, 0.18);
    const len = H * (0.40 + (1 - Math.abs(s)) * 0.24 + Rnd(id + "bl", i) * 0.10);
    const tx = forkX + Math.cos(ang) * len;
    const ty = forkY + Math.sin(ang) * len * 0.92;
    Limb(ctx, forkX + Math.cos(ang) * trunkW * 0.25, forkY + trunkW * 0.2, tx, ty,
      trunkW * 0.66, trunkW * 0.18, id + "br" + i, bark,
      { bow: Sym(id + "bb", i, trunkW * 1.1), lw: 1.9, amp: 0.8 });
    tips.push([tx, ty]);
    // 二级小枝：每根主枝再叉一根，冬天（bare）时的剪影全靠它
    const a2 = ang + (i % 2 ? 0.42 : -0.42);
    const l2 = len * 0.42;
    Limb(ctx, forkX + Math.cos(ang) * len * 0.55, forkY + Math.sin(ang) * len * 0.5,
      forkX + Math.cos(ang) * len * 0.55 + Math.cos(a2) * l2,
      forkY + Math.sin(ang) * len * 0.5 + Math.sin(a2) * l2 * 0.92,
      trunkW * 0.3, trunkW * 0.1, id + "bs" + i, barkDark, { lw: 1.4, amp: 0.7 });
  }
  if (bare) return;

  // 叶团：先铺后层（暗、往里收），再压前层（亮）。同一枝上挂两团，错开一点
  const base = night ? PAL.treeDark : PAL.tree;
  const backC = night ? "#2b3826" : "#41542c";
  const litC = night ? "#4a5c3a" : "#78904a";
  const cr = (big ? 26 : 18);
  let cx0 = 0, cy0 = 0;
  for (const [tx, ty] of tips) { cx0 += tx; cy0 += ty; }
  cx0 /= tips.length; cy0 /= tips.length;

  // **不铺整顶的大饼**。老版先画一个盖住全冠、还描了墨边的大椭圆当"冠底"，
  // 那一笔就是"西兰花"的全部来源：轮廓成了一条光滑的圆弧，各枝的团再怎么
  // 错位也只是在这张饼里面挪。现在树冠**由一簇一簇搭起来**——底下一层暗的
  // 只在枝根附近垫着（背光面），轮廓完全交给外圈那几团自己的凹凸，
  // 团与团之间留得出天空，枝梢从缝里穿出去。
  const back = [], front = [];
  for (let i = 0; i < tips.length; i += 1) {
    const [tx0, ty0] = tips[i];
    const tx = tx0 + (cx0 - tx0) * 0.10;
    const ty = ty0 + (cy0 - ty0) * 0.10;
    const r = cr * (0.72 + Rnd(id + "cr", i) * 0.42);
    back.push([tx + Sym(id + "cx", i, r * 0.34), ty + r * 0.34 + Sym(id + "cy", i, r * 0.2), r * 0.92]);
    front.push([tx + Sym(id + "dx", i, r * 0.3), ty - r * 0.20 + Sym(id + "dy", i, r * 0.22), r * 0.84]);
  }
  // 背光层：压在枝根与冠腹，冠有厚度靠它。再沿每根枝的中段补一团——
  // 只在枝梢挂叶，冠底下就空一圈，读成"几团绿浮在树上头"
  for (let i = 0; i < tips.length; i += 1) {
    const [tx, ty] = tips[i];
    const mx = forkX + (tx - forkX) * 0.62, my = forkY + (ty - forkY) * 0.62;
    LeafClump(ctx, mx + Sym(id + "mx", i, cr * 0.3), my + cr * 0.22, cr * (0.52 + Rnd(id + "mr", i) * 0.24),
      id + "km" + i, backC, { lobes: 4 });
  }
  for (let i = 0; i < back.length; i += 1) {
    LeafClump(ctx, back[i][0], back[i][1], back[i][2], id + "kb" + i, backC, { lobes: 4 + (i % 3) });
  }
  // 冠里的枝：**画在两层叶子之间**——盖在暗层上、又被亮层压住，读成"从叶子缝里
  // 透出来的枝"。它以前是最后画的、还朝冠外甩出去二三十像素，压在整顶树冠上头，
  // 就成了"两根杆子插在树上"（2026-08-10：「这个树上面是什么鬼」）。
  // 两条一起才治得住：**夹在两层之间画** ＋ **朝冠心走、长度封在叶团半径以内**
  for (let i = 0; i < tips.length; i += 1) {
    const [tx, ty] = tips[i];
    const inx = cx0 - tx, iny = cy0 - ty;
    const d = Math.hypot(inx, iny) || 1;
    const len = Math.min(cr * 0.7, d * 0.6);
    InkLine(ctx, tx - inx / d * len * 0.2, ty - iny / d * len * 0.2,
      tx + inx / d * len, ty + iny / d * len,
      id + "twig" + i, { lw: 1.2, color: barkDark, amp: 1.2 });
  }
  // 受光层：叶团亮暗交替，外圈那几团把轮廓顶出去
  for (let i = 0; i < front.length; i += 1) {
    LeafClump(ctx, front[i][0], front[i][1], front[i][2], id + "kf" + i, i % 2 ? base : litC,
      { line: "rgba(43,31,22,0.42)", lw: 1.5, lobes: 5 + (i % 2) });
  }
  // 破轮廓的几团小的：挂在冠外沿，专门把那条圆弧咬缺一块
  for (let i = 0; i < tips.length; i += 1) {
    const [tx, ty] = tips[i];
    const a = Math.atan2(ty - cy0, tx - cx0) + Sym(id + "ea", i, 0.5);
    const d = cr * (0.62 + Rnd(id + "ed", i) * 0.5);
    LeafClump(ctx, tx + Math.cos(a) * d, ty + Math.sin(a) * d * 0.8, cr * (0.30 + Rnd(id + "er", i) * 0.22),
      id + "ke" + i, i % 2 ? litC : base, { line: "rgba(43,31,22,0.36)", lw: 1.2, lobes: 4 });
  }
  // 受光的一侧：左上角一道亮边
  for (let i = 0; i < front.length; i += 2) {
    const [fx, fy, fr] = front[i];
    LeafClump(ctx, fx - fr * 0.28, fy - fr * 0.32, fr * 0.44, id + "hl" + i, litC, { lobes: 4 });
  }
  const crownR = cr * 2.2;
  Speckle(ctx, cx0 - crownR, cy0 - crownR * 0.9, crownR * 2, crownR * 1.6, id + "leaf",
    { count: big ? 46 : 30, alpha: 0.12, size: 2.2, color: "#243018" });
}

// 麦秸垛。打完场的麦秸就地堆成垛：烧火、喂牲口、垫圈全指着它，也是村里
// 最好的掩体（第二章躲探照灯就躲在这后头）。春天的垛是**被扒剩下的**——
// 底下一层层薅走引火，所以侧面一定有个掏空的豁口。
//
// 2026-08-10 用户退回上一版：「这一坨黄黄的是什么玩意儿？又丑又不知道是
// 什么用的」。三处病根，逐条治：
//   ① **轮廓像口麻袋**——光溜的直筒身配圆肩，边线干干净净。一垛麦秸的边
//      永远是毛的：现在沿整条轮廓扎出秸秆头（`fringe`），这是"草垛"和
//      "布口袋"最直接、也最便宜的分界线。
//   ② **身上没有层**——垛是一层层码上去再拍实的，横向压层纹是它的纹理。
//      上一版只有 22 根随机小草、透明度还压到 0.44，远看就是一块纯色；
//      而"迎风面"是拿一个矩形硬切出来的，那条笔直的竖边正是麻袋的中缝。
//      现在层纹沿着垛面弧度走，明暗改用横向渐变，没有一条直边。
//   ③ **那个悬在肚子中间的小方块**是压顶杆头吊的石头，可它既没绳也不在
//      垛沿上，读出来就是一块不明所以的补丁。现在石头拴在绳上、垂在垛肩
//      外侧——一眼看得出是"压住不让风掀顶"。
// 另：高度从 1.05×宽 收到 0.70×宽。3.2m 宽的垛原先有 3.4m 高，比 2.3m 的
// 房檐还高一截，一垛草把整面山墙连窗户一起吞掉——用户截图里那"一坨"就是它。
//
// 垛形只有一个来源：半宽剖面 `R(t)`（t=0 贴地、t=1 到顶）。轮廓、层纹、
// 毛边、苫顶、掏口全从它取，改一处形状五处一起跟着走，绝不各画各的。
// raided: 朝路那面被扒开一个大豁口、垛顶塌下去，脚下散一圈碎秸。
export function DrawHaystack(ctx, x, groundY, w, id, { night = false, raided = false } = {}) {
  const W = w, HW = W / 2;
  const H = W * (raided ? 0.62 : 0.86);
  const lee = night ? "#4b4128" : PAL.hay;         // 主色
  const sun = night ? "#574c32" : PAL.hayWind;     // 受光那半边（顶上、朝阳一侧）
  const dark = night ? "#2f2818" : PAL.hayDark;    // 暗部
  const straw = night ? "#6b5f3a" : "#b39c5f";     // 一根根的秸秆（比垛面亮一档）

  // 垛形＝**钟形**：底盘外撇、腰身外鼓、顶上收成圆锥。
  // 上一版做成了直筒加屋檐，于是读成了小屋（门＋屋顶都齐了）。垛没有直边。
  // 被薅过的那一侧底下要**啃进去一块**（`bite`）——真的垛都是从底下抽秸秆
  // 引火的，底盘小、上头外挑，这个内凹本身就说明了"它是干什么用的"。
  const biteSide = Rnd(id + "b", 0) < 0.5 ? -1 : 1;
  const biteDeep = raided ? 0.52 : 0.30;
  const R = (t, side) => {
    const u = Math.max(0, Math.min(1, t));
    const bell = Math.cos(u * Math.PI * 0.5) ** 0.58;          // 钟形剖面
    const crown = 0.10 * Math.max(0, 1 - u * 6);               // 顶不收成针尖
    let r = HW * (bell + crown);
    if (side === biteSide && u < 0.34) {                       // 底下被薅走的那口
      r *= 1 - biteDeep * (1 - u / 0.34) ** 1.4;
    }
    return Math.max(HW * 0.05, r);
  };
  const PY = (t) => groundY - t * H;

  // 轮廓：不规则**不是**交替锯齿（那读成齿轮），而是低频起伏叠一点高频毛刺
  const N = 30;
  const Edge = (i, side) => {
    const t = i / N;
    const wob = Math.sin(t * 7.3 + Hash(id + side) * 6.28) * 0.028 + Sym(id + "e" + side, i, 0.03);
    return [x + side * R(t, side) * (1 + wob), PY(t) + Sym(id + "y" + side, i, 1.1)];
  };
  const lefts = [], rights = [];
  for (let i = 0; i <= N; i += 1) { lefts.push(Edge(i, -1)); rights.push(Edge(i, 1)); }
  const body = [...lefts, ...rights.reverse()];

  InkFill(ctx, body, id, lee, { amp: 1.1, lw: 2, shade: "rgba(58,44,18,0.18)" });

  ctx.save();
  WobblyPath(ctx, body, id, 1.1, true);
  ctx.clip();
  // 明暗：顶上被太阳晒白、根上发暗发霉。用**径向**渐变，横平竖直的分界都会
  // 读成布面的接缝
  const rg = ctx.createRadialGradient(x - HW * 0.3, PY(0.92), HW * 0.12, x, PY(0.2), H * 1.15);
  rg.addColorStop(0, sun);
  rg.addColorStop(0.45, lee);
  rg.addColorStop(1, dark);
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = rg;
  ctx.fillRect(x - HW - 6, PY(1) - 10, W + 12, H + 14);
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = night ? "#241f14" : "#4a3c24";
  ctx.fillRect(x - HW - 6, groundY - 8, W + 12, 10);

  // 垛面上的秸秆。
  // 2026-08-10 用户退回：「这草垛子他妈的像个蠕虫一样」。病根是**那些长笔画**：
  // 每隔十二根压一条 15~25px 的亮直线，方向、位置全是随机的，于是垛面上爬着
  // 二十来条两头圆、比垛面亮一大截的粗白道子——那正是"蛆/蠕虫"的长相。
  // 秸秆在这个景别下（一根秸秆 1~2 厘米＝不到一个像素）本来就**不该看得见
  // 一根一根**，能看见的只有两样东西：
  //   ① **一层层码上去压实的层理**——沿着垛面弧度走的横纹，这是"垛"的读法；
  //   ② 层理之间细碎的短茬，只提供质感，不提供图形。
  // 所以：长笔画整个删掉，短茬压到 1px 以下、透明度砍半、颜色贴着垛面走。
  // ① 层理：七八道顺着剖面走的暗纹，越往上越密（垛是越码越收的）
  ctx.lineWidth = 1.3;
  ctx.lineCap = "butt";
  for (let c = 0; c < 8; c += 1) {
    const t0 = 0.08 + (c / 8) * 0.84;
    ctx.globalAlpha = 0.17 + Rnd(id + "ca", c) * 0.11;
    ctx.strokeStyle = dark;
    ctx.beginPath();
    for (let i = 0; i <= 14; i += 1) {
      const u = i / 14;
      const side = u < 0.5 ? -1 : 1;
      const t = t0 + Math.sin(u * Math.PI) * 0.035;          // 中间鼓一点：面是圆的
      const px = x + (u * 2 - 1) * R(t, side) * 0.98;
      const py = PY(t) + Sym(id + "cy" + c, i, 1.2);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  // ② 短茬：只做质感。长度 2~6px、线宽 0.8、跟着坡朝外下方，颜色贴着垛面
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 190; i += 1) {
    const t = Rnd(id + "st", i) ** 0.8;
    const side = i % 2 ? 1 : -1;
    const rr = R(t, side) * (0.10 + Rnd(id + "sr", i) * 0.92);
    const px = x + side * rr;
    const py = PY(t) + Sym(id + "sy", i, 3);
    const dx = side * (0.45 + t * 0.55);         // 越靠顶越横着铺
    const dy = 0.75 - t * 0.35;
    const len = 2 + Rnd(id + "sl", i) * 4;
    ctx.globalAlpha = 0.10 + Rnd(id + "sa", i) * 0.18;
    ctx.strokeStyle = i % 3 === 0 ? dark : straw;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + dx * len, py + dy * len);
    ctx.stroke();
  }
  ctx.restore();

  // ── 毛边：秸秆头从轮廓上支棱出去。草垛与麻袋的分界，一半在这一笔上 ──
  ctx.save();
  ctx.lineWidth = 1.1;
  const FZ = 150;
  for (let i = 0; i < FZ; i += 1) {
    // 分层取样：每一档高度上左右各来一根。纯随机会扎堆，留下大段光溜的边
    if (Rnd(id + "fk", i) < 0.22) continue;      // 随机漏掉一些：铺太满就成了梳子
    const t = 0.03 + ((i >> 1) + Rnd(id + "fj", i)) / (FZ / 2) * 0.95;
    const side = i % 2 ? 1 : -1;
    const px = x + side * R(t, side);
    const py = PY(t);
    // 法向：沿坡朝外下方（顶上朝外上方一点），跟垛面上的草同一个走向
    const nxv = side * (0.55 + t * 0.45);
    const nyv = 0.62 - t * 1.35;
    const norm = Math.hypot(nxv, nyv) || 1;
    // 长短拉开：等长＝毛刷。但**上限压到 8px**——十几像素的亮秸秆头支出去，
    // 在轮廓外围又是一圈"蠕虫"，和垛面上那些长笔画是同一个病
    const len = 1.5 + Rnd(id + "fl", i) ** 1.6 * 6.5;
    ctx.globalAlpha = 0.3 + Rnd(id + "fa", i) * 0.4;
    ctx.strokeStyle = i % 4 === 0 ? dark : straw;
    ctx.beginPath();
    ctx.moveTo(px - (nxv / norm) * 3, py - (nyv / norm) * 3);
    ctx.lineTo(px + (nxv / norm) * len + Sym(id + "fw", i, 1.6),
      py + (nyv / norm) * len + Sym(id + "fh", i, 1.6));
    ctx.stroke();
  }
  // 被薅过那一侧：上头外挑的一撮垂下来，把"底下被掏空"讲清楚
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = straw;
  for (let i = 0; i < 10; i += 1) {
    const t = 0.30 + Rnd(id + "ov", i) * 0.1;
    const px = x + biteSide * R(t, biteSide) * (0.92 + Rnd(id + "ox", i) * 0.12);
    const py = PY(t);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + biteSide * Rnd(id + "oa", i) * 3, py + 6 + Rnd(id + "ob", i) * 11);
    ctx.stroke();
  }
  ctx.restore();

  // ── 垛顶：拧紧扎住的一撮（防雨），不是屋顶 ──
  const topY = PY(1);
  ctx.save();
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 11; i += 1) {
    // 乱翘的一撮，长短角度都拉开。整齐的扇形会读成一头竖起来的头发
    const a = Sym(id + "ta", i, 1.15);
    const len = 3.5 + Rnd(id + "tl", i) * 5.5;
    const bx = x + Sym(id + "tb", i, HW * 0.2);
    ctx.globalAlpha = 0.5 + Rnd(id + "tc", i) * 0.4;
    ctx.strokeStyle = i % 3 === 0 ? dark : straw;
    ctx.beginPath();
    ctx.moveTo(bx, topY + 4 + Rnd(id + "td", i) * 3);
    ctx.lineTo(bx + Math.sin(a) * len, topY + 3 - Math.cos(a) * len);
    ctx.stroke();
  }
  ctx.restore();

  // 脚下散的碎秸与麦糠——薅下来的那些
  for (let i = 0; i < (raided ? 12 : 7); i += 1) {
    const sx = x - W * 0.62 + Rnd(id + "sc", i) * W * 1.24;
    InkLine(ctx, sx, groundY - 1, sx + Sym(id + "sc2", i, 5), groundY - 2.5,
      id + "chaff" + i, { lw: 1.1, color: "rgba(122,104,60,0.55)", amp: 0.6 });
  }
}

// 水井。**辘轳轴心钉死在 groundY-69px（=WINCH_HUB_Y 1.43m×48）**——摇辘轳那一拍，
// Core 按这个高度算摇把的轴心，World 把会转的摇把贴在同一点上。改这张画的高度，
// 就要同步改 Core 的 WINCH_HUB_Y，否则玩家的手落在轴心外面，转不动。
//
// 上一版是「一个灰梯形 + 一座牌坊」：井台只有 22px 高、没有砌石、没有辘轳鼓，
// 脚下也没有一点湿泥，于是它既不像井，又像被路截了一半。这一版按真物件重排：
// 圆井台（正面砌石 + 椭圆台面 + 黑井口）、两根埋进土里的立柱、柱间一只辘轳鼓、
// 鼓上缠绳、绳垂进井口，脚下压一圈常年泼出来的湿地。
export function DrawWell(ctx, x, groundY, id, { night = false, broken = false, crank = true, rope = true } = {}) {
  // 石头是**暖灰**，不是白瓷：上一版调到 #a8a094，画出来整口井比黄土路还亮，
  // 成了画面里最跳的一块。井是背景，不该抢主角的明度。
  // 注意这套贴图上屏时会被整体提亮（画布贴图没声明 sRGB，见 CanvasTexture），
  // 想要屏幕上一档灰，源色就得比直觉再压两档——#6f685c 上屏约莫是中灰
  // 石头要**发土**，不是发灰：村里的井台是就地捡的料礓石垒的，年年泼水糊泥，
  // 颜色跟脚下的土路是一路的。上一版调成中性灰，上屏读出来像一圈水泥管
  //（用户 2026-08-09："井也太现代了"）
  const stone = night ? "#3f3b33" : "#655a48";
  const stoneLit = night ? "#4f4a41" : "#7a6d57";
  const stoneDark = night ? "#2a2722" : "#453c2e";
  const wood = night ? "#6a4c30" : PAL.wood;
  const woodDark = night ? "#4c3722" : PAL.woodDark;
  // 井台要**高而窄**（0.73m 高、0.5m 半径）：矮而宽 + 一圈大椭圆台面，
  // 画出来是一只洗脸盆，不是一口井
  const CURB = 35;        // 井台高（px）：0.73m，蹲下去打水刚好搭得上手
  const RX = 25;          // 井台半径
  // 辘轳轴心（px，48px/米）。**这个数由"够不着"倒推**：老版 69px（1.43m）比
  // 第一章那个孩子的头顶（1.13m）还高 30 厘米，摇把画的那个圈他一辈子也够不着，
  // 画面上就是"人在旁边空划拉、辘轳自己在转"。45px = 0.9375m，与 Core 的
  // WINCH_HUB_Y 一个数——改这儿必须同时改那儿（还有 WINCH_CRANK_DX/_R）。
  // 这一档同时也是**放得下绳**的下限：井台沿 35px + 鼓半径 6.8px ≈ 42px。
  const HUB = groundY - 45;

  // 常年泼出来的那一圈湿地：井脚有水痕，才不像一块摆在路当中的石头
  ctx.save();
  ctx.globalAlpha = night ? 0.26 : 0.20;
  ctx.fillStyle = "#4a3a24";
  ctx.beginPath();
  ctx.ellipse(x + 2, groundY - 1, RX * 1.75, 9.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = night ? 0.16 : 0.12;
  ctx.beginPath();
  ctx.ellipse(x - RX * 1.1, groundY + 1, 13, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 辘轳架：两根埋进土里的立柱，上头开口卡住轴。**先画柱子再画井台**——
  // 柱子立在井台后侧，反过来画就成了两根挡在井前面的门框
  for (const s of [-1, 1]) {
    const px = x + s * (RX - 1);
    InkFill(ctx, [
      [px - 3.2 - s * 0.6, groundY - 2], [px - 2.8, HUB - 5], [px + 2.8, HUB - 5], [px + 3.2 + s * 0.6, groundY - 2],
    ], id + "post" + s, s < 0 ? wood : woodDark, { amp: 0.9, lw: 2.2, shade: "rgba(0,0,0,0.22)" });
    // 卡轴的凹口
    InkLine(ctx, px - 3, HUB - 3, px + 3, HUB - 3, id + "notch" + s, { lw: 2, color: "rgba(30,22,14,0.7)" });
  }

  // 井台正面（圆台的前半），砌石一层三块、上下错缝
  const curbPts = [
    [x - RX, groundY - 2], [x - RX + 1.5, groundY - CURB],
    [x + RX - 1.5, groundY - CURB], [x + RX, groundY - 2],
  ];
  InkFill(ctx, curbPts, id + "curb", stone, { amp: 0.8, lw: 2.6 });
  // 圆的东西要有圆的明暗：左受光、右背光、根部压暗。
  // 只在右半边糊一块死黑（InkFill 的 shade）读出来是一张对折的纸
  ctx.save();
  WobblyPath(ctx, curbPts, id + "curb", 0.8, true);
  ctx.clip();
  const cyl = ctx.createLinearGradient(x - RX, 0, x + RX, 0);
  cyl.addColorStop(0, "rgba(255,245,220,0.15)");
  cyl.addColorStop(0.34, "rgba(255,245,220,0.03)");
  cyl.addColorStop(0.62, "rgba(0,0,0,0.07)");
  cyl.addColorStop(1, "rgba(0,0,0,0.30)");
  ctx.fillStyle = cyl;
  ctx.fillRect(x - RX - 2, groundY - CURB - 2, RX * 2 + 4, CURB + 4);
  const foot = ctx.createLinearGradient(0, groundY - 13, 0, groundY);
  foot.addColorStop(0, "rgba(0,0,0,0)");
  foot.addColorStop(1, "rgba(30,20,10,0.32)");
  ctx.fillStyle = foot;
  ctx.fillRect(x - RX - 2, groundY - 13, RX * 2 + 4, 15);
  ctx.restore();
  const ROWS = 3;
  const rh = (CURB - 4) / ROWS;
  for (let r = 0; r < ROWS; r += 1) {
    const ry = groundY - 3 - r * rh;
    if (r > 0) InkLine(ctx, x - RX + 2, ry, x + RX - 2, ry, id + "j" + r, { lw: 2.2, color: stoneDark, amp: 1.2 });
    // 一层里码几块**不一样大**的石头：整齐的三块一层是砌出来的，
    // 村里的井台是垒出来的
    const n = 3;
    for (let c = 0; c < n; c += 1) {
      const jx = x - RX + ((c + 0.5 + (r % 2) * 0.5) / n) * RX * 2
        + (Rnd(id + "jw", r * 3 + c) - 0.5) * 7;
      if (jx > x - RX + 4 && jx < x + RX - 4) {
        InkLine(ctx, jx, ry - 1.5, jx, ry - rh + 1.5, id + "v" + r + c, { lw: 2, color: stoneDark, amp: 1.6 });
      }
    }
  }
  Speckle(ctx, x - RX, groundY - CURB, RX * 2, CURB, id + "sp", { count: 24, alpha: 0.12, size: 2 });

  // 台面：一圈磨光的石沿
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, groundY - CURB, RX, 6.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = stoneLit;
  ctx.fill();
  ctx.strokeStyle = IN.ink;
  ctx.lineWidth = 2.6;
  ctx.stroke();
  ctx.restore();
  // 井口：黑，永远看不到底。口不能开太大——满面的黑会读成一口锅
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, groundY - CURB + 0.8, RX - 11, 3.6, 0, 0, Math.PI * 2);
  ctx.fillStyle = night ? "#0e0c0a" : "#1b1611";
  ctx.fill();
  ctx.strokeStyle = "rgba(20,15,10,0.85)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  // 井绳在石沿上磨出来的槽：一口用了几十年的井该有的痕
  for (let i = 0; i < 2; i += 1) {
    InkLine(ctx, x - 5 + i * 10, groundY - CURB - 3.5, x - 5 + i * 10, groundY - CURB + 2,
      id + "wear" + i, { lw: 1.5, color: "rgba(60,50,40,0.45)", amp: 0.4 });
  }

  // 辘轳鼓：一段圆木。两头各一枚端面椭圆才读得出"圆"，两道铁箍箍住，
  // 中段缠着井绳（绳圈只缠中间那一段——缠满全长就成了一架木琴）
  const DR = 6.8, DL = 18;
  InkFill(ctx, [
    [x - DL, HUB - DR], [x + DL, HUB - DR], [x + DL, HUB + DR], [x - DL, HUB + DR],
  ], id + "drum", wood, { amp: 0.6, lw: 2.4, shade: "rgba(0,0,0,0.24)" });
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x + s * DL, HUB, 3.2, DR, 0, 0, Math.PI * 2);
    ctx.fillStyle = s > 0 ? wood : woodDark;
    ctx.fill();
    ctx.strokeStyle = IN.ink;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    InkLine(ctx, x + s * 12, HUB - DR, x + s * 12, HUB + DR, id + "hoop" + s,
      { lw: 1.8, color: night ? "#33302c" : "#4c463c", amp: 0.3 });
  }
  ctx.save();
  ctx.globalAlpha = 0.8;
  for (let i = 0; i < 5; i += 1) {
    InkLine(ctx, x - 7 + i * 3.4, HUB - DR + 0.8, x - 7 + i * 3.4, HUB + DR - 0.8, id + "coil" + i,
      { lw: 1.7, color: "#8a7350", amp: 0.3 });
  }
  ctx.restore();

  // 摇把：轴销 + 一段柄臂 + 一节握手，钉在**西端面**上——摇的人站在井台西侧，
  // 摇把长在他够得着的那一头（老版钉在东端，人在西边够不着）。柄长 5.8px＝
  // Core 的 WINCH_CRANK_R 0.12m；轴销偏移 −21px ＝ WINCH_CRANK_DX −0.44m。
  // 摇辘轳那一拍由 World 换上会转的那只，这里就不画了（两只摇把会叉在同一根轴上）
  if (crank) {
    const px = x - DL - 3;          // 轴销 −21px ≈ WINCH_CRANK_DX
    InkLine(ctx, px, HUB, px - 4.5, HUB + 3.6, id + "arm", { lw: 5.2, color: IN.ink, amp: 0.2 });
    InkLine(ctx, px, HUB, px - 4.5, HUB + 3.6, id + "arm2", { lw: 3.2, color: woodDark, amp: 0.2 });
    InkLine(ctx, px - 4.5, HUB + 0.6, px - 4.5, HUB + 8, id + "grip0", { lw: 6.4, color: IN.ink, amp: 0.2 });
    InkLine(ctx, px - 4.5, HUB + 0.6, px - 4.5, HUB + 8, id + "grip", { lw: 4.2, color: wood, amp: 0.2 });
    ctx.beginPath();
    ctx.arc(px, HUB, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = night ? "#3a3a3c" : "#5c5a56";
    ctx.fill();
  }

  // 井绳：从鼓上垂下去，钻进井口的黑里。断了的话只剩一截毛茬朝下的绳头
  if (broken) {
    InkLine(ctx, x - 2, HUB + 7, x - 3, groundY - CURB - 16, id + "stub",
      { lw: 2.6, color: "#9a7d4f", amp: 1.4 });
    for (let i = 0; i < 3; i += 1) {
      InkLine(ctx, x - 3, groundY - CURB - 16, x - 6 + i * 3.2, groundY - CURB - 9 - (i % 2) * 2,
        id + "fray" + i, { lw: 1.4, color: "#8a6a45" });
    }
  } else if (rope) {
    // 打水那一拍 World 会挂一根**活的**井绳（跟着桶升降、跟着桶歪），
    // 这根静态的就得让位（rope:false）——否则井口里会多出一根不动的绳
    InkLine(ctx, x - 2, HUB + 6, x - 2, groundY - CURB + 1, id + "rope",
      { lw: 1.7, color: "#6f5c3d", amp: 1 });
  }
}

// 井筒剖面——**只有小窗那台相机看得见它**（World 把它单独放在 PIP_LAYER 上）。
//
// 来历值得写死：主相机看不到地平线以下（画面底下永远压着一条近景地面带，
// 见 CLAUDE.md），所以桶一沉过井口沿就没影了，四道手里有两道半在看不见的地方
// 发生。用户 2026-08-10 出的主意：「你可以用边上的特殊照片模式去渲染呀 /
// 顺便也作为一个提示不是蛮好的」——小窗是**第二台相机**，它架在那条地面带
// 后头、井筒里头，于是井底那点事有地方演，而且顺带把「墩桶」教会了：
// 玩家看见空桶口朝上浮着，就明白为什么得墩，一句说明都不用。
//
// 画法照「剖面上掏出来的洞」那三条（同 CLAUDE.md）：
//   ① 形状要像人挖的——两壁一层层起伏，不是 fillRect 的笔直两条边；
//   ② 洞沿的墨线一处不能少，缺了就读成"贴图破了"；
//   ③ 掏开之后后面得有东西填着——湿料礓石砌的井壁，越往下越黑，底下一汪水。
// 水面上那道亮是全作的题眼：日头从井口漏下去，只在最深处剩这么一条。
//
// **颜色要压到近乎全黑**：画布贴图没声明 sRGB，上屏会被整体提亮一大截，
// 源色 #2f 读出来是 #78 的中灰——一口"灰扑扑的水泥管"。下面这几个数看着
// 几乎全黑，上屏才刚好是井筒该有的暗。
//
// 传进来的是画布像素：x=井心，topY=井口沿，waterY=水面，botY=画到多深为止。
export function DrawWellShaft(ctx, x, topY, waterY, botY, id, { night = false } = {}) {
  const RX = 26;              // 井筒内壁半宽
  const dark = night ? "#020202" : "#040302";
  const stone = night ? "#080706" : "#0c0a07";
  const stoneLit = night ? "#131009" : "#1c170f";

  // 两壁：一层层往里外错——井是一镐一镐掏出来的，不是钻出来的
  const ROWS = Math.max(8, Math.round((botY - topY) / 16));
  const wall = (s) => {
    const pts = [];
    for (let i = 0; i <= ROWS; i += 1) {
      const y = topY + ((botY - topY) * i) / ROWS;
      pts.push([x + s * (RX + Sym(id + "w" + s, i, 3.4)), y]);
    }
    return pts;
  };
  const left = wall(-1), right = wall(1);

  // 洞外那圈土（小窗里能瞥见一点边）：不留白边，也别抢井筒
  ctx.save();
  ctx.fillStyle = night ? "#080604" : "#0d0a06";
  ctx.fillRect(x - RX * 3, topY - 20, RX * 6, botY - topY + 60);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (const p of left) ctx.lineTo(p[0], p[1]);
  for (let i = right.length - 1; i >= 0; i -= 1) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  ctx.clip();
  // 后壁：砌石。日头只照得进井口那一截，往下一层比一层黑
  ctx.fillStyle = dark;
  ctx.fillRect(x - RX - 6, topY, RX * 2 + 12, botY - topY);
  for (let r = 0; r < ROWS; r += 1) {
    const y0 = topY + ((botY - topY) * r) / ROWS;
    const y1 = topY + ((botY - topY) * (r + 1)) / ROWS;
    if (y0 > waterY) break;
    const k = Math.exp(-(y0 - topY) / Math.max(1, (waterY - topY) * 0.45));   // 光衰
    ctx.globalAlpha = 0.28 + 0.72 * k;
    ctx.fillStyle = r % 2 ? stone : stoneLit;
    ctx.fillRect(x - RX - 6, y0, RX * 2 + 12, y1 - y0 + 0.6);
    ctx.globalAlpha = 0.35 + 0.4 * k;
    InkLine(ctx, x - RX - 5, y1, x + RX + 5, y1, id + "course" + r,
      { lw: 1.6, color: "rgba(10,8,5,0.95)", amp: 1.3 });
    for (let c = 0; c < 2; c += 1) {
      const jx = x - RX + ((c + 0.5 + (r % 2) * 0.5) / 2) * RX * 2 + Sym(id + "jx", r * 2 + c, 6);
      InkLine(ctx, jx, y0 + 1, jx, y1 - 1, id + "jv" + r + c,
        { lw: 1.3, color: "rgba(10,8,5,0.8)", amp: 1.4 });
    }
  }
  ctx.globalAlpha = 1;
  // 贴近水面的一段常年是湿的：发黑、挂青苔
  const wetTop = waterY - 34;
  const wet = ctx.createLinearGradient(0, wetTop, 0, waterY);
  wet.addColorStop(0, "rgba(2,4,3,0)");
  wet.addColorStop(1, "rgba(2,4,3,0.92)");
  ctx.fillStyle = wet;
  ctx.fillRect(x - RX - 6, wetTop, RX * 2 + 12, waterY - wetTop);

  // 水。井水是黑的，只有正对井口那一条被日头点亮——这一笔是这口井的题眼
  ctx.fillStyle = night ? "#010202" : "#020403";
  ctx.fillRect(x - RX - 6, waterY, RX * 2 + 12, botY - waterY + 6);
  ctx.save();
  ctx.globalAlpha = night ? 0.26 : 0.52;
  ctx.fillStyle = night ? "#39424b" : "#7e8a74";
  ctx.beginPath();
  ctx.ellipse(x, waterY + 1.5, RX - 3, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  for (let i = 0; i < 3; i += 1) {
    InkLine(ctx, x - RX + 4, waterY + 7 + i * 6, x + RX - 4, waterY + 7 + i * 6,
      id + "ripple" + i, { lw: 1.1, color: `rgba(150,168,150,${0.15 - i * 0.04})`, amp: 1 });
  }
  ctx.restore();

  // 洞沿的墨线：两壁各一条，缺了就读成贴图被裁掉的直边
  for (const side of [left, right]) {
    for (let i = 0; i < side.length - 1; i += 1) {
      InkLine(ctx, side[i][0], side[i][1], side[i + 1][0], side[i + 1][1],
        id + "edge" + (side === left ? "L" : "R") + i,
        { lw: 2.3, color: "rgba(18,13,8,0.92)", amp: 0.6 });
    }
  }
  // 从井口漏进来的那点天光
  ctx.save();
  const lit = ctx.createLinearGradient(0, topY, 0, topY + 46);
  lit.addColorStop(0, night ? "rgba(150,168,190,0.13)" : "rgba(240,232,200,0.17)");
  lit.addColorStop(1, "rgba(240,232,200,0)");
  ctx.fillStyle = lit;
  ctx.fillRect(x - RX + 2, topY, RX * 2 - 4, 46);
  ctx.restore();
}

// 碾盘：石头**要发土不要发灰**（跟井台一个规矩）。台面是手錾出来的多边形，
// 不是 ctx.ellipse 的完美圆；磨齿是四组平行的剔沟，不是六根从圆心均分的
// 放射线——那是齿轮不是磨齿。旁边压一根碾棍。
export function DrawMillstone(ctx, x, groundY, id) {
  InkFill(ctx, [[x - 30, groundY], [x - 27, groundY - 15], [x + 27, groundY - 15], [x + 30, groundY]],
    id, "#6b6252", { amp: 1.6, lw: 2.6, shade: "rgba(0,0,0,0.20)" });
  // 台面：16 点手錾多边形，边缘啃出两个缺口
  const rim = [];
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    const chip = (i === 3 || i === 11) ? 0.86 : 1;
    rim.push([x + Math.cos(a) * 27 * chip * (0.97 + Rnd(id + "rm", i) * 0.06),
      groundY - 15 + Math.sin(a) * 6.5 * chip]);
  }
  InkFill(ctx, rim, id + "top", "#7a7061", { amp: 1.0, lw: 2.2, shade: "rgba(0,0,0,0.14)" });
  // 磨眼
  ctx.beginPath();
  ctx.ellipse(x, groundY - 16, 5, 2.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#3a3229";
  ctx.fill();
  // 磨齿：四组平行剔沟，组间转 30~40°
  for (let g = 0; g < 4; g += 1) {
    const a = g * 0.62 + 0.2;
    const nx = Math.cos(a), ny = Math.sin(a) * 0.24;
    for (let k = -2; k <= 2; k += 1) {
      const ox = -ny * k * 5.5, oy = nx * k * 1.5;
      InkLine(ctx, x + ox - nx * 20, groundY - 15.5 + oy - ny * 20,
        x + ox + nx * 20, groundY - 15.5 + oy + ny * 20, id + "t" + g + k,
        { lw: 0.9, color: "rgba(58,50,40,0.5)", amp: 0.5 });
    }
  }
  // 碾棍斜靠在盘沿上
  InkLine(ctx, x + 24, groundY - 2, x + 4, groundY - 26, id + "stick",
    { lw: 3, color: PAL.woodOld, amp: 1.0 });
}

// 村街上的土坯墙段。**墙头绝不许是一条水平线**，夯土层理也不是每 11px
// 一根贯通全宽的横线（那是护墙板/混凝土浇筑分层）——一律走 WeatherAdobe。
export function DrawWall(ctx, x, groundY, w, h, id, { burnt = false } = {}) {
  const top = RaggedTop(x - w / 2, x + w / 2, groundY - h, id + "top",
    { sag: 4.5, n: 9, tiltR: Sym(id + "tl", 0, 5) });
  InkFill(ctx, top.concat([[x + w / 2, groundY], [x - w / 2, groundY]]), id,
    burnt ? PAL.burnt : "#8e7f61", { amp: 1.8, lw: 2.4, shade: "rgba(74,56,42,0.22)" });
  if (!burnt) WeatherAdobe(ctx, x - w / 2, groundY - h, w, h, id + "wa", { course: 12, gullies: 4, cracks: 2 });
  Speckle(ctx, x - w / 2, groundY - h, w, h, id + "sp", { count: 16, alpha: 0.12 });
  // 墙根：塌下来的碎土坯壅在脚下，两头淌开——没有这一堆，断墙就是一块
  // 悬着的白纸板；断墙的"断"也正是从墙根的碎处读出来的
  InkFill(ctx, [
    [x - w / 2 - 9, groundY], [x - w / 2 - 3, groundY - 6 - Rnd(id + "fL", 1) * 4],
    [x - w * 0.24, groundY - 9 - Rnd(id + "fM", 2) * 4], [x + w * 0.2, groundY - 8],
    [x + w / 2 + 2, groundY - 5 - Rnd(id + "fR", 3) * 4], [x + w / 2 + 9, groundY],
  ], id + "foot", burnt ? "#4a4038" : "#7d6c50", { amp: 1.6, lw: 1.8, shade: "rgba(0,0,0,0.18)" });
  for (let i = 0; i < 4; i += 1) {
    const bx = x - w / 2 + 4 + Rnd(id + "brk", i) * (w - 14);
    InkFill(ctx, Rect(bx, groundY - 5 - Rnd(id + "brk2", i) * 4, 9, 5), id + "brick" + i,
      burnt ? "#3c342c" : "#6f6047", { amp: 0.8, lw: 1.2 });
  }
  // 墙头草
  for (let i = 0; i < 4; i += 1) {
    const gx = x - w / 2 + 6 + Rnd(id, i) * (w - 12);
    InkLine(ctx, gx, groundY - h, gx + Sym(id, i + 5, 4), groundY - h - 7 - Rnd(id, i + 9) * 5,
      id + "g" + i, { lw: 1.2, color: burnt ? "#5a5348" : "#6b7040" });
  }
}

// 邻家院墙：土坯墙 + 荆条柴门，墙头压谷草。
// **两段墙不许一样高、顶边不许在同一条水平线上**——1943 年冀中的院墙很多
// 已经拆了半截或塌了口；压顶草是一根根的草秆不是一根深色横条；柴门要透光
//（实心填充读成木板门，那是像样人家）。
// 墙上的标语：宣抚班拿石灰水刷的大字。
//
// 三条史实规矩，配错就是年代穿帮：
//   ① **横写自右向左**——1942 年没有横排左起（那是 1955-56 年以后的事）。
//      所以字要倒着码：第一个字在最右边。
//   ② **繁体**。简化字方案是 1956 年的。
//   ③ **是刷的不是印的**：石灰水调得稀，笔画边缘发毛、往下淌，刷子提按不匀，
//      墙面的坑洼会吃掉一块笔画。所以不能用整齐的 fillText 了事。
//
// ghost=true 是被白灰盖过的旧标语（抗日的口号被宣抚班刷掉）——只剩透出来的
// 影子。这一笔比标语本身更说明问题：墙面上压着两层字，谁来过都写在上头。
// 画法见 DrawWashedSlogan：**顺序就是这件事本身**，先有字后有灰。
// 被石灰水刷掉的旧标语。**画的顺序就是这件事本身**：先有字，后有人拿刷子盖。
//
// 老版是反的——先铺一块四边笔直的浅色方块，再把字画在方块上面。出来的东西
// 是「一条白布横幅上印着字」，跟"被擦掉"半点关系没有（2026-08-10 用户：
// 「这鬼设计一点都不像是被擦掉了」）。
//
// 现在四步，每一步对应现实里的一下动作：
//   ① 旧字先写在墙上——锅烟灰调的黑，笔画是刷的、有飞白；
//   ② 石灰水**一刷子一刷子横着扫过去**盖住它。每一刷两头收尖（刷子提起来）、
//      上下沿发毛，几刷叠出来的外形四条边都不齐——这是"没有直边"的来源；
//   ③ 刷得薄的地方旧字自己就透出来了，不用另画一层"影子"；
//   ④ 石灰水调得稀，边上必淌。
function DrawWashedSlogan(ctx, x, y, chars, size, gap, id) {
  const n = chars.length;
  const bw = gap * n + size * 0.5;
  // ① 旧字：写在墙上的黑字
  ctx.font = `700 ${size}px 'Noto Serif SC', serif`;
  for (let i = 0; i < n; i += 1) {
    const cx = x + (n - 1) / 2 * gap - i * gap;
    const jx = Sym(id + "ox", i, size * 0.06);
    const jy = Sym(id + "oy", i, size * 0.055);
    // 字要压得够黑才盖得住：CanvasTexture 没声明 sRGB，全场上屏亮两档
    //（见 CLAUDE.md 配色那条），按纸面挑的灰到了屏幕上就没了
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = "#3a2d21";
    ctx.fillText(chars[i], cx + jx, y + jy + size * 0.05);   // 洇开的一层
    ctx.globalAlpha = 0.86;
    ctx.fillStyle = "#241b13";
    ctx.fillText(chars[i], cx + jx, y + jy);
  }
  ctx.globalAlpha = 1;
  // ② 石灰水：横着扫过去的几刷
  const strokes = 6;
  for (let s = 0; s < strokes; s += 1) {
    const sy = y - size * 0.74 + (s / (strokes - 1)) * size * 1.48;
    const h0 = size * (0.30 + Rnd(id + "sh", s) * 0.18);
    // 每一刷的两头**只许往外探、探多远各不相同**：都停在同一条竖线上就又叠成
    // 方块了；可要是允许往里缩，一边的字会整个露在灰外头，成了"刷歪了"
    const x0 = x - bw / 2 - size * (0.1 + Rnd(id + "sa", s) * 1.1);
    const x1 = x + bw / 2 + size * (0.1 + Rnd(id + "sb", s) * 1.1);
    const N = 12;
    const pts = [];
    // 两头收尖：h 随位置从 0.22 涨到 1 再落回去，刷子起落的形状
    const hAt = (t) => h0 * (0.22 + 0.78 * Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ** 0.6);
    for (let k = 0; k <= N; k += 1) {
      const t = k / N;
      pts.push([x0 + (x1 - x0) * t, sy - hAt(t) * 0.5 + Sym(id + "u" + s, k, h0 * 0.3)]);
    }
    for (let k = N; k >= 0; k -= 1) {
      const t = k / N;
      pts.push([x0 + (x1 - x0) * t, sy + hAt(t) * 0.5 + Sym(id + "d" + s, k, h0 * 0.3)]);
    }
    ctx.globalAlpha = 0.40 + Rnd(id + "sv", s) * 0.36;
    InkFill(ctx, pts, id + "wash" + s, "#cbbc9e", { amp: 1.0, lw: 0, line: null });
  }
  // 补两下短的：刷子折回来盖没盖严的地方，轮廓再啃缺一块
  for (let s = 0; s < 3; s += 1) {
    const cxs = x + Sym(id + "px", s, bw * 0.34);
    const w2 = bw * (0.16 + Rnd(id + "pw", s) * 0.2);
    const sy = y + Sym(id + "py", s, size * 0.62);
    const h2 = size * (0.22 + Rnd(id + "ph", s) * 0.14);
    ctx.globalAlpha = 0.34 + Rnd(id + "pv", s) * 0.3;
    InkFill(ctx, [
      [cxs - w2, sy], [cxs - w2 * 0.5, sy - h2 * 0.6], [cxs + w2 * 0.6, sy - h2 * 0.5],
      [cxs + w2, sy + h2 * 0.2], [cxs + w2 * 0.3, sy + h2 * 0.6], [cxs - w2 * 0.6, sy + h2 * 0.5],
    ], id + "patch" + s, "#c6b697", { amp: 1.4, lw: 0, line: null });
  }
  ctx.globalAlpha = 1;
  // ④ 往下淌的几道
  for (let s = 0; s < 4; s += 1) {
    const dx = x + Sym(id + "dx", s, bw * 0.42);
    const dy0 = y + size * (0.62 + Rnd(id + "dy", s) * 0.2);
    InkLine(ctx, dx, dy0, dx + Sym(id + "dw", s, size * 0.06), dy0 + size * (0.3 + Rnd(id + "dl", s) * 0.8),
      id + "drip" + s, { lw: size * (0.04 + Rnd(id + "dt", s) * 0.05), color: "rgba(203,188,158,0.5)", amp: 0.5 });
  }
}

export function DrawWallSlogan(ctx, x, y, chars, size, id, { ghost = false, tone = "lime", wall = PAL.adobe } = {}) {
  const n = chars.length;
  const gap = size * 1.22;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (ghost) { DrawWashedSlogan(ctx, x, y, chars, size, gap, id); ctx.restore(); return; }
  for (let i = 0; i < n; i += 1) {
    // 倒着码：i=0 那个字落在最右边
    const cx = x + (n - 1) / 2 * gap - i * gap;
    const jx = Sym(id + "jx", i, size * 0.055);
    const jy = Sym(id + "jy", i, size * 0.05);
    ctx.font = `700 ${size}px 'Noto Serif SC', serif`;
    // 石灰水：先一层稀的往下洇，再压一遍笔画
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = tone === "ink" ? "#3a2f22" : "#d9cdb0";
    ctx.fillText(chars[i], cx + jx, y + jy + size * 0.07);
    ctx.globalAlpha = tone === "ink" ? 0.72 : 0.52;
    ctx.fillText(chars[i], cx + jx, y + jy);
    ctx.globalAlpha = 1;
    // 墙面坑洼吃掉的缺口：拿墙色把两三小块笔画盖回去，字才像刷在土墙上而不是
    // 贴上去的。**不许用 destination-out**——这张画布上除了字还有整面墙，
    // 抠出来的是穿透墙体的洞，背后是天，白天看是几个亮点、夜里是几个黑点
    ctx.save();
    for (let k = 0; k < 5; k += 1) {
      const px = cx + Sym(id + "gx" + i, k, size * 0.36);
      const py = y + Sym(id + "gy" + i, k, size * 0.36);
      const r = size * (0.06 + Rnd(id + "gr" + i, k) * 0.13);
      ctx.globalAlpha = 0.5 + Rnd(id + "ga" + i, k) * 0.4;
      ctx.fillStyle = wall;
      ctx.beginPath(); ctx.ellipse(px, py, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // 往下淌的两道流痕（石灰水调稀了必淌）
    if (Rnd(id + "drip", i) > 0.45) {
      InkLine(ctx, cx + jx - size * 0.16, y + size * 0.34,
        cx + jx - size * 0.16, y + size * (0.5 + Rnd(id + "dl", i) * 0.55),
        id + "dp" + i, { lw: size * 0.045, color: "rgba(239,230,210,0.45)", amp: 0.6 });
    }
  }
  ctx.restore();
}

export function DrawYardWall(ctx, x, groundY, w, id, { gate = true, slogan = null } = {}) {
  const gw = gate ? 34 : 0;
  const seg = (x0, x1, H, notch) => {
    const top = RaggedTop(x0, x1, groundY - H, id + "t" + x0, { sag: 4, n: 8 });
    if (notch) {           // 塌下去一个缺口
      const k = Math.floor(top.length * 0.55);
      top[k][1] += 12; top[k - 1][1] += 7; top[k + 1] && (top[k + 1][1] += 6);
    }
    InkFill(ctx, top.concat([[x1, groundY], [x0, groundY]]), id + "w" + x0, "#8f7d5d",
      { amp: 1.8, lw: 2.2, shade: "rgba(74,56,42,0.20)" });
    WeatherAdobe(ctx, x0, groundY - H, x1 - x0, H, id + "wa" + x0,
      { course: 12, gullies: 3, cracks: 2, patches: 2 });
    // 墙头苫的谷草。
    // 2026-08-10 用户退回：「这个顶上我都不知道是什么玩意儿 一块块的」。
    // 老画法是**每 5px 描一个 6px 宽、5~12px 高的独立四边形**，每块自带墨线，
    // 于是墙头上立着一排彼此分家的深色小板子——那不是苫草，那是一排牌位。
    // 苫草是**一整领草压在墙头上**：轮廓连着走、只有厚薄起伏，草秆细而碎，
    // 而且它得**贴着墙头这条不平的线**走（墙头本来就是中段下坠的）。
    const capTopY = (px) => {                 // 墙头那条线在 px 处的高度
      const t = Math.max(0, Math.min(1, (px - x0) / Math.max(1, x1 - x0)));
      const f = t * (top.length - 1);
      const i0 = Math.min(top.length - 2, Math.floor(f));
      const k = f - i0;
      return top[i0][1] + (top[i0 + 1][1] - top[i0][1]) * k;
    };
    // 中间薅薄一段（露出光墙头）——**用厚度收到零来做，不许真断开**：
    // 断成两截，每截都自带一圈墨线，读出来就是墙头上扣着两顶帽子
    const capL = x0 - 1, capR = x1 + 1;
    const bald = (x0 + x1) / 2 + Sym(id + "bd" + x0, 0, 8);
    const seed = Hash(id + "cph" + x0) * 6.28;
    const Thick = (px) => {
      const worn = Math.max(0, 1 - ((px - bald) / 13) ** 2);      // 薅薄的那一段
      return Math.max(0, (5.4 + Math.sin(px * 0.07 + seed) * 1.8) * (1 - worn * 0.92));
    };
    const lower = [], upper = [];
    const n2 = Math.max(10, Math.round((capR - capL) / 3.5));
    for (let i = 0; i <= n2; i += 1) {
      const px = capL + ((capR - capL) * i) / n2;
      const base = capTopY(px);
      // 上沿必须是**毛**的：隔一点扎出去一截，草与瓦的分界全在这条边上
      const burr = (i % 2 ? 1.7 : 0) + Rnd(id + "cpt" + x0, i) * 2.0;
      lower.push([px, base + 2.5]);
      upper.push([px, base - Thick(px) - (Thick(px) > 1 ? burr : 0)]);
    }
    InkFill(ctx, lower.concat(upper.reverse()), id + "cap" + x0,
      "#7a6738", { amp: 0.9, lw: 1.2, line: IN.inkSoft, shade: "rgba(50,38,18,0.22)" });
    // 草茬：顺着苫的方向斜铺在草脊上，让那条带子里头有东西
    ctx.save();
    ctx.lineWidth = 0.9;
    for (let i = 0; i < Math.round((capR - capL) / 3); i += 1) {
      const px = capL + 2 + Rnd(id + "cw" + x0, i) * (capR - capL - 4);
      const th = Thick(px);
      if (th < 1.5) continue;
      const py = capTopY(px) - th * (0.15 + Rnd(id + "cv" + x0, i) * 0.7);
      ctx.globalAlpha = 0.25 + Rnd(id + "ca" + x0, i) * 0.3;
      ctx.strokeStyle = i % 3 === 0 ? "#5c4d28" : "#95855a";
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + (i % 2 ? 4 : -4), py + 1.6);
      ctx.stroke();
    }
    ctx.restore();
    // 檐口垂下来的几绺：草是搭在墙头上的，两边总要耷拉下来一点
    for (let i = 0; i < 4; i += 1) {
      const px = capL + 4 + Rnd(id + "dg" + x0, i) * (capR - capL - 8);
      if (Thick(px) < 2) continue;
      const py = capTopY(px) + 2;
      InkLine(ctx, px, py, px + Sym(id + "dg2" + x0, i, 2.5), py + 4 + Rnd(id + "dg3" + x0, i) * 7,
        id + "drp" + x0 + i, { lw: 1.1, color: "#7d6c44", amp: 1.2 });
    }
    // 墙根壅土
    InkFill(ctx, [[x0 - 4, groundY], [x0 + 2, groundY - 5], [(x0 + x1) / 2, groundY - 7],
      [x1 - 2, groundY - 5], [x1 + 4, groundY]], id + "ft" + x0, "#7d6c50", { amp: 1.4, lw: 1.4 });
  };
  seg(x - w / 2, gate ? x - gw / 2 : x + w / 2, 68, false);
  if (gate) {
    seg(x + gw / 2, x + w / 2, 58, true);
    // 柴门：荆条编的，**条与条之间要透出后面院子的暗**
    InkFill(ctx, Rect(x - gw / 2 + 2, groundY - 56, gw - 4, 56), id + "gateBack", "#3a2f22",
      { amp: 1.2, lw: 1.8 });
    for (let i = 0; i < 8; i += 1) {
      const gx2 = x - gw / 2 + 4 + i * ((gw - 8) / 7);
      InkLine(ctx, gx2, groundY - 55, gx2 + Sym(id + "gv", i, 1.6), groundY - 1,
        id + "gv" + i, { lw: 2.2, color: "#6b5436", amp: 1.2 });
    }
    for (let i = 0; i < 3; i += 1) {
      InkLine(ctx, x - gw / 2 + 3, groundY - 46 + i * 17, x + gw / 2 - 3, groundY - 50 + i * 17,
        id + "gh" + i, { lw: 1.6, color: "#5c4830", amp: 1.4 });
    }
    InkLine(ctx, x - gw / 2 + 2, groundY - 56, x - gw / 2 + 2, groundY, id + "hinge", { lw: 2.2, color: IN.ink });
  }
  // 石灰标语刷在门那一侧的整墙上（有门的话左半堵最长，字才排得开）
  if (slogan) {
    const segX = gate ? (x - w / 2 + (x - gw / 2)) / 2 : x;
    const segW = gate ? (x - gw / 2) - (x - w / 2) : w;
    const size = Math.min(26, segW * 0.72 / (slogan.text.length * 1.22));
    DrawWallSlogan(ctx, segX, groundY - 40, slogan.text, size, id + "sl", slogan);
  }
}

/**
 * 院墙的**东山头**：墙到这儿到头，拐个直角往院里去。
 *
 * 这一件是为「躲在墙后头」画的（车铃那一拍）。横版里"藏"只有一条读法：
 * **有一坨挡得住人的东西，横在你和危险中间**。原来那儿只有一堵 building 带
 * 的背景院墙（z=−3.4，画得又小又淡，还在人**背后**），于是两个孩子看着就是
 * 大白天杵在伪军跟前——用户退回的正是这个。
 *
 * 所以这件东西有三条硬指标，改画法时一条都不能丢：
 *  ① **高过人**：柱子 1.38m，墙头 2.0m 上下——站着也挡得住，不是"蹲下才行"；
 *  ② **拐角要看得出来**：正面（朝街那面）是墙头，西边接着往院里去的那一段
 *     **短、暗、往回收**——这道暗面就是墙根阴影的由头，两个孩子贴的就是它；
 *  ③ **实**：色号往下压两档（CanvasTexture 上屏提亮），淡了就又成了一张纸片。
 *
 * @param w 朝街那面的宽（画布像素），@param h 墙头高（画布像素）
 */
/**
 * **齐胸的土坯院墙（前景挡人的那一种）** —— 勇敢的心式的藏身处。
 *
 * 2026-08-14 用户第二轮退回：「勇敢的心里面就是在前景加了一个可以遮挡的物体
 * 比如墙 人操控躲在后面就可以 你他妈的画个阴影是什么意思啊」。所以这一件的
 * 职责只有一个：**站在演员前面，把躲在它后面的人真的挡住**（clutter 带）。
 *
 * 尺度是被这个职责钉死的，别乱调：
 *  · 墙身 0.72m（塌了半截的那种）—— 柱子蹲下去头顶 0.97m，**只露出脑袋一小截**
 *    （玩家还看得见自己在哪儿）；站起来 1.38m，大半个人亮在墙外＝暴露。
 *    **这个高度差就是玩法本身**，改了这一拍就废了。第一版给 1.0m，实拍出来
 *    两个孩子整个不见了——前景件被透视放大 1.17 倍、地平线还往下掉 0.16m，
 *    纸面上的"齐胸"到画面上就成了"没顶"。
 *  · 东头（朝村口那头）一个 ×1.45 的门垛 —— 危险来的那一侧要厚要高；
 *    仍在 clutter 的 1.2m 上限内。
 *
 * 前景件的三条画法（比背景件都要狠一档，因为它离镜头最近、被放大 1.18 倍）：
 *  ① 色号再压一档：近处的东西必须比背景实，一样的明度就又糊成背景；
 *  ② 顶沿是**看人的那条线**，所以它要平稳可读（起伏但不塌腰）——玩家是照着
 *    这条线判断自己露没露头的；
 *  ③ 墙根壅土往镜头这边堆，把"它站在你前面"这件事在下缘也说一遍。
 *
 * @param w 墙全长（画布像素），@param h 墙身高（画布像素）
 */
export function DrawYardWallLow(ctx, x, groundY, w, h, id, { pier = true, slogan = null } = {}) {
  const x0 = x - w / 2, x1 = x + w / 2;
  const pierW = pier ? Math.min(w * 0.26, 42) : 0;
  const xp = x1 - pierW;                     // 墙身与门垛的分界（东头＝朝村口那头）
  // 门垛比墙身高半头：**朝危险那一侧要厚要高**（挡住的正是伪军来的方向），
  // 而墙身要矮到让玩家看得见自己的脑袋——一件东西两个高度，两件事各得其所
  const pierH = h * 1.45;

  // ① 墙身
  const runTop = RaggedTop(x0, xp + (pier ? 2 : 0), groundY - h, id + "rt",
    { sag: 2.6, n: Math.max(6, Math.round(w / 14)) });
  InkFill(ctx, runTop.concat([[xp + (pier ? 2 : 0), groundY], [x0, groundY]]), id + "run",
    "#453922", { amp: 1.7, lw: 2.4, shade: "rgba(18,12,6,0.42)", shadeAt: 0.42 });
  // 前景件是全画面离镜头最近的东西，纹理得比背景狠一档；但**大补丁只留一块**
  //（两块以上在这个尺度下就是墙上贴了两张白纸）
  WeatherAdobe(ctx, x0, groundY - h, (xp + 2) - x0, h, id + "rwa",
    { course: 10, gullies: 4, cracks: 3, patches: 1, seam: 0.34 });
  Speckle(ctx, x0, groundY - h, (xp + 2) - x0, h, id + "sp", { count: 26, alpha: 0.13 });

  // ② 门垛（东头拔高一点：拐角靠高低差读，不靠另糊一块暗板）
  let pierTop = null;
  if (pier) {
    pierTop = RaggedTop(xp, x1, groundY - pierH, id + "pt", { sag: 1.8, n: 5 });
    InkFill(ctx, pierTop.concat([[x1, groundY], [xp, groundY]]), id + "pier",
      "#3c311b", { amp: 1.7, lw: 2.4, shade: "rgba(16,11,5,0.44)", shadeAt: 0.40 });
    WeatherAdobe(ctx, xp, groundY - pierH, pierW, pierH, id + "pwa",
      { course: 10, gullies: 2, cracks: 2, patches: 0, seam: 0.34 });
    InkLine(ctx, xp + Sym(id + "cn", 0, 1.2), groundY - h + 2, xp + Sym(id + "cn", 1, 1.2), groundY,
      id + "corner", { lw: 2.0, color: IN.inkSoft, amp: 0.7 });
  }

  // ③ 墙头苫的谷草：**顶沿这条线玩家要照着看**，所以起伏给得克制
  const cap = (a, b, topPts, thick, seed) => {
    const capTopY = (px) => {
      const t = Math.max(0, Math.min(1, (px - a) / Math.max(1, b - a)));
      const f = t * (topPts.length - 1);
      const i0 = Math.min(topPts.length - 2, Math.floor(f));
      return topPts[i0][1] + (topPts[i0 + 1][1] - topPts[i0][1]) * (f - i0);
    };
    const sd = Hash(id + seed) * 6.28;
    const bald = (a + b) / 2 + Sym(id + "bd" + seed, 0, (b - a) * 0.24);
    const Thick = (px) => {
      const worn = Math.max(0, 1 - ((px - bald) / Math.max(8, (b - a) * 0.26)) ** 2);
      return Math.max(0, (thick + Math.sin(px * 0.07 + sd) * 1.5) * (1 - worn * 0.8));
    };
    const lower = [], upper = [];
    const n2 = Math.max(8, Math.round((b - a) / 3.5));
    for (let i = 0; i <= n2; i += 1) {
      const px = a + ((b - a) * i) / n2;
      const base = capTopY(px);
      const burr = (i % 2 ? 1.6 : 0) + Rnd(id + "cpt" + seed, i) * 1.9;
      lower.push([px, base + 2.4]);
      upper.push([px, base - Thick(px) - (Thick(px) > 1 ? burr : 0)]);
    }
    // **往暖里拧**：R 与 G 挨得太近，上屏（CanvasTexture 提亮）就是一条青苔绿的
    // 带子，读成墙头长了草。干谷草是暖赭，R−G 要拉开一档
    InkFill(ctx, lower.concat(upper.reverse()), id + "cap" + seed,
      "#4a3410", { amp: 0.9, lw: 1.2, line: IN.inkSoft, shade: "rgba(22,13,3,0.38)" });
    ctx.save();
    ctx.lineWidth = 0.9;
    for (let i = 0; i < Math.round((b - a) / 3); i += 1) {
      const px = a + 2 + Rnd(id + "cw" + seed, i) * (b - a - 4);
      const th = Thick(px);
      if (th < 1.4) continue;
      const py = capTopY(px) - th * (0.15 + Rnd(id + "cv" + seed, i) * 0.7);
      ctx.globalAlpha = 0.28 + Rnd(id + "ca" + seed, i) * 0.3;
      ctx.strokeStyle = i % 3 === 0 ? "#3b2806" : "#7d6537";
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + (i % 2 ? 4 : -4), py + 1.6);
      ctx.stroke();
    }
    ctx.restore();
    for (let i = 0; i < 4; i += 1) {
      const px = a + 4 + Rnd(id + "dg" + seed, i) * (b - a - 8);
      if (Thick(px) < 2) continue;
      InkLine(ctx, px, capTopY(px) + 2, px + Sym(id + "dg2" + seed, i, 2.3),
        capTopY(px) + 6 + Rnd(id + "dg3" + seed, i) * 6,
        id + "drp" + seed + i, { lw: 1.1, color: "#63501f", amp: 1.2 });
    }
  };
  cap(x0 - 2, xp + (pier ? 1 : 2), runTop, 5.0, "run");
  if (pier) cap(xp - 2, x1 + 2, pierTop, 6.0, "pier");

  // ④ 墙根壅土（往镜头这边堆一点：下缘也说一句"它在你前面"）
  InkFill(ctx, [[x0 - 6, groundY + 3], [x0 + 5, groundY - 5], [(x0 + x1) * 0.38, groundY - 7],
    [(x0 + x1) * 0.62, groundY - 6], [x1 - 4, groundY - 5], [x1 + 7, groundY + 3]],
    id + "ft", "#3b3122", { amp: 1.6, lw: 1.5, shade: "rgba(15,11,6,0.30)" });

  // ⑤ 石灰刷的日伪口号（这年月的村墙本来就压着两层字）
  if (slogan) {
    const size = Math.min(20, (xp - x0) * 0.7 / (slogan.text.length * 1.22));
    DrawWallSlogan(ctx, (x0 + xp) / 2, groundY - h * 0.52, slogan.text, size, id + "sl", slogan);
  }
}

// 鸡窝：半人高的土坯拱洞，顶上苫草，洞口垫一块踏脚石
// 鸡窝。上一版画成了对称人字顶 + 拱门 + 门前一块台阶石——那是**西式狗窝**，
// 1942 年冀中农家不会有这东西。按华北旱作区的实物重画：
//
//   · **土坯垒的矮窝，倚在背风墙根**——不是院子当中孤零零一座小房子。
//     冀中不产竹（南方那种编的鸡罩在这儿没有），墙根一溜土坯垒到齐膝高，
//     单面坡，后墙借人家的山墙，这样最省料，也最挡西北风。
//   · **秫秸（高粱秆）苫顶，上头压块石头**——平原上柴禾就是高粱秆，
//     苫完抹一层泥，风大就压石头。绝不是尖顶。
//   · **窝口很小，夜里拿石板堵上**——黄鼠狼是头号敌人，这块挡板就是"门"，
//     白天挪到一边靠着。窝口只够一只鸡侧身进，不是给狗进的拱门。
//   · **谷草拧成草绳、一圈圈螺旋盘出来的草窝**（华北特有的做法），
//     搁在窝口里头，下蛋就在这上头。
//   · 门口一只豁了口的破瓦盆当食槽，半埋在土里，周围撒着谷糠。
//
// 尺度也改了：原来 1.4m 见方，比鸡高出好几倍；现在窝身齐膝（≈0.55m）。
export function DrawHenCoop(ctx, x, groundY, id) {
  const L = x - 26, R = x + 22;            // 窝身左右（≈1m）
  const backY = groundY - 30;              // 靠墙那头高
  const frontY = groundY - 21;             // 朝院子这头矮 → 单面坡

  // ── 土坯垒的窝身：一层层坯，缝不齐 ──
  InkFill(ctx, [[L, groundY], [L, frontY + 2], [R, backY + 2], [R, groundY]],
    id + "body", "#8f7a5a", { amp: 1.4, lw: 2, shade: "rgba(74,56,42,0.22)" });
  // 坯缝：三层横缝 + 错开的竖缝，读得出是一块块垒的，不是一坨泥
  for (let r = 0; r < 3; r += 1) {
    const t = (r + 1) / 4;
    const yl = groundY + (frontY + 2 - groundY) * t;
    const yr = groundY + (backY + 2 - groundY) * t;
    InkLine(ctx, L + 1, yl, R - 1, yr, id + "seam" + r, { lw: 1, color: "rgba(96,72,46,0.5)", amp: 1.1 });
    for (let c = 0; c < 3; c += 1) {
      const u = (c + (r % 2 ? 0.5 : 0)) / 3 + 0.12;
      const px = L + (R - L) * u;
      const py = yl + (yr - yl) * u;
      InkLine(ctx, px, py, px, py + 6, id + `v${r}_${c}`, { lw: 0.9, color: "rgba(96,72,46,0.42)", amp: 0.8 });
    }
  }

  // ── 秫秸苫顶：一层斜铺的高粱秆，出檐一点，边上抹了泥 ──
  InkFill(ctx, [[L - 5, frontY + 3], [R + 4, backY + 1], [R + 4, backY - 4], [L - 5, frontY - 2]],
    id + "thatch", "#9c8a56", { amp: 1.2, lw: 1.6, shade: "rgba(0,0,0,0.14)" });
  for (let i = 0; i < 7; i += 1) {
    const u = i / 6;
    const sx = L - 4 + (R + 3 - (L - 4)) * u;
    const sy = (frontY + 1) + ((backY - 1) - (frontY + 1)) * u;
    InkLine(ctx, sx, sy + 2, sx + 2, sy - 3, id + "stalk" + i, { lw: 0.9, color: "rgba(74,58,30,0.5)", amp: 0.9 });
  }
  // 压顶的石头：风大，苫顶得拿石头压住
  InkFill(ctx, [[x + 2, backY - 3], [x + 9, backY - 5], [x + 12, backY - 1], [x + 5, backY + 1]],
    id + "stone", "#8f8a80", { amp: 0.7, lw: 1.3, shade: "rgba(0,0,0,0.2)" });

  // ── 窝口：小、贴地、黑。只够一只鸡侧身进 ──
  InkFill(ctx, [[L + 7, groundY], [L + 7, groundY - 12], [L + 11, groundY - 15],
    [L + 18, groundY - 14], [L + 19, groundY]],
    id + "mouth", "#241c14", { amp: 0.9, lw: 1.5 });
  // 谷草拧的草窝：草绳一圈圈螺旋盘起来，窝口里露出小半个
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.strokeStyle = i === 0 ? "#c9b47a" : "rgba(184,162,110,0.75)";
    ctx.lineWidth = 1.5;
    ctx.ellipse(L + 13, groundY - 3 - i * 2.2, 6.2 - i * 1.6, 2.4 - i * 0.6, 0, Math.PI * 0.08, Math.PI * 0.98);
    ctx.stroke();
  }
  // 夜里堵窝口的那块石板：白天挪到一边靠着（防黄鼠狼的"门"）
  InkFill(ctx, [[L + 22, groundY], [L + 21, groundY - 13], [L + 27, groundY - 14], [L + 28, groundY]],
    id + "slab", "#9a948a", { amp: 0.8, lw: 1.5, shade: "rgba(0,0,0,0.18)" });

  // ── 门口：豁了口的破瓦盆当食槽，半埋在土里；周围撒着谷糠 ──
  InkFill(ctx, [[R - 2, groundY], [R - 1, groundY - 5], [R + 9, groundY - 5], [R + 10, groundY]],
    id + "trough", "#8a6a4e", { amp: 0.8, lw: 1.4, shade: "rgba(0,0,0,0.16)" });
  InkLine(ctx, R + 1, groundY - 4, R + 7, groundY - 4, id + "feed", { lw: 1.4, color: "#c0a86e", amp: 0.9 });
  for (let i = 0; i < 7; i += 1) {
    const gx = L + 4 + Hash(id + "ch" + i) * (R - L + 16);
    const gy = groundY - Hash(id + "cy" + i) * 2.2;
    InkLine(ctx, gx, gy, gx + 1.8, gy - 0.8, id + "chaff" + i, { lw: 0.8, color: "rgba(176,152,96,0.6)" });
  }
  // 掉的一根羽毛
  InkLine(ctx, L - 3, groundY - 1, L + 1, groundY - 5, id + "feather", { lw: 1, color: "rgba(210,196,160,0.8)", amp: 1.4 });
}

// ---------------------------------------------------------------------------
// 接绳特写卡（**会动的那一张**）：和划线/刨料同一套活卡机制——铺满画框、
// 每帧重画、玩家的手就按在上面。
//
// 为什么这一拍要单独画一张、而不是把世界里的镜头再推近：量过。世界里那个结
// 横过来才 0.23m，1.5m 半宽的井口特写下也只占八分之一个画宽，读出来是"一枚
// 圆环挂在一根线上"（用户 2026-08-10：「谁看得出来这是打结」）。这张卡上，
// 井绳挽的那个圈**占三分之一个画宽**，圈眼是个真看得见的洞。
//
// 压叠关系是这一拍的题眼，和老版同一条规矩：麻绳从右下进画，**从圈的右缘
// 底下钻进去**（右半圈画在麻绳之后）、**从左缘上头钻出来**（左半圈画在麻绳
// 之前）。少了这一层，画面上只是两条线交叉。
//
// 版面（卡宽单位：x∈0..1，y∈0..1/aspect）由 Core 的 KNOT_CARD 定，判定与
// 作画共用同一套数——绝不许在这儿另写一份坐标。
// ---------------------------------------------------------------------------
// 明度关系是这张卡的命根子，两条都是实拍量出来的：
// ① **绳压在井口那团黑上**，不压在卡的底色上。第一版让浅色的绳压在浅色的
//    亮底上（CardBase 的径向渐变最亮的那一块正好在结的位置），加上画布贴图
//    没声明 sRGB、上屏整体提亮一大截，整张卡读出来是"一枚浅圈挂在浅线上"。
// ② 两根绳自己也要分得开：井绳旧一档、麻绳新一档，差半个明度。
const KNOT_OLD = "#7d5a24";      // 井绳：用了几十年，粗、发暗
const KNOT_OLD_D = "#614318";
const KNOT_NEW = "#dcb470";      // 麻绳：新的，亮一档，两根一眼分得开
const KNOT_NEW_D = "#8e6d3a";    // 绕到两股背后那一段：压暗两档，"在后面"才读得出来
const KNOT_INK = "rgba(26,17,8,0.95)";

/** 一段麻绳：墨线包边＋绳身＋捻纹。pts 是画布像素点串 */
function KnotRope(ctx, pts, color, w, ink = KNOT_INK, cap = "round") {
  if (!pts || pts.length < 2) return;
  ctx.save();
  ctx.lineCap = cap;
  ctx.lineJoin = "round";
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
  };
  path(); ctx.strokeStyle = ink; ctx.lineWidth = w + Math.max(3, w * 0.34); ctx.stroke();
  path(); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
  // 捻纹：麻绳是三股拧出来的，斜纹一道一道。没有它这就是一根塑料管
  ctx.strokeStyle = "rgba(70,48,24,0.30)";
  ctx.lineWidth = Math.max(1.4, w * 0.14);
  let acc = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const ax = pts[i - 1][0], ay = pts[i - 1][1];
    let dx = pts[i][0] - ax, dy = pts[i][1] - ay;
    const seg = Math.hypot(dx, dy);
    if (seg < 1e-3) continue;
    dx /= seg; dy /= seg;
    for (acc += seg; acc > w * 0.62; acc -= w * 0.62) {
      const q = seg - (acc - w * 0.62);
      const cx = ax + dx * q, cy = ay + dy * q;
      ctx.beginPath();
      ctx.moveTo(cx - dy * w * 0.46 - dx * w * 0.24, cy + dx * w * 0.46 - dy * w * 0.24);
      ctx.lineTo(cx + dy * w * 0.46 + dx * w * 0.24, cy - dx * w * 0.46 + dy * w * 0.24);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** 毛茬的绳头：一个鼓包 + 几根散开的麻。grab=攥住了（鼓一点，麻炸开） */
function KnotTip(ctx, x, y, w, grab, id, color = KNOT_NEW) {
  const r = w * (grab ? 0.72 : 0.6);
  ctx.save();
  for (let i = 0; i < 7; i += 1) {
    const a = -2.35 + i * 0.42 + Hash(id + "f" + i) * 0.3;
    const len = w * (1.1 + Hash(id + "l" + i) * 1.5) * (grab ? 1.15 : 1);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.6, y + Math.sin(a) * len * 0.6 - w * 0.3,
      x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.strokeStyle = "rgba(196,150,88,0.8)";
    ctx.lineWidth = Math.max(1.6, w * 0.16);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(x, y, r + Math.max(2.4, w * 0.2), 0, Math.PI * 2);
  ctx.fillStyle = KNOT_INK;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/** 会呼吸的一团光：「按这儿」由物件自己说，不占中央那条提示，也不挂图标 */
function KnotGlow(ctx, x, y, r, k) {
  if (k <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = k;
  const g = ctx.createRadialGradient(x, y, r * 0.12, x, y, r);
  g.addColorStop(0, "rgba(255,242,200,0.95)");
  g.addColorStop(0.55, "rgba(255,232,172,0.32)");
  g.addColorStop(1, "rgba(255,232,172,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * 每帧重画的接绳卡：**打的是单编结**（水手结），画的就是实物的做法。
 * view = Core 的 state.knotCard，L = KNOT_CARD，t = 秒。
 *
 * 画面上必须成立的三件事（少一件玩家就不知道自己在干嘛）：
 * ① **那两根得看着像绳**。上一版把绳画成 3.4% 卡宽的大扁带子、圈画成正圆，
 *    读出来是一只救生圈中间嵌了颗石头（用户 2026-08-10 退回：「哪有打结是
 *    这样的」）。绳要细（2%）、有斜捻纹，弯要是**手挽出来的**不是圆规画的。
 * ② **压叠关系就是这个结本身**。单编结的三处叠压缺一不可：麻绳从弯口穿上来
 *    时**压在两股之上**、绕背后那一段**藏在两股之后**、最后掖进去那一截
 *    **从自己那股底下钻出来**。所以绘制顺序钉死成五层：
 *      绕背后的那段 → 井绳（弯＋两股） → 掖出来那段 → 穿上来那段 → 进画那段
 *    颠倒任何一层，画面上就不再是个结，只是几根绳搭在一起。
 * ③ **进度长在结上**：走过几道关口，麻绳就画到哪儿；勒紧那一把把弯收窄、
 *    两股并拢、绳头缩短——不许有任何条、环、百分比。
 */
export function DrawKnotCard(ctx, W, H, view, L, t) {
  const S = H / 720;
  const P = (x, y) => [x * W, y * W];            // 卡宽单位 → 画布像素（y 同尺）
  const cinch = Math.max(0, Math.min(1, view.cinch || 0));
  const grab = !!view.grab;
  const gate = view.gate | 0;
  const NG = L.gates.length;
  const RW = W * 0.020;                          // 麻绳（细）
  const OW = W * 0.027;                          // 井绳（粗一档——粗细不同正是单编结的用处）

  LiveCardBase(ctx, W, H, "#7e6a48");

  // ── 背景：井架的横杆压在画框顶上，身后是井筒那团黑，底下一道石沿 ──
  InkFill(ctx, [[-40 * S, -30 * S], [W + 40 * S, -30 * S], [W + 40 * S, H * 0.10], [-40 * S, H * 0.13]],
    "knBeam", "#3e2c19", { amp: 5 * S, lw: 7 * S, shade: "rgba(0,0,0,0.34)" });
  ctx.save();
  const shaft = ctx.createRadialGradient(W * 0.40, H * 0.46, H * 0.06, W * 0.40, H * 0.5, H * 0.86);
  shaft.addColorStop(0, "rgba(14,10,6,0.94)");
  shaft.addColorStop(0.52, "rgba(16,11,6,0.80)");
  shaft.addColorStop(1, "rgba(16,11,6,0)");
  ctx.fillStyle = shaft;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  InkFill(ctx, [[-40 * S, H * 0.93], [W * 0.5, H * 0.885], [W + 40 * S, H * 0.915],
    [W + 40 * S, H + 40 * S], [-40 * S, H + 40 * S]],
  "knCurb", "#4c4335", { amp: 5 * S, lw: 6 * S, shade: "rgba(0,0,0,0.30)" });

  // ── 井绳：折回来挽的那个弯（U 的闭口在左、开口朝右） ──
  // 勒紧一把，弯就收窄、两股并拢——进度全长在这上头
  // **勒紧＝整个结往里缩**。上一版只收井绳那个弯、麻绳那几圈原样不动，
  // 拽到底反而更松散了——两根都得跟着收，而且要朝**同一个结心**收
  const K = { x: L.bend.x + 0.09, y: L.bend.y - 0.005 };   // 结心：弯口偏右一点
  const Tight = (p) => ({
    x: K.x + (p.x - K.x) * (1 - cinch * 0.44),
    y: K.y + (p.y - K.y) * (1 - cinch * 0.50),
  });
  const legPts = (arr) => arr.map((p) => { const q = Tight(p); return P(q.x, q.y); });
  const up = legPts(L.legUp), low = legPts(L.legLow);
  const bendPts = [];
  for (let i = 0; i <= 16; i += 1) {
    const a = Math.PI / 2 + (i / 16) * Math.PI;   // 上 → 左 → 下
    const wob = 1 + Math.sin(a * 3.1 + 0.7) * 0.07;
    const q = Tight({
      x: L.bend.x + Math.cos(a) * L.bend.r * wob,
      y: L.bend.y - Math.sin(a) * L.bend.r * 0.98 * wob,
    });
    bendPts.push(P(q.x, q.y));
  }

  // ── 麻绳：锚点 → 已经过了的关口 → 手上那一头 ──
  // 走过几关就画到哪儿：**画面上的结就是玩家真挽出来的那一部分**
  const tip = view.tip || L.start;
  const way = [{ x: L.anchor.x, y: L.anchor.y }];
  // 挽好的那几圈跟井绳一起往结心收（手上那一头不收——它正被人往外拽）
  for (let i = 0; i < Math.min(gate, NG); i += 1) way.push(Tight(L.gates[i]));
  way.push({ x: tip.x, y: tip.y });
  const PER = 8;                                   // 每两个 waypoint 之间的采样数
  const hemp = [];
  {
    const pt = (i) => way[Math.max(0, Math.min(way.length - 1, i))];
    for (let i = 0; i < way.length - 1; i += 1) {
      const p0 = pt(i - 1), p1 = pt(i), p2 = pt(i + 1), p3 = pt(i + 2);
      for (let k = 0; k < PER; k += 1) {
        const u = k / PER, u2 = u * u, u3 = u2 * u;
        hemp.push(P(
          0.5 * ((2 * p1.x) + (-p0.x + p2.x) * u + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2
            + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3),
          0.5 * ((2 * p1.y) + (-p0.y + p2.y) * u + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2
            + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3),
        ));
      }
    }
    hemp.push(P(way[way.length - 1].x, way[way.length - 1].y));
  }
  // 按关口把麻绳切成四段——**压叠关系就靠这几段的绘制顺序**
  const cut = (a, b) => hemp.slice(Math.max(0, a * PER), Math.min(hemp.length, b * PER + 1));
  // 关口在 way 里的下标：0=锚点 1=①口 2=②上 3=③越 4=④背 5=⑤掖 6=手上。
  // **压叠关系全在这四刀上**：只有 ③越→④背 那一段在两股后面，别的都在前面；
  // ④背→⑤掖 要被 ①口→③越 压住（那就是"从自己那股底下掖出去"）
  const segEnter = cut(0, 1);                      // 锚点 → ①口（离镜头最近的一段）
  const segThru = cut(1, 3);                       // ①口 → ②上 → ③越：穿上来再贴着上股往右
  const segBack = cut(3, 4);                       // ③越 → ④背：绕到两股**背后**兜下来
  const segTuck = cut(4, 99);                      // ④背 → ⑤掖 → 手上：回到前面，从自己那股底下钻出去

  KnotRope(ctx, segBack, KNOT_NEW_D, RW);                        // 最底下：在两股后面
  KnotRope(ctx, bendPts, KNOT_OLD, OW, KNOT_INK, "butt");        // 井绳的弯
  KnotRope(ctx, up, KNOT_OLD, OW, KNOT_INK, "butt");             // 上股（连着横杆）
  KnotRope(ctx, low, KNOT_OLD_D, OW, KNOT_INK, "butt");          // 下股（断头那一股）
  if (low.length) {
    KnotTip(ctx, low[low.length - 1][0], low[low.length - 1][1], OW * 0.8, false, "knOldFray", KNOT_OLD_D);
  }
  KnotRope(ctx, segTuck, KNOT_NEW, RW * (1 - 0.10 * cinch));     // 掖出来：在井绳之上
  KnotRope(ctx, segThru, KNOT_NEW, RW * (1 - 0.10 * cinch));     // 穿上来：压住掖出来那一段
  KnotRope(ctx, segEnter, KNOT_NEW, RW * (1 - 0.10 * cinch));    // 进画的一段：离镜头最近

  // 勒紧之后：结心压出一小片阴影——绳互相咬住的那一处。
  // （老版在这儿横着划两道"勒痕"，收紧之后成了两根飘在结外面的灰棍子）
  if (cinch > 0.2) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.5, (cinch - 0.2) * 0.9);
    const c = P(K.x, K.y);
    const g = ctx.createRadialGradient(c[0], c[1], OW * 0.4, c[0], c[1], OW * 3.4);
    g.addColorStop(0, "rgba(38,24,10,0.85)");
    g.addColorStop(1, "rgba(38,24,10,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c[0], c[1], OW * 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── 绳头 ──
  const tp = P(tip.x, tip.y);
  KnotTip(ctx, tp[0], tp[1], RW, grab, "knTip");

  // ── 引导：全长在物件上，没有 HUD 图标、没有按键提示、更没有轨道 ──
  if (!grab) {
    const pulse = view.reaching ? 0.55 + 0.4 * Math.sin(t * 13) : 0.42 + 0.34 * Math.sin(t * 3.0);
    KnotGlow(ctx, tp[0], tp[1], L.grabR * W * 1.25, 0.14 + pulse * 0.20);
  }
  // 下一道关口在结上透一点光：**"下一手往哪儿走"由那个地方自己说**
  if (gate < NG) {
    const g = L.gates[gate];
    const gp = P(g.x, g.y);
    KnotGlow(ctx, gp[0], gp[1], g.r * W * 0.82, 0.09 + 0.11 * (0.5 + 0.5 * Math.sin(t * 2.4)));
  }
  // 绳头自己朝下一道关口蹭两下：蹭的方向就是该拖的方向（代替 HUD 手势图标）
  if (!grab) {
    const aim = gate < NG ? L.gates[gate] : L.cinchTo;
    let vx = aim.x - tip.x, vy = aim.y - tip.y;
    const vl = Math.hypot(vx, vy) || 1;
    vx /= vl; vy /= vl;
    const k = Math.max(0, Math.sin(t * 2.2)) * 0.055;
    ctx.save();
    ctx.globalAlpha = 0.34 * Math.max(0, Math.sin(t * 2.2));
    const g0 = P(tip.x + vx * 0.026, tip.y + vy * 0.026);
    const g1 = P(tip.x + vx * (0.026 + k), tip.y + vy * (0.026 + k));
    ctx.beginPath();
    ctx.moveTo(g0[0], g0[1]);
    ctx.lineTo(g1[0], g1[1]);
    ctx.strokeStyle = "rgba(255,240,196,0.9)";
    ctx.lineWidth = RW * 0.38;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();
  }
  // 跳着走：往还没轮到的那道关口上凑，绳头周围闪一圈——"这道还没过"
  if (view.wrong) {
    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = "rgba(196,108,64,0.9)";
    ctx.lineWidth = 3.4 * S;
    ctx.beginPath();
    ctx.arc(tp[0], tp[1], RW * 2.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  // 脱手那一下：绳头周围炸一小圈灰——手上一空，看得见
  if (view.slip) {
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = "rgba(214,196,158,0.8)";
    ctx.lineWidth = 3 * S;
    ctx.beginPath();
    ctx.arc(tp[0], tp[1], RW * 2.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 四角压暗，和别的插卡一个调子
  const vg = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.32, W * 0.5, H * 0.5, H * 0.9);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(16,11,6,0.62)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------------------
// 揭草苫 · 叠衣裳的活卡（第一章夜里下窖，归置爹娘的东西）
//
// 版面全在 Core 的 FOLD_CARD，这儿只作画，一个坐标都不许另立。
// 卡宽单位 → 像素：P(x,y) = [x*W, y*W]（y 与 x 同尺，见 DrawKnotCard）。
//
// 五条画法上的账，都是这作品里交过学费的：
// ① **底必须是透明的**（LiveCardBase 不是 CardBase）——活卡是玩家正在玩的
//    那一拍，镜头只是推近了，窖并没有消失。背后那层真景散焦由 Render 铺。
// ② **颜色按 ^2.2 反推压两档**（CanvasTexture 没声明 sRGB，全场被提亮两档）。
//    第一版实拍出来是一整片发白的米色：`#4a3c24` 的草苫渲出来到了 190 上下，
//    比土墙还亮。反推的算法是 `想要的亮度^2.2`——要一片 90 的暗褐，源色就得
//    写到 26 左右。这张卡最亮的只有灯焰，别的一律在 #2e2418 以下。
// ③ **一件东西要认得出，就得有别的东西衬着它**。第一版苫子铺满画框，读出来
//    是"一张纸"；现在窖壁一条、窖底一片、灯一盏，苫子只占中间那块，
//    右边一只袖口、底下一截下摆压在苫子外头——"底下盖着东西"一眼就看得见。
// ④ **折痕不是画上去的装饰，是折出来的**：一道折痕永远落在"原来的边"与
//    "手把它放到哪儿"的正中间——现实里就是这么来的，所以判定与画面天然一致，
//    玩家看得见自己刚才那一下的结果（这正是拿掉进度条要换来的东西）。
// ⑤ **印子不是伤口特写**（历史与叙事铁律）：拦腰折上来，襟里子翻出来，那是
//    一片干成褐色的印子，压得很暗，不描边、不给红。
// 实拍标定过两轮：`#241a0e` 的苫子渲出来还有 150 上下，`#2a2418` 的盖布到了
// 200——这条曲线在暗部**极陡**，越往下压，两块颜色分得越开。所以这一组全部
// 落在 8~26 之间；看着像纯黑的源色，渲出来才是"夜里一盏油灯照着的土窖"。
const FOLD_FLOOR = "#0a0704";      // 窖底夯土
const FOLD_WALL = "#060403";       // 窖壁（比地面还沉，东西在它前面才立得住）
const FOLD_MAT = "#100b05";        // 草苫（编席）
const FOLD_MAT_HI = "#1a1207";     // 灯照着的那半边苫子
const FOLD_COVER = "#0c0a06";      // 盖在上头那领破麻苫（比苫子还暗：它压在上头）
const FOLD_COVER_HI = "#181309";   // 麻苫被灯照亮的那几缕
const FOLD_CLOTH = "#0a0b0e";      // 娘的短褂：蓝底白花的靛蓝土布，洗到发暗
const FOLD_CLOTH_IN = "#090a0c";   // 里子（没晒过，只比正面浅一线——差半档就白了）
// 白花：跟瓦罐扎口那块碎布同一种印花（2026-08-12 用户改稿钉死的暗线）。
// 这张卡只点着一盏豆油灯，花要压得很暗——它是认出来的记号，不是装饰
const FOLD_BLOOM = "rgba(120,130,148,0.30)";
const FOLD_HAIR = "rgba(214,210,200,0.78)"; // 领口那根白头发（全卡最细的一笔）
const FOLD_STAIN = "#0e0503";      // 那片印子（同抱在怀里那张小图的渍色，再压一档）
const FOLD_INK = "#040302";

/** 一块布：带手绘毛边的四边形。布的边不许笔直（"四边笔直＝没有手"） */
function FoldQuad(ctx, pts, id, fill, S, { lw = 5, shade = "rgba(0,0,0,0.30)", amp = 4 } = {}) {
  InkFill(ctx, pts, id, fill, { amp: amp * S, lw: lw * S, line: FOLD_INK, shade });
}

export function DrawFoldCard(ctx, W, H, view, L, t) {
  const S = H / 720;
  const P = (x, y) => [x * W, y * W];
  const clamp01 = (v) => Math.max(0, Math.min(1, v || 0));
  const idx = Math.max(0, Math.min(L.folds.length, view.idx | 0));
  const cur = L.folds[idx] || null;
  const linger = clamp01(view.linger);
  const F = L.folds, M = L.mat, SH = L.shirt, CV = L.cover;
  const tip = view.tip || (cur ? cur.from : F[F.length - 1].to);
  // 脱手那一下整幅抖一抖（抖的是布，不是画面）
  const sy = view.slip ? Math.sin(t * 42) * 0.004 : 0;

  LiveCardBase(ctx, W, H, "#1a1109");

  // ── 窖壁与窖底 ──
  // 三笔交代"跪在自家地窖里"：上头一条挖出来的土壁（带镐痕），底下一片夯土，
  // 交界处一道墨线。没有它们，苫子就是一张浮在空中的纸。
  ctx.save();
  ctx.fillStyle = FOLD_WALL;
  ctx.fillRect(0, 0, W, L.wall * W + 4 * S);
  ctx.fillStyle = FOLD_FLOOR;
  ctx.fillRect(0, L.wall * W, W, H - L.wall * W);
  ctx.restore();
  // 窖壁上一道道镐痕：这窖是一镐一镐掏出来的
  ctx.save();
  ctx.strokeStyle = "rgba(52,38,20,0.55)";
  ctx.lineWidth = 3.2 * S;
  for (let i = 0; i < 14; i += 1) {
    const x = (W * (i + 0.4)) / 14 + 12 * S * (Hash(`foldPick${i}`) - 0.5);
    const h = L.wall * W * (0.35 + 0.5 * Hash(`foldPickH${i}`));
    ctx.beginPath();
    ctx.moveTo(x, L.wall * W - h);
    ctx.quadraticCurveTo(x + 9 * S, L.wall * W - h * 0.4, x + 3 * S, L.wall * W - 2 * S);
    ctx.stroke();
  }
  ctx.restore();
  InkLine(ctx, -20 * S, L.wall * W, W + 20 * S, L.wall * W - 5 * S, "foldWallEdge",
    { lw: 5 * S, color: "rgba(6,4,2,0.9)", amp: 5 * S });
  Speckle(ctx, 0, L.wall * W, W, H - L.wall * W, "foldGrit",
    { count: Math.round(W / 10), alpha: 0.06, size: 2.4 });

  // ── 一盏豆油灯：这张卡唯一的光源，也是"夜里"三个字唯一的说明 ──
  // 灯先画在地上（人和苫子都比它近），光在最后一步铺；焰心是全卡最亮的一点
  {
    const lp = P(L.lamp.x, L.lamp.y);
    const r = 0.030 * W;
    // 浅碟：一只粗陶灯盏，底下一圈影
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(lp[0] + r * 0.2, lp[1] + r * 0.5, r * 1.6, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    InkFill(ctx, [
      [lp[0] - r * 1.25, lp[1] - r * 0.20], [lp[0] + r * 1.25, lp[1] - r * 0.26],
      [lp[0] + r * 0.80, lp[1] + r * 0.40], [lp[0] - r * 0.82, lp[1] + r * 0.42],
    ], "foldLampDish", "#2c2116", { amp: 2 * S, lw: 4 * S, line: FOLD_INK, shade: "rgba(0,0,0,0.3)" });
    // 灯捻子从盏沿探出来，焰是一小簇（抖，但别抖成火把）
    const flick = 1 + Math.sin(t * 7.3) * 0.10 + Math.sin(t * 3.1) * 0.06;
    const fx = lp[0] + r * 0.86, fy = lp[1] - r * 0.24;
    InkLine(ctx, fx - r * 0.5, fy + r * 0.12, fx, fy, "foldWick",
      { lw: 3 * S, color: "#3a2b16", amp: 1.4 * S });
    ctx.save();
    const fg = ctx.createRadialGradient(fx, fy - r * 0.42 * flick, r * 0.03,
      fx, fy - r * 0.3 * flick, r * 0.72 * flick);
    fg.addColorStop(0, "#ffeec4");
    fg.addColorStop(0.34, "#e0a63c");
    fg.addColorStop(1, "rgba(148,86,20,0)");
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.ellipse(fx, fy - r * 0.36 * flick, r * 0.34 * flick, r * 0.62 * flick, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── 草苫：编席。东西摊在上头 ──
  {
    const a = P(M.x0, M.y0), b = P(M.x1, M.y1);
    // 近的一边（下沿）比远的一边（上沿）宽一点：一张平铺的席子在低机位下就是
    // 这个样子，两条边一样长会读成一张贴在墙上的纸
    const inset = 0.020 * W;
    FoldQuad(ctx, [
      [a[0] + inset, a[1] + 5 * S], [b[0] - inset - 8 * S, a[1]],
      [b[0], b[1]], [a[0], b[1] - 4 * S],
    ], "foldMat", FOLD_MAT, S, { lw: 6, shade: "rgba(0,0,0,0.34)" });
    ctx.save();
    ctx.beginPath();
    ctx.rect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    ctx.clip();
    // 灯那一侧的苫子亮一档（光是从左前来的）
    const mg = ctx.createLinearGradient(a[0], 0, b[0], 0);
    mg.addColorStop(0, FOLD_MAT_HI);
    mg.addColorStop(0.55, "rgba(0,0,0,0)");
    ctx.fillStyle = mg;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    ctx.globalAlpha = 1;
    // 编纹：竖的篾条密、横的篾条疏（席子就是这么编的，别画成格子布）
    ctx.strokeStyle = "rgba(6,4,2,0.42)";
    ctx.lineWidth = 2.4 * S;
    for (let i = 1; i < 30; i += 1) {
      const x = a[0] + ((b[0] - a[0]) * i) / 30;
      ctx.beginPath();
      ctx.moveTo(x, a[1]);
      ctx.lineTo(x + 5 * S * (Hash(`foldWarp${i}`) - 0.5), b[1]);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(52,38,16,0.20)";
    ctx.lineWidth = 3 * S;
    for (let i = 1; i < 8; i += 1) {
      const y = a[1] + ((b[1] - a[1]) * i) / 8;
      ctx.beginPath();
      ctx.moveTo(a[0], y);
      ctx.lineTo(b[0], y + 4 * S * (Hash(`foldWeft${i}`) - 0.5));
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── 褂子 ──
  // 每一折都由"原来的边"和"手把它放到哪儿"两个数长出来，折痕落在正中间。
  const At = (i) => (idx === i ? tip : (idx > i ? F[i].to : F[i].from));
  const cuffPull = At(1).x - F[1].from.x;                   // 两袖交叠：袖口收进来多少
  const cuffL = idx >= 1 ? SH.cuffL + cuffPull : SH.cuffL;
  const cuffR = idx >= 1 ? SH.cuffR - cuffPull * 0.86 : SH.cuffR;
  const halfEdge = idx >= 2 ? At(2).x : SH.x0;
  const bodyL = idx >= 2 ? (SH.x0 + halfEdge) / 2 : SH.x0;  // 折痕＝原边与落点的正中
  const bodyR = SH.x1;
  const hemEdge = idx >= 3 ? At(3).y : SH.hemY;
  const bodyB = idx >= 3 ? (SH.hemY + hemEdge) / 2 : SH.hemY;
  const top = SH.shoulderY;
  {
    // 两只袖子（还没折进去的时候探在外头）
    if (idx <= 1) {
      const y0 = top + 0.028, y1 = top + 0.122;
      for (const [cx, inner, id] of [[cuffL, bodyL + 0.02, "foldSlvL"], [cuffR, bodyR - 0.02, "foldSlvR"]]) {
        const tornR = id === "foldSlvR";
        // 右袖撕了半边（新剧本 §10）：袖口那条边不走直线，缺进去一口
        FoldQuad(ctx, tornR ? [
          P(cx - 0.012, y0 + 0.008 + sy), P(inner, y0 + sy), P(inner, y1 + sy),
          P(cx - 0.030, y1 - 0.004 + sy), P(cx + 0.004, y1 - 0.036 + sy),
          P(cx - 0.024, y0 + 0.052 + sy),
        ] : [
          P(cx, y0 + 0.008 + sy), P(inner, y0 + sy), P(inner, y1 + sy), P(cx, y1 - 0.005 + sy),
        ], id, FOLD_CLOTH, S, { lw: 4, shade: "rgba(0,0,0,0.24)" });
        // 袖口那一圈磨白的边：一件穿了十年的褂子，磨损在袖口和肘上
        InkLine(ctx, ...P(cx + (cx < 0.5 ? 0.004 : -0.010), y0 + 0.012 + sy),
          ...P(cx + (cx < 0.5 ? 0.004 : -0.014), y1 - (tornR ? 0.040 : 0.010) + sy),
          `${id}Cuff`, { lw: 3 * S, color: "rgba(96,88,74,0.5)", amp: 2 * S });
        // 袖面上两簇白花（跟着 sy 抖）
        ctx.save();
        ctx.fillStyle = FOLD_BLOOM;
        for (let i = 0; i < 2; i += 1) {
          const fx = cx + (cx < 0.5 ? 1 : -1) * (0.030 + i * 0.052);
          const fy = y0 + 0.030 + Hash(id + "bl" + i) * 0.05 + sy;
          for (let p2 = 0; p2 < 4; p2 += 1) {
            const pa = (p2 / 4) * Math.PI * 2 + Hash(id + "blp" + i) * 2;
            const q = P(fx + Math.cos(pa) * 0.008, fy + Math.sin(pa) * 0.006);
            ctx.beginPath();
            ctx.ellipse(q[0], q[1], 0.0048 * W, 0.0036 * W, pa, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }
    }
    // 身子
    FoldQuad(ctx, [
      P(bodyL, top + sy), P(bodyR, top - 0.005 + sy),
      P(bodyR + 0.006, bodyB + sy), P(bodyL - 0.004, bodyB + 0.006 + sy),
    ], "foldBody", FOLD_CLOTH, S, { lw: 5, shade: "rgba(0,0,0,0.32)" });
    // 白花：稀稀拉拉几簇，灯那一侧的亮一线。折过之后压在双层暗罩底下，
    // 自己会跟着沉下去（画在身面上、罩子之前）
    {
      ctx.save();
      ctx.beginPath();
      ctx.rect(...P(bodyL, top), (bodyR - bodyL) * W, (bodyB - top) * W);
      ctx.clip();
      for (let i = 0; i < 8; i += 1) {
        const fx = SH.x0 + 0.04 + Hash("foldBloomX" + i) * (SH.x1 - SH.x0 - 0.08);
        const fy = top + 0.030 + Hash("foldBloomY" + i) * (SH.hemY - top - 0.06) + sy;
        ctx.fillStyle = FOLD_BLOOM;
        for (let p2 = 0; p2 < 4; p2 += 1) {
          const pa = (p2 / 4) * Math.PI * 2 + Hash("foldBloomP" + i) * 2;
          const q = P(fx + Math.cos(pa) * 0.009, fy + Math.sin(pa) * 0.007);
          ctx.beginPath();
          ctx.ellipse(q[0], q[1], 0.0052 * W, 0.0038 * W, pa, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
    // 领口那道豁 + **大襟**那条弧（从领口斜着掖到右腋下）+ 布纽襻：
    // 娘的短褂是大襟，不是爹那种对襟——缝走哪边，这件衣裳是谁的就定在哪笔
    if (idx < 2) {
      const cx0 = (SH.x0 + SH.x1) / 2;
      FoldQuad(ctx, [
        P(cx0 - 0.050, top + sy), P(cx0 + 0.050, top + sy),
        P(cx0 + 0.031, top + 0.054 + sy), P(cx0 - 0.031, top + 0.054 + sy),
      ], "foldCollar", "#0f1013", S, { lw: 3, shade: null, amp: 2 });
      // 大襟：领口右缘起，一道弧掖向右腋（袖根下），再顺着右侧缝下去
      {
        const a0 = P(cx0 + 0.028, top + 0.050 + sy);
        const a1 = P(SH.x1 - 0.020, top + 0.112 + sy);
        const a2 = P(SH.x1 - 0.016, bodyB - 0.014 + sy);
        ctx.save();
        ctx.strokeStyle = `rgba(6,5,4,${0.7 * dim})`;
        ctx.lineWidth = 2.8 * S;
        ctx.beginPath();
        ctx.moveTo(a0[0], a0[1]);
        ctx.quadraticCurveTo(a0[0] + (a1[0] - a0[0]) * 0.62, a0[1] + 4 * S, a1[0], a1[1]);
        ctx.lineTo(a2[0], a2[1]);
        ctx.stroke();
        ctx.restore();
      }
      // 布纽襻沿着大襟那道弧排：领口一颗、弧腰一颗、腋下一颗
      for (const [bx, by] of [[cx0 + 0.052, top + 0.060], [cx0 + 0.108, top + 0.086],
        [SH.x1 - 0.024, top + 0.118]]) {
        const q = P(bx, by + sy);
        ctx.save();
        ctx.fillStyle = "#3b352b";
        ctx.beginPath();
        ctx.ellipse(q[0], q[1], 5.5 * S, 4.2 * S, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      // 领口上那根白头发（新剧本 §10：他看了两眼，把它捋下来）。
      // 苫子一揭开就在领口上；两袖交叠一折完（idx 到 2）就没了——
      // 那一下算他捋掉的
      if (idx === 1) {
        const h0 = P(cx0 - 0.036, top + 0.020 + sy);
        ctx.save();
        ctx.strokeStyle = FOLD_HAIR;
        ctx.lineWidth = 1.3 * S;
        ctx.beginPath();
        ctx.moveTo(h0[0], h0[1]);
        ctx.bezierCurveTo(h0[0] + 0.030 * W, h0[1] + 0.010 * W,
          h0[0] + 0.052 * W, h0[1] - 0.006 * W, h0[0] + 0.078 * W, h0[1] + 0.014 * W);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // ── 折过的地方是**两层布**，不是一条线 ──
  // 折痕一律画成"暗芯 + 迎着灯那侧一线亮"：单画一条亮线，在这套暗调色板上会
  // 亮成一道刀口，整件读成一张对折的纸。叠上去的那一幅还要压暗一档——
  // 两层布本来就比一层沉，这一档就是"我刚才折过了"的全部证据。
  if (idx >= 2) {
    const x0 = bodyL, x1 = Math.min(bodyR, bodyL + (halfEdge - bodyL));
    if (x1 - x0 > 0.004) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "#000";
      ctx.fillRect(...P(x0, top), (x1 - x0) * W, (bodyB - top) * W);
      ctx.restore();
    }
    InkLine(ctx, ...P(bodyL + 0.003, top + 0.014), ...P(bodyL, bodyB - 0.014),
      "foldCrease1", { lw: 4.6 * S, color: "rgba(2,2,2,0.8)", amp: 3 * S });
    InkLine(ctx, ...P(bodyL + 0.008, top + 0.016), ...P(bodyL + 0.005, bodyB - 0.016),
      "foldCrease1b", { lw: 2 * S, color: "rgba(28,27,24,0.45)", amp: 3 * S });
  }
  if (idx >= 3) {
    InkLine(ctx, ...P(bodyL + 0.008, bodyB), ...P(bodyR - 0.006, bodyB - 0.004),
      "foldCrease2", { lw: 4.6 * S, color: "rgba(2,2,2,0.75)", amp: 3 * S });
    InkLine(ctx, ...P(bodyL + 0.010, bodyB - 0.006), ...P(bodyR - 0.008, bodyB - 0.010),
      "foldCrease2b", { lw: 2 * S, color: "rgba(46,44,38,0.5)", amp: 3 * S });
  }

  // ── 翻上来的那一幅：里子朝天，那片印子就在这儿 ──
  // 拦腰折上来的时候襟里子转到上面来——"印子是玩家自己翻出来的"就是这一笔。
  if (idx >= 3 && bodyB - hemEdge > 0.004) {
    FoldQuad(ctx, [
      P(bodyL + 0.004, bodyB), P(bodyR - 0.004, bodyB - 0.004),
      P(bodyR - 0.011, hemEdge), P(bodyL + 0.011, hemEdge + 0.005),
    ], "foldInner", FOLD_CLOTH_IN, S, { lw: 4, shade: "rgba(0,0,0,0.34)" });
    // 印子：**渍是把布染暗的，不是往布上涂一块颜色**。第一版用普通混合画
    // 深红，渲出来是布面上一枚发亮的锈红饼——正是「历史与叙事铁律」里说的
    // 「伤口特写」。改成 multiply：它只能把底下的布压暗、稍微带一点土褐，
    // 边缘自然渗开，怎么调都亮不起来。
    ctx.save();
    // 渍只在**这幅布上**：不夹的话几团影会漫到苫子上去，读成"地上有一摊"
    ctx.beginPath();
    ctx.rect(bodyL * W, hemEdge * W, (bodyR - bodyL) * W, (bodyB - hemEdge) * W);
    ctx.clip();
    ctx.globalCompositeOperation = "multiply";
    // 一片渍是**摊开的、边上深中间淡**（血是从外缘往里干的），不是一个圆点。
    // 所以：几团错得很开的淡影叠出不规则的一片，外缘再压两笔深的
    ctx.globalAlpha = 0.16 + 0.16 * clamp01(view.blood ? 1 : view.k);
    const cx = P(bodyL + (bodyR - bodyL) * 0.56, (hemEdge + bodyB) / 2 + 0.002);
    const rr = Math.min(bodyB - hemEdge, 0.088) * W;
    for (let i = 0; i < 7; i += 1) {
      const a = Hash(`foldStain${i}`) * Math.PI * 2;
      const dx = Math.cos(a) * rr * (0.40 + 0.80 * Hash(`foldStainD${i}`));
      const dy = Math.sin(a) * rr * (0.16 + 0.34 * Hash(`foldStainD${i}`));
      const g = ctx.createRadialGradient(cx[0] + dx, cx[1] + dy, rr * 0.04,
        cx[0] + dx, cx[1] + dy, rr * (0.62 + 0.42 * Hash(`foldStainR${i}`)));
      g.addColorStop(0, "#9c8878");
      g.addColorStop(0.55, "#b4a496");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx[0] + dx, cx[1] + dy, rr * (0.60 + 0.34 * Hash(`foldStainW${i}`)),
        rr * (0.34 + 0.22 * Hash(`foldStainH${i}`)), a * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // 干透的外缘：一圈深一档的边（这一笔才让它读成"渗进去又干了"）
    ctx.globalAlpha = 0.20 + 0.18 * clamp01(view.blood ? 1 : view.k);
    ctx.strokeStyle = "#8c7a6c";
    ctx.lineWidth = 5 * S;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.ellipse(cx[0] + (Hash(`foldRim${i}`) - 0.5) * rr * 0.5,
        cx[1] + (Hash(`foldRimY${i}`) - 0.5) * rr * 0.3,
        rr * (0.72 + 0.24 * Hash(`foldRimR${i}`)), rr * (0.40 + 0.16 * Hash(`foldRimR2${i}`)),
        Hash(`foldRimA${i}`) * 1.4, 0.4 + i * 1.8, 2.4 + i * 1.8);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── 盖在上头那领破麻苫（第一下手：把它拖开） ──
  // 苫角就是玩家攥着的那个点——**手拖的就是画面里这块布本身**，不是一根量。
  // 拖走的时候整幅跟着走，左边越堆越皱；右边一只袖口、底下一截下摆先露出来。
  if (idx === 0) {
    const d = Math.min(0, tip.x - F[0].from.x);
    const dy = tip.y - F[0].from.y;
    // 四个角：右下角＝手；其余按"整幅被拖走"的比例跟，左边跟得慢＝堆起来
    const c = [
      P(CV.x0 + d * 0.34, CV.y0 + dy * 0.30 + 0.004),      // 左上
      P(CV.x1 + d * 0.62, CV.y0 + dy * 0.46),              // 右上
      [tip.x * W, tip.y * W],                              // 右下＝手上那个角
      P(CV.x0 + d * 0.40, CV.y1 + dy * 0.66),              // 左下
    ];
    // 盖着东西的布是鼓的：上下两条边往外拱一点
    const mid = (p0, p1, k) => [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 + k * W];
    const quad = [c[0], mid(c[0], c[1], -0.016), c[1], c[2], mid(c[2], c[3], 0.014), c[3]];
    FoldQuad(ctx, quad, "foldCover", FOLD_COVER, S, { lw: 6, shade: "rgba(0,0,0,0.40)", amp: 5 });
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(quad[0][0], quad[0][1]);
    for (const q of quad.slice(1)) ctx.lineTo(q[0], q[1]);
    ctx.closePath();
    ctx.clip();
    // 麻苫是**编出来的**，不是一块板：一层粗麻的斜纹，灯那一侧亮几缕。
    // 没有这层纹，多暗都还是"一张纸"（第一版实拍就栽在这上头）
    ctx.strokeStyle = FOLD_COVER_HI;
    ctx.lineWidth = 3 * S;
    ctx.globalAlpha = 0.55;
    for (let i = -14; i < 34; i += 1) {
      const x0 = c[0][0] + i * 26 * S;
      ctx.beginPath();
      ctx.moveTo(x0, c[0][1] - 20 * S);
      ctx.lineTo(x0 + 46 * S, c[3][1] + 20 * S);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.30;
    ctx.strokeStyle = "rgba(4,3,2,0.9)";
    for (let i = 0; i < 9; i += 1) {
      const y = c[0][1] + ((c[3][1] - c[0][1]) * i) / 9;
      ctx.beginPath();
      ctx.moveTo(c[0][0] - 20 * S, y);
      ctx.lineTo(c[1][0] + 20 * S, y + 6 * S);
      ctx.stroke();
    }
    // **褶子从手上那个角放射出来**——这是一块布被人攥住一角拖着走时唯一诚实的
    // 样子。拖得越远褶越深，左边越堆越紧（"东西压着，得再抻一把"就长在这儿）
    const heap = Math.min(1, -d / 0.42);
    ctx.globalAlpha = 0.42 + 0.34 * heap;
    ctx.strokeStyle = "rgba(3,2,1,0.95)";
    ctx.lineWidth = (3 + 2.4 * heap) * S;
    for (let i = 0; i < 9; i += 1) {
      const u = (i + 0.5) / 9;
      const far = [c[0][0] + (c[3][0] - c[0][0]) * u, c[0][1] + (c[3][1] - c[0][1]) * u];
      ctx.beginPath();
      ctx.moveTo(c[2][0], c[2][1]);
      ctx.quadraticCurveTo((c[2][0] + far[0]) / 2, (c[2][1] + far[1]) / 2 + (u - 0.5) * 70 * S,
        far[0], far[1]);
      ctx.stroke();
    }
    ctx.restore();
    // 麻苫的毛边：底下一排散出来的草茬
    ctx.save();
    ctx.strokeStyle = "rgba(58,44,22,0.65)";
    ctx.lineWidth = 2.4 * S;
    for (let i = 0; i < 22; i += 1) {
      const u = i / 22;
      const x0 = c[3][0] + (c[2][0] - c[3][0]) * u;
      const y0 = c[3][1] + (c[2][1] - c[3][1]) * u;
      const len = (5 + 9 * Hash(`foldFray${i}`)) * S;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + 3 * S * (Hash(`foldFrayX${i}`) - 0.5), y0 + len);
      ctx.stroke();
    }
    ctx.restore();
  } else {
    // 揭下来之后：堆在左边画框外，只露一角
    FoldQuad(ctx, [
      P(-0.09, M.y0 + 0.03), P(M.x0 + 0.052, M.y0 + 0.085),
      P(M.x0 + 0.030, M.y1 - 0.01), P(-0.09, M.y1 - 0.05),
    ], "foldCoverHeap", "#0d0b06", S, { lw: 5, shade: "rgba(0,0,0,0.38)" });
  }

  // ── 手上正攥着的那个角 ──
  // 招呼**长在实物上**（悬空的抽象图形一律不许有）：没上手的时候那个角自己
  // 翘起来、朝该去的方向蹭两下；攥住了就翻起来，底下露出一小片影。
  // 揭苫那一下的角已经是苫子自己的角（上面画过了），只补一道翘起来的高光。
  if (cur) {
    const tp = P(tip.x, tip.y);
    const dx = cur.to.x - cur.from.x, dy = cur.to.y - cur.from.y;
    const dd = Math.hypot(dx, dy) || 1;
    const ux = dx / dd, uy = dy / dd;
    const nudge = view.grab ? 0 : (Math.sin(t * 2.2) * 0.5 + 0.5) * 0.024;
    const ax = tp[0] + ux * nudge * W, ay = tp[1] + uy * nudge * W;
    const lift = (view.grab ? 34 : 18) * S;
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(ax + 5 * S, ay + 9 * S, 30 * S, 12 * S, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (idx === 0) {
      // 苫子那一下：整个角真的翻起来了，画成一小片翻过来的布。
      // **颜色只比苫子亮一线**（那是布的背面）——第一版给了 #39311f，实拍出来
      // 是压在暗苫子上的一块浅色饼，读成"另有一件东西"，不是"角被拈起来了"
      FoldQuad(ctx, [
        [ax - 26 * S, ay + 9 * S], [ax + 24 * S, ay + 6 * S],
        [ax + 16 * S - ux * lift, ay - 17 * S - lift * 0.7],
        [ax - 18 * S - ux * lift, ay - 12 * S - lift * 0.7],
      ], "foldGrip", "#15110a", S, { lw: 3.4, shade: "rgba(0,0,0,0.30)", amp: 2.4 });
    } else {
      // 衣裳那三下：捏住的是布边，**不许再画一块新的布**盖上去（画了就是
      // "衣裳上趴着一块小方片"）。只给一撮拎起来的褶：暗芯一道、迎光一线亮
      const w = 26 * S, h = 13 * S + lift * 0.5;
      InkLine(ctx, ax - w, ay + 6 * S, ax - w * 0.2 - ux * lift * 0.5, ay - h,
        "foldPinchA", { lw: 4 * S, color: "rgba(2,2,2,0.85)", amp: 2 * S });
      InkLine(ctx, ax + w, ay + 4 * S, ax + w * 0.2 - ux * lift * 0.5, ay - h,
        "foldPinchB", { lw: 4 * S, color: "rgba(2,2,2,0.85)", amp: 2 * S });
      InkLine(ctx, ax - w * 0.15 - ux * lift * 0.5, ay - h, ax + w * 0.15 - ux * lift * 0.5, ay - h * 0.86,
        "foldPinchTip", { lw: 3 * S, color: "rgba(58,56,48,0.7)", amp: 1.6 * S });
    }

    // 落点画成**那道将要折出来的折痕**，不是一个悬空的记号（第 8 条：招呼长在
    // 实物上）。折痕当然是横在折的方向上的——所以这条线垂直于该拖的方向，
    // 一并就把"往哪儿拖"说清楚了，一个字都不用写
    if (!view.grab) {
      const to = P(cur.to.x, cur.to.y);
      const half = 0.075 * W;
      ctx.save();
      ctx.setLineDash([10 * S, 12 * S]);
      ctx.strokeStyle = "rgba(174,146,92,0.40)";
      ctx.lineWidth = 3 * S;
      ctx.beginPath();
      ctx.moveTo(to[0] + uy * half, to[1] - ux * half);
      ctx.lineTo(to[0] - uy * half, to[1] + ux * half);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── 抻那一下（揭苫）：吃上劲的时候苫子绷出几道纵向的纹 ──
  if (cur?.cinch && view.homed) {
    const c = clamp01(view.cinch);
    ctx.save();
    ctx.globalAlpha = 0.20 + 0.40 * c;
    ctx.strokeStyle = "#8a7442";
    ctx.lineWidth = 2.6 * S;
    for (let i = 0; i < 5; i += 1) {
      const y = tip.y - 0.09 + i * 0.045;
      ctx.beginPath();
      ctx.moveTo(...P(tip.x + 0.025, y));
      ctx.lineTo(...P(tip.x + 0.15 + 0.05 * c, y + 0.006));
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── 灯光：最后铺，压在所有东西上（光是照在它们身上的，不是它们身后的） ──
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const lp = P(L.lamp.x, L.lamp.y);
  const pool = ctx.createRadialGradient(lp[0], lp[1], 0.02 * W, lp[0] + 0.09 * W, lp[1] + 0.02 * W, 0.66 * W);
  pool.addColorStop(0, "rgba(84,56,20,0.42)");
  pool.addColorStop(0.30, "rgba(58,38,14,0.18)");
  pool.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = pool;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // 四角压暗，和别的活卡一个调子；停在最后那两秒半时再压一档，
  // 光只剩衣裳上那一点——那一镜要的就是"别的都退出去"
  const vg = ctx.createRadialGradient(W * 0.52, H * 0.50, H * (0.36 - 0.14 * linger),
    W * 0.52, H * 0.52, H * 0.94);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, `rgba(4,3,2,${0.66 + 0.22 * linger})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

// 开坛口的活卡（找吃的第四道手，第七稿）。每帧重画，view = Core 的
// state.wrapCard，L = WRAP_CARD，t = 秒。版面坐标全在 L 里（卡宽单位），
// **这儿绝不另抄一套**。
//
// 为什么非得是一张卡：坛口拢共 0.22m，玩法景别的画宽 8.7m——2.5%，
// 屏幕上是一粒扣子。同石笔/刨子/接绳（CLAUDE.md 拟物交互第 4 条）。
//
// 第七稿的封法：**坛口糊着一圈干泥，泥上盖半块碗底**（豁口碗的底，圈足朝上），
// 碗片底下垫着一圈蓝底白花的碎布——暗线的第二面。两段动作：
//   unwind＝抠泥（按住 E＋↑，指头顺着圈一段一段啃，泥真的一块一块掉）；
//   peel＝揭碗片（同一个键继续，碗片往左下揭起，底下的碎布垫圈和红薯干露出来）。
// 输入 2026-08-17 起只有按住 E＋↑（Core 的 unwrapJar），卡只管画：进度、指头的角度
//（view.a＝Core 的 WrapEdgeAngle）、碗片揭起多少全从 view 里来。
// 画的顺序＝封坛那天的先后（画笔通病第 1 条）：先有坛、再垫布、再扣碗底、
// 最后糊泥——所以泥压在碗片边上、碗片压在布上、布压在坛口上。
// 玩家抠掉一段，就真少画一段。
// ---------------------------------------------------------------------------
// 配色一律**按 sRGB 那条老账压两档**（CanvasTexture 没声明色彩空间，上屏整体
// 提亮一大截）。实拍量过一版——源色 #9c7434 上屏是 #e8d3a8，亮度从 0.46 抬到
// 0.83。所以这几个数看着"黑得离谱"才是对的。
// 干泥箍。**按 sRGB 那笔老账压两档**：CanvasTexture 没声明色彩空间，全场提亮
// 两档，原来的 #4c4130 在画面上是一坨发白的米色（实测亮度 131），比坛子(99)
// 亮出一大截、离碗片(141)只差十来级——两样贴在一起就糊成一坨（2026-08-13
// 实拍退回两轮）。**别再靠估**：拿 `shot --eval` 采一遍渲染后的像素再定值。
// 目标是把这张卡的明度拉开：碗片 ~140（要抓的那件）> 泥 ~110 > 布 ~82
const WRAP_MUD = "#2a2318";
const WRAP_MUD_D = "#1b160e";       // 泥的背光块与裂缝
const WRAP_SHARD = "#45423a";       // 半块粗瓷碗底：糙瓷，比坛身亮半档才立得住
const WRAP_SHARD_D = "#302e27";
const WRAP_FOOT = "#585349";        // 圈足：磨得发白的一圈
// 碎布垫圈：蓝底白花的土布——娘那件短褂上剪下来的（2026-08-12 用户改稿钉死的
// 暗线：跟夜里窖角那件短褂同一块布，FOLD_CLOTH 那头是同一个色系）
const WRAP_CLOTH = "#151b26";       // 靛蓝土布（按 sRGB 老账压两档）
const WRAP_BLOOM = "rgba(188,196,208,0.55)";   // 白花：洗褪了的印花点子
const WRAP_JAR = "#22201b";         // 灰陶：整张卡里最沉的一块，泥与碗片压在它上头

export function DrawWrapCard(ctx, W, H, view, L, t) {
  const S = H / 720;
  const P = (x, y) => [x * W, y * W];
  const c = L.neck;
  const cx = c.x * W, cy = c.y * W, cr = c.r * W;
  const peel = Math.max(0, Math.min(1, view.open || 0));
  // 抠泥的进度：抠完第几圈（laps）、这一圈抠到哪（lapK）。泥圈分三箍
  //（外→内一圈一圈啃），已抠掉的地方露出坛口沿——进度长在泥上，不在环上
  const laps = view.phase === "peel" ? L.laps : Math.min(L.laps, view.laps || 0);
  const lapK = view.phase === "peel" ? 1 : Math.max(0, Math.min(1, view.lapK || 0));
  // 起手豁口的方位（L.tip 相对坛心）：抠是从这儿起的手，屏幕逆时针一路啃过去
  const tipA = Math.atan2((L.tip.y - c.y) / 0.42, L.tip.x - c.x);

  LiveCardBase(ctx, W, H, "#6b5a3c");

  // ── 底：刨开的那个坑（土沿压住下画框，罐坐在坑里） ──
  InkFill(ctx, [[-40 * S, H * 0.80], [W * 0.28, H * 0.70], [W * 0.72, H * 0.72],
    [W + 40 * S, H * 0.83], [W + 40 * S, H + 40 * S], [-40 * S, H + 40 * S]],
  "wrPit", "#4a4034", { amp: 6 * S, lw: 6 * S, shade: "rgba(0,0,0,0.34)" });
  ctx.save();
  // 坑里的暗。**收得紧一点**：这一拍的散焦背景是大白天的院子，亮得发白，
  // 罐子、泥、碗片全是中间调，摊在那片白上就是一团糊（实拍量过：整张卡的
  // 明度全挤在 78~141 之间）。把坑的暗收到罐子跟前，主体才从背景里立出来
  // 收窄半径是**反的**（试过一版 2.7）：外圈一没了，白花花的散焦背景反而
  // 露出更多。要的是罩得更广、压得更狠，连画框角上也留一点，才不至于
  // 中间一坨暗、四角一片白
  const pit = ctx.createRadialGradient(cx, cy + cr * 0.6, cr * 0.3, cx, cy + cr * 0.8, cr * 4.8);
  pit.addColorStop(0, "rgba(12,9,5,0.92)");
  pit.addColorStop(0.35, "rgba(14,10,6,0.86)");
  pit.addColorStop(0.70, "rgba(14,10,6,0.60)");
  pit.addColorStop(1, "rgba(14,10,6,0.20)");
  ctx.fillStyle = pit;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // ── 罐：肩往下越张越开，坐在坑里；口沿一圈厚唇 ──
  InkFill(ctx, [[cx - cr * 1.02, cy + cr * 0.10], [cx - cr * 1.34, cy + cr * 1.5],
    [cx - cr * 1.5, H], [cx + cr * 1.5, H], [cx + cr * 1.34, cy + cr * 1.5],
    [cx + cr * 1.02, cy + cr * 0.10]],
  "wrJarBody", WRAP_JAR, { amp: 4 * S, lw: 6 * S, shade: "rgba(0,0,0,0.34)" });
  // 拉坯的旋纹：一圈圈横的，越往下越宽
  ctx.save();
  ctx.strokeStyle = "rgba(28,22,15,0.28)";
  ctx.lineWidth = 2.2 * S;
  for (let i = 0; i < 5; i += 1) {
    const y = cy + cr * (0.5 + i * 0.42);
    const rx = cr * (1.06 + i * 0.06);
    ctx.beginPath();
    ctx.ellipse(cx, y, rx, cr * 0.16, 0, 0.15, Math.PI - 0.15);
    ctx.stroke();
  }
  ctx.restore();
  // 口沿：厚唇一圈
  ctx.save();
  ctx.fillStyle = WRAP_JAR;
  ctx.strokeStyle = "rgba(24,17,10,0.92)";
  ctx.lineWidth = 5 * S;
  ctx.beginPath();
  ctx.ellipse(cx, cy, cr * 1.06, cr * 0.44, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // 罐口那团黑（布掀开之后才见得着，也是整张卡的底色锚）
  ctx.save();
  ctx.fillStyle = "rgba(10,7,4,0.95)";
  ctx.beginPath();
  ctx.ellipse(cx, cy, cr * 0.88, cr * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // 掀开一半就看得见里头：小半罐红薯干（干瘪、颜色发暗红褐，别画成一堆橙块）
  if (peel > 0.25) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, (peel - 0.25) / 0.4);
    ctx.beginPath();
    ctx.ellipse(cx, cy + cr * 0.06, cr * 0.82, cr * 0.30, 0, 0, Math.PI * 2);
    ctx.clip();
    for (let i = 0; i < 16; i += 1) {
      const a = Hash("wrYam" + i) * Math.PI * 2;
      const rr = Math.sqrt(Hash("wrYr" + i)) * cr * 0.78;
      const yx = cx + Math.cos(a) * rr, yy = cy + cr * 0.06 + Math.sin(a) * rr * 0.36;
      ctx.save();
      ctx.translate(yx, yy);
      ctx.rotate(Hash("wrYa" + i) * 1.6 - 0.8);
      ctx.fillStyle = i % 3 ? "#4a2d16" : "#5c3d1f";
      ctx.beginPath();
      ctx.ellipse(0, 0, cr * (0.12 + Hash("wrYw" + i) * 0.07), cr * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  // 碎布垫圈（蓝底白花，暗线的第二面）**画在碗片那一组里**——见下面。
  // 原来它是独立的一圈布箍，中间留着口：可**半块碗底盖不住一个圆口**
  //（2026-08-13 实拍：碗片改成规规矩矩的半圆之后，坛口当中张着一个大黑洞）。
  // 现实里的次序本来就是「口上先蒙布、布上压碗片、再糊泥」，所以盖住口的是
  // 那块**布**，碗片只是压在布上的一块重家伙。布跟着碗片一起被揭走。
  const cyRim = cy - cr * 0.04;

  // ── 半块碗底：豁口碗的底，圈足朝上扣在口当中。揭开＝捏住边往左下起 ──
  // 判定与作画共用 view.corner / view.open 这两个数，Art 里不另算一份
  const corner = view.corner || L.cloth;
  const cpx = P(corner.x, corner.y);
  {
    const dragX = (corner.x - L.cloth.x) * W;
    const dragY = (corner.y - L.cloth.y) * W;
    ctx.save();
    ctx.translate(cx + dragX, cyRim + dragY);
    // **盖子得比口大**，不然它掉得进去。坛口那团黑是 0.88cr、厚唇口沿 1.06cr，
    // 老版碗片才 0.80cr——比洞还小，中间那团黑于是从"盖着的"碗片当中透出来
    const er = cr * 1.00;
    // **躺着的东西要在自己的平面里转，不能把压扁了的形状整个去转。**
    // 老版把点按 `sin(a)*er*0.42` 先压好，再 `ctx.rotate(-peel*0.85)` 转整片——
    // 压缩轴跟着一起转，于是碗越揭越被拉成一条斜的长片（用户 2026-08-13：
    //「那个傻逼一样的碗的面还会被莫名其妙拉长」）。
    // 正确的分解：**先在正圆里转，再压纵轴**；而"揭起来"本身是压缩量变小
    //（碗从躺着转向正对镜头，短轴长回来）。这两件事分开，形状就永远是只碗。
    // 不用 ctx.scale 是因为它连墨线宽度一起压——只在点上做。
    const spin = -peel * 0.55;                 // 起开那一下，在自己平面里带一点转
    const tilt = 0.42 + 0.46 * peel;           // 躺着 0.42 → 立起来快正对镜头
    const Pt = (a, r, dy = 0) => {
      const x = Math.cos(a + spin) * r;
      const y = Math.sin(a + spin) * r;
      return [x, y * tilt + dy];
    };

    // ── 先画布：蒙在口上的那块蓝底白花，**整幅盖住坛口**（半块碗底盖不住圆口）。
    // 它跟碗片同一组变换，所以揭碗片的时候布是跟着一起走的——底下的坛口与
    // 红薯干这才露出来。四个布角从碗片底下探出去，一眼看得出底下垫着东西
    {
      const gr = cr * 1.16;
      for (const a of [-2.35, -0.62, 0.92, 2.58]) {
        const bx = Math.cos(a + spin) * gr * 1.02, by = Math.sin(a + spin) * gr * 1.02 * tilt;
        InkFill(ctx, [
          [bx - Math.sin(a) * cr * 0.16, by + Math.cos(a) * cr * 0.10 * tilt],
          [bx + Math.cos(a) * cr * 0.30, by + Math.sin(a) * cr * 0.22 * tilt],
          [bx + Math.sin(a) * cr * 0.16, by - Math.cos(a) * cr * 0.10 * tilt],
        ], "wrGaskTip" + a.toFixed(1), WRAP_CLOTH, { amp: 2 * S, lw: 3.5 * S });
      }
      const gp = [];
      for (let i = 0; i <= 26; i += 1) {
        const a = (i / 26) * Math.PI * 2;
        gp.push(Pt(a, gr * (1 + 0.045 * Math.sin(a * 4 + 0.9) + 0.025 * Math.sin(a * 9))));
      }
      InkFill(ctx, gp, "wrGask", WRAP_CLOTH,
        { amp: 2 * S, lw: 4.5 * S, shade: "rgba(0,0,0,0.30)", shadeAt: 0.55 });
      // 白花：稀稀拉拉几簇。这几点白就是暗线的记号——窖里那件短褂上是同一种花
      for (let i = 0; i < 7; i += 1) {
        const a = Hash("wrGBloomA" + i) * Math.PI * 2;
        const b = Pt(a, gr * (0.34 + Hash("wrGBloomR" + i) * 0.58));
        ctx.fillStyle = WRAP_BLOOM;
        for (let p2 = 0; p2 < 3; p2 += 1) {
          const pa = (p2 / 3) * Math.PI * 2 + Hash("wrGBloomP" + i) * 2;
          ctx.beginPath();
          ctx.ellipse(b[0] + Math.cos(pa) * cr * 0.038, b[1] + Math.sin(pa) * cr * 0.026 * tilt,
            cr * 0.023, cr * 0.016, pa, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // 半块碗底：从掰断那条弦的一头，绕半圈到另一头。
    // **必须一眼看出是"半块"**——老版弧扫了 198°、茬口又折回当中，
    // 读出来是一整张缺了个角的圆盘（"鬼看得出来是碗"）。现在正正一个半圆，
    // 弦上是掰断的茬，弧上是碗沿。
    // 断口这条弦**要斜着横过去**。BRK 决定弦的方向：0.30 那档压扁之后几乎是
    // 水平的，画面上就成了"上半蓝、下半灰"两块拼色，读不出"一块瓷片压在布上"。
    // −0.55 让弦斜着走，碗片这才像**搁**在那儿的一块东西
    const BRK = -0.55;
    // 碗片压在布上的影子：没有它，瓷片和布是同一个平面上的两块颜色
    ctx.save();
    ctx.fillStyle = "rgba(8,6,3,0.34)";
    ctx.beginPath();
    for (let i = 0; i <= 18; i += 1) {
      const a = BRK + (i / 18) * Math.PI;
      const p = Pt(a, er * 0.99, cr * 0.045);
      if (i === 0) ctx.moveTo(p[0] + cr * 0.02, p[1]); else ctx.lineTo(p[0] + cr * 0.02, p[1]);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    const pts = [];
    for (let i = 0; i <= 16; i += 1) {
      const a = BRK + (i / 16) * Math.PI;
      // 碗沿不是正圆：粗瓷碗本来就歪，边上还啃过
      const wob = 1 + 0.035 * Math.sin(a * 5 + 1.1) + 0.02 * Math.sin(a * 11);
      pts.push(Pt(a, er * wob));
    }
    // 断口：一条**锯齿的弦**（瓷是崩断的，不是切开的），三进三出
    for (let i = 1; i < 6; i += 1) {
      const s2 = i / 6;
      const a0 = BRK + Math.PI, a1 = BRK;
      const bx = Math.cos(a0 + spin) * er + (Math.cos(a1 + spin) * er - Math.cos(a0 + spin) * er) * s2;
      const by = (Math.sin(a0 + spin) * er + (Math.sin(a1 + spin) * er - Math.sin(a0 + spin) * er) * s2) * tilt;
      const jag = (i % 2 ? 1 : -1) * er * (0.028 + Hash("wrBrk" + i) * 0.032);
      pts.push([bx - Math.sin(BRK + spin) * jag, by + Math.cos(BRK + spin) * jag * tilt]);
    }
    InkFill(ctx, pts, "wrShard", WRAP_SHARD,
      { amp: 2.2 * S, lw: 5 * S, shade: "rgba(0,0,0,0.3)", shadeAt: 0.6 });

    // **碗要仰着放，让人看得见碗窝。**
    // 老版是照现实那样底朝上扣着（圈足朝天）——现实是对的，可一只碗的**底**
    // 从上面看就是一条圆弧加一个圈，谁也认不出那是碗（用户：「这他妈鬼看得
    // 出来是碗」）。仰过来只多一个前提（碎瓷片随手一撂），却把碗最认得出的
    // 两样东西一起给出来了：**一圈碗沿，和沿里头凹下去的那个窝**。
    //
    // 窝＝内壁一圈渐变（远壁受光、近壁在暗处）+ 当中一小片平底。
    // 内壁那圈**要压暗**，凹进去这件事全靠它
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i <= 20; i += 1) {
      const a = BRK + 0.06 + (i / 20) * (Math.PI - 0.12);
      const p = Pt(a, er * 0.90);
      if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
    }
    ctx.closePath();
    ctx.clip();
    const bowlG = ctx.createLinearGradient(0, -er * tilt, 0, er * tilt);
    bowlG.addColorStop(0, "rgba(232,228,214,0.30)");     // 对面那道内壁：迎着光
    bowlG.addColorStop(0.42, "rgba(0,0,0,0.10)");
    bowlG.addColorStop(1, "rgba(0,0,0,0.46)");           // 近处内壁：整个沉在暗里
    ctx.fillStyle = bowlG;
    ctx.fillRect(-er * 1.2, -er * 1.2, er * 2.4, er * 2.4);
    ctx.restore();
    // 碗窝当中那一小片平底：比内壁再暗半档，边上一圈涩的（没上釉的那圈）
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i <= 16; i += 1) {
      const a = BRK + 0.20 + (i / 16) * (Math.PI - 0.40);
      const p = Pt(a, er * 0.34, er * 0.10 * tilt);
      if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
    }
    ctx.closePath();
    ctx.fillStyle = WRAP_SHARD_D;
    ctx.fill();
    ctx.strokeStyle = "rgba(20,18,12,0.5)";
    ctx.lineWidth = 2.4 * S;
    ctx.stroke();
    ctx.restore();
    // 碗沿：釉面在沿上磨得发亮的一道，**这道亮边是"这是只碗"最硬的记号**
    ctx.save();
    ctx.lineCap = "round";
    for (const [col, lw, dy] of [["rgba(24,21,14,0.55)", 6 * S, 1.6 * S],
      [WRAP_FOOT, 3.4 * S, 0], ["rgba(226,226,214,0.5)", 1.6 * S, -1.4 * S]]) {
      ctx.beginPath();
      for (let i = 0; i <= 20; i += 1) {
        const a = BRK + 0.04 + (i / 20) * (Math.PI - 0.08);
        const p = Pt(a, er * 0.955, dy);
        if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
      }
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
    ctx.restore();

    // 断口的**厚度**：碗壁就那么几毫米，可这几毫米是"这是块瓷片"的全部证据。
    // 沿着弦铺一条窄带，用没上釉的生瓷色——比釉面白得多
    ctx.save();
    ctx.strokeStyle = "rgba(196,196,184,0.42)";
    ctx.lineWidth = 3.4 * S;
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const p = pts[pts.length - 6 + i];
      if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();
    ctx.restore();
    // 那只碗本来就有的豁口：碗沿上啃缺的一小口（"豁口碗"这个名字的由来）
    ctx.save();
    ctx.fillStyle = "rgba(14,12,8,0.85)";
    const nick = Pt(BRK + Math.PI * 0.34, er * 0.99);
    ctx.beginPath();
    ctx.ellipse(nick[0], nick[1], er * 0.09, er * 0.05 * (0.4 + tilt * 0.6), 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();
    // 被捏住的那道边单画在手底下：翘起来的一小片瓷沿，跟着 view.corner 走
    if (view.phase === "peel" && peel < 1) {
      const from = [cx - cr * 0.56, cyRim - cr * 0.20];
      InkFill(ctx, [
        [from[0], from[1]],
        [cpx[0] + cr * 0.10, cpx[1] - cr * 0.04],
        [cpx[0] - cr * 0.05, cpx[1] + cr * 0.10],
        [from[0] + cr * 0.20, from[1] + cr * 0.18],
      ], "wrGrabLip", WRAP_SHARD, { amp: 2 * S, lw: 4 * S, shade: "rgba(0,0,0,0.26)" });
      InkLine(ctx, cpx[0] - cr * 0.04, cpx[1] - cr * 0.02, cpx[0] + cr * 0.08, cpx[1] + cr * 0.02,
        "wrGrabChip", { lw: 2 * S, color: "rgba(178,182,170,0.55)", amp: 1 * S });
    }
  }

  // ── 糊在坛口上的那圈泥（2026-08-13 整个重画）──
  //
  // 用户原话：「坛口糊着泥 哪里糊着了？画成这个样子是糊着泥？鬼看得出来？」
  // 老版是**45 个各自描边的小方块**（三箍 × 15 块）排在 r=1.36cr 上——
  // 两个致命处：
  //   ① 1.36cr 在坛口沿（1.06cr）**外面**，泥悬在坛肩的空气里，什么都没糊住。
  //      封坛的泥是抹在"碗片压着坛口"这道缝上的，它必须同时骑在碗片和口沿上。
  //   ② 一块一块各描各的边＝读出来是四十五个小物件绕成一圈（画面上那圈
  //      炸开的木片/花瓣），不是一坨抹上去的泥。**糊上去的东西只有一个轮廓。**
  //
  // 现在：**一条连续的泥箍**——一个 path、一次填充、一条外轮廓。
  // 内沿咬住碗片（0.62cr），外沿盖过口沿垂下来（最厚 1.24cr），两条沿都是
  // 手抹出来的起伏（"四边笔直＝没有手"，光滑圆弧也一样）。抠的进度长在泥上：
  // 外沿一层层往里退，本圈啃过的那一段先薄一档——绕到哪儿一眼看得见。
  const GAP = L.gap ?? 0.42;               // 起手位那个豁口（tip 处，本来就缺一块）——与 Core 的 WrapEdgeAngle 同一个数
  if (laps < L.laps) {
    const eaten = lapK * (Math.PI * 2 - GAP);
    // **泥是骑在缝上的一道箍，不是一块盖布。** 碗片外沿 1.00cr、口沿 1.06cr，
    // 所以泥从 0.90 起（咬住碗片一圈）到 1.26（垂过口沿挂在坛肩上）。
    // 内沿再往里就把碗整个埋了——玩家得看得见自己在揭的是块碗底
    // **箍要窄。** 封坛抹的是一道两三指宽的泥，箍着口沿；摊到口径的一倍半
    // 就不是封口泥了，是一张摊在坛子上的面饼（实拍退回两轮的另一半原因）
    const R_IN = 0.92;
    const rOutAt = (n) => 1.17 - n * 0.085;                   // 剩几层就有多厚
    const rFull = rOutAt(laps), rThin = rOutAt(laps + 1);
    // 外沿：从豁口起，屏幕逆时针一路数过去。本圈已经啃过的那段用薄的那一档
    // **外沿是一指一指按出来的。** 先画个圈再加抖动，出来的永远是个胶圈——
    // 抖大了成一朵花、抖小了成一只贝果，两版都实拍退回过。封坛的泥是拿拇指
    // 一按一按赶着走的：**每按一下是一个鼓包，鼓包彼此叠着，边自然成扇贝形**。
    // 让轮廓从动作里长出来——这正是全作画笔的第一条（画的顺序＝事情发生的顺序）。
    const PRESS = 14;
    const pressAt = [];
    for (let i = 0; i < PRESS; i += 1) {
      const dp = GAP + ((i + 0.5) / PRESS) * (Math.PI * 2 - GAP);
      const wornK = dp < eaten ? Math.max(0.18, (rThin - R_IN) / Math.max(1e-3, rFull - R_IN)) : 1;
      pressAt.push({
        a: tipA - dp,
        r: cr * (R_IN + (rFull - R_IN) * 0.52),
        rad: cr * (rFull - R_IN) * (0.70 + Hash("wrPrs" + i) * 0.48) * wornK,
      });
    }
    // 从坛心射出去的一条线撞到哪个鼓包最远，外沿就在那儿（射线—圆求交）
    const OuterAt = (a) => {
      let best = cr * R_IN * 1.03;
      for (const p of pressAt) {
        let d = a - p.a;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        const perp = p.r * Math.sin(d);
        if (Math.abs(perp) >= p.rad) continue;
        const reach = p.r * Math.cos(d) + Math.sqrt(p.rad * p.rad - perp * perp);
        if (reach > best) best = reach;
      }
      return best;
    };
    const N = 132;
    const outer = [], inner = [];
    for (let i = 0; i <= N; i += 1) {
      const d0 = GAP + (i / N) * (Math.PI * 2 - GAP);
      const a = tipA - d0;
      // 手抹的起伏。**不许是周期性的**：三个正弦叠出来的边缘匀得像齿轮，
      // 一眼就是"生成的"。拿 Hash 按段落给不同的胖瘦，再叠一点高频毛边，
      // 外沿另挂两处往下坠的厚块——泥是稠的，抹到边上会自己坠一坨
      // 起伏要**小**：抹上去的泥边是毛的，不是花瓣。0.86~1.16 那一档
      // 把箍啃成了一朵花（实拍退回）
      const rO = OuterAt(a) * (1 + 0.012 * Math.sin(d0 * 17.3));    // 一点毛边
      const rI = cr * R_IN * (1 + 0.05 * Math.sin(d0 * 6.3 + 2.2)
        + 0.035 * (Hash("wrMudIn" + Math.floor(d0 * 2.6)) - 0.5));
      outer.push([cx + Math.cos(a) * rO, cyRim + Math.sin(a) * rO * 0.42]);
      inner.push([cx + Math.cos(a) * rI, cyRim + Math.sin(a) * rI * 0.42]);
    }
    // 一条闭合路径：外沿去、内沿回。整坨泥就这一个轮廓
    const band = outer.concat(inner.reverse());
    InkFill(ctx, band, "wrMudBand", WRAP_MUD,
      { amp: 1.6 * S, lw: 4 * S, shade: "rgba(0,0,0,0.30)", shadeAt: 0.55 });
    // 一坨泥得有背光面，不然它是块平的面片。整条箍按光从左上来分明暗：
    // 右下沉下去、左上抬起来，内沿再压一道（它是叠在碗片上的，有个台阶）
    ctx.save();
    ctx.beginPath();
    band.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    ctx.clip();
    const lg = ctx.createLinearGradient(cx - cr, cyRim - cr * 0.6, cx + cr, cyRim + cr * 0.7);
    lg.addColorStop(0, "rgba(214,196,150,0.10)");
    lg.addColorStop(0.45, "rgba(0,0,0,0)");
    lg.addColorStop(1, "rgba(0,0,0,0.34)");
    ctx.fillStyle = lg;
    ctx.fillRect(cx - cr * 2, cyRim - cr * 2, cr * 4, cr * 4);
    // 内沿的台阶影：泥爬上碗片那一下
    ctx.strokeStyle = "rgba(12,9,4,0.40)";
    ctx.lineWidth = 7 * S;
    ctx.beginPath();
    ctx.ellipse(cx, cyRim, cr * R_IN, cr * R_IN * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // 抹的手印：一道道**顺着圈**的短弧，压在泥面上——泥是拿拇指一路赶过去的
    ctx.save();
    ctx.lineCap = "round";
    for (let i = 0; i < 11; i += 1) {
      const d0 = GAP + Hash("wrThumbD" + i) * (Math.PI * 2 - GAP);
      if (d0 < eaten) continue;
      const rk = R_IN + 0.05 + Hash("wrThumbR" + i) * Math.max(0.06, rFull - R_IN - 0.12);
      const span = 0.22 + Hash("wrThumbS" + i) * 0.20;
      // 手印要真看得见：淡到 0.26 等于没画（实拍看过去是一坨没有手的面团）
      for (const [col, lw, off] of [["rgba(18,13,6,0.55)", 3.6 * S, 0],
        ["rgba(196,176,132,0.42)", 2.0 * S, -2.8 * S]]) {
        ctx.beginPath();
        for (let j = 0; j <= 5; j += 1) {
          const a = tipA - (d0 + (j / 5) * span);
          const rr2 = cr * rk;
          const px3 = cx + Math.cos(a) * rr2;
          const py3 = cyRim + Math.sin(a) * rr2 * 0.42 + off;
          if (j === 0) ctx.moveTo(px3, py3); else ctx.lineTo(px3, py3);
        }
        ctx.strokeStyle = col;
        ctx.lineWidth = lw;
        ctx.stroke();
      }
    }
    ctx.restore();
    // 干透裂开的缝：**横着切过泥箍**（泥收缩就是这么裂的），不是一块一道
    for (let i = 0; i < 9; i += 1) {
      const d0 = GAP + Hash("wrCrackD" + i) * (Math.PI * 2 - GAP);
      if (d0 < eaten) continue;
      const a = tipA - d0;
      const r0 = cr * (R_IN + 0.03), r1 = cr * (rFull - 0.04);
      InkLine(ctx,
        cx + Math.cos(a) * r0, cyRim + Math.sin(a) * r0 * 0.42,
        cx + Math.cos(a) * r1, cyRim + Math.sin(a) * r1 * 0.42,
        "wrCrack" + i, { lw: 2.2 * S, color: "rgba(12,9,4,0.72)", amp: 1.8 * S });
    }
    // 泥压在坛口沿上的那道接触暗线：没有它，泥看着还是"浮"在坛上
    ctx.save();
    ctx.strokeStyle = "rgba(10,8,4,0.34)";
    ctx.lineWidth = 3 * S;
    ctx.beginPath();
    ctx.ellipse(cx, cyRim, cr * R_IN, cr * R_IN * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // 正在抠的那道断茬：新掰开的泥口，比泥面亮一档（里头还没干透）
    if (view.phase === "unwind") {
      const aEdge = tipA - GAP - eaten;
      InkLine(ctx,
        cx + Math.cos(aEdge) * cr * R_IN, cyRim + Math.sin(aEdge) * cr * R_IN * 0.42,
        cx + Math.cos(aEdge) * cr * rFull, cyRim + Math.sin(aEdge) * cr * rFull * 0.42,
        "wrMudEdge", { lw: 2.6 * S, color: "rgba(138,120,86,0.75)", amp: 1.4 * S });
    }
  }
  // 抠下来的泥渣：一段一段攒在坛肩上（掉了的没有消失，它落在那儿）
  const doneK = Math.min(1, (laps + lapK) / L.laps);
  const crumbs = Math.round(doneK * 16);
  ctx.save();
  for (let i = 0; i < crumbs; i += 1) {
    const t2 = Hash("wrCrX" + i);
    const px2 = cx + (t2 - 0.5) * cr * 2.6;
    const py2 = cy + cr * (1.30 + Hash("wrCrY" + i) * 0.55);
    ctx.fillStyle = i % 3 ? WRAP_MUD : WRAP_MUD_D;
    ctx.beginPath();
    ctx.ellipse(px2, py2, cr * (0.05 + Hash("wrCrR" + i) * 0.05), cr * 0.035,
      Hash("wrCrA" + i) * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // ── 玩家手底下的那一点 ──
  if (view.phase !== "peel") {
    // 手指抵着泥圈：跟着手的角度走；没上手时自己朝**该抠的方向**蹭两下
    // （屏幕逆时针＝角度递减。三处同向：判定、画、招呼）
    const swing = view.a !== null && view.a !== undefined
      ? view.a
      : tipA - GAP - 0.28 * Math.max(0, Math.sin(t * 2.0));
    const rr = cr * (1.36 - Math.min(laps, L.laps - 1) * 0.17);
    const tx = cx + Math.cos(swing) * rr, ty = cyRim + Math.sin(swing) * rr * 0.42;
    if (view.grab) {
      // 手指经过处掉泥渣：两三粒从指下簌簌往下掉
      ctx.save();
      for (let i = 0; i < 3; i += 1) {
        const ph = (t * 2.2 + i * 0.37) % 1;
        ctx.globalAlpha = (1 - ph) * 0.8;
        ctx.fillStyle = i % 2 ? WRAP_MUD : WRAP_MUD_D;
        ctx.beginPath();
        ctx.ellipse(tx + Sym("wrFall" + i, 0, cr * 0.1), ty + cr * 0.1 + ph * cr * 0.9,
          2.6 * S, 1.8 * S, ph * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else {
      const pulse = view.reaching ? 0.55 + 0.4 * Math.sin(t * 13) : 0.42 + 0.34 * Math.sin(t * 3.0);
      KnotGlow(ctx, tx, ty, L.grabR * W * 1.35, 0.14 + pulse * 0.20);
      // 蹭的那一小道：顺着泥圈往该抠的方向
      ctx.save();
      ctx.globalAlpha = 0.32 * Math.max(0, Math.sin(t * 2.0));
      ctx.strokeStyle = "rgba(255,240,196,0.9)";
      ctx.lineWidth = 3.4 * S;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.ellipse(cx, cyRim, rr, rr * 0.42, 0, swing - 0.42, swing - 0.06);
      ctx.stroke();
      ctx.restore();
    }
  } else if (peel < 1) {
    KnotGlow(ctx, cpx[0], cpx[1], L.grabR * W * 1.5,
      view.grab ? 0.10 : 0.20 + 0.16 * Math.sin(t * 3.0));
  }

  // 四角压暗，和别的插卡一个调子
  const vg = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.32, W * 0.5, H * 0.5, H * 0.9);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(16,11,6,0.62)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------------------
// 掰红薯干的活卡（分食，第七稿第一章第二场）。每帧重画，view = Core 的
// state.splitCard，L = SPLIT_CARD，t = 秒。版面坐标全在 L 里（卡宽单位），
// **这儿绝不另抄一套**。三段：break（掰）→ sort（分）→ swap（换回去）。
// 反馈全长在那截红薯干上：弯到哪儿、断在哪儿、滴了几滴，画面自己说——
// 没有一根条、一个环、一个百分比。
// ---------------------------------------------------------------------------
// 配色按 sRGB 老账压两档（同 WRAP 那组的注释：源色"黑得离谱"才对）
const SPLIT_WOOD = "#241a10";       // 炕沿/矮桌的暗木
const SPLIT_BOWL = "#3f3c34";       // 粗瓷碗：糙釉发灰
const SPLIT_BOWL_D = "#2b2922";
const SPLIT_WATER = "#1c2622";      // 碗里温水的暗反光
const SPLIT_YAM = "#4a2d16";        // 泡软的红薯干（同坛里那把的色系）
const SPLIT_YAM_HI = "rgba(150,110,66,0.5)";   // 泡胀发亮的那层水光
const SPLIT_YAM_FIB = "#8a6a44";    // 掰弯处拉出来的纤维（弯处变浅）

/** 一只捏着东西的小手：孩子的手，偏瘦小。小臂从画框下缘伸上来 */
function SplitHand(ctx, x, y, S, side, pinch) {
  const d = side;                     // -1 左手 / +1 右手
  ctx.save();
  // 小臂 + 袖口（柱子那身土黄，压两档）
  InkFill(ctx, [
    [x + d * 30 * S, y + 60 * S], [x + d * 150 * S, y + 130 * S],
    [x + d * 210 * S, y + 620 * S], [x - d * 40 * S, y + 640 * S],
  ], "spArm" + d, "#6b4017", { amp: 4 * S, lw: 6 * S, shade: "rgba(0,0,0,0.24)" });
  InkFill(ctx, [
    [x + d * 16 * S, y + 52 * S], [x + d * 108 * S, y + 96 * S],
    [x + d * 88 * S, y + 168 * S], [x - d * 14 * S, y + 118 * S],
  ], "spCuff" + d, "#57340f", { amp: 3 * S, lw: 5 * S, shade: "rgba(0,0,0,0.2)" });
  // 手背：小而圆
  InkFill(ctx, [
    [x - d * 26 * S, y + 8 * S], [x + d * 20 * S, y - 2 * S], [x + d * 52 * S, y + 26 * S],
    [x + d * 46 * S, y + 74 * S], [x - d * 8 * S, y + 86 * S], [x - d * 38 * S, y + 46 * S],
  ], "spFist" + d, "#a87c52", { amp: 3 * S, lw: 5.5 * S, shade: "rgba(70,40,22,0.16)" });
  // 捏着的拇指与食指（pinch）或扶着的指头
  if (pinch) {
    InkFill(ctx, [
      [x - d * 20 * S, y + 10 * S], [x - d * 2 * S, y - 12 * S], [x + d * 10 * S, y - 6 * S],
      [x - d * 4 * S, y + 16 * S],
    ], "spThumb" + d, "#b28457", { amp: 2 * S, lw: 4.5 * S });
  }
  // 两道小指节
  for (let i = 0; i < 2; i += 1) {
    InkLine(ctx, x + d * (6 + i * 18) * S, y + 18 * S, x + d * (10 + i * 18) * S, y + 52 * S,
      "spKn" + d + i, { lw: 2.6 * S, color: "rgba(118,74,44,0.4)", amp: 2 * S });
  }
  ctx.restore();
}

/** 一截泡软的红薯干：两端点之间的一条厚条，wet=表面水光 */
function SplitPiece(ctx, x0, y0, x1, y1, wS, id, { fiberEnd = 0 } = {}) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
  };
  path(); ctx.strokeStyle = "rgba(16,10,5,0.95)"; ctx.lineWidth = wS + 5; ctx.stroke();
  path(); ctx.strokeStyle = SPLIT_YAM; ctx.lineWidth = wS; ctx.stroke();
  // 泡胀发亮：上沿一线水光
  ctx.strokeStyle = SPLIT_YAM_HI;
  ctx.lineWidth = wS * 0.28;
  ctx.beginPath();
  ctx.moveTo(x0 + (x1 - x0) * 0.08, y0 + (y1 - y0) * 0.08 - wS * 0.26);
  ctx.lineTo(x0 + (x1 - x0) * 0.9, y0 + (y1 - y0) * 0.9 - wS * 0.26);
  ctx.stroke();
  // 断口那头的纤维毛（fiberEnd: -1 朝 x0 那头 / +1 朝 x1 那头）
  if (fiberEnd) {
    const ex = fiberEnd > 0 ? x1 : x0, ey = fiberEnd > 0 ? y1 : y0;
    const dx = fiberEnd > 0 ? x1 - x0 : x0 - x1;
    const dy = fiberEnd > 0 ? y1 - y0 : y0 - y1;
    const dd = Math.hypot(dx, dy) || 1;
    ctx.strokeStyle = SPLIT_YAM_FIB;
    ctx.lineWidth = Math.max(1.4, wS * 0.12);
    for (let i = 0; i < 4; i += 1) {
      const sp = (i - 1.5) * wS * 0.22;
      ctx.beginPath();
      ctx.moveTo(ex - (dx / dd) * wS * 0.2, ey - (dy / dd) * wS * 0.2 + sp * 0.4);
      ctx.lineTo(ex + (dx / dd) * wS * (0.34 + Hash(id + "fb" + i) * 0.3),
        ey + (dy / dd) * wS * 0.3 + sp);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function DrawSplitCard(ctx, W, H, view, L, t) {
  const S = H / 720;
  const P = (x, y) => [x * W, y * W];
  const phase = view.phase || "break";
  const stripW = W * 0.026;                 // 条的粗细（0.026 卡宽 ≈ 一指）

  LiveCardBase(ctx, W, H, "#3a2c1a");

  // ── 案：炕沿/矮桌一条暗木沿，碗坐在它上面。上头留给虚化的窖 ──
  const surfY = (L.bowlL.y - L.bowlL.r * 0.55) * W;
  ctx.save();
  ctx.fillStyle = SPLIT_WOOD;
  ctx.fillRect(-8 * S, surfY, W + 16 * S, H - surfY + 8 * S);
  ctx.restore();
  InkLine(ctx, -10 * S, surfY, W + 10 * S, surfY - 4 * S, "spEdge",
    { lw: 5 * S, color: "rgba(8,5,2,0.9)", amp: 4 * S });
  InkLine(ctx, 6 * S, surfY + 9 * S, W - 6 * S, surfY + 7 * S, "spEdgeHi",
    { lw: 2.6 * S, color: "rgba(96,70,40,0.35)", amp: 3 * S });
  // 木纹两道
  for (let i = 0; i < 2; i += 1) {
    InkLine(ctx, W * 0.1, surfY + (40 + i * 44) * S, W * 0.92, surfY + (36 + i * 48) * S,
      "spGrain" + i, { lw: 2.2 * S, color: "rgba(52,36,20,0.4)", amp: 8 * S });
  }

  // ── 两只豁口碗：左她的、右他的。碗里一汪温水的暗反光 ──
  const Bowl = (bx0, by0, br, id, chipA) => {
    const bx = bx0 * W, by = by0 * W, r = br * W;
    // 碗身（碗帮往下收成圈足）
    InkFill(ctx, [
      [bx - r, by], [bx - r * 0.58, by + r * 0.60], [bx - r * 0.34, by + r * 0.70],
      [bx + r * 0.34, by + r * 0.70], [bx + r * 0.58, by + r * 0.60], [bx + r, by],
    ], id + "body", SPLIT_BOWL, { amp: 2.6 * S, lw: 5 * S, shade: "rgba(0,0,0,0.3)", shadeAt: 0.5 });
    InkLine(ctx, bx - r * 0.36, by + r * 0.72, bx + r * 0.36, by + r * 0.72, id + "foot",
      { lw: 3.4 * S, color: "rgba(14,12,8,0.8)", amp: 1.4 * S });
    // 口沿
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(bx, by, r, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fillStyle = SPLIT_BOWL_D;
    ctx.fill();
    ctx.strokeStyle = "rgba(16,14,10,0.95)";
    ctx.lineWidth = 4 * S;
    ctx.stroke();
    // 温水：暗的一汪，一线冷光——夜窖里唯一发亮的东西之一
    ctx.beginPath();
    ctx.ellipse(bx, by + r * 0.02, r * 0.82, r * 0.24, 0, 0, Math.PI * 2);
    ctx.fillStyle = SPLIT_WATER;
    ctx.fill();
    ctx.globalAlpha = 0.24;
    ctx.strokeStyle = "#9ab0a4";
    ctx.lineWidth = 2.4 * S;
    ctx.beginPath();
    ctx.ellipse(bx - r * 0.14, by - r * 0.02, r * 0.5, r * 0.13, -0.12, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // 豁口：口沿上啃缺的一小口（认"豁口碗"就靠它）
    ctx.fillStyle = "rgba(10,8,5,0.9)";
    ctx.beginPath();
    ctx.ellipse(bx + Math.cos(chipA) * r * 0.94, by + Math.sin(chipA) * r * 0.30,
      r * 0.10, r * 0.05, chipA, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  Bowl(L.bowlL.x, L.bowlL.y, L.bowlL.r, "spBowlL", -2.5);
  Bowl(L.bowlR.x, L.bowlR.y, L.bowlR.r, "spBowlR", -0.6);

  // ── 那截红薯干（按段） ──
  if (phase === "break") {
    const x0 = (L.strip.cx - L.strip.len / 2) * W;
    const x1 = (L.strip.cx + L.strip.len / 2) * W;
    const cyW = L.strip.cy * W;
    const gx = x0 + Math.max(L.grabMin, Math.min(L.grabMax, view.grabU || 0.5)) * (x1 - x0);
    const bend = Math.max(0, view.bend || 0) * W;
    const gy = cyW + bend;
    // 左手托着左头（不动），右手捏在 grabU、往下掰
    SplitHand(ctx, x0 + 14 * S, cyW + 10 * S, S, -1, true);
    // 条：左头到捏点、捏点到右头——弯就弯在捏点上
    SplitPiece(ctx, x0, cyW, gx, gy, stripW, "spStA");
    SplitPiece(ctx, gx, gy, x1, cyW + bend * 0.55, stripW, "spStB");
    // 弯处的纤维感：颜色变浅、几道竖丝；临断时中缝发白
    const k = Math.min(1, (view.bend || 0) / L.bendNeed);
    if (k > 0.12) {
      ctx.save();
      ctx.strokeStyle = SPLIT_YAM_FIB;
      ctx.globalAlpha = 0.4 + k * 0.5;
      ctx.lineWidth = 2 * S;
      for (let i = 0; i < 4; i += 1) {
        const fx = gx + (i - 1.5) * stripW * 0.3;
        ctx.beginPath();
        ctx.moveTo(fx, gy - stripW * 0.5);
        ctx.lineTo(fx + Sym("spFib", i, 2 * S), gy + stripW * 0.5);
        ctx.stroke();
      }
      if (k > 0.62) {
        ctx.globalAlpha = (k - 0.62) * 2.4;
        ctx.strokeStyle = "rgba(214,206,184,0.9)";
        ctx.lineWidth = 2.6 * S;
        ctx.beginPath();
        ctx.moveTo(gx, gy - stripW * 0.55);
        ctx.lineTo(gx + Sym("spSeam", 0, 1.6 * S), gy + stripW * 0.55);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (view.grab) {
      // 捏着的手挪到捏点右侧一点：弯处那道发白的中缝是全部进度，
      // 拳头压在它上头就又看不见功了（构图铁律：手不压刚做出来的功）
      SplitHand(ctx, gx + 34 * S, gy + 6 * S, S, 1, true);
    } else {
      // 没上手：条自己招呼——捏点那一段透出一圈会呼吸的光
      SplitHand(ctx, x1 - 14 * S, cyW + 10 * S, S, 1, false);
      const pulse = view.reaching ? 0.55 + 0.4 * Math.sin(t * 13) : 0.4 + 0.3 * Math.sin(t * 3.0);
      KnotGlow(ctx, (x0 + x1) / 2, cyW, L.grabR * W * 1.4, 0.12 + pulse * 0.2);
    }
  } else if (view.pieces) {
    // sort / swap：断开的两截（长短按 pieces[].len），在案上/碗里/手底下
    for (let i = 0; i < view.pieces.length; i += 1) {
      const pe = view.pieces[i];
      if (!pe) continue;
      const heldNow = view.held === i;
      const px = pe.x * W, py = pe.y * W;
      const half = (pe.len * L.strip.len * 0.5) * W;
      const ang = Sym("spPcA" + i, 0, 0.16) + (heldNow ? Math.sin(t * 2.2) * 0.05 : 0);
      const dx = Math.cos(ang) * half, dy = Math.sin(ang) * half;
      // 碗里的那截：先画条，再拿水色罩下半——"躺在水里"
      SplitPiece(ctx, px - dx, py - dy, px + dx, py + dy, stripW, "spPc" + i,
        { fiberEnd: i === 0 ? 1 : -1 });
      if (pe.bowl && !heldNow) {
        const bowl = pe.bowl === 1 ? L.bowlL : L.bowlR;
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = SPLIT_WATER;
        ctx.beginPath();
        ctx.ellipse(bowl.x * W, bowl.y * W + bowl.r * W * 0.06,
          bowl.r * W * 0.8, bowl.r * W * 0.22, 0, 0, Math.PI);
        ctx.fill();
        ctx.restore();
      }
      if (heldNow) {
        // 提在手里：滴水。滴珠从条底一路坠进碗里（phase=swap 才沥）
        SplitHand(ctx, px, py - 6 * S, S, 1, true);
        if (py < L.liftY * W) {
          const ph = (t % L.dripEvery) / L.dripEvery;
          const dropY = py + stripW * 0.6 + ph * (L.bowlR.y * W - py) * 0.9;
          ctx.save();
          ctx.globalAlpha = 0.7 * (1 - ph * 0.4);
          ctx.fillStyle = "#7d95a0";
          ctx.beginPath();
          ctx.ellipse(px + Sym("spDrip", 0, 3 * S), dropY, 2.6 * S, 3.6 * S, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          // 条底挂着的那颗将落未落的水珠
          ctx.save();
          ctx.fillStyle = "rgba(140,165,175,0.55)";
          ctx.beginPath();
          ctx.ellipse(px + 2 * S, py + stripW * 0.55, 2.2 * S, 2.8 * S, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      } else if (!pe.bowl || phase === "swap") {
        // 还没归置/该捞出来的那截：自己透光招呼
        const pulse = view.reaching ? 0.5 + 0.4 * Math.sin(t * 13) : 0.34 + 0.28 * Math.sin(t * 3.0 + i);
        KnotGlow(ctx, px, py, L.grabR * W * 1.3, 0.10 + pulse * 0.18);
      }
    }
  }

  // 四角压暗，和别的活卡一个调子（夜窖里再沉一档）
  const vg = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.30, W * 0.5, H * 0.5, H * 0.9);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(8,6,4,0.7)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

// 晾衣绳。土布只有两个颜色：**靛蓝**和本色的土黄白，冷灰一律不要（那是
// 现代机织棉布）。补丁大小不一、颜色各不相同，补在肘和膝——那是真磨破的地方。
export function DrawClothesline(ctx, x, groundY, id) {
  const span = 92;
  // 两根杆是带杈的树枝，一根明显歪
  InkLine(ctx, x - span / 2, groundY, x - span / 2 - 9, groundY - 88, id + "pL", { lw: 4, color: PAL.woodOld, amp: 1.8 });
  InkLine(ctx, x - span / 2 - 9, groundY - 88, x - span / 2 - 14, groundY - 96, id + "pLf", { lw: 2.4, color: PAL.woodOld, amp: 1.2 });
  InkLine(ctx, x + span / 2, groundY, x + span / 2 + 4, groundY - 86, id + "pR", { lw: 4, color: PAL.woodOld, amp: 1.6 });
  InkLine(ctx, x + span / 2 + 4, groundY - 86, x + span / 2 + 10, groundY - 93, id + "pRf", { lw: 2.2, color: PAL.woodOld, amp: 1.2 });
  ctx.beginPath();
  ctx.moveTo(x - span / 2 - 9, groundY - 86);
  ctx.quadraticCurveTo(x, groundY - 76, x + span / 2 + 4, groundY - 82);
  ctx.strokeStyle = "#8a7350";
  ctx.lineWidth = 2;
  ctx.stroke();
  // 大人的对襟短褂：靛蓝，洗几年褪成灰蓝
  InkFill(ctx, [[x - 32, groundY - 80], [x - 10, groundY - 81], [x - 6, groundY - 62], [x - 12, groundY - 38],
    [x - 28, groundY - 38], [x - 36, groundY - 60]],
  id + "shirt", PAL.indigo, { amp: 1.8, lw: 1.8, shade: "rgba(0,0,0,0.12)" });
  // 补丁：三块，大小形状颜色都不一样，补在肘和胸口
  const patches = [[x - 26, groundY - 64, 11, 10, "#5a6472"], [x - 18, groundY - 48, 8, 7, "#8f8168"],
    [x - 31, groundY - 52, 7, 8, "#2f3743"]];
  for (let i = 0; i < patches.length; i += 1) {
    const p = patches[i];
    InkFill(ctx, [[p[0], p[1]], [p[0] + p[2], p[1] - 1], [p[0] + p[2] + 1, p[1] + p[3]],
      [p[0] + 1, p[1] + p[3] + 1]], id + "pt" + i, p[4], { amp: 1.4, lw: 1.1 });
  }
  // 大裆裤：本白土布
  InkFill(ctx, [[x + 6, groundY - 79], [x + 28, groundY - 80], [x + 26, groundY - 42], [x + 19, groundY - 42],
    [x + 18, groundY - 60], [x + 15, groundY - 42], [x + 8, groundY - 42]],
  id + "pants", PAL.homespun, { amp: 1.6, lw: 1.8, shade: "rgba(0,0,0,0.12)" });
  InkFill(ctx, Rect(x + 9, groundY - 58, 8, 8), id + "ptK", "#6f6552", { amp: 1.0, lw: 1.1 });
  // 再挂一件小孩的：只有一半宽，补得更狠
  InkFill(ctx, [[x + 32, groundY - 78], [x + 44, groundY - 79], [x + 43, groundY - 54],
    [x + 33, groundY - 54]], id + "kid", "#6f6552", { amp: 1.5, lw: 1.6 });
  InkFill(ctx, Rect(x + 35, groundY - 70, 6, 6), id + "kidPt", PAL.indigo, { amp: 0.9, lw: 1.0 });
}

// 塌进巷子的院墙残段（可翻越）。两家隔墙倒了半截，土坯碴子横在路当中——
// 「路上凭空码一垛柴」说不通，这个说得通：绕不过去（两头顶着人家院墙），
// 也拆不动，只能跨过去。
//
// 可翻越物的轮廓语法全在这张图里：**齐胯高**（一手撑得住）、**顶沿被踩磨得
// 圆亮**（有人天天从这儿过）、**豁一个口**（手往哪儿按一目了然）、根脚散着
// 掉下来的坯块（它是"塌"的，不是"砌"的）。
export function DrawBrokenWall(ctx, x, groundY, w, h, id) {
  const half = w / 2;
  const notch = x + half * 0.16;          // 顶沿的豁口：手往这儿按
  // 墙的轮廓：左边还立着，右边被拽塌成一道斜茬
  const outline = [
    [x - half, groundY],
    [x - half, groundY - h],
    [notch - h * 0.30, groundY - h],
    [notch - h * 0.10, groundY - h + h * 0.17],   // 豁口塌下去一块
    [notch + h * 0.22, groundY - h + h * 0.12],
    [notch + h * 0.42, groundY - h * 0.90],
    [x + half * 0.66, groundY - h * 0.58],
    [x + half, groundY - h * 0.14],
    [x + half, groundY],
  ];

  // ① 塌下来的坯块：散在墙**两侧的地上**（画在墙身之前，但落点要在轮廓之外，
  //    压在里面就被墙身盖没了——上一版就是这么白画的）
  for (let i = 0; i < 5; i += 1) {
    const left = i % 2 === 0;
    const bx = left ? x - half - 4 - Rnd(id, i) * 10 : x + half + 2 + Rnd(id, i) * 12;
    const by = groundY - 1.5 - Rnd(id, i + 7) * 3;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate((Rnd(id, i + 20) - 0.5) * 0.9);
    const bw = 7 + Rnd(id, i + 40) * 5;      // 大小不一，才像塌下来的碴子
    InkFill(ctx, Rect(-bw / 2, -2.4, bw, 4.8), id + "b" + i, i % 2 ? "#7d6c50" : "#8a7860",
      { amp: 1.1, lw: 1.3, shade: "rgba(0,0,0,0.18)" });
    ctx.restore();
  }

  // ② 墙身。shade 不加方向性——上一版 shadeAt:0.5 在墙中间劈出一道生硬的
  //    竖向明暗界，看着像两块拼起来的板子
  InkFill(ctx, outline, id, "#8e7f61", { amp: 1.6, lw: 2.4, shade: "rgba(70,52,36,0.16)" });

  // ③ 土坯：一层层错缝垒起来的。剪在轮廓里画砖缝，这是"墙"与"板子"的分界
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i += 1) ctx.lineTo(outline[i][0], outline[i][1]);
  ctx.closePath();
  ctx.clip();
  const course = Math.max(4.5, h / 5.5);        // 一层坯的厚度
  const brick = course * 2.1;                   // 一块坯的长度
  for (let r = 0; r * course < h + course; r += 1) {
    const y = groundY - r * course;
    // 横缝
    InkLine(ctx, x - half - 2, y, x + half + 2, y, id + "c" + r,
      { lw: 1.1, color: "rgba(84,64,44,0.42)", amp: 1.3 });
    // 竖缝：隔层错开半块
    const off = (r % 2) * brick * 0.5;
    for (let bx = x - half - 2 + off; bx < x + half + 2; bx += brick) {
      InkLine(ctx, bx, y, bx, y - course, id + "v" + r + "_" + Math.round(bx),
        { lw: 0.9, color: "rgba(84,64,44,0.3)", amp: 1.0 });
    }
  }
  Speckle(ctx, x - half, groundY - h, w, h, id + "sp", { count: 22, alpha: 0.16 });
  ctx.restore();

  // ④ 顶沿被踩磨圆亮的那一小段——"从这儿翻"的记号。只是一道包浆，粗了、白了
  //    就成了横在墙头的一根骨头，还会跟按上去的那只手抢眼
  InkLine(ctx, x - half + 7, groundY - h + 1.6, notch - h * 0.42, groundY - h + 1.6,
    id + "worn", { lw: 0.9, color: "rgba(236,222,192,0.5)", amp: 0.4 });
  // 墙头草：只长在没人踩的那一头
  for (let i = 0; i < 2; i += 1) {
    const gx = x - half + 3 + Rnd(id, i + 30) * (half * 0.34);
    InkLine(ctx, gx, groundY - h, gx + Sym(id, i + 5, 2.5), groundY - h - 5 - Rnd(id, i + 9) * 3,
      id + "g" + i, { lw: 1.1, color: "#7d8c4a" });
  }
}

// 柴垛。**冀中平原不产木**：烧的是秫秸、棉柴、树枝——齐整的原木垛直接把
// 这家写成了山区林农。所以主体是一捆捆的秫秸，真圆木只留三四根，而且是
// 弯的短的带杈的，大小不一、年轮偏心、整垛往一边倒。
export function DrawWoodpile(ctx, x, groundY, id) {
  // ① 立着的两捆秫秸：草绳拦腰捆两道
  for (let b = 0; b < 2; b += 1) {
    const bx = x - 22 + b * 30;
    const bh = 30 + Rnd(id + "bh", b) * 10;
    InkFill(ctx, [[bx - 8, groundY], [bx - 6, groundY - bh], [bx + 6, groundY - bh - 3],
      [bx + 9, groundY]], id + "bd" + b, PAL.stalk, { amp: 2.0, lw: 1.8, shade: "rgba(60,44,20,0.2)" });
    for (let i = 0; i < 6; i += 1) {
      const sx = bx - 6 + i * 2.6;
      InkLine(ctx, sx, groundY - bh * 0.2, sx + Sym(id + "sk" + b, i, 2), groundY - bh - 3 - Rnd(id + "sk2" + b, i) * 6,
        id + "st" + b + i, { lw: 0.9, color: "rgba(80,66,36,0.5)", amp: 1.0 });
    }
    InkLine(ctx, bx - 8, groundY - bh * 0.66, bx + 8, groundY - bh * 0.68, id + "tie" + b,
      { lw: 1.8, color: "#6d5a3a", amp: 0.8 });
  }
  // ② 三四根真柴：弯的、带杈的、粗细不一
  for (let i = 0; i < 4; i += 1) {
    const px = x - 24 + Rnd(id + "lx", i) * 46;
    const py = groundY - 5 - Rnd(id + "ly", i) * 12;
    const r = 5 + Rnd(id + "lr", i) * 4;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Sym(id + "lrot", i, 0.3));
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * (0.6 + Rnd(id + "sq", i) * 0.35), 0, 0, Math.PI * 2);
    ctx.fillStyle = ["#8f6740", "#7d5632", "#6b4d2e", "#96754a"][i % 4];
    ctx.fill();
    ctx.strokeStyle = IN.ink;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    // 年轮偏心
    ctx.beginPath();
    ctx.ellipse(r * 0.3, -r * 0.2, r * 0.4, r * 0.28, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(58,38,20,0.6)";
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.restore();
  }
  // ③ 滚出去的两根
  for (let i = 0; i < 2; i += 1) {
    Limb(ctx, x + 24 + i * 9, groundY - 3, x + 36 + i * 10, groundY - 2 - i * 3,
      4.4, 2.0, id + "roll" + i, "#7d5632", { bow: 2, lw: 1.6 });
  }
}

// 王家订的那扇榆木门（半成品）：斜靠着的门扇骨架——两根边梃、三根抹头，
// 门芯板只装了下面一块，上面还空着两档。刨平的料一趟趟填进去，
// 「搬木料是在给谁干活」这件事就立在工作台边上，不用字幕说。
// 斜靠：整扇向右倒 6°——摆位（Data_Scenes 的 doorLeafWip）在自家院墙西端，
// 上端正好搭在墙面上
export function DrawDoorLeaf(ctx, x, groundY, id) {
  ctx.save();
  ctx.translate(x, groundY);
  ctx.rotate(0.10);
  const W = 40, H = 92;          // ≈0.8m 宽、1.84m 高
  // 两根边梃
  InkFill(ctx, Rect(-W / 2, -H, 7, H), id + "stL", "#a8794a", { amp: 1.0, lw: 2.2, shade: "rgba(0,0,0,0.16)" });
  InkFill(ctx, Rect(W / 2 - 7, -H, 7, H), id + "stR", "#9f7244", { amp: 1.0, lw: 2.2, shade: "rgba(0,0,0,0.16)" });
  // 三根抹头（上/中/下）
  for (const [i, yy] of [[0, -H + 4], [1, -H * 0.55], [2, -13]]) {
    InkFill(ctx, Rect(-W / 2 + 6, yy, W - 12, 6), id + "r" + i, "#b08150",
      { amp: 0.9, lw: 2, shade: "rgba(0,0,0,0.13)" });
  }
  // 只装上了下面一块门芯板：新刨的料，比骨架亮一档——刚干完的活看得出新
  InkFill(ctx, Rect(-W / 2 + 6, -13 + 6 - 24, W - 12, 18), id + "panel", "#b18f5c",
    { amp: 0.7, lw: 1.8, shade: "rgba(0,0,0,0.10)" });
  // 上面两档还空着：从空档里透出后面的墙色，靠两道浅浅的内框线说"这儿缺料"
  InkLine(ctx, -W / 2 + 7, -H * 0.55 - 3, W / 2 - 7, -H * 0.55 - 3, id + "gap",
    { lw: 1.1, color: "rgba(80,60,40,0.35)", amp: 0.8 });
  // 榫头：中抹头两端各探出一点——木匠活的记号
  InkFill(ctx, Rect(-W / 2 - 3, -H * 0.55 + 1, 4, 4), id + "tnL", "#8d6236", { amp: 0.5, lw: 1.4 });
  InkFill(ctx, Rect(W / 2 - 1, -H * 0.55 + 1, 4, 4), id + "tnR", "#8d6236", { amp: 0.5, lw: 1.4 });
  ctx.restore();
}

export function DrawBench(ctx, x, groundY, id) {
  InkFill(ctx, Rect(x - 26, groundY - 26, 52, 8), id, PAL.wood, { amp: 1, lw: 2.3, shade: "rgba(0,0,0,0.14)" });
  InkFill(ctx, Rect(x - 22, groundY - 18, 6, 18), id + "l1", PAL.woodDark, { amp: 0.8, lw: 2 });
  InkFill(ctx, Rect(x + 16, groundY - 18, 6, 18), id + "l2", PAL.woodDark, { amp: 0.8, lw: 2 });
  // 台面上原来画着一把"装饰用"的刨子。刨料那一拍现在有真刨子在玩家手里，
  // 台面上再摆一把假的就成了两把——换成墨斗（木匠画线的家伙，也呼应门框刻痕）
  // 墨斗搁在台子远端：爹拉锯那一拍，锯身正好横在台面右半边，
  // 摆中间会被锯架压住（两块木色叠一块，谁也看不清）
  InkFill(ctx, Rect(x - 23, groundY - 32, 11, 6), id + "inkpot", "#6f5636", { amp: 0.7, lw: 1.8 });
  InkLine(ctx, x - 21, groundY - 32, x - 14, groundY - 36, id + "inkline",
    { lw: 1.2, color: "rgba(50,38,24,0.8)", amp: 1.2 });
}

// 台面上待刨的那块料（侧剖）。smooth 0→1：毛料的起伏一趟趟被削平，
// 木色也一点点亮起来——"刨了几趟"这件事不靠数字，靠这块木头自己说。
export function DrawPlaneBoard(ctx, x, topY, wPx, smooth, id) {
  const h = 8;          // ≈0.17m 厚：一根门框料的分量，不是一块砖
  const rough = 1 - smooth;
  // 木身。毛料是灰扑扑的旧木色，刨过之后一层层透出新木的黄——
  // 和台面（PAL.wood）拉开色阶，不然料和台子在这个景别下会糊成一块。
  const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
  const rgb = mix([154, 138, 112], [222, 178, 112], smooth);
  InkFill(ctx, Rect(x - wPx / 2, topY, wPx, h), id + "body",
    `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`, { amp: 0.7, lw: 2, shade: "rgba(0,0,0,0.16)" });
  // 料压在台面上的那道接触暗边：两块木头才分得开
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = "rgba(48,34,20,0.9)";
  ctx.fillRect(x - wPx / 2, topY + h - 0.6, wPx, 1.4);
  ctx.restore();
  // 上沿的毛面：起伏不平的一道边，随 smooth 一趟趟塌下去。
  // 画成连着的折线而不是一排竖条——竖条在这个尺寸下看着像把梳子
  if (rough > 0.02) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x - wPx / 2, topY + 1);
    for (let i = 0; i <= 16; i += 1) {
      const px = x - wPx / 2 + (i / 16) * wPx;
      const bump = (0.6 + Rnd(id, i) * 2.6) * rough;
      ctx.lineTo(px, topY - bump);
    }
    ctx.lineTo(x + wPx / 2, topY + 1);
    ctx.closePath();
    ctx.fillStyle = "#8d6236";
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.restore();
  }
  // 刨亮的那一面：沿着木纹的两道高光
  if (smooth > 0.08) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.75, smooth);
    InkLine(ctx, x - wPx / 2 + 3, topY + 2.0, x + wPx / 2 - 3, topY + 1.9, id + "sheen1",
      { lw: 1.2, color: "rgba(246,228,186,0.9)", amp: 0.9 });
    InkLine(ctx, x - wPx / 2 + 6, topY + 4.0, x + wPx / 2 - 5, topY + 4.2, id + "sheen2",
      { lw: 0.9, color: "rgba(240,214,164,0.7)", amp: 1.1 });
    ctx.restore();
  }
  // 木纹
  InkLine(ctx, x - wPx / 2 + 2, topY + 6.2, x + wPx / 2 - 2, topY + 6.0, id + "grain",
    { lw: 0.8, color: "rgba(80,52,28,0.5)", amp: 1.4 });
}

// 一条打着卷的刨花。len 0.35~1：推得稳就是长长一条，中间顿了就是一小截碎屑。
export function DrawShaving(ctx, x, y, S, len, id) {
  const turns = 1.1 + len * 2.2;         // 卷的圈数
  const r0 = 2.2 * S;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "#e0bc82";
  ctx.lineWidth = 1.9 * S;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let i = 0; i <= 40; i += 1) {
    const t = (i / 40) * turns * Math.PI * 2;
    const r = r0 + t * 0.62 * S * (0.55 + len * 0.55);
    const px = Math.cos(t) * r;
    const py = Math.sin(t) * r * 0.72;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  // 卷内侧的暗边：让它看得出是一片有厚度的薄木，不是一根铁丝
  ctx.strokeStyle = "rgba(150,110,62,0.55)";
  ctx.lineWidth = 0.8 * S;
  ctx.stroke();
  ctx.restore();
}

// 地上那堆刨花：刨了几趟就堆多高——玩家干过的活留在画面上
export function DrawShavingPile(ctx, x, groundY, n, id) {
  const count = Math.min(16, n * 2);
  for (let i = 0; i < count; i += 1) {
    const px = x + (Rnd(id, i) - 0.5) * (11 + n * 2.2);
    const py = groundY - Rnd(id, i + 50) * (1.6 + n * 0.9);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate((Rnd(id, i + 90) - 0.5) * 1.6);
    ctx.strokeStyle = i % 3 ? "#dcb87e" : "#c9a166";
    ctx.lineWidth = 0.9;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-2.6, 0);
    ctx.quadraticCurveTo(0, -1.9, 2.6, 0);
    ctx.quadraticCurveTo(0.8, 1.0, -1, 0.35);
    ctx.stroke();
    ctx.restore();
  }
}

export function DrawStool(ctx, x, groundY, id) {
  InkFill(ctx, Rect(x - 11, groundY - 15, 22, 5), id, "#96723f", { amp: 0.8, lw: 2 });
  InkFill(ctx, Rect(x - 9, groundY - 10, 4, 10), id + "a", "#7a5433", { amp: 0.7, lw: 1.8 });
  InkFill(ctx, Rect(x + 5, groundY - 10, 4, 10), id + "b", "#7a5433", { amp: 0.7, lw: 1.8 });
}

export function DrawFirewood(ctx, x, groundY, w, id) {
  for (let i = 0; i < 9; i += 1) {
    const px = x - w / 2 + Rnd(id, i) * w;
    const py = groundY - 2 - Rnd(id, i + 20) * 16;
    const ang = -0.4 + Rnd(id, i + 40) * 0.9;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    InkFill(ctx, Rect(-11, -2.4, 22, 4.8), id + i, i % 2 ? "#7d5a33" : "#8f6b3d", { amp: 0.6, lw: 1.7 });
    ctx.restore();
  }
}

// 码得整齐的劈柴垛：可翻越物的轮廓语法样板——齐肩高、顶沿被手掌磨得发亮、
// 顶上缺一块（那是天天翻的人踩塌的）。玩家不认字也该一眼看出"这儿能过去"。
export function DrawWoodStack(ctx, x, groundY, w, h, id) {
  const rows = Math.max(3, Math.round(h / 13));
  const notchX = x + w * 0.10;                 // 缺口偏右：不对称才像被人踩出来的
  for (let r = 0; r < rows; r += 1) {
    const py = groundY - 6 - r * (h - 8) / rows;
    // 越往上收一点，垛才立得住
    const rw = w * (1 - r * 0.035);
    const count = Math.max(2, Math.round(rw / 15));
    for (let i = 0; i < count; i += 1) {
      const px = x - rw / 2 + 7 + i * ((rw - 14) / Math.max(1, count - 1));
      // 顶层缺口：那一段不码柴
      if (r >= rows - 1 && Math.abs(px - notchX) < w * 0.16) continue;
      const jig = Sym(id + "j" + r + i, 0, 1.6);
      if (r % 2 === 0) {
        // 横码：一头一头的截面朝外
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(px + jig, py, 7.0, 5.2, 0, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 ? "#a8794a" : "#93663c";
        ctx.fill();
        ctx.strokeStyle = IN.ink;
        ctx.lineWidth = 1.8;
        ctx.stroke();
        // 年轮那一小圈：没有它就是一堆棕色鹅卵石
        ctx.beginPath();
        ctx.ellipse(px + jig, py, 3.2, 2.2, 0, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(70,45,25,0.6)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      } else {
        // 竖码：劈开的柴侧着搭，纹路是竖的
        InkFill(ctx, Rect(px - 5 + jig, py - 6, 10, 12), id + "b" + r + i,
          i % 2 ? "#8b6238" : "#7a5330", { amp: 0.7, lw: 1.7 });
      }
    }
  }
  // 顶沿磨亮：天天有人手掌撑在这条线上
  InkLine(ctx, x - w / 2 + 5, groundY - h + 3, notchX - w * 0.16, groundY - h + 1,
    id + "worn", { lw: 2.6, color: "rgba(240,225,180,0.8)", amp: 1.1 });
  InkLine(ctx, notchX + w * 0.16, groundY - h + 2, x + w / 2 - 4, groundY - h + 4,
    id + "worn2", { lw: 2.4, color: "rgba(240,225,180,0.7)", amp: 1.1 });
  // 缺口里塌下去的两根
  InkFill(ctx, Rect(notchX - w * 0.13, groundY - h + 8, w * 0.26, 5), id + "fall",
    "#6d4c2c", { amp: 0.8, lw: 1.7 });
  // 底下压着的散柴梢
  for (let i = 0; i < 3; i += 1) {
    InkLine(ctx, x - w / 2 - 6 + i * 5, groundY - 2, x - w / 2 + 9 + i * 6, groundY - 5 - i * 2,
      id + "sp" + i, { lw: 1.8, color: "#5c4328" });
  }
}

// 窖口盖板：c1_plane 刨出来的那块旧门板，抹了泥灰做旧。
// 侧视里它是一块**有厚度的板**——平放时只看得见板厚那一条，掀起来才露出板面。
// 所以贴图按「立起来的样子」画（宽=洞口，高=板厚+一点板面），
// 摆位时绕铰链边旋转，平放/立起共用同一张图。
// 画的是**底面**：盖着的时候朝下、掀起来朝向玩家的正是这一面，所以没有泥灰，
// 只有木纹、拼缝和两道背带（泥灰在另一面，压在洞口上看不见）。
export function DrawCellarLid(ctx, w, t, id) {
  // 板身：三块旧门板拼的，边不齐
  InkFill(ctx, [[0, 0], [w, Sym(id + "e", 0, 1.6)], [w, t], [0, t - Sym(id + "e", 1, 1.4)]],
    id + "body", "#7d5f3c", { amp: 1.6, lw: 2.2, shade: "rgba(48,34,20,0.26)" });
  // 拼缝：两道，缝里嵌着灰
  for (let i = 1; i <= 2; i += 1) {
    const px = w * (i / 3);
    InkLine(ctx, px, 1.5, px + Sym(id + "s", i, 1.8), t - 1.5, id + "seam" + i,
      { lw: 2.0, color: "rgba(38,26,15,0.62)", amp: 1.2 });
  }
  // 背带：两根横木条钉在底面上（门板拆下来改的盖子必有这个，不然一踩就散）
  for (let i = 0; i < 2; i += 1) {
    const by = t * (0.28 + i * 0.42);
    InkFill(ctx, [[w * 0.06, by], [w * 0.94, by - Sym(id + "b", i, 1.2)],
      [w * 0.94, by + t * 0.13], [w * 0.06, by + t * 0.13 + 0.8]],
    id + "batten" + i, "#6b5133", { amp: 1.2, lw: 1.6, shade: "rgba(0,0,0,0.2)" });
    for (let k = 0; k < 3; k += 1) {          // 钉头
      const nx = w * (0.18 + k * 0.32);
      InkFill(ctx, [[nx - 1.2, by + t * 0.04], [nx + 1.2, by + t * 0.03],
        [nx + 1, by + t * 0.10], [nx - 1, by + t * 0.11]],
      id + "nail" + i + k, "#3f3a34", { amp: 0.6, lw: 0.9 });
    }
  }
  // 木纹
  for (let i = 0; i < 5; i += 1) {
    const gy = t * (0.12 + Rnd(id + "g", i) * 0.76);
    InkLine(ctx, w * 0.05, gy, w * 0.95, gy + Sym(id + "gw", i, 1.4), id + "grain" + i,
      { lw: 0.9, color: "rgba(58,40,22,0.34)", amp: 1.0 });
  }
  // 边上蹭掉泥灰的地方：常年掀，边沿最先磨白
  Speckle(ctx, 0, 0, w, t * 0.22, id + "wear", { count: 18, alpha: 0.22, size: 1.4, color: "#c9b48c" });
}

export function DrawHatch(ctx, x, groundY, id, { open = false } = {}) {
  InkFill(ctx, [[x - 22, groundY], [x + 22, groundY], [x + 19, groundY - 7], [x - 19, groundY - 7]],
    id, "#6b5236", { amp: 1.1, lw: 2.4, shade: "rgba(0,0,0,0.2)" });
  for (let i = 0; i < 3; i += 1) {
    InkLine(ctx, x - 16 + i * 15, groundY - 6, x - 14 + i * 15, groundY - 1, id + "p" + i,
      { lw: 1.2, color: "rgba(45,32,20,0.7)" });
  }
  if (open) {
    InkFill(ctx, [[x - 14, groundY - 1], [x + 14, groundY - 1], [x + 11, groundY + 8], [x - 11, groundY + 8]],
      id + "dark", "#150f0a", { amp: 1, lw: 2 });
  }
}

export function DrawBush(ctx, x, groundY, w, id, { night = false } = {}) {
  const base = night ? "#3a4a38" : "#54683e";
  for (let i = 0; i < 3; i += 1) {
    const ox = Sym(id, i, w * 0.4);
    const r = w * (0.42 + Rnd(id, i + 10) * 0.26);
    const pts = [];
    for (let a = 0; a < 8; a += 1) {
      const ang = (a / 8) * Math.PI * 2;
      const rr = r * (0.8 + Rnd(id + i, a) * 0.4);
      pts.push([x + ox + Math.cos(ang) * rr, groundY - r * 0.7 + Math.sin(ang) * rr * 0.66]);
    }
    InkFill(ctx, pts, id + i, i === 1 ? base : (night ? "#32402f" : "#485a34"),
      { amp: 2.2, lw: i === 0 ? 2.3 : 0, line: i === 0 ? IN.ink : null });
  }
}

export function DrawCrops(ctx, x, groundY, w, id, { night = false, veggie = false } = {}) {
  const color = night ? "#5a6640" : PAL.crop;
  // 脚下先给一条翻过土的畦垄——没有这条土，秆子就是插在光板地上的牙签
  ctx.save();
  ctx.fillStyle = night ? "rgba(30,24,16,0.5)" : "rgba(96,74,48,0.38)";
  ctx.beginPath();
  ctx.moveTo(x - w / 2 - 6, groundY);
  for (let t = 0; t <= 12; t += 1) {
    ctx.lineTo(x - w / 2 - 6 + ((w + 12) * t) / 12, groundY - 3.5 - Sym(id + "bed", t, 2.2));
  }
  ctx.lineTo(x + w / 2 + 6, groundY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  if (veggie) {
    // 菜畦：贴地的叶簇（春天的白菜秧/韭菜），不是齐腰的秆子
    const n = Math.max(8, Math.round(w / 14));
    for (let i = 0; i < n; i += 1) {
      const px = x - w / 2 + (i + 0.3 + Rnd(id, i) * 0.4) * (w / n);
      const r = 5 + Rnd(id, i + 40) * 3.5;
      for (let k = 0; k < 5; k += 1) {
        const a = -Math.PI * (0.18 + k * 0.16) + Sym(id + "lf" + i, k, 0.12);
        ctx.beginPath();
        ctx.moveTo(px, groundY - 1);
        ctx.quadraticCurveTo(px + Math.cos(a) * r * 0.7, groundY - 1 + Math.sin(a) * r * 0.9,
          px + Math.cos(a) * r * 1.25, groundY - 1 + Math.sin(a) * r * 1.35);
        ctx.strokeStyle = k % 2 ? color : (night ? "#4c5836" : "#87975a");
        ctx.lineWidth = 2.6;
        ctx.lineCap = "round";
        ctx.stroke();
      }
    }
    return;
  }
  const n = Math.max(6, Math.round(w / 9));
  for (let i = 0; i < n; i += 1) {
    const px = x - w / 2 + (i + Rnd(id, i) * 0.6) * (w / n);
    const h = 34 + Rnd(id, i + 50) * 16;
    const tipX = px + Sym(id, i + 120, 8);
    ctx.beginPath();
    ctx.moveTo(px, groundY);
    ctx.quadraticCurveTo(px + Sym(id, i + 90, 4), groundY - h * 0.6, tipX, groundY - h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.stroke();
    // 穗：实心、骑在秆顶上（中心压低半个穗高）。原先填色跟底色几乎同色、
    // 中心又抬在秆顶上方——只剩描边的空心圈飘在半空，一排看过去像铁丝网
    ctx.beginPath();
    ctx.ellipse(tipX, groundY - h + 2.2, 2.6, 5.4, Sym(id, i, 0.5), 0, Math.PI * 2);
    ctx.fillStyle = night ? "#55603e" : "#a3853e";
    ctx.fill();
    ctx.strokeStyle = IN.inkSoft;
    ctx.lineWidth = 1;
    ctx.stroke();
    // 叶
    ctx.beginPath();
    ctx.moveTo(px, groundY - h * 0.45);
    ctx.quadraticCurveTo(px + 9, groundY - h * 0.6, px + 15, groundY - h * 0.36);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }
}

export function DrawRidge(ctx, x, groundY, w, id) {
  InkFill(ctx, [[x - w / 2, groundY], [x - w * 0.3, groundY - 15], [x + w * 0.28, groundY - 17], [x + w / 2, groundY]],
    id, "#6b5c42", { amp: 1.8, lw: 2.3, shade: "rgba(0,0,0,0.16)" });
  for (let i = 0; i < 5; i += 1) {
    const gx = x - w * 0.4 + Rnd(id, i) * w * 0.8;
    InkLine(ctx, gx, groundY - 14, gx + Sym(id, i + 4, 4), groundY - 22 - Rnd(id, i + 8) * 5,
      id + "g" + i, { lw: 1.2, color: "#5f6b3a" });
  }
}

export function DrawLamppost(ctx, x, groundY, id, { lit = false } = {}) {
  InkFill(ctx, Rect(x - 3.4, groundY - 66, 6.8, 66), id, "#5c4a38", { amp: 1, lw: 2.2 });
  InkFill(ctx, [[x - 11, groundY - 78], [x + 11, groundY - 78], [x + 8, groundY - 64], [x - 8, groundY - 64]],
    id + "lamp", lit ? PAL.lampCore : "#463a2c", { amp: 1, lw: 2.2 });
}

export function DrawDitch(ctx, x, groundY, w, id) {
  InkFill(ctx, [
    [x - w / 2, groundY], [x - w * 0.36, groundY + 26], [x + w * 0.34, groundY + 28], [x + w / 2, groundY],
  ], id, "#3e352a", { amp: 2.4, lw: 2.4 });
  Hatch(ctx, x - w / 2, groundY, w, 28, id + "h", { spacing: 8, alpha: 0.22 });
  for (let i = 0; i < 6; i += 1) {
    const gx = x - w * 0.44 + Rnd(id, i) * w * 0.88;
    InkLine(ctx, gx, groundY, gx + Sym(id, i + 3, 5), groundY - 9 - Rnd(id, i + 7) * 6,
      id + "g" + i, { lw: 1.3, color: "#6b7040" });
  }
}

export function DrawFortWall(ctx, x, groundY, w, h, id) {
  InkFill(ctx, Rect(x - w / 2, groundY - h, w, h), id, "#7d7160",
    { amp: 1.6, lw: 2.6, shade: "rgba(50,44,36,0.24)" });
  // 砖缝
  for (let r = 1; r * 14 < h; r += 1) {
    InkLine(ctx, x - w / 2 + 2, groundY - r * 14, x + w / 2 - 2, groundY - r * 14, id + "r" + r,
      { lw: 1, color: "rgba(60,54,44,0.45)", amp: 1.2 });
  }
  // 垛口
  for (let i = 0; i * 26 < w; i += 1) {
    InkFill(ctx, Rect(x - w / 2 + i * 26, groundY - h - 12, 15, 13), id + "c" + i, "#8d8577", { amp: 1.1, lw: 2.2 });
  }
  // 铁丝网
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = "#4a443a";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.moveTo(x - w / 2, groundY - h - 16 - i * 5);
    for (let t = 0; t <= 10; t += 1) {
      ctx.lineTo(x - w / 2 + (w * t) / 10, groundY - h - 16 - i * 5 + Sym(id + i, t, 3));
    }
    ctx.stroke();
  }
  ctx.restore();
}

export function DrawBlockhouse(ctx, x, groundY, id, { lit = true } = {}) {
  const H = 168, W = 74;
  InkFill(ctx, [
    [x - W / 2, groundY], [x - W / 2 + 8, groundY - H], [x + W / 2 - 8, groundY - H], [x + W / 2, groundY],
  ], id, "#8d8477", { amp: 2, lw: 2.8, shade: "rgba(48,42,34,0.26)" });
  for (let r = 1; r * 15 < H; r += 1) {
    InkLine(ctx, x - W / 2 + 4, groundY - r * 15, x + W / 2 - 4, groundY - r * 15, id + "b" + r,
      { lw: 0.9, color: "rgba(58,52,42,0.42)", amp: 1.4 });
  }
  // 射击孔
  for (let i = 0; i < 3; i += 1) {
    InkFill(ctx, Rect(x - 22 + i * 20, groundY - H * 0.62 - i % 2 * 22, 12, 16), id + "s" + i, "#241d16", { amp: 0.9, lw: 2 });
  }
  // 顶部平台
  InkFill(ctx, Rect(x - W / 2 - 8, groundY - H - 16, W + 16, 17), id + "top", "#6b6355", { amp: 1.4, lw: 2.6 });
  for (let i = 0; i * 18 < W + 16; i += 1) {
    InkFill(ctx, Rect(x - W / 2 - 8 + i * 18, groundY - H - 27, 10, 12), id + "cr" + i, "#756d5e", { amp: 1, lw: 2 });
  }
  if (lit) {
    InkFill(ctx, Rect(x - 8, groundY - H - 40, 16, 13), id + "lamp", PAL.lampCore, { amp: 1, lw: 2 });
  }
}

// 平原上的耕地：把一条纯色的地面带子切成条田。
// 冀中一马平川，从村口望出去到地平线全是地——一块块拼过去，
// 有返青的冬麦（1943 年春，去年秋播的麦子该绿了），有翻过留茬的空地，
// 中间是一道道田埂。近处的带子还看得出一垄一垄的垄沟，远的就只剩色块。
export function PaintFarmland(ctx, w, h, id, { wheat, stubble, ridge, strips = 20, furrow = false } = {}) {
  // **画之前必须把模糊滤镜摘掉。** BakeSprite 在整个 drawFn 期间都开着
  // `ctx.filter = blur(...)`；条田要画上千个矩形，每一个都过一遍高斯，
  // 主线程会卡到 load 事件都发不出来（页面直接打不开，2026-08-07 踩过）。
  // 何况该糊的是地平线那道边，不是地里的垄——田块清楚一点反而对。
  const prevFilter = ctx.filter;
  ctx.filter = "none";
  const top = 4;
  // 沿纵深切三层：越靠上（越远）的地块越扁，透视自然收
  const rows = 3;
  for (let r = 0; r < rows; r += 1) {
    const y0 = top + (h - top) * (r / rows) ** 1.35;
    const y1 = top + (h - top) * ((r + 1) / rows) ** 1.35;
    let x = -Hash(id + "o" + r) * 180;
    let i = 0;
    while (x < w) {
      const bw = (w / strips) * (0.55 + Hash(id + "w" + r + i) * 1.1);
      const isWheat = Hash(id + "c" + r + i) > 0.42;
      ctx.fillStyle = isWheat ? wheat : stubble;
      ctx.globalAlpha = 0.5 + (r / rows) * 0.35;      // 越远越淡，跟着空气透视走
      ctx.fillRect(x, y0, bw + 1, y1 - y0 + 1);
      // 垄沟：只有最近那两层才分得出，远处一画就成了噪点
      if (furrow && r >= 1) {
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = ridge;
        // 垄距按真尺寸给：48px/米下一垄约 0.35 米＝17px。给到 5px 那不是垄，是噪点
        for (let fx = x + 4; fx < x + bw; fx += 17) ctx.fillRect(fx, y0, 1.6, y1 - y0);
      }
      // 田埂：地块之间那道踩出来的土脊
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = ridge;
      ctx.fillRect(x, y0, 1.6, y1 - y0);
      x += bw;
      i += 1;
    }
    // 横向的田埂/地界：把纵深分层，也是"地在往后退"的读法
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = ridge;
    ctx.fillRect(0, y0, w, 1.4);
  }
  ctx.globalAlpha = 1;
  ctx.filter = prevFilter;
}

// 地平线上的炮楼（远景剪影）。近处那座走 DrawBlockhouse，这一支是给
// hills/farTown 层用的：那两层的糊与雾色会把细节整个吃掉，画细了白费——
// 要的是**轮廓**：略收分的方塔 + 外挑的顶台 + 一圈垛口 + 楼根的围墙。
// 华北的炮楼十来米高，在一马平川上就是这么一根戳出来的东西。
export function DrawHorizonFort(ctx, x, groundY, h, id, { color = "#a08e6a", lit = false } = {}) {
  // 高宽比压到 1:2.4 上下。给到 1:3 就成了烟囱——炮楼是五六米见方、十来米高的
  // 砖砌方筒，敦实是它的样子，也是它难打的原因
  const w = h * 0.42;                  // 方塔的收分：底比顶宽一点
  const topW = w * 1.2;                // 顶台外挑
  ctx.fillStyle = color;
  // 楼根那圈围墙：炮楼从不单独立着，脚下总有一道矮墙和壕。压得低、收得窄，
  // 太宽就成了塔的底座——它是院墙，不是基座
  ctx.fillRect(x - w * 1.5, groundY - h * 0.085, w * 3, h * 0.085);
  // 塔身：略收分的方塔
  ctx.beginPath();
  ctx.moveTo(x - w / 2, groundY);
  ctx.lineTo(x - w * 0.4, groundY - h);
  ctx.lineTo(x + w * 0.4, groundY - h);
  ctx.lineTo(x + w / 2, groundY);
  ctx.closePath();
  ctx.fill();
  // 顶：外挑一圈檐台，上面压一道**齐平不断口的女墙**。
  // 一排均匀的垛口是欧洲城堡的语汇——华北的炮楼是砖砌方筒加一圈平女墙，
  // 远看就是"一根戳出来的柱子顶着一个方帽子"，任何缺口都会把它读成城堡
  ctx.fillRect(x - topW / 2, groundY - h - h * 0.07, topW, h * 0.07);
  ctx.fillRect(x - topW * 0.42, groundY - h - h * 0.155, topW * 0.84, h * 0.09);
  // 射击孔：塔身上几粒暗点，只在不太糊的层上看得出，糊了也不碍事
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = "rgba(30,24,18,0.9)";
  for (let r = 0; r < 3; r += 1) {
    const ry = groundY - h * (0.42 + r * 0.2);
    ctx.fillRect(x - w * 0.16, ry, w * 0.13, h * 0.05);
    ctx.fillRect(x + w * 0.04, ry, w * 0.13, h * 0.05);
  }
  ctx.restore();
  // 夜里楼顶那一粒灯：这游戏讲的就是灯——地平线上每隔几里就点着一颗
  if (lit) {
    ctx.fillStyle = PAL.lampCore;
    ctx.beginPath();
    ctx.arc(x, groundY - h - h * 0.2, Math.max(1.6, h * 0.045), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.arc(x, groundY - h - h * 0.2, Math.max(4, h * 0.12), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

export function DrawPrison(ctx, x, groundY, id, { night = true } = {}) {
  const W = 96, H = 62;
  InkFill(ctx, Rect(x - W / 2, groundY - H, W, H), id, "#8a8071",
    { amp: 1.6, lw: 2.6, shade: "rgba(48,42,34,0.24)" });
  InkFill(ctx, [
    [x - W / 2 - 9, groundY - H], [x, groundY - H - 20], [x + W / 2 + 9, groundY - H],
  ], id + "roof", "#5f584a", { amp: 1.8, lw: 2.6 });
  // 铁窗
  for (let i = 0; i < 2; i += 1) {
    const wx = x - 26 + i * 44;
    InkFill(ctx, Rect(wx, groundY - H * 0.72, 26, 22), id + "w" + i, night ? "#b58a3e" : "#3a3128", { amp: 1, lw: 2.2 });
    for (let b = 0; b < 3; b += 1) {
      InkLine(ctx, wx + 6 + b * 7, groundY - H * 0.72, wx + 6 + b * 7, groundY - H * 0.72 + 22,
        id + "bar" + i + b, { lw: 1.8, color: "#2b241c", amp: 0.4 });
    }
  }
  InkFill(ctx, Rect(x - 12, groundY - 34, 24, 34), id + "door", "#4a3d2c", { amp: 1.1, lw: 2.4 });
}

// 天空：白天有水彩云，夜里有星，黎明贴地一条暖带
// 拴着的看门狗：卧姿，链子拴在木桩上。叫不叫由玩法层决定，这里只画它趴着
export function DrawDog(ctx, x, groundY, id, { alert = false } = {}) {
  const bx = x, by = groundY;
  // 木桩与链子
  InkLine(ctx, bx - 26, by, bx - 26, by - 18, id + "post", { lw: 4, color: "#6b5136" });
  ctx.strokeStyle = "#57504a";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(bx - 25, by - 14);
  ctx.quadraticCurveTo(bx - 12, by - 2 + Hash(id) * 3, bx + 2, by - 9);
  ctx.stroke();
  // 身子（卧）
  InkFill(ctx, [[bx - 8, by], [bx - 6, by - 10], [bx + 12, by - 11], [bx + 20, by - 4], [bx + 18, by]],
    id + "body", "#8a7350", { amp: 1.2, lw: 2, shade: "rgba(0,0,0,0.22)" });
  // 头（警觉时抬起）
  const hy = alert ? 20 : 13;
  InkFill(ctx, [[bx + 12, by - hy + 6], [bx + 14, by - hy - 2], [bx + 22, by - hy - 1], [bx + 24, by - hy + 5]],
    id + "head", "#8a7350", { amp: 0.8, lw: 1.8, shade: "rgba(0,0,0,0.18)" });
  // 耳朵
  InkFill(ctx, [[bx + 14, by - hy - 1], [bx + 16, by - hy - 7], [bx + 18, by - hy - 1]], id + "ear", "#6f5c40",
    { amp: 0.4, lw: 1.4 });
  // 尾巴
  InkLine(ctx, bx - 7, by - 8, bx - 14, by - 14, id + "tail", { lw: 2.6, color: "#6f5c40", amp: 1.4 });
}

// 挂在巷口的马灯：一根挑出来的木杆，底下吊一盏
export function DrawHangLantern(ctx, x, groundY, id, { lit = true } = {}) {
  InkLine(ctx, x - 4, groundY, x - 4, groundY - 96, id + "pole", { lw: 4.5, color: "#5f4a32" });
  InkLine(ctx, x - 6, groundY - 92, x + 16, groundY - 84, id + "arm", { lw: 3.5, color: "#5f4a32" });
  InkLine(ctx, x + 14, groundY - 85, x + 14, groundY - 72, id + "wire", { lw: 1.6, color: "#4c4238" });
  // 灯体
  InkFill(ctx, [[x + 8, groundY - 72], [x + 20, groundY - 72], [x + 18, groundY - 52], [x + 10, groundY - 52]],
    id + "body", lit ? "#e0b568" : "#5c5244", { amp: 0.7, lw: 1.9, shade: "rgba(0,0,0,0.2)" });
  if (lit) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    const g = ctx.createRadialGradient(x + 14, groundY - 62, 2, x + 14, groundY - 62, 26);
    g.addColorStop(0, "rgba(255,214,140,0.9)");
    g.addColorStop(1, "rgba(255,214,140,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - 20, groundY - 96, 68, 60);
    ctx.restore();
  }
}

// 刮上树杈的花布头巾：一角勾在杈上，其余的随风搭下来
// 挂在树杈上的一片破布。**布是靠褶认出来的**（2026-08-17 用户："布料…根本就
// 不像"）：挂着的布只有一个受力点，所有褶都从那一点辐射下来、越往下越散；
// 下摆被自重拉成一条软弧，边上还挂着抽出来的经纬线头。老版是一块六边形加两根
// 直线当印花——那是一片贴纸。
export function DrawCloth(ctx, x, y, id) {
  const top = y - 15, bot = y + 15;
  // 布身：上头收在挂点、下头张开的一片，下摆是软弧
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x - 1, top);
  ctx.quadraticCurveTo(x - 8, y - 4, x - 7.5, bot - 5);
  ctx.quadraticCurveTo(x - 2, bot + 2.5, x + 4, bot - 2);
  ctx.quadraticCurveTo(x + 9.5, bot - 6, x + 8, y - 3);
  ctx.quadraticCurveTo(x + 5, y - 11, x + 1.5, top);
  ctx.closePath();
  ctx.fillStyle = "#b8968c";
  ctx.fill();
  ctx.strokeStyle = "rgba(74,54,44,0.6)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.clip();
  // 四道褶，全从挂点辐射下来：越往下越散、越浅
  for (let i = 0; i < 4; i += 1) {
    const spread = (i - 1.5) * 4.4;
    ClothFold(ctx, x + spread * 0.14, top + 2, x + spread, bot - 3.5, 2.4 - Math.abs(i - 1.5) * 0.4,
      { bow: spread * 0.3, dark: "rgba(84,52,44,0.34)", lit: "rgba(255,236,224,0.30)" });
  }
  // 洗白的花：一两点，不是横条
  ctx.fillStyle = "rgba(232,216,204,0.5)";
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.ellipse(x - 4 + i * 4.4, y - 4 + (i % 2) * 7, 1.5, 1.2, Hash(id + "f" + i) * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // 下摆抽出来的线头：布破了才会有，这一笔比整片布都说明问题
  ctx.save();
  ctx.strokeStyle = "rgba(150,120,110,0.75)";
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 5; i += 1) {
    const fx = x - 6 + i * 3.2;
    ctx.beginPath();
    ctx.moveTo(fx, bot - 5 + Sym(id + "fy", i, 1.6));
    ctx.lineTo(fx + Sym(id + "fx", i, 2.4), bot + 1 + Hash(id + "fl" + i) * 4);
    ctx.stroke();
  }
  ctx.restore();
  // 勾在树杈上的那一角
  InkLine(ctx, x, top + 1, x + 2, top - 6, id + "snag", { lw: 1.4, color: "rgba(90,60,45,0.8)" });
}

// 石子堆：投掷的"弹药箱"。
// 上一版是七块平底的灰楔子——平底 + 路面上那道横车辙，读出来就是"半埋在路里"
// （用户原话：像被路遮住了一半）。这一版每颗都是滚圆的河卵石，整颗都在土面之上，
// 底下压一小片自己的影子与土窝，堆成前低后高的一小堆。
export function DrawStonePile(ctx, x, groundY, id) {
  // 土窝：石头堆久了压出来的一小片浅坑
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "#3a2c1c";
  ctx.beginPath();
  ctx.ellipse(x, groundY - 1.5, 24, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 一颗石头。**大小、扁瘦、色深都得各不相同**——一模一样的圆疙瘩码成金字塔，
  // 读出来是一堆炮弹，不是村口路边捡的石子
  const Stone = (px, py, rr, k, squash) => {
    // 每颗自己的接地影：石头是"搁"在土上的，不是"插"进去的
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = "#33281a";
    ctx.beginPath();
    ctx.ellipse(px + 1.4, py + rr * squash * 0.78, rr * 1.1, rr * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    const pts = [];
    const n = 7;
    const spin = Hash(id + "sa" + k) * 2.6;
    for (let a = 0; a < n; a += 1) {
      const ang = (a / n) * Math.PI * 2 + spin;
      const q = rr * (0.72 + Hash(id + "sq" + k + "_" + a) * 0.52);
      pts.push([px + Math.cos(ang) * q, py + Math.sin(ang) * q * squash]);
    }
    // 配色跟着土走（原先偏冷的青灰跟黄土路打架）。源色压得比直觉低两档：
    // 贴图上屏会被整体提亮（见 DrawWell 里那条注）。四档灰里混一档偏土的
    const FACE = ["#79715f", "#645d50", "#877f6c", "#6e6350"];
    InkFill(ctx, pts, id + "st" + k, FACE[k % 4], {
      amp: 0.6, lw: 1.3, line: IN.inkSoft, shade: "rgba(0,0,0,0.18)",
    });
    // 受光的一小道（不是整颗提亮，那会变成弹珠）
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#c6bca8";
    ctx.beginPath();
    ctx.ellipse(px - rr * 0.26, py - rr * squash * 0.36, rr * 0.34, rr * 0.16, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // 三层：底 5 颗、中 3 颗、顶 2 颗，越往上越小
  const ROWS = [
    { n: 5, y: 5.0, r: 5.0, span: 16 },
    { n: 3, y: 11.0, r: 4.4, span: 10 },
    { n: 2, y: 16.0, r: 3.6, span: 5 },
  ];
  let k = 0;
  for (let r = 0; r < ROWS.length; r += 1) {
    const row = ROWS[r];
    for (let i = 0; i < row.n; i += 1) {
      k += 1;
      const t = row.n === 1 ? 0.5 : i / (row.n - 1);
      Stone(x + (t - 0.5) * 2 * row.span + Sym(id + "sx", k, 1.9),
        groundY - row.y + Sym(id + "sy", k, 1.3),
        row.r * (0.70 + Hash(id + "sr" + k) * 0.66), k,
        0.72 + Hash(id + "sf" + k) * 0.30);
    }
  }
  // 滚出去的几颗小的：码得太整齐就成了摆件
  for (let i = 0; i < 3; i += 1) {
    k += 1;
    Stone(x + (i === 1 ? -1 : 1) * (17 + Hash(id + "lx" + i) * 8),
      groundY - 1.8 - Hash(id + "ly" + i) * 1.5,
      2.0 + Hash(id + "lr" + i) * 1.4, k, 0.7);
  }
}

// 洞室里的水瓮
export function DrawVat(ctx, x, groundY, id, { filled = true } = {}) {
  InkFill(ctx, [[x - 12, groundY], [x - 15, groundY - 18], [x - 10, groundY - 30], [x + 10, groundY - 30],
    [x + 15, groundY - 18], [x + 12, groundY]],
    id + "body", "#6e5b44", { amp: 1.2, lw: 2.2, shade: "rgba(0,0,0,0.26)" });
  // 口沿。水面只在真有水的时候画（「见了底」的缸口亮着一条水色，
  // 空缸就读成满缸——视觉审查退回过）；空缸口里是一圈往下看不到底的暗影
  InkLine(ctx, x - 10, groundY - 30, x + 10, groundY - 30, id + "rim", { lw: 2.4, color: IN.ink });
  if (filled) InkFill(ctx, Rect(x - 8, groundY - 29, 16, 3), id + "water", "#4d6a78", { amp: 0.5, lw: 1 });
  else InkFill(ctx, Rect(x - 8, groundY - 29, 16, 3), id + "dry", "#241c12", { amp: 0.5, lw: 1 });
}

// 地窖里的红薯堆：过冬的口粮码在窖底，上面搭半领草苫
export function DrawTuberPile(ctx, x, groundY, id) {
  for (let i = 0; i < 11; i += 1) {
    const px = x - 22 + (i % 5) * 11 + Hash(id + "tx" + i) * 5;
    const py = groundY - 5 - Math.floor(i / 5) * 9 - Hash(id + "ty" + i) * 3;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(px, py, 7 + Hash(id + "tr" + i) * 2.5, 4.6, Sym(id + "ta", i, 0.5), 0, Math.PI * 2);
    ctx.fillStyle = i % 3 ? "#8a5f3c" : "#96684a";
    ctx.fill();
    ctx.strokeStyle = IN.inkSoft;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }
  // 草苫搭在堆顶一角。色压两档、四边发毛：地窖暗底上一块又平又亮的浅色斜面
  // 读出来是"斜搭了块玻璃板"（视觉审查原话）——苇席要靠织纹和毛边立住
  InkFill(ctx, [[x - 26, groundY - 20], [x - 22, groundY - 24], [x - 4, groundY - 30], [x + 10, groundY - 29],
    [x + 20, groundY - 26], [x + 15, groundY - 21], [x + 8, groundY - 17], [x - 10, groundY - 17]],
    id + "mat", "#7d6a3e", { amp: 2.2, lw: 1.6, shade: "rgba(30,22,10,0.22)" });
  for (let i = 0; i < 7; i += 1) {
    InkLine(ctx, x - 22 + i * 6.4, groundY - 20 - i * 1.4, x - 17 + i * 6.4, groundY - 26 - i * 1.0,
      id + "straw" + i, { lw: 1.0, color: "rgba(52,40,20,0.55)", amp: 0.8 });
  }
  // 席沿的横篾压一道，斜面才有"编出来"的方向感
  InkLine(ctx, x - 24, groundY - 21.5, x + 17, groundY - 24.5, id + "weft",
    { lw: 0.9, color: "rgba(46,36,18,0.5)", amp: 1.0 });
}

// 地窖搁板：两根木桩架一块旧板，板上一只荆条筐、一只盖着布的坛子
export function DrawCellarShelf(ctx, x, groundY, id) {
  InkFill(ctx, Rect(x - 30, groundY - 40, 6, 40), id + "legL", "#5c452f", { amp: 1, lw: 2 });
  InkFill(ctx, Rect(x + 24, groundY - 40, 6, 40), id + "legR", "#5c452f", { amp: 1, lw: 2 });
  InkFill(ctx, Rect(x - 36, groundY - 46, 72, 7), id + "board", "#4e4234", { amp: 1.2, lw: 2.2, shade: "rgba(0,0,0,0.2)" });
  // 荆条筐
  InkFill(ctx, [[x - 26, groundY - 46], [x - 23, groundY - 64], [x - 3, groundY - 64], [x, groundY - 46]],
    id + "basket", "#9a7d4f", { amp: 1.4, lw: 1.8, shade: "rgba(0,0,0,0.18)" });
  for (let i = 1; i < 3; i += 1) {
    InkLine(ctx, x - 25 + i, groundY - 46 - i * 6, x - 1 - i, groundY - 46 - i * 6, id + "wv" + i,
      { lw: 1, color: "rgba(60,45,25,0.55)", amp: 1.2 });
  }
  // 布盖小坛
  InkFill(ctx, [[x + 8, groundY - 46], [x + 6, groundY - 58], [x + 12, groundY - 66], [x + 22, groundY - 66],
    [x + 27, groundY - 58], [x + 25, groundY - 46]], id + "jar", "#6e5b44", { amp: 1, lw: 1.8, shade: "rgba(0,0,0,0.22)" });
  InkFill(ctx, [[x + 9, groundY - 64], [x + 17, groundY - 70], [x + 25, groundY - 64], [x + 17, groundY - 61]],
    id + "cloth", "#a8927a", { amp: 1.2, lw: 1.4 });
}

// 牲口棚——扫荡那天烧塌了半边（剧本新生第一章）。
// 西半边：顶子整个落了架，两三根椽子烧成黑茬斜插着，墙根堆着灰；
// 东半边还立着：歪柱、草顶、食槽都在。**槽沿牲口啃出来的月牙凹痕保留**——
// 那道凹痕比槽里有草更能说明"原来有牲口"；如今连牲口带棚，都只剩一半。
export function DrawShed(ctx, x, groundY, id) {
  const W = 210, H = 105;
  // 棚下的暗腔：只剩东半边还有"里头"
  InkFill(ctx, [[x - 14, groundY], [x - 10, groundY - H * 0.66],
    [x + W / 2 - 10, groundY - H * 0.62], [x + W / 2 - 6, groundY]],
  id + "void", "#241d16", { amp: 2.0, lw: 2.0 });
  // —— 西半边：烧塌的那半 ——
  // 塌下来的顶：一大片焦草歪斜地搭到地上（压得低、颜色沉——烧过的草不发黄）
  InkFill(ctx, [[x - W / 2 + 2, groundY], [x - W / 2 + 8, groundY - H * 0.34],
    [x - 26, groundY - H * 0.50], [x - 10, groundY - H * 0.18], [x - 14, groundY]],
  id + "fallRoof", "#3d3220", { amp: 2.6, lw: 2.2, shade: "rgba(20,14,8,0.34)" });
  // 烧断的椽子：黑茬。**至少一根要探过屋面的剪影**——"塌了"这件事远看
  // 全靠天际线上那一道斜茬说，埋在墙色里等于没画。
  // 一根烧过的椽子不是一条深色的线：根上还是木头、越往梢越炭化、断口是**炸开
  // 的尖茬**不是平头，而且炭面要炸出龟裂（2026-08-17 用户："焦木…根本就不像"）
  const CharBeam = (bx0, by0, bx1, by1, w, bid) => {
    const dx = bx1 - bx0, dy = by1 - by0, L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    ctx.save();
    // 梁身：根粗梢细的一条，木色→炭色
    ctx.beginPath();
    ctx.moveTo(bx0 - nx * w * 0.5, by0 - ny * w * 0.5);
    ctx.lineTo(bx1 - nx * w * 0.3, by1 - ny * w * 0.3);
    ctx.lineTo(bx1 + nx * w * 0.3, by1 + ny * w * 0.3);
    ctx.lineTo(bx0 + nx * w * 0.5, by0 + ny * w * 0.5);
    ctx.closePath();
    const bg = ctx.createLinearGradient(bx0, by0, bx1, by1);
    bg.addColorStop(0, "#4a3a26");
    bg.addColorStop(0.45, "#241a12");
    bg.addColorStop(1, "#12100c");
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.save();
    ctx.clip();
    // 五六个像素粗的椽子上铺不下龟裂的网格（铺了就是一条铁链——第一版实拍
    // 正是这样）。这个尺度上"焦"只剩一样读得出来的记号：**横着一道道的裂口**，
    // 越靠梢越密。缝里透出的炭灰给一线，不给整圈
    const nick = Math.max(3, Math.round(L / (w * 3.2)));
    for (let i = 1; i < nick; i += 1) {
      const t = i / nick + Sym(bid + "nt", i, 0.05);
      const px = bx0 + dx * t, py = by0 + dy * t;
      const side = Hash(bid + "ns" + i) > 0.5 ? 1 : -1;
      const hw2 = w * 0.34 * (0.5 + Hash(bid + "n" + i) * 0.7);
      ctx.strokeStyle = `rgba(146,136,120,${0.10 + t * 0.12})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(px + nx * w * 0.32 * side, py + ny * w * 0.32 * side);
      ctx.lineTo(px + nx * (w * 0.32 * side - hw2 * side), py + ny * (w * 0.32 * side - hw2 * side));
      ctx.stroke();
    }
    ctx.restore();
    // 断口：炸开的尖茬，梢上一点烧透的灰白
    ctx.strokeStyle = "#100d09";
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    for (let i = 0; i < 3; i += 1) {
      const o = (i - 1) * w * 0.32;
      ctx.beginPath();
      ctx.moveTo(bx1 + nx * o, by1 + ny * o);
      ctx.lineTo(bx1 + nx * o + dx / L * (3 + Hash(bid + "t" + i) * 7),
        by1 + ny * o + dy / L * (3 + Hash(bid + "t" + i) * 7));
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(176,166,148,0.55)";
    ctx.beginPath();
    ctx.ellipse(bx1, by1, w * 0.42, w * 0.3, Math.atan2(dy, dx), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  CharBeam(x - W / 2 + 16, groundY, x - W / 2 + 34, groundY - H * 0.86, 5.2, id + "charA");
  CharBeam(x - W / 2 + 40, groundY - 4, x - W / 2 + 50, groundY - H * 0.62, 4.4, id + "charB");
  CharBeam(x - 30, groundY - H * 0.10, x - 50, groundY - H * 0.46, 3.8, id + "charC");
  // 墙根的灰堆：埋着瓦罐的那片烧土（第一章"找吃的"翻的就是这儿）
  DrawAshHeap(ctx, x - W / 2 + 33, groundY, 26, 11, id + "ash");
  // —— 东半边：还立着的那半 ——
  // 右柱 2/3 高处接过一段，缠三道草绳
  InkLine(ctx, x + W / 2 - 12, groundY, x + W / 2 - 14, groundY - H * 0.42, id + "postRa",
    { lw: 5, color: PAL.woodOldDark, amp: 1.4 });
  InkLine(ctx, x + W / 2 - 14, groundY - H * 0.40, x + W / 2 - 9, groundY - H * 0.66, id + "postRb",
    { lw: 4.4, color: PAL.woodOld, amp: 1.4 });
  for (let i = 0; i < 3; i += 1) {
    InkLine(ctx, x + W / 2 - 18, groundY - H * 0.40 - i * 3, x + W / 2 - 8, groundY - H * 0.41 - i * 3,
      id + "lash" + i, { lw: 1.4, color: "#6d5a3a", amp: 0.6 });
  }
  // 中柱：断口在半腰——西半边塌的时候拽折的
  InkLine(ctx, x - 10, groundY, x - 6, groundY - H * 0.68, id + "postM",
    { lw: 5, color: PAL.woodOld, amp: 1.6 });
  // 草顶只剩东半：断口那头发毛、掉着草
  const roof = [];
  for (let i = 0; i <= 5; i += 1) {
    const t = i / 5;
    roof.push([x - 16 + (W / 2 + 10) * t,
      groundY - H - 2 + Math.sin(t * Math.PI) * 7 + t * 9 + Sym(id + "rf", i, 2)]);
  }
  InkFill(ctx, roof.concat([[x + W / 2 - 6, groundY - H * 0.60], [x - 10, groundY - H * 0.66]]),
    id + "roof", "#7d6a3a", { amp: 2.4, lw: 2.4, shade: "rgba(50,38,18,0.24)" });
  // 断口边烟熏的黑晕
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = "#241c12";
  ctx.beginPath();
  ctx.ellipse(x - 10, groundY - H * 0.78, 16, 9, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // 檐口垂下的乱草（只剩东半有檐）
  for (let i = 0; i < 4; i += 1) {
    const gx = x - 4 + Rnd(id + "gx", i) * (W / 2 - 12);
    const gy = groundY - H * (0.62 + Rnd(id + "gy", i) * 0.06);
    for (let b = 0; b < 3; b += 1) {
      InkLine(ctx, gx + b * 2, gy, gx + b * 2 + Sym(id + "gb", i * 3 + b, 3), gy + 6 + Rnd(id + "gl", i * 3 + b) * 10,
        id + "drop" + i + b, { lw: 1, color: "#8a7a4e", amp: 1.2 });
    }
  }
  // 食槽：掏空的整根圆木，一头粗一头细，侧面一道通裂
  InkFill(ctx, [[x - 46, groundY - 8], [x + 30, groundY - 11], [x + 28, groundY - 22],
    [x - 44, groundY - 20]], id + "trough", PAL.woodOld, { amp: 1.8, lw: 2.0, shade: "rgba(0,0,0,0.24)" });
  InkLine(ctx, x - 42, groundY - 14, x + 26, groundY - 16, id + "crack",
    { lw: 1.2, color: "rgba(36,28,20,0.6)", amp: 1.2 });
  // 槽沿被牲口啃出来的月牙凹痕
  for (let i = 0; i < 3; i += 1) {
    const nx = x - 30 + i * 20;
    ctx.save();
    ctx.fillStyle = PAL.woodOldDark;
    ctx.beginPath();
    ctx.ellipse(nx, groundY - 20.5, 5, 2.2, 0, 0, Math.PI);
    ctx.fill();
    ctx.restore();
  }
  // 拴牲口的木橛上只剩一截磨光的烂绳头
  InkLine(ctx, x - W / 2 + 30, groundY, x - W / 2 + 31, groundY - 16, id + "peg", { lw: 3.4, color: PAL.woodOldDark, amp: 1.0 });
  InkLine(ctx, x - W / 2 + 31, groundY - 15, x - W / 2 + 38, groundY - 6, id + "rope",
    { lw: 1.6, color: "#7a6a48", amp: 1.6 });
}

// ---------------------------------------------------------------------------
// 找吃的那三样能上手的东西（第一章第一场，玩法在 Core 的 FORAGE）。
// 三张贴图都由 World 按玩法状态实时重画/转动，不是钉死的布景——所以它们不在
// Data_PropArt 里登记，跟那扇会晃的门（DrawHungDoor）同一类。
//
// 尺寸一律 48 像素/米（跟全场同一把尺）：苫子半幅 0.8m=38px、门板 1.5m=72px、
// 土堆 1.2m=58px。这几个数就是"玩家认不认得出这是能抓的东西"那笔账
// （实际尺寸 ÷ 画宽 ≥ 1/10，见 CLAUDE.md 拟物交互第 4 条）。
// ---------------------------------------------------------------------------

/**
 * 焦草苫子的一幅（贴在地上那一层）。从 (ax,ay) 沿 dir 方向铺出 len 像素。
 * 玩家掀的是这一幅：World 把它挂在折痕上转，所以这里只管"平铺着长什么样"。
 * torn = 撕掉了几口（手甩得比苫子快就会撕）；grab = 攥住了（外沿翘起来一点）。
 */
export function DrawThatchMat(ctx, ax, ay, id, { len = 38, dir = 1, torn = 0, grab = false } = {}) {
  const L = len * dir;
  // 厚一点（0.27m）才看得出是"一片苫子"而不是地上一道影子——实拍第一版
  // 只有 9px 高，跟脚底下的影子分不开
  const th = 13;
  const N = 8;
  const top = [], bot = [];
  for (let i = 0; i <= N; i += 1) {
    const t = i / N;
    // 苫子是一捆捆草扎起来的：上沿一鼓一鼓，绝不是一条直边
    const bulge = Math.sin(t * Math.PI) * 2.2 + Math.sin(t * 9.1) * 1.1;
    top.push([ax + L * t, ay - th - bulge - Sym(id + "t", i, 1.6)]);
    bot.push([ax + L * t, ay - Sym(id + "b", i, 1.0)]);
  }
  // 撕掉的那一口：外沿啃缺一块（撕过几次就缺几处）
  for (let k = 0; k < torn; k += 1) {
    const i = N - 1 - k * 2;
    if (i > 1) top[i] = [top[i][0], top[i][1] + 3.4 + Hash(id + "tear" + k) * 2.6];
  }
  // 底色比周围的瓦砾亮一档：不是为了好看，是为了**认得出这是一件能抓的
  // 东西**。第一版跟塌下来的椽子、地上的影子一个明度，实拍读出来是"一摊黑"
  InkFill(ctx, top.concat(bot.slice().reverse()), id + "body", "#6d5c3a",
    { amp: 1.6, lw: 2.2, shade: "rgba(16,11,6,0.36)" });
  // 草茎：一道道横着的短线，长短不一（顺着编的方向）。深浅都有，苫子才有肌理
  for (let i = 0; i < 14; i += 1) {
    const t0 = 0.04 + Hash(id + "s" + i) * 0.82;
    const ln = (0.10 + Hash(id + "sl" + i) * 0.16) * Math.abs(L) * dir;
    const y = ay - 2 - Hash(id + "sy" + i) * (th - 1.5);
    InkLine(ctx, ax + L * t0, y, ax + L * t0 + ln, y - 0.6 + Sym(id + "sd", i, 1.2),
      id + "stem" + i, { lw: 1.2, color: i % 3 ? "#8b7748" : "#3b3020", amp: 0.7 });
  }
  // 编苫子的那几道草绳箍：横过整幅，一道道压着草——"这是编起来的一片"
  for (let i = 0; i < 3; i += 1) {
    const t = 0.22 + i * 0.28;
    InkLine(ctx, ax + L * t, ay - 0.5, ax + L * t + dir * 1.4, ay - th - 1.5,
      id + "tie" + i, { lw: 1.6, color: "#5a4a2c", amp: 0.8 });
  }
  // 烧过的斑：两三块暗的（烧过的草不发黄，发黑发脆）
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = "#241b10";
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.ellipse(ax + L * (0.18 + i * 0.28), ay - 3 - Hash(id + "cy" + i) * 5,
      3.6 + Hash(id + "cr" + i) * 3, 2.2, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // 外沿的断草茬：探出去几根（这也是"这儿抓得住"的招呼，见 CLAUDE.md 第 8 条：
  // 图形提示必须钉在被操作的东西上）
  for (let i = 0; i < 5; i += 1) {
    const y = ay - 1 - Hash(id + "fy" + i) * th;
    const out = (3 + Hash(id + "fo" + i) * 4.6) * (grab ? 1.4 : 1) * dir;
    InkLine(ctx, ax + L, y, ax + L + out, y - 1.6 + Sym(id + "fd", i, 2.4),
      id + "fray" + i, { lw: 1.1, color: "#7a6740", amp: 1.1 });
  }
}

/**
 * 半扇烧塌的门板，平躺在地上。ax 是西头，往 +x 铺 len 像素。
 * 一头烧焦发黑（塌下来那头），另一头还看得出门轴头和两道门闩钉。
 */
export function DrawCharredPlank(ctx, ax, ay, id, { len = 72 } = {}) {
  const th = 11;
  const outline = [[ax, ay - 1], [ax + 2, ay - th + 1], [ax + len * 0.5, ay - th - 1.4],
    [ax + len, ay - th + 2], [ax + len, ay - 0.5], [ax + len * 0.45, ay + 1]];
  InkFill(ctx, outline, id + "body", "#5b4a33", { amp: 1.3, lw: 2.2, shade: "rgba(14,9,5,0.3)" });
  // 没烧着那半截的木纹：顺着长边一道道，深浅不匀——有纹才看得出是木头
  for (let i = 0; i < 5; i += 1) {
    const y = ay - 1.6 - i * 1.9;
    ctx.save();
    ctx.strokeStyle = i % 2 ? "rgba(46,34,20,0.32)" : "rgba(126,104,72,0.30)";
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(ax + len * 0.34, y);
    ctx.quadraticCurveTo(ax + len * 0.66, y - 0.9 + Sym(id + "gr", i, 1.2), ax + len - 3, y - 0.4);
    ctx.stroke();
    ctx.restore();
  }
  // 板缝：三块板拼的一扇门，缝顺着长边
  for (let i = 0; i < 2; i += 1) {
    const y = ay - 3.6 - i * 3.6;
    InkLine(ctx, ax + 4, y, ax + len - 5, y - 0.8 + Sym(id + "gd", i, 1.4),
      id + "gap" + i, { lw: 1, color: "rgba(34,24,14,0.55)", amp: 1.2 });
  }
  // 烧焦的那一头。**"焦"读得出来靠龟裂，不靠深色**：老版是一块 0.72 透明度的
  // 深褐色补丁，跟"这半截脏了"没有区别（2026-08-17 用户："焦木…根本就不像"）。
  // 三样一起给：① 烧界线不齐，是一路啃进去的；② 焦面炸成一格一格发亮的黑鳞，
  // 缝里是灰白的炭灰；③ 交界处一圈烤黄的焦痕，从木色过渡到炭色
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(ax - 1, ay + 1.5);
  ctx.lineTo(ax - 1, ay - th - 2);
  for (let i = 0; i <= 6; i += 1) {
    const t = i / 6;
    ctx.lineTo(ax + len * (0.30 + Sym(id + "burn", i, 0.055)), ay - th - 1 + t * (th + 3));
  }
  ctx.closePath();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "#1d1610";
  ctx.fillRect(ax - 2, ay - th - 3, len * 0.4, th + 6);
  CharScale(ctx, ax, ay - th, ax + len * 0.34, ay, id + "scale", { cell: 5.4 });
  ctx.restore();
  ctx.restore();
  // 烤黄的焦痕：从炭到木的那一指宽
  ctx.save();
  const sc = ctx.createLinearGradient(ax + len * 0.26, 0, ax + len * 0.52, 0);
  sc.addColorStop(0, "rgba(32,22,12,0.75)");
  sc.addColorStop(1, "rgba(32,22,12,0)");
  ctx.fillStyle = sc;
  ctx.beginPath();
  ctx.moveTo(ax + len * 0.26, ay + 1);
  ctx.lineTo(ax + len * 0.26, ay - th - 1.6);
  ctx.lineTo(ax + len * 0.56, ay - th - 0.6);
  ctx.lineTo(ax + len * 0.56, ay + 0.6);
  ctx.closePath();
  ctx.fill();
  // 烧塌那一头的板茬：崩掉的口子里探出几根没烧尽的木刺
  ctx.strokeStyle = "#0f0b07";
  ctx.lineWidth = 1.3;
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i += 1) {
    const y = ay - 2 - i * 3.2;
    ctx.beginPath();
    ctx.moveTo(ax + 1, y);
    ctx.lineTo(ax - 3 - Hash(id + "sp" + i) * 5, y - 1 + Sym(id + "spy", i, 2.2));
    ctx.stroke();
  }
  // 炭面上落的一层白灰
  Speckle(ctx, ax, ay - th, len * 0.3, th, id + "ash",
    { count: 14, alpha: 0.4, size: 1.3, color: "#b6ad9c" });
  ctx.restore();
  // 还看得出是门：轴头（东头那个圆木榫）与两颗门闩钉
  InkFill(ctx, [[ax + len - 2, ay - th + 2], [ax + len + 5, ay - th + 3],
    [ax + len + 5, ay - 3], [ax + len - 2, ay - 2]], id + "pin", "#6d5a3c",
  { amp: 1.0, lw: 1.8, shade: "rgba(0,0,0,0.22)" });
  ctx.save();
  ctx.fillStyle = "#2f2418";
  for (let i = 0; i < 2; i += 1) {
    ctx.beginPath();
    ctx.ellipse(ax + len * (0.58 + i * 0.2), ay - th * 0.62, 1.9, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * 墙根那片烧土（埋着瓦罐的那一堆）。ax/ay = 堆的中心与地平线。
 * World 把玩法状态整个递进来（fg.ash）：
 *   k = 扒掉了几成（堆真的一次比一次矮）；
 *   caught / clear = 指甲碰上坛肩了 / 顺着肩抹开了几成——**抹哪儿露哪儿**，
 *     露出的宽度跟 clear 走，抹过的地方留指痕（反馈长在工件上，不上 HUD）；
 *   jarX−x = 坛肩埋在堆心哪一侧（判定与作画共用 Core 那一个数）；
 *   jar = 整个肩都出来了；open = 泥封抠开了。
 * 封口是八稿的口径：**干泥糊口＋半块碗底压着**（WRAP 卡抠的就是它）。
 * 蓝底白花的碎布垫在碗片**底下**，揭开之前一寸都不许露——那是暗线的包袱。
 */
export function DrawAshMound(ctx, ax, ay, id,
  { k = 0, jar = false, open = false, caught = false, clear = 0, taken = false, jarX, x } = {}) {
  const hw = 29;                                  // 半幅 0.6m
  const h = 24 * (1 - 0.55 * Math.max(0, Math.min(1, k)));
  // 堆身走通用的灰笔（DrawAshHeap）：不描外轮廓、顶上发白底下发沉、埋着炭块与
  // 秫秸茬。老版是一个 InkFill 的半圆加几粒椭圆——实拍读出来是路边一块灰石头
  //（2026-08-17 用户："灰…根本就不像"）。扒过几把就在面上留几个坑
  DrawAshHeap(ctx, ax, ay, hw, h, id + "heap", { scoops: Math.round(Math.max(0, Math.min(1, k)) * 3) });
  if (!jar && !caught && clear <= 0 && !taken) return;
  // 坛肩锚在 Core 的 shoulderY 上（0.16m×48px/米），不跟着堆矮——
  // 坛子埋在土里，矮下去的是堆，不是它
  const jd = jarX !== undefined && x !== undefined ? (jarX - x) * 48 : 0;
  const jx = ax + jd;
  const jy = ay - 8;
  if (taken) {
    // 坛子抱走了：堆上只剩那个刨开的坑，坑沿散着几块泥渣
    InkFill(ctx, [[jx - 14, ay], [jx - 15, jy + 3], [jx - 7, jy - 2], [jx + 7, jy - 2],
      [jx + 15, jy + 3], [jx + 14, ay]],
    id + "pitEmpty", "#332c25", { amp: 1.6, lw: 1.6, shade: "rgba(0,0,0,0.34)" });
    ctx.save();
    ctx.fillStyle = "#6b5844";
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.ellipse(jx - 12 + Hash(id + "tx" + i) * 24, ay - 1.4 - Hash(id + "ty" + i) * 2.4,
        1.6 + Hash(id + "tr" + i) * 1.2, 1.0, Hash(id + "ta" + i), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }
  if (!jar) {
    // 刨出来的坑：灰底下露出的硬土，比灰沉一档、比坛子糙
    InkFill(ctx, [[jx - 14, ay], [jx - 15, jy + 3], [jx - 7, jy - 3], [jx + 7, jy - 3],
      [jx + 15, jy + 3], [jx + 14, ay]],
    id + "pit" + Math.round(clear * 3), "#39312a", { amp: 1.6, lw: 1.6, shade: "rgba(0,0,0,0.3)" });
    // 坛肩露出来的那一段：抹了几把露多宽（clear=0 只有指甲碰着的那一点）
    const w = 7 + clear * 19;
    ctx.save();
    ctx.beginPath();
    ctx.rect(jx - w / 2, 0, w, ay);
    ctx.clip();
    InkFill(ctx, [[jx - 11, ay], [jx - 12, jy + 4], [jx - 8, jy - 3], [jx, jy - 5],
      [jx + 8, jy - 3], [jx + 12, jy + 4], [jx + 11, ay]],
    id + "shold" + Math.round(clear * 3), "#57534a", { amp: 1.2, lw: 2.0, shade: "rgba(0,0,0,0.3)" });
    ctx.restore();
    // 抹过的指痕：一把一道，顺着肩横着走
    const wipes = Math.round(clear * 3);
    for (let i = 0; i < wipes; i += 1) {
      InkLine(ctx, jx - w / 2 + 2, jy - 2 + i * 2.2, jx + w / 2 - 2, jy - 2.6 + i * 2.2,
        id + "wipe" + i, { lw: 1.0, color: "rgba(138,128,116,0.55)", amp: 0.8 });
    }
    // 肩顶一道亮沿：灰陶比土亮，指甲碰的就是这儿
    InkLine(ctx, jx - w * 0.32, jy - 4.2, jx + w * 0.32, jy - 4.4, id + "rim",
      { lw: 1.2, color: "rgba(168,160,148,0.7)", amp: 0.6 });
    return;
  }
  // 罐肩整个出来了：土里探出来的那一圈。罐是灰陶，比土沉一档
  InkFill(ctx, [[jx - 11, ay], [jx - 12, jy + 4], [jx - 8, jy - 3], [jx, jy - 5],
    [jx + 8, jy - 3], [jx + 12, jy + 4], [jx + 11, ay]],
  id + "jar", "#57534a", { amp: 1.2, lw: 2.0, shade: "rgba(0,0,0,0.3)" });
  if (open) {
    // 泥封抠开了：罐口空张着（碗片与那圈碎布都在他怀里，坛边只剩几块泥渣）
    ctx.save();
    ctx.fillStyle = "#1a150f";
    ctx.beginPath();
    ctx.ellipse(jx, jy - 4, 7.6, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = "#6b5844";
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.ellipse(jx + 9 + Hash(id + "mx" + i) * 6, ay - 1.5 - Hash(id + "my" + i) * 3,
        1.8 + Hash(id + "mr" + i) * 1.2, 1.1, Hash(id + "ma" + i), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else {
    // 八稿封口：坛口糊着一圈干泥，上面压着半块碗底（WRAP 卡抠的就是这两样；
    // 蓝花碎布垫在碗片底下，这儿一寸都不露）
    InkFill(ctx, [[jx - 8, jy - 1.5], [jx - 6.5, jy - 6.5], [jx, jy - 8], [jx + 6.5, jy - 6.5],
      [jx + 8, jy - 1.5], [jx, jy + 0.5]], id + "mud", "#6b5844",
    { amp: 1.2, lw: 1.6, shade: "rgba(0,0,0,0.22)" });
    // 干泥上的裂纹
    InkLine(ctx, jx - 5, jy - 4.5, jx - 1, jy - 3.2, id + "crkA",
      { lw: 0.9, color: "rgba(52,40,28,0.6)", amp: 0.7 });
    InkLine(ctx, jx + 2, jy - 6, jx + 5, jy - 3.5, id + "crkB",
      { lw: 0.9, color: "rgba(52,40,28,0.6)", amp: 0.7 });
    // 半块碗底：浅釉色的一弯，断口冲着东边
    ctx.save();
    ctx.fillStyle = "#a09a8e";
    ctx.beginPath();
    ctx.ellipse(jx + 1, jy - 7.5, 6.2, 2.3, 0.12, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(40,32,24,0.75)";
    ctx.lineWidth = 1.1;
    ctx.stroke();
    // 圈足：碗底朝天扣着，中间那圈足最认得出“这是个碗底”
    ctx.beginPath();
    ctx.ellipse(jx + 0.5, jy - 8.6, 2.6, 0.9, 0.12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * 苇席（第七稿 forage 段）：编织的横纹席面。签名照 DrawThatchMat 的约定
 * （World 烘半幅：ax/ay = 折痕那头，往 dir 方向铺 len 像素）。
 * 苇子比焦苫草亮一档、也齐整一档——它没烧过；但边上还是要散几根苇条，
 * 齐得像机器轧的就不是村里的席了。torn 收下不用（苇席不撕，见 FORAGE.reed）。
 */
export function DrawReedMat(ctx, ax, ay, id, { len = 30, dir = 1, torn = 0, grab = false } = {}) {
  void torn;
  const L = len * dir;
  const th = 11;
  const N = 8;
  const top = [], bot = [];
  for (let i = 0; i <= N; i += 1) {
    const t = i / N;
    // 席是压出来的，比苫子平——鼓包小一号，但仍不许是直线
    const bulge = Math.sin(t * Math.PI) * 1.2 + Math.sin(t * 8.3) * 0.7;
    top.push([ax + L * t, ay - th - bulge - Sym(id + "t", i, 1.0)]);
    bot.push([ax + L * t, ay - Sym(id + "b", i, 0.8)]);
  }
  // 底色提亮一档到苇黄（#8a7a56 一族）：实拍里跟焦苫草几乎同明度，
  // 读不出这是另一样东西（首轮退回）
  InkFill(ctx, top.concat(bot.slice().reverse()), id + "body", "#8a7a56",
    { amp: 1.2, lw: 2.0, shade: "rgba(16,11,6,0.28)" });
  // 经纬十字编织：横向一根浅苇条压一道深缝线，交替排满——编织读出来靠对比
  const rows = 5, rowGap = (th - 2.6) / (rows - 1);
  for (let i = 0; i < rows; i += 1) {
    const y = ay - 1.8 - i * rowGap;
    // 浅苇条（宽）
    InkLine(ctx, ax + L * 0.03, y, ax + L * 0.97, y - 0.3 + Sym(id + "wv", i, 0.8),
      id + "weft" + i, { lw: 1.7, color: "#9c8c62", amp: 0.5 });
    // 苇条之间的深缝线（窄）
    if (i < rows - 1) {
      const ys = y - rowGap / 2;
      InkLine(ctx, ax + L * 0.04, ys, ax + L * 0.96, ys + Sym(id + "sv", i, 0.6),
        id + "seam" + i, { lw: 0.9, color: "rgba(52,42,24,0.8)", amp: 0.4 });
    }
  }
  // 竖向的经条：加密到六道，叠压块隔行错半格——十字纹靠这一层立起来
  for (let i = 0; i < 6; i += 1) {
    const t = 0.09 + i * 0.155;
    InkLine(ctx, ax + L * t, ay - 0.6, ax + L * t + dir * 1.0, ay - th - 0.6,
      id + "warp" + i, { lw: 1.1, color: "rgba(64,52,30,0.75)", amp: 0.6 });
    // 经在纬上压过去的那一格：棋盘错位的小暗块
    for (let j = 0; j < rows; j += 1) {
      if ((i + j) % 2) continue;
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "#4c3f22";
      ctx.fillRect(ax + L * t - 1.2, ay - 2.8 - j * rowGap, 2.4, 2.0);
      ctx.restore();
    }
  }
  // 外沿散开的苇条：更长更亮、一根根数得出（也是"这儿抓得住"的招呼）
  for (let i = 0; i < 6; i += 1) {
    const y = ay - 0.6 - Hash(id + "fy" + i) * th;
    const out = (3.6 + Hash(id + "fo" + i) * 5.4) * (grab ? 1.4 : 1) * dir;
    InkLine(ctx, ax + L * 0.985, y, ax + L + out, y - 1 + Sym(id + "fd", i, 2.4),
      id + "fray" + i, { lw: 1.25, color: i % 2 ? "#9c8c62" : "#8a7a56", amp: 0.9 });
  }
}

/**
 * 半截木食槽（挖空的原木槽）。ax/ay = 槽中心与地平线（照 DrawAshMound 在
 * forage 里的烘法：World 的 BakeSprite(70,26,35,22)）。
 * k ∈ 0..1 = 槽底那层秕谷壳被刮走的比例：壳真的一把把变少，露出槽底的木色。
 */
export function DrawFeedTrough(ctx, ax, ay, id, { k = 0 } = {}) {
  const hw = 33, h = 18;
  const kk = Math.max(0, Math.min(1, k));
  // 槽身：一根原木对剖，外帮风化成灰木色。两头是锯出来的端面
  InkFill(ctx, [[ax - hw, ay - h + 2], [ax - hw + 3, ay - 3], [ax - hw + 9, ay],
    [ax + hw - 9, ay], [ax + hw - 3, ay - 3], [ax + hw, ay - h + 2],
    [ax + hw - 4, ay - h], [ax - hw + 4, ay - h]],
  id + "body", "#5d5648", { amp: 1.4, lw: 2.2, shade: "rgba(0,0,0,0.28)" });
  // 外帮的风化裂纹：顺着木理的两三道
  for (let i = 0; i < 3; i += 1) {
    const y = ay - 3 - i * 4;
    InkLine(ctx, ax - hw + 6 + i * 5, y, ax + hw - 10 - i * 7, y - 1 + Sym(id + "ck", i, 1.6),
      id + "crack" + i, { lw: 1.0, color: "rgba(38,33,26,0.5)", amp: 1.4 });
  }
  // 槽膛：挖空的那一条，口沿一圈厚唇
  InkFill(ctx, [[ax - hw + 6, ay - h + 3], [ax + hw - 6, ay - h + 3],
    [ax + hw - 10, ay - h + 8], [ax - hw + 10, ay - h + 8]],
  id + "hollow", "#2e2921", { amp: 1.0, lw: 1.8 });
  // 槽底：露出来的木色（刮走多少露多少——k 越大这条越宽越亮）
  if (kk > 0.05) {
    ctx.save();
    ctx.globalAlpha = 0.5 + kk * 0.4;
    ctx.fillStyle = "#4a4234";
    ctx.fillRect(ax - (hw - 12) * kk, ay - h + 4.5, (hw - 12) * 2 * kk, 2.6);
    ctx.restore();
  }
  // 秕谷壳：干黄的碎点，越刮越少（从当中往两头留）
  const husks = Math.round(26 * (1 - kk * 0.9));
  ctx.save();
  for (let i = 0; i < husks; i += 1) {
    const t = Hash(id + "hx" + i);
    // 刮是从当中刮起的：剩下的壳越来越靠两头
    const off = (0.5 + (t - 0.5) * (0.6 + 0.4 * (1 - kk))) * 2 - 1;
    const px = ax + off * (hw - 11);
    if (kk > 0.15 && Math.abs(off) < kk * 0.55) continue;
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = i % 3 ? "#6f6240" : "#57503a";
    ctx.fillRect(px, ay - h + 4 + Hash(id + "hy" + i) * 3.2, 1.8, 1.1);
  }
  ctx.restore();
  // 端面：年轮两圈
  ctx.save();
  ctx.strokeStyle = "rgba(40,35,26,0.6)";
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.ellipse(ax - hw + 3.4, ay - h / 2 - 1, 2.6, h / 2 - 2, 0.1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** 半袋谷种：矮胖的粗布口袋，下半瘫坐变形；扎着口，口上压半块青砖 */
export function DrawSeedBag(ctx, ax, ay, id) {
  // 袋身：只剩半袋，下半摊开、上半空瘪往一边歪
  InkFill(ctx, [[ax - 13, ay], [ax - 12.4, ay - 6], [ax - 9, ay - 12], [ax - 5, ay - 15],
    [ax + 3, ay - 15.5], [ax + 8, ay - 12.5], [ax + 11.6, ay - 6], [ax + 13, ay]],
  id + "body", "#6d5f45", { amp: 1.2, lw: 2.0, shade: "rgba(0,0,0,0.24)" });
  // 布纹与一道原来的缝线
  InkLine(ctx, ax - 9, ay - 4, ax + 9.4, ay - 4.6, id + "seam",
    { lw: 0.8, color: "rgba(70,58,38,0.55)", amp: 0.9 });
  InkLine(ctx, ax - 10.6, ay - 8.4, ax + 10, ay - 9, id + "fold",
    { lw: 0.9, color: "rgba(40,32,20,0.45)", amp: 1.1 });
  // 扎口：绳勒出一圈脖子，布耳朵翘出来
  InkLine(ctx, ax - 4.6, ay - 14.2, ax + 3.8, ay - 14.6, id + "tie", { lw: 1.4, color: "#4e4234", amp: 0.4 });
  InkFill(ctx, [[ax - 2.4, ay - 15], [ax - 4.2, ay - 18], [ax - 0.8, ay - 16.4],
    [ax + 1.4, ay - 18.4], [ax + 2.2, ay - 15.2]],
  id + "ear", "#5e5138", { amp: 0.7, lw: 1.2 });
  // 口上压的半块青砖：断口朝外，压着才踏实
  InkFill(ctx, [[ax - 1, ay - 16.6], [ax + 9.6, ay - 17.4], [ax + 10.4, ay - 13.6], [ax - 0.2, ay - 13]],
    id + "brick", "#4a4740", { amp: 0.7, lw: 1.6, shade: "rgba(0,0,0,0.26)" });
  InkLine(ctx, ax + 9.6, ay - 17, ax + 10.2, ay - 13.8, id + "brickBrk",
    { lw: 1.0, color: "rgba(28,26,22,0.7)", amp: 0.8 });
}

// ---------------------------------------------------------------------------
// 第七稿第一章的场景道具（地头 / 窖里 / 屋里）
// ---------------------------------------------------------------------------

/**
 * 华北木耧（人力播种耧车），侧视朝东（往 +x 耩）。约 60×52px（1.25×1.08m）。
 * 手工木器：没有一条线是笔直的（"四边笔直＝没有手"）。
 * 认它靠四样：往后上方翘的两根扶手柄、梯形楼斗、底下两三条带铁脚的耧腿、横撑。
 */
export function DrawLou(ctx, x, groundY, id) {
  const W1 = "#54432f", W2 = "#3f3222";     // 耧木：使旧的枣木色再压两档
  // 耧腿：从斗底奓开往下，腿端是开沟的铁脚（后腿被前腿挡去一半）
  const legs = [[-7, -1.5], [1, 0.8], [8, 2.6]];
  for (let i = 0; i < legs.length; i += 1) {
    const [dx, splay] = legs[i];
    InkLine(ctx, x + dx * 0.55, groundY - 26, x + dx + splay, groundY - 2,
      id + "leg" + i, { lw: i === 1 ? 3.2 : 2.6, color: i === 1 ? W1 : W2, amp: 0.9 });
    // 铁脚：一小片下宽上窄的铧尖，吃进土里那头发暗
    InkFill(ctx, [[x + dx + splay - 1.6, groundY - 3], [x + dx + splay + 1.4, groundY - 3.4],
      [x + dx + splay + 2.2, groundY + 1], [x + dx + splay - 1, groundY + 1]],
    id + "foot" + i, "#3a3a38", { amp: 0.5, lw: 1.4, shade: "rgba(0,0,0,0.3)" });
  }
  // 横撑：两道，把腿别在一起（一道在腿腰、一道在斗底下）
  InkLine(ctx, x - 8, groundY - 14, x + 10.5, groundY - 12.4, id + "brace1",
    { lw: 2.2, color: W2, amp: 0.8 });
  InkLine(ctx, x - 6.5, groundY - 23, x + 9, groundY - 22, id + "brace2",
    { lw: 2.0, color: W1, amp: 0.7 });
  // 楼斗：梯形的种子斗（上宽下窄），斗口敞着；斗身一道箍
  InkFill(ctx, [[x - 12, groundY - 44], [x + 12.5, groundY - 45.5], [x + 7, groundY - 26.5],
    [x - 6.5, groundY - 26]],
  id + "hopper", W1, { amp: 1.2, lw: 2.2, shade: "rgba(0,0,0,0.26)", shadeAt: 0.5 });
  InkLine(ctx, x - 9.6, groundY - 36, x + 10, groundY - 36.8, id + "hoop",
    { lw: 1.2, color: "rgba(30,24,16,0.55)", amp: 0.8 });
  // 斗口那道黑：斗是空的还是有种，一眼看斗口
  ctx.save();
  ctx.fillStyle = "#241c12";
  ctx.beginPath();
  ctx.ellipse(x + 0.4, groundY - 44.6, 11.2, 2.2, -0.03, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // 两根扶手柄：从斗后腰往后上方翘（扶耧的人在西头）；柄梢磨得发亮
  for (const [oy, tag] of [[0, "A"], [3.4, "B"]]) {
    InkLine(ctx, x - 5, groundY - 30 - oy * 0.4, x - 27, groundY - 44 - oy,
      id + "handle" + tag, { lw: 2.4, color: W1, amp: 1.1 });
    InkLine(ctx, x - 24.5, groundY - 43 - oy, x - 27, groundY - 44.2 - oy,
      id + "handleTip" + tag, { lw: 2.6, color: "#6a563e", amp: 0.4 });
  }
  // 柄间的短撑（手握的那道横木）
  InkLine(ctx, x - 22, groundY - 41.5, x - 22.8, groundY - 46.2, id + "grip",
    { lw: 1.8, color: W2, amp: 0.5 });
  // 往前的拉杆：套绳的那一小截（拉耧的人在东头）
  InkLine(ctx, x + 9, groundY - 28, x + 26, groundY - 31, id + "pole",
    { lw: 2.2, color: W2, amp: 0.9 });
  InkLine(ctx, x + 24.4, groundY - 32.8, x + 26.4, groundY - 29.2, id + "polePin",
    { lw: 1.4, color: "#3a3a38", amp: 0.3 });
}

/**
 * 去年的谷茬地：割剩的短茬一排一排「齐刷刷指着天」。x = 中心，宽 w。
 * 贴地矮物（茬高 8~12px ≈ 一拃多），行距规整、每根有自己那点歪。
 */
export function DrawStubbleField(ctx, x, groundY, w, id) {
  const x0 = x - w / 2;
  // 干土打底：微微翻起的一层，颜色发灰的旱土
  InkFill(ctx, [[x0 - 3, groundY], [x0 + 2, groundY - 3.4], [x0 + w * 0.3, groundY - 2.4],
    [x0 + w * 0.62, groundY - 3.8], [x0 + w - 2, groundY - 2.8], [x0 + w + 3, groundY]],
  id + "soil", "#55462f", { amp: 1.2, lw: 1.8, shade: "rgba(0,0,0,0.2)" });
  // 后排：矮半截、暗一档（隔着一垄）
  for (let row = 1; row >= 0; row -= 1) {
    const step = 7.2;
    const yBase = groundY - 2 - row * 3.6;
    const n = Math.floor((w - 8 - row * step * 0.5) / step);
    for (let i = 0; i <= n; i += 1) {
      const px = x0 + 4 + row * step * 0.5 + i * step + Sym(id + "jx" + row, i, 0.9);
      const h = (8 + Hash(id + "h" + row + i) * 4) * (row ? 0.7 : 1);
      const lean = Sym(id + "ln" + row, i, 1.8);
      const col = row ? "#4a4230" : (i % 3 ? "#6d6040" : "#57503a");
      // 一根茬：底粗梢平（割的），一两根裂开的皮
      InkLine(ctx, px, yBase, px + lean, yBase - h, id + "st" + row + i,
        { lw: row ? 1.2 : 1.8, color: col, amp: 0.5 });
      if (!row && i % 2) {
        InkLine(ctx, px + 0.8, yBase - 1, px + lean + 2.2, yBase - h * 0.72,
          id + "st2" + row + i, { lw: 1.0, color: "#7a6f4c", amp: 0.5 });
      }
      // 根部的土坷垃
      if (!row && i % 3 === 0) {
        ctx.save();
        ctx.fillStyle = "#463a26";
        ctx.beginPath();
        ctx.ellipse(px + 1.2, yBase - 0.4, 2.0 + Hash(id + "cl" + i) * 1.2, 1.1,
          Hash(id + "ca" + i), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }
}

/**
 * 新耩上的湿垄（东邻家的）：一趟一趟平行的低垄，「直得像用线量过」。
 * 侧视里垄是顺着地排开的几条低棱；土色深（湿）。高度贴地（≤14px）。
 */
export function DrawSownField(ctx, x, groundY, w, id) {
  const x0 = x - w / 2;
  // 湿土整片：比旁边的旱地深两档
  InkFill(ctx, [[x0 - 3, groundY], [x0 + 2, groundY - 4.6], [x0 + w * 0.36, groundY - 3.6],
    [x0 + w * 0.7, groundY - 4.8], [x0 + w - 2, groundY - 3.4], [x0 + w + 3, groundY]],
  id + "wet", "#3a2e21", { amp: 1.1, lw: 1.8, shade: "rgba(0,0,0,0.22)" });
  // 三道垄：每道＝垄身一条微鼓的暗棱 + 垄顶一线略浅的棱线。
  // 垄线要直（量过线的直），毛边只许在棱线的颗粒里，不许在走向里
  for (let i = 0; i < 3; i += 1) {
    const y = groundY - 3.2 - i * 3.4;
    const inset = 3 + i * 5;
    InkLine(ctx, x0 + inset, y, x0 + w - inset, y - 0.3, id + "ridge" + i,
      { lw: 2.6, color: "#31261a", amp: 0.35 });
    InkLine(ctx, x0 + inset + 2, y - 1.3, x0 + w - inset - 2, y - 1.5, id + "crest" + i,
      { lw: 1.1, color: "#4d3d2a", amp: 0.3 });
    // 棱线上手指感的毛边：一粒一粒的湿土疙瘩，不匀
    ctx.save();
    ctx.fillStyle = "#443627";
    for (let j = 0; j < 9; j += 1) {
      const px = x0 + inset + 3 + Hash(id + "gx" + i + j) * (w - inset * 2 - 6);
      ctx.globalAlpha = 0.5 + Hash(id + "ga" + i + j) * 0.4;
      ctx.fillRect(px, y - 2 + Hash(id + "gy" + i + j) * 1.6, 1.6, 1.1);
    }
    ctx.restore();
  }
}

/**
 * 菜窖角落那堆草苫/干草（夜里底下藏着人）。低矮一垛约 46×22px，
 * 草茎深浅两色、边缘发毛、一角微微翘起——翘起的那角是后面那一镜的伏笔。
 */
export function DrawStrawMat(ctx, x, groundY, id) {
  const hw = 23, h = 20;
  // 垛身：几团搭起来的（不是一个大椭圆，画笔通病那条）
  const pts = [[x - hw, groundY]];
  const lumps = 6;
  for (let i = 0; i <= lumps; i += 1) {
    const t = i / lumps;
    const bump = Math.sin(t * Math.PI) * h * (0.8 + 0.25 * Math.sin(t * 8.7 + 1))
      + Sym(id + "top", i, 2.2);
    pts.push([x - hw + hw * 2 * t, groundY - Math.max(2, bump)]);
  }
  pts.push([x + hw, groundY]);
  InkFill(ctx, pts, id + "heap", "#5e5033", { amp: 1.8, lw: 2.0, shade: "rgba(10,7,4,0.3)" });
  // 草茎：深浅两色的短线，顺着各自的铺向
  for (let i = 0; i < 16; i += 1) {
    const t = 0.06 + Hash(id + "sx" + i) * 0.86;
    const px = x - hw + hw * 2 * t;
    const py = groundY - 2 - Hash(id + "sy" + i) * (h - 5) * Math.sin(t * Math.PI);
    const ln = 4 + Hash(id + "sl" + i) * 6;
    const a = Sym(id + "sa", i, 0.5) + (t - 0.5) * 0.7;
    InkLine(ctx, px, py, px + Math.cos(a) * ln, py - Math.abs(Math.sin(a)) * ln * 0.4,
      id + "stem" + i, { lw: 1.1, color: i % 3 ? "#6d5c3a" : "#443a22", amp: 0.6 });
  }
  // 边缘的毛：往外探的碎草，探多远各不相同
  for (let i = 0; i < 6; i += 1) {
    const side = i % 2 ? 1 : -1;
    const py = groundY - 1.5 - Hash(id + "fy" + i) * h * 0.5;
    InkLine(ctx, x + side * (hw - 3), py, x + side * (hw + 1.5 + Hash(id + "fo" + i) * 3.6),
      py - 1 + Sym(id + "fd", i, 2.2), id + "fray" + i,
      { lw: 1.0, color: "#6a5a36", amp: 0.8 });
  }
  // 微微翘起的那一角（东南角）：一小片离了地，底下一道黑缝
  InkFill(ctx, [[x + hw - 9, groundY - 1], [x + hw - 2, groundY - 7.5], [x + hw + 3, groundY - 5],
    [x + hw + 1, groundY - 0.5]],
  id + "lift", "#6a5a36", { amp: 1.2, lw: 1.6, shade: "rgba(0,0,0,0.2)" });
  ctx.save();
  ctx.fillStyle = "rgba(6,4,2,0.8)";
  ctx.beginPath();
  ctx.ellipse(x + hw - 3.4, groundY - 1.2, 4.6, 1.4, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * 从草堆底下伸出来的一条前臂和手。
 *
 * **2026-08-14 退役**（用户：「这个陌生人你完全没做出来」）：这一镜原本靠这张
 * 静帧顶着——一只贴在地上的手，离柱子一米远，不动、也没有主人。现在那只手
 * 是真演员（wounded）的胳膊，走 Rig 的 `strawReach`/`strawSink` 两条轨道。
 * 画笔留着不删：地上那只手将来还会有别的用处（缴械、拖走伤员），
 * 尺寸与画法都是量过的。挂回去要三处一起补：Data_Scenes 的物体、
 * Data_PropArt 的画笔与尺寸、World 那张 switch 的一行（漏了 switch 是静默不画）。
 */
export function DrawStrawArm(ctx, x, groundY, id) {
  // 前臂：从西头（草堆那边）伸出来，微微离地
  InkFill(ctx, [[x - 15, groundY - 8.5], [x - 2, groundY - 7.8], [x + 1, groundY - 6.8],
    [x + 0.5, groundY - 2.6], [x - 3, groundY - 2], [x - 15, groundY - 2.8]],
  id + "sleeve", "#3f382e", { amp: 1.0, lw: 1.8, shade: "rgba(0,0,0,0.3)" });
  // 袖口破着口：豁开的两个尖，里子更暗
  InkFill(ctx, [[x - 1, groundY - 7.6], [x + 2.4, groundY - 8.6], [x + 1.6, groundY - 5.6],
    [x + 3, groundY - 4], [x + 0.4, groundY - 2.4]],
  id + "cuffTear", "#2b261e", { amp: 0.8, lw: 1.2 });
  // 手：手背拱着，四根手指张开半攥（扣向地），拇指在近侧
  InkFill(ctx, [[x + 1, groundY - 6.6], [x + 6.5, groundY - 7.4], [x + 10, groundY - 5.6],
    [x + 10.5, groundY - 3.4], [x + 7, groundY - 2], [x + 2, groundY - 2.2]],
  id + "hand", "#5c3f2b", { amp: 0.8, lw: 1.6, shade: "rgba(0,0,0,0.24)" });
  // 半攥的手指：一根根扣下去，指节发白一点
  for (let i = 0; i < 4; i += 1) {
    const fx = x + 6.8 + i * 1.9;
    InkLine(ctx, fx, groundY - 5.6 + i * 0.3, fx + 1.8, groundY - 2.2 + Sym(id + "fg", i, 0.7),
      id + "finger" + i, { lw: 1.5, color: "#4e3524", amp: 0.4 });
  }
  InkLine(ctx, x + 3, groundY - 6.8, x + 5.6, groundY - 7.2, id + "thumb",
    { lw: 1.6, color: "#5c3f2b", amp: 0.3 });
  // 压在袖子上的两三根草：他是从草堆底下伸出来的
  for (let i = 0; i < 3; i += 1) {
    InkLine(ctx, x - 14 + i * 3, groundY - 9 - Hash(id + "hy" + i) * 2,
      x - 8 + i * 3.4, groundY - 3 - Hash(id + "hy2" + i) * 3,
      id + "straw" + i, { lw: 1.0, color: i % 2 ? "#6a5a36" : "#443a22", amp: 0.7 });
  }
}

/**
 * 窖里散乱的一小片家什（摸黑归置之前）：歪着的破笸箩、两只豁口碗
 * （一只倒扣）、一枚纺锭拖着线头。约 60×26px。
 */
export function DrawCellarSundries(ctx, x, groundY, id) {
  // 破笸箩：浅帮的圆笸箩侧倒着歪在西头，帮上豁一块
  InkFill(ctx, [[x - 28, groundY - 2], [x - 26, groundY - 12], [x - 20, groundY - 15.5],
    [x - 12.5, groundY - 13], [x - 10.5, groundY - 4], [x - 14, groundY - 0.5]],
  id + "basket", "#66562f", { amp: 1.3, lw: 1.9, shade: "rgba(0,0,0,0.24)" });
  // 笸箩的圈条：两道弧（编条一圈圈）
  for (let i = 0; i < 2; i += 1) {
    ctx.save();
    ctx.strokeStyle = "rgba(46,37,20,0.6)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.ellipse(x - 19.5, groundY - 8 + i * 2.4, 7 - i * 1.6, 4.6 - i * 1.2, 0.35, 0.4, Math.PI * 1.5);
    ctx.stroke();
    ctx.restore();
  }
  // 帮上豁的那一口
  ctx.save();
  ctx.fillStyle = "#241e12";
  ctx.beginPath();
  ctx.ellipse(x - 24.6, groundY - 12.6, 2.4, 1.3, 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // 两只豁口碗：一只口朝上，一只倒扣（同"豁口碗"那支小笔的画法，落地尺寸）
  InkFill(ctx, [[x - 4.5, groundY - 6.5], [x - 3, groundY - 1], [x + 3, groundY - 1],
    [x + 4.5, groundY - 6.5], [x + 1.8, groundY - 6.5], [x + 1, groundY - 5.2], [x + 0.2, groundY - 6.5]],
  id + "bowlUp", "#57534a", { amp: 0.7, lw: 1.5, shade: "rgba(0,0,0,0.24)" });
  InkFill(ctx, [[x + 8, groundY - 1], [x + 9.5, groundY - 5.5], [x + 15.5, groundY - 5.5],
    [x + 17, groundY - 1]],
  id + "bowlDown", "#4c4840", { amp: 0.7, lw: 1.5, shade: "rgba(0,0,0,0.2)" });
  InkLine(ctx, x + 10.6, groundY - 5.9, x + 14.4, groundY - 5.9, id + "bowlFoot",
    { lw: 1.2, color: "#5f5b52", amp: 0.3 });
  // 纺锭：一根小木杆穿着圆盘锭轮，倒在东头，线头拖出去
  InkLine(ctx, x + 20, groundY - 6.5, x + 27, groundY - 1.5, id + "spindle",
    { lw: 1.4, color: "#7a5433", amp: 0.4 });
  ctx.save();
  ctx.fillStyle = "#5c4530";
  ctx.beginPath();
  ctx.ellipse(x + 23.2, groundY - 4.2, 2.8, 1.8, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = IN.ink;
  ctx.lineWidth = 1.0;
  ctx.stroke();
  ctx.restore();
  // 拖着的线头：弯弯地拖到碗边
  ctx.save();
  ctx.strokeStyle = "rgba(150,138,112,0.7)";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(x + 21, groundY - 5.4);
  ctx.quadraticCurveTo(x + 14, groundY - 2, x + 7.5, groundY - 3.5);
  ctx.quadraticCurveTo(x + 4, groundY - 4.4, x + 3.2, groundY - 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * 同一批家什归置好的样子（摸黑归置之后）：笸箩靠墙摆正、碗摞成一摞、
 * 纺锭线绕紧搁在碗旁。约 54×24px。
 */
export function DrawCellarSundriesTidy(ctx, x, groundY, id) {
  // 笸箩：立着靠墙（正面一个椭圆盘），帮上那一豁还在——还是那只
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x - 16, groundY - 9, 9.5, 8.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#66562f";
  ctx.fill();
  ctx.strokeStyle = IN.ink;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.strokeStyle = "rgba(46,37,20,0.6)";
  ctx.lineWidth = 1.1;
  for (let i = 0; i < 2; i += 1) {
    ctx.beginPath();
    ctx.ellipse(x - 16, groundY - 9, 6.6 - i * 2.6, 5.6 - i * 2.2, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "#241e12";
  ctx.beginPath();
  ctx.ellipse(x - 9.5, groundY - 13.6, 2.0, 1.1, 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // 碗摞成一摞：豁口的那只在最上（豁口冲着看的人——归置的人手黑里摸得出）
  InkFill(ctx, [[x - 0.5, groundY - 1], [x + 0.8, groundY - 4.6], [x + 9.2, groundY - 4.6],
    [x + 10.5, groundY - 1]],
  id + "bowlBase", "#4c4840", { amp: 0.6, lw: 1.5, shade: "rgba(0,0,0,0.22)" });
  InkFill(ctx, [[x + 0.6, groundY - 4.6], [x + 1.8, groundY - 8.2], [x + 8.4, groundY - 8.2],
    [x + 9.4, groundY - 4.6], [x + 6.4, groundY - 4.6], [x + 5.6, groundY - 5.8], [x + 4.8, groundY - 4.6]],
  id + "bowlTop", "#57534a", { amp: 0.6, lw: 1.5, shade: "rgba(0,0,0,0.2)" });
  // 纺锭：线绕得紧紧的一个梭形，搁在碗旁
  ctx.save();
  ctx.fillStyle = "#8a7d62";
  ctx.beginPath();
  ctx.ellipse(x + 17.5, groundY - 2.8, 4.0, 2.0, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = IN.ink;
  ctx.lineWidth = 1.1;
  ctx.stroke();
  // 绕紧的线：两三道缠痕
  ctx.strokeStyle = "rgba(70,60,44,0.65)";
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.ellipse(x + 17.5, groundY - 2.8, 3.2 - i * 0.9, 1.7 - i * 0.4, -0.15, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  InkLine(ctx, x + 21, groundY - 3.4, x + 24.5, groundY - 2.6, id + "spTip",
    { lw: 1.2, color: "#7a5433", amp: 0.3 });
}

/**
 * 针线笸箩：浅圆笸箩里一叠叠得整整齐齐的小孩旧褂子（两三件、深浅错开），
 * 最上面那件领口别着一根针（一点冷光）+ 一截线。约 34×20px。
 */
export function DrawSewBasket(ctx, x, groundY, id) {
  // 浅笸箩：口沿一圈、帮矮
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, groundY - 4, 16.5, 4.6, 0, 0, Math.PI);
  ctx.fillStyle = "#75633f";
  ctx.fill();
  ctx.strokeStyle = IN.ink;
  ctx.lineWidth = 1.7;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x, groundY - 4.4, 16.5, 3.4, 0, Math.PI, Math.PI * 2);
  ctx.strokeStyle = "rgba(46,37,20,0.7)";
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();
  // 叠好的旧褂子：三层，深浅错开（暗红/靛蓝/本白），层与层错半指
  const stack = [
    ["#6d5f45", 0, -6.2],
    ["#262e38", 0.8, -9.4],
    ["#5e2f37", -0.6, -12.4],
  ];
  for (let i = 0; i < stack.length; i += 1) {
    const [col, dx, dy] = stack[i];
    InkFill(ctx, [[x - 10.5 + dx, groundY + dy + 3], [x - 10 + dx, groundY + dy],
      [x + 10 + dx, groundY + dy - 0.4], [x + 10.6 + dx, groundY + dy + 3]],
    id + "shirt" + i, col, { amp: 0.7, lw: 1.4, shade: "rgba(0,0,0,0.18)" });
    // 叠出来的袖折：一道竖痕
    InkLine(ctx, x - 3 + dx, groundY + dy - 0.2, x - 2.6 + dx, groundY + dy + 2.6,
      id + "fold" + i, { lw: 0.8, color: "rgba(20,16,12,0.4)", amp: 0.4 });
  }
  // 最上面那件的领口：一道领边 + 别着的针（冷光高光）+ 一截线
  InkLine(ctx, x - 4.5, groundY - 12.6, x + 3.5, groundY - 13, id + "collar",
    { lw: 1.0, color: "rgba(24,18,14,0.6)", amp: 0.4 });
  ctx.save();
  ctx.strokeStyle = "#b9c2c8";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(x - 1.6, groundY - 14.2);
  ctx.lineTo(x + 4.2, groundY - 12.2);
  ctx.stroke();
  // 针鼻上那一点最亮的冷光
  ctx.fillStyle = "#dde4e8";
  ctx.fillRect(x + 3.6, groundY - 12.8, 1.1, 1.1);
  // 线：从针鼻垂下来搭在褂子上
  ctx.strokeStyle = "rgba(150,138,112,0.75)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x + 4.2, groundY - 12.2);
  ctx.quadraticCurveTo(x + 7, groundY - 9.6, x + 5, groundY - 7.4);
  ctx.stroke();
  ctx.restore();
}

/**
 * 缝好的小褂子叠在枕边：暗红（妹妹衣色再压暗），**一只袖口接了一截
 * 蓝底白花**，针脚歪歪扭扭（虚线不匀）。约 26×14px。
 */
export function DrawMendedJacket(ctx, x, groundY, id) {
  // 叠好的衣身
  InkFill(ctx, [[x - 12, groundY - 1], [x - 11.4, groundY - 9], [x - 6, groundY - 11],
    [x + 8, groundY - 10.6], [x + 11.6, groundY - 8], [x + 12, groundY - 1]],
  id + "body", "#5e2f37", { amp: 0.9, lw: 1.6, shade: "rgba(0,0,0,0.22)" });
  // 叠痕一道
  InkLine(ctx, x - 9.6, groundY - 5.6, x + 9.8, groundY - 5.2, id + "fold",
    { lw: 0.8, color: "rgba(26,14,16,0.55)", amp: 0.8 });
  // 露在外面的那只袖子：袖口接了一截蓝底白花（靛蓝底 + 米白小花点）
  InkFill(ctx, [[x + 4, groundY - 4.6], [x + 14, groundY - 5.4], [x + 15.5, groundY - 1.4],
    [x + 5, groundY - 0.8]],
  id + "sleeve", "#552a31", { amp: 0.8, lw: 1.4, shade: "rgba(0,0,0,0.2)" });
  InkFill(ctx, [[x + 11.2, groundY - 5.2], [x + 15.8, groundY - 5.6], [x + 17, groundY - 1.2],
    [x + 12.4, groundY - 1]],
  id + "patch", "#262e38", { amp: 0.7, lw: 1.3, shade: "rgba(0,0,0,0.18)" });
  // 白花：两三点
  ctx.save();
  ctx.fillStyle = "rgba(158,166,180,0.5)";
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.ellipse(x + 12.6 + i * 1.5, groundY - 4.2 + (i % 2) * 1.6, 0.7, 0.5, i, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // 接口的针脚：歪歪扭扭的虚线，大的大小的小
  ctx.save();
  ctx.strokeStyle = "rgba(196,186,160,0.8)";
  ctx.lineWidth = 0.8;
  let sy = groundY - 5.0;
  for (let i = 0; i < 4; i += 1) {
    const seg = 0.7 + Hash(id + "st" + i) * 1.1;
    ctx.beginPath();
    ctx.moveTo(x + 11.4 + Sym(id + "sx", i, 0.7), sy);
    ctx.lineTo(x + 11.9 + Sym(id + "sx", i, 0.7), sy + seg);
    ctx.stroke();
    sy += seg + 0.6 + Hash(id + "sg" + i) * 0.5;
  }
  ctx.restore();
}

// 屋里那两只粗瓷碗（黄昏·匀稠的）：一只正着，碗面上漂两三片榆钱；
// 一只斜倚着——喝空了搁下的样子。摆在凳边地上，匀稠那两下手就对着它们做
export function DrawMealBowls(ctx, x, groundY, id) {
  ctx.save();
  const B = (bx, tilt) => {
    ctx.save();
    ctx.translate(x + bx, groundY);
    ctx.rotate(tilt);
    // 碗身：上宽下窄的粗瓷，色压暗（CanvasTexture 上屏会提亮）
    ctx.fillStyle = "#4a4038";
    ctx.strokeStyle = "#241e18";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-7.5, -6.5);
    ctx.quadraticCurveTo(-6.5, -0.5, -3.4, 0);
    ctx.lineTo(3.4, 0);
    ctx.quadraticCurveTo(6.5, -0.5, 7.5, -6.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 碗口沿
    ctx.fillStyle = "#5c5044";
    ctx.beginPath();
    ctx.ellipse(0, -6.5, 7.5, 2.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };
  B(-6, 0);
  // 正碗里的水面 + 漂着的两三片榆钱
  ctx.fillStyle = "#3a3a30";
  ctx.beginPath();
  ctx.ellipse(x - 6, groundY - 6.5, 5.6, 1.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6b7a4a";
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.ellipse(x - 8 + i * 2.2 + Hash(id + "e" + i) * 1.2, groundY - 6.6, 1.05, 0.6, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // 斜倚的空碗
  B(7, -0.34);
  ctx.restore();
}

// 土坯灶（剧本新生第一章开场那眼冷灶）：方墩灶台、一口铁锅坐在灶眼上、
// 灶口一个黑洞、贴墙一截烟道。冷灶的画法就在"没有"里——灶口只有冷灰，
// 没有一点火色；锅沿也不冒气。
export function DrawStove(ctx, x, groundY, id) {
  // 灶体：土坯抹泥，边角剥落
  InkFill(ctx, [[x - 22, groundY], [x - 21, groundY - 26], [x + 21, groundY - 27], [x + 22, groundY]],
    id + "body", "#8a7458", { amp: 1.6, lw: 2.2, shade: "rgba(60,44,28,0.22)" });
  // 抹泥剥落的两块（露出里头的坯色）
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = "#6e5b44";
  ctx.beginPath(); ctx.ellipse(x - 12, groundY - 8, 4.6, 3, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + 14, groundY - 18, 3.6, 2.4, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // 灶口：黑洞，口沿熏黑，底下一撮冷灰（发灰白，不发红——冷灶的全部）
  InkFill(ctx, [[x - 8, groundY - 2], [x - 7, groundY - 12], [x, groundY - 15], [x + 7, groundY - 12], [x + 8, groundY - 2]],
    id + "mouth", "#1c1712", { amp: 1.0, lw: 1.8 });
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = "#8a8478";
  ctx.beginPath(); ctx.ellipse(x, groundY - 2.4, 5.5, 1.8, 0, 0, Math.PI); ctx.fill();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = "rgba(28,22,16,0.8)";
  ctx.beginPath(); ctx.ellipse(x, groundY - 14.5, 8.5, 3, 0, Math.PI, Math.PI * 2); ctx.fill();
  ctx.restore();
  // 铁锅：坐进灶眼，只露锅沿和一段弧
  ctx.save();
  ctx.fillStyle = "#3a3f44";
  ctx.beginPath();
  ctx.ellipse(x, groundY - 27.5, 15, 4.4, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = IN.ink;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.restore();
  InkLine(ctx, x - 15, groundY - 27.5, x + 15, groundY - 27.5, id + "rim", { lw: 2.0, color: "#565c62", amp: 0.5 });
  // 贴墙的烟道：一根土坯方柱往上收
  InkFill(ctx, [[x + 15, groundY - 24], [x + 16, groundY - 44], [x + 22, groundY - 44], [x + 23, groundY - 24]],
    id + "flue", "#7a6650", { amp: 1.2, lw: 1.8, shade: "rgba(0,0,0,0.18)" });
  // 烟道口熏黑
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = "#241c12";
  ctx.beginPath(); ctx.ellipse(x + 19, groundY - 44, 4, 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// 踩碎的纺车（剧本新生第一章：看到，但你什么都没说）。
// 手摇纺车侧视：大轮倒在地上，轮圈被踩断成两段、错开一个茬口；三两根辐条
// 支棱出来；矮机架翻着，锭杆折了，一缕断线还挂在辐条上。
// 全部要害在"断口错位"——圈要是还连着，就只是一辆放倒的纺车。
export function DrawSpinWheelBroken(ctx, x, groundY, id) {
  // 翻倒的机架：一条矮凳腿朝天
  InkFill(ctx, [[x + 8, groundY], [x + 10, groundY - 7], [x + 40, groundY - 9], [x + 42, groundY - 2], [x + 40, groundY]],
    id + "bench", PAL.woodOld, { amp: 1.2, lw: 2.0, shade: "rgba(0,0,0,0.2)" });
  InkLine(ctx, x + 16, groundY - 8, x + 14, groundY - 20, id + "legA", { lw: 3, color: PAL.woodOldDark, amp: 0.8 });
  InkLine(ctx, x + 34, groundY - 8, x + 36, groundY - 18, id + "legB", { lw: 3, color: PAL.woodOldDark, amp: 0.8 });
  // 大轮：斜倚着地，轮圈断成两段——上段还撑着弧，下段塌平、错开一个茬
  const cx = x - 12, cy = groundY - 15, R = 17;
  ctx.save();
  ctx.strokeStyle = "#6b5138";
  ctx.lineWidth = 3.2;
  ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI * 1.06, Math.PI * 2.28); ctx.stroke();  // 上段弧
  ctx.lineWidth = 2.8;
  ctx.beginPath(); ctx.arc(cx + 4, cy + 9, R * 0.9, Math.PI * 0.34, Math.PI * 0.94); ctx.stroke(); // 塌下去的下段
  ctx.restore();
  // 断口的毛茬：两三根短刺
  for (let i = 0; i < 3; i += 1) {
    InkLine(ctx, cx + R * 0.9 + Sym(id + "sp" + i, i, 2), cy + 6 + i * 2,
      cx + R * 0.9 + 4 + Sym(id + "sq" + i, i, 3), cy + 3 + i * 2,
      id + "splint" + i, { lw: 1.2, color: "#4e4234", amp: 0.6 });
  }
  // 轮毂 + 支棱的辐条（有的还连着圈，有的折了半截）
  ctx.save();
  ctx.fillStyle = "#4e4234";
  ctx.beginPath(); ctx.arc(cx, cy, 2.8, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  const SPOKES = [[1.25, 1.0], [1.75, 1.0], [2.15, 0.95], [0.55, 0.55], [2.8, 0.5]];
  for (let i = 0; i < SPOKES.length; i += 1) {
    const [a, k] = SPOKES[i];
    InkLine(ctx, cx, cy, cx + Math.cos(a) * R * k, cy + Math.sin(a) * R * k,
      id + "spoke" + i, { lw: 1.6, color: "#6b5138", amp: 0.5 });
  }
  // 折断的锭杆：一头在架上，一头戳在地上
  InkLine(ctx, x + 24, groundY - 9, x + 18, groundY - 15, id + "spindleA", { lw: 1.8, color: PAL.woodOldDark, amp: 0.5 });
  InkLine(ctx, x + 16, groundY - 4, x + 20, groundY - 1, id + "spindleB", { lw: 1.8, color: PAL.woodOldDark, amp: 0.5 });
  // 断线：一缕棉线从辐条飘到机架，还打着卷
  ctx.save();
  ctx.strokeStyle = "rgba(214,202,178,0.75)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx + 8, cy - 6);
  ctx.bezierCurveTo(x + 2, cy - 14, x + 12, groundY - 6, x + 22, groundY - 8);
  ctx.stroke();
  ctx.restore();
}

// 窖角草苫下的深色包袱（带血的衣裳）。整件事的分寸：草苫盖着大半，
// 只露一角深色的布和两块发暗的渍——不清晰、不血腥，镜头看三秒就走
//（历史与叙事铁律：不做伤口特写；渍色按 sRGB 老账压两档）。
export function DrawClothBundle(ctx, x, groundY, id) {
  // 布卷：低低的一卷，塞在墙根
  InkFill(ctx, [[x - 15, groundY], [x - 14, groundY - 9], [x - 4, groundY - 13], [x + 10, groundY - 11], [x + 14, groundY - 4], [x + 13, groundY]],
    id + "roll", "#463c33", { amp: 1.2, lw: 1.8, shade: "rgba(0,0,0,0.24)" });
  // 卷起来的布：褶顺着卷的方向绕，谷心暗、脊上亮——一卷布和一根木头的区别
  // 就在这几道软褶上
  ClothFold(ctx, x - 13, groundY - 1.5, x - 3, groundY - 12.5, 2.4,
    { bow: -1.8, dark: "rgba(14,10,8,0.5)", lit: "rgba(196,178,150,0.24)" });
  ClothFold(ctx, x - 2, groundY - 0.8, x + 6, groundY - 12, 2.0,
    { bow: -1.5, dark: "rgba(14,10,8,0.42)", lit: "rgba(196,178,150,0.2)" });
  ClothFold(ctx, x + 7, groundY - 0.6, x + 12, groundY - 10, 1.7,
    { bow: -1.1, dark: "rgba(14,10,8,0.36)", lit: "rgba(196,178,150,0.18)" });
  // 发暗的渍：两小块，压得很沉
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = "#38201c";
  ctx.beginPath(); ctx.ellipse(x + 4, groundY - 8, 3.4, 2.2, 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.4;
  ctx.beginPath(); ctx.ellipse(x - 3, groundY - 4, 2.4, 1.6, -0.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // 草苫搭在上头：盖住大半（画在布之后——先有布，草苫才盖得住它）
  InkFill(ctx, [[x - 18, groundY - 6], [x - 8, groundY - 15], [x + 6, groundY - 14], [x - 2, groundY - 5]],
    id + "mat", "#8a7648", { amp: 1.6, lw: 1.4, shade: "rgba(50,38,18,0.18)" });
  for (let i = 0; i < 3; i += 1) {
    InkLine(ctx, x - 14 + i * 6, groundY - 7 - i * 2.4, x - 9 + i * 6, groundY - 13 - i * 1.2,
      id + "straw" + i, { lw: 1, color: "rgba(70,55,28,0.55)", amp: 0.8 });
  }
  // 一只袖子从草苫底下耷拉出来。没有它，夜里这卷布读成一块深色木箱——
  // "是衣裳"这件事全靠袖口这一截说（视觉审查退回过）
  InkFill(ctx, [[x + 7, groundY - 9], [x + 16, groundY - 6], [x + 19, groundY - 2], [x + 13, groundY], [x + 6, groundY - 4]],
    id + "sleeve", "#524639", { amp: 1.1, lw: 1.6, shade: "rgba(0,0,0,0.2)" });
  InkLine(ctx, x + 9, groundY - 6.5, x + 16.5, groundY - 3, id + "sleeveFold",
    { lw: 0.8, color: "rgba(24,19,15,0.55)", amp: 0.7 });
  // 袖口一线浅衬里：布不是铁板一块
  InkLine(ctx, x + 16.5, groundY - 5.5, x + 18.5, groundY - 2.5, id + "cuff",
    { lw: 1.0, color: "rgba(150,132,104,0.5)", amp: 0.4 });
}

// 铺在榆树底下接榆钱的破褂子（第一章打榆钱那场，2026-08-12 用户改稿）。
// 平摊的布在侧视里只有几个像素——所以四角故意没抻死：两个角拢着土坷垃
// 撑起一拳高（竖向有东西才认得出，找吃的那场的教训），布身给两道褶。
// green = 砸下第二把之后：布面铺了一层榆钱的绿（走 propRedraw 单张重烘）
export function DrawSpreadCoat(ctx, x, groundY, id, { green = false } = {}) {
  // 布身：靛蓝土布，摊开约 1.3m
  InkFill(ctx, [[x - 31, groundY], [x - 29, groundY - 4], [x - 22, groundY - 2],
    [x - 6, groundY - 3.5], [x + 12, groundY - 2.4], [x + 24, groundY - 4.6],
    [x + 30, groundY - 1], [x + 31, groundY]],
    id + "cloth", "#232c3d", { amp: 1.1, lw: 1.6, shade: "rgba(0,0,0,0.2)" });
  // 两个角拢起来（压着土坷垃）：左右各一个小鼓包
  InkFill(ctx, [[x - 31, groundY], [x - 30, groundY - 7], [x - 24, groundY - 9], [x - 20, groundY - 3], [x - 21, groundY]],
    id + "cornerW", "#1d2534", { amp: 1.0, lw: 1.4, shade: "rgba(0,0,0,0.24)" });
  InkFill(ctx, [[x + 21, groundY], [x + 22, groundY - 4], [x + 27, groundY - 8.6], [x + 31, groundY - 6], [x + 31, groundY]],
    id + "cornerE", "#1d2534", { amp: 1.0, lw: 1.4, shade: "rgba(0,0,0,0.24)" });
  // 褶：摊在地上的布，褶是从压住的两个角**斜着拉过去**的，不是两条平行横线。
  // 一道褶＝谷心一条暗＋旁边一条被绷亮的脊（ClothFold），布才不是一块纸板
  ClothFold(ctx, x - 24, groundY - 5.5, x + 6, groundY - 2.2, 2.6,
    { bow: 1.6, dark: "rgba(8,10,16,0.5)", lit: "rgba(120,140,175,0.26)" });
  ClothFold(ctx, x + 24, groundY - 5.4, x - 2, groundY - 1.6, 2.2,
    { bow: -1.4, dark: "rgba(8,10,16,0.44)", lit: "rgba(120,140,175,0.22)" });
  ClothFold(ctx, x - 12, groundY - 2.6, x + 16, groundY - 3.0, 1.6,
    { bow: 1.0, dark: "rgba(8,10,16,0.36)", lit: "rgba(120,140,175,0.2)" });
  ctx.save();
  ctx.fillStyle = "rgba(168,160,140,0.45)";
  ctx.beginPath(); ctx.ellipse(x - 12, groundY - 2.4, 2.2, 1.2, 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (!green) return;
  // 铺了一层绿：榆钱是一小片一小片的圆钱，颜色压两档（sRGB 老账），
  // 中间厚、边上薄
  ctx.save();
  for (let i = 0; i < 26; i += 1) {
    const t = Hash(id + "elmT" + i);
    const ex = x + (t - 0.5) * 46 * (0.6 + 0.4 * Hash(id + "elmS" + i));
    const ey = groundY - 2 - Hash(id + "elmY" + i) * 3.2;
    ctx.fillStyle = i % 3 ? "rgba(86,110,54,0.85)" : "rgba(104,128,62,0.85)";
    ctx.beginPath();
    ctx.ellipse(ex, ey, 1.5 + Hash(id + "elmR" + i) * 0.9, 1.1, Hash(id + "elmA" + i) * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// 屋里的铺盖：半领苇席，薄被卷在东头。妹妹「还睡着」「放平掖好被角」
// 那几镜都躺在这上头——人不能睡在光地上（视觉审查退回过"坐在空气上"，
// 睡更是）。席子给织纹，被卷给折痕，都是压过两档的沉色
export function DrawBeddingMat(ctx, x, groundY, id) {
  InkFill(ctx, [[x - 34, groundY], [x - 31, groundY - 4], [x + 28, groundY - 5], [x + 34, groundY]],
    id + "mat", "#8b7649", { amp: 1.0, lw: 1.6, shade: "rgba(0,0,0,0.16)" });
  for (let i = 0; i < 5; i += 1) {
    InkLine(ctx, x - 30 + i * 13, groundY - 0.6, x - 27 + i * 13, groundY - 4.2,
      id + "weave" + i, { lw: 0.8, color: "rgba(70,55,28,0.5)", amp: 0.5 });
  }
  InkLine(ctx, x - 31, groundY - 4.4, x + 29, groundY - 5.0, id + "hem",
    { lw: 1.0, color: "rgba(52,40,22,0.55)", amp: 0.8 });
  // 薄被卷在东头（睡的人头朝西）
  InkFill(ctx, [[x + 20, groundY], [x + 19, groundY - 8], [x + 24, groundY - 12], [x + 31, groundY - 10],
    [x + 33, groundY - 3], [x + 32, groundY]],
    id + "quilt", "#6a5560", { amp: 1.2, lw: 1.8, shade: "rgba(0,0,0,0.2)" });
  InkLine(ctx, x + 21, groundY - 7, x + 30, groundY - 8.5, id + "quiltFold",
    { lw: 0.9, color: "rgba(30,24,26,0.5)", amp: 0.8 });
}

// 斜靠在棚里的旧木料：两块拆下来的旧门板 + 一根枣木杠。
// 挖通道的全部家底，第一章独轮车来拉的就是它
export function DrawOldDoors(ctx, x, groundY, id) {
  // 后一块门板（靠得更斜）
  ctx.save();
  ctx.translate(x - 18, groundY);
  ctx.rotate(-0.30);
  InkFill(ctx, Rect(-14, -92, 30, 92), id + "dA", "#6b5b46", { amp: 1.2, lw: 2.2, shade: "rgba(0,0,0,0.18)" });
  InkLine(ctx, -8, -84, -8, -6, id + "gA1", { lw: 1, color: "rgba(90,60,35,0.55)", amp: 1.4 });
  InkLine(ctx, 4, -86, 4, -4, id + "gA2", { lw: 1, color: "rgba(90,60,35,0.45)", amp: 1.4 });
  ctx.restore();
  // 前一块（矮一头，缺个角）
  ctx.save();
  ctx.translate(x + 8, groundY);
  ctx.rotate(-0.22);
  InkFill(ctx, [[-13, 0], [-13, -74], [8, -80], [14, -68], [14, 0]], id + "dB", "#4e4234",
    { amp: 1.2, lw: 2.2, shade: "rgba(0,0,0,0.2)" });
  InkLine(ctx, -4, -70, -4, -6, id + "gB1", { lw: 1, color: "rgba(70,48,28,0.55)", amp: 1.4 });
  ctx.restore();
  // 枣木杠：斜搭在门板上
  InkLine(ctx, x - 40, groundY - 4, x + 44, groundY - 58, id + "pole", { lw: 5, color: "#6b4a28", amp: 1 });
  InkLine(ctx, x - 40, groundY - 4, x + 44, groundY - 58, id + "poleHi", { lw: 1.6, color: "rgba(190,150,95,0.5)", amp: 1 });
}

// 空车辕：牲口被牵走后剩下的一副辕，一头着地一头翘着。
// 不画牲口，就是「被牵走」本身
export function DrawCartShafts(ctx, x, groundY, id) {
  // 车轴短桩 + 两根长辕
  InkFill(ctx, Rect(x + 26, groundY - 18, 14, 18), id + "hub", "#5c452f", { amp: 1.2, lw: 2, shade: "rgba(0,0,0,0.2)" });
  InkLine(ctx, x + 30, groundY - 14, x - 52, groundY - 2, id + "shaftA", { lw: 4, color: "#6b4d2e", amp: 1 });
  InkLine(ctx, x + 34, groundY - 16, x - 46, groundY - 30, id + "shaftB", { lw: 4, color: "#4e4234", amp: 1 });
  // 辕头的皮套环，空荡荡耷拉着
  ctx.strokeStyle = "rgba(60,42,26,0.8)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x - 48, groundY - 24, 6, -0.6, Math.PI * 1.1); ctx.stroke();
}

// 贴告示的半截土墙：征粮征夫的告示一层压一层，新的盖着旧的。
// scars=扫荡留下的一排弹孔（剧本新生第一章）：孔是砸进土坯的黑点，
// 四周崩出一圈浅色的掉皮——顺序对（先有墙皮再崩掉）才读得出是打上去的
export function DrawNoticeWall(ctx, x, groundY, w, id, { scars = false } = {}) {
  DrawWall(ctx, x, groundY, w, 90, id);
  if (scars) {
    for (let i = 0; i < 6; i += 1) {
      const sx = x - w / 2 * 0.7 + (i / 5) * w * 0.66 + Sym(id + "bhx", i, 4);
      // 压在告示下沿以下那条带里（-26～-46）：告示别把弹孔盖掉
      const sy = groundY - 26 - Hash(id + "bhy" + i) * 20;
      const r = 1.6 + Hash(id + "bhr" + i) * 1.1;
      // 崩掉的墙皮（浅一档，形状发毛）
      ctx.save();
      ctx.fillStyle = "rgba(196,178,142,0.55)";
      ctx.beginPath();
      ctx.ellipse(sx + 0.6, sy + 0.4, r * 2.4, r * 1.9, Hash(id + "bha" + i) * 1.2, 0, Math.PI * 2);
      ctx.fill();
      // 孔本体
      ctx.fillStyle = "rgba(30,23,16,0.88)";
      ctx.beginPath();
      ctx.ellipse(sx, sy, r, r * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
      // 崩纹两三道：**短**茬（长了会读成挂在墙上的电线），走上半圈——
      // 弹孔崩皮朝外上方翻，不往下淌
      ctx.strokeStyle = "rgba(70,55,36,0.42)";
      ctx.lineWidth = 0.8;
      for (let c = 0; c < 2; c += 1) {
        const a = Math.PI * (1.05 + Hash(id + "bhc" + i + c) * 0.9);   // 只在上半圈
        ctx.beginPath();
        ctx.moveTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r * 0.85);
        ctx.lineTo(sx + Math.cos(a) * r * 1.8, sy + Math.sin(a) * r * 1.5);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  // 三张告示：两张旧的发黄卷边，一张新的还白着。竖排墨字用短竖线示意
  const posters = [
    { px: x - w / 2 * 0.5, py: groundY - 62, pw: 22, ph: 30, c: "#a89268", torn: true },
    { px: x + 2, py: groundY - 70, pw: 24, ph: 34, c: "#b09a72", torn: false },
    { px: x + w / 2 * 0.42, py: groundY - 56, pw: 20, ph: 28, c: "#c2b189", torn: false },
  ];
  for (let i = 0; i < posters.length; i += 1) {
    const p = posters[i];
    const pts = p.torn
      ? [[p.px - p.pw / 2, p.py], [p.px + p.pw / 2, p.py + 2], [p.px + p.pw / 2 - 3, p.py + p.ph],
        [p.px + 2, p.py + p.ph - 6], [p.px - p.pw / 2 + 2, p.py + p.ph - 2]]
      : [[p.px - p.pw / 2, p.py], [p.px + p.pw / 2, p.py + 1], [p.px + p.pw / 2 - 1, p.py + p.ph],
        [p.px - p.pw / 2 + 1, p.py + p.ph - 1]];
    InkFill(ctx, pts, id + "pp" + i, p.c, { amp: 0.8, lw: 1.4, line: IN.inkSoft });
    // 竖排"字"：几列短杠
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = "#3a2f22";
    ctx.lineWidth = 1.1;
    for (let c = 0; c < 3; c += 1) {
      const cx = p.px - p.pw / 2 + 5 + c * 6;
      for (let r = 0; r < 5; r += 1) {
        const ry = p.py + 5 + r * 5;
        if (Hash(id + i + c + "r" + r) > 0.25) {
          ctx.beginPath(); ctx.moveTo(cx, ry); ctx.lineTo(cx + 3.4, ry); ctx.stroke();
        }
      }
    }
    ctx.restore();
  }
  // 最新那张是征夫告示：标题四个字真的写出来（设计文档：玩家先在实景里
  // 看见那四个大字和暗红印章，才谈得上想不想停下看）。
  // **繁体**「徵夫告示」：1942 年的公文只可能是繁体，而且「征召」的征写作徵
  //（简化字方案是 1956 年的事）。竖排在纸右沿——那时候没有横排左起。
  {
    const p = posters[1];
    ctx.save();
    ctx.fillStyle = "rgba(43, 31, 22, 0.88)";
    ctx.font = "600 7px 'Noto Serif SC', serif";
    ctx.textAlign = "center";
    const tx = p.px + p.pw / 2 - 5.5;
    for (let k = 0; k < 4; k += 1) ctx.fillText("徵夫告示"[k], tx, p.py + 9.5 + k * 7.2);
    ctx.fillStyle = "rgba(146, 44, 32, 0.55)";
    ctx.fillRect(p.px - p.pw / 2 + 3.5, p.py + p.ph - 8.5, 5, 5);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// 征夫告示：阅读层的那张纸（2026-08-15 用户定：「界面里只有一张纸，程序化的
// 在纸上写上文字内容」）
//
// 老版是「左边一张外部生成图 + 右边现代排版的转录」：两样东西说同一件事，
// 玩家的眼睛在图与字之间来回跳；那张图还得走 Script_TypesetNotice.py 排版 +
// Script_TextureKey.py 抠白底两道流水线，改一个字要重跑一遍。现在整张纸——
// 连同纸上的字——都在这儿画。
//
// 三条规矩：
// ① **1942 年的汉字**（全作铁律）：繁体、竖排、自右向左。简化字方案是 1956
//    年的事，横排左起是 1955-56 年以后才成为规范的；「征召」的征那时写作**徵**。
//    **标题也走竖排**——四个字横着码、按那时候的规矩自右向左，今天的人扫一眼
//    读成「示告夫徵」，看着像 bug；竖排没有这个歧义，而且跟墙上那张小告示同款。
// ② **画的顺序＝事情发生的顺序**（画笔三条通用毛病之一）：先有纸，纸上有折痕
//    （揣在怀里带过来的），再有印上去的字，最后才是盖上去的朱印、贴了一年落下的
//    黄斑水渍和四角的糨糊痕。倒过来画就成了「一张做旧贴图上摆了几个字」。
// ③ **这是 DOM canvas，不是 CanvasTexture**：不会被提亮两档，照原色画（同包袱条）。
//    别照世界贴图那套压两档的色号抄——那样在这儿会黑得像烧过。
// ---------------------------------------------------------------------------
// 麻纸/毛边纸：村里贴的从来不是白纸。底偏土黄、纤维粗、透光不匀
const NOTICE_PAPER = {
  base: "#cbb88d", lit: "#dccca4", shade: "#a08a62", edge: "#8a7550",
  ink: "#241c14", inkPale: "#4b3d2c", seal: "#a02e25",
};

// 一条手裁/手撕的边：**两头收住**（角还得是角），中段才跑得开。
// bite 是被啃掉的那一口——贴了一年的告示总有一块被风撕走，那口比毛边大一个量级。
// 正的偏移一律朝纸里去（四条边各自的法线都朝内），所以 bite.depth 给正数就是缺角。
function NoticeEdge(ax, ay, bx, by, id, amp, n, bite = null) {
  const pts = [];
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    let o = Sym(id, i, amp) * Math.sin(Math.PI * t) ** 0.55;
    if (bite && t > bite.a && t < bite.b) {
      const u = (t - bite.a) / (bite.b - bite.a);
      o += Math.sin(Math.PI * u) ** 0.7 * bite.depth;
    }
    pts.push([ax + dx * t + nx * o, ay + dy * t + ny * o]);
  }
  return pts;
}

function NoticeSheetPath(ctx, x0, y0, x1, y1, id) {
  const w = x1 - x0, h = y1 - y0;
  const pts = [
    // 上沿是裁的（齐），下沿是撕的（毛），左下角被啃掉一口
    ...NoticeEdge(x0, y0, x1, y0, id + "t", h * 0.004, 10),
    ...NoticeEdge(x1, y0, x1, y1, id + "r", w * 0.006, 12).slice(1),
    ...NoticeEdge(x1, y1, x0, y1, id + "b", h * 0.010, 16, { a: 0.66, b: 0.92, depth: h * 0.035 }).slice(1),
    ...NoticeEdge(x0, y1, x0, y0, id + "l", w * 0.005, 12).slice(1, -1),
  ];
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  return pts;
}

// 竖排右起的断列：避头点——、。，；等标点不许落在一列的头上，
// 挤回上一列末尾（标点悬挂）。不管这条，读起来就是句子被切断了
const NOTICE_NO_HEAD = "、。，；：！？」』）";
function NoticeColumns(text, perCol) {
  const cols = [];
  let i = 0;
  while (i < text.length) {
    let n = Math.min(perCol, text.length - i);
    while (i + n < text.length && NOTICE_NO_HEAD.includes(text[i + n])) n += 1;
    cols.push(text.slice(i, i + n));
    i += n;
  }
  return cols;
}

// 一个字：位置与大小各带一点抖（铅字是一个一个摆上去的，不会分毫不差），
// 底下垫一层更淡更大的同一个字＝墨在纸上洇开的那一圈
function NoticeChar(ctx, ch, cx, cy, size, id, i, { color = NOTICE_PAPER.ink, weight = 500, alpha = 1 } = {}) {
  // 竖排里的句读点住在字格的**右上角**，不在正中
  const punct = NOTICE_NO_HEAD.includes(ch) || ch === "。" || ch === "、";
  const px = punct ? cx + size * 0.26 : cx;
  const py = punct ? cy - size * 0.26 : cy;
  const jx = Sym(id + "cx", i, size * 0.035);
  const jy = Sym(id + "cy", i, size * 0.03);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.globalAlpha = alpha * 0.16;
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size * 1.07}px 'Noto Serif SC', serif`;
  ctx.fillText(ch, px + jx, py + jy);
  ctx.globalAlpha = alpha * (0.86 + Rnd(id + "ca", i) * 0.14);
  ctx.font = `${weight} ${size}px 'Noto Serif SC', serif`;
  ctx.fillText(ch, px + jx, py + jy);
  ctx.restore();
}

function NoticeColumn(ctx, text, cx, yTop, size, step, id, opts) {
  for (let k = 0; k < text.length; k += 1) {
    NoticeChar(ctx, text[k], cx, yTop + step * (k + 0.5), size, id, k, opts);
  }
}

/**
 * 把整张告示画进 W×H 的画框（DOM canvas，1:1 逻辑像素）。
 * notice 就是 Core 的 ZHENGFU_NOTICE：{ title, lines, date, signs }。
 */
export function DrawNoticeSheet(ctx, W, H, notice, id = "zhengfu") {
  const m = Math.min(W, H) * 0.028;          // 留给撕口与落影
  const x0 = m, y0 = m, x1 = W - m, y1 = H - m;
  const w = x1 - x0, h = y1 - y0;

  // —— 1. 落影：贴着纸的真实轮廓（不是一个方框），左上角翘起来所以影子不匀
  ctx.save();
  ctx.translate(w * 0.008, h * 0.006);
  NoticeSheetPath(ctx, x0, y0, x1, y1, id);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.filter = `blur(${Math.max(2, w * 0.012)}px)`;
  ctx.fill();
  ctx.restore();

  // —— 2. 纸本体
  ctx.save();
  NoticeSheetPath(ctx, x0, y0, x1, y1, id);
  ctx.save();
  ctx.clip();
  const g = ctx.createLinearGradient(x0, y0, x1 * 0.6, y1);
  g.addColorStop(0, NOTICE_PAPER.lit);
  g.addColorStop(0.55, NOTICE_PAPER.base);
  g.addColorStop(1, NOTICE_PAPER.shade);
  ctx.fillStyle = g;
  ctx.fillRect(x0 - m, y0 - m, W + m, H + m);

  // 帘纹：手工纸抄出来时竹帘留下的一道道竖痕，很淡，但没有它纸就是一块色板
  ctx.strokeStyle = "rgba(122,102,70,0.055)";
  ctx.lineWidth = Math.max(0.6, w * 0.0016);
  for (let sx = x0; sx < x1; sx += w / 78) {
    ctx.beginPath();
    ctx.moveTo(sx + Sym(id + "lay", sx, 0.8), y0);
    ctx.lineTo(sx + Sym(id + "lay2", sx, 0.8), y1);
    ctx.stroke();
  }
  // 纤维：短的、斜的、深浅两色
  for (let i = 0; i < 130; i += 1) {
    const fx = x0 + Rnd(id + "fx", i) * w;
    const fy = y0 + Rnd(id + "fy", i) * h;
    const a = Rnd(id + "fa", i) * Math.PI;
    const l = w * (0.004 + Rnd(id + "fl", i) * 0.012);
    ctx.strokeStyle = Rnd(id + "fc", i) > 0.5 ? "rgba(96,78,52,0.13)" : "rgba(240,231,206,0.20)";
    ctx.lineWidth = Math.max(0.5, w * 0.0012);
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx + Math.cos(a) * l, fy + Math.sin(a) * l);
    ctx.stroke();
  }
  ctx.restore();

  // —— 3. 折痕：这张纸是折成三折带过来的，两道竖折一道横折。
  // 折痕＝一条亮边贴着一条暗边（纸的两个坡面各朝一边），单画一条线读成"划痕"
  //
  // **裁之前必须把纸的轮廓重新走一遍**：canvas 的「当前路径」不进 save/restore，
  // 上一段末尾那句 beginPath 画的是一根纤维，直接 clip() 就是裁在那根线上——
  // 折痕与后面整层做旧因此一笔都没落到纸上（第一版实拍看着"纸很干净"，
  // 真相是它们被裁没了，不是画淡了）。
  ctx.save();
  NoticeSheetPath(ctx, x0, y0, x1, y1, id);
  ctx.clip();
  const folds = [
    { v: true, at: 0.34 }, { v: true, at: 0.68 }, { v: false, at: 0.52 },
  ];
  for (let i = 0; i < folds.length; i += 1) {
    const f = folds[i];
    const p0 = f.v ? [x0 + w * f.at, y0] : [x0, y0 + h * f.at];
    const p1 = f.v ? [x0 + w * f.at, y1] : [x1, y0 + h * f.at];
    const off = Math.max(1, w * 0.004);
    for (const [dx, dy, col] of [[0, 0, "rgba(126,104,68,0.26)"], [f.v ? off : 0, f.v ? 0 : off, "rgba(250,243,222,0.30)"]]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(0.9, w * 0.0022);
      ctx.beginPath();
      const n = 14;
      for (let k = 0; k <= n; k += 1) {
        const t = k / n;
        const px = p0[0] + (p1[0] - p0[0]) * t + dx + Sym(id + "fd" + i, k, w * 0.0018);
        const py = p0[1] + (p1[1] - p0[1]) * t + dy + Sym(id + "fe" + i, k, w * 0.0018);
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }
  ctx.restore();

  // —— 4. 字：竖排、自右向左。版心四周留天头地脚（天头比地脚宽，竖排的规矩）
  const padX = w * 0.055;
  const padT = h * 0.075, padB = h * 0.055;
  const bx0 = x0 + padX, bx1 = x1 - padX;
  const by0 = y0 + padT, colH = h - padT - padB;

  // 字号由版面反推：先按最大字号排一遍，装不下就收一档再排，直到塞进版心。
  // （反过来"按列数算字号"会让一句长条文把整章的字压成蚂蚁）
  // **从一个铁定装不下的大字号往下收**，收到刚好塞进版心为止——取的是
  // "装得下的最大一档"，于是不管纸是什么形状，字总能给多大给多大、版心也总被
  // 填满。起点给小了（第一版 0.040，头一轮就通过）等于没搜：字号成了拍脑袋
  // 定的那个数，纸一宽左半张就空着，横屏手机上更是缩成 6px 的蚂蚁。
  let size = Math.min(h * 0.075, w * 0.115);
  let plan = null;
  for (let guard = 0; guard < 140; guard += 1) {
    const step = size * 1.05;                       // 列内字距
    const perCol = Math.max(4, Math.floor(colH / step));
    const bodyCols = notice.lines.flatMap((l) => NoticeColumns(l, perCol));
    const colStep = size * 1.62;                    // 列距（比字距宽，列才分得开）
    const titleSize = size * 2.0;
    const titleW = titleSize * 1.35;
    const gap = colStep * 0.55;
    const tailCols = notice.signs.length + 1;       // 落款：本区公所 / 保公所 / 日期
    const need = titleW + gap + bodyCols.length * colStep + gap + tailCols * colStep;
    if (need <= bx1 - bx0 || size <= h * 0.012) {
      plan = { size, step, perCol, bodyCols, colStep, titleSize, titleW, gap };
      break;
    }
    size *= 0.972;
  }

  // 右起：标题占最右一列，往左依次是条文，最左边是落款
  let cx = bx1;
  {
    const t = notice.title.replace(/\s/g, "");
    const tStep = plan.titleSize * 1.16;
    NoticeColumn(ctx, t, cx - plan.titleW / 2, by0, plan.titleSize, tStep, id + "ttl",
      { weight: 700, color: NOTICE_PAPER.ink });
    cx -= plan.titleW + plan.gap;
  }
  for (let i = 0; i < plan.bodyCols.length; i += 1) {
    NoticeColumn(ctx, plan.bodyCols[i], cx - plan.colStep / 2, by0, plan.size, plan.step, id + "b" + i,
      { weight: 500, color: NOTICE_PAPER.ink });
    cx -= plan.colStep;
  }
  // 落款**沉到纸底**（公文的规矩：正文从天头顶格往下写，署名与日期落在地脚）。
  // 第一版让它从三成高处起，于是三列字浮在半张纸的当中，下面空着一大片——
  // 那不是"留白"，是"没写完"。逐列按各自的字数往上量，底边对齐
  cx -= plan.gap;
  // 署名收在八成高处，**底下那一段纸是留给印的**：印整个骑在黑字上，红压黑
  // 糊成一团谁也读不出（上一版就是），得让它大半落在干净纸面上，只拿上沿
  // 咬住署名末尾那一个字——真盖章也是这么盖的
  const tailBase = by0 + colH * 0.82;
  let sealAt = null;
  for (let i = 0; i < notice.signs.length; i += 1) {
    const sx = cx - plan.colStep / 2;
    const top = tailBase - plan.step * notice.signs[i].length;
    NoticeColumn(ctx, notice.signs[i], sx, top, plan.size, plan.step, id + "sg" + i,
      { weight: 600, color: NOTICE_PAPER.ink });
    // 印骑在**两个署名中间**盖下去，压着它们末尾那两三个字——公章本来就是
    // 骑着落款盖的，挪到旁边空地上反而假（那成了"画在纸上的一枚章"）。
    // 但它不许再往左吃到日期那一列上去：「三月初十」被红章糊住，玩家就不知道
    // 什么时候要去村东口点名了——**盖章是气氛，日期是信息，信息优先**
    if (i === notice.signs.length - 1) {
      // 上沿**刚咬住**署名最后一个字就够了：再往上骑，红章压在黑字上两下都读不出
      sealAt = { x: sx + plan.colStep * 0.5, y: tailBase + plan.colStep * 1.05 };
    }
    cx -= plan.colStep;
  }
  // 日期比署名再低一档（公文的落款就是这么错开的，齐平反而像表格）
  NoticeColumn(ctx, notice.date, cx - plan.colStep / 2,
    by0 + colH * 0.94 - plan.step * notice.date.length,
    plan.size, plan.step, id + "dt", { weight: 500, color: NOTICE_PAPER.inkPale });

  // —— 5. 朱印：盖在落款底下，压着笔画（先有字后有印，顺序不能反）。
  // 六个字排两列三行，右列在前——印章本来就是竖排右起的
  if (sealAt) {
    // 印要压得住那一列字才算盖上去了：小于两个列宽就成了纸上一粒红点。
    // 上限也在这儿——2.9 个列宽会横跨三列，连日期一起糊掉（上一版就是）
    const s = plan.colStep * 2.3;
    ctx.save();
    ctx.translate(sealAt.x, Math.min(sealAt.y, y1 - padX - s * 0.5));
    ctx.rotate(-0.045);
    ctx.globalAlpha = 0.86;
    // 边框：四条边各自断一两处（印泥不匀，边总有缺）
    ctx.strokeStyle = NOTICE_PAPER.seal;
    ctx.lineWidth = s * 0.075;
    ctx.lineCap = "round";
    const hs = s / 2;
    const corners = [[-hs, -hs], [hs, -hs], [hs, hs], [-hs, hs]];
    for (let i = 0; i < 4; i += 1) {
      const a = corners[i], b = corners[(i + 1) % 4];
      const cut0 = 0.04 + Rnd(id + "sc" + i, 0) * 0.12;
      const cut1 = 0.86 + Rnd(id + "sc" + i, 1) * 0.10;
      ctx.beginPath();
      ctx.moveTo(a[0] + (b[0] - a[0]) * cut0, a[1] + (b[1] - a[1]) * cut0);
      ctx.lineTo(a[0] + (b[0] - a[0]) * cut1, a[1] + (b[1] - a[1]) * cut1);
      ctx.stroke();
    }
    // 「梁家村保公所之印」八个字排两列四行——印章本来就是竖排右起，
    // 而八个字正好排满一个方印（六个字排 2×3 会剩半格，看着像刻废了）
    const sealText = `${notice.signs[notice.signs.length - 1]}之印`;
    const rows = Math.ceil(sealText.length / 2);
    const cs = s * 0.78 / rows;
    for (let i = 0; i < sealText.length; i += 1) {
      const col = Math.floor(i / rows), row = i % rows;
      NoticeChar(ctx, sealText[i], (0.5 - col) * s * 0.40, (row - (rows - 1) / 2) * cs * 1.08,
        cs, id + "sl", i, { color: NOTICE_PAPER.seal, weight: 700, alpha: 1 });
    }
    // 印泥不匀：拿纸色啃掉几小块（**不是** destination-out——那会连纸一起穿孔）
    for (let i = 0; i < 16; i += 1) {
      ctx.globalAlpha = 0.12 + Rnd(id + "sm", i) * 0.3;
      ctx.fillStyle = NOTICE_PAPER.base;
      const mx = Sym(id + "smx", i, hs * 0.98), my = Sym(id + "smy", i, hs * 0.98);
      const r = s * (0.012 + Rnd(id + "smr", i) * 0.05);
      ctx.beginPath();
      ctx.ellipse(mx, my, r, r * 0.8, Rnd(id + "sma", i) * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // —— 6. 这几年落在纸上的东西：黄斑、霉点、雨水淌痕、四角糨糊印、边缘发暗。
  // 全压在字之上——它们是后来才有的。同第 3 段：**裁之前重走一遍轮廓**
  //（这会儿的当前路径是印章上最后一粒墨斑）
  ctx.save();
  NoticeSheetPath(ctx, x0, y0, x1, y1, id);
  ctx.clip();
  // 黄斑要读得出是"纸放了三年"，不是"泼了碗茶"：一团 0.26 的褐色压在落款上，
  // 「本區公所」当场糊成一片（实拍第五版）。**做旧的上限由字定**——
  // 同「盖章是气氛、日期是信息」那条，纸脏到看不清字就是本末倒置
  for (let i = 0; i < 9; i += 1) {
    const fx = x0 + Rnd(id + "sx", i) * w;
    const fy = y0 + Rnd(id + "sy", i) * h;
    const r = w * (0.05 + Rnd(id + "sr", i) * 0.10);
    const rg = ctx.createRadialGradient(fx, fy, 0, fx, fy, r);
    rg.addColorStop(0, "rgba(118,86,44,0.13)");
    rg.addColorStop(0.7, "rgba(118,86,44,0.06)");
    rg.addColorStop(1, "rgba(118,86,44,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(fx - r, fy - r, r * 2, r * 2);
  }
  // 霉点：几粒硬的深斑（一片片晕开的黄斑没有"点"，纸就还是干净的）
  for (let i = 0; i < 26; i += 1) {
    const mx = x0 + Rnd(id + "mx", i) * w;
    const my = y0 + Rnd(id + "my", i) * h;
    ctx.globalAlpha = 0.10 + Rnd(id + "ma", i) * 0.22;
    ctx.fillStyle = "#6d5228";
    ctx.beginPath();
    ctx.ellipse(mx, my, w * (0.002 + Rnd(id + "mr", i) * 0.006),
      w * (0.002 + Rnd(id + "mr2", i) * 0.005), Rnd(id + "mo", i) * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // 雨水从上沿淌下来的两道：上头宽下头收窄，边上有一圈更深的水线
  // 雨水淌痕：细、长、上宽下尖。给宽了给浓了就不是水淌过，是一道烟熏
  for (let i = 0; i < 2; i += 1) {
    const sx = x0 + w * (0.22 + Rnd(id + "rn", i) * 0.55);
    const len = h * (0.3 + Rnd(id + "rl", i) * 0.4);
    const lg = ctx.createLinearGradient(0, y0, 0, y0 + len);
    lg.addColorStop(0, "rgba(116,88,48,0.10)");
    lg.addColorStop(1, "rgba(116,88,48,0)");
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(sx - w * 0.018, y0);
    ctx.lineTo(sx + w * 0.015, y0);
    ctx.lineTo(sx + w * 0.004, y0 + len);
    ctx.lineTo(sx - w * 0.006, y0 + len);
    ctx.closePath();
    ctx.fill();
  }
  // 糨糊印：贴上墙时四角抹的那几刷，从背面透出来，比纸暗一点点
  for (let i = 0; i < 4; i += 1) {
    const gx = i % 2 === 0 ? x0 + w * 0.12 : x1 - w * 0.12;
    const gy = i < 2 ? y0 + h * 0.07 : y1 - h * 0.07;
    const r = w * 0.12;
    const rg = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
    rg.addColorStop(0, "rgba(104,84,56,0.15)");
    rg.addColorStop(1, "rgba(104,84,56,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
  }
  ctx.restore();

  // 边缘发暗：日晒雨淋先从边上来。**一条描边不够**——那只是给纸镶了道框；
  // 要的是从纸沿往里一档档化开，所以沿同一条轮廓由粗到细叠几遍（剪在纸里，
  // 粗的那几遍只有内侧半边留得下）
  ctx.save();
  NoticeSheetPath(ctx, x0, y0, x1, y1, id);
  ctx.clip();
  for (let i = 0; i < 5; i += 1) {
    ctx.strokeStyle = `rgba(112,86,50,${0.12 + i * 0.035})`;
    ctx.lineWidth = Math.max(1.2, w * (0.055 - i * 0.011));
    NoticeSheetPath(ctx, x0, y0, x1, y1, id);
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();

  // 排出来的字号交出去：**"字有多大"是这张纸唯一有明确对错的数**
  // （好不好看得自己看图）。横屏手机上排成 6px 那一版，测试全绿、图上没人能读——
  // RenderHealthTest 拿它逐档画高卡下限
  return { size: plan.size, columns: plan.bodyCols.length, sheetW: w, sheetH: h };
}

// 空猪圈。猪圈墙是农家最糙的墙——**土坯干垒不抹泥**，顶边一块坯一个高低差；
// 内侧离地半尺一条被猪蹭出来的光带，猪没了这道痕还在。
export function DrawPigpen(ctx, x, groundY, id) {
  const seg = (x0, x1, H) => {
    const pts = [];
    for (let sx = x0; sx <= x1; sx += 9) {
      pts.push([sx, groundY - H + Sym(id + "pt" + x0, sx, 4)]);
    }
    InkFill(ctx, pts.concat([[x1, groundY], [x0, groundY]]), id + "s" + x0, "#8f7a5c",
      { amp: 2.0, lw: 2.0, shade: "rgba(70,52,36,0.22)" });
    // 干垒的坯：一块块看得见，缝里没有泥
    for (let r = 1; r * 7 < H; r += 1) {
      InkLine(ctx, x0 + 1, groundY - r * 7, x1 - 1, groundY - r * 7 + Sym(id + "ln" + x0, r, 1.4),
        id + "c" + x0 + r, { lw: 1.1, color: "rgba(84,64,44,0.42)", amp: 1.2 });
    }
  };
  seg(x - 30, x - 6, 30);
  seg(x + 4, x + 30, 26);
  // 内侧被猪蹭出来的光带（最该有的一笔）
  ctx.save();
  ctx.globalAlpha = 0.9;
  InkFill(ctx, Rect(x - 29, groundY - 22, 22, 7), id + "rub", "#5c4c36", { amp: 1.2, lw: 0, line: null });
  ctx.globalAlpha = 0.20;
  ctx.fillStyle = "rgba(220,200,170,1)";
  ctx.fillRect(x - 29, groundY - 21, 22, 2.4);
  ctx.restore();
  // 圈里地面比院子低半头
  InkFill(ctx, [[x - 28, groundY], [x - 20, groundY - 4], [x + 20, groundY - 4], [x + 28, groundY]],
    id + "floor", "#5e5140", { amp: 1.4, lw: 1.4 });
  // 食槽：干净见底、缝里长草
  InkFill(ctx, [[x - 4, groundY - 3], [x + 14, groundY - 4], [x + 13, groundY - 11], [x - 3, groundY - 10]],
    id + "trough", "#6b6252", { amp: 1.2, lw: 1.6 });
  InkLine(ctx, x + 4, groundY - 10, x + 5, groundY - 16, id + "tg", { lw: 1, color: "#6b7040", amp: 1.0 });
  // 墙根外侧沤着的粪土，插着几根麦秸
  InkFill(ctx, [[x + 30, groundY], [x + 34, groundY - 7], [x + 44, groundY - 8], [x + 48, groundY]],
    id + "dung", "#6b5f46", { amp: 1.8, lw: 1.4, shade: "rgba(0,0,0,0.2)" });
  for (let i = 0; i < 3; i += 1) {
    InkLine(ctx, x + 36 + i * 4, groundY - 7, x + 37 + i * 4 + Sym(id + "dk", i, 3), groundY - 14 - Rnd(id + "dk2", i) * 5,
      id + "dstalk" + i, { lw: 1, color: "#8a7a4e", amp: 1.0 });
  }
}

// 窖壁上的藏口：挖出来的浅坑 + 一块靠着的覆土板。
// closed=把板合上（从外面看只是一块颜色略深的土）；grain=坑里塞着种子粮袋
export function DrawNook(ctx, x, groundY, id, { grain = false, closed = false } = {}) {
  if (closed) {
    // 合上的板抹了泥：一块比周围略深、边缘还算齐整的土色——搜家的兵没看出来
    InkFill(ctx, [[x - 20, groundY - 8], [x - 18, groundY - 56], [x + 18, groundY - 58], [x + 20, groundY - 6]],
      id + "shut", "#4e3f2c", { amp: 1.8, lw: 1.6, line: "rgba(30,22,14,0.5)" });
    Speckle(ctx, x - 18, groundY - 54, 36, 46, id + "shutSp", { count: 12, alpha: 0.18, size: 1.8 });
    return;
  }
  // 敞着的坑：一圈掏挖的土沿，里面黑
  InkFill(ctx, [[x - 19, groundY - 4], [x - 22, groundY - 30], [x - 14, groundY - 54], [x + 12, groundY - 56],
    [x + 20, groundY - 34], [x + 17, groundY - 4]],
    id + "hole", "#241a10", { amp: 2.2, lw: 2.4, line: "rgba(30,22,14,0.7)" });
  if (grain) {
    // 塞进去的种子粮袋：口扎着，鼓鼓一小袋
    InkFill(ctx, [[x - 12, groundY - 8], [x - 14, groundY - 30], [x - 4, groundY - 40], [x + 8, groundY - 36],
      [x + 12, groundY - 10]], id + "bag", "#9a8560", { amp: 1.4, lw: 1.8, shade: "rgba(0,0,0,0.24)" });
    InkLine(ctx, x - 5, groundY - 40, x + 2, groundY - 43, id + "tie", { lw: 1.6, color: "#5c4530" });
  }
  // 靠在坑边的覆土板
  ctx.save();
  ctx.translate(x + 24, groundY);
  ctx.rotate(-0.24);
  InkFill(ctx, Rect(-8, -46, 16, 46), id + "lid", "#5e4c34", { amp: 1.2, lw: 1.8, shade: "rgba(0,0,0,0.2)" });
  ctx.restore();
}

// 驴车：能推、能跟着走的那片影子。车板 + 两个大轮 + 半车干草
export function DrawCart(ctx, x, groundY, id) {
  // 车板
  InkFill(ctx, Rect(x - 44, groundY - 34, 88, 10), id + "bed", "#4e4234",
    { amp: 1, lw: 2.2, shade: "rgba(0,0,0,0.2)" });
  // 车辕
  InkLine(ctx, x + 42, groundY - 30, x + 74, groundY - 22, id + "shaft1", { lw: 3, color: "#6b4d2e" });
  // 干草
  InkFill(ctx, [[x - 40, groundY - 34], [x - 30, groundY - 58], [x - 6, groundY - 66], [x + 22, groundY - 60],
    [x + 36, groundY - 40], [x + 40, groundY - 34]],
    id + "hay", "#b89a58", { amp: 2.2, lw: 2, shade: "rgba(0,0,0,0.16)" });
  for (let i = 0; i < 6; i += 1) {
    InkLine(ctx, x - 30 + i * 12, groundY - 40 - Hash(id + i) * 16,
      x - 36 + i * 12, groundY - 30 - Hash(id + "b" + i) * 6, id + "straw" + i,
      { lw: 1.2, color: "rgba(120,95,45,0.75)" });
  }
  // 车轮
  for (const wx of [x - 22, x + 22]) {
    ctx.strokeStyle = IN.ink;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(wx, groundY - 13, 13, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1.4;
    for (let s = 0; s < 4; s += 1) {
      ctx.beginPath();
      ctx.moveTo(wx - Math.cos(s * 0.78) * 11, groundY - 13 - Math.sin(s * 0.78) * 11);
      ctx.lineTo(wx + Math.cos(s * 0.78) * 11, groundY - 13 + Math.sin(s * 0.78) * 11);
      ctx.stroke();
    }
  }
}

// 自行车（伪军的"洋车子"）：侧视朝 -x（车头在左）。骑手是独立演员骑在上面
//（pose rideBike + lift），这里只画车。轮子不做旋转——辐条画密一点、
// 加一圈挡泥板，滚动感靠车速与蹬踏动画撑
export function DrawBicycle(ctx, x, groundY, id) {
  const r = 15, y = groundY - r;              // 轮半径 ~0.31m
  const fx = x - 25, bx = x + 25;             // 前/后轮心
  const Wheel = (wx) => {
    ctx.strokeStyle = IN.ink;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(wx, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(40,40,40,0.7)";
    for (let s = 0; s < 6; s += 1) {
      ctx.beginPath();
      ctx.moveTo(wx - Math.cos(s * 0.52) * (r - 2), y - Math.sin(s * 0.52) * (r - 2));
      ctx.lineTo(wx + Math.cos(s * 0.52) * (r - 2), y + Math.sin(s * 0.52) * (r - 2));
      ctx.stroke();
    }
    ctx.strokeStyle = IN.ink;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(wx, y, 2.4, 0, Math.PI * 2); ctx.stroke();
  };
  Wheel(fx); Wheel(bx);
  // 挡泥板
  ctx.strokeStyle = "#39424a";
  ctx.lineWidth = 3.4;
  ctx.beginPath(); ctx.arc(fx, y, r + 2.6, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  ctx.beginPath(); ctx.arc(bx, y, r + 2.6, Math.PI * 1.2, Math.PI * 1.95); ctx.stroke();
  // 车架（大梁三角 + 后叉）：黑漆钢管
  const seatX = x + 9, seatY = y - 22;        // 座管顶
  const headX = x - 19, headY = y - 21;       // 车把立管顶
  const crankX = x + 2, crankY = y - 2;       // 中轴
  for (const [x1, y1, x2, y2] of [
    [headX, headY, fx, y],                    // 前叉
    [headX, headY, crankX, crankY],           // 下管
    [headX, headY - 1, seatX, seatY + 3],     // 上管（大梁）
    [seatX, seatY, crankX, crankY],           // 座管
    [seatX, seatY + 2, bx, y],                // 后上叉
    [crankX, crankY, bx, y],                  // 后下叉
  ]) {
    InkLine(ctx, x1, y1, x2, y2, id + "f" + x1 + y2, { lw: 2.8, color: "#232a30", amp: 0.4 });
  }
  // 车把（往骑行方向探出一截再回勾）与座
  InkLine(ctx, headX, headY, headX - 6, headY - 7, id + "stem", { lw: 2.6, color: "#232a30", amp: 0.3 });
  InkLine(ctx, headX - 6, headY - 7, headX - 12, headY - 4, id + "bar", { lw: 3, color: "#1c2126", amp: 0.3 });
  InkFill(ctx, [[seatX - 6, seatY - 3], [seatX + 6, seatY - 3], [seatX + 4, seatY], [seatX - 4, seatY]],
    id + "saddle", "#3a2e22", { lw: 1.6, amp: 0.4 });
  // 曲柄踏板（斜着定格）+ 后货架——伪军驮包袱的地方
  InkLine(ctx, crankX - 5, crankY + 5, crankX + 5, crankY - 5, id + "crank", { lw: 2.4, color: "#1c2126", amp: 0.3 });
  InkFill(ctx, Rect(bx - 12, y - r - 4, 22, 3.4), id + "rack", "#4a4038", { lw: 1.6, amp: 0.5 });
}

// 挎斗摩托（日军三轮挎斗车）：侧视朝 -x。挎斗画在近侧（压在车身前），
// 斗里的兵是独立演员（pose sitSide，pinTo 钉在车上）。军土黄涂装
export function DrawMotorcycle(ctx, x, groundY, id) {
  const r = 16, y = groundY - r;
  const fx = x - 38, bx = x + 30;
  const Wheel = (wx, wr) => {
    const wy = groundY - wr;                   // 轮心随半径落地
    ctx.fillStyle = "#2b2b28";
    ctx.beginPath(); ctx.arc(wx, wy, wr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = IN.ink;
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.fillStyle = "#8a7a4a";
    ctx.beginPath(); ctx.arc(wx, wy, wr * 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = IN.ink; ctx.lineWidth = 1.4; ctx.stroke();
  };
  Wheel(fx, r); Wheel(bx, r);
  // 前叉与车把
  InkLine(ctx, fx, y, fx + 8, y - 26, id + "fork", { lw: 3, color: "#5c5436", amp: 0.4 });
  InkLine(ctx, fx + 8, y - 26, fx + 2, y - 34, id + "bar", { lw: 3, color: "#2e2a1c", amp: 0.3 });
  // 车身：油箱 + 座 + 尾架，一条压低的流线——留出轮子，别糊成一坨
  InkFill(ctx, [
    [fx + 12, y - 18], [x - 10, y - 25], [x + 8, y - 24], [bx - 2, y - 17],
    [bx - 4, y - 9], [x, y - 11], [fx + 14, y - 10],
  ], id + "body", "#8a7a4a", { lw: 2.2, amp: 0.8, shade: "rgba(0,0,0,0.22)" });
  InkFill(ctx, [[x - 8, y - 29], [x + 9, y - 28], [x + 8, y - 24], [x - 9, y - 25]],
    id + "seat", "#3a3226", { lw: 1.8, amp: 0.5 });
  // 排气管：从发动机拖到后轮边
  InkLine(ctx, fx + 16, y - 6, bx - 6, y - 3, id + "pipe", { lw: 2.4, color: "#6e6248", amp: 0.5 });
  // —— 挎斗（近侧，整个压在车身之前）：船形斗偏后挂，小轮明显小一号，
  // 斗沿抬高——斗里的兵下半身要被它盖住才叫"坐在斗里"
  const sx = x + 6;                            // 斗中心（偏后）
  Wheel(sx + 3, r * 0.55);
  InkFill(ctx, [
    [sx - 22, y - 24], [sx + 16, y - 26], [sx + 22, y - 16], [sx + 18, y - 6],
    [sx - 16, y - 6], [sx - 24, y - 15],
  ], id + "tub", "#94824e", { lw: 2.4, amp: 0.9, shade: "rgba(0,0,0,0.18)" });
  // 斗沿高光与蒙皮接缝
  InkLine(ctx, sx - 22, y - 23, sx + 16, y - 25, id + "rim", { lw: 1.8, color: "rgba(240,225,180,0.5)", amp: 0.5 });
  InkLine(ctx, sx - 18, y - 15, sx + 16, y - 17, id + "seam", { lw: 1.2, color: "rgba(40,35,20,0.5)", amp: 0.4 });
}

// 独轮车：1942 冀中最标志性的农具——独轮居中，两根车把，木架车盘。
// planks: 0/1/2 —— 装了几根木料
// 独轮车的轮子：**单独一张**，画在原点上——车身与轮分开烘，渲染层才转得动它。
// 车推起来轮子不转是最容易被一眼看穿的假动作。
export const BARROW_WHEEL_R = 13;      // 轮半径（像素/PPM=0.27m）
export const BARROW_WHEEL_Y = 13;      // 轮心离地
export const BARROW_GRIP = { x: 58, y: 34 };   // 车把末端（相对车轮中心的绘制坐标）
// **这张贴图画的是往左推的车**：轮子在前（左），两根车把伸向右手边推车的人。
// 独轮车是有正反的东西，往右推必须把整张翻过来（World 的 PlaceSpriteFlip），
// 不翻的话人在车尾、手却伸向车头，一眼看穿。
export const BARROW_ART_DIR = -1;
export function DrawCartWheel(ctx, x, y, r, id) {
  InkFill(ctx, [
    [x - r, y], [x - r * 0.7, y - r * 0.7], [x, y - r], [x + r * 0.7, y - r * 0.7],
    [x + r, y], [x + r * 0.7, y + r * 0.7], [x, y + r], [x - r * 0.7, y + r * 0.7],
  ], id + "rim", "#8a6a45", { amp: 0.7, lw: 2.6, shade: "rgba(0,0,0,0.18)" });
  // 辐条：转起来靠它才看得出在转
  ctx.strokeStyle = IN.ink;
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 5; i += 1) {
    const a = i * (Math.PI / 5);
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(a) * (r - 2), y - Math.sin(a) * (r - 2));
    ctx.lineTo(x + Math.cos(a) * (r - 2), y + Math.sin(a) * (r - 2));
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(x, y, r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = "#6b4d2e";
  ctx.fill();
  ctx.strokeStyle = IN.ink;
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

// 独轮车的车身（不含轮子）。整车约 1.6m 长——上一版画了两米多，加上它挂在
// 近相机的深度带上被透视又放大四成，车比人还大一圈，车把根本伸不到人手里。
// 姿态是**推着走的姿态**：车把抬到 0.7m 上下，正是柱子两手够得着的高度。
export function DrawBarrow(ctx, x, groundY, id, { planks = 0, pole = false } = {}) {
  const g = BARROW_GRIP;
  // 车斗：轮子上方的浅斗
  InkFill(ctx, [
    [x - 26, groundY - 26], [x + 14, groundY - 29], [x + 20, groundY - 24], [x - 24, groundY - 20],
  ], id + "tray", "#8a6a45", { amp: 1.2, lw: 2.2, shade: "rgba(0,0,0,0.2)" });
  // 两根车辕：从轮轴斜着往上伸到车把
  InkLine(ctx, x - 20, groundY - 21, x + g.x, groundY - g.y, id + "shaftA",
    { lw: 2.4, color: "#7a5a38", amp: 0.7 });
  InkLine(ctx, x - 19, groundY - 24, x + g.x - 1, groundY - g.y + 3.5, id + "shaftB",
    { lw: 2.0, color: "#6b4d2e", amp: 0.7 });
  // 车把（末端两个握头，人的手就搭在这儿）
  InkFill(ctx, Rect(x + g.x - 4, groundY - g.y - 3, 9, 6), id + "grip", "#6b4d2e",
    { amp: 0.7, lw: 1.8 });
  // 支腿：停下来时撑住车斗
  InkLine(ctx, x - 22, groundY - 20, x - 20, groundY - 2, id + "legA", { lw: 2.6, color: "#6b4d2e" });
  // 装上的木料：两块旧门板平摞在斗上
  for (let i = 0; i < planks; i += 1) {
    InkFill(ctx, Rect(x - 26, groundY - 34 - i * 7, 46, 7), id + "plank" + i, "#c09a62",
      { amp: 1.1, lw: 1.8, shade: "rgba(0,0,0,0.18)" });
  }
  // 枣木杠：一根圆杠，比门板长得多，两头探出车斗压在门板上。
  // 枣木深红发褐，跟门板的浅木色分得开——不然「装上第三件」画面上等于没变化
  // 杠身压在门板摞的最上面一层上（板摞顶＝groundY-27-planks*7），不留缝
  const poleY = groundY - 27 - planks * 7 - 5;
  if (pole) {
    InkFill(ctx, [
      [x - 40, poleY + 1], [x - 38, poleY - 4], [x + 32, poleY - 5],
      [x + 35, poleY], [x + 32, poleY + 4], [x - 38, poleY + 5],
    ], id + "pole", "#6b4028", { amp: 0.9, lw: 2.0, shade: "rgba(0,0,0,0.26)" });
    // 顺杠一道窄高光，读得出是圆的、不是又一块板
    InkLine(ctx, x - 30, poleY - 2.6, x + 26, poleY - 3.2, id + "poleLit",
      { lw: 1.0, color: "rgba(214,186,140,0.42)", amp: 0.3 });
    // 两道捆绳：只在杠压住板的地方各绕一小截
    for (const lx of [x - 18, x + 12]) {
      InkLine(ctx, lx, poleY - 5.5, lx + 1.5, poleY + 6.5, id + "lash" + lx,
        { lw: 1.5, color: "#7a6440", amp: 0.35 });
    }
  }
}

// 蹲在木料上的母鸡：土黄的团身、小红冠——嗜头担当
// k：整体缩放（绕锚点）。原始坐标画出来的鸡有 0.8m 长——跟条狗似的；
// 0.55 收到不到半米，才是院子里啄食的芦花鸡
export function DrawHen(ctx, x, y, id, k = 0.55) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.translate(-x, -y);
  InkFill(ctx, [
    [x - 12, y], [x - 13, y - 8], [x - 6, y - 13], [x + 5, y - 13], [x + 12, y - 7], [x + 15, y - 2], [x + 10, y + 1],
  ], id + "body", "#b89058", { amp: 1.2, lw: 2, shade: "rgba(0,0,0,0.16)" });
  // 尾羽翘起
  InkFill(ctx, [[x - 12, y - 7], [x - 20, y - 15], [x - 14, y - 4]], id + "tail", "#8d6a3c", { amp: 1, lw: 1.8 });
  // 头与冠
  ctx.beginPath(); ctx.arc(x + 12, y - 12, 4.4, 0, Math.PI * 2);
  ctx.fillStyle = "#b89058"; ctx.fill();
  ctx.strokeStyle = IN.ink; ctx.lineWidth = 1.6; ctx.stroke();
  InkFill(ctx, [[x + 10, y - 16], [x + 12, y - 20], [x + 14, y - 16]], id + "comb", "#b0432e", { amp: 0.6, lw: 1.2 });
  // 喙
  InkFill(ctx, [[x + 16, y - 12], [x + 20, y - 11], [x + 16, y - 9]], id + "beak", "#d8a83c", { amp: 0.5, lw: 1.1 });
  ctx.restore();
}

// 倒塌的柴垛：可翻越（肩高、顶沿有缺口）——扫荡中撞翻的那一堆
// 撞塌的柴垛：**摊开的一堆劈柴，不是一个麻袋**。
// 老版画的是一整块 1.08m 高的多边形色块，比 sprite 画布还高、顶上被裁平，
// 读起来就是「路当中戳着一口麻袋」（用户原话：这什么鬼）。现在改成
// 一根根横七竖八的柴：塌下来只有 0.72m＝柱子的胯高（34px），跨得过去。
// 轮廓语法仍在：中间略高、右边塌下去豁一个口、顶沿被踩得发亮。
export function DrawFallenWood(ctx, x, groundY, id) {
  const H = 34;                       // 0.72m × 48px/m —— 与 vaults[].top 对齐
  const W = 77;                       // 1.6m 宽，与 vault 的 w 对齐
  // 一根柴：中间粗两头略收的短棒，带一条木纹
  const Log = (cx, cy, len, ang, dark) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    InkFill(ctx, [
      [-len / 2, -3.2], [len / 2, -2.6], [len / 2 + 2, 0], [len / 2, 2.6],
      [-len / 2, 3.2], [-len / 2 - 2, 0],
    ], id + "lg" + cx + cy, dark ? "#7a5a38" : "#946f42", { amp: 0.7, lw: 1.8 });
    InkLine(ctx, -len / 2 + 3, -0.6, len / 2 - 3, 0.4, id + "gr" + cx + cy,
      { lw: 0.9, color: "rgba(60,42,24,0.5)", amp: 0.4 });
    ctx.restore();
  };
  // ① 塌到最外圈的几根：贴地、散得最开（左右各探出去一点）
  for (let i = 0; i < 5; i += 1) {
    const t = i / 4;
    Log(x - W / 2 - 4 + t * (W + 8), groundY - 3.5 + Sym(id + "o" + i, 0, 1.6),
      20 + Hash(id + "ow" + i) * 12, Sym(id + "oa" + i, 1, 0.16), i % 2 === 0);
  }
  // ② 中间那一摞：还叠着，但已经垮成一道缓坡——左高右塌，右肩就是缺口
  const rows = 4;
  for (let r = 0; r < rows; r += 1) {
    const y = groundY - 7 - r * (H - 10) / rows;
    // 越往上越窄，且整体向右下垮（塌的方向）
    const spanL = x - W / 2 + 6 + r * 4;
    const spanR = x + W / 2 - 10 - r * 11;
    const n = Math.max(2, Math.round((spanR - spanL) / 17));
    for (let i = 0; i < n; i += 1) {
      const px = spanL + (n === 1 ? 0 : i * (spanR - spanL) / (n - 1));
      Log(px, y + Sym(id + "m" + r + i, 0, 1.2), 16 + Hash(id + "mw" + r + i) * 8,
        Sym(id + "ma" + r + i, 1, 0.13), (r + i) % 2 === 0);
    }
  }
  // ③ 顶沿磨亮：天天有人手撑着翻过去的那条线（只在左半边——右边是豁口）
  InkLine(ctx, x - W / 2 + 8, groundY - H + 2, x + 2, groundY - H + 6, id + "worn",
    { lw: 2.4, color: "rgba(240,225,180,0.8)", amp: 0.9 });
  // ④ 两根从堆里斜戳出来的柴梢：矮堆也要有轮廓的"刺"，一眼认出是柴不是土
  for (let i = 0; i < 2; i += 1) {
    const bx = x - 12 + i * 22;
    InkLine(ctx, bx, groundY - 12 - i * 4, bx - 9 + i * 18, groundY - H - 3 - Hash(id + "t" + i) * 5,
      id + "tip" + i, { lw: 2.2, color: "#5c4328", amp: 0.8 });
  }
}

// 翻越缺口标记：画在可翻越物顶沿上的一小段磨亮痕（统一轮廓语法的记号）
export function DrawVaultNotch(ctx, x, topY, id) {
  InkLine(ctx, x - 9, topY + 1, x + 9, topY - 1, id + "worn", { lw: 3, color: "rgba(240,225,180,0.8)", amp: 1.2 });
  InkFill(ctx, [[x - 4, topY - 1], [x + 1, topY - 5], [x + 5, topY - 1]], id + "chip", "rgba(240,225,180,0.55)", { lw: 0, line: null });
}

// 一只麻雀：v 形的翅、团起的身——供惊飞的炸窝动画用（phase 0..1 扑翅）
export function DrawSparrow(ctx, x, y, id, phase = 0) {
  const flap = Math.sin(phase * Math.PI * 2) * 6;
  InkFill(ctx, [[x - 5, y], [x - 2, y - 4], [x + 4, y - 3], [x + 6, y + 1], [x, y + 3]],
    id + "body", "#8d6a4a", { amp: 0.8, lw: 1.6 });
  ctx.beginPath(); ctx.arc(x + 6, y - 3, 2.4, 0, Math.PI * 2);
  ctx.fillStyle = "#8d6a4a"; ctx.fill();
  ctx.strokeStyle = IN.ink; ctx.lineWidth = 1.2; ctx.stroke();
  InkLine(ctx, x - 1, y - 3, x - 7, y - 8 - flap, id + "wingB", { lw: 2, color: "#5c4328", amp: 0.6 });
  InkLine(ctx, x + 1, y - 3, x + 7, y - 9 + flap, id + "wingF", { lw: 2, color: "#5c4328", amp: 0.6 });
}

// 一只田鼠：贴着地皮蹿——身子一条、尾巴一条
export function DrawMouse(ctx, x, y, id) {
  InkFill(ctx, [[x - 6, y], [x - 3, y - 4], [x + 4, y - 4], [x + 7, y - 1], [x + 4, y + 1], [x - 4, y + 1]],
    id + "body", "#7a6a52", { amp: 0.7, lw: 1.5 });
  InkLine(ctx, x - 6, y - 1, x - 13, y + 1, id + "tail", { lw: 1.2, color: "#5c4a38", amp: 1.4 });
  ctx.beginPath(); ctx.arc(x + 6, y - 3, 1.4, 0, Math.PI * 2);
  ctx.fillStyle = "#5c4a38"; ctx.fill();
}

// ---------------------------------------------------------------------------
// 引导图形气泡（无文字引导三层配方之一）：NPC/物件头顶的「我缺什么」。
// 全部图标共用同一套手绘语汇——纸面底、墨线框、图形不写字。
// icon: plank 木料 | rope 断绳 | q 疑问 | stone 石子
// ---------------------------------------------------------------------------
/**
 * 头顶那枚**心情气泡**（2026-08-17 用户定：「妹妹在害怕有很多种表达啊，你可以在
 * 她头上加个 hud+icon 显示一下，就像勇敢的心的那种，像对话框一样的状态显示」）。
 *
 * 这枚气泡是**自家人表情的唯一去处**：那颗头只有 55px 半径，五官挤进去必糊，
 * 而且糊出来是一整章不变的死表情（所以脸整个不画了，见 DrawHeadPart ④）。
 * 一个 icon 能演十种情绪，还能跟着剧情换——这才是"有很多种表达"。
 *
 * 画法照漫画气泡：圆角的一块纸、左下角一条指向人的小尾巴、里头一张最简的脸
 *（两只眼＋一张嘴），外加一个记号（汗珠 / 呵气 / 泪 / Z）。
 * 纸色比画面亮一档但不刺眼；墨线跟全场同一支笔。
 */
export const MOOD_KINDS = ["afraid", "cold", "hungry", "hurt", "sleepy", "sad", "calm"];

export function DrawMoodBubble(ctx, x, y, mood, id) {
  const w = 40, h = 34;                 // 气泡本身（画布另留出尾巴与记号的地方）
  const top = y - h - 7;
  // 纸：圆角一块，左下探出一条尾巴指着头顶
  InkFill(ctx, [
    [x - w / 2, top + 5], [x - w / 2 + 5, top], [x + w / 2 - 5, top], [x + w / 2, top + 5],
    [x + w / 2, top + h - 5], [x + w / 2 - 5, top + h], [x - 2, top + h],
    [x - 7, y - 1], [x - 9, top + h], [x - w / 2 + 5, top + h], [x - w / 2, top + h - 5],
  ], id + "paper", "rgba(242,231,201,0.96)", { amp: 0.9, lw: 2.4 });
  const cx = x, cy = top + h * 0.47;
  const ink = IN.ink;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const line = (x0, y0, x1, y1, lwPx = 2.2, col = ink) => {
    ctx.strokeStyle = col; ctx.lineWidth = lwPx;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  };
  const dot = (dx, rr = 2.6) => {
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.ellipse(cx + dx, cy - 3.4, rr, rr * 1.15, 0, 0, Math.PI * 2); ctx.fill();
  };
  const arc = (x0, y0, rr, a0, a1, lwPx = 2.2) => {
    ctx.strokeStyle = ink; ctx.lineWidth = lwPx;
    ctx.beginPath(); ctx.arc(x0, y0, rr, a0, a1); ctx.stroke();
  };
  switch (mood) {
    case "afraid":
      // 睁大的两只眼＋张着的小嘴＋一颗汗珠：一眼就是"怕"
      dot(-5.4, 3.1); dot(5.4, 3.1);
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 5.2, 3.0, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(120,160,186,0.9)";
      ctx.beginPath();
      ctx.moveTo(cx + 12, cy - 9);
      ctx.quadraticCurveTo(cx + 15.5, cy - 4.5, cx + 12, cy - 2.6);
      ctx.quadraticCurveTo(cx + 8.6, cy - 4.6, cx + 12, cy - 9);
      ctx.fill();
      break;
    case "cold":
      // 挤紧的两只眼（><）＋抖的嘴＋两道呵气
      line(cx - 8.4, cy - 6, cx - 3.4, cy - 3.2); line(cx - 8.4, cy - 0.6, cx - 3.4, cy - 3.2);
      line(cx + 8.4, cy - 6, cx + 3.4, cy - 3.2); line(cx + 8.4, cy - 0.6, cx + 3.4, cy - 3.2);
      ctx.strokeStyle = ink; ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy + 5.6);
      ctx.quadraticCurveTo(cx - 2, cy + 3.4, cx, cy + 5.6);
      ctx.quadraticCurveTo(cx + 2, cy + 7.8, cx + 5, cy + 5.6);
      ctx.stroke();
      arc(cx + 12, cy + 2, 4.2, -1.9, 0.5, 1.6);
      arc(cx + 14, cy + 7, 3.0, -1.9, 0.5, 1.4);
      break;
    case "hungry":
      // 半闭的眼＋一条平嘴＋一只空碗
      line(cx - 8, cy - 3.6, cx - 3, cy - 3.6); line(cx + 3, cy - 3.6, cx + 8, cy - 3.6);
      line(cx - 3.4, cy + 5, cx + 3.4, cy + 5, 2.0);
      ctx.strokeStyle = "#8a6a45"; ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(cx + 8.4, cy + 7.6);
      ctx.quadraticCurveTo(cx + 12.6, cy + 12.6, cx + 16.8, cy + 7.6);
      ctx.stroke();
      break;
    case "hurt":
      // 挤成一条缝的眼＋咬住的牙
      line(cx - 8.4, cy - 4.6, cx - 3.2, cy - 2.6); line(cx + 8.4, cy - 4.6, cx + 3.2, cy - 2.6);
      InkFill(ctx, [[cx - 4.6, cy + 3], [cx + 4.6, cy + 3], [cx + 4.6, cy + 7], [cx - 4.6, cy + 7]],
        id + "teeth", "rgba(250,244,226,0.95)", { amp: 0.4, lw: 1.6 });
      line(cx - 1.4, cy + 3, cx - 1.4, cy + 7, 1.2); line(cx + 1.8, cy + 3, cx + 1.8, cy + 7, 1.2);
      break;
    case "sleepy":
      // 闭上的眼＋一个 Z
      arc(cx - 5.6, cy - 5.4, 3.4, 0.25, 2.9, 2.0);
      arc(cx + 5.6, cy - 5.4, 3.4, 0.25, 2.9, 2.0);
      line(cx - 2.6, cy + 5.4, cx + 2.6, cy + 5.4, 1.8);
      line(cx + 8.6, cy - 8.6, cx + 14.4, cy - 8.6, 2.0);
      line(cx + 14.4, cy - 8.6, cx + 8.6, cy - 2.8, 2.0);
      line(cx + 8.6, cy - 2.8, cx + 14.4, cy - 2.8, 2.0);
      break;
    case "sad":
      // 垂下的眼＋往下弯的嘴＋一颗泪
      arc(cx - 5.4, cy - 1.6, 3.4, 3.5, 6.1, 2.0);
      arc(cx + 5.4, cy - 1.6, 3.4, 3.5, 6.1, 2.0);
      ctx.strokeStyle = ink; ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy + 6.6);
      ctx.quadraticCurveTo(cx, cy + 3.4, cx + 4, cy + 6.6);
      ctx.stroke();
      ctx.fillStyle = "rgba(120,160,186,0.92)";
      ctx.beginPath();
      ctx.moveTo(cx - 7.6, cy + 1);
      ctx.quadraticCurveTo(cx - 4.6, cy + 5.6, cx - 7.6, cy + 7.4);
      ctx.quadraticCurveTo(cx - 10.6, cy + 5.6, cx - 7.6, cy + 1);
      ctx.fill();
      break;
    default:            // calm：闭着眼、嘴角略松——"这会儿没事了"
      arc(cx - 5.4, cy - 5.4, 3.4, 0.25, 2.9, 2.0);
      arc(cx + 5.4, cy - 5.4, 3.4, 0.25, 2.9, 2.0);
      ctx.strokeStyle = ink; ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(cx - 3.6, cy + 4.4);
      ctx.quadraticCurveTo(cx, cy + 7.2, cx + 3.6, cy + 4.4);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

export function DrawIconBubble(ctx, x, y, icon, id) {
  // 气泡：圆角方带一个小尾巴
  const w = 34, h = 28;
  InkFill(ctx, [
    [x - w / 2, y - h], [x + w / 2, y - h], [x + w / 2, y - h + h * 0.82],
    [x + 6, y - h + h * 0.82], [x, y], [x - 4, y - h + h * 0.82], [x - w / 2, y - h + h * 0.82],
  ], id + "bub", "rgba(238,226,192,0.94)", { amp: 1.2, lw: 2.2 });
  const cx = x, cy = y - h * 0.58;
  switch (icon) {
    case "plank":
      InkFill(ctx, Rect(cx - 11, cy - 5, 22, 4.4), id + "pA", "#c09a62", { amp: 0.6, lw: 1.6 });
      InkFill(ctx, Rect(cx - 11, cy + 1, 22, 4.4), id + "pB", "#a8794a", { amp: 0.6, lw: 1.6 });
      break;
    case "rope": {
      // 断成两截的绳：中间断口的毛茬
      ctx.strokeStyle = "#8a6a45";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - 11, cy - 4);
      ctx.quadraticCurveTo(cx - 4, cy + 2, cx - 2, cy - 1);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + 3, cy + 1);
      ctx.quadraticCurveTo(cx + 6, cy + 4, cx + 11, cy + 5);
      ctx.stroke();
      for (const [fx, fy, a] of [[cx - 2, cy - 1, -0.5], [cx + 3, cy + 1, 2.4]]) {
        for (let i = 0; i < 3; i += 1) {
          InkLine(ctx, fx, fy, fx + Math.cos(a + i * 0.5) * 4.4, fy + Math.sin(a + i * 0.5) * 4.4,
            id + "fray" + fx + i, { lw: 1.1, color: "#8a6a45" });
        }
      }
      break;
    }
    case "q":
      // 手绘的问号：一段弧 + 短颈 + 点
      ctx.strokeStyle = IN.ink;
      ctx.lineWidth = 2.8;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(cx, cy - 3.4, 5.2, Math.PI * 0.95, Math.PI * 2.22);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + 1.6, cy + 0.6);
      ctx.lineTo(cx + 0.4, cy + 4.2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy + 8.4, 1.6, 0, Math.PI * 2);
      ctx.fillStyle = IN.ink;
      ctx.fill();
      break;
    case "stone":
      // 一颗石子 + 三道短促的动线（能扔出去的意思）
      InkFill(ctx, [[cx - 5, cy + 3], [cx - 6, cy - 2], [cx - 1, cy - 5], [cx + 4, cy - 3], [cx + 5, cy + 2], [cx, cy + 5]],
        id + "st", "#9a8a70", { amp: 0.8, lw: 1.8 });
      for (let i = 0; i < 3; i += 1) {
        InkLine(ctx, cx + 7, cy - 4 + i * 3.4, cx + 12, cy - 6 + i * 3.4, id + "fly" + i,
          { lw: 1.4, color: "rgba(43,31,22,0.6)" });
      }
      break;
    default:
      break;
  }
}

export function DrawSky(ctx, w, h, light, id) {
  if (light === "night" || light === "dark" || light === "tunnel") {
    ctx.save();
    for (let i = 0; i < Math.round(w / 34); i += 1) {
      const sx = Hash(id + "sx" + i) * w;
      const sy = Hash(id + "sy" + i) * h * 0.72;
      const r = 0.6 + Hash(id + "sr" + i) * 1.5;
      ctx.globalAlpha = 0.25 + Hash(id + "sa" + i) * 0.5;
      ctx.fillStyle = "#e8ecf6";
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // 一弯月
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "#e6e2cf";
    ctx.beginPath();
    ctx.arc(w * 0.74, h * 0.2, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(w * 0.755, h * 0.185, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  // 水彩云：几团横向拉长的淡色
  ctx.save();
  for (let i = 0; i < Math.round(w / 220); i += 1) {
    const cx = Hash(id + "cx" + i) * w;
    const cy = h * (0.16 + Hash(id + "cy" + i) * 0.42);
    const cw = 120 + Hash(id + "cw" + i) * 220;
    ctx.globalAlpha = 0.16 + Hash(id + "ca" + i) * 0.16;
    ctx.fillStyle = light === "dawn" ? "#f2dcc0" : "#f6f2e6";
    for (let k = 0; k < 4; k += 1) {
      ctx.beginPath();
      ctx.ellipse(cx + (k - 1.5) * cw * 0.28, cy + Sym(id + "ck" + i, k, 10),
        cw * (0.34 - k * 0.03), 15 + Hash(id + "ch" + i + k) * 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 地下剖面
// ---------------------------------------------------------------------------
// 洞腔轮廓：给定一段 x，返回顶沿与底沿的起伏（掏出来的洞不是方槽）
export function CavityProfile(x, id, baseTop, baseBot, amp = 1) {
  const n1 = Math.sin(x * 0.055 + Hash(id) * 9) * 0.5 + Math.sin(x * 0.021 + 2.1) * 0.5;
  const n2 = Math.sin(x * 0.13 + Hash(id + "b") * 7) * 0.32;
  const n3 = Math.sin(x * 0.008 + 1.3) * 0.7;
  return {
    top: baseTop + (n1 * 16 + n2 * 9 + n3 * 22) * amp,
    bot: baseBot + (Math.sin(x * 0.04 + Hash(id + "c") * 5) * 7 + Math.sin(x * 0.11) * 4) * amp,
  };
}

export function DrawEarthStrata(ctx, x0, x1, surfaceY, bottomY, id) {
  const h = bottomY - surfaceY;
  const bands = PAL.soil.length;
  for (let i = 0; i < bands; i += 1) {
    const y0 = surfaceY + (h * i) / bands;
    const y1 = surfaceY + (h * (i + 1)) / bands;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    const step = 60;
    for (let px = x0; px <= x1; px += step) {
      ctx.lineTo(px, y0 + Sym(id + "b" + i, Math.round(px / step), 7));
    }
    ctx.lineTo(x1, y0);          // 收平右缘，避免斜切成阶梯
    ctx.lineTo(x1, y1 + 3);
    ctx.lineTo(x0, y1 + 3);
    ctx.closePath();
    ctx.fillStyle = PAL.soil[i];
    ctx.fill();
  }
  // 石子与根须
  Speckle(ctx, x0, surfaceY, x1 - x0, h, id + "st", { count: Math.round((x1 - x0) / 26), alpha: 0.2, size: 2.6, color: "#4a3826" });
  ctx.save();
  ctx.globalAlpha = 0.32;
  ctx.strokeStyle = "#4a3520";
  ctx.lineWidth = 1.3;
  for (let i = 0; i < Math.round((x1 - x0) / 90); i += 1) {
    const rx = x0 + Rnd(id + "root", i) * (x1 - x0);
    let ry = surfaceY + 4;
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    for (let s = 0; s < 4; s += 1) {
      ry += 12 + Rnd(id + "root" + i, s) * 10;
      ctx.lineTo(rx + Sym(id + "root" + i, s + 20, 12), ry);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// 掏出地道空腔（在土层之上绘制）
export function DrawTunnelBore(ctx, x0, x1, topY, botY, id) {
  ctx.beginPath();
  ctx.moveTo(x0, botY);
  const step = 42;
  for (let px = x0; px <= x1; px += step) {
    ctx.lineTo(px, topY + Sym(id + "t", Math.round(px / step), 4));
  }
  ctx.lineTo(x1, topY);
  for (let px = x1; px >= x0; px -= step) {
    ctx.lineTo(px, botY + Sym(id + "b", Math.round(px / step), 3));
  }
  ctx.closePath();
  // 洞内不是纯黑：上暗下亮，做出"灯从地面反上来"的层次
  const bore = ctx.createLinearGradient(0, topY, 0, botY);
  bore.addColorStop(0, "#1c140d");
  bore.addColorStop(0.55, "#332417");
  bore.addColorStop(1, "#4a3520");
  ctx.fillStyle = bore;
  ctx.fill();
  ctx.strokeStyle = "#241a10";
  ctx.lineWidth = 2.6;
  ctx.stroke();
  // 洞壁的上沿高光（灯照到的部分）
  ctx.save();
  ctx.globalAlpha = 0.42;
  ctx.strokeStyle = PAL.tunnelWall;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x0, topY + 4);
  for (let px = x0; px <= x1; px += step) ctx.lineTo(px, topY + 4 + Sym(id + "t", Math.round(px / step), 4));
  ctx.stroke();
  ctx.restore();
  // 地面的踩踏痕
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = "#5c452c";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x0, botY - 3);
  for (let px = x0; px <= x1; px += step) ctx.lineTo(px, botY - 3 + Sym(id + "f", Math.round(px / step), 2));
  ctx.stroke();
  ctx.restore();
}

// 歪斜的支撑木：立柱带倾角、顶木斜搭、偶尔一根斜撑
export function DrawCrudeTimber(ctx, x, topY, botY, id, { scale = 1 } = {}) {
  const H = botY - topY;
  const lean = (Hash(id + "ln") - 0.5) * 0.34;
  const w = (9 + Hash(id + "w") * 6) * scale;
  const wood = ["#8a6a42", "#7a5c38", "#96764c"][Math.floor(Hash(id + "c") * 3)];
  const dark = "#4a3520";
  // 左柱
  ctx.save();
  ctx.translate(x - 24 * scale, botY);
  ctx.rotate(lean * 0.6);
  InkFill(ctx, Rect(-w / 2, -H, w, H), id + "L", wood,
    { amp: 1.6 * scale, lw: 2.4 * scale, shade: "rgba(0,0,0,0.26)" });
  for (let i = 0; i < 3; i += 1) {
    InkLine(ctx, -w * 0.2, -H * (0.2 + i * 0.26), -w * 0.15, -H * (0.34 + i * 0.26),
      id + "g" + i, { lw: 1 * scale, color: "rgba(60,40,22,0.5)", amp: 2 });
  }
  ctx.restore();
  // 右柱
  ctx.save();
  ctx.translate(x + 24 * scale, botY);
  ctx.rotate(-lean * 0.8);
  InkFill(ctx, Rect(-w / 2, -H * (0.86 + Hash(id + "h") * 0.2), w, H), id + "R", wood,
    { amp: 1.6 * scale, lw: 2.4 * scale, shade: "rgba(0,0,0,0.26)" });
  ctx.restore();
  // 顶木：斜搭上去
  ctx.save();
  ctx.translate(x, topY + 6 * scale);
  ctx.rotate((Hash(id + "t") - 0.5) * 0.2);
  InkFill(ctx, Rect(-34 * scale, -5 * scale, 68 * scale, 10 * scale), id + "T", wood,
    { amp: 1.4 * scale, lw: 2.4 * scale, shade: "rgba(0,0,0,0.22)" });
  ctx.restore();
  // 斜撑
  if (Hash(id + "br") > 0.45) {
    ctx.save();
    ctx.translate(x - 22 * scale, botY - H * 0.28);
    ctx.rotate(-0.72 + lean);
    InkFill(ctx, Rect(-4 * scale, -H * 0.5, 8 * scale, H * 0.52), id + "B", dark,
      { amp: 1.4 * scale, lw: 2 * scale });
    ctx.restore();
  }
}

// 玩家亲手支上去的那一处：一块旧门板横顶在松土段的洞顶上，底下两根短立柱
// 撑住，缝里塞了楔子。跟 DrawCrudeTimber（成气候的坑道支撑）分开画是因为
// 这是**第一条短通道**：料只有两块拆下来的旧门板，撑的是刚掏开、净高不到
// 一米的爬行段——柱子矮、板子带着门轴痕和钉眼，一眼看得出是从门上拆下来的。
export function DrawTunnelBrace(ctx, ax, ay, w, h, id) {
  // 配色比别的木件压两档：地道里本来就暗，而 CanvasTexture 这条管线还会把整张
  // 贴图整体提亮（见项目记忆里那条"画面发白"）——按平常的木色画，顶木会和
  // 土壁糊成一片，A/B 对比才看得出多了一根（第一版就是这么白瞎的）
  const wood = "#6d4c26";
  const post = "#59401f";
  // 顶板：整块门板横着顶上去，右端略低（人是一头一头顶上去的，顶不平）
  const tilt = (Hash(id + "tl") - 0.5) * 0.06;
  ctx.save();
  ctx.translate(ax, ay - h + 7);
  ctx.rotate(tilt);
  InkFill(ctx, Rect(-w / 2, -7, w, 13), id + "top", wood,
    { amp: 1.3, lw: 2.6, shade: "rgba(0,0,0,0.3)" });
  // 板底下压一道暗边：顶木的上沿正抵在洞顶那条墨线上，不给它一条自己的影子，
  // 两条线并在一起，"多了一根木头"就读不出来
  InkLine(ctx, -w / 2 + 2, 7, w / 2 - 2, 7, id + "sh", { lw: 3.2, color: "rgba(26,16,6,0.55)", amp: 1 });
  // 板面上一道亮茬（新刨过的那一面朝下），跟发暗的土壁拉开一档
  InkLine(ctx, -w / 2 + 5, -3.5, w / 2 - 5, -3.5, id + "hl", { lw: 2, color: "rgba(198,164,112,0.45)", amp: 1.2 });
  // 门板的出身：一道横撑的榫痕 + 两个钉眼
  InkLine(ctx, -w * 0.22, -3, -w * 0.22, 8, id + "ten", { lw: 1.5, color: "rgba(56,36,18,0.6)", amp: 1.2 });
  for (let i = 0; i < 2; i += 1) {
    ctx.beginPath();
    ctx.arc(-w * 0.3 + i * w * 0.52, 1.5, 1.8, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(44,28,14,0.7)";
    ctx.fill();
  }
  ctx.restore();
  // 两根短立柱：一根直一根歪（这活儿是跪在洞里干的，正不了）
  for (let i = 0; i < 2; i += 1) {
    const sx = ax + (i ? 1 : -1) * (w * 0.36);
    const lean = (i ? -1 : 1) * (0.05 + Hash(id + "ln" + i) * 0.07);
    ctx.save();
    ctx.translate(sx, ay);
    ctx.rotate(lean);
    InkFill(ctx, Rect(-6, -(h - 6), 12, h - 6), id + "p" + i, post,
      { amp: 1.2, lw: 2.6, shade: "rgba(0,0,0,0.34)" });
    ctx.restore();
    // 楔子：柱头和顶板之间打进去的那一小块（"顶实了"就在这一笔上）
    ctx.save();
    ctx.translate(sx, ay - h + 12);
    InkFill(ctx, [[-6, 0], [6, -2], [4, -6], [-5, -5]], id + "w" + i, "#a07c4d", { amp: 0.7, lw: 1.7 });
    ctx.restore();
  }
  // 板背后被压住的那片松土：撒下来的浮土堆在柱脚
  for (let i = 0; i < 5; i += 1) {
    const px = ax - w * 0.4 + Hash(id + "d" + i) * w * 0.8;
    ctx.beginPath();
    ctx.ellipse(px, ay - 1, 4 + Hash(id + "dr" + i) * 5, 2.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(74,52,30,0.5)";
    ctx.fill();
  }
}

export function DrawSupportBeam(ctx, x, topY, botY, id) {
  const H = botY - topY;
  InkFill(ctx, Rect(x - 22, topY, 7, H), id + "l", "#8a6a42", { amp: 0.9, lw: 2.1, shade: "rgba(0,0,0,0.22)" });
  InkFill(ctx, Rect(x + 15, topY, 7, H), id + "r", "#8a6a42", { amp: 0.9, lw: 2.1, shade: "rgba(0,0,0,0.22)" });
  InkFill(ctx, Rect(x - 26, topY - 2, 52, 8), id + "top", "#9a7749", { amp: 1, lw: 2.2, shade: "rgba(0,0,0,0.18)" });
  for (let i = 0; i < 2; i += 1) {
    InkLine(ctx, x - 20, topY + 14 + i * 26, x - 20, topY + 26 + i * 26, id + "g" + i,
      { lw: 0.9, color: "rgba(70,46,26,0.6)", amp: 1.4 });
  }
}

export function DrawChamberVault(ctx, x, w, topY, botY, id) {
  // 拱形洞室：比走廊更高
  ctx.beginPath();
  ctx.moveTo(x - w / 2, botY);
  ctx.lineTo(x - w / 2, topY + 16);
  ctx.quadraticCurveTo(x - w / 2, topY, x - w / 2 + 20, topY);
  ctx.lineTo(x + w / 2 - 20, topY);
  ctx.quadraticCurveTo(x + w / 2, topY, x + w / 2, topY + 16);
  ctx.lineTo(x + w / 2, botY);
  ctx.closePath();
  const vault = ctx.createLinearGradient(0, topY, 0, botY);
  vault.addColorStop(0, "#241a10");
  vault.addColorStop(0.6, "#3d2c1b");
  vault.addColorStop(1, "#543d24");
  ctx.fillStyle = vault;
  ctx.fill();
  ctx.strokeStyle = "#241a10";
  ctx.lineWidth = 2.6;
  ctx.stroke();
  ctx.save();
  ctx.globalAlpha = 0.38;
  ctx.strokeStyle = PAL.tunnelWall;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x - w / 2 + 4, topY + 18);
  ctx.quadraticCurveTo(x, topY + 5, x + w / 2 - 4, topY + 18);
  ctx.stroke();
  ctx.restore();
  // 洞室里的家什：草席、水瓮
  InkFill(ctx, Rect(x - w / 2 + 12, botY - 9, 40, 8), id + "mat", "#8a7a52", { amp: 1, lw: 1.9 });
  InkFill(ctx, [[x + w / 2 - 34, botY], [x + w / 2 - 34, botY - 20], [x + w / 2 - 18, botY - 22], [x + w / 2 - 16, botY]],
    id + "jar", "#6b5540", { amp: 1.2, lw: 2 });
}

/**
 * 窖口/竖井：**地面上那个洞** ＋ 一架从洞里伸上来的木梯。
 *
 * **这里不画"井筒"本身**：以前拿 PAL.tunnelAir 铺一根 34px 宽的浅色竖条当井筒，
 * 可掏在土里的洞是 1.7m 宽、梯子是 0.5m 宽——三个宽度不一样的矩形套在一起，
 * 看着就是贴图破了（用户原话：像 bug）。井筒的形状与内壁归 World 的
 * AddUnderground 管，这支笔只负责"这儿有个口子、人从这儿上下"。
 *
 * **梯子只露出一截的时候也得认得出是梯子**（2026-08-17 用户看序章掀盖那一镜退回：
 * 「特别是梯子那里 完全认不出是梯子」）。这是这支笔最难的一条：4.2 米长的梯子，
 * 地表机位只看得见地平线以上那两三拃——余下 95% 被地面挡着（实拍把梯子藏掉验过，
 * 底下确实是地面在挡，不是绘制序错）。老版露在外头的三样东西是：一根 1 米宽的
 * "井口木沿"横木 ＋ 两根 0.22m 的短竖杆 ＋ 一道缩在两杆之间的横档——**从俯角看
 * 就是一条长凳**（那一镜里它 570px/米、横着占掉半个画框，实拍量的）。
 *
 * 四条治法，缺一条就还是长凳：
 *  ① **那根横木整个删掉。** 一根横杆架在两条腿上，正是长凳的骨架；而窖口该有的
 *     记号本来就是"洞"和"盖板"，不是又一根横木。
 *  ② **两根梯梃各自高出地面一截，而且不一样高**（0.40／0.32 米，斧子砍的斜口）。
 *     一样高就又连成一条横线；差着一截才读成"两根杆子插在洞里"。
 *  ③ **横档两头探出梯梃。** 这是任何裁切下最强的"梯子"信号——缩在两梃之间是格子，
 *     探出去才是"穿过去别住的横档"。间距也不许匀（自家伐的树，谁量着凿）。
 *  ④ **给它一个洞。** 老版地表压根没有洞：地面是连着的，梯子直接从平地里长出来。
 *     洞口的黑与近侧翻上来的土坯一起画在这张贴图上（它排在 loose 带、压在地面
 *     之上），于是洞里还看得见两道横档——"梯子是往下去的"这件事才有得读。
 *
 * `floorY` 是**地平线**在画布上的行（不是贴图顶）：梯头高出地面多少、洞开在哪儿
 * 全按它算，所以摆位一改这支笔不用跟着改。`holds` 是 Data_Ladder.LadderHolds 算好的
 * 落点表（World 传进来，跟爬梯骨架用的是同一份）；不传就按 id 现算一份一样的。
 */
export function DrawShaft(ctx, x, floorY, botY, id, holds = null) {
  const PX = 48;                                   // 1 米 = 48 画布像素（道具贴图的标尺）
  const railDx = 12;                               // 两梃相距 0.5m
  // 梯头高出地面**一拃多，不是一臂**：给到 0.40m 那一版，顶上那截光杆比头一道
  // 横档还长，两根一起读成一对犄角。0.26/0.19 是"扶得着、又不抢戏"的那一档
  const proudL = 0.26 * PX, proudR = 0.19 * PX;    // 左高右低：一样高就又连成一条横线
  const railTop = floorY - proudL;

  // ---- ④ 洞 ----------------------------------------------------------------
  // 黑口子：上沿是洞的近侧土沿（略拱起），往下三四寸化进黑里。**画在最底下**，
  // 梯子压在它上头，洞里那两道横档才看得见。
  // 深度只给 0.24m：盖板合上时那块 0.20m 的板正好压住它，剩下的一线读成板底的影
  const mHalf = 0.58 * PX, mDeep = 0.30 * PX;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x - mHalf, floorY + 1.5);
  ctx.quadraticCurveTo(x, floorY - 3.4, x + mHalf, floorY + 1.5);
  ctx.lineTo(x + mHalf, floorY + mDeep);
  ctx.lineTo(x - mHalf, floorY + mDeep);
  ctx.closePath();
  const mouth = ctx.createLinearGradient(0, floorY - 3, 0, floorY + mDeep);
  mouth.addColorStop(0, "#191308");
  mouth.addColorStop(0.5, "#0c0905");
  mouth.addColorStop(1, "rgba(8,6,4,0)");
  ctx.fillStyle = mouth;
  ctx.fill();
  ctx.restore();
  // 洞沿那道墨线：只描上沿（下沿在黑里，描了就把洞封成一个方框）
  ctx.beginPath();
  ctx.moveTo(x - mHalf, floorY + 1.5);
  ctx.quadraticCurveTo(x, floorY - 3.4, x + mHalf, floorY + 1.5);
  ctx.strokeStyle = IN.ink;
  ctx.lineWidth = 2.0;
  ctx.lineCap = "round";
  ctx.stroke();
  // 洞沿翻上来的土：一疙瘩一疙瘩，**不许有长直边**。
  // 第一版在这儿砌了四块规规矩矩的土坯，两头各探出一条横杠——那正好又搭出
  // 长凳的两条扶手（同 ① 那笔账：这一带凡是横平的长条都会被读成家具）
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i += 1) {
      const r = 3.4 + Rnd(id + "cr" + side, i) * 2.6;
      const cx = x + side * (mHalf - 2 - i * (r * 1.5) - Rnd(id + "cx" + side, i) * 2);
      const cy = floorY - 0.6 - Rnd(id + "cy" + side, i) * 2.4;
      InkFill(ctx, Spline([
        [cx - r, cy + r * 0.55], [cx - r * 0.66, cy - r * 0.5],
        [cx + r * 0.5, cy - r * 0.62], [cx + r, cy + r * 0.5],
      ], 4), id + "clod" + side + i, i % 2 ? "#7d6540" : "#8b7149",
      { amp: 0.7, lw: 1.4, shade: "rgba(0,0,0,0.24)" });
    }
  }

  // ---- ②③ 梯子 -------------------------------------------------------------
  // 两根梯梃：自家伐的树杆，所以**有点弯、上细下粗**，不是两条画出来的直边
  for (const dx of [-railDx, railDx]) {
    const top = dx < 0 ? railTop : floorY - proudR;
    const wTop = 2.7, wBot = 3.2;                  // 半宽：梢细根粗（收细过头就成了两根针）
    const bow = (dx < 0 ? 1 : -1) * 1.5;           // 各自朝外弯一点点
    const mid = (top + botY) / 2;
    // **杆头要有一条顶边，不能只有两个角。** 前两版把左右两个上角直接连起来交给
    // 闭合样条，插值当场在那两点之间拱出一个尖——两根梯梃一起读成一对犄角。
    // 现在顶上多给两个点（略鼓的顶面），而且整条轮廓不走样条：杆子本来就该是
    // 直的，手感交给 InkFill 自己的抖
    InkFill(ctx, [
      [x + dx - wTop, top + 2.0], [x + dx - wBot + bow, mid], [x + dx - wBot, botY],
      [x + dx + wBot, botY], [x + dx + wBot + bow, mid], [x + dx + wTop, top + 2.0],
      [x + dx + wTop * 0.62, top], [x + dx - wTop * 0.62, top],
    ], id + "rail" + dx, "#9c7a4c", { amp: 0.55, lw: 1.8, shade: "rgba(0,0,0,0.22)" });
    // 锯断的断面：顶上一小片受光的白茬（压在轮廓里，别探出去）
    InkFill(ctx, [
      [x + dx - wTop * 0.6, top + 1.9], [x + dx - wTop * 0.42, top + 0.5],
      [x + dx + wTop * 0.42, top + 0.5], [x + dx + wTop * 0.6, top + 1.9],
    ], id + "cut" + dx, "#c4a678", { amp: 0.3, lw: 1.0 });
  }
  // 横档：**两头探出梯梃**，间距不匀。第一道就在地面上头一点（那是伸手扶的那道），
  // 往下一道道进洞里。
  // **档与档之间的空必须比档本身宽得多**——第一版档给到 4.6px 高、还各自描一圈
  // 墨线，一根根挤成实心的一条，读出来是根柱子不是梯子
  // **横档在哪儿不在这儿定**：Data_Ladder.LadderHolds 算一次，画笔照它画、爬梯的
  // 骨架照它把手脚放上去、Core 照它一档一响（2026-08-17 爬梯重做：三处各画各的
  // 梯子，手脚永远落不到横档上，人就像贴着梯子平移）。世界 y → 画布行：
  // 地平线在 floorY，1 米 = PX 行
  const rungs = (holds || LadderHolds(0, -(botY - floorY) / PX, id)).rungs.map((wy) => floorY - wy * PX);
  for (let i = 0; i < rungs.length; i += 1) {
    const y = rungs[i];
    const out = 3.4 + Rnd(id + "ro", i) * 1.6;     // 探出去多少，两头各不相同
    InkFill(ctx, Rect(x - railDx - out, y, (railDx + out) * 2, 3.2), id + "r" + i, "#c2a06a",
      { amp: 0.5, lw: 1.2, shade: "rgba(0,0,0,0.24)" });
    // 绑扎：隔几道缠一道麻绳（榫头松了就缠，农家梯子都这样）。
    // 两道斜线就够——缠成一个方块会在梃上鼓出一串疙瘩
    if (i % 4 === 2) {
      for (const dx of [-railDx, railDx]) {
        for (const k of [0, 1]) {
          InkLine(ctx, x + dx - 3.6, y - 0.8 + k * 2.4, x + dx + 3.6, y + 2.2 + k * 2.4,
            id + "lz" + i + dx + k, { lw: 1.2, color: "#5b4526", amp: 0.35 });
        }
      }
    }
  }
  // 梯脚踩在井底的两块垫石：没有它，梯子看着像浮在土上
  InkFill(ctx, Rect(x - 17, botY - 4, 34, 5), id + "foot", "#5c4830", { amp: 1.1, lw: 1.8 });
}

export function DrawCollapsePile(ctx, x, botY, scale, id) {
  const H = 52 * scale;
  InkFill(ctx, [
    [x - 34, botY], [x - 26, botY - H * 0.5], [x - 8, botY - H],
    [x + 12, botY - H * 0.86], [x + 30, botY - H * 0.34], [x + 36, botY],
  ], id, "#6b563c", { amp: 2.4, lw: 2.5, shade: "rgba(0,0,0,0.24)" });
  for (let i = 0; i < 8; i += 1) {
    const rx = x - 28 + Rnd(id, i) * 60;
    const ry = botY - Rnd(id, i + 20) * H * 0.8;
    const rs = 4 + Rnd(id, i + 40) * 6;
    InkFill(ctx, Rect(rx, ry, rs * 1.5, rs), id + "r" + i, i % 2 ? "#5a482f" : "#7a6242", { amp: 1.2, lw: 1.6 });
  }
  // 断掉的顶木
  InkLine(ctx, x - 20, botY - H * 0.7, x + 16, botY - H * 0.35, id + "beam", { lw: 5, color: "#6b4f30", amp: 2 });
}

// 翻口：地道在这一段挖成下沉的 U 形弯，弯底存着一汪水。
// 画法上要一眼读出"底下是凹的、里面有水"——所以是一条下凹的土沿
// 加一层带反光的水面，水面上再压一道暗，像被土压着。
// 民兵歇脚点的门板：卸下来的一扇旧门斜靠着，柱子用木匠画线的手把据点画在上面。
// pinned 是已经钉上去的情报条数——钉一条露一条，玩家看得见自己在往上凑。
export function DrawMapBoard(ctx, x, groundY, w, h, id, { pinned = 0 } = {}) {
  const lean = w * 0.06;
  InkFill(ctx, [[x - w / 2 + lean, groundY - h], [x + w / 2, groundY - h + lean * 0.5],
    [x + w / 2 - lean, groundY], [x - w / 2, groundY - lean * 0.4]],
    id + "board", "#8a6d47", { amp: 1.2, lw: 2.4, shade: "rgba(0,0,0,0.16)" });
  // 门板的横撑与门轴痕
  for (let i = 1; i <= 2; i += 1) {
    InkLine(ctx, x - w / 2 + lean, groundY - h * (i / 3), x + w / 2 - lean * 0.4, groundY - h * (i / 3) + lean * 0.4,
      id + "rail" + i, { lw: 1.6, color: "rgba(70,48,28,0.6)", amp: 1.1 });
  }
  // 画在门板上的据点草图：围墙一圈、岗楼两个点、牢房一小块
  ctx.save();
  ctx.globalAlpha = 0.62;
  ctx.strokeStyle = "#3b2c1c";
  ctx.lineWidth = 1.8;
  ctx.strokeRect(x - w * 0.28, groundY - h * 0.72, w * 0.56, h * 0.34);
  ctx.fillStyle = "#3b2c1c";
  for (const dx of [-0.28, 0.28]) {
    ctx.beginPath();
    ctx.arc(x + w * dx, groundY - h * 0.72, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillRect(x + w * 0.12, groundY - h * 0.52, w * 0.14, h * 0.12);
  ctx.restore();
  // 钉上去的纸条：一条条往上加
  for (let i = 0; i < pinned; i += 1) {
    const px = x - w * 0.34 + (i % 3) * w * 0.26;
    const py = groundY - h * 0.30 + Math.floor(i / 3) * h * 0.11;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate((Hash(id + "n" + i) - 0.5) * 0.3);
    InkFill(ctx, Rect(-w * 0.09, -h * 0.035, w * 0.18, h * 0.07), id + "note" + i, "#ded2b4",
      { amp: 0.5, lw: 1.2 });
    ctx.fillStyle = "rgba(70,58,40,0.55)";
    ctx.fillRect(-w * 0.06, -h * 0.012, w * 0.12, 1.4);
    ctx.fillRect(-w * 0.06, h * 0.006, w * 0.09, 1.4);
    ctx.restore();
  }
}

export function DrawWaterTrap(ctx, x, floorY, w, id) {
  const half = w / 2;
  const depth = w * 0.30;   // 是脚下一个下沉的弯，不是一口井
  // 下凹的土坑轮廓
  ctx.beginPath();
  ctx.moveTo(x - half, floorY);
  ctx.bezierCurveTo(x - half * 0.5, floorY + depth, x + half * 0.5, floorY + depth, x + half, floorY);
  ctx.lineTo(x + half, floorY + depth * 1.25);
  ctx.lineTo(x - half, floorY + depth * 1.25);
  ctx.closePath();
  ctx.fillStyle = "#2b2119";
  ctx.fill();
  ctx.strokeStyle = IN.ink;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(x - half, floorY);
  ctx.bezierCurveTo(x - half * 0.5, floorY + depth, x + half * 0.5, floorY + depth, x + half, floorY);
  ctx.stroke();
  // 水面：略高于弯底，带一点反光
  const wy = floorY + depth * 0.52;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x - half * 0.92, wy);
  ctx.bezierCurveTo(x - half * 0.45, wy + depth * 0.42, x + half * 0.45, wy + depth * 0.42, x + half * 0.92, wy);
  ctx.closePath();
  ctx.fillStyle = "rgba(88,104,98,0.78)";   // 存在土里的水是浑的，别蓝得跳出这套土色
  ctx.fill();
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 3; i += 1) {
    InkLine(ctx, x - half * 0.6 + i * half * 0.5, wy + 3 + i * 2,
      x - half * 0.2 + i * half * 0.5, wy + 3 + i * 2, id + "wl" + i,
      { lw: 1.3, color: "rgba(196,206,196,0.7)", amp: 0.8 });
  }
  ctx.restore();
}

export function DrawVentPipe(ctx, x, topY, botY, id) {
  InkFill(ctx, Rect(x - 9, topY, 18, botY - topY), id, "#4a3a28", { amp: 1.1, lw: 2.2 });
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = "#8a6a45";
  ctx.lineWidth = 2;
  for (let y = topY + 10; y < botY; y += 16) {
    ctx.beginPath();
    ctx.moveTo(x - 7, y);
    ctx.lineTo(x + 7, y);
    ctx.stroke();
  }
  ctx.restore();
}

export function DrawBell(ctx, x, y, id, { ringing = false } = {}) {
  InkLine(ctx, x, y - 22, x, y - 8, id + "wire", { lw: 1.4, color: "#7a6a4a" });
  InkFill(ctx, [[x - 8, y - 8], [x + 8, y - 8], [x + 6, y + 6], [x - 6, y + 6]], id, "#b8a15c",
    { amp: 0.9, lw: 2.1, shade: "rgba(0,0,0,0.2)" });
  if (ringing) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,210,120,0.7)";
    ctx.lineWidth = 1.8;
    for (let i = 1; i <= 2; i += 1) {
      ctx.beginPath();
      ctx.arc(x, y - 1, 12 + i * 7, -0.9, 0.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y - 1, 12 + i * 7, Math.PI - 0.9, Math.PI + 0.9);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export function DrawProbeRod(ctx, x, topY, len, id, { jab = 0 } = {}) {
  const y0 = topY + jab * 26;
  InkFill(ctx, Rect(x - 2.4, y0, 4.8, len), id, "#5c5346", { amp: 0.5, lw: 1.6 });
  // 尖头
  InkFill(ctx, [[x - 3.4, y0 + len], [x + 3.4, y0 + len], [x, y0 + len + 9]], id + "tip", "#3e372c", { amp: 0.4, lw: 1.5 });
  // 落土
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = "#6b5540";
  for (let i = 0; i < 5; i += 1) {
    ctx.beginPath();
    ctx.arc(x + Sym(id + "d", i, 9), y0 + len + 12 + Rnd(id + "d", i) * 26, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// 烟：翻滚的云团（从右往左推）
export function DrawSmoke(ctx, frontX, rightX, topY, botY, time, id) {
  const h = botY - topY;
  ctx.save();
  // 主体
  const grad = ctx.createLinearGradient(frontX, 0, rightX, 0);
  grad.addColorStop(0, "rgba(184,180,168,0.0)");
  grad.addColorStop(0.18, "rgba(184,180,168,0.62)");
  grad.addColorStop(1, "rgba(150,145,132,0.86)");
  ctx.fillStyle = grad;
  ctx.fillRect(frontX, topY, Math.max(0, rightX - frontX), h);
  // 前锋的翻滚
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = "#c2beb0";
  for (let i = 0; i < 7; i += 1) {
    const px = frontX + 6 + i * 15 + Math.sin(time * 0.9 + i) * 5;
    const py = topY + 12 + ((i * 37) % Math.max(1, h - 24)) + Math.sin(time * 1.4 + i * 2) * 6;
    const r = 11 + (i % 3) * 6;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// 灯光晕（叠加在暗场上）
export function DrawGlow(ctx, x, y, r, { core = "rgba(255,200,120,0.55)", edge = "rgba(255,180,90,0)" } = {}) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, core);
  g.addColorStop(1, edge);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

// 目标指示：手绘小箭头。
// dir=±1 是「指路模式」——目标出了画框，路标钉在画框边缘掉头指向框外：
// 箭头横过来、朝目标方向一探一探地怂，身后跟一枚淡一档的重影（»的读法）。
// climb="down"/"up" 再补一枚竖向小三角：目标在另一层，先到梯口再下去/上来。
export function DrawMarker(ctx, x, y, t, { dir = 0, climb = null } = {}) {
  if (!dir) {
    const bob = Math.sin(t * 3.4) * 5;
    ctx.save();
    ctx.translate(x, y + bob);
    InkFill(ctx, [[-9, -12], [9, -12], [0, 4]], "marker", "#f0c95c", { amp: 0.6, lw: 2.2 });
    ctx.restore();
    return;
  }
  const nudge = Math.sin(t * 3.4) * 4 * dir;
  ctx.save();
  ctx.translate(x + nudge, y - 6);
  InkFill(ctx, [[-7 * dir, -10], [-7 * dir, 10], [10 * dir, 0]], "markerDir", "#f0c95c", { amp: 0.6, lw: 2.2 });
  ctx.globalAlpha = 0.42;
  ctx.translate(-12 * dir, 0);
  InkFill(ctx, [[-5 * dir, -7], [-5 * dir, 7], [7 * dir, 0]], "markerDir2", "#f0c95c", { amp: 0.6, lw: 2 });
  ctx.restore();
  if (climb) {
    const s = climb === "down" ? 1 : -1;
    ctx.save();
    ctx.translate(x, y + 12);
    InkFill(ctx, [[-6, -5 * s], [6, -5 * s], [0, 5 * s]], "markerClimb", "#f0c95c", { amp: 0.5, lw: 1.8 });
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// 画框边缘的「下一件事」HUD（勇敢的心式）
//
// 一枚纸圆牌 ＋ 一支指向框外的箭头。牌面上画的**不是方向，是那件事本身**：
// 要找的人画那个人（衣色＋侧脸，本作认人本来就靠这两样），要捡的东西画那件
// 东西的小样，上手的活画手势。方向由箭头单独交代——一支箭头说不了两件事，
// "往哪走"和"去干嘛"得各说各的一句。
// 跨层的再挂一枚小牌：梯子＋上下箭头（意思是先到梯口，下去/上来）。
//
// 画布约定：以 (0,0)-(W,H) 为画框，牌在里侧、箭头在外侧；**dir=-1 时整幅镜像**
// ——侧脸、脚步、动线也就跟着朝要去的那一头，不必另画一套左向的图。
// 牌面不随时间变（一探一探的怂由渲染层挪网格做），所以整张图按 icon 烘一次存着。
// ---------------------------------------------------------------------------

// 手绘的圆：取点成多边形再交给 InkFill 抖——圆规画出来的正圆跟这套笔法不搭
function DiskPts(cx, cy, r, n = 22) {
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

// 牌面上那件东西画多大：DrawCarry 的原点是"握点"，各件长短差着一个数量级——
// 长家伙（枪、锄、扫帚）不压小就是一根戳出圈的杆子，攥在手心的小件（石子、
// 绳头）不放大就是一个认不出的小点。[缩放（以 R/11 为基准）, 自身中心的 y]
const HUD_ITEM = {
  步枪: [0.32, -12], 锄头: [0.42, 9], 扫帚: [0.42, 10], 锯: [0.58, 8], 军刀: [0.60, -2],
  刨子: [0.92, -2], 铁皮桶: [0.90, -1], 棉被: [0.95, 0], 湿棉被: [0.95, 0],
  石子: [1.80, 0], 木楔: [1.50, -1], 绳头: [1.30, 1], 窝头: [1.50, -1], 铃铛: [1.50, -1],
  柴刀: [1.10, 0], 木槌: [1.00, 5], 麻绳: [1.05, 0], 土筐: [1.00, 2],
  水桶: [1.00, 5], 空水桶: [1.00, 5], 桶: [1.00, 5], 空桶: [1.00, 5],
  满桶水: [1.00, 5], 一桶水: [1.00, 5],
  粮袋: [1.05, 0], 种子粮: [1.05, 0], 名册: [1.10, 0], 保甲册: [1.10, 0],
  花布巾: [1.20, 0], 襁褓: [1.05, 0], 鞭炮: [1.00, 0], 一挂鞭炮: [1.00, 0],
  红薯干: [1.35, 0], 半瓢水: [1.20, 0], 那件衣裳: [0.95, 0], 水葫芦: [1.25, 0],
  豁口碗: [1.55, 1], 破袄子: [0.95, 0],
};
const HUD_ITEM_FALLBACK = [0.42, 0];   // 兜底那块木板足有 52 单位宽

function HudItem(ctx, label, R) {
  // 撑木/顶木在 DrawCarry 里没有专门的一支，会掉进兜底那块**横**木板——
  // 一根顶在头上的立木画成横板，意思就反了。这一族直接借顶木那张图
  if (label === "撑木" || label === "顶木") { HudGlyph(ctx, { kind: "timber" }, R); return; }
  // 绳头：DrawCarry 那支是按拳头量画的，线宽占了短半径的四分之三——放到牌面
  // 尺度上两道圈直接糊成一块饼（"棒棒糖"）。牌上另画一盘线细一点的
  if (label === "绳头" || label === "麻绳") {
    ctx.lineCap = "round";
    ctx.strokeStyle = "#9a7d4f";
    ctx.lineWidth = R * 0.13;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.ellipse(-R * 0.10, -R * 0.12, R * (0.20 + i * 0.22), R * (0.13 + i * 0.15), 0.2,
        0.3 + i * 0.4, Math.PI * 1.85 + i * 0.3);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(R * 0.34, R * 0.22);
    ctx.quadraticCurveTo(R * 0.60, R * 0.46, R * 0.72, R * 0.84);
    ctx.stroke();
    ctx.lineWidth = R * 0.05;
    ctx.strokeStyle = "rgba(150,124,80,0.95)";
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(R * 0.72, R * 0.84);
      ctx.lineTo(R * 0.72 + (i - 1) * R * 0.17, R * 1.06);
      ctx.stroke();
    }
    return;
  }
  const [k, cy] = HUD_ITEM[label] || HUD_ITEM_FALLBACK;
  const S = (R / 11) * k;
  DrawCarry(ctx, 0, -cy * S, S, 1, label);
}

// 牌面。以 (0,0) 为牌心，内切半径 R；一律画在裁剪圈里，探出去的自己被切掉
function HudGlyph(ctx, icon, R) {
  switch (icon.kind) {
    case "person": {
      // 半身像：肩在下（衣色是本作认人的第一眼），侧脸压在肩上（头饰是第二眼）
      const kind = icon.who || "villager";
      const [coat] = RIG_COLOR(kind);
      InkFill(ctx, [
        [-R * 0.68, R * 1.00], [-R * 0.46, R * 0.32], [R * 0.34, R * 0.30], [R * 0.64, R * 1.00],
      ], "hudBust" + kind, coat, { amp: R * 0.03, lw: R * 0.085, shade: "rgba(0,0,0,0.14)" });
      DrawHeadPart(ctx, -R * 0.08, R * 0.34, R * 0.50, kind, "hudHead" + kind, R * 0.029);
      break;
    }
    case "item": HudItem(ctx, icon.item, R); break;
    case "hand": {
      // 上手使劲。往哪儿使由笔画方向说（顶撑木往上、按棉被往下）；
      // 没方向的就只画一只手——"这一步得你亲手来"
      const dir = icon.gesture === "up" ? -1 : 1;
      const pressing = icon.gesture === "up" || icon.gesture === "down";
      if (pressing) {
        // 受力的那一面：一道横杠（门框、土、被子……牌上只说"有个面在那儿"）
        InkFill(ctx, Rect(-R * 0.66, dir * R * 0.58, R * 1.32, R * 0.22), "hudBar", PAL.wood,
          { amp: R * 0.025, lw: R * 0.075 });
      }
      ctx.save();
      ctx.scale(1, dir);
      ctx.translate(0, pressing ? -R * 0.18 : 0);
      InkFill(ctx, [
        [-R * 0.42, -R * 0.44], [R * 0.34, -R * 0.46], [R * 0.46, R * 0.08],
        [R * 0.22, R * 0.40], [-R * 0.30, R * 0.38], [-R * 0.48, -R * 0.08],
      ], "hudPalm", PAL.skin, { amp: R * 0.03, lw: R * 0.08, shade: "rgba(0,0,0,0.12)" });
      for (let i = 0; i < 3; i += 1) {
        InkLine(ctx, -R * 0.20 + i * R * 0.22, R * 0.04, -R * 0.22 + i * R * 0.22, R * 0.34,
          "hudFinger" + i, { lw: R * 0.05, color: IN.inkSoft, amp: R * 0.015 });
      }
      InkFill(ctx, [[-R * 0.48, -R * 0.10], [-R * 0.68, R * 0.08], [-R * 0.52, R * 0.28], [-R * 0.34, R * 0.14]],
        "hudThumb", PAL.skin, { amp: R * 0.025, lw: R * 0.07 });
      ctx.restore();
      if (pressing) {
        for (let i = 0; i < 3; i += 1) {
          const lx = -R * 0.34 + i * R * 0.34;
          InkLine(ctx, lx, dir * R * 0.28, lx, dir * R * 0.50, "hudPush" + i,
            { lw: R * 0.06, color: IN.ink, amp: R * 0.015 });
        }
      }
      break;
    }
    case "listen": {
      // 贴着听：一只耳朵，左边两道声弧。这一类量的是时间，不是功——
      // 跟"使劲的手"必须一眼分得开
      InkFill(ctx, [
        [R * 0.10, -R * 0.62], [R * 0.36, -R * 0.32], [R * 0.32, R * 0.18], [R * 0.06, R * 0.58],
        [-R * 0.20, R * 0.46], [-R * 0.10, R * 0.06], [-R * 0.28, -R * 0.30], [-R * 0.10, -R * 0.60],
      ], "hudEar", PAL.skin, { amp: R * 0.03, lw: R * 0.085, shade: "rgba(0,0,0,0.12)" });
      ctx.lineCap = "round";
      ctx.strokeStyle = IN.inkSoft;
      ctx.lineWidth = R * 0.07;
      ctx.beginPath();
      ctx.arc(R * 0.02, -R * 0.06, R * 0.20, -Math.PI * 0.5, Math.PI * 0.75);
      ctx.stroke();
      ctx.strokeStyle = IN.ink;
      ctx.lineWidth = R * 0.065;
      for (let i = 0; i < 2; i += 1) {
        ctx.beginPath();
        ctx.arc(-R * 0.30, 0, R * (0.34 + i * 0.26), Math.PI * 0.72, Math.PI * 1.28);
        ctx.stroke();
      }
      break;
    }
    // 蹲着看 / 走过去：直接画那个人在干这件事——牌面语汇和世界里的人是同一套。
    // 尺度按 DrawCharacter 的**实际**高度倒推：立姿从脚到发顶是 64×S（不是 62×S 的
    // bodyH），照 bodyH 给会把脑袋切在圈外——牌上就是一个无头的人。
    case "crouch":
      DrawCharacter(ctx, { x: R * 0.12, y: R * 0.58, scale: R / 34, kind: "player", crouch: true, id: "hudCrouch" });
      // 身前一丛矮掩体：光画一个蹲着的人跟"走过去"分不开，蹲的意思是**蹲在什么后头**
      InkFill(ctx, [
        [-R * 0.92, R * 0.68], [-R * 0.74, R * 0.10], [-R * 0.40, R * 0.30],
        [-R * 0.12, -R * 0.06], [R * 0.10, R * 0.34], [R * 0.16, R * 0.68],
      ], "hudBush", PAL.crop, { amp: R * 0.05, lw: R * 0.08, shade: "rgba(0,0,0,0.16)" });
      break;
    case "walk":
      DrawCharacter(ctx, { x: -R * 0.04, y: R * 0.62, scale: R / 48, kind: "player", moving: true, phase: 1.15, id: "hudWalk" });
      break;
    case "dig": {
      // 掌子面：一堆虚土 + 一把啃进土里的锄。
      // **不能借 DrawCarry 那支长柄锄**：它是按真尺寸画的（42 单位长、柄才 1.15 粗），
      // 缩到牌面上柄只剩一根头发丝，牌上就是一根斜着的牙签。牌面另画一把短粗的
      InkFill(ctx, [[-R * 0.94, R * 0.92], [-R * 0.40, R * 0.24], [R * 0.20, R * 0.50], [R * 0.94, R * 0.92]],
        "hudSoil", "#6e5738", { amp: R * 0.05, lw: R * 0.08, shade: "rgba(0,0,0,0.16)" });
      InkFill(ctx, [[R * 0.60, -R * 0.88], [R * 0.88, -R * 0.66], [-R * 0.16, R * 0.40], [-R * 0.40, R * 0.20]],
        "hudHoeShaft", PAL.wood, { amp: R * 0.03, lw: R * 0.08, shade: "rgba(0,0,0,0.16)" });
      InkFill(ctx, [[-R * 0.28, R * 0.14], [-R * 0.02, R * 0.36], [-R * 0.32, R * 0.74], [-R * 0.64, R * 0.50]],
        "hudHoeBlade", "#6b6f76", { amp: R * 0.03, lw: R * 0.085, shade: "rgba(0,0,0,0.22)" });
      break;
    }
    case "timber": {
      // 撑木顶上去：顶板、一根立木、两支往上的小箭头
      InkFill(ctx, Rect(-R * 0.74, -R * 0.88, R * 1.48, R * 0.24), "hudRoof", PAL.woodOld,
        { amp: R * 0.03, lw: R * 0.08 });
      InkFill(ctx, Rect(-R * 0.17, -R * 0.64, R * 0.34, R * 1.42), "hudProp", PAL.wood,
        { amp: R * 0.03, lw: R * 0.085, shade: "rgba(0,0,0,0.16)" });
      for (const s of [-1, 1]) {
        InkFill(ctx, [[s * R * 0.46, -R * 0.14], [s * R * 0.30, R * 0.14], [s * R * 0.62, R * 0.14]],
          "hudUp" + s, "#f0c95c", { amp: R * 0.025, lw: R * 0.065 });
      }
      break;
    }
    case "door": {
      // 扶门：一扇歪着的门扇（门色要亮，暗一档就成了一块没有信息的黑板），
      // 底下那道门槛上的臼眼空着——下轴脱了窝，这场戏的毛病就长这样
      InkLine(ctx, -R * 0.88, R * 0.82, R * 0.88, R * 0.82, "hudSill", { lw: R * 0.10, color: "#5c4530" });
      ctx.beginPath();
      ctx.arc(-R * 0.46, R * 0.80, R * 0.15, Math.PI, 0);
      ctx.fillStyle = "#2f2a22";
      ctx.fill();
      ctx.save();
      ctx.translate(R * 0.10, -R * 0.06);
      ctx.rotate(0.19);
      InkFill(ctx, Rect(-R * 0.46, -R * 0.78, R * 0.92, R * 1.50), "hudDoor", PAL.wood,
        { amp: R * 0.03, lw: R * 0.09, shade: "rgba(0,0,0,0.18)" });
      // 抹头（横）＋门心板（竖）：两笔就把"木门"和"一块板"分开了
      for (let i = 0; i < 2; i += 1) {
        InkLine(ctx, -R * 0.46, -R * 0.34 + i * R * 0.64, R * 0.46, -R * 0.34 + i * R * 0.64,
          "hudDoorRail" + i, { lw: R * 0.08, color: PAL.woodDark, amp: R * 0.02 });
      }
      InkLine(ctx, 0, -R * 0.34, 0, R * 0.30, "hudDoorStile", { lw: R * 0.06, color: "rgba(90,60,35,0.7)", amp: R * 0.02 });
      // 门脚的圆轴：落在臼眼外头
      ctx.beginPath();
      ctx.arc(-R * 0.30, R * 0.70, R * 0.13, 0, Math.PI * 2);
      ctx.fillStyle = "#4a4238";
      ctx.fill();
      ctx.strokeStyle = IN.ink;
      ctx.lineWidth = R * 0.05;
      ctx.stroke();
      ctx.restore();
      break;
    }
    case "knot": {
      // 接绳：两根绳头**互相穿过对方挽的圈**。上一版是一个圈加一根笔直穿过去的
      // 绳——画出来是个 "Ø"，读成"禁止"。所以圈要小、要偏，两头都得看得见毛茬，
      // 压叠也得一上一下（"穿过去"这三个字全靠压叠成立）
      ctx.lineCap = "round";
      const rope = (pts, id) => {
        ctx.strokeStyle = "#9a7d4f";
        ctx.lineWidth = R * 0.17;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        ctx.quadraticCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1]);
        ctx.stroke();
      };
      // 左边那根：从画外进来，绕成一个偏心的小圈
      rope([[-R * 0.94, R * 0.62], [-R * 0.60, R * 0.34], [-R * 0.26, R * 0.06]], "kA");
      ctx.strokeStyle = "#9a7d4f";
      ctx.lineWidth = R * 0.17;
      ctx.beginPath();
      ctx.ellipse(-R * 0.06, -R * 0.10, R * 0.30, R * 0.24, 0.5, 0, Math.PI * 2);
      ctx.stroke();
      // 右边那根：压在圈上穿出去，再朝画外走
      rope([[-R * 0.30, -R * 0.34], [R * 0.10, R * 0.06], [R * 0.56, R * 0.16]], "kB");
      rope([[R * 0.56, R * 0.16], [R * 0.78, R * 0.20], [R * 0.92, R * 0.02]], "kC");
      // 两头的毛茬：绳是散的，才不是一根铁丝
      ctx.strokeStyle = "rgba(150,124,80,0.95)";
      ctx.lineWidth = R * 0.05;
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.moveTo(-R * 0.94, R * 0.62);
        ctx.lineTo(-R * 1.10, R * 0.60 + (i - 1) * R * 0.14);
        ctx.moveTo(R * 0.92, R * 0.02);
        ctx.lineTo(R * 1.08, R * 0.02 + (i - 1) * R * 0.14);
        ctx.stroke();
      }
      break;
    }
    case "fold": {
      // 叠衣裳：一摞叠好的布，一角掀起来。三条横边＝三道折痕（一条不够，
      // 读成一块板子），掀起的那一角是"手上正在干这件事"的记号
      const w = R * 0.72, y0 = -R * 0.30;
      for (let i = 0; i < 3; i += 1) {
        const yy = y0 + i * R * 0.26;
        const ww = w * (1 - i * 0.10);
        InkFill(ctx, [[-ww, yy], [ww, yy - R * 0.03], [ww, yy + R * 0.20], [-ww, yy + R * 0.23]],
          `hudFold${i}`, i === 0 ? "#5a5048" : "#4a4038",
          { amp: R * 0.02, lw: R * 0.045, shade: "rgba(0,0,0,0.24)" });
      }
      // 掀起来的那一角：从最上一层的右角翻出来，露出里子（浅一档）
      InkFill(ctx, [[w * 0.36, y0 - R * 0.01], [w * 1.00, y0 - R * 0.03],
        [w * 0.86, -R * 0.44], [w * 0.30, -R * 0.30]],
      "hudFoldTip", "#6b6055", { amp: R * 0.02, lw: R * 0.045, shade: "rgba(0,0,0,0.20)" });
      break;
    }
    case "winch": {
      // 辘轳：木轱辘 + 拐出去的曲柄，轱辘上缠着绳（不缠绳就是一只平底锅）。
      // **不画转向箭头**——顺放逆收得看这一拍是放是收，牌上乱指一个方向
      // 就跟绳和判定打架（见 CLAUDE.md 绕圈那一条）
      InkFill(ctx, DiskPts(0, R * 0.02, R * 0.48, 16), "hudDrum", PAL.wood,
        { amp: R * 0.03, lw: R * 0.09, shade: "rgba(0,0,0,0.16)" });
      ctx.strokeStyle = "#9a7d4f";
      ctx.lineWidth = R * 0.09;
      ctx.lineCap = "round";
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.ellipse(0, R * 0.02, R * (0.44 - i * 0.11), R * 0.46, 0, Math.PI * 0.62, Math.PI * 1.38);
        ctx.stroke();
      }
      InkLine(ctx, 0, R * 0.02, R * 0.64, -R * 0.46, "hudCrankArm", { lw: R * 0.12, color: PAL.woodDark, amp: R * 0.02 });
      InkFill(ctx, Rect(R * 0.54, -R * 0.80, R * 0.22, R * 0.36), "hudCrankGrip", PAL.woodOld,
        { amp: R * 0.02, lw: R * 0.07 });
      InkLine(ctx, -R * 0.44, R * 0.34, -R * 0.46, R * 0.94, "hudWinchRope", { lw: R * 0.08, color: "#9a7d4f", amp: R * 0.03 });
      break;
    }
    case "cart": {
      // 独轮车：车斗 + 一根车把 + 一只轮子（辐条自己画，DrawCartWheel 的线宽
      // 是按世界尺寸写死的，缩到牌面上会糊成一坨）
      InkFill(ctx, [[-R * 0.72, -R * 0.34], [R * 0.28, -R * 0.40], [R * 0.16, R * 0.06], [-R * 0.58, R * 0.02]],
        "hudCartBed", PAL.wood, { amp: R * 0.03, lw: R * 0.085, shade: "rgba(0,0,0,0.16)" });
      InkLine(ctx, R * 0.20, -R * 0.36, R * 0.88, -R * 0.60, "hudCartHandle", { lw: R * 0.09, color: PAL.woodDark, amp: R * 0.02 });
      InkFill(ctx, DiskPts(-R * 0.24, R * 0.44, R * 0.38, 14), "hudCartWheel", "#8a6a45",
        { amp: R * 0.025, lw: R * 0.085, shade: "rgba(0,0,0,0.18)" });
      ctx.strokeStyle = IN.ink;
      ctx.lineWidth = R * 0.05;
      for (let i = 0; i < 3; i += 1) {
        const a = i * (Math.PI / 3);
        ctx.beginPath();
        ctx.moveTo(-R * 0.24 - Math.cos(a) * R * 0.30, R * 0.44 - Math.sin(a) * R * 0.30);
        ctx.lineTo(-R * 0.24 + Math.cos(a) * R * 0.30, R * 0.44 + Math.sin(a) * R * 0.30);
        ctx.stroke();
      }
      break;
    }
    case "throw": {
      // 投石：石子在前，动线拖在后（跟引导气泡里那枚同一套读法）
      DrawCarry(ctx, R * 0.14, R * 0.04, R / 7.5, 1, "石子");
      for (let i = 0; i < 3; i += 1) {
        InkLine(ctx, -R * 0.26, -R * 0.34 + i * R * 0.32, -R * 0.80, -R * 0.44 + i * R * 0.32,
          "hudFly" + i, { lw: R * 0.07, color: "rgba(43,31,22,0.6)", amp: R * 0.02 });
      }
      break;
    }
    case "map": {
      // 钉在门板上的据点图：一块板、一条路、一座炮楼、两枚钉
      InkFill(ctx, Rect(-R * 0.74, -R * 0.58, R * 1.48, R * 1.16), "hudBoard", "#c8b58a",
        { amp: R * 0.03, lw: R * 0.09, shade: "rgba(0,0,0,0.12)" });
      InkLine(ctx, -R * 0.54, R * 0.26, R * 0.56, R * 0.08, "hudMapRoad",
        { lw: R * 0.07, color: IN.inkSoft, amp: R * 0.04 });
      InkFill(ctx, Rect(-R * 0.36, -R * 0.34, R * 0.32, R * 0.30), "hudMapFort", "#8d7a5c",
        { amp: R * 0.02, lw: R * 0.06 });
      ctx.fillStyle = "#6b6f76";
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(s * R * 0.56, -R * 0.42, R * 0.09, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "scribe": {
      // 划线：石笔按在料上，笔尖后头留一道白痕
      InkFill(ctx, Rect(-R * 0.82, R * 0.30, R * 1.64, R * 0.36), "hudStock", PAL.wood,
        { amp: R * 0.03, lw: R * 0.08, shade: "rgba(0,0,0,0.14)" });
      InkLine(ctx, -R * 0.66, R * 0.42, R * 0.08, R * 0.42, "hudScribeMark",
        { lw: R * 0.07, color: "rgba(246,241,226,0.92)", amp: R * 0.012 });
      ctx.save();
      ctx.translate(R * 0.22, R * 0.26);
      ctx.rotate(-0.55);
      InkFill(ctx, Rect(-R * 0.10, -R * 0.72, R * 0.20, R * 0.72), "hudScribePen", "#cfc8b4",
        { amp: R * 0.02, lw: R * 0.07 });
      ctx.restore();
      break;
    }
    case "lamp": {
      // 吹灭：一盏马灯，左边一口气
      DrawHandLamp(ctx, 0, -R * 0.56, R / 16, "hurricane");
      for (let i = 0; i < 3; i += 1) {
        InkLine(ctx, -R * 0.94, -R * 0.06 + i * R * 0.24, -R * 0.44, R * 0.02 + i * R * 0.24,
          "hudPuff" + i, { lw: R * 0.06, color: "rgba(43,31,22,0.5)", amp: R * 0.03 });
      }
      break;
    }
    default: break;
  }
}

// 版面（都以牌径 R 为单位，R 又以画布高为准）。渲染层要照它算"箭头尖在哪儿"
// 才摆得进画框——版面改了，摆位跟着这三个数走，别在两边各写一份
export const EDGE_HUD = { rOfH: 0.40, cxOfR: 1.08, tipOfR: 1.70 };

export function DrawEdgeHud(ctx, W, H, icon, { dir = 1, climb = null } = {}) {
  const R = H * EDGE_HUD.rOfH;
  const cx = R * EDGE_HUD.cxOfR, cy = H * 0.5;
  ctx.save();
  ctx.lineJoin = "round";
  if (dir < 0) { ctx.translate(W, 0); ctx.scale(-1, 1); }

  // 牌：一片压得发毛的旧纸，墨圈勾边（跟引导气泡同一张纸）。
  // 不给 shade——InkFill 的暗部是一刀切的直边，落在圆牌上是一道纵贯的硬缝
  InkFill(ctx, DiskPts(cx, cy, R), "hudDisk", "rgba(236,223,188,0.95)",
    { amp: R * 0.045, lw: R * 0.10 });

  // 牌面：裁在圈里画——长家伙的梢、军官的帽檐都不许探出牌外
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.90, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  HudGlyph(ctx, icon || { kind: "walk" }, R);
  ctx.restore();

  // 箭头：指着框外的双人字，后面跟一枚淡一档的重影（» 的读法，同世界里那枚路标）
  const Chevron = (x0, k, alpha, id) => {
    ctx.globalAlpha = alpha;
    InkFill(ctx, [
      [x0 - R * 0.18 * k, cy - R * 0.46 * k], [x0 + R * 0.26 * k, cy],
      [x0 - R * 0.18 * k, cy + R * 0.46 * k], [x0 - R * 0.02 * k, cy],
    ], id, "#f0c95c", { amp: R * 0.03, lw: R * 0.08 });
    ctx.globalAlpha = 1;
  };
  Chevron(cx + R * 1.16, 0.78, 0.45, "hudArrowB");
  Chevron(cx + R * 1.44, 1, 1, "hudArrowA");

  // 跨层：牌角上再挂一枚小牌——梯子＋上下箭头，「先到梯口，下去/上来」
  if (climb) {
    const s = climb === "down" ? 1 : -1;
    const kx = cx + R * 0.62, ky = cy + R * 0.72, kr = R * 0.36;
    InkFill(ctx, DiskPts(kx, ky, kr, 16), "hudClimbDisk", "rgba(236,223,188,0.96)",
      { amp: kr * 0.05, lw: kr * 0.16 });
    // 梯子：两根边梃 + 三道横档
    for (const e of [-1, 1]) {
      InkLine(ctx, kx + e * kr * 0.30, ky - kr * 0.58, kx + e * kr * 0.30, ky + kr * 0.58,
        "hudLadder" + e, { lw: kr * 0.14, color: PAL.woodDark, amp: kr * 0.03 });
    }
    for (let i = 0; i < 3; i += 1) {
      InkLine(ctx, kx - kr * 0.32, ky - kr * 0.40 + i * kr * 0.40, kx + kr * 0.32, ky - kr * 0.40 + i * kr * 0.40,
        "hudRung" + i, { lw: kr * 0.12, color: PAL.woodDark, amp: kr * 0.03 });
    }
    InkFill(ctx, [
      [kx + kr * 0.52, ky - s * kr * 0.38], [kx + kr * 1.02, ky - s * kr * 0.38], [kx + kr * 0.77, ky + s * kr * 0.44],
    ], "hudClimbArrow", "#f0c95c", { amp: kr * 0.04, lw: kr * 0.14 });
  }
  ctx.restore();
}

// 角上那枚常驻的「下一件事」：跟画框边那张牌同一张纸、同一套图，只是**不带箭头**
// ——角上的牌不指方向（方向仍旧归画框边那一枚，目标出框时才有方向可指）。
// 画在 DOM 的一小块 canvas 上（Script_Main 的 PaintObjectiveIcon），所以牌心
// 就是画布正中，不像 DrawEdgeHud 那样要给箭头让出半边。
export function DrawHudBadge(ctx, W, H, icon) {
  const R = Math.min(W, H) * 0.46;
  const cx = W / 2, cy = H / 2;
  ctx.save();
  ctx.lineJoin = "round";
  InkFill(ctx, DiskPts(cx, cy, R), "hudDisk", "rgba(236,223,188,0.95)",
    { amp: R * 0.045, lw: R * 0.10 });
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.90, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  HudGlyph(ctx, icon || { kind: "walk" }, R);
  ctx.restore();
  ctx.restore();
}

// 「你是哪一个」：三个同样身高的土布短褂站在夜里的村道上，玩家分不出哪个是自己。
// 目标标记是黄色实心三角（指路），玩家标记就得长得完全不一样——
// 一枚空心的细线人字标，只有轮廓，不抢画面。
export function DrawPlayerTag(ctx, x, y, t) {
  const bob = Math.sin(t * 2.6) * 2.4;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-8, -7);
  ctx.lineTo(0, 2);
  ctx.lineTo(8, -7);
  ctx.strokeStyle = "rgba(20,14,8,0.55)";
  ctx.lineWidth = 5.2;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,232,178,0.95)";
  ctx.lineWidth = 2.6;
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 插入特写卡：把镜头真正要看的那个细节单独画一张，铺满画框。
// 勇敢的心就是这么处理特写的——不去放大世界里的精灵，另画一张。
// 画布约定：以 (0,0)-(W,H) 为画框，构图自带留白。
// ---------------------------------------------------------------------------
// 活卡（做功那几拍）的底：**什么也不铺**。
//
// 定格插卡是一张画，铺满底板是对的；但活卡是玩家正在玩的那一拍，镜头只是
// 推近了，村子并没有消失。老版这儿也调 CardBase，于是一推近整个世界被一块
// 色板盖掉——用户 2026-08-10 的原话：「搞的像在玩一个独立的游戏一样……
// 你搞了个纯色背景算什么」。现在底留透明，背后那层真景由 World 的离屏虚化
// 铺上去（见 Script_World 的 Render）。
//
// 这里只留一层很淡的暖雾：让前景那件活和虚化的背景之间有一点空气，
// 不至于像贴纸糊在照片上。alpha 压到 0.12 以下，别把背景又盖回去。
function LiveCardBase(ctx, W, H, tint = "#d8c8a4") {
  const g = ctx.createRadialGradient(W * 0.5, H * 0.62, H * 0.05, W * 0.5, H * 0.62, H * 0.95);
  g.addColorStop(0, Tint(tint, 0.11));
  g.addColorStop(0.6, Tint(tint, 0.05));
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// "#rrggbb" + alpha → rgba()
function Tint(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function CardBase(ctx, W, H, tint = "#d8c8a4") {
  const g = ctx.createRadialGradient(W * 0.5, H * 0.46, H * 0.1, W * 0.5, H * 0.5, H * 0.86);
  g.addColorStop(0, tint);
  g.addColorStop(1, "#6b5c44");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  Speckle(ctx, 0, 0, W, H, "cardgrain", { count: Math.round(W / 6), alpha: 0.07, size: 2.4 });
}

export function DrawInsertCard(ctx, W, H, kind) {
  const cx = W * 0.5, cy = H * 0.52;
  const S = H / 420;                       // 以高度归一，构图不随分辨率变
  switch (kind) {
    case "carve": {
      // 一只手攥着凿子，在门框上刻线；木屑正在掉
      CardBase(ctx, W, H, "#cbb68e");
      // 门框立柱（占右侧）
      InkFill(ctx, Rect(cx + 40 * S, 0, 150 * S, H), "cardPost", PAL.wood,
        { amp: 3 * S, lw: 5 * S, shade: "rgba(0,0,0,0.18)" });
      for (let i = 0; i < 5; i += 1) {
        InkLine(ctx, cx + 66 * S, H * (0.1 + i * 0.18), cx + 74 * S, H * (0.24 + i * 0.18),
          "cardGrain" + i, { lw: 2.4 * S, color: "rgba(90,60,35,0.5)", amp: 6 * S });
      }
      // 爹刻的旧线
      InkLine(ctx, cx + 44 * S, cy + 96 * S, cx + 186 * S, cy + 92 * S, "cardOld",
        { lw: 7 * S, color: "#f0e2b4", amp: 2 * S });
      // 新刻的一道（正在刻）
      InkLine(ctx, cx + 44 * S, cy - 40 * S, cx + 150 * S, cy - 44 * S, "cardNew",
        { lw: 8 * S, color: "#fff2cc", amp: 2 * S });
      // 凿子
      ctx.save();
      ctx.translate(cx - 10 * S, cy - 30 * S);
      ctx.rotate(-0.18);
      InkFill(ctx, Rect(-120 * S, -16 * S, 150 * S, 32 * S), "cardChisel", "#8a6a45",
        { amp: 2 * S, lw: 4.5 * S, shade: "rgba(0,0,0,0.2)" });
      InkFill(ctx, [[30 * S, -13 * S], [82 * S, -6 * S], [82 * S, 6 * S], [30 * S, 13 * S]],
        "cardBlade", "#b9b3a4", { amp: 1.6 * S, lw: 4 * S, shade: "rgba(0,0,0,0.22)" });
      ctx.restore();
      // 手（握拳的侧面）
      InkFill(ctx, [
        [cx - 250 * S, cy + 10 * S], [cx - 150 * S, cy - 60 * S], [cx - 60 * S, cy - 52 * S],
        [cx - 30 * S, cy - 8 * S], [cx - 62 * S, cy + 62 * S], [cx - 210 * S, cy + 86 * S],
      ], "cardHand", PAL.skin, { amp: 3 * S, lw: 5.5 * S, shade: "rgba(0,0,0,0.14)" });
      for (let i = 0; i < 3; i += 1) {
        InkLine(ctx, cx - 150 * S + i * 34 * S, cy - 48 * S, cx - 142 * S + i * 34 * S, cy - 6 * S,
          "cardKnuck" + i, { lw: 3 * S, color: "rgba(120,80,50,0.55)", amp: 3 * S });
      }
      // 掉下来的木屑
      for (let i = 0; i < 9; i += 1) {
        const fx = cx + 20 * S + Hash("chip" + i) * 120 * S;
        const fy = cy + 40 * S + Hash("chipy" + i) * H * 0.34;
        ctx.save();
        ctx.translate(fx, fy);
        ctx.rotate(Hash("chipr" + i) * 3);
        InkFill(ctx, [[-14 * S, 0], [0, -7 * S], [16 * S, 2 * S], [2 * S, 8 * S]], "chip" + i, "#e0c78e",
          { amp: 1.4 * S, lw: 2.4 * S });
        ctx.restore();
      }
      // 视角人物在场（演出规范）：背景里柱子仰着头看——淡墨剪影，不抢前景的手
      ctx.save();
      ctx.globalAlpha = 0.34;
      const kx = cx - 300 * S, ky = cy + 150 * S;
      InkFill(ctx, [
        [kx - 40 * S, ky + 120 * S], [kx - 34 * S, ky + 10 * S], [kx - 16 * S, ky - 24 * S],
        [kx + 18 * S, ky - 26 * S], [kx + 34 * S, ky + 6 * S], [kx + 40 * S, ky + 120 * S],
      ], "carveKidBody", "#4a382a", { amp: 3 * S, lw: 0, line: null });
      // 仰起的头：脸朝右上（朝着刻线的方向）
      InkFill(ctx, [
        [kx - 14 * S, ky - 22 * S], [kx - 4 * S, ky - 52 * S], [kx + 26 * S, ky - 56 * S],
        [kx + 36 * S, ky - 34 * S], [kx + 20 * S, ky - 18 * S],
      ], "carveKidHead", "#4a382a", { amp: 2.4 * S, lw: 0, line: null });
      ctx.restore();
      break;
    }
    case "sole": {
      // 交通员磨穿的鞋底
      CardBase(ctx, W, H, "#b8a684");
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.12);
      InkFill(ctx, [
        [-210 * S, -70 * S], [40 * S, -96 * S], [188 * S, -52 * S], [206 * S, 12 * S],
        [120 * S, 78 * S], [-140 * S, 92 * S], [-224 * S, 22 * S],
      ], "cardSole", "#6b5236", { amp: 4 * S, lw: 6 * S, shade: "rgba(0,0,0,0.24)" });
      // 磨穿的洞
      InkFill(ctx, [
        [-40 * S, -20 * S], [58 * S, -34 * S], [92 * S, 12 * S], [16 * S, 44 * S], [-52 * S, 22 * S],
      ], "cardHole", "#241a12", { amp: 3.4 * S, lw: 4.5 * S });
      // 露出来的布与脚
      InkFill(ctx, [[-16 * S, -8 * S], [46 * S, -18 * S], [58 * S, 8 * S], [-4 * S, 24 * S]],
        "cardFoot", PAL.skinDark, { amp: 2.4 * S, lw: 3.4 * S });
      // 针脚
      for (let i = 0; i < 14; i += 1) {
        const t = i / 13;
        InkLine(ctx, -206 * S + t * 400 * S, -78 * S + Math.sin(t * 3) * 14 * S,
          -206 * S + t * 400 * S, -62 * S + Math.sin(t * 3) * 14 * S,
          "stitch" + i, { lw: 2.6 * S, color: "rgba(40,30,20,0.6)", amp: 1.6 * S });
      }
      // 泥
      Speckle(ctx, cx - 240 * S, cy - 100 * S, 460 * S, 200 * S, "mud", { count: 40, alpha: 0.22, size: 4 * S, color: "#3d2f1e" });
      ctx.restore();
      break;
    }
    case "wick": {
      // 烧到头的灯芯
      CardBase(ctx, W, H, "#4a3826");
      // 灯盏
      InkFill(ctx, [
        [cx - 170 * S, cy + 120 * S], [cx + 170 * S, cy + 120 * S],
        [cx + 120 * S, cy + 20 * S], [cx - 120 * S, cy + 20 * S],
      ], "cardLamp", "#8a6a45", { amp: 3 * S, lw: 5.5 * S, shade: "rgba(0,0,0,0.24)" });
      // 灯油
      InkFill(ctx, [[cx - 112 * S, cy + 24 * S], [cx + 112 * S, cy + 24 * S], [cx + 100 * S, cy + 48 * S], [cx - 100 * S, cy + 48 * S]],
        "cardOil", "#3a2a18", { amp: 2 * S, lw: 3 * S });
      // 灯芯：只剩一小截，头上一点红
      InkFill(ctx, Rect(cx - 9 * S, cy - 30 * S, 18 * S, 58 * S), "cardWick", "#2e241a",
        { amp: 1.6 * S, lw: 3.4 * S });
      const g = ctx.createRadialGradient(cx, cy - 44 * S, 0, cx, cy - 44 * S, 150 * S);
      g.addColorStop(0, "rgba(255,230,170,0.95)");
      g.addColorStop(0.3, "rgba(255,170,70,0.55)");
      g.addColorStop(1, "rgba(255,140,50,0)");
      ctx.fillStyle = g;
      ctx.fillRect(cx - 160 * S, cy - 200 * S, 320 * S, 320 * S);
      InkFill(ctx, [
        [cx - 13 * S, cy - 30 * S], [cx, cy - 76 * S], [cx + 13 * S, cy - 30 * S],
      ], "cardFlame", "#ffd98a", { amp: 2 * S, lw: 0, line: null });
      break;
    }
    case "hands": {
      // 两只手被拽开
      CardBase(ctx, W, H, "#3a4152");
      InkFill(ctx, [
        [cx - 300 * S, cy - 60 * S], [cx - 120 * S, cy - 84 * S], [cx - 44 * S, cy - 24 * S],
        [cx - 88 * S, cy + 44 * S], [cx - 280 * S, cy + 54 * S],
      ], "cardHandA", PAL.skin, { amp: 3.4 * S, lw: 5.5 * S, shade: "rgba(0,0,0,0.2)" });
      InkFill(ctx, [
        [cx + 300 * S, cy - 40 * S], [cx + 130 * S, cy - 76 * S], [cx + 40 * S, cy - 10 * S],
        [cx + 96 * S, cy + 58 * S], [cx + 286 * S, cy + 70 * S],
      ], "cardHandB", "#d0a074", { amp: 3.4 * S, lw: 5.5 * S, shade: "rgba(0,0,0,0.2)" });
      // 指尖之间已经断开的那一小段距离
      for (let i = 0; i < 3; i += 1) {
        InkLine(ctx, cx - 40 * S + i * 6 * S, cy - 16 * S + i * 18 * S,
          cx + 34 * S - i * 6 * S, cy - 6 * S + i * 18 * S,
          "gap" + i, { lw: 2 * S, color: "rgba(255,220,180,0.18)", amp: 4 * S });
      }
      break;
    }
    default: {
      if (kind && kind.startsWith("pro")) { DrawPrologueCard(ctx, W, H, kind); break; }
      CardBase(ctx, W, H);
      break;
    }
  }
  // 四角压暗，像一张老照片
  const v = ctx.createRadialGradient(cx, cy, H * 0.28, cx, cy, H * 0.82);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(20,14,8,0.62)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------------------
// 过场活动插卡：日军进村那一镜（c1_roster）。
//
// 为什么要单独画一张：全作是侧视骨架，**正脸给不出来**——而"太君坐在挎斗里
// 冲你打手势"这一镜要的恰恰是正面。所以走定格插卡的画框，但每帧重画
//（World.SetInsertCard 见到 INSERT_LIVE 里登记的名字就走这条路），
// seg 由剧本行上的 cam.seg 给，t 是本行已经走过的秒数——动画完全由
// 游戏时钟驱动，无头实拍（StepFrames）也能逐帧对上。
//
//   seg 0  镜头从开道伪军的脸上一路横摇到挎斗摩托（正面）
//   seg 1  太君原地打手势：两记朝前的劈手（分头、围村）→ 绕一个圈（合拢）→ 收手
//   seg 2  伪军头目凑到斗沿交头接耳；太君点头，白手套朝村里一挥；头目回身派活
//
// 形象按 1942-43 华北的史实与荧幕定式配齐（配色全按 sRGB 坑压两档）：
//   太君    大盖帽（茶褐帽体 + **绯红帽墙** + 星徽）、圆框眼镜、**卫生胡**、
//           九八式立领 + 红领章、斜挎武装带（Sam Browne）、白手套、
//           军刀立在斗里手扶着刀柄——马靴被斗沿挡住，不必画
//   驾驶兵  战斗帽 + **帽垂**（正面看是垂在两颊边的两片布）、土黄军装、胸前交叉背带
//   伪军    软布帽（没有帽垂）、灰土布军装、胯上挎包、布鞋——本乡人的脸，不做丑角
//   队列    摩托背后雾里两排日军剪影，肩上一排刺刀尖——"大部队"三个字全靠这排尖
// ---------------------------------------------------------------------------
export function DrawRaidMotoCard(ctx, W, H, seg, t) {
  const S = H / 420;                 // 构图单位：1u = H/420 像素（与定格卡同标尺）
  const C01 = (x) => Math.max(0, Math.min(1, x));
  const Sm = (x) => { const k = C01(x); return k * k * (3 - 2 * k); };
  const GY = 358, HY = 205;          // 地脚线 / 地平线（单位 u）
  // 卡内配色：整卡就是"阴下来"的那一刻，比村里的日常配色再冷再沉一档
  const RC = {
    ground: "#4e4636", wall: "#544d3c", wallDark: "#423c2f",
    puppetCoat: "#5d5744", puppetTrouser: "#4a443a", puppetCap: "#36322a",
    jpCoat: "#4c482c", jpDark: "#34321f",
    moto: "#514729", motoDark: "#383120", tire: "#22221e",
    officerCoat: "#2b2f1f", officerDark: "#1d2016",
    capBody: "#3e422c", capBand: "#4e2018", star: "#8a7a3a",
    tab: "#5e241c", glove: "#a39c8c", sabre: "#26241c", sabreFit: "#7a7050",
    skin: "#bb9066", skinDark: "#8f6c4c", ink: IN.ink,
  };

  // ---- 天与街（屏幕空间，慢视差）：铅灰的天压着土街，雾把街尾吃掉 ----
  const sky = ctx.createLinearGradient(0, 0, 0, HY * S * 1.16);
  sky.addColorStop(0, "#2e323c");
  sky.addColorStop(0.7, "#4a4840");
  sky.addColorStop(1, "#5c564a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, HY * S * 1.18);
  ctx.fillStyle = RC.ground;
  ctx.fillRect(0, HY * S, W, H - HY * S);
  ctx.fillStyle = "rgba(0,0,0,0.14)";
  ctx.fillRect(0, GY * S * 0.994, W, H);      // 脚下再沉一线

  // 镜头看哪儿：seg0 从伪军(+640u)一路摇到摩托(0)，先在脸上停 1.4 秒
  const look = seg === 0 ? 640 * (1 - Sm((t - 1.4) / 2.65)) : 0;
  const PX = (u) => W / 2 + (u - look) * S;          // 场景 u → 屏幕 px
  const PXf = (u) => W / 2 + (u - look * 0.45) * S;  // 背景层视差（挪得慢一半）

  // 街墙：土坯院墙顺着队伍来的方向退进雾里（往左收向灭点）
  InkFill(ctx, [
    [PXf(-820), (HY + 16) * S], [PXf(920), (HY - 128) * S],
    [PXf(920), (GY - 4) * S], [PXf(-820), (HY + 30) * S],
  ], "rmWallN", RC.wall, { amp: 2.2 * S, lw: 2.6 * S, shade: "rgba(0,0,0,0.22)", shadeAt: 0.35 });
  // 墙上几个黑窗洞与一个门洞（关着的），读出"家家闭户"
  for (let i = 0; i < 4; i += 1) {
    const wx = 690 - i * 300;
    const k = 1 - i * 0.18;
    InkFill(ctx, [
      [PXf(wx), (HY + 4 - 62 * k) * S], [PXf(wx + 40 * k), (HY + 2 - 64 * k) * S],
      [PXf(wx + 42 * k), (HY + 8 - 20 * k) * S], [PXf(wx + 2), (HY + 10 - 18 * k) * S],
    ], "rmWin" + i, RC.wallDark, { amp: 1.4 * S, lw: 2 * S });
  }
  // 街尾的歪脖树：一团黑剪影，枝子抓着天
  ctx.save();
  ctx.globalAlpha = 0.8;
  InkFill(ctx, [
    [PXf(-700), (HY + 12) * S], [PXf(-688), (HY - 60) * S], [PXf(-716), (HY - 96) * S],
    [PXf(-668), (HY - 74) * S], [PXf(-620), (HY - 104) * S], [PXf(-648), (HY - 56) * S],
    [PXf(-628), (HY + 10) * S],
  ], "rmTree", "#23211a", { amp: 2.4 * S, lw: 0, line: null });
  ctx.restore();
  // 贴地的灰雾：越往街尾越浓
  const fog = ctx.createLinearGradient(PXf(-820), 0, PXf(240), 0);
  fog.addColorStop(0, "rgba(74,74,68,0.62)");
  fog.addColorStop(1, "rgba(74,74,68,0)");
  ctx.fillStyle = fog;
  ctx.fillRect(0, (HY - 70) * S, W, (GY - HY + 76) * S);

  // 惊起的乌鸦（seg0 / seg2 各放一拨）：两三个黑点扇着翅膀斜着飞走
  if (seg !== 1) {
    for (let i = 0; i < 3; i += 1) {
      const ph = t * 0.16 + i * 0.09;
      if (ph > 0.9) continue;
      const bx = W * (0.66 - ph * 0.5 - i * 0.05);
      const by = H * (0.30 - ph * 0.16 + i * 0.05);
      const flap = Math.sin(t * 9 + i * 2.1) * 8 * S;
      ctx.strokeStyle = "#1d1b16";
      ctx.lineWidth = 2.6 * S;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(bx - 9 * S, by - flap);
      ctx.quadraticCurveTo(bx, by + 3 * S, bx + 9 * S, by - flap);
      ctx.stroke();
    }
  }

  // ---- 正面人物零件 ----------------------------------------------------------
  // 正面行走/站立的伪军。x 是脚中点（场景 u），hgt 是全高（u）
  const FrontPuppet = (x, gy, hgt, id, { walk = 0, drift = 0 } = {}) => {
    const px = PX(x + drift);
    const bob = walk ? Math.sin(walk) * 0.014 * hgt : 0;
    const gyS = (gy - bob) * S;
    const hu = hgt / 190;                       // 以 190u 为基准的比例
    const hr = 17 * hu;                         // 头半径（u）
    const shoulderY = gyS - hgt * 0.78 * S;
    const headC = gyS - hgt * 0.88 * S;
    const wS = 30 * hu * S;                     // 半肩宽 px
    // 腿（正面两条，走路小幅错开）
    const step = walk ? Math.sin(walk) * 7 * hu : 0;
    for (const s of [-1, 1]) {
      InkFill(ctx, [
        [px + s * 11 * hu * S - 6 * hu * S, gyS - hgt * 0.42 * S],
        [px + s * 11 * hu * S + 6 * hu * S, gyS - hgt * 0.42 * S],
        [px + s * (11 + 1.5) * hu * S + 5 * hu * S + s * step * S * 0.3, gyS - 3 * S],
        [px + s * (11 + 1.5) * hu * S - 6 * hu * S + s * step * S * 0.3, gyS - 2 * S],
      ], id + "leg" + s, RC.puppetTrouser, { amp: 1.6 * S, lw: 2.6 * S });
      // 布鞋
      InkFill(ctx, [
        [px + s * 12 * hu * S - 7 * hu * S + s * step * S * 0.3, gyS - 5 * S],
        [px + s * 12 * hu * S + 7 * hu * S + s * step * S * 0.3, gyS - 5 * S],
        [px + s * 12 * hu * S + 8 * hu * S + s * step * S * 0.3, gyS],
        [px + s * 12 * hu * S - 8 * hu * S + s * step * S * 0.3, gyS],
      ], id + "shoe" + s, "#2e2721", { amp: 1 * S, lw: 2 * S });
    }
    // 躯干：灰土布军装，正面对襟一道扣线
    InkFill(ctx, [
      [px - wS, shoulderY], [px + wS, shoulderY],
      [px + wS * 0.92, gyS - hgt * 0.40 * S], [px - wS * 0.92, gyS - hgt * 0.40 * S],
    ], id + "coat", RC.puppetCoat, { amp: 1.8 * S, lw: 2.8 * S, shade: "rgba(0,0,0,0.18)" });
    InkLine(ctx, px, shoulderY + 4 * S, px, gyS - hgt * 0.42 * S, id + "btn",
      { lw: 1.8 * S, color: "rgba(30,24,16,0.55)", amp: 1 * S });
    // 挎包带（斜挂）——伪军在本作的记号
    InkLine(ctx, px - wS * 0.6, shoulderY + 2 * S, px + wS * 0.72, gyS - hgt * 0.44 * S,
      id + "sat", { lw: 3 * hu * S, color: "rgba(30,24,16,0.5)", amp: 1.2 * S });
    // 两臂垂在身侧（走路小幅摆）
    for (const s of [-1, 1]) {
      const sw = walk ? Math.sin(walk + (s > 0 ? Math.PI : 0)) * 5 * hu : 0;
      InkLine(ctx, px + s * wS * 0.9, shoulderY + 4 * S,
        px + s * (wS * 0.98) + sw * S, gyS - hgt * 0.40 * S, id + "arm" + s,
        { lw: 7 * hu * S, color: RC.puppetCoat, amp: 1.4 * S });
    }
    // 头与脸：帽檐的影子压住眉眼——脸沉着，不是丑角
    InkFill(ctx, [
      [px - hr * S, headC + hr * 0.7 * S], [px - hr * 0.86 * S, headC - hr * 0.7 * S],
      [px, headC - hr * S], [px + hr * 0.86 * S, headC - hr * 0.7 * S],
      [px + hr * S, headC + hr * 0.7 * S], [px + hr * 0.4 * S, headC + hr * 1.06 * S],
      [px - hr * 0.4 * S, headC + hr * 1.06 * S],
    ], id + "face", RC.skin, { amp: 1.2 * S, lw: 2.6 * S, shade: "rgba(0,0,0,0.12)" });
    // 软布帽（没有帽垂）：一顶塌塌的圆帽
    InkFill(ctx, [
      [px - hr * 1.12 * S, headC - hr * 0.44 * S], [px - hr * 0.7 * S, headC - hr * 1.2 * S],
      [px + hr * 0.7 * S, headC - hr * 1.24 * S], [px + hr * 1.12 * S, headC - hr * 0.4 * S],
      [px + hr * 0.9 * S, headC - hr * 0.2 * S], [px - hr * 0.9 * S, headC - hr * 0.22 * S],
    ], id + "cap", RC.puppetCap, { amp: 1.6 * S, lw: 2.6 * S });
    // 帽影里的眉眼：两道短墨 + 抿住的嘴
    ctx.fillStyle = "rgba(20,16,10,0.6)";
    ctx.fillRect(px - hr * 0.72 * S, headC - hr * 0.28 * S, hr * 1.44 * S, hr * 0.34 * S);
    ctx.fillStyle = IN.ink;
    ctx.fillRect(px - hr * 0.5 * S, headC - hr * 0.1 * S, hr * 0.32 * S, hr * 0.13 * S);
    ctx.fillRect(px + hr * 0.2 * S, headC - hr * 0.1 * S, hr * 0.32 * S, hr * 0.13 * S);
    // 嘴抿成一道向下的弧（∩）——抖动画笔的随机弯有一半概率把嘴画成微笑，
    // 这张脸不许笑，所以这一笔不走 InkLine
    ctx.strokeStyle = IN.inkSoft;
    ctx.lineWidth = 1.8 * S;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(px - hr * 0.26 * S, headC + hr * 0.68 * S);
    ctx.quadraticCurveTo(px, headC + hr * 0.55 * S, px + hr * 0.26 * S, headC + hr * 0.68 * S);
    ctx.stroke();
  };

  // 雾里的日军队列剪影：一排三个兵。两条腿必须分开画——身子连成一片就读成
  // "披袍的"（第一版就是这么栽的，画面上一排像举长矛的袍子）。
  // 步枪是**斜背**的一道短线 + 一点刺刀尖，别画成竖着的长矛
  const JpRank = (x, gy, hgt, id) => {
    ctx.save();
    ctx.globalAlpha = 0.6;
    for (let i = 0; i < 3; i += 1) {
      const px = PX(x + (i - 1) * hgt * 0.52);
      const gyS = gy * S, hS = hgt * S;
      const bob = Math.sin(t * 5.2 + i * 1.7 + x * 0.1) * hS * 0.012;
      // 斜背的步枪：枪身越过肩，头上只冒一小截刺刀
      InkLine(ctx, px - hS * 0.16, gyS - hS * 0.5 + bob, px + hS * 0.2, gyS - hS * 1.1 + bob,
        id + "g" + i, { lw: 1.8 * S, color: "#1f1d14", amp: 0.4 * S });
      InkLine(ctx, px + hS * 0.2, gyS - hS * 1.1 + bob, px + hS * 0.26, gyS - hS * 1.24 + bob,
        id + "gt" + i, { lw: 1.4 * S, color: "#565244", amp: 0.3 * S });
      // 两条腿
      for (const s of [-1, 1]) {
        InkLine(ctx, px + s * hS * 0.05, gyS - hS * 0.4 + bob, px + s * hS * 0.1, gyS,
          id + "l" + i + s, { lw: 3 * S, color: "#26241a", amp: 0.5 * S });
      }
      // 躯干 + 头（战斗帽的小轮廓）
      InkFill(ctx, [
        [px - hS * 0.14, gyS - hS * 0.36 + bob], [px - hS * 0.12, gyS - hS * 0.72 + bob],
        [px + hS * 0.12, gyS - hS * 0.72 + bob], [px + hS * 0.15, gyS - hS * 0.36 + bob],
      ], id + "s" + i, "#2c2a1c", { amp: 1 * S, lw: 0, line: null });
      InkFill(ctx, [
        [px - hS * 0.085, gyS - hS * 0.7 + bob], [px - hS * 0.08, gyS - hS * 0.94 + bob],
        [px + hS * 0.08, gyS - hS * 0.94 + bob], [px + hS * 0.09, gyS - hS * 0.7 + bob],
      ], id + "h" + i, "#33301e", { amp: 0.8 * S, lw: 0, line: null });
    }
    ctx.restore();
  };
  // ---- 挎斗摩托 + 太君 + 驾驶兵（场景原点） --------------------------------
  // OfficerArm：右臂两节的世界角（0 = 垂直向下，负 = 朝画面左抬），返回手心落点
  const OfficerArm = (sx, sy, aU, aF, id) => {
    const L1 = 34 * S, L2 = 30 * S;
    const ex = sx + Math.sin(aU) * L1, ey = sy + Math.cos(aU) * L1;
    const hx = ex + Math.sin(aU + aF) * L2, hy = ey + Math.cos(aU + aF) * L2;
    InkLine(ctx, sx, sy, ex, ey, id + "u", { lw: 10 * S, color: RC.officerCoat, amp: 1 * S });
    InkLine(ctx, ex, ey, hx, hy, id + "f", { lw: 8.6 * S, color: RC.officerCoat, amp: 1 * S });
    // 白手套：认"军官在指挥"的那一点白
    ctx.beginPath();
    ctx.ellipse(hx, hy, 6.4 * S, 5.2 * S, aU + aF, 0, Math.PI * 2);
    ctx.fillStyle = RC.glove;
    ctx.fill();
    ctx.strokeStyle = IN.ink;
    ctx.lineWidth = 1.8 * S;
    ctx.stroke();
    return { hx, hy };
  };

  const Moto = () => {
    const jit = Math.sin(t * 57) * 1.1 * S;     // 引擎怠速的那点哆嗦
    const cx0 = PX(0), gyS = GY * S + jit * 0.4;
    // 排气：一口一口的灰
    for (let i = 0; i < 5; i += 1) {
      const ph = (t * 0.5 + i * 0.21) % 1;
      const ex = cx0 - 96 * S - ph * 34 * S - i * 3 * S;
      const ey = gyS - 16 * S - ph * 52 * S;
      ctx.beginPath();
      ctx.ellipse(ex, ey, (6 + ph * 17) * S, (4.6 + ph * 13) * S, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(138,134,122,${(1 - ph) * 0.2})`;
      ctx.fill();
    }
    // 地上的一摊影子
    ctx.beginPath();
    ctx.ellipse(cx0 + 10 * S, gyS - 2 * S, 150 * S, 13 * S, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(18,14,8,0.28)";
    ctx.fill();

    // —— 驾驶兵（在车把后面，先画）
    const dx = cx0 - 34 * S, dHead = gyS - 152 * S + jit;
    InkFill(ctx, [
      [dx - 30 * S, gyS - 58 * S], [dx - 26 * S, dHead + 34 * S], [dx + 26 * S, dHead + 34 * S],
      [dx + 30 * S, gyS - 58 * S],
    ], "rmDrvBody", RC.jpCoat, { amp: 1.8 * S, lw: 2.8 * S, shade: "rgba(0,0,0,0.2)" });
    // 胸前交叉背带
    InkLine(ctx, dx - 20 * S, dHead + 40 * S, dx + 16 * S, gyS - 62 * S, "rmDrvX1", { lw: 3 * S, color: "rgba(30,24,14,0.55)", amp: 1 * S });
    InkLine(ctx, dx + 20 * S, dHead + 40 * S, dx - 16 * S, gyS - 62 * S, "rmDrvX2", { lw: 3 * S, color: "rgba(30,24,14,0.55)", amp: 1 * S });
    // 头 + 战斗帽 + 两颊边的帽垂（正面识别日军的第一眼）
    InkFill(ctx, [
      [dx - 15 * S, dHead + 18 * S], [dx - 14 * S, dHead - 8 * S], [dx, dHead - 14 * S],
      [dx + 14 * S, dHead - 8 * S], [dx + 15 * S, dHead + 18 * S], [dx + 6 * S, dHead + 26 * S],
      [dx - 6 * S, dHead + 26 * S],
    ], "rmDrvFace", RC.skin, { amp: 1.2 * S, lw: 2.6 * S, shade: "rgba(0,0,0,0.14)" });
    for (const s of [-1, 1]) {
      InkFill(ctx, [
        [dx + s * 11 * S, dHead - 4 * S], [dx + s * 19 * S, dHead - 2 * S],
        [dx + s * 18 * S, dHead + 26 * S], [dx + s * 10 * S, dHead + 22 * S],
      ], "rmDrvFlap" + s, "#41401f", { amp: 1.2 * S, lw: 2 * S });
    }
    InkFill(ctx, [
      [dx - 17 * S, dHead - 2 * S], [dx - 12 * S, dHead - 20 * S], [dx + 12 * S, dHead - 20 * S],
      [dx + 17 * S, dHead - 2 * S], [dx + 13 * S, dHead + 3 * S], [dx - 13 * S, dHead + 3 * S],
    ], "rmDrvCap", "#4c4a26", { amp: 1.4 * S, lw: 2.4 * S });
    ctx.fillStyle = "rgba(20,16,10,0.55)";
    ctx.fillRect(dx - 12 * S, dHead + 1 * S, 24 * S, 6 * S);   // 帽檐影
    ctx.fillStyle = IN.ink;
    ctx.fillRect(dx - 9 * S, dHead + 8 * S, 6 * S, 2.6 * S);
    ctx.fillRect(dx + 3 * S, dHead + 8 * S, 6 * S, 2.6 * S);
    // 两臂伸向车把
    InkLine(ctx, dx - 24 * S, dHead + 44 * S, dx - 52 * S, gyS - 92 * S + jit, "rmDrvArmL", { lw: 9 * S, color: RC.jpCoat, amp: 1.2 * S });
    InkLine(ctx, dx + 24 * S, dHead + 44 * S, dx + 4 * S, gyS - 92 * S + jit, "rmDrvArmR", { lw: 9 * S, color: RC.jpCoat, amp: 1.2 * S });

    // —— 太君（斗里，先画人再画斗鼻子盖住下半身）。
    // 斗必须贴着车：第一版摆在 +96，斗跟车中间空出一条街，读成"军官坐在一辆
    // 单独的推车里"——挎斗跟车之间还要再补两根连杆（见下）
    const ox = cx0 + 66 * S;
    // 头基准。seg2 里跟头目交头接耳时头往右倾一点，点头再压一点
    let tilt = 0, nod = 0;
    if (seg === 2) {
      tilt = 0.10 * Sm((t - 1.9) / 0.5) * (1 - Sm((t - 3.5) / 0.5));
      nod = (Math.sin(C01((t - 2.5) / 0.9) * Math.PI * 2) + Math.sin(C01((t - 3.1) / 0.7) * Math.PI * 2)) * 0.05;
    }
    const oHead = gyS - 178 * S + jit;
    // 躯干（立领将校呢）
    InkFill(ctx, [
      [ox - 34 * S, gyS - 66 * S], [ox - 30 * S, oHead + 36 * S], [ox + 30 * S, oHead + 36 * S],
      [ox + 34 * S, gyS - 66 * S],
    ], "rmOffBody", RC.officerCoat, { amp: 1.8 * S, lw: 3 * S, shade: "rgba(0,0,0,0.22)" });
    // 斜挎武装带 + 略章（左胸一小条）
    InkLine(ctx, ox + 22 * S, oHead + 42 * S, ox - 26 * S, gyS - 74 * S, "rmOffSam", { lw: 4 * S, color: "rgba(24,20,12,0.6)", amp: 1 * S });
    InkFill(ctx, Rect(ox - 20 * S, oHead + 52 * S, 14 * S, 5 * S), "rmOffRib", "#6e4a2c", { amp: 0.4 * S, lw: 1.2 * S });
    // 立领 + 两片红领章
    InkFill(ctx, Rect(ox - 15 * S, oHead + 28 * S, 30 * S, 10 * S), "rmOffCollar", RC.officerDark, { amp: 0.8 * S, lw: 2 * S });
    for (const s of [-1, 1]) {
      InkFill(ctx, Rect(ox + s * 13 * S - 6 * S, oHead + 30 * S, 9 * S, 6 * S), "rmOffTab" + s, RC.tab, { amp: 0.4 * S, lw: 1.2 * S });
    }
    // 军刀立在斗里：缠柄露在斗沿上，护手一小圈，左手（白手套）搭在柄头
    InkLine(ctx, ox - 26 * S, gyS - 70 * S, ox - 30 * S, oHead + 60 * S, "rmSabre", { lw: 5 * S, color: RC.sabre, amp: 0.8 * S });
    ctx.beginPath();
    ctx.ellipse(ox - 29 * S, oHead + 63 * S, 5 * S, 2.4 * S, 0.2, 0, Math.PI * 2);
    ctx.fillStyle = "#5c5440";
    ctx.fill();
    ctx.strokeStyle = IN.ink; ctx.lineWidth = 1.4 * S; ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(ox - 30 * S, oHead + 55 * S, 5.6 * S, 4.6 * S, 0, 0, Math.PI * 2);
    ctx.fillStyle = RC.glove;
    ctx.fill();
    ctx.strokeStyle = IN.ink; ctx.lineWidth = 1.6 * S; ctx.stroke();

    // 右臂：seg1 打手势；seg2 收在刀柄上、末了朝村里一挥；seg0 按着斗沿
    let arm = { aU: -0.5, aF: -0.25 };          // 默认：手搭斗沿
    if (seg === 1) {
      // 关键帧：抬起 → 劈一 → 回 → 劈二 → 指住村口 → 绕圈（合拢）→ 收手
      const K = [
        [0.0, -0.5, -0.25], [0.7, -2.3, -0.5], [1.1, -1.5, -0.35], [1.5, -2.3, -0.5],
        [1.9, -1.5, -0.35], [2.3, -1.95, -0.6], [2.6, -1.95, -0.6], [3.6, -1.95, -0.6], [4.2, -0.5, -0.25],
      ];
      let a = K[0], b = K[K.length - 1];
      for (let i = 0; i < K.length - 1; i += 1) {
        if (t >= K[i][0] && t <= K[i + 1][0]) { a = K[i]; b = K[i + 1]; break; }
        if (t > K[i + 1][0]) { a = K[i + 1]; b = K[i + 1]; }
      }
      const k = b[0] > a[0] ? Sm((t - a[0]) / (b[0] - a[0])) : 0;
      arm = { aU: a[1] + (b[1] - a[1]) * k, aF: a[2] + (b[2] - a[2]) * k };
      // 2.6~3.6 那一秒：手腕绕圈——"把村子围起来"
      if (t > 2.6 && t < 3.6) {
        const w = (t - 2.6) / 1.0 * Math.PI * 2 * 1.5;
        arm.aU += Math.sin(w) * 0.22;
        arm.aF += Math.cos(w) * 0.3;
      }
    } else if (seg === 2) {
      // 交头接耳时手按着刀柄不动；3.5s 起白手套朝村里（画面左）连挥两下
      const flick = Math.sin(C01((t - 3.5) / 0.8) * Math.PI * 2) * Sm((t - 3.5) / 0.15) * (1 - Sm((t - 4.4) / 0.2));
      arm = { aU: -0.5 - Sm((t - 3.4) / 0.4) * 1.3, aF: -0.25 - flick * 0.55 };
    }
    OfficerArm(ox + 24 * S, oHead + 46 * S, arm.aU, arm.aF, "rmOffArm");

    // 头（正面，含倾斜/点头）
    ctx.save();
    ctx.translate(ox, oHead + 8 * S);
    ctx.rotate(tilt + nod * 0.4);
    ctx.translate(0, nod * 5 * S);
    // 脸
    InkFill(ctx, [
      [-16 * S, 14 * S], [-15 * S, -10 * S], [0, -16 * S], [15 * S, -10 * S],
      [16 * S, 14 * S], [8 * S, 24 * S], [-8 * S, 24 * S],
    ], "rmOffFace", RC.skin, { amp: 1.2 * S, lw: 2.8 * S, shade: "rgba(0,0,0,0.14)" });
    // 大盖帽：帽檐影先把眉眼压进去
    ctx.fillStyle = "rgba(16,12,8,0.5)";
    ctx.fillRect(-14 * S, -4 * S, 28 * S, 7 * S);
    // 圆框眼镜：两个细圈 + 中梁，镜片一线冷光
    ctx.strokeStyle = "#1f1c14";
    ctx.lineWidth = 1.6 * S;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(s * 7.4 * S, 2.4 * S, 5.6 * S, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-2 * S, 2 * S); ctx.lineTo(2 * S, 2 * S); ctx.stroke();
    ctx.strokeStyle = "rgba(200,204,196,0.4)";
    ctx.lineWidth = 1.2 * S;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(s * 7.4 * S, 2.4 * S, 4.2 * S, -1.9, -1.1);
      ctx.stroke();
    }
    // 卫生胡：鼻下一小方块——荧幕上认太君的那一撮
    InkFill(ctx, Rect(-4.6 * S, 9.6 * S, 9.2 * S, 4.4 * S), "rmStache", "#241a12", { amp: 0.4 * S, lw: 1.2 * S });
    InkLine(ctx, -5 * S, 18.6 * S, 5 * S, 18.6 * S, "rmOffMouth", { lw: 1.8 * S, color: IN.inkSoft, amp: 0.5 * S });
    // 大盖帽本体：帽墙绯红一整圈 + 星徽 + 黑檐
    InkFill(ctx, [
      [-19 * S, -6 * S], [-17 * S, -24 * S], [-6 * S, -30 * S], [6 * S, -30 * S],
      [17 * S, -24 * S], [19 * S, -6 * S],
    ], "rmOffCap", RC.capBody, { amp: 1.2 * S, lw: 2.6 * S });
    InkFill(ctx, Rect(-19 * S, -10 * S, 38 * S, 7.4 * S), "rmOffBand", RC.capBand, { amp: 0.7 * S, lw: 2 * S });
    ctx.beginPath();
    ctx.arc(0, -6.4 * S, 2.6 * S, 0, Math.PI * 2);
    ctx.fillStyle = RC.star;
    ctx.fill();
    InkFill(ctx, [
      [-15 * S, -3.4 * S], [15 * S, -3.4 * S], [11 * S, 3.4 * S], [-11 * S, 3.4 * S],
    ], "rmOffVisor", "#1c1a12", { amp: 0.6 * S, lw: 1.8 * S });
    ctx.restore();

    // —— 挎斗（车斗鼻子朝镜头，盖住太君腰以下）。
    // 先画两根连杆把斗跟车焊在一起，斗身随后压住接头
    for (const [y1, y2] of [[34, 32], [54, 52]]) {
      InkLine(ctx, cx0 - 8 * S, gyS - y1 * S, ox - 40 * S, gyS - y2 * S, "rmStrut" + y1,
        { lw: 3.4 * S, color: RC.motoDark, amp: 0.5 * S });
    }
    InkFill(ctx, [
      [ox - 52 * S, gyS - 70 * S], [ox + 52 * S, gyS - 70 * S], [ox + 44 * S, gyS - 6 * S],
      [ox - 44 * S, gyS - 6 * S],
    ], "rmTub", RC.moto, { amp: 2 * S, lw: 3 * S, shade: "rgba(0,0,0,0.24)" });
    InkLine(ctx, ox - 52 * S, gyS - 68 * S, ox + 52 * S, gyS - 68 * S, "rmTubRim",
      { lw: 2.6 * S, color: "rgba(220,205,160,0.35)", amp: 0.8 * S });
    // 斗鼻上一只备胎
    ctx.beginPath();
    ctx.ellipse(ox, gyS - 34 * S, 21 * S, 21 * S, 0, 0, Math.PI * 2);
    ctx.fillStyle = RC.tire;
    ctx.fill();
    ctx.strokeStyle = IN.ink; ctx.lineWidth = 2.4 * S; ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(ox, gyS - 34 * S, 9 * S, 9 * S, 0, 0, Math.PI * 2);
    ctx.fillStyle = RC.motoDark;
    ctx.fill();
    ctx.stroke();
    // 斗轮（右侧露半个）
    ctx.beginPath();
    ctx.ellipse(ox + 50 * S, gyS - 18 * S, 7 * S, 17 * S, 0, 0, Math.PI * 2);
    ctx.fillStyle = RC.tire;
    ctx.fill();
    ctx.stroke();

    // —— 车头（前轮/前叉/车把/大灯，最后画，压住驾驶兵的手）
    const fx = cx0 - 40 * S;
    // 先给车一个"身子"：发动机的黑铁块从驾驶兵身下一直落到轮后——没有这一块，
    // 兵的躯干悬在半空，整个人读成飘着的（第一版就是）
    InkFill(ctx, [
      [dx - 22 * S, gyS - 60 * S], [dx + 24 * S, gyS - 60 * S],
      [dx + 20 * S, gyS - 10 * S], [dx - 18 * S, gyS - 10 * S],
    ], "rmEngine", RC.motoDark, { amp: 1.6 * S, lw: 2.4 * S, shade: "rgba(0,0,0,0.3)" });
    // 骑手的两只马靴踩在踏板上，露在车身两侧
    for (const s of [-1, 1]) {
      InkFill(ctx, [
        [dx + s * 24 * S - 6 * S, gyS - 30 * S], [dx + s * 24 * S + 7 * S, gyS - 30 * S],
        [dx + s * 26 * S + 8 * S, gyS - 12 * S], [dx + s * 26 * S - 7 * S, gyS - 12 * S],
      ], "rmBoot" + s, "#1f1c14", { amp: 1 * S, lw: 2 * S });
    }
    ctx.beginPath();
    ctx.ellipse(fx, gyS - 26 * S, 10 * S, 26 * S, 0, 0, Math.PI * 2);
    ctx.fillStyle = RC.tire;
    ctx.fill();
    ctx.strokeStyle = IN.ink; ctx.lineWidth = 2.6 * S; ctx.stroke();
    // 前挡泥板
    InkFill(ctx, [
      [fx - 13 * S, gyS - 48 * S], [fx + 13 * S, gyS - 48 * S],
      [fx + 15 * S, gyS - 38 * S], [fx - 15 * S, gyS - 38 * S],
    ], "rmFender", RC.moto, { amp: 1.2 * S, lw: 2.2 * S });
    // 前叉两根到车把
    for (const s of [-1, 1]) {
      InkLine(ctx, fx + s * 7 * S, gyS - 46 * S, fx + s * 9 * S, gyS - 92 * S + jit, "rmFork" + s,
        { lw: 3 * S, color: RC.motoDark, amp: 0.6 * S });
    }
    // 车把一横，两端握把
    InkLine(ctx, fx - 56 * S, gyS - 94 * S + jit, fx + 52 * S, gyS - 92 * S + jit, "rmBar",
      { lw: 4.4 * S, color: RC.motoDark, amp: 0.8 * S });
    // 大灯：一只圆灯 + 冷白的一圈弱光（灯是亮的——阴天里这点光反而瘆人）
    const lyS = gyS - 72 * S + jit;
    const glow = ctx.createRadialGradient(fx, lyS, 2 * S, fx, lyS, 60 * S);
    const gk = 0.3 + Math.sin(t * 13) * 0.04;
    glow.addColorStop(0, `rgba(216,210,176,${gk})`);
    glow.addColorStop(1, "rgba(216,210,176,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(fx - 64 * S, lyS - 64 * S, 128 * S, 128 * S);
    ctx.beginPath();
    ctx.ellipse(fx, lyS, 12 * S, 12 * S, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#b3ad8e";
    ctx.fill();
    ctx.strokeStyle = IN.ink; ctx.lineWidth = 2.4 * S; ctx.stroke();
  };

  // ---- 伪军头目（seg2 走进来交头接耳；侧脸朝左） ----------------------------
  const Chief = () => {
    if (seg !== 2) return;
    const walkIn = Sm(t / 1.6);
    const x0 = 500 - (500 - 138) * walkIn;      // 从画右走到斗沿
    const lean = Sm((t - 1.7) / 0.5) * (1 - Sm((t - 3.6) / 0.5));   // 凑过去
    const turn = Sm((t - 3.9) / 0.5);           // 回身派活
    const px = PX(x0), gyS = GY * S;
    const hgt = 182;
    const walk = (t < 1.6 || turn > 0.6) ? t * 7.5 : 0;
    const step = walk ? Math.sin(walk) * 8 : 0;
    // 腿（侧视两条）——比伪军的灰土布再深一档：他站在近景，浅了就发飘
    InkLine(ctx, px - step * S * 0.4, gyS - hgt * 0.44 * S, px - (13 + step) * S, gyS - 2 * S, "rmChLegB", { lw: 8 * S, color: "#3a352c", amp: 1.2 * S });
    InkLine(ctx, px + step * S * 0.4, gyS - hgt * 0.44 * S, px + (6 + step) * S, gyS - 2 * S, "rmChLegF", { lw: 8.6 * S, color: "#443e33", amp: 1.2 * S });
    // 躯干：凑过去时朝左折
    const bend = lean * 0.34 - turn * 0.2;
    const sx = px - Math.sin(bend) * hgt * 0.36 * S;
    const sy = gyS - hgt * (0.44 + 0.34 * Math.cos(bend)) * S;
    InkFill(ctx, [
      [px - 15 * S, gyS - hgt * 0.42 * S], [sx - 16 * S, sy], [sx + 14 * S, sy + 6 * S],
      [px + 17 * S, gyS - hgt * 0.42 * S],
    ], "rmChBody", "#4a4436", { amp: 1.8 * S, lw: 2.8 * S, shade: "rgba(0,0,0,0.24)" });
    // 挎包
    InkFill(ctx, Rect(px + 6 * S, gyS - hgt * 0.40 * S, 14 * S, 17 * S), "rmChSat", "#3f382c", { amp: 1.2 * S, lw: 2 * S });
    // 头（侧脸朝左）＋软帽；回身时翻朝右
    const hx = sx + (turn > 0.5 ? 8 : -4) * S, hy = sy - 20 * S + lean * 6 * S;
    const fdir = turn > 0.5 ? 1 : -1;
    InkFill(ctx, [
      [hx - fdir * 14 * S, hy + 12 * S], [hx - fdir * 13 * S, hy - 10 * S], [hx, hy - 14 * S],
      [hx + fdir * 13 * S, hy - 8 * S], [hx + fdir * 15 * S, hy + 4 * S], [hx + fdir * 10 * S, hy + 13 * S],
    ], "rmChHead", RC.skin, { amp: 1.2 * S, lw: 2.6 * S });
    InkFill(ctx, [
      [hx - fdir * 16 * S, hy - 6 * S], [hx - fdir * 10 * S, hy - 17 * S], [hx + fdir * 10 * S, hy - 17 * S],
      [hx + fdir * 15 * S, hy - 4 * S], [hx + fdir * 10 * S, hy - 1 * S], [hx - fdir * 12 * S, hy - 1 * S],
    ], "rmChCap", RC.puppetCap, { amp: 1.4 * S, lw: 2.2 * S });
    ctx.fillStyle = IN.ink;
    ctx.fillRect(hx + fdir * 6 * S - 2 * S, hy + 1 * S, 4.4 * S, 2.4 * S);   // 眼
    // 胳膊：凑着说话时一只手拢在嘴边；回身时手朝村里一指
    if (turn > 0.4) {
      const k = Sm((t - 4.0) / 0.5);
      InkLine(ctx, sx, sy + 8 * S, sx - 30 * S * (1 - k) - 4 * S, sy + 30 * S - 44 * S * k, "rmChPoint",
        { lw: 8 * S, color: "#4a4436", amp: 1.2 * S });
    } else if (lean > 0.3) {
      // 拢在嘴边的那只手——"交头接耳"的画面记号
      InkLine(ctx, sx + 6 * S, sy + 10 * S, hx - 10 * S, hy + 8 * S, "rmChCup", { lw: 8 * S, color: "#4a4436", amp: 1.2 * S });
      ctx.beginPath();
      ctx.ellipse(hx - 12 * S, hy + 7 * S, 5.4 * S, 4.4 * S, -0.5, 0, Math.PI * 2);
      ctx.fillStyle = RC.skinDark;
      ctx.fill();
      ctx.strokeStyle = IN.ink; ctx.lineWidth = 1.6 * S; ctx.stroke();
    } else {
      InkLine(ctx, sx, sy + 8 * S, px - 6 * S + step * S * 0.5, gyS - hgt * 0.42 * S, "rmChArm", { lw: 8 * S, color: "#4a4436", amp: 1.2 * S });
    }
  };

  // ---- 组装（后景先画） ------------------------------------------------------
  JpRank(-430, 302, 58, "rmJp2");
  JpRank(-322, 308, 70, "rmJp1");
  JpRank(-212, 316, 84, "rmJp0");
  Moto();
  Chief();
  // 开道的伪军：两个近景大脸（seg0 的起手画面）+ 两个押在半道的
  FrontPuppet(258, 332, 116, "rmPupD");
  FrontPuppet(334, 336, 124, "rmPupE");
  FrontPuppet(575, 366, 214, "rmPupA", { walk: t * 6.4, drift: t * 13 });
  FrontPuppet(668, 352, 186, "rmPupB", { walk: t * 6.4 + 2.2, drift: t * 13 });

  // 脚下的浮尘
  Speckle(ctx, 0, (GY - 10) * S, W, H - (GY - 12) * S, "rmDust", { count: 46, alpha: 0.12, size: 3 * S, color: "#2e2820" });

  // ---- 冷罩 + 重角晕：这一镜就是"天阴下来"本身 ------------------------------
  ctx.fillStyle = "rgba(13,17,30,0.19)";
  ctx.fillRect(0, 0, W, H);
  const v = ctx.createRadialGradient(W / 2, H * 0.52, H * 0.24, W / 2, H * 0.52, H * 0.86);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(8,9,14,0.72)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  Speckle(ctx, 0, 0, W, H, "rmGrain", { count: Math.round(W / 6), alpha: 0.06, size: 2.2 });
}

// ---------------------------------------------------------------------------
// 序·那天：镜头贴着娘身侧扫过的那一眼（c1_thatday，seg 0，3.4s）。
// 画面主体是**蓝底白花短褂的衣身侧面**——布占满画框三分之二，左侧留一线
// 暗背景（土墙+门洞的模糊剪影）。这一眼是全章那块布的第一面：
// 坛口的垫圈、窖里的整布、袖口那截接布，认的都是它。
// 衣角被风掀起又落下（0.8Hz），除此之外什么都不动——它就是一眼。
// ---------------------------------------------------------------------------
export function DrawMotherJacketCard(ctx, W, H, seg, t) {
  const S = H / 420;
  // ── seg 1（八稿）：从窖底仰看翻板——板缝里最后消失的是娘那截蓝底白花的
  // 袖子。三根板条压着画框，缝里透一点天光；袖子在缝后头往东抽走，抽尽了
  // 只剩缝里的光 ──
  if (seg === 1) {
    ctx.fillStyle = "#050607";
    ctx.fillRect(0, 0, W, H);
    const gaps = [H * 0.30, H * 0.52, H * 0.74];
    const gapH = H * 0.055;
    const slide = Math.min(1, t / 2.6);                     // 袖子抽走的进度
    // 缝里的天光（袖子走过的地方才透出来）
    for (const gy of gaps) {
      const lg = ctx.createLinearGradient(0, gy, 0, gy + gapH);
      lg.addColorStop(0, "rgba(150,158,148,0.30)");
      lg.addColorStop(0.5, "rgba(196,200,186,0.44)");
      lg.addColorStop(1, "rgba(120,126,118,0.26)");
      ctx.fillStyle = lg;
      ctx.fillRect(0, gy, W, gapH);
    }
    // 袖子：蓝底白花的一截，在中缝后头，往画右（娘起身的方向）抽走
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, gaps[1] - H * 0.02, W, gapH + H * 0.04);
    ctx.clip();
    const sx = W * (0.30 + slide * 0.85);
    InkFill(ctx, [
      [sx - W * 0.26, gaps[1] + gapH * 1.1], [sx + W * 0.06, gaps[1] - gapH * 0.4],
      [sx + W * 0.15, gaps[1] + gapH * 0.2], [sx - W * 0.16, gaps[1] + gapH * 1.7],
    ], "mjSlv", "#232c38", { amp: 3 * S, lw: 3.4 * S, shade: "rgba(0,0,0,0.3)" });
    ctx.fillStyle = "rgba(186,194,206,0.5)";
    for (let i = 0; i < 5; i += 1) {
      const bx = sx - W * 0.2 + Hash("mjSlvB" + i) * W * 0.3;
      const by = gaps[1] + gapH * (0.1 + Hash("mjSlvBy" + i) * 0.9);
      for (let p2 = 0; p2 < 3; p2 += 1) {
        ctx.beginPath();
        ctx.ellipse(bx + Math.cos(p2 * 2.1) * 3 * S, by + Math.sin(p2 * 2.1) * 2.2 * S,
          1.8 * S, 1.3 * S, p2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    // 板条：缝之外全是木板的黑，几道木纹
    ctx.fillStyle = "#0d0a07";
    let prev = 0;
    for (const gy of gaps) {
      ctx.fillRect(0, prev, W, gy - prev);
      prev = gy + gapH;
    }
    ctx.fillRect(0, prev, W, H - prev);
    ctx.save();
    ctx.strokeStyle = "rgba(70,56,38,0.35)";
    ctx.lineWidth = 2 * S;
    for (let i = 0; i < 6; i += 1) {
      const wy = H * (0.06 + i * 0.16) + Sym("mjSlat", i, 6 * S);
      ctx.beginPath();
      ctx.moveTo(-10 * S, wy);
      ctx.quadraticCurveTo(W * 0.5, wy + Sym("mjSlatQ", i, 5 * S), W + 10 * S, wy - 2 * S);
      ctx.stroke();
    }
    ctx.restore();
    // 落灰：翻板刚合上，缝里簌簌掉一点
    ctx.save();
    ctx.fillStyle = "rgba(168,152,128,0.4)";
    for (let i = 0; i < 6; i += 1) {
      const dx = W * Hash("mjDustX" + i);
      const dy = gaps[i % 3] + gapH + ((t * 40 * S + i * 30 * S) % (H * 0.16));
      ctx.beginPath();
      ctx.arc(dx, dy, 1.4 * S, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }
  // 底：屋里的昏暗（她是冲进屋来的）
  const bg = ctx.createLinearGradient(0, 0, W, 0);
  bg.addColorStop(0, "#12100b");
  bg.addColorStop(0.4, "#1a1610");
  bg.addColorStop(1, "#0d0b08");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // 左侧一线暗背景：土墙的暗剪影。原来这里叠了一摞"门洞焦外"的半透明棕色
  // 矩形，实拍读成一块不明棕色块（首轮退回）——裁掉，换成压进背景的暗墙，
  // 门外的白天只由衣身左棱那道冷光交代
  InkFill(ctx, [[-20 * S, -20 * S], [W * 0.30, -20 * S], [W * 0.27, H + 20 * S], [-20 * S, H + 20 * S]],
    "mjWall", "#1a1510", { amp: 6 * S, lw: 0, line: null });
  // 镜头扫过的那点动感：两三道横向的虚痕
  ctx.save();
  ctx.globalAlpha = 0.10;
  ctx.strokeStyle = "#8a8474";
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i += 1) {
    ctx.lineWidth = (3 + i * 2) * S;
    ctx.beginPath();
    ctx.moveTo(W * 0.02, H * (0.24 + i * 0.26));
    ctx.lineTo(W * 0.30, H * (0.235 + i * 0.26));
    ctx.stroke();
  }
  ctx.restore();

  // ── 衣身侧面：从右侧压满画框三分之二。靛蓝土布，压两档 ──
  const sway = Math.sin(t * Math.PI * 2 * 0.8);            // 0.8Hz：掀起又落下
  const flut = Math.sin(t * Math.PI * 2 * 0.8 * 2.7 + 1.2); // 布自己的碎颤
  const hemY = H * 0.845 - sway * 14 * S - flut * 4 * S;
  const hemY2 = H * 0.80 - sway * 26 * S - flut * 7 * S;   // 衣角那一片掀得更高
  const bodyPts = [
    [W * 0.335, -24 * S], [W + 30 * S, -24 * S], [W + 30 * S, H * 0.72],
    [W * 0.96, hemY - 8 * S], [W * 0.82, hemY + 10 * S], [W * 0.70, hemY - 4 * S],
    [W * 0.565, hemY2 + 16 * S], [W * 0.475, hemY2],        // 掀起的衣角
    [W * 0.40, hemY2 + 30 * S], [W * 0.345, H * 0.60],
  ];
  InkFill(ctx, bodyPts, "mjBody", "#232c38",
    { amp: 5 * S, lw: 7 * S, shade: "rgba(6,9,14,0.4)", shadeAt: 0.7 });
  // 布身的大褶：顺着身侧往下走的几道长弧（衣角那两道跟着风摆）
  ctx.save();
  ctx.strokeStyle = "rgba(10,14,20,0.55)";
  ctx.lineCap = "round";
  for (let i = 0; i < 5; i += 1) {
    const fx = W * (0.43 + i * 0.115);
    const swayK = i < 2 ? sway * (18 - i * 7) * S : sway * 3 * S;
    ctx.lineWidth = (4.5 - i * 0.5) * S;
    ctx.beginPath();
    ctx.moveTo(fx + 14 * S, -10 * S);
    ctx.quadraticCurveTo(fx - 10 * S + Sym("mjFold", i, 12 * S), H * 0.46,
      fx + swayK, hemY - (i % 2) * 30 * S);
    ctx.stroke();
  }
  ctx.restore();

  // ── 白花：满布的碎花纹样——布织出来就带着花，先于一切"缝上去"的东西。
  // 近似网格挂簇、按 hash 空掉两三成格子：疏密有致，但不排成印刷体的阵。
  // 裁进衣身轮廓里（花长在布上，不许飘到背景上） ──
  ctx.save();
  WobblyPath(ctx, bodyPts, "mjBody", 5 * S, true);
  ctx.clip();
  for (let gx = 0; gx < 6; gx += 1) {
    for (let gy = 0; gy < 5; gy += 1) {
      if (Hash("mjBloomG" + gx + "_" + gy) < 0.26) continue;   // 疏的那几处
      const bx = W * (0.355 + (gx + 0.15 + Hash("mjBloomX" + gx + "_" + gy) * 0.7) * 0.108);
      const by = H * ((gy + 0.15 + Hash("mjBloomY" + gx + "_" + gy) * 0.7) * 0.186)
        + (bx < W * 0.6 ? sway * 6 * S : 0);
      const sc = 0.7 + Hash("mjBloomS" + gx + "_" + gy) * 0.55;
      ctx.fillStyle = `rgba(186,194,206,${0.36 + Hash("mjBloomA" + gx + "_" + gy) * 0.14})`;
      for (let p2 = 0; p2 < 4; p2 += 1) {
        const pa = (p2 / 4) * Math.PI * 2 + Hash("mjBloomP" + gx + "_" + gy) * 2;
        ctx.beginPath();
        ctx.ellipse(bx + Math.cos(pa) * 4.6 * sc * S, by + Math.sin(pa) * 3.4 * sc * S,
          2.8 * sc * S, 2.0 * sc * S, pa, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(140,150,164,0.4)";
      ctx.beginPath();
      ctx.arc(bx, by, 1.6 * sc * S, 0, Math.PI * 2);
      ctx.fill();
      // 簇边上的散点：一两粒小花骨朵，碎花才不成波点
      if (Hash("mjBloomD" + gx + "_" + gy) > 0.4) {
        ctx.fillStyle = "rgba(186,194,206,0.32)";
        ctx.beginPath();
        ctx.arc(bx + Sym("mjBloomDx" + gx, gy, 13 * S), by + Sym("mjBloomDy" + gx, gy, 10 * S),
          1.3 * S, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();

  // ── 衣着的结构件：读出"短褂"靠这几样——领缘、斜襟的襟线、盘扣襻。
  // 她冲进屋朝画面左，衣身左沿就是她的前襟 ──
  // 领缘：脖根那一圈的下段从画框顶探进来（人比画框高，领口在框外）
  InkFill(ctx, [[W * 0.435, -8 * S], [W * 0.565, -10 * S], [W * 0.578, H * 0.052],
    [W * 0.50, H * 0.074], [W * 0.446, H * 0.048]],
  "mjCollar", "#2c3644", { amp: 3 * S, lw: 4 * S, line: "rgba(8,12,18,0.85)", shade: "rgba(0,0,0,0.2)" });
  // 斜襟：从领根斜下来、再顺着身侧垂到下摆的那条缘边——先垫一道宽的缘条
  //（缝上去的贴边布，比衣身浅半档），再描墨线
  const lapEnd = [W * 0.372 + sway * 4 * S, hemY2 + 10 * S];
  const LapPath = () => {
    ctx.beginPath();
    ctx.moveTo(W * 0.452, H * 0.055);
    ctx.quadraticCurveTo(W * 0.398, H * 0.105, W * 0.378, H * 0.20);
    ctx.quadraticCurveTo(W * 0.360, H * 0.36, W * 0.362, H * 0.52);
    ctx.quadraticCurveTo(W * 0.364, H * 0.66, lapEnd[0], lapEnd[1]);
  };
  ctx.save();
  ctx.lineCap = "round";
  LapPath();
  ctx.strokeStyle = "#2c3542";
  ctx.lineWidth = 9 * S;
  ctx.stroke();
  LapPath();
  ctx.strokeStyle = "rgba(8,12,18,0.8)";
  ctx.lineWidth = 3 * S;
  ctx.stroke();
  ctx.restore();
  // 盘扣襻：襟线上三对布纽——一颗结球 + 两道伸向衣身的小环
  const Frog = (fx2, fy2, i2) => {
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = "#46536b";
    ctx.lineWidth = 2.6 * S;
    ctx.beginPath();
    ctx.moveTo(fx2, fy2);
    ctx.quadraticCurveTo(fx2 + 9 * S, fy2 - 4 * S + Sym("mjFrog" + i2, 0, 2 * S), fx2 + 15 * S, fy2 - 1 * S);
    ctx.moveTo(fx2, fy2 + 1.6 * S);
    ctx.quadraticCurveTo(fx2 + 8 * S, fy2 + 5 * S, fx2 + 14 * S, fy2 + 3.2 * S);
    ctx.stroke();
    ctx.fillStyle = "#5a6880";
    ctx.beginPath();
    ctx.arc(fx2 + 2.4 * S, fy2 + 0.6 * S, 2.6 * S, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(150,160,176,0.5)";
    ctx.lineWidth = 1 * S;
    ctx.beginPath();
    ctx.arc(fx2 + 2.4 * S, fy2 + 0.6 * S, 2.6 * S, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  };
  Frog(W * 0.381, H * 0.165, 0);
  Frog(W * 0.363, H * 0.335, 1);
  Frog(W * 0.361, H * 0.505, 2);

  // ── 补丁摞补丁：三块，一块压着一块的边（粗针脚绕一圈）——补丁盖在花上，
  // 打补丁本来就在织花裁衣之后 ──
  const Patch = (px, py, pw, ph, col, id2, ang = 0) => {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    InkFill(ctx, [[-pw / 2, -ph / 2], [pw / 2, -ph / 2 + 3 * S], [pw / 2 - 2 * S, ph / 2],
      [-pw / 2 + 3 * S, ph / 2 - 2 * S]],
    id2, col, { amp: 3 * S, lw: 4.5 * S, shade: "rgba(0,0,0,0.2)" });
    // 粗针脚：一针大一针小的虚线绕边
    ctx.strokeStyle = "rgba(178,170,150,0.6)";
    ctx.lineWidth = 2.2 * S;
    let acc = 0;
    const per = [[-pw / 2, -ph / 2], [pw / 2, -ph / 2], [pw / 2, ph / 2], [-pw / 2, ph / 2], [-pw / 2, -ph / 2]];
    for (let e = 0; e < 4; e += 1) {
      const [ax, ay] = per[e], [bx, by] = per[e + 1];
      const eLen = Math.hypot(bx - ax, by - ay);
      let d = 4 * S;
      while (d < eLen - 4 * S) {
        const st = 4 * S + Hash(id2 + "st" + e + Math.round(acc + d)) * 7 * S;
        const k0 = d / eLen, k1 = Math.min(1, (d + st * 0.55) / eLen);
        ctx.beginPath();
        ctx.moveTo(ax + (bx - ax) * k0 + 4 * S, ay + (by - ay) * k0 + 3 * S);
        ctx.lineTo(ax + (bx - ax) * k1 + 4 * S, ay + (by - ay) * k1 + 3 * S);
        ctx.stroke();
        d += st * 1.7;
      }
      acc += eLen;
    }
    ctx.restore();
  };
  Patch(W * 0.60, H * 0.40, W * 0.145, H * 0.20, "#2b3542", "mjPatchA", 0.05);
  Patch(W * 0.645, H * 0.475, W * 0.105, H * 0.15, "#1c232d", "mjPatchB", -0.08);
  Patch(W * 0.795, H * 0.62, W * 0.12, H * 0.16, "#3b3a2e", "mjPatchC", 0.10);

  // 受光的那道侧棱：门洞方向来的一线冷光（打在前襟上，压过缘条）
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = "#5a6a80";
  ctx.lineWidth = 5 * S;
  ctx.beginPath();
  ctx.moveTo(W * 0.355, 0);
  ctx.quadraticCurveTo(W * 0.335, H * 0.44, W * 0.40, hemY2 + 26 * S);
  ctx.stroke();
  ctx.restore();
  // 衣角底下透出的一线里子（掀起来那一下才看得见）
  if (sway > 0.2) {
    ctx.save();
    ctx.globalAlpha = (sway - 0.2) * 0.8;
    InkFill(ctx, [[W * 0.475, hemY2], [W * 0.565, hemY2 + 16 * S],
      [W * 0.545, hemY2 + 34 * S], [W * 0.465, hemY2 + 22 * S]],
    "mjLining", "#171d26", { amp: 3 * S, lw: 0, line: null });
    ctx.restore();
  }

  // 冷罩 + 角晕 + 颗粒（同定格卡一族的收尾）
  ctx.fillStyle = "rgba(13,17,30,0.14)";
  ctx.fillRect(0, 0, W, H);
  const v = ctx.createRadialGradient(W * 0.56, H * 0.5, H * 0.26, W * 0.56, H * 0.5, H * 0.9);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(8,9,14,0.68)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  Speckle(ctx, 0, 0, W, H, "mjGrain", { count: Math.round(W / 6), alpha: 0.06, size: 2.2 });
}

// ---------------------------------------------------------------------------
// 回程·两个骑车的（c1_riders，三段）。参照 DrawRaidMotoCard 的构图：
// S=H/420、地平线、村口土路、冷罩+角晕+颗粒。侧视——两个伪军（软布帽、
// 无帽垂、胯后挎包、土布裤脚布鞋，见 UNIFORM）骑自行车。
//   seg 0  从右（北）骑进画面：前车捏闸停住、一只脚点地；后车跟着停
//   seg 1  支着腿不下车，朝村里（画面左）望；远景左侧两三间塌了房顶的房
//   seg 2  调头骑远（往右出画）。车铃那一声是音效的事，画面不管
// 骑车的人身下要有车、踩踏板的脚（CLAUDE.md 过场插卡那条）：屁股在鞍上、
// 腿在踏板上（膝盖随踏板转）、手在把上，人绝不许浮在车上。
// ---------------------------------------------------------------------------
export function DrawVillageRidersCard(ctx, W, H, seg, t) {
  const S = H / 420;
  const C01 = (x) => Math.max(0, Math.min(1, x));
  const Sm = (x) => { const k = C01(x); return k * k * (3 - 2 * k); };
  const GY = 356, HY = 208;
  const PX = (u) => W / 2 + u * S;
  const RC = {
    ground: "#57503c", road: "#6b6148", rut: "#4a4434",
    // 裤腿提亮两档到土布色（首轮退回：裤腿/脚跟车、地几乎同明度，
    // 人腿糊进车架里）；远侧那条腿仍暗一档，前后才分得开
    coat: "#5d5744", trouser: "#7d7258", trouserFar: "#57503f",
    cap: "#36322a", shoe: "#2e2721",
    skin: "#bb9066", bike: "#232a30", bikeDark: "#1c2126",
  };

  // 天：阴而不压（他们没进村——这一镜是"望了一眼就走"）
  const sky = ctx.createLinearGradient(0, 0, 0, HY * S * 1.14);
  sky.addColorStop(0, "#3a4048");
  sky.addColorStop(0.7, "#565448");
  sky.addColorStop(1, "#66604e");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, HY * S * 1.16);
  ctx.fillStyle = RC.ground;
  ctx.fillRect(0, HY * S, W, H - HY * S);
  // 村口土路：从右边（北）拐进来的一条浅色带
  InkFill(ctx, [[W + 30 * S, (GY - 40) * S], [PX(-160), (HY + 26) * S], [PX(-330), (HY + 30) * S],
    [PX(-100), (GY + 10) * S], [W + 30 * S, (GY + 26) * S]],
  "vrRoad", RC.road, { amp: 3 * S, lw: 0, line: null });
  // 车辙两道
  for (let i = 0; i < 2; i += 1) {
    ctx.save();
    ctx.strokeStyle = RC.rut;
    ctx.lineWidth = (3.4 - i) * S;
    ctx.beginPath();
    ctx.moveTo(W + 20 * S, (GY - 16 + i * 14) * S);
    ctx.quadraticCurveTo(PX(120), (GY - 44 + i * 10) * S, PX(-230), (HY + 30 + i * 4) * S);
    ctx.stroke();
    ctx.restore();
  }
  // 远景左侧：村东头两三间**塌了房顶**的房剪影（望的就是它们）
  ctx.save();
  ctx.globalAlpha = 0.82;
  const Ruin = (u, w2, h2, id2) => {
    const bx = PX(u), by = (HY + 12) * S;
    // 山墙还立着，房顶塌成一个往里凹的口，一两根焦椽戳出来
    InkFill(ctx, [
      [bx - w2 * S, by], [bx - w2 * S, by - h2 * S],
      [bx - w2 * 0.55 * S, by - (h2 + 9) * S],
      [bx - w2 * 0.2 * S, by - h2 * 0.52 * S],       // 塌进去的口
      [bx + w2 * 0.3 * S, by - h2 * 0.72 * S],
      [bx + w2 * 0.62 * S, by - (h2 + 5) * S],
      [bx + w2 * S, by - h2 * 0.7 * S], [bx + w2 * S, by],
    ], id2, "#28251c", { amp: 2 * S, lw: 0, line: null });
    InkLine(ctx, bx - w2 * 0.3 * S, by - h2 * 0.5 * S, bx - w2 * 0.05 * S, by - (h2 + 13) * S,
      id2 + "beam", { lw: 2 * S, color: "#1d1b14", amp: 1 * S });
  };
  // 可见半宽只有 ±373u（W/2 ÷ S）——房子要真在画框左缘里，别按写着痛快的
  // 大数摆到画外（raidMoto 那张有横摇兜底，这张没有）
  Ruin(-330, 42, 40, "vrRuinA");
  Ruin(-240, 34, 32, "vrRuinB");
  Ruin(-170, 26, 36, "vrRuinC");
  ctx.restore();
  // 贴地的灰雾把村子那头虚掉
  const fog = ctx.createLinearGradient(PX(-420), 0, PX(-80), 0);
  fog.addColorStop(0, "rgba(88,86,76,0.55)");
  fog.addColorStop(1, "rgba(88,86,76,0)");
  ctx.fillStyle = fog;
  ctx.fillRect(0, (HY - 50) * S, W, (GY - HY + 60) * S);

  // ── 一人一车（侧视）。u=后轮触地点的场景坐标；dir=+1 车头朝左（朝村） ──
  // wheelA 驱动辐条转、pedK 驱动踏板与膝盖；footDown 前脚落地撑着
  const Rider = (u, gy, id2, { dir = 1, wheelA = 0, footDown = 0, lookBack = 0, shrug = 0, turn = 0 }) => {
    ctx.save();
    ctx.translate(PX(u), gy * S);
    // 画笔按"车头朝 -x"画（同 DrawBicycle）：dir=+1 车头朝画面左（朝村）。
    // turn ∈ 0..1 是**画面里的调头**：横向压扁再反着张开（车身先横过来又
    // 转过去的那一挤），压到 0.25 为止不许消失——seg2 的调头原来发生在
    // 两行之间，画面上只剩一格跳变
    const flip = Math.cos(Math.max(0, Math.min(1, turn)) * Math.PI);
    const sx = (flip >= 0 ? 1 : -1) * Math.max(0.25, Math.abs(flip));
    ctx.scale(dir * sx, 1);
    const K = 1.35 * S;                  // 卡内尺度：车轮半径 ≈0.31m → 20u
    const r = 15 * K, y = -r;
    const fx = -25 * K, bx = 25 * K;
    const Wheel = (wx) => {
      ctx.strokeStyle = IN.ink;
      ctx.lineWidth = 3 * K;
      ctx.beginPath(); ctx.arc(wx, y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1 * K;
      ctx.strokeStyle = "rgba(40,40,40,0.7)";
      for (let s2 = 0; s2 < 6; s2 += 1) {
        const a = s2 * 0.52 + wheelA;
        ctx.beginPath();
        ctx.moveTo(wx - Math.cos(a) * (r - 2 * K), y - Math.sin(a) * (r - 2 * K));
        ctx.lineTo(wx + Math.cos(a) * (r - 2 * K), y + Math.sin(a) * (r - 2 * K));
        ctx.stroke();
      }
      ctx.strokeStyle = IN.ink;
      ctx.lineWidth = 2 * K;
      ctx.beginPath(); ctx.arc(wx, y, 2.4 * K, 0, Math.PI * 2); ctx.stroke();
    };
    Wheel(fx); Wheel(bx);
    // 挡泥板
    ctx.strokeStyle = "#39424a";
    ctx.lineWidth = 3.4 * K;
    ctx.beginPath(); ctx.arc(fx, y, r + 2.6 * K, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    ctx.beginPath(); ctx.arc(bx, y, r + 2.6 * K, Math.PI * 1.2, Math.PI * 1.95); ctx.stroke();
    // 车架
    const seatX = 9 * K, seatY = y - 22 * K;
    const headX = -19 * K, headY = y - 21 * K;
    const crankX = 2 * K, crankY = y - 2 * K;
    for (const [x1, y1, x2, y2] of [
      [headX, headY, fx, y], [headX, headY, crankX, crankY],
      [headX, headY - 1 * K, seatX, seatY + 3 * K], [seatX, seatY, crankX, crankY],
      [seatX, seatY + 2 * K, bx, y], [crankX, crankY, bx, y],
    ]) {
      InkLine(ctx, x1, y1, x2, y2, id2 + "f" + Math.round(x1 + y2), { lw: 2.8 * K, color: RC.bike, amp: 0.4 * K });
    }
    // 车把与座
    InkLine(ctx, headX, headY, headX - 6 * K, headY - 7 * K, id2 + "stem", { lw: 2.6 * K, color: RC.bike, amp: 0.3 * K });
    InkLine(ctx, headX - 6 * K, headY - 7 * K, headX - 12 * K, headY - 4 * K, id2 + "bar", { lw: 3 * K, color: RC.bikeDark, amp: 0.3 * K });
    InkFill(ctx, [[seatX - 6 * K, seatY - 3 * K], [seatX + 6 * K, seatY - 3 * K], [seatX + 4 * K, seatY], [seatX - 4 * K, seatY]],
      id2 + "saddle", "#3a2e22", { lw: 1.6 * K, amp: 0.4 * K });
    // 后货架 + 胯后那只挎包（伪军的记号）
    InkFill(ctx, Rect(bx - 12 * K, y - r - 4 * K, 22 * K, 3.4 * K), id2 + "rack", "#4a4038", { lw: 1.6 * K, amp: 0.5 * K });
    InkFill(ctx, [[seatX + 7 * K, seatY + 6 * K], [seatX + 18 * K, seatY + 7 * K],
      [seatX + 17 * K, seatY + 19 * K], [seatX + 6 * K, seatY + 17 * K]],
    id2 + "satchel", "#3f382c", { amp: 1.2 * K, lw: 2 * K, shade: "rgba(0,0,0,0.24)" });
    // 踏板曲柄：随 wheelA 转（同一根链条，不另立相位）
    const pedA = wheelA * 0.5;
    const pedR = 6.5 * K;
    const pedal = (s2) => [crankX + Math.cos(pedA + s2 * Math.PI) * pedR,
      crankY + Math.sin(pedA + s2 * Math.PI) * pedR];
    const [pAx, pAy] = pedal(0);          // 近侧踏板
    const [pBx, pBy] = pedal(1);          // 远侧
    InkLine(ctx, crankX, crankY, pBx, pBy, id2 + "crankB", { lw: 2 * K, color: "rgba(28,33,38,0.5)", amp: 0.3 * K });
    // ── 人（先远侧腿，再车身侧的近侧腿压上来） ──
    const hipX = seatX - 1 * K, hipY = seatY - 2 * K;
    const shoY = hipY - 26 * K + shrug * -3.5 * K;
    const shoX = hipX - 14 * K;
    const Leg = (px2, py2, col, lw2, ground2) => {
      // 两节腿：髋→膝→踏板（膝盖角度随踏板走）；ground2=这只脚点地撑着
      const tx2 = ground2 ? fx + 6 * K : px2;
      const ty2 = ground2 ? -1 * K : py2;
      const mx2 = (hipX + tx2) / 2 - 7 * K, my2 = (hipY + ty2) / 2 - 3 * K;
      InkLine(ctx, hipX, hipY, mx2, my2, id2 + "thigh" + col, { lw: lw2, color: col, amp: 0.6 * K });
      InkLine(ctx, mx2, my2, tx2, ty2, id2 + "shin" + col, { lw: lw2 * 0.85, color: col, amp: 0.6 * K });
      // 布鞋踩在踏板/地上
      InkFill(ctx, [[tx2 - 4.5 * K, ty2 - 2.4 * K], [tx2 + 4 * K, ty2 - 2.6 * K],
        [tx2 + 5 * K, ty2 + 0.6 * K], [tx2 - 4 * K, ty2 + 0.8 * K]],
      id2 + "shoe" + col + Math.round(tx2), RC.shoe, { amp: 0.6 * K, lw: 1.4 * K });
      // 点地那只脚给亮鞋帮：深鞋压在深地上，就靠这一线认出"脚踩着地"
      if (ground2) {
        InkLine(ctx, tx2 - 3.8 * K, ty2 - 2.1 * K, tx2 + 3.6 * K, ty2 - 2.3 * K,
          id2 + "shoeTop" + col, { lw: 1.1 * K, color: "rgba(196,182,148,0.7)", amp: 0.3 * K });
      }
    };
    Leg(pBx, pBy, RC.trouserFar, 6 * K, false);
    // 躯干：微微前倾压着车把
    InkFill(ctx, [
      [hipX - 8 * K, hipY + 4 * K], [hipX + 8 * K, hipY + 2 * K],
      [shoX + 10 * K, shoY], [shoX - 8 * K, shoY + 3 * K],
    ], id2 + "torso", RC.coat, { amp: 1.6 * K, lw: 2.6 * K, shade: "rgba(0,0,0,0.2)" });
    // 近侧腿（压在车架上）：footDown 时伸直点地
    Leg(pAx, pAy, RC.trouser, 7 * K, footDown > 0.5);
    // 裤脚扎口那一道（土布裤脚——伪军穿的是村民的腿）：裤腿提亮之后
    // 这道改压深，亮边叠亮裤只会糊掉
    InkLine(ctx, hipX - 2 * K, hipY + 14 * K, hipX + 3 * K, hipY + 15 * K, id2 + "cuff",
      { lw: 2 * K, color: "rgba(58,50,36,0.55)", amp: 0.4 * K });
    // 两臂伸向车把
    InkLine(ctx, shoX + 2 * K, shoY + 4 * K, headX - 8 * K, headY - 5 * K, id2 + "armF",
      { lw: 5.5 * K, color: RC.coat, amp: 0.8 * K });
    // 头：软布帽、没有帽垂。lookBack>0 时扭头朝后（跟后车说话）
    const hx = shoX + lookBack * 10 * K, hy = shoY - 11 * K;
    const fdir2 = 1 - lookBack * 2;       // 1=朝前（车头方向），-1=扭向后
    InkFill(ctx, [
      [hx - fdir2 * 8 * K, hy + 7 * K], [hx - fdir2 * 7.5 * K, hy - 5 * K], [hx, hy - 8 * K],
      [hx + fdir2 * 7.5 * K, hy - 4.6 * K], [hx + fdir2 * 8.6 * K, hy + 2 * K], [hx + fdir2 * 5.6 * K, hy + 7.6 * K],
    ], id2 + "head", RC.skin, { amp: 0.9 * K, lw: 2 * K });
    InkFill(ctx, [
      [hx - fdir2 * 9.2 * K, hy - 3.4 * K], [hx - fdir2 * 6 * K, hy - 9.6 * K], [hx + fdir2 * 6 * K, hy - 9.8 * K],
      [hx + fdir2 * 8.6 * K, hy - 2.4 * K], [hx + fdir2 * 5.6 * K, hy - 0.6 * K], [hx - fdir2 * 7 * K, hy - 0.6 * K],
    ], id2 + "cap", RC.cap, { amp: 1 * K, lw: 1.8 * K });
    ctx.fillStyle = IN.ink;
    ctx.fillRect(hx + fdir2 * 3 * K - 1.4 * K, hy - 0.2 * K, 2.8 * K, 1.6 * K);   // 眼
    ctx.restore();
  };

  // ── 三段的走位 ──
  let uF = 40, uB = 190, wA = 0, wB = 0, fdF = 1, fdB = 1, shr = 0, tkF = 0, tkB = 0;
  const dir = 1;
  if (seg === 0) {
    // 从右骑进来：前车先到村口捏闸，后车跟着停
    const kF = Sm((t - 0.1) / 3.3), kB = Sm((t - 0.45) / 3.5);
    uF = 620 - 580 * kF;
    uB = 830 - 640 * kB;
    wA = (620 - uF) / 20;                 // 轮转随路走（半径 20u）
    wB = (830 - uB) / 20;
    fdF = Sm((t - 3.3) / 0.5);
    fdB = Sm((t - 3.9) / 0.5);
  } else if (seg === 1) {
    // 支着腿望村里：头/视线一直朝画面**左**——塌顶房就在左侧远景，望的
    // 与被望的同侧（首轮退回：说话那下扭头朝右，把"望村"望反了）。
    // "说了句什么/笑了一下"只交给后车那人的肩一耸
    shr = Math.sin(C01((t - 2.3) / 0.8) * Math.PI);
  } else {
    // 调头骑远（行长 4.2s）：前 1s 调头动作在画面里做完（turn 压扁反张），
    // 之后才加速渐远——t≤3.5 两个骑手都还在画框里（可见半宽 ±373u），
    // 出画交给最后那 0.7s 和下一行的切镜。首轮退回：t=1.8 就已空镜
    tkF = Sm(t / 1.0);
    tkB = Sm((t - 0.35) / 1.0);
    const rideF = C01((t - 1.0) / 2.9);
    const rideB = C01((t - 1.35) / 2.6);
    uF = 40 + tkF * 16 + rideF * rideF * 330;    // t=3.5 时 ≈312，整车还在框内
    uB = 190 + tkB * 14 + rideB * rideB * 230;   // t=3.5 时 ≈361，压着框边
    wA = -(uF - 40) / 20;                        // 朝右走，辐条反着转
    wB = -(uB - 190) / 20;
    fdF = 1 - Sm((t - 1.0) / 0.5);               // 调完头脚才离地
    fdB = 1 - Sm((t - 1.35) / 0.5);
  }
  // 车轮下的路面接触（画在人车底下）：每只轮一摊淡影椭圆 + 顺着来路拖出去
  // 的车辙线——没有这一层，轮子是浮在路皮上的
  const KC = 1.35 * S;
  const trail = seg === 2 ? -1 : 1;              // seg0/1 来路在右，seg2 往右走、辙拖在左
  for (const [uu, gy, id2] of [[uB, GY - 2, "vrB"], [uF, GY + 4, "vrF"]]) {
    for (const sd of [-1, 1]) {
      const wx = PX(uu) + sd * 25 * KC;
      const wy = (gy + 1.2) * S;
      ctx.save();
      ctx.fillStyle = "rgba(18,14,8,0.28)";
      ctx.beginPath();
      ctx.ellipse(wx, wy, 12 * S, 2.8 * S, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      InkLine(ctx, wx, wy + 0.8 * S, wx + trail * 52 * S,
        wy + 1.6 * S + Sym(id2 + "rutd" + sd, 0, 1.6 * S),
        id2 + "rut" + sd, { lw: 1.9 * S, color: "rgba(56,49,36,0.5)", amp: 1.4 * S });
    }
  }
  // 后车画在前（略远），前车压上来
  Rider(uB, GY - 2, "vrB", { dir, wheelA: wB, footDown: fdB, lookBack: 0, shrug: shr, turn: tkB });
  Rider(uF, GY + 4, "vrF", { dir, wheelA: wA, footDown: fdF, lookBack: 0, shrug: 0, turn: tkF });
  // 脚下浮尘
  Speckle(ctx, 0, (GY - 8) * S, W, H - (GY - 10) * S, "vrDust", { count: 36, alpha: 0.10, size: 3 * S, color: "#2e2820" });

  // 冷罩 + 角晕 + 颗粒（同 raidMoto 一族，浅一档——他们只是路过）
  ctx.fillStyle = "rgba(13,17,30,0.12)";
  ctx.fillRect(0, 0, W, H);
  const v = ctx.createRadialGradient(W / 2, H * 0.52, H * 0.26, W / 2, H * 0.52, H * 0.88);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(8,9,14,0.6)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  Speckle(ctx, 0, 0, W, H, "vrGrain", { count: Math.round(W / 6), alpha: 0.06, size: 2.2 });
}

// ---------------------------------------------------------------------------
// 夜窖·整布（c1 夜里下窖那一眼，seg 0，4.2s）：一双少年的手捧着**对折的
// 整幅蓝底白花布**——没下过剪子（布边是织边，没有裁口）。三四条从窖口板缝
// 漏下的斜月光条打在布面上：光条里布纹与小白花清清楚楚，光条外几乎沉进黑里。
// 夜里色全体压得极暗（参照 FOLD 那组的账：看着像纯黑的源色才是对的）。
// ---------------------------------------------------------------------------
export function DrawWholeClothCard(ctx, W, H, seg, t) {
  const S = H / 420;
  const br = Math.sin(t * Math.PI * 2 * 0.22) * 2.4 * S;   // 极轻的呼吸浮动
  // 底：窖的黑
  const bg = ctx.createRadialGradient(W * 0.5, H * 0.42, H * 0.1, W * 0.5, H * 0.55, H * 1.0);
  bg.addColorStop(0, "#0a0b0e");
  bg.addColorStop(1, "#040405");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 布与手整组画两遍：一遍暗的（夜里的本色），再按光条裁着画亮的那一遍。
  // bright=false 只给形；bright=true 给布纹、白花、织边——细节只活在光里
  const Cloth = (bright) => {
    const cy = H * 0.52 + br;
    // 对折的整幅布：一大片横着的厚布，垂在两手之间微微下坠
    const pts = [
      [W * 0.20, cy - H * 0.19], [W * 0.42, cy - H * 0.235], [W * 0.62, cy - H * 0.225],
      [W * 0.80, cy - H * 0.18], [W * 0.84, cy + H * 0.06], [W * 0.72, cy + H * 0.20],
      [W * 0.50, cy + H * 0.255], [W * 0.28, cy + H * 0.21], [W * 0.165, cy + H * 0.05],
    ];
    InkFill(ctx, pts, "wcBody" + (bright ? 1 : 0), bright ? "#1e2837" : "#0c1017",
      { amp: 4 * S, lw: bright ? 4 * S : 5 * S, line: "rgba(2,3,5,0.9)", shade: "rgba(0,0,0,0.3)" });
    // 对折那道口：上沿里侧一线（布是双层的）
    ctx.save();
    ctx.strokeStyle = bright ? "rgba(96,110,132,0.55)" : "rgba(30,36,46,0.6)";
    ctx.lineWidth = 3 * S;
    ctx.beginPath();
    ctx.moveTo(W * 0.22, cy - H * 0.155);
    ctx.quadraticCurveTo(W * 0.52, cy - H * 0.205, W * 0.79, cy - H * 0.15);
    ctx.stroke();
    // 垂坠的两道大褶
    ctx.strokeStyle = bright ? "rgba(10,14,20,0.7)" : "rgba(3,4,6,0.7)";
    ctx.lineWidth = 4 * S;
    for (let i = 0; i < 3; i += 1) {
      const fx = W * (0.36 + i * 0.14);
      ctx.beginPath();
      ctx.moveTo(fx, cy - H * 0.19);
      ctx.quadraticCurveTo(fx - 12 * S + Sym("wcFold", i, 10 * S), cy, fx + 6 * S, cy + H * 0.22);
      ctx.stroke();
    }
    ctx.restore();
    if (bright) {
      // 织边：下沿那条布自己织出来的边——**没有裁口**，"整幅"两个字全在这条边上
      ctx.save();
      ctx.strokeStyle = "rgba(150,160,178,0.6)";
      ctx.lineWidth = 2.6 * S;
      ctx.beginPath();
      ctx.moveTo(W * 0.19, cy + H * 0.10);
      ctx.quadraticCurveTo(W * 0.50, cy + H * 0.245, W * 0.80, cy + H * 0.12);
      ctx.stroke();
      // 织边上的小横痕：一梭一梭收的边
      ctx.lineWidth = 1.6 * S;
      ctx.strokeStyle = "rgba(150,160,178,0.4)";
      for (let i = 0; i < 15; i += 1) {
        const k = 0.21 + i * 0.04;
        const ex = W * k;
        const ey = cy + H * (0.10 + Math.sin((k - 0.19) / 0.61 * Math.PI) * 0.135);
        ctx.beginPath();
        ctx.moveTo(ex, ey - 3 * S);
        ctx.lineTo(ex + 1.5 * S, ey + 3.4 * S);
        ctx.stroke();
      }
      // 布纹：细密的横纹几道
      ctx.strokeStyle = "rgba(80,94,114,0.30)";
      ctx.lineWidth = 1.2 * S;
      for (let i = 0; i < 6; i += 1) {
        const gy2 = cy - H * 0.14 + i * H * 0.062;
        ctx.beginPath();
        ctx.moveTo(W * 0.23, gy2);
        ctx.quadraticCurveTo(W * 0.5, gy2 - 6 * S + Sym("wcWeave", i, 5 * S), W * 0.78, gy2 + 3 * S);
        ctx.stroke();
      }
      // 小白花：光条里才认得出的那一撮撮米白
      for (let i = 0; i < 14; i += 1) {
        const bx = W * (0.24 + Hash("wcBloomX" + i) * 0.52);
        const by = cy - H * 0.16 + Hash("wcBloomY" + i) * H * 0.36;
        ctx.fillStyle = "rgba(196,204,218,0.6)";
        for (let p2 = 0; p2 < 4; p2 += 1) {
          const pa = (p2 / 4) * Math.PI * 2 + Hash("wcBloomP" + i) * 2;
          ctx.beginPath();
          ctx.ellipse(bx + Math.cos(pa) * 3.4 * S, by + Math.sin(pa) * 2.6 * S,
            2.0 * S, 1.5 * S, pa, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
    // 两只捧着的手：少年的手，从下画框伸上来兜着布的两角
    for (const sd of [-1, 1]) {
      const hx = W * (0.5 + sd * 0.30), hy = cy + H * (0.02 + 0.06 * (sd > 0 ? 1 : 0.6));
      InkFill(ctx, [
        [hx - sd * 20 * S, hy + 40 * S], [hx - sd * 34 * S, hy + 200 * S],
        [hx + sd * 26 * S, hy + 210 * S], [hx + sd * 30 * S, hy + 60 * S],
      ], "wcArm" + sd + (bright ? 1 : 0), bright ? "#2e2317" : "#120d08",
      { amp: 3 * S, lw: 4 * S, shade: "rgba(0,0,0,0.3)" });
      InkFill(ctx, [
        [hx - sd * 16 * S, hy + 16 * S], [hx + sd * 2 * S, hy - 8 * S], [hx + sd * 22 * S, hy - 2 * S],
        [hx + sd * 28 * S, hy + 30 * S], [hx + sd * 4 * S, hy + 46 * S], [hx - sd * 14 * S, hy + 40 * S],
      ], "wcHand" + sd + (bright ? 1 : 0), bright ? "#4e3826" : "#1a130c",
      { amp: 2.6 * S, lw: 3.6 * S, shade: "rgba(0,0,0,0.24)" });
      // 扣在布上的指头
      for (let i = 0; i < 3; i += 1) {
        InkLine(ctx, hx + sd * (2 + i * 8) * S, hy - 2 * S, hx + sd * (5 + i * 8) * S, hy - 16 * S,
          "wcFing" + sd + i + (bright ? 1 : 0),
          { lw: 4.6 * S, color: bright ? "#4e3826" : "#1a130c", amp: 0.8 * S });
      }
    }
  };
  Cloth(false);

  // ── 板缝漏下来的斜月光条：三四条，窄的宽的。条里重画一遍亮的 ──
  const beams = [
    [0.255, 0.052], [0.415, 0.030], [0.575, 0.062], [0.76, 0.026],
  ];
  const ba = -0.42;                       // 斜率：从右上漏向左下
  for (let i = 0; i < beams.length; i += 1) {
    const [bu, bw] = beams[i];
    const x0 = W * bu, w2 = W * bw;
    const dx = Math.tan(ba) * H;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0, -10 * S);
    ctx.lineTo(x0 + w2, -10 * S);
    ctx.lineTo(x0 + w2 + dx, H + 10 * S);
    ctx.lineTo(x0 + dx, H + 10 * S);
    ctx.closePath();
    ctx.clip();
    Cloth(true);
    // 光条自己的那口冷气（加色）
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "rgba(96,116,150,0.10)";
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // ── seg 1（八稿）：坛口那块碎布展开放在整布上——两块布的花纹接在一起。
  // 碎布磨得发浅、边上翻毛；贴着光条那一段摆，接缝两侧的花簇对上 ──
  if (seg === 1) {
    const cy = H * 0.52 + br;
    const px2 = W * 0.505, py2 = cy - H * 0.075;   // 碎布的中心（落在中间那条光里）
    const scr = [
      [px2 - W * 0.085, py2 - H * 0.055], [px2 + W * 0.075, py2 - H * 0.068],
      [px2 + W * 0.098, py2 + H * 0.028], [px2 + W * 0.03, py2 + H * 0.062],
      [px2 - W * 0.072, py2 + H * 0.05], [px2 - W * 0.1, py2 - H * 0.006],
    ];
    InkFill(ctx, scr, "wcScrap", "#2c3644",
      { amp: 3 * S, lw: 3.4 * S, line: "rgba(4,5,8,0.9)", shade: "rgba(0,0,0,0.2)" });
    // 磨毛的边：几根翻出来的线头
    ctx.save();
    ctx.strokeStyle = "rgba(150,160,176,0.6)";
    ctx.lineWidth = 1.4 * S;
    for (let i = 0; i < 6; i += 1) {
      const ex = px2 - W * 0.08 + i * W * 0.032;
      ctx.beginPath();
      ctx.moveTo(ex, py2 + H * 0.05 + Sym("wcScrF", i, 3 * S));
      ctx.lineTo(ex + 3 * S, py2 + H * 0.072);
      ctx.stroke();
    }
    ctx.restore();
    // 碎布上的白花：跟底下整布同一簇画法——两簇骑在碎布边上，
    // 半朵在碎布、半朵在整布：花纹接在一起靠的就是这两簇
    ctx.save();
    ctx.fillStyle = "rgba(196,204,218,0.62)";
    const blooms = [
      [px2 - W * 0.04, py2 - H * 0.01], [px2 + W * 0.035, py2 + H * 0.012],
      [px2 - W * 0.093, py2 + H * 0.006],   // 骑边那一簇（西沿）
      [px2 + W * 0.093, py2 - H * 0.02],    // 骑边那一簇（东沿）
    ];
    for (let i = 0; i < blooms.length; i += 1) {
      const [bx, by] = blooms[i];
      for (let p2 = 0; p2 < 4; p2 += 1) {
        const pa = (p2 / 4) * Math.PI * 2 + Hash("wcScrB" + i) * 2;
        ctx.beginPath();
        ctx.ellipse(bx + Math.cos(pa) * 3.2 * S, by + Math.sin(pa) * 2.4 * S,
          1.9 * S, 1.4 * S, pa, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    // 指着接缝的那只手（把碎布抚平在整布上）
    SplitHand(ctx, px2 + W * 0.065, py2 + H * 0.05, S * 1.7, 1, true);
  }

  // 角晕：夜的黑往里收
  const v = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.24, W * 0.5, H * 0.5, H * 0.88);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(1,1,2,0.8)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  Speckle(ctx, 0, 0, W, H, "wcGrain", { count: Math.round(W / 7), alpha: 0.05, size: 2.2 });
}

// ---------------------------------------------------------------------------
// 夜窖·陌生人（c1 §9 末，两段）。2026-08-14 用户退回：「这个陌生人你完全没
// 做出来啊？这就说 水 了？」——说话的人一直不在画面里。
//
// 骨架顶不住这一镜：躺着的人整具转了 90°、脑袋在 3.6 米的窖底只有二十来个
// 像素，脸上什么都读不出来（同刨子/石笔那两条老账——手指按不着、眼睛认不出
// 的东西，推镜头治不好，得换成铺满画框的手绘卡）。所以这一段跟"整幅蓝布"
// 一样走活动插卡：
//   seg 0  草苫掀开一角，一张仰着的脸横在草里——胡子拉碴、眼窝陷着、嘴唇干裂
//   seg 1  同一张脸，嘴张开一条缝（「水。」那一声就是从这儿出来的）
// 画法照 wholeCloth 那一族：整组画两遍，暗的一遍给形，再按板缝月光条裁着
// 画亮的一遍——细节只活在光里。色全体压得极暗（看着像纯黑的源色才是对的）。
// ---------------------------------------------------------------------------
export function DrawStrangerFaceCard(ctx, W, H, seg, t) {
  const S = H / 420;
  // 呼吸：又快又浅（他失着血）。整张脸跟着轻轻起伏
  const br = Math.sin(t * Math.PI * 2 * 0.55) * 2.0 * S;
  // 嘴：seg 1 那一声「水」——张开一条缝又合上一点。不做"一张一合地说话"，
  // 他没有那个力气；这一声是挤出来的
  const mouth = seg === 1 ? 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 0.3) : 0.08;

  // 底：窖的黑
  const bg = ctx.createRadialGradient(W * 0.46, H * 0.44, H * 0.1, W * 0.5, H * 0.55, H * 1.0);
  bg.addColorStop(0, "#0c0b0c");
  bg.addColorStop(1, "#040404");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 他仰面躺着，所以这是一张**侧脸、脸朝上**的近景。
  // 局部坐标：一个头长＝1.0，u 从后脑指向下巴，v 从脸里指向天。
  // 三条教训写在这儿（都是画出来才看见的）：
  //   ① **画布的 y 朝下，v 要取负号**——第一版漏了，整张脸倒着画：
  //      鼻子朝下、脖子长在天上，读出来是一块石头；
  //   ② 一张脸读不读得出来全在**外轮廓**：额、眉骨、鼻根的凹、鼻尖、人中、
  //      上下唇、颏唇沟、下巴，这几个起伏必须长在轮廓线上；
  //   ③ **起伏要真的凸出去**。第三版把这些点全排在"额→下巴"那条直线上，
  //      每个只离线三五个像素——比 InkFill 的笔迹抖动还小，出来是一条毛边，
  //      不是一张脸。所以现在整条脸的轮廓是**照一条脸线算出来的**：
  //      沿线走 s，再沿法线推出 o（鼻尖 o=0.10 个头长，那才叫鼻子）。
  const cx = W * 0.44, cy = H * 0.52 + br;
  const A = 0.16;                                    // 头略仰、下巴朝右上
  const K = 0.80 * H;                                // 一个头长占画框高的八成
  const ca = Math.cos(A), sa = Math.sin(A);
  const P = (u, v) => [cx + (u * ca - v * sa) * K, cy - (u * sa + v * ca) * K];

  // 脸线：从额顶到下巴；n 是它的外法线（脸朝天的那一侧）
  const F0 = [0.02, 0.33], FD = [0.40, -0.41], FN = [0.71, 0.70];
  const FP = (s, o) => [F0[0] + FD[0] * s + FN[0] * o, F0[1] + FD[1] * s + FN[1] * o];
  const Pf = (s, o) => { const [u, v] = FP(s, o); return P(u, v); };
  // 脸线在画布上的方向（眼睛的长轴顺着它，嘴缝垂直于它）
  const [ax0, ay0] = P(0, 0), [ax1, ay1] = P(FD[0], FD[1]);
  const faceAng = Math.atan2(ay1 - ay0, ax1 - ax0);

  const line = "rgba(3,3,4,0.92)";
  const Head = (bright) => {
    const skin = bright ? "#4a3620" : "#181209";
    // 脖子与半个肩膀：脸不能是个飘着的头（从下颌角往左下出画）
    InkFill(ctx, [
      P(0.06, -0.19), P(-0.12, -0.17), P(-0.30, -0.52), P(-0.92, -0.58), P(-0.88, -0.10),
    ], "sfNeck" + (bright ? 1 : 0), bright ? "#312516" : "#0f0b06",
    { amp: 2.6 * S, lw: 3.2 * S, line, shade: "rgba(0,0,0,0.34)" });
    // 头：脸的那一段照脸线算（s 沿线、o 出法线），后脑与下颌直接给点
    InkFill(ctx, [
      Pf(0.00, 0.000),                 // 额顶
      Pf(0.30, 0.030), Pf(0.36, -0.020),   // 眉骨凸、鼻根凹
      Pf(0.52, 0.100),                 // 鼻尖：整张脸最靠外的一点
      Pf(0.56, 0.010), Pf(0.62, -0.020),   // 鼻底、人中
      Pf(0.68, 0.030), Pf(0.72, 0.000), Pf(0.76, 0.030),   // 上唇、唇缝、下唇
      Pf(0.84, -0.030), Pf(0.95, 0.040),   // 颏唇沟、下巴
      Pf(1.00, -0.030),                // 下巴底
      P(0.300, -0.170), P(0.100, -0.200), P(-0.100, -0.170),
      P(-0.260, -0.130), P(-0.400, -0.080),
      P(-0.400, 0.160), P(-0.220, 0.300),
    ], "sfHead" + (bright ? 1 : 0), skin,
    { amp: 2.2 * S, lw: bright ? 3.2 * S : 4.2 * S, line, shade: "rgba(0,0,0,0.30)" });
    // 头发：结成绺的一片，压在颅顶与后脑（**不许盖过眉骨**——盖过去就没有
    // 额头，剩下的轮廓读不出是张脸）。夜里它比皮肤还要暗两档
    InkFill(ctx, [
      P(-0.412, -0.060), P(-0.408, 0.164), P(-0.226, 0.306), P(0.020, 0.334),
      P(0.000, 0.272), P(-0.180, 0.236), P(-0.330, 0.120), P(-0.352, -0.030),
    ], "sfHair" + (bright ? 1 : 0), bright ? "#1d150c" : "#080605",
    { amp: 2.6 * S, lw: 2.8 * S, line, shade: "rgba(0,0,0,0.34)" });

    // 五官**两遍都画**，暗的一遍压淡：只在光条里画的话，眼睛和嘴全看运气——
    // 光条压不到那一块，画面上就还是一个没有五官的头（第二版如此）
    const dim = bright ? 1 : 0.45;
    const Seg = (p0, p1, color, lw) => {
      ctx.strokeStyle = color; ctx.lineWidth = lw * S;
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
    };
    ctx.save();
    // 眼窝：陷进去的一片暗，就在眉骨后头。脸本来就暗，"暗上加暗"看不见——
    // 这只眼睛靠**那一点亮**读出来：一道月光落在半睁的眼白上
    ctx.fillStyle = `rgba(4,3,3,${0.78 * dim})`;
    const [ex, ey] = Pf(0.34, -0.070);
    ctx.beginPath();
    ctx.ellipse(ex, ey, K * 0.090, K * 0.046, faceAng, 0, Math.PI * 2);
    ctx.fill();
    Seg(Pf(0.245, -0.040), Pf(0.330, -0.005), `rgba(6,5,4,${0.85 * dim})`, 4.0);   // 眉
    Seg(Pf(0.300, -0.062), Pf(0.375, -0.038), `rgba(206,194,168,${0.78 * dim})`, 2.8);  // 睁开的那条缝
    Seg(Pf(0.300, -0.092), Pf(0.380, -0.068), `rgba(5,4,3,${0.72 * dim})`, 2.6);   // 上睑的影
    // 颧骨一道高光、底下一道凹：瘦得只剩骨头
    Seg(Pf(0.45, -0.075), Pf(0.62, -0.115), `rgba(152,126,94,${0.44 * dim})`, 3.6);
    Seg(Pf(0.52, -0.150), Pf(0.72, -0.180), `rgba(8,6,5,${0.42 * dim})`, 4.6);
    // 耳朵：一小圈，在下颌的转角后头（别摆到腮帮子当中去）
    ctx.strokeStyle = `rgba(118,94,68,${0.55 * dim})`;
    ctx.lineWidth = 2.2 * S;
    const [erx, ery] = P(-0.170, 0.010);
    ctx.beginPath();
    ctx.ellipse(erx, ery, K * 0.062, K * 0.042, -A + 0.4, -0.5, Math.PI * 1.4);
    ctx.stroke();
    ctx.restore();

    // 嘴：张开的那条缝。缝**垂直于脸线**（在侧脸上，嘴是往脸里去的一道口）
    const [mx, my] = Pf(0.72, -0.018);
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(faceAng + Math.PI / 2);
    // 别画大：嘴张开也就一条缝。第一版给到 0.085 个头长，读出来是鱼嘴
    const mw = K * 0.050, mh = K * (0.005 + 0.022 * mouth);
    ctx.fillStyle = `rgba(5,3,3,${0.92 * dim})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, mw, mh, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(138,102,76,${0.62 * dim})`;
    ctx.lineWidth = 2.2 * S;
    for (const sd of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-mw, sd * mh * 0.3);
      ctx.quadraticCurveTo(0, sd * (mh + 3.0 * S), mw, sd * mh * 0.3);
      ctx.stroke();
    }
    ctx.strokeStyle = `rgba(76,46,34,${0.62 * dim})`;   // 唇上的裂口
    ctx.lineWidth = 1.4 * S;
    for (let i = 0; i < 3; i += 1) {
      const ux = -mw * 0.5 + i * mw * 0.5;
      ctx.beginPath();
      ctx.moveTo(ux, -mh - 3.0 * S);
      ctx.lineTo(ux + 1.0 * S, -mh + 0.5 * S);
      ctx.stroke();
    }
    ctx.restore();

    // 胡子拉碴：下颌那一片碎点（十来天没刮，不是一撮胡子）
    ctx.save();
    ctx.fillStyle = `rgba(20,15,10,${0.6 * dim})`;
    for (let i = 0; i < 70; i += 1) {
      const s2 = 0.55 + Hash("sfStubS" + i) * 0.48;
      const o2 = -0.20 + Hash("sfStubO" + i) * 0.20;
      const [sx, sy] = Pf(s2, o2);
      ctx.beginPath();
      ctx.ellipse(sx, sy, 1.7 * S, 1.3 * S, faceAng, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 太阳穴那道干了的血：从发际淌到眉骨，暗得几乎看不出是红的
    ctx.save();
    ctx.strokeStyle = `rgba(62,26,20,${0.75 * dim})`;
    ctx.lineWidth = 3.4 * S;
    const b0 = Pf(0.05, 0.010), b1 = Pf(0.16, -0.020), b2 = Pf(0.26, 0.005);
    ctx.beginPath();
    ctx.moveTo(b0[0], b0[1]);
    ctx.quadraticCurveTo(b1[0], b1[1], b2[0], b2[1]);
    ctx.stroke();
    ctx.restore();
  };

  // 草：他还在草苫底下——短短的几根横在脸的上下两头，有两根搭在额上
  const Straw = (bright) => {
    const col = bright ? "rgba(104,86,50,0.6)" : "rgba(26,21,13,0.72)";
    for (let i = 0; i < 26; i += 1) {
      const y0 = H * (0.04 + Hash("sfStrawY" + i) * 0.94);
      const x0 = W * (0.0 + Hash("sfStrawX" + i) * 0.9);
      const len = W * (0.035 + Hash("sfStrawL" + i) * 0.085);
      const tilt = -0.7 + Hash("sfStrawA" + i) * 1.4;
      InkLine(ctx, x0, y0, x0 + len, y0 + len * tilt, "sfStraw" + i,
        { lw: (i % 3 ? 1.4 : 2.2) * S, color: col, amp: 1.6 * S });
    }
  };

  // 压在脸上的那几根草：**画在头之后**——他是从草苫底下露出来的，
  // 草全在人身后的话，这张脸就是搁在草堆前面，不是埋在草里
  const StrawOver = (bright) => {
    const col = bright ? "rgba(112,92,54,0.72)" : "rgba(30,24,15,0.8)";
    for (let i = 0; i < 7; i += 1) {
      const s2 = -0.05 + i * 0.17;
      const a = Pf(s2, 0.10 + Hash("sfOverA" + i) * 0.06);
      const b = Pf(s2 + 0.10, -0.26 - Hash("sfOverB" + i) * 0.10);
      InkLine(ctx, a[0], a[1], b[0], b[1], "sfOver" + i,
        { lw: (i % 2 ? 1.8 : 2.8) * S, color: col, amp: 2.0 * S });
    }
  };

  Straw(false);
  Head(false);
  StrawOver(false);

  // 板缝漏下来的月光条：斜切过画面，光条里的那一遍才有血色与高光。
  // **别再往光条里加色**（第一版加了，四条读成四块斜着的玻璃）
  const beams = [[0.16, 0.075], [0.42, 0.052], [0.70, 0.090]];
  const ba = -0.40;
  for (let i = 0; i < beams.length; i += 1) {
    const [bu, bw] = beams[i];
    const x0 = W * bu, w2 = W * bw;
    const dx = Math.tan(ba) * H;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0, -10 * S);
    ctx.lineTo(x0 + w2, -10 * S);
    ctx.lineTo(x0 + w2 + dx, H + 10 * S);
    ctx.lineTo(x0 + dx, H + 10 * S);
    ctx.closePath();
    ctx.clip();
    Head(true);
    Straw(true);
    StrawOver(true);
    ctx.restore();
  }

  // 角晕 + 颗粒（同族）
  const v = ctx.createRadialGradient(W * 0.46, H * 0.5, H * 0.24, W * 0.5, H * 0.5, H * 0.9);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(1,1,2,0.8)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  Speckle(ctx, 0, 0, W, H, "sfGrain", { count: Math.round(W / 7), alpha: 0.05, size: 2.2 });
}

// ---------------------------------------------------------------------------
// 缝·改（c1 天蒙蒙亮，两段）：一双手把小褂子提起来对着天光看。
//   seg 0  看整件：暗红小褂逆着晨光，一只袖口接了一截蓝底白花，
//          两只袖子明显不一样长
//   seg 1  推近那只接了蓝布的袖口（同一件东西的近景）
// 晨光青灰（dawn 那族再压两档），布全是逆光的剪影，细节靠轮廓与那截蓝布说。
// ---------------------------------------------------------------------------
export function DrawMendedSleeveCard(ctx, W, H, seg, t) {
  const S = H / 420;
  const br = Math.sin(t * Math.PI * 2 * 0.2) * 1.8 * S;    // 手提着，有一点点晃
  // 底：蒙蒙亮的天——青灰里透一点将亮未亮的暖
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#232038");
  bg.addColorStop(0.55, "#332e4a");
  bg.addColorStop(1, "#211d30");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // 天光最亮那一块：画框上中——衣裳就是对着它看的
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.34, H * 0.04, W * 0.5, H * 0.38, H * 0.62);
  glow.addColorStop(0, "rgba(120,116,150,0.5)");
  glow.addColorStop(0.5, "rgba(90,86,118,0.22)");
  glow.addColorStop(1, "rgba(60,56,84,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const RIM = "rgba(146,140,178,0.6)";      // 逆光的轮廓亮边
  const STITCH = "rgba(172,164,148,0.75)";  // 针脚：大的大小的小

  if (seg === 0) {
    // ── 整件：两只手提着肩缝，袖子垂下来——左袖原装、右袖接过 ──
    const cx = W * 0.5, topY = H * 0.30 + br;
    // 两条胳膊先画（在褂子**后面**）：从画框底外伸进来、肘上一个折角、
    // 举到两肩——首轮退回的是两根横贯衣身的断头竖杆。收细一档、颜色压暗，
    // 肘拐在褂子外侧，可见段只有下摆以下与肩头那一截
    for (const sd of [-1, 1]) {
      const hx = cx + sd * W * 0.148, hy = topY - H * 0.018 + (sd > 0 ? 4 * S : 0);
      const ex = cx + sd * W * 0.275, ey = topY + H * 0.315;   // 肘：衣袖外侧、垂过下摆
      InkLine(ctx, cx + sd * W * 0.345, H + 30 * S, ex, ey, "msUpper" + sd,
        { lw: 10 * S, color: "#241a10", amp: 1.8 * S });
      InkLine(ctx, ex, ey, hx + sd * 5 * S, hy + 9 * S, "msFore" + sd,
        { lw: 8.5 * S, color: "#2c2013", amp: 1.6 * S });
    }
    // 衣身
    InkFill(ctx, [
      [cx - W * 0.155, topY], [cx - W * 0.04, topY - H * 0.045], [cx + W * 0.05, topY - H * 0.04],
      [cx + W * 0.16, topY + H * 0.01], [cx + W * 0.135, topY + H * 0.36],
      [cx - W * 0.13, topY + H * 0.375],
    ], "msBody", "#3a1e25", { amp: 4 * S, lw: 5 * S, line: "rgba(8,5,7,0.9)", shade: "rgba(0,0,0,0.3)" });
    // 领口
    InkFill(ctx, [[cx - W * 0.028, topY - H * 0.05], [cx + W * 0.03, topY - H * 0.048],
      [cx + W * 0.02, topY - H * 0.012], [cx - W * 0.02, topY - H * 0.014]],
    "msCollar", "#2b161c", { amp: 2 * S, lw: 3 * S });
    // 左袖（原装的，短）：垂到 0.52H
    InkFill(ctx, [
      [cx - W * 0.155, topY + H * 0.008], [cx - W * 0.205, topY + H * 0.03],
      [cx - W * 0.215, topY + H * 0.215], [cx - W * 0.155, topY + H * 0.225],
      [cx - W * 0.13, topY + H * 0.05],
    ], "msSleeveL", "#341b21", { amp: 3.4 * S, lw: 4.5 * S, shade: "rgba(0,0,0,0.28)" });
    // 右袖（接过的，明显长一截）：本袖到 0.2H，接上的蓝布再往下 0.1H
    InkFill(ctx, [
      [cx + W * 0.16, topY + H * 0.02], [cx + W * 0.21, topY + H * 0.045],
      [cx + W * 0.222, topY + H * 0.20], [cx + W * 0.163, topY + H * 0.208],
      [cx + W * 0.14, topY + H * 0.06],
    ], "msSleeveR", "#341b21", { amp: 3.4 * S, lw: 4.5 * S, shade: "rgba(0,0,0,0.28)" });
    // 接上去的那截蓝底白花
    InkFill(ctx, [
      [cx + W * 0.163, topY + H * 0.205], [cx + W * 0.222, topY + H * 0.198],
      [cx + W * 0.23, topY + H * 0.315], [cx + W * 0.168, topY + H * 0.322],
    ], "msPatch", "#232c38", { amp: 2.6 * S, lw: 4 * S, shade: "rgba(0,0,0,0.24)" });
    // 蓝布上的白花两三点
    ctx.save();
    ctx.fillStyle = "rgba(170,180,196,0.5)";
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.ellipse(cx + W * (0.178 + Hash("msB" + i) * 0.04), topY + H * (0.225 + Hash("msBy" + i) * 0.08),
        2.4 * S, 1.8 * S, i, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // 接口那圈针脚：不匀的虚线（一针大一针小）
    ctx.save();
    ctx.strokeStyle = STITCH;
    ctx.lineWidth = 2 * S;
    let sx2 = cx + W * 0.166;
    for (let i = 0; i < 6; i += 1) {
      const seg2 = (3 + Hash("msSt" + i) * 6) * S;
      ctx.beginPath();
      ctx.moveTo(sx2, topY + H * 0.205 + Sym("msStY", i, 2.4 * S));
      ctx.lineTo(sx2 + seg2 * 0.6, topY + H * 0.203 + Sym("msStY", i + 6, 2.4 * S));
      ctx.stroke();
      sx2 += seg2;
      if (sx2 > cx + W * 0.222) break;
    }
    ctx.restore();
    // 逆光的轮廓亮边：肩线与两袖外沿
    ctx.save();
    ctx.strokeStyle = RIM;
    ctx.lineWidth = 2.4 * S;
    ctx.beginPath();
    ctx.moveTo(cx - W * 0.15, topY + 2 * S);
    ctx.quadraticCurveTo(cx, topY - H * 0.052, cx + W * 0.155, topY + H * 0.008);
    ctx.stroke();
    ctx.lineWidth = 1.8 * S;
    ctx.beginPath();
    ctx.moveTo(cx - W * 0.203, topY + H * 0.035);
    ctx.lineTo(cx - W * 0.214, topY + H * 0.213);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + W * 0.209, topY + H * 0.05);
    ctx.lineTo(cx + W * 0.228, topY + H * 0.313);
    ctx.stroke();
    ctx.restore();
    // 两只手最后压上来：攥在**衣肩两点**的缝头上（手在布前，攥出一点鼓）
    for (const sd of [-1, 1]) {
      const hx = cx + sd * W * 0.148, hy = topY - H * 0.018 + (sd > 0 ? 4 * S : 0);
      InkFill(ctx, [
        [hx - 11 * S, hy + 6 * S], [hx - 4 * S, hy - 9 * S], [hx + 11 * S, hy - 6 * S],
        [hx + 14 * S, hy + 9 * S], [hx + 2 * S, hy + 15 * S],
      ], "msHand" + sd, "#5a4028", { amp: 2.4 * S, lw: 3.4 * S, shade: "rgba(0,0,0,0.24)" });
      // 扣过肩缝的两根指头
      for (let i = 0; i < 2; i += 1) {
        InkLine(ctx, hx - 4 * S + i * 7 * S, hy + 10 * S, hx - 2 * S + i * 7 * S, hy - 2 * S,
          "msFing" + sd + i, { lw: 3.2 * S, color: "#4e3620", amp: 0.6 * S });
      }
    }
  } else {
    // ── 近景：那只接了蓝布的袖口横过画框（同一件东西，推近了看） ──
    const cy = H * 0.52 + br;
    // 本袖：从左上斜进来，暗红
    InkFill(ctx, [
      [-30 * S, cy - H * 0.30], [W * 0.46, cy - H * 0.235], [W * 0.50, cy + H * 0.06],
      [-30 * S, cy + H * 0.16],
    ], "msNearSleeve", "#3a1e25", { amp: 5 * S, lw: 6 * S, shade: "rgba(0,0,0,0.3)" });
    // 接上的蓝布：占画框右半
    InkFill(ctx, [
      [W * 0.455, cy - H * 0.24], [W * 0.92, cy - H * 0.175], [W * 0.965, cy + H * 0.115],
      [W * 0.49, cy + H * 0.065],
    ], "msNearPatch", "#232c38", { amp: 4.5 * S, lw: 6 * S, shade: "rgba(0,0,0,0.26)" });
    // 袖口的织口：右端一道收边
    InkLine(ctx, W * 0.925, cy - H * 0.17, W * 0.962, cy + H * 0.108, "msNearHem",
      { lw: 4 * S, color: "rgba(120,132,150,0.5)", amp: 3 * S });
    // 白花：近景里花看得真了
    ctx.save();
    for (let i = 0; i < 8; i += 1) {
      const bx = W * (0.52 + Hash("msNB" + i) * 0.38);
      const by = cy - H * 0.15 + Hash("msNBy" + i) * H * 0.24;
      ctx.fillStyle = "rgba(178,188,202,0.55)";
      for (let p2 = 0; p2 < 4; p2 += 1) {
        const pa = (p2 / 4) * Math.PI * 2 + Hash("msNBp" + i) * 2;
        ctx.beginPath();
        ctx.ellipse(bx + Math.cos(pa) * 5 * S, by + Math.sin(pa) * 3.8 * S,
          3 * S, 2.2 * S, pa, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    // 接口那道缝：针脚大的大小的小、歪的歪斜的斜——近景里这就是主角
    ctx.save();
    ctx.strokeStyle = STITCH;
    let sy2 = cy - H * 0.235;
    for (let i = 0; i < 9; i += 1) {
      const seg2 = (8 + Hash("msNSt" + i) * 15) * S;
      ctx.lineWidth = (2.4 + Hash("msNSw" + i) * 2.2) * S;
      ctx.beginPath();
      ctx.moveTo(W * 0.468 + Sym("msNSx", i, 7 * S), sy2);
      ctx.lineTo(W * 0.474 + Sym("msNSx", i + 9, 7 * S), sy2 + seg2 * 0.6);
      ctx.stroke();
      sy2 += seg2;
      if (sy2 > cy + H * 0.06) break;
    }
    // 缝线拽出的两处小皱
    ctx.strokeStyle = "rgba(10,8,10,0.5)";
    ctx.lineWidth = 2.6 * S;
    for (let i = 0; i < 2; i += 1) {
      const py2 = cy - H * 0.1 + i * H * 0.12;
      ctx.beginPath();
      ctx.moveTo(W * 0.43, py2);
      ctx.quadraticCurveTo(W * 0.465, py2 + 4 * S, W * 0.52, py2 - 3 * S);
      ctx.stroke();
    }
    ctx.restore();
    // 布上沿的逆光亮边
    ctx.save();
    ctx.strokeStyle = RIM;
    ctx.lineWidth = 2.6 * S;
    ctx.beginPath();
    ctx.moveTo(-20 * S, cy - H * 0.295);
    ctx.quadraticCurveTo(W * 0.46, cy - H * 0.245, W * 0.92, cy - H * 0.178);
    ctx.stroke();
    ctx.restore();
    // 捏着袖口的两根手指（右下角，把布绷平的那只手）
    InkFill(ctx, [
      [W * 0.88, cy + H * 0.10], [W * 0.97, cy + H * 0.075], [W + 20 * S, cy + H * 0.16],
      [W + 20 * S, H + 20 * S], [W * 0.84, H + 20 * S],
    ], "msNearHand", "#5a4028", { amp: 3.4 * S, lw: 4.5 * S, shade: "rgba(0,0,0,0.26)" });
    InkLine(ctx, W * 0.90, cy + H * 0.105, W * 0.955, cy + H * 0.085, "msNearThumb",
      { lw: 7 * S, color: "#6a4c30", amp: 1 * S });
  }

  // 晨雾的青：整卡罩一层将亮未亮
  ctx.fillStyle = "rgba(46,42,72,0.14)";
  ctx.fillRect(0, 0, W, H);
  const v = ctx.createRadialGradient(W * 0.5, H * 0.46, H * 0.28, W * 0.5, H * 0.5, H * 0.9);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(10,9,16,0.66)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  Speckle(ctx, 0, 0, W, H, "msGrain", { count: Math.round(W / 7), alpha: 0.05, size: 2.2 });
}

// ---------------------------------------------------------------------------
// 序 · 刺刀一帧（2026-08-17 用户重排的分镜，镜 02，0.5s，硬切进硬切出）：
// 「全静。硬切一帧：日军枪上挑着襁褓。正面剪影——战斗帽带帽垂，刺刀尖挑着
//   布包，襁褓一角蓝底白花垂下来；嘴裂成一道白牙，头微歪，在笑。切出。」
//
// 为什么是插卡：全作是侧视骨架，**正脸给不出来**，而这一帧要的正是正脸——
// 那道白牙。画法是**剪影**：整个人是逆着白晃晃的日头的一块黑，认得出他是日军
// 靠的只有轮廓（战斗帽的圆顶＋两片垂到肩上的帽垂＋斜挑上去的长枪）；画面里
// 只有两样东西不是黑的——那道白牙，和襁褓垂下来的那一角**蓝底白花**：全章的
// 暗线第一次出现，就在这一帧里。
// 三条画法的账（同族插卡的老账，这里再记一遍）：
//   ① 过场上下各压一条黑边，可见画高只剩 77%——脸和布包都要压在 0.16H~0.84H 里；
//   ② CanvasTexture 上屏提亮两档：剪影要**真黑**得给到 #0a0806 上下，背景想读成
//      白晃晃的日头，源色 #7a7266 就够了；
//   ③ 蓝布上的白花跟整布卡（wholeCloth）**同一簇画法**——四瓣一簇的米白，
//      观众在窖里再见到那块布时，认的就是这簇花。
// t 只用来让垂下来的那一角布极轻地晃一下；其余全是定格。
// ---------------------------------------------------------------------------
export function DrawBayonetCard(ctx, W, H, seg, t) {
  const S = H / 420;
  const X = (u) => W * u, Y = (v) => H * v;
  // ── 背景：白晃晃的日头，亮心落在脸与布包之间，四角沉下去 ──
  // 亮心给到很亮（源色 #b4ab9b 上屏≈0.86）：这一帧是硬切进黑里的一闪，
  // 天不白，人就不是剪影，只是一团黑压在灰上（第一版实拍就是这样）
  const bg = ctx.createRadialGradient(X(0.55), Y(0.36), H * 0.05, X(0.50), Y(0.45), H * 0.98);
  bg.addColorStop(0, "#b4ab9b");
  bg.addColorStop(0.5, "#8e8677");
  bg.addColorStop(1, "#46403a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // 日头里的浮尘：一层很淡的颗粒，白得不平
  Speckle(ctx, 0, 0, W, H, "byDust", { count: Math.round(W / 4), alpha: 0.05, size: 2.6 * S, color: "#d8d0c0" });

  const INK = "#0a0806";               // 剪影的黑（上屏≈0.2）
  const INK2 = "#110d0a";              // 压在前面的那层（胳膊/帽垂），差一丝好分层
  const LINE = "rgba(4,3,2,0.9)";
  const F = { amp: 1.6 * S, lw: 2.2 * S, line: LINE };

  // ── 枪：托在他右手里、从身前斜挑向画右上，枪的上大半截**亮在天上**——
  //    剪影里黑压黑什么都读不出，枪得离开身子才是一杆枪。三八式带刺刀一米七 ──
  const B0 = [X(0.400), Y(0.97)], B1 = [X(0.790), Y(0.245)];   // 托底 → 刀尖
  const dx = B1[0] - B0[0], dy = B1[1] - B0[1];
  const L = Math.hypot(dx, dy);
  const ux = dx / L, uy = dy / L;      // 沿枪
  const nx = -uy, ny = ux;             // 垂直于枪（指向画右上方的法线）
  const Along = (s, o = 0) => [B0[0] + ux * s + nx * o, B0[1] + uy * s + ny * o];
  const bladeLen = L * 0.235;          // 刺刀那一截
  const gunLen = L - bladeLen;

  // ── 躯干（先画：枪与胳膊都压在它前头）──
  // 肩很宽、领子立着、腰上一道武装带的凹。这一层只有轮廓在说话，所以肩线要硬
  const cx = X(0.405);
  const shY = Y(0.545);                // 肩线
  const torso = [
    [cx - X(0.150), shY + 4 * S], [cx - X(0.118), shY - 10 * S], [cx - X(0.052), shY - 26 * S],
    [cx - X(0.030), shY - 46 * S],    // 领口（脖子）
    [cx + X(0.030), shY - 46 * S],
    [cx + X(0.052), shY - 26 * S], [cx + X(0.118), shY - 10 * S], [cx + X(0.150), shY + 4 * S],
    [cx + X(0.140), Y(0.80)], [cx + X(0.128), Y(1.02)],
    [cx - X(0.128), Y(1.02)], [cx - X(0.140), Y(0.80)],
  ];
  InkFill(ctx, torso, "byTorso", INK, F);
  // 立领：脖子那一截比肩略窄，领口的两个尖
  InkFill(ctx, [
    [cx - X(0.036), shY - 62 * S], [cx + X(0.036), shY - 62 * S],
    [cx + X(0.044), shY - 30 * S], [cx - X(0.044), shY - 30 * S],
  ], "byNeck", INK, F);

  // ── 枪身：托板一头宽、握把处收窄、机匣与护木一段厚、枪管一段细；刺刀最后画
  //    （要压在布包上头）。三八式在剪影里就是这四段粗细，别画成一根棍 ──
  const stockW = 9 * S, barrelW = 4.4 * S;
  const GUN = "#171310";               // 枪比身子亮一丝：压在胸前那一截才分得开
  // 护木一直包到枪口跟前（三八式的木头几乎到头），光杆的枪管只剩最后一小段
  const gunPoly = [
    Along(0, -18 * S), Along(gunLen * 0.05, -16 * S),                 // 托板（顶部有一点托梳）
    Along(gunLen * 0.22, -7 * S),                                     // 握把最窄
    Along(gunLen * 0.27, -stockW * 1.2), Along(gunLen * 0.86, -stockW * 1.05),   // 机匣＋护木
    Along(gunLen * 0.86, -barrelW), Along(gunLen, -barrelW * 0.9),    // 枪管
    Along(gunLen, barrelW * 0.9), Along(gunLen * 0.86, barrelW),
    Along(gunLen * 0.86, stockW * 0.95), Along(gunLen * 0.27, stockW * 1.05),
    Along(gunLen * 0.22, 7 * S), Along(gunLen * 0.05, 14 * S), Along(0, 18 * S),
  ];
  InkFill(ctx, gunPoly, "byGun", GUN, { ...F, amp: 1.0 * S });
  // 机匣上的三样小东西：表尺（上沿一小块）、拉机柄（右侧一个疙瘩）、准星（枪口一小尖）
  InkFill(ctx, [Along(gunLen * 0.42, -stockW * 1.2), Along(gunLen * 0.47, -stockW * 1.2),
    Along(gunLen * 0.47, -stockW * 1.9), Along(gunLen * 0.42, -stockW * 1.9)], "bySight", GUN, { ...F, amp: 0.5 * S });
  {
    const [kx, ky] = Along(gunLen * 0.36, stockW * 1.9);
    InkFill(ctx, Spline([[kx - 5 * S, ky - 5 * S], [kx + 6 * S, ky - 4 * S], [kx + 6 * S, ky + 6 * S], [kx - 5 * S, ky + 5 * S]], 4),
      "byBolt", GUN, { ...F, amp: 0.5 * S });
  }
  InkFill(ctx, [Along(gunLen - 14 * S, -barrelW), Along(gunLen - 8 * S, -barrelW * 2.4), Along(gunLen - 4 * S, -barrelW)],
    "byFrontSight", GUN, { ...F, amp: 0.4 * S });
  // 扳机护圈：握把底下一个小弧
  {
    const [tx, ty] = Along(gunLen * 0.245, 9 * S);
    ctx.save();
    ctx.strokeStyle = GUN; ctx.lineWidth = 3.2 * S; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(tx, ty, 8 * S, Math.atan2(uy, ux) - 0.2, Math.atan2(uy, ux) + Math.PI + 0.2);
    ctx.stroke();
    ctx.restore();
  }

  // ── 胳膊：右手（画左）攥托、扣扳机；左手（画右）伸过来握着枪的前段 ──
  const Arm = (sx, sy, ex, ey, id, w) => {
    const ax = ex - sx, ay = ey - sy, al = Math.hypot(ax, ay) || 1;
    const px = -ay / al * w, py = ax / al * w;
    InkFill(ctx, [[sx - px, sy - py], [ex - px * 0.7, ey - py * 0.7], [ex + px * 0.7, ey + py * 0.7], [sx + px, sy + py]],
      id, INK2, { ...F, amp: 1.2 * S });
  };
  const gripR = Along(gunLen * 0.25, stockW * 0.2);      // 扳机手（右手横过胸前）
  const gripL = Along(gunLen * 0.60, 0);                 // 前托手（左手伸到身外）
  Arm(cx - X(0.118), shY + 6 * S, gripR[0] - 4 * S, gripR[1] + 4 * S, "byArmR", 15 * S);
  Arm(cx + X(0.118), shY + 6 * S, gripL[0] - 4 * S, gripL[1] + 6 * S, "byArmL", 14 * S);
  // 拳头：两团攥着枪的黑
  for (const [gx, gy, id] of [[gripR[0], gripR[1] + 4 * S, "byFistR"], [gripL[0], gripL[1] + 6 * S, "byFistL"]]) {
    InkFill(ctx, Spline([
      [gx - 13 * S, gy - 6 * S], [gx + 2 * S, gy - 13 * S], [gx + 14 * S, gy - 4 * S],
      [gx + 11 * S, gy + 11 * S], [gx - 6 * S, gy + 13 * S], [gx - 15 * S, gy + 5 * S],
    ], 4), id, INK2, { ...F, amp: 0.8 * S });
  }

  // ── 头：微歪（朝布包那一侧）。战斗帽的圆顶 + 短檐 + 两片垂到肩上的帽垂 ──
  const hx = cx, hy = Y(0.385);
  const r = H * 0.086;                 // 头半径（脸宽≈1.7r，读得出那道牙）
  const tilt = 0.14;                   // 头往画右歪 8°
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(tilt);
  // 帽垂：从帽墙两侧垂下来，越往下越开，压在肩上——正面认日军的第一眼
  for (const sd of [-1, 1]) {
    InkFill(ctx, [
      [sd * r * 0.62, -r * 0.42], [sd * r * 1.02, -r * 0.30],
      [sd * r * 1.30, r * 0.62], [sd * r * 1.34, r * 1.36],
      [sd * r * 0.60, r * 1.30], [sd * r * 0.62, r * 0.40],
    ], "byFlap" + sd, INK2, { ...F, amp: 1.8 * S });
  }
  // 脸：一颗蛋，下巴略尖；脖子从下巴接到领口
  InkFill(ctx, Spline([
    [0, -r * 0.98], [r * 0.72, -r * 0.62], [r * 0.86, r * 0.10], [r * 0.52, r * 0.86],
    [0, r * 1.06], [-r * 0.52, r * 0.86], [-r * 0.86, r * 0.10], [-r * 0.72, -r * 0.62],
  ], 5), "byFace", INK, F);
  InkFill(ctx, [[-r * 0.34, r * 0.90], [r * 0.34, r * 0.90], [r * 0.40, r * 1.62], [-r * 0.40, r * 1.62]],
    "byNeck2", INK, F);
  // 战斗帽：圆顶盖在眉上，帽檐短短一片探在额前，帽墙一圈
  InkFill(ctx, Spline([
    [0, -r * 1.34], [r * 0.70, -r * 1.16], [r * 0.98, -r * 0.62], [r * 0.90, -r * 0.34],
    [0, -r * 0.30], [-r * 0.90, -r * 0.34], [-r * 0.98, -r * 0.62], [-r * 0.70, -r * 1.16],
  ], 5), "byCap", INK, F);
  // 帽檐：短短一片探在额前——正面看是眉上一道比脸宽的横沿，剪影里就靠它认帽子
  InkFill(ctx, [
    [-r * 1.06, -r * 0.42], [r * 1.06, -r * 0.42], [r * 1.14, -r * 0.24], [r * 0.90, -r * 0.16],
    [-r * 0.90, -r * 0.16], [-r * 1.14, -r * 0.24],
  ], "byBrim", INK, F);
  // 那道白牙：嘴裂开，两角吊上去——整张脸里唯一亮的东西
  {
    const mw = r * 0.70, my = r * 0.46;
    ctx.beginPath();
    ctx.moveTo(-mw, my - r * 0.10);
    ctx.quadraticCurveTo(0, my + r * 0.16, mw, my - r * 0.10);      // 下唇线
    ctx.quadraticCurveTo(0, my - r * 0.02, -mw, my - r * 0.10);     // 上唇线
    ctx.closePath();
    ctx.fillStyle = "#cfc6b2";
    ctx.fill();
    // 牙缝：细细的黑线把这一道白切成一排
    ctx.strokeStyle = "rgba(10,8,6,0.85)";
    ctx.lineWidth = 1.5 * S;
    for (let i = -4; i <= 4; i += 1) {
      const tx = i * mw * 0.20;
      const k = 1 - (Math.abs(i) / 5) ** 2;
      ctx.beginPath();
      ctx.moveTo(tx, my - r * 0.10 + r * 0.03 * k);
      ctx.lineTo(tx, my - r * 0.10 + r * 0.16 * k);
      ctx.stroke();
    }
  }
  ctx.restore();

  // ── 刺刀：先画整截钢（包挂上来之后尖还露在外头），整幅画里唯一的一线冷光 ──
  const bw = 5.2 * S;
  const DrawBlade = (s0, s1) => {
    InkFill(ctx, [Along(s0, -bw), Along(s1 - 6 * S, -bw * 0.4), Along(s1, 0), Along(s1 - 6 * S, bw * 0.4), Along(s0, bw)],
      "byBlade" + s0.toFixed(0), "#6a665c", { amp: 0.5 * S, lw: 1.6 * S, line: "rgba(6,5,4,0.9)" });
    // 刃口的一线亮
    const [ax, ay] = Along(s0, -bw * 0.55), [bx2, by2] = Along(s1 - 4 * S, -bw * 0.15);
    ctx.save();
    ctx.strokeStyle = "rgba(226,222,208,0.85)";
    ctx.lineWidth = 1.4 * S;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx2, by2); ctx.stroke();
    ctx.restore();
  };
  DrawBlade(gunLen, L);
  // 枪口箍：管与刀交界那一小段
  InkFill(ctx, [Along(gunLen - 8 * S, -barrelW * 1.1), Along(gunLen + 8 * S, -barrelW * 1.1),
    Along(gunLen + 8 * S, barrelW * 1.1), Along(gunLen - 8 * S, barrelW * 1.1)], "byMuzzle", INK, { ...F, amp: 0.6 * S });

  // ── 襁褓：**吊在刀上的一个裹着的孩子**（2026-08-17 用户拿两张图退回第一版：
  //    一张是背上背着孩子的老照片（金文的「保」字就是那个形），一张是今天的
  //    襁褓照——第一版画成一只口袋，什么都不像）。照那两张图来：
  //    · **头露在外头**：一颗圆脑袋在最上头，几缕胎发；
  //    · **身子裹成一个茧**：肩最宽、往脚那头收窄、底是圆的，一层布从肩上斜着
  //      掖过胸前（那道斜的包边就是"裹着的"这两个字），下摆再折回来一道；
  //    · 裹的就是那块**蓝底白花**——整个茧是布，只是背着光，色沉在影子里；
  //      散开垂下来的那一角在光里，花才亮；
  //    · 刀从后背的裹布里勾过去：布在刀上拧成一小把，尖从脑袋上头露出来。
  //    比例按真孩子：头 0.135m、连头带茧 0.6m 上下——比第一版那只口袋小一圈 ──
  const hook = Along(L - bladeLen * 0.48, 0);              // 刀勾住裹布的那一点
  const sway = Math.sin(t * 2.6) * 1.6 * S;
  // 头心：钩点就在脑袋的左上沿——布是从后背勾住的，刀从脑袋后头穿上去
  const cx2 = hook[0] + 10 * S, cy2 = hook[1] + 18 * S;
  const hr = 20 * S;                                       // 头半径
  const B = (x, y) => [cx2 + x * S, cy2 + y * S];          // 以头心为原点的局部坐标（单位 S）
  // 茧：领口在下巴底下 22，肩最宽 ±36，脚那头 ±22，底圆；下半截随风略摆
  const cocoon = Spline([
    B(-30, 24), B(0, 20), B(30, 24), B(37, 56), B(35, 96),
    B(28 + sway * 0.6, 136), B(12 + sway, 160), B(-10 + sway, 160), B(-26 + sway * 0.6, 138),
    B(-36, 98), B(-38, 56),
  ], 5);
  // 垂下来的那一角：从茧的左下摆散开、垂到更低的地方，末端在风里略摆
  const cTop = [B(-30 + sway * 0.4, 128), B(-4 + sway * 0.8, 160)];
  const cTip = B(-24 + sway * 1.6, 220);
  const cornerPts = [
    cTop[0], cTop[1],
    B(0 + sway * 1.2, 188), cTip,
    B(-46 + sway * 0.9, 182),
  ];
  // 蓝布（那一角在光里）：靠外的那条边被日头打亮，根上沉在茧的影子里
  const cg = ctx.createLinearGradient(cTop[0][0], cTop[0][1], cTip[0], cTip[1]);
  cg.addColorStop(0, "#1c2c48");
  cg.addColorStop(1, "#3d5c8a");
  InkFill(ctx, cornerPts, "byCorner", cg, { amp: 2.0 * S, lw: 2.4 * S, line: "rgba(6,8,14,0.9)", shade: "rgba(0,0,0,0.22)", shadeAt: 0.62 });
  // 四瓣一簇的米白小花：跟整布卡（wholeCloth）同一簇画法
  const Bloom = (bx, by, alpha, i) => {
    ctx.fillStyle = `rgba(206,212,222,${alpha})`;
    for (let p2 = 0; p2 < 4; p2 += 1) {
      const pa = (p2 / 4) * Math.PI * 2 + Hash("byBloomP" + i) * 2;
      ctx.beginPath();
      ctx.ellipse(bx + Math.cos(pa) * 3.0 * S, by + Math.sin(pa) * 2.2 * S, 1.8 * S, 1.3 * S, pa, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  // 那一角上的花：撒在三角形里（重心坐标）——一张摊开的格子再各抖一点，
  // 纯随机撒有一半会挤成一团（第一版实拍就是三朵叠在一处）
  ctx.save();
  ctx.beginPath();
  WobblyPath(ctx, cornerPts, "byCorner", 2.0 * S, true);
  ctx.clip();
  const BLOOM_UV = [[0.22, 0.14], [0.58, 0.16], [0.30, 0.42], [0.60, 0.34], [0.14, 0.62], [0.40, 0.56], [0.24, 0.84], [0.72, 0.10], [0.46, 0.30]];
  for (let i = 0; i < BLOOM_UV.length; i += 1) {
    const ku = BLOOM_UV[i][0] + (Hash("byBloomX" + i) - 0.5) * 0.08;
    const kv = BLOOM_UV[i][1] + (Hash("byBloomY" + i) - 0.5) * 0.08;
    Bloom(cTop[0][0] + (cTop[1][0] - cTop[0][0]) * ku + (cTip[0] - cTop[0][0]) * kv,
      cTop[0][1] + (cTop[1][1] - cTop[0][1]) * ku + (cTip[1] - cTop[0][1]) * kv, 0.78, i);
  }
  ctx.restore();

  // 茧身：背着光的蓝布——比那一角暗两档，但要跟兵的黑分得开
  const cocoonFill = ctx.createLinearGradient(cx2, cy2 + 20 * S, cx2, cy2 + 160 * S);
  cocoonFill.addColorStop(0, "#152239");
  cocoonFill.addColorStop(1, "#203352");
  InkFill(ctx, cocoon, "byCocoon", cocoonFill, { ...F, amp: 1.8 * S, shade: "rgba(0,0,0,0.28)", shadeAt: 0.55 });
  ctx.save();
  ctx.beginPath();
  WobblyPath(ctx, cocoon, "byCocoon", 1.8 * S, true);
  ctx.clip();
  // 布上的花（在影子里只剩淡淡一层）
  const COC_UV = [[-22, 44], [12, 40], [-6, 66], [24, 74], [-26, 84], [4, 96], [26, 108], [-14, 116], [10, 132], [-22, 140], [-2, 150], [20, 138]];
  for (let i = 0; i < COC_UV.length; i += 1) {
    const [ux2, uy2] = COC_UV[i];
    const [bx, by] = B(ux2 + (Hash("byCocX" + i) - 0.5) * 6 + sway * (uy2 / 160), uy2 + (Hash("byCocY" + i) - 0.5) * 6);
    Bloom(bx, by, 0.30, 20 + i);
  }
  // 裹布的两道边：从左肩斜掖到右胯的那一道，下摆再折回来一道——
  // 每道边上一线亮的包边、边底下压一道影，"裹着"全靠这两笔
  const Fold = (p0, pc, p1) => {
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(0,0,0,0.42)"; ctx.lineWidth = 6 * S;
    ctx.beginPath(); ctx.moveTo(p0[0], p0[1] + 3 * S); ctx.quadraticCurveTo(pc[0], pc[1] + 3 * S, p1[0], p1[1] + 3 * S); ctx.stroke();
    ctx.strokeStyle = "rgba(150,165,190,0.55)"; ctx.lineWidth = 2.0 * S;
    ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.quadraticCurveTo(pc[0], pc[1], p1[0], p1[1]); ctx.stroke();
  };
  Fold(B(-38, 52), B(-4, 100), B(30 + sway * 0.4, 130));            // 斜掖过胸前
  Fold(B(30 + sway * 0.4, 130), B(6 + sway * 0.8, 152), B(-24 + sway * 0.6, 142));   // 下摆折回来
  Fold(B(-32, 24), B(0, 40), B(32, 24));                              // 领口那道弯
  ctx.restore();
  // 刀上拧着的那一小把裹布：后背的布被刀背勾住、拧成一把——画在脑袋后头
  InkFill(ctx, Spline([
    [hook[0] - 12 * S, hook[1] - 6 * S], [hook[0] + 8 * S, hook[1] - 10 * S], [hook[0] + 16 * S, hook[1] + 4 * S],
    [hook[0] + 6 * S, hook[1] + 16 * S], [hook[0] - 12 * S, hook[1] + 10 * S],
  ], 4), "byHookCloth", "#182640", { ...F, amp: 1.2 * S });
  // 脖颈：一小截黑，接在下巴底下
  InkFill(ctx, [B(-9, 14), B(9, 14), B(11, 26), B(-11, 26)], "byBabyNeck", INK, { ...F, amp: 0.8 * S });
  // 头：一颗圆脑袋（孩子的头大而圆，下巴几乎没有），逆着光是黑的
  InkFill(ctx, Spline([
    B(0, -20), B(15, -14), B(20, 0), B(15, 14), B(0, 20), B(-15, 14), B(-20, 0), B(-15, -14),
  ], 5), "byBabyHead", INK, { ...F, amp: 1.2 * S });
  // 几缕胎发，从头顶翘出来
  ctx.save();
  ctx.strokeStyle = INK; ctx.lineWidth = 1.8 * S; ctx.lineCap = "round";
  for (let i = 0; i < 5; i += 1) {
    const a = -Math.PI * (0.32 + i * 0.09);
    const [x0, y0] = B(Math.cos(a) * 19, Math.sin(a) * 19);
    const [x1, y1] = B(Math.cos(a - 0.35) * 26, Math.sin(a - 0.35) * 26);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  // 逆光的一线边：头顶与茧的左肩各一道亮边——圆的东西背着光就该有这一线
  ctx.strokeStyle = "rgba(196,188,172,0.55)"; ctx.lineWidth = 2.0 * S;
  ctx.beginPath(); ctx.arc(cx2, cy2, hr - 1.2 * S, Math.PI * 1.05, Math.PI * 1.62); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(...B(-33, 30)); ctx.quadraticCurveTo(...B(-40, 60), ...B(-37, 92)); ctx.stroke();
  ctx.restore();
  // 刀尖再压回来：从脑袋上头露出来的那一截
  DrawBlade(L - bladeLen * 0.30, L);

  // ── 角晕 + 纸纹：这一帧是硬切进来的一张画，四角收黑让它读成"一帧" ──
  const v = ctx.createRadialGradient(X(0.5), Y(0.46), H * 0.30, X(0.5), Y(0.5), H * 0.98);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(6,5,4,0.62)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  Speckle(ctx, 0, 0, W, H, "byGrain", { count: Math.round(W / 6), alpha: 0.06, size: 2.2 });
}

// 过场活动插卡的登记表：World.SetInsertCard 见到这里的名字就走每帧重画那条路。
// 新加一张卡＝这里登记 + 剧本行 cam: { kind: "insertCard", card: 名字, seg: n }
export const INSERT_LIVE = {
  raidMoto: DrawRaidMotoCard,
  motherJacket: DrawMotherJacketCard,
  villageRiders: DrawVillageRidersCard,
  wholeCloth: DrawWholeClothCard,
  strangerFace: DrawStrangerFaceCard,
  mendedSleeve: DrawMendedSleeveCard,
  bayonet: DrawBayonetCard,
};

// ---------------------------------------------------------------------------
// 刨料特写卡（会动的那一张，和下面的划线卡同一套路数）。
//
// 为什么也得单独画一张：世界里那把刨子只有 0.34m，2.05m 的特写下在 844×390 的
// 手机上只有 **90×45 像素**——一块木头色的小方块，摆在木头色的台面上、人身子
// 前面。实测（真触摸事件）机制是通的、三趟都推得完，但玩家**认不出那是能抓的
// 东西**，推到头也不知道要拖回来。用户为此退回过两次。
// 结论与石笔同源（CLAUDE.md 拟物交互第 4 条）：手指按不着/认不出的东西，
// 推镜头治不好，得换成铺满画框的手绘活卡。
//
// 版面由 Core 的 PLANE_CARD 定（判定与作画共用同一套归一化坐标）。

// 料：刨过的那一段发亮、边是齐的；没刨的还毛着，上沿一层茬。
function PlaneBoard(ctx, W, H, S, L, view) {
  const top = H * L.v;                       // 料的上表面＝刨底走的那条线
  const bot = H * (L.v + 0.18);
  const x0 = -40 * S, x1 = W + 40 * S;
  const smooth = Math.max(0, Math.min(1, view.smooth || 0));
  // 整块料的底色随"刨了几趟"从旧木转成新木的黄。毛料也得是木头色，
  // 别调成灰的——上一版灰得像一条水泥台，整张卡就废了。
  const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
  const [r, g, b] = mix([176, 146, 104], [226, 182, 116], smooth);
  InkFill(ctx, [[x0, top], [x1, top], [x1, bot], [x0, bot]], "pcBoard",
    `rgb(${r},${g},${b})`, { amp: 3 * S, lw: 6 * S, shade: "rgba(0,0,0,0.16)", shadeAt: 0.0 });
  // 本趟已经刨过的那一段（刨底左边）：亮一层，上沿一道顺光
  const headX = W * (L.u0 + (view.head ?? 0) * (L.u1 - L.u0));
  if (view.armed !== false) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, top - 8 * S, Math.max(0, headX - x0), (bot - top) * 0.55);
    ctx.clip();
    ctx.globalAlpha = 0.30;
    ctx.fillStyle = "#f0d49a";
    ctx.fillRect(x0, top, W, (bot - top) * 0.55);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.5;
    InkLine(ctx, x0 + 10 * S, top + 7 * S, Math.max(x0 + 12 * S, headX - 10 * S), top + 6 * S,
      "pcSheen", { lw: 4 * S, color: "#fdf0c8", amp: 2 * S });
    ctx.restore();
  }
  // 还没刨到的那一段：上沿一层毛茬（右边）
  ctx.save();
  ctx.globalAlpha = 0.42;
  for (let i = 0; i < 60; i += 1) {
    const px = headX + 14 * S + i * 26 * S;
    if (px > x1) break;
    const hgt = (3 + Hash("pcFuzz" + i) * 8) * S * (1 - smooth * 0.55);
    InkLine(ctx, px, top + 2 * S, px + (Hash("pcFz2" + i) - 0.5) * 6 * S, top - hgt,
      "pcFuzz" + i, { lw: 2.4 * S, color: "rgba(96,72,44,0.65)", amp: 1.5 * S });
  }
  ctx.restore();
  // 木纹
  for (let i = 0; i < 7; i += 1) {
    const gy = top + (26 + i * 22) * S;
    if (gy > bot - 6 * S) break;
    InkLine(ctx, x0, gy, x1, gy + (Hash("pcG" + i) - 0.5) * 18 * S,
      "pcGrain" + i, { lw: 2.6 * S, color: "rgba(92,60,34,0.22)", amp: 20 * S });
  }
}

// 刨子：中式长刨——一块矮墩墩的木身，斜插刨刀，一根横楔穿过身子当把手。
// 整组按 (cx, baseY) 摆：baseY 是刨底贴着料的那条线。
//
// 构图跟石笔卡同一套语法：**一件大家伙 + 一只攥住它的手 + 一截出画的小臂**。
// 手在做功方向的后上方（左上），绝不横过刚刨亮的那一段——那是拿掉进度条
// 换来的东西，手一盖就白拿了。两只手试过，拳头把刨子挤没了，改回一只。
function PlaneInHand(ctx, cx, baseY, S, lift, tilt, cutting, skin) {
  ctx.save();
  ctx.translate(cx, baseY - lift);
  ctx.rotate(tilt);
  // 小臂：从左上压下来，出上画框
  InkFill(ctx, [
    [-200 * S, -142 * S], [-78 * S, -176 * S], [150 * S, -760 * S], [-10 * S, -780 * S],
  ], "pcArm", "#6d5340", { amp: 4 * S, lw: 7 * S, shade: "rgba(0,0,0,0.20)" });
  // 袖口
  InkFill(ctx, [
    [-196 * S, -136 * S], [-86 * S, -170 * S], [-54 * S, -252 * S], [-176 * S, -224 * S],
  ], "pcCuff", "#7b6448", { amp: 3 * S, lw: 6 * S, shade: "rgba(0,0,0,0.18)" });
  // 刨身：长而矮，一眼是刨不是砖
  InkFill(ctx, [
    [-196 * S, -84 * S], [192 * S, -90 * S], [202 * S, -4 * S], [-204 * S, 2 * S],
  ], "pcBody", "#8d6236", { amp: 3 * S, lw: 7 * S, shade: "rgba(0,0,0,0.20)" });
  // 木纹一道，读得出是木头
  InkLine(ctx, -168 * S, -44 * S, 168 * S, -48 * S, "pcBodyGrain",
    { lw: 3.4 * S, color: "rgba(70,45,25,0.4)", amp: 6 * S });
  // 刨口（斜槽）与露出来的刨刀
  InkFill(ctx, [[36 * S, -88 * S], [86 * S, -90 * S], [56 * S, -2 * S], [16 * S, -2 * S]],
    "pcThroat", "#43301c", { amp: 2 * S, lw: 4.5 * S });
  InkFill(ctx, [[30 * S, -168 * S], [88 * S, -170 * S], [80 * S, -80 * S], [26 * S, -80 * S]],
    "pcBlade", "#b9b3a4", { amp: 1.8 * S, lw: 5.5 * S, shade: "rgba(0,0,0,0.24)" });
  // 横楔：穿过刨身伸出两头，手就攥这根
  InkFill(ctx, [
    [-252 * S, -76 * S], [252 * S, -82 * S], [252 * S, -40 * S], [-252 * S, -34 * S],
  ], "pcBar", "#a8794a", { amp: 2.4 * S, lw: 6 * S, shade: "rgba(0,0,0,0.18)" });
  // 攥住横楔的那只拳头（在刨身左上，压着横楔的近端）
  InkFill(ctx, [
    [-196 * S, -152 * S], [-78 * S, -160 * S], [-50 * S, -94 * S],
    [-86 * S, -38 * S], [-180 * S, -34 * S], [-214 * S, -94 * S],
  ], "pcFist", skin, { amp: 3.4 * S, lw: 7 * S, shade: "rgba(70,40,22,0.16)" });
  for (let i = 0; i < 3; i += 1) {
    InkLine(ctx, -172 * S + i * 40 * S, -142 * S, -166 * S + i * 40 * S, -84 * S,
      "pcK" + i, { lw: 3.6 * S, color: "rgba(118,74,44,0.45)", amp: 3 * S });
  }
  ctx.restore();
  // 刨花：只有真在吃木头时才从刨口卷出来
  if (cutting > 0.02) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, cutting);
    DrawShaving(ctx, cx + 96 * S, baseY - lift - 138 * S, 2.8 * S, 0.9, "pcCurl");
    DrawShaving(ctx, cx + 176 * S, baseY - lift - 92 * S, 2.0 * S, 0.6, "pcCurl2");
    ctx.restore();
  }
}

/**
 * 每帧重画的刨料卡。view = Core 的 state.planeCard，L = PLANE_CARD，t = 秒。
 */
export function DrawPlaneCard(ctx, W, H, view, L, t) {
  const S = H / 720;
  const head = Math.max(0, Math.min(1, view.head || 0));
  const headX = W * (L.u0 + head * (L.u1 - L.u0));
  const baseY = H * L.v;

  LiveCardBase(ctx, W, H, "#dcc79e");
  // 台面：料下面那块大板
  InkFill(ctx, [[-40 * S, H * (L.v + 0.18)], [W + 40 * S, H * (L.v + 0.18)],
    [W + 40 * S, H + 40 * S], [-40 * S, H + 40 * S]], "pcBench", "#7c5a37",
  { amp: 3 * S, lw: 7 * S, shade: "rgba(0,0,0,0.30)", shadeAt: 0.0 });
  PlaneBoard(ctx, W, H, S, L, view);

  // 地上那堆刨花（右下角，越刨越多）
  if (view.pile > 0) {
    ctx.save();
    ctx.translate(W * 0.09, H * 0.955);
    DrawShavingPile(ctx, 0, 0, view.pile, "pcPile");
    ctx.restore();
  }

  const gripped = !!view.gripped;
  // 推到头了得拖回来：刨子**抬离料面**、鼻子翘起来——木匠回程本来就是抬着走的，
  // 画面自己把"这趟完了，往回带"说清楚，不用一根轨道也不用一行字
  const back = view.armed === false;
  const lift = (back ? 26 : 0) * S + (gripped ? 0 : 6 * S)
    + (gripped ? 0 : Math.sin(t * 3.4) * 3 * S);
  const tilt = back ? -0.07 : 0;

  // 没攥住就透一圈会呼吸的光（按错地方闪快些催一下）
  if (!gripped) {
    const pulse = view.reaching ? 0.55 + 0.4 * Math.sin(t * 13) : 0.45 + 0.35 * Math.sin(t * 3.0);
    const r = L.grabR * W * 1.15;
    ctx.save();
    ctx.globalAlpha = 0.20 + pulse * 0.26;
    const g = ctx.createRadialGradient(headX, baseY - lift - 70 * S, r * 0.1,
      headX, baseY - lift - 70 * S, r);
    g.addColorStop(0, "rgba(255,242,200,0.95)");
    g.addColorStop(0.55, "rgba(255,232,172,0.30)");
    g.addColorStop(1, "rgba(255,232,172,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(headX, baseY - lift - 70 * S, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  PlaneInHand(ctx, headX, baseY, S, lift, tilt,
    gripped && !back ? Math.min(1, 0.35 + (view.speed || 0) * 2.2) : 0, PAL.skin);

  const vg = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.42, W * 0.5, H * 0.5, H * 0.95);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(20,14,8,0.30)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------------------
// 划线特写卡（**会动的那一张**）：和上面几张定格插卡同一个景别、同一支笔，
// 区别是它每帧重画——因为玩家的手就按在这张卡上，攥着画面里那支石笔。
//
// 为什么这一下要单独画一张、而不是把世界里的镜头再推近：那支笔在世界里只有
// 9 厘米，1.9 米的特写下也才十来个像素，手指根本按不着。插卡这个景别里，
// 手、笔、木头各占半个画框——按得着，也看得清笔尖蹭出来的每一粒粉。
//
// 版面（u 沿卡宽、v 沿卡高的归一化坐标）由 Core 的 SCRIBE_CARD 定，判定与
// 作画共用同一套数——改一处两边一起动，绝不许在这儿另写一份坐标。
// ---------------------------------------------------------------------------

// 已经划下的那一段印子：颗粒、断续、深浅不匀，是石笔蹭木纹的样子，
// 不是一条纯色的填充条（那就又变回进度条了）。
//
// 深浅按 press[] 一格一格取——那是当初蹭过这一格时的手速留下的，慢的地方
// 压得实、甩过去的地方是虚的。已经划下的那一段永远不再变：它是痕，不是读数。
function ChalkStroke(ctx, x0, x1, y, S, drawn, press) {
  ctx.save();
  ctx.fillStyle = "#f4e8c6";
  const bins = press?.length || 0;
  const span = x1 - x0;
  for (let x = x0; x < x0 + drawn * span; x += 1.6 * S) {
    const f = span > 0 ? (x - x0) / span : 0;
    const p = bins ? (press[Math.min(bins - 1, Math.floor(f * bins))] || 0.5) : 0.85;
    const u = (x - x0) / (60 * S);
    if (Math.sin(u * 39.1) > 0.60 + p * 0.28) continue;        // 蹭过木纹的坑，跳一粒
    const wob = Math.sin(u * 7.7) * 2.6 * S + Math.sin(u * 2.9 + 1.2) * 1.7 * S;
    ctx.globalAlpha = (0.46 + Math.abs(Math.sin(u * 11.3)) * 0.48) * p;
    ctx.fillRect(x, y + wob - 3.4 * S, 3.2 * S, (4.4 + p * 2.6) * S);
    if (Math.sin(u * 23.7) > 0.35) {                            // 掉下来的粉屑
      ctx.globalAlpha *= 0.32;
      ctx.fillRect(x + 1.2 * S, y + wob + 8 * S + Hash("cs" + Math.round(x)) * 16 * S, 2 * S, 2 * S);
    }
  }
  ctx.restore();
}

// 一支攥在拳头里的石笔：笔尖朝右下压着木头，笔杆往左上斜出去，
// 拳头攥在笔杆的后半截，小臂出画。整组按 (tx,ty) 摆——那是笔尖。
//
// 比例是这张卡的命根子：笔杆必须**露出来一大截**（拳头只攥后半段），
// 玩家一眼看见的得是"一支笔"，不是"一只拳头前面有个白点"。
function ChalkInHand(ctx, tx, ty, S, lean, skin, sleeve, cuff, { kid = false } = {}) {
  ctx.save();
  ctx.translate(tx, ty);
  ctx.rotate(lean);
  // 小臂先画（压在最底下）：一截出画的胳膊 + 袖口。
  // 手是同一双（都是庄稼人的手），认得出是谁靠这身短褂的颜色——
  // 第一章那只袖子是爹的土褐，第八章是柱子自己的那身。
  // kid 变奏（sisterTally）：妹妹的小手——胳膊细一圈、拳头小一号也圆一号，
  // 笔换成**磨秃的滑石片**（灰白、短粗，露在拳头外的只有一小截）
  const AW = kid ? 0.66 : 1;               // 胳膊的细
  InkFill(ctx, [
    [-330 * S, -52 * S * AW], [-820 * S, (10 - (kid ? 26 : 0)) * S], [-820 * S, (190 - (kid ? 46 : 0)) * S], [-336 * S, 88 * S * AW],
  ], "cardArm", sleeve, { amp: 4 * S, lw: 6.5 * S, shade: "rgba(0,0,0,0.20)" });
  InkFill(ctx, [
    [-260 * S, -62 * S * AW], [-340 * S, -46 * S * AW], [-348 * S, 86 * S * AW], [-266 * S, 92 * S * AW],
  ], "cardCuff", cuff, { amp: 3.4 * S, lw: 6 * S, shade: "rgba(0,0,0,0.18)" });
  if (kid) {
    // 磨秃的滑石片：短、粗、灰白。尖是磨圆的，不是削出来的
    InkFill(ctx, [
      [-8 * S, -30 * S], [-90 * S, -44 * S], [-170 * S, -40 * S],
      [-174 * S, 38 * S], [-92 * S, 40 * S], [-6 * S, 22 * S],
    ], "cardSoapBody", "#cfc9ba", { amp: 3 * S, lw: 5.5 * S, shade: "rgba(70,66,56,0.26)" });
    InkLine(ctx, -22 * S, -14 * S, -150 * S, -26 * S, "cardSoapEdge",
      { lw: 3.4 * S, color: "rgba(108,102,88,0.4)", amp: 3.4 * S });
    // 磨圆的秃尖
    InkFill(ctx, [[-12 * S, -26 * S], [8 * S, -8 * S], [7 * S, 12 * S], [-12 * S, 18 * S]],
      "cardSoapTip", "#e2ddd0", { amp: 2 * S, lw: 4.5 * S });
    // 石片上两道磨痕（它是使秃的，不是新的）
    for (let i = 0; i < 2; i += 1) {
      InkLine(ctx, (-30 - i * 40) * S, (6 + i * 8) * S, (-70 - i * 40) * S, (2 + i * 10) * S,
        "cardSoapWear" + i, { lw: 2 * S, color: "rgba(96,90,76,0.35)", amp: 2 * S });
    }
    // 小拳头：圆乎乎的一团，攥着石片的后半截
    InkFill(ctx, [
      [-112 * S, -62 * S], [-172 * S, -78 * S], [-224 * S, -40 * S], [-228 * S, 42 * S],
      [-176 * S, 76 * S], [-112 * S, 56 * S], [-98 * S, -4 * S],
    ], "cardFist", skin, { amp: 3.2 * S, lw: 6 * S, shade: "rgba(70,40,22,0.16)" });
    // 三道小指节（孩子的手，节短）
    for (let i = 0; i < 3; i += 1) {
      InkLine(ctx, -128 * S - i * 30 * S, -52 * S, -124 * S - i * 30 * S, -12 * S,
        "cardKnuck" + i, { lw: 3 * S, color: "rgba(118,74,44,0.45)", amp: 2.4 * S });
    }
    // 小拇指压在石片上
    InkFill(ctx, [
      [-128 * S, -56 * S], [-80 * S, -38 * S], [-70 * S, -6 * S], [-118 * S, -12 * S],
    ], "cardThumb", skin, { amp: 2.4 * S, lw: 5 * S, shade: "rgba(70,40,22,0.14)" });
    ctx.restore();
    return;
  }
  // 笔杆：后粗前细，磨秃的尖朝右下（本地坐标里朝 +x）。
  // 从笔尖一路伸到拳头里，露在外面的是 -12 → -175 这一大截。
  InkFill(ctx, [
    [-12 * S, -26 * S], [-150 * S, -50 * S], [-290 * S, -58 * S],
    [-292 * S, 44 * S], [-150 * S, 34 * S], [-12 * S, 20 * S],
  ], "cardChalkBody", "#e9dcbb", { amp: 2.6 * S, lw: 5.5 * S, shade: "rgba(84,62,34,0.22)" });
  // 笔杆上的一道棱：读得出是根柱子，不是一片纸
  InkLine(ctx, -30 * S, -12 * S, -270 * S, -40 * S, "cardChalkEdge",
    { lw: 4 * S, color: "rgba(120,92,52,0.32)", amp: 4 * S });
  // 磨出来的斜尖（压在木头上的那一头）
  InkFill(ctx, [[-16 * S, -24 * S], [10 * S, -6 * S], [8 * S, 12 * S], [-16 * S, 18 * S]],
    "cardChalkTip", "#f8efd6", { amp: 1.8 * S, lw: 4.5 * S });
  // 攥住笔杆后半截的拳头（侧面）：指节朝上，虎口卡着笔
  InkFill(ctx, [
    [-176 * S, -86 * S], [-248 * S, -104 * S], [-320 * S, -62 * S], [-326 * S, 56 * S],
    [-252 * S, 102 * S], [-172 * S, 76 * S], [-152 * S, -6 * S],
  ], "cardFist", skin, { amp: 3.6 * S, lw: 6.5 * S, shade: "rgba(70,40,22,0.16)" });
  // 四道指节
  for (let i = 0; i < 4; i += 1) {
    InkLine(ctx, -190 * S - i * 36 * S, -74 * S, -186 * S - i * 36 * S, -18 * S,
      "cardKnuck" + i, { lw: 3.6 * S, color: "rgba(118,74,44,0.5)", amp: 3 * S });
  }
  // 拇指压在笔杆上（伸到拳头前面来，抵住笔）
  InkFill(ctx, [
    [-190 * S, -78 * S], [-126 * S, -54 * S], [-112 * S, -12 * S], [-176 * S, -18 * S],
  ], "cardThumb", skin, { amp: 2.6 * S, lw: 5.5 * S, shade: "rgba(70,40,22,0.14)" });
  ctx.restore();
}

/**
 * 每帧重画的划线卡。
 * view：Core 的 state.scribeCard + World 补的 t（秒）与版面 L（SCRIBE_CARD）。
 */
export function DrawScribeCard(ctx, W, H, view, L, t) {
  const S = H / 720;                       // 以卡高归一，构图不随分辨率变
  const uX = (u) => u * W;                 // 归一化 → 画布像素
  const vY = (v) => v * H;
  const lineY = vY(L.v);
  const x0 = uX(L.u0), x1 = uX(L.u1);
  const head = Math.max(0, Math.min(1, view.head || 0));
  const drawn = Math.max(0, Math.min(1, view.drawn || 0));
  const headX = x0 + head * (x1 - x0);

  LiveCardBase(ctx, W, H, "#c9b48c");

  // 立柱：右边大半个画框都是这根木头。左缘那道亮边把"正面"读出来
  const postX = uX(0.435);
  InkFill(ctx, Rect(postX, -20 * S, W - postX + 40 * S, H + 40 * S), "cardPost", PAL.wood,
    { amp: 4 * S, lw: 7 * S, shade: "rgba(0,0,0,0.16)", shadeAt: 0.62 });
  ctx.save();
  ctx.globalAlpha = 0.26;
  ctx.fillStyle = "#e6c894";
  ctx.fillRect(postX, 0, 26 * S, H);
  ctx.restore();
  // 木纹：竖着走，间距不匀
  for (let i = 0; i < 7; i += 1) {
    const gx = postX + (60 + i * 118) * S + Hash("cardGrain" + i) * 40 * S;
    if (gx > W) break;
    InkLine(ctx, gx, -30 * S, gx + (Hash("cardGrainD" + i) - 0.5) * 46 * S, H + 30 * S,
      "cardGrainL" + i, { lw: 3 * S, color: "rgba(92,60,34,0.34)", amp: 26 * S });
  }

  // 卡面变奏（Core 的 def.cardStyle）：可以是一张配置对象，也可以是一个名字。
  // "sisterTally"（第七稿 c1_draw）＝妹妹画正字那拍：握笔的是**小孩的小手**
  // （袖口暗红——妹妹那身）、笔是磨秃的滑石片、左边已有前两天歪歪扭扭的
  // 旧道道；没人靠着框（画个人影就成了闹鬼）。木面仍是门框立柱。
  const style = view.style || {};
  const sisterTally = style === "sisterTally";

  // 被量的那个人：柱子背靠木头站直了，**头顶正好顶在这条线上**——
  // 这道线量的是什么，画面自己说，不用旁白讲。侧影，不抢前景那只手。
  // （量身变奏才有；正字那拍谁也没靠着框，画个人影就成了闹鬼）
  if (!sisterTally && style.silhouette !== false) {
    ctx.save();
    ctx.globalAlpha = 0.46;
    const kx = uX(0.735);
    const kTop = lineY + 6 * S;                 // 头顶，就压在线下面
    InkFill(ctx, [                              // 肩与身子，出下画框
      [kx - 128 * S, H + 30 * S], [kx - 112 * S, kTop + 218 * S], [kx - 58 * S, kTop + 172 * S],
      [kx + 56 * S, kTop + 176 * S], [kx + 116 * S, kTop + 224 * S], [kx + 132 * S, H + 30 * S],
    ], "cardKidBody", "#584330", { amp: 5 * S, lw: 0, line: null });
    InkFill(ctx, [                              // 脖子
      [kx - 30 * S, kTop + 128 * S], [kx + 30 * S, kTop + 128 * S],
      [kx + 32 * S, kTop + 182 * S], [kx - 32 * S, kTop + 182 * S],
    ], "cardKidNeck", "#584330", { amp: 3 * S, lw: 0, line: null });
    InkFill(ctx, [                              // 侧脸：额头、鼻梁、下巴朝左
      [kx - 62 * S, kTop + 60 * S], [kx - 52 * S, kTop + 20 * S], [kx - 8 * S, kTop],
      [kx + 44 * S, kTop + 10 * S], [kx + 68 * S, kTop + 56 * S], [kx + 62 * S, kTop + 112 * S],
      [kx + 20 * S, kTop + 140 * S], [kx - 36 * S, kTop + 130 * S], [kx - 70 * S, kTop + 96 * S],
    ], "cardKidHead", "#584330", { amp: 3.6 * S, lw: 0, line: null });
    InkFill(ctx, [                              // 鼻尖那一点，侧影才不是个罐子
      [kx - 66 * S, kTop + 76 * S], [kx - 88 * S, kTop + 90 * S], [kx - 64 * S, kTop + 100 * S],
    ], "cardKidNose", "#584330", { amp: 2 * S, lw: 0, line: null });
    ctx.restore();
  }

  // 正字变奏：前两天画的两笔已经在木头上——横、竖（笔顺就是这么排的），
  // 玩家手里的引导线正是第三笔（当中那道横）。几何与 DrawDoorframe 里那个
  // 简化的"正"同一套：上横满宽、中竖从上横当中垂到底。旧粉痕画法也照抄
  // 世界里的两笔：暗底垫一道，淡白痕才立得住
  const tallyDone = style.tallyDone || 0;
  if (tallyDone > 0) {
    const cw = x1 - x0;
    const topY = lineY - cw * 0.42;
    const botY = lineY + cw * 0.36;
    const cx = (x0 + x1) / 2;
    const seg = [
      [x0 - 6 * S, topY, x1 + 4 * S, topY + 3 * S],   // 第一天：上横
      [cx, topY + 2 * S, cx + 4 * S, botY],            // 第二天：中竖（穿过今天要画的这条线）
    ];
    for (let i = 0; i < Math.min(tallyDone, seg.length); i += 1) {
      const [ax, ay, bx, by] = seg[i];
      InkLine(ctx, ax, ay + 2.5 * S, bx, by + 2.5 * S, "cardTyD" + i,
        { lw: 7 * S, color: "rgba(52,38,22,0.42)", amp: 2.2 * S });
      InkLine(ctx, ax, ay, bx, by, "cardTy" + i,
        { lw: 5 * S, color: "rgba(236,222,188,0.78)", amp: 2.2 * S });
    }
  }

  // sisterTally：前两天她自己画的两道，就在刻线区**左边**——歪歪扭扭的
  // 石笔浅痕，一天一道。今天这道（玩家手里的）画完，那儿就是三道。
  // 画法同世界里的道道：暗底垫一道，淡白痕才立得住；孩子的手劲不匀，
  // 每道的深浅、斜度、长短都不一样
  if (sisterTally) {
    const cw = x1 - x0;
    // 立柱西缘到刻线起点只有 0.07 个画宽——两道旧痕收在这条窄边里，
    // 短短的、一道压着一道的斜，长短还不一样（孩子一天一道画出来的）
    for (let i = 0; i < 2; i += 1) {
      const mx1 = x0 - cw * (0.045 + i * 0.02);
      const mx0 = Math.max(postX + 8 * S, mx1 - cw * (0.13 + Hash("cardSisLen" + i) * 0.05));
      const my = lineY + (i ? 26 : -20) * S + Sym("cardSisY", i, 6 * S);
      const tiltDy = Sym("cardSisT", i, 8 * S);
      InkLine(ctx, mx0, my + 2.5 * S, mx1, my + tiltDy + 2.5 * S, "cardSisD" + i,
        { lw: 6 * S, color: "rgba(52,38,22,0.42)", amp: 4 * S });
      InkLine(ctx, mx0, my, mx1, my + tiltDy, "cardSis" + i,
        { lw: 4.4 * S, color: "rgba(230,216,182,0.66)", amp: 4 * S });
    }
  }

  // 第八章：爹当年给柱子刻的那道旧痕早就在木头上了。它在**新线上头**——
  // 那年的柱子（1.28m）比今天的妹妹（1.08m）高，两个数在 Data 里摆着，
  // 画面不许跟它对不上。两道线之间隔着的东西，画面自己会说。
  if (view.oldMark) {
    const oy = lineY - 168 * S;
    InkLine(ctx, x0 - 10 * S, oy, x1 + 10 * S, oy - 3 * S, "cardOldMark",
      { lw: 5.5 * S, color: "rgba(74,48,26,0.5)", amp: 2.6 * S });
    InkLine(ctx, x0 - 8 * S, oy - 4 * S, x1 + 8 * S, oy - 7 * S, "cardOldMarkHi",
      { lw: 3 * S, color: "rgba(238,224,178,0.42)", amp: 2.6 * S });
  }

  // 还没划到的那一段：木头上一道极淡的墨斗印（要划到哪儿，看得见）
  ctx.save();
  ctx.globalAlpha = 0.30;
  ctx.setLineDash([10 * S, 12 * S]);
  ctx.beginPath();
  ctx.moveTo(x0, lineY);
  ctx.lineTo(x1, lineY);
  ctx.strokeStyle = "#5c4128";
  ctx.lineWidth = 3.4 * S;
  ctx.stroke();
  ctx.restore();

  // 已经划下的印子
  if (drawn > 0.002) ChalkStroke(ctx, x0, x1, lineY, S, drawn, view.press);

  // 那支笔本身就是这一拍的全部 UI：
  //   攥住了 → 压进木头、按手劲往后倒；没攥住 → 抬起来轻轻晃，招呼玩家来拿
  // 手从**左上方**压下来（笔杆朝左上、小臂出上画框）。这不是构图偏好，是必需的：
  // 手要是横在刻线那一头，玩家刚划出来的印子就全被自己的拳头盖住了，
  // "看得见自己划了多少"当场作废——那正是我们要拿掉进度条换来的东西。
  const gripped = !!view.gripped;
  const wob = gripped ? 0
    : Math.sin(t * (view.reaching ? 15 : 4.6)) * (view.reaching ? 9 : 5) * S;
  const lift = gripped ? 0 : 14 * S;
  // 压着走时笔杆往后倒（手在推），抬起来就立回去一点
  const lean = gripped ? 0.62 - Math.min(0.16, (view.speed || 0) * 0.8) : 0.70;
  const tipX = headX + wob * 0.4;
  const tipY = lineY - lift + wob * 0.5;

  // 没攥住的时候，笔身后面透出一圈会呼吸的光，把这支笔从木头上"提"起来——
  // "按这儿"由那支笔自己说，不用一行字，更不用一根轨道
  if (!gripped) {
    const gx = tipX + L.gripDU * W, gy = tipY + L.gripDV * H;
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.1);
    const r = L.grabR * W * 1.35;
    ctx.save();
    ctx.globalAlpha = 0.26 + pulse * 0.30;
    const g = ctx.createRadialGradient(gx, gy, r * 0.12, gx, gy, r);
    g.addColorStop(0, "rgba(255,240,196,0.95)");
    g.addColorStop(0.55, "rgba(255,232,172,0.34)");
    g.addColorStop(1, "rgba(255,232,172,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(gx, gy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // 笔尖底下一小片影子：笔是**抬起来**的，落回木头才开始出印子
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "rgba(60,38,18,1)";
    ctx.beginPath();
    ctx.ellipse(headX, lineY + 8 * S, 34 * S, 8 * S, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // sisterTally：小孩的小手 + 磨秃的滑石片，袖口是妹妹那身的暗红（压两档）
  ChalkInHand(ctx, tipX, tipY, S, lean, PAL.skin,
    sisterTally ? "#5e3038" : view.selfMark ? PAL.zhuzi : "#6d5340",
    sisterTally ? "#4a262d" : view.selfMark ? PAL.zhuziDark : "#7b6448",
    { kid: sisterTally });

  // 笔尖的粉尘：只有真在蹭木头才扬起来
  const dust = gripped ? Math.min(1, 0.35 + (view.speed || 0) * 2.4) : 0;
  if (dust > 0.02) {
    ctx.save();
    ctx.globalAlpha = dust * 0.75;
    ctx.fillStyle = "#f4e8c6";
    for (let i = 0; i < 9; i += 1) {
      const a = i * 1.9 + t * 1.4;
      ctx.fillRect(headX + Math.cos(a) * (8 + i * 5) * S,
        lineY + 10 * S + Math.abs(Math.sin(a)) * (10 + i * 6) * S, 3.4 * S, 3.4 * S);
    }
    ctx.restore();
  }

  // 四角压暗，和别的插卡一个调子
  const vg = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.3, W * 0.5, H * 0.5, H * 0.86);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(20,14,8,0.55)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------------------
// 序章画卡：水墨地图＋剪纸剪影＋定格画片。1–9 段是冷的历史（羊皮纸上的墨），
// 10–14 段进村转暖（水彩的生活）。构图对着「关卡设计·第一章」的分镜表画。
// ---------------------------------------------------------------------------
const MAP_INK = "#33261a";

// 羊皮纸地图底：偏冷的纸色 + 平原的淡痕
function MapBase(ctx, W, H, id) {
  const g = ctx.createRadialGradient(W * 0.5, H * 0.44, H * 0.12, W * 0.5, H * 0.5, H * 0.9);
  g.addColorStop(0, "#ddcda6");
  g.addColorStop(1, "#8d7a58");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // 平原上的淡水系（地图的底纹）
  for (let i = 0; i < 4; i += 1) {
    InkLine(ctx, W * (0.1 + Hash(id + "r" + i) * 0.3), H * (0.15 + i * 0.2),
      W * (0.6 + Hash(id + "r2" + i) * 0.35), H * (0.3 + i * 0.18),
      id + "river" + i, { lw: 2.2, color: "rgba(90,110,120,0.28)", amp: 14 });
  }
  Speckle(ctx, 0, 0, W, H, id + "grain", { count: Math.round(W / 7), alpha: 0.06, size: 2.6 });
}

// 一团渗开的墨（占领区）：核心实、边缘破碎
function InkBlot(ctx, x, y, r, id, alpha = 0.8) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const pts = [];
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const rr = r * (0.65 + Hash(id + "b" + i) * 0.55);
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.82]);
  }
  InkFill(ctx, pts, id, MAP_INK, { amp: r * 0.14, lw: 0, line: null });
  for (let i = 0; i < 7; i += 1) {
    const a = Hash(id + "s" + i) * Math.PI * 2;
    const rr = r * (1.0 + Hash(id + "s2" + i) * 0.5);
    InkFill(ctx, [[x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.4]],
      id + "sp" + i, null, { line: null, lw: 0 });
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8, r * (0.05 + Hash(id + "s3" + i) * 0.06), 0, Math.PI * 2);
    ctx.fillStyle = MAP_INK;
    ctx.fill();
  }
  ctx.restore();
}

// 村落小点：留在原地的人
function MapDots(ctx, W, H, id, count, alpha = 0.75) {
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i += 1) {
    const x = W * (0.12 + Hash(id + "x" + i) * 0.76);
    const y = H * (0.2 + Hash(id + "y" + i) * 0.62);
    ctx.beginPath();
    ctx.arc(x, y, H * 0.008 + Hash(id + "r" + i) * H * 0.006, 0, Math.PI * 2);
    ctx.strokeStyle = MAP_INK;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

// 剪影人（剪纸风）：几笔的人形，朝 dir 走
function SilFigure(ctx, x, y, h, id, dir = 1, { carry = false } = {}) {
  const w = h * 0.34;
  InkFill(ctx, [
    [x - w * 0.5 * dir, y], [x - w * 0.34 * dir, y - h * 0.55], [x - w * 0.1 * dir, y - h * 0.72],
    [x + w * 0.26 * dir, y - h * 0.66], [x + w * 0.5 * dir, y - h * 0.3], [x + w * 0.3 * dir, y],
  ], id + "b", "#241a10", { amp: h * 0.04, lw: 0, line: null });
  ctx.beginPath();
  ctx.arc(x + w * 0.02 * dir, y - h * 0.84, h * 0.13, 0, Math.PI * 2);
  ctx.fillStyle = "#241a10";
  ctx.fill();
  if (carry) {
    InkLine(ctx, x - w * 0.7 * dir, y - h * 0.62, x + w * 0.7 * dir, y - h * 0.78, id + "pole",
      { lw: h * 0.05, color: "#241a10", amp: h * 0.02 });
  }
}

export function DrawPrologueCard(ctx, W, H, kind) {
  const cx = W * 0.5, cy = H * 0.5;
  const S = H / 420;
  switch (kind) {
    case "pro1": {
      // 卢沟桥：一点墨从宛平渗开；桥的剪影压在下缘
      MapBase(ctx, W, H, "p1");
      MapDots(ctx, W, H, "p1d", 14, 0.4);
      InkBlot(ctx, cx + W * 0.08, cy - H * 0.1, H * 0.09, "p1blot");
      // 枪声的放射短线
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2 + 0.2;
        InkLine(ctx, cx + W * 0.08 + Math.cos(a) * H * 0.12, cy - H * 0.1 + Math.sin(a) * H * 0.1,
          cx + W * 0.08 + Math.cos(a) * H * 0.19, cy - H * 0.1 + Math.sin(a) * H * 0.16,
          "p1ray" + i, { lw: 2.6, color: "rgba(51,38,26,0.7)", amp: 1.4 });
      }
      // 桥：一串矮拱
      const by = H * 0.84;
      InkFill(ctx, Rect(W * 0.18, by - 10 * S, W * 0.64, 12 * S), "p1deck", "#241a10", { amp: 2.4, lw: 0, line: null });
      for (let i = 0; i < 9; i += 1) {
        const ax = W * 0.2 + i * W * 0.072;
        ctx.beginPath();
        ctx.arc(ax, by + 12 * S, 12 * S, Math.PI, 0);
        ctx.strokeStyle = "#241a10";
        ctx.lineWidth = 5 * S;
        ctx.stroke();
      }
      break;
    }
    case "pro2": {
      // 墨沿铁路线漫开：两座城的墨团，虚线铁路把它们串起来
      MapBase(ctx, W, H, "p2");
      MapDots(ctx, W, H, "p2d", 14, 0.4);
      InkBlot(ctx, W * 0.36, H * 0.3, H * 0.11, "p2beiping");
      InkBlot(ctx, W * 0.66, H * 0.44, H * 0.09, "p2tianjin");
      ctx.save();
      ctx.setLineDash([9 * S, 7 * S]);
      ctx.beginPath();
      ctx.moveTo(W * 0.36, H * 0.3);
      ctx.quadraticCurveTo(W * 0.5, H * 0.34, W * 0.66, H * 0.44);
      ctx.quadraticCurveTo(W * 0.8, H * 0.54, W * 0.9, H * 0.72);
      ctx.strokeStyle = MAP_INK;
      ctx.lineWidth = 3.4 * S;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      // 沿线换了的小旗
      for (let i = 0; i < 4; i += 1) {
        const t = 0.2 + i * 0.22;
        const fx = W * (0.36 + t * 0.5), fy = H * (0.31 + t * 0.36);
        InkLine(ctx, fx, fy, fx, fy - 26 * S, "p2fpole" + i, { lw: 2.6, color: MAP_INK });
        InkFill(ctx, [[fx, fy - 26 * S], [fx + 18 * S, fy - 21 * S], [fx, fy - 15 * S]], "p2flag" + i, MAP_INK, { lw: 0, line: null });
      }
      break;
    }
    case "pro3": {
      // 大军南去：几支粗箭头压向下缘；村落小点留在原地
      MapBase(ctx, W, H, "p3");
      InkBlot(ctx, W * 0.5, H * 0.18, H * 0.13, "p3north", 0.65);
      for (let i = 0; i < 3; i += 1) {
        const ax = W * (0.3 + i * 0.18);
        const y0 = H * 0.3, y1 = H * (0.72 + i * 0.05);
        InkLine(ctx, ax, y0, ax - W * 0.05, y1, "p3arrow" + i, { lw: 9 * S, color: "rgba(51,38,26,0.72)", amp: 6 });
        InkFill(ctx, [
          [ax - W * 0.05 - 16 * S, y1 - 8 * S], [ax - W * 0.05, y1 + 22 * S], [ax - W * 0.05 + 16 * S, y1 - 8 * S],
        ], "p3head" + i, "rgba(51,38,26,0.72)", { lw: 0, line: null });
      }
      MapDots(ctx, W, H, "p3d", 18, 0.85);
      break;
    }
    case "pro4": {
      // 有人不肯走：太行山纹长出来，剪影的人朝着山和平原走回去（向上/向左）
      MapBase(ctx, W, H, "p4");
      // 太行山：左侧一列锯齿山纹
      for (let r = 0; r < 3; r += 1) {
        const pts = [];
        for (let i = 0; i <= 8; i += 1) {
          pts.push([W * (0.06 + r * 0.055) + (i % 2) * W * 0.03, H * (0.12 + i * 0.1)]);
        }
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (const p of pts) ctx.lineTo(p[0], p[1]);
        ctx.strokeStyle = "rgba(51,38,26,0.6)";
        ctx.lineWidth = 3 * S;
        ctx.stroke();
      }
      MapDots(ctx, W, H, "p4d", 16, 0.6);
      // 逆着人流方向走的几个人（朝左上，朝山里）
      for (let i = 0; i < 4; i += 1) {
        SilFigure(ctx, W * (0.62 - i * 0.09), H * (0.62 + Hash("p4f" + i) * 0.1), H * 0.1, "p4fig" + i, -1, { carry: i % 2 === 0 });
      }
      break;
    }
    case "pro5": {
      // 治安区：棋盘封锁线一格格亮起，格点上是炮楼
      MapBase(ctx, W, H, "p5");
      MapDots(ctx, W, H, "p5d", 12, 0.4);
      ctx.save();
      ctx.globalAlpha = 0.66;
      for (let i = 0; i <= 5; i += 1) {
        InkLine(ctx, W * 0.14 + i * W * 0.144, H * 0.12, W * 0.14 + i * W * 0.144, H * 0.88,
          "p5v" + i, { lw: 3 * S, color: MAP_INK, amp: 3 });
        InkLine(ctx, W * 0.14, H * 0.12 + i * H * 0.152, W * 0.86, H * 0.12 + i * H * 0.152,
          "p5h" + i, { lw: 3 * S, color: MAP_INK, amp: 3 });
      }
      ctx.restore();
      // 格点上的炮楼：小方塔
      for (let i = 0; i < 8; i += 1) {
        const gx = W * (0.14 + (1 + Math.floor(Hash("p5tx" + i) * 4)) * 0.144);
        const gy = H * (0.12 + (1 + Math.floor(Hash("p5ty" + i) * 4)) * 0.152);
        InkFill(ctx, [
          [gx - 9 * S, gy], [gx - 6 * S, gy - 26 * S], [gx + 6 * S, gy - 26 * S], [gx + 9 * S, gy],
        ], "p5tower" + i, "#241a10", { lw: 0, line: null });
        InkFill(ctx, Rect(gx - 9 * S, gy - 32 * S, 18 * S, 7 * S), "p5cap" + i, "#241a10", { lw: 0, line: null });
      }
      break;
    }
    case "pro6": {
      // 扫荡：火光里的村廓——地平线上的黑村子，火舌与烟柱
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#2e2018");
      g.addColorStop(0.62, "#6b3a22");
      g.addColorStop(1, "#8d5a2e");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // 村子的黑剪影
      const base = H * 0.72;
      for (let i = 0; i < 7; i += 1) {
        const hx = W * (0.08 + i * 0.13);
        const hw = W * 0.1, hh = H * (0.1 + Hash("p6h" + i) * 0.05);
        InkFill(ctx, Rect(hx, base - hh, hw, hh), "p6house" + i, "#1a120c", { amp: 3, lw: 0, line: null });
        InkFill(ctx, [[hx - 6 * S, base - hh], [hx + hw / 2, base - hh - 26 * S], [hx + hw + 6 * S, base - hh]],
          "p6roof" + i, "#1a120c", { lw: 0, line: null });
      }
      ctx.fillStyle = "#1a120c";
      ctx.fillRect(0, base, W, H - base);
      // 火舌
      for (let i = 0; i < 5; i += 1) {
        const fx = W * (0.16 + i * 0.16);
        InkFill(ctx, [
          [fx - 16 * S, base - 8 * S], [fx - 6 * S, base - 70 * S - Hash("p6f" + i) * 40 * S],
          [fx + 4 * S, base - 30 * S], [fx + 14 * S, base - 90 * S - Hash("p6f2" + i) * 50 * S],
          [fx + 22 * S, base - 6 * S],
        ], "p6flame" + i, "#e8933c", { amp: 4, lw: 0, line: null });
      }
      // 烟柱
      for (let i = 0; i < 3; i += 1) {
        const sx = W * (0.24 + i * 0.24);
        ctx.save();
        ctx.globalAlpha = 0.5;
        InkFill(ctx, [
          [sx - 10 * S, base - 60 * S], [sx - 30 * S, H * 0.2], [sx + 20 * S, H * 0.08],
          [sx + 44 * S, H * 0.3], [sx + 16 * S, base - 60 * S],
        ], "p6smoke" + i, "#3a2c20", { amp: 12, lw: 0, line: null });
        ctx.restore();
      }
      break;
    }
    case "pro7": {
      // 把命藏进土里：一把锹插进地，剪影人往下钻；天压得很低
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#8d7a58");
      g.addColorStop(0.5, "#6b5638");
      g.addColorStop(1, "#3a2c1c");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const gy = H * 0.55;
      ctx.fillStyle = "#241a10";
      ctx.fillRect(0, gy, W, H - gy);
      // 挖开的坑：斜著往下的口子
      InkFill(ctx, [
        [cx - 120 * S, gy], [cx + 130 * S, gy], [cx + 70 * S, gy + 90 * S], [cx - 60 * S, gy + 110 * S],
      ], "p7pit", "#120c08", { amp: 6, lw: 0, line: null });
      // 插着的锹
      InkLine(ctx, cx + 150 * S, gy - 110 * S, cx + 120 * S, gy + 8 * S, "p7haft", { lw: 7 * S, color: "#241a10" });
      InkFill(ctx, [
        [cx + 112 * S, gy + 2 * S], [cx + 138 * S, gy - 4 * S], [cx + 146 * S, gy + 34 * S], [cx + 118 * S, gy + 38 * S],
      ], "p7blade", "#241a10", { lw: 0, line: null });
      // 往下钻的人：只剩上半身在坑沿上
      InkFill(ctx, [
        [cx - 40 * S, gy + 30 * S], [cx - 26 * S, gy - 30 * S], [cx + 6 * S, gy - 38 * S],
        [cx + 26 * S, gy - 6 * S], [cx + 14 * S, gy + 40 * S],
      ], "p7digger", "#120c08", { amp: 4, lw: 0, line: null });
      ctx.beginPath();
      ctx.arc(cx - 6 * S, gy - 52 * S, 15 * S, 0, Math.PI * 2);
      ctx.fillStyle = "#120c08";
      ctx.fill();
      break;
    }
    case "pro8": {
      // 地下的线长成网：与正戏同构的 2.5D 剖面——地表一线小房，地下点连成网
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#c8b488");
      g.addColorStop(1, "#9a7850");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const gy = H * 0.3;
      // 地表：薄薄一条，几座小房
      ctx.fillStyle = "#8a6b45";
      ctx.fillRect(0, gy, W, H - gy);
      for (let i = 0; i < 5; i += 1) {
        const hx = W * (0.1 + i * 0.19);
        InkFill(ctx, Rect(hx, gy - 26 * S, 44 * S, 26 * S), "p8h" + i, "#4a382a", { lw: 2, amp: 2 });
        InkFill(ctx, [[hx - 5 * S, gy - 26 * S], [hx + 22 * S, gy - 42 * S], [hx + 49 * S, gy - 26 * S]],
          "p8r" + i, "#4a382a", { lw: 2, amp: 2 });
      }
      // 地下的网：节点（地窖）与连线（地道）
      const nodes = [];
      for (let i = 0; i < 9; i += 1) {
        nodes.push([W * (0.1 + Hash("p8nx" + i) * 0.8), gy + H * (0.12 + Hash("p8ny" + i) * 0.45)]);
      }
      for (let i = 0; i < nodes.length - 1; i += 1) {
        InkLine(ctx, nodes[i][0], nodes[i][1], nodes[i + 1][0], nodes[i + 1][1],
          "p8t" + i, { lw: 4.4 * S, color: "#241a10", amp: 8 });
      }
      InkLine(ctx, nodes[2][0], nodes[2][1], nodes[6][0], nodes[6][1], "p8tx", { lw: 4.4 * S, color: "#241a10", amp: 8 });
      for (let i = 0; i < nodes.length; i += 1) {
        ctx.beginPath();
        ctx.arc(nodes[i][0], nodes[i][1], 8 * S, 0, Math.PI * 2);
        ctx.fillStyle = "#241a10";
        ctx.fill();
      }
      // 通向地表的竖井两三口
      for (const i of [1, 4, 7]) {
        InkLine(ctx, nodes[i][0], nodes[i][1], nodes[i][0], gy, "p8shaft" + i, { lw: 3.2 * S, color: "#241a10", amp: 2 });
      }
      break;
    }
    case "pro9": {
      // 镜头从地图收拢到一个普通村庄：圆形光圈里一小簇村舍
      MapBase(ctx, W, H, "p9");
      MapDots(ctx, W, H, "p9d", 20, 0.5);
      ctx.save();
      const vg = ctx.createRadialGradient(cx, cy, H * 0.1, cx, cy, H * 0.6);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(30,22,14,0.72)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      // 圈心的村子
      for (let i = 0; i < 4; i += 1) {
        const hx = cx - 70 * S + i * 42 * S;
        InkFill(ctx, Rect(hx, cy - 4 * S, 30 * S, 22 * S), "p9h" + i, "#4a382a", { lw: 2, amp: 1.6 });
        InkFill(ctx, [[hx - 4 * S, cy - 4 * S], [hx + 15 * S, cy - 18 * S], [hx + 34 * S, cy - 4 * S]],
          "p9r" + i, "#4a382a", { lw: 2, amp: 1.6 });
      }
      InkLine(ctx, cx - 90 * S, cy + 26 * S, cx + 100 * S, cy + 24 * S, "p9road", { lw: 3 * S, color: "rgba(51,38,26,0.5)", amp: 4 });
      break;
    }
    case "pro10": {
      // 梁家村：一口井、一盘磨、一棵老槐树——暖起来的水彩
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#d8c8a0");
      g.addColorStop(0.6, "#c0a874");
      g.addColorStop(1, "#a08856");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const gy = H * 0.74;
      ctx.fillStyle = "#8d7448";
      ctx.fillRect(0, gy, W, H - gy);
      // 屋脊线（一百来户的意思）：远景一排屋顶
      for (let i = 0; i < 8; i += 1) {
        const hx = W * (0.02 + i * 0.13);
        ctx.save();
        ctx.globalAlpha = 0.5;
        InkFill(ctx, [[hx, gy - 30 * S], [hx + 26 * S, gy - 48 * S], [hx + 52 * S, gy - 30 * S], [hx + 52 * S, gy - 6 * S], [hx, gy - 6 * S]],
          "p10far" + i, "#6b5636", { lw: 2, amp: 2 });
        ctx.restore();
      }
      // 老槐树：占右侧
      const tx = W * 0.74;
      InkFill(ctx, [
        [tx - 12 * S, gy], [tx - 8 * S, gy - 120 * S], [tx - 30 * S, gy - 150 * S],
        [tx + 20 * S, gy - 140 * S], [tx + 10 * S, gy - 110 * S], [tx + 14 * S, gy],
      ], "p10trunk", "#6b4f30", { amp: 3, lw: 3 });
      for (let i = 0; i < 5; i += 1) {
        const a = -0.6 - i * 0.42;
        const bx = tx + Math.cos(a) * 90 * S, by = gy - 150 * S + Math.sin(a) * 60 * S;
        ctx.beginPath();
        ctx.arc(bx, by, (34 + Hash("p10c" + i) * 18) * S, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 ? "#5c7040" : "#6d8148";
        ctx.fill();
      }
      // 井（带辘轳架）与磨盘
      const wx = W * 0.22;
      InkFill(ctx, Rect(wx - 26 * S, gy - 22 * S, 52 * S, 22 * S), "p10well", "#8a7a5c", { lw: 3, amp: 2, shade: "rgba(0,0,0,0.2)" });
      InkLine(ctx, wx - 30 * S, gy - 22 * S, wx - 18 * S, gy - 66 * S, "p10wa", { lw: 3.4 * S, color: "#4a382a" });
      InkLine(ctx, wx + 30 * S, gy - 22 * S, wx + 18 * S, gy - 66 * S, "p10wb", { lw: 3.4 * S, color: "#4a382a" });
      InkLine(ctx, wx - 22 * S, gy - 62 * S, wx + 22 * S, gy - 62 * S, "p10wc", { lw: 4 * S, color: "#4a382a" });
      const mx = W * 0.46;
      ctx.beginPath();
      ctx.ellipse(mx, gy - 8 * S, 40 * S, 13 * S, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#9a8a6c";
      ctx.fill();
      ctx.strokeStyle = IN.ink;
      ctx.lineWidth = 2.6;
      ctx.stroke();
      break;
    }
    case "pro11": {
      // 木匠：工作台前刨木头的剪影，刨花打着卷
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#c8b088");
      g.addColorStop(1, "#8d7048");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const gy = H * 0.78;
      ctx.fillStyle = "#6b5636";
      ctx.fillRect(0, gy, W, H - gy);
      // 工作台
      InkFill(ctx, Rect(cx - 170 * S, gy - 70 * S, 340 * S, 16 * S), "p11top", "#a8794a", { lw: 3, amp: 2, shade: "rgba(0,0,0,0.2)" });
      InkLine(ctx, cx - 150 * S, gy - 54 * S, cx - 150 * S, gy, "p11l1", { lw: 6 * S, color: "#7a5433" });
      InkLine(ctx, cx + 150 * S, gy - 54 * S, cx + 150 * S, gy, "p11l2", { lw: 6 * S, color: "#7a5433" });
      // 台上的木料
      InkFill(ctx, Rect(cx - 120 * S, gy - 88 * S, 240 * S, 18 * S), "p11plank", "#c09a62", { lw: 2.6, amp: 1.8 });
      // 刨木头的人：前倾用力的剪影
      InkFill(ctx, [
        [cx - 60 * S, gy - 70 * S], [cx - 30 * S, gy - 150 * S], [cx + 14 * S, gy - 165 * S],
        [cx + 30 * S, gy - 130 * S], [cx + 60 * S, gy - 96 * S], [cx + 30 * S, gy - 70 * S],
      ], "p11man", "#4a382a", { amp: 3, lw: 0, line: null });
      ctx.beginPath();
      ctx.arc(cx + 14 * S, gy - 178 * S, 16 * S, 0, Math.PI * 2);
      ctx.fillStyle = "#4a382a";
      ctx.fill();
      // 两条胳膊往前压着刨子
      InkLine(ctx, cx + 20 * S, gy - 130 * S, cx + 78 * S, gy - 92 * S, "p11arm", { lw: 9 * S, color: "#4a382a" });
      InkFill(ctx, Rect(cx + 66 * S, gy - 100 * S, 40 * S, 14 * S), "p11plane", "#4a382a", { lw: 0, line: null });
      // 刨花：打卷的细线
      for (let i = 0; i < 5; i += 1) {
        const sx = cx + 100 * S + i * 16 * S;
        ctx.beginPath();
        ctx.arc(sx, gy - 70 * S - Hash("p11s" + i) * 30 * S, (7 + Hash("p11s2" + i) * 5) * S, 0.4, Math.PI * 1.7);
        ctx.strokeStyle = "#e0c78e";
        ctx.lineWidth = 3 * S;
        ctx.stroke();
      }
      break;
    }
    case "pro12": {
      // 起名的盼头：房梁下，爹的剪影把手搭在孩子肩上，孩子仰头看梁
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#b89868");
      g.addColorStop(1, "#7a5f3c");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // 头顶的梁与柱
      InkFill(ctx, Rect(W * 0.08, H * 0.14, W * 0.84, 22 * S), "p12beam", "#5c4328", { lw: 3, amp: 2.4, shade: "rgba(0,0,0,0.24)" });
      InkFill(ctx, Rect(W * 0.16, H * 0.14, 18 * S, H * 0.7), "p12postA", "#5c4328", { lw: 3, amp: 2 });
      InkFill(ctx, Rect(W * 0.8, H * 0.14, 18 * S, H * 0.7), "p12postB", "#5c4328", { lw: 3, amp: 2 });
      const gy = H * 0.84;
      ctx.fillStyle = "#4a3a26";
      ctx.fillRect(0, gy, W, H - gy);
      // 爹（高）与柱子（小）：都仰着头看梁
      InkFill(ctx, [
        [cx - 90 * S, gy], [cx - 82 * S, gy - 140 * S], [cx - 60 * S, gy - 168 * S],
        [cx - 30 * S, gy - 160 * S], [cx - 20 * S, gy - 120 * S], [cx - 26 * S, gy],
      ], "p12dad", "#33261a", { amp: 3, lw: 0, line: null });
      ctx.beginPath();
      ctx.arc(cx - 52 * S, gy - 180 * S, 17 * S, 0, Math.PI * 2);
      ctx.fillStyle = "#33261a";
      ctx.fill();
      InkFill(ctx, [
        [cx + 30 * S, gy], [cx + 34 * S, gy - 76 * S], [cx + 50 * S, gy - 92 * S],
        [cx + 68 * S, gy - 84 * S], [cx + 74 * S, gy - 60 * S], [cx + 68 * S, gy],
      ], "p12kid", "#33261a", { amp: 2.6, lw: 0, line: null });
      ctx.beginPath();
      ctx.arc(cx + 52 * S, gy - 104 * S, 12 * S, 0, Math.PI * 2);
      ctx.fillStyle = "#33261a";
      ctx.fill();
      // 爹的手搭在孩子肩上
      InkLine(ctx, cx - 30 * S, gy - 120 * S, cx + 44 * S, gy - 88 * S, "p12arm", { lw: 8 * S, color: "#33261a" });
      break;
    }
    case "pro13": {
      // 粮的铰链：青黄不接的麦田 + 见底的粮囤（沉降拍，冷下来）
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#b0a880");
      g.addColorStop(0.55, "#8d8058");
      g.addColorStop(1, "#5c5236");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const gy = H * 0.66;
      ctx.fillStyle = "#4a4028";
      ctx.fillRect(0, gy, W, H - gy);
      // 稀稀拉拉的麦子：该密不密
      for (let i = 0; i < 26; i += 1) {
        const sx = W * (0.04 + Hash("p13w" + i) * 0.92);
        const sh = (26 + Hash("p13h" + i) * 22) * S;
        InkLine(ctx, sx, gy, sx + Sym("p13s" + i, 1, 6 * S), gy - sh, "p13stalk" + i,
          { lw: 2 * S, color: "rgba(150,138,90,0.8)", amp: 2 });
      }
      // 前景的粮囤：口开着，里头是黑的
      const bx = W * 0.68, by = H * 0.86;
      InkFill(ctx, [
        [bx - 110 * S, by], [bx - 90 * S, by - 120 * S], [bx + 90 * S, by - 120 * S], [bx + 110 * S, by],
      ], "p13bin", "#8d7448", { amp: 3, lw: 4, shade: "rgba(0,0,0,0.25)" });
      for (let i = 0; i < 4; i += 1) {
        InkLine(ctx, bx - (96 - i * 5) * S, by - 24 * S - i * 26 * S, bx + (96 - i * 5) * S, by - 24 * S - i * 26 * S,
          "p13ring" + i, { lw: 2.2 * S, color: "rgba(60,44,26,0.6)", amp: 2 });
      }
      ctx.beginPath();
      ctx.ellipse(bx, by - 120 * S, 88 * S, 20 * S, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#1a120c";
      ctx.fill();
      ctx.strokeStyle = IN.ink;
      ctx.lineWidth = 3;
      ctx.stroke();
      // 囤边斜着一只空瓢
      InkFill(ctx, [
        [bx + 96 * S, by - 10 * S], [bx + 150 * S, by - 26 * S], [bx + 156 * S, by - 8 * S], [bx + 110 * S, by + 4 * S],
      ], "p13scoop", "#6b5636", { amp: 2, lw: 2.6 });
      break;
    }
    case "pro14": {
      // 娘在院门口喊人，妹妹从她腿边探出头——两个角色的登场（一幅画完成）
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#e0cfa2");
      g.addColorStop(0.6, "#c8ae7a");
      g.addColorStop(1, "#a08a58");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const gy = H * 0.8;
      ctx.fillStyle = "#8d7448";
      ctx.fillRect(0, gy, W, H - gy);
      // 院门：门垛与门楣（占右侧）
      InkFill(ctx, Rect(W * 0.6, gy - 190 * S, 26 * S, 190 * S), "p14postA", "#b89b72", { lw: 3, amp: 2, shade: "rgba(0,0,0,0.2)" });
      InkFill(ctx, Rect(W * 0.86, gy - 190 * S, 26 * S, 190 * S), "p14postB", "#b89b72", { lw: 3, amp: 2, shade: "rgba(0,0,0,0.2)" });
      InkFill(ctx, Rect(W * 0.57, gy - 214 * S, W * 0.38, 26 * S), "p14lintel", "#8a6a52", { lw: 3, amp: 2 });
      // 院墙往画左延伸
      InkFill(ctx, Rect(0, gy - 110 * S, W * 0.62, 110 * S), "p14wall", "#c0a26e", { lw: 3, amp: 2.6, shade: "rgba(0,0,0,0.14)" });
      // 娘：站在门洞里，一只手拢在嘴边喊
      const mx = W * 0.73, mb = gy + 4 * S;
      InkFill(ctx, [
        [mx - 26 * S, mb], [mx - 22 * S, mb - 120 * S], [mx - 6 * S, mb - 150 * S],
        [mx + 18 * S, mb - 144 * S], [mx + 28 * S, mb - 90 * S], [mx + 22 * S, mb],
      ], "p14mom", "#6d5340", { amp: 3, lw: 3 });
      ctx.beginPath();
      ctx.arc(mx - 2 * S, mb - 164 * S, 15 * S, 0, Math.PI * 2);
      ctx.fillStyle = PAL.skin;
      ctx.fill();
      ctx.strokeStyle = IN.ink;
      ctx.lineWidth = 2.6;
      ctx.stroke();
      // 拢在嘴边的手
      InkLine(ctx, mx + 16 * S, mb - 120 * S, mx + 4 * S, mb - 158 * S, "p14arm", { lw: 7 * S, color: "#6d5340" });
      // 发髻
      ctx.beginPath();
      ctx.arc(mx - 16 * S, mb - 170 * S, 6.5 * S, 0, Math.PI * 2);
      ctx.fillStyle = "#2b1f16";
      ctx.fill();
      // 妹妹：从娘腿边探出半个身子
      const sx2 = mx - 34 * S;
      InkFill(ctx, [
        [sx2 - 16 * S, mb], [sx2 - 14 * S, mb - 52 * S], [sx2 - 2 * S, mb - 64 * S],
        [sx2 + 12 * S, mb - 56 * S], [sx2 + 14 * S, mb],
      ], "p14sis", PAL.sister, { amp: 2.4, lw: 2.6 });
      ctx.beginPath();
      ctx.arc(sx2 - 2 * S, mb - 76 * S, 11 * S, 0, Math.PI * 2);
      ctx.fillStyle = PAL.skin;
      ctx.fill();
      ctx.strokeStyle = IN.ink;
      ctx.lineWidth = 2.4;
      ctx.stroke();
      // 小辫
      ctx.beginPath();
      ctx.arc(sx2 - 13 * S, mb - 82 * S, 4 * S, 0, Math.PI * 2);
      ctx.fillStyle = "#2b1f16";
      ctx.fill();
      // 晨光：门洞里透出的一道暖
      ctx.save();
      ctx.globalAlpha = 0.3;
      const lg = ctx.createLinearGradient(W * 0.62, 0, W * 0.3, 0);
      lg.addColorStop(0, "#ffe6a8");
      lg.addColorStop(1, "rgba(255,230,168,0)");
      ctx.fillStyle = lg;
      ctx.fillRect(W * 0.2, gy - 200 * S, W * 0.42, 200 * S);
      ctx.restore();
      // 磨与鸡的远景点缀
      ctx.beginPath();
      ctx.ellipse(W * 0.16, gy - 6 * S, 30 * S, 10 * S, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#9a8a6c";
      ctx.fill();
      ctx.strokeStyle = IN.ink;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      break;
    }
    default: {
      CardBase(ctx, W, H);
      break;
    }
  }
}

// 粪堆。**一个没有粪堆的华北村子等于没有农业**——粪是庄稼的命，拾粪是
// 半大孩子每天头一件差事。自家院内墙根的是拍实的方堆、四棱见线（一锹一锹
// 拍出来的），插一把三齿粪叉、边上倒扣一只荆条粪筐；街边公共粪堆踩得半塌、
// 顶上撒一层灰白草木灰、插一根秫秸秆做记号（各家的粪不能混）。
// 颜色是干透的灰褐带草茬，**不是黑泥**。
// 摊开的新土：挖通道倒出来那一薄层
//
// 这东西的**要害是"薄"**。倒土那一拍的台词一直在讲「只垫浅浅一层——铺厚了，
// 就是一堆显眼的新土」，所以它绝不能画成一个土堆：堆起来就等于把这句话演反了。
// 高度按真尺寸给（15cm 上下，PPM 48 ≈ 7px），宽度反倒要拉开——摊得越开越不显眼，
// 这正是"分散消纳"这件事本身。
// 颜色比表土深一档：深层黏土见了光就是这个色，也正因为深，撒进菜畦一眼就穿。
// 垫在洼处的新土。**"新土"读得出来靠土坷垃，不靠一块深色**（2026-08-17 用户：
// "泥土…根本就不像"）：刚倒下去的黏土耙得再匀也是一疙瘩一疙瘩的，每一块有受光
// 的顶、有背光的肚子、还在旁边压一小片自己的影；表面一层晒干发白的碎末，
// 底下压着的那一层还是湿的、比周围沉两档。老版是一条光滑的平色带子加七粒椭圆。
export function DrawFreshDirt(ctx, x, groundY, w, id) {
  const W = w, H = 7;
  const top = [];
  for (let i = 0; i <= 16; i += 1) {
    const t = i / 16;
    // 上沿不是一条弧：一疙瘩一疙瘩堆着，所以是**锯齿状的**
    const swell = Math.sin(t * Math.PI) * H * 0.66 + Math.abs(Math.sin(t * 11.7 + Hash(id + "s") * 6)) * H * 0.3;
    top.push([x - W / 2 + W * t, groundY - swell + Sym(id + "t", i, 1.0)]);
  }
  InkFill(ctx, top.concat([[x + W / 2, groundY], [x - W / 2, groundY]]), id,
    "#3d3021", { amp: 1.2, lw: 1.3, shade: "rgba(24,18,10,0.3)" });
  // 湿的那一层：底下压着的还没干，比周围沉两档
  ctx.save();
  ctx.fillStyle = "rgba(22,16,9,0.42)";
  ctx.beginPath();
  ctx.ellipse(x, groundY - 0.6, W * 0.44, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // 土坷垃：大小各不一样（一样大就是一串珠子），每块顶上受光、身下垫一线影
  const n = Math.max(8, Math.round(W / 7));
  for (let i = 0; i < n; i += 1) {
    const cx = x - W / 2 + 4 + Rnd(id + "c", i) * (W - 8);
    const cy = groundY - 1.2 - Rnd(id + "cy", i) * (H * 0.75);
    const r = 1.6 + Rnd(id + "cr", i) ** 2 * 4.2;
    ctx.save();
    ctx.fillStyle = "rgba(16,11,6,0.34)";
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.4, cy + r * 0.5, r * 1.02, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = Rnd(id + "ck", i) > 0.5 ? "#4a3a26" : "#3a2d1d";
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.72, Rnd(id + "ca", i) * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(196,172,128,0.5)";
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.26, cy - r * 0.3, r * 0.42, r * 0.24, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // 晒干的碎末：面上一层发白的细屑
  Speckle(ctx, x - W / 2 + 3, groundY - H, W - 6, H, id + "dry",
    { count: Math.round(W / 4), alpha: 0.34, size: 1.2, color: "#b39a6c" });
  // 铁锹拍出来的面：一两道平的痕，说明有人把它摊开过（不是倒完就走）
  for (let i = 0; i < 2; i += 1) {
    const lx = x - W / 2 + W * (0.26 + i * 0.4);
    InkLine(ctx, lx, groundY - 1.2, lx + W * 0.2, groundY - 2.6 + Sym(id + "r", i, 1),
      id + "pat" + i, { lw: 1.1, color: "rgba(178,156,116,0.4)", amp: 0.6 });
  }
}

export function DrawDungHeap(ctx, x, groundY, id, { street = false } = {}) {
  const W = street ? 46 : 38, H = street ? 15 : 20;
  const top = [];
  for (let i = 0; i <= 6; i += 1) {
    const t = i / 6;
    const slump = street ? Math.sin(t * Math.PI) * -3 : 0;   // 街边的被踩得半塌
    top.push([x - W / 2 + W * t, groundY - H + slump + Sym(id + "t", i, street ? 3 : 1.6)]);
  }
  InkFill(ctx, top.concat([[x + W / 2 + 3, groundY], [x - W / 2 - 3, groundY]]), id,
    "#6b5f46", { amp: street ? 2.2 : 1.2, lw: 1.8, shade: "rgba(48,38,24,0.26)" });
  // 一锹一锹拍出来的棱：自家那堆四棱见线
  if (!street) {
    for (let i = 1; i < 4; i += 1) {
      InkLine(ctx, x - W / 2 + 3, groundY - (H * i) / 4, x + W / 2 - 3, groundY - (H * i) / 4 + Sym(id + "e", i, 1.2),
        id + "edge" + i, { lw: 1.1, color: "rgba(52,42,28,0.42)", amp: 0.9 });
    }
  } else {
    // 顶上撒的一层草木灰
    ctx.save();
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = "#a8a08c";
    ctx.beginPath();
    ctx.ellipse(x, groundY - H + 1, W * 0.4, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // 草茬
  for (let i = 0; i < 9; i += 1) {
    const gx = x - W / 2 + 4 + Rnd(id + "g", i) * (W - 8);
    InkLine(ctx, gx, groundY - 2 - Rnd(id + "g2", i) * H * 0.8,
      gx + Sym(id + "g3", i, 3), groundY - 5 - Rnd(id + "g4", i) * H,
      id + "straw" + i, { lw: 0.9, color: "rgba(138,122,78,0.6)", amp: 0.9 });
  }
  if (street) {
    // 插一根做记号的秫秸秆
    InkLine(ctx, x + W * 0.22, groundY - H + 2, x + W * 0.26, groundY - H - 22, id + "mark",
      { lw: 1.8, color: PAL.stalk, amp: 1.2 });
  } else {
    // 三齿粪叉 + 倒扣的荆条粪筐
    InkLine(ctx, x - W * 0.42, groundY, x - W * 0.30, groundY - 40, id + "forkH", { lw: 2.4, color: PAL.woodOld, amp: 1.0 });
    for (let i = 0; i < 3; i += 1) {
      InkLine(ctx, x - W * 0.30 - 3 + i * 3, groundY - 40, x - W * 0.30 - 4 + i * 4, groundY - 48,
        id + "tine" + i, { lw: 1.3, color: "#4e4234", amp: 0.6 });
    }
    InkFill(ctx, [[x + W * 0.42, groundY], [x + W * 0.44, groundY - 12], [x + W * 0.78, groundY - 11],
      [x + W * 0.80, groundY]], id + "basket", "#7a6540", { amp: 1.6, lw: 1.6 });
  }
}

// 秫秸障子：高粱秆去叶并排立着，下端埋进土沟踩实，两侧横压秫秸条用草绳勒紧。
// **透光透风、歪斜不齐像缺牙**，日久发灰发脆——比一道满高的土坯院墙穷得多，
// 1943 年冀中很多院子就只有这个。
export function DrawStalkFence(ctx, x, groundY, w, id) {
  const H = 62;
  // 后面院子的暗：障子是透的，条与条之间要露出这一层
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = "#4a4132";
  ctx.fillRect(x - w / 2, groundY - H, w, H);
  ctx.restore();
  let sx = x - w / 2;
  let i = 0;
  while (sx < x + w / 2) {
    const lean = Sym(id + "ln", i, 3.5);
    const hh = H * (0.82 + Rnd(id + "hh", i) * 0.22);
    const gap = Rnd(id + "gp", i) > 0.88;              // 缺牙
    if (!gap) {
      InkLine(ctx, sx, groundY, sx + lean, groundY - hh, id + "s" + i,
        { lw: 2.0 + Rnd(id + "lw", i) * 0.9, color: Rnd(id + "c", i) > 0.5 ? PAL.stalk : "#7a6c44", amp: 1.0 });
    }
    sx += 3.4 + Rnd(id + "sp", i) * 2.6;
    i += 1;
  }
  // 两道横压条 + 草绳
  for (let k = 0; k < 2; k += 1) {
    const hy = groundY - H * (0.35 + k * 0.38);
    InkLine(ctx, x - w / 2 - 2, hy, x + w / 2 + 2, hy + Sym(id + "hz", k, 3),
      id + "bar" + k, { lw: 2.2, color: "#6b5b3a", amp: 1.6 });
  }
  // 脚下压的一溜土
  InkFill(ctx, [[x - w / 2 - 4, groundY], [x - w / 2, groundY - 5],
    [x + w / 2, groundY - 4], [x + w / 2 + 4, groundY]], id + "ft", "#7d6c50", { amp: 1.4, lw: 1.4 });
}

// 空狗窝。1939 年冀中区党委统一"打狗"——狗叫会暴露夜间行动，回忆材料里
// 明确记着「出进村庄无犬吠声」。所以村里不许有狗，但**要画出狗不在了的位置**：
// 空窝 + 木橛上一截烂绳 + 门口一只翻扣的破食盆。
export function DrawEmptyKennel(ctx, x, groundY, id) {
  // 窝：土坯垒的矮洞，苫顶塌了一半
  InkFill(ctx, [[x - 20, groundY], [x - 18, groundY - 22], [x + 2, groundY - 26],
    [x + 20, groundY - 20], [x + 22, groundY]], id, "#8f7a5a",
  { amp: 1.8, lw: 2.0, shade: "rgba(70,52,36,0.24)" });
  // 窝口：敞着的黑洞——这一块是它唯一要说的话
  InkFill(ctx, [[x - 8, groundY], [x - 7, groundY - 15], [x + 6, groundY - 16], [x + 8, groundY]],
    id + "mouth", "#1c1712", { amp: 1.4, lw: 1.6 });
  // 苫顶的秫秸塌进去一半
  for (let i = 0; i < 8; i += 1) {
    const sx = x - 18 + i * 5;
    InkLine(ctx, sx, groundY - 22 - Rnd(id + "r", i) * 4, sx + 4, groundY - 24 + Sym(id + "r2", i, 4),
      id + "th" + i, { lw: 1.3, color: PAL.stalk, amp: 1.2 });
  }
  // 木橛 + 一截烂绳
  InkLine(ctx, x + 30, groundY, x + 31, groundY - 14, id + "peg", { lw: 3, color: PAL.woodOldDark, amp: 1.0 });
  InkLine(ctx, x + 31, groundY - 13, x + 40, groundY - 3, id + "rope",
    { lw: 1.5, color: "#7a6a48", amp: 1.8 });
  // 翻扣的破食盆
  InkFill(ctx, [[x + 12, groundY], [x + 13, groundY - 6], [x + 26, groundY - 5], [x + 27, groundY]],
    id + "bowl", "#4a3f33", { amp: 1.4, lw: 1.6 });
  InkLine(ctx, x + 18, groundY - 6, x + 22, groundY - 2, id + "chip", { lw: 1.2, color: "#2b241c", amp: 0.8 });
}

// 收藏品（老物件）画笔。一支笔九个变体，场上与包袱条共用——
// 场上画在地上（小、半掩），包袱条里放大两档画在格子里。
// sil: 剪影模式（包袱里还没找到的那格：只给一个深色的形，勇敢的心的做法——
// 形状本身就是唯一的提示，别给颜色细节）。
// 颜色照全局规矩按 ^2.2 预压过（CanvasTexture 洗白问题）。
export function DrawRelic(ctx, x, groundY, art, id, { sil = false, k = 1, dim = false } = {}) {
  ctx.save();
  ctx.translate(x, groundY);
  ctx.scale(k, k);
  ctx.translate(-x, -groundY);
  const S = "#3f3831";                          // 剪影色
  // dim：世界贴图走 CanvasTexture 会被整体提亮（老坑），源色预压一档；
  // 包袱条是 DOM canvas，不洗白，照原色画——同一支笔两个去处两套色
  const C = (real) => (sil ? S : dim ? Dim(real, 0.55) : real);
  const L = sil ? { line: null, lw: 0 } : {};   // 剪影不描边
  const y = groundY;
  switch (art) {
    case "borderNote": {
      // 边区票：一张小纸票，边角卷起，票面两道墨框
      InkFill(ctx, [[x - 13, y - 1], [x + 12, y - 3], [x + 14, y - 12], [x - 11, y - 10]],
        id + "p", C("#9a8f74"), { amp: 0.8, lw: 1.4, shade: "rgba(0,0,0,0.12)", ...L });
      if (!sil) {
        InkLine(ctx, x - 9, y - 8, x + 10, y - 9.6, id + "f1", { lw: 1, color: "#4e4638", amp: 0.4 });
        InkLine(ctx, x - 8, y - 4.6, x + 9, y - 6, id + "f2", { lw: 1.6, color: "#5c4a3a", amp: 0.4 });
        InkLine(ctx, x + 12, y - 3, x + 14, y - 12, id + "curl", { lw: 1.2, color: "#7a7058", amp: 0.6 });
      }
      break;
    }
    case "shoeSole": {
      // 千层底 + 铜顶针：鞋底立着靠在墙根，顶针搁在旁边
      InkFill(ctx, [[x - 10, y], [x - 12, y - 16], [x - 8, y - 24], [x - 2, y - 25], [x + 2, y - 16], [x + 1, y]],
        id + "sole", C("#a89a80"), { amp: 1.0, lw: 1.6, shade: "rgba(0,0,0,0.14)", ...L });
      if (!sil) {
        for (let r = 0; r < 4; r += 1) {
          InkLine(ctx, x - 9 + Math.max(0, r - 1), y - 4 - r * 5, x + 0.5, y - 5 - r * 5,
            id + "st" + r, { lw: 0.8, color: "rgba(74,60,44,0.55)", amp: 0.5 });
        }
        InkLine(ctx, x - 4, y - 20, x - 3, y - 8, id + "thr", { lw: 0.8, color: "#8f8168", amp: 1.2 });
      }
      InkFill(ctx, [[x + 6, y], [x + 6, y - 6], [x + 12, y - 6], [x + 12, y]],
        id + "th", C("#8a6a3c"), { amp: 0.7, lw: 1.3, ...L });
      if (!sil) {
        ctx.save();
        ctx.fillStyle = "#5c4626";
        for (let i = 0; i < 5; i += 1) ctx.fillRect(x + 7 + i, y - 5 + (i % 2), 0.8, 0.8);
        ctx.restore();
      }
      break;
    }
    case "newsSheet": {
      // 报纸残页：折过的半张，一角撕口；版面是墨迹节奏块（白盒不写可读字）
      InkFill(ctx, [[x - 14, y], [x - 12, y - 15], [x + 4, y - 17], [x + 13, y - 13], [x + 11, y - 2], [x + 2, y - 4]],
        id + "sheet", C("#a09781"), { amp: 0.9, lw: 1.4, shade: "rgba(0,0,0,0.10)", ...L });
      if (!sil) {
        InkLine(ctx, x - 6, y - 15.5, x - 4, y - 3.5, id + "fold", { lw: 0.9, color: "rgba(60,52,40,0.4)", amp: 0.5 });
        for (let r = 0; r < 4; r += 1) {
          InkLine(ctx, x - 10, y - 12.5 + r * 2.6, x - 10 + 5 + Hash(id + "l" + r) * 4, y - 12.7 + r * 2.6,
            id + "tx" + r, { lw: 1.1, color: "rgba(52,44,34,0.6)", amp: 0.2 });
          InkLine(ctx, x + 1, y - 13.5 + r * 2.8, x + 1 + 6 + Hash(id + "r" + r) * 4, y - 13.2 + r * 2.8,
            id + "tx2" + r, { lw: 1.1, color: "rgba(52,44,34,0.5)", amp: 0.2 });
        }
      }
      break;
    }
    case "featherLetter": {
      // 鸡毛信：折成方胜的信 + 三根鸡毛斜插在角上
      InkFill(ctx, [[x - 11, y], [x - 9, y - 10], [x + 9, y - 12], [x + 11, y - 2]],
        id + "env", C("#a89c80"), { amp: 0.8, lw: 1.4, shade: "rgba(0,0,0,0.12)", ...L });
      if (!sil) {
        InkLine(ctx, x - 9, y - 10, x + 1, y - 5, id + "fa", { lw: 0.9, color: "rgba(70,58,44,0.5)", amp: 0.3 });
        InkLine(ctx, x + 9, y - 12, x + 1, y - 5, id + "fb", { lw: 0.9, color: "rgba(70,58,44,0.5)", amp: 0.3 });
      }
      for (let i = 0; i < 3; i += 1) {
        const fx = x + 6 + i * 2.4, a = -0.9 - i * 0.14;
        InkLine(ctx, fx, y - 10, fx + Math.cos(a) * 12, y - 10 + Math.sin(a) * 12,
          id + "q" + i, { lw: 1.2, color: C("#7d6a4e"), amp: 0.6 });
        if (!sil) {
          InkFill(ctx, [[fx + Math.cos(a) * 9 - 2.4, y - 10 + Math.sin(a) * 9],
            [fx + Math.cos(a) * 13, y - 10 + Math.sin(a) * 13 - 1],
            [fx + Math.cos(a) * 9 + 2.2, y - 10 + Math.sin(a) * 9 + 1.6]],
          id + "fe" + i, "#8f8266", { amp: 0.8, lw: 0, line: null });
        }
      }
      break;
    }
    case "cartridgeWhistle": {
      // 弹壳哨子：两枚弹壳拴在一截麻绳上
      if (!sil) InkLine(ctx, x - 12, y - 14, x + 12, y - 10, id + "str", { lw: 1.1, color: "#6d5a3a", amp: 1.6 });
      for (let i = 0; i < 2; i += 1) {
        const cx2 = x - 5 + i * 9, tilt = (i ? 1 : -1) * 0.22;
        ctx.save();
        ctx.translate(cx2, y - 6);
        ctx.rotate(tilt);
        InkFill(ctx, [[-2.2, 6], [-2.2, -4], [-1.4, -6], [1.4, -6], [2.2, -4], [2.2, 6]],
          id + "sh" + i, C("#8a744a"), { amp: 0.5, lw: 1.2, shade: "rgba(0,0,0,0.18)", ...L });
        if (!sil) {
          ctx.fillStyle = "#5c4c30";
          ctx.fillRect(-2.2, -0.6, 4.4, 1.1);
        }
        ctx.restore();
      }
      break;
    }
    case "mineFuse": {
      // 石雷拉火管：小铜管 + 圈起来的拉火绳
      ctx.save();
      ctx.translate(x, y - 4);
      ctx.rotate(-0.28);
      InkFill(ctx, [[-9, -2.4], [9, -2.0], [9.6, 0], [9, 2.0], [-9, 2.4]],
        id + "tube", C("#7d6438"), { amp: 0.5, lw: 1.3, shade: "rgba(0,0,0,0.2)", ...L });
      if (!sil) InkLine(ctx, -6, -1.6, -6, 1.8, id + "band", { lw: 1, color: "#4e3e22", amp: 0.2 });
      ctx.restore();
      if (!sil) {
        ctx.save();
        ctx.strokeStyle = "#6d5a3a";
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(x + 11, y - 5, 4.2, -0.6, 4.6);
        ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case "spearHead": {
      // 红缨枪头：矛头 + 一束红缨（全画面唯一敢用的一点暗红，收藏品该跳一下）
      InkFill(ctx, [[x - 2, y], [x - 3.6, y - 7], [x, y - 20], [x + 3.6, y - 7], [x + 2, y]],
        id + "blade", C("#8a8578"), { amp: 0.6, lw: 1.4, shade: "rgba(0,0,0,0.16)", ...L });
      if (!sil) {
        InkLine(ctx, x, y - 18, x, y - 3, id + "ridge", { lw: 0.8, color: "rgba(60,56,48,0.5)", amp: 0.2 });
        for (let i = 0; i < 6; i += 1) {
          InkLine(ctx, x + Sym(id + "t" + i, 0, 2.2), y - 1,
            x + Sym(id + "t2" + i, 0, 7) , y + 6 + Hash(id + "t3" + i) * 3,
            id + "tas" + i, { lw: 1.1, color: "#6e3428", amp: 0.8 });
        }
      }
      break;
    }
    case "grenadeHandle": {
      // 边区造手榴弹柄：木旋的短柄，一头有拧盖的箍
      ctx.save();
      ctx.translate(x, y - 3);
      ctx.rotate(0.34);
      InkFill(ctx, [[-11, -2.8], [8, -3.4], [11, -2.2], [11, 2.2], [8, 3.4], [-11, 2.8]],
        id + "wood", C("#8a6a42"), { amp: 0.7, lw: 1.4, shade: "rgba(0,0,0,0.18)", ...L });
      if (!sil) {
        InkLine(ctx, -8, -2.2, -8, 2.4, id + "cap", { lw: 1.2, color: "#4e3a20", amp: 0.3 });
        InkLine(ctx, -10, 0, 9, 0.4, id + "grain", { lw: 0.7, color: "rgba(74,54,30,0.45)", amp: 0.6 });
      }
      ctx.restore();
      break;
    }
    case "slateBoard": {
      // 识字班石板：巴掌大的石板，木框缺一边，搭一截石笔
      InkFill(ctx, [[x - 12, y], [x - 11, y - 15], [x + 11, y - 16], [x + 12, y - 1]],
        id + "frame", C("#6b5b42"), { amp: 0.8, lw: 1.4, ...L });
      InkFill(ctx, [[x - 9, y - 2], [x - 8.4, y - 13], [x + 8.6, y - 13.6], [x + 9.4, y - 3]],
        id + "slate", C("#55534c"), { amp: 0.6, lw: 1.1, shade: "rgba(0,0,0,0.14)", ...L });
      if (!sil) {
        // 板上一个歪歪扭扭的名字的节奏（两团浅道道，不写真字）
        InkLine(ctx, x - 5, y - 9, x - 1, y - 8, id + "w1", { lw: 1.2, color: "rgba(200,192,172,0.6)", amp: 0.8 });
        InkLine(ctx, x + 1, y - 10, x + 5, y - 7.4, id + "w2", { lw: 1.2, color: "rgba(200,192,172,0.5)", amp: 0.8 });
        InkLine(ctx, x + 4, y - 2.4, x + 12, y - 4.4, id + "pen", { lw: 1.6, color: "#9a9488", amp: 0.3 });
      }
      break;
    }
    default: {
      InkFill(ctx, Rect(x - 8, y - 10, 16, 10), id + "q", C("#8a7a5c"), { amp: 0.8, lw: 1.4, ...L });
      break;
    }
  }
  ctx.restore();
}

// 前景草丛（layers.fore 专用，z=+3.4 掠过镜头那一层）：三种形，近剪影的暗色。
// 它的职责是**半遮**收藏品——玩家靠走动的视差从草后瞟见东西，这正是勇敢的心
// 藏收藏品的手法。别画太密：挡个六七成，留缝。
export function DrawForeTuft(ctx, x, groundY, id, kind = "grass") {
  const H = 76 + Hash(id + "h") * 22;
  // 上屏要落在 #4a4434 那一档，源色就得压到 #16140c（CanvasTexture 洗白）
  const ink = "#16140c", ink2 = "#100e08";
  // 根部先铺一团实心的草墩：光是几根线遮不住东西，也不像一丛
  ctx.save();
  ctx.fillStyle = ink2;
  ctx.beginPath();
  ctx.ellipse(x, groundY - 6, 20 + Hash(id + "bw") * 8, 13 + Hash(id + "bh") * 5, 0, Math.PI, 0);
  ctx.fill();
  ctx.restore();
  if (kind === "stalks") {
    // 斜插的几根秫秸，梢头带枯叶
    for (let i = 0; i < 8; i += 1) {
      const bx = x - 17 + i * 5 + Sym(id + "sx" + i, 0, 3);
      const lean = Sym(id + "sl" + i, 0, 10);
      InkLine(ctx, bx, groundY, bx + lean, groundY - H * (0.7 + Hash(id + "sh" + i) * 0.3),
        id + "st" + i, { lw: 2.4 + Hash(id + "sw" + i) * 1.2, color: i % 2 ? ink : ink2, amp: 1.6 });
      InkLine(ctx, bx + lean, groundY - H * 0.72, bx + lean + Sym(id + "lf" + i, 0, 12), groundY - H * 0.62,
        id + "leaf" + i, { lw: 1.6, color: ink2, amp: 2.2 });
    }
  } else if (kind === "weeds") {
    // 蒿草：一蓬带籽穗的硬杆草
    for (let i = 0; i < 12; i += 1) {
      const bx = x - 15 + i * 2.8 + Sym(id + "wx" + i, 0, 2);
      const tipX = bx + Sym(id + "wt" + i, 0, 9);
      const tipY = groundY - H * (0.5 + Hash(id + "wh" + i) * 0.45);
      InkLine(ctx, bx, groundY, tipX, tipY, id + "wd" + i,
        { lw: 1.4 + Hash(id + "ww" + i), color: i % 3 ? ink : ink2, amp: 1.8 });
      ctx.save();
      ctx.fillStyle = ink2;
      ctx.beginPath();
      ctx.ellipse(tipX, tipY - 2, 1.6, 3.4, Sym(id + "wa" + i, 0, 0.4), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  } else {
    // 乱草：宽的一丛，叶片往两边披
    for (let i = 0; i < 16; i += 1) {
      const bx = x - 18 + i * 2.4 + Sym(id + "gx" + i, 0, 2);
      const dir = i < 5 ? -1 : i > 6 ? 1 : 0;
      ctx.save();
      ctx.strokeStyle = i % 2 ? ink : ink2;
      ctx.lineWidth = 1.8 + Hash(id + "gw" + i) * 1.2;
      ctx.beginPath();
      ctx.moveTo(bx, groundY);
      ctx.quadraticCurveTo(bx + dir * 4, groundY - H * 0.55,
        bx + dir * (10 + Hash(id + "gr" + i) * 10), groundY - H * (0.42 + Hash(id + "gh" + i) * 0.4));
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ===========================================================================
// 八稿（2026-08-13）新增画笔：焦木、灶火、板缝灰、水圈、蓝花布的几个落点、
// 撕布卡、缝三针卡。判定版面一律来自 Core 的 TEAR_CARD / SEW_CARD——
// **判定与作画共用同一份坐标**，这儿绝不许另抄一套。
// ===========================================================================

// 烧塌棚顶掉下来的那根焦木檩（八稿推焦木——拖拽机制同门板，画的是圆木）。
// 长边是一根烧过的圆木：中段碳化得最黑、两头还剩点木色，几道纵向的炸纹。
export function DrawCharredBeam(ctx, ax, ay, id, { len = 72 } = {}) {
  const th = 9;
  // 木身：一根微弯的圆木（上沿略拱）
  InkFill(ctx, [[ax, ay - 1], [ax + 3, ay - th], [ax + len * 0.3, ay - th - 2.2],
    [ax + len * 0.62, ay - th - 1.6], [ax + len, ay - th + 1.5], [ax + len, ay - 0.5],
    [ax + len * 0.5, ay + 1.2]],
  id + "body", "#3a2e20", { amp: 1.4, lw: 2.2, shade: "rgba(8,5,3,0.35)" });
  // 中段碳化：黑得发亮的一段，边缘皴出鳄皮纹
  ctx.save();
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = "#171009";
  ctx.beginPath();
  ctx.moveTo(ax + len * 0.22, ay);
  ctx.lineTo(ax + len * 0.24, ay - th - 1);
  ctx.lineTo(ax + len * 0.68, ay - th - 0.6);
  ctx.lineTo(ax + len * 0.64, ay + 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // 炸纹：碳化段上几道横短竖长的裂口（鳄皮格）
  ctx.save();
  ctx.strokeStyle = "rgba(90,78,60,0.5)";
  ctx.lineWidth = 0.9;
  for (let i = 0; i < 5; i += 1) {
    const cx2 = ax + len * (0.26 + i * 0.09) + Sym(id + "ckx", i, 1.6);
    ctx.beginPath();
    ctx.moveTo(cx2, ay - th + 0.6);
    ctx.lineTo(cx2 + Sym(id + "ck", i, 1.4), ay - 1);
    ctx.stroke();
  }
  ctx.restore();
  // 两头断口：一头劈茬、一头锯口
  InkLine(ctx, ax + 1, ay - th + 1, ax + 4, ay - 1, id + "endW",
    { lw: 1.2, color: "rgba(120,96,64,0.6)", amp: 1.0 });
  InkFill(ctx, [[ax + len - 2, ay - th + 2], [ax + len + 3, ay - th + 3.5],
    [ax + len + 3, ay - 2], [ax + len - 2, ay - 1.4]], id + "endE", "#57432c",
  { amp: 0.8, lw: 1.4, shade: "rgba(0,0,0,0.2)" });
}

// 草苫旁留着的那块整布（八稿 §9 末柱子放下的；§12 撕过之后 torn=true——
// 少了一条，边上翻着毛口）。夜窖里只求读得出"叠着的蓝布"。
// 草苫旁那块整布（蓝底白花，全章的暗线）。它是**叠起来的一摞**，不是一个团：
// 叠布的特征全在两头——一头是折过来的**闭合折边**（圆的、一层压一层），
// 另一头是散着的**布口**（一道道薄边错开）。老版是一个五边形加一条横线，
// 读出来是块深色的砖（2026-08-17 用户："布料…根本就不像"）。
export function DrawClothRest(ctx, ax, ay, id, { torn = false } = {}) {
  const w = torn ? 15 : 18, h = torn ? 6.5 : 8;
  const LAY = 3;
  const face = "#2b3444", faceLit = "#3b4658", edge = "rgba(120,134,156,0.55)";
  ctx.save();
  for (let L = LAY - 1; L >= 0; L -= 1) {
    const t = L / (LAY - 1 || 1);
    const yTop = ay - 1 - (h - 1) * (L + 1) / LAY;
    const yBot = ay - 1 - (h - 1) * L / LAY;
    const left = ax - w + t * 1.6, right = ax + w - t * 2.4;
    ctx.beginPath();
    // 西头：折回来的闭合边（圆的）
    ctx.moveTo(left + 3, yBot);
    ctx.quadraticCurveTo(left - 2.2, (yTop + yBot) / 2, left + 3, yTop);
    // 上沿略鼓：布是软的
    ctx.quadraticCurveTo(ax, yTop - 1.1, right - 1, yTop + 0.4);
    // 东头：散着的布口，一层比一层短
    ctx.lineTo(right + 1.2, yTop + 1.4);
    ctx.lineTo(right - 0.6, yBot);
    ctx.closePath();
    ctx.fillStyle = L === LAY - 1 ? faceLit : face;
    ctx.fill();
    ctx.strokeStyle = "rgba(16,20,28,0.7)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // 每一层底下压一线暗：层与层之间要分得开
    ctx.strokeStyle = "rgba(8,10,16,0.5)";
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(left + 3, yBot - 0.4);
    ctx.quadraticCurveTo(ax, yBot - 1.1, right - 0.8, yBot - 0.4);
    ctx.stroke();
  }
  // 顶上那一层的软褶：折过的布放平了也回不去
  ClothFold(ctx, ax - w * 0.5, ay - h + 1.4, ax + w * 0.45, ay - h + 2.2, 2.0,
    { bow: -1.4, dark: "rgba(6,9,16,0.45)", lit: "rgba(150,166,190,0.30)" });
  // 白花：印花是**一朵一朵**的（五瓣小花），不是三个圆点
  ctx.fillStyle = "rgba(198,208,222,0.6)";
  for (let i = 0; i < 5; i += 1) {
    const fx = ax - w * 0.62 + i * w * 0.32;
    const fy = ay - h * (0.35 + (i % 2) * 0.42) - 0.5;
    for (let p = 0; p < 5; p += 1) {
      const a = (p / 5) * Math.PI * 2 + Hash(id + "fa" + i);
      ctx.beginPath();
      ctx.ellipse(fx + Math.cos(a) * 1.1, fy + Math.sin(a) * 0.8, 0.75, 0.6, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  // 撕过：东侧翻起一片毛口，几根经纬线头
  if (torn) {
    InkFill(ctx, [[ax + w * 0.55, ay - h - 1], [ax + w, ay - h], [ax + w * 0.9, ay - h + 2.4],
      [ax + w * 0.5, ay - h + 1.6]], id + "rag", "#374254", { amp: 1.2, lw: 1.1 });
    ctx.save();
    ctx.strokeStyle = "rgba(170,182,200,0.7)";
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.moveTo(ax + w * (0.58 + i * 0.12), ay - h + 0.6);
      ctx.lineTo(ax + w * (0.62 + i * 0.12) + Sym(id + "tx", i, 1.4), ay - h - 1.6 - Hash(id + "tl" + i) * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// 灶火与热气（World 的 stoveFire 小画布每帧调）。cx=灶口中线，gy=画布地线。
export function DrawStoveFire(ctx, cx, gy, t) {
  // 灶口的暖光晕
  ctx.save();
  const glow = ctx.createRadialGradient(cx, gy - 8, 2, cx, gy - 8, 22);
  glow.addColorStop(0, "rgba(255,170,70,0.5)");
  glow.addColorStop(1, "rgba(255,140,40,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(cx - 24, gy - 32, 48, 34);
  // 火苗：三条舔上来的舌头，各自按不同频率摆
  for (let i = 0; i < 3; i += 1) {
    const fx = cx + (i - 1) * 5.5;
    const sway = Math.sin(t * (5.2 + i * 1.7) + i * 2.1) * 2.6;
    const hgt = 12 + Math.sin(t * (3.4 + i) + i) * 3 + (i === 1 ? 4 : 0);
    ctx.fillStyle = i === 1 ? "rgba(255,196,96,0.85)" : "rgba(232,140,52,0.7)";
    ctx.beginPath();
    ctx.moveTo(fx - 3.2, gy - 2);
    ctx.quadraticCurveTo(fx - 2.6, gy - hgt * 0.5, fx + sway, gy - 2 - hgt);
    ctx.quadraticCurveTo(fx + 3.0, gy - hgt * 0.45, fx + 3.2, gy - 2);
    ctx.closePath();
    ctx.fill();
  }
  // 芯上最亮那一点
  ctx.fillStyle = "rgba(255,238,180,0.9)";
  ctx.beginPath();
  ctx.ellipse(cx, gy - 5, 2.6, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();
  // 热气：从锅沿（画布上方）一缕一缕，向上散
  ctx.strokeStyle = "rgba(214,222,228,0.30)";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  for (let i = 0; i < 2; i += 1) {
    const ph = (t * 0.35 + i * 0.5) % 1;
    const sy = gy - 44 - ph * 22;
    const sx = cx - 4 + i * 8 + Math.sin(t * 1.3 + i * 2) * 3;
    ctx.globalAlpha = 0.5 * (1 - ph);
    ctx.beginPath();
    ctx.moveTo(sx, sy + 10);
    ctx.quadraticCurveTo(sx + 3, sy + 5, sx - 2, sy);
    ctx.stroke();
  }
  ctx.restore();
}

// 靴子踩上翻板：板缝里落下来的灰（World 摆位置与淡出，这儿只画一撮）
export function DrawSlatDust(ctx, ax, ay, id) {
  ctx.save();
  // 两三道细流
  ctx.strokeStyle = "rgba(168,152,128,0.5)";
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i += 1) {
    ctx.lineWidth = 1.2 + Hash(id + "w" + i) * 0.8;
    const dx = ax + (i - 1) * 7 + Sym(id + "x", i, 2.5);
    ctx.beginPath();
    ctx.moveTo(dx, ay - 52 + Hash(id + "t" + i) * 6);
    ctx.lineTo(dx + Sym(id + "dx", i, 2), ay - 14 - Hash(id + "b" + i) * 8);
    ctx.stroke();
  }
  // 尘粒
  ctx.fillStyle = "rgba(178,162,138,0.5)";
  for (let i = 0; i < 7; i += 1) {
    ctx.beginPath();
    ctx.arc(ax + Sym(id + "px", i, 9), ay - 10 - Hash(id + "py" + i) * 38,
      0.8 + Hash(id + "pr" + i) * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// 舀水那一下：缸口的水圈（随瓢抬起往下沉）＋两道回滴
export function DrawScoopRing(ctx, ax, ay, id) {
  ctx.save();
  ctx.strokeStyle = "rgba(150,178,192,0.7)";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.ellipse(ax, ay - 6, 15, 4.2, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(150,178,192,0.4)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(ax, ay - 6, 9, 2.6, 0, 0, Math.PI * 2);
  ctx.stroke();
  // 回滴：两粒
  ctx.fillStyle = "rgba(150,178,192,0.7)";
  for (let i = 0; i < 2; i += 1) {
    ctx.beginPath();
    ctx.ellipse(ax - 4 + i * 8 + Sym(id, i, 2), ay - 14 - i * 4, 1.1, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// 伤员肩上的那圈蓝花布（World 钉在躺着的人肩头）：两道缠过的布带压着叠。
// **尺寸按实物来**：肩上缠一圈布，正面看约 0.25×0.16m ——画大了就是那块
// 著名的"悬空蓝板"（二轮视觉审查抓过一次，这儿不许再犯）
export function DrawBandage(ctx, ax, ay, id) {
  InkFill(ctx, [[ax - 5.4, ay - 1.2], [ax + 4.8, ay - 2.6], [ax + 5.6, ay + 1.2], [ax - 4.4, ay + 2.6]],
    id + "b1", "#2a3442", { amp: 0.5, lw: 0.8, shade: "rgba(0,0,0,0.28)" });
  InkFill(ctx, [[ax - 5.8, ay + 0.6], [ax + 4.2, ay - 0.6], [ax + 5.2, ay + 2.4], [ax - 4.8, ay + 3.6]],
    id + "b2", "#242e3b", { amp: 0.5, lw: 0.7, shade: "rgba(0,0,0,0.24)" });
  // 压进布层的那个末端：一小角翻边
  InkLine(ctx, ax + 1.8, ay + 0.6, ax + 3.8, ay - 1.1, id + "tuck",
    { lw: 0.6, color: "rgba(120,132,150,0.55)", amp: 0.3 });
  // 白花一点（同一块料子的记号）
  ctx.save();
  ctx.fillStyle = "rgba(168,176,190,0.5)";
  ctx.beginPath();
  ctx.arc(ax - 1.6, ay + 0.4, 0.6, 0, Math.PI * 2);
  ctx.arc(ax + 2.4, ay + 1.6, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// 妹妹袖口那截接上的蓝花布（jacketOn 之后，睡姿手腕边那一小块）。
// 同蓝布带：尺寸按实物（袖口一截约 0.16×0.10m），大了就成一块悬空的板
export function DrawCuff(ctx, ax, ay, id) {
  InkFill(ctx, [[ax - 3.6, ay - 1.6], [ax + 3.2, ay - 2.0], [ax + 3.8, ay + 1.2], [ax - 3.2, ay + 1.6]],
    id + "cuff", "#2a3442", { amp: 0.4, lw: 0.7, shade: "rgba(0,0,0,0.26)" });
  // 接缝那道针脚：三个歪歪扭扭的小点
  ctx.save();
  ctx.strokeStyle = "rgba(150,160,176,0.6)";
  ctx.lineWidth = 0.4;
  for (let i = 0; i < 3; i += 1) {
    const sx = ax - 2.4 + i * 2.0;
    ctx.beginPath();
    ctx.moveTo(sx, ay - 1.4 + (i % 2) * 0.6);
    ctx.lineTo(sx + 0.7, ay - 0.6 + (i % 2) * 0.4);
    ctx.stroke();
  }
  // 白花一小簇
  ctx.fillStyle = "rgba(168,176,190,0.5)";
  ctx.beginPath();
  ctx.arc(ax + 0.6, ay + 0.4, 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  void id;
}

// ---------------------------------------------------------------------------
// 撕布活卡（八稿 §12）。版面 TEAR_CARD；月光下的菜窖，整布摊在草苫上。
// 三把：绷紧（布跟手走到 tautLen 就绷住）→ 裂口（nick）→ 撕开（tearK 推进，
// 撕下来的那条挂在手上、裂口处一线毛边发白）。
// ---------------------------------------------------------------------------
export function DrawTearCard(ctx, W, H, view, L, t) {
  const S = H / 720;
  LiveCardBase(ctx, W, H, "#0e1118");

  const y0 = L.cloth.y * W, h = L.cloth.h * W;
  const x0 = L.cloth.x0 * W, x1 = L.cloth.x1 * W;
  const cor = { x: (view.corner?.x ?? L.corner.x) * W, y: (view.corner?.y ?? L.corner.y) * W };
  const pull = (view.pull || 0) * W;
  const tearK = view.tearK || 0;
  const stripH = L.stripW * W;

  // ── 草苫：布底下垫着的那层，横着几把干草 ──
  ctx.save();
  ctx.strokeStyle = "rgba(96,84,58,0.5)";
  ctx.lineCap = "round";
  for (let i = 0; i < 14; i += 1) {
    ctx.lineWidth = (2 + Hash("trStraw" + i) * 2.2) * S;
    const sy = y0 + h * 0.75 + Hash("trStrawY" + i) * h * 0.75;
    ctx.beginPath();
    ctx.moveTo(x0 - 30 * S + Hash("trStrawX" + i) * (x1 - x0), sy);
    ctx.lineTo(x0 + 30 * S + Hash("trStrawX" + i) * (x1 - x0) + 60 * S, sy + Sym("trStrawD", i, 6 * S));
    ctx.stroke();
  }
  ctx.restore();

  // ── 整布本体。撕开的那条沿顶边走：rip 前锋在 ripX（从东往西推进） ──
  const ripLen = tearK * (x1 - x0) * 0.62;
  const ripX = x1 - 26 * S - ripLen;
  const nicked = !!view.nick;
  // 主体（撕走的条以下的部分 + 没撕到的顶段）
  const body = [
    [x0, y0 + (nicked ? stripH : 0)],
  ];
  if (nicked) {
    // 顶边：西段还连着条，rip 前锋以西仍是整的
    body.unshift([x0, y0]);
    body.splice(1, 0, [Math.max(x0, ripX), y0]);
    body.splice(2, 0, [Math.max(x0, ripX), y0 + stripH]);
  } else {
    // 没裂口：顶边一路到布角（被拉紧时角带着布边往西）
    body.length = 0;
    body.push([x0, y0 + 4 * S], [cor.x, cor.y]);
  }
  body.push([x1 - pull * 0.4, y0 + stripH + 2 * S]);
  body.push([x1 - pull * 0.3, y0 + h]);
  body.push([x0 + 8 * S, y0 + h + 6 * S]);
  InkFill(ctx, body, "trBody" + (nicked ? 1 : 0), "#1f2937",
    { amp: 4 * S, lw: 5 * S, line: "rgba(3,4,6,0.9)", shade: "rgba(0,0,0,0.3)" });

  // 布纹、垂坠的褶、白花（主体上）
  ctx.save();
  ctx.strokeStyle = "rgba(84,98,118,0.28)";
  ctx.lineWidth = 1.4 * S;
  for (let i = 0; i < 5; i += 1) {
    const gy2 = y0 + stripH + (i + 0.5) * (h - stripH) / 5;
    ctx.beginPath();
    ctx.moveTo(x0 + 10 * S, gy2);
    ctx.quadraticCurveTo((x0 + x1) / 2, gy2 + Sym("trWeave", i, 5 * S), x1 - 14 * S, gy2 - 2 * S);
    ctx.stroke();
  }
  // 竖着的几道大褶：布摊下去自己堆出来的。没有它，整幅读成一张蓝纸板
  ctx.strokeStyle = "rgba(8,12,18,0.55)";
  ctx.lineCap = "round";
  for (let i = 0; i < 4; i += 1) {
    const fx = x0 + (i + 0.7) * (x1 - x0) / 5;
    ctx.lineWidth = (5 - i * 0.6) * S;
    ctx.beginPath();
    ctx.moveTo(fx, y0 + stripH + 2 * S);
    ctx.quadraticCurveTo(fx - 10 * S + Sym("trFold", i, 14 * S), y0 + h * 0.6,
      fx + Sym("trFoldE", i, 10 * S), y0 + h - 2 * S);
    ctx.stroke();
    // 褶的亮侧：紧挨着暗线一条浅的（布才有厚度）
    ctx.strokeStyle = "rgba(120,138,166,0.28)";
    ctx.lineWidth = (2.6 - i * 0.3) * S;
    ctx.beginPath();
    ctx.moveTo(fx + 5 * S, y0 + stripH + 2 * S);
    ctx.quadraticCurveTo(fx - 5 * S + Sym("trFold", i, 14 * S), y0 + h * 0.6,
      fx + 5 * S + Sym("trFoldE", i, 10 * S), y0 + h - 2 * S);
    ctx.stroke();
    ctx.strokeStyle = "rgba(8,12,18,0.55)";
  }
  // 白花：满布的碎花（同 motherJacket 那支笔的排法——网格挂簇、按 hash 空掉两三成）
  for (let gx = 0; gx < 8; gx += 1) {
    for (let gy = 0; gy < 3; gy += 1) {
      if (Hash("trBloomG" + gx + "_" + gy) < 0.24) continue;
      const bx = x0 + 16 * S + (gx + 0.2 + Hash("trBX" + gx + "_" + gy) * 0.6) * (x1 - x0 - 32 * S) / 8;
      const by = y0 + stripH + 8 * S
        + (gy + 0.2 + Hash("trBY" + gx + "_" + gy) * 0.6) * (h - stripH - 16 * S) / 3;
      const sc = 0.8 + Hash("trBS" + gx + "_" + gy) * 0.6;
      ctx.fillStyle = `rgba(196,204,218,${0.5 + Hash("trBA" + gx + "_" + gy) * 0.2})`;
      for (let p2 = 0; p2 < 5; p2 += 1) {
        const pa = (p2 / 5) * Math.PI * 2 + Hash("trBP" + gx + "_" + gy) * 2;
        ctx.beginPath();
        ctx.ellipse(bx + Math.cos(pa) * 4.4 * sc * S, by + Math.sin(pa) * 3.4 * sc * S,
          2.6 * sc * S, 1.9 * sc * S, pa, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(150,160,176,0.45)";
      ctx.beginPath();
      ctx.arc(bx, by, 1.6 * sc * S, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // ── 绷紧的皱：抓着角拉的时候，从角上放射出去的几道抻痕 ──
  if (pull > 2 * S && !nicked) {
    ctx.save();
    ctx.strokeStyle = "rgba(10,14,20,0.6)";
    ctx.lineCap = "round";
    for (let i = 0; i < 4; i += 1) {
      ctx.lineWidth = (3.4 - i * 0.6) * S;
      ctx.beginPath();
      ctx.moveTo(cor.x + 4 * S, cor.y + 2 * S);
      ctx.quadraticCurveTo(cor.x - (30 + i * 26) * S, cor.y + (10 + i * 16) * S,
        cor.x - (70 + i * 40) * S, cor.y + (30 + i * 30) * S);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── 裂口之后：撕下来的那条（rip 前锋 → 手上的角），毛边发白 ──
  if (nicked) {
    // 撕下来的那条**是挂着的，不是一块板**：撕口那头还连在布上、手那头被
    // 提着，中间必然坠下去一截。老版只有四个角、四条直边，加上 InkFill 默认那支
    // 暖墨线（布身用的是近黑的 rgba(3,4,6)），读出来是"半空里横着一块牌子"。
    // 中间补一个坠点、墨线换成跟布同一支，它才挂得住
    const rx = Math.max(x0, ripX);
    const sag = 16 * S + Math.sin(t * 2.2) * 4 * S;
    const mx = (rx + cor.x) / 2, my = (y0 + cor.y) / 2 + sag;
    InkFill(ctx, [
      [rx, y0],
      [mx, my - stripH * 0.42],
      [cor.x - 6 * S, cor.y - stripH * 0.5],
      [cor.x + 6 * S, cor.y + stripH * 0.45],
      [mx, my + stripH * 0.5],
      [rx + 8 * S, y0 + stripH + sag * 0.2],
    ], "trStrip", "#26303f",
    { amp: 4.2 * S, lw: 4 * S, line: "rgba(3,4,6,0.9)", shade: "rgba(0,0,0,0.24)" });
    // rip 前锋：一撮发白的毛边线头
    ctx.save();
    ctx.strokeStyle = "rgba(190,198,212,0.75)";
    ctx.lineWidth = 1.6 * S;
    for (let i = 0; i < 5; i += 1) {
      const fx = Math.max(x0, ripX) + Sym("trFray", i, 5 * S);
      ctx.beginPath();
      ctx.moveTo(fx, y0 + stripH * 0.2);
      ctx.lineTo(fx + Sym("trFrayD", i, 4 * S), y0 + stripH * 0.9);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── 按空的那一下：手落在布面上、没揪住角 ──
  // 平摊的布被按住只会陷个窝，抻痕顺着布纹朝那个角跑——**布在指路，不是画箭头**
  //（第 8 条：图形提示必须钉在被操作的东西上）。老版这一下画面上一点动静都
  // 没有，读出来就是"这玩意儿坏了"（2026-08-14 用户：「拖什么都没反应」）
  if (view.press) {
    const px = view.press.x * W, py = view.press.y * W, k = view.press.k;
    ctx.save();
    ctx.globalAlpha = k * 0.55;
    const dg = ctx.createRadialGradient(px, py, 2 * S, px, py, 34 * S);
    dg.addColorStop(0, "rgba(6,9,14,0.75)");
    dg.addColorStop(1, "rgba(6,9,14,0)");
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.ellipse(px, py, 34 * S, 20 * S, 0, 0, Math.PI * 2);
    ctx.fill();
    // 抻痕：从按住的地方一道道扯向布角。**长度按到角的距离给**——写死几十像素
    // 的话它只在指头边上戳出三根短毛，指不到任何地方；扯过半程才读得出
    // "这块布是被那个角牵着的"
    // cor 在函数开头就已经乘过 W 了（是像素，不是卡宽）——再乘一次，抻痕会
    // 一律指向右下 45° 冲出画布
    const dx2 = cor.x - px, dy2 = cor.y - py;
    const reach = Math.max(120 * S, Math.hypot(dx2, dy2) * 0.55);
    const ang = Math.atan2(dy2, dx2);
    ctx.strokeStyle = "rgba(158,176,204,0.9)";
    ctx.lineCap = "round";
    for (let i = 0; i < 3; i += 1) {
      const a2 = ang + (i - 1) * 0.13;
      ctx.globalAlpha = k * (0.55 - i * 0.09);
      ctx.lineWidth = (3 - i * 0.6) * S;
      ctx.beginPath();
      ctx.moveTo(px + Math.cos(a2) * 24 * S, py + Math.sin(a2) * 24 * S);
      ctx.quadraticCurveTo(
        px + Math.cos(a2) * reach * 0.5 + Sym("trPull", i, 10 * S),
        py + Math.sin(a2) * reach * 0.5 + Sym("trPullY", i, 8 * S),
        px + Math.cos(a2) * reach * (1 - i * 0.08), py + Math.sin(a2) * reach * (1 - i * 0.08),
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── 那个**翘起来的角**：平摊的一大片布上唯一立着的一块 ──
  // 「摆在地上的东西认不出来是能抓的」那一条：侧看没厚度就等于没画，所以这一角
  // 要有翻起来的里子、一道折棱、一撮线头——玩家凭形就知道这儿能捏
  if (!nicked) {
    const fx = cor.x, fy = cor.y, lift = 30 * S;
    InkFill(ctx, [
      [fx - 52 * S, fy + 10 * S],
      [fx - 20 * S, fy - lift],
      [fx + 30 * S, fy - lift * 0.5],
      [fx + 14 * S, fy + 18 * S],
    ], "trFlap", "#3b4a63", { amp: 3 * S, lw: 4.5 * S, line: "rgba(3,4,6,0.92)", shade: "rgba(0,0,0,0.2)" });
    ctx.save();
    // 折棱：布翻过来的那道脊
    ctx.strokeStyle = "rgba(140,158,188,0.5)";
    ctx.lineWidth = 2.4 * S;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(fx - 48 * S, fy + 8 * S);
    ctx.quadraticCurveTo(fx - 18 * S, fy - lift * 0.5, fx + 26 * S, fy - lift * 0.42);
    ctx.stroke();
    // 角尖上翘起的几根线头
    ctx.strokeStyle = "rgba(186,196,212,0.6)";
    ctx.lineWidth = 1.4 * S;
    for (let i = 0; i < 4; i += 1) {
      const sx2 = fx + (18 + i * 4) * S, sy2 = fy - lift * (0.5 + i * 0.02);
      ctx.beginPath();
      ctx.moveTo(sx2, sy2);
      ctx.lineTo(sx2 + Sym("trFlapFray", i, 7 * S) + 5 * S, sy2 - (6 + i * 2) * S);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── 手：抓着布角（grab）或伸过去（reaching）；没上手时布角自己招呼 ──
  if (view.grab) {
    SplitHand(ctx, cor.x + 8 * S, cor.y + 4 * S, S, 1, true);
    SplitHand(ctx, x0 + 40 * S, y0 + h * 0.55, S, -1, true);   // 另一只手压着布身
  } else {
    SplitHand(ctx, x0 + 40 * S, y0 + h * 0.6, S, -1, false);
    const pulse = view.reaching ? 0.55 + 0.4 * Math.sin(t * 13) : 0.4 + 0.3 * Math.sin(t * 3.0);
    KnotGlow(ctx, cor.x, cor.y, L.grabR * W * 1.3, 0.12 + pulse * 0.22);
    // **往哪儿拽**：一道浅光顺着布面从角往西跑，一下一下地重复。方向这件事
    // 光靠一团呼吸的光说不出来（第 8 条只许两条路：写进文案 / 长在实物上——
    // 这是后一条，它跑在布纹上，不是一支悬空的箭头）。
    // 裂口一开就撤：那之后这条线正压在撕开的那道口上，读成布面上的划痕，
    // 而"顺着裂口拽到头"那句话已经把方向说了
    if (!nicked) {
      const ph = (t * 0.62) % 1;
      const sxA = cor.x - ph * 0.20 * W, sxB = sxA - 0.075 * W;
      ctx.save();
      ctx.globalAlpha = 0.34 * Math.sin(Math.PI * ph);
      ctx.strokeStyle = "rgba(255,240,200,0.9)";
      ctx.lineCap = "round";
      for (let i = 0; i < 2; i += 1) {
        ctx.lineWidth = (3.2 - i * 1.2) * S;
        const sy3 = y0 + stripH * (0.45 + i * 0.55);
        ctx.beginPath();
        ctx.moveTo(Math.max(x0 + 12 * S, sxA), sy3);
        ctx.lineTo(Math.max(x0 + 12 * S, sxB), sy3 + Sym("trGuide", i, 3 * S));
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ── 板缝漏下来的月光条：两条，斜着（加色） ──
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const [bu, bw] of [[0.30, 0.05], [0.62, 0.034]]) {
    const bx0 = bu * W, bw2 = bw * W, dx = Math.tan(-0.42) * H;
    const gr = ctx.createLinearGradient(bx0, 0, bx0 + dx, H);
    gr.addColorStop(0, "rgba(96,116,150,0.12)");
    gr.addColorStop(1, "rgba(96,116,150,0.02)");
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.moveTo(bx0, -10 * S);
    ctx.lineTo(bx0 + bw2, -10 * S);
    ctx.lineTo(bx0 + bw2 + dx, H + 10 * S);
    ctx.lineTo(bx0 + dx, H + 10 * S);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // 角晕：夜往里收
  const v = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.3, W * 0.5, H * 0.5, H * 0.95);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(1,1,2,0.65)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------------------
// 缝三针活卡（八稿 §13）。版面 SEW_CARD；黎明青灰，窖口的光。
// 旧褂袖口（暗红）+ 蓝布条，竖着一道接缝；针捏在手里：送到进针点穿出、
// 拉线到头。三针的歪（偏高/偏低小褶/折回）由版面钉死，画笔照着还原。
// ---------------------------------------------------------------------------
export function DrawSewCard(ctx, W, H, view, L, t) {
  const S = H / 720;
  LiveCardBase(ctx, W, H, "#2b323c");

  const P = (p) => [p.x * W, p.y * W];
  const n = view.n || 0;

  // ── 膝头/门板案：底下一条暗木沿（他坐在窖口最上一级梯子上缝）──
  const kneeY = (L.sleeve.y + L.sleeve.h + 0.10) * W;
  ctx.save();
  ctx.fillStyle = "#241d15";
  ctx.fillRect(-8 * S, kneeY, W + 16 * S, H - kneeY + 8 * S);
  ctx.restore();
  InkLine(ctx, -10 * S, kneeY, W + 10 * S, kneeY - 4 * S, "swKnee",
    { lw: 4 * S, color: "rgba(8,5,2,0.9)", amp: 4 * S });

  // ── 旧褂袖筒（暗红，磨旧）──
  const sl = L.sleeve;
  const slPts = [
    [sl.x0 * W, sl.y * W + 3 * S], [sl.x1 * W, sl.y * W],
    [(sl.x1 + 0.004) * W, (sl.y + sl.h) * W],
    [sl.x0 * W, (sl.y + sl.h) * W + 5 * S],
    [(sl.x0 - 0.03) * W, (sl.y + sl.h * 0.5) * W],
  ];
  InkFill(ctx, slPts, "swSleeve", "#4a2622",
    { amp: 3.4 * S, lw: 4.6 * S, line: "rgba(6,3,3,0.9)", shade: "rgba(0,0,0,0.28)" });
  // 袖筒的两道旧褶 + 磨飞的边（贴近接缝那头绒毛毛的）
  ctx.save();
  ctx.strokeStyle = "rgba(20,8,8,0.55)";
  ctx.lineWidth = 3 * S;
  for (let i = 0; i < 2; i += 1) {
    ctx.beginPath();
    ctx.moveTo((sl.x0 + 0.05 + i * 0.1) * W, sl.y * W + 4 * S);
    ctx.quadraticCurveTo((sl.x0 + 0.04 + i * 0.1) * W, (sl.y + sl.h * 0.6) * W,
      (sl.x0 + 0.06 + i * 0.1) * W, (sl.y + sl.h) * W);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(150,110,104,0.5)";
  ctx.lineWidth = 1.2 * S;
  for (let i = 0; i < 6; i += 1) {
    const fy = (sl.y + 0.012 + i * (sl.h - 0.02) / 6) * W;
    ctx.beginPath();
    ctx.moveTo(L.seamX * W - 2 * S, fy);
    ctx.lineTo(L.seamX * W - 7 * S - Hash("swFray" + i) * 5 * S, fy + Sym("swFrayD", i, 3 * S));
    ctx.stroke();
  }
  ctx.restore();

  // ── 蓝布条（接上去的那截）──
  const pa2 = L.patch;
  // 第二针拉出的小褶：pucker 之后布条中腰往里拧一点
  const pk = n >= 2 ? 1 : 0;
  const paPts = [
    [pa2.x0 * W, pa2.y * W + 2 * S],
    [(pa2.x0 + 0.09) * W, pa2.y * W + pk * 5 * S],
    [pa2.x1 * W, pa2.y * W + 3 * S],
    [(pa2.x1 + 0.006) * W, (pa2.y + pa2.h) * W],
    [(pa2.x0 + 0.10) * W, (pa2.y + pa2.h) * W + pk * 4 * S],
    [pa2.x0 * W, (pa2.y + pa2.h) * W + 2 * S],
  ];
  InkFill(ctx, paPts, "swPatch" + pk, "#243244",
    { amp: 3 * S, lw: 4.2 * S, line: "rgba(3,5,8,0.9)", shade: "rgba(0,0,0,0.24)" });
  // 蓝布上的白花
  ctx.save();
  ctx.fillStyle = "rgba(186,194,208,0.55)";
  for (let i = 0; i < 6; i += 1) {
    const bx = (pa2.x0 + 0.03 + Hash("swBloomX" + i) * (pa2.x1 - pa2.x0 - 0.05)) * W;
    const by = (pa2.y + 0.015 + Hash("swBloomY" + i) * (pa2.h - 0.03)) * W;
    for (let p3 = 0; p3 < 4; p3 += 1) {
      const paA = (p3 / 4) * Math.PI * 2 + Hash("swBloomP" + i) * 2;
      ctx.beginPath();
      ctx.ellipse(bx + Math.cos(paA) * 3.0 * S, by + Math.sin(paA) * 2.2 * S,
        1.8 * S, 1.3 * S, paA, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // ── 已经缝上的针脚：一针一个样（偏高/偏低小褶/折回绕线头）──
  ctx.save();
  ctx.strokeStyle = "#cdd4de";
  ctx.lineCap = "round";
  for (let i = 0; i < Math.min(n, L.stitches.length); i += 1) {
    const st = L.stitches[i];
    const sy = (st.send.y + (st.off || 0)) * W;
    ctx.lineWidth = 2.6 * S;
    ctx.beginPath();
    ctx.moveTo(L.seamX * W - 9 * S, sy + Sym("swStA", i, 2 * S));
    ctx.lineTo(L.seamX * W + 9 * S, sy + Sym("swStB", i, 3 * S));
    ctx.stroke();
    if (st.pucker) {
      // 小褶：针脚两侧布被拉出的一道挤纹
      ctx.lineWidth = 2 * S;
      ctx.strokeStyle = "rgba(10,6,8,0.6)";
      ctx.beginPath();
      ctx.moveTo(L.seamX * W - 16 * S, sy - 7 * S);
      ctx.quadraticCurveTo(L.seamX * W, sy + 2 * S, L.seamX * W + 15 * S, sy - 6 * S);
      ctx.stroke();
      ctx.strokeStyle = "#cdd4de";
    }
    if (st.back) {
      // 折回绕线头：针脚上一个小线圈，勒紧
      ctx.lineWidth = 1.8 * S;
      ctx.beginPath();
      ctx.ellipse(L.seamX * W + 3 * S, sy, 5.5 * S, 3.4 * S, 0.4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();

  // ── 针与线 ──
  const ndl = view.needle || L.needle0;
  const nx = ndl.x * W, ny = ndl.y * W;
  const stz = L.stitches[Math.min(n, L.stitches.length - 1)];
  // 线：针眼拖着一段，连回上一针（或布边）
  const from = n > 0 ? { x: L.seamX, y: L.stitches[n - 1].send.y + (L.stitches[n - 1].off || 0) }
    : { x: pa2.x1 - 0.02, y: pa2.y + pa2.h };
  ctx.save();
  ctx.strokeStyle = "rgba(206,212,222,0.65)";
  ctx.lineWidth = 1.6 * S;
  ctx.beginPath();
  ctx.moveTo(from.x * W, from.y * W);
  ctx.quadraticCurveTo((from.x * W + nx) / 2 + Math.sin(t * 1.7) * 8 * S,
    Math.max(from.y * W, ny) + 26 * S, nx, ny);
  ctx.stroke();
  // 针身：一根亮的细杆，斜着
  ctx.strokeStyle = "#d8dde6";
  ctx.lineWidth = 2.4 * S;
  ctx.beginPath();
  ctx.moveTo(nx - 9 * S, ny + 7 * S);
  ctx.lineTo(nx + 9 * S, ny - 7 * S);
  ctx.stroke();
  ctx.fillStyle = "#d8dde6";
  ctx.beginPath();
  ctx.arc(nx - 8 * S, ny + 6.4 * S, 1.6 * S, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (view.grab) {
    SplitHand(ctx, nx + 12 * S, ny + 10 * S, S, 1, true);
    // 另一只手把两块布捏在一起（接缝底下）
    SplitHand(ctx, L.seamX * W - 26 * S, (sl.y + sl.h + 0.02) * W, S, -1, true);
  } else {
    SplitHand(ctx, L.seamX * W - 26 * S, (sl.y + sl.h + 0.02) * W, S, -1, false);
    const pulse = view.reaching ? 0.55 + 0.4 * Math.sin(t * 13) : 0.4 + 0.3 * Math.sin(t * 3.0);
    KnotGlow(ctx, nx, ny, L.grabR * W * 1.25, 0.12 + pulse * 0.22);
  }
  // 目标点的呼吸光：这一针该去的地方（穿出点 / 拉线的落点）
  if (view.grab && n < L.stitches.length) {
    const aim = view.phase === "pull" ? stz.pull : stz.send;
    KnotGlow(ctx, aim.x * W, aim.y * W, 0.035 * W, 0.16 + 0.14 * Math.sin(t * 6));
  }

  // 晨光从右上斜进来一条（窖口的方向）
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const gr = ctx.createLinearGradient(W * 0.86, 0, W * 0.6, H);
  gr.addColorStop(0, "rgba(150,168,190,0.14)");
  gr.addColorStop(1, "rgba(150,168,190,0)");
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  const v = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.3, W * 0.5, H * 0.5, H * 0.95);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(2,2,3,0.55)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  void P;
}

// ===========================================================================
// 过场框景（`World.SetCineFore`）与左右分屏的撕口缝（`World.SetSplitShot`）
//
// 2026-08-14 用户拿勇敢的心的过场截图定的方向。看那几张图：石砌门洞的两根柱、
// 前后两棵树干、贴着镜头躺着的那具尸体——**每一张过场都有一块压得很暗、被画框
// 切掉的近景**。它不是装饰：
//   · 这套白盒的屋里是一堵大土墙，不给近景就有半屏是空的；
//   · 一块很近的东西才能把"纵深"这件事说出来（镜头一动它扫过去）；
//   · 它是画面里唯一真正黑的地方——分级能提对比，但提不出没有的黑。
//
// 三条画法（都是画废了才看出来的那种）：
//   ① **不许糊**。参考图里的门柱、树干都是实的。糊开只会读成"镜头脏了"
//      （fore 层当年那"两根白白的模糊一坨"就是这么来的）。
//   ② **背光的那条边要留一道亮边**。全黑的一块就是贴纸；亮边一出来，
//      它立刻变成"挡在光前面的东西"。
//   ③ **里头要有纹理**（木纹、坯缝、草茬），不然还是块黑板。
// ===========================================================================
// 前景块的色号是**跟分级一起算的**：分级把暗部乘到 0.42 左右，所以这里画
// 0.42 上屏才落到 0.18——"很暗但看得出是根木头"。第一版按"近乎全黑"画
// （#332c23），分级之后是一块纯黑剪影，实拍读出来是"贴了张黑纸"，
// 只好再拿一条很亮的边去救，那条边又变成一根发光的线（两轮实拍各错一次）。
// **暗到看不出材质就过头了**：参考图里的门柱能看见石缝、树干能看见皮。
const FORE_INK = {
  body: "#6b5c46", dark: "#4c4133", deep: "#2b2519",
  rim: "#d8c49a", rimCool: "#a9b8c8",
};
// dim：1＝按上表画；>1 更黑（贴得更近的那块）。这几个色号看着"黑得离谱"才是对的
// ——CanvasTexture 没声明 colorSpace，上屏会整体提亮一大截。
function ForeMix(hex, dim) {
  const n = parseInt(hex.slice(1), 16);
  const k = Math.max(0, Math.min(1, 1 / Math.max(0.35, dim)));
  const r = Math.round(((n >> 16) & 255) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
}

export function DrawCineFore(ctx, W, H, kind, dim = 1) {
  const C = (key) => ForeMix(FORE_INK[key], key === "rim" || key === "rimCool" ? 1 : dim);
  const id = "fg" + kind;
  ctx.clearRect(0, 0, W, H);
  switch (kind) {
    // 门框立柱：一根立木 + 顶上一小截门楣。摆在画框一侧，剩下的一边留给戏
    case "doorJamb": {
      const w = W * 0.62;
      InkFill(ctx, [[0, 0], [w, H * 0.02], [w * 0.94, H * 0.55], [w, H], [0, H]], id, C("body"),
        { amp: W * 0.012, line: C("deep"), lw: Math.max(2, W * 0.018) });
      // 木纹：顺着立柱走的几道
      ctx.save();
      ctx.globalAlpha = 0.5;
      for (let i = 1; i <= 5; i += 1) {
        const x = w * (0.16 + i * 0.15);
        InkLine(ctx, x, H * 0.04, x + Sym(id + "g", i, W * 0.02), H * 0.97, id + i,
          { amp: W * 0.01, lw: Math.max(1, W * 0.008), color: i % 2 ? C("dark") : C("deep") });
      }
      ctx.restore();
      // 门楣：从柱顶往画框里探出一截（读作"门洞"而不是"电线杆"）
      InkFill(ctx, Rect(0, 0, W, H * 0.085), id + "l", C("dark"),
        { amp: W * 0.01, line: C("deep"), lw: Math.max(1.5, W * 0.012) });
      // 亮边：屋里的光打在柱子朝内的那条棱上
      ctx.save();
      ctx.globalAlpha = 0.42;
      InkLine(ctx, w * 0.97, H * 0.09, w * 0.92, H * 0.98, id + "r",
        { amp: W * 0.008, lw: Math.max(2, W * 0.030), color: C("rim") });
      ctx.restore();
      break;
    }
    // 门板：**整扇门**压在画框一侧——分镜 01/02/03 每张都是它占掉小半幅。
    //
    // 为什么不能拿立面上那扇门：过场里第四堵墙整个不画（World 的 filmic），
    // 给门正脸就是一个透出地平线的空门洞（镜头规范里那条④）。所以门在过场里
    // 只能当**前景框景**：它不是世界里那扇门，是"贴着镜头的一块门板"。
    //
    // 三样缺一不可（照分镜逐条对的）：
    //  ① **一道竖着的光缝**——门闩没插，门缝里透进来外头的天光。它是整幅画里
    //     唯一的亮，也是"门关着但没关严"这句话的全部；
    //  ② **一副门闩**（横铁片＋两枚钉），高度落在画框中上部；
    //  ③ **竖着的木纹**要密（板门是一条条竖板拼的），并且**光缝两侧各有一条
    //     亮边**：光从缝里漏出来会舔亮两侧的板棱，只画一条缝是贴了张白纸。
    case "doorSlab": {
      // 缝落在板身**里头**（0.86），右边还留一条板——不然缝就成了板的边，
      // 实拍读出来是"一根白棍子浮在人前面"（2026-08-16 第一版就是这样）
      const seamX = W * 0.86;
      const seamW = Math.max(2, W * 0.020);
      // 门板本体：**画满整张画布**（左沿到右沿），外沿不许直（板门年久，边是啃过的）
      InkFill(ctx, [[0, 0], [W, -H * 0.02], [W * 0.995, H * 0.5], [W, H * 1.02], [0, H]],
        id, C("body"), { amp: W * 0.010, line: C("deep"), lw: Math.max(2, W * 0.016) });
      // 竖板缝：板门是一条条竖板拼的，间距不匀
      ctx.save();
      ctx.globalAlpha = 0.55;
      for (let i = 1; i <= 6; i += 1) {
        const x = W * (0.08 + i * 0.145) + Sym(id + "p", i, W * 0.012);
        InkLine(ctx, x, H * 0.03, x + Sym(id + "q", i, W * 0.014), H * 0.98, id + "v" + i,
          { amp: W * 0.008, lw: Math.max(1, W * 0.007), color: i % 2 ? C("dark") : C("deep") });
      }
      ctx.restore();
      // 门闩：横铁片压在板上，两枚钉。铁比木深一档
      const bx = W * 0.30, by = H * 0.44, bw = W * 0.40, bh = H * 0.075;
      InkFill(ctx, [[bx, by], [bx + bw, by - bh * 0.18], [bx + bw, by + bh * 0.82], [bx, by + bh]],
        id + "b", C("deep"), { amp: W * 0.006, line: C("deep"), lw: Math.max(1.5, W * 0.010) });
      ctx.save();
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < 2; i += 1) {
        const nx = bx + bw * (0.18 + i * 0.55);
        InkFill(ctx, [[nx - W * 0.010, by + bh * 0.22], [nx + W * 0.010, by + bh * 0.18],
          [nx + W * 0.008, by + bh * 0.62], [nx - W * 0.011, by + bh * 0.66]], id + "n" + i,
        C("rim"), { amp: W * 0.004, line: C("deep"), lw: Math.max(1, W * 0.006) });
      }
      ctx.restore();
      // **那道光缝**：门闩没插，缝里透着外头的白天。缝本身给满，两侧舔一道亮边
      ctx.save();
      const g = ctx.createLinearGradient(seamX - seamW * 2.2, 0, seamX + seamW * 1.6, 0);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.42, C("rim"));
      g.addColorStop(0.58, C("rim"));
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = g;
      ctx.fillRect(seamX - seamW * 2.2, 0, seamW * 3.8, H);
      // 缝不是一条直线：门板歪着，缝时宽时窄
      ctx.globalCompositeOperation = "destination-out";
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#000";
      for (let i = 0; i < 7; i += 1) {
        const y0 = H * (i / 7), y1 = H * ((i + 1) / 7);
        const w2 = seamW * (0.35 + Rnd(id + "sw", i) * 0.5);
        ctx.fillRect(seamX - seamW * 2.2, y0, seamW * 2.2 - w2 * 0.5, y1 - y0);
        ctx.fillRect(seamX + w2 * 0.5, y0, seamW * 2.0, y1 - y0);
      }
      ctx.restore();
      // 门板朝里那条棱：被缝里的光舔亮
      ctx.save();
      ctx.globalAlpha = 0.38;
      InkLine(ctx, seamX - seamW * 1.5, H * 0.02, seamX - seamW * 1.7, H * 0.98, id + "rim",
        { amp: W * 0.006, lw: Math.max(2, W * 0.016), color: C("rim") });
      ctx.restore();
      break;
    }
    // 房梁：横在画框上沿的一根梁，底下垂着椽子头与苇箔的茬。
    // **梁身要占大半张画布**——第一版 0.62 配上长短不一的长齿，梁身整个被推出
    // 画框，屏幕上只剩一排黑方块，读成城墙垛口（实拍抓的）
    case "beam": {
      const hb = H * 0.74;
      InkFill(ctx, [[0, 0], [W, 0], [W, hb], [W * 0.5, hb * 1.06], [0, hb * 0.96]], id, C("body"),
        { amp: H * 0.012, line: C("deep"), lw: Math.max(2, H * 0.016) });
      ctx.save();
      ctx.globalAlpha = 0.45;
      for (let i = 1; i <= 4; i += 1) {
        const y = hb * (0.2 + i * 0.17);
        InkLine(ctx, W * 0.02, y, W * 0.98, y + Sym(id + "g", i, H * 0.02), id + i,
          { amp: H * 0.008, lw: Math.max(1, H * 0.008), color: C("dark") });
      }
      ctx.restore();
      // 椽子头：一排短齿，长短不一
      for (let i = 0; i < 9; i += 1) {
        const x = W * (0.04 + i * 0.108);
        const len = (H - hb) * (0.28 + Rnd(id + "r", i) * 0.46);
        InkFill(ctx, Rect(x, hb * 0.98, W * 0.052, len), id + "r" + i, C("dark"),
          { amp: W * 0.006, line: C("deep"), lw: Math.max(1, W * 0.006) });
      }
      // 梁底那条亮边：屋里的光从底下打上来，这一条就是"梁"与"一块黑板"的分界
      ctx.save();
      ctx.globalAlpha = 0.40;
      InkLine(ctx, 0, hb * 0.97, W, hb * 1.01, id + "rim", { amp: H * 0.006, lw: Math.max(2, H * 0.018), color: C("rim") });
      ctx.restore();
      break;
    }
    // 炕沿：画框下沿的一道土台，上头压着卷起来的被褥
    case "kangEdge": {
      const top = H * 0.42;
      InkFill(ctx, [[0, top], [W * 0.35, top - H * 0.03], [W, top + H * 0.02], [W, H], [0, H]], id, C("body"),
        { amp: W * 0.008, line: C("deep"), lw: Math.max(2, W * 0.012) });
      // 坯缝
      ctx.save();
      ctx.globalAlpha = 0.4;
      for (let i = 1; i <= 3; i += 1) {
        const y = top + (H - top) * (i / 4);
        InkLine(ctx, 0, y, W, y + Sym(id + "s", i, H * 0.012), id + "s" + i,
          { amp: W * 0.006, lw: Math.max(1, W * 0.005), color: C("deep") });
      }
      ctx.restore();
      // 被褥卷：压在炕沿上的一团，轮廓要有瓣不能是半个椭圆
      const bx = W * 0.58, by = top - H * 0.01;
      InkFill(ctx, [[bx - W * 0.30, by], [bx - W * 0.22, by - H * 0.13], [bx, by - H * 0.17],
        [bx + W * 0.24, by - H * 0.12], [bx + W * 0.34, by + H * 0.01]], id + "q", C("dark"),
        { amp: W * 0.012, line: C("deep"), lw: Math.max(1.5, W * 0.01) });
      // 炕沿那道亮边：横贯整幅、够亮，读出来才是"一道台沿"而不是一片黑
      ctx.save();
      ctx.globalAlpha = 0.44;
      InkLine(ctx, 0, top + H * 0.004, W * 0.36, top - H * 0.028, id + "rimA", { amp: W * 0.005, lw: Math.max(2, H * 0.020), color: C("rim") });
      InkLine(ctx, W * 0.36, top - H * 0.028, W, top + H * 0.024, id + "rimB", { amp: W * 0.005, lw: Math.max(2, H * 0.020), color: C("rim") });
      ctx.restore();
      break;
    }
    // 水瓮的肩：画框一角鼓出来的一大块圆
    case "vat": {
      ctx.save();
      ctx.beginPath();
      const cx = W * 0.5, cy = H * 1.06, r = W * 0.56;
      ctx.moveTo(cx - r, H);
      for (let i = 0; i <= 24; i += 1) {
        const a = Math.PI + (i / 24) * Math.PI;
        ctx.lineTo(cx + Math.cos(a) * (r + Sym(id, i, W * 0.012)), cy + Math.sin(a) * (r * 0.86));
      }
      ctx.closePath();
      ctx.fillStyle = C("body");
      ctx.fill();
      ctx.strokeStyle = C("deep");
      ctx.lineWidth = Math.max(2, W * 0.016);
      ctx.stroke();
      ctx.restore();
      // 瓮口那圈：一道亮边压在肩上
      ctx.save();
      ctx.globalAlpha = 0.44;
      ctx.beginPath();
      ctx.ellipse(W * 0.5, H * 0.52, W * 0.40, H * 0.075, 0, Math.PI, Math.PI * 2);
      ctx.strokeStyle = C("rim");
      ctx.lineWidth = Math.max(2, W * 0.024);
      ctx.stroke();
      ctx.restore();
      break;
    }
    // 窖口的板沿：从底下往上看时，画框下沿那道厚木边（亮边在上，光从屋里来）
    case "hatchLip": {
      InkFill(ctx, [[0, H * 0.30], [W * 0.42, H * 0.24], [W, H * 0.31], [W, H], [0, H]], id, C("dark"),
        { amp: W * 0.006, line: C("deep"), lw: Math.max(2, W * 0.012) });
      ctx.save();
      ctx.globalAlpha = 0.5;
      for (let i = 1; i <= 3; i += 1) {
        const y = H * (0.30 + i * 0.17);
        InkLine(ctx, 0, y, W, y + Sym(id + "p", i, H * 0.01), id + "p" + i,
          { amp: W * 0.005, lw: Math.max(1, W * 0.005), color: C("deep") });
      }
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.46;
      InkLine(ctx, 0, H * 0.295, W, H * 0.305, id + "rim", { amp: W * 0.005, lw: Math.max(2, H * 0.022), color: C("rim") });
      ctx.restore();
      break;
    }
    // 梯子帮：一根边梃 + 两三根横档伸出画框
    case "ladder": {
      const w = W * 0.30;
      InkFill(ctx, Rect(W * 0.30, 0, w, H), id, C("body"),
        { amp: W * 0.01, line: C("deep"), lw: Math.max(2, W * 0.016) });
      for (let i = 0; i < 3; i += 1) {
        const y = H * (0.16 + i * 0.33);
        InkFill(ctx, Rect(W * 0.30, y, W * 0.70, H * 0.055), id + "r" + i, C("dark"),
          { amp: W * 0.008, line: C("deep"), lw: Math.max(1.5, W * 0.01) });
      }
      ctx.save();
      ctx.globalAlpha = 0.40;
      InkLine(ctx, W * 0.30 + w * 0.94, H * 0.02, W * 0.30 + w * 0.9, H * 0.98, id + "rim",
        { amp: W * 0.008, lw: Math.max(2, W * 0.030), color: C("rimCool") });
      ctx.restore();
      break;
    }
    // 草苫/柴草的一角：底下一排乱茬，茬尖长短不一。
    // **柴火是横七竖八堆的，不是插在土里的**：老版 46 根几乎等距、几乎竖直、
    // 长短只差三成的细线，出来是一把梳子（2026-08-17 序章掀盖那一镜实拍抓的）。
    // 三条改法——歪得开（±50°）、长得差得开（三成到满格）、**得有几根横着压在
    // 上头**（柴堆的轮廓是交叉出来的，不是一排竖线的顶端连成的）
    case "strawEdge": {
      InkFill(ctx, [[0, H * 0.56], [W, H * 0.50], [W, H], [0, H]], id, C("dark"),
        { amp: W * 0.01, line: null, lw: 0 });
      ctx.lineCap = "round";
      for (let i = 0; i < 38; i += 1) {
        // 成簇：三四根挤在一处，簇与簇之间留得出缝
        const x = W * ((Math.floor(i / 3) + Rnd(id + "c", i) * 0.9) / 13);
        const len = H * (0.16 + Rnd(id + "h", i) ** 1.6 * 0.62);
        const lean = (Rnd(id + "a", i) - 0.5) * 1.7;         // ±50°
        ctx.strokeStyle = Rnd(id + "s", i) > 0.7 ? C("rim") : C("body");
        ctx.globalAlpha = Rnd(id + "s", i) > 0.7 ? 0.5 : 1;
        ctx.beginPath();
        ctx.lineWidth = Math.max(1.2, W * (0.004 + Rnd(id + "w", i) * 0.009));
        ctx.moveTo(x, H * (0.60 + Rnd(id + "b", i) * 0.24));
        ctx.lineTo(x + Math.sin(lean) * len, H * 0.60 - Math.cos(lean) * len);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // 横压在堆上的那几根：轮廓靠它们咬缺，才不是一排竖线的顶端
      for (let i = 0; i < 5; i += 1) {
        const y = H * (0.56 + Rnd(id + "ly", i) * 0.30);
        const x0 = W * Rnd(id + "lx", i) * 0.7;
        ctx.strokeStyle = C("body");
        ctx.beginPath();
        ctx.lineWidth = Math.max(1.6, W * 0.010);
        ctx.moveTo(x0, y);
        ctx.quadraticCurveTo(x0 + W * 0.16, y - H * 0.05, x0 + W * (0.22 + Rnd(id + "ll", i) * 0.20), y + H * 0.03);
        ctx.stroke();
      }
      break;
    }
    // 一堵墙的立边（最省的一档：转角、灶台侧面、门扇的背面）
    default: {
      InkFill(ctx, [[0, 0], [W * 0.86, H * 0.03], [W * 0.92, H * 0.48], [W * 0.84, H], [0, H]], id, C("body"),
        { amp: W * 0.014, line: C("deep"), lw: Math.max(2, W * 0.016) });
      ctx.save();
      ctx.globalAlpha = 0.24;
      for (let i = 0; i < 14; i += 1) {
        const x = W * (0.08 + Rnd(id + "px", i) * 0.72);
        const y = H * Rnd(id + "py", i);
        ctx.beginPath();
        ctx.ellipse(x, y, W * 0.03, H * 0.012, Rnd(id + "pr", i) * 3, 0, Math.PI * 2);
        ctx.fillStyle = C("deep");
        ctx.fill();
      }
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.42;
      InkLine(ctx, W * 0.86, H * 0.04, W * 0.83, H * 0.98, id + "rim",
        { amp: W * 0.01, lw: Math.max(2, W * 0.028), color: C("rim") });
      ctx.restore();
      break;
    }
  }
}

// 左右分屏中间那道缝：参考图里是**画上去的一道白**，不是两块画之间的黑边——
// 它带手的痕迹（边是撕的、宽窄不匀、微微歪），所以两格才读成"同一张纸上的两幅"。
// 画在一张窄画布上，由 World 摆成屏幕正中一条竖带（不拉伸，1 texel ≈ 1 像素）。
export function DrawSplitSeam(ctx, W, H) {
  ctx.clearRect(0, 0, W, H);
  const pts = [];
  const steps = 40;
  for (let i = 0; i <= steps; i += 1) {           // 左沿
    const t = i / steps;
    pts.push([W * (0.24 + Math.sin(t * 2.3) * 0.05) + Sym("seamL", i, W * 0.05), H * t]);
  }
  for (let i = steps; i >= 0; i -= 1) {           // 右沿（回来）
    const t = i / steps;
    pts.push([W * (0.76 + Math.sin(t * 1.7 + 1.2) * 0.05) + Sym("seamR", i, W * 0.05), H * t]);
  }
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts) ctx.lineTo(p[0], p[1]);
  ctx.closePath();
  ctx.fillStyle = "#f2e8d2";
  ctx.fill();
  // 纸的脏：两侧各压一道很淡的暖影，白带不至于像一根荧光棒
  ctx.save();
  ctx.clip();
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, "rgba(120,104,78,0.42)");
  g.addColorStop(0.5, "rgba(120,104,78,0)");
  g.addColorStop(1, "rgba(120,104,78,0.42)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
