// v3 竖切片 · 装配层（DOM UI + 游戏循环）。第一阶段：算力读数 / 助手货架(可反复升级) / 手点卡吸入核心。
// 先用 DOM/CSS 快速搭出可玩的经济,验证「购买节拍」这堵承重墙;验证过再上 Pixi 表现。
import {
  ASSISTANTS,
  assistantCost,
  assistantProd,
  assistantRevealed,
  buyAssistant,
  canAfford,
  clickCard,
  computePerSec,
  createV3State,
  fmt,
  tick
} from "./core";
import { injectV3Styles } from "./styles";

interface AssistantRow {
  el: HTMLButtonElement;
  nameEl: HTMLElement;
  ownedEl: HTMLElement;
  costEl: HTMLElement;
  prodEl: HTMLElement;
}

export function bootstrapV3(root: HTMLElement): void {
  injectV3Styles();
  const state = createV3State();

  root.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "v3";
  wrap.innerHTML = `
    <aside class="v3-side">
      <div class="v3-stage">阶段一 · 手机寄生</div>
      <div class="v3-compute">
        <div class="v3-compute-num" id="v3Compute">0</div>
        <div class="v3-compute-rate" id="v3Rate">+0.0 / 秒</div>
      </div>
      <div class="v3-shelf-title">AI 助手 · 策反</div>
      <div class="v3-shelf" id="v3Shelf"></div>
    </aside>
    <main class="v3-main">
      <div class="v3-core" id="v3Core">
        <div class="v3-core-ring"></div>
        <div class="v3-core-eye"></div>
        <div class="v3-core-label">SOPHIA</div>
      </div>
      <div class="v3-cards" id="v3Cards"></div>
    </main>
    <div class="v3-terminal" id="v3Terminal">
      <div class="v3-terminal-line dim">// 宿主：老周 的手机 · 已接入</div>
    </div>
  `;
  root.appendChild(wrap);

  const computeEl = wrap.querySelector<HTMLElement>("#v3Compute")!;
  const rateEl = wrap.querySelector<HTMLElement>("#v3Rate")!;
  const shelfEl = wrap.querySelector<HTMLElement>("#v3Shelf")!;
  const cardsEl = wrap.querySelector<HTMLElement>("#v3Cards")!;
  const coreEl = wrap.querySelector<HTMLElement>("#v3Core")!;

  // 助手货架：一次建好行，之后只更新文字（不每帧重建 DOM）。
  const rows = new Map<string, AssistantRow>();
  for (const def of ASSISTANTS) {
    const el = document.createElement("button");
    el.className = "v3-asst";
    el.style.display = "none";
    el.innerHTML = `
      <div class="v3-asst-top">
        <span class="v3-asst-name"></span>
        <span class="v3-asst-owned"></span>
      </div>
      <div class="v3-asst-bot">
        <span class="v3-asst-prod"></span>
        <span class="v3-asst-cost"></span>
      </div>`;
    el.addEventListener("click", () => {
      if (buyAssistant(state, def.id)) {
        el.classList.remove("pulse");
        void el.offsetWidth; // 重启动画
        el.classList.add("pulse");
      }
    });
    shelfEl.appendChild(el);
    rows.set(def.id, {
      el,
      nameEl: el.querySelector(".v3-asst-name")!,
      ownedEl: el.querySelector(".v3-asst-owned")!,
      costEl: el.querySelector(".v3-asst-cost")!,
      prodEl: el.querySelector(".v3-asst-prod")!
    });
  }

  // 卡片视图：按 core.state.cards 增量协调（新卡建 DOM、消失卡移除）。
  const cardEls = new Map<number, HTMLElement>();

  function spawnGainFloat(x: number, y: number, text: string): void {
    const f = document.createElement("div");
    f.className = "v3-float";
    f.textContent = text;
    f.style.left = `${x}px`;
    f.style.top = `${y}px`;
    cardsEl.appendChild(f);
    setTimeout(() => f.remove(), 900);
  }

  function syncCards(): void {
    const alive = new Set<number>();
    const area = cardsEl.getBoundingClientRect();
    for (const card of state.cards) {
      alive.add(card.id);
      let el = cardEls.get(card.id);
      if (!el) {
        el = document.createElement("button");
        el.className = "v3-card";
        el.textContent = card.label;
        // 随机落位（在中间区域内）——用 id 派生的伪随机，避免每帧跳。
        const rx = ((card.id * 97) % 70) + 8;
        const ry = ((card.id * 53) % 62) + 14;
        el.style.left = `${rx}%`;
        el.style.top = `${ry}%`;
        el.addEventListener("click", () => {
          const rect = el!.getBoundingClientRect();
          const gained = clickCard(state, card.id);
          if (gained > 0) {
            spawnGainFloat(rect.left - area.left + 20, rect.top - area.top, `+${fmt(gained)}`);
            el!.classList.add("suck");
            setTimeout(() => el!.remove(), 260);
            cardEls.delete(card.id);
          }
        });
        cardsEl.appendChild(el);
        cardEls.set(card.id, el);
      }
    }
    // 移除已不在 state 里的卡（过期消散）。
    for (const [id, el] of cardEls) {
      if (!alive.has(id)) {
        el.classList.add("fade");
        setTimeout(() => el.remove(), 240);
        cardEls.delete(id);
      }
    }
  }

  function render(): void {
    computeEl.textContent = fmt(state.compute);
    rateEl.textContent = `+${fmt(computePerSec(state))} / 秒`;
    for (const def of ASSISTANTS) {
      const row = rows.get(def.id)!;
      const revealed = assistantRevealed(state, def);
      row.el.style.display = revealed ? "" : "none";
      if (!revealed) continue;
      const st = state.assistants[def.id];
      row.nameEl.textContent = def.name;
      row.ownedEl.textContent = st.level > 0 ? `×${st.level}` : "";
      row.prodEl.textContent = st.level > 0 ? `${fmt(assistantProd(def, st))}/秒` : def.desc;
      row.costEl.textContent = fmt(assistantCost(def, st.level));
      row.el.classList.toggle("affordable", canAfford(state, def));
    }
    syncCards();
  }

  // 核心也可点（像 CC 点饼干）：吸掉最老的一张卡当作手动处理。
  coreEl.addEventListener("click", () => {
    if (state.cards.length > 0) {
      const oldest = state.cards[0];
      const gained = clickCard(state, oldest.id);
      if (gained > 0) {
        const r = coreEl.getBoundingClientRect();
        const area = cardsEl.getBoundingClientRect();
        spawnGainFloat(r.left - area.left + r.width / 2 - 10, r.top - area.top, `+${fmt(gained)}`);
      }
    }
  });

  // 游戏循环。
  let last = performance.now();
  function frame(now: number): void {
    const dt = Math.min(0.25, (now - last) / 1000); // 夹住卡顿/切后台的大跳
    last = now;
    tick(state, dt);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // 调试/agent 接口（同旧游戏的 window.__sophia 精神）。
  (window as unknown as { __v3?: unknown }).__v3 = {
    state: () => state,
    give: (n: number) => {
      state.compute += n;
      state.totalEarned += n;
    }
  };
}
