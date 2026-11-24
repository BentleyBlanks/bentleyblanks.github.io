// 资产规范与限制（Tool_AssetStandards.html）：资产导出规范的独立配置器与合规预览。
//
// 只碰两份文件：规范 ../AssetPipeline/Data_AssetStandards.json（读、改、存）与构建产物 ../Model/Data_ModelIndex.json
// （程序化 TZM 的实际面数，只读）。判定公式全在 ../AssetPipeline/Script_AssetStandards.mjs，与 Node 门禁共用；
// 本页不 import 任何游戏模块（Script_AssetStandardsTest 守）。
//
// 存盘：本机预览服务的 /__assetStandards/save（闸与白盒 / 场景存盘口一样，revision = 读文件时原始字节的 sha1）；
// 没有这个口（线上 / 静态服务）就只读，改完点「下载 JSON」。每 2 s 看一次 /__assetStandards/status：
// 文件被 agent 或别人改过、本页又没有未存修改时自动重读；有未存修改时只提示，不覆盖。
// 地址带 #view=<分类>&id=<资产>，可直接深链到某一件。

import {
  ComplianceFor, ExternalComplianceFor, FillRuleText, FormatAssetStandardsJson, ProceduralBudget, ReductionPercent,
  SOURCE_GROUP_IDS, SourceTarget, TriangleRuleFor, ValidateAssetStandards, EXTERNAL_POLICIES,
} from "../AssetPipeline/Script_AssetStandards.mjs";

const SPEC_URL = "../AssetPipeline/Data_AssetStandards.json";
const MODEL_INDEX_URL = "../Model/Data_ModelIndex.json";
const STATUS_URL = "/__assetStandards/status";
const SAVE_URL = "/__assetStandards/save";
const POLL_MS = 2000;

const state = {
  spec: null, originalText: "", revision: null, writable: false, serverKnown: false,
  models: new Map(), view: "overview", selection: null, search: "", status: "all",
  validation: { ok: true, errors: [], warnings: [] }, saving: false,
};
window.AssetStandardsTool = state;

const $ = (id) => document.getElementById(id);
const Num = (value) => Number.isFinite(value) ? value.toLocaleString("en-US") : "—";
const Pct = (value) => value == null ? "—" : `${value < -0.05 ? "+" : ""}${Math.abs(value < -0.05 ? value : Math.max(0, value)).toFixed(1)}%`;

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "text") el.textContent = value;
    else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else if (key === "dataset") Object.assign(el.dataset, value);
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) if (child != null && child !== false) el.append(child instanceof Node ? child : String(child));
  return el;
}

// ---------------------------------------------------------------- 行数据

const TARGET_TAG = { special: "指定特例", reduce: "减面目标", keep5: "5% 免减面", within: "分类上限内", category: "分类预算", source: "原始拓扑", target: "指定目标" };

function SourceRow(id) {
  const { spec } = state;
  const record = spec.sourceAssets[id];
  const actual = state.models.get(id)?.triangles ?? null;
  const target = SourceTarget(spec, id, record);
  return {
    kind: "source", id, record, name: record.name, group: record.group, source: record.sourceTriangles, actual, target,
    reduction: ReductionPercent(record.sourceTriangles, actual), compliance: ComplianceFor(spec, id, actual),
    sourceTexture: record.sourceTexture, runtimeTexture: record.runtimeTexture, note: record.note || "",
  };
}

function ProceduralRow(model) {
  const budget = ProceduralBudget(state.spec, model.category);
  const ok = model.triangles <= budget;
  return {
    kind: "procedural", id: model.name, name: model.name, group: "procedural", category: model.category, source: null, actual: model.triangles,
    target: { value: budget, kind: "category" }, reduction: null,
    compliance: { label: ok ? "分类预算内" : "超过分类预算", tone: ok ? "good" : "bad" },
    sourceTexture: "不适用", runtimeTexture: "项目材质 / 资产登记材质", note: `程序化 TZM（${model.category}），无外部原始模型可比。`,
  };
}

function ExternalRow(record) {
  const compliance = ExternalComplianceFor(state.spec, record);
  return {
    kind: "external", id: record.id, record, name: record.name, group: "external", source: record.sourceTriangles, actual: record.actualTriangles,
    target: { value: record.targetTriangles, kind: compliance.retained ? "keep5" : record.policy },
    reduction: ReductionPercent(record.sourceTriangles, record.actualTriangles), compliance,
    sourceTexture: record.sourceTexture, runtimeTexture: record.runtimeTexture, note: [record.pack, record.note].filter(Boolean).join("；"),
  };
}

function RowsFor(view) {
  const { spec } = state;
  if (SOURCE_GROUP_IDS.includes(view)) return Object.keys(spec.sourceAssets).filter((id) => spec.sourceAssets[id].group === view).map(SourceRow);
  if (view === "procedural") return [...state.models.values()].filter((model) => !spec.sourceAssets[model.name]).map(ProceduralRow).sort((a, b) => a.id.localeCompare(b.id));
  if (view === "external") return spec.externalGlb.map(ExternalRow);
  return [];
}

function Tally(rows) {
  const tally = { total: rows.length, good: 0, warn: 0, bad: 0 };
  for (const row of rows) if (tally[row.compliance.tone] != null) tally[row.compliance.tone] += 1;
  return tally;
}

const IsTableView = (view) => SOURCE_GROUP_IDS.includes(view) || view === "procedural" || view === "external";

// ---------------------------------------------------------------- 导航

