import { clearState } from '../core/persistence';
import { computeGameLayout } from '../shared/layout';
import { computeUiLayout, rectHit } from '../shared/uiLayout';
import type { GameEvent } from '../types/events.types';
import type { GameContext, GameModule } from '../types/module.types';

// 画布内的 UI 交互层：HUD 与按钮由 render 绘制，这里只负责命中与开关弹窗面板。
// 必须排在 core 之前订阅，命中 UI 时把 event.consumed = true，阻止穿透到清角标。
export function createUiModule(): GameModule {
  let ctx: GameContext;

  function layout() {
    return computeUiLayout(
      ctx.state,
      ctx.canvas.clientWidth,
      ctx.canvas.clientHeight,
      ctx.content.upgrades.map((u) => u.id),
      ctx.content.skills.map((s) => s.id),
    );
  }

  function toggleMute(): void {
    const muted = localStorage.getItem('badge-buster-muted') === '1';
    const next = !muted;
    localStorage.setItem('badge-buster-muted', next ? '1' : '0');
    window.dispatchEvent(new CustomEvent('badge-buster-toggle-audio', { detail: { muted: next } }));
  }

  function onTap(event: Extract<GameEvent, { type: 'TAP' }>): void {
    const ui = layout();
    if (ui.modal.open) {
      event.consumed = true;
      const m = ui.modal;
      if (rectHit(m.close, event.x, event.y)) {
        ctx.state.ui.modal = 'none';
        return;
      }
      for (const row of m.rows) {
        if (!rectHit(row.rect, event.x, event.y)) {
          continue;
        }
        if (m.kind === 'shop') {
          ctx.bus.emit({ type: 'BUY_UPGRADE', id: row.id });
        } else if (m.kind === 'skills') {
          ctx.bus.emit({ type: 'USE_SKILL', id: row.id });
        } else if (row.id === 'mute') {
          toggleMute();
        } else if (row.id === 'reset') {
          if (window.confirm('确定要重置《角标清理铺》的本地进度吗？')) {
            clearState();
            location.reload();
          }
        }
        return;
      }
      // 点面板外（背景）关闭；点面板内空白处保持打开
      if (!rectHit(m.panel, event.x, event.y)) {
        ctx.state.ui.modal = 'none';
      }
      return;
    }

    for (const btn of ui.buttons) {
      if (rectHit(btn.rect, event.x, event.y)) {
        ctx.state.ui.modal = btn.id;
        event.consumed = true;
        return;
      }
    }

    // 工位切换标签（多台手机时）
    const game = computeGameLayout(ctx.state, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
    for (const tab of game.slotTabs) {
      if (rectHit(tab.rect, event.x, event.y)) {
        ctx.state.ui.focusedSlot = tab.index;
        event.consumed = true;
        return;
      }
    }
  }

  function onSwipe(event: Extract<GameEvent, { type: 'SWIPE' }>): void {
    if (ctx.state.ui.modal !== 'none') {
      event.consumed = true;
    }
  }

  return {
    name: 'ui',
    init(context) {
      ctx = context;
      ctx.bus.on('TAP', onTap);
      ctx.bus.on('SWIPE', onSwipe);
    },
  };
}
