import { readFileSync, existsSync as FileExists } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHAPTERS, PROLOGUE_PANELS, SAVE_KEY } from "./Data_Story.mjs";
import { AIR, GetCell, RebuildTunnelSolids, SetCell, SOFT, WorldToCell } from "./Script_Dig.mjs";
import { ITEM_AMMO, ITEM_CHARGE, ITEM_GRENADE, ITEM_META, ITEM_RIFLE, ITEM_SHOVEL } from "./Script_Items.mjs";
import { CountPlanned, EnsurePlanGrid, IsPlanned, PickExcavateTarget, TogglePlanCell } from "./Script_Plan.mjs";
import { DEPTH_MID, PropsBehind, PropsBehindBands, PropsFront, ScaleOf, YLiftOf } from "./Script_Depth.mjs";
import { AirConnected, BuildLevel, EvalDigGoals } from "./Script_World.mjs";
import {
  AdvancePanels,
  CanMeleeReach,
  CreateCampaignState,
  DebugCarvePath,
  DebugCompleteGoal,
  DebugHold,
  DebugPlanCell,
  EnemyFaction,
  GoalsRemaining,
  GrenadeAimWorldArc,
  GrenadeLobParams,
  IsShaftOpenAt,
  LoadProgress,
  MELEE_DURATION,
  MELEE_IMPACT_AT,
  NextStepText,
  RespawnPlayer,
  RestartChapterToPlay,
  SampleGrenadeArc,
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

function StepFrames(state, n) {
  for (let i = 0; i < n; i++) StepPlay(state, 1 / 30);
}

/** Interact then wait out KO windup so the chop actually lands. */
function MeleeUntilResolved(state, max = 36) {
  if (!state.pendingMelee) {
    state.input.interactPressed = true;
    StepPlay(state, 1 / 30);
  }
  for (let i = 0; i < max && state.pendingMelee; i++) StepPlay(state, 1 / 30);
}

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
  // Wipe tutorial blueprint — free dig from the air lip must still work.
  EnsurePlanGrid(state.level.soil);
  for (let r = 0; r < state.level.soil.rows; r++) {
    for (let c = 0; c < state.level.soil.cols; c++) state.level.soil.plan[r][c] = false;
  }
  const before = state.stats.cellsCarved;

  // Hold dig must NOT carve (no Terraria hold-to-dig)
  state.input.dig = true;
  for (let i = 0; i < 90; i++) StepPlay(state, 1 / 30);
  Assert(state.stats.cellsCarved === before, "holding J does not carve");

  // Free dig: soft lip touching AIR carves without blueprint.
  state.input.dig = false;
  state.player.x = hatch.tunnelX;
  state.player.y = hatch.tunnelY;
  state.player.facing = 1;
  state.player.onGround = true;
  state.input.digPressed = true;
  StepPlay(state, 1 / 30);
  Assert(state.stats.cellsCarved > before, "free dig carves soft lip without blueprint");
  Assert((state.player.digSwingT || 0) > 0 && state.player.digging, "dig chop swing starts on carve");
  Assert(!!state.digFx && (state.digFx.chips || []).length >= 6, "dig spawns dirt chip burst");
  Assert((state.shake || 0) > 0, "dig bite shakes camera");
  // Let the chop settle — mid-swing dig taps are ignored (one bite at a time).
  for (let i = 0; i < 20; i++) StepPlay(state, 1 / 30);
  Assert(!(state.player.digSwingT > 0), "dig swing settles");

  // Optional design paint still works via planPaintPressed (not dig — dig must excavate).
  const afterFree = state.stats.cellsCarved;
  state.input.designTogglePressed = true;
  StepPlay(state, 1 / 30);
  Assert(state.designMode, "R enters design mode");
  EnsurePlanGrid(state.level.soil);
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
  state.input.planPaintPressed = true;
  StepPlay(state, 1 / 30);
  Assert(IsPlanned(state.level.soil, target.c, target.r), "planPaint marks cell");
  Assert(CountPlanned(state.level.soil) >= 1, "plan count");

  // Dig while in design mode must EXIT and carve — never trap mobile.
  state.player.x = hatch.tunnelX;
  state.player.y = hatch.tunnelY;
  state.player.facing = target.c >= chest.c ? 1 : -1;
  state.player.vx = 0;
  state.player.vy = 0;
  state.player.onGround = true;
  state.designMode = true;
  state.input.digPressed = true;
  StepPlay(state, 1 / 30);
  Assert(!state.designMode, "dig exits design mode");
  Assert(state.stats.cellsCarved > afterFree, "dig while designing still carves");
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
  Assert(html.includes('id="TouchDesign"'), "design exit key exists (hidden unless stuck)");
  Assert(html.includes('hidden'), "contextual pad keys start hidden");
  Assert(!html.includes('data-touch="dig"'), "dig merged into contextual interact");
  Assert(!html.includes('data-touch="corridor"'), "no dedicated corridor pad key");
  Assert(!html.includes('data-touch="chamber"'), "no dedicated chamber pad key");
  Assert(html.includes("点铁锹大键退出并挖"), "design badge tells player to dig-exit");
  Assert(html.includes('id="StepHint"'), "step hint");
  const padHtml = html.slice(html.indexOf('class="touchPad"'), html.indexOf("ModalLayer"));
  Assert(!/>互动</.test(padHtml) && !/>开火</.test(padHtml) && !/>挖</.test(padHtml), "pad buttons are not Chinese text labels");
  Assert(!/>蹲</.test(padHtml) && !/>瞄</.test(padHtml) && !/>设计</.test(padHtml), "pad buttons have no text glyphs");
  const padIcons = readFileSync(join(here, "Script_PadIcons.mjs"), "utf8");
  Assert(padIcons.includes("ICON_TALK") && padIcons.includes("ICON_SHOT") && padIcons.includes("ICON_SHOVEL"), "pad icons match game pictograms");
  Assert(padIcons.includes("Icon_Shovel.png") && padIcons.includes("Icon_TunnelHatch.png"), "shovel/hatch use generated icon plates");
  Assert(padIcons.includes("Icon_Talk.png") && padIcons.includes("Icon_Shot.png") && padIcons.includes("Icon_Plan.png"), "talk/shot/plan use generated plates");
  Assert(padIcons.includes("Icon_Grenade.png") && padIcons.includes("Icon_Warn.png") && padIcons.includes("Icon_Aim.png"), "grenade/warn/aim plates");
  Assert(padIcons.includes("HUD_ICON_FILES"), "shared HUD icon file list");
  Assert(FileExists(join(here, "Icon_Shovel.png")) && FileExists(join(here, "Icon_TunnelHatch.png")), "icon plate files present");
  for (const file of [
    "Icon_Talk.png",
    "Icon_Shot.png",
    "Icon_Rifle.png",
    "Icon_Aim.png",
    "Icon_Plan.png",
    "Icon_Up.png",
    "Icon_Down.png",
    "Icon_Left.png",
    "Icon_Right.png",
    "Icon_Warn.png",
    "Icon_Grenade.png",
    "Icon_Charge.png",
    "Icon_Bell.png",
    "Icon_People.png",
    "Icon_Flip.png",
    "Icon_Check.png",
    "Icon_Corridor.png",
    "Icon_Crouch.png",
    "Icon_Ammo.png",
    "Icon_RoleHero.png",
    "Icon_RoleElder.png",
    "Icon_RoleWoman.png",
    "Icon_RoleMilitia.png",
    "Icon_RoleEnemy.png",
    "Icon_RoleSpy.png",
    "Icon_Well.png",
    "Icon_Bush.png",
  ]) {
    Assert(FileExists(join(here, file)), `${file} plate present`);
  }
  // True 抠图: corners transparent, no baked cream/black plate.
  {
    const cutCheck = spawnSync(
      "python3",
      [
        "-c",
        [
          "from PIL import Image",
          "import glob, os, sys",
          `here = ${JSON.stringify(here)}`,
          "bad = []",
          "for p in glob.glob(os.path.join(here, 'Icon_*.png')):",
          "  im = Image.open(p).convert('RGBA')",
          "  w, h = im.size",
          "  for xy in [(0,0),(w-1,0),(0,h-1),(w-1,h-1)]:",
          "    if im.getpixel(xy)[3] != 0: bad.append(os.path.basename(p)+':corner')",
          "  cream = sum(1 for px in im.getdata() if px[3] > 20 and px[0] > 200 and px[1] > 180)",
          "  if cream > 40: bad.append(os.path.basename(p)+':cream')",
          "print('OK' if not bad else 'BAD '+','.join(bad))",
          "sys.exit(1 if bad else 0)",
        ].join("\n"),
      ],
      { encoding: "utf8" },
    );
    Assert(cutCheck.status === 0, `icon cutouts transparent (${(cutCheck.stdout || cutCheck.stderr || "").trim()})`);
  }
  Assert(padIcons.includes("Icon_Plan.png") && padIcons.includes("ICON_PLAN"), "design icon is blueprint plate");
  Assert(padIcons.includes("ICON_DOWN") && padIcons.includes("ICON_UP"), "up/down chevron pad icons");
  Assert(padIcons.includes("ICON_CROUCH"), "crouch icon retained for pictogram parity");
  Assert(padIcons.includes("InteractPadIcon"), "contextual interact icon helper");
  const css = readFileSync(join(here, "Style_Game.css"), "utf8");
  Assert(css.includes("pointer: coarse"), "touch pad shows on coarse/touch devices");
  Assert(css.includes("(orientation: landscape) and (max-height: 520px)"), "landscape mobile pad layout");
  Assert(/width:\s*74px/.test(css), "touch keys are large");
  Assert(css.includes("width: 78%") || css.includes("width:78%"), "pad icons fill most of the key");
  Assert(css.includes("Icon_Charge.png") && css.includes("Icon_Grenade.png") && css.includes("Icon_Rifle.png"), "held slot uses generated item plates");
  Assert(css.includes(".cluster.move.dpad") && css.includes(".dpadUp"), "move pad is a direction-key cross");
  Assert(html.includes('class="cluster move dpad"') || html.includes("cluster move dpad"), "HTML uses dpad cluster");
  Assert(html.includes("dpadLeft") && html.includes("dpadRight") && html.includes("dpadDown"), "dpad has four direction keys");
  Assert(css.includes(".cluster.actions"), "action cluster present");
  Assert(/rgba\(239,\s*226,\s*200,\s*\.3/.test(css), "touch pad buttons are translucent");
  Assert(css.includes(".isPressed"), "touch pad has pressed visual class");
  Assert(css.includes("scale(0.92)"), "pressed keys sink/scale");
  const game = readFileSync(join(here, "Script_Game.mjs"), "utf8");
  Assert(game.includes("HUD_ICON_FILES") && game.includes("PICTO_FILE"), "game preloads full HUD icon set");
  Assert(game.includes('classList.toggle("isPressed"'), "pointer handlers toggle isPressed");
  Assert(game.includes("PadInteractVerb") && game.includes("SyncTouchPadActions"), "contextual pad action router");
  Assert(game.includes("inTunnel && CanDigWith"), "tunnel defaults big key to dig");
  Assert(game.includes("IsDialogueBlockingPad"), "tips must not steal dig verb");
  Assert(game.includes("forceTouchPad") || css.includes("forceTouchPad"), "touch pad forced on touch devices");
  Assert(html.includes('id="DebugModal"'), "hidden debug panel exists");
  Assert(html.includes('id="OpenDebugButton"'), "pause modal has debug button");
  Assert(html.includes('id="DismissHelpButton"'), "help modal has corner dismiss");
  Assert(css.includes("max-height: min(88dvh") || css.includes("88dvh"), "modals scroll on short screens");
  Assert(css.includes("position: sticky") && css.includes(".modalDismiss"), "sticky close affordances");
  Assert(game.includes("designExit") || game.includes("误进画线"), "design trap has dig-exit path");
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

/** Dig-up must climb past empty headroom; mobile sticky ↑ then dig works without two-finger hold. */
function TestDigUpPastHeadroom() {
  const state = Play(0);
  HatchDown(state, "hatch1");
  DebugHold(state, ITEM_SHOVEL);
  const soil = state.level.soil;
  EnsurePlanGrid(soil);
  for (let r = 0; r < soil.rows; r++) {
    for (let c = 0; c < soil.cols; c++) soil.plan[r][c] = false;
  }
  const pc = WorldToCell(soil, state.player.x, state.player.y - 24);
  // Headroom already open; soft column further up (typical after sideways digs).
  SetCell(soil, pc.c, pc.r - 1, AIR);
  SetCell(soil, pc.c, pc.r - 2, SOFT);
  SetCell(soil, pc.c, pc.r - 3, SOFT);
  RebuildTunnelSolids(state.level);

  const withUp = PickExcavateTarget(soil, state.player.x, state.player.y, 1, false, true);
  Assert(!!withUp && withUp.r <= pc.r - 2, `dig-up picks past headroom (got r=${withUp?.r})`);

  // Sticky: tap ↑ for one frame, release, then dig — must still carve upward.
  state.input.up = true;
  StepPlay(state, 1 / 30);
  state.input.up = false;
  Assert(state.digAimUp > 0, "dig-up sticky armed");
  state.input.digPressed = true;
  StepPlay(state, 1 / 30);
  Assert(GetCell(soil, pc.c, pc.r - 2) === AIR, "sticky dig-up carves ceiling soft");
}

/** Carved vertical shaft + hold ↑ must climb out to SURFACE_Y (dig-up alone is not enough). */
function TestClimbShaftToSurface() {
  const state = Play(0);
  HatchDown(state, "hatch1");
  DebugHold(state, ITEM_SHOVEL);
  const soil = state.level.soil;
  const pc = WorldToCell(soil, state.player.x, state.player.y - 24);
  // Open a shaft from the hard crust's first diggable row down to the digger.
  for (let r = 1; r <= pc.r; r++) SetCell(soil, pc.c, r, AIR);
  RebuildTunnelSolids(state.level);
  state.player.x = soil.originX + (pc.c + 0.5) * soil.cell;
  state.player.y = soil.originY + (pc.r + 1) * soil.cell;
  state.player.inTunnel = true;
  state.player.vy = 0;
  state.player.onGround = true;

  const y0 = state.player.y;
  state.input.up = true;
  for (let i = 0; i < 200; i++) StepPlay(state, 1 / 30);
  Assert(state.player.y < y0 - 40, "hold ↑ climbs the carved shaft");
  Assert(!state.player.inTunnel, "open shaft + ↑ emerges to surface");
  Assert(state.player.y <= 2, "emerged feet land on SURFACE_Y");

  // Surface ↑ still must not Mario-jump.
  const surfY = state.player.y;
  state.input.up = true;
  for (let i = 0; i < 20; i++) StepPlay(state, 1 / 30);
  Assert(state.player.y >= surfY - 2, "after emerge, ↑ still does not jump");

  // Must be able to drop back into the carved shaft (no hatch entity required).
  state.input.up = false;
  state.input.crouch = false;
  state.shaftExitLock = 0;
  state.input.crouch = true;
  for (let i = 0; i < 40 && !state.player.inTunnel; i++) StepPlay(state, 1 / 30);
  Assert(state.player.inTunnel, "↓ on open shaft re-enters tunnel");
  Assert(state.player.y > 20, "re-enter drops into dig band");
}

function TestPlayCutawayRender() {
  const game = readFileSync(join(here, "Script_Game.mjs"), "utf8");
  Assert(game.includes("RenderPlayCutaway"), "play uses unified dig cutaway");
  Assert(game.includes("DrawOpenShaftMarkers"), "open shafts marked on surface");
  Assert(game.includes("↑ 出井"), "underground climb shafts show exit label");
  Assert(game.includes("Ladder rungs") || game.includes("ladder rungs"), "climb shafts draw ladder rungs");
  Assert(game.includes("Sky bleed") || game.includes("skylight") || game.includes("Sky bleed"), "climb shafts draw skylight bleed");
  Assert(game.includes("climb_out"), "climb-out interact hint mapped");
  Assert(game.includes("level.soil"), "cutaway gated on soil levels");
  Assert(game.includes("VisibleWorldWidth") && game.includes("CameraCullX"), "soil cull uses real canvas span");
  Assert(!/cameraX \+ VIEW_W \+ 40/.test(game), "no fixed VIEW_W soil streaming cull");
  Assert(game.includes("state.viewW = VisibleWorldWidth"), "each frame publishes viewW");
  const rules = readFileSync(join(here, "Script_Rules.mjs"), "utf8");
  Assert(rules.includes("TryDescendOpenShaft"), "shaft re-entry helper");
  Assert(rules.includes("shaftExitLock"), "emerge lock prevents yo-yo re-enter");
  Assert(rules.includes("state.viewW"), "camera follow respects wide viewW");
  Assert(rules.includes("climb_out"), "rules flag climb-out hint under open shaft");
}

/** Open shaft underfoot must be visually marked while still underground. */
function TestClimbShaftUndergroundMarker() {
  const state = Play(0);
  HatchDown(state, "hatch1");
  const soil = state.level.soil;
  const pc = WorldToCell(soil, state.player.x, state.player.y - 24);
  for (let r = 1; r <= pc.r; r++) SetCell(soil, pc.c, r, AIR);
  RebuildTunnelSolids(state.level);
  state.player.x = soil.originX + (pc.c + 0.5) * soil.cell;
  state.player.y = soil.originY + (pc.r + 1) * soil.cell;
  state.player.inTunnel = true;
  state.player.vx = 0;
  state.input.left = false;
  state.input.right = false;
  state.input.dig = false;
  StepPlay(state, 1 / 30);
  Assert(IsShaftOpenAt(state, state.player.x), "test shaft is open to surface");
  Assert(
    state.interactHint === "climb_out" || state.interactHint === "hatch",
    "under open shaft shows climb-out / hatch hint",
  );
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
  MeleeUntilResolved(state);
  Assert(koTarget.dead && koTarget.ko, "rear KO while standing with rifle");
  Assert(!koTarget.discovered, "KO corpse not auto-discovered");
  Assert(state.player.meleeT > 0 || state.meleeFx || state.shake > 0, "melee strike anim/fx fired");

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

function TestMeleeKoFactions() {
  Assert(CLIPS.melee && CLIPS.melee.duration >= MELEE_DURATION - 0.01, "hungry melee clip exists");
  Assert(MELEE_IMPACT_AT > 0.15 && MELEE_IMPACT_AT < MELEE_DURATION, "melee impact after windup");
  Assert(PickClip({ melee: true }) === "melee", "melee clip pick");

  const state = Play(4);
  DebugCompleteGoal(state, "talk_street");
  const pup = state.level.entities.find((e) => e.type === "enemy" && e.label === "伪军");
  const ijp = state.level.entities.find((e) => e.type === "enemy" && e.label === "鬼子");
  Assert(!!pup && !!ijp, "street has 伪军 and 鬼子");
  Assert(EnemyFaction(pup) === "puppet", "伪军 faction");
  Assert(EnemyFaction(ijp) === "ijp", "鬼子 faction");

  // 伪军: front proximity KO
  for (const e of state.level.entities) {
    if (e.type === "enemy" && e !== pup) {
      e.dead = true;
      e.hidden = true;
      e.corpse = false;
    }
  }
  pup.dead = false;
  pup.hp = 2;
  pup.ko = false;
  pup.amp = 0;
  pup.facing = 1;
  pup.x = 900;
  pup.homeX = 900;
  pup.alert = 0;
  pup.highAlert = false;
  state.player.x = pup.x + 30; // in front
  state.player.y = 0;
  state.player.inTunnel = false;
  state.player.facing = -1;
  state.player.hp = 3;
  state.player.meleeT = 0;
  state.input.interactPressed = true;
  StepPlay(state, 1 / 30);
  Assert(!!state.pendingMelee && !pup.dead, "伪军 KO waits for chop windup");
  MeleeUntilResolved(state);
  Assert(pup.dead && pup.ko, "伪军 front proximity KO");
  Assert((state.shake || 0) > 0 || (state.meleeFx && !state.meleeFx.windup), "KO lands with impact shake/fx");
  Assert(
    CanMeleeReach(
      { x: 100, y: 0, inTunnel: false, manningMg: false, meleeT: 0 },
      { type: "enemy", dead: false, x: 130, y: 0, layer: "surface" },
    ),
    "melee reach helper",
  );

  // 鬼子: front attempt = counter
  const st2 = Play(4);
  DebugCompleteGoal(st2, "talk_street");
  const jp = st2.level.entities.find((e) => e.type === "enemy" && e.label === "鬼子");
  for (const e of st2.level.entities) {
    if (e.type === "enemy" && e !== jp) {
      e.dead = true;
      e.hidden = true;
      e.corpse = false;
    }
  }
  jp.dead = false;
  jp.hp = 2;
  jp.ko = false;
  jp.amp = 0;
  jp.facing = -1; // facing left; player in front (left of him) is not behind
  jp.x = 1000;
  jp.homeX = 1000;
  jp.alert = 0;
  jp.highAlert = false;
  st2.player.x = jp.x - 30; // in front of facing -1
  st2.player.y = 0;
  st2.player.inTunnel = false;
  st2.player.facing = 1;
  st2.player.hp = 3;
  st2.player.meleeT = 0;
  MeleeUntilResolved(st2);
  Assert(!jp.dead, "鬼子 front KO fails");
  Assert(st2.player.hp < 3, "鬼子 front counters and hurts player");
  Assert(jp.highAlert || jp.alert > 0, "鬼子 counters into alert");

  // 鬼子: rear still works
  jp.alert = 0;
  jp.highAlert = false;
  jp.facing = 1;
  st2.player.hp = 3;
  st2.player.x = jp.x - 28;
  st2.player.facing = 1;
  st2.player.meleeT = 0;
  st2.player.invuln = 0;
  st2.pendingMelee = null;
  MeleeUntilResolved(st2);
  Assert(jp.dead && jp.ko, "鬼子 rear KO still works");
}

function TestGrenadeAimArc() {
  const low = GrenadeLobParams(0);
  const mid = GrenadeLobParams(0.5);
  const high = GrenadeLobParams(1);
  Assert(high.loft < mid.loft && mid.loft < low.loft, "higher aim = loftier lob");
  const arc = SampleGrenadeArc(100, -32, mid.speed, mid.loft, 16);
  Assert(arc.length >= 4, "arc samples several points");
  Assert(arc[arc.length - 1].y >= arc[0].y, "lob falls toward ground");

  const state = Play(7);
  DebugCompleteGoal(state, "talk_nade");
  DebugCompleteGoal(state, "stock_nades");
  state.player.held = ITEM_GRENADE;
  state.player.grenades = 2;
  state.player.throwCool = 0;
  state.player.inTunnel = false;
  state.input.usePressed = true;
  StepPlay(state, 1 / 30);
  Assert(state.nadeAiming, "first throw tap enters aim mode");
  Assert(!(state.projectiles || []).some((p) => p.kind === "grenade"), "aim does not throw yet");
  Assert(GrenadeAimWorldArc(state).length >= 3, "aim draws world arc");
  state.input.up = true;
  StepFrames(state, 20);
  Assert(state.nadeAim > 0.7, "hold ↑ raises lob aim");
  const before = state.player.grenades;
  state.input.up = false;
  state.input.usePressed = true;
  StepPlay(state, 1 / 30);
  Assert(!state.nadeAiming, "confirm throw exits aim");
  Assert(state.player.grenades === before - 1, "confirm throw spends a grenade");
  Assert((state.projectiles || []).some((p) => p.kind === "grenade"), "confirm spawns projectile");
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
  const farWheat = level.props.filter((p) => p.kind === "wheat" && p.depth === -3);
  const backWheat = level.props.filter((p) => p.kind === "wheat" && p.depth === -1);
  Assert(midWheat.length >= 40, "mid band is a dense continuous wheat field");
  Assert(midWheat.every((p) => (p.clump || 0) >= 10), "mid wheat clumps are thick stalks");
  Assert(midWheat.every((p) => (p.rows || 1) >= 2), "mid wheat patches have multiple rows");
  Assert(farWheat.length >= 20, "far band has continuous wheat haze");
  Assert(backWheat.length >= 30, "back band has dense roadside wheat fringe");
  const farLitter = level.props.filter((p) => p.depth === -3 && p.kind !== "wheat");
  Assert(farLitter.length < 8, "far non-crop landmarks stay minimal");
  const wide = BuildLevel("act5_street_hunt");
  Assert(wide.width >= 3000, "street hunt is a wide map");
  Assert(!wide.props.some((p) => p.kind === "mudbank"), "wide map also has continuous ground only");
  const game = readFileSync(join(here, "Script_Game.mjs"), "utf8");
  Assert(game.includes("DrawDepthVeil"), "atmospheric depth veils");
  Assert(game.includes("DrawTunnelFrontLips"), "tunnel front lips draw");
  Assert(game.includes("airLeft") && game.includes("airRight"), "front lips only on walls beside air");
  Assert(!/fillRect\(x, y, rw, Math\.min\(10/.test(game), "no floor-stripe lip bars under digger");
  Assert(game.includes("PropsBehindBands"), "banded behind draw");
  Assert(game.includes("DrawContinuousNearGround"), "continuous near ground ribbon");
  Assert(!game.includes("vanishing toward mid-horizon"), "no radial floor trapezoid hatch");
  Assert(game.includes("Stronger distance fog") || game.includes("veilFar"), "distance fog shelves");
  Assert(
    game.includes("Golden stalk") || game.includes("multi-row golden stalks") || game.includes("grain heads"),
    "beautified wheat clumps",
  );
}

function TestChaptersHaveSoil() {
  Assert(CHAPTERS.length === 8, "eight acts");
  Assert(CHAPTERS[4].id === "act5_street_hunt", "street hunt slotted as act5");
  Assert(CHAPTERS[5].id === "act6_heifengkou", "heifengkou is act6");
  Assert(CHAPTERS[6].id === "act7_mg_nest", "mg nest slotted as act7");
  Assert(CHAPTERS[7].id === "act8_grenade_yard", "grenade yard slotted as act8");
  for (const ch of CHAPTERS) {
    const level = BuildLevel(ch.id);
    Assert(!!level.soil, `${ch.id} soil`);
    Assert(
      level.entities.some((e) => e.kind === "pickup" && e.itemId === ITEM_SHOVEL),
      `${ch.id} has shovel pickup`,
    );
    Assert(level.entities.some((e) => e.type === "talk" && e.script), `${ch.id} has talk script`);
  }
  Assert(SAVE_KEY.endsWith("_v8"), "save v8");
  Assert(LoadProgress(SerializeProgress(Play(0))).chapterIndex === 0, "save");
}

function TestAct7MgNest() {
  const state = Play(6);
  Assert(state.chapterId === "act7_mg_nest", "mg nest chapter");
  Assert(state.player.inTunnel, "act7 starts underground");
  Assert(state.level.entities.some((e) => e.type === "mg_nest"), "mg nest entity");
  Assert(state.level.entities.some((e) => e.id === "mg_gunner"), "machine gunner");
  Assert(state.level.mgWaves?.length >= 3, "three assault waves authored");
  Assert(state.level.entities.some((e) => e.type === "patrol"), "mid-route patrol hardship");
  const crawlAir = state.level.soil.cells[4]?.slice(18, 28).filter((c) => c === AIR).length;
  Assert(crawlAir >= 8, "pre-carved crawlway hardship");

  DebugCompleteGoal(state, "talk_mg");
  // Dig start → camp under hard blobs (BFS skips HARD).
  DebugCarvePath(state, 4, 4, 55, 4);
  for (let r = 3; r < 5; r++) {
    for (let c = 54; c < 58; c++) state.level.soil.cells[r][c] = AIR;
  }
  RebuildTunnelSolids(state.level);
  for (let i = 0; i < 3; i++) StepPlay(state, 1 / 30);
  Assert(state.goalsDone.link_camp || EvalDigGoals(state.level).link_camp, "link_camp after carve");

  const hatch = state.level.entities.find((e) => e.id === "hatch_camp");
  Assert(!!hatch, "camp hatch");
  state.player.x = hatch.tunnelX;
  state.player.y = hatch.tunnelY;
  state.player.inTunnel = true;
  state.player.onGround = true;
  state.input.interactPressed = true;
  StepPlay(state, 1 / 30);
  for (let i = 0; i < 50; i++) StepPlay(state, 1 / 30);
  Assert(!state.player.inTunnel, "surfaced at camp");
  Assert(state.goalsDone.surface_camp, "surface_camp goal");

  const nest = state.level.entities.find((e) => e.type === "mg_nest");
  const gunner = state.level.entities.find((e) => e.id === "mg_gunner");
  gunner.amp = 0;
  gunner.facing = 1;
  gunner.x = nest.x + 80;
  gunner.homeX = gunner.x;
  state.player.x = gunner.x - 28;
  state.player.y = 0;
  state.player.facing = 1;
  state.subtitle = null;
  state.subtitleTimer = 0;
  MeleeUntilResolved(state);
  Assert(gunner.dead && gunner.ko, "rear KO silences gunner");
  Assert(state.goalsDone.silence_gunner, "silence_gunner goal");

  state.subtitle = null;
  state.subtitleTimer = 0;
  state.player.x = nest.x;
  state.input.interactPressed = true;
  StepPlay(state, 1 / 30);
  Assert(state.player.manningMg, "player mans the MG");
  Assert(state.goalsDone.man_mg, "man_mg goal");
  Assert(state.level.mgArmed, "waves armed");

  // Spray until all authored waves are spawned and cleared.
  for (let i = 0; i < 1200 && !state.goalsDone.hold_waves; i++) {
    state.input.usePressed = true;
    state.player.shotCool = 0;
    StepPlay(state, 1 / 30);
  }
  Assert(state.level.mgWaveIndex >= state.level.mgWaves.length, "all waves deployed");
  Assert(state.goalsDone.hold_waves, "hold_waves after MG defense");
  Assert(/机枪|扫射|日伪/.test(NextStepText(state)) || state.goalsDone.hold_waves, "mg tip or done");
}

function TestAct8GrenadeYard() {
  const state = Play(7);
  Assert(state.chapterId === "act8_grenade_yard", "grenade yard chapter");
  Assert(CHAPTERS[7].goals.includes("clear_grenade_yard"), "clear_grenade_yard goal");
  Assert(state.level.night !== false && state.level.palette?.night, "night yard palette");
  const bags = state.level.entities.filter((e) => e.type === "sandbag");
  const foes = state.level.entities.filter((e) => e.type === "enemy");
  const coverFoes = foes.filter((e) => e.cover);
  Assert(bags.length >= 5, `sandbags authored (${bags.length})`);
  Assert(coverFoes.length >= 5, `cover foes (${coverFoes.length})`);
  Assert(
    state.level.entities.some((e) => e.kind === "pickup" && e.itemId === ITEM_GRENADE && e.grenadeAmount >= 2),
    "grenade crates stack amount",
  );
  Assert(/手雷|沙袋/.test(NextStepText(state)) || !state.goalsDone.talk_nade, "nade tip mentions hand grenade/sandbags");

  DebugCompleteGoal(state, "talk_nade");
  const crate = state.level.entities.find(
    (e) => e.kind === "pickup" && e.itemId === ITEM_GRENADE && e.goal === "stock_nades",
  );
  Assert(!!crate, "stock crate with goal");
  state.player.x = crate.x;
  state.player.y = 0;
  state.player.inTunnel = false;
  state.input.interactPressed = true;
  StepPlay(state, 1 / 30);
  Assert(state.goalsDone.stock_nades, "stock_nades on crate pickup");
  Assert(state.player.grenades >= 3, `pocket stack (${state.player.grenades})`);
  Assert(state.player.held === ITEM_GRENADE, "empty hands equip grenade");

  // Cover halves ADS damage (2 → 1) — freeze the foe so the shot is unambiguous.
  const target = coverFoes[0];
  const nestX = 800;
  target.amp = 0;
  target.x = nestX;
  target.homeX = nestX;
  target.facing = -1;
  target.hp = 3;
  target.maxHp = 3;
  target.dead = false;
  target.alert = 0;
  target.highAlert = false;
  const hpBefore = target.hp;
  state.player.x = nestX - 90;
  state.player.held = ITEM_RIFLE;
  state.player.ammo = 4;
  state.player.facing = 1;
  state.player.shotCool = 0;
  state.input.aim = true;
  StepPlay(state, 1 / 30);
  // Pin again after ADS step (gunshot alert would otherwise make him chase).
  target.x = nestX;
  target.homeX = nestX;
  target.amp = 0;
  target.alert = 0;
  target.highAlert = false;
  state.input.usePressed = true;
  StepPlay(state, 1 / 30);
  Assert(target.hp === hpBefore - 1, `cover halves ADS (hp ${target.hp})`);

  // High lob over bags: freeze AI so fuse lands in the nest, not a chase.
  for (const e of foes) {
    if (e !== target) {
      e.dead = true;
      e.hp = 0;
      e.corpse = true;
    }
  }
  target.dead = false;
  target.hp = 3;
  target.cover = true;
  target.amp = 0;
  target.alert = 0;
  target.highAlert = false;
  target.x = nestX;
  target.homeX = nestX;
  const bag = bags.find((b) => Math.abs(b.x - nestX) < 50);
  Assert(!!bag, "sandbag at nest A");
  bag.broken = false;
  bag.hidden = false;
  state.player.x = nestX - 140;
  state.player.facing = 1;
  state.player.held = ITEM_GRENADE;
  state.player.grenades = 2;
  state.player.throwCool = 0;
  state.input.aim = false;
  state.input.up = true;
  state.input.crouch = false;
  // Aim → confirm (Valiant Hearts lob), seeded high by ↑.
  state.input.usePressed = true;
  StepPlay(state, 1 / 30);
  Assert(state.nadeAiming, "yard throw opens aim first");
  state.input.usePressed = true;
  StepPlay(state, 1 / 30);
  Assert(
    (state.projectiles || []).some((p) => p.kind === "grenade"),
    "grenade projectile spawned",
  );
  Assert(state.player.grenades === 1, "throw consumes pocket stack");
  for (let i = 0; i < 90 && !target.dead; i++) {
    // Keep the teaching-nest foe planted while the stick is in the air.
    target.x = nestX;
    target.homeX = nestX;
    target.amp = 0;
    target.alert = 0;
    target.vx = 0;
    StepPlay(state, 1 / 30);
  }
  Assert(target.dead, "blast kills cover foe");
  Assert(bag.broken || state.stats.coversBroken > 0, "blast breaks sandbag");
  Assert(state.stats.grenadesThrown >= 1, "grenadesThrown stat");
  Assert(state.goalsDone.clear_grenade_yard, "clear_grenade_yard after last kill");
  Assert(/沙袋|已清/.test(NextStepText(state)) || state.goalsDone.clear_grenade_yard, "yard tip or done");
}

/** 0 HP must not freeze the run — soft respawn + hard chapter retry. */
function TestDeathRespawn() {
  const state = Play(0);
  HatchDown(state, "hatch1");
  DebugHold(state, ITEM_SHOVEL);
  const soil = state.level.soil;
  const pc = WorldToCell(soil, state.player.x, state.player.y - 24);
  SetCell(soil, pc.c, pc.r, AIR);
  const carvedBefore = soil.carved | 0;
  state.goalsDone.enter_hatch = true;

  state.player.hp = 0;
  state.failed = true;
  RespawnPlayer(state);
  Assert(!state.failed, "soft respawn clears fail lock");
  Assert(state.player.hp === 3, "soft respawn refills hearts");
  Assert(state.player.invuln > 1, "soft respawn grants brief invuln");
  Assert(soil.carved === carvedBefore, "soft respawn keeps dig progress");
  Assert(state.goalsDone.enter_hatch, "soft respawn keeps goals");
  Assert(!state.player.inTunnel, "soft respawn drops at surface hatch mouth");
  state.input.left = true;
  const x0 = state.player.x;
  StepPlay(state, 1 / 30);
  Assert(state.player.x !== x0 || state.player.vx !== 0, "after respawn, play steps again");

  state.player.hp = 0;
  state.failed = true;
  const hard = RestartChapterToPlay(state);
  Assert(hard.phase === "play", "hard retry jumps straight into play");
  Assert(!hard.failed && hard.player.hp === 3, "hard retry resets fail + hearts");
  Assert(hard.chapterIndex === state.chapterIndex, "hard retry stays on same act");

  const html = readFileSync(join(here, "index.html"), "utf8");
  Assert(html.includes("FailRespawnButton") && html.includes("站起来"), "fail modal has respawn");
  Assert(html.includes("FailRetryButton") && html.includes("重来本幕"), "fail modal has chapter retry");
  Assert(html.includes("FailTitleButton"), "fail modal has title exit");
  const rules = readFileSync(join(here, "Script_Rules.mjs"), "utf8");
  Assert(rules.includes("export function RespawnPlayer"), "respawn helper exported");
  Assert(rules.includes("RestartChapterToPlay"), "play-skip restart helper");
  const game = readFileSync(join(here, "Script_Game.mjs"), "utf8");
  Assert(game.includes("state.failed") && game.includes('SetModal("fail")'), "death opens fail modal");
  Assert(game.includes("Death lock") || game.includes("never leave the player frozen"), "fail modal cannot soft-dismiss");
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
  Assert(CLIPS.dig.keys.length >= 4, "dig clip has coil→bite→settle keys");
  Assert(Math.abs(CLIPS.dig.duration - 0.42) < 0.01, "dig clip duration matches swing");
  // Dig chop must strike FORWARD (local +X = facing), not swing behind the back.
  {
    const coil = SolveBones(SampleClip("dig", 0.24 * CLIPS.dig.duration), { plantFeet: false });
    const bite = SolveBones(SampleClip("dig", 0.5 * CLIPS.dig.duration), { plantFeet: false });
    Assert(coil.handR.x < -12, `dig coil parks shovel behind (x=${coil.handR.x.toFixed(1)})`);
    Assert(bite.handR.x > 12, `dig bite drives shovel forward (x=${bite.handR.x.toFixed(1)})`);
    Assert(bite.handR.x > coil.handR.x + 28, "dig swing travels toward facing wall");
  }
  const slow = AdvanceClipTime("walk", 0, 0.1, { vx: 80, refSpeed: 220 });
  const fast = AdvanceClipTime("walk", 0, 0.1, { vx: 220, refSpeed: 220 });
  Assert(slow < fast, "walk cycle slows with lower speed");
  Assert(fast > 0.09 && fast < 0.14, "full-speed walk advances near wall-clock");
  const game = readFileSync(join(here, "Script_Game.mjs"), "utf8");
  Assert(game.includes("DrawPuppet"), "game draws puppet");
  Assert(game.includes("Script_Puppet.mjs"), "game imports puppet");
  Assert(game.includes("AdvanceClipTime"), "player walk uses speed-synced clip clock");
  Assert(game.includes("function DrawDigFx") && game.includes("DIG_SWING_DURATION"), "game draws dig swing FX");
  const rules = readFileSync(join(here, "Script_Rules.mjs"), "utf8");
  Assert(rules.includes("DIG_SWING_DURATION") && rules.includes("SpawnDigImpactFx"), "rules spawn dig impact FX");
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
  TestDigUpPastHeadroom();
  TestClimbShaftToSurface();
  TestPlayCutawayRender();
  TestClimbShaftUndergroundMarker();
  TestCrouchCrawlNoEdgeTeleport();
  TestPickupShovelRequired();
  TestMultiTalk();
  TestAct2MustDigBeforeShelter();
  TestAct4KillInvaders();
  TestAct5StreetHunt();
  TestMeleeKoFactions();
  TestGrenadeAimArc();
  TestAct6PlantNeedsCharge();
  TestAct7MgNest();
  TestAct8GrenadeYard();
  TestDeathRespawn();
  TestNaiveAct1Bot();
  const leftover = GoalsRemaining(Play(0));
  Assert(leftover.length === 5, "act1 starts with 5 open goals");
  const html = readFileSync(join(here, "index.html"), "utf8");
  Assert(html.includes('data-touch="aim"'), "mobile ADS aim button");
  Assert(html.includes('class="cluster actions"'), "consolidated action cluster");
  Assert(html.includes('id="TouchAim" hidden') || /id="TouchAim"[^>]*hidden/.test(html), "aim hidden until rifle");
  Assert(/id="TouchDesign"[^>]*hidden/.test(html), "design key starts hidden");
  Assert(!html.includes('data-touch="dig"'), "no always-on dig key");
  Assert(html.includes('data-touch="up"') && html.includes('data-touch="crouch"'), "up/down always on pad");
  // Underground HUD must teach dig / blueprint — not leave a silent talk key.
  {
    const tun = Play(0);
    tun.player.held = ITEM_SHOVEL;
    tun.player.inTunnel = true;
    const tip = NextStepText(tun);
    Assert(/铁锹|挖|土壁|画线/.test(tip), "tunnel step tip names dig controls");
    Assert(tip.includes("点"), "tunnel tip says which pad control to tap");
  }
  const gameSrc = readFileSync(join(here, "Script_Game.mjs"), "utf8");
  Assert(gameSrc.includes("p.inTunnel && CanDigWith"), "pad verb digs by default underground");
  Assert(gameSrc.includes("function DrawNameplate") && gameSrc.includes("Always-on who-is-who plate"), "actor head nameplates always on");
  Assert(gameSrc.includes("RoleIconForSpeaker") && gameSrc.includes("Icon_RoleHero.png"), "role cutout icons wired");
  Assert(gameSrc.includes("Foot ring under interactables"), "interact cue is foot ring not floating ball");
  Assert(gameSrc.includes("DrawNameplate(\"水井\""), "well landmark labeled");
  {
    const act1 = BuildLevel("act1_connect");
    const nearSpawnBush = (act1.props || []).filter(
      (p) => p.kind === "bush" && (p.depth || 0) > 0 && p.x < 300,
    );
    Assert(nearSpawnBush.length === 0, "no near-camera bush egg in spawn skirt");
  }
  Assert(gameSrc.includes("PaintTouchPadIcons"), "touch pad painted with icon plates");
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
