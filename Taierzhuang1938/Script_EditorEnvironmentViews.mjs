// 环境编辑器的预设 / 组件 / 参数视图（docs/Data_Environment.md §8）。只认 DOM，不 import three。
//
// 总览、区域检查器、预设资源检查器三处用的是这同一套 PresetView：分类图标筛选 + 搜索 + 组件卡片 + 「添加组件」搜索菜单。
// 卡片与控件全按 Data_EnvComponents 的声明生成：新加一种组件不用改这里；参数的 kind 决定控件
//（number / angle 滑条 + 数值框，color 取色，rgb 三通道 + 色块，enum 下拉，bool 勾选）。
// 能做昼夜变化的参数前面有一颗「固定值 / 关键帧」开关：关键帧模式下改值 = 改时间指针那一帧（指针不在帧上就在那一刻插一帧）。
//
// 视图本身不存状态：预设文档、时间、折叠 / 筛选 / 搜索都从 host 取（host 是 Script_EditorEnvironment 的控制器），
// 改动一律走 host.EditPreset（进撤销栈、标脏、通知环境系统）。时间在走的时候只调 Sync()，就地刷新数值，不重建 DOM（不丢焦点）。

import { ENV_CATEGORIES, ENV_COMPONENTS } from "./Data_EnvComponents.mjs";
import { ENV_RUNTIME } from "./Data_Tuning_Environment.mjs";
import {
  CloneValue, EvalParamValue, HexToRgb01, IsTrack, KeyIndexAt, LinearToSrgb, Rgb01ToHex, SetKeyAt, ToTrack, ToConstant, SameValue,
} from "./Script_EnvTrack.mjs";

export function El(tag, className = "", text = "") {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

export function IconButton(glyph, tip, onClick, className = "") {
  const b = El("button", `envIcon ${className}`.trim(), glyph);
  b.type = "button";
  b.title = tip;
  b.setAttribute("aria-label", tip);
  b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); onClick(e); });
  return b;
}

/** 事件落在可输入的控件上（数值框、文字框、下拉）：键盘归它，不归游戏。 */
export function IsTyping(target) {
  return /^(INPUT|SELECT|TEXTAREA)$/.test(target?.tagName || "") && !["range", "checkbox", "color"].includes(target.type);
}

/**
 * 面板根上的事件闸：鼠标一律不往下传（不抢指针锁、不开枪）；点到面板的空处把焦点给面板（撤销 / 重做快捷键才收得到）；
 * 键盘只在打字、或面板自己处理了（onKey 返回 true）时不往下传 —— 焦点在面板上照样能用 WASD 飞。
 */
export function GuardPanelEvents(root, onKey) {
  root.tabIndex = -1;
  for (const type of ["mousedown", "pointerdown", "wheel", "contextmenu", "click", "dblclick"]) {
    root.addEventListener(type, (e) => {
      if (type === "pointerdown" && !e.target.closest?.("input, select, textarea, button")) root.focus({ preventScroll: true });
      e.stopPropagation();
    });
  }
  for (const type of ["keydown", "keyup"]) {
    root.addEventListener(type, (e) => {
      const handled = type === "keydown" && onKey(e);
      if (handled || IsTyping(e.target)) e.stopPropagation();
    });
  }
}