function RenderNav() {
  const nav = $("groupNav");
  nav.replaceChildren();
  const Item = (id, label, rows) => {
    const tally = rows ? Tally(rows) : null;
    const dot = !tally ? "none" : tally.bad ? "bad" : tally.warn ? "warn" : "";
    const count = rows ? String(rows.length) : id === "texture" ? String(state.spec.otherRules.texture?.length ?? 0) : "";
    return h("button", { type: "button", class: `as-navItem${state.view === id ? " on" : ""}`, dataset: { view: id }, "aria-current": state.view === id ? "page" : null,
      title: tally && (tally.bad || tally.warn) ? `${tally.bad} 件需处理、${tally.warn} 件待复核` : null, onclick: () => Go(id) },
    h("span", { class: `as-dot ${dot}` }), h("span", { class: "label", text: label }), h("span", { class: "count", text: count }));
  };
  nav.append(h("h2", { text: "规范" }), Item("overview", "总览"), Item("rules", "全局规则"));
  nav.append(h("h2", { text: "资产分类" }));
  for (const group of state.spec.groups) nav.append(Item(group.id, group.label, IsTableView(group.id) ? RowsFor(group.id) : null));
}

// ---------------------------------------------------------------- 中栏

function RenderMain() {
  const main = $("mainView");
  const keepScroll = main.scrollTop;
  const wrapScroll = main.querySelector(".as-tableWrap")?.scrollLeft ?? 0;
  main.replaceChildren();
  if (state.view === "overview") RenderOverview(main);
  else if (state.view === "rules") RenderRulesForm(main);
  else if (state.view === "texture") RenderRuleCardsView(main, "texture", "贴图规范", "贴图尺寸、通道打包、色彩空间与许可的硬规则。点卡片在右侧编辑。");
  else RenderTableView(main);
  main.scrollTop = keepScroll;
  const wrap = main.querySelector(".as-tableWrap");
  if (wrap) wrap.scrollLeft = wrapScroll;
}

function GroupLabel(id) {
  return state.spec.groups.find((group) => group.id === id)?.label || id;
}

function RenderOverview(main) {
  const { spec } = state;
  const sourceRows = SOURCE_GROUP_IDS.flatMap((id) => RowsFor(id));
  const procedural = RowsFor("procedural");
  const external = RowsFor("external");
  const all = Tally([...sourceRows, ...procedural, ...external]);
  main.append(h("div", { class: "as-head" }, h("div", {}, h("h2", { text: "总览" }),
    h("p", { text: "资产进游戏前的导出规范：导入 / 烘焙管线照它决定减不减面、减到多少、贴图怎么处理，验收门禁照它检查产物。游戏运行时不读这份文件。" }))));
  const Card = (k, v, unit, s, tone, accent) => h("div", { class: `as-card${accent ? " accent" : ""}` },
    h("div", { class: "k", text: k }), h("div", { class: "v" }, v, unit ? h("small", { text: unit }) : null), s ? h("div", { class: `s ${tone || ""}`, text: s }) : null);
  main.append(h("div", { class: "as-cards" },
    Card("登记资产", Num(all.total), "件", all.bad ? `${all.bad} 件需处理 · ${all.warn} 件待复核` : `全部合规 · ${all.warn} 件待复核`, all.bad ? "bad" : "", true),
    Card("枪械 / 武器上限", Num(spec.triangleRules.weapon.limit), "三角", "选定源几何超过才减面"),
    Card("战车上限", Num(spec.triangleRules.vehicle.limit), "三角", "选定源几何超过才减面"),
    Card("免减面阈值", `${(spec.minDecimationReduction * 100).toFixed(1)}%`, "", "降幅不超过它时保留原始拓扑"),
    Card("全场单帧预算", Num(spec.sceneRenderLimits.triangles), "三角", `draw call ≤ ${Num(spec.sceneRenderLimits.drawCalls)}`)));
  const table = h("table", { class: "as-table as-groupTable" },
    h("thead", {}, h("tr", {}, ["分类", "登记", "合规", "待复核", "需处理", "合规比例"].map((label, i) => h("th", { class: i ? "r" : "", text: label })))),
    h("tbody", {}, spec.groups.filter((group) => IsTableView(group.id)).map((group) => {
      const tally = Tally(RowsFor(group.id));
      const ratio = tally.total ? tally.good / tally.total : 1;
      return h("tr", { onclick: () => Go(group.id), dataset: { group: group.id } },
        h("td", { text: group.label }), h("td", { class: "num r", text: tally.total }), h("td", { class: "num r", text: tally.good }),
        h("td", { class: `num r${tally.warn ? "" : " muted"}`, text: tally.warn }), h("td", { class: `num r${tally.bad ? "" : " muted"}`, text: tally.bad }),
        h("td", { class: "budget" }, h("div", { class: `as-bar${tally.bad ? " bad" : tally.warn ? " warn" : ""}` }, h("span", { style: `width:${(ratio * 100).toFixed(1)}%` }))));
    })));
  main.append(h("div", { class: "as-tableWrap" }, table));
  main.append(h("div", { class: "as-section" }, h("h3", { text: "谁在用这份规范" }),
    h("div", { class: "as-consumers" }, (spec.consumers || []).map((entry) => h("div", { class: "as-consumer" },
      h("b", { text: entry.name }), h("code", { text: entry.file }), h("span", { text: entry.role }))))));
  main.append(h("div", { class: "as-section" }, h("h3", { text: "口径" }), h("ul", { class: "as-about" }, (spec.about || []).map((line) => h("li", { text: line })))));
}

