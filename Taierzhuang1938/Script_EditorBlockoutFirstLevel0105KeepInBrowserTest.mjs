// ===========================================================================
// Script_EditorBlockoutFirstLevel0105KeepInBrowserTest.mjs —— 01–05 白盒「玩家出不了沟」的闸门（2026-10-21）
//
// 跑法：node Taierzhuang1938/Script_EditorBlockoutFirstLevel0105KeepInBrowserTest.mjs
// 口径：docs/Data_EditorBlockout.md §13「2026-10-21 防止玩家跳出壕沟」、§2.2 体块 noClimb / tag airWall。
//
//   1. 静态（node）：剧本要走的通路（三条壕沟、坑与三个射位、爬沟到散兵坑、支沟到防炮洞、交通沟坡道到干沟、干沟、凹路口）
//      逐 0.25 m 都在「沟里」掩码里，离隐形墙 ≥ 0.4 m（墙不堵路）；胸墙、板桥标了 noClimb。
//   2. 浏览器：低处、空子各站一次（坡顶段、塌方摆件、台阶、支沟口、坑沿射击台、板桥两头、沟口和坑的接缝、散兵坑、
//      前沿沟西头北折、干沟、凹路、防炮洞口），八个方向各按住 W（一半时间加 Shift）连按 Space 三秒（跳跃 + 翻越 / 攀爬），
//      全程每一帧脚下都还在沟里；坑沿射击台朝北翻不过胸墙（ProbeVault 为空）。
//   3. 从乙位顺交通沟走到集结处（04 / 05 / 02 末走的路，拖被子那条路的南半截）、从防炮洞口顺支沟上台阶到交通沟，都走得到。
//   4. 手榴弹从前沿沟里往北扔，飞出沟外落在沟北（隐形墙不挡手榴弹）。
//   5. NPC 不受墙影响：预演里班长翻出沟（PvClimbOutTrench）前后，人从沟里到了沟外；站人的地面在墙线上就是地面，不是墙顶。
// 截图（?airWalls=1 把隐形墙画成半透明红板）存 _shots/EditorBlockout0105/KeepIn/（不提交）。
// ===========================================================================

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { KeepInMask, KEEP_IN } from "./Script_EditorBlockoutFirstLevel0105Scene.mjs";
import { L0105_TRENCHES, L0105_PLACES, L0105_GULLY, L0105_SUNKEN_LANE, PointAlong, LineLength } from "./Data_EditorBlockoutFirstLevel0105Space.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const shotDir = path.join(projectDir, "_shots", "EditorBlockout0105", "KeepIn");
await fs.mkdir(shotDir, { recursive: true });

const results = [];
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}
const J = (v) => JSON.stringify(v);
const P = L0105_PLACES;

// --- 1. 静态 ------------------------------------------------------------------
const scene = JSON.parse(await fs.readFile(path.join(projectDir, "Blockout", "FirstLevel0105.scene.json"), "utf8"));
const t = scene.terrain;
const { mask, W } = KeepInMask(t);
const Inside = (x, z) => {
  const ix = Math.round((x - t.minX) / t.cellM), iz = Math.round((z - t.minZ) / t.cellM);
  return ix >= 0 && ix <= t.cols && iz >= 0 && iz <= t.rows && mask[iz * W + ix] === 1;
};
const walls = scene.blocks.filter((b) => b.tag === "airWall");
const segs = walls.map((b) => { const c = Math.cos(b.ry), s = Math.sin(b.ry), h = b.w / 2; return [b.x - c * h, b.z + s * h, b.x + c * h, b.z - s * h]; });
const WallDist = (x, z) => {
  let best = Infinity;
  for (const [ax, az, bx, bz] of segs) {
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const k = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - ax - dx * k, z - az - dz * k));
  }
  return best;
};
Check("沟沿隐形墙：都是 tag airWall、不可见、只当碰撞（semantic airWall），数量像样",
  walls.length > 200 && walls.every((b) => b.visual === false && b.semantic === "airWall" && b.solid !== false && b.h > 3), `${walls.length} 段`);
