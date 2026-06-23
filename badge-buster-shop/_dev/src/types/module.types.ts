import type { AssetManifest } from './assets.types';
import type { AppIconDef, CustomerDef, SkillDef, UpgradeDef } from './content.types';
import type { EventBus } from './events.types';
import type { GameState } from './state.types';

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
}

export interface GameModule {
  name: string;
  init(ctx: GameContext): void;
  update?(dt: number): void;
  destroy?(): void;
}
