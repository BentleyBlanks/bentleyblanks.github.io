import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "./Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { ChapterBeatList } from "./Script_Core.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(projectDir, "..", "..");
const shotDir = path.join(projectDir, "_shots");
fs.mkdirSync(shotDir, { recursive: true });

// These are the ten production imagegen frames.  Keep the requested names
// separate from the runtime beat ids: c1_tally is the playable carry beat,
// while c1_draw is the active scribe/tally card used for the doorframe shot.
const targets = [
  { name: "01_DawnAftermath", id: "c1_open" },
  { name: "02_ShedForaging", id: "c1_forage" },
  { name: "03_SharedMeal", id: "c1_meal" },
  { name: "04_DoorframeTally", id: "c1_draw" },
  { name: "05_AnsweringSister", id: "c1_count" },
  { name: "06_ElmForaging", id: "c1_elm" },
  { name: "07_WellWater", id: "c1_well" },
  { name: "08_DuskPorridge", id: "c1_share" },
  { name: "09_CellarBurial", id: "c1_cellar" },
  { name: "10_FinalNightTalk", id: "c1_knows" },
];

const chapterBeats = ChapterBeatList(0);
for (const target of targets) {
  target.runtimeIndex = chapterBeats.findIndex((beat) => beat.id === target.id);
  if (target.runtimeIndex < 0) throw new Error(`Missing Chapter One QA beat: ${target.id}`);
}

const expectedRuntime = new Map([
  ["c1_open", 3], ["c1_forage", 4], ["c1_meal", 5], ["c1_draw", 7],
  ["c1_count", 8], ["c1_elm", 10], ["c1_well", 11], ["c1_share", 17],
  ["c1_cellar", 18], ["c1_knows", 19],
]);
for (const target of targets) assert.equal(target.runtimeIndex, expectedRuntime.get(target.id), target.id);

const outputPath = (target) => path.join(shotDir, `Texture_ChapterOneImagegen_${target.name}.png`);

/**
 * Put one beat into a deliberate, reproducible visual state.
 *
 * JumpToBeat intentionally does not run chain/scribe onStart callbacks.  A
 * single StepFrames call initializes those callbacks; the rest of the setup
 * then changes only the target beat's local state.  Cinematic beats use
 * SeekLine, which runs all preceding line callbacks in order.
 */
