// 《烽火棋局》白盒 · 回合制敌后策略(文明6式语言×不对称战争)。纯逻辑,无 DOM。
// 验证核心循环:「点线面之争」——日军占点线(城/铁路/据点),你在面上生长(敌占→游击区→根据地),
// 警备等级驱动扫荡战役周期,伏击/缴获经济/建政权。回合=旬。
// 胜利: 根据地格≥15 或 拔掉全部据点 | 失败: 总部失守 或 根据地清零 | 40 回合超时结算。

// ── hex(axial 尖顶) ──
export const MAP_W = 20, MAP_H = 14;
export type Terrain = "mountain" | "hill" | "plain" | "city";
export type TState = "enemy" | "guer" | "base"; // 敌占/游击区/根据地
export interface Tile {
  q: number; r: number;
  terrain: Terrain;
  state: TState;
  rail: boolean;
  river: boolean;
  block: boolean; // 日军据点(炮楼)
  hq: boolean; // 我方总部
  blockHp: number;
}
export type UKind = "guerrilla" | "cadre" | "militia" | "regular" | "garrison" | "raider";
export interface Unit {
  id: number; kind: UKind; jp: boolean;
  q: number; r: number;
  hp: number; maxHp: number;
  moved: boolean; acted: boolean;
  hidden: boolean; // 隐蔽(游击队默认;被打/攻击后暴露一回合)
  retreating?: boolean;
}
export interface UnitDef { name: string; move: number; atk: number; def: number; hp: number; costG: number; costR: number; costA: number; desc: string; }
export const UDEFS: Record<UKind, UnitDef> = {
  guerrilla: { name: "游击队", move: 3, atk: 2, def: 1, hp: 3, costG: 2, costR: 2, costA: 0, desc: "轻快隐蔽·可渗透敌占格·伏击先手" },
  cadre: { name: "干部", move: 2, atk: 0, def: 0, hp: 2, costG: 2, costR: 1, costA: 0, desc: "游击区建政权→根据地" },
  militia: { name: "民兵", move: 1, atk: 1, def: 2, hp: 3, costG: 1, costR: 1, costA: 0, desc: "守土·驻防地形加成高" },
  regular: { name: "主力连", move: 2, atk: 3, def: 2, hp: 4, costG: 3, costR: 3, costA: 2, desc: "攻坚拔据点·需军械(缴获)" },
  garrison: { name: "守备队", move: 1, atk: 2, def: 3, hp: 4, costG: 0, costR: 0, costA: 0, desc: "" },
  raider: { name: "讨伐队", move: 2, atk: 3, def: 2, hp: 4, costG: 0, costR: 0, costA: 0, desc: "" }
};

export interface GState {
  tiles: Tile[];
  units: Unit[];
  turn: number;
  grain: number; recruits: number; arms: number;
  alert: number; // 警备等级: 你的进攻行为推高,≥10 触发扫荡
  sweepActive: boolean; sweepTurnsLeft: number;
  nextId: number;
  log: { t: string; k: "info" | "win" | "loss" }[];
  over: null | { win: boolean; reason: string };
  selected: number | null; // 选中单位 id(表现层用,core 存着方便)
}

const key = (q: number, r: number): number => r * MAP_W + q;
export const tileAt = (s: GState, q: number, r: number): Tile | null =>
  q >= 0 && q < MAP_W && r >= 0 && r < MAP_H ? s.tiles[key(q, r)] : null;
export const unitAt = (s: GState, q: number, r: number): Unit | undefined =>
  s.units.find((u) => u.q === q && u.r === r && u.hp > 0);
// axial 邻居(尖顶)
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
export function neighbors(s: GState, q: number, r: number): Tile[] {
  const out: Tile[] = [];
  for (const [dq, dr] of DIRS) { const t = tileAt(s, q + dq, r + dr); if (t) out.push(t); }
  return out;
}
export function hexDist(aq: number, ar: number, bq: number, br: number): number {
  return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs(aq + ar - bq - br)) / 2;
}
const moveCost = (t: Tile): number => (t.terrain === "mountain" ? 2 : 1);

