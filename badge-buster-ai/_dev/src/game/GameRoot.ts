import { Application, Container } from 'pixi.js';
import { WORLD_W, WORLD_H } from '../config/theme';
import { createBackground } from '../objects/Background';
import { Phone } from '../objects/Phone';
import { AIFurnace } from '../objects/AIFurnace';
import { TopHud } from '../ui/TopHud';
import { ShopDrawer } from '../ui/ShopDrawer';
import { UpgradeBoard } from '../ui/UpgradeBoard';
import { ParticleSystem } from '../systems/ParticleSystem';
import { FloatingText } from '../ui/FloatingText';
import { CardSpawner } from '../systems/CardSpawner';
import { DigestSystem } from '../systems/DigestSystem';
import { HallucinationSystem } from '../systems/HallucinationSystem';
import { DragSystem } from '../systems/DragSystem';
import { AutomationSystem } from '../systems/AutomationSystem';
import { SaveSystem } from '../systems/SaveSystem';
import { store } from '../state/gameStore';
import type { GameContext, Layers } from './context';

// Assembles the scene graph (§A.3) and drives the unified ticker (§A.5).
export class GameRoot {
  private world = new Container();
  private layers!: Layers;
  private ctx!: GameContext;
  private save = new SaveSystem();
  private uiAcc = 0;

  constructor(private app: Application) {}

  async start() {
    this.app.stage.addChild(this.world);

    // ---- layers in draw order (§A.3) ----
    const mk = () => {
      const c = new Container();
      this.world.addChild(c);
      return c;
    };
    this.layers = {
      background: mk(),
      tableProp: mk(),
      phone: mk(),
      card: mk(),
      machine: mk(),
      particle: mk(),
      floating: mk(),
      hud: mk(),
    };

    this.layers.background.addChild(createBackground());

    // ---- objects ----
    const phone = new Phone();
    phone.position.set(238, 416);
    this.layers.phone.addChild(phone);

    const furnace = new AIFurnace();
    furnace.position.set(1070, 412);
    this.layers.machine.addChild(furnace);

    const hud = new TopHud();
    this.layers.hud.addChild(hud);

    const shop = new ShopDrawer();
    shop.position.set(16, 654);
    this.layers.tableProp.addChild(shop);

    const upgrades = new UpgradeBoard();
    upgrades.position.set(WORLD_W - upgrades.panelWidth - 16, 654);
    this.layers.tableProp.addChild(upgrades);

    const particles = new ParticleSystem(this.layers.particle);
    const floatText = new FloatingText(this.layers.floating);

    // ---- context (filled progressively) ----
    this.ctx = {
      app: this.app,
      world: this.world,
      layers: this.layers,
      particles,
      floatText,
      store,
      furnace,
      phone,
      hud,
      computeAnchor: () => hud.computeAnchor(),
    } as GameContext;

    // ---- systems ----
    const hallu = new HallucinationSystem(this.ctx);
    const spawner = new CardSpawner(this.ctx);
    const digest = new DigestSystem(this.ctx);
    const drag = new DragSystem(this.ctx);
    const automation = new AutomationSystem(this.ctx);
    this.ctx.hallu = hallu;
    this.ctx.spawner = spawner;
    this.ctx.digest = digest;

    // ---- input wiring: click an app icon to burst its badge (§A.6.3) ----
    for (const icon of phone.icons) {
      icon.on('pointertap', () => spawner.popBadge(icon));
    }

    // ---- persistence ----
    this.save.load();
    this.save.attach();

    // seed a couple of badges so the 5-second microloop is reachable instantly
    if (store.getState().totalProcessed === 0) {
      phone.icons[0].addBadge(2);
      phone.icons[3].addBadge(1);
    }

    drag.attach();
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // ---- main loop (§A.5 Ticker 统一驱动) ----
    this.app.ticker.add((t) => {
      const dt = Math.min(0.05, t.deltaMS / 1000);
      spawner.tick(dt);
      automation.tick(dt);
      hallu.tick(dt);
      digest.tick(dt);
      this.save.tick(dt);
      furnace.tickIdle(dt);

      this.uiAcc += dt;
      if (this.uiAcc >= 0.12) {
        this.uiAcc = 0;
        hud.refresh();
        shop.refresh();
        upgrades.refresh();
      }
    });
  }

  private resize() {
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const scale = Math.min(sw / WORLD_W, sh / WORLD_H);
    this.world.scale.set(scale);
    this.world.position.set((sw - WORLD_W * scale) / 2, (sh - WORLD_H * scale) / 2);
    this.app.stage.hitArea = this.app.screen;
  }
}
