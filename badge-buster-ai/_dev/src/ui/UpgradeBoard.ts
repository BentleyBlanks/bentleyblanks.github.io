import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { COLORS } from '../config/theme';
import { UPGRADES, upgradeCost } from '../config/upgrades';
import { store } from '../state/gameStore';
import { fmt } from '../util/format';
import { ItemChip } from './ItemChip';

// 工作台升级 (§2.5.2 右下). Upgrades shown as paper stickers on a wooden board.
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
    bg.roundRect(4, 6, w, h, 16).fill({ color: 0x000000, alpha: 0.25 });
    bg.roundRect(0, 0, w, h, 16).fill({ color: COLORS.wood1 });
    bg.roundRect(0, 0, w, h, 16).stroke({ color: COLORS.brass, width: 2 });
    bg.roundRect(8, 8, w - 16, 22, 7).fill({ color: COLORS.brass, alpha: 0.16 });
    this.addChild(bg);
    const title = new Text({
      text: '🔧 工作台升级 · 让你处理得更快更准',
      style: new TextStyle({ fontFamily: 'PingFang SC, sans-serif', fontSize: 12, fontWeight: '800', fill: COLORS.brassHi }),
    });
    title.position.set(pad, 13);
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
