// 血战台儿庄 · 交互科普馆 —— 渲染与交互（DOM 层）。
// 数据一律来自 Data_Museum.mjs；本文件只做渲染与交互，不写史实。

import {
  SITE, STATS, TLDR, TIER, TIMELINE_PHASES, TIMELINE, FORCES, PEOPLE,
  WEAPON_CATEGORIES, WEAPONS, WEAPON_PAIRS, BALANCE, DARES, DARE_LOADOUT,
  DARE_NOTES, TACTICS, CASUALTY_TABLE, QUOTES, MYTHS, GLOSSARY, READING,
  TOWN_FACTS, MEMOIR_INTRO, MEMOIR_EXCERPTS, READING_PATH, PEOPLE_LATER,
  TENGXIAN_BATTLE, TENGXIAN_MARKERS, TENGXIAN_UNITS, TENGXIAN_STEPS,
} from "./Data_Museum.mjs";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function tierBadge(tierId) {
  const tier = TIER[tierId] || TIER.main;
  const b = el("span", `tierBadge ${tier.cls}`, tier.label);
  b.title = tier.desc;
  return b;
}

/* ---------------- 导航与进度 ---------------- */
function initNav() {
  const links = $$("#navLinks a");
  const sections = links.map((a) => $(a.getAttribute("href"))).filter(Boolean);
  const progress = $("#readProgress");
  const onScroll = () => {
    const doc = document.documentElement;
    const max = doc.scrollHeight - doc.clientHeight;
    progress.style.width = max > 0 ? `${(doc.scrollTop / max) * 100}%` : "0%";
  };
  document.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const id = `#${entry.target.id}`;
      for (const a of links) {
        a.classList.toggle("active", a.getAttribute("href") === id);
      }
    }
  }, { rootMargin: "-30% 0px -60% 0px" });
  sections.forEach((s) => io.observe(s));
}

/* ---------------- 首页数字 ---------------- */
function initStats() {
  const grid = $("#statGrid");
  const cards = STATS.map((s) => {
    const card = el("div", "statCard");
    const num = el("div", "statNum");
    const span = el("span", "", "0");
    num.append(span);
    if (s.suffix) num.append(el("span", "suffix", s.suffix));
    card.append(num, el("div", "statLabel", s.label));
    grid.append(card);
    return { span, value: s.value };
  });
  const fmt = (n) => n.toLocaleString("en-US");
  let started = false;
  const animate = (card) => {
    const { span, value } = card;
    const t0 = performance.now();
    const dur = 1300;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      span.textContent = fmt(Math.round(value * eased));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting) && !started) {
      started = true;
      cards.forEach(animate);
      io.disconnect();
    }
  }, { threshold: 0.3 });
  io.observe(grid);
}

/* ---------------- 一分钟看懂 ---------------- */
function initTldr() {
  const grid = $("#tldrGrid");
  for (const item of TLDR) {
    const card = el("div", "tldrCard");
    card.append(el("span", "icon", item.icon));
    card.append(el("h3", "", item.title));
    card.append(el("p", "", item.body));
    grid.append(card);
  }
}

/* ---------------- 城档案 ---------------- */
function initTownFacts() {
  const list = $("#factList");
  for (const fact of TOWN_FACTS) list.append(el("li", "", fact));
}

/* ---------------- 双方阵容 ---------------- */
function renderForceNode(node, depth) {
  const li = el("li", "forceNode");
  const hasChildren = node.children && node.children.length > 0;
  const hasNote = Boolean(node.note);
  const btn = el("button", "forceNodeBtn");
  if (hasChildren) btn.append(el("span", "tw", "▾"));
  else if (hasNote) btn.append(el("span", "tw", "·"));
  btn.append(el("span", "nm", node.name));
  if (node.sub) btn.append(el("span", "sb", node.sub));
  if (node.star) btn.append(el("span", "starTag", `★ ${node.star}`));
  btn.addEventListener("click", () => {
    if (hasChildren) {
      const ul = li.querySelector(":scope > ul");
      ul.classList.toggle("hidden");
      const tw = btn.querySelector(".tw");
      if (tw) tw.textContent = ul.classList.contains("hidden") ? "▸" : "▾";
    }
    if (hasNote) {
      const d = li.querySelector(":scope > .nodeDetail");
      d.classList.toggle("show");
    }
    btn.classList.toggle("open", li.querySelector(":scope > .nodeDetail")?.classList.contains("show") || false);
  });
  li.append(btn);
  if (hasNote) li.append(el("div", "nodeDetail", node.note));
  if (hasChildren) {
    const ul = el("ul");
    for (const child of node.children) ul.append(renderForceNode(child, depth + 1));
    li.append(ul);
  }
  return li;
}

