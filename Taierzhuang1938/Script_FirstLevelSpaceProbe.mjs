// 第一关 01–06 空间静态探针（纯 Node，零 three）。2026-09-23 空间重排的唯一验收量尺：
// 共享地面采样器 SampleMissionTerrain + MISSION_LAYOUT.blocks（+ 掩蔽部场景态体块）+ 铁丝网实心包络。
// 口径：docs/Data_FirstLevelSpace0106_20260923.md。断言在 Script_FirstLevelFrontTopologyTest；
// 这里只量、只报数，不判过关（阈值写在测试里，文档引用测试）。
//
//   node Taierzhuang1938/Script_FirstLevelSpaceProbe.mjs            # 人读摘要
//   node Taierzhuang1938/Script_FirstLevelSpaceProbe.mjs --json out  # 全量 JSON
//
// 视线：两点连线每 0.1 m 采样，地面高于线或落进实心体块即挡。人物/战车自身不遮挡，沙袋按盒子包络。
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { MISSION_LAYOUT as L, MISSION_ROUTES as R, MISSION_PLACEMENT as P } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_ENCOUNTERS as E } from "./Data_FirstLevelMission.mjs";
import { SampleMissionTerrain as G, SampleMissionNaturalHeight as N } from "./Data_FirstLevelMissionTerrain.mjs";
import { MISSION_STAGE_ANCHORS as A, MISSION_STAGE_ROUTES as SR, MISSION_BUNKER_TRENCH,
  MISSION_BUNKER_FRONT_SAP } from "./Data_FirstLevelMissionTopology.mjs";
import { MISSION_DEFENSE_OBJECTS } from "./Data_FirstLevelMissionFortifications.mjs";
import { FRONT_SORTIE as S, FRONT_SPACE as SP, FRONT_TANK_PATH as TP, FrontTankIndex } from "./Data_FirstLevelFrontRoute.mjs";
import { FRONT_GUARD_POSTS, FRONT_FLANK_GROUP, FRONT_OFFICER, FRONT_RESERVE_ENTRIES, FRONT_TANK_ESCORT_SLOTS,
  FRONT_FIRE_STEPS, FRONT_ASSAULT, FrontAssaultLane, APPROACH_TACTICS } from "./Data_FirstLevelMissionFront.mjs";
import { SPACE_KEYFRAMES, TANK_HEIGHTS as TH } from "./Data_FirstLevelSpaceKeyframes.mjs";

const TAN52 = Math.tan(52 * Math.PI / 180);
const CAPSULE_R = 0.35;
const walkable = new Set(L.walkableSurfaces.map((s) => s.id));
const scenario = Object.fromEntries(L.scenario.states.map((s) => [s.id, s.blocks.filter((b) => b.solid !== false)]));
const base = L.blocks.filter((b) => b.solid !== false && !walkable.has(b.id));
// Wire rolls block movement (native ~3.2 x 0.9 x 1.28 m). For sight they are mostly open, but their stakes and
// strands are ray colliders in the runtime (tag "fence"), so the lanes the runtime itself asserts on (seat and
// gun onto the gap) are measured with `wire: true` against the whole roll envelope (ProbeWireLanes).
const wire = MISSION_DEFENSE_OBJECTS.filter((o) => o.solid && /Wire/.test(o.asset))
  .map((o) => ({ id: o.id, x: o.x, z: o.z, w: 3.2, d: 0.9, h: 1.28, y: G(o.x, o.z) + 0.64, ry: o.ry || 0 }));
