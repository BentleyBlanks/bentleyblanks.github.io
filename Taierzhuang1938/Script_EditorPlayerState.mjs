// 玩家状态：当前玩家身上那些 HUD 不显示的状态（失血、压制、受击晕眩、体力天花板、后坐余量、
// 散布构成、武器动作、搬运 / 机枪位、调试开关……）集中在一个独立浮窗里只读显示。
// 与 WorldInfo 同一种叠加层：window.open 独立窗口，不接管相机、不暂停玩法、不碰指针锁；
// keepOnClose —— 这些数只有在打仗时才会动，关面板回去打正是主用例。
//
// 字段是一张表（GROUPS）：加一项只加一行，读取器一律容错（缺字段显示 —，不抛）。
// 装配层才有的那几样（射速冷却、剧情无敌剩余、搬运、机枪位、第一人称动作、调试选项）
// 由 Script_Main 的 game.PlayerRuntime() 一次性交出来，这里不去摸 Script_Main 的模块变量。
const REFRESH_SECONDS = 0.1;
const FLASH_SECONDS = 0.6;
const DEG = 180 / Math.PI;
const STANCE_LABELS = { stand: "站立", crouch: "蹲伏", prone: "卧倒" };
const SLOT_LABELS = { primary: "主武器", secondary: "副武器", melee: "大刀", throwable: "投掷物" };
const SLOT_SHORT = { primary: "主", secondary: "副", melee: "刀", throwable: "投" };
const PART_LABELS = { head: "头", torso: "躯干", arm: "手臂", leg: "腿" };