async function PrepareTarget(page, target) {
  return page.evaluate(({ id, runtimeIndex }) => {
    const tl = window.TunnelLight;
    const state = tl.state;
    const actor = (actorId) => state.actors.find((item) => item.id === actorId);
    const initializeInteractiveBeat = () => tl.StepFrames(1, {});

    tl.JumpToBeat(0, runtimeIndex);

    switch (id) {
      case "c1_open": {
        // The final line is the quiet dawn aftermath. Fire its callback once,
        // then remove the transient kneel pose so the frame reads as aftermath.
        tl.SeekLine(9, 0.7);
        tl.StepFrames(1, {});
        const sis = actor("sister");
        if (sis) {
          sis.visible = true;
          sis.level = "surface";
          sis.x = 30.75;
          sis.heading = -1;
          sis.pose = "sleep";
        }
        state.player.level = "surface";
        state.player.pose = null;
        state.player.poseT = undefined;
        break;
      }
      case "c1_forage":
        initializeInteractiveBeat();
        state.beat.stepIndex = 2; // heaveMat: the shed-foraging action
        state.player.level = "surface";
        state.player.x = 12.26;
        state.player.pose = null;
        break;
      case "c1_meal":
        initializeInteractiveBeat();
        state.beat.stepIndex = 1; // split: live red-sweet-potato card
        // The preceding goto starts a one-line approach micro-cine.  The
        // target is the next interactive card, so close that approach before
        // letting StepChain publish splitCard.
        state.microCine = null;
        state.caption = null;
        state.player.level = "surface";
        state.player.x = 34.6;
        state.player.pose = null;
        break;
      case "c1_draw":
        initializeInteractiveBeat();
        state.player.level = "surface";
        state.player.x = 34.05;
        state.player.heading = -1;
        state.player.pose = "shelter";
        break;
      case "c1_count":
        tl.SeekLine(0, 1.1);
        break;
      case "c1_elm": {
        initializeInteractiveBeat();
        state.beat.stepIndex = 4; // first throwHit at the elm tree
        state.player.level = "surface";
        state.player.x = 61.2;
        state.player.heading = -1;
        state.player.item = null;
        const sis = actor("sister");
        if (sis) {
          sis.visible = true;
          sis.level = "surface";
          sis.x = 56.3;
          sis.heading = -1;
          sis.pose = "mark";
          sis.track = null;
        }
        state.elmRain = { x: 56.3, t: 0 };
        break;
      }
      case "c1_well": {
        initializeInteractiveBeat();
        state.beat.stepIndex = 4; // winch
        state.flags.wellRopeFixed = true;
        state.player.level = "surface";
        state.player.x = 57.24;
        state.player.heading = 1;
        state.player.item = { id: "bucket", label: "空水桶", big: true };
        // Hook the bucket once so the live winch view, crank and IK are built.
        tl.StepFrames(1, { interact: true });
        break;
      }
      case "c1_share": {
        initializeInteractiveBeat();
        state.beat.dozeT = 0.5;
        state.player.level = "surface";
        state.player.x = 33.4;
        state.player.heading = -1;
        const sis = actor("sister");
        if (sis) {
          sis.visible = true;
          sis.level = "surface";
          sis.x = 32;
          sis.heading = 1;
          sis.pose = "sitStool";
          sis.track = null;
        }
        break;
      }
      case "c1_cellar": {
        initializeInteractiveBeat();
        // Hold the real burial fill/tamp action part-way so the frame shows
        // work in progress. Completion is deliberately not reached.
        state.beat.stepIndex = 8;
        state.beat.holdP = 0;
        state.beat.strokeMem = null;
        state.flags.pitDug = true;
        state.flags.clothesBuried = false;
        state.microCine = null;
        state.caption = null;
        state.player.level = "under";
        state.player.x = 27.1;
        state.player.heading = 1;
        state.player.item = null;
        state.player.carry = null;
        // Genuine chain progress: input drives StrokeWork and leaves the
        // tamping action unfinished for the still.
        tl.StepFrames(36, { interactHeld: true });
        state.player.pose = state.player.pose || "bow";
        state.player.poseT = undefined;
        state.player.poseU = state.beat.holdP / 2.2;
        return { finalTickDone: true, holdP: state.beat.holdP, pose: state.player.pose, stepIndex: state.beat.stepIndex };
      }
      case "c1_knows":
        tl.SeekLine(6, 0);
        break;
      default:
        throw new Error(`No Chapter One shot setup for ${id}`);
    }

    return {
      id: state.beat && state.beatIndex === runtimeIndex ? id : state.beatIndex,
      beatIndex: state.beatIndex,
      stepIndex: state.beat?.stepIndex,
      lineIndex: state.beat?.lineIndex,
      microCine: !!state.microCine,
    };
  }, { id: target.id, runtimeIndex: target.runtimeIndex });
}

function AssertShotState(snapshot, target) {
  assert.equal(snapshot.chapterIndex, 0, `${target.id}: chapter`);
  assert.equal(snapshot.beatIndex, target.runtimeIndex, `${target.id}: runtime beat`);
  const { state } = snapshot;
  switch (target.id) {
    case "c1_open":
      assert.equal(state.beat.lineIndex, 9, "c1_open line");
      assert.equal(state.sister.level, "surface", "c1_open sister level");
      assert.equal(state.sister.pose, "sleep", "c1_open sister pose");
      assert.equal(state.player.pose, null, "c1_open player pose cleared");
      break;
    case "c1_forage":
      assert.equal(state.beat.stepIndex, 2, "c1_forage action step");
      assert.ok(state.forage, "c1_forage forage rig");
      assert.ok(Math.abs(state.player.x - 12.26) < 0.2, "c1_forage player position");
      break;
    case "c1_meal":
      assert.equal(state.beat.stepIndex, 1, "c1_meal split step");
      assert.ok(state.splitCard, "c1_meal split card");
      assert.ok(Math.abs(state.player.x - 34.6) < 0.2, "c1_meal player position");
      break;
    case "c1_draw":
      assert.ok(state.scribeCard, "c1_draw scribe card");
      assert.equal(state.scribeCard.style, "sisterTally", "c1_draw card style");
      assert.ok(Math.abs(state.player.x - 34.05) < 0.2, "c1_draw player position");
      break;
    case "c1_count":
      assert.equal(state.beat.lineIndex, 0, "c1_count line");
      assert.equal(state.sister.pose, "mark", "c1_count sister mark pose");
      assert.ok(state.caption, "c1_count caption");
      break;
    case "c1_elm":
      assert.equal(state.beat.stepIndex, 4, "c1_elm throw step");
      assert.ok(state.elmRain, "c1_elm elm rain");
      assert.ok(Math.abs(state.sister.x - 56.3) < 1.2, "c1_elm sister position");
      break;
    case "c1_well":
      assert.equal(state.beat.stepIndex, 4, "c1_well winch step");
      assert.equal(state.flags.wellRopeFixed, true, "c1_well rope flag");
      assert.ok(state.winchView, "c1_well winch view");
      assert.equal(state.winchView.hooked, true, "c1_well bucket hooked");
      break;
    case "c1_share":
      assert.ok(state.doze, "c1_share doze state");
      assert.equal(state.sister.track?.name, "dozeNod", "c1_share dozeNod track");
      assert.ok(Math.abs(state.sister.x - 32) < 0.2, "c1_share sister position");
      break;
    case "c1_cellar":
      assert.equal(state.beat.stepIndex, 8, "c1_cellar burial fill step");
      assert.ok(state.beat.holdP > 0.4 && state.beat.holdP < 2.2, `c1_cellar fill in progress (${state.beat.holdP})`);
      assert.equal(state.player.level, "under", "c1_cellar underground player");
      assert.equal(state.player.item, null, "c1_cellar no item while tamping");
      assert.equal(state.flags.pitDug, true, "c1_cellar pit dug");
      assert.equal(state.flags.clothesBuried, false, "c1_cellar burial unfinished");
      assert.ok(["bow", "kneel", "layDown"].includes(state.player.pose), "c1_cellar working pose");
      break;
    case "c1_knows":
      assert.equal(state.beat.lineIndex, 6, "c1_knows line");
      assert.ok(Math.abs(state.sister.x - 28.6) < 1.1, "c1_knows sister framing");
      assert.ok(state.caption, "c1_knows caption");
      break;
    default:
      throw new Error(`No assertion for ${target.id}`);
  }
}

