import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHAPTERS, PROLOGUE_PANELS, SAVE_KEY } from "./Data_Story.mjs";
import { AIR, GetCell, RebuildTunnelSolids, SOFT } from "./Script_Dig.mjs";
import { ITEM_CHARGE, ITEM_SHOVEL } from "./Script_Items.mjs";
import { CountPlanned, EnsurePlanGrid, IsPlanned, TogglePlanCell } from "./Script_Plan.mjs";
import { DEPTH_MID, PropsBehind, PropsBehindBands, PropsFront, ScaleOf, YLiftOf } from "./Script_Depth.mjs";
import { AirConnected, BuildLevel, EvalDigGoals } from "./Script_World.mjs";
import {
  AdvancePanels,
  CreateCampaignState,
  DebugCarvePath,
  DebugCompleteGoal,
  DebugHold,
  DebugPlanCell,
  GoalsRemaining,
  LoadProgress,
  NextStepText,
  SerializeProgress,
  StepPlay,
} from "./Script_Rules.mjs";
import { BONE_DEFS, CLIPS, SampleClip, SolveBones, PickClip } from "./Script_Puppet.mjs";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));

let failed = 0;
function Assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else console.log("ok:", msg);
}

function Play(i = 0) {
  const state = CreateCampaignState(i);
  state.phase = "play";
  return state;
}

function HatchDown(state, id) {
  const ent = state.level.entities.find((e) => e.id === id);
  DebugHold(state, ITEM_SHOVEL);
  state.player.x = ent.x;
  state.player.y = 0;
  state.player.inTunnel = false;
  state.input.interactPressed = true;
  StepPlay(state, 1 / 30);
  for (let i = 0; i < 60; i++) StepPlay(state, 1 / 30);
  Assert(state.player.inTunnel, `${id} enters tunnel`);
}

function TestStoryBeats() {
  Assert(PROLOGUE_PANELS.length === 3, "prologue is 背景/困难/目标 only");
  Assert(
    PROLOGUE_PANELS.map((p) => p.speaker).join("/") === "背景/困难/目标",
    "prologue speakers plain",
  );
  Assert(CHAPTERS[0].openPanels.length === 0, "act1 skips second slideshow");
  Assert(
    CHAPTERS.slice(1).every((c) => c.openPanels.length === 3),
    "later acts open in 3 beats",
  );
  Assert(
    CHAPTERS.every((c) => c.closePanels.length >= 1 && c.closePanels.length <= 2),
    "closes stay short",
  );
  Assert(CHAPTERS[0].goals.includes("talk_linxia"), "act1 linxia talk");
  Assert(
    CHAPTERS.some((c) => c.openPanels.some((p) => p.speaker === "山田")),
    "Yamada appears in film beats",
  );
  Assert(
    CHAPTERS[1].closePanels.some((p) => /高老忠/.test(p.text)),
    "act2 close remembers 高老忠 martyrdom",
  );
  const rules = readFileSync(join(here, "Script_Rules.mjs"), "utf8");
  Assert(rules.includes("QueueSubtitles"), "bell martyrdom subtitle queue");
  Assert(rules.includes("手榴弹的火光吞没钟架"), "martyrdom line staged in play");

  let s = CreateCampaignState(0);
  s.phase = "prologue";
  s.panelIndex = 0;
  AdvancePanels(s);
  AdvancePanels(s);
  AdvancePanels(s);
  Assert(s.phase === "play", "after 3 prologue clicks → play (no second slideshow)");
}

function TestSoilNotGifted() {
  const level = BuildLevel("act1_connect");
  Assert(!!level.soil, "act1 has soil grid");
  Assert(!!level.soil.plan, "plan grid exists");
  let air = 0;
  let soft = 0;
  for (let r = 0; r < level.soil.rows; r++) {
    for (let c = 0; c < level.soil.cols; c++) {
      const v = GetCell(level.soil, c, r);
      if (v === AIR) air += 1;
      if (v === SOFT) soft += 1;
    }
  }
  Assert(air < 40, `starter air is only cellars (${air} cells)`);
  Assert(soft > 200, `most of band is soft to dig (${soft})`);
  const links = EvalDigGoals(level);
  Assert(!links.link_ab && !links.link_bc, "links incomplete before digging");
}

