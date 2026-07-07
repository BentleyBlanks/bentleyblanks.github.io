// 白盒·「算力格子矩阵」装配层。Canvas 渲染格子矩阵 + 流星粒子涌入核心；DOM 做右侧商店/HUD/Debug。路由 #matrix。
import {
  TIERS, SKILLS,
  createWBState, fmt, totalDevices, gridGen, throughput, computePerSec,
  tierCost, tierUnlocked, skillCost, skillRevealed, buyTier, buySkill,
  manualBurst, unlockedKeys, keyCooldownMs, tick,
  type WBState
} from "./core";
import { injectMatrixStyles } from "./styles";

export function bootstrapMatrix(root: HTMLElement): void {
  injectMatrixStyles();
  let state: WBState = createWBState();
  let paused = false;
  let speed = 1;
  const keyReady: Record<string, number> = {};

  root.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "mx";
  wrap.innerHTML = `
    <canvas class="mx-canvas" id="mxCanvas"></canvas>
    <div class="mx-scan"></div>
    <div class="mx-hud">
      <div class="mx-brand">◈ SOPHIA · 算力矩阵</div>
      <div class="mx-num" id="mxNum">0</div>
      <div class="mx-rate" id="mxRate"></div>
      <div class="mx-combo" id="mxCombo"></div>
      <div class="mx-keys" id="mxKeys"></div>
    </div>
    <div class="mx-guide" id="mxGuide" style="display:none"></div>
    <aside class="mx-shop">
      <div class="mx-shop-title">▸ 设备 · 算力格</div>
      <div id="mxTiers"></div>
      <div class="mx-shop-title">▸ 技能</div>
      <div id="mxSkills"></div>
    </aside>
    <div class="mx-help">敲 <b>[G]</b> 让核心爆发处理需求 · 右侧买设备铺满算力矩阵（越买越密）</div>
    <button class="mx-debug-btn" id="mxDebugBtn">⚙</button>
    <div class="mx-debug" id="mxDebug" style="display:none">
      <div class="mx-debug-title">DEBUG</div>
      <div class="mx-debug-row"><button id="mxDbgPause">⏸ 暂停</button><button id="mxDbgReset" class="danger">重置</button></div>
      <div class="mx-debug-row"><input id="mxDbgAmt" type="number" value="100000"/><button id="mxDbgGive">+算力</button><button id="mxDbgSet">=设为</button></div>
      <div class="mx-debug-row"><span>速度</span><button data-spd="1" class="spd active">×1</button><button data-spd="10" class="spd">×10</button><button data-spd="100" class="spd">×100</button></div>
      <div class="mx-debug-row"><button id="mxDbgBuy">每档+10台</button></div>
    </div>
  `;
  root.appendChild(wrap);
  const $ = <T extends HTMLElement = HTMLElement>(s: string): T => wrap.querySelector<T>(s)!;

  const canvas = $<HTMLCanvasElement>("#mxCanvas");
  const ctx = canvas.getContext("2d")!;
  let W = 0, H = 0, dpr = 1;
  function resize(): void {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.max(1, W * dpr); canvas.height = Math.max(1, H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  new ResizeObserver(resize).observe(canvas);
  const core = () => ({ x: W * 0.5, y: H * 0.5 });

  // 格子布局
  interface Cell { cx: number; cy: number; tier: number; }
  let cells: Cell[] = [];
  let cellSize = 0;
  function layout(): void {
    const { cols, rows } = gridGen(state);
    const c = core(); const pad = 36;
    cellSize = Math.max(6, Math.min((W - pad * 2) / cols, (H - pad * 2) / rows));
    const gw = cols * cellSize, gh = rows * cellSize;
    const x0 = c.x - gw / 2, y0 = c.y - gh / 2;
    const slots: { cx: number; cy: number; d: number }[] = [];
    for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
      const cx = x0 + col * cellSize + cellSize / 2, cy = y0 + r * cellSize + cellSize / 2;
      slots.push({ cx, cy, d: Math.hypot(cx - c.x, cy - c.y) });
    }
    slots.sort((a, b) => a.d - b.d);
    const flat: number[] = [];
    for (let i = TIERS.length - 1; i >= 0; i--) for (let k = 0; k < state.owned[i]; k++) flat.push(i);
    cells = slots.map((s, idx) => ({ cx: s.cx, cy: s.cy, tier: idx === 0 ? -2 : (flat[idx - 1] ?? -1) }));
  }

  interface Meteor { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; big: boolean; }
  const meteors: Meteor[] = [];
  const MAX_METEORS = 1100;
  function spawnMeteor(color: string, big: boolean, fromEdge: boolean): void {
    if (meteors.length >= MAX_METEORS) return;
    const c = core(); let x: number, y: number;
    if (fromEdge) {
      const per = W * 2 + H * 2, t = Math.random() * per;
      if (t < W) { x = t; y = 0; } else if (t < W + H) { x = W; y = t - W; }
      else if (t < W * 2 + H) { x = W - (t - W - H); y = H; } else { x = 0; y = H - (t - W * 2 - H); }
    } else { const a = Math.random() * Math.PI * 2, r = Math.min(W, H) * 0.4; x = c.x + Math.cos(a) * r; y = c.y + Math.sin(a) * r; }
    const dx = c.x - x, dy = c.y - y, d = Math.hypot(dx, dy) || 1;
    const spd = (big ? 1500 : 760) + Math.random() * 320;
    meteors.push({ x, y, vx: (dx / d) * spd, vy: (dy / d) * spd, life: 0, max: d / spd, color, big });
  }
  let meteorAcc = 0;
  function tierColorSample(): string {
    const tp = TIERS.map((t, i) => t.rate * state.owned[i]); const sum = tp.reduce((a, b) => a + b, 0);
    if (sum <= 0) return TIERS[0].color; let r = Math.random() * sum;
    for (let i = 0; i < tp.length; i++) { r -= tp[i]; if (r <= 0) return TIERS[i].color; } return TIERS[0].color;
  }

  let coreFlash = 0;
  const fx = document.createElement("div"); fx.className = "mx-fx"; wrap.appendChild(fx);
  function floatGain(g: number): void {
    const c = core(); const f = document.createElement("div"); f.className = "mx-float"; f.textContent = `+${fmt(g)}`;
    f.style.left = `${c.x}px`; f.style.top = `${c.y - Math.max(30, cellSize)}px`;
    fx.appendChild(f); setTimeout(() => f.remove(), 850);
  }
  function burst(): void {
    const g = manualBurst(state);
    const n = 6 + Math.floor(state.combo * 3);
    for (let i = 0; i < n; i++) spawnMeteor(state.combo > 2.2 ? "#ffffff" : "#d9ffe0", true, false);
    coreFlash = 1; floatGain(g);
  }

  function roundRect(px: number, py: number, w: number, h: number, rad: number): void {
    ctx.beginPath(); ctx.moveTo(px + rad, py);
    ctx.arcTo(px + w, py, px + w, py + h, rad); ctx.arcTo(px + w, py + h, px, py + h, rad);
    ctx.arcTo(px, py + h, px, py, rad); ctx.arcTo(px, py, px + w, py, rad); ctx.closePath();
  }
  function hexA(hex: string, a: number): string {
    const h = hex.replace("#", ""); const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    return `rgba(${parseInt(n.slice(0, 2), 16)},${parseInt(n.slice(2, 4), 16)},${parseInt(n.slice(4, 6), 16)},${a})`;
  }

  function draw(dt: number): void {
    ctx.clearRect(0, 0, W, H);
    const c = core(); layout();
    const s = cellSize, r = s * 0.42;
    const dense = s < 16; // 密集时省略发光提性能
    for (const cell of cells) {
      if (cell.tier === -2) continue;
      if (cell.tier === -1) { ctx.fillStyle = "rgba(60,110,40,.05)"; ctx.strokeStyle = "rgba(90,150,60,.09)"; }
      else { const col = TIERS[cell.tier].color; ctx.fillStyle = hexA(col, 0.16); ctx.strokeStyle = hexA(col, 0.6);
        if (!dense) { ctx.shadowColor = col; ctx.shadowBlur = s * 0.3; } }
      roundRect(cell.cx - r, cell.cy - r, r * 2, r * 2, s * 0.14); ctx.fill(); ctx.shadowBlur = 0; ctx.lineWidth = Math.max(0.6, s * 0.04); ctx.stroke();
    }
    for (const m of meteors) {
      const tx = m.x - m.vx * 0.045, ty = m.y - m.vy * 0.045;
      const grad = ctx.createLinearGradient(tx, ty, m.x, m.y);
      grad.addColorStop(0, hexA(m.color, 0)); grad.addColorStop(1, hexA(m.color, m.big ? 1 : 0.85));
      ctx.strokeStyle = grad; ctx.lineWidth = m.big ? 2.6 : 1.4; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(m.x, m.y); ctx.stroke();
      ctx.fillStyle = hexA(m.color, 0.95); ctx.beginPath(); ctx.arc(m.x, m.y, m.big ? 2.2 : 1.2, 0, 7); ctx.fill();
    }
    const pulse = 1 + coreFlash * 0.5 + (state.combo - 1) * 0.06;
    const cr = Math.max(20, s * 0.55) * pulse;
    const gr = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, cr * 2.6);
    gr.addColorStop(0, hexA("#eaffce", 0.5 + coreFlash * 0.4)); gr.addColorStop(0.4, hexA("#8dff6e", 0.22)); gr.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(c.x, c.y, cr * 2.6, 0, 7); ctx.fill();
    ctx.fillStyle = "#0a1606"; ctx.strokeStyle = "#8dff6e"; ctx.lineWidth = 2; ctx.shadowColor = "#8dff6e"; ctx.shadowBlur = 28;
    roundRect(c.x - cr, c.y - cr, cr * 2, cr * 2, cr * 0.3); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
    const eg = ctx.createRadialGradient(c.x, c.y - cr * 0.1, 0, c.x, c.y, cr * 0.8);
    eg.addColorStop(0, "#f4ffe8"); eg.addColorStop(0.3, "#b6ff6e"); eg.addColorStop(0.75, "#2e6b12"); eg.addColorStop(1, "#0a2006");
    ctx.fillStyle = eg; ctx.beginPath(); ctx.ellipse(c.x, c.y, cr * 0.7, cr * 0.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#06140a"; ctx.beginPath(); ctx.ellipse(c.x, c.y, cr * 0.13, cr * 0.32, 0, 0, 7); ctx.fill();
    coreFlash = Math.max(0, coreFlash - dt * 3.5);
  }

  interface Row { el: HTMLButtonElement; name: HTMLElement; meta: HTMLElement; cost: HTMLElement; }
  function mkRow(host: HTMLElement, icon: string, onClick: () => boolean): Row {
    const el = document.createElement("button"); el.className = "mx-item";
    el.innerHTML = `<span class="mx-item-icon">${icon}</span><div class="mx-item-body"><div class="mx-item-top"><span class="mx-item-name"></span><span class="mx-item-cost"></span></div><div class="mx-item-meta"></div></div>`;
    el.addEventListener("click", () => { if (onClick()) { el.classList.remove("pulse"); void el.offsetWidth; el.classList.add("pulse"); } });
    host.appendChild(el);
    return { el, name: el.querySelector(".mx-item-name")!, meta: el.querySelector(".mx-item-meta")!, cost: el.querySelector(".mx-item-cost")! };
  }
  const tierRows = TIERS.map((t, i) => mkRow($("#mxTiers"), t.icon, () => buyTier(state, i)));
  tierRows.forEach((r, i) => r.el.style.setProperty("--tone", TIERS[i].color));
  const skillRows = new Map(SKILLS.map((k) => [k.id, mkRow($("#mxSkills"), k.icon, () => buySkill(state, k.id))]));

  const keyCells = new Map<string, HTMLElement>();
  function flashKey(k: string): void { const c = keyCells.get(k); if (c) { c.classList.remove("hit"); void c.offsetWidth; c.classList.add("hit"); } }

  const GUIDE = [
    { t: "敲键盘【G】——核心爆发处理需求，得算力", d: (s: WBState) => s.totalEarned > 0 },
    { t: "攒够算力，右侧买第一台【App】设备（算力格点亮）", d: (s: WBState) => totalDevices(s) > 0 },
    { t: "设备自动处理需求：流星持续涌入核心。多买几台，矩阵会变密", d: (s: WBState) => totalDevices(s) >= 5 },
    { t: "买技能：解锁更多字母键狂按 + 连击升温 + 越铺越密", d: (s: WBState) => Object.values(s.skills).some((x) => x.level > 0) }
  ];
  let gstep = 0;
  function updateGuide(): void {
    const g = $("#mxGuide"); while (gstep < GUIDE.length && GUIDE[gstep].d(state)) gstep += 1;
    if (gstep >= GUIDE.length) { g.style.display = "none"; return; }
    g.style.display = ""; const txt = `${gstep + 1}/${GUIDE.length} · ${GUIDE[gstep].t}`; if (g.textContent !== txt) g.textContent = txt;
  }

  function renderHud(): void {
    $("#mxNum").textContent = fmt(state.compute);
    $("#mxRate").textContent = `+${fmt(computePerSec(state))}/秒 · 设备 ${totalDevices(state)} · 吞吐 ${fmt(throughput(state))}/秒`;
    const cm = $("#mxCombo"); const on = state.combo > 1.05;
    cm.style.opacity = on ? "1" : "0"; cm.textContent = on ? `连击 ×${state.combo.toFixed(1)}` : "";
    cm.style.color = state.combo > 2.2 ? "#fff" : state.combo > 1.6 ? "#e6bd53" : "#8dff6e";
    const keys = unlockedKeys(state); const host = $("#mxKeys");
    if (host.childElementCount !== keys.length) {
      host.replaceChildren(); keyCells.clear();
      for (const k of keys) { const el = document.createElement("span"); el.className = "mx-key"; el.textContent = k.toUpperCase(); host.appendChild(el); keyCells.set(k, el); }
    }
    for (let i = 0; i < TIERS.length; i++) {
      const r = tierRows[i]; const un = tierUnlocked(state, i);
      r.el.classList.toggle("locked", !un);
      r.name.textContent = un ? `${TIERS[i].name}${state.owned[i] > 0 ? ` ×${state.owned[i]}` : ""}` : "▓ 未解锁";
      r.meta.textContent = un ? `${fmt(TIERS[i].rate)}/秒 · 处理需求` : `拥有前档 ${TIERS[i].unlockPrev} 台解锁`;
      r.cost.textContent = un ? fmt(tierCost(state, i)) : "";
      r.el.classList.toggle("affordable", un && state.compute >= tierCost(state, i));
    }
    for (const k of SKILLS) {
      const r = skillRows.get(k.id)!; const lv = state.skills[k.id].level; const rev = skillRevealed(state, k); const maxed = lv >= k.maxLevel;
      r.el.classList.toggle("locked", !rev);
      r.name.textContent = rev ? `${k.name}${lv > 0 ? ` Lv.${lv}` : ""}` : "▓ 未解锁";
      r.meta.textContent = rev ? k.desc : "达到更高算力后解锁";
      r.cost.textContent = rev ? (maxed ? "MAX" : fmt(skillCost(state, k))) : "";
      r.el.classList.toggle("affordable", rev && !maxed && state.compute >= skillCost(state, k));
      r.el.classList.toggle("maxed", maxed);
    }
    updateGuide();
  }

  let last = performance.now();
  function frame(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!paused) {
      tick(state, dt * speed);
      const rate = Math.min(140, throughput(state) * 0.4 + totalDevices(state) * 0.5);
      meteorAcc += rate * dt;
      while (meteorAcc >= 1) { meteorAcc -= 1; if (throughput(state) > 0) spawnMeteor(tierColorSample(), false, true); }
    }
    const c = core();
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i]; m.x += m.vx * dt; m.y += m.vy * dt; m.life += dt;
      if (Math.hypot(m.x - c.x, m.y - c.y) < 14 || m.life > m.max + 0.1) { meteors.splice(i, 1); coreFlash = Math.min(1, coreFlash + 0.03); }
    }
    if (W > 0) { draw(dt); renderHud(); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(() => { resize(); requestAnimationFrame(frame); });

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return; const k = e.key.toLowerCase();
    if (!unlockedKeys(state).includes(k)) return;
    const now = performance.now(); if ((keyReady[k] ?? 0) > now) return;
    keyReady[k] = now + keyCooldownMs(state); burst(); flashKey(k);
  });
  canvas.addEventListener("click", () => burst());

  const dbg = $("#mxDebug");
  $("#mxDebugBtn").addEventListener("click", () => { dbg.style.display = dbg.style.display === "none" ? "" : "none"; });
  const pauseBtn = $<HTMLButtonElement>("#mxDbgPause");
  const setPaused = (p: boolean): void => { paused = p; pauseBtn.textContent = paused ? "▶ 继续" : "⏸ 暂停"; pauseBtn.classList.toggle("active", paused); };
  pauseBtn.addEventListener("click", () => setPaused(!paused));
  const amt = $<HTMLInputElement>("#mxDbgAmt"); const rd = () => Math.max(0, Number(amt.value) || 0);
  $("#mxDbgGive").addEventListener("click", () => { state.compute += rd(); state.totalEarned += rd(); });
  $("#mxDbgSet").addEventListener("click", () => { state.compute = rd(); state.totalEarned = Math.max(state.totalEarned, rd()); });
  const spd = [...wrap.querySelectorAll<HTMLButtonElement>(".mx-debug .spd")];
  for (const b of spd) b.addEventListener("click", () => { speed = Number(b.dataset.spd) || 1; for (const x of spd) x.classList.toggle("active", x === b); });
  $("#mxDbgBuy").addEventListener("click", () => { for (let i = 0; i < TIERS.length; i++) state.owned[i] += 10; });
  $("#mxDbgReset").addEventListener("click", () => { if (window.confirm("重置？")) { state = createWBState(); gstep = 0; meteors.length = 0; } });

  (window as unknown as { __mx?: unknown }).__mx = {
    state: () => state, give: (n: number) => { state.compute += n; state.totalEarned += n; },
    pause: () => setPaused(true), resume: () => setPaused(false), setSpeed: (n: number) => { speed = n; }, burst,
    devices: () => totalDevices(state), meteors: () => meteors.length
  };
}