// ── 地图生成(手工规则:西山东原,一条河,一条铁路+2城3据点) ──
function h2(x: number, y: number): number { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); }
export function createGame(): GState {
  const tiles: Tile[] = [];
  for (let r = 0; r < MAP_H; r++) {
    for (let q = 0; q < MAP_W; q++) {
      const west = 1 - q / MAP_W;
      const n = h2(q * 1.7, r * 2.3);
      let terrain: Terrain = "plain";
      if (west > 0.62 || (west > 0.45 && n > 0.5)) terrain = "mountain";
      else if (west > 0.38 || n > 0.72) terrain = "hill";
      const river = q === 11 && r >= 2 && r <= 11;
      tiles.push({ q, r, terrain, state: "enemy", rail: false, river, block: false, hq: false, blockHp: 0 });
    }
  }
  // 铁路: 东北(17,1)→西南(8,12) 折线 + 城市/据点沿线
  const railPath: [number, number][] = [[17, 1], [16, 3], [15, 5], [14, 7], [13, 9], [12, 10], [11, 11], [10, 12]];
  for (const [q, r] of railPath) { const t = tileAt({ tiles } as GState, q, r); if (t) { t.rail = true; if (t.terrain === "mountain") t.terrain = "hill"; } }
  const cityAt = (q: number, r: number): void => { const t = tiles[key(q, r)]; t.terrain = "city"; t.rail = true; };
  cityAt(17, 1); cityAt(10, 12);
  const blockAt = (q: number, r: number): void => { const t = tiles[key(q, r)]; t.block = true; t.blockHp = 4; };
  blockAt(15, 5); blockAt(13, 9); blockAt(6, 6); // 两座沿铁路+一座压在山口
  // 我方: 西侧山区总部
  const hq = tiles[key(2, 6)];
  hq.hq = true; hq.state = "base"; hq.terrain = "mountain";
  for (const [dq, dr] of [[1, 0], [0, 1], [1, -1]]) { const t = tiles[key(2 + dq, 6 + dr)]; if (t) t.state = "guer"; }

  const s: GState = {
    tiles, units: [], turn: 1,
    grain: 5, recruits: 3, arms: 0,
    alert: 0, sweepActive: false, sweepTurnsLeft: 0,
    nextId: 1, log: [], over: null, selected: null
  };
  spawn(s, "guerrilla", 2, 6, false);
  spawn(s, "cadre", 3, 6, false);
  spawn(s, "garrison", 15, 5, true);
  spawn(s, "garrison", 13, 9, true);
  spawn(s, "garrison", 6, 6, true);
  push(s, "1938 年春·太行山口。总部立在山里,村口就是鬼子的炮楼。渗透、建政、伏击——把面一格格染红。", "info");
  return s;
}
function spawn(s: GState, kind: UKind, q: number, r: number, jp: boolean): Unit {
  const d = UDEFS[kind];
  const u: Unit = { id: s.nextId++, kind, jp, q, r, hp: d.hp, maxHp: d.hp, moved: false, acted: false, hidden: kind === "guerrilla" };
  s.units.push(u);
  return u;
}
function push(s: GState, t: string, k: "info" | "win" | "loss"): void {
  s.log.push({ t, k });
  if (s.log.length > 60) s.log.shift();
}

// ── 移动(BFS 带地形消耗) ──
export function reachable(s: GState, u: Unit): Map<number, number> {
  const d = UDEFS[u.kind];
  const out = new Map<number, number>();
  const frontier: [number, number, number][] = [[u.q, u.r, 0]];
  out.set(key(u.q, u.r), 0);
  while (frontier.length) {
    const [q, r, c] = frontier.shift()!;
    for (const nb of neighbors(s, q, r)) {
      const nc = c + moveCost(nb);
      if (nc > d.move) continue;
      const k2 = key(nb.q, nb.r);
      if (out.has(k2) && out.get(k2)! <= nc) continue;
      const occ = unitAt(s, nb.q, nb.r);
      if (occ) continue; // 不可穿行占用格(白盒从简)
      // 我方不能进敌城市格;敌方单位不进山地总部?(允许,失败条件之一)
      if (!u.jp && nb.terrain === "city") continue;
      out.set(k2, nc);
      frontier.push([nb.q, nb.r, nc]);
    }
  }
  out.delete(key(u.q, u.r));
  return out;
}
export function moveUnit(s: GState, u: Unit, q: number, r: number): boolean {
  if (u.moved || u.hp <= 0 || s.over) return false;
  const reach = reachable(s, u);
  if (!reach.has(key(q, r))) return false;
  u.q = q; u.r = r; u.moved = true;
  return true;
}

