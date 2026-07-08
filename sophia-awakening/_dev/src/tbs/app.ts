// 《烽火棋局》白盒装配层: Canvas hex 渲染 + 点击交互 + 行动面板。路由 #tbs。
import {
  MAP_W, MAP_H, UDEFS, createGame, tileAt, unitAt, reachable, moveUnit, attack,
  infiltrate, buildGov, recruit, endTurn, hexDist,
  type GState, type Unit, type UKind
} from "./core";

const SZ = 34; // hex 尺寸
const SQ3 = Math.sqrt(3);
const hexX = (q: number, r: number): number => SZ * SQ3 * (q + r / 2) + 60;
const hexY = (r: number): number => SZ * 1.5 * r + 60;

export function bootstrapTbs(root: HTMLElement): void {
  injectCss();
  let s: GState = createGame();
  let hover: { q: number; r: number } | null = null;
  let reach: Map<number, number> = new Map();

  root.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "tb";
  wrap.innerHTML = `
    <div class="tb-top">
      <span class="tb-title">烽火棋局 · 白盒</span>
      <span id="tbRes"></span>
      <span id="tbAlert"></span>
      <button class="tb-end" id="tbEnd">结束回合 ▶</button>
    </div>
    <canvas id="tbCv"></canvas>
    <div class="tb-side">
      <div class="tb-info" id="tbInfo">点击单位开始。目标:根据地≥15格 或 拔掉3座据点(40回合内)。</div>
      <div class="tb-acts" id="tbActs"></div>
      <div class="tb-recruit">
        <div class="tb-h">总部整编</div>
        <div id="tbRec"></div>
      </div>
      <div class="tb-log" id="tbLog"></div>
    </div>
    <div class="tb-over" id="tbOver" style="display:none"></div>
  `;
  root.appendChild(wrap);
  const $ = <T extends HTMLElement = HTMLElement>(x: string): T => wrap.querySelector<T>(x)!;
  const cv = $<HTMLCanvasElement>("#tbCv");
  const ctx = cv.getContext("2d")!;

  function resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = (hexX(MAP_W, MAP_H) + 60) * dpr;
    cv.height = (hexY(MAP_H) + 40) * dpr;
    cv.style.width = `${hexX(MAP_W, MAP_H) + 60}px`;
    cv.style.height = `${hexY(MAP_H) + 40}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();

  const selUnit = (): Unit | null => s.units.find((u) => u.id === s.selected && u.hp > 0) ?? null;

  // ── 渲染 ──
  function hexPath(x: number, y: number): void {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i - 30);
      const px = x + SZ * Math.cos(a), py = y + SZ * Math.sin(a);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  const TERR_C: Record<string, string> = { mountain: "#6b6350", hill: "#8d7f58", plain: "#a99a62", city: "#5c6066" };
  const STATE_C: Record<string, string> = { base: "rgba(190,52,36,.45)", guer: "rgba(190,150,60,.28)", enemy: "rgba(40,46,60,.25)" };

  function draw(): void {
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = "#14120c";
    ctx.fillRect(0, 0, cv.width, cv.height);
    const u = selUnit();
    // tiles
    for (const t of s.tiles) {
      const x = hexX(t.q, t.r), y = hexY(t.r);
      hexPath(x, y);
      ctx.fillStyle = TERR_C[t.terrain];
      ctx.fill();
      hexPath(x, y);
      ctx.fillStyle = STATE_C[t.state];
      ctx.fill();
      // 铁路/河
      if (t.river) { ctx.strokeStyle = "#4a7a8c"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, y - SZ); ctx.lineTo(x, y + SZ); ctx.stroke(); }
      if (t.rail) { ctx.strokeStyle = "#26221a"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x - SZ * 0.8, y + SZ * 0.5); ctx.lineTo(x + SZ * 0.8, y - SZ * 0.5); ctx.stroke(); ctx.setLineDash([4, 4]); ctx.strokeStyle = "#c8b890"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x - SZ * 0.8, y + SZ * 0.5); ctx.lineTo(x + SZ * 0.8, y - SZ * 0.5); ctx.stroke(); ctx.setLineDash([]); }
      // 地形符号
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      if (t.terrain === "mountain") { ctx.fillStyle = "rgba(30,26,18,.6)"; ctx.font = "13px serif"; ctx.fillText("▲", x, y + SZ * 0.45); }
      if (t.terrain === "city") { ctx.fillStyle = "#2a2e36"; ctx.fillRect(x - 11, y - 9, 22, 18); ctx.fillStyle = "#b23a2c"; ctx.fillRect(x - 3, y - 16, 6, 5); ctx.fillStyle = "#d8d2c0"; ctx.font = "9px sans-serif"; ctx.fillText("城", x, y); }
      if (t.block) { ctx.fillStyle = "#7d8188"; ctx.fillRect(x - 7, y - 13, 14, 20); ctx.fillStyle = "#1c1e22"; ctx.fillRect(x - 3, y - 8, 6, 4); ctx.fillStyle = "#e8e2d0"; ctx.font = "8px sans-serif"; ctx.fillText(String(t.blockHp), x, y + 12); }
      if (t.hq) { ctx.fillStyle = "#c8392e"; ctx.font = "16px serif"; ctx.fillText("★", x, y - 2); }
      // 网格线
      hexPath(x, y);
      ctx.strokeStyle = "rgba(20,18,12,.5)";
      ctx.lineWidth = 1;
      ctx.stroke();
      // 根据地边界高亮
      if (t.state === "base") { hexPath(x, y); ctx.strokeStyle = "rgba(226,86,77,.7)"; ctx.lineWidth = 2; ctx.stroke(); }
    }
    // 可达范围
    if (u && !u.moved) {
      for (const [k] of reach) {
        const q = k % MAP_W, r = Math.floor(k / MAP_W);
        hexPath(hexX(q, r), hexY(r));
        ctx.fillStyle = "rgba(120,200,255,.22)";
        ctx.fill();
      }
    }
    // 攻击目标高亮
    if (u && !u.acted && UDEFS[u.kind].atk > 0) {
      for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]) {
        const t = tileAt(s, u.q + dq, u.r + dr);
        if (!t) continue;
        const e = unitAt(s, t.q, t.r);
        if ((e && e.jp) || t.block) {
          hexPath(hexX(t.q, t.r), hexY(t.r));
          ctx.strokeStyle = "rgba(255,90,60,.9)";
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
      }
    }
    // units
    for (const un of s.units) {
      const x = hexX(un.q, un.r), y = hexY(un.r);
      const R = 13;
      ctx.beginPath(); ctx.arc(x, y, R, 0, 7);
      ctx.fillStyle = un.jp ? "#5a5c40" : un.kind === "cadre" ? "#c8792e" : "#a83228";
      ctx.fill();
      ctx.strokeStyle = un.id === s.selected ? "#ffe9a0" : un.hidden && !un.jp ? "rgba(150,200,255,.9)" : "rgba(20,16,10,.8)";
      ctx.lineWidth = un.id === s.selected ? 3 : 1.5;
      ctx.stroke();
      ctx.fillStyle = "#f2ead2";
      ctx.font = "bold 11px sans-serif";
      const label: Record<UKind, string> = { guerrilla: "游", cadre: "干", militia: "民", regular: "主", garrison: "守", raider: "讨" };
      ctx.fillText(label[un.kind], x, y - 1);
      // hp pips
      ctx.fillStyle = "#1a160e";
      ctx.fillRect(x - 10, y + 7, 20, 4);
      ctx.fillStyle = un.jp ? "#c8b040" : "#7ec850";
      ctx.fillRect(x - 10, y + 7, 20 * (un.hp / un.maxHp), 4);
      if (un.moved && !un.jp) { ctx.fillStyle = "rgba(10,8,6,.45)"; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill(); }
    }
    // hover
    if (hover) {
      hexPath(hexX(hover.q, hover.r), hexY(hover.r));
      ctx.strokeStyle = "rgba(255,240,200,.8)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // ── 拾取 ──
  function pick(mx: number, my: number): { q: number; r: number } | null {
    let best: { q: number; r: number } | null = null, bd = SZ * SZ;
    for (const t of s.tiles) {
      const dx = hexX(t.q, t.r) - mx, dy = hexY(t.r) - my;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = { q: t.q, r: t.r }; }
    }
    return best;
  }
  cv.addEventListener("mousemove", (e) => {
    const rc = cv.getBoundingClientRect();
    hover = pick(e.clientX - rc.left, e.clientY - rc.top);
    draw();
  });
  cv.addEventListener("click", (e) => {
    if (s.over) return;
    const rc = cv.getBoundingClientRect();
    const h = pick(e.clientX - rc.left, e.clientY - rc.top);
    if (!h) return;
    const u = selUnit();
    const clickedUnit = unitAt(s, h.q, h.r);
    if (clickedUnit && !clickedUnit.jp) {
      s.selected = clickedUnit.id;
      reach = clickedUnit.moved ? new Map() : reachable(s, clickedUnit);
    } else if (u) {
      const t = tileAt(s, h.q, h.r)!;
      const enemy = clickedUnit?.jp ? clickedUnit : null;
      if ((enemy || t.block) && hexDist(u.q, u.r, h.q, h.r) === 1 && !u.acted) {
        attack(s, u, h.q, h.r);
        reach = new Map();
      } else if (!u.moved) {
        if (moveUnit(s, u, h.q, h.r)) reach = new Map();
      }
    }
    render();
  });

  // ── UI ──
  function render(): void {
    $("#tbRes").innerHTML = `🌾 ${s.grain} 　👥 ${s.recruits} 　🔫 ${s.arms} 　回合 ${s.turn}/40`;
    const al = $("#tbAlert");
    al.textContent = s.sweepActive ? `⚠⚠ 扫荡进行中(剩${s.sweepTurnsLeft}回合)` : `警备 ${s.alert}/10`;
    al.className = s.sweepActive || s.alert >= 7 ? "hot" : "";
    const u = selUnit();
    const info = $("#tbInfo");
    if (u) {
      const d = UDEFS[u.kind];
      const t = tileAt(s, u.q, u.r)!;
      info.innerHTML = `<b>${d.name}</b> hp${u.hp}/${u.maxHp} 攻${d.atk} 防${d.def} 移${d.move}${u.hidden ? " 🕶隐蔽" : ""}<br><span class="dim">${d.desc}</span><br><span class="dim">所在:${t.terrain === "mountain" ? "山地" : t.terrain === "hill" ? "丘陵" : t.terrain === "plain" ? "平原" : "城市"}·${t.state === "base" ? "根据地" : t.state === "guer" ? "游击区" : "敌占"}</span>`;
    } else info.textContent = "点击单位开始。蓝圈=可移动格,红框=可攻击。";
    // 行动按钮
    const acts = $("#tbActs");
    acts.replaceChildren();
    if (u && !u.acted) {
      const t = tileAt(s, u.q, u.r)!;
      if (u.kind === "guerrilla" && t.state === "enemy" && t.terrain !== "city" && !t.block) {
        const b = document.createElement("button"); b.textContent = "🕶 渗透(敌占→游击区)";
        b.addEventListener("click", () => { infiltrate(s, u); render(); });
        acts.appendChild(b);
      }
      if (u.kind === "cadre" && t.state === "guer") {
        const b = document.createElement("button"); b.textContent = `🏛 建政权(游击区→根据地) 🌾3`;
        b.disabled = s.grain < 3;
        b.addEventListener("click", () => { buildGov(s, u); render(); });
        acts.appendChild(b);
      }
    }
    // 招募
    const rec = $("#tbRec");
    rec.replaceChildren();
    for (const k of ["militia", "guerrilla", "cadre", "regular"] as UKind[]) {
      const d = UDEFS[k];
      const b = document.createElement("button");
      b.textContent = `${d.name} 🌾${d.costG}👥${d.costR}${d.costA ? `🔫${d.costA}` : ""}`;
      b.title = d.desc;
      b.disabled = s.grain < d.costG || s.recruits < d.costR || s.arms < d.costA;
      b.addEventListener("click", () => { recruit(s, k); render(); });
      rec.appendChild(b);
    }
    // log
    const lg = $("#tbLog");
    lg.replaceChildren(...s.log.slice(-14).map((l) => {
      const d = document.createElement("div");
      d.className = `l-${l.k}`;
      d.textContent = l.t;
      return d;
    }));
    lg.scrollTop = lg.scrollHeight;
    // over
    const ov = $("#tbOver");
    if (s.over) {
      ov.style.display = "";
      ov.innerHTML = `<div class="tb-over-card"><div class="tb-over-t">${s.over.win ? "🔥 燎原" : "💀 星火熄灭"}</div><div>${s.over.reason}</div><button id="tbAgain">再来一局</button></div>`;
      ov.querySelector<HTMLButtonElement>("#tbAgain")!.addEventListener("click", () => { s = createGame(); reach = new Map(); ov.style.display = "none"; render(); });
    } else ov.style.display = "none";
    draw();
  }
  $("#tbEnd").addEventListener("click", () => { s.selected = null; reach = new Map(); endTurn(s); render(); });

  (window as unknown as { __tbs?: unknown }).__tbs = {
    state: () => s,
    end: () => { endTurn(s); render(); },
    select: (id: number) => { s.selected = id; const u = selUnit(); reach = u && !u.moved ? reachable(s, u) : new Map(); render(); },
    move: (q: number, r: number) => { const u = selUnit(); if (u) { const ok = moveUnit(s, u, q, r); render(); return ok; } return false; },
    act: (what: string, q?: number, r?: number) => {
      const u = selUnit(); if (!u) return false;
      let ok = false;
      if (what === "inf") ok = infiltrate(s, u);
      else if (what === "gov") ok = buildGov(s, u);
      else if (what === "atk" && q !== undefined && r !== undefined) ok = attack(s, u, q, r);
      render(); return ok;
    },
    recruit: (k: UKind) => { const ok = recruit(s, k); render(); return ok; },
    give: (g: number, rr: number, a: number) => { s.grain += g; s.recruits += rr; s.arms += a; render(); },
    render
  };
  render();
}

function injectCss(): void {
  if (document.getElementById("tbCss")) return;
  const el = document.createElement("style");
  el.id = "tbCss";
  el.textContent = `
.tb { position: fixed; inset: 0; z-index: 2147483000; background: #14120c; color: #d8c9a0; font-family: 'Noto Serif SC', serif; overflow: auto; }
.tb-top { position: sticky; top: 0; z-index: 5; display: flex; gap: 22px; align-items: center; padding: 10px 18px; background: #1c1810; border-bottom: 1px solid #3a3826; font-size: 14px; }
.tb-title { font-weight: 800; letter-spacing: 2px; color: #f0e4c0; }
.tb-top .hot { color: #e2564d; font-weight: 700; }
.tb-end { margin-left: auto; font-family: inherit; font-size: 14px; font-weight: 700; padding: 8px 22px; border: 1px solid #d8a441; border-radius: 5px; background: linear-gradient(180deg,#5a221c,#3a1610); color: #f0e4c0; cursor: pointer; }
.tb-end:hover { background: linear-gradient(180deg,#6a271f,#431811); }
#tbCv { display: block; margin: 0; cursor: pointer; }
.tb-side { position: fixed; right: 0; top: 46px; bottom: 0; width: 300px; background: rgba(22,18,12,.96); border-left: 1px solid #3a3826; padding: 12px; display: flex; flex-direction: column; gap: 10px; font-size: 13px; }
.tb-info { line-height: 1.6; min-height: 76px; border: 1px solid #3a3826; border-radius: 4px; padding: 8px 10px; }
.tb-info .dim { color: #8a8058; font-size: 11.5px; }
.tb-acts { display: flex; flex-direction: column; gap: 6px; }
.tb-acts button, .tb-recruit button { font-family: inherit; font-size: 12.5px; padding: 7px 10px; border: 1px solid #6b5a30; border-radius: 4px; background: #2a2416; color: #e8d7ae; cursor: pointer; }
.tb-acts button:hover:not(:disabled), .tb-recruit button:hover:not(:disabled) { border-color: #d8a441; }
.tb-acts button:disabled, .tb-recruit button:disabled { opacity: .4; cursor: default; }
.tb-h { font-size: 11px; letter-spacing: 2px; color: #8a8058; margin-bottom: 5px; }
.tb-recruit #tbRec { display: flex; flex-wrap: wrap; gap: 5px; }
.tb-log { flex: 1; overflow-y: auto; border: 1px solid #3a3826; border-radius: 4px; padding: 7px 9px; font-size: 12px; line-height: 1.55; }
.tb-log .l-win { color: #f2c0a0; }
.tb-log .l-loss { color: #e2564d; }
.tb-log .l-info { color: #b5a575; }
.tb-over { position: fixed; inset: 0; z-index: 20; background: rgba(6,5,3,.85); display: flex; align-items: center; justify-content: center; }
.tb-over-card { padding: 34px 48px; border: 2px solid #d8a441; border-radius: 8px; background: #1c1810; text-align: center; font-size: 15px; line-height: 1.8; }
.tb-over-t { font-size: 34px; font-weight: 800; letter-spacing: 6px; color: #f0e4c0; margin-bottom: 8px; }
.tb-over-card button { margin-top: 16px; font-family: inherit; font-size: 14px; padding: 9px 28px; border: 1px solid #d8a441; border-radius: 5px; background: linear-gradient(180deg,#5a221c,#3a1610); color: #f0e4c0; cursor: pointer; }
`;
  document.head.appendChild(el);
}
