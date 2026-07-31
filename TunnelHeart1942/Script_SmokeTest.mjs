import { CHAPTERS, SAVE_KEY } from "./Data_Story.mjs";
import { AIR, GetCell, SOFT } from "./Script_Dig.mjs";
import { AirConnected, BuildLevel, EvalDigGoals } from "./Script_World.mjs";
import {
  CreateCampaignState,
  DebugCarvePath,
  GoalsRemaining,
  LoadProgress,
  SerializeProgress,
  StepPlay,
} from "./Script_Rules.mjs";

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
  state.player.x = ent.x;
  state.player.y = 0;
  state.player.inTunnel = false;
  state.input.interactPressed = true;
  StepPlay(state, 1 / 30);
  for (let i = 0; i < 60; i++) StepPlay(state, 1 / 30);
  Assert(state.player.inTunnel, `${id} enters tunnel`);
}

function TestSoilNotGifted() {
  const level = BuildLevel("act1_connect");
  Assert(!!level.soil, "act1 has soil grid");
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

function TestCarveConnectsAct1() {
  const state = Play(0);
  HatchDown(state, "hatch1");
  Assert(state.goalsDone.enter_hatch, "enter");
  // Carve A(5,3) -> B(23,3) -> C(41,4) through soft
  DebugCarvePath(state, 5, 3, 23, 3);
  Assert(state.goalsDone.link_ab, "link_ab after carve");
  DebugCarvePath(state, 23, 3, 41, 4);
  Assert(state.goalsDone.link_bc, "link_bc after carve");
  Assert(
    AirConnected(state.level.soil, state.level.digLinks[0].ax, state.level.digLinks[0].ay, state.level.digLinks[1].bx, state.level.digLinks[1].by),
    "full chain air-connected",
  );
}

function TestDigCellByCell() {
  const state = Play(0);
  HatchDown(state, "hatch1");
  // Stand at right edge of cellar A, face the soft wall
  const hatch = state.level.entities.find((e) => e.id === "hatch1");
  state.player.x = hatch.tunnelX + 80;
  state.player.y = hatch.tunnelY;
  state.player.facing = 1;
  state.player.onGround = true;
  const before = state.stats.cellsCarved;
  state.input.dig = true;
  for (let i = 0; i < 100; i++) StepPlay(state, 1 / 30);
  Assert(state.stats.cellsCarved > before, "held dig carves soft cell at wall");
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
  // Dig east chamber + path
  DebugCarvePath(state, 6, 3, 29, 3);
  // Fill zone air
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

function TestAct5Maze() {
  const state = Play(4);
  Assert(state.player.inTunnel, "act5 starts underground");
  const links = EvalDigGoals(state.level);
  Assert(!links.link_charge, "charge not linked at start");
  DebugCarvePath(state, 4, 4, 49, 4);
  for (let r = 3; r < 5; r++) {
    for (let c = 48; c < 51; c++) state.level.soil.cells[r][c] = AIR;
  }
  StepPlay(state, 1 / 30);
  Assert(state.goalsDone.link_charge || EvalDigGoals(state.level).link_charge, "charge linked after carve");
}

function TestChaptersHaveSoil() {
  Assert(CHAPTERS.length === 5, "five acts");
  for (const ch of CHAPTERS) {
    const level = BuildLevel(ch.id);
    Assert(!!level.soil, `${ch.id} soil`);
    Assert((level.digLinks?.length || 0) + (level.digZones?.length || 0) > 0, `${ch.id} dig objectives`);
  }
  Assert(SAVE_KEY.endsWith("_v3"), "save v3");
  const blob = SerializeProgress(Play(0));
  Assert(LoadProgress(blob).chapterIndex === 0, "save");
}

function Main() {
  TestChaptersHaveSoil();
  TestSoilNotGifted();
  TestCarveConnectsAct1();
  TestDigCellByCell();
  TestAct2MustDigBeforeShelter();
  TestAct5Maze();
  const leftover = GoalsRemaining(Play(0));
  Assert(leftover.length === 4, "act1 starts with 4 open goals");
  if (failed) {
    console.error(`\n${failed} failed`);
    process.exit(1);
  }
  console.log("\nTunnelHeart1942 dig-system smoke OK");
}

Main();
