// Script_TextTest.mjs — 文本数据驱动的闸门（纯 Node，毫秒级）。
//
// 守四件事（口径见 docs/Data_TextAndTuning.md）：
//   1. 语言表本身：键名合法、值是非空字符串、占位符 `{name}` 成对且合法；
//      非基准语言只能覆盖基准语言里有的键（多出来的键是拼错了）。
//   2. 代码里 `T("key")` 静态引用的键在基准语言表里都存在（动态拼键的前缀由
//      各表 DYNAMIC_PREFIXES 登记，这里对它们只查前缀有键）。
//   3. **已闸门化的模块**（各 Data_Text_*.mjs 的 GATED_MODULES 并集）里不许再出现
//      玩家可见的中文字面量：字符串 / 模板字符串里含汉字即红。豁免：
//        · 注释；
//        · console.* / throw / new Error( 所在行（开发者诊断不是玩家文本）；
//        · 行尾带 `// @text-ok` 的行（必须在注释里写为什么，例如资产 id 恰好是汉字）。
//   4. 表里没有任何引用的键 → 只警告（动态拼键与 Localize 的 content.* 不静态可见）。
//
// 用法：node Script_TextTest.mjs [--report]   --report 额外列出未闸门化模块里的中文字面量数，
// 用来看迁移进度。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const REPORT = args.has("--report");

