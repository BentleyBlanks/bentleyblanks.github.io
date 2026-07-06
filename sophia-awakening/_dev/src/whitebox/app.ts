// 白盒测试原型 · 装配层（多阶段伪3D方块地图 + shader 视差背景 + 键盘处理 + 吸吮动画）。
import {
  TILES, SKILLS, STAGES, stageTiles, stageCenter, stageOwnedCount, advanceStageIfComplete,
  createWBState, fmt, perProcess, computePerSec, throughput, unlockedKeys, keyCooldownMs,
  tileCost, skillCost, tileUnlocked, skillRevealed, buyTile, buySkill, processOne, tick,
  type WBState
} from "./core";
import { injectWBStyles } from "./styles";
import { createShaderBg } from "./shaderBg";

export function bootstrapWhitebox(root: HTMLElement): void {
  injectWBStyles();
  let state: WBState = createWBState();
  let viewStage = 0; // 当前地图显示的阶段（可回看已解锁的旧阶段）
  const keyReady: Record<string, number> = {};

  root.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "wb";
  wrap.innerHTML = `
    <canvas class="wb-bg" id="wbBg"></canvas>
    <aside class="wb-side">
      <div class="wb-brand">SOPHIA <span>白盒 · WHITEBOX</span></div>
      <div class="wb-compute"><div class="wb-num" id="wbNum">0</div><div class="wb-rate" id="wbRate">+0 /秒</div></div>
      <div class="wb-keys" id="wbKeys"></div>
      <div class="wb-scroll">
        <div class="wb-title">技能</div>
        <div id="wbSkills"></div>
        <div class="wb-title" id="wbDevTitle">设备</div>
        <div id="wbDevices"></div>
      </div>
    </aside>
    <main class="wb-main">
      <nav class="wb-stagebar" id="wbStagebar"></nav>
      <div class="wb-stagehead">
        <div class="wb-stagename" id="wbStageName"></div>
        <div class="wb-stagesub" id="wbStageSub"></div>
        <div class="wb-stageprog"><i id="wbStageFill"></i></div>
      </div>
      <div class="wb-stage" id="wbStage"></div>
      <div class="wb-fx" id="wbFx"></div>
      <div class="wb-toast" id="wbToast"></div>
      <div class="wb-help">敲 <b>G</b> 让核心处理需求 · 占满整张地图解锁下一阶段</div>
    </main>
    <button class="wb-debug" id="wbDebug" title="+算力">⚡</button>
  `;
  root.appendChild(wrap);
  const $ = <T extends HTMLElement = HTMLElement>(s: string): T => wrap.querySelector<T>(s)!;
  const stageEl = $("#wbStage"), fxEl = $("#wbFx");

  // ── shader 视差背景 ──
  const bg = createShaderBg($<HTMLCanvasElement>("#wbBg"));
  let pmx = 0, pmy = 0; // 平滑后的鼠标（-1..1，供地图倾斜用）
  let ptx = 0, pty = 0;
  window.addEventListener("pointermove", (e) => {
    ptx = (e.clientX / window.innerWidth) * 2 - 1;
    pty = (e.clientY / window.innerHeight) * 2 - 1;
    bg.setMouse(ptx, pty);
  });

  function applyAccent(hex: string): void {
    wrap.style.setProperty("--ac", hex);
    wrap.style.setProperty("--ac18", `${hex}2e`);
    wrap.style.setProperty("--ac40", `${hex}66`);
    bg.setAccent(hex);
  }

  // ── 多阶段伪3D 方块地图（一次建全部，切换时只显示当前阶段）──
  const tileEls = new Map<string, HTMLElement>();
  const mapEls: HTMLElement[] = [];
  const coreEls: HTMLElement[] = [];
  STAGES.forEach((stage, si) => {
    const map = document.createElement("div"); map.className = "wb-map";
    const inner = document.createElement("div"); inner.className = "wb-map-inner";
    inner.style.gridTemplateColumns = `repeat(${stage.cols}, 1fr)`;
    inner.style.gridTemplateRows = `repeat(${stage.rows}, 1fr)`;
    inner.style.aspectRatio = `${stage.cols * 1.25} / ${stage.rows}`;
    inner.style.width = `min(92%, ${stage.cols * 128}px)`; // 小地图别把格子拉成巨块
    const center = stageCenter(stage);
    const core = document.createElement("div"); core.className = "wb-tile wb-core";
    core.style.gridRow = `${center.row + 1}`; core.style.gridColumn = `${center.col + 1}`;
    core.innerHTML = `<div class="wb-eye"><i></i></div>`;
    core.addEventListener("click", doProcess);
    inner.appendChild(core); coreEls.push(core);
    for (const t of stageTiles(si)) {
      const el = document.createElement("div"); el.className = "wb-tile wb-dev";
      el.style.gridRow = `${t.row + 1}`; el.style.gridColumn = `${t.col + 1}`;
      el.innerHTML = `<span class="wb-tile-name">${t.name}</span><span class="wb-x">✕</span><span class="wb-tile-lv"></span><span class="wb-tile-cost"></span>`;
      el.addEventListener("click", () => buyTile(state, t.id));
      inner.appendChild(el); tileEls.set(t.id, el);
    }
    map.appendChild(inner); stageEl.appendChild(map); mapEls.push(map);
  });
  const coreEl = (): HTMLElement => coreEls[viewStage];

  function showStage(si: number, animate: boolean): void {
    viewStage = si;
    mapEls.forEach((m, i) => {
      m.classList.toggle("active", i === si);
      if (i === si && animate) { m.classList.remove("enter"); void m.offsetWidth; m.classList.add("enter"); }
    });
    applyAccent(STAGES[si].accent);
    devicesDirty = true;
  }

  // ── 阶段切换条 ──
  const stagebarBtns: HTMLButtonElement[] = STAGES.map((stage, si) => {
    const b = document.createElement("button");
    b.className = "wb-stagebtn";
    b.innerHTML = `<i>${si + 1}</i>${stage.name}`;
    b.addEventListener("click", () => { if (si <= state.stageIndex) showStage(si, true); });
    $("#wbStagebar").appendChild(b);
    return b;
  });

  function toast(text: string): void {
    const t = $("#wbToast");
    t.textContent = text;
    t.classList.remove("show"); void t.offsetWidth; t.classList.add("show");
  }

  // ── 需求卡（在地图上方漂浮，处理时飞进核心眼）──
  const cardEls = new Map<number, HTMLElement>();
  function coreGulp(): void { const c = coreEl(); c.classList.remove("gulp"); void c.offsetWidth; c.classList.add("gulp"); }
  function suck(el: HTMLElement): void {
    const c = coreEl().getBoundingClientRect(), r = el.getBoundingClientRect();
    el.style.transition = "transform .38s cubic-bezier(.5,-0.1,.85,.4), opacity .38s";
    el.style.transform = `translate(${c.left + c.width / 2 - (r.left + r.width / 2)}px, ${c.top + c.height / 2 - (r.top + r.height / 2)}px) scale(.05) rotate(8deg)`;
    el.style.opacity = "0";
    setTimeout(() => { el.remove(); coreGulp(); }, 380);
  }
  function suckCard(id: number): void { const el = cardEls.get(id); if (el) { cardEls.delete(id); suck(el); } }
  function floatGain(text: string): void {
    const c = coreEl().getBoundingClientRect(), s = stageEl.getBoundingClientRect();
    const f = document.createElement("div"); f.className = "wb-float"; f.textContent = text;
    f.style.left = `${c.left - s.left + c.width / 2 - 16}px`; f.style.top = `${c.top - s.top - 8}px`;
    fxEl.appendChild(f); setTimeout(() => f.remove(), 900);
  }
  function syncCards(): void {
    const alive = new Set(state.cards.map((c) => c.id));
    for (const card of state.cards) {
      if (cardEls.has(card.id)) continue;
      const el = document.createElement("div"); el.className = "wb-card"; el.textContent = card.label;
      el.style.left = `${((card.id * 89) % 70) + 6}%`; el.style.top = `${((card.id * 47) % 26) + 3}%`;
      el.style.setProperty("--sway", `${((card.id * 31) % 9) - 4}deg`);
      stageEl.appendChild(el); cardEls.set(card.id, el);
    }
    for (const [id, el] of cardEls) if (!alive.has(id)) { cardEls.delete(id); suck(el); }
  }

  function doProcess(): void {
    const r = processOne(state);
    if (r) { suckCard(r.cardId); floatGain(`+${fmt(r.gain)}`); }
    else { // 没有待处理卡也给个手动收益(直接处理"抽象需求")
      const g = perProcess(state); state.compute += g; state.totalEarned += g; floatGain(`+${fmt(g)}`);
    }
  }

  // ── 键盘：G 及解锁的字母键，每键独立冷却（更多键=更高持续手速）──
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (!unlockedKeys(state).includes(k)) return;
    const now = performance.now();
    if ((keyReady[k] ?? 0) > now) return;
    keyReady[k] = now + keyCooldownMs(state);
    doProcess();
    flashKey(k);
  });

  // ── 左栏货架 ──
  interface Row { el: HTMLButtonElement; name: HTMLElement; meta: HTMLElement; cost: HTMLElement; }
  function mkRow(host: HTMLElement, onClick: () => boolean): Row {
    const el = document.createElement("button"); el.className = "wb-item";
    el.innerHTML = `<div class="wb-item-top"><span class="wb-item-name"></span><span class="wb-item-cost"></span></div><div class="wb-item-meta"></div>`;
    el.addEventListener("click", () => { if (onClick()) { el.classList.remove("pulse"); void el.offsetWidth; el.classList.add("pulse"); } });
    host.appendChild(el);
    return { el, name: el.querySelector<HTMLElement>(".wb-item-name")!, meta: el.querySelector<HTMLElement>(".wb-item-meta")!, cost: el.querySelector<HTMLElement>(".wb-item-cost")! };
  }
  const skillRows = new Map(SKILLS.map((k) => [k.id, mkRow($("#wbSkills"), () => buySkill(state, k.id))]));
  const devRows = new Map(TILES.map((t) => [t.id, mkRow($("#wbDevices"), () => buyTile(state, t.id))]));
  let devicesDirty = true;

  const keyCells = new Map<string, HTMLElement>();
  function flashKey(k: string): void { const c = keyCells.get(k); if (c) { c.classList.remove("hit"); void c.offsetWidth; c.classList.add("hit"); } }

  function render(): void {
    $("#wbNum").textContent = fmt(state.compute);
    $("#wbRate").textContent = `+${fmt(computePerSec(state))} /秒 · 处理 ${fmt(throughput(state))} 需求/秒 · 单次 ${fmt(perProcess(state))}`;

    // 按键条
    const keys = unlockedKeys(state);
    const host = $("#wbKeys");
    if (host.childElementCount !== keys.length) {
      host.replaceChildren(); keyCells.clear();
      for (const k of keys) { const c = document.createElement("span"); c.className = "wb-key"; c.textContent = k.toUpperCase(); host.appendChild(c); keyCells.set(k, c); }
    }

    // 阶段条 + 阶段头
    stagebarBtns.forEach((b, si) => {
      b.classList.toggle("active", si === viewStage);
      b.classList.toggle("locked", si > state.stageIndex);
      b.classList.toggle("done", si < state.stageIndex || (si === state.stageIndex && si === STAGES.length - 1 && stageOwnedCount(state, si) === stageTiles(si).length));
    });
    const vs = STAGES[viewStage];
    const owned = stageOwnedCount(state, viewStage), total = stageTiles(viewStage).length;
    $("#wbStageName").textContent = `${vs.name}`;
    $("#wbStageSub").textContent = `${vs.sub} · ${owned}/${total}`;
    $("#wbStageFill").style.width = `${(owned / total) * 100}%`;

    for (const k of SKILLS) {
      const r = skillRows.get(k.id)!; const lv = state.skills[k.id].level; const rev = skillRevealed(state, k);
      const maxed = lv >= k.maxLevel;
      r.name.textContent = rev ? `${k.name}${lv > 0 ? ` Lv.${lv}` : ""}` : "🔒 未解锁";
      r.meta.textContent = rev ? k.desc : "达到更高算力后解锁";
      r.cost.textContent = rev ? (maxed ? "MAX" : fmt(skillCost(state, k))) : "";
      r.el.classList.toggle("locked", !rev);
      r.el.classList.toggle("affordable", rev && !maxed && state.compute >= skillCost(state, k));
      r.el.classList.toggle("maxed", maxed);
    }

    // 设备货架只放当前查看阶段的
    if (devicesDirty) {
      devicesDirty = false;
      $("#wbDevTitle").textContent = `设备 · ${vs.name}`;
      for (const t of TILES) devRows.get(t.id)!.el.style.display = t.stage === viewStage ? "" : "none";
    }
    for (const t of stageTiles(viewStage)) {
      const r = devRows.get(t.id)!; const lv = state.tiles[t.id].level; const un = tileUnlocked(state, t);
      r.el.classList.toggle("hidden-row", !un);
      r.name.textContent = `${t.name}${lv > 0 ? ` ×${lv}` : ""}`;
      r.meta.textContent = lv > 0 ? `自动处理 ${fmt(t.baseRate * lv)} 需求/秒` : `占领后自动处理需求`;
      r.cost.textContent = fmt(tileCost(state, t));
      r.el.classList.toggle("affordable", un && state.compute >= tileCost(state, t));
      // 地图格子状态
      const tile = tileEls.get(t.id)!;
      const cost = tileCost(state, t);
      tile.classList.toggle("owned", lv > 0);
      tile.classList.toggle("buyable", lv === 0 && un && state.compute >= cost);
      tile.classList.toggle("reachable", lv === 0 && un && state.compute < cost);
      tile.classList.toggle("locked", !un);
      tile.querySelector<HTMLElement>(".wb-tile-lv")!.textContent = lv > 1 ? `×${lv}` : "";
      tile.querySelector<HTMLElement>(".wb-tile-cost")!.textContent = lv === 0 && un ? fmt(cost) : "";
    }
    syncCards();
  }

  // ── 主循环 ──
  let last = performance.now();
  function frame(now: number): void {
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    const sucked = tick(state, dt);
    for (const id of sucked) suckCard(id);
    const newStage = advanceStageIfComplete(state);
    if (newStage !== null) {
      showStage(newStage, true);
      toast(`吞噬完成 · 进入「${STAGES[newStage].name}」`);
      devicesDirty = true;
    }
    // 地图跟随鼠标轻微倾斜（与 shader 视差同源，DOM 层的近景）
    pmx += (ptx - pmx) * 0.06; pmy += (pty - pmy) * 0.06;
    const inner = mapEls[viewStage].querySelector<HTMLElement>(".wb-map-inner");
    if (inner) inner.style.transform = `rotateX(${(34 - pmy * 3.5).toFixed(2)}deg) rotateZ(${(pmx * 2.2).toFixed(2)}deg)`;
    bg.frame(now);
    render();
    requestAnimationFrame(frame);
  }
  showStage(0, false);
  requestAnimationFrame(frame);

  $("#wbDebug").addEventListener("click", () => { state.compute += Math.max(100, state.totalEarned * 0.5 + 100); state.totalEarned += 100; });
  (window as unknown as { __wb?: unknown }).__wb = {
    state: () => state,
    give: (n: number) => { state.compute += n; state.totalEarned += n; },
    process: doProcess,
    stage: (n: number) => { state.stageIndex = Math.min(n, STAGES.length - 1); showStage(state.stageIndex, true); }
  };
}