export const SpaceSolids = (state = "BunkerIntact") => [...base, ...(scenario[state] || [])];
const W = (id) => TP[FrontTankIndex(id)];
export const D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const Eye = (p, h) => ({ x: p.x, z: p.z, y: G(p.x, p.z) + h });
export const Bearing = (f, t) => Math.atan2(t.x - f.x, -(t.z - f.z)) * 180 / Math.PI; // 0 = north (-Z), clockwise
const Round = (v, n = 1) => +v.toFixed(n);
const Inside = (s, x, y, z, margin = 0) => {
  const c = Math.cos(s.ry || 0), q = Math.sin(s.ry || 0), dx = x - s.x, dz = z - s.z;
  return Math.abs(dx * c - dz * q) < s.w / 2 + margin && Math.abs(dx * q + dz * c) < s.d / 2 + margin
    && y > s.y - s.h / 2 && y < s.y + s.h / 2;
};
/** null when the segment is clear; otherwise "terrain@x,z" or the blocking block id. */
export function Sight(a, b, { state = "BunkerIntact", ignore = [], endM = 0.05, wire: withWire = false } = {}) {
  const len = D(a, b), solids = withWire ? [...SpaceSolids(state), ...wire] : SpaceSolids(state);
  const near = solids.filter((s) => {
    if (ignore.includes(s.id)) return false;
    const r = Math.hypot(s.w, s.d) / 2 + 0.1;
    const t = Math.max(0, Math.min(1, ((s.x - a.x) * (b.x - a.x) + (s.z - a.z) * (b.z - a.z)) / (len * len || 1)));
    return Math.hypot(a.x + (b.x - a.x) * t - s.x, a.z + (b.z - a.z) * t - s.z) < r;
  });
  for (let d = 0.1; d < len - endM; d += 0.1) {
    const t = d / len, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = a.y + (b.y - a.y) * t;
    if (G(x, z) > y) return `terrain@${x.toFixed(1)},${z.toFixed(1)}`;
    for (const s of near) if (Inside(s, x, y, z)) return s.id;
  }
  return null;
}
export const RouteLength = (r) => r.slice(1).reduce((s, p, i) => s + D(p, r[i]), 0);
export function RoutePoint(r, dist) {
  let acc = 0;
  for (let i = 1; i < r.length; i++) {
    const l = D(r[i - 1], r[i]);
    if (acc + l >= dist) { const t = (dist - acc) / (l || 1); return { x: r[i - 1].x + (r[i].x - r[i - 1].x) * t, z: r[i - 1].z + (r[i].z - r[i - 1].z) * t }; }
    acc += l;
  }
  return { ...r.at(-1) };
}
const Samples = (r, step = 1) => { const out = [], len = RouteLength(r); for (let d = 0; d <= len + 1e-6; d += step) out.push({ ...RoutePoint(r, d), d }); return out; };
/** Capsule clearance (r 0.35, 0.3-1.7 m above ground, wire included) and 52 deg climb along a route. */
export function RouteClearance(route, { state = "BunkerIntact", radius = CAPSULE_R, descendOnly = false } = {}) {
  const hits = new Map(), slopes = []; let prev = null;
  const solids = [...SpaceSolids(state), ...wire];
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i], len = D(a, b), steps = Math.max(1, Math.ceil(len / 0.2));
    for (let n = 0; n <= steps; n++) {
      const x = a.x + (b.x - a.x) * n / steps, z = a.z + (b.z - a.z) * n / steps, y = G(x, z);
      for (const s of solids) {
        if (hits.has(s.id)) continue;
        const c = Math.cos(s.ry || 0), q = Math.sin(s.ry || 0), dx = x - s.x, dz = z - s.z;
        if (Math.abs(dx * c - dz * q) < s.w / 2 + radius && Math.abs(dx * q + dz * c) < s.d / 2 + radius
          && s.y + s.h / 2 > y + 0.3 && s.y - s.h / 2 < y + 1.7) hits.set(s.id, `${x.toFixed(1)},${z.toFixed(1)}`);
      }
      if (prev) {
        const rise = descendOnly ? y - prev.y : Math.abs(y - prev.y);
        if (rise > TAN52 * Math.hypot(x - prev.x, z - prev.z) + 0.035) slopes.push([Round(x), Round(z), Round(y - prev.y, 2)]);
      }
      prev = { x, y, z };
    }
  }
  return { length: Round(RouteLength(route)), hits: [...hits].map(([k, v]) => `${k}@${v}`), slopes };
}
/** How many of `heights` above `target` are visible from `eye`. */
function Visible(eye, target, heights, opts) {
  const blockers = [];
  let vis = 0;
  for (const h of heights) { const r = Sight(eye, Eye(target, h), opts); if (r === null) vis++; else blockers.push(r); }
  return { vis, of: heights.length, blockers: [...new Set(blockers)] };
}

// ---------------------------------------------------------------- 1. keyframes
export function ProbeKeyframes() {
  return SPACE_KEYFRAMES.map((k) => {
    const eye = Eye(k.camera, k.camera.eyeM), look = Bearing(k.camera, k.look);
    const rows = k.targets.map((t) => {
      const v = Visible(eye, t.at, t.heights, { state: k.state, ignore: t.ignore || [] });
      let off = Bearing(k.camera, t.at) - look; while (off > 180) off -= 360; while (off < -180) off += 360;
      const pass = t.mustHide ? v.vis === 0 : v.vis >= (t.need ?? 1);
      return { name: t.name, dist: Round(D(k.camera, t.at)), offDeg: Math.round(off), ...v, need: t.need ?? 1, mustHide: !!t.mustHide, inFrame: t.frame !== false, pass };
    });
    const offs = rows.filter((r) => !r.mustHide && r.inFrame).map((r) => r.offDeg);
    const spanDeg = offs.length ? Math.max(...offs) - Math.min(...offs) : 0;
    const eyeY = eye.y, lookY = G(k.look.x, k.look.z) + (k.look.h ?? 1.2);
    return { id: k.id, label: k.label, state: k.state, camera: { x: k.camera.x, y: Round(eyeY, 2), z: k.camera.z, eyeM: k.camera.eyeM },
      yawRad: Round(-look * Math.PI / 180, 3), pitchRad: Round(Math.atan2(lookY - eyeY, D(k.camera, k.look)), 3),
      spanDeg, frameDeg: k.frameDeg ?? null, rows, pass: rows.every((r) => r.pass) && (!k.frameDeg || spanDeg <= k.frameDeg) };
  });
}

