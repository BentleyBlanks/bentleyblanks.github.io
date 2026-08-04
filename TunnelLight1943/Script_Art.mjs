// 《地道里的光》 —— 2D 手绘风矢量美术库（Canvas 2D）。
// 目标：钢笔勾线 + 水彩填色的插画感（参考《勇敢的心》的 UbiArt 手绘质感），
// 而不是几何色块。所有形体用带抖动的贝塞尔路径绘制，抖动由 id 决定 —— 逐帧稳定，不闪。

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
  // 建筑
  wallWarm: "#d8c09a", wallShade: "#b89b72",
  roofTile: "#8a6a52", roofShade: "#6b503c",
  wood: "#a8794a", woodDark: "#7a5433",
  burnt: "#4a423a", burntDark: "#332d27",
  // 自然
  tree: "#5c7040", treeDark: "#41522e",
  hay: "#d0b063", hayDark: "#a88a45",
  crop: "#8a9a52",
  // 地下土层（从上到下的层理）
  soil: ["#8a6b45", "#7d5f3c", "#9a7850", "#6b4f33", "#5a4129"],
  tunnelAir: "#241a12",
  tunnelWall: "#7a5c3a",
  // 人物
  zhuzi: "#c8843c", zhuziDark: "#a2662a",
  sister: "#b8636e", sisterDark: "#934b56",
  mother: "#8a7060", father: "#6d5340",
  militia: "#5a6b74", militiaDark: "#44535b",
  soldier: "#7a7448", soldierDark: "#5c5732",
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
// 人物：分层剪影（后腿/后臂/躯干/前腿/前臂/头），带走路与呼吸
// spec: {x, y, scale, facing(±1), kind, phase, crouch, carry, lamp, id}
// 坐标以脚底中心为原点，向上为负 y（屏幕坐标系）
// ---------------------------------------------------------------------------
const KIND_COLOR = {
  player: [PAL.zhuzi, PAL.zhuziDark],
  sister: [PAL.sister, PAL.sisterDark],
  family: [PAL.mother, "#6d5748"],
  militia: [PAL.militia, PAL.militiaDark],
  soldier: [PAL.soldier, PAL.soldierDark],
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
  if (kind === "soldier") {
    InkFill(ctx, [
      [-6.4 * S, headY - 5.6 * S], [4.2 * S, headY - 8.2 * S], [7.4 * S, headY - 5.2 * S], [-6.0 * S, headY - 3.4 * S],
    ], id + "cap", "#5f5a30", { amp: 0.5 * S, lw: lw * 0.9 });
    InkFill(ctx, [
      [4.6 * S, headY - 5.4 * S], [10.2 * S, headY - 4.2 * S], [9.8 * S, headY - 2.8 * S], [4.6 * S, headY - 3.6 * S],
    ], id + "brim", "#4a461f", { amp: 0.4 * S, lw: lw * 0.8 });
    // 步枪（背在身后）
    ctx.save();
    ctx.translate(-6 * S, hipY - 2 * S);
    ctx.rotate(-0.42);
    InkFill(ctx, Rect(-1.6 * S, -22 * S, 3.2 * S, 30 * S), id + "rifle", "#54402c", { amp: 0.35 * S, lw: lw * 0.7 });
    ctx.restore();
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

// 锥形肢体：从枢轴向下延伸 len，上宽 w0 下宽 w1
export function DrawLimb(ctx, px, py, len, w0, w1, color, id, { lw = 4 } = {}) {
  InkFill(ctx, [
    [px - w0 / 2, py], [px + w0 / 2, py],
    [px + w1 / 2, py + len], [px - w1 / 2, py + len],
  ], id, color, { amp: 1.6, lw, shade: "rgba(0,0,0,0.16)", shadeAt: 0.56 });
}

export function DrawFootPart(ctx, px, py, len, h, color, id) {
  InkFill(ctx, [
    [px - h * 0.5, py], [px + len, py], [px + len - 2, py + h], [px - h * 0.6, py + h],
  ], id, color, { amp: 1.2, lw: 3.6, shade: "rgba(0,0,0,0.2)" });
}

// 躯干：枢轴在胯（底边中点），短褂下摆略散
export function DrawTorsoPart(ctx, px, py, w, h, kind, id) {
  const [coat] = RIG_COLOR(kind);
  InkFill(ctx, [
    [px - w * 0.40, py - h], [px + w * 0.40, py - h],
    [px + w * 0.50, py - h * 0.22], [px + w * 0.54, py],
    [px - w * 0.54, py], [px - w * 0.50, py - h * 0.22],
  ], id, coat, { amp: 1.8, lw: 4.4, shade: "rgba(0,0,0,0.15)", shadeAt: 0.54 });
  // 腰带与衣襟
  InkLine(ctx, px - w * 0.5, py - h * 0.1, px + w * 0.5, py - h * 0.1, id + "belt",
    { lw: 5, color: "rgba(43,31,22,0.8)", amp: 1.2 });
  InkLine(ctx, px + w * 0.08, py - h * 0.9, px + w * 0.14, py - h * 0.14, id + "lapel",
    { lw: 3, color: "rgba(43,31,22,0.55)", amp: 1.6 });
  // 布料褶皱
  for (let i = 0; i < 2; i += 1) {
    InkLine(ctx, px - w * 0.3 + i * w * 0.2, py - h * 0.62, px - w * 0.26 + i * w * 0.2, py - h * 0.24,
      id + "fold" + i, { lw: 2, color: "rgba(43,31,22,0.3)", amp: 2 });
  }
}

// 头：枢轴在脖根（底边中点）
export function DrawHeadPart(ctx, px, py, r, kind, id) {
  const lw = 4.2;
  // 脖子
  InkFill(ctx, Rect(px - r * 0.26, py - r * 0.34, r * 0.52, r * 0.4), id + "neck", PAL.skinDark,
    { amp: 1, lw: 0, line: null });
  // 头（侧脸：后脑圆、下巴收）
  InkFill(ctx, [
    [px - r * 0.92, py - r * 0.30], [px - r * 0.86, py - r * 1.30],
    [px - r * 0.10, py - r * 1.72], [px + r * 0.72, py - r * 1.36],
    [px + r * 1.00, py - r * 0.62], [px + r * 0.86, py - r * 0.06],
    [px - r * 0.62, py - r * 0.02],
  ], id + "skull", PAL.skin, { amp: 1.4, lw, shade: "rgba(0,0,0,0.10)", shadeAt: 0.6 });
  // 鼻梁
  ctx.beginPath();
  ctx.moveTo(px + r * 0.94, py - r * 0.78);
  ctx.quadraticCurveTo(px + r * 1.22, py - r * 0.56, px + r * 0.90, py - r * 0.36);
  ctx.strokeStyle = IN.inkSoft;
  ctx.lineWidth = lw * 0.7;
  ctx.stroke();
  // 眼
  ctx.fillStyle = IN.ink;
  ctx.beginPath();
  ctx.ellipse(px + r * 0.50, py - r * 0.86, r * 0.10, r * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  // 嘴（一道短线）
  InkLine(ctx, px + r * 0.62, py - r * 0.36, px + r * 0.86, py - r * 0.34, id + "mouth",
    { lw: 2.2, color: IN.inkSoft, amp: 0.6 });

  // 头饰
  if (kind === "soldier") {
    InkFill(ctx, [
      [px - r * 1.02, py - r * 1.18], [px + r * 0.56, py - r * 1.82],
      [px + r * 1.06, py - r * 1.16], [px - r * 0.98, py - r * 0.82],
    ], id + "cap", "#5f5a30", { amp: 1.2, lw: lw * 0.9 });
    InkFill(ctx, [
      [px + r * 0.70, py - r * 1.20], [px + r * 1.60, py - r * 0.98],
      [px + r * 1.54, py - r * 0.70], [px + r * 0.70, py - r * 0.90],
    ], id + "brim", "#4a461f", { amp: 1, lw: lw * 0.8 });
  } else if (kind === "puppet") {
    InkFill(ctx, [
      [px - r * 1.04, py - r * 1.02], [px - r * 0.06, py - r * 1.86],
      [px + r * 1.06, py - r * 1.00], [px - r * 0.98, py - r * 0.72],
    ], id + "hat", "#3a352c", { amp: 1.4, lw: lw * 0.9 });
  } else if (kind === "militia") {
    InkFill(ctx, [
      [px - r * 1.06, py - r * 0.94], [px - r * 0.02, py - r * 1.80],
      [px + r * 1.08, py - r * 0.90], [px + r * 0.98, py - r * 0.44], [px - r * 0.98, py - r * 0.50],
    ], id + "towel", "#ddd6c2", { amp: 1.6, lw: lw * 0.9, shade: "rgba(0,0,0,0.08)" });
    InkFill(ctx, [
      [px - r * 1.02, py - r * 0.80], [px - r * 1.66, py - r * 0.16],
      [px - r * 1.20, py - r * 0.02], [px - r * 0.92, py - r * 0.48],
    ], id + "tail", "#ccc4ae", { amp: 1.4, lw: lw * 0.8 });
  } else if (kind === "sister") {
    InkFill(ctx, [
      [px - r * 0.90, py - r * 1.26], [px + r * 0.18, py - r * 1.90],
      [px + r * 1.02, py - r * 1.04], [px - r * 0.86, py - r * 0.68],
    ], id + "hair", "#3a2a1f", { amp: 1.5, lw: lw * 0.85 });
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.arc(px - r * 1.14 - i * r * 0.06, py - r * 0.36 + i * r * 0.5, r * 0.34, 0, Math.PI * 2);
      ctx.fillStyle = "#3a2a1f";
      ctx.fill();
      ctx.strokeStyle = IN.ink;
      ctx.lineWidth = lw * 0.6;
      ctx.stroke();
    }
  } else {
    InkFill(ctx, [
      [px - r * 0.94, py - r * 1.20], [px + r * 0.10, py - r * 1.84],
      [px + r * 1.00, py - r * 1.02], [px - r * 0.90, py - r * 0.62],
    ], id + "hair", "#33251b", { amp: 1.5, lw: lw * 0.85 });
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
  if (kind === "soldier") {
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
    for (let k = 0; k < 3; k += 1) {
      ctx.beginPath();
      ctx.arc(-R * 1.02 - k * R * 0.04, -R * 0.30 + k * R * 0.40, R * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = hair;
      ctx.fill();
    }
  }
  ctx.restore();
}

// 扛着的东西
export function DrawCarry(ctx, x, y, S, facing, label) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);
  if (label === "水桶") {
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
  } else {
    InkFill(ctx, Rect(-26 * S, -3.2 * S, 52 * S, 6.4 * S), "plank", "#a8794a",
      { amp: 0.6 * S, lw: 1.9 * S, shade: "rgba(0,0,0,0.14)" });
    InkLine(ctx, -24 * S, 0, 24 * S, 0, "plankGrain", { lw: 0.9 * S, color: "rgba(90,60,35,0.7)", amp: 1.4 });
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 建筑与道具
// ---------------------------------------------------------------------------
export function DrawHouse(ctx, x, groundY, w, h, id, { burnt = false, night = false } = {}) {
  const W = w, H = h;
  if (burnt) {
    // 残墙：一堵立着，其余塌成瓦砾
    InkFill(ctx, [
      [x - W / 2, groundY], [x - W / 2 + 3, groundY - H * 0.82],
      [x - W / 2 + 16, groundY - H * 0.86], [x - W / 2 + 20, groundY - H * 0.44],
      [x - W / 2 + 34, groundY - H * 0.30], [x - W / 2 + 30, groundY],
    ], id, PAL.burnt, { amp: 2.2, lw: 2.4, shade: "rgba(0,0,0,0.2)" });
    Hatch(ctx, x - W / 2, groundY - H * 0.8, 36, H * 0.8, id + "h", { spacing: 7, alpha: 0.2 });
    // 瓦砾堆
    for (let i = 0; i < 7; i += 1) {
      const rx = x - W / 4 + Rnd(id, i) * W * 0.7;
      const rs = 4 + Rnd(id, i + 20) * 7;
      InkFill(ctx, Rect(rx, groundY - rs, rs * 1.6, rs), id + "r" + i, PAL.burntDark, { amp: 1.4, lw: 1.6 });
    }
    // 焦黑的梁
    InkLine(ctx, x - 10, groundY - 4, x + 26, groundY - 22, id + "beam", { lw: 5, color: "#241f1a", amp: 2 });
    return;
  }
  // 墙体
  InkFill(ctx, Rect(x - W / 2, groundY - H, W, H), id, PAL.wallWarm,
    { amp: 1.6, lw: 2.6, shade: "rgba(74,56,42,0.18)", shadeAt: 0.62 });
  Speckle(ctx, x - W / 2, groundY - H, W, H, id + "sp", { count: 30, alpha: 0.10, size: 1.8 });
  // 夯土层理：一版一版夯上去的横线，华北土墙的标志
  ctx.save();
  ctx.globalAlpha = 0.20;
  ctx.strokeStyle = "#6b5539";
  for (let ly = 1; ly * (H * 0.16) < H; ly += 1) {
    const yy = groundY - ly * H * 0.16;
    ctx.lineWidth = 1.4 + (ly % 2) * 0.8;
    ctx.beginPath();
    ctx.moveTo(x - W / 2 + 2, yy);
    for (let t = 0; t <= 10; t += 1) ctx.lineTo(x - W / 2 + (W * t) / 10, yy + Sym(id + "ly" + ly, t, 2.2));
    ctx.stroke();
  }
  ctx.restore();
  // 墙根返潮：贴地一条深色，往上晕开
  ctx.save();
  const damp = ctx.createLinearGradient(0, groundY - H * 0.30, 0, groundY);
  damp.addColorStop(0, "rgba(70,54,36,0)");
  damp.addColorStop(1, "rgba(70,54,36,0.42)");
  ctx.fillStyle = damp;
  ctx.fillRect(x - W / 2, groundY - H * 0.30, W, H * 0.30);
  ctx.restore();
  // 屋檐投影：檐下一条压暗，墙才有厚度
  ctx.save();
  const eave = ctx.createLinearGradient(0, groundY - H, 0, groundY - H * 0.74);
  eave.addColorStop(0, "rgba(48,36,24,0.42)");
  eave.addColorStop(1, "rgba(48,36,24,0)");
  ctx.fillStyle = eave;
  ctx.fillRect(x - W / 2, groundY - H, W, H * 0.26);
  ctx.restore();
  // 剥落与旧联的残纸
  for (let i = 0; i < 3; i += 1) {
    const px = x - W / 2 + 14 + Rnd(id + "pl", i) * (W - 28);
    const py = groundY - H * (0.3 + Rnd(id + "pl2", i) * 0.5);
    InkFill(ctx, [[px, py], [px + 10, py - 4], [px + 13, py + 9], [px + 2, py + 11]],
      id + "peel" + i, "#b9a37e", { amp: 1.2, lw: 1.4, line: "rgba(43,31,22,0.35)" });
  }
  // 墙基石
  InkFill(ctx, Rect(x - W / 2, groundY - H * 0.16, W, H * 0.16), id + "base", PAL.wallShade, { amp: 1.2, lw: 2 });
  for (let i = 0; i * 26 < W; i += 1) {
    InkLine(ctx, x - W / 2 + i * 26, groundY - H * 0.16, x - W / 2 + i * 26, groundY,
      id + "bs" + i, { lw: 1.2, color: "rgba(60,46,32,0.45)", amp: 1.2 });
  }
  // 瓦顶：略微外挑 + 一排瓦楞
  const rw = W + 22, rh = H * 0.30;
  InkFill(ctx, [
    [x - rw / 2, groundY - H], [x - W * 0.34, groundY - H - rh],
    [x + W * 0.34, groundY - H - rh], [x + rw / 2, groundY - H],
  ], id + "roof", PAL.roofTile, { amp: 1.8, lw: 2.6, shade: "rgba(0,0,0,0.16)" });
  ctx.save();
  ctx.globalAlpha = 0.5;
  for (let i = -rw / 2 + 8; i < rw / 2 - 4; i += 9) {
    const t = (i + rw / 2) / rw;
    InkLine(ctx, x + i, groundY - H, x + (i * 0.68), groundY - H - rh + 2, id + "tile" + i,
      { lw: 1.3, color: PAL.roofShade, amp: 0.8 });
  }
  ctx.restore();
  // 门与窗
  const dw = Math.min(20, W * 0.2), dh = H * 0.55;
  InkFill(ctx, Rect(x - W * 0.28, groundY - dh, dw, dh), id + "door", "#5c452f", { amp: 1.2, lw: 2.2 });
  const ww = Math.min(17, W * 0.17);
  InkFill(ctx, Rect(x + W * 0.14, groundY - H * 0.66, ww, ww * 0.85), id + "win",
    night ? "#c99b4a" : "#4a3a2a", { amp: 1.2, lw: 2.2 });
  InkLine(ctx, x + W * 0.14, groundY - H * 0.66 + ww * 0.42, x + W * 0.14 + ww, groundY - H * 0.66 + ww * 0.42,
    id + "winBar", { lw: 1.4, color: IN.ink });
  InkLine(ctx, x + W * 0.14 + ww / 2, groundY - H * 0.66, x + W * 0.14 + ww / 2, groundY - H * 0.66 + ww * 0.85,
    id + "winBar2", { lw: 1.4, color: IN.ink });
}

export function DrawDoorframe(ctx, x, groundY, id, { carved = false } = {}) {
  const H = 74, W = 40;
  InkFill(ctx, Rect(x - W / 2, groundY - H, 8, H), id + "l", PAL.wood, { amp: 1.1, lw: 2.4, shade: "rgba(0,0,0,0.15)" });
  InkFill(ctx, Rect(x + W / 2 - 8, groundY - H, 8, H), id + "r", PAL.wood, { amp: 1.1, lw: 2.4, shade: "rgba(0,0,0,0.15)" });
  InkFill(ctx, Rect(x - W / 2 - 4, groundY - H - 9, W + 8, 10), id + "t", PAL.woodDark, { amp: 1.1, lw: 2.4 });
  // 木纹
  for (let i = 0; i < 3; i += 1) {
    InkLine(ctx, x - W / 2 + 2, groundY - H + 12 + i * 20, x - W / 2 + 2, groundY - H + 28 + i * 20,
      id + "g" + i, { lw: 0.9, color: "rgba(90,60,35,0.55)", amp: 1.6 });
  }
  // 爹刻的那道线
  InkLine(ctx, x - W / 2 + 1, groundY - 30, x - W / 2 + 8, groundY - 30, id + "mark1", { lw: 2.4, color: "#f0e0b0", amp: 0.4 });
  if (carved) {
    InkLine(ctx, x - W / 2 + 1, groundY - 44, x - W / 2 + 8, groundY - 44, id + "mark2", { lw: 2.4, color: "#fff0c8", amp: 0.4 });
  }
}

export function DrawTree(ctx, x, groundY, id, { big = false, night = false, bare = false } = {}) {
  const H = big ? 120 : 74;
  const trunkW = big ? 13 : 8;
  // 树干：略弯 + 分叉
  InkFill(ctx, [
    [x - trunkW / 2, groundY], [x - trunkW / 2 + 2, groundY - H * 0.62],
    [x - trunkW * 0.9, groundY - H * 0.78], [x + trunkW * 0.2, groundY - H * 0.70],
    [x + trunkW * 1.1, groundY - H * 0.84], [x + trunkW / 2 + 1, groundY - H * 0.58],
    [x + trunkW / 2, groundY],
  ], id + "trunk", "#6b5136", { amp: 1.6, lw: 2.4, shade: "rgba(0,0,0,0.18)" });
  for (let i = 0; i < 3; i += 1) {
    InkLine(ctx, x - 2, groundY - 8 - i * 16, x - 2, groundY - 20 - i * 16, id + "bark" + i,
      { lw: 1, color: "rgba(50,36,24,0.6)", amp: 1.4 });
  }
  if (bare) return;
  // 树冠：几团叠加的不规则块
  const cy = groundY - H * 0.86;
  const cr = big ? 46 : 28;
  const base = night ? PAL.treeDark : PAL.tree;
  for (let i = 0; i < 4; i += 1) {
    const ox = Sym(id + "c", i, cr * 0.55);
    const oy = Sym(id + "c", i + 10, cr * 0.3);
    const r = cr * (0.62 + Rnd(id + "c", i + 20) * 0.4);
    const pts = [];
    for (let a = 0; a < 9; a += 1) {
      const ang = (a / 9) * Math.PI * 2;
      const rr = r * (0.82 + Rnd(id + "c" + i, a) * 0.36);
      pts.push([x + ox + Math.cos(ang) * rr, cy + oy + Math.sin(ang) * rr * 0.78]);
    }
    InkFill(ctx, pts, id + "crown" + i, i % 2 ? base : (night ? "#33422f" : "#4e6237"),
      { amp: 2.4, lw: i === 0 ? 2.4 : 0, line: i === 0 ? IN.ink : null });
  }
  Speckle(ctx, x - cr, cy - cr, cr * 2, cr * 1.6, id + "leaf", { count: 30, alpha: 0.14, size: 2.2, color: "#243018" });
}

export function DrawHaystack(ctx, x, groundY, w, id, { night = false } = {}) {
  const W = w, H = w * 1.05;
  const base = night ? "#8a7a48" : PAL.hay;
  InkFill(ctx, [
    [x - W / 2, groundY], [x - W * 0.36, groundY - H * 0.62],
    [x - W * 0.06, groundY - H], [x + W * 0.30, groundY - H * 0.66],
    [x + W / 2, groundY],
  ], id, base, { amp: 2.6, lw: 2.5, shade: "rgba(80,55,20,0.2)" });
  // 草秆
  ctx.save();
  ctx.globalAlpha = 0.42;
  ctx.strokeStyle = night ? "#6b5c33" : PAL.hayDark;
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 16; i += 1) {
    const px = x - W * 0.44 + Rnd(id, i) * W * 0.88;
    const py = groundY - Rnd(id, i + 30) * H * 0.72;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Sym(id, i + 60, 5), py - 8 - Rnd(id, i + 90) * 7);
    ctx.stroke();
  }
  ctx.restore();
  // 顶上的杆
  InkLine(ctx, x - W * 0.06, groundY - H, x - W * 0.02, groundY - H - 11, id + "pole", { lw: 2, color: "#6b5433" });
}

export function DrawWell(ctx, x, groundY, id, { night = false } = {}) {
  // 井台
  InkFill(ctx, [[x - 26, groundY], [x - 22, groundY - 22], [x + 22, groundY - 22], [x + 26, groundY]],
    id, "#9a938a", { amp: 1.6, lw: 2.6, shade: "rgba(0,0,0,0.18)" });
  // 井口的黑
  InkFill(ctx, [[x - 15, groundY - 22], [x + 15, groundY - 22], [x + 12, groundY - 27], [x - 12, groundY - 27]],
    id + "hole", "#1b1611", { amp: 1, lw: 2 });
  // 石缝
  for (let i = 0; i < 4; i += 1) {
    InkLine(ctx, x - 20 + i * 11, groundY - 2, x - 20 + i * 11, groundY - 20, id + "s" + i,
      { lw: 1.1, color: "rgba(60,50,40,0.5)", amp: 1.2 });
  }
  // 辘轳架
  InkFill(ctx, Rect(x - 22, groundY - 66, 6, 46), id + "p1", PAL.woodDark, { amp: 1, lw: 2.2 });
  InkFill(ctx, Rect(x + 16, groundY - 66, 6, 46), id + "p2", PAL.woodDark, { amp: 1, lw: 2.2 });
  InkFill(ctx, Rect(x - 26, groundY - 72, 52, 7), id + "top", PAL.wood, { amp: 1.2, lw: 2.2 });
  InkLine(ctx, x - 2, groundY - 65, x - 2, groundY - 38, id + "rope", { lw: 1.4, color: "#6b5c45", amp: 1.6 });
  InkFill(ctx, Rect(x - 8, groundY - 38, 13, 12), id + "bucket", "#8a6a45", { amp: 1, lw: 2 });
}

export function DrawMillstone(ctx, x, groundY, id) {
  InkFill(ctx, [[x - 30, groundY], [x - 27, groundY - 15], [x + 27, groundY - 15], [x + 30, groundY]],
    id, "#a29a8e", { amp: 1.6, lw: 2.6, shade: "rgba(0,0,0,0.16)" });
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, groundY - 15, 27, 6.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#b5ada0";
  ctx.fill();
  ctx.strokeStyle = IN.ink;
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.restore();
  // 磨眼与磨齿
  ctx.beginPath();
  ctx.ellipse(x, groundY - 16, 5, 2.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#3a3229";
  ctx.fill();
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    InkLine(ctx, x + Math.cos(a) * 8, groundY - 16 + Math.sin(a) * 2,
      x + Math.cos(a) * 24, groundY - 15 + Math.sin(a) * 5.6, id + "t" + i,
      { lw: 1, color: "rgba(70,62,52,0.6)", amp: 0.6 });
  }
}

export function DrawWall(ctx, x, groundY, w, h, id, { burnt = false } = {}) {
  InkFill(ctx, Rect(x - w / 2, groundY - h, w, h), id, burnt ? PAL.burnt : "#c0ab86",
    { amp: 1.6, lw: 2.4, shade: "rgba(74,56,42,0.2)" });
  // 夯土层理
  for (let i = 1; i * 11 < h; i += 1) {
    InkLine(ctx, x - w / 2 + 2, groundY - i * 11, x + w / 2 - 2, groundY - i * 11, id + "l" + i,
      { lw: 1, color: "rgba(90,72,52,0.45)", amp: 1.4 });
  }
  Speckle(ctx, x - w / 2, groundY - h, w, h, id + "sp", { count: 16, alpha: 0.12 });
  // 墙头草
  for (let i = 0; i < 4; i += 1) {
    const gx = x - w / 2 + 6 + Rnd(id, i) * (w - 12);
    InkLine(ctx, gx, groundY - h, gx + Sym(id, i + 5, 4), groundY - h - 7 - Rnd(id, i + 9) * 5,
      id + "g" + i, { lw: 1.2, color: burnt ? "#5a5348" : "#7d8c4a" });
  }
}

export function DrawWoodpile(ctx, x, groundY, id) {
  for (let row = 0; row < 3; row += 1) {
    for (let i = 0; i < 4 - row; i += 1) {
      const px = x - 26 + row * 7 + i * 15;
      const py = groundY - 10 - row * 11;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(px, py, 7.4, 5.6, 0, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 ? "#a8794a" : "#96683e";
      ctx.fill();
      ctx.strokeStyle = IN.ink;
      ctx.lineWidth = 1.9;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(px, py, 3.4, 2.4, 0, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(70,45,25,0.6)";
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.restore();
    }
  }
}

export function DrawBench(ctx, x, groundY, id) {
  InkFill(ctx, Rect(x - 26, groundY - 26, 52, 8), id, PAL.wood, { amp: 1, lw: 2.3, shade: "rgba(0,0,0,0.14)" });
  InkFill(ctx, Rect(x - 22, groundY - 18, 6, 18), id + "l1", PAL.woodDark, { amp: 0.8, lw: 2 });
  InkFill(ctx, Rect(x + 16, groundY - 18, 6, 18), id + "l2", PAL.woodDark, { amp: 0.8, lw: 2 });
  // 台面上的刨子与墨斗
  InkFill(ctx, Rect(x - 14, groundY - 34, 22, 8), id + "plane", "#8a6a45", { amp: 0.8, lw: 2 });
  InkLine(ctx, x - 10, groundY - 34, x + 2, groundY - 40, id + "handle", { lw: 2.2, color: "#5c4530" });
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

export function DrawCrops(ctx, x, groundY, w, id, { night = false } = {}) {
  const color = night ? "#5a6640" : PAL.crop;
  const n = Math.max(6, Math.round(w / 9));
  for (let i = 0; i < n; i += 1) {
    const px = x - w / 2 + (i + Rnd(id, i) * 0.6) * (w / n);
    const h = 34 + Rnd(id, i + 50) * 16;
    ctx.beginPath();
    ctx.moveTo(px, groundY);
    ctx.quadraticCurveTo(px + Sym(id, i + 90, 4), groundY - h * 0.6, px + Sym(id, i + 120, 8), groundY - h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.stroke();
    // 穗
    ctx.beginPath();
    ctx.ellipse(px + Sym(id, i + 120, 8), groundY - h - 3, 2.6, 5.4, Sym(id, i, 0.5), 0, Math.PI * 2);
    ctx.fillStyle = night ? "#6b7048" : "#bfa85c";
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
  InkFill(ctx, Rect(x - w / 2, groundY - h, w, h), id, "#9a9182",
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

export function DrawShaft(ctx, x, topY, botY, id) {
  // 竖井：掏空 + 爬梯横档
  InkFill(ctx, Rect(x - 17, topY, 34, botY - topY), id, PAL.tunnelAir, { amp: 1.4, lw: 2.4, line: "#3a2a1a" });
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = "#7a5c3a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - 15, topY);
  ctx.lineTo(x - 15, botY);
  ctx.stroke();
  ctx.restore();
  for (let y = topY + 12; y < botY - 4; y += 17) {
    InkFill(ctx, Rect(x - 13, y, 26, 4.6), id + "r" + Math.round(y), "#a07f4e", { amp: 0.7, lw: 1.7 });
  }
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

// 目标指示：手绘小箭头
export function DrawMarker(ctx, x, y, t) {
  const bob = Math.sin(t * 3.4) * 5;
  ctx.save();
  ctx.translate(x, y + bob);
  InkFill(ctx, [[-9, -12], [9, -12], [0, 4]], "marker", "#f0c95c", { amp: 0.6, lw: 2.2 });
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 插入特写卡：把镜头真正要看的那个细节单独画一张，铺满画框。
// 勇敢的心就是这么处理特写的——不去放大世界里的精灵，另画一张。
// 画布约定：以 (0,0)-(W,H) 为画框，构图自带留白。
// ---------------------------------------------------------------------------
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
