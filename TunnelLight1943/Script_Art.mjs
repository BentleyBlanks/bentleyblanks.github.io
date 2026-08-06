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
  // 娘穿靛蓝土布（华北农妇最常见的一身），爹穿土褐短褂——
  // 侧视白盒里认人主要靠色相，两个人都是褐色就永远分不出谁是谁
  mother: "#4e5c6b", motherDark: "#39434f", father: "#6d5340",
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
  family: [PAL.mother, PAL.motherDark],
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

// 锥形肢体：从枢轴向下延伸 len，上宽 w0 下宽 w1
export function DrawLimb(ctx, px, py, len, w0, w1, color, id, { lw = 4, k = 1 } = {}) {
  InkFill(ctx, [
    [px - w0 / 2, py], [px + w0 / 2, py],
    [px + w1 / 2, py + len], [px - w1 / 2, py + len],
  ], id, color, { amp: 1.6 * k, lw: lw * k, shade: "rgba(0,0,0,0.16)", shadeAt: 0.56 });
}

export function DrawFootPart(ctx, px, py, len, h, color, id, k = 1) {
  InkFill(ctx, [
    [px - h * 0.5, py], [px + len, py], [px + len - 2 * k, py + h], [px - h * 0.6, py + h],
  ], id, color, { amp: 1.2 * k, lw: 3.6 * k, shade: "rgba(0,0,0,0.2)" });
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
    [px - w * 0.30, py - h],                 // 后肩
    [px + w * 0.24, py - h],                 // 前肩（略收，肩不是方的）
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
}

