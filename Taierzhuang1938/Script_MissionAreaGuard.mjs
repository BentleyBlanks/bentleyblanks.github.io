// 任务走廊与「离开战场区域 · 返回 · N 秒」的纯规则（S 包，口径 docs/Data_FirstLevelGuidance20260928.md §3.3）。
//
// 零 three、不碰玩家与任务事实：这里只回答两件事 ——
//   1. 这一点离这一步的走廊多远（DistanceToArea，有符号：正数在外、≤0 在里）；
//   2. 一只出界计时器（MissionAreaGuard.Update）：在外待满 graceS 亮警告、倒数 countdownS、走完报 failed。
// 判负怎么落地（杀人 → 既有的死亡菜单 → 检查点重试）、HUD 怎么画，都在调用方。
//
// 走廊 = 若干路线胶囊（路线折线 ± halfWidthM）∪ 若干圆 ∪ 若干多边形，数据在 Data_FirstLevelMissionArea.mjs，
// 用路线键 / 锚点名引用，这里解析成几何（ResolveMissionArea）。

/** 点到线段的平面距离（XZ）。 */
function SegmentDistance(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}

/** 点到折线的最近距离（单点折线就是到那一点的距离）。 */
export function PolylineDistance(point, points) {
  if (!points?.length) return Infinity;
  if (points.length === 1) return Math.hypot(point.x - points[0].x, point.z - points[0].z);
  let best = Infinity;
  for (let i = 0; i + 1 < points.length; i++) best = Math.min(best, SegmentDistance(point, points[i], points[i + 1]));
  return best;
}