const server = await ServeRoot(repoRoot, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 240)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url)) return;
  errors.push(`CONSOLE ${message.text().slice(0, 240)}`);
});

try {
  for (const target of targets) {
    // Do not encode a beat/qa id in the URL.  This catches stale URL-derived
    // index math and makes every shot go through the public debug API.
    await page.goto(`http://127.0.0.1:${port}/TunnelLight1943/ChapterOneImagegen/?chapter=1`, {
      waitUntil: "load", timeout: 60000,
    });
    await page.waitForFunction(() => window.TunnelLight?.state, { timeout: 60000 });
    await page.evaluate(() => window.TunnelLight.Freeze(true));
    const prepared = await PrepareTarget(page, target);

    await page.evaluate((special) => {
      const tl = window.TunnelLight;
      if (!special?.finalTickDone) {
        tl.Freeze(false);
        tl.Tick(1, 1 / 30);
        tl.Freeze(true);
      }
      tl.Settle(20);
    }, prepared);
    await page.waitForTimeout(120);

    const snapshot = await page.evaluate(() => {
      const tl = window.TunnelLight;
      const state = tl.state;
      const sister = state.actors.find((item) => item.id === "sister");
      return {
        chapterIndex: state.chapterIndex,
        beatIndex: state.beatIndex,
        state: {
          beat: {
            stepIndex: state.beat?.stepIndex,
            lineIndex: state.beat?.lineIndex,
            holdP: state.beat?.holdP,
          },
          player: {
            x: state.player.x, level: state.player.level, pose: state.player.pose,
            carry: state.player.carry, item: state.player.item?.id || null,
          },
          sister: sister ? {
            x: sister.x, level: sister.level, pose: sister.pose,
            track: sister.track ? { name: sister.track.name } : null,
          } : null,
          caption: state.caption,
          microCine: !!state.microCine,
          camHint: state.camHint,
          forage: !!state.forage,
          splitCard: state.splitCard,
          scribeCard: state.scribeCard,
          elmRain: state.elmRain,
          doze: state.doze,
          winchView: state.winchView,
          flags: {
            wellRopeFixed: state.flags.wellRopeFixed,
            pitDug: state.flags.pitDug,
            clothesBuried: state.flags.clothesBuried,
          },
        },
      };
    });
    AssertShotState(snapshot, target);
    const file = outputPath(target);
    await page.screenshot({ path: file });
    console.log(JSON.stringify({
      requestedId: target.id,
      runtimeId: target.id,
      runtimeIndex: target.runtimeIndex,
      output: file,
      prepared,
      assertions: "passed",
    }));
  }
  assert.deepEqual(errors, [], `browser reported runtime errors: ${errors.join(" | ")}`);
  console.log(`ChapterOneImagegen shots written: ${targets.length}`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
