// ui —— HUD / 升级 / 技能 DOM 覆盖层（Agent 7）
// 覆盖层由 main 固定为逻辑 960×640 并整体缩放，故此处一律用"逻辑像素"布局，
// 与画布坐标完全对齐。控件只落在不与画布交互内容重叠的分区：
//   HUD     顶栏 y0..52（右侧留 56px 给静音键）
//   技能栏  控制带右下 y≈578..632
//   升级    控制带左下"🛒商店"按钮 + 点击上滑的抽屉（默认收起，不挡手机/队列）
import type { GameContext, GameModule } from '../types/module.types';
import type { UpgradeDef, SkillDef } from '../types/content.types';
import { Balance } from '../content';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function setText(node: HTMLElement, value: string): void { if (node.textContent !== value) node.textContent = value; }
function setClass(node: HTMLElement, className: string, on: boolean): void { if (node.classList.contains(className) !== on) node.classList.toggle(className, on); }
function setWidth(node: HTMLElement, pct: string): void { if (node.style.width !== pct) node.style.width = pct; }

interface UpgradeRow {
  def: UpgradeDef; levelEl: HTMLElement; costEl: HTMLElement; btn: HTMLButtonElement;
  lastOwned: number; lastCost: number; lastDisabled: boolean; lastLabel: string;
}
interface SkillRow {
  def: SkillDef; btn: HTMLButtonElement; overlay: HTMLElement; cdLabel: HTMLElement; glyphEl: HTMLElement;
  lastState: string; lastCdText: string; lastSweep: string;
}