// 头：枢轴在脖根（底边中点）
export function DrawHeadPart(ctx, px, py, r, kind, id, k = 1) {
  const lw = 4.2 * k;
  // 脖子
  InkFill(ctx, Rect(px - r * 0.26, py - r * 0.34, r * 0.52, r * 0.4), id + "neck", PAL.skinDark,
    { amp: 1 * k, lw: 0, line: null });
  // 头（侧脸：后脑圆、下巴收）
  InkFill(ctx, [
    [px - r * 0.92, py - r * 0.30], [px - r * 0.86, py - r * 1.30],
    [px - r * 0.10, py - r * 1.72], [px + r * 0.72, py - r * 1.36],
    [px + r * 1.00, py - r * 0.62], [px + r * 0.86, py - r * 0.06],
    [px - r * 0.62, py - r * 0.02],
  ], id + "skull", PAL.skin, { amp: 1.4 * k, lw, shade: "rgba(0,0,0,0.10)", shadeAt: 0.6 });
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
    { lw: 2.2 * k, color: IN.inkSoft, amp: 0.6 * k });

  // 头饰
  if (kind === "soldier") {
    InkFill(ctx, [
      [px - r * 1.02, py - r * 1.18], [px + r * 0.56, py - r * 1.82],
      [px + r * 1.06, py - r * 1.16], [px - r * 0.98, py - r * 0.82],
    ], id + "cap", "#5f5a30", { amp: 1.2 * k, lw: lw * 0.9 });
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
  } else if (kind === "family") {
    // 娘：抿到脑后挽成一个髻。侧视里这是"一眼认出是谁"最省的一笔
    InkFill(ctx, [
      [px - r * 0.96, py - r * 1.16], [px + r * 0.10, py - r * 1.86],
      [px + r * 1.00, py - r * 1.04], [px - r * 0.92, py - r * 0.58],
    ], id + "hair", "#2f2219", { amp: 1.5 * k, lw: lw * 0.85 });
    ctx.beginPath();
    ctx.arc(px - r * 1.12, py - r * 0.86, r * 0.40, 0, Math.PI * 2);
    ctx.fillStyle = "#2f2219";
    ctx.fill();
    ctx.strokeStyle = IN.ink;
    ctx.lineWidth = lw * 0.7;
    ctx.stroke();
  } else {
    InkFill(ctx, [
      [px - r * 0.94, py - r * 1.20], [px + r * 0.10, py - r * 1.84],
      [px + r * 1.00, py - r * 1.02], [px - r * 0.90, py - r * 0.62],
    ], id + "hair", "#33251b", { amp: 1.5 * k, lw: lw * 0.85 });
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
    // 三八式：握把在原点，枪身顺着"手往下"画（同锯/锄头，渲染层让它跟着前臂转）。
    // 抡枪托砸下来的时候，砸在最前头的就是这头的托——所以托必须画在枪身末端，
    // 不能像以前那样把整支枪烘死在背上当装饰：胳膊抡了，枪还在背上。
    // 细长的一根，只有末端那块托是宽的——轮廓一眼读得出是枪不是板子
    const L = 27;
    InkFill(ctx, [[-0.9 * S, -3 * S], [0.9 * S, -3 * S], [0.8 * S, (L - 9) * S], [-0.8 * S, (L - 9) * S]],
      "rifleBarrel", "#4d4a44", { amp: 0.22 * S, lw: 0.9 * S });                        // 枪管：细
    InkFill(ctx, [[-1.7 * S, (L - 13) * S], [1.7 * S, (L - 13) * S], [1.5 * S, (L - 3) * S], [-1.5 * S, (L - 3) * S]],
      "rifleBody", "#5b452e", { amp: 0.28 * S, lw: 1.0 * S, shade: "rgba(0,0,0,0.2)" }); // 护木与机匣
    InkFill(ctx, [[-2.4 * S, (L - 4) * S], [2.0 * S, (L - 4) * S], [2.6 * S, (L + 4.5) * S], [-1.6 * S, (L + 4.5) * S]],
      "rifleButt", "#46351f", { amp: 0.36 * S, lw: 1.2 * S, shade: "rgba(0,0,0,0.26)" }); // 枪托：砸人的那头
    InkLine(ctx, 0, -3 * S, 0, -8.5 * S, "rifleBayo", { lw: 0.9 * S, color: "#9aa0a6" }); // 刺刀
  } else if (label === "锯") {
    // 华北木匠的框锯：工字木框，一边绷锯条、一边绞麻绳。
    // 画的时候锯条顺着"手往下"的方向（局部 +y）——渲染层让它跟着前臂转，
    // 手一伸一屈，锯就一进一出。握点（原点）在近侧立柱上端。
    const L = 21;    // 锯全长（绘制单位，×S）≈0.75m，框锯本来就不长
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
  } else if (label === "锄头") {
    // 长柄锄：木柄顺着"手往下"的方向（跟着前臂转——扬过肩、落进土都是它），
    // 柄端一块弯下去的铁锄板。握点（原点）在柄上三分之一处。
    InkLine(ctx, 0, -12 * S, 0, 25 * S, "hoeShaft", { lw: 1.15 * S, color: "#8d6236" });
    InkFill(ctx, [[-1.2 * S, 23.5 * S], [5.2 * S, 26.5 * S], [6.6 * S, 30.5 * S], [1.2 * S, 28 * S]],
      "hoeBlade", "#6b6f76", { amp: 0.4 * S, lw: 1.2 * S, shade: "rgba(0,0,0,0.25)" });
  } else if (label === "满桶水" || label === "一桶水" || label === "空桶") {
    DrawCarry(ctx, 0, 0, S, 1, "水桶");
    if (label !== "空桶") {
      InkFill(ctx, [[-5 * S, 1.6 * S], [5 * S, 1.6 * S], [4.6 * S, 3.4 * S], [-4.6 * S, 3.4 * S]],
        "bucketWater", "#5a7a8c", { amp: 0.4 * S, lw: 1.2 * S });
    }
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
  } else if (label === "麻绳") {
    ctx.strokeStyle = "#9a7d4f";
    ctx.lineWidth = 2.2 * S;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.arc(0, 0, (4 + i * 2.2) * S, 0.3 + i * 0.5, Math.PI * 1.8 + i * 0.4);
      ctx.stroke();
    }
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