function RenderTableView(main) {
  const { view } = state;
  const rows = RowsFor(view);
  const tally = Tally(rows);
  const head = h("div", { class: "as-head" }, h("div", {}, h("h2", { text: GroupLabel(view) }), h("p", { text: ViewDescription(view) })));
  if (view === "external" || SOURCE_GROUP_IDS.includes(view)) {
    head.append(h("button", { type: "button", class: "as-btn small", id: "addAsset", onclick: () => AddAsset(view) }, "＋ 新增登记"));
  }
  main.append(head);
  main.append(RuleStrip(view, tally));
  if (view === "external") RenderRuleCards(main, "external");
  const toolbar = h("div", { class: "as-toolbar" },
    h("div", { class: "as-search" }, h("input", { type: "search", id: "assetSearch", placeholder: "搜索名称、编号、贴图或说明", value: state.search,
      "aria-label": "搜索资产", oninput: (event) => { state.search = event.target.value; RenderRows(); } })),
    h("div", { class: "as-seg", role: "group", "aria-label": "按状态筛选", id: "statusFilter" }, [["all", "全部"], ["attention", "需处理 / 待复核"], ["good", "合规"]].map(([id, label]) =>
      h("button", { type: "button", class: state.status === id ? "on" : "", "aria-pressed": String(state.status === id), dataset: { status: id },
        onclick: () => { state.status = id; RenderMain(); } }, label))),
    h("span", { class: "grow" }),
    h("span", { class: "meta", id: "rowMeta" }));
  main.append(toolbar);
  const table = h("table", { class: "as-table", id: "assetTable" },
    h("thead", {}, h("tr", {}, [["资产", ""], ["状态", ""], ["原始面数", "r"], ["实际面数", "r"], ["限制 / 目标", "r"], ["面数降幅", "r"], ["预算占用", ""], ["贴图（自带贴图 / 游戏内贴图）", ""]]
      .map(([label, cls]) => h("th", { class: cls, text: label })))),
    h("tbody", { id: "assetRows" }));
  main.append(h("div", { class: "as-tableWrap" }, table));
  RenderRows();
}

function ViewDescription(view) {
  const { spec } = state;
  if (SOURCE_GROUP_IDS.includes(view)) {
    const rule = TriangleRuleFor(spec, { group: view });
    return `${rule.rule} 实际面数读构建产物 Model/Data_ModelIndex.json。`;
  }
  if (view === "procedural") return "项目自建的 TZM 模型没有外部原始模型可比，只按分类预算检查；实际面数读构建产物 Model/Data_ModelIndex.json。";
  if (view === "external") return "外部 GLB 逐件登记预算，不套用枪械 / 战车分类上限；实际面数由各资产构建脚本实测后登记。";
  return "";
}

function RuleStrip(view, tally) {
  const { spec } = state;
  const Card = (k, v, s) => h("div", { class: "as-card" }, h("div", { class: "k", text: k }), h("div", { class: "v", text: v }), s ? h("div", { class: "s", text: s }) : null);
  const status = h("div", { class: "as-card accent" }, h("div", { class: "k", text: "本组合规" }),
    h("div", { class: "v" }, `${tally.good} / ${tally.total}`), h("div", { class: `s ${tally.bad ? "bad" : ""}`, text: tally.bad ? `${tally.bad} 件需处理` : tally.warn ? `${tally.warn} 件待复核` : "全部合规" }));
  if (SOURCE_GROUP_IDS.includes(view)) {
    const rule = TriangleRuleFor(spec, { group: view });
    return h("div", { class: "as-cards" }, Card(rule.label, `${Num(rule.limit)}`, "三角 · 超过才减面"),
      Card("免减面阈值", `${(spec.minDecimationReduction * 100).toFixed(1)}%`, "目标降幅不超过它时保留原始拓扑"), status);
  }
  if (view === "procedural") {
    return h("div", { class: "as-cards" }, Card("人物 TZM", Num(spec.proceduralBudgets.soldier), "三角"), Card("程序化 Prop", Num(spec.proceduralBudgets.prop), "三角"),
      Card("程序化武器", Num(spec.triangleRules.weapon.limit), "三角（同枪械上限）"), Card("程序化战车", Num(spec.triangleRules.vehicle.limit), "三角（同战车上限）"), status);
  }
  const total = spec.externalGlb.reduce((sum, record) => sum + record.actualTriangles, 0);
  return h("div", { class: "as-cards" }, Card("登记件数", Num(spec.externalGlb.length), "逐件预算"),
    Card("登记实际面数合计", Num(total), "各件实测之和，不是同屏数"), status);
}

function Matches(row) {
  if (state.status === "attention" && !["bad", "warn"].includes(row.compliance.tone)) return false;
  if (state.status === "good" && row.compliance.tone !== "good") return false;
  const query = state.search.trim().toLowerCase();
  if (!query) return true;
  return [row.id, row.name, row.sourceTexture, row.runtimeTexture, row.note, row.record?.pack].filter(Boolean).join("\n").toLowerCase().includes(query);
}

function RenderRows() {
  const body = $("assetRows");
  if (!body) return;
  const rows = RowsFor(state.view);
  const shown = rows.filter(Matches);
  body.replaceChildren(...shown.map(RowElement));
  if (!shown.length) body.append(h("tr", {}, h("td", { colspan: 8, class: "as-empty", text: rows.length ? "没有符合筛选的资产" : "这一类还没有登记" })));
  $("rowMeta").textContent = shown.length === rows.length ? `${rows.length} 件` : `显示 ${shown.length} / ${rows.length} 件`;
}

