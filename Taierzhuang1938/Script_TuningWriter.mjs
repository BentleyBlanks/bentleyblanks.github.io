// Script_TuningWriter.mjs —— 调参表的**源码级**改写器（纯 Node：不 import three、不碰 DOM、不读文件）。
//
// 敌军 AI 编辑器（docs/Data_EnemyAi.md §14）拖完滑杆要能「保存到源码」。保存的不是
// 一个序列化后的 JSON，而是**就地改那一个数字字面量** —— 五张 `Data_Tuning_Ai*.mjs`
// 里每一组数上面都压着一大段「为什么是这个数」的账（实跑取证、失败过的旧值、
// 与别的系统的口径关系）。把表 `JSON.stringify` 回去等于把那些账全删了，
// 于是下一个人只看得见数字看不见理由 —— 这一层存在的全部意义就是不让那件事发生。
//
// 契约（docs/Data_EnemyAi.md §14.3）：
//   ApplyTuningChanges(source, changes) -> { source, applied: [{path, from, to}], missing: [path] }
//   ReadTuningValue(source, path)       -> number | boolean | undefined
//   changes: [{ path: "COVER_CYCLE.peekMinS", value: 0.8 }]
//
// 三条硬规矩：
//   1. **只替换字面量本身**：`key: 0.65` 里的 `0.65` 那几个字符。注释、缩进、
//      行尾逗号、换行风格（CRLF/LF）一个字节都不动 —— 保存完 `git diff` 只有一行。
//   2. **按花括号层级走路径**，不按正则找键名：`GRENADE.minM` 与 `INVESTIGATE.minM`
//      是两个数，靠名字找必然串。路径的每一段都在**当前这一层**里找，找不到就 missing。
//   3. **改不动的一律 missing，不猜**：`Math.PI * 0.5`、`COVER_WEIGHTS`（引用别的组）、
//      字符串、对象/数组本身都不是「一个数」。类型也要对得上：布尔位只收布尔，
//      数字位只收有限数 —— 往 `steerPathProbe` 里写个 0 比拒绝它更糟。
//
// 数组元素用下标当路径段：`SQUAD.slots.2.lateral`、`AIM.stanceScale.1`、`SIGHT_BY_STANCE.0`。
// 组的写法三种都认：`export const G = Freeze({`、`export const G = Object.freeze({`、
// `export const G = {`（`SIGHT_BY_STANCE` 就是裸数组，没包 Freeze）。

const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[A-Za-z0-9_$]/;
// 数字字面量：整数 / 小数 / 科学计数 / 负号。**不含**表达式与 Infinity/NaN。
const NUMBER_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function IsSpace(ch) {
  return ch === " " || ch === "\t" || ch === "\r" || ch === "\n" || ch === "\f" || ch === "\v";
}

/** 跳过空白与注释（`//` 行注释、`/* *\/` 块注释）。数据表里没有正则字面量，除法也没有。 */
function SkipTrivia(source, index) {
  let i = index;
  for (;;) {
    while (i < source.length && IsSpace(source[i])) i += 1;
    if (source[i] === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }
    if (source[i] === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end < 0 ? source.length : end + 2;
      continue;
    }
    return i;
  }
}

/** 从引号处跳过一整个字符串（含转义），返回闭引号之后的下标。 */
function SkipString(source, index) {
  const quote = source[index];
  let i = index + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\\") { i += 2; continue; }
    if (ch === quote) return i + 1;
    i += 1;
  }
  return i;
}

/** 标识符：返回 `{ name, end }`，不是标识符就返回 null。 */
function ReadIdentifier(source, index) {
  if (index >= source.length || !IDENT_START.test(source[index])) return null;
  let i = index + 1;
  while (i < source.length && IDENT_PART.test(source[i])) i += 1;
  return { name: source.slice(index, i), end: i };
}

/**
 * 从一个值的第一个字符走到这个值的**末尾**（下一个同层的 `,` / `}` / `]` / `)`）。
 * 括号、字符串、注释都要吃掉 —— 不然 `Freeze({ a: 1, b: 2 })` 里的第一个逗号
 * 就会被当成这个值结束了。
 */
