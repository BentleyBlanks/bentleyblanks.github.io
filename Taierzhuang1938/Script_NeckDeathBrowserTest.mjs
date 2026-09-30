// 敌军喉咙窒息哽咽：真引擎里走 Soldier.TakeHit → Kill 这一整条，验证「近处刀杀 / 脖子中弹」放 neckDeath、
// 其余照旧喊日语痛呼（docs/Data_NeckDeath.md）。规则层的边界值在 Script_NeckDeathTest（纯 Node）。
//
// 用法：node Taierzhuang1938/Script_NeckDeathBrowserTest.mjs      退出码即成败。
// 抽签是确定性哈希 (士兵 id, 受击序号)：测试用真的 NeckDeathRoll 反推一个「必中/必不中」的受击序号，
// 再走真的 TakeHit，不去 mock 任何一层。
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR ${String(e).slice(0, 240)}`));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const url = m.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  errors.push(`CONSOLE ${m.text().slice(0, 240)}`);
});
const results = [];
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}

await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=1&quality=low&scale=small`,
  { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => window.Taierzhuang !== undefined, null, { timeout: 240000 });
await page.evaluate(() => {
  const T = window.Taierzhuang;
  T.state.phaseTime = 31;
  T.state.spawnAccumulator = 3.1;
  T.StepFrames(1, 1 / 60, false);
});

const out = await page.evaluate(async () => {
  const T = window.Taierzhuang;
  const { NeckDeathRoll } = await import("./Script_NeckDeath.mjs");
  const { NECK_DEATH } = await import("./Data_NeckDeath.mjs");
  const ija = T.ai.soldiers.filter((s) => s.side === "ija" && s.alive && s.actor?.characterRig);
  const nra = T.ai.soldiers.filter((s) => s.side === "nra" && s.alive && s.actor?.characterRig);
  const player = T.player;
  const played = [], barks = [];
  const realPlay = T.audio.Play.bind(T.audio), realBark = T.audio.Bark.bind(T.audio);
  T.audio.Play = (name, opt) => { played.push(name); return realPlay(name, opt); };
  T.audio.Bark = (kind, opt) => { barks.push(kind); return realBark(kind, opt); };

  /** 让这个兵的下一次致命受击抽签 `want`（"hit" 中 / "miss" 不中）。 */
  const Prepare = (s, chance, want) => {
    s.scriptEssential = false; s.openingDoomed = false; s.health = 100;
    for (let seq = 1; seq < 500; seq += 1) {
      const r = NeckDeathRoll(s.id, seq);
      if (want === "hit" ? r < chance : r >= chance) { s.damageSequence = seq - 1; return true; }
    }
    return false;
  };
  const Near = (s, meters) => { s.position.set(player.position.x + meters, player.position.y, player.position.z); };
  const Run = (s, fire) => {
    played.length = 0; barks.length = 0;
    fire(s);
    return { neck: played.filter((n) => n === "neckDeath").length, barks: barks.filter((k) => k === "hurt").length, dead: !s.alive };
  };
  const shapes = (s) => s.actor.characterRig.GetHitboxes();
  const NeckPoint = (s) => {
    const torso = shapes(s).find((h) => h.id === "upperTorso");
    return { shapeId: "upperTorso", point: { x: torso.end.x, y: torso.end.y - 0.01, z: torso.end.z } };
  };
  const ChestPoint = (s) => {
    const torso = shapes(s).find((h) => h.id === "upperTorso");
    return { shapeId: "upperTorso", point: { x: torso.start.x, y: torso.start.y + 0.02, z: torso.start.z } };
  };
  const dir = new player.position.constructor(0, 0, 1);
  const Gap = () => { T.ai.time += 5; };   // 越过 minGapS
  const r = {};
  const pool = [...ija];
  r.available = { ija: ija.length, nra: nra.length };

  // 1 近处刀杀 + 抽中 → 放，且不再喊日语
  let s = pool.shift(); Gap(); Near(s, 6); Prepare(s, NECK_DEATH.chance.blade, "hit");
  r.blade = Run(s, (x) => x.TakeHit(999, "torso", dir, { kind: "blade", shapeId: "upperTorso", point: ChestPoint(x).point }));
  // 2 近处脖子中弹 + 抽中 → 放
  s = pool.shift(); Gap(); Near(s, 8); Prepare(s, NECK_DEATH.chance.neckShot, "hit");
  r.neckShot = Run(s, (x) => { const n = NeckPoint(x); x.TakeHit(999, "torso", dir, { kind: "bullet", shapeId: n.shapeId, point: n.point }); });
  // 3 近处胸口中弹 → 不放，照旧喊
  s = pool.shift(); Gap(); Near(s, 8); Prepare(s, NECK_DEATH.chance.neckShot, "hit");
  r.chestShot = Run(s, (x) => { const n = ChestPoint(x); x.TakeHit(999, "torso", dir, { kind: "bullet", shapeId: n.shapeId, point: n.point }); });
  // 4 刀杀但太远 → 不放
  s = pool.shift(); Gap(); Near(s, NECK_DEATH.nearM + 6); Prepare(s, NECK_DEATH.chance.blade, "hit");
  r.far = Run(s, (x) => x.TakeHit(999, "torso", dir, { kind: "blade", shapeId: "upperTorso", point: ChestPoint(x).point }));
  // 5 刀杀但抽签没中（「部分敌军」）→ 不放
  s = pool.shift(); Gap(); Near(s, 5); Prepare(s, NECK_DEATH.chance.blade, "miss");
  r.unlucky = Run(s, (x) => x.TakeHit(999, "torso", dir, { kind: "blade", shapeId: "upperTorso", point: ChestPoint(x).point }));
  // 6 同一时钟里连着两个 → 第二个让位给日语痛呼
  s = pool.shift(); Gap(); Near(s, 5); Prepare(s, NECK_DEATH.chance.blade, "hit");
  const first = Run(s, (x) => x.TakeHit(999, "torso", dir, { kind: "blade", shapeId: "upperTorso", point: ChestPoint(x).point }));
  s = pool.shift(); Near(s, 5); Prepare(s, NECK_DEATH.chance.blade, "hit");
  const second = Run(s, (x) => x.TakeHit(999, "torso", dir, { kind: "blade", shapeId: "upperTorso", point: ChestPoint(x).point }));
  r.gap = { first: first.neck, second: second.neck, secondBarks: second.barks };
  // 7 脚本直接 Kill（不经 TakeHit）→ 照旧
  s = pool.shift(); Gap(); Near(s, 5);
  r.scripted = Run(s, (x) => x.Kill(dir));
  // 8 中方的兵刀杀 → 不放
  if (nra.length) {
    const n = nra[0]; Gap(); Near(n, 5); Prepare(n, NECK_DEATH.chance.blade, "hit");
    r.nra = Run(n, (x) => x.TakeHit(999, "torso", dir, { kind: "blade", shapeId: "upperTorso", point: ChestPoint(x).point }));
  }
  T.audio.Play = realPlay; T.audio.Bark = realBark;
  return r;
});