function RowElement(row) {
  const selected = state.selection?.id === row.id && state.selection?.kind === row.kind;
  const ratio = Number.isFinite(row.actual) && row.target.value > 0 ? row.actual / row.target.value : null;
  const reductionClass = row.reduction != null && row.reduction < -0.05 ? " up" : "";
  return h("tr", { class: selected ? "on" : "", dataset: { id: row.id, kind: row.kind }, onclick: () => Select(row.kind, row.id), title: row.note || null },
    h("td", { class: "asset" }, h("div", { class: "name", text: row.name }), h("div", { class: "id", text: row.id }), row.note ? h("div", { class: "note", text: row.note }) : null),
    h("td", {}, h("span", { class: `as-pill ${row.compliance.tone || ""}`, text: row.compliance.label })),
    h("td", { class: `num r${row.source == null ? " muted" : ""}`, text: Num(row.source) }),
    h("td", { class: `num r${row.actual == null ? " muted" : ""}`, text: Num(row.actual) }),
    h("td", { class: "num r" }, Num(row.target.value), h("span", { class: "tag", text: TARGET_TAG[row.target.kind] || "" })),
    h("td", { class: `num r${reductionClass}` }, Pct(row.reduction), row.reduction != null && row.reduction < -0.05 ? h("span", { class: "tag", text: "补件" }) : null),
    h("td", { class: "budget" }, ratio == null ? h("span", { class: "as-barLabel", text: "—" }) : [
      h("span", { class: "as-barLabel", text: `${(ratio * 100).toFixed(ratio < 0.1 ? 1 : 0)}%` }),
      h("div", { class: `as-bar ${row.compliance.tone || ""}${ratio > 1.001 ? " over" : ""}` }, h("span", { style: `width:${Math.min(100, ratio * 100).toFixed(1)}%` }))]),
    h("td", { class: "tex" }, h("div", {}, h("b", { text: "自带贴图" }), row.sourceTexture || "—"), h("div", {}, h("b", { text: "游戏内贴图" }), row.runtimeTexture || "—")));
}

function RenderRuleCards(parent, group) {
  const cards = h("div", { class: "as-rules", dataset: { group } });
  (state.spec.otherRules[group] || []).forEach((rule, index) => {
    const on = state.selection?.kind === "rule" && state.selection.group === group && state.selection.index === index;
    cards.append(h("button", { type: "button", class: `as-rule${on ? " on" : ""}`, onclick: () => Select("rule", index, group) },
      h("h3", { text: rule.name }), h("div", { class: "limit", text: FillRuleText(state.spec, rule.limit) }),
      h("div", { class: "tex", text: rule.texture }), h("div", { class: "note", text: FillRuleText(state.spec, rule.note) })));
  });
  cards.append(h("button", { type: "button", class: "as-rule add", onclick: () => {
    const list = state.spec.otherRules[group] ||= [];
    list.push({ name: "新规则", limit: "", texture: "", note: "" });
    Changed();
    Select("rule", list.length - 1, group);
  } }, "＋ 新增规则卡"));
  parent.append(cards);
}

function RenderRuleCardsView(main, group, title, sub) {
  main.append(h("div", { class: "as-head" }, h("div", {}, h("h2", { text: title }), h("p", { text: sub }))));
  RenderRuleCards(main, group);
  if (state.spec.otherRules.procedural?.length && group === "texture") {
    main.append(h("div", { class: "as-section" }, h("h3", { text: "程序化 TZM 规则" })));
    RenderRuleCards(main, "procedural");
  }
}

// ---------------------------------------------------------------- 全局规则表单（中栏）

function RenderRulesForm(main) {
  const { spec } = state;
  main.append(h("div", { class: "as-head" }, h("div", {}, h("h2", { text: "全局规则" }),
    h("p", { text: "分类上限、免减面阈值、全场预算与指定特例。改动即时重算左侧与各分类的合规状态；存盘后导入管线与门禁照新值执行（Blender 的 _blender/AssetBudgets.py 目前是手抄镜像，改了上限要同步那份，AssetStandardsTest 会对账）。" }))));
  const grid = h("div", { class: "as-formGrid" });
  for (const key of ["weapon", "vehicle"]) {
    const rule = spec.triangleRules[key];
    grid.append(h("div", { class: "as-box" }, h("h3", { text: rule.label }),
      NumberField("分类上限（三角）", () => rule.limit, (value) => { rule.limit = value; }, { required: true, id: `rule-${key}-limit` }),
      TextField("规则说明", () => rule.rule, (value) => { rule.rule = value; }, { multiline: true })));
  }
  grid.append(h("div", { class: "as-box" }, h("h3", { text: "免减面阈值" }),
    NumberField("降幅阈值（%）", () => +(spec.minDecimationReduction * 100).toFixed(3), (value) => { spec.minDecimationReduction = value / 100; },
      { required: true, step: "0.1", integer: false, id: "rule-minDecimation" }),
    h("p", { class: "hint", text: "目标面数只比原始少这么多（或更少）时，不值得付一次拓扑重写的代价，直接保留选定源几何。" })));
  grid.append(h("div", { class: "as-box" }, h("h3", { text: "全场单帧预算" }),
    NumberField("三角形", () => spec.sceneRenderLimits.triangles, (value) => { spec.sceneRenderLimits.triangles = value; }, { required: true, id: "rule-sceneTriangles" }),
    NumberField("draw call", () => spec.sceneRenderLimits.drawCalls, (value) => { spec.sceneRenderLimits.drawCalls = value; }, { required: true }),
    h("p", { class: "hint", text: spec.sceneRenderLimits.note || "" })));
  grid.append(h("div", { class: "as-box" }, h("h3", { text: "程序化 TZM 分类预算" }),
    Object.keys(spec.proceduralBudgets).map((category) => NumberField(category === "soldier" ? "人物（soldier）" : category === "prop" ? "程序化 Prop（prop）" : category,
      () => spec.proceduralBudgets[category], (value) => { spec.proceduralBudgets[category] = value; }, { required: true }))));
  const special = h("div", { class: "as-box" }, h("h3", { text: "指定特例目标" }));
  for (const id of Object.keys(spec.specialTriangleTargets)) {
    special.append(h("div", { class: "as-field" }, h("span", { text: `${spec.sourceAssets[id]?.name || "（未登记）"} · ${id}` }),
      h("div", { style: "display:flex;gap:8px" },
        NumberInput(() => spec.specialTriangleTargets[id], (value) => { spec.specialTriangleTargets[id] = value; }, { required: true }),
        h("button", { type: "button", class: "as-btn small danger", onclick: () => { delete spec.specialTriangleTargets[id]; Changed(); RenderMain(); } }, "移除"))));
  }
  special.append(h("p", { class: "hint", text: "特例的实际面数须落在目标的 97%–100%。新增特例：在资产详情里填「指定特例目标」。" }));
  grid.append(special);
  main.append(grid);
}