// ── 战斗: 文明式 hp 消耗战+地形+伏击 ──
function terrDef(t: Tile): number { return t.terrain === "mountain" ? 1.5 : t.terrain === "hill" ? 0.8 : 0; }
export function attack(s: GState, u: Unit, tq: number, tr: number): boolean {
  if (u.acted || u.hp <= 0 || s.over || UDEFS[u.kind].atk <= 0) return false;
  if (hexDist(u.q, u.r, tq, tr) !== 1) return false;
  const t = tileAt(s, tq, tr)!;
  const target = unitAt(s, tq, tr);
  const ambush = u.hidden;
  if (target && target.jp !== u.jp) {
    const dmg = Math.max(1, Math.round(UDEFS[u.kind].atk - (UDEFS[target.kind].def + terrDef(t)) / 2 + (ambush ? 1 : 0) + h2(s.turn, u.id) * 1.5 - 0.5));
    target.hp -= dmg;
    let msg = `${u.jp ? "日军" : "我方"}${UDEFS[u.kind].name}${ambush ? "伏击" : "攻击"}${UDEFS[target.kind].name}: -${dmg}`;
    if (target.hp <= 0) {
      msg += "(歼灭!)";
      if (!u.jp) { s.arms += 1; s.alert = Math.min(15, s.alert + 2); msg += " 缴获军械+1"; }
      s.units = s.units.filter((x) => x !== target);
    } else if (!ambush && UDEFS[target.kind].atk > 0) {
      const back = Math.max(1, Math.round(UDEFS[target.kind].atk - (UDEFS[u.kind].def + terrDef(tileAt(s, u.q, u.r)!)) / 2 - 0.5));
      u.hp -= back;
      msg += ` 反击-${back}`;
      if (u.hp <= 0) { msg += "(我方阵亡)"; s.units = s.units.filter((x) => x !== u); }
    }
    push(s, msg, target.hp <= 0 ? (u.jp ? "loss" : "win") : "info");
    if (u.hp > 0) { u.acted = true; u.moved = true; u.hidden = false; }
    if (!u.jp) s.alert = Math.min(15, s.alert + 1);
    checkOver(s);
    return true;
  }
  // 攻据点(炮楼)
  if (!u.jp && t.block) {
    const dmg = Math.max(1, Math.round(UDEFS[u.kind].atk - 1 + (ambush ? 1 : 0)));
    t.blockHp -= dmg;
    if (t.blockHp <= 0) {
      t.block = false;
      t.state = "guer";
      s.arms += 3;
      s.alert = Math.min(15, s.alert + 4);
      push(s, `炮楼被端掉了!缴获军械+3——这一片的封锁松了(警备+4)。`, "win");
    } else push(s, `攻打炮楼: -${dmg}(余 ${t.blockHp})`, "info");
    u.acted = true; u.moved = true; u.hidden = false;
    checkOver(s);
    return true;
  }
  return false;
}

// ── 行动: 渗透 / 建政权 / 招募 ──
export function infiltrate(s: GState, u: Unit): boolean {
  if (u.kind !== "guerrilla" || u.acted || s.over) return false;
  const t = tileAt(s, u.q, u.r)!;
  if (t.state !== "enemy" || t.terrain === "city" || t.block) return false;
  t.state = "guer";
  u.acted = true; u.moved = true;
  s.alert = Math.min(15, s.alert + 1);
  push(s, "武工渗透:这一格变成了游击区——白天是他们的,夜里是我们的。", "win");
  checkOver(s);
  return true;
}
export function buildGov(s: GState, u: Unit): boolean {
  if (u.kind !== "cadre" || u.acted || s.over) return false;
  const t = tileAt(s, u.q, u.r)!;
  if (t.state !== "guer" || s.grain < 3) return false;
  s.grain -= 3;
  t.state = "base";
  u.acted = true; u.moved = true;
  push(s, "村政权建立!减租减息、选村长——这一格,是根据地了。", "win");
  checkOver(s);
  return true;
}
export function recruit(s: GState, kind: UKind): boolean {
  if (s.over) return false;
  const d = UDEFS[kind];
  if (s.grain < d.costG || s.recruits < d.costR || s.arms < d.costA) return false;
  // 出生点: 总部或相邻空格
  const hq = s.tiles.find((t) => t.hq)!;
  const spots = [hq, ...neighbors(s, hq.q, hq.r)].filter((t) => !unitAt(s, t.q, t.r) && t.state === "base");
  if (spots.length === 0) return false;
  s.grain -= d.costG; s.recruits -= d.costR; s.arms -= d.costA;
  spawn(s, kind, spots[0].q, spots[0].r, false);
  push(s, `${d.name}在总部整编完毕。`, "info");
  return true;
}

