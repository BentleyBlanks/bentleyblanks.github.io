// 第一关敌军「木桩」探针（真浏览器，docs/Data_EnemyAi.md §20.6）。
//
//   node Taierzhuang1938/Script_FirstLevelEnemyIdleProbe.mjs                     01 → 06 整段（默认）
//   node …  --stage-from=3                                                       从 03 冷启动（missionStage=3，不是调试跳转）
//   node …  --stage-to=3                                                         只走到 03 结束
//   node …  --gate                                                               03–05 数字不达标就退出码 1（TestRunner 用）
//   node …  --root=<另一棵树>                                                     用另一棵树的游戏与驾驶脚本跑（量改前基线）
//
// 口径（为什么这样量，§19 的教训）：
//   · 走 CampaignKit 的正常驾驶（真实输入推进 01–06），**不用** FirstLevelJump —— 调试跳转
//     不清 01 已经生出来的掩蔽部突击组，§19.1 那 4 个「Flank*」干站的人其实是它们。
//   · 分母是玩家 110 m 内所有活着的日军，**包含**走剧本路线的（p012Guided）、剧本非战斗员
//     （01 背景兵）和原地待命的；只排除还在睡的后续关卡兵（missionDormant）。
//   · 采样挂在 ai.Update 后面，按游戏时间每 0.1 s 记一次（和驾驶脚本怎么推帧无关）。
//
// 按阶段 / 压力相位报：
//   zero30    30 s 窗口里一发没打（含环境射击）的人占比           目标 < 20%
//   idle4     连续 4 s 位移 < 0.3 m 且没开枪的人·帧占比            目标 ≤ 25%
//   mgShots   轻/重机枪手打出的发数                               目标 > 0
//   groupMove 相位切换后 15 s 内位移 ≥ 2 m 的组员占比（按组）
//   nestCover 03 阵位步枪守卫在掩体里或在移动的帧占比
//   hunters   以还没放行（missionUntargetable）的守军为目标的日军（人·帧）  必须 0
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv;
const Arg = (name, fallback) => argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? fallback;
const ownRoot = path.resolve(here, "..");
const treeRoot = path.resolve(Arg("root", ownRoot));
const gameDir = path.join(treeRoot, "Taierzhuang1938");
const Load = (file) => import(pathToFileURL(path.join(gameDir, file)).href);
const stageFrom = Number(Arg("stage-from", 1));
const stageTo = Number(Arg("stage-to", 6));
const gate = argv.includes("--gate");
const label = Arg("label", treeRoot === ownRoot ? "current" : path.basename(treeRoot));

/** 探针阈值（口径见文件头）。 */
const G = Object.freeze({
  zero30Max: 0.20, idle4Max: 0.25, mgShotsMin: 1, huntersMax: 0,
  gatedSteps: Object.freeze(["Support", "MachineGun", "Tank"]),
  rangeM: 110, sampleS: 0.1, idleWindowS: 4, idleMoveM: 0.3, zeroWindowS: 30, zeroPresence: 0.9,
  groupMoveS: 15, groupMoveM: 2,
});

/** 每人每帧的数（采样器 rows 的步长）与环境射击闸码的名字。 */
const ROW = 9;
const GATE_NAMES = Object.freeze(["-", "noPoints", "legalTarget", "noPick", "notOwn", "ammo", "timer", "hidePhase", "turnAimLof"]);

const Kit = await Load("Script_FirstLevelCampaignKit.mjs");
const { Drive: DriveFront } = await Load("Script_FirstLevelCampaignFront.mjs");
const { FIRST_LEVEL_STAGES } = await Load("Data_FirstLevelMissionStages.mjs");
const stepNumber = new Map(FIRST_LEVEL_STAGES.flatMap((s) => (s.steps || [s.id]).map((id) => [id, s.number])));

const options = Kit.ParseCampaignArgs(["node", "probe", "--campaign", `--stage-from=${stageFrom}`, `--stage-to=${stageTo}`]);
options.suite = "FirstLevelEnemyIdleProbe";
const ctx = await Kit.OpenCampaign(options);
const { page } = ctx;
let driveError = null;