function initForces() {
  $("#forceCnTitle").textContent = FORCES.cn.title;
  $("#forceCnSub").textContent = FORCES.cn.subtitle;
  $("#forceCnNote").textContent = FORCES.cn.note;
  $("#forceJpTitle").textContent = FORCES.jp.title;
  $("#forceJpSub").textContent = FORCES.jp.subtitle;
  $("#forceJpNote").textContent = FORCES.jp.note;
  const cnTree = el("ul", "forceTree");
  const jpTree = el("ul", "forceTree");
  for (const root of FORCES.cn.roots) cnTree.append(renderForceNode(root, 0));
  for (const root of FORCES.jp.roots) jpTree.append(renderForceNode(root, 0));
  $("#forceCnTree").append(cnTree);
  $("#forceJpTree").append(jpTree);
}

/* ---------------- 人物志 ---------------- */
function renderPerson(p) {
  const card = el("div", `personCard ${p.side}`);
  card.append(el("h4", "", p.name));
  card.append(el("div", "role", p.role));
  card.append(el("div", "origin", p.origin));
  const story = el("div", "story");
  for (const para of p.story) story.append(el("p", "", para));
  card.append(story);
  if (p.quote) {
    const q = el("div", "personQuote");
    q.append(document.createTextNode(`「${p.quote.text}」`));
    q.append(el("span", "tier", `${TIER[p.quote.tier].label} · 语录`));
    card.append(q);
  }
  if (PEOPLE_LATER[p.id]) {
    const later = el("div", "later");
    later.append(el("span", "laterTag", "后来"));
    later.append(el("span", "", PEOPLE_LATER[p.id]));
    card.append(later);
  }
  return card;
}

function initPeople() {
  const filters = $("#peopleFilters");
  const grid = $("#peopleGrid");
  const mkChip = (id, label, cls) => {
    const b = el("button", `chipBtn ${cls || ""}`, label);
    b.dataset.filter = id;
    b.addEventListener("click", () => {
      $$(".chipBtn", filters).forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      grid.replaceChildren();
      const list = id === "all" ? PEOPLE : PEOPLE.filter((p) => p.side === id);
      for (const p of list) grid.append(renderPerson(p));
    });
    return b;
  };
  filters.append(mkChip("all", "全部", "on"));
  filters.append(mkChip("cn", "中方（14 人）", "cn"));
  filters.append(mkChip("jp", "日方（6 人）", "jp"));
  for (const p of PEOPLE) grid.append(renderPerson(p));
}

/* ---------------- 武器 ---------------- */
const sideLabel = { cn: "中方", jp: "日方" };
const catLabel = (id) => (WEAPON_CATEGORIES.find((c) => c.id === id) || {}).label || id;

function wpnSpecPairs(w) {
  return w.spec || [];
}

function renderWpnCard(w) {
  const card = el("button", `wpnCard ${w.side}${w.category === "gap" ? " gap" : ""}`);
  card.dataset.wpnId = w.id;
  card.append(el("span", "sideTag", sideLabel[w.side]));
  const top = el("div", "wpnCardTop");
  top.append(el("span", "wpnName", w.name));
  top.append(el("span", "wpnCat", catLabel(w.category)));
  card.append(top);
  if (w.nick) card.append(el("div", "wpnNick", `俗称：${w.nick}`));
  if (w.full) card.append(el("div", "wpnFull", w.full));
  const spec = el("dl", "wpnSpec");
  for (const [k, v] of wpnSpecPairs(w)) {
    spec.append(el("dt", "", k));
    spec.append(el("dd", "", v));
  }
  card.append(spec);
  card.append(el("div", "wpnTeaser", (w.notes[0] || "")));
  card.append(el("span", "wpnMore", "点开看实战细节 →"));
  card.addEventListener("click", () => openWpnModal(w));
  return card;
}

let wpnFilter = { side: "all", cat: "all" };
function renderWpnGrid() {
  const grid = $("#wpnGrid");
  grid.replaceChildren();
  const list = WEAPONS.filter((w) =>
    (wpnFilter.side === "all" || w.side === wpnFilter.side) &&
    (wpnFilter.cat === "all" || w.category === wpnFilter.cat));
  if (list.length === 0) {
    grid.append(el("p", "", "没有符合筛选条件的装备。"));
    return;
  }
  for (const w of list) grid.append(renderWpnCard(w));
}

