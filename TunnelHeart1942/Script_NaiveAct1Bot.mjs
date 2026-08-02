/**
 * Naive Act1 happy-path bot — talks → well shovel → hatch → walk blue plan + J.
 * Exit 0 on success; exit 1 if a real player would still get stuck.
 */
import { AIR, GetCell, SOFT } from "./Script_Dig.mjs";
import { ITEM_SHOVEL } from "./Script_Items.mjs";
import { CountPlanned, IsPlanned } from "./Script_Plan.mjs";
import {
  CreateCampaignState,
  GoalsRemaining,
  NextStepText,
  StepPlay,
} from "./Script_Rules.mjs";

const DT = 1 / 30;
let failed = 0;
function Assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else console.log("ok:", msg);
}

function Play() {
  const s = CreateCampaignState(0);
  s.phase = "play";
  return s;
}

const state = Play();

function Tick(n = 1) {
  for (let i = 0; i < n; i++) StepPlay(state, DT);
}

function ClearMove() {
  state.input.left = false;
  state.input.right = false;
  state.input.up = false;
  state.input.crouch = false;
}

function WalkTo(x, maxSteps = 500) {
  ClearMove();
  for (let i = 0; i < maxSteps; i++) {
    const dx = x - state.player.x;
    if (Math.abs(dx) < 8) {
      ClearMove();
      Tick(4);
      return true;
    }
    state.input.left = dx < 0;
    state.input.right = dx > 0;
    Tick(1);
  }
  ClearMove();
  return Math.abs(state.player.x - x) < 14;
}

function MashE(times = 1) {
  for (let i = 0; i < times; i++) {
    state.input.interactPressed = true;
    Tick(1);
    Tick(6);
  }
}

function WaitHatch() {
  for (let i = 0; i < 80 && state.transition > 0; i++) Tick(1);
  Tick(8);
}

function TapJ() {
  state.input.digPressed = true;
  Tick(1);
}

const well = state.level.props.find((p) => p.kind === "well");
const shovel = state.level.entities.find((e) => e.kind === "pickup" && e.itemId === ITEM_SHOVEL);
const hatch = state.level.entities.find((e) => e.id === "hatch1");
const laozhong = state.level.entities.find((e) => e.id === "npc_laozhong");
const linxia = state.level.entities.find((e) => e.id === "npc_linxia");

Assert(!!well && !!shovel && !!hatch, "act1 props");
Assert(Math.abs(shovel.x - well.x) < 50, `shovel at well (gap=${Math.abs(shovel.x - well.x).toFixed(1)})`);
Assert(!!state.level.tutorialPlan, "tutorial plan flag");
Assert(CountPlanned(state.level.soil) >= 12, `pre-drawn A→B→C blueprint (${CountPlanned(state.level.soil)})`);
Assert(/高老忠/.test(NextStepText(state)), `next step starts with talk: ${NextStepText(state)}`);

WalkTo(laozhong.x);
MashE(laozhong.script.length);
Assert(!!state.goalsDone.talk_laozhong, "talk_laozhong");

WalkTo(linxia.x);
MashE(linxia.script.length);
Assert(!!state.goalsDone.talk_linxia, "talk_linxia");

WalkTo(hatch.x);
MashE(1);
WaitHatch();
Assert(!state.player.inTunnel, "hatch blocked without shovel");
Assert(state.player.held !== ITEM_SHOVEL, "still empty-handed");

WalkTo(shovel.x);
MashE(1);
Assert(state.player.held === ITEM_SHOVEL, "picked shovel at well");

WalkTo(hatch.x);
MashE(1);
WaitHatch();
Assert(state.player.inTunnel, "entered hatch with shovel");
Assert(!!state.goalsDone.enter_hatch, "enter_hatch");

let carveStart = state.stats.cellsCarved;
for (let guard = 0; guard < 900; guard++) {
  if (state.goalsDone.link_ab && state.goalsDone.link_bc) break;
  const soil = state.level.soil;
  const pc = {
    c: Math.floor((state.player.x - soil.originX) / soil.cell),
    r: Math.floor((state.player.y - 24 - soil.originY) / soil.cell),
  };
  let target = null;
  for (const [dc, dr] of [
    [1, 0],
    [1, -1],
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 1],
    [-1, -1],
    [2, 0],
    [2, -1],
  ]) {
    const c = pc.c + dc;
    const r = pc.r + dr;
    if (IsPlanned(soil, c, r) && GetCell(soil, c, r) === SOFT) {
      target = { c, r, dc };
      break;
    }
  }
  if (target) {
    state.player.facing = target.dc >= 0 ? 1 : -1;
    TapJ();
    state.input.right = target.dc >= 0;
    state.input.left = target.dc < 0;
    Tick(6);
    ClearMove();
    continue;
  }
  // Walk right along the pre-drawn corridor looking for the next blue cell.
  state.input.right = true;
  Tick(8);
  ClearMove();
}

Assert(state.stats.cellsCarved > carveStart, `carved along blueprint (+${state.stats.cellsCarved - carveStart})`);
Assert(!!state.goalsDone.link_ab, "link_ab via pre-drawn plan + J");
Assert(!!state.goalsDone.link_bc, "link_bc via pre-drawn plan + J");
Assert(GoalsRemaining(state).length === 0, `all act1 goals done (${GoalsRemaining(state)})`);

// Straight A→B row should not force a hard-rock detour for the tutorial.
const hardOnStraight = [];
for (let c = 7; c <= 22; c++) {
  if (GetCell(state.level.soil, c, 3) !== AIR && GetCell(state.level.soil, c, 3) !== SOFT) {
    // after carve most are AIR; check original intent via remaining HARD only
  }
}
const levelFresh = CreateCampaignState(0).level;
for (let c = 7; c <= 22; c++) {
  const v = GetCell(levelFresh.soil, c, 3);
  if (v !== SOFT && v !== AIR) hardOnStraight.push(c);
}
Assert(hardOnStraight.length === 0, `no hard blob on A→B row-3 (${hardOnStraight})`);

if (failed) {
  console.error(`\nNaiveAct1Bot: ${failed} failed`);
  process.exit(1);
}
console.log("\nNaiveAct1Bot: Act1 playable end-to-end");