// ---------------------------------------------------------------------------
// 页内采样器：挂在 ai.Update 后面，每 0.1 s 游戏时间记一帧（紧凑数组，ROW=9 个数一人，末位是环境射击闸码）。
// ---------------------------------------------------------------------------
await page.evaluate(({ rangeM, sampleS }) => {
  const g = window.Tengxian, ai = g.ai;
  const P = window.EnemyIdleProbe = { meta: [], index: new Map(), states: [], stateIndex: new Map(), ticks: [], acc: 0, error: null };
  const StateCode = (st) => {
    let c = P.stateIndex.get(st);
    if (c === undefined) { c = P.states.length; P.states.push(st); P.stateIndex.set(st, c); }
    return c;
  };
  // 环境射击这一帧卡在哪道闸（没有 AmbientBlocked 的旧树一律 0）。
  const Gate = (s) => {
    if (typeof ai.AmbientBlocked !== "function") return 0;
    if (!s.ambientFirePoints || !s.ambientFirePoints.length) return 1;
    if (!ai.AmbientBlocked(s)) return 2;
    if (!s.ambientFirePoint) return 3;
    if (!ai.AmbientOwnsAim(s)) return 4;
    if (s.ammo <= 0) return 5;
    if (s.fireTimer > 0) return 6;
    if (s.state === "cover_engage" && s.coverPhase !== "peek") return 7;
    return 8;
  };
  const Sample = () => {
    const rt = g.Debug.FirstLevelMissionRuntime?.();
    if (!rt || !rt.flow || !rt.flow.stage) return;
    const pp = g.player.position, now = ai.time;
    const guards = new Map((rt.guards || []).map((x) => [x.actor.id, x]));
    const rows = [], hunters = [];
    for (const s of ai.soldiers) {
      if (!s.alive || s.side !== "ija" || s.missionDormant) continue;
      if (Math.hypot(s.position.x - pp.x, s.position.z - pp.z) > rangeM) continue;
      let i = P.index.get(s.id);
      if (i === undefined) {
        i = P.meta.length; P.index.set(s.id, i);
        P.meta.push({ id: s.id, mid: s.missionId || null, enc: s.missionEncounter || null, grp: s.reactionGroup || null,
          wk: s.weapon?.kind || null, off: !!s.aiOfficer });
      } else if (s.reactionGroup && P.meta[i].grp !== s.reactionGroup) P.meta[i].grp = s.reactionGroup;
      const tg = s.target;
      let f = 0;
      if (s.cover) f |= 1; if (s.scriptedNoncombatant) f |= 2; if (s.missionFireHold) f |= 4; if (s.missionFrontStandby) f |= 8;
      if (s.p012Guided && Number.isFinite(s.scriptMoveSpeedMps)) f |= 16; if (s.holdZone) f |= 32;
      if (tg) f |= 64; if (tg && tg.isPlayer) f |= 128; if (s.targetVisible) f |= 256;
      if ((s.hesitateUntil ?? -99) > now) f |= 512; if ((s.chargeUntil ?? 0) > now) f |= 1024;
      if (s.actor?.root && s.actor.root.visible === false) f |= 2048; if (s.meleeCombat) f |= 4096;
      if (s.ambientFirePoints && s.ambientFirePoints.length) f |= 8192;
      rows.push(i, Math.round(s.position.x * 10), Math.round(s.position.z * 10), s.fireSequence | 0, s.ambientShots | 0, f,
        StateCode(s.state), s.stance | 0, Gate(s));
      if (tg && !tg.isPlayer) {
        const guard = guards.get(tg.id);
        // 「放行前」＝守军身上还挂着 missionUntargetable（FrontBattle.UpdateGuards 每帧写）。
        if (guard && guard.actor.alive && guard.actor.missionUntargetable) hunters.push(s.id);
      }
    }
    let guardsAlive = 0;
    for (const x of guards.values()) if (x.actor.alive) guardsAlive += 1;
    P.ticks.push({ t: +now.toFixed(2), step: rt.flow.stage.id, phase: rt.frontPressure?.phase?.id ?? null,
      px: +pp.x.toFixed(1), pz: +pp.z.toFixed(1), guards: guardsAlive, hunters, rows });
  };
  // 玩家挨打的账（谁、什么、掉多少）：更强的敌人不许把驾驶器打死（§19 的教训），红了先看这一份。
  P.hits = [];
  const player = g.player, take = player.TakeHit.bind(player);
  player.TakeHit = function (damage, part, direction, info = {}) {
    const before = player.health, out = take(damage, part, direction, info);
    try {
      let who = null, best = 2.5;
      const from = info && info.from;
      if (from) for (const s of ai.soldiers) {
        if (s.side !== "ija") continue;
        const d = Math.hypot(s.position.x - from.x, s.position.z - from.z);
        if (d < best) { best = d; who = s.missionId || String(s.id); }
      }
      const rt = g.Debug.FirstLevelMissionRuntime?.();
      P.hits.push({ t: +ai.time.toFixed(2), step: rt?.flow?.stage?.id ?? null, lost: +(before - player.health).toFixed(1),
        kind: info?.blast ? "blast" : info?.melee ? "melee" : info?.bullet ? "bullet" : "other", who,
        d: from ? +Math.hypot(from.x - player.position.x, from.z - player.position.z).toFixed(1) : null });
    } catch (error) { P.error = P.error || String(error); }
    return out;
  };
  const original = ai.Update;
  ai.Update = function (dt, camera) {
    const out = original.call(this, dt, camera);
    P.acc += dt;
    if (P.acc >= sampleS - 1e-9) {
      P.acc -= sampleS;
      try { Sample(); } catch (error) { P.error = P.error || String(error && error.stack || error); }
    }
    return out;
  };
}, { rangeM: G.rangeM, sampleS: G.sampleS });