// ---------------------------------------------------------------- 表单零件

function NumberInput(get, set, { required = false, step = "1", integer = true, nullable = false, id = null } = {}) {
  const input = h("input", { type: "number", min: "0", step, id, value: get() ?? "" });
  input.addEventListener("input", () => {
    const raw = input.value.trim();
    const field = input.closest(".as-field");
    if (raw === "" && !required) { set(null); field?.classList.remove("invalid"); Changed(); return; }
    const value = Number(raw);
    const ok = raw !== "" && Number.isFinite(value) && value >= 0 && (!integer || Number.isInteger(value)) && (nullable || value > 0 || !integer);
    field?.classList.toggle("invalid", !ok);
    if (!ok) return;
    set(value);
    Changed();
  });
  return input;
}

function NumberField(label, get, set, options = {}) {
  return h("label", { class: "as-field" }, h("span", { text: label }), NumberInput(get, set, options), options.hint ? h("small", { text: options.hint }) : null);
}

function TextField(label, get, set, { multiline = false, id = null, hint = null } = {}) {
  const input = multiline ? h("textarea", { id }) : h("input", { type: "text", id });
  input.value = get() ?? "";
  input.addEventListener("input", () => { set(input.value); Changed(); });
  return h("label", { class: "as-field" }, h("span", { text: label }), input, hint ? h("small", { text: hint }) : null);
}

function SelectField(label, options, get, set, { id = null } = {}) {
  const select = h("select", { id }, options.map(([value, text]) => h("option", { value, text })));
  select.value = get();
  select.addEventListener("change", () => { set(select.value); Changed(); });
  return h("label", { class: "as-field" }, h("span", { text: label }), select);
}

function CheckField(label, get, set) {
  const input = h("input", { type: "checkbox" });
  input.checked = !!get();
  input.addEventListener("change", () => { set(input.checked); Changed(); });
  return h("label", { class: "as-field check" }, input, h("span", { text: label }));
}

// ---------------------------------------------------------------- 右栏：详情与编辑

function Select(kind, id, group = null) {
  state.selection = kind === "rule" ? { kind, index: id, group } : { kind, id };
  WriteHash();
  RenderMain();
  RenderDetail();
}

function CurrentRow() {
  const selection = state.selection;
  if (!selection || selection.kind === "rule") return null;
  if (selection.kind === "source") return state.spec.sourceAssets[selection.id] ? SourceRow(selection.id) : null;
  if (selection.kind === "external") { const record = state.spec.externalGlb.find((entry) => entry.id === selection.id); return record ? ExternalRow(record) : null; }
  const model = state.models.get(selection.id);
  return model ? ProceduralRow(model) : null;
}

function RenderDetail() {
  const detail = $("detail");
  detail.replaceChildren();
  const selection = state.selection;
  if (selection?.kind === "rule") { RenderRuleDetail(detail, selection); return; }
  const row = CurrentRow();
  if (!row) {
    detail.append(h("div", { class: "as-placeholder" }, h("h2", { text: "详情" }),
      h("p", { text: IsTableView(state.view) ? "点表里的一行，看它的目标是怎么推出来的，并在这里修改登记。" : "选一个资产分类，或在全局规则里改阈值。" })));
    return;
  }
  detail.append(h("div", { id: "detailSummary" }));
  RenderDetailSummary(row);
  const form = h("div", { class: "as-form", id: "detailForm" });
  if (row.kind === "source") SourceForm(form, row);
  else if (row.kind === "external") ExternalForm(form, row);
  else form.append(h("h3", { text: "来源" }), h("p", { class: "as-placeholder", text: "程序化 TZM 的面数由 _blender 建模脚本决定，这里只读；分类预算在「全局规则」里改。" }));
  detail.append(form);
  if (row.kind !== "procedural") {
    detail.append(h("div", { class: "as-detailActions" }, h("button", { type: "button", class: "as-btn small danger", id: "deleteAsset", onclick: () => DeleteAsset(row) }, "删除这条登记")));
  }
}

