// 编辑器 DOM 小工具箱：面板、分节、滑杆、下拉、列表、读数。
//
// 为什么不直接在每个编辑器里写 innerHTML：五个编辑器加起来有一百多个控件，
// 每个都要「拿到值 / 回写值 / 高亮当前项」三件事。散着写的下场是每个编辑器
// 各有一套细微不同的取值约定，改一个控件要在五个文件里找。
//
// 约定：每个工厂函数返回 `{ root, ... }`，root 是可以直接 append 的元素，
// 其余是这个控件自己的方法（Set / Value / Refresh）。**没有任何全局状态。**
//
// 这一层不 import three，也不认识游戏里的任何东西 —— 只有 DOM。

/** 建一个元素。className 与文本都可选。 */
export function El(tag, className = "", text = "") {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

/**
 * 一块面板。
 * @param {object} options
 *   title    标题
 *   sub      标题右边的小字（一般写快捷键或来源文件）
 *   variant  "launcher" | "work" | "work wide"
 *   onClose  给了就画一个 × 按钮
 */
export function Panel({ title = "", sub = "", variant = "work", onClose = null } = {}) {
  const root = El("div", `edPanel ${variant}`);
  const head = El("div", "edHead");
  const titleEl = El("div", "edTitle", title);
  head.appendChild(titleEl);
  const subEl = El("div", "edSub", sub);
  head.appendChild(subEl);
  if (onClose) {
    const x = El("div", "edX", "×");
    x.addEventListener("click", onClose);
    head.appendChild(x);
  }
  const body = El("div", "edBody");
  root.appendChild(head);
  root.appendChild(body);
  return {
    root, body,
    SetTitle: (t) => { titleEl.textContent = t; },
    SetSub: (t) => { subEl.textContent = t; },
  };
}

/** 一个分节（标题 + 内容容器）。返回内容容器，直接往里塞控件。 */
export function Section(parent, title) {
  const section = El("div", "edSection");
  section.appendChild(El("div", "h", title));
  const box = El("div", "b");
  section.appendChild(box);
  parent.appendChild(section);
  return box;
}

/** 带左侧标签的一行。control 直接放进右半边。 */
export function Row(parent, label, control) {
  const row = El("div", "edRow");
  row.appendChild(El("div", "l", label));
  const cell = El("div", "c");
  if (control) cell.appendChild(control);
  row.appendChild(cell);
  parent.appendChild(row);
  return cell;
}

export function Button(parent, label, onClick, { cls = "", wide = false } = {}) {
  const btn = El("div", `edBtn ${wide ? "wide " : ""}${cls}`, label);
  btn.addEventListener("click", (e) => { e.preventDefault(); onClick(btn); });
  parent.appendChild(btn);
  return btn;
}

/** 一排按钮。返回容器，方便后面继续往里加。 */
export function ButtonRow(parent, specs) {
  const box = El("div", "edBtns");
  for (const spec of specs) Button(box, spec.label, spec.onClick, { cls: spec.cls || "" });
  parent.appendChild(box);
  return box;
}

/**
 * 开关按钮。value 是初值，onChange 拿到新值。
 * 返回 { root, Set(v), get value }。
 */
export function Toggle(parent, label, value, onChange) {
  let on = !!value;
  const btn = El("div", `edBtn${on ? " on" : ""}`, label);
  const Apply = () => btn.classList.toggle("on", on);
  btn.addEventListener("click", () => { on = !on; Apply(); onChange(on); });
  parent.appendChild(btn);
  return {
    root: btn,
    Set: (v) => { on = !!v; Apply(); },
    get value() { return on; },
  };
}

/**
 * 滑杆。标签右侧实时显示数值（等宽，不跳动）。
 * @returns {{root: HTMLElement, Set: Function, Value: Function}}
 */
export function Slider(parent, {
  label, min = 0, max = 1, step = 0.01, value = 0, format = null, onInput = null,
}) {
  const row = El("div", "edRow");
  const labelEl = El("div", "l");
  labelEl.textContent = label;
  const cell = El("div", "c");
  const input = El("input");
  input.type = "range";
  input.min = String(min); input.max = String(max); input.step = String(step);
  input.value = String(value);
  const readout = El("span", "edVal");
  const Fmt = format || ((v) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)));
  const Show = () => { readout.textContent = Fmt(parseFloat(input.value)); };
  Show();
  input.addEventListener("input", () => { Show(); if (onInput) onInput(parseFloat(input.value)); });
  cell.appendChild(input);
  row.appendChild(labelEl);
  row.appendChild(cell);
  const tail = El("div", "l");
  tail.style.flex = "0 0 44px";
  tail.style.textAlign = "right";
  tail.appendChild(readout);
  row.appendChild(tail);
  parent.appendChild(row);
  return {
    root: row,
    Set: (v) => { input.value = String(v); Show(); },
    Value: () => parseFloat(input.value),
  };
}