const startedAt = Date.now();
try {
  await Kit.InstallInputDriver(ctx);
  await DriveFront(ctx);
} catch (error) {
  driveError = error;
  console.log("DRIVE_FAILED", String(error && error.message || error).slice(0, 600));
  await Kit.CaptureFailure(ctx).catch(() => {});
}
const wallS = (Date.now() - startedAt) / 1000;

// ---------------------------------------------------------------------------
// 拉回 Node 分析（分块，免得一次 evaluate 太大）。
// ---------------------------------------------------------------------------
const head = await page.evaluate(() => {
  const P = window.EnemyIdleProbe;
  return { meta: P.meta, states: P.states, count: P.ticks.length, error: P.error, hits: P.hits };
});
const ticks = [];
for (let at = 0; at < head.count; at += 1500)
  ticks.push(...await page.evaluate(([a, b]) => window.EnemyIdleProbe.ticks.slice(a, b), [at, at + 1500]));
const facts = await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission()?.facts || []).catch(() => []);
await Kit.CloseCampaign(ctx);

const report = AnalyzeEnemyIdle({ meta: head.meta, states: head.states, ticks });
report.playerHits = SummarizeHits(head.hits);
Object.assign(report, { label, root: treeRoot, stageFrom, stageTo, wallS: +wallS.toFixed(0), samplerError: head.error, facts,
  driveError: driveError ? String(driveError.message || driveError).slice(0, 600) : null });
PrintReport(report);
const out = path.join(here, "_shots", "FirstLevelEnemyIdleProbe");
await fs.mkdir(out, { recursive: true });
const file = path.join(out, `Data_EnemyIdleProbe_${label}_s${stageFrom}-${stageTo}.json`);
await fs.writeFile(file, JSON.stringify(report, null, 2));
console.log("wrote", file);