// ---------------------------------------------------------------- 2. tank
const HULL_L = 5.75, HULL_W = 2.18;
export function ProbeTank() {
  const path = TP.map((p) => ({ x: p.x, z: p.z })), len = RouteLength(path), seatEye = Eye(S.seat, 1.5);
  const cum = TP.map((_, i) => Round(RouteLength(path.slice(0, i + 1))));
  const waypoints = TP.map((w, i) => ({ id: w.id, kind: w.kind, x: w.x, z: w.z, s: cum[i], seatDist: Round(D(w, S.seat)),
    turretSeen: Sight(seatEye, Eye(w, TH.turretTop)) === null, hullSeen: Sight(seatEye, Eye(w, 1.0)) === null,
    faceTo: w.faceTo || null, turretTo: w.turretTo || null, holdS: w.holdS ?? null }));
  // Turret visibility transitions along the path, 1 m steps.
  const transitions = []; let prev = null;
  for (let d = 0; d <= len; d += 1) {
    const seen = Sight(seatEye, Eye(RoutePoint(path, d), TH.turretTop)) === null;
    if (prev !== null && seen !== prev) transitions.push({ s: d, seen });
    prev = seen;
  }
  // Hull footprint (5.75 x 2.18 m, 0.25-2.6 m above ground) against solids + wire, and hull pitch.
  const footprint = new Map(); let maxPitchDeg = 0;
  const solids = [...SpaceSolids("BunkerIntact"), ...wire];
  for (let d = 0; d <= len; d += 0.25) {
    const p = RoutePoint(path, d), q = RoutePoint(path, Math.min(len, d + 0.6));
    const yaw = Math.atan2(q.x - p.x, q.z - p.z) || 0, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = fz, rz = -fx, gy = G(p.x, p.z);
    const gf = G(p.x + fx * HULL_L / 2, p.z + fz * HULL_L / 2), gb = G(p.x - fx * HULL_L / 2, p.z - fz * HULL_L / 2);
    maxPitchDeg = Math.max(maxPitchDeg, Math.abs(Math.atan2(gf - gb, HULL_L)) * 180 / Math.PI);
    for (let u = -HULL_W / 2; u <= HULL_W / 2 + 1e-6; u += 0.25) for (let v = -HULL_L / 2; v <= HULL_L / 2 + 1e-6; v += 0.3) {
      const x = p.x + rx * u + fx * v, z = p.z + rz * u + fz * v;
      for (const s of solids) {
        if (footprint.has(s.id)) continue;
        const c = Math.cos(s.ry || 0), qq = Math.sin(s.ry || 0), dx = x - s.x, dz = z - s.z;
        if (Math.abs(dx * c - dz * qq) < s.w / 2 + 0.15 && Math.abs(dx * qq + dz * c) < s.d / 2 + 0.15
          && s.y + s.h / 2 > gy + 0.25 && s.y - s.h / 2 < gy + 2.6) footprint.set(s.id, Round(d));
      }
    }
  }
  // Field of fire on the gap: gun (2.05) -> gap ±1 m x 4 heights at Block/Squeeze; and along the path.
  const Gun = (p) => Eye(p, TH.gun);
  const gapGrid = (w) => { let n = 0, ok = 0; for (const dx of [-1, 0, 1]) for (const h of [0.3, 0.7, 1.1, 1.5]) { n++; if (Sight(Gun(w), Eye({ x: S.gap.x + dx, z: S.gap.z }, h)) === null) ok++; } return { ok, n }; };
  let gapFirstS = null; const lastRun = { seen: 0, n: 0 };
  for (let d = 0; d <= len + 1e-6; d += 0.5) {
    const ok = Sight(Gun(RoutePoint(path, d)), Eye(S.gap, 0.9)) === null;
    if (ok && gapFirstS === null) gapFirstS = d;
    if (d >= len - 21) { lastRun.n++; if (ok) lastRun.seen++; }
  }
  const block = W("Block"), squeeze = W("Squeeze"), pressure = W("Pressure");
  const seeFrom = (w, p, h) => Sight(Gun(w), Eye(p, h)) === null;
  const denies = {};
  for (const [id, w] of [["Block", block], ["Squeeze", squeeze]]) denies[id] = {
    rearJunctionStanding: seeFrom(w, S.rear, 1.7), safeZone: seeFrom(w, SP.safeZone, 1.2),
    lastCoverCrouched: seeFrom(w, S.lastCover, 0.9), throwCrouched: seeFrom(w, S.throw, 0.9), seat: seeFrom(w, S.seat, 1.25),
    damagedLipCrouched: seeFrom(w, S.damagedLip, 1.05), damagedLipStanding: seeFrom(w, S.damagedLip, 1.6),
  };
  // Hull MG (±26 deg about the nose, hull faces the gap at Block) vs the turret MG on the attack tail.
  const nose = Math.atan2(S.gap.x - block.x, S.gap.z - block.z);
  const Rel = (p) => { let a = Math.atan2(p.x - block.x, p.z - block.z) - nose; while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return Math.round(a * 180 / Math.PI); };
  const attackLen = RouteLength(S.attackRoute), tail = Samples(S.attackRoute, 0.5).filter((p) => p.d >= attackLen - 4.7);
  const tailTurret = { Block: 0, Squeeze: 0, n: tail.length }, tailHullMg = { inArc: 0, n: tail.length };
  for (const p of tail) {
    if (Sight(Eye(block, TH.turretMg), Eye(p, 1.0)) === null) tailTurret.Block++;
    if (Sight(Eye(squeeze, TH.turretMg), Eye(p, 1.0)) === null) tailTurret.Squeeze++;
    if (Math.abs(Rel(p)) <= 26 && Sight(Eye(block, TH.hullMg), Eye(p, 1.0)) === null) tailHullMg.inArc++;
  }
  // The roadblock physically cuts the south road: its solids sit across the road within 3 m of the centre line.
  const roadblock = ["RoadblockCart", "RoadblockPole"].map((id) => L.blocks.find((b) => b.id === id)).filter(Boolean)
    .map((b) => { let best = 1e9; const road = SP.southRoad; for (let i = 1; i < road.length; i++) { const a = road[i - 1], c = road[i], dx = c.x - a.x, dz = c.z - a.z; const t = Math.max(0, Math.min(1, ((b.x - a.x) * dx + (b.z - a.z) * dz) / (dx * dx + dz * dz))); best = Math.min(best, Math.hypot(b.x - a.x - dx * t, b.z - a.z - dz * t)); } return { id: b.id, roadDistM: Round(best) }; });
  const roadblockCraterDepth = Round(N(SP.roadblock.crater.x, SP.roadblock.crater.z) - G(SP.roadblock.crater.x, SP.roadblock.crater.z), 2);
  return {
    lengthM: Round(len), waypoints, turretTransitions: transitions, footprintHits: [...footprint].map(([k, v]) => `${k}@s${v}`),
    maxPitchDeg: Round(maxPitchDeg), gapGridBlock: gapGrid(block), gapGridSqueeze: gapGrid(squeeze), gapFirstS,
    gapLast21m: lastRun, blockNorthOfCrestM: Round(-160 - block.z), squeezeNorthOfCrestM: Round(-160 - squeeze.z),
    blockToGapM: Round(D(block, S.gap)), pressureSeesSeat: seeFrom(pressure, S.seat, 1.25), pressureSeatM: Round(D(pressure, S.seat)),
    denies, throwRelDeg: Rel(S.throw), attackRelDeg: S.attackRoute.map(Rel), tailTurret, tailHullMg,
    roadblock, roadblockCraterDepth,
  };
}