const KEY_RE = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_\-]+)+$/;
const CJK_RE = /[㐀-䶿一-鿿豈-﫿　-〿＀-￯]/;
const DIAG_RE = /(console\.[a-z]+\s*\(|throw\b|new\s+Error\s*\(|\.warn\s*\(|assert\w*\s*\()/;

let failures = 0;
let warnings = 0;
const Fail = (message) => { failures += 1; console.log(`  ✗ ${message}`); };
const Warn = (message) => { warnings += 1; console.log(`  ! ${message}`); };
const Ok = (message) => console.log(`  ✓ ${message}`);

// ---------------------------------------------------------------------------
// 1. 语言表
// ---------------------------------------------------------------------------
const localeFiles = fs.readdirSync(here).filter((name) => /^Data_Locale_[A-Za-z]+\.mjs$/.test(name)).sort();
const locales = [];
for (const file of localeFiles) {
  const mod = await import(pathToFileURL(path.join(here, file)).href);
  if (!mod.LOCALE?.id || !mod.LOCALE.strings) { Fail(`${file} 没有导出 LOCALE { id, name, strings }`); continue; }
  locales.push({ file, ...mod.LOCALE });
}
const base = locales.find((locale) => locale.id === "zh-CN");
if (!base) Fail("缺少基准语言 Data_Locale_zhCN.mjs（id 必须是 zh-CN）");

function CheckPlaceholders(where, key, value) {
  const opens = (value.match(/\{/g) || []).length;
  const closes = (value.match(/\}/g) || []).length;
  if (opens !== closes) Fail(`${where}.${key} 占位符花括号不成对：${JSON.stringify(value)}`);
  for (const m of value.matchAll(/\{([^}]*)\}/g)) {
    if (!/^[a-zA-Z0-9_]+$/.test(m[1])) Fail(`${where}.${key} 占位符名不合法：{${m[1]}}`);
  }
}

for (const locale of locales) {
  let count = 0;
  for (const [key, value] of Object.entries(locale.strings)) {
    count += 1;
    if (!KEY_RE.test(key)) Fail(`${locale.file} 键名不合法：${key}（形如 domain.section.name）`);
    if (typeof value !== "string" || value.length === 0) Fail(`${locale.file}.${key} 值必须是非空字符串`);
    else CheckPlaceholders(locale.file, key, value);
    if (base && locale !== base && !(key in base.strings)) Fail(`${locale.file} 多出基准语言没有的键：${key}`);
    if (base && locale !== base && typeof value === "string") {
      const want = [...base.strings[key].matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]).sort().join(",");
      const have = [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]).sort().join(",");
      if (want !== have) Fail(`${locale.file}.${key} 占位符与基准不一致：基准 {${want}} / 译文 {${have}}`);
    }
  }
  Ok(`${locale.file}（${locale.id}）${count} 条`);
}

// 各表自报：覆盖了哪些代码模块（GATED_MODULES）、哪些前缀是运行时拼出来的（DYNAMIC_PREFIXES）
const tableFiles = fs.readdirSync(here).filter((name) => /^Data_Text_[A-Za-z0-9]+\.mjs$/.test(name)).sort();
const gated = new Map();       // module file → 登记它的表
const dynamicPrefixes = [];
for (const file of tableFiles) {
  const mod = await import(pathToFileURL(path.join(here, file)).href);
  if (!mod.TEXT || typeof mod.TEXT !== "object") { Fail(`${file} 没有导出 TEXT`); continue; }
  for (const module of mod.GATED_MODULES ?? []) {
    if (!fs.existsSync(path.join(here, module))) { Fail(`${file}.GATED_MODULES 指向不存在的文件：${module}`); continue; }
    if (gated.has(module) && gated.get(module) !== file) Warn(`${module} 同时被 ${gated.get(module)} 与 ${file} 登记为闸门模块`);
    gated.set(module, file);
  }
  for (const prefix of mod.DYNAMIC_PREFIXES ?? []) dynamicPrefixes.push({ prefix, file });
}
if (base) {
  for (const { prefix, file } of dynamicPrefixes) {
    if (!Object.keys(base.strings).some((key) => key.startsWith(prefix))) Fail(`${file}.DYNAMIC_PREFIXES 登记的前缀在表里一条都没有：${prefix}`);
  }
}

// ---------------------------------------------------------------------------
// 源码扫描：找出字符串字面量（跳过注释与正则），记录是否含汉字
// ---------------------------------------------------------------------------
const REGEX_PRECEDERS = new Set(["(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^", "return", "typeof", "case", "do", "else", "in", "of", "instanceof", "new", "delete", "void", "throw", "yield", "await"]);

/** 返回 [{ text, line, raw }]：text 是去引号的字面量正文（模板字符串只取静态段）。 */
function ScanLiterals(source) {
  const out = [];
  const n = source.length;
  let i = 0;
  let line = 1;
  let lastToken = "";                 // 用来判断 `/` 是除号还是正则
  const templateStack = [];           // 模板字符串里 ${ } 的嵌套深度
  const Push = (text, at, raw) => out.push({ text, line: at, raw });
  while (i < n) {
    const c = source[i];
    if (c === "\n") { line += 1; i += 1; continue; }
    if (c === "/" && source[i + 1] === "/") { while (i < n && source[i] !== "\n") i += 1; continue; }
    if (c === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) { if (source[i] === "\n") line += 1; i += 1; }
      i += 2; continue;
    }
    if (c === "'" || c === "\"") {
      const start = i; const startLine = line; let text = "";
      i += 1;
      while (i < n && source[i] !== c) {
        if (source[i] === "\\") { text += source[i + 1] ?? ""; i += 2; continue; }
        if (source[i] === "\n") break;
        text += source[i]; i += 1;
      }
      i += 1;
      Push(text, startLine, source.slice(start, i));
      lastToken = "str"; continue;
    }
    if (c === "`") {
      const startLine = line; let text = ""; let raw = "`";
      i += 1;
      while (i < n && source[i] !== "`") {
        if (source[i] === "\\") { text += source[i + 1] ?? ""; raw += source.slice(i, i + 2); i += 2; continue; }
        if (source[i] === "$" && source[i + 1] === "{") {
          // 进入表达式：递归扫描直到配对的 }
          let depth = 1; let j = i + 2;
          while (j < n && depth > 0) {
            if (source[j] === "{") depth += 1;
            else if (source[j] === "}") depth -= 1;
            else if (source[j] === "`" || source[j] === "'" || source[j] === "\"") {
              // 表达式里的字符串：交给子扫描
              const q = source[j]; let k = j + 1;
              while (k < n && source[k] !== q) { if (source[k] === "\\") k += 1; k += 1; }
              const inner = ScanLiterals(source.slice(j, k + 1));
              for (const lit of inner) Push(lit.text, line, lit.raw);
              j = k;
            } else if (source[j] === "\n") line += 1;
            j += 1;
          }
          raw += source.slice(i, j); i = j; continue;
        }
        if (source[i] === "\n") line += 1;
        text += source[i]; raw += source[i]; i += 1;
      }
      i += 1; raw += "`";
      Push(text, startLine, raw);
      lastToken = "str"; continue;
    }
    if (c === "/") {
      const isRegex = lastToken === "" || REGEX_PRECEDERS.has(lastToken);
      if (isRegex) {
        i += 1; let inClass = false;
        while (i < n) {
          if (source[i] === "\\") { i += 2; continue; }
          if (source[i] === "[") inClass = true;
          else if (source[i] === "]") inClass = false;
          else if (source[i] === "/" && !inClass) break;
          else if (source[i] === "\n") break;
          i += 1;
        }
        i += 1;
        while (i < n && /[a-z]/.test(source[i])) i += 1;
        lastToken = "regex"; continue;
      }
      lastToken = "/"; i += 1; continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i; while (j < n && /[A-Za-z0-9_$]/.test(source[j])) j += 1;
      lastToken = source.slice(i, j); i = j; continue;
    }
    if (/[0-9]/.test(c)) { while (i < n && /[0-9a-zA-Z_.]/.test(source[i])) i += 1; lastToken = "num"; continue; }
    if (/\s/.test(c)) { i += 1; continue; }
    if (c === ")" || c === "]") { lastToken = c; i += 1; continue; }
    lastToken = c; i += 1;
  }
  void templateStack;
  return out;
}

function LineOf(source, lineNo) { return source.split("\n")[lineNo - 1] ?? ""; }