const noClimb = [...scene.blocks, ...(scene.gates || [])].filter((b) => b.noClimb).map((b) => b.id);
Check("胸墙三截 + 塌下来的土、板桥的横木与门板标了「不能攀」（noClimb）；射击台没标",
  ["ParapetWest", "ParapetEast", "ParapetMiddle", "ParapetRubble", "BridgeStringer_1", "BridgeDoorBoard_01"].every((id) => noClimb.includes(id))
    && !noClimb.includes("PitFireStep") && !noClimb.some((id) => /^BranchStep/.test(id)), noClimb.join(","));
/** 折线上每 0.25 m 一点（两头各留 skipEnd 米：死胡同的沟尾、凹路尽头墙横着封口）。 */
function Route(name, line, { skipStart = 0, skipEnd = 0 } = {}) {
  const len = LineLength(line), pts = [];
  for (let d = skipStart; d <= len - skipEnd + 1e-6; d += 0.25) pts.push(PointAlong(line, d));
  return { name, pts };
}
const routes = [
  Route("前沿沟（西头北折 → 东头）", L0105_TRENCHES.front, { skipStart: 2, skipEnd: 2 }),
  Route("交通沟（沟口 → 坡顶 → 坡道下到干沟）", L0105_TRENCHES.traffic),
  Route("支沟（交通沟 → 防炮洞口）", [...L0105_TRENCHES.branch.slice(0, 1), { x: P.dugoutMouth.x - 0.5, z: P.dugoutMouth.z }]),
  Route("爬沟（坑西北角 → 散兵坑）", [...L0105_TRENCHES.crawlSap, { x: P.fireC.x, z: P.fireC.z }]),
  Route("坑里：沟口 → 坑底 → 甲位", [{ x: P.mouth.x, z: P.mouth.z }, { x: 0.4, z: -6.2 }, { x: P.fireA.x, z: P.fireA.z }]),
  Route("沟口 → 乙位", [{ x: P.mouth.x, z: P.mouth.z }, { x: P.fireB.x, z: P.fireB.z }]),
  Route("干沟（集结处，中心线）", L0105_GULLY.line, { skipStart: 3, skipEnd: 3 }),
  Route("干沟 → 支沟（伤员）→ 凹路口", [{ x: P.assembly.x, z: P.assembly.z }, { x: P.woundedBay.x, z: P.woundedBay.z }, { x: P.laneHead.x, z: P.laneHead.z }]),
  Route("凹路头 40 m", L0105_SUNKEN_LANE.line, { skipEnd: Math.max(0, LineLength(L0105_SUNKEN_LANE.line) - 40) }),
];
for (const r of routes) {
  const out = r.pts.filter((p) => !Inside(p.x, p.z));
  const near = r.pts.map((p) => ({ ...p, d: WallDist(p.x, p.z) })).filter((p) => p.d < 0.4);
  Check(`通路不被堵：${r.name}（${r.pts.length} 点都在沟里、离墙 ≥ 0.4 m）`, out.length === 0 && near.length === 0,
    out.length ? `沟外 ${out.length} 点，如 (${out[0].x.toFixed(1)},${out[0].z.toFixed(1)})` : near.length ? `贴墙 ${near.length} 点，最近 ${Math.min(...near.map((p) => p.d)).toFixed(2)} m 在 (${near[0].x.toFixed(1)},${near[0].z.toFixed(1)})` : "");
}
const kfDoc = JSON.parse(await fs.readFile(path.join(projectDir, "Blockout", "FirstLevel0105.json"), "utf8"));
const kfOut = kfDoc.keyframes.filter((k) => !Inside(k.player.x, k.player.z)).map((k) => k.id);
Check("每个关键帧顺子站的地方都在沟里", kfOut.length === 0, kfOut.join(","));