function initWeapons() {
  const toolbar = $("#wpnToolbar");
  const mkChip = (id, label, cls) => {
    const b = el("button", `chipBtn ${cls || ""}`, label);
    b.dataset.filter = id;
    b.addEventListener("click", () => {
      if (id === "all" || id === "cn" || id === "jp") {
        wpnFilter.side = id;
        $$(".chipBtn[data-side]", toolbar).forEach((x) => x.classList.remove("on"));
        b.classList.add("on");
      } else {
        wpnFilter.cat = id;
        $$(".chipBtn[data-cat]", toolbar).forEach((x) => x.classList.remove("on"));
        b.classList.add("on");
      }
      renderWpnGrid();
    });
    return b;
  };
  const sideAll = mkChip("all", "全部", "on"); sideAll.dataset.side = "all";
  const sideCn = mkChip("cn", "中方", "cn"); sideCn.dataset.side = "cn";
  const sideJp = mkChip("jp", "日方", "jp"); sideJp.dataset.side = "jp";
  toolbar.append(sideAll, sideCn, sideJp);
  toolbar.append(el("span", "navGroup", "类别"));
  const catAll = mkChip("all", "全部", "on"); catAll.dataset.cat = "all";
  toolbar.append(catAll);
  for (const c of WEAPON_CATEGORIES) {
    const chip = mkChip(c.id, c.label); chip.dataset.cat = c.id;
    toolbar.append(chip);
  }
  $("#wpnNote").textContent =
    "俗称说明：『三八大盖』『歪把子』『王八盒子』等多为后世的通行叫法；1938 年的战场上更常见的是『三八式』『日本枪』一类直呼。本页为便于识别，标出俗称并注明。缺口卡（金色虚线）讲的是中方缺什么——有时候「缺什么」比「有什么」更能解释一场仗。";
  renderWpnGrid();

  const modal = $("#wpnModal");
  $("#wpnModalClose").addEventListener("click", () => modal.classList.remove("show"));
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("show"); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") modal.classList.remove("show"); });

  initCompare();
  initBalance();
}

function openWpnModal(w) {
  $("#wpnModalTitle").textContent = w.name;
  const nick = $("#wpnModalNick");
  nick.textContent = w.nick ? `俗称：${w.nick}` : "";
  $("#wpnModalFull").textContent = `${sideLabel[w.side]} · ${w.full || catLabel(w.category)}`;
  const spec = $("#wpnModalSpec");
  spec.replaceChildren();
  for (const [k, v] of wpnSpecPairs(w)) {
    const row = el("div");
    row.append(el("b", "", k));
    row.append(el("span", "", v));
    spec.append(row);
  }
  const notes = $("#wpnModalNotes");
  notes.replaceChildren();
  for (const n of w.notes) notes.append(el("p", "", n));
  $("#wpnModal").classList.add("show");
}

function initCompare() {
  const picks = $("#comparePicks");
  const grid = $("#compareGrid");
  let current = WEAPON_PAIRS[0];
  const render = () => {
    grid.replaceChildren();
    const cnSide = el("div", "compareSide cn");
    cnSide.append(el("h4", "", "中方"));
    for (const id of current.cn) {
      const w = WEAPONS.find((x) => x.id === id);
      if (!w) continue;
      const item = el("div", "item");
      item.append(el("b", "", w.name));
      item.append(document.createTextNode(w.nick ? `俗称：${w.nick} · ` : ""));
      item.append(document.createTextNode((w.spec[0] || []).join(" ")));
      cnSide.append(item);
    }
    if (current.cn.length === 0) cnSide.append(el("div", "item", "（无此类装备）"));
    const jpSide = el("div", "compareSide jp");
    jpSide.append(el("h4", "", "日方"));
    for (const id of current.jp) {
      const w = WEAPONS.find((x) => x.id === id);
      if (!w) continue;
      const item = el("div", "item");
      item.append(el("b", "", w.name));
      item.append(document.createTextNode(w.nick ? `俗称：${w.nick} · ` : ""));
      item.append(document.createTextNode((w.spec[0] || []).join(" ")));
      jpSide.append(item);
    }
    if (current.jp.length === 0) jpSide.append(el("div", "item", "（无此类装备）"));
    grid.append(cnSide, jpSide, el("div", "compareVerdict", `实战结论：${current.verdict}`));
  };
  for (const pair of WEAPON_PAIRS) {
    const b = el("button", `pickBtn${pair === current ? " on" : ""}`, pair.label);
    b.addEventListener("click", () => {
      current = pair;
      $$(".pickBtn", picks).forEach((x) => x.classList.toggle("on", x === b));
      render();
    });
    picks.append(b);
  }
  render();
}