// ---------------------------------------------------------------- 3. routes
export function ProbeRoutes() {
  const rows = {
    "02 rearTrench (collapsed)": [SR.rearTrench, "BunkerCollapsed"],
    "02 rearTrench (intact)": [SR.rearTrench, "BunkerIntact"],
    "03 support": [R.support, "BunkerIntact"],
    "03 relief to the left gun": [[...P.reliefApproach, ...S.leftRoute.slice(3)], "BunkerIntact"],
    "04 rearRoute": [S.rearRoute, "BunkerIntact"],
    "05 bundle": [R.bundle, "BunkerIntact"],
    "05 bundle return": [R.bundleReturn, "BunkerIntact"],
    "05 attack": [S.attackRoute, "BunkerIntact"],
    "05->06 collectionReturn": [SR.collectionReturn, "BunkerIntact"],
    "05->06 orders": [R.orders, "BunkerIntact"],
    "left gun access": [S.leftRoute, "BunkerIntact"],
    "07 southWalk": [R.south, "BunkerIntact"],
    ...Object.fromEntries(P.guardWithdrawalRoutes.map((r, i) => [`guard withdrawal ${i}`, [r, "BunkerIntact"]])),
  };
  const enemy = {
    ...Object.fromEntries(E.front.filter((s) => !s.hold).map((s) => [`bound ${s.id}`, [s, ...FrontAssaultLane(s.x, s.z)]])),
    ...Object.fromEntries(E.machineGun.map((s) => [`push ${s.id}`, [s, ...FrontAssaultLane(s.x, s.z)]])),
    ...Object.fromEntries(FRONT_FLANK_GROUP.map((s) => [`flank ${s.id}`, [s, ...s.lane]])),
    [`officer ${FRONT_OFFICER.id}`]: [FRONT_OFFICER, ...FRONT_OFFICER.lane],
    ...Object.fromEntries(E.bunkerPursuit.filter((s) => s.route).map((s) => [`pursuit ${s.id}`, [s, ...s.route]])),
    ...Object.fromEntries(E.bunkerBackdrop.filter((s) => s.route).map((s) => [`backdrop ${s.id}`, [s, ...s.route]])),
    ...Object.fromEntries(E.bunkerAssault.filter((s) => s.enter).map((s) => [`vanguard ${s.id}`, s.enter])),
    ...Object.fromEntries(E.bundleApproach.map((s) => [`cut-in ${s.id}`, [s, ...APPROACH_TACTICS[s.id].points]])),
  };
  const out = {};
  for (const [name, [route, state]] of Object.entries(rows)) out[name] = RouteClearance(route, { state });
  for (const [name, route] of Object.entries(enemy)) out[name] = RouteClearance(route, { state: "BunkerCollapsed" });
  return out;
}

