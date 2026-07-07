// 《烽火敌后》装配层。WebGL 战图(shader) + 双资源 HUD + 设施/政策/战役商店 + 地图收复标记 + 扫荡警报 + 战报终端。路由 #kangri。
import {
  BUILDINGS, POLICIES, REGIONS, PHASES,
  createKRState, fmt, phase, regionsReclaimed, bingPerSec, wuziPerSec, defense,
  buildCostWuzi, buildCostBing, buildingUnlocked, policyRevealed, regionAvailable,
  rally, buyBuilding, buyPolicy, launchOp, tick,
  type KRState
} from "./core";
import { initMapGL } from "./mapgl";
import { injectKRStyles } from "./styles";

export function bootstrapKangri(root: HTMLElement): void {
  injectKRStyles();
  let state: KRState = createKRState();
  let paused = false, speed = 1;

  root.innerHTML = "";
  const wrap = document.createElement("div"); wrap.className = "kr";
  wrap.innerHTML = `
    <canvas class="kr-map" id="krMap"></canvas>
    <div class="kr-vig"></div>
    <div class="kr-regions" id="krRegions"></div>

    <div class="kr-title">烽火敌后 · 华北抗日根据地</div>
    <div class="kr-phase" id="krPhase"></div>
    <div class="kr-sweep" id="krSweep"></div>

    <aside class="kr-left">
      <div class="kr-res">
        <div class="kr-res-row"><span class="kr-ic">👥</span><div><div class="kr-res-num" id="krBing">0</div><div class="kr-res-lab">兵员 <span id="krBingS"></span></div></div></div>
        <div class="kr-res-row"><span class="kr-ic">🌾</span><div><div class="kr-res-num" id="krWuzi">0</div><div class="kr-res-lab">物资 <span id="krWuziS"></span></div></div></div>
      </div>
      <button class="kr-rally" id="krRally"><b>发动群众抗争</b><span>[空格 / G] 点击 · 组织抵抗</span></button>
      <div class="kr-terminal" id="krTerm"></div>
    </aside>

    <aside class="kr-right">
      <div class="kr-tabs"><button class="kr-tab active" data-t="build">设施</button><button class="kr-tab" data-t="policy">政策</button><button class="kr-tab" data-t="op">战役·收复</button></div>
      <div class="kr-panel" id="krBuild"></div>
      <div class="kr-panel" id="krPolicy" style="display:none"></div>
      <div class="kr-panel" id="krOp" style="display:none"></div>
    </aside>

    <div class="kr-guide" id="krGuide" style="display:none"></div>
    <button class="kr-debug-btn" id="krDbgBtn">⚙</button>
    <div class="kr-debug" id="krDebug" style="display:none">
      <div class="kr-dt">DEBUG</div>
      <div class="kr-dr"><button id="krDbgPause">⏸暂停</button><button id="krDbgReset" class="danger">重置</button></div>
      <div class="kr-dr"><input id="krDbgAmt" type="number" value="100000"/><button id="krDbgGive">+物资</button><button id="krDbgBing">+兵员</button></div>
      <div class="kr-dr"><span>速度</span><button data-spd="1" class="spd active">×1</button><button data-spd="10" class="spd">×10</button><button data-spd="100" class="spd">×100</button></div>
      <div class="kr-dr"><button id="krDbgSweep">触发扫荡</button></div>
    </div>
  `;
  root.appendChild(wrap);
  const $ = <T extends HTMLElement = HTMLElement>(s: string): T => wrap.querySelector<T>(s)!;

  const map = initMapGL($<HTMLCanvasElement>("#krMap"));
  new ResizeObserver(() => map.resize()).observe($("#krMap"));

  // ── 地图区域标记（DOM，覆在 canvas 上，可点收复）──
  const regionEls = new Map<string, HTMLElement>();
  const regHost = $("#krRegions");
  for (const r of REGIONS) {
    const el = document.createElement("button"); el.className = "kr-region";
    el.style.left = `${r.x * 100}%`; el.style.top = `${r.y * 100}%`;
    el.innerHTML = `<span class="kr-region-dot"></span><span class="kr-region-name">${r.name}</span>`;
    el.addEventListener("click", () => {
      if (launchOp(state, r.id)) { map.pulseSweep(r.x, r.y); flash(r.x, r.y, "win"); syncRegions(); }
    });
    regHost.appendChild(el); regionEls.set(r.id, el);
  }
  function syncRegions(): void {
    map.setRegions(REGIONS.map((r) => ({ x: r.x, y: r.y, reclaimed: !!state.regions[r.id] })));
    map.setPhase(phase(state), regionsReclaimed(state) / REGIONS.length);
  }
  syncRegions();

  function flash(nx: number, ny: number, kind: string): void {
    const f = document.createElement("div"); f.className = `kr-flash ${kind}`;
    f.style.left = `${nx * 100}%`; f.style.top = `${ny * 100}%`;
    regHost.appendChild(f); setTimeout(() => f.remove(), 900);
  }

  // ── 发动群众（点击/键盘）──
  const rallyBtn = $("#krRally");
  function doRally(): void {
    const g = rally(state);
    rallyBtn.classList.remove("hit"); void rallyBtn.offsetWidth; rallyBtn.classList.add("hit");
    floatGain(`+${fmt(g.bing)}兵 +${fmt(g.wuzi)}资`);
  }
  rallyBtn.addEventListener("click", doRally);
  window.addEventListener("keydown", (e) => { if (e.repeat) return; if (e.key === " " || e.key.toLowerCase() === "g") { e.preventDefault(); doRally(); } });
  const fx = document.createElement("div"); fx.className = "kr-fx"; wrap.appendChild(fx);
  function floatGain(t: string): void {
    const b = rallyBtn.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    const f = document.createElement("div"); f.className = "kr-float"; f.textContent = t;
    f.style.left = `${b.left - w.left + b.width / 2}px`; f.style.top = `${b.top - w.top - 6}px`;
    fx.appendChild(f); setTimeout(() => f.remove(), 850);
  }

  // ── 商店行 ──
  interface Row { el: HTMLButtonElement; name: HTMLElement; meta: HTMLElement; cost: HTMLElement; }
  function mkRow(host: HTMLElement, onClick: () => boolean): Row {
    const el = document.createElement("button"); el.className = "kr-item";
    el.innerHTML = `<div class="kr-item-top"><span class="kr-item-name"></span><span class="kr-item-cost"></span></div><div class="kr-item-meta"></div>`;
    el.addEventListener("click", () => { if (onClick()) { el.classList.remove("pulse"); void el.offsetWidth; el.classList.add("pulse"); } });
    host.appendChild(el);
    return { el, name: el.querySelector(".kr-item-name")!, meta: el.querySelector(".kr-item-meta")!, cost: el.querySelector(".kr-item-cost")! };
  }
  const buildRows = BUILDINGS.map((_, i) => mkRow($("#krBuild"), () => buyBuilding(state, i)));
  const policyRows = new Map(POLICIES.map((p) => [p.id, mkRow($("#krPolicy"), () => buyPolicy(state, p.id))]));
  const opRows = new Map(REGIONS.map((r) => [r.id, mkRow($("#krOp"), () => { const ok = launchOp(state, r.id); if (ok) { map.pulseSweep(r.x, r.y); flash(r.x, r.y, "win"); syncRegions(); } return ok; })]));

  // tabs
  const panels: Record<string, HTMLElement> = { build: $("#krBuild"), policy: $("#krPolicy"), op: $("#krOp") };
  for (const t of wrap.querySelectorAll<HTMLButtonElement>(".kr-tab")) t.addEventListener("click", () => {
    for (const x of wrap.querySelectorAll(".kr-tab")) x.classList.remove("active");
    t.classList.add("active");
    for (const k in panels) panels[k].style.display = k === t.dataset.t ? "" : "none";
  });

  // 扫荡警报 + 阶段变化侦测
  let lastSweepMs = 0, lastPhase = 0;
  const GUIDE = [
    { t: "敌后一无所有。敲【空格】或点『发动群众抗争』——组织起来，是唯一的本钱", d: (s: KRState) => s.clickN > 0 },
    { t: "攒够物资，右侧买【民兵队】『开荒生产队』——让根据地自己产出", d: (s: KRState) => s.buildings.some((b) => b > 0) },
    { t: "切到『战役·收复』，或点地图上发亮的据点，发动第一场战役收复失地", d: (s: KRState) => regionsReclaimed(s) > 0 },
    { t: "日军会来扫荡、造成损失。多建『地道网』减损、搞政策加成——熬到反攻", d: (s: KRState) => Object.keys(s.policies).length > 0 || regionsReclaimed(s) >= 2 }
  ];
  let gstep = 0;

  function renderTerm(): void {
    const t = $("#krTerm");
    if (t.childElementCount === state.terminal.length) return;
    t.replaceChildren(...state.terminal.map((l) => { const d = document.createElement("div"); d.className = `kr-tline ${l.kind}`; d.textContent = l.text; return d; }));
    t.scrollTop = t.scrollHeight;
  }

  function render(): void {
    $("#krBing").textContent = fmt(state.bing);
    $("#krWuzi").textContent = fmt(state.wuzi);
    $("#krBingS").textContent = `+${fmt(bingPerSec(state))}/秒`;
    $("#krWuziS").textContent = `+${fmt(wuziPerSec(state))}/秒`;
    const ph = PHASES[phase(state)];
    $("#krPhase").textContent = `${ph.year} · ${ph.name}　│　收复 ${regionsReclaimed(state)}/${REGIONS.length}　│　反扫荡减损 ${Math.round(defense(state) * 100)}%`;

    // 扫荡警报
    if (state.lastSweepMs !== lastSweepMs) {
      lastSweepMs = state.lastSweepMs;
      // 从随机据点扩散
      const rr = REGIONS[Math.floor(Math.random() * REGIONS.length)];
      map.pulseSweep(rr.x, rr.y);
      const sw = $("#krSweep"); sw.textContent = "⚠ 日军扫荡！"; sw.classList.add("on");
      setTimeout(() => sw.classList.remove("on"), 2200);
    }

    for (let i = 0; i < BUILDINGS.length; i++) {
      const r = buildRows[i]; const b = BUILDINGS[i]; const un = buildingUnlocked(state, i);
      r.el.style.display = un ? "" : "none"; if (!un) continue;
      const cw = buildCostWuzi(state, i), cb = buildCostBing(state, i);
      r.name.textContent = `${b.name}${state.buildings[i] > 0 ? ` ×${state.buildings[i]}` : ""}`;
      r.meta.textContent = b.desc;
      r.cost.textContent = cb > 0 ? `${fmt(cw)}资 ${fmt(cb)}兵` : `${fmt(cw)}资`;
      r.el.classList.toggle("affordable", state.wuzi >= cw && state.bing >= cb);
    }
    for (const p of POLICIES) {
      const r = policyRows.get(p.id)!; const rev = policyRevealed(state, p); const has = !!state.policies[p.id];
      r.el.style.display = rev ? "" : "none"; if (!rev) continue;
      r.name.textContent = p.name; r.meta.textContent = p.desc;
      r.cost.textContent = has ? "✓ 已推行" : `${fmt(p.cost)}资`;
      r.el.classList.toggle("affordable", !has && state.wuzi >= p.cost);
      r.el.classList.toggle("maxed", has);
    }
    for (const rgn of REGIONS) {
      const r = opRows.get(rgn.id)!; const has = !!state.regions[rgn.id]; const avail = regionAvailable(state, rgn);
      r.el.style.display = has || avail ? "" : "none";
      r.name.textContent = `${rgn.name} · ${rgn.battle}`;
      r.meta.textContent = has ? "★ 已收复 · 根据地" : `产出 ×${rgn.outputMult}`;
      r.cost.textContent = has ? "✓" : `${fmt(rgn.costWuzi)}资 ${fmt(rgn.costBing)}兵`;
      r.el.classList.toggle("affordable", !has && avail && state.wuzi >= rgn.costWuzi && state.bing >= rgn.costBing);
      r.el.classList.toggle("maxed", has);
      // 地图标记
      const me = regionEls.get(rgn.id)!;
      me.classList.toggle("reclaimed", has);
      me.classList.toggle("ready", !has && avail && state.wuzi >= rgn.costWuzi && state.bing >= rgn.costBing);
      me.classList.toggle("hidden", !has && !avail);
    }
    // 引导
    const g = $("#krGuide"); while (gstep < GUIDE.length && GUIDE[gstep].d(state)) gstep += 1;
    if (gstep >= GUIDE.length) g.style.display = "none";
    else { g.style.display = ""; const txt = `${gstep + 1}/${GUIDE.length} · ${GUIDE[gstep].t}`; if (g.textContent !== txt) g.textContent = txt; }

    renderTerm();
    if (phase(state) !== lastPhase) { lastPhase = phase(state); syncRegions(); }
  }

  // ── 主循环 ──
  let last = performance.now();
  function frame(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!paused) tick(state, dt * speed);
    map.render(now * 0.001);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(() => { map.resize(); requestAnimationFrame(frame); });

  // ── Debug ──
  const dbg = $("#krDebug");
  $("#krDbgBtn").addEventListener("click", () => { dbg.style.display = dbg.style.display === "none" ? "" : "none"; });
  const pb = $<HTMLButtonElement>("#krDbgPause");
  const setP = (p: boolean): void => { paused = p; pb.textContent = paused ? "▶继续" : "⏸暂停"; };
  pb.addEventListener("click", () => setP(!paused));
  const amt = $<HTMLInputElement>("#krDbgAmt"); const rd = () => Math.max(0, Number(amt.value) || 0);
  $("#krDbgGive").addEventListener("click", () => { state.wuzi += rd(); state.totalWuzi += rd(); });
  $("#krDbgBing").addEventListener("click", () => { state.bing += rd(); });
  const spd = [...wrap.querySelectorAll<HTMLButtonElement>(".kr-debug .spd")];
  for (const b of spd) b.addEventListener("click", () => { speed = Number(b.dataset.spd) || 1; for (const x of spd) x.classList.toggle("active", x === b); });
  $("#krDbgSweep").addEventListener("click", () => { state.sweepTimerMs = 1; });
  $("#krDbgReset").addEventListener("click", () => { if (window.confirm("重置？")) { state = createKRState(); gstep = 0; lastPhase = 0; syncRegions(); } });

  (window as unknown as { __kr?: unknown }).__kr = {
    state: () => state, give: (w: number, b: number) => { state.wuzi += w; state.totalWuzi += w; state.bing += b || 0; },
    rally: doRally, buyBuilding: (i: number) => buyBuilding(state, i), launch: (id: string) => launchOp(state, id),
    pause: () => setP(true), resume: () => setP(false), setSpeed: (n: number) => { speed = n; },
    phase: () => phase(state), regions: () => regionsReclaimed(state), mapOk: () => map.ok
  };
}