/**
 * 下拉。options 可以是 ["a","b"] 或 [{value,label}]。
 */
export function Select(parent, label, options, value, onChange) {
  const select = El("select");
  const Fill = (list) => {
    select.innerHTML = "";
    for (const raw of list) {
      const opt = typeof raw === "string" ? { value: raw, label: raw } : raw;
      const el = El("option", "", opt.label);
      el.value = opt.value;
      select.appendChild(el);
    }
  };
  Fill(options);
  select.value = value != null ? String(value) : "";
  select.addEventListener("change", () => onChange(select.value));
  if (label) Row(parent, label, select); else parent.appendChild(select);
  return {
    root: select,
    Set: (v) => { select.value = String(v); },
    Fill: (list, v) => { Fill(list); if (v != null) select.value = String(v); },
    Value: () => select.value,
  };
}

/** 一排「选一个」的小圆片。比下拉快一步，适合 3—8 个短选项。 */
export function Chips(parent, options, value, onChange) {
  const box = El("div", "edChips");
  const made = [];
  const Apply = (v) => { for (const m of made) m.el.classList.toggle("on", m.value === v); };
  for (const raw of options) {
    const opt = typeof raw === "string" ? { value: raw, label: raw } : raw;
    const chip = El("div", "edChip", opt.label);
    if (opt.title) chip.title = opt.title;
    chip.addEventListener("click", () => { Apply(opt.value); onChange(opt.value); });
    box.appendChild(chip);
    made.push({ el: chip, value: opt.value });
  }
  Apply(value);
  parent.appendChild(box);
  return { root: box, Set: Apply };
}

/**
 * 可滚动的选择列表。items: [{ id, name, tail, title }]。
 * @returns {{root, Fill(items), Select(id), Value()}}
 */
export function ListBox(parent, { height = 150, onPick = null } = {}) {
  const root = El("div", "edList");
  root.style.maxHeight = `${height}px`;
  let current = null;
  const rows = new Map();
  const Select_ = (id, fire = false) => {
    current = id;
    for (const [key, el] of rows) el.classList.toggle("on", key === id);
    const el = rows.get(id);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
    if (fire && onPick) onPick(id);
  };
  const Fill = (items) => {
    root.innerHTML = "";
    rows.clear();
    for (const item of items) {
      const el = El("div", "it");
      el.appendChild(El("span", "n", item.name));
      if (item.tail) el.appendChild(El("span", "t", item.tail));
      if (item.title) el.title = item.title;
      el.addEventListener("click", () => Select_(item.id, true));
      root.appendChild(el);
      rows.set(item.id, el);
    }
    if (current != null && rows.has(current)) Select_(current);
  };
  parent.appendChild(root);
  return {
    root, Fill,
    Select: (id, fire = false) => Select_(id, fire),
    Value: () => current,
  };
}

/**
 * 键值读数板。每帧刷新的数字都走它 —— 只改 textContent，不重建 DOM
 * （重建 DOM 会让正在滚动的面板每帧跳回顶部）。
 */
export function Facts(parent) {
  const root = El("div", "edFacts");
  const rows = new Map();
  parent.appendChild(root);
  return {
    root,
    /** @param {string} tone "" | "warn" | "bad" | "good" */
    Set(key, value, tone = "") {
      let row = rows.get(key);
      if (!row) {
        const el = El("div", "f");
        el.appendChild(El("span", "k", key));
        const v = El("span", "v num");
        el.appendChild(v);
        root.appendChild(el);
        row = { el, v };
        rows.set(key, row);
      }
      const text = String(value);
      if (row.v.textContent !== text) row.v.textContent = text;
      row.v.className = `v num${tone ? " " + tone : ""}`;
    },
    Clear() { root.innerHTML = ""; rows.clear(); },
  };
}

/** 一段说明文字。warn=true 时用琥珀色（写「这条会改到运行时状态」之类的告警）。 */
export function Note(parent, text, warn = false) {
  const el = El("div", `edNote${warn ? " warn" : ""}`, text);
  parent.appendChild(el);
  return el;
}

/** 多行文本框（导入/导出 JSON 用）。 */
export function TextArea(parent, { rows = 4, placeholder = "" } = {}) {
  const el = El("textarea");
  el.rows = rows;
  el.placeholder = placeholder;
  // 编辑器打开时游戏的键位路由还在监听 document：不拦住的话在这里打字
  // 会顺手触发装填、白刃、切枪。stopPropagation 比「让路由器认识每个输入框」可靠。
  for (const type of ["keydown", "keyup", "keypress"]) {
    el.addEventListener(type, (e) => e.stopPropagation());
  }
  parent.appendChild(el);
  return el;
}
