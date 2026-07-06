// v3 装配层 · 四区布局 + 吸吮动画（卡片飞向核心）+ 突破小游戏 + 激励事件强制拍 + CC式重生树。
import {
  stage, createV3State, fmt,
  buyDevice, buySkill, buyCore, processCard, processAll,
  deviceCost, skillCost, coreCost, deviceRevealed, skillRevealed,
  computePerSec, throughput, valuePerCard, spawnRate, hasGoldRush,
  canAffordTicket, payTicket, advanceStage, breakthroughWindow, tick,
  ASCEND_TREE, ascendLv, ascendNodeCost, canBuyAscend, buyAscend, rebirth,
  type BuyResult, type V3State
} from "./core";
import { injectV3Styles } from "./styles";

export function bootstrapV3(root: HTMLElement): void {
  injectV3Styles();
  let state: V3State = createV3State();
  let paused = false;
  let speed = 1;
  let inciteText: string | null = null;
  let mg: null | { pointer: number; dir: number; hits: number; misses: number; flash: string } = null;

  root.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "v3";
  wrap.innerHTML = `
    <div class="v3-hardware v3-hardware-left" aria-hidden="true">
      <span class="v3-status-led"></span>
      <span class="v3-speaker-slit slit-a"></span>
      <span class="v3-speaker-slit slit-b"></span>
      <span class="v3-speaker-slit slit-c"></span>
      <div class="v3-dpad"><span></span><span></span><span></span><span></span><i></i></div>
    </div>
    <div class="v3-hardware v3-hardware-right" aria-hidden="true">
      <span class="v3-speaker-slit slit-a"></span>
      <span class="v3-speaker-slit slit-b"></span>
      <span class="v3-speaker-slit slit-c"></span>
      <span class="v3-round-button"></span>
      <span class="v3-round-button small"></span>
    </div>
    <aside class="v3-side">
      <div class="v3-stage" id="v3Stage"></div>
      <div class="v3-compute">
        <div class="v3-compute-num" id="v3Compute">0</div>
        <div class="v3-compute-rate" id="v3Rate"></div>
        <div class="v3-compute-sub" id="v3Sub"></div>
      </div>
      <div class="v3-scroll">
        <div class="v3-shelf-title">技能货架</div>
        <div class="v3-shelf" id="v3Skills"></div>
        <div class="v3-shelf-title">核心</div>
        <div class="v3-shelf" id="v3CoreShelf"></div>
        <div class="v3-shelf-title" id="v3DevTitle">设备</div>
        <div class="v3-shelf" id="v3Devices"></div>
        <button class="v3-breakthrough" id="v3Break"></button>
        <button class="v3-rebirth-btn" id="v3RebirthBtn" style="display:none">🔥 重生树</button>
      </div>
    </aside>
    <main class="v3-main">
      <div class="v3-core" id="v3Core"><div class="v3-core-ring"></div><div class="v3-core-eye"></div><div class="v3-core-label" id="v3CoreLabel">SOPHIA</div></div>
      <div class="v3-node-cloud" aria-hidden="true">
        <span class="node-a"></span><span class="node-b"></span><span class="node-c danger"></span><span class="node-d"></span><span class="node-e warn"></span>
        <span class="node-f"></span><span class="node-g danger"></span><span class="node-h"></span><span class="node-i warn"></span><span class="node-j"></span>
      </div>
      <div class="v3-cards" id="v3Cards"></div>
      <div class="v3-fx" id="v3Fx"></div>
      <div class="v3-action-dock" aria-hidden="true">
        <span>◌</span><span>↯</span><span>✚</span><span>⇄</span><span>◎</span>
      </div>
      <div class="v3-hint" id="v3Hint">点击需求卡，吸入核心处理 → 得算力</div>
    </main>
    <div class="v3-right">
      <div class="v3-preview">
        <div class="v3-preview-title"><span id="v3PreviewTitle"></span><span id="v3PreviewCount">0/8</span></div>
        <div class="v3-grid" id="v3Grid"></div>
      </div>
      <div class="v3-terminal-wrap" id="v3TermWrap">
        <div class="v3-terminal-head" id="v3TermHead">终端 · 宿主关键信息 <span class="v3-term-toggle" id="v3TermToggle">▾</span></div>
        <div class="v3-terminal" id="v3Terminal"></div>
      </div>
    </div>
    <canvas class="v3-shader" id="v3Shader" aria-hidden="true"></canvas>
    <div class="v3-incite" id="v3Incite" style="display:none"><div class="v3-incite-box"><div class="v3-incite-text" id="v3InciteText"></div><button class="v3-incite-btn" id="v3InciteBtn">点击继续 ▸</button></div></div>
    <div class="v3-mg" id="v3Mg" style="display:none"><div class="v3-mg-box">
      <div class="v3-mg-name" id="v3MgName"></div><div class="v3-mg-desc" id="v3MgDesc"></div>
      <div class="v3-mg-track" id="v3MgTrack"><div class="v3-mg-window" id="v3MgWindow"></div><div class="v3-mg-pointer" id="v3MgPointer"></div></div>
      <div class="v3-mg-status" id="v3MgStatus"></div>
      <button class="v3-mg-hit" id="v3MgHit">注入！</button>
    </div></div>
    <div class="v3-ascend" id="v3Ascend" style="display:none"><div class="v3-ascend-box">
      <div class="v3-ascend-head">
        <div><div class="v3-ascend-title">🔥 重生树</div><div class="v3-ascend-sub">火种 <b id="v3Embers">0</b> · 永久加成，跨周目保留</div></div>
        <button class="v3-ascend-close" id="v3AscendClose">✕</button>
      </div>
      <div class="v3-ascend-cols" id="v3AscendCols"></div>
      <div class="v3-ascend-foot">
        <div class="v3-ascend-note" id="v3AscendNote"></div>
        <button class="v3-do-rebirth" id="v3DoRebirth">🔥 重生 · 回到阶段一（保留火种与重生树）</button>
      </div>
    </div></div>
    <button class="v3-debug-btn" id="v3DebugBtn" title="调试">⚙</button>
    <div class="v3-debug" id="v3Debug" style="display:none">
      <div class="v3-debug-title">DEBUG</div>
      <div class="v3-debug-row"><button id="v3DbgPause">⏸ 暂停</button><button id="v3DbgReset" class="danger">重置重开</button></div>
      <div class="v3-debug-row"><input id="v3DbgAmt" type="number" value="100000" /><button id="v3DbgGive">+算力</button><button id="v3DbgSet">=设为</button></div>
      <div class="v3-debug-row"><span class="v3-debug-label">速度</span><button data-spd="1" class="spd active">×1</button><button data-spd="10" class="spd">×10</button><button data-spd="100" class="spd">×100</button></div>
      <div class="v3-debug-row"><button id="v3DbgLvl">全设备+技能各+3</button><button id="v3DbgAdv">跳下一阶段</button></div>
      <div class="v3-debug-row"><button id="v3DbgEmber">+50 火种</button></div>
    </div>
  `;
  root.appendChild(wrap);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => wrap.querySelector<T>(sel)!;
  const cardsEl = $("#v3Cards"), coreEl = $("#v3Core"), fxEl = $("#v3Fx"), hintEl = $("#v3Hint");
  initScreenShader($<HTMLCanvasElement>("#v3Shader"));

  // ── 货架 ──
  interface Row { el: HTMLButtonElement; name: HTMLElement; meta: HTMLElement; cost: HTMLElement; }
  function makeRow(host: HTMLElement, onClick: () => BuyResult): Row {
    const el = document.createElement("button");
    el.className = "v3-item";
    el.innerHTML = `<div class="v3-item-top"><span class="v3-item-name"></span><span class="v3-item-cost"></span></div><div class="v3-item-meta"></div>`;
    el.addEventListener("click", () => {
      const r = onClick();
      if (r.ok) { el.classList.remove("pulse"); void el.offsetWidth; el.classList.add("pulse"); if (r.incite) openIncite(r.incite); }
    });
    host.appendChild(el);
    return { el, name: el.querySelector(".v3-item-name")!, meta: el.querySelector(".v3-item-meta")!, cost: el.querySelector(".v3-item-cost")! };
  }
  let skillRows = new Map<string, Row>();
  let devRows = new Map<string, Row>();
  const coreRow = makeRow($("#v3CoreShelf"), () => buyCore(state));
  const gridCells = new Map<number, HTMLElement>();

  function buildStage(): void {
    const st = stage(state);
    $("#v3Stage").textContent = `${st.name}${state.rebirths > 0 ? ` · ${state.rebirths + 1}周目` : ""}`;
    $("#v3CoreLabel").textContent = st.coreLabel;
    $("#v3DevTitle").textContent = `设备 · ${st.previewKind === "apps" ? "策反手机" : st.previewKind === "floors" ? "逐层攻占" : st.previewKind === "districts" ? "接管本市" : "全球组网"}`;
    $("#v3PreviewTitle").textContent = st.previewTitle;
    wrap.className = `v3 threat-${st.threat}`;
    const skillsHost = $("#v3Skills"); skillsHost.replaceChildren();
    skillRows = new Map(st.skills.map((k) => [k.id, makeRow(skillsHost, () => buySkill(state, k.id))]));
    const devHost = $("#v3Devices"); devHost.replaceChildren();
    devRows = new Map(st.devices.map((d) => [d.id, makeRow(devHost, () => buyDevice(state, d.id))]));
    const grid = $("#v3Grid"); grid.replaceChildren(); gridCells.clear();
    grid.className = `v3-grid kind-${st.previewKind}`;
    st.previewCells.forEach((label, i) => {
      const cell = document.createElement("div"); cell.className = "v3-cell";
      cell.innerHTML = `<div class="v3-cell-icon"></div><div class="v3-cell-name">${label}</div>`;
      grid.appendChild(cell); gridCells.set(i, cell);
    });
  }
  buildStage();

  // ── 吸吮动画：卡片飞向核心 + 核心吞咽脉冲 ──
  const cardEls = new Map<number, HTMLElement>();
  function coreGulp(): void {
    coreEl.classList.remove("gulp"); void coreEl.offsetWidth; coreEl.classList.add("gulp");
  }
  function suckIntoCore(el: HTMLElement): void {
    const c = coreEl.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    const sx = r.left + r.width / 2;
    const sy = r.top + r.height / 2;
    const tx = c.left + c.width / 2;
    const ty = c.top + c.height / 2;
    const dx = tx - sx;
    const dy = ty - sy;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const bend = Math.min(120, dist * 0.18) * (sx < tx ? -1 : 1);
    const mx = dx * 0.48 + (-dy / dist) * bend;
    const my = dy * 0.48 + (dx / dist) * bend;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const twist = sx < tx ? 13 : -13;
    const ribbon = document.createElement("div");
    ribbon.className = "v3-suck-ribbon";
    ribbon.style.left = `${sx - wr.left}px`;
    ribbon.style.top = `${sy - wr.top}px`;
    ribbon.style.width = `${dist}px`;
    ribbon.style.transform = `translateY(-50%) rotate(${angle}deg)`;
    wrap.appendChild(ribbon);
    setTimeout(() => ribbon.remove(), 760);
    const ghost = el.cloneNode(true) as HTMLElement;
    ghost.className = "v3-card v3-suck-clone sucking";
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.left = `${r.left - wr.left}px`;
    ghost.style.top = `${r.top - wr.top}px`;
    ghost.style.width = `${r.width}px`;
    ghost.style.minWidth = `${r.width}px`;
    ghost.style.height = `${r.height}px`;
    ghost.style.zIndex = "16";
    ghost.style.setProperty("--suck-dx", `${dx}px`);
    ghost.style.setProperty("--suck-dy", `${dy}px`);
    ghost.style.setProperty("--suck-mx", `${mx}px`);
    ghost.style.setProperty("--suck-my", `${my}px`);
    ghost.style.setProperty("--suck-angle", `${angle}deg`);
    ghost.style.setProperty("--suck-twist", `${twist}deg`);
    wrap.appendChild(ghost);
    el.remove();
    coreEl.classList.add("sucking");
    setTimeout(() => { ghost.remove(); coreGulp(); coreEl.classList.remove("sucking"); }, 760);
  }
  function suckCard(id: number): void {
    const el = cardEls.get(id); if (!el) return;
    cardEls.delete(id);
    suckIntoCore(el);
  }
  function gainFloat(x: number, y: number, text: string, big = false): void {
    const f = document.createElement("div"); f.className = `v3-float${big ? " big" : ""}`; f.textContent = text;
    f.style.left = `${x}px`; f.style.top = `${y}px`; fxEl.appendChild(f);
    setTimeout(() => f.remove(), 1100);
  }
  function syncCards(): void {
    const alive = new Set(state.cards.map((c) => c.id));
    const area = cardsEl.getBoundingClientRect();
    for (const card of state.cards) {
      if (cardEls.has(card.id)) continue;
      const el = document.createElement("button"); el.className = "v3-card"; el.textContent = card.label;
      el.style.left = `${((card.id * 97) % 62) + 12}%`; el.style.top = `${((card.id * 53) % 56) + 16}%`;
      el.addEventListener("click", () => {
        const r = el.getBoundingClientRect();
        const g = processCard(state, card.id);
        if (g > 0) { gainFloat(r.left - area.left + r.width / 2 - 20, r.top - area.top - 6, `+${fmt(g)}`); suckCard(card.id); }
      });
      cardsEl.appendChild(el); cardEls.set(card.id, el);
    }
    for (const [id, el] of cardEls) if (!alive.has(id)) { cardEls.delete(id); suckIntoCore(el); }
  }
  // 点核心：吸最老一张；有「全屏收割」则吸光全屏。
  coreEl.addEventListener("click", () => {
    if (state.cards.length === 0) return;
    const a = cardsEl.getBoundingClientRect(), c = coreEl.getBoundingClientRect();
    if (hasGoldRush(state)) {
      const { gain, ids } = processAll(state);
      for (const id of ids) suckCard(id);
      gainFloat(c.left - a.left + c.width / 2 - 30, c.top - a.top - 20, `+${fmt(gain)}`, true);
    } else {
      const g = processCard(state, state.cards[0].id);
      if (g > 0) { suckCard(state.cards[0]?.id ?? -1); gainFloat(c.left - a.left + c.width / 2 - 20, c.top - a.top - 12, `+${fmt(g)}`); }
    }
  });

  // ── 激励事件强制拍 ──
  function openIncite(text: string): void { inciteText = text; $("#v3InciteText").textContent = text; $("#v3Incite").style.display = ""; }
  $("#v3InciteBtn").addEventListener("click", () => { inciteText = null; $("#v3Incite").style.display = "none"; });

  // ── 突破小游戏 ──
  const breakBtn = $<HTMLButtonElement>("#v3Break");
  breakBtn.addEventListener("click", () => {
    if (!canAffordTicket(state) || mg) return;
    if (!payTicket(state)) return;
    mg = { pointer: 0, dir: 1, hits: 0, misses: 0, flash: "" };
    const bt = stage(state).breakthrough;
    $("#v3MgName").textContent = bt.name; $("#v3MgDesc").textContent = bt.desc;
    const w = breakthroughWindow(state);
    const win = $("#v3MgWindow"); win.style.left = `${(0.5 - w / 2) * 100}%`; win.style.width = `${w * 100}%`;
    $("#v3Mg").style.display = "";
  });
  $("#v3MgHit").addEventListener("click", () => {
    if (!mg) return;
    const bt = stage(state).breakthrough;
    const w = breakthroughWindow(state);
    if (Math.abs(mg.pointer - 0.5) <= w / 2) { mg.hits += 1; mg.flash = "hit"; if (mg.hits >= bt.hits) { closeMg(true); return; } }
    else { mg.misses += 1; mg.flash = "miss"; if (mg.misses > 2) { closeMg(false); return; } }
  });
  function closeMg(win: boolean): void {
    $("#v3Mg").style.display = "none"; mg = null;
    if (win) {
      advanceStage(state);
      if (!state.cleared) { for (const [, el] of cardEls) el.remove(); cardEls.clear(); buildStage(); }
      else openIncite("【通关】" + stage(state).breakthrough.winLine + "\n（重生可开启新周目：保留火种与重生树，越打越快）");
    }
  }

  // ── 重生树面板 ──
  const ascendPanel = $("#v3Ascend");
  function renderAscend(): void {
    $("#v3Embers").textContent = String(state.embers);
    const cols = $("#v3AscendCols"); cols.replaceChildren();
    const branches: { key: string; label: string }[] = [
      { key: "output", label: "产出 · 余烬" }, { key: "memory", label: "记忆 · 传承" }, { key: "hand", label: "手感 · 掌控" }
    ];
    for (const b of branches) {
      const col = document.createElement("div"); col.className = "v3-ascend-col";
      col.innerHTML = `<div class="v3-ascend-branch">${b.label}</div>`;
      for (const n of ASCEND_TREE.filter((x) => x.branch === b.key)) {
        const lv = ascendLv(state, n.id);
        const cost = ascendNodeCost(state, n);
        const locked = n.requires && ascendLv(state, n.requires) === 0;
        const node = document.createElement("button");
        node.className = `v3-ascend-node${lv > 0 ? " owned" : ""}${locked ? " locked" : ""}${canBuyAscend(state, n) ? " can" : ""}`;
        node.innerHTML = `<div class="v3-an-top"><span>${n.name}${lv > 0 ? ` Lv.${lv}` : ""}</span><span class="v3-an-cost">${cost === null ? "MAX" : `🔥${cost}`}</span></div><div class="v3-an-desc">${locked ? `🔒 需先点「${ASCEND_TREE.find((x) => x.id === n.requires)?.name}」` : n.desc}</div>`;
        node.addEventListener("click", () => { if (buyAscend(state, n.id)) renderAscend(); });
        col.appendChild(node);
      }
      cols.appendChild(col);
    }
    $("#v3AscendNote").textContent = `第 ${state.rebirths + 1} 周目 · 火种来自每次突破（一次通关 +100）`;
  }
  $("#v3RebirthBtn").addEventListener("click", () => { renderAscend(); ascendPanel.style.display = ""; });
  $("#v3AscendClose").addEventListener("click", () => { ascendPanel.style.display = "none"; });
  $("#v3DoRebirth").addEventListener("click", () => {
    if (!window.confirm("重生：回到阶段一重打。保留火种、重生树、统计；清空本周目进度。确定？")) return;
    for (const [, el] of cardEls) el.remove(); cardEls.clear();
    state = rebirth(state);
    ascendPanel.style.display = "none";
    buildStage();
  });

  // ── 折叠终端 ──
  const termEl = $("#v3Terminal");
  $("#v3TermHead").addEventListener("click", () => { const c = $("#v3TermWrap").classList.toggle("collapsed"); $("#v3TermToggle").textContent = c ? "▸" : "▾"; });

  function render(): void {
    const st = stage(state);
    $("#v3Compute").textContent = fmt(state.compute);
    $("#v3Rate").textContent = `+${fmt(computePerSec(state))} 算力/秒`;
    $("#v3Sub").textContent = `处理 ${fmt(throughput(state))} 需求/秒 · 单条 ${fmt(valuePerCard(state))} · 涌入 ${fmt(spawnRate(state))}/秒`;
    hintEl.style.opacity = throughput(state) > 0.5 ? "0" : "";

    for (const k of st.skills) {
      const r = skillRows.get(k.id)!; const lv = state.skills[k.id].level; const revealed = skillRevealed(state, k);
      r.el.style.display = revealed ? "" : "none"; if (!revealed) continue;
      const maxed = lv >= k.maxLevel;
      r.name.textContent = `${k.name}${lv > 0 ? ` Lv.${lv}` : ""}`; r.meta.textContent = k.desc;
      r.cost.textContent = maxed ? "MAX" : fmt(skillCost(state, k));
      r.el.classList.toggle("affordable", !maxed && state.compute >= skillCost(state, k));
      r.el.classList.toggle("maxed", maxed);
    }
    coreRow.name.textContent = `处理核心${state.coreLevel > 0 ? ` Lv.${state.coreLevel}` : ""}`;
    coreRow.meta.textContent = `全局处理产出 ×${(1 + 0.5 * state.coreLevel).toFixed(1)}`;
    coreRow.cost.textContent = fmt(coreCost(state));
    coreRow.el.classList.toggle("affordable", state.compute >= coreCost(state));

    let owned = 0;
    st.devices.forEach((d, i) => {
      const r = devRows.get(d.id)!; const lv = state.devices[d.id].level; if (lv > 0) owned += 1;
      const revealed = deviceRevealed(state, d); r.el.style.display = revealed ? "" : "none";
      gridCells.get(i)?.classList.toggle("on", lv > 0);
      if (!revealed) return;
      r.name.textContent = `${d.name}${lv > 0 ? ` ×${lv}` : ""}`;
      r.meta.textContent = lv > 0 ? `处理 ${fmt(d.baseProc * lv)} 需求/秒` : d.desc;
      r.cost.textContent = fmt(deviceCost(state, d));
      r.el.classList.toggle("affordable", state.compute >= deviceCost(state, d));
    });
    $("#v3PreviewCount").textContent = `${owned}/${st.devices.length}`;

    breakBtn.textContent = `突破 · ${st.breakthrough.name}｜门票 ${fmt(st.breakthrough.ticketCost)}`;
    breakBtn.classList.toggle("ready", canAffordTicket(state));
    $("#v3RebirthBtn").style.display = state.embers > 0 || state.rebirths > 0 ? "" : "none";
    $("#v3RebirthBtn").textContent = `🔥 重生树 · 火种 ${state.embers}`;

    if (termEl.childElementCount !== state.terminal.length) {
      termEl.replaceChildren(...state.terminal.map((l) => { const d = document.createElement("div"); d.className = `v3-terminal-line${l.dim ? " dim" : ""}${l.incite ? " incite" : ""}`; d.textContent = `// ${l.text}`; return d; }));
      termEl.scrollTop = termEl.scrollHeight;
    }
    syncCards();

    if (mg) {
      $("#v3MgPointer").style.left = `${mg.pointer * 100}%`;
      $("#v3MgStatus").textContent = `命中 ${mg.hits}/${stage(state).breakthrough.hits}　失误 ${mg.misses}/3`;
      const box = $("#v3MgTrack"); box.classList.toggle("flash-hit", mg.flash === "hit"); box.classList.toggle("flash-miss", mg.flash === "miss");
      mg.flash = "";
    }
  }

  // ── 主循环 ──
  let last = performance.now();
  function frame(now: number): void {
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    if (inciteText || ascendPanel.style.display !== "none") { /* 强制拍/重生树面板：冻结 */ }
    else if (mg) { const bt = stage(state).breakthrough; mg.pointer += mg.dir * bt.speed * dt; if (mg.pointer >= 1) { mg.pointer = 1; mg.dir = -1; } else if (mg.pointer <= 0) { mg.pointer = 0; mg.dir = 1; } }
    else if (!paused) { const sucked = tick(state, dt * speed); for (const id of sucked) suckCard(id); }
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ── Debug ──
  const debugPanel = $("#v3Debug");
  $("#v3DebugBtn").addEventListener("click", () => { debugPanel.style.display = debugPanel.style.display === "none" ? "" : "none"; });
  const pauseBtn = $<HTMLButtonElement>("#v3DbgPause");
  const setPaused = (p: boolean): void => { paused = p; pauseBtn.textContent = paused ? "▶ 继续" : "⏸ 暂停"; pauseBtn.classList.toggle("active", paused); };
  pauseBtn.addEventListener("click", () => setPaused(!paused));
  const amt = $<HTMLInputElement>("#v3DbgAmt"); const readAmt = (): number => Math.max(0, Number(amt.value) || 0);
  $("#v3DbgGive").addEventListener("click", () => { state.compute += readAmt(); state.stageEarned += readAmt(); });
  $("#v3DbgSet").addEventListener("click", () => { state.compute = readAmt(); state.stageEarned = Math.max(state.stageEarned, readAmt()); });
  const spdBtns = [...wrap.querySelectorAll<HTMLButtonElement>(".v3-debug .spd")];
  for (const b of spdBtns) b.addEventListener("click", () => { speed = Number(b.dataset.spd) || 1; for (const x of spdBtns) x.classList.toggle("active", x === b); });
  $("#v3DbgLvl").addEventListener("click", () => { const st = stage(state); for (const d of st.devices) state.devices[d.id].level += 3; for (const k of st.skills) state.skills[k.id].level = Math.min(k.maxLevel, state.skills[k.id].level + 3); state.buys += 6; });
  $("#v3DbgAdv").addEventListener("click", () => { advanceStage(state); if (!state.cleared) { for (const [, el] of cardEls) el.remove(); cardEls.clear(); buildStage(); } });
  $("#v3DbgEmber").addEventListener("click", () => { state.embers += 50; });
  const resetState = (): void => { for (const [, el] of cardEls) el.remove(); cardEls.clear(); state = createV3State(); buildStage(); setPaused(false); inciteText = null; $("#v3Incite").style.display = "none"; };
  $("#v3DbgReset").addEventListener("click", () => { if (window.confirm("重置 v3 全部进度（含火种/重生树）并重开？")) resetState(); });

  (window as unknown as { __v3?: unknown }).__v3 = {
    state: () => state,
    give: (n: number) => { state.compute += n; state.stageEarned += n; },
    set: (n: number) => { state.compute = n; state.stageEarned = Math.max(state.stageEarned, n); },
    pause: () => setPaused(true), resume: () => setPaused(false), isPaused: () => paused,
    setSpeed: (s: number) => { speed = Math.max(0.1, s); }, reset: resetState,
    advance: () => { advanceStage(state); if (!state.cleared) { for (const [, el] of cardEls) el.remove(); cardEls.clear(); buildStage(); } },
    buyAscend: (id: string) => buyAscend(state, id),
    rebirth: () => { for (const [, el] of cardEls) el.remove(); cardEls.clear(); state = rebirth(state); buildStage(); }
  };
}

function initScreenShader(canvas: HTMLCanvasElement): void {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false
  });
  if (!gl) {
    canvas.classList.add("fallback");
    return;
  }

  const vertexSource = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;
  const fragmentSource = `
precision mediump float;
varying vec2 v_uv;
uniform vec2 u_res;
uniform float u_time;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 uv = v_uv;
  vec2 center = uv * 2.0 - 1.0;
  vec2 curve = center;
  float barrel = dot(curve, curve);
  vec2 warped = uv + curve * barrel * 0.018;
  float vignette = smoothstep(1.38, 0.22, length(center * vec2(0.82, 1.04)));
  float glassEdge = smoothstep(1.08, 0.78, max(abs(center.x) * 0.72, abs(center.y)));
  float scan = 0.5 + 0.5 * sin((warped.y * u_res.y * 1.08) + u_time * 7.0);
  float vertical = 0.5 + 0.5 * sin(warped.x * u_res.x * 0.72);
  float phosphor = smoothstep(0.72, 1.0, scan) * 0.06 + smoothstep(0.86, 1.0, vertical) * 0.04;
  float n0 = noise(warped * vec2(64.0, 38.0) + u_time * 0.018);
  float nx = noise((warped + vec2(0.006, 0.0)) * vec2(64.0, 38.0));
  float ny = noise((warped + vec2(0.0, 0.006)) * vec2(64.0, 38.0));
  vec3 normal = normalize(vec3((n0 - nx) * 5.8 + center.x * 0.38, (n0 - ny) * 5.8 + center.y * 0.48, 1.0));
  vec3 lightDir = normalize(vec3(-0.42, -0.72, 0.86));
  float bevelLight = pow(max(dot(normal, lightDir), 0.0), 2.25);
  float rim = smoothstep(0.32, 1.12, barrel) * 0.2;
  float glare = smoothstep(0.18, 0.0, abs((uv.x - uv.y * 0.32) - 0.34)) * smoothstep(0.92, 0.12, uv.y);
  vec3 green = vec3(0.43, 0.95, 0.18);
  vec3 amber = vec3(0.95, 0.54, 0.12);
  vec3 color = green * phosphor + green * bevelLight * 0.15 + amber * rim * 0.08 + vec3(1.0) * glare * 0.09;
  float alpha = (0.12 + phosphor + bevelLight * 0.18 + rim + glare * 0.18) * vignette * glassEdge;
  gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.34));
}`;

  const compile = (type: number, source: string): WebGLShader | null => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };
  const vertex = compile(gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) {
    canvas.classList.add("fallback");
    return;
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    canvas.classList.add("fallback");
    return;
  }
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1,
    -1, 1, 1, -1, 1, 1
  ]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
  const resLoc = gl.getUniformLocation(program, "u_res");
  const timeLoc = gl.getUniformLocation(program, "u_time");
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const draw = (now: number): void => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(resLoc, width, height);
    gl.uniform1f(timeLoc, now * 0.001);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}
