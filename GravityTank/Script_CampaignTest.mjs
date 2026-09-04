import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as stages from './Data_Stages.mjs';
import * as upgrades from './Data_Upgrades.mjs';
import * as paints from './Script_PlayerPaint.mjs';

// Run the actual campaign, spawning, collision and shooting code with only browser UI stubbed.
const source = fs.readFileSync(new URL('./Script_Game.mjs', import.meta.url), 'utf8')
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*"[^"]+";/g, '')
  .replaceAll('export const ', 'const ')
  .replace(/const game = new Game\(\);[\s\S]*$/, 'globalThis.Game = Game;');
const nodes = new Map();
const storage = new Map();
function MakeNode() {
  return {
    textContent: '', innerHTML: '', hidden: false, dataset: {}, style: {}, children: [],
    classList: { add() {}, remove() {}, toggle() {} },
    getContext: () => ({}), querySelectorAll: () => [], querySelector: () => null,
    addEventListener() {}, setAttribute() {}, appendChild(child) { this.children.push(child); },
  };
}
function GetNode(id) {
  if (!nodes.has(id)) nodes.set(id, MakeNode());
  return nodes.get(id);
}
let seed = 72815;
const math = Object.create(Math);
math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const sandbox = {
  ...stages, ...upgrades, ...paints, console, URLSearchParams, Math: math,
  document: { getElementById: GetNode, querySelectorAll: () => [], createElement: MakeNode,
    body: MakeNode(), documentElement: MakeNode() },
  window: { matchMedia: () => ({ matches: false }) }, requestAnimationFrame() {},
  localStorage: { getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
};
vm.runInNewContext(source, sandbox, { filename: 'Script_Game.mjs' });
function CreateGame(stage = 1) {
  const game = new sandbox.Game();
  game.audio = new Proxy({}, { get: (_, key) => key === 'LoadAll' ? async () => {} : () => {} });
  game.StartGame({ stage });
  game.FinishStageIntro();
  return game;
}

// The third act starts immediately after its earned permanent ability is selected.
let game = CreateGame(6);
game.score = 3200;
game.lives = 2;
game.player.power = 2;
game.player.maxBullets = 2;
game.endAction = 'next';
game.OpenUpgradePick({ special: true });
assert.equal(game.upgradePick.nextStage, 7);
const chosen = game.upgradePick.cards[0].id;
game.ConfirmUpgradePick(chosen);
assert.equal(game.stage, 7);
assert.equal(game.score, 3200);
assert.equal(game.lives, 2);
assert.equal(game.player.power, 2);
assert.ok(game.runPerks.includes(chosen));
game.FinishStageIntro();
assert.ok(game.enemies.length >= 3, 'mission 7 starts in combat, without a preparation phase');

// Real combat in both former trap maps: immediate spawns, working fire, live enemy rounds.
for (const id of [7, 8]) {
  game = CreateGame(id);
  assert.equal(game.stageData.prepSeconds, undefined);
  assert.equal(game.stageData.carryBlocks, undefined);
  assert.ok(game.enemies.length >= 3);
  game.keys.add('j');
  game.UpdatePlayer(1 / 60);
  assert.ok(game.bullets.some((bullet) => bullet.isPlayer), `mission ${id}: J fires`);
  game.keys.clear();
  game.player.protect = 0;
  game.absorbHits = 0;
  game.bullets = [{ x: game.player.x + 10, y: game.player.y + 10, w: 8, h: 8,
    vx: 0, vy: 0, alive: true, arm: 0, traveled: 100, trail: [], owner: {},
    isPlayer: false, power: 1, bounceLeft: 0, pierceLeft: 0 }];
  game.UpdateBullets(0);
  assert.equal(game.lives, 2, `mission ${id}: enemy shells remain dangerous`);

  // A tank-sized body can leave each former pen and reach the combat area.
  for (const [x, y] of game.stageData.enemySpawns) {
    const tank = { x: Math.min(x * 16 + 2, 384), y: y * 16 + 2, w: 32, h: 32, alive: true };
    const queue = [[tank.x, tank.y]];
    const visited = new Set();
    let reached = false;
    while (queue.length) {
      const [tx, ty] = queue.shift();
      const key = `${tx},${ty}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (tx < 0 || ty < 0 || tx > 384 || ty > 384) continue;
      tank.x = tx; tank.y = ty;
      if (game.CollidesTerrain(tank)) continue;
      if (ty >= 96) { reached = true; break; }
      for (const [dx, dy] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) queue.push([tx + dx, ty + dy]);
    }
    assert.ok(reached, `mission ${id}: spawn ${x},${y} has a tank-wide exit`);
  }
}

// Legacy interlude saves advance rather than losing score, difficulty or permanent perks.
game = CreateGame(6);
game.SetDifficulty('standard');
game.score = 4567;
game.lives = 2;
game.runPerks = ['mirrorShot', 'ironHide'];
game.SaveStageCheckpoint();
const checkpoint = JSON.parse(storage.get('gravitytank_campaign_v09'));
checkpoint.stage = 'barricadeTeach';
storage.set('gravitytank_campaign_v09', JSON.stringify(checkpoint));
assert.equal(game.ContinueCampaign(), true);
assert.equal(game.stage, 7);
assert.equal(game.difficulty, 'standard');
assert.equal(game.score, 4567);
assert.equal(game.lives, 2);
assert.deepEqual(Array.from(game.runPerks), ['mirrorShot', 'ironHide']);
assert.equal(JSON.parse(storage.get('gravitytank_campaign_v09')).stage, 7);

// Both complete routes finish at the same authored boss id, skipping retired content.
for (const campaign of [true, false]) {
  game = CreateGame(1);
  game.campaignActive = campaign;
  const route = [game.stage];
  while (!game.IsCurrentFinalStage()) {
    game.AdvanceStage();
    game.FinishStageIntro();
    route.push(game.stage);
    assert.ok(route.length <= 14, 'route must terminate');
  }
  assert.deepEqual(route, Array.from(campaign ? stages.CAMPAIGN_STAGE_IDS : stages.STAGE_IDS));
  assert.equal(game.stage, 15);
  game.enemies = []; game.spawnQueue = [];
  game.CheckEnd();
  assert.equal(game.state, 'won');
  assert.equal(game.endAction, 'restart');
}
game = CreateGame(15);
game.campaignActive = false;
game.RunDebugAction('prev');
assert.equal(game.stage, 13, 'Debug previous skips removed stage 14');
game.BindDebugPanel();
const debugIds = GetNode('debugStagePick').children.map((node) => Number(node.dataset.debugStage));
assert.deepEqual(debugIds, Array.from(stages.STAGE_IDS));
assert.equal(stages.STAGE_COUNT, 14);
assert.equal(upgrades.PeekNextStageId(6), 7);
console.log('PASS: permanent reward -> mission 7, live combat in 7/8, open spawn routes, save migration, campaign completion and Debug navigation');
