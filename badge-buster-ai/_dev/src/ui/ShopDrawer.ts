import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { COLORS } from '../config/theme';
import { PRODUCERS, producerCost } from '../config/upgrades';
import { store } from '../state/gameStore';
import { fmt } from '../util/format';
import { ItemChip } from './ItemChip';

// 商店抽屉 (§2.5.2 左下). Producers / auto-agents shown as drawer parts.
export class ShopDrawer extends Container {
  private chips: ItemChip[] = [];
  panelWidth = 0;

  constructor() {
    super();
    const pad = 14;
    const step = 162;
    const w = PRODUCERS.length * step + pad * 2;
    const h = 124;
    const bg = new Graphics();
    bg.roundRect(0, 0, w, h, 16).fill({ color: COLORS.panel, alpha: 0.96 }).stroke({ color: COLORS.line, width: 1.5 });
    bg.roundRect(6, 6, w - 12, 4, 2).fill({ color: COLORS.acc2, alpha: 0.5 }); // drawer lip
    this.addChild(bg);
    const title = new Text({
      text: '🗄 商店抽屉 · 自动代理',
      style: new TextStyle({ fontFamily: 'PingFang SC, sans-serif', fontSize: 12, fontWeight: '800', fill: COLORS.muted }),
    });
    title.position.set(pad, 14);
    this.addChild(title);

    PRODUCERS.forEach((def, i) => {
      const chip = new ItemChip({
        emoji: def.emoji,
        name: def.name,
        accent: COLORS.acc2,
        read: () => {
          const owned = store.getState().producers[def.id] ?? 0;
          const cost = producerCost(def, owned);
          return { cost: fmt(cost), sub: `${def.desc}  ·  ×${owned}`, affordable: store.getState().compute >= cost, maxed: false };
        },
        buy: () => store.getState().buyProducer(def.id),
      });
      chip.position.set(pad + i * step, 36);
      this.addChild(chip);
      this.chips.push(chip);
    });
    this.panelWidth = w;
  }

  refresh() {
    for (const c of this.chips) c.refresh();
  }
}