// --- 2–5. 浏览器 ---------------------------------------------------------------
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser({ extraArgs: ["--mute-audio"] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e?.message || e)));
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?editor=blockout&level=FirstLevel0105&kf=03-3&quality=whitebox&scale=small&audio=0&airWalls=1`,
    { waitUntil: "load", timeout: 300000 });
  await page.waitForFunction(() => window.Tengxian?.Debug?.Blockout?.State().ready && window.Taierzhuang?.player, null, { timeout: 300000 });
  const loaded = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const air = T.battlefield?.colliders?.filter?.((c) => c.tag === "airWall").length ?? -1;
    const nc = T.battlefield?.colliders?.filter?.((c) => c.noClimb).length ?? -1;
    return { air, nc };
  });
  Check("编辑器里建出了隐形墙碰撞、不能攀的块带着标记", loaded.air === walls.length && loaded.nc >= 15, J(loaded));

  // 2. 低处 / 空子：八个方向各试三秒（按住 W，后半段加 Shift；每 0.5 s 按一下 Space）
  const SPOTS = [
    ["坡顶段", 35, 128], ["坡顶南头（坡道上沿）", 35, 135.5], ["塌方 Collapse_F1 旁", -31.35, 0.6], ["塌方 Collapse_T1 旁", 27.0, 78.8],
    ["支沟台阶顶上", 23.95, 66.97], ["支沟口（交通沟这边）", 21.9, 67.1], ["坑沿射击台 甲位", 0.8, -9.2], ["射击台东头", 3.0, -9.05],
    ["射击台西头 / 爬沟口", -3.3, -9.05], ["板桥北头", 35, 113.6], ["板桥南头", 35, 118.4], ["沟口和坑的接缝（西）", -3.4, -3.4],
    ["沟口和坑的接缝（东）", 3.4, -3.4], ["散兵坑", -9, -15], ["前沿沟西头北折", -62, -14], ["干沟北岸下", 47, 148.5],
    ["干沟南岸下", 64, 156.5], ["凹路", 82, 176], ["防炮洞口", 61.5, 64.5],
  ];
  const escapes = [];
  let attempts = 0, vaults = 0, jumps = 0;
  for (const [name, x, z] of SPOTS) {
    const r = await page.evaluate(({ x, z }) => {
      const T = window.Taierzhuang, B = window.Tengxian.Debug.Blockout, D = T.Debug;
      const out = [];
      let v = 0, j = 0;
      for (let k = 0; k < 8; k++) {
        B.PlacePlayer({ x, z, yawDeg: k * 45, pitchDeg: 0, stance: "stand" });
        T.StepFrames(12, 1 / 60, false);
        T.player.stamina = 1;
        const v0 = D.Vault().count, j0 = D.Jump().count;
        const track = [];
        D.Key("KeyW", true);
        for (let i = 0; i < 180; i++) {
          if (i === 90) D.Key("ShiftLeft", true);
          if (i % 30 === 5) { T.player.stamina = 1; D.Key("Space"); }
          T.StepFrames(1, 1 / 60, false);
          if (i % 3 === 0) track.push([+T.player.position.x.toFixed(2), +T.player.position.z.toFixed(2), +T.player.position.y.toFixed(2)]);
        }
        D.Key("ShiftLeft", false); D.Key("KeyW", false);
        T.StepFrames(20, 1 / 60, false);
        const p = T.player.position;
        track.push([+p.x.toFixed(2), +p.z.toFixed(2), +p.y.toFixed(2)]);
        v += D.Vault().count - v0; j += D.Jump().count - j0;
        out.push({ yaw: k * 45, track });
      }
      return { runs: out, v, j };
    }, { x, z });
    vaults += r.v; jumps += r.j;
    for (const run of r.runs) {
      attempts += 1;
      const bad = run.track.find(([px, pz]) => !Inside(px, pz));
      if (bad) escapes.push(`${name} 朝 ${run.yaw}° → (${bad[0]},${bad[1]}) y ${bad[2]}`);
    }
  }
  Check(`${SPOTS.length} 处低处 / 空子 × 8 个方向，跳跃 + 翻越 / 攀爬三秒，每一帧都还在沟里`, escapes.length === 0,
    escapes.length ? escapes.slice(0, 6).join("；") : `${attempts} 趟，起跳 ${jumps} 次、翻越 ${vaults} 次`);
  Check("确实试过跳和翻（不是原地不动就算过）", jumps > 100, `起跳 ${jumps}、翻越 ${vaults}`);
  const parapet = await page.evaluate(() => {
    const T = window.Taierzhuang, B = window.Tengxian.Debug.Blockout;
    const rows = [];
    for (const x of [-2.4, -0.4, 0.8, 2.2]) {
      B.PlacePlayer({ x, z: -9.2, yawDeg: 0, pitchDeg: 0, stance: "stand" });
      T.StepFrames(12, 1 / 60, false);
      T.player.stamina = 1;
      rows.push({ x, onStep: +(T.player.position.y).toFixed(2), probe: T.player.ProbeVault() ? T.player.ProbeVault().plan.kind : null });
    }
    return rows;
  });
  Check("坑沿射击台上朝北：站在台上（能露头），翻不过胸墙（ProbeVault 为空）", parapet.every((r) => r.probe === null), J(parapet));

  // 3. 走得到：乙位 → 交通沟 → 坡顶 → 坡道 → 集结处；防炮洞口 → 支沟 → 台阶 → 交通沟
  async function Walk(name, waypoints) {
    const r = await page.evaluate((wps) => {
      const T = window.Taierzhuang, B = window.Tengxian.Debug.Blockout, D = T.Debug;
      const s = wps[0];
      B.PlacePlayer({ x: s.x, z: s.z, yawDeg: 0, pitchDeg: 0, stance: "stand" });
      T.StepFrames(12, 1 / 60, false);
      D.Key("KeyW", true);
      let k = 1, frames = 0, stuck = 0, lastD = Infinity, spaces = 0;
      const out = [];
      while (k < wps.length && frames < 9000) {
        const p = T.player.position, w = wps[k];
        const dx = w.x - p.x, dz = w.z - p.z, d = Math.hypot(dx, dz);
        if (d < 0.7) { k += 1; stuck = 0; lastD = Infinity; continue; }
        T.player.yaw = Math.atan2(-dx, -dz);
        T.player.stamina = 1;
        if (d > lastD - 0.004) stuck += 1; else stuck = 0;
        lastD = Math.min(lastD, d);
        if (stuck > 45) { D.Key("Space"); spaces += 1; stuck = 0; lastD = Infinity; }
        T.StepFrames(1, 1 / 60, false);
        frames += 1;
        if (frames % 6 === 0) out.push([+p.x.toFixed(2), +p.z.toFixed(2)]);
      }
      D.Key("KeyW", false);
      return { reached: k >= wps.length, k, frames, spaces, end: [+T.player.position.x.toFixed(2), +T.player.position.z.toFixed(2)], track: out };
    }, waypoints);
    const outside = r.track.filter(([x, z]) => !Inside(x, z));
    Check(`走得到：${name}`, r.reached && outside.length === 0,
      `到第 ${r.k}/${waypoints.length} 个点、${r.frames} 帧、卡住按 Space ${r.spaces} 次，止于 (${r.end})${outside.length ? `；出了沟 ${outside.length} 点` : ""}`);
  }
  const traffic = L0105_TRENCHES.traffic;
  await Walk("乙位 → 交通沟 → 板桥底下 → 坡顶 → 坡道 → 集结处", [
    { x: P.fireB.x, z: P.fireB.z }, { x: 1.2, z: 2.5 }, ...traffic.slice(1, -1), { x: P.assemblyEntry.x, z: P.assemblyEntry.z }, { x: P.assembly.x, z: P.assembly.z },
  ]);
  await Walk("防炮洞口 → 支沟 → 台阶 → 交通沟", [
    { x: P.dugoutMouth.x - 0.6, z: P.dugoutMouth.z }, { x: 40, z: 65.9 }, { x: 26, z: 66.8 }, { x: 22.3, z: 67.1 }, { x: 18.6, z: 63.3 },
  ]);
  await Walk("坑底 → 沟口 → 前沿沟西段", [{ x: 0.4, z: -6.2 }, { x: 0.2, z: -1.2 }, { x: -5, z: 0 }, { x: -14, z: -3.3 }]);

  // 4. 手榴弹：前沿沟里朝北斜上扔，飞出沟外
  const nade = await page.evaluate(() => {
    const T = window.Taierzhuang, B = window.Tengxian.Debug.Blockout;
    B.PlacePlayer({ x: -20, z: 0.2, yawDeg: 0, pitchDeg: 18, stance: "stand" });
    T.StepFrames(12, 1 / 60, false);
    T.state.grenades = 3;
    const old = new Set(T.combat?.projectiles || []);
    T.Debug.Throw("Grenade", 0.9);
    const track = [];
    for (let i = 0; i < 150; i++) {
      T.StepFrames(1, 1 / 60, false);
      const g = (T.combat?.projectiles || []).find((p) => !old.has(p));
      if (g?.position) track.push([+g.position.x.toFixed(2), +g.position.z.toFixed(2), +g.position.y.toFixed(2)]);
    }
    return { n: track.length, first: track[0] || null, last: track[track.length - 1] || null, minZ: Math.min(...track.map((p) => p[1])) };
  });
  Check("手榴弹从前沿沟里往北扔，飞出沟外（隐形墙不挡手榴弹）",
    nade.n > 10 && nade.last && !Inside(nade.last[0], nade.last[1]) && nade.minZ < -6, J(nade));

  // 5. NPC 不受墙影响
  const previzDoc = JSON.parse(await fs.readFile(path.join(projectDir, "Blockout", "FirstLevel0105.previz.json"), "utf8"));
  let climb = null;
  for (const seq of previzDoc.sequences) {
    for (const a of seq.actors) {
      const k = a.keys.find((q) => q.clip === "PvClimbOutTrench");
      if (k && !climb) climb = { kf: seq.keyframe, id: a.id, t: k.t, dur: seq.durationS };
    }
  }
  Check("预演里有人翻出沟（PvClimbOutTrench）", !!climb, J(climb));
  if (climb) {
    const pos = await page.evaluate(async ({ kf, id, t, dur }) => {
      const B = window.Tengxian.Debug.Blockout;
      await B.GoTo(kf, { animate: false });
      B.Previz.Play(kf);
      const at = async (tt) => {
        await B.Previz.Seek(tt);
        await new Promise((r) => setTimeout(r, 200));
        const u = (Array.isArray(B.Units()) ? B.Units() : Object.values(B.Units())).find((q) => q.id === id);
        return u ? [+u.x.toFixed(2), +u.z.toFixed(2)] : null;
      };
      const before = await at(Math.max(0, t - 0.6)), later = [];
      for (let tt = t + 3; tt < dur - 0.05; tt += 1.5) later.push(await at(tt));
      B.Previz.Stop();
      return { before, later };
    }, climb);
    Check(`NPC 照常翻出沟：${climb.kf} 的 ${climb.id} 翻沟前在沟里、翻出去以后在沟外爬（隐形墙只挡玩家）`,
      pos.before && Inside(pos.before[0], pos.before[1]) && pos.later.some((q) => q && !Inside(q[0], q[1])),
      J({ before: pos.before, later: pos.later.slice(0, 8), outside: pos.later.filter((q) => q && !Inside(q[0], q[1])).slice(0, 3) }));
  }
  const stand = await page.evaluate((pts) => {
    const B = window.Tengxian.Debug.Blockout;
    return pts.map(([x, z, top]) => ({ x, z, top, stand: +B.StandAt(x, z).toFixed(2) }));
  }, walls.filter((_, i) => i % Math.ceil(walls.length / 40) === 0).map((b) => [b.x, b.z, +(b.y + b.h / 2).toFixed(2)]));
  Check("站人的地面在墙线上就是地面（不是墙顶）：预演 / 关键帧里的人不会站到隐形墙上", stand.every((s) => s.stand < s.top - 2.5), J(stand.slice(0, 3)));

  // 截图：坑沿射击台朝北、板桥一带俯看、坡顶段（隐形墙画成半透明红板）
  for (const [name, pose] of [
    ["KeepIn_PitStepNorth", { x: 0.8, z: -9.2, yawDeg: 0, pitchDeg: -4, stance: "stand" }],
    ["KeepIn_TrafficCrest", { x: 35, z: 126, yawDeg: 180, pitchDeg: -6, stance: "stand" }],
    ["KeepIn_FrontTrench", { x: -26, z: 3, yawDeg: 70, pitchDeg: -8, stance: "stand" }],
  ]) {
    await page.evaluate((p) => { window.Tengxian.Debug.Blockout.PlacePlayer(p); window.Taierzhuang.StepFrames(6); }, pose);
    await page.screenshot({ path: path.join(shotDir, `${name}.png`) });
  }
  Check("全程没有未捕获错误", errors.length === 0, errors.slice(0, 5).join(" | "));
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`EditorBlockoutFirstLevel0105KeepInBrowserTest: ${results.length - failed.length}/${results.length} passed`);
assert.equal(failed.length, 0, failed.map((r) => r.name).join("; "));
