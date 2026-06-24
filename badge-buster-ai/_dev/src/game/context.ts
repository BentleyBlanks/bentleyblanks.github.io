import type { Application, Container } from 'pixi.js';
import type { ParticleSystem } from '../systems/ParticleSystem';
import type { FloatingText } from '../ui/FloatingText';
import type { store } from '../state/gameStore';
import type { AIFurnace } from '../objects/AIFurnace';
import type { Phone } from '../objects/Phone';
import type { Host } from '../objects/Host';
import type { TopHud } from '../ui/TopHud';
import type { CardSpawner } from '../systems/CardSpawner';
import type { DigestSystem } from '../systems/DigestSystem';
import type { HallucinationSystem } from '../systems/HallucinationSystem';
import type { SweeperSwarm } from '../systems/SweeperSwarm';

// Scene layers (§A.3 PixiJS 场景分层). Order = draw order.
export interface Layers {
  background: Container;
  tableProp: Container;
  phone: Container;
  card: Container;
  machine: Container;
  particle: Container;
  floating: Container;
  hud: Container;
}

// Wiring hub passed to every system. Filled in by GameRoot.
export interface GameContext {
  app: Application;
  world: Container;
  layers: Layers;
  particles: ParticleSystem;
  floatText: FloatingText;
  store: typeof store;
  furnace: AIFurnace;
  phone: Phone;
  host: Host;
  hud: TopHud;
  spawner: CardSpawner;
  digest: DigestSystem;
  hallu: HallucinationSystem;
  swarm: SweeperSwarm;
  /** world-space position of the compute readout, for chip-flight targeting. */
  computeAnchor: () => { x: number; y: number };
}
