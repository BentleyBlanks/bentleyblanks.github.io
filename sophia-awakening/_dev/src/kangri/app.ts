// 《烽火敌后》装配层。2.5D 华北大地图(Canvas2D)作主视图 + 双资源 HUD + 设施/政策/战役商店
// + 扫荡多阶段事件（转移群众/组织抗击决策条）+ 地图直接点区域发动收复战役。路由 #kangri。
import {
  BUILDINGS, POLICIES, REGIONS, PHASES, TUNING,
  createKRState, fmt, phase, regionsReclaimed, bingPerSec, wuziPerSec, defense,
  buildCostWuzi, buildCostBing, buildingUnlocked, policyRevealed, regionAvailable,
  rally, buyBuilding, buyPolicy, launchOp, tick, startEvacuation, commitTroops,
  type KRState
} from "./core";
import { initScene } from "./scene";
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

    <div class="kr-title">烽火敌后 · 华北抗日根据地</div>
    <div class="kr-phase" id="krPhase"></div>
    <div class="kr-sweep" id="krSweep"></div>

    <div class="kr-sweepbar" id="krSweepBar" style="display:none">
      <div class="kr-sb-head" id="krSbHead"></div>
      <div class="kr-sb-status" id="krSbStatus"></div>
      <div class="kr-sb-row" id="krSbActions">
        <button class="kr-sb-btn evac" id="krEvac"><b>组织群众大范围转移</b><span>坚壁清野 · 减少烧抢损失（转移期间产出减半）</span></button>
        <div class="kr-sb-commit">
          <div class="kr-sb-commit-t">组织抗击 · 投入兵员迎战</div>
          <div class="kr-sb-commit-btns">
            <button class="kr-sb-btn fight" data-frac="0.3">三成兵力</button>
            <button class="kr-sb-btn fight" data-frac="0.6">六成兵力</button>
            <button class="kr-sb-btn fight all" data-frac="1">全军压上</button>
          </div>
        </div>
      </div>
    </div>

    <aside class="kr-left">
      <div class="kr-res">
        <div class="kr-res-row"><span class="kr-ic">👥</span><div><div class="kr-res-num" id="krBing">0</div><div class="kr-res-lab">兵员 <span id="krBingS"></span></div></div></div>
        <div class="kr-res-row"><span class="kr-ic">🌾</span><div><div class="kr-res-num" id="krWuzi">0</div><div class="kr-res-lab">物资 <span id="krWuziS"></span></div></div></div>
      </div>
      <button class="kr-rally" id="krRally"><b>发动群众抗争</b><span>[G] 点击 · 组织抵抗</span></button>
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

  // 2.5D 大地图
  const mapCanvas = $<HTMLCanvasElement>("#krMap");
  const scene = initScene(mapCanvas);
  new ResizeObserver(() => scene.resize()).observe(mapCanvas);

  const fx = document.createElement("div"); fx.className = "kr-fx"; wrap.appendChild(fx);
  function floatAt(x: number, y: number, text: string, cls = ""): void {
    const f = document.createElement("div"); f.className = `kr-float ${cls}`; f.textContent = text;
    f.style.left = `${x}px`; f.style.top = `${y}px`;
    fx.appendChild(f); setTimeout(() => f.remove(), 950);
  }

  // 地图点区域 → 直接发动收复战役
  mapCanvas.addEventListener("click", (e) => {
    const r = mapCanvas.getBoundingClientRect();
    const id = scene.hitRegion(e.clientX - r.left, e.clientY - r.top);
    if (!id || id === "base") return;
    const def = REGIONS.find((x) => x.id === id);
    if (!def || state.regions[id]) return;
    if (launchOp(state, id)) {
      floatAt(e.clientX - r.left, e.clientY - r.top - 12, `★ 收复 ${def.name}！`, "big");
    } else if (regionAvailable(state, def)) {
      floatAt(e.clientX - r.left, e.clientY - r.top - 12, `需 ${fmt(def.costBing)}兵 ${fmt(def.costWuzi)}资`, "dim");
    }
  });

  // ── 发动群众 ──
  const rallyBtn = $("#krRally");
  function doRally(): void {
    rally(state);
    rallyBtn.classList.remove("hit"); void rallyBtn.offsetWidth; rallyBtn.classList.add("hit");
    const b = rallyBtn.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    floatAt(b.left - w.left + b.width / 2, b.top - w.top - 6, "+兵 +物资");
  }
  rallyBtn.addEventListener("click", doRally);
  window.addEventListener("keydown", (e) => { if (e.key.toLowerCase() === "g") doRally(); });

  // ── 扫荡决策条 ──
  const sweepBar = $("#krSweepBar"), sbHead = $("#krSbHead"), sbStatus = $("#krSbStatus");
  const evacBtn = $<HTMLButtonElement>("#krEvac");
  evacBtn.addEventListener("click", () => { startEvacuation(state); });
  for (const b of wrap.querySelectorAll<HTMLButtonElement>(".kr-sb-btn.fight")) {
    b.addEventListener("click", () => {
      const frac = Number(b.dataset.frac) || 0.3;
      const n = commitTroops(state, Math.floor(state.bing * frac));
      if (n > 0) { b.classList.remove("pulse"); void b.offsetWidth; b.classList.add("pulse"); }
    });
  }
  function renderSweepBar(): void {
    const sw = state.sweep;
    const banner = $("#krSweep");
    if (!sw) {
      sweepBar.style.display = "none"; banner.classList.remove("on");
      return;
    }
    sweepBar.style.display = "";
    banner.classList.add("on");
    const where = sw.targetRegion ? REGIONS.find((r) => r.id === sw.targetRegion)!.name : "中心根据地";
    if (sw.stage === "incoming") {
      banner.textContent = "⚠ 日军兵团开拔！";
      sbHead.textContent = `日军 ${Math.round(sw.strength)} 人压向【${where}】 · ${Math.ceil(sw.etaSec)} 秒后抵达`;
      sbStatus.textContent = sw.evacStarted
        ? `群众转移中 ${Math.round(sw.evacProgress * 100)}%${sw.committed > 0 ? ` · 已集结 ${Math.round(sw.committed)} 人设伏` : " · 尚未组织抗击"}`
        : sw.committed > 0 ? `已集结 ${Math.round(sw.committed)} 人设伏 · 群众未转移` : "尚未应对——快下令！";
    } else if (sw.stage === "battle") {
      banner.textContent = "⚔ 会战进行中！";
      sbHead.textContent = `【${where}】会战 · 我 ${Math.round(sw.committed)} × 敌 ${Math.round(sw.strength)}`;
      sbStatus.textContent = `已击毙 ${Math.round(sw.killed)} · 我方伤亡 ${Math.round(sw.lostBing)}${sw.evacStarted ? ` · 群众转移 ${Math.round(sw.evacProgress * 100)}%` : ""}（可点击追加增援）`;
    } else {
      banner.textContent = "🔥 日军烧抢中！";
      sbHead.textContent = `日军 ${Math.round(sw.strength)} 人突入【${where}】烧抢 · ${Math.ceil(sw.pillageSec)} 秒`;
      sbStatus.textContent = sw.evacProgress > 0.5 ? "群众大部分已转移进山——家底保住了大半。" : "群众没能及时转移，损失惨重……";
    }
    evacBtn.classList.toggle("done", sw.evacStarted);
    evacBtn.querySelector("b")!.textContent = sw.evacStarted
      ? (sw.evacProgress >= 1 ? "✓ 群众已转移进山" : `转移中… ${Math.round(sw.evacProgress * 100)}%`)
      : "组织群众大范围转移";
    const canAct = sw.stage !== "pillage";
    evacBtn.disabled = !canAct || sw.evacStarted;
    for (const b of wrap.querySelectorAll<HTMLButtonElement>(".kr-sb-btn.fight")) b.disabled = !canAct;
  }

  // ── 商店 ──
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
  const opRows = new Map(REGIONS.map((r) => [r.id, mkRow($("#krOp"), () => launchOp(state, r.id))]));
  const panels: Record<string, HTMLElement> = { build: $("#krBuild"), policy: $("#krPolicy"), op: $("#krOp") };
  for (const t of wrap.querySelectorAll<HTMLButtonElement>(".kr-tab")) t.addEventListener("click", () => {
    for (const x of wrap.querySelectorAll(".kr-tab")) x.classList.remove("active"); t.classList.add("active");
    for (const k in panels) panels[k].style.display = k === t.dataset.t ? "" : "none";
  });

  const GUIDE = [
    { t: "敌后一无所有。按【G】或点『发动群众抗争』——组织起来，攒兵员与物资", d: (s: KRState) => s.clickN > 0 },
    { t: "右侧买【民兵队】『开荒生产队』——设施会长在地图上，根据地自己产出", d: (s: KRState) => s.buildings.some((b) => b > 0) },
    { t: "日军扫荡要来了！兵团压过来时：下令【组织群众大范围转移】保家底，【组织抗击】投兵员打会战", d: (s: KRState) => s.sweepsSurvived > 0 },
    { t: "地图上点亮着金圈的区域可以收复——攒兵发动战役。多建地道、搞地雷战，熬到反攻", d: (s: KRState) => regionsReclaimed(s) > 0 }
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
    const prodNote = state.sweep?.evacStarted ? `（转移中 ×${TUNING.evacProdMult}）` : "";
    $("#krBingS").textContent = `+${fmt(bingPerSec(state))}/秒${prodNote}`;
    $("#krWuziS").textContent = `+${fmt(wuziPerSec(state))}/秒${prodNote}`;
    const ph = PHASES[phase(state)];
    $("#krPhase").textContent = `${ph.year} · ${ph.name}　│　收复 ${regionsReclaimed(state)}/${REGIONS.length}　│　反扫荡减损 ${Math.round(defense(state) * 100)}%`;

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
      r.el.classList.toggle("affordable", !has && state.wuzi >= p.cost); r.el.classList.toggle("maxed", has);
    }
    for (const rgn of REGIONS) {
      const r = opRows.get(rgn.id)!; const has = !!state.regions[rgn.id]; const avail = regionAvailable(state, rgn);
      r.el.style.display = has || avail ? "" : "none";
      r.name.textContent = `${rgn.name} · ${rgn.battle}`;
      r.meta.textContent = has ? "★ 已收复 · 根据地" : `产出 ×${rgn.outputMult}（也可在地图上直接点它）`;
      r.cost.textContent = has ? "✓" : `${fmt(rgn.costWuzi)}资 ${fmt(rgn.costBing)}兵`;
      r.el.classList.toggle("affordable", !has && avail && state.wuzi >= rgn.costWuzi && state.bing >= rgn.costBing);
      r.el.classList.toggle("maxed", has);
    }
    const g = $("#krGuide"); while (gstep < GUIDE.length && GUIDE[gstep].d(state)) gstep += 1;
    if (gstep >= GUIDE.length) g.style.display = "none";
    else { g.style.display = ""; const txt = `${gstep + 1}/${GUIDE.length} · ${GUIDE[gstep].t}`; if (g.textContent !== txt) g.textContent = txt; }
    renderSweepBar();
    renderTerm();
  }

  // ── 主循环 ──
  let last = performance.now();
  function frame(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!paused) tick(state, dt * speed);
    scene.frame(dt, state);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(() => { scene.resize(); requestAnimationFrame(frame); });

  // ── Debug ──
  const dbg = $("#krDebug");
  $("#krDbgBtn").addEventListener("click", () => { dbg.style.display = dbg.style.display === "none" ? "" : "none"; });
  const pb = $<HTMLButtonElement>("#krDbgPause");
  const setP = (p: boolean): void => { paused = p; pb.textContent = paused ? "▶继续" : "⏸暂停"; };
  pb.addEventListener("click", () => setP(!paused));
  const amt = $<HTMLInputElement>("#krDbgAmt"); const rdv = () => Math.max(0, Number(amt.value) || 0);
  $("#krDbgGive").addEventListener("click", () => { state.wuzi += rdv(); state.totalWuzi += rdv(); });
  $("#krDbgBing").addEventListener("click", () => { state.bing += rdv(); });
  const spd = [...wrap.querySelectorAll<HTMLButtonElement>(".kr-debug .spd")];
  for (const b of spd) b.addEventListener("click", () => { speed = Number(b.dataset.spd) || 1; for (const x of spd) x.classList.toggle("active", x === b); });
  $("#krDbgSweep").addEventListener("click", () => { if (!state.sweep) state.sweepTimerMs = 1; });
  $("#krDbgReset").addEventListener("click", () => { if (window.confirm("重置？")) { state = createKRState(); gstep = 0; } });

  (window as unknown as { __kr?: unknown }).__kr = {
    state: () => state, give: (w: number, b: number) => { state.wuzi += w; state.totalWuzi += w; state.bing += b || 0; },
    rally: doRally, buyBuilding: (i: number) => buyBuilding(state, i), launch: (id: string) => launchOp(state, id),
    pause: () => setP(true), resume: () => setP(false), setSpeed: (n: number) => { speed = n; },
    phase: () => phase(state), regions: () => regionsReclaimed(state), sceneOk: () => scene.ok,
    sweep: () => { if (!state.sweep) state.sweepTimerMs = 1; },
    evac: () => startEvacuation(state), fight: (frac = 0.6) => commitTroops(state, Math.floor(state.bing * frac))
  };
}
