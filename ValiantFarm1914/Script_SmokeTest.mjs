import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BeginPlay,
  BuildLevel,
  CreateState,
  DebugCutAll,
  DebugHold,
  DebugKillMg,
  PROLOGUE_BEATS,
  PROLOGUE_LINE,
  Step,
} from "./Script_Sim.mjs";

const here = dirname(fileURLToPath(import.meta.url));

let failed = 0;
function Assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else console.log("ok:", msg);
}

function Tap(state, key) {
  if (key === "act") state.input.actPressed = true;
  if (key === "throw") state.input.throwPressed = true;
  if (key === "jump") state.input.jumpPressed = true;
  Step(state, 1 / 30);
}

function Main() {
  Assert(PROLOGUE_LINE === "往后的形势只怕会更加艰难", "prologue line");
  Assert(PROLOGUE_BEATS.some((b) => b.text === PROLOGUE_LINE), "line fused into talk");
  Assert(PROLOGUE_BEATS.every((b) => b.speaker && b.text), "prologue is spoken dialogue");
  for (const name of [
    "Texture_FarmRuinWide.jpg",
    "Texture_PortraitEmile.png",
    "Texture_PortraitKarl.png",
    "Texture_DogWalt.png",
    "Texture_EnemySentry.png",
    "Texture_PropCart.png",
    "Texture_PropWireBag.png",
    "Texture_PortraitMedic.png",
    "Texture_SpriteMedic.png",
  ]) {
    Assert(existsSync(join(here, name)), `art ${name}`);
  }
  // In-game sprites must be cut out (real alpha), not opaque paper plates.
  for (const name of [
    "Texture_DogWalt.png",
    "Texture_EnemySentry.png",
    "Texture_PropCart.png",
    "Texture_PropWireBag.png",
    "Texture_SpriteMedic.png",
  ]) {
    const buf = readFileSync(join(here, name));
    Assert(buf[0] === 0x89 && buf[1] === 0x50, `${name} is png`);
    // tRNS or truecolor+alpha (color type 4/6) — IHDR byte 25 = color type
    const colorType = buf[25];
    Assert(colorType === 4 || colorType === 6, `${name} has alpha channel`);
  }
  Assert(
    readFileSync(join(here, "Style_Game.css"), "utf8").includes("orientation: landscape"),
    "landscape mobile CSS",
  );
  Assert(
    readFileSync(join(here, "index.html"), "utf8").includes("touchCluster"),
    "split touch pad for landscape",
  );
  Assert(readFileSync(join(here, "index.html"), "utf8").includes("Texture_FarmRuinWide"), "title uses farm plate");
  const level = BuildLevel();
  Assert(level.entities.some((e) => e.type === "dog"), "Walt present");
  Assert(level.entities.some((e) => e.type === "mg"), "MG nest present");
  Assert(level.entities.some((e) => e.type === "medic"), "medic present");

  const state = CreateState();
  BeginPlay(state);
  Assert(state.phase === "play", "play starts");

  // Pick can
  const can = state.level.entities.find((e) => e.id === "can");
  state.player.x = can.x;
  Tap(state, "act");
  Assert(state.player.held === "can", "picked tin can");

  // Stun sentry
  const sentry = state.level.entities.find((e) => e.id === "sentry1");
  state.player.x = sentry.x - 80;
  state.player.facing = 1;
  Tap(state, "throw");
  for (let i = 0; i < 90; i++) Step(state, 1 / 30);
  Assert(sentry.stun > 0 || state.stats.stuns >= 1, "can stuns patrol");

  // Dog fetch cutters
  BeginPlay(state);
  const dog = state.level.entities.find((e) => e.type === "dog");
  const cutters = state.level.entities.find((e) => e.id === "cutters");
  state.player.x = dog.x;
  Tap(state, "act");
  Assert(dog.state === "fetch", "dog sent to fetch");
  for (let i = 0; i < 240; i++) Step(state, 1 / 30);
  Assert(!cutters.behindGap, "cutters pulled from gap");

  // Dig under wire
  BeginPlay(state);
  DebugCutAll(state);
  // undo dig wire only test dig
  const dirt = state.level.entities.find((e) => e.type === "dirt");
  const w2 = state.level.entities.find((e) => e.type === "wire" && e.needs === "dig");
  dirt.dug = false;
  dirt.hp = 3;
  w2.cut = false;
  state.player.x = dirt.x;
  Tap(state, "act");
  Tap(state, "act");
  Tap(state, "act");
  Assert(dirt.dug && w2.cut, "three digs clear berm + wire");

  // Grenade kills MG
  BeginPlay(state);
  DebugCutAll(state);
  DebugHold(state, "grenade");
  const mg = state.level.entities.find((e) => e.type === "mg");
  state.player.x = mg.x - 100;
  state.player.facing = 1;
  Tap(state, "throw");
  for (let i = 0; i < 90; i++) Step(state, 1 / 30);
  Assert(!mg.alive, "grenade kills MG nest");

  // Rescue win path
  BeginPlay(state);
  DebugCutAll(state);
  DebugKillMg(state);
  const medic = state.level.entities.find((e) => e.type === "medic");
  const cart = state.level.entities.find((e) => e.type === "cart");
  state.player.x = medic.x;
  state.player.held = null;
  Tap(state, "act");
  Assert(state.player.carryingMedic, "carry medic");
  state.player.x = cart.x;
  Tap(state, "act");
  Assert(state.won && state.phase === "win", "load cart wins");

  if (failed) {
    console.error(`\n${failed} failed`);
    process.exit(1);
  }
  console.log("\nValiantFarm1914 smoke OK");
}

Main();