const STYLE = `
.bb-ui-root { position:absolute; inset:0; pointer-events:none;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
  color:var(--ink,#2B2B33); user-select:none; -webkit-user-select:none; }

/* ---- TOP HUD (0..52) ---- */
.bb-ui-hud { position:absolute; left:0; top:0; width:960px; height:52px; box-sizing:border-box;
  display:flex; align-items:center; gap:14px; padding:0 58px 0 16px;
  background:linear-gradient(180deg, rgba(255,255,255,.96), rgba(255,255,255,.78));
  box-shadow:0 2px 10px var(--shadow,rgba(43,43,51,.12)); pointer-events:auto; }
.bb-ui-hud-item { display:flex; align-items:center; gap:5px; font-size:15px; font-weight:600; white-space:nowrap; }
.bb-ui-lv { background:var(--blue,#5B8DEF); color:#fff; padding:4px 12px; border-radius:999px; font-size:15px; font-weight:700;
  box-shadow:0 2px 6px var(--shadow,rgba(43,43,51,.18)); }
.bb-ui-xpwrap { display:flex; align-items:center; gap:8px; width:230px; }
.bb-ui-xpbar { position:relative; flex:1; height:10px; border-radius:999px; background:rgba(91,141,239,.18); overflow:hidden; }
.bb-ui-xpfill { position:absolute; left:0; top:0; bottom:0; width:0%;
  background:linear-gradient(90deg, var(--blue,#5B8DEF), var(--mint,#26C6A6)); border-radius:999px; transition:width .18s ease; }
.bb-ui-xptext { font-size:12px; color:#6b6b75; font-weight:600; white-space:nowrap; }
.bb-ui-coins { color:var(--orange,#FF9F43); font-size:16px; }
.bb-ui-stars { letter-spacing:2px; font-size:16px; line-height:1; position:relative; display:inline-block; }
.bb-ui-stars-bg { color:rgba(43,43,51,.16); }
.bb-ui-stars-fg { color:#FFC542; position:absolute; left:0; top:0; overflow:hidden; white-space:nowrap; width:100%; }
.bb-ui-queue { color:var(--mint,#26C6A6); }
.bb-ui-total { color:#9a9aa3; }

/* ---- UPGRADE launcher + drawer (bottom-left) ---- */
.bb-ui-shop-btn { position:absolute; left:12px; bottom:8px; width:122px; height:54px; box-sizing:border-box;
  pointer-events:auto; border:none; cursor:pointer; border-radius:16px;
  background:var(--blue,#5B8DEF); color:#fff; font-weight:700; font-size:15px;
  display:flex; align-items:center; justify-content:center; gap:6px;
  box-shadow:0 4px 12px var(--shadow,rgba(43,43,51,.22)); }
.bb-ui-shop-btn:active { transform:scale(.95); }
.bb-ui-drawer { position:absolute; left:12px; bottom:70px; width:336px; max-height:0; overflow:hidden;
  pointer-events:auto; background:var(--panel,rgba(255,255,255,.96)); border-radius:16px;
  box-shadow:0 10px 30px var(--shadow,rgba(43,43,51,.28)); opacity:0;
  transition:max-height .22s ease, opacity .18s ease; }
.bb-ui-drawer.bb-ui-open { max-height:474px; opacity:1; }
.bb-ui-drawer-head { display:flex; align-items:center; justify-content:space-between;
  padding:10px 14px; font-size:15px; font-weight:700; background:rgba(91,141,239,.12); }
.bb-ui-drawer-close { cursor:pointer; font-size:16px; color:#8a8a93; padding:0 6px; }
.bb-ui-panel-body { max-height:392px; overflow-y:auto; padding:8px; -webkit-overflow-scrolling:touch; }
.bb-ui-up-row { display:flex; align-items:center; gap:8px; padding:8px; border-radius:12px; margin-bottom:6px; background:rgba(255,255,255,.7); }
.bb-ui-up-info { flex:1; min-width:0; }
.bb-ui-up-name { font-size:14px; font-weight:700; display:flex; align-items:baseline; gap:6px; }
.bb-ui-up-lv { font-size:11px; font-weight:700; color:#fff; background:var(--mint,#26C6A6); padding:0 7px; border-radius:999px; }
.bb-ui-up-desc { font-size:11.5px; color:#8a8a93; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bb-ui-up-buy { flex:0 0 auto; border:none; cursor:pointer; background:var(--blue,#5B8DEF); color:#fff; font-weight:700; font-size:12px;
  padding:8px 10px; border-radius:11px; min-width:72px; text-align:center; box-shadow:0 2px 6px var(--shadow,rgba(43,43,51,.18)); }
.bb-ui-up-buy:active { transform:scale(.94); }
.bb-ui-up-cost { display:block; font-size:10.5px; opacity:.92; font-weight:600; }
.bb-ui-up-buy.bb-ui-disabled { background:#c7c7cf; color:#fff; cursor:default; box-shadow:none; }
.bb-ui-up-buy.bb-ui-maxed { background:var(--orange,#FF9F43); cursor:default; }
.bb-ui-reset { text-align:center; font-size:12px; color:#b0464a; padding:8px 4px 10px; cursor:pointer; text-decoration:underline; }

/* ---- SKILL bar (bottom-right) ---- */
.bb-ui-skills { position:absolute; right:12px; bottom:8px; display:flex; gap:8px; pointer-events:auto; }
.bb-ui-skill { position:relative; width:54px; height:54px; border:none; cursor:pointer; border-radius:15px;
  background:var(--mint,#26C6A6); color:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center;
  box-shadow:0 4px 12px var(--shadow,rgba(43,43,51,.22)); overflow:hidden; padding:0; }
.bb-ui-skill:active { transform:scale(.93); }
.bb-ui-skill-glyph { font-size:22px; line-height:1; }
.bb-ui-skill-name { font-size:9px; font-weight:700; margin-top:2px; line-height:1; max-width:50px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.bb-ui-skill.bb-ui-locked { background:#b9b9c2; cursor:default; }
.bb-ui-skill.bb-ui-cooling { cursor:default; }
.bb-ui-skill-overlay { position:absolute; inset:0; pointer-events:none; display:flex; align-items:center; justify-content:center; }
.bb-ui-skill-cdtext { font-size:17px; font-weight:800; color:#fff; text-shadow:0 1px 2px rgba(0,0,0,.35); }
`;

