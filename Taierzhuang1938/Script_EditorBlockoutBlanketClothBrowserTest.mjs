// ===========================================================================
// Script_EditorBlockoutBlanketClothBrowserTest.mjs —— 白盒编辑器里单被的布料模拟（2026-10-21）的浏览器闸门
//
// 跑法：node Taierzhuang1938/Script_EditorBlockoutBlanketClothBrowserTest.mjs
// 口径：docs/Data_EditorBlockout.md §5.6（单被）、docs/Data_SingleBlanket.md「游戏内实时模拟」。关卡 FirstLevel0105，
// 预演 02-3（何有田揪起被角）、02-4（两人并排拖到弹药箱垛、松手、往箱垛后一拽）。纯求解器另见 Script_BlanketClothTest。
//
//   1. 正式单被上了布料（Probe model "SingleBlanket"、blanketCloth.cloth）；关键帧布设里没人拽：平铺贴地；
//   2. 02-3：被子刚铺下、还没人揪的时候平铺；何有田揪起被角以后两角被拽着；
//   3. 02-4 拖到半路（Seek）：两角都钉在手上（离手 < 1 cm）、两角各在一个拖的人的手边、尾巴贴地、冬瓜身下有布被压住、
//      拉长有上限；从不同的时刻 Seek 到同一秒，布差不多一样（Seek 时重新铺平再空推，跟之前播到哪无关；拖的人走路的相位
//      不完全由时间定，手差几厘米，布也差一点）；
//   4. 松手之后（02-4 18.5 s）两角放开、布落平；
//   5. 连续播 1.5 s：每帧布料耗时（中位数 < 2 ms）、不出 NaN、被头始终在被尾前头（没对折）、拉长有上限；
//   6. 全程没有未捕获错误。截图存 _shots/EditorBlockoutBlanketCloth/（不提交）。
//   7. 2026-10-23 dragSolo：FirstLevel1218 14-2 顺子扑倒松手 —— 被子键 dragSolo: true 之前两角都攥着（玩家那角镜像），之后只剩妮儿那一角，
//      另一角放开落地（§5.6 / §14.1）。
// ===========================================================================

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const shotDir = path.join(projectDir, "_shots", "EditorBlockoutBlanketCloth");
await fs.mkdir(shotDir, { recursive: true });