function TestPlanBeforeExcavate() {
  const state = Play(0);
  HatchDown(state, "hatch1");
  const hatch = state.level.entities.find((e) => e.id === "hatch1");
  state.player.x = hatch.tunnelX + 80;
  state.player.y = hatch.tunnelY;
  state.player.facing = 1;
  state.player.onGround = true;
  DebugHold(state, ITEM_SHOVEL);
  // Wipe tutorial blueprint so this test proves plan-gate still exists.
  EnsurePlanGrid(state.level.soil);
  for (let r = 0; r < state.level.soil.rows; r++) {
    for (let c = 0; c < state.level.soil.cols; c++) state.level.soil.plan[r][c] = false;
  }
  const before = state.stats.cellsCarved;

  // Hold dig must NOT carve (no Terraria hold-to-dig)
  state.input.dig = true;
  for (let i = 0; i < 90; i++) StepPlay(state, 1 / 30);
  Assert(state.stats.cellsCarved === before, "holding J does not carve");

  // Tap dig without plan fails
  state.input.dig = false;
  state.input.digPressed = true;
  StepPlay(state, 1 / 30);
  Assert(state.stats.cellsCarved === before, "tap without blueprint does not carve");

  // Design toggle + paint a soft neighbor of the digger, then excavate
  state.input.designTogglePressed = true;
  StepPlay(state, 1 / 30);
  Assert(state.designMode, "R enters design mode");
  EnsurePlanGrid(state.level.soil);
  // Stand at cellar, pick soft cell immediately next to the digger
  state.player.x = hatch.tunnelX;
  state.player.y = hatch.tunnelY;
  const chest = {
    c: Math.floor((state.player.x - state.level.soil.originX) / state.level.soil.cell),
    r: Math.floor((state.player.y - 24 - state.level.soil.originY) / state.level.soil.cell),
  };
  let target = null;
  for (const [dc, dr] of [
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, 0],
    [0, 1],
  ]) {
    const c = chest.c + dc;
    const r = chest.r + dr;
    if (GetCell(state.level.soil, c, r) === SOFT) {
      target = { c, r };
      break;
    }
  }
  Assert(!!target, "found soft neighbor of digger");
  state.planCursor = { c: target.c, r: target.r };
  state.input.digPressed = true;
  StepPlay(state, 1 / 30);
  Assert(IsPlanned(state.level.soil, target.c, target.r), "J marks blueprint");
  Assert(CountPlanned(state.level.soil) >= 1, "plan count");

  state.input.designTogglePressed = true;
  StepPlay(state, 1 / 30);
  Assert(!state.designMode, "R exits design");

  state.player.x = hatch.tunnelX;
  state.player.y = hatch.tunnelY;
  state.player.facing = target.c >= chest.c ? 1 : -1;
  state.player.vx = 0;
  state.player.vy = 0;
  state.player.onGround = true;
  state.input.digPressed = true;
  StepPlay(state, 1 / 30);
  Assert(state.stats.cellsCarved > before, "tap J excavates planned cell");
  Assert(GetCell(state.level.soil, target.c, target.r) === AIR, "cell became air");
}

