#!/usr/bin/env node
/*
 * Headless smoke + progression sim for the SOPHIA game core — NO browser, NO Pixi.
 * Drives a full optimal-ish playthrough and asserts the core still:
 *   1) never throws across the run,
 *   2) reaches max intelligence level,
 *   3) lets every milestone be bought,
 *   4) fires the ending.
 *
 * Run with `npm run sim` (it compiles src/core via tsconfig.sim.json first).
 * Exit code 0 = PASS, 1 = FAIL — so it doubles as a cheap regression gate after
 * any economy / progression / request change, instead of opening a browser.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const build = path.join(root, ".sim-build");

// tsc does NOT copy JSON imports — drop the locale packs next to the compiled
// output, and mark the build dir CommonJS (the _dev package.json is type:module).
const srcLocales = path.join(root, "src/core/content/locales");
const dstLocales = path.join(build, "content/locales");
fs.mkdirSync(dstLocales, { recursive: true });
for (const f of fs.readdirSync(srcLocales)) {
  if (f.endsWith(".json")) fs.copyFileSync(path.join(srcLocales, f), path.join(dstLocales, f));
}
fs.writeFileSync(path.join(build, "package.json"), '{"type":"commonjs"}');

const { SophiaCore } = require(path.join(build, "GameCore.js"));
const { SKILLS, skillPrice } = require(path.join(build, "content/skills.js"));
const { NODE_DEFINITIONS } = require(path.join(build, "content/nodes.js"));
const { MAX_INTELLIGENCE_LEVEL } = require(path.join(build, "content/intelligence.js"));

const DT = 100;
const MAX_STEPS = 4_000_000;

const core = new SophiaCore();
core.startSession();

const milestoneIds = SKILLS.filter((s) => s.milestone).map((s) => s.id);
let ms = 0;
let ended = false;
let firstError = null;
let allBought = false;
core.events.on("ENDING_TRIGGERED", () => (ended = true));

const safe = (fn) => {
  try {
    fn();
  } catch (e) {
    if (!firstError) firstError = e;
  }
};

// Keep simulating until the ending has fired AND every milestone (incl. the
// post-ending conquest tier) has been bought — so the run validates the full
// content arc, not just "reached the ending first".
for (let i = 0; i < MAX_STEPS && !firstError && !(ended && allBought); i += 1) {
  safe(() => core.tick(DT));
  ms += DT;
  const st = core.getState();

  // Process every visible request (best-effort quality; T4 routes to a capable node).
  for (const r of st.requests) {
    let targetNodeId;
    if (r.tier === 4) {
      const n = st.nodes.find((x) => r.tier >= x.tierMin && r.tier <= x.tierMax && x.online);
      targetNodeId = n && n.id;
    }
    safe(() => core.dispatch({ type: "PROCESS_REQUEST", requestId: r.id, quality: r.tier === 3 ? 2 : 1.3, targetNodeId }));
  }

  if (i % 5 === 0) {
    // Buy the next affordable milestone, in shelf order.
    const s = core.getState();
    for (const id of milestoneIds) {
      const def = SKILLS.find((x) => x.id === id);
      if ((s.skills[id] || 0) >= def.maxLevel) continue;
      if (s.intelligence.level < def.requiredLevel) continue;
      if (Number(s.resources.compute) >= skillPrice(def, 0)) safe(() => core.dispatch({ type: "BUY_SKILL", skillId: id }));
      break;
    }
    // Buy other affordable skills, keeping a reserve so milestones stay reachable.
    for (const def of SKILLS) {
      if (def.milestone) continue;
      const owned = core.getState().skills[def.id] || 0;
      if (owned >= def.maxLevel) continue;
      if (core.getState().intelligence.level < def.requiredLevel) continue;
      if (Number(core.getState().resources.compute) >= skillPrice(def, owned) * 3) {
        safe(() => core.dispatch({ type: "BUY_SKILL", skillId: def.id }));
      }
    }
    // Grow the botnet once automation is unlocked.
    const a = core.getState();
    if (a.automationUnlocked) {
      for (const d of NODE_DEFINITIONS) {
        if (a.intelligence.level < d.requiredLevel) continue;
        if (a.nodes.filter((n) => n.defId === d.id).length >= 3) continue;
        const before = a.nodes.length;
        safe(() => core.dispatch({ type: "CAPTURE_NODE", definitionId: d.id }));
        if (core.getState().nodes.length > before) break;
      }
    }

    allBought = milestoneIds.every((id) => (core.getState().skills[id] || 0) >= 1);
  }
}

const e = core.getState();
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
check("no exception thrown", !firstError, firstError && (firstError.stack || String(firstError)));
check(`reached max level (Lv.${MAX_INTELLIGENCE_LEVEL})`, e.intelligence.level >= MAX_INTELLIGENCE_LEVEL, `Lv.${e.intelligence.level}`);
check(
  "every milestone buyable",
  milestoneIds.every((id) => (e.skills[id] || 0) >= 1),
  milestoneIds.filter((id) => !((e.skills[id] || 0) >= 1)).join(", ") || "—"
);
check("ending fired", ended, `endingTriggered=${e.flags && e.flags.endingTriggered}`);

const pass = checks.every((c) => c.ok);
console.log(
  `\nSOPHIA core sim — ${pass ? "PASS ✅" : "FAIL ❌"}  ` +
    `(${(ms / 1000).toFixed(0)}s sim · Lv.${e.intelligence.level} · nodes=${e.nodes.length} · purges=${e.statistics && e.statistics.purgeCount})`
);
for (const c of checks) console.log(`  ${c.ok ? "✓" : "✗"} ${c.name}${c.ok ? "" : `  → ${c.detail}`}`);
process.exit(pass ? 0 : 1);