const results = [];
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}
const J = (v) => JSON.stringify(v);
const LEVEL = "FirstLevel0105";
const Dist = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) : Infinity);
const Mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 300)}`));
page.on("console", (message) => {
  const url = message.location()?.url || "";
  if (message.type() === "warning" && /blanket|cloth/i.test(message.text())) errors.push(`WARN ${message.text().slice(0, 240)}`);
  if (message.type() !== "error") return;
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  if (/__blockout/.test(url) || /__blockout/.test(message.text())) return;
  if (/\/Animation\/Previz\w+\/Data_Previz\w+Animation\.json/.test(url) && /404/.test(message.text())) return;
  if (/\/Audio\/BlockoutPreviz\//.test(url) && /404/.test(message.text())) return;
  errors.push(`CONSOLE ${message.text().slice(0, 240)} @ ${url}`);
});
const B = (fn, arg) => page.evaluate(fn, arg);
/** Seek 到 t，等三帧，读被子 / 冬瓜 / 拖的人。 */
const SeekProbe = (t) => B(async (t) => {
  const Bl = window.Tengxian.Debug.Blockout;
  await Bl.Previz.Seek(t);
  for (let i = 0; i < 3; i++) await new Promise(r => requestAnimationFrame(r));
  const P = (id) => Bl.Probe(id);
  return { blanket: P("Blanket"), donggua: P("Donggua"), he: P("HeYoutian"), shunzi: P("Shunzi") };
}, t);
async function PlayKf(kf) {
  await B(() => window.Tengxian.Debug.Blockout.Previz.Stop());
  await B((kf) => { window.Tengxian.Debug.Blockout.Previz.Play(kf); }, kf);
  await page.waitForFunction(() => window.Tengxian.Debug.Blockout.Previz.State().playing, null, { timeout: 120000, polling: 100 });
}
const Shot = (name) => page.screenshot({ path: path.join(shotDir, name) });

try {
  console.log("--- boot");
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?editor=blockout&level=${LEVEL}&kf=02-4&quality=whitebox&scale=small&audio=0`,
    { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready && window.Tengxian?.Debug?.Blockout?.State().ready, null, { timeout: 300000, polling: 200 });
  // 正式模型异步下载：等被子换上单被
  await page.waitForFunction(() => window.Tengxian.Debug.Blockout.Probe("Blanket")?.model === "SingleBlanket", null, { timeout: 120000, polling: 200 });
  for (let i = 0; i < 20; i++) await B(() => new Promise(r => requestAnimationFrame(r)));

  // 1. 关键帧布设：没人拽 → 平铺贴地
  {
    const p = await B(() => window.Tengxian.Debug.Blockout.Probe("Blanket"));
    const c = p.blanketCloth;
    Check("正式单被接上了布料模拟", p.model === "SingleBlanket" && c?.cloth === true, J({ model: p.model, cloth: c?.cloth }));
    Check("关键帧布设里没人拽：两角放开、平铺贴地", c && c.drag === 0 && !c.headL.held && !c.headR.held && c.topM < 0.05 && c.contact >= 200,
      J({ drag: c?.drag, top: c?.topM, contact: c?.contact }));
    await Shot("kf_02-4.png");
  }

  // 2. 02-3：刚铺下时平铺；何有田揪起被角以后被拽着
  console.log("--- 02-3");
  await PlayKf("02-3");
  {
    const a = await SeekProbe(20);
    Check("02-3 被子刚铺下、还没人揪：平铺", a.blanket.visible && a.blanket.blanketCloth.drag === 0 && a.blanket.blanketCloth.topM < 0.05,
      J({ drag: a.blanket.blanketCloth.drag, top: a.blanket.blanketCloth.topM }));
    const b = await SeekProbe(24);
    const c = b.blanket.blanketCloth;
    Check("02-3 何有田揪起被角以后两角被拽着、离手 < 1 cm", c.drag === 1 && c.headL.held && c.headR.held && c.headL.gapM < 0.01 && c.headR.gapM < 0.01,
      J({ headL: c.headL, headR: c.headR }));
    await Shot("02-3_24.png");
  }

  // 3. 02-4 拖到半路
  console.log("--- 02-4");
  await PlayKf("02-4");
  {
    await SeekProbe(3);
    const a = await SeekProbe(8);
    const c = a.blanket.blanketCloth;
    Check("02-4 拖到半路：两角都钉在手上（离手 < 1 cm）", c.headL.held && c.headR.held && c.headL.gapM < 0.01 && c.headR.gapM < 0.01, J({ headL: c.headL, headR: c.headR }));
    // 两角各在一个拖的人的手边（掌心离手骨约 8 cm；两手比被头宽时往里收，最多再差约 9 cm）
    const hands = (p) => [p?.handL, p?.handR].filter(Boolean);
    const near = (corner, p) => Math.min(...hands(p).map(h => Dist(corner, h)));
    const he = Math.min(near(c.headL, a.he), near(c.headR, a.he)), sh = Math.min(near(c.headL, a.shunzi), near(c.headR, a.shunzi));
    const heSide = near(c.headL, a.he) < near(c.headR, a.he) ? "headL" : "headR", shSide = near(c.headL, a.shunzi) < near(c.headR, a.shunzi) ? "headL" : "headR";
    Check("两角各在一个拖的人手边（何有田一个、顺子替身一个，< 0.25 m）", he < 0.25 && sh < 0.25 && heSide !== shSide,
      J({ he: +he.toFixed(3), heSide, shunzi: +sh.toFixed(3), shSide, heClip: a.he?.shownClip, shClip: a.shunzi?.shownClip }));
    Check("尾巴贴地", c.tailL.aboveGround < 0.05 && c.tailR.aboveGround < 0.05, J({ tailL: c.tailL.aboveGround, tailR: c.tailR.aboveGround }));
    Check("冬瓜躺在被子上（身下有布被压住）", c.pressed >= 1 && c.colliders >= 13, J({ pressed: c.pressed, colliders: c.colliders }));
    Check("相邻质点间距拉长 / 压短有上限", c.maxStretch < 1.8 && c.minRatio > 0.4, J({ maxStretch: c.maxStretch, minRatio: c.minRatio }));
    await Shot("02-4_8.png");
    await SeekProbe(16);
    const again = await SeekProbe(8);
    const d = again.blanket.blanketCloth;
    const diff = Math.max(...["headL", "headR", "tailL", "tailR"].map(k => Dist(d[k], c[k])));
    Check("从 3 s 和 16 s 分别 Seek 到 8 s：布差不多一样（< 0.3 m，跟之前播到哪无关）", diff < 0.3 && d.resets > c.resets, J({ diff: +diff.toFixed(3), first: c.tailL, second: d.tailL }));
  }

  // 4. 松手之后布落平
  {
    const a = await SeekProbe(18.5);
    const c = a.blanket.blanketCloth;
    Check("02-4 松手之后（18.5 s）：两角放开、布落平", c.drag === 0 && !c.headL.held && !c.headR.held && c.topM < 0.1,
      J({ drag: c.drag, top: c.topM, heClip: a.he?.shownClip }));
    await Shot("02-4_18p5.png");
  }

  // 5. 连续播
  console.log("--- 连续播");
  {
    const run = await B(async () => {
      const Bl = window.Tengxian.Debug.Blockout;
      await Bl.Previz.Seek(5);
      Bl.Previz.Resume();
      const ms = [], bad = [];
      let maxStretch = 0, minRatio = Infinity, minAlong = Infinity, worst = null;
      for (let i = 0; i < 90; i++) {
        await new Promise(r => requestAnimationFrame(r));
        const p = Bl.Probe("Blanket"), c = p.blanketCloth;
        ms.push(c.lastMs);
        const pts = [c.headL, c.headR, c.tailL, c.tailR];
        if (!pts.every(q => Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z))) bad.push(i);
        maxStretch = Math.max(maxStretch, c.maxStretch); minRatio = Math.min(minRatio, c.minRatio);
        // 被头在被尾前头：沿被子朝向（yaw 0 朝北 −Z，+90 朝西）量头、尾两边中点
        const a = p.yawDeg * Math.PI / 180, fx = -Math.sin(a), fz = -Math.cos(a);
        const hx = (c.headL.x + c.headR.x) / 2, hz = (c.headL.z + c.headR.z) / 2, tx = (c.tailL.x + c.tailR.x) / 2, tz = (c.tailL.z + c.tailR.z) / 2;
        const along = (hx - tx) * fx + (hz - tz) * fz;
        if (along < minAlong) { minAlong = along; worst = { i, t: Bl.Previz.State().t, yaw: p.yawDeg, head: [hx, hz], tail: [tx, tz], resets: c.resets, visible: p.visible }; }
      }
      Bl.Previz.Stop();
      ms.sort((a, b) => a - b);
      return { median: ms[ms.length >> 1], p95: ms[Math.floor(ms.length * 0.95)], bad, maxStretch, minRatio, minAlong, worst };
    });
    Check("连续播：每帧布料耗时中位数 < 2 ms", run.median < 2, J({ median: run.median, p95: run.p95 }));
    Check("连续播：不出 NaN", run.bad.length === 0, J(run.bad.slice(0, 5)));
    Check("连续播：被头始终在被尾前头（没对折）", run.minAlong > 1.0, `头尾沿朝向最近 ${run.minAlong.toFixed(2)} m ${J(run.worst)}`);
    Check("连续播：拉长有上限", run.maxStretch < 1.8, J({ maxStretch: run.maxStretch, minRatio: run.minRatio }));
  }

  // 7. 2026-10-23 dragSolo（§5.6）：FirstLevel1218 14-2 顺子扑倒松了手 —— 松手前两角都攥着（妮儿一角、玩家那角镜像），
  //    被子键 dragSolo: true 之后只剩妮儿那一角钉在手上，玩家那角放开落地
  console.log("--- 1218 14-2 dragSolo");
  {
    await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?editor=blockout&level=FirstLevel1218&kf=14-2&quality=whitebox&scale=small&audio=0`,
      { waitUntil: "load", timeout: 180000 });
    await page.waitForFunction(() => window.Tengxian?.state?.ready && window.Tengxian?.Debug?.Blockout?.State().ready, null, { timeout: 300000, polling: 200 });
    await page.waitForFunction(() => window.Tengxian.Debug.Blockout.Probe("BlanketDonggua")?.model === "SingleBlanket", null, { timeout: 120000, polling: 200 });
    await page.waitForFunction(() => window.Tengxian.Debug.Blockout.Previz.Has("14-2"), null, { timeout: 30000 });
    const seq = await B(async () => { const r = await fetch("./Blockout/FirstLevel1218.previz.json?t=" + Date.now()); return (await r.json()).sequences.find(s => s.keyframe === "14-2"); });
    const solo = seq.actors.find(a => a.id === "BlanketDonggua").keys.find(k => k.dragSolo === true);
    Check("1218 14-2 预演里被子有 dragSolo: true 的键", !!solo, J(solo));
    await PlayKf("14-2");
    const Probe2 = (t) => B(async (t) => {
      const Bl = window.Tengxian.Debug.Blockout;
      await Bl.Previz.Seek(t);
      for (let i = 0; i < 3; i++) await new Promise(r => requestAnimationFrame(r));
      return { blanket: Bl.Probe("BlanketDonggua"), nier: Bl.Probe("Nier") };
    }, t);
    const before = await Probe2(Math.max(0.3, solo.t - 0.4));
    const cb = before.blanket.blanketCloth;
    Check("松手前：两角都攥着（妮儿一角 + 玩家那角镜像）", before.blanket.blanketDragSolo === false && cb.headL.held && cb.headR.held, J({ solo: before.blanket.blanketDragSolo, headL: cb.headL, headR: cb.headR }));
    await Shot("1218_14-2_before.png");
    const after = await Probe2(solo.t + 2.0);
    const ca = after.blanket.blanketCloth;
    const held = [ca.headL, ca.headR].filter(c => c.held), loose = [ca.headL, ca.headR].filter(c => !c.held);
    Check("松手后：只剩一个角被攥着（妮儿），另一角放开落地", after.blanket.blanketDragSolo === true && held.length === 1 && loose.length === 1 && loose[0].aboveGround < 0.2,
      J({ solo: after.blanket.blanketDragSolo, headL: ca.headL, headR: ca.headR, nierClip: after.nier?.shownClip }));
    const hands = (p) => [p?.handL, p?.handR].filter(Boolean);
    const nearNier = held.length ? Math.min(...hands(after.nier).map(h => Dist(held[0], h))) : Infinity;
    Check("攥着的那角在妮儿手边（< 0.3 m）", nearNier < 0.3, J({ nearNier: +nearNier.toFixed(3) }));
    await Shot("1218_14-2_after.png");
    await B(() => window.Tengxian.Debug.Blockout.Previz.Stop());
  }
} catch (error) {
  Check("没有抛错", false, String(error?.stack || error).slice(0, 600));
} finally {
  Check("全程没有未捕获错误", errors.length === 0, errors.slice(0, 6).join(" | "));
  await browser.close();
  server.close();
}
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