function initBalance() {
  const wrap = $("#balanceRows");
  for (const row of BALANCE) {
    const line = el("div", "balanceRow");
    line.append(el("div", "balanceLabel", row.label));
    const bars = el("div", "balanceBars");
    for (const side of ["cn", "jp"]) {
      const bar = el("div", `balanceBar ${side}`);
      bar.append(el("div", "fill", ""));
      bar.querySelector(".fill").style.width = `${row[side] * 10}%`;
      bars.append(bar);
    }
    line.append(bars);
    line.append(el("div", "balanceNote", row.note));
    wrap.append(line);
  }
}

/* ---------------- 时间线 ---------------- */
let tlPlaying = false;
function initTimeline() {
  const legend = $("#phaseLegend");
  for (const phase of TIMELINE_PHASES) {
    const chip = el("span", "phaseChip", phase.label);
    chip.append(el("span", "range", ` · ${phase.range}`));
    legend.append(chip);
  }

  const list = $("#tlList");
  const itemNodes = [];
  for (const phase of TIMELINE_PHASES) {
    const entries = TIMELINE.filter((t) => t.phase === phase.id);
    if (entries.length === 0) continue;
    for (const t of entries) {
      const item = el("div", `tlItem ${phase.id}${t.key ? " key" : ""}`);
      const card = el("div", "tlCard");
      const top = el("div", "tlTop");
      top.append(el("span", "tlDate", t.date));
      top.append(el("span", "tlTitle", t.title));
      if (t.key) top.append(el("span", "tlKey", "★ 关键时刻"));
      top.append(tierBadge(t.tier));
      card.append(top);
      const body = el("div", "tlBody");
      for (const p of t.body) body.append(el("p", "", p));
      card.append(body);
      card.addEventListener("click", () => item.classList.toggle("open"));
      item.append(card);
      list.append(item);
      itemNodes.push(item);
    }
  }

  const playBtn = $("#tlPlay");
  const resetBtn = $("#tlReset");
  let step = -1;
  let timer = null;

  const setStep = (i) => {
    itemNodes.forEach((n, idx) => {
      n.classList.toggle("active", idx === i);
      n.classList.toggle("passed", idx < i);
    });
  };
  const goTo = (i) => {
    step = i;
    setStep(i);
    const node = itemNodes[i];
    if (node) {
      node.classList.add("open");
      node.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  };
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
    tlPlaying = false;
    playBtn.textContent = "▶ 自动播放";
    playBtn.disabled = false;
  };
  playBtn.addEventListener("click", () => {
    if (tlPlaying) { stop(); return; }
    if (step >= itemNodes.length - 1) step = -1;
    tlPlaying = true;
    playBtn.textContent = "⏸ 暂停";
    goTo(step + 1);
    timer = setInterval(() => {
      if (step >= itemNodes.length - 1) { stop(); return; }
      goTo(step + 1);
    }, 1500);
  });
  resetBtn.addEventListener("click", () => {
    stop();
    itemNodes.forEach((n) => n.classList.remove("active", "passed", "open"));
    step = -1;
  });
}

/* ---------------- 战场态势图 ---------------- */
const MAP_STAGE_TEXT = {
  prelude: {
    title: "① 前哨战：两翼买时间（3 月 14—18 日）",
    body: "西线濑谷支队攻滕县：王铭章殉国，滕县多守三天。东线坂本支队攻临沂：被庞炳勋死守 + 张自忠渡河侧击牵住。两把钳子合不拢，台儿庄才来得及布防。",
  },
  street: {
    title: "② 巷战拉锯：把敌人吸在城里（3 月 23 日—4 月 5 日）",
    body: "日军 3 月 24 日猛攻北门、27 日突入城内，逐步控制约三分之二至四分之三市街；守军退守西南一隅、背靠运河死守。汤恩伯第 20 军团在外线攻峄县、切断补给、挡坂本支队。4 月 4 日深夜孙连仲求撤被李宗仁拒绝——「最后五分钟」。",
  },
  counter: {
    title: "③ 总反攻：内外夹击（4 月 6—7 日）",
    body: "4 月 6 日李宗仁下令全线总攻：汤恩伯军团自北面断敌退路，孙连仲部自城内出击，夜间摧毁日军弹药囤积点。日军两支队日没后奉命转进（濑谷支队长「独断离脱」），4 月 7 日凌晨向峄县、枣庄退却——台儿庄光复。",
  },
};
function initMap() {
  const tabs = $$("#mapTabs .mapTab");
  const stage = $("#mapStage");
  const render = (phase) => {
    tabs.forEach((t) => t.classList.toggle("on", t.dataset.phase === phase));
    $$(".mapPhase").forEach((g) => g.classList.toggle("show", g.dataset.mapPhase === phase));
    stage.replaceChildren();
    stage.append(el("span", "stageTitle", MAP_STAGE_TEXT[phase].title));
    stage.append(el("p", "", MAP_STAGE_TEXT[phase].body));
  };
  tabs.forEach((t) => t.addEventListener("click", () => render(t.dataset.phase)));
  render("prelude");
}