function ScanValueEnd(source, index) {
  let i = index;
  let depth = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "/" && (source[i + 1] === "/" || source[i + 1] === "*")) { i = SkipTrivia(source, i); continue; }
    if (ch === '"' || ch === "'" || ch === "`") { i = SkipString(source, i); continue; }
    if (ch === "{" || ch === "[" || ch === "(") { depth += 1; i += 1; continue; }
    if (ch === "}" || ch === "]" || ch === ")") {
      if (depth === 0) return i;
      depth -= 1; i += 1; continue;
    }
    if (ch === "," && depth === 0) return i;
    if (ch === ";" && depth === 0) return i;
    i += 1;
  }
  return i;
}

/** 把一段值的前后空白与注释削掉，剩下**恰好**是那个字面量（`3 /* 说明 *\/` → `3`）。 */
function TrimSpan(source, start, end) {
  const from = Math.min(SkipTrivia(source, start), end);
  let i = from;
  let last = from;
  while (i < end) {
    const skipped = SkipTrivia(source, i);
    if (skipped > i) { i = Math.min(skipped, end); continue; }
    if (source[i] === '"' || source[i] === "'" || source[i] === "`") { i = Math.min(SkipString(source, i), end); }
    else i += 1;
    last = i;
  }
  return { start: from, end: last };
}

/** 在一个对象字面量里找某个键，返回它的值的区间（已削掉前后注释）。 */
function FindObjectMember(source, openIndex, key) {
  let i = openIndex + 1;
  for (;;) {
    i = SkipTrivia(source, i);
    if (i >= source.length || source[i] === "}") return null;
    if (source[i] === ",") { i += 1; continue; }
    let name = null;
    if (source[i] === '"' || source[i] === "'") {
      const end = SkipString(source, i);
      name = source.slice(i + 1, end - 1);
      i = end;
    } else if (source.startsWith("...", i)) {
      // 展开语法：整个值跳掉（数据表里没有，留着是为了不静默改错东西）。
      i = ScanValueEnd(source, i + 3);
      continue;
    } else {
      const ident = ReadIdentifier(source, i);
      if (!ident) return null;
      name = ident.name;
      i = ident.end;
    }
    i = SkipTrivia(source, i);
    if (source[i] !== ":") continue;            // 简写属性 / 方法：不是「键: 值」，跳过
    const valueStart = SkipTrivia(source, i + 1);
    const valueEnd = ScanValueEnd(source, valueStart);
    if (name === key) return TrimSpan(source, valueStart, valueEnd);
    i = valueEnd;
    if (source[i] === ",") i += 1;
  }
}

/** 在一个数组字面量里按下标取元素。 */
function FindArrayElement(source, openIndex, wanted) {
  let i = openIndex + 1;
  let index = 0;
  for (;;) {
    i = SkipTrivia(source, i);
    if (i >= source.length || source[i] === "]") return null;
    if (source[i] === ",") { i += 1; index += 1; continue; }
    const valueEnd = ScanValueEnd(source, i);
    if (index === wanted) return TrimSpan(source, i, valueEnd);
    i = valueEnd;
    if (source[i] === ",") { i += 1; index += 1; }
  }
}

/**
 * 从一个值的区间往里走一层：剥掉 `Freeze(` / `Object.freeze(` 包装，
 * 返回 `{ kind: "object"|"array", open }`；不是对象也不是数组就返回 null。
 */
function OpenContainer(source, span) {
  let i = SkipTrivia(source, span.start);
  for (let guard = 0; guard < 4; guard += 1) {
    const ident = ReadIdentifier(source, i);
    if (!ident) break;
    let after = SkipTrivia(source, ident.end);
    // `Object.freeze(` 是两段标识符
    if (source[after] === ".") {
      const second = ReadIdentifier(source, SkipTrivia(source, after + 1));
      if (!second) break;
      after = SkipTrivia(source, second.end);
    }
    if (source[after] !== "(") break;
    i = SkipTrivia(source, after + 1);
  }
  if (source[i] === "{") return { kind: "object", open: i };
  if (source[i] === "[") return { kind: "array", open: i };
  return null;
}

