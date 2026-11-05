// 发布时按内容给 import map 盖戳（AGENTS 跨系统契约第 1 条，docs/Data_TechRepoLessons.md §2.8）。
//
// 仓库里的 HTML 只登记模块、不写 ?v=：改一个模块不再碰 index.html，并行提交不再在那七百行戳上撞车
//（2026-10-18 起两周 327 个提交里 225 个改过它）。Pages 在 staging 里跑这一步：每条第一方 import map 条目、
// 每个 `<script type="module" src>` 都按那个文件此刻的内容哈希盖戳 —— 内容一变戳就变，忘不了，也不会多盖。
// 必须排在 Script_BuildPublishAssets 之后（它会改写 staging 里的运行时表）、Script_BuildBrowserBundle 之前
//（打包读 staging 的 index.html：入口标签与 three 的地址）。
//
// 本地预览（scripts/Script_LocalPreview.mjs）与测试服务器（Script_DevServer.mjs）对所有文件发 no-store，用不着戳。
//
//   node Taierzhuang1938/Script_StampImportMaps.mjs --output-dir <staging>/Taierzhuang1938
//   node Taierzhuang1938/Script_StampImportMaps.mjs --check      只算不写：列出本目录各页能盖上多少条

import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

/** 内容戳：sha256 前 13 位十六进制转十进制（与打包脚本、贴图发布的写法一致，`\?v=\d+` 照样认）。 */
export function ContentStamp(bytes) {
  return BigInt("0x" + createHash("sha256").update(bytes).digest("hex").slice(0, 13)).toString();
}

/** 第一方的文件地址：相对路径、不是前缀映射（以 / 结尾）、不是别的协议。 */
function LocalFile(value) {
  return typeof value === "string" && /^\.\.?\//.test(value) && !value.split("?")[0].endsWith("/");
}

/**
 * 给一页 HTML 盖戳：import map 的第一方条目 + 模块入口 `<script src>`。原有的 ?v= 一律换成内容戳。
 * 找不到文件的条目原样放过并记进 missing（ModuleGraphTest 负责拦死条目）。
 */
export async function StampHtml(html, dir, cache = new Map()) {
  const stamped = [], missing = [];
  const Stamp = async (value) => {
    const clean = value.split("?")[0];
    const file = path.join(dir, clean);
    let stamp = cache.get(file);
    if (stamp === undefined) {
      try { stamp = ContentStamp(await fs.readFile(file)); } catch { stamp = null; }
      cache.set(file, stamp);
    }
    if (stamp === null) { missing.push(clean); return value; }
    stamped.push(clean);
    return `${clean}?v=${stamp}`;
  };
  let out = html;
  const mapMatch = out.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  if (mapMatch) {
    let map = null;
    // SceneEditor.html 没有自己的表，是在脚本里用同一个正则读 index.html 的表：那一处不是 JSON，原样放过。
    try { map = JSON.parse(mapMatch[1]); } catch { map = null; }
    if (map?.imports) {
      for (const [key, value] of Object.entries(map.imports)) if (LocalFile(value)) map.imports[key] = await Stamp(value);
      out = out.replace(mapMatch[0], () => `<script type="importmap">${JSON.stringify(map)}</script>`);
    }
  }
  const tags = [...out.matchAll(/<script type="module" src="(\.\/[^"]+)"><\/script>/g)];
  for (const [tag, src] of tags) { const next = `<script type="module" src="${await Stamp(src)}"></script>`; out = out.replace(tag, () => next); }
  return { html: out, stamped, missing };
}

/** 给发布目录及子目录的全部 .html 盖戳，包括独立动作预览页。 */
export async function StampDirectory(dir, { write = true } = {}) {
  const cache = new Map(), report = [];
  for (const item of await fs.readdir(dir, { withFileTypes: true })) {
    if (item.isDirectory() && item.name !== 'vendor') {
      for(const row of await StampDirectory(path.join(dir,item.name),{write}))report.push({...row,page:item.name+'/'+row.page});
      continue;
    }
    if (!item.isFile() || !item.name.endsWith(".html")) continue;
    const file = path.join(dir, item.name);
    const html = await fs.readFile(file, "utf8");
    const result = await StampHtml(html, dir, cache);
    if (write && result.html !== html) await fs.writeFile(file, result.html);
    report.push({ page: item.name, stamped: result.stamped.length, missing: result.missing });
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const check = process.argv.includes("--check");
  const outputArg = process.argv.indexOf("--output-dir");
  const dir = outputArg >= 0 && process.argv[outputArg + 1] ? path.resolve(process.argv[outputArg + 1]) : null;
  if (!check && !dir) throw new Error("Use --output-dir <staging>/Taierzhuang1938 (Pages staging), or --check");
  if (!check && dir === here) throw new Error("--output-dir must be a staging copy: the repository keeps unstamped import maps");
  const report = await StampDirectory(check ? here : dir, { write: !check });
  for (const row of report) {
    console.log(`[stamps] ${row.page}: ${row.stamped} 条盖了内容戳${row.missing.length ? `，找不到文件 ${row.missing.length} 条：${row.missing.join(", ")}` : ""}`);
  }
  if (report.some((row) => row.missing.length)) process.exitCode = 1;
}