export function FormatHour(hour) {
  const total = Math.round(((hour % 24) + 24) % 24 * 60) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function Digits(step) {
  if (!step || step >= 1) return 0;
  return Math.min(6, Math.max(0, Math.ceil(-Math.log10(step) - 1e-9)));
}

function FormatNumber(param, value) {
  return Number.isFinite(value) ? value.toFixed(Digits(param.step)) : "—";
}

/** rgb（HDR 倍率）显示成色块：按最亮的通道归一，再转 sRGB。 */
function RgbSwatch(rgb) {
  const max = Math.max(1e-6, ...rgb);
  const norm = rgb.map((v) => Math.max(0, v) / Math.max(1, max));
  return Rgb01ToHex(norm.map((v) => LinearToSrgb(Math.min(1, v))));
}

const DECL_BY_TYPE = new Map(ENV_COMPONENTS.map((d) => [d.type, d]));
const CATEGORY_BY_ID = new Map(ENV_CATEGORIES.map((c) => [c.id, c]));

// ---------------------------------------------------------------------------
// 参数控件

/**
 * 特殊参数的控件：参数声明写 `control: "<名字>"`，这里登记同名工厂就换成它（不写就按 kind 用通用控件）。
 * 工厂签名同 ParamControl：(param, onInput) → { root, Set(value), focused() }。
 */
const CUSTOM_CONTROLS = new Map();
export function RegisterParamControl(name, factory) { CUSTOM_CONTROLS.set(name, factory); }

/**
 * 一个参数的控件。onInput(value, { commit }) —— 拖动中 commit:false（撤销栈里合成一步），松手 / 回车 commit:true。
 * → { root, Set(value), focused() }
 */
function ParamControl(param, onInput) {
  if (param.control && CUSTOM_CONTROLS.has(param.control)) return CUSTOM_CONTROLS.get(param.control)(param, onInput);
  const root = El("div", `envCtl envCtl-${param.kind}`);
  let current = CloneValue(param.default);
  let focusedFlag = false;
  const Focus = (on) => { focusedFlag = on; };
  if (param.kind === "number" || param.kind === "angle") {
    const range = El("input", "envRange");
    range.type = "range";
    range.min = String(param.min ?? 0); range.max = String(param.max ?? 1); range.step = String(param.step ?? 0.01);
    const num = El("input", "envNum");
    num.type = "number"; num.step = String(param.step ?? 0.01);
    const Paint = () => { range.style.setProperty("--fill", `${((current - range.min) / ((range.max - range.min) || 1)) * 100}%`); };
    range.addEventListener("input", () => { current = Number(range.value); num.value = FormatNumber(param, current); Paint(); onInput(current, { commit: false }); });
    range.addEventListener("change", () => { Focus(false); onInput(Number(range.value), { commit: true }); });
    range.addEventListener("pointerdown", () => Focus(true));
    // 松手可能落在滑条外面（pointerup 不一定回到它身上）：change / 失焦也算松手，免得这一行从此不再跟着时间刷新
    range.addEventListener("pointerup", () => Focus(false));
    range.addEventListener("blur", () => Focus(false));
    num.addEventListener("focus", () => Focus(true));
    num.addEventListener("blur", () => Focus(false));
    num.addEventListener("change", () => {
      const v = Number(num.value);
      if (!Number.isFinite(v)) { num.value = FormatNumber(param, current); return; }
      current = v; range.value = String(v); Paint(); onInput(v, { commit: true });
    });
    root.append(range, num);
    return {
      root, focused: () => focusedFlag,
      Set(value) { current = value; range.value = String(value); num.value = FormatNumber(param, value); Paint(); },
    };
  }
  if (param.kind === "color") {
    const picker = El("input", "envColor");
    picker.type = "color";
    const hex = El("input", "envHex");
    hex.type = "text"; hex.spellcheck = false; hex.maxLength = 7;
    picker.addEventListener("input", () => { current = picker.value; hex.value = current; onInput(current, { commit: false }); });
    picker.addEventListener("change", () => onInput(picker.value, { commit: true }));
    hex.addEventListener("focus", () => Focus(true));
    hex.addEventListener("blur", () => Focus(false));
    hex.addEventListener("change", () => {
      const v = hex.value.trim().startsWith("#") ? hex.value.trim() : `#${hex.value.trim()}`;
      if (!HexToRgb01(v)) { hex.value = current; return; }
      current = v.toLowerCase(); picker.value = current; onInput(current, { commit: true });
    });
    root.append(picker, hex);
    return { root, focused: () => focusedFlag, Set(value) { current = value; picker.value = value; hex.value = value; } };
  }
  if (param.kind === "rgb") {
    const swatch = El("input", "envColor");
    swatch.type = "color";
    swatch.title = "取色：保留最亮通道的强度，只换色相";
    const nums = [0, 1, 2].map((i) => {
      const n = El("input", "envNum envRgb");
      n.type = "number"; n.step = String(param.step ?? 0.01);
      n.title = ["R", "G", "B"][i];
      n.addEventListener("focus", () => Focus(true));
      n.addEventListener("blur", () => Focus(false));
      n.addEventListener("change", () => {
        const v = Number(n.value);
        if (!Number.isFinite(v)) { n.value = FormatNumber(param, current[i]); return; }
        current = current.map((c, j) => (j === i ? v : c));
        swatch.value = RgbSwatch(current);
        onInput(current, { commit: true });
      });
      return n;
    });
    const FromSwatch = (commit) => {
      const picked = HexToRgb01(swatch.value).map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
      const scale = Math.max(...current, 1e-6) / Math.max(...picked, 1e-6);
      current = picked.map((v) => Math.round(v * scale * 1000) / 1000);
      nums.forEach((n, i) => { n.value = FormatNumber(param, current[i]); });
      onInput(current, { commit });
    };
    swatch.addEventListener("input", () => FromSwatch(false));
    swatch.addEventListener("change", () => FromSwatch(true));
    root.append(swatch, ...nums);
    return {
      root, focused: () => focusedFlag,
      Set(value) { current = CloneValue(value); nums.forEach((n, i) => { n.value = FormatNumber(param, value[i]); }); swatch.value = RgbSwatch(value); },
    };
  }
  if (param.kind === "enum") {
    const select = El("select", "envSelect");
    for (const option of param.options || []) {
      const o = El("option", "", option.label);
      o.value = option.value;
      select.appendChild(o);
    }
    select.addEventListener("change", () => onInput(select.value, { commit: true }));
    root.append(select);
    return { root, focused: () => false, Set(value) { select.value = value; } };
  }
  const box = El("input", "envCheck");
  box.type = "checkbox";
  box.addEventListener("change", () => onInput(box.checked, { commit: true }));
  root.append(box);
  return { root, focused: () => false, Set(value) { box.checked = !!value; } };
}

// ---------------------------------------------------------------------------
// 一行参数

function ParamRow(host, decl, param) {
  const row = El("div", "envParam");
  row.dataset.param = `${decl.type}.${param.key}`;
  const label = El("label", "envParamLabel", param.label);
  label.title = [param.hint, `${decl.type}.${param.key}`].filter(Boolean).join(" · ");
  const animatable = param.animatable !== false;
  const mode = animatable ? IconButton("◇", "固定值 / 关键帧", () => host.ToggleParamMode(decl.type, param.key), "envMode") : El("span", "envModeStub");
  const keyBtn = animatable ? IconButton("◆", "在时间指针处打 / 删关键帧", () => host.ToggleKeyAtCursor(decl.type, param.key), "envKey") : El("span", "envModeStub");
  const curve = animatable ? IconButton("⌁", "在昼夜时间轴里看这一项", () => host.OpenTimeline(decl.type, param.key), "envCurve") : El("span", "envModeStub");
  const control = ParamControl(param, (value, { commit }) => host.SetParam(decl.type, param.key, value, { commit }));
  row.append(label, mode, control.root, keyBtn, curve);
  function Sync() {
    const comp = host.preset?.components?.[decl.type];
    const raw = comp?.params?.[param.key];
    const track = IsTrack(raw);
    row.classList.toggle("animated", track);
    row.classList.toggle("defaulted", raw === undefined);
    const onKey = track && KeyIndexAt(raw, host.hour, ENV_RUNTIME.keySnapH) >= 0;
    row.classList.toggle("onKey", onKey);
    if (animatable) {
      mode.textContent = track ? "⏱" : "◇";
      mode.title = track ? `关键帧（${raw.keys.length} 帧）· 点一下改回固定值` : "固定值 · 点一下改成关键帧";
      keyBtn.hidden = !track;
      keyBtn.classList.toggle("on", onKey);
    }
    if (!control.focused()) control.Set(EvalParamValue(param, raw, host.hour));
  }
  return { row, Sync };
}

// ---------------------------------------------------------------------------
// 组件卡片

function ComponentCard(host, decl) {
  const card = El("div", "envCard");
  card.dataset.type = decl.type;
  const head = El("div", "envCardHead");
  const chevron = El("span", "envChevron", "▸");
  const icon = El("span", "envCardIcon", decl.icon);
  const title = El("span", "envCardTitle", decl.label);
  title.title = decl.summary;
  const tag = El("span", "envCardTag", CATEGORY_BY_ID.get(decl.category)?.label || "");
  const enabled = El("input", "envCheck envEnabled");
  enabled.type = "checkbox";
  enabled.title = "启用（关掉 = 这个组件不参与，下层区域接手）";
  enabled.addEventListener("click", (e) => e.stopPropagation());
  enabled.addEventListener("change", () => host.SetComponentEnabled(decl.type, enabled.checked));
  const tools = El("span", "envCardTools");
  tools.append(
    IconButton("⧉", "复制这个组件", () => host.CopyComponent(decl.type)),
    IconButton("⎘", "粘贴组件参数", () => host.PasteComponent(decl.type)),
    IconButton("↺", "重置为默认值", () => host.ResetComponent(decl.type)),
    IconButton("✕", "从预设里删掉这个组件", () => host.RemoveComponent(decl.type), "danger"),
  );
  head.append(chevron, icon, title, tag, tools, enabled);
  head.addEventListener("click", () => host.ToggleCollapsed(decl.type));
  const body = El("div", "envCardBody");
  const rows = [];
  let group = null;
  for (const param of decl.params) {
    if (param.group && param.group !== group) { group = param.group; body.appendChild(El("div", "envGroup", group)); }
    const row = ParamRow(host, decl, param);
    rows.push(row);
    body.appendChild(row.row);
  }
  card.append(head, body);
  function Sync() {
    const comp = host.preset?.components?.[decl.type];
    const collapsed = host.IsCollapsed(decl.type);
    card.classList.toggle("collapsed", collapsed);
    chevron.textContent = collapsed ? "▸" : "▾";
    enabled.checked = comp?.enabled !== false;
    card.classList.toggle("disabled", comp?.enabled === false);
    const live = host.LiveSource(decl.type);
    card.classList.toggle("live", !!live);
    card.title = live ? "" : "这个组件此刻没有生效：更高优先级的区域在提供它，或观察点不在这个区域里";
    if (!collapsed) for (const r of rows) r.Sync();
  }
  return { card, Sync, decl };
}

// ---------------------------------------------------------------------------
// 预设视图：分类筛选 + 搜索 + 卡片 + 添加组件

/**
 * @param {object} host 控制器：preset / hour / ui / EditPreset… 见 Script_EditorEnvironment 的 PresetViewHost
 * → { root, Rebuild(), Sync() }
 */
export function PresetView(host) {
  const root = El("div", "envPresetView");
  const filters = El("div", "envFilters");
  const search = El("input", "envSearch");
  search.type = "search";
  search.placeholder = "搜索组件 / 参数";
  search.addEventListener("input", () => { host.ui.search = search.value; host.SaveUi(); ApplyFilter(); });
  const list = El("div", "envCards");
  const empty = El("div", "envEmpty");
  const addWrap = El("div", "envAddWrap");
  const addBtn = El("button", "envAdd", "＋ 添加组件");
  addBtn.type = "button";
  const menu = El("div", "envAddMenu");
  menu.hidden = true;
  const menuSearch = El("input", "envSearch");
  menuSearch.type = "search";
  menuSearch.placeholder = "搜索要添加的组件";
  const menuList = El("div", "envAddList");
  menu.append(menuSearch, menuList);
  addWrap.append(addBtn, menu);
  root.append(filters, search, list, empty, addWrap);

  let cards = [];

  function BuildFilters() {
    filters.textContent = "";
    const all = IconButton("全部", "全部组件", () => { host.ui.filter = "all"; host.SaveUi(); ApplyFilter(); }, "envFilter");
    all.dataset.filter = "all";
    filters.appendChild(all);
    for (const cat of ENV_CATEGORIES) {
      const b = IconButton(cat.icon, cat.label, () => { host.ui.filter = cat.id; host.SaveUi(); ApplyFilter(); }, "envFilter");
      b.dataset.filter = cat.id;
      filters.appendChild(b);
    }
  }

  function Matches(card) {
    const filter = host.ui.filter || "all";
    if (filter !== "all" && card.decl.category !== filter) return false;
    const q = (host.ui.search || "").trim().toLowerCase();
    if (!q) return true;
    const decl = card.decl;
    return [decl.type, decl.label, decl.summary, ...decl.params.map((p) => `${p.key} ${p.label}`)].some((t) => String(t).toLowerCase().includes(q));
  }

  function ApplyFilter() {
    for (const b of filters.children) b.classList.toggle("on", b.dataset.filter === (host.ui.filter || "all"));
    let shown = 0;
    for (const card of cards) { const ok = Matches(card); card.card.hidden = !ok; if (ok) shown += 1; }
    empty.hidden = shown > 0;
    empty.textContent = cards.length ? "没有符合筛选的组件" : "这份预设还没有组件：点下面「添加组件」";
  }

  function BuildMenu() {
    const q = menuSearch.value.trim().toLowerCase();
    menuList.textContent = "";
    const have = new Set(Object.keys(host.preset?.components || {}));
    for (const cat of ENV_CATEGORIES) {
      const items = ENV_COMPONENTS.filter((d) => d.category === cat.id && !have.has(d.type)
        && (!q || `${d.type} ${d.label} ${d.summary}`.toLowerCase().includes(q)));
      if (!items.length) continue;
      menuList.appendChild(El("div", "envAddCat", `${cat.icon} ${cat.label}`));
      for (const decl of items) {
        const item = El("button", "envAddItem");
        item.type = "button";
        item.append(El("b", "", `${decl.icon} ${decl.label}`), El("span", "", decl.summary));
        item.addEventListener("click", () => { CloseMenu(); host.AddComponent(decl.type); });
        menuList.appendChild(item);
      }
    }
    if (!menuList.children.length) menuList.appendChild(El("div", "envEmpty", have.size === ENV_COMPONENTS.length ? "每种组件都已经有了（同一种只留一份）" : "没有匹配的组件"));
  }
  function CloseMenu() { menu.hidden = true; addBtn.classList.remove("on"); }
  addBtn.addEventListener("click", () => {
    if (!menu.hidden) { CloseMenu(); return; }
    menu.hidden = false; addBtn.classList.add("on"); menuSearch.value = ""; BuildMenu(); menuSearch.focus();
  });
  menuSearch.addEventListener("input", BuildMenu);
  menuSearch.addEventListener("keydown", (e) => {
    if (e.key === "Escape") CloseMenu();
    if (e.key === "Enter") menuList.querySelector(".envAddItem")?.click();
  });

  function Rebuild() {
    list.textContent = "";
    cards = [];
    const comps = host.preset?.components || {};
    for (const decl of ENV_COMPONENTS) {
      if (!comps[decl.type]) continue;
      const card = ComponentCard(host, decl);
      cards.push(card);
      list.appendChild(card.card);
    }
    search.value = host.ui.search || "";
    addWrap.hidden = !host.preset;
    CloseMenu();
    ApplyFilter();
    Sync();
  }

  function Sync() { for (const card of cards) if (!card.card.hidden) card.Sync(); }

  BuildFilters();
  return { root, Rebuild, Sync };
}

// ---------------------------------------------------------------------------
// 参数改动（给控制器用的纯函数：在 hour 把 value 写进参数 raw）

/** 固定值直接换；关键帧改指针那一帧（不在帧上就插一帧）。→ 新的参数值 */
export function WriteParamValue(raw, value, hour) {
  if (IsTrack(raw)) return SetKeyAt(raw, hour, value, { snapH: ENV_RUNTIME.keySnapH }).track;
  return CloneValue(value);
}

/** 固定值 ↔ 关键帧。改成关键帧时：预设有几套表现（looks）就在每套的时刻各放一帧同值（tag 联动），否则只在指针处放一帧。 */
export function ToggleParamValue(param, raw, hour, looks = []) {
  if (IsTrack(raw)) return ToConstant(param, raw, hour);
  const value = raw === undefined ? CloneValue(param.default) : raw;
  if (looks.length) return ToTrack(value, looks.map((l) => l.hour), looks.map((l) => l.id));
  return ToTrack(value, [hour]);
}

/** 指针处有帧就删（最后一帧不删），没有就按此刻的值插一帧。 */
export function ToggleKeyValue(param, raw, hour) {
  if (!IsTrack(raw)) return raw;
  const at = KeyIndexAt(raw, hour, ENV_RUNTIME.keySnapH);
  if (at >= 0) {
    if (raw.keys.length <= 1) return raw;
    return { ...raw, keys: raw.keys.filter((_, i) => i !== at).map(CloneValue) };
  }
  return SetKeyAt(raw, hour, EvalParamValue(param, raw, hour), { snapH: 0 }).track;
}

export function ComponentChanged(a, b) { return !SameValue(JSON.stringify(a), JSON.stringify(b)); }
export { DECL_BY_TYPE };
