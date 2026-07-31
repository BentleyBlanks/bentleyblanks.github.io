import { CHAPTERS, HISTORY_CARDS, SAVE_KEY } from "./Data_Story.mjs";
import { BuildLevel } from "./Script_World.mjs";
import {
  AdvanceBriefing,
  AdvanceOutro,
  CreateCampaignState,
  DebugCompleteGoal,
  GoalsRemaining,
  LoadProgress,
  PlayerAabb,
  RectsOverlap,
  SerializeProgress,
  StepPlay,
} from "./Script_Rules.mjs";

let failed = 0;
function Assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("ok:", msg);
  }
}

function SimulateDig(state, digId, seconds = 3) {
  const dig = state.level.digSpots.find((d) => d.id === digId);
  Assert(!!dig, `dig spot ${digId} exists`);
  state.phase = "play";
  state.player.x = dig.x;
  state.player.y = dig.tunnel ? state.level.tunnelFloor : state.level.surfaceFloor;
  state.player.inTunnel = !!dig.tunnel;
  state.player.onGround = true;
  state.input.dig = true;
  for (let i = 0; i < 90; i++) StepPlay(state, 1 / 30);
  Assert(dig.done, `${digId} dug after hold`);
}

function SimulateInteract(state, entId) {
  const ent = state.level.entities.find((e) => e.id === entId);
  Assert(!!ent, `entity ${entId} exists`);
  state.phase = "play";
  state.player.x = ent.x + (ent.w || 0) / 2;
  state.player.y = ent.requiresTunnel ? state.level.tunnelFloor : state.level.surfaceFloor;
  if (ent.requiresTunnel != null) state.player.inTunnel = !!ent.requiresTunnel;
  if (ent.type === "hatch") {
    // hatch works from either layer; keep current unless specified
  }
  state.player.onGround = true;
  state.input.interactPressed = true;
  StepPlay(state, 1 / 30);
}

function TestAct1Flow() {
  const state = CreateCampaignState(0);
  state.phase = "play";
  SimulateInteract(state, "npc_laozhong");
  Assert(state.goalsDone.talk_laozhong, "act1 talk goal");
  SimulateInteract(state, "hatch1");
  Assert(state.goalsDone.open_hatch, "act1 hatch goal");
  Assert(state.player.inTunnel, "entered tunnel");
  SimulateDig(state, "dig1");
  Assert(state.goalsDone.dig_links, "act1 dig goal");
}

function TestAct2Bell() {
  const state = CreateCampaignState(1);
  state.phase = "play";
  for (const id of ["v1", "v2", "v3"]) SimulateInteract(state, id);
  Assert(state.goalsDone.shelter_villagers, "villagers sheltered");
  SimulateInteract(state, "bell");
  Assert(state.goalsDone.ring_bell && state.goalsDone.survive_raid, "bell sacrifice beat");
}

function TestAct3Flip() {
  const state = CreateCampaignState(2);
  state.phase = "play";
  SimulateInteract(state, "flip_build");
  Assert(state.goalsDone.build_flip, "flip built");
  // go surface to expose spy
  state.player.inTunnel = false;
  state.player.y = state.level.surfaceFloor;
  SimulateInteract(state, "spy_talk");
  Assert(state.goalsDone.expose_spy, "spy exposed");
  const spy = state.level.entities.find((e) => e.id === "spy");
  const trap = state.level.entities.find((e) => e.id === "flip_trap");
  spy.x = trap.x;
  state.player.inTunnel = true;
  state.player.y = state.level.tunnelFloor;
  SimulateInteract(state, "flip_trap");
  Assert(state.goalsDone.trap_spy && spy.trapped, "spy trapped by flip");
}

function TestAct4Ambush() {
  const state = CreateCampaignState(3);
  state.phase = "play";
  for (const id of ["port1", "port2", "port3"]) {
    const port = state.level.entities.find((e) => e.id === id);
    port.cooled = false;
    SimulateInteract(state, id);
  }
  Assert(state.goalsDone.exit_shots, "three ports used");
  Assert(state.goalsDone.break_patrol, "patrol broken");
  Assert(state.goalsDone.keep_safe, "keep safe marked");
}

function TestAct5Finale() {
  const state = CreateCampaignState(4);
  state.phase = "play";
  SimulateDig(state, "under1");
  Assert(state.goalsDone.dig_under, "dug under blockhouse");
  SimulateInteract(state, "charge");
  Assert(state.goalsDone.plant_charge, "charge planted");
  state.player.inTunnel = false;
  state.player.y = state.level.surfaceFloor;
  // crouch to avoid patrol while signaling
  state.input.crouch = true;
  SimulateInteract(state, "signal");
  Assert(state.goalsDone.signal_assault, "assault signaled");
}

function TestPhysicsAndSave() {
  const state = CreateCampaignState(0);
  state.phase = "play";
  state.input.right = true;
  const x0 = state.player.x;
  for (let i = 0; i < 30; i++) StepPlay(state, 1 / 30);
  Assert(state.player.x > x0, "player moves right");
  const aabb = PlayerAabb(state.player);
  Assert(aabb.w > 0 && aabb.h > 0, "player aabb");
  Assert(RectsOverlap(aabb, { x: aabb.x + 1, y: aabb.y + 1, w: 10, h: 10 }), "overlap helper");

  const blob = SerializeProgress(state);
  const loaded = LoadProgress(blob);
  Assert(loaded.chapterIndex === 0, "save roundtrip chapter");
  Assert(SAVE_KEY.startsWith("tunnelheart"), "save key namespaced");
}

function TestBriefingOutroChain() {
  let state = CreateCampaignState(0);
  state.phase = "briefing";
  while (state.phase === "briefing") state = AdvanceBriefing(state);
  Assert(state.phase === "play", "briefing enters play");
  for (const g of Object.keys(state.goalsDone)) DebugCompleteGoal(state, g);
  Assert(GoalsRemaining(state).length === 0, "debug goals clear");
  state.phase = "outro";
  state.outroIndex = 0;
  state = AdvanceOutro(state);
  // act1 has one outro beat
  Assert(state.phase === "briefing" || state.chapterIndex === 1, "outro advances campaign");
}

function TestLevelsExist() {
  Assert(CHAPTERS.length === 5, "five film acts");
  Assert(HISTORY_CARDS.length >= 4, "history cards");
  for (const ch of CHAPTERS) {
    const level = BuildLevel(ch.id);
    Assert(level.width > 1000, `${ch.id} wide level`);
    Assert(level.spawn && level.surfaceFloor > 0, `${ch.id} spawn`);
    for (const goal of ch.goals) {
      Assert(typeof goal === "string", `${ch.id} goal string`);
    }
  }
}

function Main() {
  TestLevelsExist();
  TestPhysicsAndSave();
  TestAct1Flow();
  TestAct2Bell();
  TestAct3Flip();
  TestAct4Ambush();
  TestAct5Finale();
  TestBriefingOutroChain();
  if (failed) {
    console.error(`\n${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll TunnelHeart1942 smoke tests passed.");
}

Main();