Check("场上有足够的日军可测", out.available.ija >= 8, `日军 ${out.available.ija}，国军 ${out.available.nra}`);
Check("近处刀杀（抽中）→ 放 neckDeath，且不再喊日语痛呼", out.blade.dead && out.blade.neck === 1 && out.blade.barks === 0, JSON.stringify(out.blade));
Check("近处脖子中弹（抽中）→ 放 neckDeath", out.neckShot.dead && out.neckShot.neck === 1 && out.neckShot.barks === 0, JSON.stringify(out.neckShot));
Check("近处胸口中弹 → 不放，照旧喊", out.chestShot.dead && out.chestShot.neck === 0 && out.chestShot.barks === 1, JSON.stringify(out.chestShot));
Check("刀杀但离玩家太远 → 不放", out.far.dead && out.far.neck === 0 && out.far.barks === 1, JSON.stringify(out.far));
Check("刀杀但抽签没中 → 不放（部分敌军）", out.unlucky.dead && out.unlucky.neck === 0 && out.unlucky.barks === 1, JSON.stringify(out.unlucky));
Check("同一时钟里连着两个 → 第二个让位给日语痛呼", out.gap.first === 1 && out.gap.second === 0 && out.gap.secondBarks === 1, JSON.stringify(out.gap));
Check("脚本直接 Kill → 照旧喊", out.scripted.dead && out.scripted.neck === 0 && out.scripted.barks === 1, JSON.stringify(out.scripted));
if (out.nra) Check("国军的兵刀杀 → 不放", out.nra.dead && out.nra.neck === 0, JSON.stringify(out.nra));
Check("没有页面错误", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length) { console.log("失败：\n  " + failed.map((r) => r.name).join("\n  ")); process.exit(1); }