// ---------------------------------------------------------------- 4. exposure along player routes
function Exposure(route, threats, { crouch = 1.0, stand = 1.55, step = 1, state = "BunkerIntact" } = {}) {
  const pts = Samples(route, step); let run = 0, maxRun = 0, crouched = 0, standing = 0; const by = {};
  for (const p of pts) {
    const c = threats.filter((t) => Sight(t.eye, Eye(p, crouch), { state }) === null);
    if (threats.some((t) => Sight(t.eye, Eye(p, stand), { state }) === null)) standing++;
    if (c.length) { crouched++; run += step; for (const t of c) by[t.name] = (by[t.name] || 0) + 1; } else { maxRun = Math.max(maxRun, run); run = 0; }
  }
  maxRun = Math.max(maxRun, run);
  return { lengthM: Round(RouteLength(route)), samples: pts.length, crouchedExposed: crouched, longestCrouchedRunM: maxRun, standingExposed: standing, by };
}
const Threat = (name, p, h) => ({ name, eye: Eye(p, h) });
export function ProbeExposure() {
  const nest = E.approach.map((s) => Threat(s.id, s, s.role === "nestGun" ? 1.5 : 1.4));
  const flankLast = FRONT_FLANK_GROUP.map((s) => Threat(`${s.id}@last`, s.lane.at(-1), 1.0));
  const fireBase = E.front.filter((s) => s.role === "fireBase").map((s) => Threat(s.id, s, 1.4));
  const bound3 = E.front.filter((s) => s.role === "bound").map((s) => { const l = FrontAssaultLane(s.x, s.z); return Threat(`${s.id}@3rd`, l.at(-2) || s, 1.0); });
  const block = W("Block"), escorts = FRONT_TANK_ESCORT_SLOTS.map((s) => Threat(s.id, s, 1.4));
  const tank = [Threat("tankGun@Block", block, TH.gun), Threat("hullMg@Block", block, TH.hullMg), Threat("turretMg@Block", block, TH.turretMg)];
  const pursuers = [Threat("F", SP.bunkerFold, 1.5), Threat("J", SP.bunkerJunction, 1.5), Threat("killSpot", SP.bunkerKilling, 1.5)];
  const attackLen = RouteLength(S.attackRoute);
  const tail = Samples(S.attackRoute, 0.5).filter((p) => p.d >= attackLen - 4);
  let tailExposed = 0; for (const p of tail) if ([...tank, ...escorts].some((t) => Sight(t.eye, Eye(p, 1.0)) === null)) tailExposed++;
  // 02: the down-trench profile from a man standing at the fold F, 0.5 m steps (C's traverse finding).
  const retreatProfile = Samples(SR.rearTrench, 0.5).map((p) => {
    const c = Sight(Eye(SP.bunkerFold, 1.5), Eye(p, 1.0), { state: "BunkerCollapsed" }) === null;
    const s = Sight(Eye(SP.bunkerFold, 1.5), Eye(p, 1.6), { state: "BunkerCollapsed" }) === null;
    return { d: p.d, c, s };
  });
  const sswLeg = retreatProfile.filter((r) => { const p = RoutePoint(SR.rearTrench, r.d); return D(p, { x: -1, z: -118.5 }) > 1.2 && p.z > -118.5 && p.z < -113.8; });
  return {
    retreat02: Exposure(SR.rearTrench, pursuers, { state: "BunkerCollapsed", step: 0.5 }),
    retreat02FromFold: { profile: retreatProfile.map((r) => (r.c ? "C" : r.s ? "S" : "-")).join(""),
      sswLegStandingExposed: sswLeg.filter((r) => r.s).length, sswLegSamples: sswLeg.length },
    support03: Exposure(S.approach.slice(0, 8), [...nest, ...flankLast, ...fireBase, ...bound3]),
    rightTrench03: Exposure(S.approach.slice(7, 14), [...nest, ...flankLast, ...fireBase, ...bound3]),
    rightTrenchVsNest: Exposure(S.approach.slice(7, 13), nest),
    fireSteps: FRONT_FIRE_STEPS.map((p) => ({ x: p.x, z: p.z,
      standingSees: [...E.approach.map((s) => ({ id: s.id, at: s, h: s.role === "nestGun" ? 1.5 : 1.3 })),
        ...FRONT_FLANK_GROUP.map((s) => ({ id: s.id + "@last", at: s.lane.at(-1), h: 1.0 }))]
        .filter((t) => Sight(Eye(p, 1.6), Eye(t.at, t.h)) === null).map((t) => t.id),
      crouchedSeen: E.approach.filter((s) => Sight(Eye(s, 1.4), Eye(p, 1.0)) === null).map((s) => s.id) })),
    rearRoute04: Exposure(S.rearRoute, [Threat("tankGun@Pressure", W("Pressure"), TH.gun), Threat("tankGun@Block", block, TH.gun), ...escorts]),
    bundle05: Exposure(R.bundle, [...tank, ...escorts, ...fireBase, Threat("cutInMouth", SP.roadLink[0], 1.5)]),
    attack05: Exposure(S.attackRoute, [...tank, ...escorts, ...fireBase]),
    attackTail4m: { exposed: tailExposed, samples: tail.length },
  };
}