/* ---------------- 滕县详解 ---------------- */
const TX_NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs, text) {
  const node = document.createElementNS(TX_NS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function initTengxian() {
  const head = $("#tengxianHead");
  const meta = el("div", "txMeta");
  meta.append(el("p", "", TENGXIAN_BATTLE.meta));
  meta.append(el("p", "txSides", TENGXIAN_BATTLE.sides));
  meta.append(el("p", "txPositions", TENGXIAN_BATTLE.positions));
  meta.append(el("p", "txSummary", TENGXIAN_BATTLE.summary));
  head.append(meta);

  const days = $("#tengxianDays");
  const dayNodes = [];
  TENGXIAN_BATTLE.days.forEach((d, idx) => {
    const card = el("div", "txDay");
    const top = el("div", "txDayTop");
    top.append(el("span", "txDate", d.date));
    top.append(el("h4", "", d.title));
    top.append(tierBadge(d.tier));
    card.append(top);
    for (const p of d.body) card.append(el("p", "", p));
    days.append(card);
    dayNodes.push(card);
  });
  $("#tengxianAftermath").textContent = TENGXIAN_BATTLE.aftermath;

  const info = $("#tengxianInfo");
  const showHint = () => {
    info.replaceChildren();
    info.append(el("p", "txHint", `◈ ${TENGXIAN_BATTLE.mapHint}`));
  };
  showHint();

  const tx = buildTengxianMap(info, dayNodes);
  initTengxianSlider(tx.renderStep, dayNodes);
}

/** 构建沙盘 SVG，返回 { renderStep }。 */
function buildTengxianMap(info, dayNodes) {
  const box = $("#tengxianMapBox");
  box.replaceChildren();
  const svg = svgEl("svg", { class: "mapSvg", viewBox: "0 0 860 600", role: "img", "aria-label": "滕县保卫战沙盘（可拖动时间滑块）" });
  box.append(svg);

  /* ---- 基础层 ---- */
  svg.append(svgEl("rect", { x: 0, y: 0, width: 860, height: 600, fill: "#1a140d", rx: 8 }));
  svg.append(svgEl("text", { class: "tl", x: 24, y: 36, fill: "#93856a" }, "滕县保卫战 · 沙盘（拖动滑块看 3.13—3.18，北↑）"));
  // 津浦铁路
  svg.append(svgEl("line", { class: "rail", x1: 230, y1: 60, x2: 230, y2: 565 }));
  svg.append(svgEl("text", { class: "tl", x: 242, y: 330, fill: "#93856a" }, "津浦铁路"));
  // 界河
  svg.append(svgEl("path", { class: "geo", d: "M110 210 L 500 210", stroke: "#4a6f86", "stroke-width": 3 }));
  svg.append(svgEl("text", { class: "tl", x: 118, y: 202, fill: "#93856a" }, "界河"));
  // 北沙河（第二线位置）
  svg.append(svgEl("path", { class: "geo", d: "M150 272 L 350 272", stroke: "#4a6f86", "stroke-width": 2, "stroke-dasharray": "5 4" }));
  svg.append(svgEl("text", { class: "tl", x: 160, y: 286, fill: "#6f9ab8" }, "北沙河"));

  /* ---- 城态层 ---- */
  const city = svgEl("g", { "data-city": "normal" });
  city.append(svgEl("rect", { class: "txWall", x: 190, y: 300, width: 80, height: 60, fill: "#241c12", stroke: "#8a7552", "stroke-width": 3 }));
  // 门
  city.append(svgEl("line", { x1: 230, y1: 360, x2: 230, y2: 352, stroke: "#e9dcc0", "stroke-width": 3 }));
  city.append(svgEl("line", { x1: 270, y1: 330, x2: 262, y2: 330, stroke: "#e9dcc0", "stroke-width": 3 }));
  city.append(svgEl("line", { x1: 190, y1: 330, x2: 198, y2: 330, stroke: "#e9dcc0", "stroke-width": 3 }));
  const cityOverlay = svgEl("g", {});
  city.append(cityOverlay);
  svg.append(city);
  svg.append(svgEl("text", { class: "tlBig", x: 172, y: 292, fill: "#e9dcc0" }, "滕县城"));

  /* ---- 对峙线层 ---- */
  const lineLayer = svgEl("g", {});
  lineLayer.append(svgEl("line", { x1: 140, y1: 222, x2: 470, y2: 222, stroke: "#8fb0e0", "stroke-width": 1.5, "stroke-dasharray": "7 5" }));
  for (const x of [350, 408, 360, 230]) {
    lineLayer.append(svgEl("path", { d: `M${x} 222 l -5 -7 l 10 0 z`, fill: "#8fb0e0" }));
  }
  lineLayer.append(svgEl("text", { class: "tlCn", x: 120, y: 240, fill: "#9dbbe8" }, "川军第 45 军第一线（对峙）"));
  svg.append(lineLayer);

  /* ---- 标记层（可点击） ---- */
  const markerGroup = svgEl("g", {});
  const showMarker = (id) => {
    const m = TENGXIAN_MARKERS[id];
    if (!m) return;
    $$(".tmark", box).forEach((x) => x.classList.toggle("active", x.dataset.marker === id));
    info.replaceChildren();
    const top = el("div", "txInfoTop");
    top.append(el("b", "", m.label));
    top.append(el("span", `sideTag ${m.side}`, m.side === "cn" ? "中方" : "日方"));
    info.append(top);
    info.append(el("p", "", m.body));
  };
  for (const [id, m] of Object.entries(TENGXIAN_MARKERS)) {
    const g = svgEl("g", { class: `tmark ${m.side}`, "data-marker": id, tabindex: 0 });
    if (m.icon === "fort") {
      g.append(svgEl("rect", { class: "tmarkDot", x: m.pos[0] - 6, y: m.pos[1] - 6, width: 12, height: 12 }));
    } else if (m.icon === "forward") {
      g.append(svgEl("line", { class: "tmarkDot", x1: m.pos[0] - 8, y1: m.pos[1] - 3, x2: m.pos[0] + 8, y2: m.pos[1] - 3 }));
      g.append(svgEl("line", { class: "tmarkDot", x1: m.pos[0] - 8, y1: m.pos[1] + 3, x2: m.pos[0] + 8, y2: m.pos[1] + 3 }));
    } else {
      g.append(svgEl("circle", { class: "tmarkDot", cx: m.pos[0], cy: m.pos[1], r: m.r || 6 }));
    }
    g.append(svgEl("text", { class: "tmarkLbl", x: m.lpos[0], y: m.lpos[1] }, m.label));
    if (m.lpos2) g.append(svgEl("text", { class: "tmarkLbl2", x: m.lpos2[0], y: m.lpos2[1] }, m.lpos2Text || ""));
    g.addEventListener("click", () => showMarker(id));
    g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showMarker(id); } });
    markerGroup.append(g);
  }
  svg.append(markerGroup);

  /* ---- 部队层（持久节点，移动有过渡动画） ---- */
  const unitLayer = svgEl("g", {});
  const unitNodes = {};
  for (const [uid, def] of Object.entries(TENGXIAN_UNITS)) {
    const g = svgEl("g", { class: `txUnit ${def.side}`, "data-unit": uid });
    g.style.transition = "transform 0.55s ease";
    const dot = svgEl("circle", { class: "txUnitDot", cx: 0, cy: 0, r: 7 });
    const lbl = svgEl("text", { class: "txUnitLbl", x: 12, y: -7 }, def.short);
    const tip = svgEl("title", {}, def.label);
    g.append(dot, lbl, tip);
    unitLayer.append(g);
    unitNodes[uid] = g;
  }
  svg.append(unitLayer);

  /* ---- 箭头层与标注层 ---- */
  const arrowLayer = svgEl("g", {});
  const extraLayer = svgEl("g", {});
  svg.append(arrowLayer, extraLayer);

  /* ---- 按步渲染 ---- */
  const renderStep = (i) => {
    const step = TENGXIAN_STEPS[i];
    if (!step) return;
    lineLayer.style.display = step.line ? "" : "none";
    for (const [uid, g] of Object.entries(unitNodes)) {
      const pos = step.units[uid];
      if (!pos) { g.style.display = "none"; continue; }
      g.style.display = "";
      g.setAttribute("transform", `translate(${pos[0]} ${pos[1]})`);
      g.dataset.state = pos[2] || "idle";
    }
    arrowLayer.replaceChildren();
    for (const a of step.arrows || []) {
      const path = svgEl("path", { class: `mapArrow ${a.side}`, d: a.d });
      arrowLayer.append(path);
      const end = (a.d.match(/([\d.]+)\s+([\d.]+)\s*$/) || []).slice(1, 3).map(Number);
      if (end.length === 2) arrowLayer.append(svgEl("circle", { class: "txArrowHead", cx: end[0], cy: end[1], r: 3.5, fill: a.side === "cn" ? "#8fb0e0" : "#d4554a" }));
      if (a.label) arrowLayer.append(svgEl("text", { class: a.side === "cn" ? "tlCn" : "tlJp", x: a.pos[0], y: a.pos[1] }, a.label));
    }
    extraLayer.replaceChildren();
    for (const t of step.extras || []) {
      extraLayer.append(svgEl("text", { class: t.cls, x: t.pos[0], y: t.pos[1] }, t.text));
    }
    city.setAttribute("data-city", step.city);
    cityOverlay.replaceChildren();
    if (step.city === "attack") {
      for (const [bx, by] of [[206, 298], [248, 296], [272, 314]]) {
        cityOverlay.append(svgEl("circle", { class: "txBurst", cx: bx, cy: by, r: 6, fill: "none", stroke: "#d4554a", "stroke-width": 2 }));
      }
    } else if (step.city === "breach") {
      cityOverlay.append(svgEl("path", { d: "M222 362 L 238 362 L 230 392 Z", fill: "rgba(178,58,46,0.55)", stroke: "#d4554a", "stroke-width": 1.5 }));
    } else if (step.city === "fallen") {
      cityOverlay.append(svgEl("line", { x1: 190, y1: 300, x2: 270, y2: 360, stroke: "#d4554a", "stroke-width": 2 }));
      cityOverlay.append(svgEl("line", { x1: 190, y1: 360, x2: 270, y2: 300, stroke: "#d4554a", "stroke-width": 2 }));
      cityOverlay.append(svgEl("text", { class: "txFallen", x: 230, y: 340, "text-anchor": "middle" }, "城陷"));
    }
    const title = $("#tengxianStepTitle");
    if (title) {
      title.replaceChildren();
      title.append(el("b", "", `${step.date} ${step.title}`));
      title.append(document.createTextNode(` —— ${step.summary}`));
    }
    dayNodes.forEach((n, idx) => n.classList.toggle("active", idx === i));
    const ticks = $$("#tengxianTicks button");
    ticks.forEach((t, idx) => t.classList.toggle("active", idx === i));
  };
  renderStep(0);
  return { renderStep };
}

