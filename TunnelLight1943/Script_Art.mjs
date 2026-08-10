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
  // 一整垛同一个金色 = 刚打下来的新草，那是丰年
  hay: "#a8904f", hayWind: "#8f7c45", hayDark: "#7d6a3a",
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
  } else if (kind === "officer") {
    // 大檐帽：圆顶更高更方，帽墙一道深色，帽檐长而硬——士兵那顶软战斗帽
    // 是塌下去的斜面，两者的剪影在 6m 近景下一眼分得开
    InkFill(ctx, [
      [px - r * 1.06, py - r * 1.24], [px - r * 0.92, py - r * 1.86],
      [px + r * 0.62, py - r * 1.92], [px + r * 1.02, py - r * 1.30],
      [px + r * 1.06, py - r * 1.02], [px - r * 1.02, py - r * 0.96],
    ], id + "cap", "#4a4f34", { amp: 1.1 * k, lw: lw * 0.9 });
    InkFill(ctx, [
      [px - r * 1.04, py - r * 1.10], [px + r * 1.06, py - r * 1.14],
      [px + r * 1.06, py - r * 0.96], [px - r * 1.02, py - r * 0.92],
    ], id + "band", "#2f3320", { amp: 0.8 * k, lw: lw * 0.7 });
    InkFill(ctx, [
      [px + r * 0.86, py - r * 1.06], [px + r * 1.92, py - r * 0.94],
      [px + r * 1.88, py - r * 0.66], [px + r * 0.86, py - r * 0.80],
    ], id + "visor", "#232616", { amp: 0.7 * k, lw: lw * 0.8 });
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
    // 烧过的土坯房：**土坯不燃，火只吃木头和草**——所以四堵墙基本还立着、
    // 屋顶整个没了。老版画的"一堵墙立着其余塌成瓦砾"是砖石建筑的垮法。
    // 泥平顶（囤顶）没有三角尖山墙，失去屋顶保护后墙头被雨啃成圆钝的波浪边。
    const top = groundY - H * 0.72;
    const crest = RaggedTop(x - W / 2, x + W / 2, top, id + "burnTop", { sag: 7, n: 11 });
    InkFill(ctx, [...crest, [x + W / 2, groundY], [x - W / 2, groundY]],
      id, "#6b6154", { amp: 2.2, lw: 2.4, shade: "rgba(0,0,0,0.22)" });
    WeatherAdobe(ctx, x - W / 2, top, W, groundY - top, id + "bw",
      { course: 12, gullies: 7, cracks: 4, patches: 1, seam: 0.20 });
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

  // ⑥.2 背光的山墙面。太阳在西（SUN.dx=+0.85），东头那道山墙整片在阴影里——
  // **这是全画面唯一的大块暗部**。没有它，一排土房就是一排贴在天上的浅色卡片：
  // 照片里的村子之所以"有分量"，靠的就是这种整面的阴影，不是细节多。
  {
    const sw2 = Math.min(16, W * 0.09);
    ctx.save();
    const side = ctx.createLinearGradient(x + W / 2 - sw2, 0, x + W / 2, 0);
    side.addColorStop(0, "rgba(44,33,21,0.10)");
    side.addColorStop(1, "rgba(44,33,21,0.52)");
    ctx.fillStyle = side;
    ctx.fillRect(x + W / 2 - sw2, groundY - H, sw2, H);
    ctx.restore();
    InkLine(ctx, x + W / 2 - sw2, groundY - H + 2, x + W / 2 - sw2 + Sym(id + "sd", 0, 2), groundY,
      id + "sideEdge", { lw: 1.4, color: "rgba(38,28,18,0.4)", amp: 1.2 });
  }

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
  // 屋顶上放着的碌碡：雨后要拿它把泥重新碾实，冀中平顶房的标配
  {
    const lx = x + W * 0.22;
    InkFill(ctx, Rect(lx - 8, eaveY - rh - 5, 16, 6), id + "lulu", "#6b6252", { amp: 1.2, lw: 1.6 });
    InkLine(ctx, lx - 10, eaveY - rh - 5, lx + 10, eaveY - rh - 5, id + "luluF",
      { lw: 1.4, color: "#5a4a33", amp: 0.8 });
  }
  // 右后角塌一块：屋面凹进去，露出秫秸把的断头和一个黑洞
  {
    const bx = x + W * 0.30;
    InkFill(ctx, [[bx, eaveY - rh * 0.9], [bx + 16, eaveY - rh * 0.55],
      [bx + 14, eaveY - 1], [bx - 2, eaveY - 2]], id + "cave", "#3a3226", { amp: 1.8, lw: 1.6 });
    for (let i = 0; i < 5; i += 1) {
      ctx.save();
      ctx.fillStyle = PAL.stalk;
      ctx.beginPath();
      ctx.ellipse(bx + 3 + i * 3, eaveY - rh * 0.4 + Sym(id + "st", i, 3), 1.6, 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  // 檐口椽头：树棍不是方料——椭圆截面、间距不匀、缺两根、一根只剩朽茬
  for (let i = 0, jx = x - rw / 2 + 12; jx < x + rw / 2 - 8; i += 1) {
    if (Rnd(id + "rmiss", i) > 0.86) { jx += 26; continue; }
    const rr = 2.2 + Rnd(id + "rr", i) * 2.4;
    const rot = Rnd(id + "rot", i) > 0.9;
    ctx.save();
    ctx.fillStyle = rot ? "#57503f" : (i % 2 ? "#3a2c1b" : "#463521");
    ctx.strokeStyle = IN.ink;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(jx, eaveY + 3 + Sym(id + "rk", i, 1.4), rr, rr * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    jx += 22 + Rnd(id + "rgap", i) * 12;
  }
  // 顶上长的草：泥顶年年长草，没人去薅
  for (let i = 0; i < 6; i += 1) {
    const wx = x - W * 0.36 + Rnd(id + "wd", i) * W * 0.74;
    const wy = eaveY - rh * (0.4 + Rnd(id + "wd2", i) * 0.4);
    for (let b = 0; b < 3; b += 1) {
      InkLine(ctx, wx, wy, wx + (b - 1) * 3, wy - 5 - Rnd(id + "wd3", i * 3 + b) * 5,
        id + "weed" + i + b, { lw: 1, color: night ? "#333c31" : "#5d6440", amp: 1.1 });
    }
  }
  // 烟道：穿屋面露出一截泥抹小墩，扣半截破罐挡雨，出口熏一片黑
  {
    const cx2 = x - W * 0.30;
    InkFill(ctx, Rect(cx2 - 5, eaveY - rh - 13, 10, 13), id + "flue", "#6e6047", { amp: 1.4, lw: 1.6 });
    InkFill(ctx, [[cx2 - 7, eaveY - rh - 13], [cx2 + 7, eaveY - rh - 13],
      [cx2 + 5, eaveY - rh - 18], [cx2 - 5, eaveY - rh - 18]], id + "crock", "#4a3f33", { amp: 1.2, lw: 1.4 });
    ctx.save();
    ctx.globalAlpha = 0.30;
    ctx.fillStyle = "#2b241c";
    ctx.beginPath();
    ctx.ellipse(cx2 + 4, eaveY - rh - 10, 11, 5, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ⑨ 门：**按米写死**，不跟着 H 缩放（房子一矮门就压成一米五的洞）
  const SILL = 7;                       // 门槛 0.15m：土屋的门下必有这一条
  if (door) {
    // 可进入的家：门洞敞着（人从这儿进去，立面淡出让位给屋里）
    const dw2 = 41, dh2 = 84;           // 0.85m × 1.75m，成年人进门要低头
    const dx2 = x + W / 2 - dw2 - 10;
    InkFill(ctx, Rect(dx2, groundY - dh2, dw2, dh2), id + "doorway", "#1c1712", { amp: 1.6, lw: 2.4 });
    ctx.save();
    ctx.globalAlpha = night ? 0.12 : 0.20;
    ctx.fillStyle = "#8a6f4c";
    ctx.fillRect(dx2 + 4, groundY - dh2 * 0.62, dw2 - 8, dh2 * 0.62);
    ctx.restore();
    InkFill(ctx, Rect(dx2 - 3, groundY - SILL, dw2 + 6, SILL), id + "sill", "#635a4b", { amp: 1.2, lw: 1.6 });
  } else {
    // 邻家：3~5 块厚板拼的板门，板缝开裂能透光，下沿泡烂发毛，不用合页
    const dw = 29, dh = 82;
    const dx3 = x - W * 0.28;
    InkFill(ctx, Rect(dx3, groundY - dh, dw, dh), id + "doorHole", "#1c1712", { amp: 1.4, lw: 2.0 });
    InkFill(ctx, [[dx3 + 1, groundY - dh + 1], [dx3 + dw - 1, groundY - dh + 2],
      [dx3 + dw - 2, groundY - 3], [dx3 + 2, groundY - 2]], id + "door", PAL.woodOld,
    { amp: 1.6, lw: 2.0, shade: "rgba(0,0,0,0.24)" });
    for (let i = 1; i < 4; i += 1) {
      InkLine(ctx, dx3 + (dw * i) / 4, groundY - dh + 3, dx3 + (dw * i) / 4 + Sym(id + "pk", i, 1.2), groundY - 4,
        id + "plank" + i, { lw: 1.3, color: "rgba(30,24,17,0.55)", amp: 1.0 });
    }
    // 下沿泡烂：贴地参差朽茬，更深发黑
    InkFill(ctx, [[dx3 + 2, groundY - 8], [dx3 + dw - 2, groundY - 6],
      [dx3 + dw - 2, groundY - 2], [dx3 + 2, groundY - 2]], id + "rotBase", PAL.woodOldDark,
    { amp: 2.2, lw: 1.2 });
    InkFill(ctx, Rect(dx3 - 3, groundY - 5, dw + 6, 5), id + "sill2", "#635a4b", { amp: 1.0, lw: 1.4 });
  }

  // ⑩ 窗：木棂糊纸，按米写死，下沿在炕沿高（坐在炕上正好平视出去）
  const ww = 50, wh = 41, wy0 = groundY - 41 - wh;
  const wx0 = x + W * 0.06;
  // 窗洞的厚度：外围一圈抹泥凹口 + 上沿一道投影
  InkFill(ctx, Rect(wx0 - 2, wy0 - 2, ww + 4, wh + 4), id + "winFrame", "#5c4a30", { amp: 1.4, lw: 1.6 });
  InkFill(ctx, Rect(wx0, wy0, ww, wh), id + "winPaper",
    night ? "#a87f37" : "#8d8368", { amp: 0.9, lw: 0, line: null });
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#2b2118";
  ctx.fillRect(wx0, wy0, ww, 4);
  ctx.restore();
  // 直棂窗：只有竖棂，间距粗细都不匀（精确等分是像样人家）
  {
    let mx = wx0 + 5;
    let k = 0;
    while (mx < wx0 + ww - 3) {
      InkLine(ctx, mx, wy0 + 1, mx + Sym(id + "mv", k, 1.0), wy0 + wh - 1,
        id + "mull" + k, { lw: 0.9 + Rnd(id + "mw", k) * 0.5, color: "#5c4a30", amp: 0.7 });
      mx += 7 + Rnd(id + "mg", k) * 8;
      k += 1;
    }
    InkLine(ctx, wx0 + 1, wy0 + wh * 0.55, wx0 + ww - 1, wy0 + wh * 0.55 + 1,
      id + "mullH", { lw: 1.2, color: "#4a3a25", amp: 0.7 });
  }
  // 破洞：撕裂形，一角卷起来的纸
  for (let i = 0; i < 2; i += 1) {
    const hx2 = wx0 + 5 + Rnd(id + "tc", i) * (ww - 20);
    const hy2 = wy0 + 4 + Rnd(id + "tr", i) * (wh - 16);
    const hs = 7 + Rnd(id + "ts", i) * 6;
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
  // 下轴：**跳出臼窝**的那一头。松着的时候画成脱开、底下露出空臼窝，
  // "门为什么晃"就靠这一处说清楚，不用一行字
  if (loose) {
    InkFill(ctx, Rect(x0 - 6, y0 + H - 8, 7, 9), id + "pivB", "#6b4a2c", { amp: 0.7, lw: 1.7 });
    // 空着的臼窝（画在门扇脚边的地上）
    InkFill(ctx, [[x0 - 16, y0 + H + 3], [x0 - 4, y0 + H + 1], [x0 - 2, y0 + H + 7], [x0 - 18, y0 + H + 8]],
      id + "socket", "#4a3626", { amp: 1.0, lw: 1.8 });
  } else {
    InkFill(ctx, Rect(x0 - 5, y0 + H - 6, 6, 7), id + "pivB2", "#6b4a2c", { amp: 0.6, lw: 1.6 });
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

// 一团树叶：不规则多边形。起伏要**浅**——隔一个点就往里收 1/4 的话，
// 画出来是一片枫叶标本，不是一簇叶子（第一版就栽在这儿）
function LeafClump(ctx, cx, cy, r, id, fill, { line = null, lw = 0, squash = 0.82 } = {}) {
  const n = 16;
  const pts = [];
  for (let a = 0; a < n; a += 1) {
    const ang = (a / n) * Math.PI * 2;
    const rr = r * (a % 3 === 0 ? 0.9 : 1.0) * (0.9 + Rnd(id, a) * 0.16);
    pts.push([cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr * squash]);
  }
  InkFill(ctx, pts, id + "f", fill, { amp: 1.6, lw, line });
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
  if (stripped) {
    const cut = groundY - 91;                       // 1.9m：踮脚够得着的高度
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x - trunkW * 1.1, groundY - 9);
    ctx.lineTo(x - trunkW * 0.85, cut);
    ctx.lineTo(x + trunkW * 0.85, cut);
    ctx.lineTo(x + trunkW * 1.1, groundY - 9);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = night ? "#6b6352" : "#a89678";   // 裸干：比树皮亮两档、略发潮
    ctx.fillRect(x - trunkW * 1.2, cut, trunkW * 2.4, 92);
    ctx.restore();
    // 剥口不是齐的，是啃剥出来的锯齿边
    for (let i = 0; i < 7; i += 1) {
      const jx = x - trunkW + (i / 6) * trunkW * 2;
      InkLine(ctx, jx, cut + Sym(id + "pk", i, 5), jx + trunkW * 0.34, cut + Sym(id + "pk2", i, 5),
        id + "peel" + i, { lw: 1.6, color: barkDark, amp: 1.4 });
    }
    // 裸干上的刀痕斧印
    for (let i = 0; i < 4; i += 1) {
      const hy = groundY - 20 - Rnd(id + "hk", i) * 62;
      InkLine(ctx, x - trunkW * 0.7, hy, x + trunkW * 0.6, hy + Sym(id + "hk2", i, 3),
        id + "hack" + i, { lw: 1.2, color: "rgba(70,56,38,0.55)", amp: 0.8 });
    }
  }
  // 砍平的枝桩：0.44H 以下一根活枝都不留，树成了"剃头树"
  for (let i = 0; i < 4; i += 1) {
    const sy = groundY - 24 - i * (H * 0.09) - Rnd(id + "sb", i) * 8;
    const dir = i % 2 ? 1 : -1;
    ctx.save();
    ctx.fillStyle = barkDark;
    ctx.strokeStyle = IN.ink;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(x + dir * trunkW * 0.95, sy, 2.6, 3.4, dir * 0.4, 0, Math.PI * 2);
    ctx.fill();
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
    const t = (i + 0.5) / nB;
    const ang = -Math.PI / 2 + (t - 0.5) * 1.5 + Sym(id + "ba", i, 0.16);
    const len = H * (0.34 + Rnd(id + "bl", i) * 0.14);
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
  const cr = (big ? 31 : 21);
  // 冠底：先把整顶铺成一团暗的，各枝的叶团才连得成一顶树冠；
  // 少了这一层，画面上就是几片飘在空中互不相干的绿斑
  let cx0 = 0, cy0 = 0, minX = 1e9, maxX = -1e9;
  for (const [tx] of tips) { minX = Math.min(minX, tx); maxX = Math.max(maxX, tx); }
  for (const [tx, ty] of tips) { cx0 += tx; cy0 += ty; }
  cx0 /= tips.length; cy0 /= tips.length;
  // 冠底比枝展略小：枝头那几团要能顶出轮廓去，树冠才不是一颗土豆
  const crownR = (maxX - minX) * 0.5 + cr * 0.52;
  LeafClump(ctx, cx0, cy0 - cr * 0.10, crownR, id + "mass", backC,
    { line: IN.inkSoft, lw: 2.0, squash: 0.76 });

  // 枝头的叶团：往冠心收一点（收得太散就散架），后层压暗、前层提亮
  const back = [], front = [];
  for (let i = 0; i < tips.length; i += 1) {
    const [tx0, ty0] = tips[i];
    const tx = tx0 + (cx0 - tx0) * 0.12;
    const ty = ty0 + (cy0 - ty0) * 0.12;
    const r = cr * (0.78 + Rnd(id + "cr", i) * 0.30);
    back.push([tx + Sym(id + "cx", i, r * 0.3), ty + r * 0.26 + Sym(id + "cy", i, r * 0.18), r * 0.86]);
    front.push([tx + Sym(id + "dx", i, r * 0.28), ty - r * 0.22 + Sym(id + "dy", i, r * 0.16), r * 0.80]);
  }
  for (let i = 0; i < back.length; i += 1) LeafClump(ctx, back[i][0], back[i][1], back[i][2], id + "kb" + i, backC);
  for (let i = 0; i < front.length; i += 1) {
    LeafClump(ctx, front[i][0], front[i][1], front[i][2], id + "kf" + i, i % 2 ? base : litC,
      { line: "rgba(43,31,22,0.45)", lw: 1.4 });
  }
  // 受光的一侧：左上角一道亮边
  for (let i = 0; i < front.length; i += 2) {
    const [fx, fy, fr] = front[i];
    LeafClump(ctx, fx - fr * 0.26, fy - fr * 0.30, fr * 0.46, id + "hl" + i, litC);
  }
  // 冠里透出去的两根枝梢：全是叶子就成了一坨绿
  for (let i = 0; i < tips.length; i += 2) {
    const [tx, ty] = tips[i];
    InkLine(ctx, tx, ty, tx + Sym(id + "tw", i, cr * 0.6), ty - cr * (0.6 + Rnd(id + "tw2", i) * 0.5),
      id + "twig" + i, { lw: 1.3, color: barkDark, amp: 1.6 });
  }
  Speckle(ctx, cx0 - crownR, cy0 - crownR * 0.8, crownR * 2, crownR * 1.5, id + "leaf",
    { count: big ? 46 : 30, alpha: 0.12, size: 2.2, color: "#243018" });
}

// 柴草垛。春天的垛是**被扒剩下的**：底下一层层薅走喂牲口引火，垛身在离地
// 半尺处往里收，形成掏空外挑；顶上苫一层压得更紧的草、交叉两根杆、杆头吊石头。
// 颜色分两面——迎风面被日晒风吹褪成灰白，背风面才留一点黄。一整垛同一个金色
// 是刚打下来的新草，那是丰年（2026-08-10 用户退回："一点都不像敌后照片"）。
// raided: 朝路那面被一层层扒出台阶状的大豁口、垛顶塌成坑、脚下散一圈碎秸。
export function DrawHaystack(ctx, x, groundY, w, id, { night = false, raided = false } = {}) {
  const W = w, H = w * (raided ? 0.78 : 1.05);
  const lee = night ? "#6f6238" : PAL.hay;        // 背风面
  const wind = night ? "#5e5430" : PAL.hayWind;   // 迎风面
  const UNDER = 15;                               // 掏空的高度
  // 垛身：底部往里收（掏空外挑），顶上塌一个坑
  const body = [
    [x - W / 2 + 5, groundY], [x - W / 2 + 9, groundY - UNDER],
    [x - W * 0.44, groundY - H * 0.46], [x - W * 0.30, groundY - H * 0.86],
    [x - W * 0.04, groundY - H], [x + W * 0.16, groundY - H * (raided ? 0.72 : 0.94)],
    [x + W * 0.36, groundY - H * 0.60], [x + W / 2 - 8, groundY - UNDER],
    [x + W / 2 - 4, groundY],
  ];
  InkFill(ctx, body, id, lee, { amp: 2.6, lw: 2.5, shade: "rgba(60,42,16,0.22)" });
  // 迎风面（左半）压成灰白：一垛草不许是一个颜色
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(body[0][0], body[0][1]);
  for (let i = 1; i < body.length; i += 1) ctx.lineTo(body[i][0], body[i][1]);
  ctx.closePath();
  ctx.clip();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = wind;
  ctx.fillRect(x - W / 2, groundY - H - 4, W * 0.52, H + 8);
  // 贴地那层泡过雨，发黑发霉
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = "#4e4028";
  ctx.fillRect(x - W / 2, groundY - 9, W, 10);
  if (raided) {
    // 扒出来的台阶状大豁口
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = "#5c4e2e";
    for (let i = 0; i < 3; i += 1) {
      ctx.fillRect(x + W * (0.02 + i * 0.10), groundY - H * (0.62 - i * 0.16), W * 0.3, H * 0.18);
    }
  }
  ctx.restore();
  // 草秆：跟着垛面倒，长短拉开（左侧向左倒、右侧向右倒）
  ctx.save();
  ctx.globalAlpha = 0.44;
  ctx.strokeStyle = night ? "#5c4f2c" : PAL.hayDark;
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 22; i += 1) {
    const px = x - W * 0.44 + Rnd(id, i) * W * 0.88;
    const py = groundY - UNDER - Rnd(id, i + 30) * (H - UNDER) * 0.86;
    const dir = px < x ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + dir * (2 + Rnd(id, i + 60) * 6), py - 5 - Rnd(id, i + 90) * 13);
    ctx.stroke();
  }
  ctx.restore();
  // 苫顶：压得更紧的一层草（暗一档）+ 交叉两根杆 + 杆头吊石头
  InkFill(ctx, [[x - W * 0.30, groundY - H * 0.84], [x - W * 0.04, groundY - H - 2],
    [x + W * 0.18, groundY - H * (raided ? 0.70 : 0.92)], [x + W * 0.10, groundY - H * 0.70],
    [x - W * 0.20, groundY - H * 0.72]], id + "cap", night ? "#4e4429" : "#7d6a3a",
  { amp: 2.2, lw: 1.8 });
  InkLine(ctx, x - W * 0.26, groundY - H * 0.66, x + W * 0.10, groundY - H - 6, id + "poleA",
    { lw: 2.2, color: "#5c4a30", amp: 1.2 });
  InkLine(ctx, x + W * 0.16, groundY - H * 0.62, x - W * 0.14, groundY - H - 4, id + "poleB",
    { lw: 2.0, color: "#6b5433", amp: 1.2 });
  InkFill(ctx, Rect(x - W * 0.18, groundY - H * 0.62, 7, 6), id + "wt", "#6b6252", { amp: 1.1, lw: 1.4 });
  // 脚下散的碎秸与麦糠
  for (let i = 0; i < (raided ? 9 : 5); i += 1) {
    const sx = x - W * 0.6 + Rnd(id + "sc", i) * W * 1.2;
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
export function DrawWell(ctx, x, groundY, id, { night = false, broken = false, crank = true } = {}) {
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
  const HUB = groundY - 69;

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

  // 摇把：轴销 + 一段柄臂 + 一节握手，钉在右端面上。摇辘轳那一拍由 World
  // 换上会转的那只，这里就不画了（两只摇把会叉在同一根轴上）
  if (crank) {
    InkLine(ctx, x + DL + 2, HUB, x + DL + 14, HUB + 7, id + "arm", { lw: 5.2, color: IN.ink, amp: 0.2 });
    InkLine(ctx, x + DL + 2, HUB, x + DL + 14, HUB + 7, id + "arm2", { lw: 3.2, color: woodDark, amp: 0.2 });
    InkLine(ctx, x + DL + 14, HUB + 2, x + DL + 14, HUB + 13, id + "grip0", { lw: 6.4, color: IN.ink, amp: 0.2 });
    InkLine(ctx, x + DL + 14, HUB + 2, x + DL + 14, HUB + 13, id + "grip", { lw: 4.2, color: wood, amp: 0.2 });
    ctx.beginPath();
    ctx.arc(x + DL + 2, HUB, 2.6, 0, Math.PI * 2);
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
  } else {
    InkLine(ctx, x - 2, HUB + 6, x - 2, groundY - CURB + 1, id + "rope",
      { lw: 1.7, color: "#6f5c3d", amp: 1 });
  }
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
export function DrawYardWall(ctx, x, groundY, w, id, { gate = true } = {}) {
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
    // 墙头苫的谷草：锯齿轮廓 + 挑出来的单根草秆，中间断一处露出光墙头
    for (let sx = x0; sx < x1; sx += 5) {
      if (sx > (x0 + x1) / 2 - 8 && sx < (x0 + x1) / 2 + 8) continue;
      const ch = 5 + Rnd(id + "cap" + x0, sx) * 7;
      InkFill(ctx, [[sx, groundY - H + 2], [sx + 6, groundY - H + 2],
        [sx + 5, groundY - H - ch], [sx + 1, groundY - H - ch * 0.8]],
      id + "cp" + x0 + sx, "#7d6a3a", { amp: 1.4, lw: 1.2 });
      if (Rnd(id + "cw" + x0, sx) > 0.6) {
        InkLine(ctx, sx + 3, groundY - H - ch, sx + 3 + Sym(id + "cs" + x0, sx, 5),
          groundY - H - ch - 4 - Rnd(id + "cl" + x0, sx) * 7, id + "cst" + x0 + sx,
          { lw: 0.9, color: "#8a7a4e", amp: 1.0 });
      }
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

// 晾衣绳：两根木杆绷一道绳，挂着打补丁的粗布衫和一条裤——风里鼓着
// 接绳的结（逐帧重画）。
//
// **不能用 THREE.Line 画**：`linewidth` 在绝大多数平台上被忽略，绳子永远只有
// 一个像素——贴在辘轳那堆木色上根本看不见，"穿过去"这个动作等于没演。
// 所以整套结走 canvas：真笔画、真粗细、真墨线包边。
//
// 压叠关系是这一拍的题眼：圈的**远侧**画在麻绳之前、**近侧**画在麻绳之后，
// 于是绳是"从圈里穿过去"的，不是"从圈上划过去"的。少了这一层，玩家看见的
// 只是两条线交叉。
//
// spec 里的坐标都是**相对挂点的米数**（y 向上），几何一律由 Core 算好传进来
// （判定与作画共用一份，同石笔/刨子那条规矩）。
export function DrawKnot(ctx, ox, oy, ppm, spec) {
  const P = (q) => [ox + q[0] * ppm, oy - q[1] * ppm];   // 米→画布（y 翻转）
  const HEMP = "#c69a5c", HEMP_D = "#a97f45", NEWR = "#dcb877", INK = "rgba(46,33,20,0.85)";
  const w = Math.max(2, ppm * 0.030);      // 绳粗 ≈3cm
  const stroke = (pts, color, width, dash) => {
    if (pts.length < 2) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    const a = P(pts[0]);
    ctx.moveTo(a[0], a[1]);
    for (let i = 1; i < pts.length; i += 1) { const b = P(pts[i]); ctx.lineTo(b[0], b[1]); }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.restore();
  };
  // 墨线包边＋绳身：先粗一圈深色，再压一道本色，麻绳就有了体积
  const rope = (pts, color, k = 1) => {
    stroke(pts, INK, w * k + Math.max(1.6, ppm * 0.010));
    stroke(pts, color, w * k);
  };
  // ① 井绳断头：从辘轳上垂下来
  rope(spec.stand, HEMP_D, 1.05);
  // ② 圈的远侧（画在麻绳之前）
  rope(spec.eyeBack, HEMP, 1.0);
  // ③ 还没走到的那截路：细虚线，只是"绳还得往哪儿去"的暗示，拉到底就没了
  if (spec.rest && spec.restAlpha > 0.01) {
    ctx.save();
    ctx.globalAlpha = spec.restAlpha;
    stroke(spec.rest, "rgba(120,102,74,0.9)", Math.max(1.4, ppm * 0.008), [ppm * 0.035, ppm * 0.03]);
    ctx.restore();
  }
  // ④ 麻绳（新绳比旧井绳亮一档，两根分得开）
  rope(spec.rope, NEWR, 1.0);
  // ⑤ 圈的近侧（压住麻绳）——"穿过去"就是靠这一笔成立的
  rope(spec.eyeFront, HEMP, 1.0);
  // ⑥ 绳头：攥住的时候鼓一点，让玩家知道手上有东西
  const tp = P(spec.tip);
  const tr = w * (spec.grab ? 1.05 : 0.85);
  ctx.beginPath();
  ctx.arc(tp[0], tp[1], tr, 0, Math.PI * 2);
  ctx.fillStyle = NEWR;
  ctx.fill();
  ctx.lineWidth = Math.max(1.6, ppm * 0.009);
  ctx.strokeStyle = INK;
  ctx.stroke();
  // 散开的麻头：绳头总是毛的
  for (let i = 0; i < 3; i += 1) {
    const a = -0.5 + i * 0.5;
    ctx.beginPath();
    ctx.moveTo(tp[0], tp[1]);
    ctx.lineTo(tp[0] + Math.cos(a) * tr * 2.1, tp[1] + Math.sin(a) * tr * 2.1);
    ctx.strokeStyle = "rgba(169,127,69,0.75)";
    ctx.lineWidth = Math.max(1, ppm * 0.005);
    ctx.stroke();
  }
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
export function DrawVat(ctx, x, groundY, id) {
  InkFill(ctx, [[x - 12, groundY], [x - 15, groundY - 18], [x - 10, groundY - 30], [x + 10, groundY - 30],
    [x + 15, groundY - 18], [x + 12, groundY]],
    id + "body", "#6e5b44", { amp: 1.2, lw: 2.2, shade: "rgba(0,0,0,0.26)" });
  // 口沿与水面
  InkLine(ctx, x - 10, groundY - 30, x + 10, groundY - 30, id + "rim", { lw: 2.4, color: IN.ink });
  InkFill(ctx, Rect(x - 8, groundY - 29, 16, 3), id + "water", "#4d6a78", { amp: 0.5, lw: 1 });
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
  // 草苫搭在堆顶一角
  InkFill(ctx, [[x - 26, groundY - 20], [x - 4, groundY - 30], [x + 20, groundY - 26], [x + 8, groundY - 17]],
    id + "mat", "#a08a52", { amp: 1.8, lw: 1.6, shade: "rgba(0,0,0,0.14)" });
  for (let i = 0; i < 4; i += 1) {
    InkLine(ctx, x - 20 + i * 11, groundY - 21 - i * 2, x - 14 + i * 11, groundY - 27 - i * 1.5,
      id + "straw" + i, { lw: 1.1, color: "rgba(70,55,28,0.6)" });
  }
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

// 空牲口棚。柱子要**真的歪**（注释说歪、几何是直的等于没歪），一根还接过一段；
// 草顶中段压塌、开一个洞、檐口垂下乱草；食槽是掏空的整根圆木，槽沿留着
// 牲口啃出来的月牙凹痕——**那道凹痕比槽里有草更能说明"原来有牲口"**。
export function DrawShed(ctx, x, groundY, id) {
  const W = 210, H = 105;
  // 棚下的暗腔：全画面最黑的一块之一
  InkFill(ctx, [[x - W / 2 + 12, groundY], [x - W / 2 + 16, groundY - H * 0.72],
    [x + W / 2 - 10, groundY - H * 0.62], [x + W / 2 - 6, groundY]],
  id + "void", "#241d16", { amp: 2.0, lw: 2.0 });
  // 两根歪柱：左柱上端往右挪、柱脚塞楔石；右柱 2/3 高处接过一段，缠三道草绳
  InkLine(ctx, x - W / 2 + 10, groundY, x - W / 2 + 19, groundY - H * 0.74, id + "postL",
    { lw: 5, color: PAL.woodOld, amp: 1.6 });
  InkFill(ctx, Rect(x - W / 2 + 6, groundY - 5, 10, 5), id + "wedge", "#6b6252", { amp: 1.2, lw: 1.4 });
  InkLine(ctx, x + W / 2 - 12, groundY, x + W / 2 - 14, groundY - H * 0.42, id + "postRa",
    { lw: 5, color: PAL.woodOldDark, amp: 1.4 });
  InkLine(ctx, x + W / 2 - 14, groundY - H * 0.40, x + W / 2 - 9, groundY - H * 0.66, id + "postRb",
    { lw: 4.4, color: PAL.woodOld, amp: 1.4 });
  for (let i = 0; i < 3; i += 1) {
    InkLine(ctx, x + W / 2 - 18, groundY - H * 0.40 - i * 3, x + W / 2 - 8, groundY - H * 0.41 - i * 3,
      id + "lash" + i, { lw: 1.4, color: "#6d5a3a", amp: 0.6 });
  }
  // 草顶：中段压塌，屋面下沿凹进去
  const roof = [];
  for (let i = 0; i <= 8; i += 1) {
    const t = i / 8;
    roof.push([x - W / 2 - 6 + (W + 12) * t,
      groundY - H - 6 + Math.sin(t * Math.PI) * 10 + t * 8 + Sym(id + "rf", i, 2)]);
  }
  InkFill(ctx, roof.concat([[x + W / 2 - 6, groundY - H * 0.60], [x - W / 2 + 14, groundY - H * 0.70]]),
    id + "roof", "#7d6a3a", { amp: 2.4, lw: 2.4, shade: "rgba(50,38,18,0.24)" });
  // 顶上开的洞：里头是天光
  InkFill(ctx, [[x + 6, groundY - H + 6], [x + 24, groundY - H + 4], [x + 22, groundY - H + 16],
    [x + 4, groundY - H + 17]], id + "hole", "#b8b0a0", { amp: 1.8, lw: 1.6 });
  // 檐口垂下的乱草
  for (let i = 0; i < 6; i += 1) {
    const gx = x - W / 2 + 12 + Rnd(id + "gx", i) * (W - 24);
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

// 贴告示的半截土墙：征粮征夫的告示一层压一层，新的盖着旧的
export function DrawNoticeWall(ctx, x, groundY, w, id) {
  DrawWall(ctx, x, groundY, w, 90, id);
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
  // 看见「征夫告示」四个大字和暗红印章，才谈得上想不想停下看）。
  // 竖排在纸右沿，字号顶着纸宽；左下一点暗红当印
  {
    const p = posters[1];
    ctx.save();
    ctx.fillStyle = "rgba(43, 31, 22, 0.88)";
    ctx.font = "600 7px 'Noto Serif SC', serif";
    ctx.textAlign = "center";
    const tx = p.px + p.pw / 2 - 5.5;
    for (let k = 0; k < 4; k += 1) ctx.fillText("征夫告示"[k], tx, p.py + 9.5 + k * 7.2);
    ctx.fillStyle = "rgba(146, 44, 32, 0.55)";
    ctx.fillRect(p.px - p.pw / 2 + 3.5, p.py + p.ph - 8.5, 5, 5);
    ctx.restore();
  }
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

  CardBase(ctx, W, H, "#dcc79e");
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
function ChalkInHand(ctx, tx, ty, S, lean, skin, sleeve, cuff) {
  ctx.save();
  ctx.translate(tx, ty);
  ctx.rotate(lean);
  // 小臂先画（压在最底下）：一截出画的胳膊 + 袖口。
  // 手是同一双（都是庄稼人的手），认得出是谁靠这身短褂的颜色——
  // 第一章那只袖子是爹的土褐，第八章是柱子自己的那身。
  InkFill(ctx, [
    [-330 * S, -52 * S], [-820 * S, 10 * S], [-820 * S, 190 * S], [-336 * S, 88 * S],
  ], "cardArm", sleeve, { amp: 4 * S, lw: 6.5 * S, shade: "rgba(0,0,0,0.20)" });
  InkFill(ctx, [
    [-260 * S, -62 * S], [-340 * S, -46 * S], [-348 * S, 86 * S], [-266 * S, 92 * S],
  ], "cardCuff", cuff, { amp: 3.4 * S, lw: 6 * S, shade: "rgba(0,0,0,0.18)" });
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

  CardBase(ctx, W, H, "#c9b48c");

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

  // 被量的那个人：柱子背靠木头站直了，**头顶正好顶在这条线上**——
  // 这道线量的是什么，画面自己说，不用旁白讲。侧影，不抢前景那只手。
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

  ChalkInHand(ctx, tipX, tipY, S, lean, PAL.skin,
    view.selfMark ? PAL.zhuzi : "#6d5340", view.selfMark ? PAL.zhuziDark : "#7b6448");

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