/** `export const NAME =` 之后那个值的区间（到语句末尾）。 */
function LocateGroup(source, name) {
  const pattern = new RegExp(`(^|\\n)[ \\t]*export[ \\t]+const[ \\t]+${name}[ \\t]*=`, "g");
  const match = pattern.exec(source);
  if (!match) return null;
  const start = SkipTrivia(source, match.index + match[0].length);
  return TrimSpan(source, start, ScanValueEnd(source, start));
}

/** 把 `GROUP.sub.key` 解析成源码里那个值的区间。找不到返回 null。 */
function LocatePath(source, path) {
  const parts = String(path).split(".");
  if (parts.length < 2) return null;
  let span = LocateGroup(source, parts[0]);
  if (!span) return null;
  for (let i = 1; i < parts.length; i += 1) {
    const container = OpenContainer(source, span);
    if (!container) return null;
    const segment = parts[i];
    const next = container.kind === "array"
      ? (/^\d+$/.test(segment) ? FindArrayElement(source, container.open, Number(segment)) : null)
      : FindObjectMember(source, container.open, segment);
    if (!next) return null;
    span = next;
  }
  return span;
}

/** 字面量文本 → 值。不是「一个数 / 一个布尔」就返回 undefined。 */
function LiteralValue(text) {
  if (text === "true") return true;
  if (text === "false") return false;
  if (NUMBER_RE.test(text)) {
    const value = Number(text);
    return Number.isFinite(value) ? value : undefined;
  }
  return undefined;
}

/**
 * 新值 → 要写进源码的文本。**类型必须与原来那个字面量一致**：
 * 布尔位只收布尔，数字位只收有限数。往 `steerPathProbe` 里写个 0 比拒绝它更糟。
 */
function FormatLiteral(value, previousText) {
  const previous = LiteralValue(previousText);
  if (previous === undefined) return null;
  if (typeof previous === "boolean") return typeof value === "boolean" ? (value ? "true" : "false") : null;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  let text = String(value);
  // 0.1+0.2 那种尾巴：十位有效数字够写任何一个调参数，也不会写出 0.30000000000000004。
  if (text.length > 12 && /[.eE]/.test(text)) text = String(Number(value.toPrecision(10)));
  // `-1.0` 改成 -1 时保住小数点：那一列数是对齐着看的，别让改一个数顺手改了排版。
  if (/[.]/.test(previousText) && !/[.eE]/.test(text)) text += ".0";
  return text;
}

/**
 * 就地改写一批数值。
 *
 * @param {string} source 表的源码文本
 * @param {Array<{path: string, value: number|boolean}>} changes
 * @returns {{ source: string, applied: Array<{path: string, from: number|boolean, to: number|boolean}>, missing: string[] }}
 */
export function ApplyTuningChanges(source, changes) {
  let out = String(source);
  const applied = [];
  const missing = [];
  const list = Array.isArray(changes) ? changes : [];
  for (const change of list) {
    const path = change && typeof change.path === "string" ? change.path.trim() : "";
    if (!path) { missing.push(String(change && change.path)); continue; }
    const span = LocatePath(out, path);
    if (!span) { missing.push(path); continue; }
    const text = out.slice(span.start, span.end);
    const from = LiteralValue(text);
    if (from === undefined) { missing.push(path); continue; }
    const next = FormatLiteral(change.value, text);
    if (next === null) { missing.push(path); continue; }
    if (next !== text) out = out.slice(0, span.start) + next + out.slice(span.end);
    applied.push({ path, from, to: LiteralValue(next) });
  }
  return { source: out, applied, missing };
}

/** 读一个路径当前的值（编辑器的「重置到文件值」与闸门都用它）。 */
export function ReadTuningValue(source, path) {
  const span = LocatePath(String(source), path);
  if (!span) return undefined;
  return LiteralValue(String(source).slice(span.start, span.end));
}

/** 保存端点的白名单：只认 `Taierzhuang1938/Data_Tuning_*.mjs`（回环 + 根目录另判）。 */
export const TUNING_FILE_RE = /^Taierzhuang1938\/Data_Tuning_[A-Za-z0-9]+\.mjs$/;