// ---------------------------------------------------------------- 5. enemy starts: cover toward the threat
function CoverAt(s, face) {
  const g = G(s.x, s.z), dug = N(s.x, s.z) - g;
  if (dug >= 1.1) return { kind: "dug-in", detail: Round(dug, 2) };
  let best = null;
  for (const b of SpaceSolids("BunkerIntact")) {
    const d = Math.hypot(b.x - s.x, b.z - s.z) - Math.max(b.w, b.d) / 2;
    if (d > 2.5) continue;
    const top = b.y + b.h / 2 - g; if (top < 0.9) continue;
    const v = { x: b.x - s.x, z: b.z - s.z }, l = Math.hypot(v.x, v.z) || 1, fl = Math.hypot(face.x, face.z) || 1;
    if ((v.x * face.x + v.z * face.z) / (l * fl) < 0.2 && d > 0.4) continue;
    if (!best || d < best.d) best = { kind: "block", detail: b.id, d: Round(Math.max(0, d)), top: Round(top) };
  }
  if (best) return best;
  if (dug >= 0.5) return { kind: "crater", detail: Round(dug, 2) };
  return null;
}
export function ProbeEnemyCover() {
  const rows = [];
  const Add = (group, s, at = s) => {
    const face = s.faceTo ? { x: s.faceTo.x - at.x, z: s.faceTo.z - at.z } : { x: 0, z: 1 };
    rows.push({ group, id: s.id, role: s.role || null, x: Round(at.x), z: Round(at.z), cover: CoverAt(at, face) });
  };
  for (const g of ["bunkerAssault", "bunkerPursuit", "approach", "front", "frontFlank", "frontOfficer", "bundleApproach", "machineGun", "frontReserve", "tank"])
    for (const s of E[g]) Add(g, s);
  for (const s of E.bunkerBackdrop.filter((m) => m.side === "ija")) Add("bunkerBackdrop", s);
  for (const s of FRONT_FLANK_GROUP) Add("frontFlank@last", s, s.lane.at(-1));
  for (const s of E.front.filter((m) => m.role === "bound")) { const l = FrontAssaultLane(s.x, s.z); if (l.length) Add("bound@last", s, l.at(-1)); }
  for (const s of FRONT_TANK_ESCORT_SLOTS) Add("escortSlot", s);
  // The flank group's last line must see the gap (crouched 1.0).
  const flankGap = FRONT_FLANK_GROUP.map((s) => ({ id: s.id, dist: Round(D(s.lane.at(-1), S.gap)),
    seesGap: Sight(Eye(s.lane.at(-1), 1.0), Eye(S.gap, 1.0)) === null, seatDist: Round(D(s.lane.at(-1), S.seat)) }));
  // Nest guards: their cover lies between them and the west door / their faceTo (south-west).
  const nestFaces = E.approach.map((s) => ({ id: s.id, role: s.role, faceBearing: s.faceTo ? Math.round(Bearing(s, s.faceTo)) : null,
    onApproach: S.approach.slice(7, 13).some((p, i, r) => i > 0 && SegDist(s, r[i - 1], p) < 3.5) }));
  return { rows, uncovered: rows.filter((r) => !r.cover).map((r) => `${r.group}/${r.id}`), flankGap, nestFaces };
}
function SegDist(p, a, b) { const dx = b.x - a.x, dz = b.z - a.z; const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t); }

// ---------------------------------------------------------------- 6. counts and budget (contract §6)
export function ProbeCounts() {
  const n = (k) => (E[k] || []).filter((s) => s.side !== "nra").length;
  const reserveBy = (stage) => FRONT_RESERVE_ENTRIES.reduce((a, e) => a + (e.stages[stage] || 0), 0);
  const stage = {
    "01": n("bunkerAssault") + n("bunkerBackdrop") + 1, // + the translator (Opening cast)
    "02": n("bunkerPursuit"),
    "03": n("approach") + n("front") + n("frontFlank") + n("frontOfficer"),
    "04": n("tank") + n("machineGun") + reserveBy("MachineGun"),
    "05": n("bundleApproach") + reserveBy("Tank"),
  };
  const cumulative = Object.values(stage).reduce((a, b) => a + b, 0);
  // Worst case alive in 04/05: nobody but the nest team died in 03.
  const alive04 = stage["03"] - n("approach") + stage["04"];
  const alive05 = alive04 + stage["05"];
  return { stage, cumulative, alive04, alive05, nraBackdrop: E.bunkerBackdrop.filter((s) => s.side === "nra").length };
}

