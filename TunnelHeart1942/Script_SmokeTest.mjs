import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHAPTERS, PROLOGUE_PANELS, SAVE_KEY } from "./Data_Story.mjs";
import { AIR, GetCell, RebuildTunnelSolids, SetCell, SOFT } from "./Script_Dig.mjs";
import { ITEM_AMMO, ITEM_CHARGE, ITEM_GRENADE, ITEM_META, ITEM_RIFLE, ITEM_SHOVEL } from "./Script_Items.mjs";
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
  StandingWouldClip,
  StepPlay,
} from "./Script_Rules.mjs";
import {
  AdvanceClipTime,
  BONE_DEFS,
  CLIPS,
  SampleClip,
  SolveBones,
  PickClip,
} from "./Script_Puppet.mjs";
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
  Assert(html.includes('data-touch="interact"'), "mobile interact button");
  Assert(html.includes('id="TouchInteract"'), "single contextual interact key");
  Assert(html.includes('data-touch="up"'), "mobile up button");
  Assert(html.includes('data-touch="crouch"'), "mobile down/crouch button");
  Assert(html.includes('id="TouchAim"'), "mobile aim key (contextual)");
  Assert(html.includes('id="TouchDesign"'), "mobile design key (contextual)");
  Assert(html.includes('hidden'), "contextual pad keys start hidden");
  Assert(!html.includes('data-touch="dig"'), "dig merged into contextual interact");
  Assert(!html.includes('data-touch="corridor"'), "corridor is on-demand use in design");
  Assert(!html.includes('data-touch="chamber"'), "chamber merged into crouch+interact in design");
  Assert(html.includes('id="StepHint"'), "step hint");
  const padHtml = html.slice(html.indexOf('class="touchPad"'), html.indexOf("ModalLayer"));
  Assert(!/>互动</.test(padHtml) && !/>开火</.test(padHtml) && !/>挖</.test(padHtml), "pad buttons are not Chinese text labels");
  Assert(!/>蹲</.test(padHtml) && !/>瞄</.test(padHtml) && !/>设计</.test(padHtml), "pad buttons have no text glyphs");
  const padIcons = readFileSync(join(here, "Script_PadIcons.mjs"), "utf8");
  Assert(padIcons.includes("ICON_TALK") && padIcons.includes("ICON_SHOT") && padIcons.includes("ICON_SHOVEL"), "pad icons match game pictograms");
  Assert(padIcons.includes("M3 10 H23") && padIcons.includes("ICON_PLAN"), "design icon is blueprint grid + pencil");
  Assert(padIcons.includes("ICON_DOWN") && padIcons.includes("ICON_UP"), "up/down chevron pad icons");
  Assert(padIcons.includes("ICON_CROUCH"), "crouch icon retained for pictogram parity");
  Assert(padIcons.includes("InteractPadIcon"), "contextual interact icon helper");
  const css = readFileSync(join(here, "Style_Game.css"), "utf8");
  Assert(css.includes("pointer: coarse"), "touch pad shows on coarse/touch devices");
  Assert(css.includes("(orientation: landscape) and (max-height: 520px)"), "landscape mobile pad layout");
  Assert(/width:\s*74px/.test(css), "touch keys are large");
  Assert(css.includes(".padIcon"), "pad icon sizing");
  Assert(css.includes(".cluster.move .vert"), "up/down stacked beside strafe");
  Assert(/rgba\(239,\s*226,\s*200,\s*\.3/.test(css), "touch pad buttons are translucent");
  Assert(css.includes(".isPressed"), "touch pad has pressed visual class");
  Assert(css.includes("scale(0.92)"), "pressed keys sink/scale");
  const game = readFileSync(join(here, "Script_Game.mjs"), "utf8");
  Assert(game.includes('classList.toggle("isPressed"'), "pointer handlers toggle isPressed");
  Assert(game.includes("PadInteractVerb") && game.includes("SyncTouchPadActions"), "contextual pad action router");
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

/** Crouch into a 1-high crawlway — must not X-shove to the map/soil edge. */
function TestCrouchCrawlNoEdgeTeleport() {
  const state = Play(0);
  HatchDown(state, "hatch1");
  DebugHold(state, ITEM_SHOVEL);
  const soil = state.level.soil;
  const pc = Math.floor((state.player.x - soil.originX) / soil.cell);
  const pr = Math.floor((state.player.y - 24 - soil.originY) / soil.cell);
  for (let c = pc + 1; c < pc + 10; c++) {
    SetCell(soil, c, pr, AIR);
    if (GetCell(soil, c, pr - 1) === AIR) SetCell(soil, c, pr - 1, SOFT);
  }
  RebuildTunnelSolids(state.level);

  state.input.crouch = true;
  state.input.right = true;
  for (let i = 0; i < 50; i++) StepPlay(state, 1 / 30);
  Assert(state.player.crouching, "crouch-walks inside 1-high crawlway");
  Assert(state.player.x > soil.originX + (pc + 2) * soil.cell, "reached crawlway interior");
  Assert(
    StandingWouldClip({ ...state.player, crouching: false }, state.level.tunnelSolids),
    "standing would clip crawlway ceiling",
  );
  const xCrawl = state.player.x;

  state.input.crouch = false;
  state.input.right = true;
  for (let i = 0; i < 12; i++) StepPlay(state, 1 / 30);
  Assert(state.player.crouching, "low ceiling keeps player crouched");
  Assert(Math.abs(state.player.x - xCrawl) < 100, "uncrouch does not teleport on X");
  Assert(state.player.x > 100, "not pinned at left map edge");

  const xDig = state.player.x;
  state.input.crouch = true;
  state.input.right = true;
  state.input.digPressed = true;
  StepPlay(state, 1 / 30);
  Assert(Math.abs(state.player.x - xDig) < 60, "dig-while-crouch does not edge-shove");
  Assert(state.player.crouching, "dig does not force-stand in crawlway");
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
  Assert(state.subtitle?.comic, "talk uses comic head bubble");
  Assert(state.subtitle?.anchorId === "npc_laozhong", "bubble anchors on speaker NPC");
  Assert(state.activeTalkId === "npc_laozhong", "active talk tracked for E-advance");
  // Walk away — E must still advance (the old "must stand on NPC" bug)
  state.player.x = npc.x + 220;
  state.input.interactPressed = true;
  StepPlay(state, 1 / 30);
  Assert((npc.scriptIndex | 0) >= 2, "E advances talk without re-proximity");
  for (let i = npc.scriptIndex | 0; i < npc.script.length; i++) {
    state.input.interactPressed = true;
    StepPlay(state, 1 / 30);
  }
  Assert(npc.done, "talk completes after all lines");
  Assert(state.goalsDone.talk_laozhong, "talk goal marked");
  Assert(!state.activeTalkId, "active talk lock clears on last line");
  Assert(state.subtitle?.text, "last line still on screen until confirm");
  // Stand clear of shovel / other NPCs so E only confirms the bubble
  state.player.x = 40;
  state.input.interactPressed = true;
  StepPlay(state, 1 / 30);
  Assert(!state.subtitle, "E confirms and closes last comic bubble");
  const game = readFileSync(join(here, "Script_Game.mjs"), "utf8");
  Assert(game.includes("DrawComicSpeechBubble"), "comic speech bubble draw");
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
    // Keep foes in shot range but outside rear-KO / melee overlap with the port.
    e.x = port.x + 120;
    e.homeX = port.x + 120;
    e.amp = 0;
    e.alert = 0;
    e.highAlert = false;
    e.facing = -1;
    e.hp = 1;
    e.maxHp = 1;
    e.dead = false;
    e.corpse = false;
    e.discovered = false;
  }
  state.level.alarm = false;

  state.player.invuln = 99;
  state.input.crouch = true;

  for (let round = 0; round < 16 && !state.goalsDone.kill_invaders; round++) {
    state.transition = 0;
    state._hatchFlipped = false;
    port.cool = 0;
    state.player.inTunnel = true;
    state.player.x = port.x;
    state.player.y = port.tunnelY;
    state.player.invuln = 99;
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

function TestAct5StreetHunt() {
  const state = Play(4);
  Assert(state.chapterId === "act5_street_hunt", "street hunt chapter");
  Assert(CHAPTERS[4].goals.includes("clear_street"), "clear_street goal");
  Assert(state.player.held === ITEM_RIFLE, "starts with rifle");
  Assert(state.player.ammo === 2, "scarce starting ammo");
  Assert(state.level.entities.some((e) => e.kind === "pickup" && e.itemId === ITEM_AMMO), "ammo packs");
  Assert(state.level.entities.some((e) => e.kind === "pickup" && e.itemId === ITEM_GRENADE), "grenades");
  const foes = state.level.entities.filter((e) => e.type === "enemy");
  Assert(foes.length >= 6, `street enemies (${foes.length})`);
  Assert(foes.some((e) => e.label === "伪军"), "includes 伪军");

  DebugCompleteGoal(state, "talk_street");
  const target = foes[0];
  target.x = state.player.x + 80;
  target.homeX = target.x;
  target.amp = 0;
  target.facing = -1;
  state.player.facing = 1;
  state.player.ammo = 2;
  state.player.shotCool = 0;
  state.input.aim = true;
  StepPlay(state, 1 / 30);
  Assert(state.player.aiming, "ADS while holding aim");
  state.input.usePressed = true;
  StepPlay(state, 1 / 30);
  Assert(state.player.ammo === 1, "ADS shot spends 1 ammo");
  Assert(target.hp < target.maxHp || target.dead, "ADS shot hits forward foe");

  // Hide other corpses so LOS test is unambiguous.
  for (const e of foes) {
    if (e.dead) {
      e.corpse = false;
      e.hidden = true;
      e.discovered = false;
    }
  }
  const koTarget = foes.find((e) => !e.dead && e !== target) || foes[1];
  koTarget.dead = false;
  koTarget.hp = 2;
  koTarget.ko = false;
  koTarget.discovered = false;
  koTarget.corpse = false;
  koTarget.hidden = false;
  koTarget.x = 800;
  koTarget.homeX = 800;
  koTarget.amp = 0;
  koTarget.facing = 1;
  state.player.x = koTarget.x - 28;
  state.player.y = 0;
  state.player.inTunnel = false;
  state.player.facing = 1;
  state.level.alarm = false;
  for (const e of foes) {
    e.highAlert = false;
    e.alert = 0;
  }
  state.input.aim = false;
  state.input.crouch = false;
  state.input.interactPressed = true;
  StepPlay(state, 1 / 30);
  Assert(koTarget.dead && koTarget.ko, "rear KO while standing with rifle");
  Assert(!koTarget.discovered, "KO corpse not auto-discovered");

  const witness = foes.find((e) => !e.dead);
  Assert(!!witness, "living witness remains");
  witness.x = koTarget.x - 80;
  witness.homeX = witness.x;
  witness.amp = 0;
  witness.alert = 0;
  witness.highAlert = false;
  witness.facing = 1;
  state.level.alarm = false;
  for (let i = 0; i < 8; i++) StepPlay(state, 1 / 30);
  Assert(koTarget.discovered, "witness discovers corpse");
  Assert(!!state.level.alarm || witness.highAlert, "corpse alarm raised");
  Assert(
    foes.filter((e) => !e.dead).every((e) => e.highAlert),
    "all living foes go high alert",
  );

  const pack = state.level.entities.find((e) => e.kind === "pickup" && e.itemId === ITEM_AMMO && !e.taken);
  state.player.x = pack.x;
  state.player.held = ITEM_RIFLE;
  const ammoBefore = state.player.ammo;
  state.input.interactPressed = true;
  StepPlay(state, 1 / 30);
  Assert(state.player.held === ITEM_RIFLE, "ammo does not steal rifle slot");
  Assert(state.player.ammo > ammoBefore, "ammo added to pocket");

  // Last living foe — shoot to sync clear_street
  for (const e of foes) {
    if (e === witness) continue;
    e.dead = true;
    e.corpse = true;
  }
  witness.dead = false;
  witness.hp = 1;
  witness.x = state.player.x + 60;
  witness.homeX = witness.x;
  witness.amp = 0;
  state.player.held = ITEM_RIFLE;
  state.player.ammo = 5;
  state.player.facing = 1;
  state.player.shotCool = 0;
  state.input.aim = true;
  state.input.usePressed = true;
  StepPlay(state, 1 / 30);
  Assert(witness.dead, "final foe down");
  Assert(state.goalsDone.clear_street, "clear_street when all foes down");
}

function TestAct6PlantNeedsCharge() {
  const state = Play(5);
  Assert(state.chapterId === "act6_heifengkou", "heifengkou is act6");
  Assert(state.player.inTunnel, "act6 starts underground");
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
  const frontBand = level.props.filter((p) => p.depth === 1);
  const nearBand = level.props.filter((p) => p.depth === 2);
  Assert(frontBand.length > 3 && frontBand.length < 22, "FRONT band sparse mid-fg");
  Assert(nearBand.length > 3 && nearBand.length < 18, "NEAR band sparse camera skirt");
  Assert(level.props.some((p) => p.depth === DEPTH_MID), "mid depth crop/orchard band");
  Assert(PropsBehindBands(level.props).length >= 2, "multiple behind depth bands");
  Assert(ScaleOf(-3) < ScaleOf(-1) && ScaleOf(-1) < ScaleOf(0) && ScaleOf(0) < ScaleOf(2), "depth scale stack");
  Assert(ScaleOf(1) < ScaleOf(2) && YLiftOf(1, 1) < YLiftOf(2, 1), "FRONT/NEAR hierarchy gap");
  Assert(YLiftOf(-3, 1) < YLiftOf(0, 1) && YLiftOf(0, 1) < YLiftOf(2, 1), "depth Y-lift stack");
  Assert(YLiftOf(2, 1) >= 90, "NEAR drops closer to camera");
  Assert(!level.props.some((p) => p.kind === "mudbank"), "no scattered mudbank trapezoids");
  const midWheat = level.props.filter((p) => p.kind === "wheat" && p.depth === DEPTH_MID);
  Assert(midWheat.length > 0 && midWheat.length < 40, "mid wheat is sparse crop patches");
  Assert(midWheat.every((p) => (p.clump || 0) >= 5), "wheat patches carry clump size");
  const farLitter = level.props.filter((p) => p.depth === -3);
  Assert(farLitter.length < 12, "far prop litter stays minimal");
  const wide = BuildLevel("act5_street_hunt");
  Assert(wide.width >= 3000, "street hunt is a wide map");
  Assert(!wide.props.some((p) => p.kind === "mudbank"), "wide map also has continuous ground only");
  const game = readFileSync(join(here, "Script_Game.mjs"), "utf8");
  Assert(game.includes("DrawDepthVeil"), "atmospheric depth veils");
  Assert(game.includes("PropsBehindBands"), "banded behind draw");
  Assert(game.includes("DrawContinuousNearGround"), "continuous near ground ribbon");
  Assert(!game.includes("vanishing toward mid-horizon"), "no radial floor trapezoid hatch");
  Assert(game.includes("Stronger distance fog") || game.includes("veilFar"), "distance fog shelves");
  Assert(game.includes("Golden stalk clump") || game.includes("grain heads"), "beautified wheat clumps");
}

function TestChaptersHaveSoil() {
  Assert(CHAPTERS.length === 6, "six acts");
  Assert(CHAPTERS[4].id === "act5_street_hunt", "street hunt slotted as act5");
  Assert(CHAPTERS[5].id === "act6_heifengkou", "heifengkou is act6");
  for (const ch of CHAPTERS) {
    const level = BuildLevel(ch.id);
    Assert(!!level.soil, `${ch.id} soil`);
    Assert(
      level.entities.some((e) => e.kind === "pickup" && e.itemId === ITEM_SHOVEL),
      `${ch.id} has shovel pickup`,
    );
    Assert(level.entities.some((e) => e.type === "talk" && e.script), `${ch.id} has talk script`);
  }
  Assert(SAVE_KEY.endsWith("_v6"), "save v6");
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
  const slow = AdvanceClipTime("walk", 0, 0.1, { vx: 80, refSpeed: 220 });
  const fast = AdvanceClipTime("walk", 0, 0.1, { vx: 220, refSpeed: 220 });
  Assert(slow < fast, "walk cycle slows with lower speed");
  Assert(fast > 0.09 && fast < 0.14, "full-speed walk advances near wall-clock");
  const game = readFileSync(join(here, "Script_Game.mjs"), "utf8");
  Assert(game.includes("DrawPuppet"), "game draws puppet");
  Assert(game.includes("Script_Puppet.mjs"), "game imports puppet");
  Assert(game.includes("AdvanceClipTime"), "player walk uses speed-synced clip clock");
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
  TestCrouchCrawlNoEdgeTeleport();
  TestPickupShovelRequired();
  TestMultiTalk();
  TestAct2MustDigBeforeShelter();
  TestAct4KillInvaders();
  TestAct5StreetHunt();
  TestAct6PlantNeedsCharge();
  TestNaiveAct1Bot();
  const leftover = GoalsRemaining(Play(0));
  Assert(leftover.length === 5, "act1 starts with 5 open goals");
  const html = readFileSync(join(here, "index.html"), "utf8");
  Assert(html.includes('data-touch="aim"'), "mobile ADS aim button");
  Assert(html.includes('class="cluster actions"'), "consolidated action cluster");
  Assert(html.includes('id="TouchAim" hidden') || /id="TouchAim"[^>]*hidden/.test(html), "aim hidden until rifle");
  Assert(/id="TouchDesign"[^>]*hidden/.test(html), "design hidden until tunnel");
  Assert(!html.includes('data-touch="dig"'), "no always-on dig key");
  Assert(html.includes('data-touch="up"') && html.includes('data-touch="crouch"'), "up/down always on pad");
  const gameSrc = readFileSync(join(here, "Script_Game.mjs"), "utf8");
  Assert(gameSrc.includes("Idle patrol: bare puppet only") || gameSrc.includes("on demand"), "enemy head HUD is on-demand");
  Assert(gameSrc.includes("PaintTouchPadIcons"), "touch pad painted with SVG icons");
  Assert(gameSrc.includes("Icon-only float"), "world interact prompt is icon-only");
  const surfaceStack = gameSrc.slice(gameSrc.indexOf("function RenderSurfaceStack"), gameSrc.indexOf("function RenderTunnelStack"));
  Assert(
    surfaceStack.indexOf("DrawContinuousNearGround") < surfaceStack.lastIndexOf("DrawSpeechBubble"),
    "dialogue bubble draws above front trees / near ground",
  );
  Assert(!gameSrc.includes("E 继续") && !gameSrc.includes("E 关闭"), "no keyboard-letter dialogue hints");
  Assert(!/（E）/.test(NextStepText(Play(0))), "step hint has no (E) key letter");
  TestNoKeyLetterCopy();
  if (failed) {
    console.error(`\n${failed} failed`);
    process.exit(1);
  }
  console.log("\nTunnelHeart1942 combat-stealth smoke OK");
}

/** Player-facing copy must not teach keyboard letters (J/E/F/R…). */
function TestNoKeyLetterCopy() {
  const bad =
    /按\s*[EJFReqr]|点\s*J|（[EJFRjr]）|\bE 击晕|\bE 捡|开火键|挖掘键|设计键|瞄准键|方向键|蓝线旁点|R 画线|J 挖|F 安放|点 J|按 R|按 F|按 E|按 J/;
  const hits = [];
  const check = (where, text) => {
    if (text && bad.test(text)) hits.push(`${where}: ${text}`);
  };
  for (const ch of CHAPTERS) {
    check(`${ch.id}.objective`, ch.objective);
    for (const p of [...(ch.openPanels || []), ...(ch.closePanels || [])]) {
      check(`${ch.id}.${p.id || p.speaker}`, p.text);
    }
    const level = BuildLevel(ch.id);
    for (const e of level.entities || []) {
      if (e.hint) check(`${e.id || e.type}.hint`, e.hint);
      for (const beat of e.script || []) check(`${e.id}.script`, beat.text);
      if (e.line) check(`${e.id}.line`, e.line);
    }
    const st = Play(CHAPTERS.indexOf(ch));
    check(`${ch.id}.nextStep`, NextStepText(st));
  }
  for (const p of PROLOGUE_PANELS) check(`prologue.${p.speaker}`, p.text);
  for (const [id, meta] of Object.entries(ITEM_META)) check(`item.${id}`, meta.tip);
  const laozhong = BuildLevel("act1_connect").entities.find((e) => e.id === "npc_laozhong");
  Assert(laozhong.script.every((b) => !/点 J|按 R|按 E|按 F/.test(b.text)), "高老忠台词无按键字母");
  Assert(hits.length === 0, hits.length ? `key-letter copy: ${hits[0]}` : "no key-letter player copy");
}

Main();
