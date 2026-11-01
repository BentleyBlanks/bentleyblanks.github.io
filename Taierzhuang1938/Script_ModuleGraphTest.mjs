// ===========================================================================
// Script_ModuleGraphTest.mjs —— 缓存戳必须盖满 index.html 的整张模块图
//
// 由头（docs/Data_TechRepoLessons.md §2.8）：只给入口盖戳的后果是「新壳配旧芯」，
// 入口拿到新版、它 import 的模块吃缓存里的旧版，症状是「改了没生效」，
// 且手机 Safari 的模块缓存黏得多，往往只在移动端复现。
//
// 2026-11-01 起仓库里的表**只登记、不写 ?v=**：Pages 发布时 Script_StampImportMaps 按每个文件的内容盖戳
//（改模块不再碰 index.html，并行提交不再在七百行戳上撞车）。这里守三件事：每个模块都登记了、仓库里没人手写戳、
// 盖戳工具对这张表真的能盖满且戳等于内容哈希。
//
// 清单只有 index.html 那一张（import map），这里不再手写第二份名单：
// 从入口把模块图走一遍自己数出来，去对 import map。TunnelLight 的同名测试
// 曾因手写清单漏登 Data_DayCycle 而照样绿，这版从一开始就走图。
//
// 纯 Node，秒级。跑法：node Taierzhuang1938/Script_TestRunner.mjs --only=ModuleGraphTest
// ===========================================================================

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StampHtml, ContentStamp } from "./Script_StampImportMaps.mjs";

const dirHere = path.dirname(fileURLToPath(import.meta.url));