/** 模块里「玩家可见」的中文字面量（已剔除诊断行与 @text-ok 行）。 */
function PlayerFacingCjk(source) {
  const lines = source.split("\n");
  return ScanLiterals(source).filter((lit) => {
    if (!CJK_RE.test(lit.text)) return false;
    const row = lines[lit.line - 1] ?? "";
    if (/\/\/.*@text-ok/.test(row)) return false;
    if (DIAG_RE.test(row)) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// 2. 静态引用的键
// ---------------------------------------------------------------------------
const codeFiles = fs.readdirSync(here).filter((name) => /^Script_[A-Za-z0-9_]+\.mjs$/.test(name) && !/Test\.mjs$/.test(name)).sort();
const referenced = new Set();
const T_CALL_RE = /\bT\(\s*(["'])([^"'\n]+)\1/g;
/** 去掉注释（保留换行，行号不变），静态引用只在代码里数。 */
function StripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, lead) => lead);
}
for (const file of codeFiles) {
  const source = StripComments(fs.readFileSync(path.join(here, file), "utf8"));
  for (const m of source.matchAll(T_CALL_RE)) {
    referenced.add(m[2]);
    if (base && !(m[2] in base.strings)) Fail(`${file} 引用了基准语言没有的键：${m[2]}`);
  }
}
Ok(`静态引用 ${referenced.size} 个键`);

if (base) {
  const unused = Object.keys(base.strings).filter((key) => !referenced.has(key)
    && !key.startsWith("content.") && !dynamicPrefixes.some(({ prefix }) => key.startsWith(prefix)));
  if (unused.length) Warn(`${unused.length} 个键没有静态引用（动态拼键请登记 DYNAMIC_PREFIXES）：${unused.slice(0, 12).join(", ")}${unused.length > 12 ? " …" : ""}`);
}

// ---------------------------------------------------------------------------
// 3. 闸门模块里不许再有玩家可见中文
// ---------------------------------------------------------------------------
let gatedClean = 0;
for (const [module, table] of [...gated.entries()].sort()) {
  const source = fs.readFileSync(path.join(here, module), "utf8");
  const hits = PlayerFacingCjk(source);
  if (hits.length === 0) { gatedClean += 1; continue; }
  Fail(`${module}（由 ${table} 闸门化）仍有 ${hits.length} 条玩家可见中文字面量，例如：`);
  for (const hit of hits.slice(0, 6)) console.log(`      L${hit.line}: ${hit.raw.slice(0, 90)}`);
}
Ok(`闸门模块 ${gatedClean}/${gated.size} 个干净`);

// ---------------------------------------------------------------------------
// 4. 标题字体子集：标题里的每一个字都得在 Font/Font_Title.woff2 里
// ---------------------------------------------------------------------------
// 标题字体只裁了标题那几十个字（整套 11 MB，为八个字全量打包不合算）。
// 改了标题却没重跑 Font/Script_TitleFontSubset.py，浏览器会**逐字**回退到系统字体 ——
// 表现成「标题里有两三个字长得不一样」，肉眼极容易看漏，所以在这里对账。
{
  const fontDir = path.join(here, "Font");
  const manifestPath = path.join(fontDir, "Font_Title.json");
  const woff2Path = path.join(fontDir, "Font_Title.woff2");
  if (!fs.existsSync(manifestPath) || !fs.existsSync(woff2Path)) {
    Fail("缺少 Font/Font_Title.woff2 或 Font_Title.json（跑一次 Font/Script_TitleFontSubset.py）");
  } else {
    const { chars } = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const covered = new Set([...chars]);
    const { MENU } = await import(pathToFileURL(path.join(here, "Data_TengxianScript.mjs")).href);
    // 会用标题字体排版的全部文本：主菜单大标题 / 暂停标题 / 加载画面标题与副标题。
    const rendered = [MENU.title, MENU.subtitle, base?.strings["menu.title.paused"] ?? ""].join("");
    const missing = [...new Set([...rendered])].filter((ch) => !covered.has(ch));
    if (missing.length) {
      Fail(`标题里有 ${missing.length} 个字不在字体子集里：${missing.join(" ")}`
        + "（改完标题要重跑 Font/Script_TitleFontSubset.py，并抬一次 index.html 的 ?v= 戳）");
    } else {
      Ok(`标题字体子集覆盖标题全部 ${new Set([...rendered]).size} 个字`);
    }
  }
}

// ---------------------------------------------------------------------------
// --report：未闸门化模块的迁移进度
// ---------------------------------------------------------------------------
if (REPORT) {
  console.log("\n未闸门化模块（玩家可见中文字面量数，已剔除注释 / 诊断 / @text-ok）：");
  const rows = [];
  for (const file of codeFiles) {
    if (gated.has(file)) continue;
    const hits = PlayerFacingCjk(fs.readFileSync(path.join(here, file), "utf8"));
    if (hits.length) rows.push([hits.length, file]);
  }
  rows.sort((a, b) => b[0] - a[0]);
  for (const [count, file] of rows) console.log(`  ${String(count).padStart(5)}  ${file}`);
  console.log(`  合计 ${rows.reduce((sum, row) => sum + row[0], 0)} 条 / ${rows.length} 个文件`);
}

console.log(`\nTextTest：${failures} 失败，${warnings} 警告`);
process.exit(failures ? 1 : 0);
