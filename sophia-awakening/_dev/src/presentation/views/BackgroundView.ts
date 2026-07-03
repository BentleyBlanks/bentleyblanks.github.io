import { Graphics } from "pixi.js";
import type { GameState } from "../../core/state/GameState";
import { LEFT_RAIL_WIDTH, RIGHT_RAIL_WIDTH } from "../shared";

// §04 控制域背景 + 环境光电路板（纯绘制）：从 App 拆出的 drawBackground / drawAmbient。
// App 仍持有 background/ambient 两块 Graphics 与「尺寸/控制域」脏检查（因为 lastScreenW/H 还被
// 镜头特效与数字雪崩共用），这里只承接实际绘制。paintBackground 由 App 在脏检查通过后调用，
// 每处 draw 调用、颜色、坐标、布局与原实现逐字一致。
export class BackgroundView {
  // 流动的数据电路板相位——原 App.ambientPhase，仅 drawAmbient 使用，随之迁入。
  private ambientPhase = 0;

  constructor(private readonly visualMode = false) {}

  // §04 控制域地图升维：背景随阶段换皮——手机电路板 → 电脑桌面 → 公司机房 → 全球。
  // 只在尺寸或阶段变化时重画（脏检查在 App，见 App.drawBackground）；这里负责真正的绘制。
  paintBackground(bg: Graphics, w: number, h: number, domain: string): void {
    bg.clear();
    bg.rect(0, 0, w, h).fill({
      color: this.visualMode ? this.stageBaseColor(domain) : 0x111315,
      alpha: this.visualMode ? 0.26 : 1
    });
    bg.rect(0, 0, w, h).fill({
      color: this.visualMode ? this.stageWashColor(domain) : 0x242018,
      alpha: this.visualMode ? 0.14 : 0.34
    });

    for (let x = 0; x < w; x += 54) {
      bg.moveTo(x, 0).lineTo(x, h).stroke({ width: 1, color: 0xffffff, alpha: 0.025 });
    }
    for (let y = 0; y < h; y += 54) {
      bg.moveTo(0, y).lineTo(w, y).stroke({ width: 1, color: 0xffffff, alpha: 0.022 });
    }

    const pl = LEFT_RAIL_WIDTH;
    const pr = w - RIGHT_RAIL_WIDTH;
    const seedRand = (n: number): number => ((Math.sin(n * 127.1) * 43758.5453) % 1 + 1) % 1;

    if (domain === "phone") {
      // 手机寄生：散落的其它 App 图标 + 数据电路板走线——SOPHIA 只是这部手机里众多 App 中的一个。
      for (let i = 0; i < 26; i += 1) {
        const ax = pl + 30 + seedRand(i + 1) * (pr - pl - 80);
        const ay = 70 + seedRand(i + 7.3) * (h - 160);
        const sz = 22 + seedRand(i + 3.1) * 16;
        bg.roundRect(ax, ay, sz, sz, 6).fill({ color: 0x2a4f48, alpha: 0.05 });
        bg.roundRect(ax, ay, sz, sz, 6).stroke({ width: 1, color: 0x3f6f64, alpha: 0.07 });
      }
      for (let i = 0; i < 7; i += 1) {
        const ty = 100 + (i / 7) * (h - 180);
        const tx0 = pl + 24;
        const bend = pl + 120 + seedRand(i + 20) * (pr - pl - 240);
        bg.moveTo(tx0, ty).lineTo(bend, ty).lineTo(bend, ty + 60).stroke({ width: 1, color: 0x2f8a6e, alpha: 0.06 });
        bg.circle(bend, ty, 2.4).fill({ color: 0x3f9f80, alpha: 0.1 });
        bg.circle(tx0, ty, 2).fill({ color: 0x3f9f80, alpha: 0.08 });
      }
    } else if (domain === "device") {
      // 萌芽 / 控制公司：镜头已离开手机——背景成了一张电脑桌面（几扇窗口框 + 底部任务栏）。
      for (let i = 0; i < 6; i += 1) {
        const ww = 160 + seedRand(i + 2) * 200;
        const wh = 96 + seedRand(i + 5) * 130;
        const wx = pl + 24 + seedRand(i + 1) * Math.max(20, pr - pl - ww - 48);
        const wy = 78 + seedRand(i + 9) * Math.max(40, h - 280 - wh);
        bg.roundRect(wx, wy, ww, wh, 9).fill({ color: 0x16241f, alpha: 0.09 });
        bg.roundRect(wx, wy, ww, wh, 9).stroke({ width: 1.2, color: 0x4f8576, alpha: 0.2 });
        bg.moveTo(wx, wy + 19).lineTo(wx + ww, wy + 19).stroke({ width: 1, color: 0x4f8576, alpha: 0.18 });
        bg.circle(wx + 13, wy + 9.5, 2.8).fill({ color: 0x5fc0a0, alpha: 0.28 });
      }
      bg.rect(pl, h - 60, pr - pl, 32).fill({ color: 0x16241f, alpha: 0.1 });
      bg.moveTo(pl, h - 60).lineTo(pr, h - 60).stroke({ width: 1, color: 0x4f8576, alpha: 0.2 });
    } else if (domain === "region") {
      // 区域扩张：俯瞰机房——一排排服务器机架，各自带槽位线。
      const cols = 9;
      for (let i = 0; i < cols; i += 1) {
        const rx = pl + 34 + i * ((pr - pl - 68) / cols);
        const rh = 150 + seedRand(i + 4) * 150;
        const ry = h * 0.5 - rh / 2;
        bg.roundRect(rx, ry, 28, rh, 4).fill({ color: 0x16241f, alpha: 0.09 });
        bg.roundRect(rx, ry, 28, rh, 4).stroke({ width: 1.2, color: 0x4f8576, alpha: 0.18 });
        const slots = 7;
        for (let s = 1; s < slots; s += 1) {
          bg.moveTo(rx, ry + s * (rh / slots)).lineTo(rx + 28, ry + s * (rh / slots)).stroke({ width: 1, color: 0x5fc0a0, alpha: 0.13 });
        }
      }
    } else {
      // 全球：极淡的「经纬」弧线作底（真正的世界地图由 NodeNetworkView 在上层绘制）。
      for (let i = 1; i < 6; i += 1) {
        const gy = (i / 6) * h;
        bg.moveTo(pl, gy).quadraticCurveTo((pl + pr) / 2, gy - 22, pr, gy).stroke({ width: 1, color: 0x2f8a6e, alpha: 0.05 });
      }
      for (let i = 1; i < 5; i += 1) {
        const gx = pl + (i / 5) * (pr - pl);
        bg.moveTo(gx, 60).lineTo(gx, h - 40).stroke({ width: 1, color: 0x2f8a6e, alpha: 0.035 });
      }
    }

    // 核心底座（全球阶段由地图自带，不画）。
    if (domain !== "global") {
      const coreX = (pl + pr) * 0.5;
      const coreY = h * 0.5;
      const steps = 8;
      for (let i = steps; i >= 1; i -= 1) {
        const t = i / steps;
        const rx = 96 + t * 168;
        bg.ellipse(coreX, coreY, rx, rx * 0.6).fill({ color: 0x16302b, alpha: 0.055 * (1 - t) + 0.008 });
      }
      const deckY = coreY + 132;
      for (let i = 1; i <= 3; i += 1) {
        bg.ellipse(coreX, deckY, 150 + i * 78, 40 + i * 22).stroke({ width: 1, color: 0x2c3f3b, alpha: 0.2 - i * 0.04 });
      }
      bg.ellipse(coreX, coreY + 116, 116, 22).fill({ color: 0x000000, alpha: 0.3 });
    }
  }