function TestAct1TutorialPlayable() {
  const level = BuildLevel("act1_connect");
  const well = level.props.find((p) => p.kind === "well");
  const shovel = level.entities.find((e) => e.kind === "pickup" && e.itemId === ITEM_SHOVEL);
  const hatch = level.entities.find((e) => e.id === "hatch1");
  Assert(!!well && !!shovel, "well + shovel");
  Assert(Math.abs(shovel.x - well.x) < 50, "shovel spawns at well");
  Assert(hatch.needsShovel === true, "hatch requires shovel");
  Assert(!!level.tutorialPlan, "act1 tutorial plan");
  Assert(CountPlanned(level.soil) >= 40, "A→B→C pre-planned with headroom");

  const state = Play(0);
  Assert(/高老忠/.test(NextStepText(state)), "next-step hints talk first");
  state.player.x = hatch.x;
  state.player.y = 0;
  state.player.inTunnel = false;
  state.player.held = null;
  state.input.interactPressed = true;
  StepPlay(state, 1 / 30);
  for (let i = 0; i < 60; i++) StepPlay(state, 1 / 30);
  Assert(!state.player.inTunnel, "cannot hatch without shovel");

  DebugHold(state, ITEM_SHOVEL);
  state.player.x = hatch.x;
  state.player.y = 0;
  state.player.inTunnel = false;
  state.input.interactPressed = true;
  StepPlay(state, 1 / 30);
  for (let i = 0; i < 60; i++) StepPlay(state, 1 / 30);
  Assert(state.player.inTunnel, "hatch opens with shovel");

  // Pre-drawn neighbor should excavate on first J without entering design.
  const before = state.stats.cellsCarved;
  state.player.x = hatch.tunnelX;
  state.player.y = hatch.tunnelY;
  state.player.facing = 1;
  state.player.onGround = true;
  state.input.digPressed = true;
  StepPlay(state, 1 / 30);
  Assert(state.stats.cellsCarved > before, "tutorial blueprint digs without R");

  const html = readFileSync(join(here, "index.html"), "utf8");
  Assert(html.includes('data-touch="corridor"'), "mobile corridor C button");
  Assert(html.includes('id="StepHint"'), "always-on step hint");
}

function TestNaiveAct1Bot() {
  const bot = spawnSync(process.execPath, [join(here, "Script_NaiveAct1Bot.mjs")], {
    encoding: "utf8",
  });
  if (bot.stdout) process.stdout.write(bot.stdout);
  if (bot.stderr) process.stderr.write(bot.stderr);
  Assert(bot.status === 0, "naive Act1 bot finishes all goals");
}

function TestCarveConnectsAct1() {
  const state = Play(0);
  HatchDown(state, "hatch1");
  Assert(state.goalsDone.enter_hatch, "enter");
  DebugCarvePath(state, 5, 3, 23, 3);
  Assert(state.goalsDone.link_ab, "link_ab after carve");
  DebugCarvePath(state, 23, 3, 41, 4);
  Assert(state.goalsDone.link_bc, "link_bc after carve");
  Assert(
    AirConnected(state.level.soil, state.level.digLinks[0].ax, state.level.digLinks[0].ay, state.level.digLinks[1].bx, state.level.digLinks[1].by),
    "full chain air-connected",
  );
}

function TestNoJump() {
  const state = Play(0);
  state.player.onGround = true;
  state.player.vy = 0;
  const y0 = state.player.y;
  state.input.up = true;
  for (let i = 0; i < 20; i++) StepPlay(state, 1 / 30);
  Assert(state.player.y >= y0 - 2, "W/up does not launch into the air");
}

function TestPickupShovelRequired() {
  const state = Play(0);
  const shovel = state.level.entities.find((e) => e.kind === "pickup" && e.itemId === ITEM_SHOVEL);
  Assert(!!shovel, "act1 has shovel on ground");
  Assert(state.player.held == null, "starts empty-handed");
  state.player.x = shovel.x;
  state.player.y = shovel.y;
  state.input.interactPressed = true;
  StepPlay(state, 1 / 30);
  Assert(state.player.held === ITEM_SHOVEL, "E picks up shovel");
}

function TestMultiTalk() {
  const state = Play(0);
  const npc = state.level.entities.find((e) => e.id === "npc_laozhong");
  Assert(npc.script?.length >= 4, "laozhong multi-line script");
  state.player.x = npc.x;
  state.player.y = npc.y;
  state.input.interactPressed = true;
  StepPlay(state, 1 / 30);
  Assert(!npc.done, "first line does not finish talk");
  Assert(state.subtitle?.text, "dialogue text shown in subtitle");
  for (let i = 1; i < npc.script.length; i++) {
    state.input.interactPressed = true;
    StepPlay(state, 1 / 30);
  }
  Assert(npc.done, "talk completes after all lines");
  Assert(state.goalsDone.talk_laozhong, "talk goal marked");
}