/** 多边形（顶点按顺序，首尾自动闭合）的有符号距离：里面为负。偶奇规则判里外。 */
export function PolygonSignedDistance(point, points) {
  let edge = Infinity, inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    edge = Math.min(edge, SegmentDistance(point, a, b));
    if ((a.z > point.z) !== (b.z > point.z)
      && point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside ? -edge : edge;
}

const Plain = (p) => ({ x: p.x, z: p.z });

/**
 * 把 Data_FirstLevelMissionArea 的一行解析成几何。
 * `tables.routes` 是路线表（MISSION_ROUTES），`tables.anchors` 是锚点表（MISSION_ANCHORS）。
 * 路线键 / 锚点名写错直接抛 —— 少一段走廊不能静默发生（开机与 Script_MissionAreaGuardTest 都会当场红）。
 */
export function ResolveMissionArea(spec, { routes = {}, anchors = {} } = {}, id = spec?.id ?? "?") {
  if (!spec) return null;
  if (spec.exempt) return Object.freeze({ id, exempt: true, exemptUntil: null, capsules: [], discs: [], polygons: [] });
  const capsules = (spec.routes || []).map((entry) => {
    const route = routes[entry.key];
    if (!Array.isArray(route) || !route.length) throw new Error(`MissionArea ${id}: unknown route key ${entry.key}`);
    if (!(entry.halfWidthM > 0)) throw new Error(`MissionArea ${id}: route ${entry.key} needs halfWidthM > 0`);
    const points = route.slice(entry.from ?? 0, entry.to ?? route.length).map(Plain);
    if (!points.length) throw new Error(`MissionArea ${id}: route ${entry.key} slice is empty`);
    return Object.freeze({ key: entry.key, points: Object.freeze(points), halfWidthM: entry.halfWidthM });
  });
  const discs = (spec.discs || []).map((disc) => {
    const at = disc.anchor != null ? anchors[disc.anchor] : disc;
    if (!Number.isFinite(at?.x) || !Number.isFinite(at?.z)) throw new Error(`MissionArea ${id}: unknown disc anchor ${disc.anchor}`);
    if (!(disc.r > 0)) throw new Error(`MissionArea ${id}: disc needs r > 0`);
    return Object.freeze({ anchor: disc.anchor ?? null, x: at.x, z: at.z, r: disc.r });
  });
  const polygons = (spec.polygons || []).map((polygon) => {
    if (!(polygon.points?.length >= 3)) throw new Error(`MissionArea ${id}: polygon ${polygon.id} needs 3+ points`);
    return Object.freeze({ id: polygon.id, points: Object.freeze(polygon.points.map(Plain)) });
  });
  if (!capsules.length && !discs.length && !polygons.length) throw new Error(`MissionArea ${id}: empty corridor (mark it exempt instead)`);
  return Object.freeze({ id, exempt: false, exemptUntil: spec.exemptUntil ?? null,
    capsules: Object.freeze(capsules), discs: Object.freeze(discs), polygons: Object.freeze(polygons) });
}

/** 整张表一次解析（运行时构造时调一次，之后每帧只查表）。 */
export function ResolveMissionAreas(steps, tables) {
  return Object.freeze(Object.fromEntries(Object.entries(steps).map(([id, spec]) => [id, ResolveMissionArea(spec, tables, id)])));
}

/**
 * 点到走廊的有符号距离（米）：正数 = 在走廊外多远；≤ 0 = 在走廊里（绝对值是离边的一个下界）。
 * 豁免步或没有走廊时返回 -Infinity（永远算在里面）。
 */
export function DistanceToArea(point, area) {
  if (!area || area.exempt) return -Infinity;
  let best = Infinity;
  for (const capsule of area.capsules) best = Math.min(best, PolylineDistance(point, capsule.points) - capsule.halfWidthM);
  for (const disc of area.discs) best = Math.min(best, Math.hypot(point.x - disc.x, point.z - disc.z) - disc.r);
  for (const polygon of area.polygons) best = Math.min(best, PolygonSignedDistance(point, polygon.points));
  return best;
}

/**
 * 出界计时器。每帧喂一次 `Update(dt, {step, point, area, controlled})`，返回
 * `{ outside, warning, urgent, distanceM, secondsLeft, failed }`：
 *   outside     这一帧在走廊外（警告亮着时要回到边内 reenterM 才算回来，回滞）；
 *   warning     HUD 该不该亮：在外连续 graceS 之后亮；回到走廊里立刻灭；
 *   urgent      最后 urgentS 秒；
 *   secondsLeft 倒计时剩余（只在警告亮着时走）；
 *   failed      倒计时走完的那一帧为 true，只报一次，随后整只计时器归零重来。
 * 回到走廊里连续 resetS 秒倒计时才补满；没满就又出去，警告立刻重亮、接着剩下的秒数走。
 * `controlled`（过场、受控演出、抬担架、倒地）与豁免步不判，并把这一段清零。
 * 换步（step 变了）从头计，前 stepGraceS 秒不判。
 */
export class MissionAreaGuard {
  constructor(tuning) {
    this.tuning = tuning;
    /** 每次出界一条（诊断用，不进存档）：步、起点、最远、最少剩几秒、是否判负。 */
    this.log = [];
    this.episode = null;
    this.Reset();
  }
  Reset() {
    this.step = null;
    this.stepTime = 0;
    this.outsideS = 0;
    this.insideS = 0;
    this.warning = false;
    this.secondsLeft = this.tuning.countdownS;
    this.distanceM = -Infinity;
    this.episode = null;
  }
  /** 本段清零但不忘记在哪一步、这一步已经走了多久（受控段结束后不再补一次换步宽限）。 */
  Rest() {
    this.outsideS = 0; this.insideS = 0; this.warning = false;
    this.secondsLeft = this.tuning.countdownS; this.episode = null;
  }
  View(outside = false, failed = false) {
    const t = this.tuning;
    return { outside, warning: this.warning, urgent: this.warning && this.secondsLeft <= t.urgentS,
      distanceM: this.distanceM, secondsLeft: this.secondsLeft, failed };
  }
  Update(dt, { step = null, point = null, area = null, controlled = false } = {}) {
    const t = this.tuning, delta = Math.max(0, Number.isFinite(dt) ? dt : 0);
    if (step !== this.step) { this.Reset(); this.step = step; }
    this.stepTime += delta;
    if (controlled || !point || !area || area.exempt || this.stepTime < t.stepGraceS) {
      this.distanceM = -Infinity; this.Rest();
      return this.View();
    }
    this.distanceM = DistanceToArea(point, area);
    // 警告亮着时，回到边内 reenterM 才算回来（回滞）。上一段倒计时还没补满（armed）就又出去，不再给 graceS。
    const armed = this.secondsLeft < t.countdownS;
    const outside = this.distanceM > (this.warning ? -t.reenterM : 0);
    if (outside) {
      this.outsideS += delta; this.insideS = 0;
      if (!this.warning && (armed || this.outsideS >= t.graceS)) {
        this.warning = true;
        this.episode = { step, at: { x: +point.x.toFixed(2), z: +point.z.toFixed(2) }, maxDistanceM: 0,
          minSecondsLeft: this.secondsLeft, failed: false };
        this.log.push(this.episode);
        if (this.log.length > t.logMax) this.log.shift();
      }
      if (this.warning) {
        this.secondsLeft = Math.max(0, this.secondsLeft - delta);
        this.episode.maxDistanceM = Math.max(this.episode.maxDistanceM, +this.distanceM.toFixed(2));
        this.episode.minSecondsLeft = +this.secondsLeft.toFixed(2);
        if (this.secondsLeft <= 0) {
          this.episode.failed = true;
          this.Rest();
          return this.View(true, true);
        }
      }
      return this.View(true);
    }
    this.outsideS = 0; this.insideS += delta; this.warning = false; this.episode = null;
    if (this.secondsLeft < t.countdownS && this.insideS >= t.resetS) this.secondsLeft = t.countdownS;
    return this.View(false);
  }
  State() {
    return { step: this.step, warning: this.warning, distanceM: Number.isFinite(this.distanceM) ? +this.distanceM.toFixed(2) : null,
      secondsLeft: +this.secondsLeft.toFixed(2), log: this.log.map((entry) => ({ ...entry })) };
  }
}
