import { upgradeCost } from '../content/balance';
import type { GameContext, GameModule } from '../types/module.types';

function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 10_000) return `${Math.floor(value / 1000)}k`;
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
              <small>Lv ${level}${maxed ? ' max' : ''}</small>
            </span>
            <b>${maxed ? 'Done' : `$${formatNumber(cost)}`}</b>
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
        const label = !runtime.unlocked ? `L${skill.unlockLevel}` : remaining > 0 ? `${Math.ceil(remaining / 1000)}s` : 'Use';
        return `
          <button class="skill-button" data-skill="${skill.id}" ${disabled ? 'disabled' : ''} title="${escapeAttr(skill.desc)}">
            <span>${skill.name}</span>
            <b>${label}</b>
          </button>
        `;
      })
      .join('');
  }

  function render(): void {
    const xpRatio = Math.min(1, ctx.state.xp / Math.max(1, ctx.state.xpToNext));
    root.innerHTML = `
      <section class="hud-panel">
        <div class="hud-main">
          <div>
            <label>Level</label>
            <strong>${ctx.state.level}</strong>
          </div>
          <div>
            <label>Cash</label>
            <strong>$${formatNumber(ctx.state.points)}</strong>
          </div>
          <div>
            <label>Queue</label>
            <strong>${ctx.state.queue.length}/${ctx.state.queueCapacity}</strong>
          </div>
        </div>
        <div class="xp-bar"><span style="width:${xpRatio * 100}%"></span></div>
        <div class="rep-row"><span>Reputation</span><span class="stars">${stars()}</span></div>
        <div class="effect-row">
          <span>Hit ${formatNumber(ctx.state.derived.clearPerHit)}</span>
          <span>${ctx.state.derived.swipeEnabled ? 'Swipe on' : 'Tap only'}</span>
          <span>${ctx.state.derived.botCount} bots</span>
        </div>
      </section>
      <section class="shop-panel">
        <header>Upgrades</header>
        <div class="upgrade-list">${upgradesHtml()}</div>
      </section>
      <section class="skill-panel">
        <header>Skills</header>
        <div class="skill-list">${skillsHtml()}</div>
      </section>
      <section class="control-panel">
        <button class="icon-command" data-action="mute" title="Toggle audio">${muted ? 'Unmute' : 'Mute'}</button>
        <button class="icon-command danger" data-action="reset" title="Reset local save">Reset</button>
      </section>
    `;
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
    }
    if (skill) {
      ctx.bus.emit({ type: 'USE_SKILL', id: skill });
    }
    if (action === 'mute') {
      muted = !muted;
      localStorage.setItem('badge-buster-muted', muted ? '1' : '0');
      window.dispatchEvent(new CustomEvent('badge-buster-toggle-audio', { detail: { muted } }));
      render();
    }
    if (action === 'reset' && confirm('Reset Badge Buster Shop progress?')) {
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
        throw new Error('Missing #ui-root');
      }
      root = found;
      root.addEventListener('click', click);
      render();
    },
    update(dt) {
      accumulator += dt;
      if (accumulator > 160) {
        accumulator = 0;
        render();
      }
    },
    destroy() {
      root.removeEventListener('click', click);
    },
  };
}