function TestAct2MustDigBeforeShelter() {
  const state = Play(1);
  const v1 = state.level.entities.find((e) => e.id === "v1");
  state.player.x = v1.x;
  state.player.y = 0;
  state.player.inTunnel = false;
  state.input.interactPressed = true;
  StepPlay(state, 1 / 30);
  Assert(!state.goalsDone.shelter_a, "cannot shelter before dig link");
  DebugCarvePath(state, 6, 3, 29, 3);
  for (let r = 2; r < 5; r++) {
    for (let c = 28; c < 32; c++) {
      state.level.soil.cells[r][c] = AIR;
      state.level.soil.carved += 1;
    }
  }
  StepPlay(state, 1 / 30);
  Assert(state.goalsDone.dig_safe_room || EvalDigGoals(state.level).dig_safe_room, "safe room carved");
  Assert(state.goalsDone.link_safe || EvalDigGoals(state.level).link_safe, "safe linked");
}

function TestAct4KillInvaders() {
  const state = Play(3);
  Assert(state.chapterId === "act4_ambush", "act4 chapter");
  Assert(CHAPTERS[3].goals.includes("kill_invaders"), "kill_invaders goal");
  Assert(!CHAPTERS[3].goals.includes("break_patrol"), "no abstract patrol checklist");
  const enemies = state.level.entities.filter((e) => e.type === "enemy");
  Assert(enemies.length >= 4, `spawned 鬼子 (${enemies.length})`);
  const ports = state.level.entities.filter((e) => e.type === "shot_port");
  Assert(ports.length === 3 && ports.every((p) => p.layer === "both"), "three dual-layer shot ports");

  for (const g of ["talk_ambush", "enter_spine", "dig_shaft_a", "dig_shaft_b", "dig_shaft_c"]) {
    DebugCompleteGoal(state, g);
  }

  const port = state.level.entities.find((e) => e.id === "port1");
  for (const e of enemies) {
    e.x = port.x + 36;
    e.homeX = port.x + 36;
    e.amp = 0;
    e.alert = 0;
    e.hp = 1;
    e.maxHp = 1;
    e.dead = false;
  }

  state.player.invuln = 99;
  state.input.crouch = true;

  for (let round = 0; round < 16 && !state.goalsDone.kill_invaders; round++) {
    state.transition = 0;
    state._hatchFlipped = false;
    port.cool = 0;
    state.player.inTunnel = true;
    state.player.x = port.x;
    state.player.y = port.tunnelY;
    state.input.interactPressed = true;
    StepPlay(state, 1 / 30);
    for (let i = 0; i < 50; i++) StepPlay(state, 1 / 30);
    Assert(!state.player.inTunnel, `round ${round}: sneak out`);

    state.transition = 0;
    state._hatchFlipped = false;
    port.cool = 0;
    state.player.inTunnel = false;
    state.player.x = port.x;
    state.player.y = 0;
    state.player.invuln = 99;
    state.input.interactPressed = true;
    StepPlay(state, 1 / 30);
    for (let i = 0; i < 50; i++) StepPlay(state, 1 / 30);
    Assert(state.player.inTunnel, `round ${round}: retreat after shot`);
  }

  Assert(state.stats.kills >= enemies.length, `kills recorded (${state.stats.kills})`);
  Assert(enemies.every((e) => e.dead), "all 鬼子 dead");
  Assert(state.goalsDone.kill_invaders, "kill_invaders cleared");
}

function TestAct5PlantNeedsCharge() {
  const state = Play(4);
  Assert(state.player.inTunnel, "act5 starts underground");
  const chargePick = state.level.entities.find((e) => e.kind === "pickup" && e.itemId === ITEM_CHARGE);
  const zone = state.level.entities.find((e) => e.type === "plant_zone");
  Assert(!!chargePick && !!zone, "charge pickup + plant zone");
  DebugCarvePath(state, 4, 4, 49, 4);
  for (let r = 3; r < 5; r++) {
    for (let c = 48; c < 51; c++) state.level.soil.cells[r][c] = AIR;
  }
  RebuildTunnelSolids(state.level);
  StepPlay(state, 1 / 30);
  Assert(state.goalsDone.link_charge || EvalDigGoals(state.level).link_charge, "charge linked after carve");

  state.player.x = zone.x;
  state.player.y = zone.y;
  state.player.vx = 0;
  state.player.vy = 0;
  state.player.onGround = true;
  state.player.held = null;
  state.input.usePressed = true;
  StepPlay(state, 1 / 30);
  Assert(!state.goalsDone.plant_charge, "cannot plant without charge in hand");

  state.player.x = zone.x;
  state.player.y = zone.y;
  state.player.vx = 0;
  state.player.vy = 0;
  state.player.onGround = true;
  state.player.held = ITEM_CHARGE;
  state.input.usePressed = true;
  StepPlay(state, 1 / 30);
  Assert(state.goalsDone.plant_charge, "F plants charge at zone");
}

