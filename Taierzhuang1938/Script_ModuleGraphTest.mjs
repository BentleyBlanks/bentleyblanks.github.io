// ===========================================================================
// Script_ModuleGraphTest.mjs —— 缓存戳必须盖满 index.html 的整张模块图
//
// 由头（docs/Data_TechRepoLessons.md §2.8）：只给入口盖戳的后果是「新壳配旧芯」，
// 入口拿到新版、它 import 的模块吃缓存里的旧版，症状是「改了没生效」，
// 且手机 Safari 的模块缓存黏得多，往往只在移动端复现。
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

const dirHere = path.dirname(fileURLToPath(import.meta.url));

function TestModuleGraphIsCacheBusted() {
  const html = fs.readFileSync(path.join(dirHere, "index.html"), "utf8");
  const mapMatch = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  assert.ok(mapMatch, "index.html 里必须有 import map");
  const imports = JSON.parse(mapMatch[1]).imports ?? {};

  // 入口自己走 <script src>，必须带版本戳；其余全靠 import map。
  const entry = html.match(/<script type="module" src="\.\/Script_Main\.mjs\?v=(\d+)">/);
  assert.ok(entry, "index.html 的入口 Script_Main.mjs 必须带 ?v= 版本戳");

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
  walk("Script_Main.mjs");
  seen.delete("Script_Main.mjs");
  const browserModules = [...seen].sort();

  assert.equal(selfStamped.length, 0,
    `源码里不该自己写版本戳（交给 index.html 的 import map）：\n  ${selfStamped.join("\n  ")}`);
  assert.ok(browserModules.length >= 80,
    `模块图只走出 ${browserModules.length} 个，正则怕是失灵了`);

  const missing = browserModules.filter((m) => !new RegExp(`^\\./${m}\\?v=\\d+$`).test(imports[`./${m}`] ?? ""));
  assert.equal(missing.length, 0,
    `这些模块在浏览器模块图里、却没登记进 index.html 的 import map（或没盖 ?v= 戳）：\n`
    + `  ${missing.join("\n  ")}\n`
    + "漏掉的模块会独自留在缓存里，新壳配旧芯（docs/Data_TechRepoLessons.md §2.8）");

  // 反向：map 里第一方条目指到的文件必须真实存在，防止改名/删除留下死条目糊住对账。
  const stale = Object.keys(imports)
    .filter((k) => k.startsWith("./") && !k.startsWith("./vendor/"))
    .filter((k) => !fs.existsSync(path.join(dirHere, k)));
  assert.equal(stale.length, 0, `import map 指到了不存在的文件：${stale.join(", ")}`);

  console.log(`ok  缓存戳盖满整张模块图：入口 v=${entry[1]} + ${browserModules.length} 个模块全部登记在 import map`);
}

TestModuleGraphIsCacheBusted();