function RenderDetailSummary(row) {
  const box = $("detailSummary");
  if (!box) return;
  const ratio = Number.isFinite(row.actual) && row.target.value > 0 ? row.actual / row.target.value : null;
  box.replaceChildren(
    h("div", { class: "eyebrow", text: row.kind === "external" ? `外部 GLB · ${row.record.pack}` : row.kind === "procedural" ? `程序化 TZM · ${row.category}` : GroupLabel(row.group) }),
    h("h2", { text: row.name }), h("div", { class: "idLine", text: row.id }),
    h("div", { class: "verdict" }, h("span", { class: `as-pill ${row.compliance.tone || ""}`, id: "detailStatus", text: row.compliance.label })),
    h("div", { class: "as-derive", id: "detailDerive", text: Derivation(row) }),
    h("div", { class: "as-tiles" },
      h("div", { class: "as-tile" }, h("span", { text: "原始面数" }), h("strong", { text: Num(row.source) })),
      h("div", { class: "as-tile" }, h("span", { text: row.kind === "external" ? "实际面数（登记）" : "实际面数（构建产物）" }), h("strong", { text: Num(row.actual) })),
      h("div", { class: "as-tile" }, h("span", { text: `限制 / 目标 · ${TARGET_TAG[row.target.kind] || ""}` }), h("strong", { text: Num(row.target.value) })),
      h("div", { class: "as-tile" }, h("span", { text: "面数降幅" }), h("strong", { text: Pct(row.reduction) }))),
    ratio == null ? null : h("div", { class: `as-bar ${row.compliance.tone || ""}${ratio > 1.001 ? " over" : ""}`, style: "margin-top:12px;height:8px" },
      h("span", { style: `width:${Math.min(100, ratio * 100).toFixed(1)}%` })));
}

function Derivation(row) {
  const { spec } = state;
  const threshold = `${(spec.minDecimationReduction * 100).toFixed(1)}%`;
  if (row.kind === "procedural") return `程序化 TZM：分类「${row.category}」预算 ${Num(row.target.value)} 三角，实际 ${Num(row.actual)}。`;
  if (row.kind === "external") {
    const record = row.record;
    if (row.compliance.retained) return `登记目标 ${Num(record.targetTriangles)}，选定游戏源只比它多 ${Pct(ReductionPercent(record.selectedGameSourceTriangles, record.targetTriangles))}（≤ ${threshold}）→ 5% 免减面，保留选定源拓扑；实际须等于选定源减去导出清理掉的面。`;
    return record.policy === "source"
      ? `保留原始拓扑：目标 = 登记的 ${Num(record.targetTriangles)}，实际须落在目标的 97%–100.1%。`
      : `指定目标 ${Num(record.targetTriangles)}（源 ${Num(record.sourceTriangles)}），实际须落在目标的 97%–100.1%。`;
  }
  const rule = TriangleRuleFor(spec, row.record);
  const source = row.record.sourceTriangles;
  if (row.target.kind === "special") return `指定特例：目标 ${Num(row.target.value)}，实际须落在目标的 97%–100%（不套用 ${Num(rule.limit)} 分类上限）。`;
  if (!Number.isFinite(source)) return `源模型缺席，原始面数待复核；分类上限 ${Num(rule.limit)}。`;
  const cut = ReductionPercent(source, rule.limit);
  if (row.target.kind === "keep5") return `原始 ${Num(source)} 超出上限 ${Num(rule.limit)}，但只会减 ${Pct(cut)}（≤ ${threshold}）→ 保留原始拓扑。`;
  if (row.target.kind === "reduce") return `原始 ${Num(source)} > 上限 ${Num(rule.limit)}，降幅 ${Pct(cut)} > ${threshold} → 减面到 ${Num(rule.limit)}，实际须在其 97%–100%。`;
  return `原始 ${Num(source)} ≤ 上限 ${Num(rule.limit)} → 不减面，保留原始拓扑${row.record.repair ? "（允许项目补件让最终数略高）" : ""}。`;
}

function SourceForm(form, row) {
  const { spec } = state;
  const record = row.record;
  form.append(h("h3", { text: "登记" }),
    TextField("名称", () => record.name, (value) => { record.name = value; }, { id: "fieldName" }),
    SelectField("分组", SOURCE_GROUP_IDS.map((id) => [id, GroupLabel(id)]), () => record.group, (value) => { record.group = value; }),
    NumberField("原始面数（选定源几何，留空 = 源缺席）", () => record.sourceTriangles, (value) => { record.sourceTriangles = value; }, { id: "fieldSource" }),
    NumberField("指定特例目标（留空 = 按分类规则）", () => spec.specialTriangleTargets[row.id], (value) => {
      if (value == null) delete spec.specialTriangleTargets[row.id]; else spec.specialTriangleTargets[row.id] = value;
    }, { id: "fieldSpecial" }),
    CheckField("项目补件（允许最终面数略高于原始）", () => record.repair, (value) => { if (value) record.repair = true; else delete record.repair; }),
    h("label", { class: "as-field" }, h("span", { text: "实际面数" }), h("div", { class: "as-readonly", text: `${Num(row.actual)} · 读 Model/Data_ModelIndex.json` })),
    h("h3", { text: "贴图" }),
    TextField("自带贴图", () => record.sourceTexture, (value) => { record.sourceTexture = value; }),
    TextField("游戏内贴图", () => record.runtimeTexture, (value) => { record.runtimeTexture = value; }),
    h("h3", { text: "说明" }),
    TextField("备注", () => record.note, (value) => { if (value) record.note = value; else delete record.note; }, { multiline: true, id: "fieldNote" }));
}

const EXTERNAL_EXTRA_LABELS = {
  selectedGameSourceTriangles: "选定游戏源面数", selectedGameVisibleSourceTriangles: "选定游戏源可见面数",
  exportRemovedZeroAreaTriangles: "导出剔除零面积面", exportTriangulationZeroAreaTriangles: "三角化产生的零面积面",
  exportRemovedWhollyEnclosedTriangles: "导出剔除的全封闭面",
};