// ── 结束回合: 资源结算 → 日军回合 ──
export function endTurn(s: GState): void {
  if (s.over) return;
  // 资源: 根据地格产出
  let g = 0, baseN = 0;
  for (const t of s.tiles) {
    if (t.state !== "base") continue;
    baseN += 1;
    g += t.terrain === "plain" ? 2 : 1;
  }
  s.grain += g;
  s.recruits += Math.floor(baseN / 2);
  // 日军回合
  jpTurn(s);
  if (s.over) return;
  // 新回合
  s.turn += 1;
  for (const u of s.units) { u.moved = false; u.acted = false; if (u.kind === "guerrilla" && !u.jp) u.hidden = true; }
  s.alert = Math.max(0, s.alert - 1);
  // 超时结算
  if (s.turn > 40) {
    const n = s.tiles.filter((t) => t.state === "base").length;
    s.over = { win: n >= 10, reason: n >= 10 ? `40 回合坚持下来,根据地 ${n} 格——星火已成燎原之势。` : `40 回合根据地仅 ${n} 格——还不够燎原。` };
  }
  checkOver(s);
}

// ── 日军 AI: 平时守点;警备≥10→扫荡战役(讨伐队合围最大根据地群) ──
function jpTurn(s: GState): void {
  // 触发扫荡
  if (!s.sweepActive && s.alert >= 10) {
    s.sweepActive = true; s.sweepTurnsLeft = 7;
    s.alert = Math.max(0, s.alert - 6);
    const hqT = s.tiles.find((t) => t.hq)!;
    const cities = s.tiles.filter((t) => t.terrain === "city");
    const city = cities.sort((a, b) => hexDist(a.q, a.r, hqT.q, hqT.r) - hexDist(b.q, b.r, hqT.q, hqT.r))[0];
    for (let i = 0; i < 3; i++) {
      const spots = neighbors(s, city.q, city.r).filter((t) => !unitAt(s, t.q, t.r));
      if (spots.length) spawn(s, "raider", spots[0].q, spots[0].r, true);
    }
    push(s, "⚠⚠ 日军扫荡战役开始!三支讨伐队从城里开拔,压向根据地——伏击它,或让开锋芒。", "loss");
  } else if (!s.sweepActive && s.alert >= 7) {
    push(s, "⚠ 情报:日军在城里集结兵力……(警备≥10 将触发扫荡)", "loss");
  }
  // 单位行动
  for (const u of s.units.filter((x) => x.jp && x.hp > 0)) {
    if (u.kind === "garrison") { garrisonAct(s, u); continue; }
    raiderAct(s, u);
  }
  // 扫荡计时
  if (s.sweepActive) {
    s.sweepTurnsLeft -= 1;
    if (s.sweepTurnsLeft <= 0 || !s.units.some((u) => u.kind === "raider")) {
      s.sweepActive = false;
      for (const u of s.units) if (u.kind === "raider") u.retreating = true;
      push(s, "日军扫荡撤了——清点损失,把丢掉的格子夺回来。", "info");
    }
  }
  checkOver(s);
}
function garrisonAct(s: GState, u: Unit): void {
  // 守备队打相邻我方单位(暴露的)
  for (const nb of neighbors(s, u.q, u.r)) {
    const t = unitAt(s, nb.q, nb.r);
    if (t && !t.jp && !t.hidden) { jpAttack(s, u, t); return; }
  }
}
function raiderAct(s: GState, u: Unit): void {
  // 撤退中→向城市走,到达消失
  if (u.retreating) {
    const cities2 = s.tiles.filter((t) => t.terrain === "city");
    const city = cities2.sort((a, b) => hexDist(a.q, a.r, u.q, u.r) - hexDist(b.q, b.r, u.q, u.r))[0];
    stepToward(s, u, city.q, city.r);
    if (hexDist(u.q, u.r, city.q, city.r) <= 1) s.units = s.units.filter((x) => x !== u);
    return;
  }
  // 攻相邻我方(暴露优先,隐蔽也能撞上)
  for (const nb of neighbors(s, u.q, u.r)) {
    const t = unitAt(s, nb.q, nb.r);
    if (t && !t.jp && !t.hidden) { jpAttack(s, u, t); return; }
  }
  // 站在根据地/游击区上→烧格降级
  const here = tileAt(s, u.q, u.r)!;
  if (here.state === "base") { here.state = "guer"; push(s, "讨伐队烧了一个根据地格——退成游击区。", "loss"); checkOver(s); return; }
  if (here.state === "guer" && h2(s.turn, u.id) < 0.5) { here.state = "enemy"; push(s, "一格游击区被清剿——变回敌占。", "loss"); return; }
  // 向最近根据地格推进
  let best: Tile | null = null, bd = 1e9;
  for (const t of s.tiles) {
    if (t.state !== "base") continue;
    const d = hexDist(u.q, u.r, t.q, t.r);
    if (d < bd) { bd = d; best = t; }
  }
  if (best) stepToward(s, u, best.q, best.r);
}
function stepToward(s: GState, u: Unit, tq: number, tr: number): void {
  for (let step = 0; step < UDEFS[u.kind].move; step++) {
    let best: Tile | null = null, bd = hexDist(u.q, u.r, tq, tr);
    for (const nb of neighbors(s, u.q, u.r)) {
      if (unitAt(s, nb.q, nb.r)) continue;
      const d = hexDist(nb.q, nb.r, tq, tr);
      if (d < bd) { bd = d; best = nb; }
    }
    if (!best) return;
    u.q = best.q; u.r = best.r;
    // 撞上隐蔽单位旁?(简化:不检)
  }
}
function jpAttack(s: GState, u: Unit, target: Unit): void {
  const t = tileAt(s, target.q, target.r)!;
  const dmg = Math.max(1, Math.round(UDEFS[u.kind].atk - (UDEFS[target.kind].def + terrDef(t)) / 2 + h2(s.turn, u.id) - 0.5));
  target.hp -= dmg;
  let msg = `日军${UDEFS[u.kind].name}攻击我${UDEFS[target.kind].name}: -${dmg}`;
  if (target.hp <= 0) { msg += "(阵亡)"; s.units = s.units.filter((x) => x !== target); }
  else if (UDEFS[target.kind].atk > 0) {
    const back = Math.max(1, Math.round(UDEFS[target.kind].atk - UDEFS[u.kind].def / 2 - 0.5));
    u.hp -= back; msg += ` 我方反击-${back}`;
    if (u.hp <= 0) { msg += "(歼灭!缴获军械+1)"; s.arms += 1; s.units = s.units.filter((x) => x !== u); }
  }
  push(s, msg, target.hp <= 0 ? "loss" : "info");
  checkOver(s);
}

function checkOver(s: GState): void {
  if (s.over) return;
  const hq = s.tiles.find((t) => t.hq)!;
  const hqEnemy = unitAt(s, hq.q, hq.r);
  const baseN = s.tiles.filter((t) => t.state === "base").length;
  const blocks = s.tiles.filter((t) => t.block).length;
  if (hqEnemy?.jp) s.over = { win: false, reason: "总部失守——星火熄灭在山口。" };
  else if (baseN === 0) s.over = { win: false, reason: "根据地全部丢失。" };
  else if (baseN >= 15) s.over = { win: true, reason: `根据地连成 ${baseN} 格——燎原之势已成!` };
  else if (blocks === 0) s.over = { win: true, reason: "三座据点全部拔除——点线崩解,面已归我。" };
}