export function DrawHouse(ctx, x, groundY, w, h, id, { burnt = false, night = false, door = false } = {}) {
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
  // door=true 是可进入的家：门开在东头（对着院子），洞是敞的——
  // 人从这儿走进去，立面就淡出让位给屋里
  if (door) {
    const dw2 = 30, dh2 = H * 0.66;
    const dx2 = x + W / 2 - dw2 - 10;
    InkFill(ctx, Rect(dx2, groundY - dh2, dw2, dh2), id + "doorway", "#241d15", { amp: 1.2, lw: 2.4 });
    // 门洞里透出一线屋内的暖色
    ctx.save();
    ctx.globalAlpha = night ? 0.14 : 0.3;
    ctx.fillStyle = "#8a6f4c";
    ctx.fillRect(dx2 + 4, groundY - dh2 * 0.7, dw2 - 8, dh2 * 0.7);
    ctx.restore();
  } else {
    const dw = Math.min(20, W * 0.2), dh = H * 0.55;
    InkFill(ctx, Rect(x - W * 0.28, groundY - dh, dw, dh), id + "door", "#5c452f", { amp: 1.2, lw: 2.2 });
  }
  const ww = Math.min(17, W * 0.17);
  InkFill(ctx, Rect(x + W * 0.14, groundY - H * 0.66, ww, ww * 0.85), id + "win",
    night ? "#c99b4a" : "#4a3a2a", { amp: 1.2, lw: 2.2 });
  InkLine(ctx, x + W * 0.14, groundY - H * 0.66 + ww * 0.42, x + W * 0.14 + ww, groundY - H * 0.66 + ww * 0.42,
    id + "winBar", { lw: 1.4, color: IN.ink });
  InkLine(ctx, x + W * 0.14 + ww / 2, groundY - H * 0.66, x + W * 0.14 + ww / 2, groundY - H * 0.66 + ww * 0.85,
    id + "winBar2", { lw: 1.4, color: IN.ink });
}