assert.equal(head.error, null, "采样器自己不许报错：" + head.error);
if (gate) {
  const c = report.gated;
  assert.ok(c.ticks > 0, "03–05 真的采到了样本");
  assert.ok(c.zero30 < G.zero30Max, `03–05 30 s 一发没打的人占比 ${Pct(c.zero30)} < ${Pct(G.zero30Max)}`);
  assert.ok(c.idle4 <= G.idle4Max, `03–05 4 s 不动也不开枪 ${Pct(c.idle4)} ≤ ${Pct(G.idle4Max)}`);
  assert.ok(c.mgShots >= G.mgShotsMin, `03–05 机枪真的开了火：${c.mgShots} 发`);
  assert.ok(c.hunterTicks <= G.huntersMax, `放行前没有日军以守军为目标：${c.hunterTicks} 人·帧 ${JSON.stringify(c.hunterIds)}`);
  console.log("ok enemy idle gates for 03–05");
}
if (driveError) throw driveError;

// ===========================================================================
// 分析（纯函数，对着落盘的 json 也能重算）
// ===========================================================================
function Pct(v) { return v == null ? "-" : `${(100 * v).toFixed(0)}%`; }

function AnalyzeEnemyIdle({ meta, states, ticks }) {
  const W4 = Math.round(G.idleWindowS / G.sampleS), W30 = Math.round(G.zeroWindowS / G.sampleS);
  const WG = Math.round(G.groupMoveS / G.sampleS);
  const segOf = ticks.map((t) => `${t.step}/${t.phase || "-"}`);
  // 每人的逐帧序列（按全局帧号对齐，不在场的帧是空位）。
  const series = new Map();
  ticks.forEach((t, k) => {
    for (let j = 0; j < t.rows.length; j += ROW) {
      const i = t.rows[j];
      if (!series.has(i)) series.set(i, new Array(ticks.length));
      series.get(i)[k] = { x: t.rows[j + 1] / 10, z: t.rows[j + 2] / 10, fs: t.rows[j + 3], amb: t.rows[j + 4],
        f: t.rows[j + 5], st: states[t.rows[j + 6]], sn: t.rows[j + 7], gate: t.rows[j + 8] ?? 0 };
    }
  });
  const segs = new Map();
  const Seg = (key) => {
    if (!segs.has(key)) segs.set(key, { key, step: key.split("/")[0], phase: key.split("/")[1], ticks: 0, seconds: 0,
      personTicks: 0, idle4: 0, still4: 0, zeroWin: 0, win: 0, shots: 0, ambient: 0, mgShots: 0,
      hunterTicks: 0, hunterIds: new Set(), guardsMin: Infinity, soldiers: new Set(), idleWhy: new Map(),
      nestTicks: 0, nestBusy: 0 });
    return segs.get(key);
  };
  ticks.forEach((t, k) => {
    const s = Seg(segOf[k]);
    s.ticks += 1; s.seconds += G.sampleS; s.hunterTicks += t.hunters.length;
    for (const id of t.hunters) s.hunterIds.add(id);
    s.guardsMin = Math.min(s.guardsMin, t.guards);
  });
  const IsMg = (m) => m.wk === "lmg" || m.wk === "hmg";
  const perSoldier = [];
  for (const [i, ser] of series) {
    const m = meta[i];
    const idle = new Array(ser.length).fill(false), still = new Array(ser.length).fill(false);
    for (let k = 0; k + W4 <= ser.length; k += 1) {
      const a = ser[k], b = ser[k + W4 - 1];
      if (!a || !b) continue;
      let maxMove = 0, gap = false;
      for (let j = k + 1; j < k + W4; j += 1) {
        if (!ser[j]) { gap = true; break; }
        maxMove = Math.max(maxMove, Math.hypot(ser[j].x - a.x, ser[j].z - a.z));
      }
      if (gap || maxMove >= G.idleMoveM) continue;
      for (let j = k; j < k + W4; j += 1) still[j] = true;
      if (b.fs === a.fs) for (let j = k; j < k + W4; j += 1) idle[j] = true;
    }
    let n = 0, idleN = 0, shots = 0, amb = 0, gatedN = 0, gatedIdle = 0;
    const gatedWhy = new Map();
    const nest = m.enc === "approach" && !IsMg(m);
    for (let k = 0; k < ser.length; k += 1) {
      const r = ser[k];
      if (!r) continue;
      const s = Seg(segOf[k]);
      s.personTicks += 1; s.soldiers.add(i); n += 1;
      if (idle[k]) {
        s.idle4 += 1; idleN += 1;
        const why = `${GATE_NAMES[r.gate] || r.gate} ${r.st} s${r.sn}${r.f & 1 ? " cover" : " open"}${r.f & 64 ? (r.f & 128 ? " tgtPlayer" : " tgtOther") : " noTgt"}${r.f & 256 ? " seen" : ""}${r.f & 4 ? " fireHold" : ""}${r.f & 8 ? " standby" : ""}${r.f & 2 ? " noncombat" : ""}${r.f & 16 ? " guided" : ""}${r.f & 32 ? " hold" : ""}${r.f & 8192 ? " ambPts" : ""}${r.f & 2048 ? " culled" : ""}`;
        s.idleWhy.set(why, (s.idleWhy.get(why) || 0) + 1);
      }
      if (still[k]) s.still4 += 1;
      if (G.gatedSteps.includes(ticks[k].step)) {
        gatedN += 1;
        if (idle[k]) {
          gatedIdle += 1;
          const key = `${GATE_NAMES[r.gate] || r.gate}/${r.st}`;
          gatedWhy.set(key, (gatedWhy.get(key) || 0) + 1);
        }
      }
      const prev = k > 0 ? ser[k - 1] : null;
      if (prev) {
        const d = r.fs - prev.fs, da = r.amb - prev.amb;
        if (d > 0) { s.shots += d; shots += d; if (IsMg(m)) s.mgShots += d; }
        if (da > 0) { s.ambient += da; amb += da; }
      }
      if (nest) {
        s.nestTicks += 1;
        const back = ser[k - 10];
        if ((r.f & 1) || (back && Math.hypot(r.x - back.x, r.z - back.z) > G.idleMoveM)) s.nestBusy += 1;
      }
    }
    perSoldier.push({ id: m.id, mid: m.mid, enc: m.enc, grp: m.grp, wk: m.wk, off: m.off, seconds: +(n * G.sampleS).toFixed(1),
      shots, ambient: amb, idle4: n ? +(idleN / n).toFixed(2) : 0,
      gatedS: +(gatedN * G.sampleS).toFixed(1), gatedIdleS: +(gatedIdle * G.sampleS).toFixed(1),
      gatedWhy: [...gatedWhy].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}:${(v * G.sampleS).toFixed(0)}s`),
      steps: [...new Set(ser.map((r, k) => r ? ticks[k].step : null).filter(Boolean))] });
  }
  // 30 s 窗口：全局按时间切，窗口归中点所在的阶段 / 相位；在场 ≥ 90% 的人才进分母。
  for (let k0 = 0; k0 + W30 <= ticks.length; k0 += W30) {
    const s = Seg(segOf[k0 + (W30 >> 1)]);
    for (const [, ser] of series) {
      let present = 0, a = null, b = null;
      for (let k = k0; k < k0 + W30; k += 1) if (ser[k]) { present += 1; a ??= ser[k]; b = ser[k]; }
      if (present < W30 * G.zeroPresence) continue;
      s.win += 1;
      if (b.fs === a.fs) s.zeroWin += 1;
    }
  }
  // 相位 / 阶段切换后 15 s 内的成组移动。
  const transitions = [];
  for (let k = 1; k < ticks.length; k += 1) {
    if (segOf[k] === segOf[k - 1]) continue;
    const groups = new Map();
    for (const [i, ser] of series) {
      const a = ser[k];
      if (!a) continue;
      let moved = 0;
      for (let j = k + 1; j < Math.min(ser.length, k + WG); j += 1)
        if (ser[j]) moved = Math.max(moved, Math.hypot(ser[j].x - a.x, ser[j].z - a.z));
      const key = meta[i].grp || meta[i].enc || "none";
      const g = groups.get(key) || { n: 0, moved: 0 };
      g.n += 1; if (moved >= G.groupMoveM) g.moved += 1;
      groups.set(key, g);
    }
    transitions.push({ at: ticks[k].t, from: segOf[k - 1], to: segOf[k],
      groups: Object.fromEntries([...groups].map(([key, g]) => [key, `${g.moved}/${g.n}`])) });
  }
  const phases = [...segs.values()].map((s) => ({
    key: s.key, stage: stepNumber.get(s.step) ?? null, seconds: +s.seconds.toFixed(1), soldiers: s.soldiers.size,
    zero30: s.win ? +(s.zeroWin / s.win).toFixed(3) : null, windows: s.win,
    idle4: s.personTicks ? +(s.idle4 / s.personTicks).toFixed(3) : null,
    still4: s.personTicks ? +(s.still4 / s.personTicks).toFixed(3) : null,
    shots: s.shots, ambient: s.ambient, mgShots: s.mgShots,
    nestCover: s.nestTicks ? +(s.nestBusy / s.nestTicks).toFixed(2) : null,
    hunterTicks: s.hunterTicks, hunterIds: [...s.hunterIds], guardsMin: Number.isFinite(s.guardsMin) ? s.guardsMin : null,
    idleWhy: [...s.idleWhy].sort((a, b) => b[1] - a[1]).slice(0, 6),
  }));
  const Sum = (list) => {
    const all = list.map((p) => segs.get(p.key));
    const pt = all.reduce((a, s) => a + s.personTicks, 0), win = all.reduce((a, s) => a + s.win, 0);
    const nt = all.reduce((a, s) => a + s.nestTicks, 0);
    return { ticks: all.reduce((a, s) => a + s.ticks, 0), seconds: +all.reduce((a, s) => a + s.seconds, 0).toFixed(1),
      zero30: win ? +(all.reduce((a, s) => a + s.zeroWin, 0) / win).toFixed(3) : null, windows: win,
      idle4: pt ? +(all.reduce((a, s) => a + s.idle4, 0) / pt).toFixed(3) : null,
      still4: pt ? +(all.reduce((a, s) => a + s.still4, 0) / pt).toFixed(3) : null,
      shots: all.reduce((a, s) => a + s.shots, 0), ambient: all.reduce((a, s) => a + s.ambient, 0),
      mgShots: all.reduce((a, s) => a + s.mgShots, 0),
      nestCover: nt ? +(all.reduce((a, s) => a + s.nestBusy, 0) / nt).toFixed(2) : null,
      hunterTicks: all.reduce((a, s) => a + s.hunterTicks, 0),
      hunterIds: [...new Set(all.flatMap((s) => [...s.hunterIds]))] };
  };
  const byStage = {};
  for (const n of [...new Set(phases.map((p) => p.stage))].sort((a, b) => a - b))
    byStage[n] = Sum(phases.filter((p) => p.stage === n));
  const gated = Sum(phases.filter((p) => G.gatedSteps.includes(p.key.split("/")[0])));
  perSoldier.sort((a, b) => b.idle4 - a.idle4);
  return { gates: G, samples: ticks.length, seconds: +(ticks.length * G.sampleS).toFixed(1), phases, byStage, gated,
    transitions, soldiers: perSoldier };
}

/** 玩家挨打按步骤归：各类伤害合计、打得最多的五个人。 */
function SummarizeHits(hits) {
  const bySteps = {};
  for (const h of hits) {
    const b = bySteps[h.step] ??= { lost: 0, bullet: 0, blast: 0, melee: 0, other: 0, hits: 0, who: {} };
    b.lost += h.lost; b[h.kind] += h.lost; b.hits += 1;
    if (h.who) b.who[h.who] = +((b.who[h.who] || 0) + h.lost).toFixed(1);
  }
  for (const b of Object.values(bySteps)) {
    for (const k of ["lost", "bullet", "blast", "melee", "other"]) b[k] = +b[k].toFixed(1);
    b.who = Object.fromEntries(Object.entries(b.who).sort((x, y) => y[1] - x[1]).slice(0, 5));
  }
  return { bySteps, hits };
}

function PrintReport(r) {
  console.log(`\n== enemy idle probe (${r.label}) stages ${r.stageFrom}-${r.stageTo}: ${r.samples} samples = ${r.seconds} s game time, wall ${r.wallS} s ==`);
  console.log("phase".padEnd(34), "sec".padStart(6), "men".padStart(4), "zero30".padStart(7), "idle4".padStart(6), "still4".padStart(7),
    "shots".padStart(6), "amb".padStart(5), "mg".padStart(5), "nest".padStart(5), "hunt".padStart(5), "guards".padStart(6));
  for (const p of r.phases)
    console.log(p.key.padEnd(34), String(p.seconds).padStart(6), String(p.soldiers).padStart(4), Pct(p.zero30).padStart(7),
      Pct(p.idle4).padStart(6), Pct(p.still4).padStart(7), String(p.shots).padStart(6), String(p.ambient).padStart(5),
      String(p.mgShots).padStart(5), Pct(p.nestCover).padStart(5), String(p.hunterTicks).padStart(5),
      String(p.guardsMin ?? "-").padStart(6));
  console.log("\n== by public stage ==");
  for (const [n, s] of Object.entries(r.byStage))
    console.log(`0${n}  ${s.seconds}s  zero30=${Pct(s.zero30)} (${s.windows} windows)  idle4=${Pct(s.idle4)}  still4=${Pct(s.still4)}  shots=${s.shots} (ambient ${s.ambient})  mg=${s.mgShots}  nestCover=${Pct(s.nestCover)}  hunters=${s.hunterTicks}`);
  const c = r.gated;
  console.log(`\n== gated 03–05: zero30=${Pct(c.zero30)} idle4=${Pct(c.idle4)} mg=${c.mgShots} hunters=${c.hunterTicks} nestCover=${Pct(c.nestCover)} ==`);
  console.log("\n== group movement within 15 s of a phase / step change (moved ≥ 2 m / present) ==");
  for (const t of r.transitions) console.log(`${String(t.at).padStart(7)}  ${t.from} -> ${t.to}  ${JSON.stringify(t.groups)}`);
  console.log("\n== top idle reasons per phase ==");
  for (const p of r.phases) if (p.idleWhy.length) console.log(p.key, JSON.stringify(p.idleWhy.slice(0, 4)));
  console.log("\n== most idle soldiers ==");
  for (const s of r.soldiers.slice(0, 12))
    console.log(`${s.mid || s.id} enc=${s.enc} grp=${s.grp} ${s.wk}${s.off ? " officer" : ""} ${s.seconds}s idle4=${Pct(s.idle4)} shots=${s.shots} amb=${s.ambient} steps=${s.steps.join(",")}`);
  console.log("\n== 03–05 idle seconds per soldier (top 15; reason = ambient gate / state) ==");
  for (const s of [...r.soldiers].sort((a, b) => b.gatedIdleS - a.gatedIdleS).slice(0, 15))
    if (s.gatedIdleS > 0) console.log(`${(s.mid || String(s.id)).padEnd(22)} ${String(s.grp).padEnd(12)} ${String(s.wk).padEnd(9)} idle ${String(s.gatedIdleS).padStart(6)}s / ${s.gatedS}s  ${s.gatedWhy.join("  ")}`);
  console.log("\n== player damage by step (hp lost; bullet / blast / melee; top shooters) ==");
  for (const [step, b] of Object.entries(r.playerHits.bySteps))
    console.log(`${step.padEnd(14)} lost=${b.lost} (${b.hits} hits)  bullet=${b.bullet} blast=${b.blast} melee=${b.melee} other=${b.other}  ${JSON.stringify(b.who)}`);
  if (r.driveError) console.log("\nDRIVE_ERROR", r.driveError);
}