// ---------------------------------------------------------------- 7. hidden entries
export function ProbeEntries() {
  const viewers = { seat: [S.seat, 1.5], observation: [SP.observation, 1.6], zhou: [S.leftSeat, 1.1], lastCover: [S.lastCover, 1.5],
    guardPost0: [FRONT_GUARD_POSTS[0], 1.0], rearJunction: [S.rear, 1.6], gapJunction: [SP.gapJunction, 1.6] };
  const entries = [
    ...FRONT_RESERVE_ENTRIES.flatMap((e) => e.slots.map((p, i) => ({ id: `${e.id}#${i}`, ...p }))),
    ...E.machineGun.map((s) => ({ id: s.id, x: s.x, z: s.z })),
    ...FRONT_ASSAULT.waveCentersX.slice(0, 2).map((cx, i) => ({ id: `waveCentre${i}`, x: cx, z: FRONT_ASSAULT.spawnZ })),
    ...E.tank.map((s) => ({ id: s.id, x: s.x, z: s.z })),
    { id: "tankStart", ...W("Start") },
  ];
  return entries.map((e) => ({ id: e.id, x: e.x, z: e.z, rows: Object.entries(viewers).map(([k, [p, h]]) => ({
    from: k, dist: Math.round(D(p, e)), visible: Sight(Eye(p, h), Eye(e, 1.6)) === null })) }));
}

// ---------------------------------------------------------------- 8. separation, 01 corridor, backslope flood fill
export function ProbeSeparation() {
  const minBetween = (a, b) => { let m = 1e9; for (const p of Samples(a, 0.5)) for (const q of Samples(b, 0.5)) m = Math.min(m, D(p, q)); return Round(m); };
  // 01 break-in corridor: the upper link from the road (later the 05 attack branch) -> rear junction ->
  // link sap -> J -> the east-west leg to the bend, vs the friendlies still firing (contract §4: >= 30 m or unseen).
  const corridor = [...S.attackRoute].reverse().concat([...MISSION_BUNKER_FRONT_SAP].reverse().slice(1), MISSION_BUNKER_TRENCH.slice(-2).reverse().slice(1));
  const friends = [...FRONT_GUARD_POSTS.map((g, i) => ({ n: `guard${i}`, p: g, h: 1.0 })), { n: "zhou", p: S.leftSeat, h: 1.1 }];
  let minD = 1e9, minPair = null; const mutual = [];
  for (const q of Samples(corridor, 1)) for (const f of friends) {
    const d = D(q, f.p); if (d < minD) { minD = d; minPair = `${f.n}@${Round(q.x)},${Round(q.z)}`; }
    if (d < 30 && Sight(Eye(q, 1.5), Eye(f.p, f.h), { state: "BunkerCollapsed" }) === null) mutual.push(`${f.n}~${Round(q.x)},${Round(q.z)}`);
  }
  // Flood fill over dug floors (>= 0.45 m below natural) on a 0.5 m grid, the gap (±4 m) removed and
  // cells under a solid block standing 1.2 m+ above the floor treated as walls (traverses, wall ends).
  const ext = { minX: -45, maxX: 65, minZ: -168, maxZ: -95 }, st = 0.5;
  const w = Math.round((ext.maxX - ext.minX) / st), h = Math.round((ext.maxZ - ext.minZ) / st);
  const walls = SpaceSolids("BunkerIntact").filter((s) => s.x > ext.minX - 5 && s.x < ext.maxX + 5 && s.z > ext.minZ - 5 && s.z < ext.maxZ + 5);
  const floor = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = ext.minX + (i + 0.5) * st, z = ext.minZ + (j + 0.5) * st;
    const g = G(x, z);
    floor[j * w + i] = N(x, z) - g >= 0.45 && D({ x, z }, S.gap) > 4
      && !walls.some((s) => s.y + s.h / 2 > g + 1.2 && Inside(s, x, s.y, z)) ? 1 : 0;
  }
  const Idx = (p) => Math.floor((p.z - ext.minZ) / st) * w + Math.floor((p.x - ext.minX) / st);
  const seen = new Uint8Array(w * h), start = Idx(FRONT_GUARD_POSTS[0]), queue = [start]; seen[start] = 1;
  while (queue.length) {
    const k = queue.pop(), i = k % w, j = (k / w) | 0;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
      const kk = jj * w + ii; if (!seen[kk] && floor[kk]) { seen[kk] = 1; queue.push(kk); }
    }
  }
  const reach = (p) => !!seen[Idx(p)];
  return {
    ammoVsRightTrenchM: minBetween(R.bundle, S.approach.slice(8)),
    ammoVsBackslopeM: minBetween(R.bundle, S.guardRoute),
    supportVsBunkerTrenchM: minBetween(S.approach.slice(0, 5), MISSION_BUNKER_TRENCH.slice(2)),
    corridor01: { lengthM: Round(RouteLength(corridor)), minFriendlyM: Round(minD), minPair, mutualWithin30: mutual },
    backslopeFlood: { reachesAmmoSap: reach(S.damagedLip), reachesRearJunction: reach(S.rear), reachesOldYard: reach({ x: 41.2, z: -118.6 }),
      reachesSupportSap: reach(SP.fold), reachesGapJunctionWithoutGap: reach(SP.gapJunction), scrapeCells: seen.reduce((a, b) => a + b, 0) },
  };
}