function ExternalForm(form, row) {
  const record = row.record;
  form.append(h("h3", { text: "登记" }),
    TextField("名称", () => record.name, (value) => { record.name = value; }, { id: "fieldName" }),
    TextField("模型包", () => record.pack, (value) => { record.pack = value; }, { hint: "相对 Taierzhuang1938/Model/ 的 GLB 路径" }),
    SelectField("策略", EXTERNAL_POLICIES.map((id) => [id, id === "source" ? "source · 保留原始拓扑" : "target · 指定目标"]), () => record.policy, (value) => { record.policy = value; }),
    NumberField("原始面数", () => record.sourceTriangles, (value) => { record.sourceTriangles = value; }, { required: true, id: "fieldSource" }),
    NumberField("目标面数", () => record.targetTriangles, (value) => { record.targetTriangles = value; }, { required: true, id: "fieldTarget" }),
    NumberField("实际面数（构建脚本实测）", () => record.actualTriangles, (value) => { record.actualTriangles = value; }, { required: true, id: "fieldActual" }));
  const extras = Object.keys(EXTERNAL_EXTRA_LABELS).filter((key) => key in record);
  if (extras.length) {
    form.append(h("h3", { text: "导出清理（5% 免减面判定用）" }),
      extras.map((key) => NumberField(EXTERNAL_EXTRA_LABELS[key], () => record[key], (value) => { if (value == null) delete record[key]; else record[key] = value; }, { nullable: true })));
  }
  form.append(h("h3", { text: "贴图" }),
    TextField("自带贴图", () => record.sourceTexture, (value) => { record.sourceTexture = value; }),
    TextField("游戏内贴图", () => record.runtimeTexture, (value) => { record.runtimeTexture = value; }),
    h("h3", { text: "说明" }),
    TextField("备注", () => record.note, (value) => { record.note = value; }, { multiline: true, id: "fieldNote" }));
}

function RenderRuleDetail(detail, selection) {
  const list = state.spec.otherRules[selection.group] || [];
  const rule = list[selection.index];
  if (!rule) { state.selection = null; RenderDetail(); return; }
  detail.append(h("div", { class: "eyebrow", text: `规则卡 · ${selection.group}` }), h("h2", { text: rule.name }),
    h("div", { class: "as-form" },
      TextField("名称", () => rule.name, (value) => { rule.name = value; }),
      TextField("限制", () => rule.limit, (value) => { rule.limit = value; }, { hint: "可写 {sceneRenderLimits.triangles} / {sceneRenderLimits.drawCalls}，显示时换成当前数值" }),
      TextField("贴图", () => rule.texture, (value) => { rule.texture = value; }),
      TextField("说明", () => rule.note, (value) => { rule.note = value; }, { multiline: true })),
    h("div", { class: "as-detailActions" }, h("button", { type: "button", class: "as-btn small danger", onclick: () => {
      list.splice(selection.index, 1); state.selection = null; Changed(); RenderMain(); RenderDetail();
    } }, "删除这张规则卡")));
}

// ---------------------------------------------------------------- 增删

function AddAsset(view) {
  const id = prompt("新资产的编号（英文 PascalCase，与模型 / 构建产物里的名字一致）：", "");
  if (!id) return;
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(id)) { Banner("编号只能用字母、数字与下划线，且以字母开头。", "bad"); return; }
  const { spec } = state;
  if (spec.sourceAssets[id] || spec.externalGlb.some((record) => record.id === id)) { Banner(`编号 ${id} 已经登记过了。`, "bad"); return; }
  if (view === "external") {
    spec.externalGlb.push({ id, name: id, pack: "", sourceTriangles: 1, actualTriangles: 1, targetTriangles: 1, sourceTexture: "", runtimeTexture: "", policy: "source", note: "" });
    Changed(); Select("external", id);
  } else {
    spec.sourceAssets[id] = { name: id, group: view, sourceTriangles: null, sourceTexture: "", runtimeTexture: "" };
    Changed(); Select("source", id);
  }
}

function DeleteAsset(row) {
  if (!confirm(`删除「${row.name}」（${row.id}）这条登记？存盘前都可以「重新读取」撤回。`)) return;
  const { spec } = state;
  if (row.kind === "source") { delete spec.sourceAssets[row.id]; delete spec.specialTriangleTargets[row.id]; } else spec.externalGlb.splice(spec.externalGlb.indexOf(row.record), 1);
  state.selection = null;
  Changed(); RenderMain(); RenderDetail();
}

// ---------------------------------------------------------------- 改动、校验、存盘

const CurrentText = () => FormatAssetStandardsJson(state.spec);
const IsDirty = () => state.spec && CurrentText() !== state.originalText.replace(/\r\n/g, "\n");

function Changed() {
  state.validation = ValidateAssetStandards(state.spec);
  RenderNav();
  // 「全局规则」的输入框就在中栏里，重画会丢焦点；其余视图的输入都在右栏，中栏整块重画即可。
  if (state.view !== "rules") RenderMain();
  const row = CurrentRow();
  if (row) RenderDetailSummary(row);
  RefreshHeader();
}

function RefreshHeader() {
  const dirty = IsDirty();
  const label = $("saveState");
  label.className = "as-state";
  if (state.saving) label.textContent = "保存中…";
  else if (!state.writable) { label.classList.add(dirty ? "dirty" : "readonly"); label.textContent = dirty ? "有未保存修改 · 只读服务，请下载 JSON" : "只读 · 修改后下载 JSON"; }
  else if (dirty) { label.classList.add("dirty"); label.textContent = "有未保存的修改"; }
  else { label.classList.add("saved"); label.textContent = "已与盘上一致"; }
  const valid = $("validState");
  valid.hidden = state.validation.ok;
  valid.textContent = state.validation.ok ? "" : `${state.validation.errors.length} 处不合规，修正后才能保存`;
  valid.title = state.validation.errors.join("\n");
  $("saveButton").disabled = !state.writable || !dirty || !state.validation.ok || state.saving;
  document.title = `${dirty ? "● " : ""}资产规范与限制 · 血战滕县`;
}

