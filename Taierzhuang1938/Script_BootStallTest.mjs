// 开机不许被**一张下不来的贴图**吊死。
//
// 这条测试是从一次真事故长出来的：加载画面停在「加载 PBR 材质……」，进度条钉在
// 四分之一，展示台在 worker 里照转，页面看上去完全正常 —— 但它永远到不了游戏里。
// 根子是 `<img>` 的加载**没有超时这回事**：连接挂住了（不是 404、不是 reset，
// 就是不回数据）就既不发 load 也不发 error。开机那一步一口气要七十二张图、
// 三十五 MB，旧写法把它们塞进一个 `Promise.all`，任何一张挂住整条链就永远不 settle。
//
// 所以这里不测「贴图好不好看」，测的是**一张图挂死之后，游戏还进不进得去**：
// 用 route 把其中一张 hold 住（永远不 fulfill，最接近真实的连接挂起），
// 然后要求页面照样开完机、并且只有那一套材质走了程序化退路。
//
// 用法：node Taierzhuang1938/Script_BootStallTest.mjs
// 退出码即成败。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

/** 挂死哪一张。Stone 是普通的城内石材，三张图里的 ORM。 */
const STALLED = "Texture_StoneOrm.webp";
const STALLED_SET = "Stone";
/**
 * 开机总时限。单张图的超时是 Script_Materials.LoadExternalSet 的默认值（三十秒），
 * 这里留到两分半 —— 断言的是「有界」，不是那个具体的秒数；
 * 把超时调成十秒还是四十五秒都不该让这条测试变红。
 */
const BOOT_LIMIT_MS = 150000;

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const warnings = [];
const problems = [];
page.on("pageerror", (error) => problems.push(`PAGEERROR ${String(error).slice(0, 300)}`));
page.on("console", (message) => {
  const text = message.text();
  if (text.includes("外部 PBR")) warnings.push(text);
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  problems.push(`CONSOLE ${text.slice(0, 300)}`);
});

// 永不 fulfill：连接挂起，浏览器既不给 load 也不给 error。
await page.route(`**/${STALLED}*`, () => {});

let failed = 0;
const Check = (ok, label, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `  ${detail}` : ""}`);
};

const started = Date.now();
let booted = true;
try {
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=0&quality=low&scale=small`,
    { waitUntil: "commit", timeout: 60000 });
  // 第二个参数是**传给页面函数的实参**，不是 options —— 少写这个 null，
  // timeout 会静静落到 playwright 的默认 30 s 上，这条测试就在量默认值。
  await page.waitForFunction(() => window.Taierzhuang !== undefined, null,
    { timeout: BOOT_LIMIT_MS, polling: 250 });
} catch (error) {
  booted = false;
  const step = await page.evaluate(() => document.getElementById("bootStep")?.textContent || "")
    .catch(() => "(读不到)");
  console.log(`     停在「${step}」：${String(error).slice(0, 160)}`);
}
const elapsed = Date.now() - started;

Check(booted, `一张贴图挂死，开机照样走到底（≤ ${BOOT_LIMIT_MS / 1000} s）`, `用了 ${(elapsed / 1000).toFixed(1)} s`);

const failedSets = warnings
  .map((line) => line.match(/外部 PBR「(\w+)」/)?.[1])
  .filter(Boolean);
Check(failedSets.includes(STALLED_SET),
  `挂死的那一套（${STALLED_SET}）退回程序化 PBR`, `实收：${failedSets.join("、") || "无"}`);
// 旧写法一个 try 罩着全部二十五套 —— 一张图出事，其余二十四套一起被丢掉。
Check(failedSets.length === 1,
  "**只有**那一套受影响，别的材质照常换成外部 PBR", `退路计数 ${failedSets.length}`);
Check(problems.length === 0, "页面无运行时错误", problems.slice(0, 3).join(" | "));

await browser.close();
server.close();
console.log(failed === 0 ? "\n开机抗挂死通过。" : `\n开机抗挂死失败：${failed} 项。`);
process.exit(failed === 0 ? 0 : 1);
