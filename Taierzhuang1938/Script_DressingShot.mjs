// 布设包的自验出图：任意机位拍一张当前城。给并行布设工作包用 ——
// 摆完一批就拍自己的片区，看家什有没有穿墙、悬空、堵路。
//
// 地面机位（站在街上/院里平视）：
//   node Taierzhuang1938/Script_DressingShot.mjs --phase=5 --x=62 --z=0 --yaw=1.57 \
//        [--pitch=-0.08] [--name=NE_check] [--out=目录]
// 俯拍（借主菜单推轨相机悬在片区上空）：
//   node Taierzhuang1938/Script_DressingShot.mjs --phase=5 --top --x=100 --z=-100 \
//        [--h=90] [--name=NE_top]
//
// yaw 弧度：0 朝 -Z（北），π/2 朝 +X 相反方向注意 —— 与 Script_ShotTest 的
// Spawn 口径一致，拿不准就先拍一张看。默认输出 Taierzhuang1938/_shots/（gitignored）。

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");

const args = new Map(process.argv.slice(2)
  .filter((a) => a.startsWith("--"))
  .map((a) => {
    const eq = a.indexOf("=");
    return eq < 0 ? [a.slice(2), true] : [a.slice(2, eq), a.slice(eq + 1)];
  }));
const phase = Number(args.get("phase") ?? 5);
const x = Number(args.get("x") ?? 0);
const z = Number(args.get("z") ?? 0);
const yaw = Number(args.get("yaw") ?? 0);
const pitch = Number(args.get("pitch") ?? -0.06);
const height = Number(args.get("h") ?? 90);
const top = args.has("top");
const name = String(args.get("name") ?? `dressing_p${phase}_${Math.round(x)}_${Math.round(z)}${top ? "_top" : ""}`);
const outDir = path.resolve(String(args.get("out") ?? path.join(projectDir, "_shots")));
fs.mkdirSync(outDir, { recursive: true });

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const problems = [];
page.on("pageerror", (error) => problems.push(`PAGEERROR ${String(error).slice(0, 240)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  if (/fonts\.(googleapis|gstatic)\.com/.test(message.location()?.url || "")) return;
  problems.push(`CONSOLE ${message.text().slice(0, 240)}`);
});

const query = top
  ? `phase=${phase}&quality=high&scale=small`
  : `shot=1&phase=${phase}&quality=high&scale=small`;
await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?${query}`,
  { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => window.Taierzhuang !== undefined, null, { timeout: 180000 });
await page.evaluate(() => window.Taierzhuang.StepFrames(180));
await page.waitForTimeout(600);
await page.evaluate(({ pose }) => {
  const game = window.Taierzhuang;
  if (pose.top) {
    // 俯拍要的是城，不是标题层：把 DOM 覆盖层藏掉（只动样式，不动状态机）。
    for (const id of ["menu", "hud", "boot"]) {
      const el = document.getElementById(id);
      if (el) el.style.visibility = "hidden";
    }
    const index = 0;
    const shot = game.menu.shots[index];
    shot.from = [pose.x + pose.height * 0.32, pose.height, pose.z + pose.height * 0.32];
    shot.to = shot.from;
    shot.look = [pose.x, 0, pose.z];
    shot.lookTo = shot.look;
    game.menu.shotIndex = index;
    game.menu.shotTime = 0;
    game.menu.ApplyShot(0);
    game.StepFrames(12);
    return;
  }
  game.player.Spawn(pose.x, pose.z, pose.yaw);
  game.player.pitch = pose.pitch;
  game.player.health = 100;
  game.player.bleeding = 0;
  game.player.hitFlash = 0;
  game.player.hitMarks.length = 0;
  if (game.ai) for (const soldier of game.ai.soldiers) {
    soldier.coolUntil = 1e9;
    soldier.fireTimer = 0;
  }
  game.StepFrames(12);
}, { pose: { top, x, z, yaw, pitch, height } });
await page.evaluate(() => window.Taierzhuang.StepFrames(45));
await page.waitForTimeout(400);
const file = path.join(outDir, `${name}.png`);
await page.screenshot({ path: file });
await browser.close();
server.close();
console.log(`${problems.length ? "ERR " : "ok  "}${file}`);
for (const p of problems.slice(0, 4)) console.log(`     ${p}`);
process.exit(problems.length ? 1 : 0);