function Banner(text, tone = "", action = null) {
  const banner = $("banner");
  banner.hidden = !text;
  banner.className = `as-banner ${tone}`;
  banner.replaceChildren(text || "");
  if (action) banner.append(h("button", { type: "button", class: "as-btn small", onclick: action.run }, action.label));
}

async function Sha1(buffer) {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await crypto.subtle.digest("SHA-1", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function FetchStatus() {
  try {
    const response = await fetch(STATUS_URL, { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch { return null; }
}

async function Load({ quiet = false } = {}) {
  const [specResponse, modelResponse, status] = await Promise.all([
    fetch(SPEC_URL, { cache: "no-store" }), fetch(MODEL_INDEX_URL, { cache: "no-store" }).catch(() => null), FetchStatus()]);
  if (!specResponse.ok) throw new Error(`读不到规范 ${SPEC_URL}（HTTP ${specResponse.status}）`);
  const bytes = await specResponse.arrayBuffer();
  const text = new TextDecoder().decode(bytes);
  state.spec = JSON.parse(text);
  state.originalText = text;
  state.revision = (await Sha1(bytes)) ?? status?.revision ?? null;
  state.serverKnown = !!status;
  state.writable = !!status?.writable;
  if (modelResponse?.ok) {
    const index = await modelResponse.json();
    state.models = new Map(index.models.map((model) => [model.name, model]));
  } else state.models = new Map();
  state.validation = ValidateAssetStandards(state.spec);
  if (!quiet) {
    const fallback = "修改后用「下载 JSON」替换 Taierzhuang1938/AssetPipeline/Data_AssetStandards.json。";
    if (!status) Banner(`没有连上本机预览服务的存盘口（/__assetStandards/status），本页只读：${fallback}`, "warn");
    else if (!status.writable) Banner(`${status.reason || "当前服务不能存盘"}，本页只读：${fallback}`, "warn");
    else if (!state.models.size) Banner("读不到构建产物 Model/Data_ModelIndex.json，程序化 TZM 与有源资产的实际面数显示为空。", "warn");
    else Banner("");
  }
  RenderAll();
}

async function Save() {
  if (!state.writable || !state.validation.ok || !IsDirty()) return;
  state.saving = true; RefreshHeader();
  try {
    const response = await fetch(SAVE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ doc: state.spec, revision: state.revision }) });
    const result = await response.json().catch(() => ({}));
    if (response.status === 409) {
      Banner("规范已在别处改过（版本号对不上）。先「重新读取」拿到最新版本再改，或下载当前修改另行合并。", "bad", { label: "重新读取（丢弃本页修改）", run: () => Reload(true) });
      return;
    }
    if (!response.ok || !result.ok) {
      Banner(`保存失败：${result.error || `HTTP ${response.status}`}${result.details?.length ? `\n${result.details.join("\n")}` : ""}`, "bad");
      return;
    }
    state.originalText = CurrentText();
    state.revision = result.revision;
    Banner(`已保存到 ${result.file}${result.warnings?.length ? `（提示：${result.warnings.join("；")}）` : ""}`);
  } catch (error) {
    Banner(`保存失败：${error.message}`, "bad");
  } finally {
    state.saving = false; RefreshHeader();
  }
}

function Download() {
  const blob = new Blob([CurrentText()], { type: "application/json" });
  const link = h("a", { href: URL.createObjectURL(blob), download: "Data_AssetStandards.json" });
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function Reload(force = false) {
  if (!force && IsDirty() && !confirm("丢弃未保存的修改，重新读取盘上的规范？")) return;
  await Load();
}

async function Poll() {
  if (!state.serverKnown || state.saving) return;
  const status = await FetchStatus();
  if (!status || !status.revision || status.revision === state.revision) return;
  if (!IsDirty()) { await Load({ quiet: true }); Banner("规范文件在别处被改过，已自动同步到最新。"); return; }
  Banner("规范文件在别处被改过，而本页有未保存的修改：保存会被拒绝（409）。", "warn", { label: "重新读取（丢弃本页修改）", run: () => Reload(true) });
}

// ---------------------------------------------------------------- 路由与装配

function Go(view) {
  state.view = view;
  state.selection = null;
  state.search = "";
  state.status = "all";
  WriteHash();
  RenderAll();
}

function WriteHash() {
  const params = new URLSearchParams({ view: state.view });
  if (state.selection?.id) params.set("id", state.selection.id);
  history.replaceState(null, "", `#${params}`);
}

function ReadHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const view = params.get("view");
  const known = ["overview", "rules", ...state.spec.groups.map((group) => group.id)];
  state.view = known.includes(view) ? view : "overview";
  const id = params.get("id");
  if (id && IsTableView(state.view)) {
    const row = RowsFor(state.view).find((entry) => entry.id === id);
    if (row) state.selection = { kind: row.kind, id };
  }
}

function RenderAll() {
  RenderNav();
  RenderMain();
  RenderDetail();
  RefreshHeader();
}

async function Main() {
  $("saveButton").addEventListener("click", Save);
  $("downloadButton").addEventListener("click", Download);
  $("reloadButton").addEventListener("click", () => Reload());
  addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); Save(); }
  });
  addEventListener("beforeunload", (event) => { if (IsDirty()) { event.preventDefault(); event.returnValue = ""; } });
  try {
    await Load();
    ReadHash();
    RenderAll();
    state.ready = true;
    setInterval(Poll, POLL_MS);
  } catch (error) {
    Banner(`读取规范失败：${error.message}`, "bad");
    state.error = error.message;
  }
}

Main();