function initTengxianSlider(renderStep, dayNodes) {
  const slider = $("#tengxianSlider");
  const play = $("#tengxianPlay");
  const ticksBox = $("#tengxianTicks");
  let timer = null;

  TENGXIAN_STEPS.forEach((s, i) => {
    const b = el("button", "txTick", s.date);
    b.title = s.title;
    b.addEventListener("click", () => { slider.value = String(i); renderStep(i); });
    ticksBox.append(b);
  });
  slider.addEventListener("input", () => renderStep(Number(slider.value)));
  dayNodes.forEach((n, idx) => {
    n.addEventListener("click", () => { slider.value = String(idx); renderStep(idx); });
  });

  const stop = () => { if (timer) clearInterval(timer); timer = null; play.textContent = "▶ 播放"; };
  play.addEventListener("click", () => {
    if (timer) { stop(); return; }
    play.textContent = "⏸ 暂停";
    let i = Number(slider.value);
    if (i >= TENGXIAN_STEPS.length - 1) i = -1;
    timer = setInterval(() => {
      i += 1;
      slider.value = String(i);
      renderStep(i);
      if (i >= TENGXIAN_STEPS.length - 1) stop();
    }, 1500);
  });
}

/* ---------------- 敢死队 ---------------- */
function initDare() {
  const grid = $("#dareGrid");
  for (const d of DARES) {
    const card = el("div", "dareCard");
    card.append(el("div", "when", d.when));
    card.append(el("h4", "", d.leader));
    card.append(el("div", "unit", d.unit));
    card.append(el("div", "count", d.count));
    card.append(el("div", "result", `结果：${d.result}`));
    card.append(tierBadge(d.tier));
    grid.append(card);
  }
  const loadout = $("#dareLoadout");
  for (const item of DARE_LOADOUT) loadout.append(el("li", "", item));
  const notes = $("#dareNotes");
  for (const n of DARE_NOTES) notes.append(el("p", "", n));
}

