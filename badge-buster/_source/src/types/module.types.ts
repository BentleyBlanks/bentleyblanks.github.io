// module.types.ts
import type { GameState } from './state.types';
import type { EventBus } from './events.types';
import type { AppIconDef, UpgradeDef, SkillDef, CustomerDef } from './content.types';
import type { AssetManifest } from './assets.types';

export interface GameContext {
  state: GameState;
  bus: EventBus;
  content: {
    icons: AppIconDef[];
    upgrades: UpgradeDef[];
    skills: SkillDef[];
    customers: CustomerDef[];
  };
  assets: AssetManifest;
  canvas: HTMLCanvasElement;
  ctx2d: CanvasRenderingContext2D;
  /** DOM 覆盖层根节点（UI 模块挂载点） */
  uiRoot: HTMLElement;
  /** 当前时刻（ms）。统一时钟，避免各模块各取 performance.now 漂移 */
  now: () => number;
}

export interface GameModule {
  name: string;
  init(ctx: GameContext): void;
  update?(dt: number): void;
  destroy?(): void;
}