const POPUP_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--ui-surface, #191b1d); color: var(--ui-text, #dedbd3);
    font: 13px/1.5 var(--ui-font, sans-serif); }
  header { position: sticky; top: 0; z-index: 2; padding: 14px 18px 12px; background: var(--ui-black, #101112);
    border-bottom: 1px solid var(--ui-line, #393b3c); }
  h1 { margin: 0; font-size: 21px; color: var(--ui-bright, #fff); }
  #status { margin: 3px 0 9px; color: var(--ui-muted, #a9a8a3); }
  .tools { display: flex; gap: 8px; flex-wrap: wrap; }
  button { font: inherit; color: var(--ui-text, #dedbd3); background: var(--ui-surface, #191b1d);
    border: 1px solid var(--ui-line, #393b3c); padding: 3px 10px; cursor: pointer; }
  button:hover { border-color: var(--ui-gold, #ceb17a); }
  button.on { color: var(--ui-black, #101112); background: var(--ui-gold, #ceb17a); border-color: var(--ui-gold, #ceb17a); }
  main { padding: 0 18px 18px; columns: 360px auto; column-gap: 26px; }
  section { break-inside: avoid; padding-top: 12px; }
  h2 { margin: 0 0 5px; font-size: 12px; color: var(--ui-gold, #ceb17a); }
  .row { display: grid; grid-template-columns: minmax(96px, 1fr) auto; align-items: center; gap: 4px 12px;
    padding: 3px 0; border-bottom: 1px solid var(--ui-line, #393b3c); }
  .row > span { color: var(--ui-muted, #a9a8a3); }
  .row > b { font: 13px/1.5 Consolas, monospace; font-weight: normal; font-variant-numeric: tabular-nums;
    text-align: right; transition: color .25s; }
  .row.flash > b { color: var(--ui-bright, #fff); }
  .row.flash { background: rgba(206, 177, 122, .12); }
  .bar { grid-column: 1 / -1; height: 3px; background: var(--ui-line, #393b3c); }
  .bar > i { display: block; height: 100%; width: 0; background: var(--ui-gold, #ceb17a); }
  .note { color: var(--ui-muted, #a9a8a3); font-size: 11px; margin: 14px 0 0; column-span: all; }
`;

const Num = (value, digits = 2, unit = "") => (Number.isFinite(value)
  ? `${(Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value).toFixed(digits)}${unit}` : "—");
const Bool = (value) => (typeof value === "boolean" ? (value ? "是" : "否") : "—");
const Text = (value) => (value === null || value === undefined || value === "" ? "—" : String(value));

// [id, 标签, 读取(ctx) → 显示文本, 可选：读取(ctx) → 0..1 的条]
const GROUPS = [
  ["生存", [
    ["alive", "存活", ({ p }) => Bool(p.alive)],
    ["health", "血量", ({ p }) => Num(p.health, 1), ({ p }) => p.health / 100],
    ["bleeding", "失血 / 秒", ({ p }) => Num(p.bleeding, 2)],
    ["wounds", "伤口", ({ p }) => (Array.isArray(p.wounds) && p.wounds.length
      ? p.wounds.map((w) => `${PART_LABELS[w.part] ?? w.part}${Num(w.bleed, 1)}`).join(" ") : "无")],
    ["bandages", "绷带", ({ p }) => Text(p.bandages)],
    ["bandageRegenTo", "包扎回血到", ({ p }) => (p.bandageRegenTo > 0 ? Num(p.bandageRegenTo, 1) : "未在回血")],
    ["legPenalty", "腿伤移速系数", ({ p }) => Num(p.LegPenalty?.(), 2)],
    ["armPenalty", "臂伤摇摆系数", ({ p }) => Num(p.ArmPenalty?.(), 2)],
    ["spawnGrace", "出生保护剩余", ({ p }) => Num(p.spawnGrace, 2, " s")],
    ["scriptInvuln", "剧情无敌剩余", ({ r }) => Num(r?.scriptInvulnS, 2, " s")],
    ["deadTime", "阵亡计时", ({ p }) => (p.alive === false ? Num(p.deadTime, 2, " s") : "—")],
  ]],
  ["受击与压制", [
    ["suppression", "压制", ({ p }) => Num(p.suppression, 3), ({ p }) => p.suppression],
    ["suppressedUpright", "压制中仍站立", ({ p }) => Bool(p.suppressedUpright)],
    ["hitFlash", "受击闪红", ({ p }) => Num(p.hitFlash, 3), ({ p }) => p.hitFlash],
    ["disorientation", "受击晕眩（生效）", ({ p }) => Num(p.HitDisorientation, 3), ({ p }) => p.HitDisorientation],
    ["disorientationTime", "晕眩剩余 / 强度", ({ p }) => `${Num(p.hitDisorientationTime, 2, " s")} / ${Num(p.hitDisorientationStrength, 2)}`],
    ["heartbeat", "心跳计时", ({ p }) => Num(p.heartbeatTimer, 2, " s")],
  ]],
  ["体力与呼吸", [
    ["stamina", "体力", ({ p }) => Num(p.stamina, 3), ({ p }) => p.stamina],
    ["staminaCeiling", "体力上限", ({ p }) => Num(p.staminaCeiling ?? 1, 2)],
    ["sprint", "冲刺量", ({ p }) => Num(p.sprint, 3), ({ p }) => p.sprint],
    ["sprintSpent", "冲刺跑空", ({ p }) => Bool(p.sprintSpent)],
    ["breathHold", "屏息", ({ p }) => Bool(p.breathHold)],
    ["fastCrawl", "快速匍匐", ({ p }) => Bool(p.fastCrawl)],
    ["waterDepth", "水深", ({ p }) => `${Num(p.waterDepth, 2, " m")}${p.InWater ? " · 涉水" : ""}`],
    ["carrySpeedScale", "搬运移速系数", ({ p }) => Num(p.carrySpeedScale, 2)],
  ]],
  ["姿态与移动", [
    ["stance", "姿态", ({ p }) => STANCE_LABELS[p.stance] ?? Text(p.stance)],
    ["stanceBlend", "蹲 / 卧 过渡", ({ p }) => `${Num(p.stanceBlend?.crouch, 2)} / ${Num(p.stanceBlend?.prone, 2)}`],
    ["stanceBlock", "换姿态被拦", ({ p }) => Text(p.stanceBlockReason)],
    ["grounded", "接地", ({ p }) => Bool(p.grounded)],
    ["speed", "水平速度", ({ p }) => Num(Math.hypot(p.velocity?.x, p.velocity?.z), 2, " m/s")],
    ["airTime", "滞空 / 起跳次数", ({ p }) => `${Num(p.jump?.airTime, 2, " s")} / ${Text(p.jump?.count)}`],
    ["jumpCooldown", "跳跃冷却", ({ p }) => Num(p.jump?.cooldown, 2, " s")],
    ["vault", "翻越", ({ p }) => (p.vault?.active ? `${p.vault.kind} ${Num(p.vault.t, 2)}/${Num(p.vault.duration, 2)} s` : "否")],
    ["vaultCount", "翻越 / 撑上 次数", ({ p }) => `${Text(p.vaultCount)} / ${Text(p.mantleCount)}`],
    ["lean", "侧身（手动 / 自动）", ({ p }) => `${Num(p.lean, 2)} / ${Num(p.autoLean, 2)}`],
    ["bipod", "架枪", ({ p }) => Bool(p.bipod)],
  ]],
  ["瞄准与散布", [
    ["ads", "开镜量", ({ p }) => `${Num(p.ads, 3)}${p.wantAds ? " · 按住" : ""}`, ({ p }) => p.ads],
    ["freeAim", "自由瞄准 偏航 / 俯仰", ({ p }) => `${Num(p.aimYaw * DEG, 2, "°")} / ${Num(p.aimPitch * DEG, 2, "°")}`],
    ["freeAimLimit", "自由瞄准上限", ({ p }) => Num(p.freeAimLimitDeg, 1, "°")],
    ["lookIdle", "鼠标静止", ({ p }) => Num(p.lookIdle, 2, " s")],
    ["recoilTotal", "未收回后坐", ({ p }) => Num(p.recoilTotal * DEG, 3, "°")],
    ["recoilSince", "距上一发 / 峰值", ({ p }) => `${p.recoilSince >= 999 ? "—" : Num(p.recoilSince, 2, " s")} / ${Num(p.recoilPeak * DEG, 2, "°")}`],
    ["sway", "摇摆幅度", ({ p, r }) => Num(p.SwayAmount?.(r?.weapon), 3, "°")],
    ["spread", "散布（准心真值）", ({ p, r }) => Num(p.SpreadDeg?.(r?.weapon), 2, "°")],
    ["bloom", "连射扩散 / 移动余量", ({ p, r }) => `${Num(p.firearmHandling?.Bloom?.(r?.weapon), 3)} / ${Num(p.firearmHandling?.movement, 3)}`],
    ["gunClearance", "枪口贴墙下压", ({ p }) => `${Num(p.gunClearance?.lower, 2)}${p.gunClearance?.blocked ? " · 堵住" : ""}`],
  ]],
  ["武器与弹药", [
    ["weapon", "手上", ({ g, s }) => `${Text(g?.currentWeapon)} · ${SLOT_LABELS[s?.activeSlot] ?? Text(s?.activeSlot)}`],
    ["slots", "槽位", ({ s }) => (s?.slots
      ? Object.entries(s.slots).map(([k, v]) => `${SLOT_SHORT[k] ?? k} ${v ?? "空"}`).join(" · ") : "—")],
    ["ammo", "弹仓 / 备弹", ({ s }) => `${Text(s?.ammo)} / ${Text(s?.clips)}`],
    ["grenades", "手榴弹 / 集束", ({ s }) => `${Text(s?.grenades)} / ${Text(s?.bundles)}`],
    ["cook", "攥弹", ({ s }) => (s?.cooking ? `${s.cooking} ${Num(s.cook, 2, " s")}` : "否")],
    ["fireMode", "射击模式", ({ s }) => Text(s?.fireMode)],
    ["fireCooldown", "射击冷却", ({ r }) => Num(r?.fireCooldown, 3, " s")],
    ["recoilDelay", "后坐延迟", ({ p }) => Num(p.recoilDelayS, 3, " s")],
    ["bayonet", "刺刀", ({ s }) => Bool(s?.bayonetFixed)],
    ["meleeCharge", "白刃蓄力", ({ s }) => (s?.meleeCharge ? `${Text(s.meleeCharge.source)} ${Num(s.meleeCharge.t, 2, " s")}` : "否")],
    ["viewmodelAction", "第一人称动作", ({ r }) => Text(r?.viewmodelAction) === "—" ? "空闲" : r.viewmodelAction],
  ]],
  ["控制与调试", [
    ["control", "控制权", ({ s }) => (s?.cutscene ? `过场 ${s.cutscene}` : s?.menu ? "主菜单" : s?.running === false ? "未运行" : "玩家")],
    ["carry", "搬运", ({ r }) => (r?.carry ? `${r.carry}${r.carryBlocking ? " · 收枪" : ""}` : "否")],
    ["mounted", "机枪位", ({ r }) => Text(r?.mounted) === "—" ? "否" : r.mounted],
    ["meleeFocus", "白刃镜头 聚焦 / 下压", ({ p }) => `${Num(p.meleeCameraFocus ?? 0, 2)} / ${Num(p.meleeCameraDrop ?? 0, 2)}`],
    ["infinite", "无限弹药 / 手榴弹", ({ r }) => `${Bool(r?.infiniteAmmo)} / ${Bool(r?.infiniteGrenades)}`],
    ["debugFlags", "穿墙 / 快速 / 无敌", ({ p }) => `${Bool(p.debug?.noCollision)} / ${Bool(p.debug?.fastMove)} / ${Bool(p.debug?.invincible)}`],
  ]],
];

export const PLAYER_STATE_FIELDS = GROUPS.flatMap(([, rows]) => rows.map(([id]) => id));

export class PlayerStateEditor {
  static id = "playerState";
  static label = "玩家状态";
  static hint = "独立浮窗：当前玩家的隐藏状态（血量失血、压制晕眩、体力、后坐散布、弹药动作、调试开关），游戏中实时刷新";
  static keepOnClose = true;

  constructor(host) {
    this.host = host;
    this.win = null;
    this.ui = null;
    this.elapsed = 0;
    this.frozen = false;
    this.last = new Map();
    this.flashUntil = new Map();
    this.clock = 0;
    this.OnPageHide = () => this.host.ClosePlayerState();
  }

  Enter() {
    this.win = window.open("", "tzPlayerState", "popup,width=820,height=900,menubar=no,toolbar=no,location=no");
    if (!this.win) throw new Error("玩家状态独立窗口被浏览器拦截，请允许弹窗后再打开");
    try {
      const doc = this.win.document;
      doc.open();
      doc.write("<!doctype html><html lang='zh-CN'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'><title>玩家状态 · 台儿庄：血战滕县</title></head><body></body></html>");
      doc.close();
      const theme = document.querySelector("link[data-interface-theme]");
      if (theme) {
        const link = doc.createElement("link");
        link.rel = "stylesheet";
        link.href = theme.href;
        doc.head.appendChild(link);
      }
      const style = doc.createElement("style");
      style.textContent = POPUP_CSS;
      doc.head.appendChild(style);
      const El = (tag, parent, text = "") => {
        const node = doc.createElement(tag);
        node.textContent = text;
        parent.appendChild(node);
        return node;
      };
      const header = El("header", doc.body);
      El("h1", header, "玩家状态");
      const status = El("p", header);
      status.id = "status";
      const tools = El("div", header);
      tools.className = "tools";
      const freeze = El("button", tools, "冻结读数");
      freeze.type = "button";
      freeze.dataset.action = "freeze";
      freeze.addEventListener("click", () => this.SetFrozen(!this.frozen));
      const copy = El("button", tools, "复制快照 JSON");
      copy.type = "button";
      copy.dataset.action = "copy";
      copy.addEventListener("click", () => this.CopySnapshot());
      this.ui = { status, freeze, copy, rows: {} };
      const main = El("main", doc.body);
      for (const [title, rows] of GROUPS) {
        const section = El("section", main);
        El("h2", section, title);
        for (const [id, label, , bar] of rows) {
          const row = El("div", section);
          row.className = "row";
          row.dataset.field = id;
          El("span", row, label);
          const value = El("b", row, "—");
          const entry = { row, value, fill: null };
          if (bar) {
            const track = El("div", row);
            track.className = "bar";
            entry.fill = El("i", track);
          }
          this.ui.rows[id] = entry;
        }
      }
      El("p", main, "只读，不改角色。读数每 0.1 秒刷新，变化的行会闪一下；冻结后停在当前帧，方便对照。角度：度 · 时间：秒。").className = "note";
      window.addEventListener("pagehide", this.OnPageHide);
      this.Refresh();
      return this;
    } catch (error) {
      this.Exit();
      throw error;
    }
  }

  /** 读一遍全部字段 → { id: 显示文本 }，外加条的 0..1。没有玩家时返回 null。 */
  Snapshot() {
    const game = this.host.game;
    const player = game?.player;
    if (game?.state?.ready === false || !player?.position) return null;
    let runtime = null;
    try { runtime = game.PlayerRuntime?.() ?? null; } catch (error) { runtime = null; }
    const ctx = { p: player, s: game.state, g: game, r: runtime };
    const values = {};
    const bars = {};
    for (const [, rows] of GROUPS) {
      for (const [id, , Read, Bar] of rows) {
        try { values[id] = Read(ctx); } catch (error) { values[id] = "—"; }
        if (Bar) {
          let k = NaN;
          try { k = Bar(ctx); } catch (error) { k = NaN; }
          bars[id] = Number.isFinite(k) ? Math.max(0, Math.min(1, k)) : 0;
        }
      }
    }
    return { values, bars, alive: player.alive };
  }

  SetFrozen(on) {
    this.frozen = !!on;
    if (!this.ui) return;
    this.ui.freeze.classList.toggle("on", this.frozen);
    this.ui.freeze.textContent = this.frozen ? "继续刷新" : "冻结读数";
    if (!this.frozen) this.Refresh();
    else this.ui.status.textContent = "已冻结 · 点「继续刷新」恢复";
  }

  CopySnapshot() {
    const data = this.Snapshot();
    const text = JSON.stringify(data ? data.values : null, null, 2);
    const clipboard = this.win?.navigator?.clipboard;
    const Done = (ok) => { if (this.ui) this.ui.copy.textContent = ok ? "已复制" : "复制失败（见控制台）"; };
    if (!clipboard?.writeText) { console.log("[PlayerState]", text); Done(false); return text; }
    clipboard.writeText(text).then(() => Done(true), () => { console.log("[PlayerState]", text); Done(false); });
    return text;
  }

  Refresh() {
    if (!this.ui) return;
    const data = this.Snapshot();
    const status = data ? `当前玩家 · ${data.alive === false ? "已阵亡" : "实时"}` : "等待当前玩家 / 场景加载";
    if (this.ui.status.textContent !== status) this.ui.status.textContent = status;
    for (const [id, entry] of Object.entries(this.ui.rows)) {
      const text = data ? data.values[id] ?? "—" : "—";
      const previous = this.last.get(id);
      if (entry.value.textContent !== text) entry.value.textContent = text;
      // 刚加载那一遍不算「变化」，否则开窗整页闪一下
      if (data && previous !== undefined && previous !== text) this.flashUntil.set(id, this.clock + FLASH_SECONDS);
      this.last.set(id, data ? text : undefined);
      entry.row.classList.toggle("flash", (this.flashUntil.get(id) ?? -1) > this.clock);
      if (entry.fill) {
        const width = `${((data?.bars[id] ?? 0) * 100).toFixed(1)}%`;
        if (entry.fill.style.width !== width) entry.fill.style.width = width;
      }
    }
  }

  Update(dt) {
    if (!this.win || this.win.closed) { this.host.ClosePlayerState(); return; }
    this.clock += dt;
    this.elapsed += dt;
    if (this.elapsed < REFRESH_SECONDS) return;
    this.elapsed %= REFRESH_SECONDS;
    if (!this.frozen) this.Refresh();
  }

  Exit() {
    window.removeEventListener("pagehide", this.OnPageHide);
    if (this.win && !this.win.closed) this.win.close();
    this.win = null;
    this.ui = null;
  }
}
