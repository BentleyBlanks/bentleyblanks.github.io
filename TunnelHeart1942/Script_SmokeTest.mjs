import { CHAPTERS, SAVE_KEY } from "./Data_Story.mjs";
import { BuildLevel, TUNNEL_CEIL, TUNNEL_FLOOR } from "./Script_World.mjs";
import {
  AdvancePanels,
  CreateCampaignState,
  DebugCompleteGoal,
  GoalsRemaining,
  JumpApexHeight,
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

function Play(state) {
  state.phase = "play";
  return state;
}

function DigAt(state, digId) {
  const dig = state.level.digSpots.find((d) => d.id === digId);
  Assert(!!dig, `dig ${digId} exists`);
  // Stand beside the seal (not inside it)
  state.player.inTunnel = dig.layer === "tunnel";
  state.player.y = dig.layer === "tunnel" ? state.level.tunnelFloor : state.level.surfaceY;
  state.player.x = dig.x - 50;
  state.player.onGround = true;
  state.input.dig = true;
  for (let i = 0; i < 120; i++) StepPlay(state, 1 / 30);
  Assert(dig.done, `${digId} completed by adjacent dig`);
  if (dig.clears) {
    Assert(!state.level.tunnelSolids.some((s) => s.id === dig.clears), `${dig.clears} removed`);
  }
}

function Interact(state, entId, opts = {}) {
  const ent = state.level.entities.find((e) => e.id === entId);
  Assert(!!ent, `entity ${entId}`);
  if (opts.tunnel != null) state.player.inTunnel = !!opts.tunnel;
  state.player.y = state.player.inTunnel ? state.level.tunnelFloor : state.level.surfaceY;
  state.player.x = ent.x;
  state.player.onGround = true;
  state.input.interactPressed = true;
  StepPlay(state, 1 / 30);
}

function TestJumpVsSealContract() {
  const apex = JumpApexHeight();
  const sealH = TUNNEL_FLOOR - TUNNEL_CEIL;
  Assert(apex > 36, `jump clears short rubble (${apex.toFixed(1)}px)`);
  Assert(sealH > apex + 10, `tunnel seals taller than jump (${sealH} > ${apex.toFixed(1)}) — dig only`);
}

function TestAct1() {
  const state = Play(CreateCampaignState(0));
  Interact(state, "npc_laozhong");
  Assert(state.goalsDone.talk_laozhong, "talk");
  Interact(state, "hatch1");
  // hatch starts transition — step until flipped
  for (let i = 0; i < 60; i++) StepPlay(state, 1 / 30);
  Assert(state.player.inTunnel, "hatch entered tunnel");
  Assert(state.goalsDone.enter_hatch, "enter hatch goal");
  DigAt(state, "dig_west");
  Assert(state.goalsDone.dig_west, "west dig");
  // walk through former west seal before campaign completes
  state.input.dig = false;
  state.player.x = 620 - 40;
  state.player.vx = 0;
  state.input.right = true;
  const x0 = state.player.x;
  for (let i = 0; i < 30; i++) StepPlay(state, 1 / 30);
  Assert(state.player.x > x0 + 20, "can walk through cleared seal");
  state.input.right = false;
  DigAt(state, "dig_east");
  Assert(state.goalsDone.dig_east, "east dig");
}

function TestCannotJumpSeal() {
  const state = Play(CreateCampaignState(0));
  state.player.inTunnel = true;
  state.player.y = TUNNEL_FLOOR;
  state.player.x = 620 - 60;
  state.player.onGround = true;
  // sprint into seal and spam jump
  state.input.right = true;
  for (let i = 0; i < 45; i++) {
    state.input.jumpPressed = true;
    StepPlay(state, 1 / 30);
  }
  Assert(state.player.x < 620 - 10, "jump does not clear uncleared seal");
}

function TestAct2Bell() {
  const state = Play(CreateCampaignState(1));
  for (const id of ["v1", "v2", "v3"]) Interact(state, id);
  Assert(state.goalsDone.shelter_a && state.goalsDone.shelter_b && state.goalsDone.shelter_c, "shelters");
  // crouch past patrol
  state.input.crouch = true;
  Interact(state, "bell");
  Assert(state.goalsDone.reach_bell, "bell");
}

function TestAct3() {
  const state = Play(CreateCampaignState(2));
  Interact(state, "flip_build", { tunnel: true });
  Assert(state.goalsDone.build_flip, "flip");
  Interact(state, "hatch3", { tunnel: true });
  for (let i = 0; i < 60; i++) StepPlay(state, 1 / 30);
  Assert(!state.player.inTunnel, "up to surface");
  Interact(state, "spy_talk", { tunnel: false });
  Assert(state.goalsDone.expose_spy, "expose");
  const spy = state.level.entities.find((e) => e.id === "spy");
  const trap = state.level.entities.find((e) => e.id === "flip_trap");
  spy.x = trap.x;
  // dig mid seal so path clear, then trap
  DigAt(state, "dig_mid");
  Interact(state, "flip_trap", { tunnel: true });
  Assert(state.goalsDone.trap_spy && spy.trapped, "trap spy");
}

function TestAct4() {
  const state = Play(CreateCampaignState(3));
  for (const id of ["port1", "port2", "port3"]) {
    const p = state.level.entities.find((e) => e.id === id);
    p.used = false;
    Interact(state, id, { tunnel: false });
  }
  Assert(state.goalsDone.shot_a && state.goalsDone.shot_b && state.goalsDone.shot_c, "shots");
  Assert(state.goalsDone.break_patrol, "patrol broken");
}

function TestAct5() {
  const state = Play(CreateCampaignState(4));
  DigAt(state, "dig_under");
  Assert(state.goalsDone.dig_under, "under");
  Interact(state, "charge", { tunnel: true });
  Assert(state.goalsDone.plant_charge, "charge");
  Interact(state, "hatch5", { tunnel: true });
  for (let i = 0; i < 60; i++) StepPlay(state, 1 / 30);
  state.input.crouch = true;
  Interact(state, "signal", { tunnel: false });
  Assert(state.goalsDone.signal_assault, "signal");
}

function TestStoryAndSave() {
  Assert(CHAPTERS.length === 5, "five acts");
  Assert(CHAPTERS.every((c) => c.openPanels.length >= 2 && c.closePanels.length >= 1), "panels");
  for (const c of CHAPTERS) {
    const level = BuildLevel(c.id);
    Assert(level.width > 2000, `${c.id} wide`);
    Assert(level.palette && level.props, `${c.id} parallax palette/props`);
  }
  let state = CreateCampaignState(0);
  state.phase = "panels";
  while (state.phase === "panels") state = AdvancePanels(state);
  Assert(state.phase === "play", "panels -> play");
  for (const g of Object.keys(state.goalsDone)) DebugCompleteGoal(state, g);
  Assert(GoalsRemaining(state).length === 0, "goals clear");
  const blob = SerializeProgress(state);
  Assert(LoadProgress(blob).chapterIndex === 0, "save");
  Assert(SAVE_KEY.endsWith("_v2"), "new save key");
}

function Main() {
  TestJumpVsSealContract();
  TestStoryAndSave();
  TestAct1();
  TestCannotJumpSeal();
  TestAct2Bell();
  TestAct3();
  TestAct4();
  TestAct5();
  if (failed) {
    console.error(`\n${failed} failed`);
    process.exit(1);
  }
  console.log("\nTunnelHeart1942 whitebox smoke OK");
}

Main();
