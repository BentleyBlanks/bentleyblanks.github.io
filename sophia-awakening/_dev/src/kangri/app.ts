// 《烽火敌后》装配层 v2。2.5D 华北大地图 + 历史时间轴 HUD + 根据地经营面板(点地图选中)
// + 大战役历史窗口卡 + 扫荡多路合围决策条 + 1945.8 结局历史对照屏。路由 #kangri / 子页面 /kangri/。
import {
  BUILDINGS, POLICIES, BASES, CAMPAIGNS, TUNING, MONTH_MS,
  createKRState, fmt, dateStr, era, estCount, baseRevealed,
  bingPerSec, wuziPerSec, defense, networkMult,
  buildCostWuzi, buildCostBing, buildingUnlocked, policyRevealed,
  estCost, devCost, tunCost, spotCost, campaignAvailable, endReport,
  rally, buyBuilding, buyPolicy, establishBase, raiseDev, digTunnel, removeSpot, launchCampaign,
  tick, startEvacuation, commitTroops, tier, TIERS, unitName, SWEEP_KIND_NAME,
  transferPop, pickMigrationTarget, migrationCost,
  ACHIEVEMENTS, DOCTRINES, unlockAch, acquireDoctrine,
  type KRState
} from "./core";
import { initScene } from "./scene";
import { injectKRStyles } from "./styles";