export function DrawDoorframe(ctx, x, groundY, id, { marked = false, carved = false } = {}) {
  const H = 74, W = 40;
  InkFill(ctx, Rect(x - W / 2, groundY - H, 8, H), id + "l", PAL.wood, { amp: 1.1, lw: 2.4, shade: "rgba(0,0,0,0.15)" });
  InkFill(ctx, Rect(x + W / 2 - 8, groundY - H, 8, H), id + "r", PAL.wood, { amp: 1.1, lw: 2.4, shade: "rgba(0,0,0,0.15)" });
  InkFill(ctx, Rect(x - W / 2 - 4, groundY - H - 9, W + 8, 10), id + "t", PAL.woodDark, { amp: 1.1, lw: 2.4 });
  // 木纹
  for (let i = 0; i < 3; i += 1) {
    InkLine(ctx, x - W / 2 + 2, groundY - H + 12 + i * 20, x - W / 2 + 2, groundY - H + 28 + i * 20,
      id + "g" + i, { lw: 0.9, color: "rgba(90,60,35,0.55)", amp: 1.6 });
  }
  // 爹刻的那道线：高度必须跟划线玩法的 markY 对上（1.28m×48ppm≈61px），
  // 否则玩家亲手划的线消失后，永久刻痕落在另一个高度上。
  // **必须等玩家真的划完才出现**（marked）——它以前是无条件画的，于是那一拍
  // 玩家攥着笔去划一条已经在木头上的线，整个交互当场失去意义。
  // 粗细跟玩家划出来的那道对齐（1.8px≈3.7cm），否则划完一瞬间线会突然变胖。
  if (marked) {
    InkLine(ctx, x - W / 2 + 1, groundY - 61, x - W / 2 + 8, groundY - 61, id + "mark1", { lw: 1.8, color: "#f0e0b0", amp: 0.4 });
  }
  if (carved) {
    // 第八章给妹妹刻的：矮一头（1.08m）
    InkLine(ctx, x - W / 2 + 1, groundY - 52, x - W / 2 + 8, groundY - 52, id + "mark2", { lw: 1.8, color: "#fff0c8", amp: 0.4 });
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
  // 台面上原来画着一把"装饰用"的刨子。刨料那一拍现在有真刨子在玩家手里，
  // 台面上再摆一把假的就成了两把——换成墨斗（木匠画线的家伙，也呼应门框刻痕）
  InkFill(ctx, Rect(x + 8, groundY - 32, 11, 6), id + "inkpot", "#6f5636", { amp: 0.7, lw: 1.8 });
  InkLine(ctx, x + 10, groundY - 32, x + 17, groundY - 36, id + "inkline",
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
export function DrawCloth(ctx, x, y, id) {
  InkFill(ctx, [[x - 2, y - 14], [x + 5, y - 10], [x + 9, y + 2], [x + 3, y + 14], [x - 6, y + 10], [x - 8, y - 2]],
    id + "body", "#c9a9a0", { amp: 1.8, lw: 1.8, shade: "rgba(0,0,0,0.14)" });
  // 印花条
  InkLine(ctx, x - 5, y - 4, x + 6, y - 1, id + "st1", { lw: 1.2, color: "rgba(150,80,70,0.6)", amp: 1.6 });
  InkLine(ctx, x - 4, y + 4, x + 5, y + 7, id + "st2", { lw: 1.2, color: "rgba(150,80,70,0.45)", amp: 1.6 });
  // 勾在树杈上的那一角
  InkLine(ctx, x - 2, y - 14, x + 2, y - 20, id + "snag", { lw: 1.4, color: "rgba(90,60,45,0.8)" });
  // 垂下来被风掀起的边
  InkLine(ctx, x + 3, y + 14, x + 10, y + 20, id + "flap", { lw: 1.6, color: "#b8968e", amp: 2.4 });
}

// 石子堆：投掷的"弹药箱"
export function DrawStonePile(ctx, x, groundY, id) {
  for (let i = 0; i < 7; i += 1) {
    const px = x - 14 + (i % 4) * 8 + Hash(id + "x" + i) * 5;
    const py = groundY - 3 - Math.floor(i / 4) * 6 - Hash(id + "y" + i) * 3;
    InkFill(ctx, [[px - 4, py + 3], [px - 2, py - 3], [px + 3, py - 2], [px + 4, py + 3]],
      id + "st" + i, i % 2 ? "#8b857a" : "#7a746a", { amp: 0.5, lw: 1.4, shade: "rgba(0,0,0,0.18)" });
  }
}

// 洞室里的水瓮
export function DrawVat(ctx, x, groundY, id) {
  InkFill(ctx, [[x - 12, groundY], [x - 15, groundY - 18], [x - 10, groundY - 30], [x + 10, groundY - 30],
    [x + 15, groundY - 18], [x + 12, groundY]],
    id + "body", "#6e5b44", { amp: 1.2, lw: 2.2, shade: "rgba(0,0,0,0.26)" });
  // 口沿与水面
  InkLine(ctx, x - 10, groundY - 30, x + 10, groundY - 30, id + "rim", { lw: 2.4, color: IN.ink });
  InkFill(ctx, Rect(x - 8, groundY - 29, 16, 3), id + "water", "#4d6a78", { amp: 0.5, lw: 1 });
}

// 驴车：能推、能跟着走的那片影子。车板 + 两个大轮 + 半车干草
export function DrawCart(ctx, x, groundY, id) {
  // 车板
  InkFill(ctx, Rect(x - 44, groundY - 34, 88, 10), id + "bed", "#7d5c38",
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

// 独轮车：1942 冀中最标志性的农具——独轮居中，两根车把，木架车盘。
// planks: 0/1/2 —— 装了几根木料
export function DrawBarrow(ctx, x, groundY, id, { planks = 0 } = {}) {
  // 独轮
  const wy = groundY - 15;
  ctx.strokeStyle = IN.ink;
  ctx.lineWidth = 3.2;
  ctx.beginPath(); ctx.arc(x, wy, 15, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1.5;
  for (let s = 0; s < 5; s += 1) {
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(s * 0.63) * 13, wy - Math.sin(s * 0.63) * 13);
    ctx.lineTo(x + Math.cos(s * 0.63) * 13, wy + Math.sin(s * 0.63) * 13);
    ctx.stroke();
  }
  // 车架：轮子两侧的木框与车把（把手朝右）
  InkFill(ctx, [[x - 34, groundY - 30], [x + 20, groundY - 33], [x + 52, groundY - 26], [x + 50, groundY - 21], [x - 32, groundY - 25]],
    id + "frame", "#8a6a45", { amp: 1.4, lw: 2.4, shade: "rgba(0,0,0,0.2)" });
  InkLine(ctx, x - 30, groundY - 26, x - 20, groundY - 4, id + "legA", { lw: 3, color: "#6b4d2e" });
  InkLine(ctx, x + 46, groundY - 23, x + 60, groundY - 18, id + "handle", { lw: 3, color: "#6b4d2e" });
  // 装上的木料
  for (let i = 0; i < planks; i += 1) {
    InkFill(ctx, Rect(x - 40, groundY - 40 - i * 8, 84, 8), id + "plank" + i, "#c09a62",
      { amp: 1.2, lw: 2, shade: "rgba(0,0,0,0.18)" });
  }
}

// 蹲在木料上的母鸡：土黄的团身、小红冠——嗜头担当
export function DrawHen(ctx, x, y, id) {
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
}

// 倒塌的柴垛：可翻越（肩高、顶沿有缺口）——扫荡中撞翻的那一堆
export function DrawFallenWood(ctx, x, groundY, id) {
  // 底层散开的柴
  for (let i = 0; i < 6; i += 1) {
    const lx = x - 26 + i * 10 + Sym(id + "l" + i, 0, 4);
    ctx.save();
    ctx.translate(lx, groundY - 5);
    ctx.rotate(Sym(id + "r" + i, 1, 0.5));
    InkFill(ctx, Rect(-16, -4, 32, 7), id + "log" + i, i % 2 ? "#8a6a45" : "#7a5a38",
      { amp: 1, lw: 2 });
    ctx.restore();
  }
  // 斜塌的主堆：一头高一头塌，顶沿一个缺口（可翻越的轮廓语法）
  InkFill(ctx, [
    [x - 30, groundY], [x - 26, groundY - 40], [x - 8, groundY - 52], [x + 2, groundY - 44],
    [x + 10, groundY - 50], [x + 26, groundY - 30], [x + 32, groundY],
  ], id + "pile", "#96703f", { amp: 2.4, lw: 2.6, shade: "rgba(0,0,0,0.22)" });
  // 顶沿磨亮
  InkLine(ctx, x - 10, groundY - 52, x + 4, groundY - 45, id + "worn", { lw: 2.6, color: "rgba(240,225,180,0.85)", amp: 1 });
  // 几根戳出来的柴梢
  for (let i = 0; i < 4; i += 1) {
    InkLine(ctx, x - 18 + i * 11, groundY - 36 - Hash(id + "t" + i) * 12,
      x - 24 + i * 11, groundY - 52 - Hash(id + "t2" + i) * 10, id + "tip" + i,
      { lw: 2, color: "#5c4328" });
  }
}

// 翻越缺口标记：画在可翻越物顶沿上的一小段磨亮痕（统一轮廓语法的记号）
export function DrawVaultNotch(ctx, x, topY, id) {
  InkLine(ctx, x - 9, topY + 1, x + 9, topY - 1, id + "worn", { lw: 3, color: "rgba(240,225,180,0.8)", amp: 1.2 });
  InkFill(ctx, [[x - 4, topY - 1], [x + 1, topY - 5], [x + 5, topY - 1]], id + "chip", "rgba(240,225,180,0.55)", { lw: 0, line: null });
}

// 院墙角的顶针：铜色的小圈，反着一点光——可选探索物
export function DrawThimble(ctx, x, groundY, id) {
  ctx.beginPath();
  ctx.arc(x, groundY - 3, 3.4, 0, Math.PI * 2);
  ctx.fillStyle = "#c8963c";
  ctx.fill();
  ctx.strokeStyle = IN.ink;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, groundY - 3, 1.5, 0, Math.PI * 2);
  ctx.fillStyle = "#5c4328";
  ctx.fill();
  // 一点反光
  ctx.beginPath();
  ctx.arc(x - 1.2, groundY - 4.4, 0.8, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,240,200,0.9)";
  ctx.fill();
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
  // 竖井 + 一架看得清的木梯。
  // 之前梯子只有半透明的一根杆和几道暗横档，玩家在画面上根本认不出"这儿能上下"，
  // 所以改成两根立杆 + 高对比横档 + 井口一圈木沿，远看就是一架梯子。
  InkFill(ctx, Rect(x - 17, topY, 34, botY - topY), id, PAL.tunnelAir, { amp: 1.4, lw: 2.4, line: "#3a2a1a" });
  // 井口木沿：地面上认路的记号
  InkFill(ctx, Rect(x - 21, topY - 5, 42, 7), id + "lip", "#8a6b45", { amp: 0.8, lw: 2 });
  // 两根立杆
  for (const dx of [-12, 12]) {
    InkFill(ctx, Rect(x + dx - 2.6, topY + 2, 5.2, botY - topY - 4), id + "rail" + dx, "#9c7a4c",
      { amp: 0.7, lw: 1.8, shade: "rgba(0,0,0,0.2)" });
  }
  // 横档：亮一档、暗一档，看着有厚度
  for (let y = topY + 13; y < botY - 4; y += 15) {
    InkFill(ctx, Rect(x - 13, y, 26, 5.2), id + "r" + Math.round(y), "#c2a06a",
      { amp: 0.6, lw: 1.6, shade: "rgba(0,0,0,0.26)" });
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
