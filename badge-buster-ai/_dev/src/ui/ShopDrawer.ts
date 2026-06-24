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
    const step = 168;
    const w = PRODUCERS.length * step + pad * 2;
    const h = 142;
    const bg = new Graphics();
    bg.roundRect(4, 6, w, h, 16).fill({ color: 0x000000, alpha: 0.25 });
    bg.roundRect(0, 0, w, h, 16).fill({ color: COLORS.wood1 });
    bg.roundRect(0, 0, w, h, 16).stroke({ color: COLORS.brass, width: 2 });
    bg.roundRect(8, 8, w - 16, 22, 7).fill({ color: COLORS.brass, alpha: 0.16 }); // drawer header
    this.addChild(bg);
    const title = new Text({
      text: '🧰 帮手商店 · 花算力雇自动小帮手',
      style: new TextStyle({ fontFamily: 'PingFang SC, sans-serif', fontSize: 12, fontWeight: '800', fill: COLORS.brassHi }),
    });
    title.position.set(pad, 13);
    this.addChild(title);

    PRODUCERS.forEach((def, i) => {
      const chip = new ItemChip({
        emoji: def.emoji,
        name: def.name,
        accent: COLORS.acc2,
        read: () => {
          const owned = store.getState().producers[def.id] ?? 0;
          const cost = producerCost(def, owned);
          return { effect: def.desc, badge: `拥有 ×${owned}`, cost: fmt(cost), affordable: store.getState().compute >= cost, maxed: false };
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