/* ---------------- 战术 ---------------- */
function initTactics() {
  const grid = $("#tacticGrid");
  for (const t of TACTICS) {
    const card = el("div", "tacticCard");
    card.append(el("div", "tag", t.tag));
    card.append(el("h3", "", t.title));
    for (const p of t.body) card.append(el("p", "", p));
    grid.append(card);
  }
}

/* ---------------- 代价与意义 ---------------- */
function initCasualties() {
  const wrap = $("#casTables");
  const mkTable = (section, cls) => {
    const box = el("div", `casTable ${cls}`);
    box.append(el("h4", "", section.title));
    const rowsWrap = el("div", "casRows");
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    trh.append(el("th", "", "出处"), el("th", "", "数字"), el("th", "", "关键限定"));
    thead.append(trh);
    table.append(thead);
    const tbody = document.createElement("tbody");
    for (const [src, num, scope] of section.rows) {
      const tr = document.createElement("tr");
      tr.append(el("td", "src", src), el("td", "num", num), el("td", "scope", scope));
      tbody.append(tr);
    }
    table.append(tbody);
    rowsWrap.append(table);
    box.append(rowsWrap);
    if (section.note) box.append(el("div", "casNote", section.note));
    return box;
  };
  wrap.append(mkTable(CASUALTY_TABLE.jp, "jp"));
  wrap.append(mkTable(CASUALTY_TABLE.cn, "cn"));
  wrap.append(mkTable(CASUALTY_TABLE.loot, "loot"));
}

