import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as stages from './Data_Stages.mjs';
import * as upgrades from './Data_Upgrades.mjs';

// Exercise the actual game class without loading assets or starting its animation loop.
const source = fs.readFileSync(new URL('./Script_Game.mjs', import.meta.url), 'utf8')
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*"[^"]+";/g, '')
  .replaceAll('export const ', 'const ')
  .replace(/const game = new Game\(\);[\s\S]*$/, 'globalThis.Game = Game;');
const nodes = new Map();
const storage = new Map();
const radios = ['easy', 'standard'].map((value) => ({ value, checked: false }));
function GetNode(id) {
  if (!nodes.has(id)) nodes.set(id, { textContent: '', hidden: false, getContext: () => ({}) });
  return nodes.get(id);
}
const sandbox = {
  ...stages, ...upgrades, console, URLSearchParams,
  document: { getElementById: GetNode, querySelectorAll: () => radios },
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  },
};
vm.runInNewContext(source, sandbox, { filename: 'Script_Game.mjs' });
function CreateGame() {
  const game = new sandbox.Game();
  game.audio = new Proxy({}, { get: () => () => {} });
  for (const method of ['SpawnExplosion', 'StartIncidentReport', 'ClearGiantForm', 'DropCarriedBlock']) game[method] = () => {};
  game.EndGame = (won) => { game.state = won ? 'won' : 'lost'; };
  game.SpawnPlayer(true);
  game.player.protect = 0;
  game.state = 'playing';
  game.map = Array.from({ length: 26 }, () => Array(26).fill(0));
  return game;
}
function HitWithShell(game, options = {}) {
  const shell = {
    x: game.player.x + 10, y: game.player.y + 10, w: 8, h: 8,
    vx: 0, vy: 0, alive: true, arm: 0, traveled: 100, trail: [],
    owner: game.player, isPlayer: true, power: 1, bounceLeft: 0, pierceLeft: 0,
    ...options,
  };
  game.bullets = [shell];
  game.UpdateBullets(0);
  return shell;
}

let game = CreateGame();
assert.equal(game.difficulty, 'easy');
assert.equal(radios[0].checked, true);
assert.equal(game.player.hp, undefined);
const safeShell = HitWithShell(game);
assert.equal(game.player.alive, true);
assert.equal(game.lives, 3);
assert.equal(safeShell.alive, true, 'easy shells pass through the player');
HitWithShell(game, { owner: { alive: false }, meteor: true, power: 3 });
assert.equal(game.lives, 3, 'shells from before respawn stay safe');
game.absorbHits = game.player.absorbHits = 2;
game.DamagePlayer({ source: 'self' });
assert.equal(game.absorbHits, 2, 'self shots must not spend earned armor');

game = CreateGame();
game.SetDifficulty('standard');
HitWithShell(game, { arm: 0.2, traveled: 0 });
assert.equal(game.lives, 3, 'outgoing shells clear the barrel safely');
HitWithShell(game);
assert.equal(game.lives, 2);
assert.equal(game.player.alive, false);
game.DamagePlayer();
assert.equal(game.lives, 2, 'one death cannot spend multiple lives');
assert.equal(GetNode('livesValue').textContent, '2');
assert.equal(GetNode('mobileLives').textContent, '2');

for (const difficulty of ['easy', 'standard']) {
  for (const power of [1, 3]) {
    game = CreateGame();
    game.SetDifficulty(difficulty);
    HitWithShell(game, { isPlayer: false, owner: {}, power });
    assert.equal(game.lives, 2, `${difficulty}: enemy power ${power} costs one life`);
    assert.equal(game.player.alive, false);
  }
}
game = CreateGame();
game.player.protect = 1;
HitWithShell(game, { isPlayer: false, owner: {} });
assert.equal(game.lives, 3, 'spawn shield remains effective');
game.player.protect = 0;
game.absorbHits = game.player.absorbHits = 1;
HitWithShell(game, { isPlayer: false, owner: {} });
assert.equal(game.lives, 3);
assert.equal(game.absorbHits, 0);
game.player.protect = 0;
game.DamagePlayer({ source: 'bomb' });
assert.equal(game.lives, 2, 'bombs cost one unprotected life');
game = CreateGame();
game.SetDifficulty('standard');
game.stagePerk = 'noSelfHit';
HitWithShell(game);
assert.equal(game.lives, 3, 'standard mode safety perk still works');

game = CreateGame();
game.lives = 1;
game.DamagePlayer();
assert.equal(game.lives, 0);
assert.equal(game.state, 'lost');
game = CreateGame();
game.SetDifficulty('standard');
game.SaveStageCheckpoint();
assert.equal(game.ReadStageCheckpoint().difficulty, 'standard');
assert.equal(game.ReadStageCheckpoint().playerStats.hp, undefined);
game.StartGame = () => {};
game.SetDifficulty('easy');
game.lives = 0;
assert.equal(game.RestoreStageCheckpoint(), true);
assert.equal(game.difficulty, 'standard');
assert.equal(game.lives, 3);
game.SetDifficulty('easy');
assert.equal(game.ContinueCampaign(), true);
assert.equal(game.difficulty, 'standard');
const legacy = JSON.parse(storage.get('gravitytank_campaign_v09'));
delete legacy.difficulty;
legacy.playerStats.hp = 3;
storage.set('gravitytank_campaign_v09', JSON.stringify(legacy));
assert.equal(game.ContinueCampaign(), true);
assert.equal(game.difficulty, 'easy', 'legacy saves default to easy mode');
assert.equal(game.stageCheckpoint.playerStats.hp, undefined);
console.log('PASS: easy/standard shells, one-hit lives, armor, shields, bombs, HUD, failure, and checkpoint compatibility');
