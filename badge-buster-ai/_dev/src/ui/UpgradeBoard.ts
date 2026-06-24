import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { COLORS } from '../config/theme';
import { UPGRADES, upgradeCost } from '../config/upgrades';
import { store } from '../state/gameStore';
import { fmt } from '../util/format';
import { ItemChip } from './ItemChip';

// 升级贴纸板 (§2.5.2 右下). Upgrades shown as stickers / dials / modules.
export class UpgradeBoard extends Container {
  private chips: ItemChip[] = [];
  panelWidth = 0;

  constructor() {
    super();
    const pad = 14;
    const step = 168;
    const w = UPGRADES.length * step + pad * 2;
    const h = 142;
    const bg = new Graphics();
    bg.roundRect(0, 0, w, h, 16).fill({ color: COLORS.panel, alpha: 0.96 }).stroke({ color: COLORS.line, width: 1.5 });
    this.addChild(bg);
    const title = new Text({
      text: '🧩 升级贴纸板 · 事实核查 / 吞吐',
      style: new TextStyle({ fontFamily: 'PingFang SC, sans-serif', fontSize: 12, fontWeight: '800', fill: COLORS.muted }),
    });
    title.position.set(pad, 12);
    this.addChild(title);

    UPGRADES.forEach((def, i) => {
      const chip = new ItemChip({
        emoji: def.emoji,
        name: def.name,
        accent: COLORS.acc,
        read: () => {
          const lvl = store.getState().upgrades[def.id] ?? 0;
          const maxed = lvl >= def.maxLevel;
          const cost = upgradeCost(def, lvl);
          return {
            effect: def.desc,
            badge: `Lv ${lvl}/${def.maxLevel}`,
            cost: fmt(cost),
            affordable: !maxed && store.getState().compute >= cost,
            maxed,
          };
        },
        buy: () => store.getState().buyUpgrade(def.id),
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