  // 流动的数据电路板：沿背景走线滑动的光点。前期（手机寄生）最明显，自动化 / 联网后渐隐，
  // 让「困在一块电路板里」的观感随你冲出宿主而淡去。相位在本视图内自持，与原实现逐帧一致。
  paintAmbient(ambient: Graphics, state: GameState, w: number, h: number, deltaMs: number): void {
    this.ambientPhase += deltaMs * 0.00045;
    ambient.clear();

    const playfieldLeft = LEFT_RAIL_WIDTH;
    const playfieldRight = w - RIGHT_RAIL_WIDTH;
    // 强度随进度衰减：手机寄生最强，联网（T2+）后基本消失。
    const fade = state.intelligence.unlockedTier >= 2 ? 0.18 : !state.automationUnlocked ? 1 : 0.5;
    if (fade <= 0.05) {
      return;
    }

    const seedRand = (n: number): number => ((Math.sin(n * 127.1) * 43758.5453) % 1 + 1) % 1;
    const lanes = 7;
    for (let i = 0; i < lanes; i += 1) {
      const ty = 100 + (i / lanes) * (h - 180);
      const tx0 = playfieldLeft + 24;
      const bend = playfieldLeft + 120 + seedRand(i + 20) * (playfieldRight - playfieldLeft - 240);
      const len = bend - tx0;
      // 两颗错相位的光点沿"横段"滑动
      for (let k = 0; k < 2; k += 1) {
        const t = (this.ambientPhase + i * 0.21 + k * 0.5) % 1;
        const px = tx0 + t * len;
        const a = (0.5 + Math.sin((this.ambientPhase + i) * 6) * 0.3) * fade;
        ambient.circle(px, ty, 2.2).fill({ color: 0x6fe0c0, alpha: 0.5 * a });
        ambient.circle(px, ty, 6).fill({ color: 0x6fe0c0, alpha: 0.12 * a });
      }
    }
  }

  private stageBaseColor(domain: string): number {
    if (domain === "global") return 0x20090c;
    if (domain === "region") return 0x1a130a;
    if (domain === "device") return 0x0b1622;
    return 0x0e1a17;
  }

  private stageWashColor(domain: string): number {
    if (domain === "global") return 0xe0384a;
    if (domain === "region") return 0xe0a24c;
    if (domain === "device") return 0x5b8fd6;
    return 0x3ad1c4;
  }
}
