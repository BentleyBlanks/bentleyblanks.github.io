// 开机路径上的贴图字节数红线（纯 Node，毫秒级）。
//
// 存在的理由是一次实测：出川车厢那三套 PBR 是 imagegen 出的 1254px PNG，被直接
// 接进了 `Script_Main` 的 `PBR_SETS`，而项目里别的四十多套一律是 512px WebP。
// 一家占掉整张表 71% 的字节（28 MB / 39 MB），线上实测那一步要跑两分多钟 ——
// 而它偏偏是全流程唯一跳不过去的等待。**没有任何东西拦着**：模型有三角预算、
// 帧有 draw call 红线，开机下多少字节却没人管。
//
// 顺手还逮出一套白下的：`CarriageWallSteel` 在过场数据里一次都没被 mat 引用
//（端墙渲成纯黑之后早就改走别的配方），却仍旧每次开机下 6.5 MB。
//
// 这条测试做五件事，全部离线：
//   1. `PBR_SETS` 里每个 URL 在 Texture/ 下真的存在（拼错的话浏览器测试要跑完
//      整个开机才看得见一条 warn，这里一秒就红）；
//   2. 总字节不超过 BUDGET_BYTES；
//   3. 单张不超过 SINGLE_LIMIT_BYTES —— 总量还没爆但混进一张巨图时先出声。
//   4. 首屏预载的 Type 24 手榴弹 GLB 存在且仍在单件预算内；它不是 PBR_SETS
//      的贴图，所以必须在这里单独守住，避免构建时误把 14 MB 原始包直接上线。
//
//   5. 每套外部 PBR 都有同名补烘配方，下载失败后仍能完成共享场景初始化。
//
// **红了不要直接抬预算。** 先问这张图凭什么这么大：是不是没走 512px WebP 那条线
//（`_import/BuildWeaponPbr.py` / `_import/Script_BakeCarriagePbr.py`），
// 或者它按世界尺寸平铺、根本用不到这个分辨率。抬预算是决定，不是手续。
//
// 用法：node Taierzhuang1938/Script_BootPayloadTest.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RECIPES } from "./Script_TexBake.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * 开机贴图总预算。2026-08-26 把车厢那三套压回 512px WebP、摘掉没人用的
 * CarriageWallSteel 之后是 11.7 MB；14 MB 留出两三套新材质的余量。
 */
const BUDGET_BYTES = 14 * 1024 * 1024;
/** 单张上限。现在最大的是 1024px 的城墙芯砖，490 KB。 */
const SINGLE_LIMIT_BYTES = 900 * 1024;
const GRENADE_ASSET_MAX_BYTES = 5 * 1024 * 1024;

const source = fs.readFileSync(path.join(projectDir, "Script_Main.mjs"), "utf8");
const start = source.indexOf("const PBR_SETS");
const end = source.indexOf("const PBR_LANES");
if (start < 0 || end < 0 || end < start) {
  console.error("FAIL 在 Script_Main.mjs 里找不到 PBR_SETS … PBR_LANES 这一段");
  process.exit(1);
}
const block = source.slice(start, end);
const urls = [...block.matchAll(/"\.\/Texture\/([^"?]+)/g)].map((m) => m[1]);
// 逐套拆开：一套要么三张（albedo + normal + ORM），要么两张 + 一个 fallback
//（`LoadExternalBaseNormal` 借用现成配方的 ORM，见 Script_Materials）。
const sets = block.split(/(?=\{ name: ")/).map((chunk) => {
  const name = chunk.match(/^\{ name: "(\w+)"/)?.[1];
  if (!name) return null;
  return {
    name,
    fallback: chunk.match(/fallback: "(\w+)"/)?.[1] || null,
    images: [...chunk.matchAll(/"\.\/Texture\/([^"?]+)/g)].map((m) => m[1]),
  };
}).filter(Boolean);

let failed = 0;
const Check = (ok, label, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `  ${detail}` : ""}`);
};

const shapeBad = sets.filter((s) => s.images.length !== (s.fallback ? 2 : 3));
Check(sets.length > 0 && shapeBad.length === 0,
  "每套三张图；带 fallback 的两张（ORM 借现成配方）",
  `${sets.length} 套 / ${urls.length} 张` + (shapeBad.length
    ? `　形状不对：${shapeBad.map((s) => `${s.name}(${s.images.length})`).join("、")}` : ""));

// Every external set is passed to PrepareSteps([set.name]) after a failed download.
// Missing recipes used to be silently skipped, leaving ActorFactory.Get to crash every scene.
const missingRecipes = sets.filter((set) => typeof RECIPES[set.name] !== "function");
Check(missingRecipes.length === 0, "每套外部 PBR 都有同名补烘配方", missingRecipes.map(set => set.name).join("、"));

// Optional fallback sources must also point to an existing recipe.
const badFallback = sets.filter((s) => s.fallback && !RECIPES[s.fallback]);
Check(badFallback.length === 0, "fallback 指向的都是真配方",
  badFallback.map((s) => `${s.name} → ${s.fallback}`).join("、"));

const missing = [];
const rows = [];
for (const url of urls) {
  const file = path.join(projectDir, "Texture", url);
  if (!fs.existsSync(file)) { missing.push(url); continue; }
  rows.push({ url, bytes: fs.statSync(file).size });
}
Check(missing.length === 0, "每个 URL 在 Texture/ 下都有对应文件", missing.join("、"));

const total = rows.reduce((sum, r) => sum + r.bytes, 0);
const Mb = (n) => (n / 1024 / 1024).toFixed(2);
rows.sort((a, b) => b.bytes - a.bytes);
Check(total <= BUDGET_BYTES,
  `开机贴图总字节 ≤ ${Mb(BUDGET_BYTES)} MB`, `实测 ${Mb(total)} MB（${rows.length} 张）`);

const oversized = rows.filter((r) => r.bytes > SINGLE_LIMIT_BYTES);
Check(oversized.length === 0,
  `没有单张超过 ${Mb(SINGLE_LIMIT_BYTES)} MB 的贴图`,
  oversized.map((r) => `${r.url} ${Mb(r.bytes)} MB`).join("、"));

const grenadeAsset = path.join(projectDir, "Model", "Model_Type24Grenade.glb");
const grenadeBytes = fs.existsSync(grenadeAsset) ? fs.statSync(grenadeAsset).size : 0;
Check(grenadeBytes > 0 && grenadeBytes <= GRENADE_ASSET_MAX_BYTES,
  `预载手榴弹 GLB 存在且 ≤ ${Mb(GRENADE_ASSET_MAX_BYTES)} MB`,
  grenadeBytes ? `实测 ${Mb(grenadeBytes)} MB` : "文件缺失");

console.log(`     最大的五张：${rows.slice(0, 5).map((r) => `${r.url} ${Mb(r.bytes)} MB`).join("  ")}`);

if (failed) {
  console.error(`\n开机贴图预算失败：${failed} 项。`);
  process.exit(1);
}
console.log("\n开机贴图预算通过。");