function TestDepthLayers() {
  const level = BuildLevel("act1_connect");
  Assert(PropsBehind(level.props).length > 8, "back depth props exist");
  Assert(PropsFront(level.props).length > 8, "front occluder props exist");
  Assert(level.props.some((p) => p.depth === DEPTH_MID), "mid depth crop/orchard band");
  Assert(PropsBehindBands(level.props).length >= 2, "multiple behind depth bands");
  Assert(ScaleOf(-3) < ScaleOf(-1) && ScaleOf(-1) < ScaleOf(0) && ScaleOf(0) < ScaleOf(2), "depth scale stack");
  Assert(YLiftOf(-3, 1) < YLiftOf(0, 1) && YLiftOf(0, 1) < YLiftOf(2, 1), "depth Y-lift stack");
  const game = readFileSync(join(here, "Script_Game.mjs"), "utf8");
  Assert(game.includes("DrawDepthVeil"), "atmospheric depth veils");
  Assert(game.includes("PropsBehindBands"), "banded behind draw");
}

function TestChaptersHaveSoil() {
  Assert(CHAPTERS.length === 5, "five acts");
  for (const ch of CHAPTERS) {
    const level = BuildLevel(ch.id);
    Assert(!!level.soil, `${ch.id} soil`);
    Assert(
      level.entities.some((e) => e.kind === "pickup" && e.itemId === ITEM_SHOVEL),
      `${ch.id} has shovel pickup`,
    );
    Assert(level.entities.some((e) => e.type === "talk" && e.script), `${ch.id} has talk script`);
  }
  Assert(SAVE_KEY.endsWith("_v5"), "save v5");
  Assert(LoadProgress(SerializeProgress(Play(0))).chapterIndex === 0, "save");
}


function TestPuppetAnim() {
  Assert(Object.keys(BONE_DEFS).length >= 12, "puppet has bone parts");
  Assert(CLIPS.walk && CLIPS.idle && CLIPS.dig && CLIPS.crouch, "walk/idle/dig/crouch clips");
  const bones = SolveBones(SampleClip("walk", 0.2));
  Assert(bones.hip && bones.head && bones.footL && bones.handR, "solved hierarchy");
  Assert(Math.abs(bones.footL.y) < 12, "feet near ground in rest/walk");
  Assert(PickClip({ digging: true }) === "dig", "dig clip pick");
  Assert(PickClip({ crouching: true }) === "crouch", "crouch clip pick");
  Assert(PickClip({ vx: 40 }) === "walk", "walk clip pick");
  const game = readFileSync(join(here, "Script_Game.mjs"), "utf8");
  Assert(game.includes("DrawPuppet"), "game draws puppet");
  Assert(game.includes("Script_Puppet.mjs"), "game imports puppet");
}

function Main() {
  TestChaptersHaveSoil();
  TestStoryBeats();
  TestPuppetAnim();
  TestDepthLayers();
  TestSoilNotGifted();
  TestAct1TutorialPlayable();
  TestPlanBeforeExcavate();
  TestCarveConnectsAct1();
  TestNoJump();
  TestPickupShovelRequired();
  TestMultiTalk();
  TestAct2MustDigBeforeShelter();
  TestAct4KillInvaders();
  TestAct5PlantNeedsCharge();
  TestNaiveAct1Bot();
  const leftover = GoalsRemaining(Play(0));
  Assert(leftover.length === 5, "act1 starts with 5 open goals");
  if (failed) {
    console.error(`\n${failed} failed`);
    process.exit(1);
  }
  console.log("\nTunnelHeart1942 play-fix smoke OK");
}

Main();
