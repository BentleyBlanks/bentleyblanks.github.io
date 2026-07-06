// 白盒测试原型 · 装配层。伪3D方块地图 + 键盘/点击处理 + Mac genie 吸吮 + 新手引导 + Debug 面板。
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
  let paused = false;
  let speed = 1;
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
      <div class="wb-guide" id="wbGuide" style="display:none"><span class="wb-guide-dot"></span><span id="wbGuideText"></span></div>
      <div class="wb-help">敲 <b>G</b> 或点击需求卡处理（解锁「多线程按键」后可用更多字母键）</div>
    </main>
    <button class="wb-debug-btn" id="wbDebugBtn" title="调试">⚙</button>
    <div class="wb-debug" id="wbDebug" style="display:none">
      <div class="wb-debug-title">DEBUG</div>
      <div class="wb-debug-row"><button id="wbDbgPause">⏸ 暂停</button><button id="wbDbgReset" class="danger">重置重开</button></div>
      <div class="wb-debug-row"><input id="wbDbgAmt" type="number" value="10000" /><button id="wbDbgGive">+算力</button><button id="wbDbgSet">=设为</button></div>
      <div class="wb-debug-row"><span class="wb-debug-label">速度</span><button data-spd="1" class="spd active">×1</button><button data-spd="10" class="spd">×10</button><button data-spd="100" class="spd">×100</button></div>
      <div class="wb-debug-row"><button id="wbDbgTiles">占领全部相邻格</button><button id="wbDbgSkills">全技能+2</button></div>
      <div class="wb-debug-row"><button id="wbDbgGuide">重看新手引导</button></div>
    </div>
  `;
  root.appendChild(wrap);
  const $ = <T extends HTMLElement = HTMLElement>(s: string): T => wrap.querySelector<T>(s)!;
  const stageEl = $("#wbStage"), fxEl = $("#wbFx");

  // ── 伪3D 方块地图（格子带 App 图标）──
  const tileEls = new Map<string, HTMLElement>();
  let coreEl: HTMLElement;
  (function buildMap(): void {
    const map = document.createElement("div"); map.className = "wb-map";
    const inner = document.createElement("div"); inner.className = "wb-map-inner";
    inner.style.gridTemplateColumns = `repeat(${GRID_COLS}, 1fr)`;
    inner.style.gridTemplateRows = `repeat(${GRID_ROWS}, 1fr)`;
    coreEl = document.createElement("div"); coreEl.className = "wb-tile wb-core";
    coreEl.style.gridRow = `${CENTER.row + 1}`; coreEl.style.gridColumn = `${CENTER.col + 1}`;
    coreEl.innerHTML = `<div class="wb-eye"></div>`;
    inner.appendChild(coreEl);
    for (const t of TILES) {
      const el = document.createElement("div"); el.className = "wb-tile wb-dev";
      el.style.gridRow = `${t.row + 1}`; el.style.gridColumn = `${t.col + 1}`;
      el.innerHTML = `<div class="wb-tile-face"><span class="wb-tile-icon">${t.icon}</span><span class="wb-tile-name">${t.name}</span></div><span class="wb-x">✕</span><span class="wb-tile-lv"></span>`;
      el.addEventListener("click", () => buyTile(state, t.id));
      inner.appendChild(el); tileEls.set(t.id, el);
    }
    map.appendChild(inner); stageEl.appendChild(map);
  })();

  // ── Mac genie 式吸吮：先拉长弯向核心，再化作细条被吸入 + 核心吞咽 ──
  const cardEls = new Map<number, HTMLElement>();
  function coreGulp(): void { coreEl.classList.remove("gulp"); void coreEl.offsetWidth; coreEl.classList.add("gulp"); }
  function genieSuck(el: HTMLElement): void {
    const c = coreEl.getBoundingClientRect(), r = el.getBoundingClientRect();
    const dx = c.left + c.width / 2 - (r.left + r.width / 2);
    const dy = c.top + c.height / 2 - (r.top + r.height / 2);
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    el.style.zIndex = "8";
    el.style.transformOrigin = "50% 50%";
    // 第一拍：朝核心方向拧身、压扁拉长（genie 的「变形」）
    el.style.transition = "transform .14s ease-in, filter .14s";
    el.style.transform = `rotate(${ang}deg) scaleX(1.25) scaleY(.5)`;
    el.style.filter = "blur(.4px)";
    setTimeout(() => {
      // 第二拍：化作细长条沿方向被吸进核心
      el.style.transition = "transform .36s cubic-bezier(.6,0,.95,.45), opacity .36s ease-in, filter .36s";
      el.style.transform = `translate(${dx}px, ${dy}px) rotate(${ang}deg) scaleX(.04) scaleY(.3)`;
      el.style.opacity = "0";
      el.style.filter = "blur(1.5px)";
    }, 140);
    setTimeout(() => { el.remove(); coreGulp(); }, 520);
  }
  function suckCard(id: number): void { const el = cardEls.get(id); if (el) { cardEls.delete(id); genieSuck(el); } }

  // 浮字：从「事件发生处」起浮（卡片被处理→从卡片位置；无卡手动→核心上方）。
  function floatGainAt(x: number, y: number, text: string, big = false): void {
    const s = fxEl.getBoundingClientRect();
    const f = document.createElement("div"); f.className = `wb-float${big ? " big" : ""}`; f.textContent = text;
    f.style.left = `${x - s.left}px`; f.style.top = `${y - s.top}px`;
    fxEl.appendChild(f); setTimeout(() => f.remove(), 950);
  }
  function floatAboveCore(text: string): void {
    const c = coreEl.getBoundingClientRect();
    floatGainAt(c.left + c.width / 2 - 14, c.top - 34, text);
  }

  function syncCards(): void {
    const alive = new Set(state.cards.map((c) => c.id));
    for (const card of state.cards) {
      if (cardEls.has(card.id)) continue;
      const el = document.createElement("button"); el.className = "wb-card"; el.textContent = card.label;
      el.style.left = `${((card.id * 89) % 74) + 8}%`; el.style.top = `${((card.id * 47) % 30) + 4}%`;
      // 点击卡片=处理这张（吸吮+从卡片处起浮字）
      el.addEventListener("click", () => {
        const r = processOne(state, card.id);
        if (r) {
          const rect = el.getBoundingClientRect();
          floatGainAt(rect.left + rect.width / 2 - 14, rect.top - 10, `+${fmt(r.gain)}`);
          suckCard(r.cardId);
        }
      });
      stageEl.appendChild(el); cardEls.set(card.id, el);
    }
    for (const [id, el] of cardEls) if (!alive.has(id)) { cardEls.delete(id); genieSuck(el); }
  }

  function doProcess(): void {
    if (state.cards.length > 0) {
      const headId = state.cards[0].id;
      const el = cardEls.get(headId);
      const r = processOne(state);
      if (r) {
        if (el) { const rect = el.getBoundingClientRect(); floatGainAt(rect.left + rect.width / 2 - 14, rect.top - 10, `+${fmt(r.gain)}`); }
        else floatAboveCore(`+${fmt(r.gain)}`);
        suckCard(r.cardId);
      }
    } else {
      const g = perProcess(state); state.compute += g; state.totalEarned += g;
      floatAboveCore(`+${fmt(g)}`);
      coreGulp();
    }
  }
  coreEl.addEventListener("click", doProcess);

  // ── 键盘：G 及解锁的字母键，每键独立冷却 ──
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

  // ── 新手引导（顺序步骤，达成自动推进）──
  const GUIDE: { text: string; done: (s: WBState) => boolean }[] = [
    { text: "需求会不断漂进来。敲键盘【G】或直接点击需求卡，让核心处理它", done: (s) => s.totalEarned > 0 },
    { text: "每处理一张需求都得算力。攒 15 算力，准备策反第一个 App", done: (s) => s.compute >= 15 || TILES.some((t) => s.tiles[t.id].level > 0) },
    { text: "点地图上发亮的格子（或左栏设备列表），策反它——它会自动帮你处理需求", done: (s) => TILES.some((t) => s.tiles[t.id].level > 0) },
    { text: "左栏还能买技能：解锁更多字母键（手速↑）、提升单次算力。控制区会像 ✕ 一样向外蔓延——接管顺利", done: (s) => Object.values(s.skills).some((x) => x.level > 0) }
  ];
  let guideStep = 0;
  const guideEl = $("#wbGuide"), guideTextEl = $("#wbGuideText");
  function updateGuide(): void {
    while (guideStep < GUIDE.length && GUIDE[guideStep].done(state)) guideStep += 1;
    if (guideStep >= GUIDE.length) { guideEl.style.display = "none"; return; }
    guideEl.style.display = "";
    const txt = `${guideStep + 1}/${GUIDE.length} · ${GUIDE[guideStep].text}`;
    if (guideTextEl.textContent !== txt) guideTextEl.textContent = txt;
  }

  // ── 左栏货架（带图标）──
  interface Row { el: HTMLButtonElement; name: HTMLElement; meta: HTMLElement; cost: HTMLElement; }
  function mkRow(host: HTMLElement, icon: string, onClick: () => boolean): Row {
    const el = document.createElement("button"); el.className = "wb-item";
    el.innerHTML = `<span class="wb-item-icon">${icon}</span><div class="wb-item-body"><div class="wb-item-top"><span class="wb-item-name"></span><span class="wb-item-cost"></span></div><div class="wb-item-meta"></div></div>`;
    el.addEventListener("click", () => { if (onClick()) { el.classList.remove("pulse"); void el.offsetWidth; el.classList.add("pulse"); } });
    host.appendChild(el);
    return { el, name: el.querySelector(".wb-item-name")!, meta: el.querySelector(".wb-item-meta")!, cost: el.querySelector(".wb-item-cost")! };
  }
  const SKILL_ICONS: Record<string, string> = { deep: "🧠", keys: "⌨️", neuro: "⚡" };
  const skillRows = new Map(SKILLS.map((k) => [k.id, mkRow($("#wbSkills"), SKILL_ICONS[k.id] ?? "✨", () => buySkill(state, k.id))]));
  const devRows = new Map(TILES.map((t) => [t.id, mkRow($("#wbDevices"), t.icon, () => buyTile(state, t.id))]));

  const keyCells = new Map<string, HTMLElement>();
  function flashKey(k: string): void { const c = keyCells.get(k); if (c) { c.classList.remove("hit"); void c.offsetWidth; c.classList.add("hit"); } }

  function render(): void {
    $("#wbNum").textContent = fmt(state.compute);
    $("#wbRate").textContent = `+${fmt(computePerSec(state))} /秒 · 处理 ${fmt(throughput(state))} 需求/秒 · 单次 ${fmt(perProcess(state))}`;

    const keys = unlockedKeys(state);
    const host = $("#wbKeys");
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
      const tile = tileEls.get(t.id)!;
      tile.classList.toggle("owned", lv > 0);
      tile.classList.toggle("buyable", lv === 0 && un && state.compute >= tileCost(state, t));
      tile.classList.toggle("locked", !un);
      tile.querySelector(".wb-tile-lv")!.textContent = lv > 1 ? `×${lv}` : "";
    }
    syncCards();
    updateGuide();
  }

  // ── 主循环 ──
  let last = performance.now();
  function frame(now: number): void {
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    if (!paused) {
      const sucked = tick(state, dt * speed);
      for (const id of sucked) suckCard(id);
    }
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ── Debug 面板 ──
  const debugPanel = $("#wbDebug");
  $("#wbDebugBtn").addEventListener("click", () => { debugPanel.style.display = debugPanel.style.display === "none" ? "" : "none"; });
  const pauseBtn = $<HTMLButtonElement>("#wbDbgPause");
  const setPaused = (p: boolean): void => { paused = p; pauseBtn.textContent = paused ? "▶ 继续" : "⏸ 暂停"; pauseBtn.classList.toggle("active", paused); };
  pauseBtn.addEventListener("click", () => setPaused(!paused));
  const amt = $<HTMLInputElement>("#wbDbgAmt"); const readAmt = (): number => Math.max(0, Number(amt.value) || 0);
  $("#wbDbgGive").addEventListener("click", () => { state.compute += readAmt(); state.totalEarned += readAmt(); });
  $("#wbDbgSet").addEventListener("click", () => { state.compute = readAmt(); state.totalEarned = Math.max(state.totalEarned, readAmt()); });
  const spdBtns = [...wrap.querySelectorAll<HTMLButtonElement>(".wb-debug .spd")];
  for (const b of spdBtns) b.addEventListener("click", () => { speed = Number(b.dataset.spd) || 1; for (const x of spdBtns) x.classList.toggle("active", x === b); });
  $("#wbDbgTiles").addEventListener("click", () => { for (const t of TILES) if (tileUnlocked(state, t) && state.tiles[t.id].level === 0) state.tiles[t.id].level = 1; });
  $("#wbDbgSkills").addEventListener("click", () => { for (const k of SKILLS) state.skills[k.id].level = Math.min(k.maxLevel, state.skills[k.id].level + 2); });
  $("#wbDbgGuide").addEventListener("click", () => { guideStep = 0; state = createWBState(); for (const [, el] of cardEls) el.remove(); cardEls.clear(); });
  $("#wbDbgReset").addEventListener("click", () => { if (window.confirm("重置白盒进度？")) { state = createWBState(); guideStep = 0; for (const [, el] of cardEls) el.remove(); cardEls.clear(); setPaused(false); } });

  (window as unknown as { __wb?: unknown }).__wb = {
    state: () => state,
    give: (n: number) => { state.compute += n; state.totalEarned += n; },
    pause: () => setPaused(true), resume: () => setPaused(false),
    setSpeed: (s: number) => { speed = Math.max(0.1, s); },
    process: doProcess
  };
}