function initQuotes() {
  const grid = $("#quoteGrid");
  for (const q of QUOTES) {
    const card = el("div", "quoteCard");
    card.append(el("div", "q", `「${q.text}」`));
    const who = el("div", "who", `—— ${q.who}`);
    who.append(tierBadge(q.tier));
    card.append(who);
    card.append(el("div", "ctx", q.context));
    grid.append(card);
  }
}

/* ---------------- 纠偏 ---------------- */
function initMyths() {
  const grid = $("#mythGrid");
  for (const m of MYTHS) {
    const card = el("div", "mythCard");
    const claim = el("div", "mythClaim");
    claim.append(el("span", "x", "✕"));
    claim.append(el("span", "", m.claim));
    const fact = el("div", "mythFact");
    fact.append(el("span", "ok", "✓"));
    fact.append(el("p", "", m.fact));
    const tierWrap = el("span", "", " ");
    tierWrap.append(tierBadge(m.tier));
    fact.append(tierWrap);
    card.append(claim, fact);
    grid.append(card);
  }
}

/* ---------------- 回忆录选摘 ---------------- */
function initMemoir() {
  const intro = $("#memoirIntro");
  const head = el("div", "memoirIntroHead");
  head.append(el("h3", "", MEMOIR_INTRO.title));
  head.append(el("p", "book", MEMOIR_INTRO.book));
  head.append(el("p", "pub", MEMOIR_INTRO.pub));
  head.append(el("p", "src", MEMOIR_INTRO.source));
  intro.append(head);
  const rules = el("ul", "memoirRules");
  for (const r of MEMOIR_INTRO.rules) rules.append(el("li", "", r));
  intro.append(rules);

  const list = $("#memoirList");
  for (const m of MEMOIR_EXCERPTS) {
    const card = el("article", "memoirCard");
    const top = el("div", "memoirTop");
    top.append(el("span", "memoirPart", m.part));
    top.append(tierBadge("main"));
    card.append(top);
    card.append(el("h4", "memoirTitle", m.title));
    card.append(el("blockquote", "memoirQuote", `「${m.quote}」`));
    const note = el("p", "memoirNote", m.note);
    card.append(note);
    const link = el("a", "memoirLink", m.link.label);
    link.href = m.link.href;
    card.append(link);
    list.append(card);
  }
}

/* ---------------- 词典 ---------------- */
function initGlossary() {
  const dl = $("#glossary");
  for (const g of GLOSSARY) {
    const dt = el("dt", "", g.term);
    const dd = el("dd", "", g.def);
    dt.addEventListener("click", () => dt.classList.toggle("open"));
    dl.append(dt, dd);
  }
}

/* ---------------- 讲解路线 ---------------- */
function initReadingPath() {
  const bar = $("#readingPath");
  READING_PATH.forEach((step, i) => {
    const a = el("a", "rpStep", "");
    a.href = step.href;
    a.append(el("span", "rpNo", String(i + 1).padStart(2, "0")));
    const body = el("span", "rpBody");
    body.append(el("b", "rpLabel", step.label));
    body.append(el("span", "rpDesc", step.desc));
    a.append(body);
    a.title = step.note;
    bar.append(a);
  });
}

/* ---------------- 延伸阅读 ---------------- */
function initReading() {
  const list = $("#readingList");
  for (const r of READING) {
    const li = el("li");
    const a = el("a", "", r.title);
    a.href = r.url;
    a.target = "_blank";
    a.rel = "noopener";
    li.append(a);
    list.append(li);
  }
}

/* ---------------- 启动 ---------------- */
document.title = `${SITE.title} · 1938 交互科普馆`;
initNav();
initStats();
initTldr();
initTownFacts();
initForces();
initPeople();
initWeapons();
initTimeline();
initMap();
initTengxian();
initDare();
initTactics();
initCasualties();
initQuotes();
initMemoir();
initMyths();
initGlossary();
initReadingPath();
initReading();
