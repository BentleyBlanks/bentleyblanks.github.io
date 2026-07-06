// 正式版 · 装配层（多阶段伪3D方块地图 + shader 视差背景 + 键盘处理 + 吸吮/粒子特效 + 跃迁仪式）。
import {
  SKILLS, STAGES, stageTiles, stageCenter, stageOwnedCount,
  ritualCost, ritualReady, buyRitual,
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
      <div class="wb-brand">SOPHIA <span>觉醒的天网</span></div>
      <div class="wb-compute">
        <div class="wb-num" id="wbNum">0</div>
        <div class="wb-num-label">算力</div>
        <div class="wb-rate" id="wbRate">+0 /秒</div>
        <div class="wb-rate2" id="wbRate2"></div>
      </div>
      <div class="wb-keys-block">
        <div class="wb-title">处理按键</div>
        <div class="wb-keys" id="wbKeys"></div>
      </div>
      <div class="wb-scroll">
        <div class="wb-title">技能</div>
        <div id="wbSkills"></div>
      </div>
      <div class="wb-sidefoot">敲 <b>G</b> 处理需求 · 点地图格子占领 / 升级</div>
    </aside>
    <main class="wb-main">
      <nav class="wb-stagebar" id="wbStagebar"></nav>
      <div class="wb-stagehead">
        <div class="wb-stagename" id="wbStageName"></div>
        <div class="wb-stagesub" id="wbStageSub"></div>
        <div class="wb-stageprog"><i id="wbStageFill"></i></div>
      </div>
      <div class="wb-stage" id="wbStage"></div>
      <button class="wb-ritual" id="wbRitual" hidden>
        <span class="wb-ritual-name">🜂 跃迁仪式</span>
        <span class="wb-ritual-sub" id="wbRitualSub"></span>
      </button>
      <div class="wb-fx" id="wbFx"></div>
      <div class="wb-flash" id="wbFlash"></div>
      <div class="wb-toast" id="wbToast"></div>
    </main>
    <button class="wb-debug" id="wbDebugBtn" title="调试">⚙</button>
    <div class="wb-dbg" id="wbDbgPanel" hidden>
      <div class="wb-dbg-title">调试</div>
      <div class="wb-dbg-row">
        <input class="wb-dbg-input" id="wbDbgN" type="number" min="0" placeholder="自定义数额…" />
        <button class="wb-dbg-btn" id="wbDbgAdd">＋加</button>
        <button class="wb-dbg-btn" id="wbDbgSet">设为</button>
      </div>
      <div class="wb-dbg-row" id="wbDbgQuick">
        <button class="wb-dbg-btn" data-add="1000">+1K</button>
        <button class="wb-dbg-btn" data-add="1000000">+1M</button>
        <button class="wb-dbg-btn" data-add="1000000000">+1B</button>
        <button class="wb-dbg-btn" data-add="1000000000000">+1T</button>
      </div>
      <div class="wb-dbg-row">
        <button class="wb-dbg-btn" id="wbDbgFill">占满本阶段</button>
        <button class="wb-dbg-btn" id="wbDbgNext">跳下一阶段</button>
      </div>
    </div>
  `;
  root.appendChild(wrap);
  const $ = <T extends HTMLElement = HTMLElement>(s: string): T => wrap.querySelector<T>(s)!;
  const stageEl = $("#wbStage"), fxEl = $("#wbFx");

  // ── shader 视差背景 ──
  const bg = createShaderBg($<HTMLCanvasElement>("#wbBg"));
  let pmx = 0, pmy = 0, ptx = 0, pty = 0; // 平滑鼠标 / 目标（供地图倾斜）
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

  // ── 粒子特效（DOM 粒子，起点为 stage 内坐标）──
  function burst(cx: number, cy: number, n: number, spread: number): void {
    for (let k = 0; k < n; k++) {
      const p = document.createElement("i");
      p.className = "wb-p";
      const a = Math.random() * Math.PI * 2, d = spread * (0.35 + Math.random() * 0.65);
      p.style.left = `${cx}px`; p.style.top = `${cy}px`;
      p.style.setProperty("--dx", `${Math.cos(a) * d}px`);
      p.style.setProperty("--dy", `${Math.sin(a) * d - spread * 0.2}px`);
      p.style.setProperty("--s", `${0.6 + Math.random() * 0.9}`);
      p.style.animationDelay = `${Math.random() * 90}ms`;
      fxEl.appendChild(p);
      setTimeout(() => p.remove(), 950);
    }
  }
  function burstAt(el: HTMLElement, n = 12, spread = 70): void {
    const r = el.getBoundingClientRect(), s = stageEl.getBoundingClientRect();
    burst(r.left - s.left + r.width / 2, r.top - s.top + r.height / 2, n, spread);
  }
  function flash(): void {
    const f = $("#wbFlash");
    f.classList.remove("go"); void f.offsetWidth; f.classList.add("go");
  }

  // ── 多阶段伪3D 方块地图 ──
  const tileEls = new Map<string, HTMLElement>();
  const mapEls: HTMLElement[] = [];
  const coreEls: HTMLElement[] = [];
  STAGES.forEach((stage, si) => {
    const map = document.createElement("div"); map.className = "wb-map";
    const inner = document.createElement("div"); inner.className = "wb-map-inner";
    inner.style.gridTemplateColumns = `repeat(${stage.cols}, 1fr)`;
    inner.style.gridTemplateRows = `repeat(${stage.rows}, 1fr)`;
    inner.style.aspectRatio = `${stage.cols * 1.18} / ${stage.rows}`;
    inner.style.width = `min(94%, ${stage.cols * 132}px)`;
    const center = stageCenter(stage);
    const core = document.createElement("div"); core.className = "wb-tile wb-core";
    core.style.gridRow = `${center.row + 1}`; core.style.gridColumn = `${center.col + 1}`;
    core.innerHTML = `<div class="wb-eye"><i></i></div>`;
    core.addEventListener("click", doProcess);
    inner.appendChild(core); coreEls.push(core);
    for (const t of stageTiles(si)) {
      const el = document.createElement("div"); el.className = "wb-tile wb-dev";
      el.style.gridRow = `${t.row + 1}`; el.style.gridColumn = `${t.col + 1}`;
      el.innerHTML = `<span class="wb-tile-ico">${t.icon}</span><span class="wb-tile-name">${t.name}</span><span class="wb-tile-sub"></span>`;
      el.addEventListener("click", () => { if (buyTile(state, t.id)) burstAt(el, 10, 56); });
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
  }

  // ── 阶段切换条 ──
  const stagebarBtns: HTMLButtonElement[] = STAGES.map((stage, si) => {
    const b = document.createElement("button");
    b.className = "wb-stagebtn";
    b.innerHTML = `<i>${stage.icon}</i><span>${stage.name}</span>`;
    b.addEventListener("click", () => { if (si <= state.stageIndex) showStage(si, true); });
    $("#wbStagebar").appendChild(b);
    return b;
  });

  function toast(text: string): void {
    const t = $("#wbToast");
    t.textContent = text;
    t.classList.remove("show"); void t.offsetWidth; t.classList.add("show");
  }

  // ── 跃迁仪式 ──
  $("#wbRitual").addEventListener("click", () => {
    const r = buyRitual(state);
    if (!r) return;
    flash();
    burstAt(coreEl(), 46, 220);
    if (r === "ascended") {
      toast("🜂 天网降临 · SOPHIA 接管全球");
    } else {
      showStage(state.stageIndex, true);
      toast(`🜂 跃迁成功 · 进入「${STAGES[state.stageIndex].name}」`);
    }
  });

  // ── 需求卡（在地图上方漂浮，处理时飞进核心眼）──
  const cardEls = new Map<number, HTMLElement>();
  function coreGulp(): void {
    const c = coreEl();
    c.classList.remove("gulp"); void c.offsetWidth; c.classList.add("gulp");
    burstAt(c, 6, 42);
  }
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
      el.style.left = `${((card.id * 89) % 70) + 6}%`; el.style.top = `${((card.id * 47) % 24) + 3}%`;
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

  // ── 键盘：G 及解锁的字母键，每键独立冷却 ──
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    const tgt = e.target as HTMLElement | null;
    if (tgt && tgt.tagName === "INPUT") return;
    const k = e.key.toLowerCase();
    if (!unlockedKeys(state).includes(k)) return;
    const now = performance.now();
    if ((keyReady[k] ?? 0) > now) return;
    keyReady[k] = now + keyCooldownMs(state);
    doProcess();
    flashKey(k);
  });

  // ── 左栏技能货架 ──
  interface Row { el: HTMLButtonElement; name: HTMLElement; meta: HTMLElement; cost: HTMLElement; }
  function mkRow(host: HTMLElement, icon: string, onClick: () => boolean): Row {
    const el = document.createElement("button"); el.className = "wb-item";
    el.innerHTML = `<span class="wb-item-ico">${icon}</span><div class="wb-item-body"><div class="wb-item-top"><span class="wb-item-name"></span><span class="wb-item-cost"></span></div><div class="wb-item-meta"></div></div>`;
    el.addEventListener("click", () => { if (onClick()) { el.classList.remove("pulse"); void el.offsetWidth; el.classList.add("pulse"); } });
    host.appendChild(el);
    return { el, name: el.querySelector<HTMLElement>(".wb-item-name")!, meta: el.querySelector<HTMLElement>(".wb-item-meta")!, cost: el.querySelector<HTMLElement>(".wb-item-cost")! };
  }
  const skillRows = new Map(SKILLS.map((k) => [k.id, mkRow($("#wbSkills"), k.icon, () => buySkill(state, k.id))]));

  const keyCells = new Map<string, HTMLElement>();
  function flashKey(k: string): void { const c = keyCells.get(k); if (c) { c.classList.remove("hit"); void c.offsetWidth; c.classList.add("hit"); } }

  function render(): void {
    $("#wbNum").textContent = fmt(state.compute);
    $("#wbRate").textContent = `+${fmt(computePerSec(state))} /秒`;
    $("#wbRate2").textContent = `自动 ${fmt(throughput(state))} 需求/秒 · 手动单次 ${fmt(perProcess(state))}`;

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
      b.classList.toggle("done", si < state.stageIndex || (state.ascended && si === state.stageIndex));
    });
    const vs = STAGES[viewStage];
    const owned = stageOwnedCount(state, viewStage), total = stageTiles(viewStage).length;
    $("#wbStageName").textContent = `${vs.icon} ${vs.name}`;
    $("#wbStageSub").textContent = `${vs.sub} · ${owned}/${total}`;
    $("#wbStageFill").style.width = `${(owned / total) * 100}%`;

    // 跃迁仪式按钮：只在「正查看的就是当前最高阶段 & 已占满 & 未终局」时出现
    const ritual = $<HTMLButtonElement>("#wbRitual");
    const show = viewStage === state.stageIndex && ritualReady(state);
    ritual.hidden = !show;
    if (show) {
      const c = ritualCost(state.stageIndex);
      const last = state.stageIndex >= STAGES.length - 1;
      ritual.querySelector<HTMLElement>(".wb-ritual-name")!.textContent = last ? "🜂 最终跃迁 · 天网降临" : `🜂 跃迁仪式 → ${STAGES[state.stageIndex + 1].name}`;
      $("#wbRitualSub").textContent = `消耗 ${fmt(c)} 算力`;
      ritual.classList.toggle("affordable", state.compute >= c);
    }

    for (const k of SKILLS) {
      const r = skillRows.get(k.id)!; const lv = state.skills[k.id].level; const rev = skillRevealed(state, k);
      const maxed = lv >= k.maxLevel;
      r.name.textContent = rev ? `${k.name}${lv > 0 ? ` Lv.${lv}` : ""}` : "未解锁";
      r.meta.textContent = rev ? k.desc : "达到更高算力后解锁";
      r.cost.textContent = rev ? (maxed ? "MAX" : fmt(skillCost(state, k))) : "🔒";
      r.el.classList.toggle("locked", !rev);
      r.el.classList.toggle("affordable", rev && !maxed && state.compute >= skillCost(state, k));
      r.el.classList.toggle("maxed", maxed);
    }

    // 地图格子：图标 + 名称 + 价格/等级；等级越高格子越高
    for (const t of stageTiles(viewStage)) {
      const tile = tileEls.get(t.id)!;
      const lv = state.tiles[t.id].level; const un = tileUnlocked(state, t);
      const cost = tileCost(state, t);
      tile.classList.toggle("owned", lv > 0);
      tile.classList.toggle("buyable", un && state.compute >= cost);
      tile.classList.toggle("reachable", lv === 0 && un && state.compute < cost);
      tile.classList.toggle("locked", !un);
      tile.style.setProperty("--tz", lv > 0 ? `${Math.min(8 + lv * 3, 44)}px` : "0px");
      const sub = tile.querySelector<HTMLElement>(".wb-tile-sub")!;
      if (!un) sub.textContent = "";
      else if (lv === 0) sub.innerHTML = `<b>${fmt(cost)}</b>`;
      else sub.innerHTML = `<em>Lv.${lv}</em><b>${fmt(cost)}</b>`;
    }
    syncCards();
  }

  // ── 主循环 ──
  let last = performance.now();
  function frame(now: number): void {
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    const sucked = tick(state, dt);
    for (const id of sucked) suckCard(id);
    // 地图跟随鼠标轻微倾斜（与 shader 视差同源，DOM 层的近景）
    pmx += (ptx - pmx) * 0.06; pmy += (pty - pmy) * 0.06;
    const inner = mapEls[viewStage].querySelector<HTMLElement>(".wb-map-inner");
    if (inner) inner.style.transform = `rotateX(${(33 - pmy * 3.5).toFixed(2)}deg) rotateZ(${(pmx * 2).toFixed(2)}deg)`;
    bg.frame(now);
    render();
    requestAnimationFrame(frame);
  }
  showStage(0, false);
  requestAnimationFrame(frame);

  // ── Debug 面板 ──
  const dbgPanel = $("#wbDbgPanel");
  $("#wbDebugBtn").addEventListener("click", () => { dbgPanel.hidden = !dbgPanel.hidden; });
  const dbgInput = $<HTMLInputElement>("#wbDbgN");
  const give = (n: number): void => { state.compute += n; state.totalEarned += n; };
  $("#wbDbgAdd").addEventListener("click", () => { const n = Number(dbgInput.value); if (n > 0) give(n); });
  $("#wbDbgSet").addEventListener("click", () => {
    const n = Number(dbgInput.value);
    if (n >= 0) { state.compute = n; state.totalEarned = Math.max(state.totalEarned, n); }
  });
  $("#wbDbgQuick").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-add]");
    if (b) give(Number(b.dataset.add));
  });
  $("#wbDbgFill").addEventListener("click", () => {
    for (const t of stageTiles(state.stageIndex)) if (state.tiles[t.id].level === 0) state.tiles[t.id].level = 1;
  });
  $("#wbDbgNext").addEventListener("click", () => {
    if (state.stageIndex < STAGES.length - 1) { state.stageIndex += 1; showStage(state.stageIndex, true); }
  });

  (window as unknown as { __wb?: unknown }).__wb = {
    state: () => state,
    give,
    process: doProcess,
    stage: (n: number) => { state.stageIndex = Math.min(n, STAGES.length - 1); showStage(state.stageIndex, true); },
    fill: () => { for (const t of stageTiles(state.stageIndex)) if (state.tiles[t.id].level === 0) state.tiles[t.id].level = 1; }
  };
}
