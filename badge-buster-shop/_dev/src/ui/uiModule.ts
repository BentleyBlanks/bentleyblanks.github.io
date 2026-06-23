import { upgradeCost } from '../content/balance';
import type { GameContext, GameModule } from '../types/module.types';

function formatNumber(value: number): string {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}亿`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}万`;
  return String(Math.floor(value));
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;');
}

export function createUiModule(): GameModule {
  let ctx: GameContext;
  let root: HTMLElement;
  let muted = localStorage.getItem('badge-buster-muted') === '1';
  let accumulator = 0;
  let lastSignature = '';
  let interactionHoldUntil = 0;

  function stars(): string {
    return Array.from({ length: 5 }, (_, index) => {
      const filled = ctx.state.reputation >= index + 0.75;
      return `<span class="star ${filled ? 'filled' : ''}"></span>`;
    }).join('');
  }

  function upgradesHtml(): string {
    return ctx.content.upgrades
      .map((upgrade) => {
        const level = ctx.state.upgrades[upgrade.id] ?? 0;
        const maxed = upgrade.maxLevel > 0 && level >= upgrade.maxLevel;
        const cost = upgradeCost(upgrade, level);
        const disabled = maxed || ctx.state.points < cost;
        return `
          <button class="upgrade-row" data-upgrade="${upgrade.id}" ${disabled ? 'disabled' : ''} title="${escapeAttr(upgrade.desc)}">
            <span>
              <strong>${upgrade.name}</strong>
              <small>${level} 级${maxed ? ' · 满级' : ''}</small>
            </span>
            <b>${maxed ? '已满' : `${formatNumber(cost)}元`}</b>
          </button>
        `;
      })
      .join('');
  }

  function skillsHtml(): string {
    const now = performance.now();
    return ctx.content.skills
      .map((skill) => {
        const runtime = ctx.state.skills[skill.id] ?? { unlocked: false, lastUsedAt: -Infinity };
        const remaining = Math.max(0, skill.cooldownMs - (now - runtime.lastUsedAt));
        const disabled = !runtime.unlocked || remaining > 0;
        const label = !runtime.unlocked ? `${skill.unlockLevel}级` : remaining > 0 ? `${Math.ceil(remaining / 1000)}秒` : '释放';
        return `
          <button class="skill-button" data-skill="${skill.id}" ${disabled ? 'disabled' : ''} title="${escapeAttr(skill.desc)}">
            <span>${skill.name}</span>
            <b>${label}</b>
          </button>
        `;
      })
      .join('');
  }

  function signature(): string {
    const now = performance.now();
    const upgradeState = ctx.content.upgrades.map((upgrade) => `${upgrade.id}:${ctx.state.upgrades[upgrade.id] ?? 0}`).join('|');
    const skillState = ctx.content.skills
      .map((skill) => {
        const runtime = ctx.state.skills[skill.id] ?? { unlocked: false, lastUsedAt: -Infinity };
        const remaining = runtime.unlocked ? Math.ceil(Math.max(0, skill.cooldownMs - (now - runtime.lastUsedAt)) / 1000) : -1;
        return `${skill.id}:${runtime.unlocked ? 1 : 0}:${remaining}`;
      })
      .join('|');
    return [
      ctx.state.level,
      Math.floor(ctx.state.points),
      Math.floor(ctx.state.xp),
      ctx.state.xpToNext,
      ctx.state.queue.length,
      ctx.state.queueCapacity,
      Math.round(ctx.state.reputation * 100),
      ctx.state.derived.clearPerHit,
      ctx.state.derived.swipeEnabled ? 1 : 0,
      ctx.state.derived.botCount,
      muted ? 1 : 0,
      upgradeState,
      skillState,
    ].join('~');
  }

  function rememberScroll(): { rootLeft: number; shopTop: number; skillTop: number } {
    return {
      rootLeft: root.scrollLeft,
      shopTop: root.querySelector<HTMLElement>('.shop-panel')?.scrollTop ?? 0,
      skillTop: root.querySelector<HTMLElement>('.skill-panel')?.scrollTop ?? 0,
    };
  }

  function restoreScroll(saved: { rootLeft: number; shopTop: number; skillTop: number }): void {
    requestAnimationFrame(() => {
      root.scrollLeft = saved.rootLeft;
      const shop = root.querySelector<HTMLElement>('.shop-panel');
      const skill = root.querySelector<HTMLElement>('.skill-panel');
      if (shop) shop.scrollTop = saved.shopTop;
      if (skill) skill.scrollTop = saved.skillTop;
    });
  }

  function render(force = false): void {
    const nextSignature = signature();
    if (!force && nextSignature === lastSignature) {
      return;
    }
    const savedScroll = rememberScroll();
    const xpRatio = Math.min(1, ctx.state.xp / Math.max(1, ctx.state.xpToNext));
    root.innerHTML = `
      <section class="hud-panel">
        <div class="hud-main">
          <div>
            <label>等级</label>
            <strong>${ctx.state.level}</strong>
          </div>
          <div>
            <label>现金</label>
            <strong>${formatNumber(ctx.state.points)}元</strong>
          </div>
          <div>
            <label>排队</label>
            <strong>${ctx.state.queue.length}/${ctx.state.queueCapacity}</strong>
          </div>
        </div>
        <div class="xp-bar"><span style="width:${xpRatio * 100}%"></span></div>
        <div class="rep-row"><span>声誉</span><span class="stars">${stars()}</span></div>
        <div class="effect-row">
          <span>每次清 ${formatNumber(ctx.state.derived.clearPerHit)}</span>
          <span>${ctx.state.derived.swipeEnabled ? '按住滑动清' : '买手势解锁滑动'}</span>
          <span>学徒 ${ctx.state.derived.botCount}</span>
        </div>
      </section>
      <section class="shop-panel">
        <header>升级</header>
        <div class="upgrade-list">${upgradesHtml()}</div>
      </section>
      <section class="skill-panel">
        <header>技能</header>
        <div class="skill-list">${skillsHtml()}</div>
      </section>
      <section class="control-panel">
        <button class="icon-command" data-action="mute" title="切换声音">${muted ? '开声' : '静音'}</button>
        <button class="icon-command danger" data-action="reset" title="重置本地存档">重置</button>
        <small>底部面板可左右滑动查看更多</small>
      </section>
    `;
    lastSignature = nextSignature;
    restoreScroll(savedScroll);
  }

  function holdInteraction(): void {
    interactionHoldUntil = performance.now() + 700;
  }

  function scroll(): void {
    holdInteraction();
    if (root.scrollLeft > 8) {
      root.classList.add('has-scrolled');
    }
  }

  function click(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const button = target.closest('button') as HTMLButtonElement | null;
    if (!button) {
      return;
    }
    const upgrade = button.dataset.upgrade;
    const skill = button.dataset.skill;
    const action = button.dataset.action;
    if (upgrade) {
      ctx.bus.emit({ type: 'BUY_UPGRADE', id: upgrade });
      render(true);
    }
    if (skill) {
      ctx.bus.emit({ type: 'USE_SKILL', id: skill });
      render(true);
    }
    if (action === 'mute') {
      muted = !muted;
      localStorage.setItem('badge-buster-muted', muted ? '1' : '0');
      window.dispatchEvent(new CustomEvent('badge-buster-toggle-audio', { detail: { muted } }));
      render(true);
    }
    if (action === 'reset' && confirm('确定要重置《角标清理铺》的本地进度吗？')) {
      localStorage.removeItem('badge-buster-shop:v1');
      location.reload();
    }
  }

  return {
    name: 'ui',
    init(context) {
      ctx = context;
      const found = document.getElementById('ui-root');
      if (!found) {
        throw new Error('找不到 #ui-root');
      }
      root = found;
      root.addEventListener('click', click);
      root.addEventListener('pointerdown', holdInteraction, { passive: true });
      root.addEventListener('scroll', scroll, { passive: true });
      render(true);
    },
    update(dt) {
      accumulator += dt;
      if (accumulator > 250) {
        accumulator = 0;
        if (performance.now() >= interactionHoldUntil) {
          render();
        }
      }
    },
    destroy() {
      root.removeEventListener('click', click);
      root.removeEventListener('pointerdown', holdInteraction);
      root.removeEventListener('scroll', scroll);
    },
  };
}