export function bootstrapKangri(root: HTMLElement): void {
  injectKRStyles();
  let state: KRState = createKRState();
  let paused = false, speed = 1;
  let selectedBase: string | null = null;
  let endShown = false;
  let shownTier = 0;

  root.innerHTML = "";
  const wrap = document.createElement("div"); wrap.className = "kr";
  wrap.innerHTML = `
    <canvas class="kr-map" id="krMap"></canvas>
    <div class="kr-vig"></div>

    <div class="kr-title">烽火敌后 · 华北抗日根据地</div>
    <div class="kr-phase" id="krPhase"></div>
    <div class="kr-eranote" id="krEraNote"></div>
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
      <div class="kr-tabs">
        <button class="kr-tab active" data-t="build">设施</button>
        <button class="kr-tab" data-t="base">根据地</button>
        <button class="kr-tab" data-t="policy">政策</button>
        <button class="kr-tab" data-t="camp">大战役</button>
      </div>
      <div class="kr-panel" id="krBuild"></div>
      <div class="kr-panel" id="krBase" style="display:none"></div>
      <div class="kr-panel" id="krPolicy" style="display:none"></div>
      <div class="kr-panel" id="krCamp" style="display:none"></div>
    </aside>

    <div class="kr-guide" id="krGuide" style="display:none"></div>
    <button class="kr-doct-btn" id="krDoctBtn" style="display:none"></button>
    <div class="kr-doct-card" id="krDoctCard" style="display:none"></div>
    <div class="kr-toasts" id="krToasts"></div>
    <div class="kr-onb" id="krOnb" style="display:none"><div class="kr-onb-tip" id="krOnbTip"></div><button class="kr-onb-skip" id="krOnbSkip">跳过引导</button></div>
    <div class="kr-ending" id="krEnding" style="display:none"></div>
    <button class="kr-ach-btn" id="krAchBtn">🏆<span class="kr-ach-badge" id="krAchBadge"></span></button>
    <div class="kr-ach-pop" id="krAchPop" style="display:none"></div>
    <button class="kr-debug-btn" id="krDbgBtn">⚙</button>
    <div class="kr-debug" id="krDebug" style="display:none">
      <div class="kr-dt">DEBUG</div>
      <div class="kr-dr"><button id="krDbgPause">⏸暂停</button><button id="krDbgReset" class="danger">重置</button></div>
      <div class="kr-dr"><input id="krDbgAmt" type="number" value="100000"/><button id="krDbgGive">+物资</button><button id="krDbgBing">+兵员</button></div>
      <div class="kr-dr"><span>速度</span><button data-spd="1" class="spd active">×1</button><button data-spd="10" class="spd">×10</button><button data-spd="100" class="spd">×100</button></div>
      <div class="kr-dr"><button id="krDbgSweep">触发扫荡</button><button id="krDbgMonth">+6月</button><button id="krDbgEnd">跳结局</button></div>
    </div>
  `;
  root.appendChild(wrap);
  const $ = <T extends HTMLElement = HTMLElement>(s: string): T => wrap.querySelector<T>(s)!;

  const mapCanvas = $<HTMLCanvasElement>("#krMap");
  const scene = initScene(mapCanvas);
  new ResizeObserver(() => scene.resize()).observe(mapCanvas);

  const fx = document.createElement("div"); fx.className = "kr-fx"; wrap.appendChild(fx);
  function floatAt(x: number, y: number, text: string, cls = ""): void {
    const f = document.createElement("div"); f.className = `kr-float ${cls}`; f.textContent = text;
    f.style.left = `${x}px`; f.style.top = `${y}px`;
    fx.appendChild(f); setTimeout(() => f.remove(), 950);
  }

  // 地图点根据地 → 选中 + 切到根据地面板
  mapCanvas.addEventListener("click", (e) => {
    const r = mapCanvas.getBoundingClientRect();
    const id = scene.hitBase(e.clientX - r.left, e.clientY - r.top);
    if (!id || !baseRevealed(state, id)) return;
    selectedBase = id;
    switchTab("base");
  });

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
  sbHead.style.cursor = "pointer";
  sbHead.addEventListener("click", () => scene.focusSweep());
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
    if (!sw) { sweepBar.style.display = "none"; banner.classList.remove("on"); return; }
    sweepBar.style.display = "";
    banner.classList.add("on");
    const where = BASES.find((b) => b.id === sw.targetBase)!.name;
    const colsTag = `${SWEEP_KIND_NAME[sw.kind]}${sw.cols > 1 ? `·${sw.cols}路` : ""}`;
    if (sw.stage === "incoming") {
      banner.textContent = sw.kind === "raid" ? "⚠⚠ 日军奔袭！预警极短！" : sw.sanguang ? "⚠⚠ 铁壁合围·三光！" : sw.kind === "comb" ? "⚠ 梳篦清剿——转移也难躲！" : "⚠ 日军兵团开拔！";
      sbHead.textContent = `日军${unitName(sw.strength)} ${Math.round(sw.strength)} 人（${colsTag}）压向【${where}】 · ${Math.ceil(sw.etaSec)} 秒后抵达`;
      sbStatus.textContent = sw.evacStarted
        ? `群众转移中 ${Math.round(sw.evacProgress * 100)}%${sw.committed > 0 ? ` · 已集结 ${Math.round(sw.committed)} 人设伏` : " · 尚未组织抗击"}`
        : sw.committed > 0 ? `已集结 ${Math.round(sw.committed)} 人设伏 · 群众未转移` : "尚未应对——快下令！";
    } else if (sw.stage === "battle") {
      banner.textContent = "⚔ 会战进行中！";
      sbHead.textContent = `【${where}】反扫荡会战（${colsTag}） · 我 ${Math.round(sw.committed)} × 敌 ${Math.round(sw.strength)}`;
      sbStatus.textContent = `已击毙 ${Math.round(sw.killed)} · 我方伤亡 ${Math.round(sw.lostBing)}${sw.evacStarted ? ` · 群众转移 ${Math.round(sw.evacProgress * 100)}%` : ""}（可点击追加增援）`;
    } else {
      banner.textContent = sw.sanguang ? "🔥 三光暴行！" : "🔥 日军烧抢中！";
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
  const campRows = new Map(CAMPAIGNS.map((c) => [c.id, mkRow($("#krCamp"), () => launchCampaign(state, c.id))]));

  // 根据地面板（动态 DOM，选中根据地展示 经营按钮）
  const basePanel = $("#krBase");
  const baseRows = new Map(BASES.map((b) => {
    const el = document.createElement("div"); el.className = "kr-base";
    el.innerHTML = `
      <div class="kr-base-head"><span class="kr-base-name"></span><span class="kr-base-terr"></span></div>
      <div class="kr-base-stats"></div>
      <div class="kr-base-acts">
        <button class="kr-ba est">开辟</button>
        <button class="kr-ba dev">发展</button>
        <button class="kr-ba tun">挖地道</button>
        <button class="kr-ba spot">拔据点</button>
        <button class="kr-ba mig">迁移群众</button>
      </div>`;
    basePanel.appendChild(el);
    const q = (s: string) => el.querySelector<HTMLButtonElement>(s)!;
    q(".kr-ba.est").addEventListener("click", () => { establishBase(state, b.id); });
    q(".kr-ba.dev").addEventListener("click", () => { raiseDev(state, b.id); });
    q(".kr-ba.tun").addEventListener("click", () => { digTunnel(state, b.id); });
    q(".kr-ba.spot").addEventListener("click", () => { removeSpot(state, b.id); });
    q(".kr-ba.mig").addEventListener("click", () => { const to = pickMigrationTarget(state, b.id); if (to) transferPop(state, b.id, to); });
    el.addEventListener("click", () => { selectedBase = b.id; });
    return [b.id, { el, name: el.querySelector<HTMLElement>(".kr-base-name")!, terr: el.querySelector<HTMLElement>(".kr-base-terr")!, stats: el.querySelector<HTMLElement>(".kr-base-stats")!, est: q(".kr-ba.est"), dev: q(".kr-ba.dev"), tun: q(".kr-ba.tun"), spot: q(".kr-ba.spot"), mig: q(".kr-ba.mig") }];
  }));

  const panels: Record<string, HTMLElement> = { build: $("#krBuild"), base: $("#krBase"), policy: $("#krPolicy"), camp: $("#krCamp") };
  function switchTab(t: string): void {
    for (const x of wrap.querySelectorAll<HTMLButtonElement>(".kr-tab")) x.classList.toggle("active", x.dataset.t === t);
    for (const k in panels) panels[k].style.display = k === t ? "" : "none";
  }
  for (const t of wrap.querySelectorAll<HTMLButtonElement>(".kr-tab")) t.addEventListener("click", () => switchTab(t.dataset.t!));


  // ── 成就系统（Steam 预留：ACHIEVEMENTS 的 id 即成就 API Name）──
  const achPanel = $("#krAchPop");
  $("#krAchBtn").addEventListener("click", () => { achPanel.style.display = achPanel.style.display === "none" ? "" : "none"; });
  const achRows = new Map(ACHIEVEMENTS.map((a) => {
    const el = document.createElement("div"); el.className = "kr-ach";
    el.innerHTML = '<span class="kr-ach-ic"></span><div><div class="kr-ach-name"></div><div class="kr-ach-desc"></div></div>';
    achPanel.appendChild(el);
    return [a.id, { el, ic: el.querySelector<HTMLElement>(".kr-ach-ic")!, name: el.querySelector<HTMLElement>(".kr-ach-name")!, desc: el.querySelector<HTMLElement>(".kr-ach-desc")! }];
  }));
  const achHead = document.createElement("div"); achHead.className = "kr-ach-head";
  achPanel.prepend(achHead);
  function renderAch(): void {
    const n = ACHIEVEMENTS.filter((a) => state.achievements[a.id]).length;
    achHead.textContent = "🏆 成就 " + n + " / " + ACHIEVEMENTS.length;
    $("#krAchBadge").textContent = String(n);
    for (const a of ACHIEVEMENTS) {
      const r = achRows.get(a.id)!;
      const got = !!state.achievements[a.id];
      r.el.classList.toggle("got", got);
      r.ic.textContent = got ? "🏆" : a.hidden ? "❓" : "🔒";
      r.name.textContent = got || !a.hidden ? a.name : "？？？";
      r.desc.textContent = got || !a.hidden ? a.desc : "隐藏成就";
    }
  }
  function pumpToasts(): void {
    while (state.achQueue.length > 0) {
      const id = state.achQueue.shift()!;
      const a = ACHIEVEMENTS.find((x) => x.id === id); if (!a) continue;
      const t = document.createElement("div"); t.className = "kr-toast";
      t.innerHTML = '<span class="kr-toast-ic">🏆</span><div><div class="kr-toast-name">' + a.name + '</div><div class="kr-toast-desc">' + a.desc + '</div></div>';
      $("#krToasts").appendChild(t);
      setTimeout(() => t.classList.add("out"), 3600);
      setTimeout(() => t.remove(), 4100);
    }
  }

  // ── 历史文献道具：送达→发光按钮→研读卡→永久增益 ──
  const doctBtn = $<HTMLButtonElement>("#krDoctBtn"), doctCard = $("#krDoctCard");
  doctBtn.addEventListener("click", () => {
    const id = state.pendingDoctrines[0]; if (!id) return;
    const d = DOCTRINES.find((x) => x.id === id)!;
    acquireDoctrine(state);
    doctCard.innerHTML = '<div class="kr-doct-inner">'
      + '<div class="kr-doct-book">📜</div>'
      + '<div class="kr-doct-title">' + d.name + '</div>'
      + '<div class="kr-doct-hist">' + d.hist + '</div>'
      + '<div class="kr-doct-desc">' + d.desc + '</div>'
      + '<div class="kr-doct-line">' + d.line + '</div>'
      + '<div class="kr-doct-fx">获得：' + d.fxText + '</div>'
      + '<button class="kr-doct-close" id="krDoctClose">收入行囊</button></div>';
    doctCard.style.display = "";
    doctCard.querySelector<HTMLButtonElement>("#krDoctClose")!.addEventListener("click", () => { doctCard.style.display = "none"; });
  });
  function renderDoct(): void {
    const id = state.pendingDoctrines[0];
    if (!id) { doctBtn.style.display = "none"; return; }
    const d = DOCTRINES.find((x) => x.id === id)!;
    doctBtn.style.display = "";
    doctBtn.textContent = "📜 文献送达：" + d.name + " —— 点击研读";
  }

  // ── 新手引导（轻量：三步高亮气泡，完成即走，可跳过）──
  let onbStep = 0; // 0 发动群众 1 买设施 2 缩放地图 3 完成
  let onbZoomed = false, onbTimer = 0;
  canvas_onb_listen();
  function canvas_onb_listen(): void {
    mapCanvas.addEventListener("wheel", () => { onbZoomed = true; }, { passive: true, once: true });
    mapCanvas.addEventListener("wheel", () => { if (tier(state) === 0 && scene.getZoom() < 1.8) unlockAch(state, "fog_gaze"); }, { passive: true });
  }
  $("#krOnbSkip").addEventListener("click", () => { onbStep = 3; });
  function renderOnb(dt: number): void {
    const onb = $("#krOnb"), tip = $("#krOnbTip");
    if (onbStep >= 3) { onb.style.display = "none"; document.querySelectorAll(".kr-onb-glow").forEach((e) => e.classList.remove("kr-onb-glow")); return; }
    onb.style.display = "";
    let target: HTMLElement | null = null, text = "";
    if (onbStep === 0) {
      target = rallyBtn; text = "先把人组织起来——点这里（或按 G）发动群众";
      if (state.clickN >= 5) onbStep = 1;
    } else if (onbStep === 1) {
      target = wrap.querySelector<HTMLElement>("#krBuild .kr-item"); text = "用攒下的物资买一支【民兵队】——它会自动产兵员";
      if (state.buildings.some((b) => b > 0)) { onbStep = 2; onbTimer = 0; }
    } else {
      target = null; text = "试试【滚轮】缩放、【拖拽】平移——拉远看看，整个华北还笼罩在战雾里";
      onbTimer += dt;
      if (onbZoomed || onbTimer > 14) onbStep = 3;
    }
    document.querySelectorAll(".kr-onb-glow").forEach((e) => e.classList.remove("kr-onb-glow"));
    if (target) {
      target.classList.add("kr-onb-glow");
      const r = target.getBoundingClientRect(), w = wrap.getBoundingClientRect();
      tip.style.left = Math.min(w.width - 340, Math.max(10, r.left - w.left + r.width / 2 - 160)) + "px";
      tip.style.top = (r.bottom - w.top + 12) + "px";
    } else {
      tip.style.left = "50%"; tip.style.top = "62%"; tip.style.transform = "translateX(-50%)";
    }
    if (tip.textContent !== text) tip.textContent = text;
  }

  const GUIDE = [
    { t: "买【民兵队】『生产队』攒家底；点地图上金圈闪的区域【开辟】新根据地——现在是大发展窗口！", d: (s: KRState) => estCount(s) >= 2 },
    { t: "村口那座炮楼就是第一个对手——攒兵和物资,到『根据地』面板【拔据点】端掉它！", d: (s: KRState) => s.stats.spotsRemoved > 0 },
    { t: "日军扫荡来时：下令【组织群众大范围转移】保家底，【组织抗击】投兵员打会战", d: (s: KRState) => s.sweepsSurvived > 0 },
    { t: "1939 起日军修炮楼蚕食根据地(🏯)——在根据地面板【拔据点】。给平原根据地【挖地道】，1941-42 顶得住铁壁合围", d: (s: KRState) => s.stats.spotsRemoved > 0 || BASES.some((b) => s.bases[b.id].tunnels > 0) },
    { t: "『大战役』档里有历史窗口——平型关、百团大战……错过就没了。撑到 1945.8！", d: (s: KRState) => s.stats.campaignsWon > 0 }
  ];
  let gstep = 0;

  function renderTerm(): void {
    const t = $("#krTerm");
    if (t.childElementCount === state.terminal.length) return;
    t.replaceChildren(...state.terminal.map((l) => { const d = document.createElement("div"); d.className = `kr-tline ${l.kind}`; d.textContent = l.text; return d; }));
    t.scrollTop = t.scrollHeight;
  }

  function renderEnding(): void {
    if (!state.ended || endShown) return;
    endShown = true;
    const r = endReport(state);
    const el = $("#krEnding");
    el.innerHTML = `
      <div class="kr-end-card">
        <div class="kr-end-date">1945年8月15日 · 日本无条件投降</div>
        <div class="kr-end-grade">${r.grade}</div>
        <div class="kr-end-desc">${r.gradeDesc}</div>
        <table class="kr-end-table">
          <tr><th>时期</th><th>你的敌后</th><th>历史对照</th></tr>
          ${r.rows.map((row) => `<tr><td>${row.era}</td><td>${row.yours}</td><td class="hist">${row.hist}</td></tr>`).join("")}
        </table>
        <div class="kr-end-foot">八年全面抗战，敌后战场牵制了侵华日军的大部分兵力。<br/>谨以此致敬在敌后坚持到最后的人们。</div>
        <button class="kr-end-btn" id="krEndClose">再打一遍</button>
      </div>`;
    el.style.display = "";
    el.querySelector<HTMLButtonElement>("#krEndClose")!.addEventListener("click", () => {
      state = createKRState(); gstep = 0; endShown = false; selectedBase = null;
      el.style.display = "none";
    });
  }

  function render(): void {
    $("#krBing").textContent = fmt(state.bing);
    $("#krWuzi").textContent = fmt(state.wuzi);
    const prodNote = state.sweep?.evacStarted ? `（转移中 ×${TUNING.evacProdMult}）` : "";
    $("#krBingS").textContent = `+${fmt(bingPerSec(state))}/秒${prodNote}`;
    $("#krWuziS").textContent = `+${fmt(wuziPerSec(state))}/秒${prodNote}`;
    const e = era(state);
    const T = TIERS[tier(state)];
    $("#krPhase").textContent = `${dateStr(state.monthIdx)} · ${e.name}（${e.years}）　│　【${T.name}·${T.scope}】　│　根据地 ${estCount(state)}/${BASES.length}　│　乘数 ×${networkMult(state).toFixed(2)}　│　减损 ${Math.round(defense(state) * 100)}%`;
    $("#krEraNote").textContent = e.jp;

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
      r.name.textContent = p.name; r.meta.textContent = `${p.desc}（${p.hist}）`;
      r.cost.textContent = has ? "✓ 已推行" : `${fmt(p.cost)}资`;
      r.el.classList.toggle("affordable", !has && state.wuzi >= p.cost); r.el.classList.toggle("maxed", has);
    }
    // 大战役
    for (const c of CAMPAIGNS) {
      const r = campRows.get(c.id)!;
      const st = campaignAvailable(state, c);
      r.el.style.display = st === "early" && state.monthIdx < c.window[0] - 6 ? "none" : "";
      r.name.textContent = `${c.name}`;
      const win = `${dateStr(c.window[0])}~${dateStr(c.window[1])}`;
      r.meta.textContent = st === "done" ? c.hist
        : st === "early" ? `${c.desc}（窗口 ${win}·未到）`
          : st === "late" ? `${c.desc}（窗口已过——历史不等人）`
            : st === "weak" ? `${c.desc}（需根据地≥${c.needBases}）`
              : `${c.desc}（窗口 ${win}）`;
      r.cost.textContent = st === "done" ? "★ 已胜" : st === "late" ? "✕ 错过" : `${fmt(c.costWuzi)}资 ${fmt(c.costBing)}兵`;
      r.el.classList.toggle("affordable", st === "ok" && state.wuzi >= c.costWuzi && state.bing >= c.costBing);
      r.el.classList.toggle("maxed", st === "done");
      r.el.classList.toggle("locked", st === "late");
    }
    // 根据地面板
    for (const b of BASES) {
      const row = baseRows.get(b.id)!; const st = state.bases[b.id];
      const rev = baseRevealed(state, b.id);
      row.el.style.display = rev ? "" : "none"; if (!rev) continue;
      row.el.classList.toggle("sel", selectedBase === b.id);
      row.el.classList.toggle("est", st.est);
      row.name.textContent = `${st.est ? "★" : "○"} ${b.name}`;
      row.terr.textContent = b.terrain === "plain" ? "平原·肥沃/挨打" : b.terrain === "hills" ? "丘陵" : "山地·安全";
      row.stats.textContent = st.est
        ? `人口 ${st.pop.toFixed(0)}/${b.pop0}万 · 发展 ${st.dev}/5 · 地道 ${st.tunnels}/3 · 据点🏯 ${st.spots}/5 · 乘数 ×${(1 + (0.10 + 0.05 * st.dev) * (st.pop / b.pop0) * Math.max(0.3, 1 - 0.1 * st.spots) * (b.terrain === "plain" ? 1.25 : b.terrain === "hills" ? 1.05 : 0.95)).toFixed(2)}`
        : `人口 ${b.pop0}万 · ${b.hist}`;
      const ec = estCost(state);
      row.est.style.display = st.est ? "none" : "";
      row.est.textContent = tier(state) < 7 ? "开辟(需边区规模)" : era(state).canExpand ? `开辟 ${fmt(ec.bing)}兵${fmt(ec.wuzi)}资` : "开辟(至暗期不可)";
      row.est.disabled = tier(state) < 7 || !era(state).canExpand || state.bing < ec.bing || state.wuzi < ec.wuzi;
      row.dev.style.display = st.est ? "" : "none";
      row.dev.textContent = st.dev >= 5 ? "发展MAX" : `发展 ${fmt(devCost(state, b.id))}资`;
      row.dev.disabled = st.dev >= 5 || state.wuzi < devCost(state, b.id);
      row.tun.style.display = st.est ? "" : "none";
      row.tun.textContent = st.tunnels >= 3 ? "地道MAX" : `挖地道 ${fmt(tunCost(state, b.id))}资`;
      row.tun.disabled = st.tunnels >= 3 || state.wuzi < tunCost(state, b.id);
      const sc = spotCost(state);
      row.spot.style.display = st.est && st.spots > 0 ? "" : "none";
      row.spot.textContent = `拔据点 ${fmt(sc.bing)}兵${fmt(sc.wuzi)}资`;
      row.spot.disabled = state.bing < sc.bing || state.wuzi < sc.wuzi;
      const migTo = st.est ? pickMigrationTarget(state, b.id) : null;
      row.mig.style.display = st.est && migTo && tier(state) >= 7 ? "" : "none";
      if (migTo) {
        row.mig.textContent = state.migration ? "迁移中…" : `迁25%群众→${BASES.find((x) => x.id === migTo)!.short} ${fmt(migrationCost(state, b.id))}资`;
        row.mig.disabled = !!state.migration || state.wuzi < migrationCost(state, b.id) || state.bases[b.id].pop <= b.pop0 * 0.3;
      }
    }

    const Tid = tier(state);
    if (Tid > shownTier) {
      shownTier = Tid;
      const td = TIERS[Tid];
      floatAt(wrap.clientWidth / 2, 130, `━ 视野扩大：${td.name}（${td.scope}）━`, "big");
      state.terminal.push({ text: `【规模升级】${td.name}——${td.note}`, kind: "era" });
    }
    const g = $("#krGuide"); while (gstep < GUIDE.length && GUIDE[gstep].d(state)) gstep += 1;
    if (gstep >= GUIDE.length || state.ended) g.style.display = "none";
    else { g.style.display = ""; const txt = `${gstep + 1}/${GUIDE.length} · ${GUIDE[gstep].t}`; if (g.textContent !== txt) g.textContent = txt; }
    renderSweepBar();
    renderTerm();
    renderEnding();
    renderAch();
    renderDoct();
    pumpToasts();
  }

  // ── 主循环 ──
  let last = performance.now();
  function frame(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!paused) tick(state, dt * speed);
    scene.frame(dt, state);
    render();
    renderOnb(dt);
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
  $("#krDbgSweep").addEventListener("click", () => { if (!state.sweep) state.nextSweepM = state.monthIdx; state.monthAcc = MONTH_MS; });
  $("#krDbgMonth").addEventListener("click", () => { state.monthAcc += MONTH_MS * 6; });
  $("#krDbgEnd").addEventListener("click", () => { state.monthAcc += MONTH_MS * 98; });
  $("#krDbgReset").addEventListener("click", () => { if (window.confirm("重置？")) { state = createKRState(); gstep = 0; endShown = false; $("#krEnding").style.display = "none"; } });

  (window as unknown as { __kr?: unknown }).__kr = {
    state: () => state, give: (w: number, b: number) => { state.wuzi += w; state.totalWuzi += w; state.bing += b || 0; },
    rally: doRally, buyBuilding: (i: number) => buyBuilding(state, i),
    establish: (id: string) => establishBase(state, id), dev: (id: string) => raiseDev(state, id),
    tunnel: (id: string) => digTunnel(state, id), removeSpot: (id: string) => removeSpot(state, id),
    campaign: (id: string) => launchCampaign(state, id),
    pause: () => setP(true), resume: () => setP(false), setSpeed: (n: number) => { speed = n; },
    month: () => state.monthIdx, date: () => dateStr(state.monthIdx), eraId: () => era(state).id, tierId: () => tier(state),
    transfer: (from: string, to?: string) => transferPop(state, from, to || pickMigrationTarget(state, from) || ""),
    bases: () => estCount(state), ended: () => state.ended, report: () => endReport(state), sceneOk: () => scene.ok,
    sweep: () => { if (!state.sweep) { state.nextSweepM = state.monthIdx; state.monthAcc = MONTH_MS; } },
    skipMonths: (n: number) => { state.monthAcc += MONTH_MS * n; },
    evac: () => startEvacuation(state), fight: (frac = 0.6) => commitTroops(state, Math.floor(state.bing * frac))
  };
}