// ---------------------------------------------------------------- 9. engagement distances (player position -> enemies he fights)
export function ProbeEngagement() {
  const lanes = E.front.filter((s) => s.role === "bound").map((s) => FrontAssaultLane(s.x, s.z));
  const pairs = {
    "02 return spot -> pursuers": [A.bunkerRear, [SP.bunkerJunction, SP.bunkerFold, { x: 6.8, z: -124.2 }, { x: 9.6, z: -125.1 }]],
    "03 gap junction -> nest team": [SP.gapJunction, E.approach],
    "03 right trench fire step 1 -> nest team": [FRONT_FIRE_STEPS[1], E.approach],
    "03 seat -> flank last line": [S.seat, FRONT_FLANK_GROUP.map((s) => s.lane.at(-1))],
    "03 seat -> bounding 2nd/3rd lines": [S.seat, lanes.flatMap((l) => l.slice(-3, -1))],
    "03 seat -> fire base": [S.seat, E.front.filter((s) => s.role === "fireBase")],
    "03 Zhou -> bounding 3rd/last": [S.leftSeat, lanes.flatMap((l) => l.slice(-2))],
    "04 seat -> tank Pressure..Block": [S.seat, [W("Pressure"), W("Approach"), W("Block")]],
    "04 seat -> escort slots": [S.seat, FRONT_TANK_ESCORT_SLOTS],
    "05 damaged lip -> cut-in route": [S.damagedLip, SP.roadLink.slice(0, 3)],
    "05 throw -> tank Block/Squeeze": [S.throw, [W("Block"), W("Squeeze")]],
    "05 throw -> escort slots": [S.throw, FRONT_TANK_ESCORT_SLOTS],
  };
  const out = {}; const all = [];
  for (const [k, [from, list]] of Object.entries(pairs)) { const ds = list.map((p) => Round(D(from, p))).sort((a, b) => a - b); out[k] = ds; all.push(...ds); }
  const bands = [[0, 15], [15, 30], [30, 45], [45, 60], [60, 1e9]].map(([a, b]) => all.filter((d) => d >= a && d < b).length);
  return { pairs: out, bands, n: all.length, in15to60: all.filter((d) => d >= 15 && d < 60).length };
}

// ---------------------------------------------------------------- 10. lanes the runtime raycasts (wire included)
/** Rays the 03-05 campaign driver and the gun logic cast through the rendered world (BlocksSight hits wire
 *  stakes and strands), so the whole wire roll counts as a blocker here. */
export function ProbeWireLanes() {
  const k = (id) => SPACE_KEYFRAMES.find((f) => f.id === id).camera;
  const lanes = [
    ["03/04 seat eye 1.65 -> gap 1.2 (campaign driver)", Eye(S.seat, 1.65), Eye(S.gap, 1.2)],
    ["03/04 nest gun 1.45 -> gap 1.2 (campaign driver)", Eye(S.nest, 1.45), Eye(S.gap, 1.2)],
    ["K4 seat eye 1.5 -> gap 1.2", Eye(S.seat, 1.5), Eye(S.gap, 1.2)],
    ["K10 west door 1.6 -> gap 1.2", Eye(k("K10"), 1.6), Eye(S.gap, 1.2)],
    ["K3 observation 1.6 -> gap 1.2", Eye(k("K3"), 1.6), Eye(S.gap, 1.2)],
    // FrontBattle.TankBlockade: the tank muzzle at Block/Squeeze must see the gap for tankBlocksExit.
    ["04 tank muzzle at Block -> gap 1.2 (tankBlocksExit)", Eye(TP[FrontTankIndex("Block")], TH.gun), Eye(S.gap, 1.2)],
    ["05 tank muzzle at Squeeze -> gap 1.2", Eye(TP[FrontTankIndex("Squeeze")], TH.gun), Eye(S.gap, 1.2)],
  ];
  return lanes.map(([name, a, b]) => ({ name, blocker: Sight(a, b, { wire: true }) }));
}

// ---------------------------------------------------------------- all
export function RunSpaceProbe() {
  return { keyframes: ProbeKeyframes(), tank: ProbeTank(), routes: ProbeRoutes(), exposure: ProbeExposure(),
    cover: ProbeEnemyCover(), counts: ProbeCounts(), entries: ProbeEntries(), separation: ProbeSeparation(), engagement: ProbeEngagement(), wireLanes: ProbeWireLanes() };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const report = RunSpaceProbe();
  const at = process.argv.indexOf("--json");
  if (at > 0) fs.writeFileSync(process.argv[at + 1], JSON.stringify(report, null, 1));
  for (const k of report.keyframes) {
    console.log(`[${k.id}] ${k.label} ${k.pass ? "PASS" : "FAIL"}  eye (${k.camera.x},${k.camera.y},${k.camera.z}) yaw ${k.yawRad} pitch ${k.pitchRad} span ${k.spanDeg} deg`);
    for (const r of k.rows) console.log(`   ${r.mustHide ? "hide" : "see "} ${r.name.padEnd(46)} ${String(r.dist).padStart(6)} m ${String(r.offDeg).padStart(4)} deg  ${r.vis}/${r.of}${r.blockers.length ? "  (" + r.blockers.slice(0, 2).join("|") + ")" : ""}`);
  }
  const { keyframes, ...rest } = report;
  console.log(JSON.stringify(rest, (key, value) => (key === "rows" && Array.isArray(value) && value.length > 20 ? `${value.length} rows` : value), 1));
}