async function TestModuleGraphIsCacheBusted() {
  const html = fs.readFileSync(path.join(dirHere, "index.html"), "utf8");
  const mapMatch = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  assert.ok(mapMatch, "index.html 里必须有 import map");
  const imports = JSON.parse(mapMatch[1]).imports ?? {};

  // 入口自己走 <script src>：仓库里不带戳，发布时与 import map 一起按内容盖。
  const entry = html.match(/<script type="module" src="\.\/Script_Entry\.mjs(\?v=[^"]*)?">/);
  assert.ok(entry, "index.html 必须有入口 <script type=\"module\" src=\"./Script_Entry.mjs\">");
  assert.ok(!entry[1], "index.html 的入口不写 ?v=：发布时 Script_StampImportMaps 按内容盖");
  // 入口只能有一条：打包脚本只替换第一条，多出来的那条在 Pages 上会从源码图再起一局游戏，
  // 两局抢 window.Tengxian，开机卡在「烘贴图」（2026-09-24 合并留下过一条重复入口）。
  const entries = html.match(/<script type="module" src="\.\/Script_Entry\.mjs(?:\?v=[^"]*)?"><\/script>/g) || [];
  assert.equal(entries.length, 1, "index.html 只能有一条 Script_Entry.mjs 入口 <script>，现在有 " + entries.length + " 条");
  assert.ok(!/<script\b[^>]*src="\.\/Script_(?:Main|MenuStartup)\.mjs/.test(html), "不得同时加载路由和独立运行时入口");

  // 从入口递归走静态 from 与动态 import()。
  // 字符类比 §2.8 的正则多一个「/」：Script_JieheHeight 真的从子目录
  // import Heightmap/Data_TaierzhuangHeightmap.mjs，只认平铺文件名会漏掉它。
  // vendor/ 不往里走：三方库的内部依赖由 map 顶部那几条手工条目盖戳。
  const seen = new Set();
  const selfStamped = [];
  const walk = (file) => {
    if (file.startsWith("vendor/") || seen.has(file)) return;
    seen.add(file);
    const src = fs.readFileSync(path.join(dirHere, file), "utf8");
    for (const m of src.matchAll(/(?:from|import\()\s*["']\.\/([A-Za-z0-9_/]+\.m?js)["']/g)) walk(m[1]);
    // 源码里不许自己写版本戳：同一模块两个 URL = 浏览器加载两份实例。
    // 自带 ?v= 的 specifier 也不会被上面的正则走到，等于整棵子树失踪。
    for (const m of src.matchAll(/(?:from|import\()\s*["'][^"']*\.m?js\?v=[^"']*["']/g)) {
      selfStamped.push(`${file}: ${m[0]}`);
    }
  };
  walk("Script_Entry.mjs");
  seen.delete("Script_Entry.mjs");
  const browserModules = [...seen].sort();

  assert.equal(selfStamped.length, 0,
    `源码里不该自己写版本戳（交给 index.html 的 import map）：\n  ${selfStamped.join("\n  ")}`);
  assert.ok(browserModules.length >= 80,
    `模块图只走出 ${browserModules.length} 个，正则怕是失灵了`);

  const missing = browserModules.filter((m) => imports[`./${m}`] !== `./${m}`);
  assert.equal(missing.length, 0,
    `这些模块在浏览器模块图里、却没登记进 index.html 的 import map（写成 "./X.mjs": "./X.mjs"，不带 ?v=）：\n`
    + `  ${missing.join("\n  ")}\n`
    + "漏掉的模块会独自留在缓存里，新壳配旧芯（docs/Data_TechRepoLessons.md §2.8）");

  // 反向：map 里第一方条目指到的文件必须真实存在，防止改名/删除留下死条目糊住对账。
  const stale = Object.keys(imports)
    .filter((k) => k.startsWith("./") && !k.startsWith("./vendor/"))
    .filter((k) => !fs.existsSync(path.join(dirHere, k)));
  assert.equal(stale.length, 0, `import map 指到了不存在的文件：${stale.join(", ")}`);

  // 仓库里任何一页的 import map 与模块入口都不许手写 ?v=（发布时会被内容戳覆盖，留着只会让人以为还要手改）。
  const handStamped = [];
  for (const page of fs.readdirSync(dirHere).filter((name) => name.endsWith(".html"))) {
    const text = fs.readFileSync(path.join(dirHere, page), "utf8");
    const map = text.match(/<script type="importmap">([\s\S]*?)<\/script>/);
    let parsed = null;
    try { parsed = map ? JSON.parse(map[1]) : null; } catch { parsed = null; }
    for (const [key, value] of Object.entries(parsed?.imports ?? {})) if (/\?v=/.test(value)) handStamped.push(`${page}: ${key}`);
    for (const m of text.matchAll(/<script type="module" src="(\.\/[^"]+\?v=[^"]*)">/g)) handStamped.push(`${page}: <script src="${m[1]}">`);
  }
  assert.equal(handStamped.length, 0,
    `仓库里不手写模块戳（Pages 发布时 Script_StampImportMaps 按内容盖）：\n  ${handStamped.slice(0, 20).join("\n  ")}`);

  // 盖戳工具对这张表：每个模块、入口与 three 都盖上，戳等于那个文件此刻的内容哈希。
  const result = await StampHtml(html, dirHere);
  assert.equal(result.missing.length, 0, `盖戳工具找不到这些文件：${result.missing.join(", ")}`);
  const stampedMap = JSON.parse(result.html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  const unstamped = browserModules.filter((m) =>
    stampedMap[`./${m}`] !== `./${m}?v=${ContentStamp(fs.readFileSync(path.join(dirHere, m)))}`);
  assert.equal(unstamped.length, 0, `盖戳工具没给这些模块盖上内容戳：${unstamped.slice(0, 10).join(", ")}`);
  assert.ok(/<script type="module" src="\.\/Script_Entry\.mjs\?v=\d+"><\/script>/.test(result.html), "盖戳工具给入口 <script> 盖戳");
  assert.ok(/\?v=\d+$/.test(stampedMap.three ?? ""), "盖戳工具给 three 盖戳");

  console.log(`ok  import map 登记满整张模块图（${browserModules.length} 个模块，仓库不写戳）；发布时按内容盖戳 ${result.stamped.length} 条`);
}

await TestModuleGraphIsCacheBusted();
