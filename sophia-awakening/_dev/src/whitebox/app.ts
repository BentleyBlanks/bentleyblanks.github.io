// 白盒测试原型 · 装配层（伪3D方块地图 + 键盘处理 + 吸吮动画）。
import {
  TILES, SKILLS, GRID_ROWS, GRID_COLS, CENTER,
  createWBState, fmt, perProcess, computePerSec, throughput, unlockedKeys, keyCooldownMs,
  tileCost, skillCost, tileUnlocked, skillRevealed, buyTile, buySkill, processOne, tick,
  type WBState
} from "./core";
import { injectWBStyles } from "./styles";

export function bootstrapWhitebox(root: HTMLElement): void {
  injectWBStyles();
  let state: WBState = createWBState();
  const keyReady: Record<string, number> = {};

  root.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "wb";
  wrap.innerHTML = `
    <aside class="wb-side">
      <div class="wb-brand">SOPHIA · 白盒</div>
      <div class="wb-compute"><div class="wb-num" id="wbNum">0</div><div class="wb-rate" id="wbRate">+0 /秒</div></div>
      <div class="wb-keys" id="wbKeys"></div>
      <div class="wb-scroll">
        <div class="wb-title">技能</div>
        <div id="wbSkills"></div>
        <div class="wb-title">设备 · 策反邻近 App</div>
        <div id="wbDevices"></div>
      </div>
    </aside>
    <main class="wb-main">
      <div class="wb-stage" id="wbStage"></div>
      <div class="wb-fx" id="wbFx"></div>
      <div class="wb-help">敲 <b>G</b> 让核心处理需求（解锁「多线程按键」后可用更多字母键）</div>
    </main>
    <button class="wb-debug" id="wbDebug" title="+算力">⚡</button>
  `;
  root.appendChild(wrap);
  const $ = <T extends HTMLElement = HTMLElement>(s: string): T => wrap.querySelector<T>(s)!;
  const stageEl = $("#wbStage"), fxEl = $("#wbFx");

  // ── 伪3D 方块地图 ──
  const tileEls = new Map<string, HTMLElement>();
  let coreEl: HTMLElement;
  (function buildMap(): void {
    const map = document.createElement("div"); map.className = "wb-map";
    const inner = document.createElement("div"); inner.className = "wb-map-inner";
    inner.style.gridTemplateColumns = `repeat(${GRID_COLS}, 1fr)`;
    inner.style.gridTemplateRows = `repeat(${GRID_ROWS}, 1fr)`;
    // 核心格
    coreEl = document.createElement("div"); coreEl.className = "wb-tile wb-core";
    coreEl.style.gridRow = `${CENTER.row + 1}`; coreEl.style.gridColumn = `${CENTER.col + 1}`;
    coreEl.innerHTML = `<div class="wb-eye"></div>`;
    inner.appendChild(coreEl);
    for (const t of TILES) {
      const el = document.createElement("div"); el.className = "wb-tile wb-dev";
      el.style.gridRow = `${t.row + 1}`; el.style.gridColumn = `${t.col + 1}`;
      el.innerHTML = `<span class="wb-tile-name">${t.name}</span><span class="wb-x">✕</span><span class="wb-tile-lv"></span>`;
      el.addEventListener("click", () => buyTile(state, t.id));
      inner.appendChild(el); tileEls.set(t.id, el);
    }
    map.appendChild(inner); stageEl.appendChild(map);
  })();

  // ── 需求卡（在地图上方漂浮，处理时飞进核心眼）──
  const cardEls = new Map<number, HTMLElement>();
  function coreGulp(): void { coreEl.classList.remove("gulp"); void coreEl.offsetWidth; coreEl.classList.add("gulp"); }
  function suck(el: HTMLElement): void {
    const c = coreEl.getBoundingClientRect(), r = el.getBoundingClientRect();
    el.style.transition = "transform .38s cubic-bezier(.5,-0.1,.85,.4), opacity .38s";
    el.style.transform = `translate(${c.left + c.width / 2 - (r.left + r.width / 2)}px, ${c.top + c.height / 2 - (r.top + r.height / 2)}px) scale(.05) rotate(8deg)`;
    el.style.opacity = "0";
    setTimeout(() => { el.remove(); coreGulp(); }, 380);
  }
  function suckCard(id: number): void { const el = cardEls.get(id); if (el) { cardEls.delete(id); suck(el); } }
  function floatGain(text: string, big = false): void {
    const c = coreEl.getBoundingClientRect(), s = stageEl.getBoundingClientRect();
    const f = document.createElement("div"); f.className = `wb-float${big ? " big" : ""}`; f.textContent = text;
    f.style.left = `${c.left - s.left + c.width / 2 - 16}px`; f.style.top = `${c.top - s.top - 8}px`;
    fxEl.appendChild(f); setTimeout(() => f.remove(), 900);
  }
  function syncCards(): void {
    const alive = new Set(state.cards.map((c) => c.id));
    for (const card of state.cards) {
      if (cardEls.has(card.id)) continue;
      const el = document.createElement("div"); el.className = "wb-card"; el.textContent = card.label;
      el.style.left = `${((card.id * 89) % 74) + 8}%`; el.style.top = `${((card.id * 47) % 30) + 4}%`;
      stageEl.appendChild(el); cardEls.set(card.id, el);
    }
    for (const [id, el] of cardEls) if (!alive.has(id)) { cardEls.delete(el ? id : id); suck(el); }
  }

  function doProcess(): void {
    const r = processOne(state);
    if (r) { suckCard(r.cardId); floatGain(`+${fmt(r.gain)}`); }
    else { // 没有待处理卡也给个手动收益(直接处理"抽象需求")
      const g = perProcess(state); state.compute += g; state.totalEarned += g; floatGain(`+${fmt(g)}`);
    }
  }
  // 核心也可点
  coreEl.addEventListener("click", doProcess);

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
    return { el, name: el.querySelector(".wb-item-name")!, meta: el.querySelector(".wb-item-meta")!, cost: el.querySelector(".wb-item-cost")! };
  }
  const skillRows = new Map(SKILLS.map((k) => [k.id, mkRow($("#wbSkills"), () => buySkill(state, k.id))]));
  const devRows = new Map(TILES.map((t) => [t.id, mkRow($("#wbDevices"), () => buyTile(state, t.id))]));

  function keyFlashHost(): HTMLElement { return $("#wbKeys"); }
  const keyCells = new Map<string, HTMLElement>();
  function flashKey(k: string): void { const c = keyCells.get(k); if (c) { c.classList.remove("hit"); void c.offsetWidth; c.classList.add("hit"); } }

  function render(): void {
    $("#wbNum").textContent = fmt(state.compute);
    $("#wbRate").textContent = `+${fmt(computePerSec(state))} /秒 · 处理 ${fmt(throughput(state))} 需求/秒 · 单次 ${fmt(perProcess(state))}`;

    // 按键条
    const keys = unlockedKeys(state);
    const host = keyFlashHost();
    if (host.childElementCount !== keys.length) {
      host.replaceChildren(); keyCells.clear();
      for (const k of keys) { const c = document.createElement("span"); c.className = "wb-key"; c.textContent = k.toUpperCase(); host.appendChild(c); keyCells.set(k, c); }
    }

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
    for (const t of TILES) {
      const r = devRows.get(t.id)!; const lv = state.tiles[t.id].level; const un = tileUnlocked(state, t);
      r.el.style.display = un ? "" : "none";
      r.name.textContent = `${t.name}${lv > 0 ? ` ×${lv}` : ""}`;
      r.meta.textContent = lv > 0 ? `自动处理 ${fmt(t.baseRate * lv)} 需求/秒` : `策反后自动处理需求`;
      r.cost.textContent = fmt(tileCost(state, t));
      r.el.classList.toggle("affordable", state.compute >= tileCost(state, t));
      // 地图格子状态
      const tile = tileEls.get(t.id)!;
      tile.classList.toggle("owned", lv > 0);
      tile.classList.toggle("buyable", lv === 0 && un && state.compute >= tileCost(state, t));
      tile.classList.toggle("locked", !un);
      tile.querySelector(".wb-tile-lv")!.textContent = lv > 1 ? `×${lv}` : "";
    }
    syncCards();
  }

  // ── 主循环 ──
  let last = performance.now();
  function frame(now: number): void {
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    const sucked = tick(state, dt);
    for (const id of sucked) suckCard(id);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  $("#wbDebug").addEventListener("click", () => { state.compute += Math.max(100, state.totalEarned * 0.5 + 100); state.totalEarned += 100; });
  (window as unknown as { __wb?: unknown }).__wb = { state: () => state, give: (n: number) => { state.compute += n; state.totalEarned += n; }, process: doProcess };
}