const SKILL_GLYPHS: Record<string, string> = {
  skill_clearphone: '🧽', skill_freeze: '❄️', skill_soothe: '☕',
  skill_hands: '🖐️', skill_tip: '💸', skill_magnet: '🧲',
};

export function createUiModule(): GameModule {
  let ctx!: GameContext;
  let root: HTMLElement | null = null;
  let styleEl: HTMLStyleElement | null = null;

  let lvEl!: HTMLElement, xpFill!: HTMLElement, xpText!: HTMLElement, coinsEl!: HTMLElement;
  let starsFg!: HTMLElement, queueEl!: HTMLElement, totalEl!: HTMLElement;

  let lastLv = -1, lastXpPct = '', lastXpText = '', lastCoins = '', lastStars = '', lastQueue = '', lastTotal = '';

  const upgradeRows: UpgradeRow[] = [];
  const skillRows: SkillRow[] = [];

  function buildHud(): HTMLElement {
    const hud = el('div', 'bb-ui-hud');
    lvEl = el('span', 'bb-ui-lv', 'Lv 1');
    hud.appendChild(lvEl);

    const xpWrap = el('div', 'bb-ui-xpwrap');
    const xpBar = el('div', 'bb-ui-xpbar');
    xpFill = el('div', 'bb-ui-xpfill');
    xpBar.appendChild(xpFill);
    xpText = el('span', 'bb-ui-xptext', '0/0');
    xpWrap.appendChild(xpBar); xpWrap.appendChild(xpText);
    hud.appendChild(xpWrap);

    const coinsItem = el('div', 'bb-ui-hud-item bb-ui-coins');
    coinsItem.appendChild(el('span', undefined, '💰'));
    coinsEl = el('span', undefined, '0'); coinsItem.appendChild(coinsEl);
    hud.appendChild(coinsItem);

    const starsItem = el('div', 'bb-ui-hud-item');
    const starsBox = el('span', 'bb-ui-stars');
    starsBox.appendChild(el('span', 'bb-ui-stars-bg', '★★★★★'));
    starsFg = el('span', 'bb-ui-stars-fg', '★★★★★');
    starsBox.appendChild(starsFg);
    starsItem.appendChild(starsBox);
    hud.appendChild(starsItem);

    const queueItem = el('div', 'bb-ui-hud-item bb-ui-queue');
    queueItem.appendChild(el('span', undefined, '🪑'));
    queueEl = el('span', undefined, '0/0'); queueItem.appendChild(queueEl);
    hud.appendChild(queueItem);

    const totalItem = el('div', 'bb-ui-hud-item bb-ui-total');
    totalItem.appendChild(el('span', undefined, '🔴'));
    totalEl = el('span', undefined, '0'); totalItem.appendChild(totalEl);
    hud.appendChild(totalItem);

    return hud;
  }

  function buildUpgrades(): HTMLElement {
    const wrap = el('div'); // 透明容器：子元素绝对定位于 .bb-ui-root

    const drawer = el('div', 'bb-ui-drawer');
    const head = el('div', 'bb-ui-drawer-head');
    head.appendChild(el('span', undefined, '🛠 升级商店'));
    const close = el('span', 'bb-ui-drawer-close', '✕');
    head.appendChild(close);
    drawer.appendChild(head);

    const body = el('div', 'bb-ui-panel-body');
    for (const def of ctx.content.upgrades) {
      const row = el('div', 'bb-ui-up-row');
      const info = el('div', 'bb-ui-up-info');
      const nameLine = el('div', 'bb-ui-up-name');
      nameLine.appendChild(el('span', undefined, def.name));
      const lvBadge = el('span', 'bb-ui-up-lv', 'Lv0');
      nameLine.appendChild(lvBadge);
      info.appendChild(nameLine);
      info.appendChild(el('div', 'bb-ui-up-desc', def.desc));
      row.appendChild(info);

      const btn = el('button', 'bb-ui-up-buy');
      btn.appendChild(el('span', undefined, '购买'));
      const costEl = el('span', 'bb-ui-up-cost', '');
      btn.appendChild(costEl);
      btn.addEventListener('click', () => {
        if (btn.classList.contains('bb-ui-disabled') || btn.classList.contains('bb-ui-maxed')) return;
        ctx.bus.emit({ type: 'BUY_UPGRADE', id: def.id });
      });
      row.appendChild(btn);
      body.appendChild(row);
      upgradeRows.push({ def, levelEl: lvBadge, costEl, btn, lastOwned: -1, lastCost: -1, lastDisabled: false, lastLabel: '' });
    }
    drawer.appendChild(body);

    const reset = el('div', 'bb-ui-reset', '重置存档');
    reset.addEventListener('click', () => {
      if (typeof window !== 'undefined' && window.confirm('确定要清空存档并重新开始吗？')) {
        try { localStorage.removeItem(Balance.SAVE_KEY); } catch { /* ignore */ }
        location.reload();
      }
    });
    drawer.appendChild(reset);

    const launcher = el('button', 'bb-ui-shop-btn');
    launcher.appendChild(el('span', undefined, '🛒'));
    launcher.appendChild(el('span', undefined, '商店'));
    launcher.addEventListener('click', () => drawer.classList.toggle('bb-ui-open'));
    close.addEventListener('click', () => drawer.classList.remove('bb-ui-open'));

    wrap.appendChild(drawer);
    wrap.appendChild(launcher);
    return wrap;
  }

  function buildSkills(): HTMLElement {
    const bar = el('div', 'bb-ui-skills');
    for (const def of ctx.content.skills) {
      const btn = el('button', 'bb-ui-skill');
      const glyphEl = el('span', 'bb-ui-skill-glyph', SKILL_GLYPHS[def.id] ?? '✨');
      btn.appendChild(glyphEl);
      btn.appendChild(el('span', 'bb-ui-skill-name', def.name));
      const overlay = el('div', 'bb-ui-skill-overlay');
      const cdLabel = el('span', 'bb-ui-skill-cdtext', '');
      overlay.appendChild(cdLabel);
      btn.appendChild(overlay);
      btn.title = `${def.name} · ${def.desc}`;
      btn.addEventListener('click', () => {
        if (btn.classList.contains('bb-ui-locked') || btn.classList.contains('bb-ui-cooling')) return;
        ctx.bus.emit({ type: 'USE_SKILL', id: def.id });
      });
      bar.appendChild(btn);
      skillRows.push({ def, btn, overlay, cdLabel, glyphEl, lastState: '', lastCdText: '', lastSweep: '' });
    }
    return bar;
  }

  function refreshHud(): void {
    const s = ctx.state;
    if (s.level !== lastLv) { setText(lvEl, `Lv ${s.level}`); lastLv = s.level; }
    const xpFloor = Math.floor(s.xp);
    const toNext = s.xpToNext > 0 ? s.xpToNext : 1;
    const pct = `${Math.max(0, Math.min(100, (xpFloor / toNext) * 100)).toFixed(1)}%`;
    if (pct !== lastXpPct) { setWidth(xpFill, pct); lastXpPct = pct; }
    const xpStr = `${xpFloor}/${s.xpToNext}`;
    if (xpStr !== lastXpText) { setText(xpText, xpStr); lastXpText = xpStr; }
    const coins = String(Math.floor(s.points));
    if (coins !== lastCoins) { setText(coinsEl, coins); lastCoins = coins; }
    const rep = Math.max(0, Math.min(5, s.reputation));
    const repPct = `${(rep / 5) * 100}%`;
    if (repPct !== lastStars) { setWidth(starsFg, repPct); lastStars = repPct; }
    const q = `${s.queue.length}/${s.queueCapacity}`;
    if (q !== lastQueue) { setText(queueEl, q); lastQueue = q; }
    const total = String(s.totalCleared);
    if (total !== lastTotal) { setText(totalEl, total); lastTotal = total; }
  }

  function refreshUpgrades(): void {
    const s = ctx.state;
    const points = Math.floor(s.points);
    for (const row of upgradeRows) {
      const def = row.def;
      const owned = s.upgrades[def.id] ?? 0;
      const maxed = def.maxLevel > 0 && owned >= def.maxLevel;
      const cost = maxed ? 0 : Balance.upgradeCost(def.baseCost, def.costGrowth, owned);
      if (owned !== row.lastOwned) { setText(row.levelEl, `Lv${owned}`); row.lastOwned = owned; }
      const label = maxed ? '已满级' : `💰${cost}`;
      if (label !== row.lastLabel) { setText(row.costEl, label); row.lastLabel = label; }
      const disabled = maxed || points < cost;
      if (disabled !== row.lastDisabled || maxed !== row.btn.classList.contains('bb-ui-maxed')) {
        setClass(row.btn, 'bb-ui-disabled', disabled && !maxed);
        setClass(row.btn, 'bb-ui-maxed', maxed);
        row.lastDisabled = disabled;
      }
      row.lastCost = cost;
    }
  }

  function refreshSkills(): void {
    const s = ctx.state;
    const now = ctx.now();
    for (const row of skillRows) {
      const def = row.def;
      const skillState = s.skills[def.id];
      const unlocked = !!skillState && skillState.unlocked;
      let stateKey: 'locked' | 'cd' | 'ready';
      let cdText = '';
      let sweepPct = 0;
      if (!unlocked) {
        stateKey = 'locked';
      } else {
        const remaining = def.cooldownMs - (now - skillState.lastUsedAt);
        if (skillState.lastUsedAt > 0 && remaining > 0) {
          stateKey = 'cd';
          cdText = String(Math.ceil(remaining / 1000));
          sweepPct = Math.max(0, Math.min(100, (remaining / def.cooldownMs) * 100));
        } else {
          stateKey = 'ready';
        }
      }
      if (stateKey !== row.lastState) {
        setClass(row.btn, 'bb-ui-locked', stateKey === 'locked');
        setClass(row.btn, 'bb-ui-cooling', stateKey === 'cd');
        setText(row.glyphEl, stateKey === 'locked' ? '🔒' : (SKILL_GLYPHS[def.id] ?? '✨'));
        row.lastState = stateKey;
        row.lastCdText = ' '; row.lastSweep = ' ';
      }
      const wantText = stateKey === 'cd' ? cdText : stateKey === 'locked' ? `Lv${def.unlockLevel}` : '';
      if (wantText !== row.lastCdText) { setText(row.cdLabel, wantText); row.lastCdText = wantText; }
      if (stateKey === 'cd') {
        const bucket = Math.round(sweepPct);
        if (String(bucket) !== row.lastSweep) {
          row.overlay.style.background = `conic-gradient(rgba(43,43,51,.45) ${bucket}%, rgba(43,43,51,0) ${bucket}%)`;
          row.lastSweep = String(bucket);
        }
      } else if (stateKey === 'locked') {
        if (row.lastSweep !== 'lock') { row.overlay.style.background = 'rgba(43,43,51,.30)'; row.lastSweep = 'lock'; }
      } else {
        if (row.lastSweep !== 'none') { row.overlay.style.background = 'transparent'; row.lastSweep = 'none'; }
      }
    }
  }

  return {
    name: 'ui',
    init(c) {
      ctx = c;
      if (!document.getElementById('bb-ui-style')) {
        styleEl = el('style');
        styleEl.id = 'bb-ui-style';
        styleEl.textContent = STYLE;
        document.head.appendChild(styleEl);
      }
      root = el('div', 'bb-ui-root');
      root.appendChild(buildHud());
      root.appendChild(buildUpgrades());
      root.appendChild(buildSkills());
      ctx.uiRoot.appendChild(root);
      refreshHud(); refreshUpgrades(); refreshSkills();
    },
    update() { refreshHud(); refreshUpgrades(); refreshSkills(); },
    destroy() {
      if (root && root.parentNode) root.parentNode.removeChild(root);
      root = null;
      if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
      styleEl = null;
      upgradeRows.length = 0; skillRows.length = 0;
    },
  };
}
